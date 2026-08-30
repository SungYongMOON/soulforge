import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assembleSourceLaneEvidence,
  validateLaneRecord,
} from "../src/source_lane_index.mjs";
import { createPathRegistry, registrySnapshot } from "../src/path_registry_core.mjs";
import { buildStorageMap } from "../src/storage_map_projection.mjs";
import { seedRows } from "../data/registry_seed_v0.mjs";

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

function assemble(overrides = {}) {
  return assembleSourceLaneEvidence({
    source_ref: "source.mail",
    records: [CAPTURE, BACKUP, RESTORE],
    binding_state: "bound",
    evaluation_time: "2026-08-31T04:00:00Z",
    freshness_horizon_seconds: 24 * 3600,
    retention_policy_ref: "policy.retention.mail.v0",
    rpo_policy_ref: "policy.rpo.mail.v0",
    ...overrides,
  });
}

test("lane records validate refs-only; payload and absolute paths reject", () => {
  assert.equal(validateLaneRecord(CAPTURE).record_kind, "capture_generation");
  assert.equal(validateLaneRecord({
    record_kind: "legacy_path_map_note",
    source_ref: "source.mail",
    legacy_ref: "legacy.mail.hiworks_inbox",
    note_ref: null,
  }).record_kind, "legacy_path_map_note");
  assert.throws(() => validateLaneRecord({ ...CAPTURE, payload: "raw bytes" }), /forbidden_record_key/);
  assert.throws(() => validateLaneRecord({ ...CAPTURE, content_digest: "md5:abc" }), /digest_invalid/);
  assert.throws(() => validateLaneRecord({ ...CAPTURE, immutable: false }), /record_invalid/);
  assert.throws(
    () => validateLaneRecord({ ...CAPTURE, capture_ref: ["C:", "captures"].join("/") }),
    /ref_invalid|absolute_path_forbidden/,
  );
  assert.throws(() => validateLaneRecord({ ...CAPTURE, record_kind: "card" }), /record_kind_invalid/);
});

test("a full verified chain assembles evidence that renders healthy in R3", () => {
  const assembled = assemble();
  assert.equal(assembled.status, "assembled");
  assert.deepEqual(assembled.evidence, {
    binding_state: "bound",
    latest_capture_ref: "capture.mail.gen-104",
    backup_generation_ref: "backup.mail.gen-104",
    freshness_state: "fresh",
    retention_policy_ref: "policy.retention.mail.v0",
    rpo_policy_ref: "policy.rpo.mail.v0",
    restore_test_ref: "restore_test.mail.gen-104",
    human_acceptance_state: "accepted",
    evidence_at: "2026-08-31T03:00:00Z",
  });

  // End-to-end into the REAL R3 contract: a current mail row under resolved
  // authority (synthetic, caller-asserted) renders healthy with this
  // evidence. The tracked seed's sentinels would render hold by design.
  const rows = seedRows()
    .filter((row) => row.logical_path_id === "source.mail")
    .map((row) => ({
      ...row,
      current_state: "current",
      module_owner_ref: "guild_hall.path_registry",
      owner_refs: {
        logical: "owner.logical",
        byte: "owner.byte",
        revision: "owner.revision",
        acceptance: "owner.acceptance",
        backup_restore: "owner.backup_restore",
      },
      acl_policy_ref: "policy.acl.v0",
      retention_policy_ref: "policy.retention.v0",
    }));
  const snapshot = registrySnapshot(createPathRegistry({
    authority: {
      registry_schema_owner: "owner.registry_schema",
      private_binding_writer: "writer.binding_svc",
      resolver_runtime_owner: "owner.resolver_runtime",
      write_policy_owner: "owner.write_policy",
    },
    rows,
  }));
  const map = buildStorageMap({
    registry_snapshot: snapshot,
    evidence: { "source.mail": assembled.evidence },
  });
  assert.equal(map.rows[0].watch_state, "healthy");
});

test("missing links degrade honestly instead of being invented", () => {
  // No captures at all: supply nothing (R3 renders unknown).
  assert.deepEqual(
    assemble({ records: [] }),
    { status: "no_evidence", reason: "no_capture_generation" },
  );
  // Capture only: no backup/restore refs appear.
  const captureOnly = assemble({ records: [CAPTURE] });
  assert.equal(captureOnly.evidence.backup_generation_ref, undefined);
  assert.equal(captureOnly.evidence.restore_test_ref, undefined);
  // Backup without restore: restore stays absent.
  const noRestore = assemble({ records: [CAPTURE, BACKUP] });
  assert.equal(noRestore.evidence.backup_generation_ref, "backup.mail.gen-104");
  assert.equal(noRestore.evidence.restore_test_ref, undefined);
  // Pending acceptance passes through as pending, never upgraded.
  const pending = assemble({
    records: [CAPTURE, BACKUP, { ...RESTORE, human_acceptance_state: "pending" }],
  });
  assert.equal(pending.evidence.human_acceptance_state, "pending");
  // An old capture is stale relative to the caller-asserted horizon.
  const stale = assemble({ evaluation_time: "2026-09-03T04:00:00Z" });
  assert.equal(stale.evidence.freshness_state, "stale");
});

test("digest breaks are fabricated evidence: the lane HOLDs", () => {
  assert.equal(
    assemble({ records: [CAPTURE, { ...BACKUP, content_digest: OTHER_DIGEST }] }).hold_code,
    "backup_digest_mismatch",
  );
  assert.equal(
    assemble({ records: [CAPTURE, BACKUP, { ...RESTORE, readback_digest: OTHER_DIGEST }] }).hold_code,
    "restore_readback_mismatch",
  );
});

test("chain forks and future clocks hold instead of resolving first-match", () => {
  // A digest-mismatched duplicate must not hide behind a matching one.
  assert.equal(
    assemble({ records: [CAPTURE, BACKUP, { ...BACKUP, backup_generation_ref: "backup.mail.gen-104b", content_digest: OTHER_DIGEST }] }).hold_code,
    "duplicate_backup_pointer",
  );
  assert.equal(
    assemble({ records: [CAPTURE, BACKUP, RESTORE, { ...RESTORE, restore_test_ref: "restore_test.mail.gen-104b", readback_digest: OTHER_DIGEST }] }).hold_code,
    "duplicate_restore_test",
  );
  // A forged future clock cannot buy freshness.
  assert.equal(
    assemble({ records: [{ ...CAPTURE, captured_at: "2026-09-30T00:00:00Z" }] }).hold_code,
    "record_clock_in_future",
  );
});

test("lane scope cannot widen and generations cannot fork", () => {
  assert.equal(
    assemble({ records: [CAPTURE, { ...CAPTURE, source_ref: "source.slack" }] }).hold_code,
    "foreign_source_record",
  );
  assert.equal(
    assemble({ records: [CAPTURE, { ...CAPTURE, content_digest: OTHER_DIGEST }] }).hold_code,
    "duplicate_generation_seq",
  );
});

test("a backup pointer for an older generation never covers the latest", () => {
  const newer = {
    ...CAPTURE,
    generation_seq: 105,
    capture_ref: "capture.mail.gen-105",
    manifest_ref: "manifest.mail.gen-105",
    content_digest: OTHER_DIGEST,
    captured_at: "2026-08-31T03:30:00Z",
  };
  // BACKUP protects gen 104; latest is 105 -> no backup ref may appear.
  const assembled = assemble({ records: [CAPTURE, newer, BACKUP, RESTORE] });
  assert.equal(assembled.evidence.latest_capture_ref, "capture.mail.gen-105");
  assert.equal(assembled.evidence.backup_generation_ref, undefined);
  assert.equal(assembled.evidence.restore_test_ref, undefined);
});

test("legacy path map notes are metadata only and never shape evidence", () => {
  const withNote = assemble({
    records: [CAPTURE, BACKUP, RESTORE, {
      record_kind: "legacy_path_map_note",
      source_ref: "source.mail",
      legacy_ref: "legacy.mail.hiworks_inbox",
      note_ref: null,
    }],
  });
  assert.deepEqual(withNote.evidence, assemble().evidence);
});
