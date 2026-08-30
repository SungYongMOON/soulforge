// Source-lane index contract — plan 17 `10_SOURCE_CAPTURE_CATALOG/<id>/`
// record shapes and the deterministic evidence assembler (source-index leaf).
//
// Four typed, refs-only record kinds that later land under a lane's
// directories, plus `assembleSourceLaneEvidence`, which derives the EXACT
// nine-key evidence record the R3 storage map consumes — and nothing else.
// Evidence is never fabricated: every field is a deterministic function of
// validated records, a missing chain link yields an absent field (R3 then
// renders degraded/unknown), no captures at all yields `no_evidence`
// (R3 renders unknown), and a digest that does not round-trip through the
// capture -> backup -> restore chain is treated as fabricated evidence and
// HOLDs the lane instead of counting.
//
// Plan-17 boundaries kept structural: a backup-generation pointer has no
// byte/payload field to duplicate (60_BACKUP_GENERATIONS owns the
// generation), `legacy_path_map_note` is metadata this module never
// resolves through (no symlink, fallback, or second writer), and a record
// scoped to another source cannot enter a lane (`foreign_source_record`).
// No filesystem, no writer, no clock of its own — the caller asserts
// `evaluation_time` and the freshness horizon.

export const SOURCE_LANE_INDEX_SCHEMA = "soulforge.source_lane_index.v0";

export const LANE_RECORD_KINDS = Object.freeze([
  "capture_generation", "backup_generation_pointer", "restore_test",
  "legacy_path_map_note",
]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const REF = /^[a-z][a-z0-9_.:/-]{1,160}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SOURCE_REF = /^source\.[a-z][a-z0-9_-]{1,60}$/;

// Raw payload can never enter an index record under any name.
const FORBIDDEN_RECORD_KEYS = Object.freeze([
  "payload", "body", "bytes", "content", "raw_message", "message_body",
  "transcript", "prompt", "secret", "token_value", "password", "cookie",
]);

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function hold(holdCode, detail) {
  return Object.freeze({
    status: "hold",
    hold_code: holdCode,
    ...(detail === undefined ? {} : { detail }),
  });
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function absolutePathLeak(value) {
  return typeof value === "string"
    && (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\"));
}

function assertSafeRef(value, field) {
  if (typeof value !== "string" || !REF.test(value) || value.startsWith("hold:")
      || absolutePathLeak(value)) {
    fail("ref_invalid", field);
  }
  return value;
}

function assertClock(value, field) {
  if (typeof value !== "string" || !ISO.test(value)) fail("clock_invalid", field);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail("clock_invalid", field);
  return timestamp;
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !SHA256.test(value)) fail("digest_invalid", field);
  return value;
}

function baseChecks(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    fail("record_invalid", "record");
  }
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_RECORD_KEYS.includes(key)) fail("forbidden_record_key", key);
    if (absolutePathLeak(record[key])) fail("absolute_path_forbidden", key);
  }
  if (typeof record.source_ref !== "string" || !SOURCE_REF.test(record.source_ref)) {
    fail("record_invalid", "source_ref");
  }
}

export function validateLaneRecord(record) {
  baseChecks(record);
  switch (record.record_kind) {
    case "capture_generation": {
      if (!Number.isInteger(record.generation_seq) || record.generation_seq < 1) {
        fail("record_invalid", "generation_seq");
      }
      assertSafeRef(record.capture_ref, "capture_ref");
      assertSafeRef(record.manifest_ref, "manifest_ref");
      if (!Number.isInteger(record.item_count) || record.item_count < 0) {
        fail("record_invalid", "item_count");
      }
      assertDigest(record.content_digest, "content_digest");
      assertClock(record.captured_at, "captured_at");
      if (record.immutable !== true) fail("record_invalid", "immutable");
      return deepFreeze({
        record_kind: "capture_generation",
        source_ref: record.source_ref,
        generation_seq: record.generation_seq,
        capture_ref: record.capture_ref,
        manifest_ref: record.manifest_ref,
        item_count: record.item_count,
        content_digest: record.content_digest,
        captured_at: record.captured_at,
        immutable: true,
      });
    }
    case "backup_generation_pointer": {
      if (!Number.isInteger(record.generation_seq) || record.generation_seq < 1) {
        fail("record_invalid", "generation_seq");
      }
      assertSafeRef(record.backup_generation_ref, "backup_generation_ref");
      assertDigest(record.content_digest, "content_digest");
      assertClock(record.backed_up_at, "backed_up_at");
      return deepFreeze({
        record_kind: "backup_generation_pointer",
        source_ref: record.source_ref,
        generation_seq: record.generation_seq,
        backup_generation_ref: record.backup_generation_ref,
        content_digest: record.content_digest,
        backed_up_at: record.backed_up_at,
      });
    }
    case "restore_test": {
      assertSafeRef(record.restore_test_ref, "restore_test_ref");
      assertSafeRef(record.backup_generation_ref, "backup_generation_ref");
      assertSafeRef(record.isolated_root_ref, "isolated_root_ref");
      assertDigest(record.readback_digest, "readback_digest");
      assertClock(record.restored_at, "restored_at");
      if (record.human_acceptance_state !== "accepted"
          && record.human_acceptance_state !== "pending") {
        fail("record_invalid", "human_acceptance_state");
      }
      return deepFreeze({
        record_kind: "restore_test",
        source_ref: record.source_ref,
        restore_test_ref: record.restore_test_ref,
        backup_generation_ref: record.backup_generation_ref,
        isolated_root_ref: record.isolated_root_ref,
        readback_digest: record.readback_digest,
        restored_at: record.restored_at,
        human_acceptance_state: record.human_acceptance_state,
      });
    }
    case "legacy_path_map_note": {
      assertSafeRef(record.legacy_ref, "legacy_ref");
      if (record.note_ref !== null) assertSafeRef(record.note_ref, "note_ref");
      return deepFreeze({
        record_kind: "legacy_path_map_note",
        source_ref: record.source_ref,
        legacy_ref: record.legacy_ref,
        note_ref: record.note_ref,
      });
    }
    default:
      return fail("record_kind_invalid", String(record.record_kind));
  }
}

// Deterministic derivation of the R3 nine-key evidence record. Anything the
// records do not prove stays absent; any digest break HOLDs the lane.
export function assembleSourceLaneEvidence({
  source_ref, records, binding_state, evaluation_time,
  freshness_horizon_seconds, retention_policy_ref, rpo_policy_ref,
} = {}) {
  if (typeof source_ref !== "string" || !SOURCE_REF.test(source_ref)) {
    return hold("source_ref_invalid");
  }
  if (binding_state !== "bound" && binding_state !== "unbound"
      && binding_state !== "unavailable") {
    return hold("binding_state_invalid");
  }
  if (!Number.isInteger(freshness_horizon_seconds) || freshness_horizon_seconds < 1) {
    return hold("freshness_horizon_invalid");
  }
  let evaluationTimestamp;
  try {
    evaluationTimestamp = assertClock(evaluation_time, "evaluation_time");
    if (retention_policy_ref !== undefined) assertSafeRef(retention_policy_ref, "retention_policy_ref");
    if (rpo_policy_ref !== undefined) assertSafeRef(rpo_policy_ref, "rpo_policy_ref");
  } catch (error) {
    return hold(error.code, error.message);
  }
  if (!Array.isArray(records)) return hold("records_invalid");

  const captures = [];
  const backups = [];
  const restores = [];
  const seenSeq = new Set();
  for (const raw of records) {
    let record;
    try {
      record = validateLaneRecord(raw);
    } catch (error) {
      return hold(error.code, error.message);
    }
    // Lane scope cannot widen: a record for another source never counts here.
    if (record.source_ref !== source_ref) {
      return hold("foreign_source_record", record.source_ref);
    }
    if (record.record_kind === "capture_generation") {
      if (seenSeq.has(record.generation_seq)) {
        return hold("duplicate_generation_seq", String(record.generation_seq));
      }
      seenSeq.add(record.generation_seq);
      captures.push(record);
    } else if (record.record_kind === "backup_generation_pointer") {
      backups.push(record);
    } else if (record.record_kind === "restore_test") {
      restores.push(record);
    }
    // legacy_path_map_note is metadata only: it never influences evidence.
  }

  if (captures.length === 0) {
    return Object.freeze({ status: "no_evidence", reason: "no_capture_generation" });
  }
  const latest = captures.reduce((a, b) => (b.generation_seq > a.generation_seq ? b : a));

  const clocks = [Date.parse(latest.captured_at)];
  const freshness = evaluationTimestamp - Date.parse(latest.captured_at)
    <= freshness_horizon_seconds * 1000 ? "fresh" : "stale";

  // Backup pointer must protect the LATEST generation with the SAME digest;
  // a mismatched digest is fabricated evidence, not a soft miss.
  let backupRef;
  const backup = backups.find((b) => b.generation_seq === latest.generation_seq);
  if (backup !== undefined) {
    if (backup.content_digest !== latest.content_digest) {
      return hold("backup_digest_mismatch", `gen_${latest.generation_seq}`);
    }
    backupRef = backup.backup_generation_ref;
    clocks.push(Date.parse(backup.backed_up_at));
  }

  let restoreRef;
  let acceptance;
  if (backupRef !== undefined) {
    const restore = restores.find((r) => r.backup_generation_ref === backupRef);
    if (restore !== undefined) {
      if (restore.readback_digest !== latest.content_digest) {
        return hold("restore_readback_mismatch", backupRef);
      }
      restoreRef = restore.restore_test_ref;
      acceptance = restore.human_acceptance_state;
      clocks.push(Date.parse(restore.restored_at));
    }
  }

  const evidenceAt = new Date(Math.max(...clocks)).toISOString().replace(/\.\d{3}Z$/u, "Z");
  return deepFreeze({
    status: "assembled",
    schema: SOURCE_LANE_INDEX_SCHEMA,
    source_ref,
    evidence: {
      binding_state,
      latest_capture_ref: latest.capture_ref,
      ...(backupRef !== undefined ? { backup_generation_ref: backupRef } : {}),
      freshness_state: freshness,
      ...(retention_policy_ref !== undefined ? { retention_policy_ref } : {}),
      ...(rpo_policy_ref !== undefined ? { rpo_policy_ref } : {}),
      ...(restoreRef !== undefined ? { restore_test_ref: restoreRef } : {}),
      ...(acceptance !== undefined ? { human_acceptance_state: acceptance } : {}),
      evidence_at: evidenceAt,
    },
  });
}
