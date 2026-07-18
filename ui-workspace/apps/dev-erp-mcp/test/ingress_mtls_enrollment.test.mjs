import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import test from "node:test";

import { loadIngressMtlsClientBinding } from "../src/ingress_mtls_client.mjs";
import {
  finalizeIngressMtlsEnrollment,
  prepareIngressMtlsEnrollment,
  signIngressMtlsEnrollment,
} from "../src/ingress_mtls_enrollment.mjs";

function opensslPath() {
  const bundled = process.platform === "win32" && process.env.ProgramFiles
    ? resolve(process.env.ProgramFiles, "Git", "usr", "bin", "openssl.exe")
    : null;
  const executableName = process.platform === "win32" ? "openssl.exe" : "openssl";
  const pathCandidates = String(process.env.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => resolve(entry, executableName));
  const candidates = [bundled, ...pathCandidates].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      execFileSync(candidate, ["version"], { stdio: "ignore" });
      return realpathSync(candidate);
    } catch {}
  }
  return null;
}

function run(openssl, args) {
  execFileSync(openssl, args, { stdio: "ignore" });
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeCa(root, openssl) {
  const key = resolve(root, "ca.key.pem");
  const cert = resolve(root, "ca.crt.pem");
  run(openssl, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
    "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=Soulforge Enrollment Test CA",
    "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
  ]);
  return { key, cert };
}

test("target-local CSR is signed on HPP and finalized without moving or printing the private key", async (t) => {
  const openssl = opensslPath();
  if (!openssl || !resolve(openssl).includes("\\") && process.platform === "win32") {
    return t.skip("absolute OpenSSL executable unavailable");
  }
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-mtls-enrollment-"));
  const target = resolve(root, "target");
  const hpp = resolve(root, "hpp");
  await mkdir(target);
  await mkdir(hpp);
  try {
    const ca = await makeCa(hpp, openssl);
    const prepared = await prepareIngressMtlsEnrollment({
      outputDir: target,
      opensslPath: openssl,
      accountId: "person_a",
      deviceId: "workpc_a",
      agentId: "codex_a",
      now: Date.parse("2026-07-17T00:00:00.000Z"),
    });
    assert.equal(prepared.status, "target_local_csr_ready");
    assert.equal(prepared.private_key_value_exposed, false);
    assert.equal(prepared.private_key_transfer_allowed, false);
    assert.equal(JSON.stringify(prepared).includes("BEGIN PRIVATE KEY"), false);
    const request = JSON.parse(await readFile(prepared.request_path, "utf8"));
    assert.equal(request.private_key_transfer_allowed, false);
    assert.equal(request.csr_sha256, hash(await readFile(prepared.csr_path)));

    const signedPath = resolve(hpp, "workpc_a.crt.pem");
    const signed = await signIngressMtlsEnrollment({
      requestPath: prepared.request_path,
      csrPath: prepared.csr_path,
      caCertPath: ca.cert,
      caKeyPath: ca.key,
      certificateOutputPath: signedPath,
      opensslPath: openssl,
      days: 1,
    });
    assert.equal(signed.status, "hpp_signed_client_certificate_ready");
    assert.equal(signed.private_key_read, false);
    const x509 = new X509Certificate(await readFile(signedPath));
    assert.equal(x509.ca, false);
    assert.ok(x509.keyUsage.includes("1.3.6.1.5.5.7.3.2"));

    const pin = "a".repeat(64);
    const bindingPath = resolve(target, "ingress-mtls-client.json");
    const finalized = await finalizeIngressMtlsEnrollment({
      requestPath: prepared.request_path,
      clientKeyPath: resolve(target, "ingress-client.key.pem"),
      clientCertPath: signedPath,
      caCertPath: ca.cert,
      bindingOutputPath: bindingPath,
      baseUrl: "https://172.16.10.196:4313",
      serverCertificateSha256: pin,
      opensslPath: openssl,
    });
    assert.equal(finalized.status, "target_local_mtls_binding_ready");
    assert.equal(finalized.private_key_value_exposed, false);
    assert.equal(finalized.bearer_issued, false);
    const binding = await loadIngressMtlsClientBinding(bindingPath);
    assert.equal(binding.expectedAccountId, "person_a");
    assert.equal(binding.expectedDeviceId, "workpc_a");
    assert.equal(binding.expectedAgentId, "codex_a");
    assert.equal(binding.serverCertificateSha256, pin);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("enrollment rejects CSR tampering, key mismatch, unsafe URL, and output overwrite", async (t) => {
  const openssl = opensslPath();
  if (!openssl || !resolve(openssl).includes("\\") && process.platform === "win32") {
    return t.skip("absolute OpenSSL executable unavailable");
  }
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-mtls-enrollment-guards-"));
  const first = resolve(root, "first");
  const second = resolve(root, "second");
  const hpp = resolve(root, "hpp");
  await Promise.all([mkdir(first), mkdir(second), mkdir(hpp)]);
  try {
    const ca = await makeCa(hpp, openssl);
    const one = await prepareIngressMtlsEnrollment({
      outputDir: first, opensslPath: openssl, accountId: "person_a", deviceId: "workpc_a", agentId: "codex_a",
    });
    const two = await prepareIngressMtlsEnrollment({
      outputDir: second, opensslPath: openssl, accountId: "person_b", deviceId: "workpc_b", agentId: "codex_b",
    });
    await assert.rejects(prepareIngressMtlsEnrollment({
      outputDir: first, opensslPath: openssl, accountId: "person_a", deviceId: "workpc_a", agentId: "codex_a",
    }), /enrollment_output_exists/);

    const originalCsr = await readFile(one.csr_path);
    await writeFile(one.csr_path, Buffer.concat([originalCsr, Buffer.from("\n")]), "utf8");
    await assert.rejects(signIngressMtlsEnrollment({
      requestPath: one.request_path, csrPath: one.csr_path, caCertPath: ca.cert, caKeyPath: ca.key,
      certificateOutputPath: resolve(hpp, "tampered.crt.pem"), opensslPath: openssl, days: 1,
    }), /mtls_client_csr_hash_mismatch/);
    await writeFile(one.csr_path, originalCsr);

    const signedPath = resolve(hpp, "workpc_a.crt.pem");
    await signIngressMtlsEnrollment({
      requestPath: one.request_path, csrPath: one.csr_path, caCertPath: ca.cert, caKeyPath: ca.key,
      certificateOutputPath: signedPath, opensslPath: openssl, days: 1,
    });
    await assert.rejects(finalizeIngressMtlsEnrollment({
      requestPath: one.request_path,
      clientKeyPath: resolve(first, "ingress-client.key.pem"),
      clientCertPath: signedPath,
      caCertPath: ca.cert,
      bindingOutputPath: resolve(first, "bad-url.json"),
      baseUrl: "https://203.0.113.10:4313",
      serverCertificateSha256: "b".repeat(64),
      opensslPath: openssl,
    }), /invalid_mtls_client_base_url/);
    await assert.rejects(finalizeIngressMtlsEnrollment({
      requestPath: two.request_path,
      clientKeyPath: resolve(second, "ingress-client.key.pem"),
      clientCertPath: signedPath,
      caCertPath: ca.cert,
      bindingOutputPath: resolve(second, "mismatch.json"),
      baseUrl: "https://172.16.10.196:4313",
      serverCertificateSha256: "b".repeat(64),
      opensslPath: openssl,
    }), /mtls_client_key_certificate_mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("enrollment CLI stdout contains metadata only", async (t) => {
  const openssl = opensslPath();
  if (!openssl || !resolve(openssl).includes("\\") && process.platform === "win32") {
    return t.skip("absolute OpenSSL executable unavailable");
  }
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-mtls-enrollment-cli-"));
  try {
    const result = spawnSync(process.execPath, [
      resolve(import.meta.dirname, "..", "ingress_mtls_enrollment_cli.mjs"), "prepare",
      "--output-dir", root, "--openssl", openssl,
      "--account", "person_cli", "--device", "workpc_cli", "--agent", "codex_cli",
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("BEGIN PRIVATE KEY"), false);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.private_key_value_exposed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
