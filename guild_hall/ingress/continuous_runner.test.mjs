import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  CONTINUOUS_BINDING_SCHEMA,
  CONTINUOUS_BINDING_SCHEMA_V2,
  CONTINUOUS_BINDING_SCHEMA_V3,
  CONTINUOUS_EPOCH_SCHEMA,
  CONTINUOUS_LEASE_SCHEMA,
  loadContinuousBinding,
  runContinuousIngress as runContinuousIngressImpl,
} from "./continuous_runner.mjs";
import { inspectMailCollectorRelease } from "./mail_bridge.mjs";
import {
  WRITER_AUTHORITY_ABSENT_DIGEST,
  transitionWriterAuthority,
} from "./writer_authority.mjs";
import { buildDefaultPlaudSyncProfile } from "../voice_capture/plaud_ingest.mjs";

const execFile = promisify(execFileCallback);
const CLI = fileURLToPath(new URL("./continuous_cli.mjs", import.meta.url));
const AUTHORITY_NOW = Date.parse("2026-07-20T00:00:00.000Z");

async function writeManifest(dataRoot) {
  await writeFile(join(dataRoot, "storage_manifest.json"), `${JSON.stringify({
    schema_version: "soulforge.hpp_private_custody.v1",
    custody_role: "hpp_sole_writer",
    cloud_sync_allowed: false,
    remote_direct_disk_access_allowed: false,
    payload_roots: {
      team_files: "ingress/team_files",
      pc_activity: "ingress/pc_activity",
      run_logs: "ingress/run_logs",
    },
    state_roots: {
      receipts: "state/receipts",
      checkpoints: "state/checkpoints",
    },
    lane_contracts: {
      team_files: {
        payload: "ingress/team_files",
        receipt: "state/receipts/team_files",
        checkpoint: "state/checkpoints/team_files",
        quarantine: "quarantine/team_files",
      },
      pc_activity: {
        payload: "ingress/pc_activity",
        receipt: "state/receipts/pc_activity",
        checkpoint: "state/checkpoints/pc_activity",
        quarantine: "quarantine/pc_activity",
      },
      run_logs: {
        payload: "ingress/run_logs",
        receipt: "state/receipts/run_logs",
        checkpoint: "state/checkpoints/run_logs",
        quarantine: "quarantine/run_logs",
      },
    },
    classification_policy: "stable_object_identity_with_project_binding_events",
    raw_in_workmeta_allowed: false,
    workspace_or_workmeta_relocation: false,
  }, null, 2)}\n`);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "continuous-ingress-"));
  const dataRoot = join(root, "data");
  const sourceRoot = join(root, "sources");
  const voiceRoot = join(root, "voice-source");
  const queues = {
    team_files: join(sourceRoot, "team"),
    structured_pc_work: join(sourceRoot, "pc"),
    run_logs: join(sourceRoot, "run"),
  };
  const acks = {
    team_files: join(sourceRoot, "acks", "team"),
    structured_pc_work: join(sourceRoot, "acks", "pc"),
    run_logs: join(sourceRoot, "acks", "run"),
  };
  await mkdir(dataRoot);
  await mkdir(sourceRoot);
  await mkdir(voiceRoot);
  for (const path of Object.values(queues)) await mkdir(path);
  for (const path of Object.values(acks)) await mkdir(path, { recursive: true });
  await writeManifest(dataRoot);
  const bindingPath = join(root, "binding.json");
  return { root, dataRoot, sourceRoot, voiceRoot, queues, acks, bindingPath };
}

function binding(f, overrides = {}) {
  const voiceState = join(f.dataRoot, "state");
  const payload = {
    schema_version: CONTINUOUS_BINDING_SCHEMA,
    enabled: true,
    scheduler_enabled: false,
    node_id: "hpp-test-node",
    data_root: f.dataRoot,
    poll_interval_seconds: 60,
    lease_ttl_seconds: 180,
    voice: {
      enabled: false,
      source_root: f.voiceRoot,
      destination_root: join(f.dataRoot, "ingress", "voice"),
      legacy_root: null,
      state_root: voiceState,
      checkpoint_path: join(voiceState, "checkpoints", "voice", "continuous-test.json"),
      receipt_root: join(voiceState, "receipts", "voice"),
      source_owner_ref: "voice-test-owner",
      lanes: ["sessions"],
      max_new_files: 10,
      max_new_bytes: 1024 * 1024,
    },
    queues: Object.entries(f.queues).map(([lane, sourceRoot]) => ({
      binding_id: `${lane}-queue`,
      enabled: true,
      lane,
      source_root: sourceRoot,
      ack_root: f.acks[lane],
      source_owner_ref: `${lane}-owner`,
      max_files_per_run: 10,
      max_bytes_per_run: 1024 * 1024,
    })),
  };
  return { ...payload, ...overrides };
}

async function writeBinding(f, payload) {
  await writeFile(f.bindingPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function bindingDigest(path) {
  return `sha256:${digest(await readFile(path))}`;
}

async function runContinuousIngress(options) {
  const effective = { ...options };
  if (effective.apply === true && !effective.bindingDigest) {
    effective.bindingDigest = await bindingDigest(effective.bindingPath);
  }
  return runContinuousIngressImpl(effective);
}

async function activateWriterAuthority(f) {
  const authorityRoot = join(f.dataRoot, "state", "writer_authority");
  const recordPath = join(authorityRoot, "active.json");
  await mkdir(authorityRoot, { recursive: true });
  const initialized = await transitionWriterAuthority({
    stateRoot: f.dataRoot,
    recordPath,
    action: "initialize",
    primaryNodeId: "hpp-test-node",
    fallbackNodeId: "fallback-test-node",
    expectedCurrentEpoch: 0,
    expectedCurrentDigest: WRITER_AUTHORITY_ABSENT_DIGEST,
    expectedNodeId: "hpp-test-node",
    notBefore: "2026-07-20T00:00:00.000Z",
    expiresAt: "2099-07-20T00:00:00.000Z",
    ownerApprovalRef: "owner-approval://synthetic/continuous-initialize",
    now: AUTHORITY_NOW,
    apply: true,
  });
  const active = await transitionWriterAuthority({
    stateRoot: f.dataRoot,
    recordPath,
    action: "promote",
    targetMode: "primary",
    targetNodeId: "hpp-test-node",
    expectedCurrentEpoch: initialized.epoch,
    expectedCurrentDigest: initialized.authority_digest,
    expectedNodeId: initialized.node_id,
    notBefore: "2026-07-20T00:00:00.000Z",
    expiresAt: "2099-07-20T00:00:00.000Z",
    ownerApprovalRef: "owner-approval://synthetic/continuous-promote",
    now: AUTHORITY_NOW,
    apply: true,
  });
  return { authorityRoot, recordPath, active };
}

async function revokeWriterAuthority(f, authority, current, overrides = {}) {
  return transitionWriterAuthority({
    stateRoot: f.dataRoot,
    recordPath: authority.recordPath,
    action: "revoke",
    expectedCurrentEpoch: current.epoch,
    expectedCurrentDigest: current.authority_digest,
    expectedNodeId: current.node_id,
    notBefore: "2026-07-20T00:00:00.000Z",
    expiresAt: "2099-07-20T00:00:00.000Z",
    ownerApprovalRef: "owner-approval://synthetic/continuous-revoke",
    now: AUTHORITY_NOW,
    apply: true,
    ...overrides,
  });
}

async function terminatedChildPid() {
  const child = spawn(process.execPath, ["--eval", ""], { stdio: "ignore" });
  const pid = child.pid;
  await once(child, "exit");
  return pid;
}

async function adversariallyRevokeDuringRun(f, authority) {
  const lockPath = join(f.dataRoot, "state", "leases", "continuous_ingress", "active.lock.json");
  const lease = JSON.parse(await readFile(lockPath, "utf8"));
  const deadPid = await terminatedChildPid();
  await writeFile(lockPath, `${JSON.stringify({
    ...lease,
    owner_pid: deadPid,
    expires_at: new Date(AUTHORITY_NOW).toISOString(),
  })}\n`);
  try {
    return await revokeWriterAuthority(f, authority, authority.active);
  } finally {
    await writeFile(lockPath, `${JSON.stringify(lease)}\n`);
  }
}

async function waitForReady(child) {
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  await new Promise((resolveReady, rejectReady) => {
    const onData = (chunk) => {
      stdout += chunk.toString();
      if (!stdout.includes("READY\n")) return;
      cleanup();
      resolveReady();
    };
    const onExit = (code, signal) => {
      cleanup();
      rejectReady(new Error(`paused child exited before ready: ${code ?? signal}; ${stderr}`));
    };
    const cleanup = () => {
      child.stdout.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

async function spawnPausedContinuousRun(bindingPath, nowMs) {
  const moduleUrl = new URL("./continuous_runner.mjs", import.meta.url).href;
  const expectedBindingDigest = await bindingDigest(bindingPath);
  const script = `
    import { runContinuousIngress } from ${JSON.stringify(moduleUrl)};
    let now = ${JSON.stringify(nowMs)};
    await runContinuousIngress({
      bindingPath: ${JSON.stringify(bindingPath)},
      bindingDigest: ${JSON.stringify(expectedBindingDigest)},
      apply: true,
      now: () => now++,
      testHooks: {
        afterLeaseAcquired: async () => {
          process.stdout.write("READY\\n");
          await new Promise(() => { setInterval(() => {}, 1_000); });
        },
      },
    });
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(child);
  return child;
}

async function v2Binding(f, authority, options = {}) {
  const privateConfigRoot = join(f.dataRoot, "config");
  await mkdir(privateConfigRoot, { recursive: true });
  const pythonExecutable = join(f.root, "python-synthetic.exe");
  const teamCliPath = join(f.root, "team_cli_synthetic.py");
  const registerPath = join(privateConfigRoot, "team_mailboxes.json");
  const envFile = join(privateConfigRoot, "synthetic-mailbox.env");
  const cliBytes = "# synthetic pinned team CLI\n";
  const register = {
    schema_version: "email.fetch.team_mailbox_register.v1",
    mailboxes: [{
      id: "synthetic-mailbox",
      account_id: "synthetic-account",
      email: "synthetic@example.test",
      display_name: "Synthetic",
      provider: "gmail",
      enabled: true,
      env_file: "synthetic-mailbox.env",
      workspace: "synthetic",
    }],
  };
  const registerBytes = `${JSON.stringify(register, null, 2)}\n`;
  await writeFile(pythonExecutable, "synthetic executable\n");
  await writeFile(teamCliPath, cliBytes);
  await writeFile(registerPath, registerBytes);
  if (options.credentialPresent !== false) await writeFile(envFile, "SYNTHETIC_ONLY=1\n");
  const release = await inspectMailCollectorRelease(teamCliPath, { requireCollector: false });
  const payload = binding(f);
  payload.schema_version = CONTINUOUS_BINDING_SCHEMA_V2;
  payload.lease_ttl_seconds = options.leaseTtlSeconds ?? 900;
  payload.writer_authority_record_path = authority.recordPath;
  payload.writer_mode = options.writerMode ?? "primary";
  payload.mail = {
    enabled: options.mailEnabled !== false,
    python_executable: pythonExecutable,
    team_cli_path: teamCliPath,
    team_cli_sha256: digest(cliBytes),
    collector_tree_sha256: release.collector_tree_sha256,
    register_path: registerPath,
    register_sha256: digest(registerBytes),
    private_config_root: privateConfigRoot,
    limit: options.limit ?? 25,
  };
  return {
    payload,
    pythonExecutable,
    teamCliPath,
    registerPath,
    envFile,
    privateConfigRoot,
  };
}

async function v3Binding(f, authority, options = {}) {
  const mail = await v2Binding(f, authority, { ...options, mailEnabled: options.mailEnabled ?? false });
  mail.payload.schema_version = CONTINUOUS_BINDING_SCHEMA_V3;
  if (options.plaudEnabled === false) {
    mail.payload.plaud = {
      enabled: false,
      operational_mode: "observe_only",
      workspace_root: null,
      profile_path: null,
      profile_sha256: null,
      expected_cli_versions: ["0.3.4"],
      command_timeout_seconds: 15,
      max_candidates_per_cycle: 20,
      writer_enabled: false,
    };
    return { ...mail, profilePath: null, workspaceRoot: null };
  }
  const workspaceRoot = join(f.root, "workspace");
  const profilePath = join(workspaceRoot, "_workspaces", "system", "voice_capture", "config", "plaud_sync.profile.json");
  await mkdir(dirname(profilePath), { recursive: true });
  const profile = {
    ...buildDefaultPlaudSyncProfile(),
    register_library: false,
    write_workmeta_draft: false,
  };
  const profileBytes = `${JSON.stringify(profile, null, 2)}\n`;
  await writeFile(profilePath, profileBytes);
  mail.payload.plaud = {
    enabled: true,
    operational_mode: "observe_only",
    workspace_root: workspaceRoot,
    profile_path: profilePath,
    profile_sha256: digest(profileBytes),
    expected_cli_versions: ["0.3.4"],
    command_timeout_seconds: 15,
    max_candidates_per_cycle: 20,
    writer_enabled: false,
  };
  return { ...mail, profilePath, workspaceRoot };
}

function syntheticMailSummary(overrides = {}) {
  return {
    schema_version: "email.fetch.team_mailbox_run.v1",
    partial: false,
    mailboxes_total: 1,
    mailboxes_enabled: 1,
    mailboxes_run: 1,
    mailboxes_skipped: 0,
    total_events: 2,
    total_new_events: 1,
    total_duplicates: 1,
    errors: [],
    ...overrides,
  };
}

function advancingClock() {
  let value = AUTHORITY_NOW + 1000;
  return () => value++;
}

async function listFiles(root) {
  const files = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(root);
  return files.sort();
}

test("disabled or dry-run binding performs zero writes", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.queues.team_files, "one.bin"), "one");
    await writeBinding(f, binding(f));
    const before = await listFiles(f.dataRoot);
    const dry = await runContinuousIngress({ bindingPath: f.bindingPath });
    assert.equal(dry.status, "dry_run_no_write");
    assert.equal(dry.writes_performed, 0);
    assert.deepEqual(await listFiles(f.dataRoot), before);

    await writeBinding(f, binding(f, { enabled: false }));
    const disabled = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true });
    assert.equal(disabled.status, "disabled_no_write");
    assert.deepEqual(await listFiles(f.dataRoot), before);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("all queue lanes stage once, replay unchanged, and leave monotonic epochs", async () => {
  const f = await fixture();
  try {
    for (const [lane, root] of Object.entries(f.queues)) {
      await writeFile(join(root, `${lane}.bin`), `synthetic-${lane}`);
    }
    await writeBinding(f, binding(f));
    let clock = Date.parse("2026-07-17T00:00:00Z");
    const now = () => clock++;
    const first = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now });
    assert.equal(first.status, "ok");
    assert.equal(first.queues.length, 3);
    assert.equal(first.queues.reduce((sum, row) => sum + row.staged_files, 0), 3);
    assert.equal(first.queues.reduce((sum, row) => sum + row.writes_performed, 0), 12);
    assert.equal(first.queues.reduce((sum, row) => sum + row.acknowledgements_written, 0), 3);
    assert.equal(first.source_deleted, false);
    assert.equal(first.erp_written, false);
    assert.equal(await listFiles(join(f.dataRoot, "state", "leases", "continuous_ingress", "active.lock.json")).then((rows) => rows.length), 0);

    clock += 1000;
    const second = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now });
    assert.equal(second.status, "ok");
    assert.equal(second.queues.reduce((sum, row) => sum + row.acknowledged_files, 0), 3);
    assert.equal(second.queues.reduce((sum, row) => sum + row.writes_performed, 0), 0);
    const epoch = JSON.parse(await readFile(join(f.dataRoot, "state", "leases", "continuous_ingress", "epoch.json"), "utf8"));
    assert.equal(epoch.last_epoch, 2);
    assert.equal((await listFiles(join(f.dataRoot, "state", "receipts", "continuous_ingress"))).length, 2);
    const health = JSON.parse(await readFile(join(f.dataRoot, "state", "health", "continuous_ingress.json"), "utf8"));
    assert.equal(health.status, "ok");
    assert.equal(health.mail_status, "credential_pending_off");
    assert.equal(health.erp_enabled, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("acknowledged queue occurrence rejects later source mutation", async () => {
  const f = await fixture();
  try {
    const source = join(f.queues.team_files, "one.payload");
    await writeFile(source, "one");
    const payload = binding(f);
    payload.queues = payload.queues.map((queue) => ({ ...queue, enabled: queue.lane === "team_files" }));
    await writeBinding(f, payload);
    let value = Date.parse("2026-07-17T00:00:00Z");
    const first = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now: () => value++ });
    assert.equal(first.queues[0].acknowledgements_written, 1);
    await writeFile(source, "two");
    value += 1000;
    const second = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now: () => value++ });
    assert.equal(second.status, "degraded");
    assert.deepEqual(second.errors.map((error) => error.code), ["continuous_queue_ack_invalid"]);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("active lease blocks a second writer and expired lease increments the fence", async () => {
  const f = await fixture();
  try {
    await writeBinding(f, binding(f));
    const leaseRoot = join(f.dataRoot, "state", "leases", "continuous_ingress");
    await mkdir(leaseRoot, { recursive: true });
    const active = {
      schema_version: CONTINUOUS_LEASE_SCHEMA,
      node_id: "other-node",
      owner_host: hostname(),
      owner_pid: process.pid,
      lease_epoch: 4,
      fence_token: "other-token",
      acquired_at: "2026-07-17T00:00:00.000Z",
      expires_at: "2026-07-17T01:00:00.000Z",
    };
    await writeFile(join(leaseRoot, "active.lock.json"), `${JSON.stringify(active)}\n`);
    await assert.rejects(
      runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: () => Date.parse("2026-07-17T00:30:00Z"),
      }),
      /continuous_lease_held/,
    );

    active.acquired_at = "2026-07-16T22:00:00.000Z";
    active.expires_at = "2026-07-16T23:00:00.000Z";
    active.owner_pid = await terminatedChildPid();
    active.owner_host = "remote-owner.invalid";
    await writeFile(join(leaseRoot, "active.lock.json"), `${JSON.stringify(active)}\n`);
    await writeFile(join(leaseRoot, "epoch.json"), `${JSON.stringify({
      schema_version: CONTINUOUS_EPOCH_SCHEMA,
      last_epoch: 4,
      updated_at: "2026-07-16T23:00:00.000Z",
    })}\n`);
    await assert.rejects(runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: () => Date.parse("2026-07-17T00:30:00Z"),
    }), { code: "continuous_lease_remote_owner" });
    active.owner_host = hostname();
    await writeFile(join(leaseRoot, "active.lock.json"), `${JSON.stringify(active)}\n`);
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: (() => {
        let value = Date.parse("2026-07-17T00:30:00Z");
        return () => value++;
      })(),
    });
    assert.equal(result.lease_epoch, 5);
    assert.ok((await readdir(leaseRoot)).some((name) => name.startsWith("stale-")));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("failed epoch validation removes only the provisional lease", async () => {
  const f = await fixture();
  try {
    await writeBinding(f, binding(f));
    const leaseRoot = join(f.dataRoot, "state", "leases", "continuous_ingress");
    await mkdir(leaseRoot, { recursive: true });
    await writeFile(join(leaseRoot, "epoch.json"), "{\"schema_version\":\"wrong\",\"last_epoch\":0}\n");
    await assert.rejects(
      runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: () => Date.parse("2026-07-17T00:00:00Z"),
      }),
      /continuous_epoch_invalid/,
    );
    assert.equal((await listFiles(join(leaseRoot, "active.lock.json"))).length, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("lost fence token stops the run", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.queues.team_files, "one.bin"), "one");
    await writeBinding(f, binding(f));
    await assert.rejects(
      runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: (() => {
          let value = Date.parse("2026-07-17T00:00:00Z");
          return () => value++;
        })(),
        testHooks: {
          afterQueueFile: async () => {
            const lock = join(f.dataRoot, "state", "leases", "continuous_ingress", "active.lock.json");
            const payload = JSON.parse(await readFile(lock, "utf8"));
            payload.fence_token = "replaced-token";
            await writeFile(lock, `${JSON.stringify(payload)}\n`);
          },
        },
      }),
      /continuous_lease_lost/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("voice mirror copies a new source once and replays without payload writes", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.voiceRoot, "sessions"));
    await writeFile(join(f.voiceRoot, "sessions", "voice.bin"), "synthetic-voice");
    const payload = binding(f);
    payload.voice.enabled = true;
    payload.queues = payload.queues.map((queue) => ({ ...queue, enabled: false }));
    await writeBinding(f, payload);
    let value = Date.parse("2026-07-17T00:00:00Z");
    const first = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now: () => value++ });
    assert.equal(first.voice.copied_new, 1);
    assert.equal(first.voice.source_missing_since_checkpoint, 0);
    value += 1000;
    const second = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now: () => value++ });
    assert.equal(second.voice.copied_new, 0);
    assert.equal(second.voice.unchanged, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("voice mirror rechecks the HPP fence between custody items", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.voiceRoot, "sessions"));
    await writeFile(join(f.voiceRoot, "sessions", "one.bin"), "voice-one");
    await writeFile(join(f.voiceRoot, "sessions", "two.bin"), "voice-two");
    const payload = binding(f);
    payload.voice.enabled = true;
    payload.queues = payload.queues.map((queue) => ({ ...queue, enabled: false }));
    await writeBinding(f, payload);
    let changed = false;
    await assert.rejects(
      runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: (() => {
          let value = Date.parse("2026-07-17T00:00:00Z");
          return () => value++;
        })(),
        testHooks: {
          onVoiceFence: async (context) => {
            if (changed || context.phase !== "after_source_file") return;
            changed = true;
            const lock = join(f.dataRoot, "state", "leases", "continuous_ingress", "active.lock.json");
            const current = JSON.parse(await readFile(lock, "utf8"));
            current.fence_token = "replaced-voice-token";
            await writeFile(lock, `${JSON.stringify(current)}\n`);
          },
        },
      }),
      /continuous_lease_lost/,
    );
    assert.equal(changed, true);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("queue limits and source links are explicit degraded coverage", async (t) => {
  const f = await fixture();
  try {
    await writeFile(join(f.queues.team_files, "one.bin"), "one");
    await writeFile(join(f.queues.team_files, "two.bin"), "two");
    const payload = binding(f);
    payload.queues = payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "team_files",
      max_files_per_run: 1,
    }));
    await writeBinding(f, payload);
    let value = Date.parse("2026-07-17T00:00:00Z");
    const limited = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now: () => value++ });
    assert.equal(limited.status, "degraded");
    assert.equal(limited.queues[0].coverage_complete, false);
    assert.deepEqual(limited.queues[0].gap_reasons, ["file_limit_reached"]);

    try {
      await symlink(join(f.queues.team_files, "one.bin"), join(f.queues.team_files, "linked.bin"), "file");
    } catch (error) {
      if (["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) {
        t.diagnostic(`symlink fixture unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    payload.queues[0].max_files_per_run = 10;
    await writeBinding(f, payload);
    value += 1000;
    const linked = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now: () => value++ });
    assert.equal(linked.status, "degraded");
    assert.ok(linked.queues[0].gap_reasons.includes("source_links_withheld"));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("binding rejects unknown fields, data overlap, and unsafe source roots", async (t) => {
  const f = await fixture();
  try {
    const unknown = binding(f);
    unknown.unexpected = true;
    await writeBinding(f, unknown);
    await assert.rejects(loadContinuousBinding(f.bindingPath), /invalid_continuous_binding/);

    const overlap = binding(f);
    overlap.queues[0].source_root = join(f.dataRoot, "source");
    await writeBinding(f, overlap);
    await assert.rejects(loadContinuousBinding(f.bindingPath), /continuous_queue_data_root_overlap/);

    const linkRoot = join(f.root, "source-link");
    try {
      await symlink(f.queues.team_files, linkRoot, "junction");
    } catch (error) {
      if (["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) {
        t.diagnostic(`symlink fixture unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    const linked = binding(f);
    linked.queues[0].source_root = linkRoot;
    await writeBinding(f, linked);
    await assert.rejects(loadContinuousBinding(f.bindingPath), /continuous_queue_source_unsafe/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("CLI output is locator-free and apply remains explicit", async () => {
  const f = await fixture();
  try {
    await writeBinding(f, binding(f));
    const { stdout } = await execFile(process.execPath, [CLI, "--config", f.bindingPath], { cwd: dirname(CLI) });
    const result = JSON.parse(stdout);
    assert.equal(result.status, "dry_run_no_write");
    assert.equal(result.writes_performed, 0);
    assert.equal(result.config_digest, await bindingDigest(f.bindingPath));
    for (const forbidden of [f.root, f.dataRoot, f.sourceRoot, "team_files-owner"]) {
      assert.ok(!stdout.includes(forbidden));
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("apply requires the externally pinned raw binding digest and rejects mismatches", async () => {
  const f = await fixture();
  try {
    const payload = binding(f, { enabled: false });
    await writeBinding(f, payload);
    const expected = await bindingDigest(f.bindingPath);
    await assert.rejects(
      execFile(process.execPath, [CLI, "--config", f.bindingPath, "--apply"], { cwd: dirname(CLI) }),
      (error) => {
        assert.equal(error.code, 2);
        assert.equal(JSON.parse(error.stderr).error, "continuous_binding_digest_required");
        return true;
      },
    );
    await assert.rejects(
      execFile(process.execPath, [
        CLI,
        "--config",
        f.bindingPath,
        "--config-digest",
        `sha256:${"0".repeat(64)}`,
        "--apply",
      ], { cwd: dirname(CLI) }),
      (error) => {
        assert.equal(error.code, 2);
        assert.equal(JSON.parse(error.stderr).error, "continuous_binding_digest_mismatch");
        return true;
      },
    );
    const { stdout } = await execFile(process.execPath, [
      CLI,
      "--config",
      f.bindingPath,
      "--config-digest",
      expected,
      "--apply",
    ], { cwd: dirname(CLI) });
    assert.equal(JSON.parse(stdout).status, "disabled_no_write");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("continuous CLI rejects unknown, duplicate, and valueless flags", async () => {
  const f = await fixture();
  try {
    await writeBinding(f, binding(f));
    const cases = [
      [["--config", f.bindingPath, "--unknown", "value"], "unexpected_argument"],
      [["--config", f.bindingPath, "--config", f.bindingPath], "duplicate_argument"],
      [["--config", f.bindingPath, "--apply", "--apply"], "duplicate_argument"],
      [["--config", f.bindingPath, "--config-digest", "--apply"], "missing_config-digest"],
    ];
    for (const [args, expected] of cases) {
      await assert.rejects(
        execFile(process.execPath, [CLI, ...args], { cwd: dirname(CLI) }),
        (error) => {
          assert.equal(error.code, 2);
          assert.equal(JSON.parse(error.stderr).error, expected);
          return true;
        },
      );
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("stable-open binding read rejects an in-place race before any apply write", async () => {
  const f = await fixture();
  try {
    await writeBinding(f, binding(f));
    const original = await readFile(f.bindingPath);
    const expected = await bindingDigest(f.bindingPath);
    const before = await listFiles(f.dataRoot);
    await assert.rejects(
      runContinuousIngressImpl({
        bindingPath: f.bindingPath,
        bindingDigest: expected,
        apply: true,
        testHooks: {
          afterBindingOpened: async () => {
            await writeFile(f.bindingPath, original);
          },
        },
      }),
      { code: "continuous_binding_unstable" },
    );
    assert.deepEqual(await listFiles(f.dataRoot), before);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("v1 binding remains exact and runs without writer authority fields", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.queues.team_files, "v1.bin"), "v1-compatible");
    const payload = binding(f);
    payload.queues = payload.queues.map((queue) => ({ ...queue, enabled: queue.lane === "team_files" }));
    await writeBinding(f, payload);
    const loaded = await loadContinuousBinding(f.bindingPath);
    assert.equal(loaded.schemaVersion, CONTINUOUS_BINDING_SCHEMA);
    assert.equal(Object.hasOwn(loaded, "writerAuthorityRecordPath"), false);
    assert.equal(Object.hasOwn(loaded, "mail"), false);
    const result = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now: advancingClock() });
    assert.equal(result.schema_version, "soulforge.ingress.continuous_run_receipt.v1");
    assert.equal(result.status, "ok");
    assert.equal(Object.hasOwn(result, "writer_authority_epoch"), false);
    assert.equal(result.queues[0].staged_files, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("v2 applies all five lanes under one authority snapshot and emits only sanitized mail counts", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority);
    await mkdir(join(f.voiceRoot, "sessions"));
    await writeFile(join(f.voiceRoot, "sessions", "voice.bin"), "synthetic-voice");
    mail.payload.voice.enabled = true;
    for (const [lane, root] of Object.entries(f.queues)) {
      await writeFile(join(root, `${lane}.bin`), `synthetic-${lane}`);
    }
    await writeBinding(f, mail.payload);
    let calls = 0;
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      mailExecutor: async ({ executablePath, args, timeoutMs }) => {
        calls += 1;
        assert.notEqual(executablePath, mail.pythonExecutable);
        assert.equal(timeoutMs, 10 * 60 * 1000);
        assert.deepEqual(args.slice(0, 2), ["-I", "-B"]);
        assert.notEqual(args[2], mail.teamCliPath);
        assert.equal(args[args.indexOf("--data-root") + 1], f.dataRoot);
        assert.notEqual(args[args.indexOf("--register") + 1], mail.registerPath);
        assert.equal(args[args.indexOf("--register-origin") + 1], mail.registerPath);
        assert.equal(args[args.indexOf("--limit") + 1], "25");
        assert.equal(args.includes("--ingress-only"), true);
        assert.equal(args.includes("--once"), true);
        assert.equal(args.includes("--json"), true);
        return {
          exitCode: 0,
          stdout: JSON.stringify(syntheticMailSummary()),
          stderr: "RAW CHILD MESSAGE MUST NOT ESCAPE",
        };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.status, "ok");
    assert.equal(result.schema_version, "soulforge.ingress.continuous_run_receipt.v2");
    assert.equal(result.mail.status, "ok");
    assert.equal(result.mail.mailboxes_run, 1);
    assert.equal(result.mail.total_new_events, 1);
    assert.equal(result.mail_fetched, true);
    assert.equal(result.voice.copied_new, 1);
    assert.equal(result.queues.reduce((sum, row) => sum + row.staged_files, 0), 3);
    assert.equal(result.writer_authority_epoch, authority.active.epoch);
    assert.equal(result.writer_authority_digest, authority.active.authority_digest);
    assert.equal(result.writer_authority_node_id, "hpp-test-node");
    assert.equal(result.writer_authority_mode, "primary");
    assert.equal(result.erp_written, false);
    assert.equal(result.mcp_written, false);
    assert.equal(result.project_promoted, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("synthetic-mailbox"), false);
    assert.equal(serialized.includes("RAW CHILD MESSAGE"), false);
    assert.equal(serialized.includes(mail.registerPath), false);
    const health = JSON.parse(await readFile(join(f.dataRoot, "state", "health", "continuous_ingress.json"), "utf8"));
    assert.equal(health.writer_authority_epoch, authority.active.epoch);
    assert.equal(health.writer_authority_digest, authority.active.authority_digest);
    assert.equal(health.writer_authority_node_id, "hpp-test-node");
    assert.equal(health.mail_status, "ok");
    assert.equal(health.erp_enabled, false);
    assert.equal(health.mcp_enabled, false);
    assert.equal(health.project_promoter_enabled, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a temporarily missing voice source degrades only voice while mail and queues continue", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority);
    mail.payload.voice.enabled = true;
    await rm(f.voiceRoot, { recursive: true, force: true });
    await writeFile(join(f.queues.team_files, "team.bin"), "synthetic-team");
    await writeBinding(f, mail.payload);

    const loaded = await loadContinuousBinding(f.bindingPath);
    assert.equal(loaded.voice.enabled, true);
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      mailExecutor: async () => ({
        exitCode: 0,
        stdout: JSON.stringify(syntheticMailSummary()),
        stderr: "",
      }),
    });

    assert.equal(result.status, "degraded");
    assert.equal(result.mail.status, "ok");
    assert.equal(result.mail.total_new_events, 1);
    assert.equal(result.voice, null);
    assert.ok(result.errors.some((row) => row.binding_id === "voice"
      && row.code === "continuous_voice_source_unsafe"));
    assert.equal(result.queues.length, 3);
    assert.equal(result.queues.find((row) => row.lane === "team_files").staged_files, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("mail-disabled v2 still runs every enabled non-mail lane", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority, { mailEnabled: false });
    mail.payload.queues = mail.payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "run_logs",
    }));
    await writeFile(join(f.queues.run_logs, "run.bin"), "run-only");
    await writeBinding(f, mail.payload);
    let calls = 0;
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      mailExecutor: async () => {
        calls += 1;
        throw new Error("must not spawn");
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.status, "ok");
    assert.equal(result.mail.status, "disabled");
    assert.equal(result.mail_fetched, false);
    assert.equal(result.queues[0].lane, "run_logs");
    assert.equal(result.queues[0].staged_files, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing credential reference degrades mail without spawning or blocking non-mail custody", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority, { credentialPresent: false });
    mail.payload.queues = mail.payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "team_files",
    }));
    await writeFile(join(f.queues.team_files, "team.bin"), "team-custody");
    await writeBinding(f, mail.payload);
    let calls = 0;
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      mailExecutor: async () => {
        calls += 1;
        throw new Error("must not spawn");
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.status, "degraded");
    assert.equal(result.mail.status, "failed");
    assert.deepEqual(result.mail.error_codes, ["mail_bridge_credential_file_missing_or_unsafe"]);
    assert.equal(result.mail_fetched, false);
    assert.equal(result.queues[0].staged_files, 1);
    assert.equal((await listFiles(join(f.dataRoot, "ingress", "mailbox"))).length, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("an authority transition is blocked while a continuous payload lease is active", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority, { mailEnabled: false });
    mail.payload.queues = mail.payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "team_files",
    }));
    await writeFile(join(f.queues.team_files, "stale.payload"), "stale-authority");
    await writeBinding(f, mail.payload);
    let transitionBlocked = false;
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      testHooks: {
        afterQueueFile: async () => {
          if (transitionBlocked) return;
          await assert.rejects(
            revokeWriterAuthority(f, authority, authority.active),
            { code: "writer_authority_continuous_lease_active" },
          );
          transitionBlocked = true;
        },
      },
    });
    assert.equal(transitionBlocked, true);
    assert.equal(result.status, "ok");
    assert.equal((await listFiles(f.acks.team_files)).length, 1);
    assert.equal((await listFiles(join(f.dataRoot, "state", "health"))).length, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a paused live continuous owner cannot be reaped past expiry and dead-owner recovery then proceeds", async () => {
  const f = await fixture();
  let child;
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority, { mailEnabled: false, leaseTtlSeconds: 180 });
    mail.payload.voice.enabled = false;
    mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
    await writeBinding(f, mail.payload);

    const started = AUTHORITY_NOW + 1_000;
    child = await spawnPausedContinuousRun(f.bindingPath, started);
    const leaseRoot = join(f.dataRoot, "state", "leases", "continuous_ingress");
    const lockPath = join(leaseRoot, "active.lock.json");
    const liveLease = JSON.parse(await readFile(lockPath, "utf8"));
    assert.equal(liveLease.owner_host, hostname());
    assert.equal(liveLease.owner_pid, child.pid);
    assert.equal(liveLease.lease_epoch, 1);

    const recoveryNow = started + 181_000;
    await assert.rejects(runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: () => recoveryNow,
    }), { code: "continuous_lease_held" });
    await assert.rejects(revokeWriterAuthority(f, authority, authority.active, { now: recoveryNow }), {
      code: "writer_authority_continuous_lease_active",
    });
    assert.equal(JSON.parse(await readFile(lockPath, "utf8")).fence_token, liveLease.fence_token);

    await stopChild(child);
    let clock = recoveryNow;
    const recovered = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: () => clock++,
    });
    assert.equal(recovered.lease_epoch, 2);
    assert.ok((await readdir(leaseRoot)).some((name) => name.startsWith("stale-")));

    const revoked = await revokeWriterAuthority(f, authority, authority.active, { now: clock + 1 });
    assert.equal(revoked.authority_mode, "off");
  } finally {
    await stopChild(child);
    await rm(f.root, { recursive: true, force: true });
  }
});

test("queue payload final link refuses publication when the continuous lease expires inside the boundary", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.queues.team_files, "expires.payload"), "must-not-publish");
    const payload = binding(f);
    payload.queues = payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "team_files",
    }));
    await writeBinding(f, payload);
    const started = Date.parse("2026-07-20T00:00:00.000Z");
    let clock = started;
    let expired = false;
    await assert.rejects(runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: () => clock++,
      testHooks: {
        onQueueFence: async (context) => {
          if (expired || context.phase !== "before_payload_publish") return;
          expired = true;
          clock = started + 181_000;
        },
      },
    }), { code: "continuous_lease_lost" });
    assert.equal(expired, true);
    assert.equal((await listFiles(join(f.dataRoot, "ingress", "team_files"))).length, 0);
    assert.equal((await listFiles(f.acks.team_files)).length, 0);
    assert.equal((await listFiles(join(f.dataRoot, "state", "receipts", "continuous_ingress"))).length, 0);
    assert.equal((await listFiles(join(f.dataRoot, "state", "health"))).length, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("queue acknowledgement final link refuses publication after lane authority revocation", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority, { mailEnabled: false });
    mail.payload.queues = mail.payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "team_files",
    }));
    await writeFile(join(f.queues.team_files, "revoke.payload"), "staged-before-ack-revocation");
    await writeBinding(f, mail.payload);
    let revoked = false;
    await assert.rejects(runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      testHooks: {
        onQueueFence: async (context) => {
          if (revoked || context.phase !== "before_queue_ack_publish") return;
          revoked = true;
          await adversariallyRevokeDuringRun(f, authority);
        },
      },
    }), (error) => String(error?.code || "").startsWith("writer_authority_"));
    assert.equal(revoked, true);
    assert.equal((await listFiles(f.acks.team_files)).length, 0);
    assert.equal((await listFiles(join(f.dataRoot, "state", "receipts", "continuous_ingress"))).length, 0);
    assert.equal((await listFiles(join(f.dataRoot, "state", "health"))).length, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("voice payload final rename refuses publication when the continuous lease expires inside the boundary", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority, { mailEnabled: false });
    await mkdir(join(f.voiceRoot, "sessions"));
    await writeFile(join(f.voiceRoot, "sessions", "expires.bin"), "voice-must-not-publish");
    mail.payload.voice.enabled = true;
    mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
    await writeBinding(f, mail.payload);
    const started = AUTHORITY_NOW + 1000;
    let clock = started;
    let expired = false;
    await assert.rejects(runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: () => clock++,
      testHooks: {
        onVoiceFence: async (context) => {
          if (expired || context.phase !== "before_payload_publish") return;
          expired = true;
          clock = started + 901_000;
        },
      },
    }), { code: "continuous_lease_lost" });
    assert.equal(expired, true);
    assert.equal((await listFiles(join(f.dataRoot, "ingress", "voice"))).length, 0);
    assert.equal((await listFiles(join(f.dataRoot, "state", "receipts", "voice"))).length, 0);
    assert.equal((await listFiles(join(f.dataRoot, "state", "checkpoints", "voice"))).length, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("run receipt and health final renames refuse publication after expiry and revocation respectively", async () => {
  const expiredFixture = await fixture();
  try {
    const authority = await activateWriterAuthority(expiredFixture);
    const mail = await v2Binding(expiredFixture, authority, { mailEnabled: false });
    mail.payload.queues = mail.payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "run_logs",
    }));
    await writeBinding(expiredFixture, mail.payload);
    const started = AUTHORITY_NOW + 1000;
    let clock = started;
    await assert.rejects(runContinuousIngress({
      bindingPath: expiredFixture.bindingPath,
      apply: true,
      now: () => clock++,
      testHooks: {
        onRunMetadataFence: async (context) => {
          if (context.phase === "before_run_receipt_publish") clock = started + 901_000;
        },
      },
    }), { code: "continuous_lease_lost" });
    assert.equal((await listFiles(join(expiredFixture.dataRoot, "state", "receipts", "continuous_ingress"))).length, 0);
    assert.equal((await listFiles(join(expiredFixture.dataRoot, "state", "health"))).length, 0);
  } finally {
    await rm(expiredFixture.root, { recursive: true, force: true });
  }

  const revokedFixture = await fixture();
  try {
    const authority = await activateWriterAuthority(revokedFixture);
    const mail = await v2Binding(revokedFixture, authority, { mailEnabled: false });
    mail.payload.queues = mail.payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "run_logs",
    }));
    await writeBinding(revokedFixture, mail.payload);
    let revoked = false;
    await assert.rejects(runContinuousIngress({
      bindingPath: revokedFixture.bindingPath,
      apply: true,
      now: advancingClock(),
      testHooks: {
        onRunMetadataFence: async (context) => {
          if (revoked || context.phase !== "before_health_publish") return;
          revoked = true;
          await adversariallyRevokeDuringRun(revokedFixture, authority);
        },
      },
    }), (error) => String(error?.code || "").startsWith("writer_authority_"));
    assert.equal(revoked, true);
    assert.equal((await listFiles(join(revokedFixture.dataRoot, "state", "receipts", "continuous_ingress"))).length, 1);
    assert.equal((await listFiles(join(revokedFixture.dataRoot, "state", "health"))).length, 0);
  } finally {
    await rm(revokedFixture.root, { recursive: true, force: true });
  }
});

test("fallback binding runs only after an off-state promotion to the fallback node", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const revoked = await revokeWriterAuthority(f, authority, authority.active);
    const fallback = await transitionWriterAuthority({
      stateRoot: f.dataRoot,
      recordPath: authority.recordPath,
      action: "promote",
      targetMode: "fallback",
      targetNodeId: "fallback-test-node",
      expectedCurrentEpoch: revoked.epoch,
      expectedCurrentDigest: revoked.authority_digest,
      expectedNodeId: revoked.node_id,
      notBefore: "2026-07-20T00:00:00.000Z",
      expiresAt: "2099-07-20T00:00:00.000Z",
      ownerApprovalRef: "owner-approval://synthetic/continuous-promote-fallback",
      now: AUTHORITY_NOW,
      apply: true,
    });
    const mail = await v2Binding(f, authority, {
      mailEnabled: false,
      writerMode: "fallback",
    });
    mail.payload.node_id = "fallback-test-node";
    mail.payload.voice.enabled = false;
    mail.payload.queues = mail.payload.queues.map((queue) => ({
      ...queue,
      enabled: queue.lane === "team_files",
    }));
    await writeBinding(f, mail.payload);
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
    });
    assert.equal(result.status, "ok");
    assert.equal(result.writer_authority_mode, "fallback");
    assert.equal(result.writer_authority_node_id, "fallback-test-node");
    assert.equal(result.writer_authority_digest, fallback.authority_digest);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("mail-enabled v2 binding requires a lease longer than the bounded child timeout", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority, { leaseTtlSeconds: 600 });
    await writeBinding(f, mail.payload);
    await assert.rejects(loadContinuousBinding(f.bindingPath), {
      code: "continuous_mail_lease_ttl_too_short",
    });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("tampered pinned mail CLI or register fails closed before child spawn", async (t) => {
  for (const target of ["cli", "register"]) {
    await t.test(target, async () => {
      const f = await fixture();
      try {
        const authority = await activateWriterAuthority(f);
        const mail = await v2Binding(f, authority);
        mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
        await writeBinding(f, mail.payload);
        await writeFile(target === "cli" ? mail.teamCliPath : mail.registerPath, "tampered\n");
        let calls = 0;
        const result = await runContinuousIngress({
          bindingPath: f.bindingPath,
          apply: true,
          now: advancingClock(),
          mailExecutor: async () => {
            calls += 1;
            return { exitCode: 0, stdout: JSON.stringify(syntheticMailSummary()), stderr: "" };
          },
        });
        assert.equal(calls, 0);
        assert.equal(result.status, "degraded");
        assert.deepEqual(result.mail.error_codes, [
          target === "cli" ? "mail_bridge_team_cli_digest_mismatch" : "mail_bridge_register_digest_mismatch",
        ]);
        assert.equal((await listFiles(join(f.dataRoot, "ingress", "mailbox"))).length, 0);
      } finally {
        await rm(f.root, { recursive: true, force: true });
      }
    });
  }
});

test("mail child partial and failure outputs are reduced to counts, status, and error codes", async (t) => {
  await t.test("partial", async () => {
    const f = await fixture();
    try {
      const authority = await activateWriterAuthority(f);
      const mail = await v2Binding(f, authority);
      mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
      await writeBinding(f, mail.payload);
      const result = await runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: advancingClock(),
        mailExecutor: async () => ({
          exitCode: 1,
          stdout: JSON.stringify(syntheticMailSummary({
            partial: true,
            mailboxes_run: 0,
            total_events: 0,
            total_new_events: 0,
            total_duplicates: 0,
            errors: [{ code: "mailbox_run_error", message: "PRIVATE MAIL BODY" }],
          })),
          stderr: "PRIVATE PATH AND MAILBOX ID",
        }),
      });
      assert.equal(result.status, "degraded");
      assert.equal(result.mail.status, "partial");
      assert.deepEqual(result.mail.error_codes, ["mailbox_run_error"]);
      assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  await t.test("failure", async () => {
    const f = await fixture();
    try {
      const authority = await activateWriterAuthority(f);
      const mail = await v2Binding(f, authority);
      mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
      await writeBinding(f, mail.payload);
      const result = await runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: advancingClock(),
        mailExecutor: async () => {
          throw new Error("PRIVATE CHILD FAILURE");
        },
      });
      assert.equal(result.status, "degraded");
      assert.equal(result.mail.status, "failed");
      assert.deepEqual(result.mail.error_codes, ["mail_executor_failed"]);
      assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  await t.test("spawned timeout keeps the write count explicitly unknown", async () => {
    const f = await fixture();
    try {
      const authority = await activateWriterAuthority(f);
      const mail = await v2Binding(f, authority);
      mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
      await writeBinding(f, mail.payload);
      const artifact = join(f.root, "child-partial-artifact.bin");
      const result = await runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: advancingClock(),
        mailExecutor: async () => {
          await writeFile(artifact, "synthetic-partial-write");
          return { exitCode: null, timedOut: true, stdout: "", stderr: "PRIVATE" };
        },
      });
      assert.equal(await readFile(artifact, "utf8"), "synthetic-partial-write");
      assert.equal(result.status, "degraded");
      assert.equal(result.mail.status, "failed");
      assert.equal(result.mail.partial, true);
      assert.equal(result.mail.write_count_known, false);
      assert.equal(result.writes_performed, null);
      assert.equal(result.writes_performed_lower_bound, 0);
      assert.equal(result.writes_performed_exact, false);
      assert.deepEqual(result.mail.error_codes, ["mail_child_timeout"]);
      assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  await t.test("source register swap cannot invalidate the captured child operation", async () => {
    const f = await fixture();
    try {
      const authority = await activateWriterAuthority(f);
      const mail = await v2Binding(f, authority);
      mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
      await writeBinding(f, mail.payload);
      const artifact = join(f.dataRoot, "mail-postflight-artifact.bin");
      const result = await runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: advancingClock(),
        mailExecutor: async () => {
          await writeFile(artifact, "synthetic-postflight-write");
          await writeFile(mail.registerPath, "synthetic-postflight-tamper");
          return {
            exitCode: 0,
            timedOut: false,
            stdout: JSON.stringify(syntheticMailSummary()),
            stderr: "PRIVATE",
          };
        },
      });
      assert.equal(await readFile(artifact, "utf8"), "synthetic-postflight-write");
      assert.equal(result.status, "ok");
      assert.equal(result.mail.status, "ok");
      assert.equal(result.mail.spawned, true);
      assert.equal(result.mail.partial, false);
      assert.equal(result.mail.write_count_known, true);
      assert.equal(result.writes_performed_exact, true);
      assert.deepEqual(result.mail.error_codes, []);
      assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  await t.test("contradictory child counts fail closed as an unknown partial run", async (caseGroup) => {
    const cases = [
      {
        name: "events_without_a_mailbox_run",
        summary: {
          partial: true,
          mailboxes_run: 0,
          total_events: 1,
          total_new_events: 1,
          total_duplicates: 0,
          errors: [{ code: "mailbox_run_error" }],
        },
      },
      {
        name: "nonpartial_missing_mailbox_run",
        summary: {
          mailboxes_run: 0,
          total_events: 0,
          total_new_events: 0,
          total_duplicates: 0,
        },
      },
      {
        name: "missing_mailbox_run_without_error",
        summary: {
          partial: true,
          mailboxes_run: 0,
          total_events: 0,
          total_new_events: 0,
          total_duplicates: 0,
        },
      },
      {
        name: "event_partition_mismatch",
        summary: {
          total_events: 1,
          total_new_events: 1,
          total_duplicates: 1,
        },
      },
    ];
    for (const row of cases) {
      await caseGroup.test(row.name, async () => {
        const f = await fixture();
        try {
          const authority = await activateWriterAuthority(f);
          const mail = await v2Binding(f, authority);
          mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
          await writeBinding(f, mail.payload);
          const result = await runContinuousIngress({
            bindingPath: f.bindingPath,
            apply: true,
            now: advancingClock(),
            mailExecutor: async () => ({
              exitCode: 0,
              stdout: JSON.stringify(syntheticMailSummary(row.summary)),
              stderr: "",
            }),
          });
          assert.equal(result.status, "degraded");
          assert.equal(result.mail.status, "failed");
          assert.equal(result.mail.partial, true);
          assert.equal(result.mail.write_count_known, false);
          assert.equal(result.writes_performed, null);
          assert.deepEqual(result.mail.error_codes, ["mail_bridge_child_output_invalid"]);
        } finally {
          await rm(f.root, { recursive: true, force: true });
        }
      });
    }
  });

  await t.test("a disabled mailbox is a valid skipped-only zero-event summary", async () => {
    const f = await fixture();
    try {
      const authority = await activateWriterAuthority(f);
      const mail = await v2Binding(f, authority);
      const registerBytes = `${JSON.stringify({
        schema_version: "email.fetch.team_mailbox_register.v1",
        mailboxes: [{ enabled: false, env_file: "synthetic-mailbox.env" }],
      }, null, 2)}\n`;
      await writeFile(mail.registerPath, registerBytes);
      mail.payload.mail.register_sha256 = digest(registerBytes);
      mail.payload.queues = mail.payload.queues.map((queue) => ({ ...queue, enabled: false }));
      await writeBinding(f, mail.payload);
      const result = await runContinuousIngress({
        bindingPath: f.bindingPath,
        apply: true,
        now: advancingClock(),
        mailExecutor: async () => ({
          exitCode: 0,
          stdout: JSON.stringify(syntheticMailSummary({
            mailboxes_enabled: 0,
            mailboxes_run: 0,
            mailboxes_skipped: 1,
            total_events: 0,
            total_new_events: 0,
            total_duplicates: 0,
          })),
          stderr: "",
        }),
      });
      assert.equal(result.status, "ok");
      assert.equal(result.mail.status, "ok");
      assert.equal(result.mail.partial, false);
      assert.equal(result.mail.write_count_known, true);
      assert.equal(result.writes_performed, 0);
      assert.equal(result.writes_performed_exact, true);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});

test("v2 dry-run performs zero writes and never invokes the mail executor", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const mail = await v2Binding(f, authority);
    await writeFile(join(f.queues.team_files, "dry.bin"), "dry-run-source");
    await writeBinding(f, mail.payload);
    const before = await listFiles(f.dataRoot);
    let calls = 0;
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      now: advancingClock(),
      mailExecutor: async () => {
        calls += 1;
        throw new Error("must not spawn");
      },
    });
    assert.equal(result.status, "dry_run_no_write");
    assert.equal(result.writes_performed, 0);
    assert.equal(result.mail_enabled, true);
    assert.equal(calls, 0);
    assert.deepEqual(await listFiles(f.dataRoot), before);
    const { stdout } = await execFile(process.execPath, [CLI, "--config", f.bindingPath], { cwd: dirname(CLI) });
    const safe = JSON.parse(stdout);
    assert.equal(safe.status, "dry_run_no_write");
    assert.equal(safe.mailboxes_run, 0);
    for (const forbidden of [f.root, mail.registerPath, "synthetic-mailbox", "synthetic@example.test"]) {
      assert.equal(stdout.includes(forbidden), false);
    }
    assert.deepEqual(await listFiles(f.dataRoot), before);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("PLAUD v3 stays feature-OFF without a private profile or provider call", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const plaud = await v3Binding(f, authority, { plaudEnabled: false });
    plaud.payload.queues = plaud.payload.queues.map((queue) => ({ ...queue, enabled: false }));
    await writeBinding(f, plaud.payload);
    let calls = 0;
    const dryRun = await runContinuousIngress({
      bindingPath: f.bindingPath,
      plaudSyncRunner: async () => { calls += 1; },
    });
    assert.equal(dryRun.status, "dry_run_no_write");
    assert.equal(dryRun.plaud_enabled, false);
    assert.equal(dryRun.plaud_status, "disabled");
    assert.equal(dryRun.plaud_writer_enabled, false);
    assert.equal(calls, 0);
    const { stdout } = await execFile(process.execPath, [CLI, "--config", f.bindingPath], { cwd: dirname(CLI) });
    const safe = JSON.parse(stdout);
    assert.equal(safe.plaud_enabled, false);
    assert.equal(safe.plaud_status, "disabled");
    assert.equal(safe.plaud_writer_enabled, false);
    assert.equal(safe.plaud_raw_written, false);
    assert.equal(stdout.includes(f.root), false);

    const applied = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      plaudSyncRunner: async () => { calls += 1; },
    });
    assert.equal(applied.plaud.status, "disabled");
    assert.equal(applied.plaud.raw_written, false);
    assert.equal(applied.plaud.writer_enabled, false);
    assert.equal(calls, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("PLAUD v3 observes provider backlog inside the existing fenced cycle without RAW writes", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const plaud = await v3Binding(f, authority);
    plaud.payload.queues = plaud.payload.queues.map((queue) => ({ ...queue, enabled: false }));
    await writeBinding(f, plaud.payload);
    const calls = [];
    const commandCalls = [];
    const result = await runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      plaudCommandRunner: (command, args, options) => {
        commandCalls.push({ command, args, options });
        return "synthetic";
      },
      plaudSyncRunner: async (options) => {
        calls.push(options);
        options.commandRunner("plaud", ["recent"], { cwd: f.root });
        return {
          ok: true,
          applied: false,
          recent_count: 20,
          existing_provider_id_count: 6,
          new_candidate_count: 14,
          candidate_count: 14,
          recordings: [
            ...Array.from({ length: 4 }, (_, index) => ({ id: `private-ready-${index}`, name: "private title", state: "ready_to_import" })),
            ...Array.from({ length: 10 }, (_, index) => ({ id: `private-pending-${index}`, state: "pending_provider_processing" })),
          ],
        };
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].apply, false);
    assert.equal(calls[0].profile.max_new_per_run, 20);
    assert.equal(commandCalls[0].options.timeoutMs, 15000);
    assert.equal(result.plaud.status, "ok");
    assert.equal(result.plaud.ready_to_import_count, 4);
    assert.equal(result.plaud.pending_provider_processing_count, 10);
    assert.equal(result.plaud.raw_written, false);
    assert.equal(result.plaud.cutover_ready, false);
    assert.equal(result.writes_performed, 0);
    assert.equal(JSON.stringify(result).includes("private"), false);

    const health = JSON.parse(await readFile(join(f.dataRoot, "state", "health", "continuous_ingress.json"), "utf8"));
    assert.equal(health.plaud_enabled, true);
    assert.equal(health.plaud_ready_to_import_count, 4);
    assert.equal(health.plaud_writer_enabled, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("PLAUD v3 rejects profile drift, writer enablement, and missing voice authority before provider access", async () => {
  const f = await fixture();
  try {
    const authority = await activateWriterAuthority(f);
    const plaud = await v3Binding(f, authority);
    plaud.payload.queues = plaud.payload.queues.map((queue) => ({ ...queue, enabled: false }));
    await writeBinding(f, plaud.payload);

    await writeFile(plaud.profilePath, `${JSON.stringify({ ...buildDefaultPlaudSyncProfile(), poll_days: 1 })}\n`);
    await assert.rejects(loadContinuousBinding(f.bindingPath), { code: "continuous_plaud_profile_digest_mismatch" });

    const invalidProfileBytes = `${JSON.stringify({
      ...buildDefaultPlaudSyncProfile(),
      max_new_per_run: -1,
    }, null, 2)}\n`;
    await writeFile(plaud.profilePath, invalidProfileBytes);
    plaud.payload.plaud.profile_sha256 = digest(invalidProfileBytes);
    await writeBinding(f, plaud.payload);
    await assert.rejects(loadContinuousBinding(f.bindingPath), { code: "continuous_plaud_profile_invalid" });

    plaud.payload.plaud.writer_enabled = true;
    await writeBinding(f, plaud.payload);
    await assert.rejects(loadContinuousBinding(f.bindingPath), { code: "continuous_plaud_writer_not_implemented" });

    plaud.payload.plaud.writer_enabled = false;
    const originalProfile = {
      ...buildDefaultPlaudSyncProfile(),
      register_library: false,
      write_workmeta_draft: false,
    };
    const profileBytes = `${JSON.stringify(originalProfile, null, 2)}\n`;
    await writeFile(plaud.profilePath, profileBytes);
    plaud.payload.plaud.profile_sha256 = digest(profileBytes);
    await writeBinding(f, plaud.payload);
    await revokeWriterAuthority(f, authority, authority.active);
    let calls = 0;
    await assert.rejects(runContinuousIngress({
      bindingPath: f.bindingPath,
      apply: true,
      now: advancingClock(),
      plaudSyncRunner: async () => { calls += 1; },
    }), { code: "writer_authority_mode_off" });
    assert.equal(calls, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("public continuous binding schema accepts exact v1, v2, and v3 shapes only", async () => {
  const f = await fixture();
  try {
    const schemaPath = fileURLToPath(new URL("./continuous_binding.schema.json", import.meta.url));
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
    assert.equal(validate(binding(f)), true, JSON.stringify(validate.errors));
    const mail = await v2Binding(f, {
      recordPath: join(f.dataRoot, "state", "writer_authority", "active.json"),
    });
    assert.equal(validate(mail.payload), true, JSON.stringify(validate.errors));
    const plaud = await v3Binding(f, {
      recordPath: join(f.dataRoot, "state", "writer_authority", "active.json"),
    });
    assert.equal(validate(plaud.payload), true, JSON.stringify(validate.errors));
    assert.equal(validate({ ...mail.payload, unexpected: true }), false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
