import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
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
import { BACKUP_ACTIVATION_ERROR_CODES } from "../backup_controller/activation.mjs";


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

test("recovery binding is exact, admits newly safe local nodes, and excludes provider/external/unbound tasks", () => {
  assert.equal(validateRecoveryBinding(binding()).mode, "safe-repair");
  // All newly safe local nodes must be accepted when valid
  const newlySafeNodes = [
    "slack_batch",
    "store_slack_custody",
    "usage_antigravity_collector",
    "gate_five_field",
    "store_workmeta",
    "watchtower_self",
  ];
  for (const nodeId of newlySafeNodes) {
    const res = validateRecoveryBinding({
      ...binding(),
      task_bindings: {
        [nodeId]: { task_name: `Synthetic ${nodeId}`, action_digest: "c".repeat(64) },
      },
    });
    assert.ok(res.task_bindings[nodeId], `${nodeId} should be accepted by validateRecoveryBinding`);
  }

  // All existing safe restartable nodes remain accepted
  const existingSafeNodes = [
    "ingress_supervisor",
    "store_mail_events",
    "store_voice_custody",
    "voice_label_worker",
    "local_activity",
    "store_activity_outbox",
    "usage_codex_collector",
    "usage_claude_collector",
    "usage_meter",
    "store_usage_ledger",
    "consumer_board",
  ];
  for (const nodeId of existingSafeNodes) {
    const res = validateRecoveryBinding({
      ...binding(),
      task_bindings: {
        [nodeId]: { task_name: `Synthetic ${nodeId}`, action_digest: "d".repeat(64) },
      },
    });
    assert.ok(res.task_bindings[nodeId], `${nodeId} should be accepted by validateRecoveryBinding`);
  }

  // Explicit negative tests: external/mail forwarder, provider/source nodes, timeline consumer, codex retention report must be rejected
  const rejectedNodes = [
    "mail_forwarder",
    "src_hiworks",
    "src_plaud",
    "src_slack",
    "src_onedrive",
    "src_codex",
    "src_claude",
    "src_antigravity",
    "src_gmail",
    "consumer_timeline",
    "codex_retention_report",
  ];
  for (const nodeId of rejectedNodes) {
    assert.throws(() => validateRecoveryBinding({
      ...binding(),
      task_bindings: {
        [nodeId]: { task_name: "Synthetic", action_digest: "a".repeat(64) },
      },
    }), /recovery_binding_task_invalid/u, `${nodeId} must be rejected from recovery binding`);
  }
});


test("newly safe nodes sharing one task execute once, produce per-node receipts, honor digest mismatch, and post-verify", async () => {
  const { projectRoot, snapshot } = await fixture();
  const sharedBinding = {
    schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
    mode: "safe-repair",
    task_bindings: {
      slack_batch: { task_name: "Soulforge-HPP-Slack-Batch", action_digest: "e".repeat(64) },
      store_slack_custody: { task_name: "Soulforge-HPP-Slack-Batch", action_digest: "e".repeat(64) },
    },
  };

  // Case 1: Both nodes stale/down -> task starts once, verified_repair produced for each node
  for (const id of ["slack_batch", "store_slack_custody"]) {
    const node = snapshot.nodes.find((n) => n.id === id);
    if (node) {
      node.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
      snapshot.summary.unmonitored -= 1;
      snapshot.summary.stale += 1;
    }
  }

  let starts = 0;
  const cycleAttemptTime = "2026-08-14T00:05:00.000Z";
  const postAttemptSnapshot = JSON.parse(JSON.stringify(snapshot));
  for (const id of ["slack_batch", "store_slack_custody"]) {
    const node = postAttemptSnapshot.nodes.find((n) => n.id === id);
    if (node) {
      node.health = { state: "ok", reasons: [], age_seconds: 10 };
      postAttemptSnapshot.summary.stale -= 1;
      postAttemptSnapshot.summary.ok += 1;
    }
  }
  postAttemptSnapshot.observed_at = "2026-08-14T00:05:15.000Z";

  let runCount = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: sharedBinding,
    evidenceRoot: path.join(projectRoot, "evidence-shared"),
    watchtowerPointerPath: path.join(projectRoot, "pointer-shared.json"),
    runWatchtower: async () => {
      runCount += 1;
      return runCount <= 2 ? snapshot : postAttemptSnapshot;
    },
    inspectTask: async () => ({
      exists: true,
      enabled: true,
      state: "ready",
      action_digest: "e".repeat(64),
      last_run_at: "2026-08-14T00:05:05.000Z",
      last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date(cycleAttemptTime),
  });

  assert.equal(starts, 1, "Shared task must be started exactly once across both nodes");
  assert.equal(result.recovery.length, 2, "Per-node recovery receipts must be emitted for both nodes");
  const slackBatchReceipt = result.recovery.find((r) => r.node_id === "slack_batch");
  const storeCustodyReceipt = result.recovery.find((r) => r.node_id === "store_slack_custody");
  assert.equal(slackBatchReceipt?.outcome_code, "verified_repair");
  assert.equal(storeCustodyReceipt?.outcome_code, "verified_repair");

  // Case 2: Digest mismatch produces owner_action_required with task_action_path_drift and zero starts
  let mismatchStarts = 0;
  const mismatchResult = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: sharedBinding,
    evidenceRoot: path.join(projectRoot, "evidence-mismatch"),
    watchtowerPointerPath: path.join(projectRoot, "pointer-mismatch.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true,
      enabled: true,
      state: "ready",
      action_digest: "f".repeat(64), // Drifted digest
      last_run_at: "2026-08-14T00:00:00.000Z",
      last_task_result: 0,
    }),
    startTask: async () => { mismatchStarts += 1; return { ok: true }; },
    now: () => new Date(cycleAttemptTime),
  });

  assert.equal(mismatchStarts, 0, "No task start allowed when action digest drifts");
  assert.equal(mismatchResult.recovery.length, 2);
  for (const row of mismatchResult.recovery) {
    assert.equal(row.outcome_code, "owner_action_required");
    assert.equal(row.diagnostic_code, "task_action_path_drift");
    assert.equal(row.repair_action, "none");
    assert.equal(row.attempt, "denied");
  }
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
  let probes = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => {
      probes += 1;
      if (probes <= 2) return snapshot;
      const recovered = structuredClone(snapshot);
      const recoveredBoard = recovered.nodes.find((node) => node.id === "consumer_board");
      recoveredBoard.health = { state: "ok", reasons: [], age_seconds: 0 };
      recovered.observed_at = "2026-08-14T00:05:00.000Z";
      recovered.summary.stale -= 1;
      recovered.summary.ok = (recovered.summary.ok ?? 0) + 1;
      return recovered;
    },
    inspectTask: async () => ({
      exists: true, enabled: true, state: inspections++ === 0 ? "ready" : "running",
      action_digest: "a".repeat(64), last_run_at: inspections === 1 ? null : "2026-08-14T00:05:00.000Z",
      last_task_result: inspections === 1 ? null : 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 1);
  assert.equal(result.recovery[0].attempt, "succeeded");
  assert.equal(result.recovery[0].verification, "passed");
  assert.equal(result.recovery[0].outcome_code, "verified_repair");
  assert.equal(result.recovery[0].circuit_state, "closed");
  assert.equal(result.state_revalidated, true);
});

test("digest mismatch denies repair without starting the task and diagnoses task_action_path_drift", async () => {
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
  assert.equal(result.recovery[0].outcome_code, "owner_action_required");
  assert.equal(result.recovery[0].diagnostic_code, "task_action_path_drift");
});

test("a running owned task is never started and is reported running_but_stale", async () => {
  const { projectRoot, snapshot } = await fixture();
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;
  let starts = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot, projectRoot, binding: binding(),
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: "running", action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:04:00.000Z",
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 0);
  assert.equal(result.recovery[0].attempt, "denied");
  assert.equal(result.recovery[0].outcome_code, "running_but_stale");
});

test("an invalid fresh Watchtower snapshot suppresses every repair", async () => {
  const { projectRoot, snapshot } = await fixture();
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "down", reasons: ["resident_task_not_running"], age_seconds: null };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.down += 1;
  let probes = 0;
  let starts = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot, projectRoot, binding: binding(),
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => (probes++ === 0 ? snapshot : { ...snapshot, edges: [] }),
    inspectTask: async () => ({
      exists: true, enabled: true, state: "ready", action_digest: "a".repeat(64), last_run_at: null,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 0);
  assert.equal(result.state_revalidated, false);
  assert.deepEqual(result.recovery, []);
  assert.equal(result.status, "attention");
});

test("companion runs immediately, serializes cycles, and stops cleanly", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-recovery-companion-"));
  let calls = 0;
  let release;
  const companion = startRecoveryCompanion({
    repoRoot: projectRoot,
    projectRoot,
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

test("a failed companion cycle writes only a sanitized supervisor receipt and retains last-good", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-recovery-companion-"));
  const evidenceRoot = path.join(projectRoot, "evidence");
  await mkdir(evidenceRoot, { recursive: true });
  const cyclePath = path.join(evidenceRoot, "recovery_cycle.json");
  const lastGood = "{\"last_good\":true}\n";
  await writeFile(cyclePath, lastGood, "utf8");
  const companion = startRecoveryCompanion({
    repoRoot: projectRoot,
    projectRoot,
    evidenceRoot,
    intervalMs: 60_000,
    loadBinding: async () => binding("observe"),
    runCycle: async () => {
      throw new Error(`private path ${path.resolve("test-fixtures", "secret")}`);
    },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  const supervisorPath = path.join(evidenceRoot, "recovery_supervisor.json");
  let supervisor = null;
  for (let attempt = 0; attempt < 50 && supervisor === null; attempt += 1) {
    try {
      supervisor = JSON.parse(await readFile(supervisorPath, "utf8"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  await companion.stop();
  assert.equal(supervisor?.status, "error");
  assert.equal(supervisor?.error_code, "recovery_cycle_failed");
  assert.equal(supervisor?.consecutive_errors, 1);
  assert.equal(await readFile(cyclePath, "utf8"), lastGood);
  assert.doesNotMatch(JSON.stringify(supervisor), /private|secret|test-fixtures/u);
});

test("regression: task start/last_run change while health remains stale and task result is nonzero must NOT become verified_repair", async () => {
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
      exists: true,
      enabled: true,
      state: inspections++ === 0 ? "ready" : "ready",
      action_digest: "a".repeat(64),
      last_run_at: inspections === 1 ? null : "2026-08-14T00:05:00.000Z",
      last_task_result: inspections === 1 ? null : 1,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 1);
  assert.notEqual(result.recovery[0].outcome_code, "verified_repair");
  assert.equal(result.recovery[0].outcome_code, "postverify_failed");
  assert.equal(result.status, "attention");
});

test("regression: three nodes sharing one task/action digest cause at most one start per cycle", async () => {
  const { projectRoot, snapshot } = await fixture();
  const sharedBinding = {
    schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
    mode: "safe-repair",
    task_bindings: {
      ingress_supervisor: { task_name: "Continuous Ingress Supervisor", action_digest: "b".repeat(64) },
      store_mail_events: { task_name: "Continuous Ingress Supervisor", action_digest: "b".repeat(64) },
      store_voice_custody: { task_name: "Continuous Ingress Supervisor", action_digest: "b".repeat(64) },
    },
  };
  for (const id of ["ingress_supervisor", "store_mail_events", "store_voice_custody"]) {
    const node = snapshot.nodes.find((n) => n.id === id);
    if (node) {
      node.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
      snapshot.summary.unmonitored -= 1;
      snapshot.summary.stale += 1;
    }
  }
  let starts = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: sharedBinding,
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true,
      enabled: true,
      state: "ready",
      action_digest: "b".repeat(64),
      last_run_at: "2026-08-14T00:00:00.000Z",
      last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 1);
  assert.equal(result.recovery.length, 3);
});

test("regression: safe writer_authority_expired diagnostic causes Owner-action-required with zero start calls", async () => {
  const { projectRoot, snapshot } = await fixture();
  const node = snapshot.nodes.find((n) => n.id === "consumer_board");
  node.health = { state: "stale", reasons: ["heartbeat_stale", "writer_authority_expired"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;
  let starts = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true,
      enabled: true,
      state: "ready",
      action_digest: "a".repeat(64),
      last_run_at: null,
      last_task_result: null,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 0);
  assert.equal(result.recovery[0].outcome_code, "owner_action_required");
  assert.equal(result.recovery[0].repair_action, "none");
  assert.equal(result.recovery[0].verification, "not_run");
  assert.equal(result.recovery[0].diagnostic_code, "writer_authority_expired");
  assert.equal(result.status, "attention");
});

test("regression P1-1: running task with old nonzero exit code remains not_verified and does not become postverify_failed", async () => {
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
      exists: true,
      enabled: true,
      state: inspections++ === 0 ? "ready" : "running",
      action_digest: "a".repeat(64),
      last_run_at: "2026-08-14T00:05:00.000Z",
      last_task_result: 1, // Nonzero exit code from prior run while state is running
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 1);
  assert.equal(result.recovery[0].outcome_code, "not_verified");
  assert.equal(result.status, "attention");
});

test("regression P1-2: ok post-Watchtower evidence older than the repair attempt remains not_verified due to causality", async () => {
  const { projectRoot, snapshot } = await fixture();
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;
  let inspections = 0;
  let starts = 0;
  let probes = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => {
      probes += 1;
      if (probes <= 2) return snapshot;
      const preAttemptSnapshot = structuredClone(snapshot);
      const preBoard = preAttemptSnapshot.nodes.find((node) => node.id === "consumer_board");
      // Healthy state, but age_seconds is 600s (older than the attempt started at T=00:05:00)
      preBoard.health = { state: "ok", reasons: [], age_seconds: 600 };
      return preAttemptSnapshot;
    },
    inspectTask: async () => ({
      exists: true,
      enabled: true,
      state: inspections++ === 0 ? "ready" : "running",
      action_digest: "a".repeat(64),
      last_run_at: "2026-08-14T00:05:00.000Z",
      last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 1);
  assert.equal(result.recovery[0].outcome_code, "not_verified");
});

test("regression P1-3: pending not_verified lifecycle resolves to verified_repair next cycle when fresh ok evidence arrives without re-execution", async () => {
  const { projectRoot, snapshot } = await fixture();
  const evidenceRoot = path.join(projectRoot, "evidence");
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;

  let starts = 0;
  let c1Inspections = 0;
  // Cycle 1: Task runs, post probe still stale -> not_verified
  const cycle1 = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: c1Inspections++ === 0 ? "ready" : "running",
      action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:05:00.000Z", last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 1);
  assert.equal(cycle1.recovery[0].outcome_code, "not_verified");

  // Cycle 2: 5 minutes later, node is now OK with fresh evidence
  const okSnapshot = structuredClone(snapshot);
  const okBoard = okSnapshot.nodes.find((node) => node.id === "consumer_board");
  okBoard.health = { state: "ok", reasons: [], age_seconds: 5 };
  okSnapshot.observed_at = "2026-08-14T00:10:00.000Z";
  okSnapshot.summary.stale -= 1;
  okSnapshot.summary.ok = (okSnapshot.summary.ok ?? 0) + 1;

  const cycle2 = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => okSnapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: "ready",
      action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:05:00.000Z", last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:10:00.000Z"),
  });
  assert.equal(starts, 1); // 0 new starts in cycle 2!
  assert.equal(cycle2.recovery[0].outcome_code, "verified_repair");
  assert.equal(cycle2.recovery[0].last_verified_repair_at, "2026-08-14T00:10:00.000Z");
  assert.equal(cycle2.status, "ok");
});

test("regression P1-3: pending not_verified lifecycle resolves to postverify_failed next cycle when task exits nonzero", async () => {
  const { projectRoot, snapshot } = await fixture();
  const evidenceRoot = path.join(projectRoot, "evidence");
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;

  let starts = 0;
  let c1Inspections = 0;
  // Cycle 1: Task runs -> not_verified
  await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: c1Inspections++ === 0 ? "ready" : "running",
      action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:05:00.000Z", last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });

  // Cycle 2: Task has now completed with exit code 1, health still stale
  const cycle2 = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: "ready",
      action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:05:00.000Z", last_task_result: 1,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:10:00.000Z"),
  });
  assert.equal(starts, 1); // 0 new starts in cycle 2
  assert.equal(cycle2.recovery[0].outcome_code, "postverify_failed");
  assert.equal(cycle2.recovery[0].consecutive_failures, 1);
});

test("regression P1-3: pending not_verified lifecycle remains pending with zero restarts while task is still running", async () => {
  const { projectRoot, snapshot } = await fixture();
  const evidenceRoot = path.join(projectRoot, "evidence");
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;

  let starts = 0;
  let c1Inspections = 0;
  // Cycle 1: Task runs
  await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: c1Inspections++ === 0 ? "ready" : "running",
      action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:05:00.000Z", last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });

  // Cycle 2: Task is still running
  const cycle2 = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: "running",
      action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:05:00.000Z", last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:10:00.000Z"),
  });
  assert.equal(starts, 1); // 0 new starts in cycle 2
  assert.equal(cycle2.recovery[0].outcome_code, "running_but_stale");
});

test("regression P1-4: degraded primary with writer_authority_expired gates whole shared task group as owner_action_required and includes degraded node in recovery", async () => {
  const { projectRoot, snapshot } = await fixture();
  const sharedBinding = {
    schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
    mode: "safe-repair",
    task_bindings: {
      ingress_supervisor: { task_name: "Continuous Ingress Supervisor", action_digest: "b".repeat(64) },
      store_mail_events: { task_name: "Continuous Ingress Supervisor", action_digest: "b".repeat(64) },
      store_voice_custody: { task_name: "Continuous Ingress Supervisor", action_digest: "b".repeat(64) },
    },
  };
  const ingress = snapshot.nodes.find((n) => n.id === "ingress_supervisor");
  ingress.health = { state: "degraded", reasons: ["writer_authority_expired"], age_seconds: 5 };
  const mail = snapshot.nodes.find((n) => n.id === "store_mail_events");
  mail.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
  const voice = snapshot.nodes.find((n) => n.id === "store_voice_custody");
  voice.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };

  let starts = 0;
  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: sharedBinding,
    evidenceRoot: path.join(projectRoot, "evidence"),
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: "ready",
      action_digest: "b".repeat(64), last_run_at: "2026-08-14T00:00:00.000Z", last_task_result: 1,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 0);
  assert.equal(result.recovery.length, 3);
  for (const row of result.recovery) {
    assert.equal(row.outcome_code, "owner_action_required");
    assert.equal(row.diagnostic_code, "writer_authority_expired");
    assert.equal(row.repair_action, "none");
    assert.equal(row.verification, "not_run");
  }
});

test("regression: pending not_verified resolves to postverify_failed next cycle when task completed with result 0 but ok evidence is missing", async () => {
  const { projectRoot, snapshot } = await fixture();
  const evidenceRoot = path.join(projectRoot, "evidence");
  const board = snapshot.nodes.find((node) => node.id === "consumer_board");
  board.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;

  let starts = 0;
  let c1Inspections = 0;
  // Cycle 1: Task runs -> not_verified
  await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: c1Inspections++ === 0 ? "ready" : "running",
      action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:05:00.000Z", last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });
  assert.equal(starts, 1);

  // Cycle 2: Task has now completed with exit code 0, but health is still stale
  const cycle2 = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: binding(),
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => ({
      exists: true, enabled: true, state: "ready",
      action_digest: "a".repeat(64), last_run_at: "2026-08-14T00:05:00.000Z", last_task_result: 0,
    }),
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:10:00.000Z"),
  });
  assert.equal(starts, 1); // 0 new starts in cycle 2
  assert.equal(cycle2.recovery[0].outcome_code, "postverify_failed");
  assert.equal(cycle2.recovery[0].consecutive_failures, 1);
  assert.equal(cycle2.recovery[0].circuit_state, "closed");
  assert.notEqual(cycle2.recovery[0].next_retry_at, null);
});

test("runtime gates every terminal auth reason as owner_action_required with 0 starts and no retry consumption", async () => {
  const terminalAuthCodes = [
    "auth_invalid_grant",
    "auth_token_revoked",
    "auth_mfa_required",
    "auth_consent_required",
    "auth_invalid_client",
    "auth_terminal_error",
  ];

  for (const authCode of terminalAuthCodes) {
    const { projectRoot, snapshot } = await fixture();
    const node = snapshot.nodes.find((n) => n.id === "slack_batch");
    assert.ok(node, "slack_batch must exist in topology snapshot");
    node.health = { state: "stale", reasons: ["heartbeat_stale", authCode], age_seconds: 901 };
    snapshot.summary.unmonitored -= 1;
    snapshot.summary.stale += 1;

    let starts = 0;
    let inspections = 0;
    const testBinding = {
      schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
      mode: "safe-repair",
      task_bindings: {
        slack_batch: { task_name: "Soulforge-HPP-Slack-Batch", action_digest: "e".repeat(64) },
      },
    };

    const result = await runRecoveryCycle({
      repoRoot: projectRoot,
      projectRoot,
      binding: testBinding,
      evidenceRoot: path.join(projectRoot, `evidence-terminal-${authCode}`),
      watchtowerPointerPath: path.join(projectRoot, `pointer-terminal-${authCode}.json`),
      runWatchtower: async () => snapshot,
      inspectTask: async () => {
        inspections += 1;
        return {
          exists: true, enabled: true, state: "ready",
          action_digest: "e".repeat(64), last_run_at: null, last_task_result: null,
        };
      },
      startTask: async () => { starts += 1; return { ok: true }; },
      now: () => new Date("2026-08-14T00:05:00.000Z"),
    });

    assert.equal(starts, 0, `startTask must be 0 for terminal auth code: ${authCode}`);
    assert.equal(inspections, 0, `inspectTask must not be called when gated by terminal auth code: ${authCode}`);
    assert.equal(result.recovery.length, 1);
    const receipt = result.recovery[0];
    assert.equal(receipt.outcome_code, "owner_action_required", `outcome_code for ${authCode}`);
    assert.equal(receipt.diagnostic_code, authCode, `diagnostic_code for ${authCode}`);
    assert.equal(receipt.repair_action, "none", `repair_action for ${authCode}`);
    assert.equal(receipt.attempt, "denied", `attempt for ${authCode}`);
    assert.equal(receipt.verification, "not_run", `verification for ${authCode}`);
    assert.equal(receipt.consecutive_failures, 0, `terminal auth must not consume retry attempts for ${authCode}`);
  }
});

test("runtime gates usage_event_duplicate_conflict, usage_event_conflict, quarantine_applied as observe_only with 0 starts", async () => {
  const usageConflictCodes = [
    "usage_event_duplicate_conflict",
    "usage_event_conflict",
    "quarantine_applied",
  ];

  for (const conflictCode of usageConflictCodes) {
    const { projectRoot, snapshot } = await fixture();
    const node = snapshot.nodes.find((n) => n.id === "usage_meter");
    assert.ok(node, "usage_meter must exist in topology snapshot");
    node.health = { state: "stale", reasons: ["heartbeat_stale", conflictCode], age_seconds: 901 };
    snapshot.summary.unmonitored -= 1;
    snapshot.summary.stale += 1;

    let starts = 0;
    let inspections = 0;
    const testBinding = {
      schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
      mode: "safe-repair",
      task_bindings: {
        usage_meter: { task_name: "Soulforge-Usage-Meter", action_digest: "a".repeat(64) },
      },
    };

    const result = await runRecoveryCycle({
      repoRoot: projectRoot,
      projectRoot,
      binding: testBinding,
      evidenceRoot: path.join(projectRoot, `evidence-conflict-${conflictCode}`),
      watchtowerPointerPath: path.join(projectRoot, `pointer-conflict-${conflictCode}.json`),
      runWatchtower: async () => snapshot,
      inspectTask: async () => {
        inspections += 1;
        return {
          exists: true, enabled: true, state: "ready",
          action_digest: "a".repeat(64), last_run_at: null, last_task_result: null,
        };
      },
      startTask: async () => { starts += 1; return { ok: true }; },
      now: () => new Date("2026-08-14T00:05:00.000Z"),
    });

    assert.equal(starts, 0, `startTask must be 0 for usage conflict code: ${conflictCode}`);
    assert.equal(inspections, 0, `inspectTask must not be called when gated by usage conflict: ${conflictCode}`);
    assert.equal(result.recovery.length, 1);
    const receipt = result.recovery[0];
    assert.equal(receipt.outcome_code, "observe_only", `outcome_code for ${conflictCode}`);
    assert.equal(receipt.repairability, "observe_only", `repairability for ${conflictCode}`);
    assert.equal(receipt.repair_action, "none", `repair_action for ${conflictCode}`);
    assert.equal(receipt.attempt, "denied", `attempt for ${conflictCode}`);
    assert.equal(receipt.consecutive_failures, 0, `usage conflict must not consume retry attempts`);
  }
});

test("runtime shared task group gates entire group when any bound node has terminal auth or usage conflict", async () => {
  // Case A: Terminal auth on slack_batch gates store_slack_custody in the same task group
  {
    const { projectRoot, snapshot } = await fixture();
    const sharedBinding = {
      schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
      mode: "safe-repair",
      task_bindings: {
        slack_batch: { task_name: "Soulforge-HPP-Slack-Batch", action_digest: "e".repeat(64) },
        store_slack_custody: { task_name: "Soulforge-HPP-Slack-Batch", action_digest: "e".repeat(64) },
      },
    };
    const nodeA = snapshot.nodes.find((n) => n.id === "slack_batch");
    const nodeB = snapshot.nodes.find((n) => n.id === "store_slack_custody");
    nodeA.health = { state: "stale", reasons: ["heartbeat_stale", "auth_invalid_grant"], age_seconds: 901 };
    nodeB.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };

    let starts = 0;
    const result = await runRecoveryCycle({
      repoRoot: projectRoot,
      projectRoot,
      binding: sharedBinding,
      evidenceRoot: path.join(projectRoot, "evidence-shared-terminal"),
      watchtowerPointerPath: path.join(projectRoot, "pointer-shared-terminal.json"),
      runWatchtower: async () => snapshot,
      inspectTask: async () => ({
        exists: true, enabled: true, state: "ready",
        action_digest: "e".repeat(64), last_run_at: null, last_task_result: null,
      }),
      startTask: async () => { starts += 1; return { ok: true }; },
      now: () => new Date("2026-08-14T00:05:00.000Z"),
    });

    assert.equal(starts, 0, "Terminal auth on any node in shared group must produce 0 starts");
    assert.equal(result.recovery.length, 2);
    for (const row of result.recovery) {
      assert.equal(row.outcome_code, "owner_action_required");
      assert.equal(row.diagnostic_code, "auth_invalid_grant");
      assert.equal(row.repair_action, "none");
      assert.equal(row.attempt, "denied");
    }
  }

  // Case B: Usage conflict on usage_antigravity_collector suppresses generic restart for shared group
  {
    const { projectRoot, snapshot } = await fixture();
    const sharedUsageBinding = {
      schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
      mode: "safe-repair",
      task_bindings: {
        usage_antigravity_collector: { task_name: "Soulforge-Usage-Host", action_digest: "f".repeat(64) },
        usage_meter: { task_name: "Soulforge-Usage-Host", action_digest: "f".repeat(64) },
      },
    };
    const nodeA = snapshot.nodes.find((n) => n.id === "usage_antigravity_collector");
    const nodeB = snapshot.nodes.find((n) => n.id === "usage_meter");
    nodeA.health = { state: "stale", reasons: ["heartbeat_stale", "usage_event_duplicate_conflict"], age_seconds: 901 };
    nodeB.health = { state: "stale", reasons: ["heartbeat_stale"], age_seconds: 901 };

    let starts = 0;
    const result = await runRecoveryCycle({
      repoRoot: projectRoot,
      projectRoot,
      binding: sharedUsageBinding,
      evidenceRoot: path.join(projectRoot, "evidence-shared-conflict"),
      watchtowerPointerPath: path.join(projectRoot, "pointer-shared-conflict.json"),
      runWatchtower: async () => snapshot,
      inspectTask: async () => ({
        exists: true, enabled: true, state: "ready",
        action_digest: "f".repeat(64), last_run_at: null, last_task_result: null,
      }),
      startTask: async () => { starts += 1; return { ok: true }; },
      now: () => new Date("2026-08-14T00:05:00.000Z"),
    });

    assert.equal(starts, 0, "Usage conflict on any node in shared group must produce 0 starts");
    assert.equal(result.recovery.length, 2);
    for (const row of result.recovery) {
      assert.equal(row.outcome_code, "observe_only");
      assert.equal(row.repairability, "observe_only");
      assert.equal(row.repair_action, "none");
      assert.equal(row.attempt, "denied");
    }
  }
});

test("runtime permits bounded retry on transient auth reasons and verifies terminal auth does not consume retries", async () => {
  const { projectRoot, snapshot } = await fixture();
  const node = snapshot.nodes.find((n) => n.id === "slack_batch");
  assert.ok(node);
  node.health = { state: "stale", reasons: ["heartbeat_stale", "auth_transient_retry"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;

  const testBinding = {
    schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
    mode: "safe-repair",
    task_bindings: {
      slack_batch: { task_name: "Soulforge-HPP-Slack-Batch", action_digest: "e".repeat(64) },
    },
  };
  const evidenceRoot = path.join(projectRoot, "evidence-transient-bounded");

  let starts = 0;
  let inspections = 0;

  // Attempt 1: Transient auth -> eligible -> starts task -> fails verification -> consecutive_failures: 1 (backoff 5m)
  const cycle1 = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: testBinding,
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer-transient.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => {
      inspections += 1;
      return {
        exists: true, enabled: true, state: "ready",
        action_digest: "e".repeat(64), last_run_at: "2026-08-14T00:05:01.000Z", last_task_result: 1,
      };
    },
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });

  assert.equal(starts, 1, "Transient auth must attempt safe repair");
  assert.equal(inspections, 2); // pre and post
  assert.equal(cycle1.recovery[0].outcome_code, "postverify_failed");
  assert.equal(cycle1.recovery[0].consecutive_failures, 1);

  // Attempt 2: After 5m backoff, transient error occurs again -> starts task -> fails -> consecutive_failures: 2
  const cycle2 = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: testBinding,
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer-transient.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => {
      inspections += 1;
      return {
        exists: true, enabled: true, state: "ready",
        action_digest: "e".repeat(64), last_run_at: "2026-08-14T00:10:01.000Z", last_task_result: 1,
      };
    },
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:10:00.000Z"),
  });

  assert.equal(starts, 2);
  assert.equal(cycle2.recovery[0].outcome_code, "postverify_failed");
  assert.equal(cycle2.recovery[0].consecutive_failures, 2);

  // Attempt 3: Node becomes terminal auth (auth_invalid_grant) -> owner_action_required -> 0 starts, consecutive_failures remains 2
  node.health = { state: "stale", reasons: ["heartbeat_stale", "auth_invalid_grant"], age_seconds: 901 };
  const cycle3 = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: testBinding,
    evidenceRoot,
    watchtowerPointerPath: path.join(projectRoot, "pointer-transient.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => {
      inspections += 1;
      return {
        exists: true, enabled: true, state: "ready",
        action_digest: "e".repeat(64), last_run_at: "2026-08-14T00:25:01.000Z", last_task_result: 0,
      };
    },
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:25:00.000Z"),
  });

  assert.equal(starts, 2, "Terminal auth must NOT attempt start");
  assert.equal(cycle3.recovery[0].outcome_code, "owner_action_required");
  assert.equal(cycle3.recovery[0].diagnostic_code, "auth_invalid_grant");
  assert.equal(cycle3.recovery[0].consecutive_failures, 2, "Terminal auth must NOT consume or advance failure counter");
});

test("runtime gates auth_unknown_failure with 0 inspections, 0 starts, and owner_action_required", async () => {
  const { projectRoot, snapshot } = await fixture();
  const node = snapshot.nodes.find((n) => n.id === "slack_batch");
  assert.ok(node);
  node.health = { state: "stale", reasons: ["heartbeat_stale", "auth_unknown_failure"], age_seconds: 901 };
  snapshot.summary.unmonitored -= 1;
  snapshot.summary.stale += 1;

  let starts = 0;
  let inspections = 0;
  const testBinding = {
    schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
    mode: "safe-repair",
    task_bindings: {
      slack_batch: { task_name: "Soulforge-HPP-Slack-Batch", action_digest: "e".repeat(64) },
    },
  };

  const result = await runRecoveryCycle({
    repoRoot: projectRoot,
    projectRoot,
    binding: testBinding,
    evidenceRoot: path.join(projectRoot, "evidence-auth-unknown"),
    watchtowerPointerPath: path.join(projectRoot, "pointer-auth-unknown.json"),
    runWatchtower: async () => snapshot,
    inspectTask: async () => {
      inspections += 1;
      return {
        exists: true, enabled: true, state: "ready",
        action_digest: "e".repeat(64), last_run_at: null, last_task_result: null,
      };
    },
    startTask: async () => { starts += 1; return { ok: true }; },
    now: () => new Date("2026-08-14T00:05:00.000Z"),
  });

  assert.equal(starts, 0, "startTask must be 0 for auth_unknown_failure");
  assert.equal(inspections, 0, "inspectTask must not be called for auth_unknown_failure");
  assert.equal(result.recovery.length, 1);
  const receipt = result.recovery[0];
  assert.equal(receipt.outcome_code, "owner_action_required");
  assert.equal(receipt.diagnostic_code, "auth_unknown_failure");
  assert.equal(receipt.repair_action, "none");
  assert.equal(receipt.attempt, "denied");
  assert.equal(receipt.consecutive_failures, 0);
});

test("runtime gates every continuous_plaud_cutover_receipt_* safe alias to cutover_receipt_expired with 0 starts", async () => {
  const cutoverVariants = [
    "continuous_plaud_cutover_receipt_invalid",
    "continuous_plaud_cutover_receipt_missing",
    "continuous_plaud_cutover_receipt_unsafe",
    "continuous_plaud_cutover_receipt_unstable",
    "continuous_plaud_cutover_receipt_digest_mismatch",
  ];

  for (const variant of cutoverVariants) {
    const { projectRoot, snapshot } = await fixture();
    const node = snapshot.nodes.find((n) => n.id === "ingress_supervisor");
    assert.ok(node);
    node.health = { state: "stale", reasons: ["heartbeat_stale", variant], age_seconds: 901 };
    snapshot.summary.unmonitored -= 1;
    snapshot.summary.stale += 1;

    let starts = 0;
    let inspections = 0;
    const testBinding = {
      schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
      mode: "safe-repair",
      task_bindings: {
        ingress_supervisor: { task_name: "Soulforge-Ingress-Host", action_digest: "a".repeat(64) },
      },
    };

    const result = await runRecoveryCycle({
      repoRoot: projectRoot,
      projectRoot,
      binding: testBinding,
      evidenceRoot: path.join(projectRoot, `evidence-cutover-${variant}`),
      watchtowerPointerPath: path.join(projectRoot, `pointer-cutover-${variant}.json`),
      runWatchtower: async () => snapshot,
      inspectTask: async () => {
        inspections += 1;
        return {
          exists: true, enabled: true, state: "ready",
          action_digest: "a".repeat(64), last_run_at: null, last_task_result: null,
        };
      },
      startTask: async () => { starts += 1; return { ok: true }; },
      now: () => new Date("2026-08-14T00:05:00.000Z"),
    });

    assert.equal(starts, 0, `startTask must be 0 for cutover alias: ${variant}`);
    assert.equal(inspections, 0, `inspectTask must not be called for cutover alias: ${variant}`);
    assert.equal(result.recovery.length, 1);
    const receipt = result.recovery[0];
    assert.equal(receipt.outcome_code, "owner_action_required", `outcome_code for ${variant}`);
    assert.equal(receipt.diagnostic_code, "cutover_receipt_expired", `diagnostic_code for ${variant}`);
    assert.equal(receipt.repair_action, "none", `repair_action for ${variant}`);
    assert.equal(receipt.attempt, "denied", `attempt for ${variant}`);
    assert.equal(receipt.consecutive_failures, 0);
  }
});

test("runtime gates writer authority and backup activation aliases to owner_action_required with 0 starts", async () => {
  const cases = [
    {
      nodeId: "ingress_supervisor",
      taskName: "Soulforge-Ingress-Host",
      reason: "continuous_writer_authority_lease_missing",
      expectedDiagnostic: "writer_authority_expired",
    },
    {
      nodeId: "ingress_supervisor",
      taskName: "Soulforge-Ingress-Host",
      reason: "writer_authority_mode_off",
      expectedDiagnostic: "writer_authority_expired",
    },
    {
      nodeId: "watchtower_self",
      taskName: "Soulforge-Watchtower-Self",
      reason: "activation_expired",
      expectedDiagnostic: "backup_activation_expired",
    },
    {
      nodeId: "watchtower_self",
      taskName: "Soulforge-Watchtower-Self",
      reason: "activation_binding_digest_mismatch",
      expectedDiagnostic: "backup_activation_expired",
    },
  ];

  for (const { nodeId, taskName, reason, expectedDiagnostic } of cases) {
    const { projectRoot, snapshot } = await fixture();
    const node = snapshot.nodes.find((n) => n.id === nodeId);
    assert.ok(node, `${nodeId} must exist`);
    node.health = { state: "stale", reasons: ["heartbeat_stale", reason], age_seconds: 901 };
    snapshot.summary.unmonitored -= 1;
    snapshot.summary.stale += 1;

    let starts = 0;
    let inspections = 0;
    const testBinding = {
      schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
      mode: "safe-repair",
      task_bindings: {
        [nodeId]: { task_name: taskName, action_digest: "a".repeat(64) },
      },
    };

    const result = await runRecoveryCycle({
      repoRoot: projectRoot,
      projectRoot,
      binding: testBinding,
      evidenceRoot: path.join(projectRoot, `evidence-standing-${reason}`),
      watchtowerPointerPath: path.join(projectRoot, `pointer-standing-${reason}.json`),
      runWatchtower: async () => snapshot,
      inspectTask: async () => {
        inspections += 1;
        return {
          exists: true, enabled: true, state: "ready",
          action_digest: "a".repeat(64), last_run_at: null, last_task_result: null,
        };
      },
      startTask: async () => { starts += 1; return { ok: true }; },
      now: () => new Date("2026-08-14T00:05:00.000Z"),
    });

    assert.equal(starts, 0, `startTask must be 0 for reason: ${reason}`);
    assert.equal(inspections, 0, `inspectTask must not be called for reason: ${reason}`);
    assert.equal(result.recovery.length, 1);
    const receipt = result.recovery[0];
    assert.equal(receipt.outcome_code, "owner_action_required", `outcome_code for ${reason}`);
    assert.equal(receipt.diagnostic_code, expectedDiagnostic, `diagnostic_code for ${reason}`);
    assert.equal(receipt.repair_action, "none", `repair_action for ${reason}`);
    assert.equal(receipt.attempt, "denied", `attempt for ${reason}`);
    assert.equal(receipt.consecutive_failures, 0);
  }
});

test("runtime gates every exact source-emitted backup activation error to backup_activation_expired with 0 starts", async () => {
  assert.ok(BACKUP_ACTIVATION_ERROR_CODES.length >= 24);

  for (const errorCode of BACKUP_ACTIVATION_ERROR_CODES) {
    const { projectRoot, snapshot } = await fixture();
    const node = snapshot.nodes.find((n) => n.id === "watchtower_self");

    assert.ok(node, "watchtower_self must exist");
    node.health = { state: "stale", reasons: ["heartbeat_stale", errorCode], age_seconds: 901 };
    snapshot.summary.unmonitored -= 1;
    snapshot.summary.stale += 1;

    let starts = 0;
    let inspections = 0;
    const testBinding = {
      schema_version: RECOVERY_BINDING_SCHEMA_VERSION,
      mode: "safe-repair",
      task_bindings: {
        watchtower_self: { task_name: "Soulforge-Watchtower-Self", action_digest: "a".repeat(64) },
      },
    };

    const result = await runRecoveryCycle({
      repoRoot: projectRoot,
      projectRoot,
      binding: testBinding,
      evidenceRoot: path.join(projectRoot, `evidence-activation-${errorCode}`),
      watchtowerPointerPath: path.join(projectRoot, `pointer-activation-${errorCode}.json`),
      runWatchtower: async () => snapshot,
      inspectTask: async () => {
        inspections += 1;
        return {
          exists: true, enabled: true, state: "ready",
          action_digest: "a".repeat(64), last_run_at: null, last_task_result: null,
        };
      },
      startTask: async () => { starts += 1; return { ok: true }; },
      now: () => new Date("2026-08-14T00:05:00.000Z"),
    });

    assert.equal(starts, 0, `startTask must be 0 for activation error: ${errorCode}`);
    assert.equal(inspections, 0, `inspectTask must not be called for activation error: ${errorCode}`);
    assert.equal(result.recovery.length, 1);
    const receipt = result.recovery[0];
    assert.equal(receipt.outcome_code, "owner_action_required", `outcome_code for ${errorCode}`);
    assert.equal(receipt.diagnostic_code, "backup_activation_expired", `diagnostic_code for ${errorCode}`);
    assert.equal(receipt.repair_action, "none", `repair_action for ${errorCode}`);
    assert.equal(receipt.attempt, "denied", `attempt for ${errorCode}`);
    assert.equal(receipt.consecutive_failures, 0, `consecutive_failures for ${errorCode}`);
  }
});

test("startRecoveryCompanion hands its evidence root and Watchtower pointer to the cycle, defaulting both from the project root", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-recovery-companion-roots-"));
  const received = [];
  const runCycle = async (options) => { received.push(options); };

  const defaults = startRecoveryCompanion({
    repoRoot: projectRoot,
    projectRoot,
    intervalMs: 60_000,
    loadBinding: async () => binding("observe"),
    runCycle,
  });
  await defaults.stop();
  const operations = path.join(projectRoot, "guild_hall", "state", "operations");
  assert.equal(received.length, 1);
  assert.equal(received[0].evidenceRoot, path.join(operations, "watchtower", "external_evidence"));
  assert.equal(received[0].watchtowerPointerPath, path.join(operations, "watchtower", "binding.pointer.json"));
  assert.equal(received[0].projectRoot, projectRoot);

  const evidenceRoot = path.join(projectRoot, "moved-state", "operations", "watchtower", "external_evidence");
  const watchtowerPointerPath = path.join(projectRoot, "moved-state", "operations", "watchtower", "binding.pointer.json");
  const moved = startRecoveryCompanion({
    repoRoot: projectRoot,
    projectRoot,
    evidenceRoot,
    watchtowerPointerPath,
    intervalMs: 60_000,
    loadBinding: async () => binding("observe"),
    runCycle,
  });
  await moved.stop();
  assert.equal(received.length, 2);
  assert.equal(received[1].evidenceRoot, evidenceRoot);
  assert.equal(received[1].watchtowerPointerPath, watchtowerPointerPath);
  assert.equal(received[1].projectRoot, projectRoot, "the owner root stays the project root for _workmeta checks");
});
