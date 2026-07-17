import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod, copyFile, lstat, readFile, realpath, rm, writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

import { INGRESS_MTLS_CLIENT_SCHEMA } from "./ingress_mtls_client.mjs";

export const INGRESS_MTLS_ENROLLMENT_SCHEMA = "soulforge.ingress.mtls_enrollment_request.v1";
const execFileAsync = promisify(execFile);
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const REQUEST_FIELDS = [
  "schema_version", "audience", "account_id", "device_id", "agent_id",
  "csr_filename", "private_key_filename", "csr_sha256", "created_at",
  "requested_extended_key_usage", "private_key_transfer_allowed",
];

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function comparable(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function absolute(value, code = "enrollment_absolute_path_required") {
  if (typeof value !== "string" || !isAbsolute(value)) fail(code);
  return resolve(value);
}

async function normalFile(path, code) {
  let info;
  try { info = await lstat(path); } catch { fail(code); }
  if (!info.isFile() || info.isSymbolicLink()
    || comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
}

async function safeDirectory(path) {
  const absolutePath = absolute(path);
  let info;
  try { info = await lstat(absolutePath); } catch { fail("enrollment_output_directory_missing"); }
  if (!info.isDirectory() || info.isSymbolicLink()
    || comparable(await realpath(absolutePath)) !== comparable(absolutePath)) {
    fail("enrollment_output_directory_unsafe");
  }
  return absolutePath;
}

function safeId(value) {
  const text = String(value ?? "");
  if (!ID.test(text)) fail("invalid_enrollment_identity");
  return text;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactFields(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid_mtls_enrollment_request");
  const actual = Object.keys(raw).sort();
  const expected = [...REQUEST_FIELDS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("invalid_mtls_enrollment_request");
  }
}

async function readRequest(path) {
  const requestPath = absolute(path);
  await normalFile(requestPath, "mtls_enrollment_request_unsafe");
  let raw;
  try { raw = JSON.parse(await readFile(requestPath, "utf8")); } catch { fail("invalid_mtls_enrollment_request"); }
  exactFields(raw);
  if (raw.schema_version !== INGRESS_MTLS_ENROLLMENT_SCHEMA || raw.audience !== "hpp_ingress_mcp"
    || !ID.test(String(raw.account_id || "")) || !ID.test(String(raw.device_id || ""))
    || !ID.test(String(raw.agent_id || "")) || raw.csr_filename !== "ingress-client.csr.pem"
    || raw.private_key_filename !== "ingress-client.key.pem" || !HASH.test(String(raw.csr_sha256 || ""))
    || !Number.isFinite(Date.parse(raw.created_at)) || raw.requested_extended_key_usage !== "clientAuth"
    || raw.private_key_transfer_allowed !== false) fail("invalid_mtls_enrollment_request");
  return { path: requestPath, raw };
}

async function runOpenSsl(opensslPath, args, code) {
  const executable = absolute(opensslPath, "openssl_absolute_path_required");
  await normalFile(executable, "openssl_executable_unsafe");
  try {
    return await execFileAsync(executable, args, {
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      encoding: "buffer",
    });
  } catch {
    fail(code);
  }
}

async function exclusiveJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
}

async function exclusivePublicCopy(source, destination) {
  await normalFile(source, "enrollment_public_material_unsafe");
  try { await copyFile(source, destination, fsConstants.COPYFILE_EXCL); }
  catch (error) {
    if (error?.code === "EEXIST") fail("enrollment_output_exists", 409);
    throw error;
  }
}

function certificateRef(certificate) {
  return `sha256:${sha256(certificate.raw).slice(0, 12)}`;
}

function officeLanBaseUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { fail("invalid_mtls_client_base_url"); }
  const parts = url.hostname.split(".").map(Number);
  const privateIpv4 = parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168));
  if (url.protocol !== "https:" || !privateIpv4 || url.username || url.password || url.search || url.hash
    || !["", "/"].includes(url.pathname)) fail("invalid_mtls_client_base_url");
  return url;
}

export async function prepareIngressMtlsEnrollment({
  outputDir, opensslPath, accountId, deviceId, agentId, now = Date.now(),
} = {}) {
  const root = await safeDirectory(outputDir);
  const account = safeId(accountId);
  const device = safeId(deviceId);
  const agent = safeId(agentId);
  const keyPath = resolve(root, "ingress-client.key.pem");
  const csrPath = resolve(root, "ingress-client.csr.pem");
  const requestPath = resolve(root, "ingress-enrollment-request.json");
  const created = [];
  try {
    for (const path of [keyPath, csrPath, requestPath]) {
      try { await lstat(path); fail("enrollment_output_exists", 409); }
      catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
    await runOpenSsl(opensslPath, [
      "req", "-new", "-newkey", "rsa:3072", "-nodes", "-sha256",
      "-keyout", keyPath, "-out", csrPath, "-subj", `/CN=${device}`,
    ], "mtls_enrollment_key_generation_failed");
    created.push(keyPath, csrPath);
    await chmod(keyPath, 0o600);
    await chmod(csrPath, 0o600);
    await normalFile(keyPath, "mtls_client_private_key_unsafe");
    await normalFile(csrPath, "mtls_client_csr_unsafe");
    await runOpenSsl(opensslPath, ["req", "-in", csrPath, "-noout", "-verify"], "mtls_client_csr_invalid");
    const request = {
      schema_version: INGRESS_MTLS_ENROLLMENT_SCHEMA,
      audience: "hpp_ingress_mcp",
      account_id: account,
      device_id: device,
      agent_id: agent,
      csr_filename: "ingress-client.csr.pem",
      private_key_filename: "ingress-client.key.pem",
      csr_sha256: sha256(await readFile(csrPath)),
      created_at: new Date(now).toISOString(),
      requested_extended_key_usage: "clientAuth",
      private_key_transfer_allowed: false,
    };
    await exclusiveJson(requestPath, request);
    created.push(requestPath);
    return {
      status: "target_local_csr_ready",
      request_path: requestPath,
      csr_path: csrPath,
      private_key_created: true,
      private_key_value_exposed: false,
      private_key_transfer_allowed: false,
    };
  } catch (error) {
    for (const path of created.reverse()) await rm(path, { force: true });
    throw error;
  }
}

export async function signIngressMtlsEnrollment({
  requestPath, csrPath, caCertPath, caKeyPath, certificateOutputPath,
  opensslPath, days = 30, now = Date.now(),
} = {}) {
  const request = await readRequest(requestPath);
  const csr = absolute(csrPath);
  const caCert = absolute(caCertPath);
  const caKey = absolute(caKeyPath);
  const output = absolute(certificateOutputPath);
  await normalFile(csr, "mtls_client_csr_unsafe");
  await normalFile(caCert, "mtls_ca_certificate_unsafe");
  await normalFile(caKey, "mtls_ca_private_key_unsafe");
  if (sha256(await readFile(csr)) !== request.raw.csr_sha256) fail("mtls_client_csr_hash_mismatch");
  if (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 90) fail("mtls_client_certificate_days_invalid");
  let ca;
  try { ca = new X509Certificate(await readFile(caCert)); } catch { fail("mtls_ca_certificate_invalid"); }
  if (!ca.ca || Date.parse(ca.validTo) <= now) fail("mtls_ca_certificate_invalid");
  try { await lstat(output); fail("enrollment_output_exists", 409); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  await safeDirectory(dirname(output));
  await runOpenSsl(opensslPath, ["req", "-in", csr, "-noout", "-verify"], "mtls_client_csr_invalid");
  const temporary = `${output}.partial-${randomBytes(12).toString("hex")}`;
  const extension = `${output}.ext-${randomBytes(12).toString("hex")}`;
  try {
    await writeFile(extension, [
      "basicConstraints=critical,CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=clientAuth",
      "\n",
    ].join("\n"), { encoding: "utf8", flag: "wx", mode: 0o600 });
    await runOpenSsl(opensslPath, [
      "x509", "-req", "-in", csr, "-CA", caCert, "-CAkey", caKey,
      "-set_serial", `0x${randomBytes(16).toString("hex")}`, "-days", String(Number(days)),
      "-sha256", "-extfile", extension, "-out", temporary,
    ], "mtls_client_certificate_signing_failed");
    await normalFile(temporary, "mtls_client_certificate_invalid");
    const certificate = new X509Certificate(await readFile(temporary));
    if (certificate.ca || !certificate.keyUsage?.includes("1.3.6.1.5.5.7.3.2")
      || Date.parse(certificate.validTo) <= now || !certificate.verify(ca.publicKey)) {
      fail("mtls_client_certificate_invalid");
    }
    try { await copyFile(temporary, output, fsConstants.COPYFILE_EXCL); }
    catch (error) {
      if (error?.code === "EEXIST") fail("enrollment_output_exists", 409);
      throw error;
    }
    return {
      status: "hpp_signed_client_certificate_ready",
      certificate_path: output,
      certificate_ref: certificateRef(certificate),
      account_id: request.raw.account_id,
      device_id: request.raw.device_id,
      agent_id: request.raw.agent_id,
      valid_from: certificate.validFrom,
      valid_to: certificate.validTo,
      private_key_read: false,
    };
  } finally {
    await rm(temporary, { force: true });
    await rm(extension, { force: true });
  }
}

export async function finalizeIngressMtlsEnrollment({
  requestPath, clientKeyPath, clientCertPath, caCertPath, bindingOutputPath,
  baseUrl, serverCertificateSha256, opensslPath, now = Date.now(),
} = {}) {
  const request = await readRequest(requestPath);
  const root = await safeDirectory(dirname(request.path));
  const key = absolute(clientKeyPath);
  if (comparable(key) !== comparable(resolve(root, request.raw.private_key_filename))) {
    fail("mtls_client_private_key_not_target_local");
  }
  await normalFile(key, "mtls_client_private_key_unsafe");
  const csr = resolve(root, request.raw.csr_filename);
  await normalFile(csr, "mtls_client_csr_unsafe");
  if (sha256(await readFile(csr)) !== request.raw.csr_sha256) fail("mtls_client_csr_hash_mismatch");
  const sourceCert = absolute(clientCertPath);
  const sourceCa = absolute(caCertPath);
  await normalFile(sourceCert, "mtls_client_certificate_unsafe");
  await normalFile(sourceCa, "mtls_ca_certificate_unsafe");
  let certificate;
  let ca;
  try {
    certificate = new X509Certificate(await readFile(sourceCert));
    ca = new X509Certificate(await readFile(sourceCa));
  } catch { fail("mtls_client_certificate_invalid"); }
  if (certificate.ca || !certificate.keyUsage?.includes("1.3.6.1.5.5.7.3.2")
    || Date.parse(certificate.validTo) <= now || !ca.ca || !certificate.verify(ca.publicKey)) {
    fail("mtls_client_certificate_invalid");
  }
  const [{ stdout: certPublic }, { stdout: keyPublic }, { stdout: csrPublic }] = await Promise.all([
    runOpenSsl(opensslPath, ["x509", "-in", sourceCert, "-pubkey", "-noout"], "mtls_client_certificate_invalid"),
    runOpenSsl(opensslPath, ["pkey", "-in", key, "-pubout"], "mtls_client_private_key_invalid"),
    runOpenSsl(opensslPath, ["req", "-in", csr, "-pubkey", "-noout"], "mtls_client_csr_invalid"),
  ]);
  if (sha256(certPublic) !== sha256(keyPublic) || sha256(certPublic) !== sha256(csrPublic)) {
    fail("mtls_client_key_certificate_mismatch");
  }
  if (!HASH.test(String(serverCertificateSha256 || ""))) fail("invalid_mtls_server_certificate_pin");
  const url = officeLanBaseUrl(baseUrl);
  const bindingPath = absolute(bindingOutputPath);
  if (comparable(dirname(bindingPath)) !== comparable(root)) fail("mtls_client_binding_not_target_local");
  const localCert = resolve(root, "ingress-client.crt.pem");
  const localCa = resolve(root, "ingress-ca.crt.pem");
  const created = [];
  try {
    await exclusivePublicCopy(sourceCert, localCert);
    created.push(localCert);
    await exclusivePublicCopy(sourceCa, localCa);
    created.push(localCa);
    const binding = {
      schema_version: INGRESS_MTLS_CLIENT_SCHEMA,
      audience: "hpp_ingress_mcp",
      base_url: url.href,
      ca_cert_path: localCa,
      client_cert_path: localCert,
      client_key_path: key,
      server_certificate_sha256: serverCertificateSha256,
      expected_account_id: request.raw.account_id,
      expected_device_id: request.raw.device_id,
      expected_agent_id: request.raw.agent_id,
    };
    await exclusiveJson(bindingPath, binding);
    created.push(bindingPath);
    return {
      status: "target_local_mtls_binding_ready",
      binding_path: bindingPath,
      certificate_ref: certificateRef(certificate),
      expected_account_id: request.raw.account_id,
      expected_device_id: request.raw.device_id,
      expected_agent_id: request.raw.agent_id,
      private_key_value_exposed: false,
      bearer_issued: false,
      live_probe_performed: false,
    };
  } catch (error) {
    for (const path of created.reverse()) await rm(path, { force: true });
    throw error;
  }
}
