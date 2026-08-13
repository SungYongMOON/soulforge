import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RECOVERY_BINDING_SCHEMA_VERSION,
  runRecoveryCycle,
  startRecoveryCompanion,
  validateRecoveryBinding,
} from "./recovery_runtime.mjs";
import { composeTopologyHealth } from "./watchtower.mjs";

function binding(mode = "safe-repair") {
  return {
    schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
    mode,
    task_bindings: {
      consumer_board: { task_name: "Synthetic Board", action_digest: "a".repeat(64) },
    },
  };
}

async function fixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-recovery-runtime-"));
  const ledgerDirectory = path.join(projectRoot, "_workmeta", "system", "reports", "procedure_capture");
  await mkdir(ledgerDirectory, { recursive: true });
  const record = {
    schema_version: "soulforge.five_field_capture.v0",
    id: "synthetic_session:123456789abc",
    at: "2026-08-14T00:00:00.000Z",
    occurred_at: "2026-08-14T00:00:00.000Z",
    recorded_at: "2026-08-14T00:00:00.000Z",
    worker: "synthetic_worker",
    session_ref: "synthetic_session",
    project_code: "system",
    request_kind: "test/health",
    input_refs: [], judgment: "ok", output: "ok", verification: "pass",
    stop_conditions: [], needs_backfill: 0, data_label: "ai_draft",
  };
  await writeFile(path.join(ledgerDirectory, "five_field_log.jsonl"), `${JSON.stringify(record)}\n`);
  const snapshot = await composeTopologyHealth({
    schema_version: "soulforge.watchtower.binding.v1",
    state_root: path.join(projectRoot, "state"), probes: {},
  }, { now: Date.parse("2026-08-14T00:00:00.000Z") });
  return { projectRoot, snapshot };
}

test("recovery binding is exact and excludes provider tasks", () => {
  assert.equal(validateRecoveryBinding(binding()).mode, "safe-repair");
  assert.deepEqual(Object.keys(validateRecoveryBinding({
    ...binding(), task_bindings: {
      store_mail_events: { task_name: "Synthetic Ingress", action_digest: "b".repeat(64) },
      store_voice_custody: { task_name: "Synthetic Ingress", action_digest: "b".repeat(64) },
    },
  }).task_bindings).sort(), ["store_mail_events", "store_voice_custody"]);
  assert.throws(() => validateRecoveryBinding({
    ...binding(), task_bindings: {
      mail_forwarder: { task_name: "Synthetic", action_digest: "a".repeat(64) },
    },
  }), /recovery_binding_task_invalid/u);
});

test("cycle writes three independent evidence lanes without repair when graph is not stale/down", async () => {
  const { projectRoot, snapshot } = await fixture();
  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding("observe"),
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(Object.keys(result.evidence).sort(), [
    "gate_five_field", "store_workmeta", "watchtower_self",
  ]);
  assert.deepEqual(result.recovery, []);
});

test("safe repair starts only an exact ready task and verifies the changed run", async () => {
  const { projectRoot, snapshot } = await fixture();
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;
  let inspections = 0;
  let starts = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: inspections++ === 0 ? "ready" : "running",
      action_digest: "a".repeat(64), last_run_at: inspections === 1 ? null : "2026-08-14T00:05:00.000Z",
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 1);
  assert.equal(result.recovery[0].attempt, "succeeded");
  assert.equal(result.recovery[0].verification, "passed");
});

test("digest mismatch denies repair without starting the task", async () => {
  const { projectRoot, snapshot } = await fixture();
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "down", reasons: ["resident_task_not_running"], age_seconds: null };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.down += 1;
  let starts = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot, projectRoot, binding: binding(),
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({ exists: true, enabled: true, state: "ready", action_digest: "b".repeat(64), last_run_at: null }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 0);
  assert.equal(result.recovery[0].attempt, "denied");
  assert.equal(result.recovery[0].verification, "failed");
});

test("companion runs immediately, serializes cycles, and stops cleanly", async () => {
  let calls = 0;
  let release;
  const companion = startRecoveryCompanion({
    repoRoot: path.resolve("synthetic-repo"),
    projectRoot: path.resolve("synthetic-project"),
    intervalMs: 5,
    loadBinding: async () => binding("observe"),
    runCycle: async () => {
      calls += 1;
      await new Promise((resolve) => { release = resolve; });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
  release();
  await companion.stop();
  const stoppedAt = calls;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, stoppedAt);
});
