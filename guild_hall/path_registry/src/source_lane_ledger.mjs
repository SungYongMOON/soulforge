// Source-lane record ledger — pure, append-only, in-memory custody metadata.
//
// This module stores only records accepted by `validateLaneRecord`. It owns no
// filesystem, provider, persistence, clock, source truth, backup bytes, restore
// execution, or acceptance authority. The handle exposes no Map or mutation
// method; all state is held in one private WeakMap. A natural record identity
// is replay-safe: the exact same validated record is a deterministic NO_OP,
// while divergent content at that identity is a fixed, redacted HOLD.

import {
  assembleSourceLaneEvidence,
  validateLaneRecord,
} from "./source_lane_index.mjs";

export const SOURCE_LANE_LEDGER_SCHEMA = "soulforge.source_lane_ledger.v0";

export const SOURCE_LANE_LEDGER_HOLD_CODES = Object.freeze({
  UNKNOWN_LEDGER: "SOURCE_LANE_LEDGER_UNKNOWN",
  INPUT_INVALID: "SOURCE_LANE_INPUT_INVALID",
  SOURCE_INVALID: "SOURCE_LANE_SOURCE_INVALID",
  SCOPE_MISMATCH: "SOURCE_LANE_SCOPE_MISMATCH",
  RECORD_INVALID: "SOURCE_LANE_RECORD_INVALID",
  RECORD_CONFLICT: "SOURCE_LANE_RECORD_CONFLICT",
  RECORD_REF_CONFLICT: "SOURCE_LANE_RECORD_REF_CONFLICT",
  GENERATION_REGRESSION: "SOURCE_LANE_GENERATION_REGRESSION",
  CAPTURE_REQUIRED: "SOURCE_LANE_CAPTURE_REQUIRED",
  BACKUP_REQUIRED: "SOURCE_LANE_BACKUP_REQUIRED",
  CHAIN_INTEGRITY_HOLD: "SOURCE_LANE_CHAIN_INTEGRITY_HOLD",
  CHAIN_TIME_INVALID: "SOURCE_LANE_CHAIN_TIME_INVALID",
  EVIDENCE_HOLD: "SOURCE_LANE_EVIDENCE_HOLD",
});

const H = SOURCE_LANE_LEDGER_HOLD_CODES;
const SOURCE_REF = /^source\.[a-z][a-z0-9_-]{1,60}$/;
const STATE = new WeakMap();

const RECORD_FIELDS = Object.freeze({
  capture_generation: Object.freeze([
    "record_kind", "source_ref", "generation_seq", "capture_ref",
    "manifest_ref", "item_count", "content_digest", "captured_at",
    "immutable",
  ]),
  backup_generation_pointer: Object.freeze([
    "record_kind", "source_ref", "generation_seq", "backup_generation_ref",
    "content_digest", "backed_up_at",
  ]),
  restore_test: Object.freeze([
    "record_kind", "source_ref", "restore_test_ref", "backup_generation_ref",
    "isolated_root_ref", "readback_digest", "restored_at",
    "human_acceptance_state",
  ]),
  legacy_path_map_note: Object.freeze([
    "record_kind", "source_ref", "legacy_ref", "note_ref",
  ]),
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function hold(holdCode) {
  return Object.freeze({ status: "HOLD", hold_code: holdCode });
}

function isPlainDataObject(value, allowedKeys, requiredKeys = allowedKeys) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) return false;
    const allowed = new Set(allowedKeys);
    const present = new Set(keys);
    if (requiredKeys.some((key) => !present.has(key))) return false;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!allowed.has(key) || !("value" in descriptor)
          || descriptor.get !== undefined || descriptor.set !== undefined) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function safeRecord(record) {
  try {
    if (record === null || typeof record !== "object" || Array.isArray(record)) return null;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(record);
    for (const descriptor of Object.values(descriptors)) {
      if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        return null;
      }
    }
    const kindDescriptor = descriptors.record_kind;
    const fields = kindDescriptor && "value" in kindDescriptor
      ? RECORD_FIELDS[kindDescriptor.value]
      : undefined;
    if (fields === undefined) return null;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) return null;
    if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) return null;
    return validateLaneRecord(record);
  } catch {
    return null;
  }
}

function naturalIdentity(record) {
  switch (record.record_kind) {
    case "capture_generation":
    case "backup_generation_pointer":
      return `lane_record:${record.source_ref}:${record.record_kind}:${record.generation_seq}`;
    case "restore_test":
      return `lane_record:${record.source_ref}:restore_test:${record.backup_generation_ref}`;
    case "legacy_path_map_note":
      return `lane_record:${record.source_ref}:legacy_path_map_note:${record.legacy_ref}`;
    default:
      return null;
  }
}

function canonicalRecord(record) {
  return JSON.stringify(record);
}

function sourceRecords(state, sourceRef) {
  const identities = state.bySource.get(sourceRef) ?? [];
  return identities.map((identity) => state.byIdentity.get(identity).record);
}

function recordRefSlots(record) {
  switch (record.record_kind) {
    case "capture_generation":
      return [
        `capture_ref\u0000${record.capture_ref}`,
        `manifest_ref\u0000${record.manifest_ref}`,
      ];
    case "backup_generation_pointer":
      return [`backup_generation_ref\u0000${record.backup_generation_ref}`];
    case "restore_test":
      return [`restore_test_ref\u0000${record.restore_test_ref}`];
    case "legacy_path_map_note":
      return [`legacy_ref\u0000${record.legacy_ref}`];
    default:
      return [];
  }
}

function assemblyForChain(sourceRef, records) {
  const clocks = records.map((record) => Date.parse(
    record.captured_at ?? record.backed_up_at ?? record.restored_at,
  ));
  const evaluationTime = new Date(Math.max(...clocks)).toISOString();
  return assembleSourceLaneEvidence({
    source_ref: sourceRef,
    records,
    binding_state: "bound",
    evaluation_time: evaluationTime,
    freshness_horizon_seconds: 1,
  });
}

export function createSourceLaneLedger() {
  const ledger = Object.freeze({ kind: SOURCE_LANE_LEDGER_SCHEMA });
  STATE.set(ledger, {
    byIdentity: new Map(),
    bySource: new Map(),
    refIndex: new Map(),
    appendCount: 0,
  });
  return ledger;
}

export function appendSourceLaneRecord(ledger, input) {
  const state = STATE.get(ledger);
  if (state === undefined) return hold(H.UNKNOWN_LEDGER);
  if (!isPlainDataObject(input, ["source_ref", "record"])) return hold(H.INPUT_INVALID);
  const sourceRef = input.source_ref;
  if (typeof sourceRef !== "string" || !SOURCE_REF.test(sourceRef)) return hold(H.SOURCE_INVALID);
  const record = safeRecord(input.record);
  if (record === null) return hold(H.RECORD_INVALID);
  if (record.source_ref !== sourceRef) return hold(H.SCOPE_MISMATCH);

  const identity = naturalIdentity(record);
  const serialized = canonicalRecord(record);
  const prior = state.byIdentity.get(identity);
  if (prior !== undefined) {
    return prior.serialized === serialized
      ? deepFreeze({
        status: "NO_OP",
        record_identity: identity,
        append_seq: prior.appendSeq,
        record: prior.record,
      })
      : hold(H.RECORD_CONFLICT);
  }

  const existing = sourceRecords(state, sourceRef);
  if (record.record_kind === "capture_generation") {
    const captures = existing.filter(({ record_kind }) => record_kind === "capture_generation");
    if (captures.length > 0) {
      const latestCapture = captures.reduce((latest, candidate) =>
        candidate.generation_seq > latest.generation_seq ? candidate : latest);
      const maxGeneration = latestCapture.generation_seq;
      if (record.generation_seq <= maxGeneration) return hold(H.GENERATION_REGRESSION);
      if (Date.parse(record.captured_at) < Date.parse(latestCapture.captured_at)) {
        return hold(H.CHAIN_TIME_INVALID);
      }
    }
  } else if (record.record_kind === "backup_generation_pointer") {
    const capture = existing.find((candidate) => candidate.record_kind === "capture_generation"
      && candidate.generation_seq === record.generation_seq);
    if (capture === undefined) return hold(H.CAPTURE_REQUIRED);
    if (Date.parse(record.backed_up_at) < Date.parse(capture.captured_at)) {
      return hold(H.CHAIN_TIME_INVALID);
    }
    if (assemblyForChain(sourceRef, [capture, record]).status === "hold") {
      return hold(H.CHAIN_INTEGRITY_HOLD);
    }
  } else if (record.record_kind === "restore_test") {
    const backup = existing.find((candidate) => candidate.record_kind === "backup_generation_pointer"
      && candidate.backup_generation_ref === record.backup_generation_ref);
    if (backup === undefined) return hold(H.BACKUP_REQUIRED);
    const capture = existing.find((candidate) => candidate.record_kind === "capture_generation"
      && candidate.generation_seq === backup.generation_seq);
    if (capture === undefined) return hold(H.CAPTURE_REQUIRED);
    if (Date.parse(record.restored_at) < Date.parse(backup.backed_up_at)) {
      return hold(H.CHAIN_TIME_INVALID);
    }
    if (assemblyForChain(sourceRef, [capture, backup, record]).status === "hold") {
      return hold(H.CHAIN_INTEGRITY_HOLD);
    }
  }

  for (const slot of recordRefSlots(record)) {
    if (state.refIndex.has(slot)) return hold(H.RECORD_REF_CONFLICT);
  }

  const appendSeq = state.appendCount + 1;
  state.appendCount = appendSeq;
  state.byIdentity.set(identity, { serialized, record, appendSeq });
  const identities = state.bySource.get(sourceRef) ?? [];
  identities.push(identity);
  state.bySource.set(sourceRef, identities);
  for (const slot of recordRefSlots(record)) state.refIndex.set(slot, identity);
  return deepFreeze({ status: "APPENDED", record_identity: identity, append_seq: appendSeq, record });
}

export function projectSourceLaneRecords(ledger, input) {
  const state = STATE.get(ledger);
  if (state === undefined) return hold(H.UNKNOWN_LEDGER);
  if (!isPlainDataObject(input, ["source_ref"])) return hold(H.INPUT_INVALID);
  const sourceRef = input.source_ref;
  if (typeof sourceRef !== "string" || !SOURCE_REF.test(sourceRef)) return hold(H.SOURCE_INVALID);
  const records = sourceRecords(state, sourceRef);
  return deepFreeze({
    status: "PROJECTED",
    schema: SOURCE_LANE_LEDGER_SCHEMA,
    source_ref: sourceRef,
    record_count: records.length,
    records: [...records],
  });
}

export function projectSourceLaneEvidence(input) {
  const allowed = [
    "ledger", "source_ref", "binding_state", "evaluation_time",
    "freshness_horizon_seconds", "retention_policy_ref", "rpo_policy_ref",
  ];
  if (!isPlainDataObject(input, allowed, [
    "ledger", "source_ref", "binding_state", "evaluation_time",
    "freshness_horizon_seconds",
  ])) return hold(H.INPUT_INVALID);
  const state = STATE.get(input.ledger);
  if (state === undefined) return hold(H.UNKNOWN_LEDGER);
  if (typeof input.source_ref !== "string" || !SOURCE_REF.test(input.source_ref)) {
    return hold(H.SOURCE_INVALID);
  }
  const records = sourceRecords(state, input.source_ref);
  const assembly = assembleSourceLaneEvidence({
    source_ref: input.source_ref,
    records,
    binding_state: input.binding_state,
    evaluation_time: input.evaluation_time,
    freshness_horizon_seconds: input.freshness_horizon_seconds,
    retention_policy_ref: input.retention_policy_ref,
    rpo_policy_ref: input.rpo_policy_ref,
  });
  if (assembly.status === "hold") return hold(H.EVIDENCE_HOLD);

  let readinessState = "unknown";
  if (assembly.status === "assembled") {
    const evidence = assembly.evidence;
    readinessState = evidence.binding_state === "bound"
      && evidence.freshness_state === "fresh"
      && evidence.backup_generation_ref !== undefined
      && evidence.retention_policy_ref !== undefined
      && evidence.rpo_policy_ref !== undefined
      && evidence.restore_test_ref !== undefined
      && evidence.human_acceptance_state === "accepted"
      ? "evidence_complete"
      : "degraded";
  }
  return deepFreeze({
    status: "PROJECTED",
    schema: SOURCE_LANE_LEDGER_SCHEMA,
    source_ref: input.source_ref,
    record_count: records.length,
    readiness_state: readinessState,
    assembly,
  });
}
