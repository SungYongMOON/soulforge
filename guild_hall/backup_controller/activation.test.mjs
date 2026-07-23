import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveActivation } from "./activation.mjs";
import { runDailyAutomation } from "./automation.mjs";
import { BackupControllerError, DAILY_CYCLE_STAGE_IDS, STAGE_COMMAND_IDS } from "./controller.mjs";

const NOW = new Date("2026-07-20T00:15:00.000Z");

function bindingFor(root, featureState = "off") {
  const uncPrefix = "\\\\RaiDrive-test\\Synology";
  const nas = (name) => ({ kind: "raidrive_network_directory", path: path.join(uncPrefix, "backup-controller-tests", path.basename(root), name), unc_prefix: uncPrefix });
  return {
    schema_version: "soulforge.backup_controller.binding.v1",
    controller_id: "soulforge-backup-controller",
    feature_state: featureState,
    automation: { name: "Soulforge Backup Controller", mode: "daily_cycle", local_time: "09:15", timezone: "Asia/Seoul", ignore_new: true },
    writer: { node_id: "hpp-primary", hostname: "hpp-host-test", platform: "win32", role: "hpp", mode: "writer" },
    mac: { node_id: "mac-monitor", mode: "fallback_hold", takeover_allowed: false },
    state_root: path.join(root, "control", "state"),
    resources: {
      hpp_data_root: { kind: "directory", path: path.join(root, "hpp") },
      hpp_recovery_policy: { kind: "pinned_file", path: path.join(root, "control", "policy.json"), sha256: "a".repeat(64) },
      hpp_restore_test_root: { kind: "directory", path: path.join(root, "restore") },
      runtime_checkout_root: { kind: "directory", path: path.join(root, "runtime") },
      workspace_root: { kind: "onedrive_cloud_directory", path: path.join(root, "workspace"), reparse_profile: "microsoft_onedrive_cloud_0x9000601a" },
      erp_db_file: { kind: "file", path: path.join(root, "erp", "db.sqlite") },
      project_metadata_root: { kind: "directory", path: path.join(root, "metadata") },
      cross_project_state_root: { kind: "directory", path: path.join(root, "private-state") },
      nas_hpp_backup_root: nas("hpp"),
      nas_workspace_backup_root: nas("workspace"),
      nas_erp_backup_root: nas("erp"),
      nas_restore_root: nas("restore"),
      nas_report_root: nas("report"),
    },
    activation: { approval_ref: "approval-external-sidecar-v1", not_before: "2026-07-19T00:00:00.000Z", seed_receipts: Object.fromEntries(Object.keys(STAGE_COMMAND_IDS).map((id) => [id, null])) },
    stages: DAILY_CYCLE_STAGE_IDS.map((stageId) => ({ stage_id: stageId, cadence: stageId === "weekly_restore" ? "weekly" : "daily", ...(stageId === "weekly_restore" ? { day_of_week: "mon" } : {}), local_time: "09:15", deadline_minutes: 600, max_runtime_seconds: 60, command_id: STAGE_COMMAND_IDS[stageId] })),
  };
}

async function activationFixture(t, featureState = "off") {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-backup-activation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binding = bindingFor(root, featureState);
  const bindingRef = path.join(root, "binding.json");
  const bindingBytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
  await writeFile(bindingRef, bindingBytes);
  const sidecar = {
    schema_version: "soulforge.backup_controller.activation.v1",
    binding_ref: bindingRef,
    expected_binding_sha256: createHash("sha256").update(bindingBytes).digest("hex"),
    runtime_commit_sha: "b".repeat(40),
    approval_ref: binding.activation.approval_ref,
    writer: { node_id: binding.writer.node_id, hostname: binding.writer.hostname, platform: binding.writer.platform },
    feature_state: featureState,
    not_before: binding.activation.not_before,
    expires_at: "2026-07-21T00:00:00.000Z",
  };
  const sidecarRef = path.join(root, "activation.json");
  await writeFile(sidecarRef, `${JSON.stringify(sidecar, null, 2)}\n`);
  return { root, binding, bindingRef, sidecar, sidecarRef };
}

test("external activation binds digest, approval, legacy runtime metadata, writer, and time window", async (t) => {
  const fx = await activationFixture(t);
  const resolved = await resolveActivation({ sidecarRef: fx.sidecarRef, now: NOW, observedHost: { hostname: "HPP-HOST-TEST", platform: "win32" } });
  assert.equal(resolved.feature_enabled, false);
  assert.equal(resolved.sidecar.runtime_commit_sha, "b".repeat(40));
  assert.equal(resolved.binding_sha256, fx.sidecar.expected_binding_sha256);
});

test("activation is exact and fails closed on unknown keys or observed-host drift", async (t) => {
  const fx = await activationFixture(t);
  fx.sidecar.shell = "powershell";
  await writeFile(fx.sidecarRef, JSON.stringify(fx.sidecar));
  await assert.rejects(resolveActivation({ sidecarRef: fx.sidecarRef, now: NOW, observedHost: { hostname: "hpp-host-test", platform: "win32" } }), (error) => error instanceof BackupControllerError && error.code === "activation_shape_invalid");
  delete fx.sidecar.shell;
  await writeFile(fx.sidecarRef, JSON.stringify(fx.sidecar));
  await assert.rejects(resolveActivation({ sidecarRef: fx.sidecarRef, now: NOW, observedHost: { hostname: "other-host", platform: "win32" } }), (error) => error instanceof BackupControllerError && error.code === "observed_writer_mismatch");
});

test("feature-OFF automation stops before preflight, probes, executors, or state writes", async () => {
  let downstreamCalls = 0;
  const output = await runDailyAutomation({
    activationSidecarRef: ["C:", "control", "activation.json"].join("\\"),
    now: NOW,
    resolveActivationImpl: async () => ({ feature_enabled: false, observed_at: NOW.toISOString(), sidecar_sha256: "a".repeat(64), binding_sha256: "b".repeat(64) }),
    preflightImpl: async () => { downstreamCalls += 1; },
    executorCatalogFactory: () => { downstreamCalls += 1; },
    dailyCycleImpl: async () => { downstreamCalls += 1; },
  });
  assert.equal(output.status, "feature_off");
  assert.equal(output.write_performed, false);
  assert.equal(output.preflight_performed, false);
  assert.equal(downstreamCalls, 0);
});

test("enabled automation composes preflight, fixed catalog, and one daily cycle from only the sidecar", async () => {
  const calls = [];
  const binding = { marker: "exact-binding" };
  const output = await runDailyAutomation({
    activationSidecarRef: ["D:", "Soulforge-control", "backup-controller", "activation.json"].join("\\"),
    now: NOW,
    resolveActivationImpl: async ({ sidecarRef }) => {
      calls.push(["activation", sidecarRef]);
      return { feature_enabled: true, observed_at: NOW.toISOString(), sidecar_sha256: "a".repeat(64), binding_sha256: "b".repeat(64), binding, sidecar: { binding_ref: ["D:", "Soulforge-control", "backup-controller", "binding.json"].join("\\"), expected_binding_sha256: "b".repeat(64), runtime_commit_sha: "c".repeat(40), approval_ref: "approval-composition-test-v1" } };
    },
    preflightImpl: async (observedBinding, options) => { calls.push(["preflight", observedBinding, options]); return { ok: true }; },
    runtimeRootVerifier: (observedBinding) => { calls.push(["runtime-root", observedBinding]); },
    executorCatalogFactory: ({ approvalRef }) => { calls.push(["catalog", approvalRef]); return { executors: { fixed: true }, receiptReconciler: async () => null }; },
    dailyCycleImpl: async (options) => { calls.push(["cycle", options]); return { status: "succeeded", observed_at: NOW.toISOString(), write_performed: true }; },
  });
  assert.equal(output.status, "succeeded");
  assert.equal(calls[0][0], "activation");
  assert.deepEqual(calls[1], ["runtime-root", binding]);
  assert.deepEqual(calls[2], ["preflight", binding, { allowWriteProbe: true }]);
  assert.equal(calls[3][0], "catalog");
  assert.equal(calls[4][1].bindingRef, ["D:", "Soulforge-control", "backup-controller", "binding.json"].join("\\"));
  assert.equal(calls[4][1].apply, true);
});
