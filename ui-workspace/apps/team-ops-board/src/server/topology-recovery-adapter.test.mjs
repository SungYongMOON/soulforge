import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  TOPOLOGY_RECOVERY_CYCLE_SCHEMA,
  TOPOLOGY_RECOVERY_HISTORY_SCHEMA,
  TOPOLOGY_RECOVERY_SUPERVISOR_SCHEMA,
  readTopologyRecoveryProjection,
  validateTopologyRecoveryCycle,
  validateTopologyRecoveryHistory,
  validateTopologyRecoverySupervisor,
} from "./topology-recovery-adapter.mjs";

const NOW = Date.parse("2026-08-14T08:10:00.000Z");

function cycle(overrides = {}) {
  return {
    schema_version: TOPOLOGY_RECOVERY_CYCLE_SCHEMA,
    attempted_at: "2026-08-14T08:02:32.666Z",
    completed_at: "2026-08-14T08:03:01.936Z",
    mode: "safe-repair",
    status: "attention",
    state_revalidated: true,
    evidence: {},
    recovery: [{
      node_id: "usage_codex_collector",
      reason: "processing_failed",
      diagnostic_code: null,
      repairability: "allowlisted",
      repair_action: "restart_owned_task",
      attempt: "denied",
      verification: "failed",
      escalation: "watchtower_operator",
      outcome_code: "precondition_unmet",
      circuit_state: "closed",
      consecutive_failures: 1,
      last_attempt_at: "2026-08-14T08:03:00.000Z",
      last_verified_repair_at: null,
      next_retry_at: "2026-08-14T08:08:00.000Z",
    }],
    ...overrides,
  };
}

function historyDoc(overrides = {}) {
  return {
    schema_version: TOPOLOGY_RECOVERY_HISTORY_SCHEMA,
    updated_at: "2026-08-14T08:03:01.936Z",
    entries: [{
      at: "2026-08-14T08:03:00.000Z",
      node_id: "usage_codex_collector",
      reason: "processing_failed",
      diagnostic_code: null,
      action: "restart_owned_task",
      attempt: "denied",
      verification: "failed",
      circuit_state: "closed",
      next_retry_at: "2026-08-14T08:08:00.000Z",
      outcome_code: "precondition_unmet",
    }],
    ...overrides,
  };
}

function supervisorDoc(overrides = {}) {
  return {
    schema_version: TOPOLOGY_RECOVERY_SUPERVISOR_SCHEMA,
    attempted_at: "2026-08-14T08:02:00.000Z",
    completed_at: "2026-08-14T08:03:02.000Z",
    status: "ok",
    last_success_at: "2026-08-14T08:03:02.000Z",
    error_code: null,
    consecutive_errors: 0,
    ...overrides,
  };
}

test("recovery projection exposes the full v3 supervision receipt", () => {
  const projected = validateTopologyRecoveryCycle(cycle(), { now: NOW });
  assert.deepEqual(Object.keys(projected), [
    "schema_version", "attempted_at", "completed_at", "mode", "status",
    "state_revalidated", "recovery",
  ]);
  assert.equal(projected.state_revalidated, true);
  assert.deepEqual(Object.keys(projected.recovery[0]), [
    "node_id", "reason", "diagnostic_code", "repairability", "repair_action", "attempt", "verification",
    "escalation", "outcome_code", "circuit_state", "consecutive_failures",
    "last_attempt_at", "last_verified_repair_at", "next_retry_at",
  ]);
  assert.equal(projected.recovery[0].outcome_code, "precondition_unmet");
  assert.equal(projected.recovery[0].diagnostic_code, null);
  assert.equal(Object.hasOwn(projected, "evidence"), false);

  const ownerAction = cycle({
    recovery: [{
      ...cycle().recovery[0],
      outcome_code: "owner_action_required",
      repair_action: "none",
      verification: "not_run",
      diagnostic_code: "writer_authority_expired",
    }],
  });
  const validatedOwnerAction = validateTopologyRecoveryCycle(ownerAction, { now: NOW });
  assert.equal(validatedOwnerAction.recovery[0].outcome_code, "owner_action_required");
  assert.equal(validatedOwnerAction.recovery[0].repair_action, "none");
  assert.equal(validatedOwnerAction.recovery[0].verification, "not_run");
  assert.equal(validatedOwnerAction.recovery[0].diagnostic_code, "writer_authority_expired");
});

test("unsafe, duplicate, malformed, and future recovery rows fail closed", () => {
  const unsafe = cycle();
  unsafe.recovery[0].escalation = "operator@example.invalid";
  assert.throws(() => validateTopologyRecoveryCycle(unsafe, { now: NOW }), /topology_recovery_row_invalid/u);

  const badOutcome = cycle();
  badOutcome.recovery[0].outcome_code = "restarted";
  assert.throws(() => validateTopologyRecoveryCycle(badOutcome, { now: NOW }), /topology_recovery_row_invalid/u);

  const badDiagnostic = cycle();
  badDiagnostic.recovery[0].diagnostic_code = 123;
  assert.throws(() => validateTopologyRecoveryCycle(badDiagnostic, { now: NOW }), /topology_recovery_row_invalid/u);

  const badCircuit = cycle();
  badCircuit.recovery[0].circuit_state = "tripped";
  assert.throws(() => validateTopologyRecoveryCycle(badCircuit, { now: NOW }), /topology_recovery_row_invalid/u);

  const negativeFailures = cycle();
  negativeFailures.recovery[0].consecutive_failures = -1;
  assert.throws(() => validateTopologyRecoveryCycle(negativeFailures, { now: NOW }), /topology_recovery_row_invalid/u);

  const duplicate = cycle();
  duplicate.recovery.push({ ...duplicate.recovery[0] });
  assert.throws(() => validateTopologyRecoveryCycle(duplicate, { now: NOW }), /topology_recovery_row_invalid/u);

  const extra = cycle();
  extra.raw_detail = "not allowed";
  assert.throws(() => validateTopologyRecoveryCycle(extra, { now: NOW }), /topology_recovery_cycle_invalid/u);

  const future = cycle({ completed_at: "2026-08-14T08:11:00.000Z" });
  assert.throws(() => validateTopologyRecoveryCycle(future, { now: NOW }), /topology_recovery_time_invalid/u);

  const nonBoolean = cycle({ state_revalidated: "true" });
  assert.throws(() => validateTopologyRecoveryCycle(nonBoolean, { now: NOW }), /topology_recovery_cycle_invalid/u);
});

test("legacy v1 and v2 cycle receipts are never reinterpreted as v3 and fail closed", () => {
  const v1 = cycle();
  delete v1.state_revalidated;
  v1.schema_version = "soulforge.watchtower.recovery_cycle.v1";
  v1.recovery[0] = {
    node_id: "usage_codex_collector",
    reason: "processing_failed",
    repairability: "allowlisted",
    repair_action: "restart_owned_task",
    attempt: "denied",
    verification: "failed",
    escalation: "watchtower_operator",
  };
  assert.throws(() => validateTopologyRecoveryCycle(v1, { now: NOW }), /topology_recovery_cycle_invalid/u);

  const v2 = cycle();
  v2.schema_version = "soulforge.watchtower.recovery_cycle.v2";
  delete v2.recovery[0].diagnostic_code;
  assert.throws(() => validateTopologyRecoveryCycle(v2, { now: NOW }), /topology_recovery_cycle_invalid/u);
});

test("history rows validate the exact key set, bounded enums, and reject duplicates", () => {
  const valid = validateTopologyRecoveryHistory(historyDoc(), { now: NOW });
  assert.deepEqual(Object.keys(valid.entries[0]), [
    "at", "node_id", "reason", "diagnostic_code", "action", "attempt", "verification",
    "circuit_state", "next_retry_at", "outcome_code",
  ]);

  assert.throws(
    () => validateTopologyRecoveryHistory(historyDoc({
      entries: [{ ...historyDoc().entries[0], outcome_code: "restarted" }],
    }), { now: NOW }),
    /topology_recovery_history_row_invalid/u,
  );
  assert.throws(
    () => validateTopologyRecoveryHistory(historyDoc({
      entries: [historyDoc().entries[0], historyDoc().entries[0]],
    }), { now: NOW }),
    /topology_recovery_history_row_invalid/u,
  );
  assert.throws(
    () => validateTopologyRecoveryHistory(historyDoc({
      entries: Array.from({ length: 201 }, (_ignored, index) => ({
        ...historyDoc().entries[0],
        at: new Date(Date.parse(historyDoc().entries[0].at) - index * 1_000).toISOString(),
      })),
    }), { now: NOW }),
    /topology_recovery_history_invalid/u,
  );
  assert.throws(
    () => validateTopologyRecoveryHistory({ ...historyDoc(), raw_stdout: "boom" }, { now: NOW }),
    /topology_recovery_history_invalid/u,
  );
  assert.throws(
    () => validateTopologyRecoveryHistory(historyDoc({
      schema_version: "soulforge.watchtower.recovery_history.v1",
    }), { now: NOW }),
    /topology_recovery_history_invalid/u,
  );
});

test("regression P1-7: poisoned cycle rows with contradictory attempt, verification, or diagnostic_code fail closed", () => {
  const base = cycle().recovery[0];

  // verified_repair requires succeeded + passed + null diagnostic
  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "verified_repair", attempt: "failed", verification: "passed", diagnostic_code: null }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "verified_repair", attempt: "succeeded", verification: "failed", diagnostic_code: null }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "verified_repair", attempt: "succeeded", verification: "passed", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  // not_verified requires succeeded + (failed or not_run) + null diagnostic
  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "not_verified", attempt: "denied", verification: "failed", diagnostic_code: null }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "not_verified", attempt: "succeeded", verification: "failed", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  // owner_action_required requires denied/not_attempted + verification not_run + action none + non-null diagnostic
  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "owner_action_required", attempt: "succeeded", verification: "not_run", repair_action: "none", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "owner_action_required", attempt: "denied", verification: "failed", repair_action: "none", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "owner_action_required", attempt: "denied", verification: "not_run", repair_action: "restart_owned_task", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "owner_action_required", attempt: "denied", verification: "not_run", repair_action: "none", diagnostic_code: null }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);

  // precondition_unmet requires denied + failed + null diagnostic
  assert.throws(() => validateTopologyRecoveryCycle(cycle({
    recovery: [{ ...base, outcome_code: "precondition_unmet", attempt: "denied", verification: "failed", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_row_invalid/u);
});

test("regression P1-7: poisoned history rows with contradictory attempt, verification, or diagnostic_code fail closed", () => {
  const base = historyDoc().entries[0];

  assert.throws(() => validateTopologyRecoveryHistory(historyDoc({
    entries: [{ ...base, outcome_code: "verified_repair", attempt: "failed", verification: "passed", diagnostic_code: null }],
  }), { now: NOW }), /topology_recovery_history_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryHistory(historyDoc({
    entries: [{ ...base, outcome_code: "owner_action_required", attempt: "succeeded", verification: "not_run", action: "none", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_history_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryHistory(historyDoc({
    entries: [{ ...base, outcome_code: "owner_action_required", attempt: "denied", verification: "failed", action: "none", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_history_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryHistory(historyDoc({
    entries: [{ ...base, outcome_code: "owner_action_required", attempt: "denied", verification: "not_run", action: "restart_owned_task", diagnostic_code: "writer_authority_expired" }],
  }), { now: NOW }), /topology_recovery_history_row_invalid/u);

  assert.throws(() => validateTopologyRecoveryHistory(historyDoc({
    entries: [{ ...base, outcome_code: "owner_action_required", attempt: "denied", verification: "not_run", action: "none", diagnostic_code: null }],
  }), { now: NOW }), /topology_recovery_history_row_invalid/u);
});

test("supervisor receipt validates the exact key set, time order, and status enum", () => {
  const valid = validateTopologyRecoverySupervisor(supervisorDoc(), { now: NOW });
  assert.deepEqual(Object.keys(valid), [
    "schema_version", "attempted_at", "completed_at", "status",
    "last_success_at", "error_code", "consecutive_errors",
  ]);

  assert.throws(
    () => validateTopologyRecoverySupervisor(supervisorDoc({ status: "degraded" }), { now: NOW }),
    /topology_recovery_supervisor_invalid/u,
  );
  assert.throws(
    () => validateTopologyRecoverySupervisor(supervisorDoc({
      attempted_at: "2026-08-14T08:04:00.000Z", completed_at: "2026-08-14T08:03:02.000Z",
    }), { now: NOW }),
    /topology_recovery_supervisor_invalid/u,
  );
  assert.throws(
    () => validateTopologyRecoverySupervisor(supervisorDoc({ consecutive_errors: -1 }), { now: NOW }),
    /topology_recovery_supervisor_invalid/u,
  );
  assert.throws(
    () => validateTopologyRecoverySupervisor(supervisorDoc({
      error_code: path.resolve("test-fixtures", "state"),
    }), { now: NOW }),
    /topology_recovery_supervisor_invalid/u,
  );
});

test("reader classifies fresh, stale, and unavailable local receipts", async () => {
  const ownerRoot = path.join(tmpdir(), `topology-recovery-${process.pid}-${Date.now()}`);
  const receiptDirectory = path.join(
    ownerRoot, "guild_hall", "state", "operations", "watchtower", "external_evidence",
  );
  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(path.join(receiptDirectory, "recovery_cycle.json"), JSON.stringify(cycle()), "utf8");

  const ready = await readTopologyRecoveryProjection({ ownerRoot, now: () => NOW });
  assert.equal(ready.state, "ready");
  assert.equal(ready.cycle.recovery.length, 1);
  assert.equal(ready.cycle.state_revalidated, true);
  // History and supervisor files are absent: each fails closed on its own
  // instead of degrading the validated cycle.
  assert.deepEqual(ready.history, { state: "unavailable", entries: [] });
  assert.equal(ready.supervisor, null);

  const stale = await readTopologyRecoveryProjection({ ownerRoot, now: () => NOW + 20 * 60 * 1_000 });
  assert.equal(stale.state, "stale");

  const unavailable = await readTopologyRecoveryProjection({ ownerRoot: "relative", now: () => NOW });
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.cycle, null);
  assert.deepEqual(unavailable.history, { state: "unavailable", entries: [] });
  assert.equal(unavailable.supervisor, null);
});

test("reader independently loads valid history and supervisor receipts alongside the cycle", async () => {
  const ownerRoot = path.join(tmpdir(), `topology-recovery-full-${process.pid}-${Date.now()}`);
  const receiptDirectory = path.join(
    ownerRoot, "guild_hall", "state", "operations", "watchtower", "external_evidence",
  );
  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(path.join(receiptDirectory, "recovery_cycle.json"), JSON.stringify(cycle()), "utf8");
  await writeFile(path.join(receiptDirectory, "recovery_history.json"), JSON.stringify(historyDoc()), "utf8");
  await writeFile(path.join(receiptDirectory, "recovery_supervisor.json"), JSON.stringify(supervisorDoc()), "utf8");

  const projection = await readTopologyRecoveryProjection({ ownerRoot, now: () => NOW });
  assert.equal(projection.state, "ready");
  assert.equal(projection.history.state, "ready");
  assert.equal(projection.history.entries.length, 1);
  assert.equal(projection.supervisor.status, "ok");
});

test("a present-but-invalid history or supervisor receipt fails closed without affecting the cycle", async () => {
  const ownerRoot = path.join(tmpdir(), `topology-recovery-bad-${process.pid}-${Date.now()}`);
  const receiptDirectory = path.join(
    ownerRoot, "guild_hall", "state", "operations", "watchtower", "external_evidence",
  );
  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(path.join(receiptDirectory, "recovery_cycle.json"), JSON.stringify(cycle()), "utf8");
  await writeFile(path.join(receiptDirectory, "recovery_history.json"), "{ not json", "utf8");
  await writeFile(
    path.join(receiptDirectory, "recovery_supervisor.json"),
    JSON.stringify({ ...supervisorDoc(), raw_stdout: "boom" }),
    "utf8",
  );

  const projection = await readTopologyRecoveryProjection({ ownerRoot, now: () => NOW });
  assert.equal(projection.state, "ready");
  assert.deepEqual(projection.history, { state: "unavailable", entries: [] });
  assert.equal(projection.supervisor, null);
});

test("legacy v1 and v2 cycle receipts on disk are never reinterpreted as v3 and read unavailable", async () => {
  const ownerRoot = path.join(tmpdir(), `topology-recovery-legacy-${process.pid}-${Date.now()}`);
  const receiptDirectory = path.join(
    ownerRoot, "guild_hall", "state", "operations", "watchtower", "external_evidence",
  );
  await mkdir(receiptDirectory, { recursive: true });
  const v1Cycle = cycle();
  delete v1Cycle.state_revalidated;
  v1Cycle.schema_version = "soulforge.watchtower.recovery_cycle.v1";
  v1Cycle.recovery[0] = {
    node_id: "usage_codex_collector",
    reason: "processing_failed",
    repairability: "allowlisted",
    repair_action: "restart_owned_task",
    attempt: "denied",
    verification: "failed",
    escalation: "watchtower_operator",
  };
  await writeFile(path.join(receiptDirectory, "recovery_cycle.json"), JSON.stringify(v1Cycle), "utf8");

  const p1 = await readTopologyRecoveryProjection({ ownerRoot, now: () => NOW });
  assert.equal(p1.state, "unavailable");
  assert.equal(p1.cycle, null);

  const v2Cycle = cycle();
  v2Cycle.schema_version = "soulforge.watchtower.recovery_cycle.v2";
  delete v2Cycle.recovery[0].diagnostic_code;
  await writeFile(path.join(receiptDirectory, "recovery_cycle.json"), JSON.stringify(v2Cycle), "utf8");

  const p2 = await readTopologyRecoveryProjection({ ownerRoot, now: () => NOW });
  assert.equal(p2.state, "unavailable");
  assert.equal(p2.cycle, null);
});
