// Actual pipe -> real custody verifier -> existing IngressClient/server ->
// Python durable ACK. Same-SID isolated protocol, never physical role proof.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { fixture } from "./custody_test_fixture.mjs";
import { RUNTIME_FILES } from "../custody_authority.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const canonical = v => v && typeof v === "object" ? Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
const DIR = import.meta.dirname;

async function bindSender(f) {
  const approvals = resolve(f.root, "approvals");
  await mkdir(approvals);
  const tokenPath = resolve(f.root, "synthetic-ingress-material");
  const tokenBytes = Buffer.from(f.token + "\n");
  await writeFile(tokenPath, tokenBytes);
  const signingPath = resolve(f.root, "synthetic-unused-signing-location");
  await writeFile(signingPath, "synthetic-only");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const owner = "S-1-5-21-111-222-333-1001", sender = "S-1-5-21-111-222-333-1002";
  const runtime = [];
  for (const path of RUNTIME_FILES) runtime.push({ path, sha256: hash(await readFile(path)) });
  const policy = { action: "custody.deposit", epoch: 1, revoked: false, expires_at: Date.now() + 120000,
    approver_sid: owner, sender_sid: sender, issuer_key_id: `trust.${hash(spki.subarray(-32)).slice(0, 32)}`,
    public_key_spki: spki.toString("base64"), project_scopes: [f.request.binding.project_hint],
    route_sha256: f.request.binding.route_sha256, ingress_principal: f.request.principal,
    signing_key_path: signingPath, runtime_files: runtime };
  const policyPath = resolve(f.root, "custody-policy.json"), configPath = resolve(f.root, "custody-config.json");
  const policyBytes = JSON.stringify(policy);
  await writeFile(policyPath, policyBytes);
  const claims = { binding_sha256: hash(canonical(f.request.binding)), policy_sha256: hash(policyBytes),
    policy_epoch: 1, issuer_key_id: policy.issuer_key_id, issued_at: Date.now() - 1000, expires_at: Date.now() + 90000 };
  const approvalPath = resolve(approvals, `${claims.binding_sha256}.json`);
  await writeFile(approvalPath, JSON.stringify({ ...claims,
    signature: sign(null, Buffer.from(canonical(claims)), privateKey).toString("base64") }));
  const config = { execution_purpose: "custody.deposit", custody_authority: {
    policy_path: policyPath, policy_sha256: hash(policyBytes), approval_root: approvals }, adapters: { custody: {
    enabled: true, live_enabled: true, ingress_url: f.request.ingress_url, token_file: tokenPath, token_sha256: hash(tokenBytes) } } };
  const configBytes = JSON.stringify(config);
  await writeFile(configPath, configBytes);
  const runtimeBinding = { config_path: configPath, config_sha256: hash(configBytes), trust_owner_sid: owner,
    node_executable: { path: process.execPath, sha256: hash(await readFile(process.execPath)) },
    os_observer: { path: resolve(f.root, "synthetic-observer"), sha256: "a".repeat(64) } };
  const launcher = resolve(f.root, "synthetic-custody-launcher.mjs");
  // Only OS metadata is synthetic here. The exact approval signature, config,
  // runtime source hashes, token fingerprint and post-response authority are
  // enforced by the real loader, with real IngressClient network operations.
  await writeFile(launcher, `import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadCustodyAuthority} from ${JSON.stringify(pathToFileURL(resolve(DIR, "../custody_authority.mjs")).href)};
import {custodyOperation} from ${JSON.stringify(pathToFileURL(resolve(DIR, "../custody_operation.mjs")).href)};
const binding=${JSON.stringify(runtimeBinding)};
const observe=paths=>({sid:${JSON.stringify(sender)},groups:[],privileges:[],elevated:false,
 paths:paths.map(path=>({path,owner_sid:${JSON.stringify(owner)},reparse:false,allow:[{sid:${JSON.stringify(owner)},rights:2032127},
 ...(path===${JSON.stringify(signingPath)}?[]:[{sid:${JSON.stringify(sender)},rights:1179785}])]}))});
const runtime={config:${configBytes},installationRole:{name:'sender',sid:${JSON.stringify(sender)},purpose:'custody.deposit'},
 recheck(){if(createHash('sha256').update(readFileSync(binding.config_path)).digest('hex')!==binding.config_sha256)throw Error('TEST_CONFIG_CHANGED');}};
try { await custodyOperation(loadCustodyAuthority(binding,{observe}),runtime); }
catch { process.exitCode=2; }
`);
  await writeFile(resolve(f.root, "controller-fixture.json"), JSON.stringify({ ingress_url: f.request.ingress_url,
    sha256: f.request.binding.sha256, size: f.request.binding.size }));
  return { launcher, approvalPath, tokenPath, policyPath };
}

async function controller(f, binding, mode = "normal") {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP)$/i.test(key)));
  const process_ = spawn("uv", ["--no-config", "run", "--no-project", "python", "-I", "-B",
    resolve(DIR, "custody_controller_child.py"), f.root, process.execPath, binding.launcher, mode], { env, windowsHide: true });
  const stdout = [], stderr = [];
  process_.stdout.on("data", value => stdout.push(value));
  process_.stderr.on("data", value => stderr.push(value));
  const timer = setTimeout(() => process_.kill(), 40000);
  const code = await new Promise((yes, no) => { process_.once("error", no); process_.once("exit", yes); });
  clearTimeout(timer);
  assert.equal(code, 0, Buffer.concat(stderr).toString());
  const receipt = JSON.parse(Buffer.concat(stdout));
  assert.equal(receipt.test_kind, "ISOLATED_SAME_SID_PROTOCOL_TEST");
  assert.equal(receipt.sender_stderr_bytes, 0);
  return receipt;
}

function ack(f) {
  const [name] = readdirSync(resolve(f.state, "submissions"));
  const record = JSON.parse(readFileSync(resolve(f.state, "submissions", name)));
  writeFileSync(resolve(f.outbox, "state", "acks", "team_files", `${record.outbox_occurrence_id}.json`), JSON.stringify({
    source_key: record.outbox_occurrence_id, sha256: record.sha256, size: record.size }));
}

test("actual controller byte session uploads, then restarted controller performs status-only durable ACK", { skip: process.platform !== "win32" }, async t => {
  const f = await fixture(t), binding = await bindSender(f);
  let puts = 0;
  f.server.on("request", request => { if (request.method === "PUT") puts++; });
  const first = await controller(f, binding);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.sender_exit, 0);
  assert.equal(first.result.server_acknowledged, false);
  assert.equal(first.durable_rows[0][1], "pending_server_ack");
  assert.equal(puts, 2);
  ack(f);
  const second = await controller(f, binding);
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.result.server_acknowledged, true);
  assert.equal(second.result.accepted, false);
  assert.equal(second.result.review_state, "NOT_OBSERVED");
  assert.equal(second.durable_rows[0][1], "verified_server_ack");
  assert.equal(puts, 2);
  assert.equal((await readdir(resolve(f.state, "submissions"))).length, 1);
  t.diagnostic(JSON.stringify({ test_kind: "ISOLATED_SAME_SID_PROTOCOL_TEST", transport: "WINDOWS_NAMED_PIPE",
    different_sid_proof: "NOT_RUN", first_controller_pid: first.controller_pid, first_sender_pid: first.sender_pid,
    resumed_controller_pid: second.controller_pid, resumed_sender_pid: second.sender_pid,
    first_sender_exit: first.sender_exit, resumed_sender_exit: second.sender_exit,
    first_current_checks: first.current_checks, resumed_current_checks: second.current_checks,
    chunk_writes: puts, submissions: 1, request_sha256: f.request.binding.sha256, request_size: f.request.binding.size,
    first_durable_status: first.durable_rows[0][1], resumed_durable_status: second.durable_rows[0][1], accepted: false }));
});

test("source, approval, credential, ACK revocation and sender crash preserve custody uncertainty and restart identity", { skip: process.platform !== "win32" }, async t => {
  for (const mode of ["source", "approval", "credential", "ack_revoked", "sender_crash"]) {
    await t.test(mode, async t => {
      const f = await fixture(t), binding = await bindSender(f);
      let puts = 0, changed = false;
      f.server.on("request", request => { if (request.method === "PUT") puts++; });
      f.hooks.after = operation => {
          if (mode === "ack_revoked" && operation === "finalizeUpload") ack(f);
          const trigger = mode === "ack_revoked" ? operation === "submissionStatus"
            : mode === "sender_crash" ? operation === "appendChunk" : operation === "prepareUpload";
          if (!trigger || changed) return;
          changed = true;
          if (mode === "source") writeFileSync(resolve(f.root, "candidate.md"), Buffer.alloc(f.body.length, 84));
          if (mode === "approval") writeFileSync(binding.approvalPath, "{}");
          if (mode === "credential") writeFileSync(binding.tokenPath, `sfig_v1_${"b".repeat(43)}\n`);
          if (mode === "ack_revoked") writeFileSync(resolve(f.root, "controller-revoked"), "1");
          if (mode === "sender_crash") process.kill(JSON.parse(readFileSync(resolve(f.root, "sender-pid.json"))).pid);
      };
      const first = await controller(f, binding, mode);
      assert.equal(changed, true, JSON.stringify(first));
      assert.equal(first.ok, false, JSON.stringify(first));
      assert.ok(!first.durable_rows?.some(row => row[1] === "verified_server_ack"));
      if (["source", "approval", "credential"].includes(mode)) assert.equal(puts, 0);
      if (mode === "ack_revoked") {
        await unlink(resolve(f.root, "controller-revoked"));
        const retry = await controller(f, binding);
        assert.equal(retry.ok, true, JSON.stringify(retry));
        assert.equal(retry.result.server_acknowledged, true);
        assert.equal((await readdir(resolve(f.state, "submissions"))).length, 1);
      }
      if (mode === "sender_crash") {
        const retry = await controller(f, binding);
        assert.equal(retry.ok, true, JSON.stringify(retry));
        assert.equal((await readdir(resolve(f.state, "submissions"))).length, 1);
      }
    });
  }
});
