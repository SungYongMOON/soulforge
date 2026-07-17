import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  CONTINUOUS_BINDING_SCHEMA,
  CONTINUOUS_EPOCH_SCHEMA,
  CONTINUOUS_LEASE_SCHEMA,
  loadContinuousBinding,
  runContinuousIngress,
} from "./continuous_runner.mjs";

const execFile = promisify(execFileCallback);
const CLI = fileURLToPath(new URL("./continuous_cli.mjs", import.meta.url));

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
  await mkdir(dataRoot);
  await mkdir(sourceRoot);
  await mkdir(voiceRoot);
  for (const path of Object.values(queues)) await mkdir(path);
  await writeManifest(dataRoot);
  const bindingPath = join(root, "binding.json");
  return { root, dataRoot, sourceRoot, voiceRoot, queues, bindingPath };
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
    assert.equal(first.queues.reduce((sum, row) => sum + row.writes_performed, 0), 9);
    assert.equal(first.source_deleted, false);
    assert.equal(first.erp_written, false);
    assert.equal(await listFiles(join(f.dataRoot, "state", "leases", "continuous_ingress", "active.lock.json")).then((rows) => rows.length), 0);

    clock += 1000;
    const second = await runContinuousIngress({ bindingPath: f.bindingPath, apply: true, now });
    assert.equal(second.status, "ok");
    assert.equal(second.queues.reduce((sum, row) => sum + row.unchanged_files, 0), 3);
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

test("active lease blocks a second writer and expired lease increments the fence", async () => {
  const f = await fixture();
  try {
    await writeBinding(f, binding(f));
    const leaseRoot = join(f.dataRoot, "state", "leases", "continuous_ingress");
    await mkdir(leaseRoot, { recursive: true });
    const active = {
      schema_version: CONTINUOUS_LEASE_SCHEMA,
      node_id: "other-node",
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

    active.expires_at = "2026-07-16T23:00:00.000Z";
    await writeFile(join(leaseRoot, "active.lock.json"), `${JSON.stringify(active)}\n`);
    await writeFile(join(leaseRoot, "epoch.json"), `${JSON.stringify({
      schema_version: CONTINUOUS_EPOCH_SCHEMA,
      last_epoch: 4,
      updated_at: "2026-07-16T23:00:00.000Z",
    })}\n`);
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
    for (const forbidden of [f.root, f.dataRoot, f.sourceRoot, "team_files-owner"]) {
      assert.ok(!stdout.includes(forbidden));
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
