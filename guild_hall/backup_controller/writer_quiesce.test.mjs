import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BackupControllerError } from "./controller.mjs";
import { runQuiescedDailyAutomation, validateWriterQuiesceConfig } from "./writer_quiesce.mjs";


// The quiesce module validates sidecar and state refs with path.win32 because it drives the
// Windows Task Scheduler. Fixtures built under os.tmpdir() only make sense where that is a
// Windows path, so the filesystem-backed cases run on win32 and are skipped elsewhere
// (same platform gate as the dev-erp launcher tests).
const WINDOWS_ONLY = process.platform !== "win32" && "writer quiesce paths are Windows Task Scheduler paths";

function makeConfig(root) {
  return {
    schema_version: "soulforge.backup_controller.writer_quiesce.v1",
    controller_id: "soulforge-backup-controller",
    state_ref: path.join(root, "quiesce-state.json"),
    stop_timeout_seconds: 30,
    tasks: [
      {
        task_id: "continuous_ingress",
        task_name: "Soulforge-Continuous-Five-Lane-Ingress",
        action_markers: ["continuous-ingress-supervisor.hpp.ps1"],
        process_markers: ["continuous_supervisor_cli.mjs"],
        quiesce_mode: "cooperative_pause",
        pause_ref: path.join(root, "continuous-supervisor.pause"),
        restore_mode: "ensure_running",
      },
      {
        task_id: "slack_batch",
        task_name: "Soulforge-HPP-Slack-Batch",
        action_markers: ["slack_batch_live_launcher.mjs"],
        process_markers: ["slack_batch_live_launcher.mjs"],
        quiesce_mode: "wait_for_idle",
        pause_ref: null,
        restore_mode: "run_once_after_backup",
      },
    ],
  };
}

function fakeAdapter(events) {
  return {
    async inspect(task) {
      events.push(`inspect:${task.task_id}`);
      return { enabled: true, state: task.task_id === "continuous_ingress" ? "Running" : "Ready", matching_process_count: 0 };
    },
    async quiesce(task) {
      events.push(`quiesce:${task.task_id}`);
    },
    async enable(task) {
      events.push(`enable:${task.task_id}`);
    },
    async disable(task) {
      events.push(`disable:${task.task_id}`);
    },
    async start(task) {
      events.push(`start:${task.task_id}`);
    },
  };
}

async function withFixture(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "backup-writer-quiesce-"));
  const config = makeConfig(root);
  const configRef = path.join(root, "quiesce.json");
  const bytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  await writeFile(configRef, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    await fn({ root, config, configRef, sha256 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("config exact-validates task identities and restore modes", () => {
  const value = makeConfig(["D:", "fixture"].join("\\"));
  assert.equal(validateWriterQuiesceConfig(value).tasks.length, 2);
  assert.throws(
    () => validateWriterQuiesceConfig({ ...value, extra: true }),
    (error) => error instanceof BackupControllerError && error.code === "writer_quiesce_shape_invalid",
  );
});

test("writers are quiesced before backup and restored after success", { skip: WINDOWS_ONLY }, async () => {
  await withFixture(async ({ configRef, sha256 }) => {
    const events = [];
    const result = await runQuiescedDailyAutomation({
      activationSidecarRef: ["D:", "control", "activation.json"].join("\\"),
      quiesceSidecarRef: configRef,
      expectedQuiesceSha256: sha256,
      taskAdapter: fakeAdapter(events),
      restoreConfirmDelayMs: 0,
      runAutomationImpl: async () => {
        events.push("backup");
        return { status: "succeeded" };
      },
    });
    assert.equal(result.status, "succeeded");
    assert.deepEqual(events, [
      "inspect:continuous_ingress",
      "inspect:slack_batch",
      "quiesce:continuous_ingress",
      "quiesce:slack_batch",
      "backup",
      "enable:slack_batch",
      "start:slack_batch",
      "enable:continuous_ingress",
      "start:continuous_ingress",
      "inspect:continuous_ingress",
    ]);
  });
});

test("writers are restored even when backup fails", { skip: WINDOWS_ONLY }, async () => {
  await withFixture(async ({ config, configRef, sha256 }) => {
    const events = [];
    await assert.rejects(
      () => runQuiescedDailyAutomation({
        activationSidecarRef: ["D:", "control", "activation.json"].join("\\"),
        quiesceSidecarRef: configRef,
        expectedQuiesceSha256: sha256,
          taskAdapter: fakeAdapter(events),
          restoreConfirmDelayMs: 0,
        runAutomationImpl: async () => {
          events.push("backup");
          throw new BackupControllerError("synthetic_backup_failure");
        },
      }),
      (error) => error instanceof BackupControllerError && error.code === "synthetic_backup_failure",
    );
    assert.ok(events.includes("start:continuous_ingress"));
    await assert.rejects(readFile(config.state_ref), (error) => error.code === "ENOENT");
  });
});

test("an unconfirmed continuous-writer restart fails closed and preserves recovery state", { skip: WINDOWS_ONLY }, async () => {
  await withFixture(async ({ config, configRef, sha256 }) => {
    let inspectCount = 0;
    const adapter = fakeAdapter([]);
    adapter.inspect = async () => {
      inspectCount += 1;
      return inspectCount === 1
        ? { enabled: true, state: "Running", matching_process_count: 1 }
        : { enabled: true, state: "Ready", matching_process_count: 0 };
    };
    await assert.rejects(
      () => runQuiescedDailyAutomation({
        activationSidecarRef: ["D:", "control", "activation.json"].join("\\"),
        quiesceSidecarRef: configRef,
        expectedQuiesceSha256: sha256,
        taskAdapter: adapter,
        restoreConfirmDelayMs: 0,
        runAutomationImpl: async () => ({ status: "succeeded" }),
      }),
      (error) => error instanceof BackupControllerError && error.code === "writer_restore_failed",
    );
    const state = JSON.parse(await readFile(config.state_ref, "utf8"));
    assert.equal(state.phase, "restoring");
  });
});
