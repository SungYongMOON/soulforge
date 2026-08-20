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
  // The digest mismatch is caught by the gate check before the verifier is
  // reached; the outcome code is what the contract guarantees, not the raw
  // verifier field, which never runs.
  assert.equal(result.recovery[0].outcome_code, "precondition_unmet");
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
