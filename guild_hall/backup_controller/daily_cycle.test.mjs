import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DAILY_CYCLE_STAGE_IDS, STAGE_COMMAND_IDS, dailyCycleController, seedController } from "./controller.mjs";

const NOW = "2026-07-20T00:15:00.000Z";
const RECEIPT_SHA256 = "a".repeat(64);

function dailyBinding(stateRoot) {
  const root = path.dirname(stateRoot);
  const uncPrefix = "\\\\RaiDrive-test\\Synology";
  const nas = (leaf) => ({ kind: "raidrive_network_directory", path: path.join(uncPrefix, "backup-controller-tests", path.basename(root), leaf), unc_prefix: uncPrefix });
  return {
    schema_version: "soulforge.backup_controller.binding.v1",
    controller_id: "soulforge-backup-controller",
    feature_state: "on",
    automation: { name: "Soulforge Backup Controller", mode: "daily_cycle", local_time: "09:15", timezone: "Asia/Seoul", ignore_new: true },
    writer: { node_id: "hpp-primary", hostname: "hpp-host-test", platform: "win32", role: "hpp", mode: "writer" },
    mac: { node_id: "mac-monitor", mode: "fallback_hold", takeover_allowed: false },
    state_root: stateRoot,
    resources: {
      hpp_data_root: { kind: "directory", path: path.join(root, "hpp-data") },
      hpp_recovery_policy: { kind: "pinned_file", path: path.join(root, "control", "policy.json"), sha256: "b".repeat(64) },
      hpp_restore_test_root: { kind: "directory", path: path.join(root, "hpp-restore") },
      runtime_checkout_root: { kind: "directory", path: path.join(root, "runtime") },
      workspace_root: { kind: "onedrive_cloud_directory", path: path.join(root, "workspace"), reparse_profile: "microsoft_onedrive_cloud_0x9000601a" },
      erp_db_file: { kind: "file", path: path.join(root, "erp", "dev-erp.db") },
      project_metadata_root: { kind: "directory", path: path.join(root, "project-metadata") },
      cross_project_state_root: { kind: "directory", path: path.join(root, "cross-project-state") },
      nas_hpp_backup_root: nas("hpp"),
      nas_workspace_backup_root: nas("workspace"),
      nas_erp_backup_root: nas("erp"),
      nas_restore_root: nas("restore"),
      nas_report_root: nas("report"),
    },
    activation: { approval_ref: "approval-daily-cycle-test-v1", not_before: "2026-07-19T00:00:00.000Z", seed_receipts: Object.fromEntries(Object.keys(STAGE_COMMAND_IDS).map((stageId) => [stageId, null])) },
    stages: DAILY_CYCLE_STAGE_IDS.map((stageId) => ({
      stage_id: stageId,
      cadence: stageId === "weekly_restore" ? "weekly" : "daily",
      ...(stageId === "weekly_restore" ? { day_of_week: "mon" } : {}),
      local_time: "09:15",
      deadline_minutes: 600,
      max_runtime_seconds: 60,
      command_id: STAGE_COMMAND_IDS[stageId],
    })),
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-backup-daily-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateRoot = path.join(root, "control-state");
  const binding = dailyBinding(stateRoot);
  const bindingRef = path.join(root, "binding.json");
  const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
  await writeFile(bindingRef, bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const common = { bindingRef, expectedBindingSha256: digest, approvalRef: binding.activation.approval_ref, now: NOW };
  await seedController({ ...common, apply: true });
  return { root, stateRoot, binding, bindingRef, digest, common };
}

function successfulExecutors(calls) {
  return Object.fromEntries(Object.values(STAGE_COMMAND_IDS).map((commandId) => [commandId, async (context) => {
    calls.push(context.stage_id);
    return { ok: true, receipt_at: NOW, receipt_sha256: RECEIPT_SHA256 };
  }]));
}

test("one daily wakeup runs all five handlers in critical-first order", async (t) => {
  const fx = await fixture(t);
  const calls = [];
  const output = await dailyCycleController({ ...fx.common, apply: true, executors: successfulExecutors(calls) });
  assert.equal(output.status, "succeeded");
  assert.deepEqual(calls, ["hpp_snapshot", "erp_backup", "health", "weekly_restore", "workspace_copy"]);
  assert.equal(output.stage_results.length, 5);
  const repeated = await dailyCycleController({ ...fx.common, apply: true, executors: successfulExecutors(calls) });
  assert.equal(repeated.status, "no_due_stage");
  assert.equal(calls.length, 5);
});

test("workspace failure is last and preserves four critical receipts", async (t) => {
  const fx = await fixture(t);
  const calls = [];
  const executors = successfulExecutors(calls);
  executors.workspace_copy_v1 = async (context) => {
    calls.push(context.stage_id);
    throw Object.assign(new Error("synthetic"), { code: "workspace_copy_failed" });
  };
  const output = await dailyCycleController({ ...fx.common, apply: true, executors });
  assert.equal(output.status, "completed_with_warning");
  assert.deepEqual(calls, ["hpp_snapshot", "erp_backup", "health", "weekly_restore", "workspace_copy"]);
  const state = JSON.parse(await readFile(path.join(fx.stateRoot, "backup-controller.state.json"), "utf8"));
  for (const stageId of ["hpp_snapshot", "erp_backup", "health", "weekly_restore"]) assert.equal(state.stages[stageId].status, "succeeded");
  assert.equal(state.stages.workspace_copy.status, "failed");
});

test("a persisted running stage reconciles its external receipt after a crash", async (t) => {
  const fx = await fixture(t);
  const stateRef = path.join(fx.stateRoot, "backup-controller.state.json");
  const state = JSON.parse(await readFile(stateRef, "utf8"));
  const operationKey = `backup-operation-${createHash("sha256").update([fx.digest, "hpp_snapshot", "2026-07-20"].join("\0")).digest("hex")}`;
  state.stages.hpp_snapshot = {
    status: "running",
    last_period_key: null,
    last_receipt_at: null,
    last_receipt_sha256: null,
    attempt: 1,
    checkpoint: { phase: "executing", period_key: "2026-07-20", attempt: 1, started_at: NOW, deadline_at: "2026-07-20T10:15:00.000Z", operation_key: operationKey, fence_token: "22222222-2222-4222-8222-222222222222" },
    last_error_code: null,
  };
  state.revision += 1;
  await writeFile(stateRef, `${JSON.stringify(state, null, 2)}\n`);
  const calls = [];
  const output = await dailyCycleController({
    ...fx.common,
    apply: true,
    executors: successfulExecutors(calls),
    receiptReconciler: async (context) => {
      assert.equal(context.operation_key, operationKey);
      assert.equal(context.expected_fence_token, "22222222-2222-4222-8222-222222222222");
      return { ok: true, receipt_at: NOW, receipt_sha256: RECEIPT_SHA256 };
    },
  });
  assert.equal(output.status, "succeeded");
  assert.deepEqual(calls, ["erp_backup", "health", "weekly_restore", "workspace_copy"]);
  assert.equal(JSON.parse(await readFile(stateRef, "utf8")).stages.hpp_snapshot.status, "succeeded");
});

test("only a same-host expired dead-PID lease can be replaced", async (t) => {
  const fx = await fixture(t);
  const leaseRef = path.join(fx.stateRoot, "backup-controller.tick.lease");
  await mkdir(fx.stateRoot, { recursive: true });
  await writeFile(leaseRef, `${JSON.stringify({ schema_version: "soulforge.backup_controller.lease.v2", token: "33333333-3333-4333-8333-333333333333", operation_key: "backup-controller-stale-cycle", hostname: "hpp-host-test", platform: "win32", pid: 999999, created_at: "2026-07-18T00:00:00.000Z", deadline_at: "2026-07-19T00:00:00.000Z" })}\n`);
  const calls = [];
  const output = await dailyCycleController({ ...fx.common, apply: true, executors: successfulExecutors(calls), leaseRuntime: { isPidAlive: async () => false, pid: 4444 } });
  assert.equal(output.status, "succeeded");
  assert.equal(calls.length, 5);
  await writeFile(leaseRef, `${JSON.stringify({ schema_version: "soulforge.backup_controller.lease.v2", token: "55555555-5555-4555-8555-555555555555", operation_key: "backup-controller-foreign-cycle", hostname: "other-host", platform: "win32", pid: 999998, created_at: "2026-07-18T00:00:00.000Z", deadline_at: "2026-07-19T00:00:00.000Z" })}\n`);
  const held = await dailyCycleController({ ...fx.common, apply: true, executors: successfulExecutors([]), leaseRuntime: { isPidAlive: async () => false, pid: 4444 } });
  assert.equal(held.status, "ignore_new_lease_held");
});
