import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadExecutionAuthority } from "../execution_authority.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const OWNER = "S-1-5-21-111-222-333-1001";
const sid = n => `S-1-5-21-111-222-333-${n}`;
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "secure-role-policy-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const policyPath = path.join(root, "policy.json"), keyPath = path.join(root, "synthetic-public-material");
  const signingPath = path.join(root, "synthetic-signing-location");
  // No private key is created or read. The synthetic observer supplies metadata
  // for an otherwise absent signing location to test only authority logic.
  writeFileSync(keyPath, "synthetic public verification material");
  let clock = 1000, intact = true;
  const policy = { epoch: 1, expires_at: 9000, revoked: false, issuer_key_id: "trust.synthetic",
    public_key_sha256: hash("synthetic public verification material"),
    context: { project_ref: "project.synthetic", assignment_ref: "assignment.synthetic", assignment_epoch: 7,
      task_ref: "task.synthetic", route_sha256: "a".repeat(64), audience: "scripted.subprocess" },
    roles: {
      controller: { sid: sid(1002), principal_ref: "principal.controller", purpose: "SOURCE", capabilities: ["jobs.submit", "jobs.advance", "jobs.get"] },
      sender: { sid: sid(1003), principal_ref: "principal.sender", purpose: "G3_PROVIDER", capabilities: ["model.dispatch"] },
      worker: { sid: sid(1004), principal_ref: "principal.worker", purpose: "G3_PROVIDER", capabilities: [] },
      reviewer: { sid: sid(1005), principal_ref: "principal.reviewer", purpose: "KEY_SERVICE", capabilities: ["release.issue", "release.review"] },
    }, worker_registration: { task_path: "\\SyntheticWorker", xml_sha256: "b".repeat(64) } };
  const evidence = { sid: policy.roles.controller.sid, groups: [], privileges: [], elevated: false };
  const config = { execution_authority: { policy_path: policyPath, policy_sha256: "" },
    permit_trust_pubkey_path: keyPath, permit_trust_signing_key_path: signingPath };
  const runtime = { config, launcherPath: path.join(root, "sfx.mjs"),
    binding: { trust_owner_sid: OWNER, node_executable: { path: path.join(root, "node.exe") } },
    recheck() { if (!intact) throw new Error("SECURE_WORK_LAUNCH_HOLD"); },
    observeSecurity(paths) { return { ...evidence, paths: paths.map(p => ({ path: p, owner_sid: OWNER, reparse: false,
      allow: [{ sid: OWNER, rights: 2032127 }, { sid: p === signingPath ? policy.roles.reviewer.sid : evidence.sid, rights: 1179785 }] })) }; } };
  const task = { task_path: policy.worker_registration.task_path, enabled: true, xml_sha256: "b".repeat(64),
    principal_sid: policy.roles.worker.sid, run_level: 0, logon_type: 2, owner_sid: OWNER,
    actions: [{ type: 0, execute: runtime.binding.node_executable.path, arguments: `"${runtime.launcherPath}" --worker`, cwd: root }],
    allow: [{ sid: OWNER, rights: 2032127 }, { sid: policy.roles.controller.sid, rights: 1179785 }] };
  const seal = () => { const raw = JSON.stringify(policy); writeFileSync(policyPath, raw); config.execution_authority.policy_sha256 = hash(raw); };
  seal();
  let inspected = 0;
  const authority = loadExecutionAuthority(runtime, { now: () => clock, inspectTask(p) { inspected++; assert.equal(p, task.task_path); return task; } });
  return { policy, policyPath, keyPath, signingPath, config, runtime, evidence, task, seal, authority,
    scope: () => ({ ...policy.context, policy_epoch: policy.epoch }),
    expire: () => { clock = 9000; }, drift: () => { intact = false; }, inspected: () => inspected };
}

test("OS-observed role, purpose, capability and exact assignment/task/route are all required", t => {
  const f = fixture(t);
  assert.equal(f.authority.authorize("jobs.submit").principal_ref, "principal.controller");
  assert.throws(() => f.authority.authorize("release.issue", f.scope()));
  assert.throws(() => f.authority.authorize("model.dispatch", f.scope()));
  f.evidence.sid = f.policy.roles.sender.sid;
  assert.equal(f.authority.authorize("model.dispatch", f.scope()).purpose, "G3_PROVIDER");
  for (const field of ["project_ref", "assignment_ref", "assignment_epoch", "task_ref", "policy_epoch", "route_sha256", "audience"]) {
    assert.throws(() => f.authority.authorize("model.dispatch", { ...f.scope(), [field]: "changed" }));
  }
  assert.throws(() => f.authority.authorize("model.dispatch"));
  f.evidence.sid = f.policy.roles.worker.sid;
  assert.throws(() => f.authority.authorize("model.dispatch", f.scope()));
  assert.equal(f.authority.requireRole("worker").principal_ref, "principal.worker");
});

test("same SID, duplicate principal ref, wrong purpose and missing roles cannot self-approve", t => {
  for (const mutate of [p => { p.roles.reviewer.sid = p.roles.controller.sid; },
    p => { p.roles.worker.sid = p.roles.sender.sid; },
    p => { p.roles.reviewer.principal_ref = p.roles.controller.principal_ref; },
    p => { p.roles.sender.purpose = "SOURCE"; }, p => { delete p.roles.worker; }]) {
    const f = fixture(t); mutate(f.policy); f.seal();
    assert.throws(() => f.authority.authorize("jobs.submit"));
  }
});

test("policy hash/epoch/expiry/revocation, installation and actual privilege changes are current", t => {
  for (const mutate of [f => { writeFileSync(f.policyPath, "{}"); }, f => { f.policy.revoked = true; f.seal(); },
    f => f.expire(), f => f.drift(), f => { f.evidence.sid = sid(1999); },
    f => { f.evidence.elevated = true; }, f => { f.evidence.privileges = ["SeDebugPrivilege"]; }]) {
    const f = fixture(t); assert.ok(f.authority.authorize("jobs.submit")); mutate(f);
    assert.throws(() => f.authority.authorize("jobs.submit"));
  }
  const f = fixture(t); f.evidence.sid = f.policy.roles.sender.sid;
  const prior = f.scope(); f.policy.epoch++; f.seal();
  assert.throws(() => f.authority.authorize("model.dispatch", prior));
});

test("reviewer gate checks signer custody and actor/key identity without reading private key bytes", t => {
  const f = fixture(t); f.evidence.sid = f.policy.roles.reviewer.sid;
  assert.equal(f.authority.authorize("release.issue", f.scope()).principal_ref, "principal.reviewer");
  const record = { actor_ref: "principal.reviewer", issuer_key_id: "trust.synthetic", permit: { key_id: "trust.synthetic" } };
  f.evidence.sid = f.policy.roles.controller.sid;
  assert.ok(f.authority.verifyPermitIdentity(f.scope(), record));
  for (const delta of [{ actor_ref: "principal.controller" }, { issuer_key_id: "trust.attacker" }, { permit: { key_id: "trust.attacker" } }]) {
    assert.throws(() => f.authority.verifyPermitIdentity(f.scope(), { ...record, ...delta }));
  }
  const observe = f.runtime.observeSecurity;
  f.runtime.observeSecurity = paths => { const rows = observe(paths); for (const row of rows.paths) {
    if (row.path === f.signingPath) row.allow.push({ sid: f.policy.roles.controller.sid, rights: 1 });
  } return rows; };
  f.evidence.sid = f.policy.roles.reviewer.sid;
  assert.throws(() => f.authority.authorize("release.issue", f.scope()));
});

test("reviewer read entry derives current scope but never relaxes scope-required authorization", t => {
  const f = fixture(t); f.evidence.sid = f.policy.roles.reviewer.sid;
  for (const operation of ["release.issue", "release.review"]) {
    const current = f.authority.entry(operation);
    assert.equal(current.principal_ref, "principal.reviewer");
    assert.equal(current.task_ref, f.policy.context.task_ref);
    assert.throws(() => f.authority.authorize(operation, null));
    assert.throws(() => f.authority.authorize(operation, { ...f.scope(), task_ref: "task.foreign" }));
    assert.equal(f.authority.authorize(operation, f.scope()).principal_ref, current.principal_ref);
  }
  assert.throws(() => f.authority.entry("jobs.get"));
});

test("worker registration is exact read-only metadata and never a working byte-channel claim", t => {
  const f = fixture(t);
  assert.deepEqual(f.authority.workerContract(), { registration_checked: true, execution_enabled: false,
    code: "WORKER_BYTE_CHANNEL_UNBOUND", role: "worker", purpose: "G3_PROVIDER" });
  assert.equal(f.inspected(), 1);
  for (const mutate of [v => { v.principal_sid = f.policy.roles.controller.sid; }, v => { v.run_level = 1; },
    v => { v.enabled = false; }, v => { v.logon_type = 3; }, v => { v.xml_sha256 = "c".repeat(64); },
    v => { v.actions[0].arguments += " --role worker"; }, v => { v.actions[0].cwd += "-other"; },
    v => { v.allow.push({ sid: f.policy.roles.controller.sid, rights: 2 }); }]) {
    const g = fixture(t); mutate(g.task);
    assert.throws(() => g.authority.workerContract());
  }
});

function channelFixture(t) {
  const f = fixture(t), root = path.dirname(f.runtime.launcherPath);
  f.runtime.installationRole = { name: "controller", sid: f.evidence.sid };
  f.policy.ipc = { sender_pipe: "soulforge-secure-synthetic-sender-01", worker_pipe: "soulforge-secure-synthetic-worker-01" };
  const tasks = {};
  for (const role of ["sender", "worker"]) {
    const launcher = path.join(root, role, "sfx.mjs");
    const registration = { task_path: `\\Synthetic${role}`, xml_sha256: "b".repeat(64), launcher_path: launcher,
      node_path: f.runtime.binding.node_executable.path, working_directory: root };
    f.policy[role + "_registration"] = registration;
    tasks[registration.task_path] = { ...structuredClone(f.task), task_path: registration.task_path,
      principal_sid: f.policy.roles[role].sid,
      actions: [{ type: 0, execute: registration.node_path, arguments: `"${launcher}" --${role}`, cwd: root }] };
  }
  f.seal();
  const pinned = new Set([f.runtime.binding.node_executable.path, ...["sender", "worker"].map(role => f.policy[role + "_registration"].launcher_path)]);
  f.runtime.checkFile = filename => { if (!pinned.has(filename)) throw new Error("unlisted public code"); };
  f.authority = loadExecutionAuthority(f.runtime, { now: () => 1000, inspectTask: filename => tasks[filename] });
  f.peerConfig = role => {
    for (const key of Object.keys(f.config)) if (key !== "execution_authority") delete f.config[key];
    Object.assign(f.config, { schema: "soulforge.secure_work.config.v0", execution_role: role,
      runtime: { python_executable: path.join(root, "python.exe") }, kit_root: path.join(root, "kit"), recipe_root: path.join(root, "recipe") });
    f.evidence.sid = f.policy.roles[role].sid;
    f.runtime.installationRole = { name: role, sid: f.evidence.sid };
  };
  return { ...f, tasks, pinned };
}

test("bound IPC contract uses exact registered public code and OS role; readiness remains inactive", t => {
  const f = channelFixture(t);
  const contract = f.authority.channelContract(f.scope());
  assert.equal(contract.role, "controller");
  assert.deepEqual(contract.scope, f.scope());
  assert.equal(new Set(Object.values(contract.sids)).size, 3);
  assert.equal(f.authority.workerContract().code, "WORKER_CHANNEL_BOUND_INACTIVE");
  assert.equal(f.authority.workerContract().execution_enabled, false);
  assert.equal(JSON.stringify(contract).includes("path"), false);
  f.peerConfig("worker");
  assert.equal(f.authority.channelContract(f.scope()).role, "worker");
  f.peerConfig("sender");
  assert.equal(f.authority.channelContract(f.scope()).role, "sender");
});

test("peer configuration cannot carry any source, job, vault, key or controller config locations", t => {
  for (const field of ["pilot_root", "source_root", "jobs_root", "vault_root", "permit_trust_pubkey_path",
    "permit_trust_signing_key_path", "controller_config", "adapters", "status_path"]) {
    const f = channelFixture(t);
    f.peerConfig("worker");
    f.config[field] = "forbidden-private-location";
    assert.throws(() => f.authority.channelContract(f.scope()));
  }
  const f = channelFixture(t);
  f.evidence.sid = f.policy.roles.worker.sid;
  assert.throws(() => f.authority.channelContract(f.scope())); // old full config
});

test("IPC missing binding, replayed scope, renamed pipe, launcher drift and same SID all fail closed", t => {
  for (const mutate of [f => { delete f.policy.ipc; }, f => { f.policy.ipc.sender_pipe = f.policy.ipc.worker_pipe; },
    f => { f.policy.roles.worker.sid = f.policy.roles.sender.sid; },
    f => { f.policy.worker_registration.launcher_path += "-changed"; },
    f => { f.tasks[f.policy.sender_registration.task_path].actions[0].arguments += " --config attacker"; },
    f => { f.policy.sender_registration = { task_path: "\\OldSender", xml_sha256: "b".repeat(64) }; }]) {
    const f = channelFixture(t);
    mutate(f); f.seal();
    assert.throws(() => f.authority.channelContract(f.scope()));
  }
  for (const field of Object.keys(channelFixture(t).scope())) {
    const f = channelFixture(t);
    assert.throws(() => f.authority.channelContract({ ...f.scope(), [field]: "stale" }));
  }
});

function custodyFixture(t) {
  const f = channelFixture(t), root = path.dirname(f.runtime.launcherPath);
  const registration = { task_path: "\\SyntheticCustodySender", xml_sha256: "d".repeat(64),
    launcher_path: path.join(root, "custody", "sfx.mjs"), node_path: f.runtime.binding.node_executable.path,
    working_directory: root };
  f.policy.custody_channel = { pipe: "soulforge-secure-synthetic-custody-01", registration };
  f.pinned.add(registration.launcher_path);
  f.tasks[registration.task_path] = { ...structuredClone(f.task), task_path: registration.task_path,
    xml_sha256: registration.xml_sha256, principal_sid: f.policy.roles.sender.sid,
    actions: [{ type: 0, execute: registration.node_path, arguments: `"${registration.launcher_path}" --custody-sender`, cwd: root }] };
  f.seal();
  f.custodyConfig = () => {
    f.peerConfig("sender");
    f.runtime.installationRole.purpose = "custody.deposit";
    f.config.execution_purpose = "custody.deposit";
    f.config.custody_authority = { policy_path: path.join(root, "custody-policy"), policy_sha256: "e".repeat(64), approval_root: path.join(root, "approvals") };
    f.config.adapters = { custody: { enabled: true, live_enabled: true, ingress_url: "http://127.0.0.1:1",
      token_file: path.join(root, "synthetic-material"), token_sha256: "f".repeat(64) } };
  };
  return f;
}

test("M10 controller and custody-purpose sender bind independently of minimal M06 configuration", t => {
  const f = custodyFixture(t);
  assert.equal(f.authority.custodyChannelContract(f.scope()).role, "controller");
  f.custodyConfig();
  const result = f.authority.custodyChannelContract(f.scope());
  assert.equal(result.role, "sender");
  assert.equal(result.purpose, "custody.deposit");
  assert.equal(JSON.stringify(result).includes("token"), false);
  assert.throws(() => f.authority.channelContract(f.scope()));
});

test("wrong purpose, worker role, shared endpoint, config widening and stale assignment cannot dispatch custody", t => {
  for (const mutate of [f => { delete f.runtime.installationRole.purpose; },
    f => { f.runtime.installationRole.purpose = "model.dispatch"; }, f => { f.config.execution_purpose = "model.dispatch"; },
    f => { f.evidence.sid = f.policy.roles.worker.sid; }, f => { f.config.pilot_root = "forbidden"; },
    f => { f.config.adapters.transport = {}; }, f => { delete f.config.adapters.custody.token_sha256; },
    f => { f.policy.custody_channel.pipe = f.policy.ipc.sender_pipe; f.seal(); },
    f => { f.tasks[f.policy.custody_channel.registration.task_path].actions[0].arguments += " --config caller"; }]) {
    const f = custodyFixture(t); f.custodyConfig(); mutate(f);
    assert.throws(() => f.authority.custodyChannelContract(f.scope()));
  }
  const f = custodyFixture(t);
  assert.throws(() => f.authority.custodyChannelContract({ ...f.scope(), assignment_epoch: 99 }));
});
