import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RECOVERY_BACKOFF_MS,
  RECOVERY_CIRCUIT_OPEN_MS,
  RECOVERY_HISTORY_MAX_ENTRIES,
  RECOVERY_HISTORY_SCHEMA_VERSION,
  RECOVERY_HISTORY_SCHEMA_VERSION_V1,
  RECOVERY_SUPERVISION_SCHEMA_VERSION,
  RECOVERY_SUPERVISION_SCHEMA_VERSION_V1,
  RECOVERY_SUPERVISOR_SCHEMA_VERSION,
  appendRecoveryHistory,
  applyAttemptOutcome,
  backoffMsForFailures,
  buildHistoryRow,
  classifyOwnedTaskGate,
  defaultSupervisionRow,
  persistRecoveryHistory,
  persistRecoverySupervisorReceipt,
  persistSupervisionState,
  planNodeAttempt,
  readRecoveryHistory,
  readSupervisionState,
  recoverySupervisionPaths,
  safeSupervisorErrorCode,
  validateLegacyRecoveryHistoryV1,
  validateLegacySupervisionStateV1,
  validateRecoveryHistory,
  validateSupervisionState,
} from "./recovery_supervision.mjs";

const T0 = Date.parse("2026-08-14T00:00:00.000Z");
const DIGEST = "a".repeat(64);

async function evidenceRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-recovery-supervision-"));
}

function state(nodes) {
  return {
    schema_version: RECOVERY_SUPERVISION_SCHEMA_VERSION,
    updated_at: new Date(T0).toISOString(),
    nodes,
  };
}

function historyRow(overrides = {}) {
  return {
    at: new Date(T0).toISOString(),
    node_id: "consumer_board",
    reason: "process_stopped",
    diagnostic_code: null,
    action: "restart_owned_task",
    attempt: "denied",
    verification: "not_run",
    circuit_state: "closed",
    next_retry_at: null,
    outcome_code: "suppressed_backoff",
    ...overrides,
  };
}

test("supervision state accepts only the exact key set and safe enum grammar", () => {
  const valid = validateSupervisionState(state([defaultSupervisionRow("consumer_board")]));
  assert.deepEqual(Object.keys(valid.nodes[0]), [
    "node_id", "consecutive_failures", "circuit_state", "last_attempt_at",
    "last_verified_repair_at", "last_failure_code", "next_retry_at",
  ]);

  // An extra field is a privacy leak surface, not an upgrade path.
  assert.throws(() => validateSupervisionState(state([
    { ...defaultSupervisionRow("consumer_board"), task_name: "Synthetic Board" },
  ])), /recovery_supervision_row_invalid/u);
  assert.throws(() => validateSupervisionState({
    ...state([]), raw_stdout: "boom",
  }), /recovery_supervision_invalid/u);

  // A missing field is equally rejected; nothing is defaulted in.
  const missing = defaultSupervisionRow("consumer_board");
  delete missing.next_retry_at;
  assert.throws(() => validateSupervisionState(state([missing])), /recovery_supervision_row_invalid/u);

  for (const bad of [
    { node_id: "Consumer Board" },
    { node_id: "../../etc" },
    { circuit_state: "half-open" },
    { circuit_state: "tripped" },
    { last_failure_code: "watchtower_probe" },
    { last_failure_code: path.resolve("test-fixtures", "state") },
    { consecutive_failures: -1 },
    { consecutive_failures: 100 },
    { consecutive_failures: 1.5 },
    { last_attempt_at: "2026-08-14T00:00:00Z" },
    { last_attempt_at: "not a time" },
    { next_retry_at: 1_760_000_000_000 },
  ]) {
    assert.throws(
      () => validateSupervisionState(state([{ ...defaultSupervisionRow("consumer_board"), ...bad }])),
      /recovery_supervision_row_invalid/u,
      `${JSON.stringify(bad)} should fail closed`,
    );
  }

  // Wrong schema version and duplicate nodes fail closed.
  assert.throws(() => validateSupervisionState({
    ...state([]), schema_version: "soulforge.watchtower.recovery_supervision.v0",
  }), /recovery_supervision_invalid/u);
  assert.throws(() => validateSupervisionState(state([
    defaultSupervisionRow("consumer_board"), defaultSupervisionRow("consumer_board"),
  ])), /recovery_supervision_row_invalid/u);
});

test("history rows reject unknown codes, raw text, duplicates, and unbounded size", () => {
  const valid = validateRecoveryHistory({
    schema_version: RECOVERY_HISTORY_SCHEMA_VERSION,
    updated_at: new Date(T0).toISOString(),
    entries: [historyRow()],
  });
  assert.deepEqual(Object.keys(valid.entries[0]), [
    "at", "node_id", "reason", "diagnostic_code", "action", "attempt", "verification",
    "circuit_state", "next_retry_at", "outcome_code",
  ]);

  const invalid = (entries, updatedAt = new Date(T0).toISOString()) => validateRecoveryHistory({
    schema_version: RECOVERY_HISTORY_SCHEMA_VERSION, updated_at: updatedAt, entries,
  });
  assert.throws(() => invalid([historyRow({ outcome_code: "restarted" })]), /recovery_history_row_invalid/u);
  assert.throws(() => invalid([historyRow({ diagnostic_code: "invalid code with spaces" })]), /recovery_history_row_invalid/u);
  assert.throws(() => invalid([historyRow({ action: "Start-ScheduledTask -TaskName x" })]), /recovery_history_row_invalid/u);
  assert.throws(() => invalid([historyRow({
    reason: path.resolve("test-fixtures", "state"),
  })]), /recovery_history_row_invalid/u);
  assert.throws(() => invalid([{ ...historyRow(), task_name: "Synthetic Board" }]), /recovery_history_row_invalid/u);
  assert.throws(() => invalid([historyRow(), historyRow()]), /recovery_history_row_invalid/u);
  assert.throws(
    () => invalid(Array.from({ length: RECOVERY_HISTORY_MAX_ENTRIES + 1 }, (_ignored, index) => historyRow({
      at: new Date(T0 + index * 1_000).toISOString(),
    }))),
    /recovery_history_invalid/u,
  );

  const withDiagnostic = validateRecoveryHistory({
    schema_version: RECOVERY_HISTORY_SCHEMA_VERSION,
    updated_at: new Date(T0).toISOString(),
    entries: [historyRow({ diagnostic_code: "writer_authority_expired", outcome_code: "owner_action_required", action: "none", verification: "not_run" })],
  });
  assert.equal(withDiagnostic.entries[0].diagnostic_code, "writer_authority_expired");

  // The same node at two different times is real history, not a duplicate.
  assert.equal(invalid([historyRow(), historyRow({ at: new Date(T0 + 1_000).toISOString() })]).entries.length, 2);
});

test("consecutive failures back off 5m, 15m, then 60m", () => {
  assert.deepEqual(RECOVERY_BACKOFF_MS, [5 * 60_000, 15 * 60_000, 60 * 60_000]);
  assert.equal(backoffMsForFailures(0), 0);
  assert.equal(backoffMsForFailures(1), 5 * 60_000);
  assert.equal(backoffMsForFailures(2), 15 * 60_000);
  assert.equal(backoffMsForFailures(3), 60 * 60_000);
  assert.equal(backoffMsForFailures(9), 60 * 60_000);

  const first = applyAttemptOutcome(defaultSupervisionRow("consumer_board"), {
    outcomeCode: "execution_failed", atMs: T0,
  });
  assert.equal(first.consecutive_failures, 1);
  assert.equal(first.circuit_state, "closed");
  assert.equal(first.last_failure_code, "execution_failed");
  assert.equal(first.next_retry_at, new Date(T0 + 5 * 60_000).toISOString());

  const second = applyAttemptOutcome(first, { outcomeCode: "postverify_failed", atMs: T0 + 5 * 60_000 });
  assert.equal(second.consecutive_failures, 2);
  assert.equal(second.circuit_state, "closed");
  assert.equal(second.next_retry_at, new Date(T0 + 5 * 60_000 + 15 * 60_000).toISOString());

  // Suppression, owner escalation, and observe mode never invent an attempt.
  for (const code of [
    "suppressed_backoff", "suppressed_circuit_open", "running_but_stale",
    "supervision_unavailable", "not_eligible", "forbidden", "observe_only",
  ]) {
    assert.deepEqual(applyAttemptOutcome(second, { outcomeCode: code, atMs: T0 + 60 * 60_000 }), second);
  }
  assert.deepEqual(applyAttemptOutcome(second, { outcomeCode: "unknown_code", atMs: T0 }), second);
});

test("the third consecutive failure opens the circuit for 60 minutes", () => {
  let row = defaultSupervisionRow("consumer_board");
  for (const step of [0, 1, 2]) {
    row = applyAttemptOutcome(row, { outcomeCode: "precondition_unmet", atMs: T0 + step * 60_000 });
  }
  assert.equal(row.consecutive_failures, 3);
  assert.equal(row.circuit_state, "open");
  assert.equal(row.next_retry_at, new Date(T0 + 2 * 60_000 + RECOVERY_CIRCUIT_OPEN_MS).toISOString());
  assert.equal(RECOVERY_CIRCUIT_OPEN_MS, 60 * 60_000);
});

test("an open circuit permits exactly one half-open probe after the full window", () => {
  const openedAt = T0;
  const open = applyAttemptOutcome(
    { ...defaultSupervisionRow("consumer_board"), consecutive_failures: 2 },
    { outcomeCode: "execution_failed", atMs: openedAt },
  );
  const retryMs = Date.parse(open.next_retry_at);

  assert.deepEqual(planNodeAttempt(open, retryMs - 1), {
    eligible: false, gate: "circuit_open", circuit_state: "open",
  });
  assert.deepEqual(planNodeAttempt(open, retryMs), {
    eligible: true, gate: "half_open", circuit_state: "half_open",
  });

  // A failed probe re-opens the circuit for another full window instead of
  // leaving a second probe available.
  const failedProbe = applyAttemptOutcome(open, { outcomeCode: "execution_failed", atMs: retryMs });
  assert.equal(failedProbe.circuit_state, "open");
  assert.equal(failedProbe.consecutive_failures, 4);
  assert.equal(failedProbe.next_retry_at, new Date(retryMs + RECOVERY_CIRCUIT_OPEN_MS).toISOString());
  assert.equal(planNodeAttempt(failedProbe, retryMs + 1).eligible, false);

  // Plain backoff waiting is a distinct gate from an open circuit.
  const waiting = applyAttemptOutcome(defaultSupervisionRow("consumer_board"), {
    outcomeCode: "execution_failed", atMs: T0,
  });
  assert.deepEqual(planNodeAttempt(waiting, T0 + 60_000), {
    eligible: false, gate: "backoff_wait", circuit_state: "closed",
  });
  assert.deepEqual(planNodeAttempt(waiting, T0 + 5 * 60_000), {
    eligible: true, gate: "ready", circuit_state: "closed",
  });
  assert.deepEqual(planNodeAttempt(defaultSupervisionRow("consumer_board"), T0), {
    eligible: true, gate: "ready", circuit_state: "closed",
  });

  // A malformed row is never treated as eligible.
  assert.equal(planNodeAttempt({ node_id: "consumer_board" }, T0).eligible, false);
  assert.equal(planNodeAttempt(open, Number.NaN).eligible, false);
});

test("only a verified repair resets the failure counters and the circuit", () => {
  let row = defaultSupervisionRow("consumer_board");
  for (const step of [0, 1, 2]) {
    row = applyAttemptOutcome(row, { outcomeCode: "execution_failed", atMs: T0 + step * 60_000 });
  }
  assert.equal(row.circuit_state, "open");

  const repaired = applyAttemptOutcome(row, { outcomeCode: "verified_repair", atMs: T0 + 4 * 60_000 });
  assert.deepEqual(repaired, {
    node_id: "consumer_board",
    consecutive_failures: 0,
    circuit_state: "closed",
    last_attempt_at: new Date(T0 + 4 * 60_000).toISOString(),
    last_verified_repair_at: new Date(T0 + 4 * 60_000).toISOString(),
    last_failure_code: null,
    next_retry_at: null,
  });
  assert.deepEqual(planNodeAttempt(repaired, T0 + 4 * 60_000), {
    eligible: true, gate: "ready", circuit_state: "closed",
  });
});

test("a running owned task is running_but_stale and is never classified as startable", () => {
  const task = (overrides = {}) => ({
    exists: true, enabled: true, state: "ready", action_digest: DIGEST, last_run_at: null, ...overrides,
  });
  assert.equal(classifyOwnedTaskGate(task({ state: "running" }), DIGEST), "running_but_stale");
  assert.equal(classifyOwnedTaskGate(task({ state: "ready" }), DIGEST), "startable");
  assert.equal(classifyOwnedTaskGate(task({ state: "queued" }), DIGEST), "startable");

  for (const bad of [
    { state: "disabled" }, { state: "missing" }, { state: "unknown" }, { state: "Ready" },
    { exists: false }, { enabled: false }, { action_digest: "b".repeat(64) }, { action_digest: null },
  ]) {
    assert.equal(classifyOwnedTaskGate(task(bad), DIGEST), "precondition_unmet", JSON.stringify(bad));
  }
  assert.equal(classifyOwnedTaskGate(null, DIGEST), "precondition_unmet");
  assert.equal(classifyOwnedTaskGate(task(), "not-a-digest"), "precondition_unmet");
  assert.equal(classifyOwnedTaskGate(task({ state: "running" }), "not-a-digest"), "precondition_unmet");
});

test("history keeps material transitions only and stays bounded at 200 entries", () => {
  const row = (at, outcomeCode, circuitState = "closed") => buildHistoryRow({
    at: new Date(at).toISOString(),
    nodeId: "consumer_board",
    reason: "process_stopped",
    action: "restart_owned_task",
    attempt: "denied",
    verification: "not_run",
    row: { circuit_state: circuitState, next_retry_at: null },
    outcomeCode,
  });

  // Repeated identical suppression collapses to the first transition.
  let entries = [];
  for (let cycle = 0; cycle < 12; cycle += 1) {
    entries = appendRecoveryHistory(entries, [row(T0 + cycle * 60_000, "suppressed_backoff")]);
  }
  assert.equal(entries.length, 1);

  // A changed outcome code or circuit state is a new material transition.
  entries = appendRecoveryHistory(entries, [row(T0 + 20 * 60_000, "suppressed_circuit_open", "open")]);
  entries = appendRecoveryHistory(entries, [row(T0 + 21 * 60_000, "suppressed_circuit_open", "open")]);
  assert.equal(entries.length, 2);

  // Executed attempts and verified repairs are always recorded so the circuit
  // opening stays auditable.
  entries = appendRecoveryHistory(entries, [row(T0 + 22 * 60_000, "execution_failed")]);
  entries = appendRecoveryHistory(entries, [row(T0 + 23 * 60_000, "execution_failed")]);
  entries = appendRecoveryHistory(entries, [row(T0 + 24 * 60_000, "verified_repair")]);
  entries = appendRecoveryHistory(entries, [row(T0 + 25 * 60_000, "verified_repair")]);
  assert.equal(entries.length, 6);

  // A repeated node/time pair is dropped instead of corrupting the ledger.
  assert.equal(appendRecoveryHistory(entries, [row(T0 + 25 * 60_000, "verified_repair")]).length, 6);

  // Different nodes keep independent transition memory.
  const twoNodes = appendRecoveryHistory([], [
    row(T0, "suppressed_backoff"),
    { ...row(T0, "suppressed_backoff"), node_id: "usage_meter" },
  ]);
  assert.deepEqual(twoNodes.map((entry) => entry.node_id), ["consumer_board", "usage_meter"]);

  let bounded = [];
  for (let cycle = 0; cycle < 260; cycle += 1) {
    bounded = appendRecoveryHistory(bounded, [row(T0 + cycle * 60_000, "execution_failed")]);
  }
  assert.equal(bounded.length, RECOVERY_HISTORY_MAX_ENTRIES);
  assert.equal(bounded.at(-1).at, new Date(T0 + 259 * 60_000).toISOString());
  assert.equal(bounded.at(0).at, new Date(T0 + 60 * 60_000).toISOString());
});

test("an absent state file is a first run and an unreadable one suppresses instead of resetting", async () => {
  const root = await evidenceRoot();
  assert.deepEqual(await readSupervisionState({ evidenceRoot: root }), {
    ok: true, present: false, rows: [],
  });
  assert.deepEqual(await readRecoveryHistory({ evidenceRoot: root }), {
    ok: true, present: false, entries: [],
  });

  const persisted = await persistSupervisionState({
    evidenceRoot: root,
    rows: [defaultSupervisionRow("consumer_board"), defaultSupervisionRow("usage_meter")],
    keepNodeIds: new Set(["consumer_board"]),
    updatedAt: new Date(T0).toISOString(),
  });
  // Nodes that left the binding are dropped rather than carried forward.
  assert.deepEqual(persisted.nodes.map((node) => node.node_id), ["consumer_board"]);
  const roundTrip = await readSupervisionState({ evidenceRoot: root });
  assert.equal(roundTrip.ok, true);
  assert.equal(roundTrip.rows.length, 1);

  await writeFile(recoverySupervisionPaths(root).state, "{ not json", "utf8");
  assert.deepEqual(await readSupervisionState({ evidenceRoot: root }), {
    ok: false, present: true, rows: [],
  });

  await writeFile(
    recoverySupervisionPaths(root).state,
    JSON.stringify(state([{ ...defaultSupervisionRow("consumer_board"), task_name: "Synthetic" }])),
    "utf8",
  );
  assert.equal((await readSupervisionState({ evidenceRoot: root })).ok, false);

  await writeFile(recoverySupervisionPaths(root).history, "{ not json", "utf8");
  assert.deepEqual(await readRecoveryHistory({ evidenceRoot: root }), {
    ok: false, present: true, entries: [],
  });

  assert.throws(() => recoverySupervisionPaths("relative/path"), /recovery_evidence_root_invalid/u);
});

test("supervisor receipts retain the last good cycle and never carry raw exception text", async () => {
  const root = await evidenceRoot();
  const ok = await persistRecoverySupervisorReceipt({
    evidenceRoot: root,
    attemptedAt: new Date(T0).toISOString(),
    status: "ok",
    now: () => new Date(T0 + 1_000),
  });
  assert.deepEqual(Object.keys(ok), [
    "schema_version", "attempted_at", "completed_at", "status",
    "last_success_at", "error_code", "consecutive_errors",
  ]);
  assert.equal(ok.schema_version, RECOVERY_SUPERVISOR_SCHEMA_VERSION);
  assert.equal(ok.last_success_at, new Date(T0 + 1_000).toISOString());
  assert.equal(ok.consecutive_errors, 0);
  assert.equal(ok.error_code, null);

  const failed = await persistRecoverySupervisorReceipt({
    evidenceRoot: root,
    attemptedAt: new Date(T0 + 5 * 60_000).toISOString(),
    status: "error",
    errorCode: "recovery_binding_invalid",
    now: () => new Date(T0 + 5 * 60_000 + 500),
  });
  // The last good cycle is retained across a failure.
  assert.equal(failed.last_success_at, new Date(T0 + 1_000).toISOString());
  assert.equal(failed.error_code, "recovery_binding_invalid");
  assert.equal(failed.consecutive_errors, 1);

  const again = await persistRecoverySupervisorReceipt({
    evidenceRoot: root,
    attemptedAt: new Date(T0 + 10 * 60_000).toISOString(),
    status: "error",
    errorCode: `${path.resolve("test-fixtures", "state", "watchtower")} failed`,
    now: () => new Date(T0 + 10 * 60_000 + 500),
  });
  assert.equal(again.error_code, "recovery_cycle_failed");
  assert.equal(again.consecutive_errors, 2);
  assert.equal(again.last_success_at, new Date(T0 + 1_000).toISOString());

  await assert.rejects(() => persistRecoverySupervisorReceipt({
    evidenceRoot: root, attemptedAt: "2026-08-14T00:00:00Z", status: "ok",
  }), /recovery_supervisor_receipt_invalid/u);
  await assert.rejects(() => persistRecoverySupervisorReceipt({
    evidenceRoot: root, attemptedAt: new Date(T0).toISOString(), status: "degraded",
  }), /recovery_supervisor_receipt_invalid/u);
});

test("supervisor error codes never echo raw exception text, paths, or task names", () => {
  assert.equal(safeSupervisorErrorCode(new TypeError("recovery_binding_invalid")), "recovery_binding_invalid");
  assert.equal(safeSupervisorErrorCode(new Error("recovery_root_invalid")), "recovery_root_invalid");
  for (const message of [
    `ENOENT: no such file or directory, open '${path.resolve("test-fixtures", "state", "x.json")}'`,
    "Start-ScheduledTask -TaskName 'Synthetic Board' failed",
    "connect ECONNREFUSED 127.0.0.1:5173",
    "Recovery_Failed",
    "",
  ]) {
    assert.equal(safeSupervisorErrorCode(new Error(message)), "recovery_cycle_failed", message);
  }
  assert.equal(safeSupervisorErrorCode(null), "recovery_cycle_failed");
  assert.equal(safeSupervisorErrorCode({ message: { toString: () => "leak" } }), "recovery_cycle_failed");
});

test("deployment compatibility: valid full v1 history migrates to v2 on read without row loss or order change", async () => {
  const root = await evidenceRoot();
  const v1Entries = Array.from({ length: 200 }, (_, index) => ({
    at: new Date(T0 + index * 1_000).toISOString(),
    node_id: `node_${index % 10}`,
    reason: "process_stopped",
    action: "restart_owned_task",
    attempt: "denied",
    verification: "not_run",
    circuit_state: "closed",
    next_retry_at: null,
    outcome_code: "suppressed_backoff",
  }));
  const v1Doc = {
    schema_version: RECOVERY_HISTORY_SCHEMA_VERSION_V1,
    updated_at: new Date(T0 + 200 * 1_000).toISOString(),
    entries: v1Entries,
  };
  await writeFile(recoverySupervisionPaths(root).history, JSON.stringify(v1Doc), "utf8");

  const res = await readRecoveryHistory({ evidenceRoot: root });
  assert.equal(res.ok, true);
  assert.equal(res.present, true);
  assert.equal(res.entries.length, 200);
  for (let i = 0; i < 200; i++) {
    assert.equal(res.entries[i].at, v1Entries[i].at);
    assert.equal(res.entries[i].node_id, v1Entries[i].node_id);
    assert.equal(res.entries[i].diagnostic_code, null);
    assert.equal(res.entries[i].outcome_code, v1Entries[i].outcome_code);
  }
});

test("deployment compatibility: invalid v1 history fails closed and causes suppression", async () => {
  const root = await evidenceRoot();
  const invalidV1Doc = {
    schema_version: RECOVERY_HISTORY_SCHEMA_VERSION_V1,
    updated_at: new Date(T0).toISOString(),
    entries: [{
      at: new Date(T0).toISOString(),
      node_id: "consumer_board",
      reason: "process_stopped",
      action: "restart_owned_task",
      attempt: "denied",
      verification: "not_run",
      circuit_state: "closed",
      next_retry_at: null,
      outcome_code: "restarted", // invalid outcome enum in v1
    }],
  };
  await writeFile(recoverySupervisionPaths(root).history, JSON.stringify(invalidV1Doc), "utf8");

  const res = await readRecoveryHistory({ evidenceRoot: root });
  assert.equal(res.ok, false);
  assert.equal(res.present, true);
  assert.deepEqual(res.entries, []);
});

test("deployment compatibility: normal persist after migration writes v2 schema and preserves all rows", async () => {
  const root = await evidenceRoot();
  const v1Doc = {
    schema_version: RECOVERY_HISTORY_SCHEMA_VERSION_V1,
    updated_at: new Date(T0).toISOString(),
    entries: [{
      at: new Date(T0).toISOString(),
      node_id: "consumer_board",
      reason: "process_stopped",
      action: "restart_owned_task",
      attempt: "denied",
      verification: "not_run",
      circuit_state: "closed",
      next_retry_at: null,
      outcome_code: "suppressed_backoff",
    }],
  };
  await writeFile(recoverySupervisionPaths(root).history, JSON.stringify(v1Doc), "utf8");

  const readRes = await readRecoveryHistory({ evidenceRoot: root });
  assert.equal(readRes.ok, true);

  const newEntry = buildHistoryRow({
    at: new Date(T0 + 60_000).toISOString(),
    nodeId: "ingress_supervisor",
    reason: "heartbeat_stale",
    diagnosticCode: "writer_authority_expired",
    action: "none",
    attempt: "denied",
    verification: "not_run",
    row: defaultSupervisionRow("ingress_supervisor"),
    outcomeCode: "owner_action_required",
  });

  const merged = appendRecoveryHistory(readRes.entries, [newEntry]);
  await persistRecoveryHistory({
    evidenceRoot: root,
    entries: merged,
    updatedAt: new Date(T0 + 60_000).toISOString(),
  });

  // Verify on-disk file is now exact v2
  const reRead = await readRecoveryHistory({ evidenceRoot: root });
  assert.equal(reRead.ok, true);
  assert.equal(reRead.entries.length, 2);
  assert.equal(reRead.entries[0].node_id, "consumer_board");
  assert.equal(reRead.entries[0].diagnostic_code, null);
  assert.equal(reRead.entries[1].node_id, "ingress_supervisor");
  assert.equal(reRead.entries[1].diagnostic_code, "writer_authority_expired");
});

test("deployment compatibility: valid v2 history reads unchanged", async () => {
  const root = await evidenceRoot();
  const v2Doc = {
    schema_version: RECOVERY_HISTORY_SCHEMA_VERSION,
    updated_at: new Date(T0).toISOString(),
    entries: [{
      at: new Date(T0).toISOString(),
      node_id: "ingress_supervisor",
      reason: "heartbeat_stale",
      diagnostic_code: "writer_authority_expired",
      action: "none",
      attempt: "denied",
      verification: "not_run",
      circuit_state: "closed",
      next_retry_at: null,
      outcome_code: "owner_action_required",
    }],
  };
  await writeFile(recoverySupervisionPaths(root).history, JSON.stringify(v2Doc), "utf8");

  const res = await readRecoveryHistory({ evidenceRoot: root });
  assert.equal(res.ok, true);
  assert.equal(res.entries.length, 1);
  assert.equal(res.entries[0].diagnostic_code, "writer_authority_expired");
});

test("deployment compatibility: valid v1 supervision migrates to v2 on read and clears last_verified_repair_at", async () => {
  const root = await evidenceRoot();
  const v1State = {
    schema_version: RECOVERY_SUPERVISION_SCHEMA_VERSION_V1,
    updated_at: new Date(T0).toISOString(),
    nodes: [{
      node_id: "ingress_supervisor",
      consecutive_failures: 2,
      circuit_state: "closed",
      last_attempt_at: new Date(T0 - 300_000).toISOString(),
      last_verified_repair_at: new Date(T0 - 600_000).toISOString(), // old untrustworthy repair timestamp
      last_failure_code: "postverify_failed",
      next_retry_at: new Date(T0 + 900_000).toISOString(),
    }],
  };
  await writeFile(recoverySupervisionPaths(root).state, JSON.stringify(v1State), "utf8");

  const res = await readSupervisionState({ evidenceRoot: root });
  assert.equal(res.ok, true);
  assert.equal(res.present, true);
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].node_id, "ingress_supervisor");
  assert.equal(res.rows[0].consecutive_failures, 2);
  assert.equal(res.rows[0].circuit_state, "closed");
  assert.equal(res.rows[0].last_attempt_at, new Date(T0 - 300_000).toISOString());
  assert.equal(res.rows[0].last_verified_repair_at, null); // cleared!
  assert.equal(res.rows[0].last_failure_code, "postverify_failed");
  assert.equal(res.rows[0].next_retry_at, new Date(T0 + 900_000).toISOString());
});

test("deployment compatibility: invalid v1 supervision fails closed and causes suppression", async () => {
  const root = await evidenceRoot();
  const invalidV1State = {
    schema_version: RECOVERY_SUPERVISION_SCHEMA_VERSION_V1,
    updated_at: new Date(T0).toISOString(),
    nodes: [{
      node_id: "ingress_supervisor",
      consecutive_failures: 2,
      circuit_state: "tripped", // invalid circuit enum
      last_attempt_at: null,
      last_verified_repair_at: null,
      last_failure_code: null,
      next_retry_at: null,
    }],
  };
  await writeFile(recoverySupervisionPaths(root).state, JSON.stringify(invalidV1State), "utf8");

  const res = await readSupervisionState({ evidenceRoot: root });
  assert.equal(res.ok, false);
  assert.equal(res.present, true);
  assert.deepEqual(res.rows, []);
});

test("deployment compatibility: normal persist after supervision migration writes v2 schema", async () => {
  const root = await evidenceRoot();
  const v1State = {
    schema_version: RECOVERY_SUPERVISION_SCHEMA_VERSION_V1,
    updated_at: new Date(T0).toISOString(),
    nodes: [{
      node_id: "ingress_supervisor",
      consecutive_failures: 1,
      circuit_state: "closed",
      last_attempt_at: new Date(T0).toISOString(),
      last_verified_repair_at: new Date(T0).toISOString(),
      last_failure_code: "postverify_failed",
      next_retry_at: null,
    }],
  };
  await writeFile(recoverySupervisionPaths(root).state, JSON.stringify(v1State), "utf8");

  const readRes = await readSupervisionState({ evidenceRoot: root });
  assert.equal(readRes.ok, true);

  await persistSupervisionState({
    evidenceRoot: root,
    rows: readRes.rows,
    keepNodeIds: ["ingress_supervisor"],
    updatedAt: new Date(T0 + 60_000).toISOString(),
  });

  const reRead = await readSupervisionState({ evidenceRoot: root });
  assert.equal(reRead.ok, true);
  assert.equal(reRead.rows[0].last_verified_repair_at, null);
});

test("deployment compatibility: valid v2 supervision reads unchanged", async () => {
  const root = await evidenceRoot();
  const v2State = {
    schema_version: RECOVERY_SUPERVISION_SCHEMA_VERSION,
    updated_at: new Date(T0).toISOString(),
    nodes: [{
      node_id: "ingress_supervisor",
      consecutive_failures: 0,
      circuit_state: "closed",
      last_attempt_at: new Date(T0).toISOString(),
      last_verified_repair_at: new Date(T0).toISOString(),
      last_failure_code: null,
      next_retry_at: null,
    }],
  };
  await writeFile(recoverySupervisionPaths(root).state, JSON.stringify(v2State), "utf8");

  const res = await readSupervisionState({ evidenceRoot: root });
  assert.equal(res.ok, true);
  assert.equal(res.rows[0].last_verified_repair_at, new Date(T0).toISOString());
});
