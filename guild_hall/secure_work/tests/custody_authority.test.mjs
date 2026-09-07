import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { loadCustodyAuthority, observeWindowsSecurity, RUNTIME_FILES } from "../custody_authority.mjs";
import { runCustody } from "../custody_bridge.mjs";

const hash = (v) => createHash("sha256").update(v).digest("hex");
const canonical = (v) => v && typeof v === "object"
  ? Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
  : JSON.stringify(v);
const OWNER = "S-1-5-21-111-222-333-1001";
const SENDER = "S-1-5-21-111-222-333-1002";
const NODE_HASH = hash(await readFile(process.execPath));

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "secure-work-authority-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const approvals = resolve(root, "approvals");
  await mkdir(approvals);
  const configPath = resolve(root, "config.json");
  const policyPath = resolve(root, "policy.json");
  const signingPath = resolve(root, "synthetic-signing-material");
  const tokenPath = resolve(root, "synthetic-ingress-material");
  await writeFile(signingPath, "synthetic-unused-signing-file");
  await writeFile(tokenPath, `sfig_v1_${"a".repeat(43)}\n`);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const principal = { account_id: "synthetic.account", device_id: "synthetic.device", agent_id: "synthetic.agent" };
  const runtime = [];
  for (const path of RUNTIME_FILES) runtime.push({ path, sha256: hash(await readFile(path)) });
  const policy = { action: "custody.deposit", epoch: 1, revoked: false, expires_at: Date.now() + 120000,
    approver_sid: OWNER, sender_sid: SENDER, issuer_key_id: `trust.${hash(spki.subarray(-32)).slice(0, 32)}`,
    public_key_spki: spki.toString("base64"), project_scopes: ["synthetic.project"], route_sha256: hash("http://127.0.0.1:1"),
    ingress_principal: principal, signing_key_path: signingPath, runtime_files: runtime };
  const policyBytes = JSON.stringify(policy);
  await writeFile(policyPath, policyBytes);
  const config = { custody_authority: { policy_path: policyPath, policy_sha256: hash(policyBytes),
    approval_root: approvals },
    adapters: { custody: { enabled: true, live_enabled: true, token_file: tokenPath } } };
  const configBytes = JSON.stringify(config);
  await writeFile(configPath, configBytes);
  const runtimeBinding = { config_path: configPath, config_sha256: hash(configBytes), trust_owner_sid: OWNER,
    os_observer: { path: resolve(root, "synthetic-observer"), sha256: "a".repeat(64) },
    node_executable: { path: process.execPath, sha256: NODE_HASH } };
  const binding = { project_hint: "synthetic.project", occurrence_id: "synthetic.occurrence",
    idempotency_key: "synthetic:idempotency", input_revision: "r1", sha256: hash("fixture"), size: 7,
    route_sha256: policy.route_sha256 };
  const claims = { binding_sha256: hash(canonical(binding)), policy_sha256: hash(policyBytes), policy_epoch: 1,
    issuer_key_id: policy.issuer_key_id, issued_at: Date.now() - 1000, expires_at: Date.now() + 60000 };
  const approvalPath = resolve(approvals, `${claims.binding_sha256}.json`);
  await writeFile(approvalPath, JSON.stringify({ ...claims, signature: sign(null, Buffer.from(canonical(claims)), privateKey).toString("base64") }));
  const evidence = { sid: SENDER, groups: [], privileges: [], elevated: false };
  const observe = (paths) => ({ ...evidence, paths: paths.map(path => ({ path, owner_sid: OWNER, reparse: false,
    allow: [{ sid: OWNER, rights: 2032127 }, ...(path === signingPath ? [] : [{ sid: SENDER, rights: 1179785 }])] })) });
  return { root, runtimeBinding, configPath, policyPath, approvalPath, binding, principal, evidence, observe };
}

test("independently pinned policy and current OS evidence verify exact signed custody approval", async t => {
  const f = await fixture(t);
  const authority = loadCustodyAuthority(f.runtimeBinding, { observe: f.observe });
  const proof = authority.authorize(f.binding);
  assert.deepEqual(proof.principal, f.principal);
  assert.equal(Object.hasOwn(proof, "token_file"), false);
  assert.equal(authority.authorizeRequest({ binding: f.binding, principal: f.principal }), true);
  assert.throws(() => authority.authorize({ ...f.binding, input_revision: "r2" }));
  const approval = JSON.parse(await readFile(f.approvalPath));
  approval.policy_epoch = 2;
  await writeFile(f.approvalPath, JSON.stringify(approval));
  assert.throws(() => authority.authorize(f.binding));
});

test("the real bridge invokes the pinned verifier again after prepare and denies changed trust before bytes", async t => {
  const f = await fixture(t);
  const authority = loadCustodyAuthority(f.runtimeBinding, { observe: f.observe });
  const proof = authority.authorize(f.binding);
  const candidate = resolve(f.root, "candidate.md");
  await writeFile(candidate, "fixture");
  let writes = 0;
  let prepared = false;
  const fetchImpl = async (url, options) => {
    if (options.method === "PUT") writes++;
    const rpc = JSON.parse(options.body);
    if (!Object.hasOwn(rpc, "id")) return new Response("", { status: 202 });
    let result;
    if (rpc.method === "initialize") result = { protocolVersion: rpc.params.protocolVersion,
      capabilities: { tools: {} }, serverInfo: { name: "synthetic", version: "1" } };
    else if (rpc.params.name === "ingress_whoami") result = { content: [], structuredContent: {
      ...f.principal, project_scopes: [f.binding.project_hint], capabilities: ["upload:team_files", "receipt:read"],
      expires_at: new Date(Date.now() + 120000).toISOString(),
    } };
    else if (rpc.params.name === "ingress_prepare_file_upload") {
      prepared = true;
      await writeFile(f.policyPath, "{}");
      result = { content: [], structuredContent: { received_size: 0, chunk_bytes: 65536,
        upload_url: `http://127.0.0.1:1/ingress/uploads/sfigup_${"a".repeat(32)}` } };
    } else assert.fail("unexpected synthetic MCP request");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  await assert.rejects(runCustody({ action: "upload", binding: f.binding, candidate_path: candidate,
    principal: proof.principal, authorization_expires_at: proof.expires_at, ingress_url: "http://127.0.0.1:1" },
    { token: authority.token(f.binding), authorize: value => authority.authorizeRequest(value), fetchImpl }));
  assert.equal(prepared, true);
  assert.equal(writes, 0);
});

test("current principal, writable trust and changed policy are rechecked after factory creation", async t => {
  const f = await fixture(t);
  const authority = loadCustodyAuthority(f.runtimeBinding, { observe: f.observe });
  assert.ok(authority.authorize(f.binding));
  f.evidence.sid = OWNER;
  assert.throws(() => authority.authorize(f.binding));
  f.evidence.sid = SENDER;
  f.evidence.elevated = true;
  assert.throws(() => authority.authorize(f.binding));
  f.evidence.elevated = false;
  f.evidence.privileges = ["SeBackupPrivilege"];
  assert.throws(() => authority.authorize(f.binding));
  f.evidence.privileges = [];
  const writable = paths => { const r = f.observe(paths); r.paths[0].allow.push({ sid: SENDER, rights: 2 }); return r; };
  assert.throws(() => loadCustodyAuthority(f.runtimeBinding, { observe: writable }).authorize(f.binding));
  await writeFile(f.policyPath, "{}");
  assert.throws(() => authority.authorize(f.binding));
});

test("Windows observer reads current token and a fresh temporary asset without modifying ACL", { skip: process.platform !== "win32" }, async t => {
  const root = await mkdtemp(resolve(tmpdir(), "secure-work-os-probe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = resolve(root, "synthetic.txt");
  await writeFile(file, "synthetic");
  const before = await readFile(file);
  const executable = resolve(process.env.SYSTEMROOT, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const observation = observeWindowsSecurity([file], { path: executable, sha256: hash(await readFile(executable)) });
  assert.match(observation.sid, /^S-1-/);
  assert.equal(observation.paths.length, 1);
  assert.equal(typeof observation.paths[0].reparse, "boolean");
  assert.ok(Array.isArray(observation.privileges));
  assert.deepEqual(await readFile(file), before);
});
