import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BackupControllerError,
  STAGE_COMMAND_IDS,
  seedController,
  tickController,
} from "./controller.mjs";

const NOW = "2026-07-20T00:15:00.000Z";
const RECEIPT_SHA256 = "a".repeat(64);

function makeBinding(stateRoot, overrides = {}) {
  const resourceRoot = path.dirname(stateRoot);
  const uncPrefix = "\\\\RaiDrive-test\\Synology";
  const nas = (leaf) => ({ kind: "raidrive_network_directory", path: path.join(uncPrefix, "backup-controller-tests", path.basename(resourceRoot), leaf), unc_prefix: uncPrefix });
  const stages = [
    { stage_id: "hpp_snapshot", cadence: "daily", local_time: "05:15", deadline_minutes: 600, max_runtime_seconds: 60, command_id: "hpp_snapshot_v1" },
    { stage_id: "workspace_copy", cadence: "daily", local_time: "06:15", deadline_minutes: 600, max_runtime_seconds: 60, command_id: "workspace_copy_v1" },
    { stage_id: "erp_backup", cadence: "daily", local_time: "07:15", deadline_minutes: 600, max_runtime_seconds: 60, command_id: "erp_backup_v1" },
    { stage_id: "health", cadence: "daily", local_time: "08:15", deadline_minutes: 600, max_runtime_seconds: 60, command_id: "backup_health_v1" },
    { stage_id: "weekly_restore", cadence: "weekly", day_of_week: "mon", local_time: "09:15", deadline_minutes: 600, max_runtime_seconds: 60, command_id: "isolated_restore_v1" },
  ];
  const binding = {
    schema_version: "soulforge.backup_controller.binding.v1",
    controller_id: "soulforge-backup-controller",
    feature_state: "on",
    automation: { name: "Soulforge Backup Controller", mode: "hourly_tick", minute: 15, timezone: "Asia/Seoul", ignore_new: true },
    writer: { node_id: "hpp-primary", hostname: "hpp-host-test", platform: "win32", role: "hpp", mode: "writer" },
    mac: { node_id: "mac-monitor", mode: "fallback_hold", takeover_allowed: false },
    state_root: stateRoot,
    resources: {
      hpp_data_root: { kind: "directory", path: path.join(resourceRoot, "hpp-data") },
      hpp_recovery_policy: { kind: "pinned_file", path: path.join(resourceRoot, "hpp-recovery-policy.json"), sha256: "b".repeat(64) },
      hpp_restore_test_root: { kind: "directory", path: path.join(resourceRoot, "hpp-restore-test") },
      runtime_checkout_root: { kind: "directory", path: path.join(resourceRoot, "runtime-checkout") },
      workspace_root: { kind: "onedrive_cloud_directory", path: path.join(resourceRoot, "workspaces"), reparse_profile: "microsoft_onedrive_cloud_0x9000601a" },
      erp_db_file: { kind: "file", path: path.join(resourceRoot, "erp", "dev-erp.db") },
      project_metadata_root: { kind: "directory", path: path.join(resourceRoot, "project-metadata") },
      cross_project_state_root: { kind: "directory", path: path.join(resourceRoot, "cross-project-state") },
      nas_hpp_backup_root: nas("hpp-backups"),
      nas_workspace_backup_root: nas("workspace-backups"),
      nas_erp_backup_root: nas("erp-backups"),
      nas_restore_root: nas("restore-tests"),
      nas_report_root: nas("reports"),
    },
    activation: {
      approval_ref: "approval-backup-controller-test-v1",
      not_before: "2026-07-19T00:00:00.000Z",
      seed_receipts: Object.fromEntries(Object.keys(STAGE_COMMAND_IDS).map((stageId) => [stageId, null])),
    },
    stages,
  };
  return Object.assign(binding, overrides);
}

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-backup-controller-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bindingRef = path.join(root, "backup-controller.binding.json");
  const stateRoot = path.join(root, "state");
  const binding = makeBinding(stateRoot, overrides);
  const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`, "utf8");
  await writeFile(bindingRef, bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const common = {
    bindingRef,
    expectedBindingSha256: digest,
    approvalRef: binding.activation.approval_ref,
    now: NOW,
  };
  return { root, stateRoot, bindingRef, binding, digest, common };
}

async function seed(fx) {
  return seedController({ ...fx.common, apply: true });
}

function successExecutors(calls = []) {
  return Object.fromEntries(Object.values(STAGE_COMMAND_IDS).map((commandId) => [commandId, async (context) => {
    calls.push(context);
    return { ok: true, receipt_at: NOW, receipt_sha256: RECEIPT_SHA256 };
  }]));
}

test("tick chooses only the first due stage in deterministic order", async (t) => {
  const fx = await fixture(t);
  await seed(fx);
  const calls = [];
  const executors = successExecutors(calls);
  const first = await tickController({ ...fx.common, apply: true, executors });
  assert.equal(first.status, "succeeded");
  assert.equal(first.selected_stage, "hpp_snapshot");
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].resources), ["runtime_checkout_root", "hpp_data_root", "hpp_recovery_policy", "hpp_restore_test_root", "nas_hpp_backup_root", "nas_report_root"]);
  assert.equal(calls[0].resources.hpp_data_root.path, fx.binding.resources.hpp_data_root.path);
  assert.equal(JSON.stringify(first).includes(fx.binding.resources.hpp_data_root.path), false);
  assert.match(calls[0].operation_key, /^backup-operation-[a-f0-9]{64}$/);
  assert.match(calls[0].fence_token, /^[a-f0-9-]{36}$/);
  assert.equal(calls[0].signal instanceof AbortSignal, true);
  assert.equal(calls[0].signal.aborted, false);

  const second = await tickController({ ...fx.common, apply: true, executors });
  assert.equal(second.selected_stage, "workspace_copy");
  assert.equal(calls.length, 2);
});

test("completed periods are idempotent", async (t) => {
  const fx = await fixture(t);
  await seed(fx);
  const calls = [];
  const executors = successExecutors(calls);
  for (let index = 0; index < 5; index += 1) {
    const output = await tickController({ ...fx.common, apply: true, executors });
    assert.equal(output.status, "succeeded");
  }
  const repeated = await tickController({ ...fx.common, apply: true, executors });
  assert.equal(repeated.status, "no_due_stage");
  assert.equal(calls.length, 5);
  assert.equal(calls[0].period_key, "2026-07-20");
});

test("an hourly tick catches up a missed run inside the deadline", async (t) => {
  const fx = await fixture(t);
  await seed(fx);
  const calls = [];
  const output = await tickController({
    ...fx.common,
    now: "2026-07-20T01:15:00.000Z",
    apply: true,
    executors: successExecutors(calls),
  });
  assert.equal(output.status, "succeeded");
  assert.equal(output.selected_stage, "hpp_snapshot");
  assert.equal(output.period_key, "2026-07-20");
  assert.equal(calls.length, 1);
});

test("hard overlap and deadline gates prevent dispatch", async (t) => {
  const fx = await fixture(t);
  await seed(fx);
  const stateRef = path.join(fx.stateRoot, "backup-controller.state.json");
  const state = JSON.parse(await readFile(stateRef, "utf8"));
  state.stages.hpp_snapshot = {
    status: "running",
    last_period_key: null,
    last_receipt_at: null,
    last_receipt_sha256: null,
    attempt: 1,
    checkpoint: { phase: "executing", period_key: "2026-07-20", attempt: 1, started_at: NOW, deadline_at: "2026-07-20T03:00:00.000Z", operation_key: `backup-operation-${"c".repeat(64)}`, fence_token: "11111111-1111-4111-8111-111111111111" },
    last_error_code: null,
  };
  state.revision += 1;
  await writeFile(stateRef, `${JSON.stringify(state, null, 2)}\n`);
  let dispatches = 0;
  const overlap = await tickController({ ...fx.common, apply: true, executors: { hpp_snapshot_v1: async () => { dispatches += 1; return { ok: true }; } } });
  assert.equal(overlap.status, "resume_required");
  assert.equal(dispatches, 0);

  state.stages.hpp_snapshot.status = "never";
  state.stages.hpp_snapshot.attempt = 0;
  state.stages.hpp_snapshot.checkpoint = null;
  state.revision += 1;
  await writeFile(stateRef, `${JSON.stringify(state, null, 2)}\n`);
  fx.binding.stages[0].deadline_minutes = 240;
  fx.binding.stages[0].max_runtime_seconds = 120;
  const bytes = Buffer.from(`${JSON.stringify(fx.binding, null, 2)}\n`);
  await writeFile(fx.bindingRef, bytes);
  const changedDigest = createHash("sha256").update(bytes).digest("hex");
  state.binding_sha256 = changedDigest;
  await writeFile(stateRef, `${JSON.stringify(state, null, 2)}\n`);
  const deadline = await tickController({
    bindingRef: fx.bindingRef,
    apply: true,
    expectedBindingSha256: changedDigest,
    approvalRef: fx.binding.activation.approval_ref,
    now: "2026-07-20T00:14:00.000Z",
    executors: successExecutors(),
  });
  assert.equal(deadline.status, "skipped_deadline");
  assert.equal(deadline.selected_stage, "hpp_snapshot");
  assert.equal(deadline.command_dispatched, false);
});

test("a failed stage remains retryable and resumes the same period", async (t) => {
  const fx = await fixture(t);
  await seed(fx);
  let calls = 0;
  const contexts = [];
  const executors = {
    hpp_snapshot_v1: async (context) => {
      calls += 1;
      contexts.push(context);
      if (calls === 1) throw Object.assign(new Error("private detail must not escape"), { code: "synthetic_failure" });
      assert.equal(context.attempt, 2);
      return { ok: true, receipt_at: NOW, receipt_sha256: RECEIPT_SHA256 };
    },
  };
  const failed = await tickController({ ...fx.common, apply: true, executors });
  assert.equal(failed.status, "failed_retry_pending");
  assert.equal(failed.error_code, "synthetic_failure");
  assert.equal(JSON.stringify(failed).includes("private detail"), false);
  const retried = await tickController({ ...fx.common, apply: true, executors });
  assert.equal(retried.status, "succeeded");
  assert.equal(retried.selected_stage, "hpp_snapshot");
  assert.equal(calls, 2);
  assert.equal(contexts[0].operation_key, contexts[1].operation_key);
  assert.notEqual(contexts[0].fence_token, contexts[1].fence_token);
});

test("apply rejects a binding digest mismatch before creating state", async (t) => {
  const fx = await fixture(t);
  await assert.rejects(
    seedController({ ...fx.common, expectedBindingSha256: "0".repeat(64), apply: true }),
    (error) => error instanceof BackupControllerError && error.code === "binding_digest_mismatch",
  );
  await assert.rejects(readFile(path.join(fx.stateRoot, "backup-controller.state.json")), { code: "ENOENT" });
});

test("dry-run and feature-OFF tick perform no state writes", async (t) => {
  const fx = await fixture(t, { feature_state: "off" });
  const output = await tickController({ bindingRef: fx.bindingRef, now: NOW });
  assert.equal(output.status, "feature_off");
  assert.equal(output.write_performed, false);
  const seedOutput = await seedController({ ...fx.common, apply: true });
  assert.equal(seedOutput.status, "feature_off");
  await assert.rejects(readFile(path.join(fx.stateRoot, "backup-controller.state.json")), { code: "ENOENT" });
});

test("secret-like binding-owned state paths are rejected", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-backup-controller-path-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bindingRef = path.join(root, "binding.json");
  await writeFile(bindingRef, JSON.stringify(makeBinding(path.join(root, "secrets", "backup-state"))));
  await assert.rejects(
    tickController({ bindingRef, now: NOW }),
    (error) => error instanceof BackupControllerError && error.code === "secret_like_path_rejected",
  );
});

test("secret-like operational resource paths are rejected", async (t) => {
  const fx = await fixture(t);
  fx.binding.resources.erp_db_file.path = path.join(fx.root, "credentials", "dev-erp.db");
  await writeFile(fx.bindingRef, JSON.stringify(fx.binding));
  await assert.rejects(
    tickController({ bindingRef: fx.bindingRef, now: NOW }),
    (error) => error instanceof BackupControllerError && error.code === "secret_like_path_rejected",
  );
});

test("binding validation rejects unknown authority and Mac takeover fields", async (t) => {
  const fx = await fixture(t);
  fx.binding.mac.takeover_allowed = true;
  fx.binding.unreviewed_command = "delete everything";
  await writeFile(fx.bindingRef, JSON.stringify(fx.binding));
  await assert.rejects(
    tickController({ bindingRef: fx.bindingRef, now: NOW }),
    (error) => error instanceof BackupControllerError && error.code === "binding_shape_invalid",
  );
});

test("binding validation rejects two stages assigned to one hourly slot", async (t) => {
  const fx = await fixture(t);
  fx.binding.stages[1].local_time = fx.binding.stages[0].local_time;
  await writeFile(fx.bindingRef, JSON.stringify(fx.binding));
  await assert.rejects(
    tickController({ bindingRef: fx.bindingRef, now: NOW }),
    (error) => error instanceof BackupControllerError && error.code === "binding_stage_tick_collision",
  );
});

test("binding validation rejects inverted daily and weekly cadence", async (t) => {
  const fx = await fixture(t);
  fx.binding.stages[0].cadence = "weekly";
  fx.binding.stages[0].day_of_week = "mon";
  await writeFile(fx.bindingRef, JSON.stringify(fx.binding));
  await assert.rejects(
    tickController({ bindingRef: fx.bindingRef, now: NOW }),
    (error) => error instanceof BackupControllerError && error.code === "binding_stage_cadence_invalid",
  );
});

test("seed receipt binds an exact due occurrence and rejects pre-due completion", async (t) => {
  const fx = await fixture(t);
  fx.binding.activation.not_before = NOW;
  fx.binding.activation.seed_receipts.hpp_snapshot = {
    period_key: "2026-07-20",
    completed_at: "2026-07-19T19:00:00.000Z",
    receipt_sha256: RECEIPT_SHA256,
  };
  await writeFile(fx.bindingRef, JSON.stringify(fx.binding));
  await assert.rejects(
    tickController({ bindingRef: fx.bindingRef, now: NOW }),
    (error) => error instanceof BackupControllerError && error.code === "binding_seed_receipt_before_due",
  );
});

test("exclusive lease implements IgnoreNew and prevents a second writer", async (t) => {
  const fx = await fixture(t);
  await seed(fx);
  let start;
  let release;
  const started = new Promise((resolve) => { start = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  const first = tickController({
    ...fx.common,
    apply: true,
    executors: { hpp_snapshot_v1: async () => { start(); await held; return { ok: true, receipt_at: NOW, receipt_sha256: RECEIPT_SHA256 }; } },
  });
  await started;
  const second = await tickController({ ...fx.common, apply: true, executors: successExecutors() });
  assert.equal(second.status, "ignore_new_lease_held");
  assert.equal(second.write_performed, false);
  release();
  assert.equal((await first).status, "succeeded");
});

test("approved metadata seed is idempotent and prevents immediate legacy reruns", async (t) => {
  const receipts = Object.fromEntries(Object.keys(STAGE_COMMAND_IDS).map((stageId) => [stageId, {
    period_key: "2026-07-20",
    completed_at: NOW,
    receipt_sha256: RECEIPT_SHA256,
  }]));
  const fx = await fixture(t);
  fx.binding.activation.not_before = NOW;
  fx.binding.activation.seed_receipts = receipts;
  const bytes = Buffer.from(`${JSON.stringify(fx.binding, null, 2)}\n`);
  await writeFile(fx.bindingRef, bytes);
  fx.common.expectedBindingSha256 = createHash("sha256").update(bytes).digest("hex");
  const first = await seedController({ ...fx.common, apply: true });
  assert.equal(first.status, "seeded");
  const stateRef = path.join(fx.stateRoot, "backup-controller.state.json");
  const before = await readFile(stateRef, "utf8");
  const second = await seedController({ ...fx.common, apply: true });
  assert.equal(second.status, "already_seeded");
  assert.equal(await readFile(stateRef, "utf8"), before);
  const tick = await tickController({ ...fx.common, apply: true, executors: successExecutors() });
  assert.equal(tick.status, "no_due_stage");
});
