import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendSourceLaneRecord,
  createSourceLaneLedger,
  projectSourceLaneEvidence,
  projectSourceLaneRecords,
} from "../src/source_lane_ledger.mjs";

const DIGEST = `sha256:${"ab".repeat(32)}`;
const OTHER_DIGEST = `sha256:${"cd".repeat(32)}`;

const CAPTURE = Object.freeze({
  record_kind: "capture_generation",
  source_ref: "source.mail",
  generation_seq: 104,
  capture_ref: "capture.mail.gen-104",
  manifest_ref: "manifest.mail.gen-104",
  item_count: 512,
  content_digest: DIGEST,
  captured_at: "2026-08-31T01:00:00Z",
  immutable: true,
});

const BACKUP = Object.freeze({
  record_kind: "backup_generation_pointer",
  source_ref: "source.mail",
  generation_seq: 104,
  backup_generation_ref: "backup.mail.gen-104",
  content_digest: DIGEST,
  backed_up_at: "2026-08-31T02:00:00Z",
});

const RESTORE = Object.freeze({
  record_kind: "restore_test",
  source_ref: "source.mail",
  restore_test_ref: "restore_test.mail.gen-104",
  backup_generation_ref: "backup.mail.gen-104",
  isolated_root_ref: "recovery.test_root.mail",
  readback_digest: DIGEST,
  restored_at: "2026-08-31T03:00:00Z",
  human_acceptance_state: "accepted",
});

const LEGACY = Object.freeze({
  record_kind: "legacy_path_map_note",
  source_ref: "source.mail",
  legacy_ref: "legacy.mail.hiworks_inbox",
  note_ref: null,
});

const append = (ledger, record, sourceRef = "source.mail") =>
  appendSourceLaneRecord(ledger, { source_ref: sourceRef, record });

const evidenceArgs = (ledger, overrides = {}) => ({
  ledger,
  source_ref: "source.mail",
  binding_state: "bound",
  evaluation_time: "2026-08-31T04:00:00Z",
  freshness_horizon_seconds: 24 * 3600,
  retention_policy_ref: "policy.retention.mail.v0",
  rpo_policy_ref: "policy.rpo.mail.v0",
  ...overrides,
});

test("the ledger handle is opaque and an unknown lookalike always HOLDs", () => {
  const ledger = createSourceLaneLedger();
  assert.equal(Object.isFrozen(ledger), true);
  assert.deepEqual(Object.keys(ledger), ["kind"]);
  assert.equal(ledger.records, undefined);
  assert.equal(ledger.append, undefined);
  assert.equal(ledger.delete, undefined);
  assert.equal(ledger.update, undefined);

  const lookalike = Object.freeze({ kind: ledger.kind });
  assert.deepEqual(append(lookalike, CAPTURE), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_LEDGER_UNKNOWN",
  });
  assert.deepEqual(projectSourceLaneRecords(lookalike, { source_ref: "source.mail" }), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_LEDGER_UNKNOWN",
  });
});

test("all four validated record kinds append and the source projection is deeply frozen", () => {
  const ledger = createSourceLaneLedger();
  for (const record of [CAPTURE, BACKUP, RESTORE, LEGACY]) {
    assert.equal(append(ledger, record).status, "APPENDED");
  }

  const projection = projectSourceLaneRecords(ledger, { source_ref: "source.mail" });
  assert.equal(projection.status, "PROJECTED");
  assert.equal(projection.record_count, 4);
  assert.deepEqual(projection.records.map(({ record_kind }) => record_kind), [
    "capture_generation", "backup_generation_pointer", "restore_test",
    "legacy_path_map_note",
  ]);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.records), true);
  assert.equal(Object.isFrozen(projection.records[0]), true);
  assert.throws(() => projection.records.push(CAPTURE), TypeError);
  assert.throws(() => { projection.records[0].capture_ref = "capture.forged"; }, TypeError);
});

test("natural-identity replay is a deterministic NO_OP and divergence is a fixed conflict HOLD", () => {
  const ledger = createSourceLaneLedger();
  const first = append(ledger, CAPTURE);
  const replay = append(ledger, { ...CAPTURE });
  const conflict = append(ledger, { ...CAPTURE, item_count: 513 });

  assert.equal(first.status, "APPENDED");
  assert.equal(replay.status, "NO_OP");
  assert.equal(replay.record_identity, first.record_identity);
  assert.deepEqual(conflict, {
    status: "HOLD",
    hold_code: "SOURCE_LANE_RECORD_CONFLICT",
  });
  assert.equal(projectSourceLaneRecords(ledger, { source_ref: "source.mail" }).record_count, 1);
});

test("backup and restore natural identities also refuse divergent immutable replay", () => {
  const ledger = createSourceLaneLedger();
  for (const record of [CAPTURE, BACKUP, RESTORE]) {
    assert.equal(append(ledger, record).status, "APPENDED");
  }
  assert.equal(append(ledger, { ...BACKUP }).status, "NO_OP");
  assert.deepEqual(append(ledger, { ...BACKUP, backed_up_at: "2026-08-31T02:30:00Z" }), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_RECORD_CONFLICT",
  });
  assert.equal(append(ledger, { ...RESTORE }).status, "NO_OP");
  assert.deepEqual(append(ledger, { ...RESTORE, human_acceptance_state: "pending" }), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_RECORD_CONFLICT",
  });
  assert.equal(projectSourceLaneRecords(ledger, { source_ref: "source.mail" }).record_count, 3);
});

test("scope cannot widen and invalid or hostile inputs return redacted fixed HOLDs", () => {
  const ledger = createSourceLaneLedger();
  assert.deepEqual(append(ledger, CAPTURE, "source.slack"), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_SCOPE_MISMATCH",
  });
  for (const record of [
    { ...CAPTURE, raw_message: "private body" },
    { ...CAPTURE, api_key: "private-secret" },
    { ...CAPTURE, capture_ref: ["C:", "private", "capture"].join("/") },
    { ...CAPTURE, content_digest: "md5:abc" },
    { ...CAPTURE, extra: { nested: true } },
  ]) {
    assert.deepEqual(append(ledger, record), {
      status: "HOLD",
      hold_code: "SOURCE_LANE_RECORD_INVALID",
    });
  }

  let getterCalled = false;
  const accessor = { ...CAPTURE };
  Object.defineProperty(accessor, "item_count", {
    enumerable: true,
    get() {
      getterCalled = true;
      throw new Error("private getter result");
    },
  });
  assert.deepEqual(append(ledger, accessor), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_RECORD_INVALID",
  });
  assert.equal(getterCalled, false);
  const hostileProxy = new Proxy({}, {
    getOwnPropertyDescriptor() { throw new Error("private trap result"); },
  });
  assert.deepEqual(appendSourceLaneRecord(ledger, hostileProxy), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_INPUT_INVALID",
  });
  const symbolField = { ...CAPTURE, [Symbol("private")]: "hidden" };
  assert.deepEqual(append(ledger, symbolField), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_RECORD_INVALID",
  });
  assert.equal(projectSourceLaneRecords(ledger, { source_ref: "source.mail" }).record_count, 0);
});

test("capture generations move strictly forward; forks and reused refs never append", () => {
  const ledger = createSourceLaneLedger();
  assert.equal(append(ledger, CAPTURE).status, "APPENDED");

  const regressed = { ...CAPTURE, generation_seq: 103, capture_ref: "capture.mail.gen-103" };
  assert.deepEqual(append(ledger, regressed), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_GENERATION_REGRESSION",
  });
  const reusedRef = {
    ...CAPTURE,
    generation_seq: 105,
    manifest_ref: "manifest.mail.gen-105",
    captured_at: "2026-08-31T02:00:00Z",
  };
  assert.deepEqual(append(ledger, reusedRef), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_RECORD_REF_CONFLICT",
  });
  const timeRegressed = {
    ...CAPTURE,
    generation_seq: 106,
    capture_ref: "capture.mail.gen-106",
    manifest_ref: "manifest.mail.gen-106",
    captured_at: "2026-08-31T00:59:59Z",
  };
  assert.deepEqual(append(ledger, timeRegressed), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_CHAIN_TIME_INVALID",
  });
  assert.equal(projectSourceLaneRecords(ledger, { source_ref: "source.mail" }).record_count, 1);
});

test("backup append requires an exact capture generation, digest, and forward clock", () => {
  const ledger = createSourceLaneLedger();
  assert.deepEqual(append(ledger, BACKUP), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_CAPTURE_REQUIRED",
  });
  assert.equal(append(ledger, CAPTURE).status, "APPENDED");
  assert.deepEqual(append(ledger, { ...BACKUP, content_digest: OTHER_DIGEST }), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_CHAIN_INTEGRITY_HOLD",
  });
  assert.deepEqual(append(ledger, { ...BACKUP, backed_up_at: "2026-08-31T00:59:59Z" }), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_CHAIN_TIME_INVALID",
  });
  assert.equal(append(ledger, BACKUP).status, "APPENDED");
  assert.equal(projectSourceLaneRecords(ledger, { source_ref: "source.mail" }).record_count, 2);
});

test("restore append requires its exact backup and readback chain before any mutation", () => {
  const ledger = createSourceLaneLedger();
  assert.equal(append(ledger, CAPTURE).status, "APPENDED");
  assert.deepEqual(append(ledger, RESTORE), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_BACKUP_REQUIRED",
  });
  assert.equal(append(ledger, BACKUP).status, "APPENDED");
  assert.deepEqual(append(ledger, { ...RESTORE, readback_digest: OTHER_DIGEST }), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_CHAIN_INTEGRITY_HOLD",
  });
  assert.deepEqual(append(ledger, { ...RESTORE, restored_at: "2026-08-31T01:59:59Z" }), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_CHAIN_TIME_INVALID",
  });
  assert.equal(append(ledger, RESTORE).status, "APPENDED");
  assert.equal(projectSourceLaneRecords(ledger, { source_ref: "source.mail" }).record_count, 3);
});

test("per-source evidence is unknown without capture, degraded with missing links, and complete only for the accepted chain", () => {
  const ledger = createSourceLaneLedger();
  const none = projectSourceLaneEvidence(evidenceArgs(ledger));
  assert.equal(none.status, "PROJECTED");
  assert.equal(none.readiness_state, "unknown");
  assert.equal(none.assembly.status, "no_evidence");

  const noPolicies = projectSourceLaneEvidence({
    ledger,
    source_ref: "source.mail",
    binding_state: "bound",
    evaluation_time: "2026-08-31T04:00:00Z",
    freshness_horizon_seconds: 24 * 3600,
  });
  assert.equal(noPolicies.status, "PROJECTED");
  assert.equal(noPolicies.readiness_state, "unknown");

  assert.equal(append(ledger, CAPTURE).status, "APPENDED");
  const captureOnly = projectSourceLaneEvidence(evidenceArgs(ledger));
  assert.equal(captureOnly.readiness_state, "degraded");
  assert.equal(captureOnly.assembly.evidence.backup_generation_ref, undefined);
  assert.equal(captureOnly.assembly.evidence.restore_test_ref, undefined);

  assert.equal(append(ledger, BACKUP).status, "APPENDED");
  const noRestore = projectSourceLaneEvidence(evidenceArgs(ledger));
  assert.equal(noRestore.readiness_state, "degraded");
  assert.equal(noRestore.assembly.evidence.backup_generation_ref, BACKUP.backup_generation_ref);
  assert.equal(noRestore.assembly.evidence.restore_test_ref, undefined);

  assert.equal(append(ledger, RESTORE).status, "APPENDED");
  const complete = projectSourceLaneEvidence(evidenceArgs(ledger));
  assert.equal(complete.readiness_state, "evidence_complete");
  assert.equal(complete.assembly.evidence.restore_test_ref, RESTORE.restore_test_ref);
  assert.equal(Object.isFrozen(complete), true);
  assert.equal(Object.isFrozen(complete.assembly.evidence), true);
});

test("pending human acceptance stays degraded and source projections remain isolated", () => {
  const ledger = createSourceLaneLedger();
  for (const record of [CAPTURE, BACKUP, { ...RESTORE, human_acceptance_state: "pending" }]) {
    assert.equal(append(ledger, record).status, "APPENDED");
  }
  const pending = projectSourceLaneEvidence(evidenceArgs(ledger));
  assert.equal(pending.readiness_state, "degraded");
  assert.equal(pending.assembly.evidence.human_acceptance_state, "pending");

  const slack = { ...CAPTURE, source_ref: "source.slack", capture_ref: "capture.slack.gen-104", manifest_ref: "manifest.slack.gen-104" };
  assert.equal(append(ledger, slack, "source.slack").status, "APPENDED");
  assert.equal(projectSourceLaneRecords(ledger, { source_ref: "source.mail" }).record_count, 3);
  assert.equal(projectSourceLaneRecords(ledger, { source_ref: "source.slack" }).record_count, 1);
});

test("legacy notes never affect evidence and invalid projection claims return one redacted HOLD", () => {
  const ledger = createSourceLaneLedger();
  assert.equal(append(ledger, CAPTURE).status, "APPENDED");
  const before = projectSourceLaneEvidence(evidenceArgs(ledger));
  assert.equal(append(ledger, LEGACY).status, "APPENDED");
  const after = projectSourceLaneEvidence(evidenceArgs(ledger));
  assert.deepEqual(after.assembly, before.assembly);

  assert.deepEqual(projectSourceLaneEvidence(evidenceArgs(ledger, {
    evaluation_time: "not-a-clock-with-private-detail",
  })), {
    status: "HOLD",
    hold_code: "SOURCE_LANE_EVIDENCE_HOLD",
  });
});
