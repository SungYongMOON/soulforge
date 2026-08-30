// Pure Source backup-generation / isolated-restore receipt binder.
//
// This contract consumes already-observed, refs-only evidence. It owns no
// filesystem, provider, network, clock, source payload, backup bytes, restore
// execution, retention action, or human acceptance authority. Only an exact
// capture -> create-only backup readback -> isolated restore readback chain can
// emit the two Source-lane records understood by source_lane_index.

import { createHash } from "node:crypto";
import { types } from "node:util";

export const SOURCE_BACKUP_GENERATION_SCHEMA =
  "soulforge.backup_controller.source_backup_generation_receipt.v0";

export const SOURCE_BACKUP_GENERATION_HOLD_CODES = Object.freeze({
  INPUT_INVALID: "SOURCE_BACKUP_INPUT_INVALID",
  CAPTURE_RECORD_INVALID: "SOURCE_BACKUP_CAPTURE_RECORD_INVALID",
  MANIFEST_INVALID: "SOURCE_BACKUP_BYTE_OWNER_MANIFEST_INVALID",
  BACKUP_EVIDENCE_INVALID: "SOURCE_BACKUP_GENERATION_EVIDENCE_INVALID",
  RESTORE_EVIDENCE_INVALID: "SOURCE_BACKUP_RESTORE_EVIDENCE_INVALID",
  OWNER_INVALID: "SOURCE_BACKUP_OWNER_INVALID",
  POLICY_REF_INVALID: "SOURCE_BACKUP_POLICY_REF_INVALID",
  ACCEPTANCE_EVIDENCE_INVALID: "SOURCE_BACKUP_ACCEPTANCE_EVIDENCE_INVALID",
  ACCEPTANCE_PIN_REQUIRED: "SOURCE_BACKUP_ACCEPTANCE_PIN_REQUIRED",
  ACCEPTANCE_PIN_INVALID: "SOURCE_BACKUP_ACCEPTANCE_PIN_INVALID",
  ACCEPTANCE_PIN_MISMATCH: "SOURCE_BACKUP_ACCEPTANCE_PIN_MISMATCH",
  SCOPE_MISMATCH: "SOURCE_BACKUP_SCOPE_MISMATCH",
  CHAIN_MISMATCH: "SOURCE_BACKUP_CHAIN_MISMATCH",
  DIGEST_MISMATCH: "SOURCE_BACKUP_DIGEST_MISMATCH",
  TIME_ORDER_INVALID: "SOURCE_BACKUP_TIME_ORDER_INVALID",
  CREATE_ONLY_REQUIRED: "SOURCE_BACKUP_CREATE_ONLY_REQUIRED",
  EXACT_READBACK_REQUIRED: "SOURCE_BACKUP_EXACT_READBACK_REQUIRED",
  SECRET_OR_PAYLOAD_FORBIDDEN: "SOURCE_BACKUP_SECRET_OR_PAYLOAD_FORBIDDEN",
  ABSOLUTE_PATH_FORBIDDEN: "SOURCE_BACKUP_ABSOLUTE_PATH_FORBIDDEN",
  REPLAY_CONFLICT: "SOURCE_BACKUP_REPLAY_CONFLICT",
});

const H = SOURCE_BACKUP_GENERATION_HOLD_CODES;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SOURCE_REF = /^source\.[a-z][a-z0-9_-]{1,60}$/u;
const PROJECT_REF = /^project\.[a-z][a-z0-9_.-]{1,100}$/u;
const SAFE_REF = /^[a-z][a-z0-9_.:/-]{1,160}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

const ROOT_FIELDS = Object.freeze([
  "capture_record", "byte_owner_manifest", "backup_evidence",
  "restore_evidence", "owners", "retention_policy_ref", "rpo_policy_ref",
  "human_acceptance_evidence", "prior_receipt",
]);
const ROOT_REQUIRED = Object.freeze(ROOT_FIELDS.filter((field) =>
  field !== "human_acceptance_evidence" && field !== "prior_receipt"));
const CAPTURE_FIELDS = Object.freeze([
  "record_kind", "source_ref", "generation_seq", "capture_ref",
  "manifest_ref", "item_count", "content_digest", "captured_at", "immutable",
]);
const MANIFEST_FIELDS = Object.freeze([
  "schema_version", "source_ref", "project_scope_ref", "generation_seq",
  "capture_ref", "capture_manifest_ref", "content_digest", "item_count",
  "byte_length", "byte_owner_ref", "backup_manifest_ref", "immutable",
]);
const BACKUP_FIELDS = Object.freeze([
  "schema_version", "source_ref", "project_scope_ref", "generation_seq",
  "capture_ref", "capture_content_digest", "backup_generation_ref",
  "backup_manifest_ref", "backup_content_digest", "backed_up_at",
  "create_only", "overwrite_allowed", "exact_byte_readback",
  "readback_digest", "byte_owner_ref",
]);
const RESTORE_FIELDS = Object.freeze([
  "schema_version", "source_ref", "project_scope_ref",
  "backup_generation_ref", "backup_manifest_ref", "restore_test_ref",
  "isolated_root_ref", "restored_at", "exact_byte_readback",
  "readback_digest",
]);
const ACCEPTANCE_FIELDS = Object.freeze([
  "schema_version", "source_ref", "project_scope_ref", "backup_generation_ref",
  "restore_test_ref", "restore_readback_digest", "decision", "verified",
  "verifier_ref", "acceptance_owner_ref", "authority_receipt_ref",
  "authority_receipt_digest", "verified_at", "claim_ceiling",
]);
const ACCEPTANCE_PIN_FIELDS = Object.freeze([
  "schema_version", "pin_ref", "trusted_authority_ref",
  "acceptance_envelope_digest", "claim_ceiling",
]);
const OWNER_FIELDS = Object.freeze([
  "logical_owner_ref", "byte_owner_ref", "revision_owner_ref",
  "acceptance_owner_ref", "backup_restore_owner_ref",
]);
const RECEIPT_FIELDS = Object.freeze([
  "schema_version", "source_ref", "project_scope_ref", "capture_generation_seq",
  "capture_ref", "capture_manifest_ref", "capture_content_digest",
  "item_count", "byte_length", "backup_generation_ref", "backup_manifest_ref",
  "backup_content_digest", "create_only", "overwrite_allowed",
  "exact_backup_readback", "exact_restore_readback", "retention_policy_ref",
  "rpo_policy_ref", "technical_restore_state", "human_acceptance_state",
  "human_acceptance_evidence", "human_acceptance_trusted_pin", "owners",
  "backup_generation_pointer", "restore_test",
]);

const FORBIDDEN_KEYS = new Set([
  "payload", "body", "bytes", "content", "raw", "raw_message",
  "message_body", "transcript", "prompt", "secret", "token", "token_value",
  "password", "cookie", "credential", "credential_value", "private_key",
]);

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

function absolutePathLeak(value) {
  return typeof value === "string"
    && (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\"));
}

function plainDescriptors(value) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)
        || types.isProxy(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) return null;
    for (const descriptor of Object.values(descriptors)) {
      if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        return null;
      }
    }
    return descriptors;
  } catch {
    return null;
  }
}

function scanHazards(value, seen = new Set()) {
  if (typeof value === "string") {
    return absolutePathLeak(value) ? H.ABSOLUTE_PATH_FORBIDDEN : null;
  }
  if (value === null || typeof value !== "object") return null;
  if (types.isProxy(value) || seen.has(value)) return null;
  seen.add(value);
  let descriptors;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      return H.INPUT_INVALID;
    }
    if (FORBIDDEN_KEYS.has(key)) return H.SECRET_OR_PAYLOAD_FORBIDDEN;
    const nested = scanHazards(descriptor.value, seen);
    if (nested !== null) return nested;
  }
  return null;
}

function exactRecord(value, fields, required = fields) {
  const descriptors = plainDescriptors(value);
  if (descriptors === null) return null;
  const keys = Object.keys(descriptors);
  if (keys.some((key) => !fields.includes(key))
      || required.some((key) => !(key in descriptors))) return null;
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function exactKeys(value, fields) {
  const descriptors = plainDescriptors(value);
  return descriptors !== null
    && Object.keys(descriptors).length === fields.length
    && fields.every((field) => field in descriptors);
}

function safeRef(value) {
  return typeof value === "string" && SAFE_REF.test(value)
    && !value.startsWith("hold:") && !absolutePathLeak(value);
}

function validDigest(value) {
  return typeof value === "string" && SHA256.test(value);
}

function validClock(value) {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const expanded = value.includes(".")
    ? value.replace(/\.(\d{1,3})Z$/u, (_match, fraction) => `.${fraction.padEnd(3, "0")}Z`)
    : value.replace(/Z$/u, ".000Z");
  return new Date(timestamp).toISOString() === expanded;
}

function validOwners(value) {
  const record = exactRecord(value, OWNER_FIELDS);
  return record !== null && OWNER_FIELDS.every((field) => safeRef(record[field])) ? record : null;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function receiptCompatible(value) {
  if (!exactKeys(value, RECEIPT_FIELDS)) return false;
  const owners = validOwners(value.owners);
  return value.schema_version === SOURCE_BACKUP_GENERATION_SCHEMA
    && typeof value.capture_generation_seq === "number"
    && owners !== null
    && value.technical_restore_state === "technical_restore_candidate"
    && ((value.human_acceptance_state === "pending"
        && value.human_acceptance_evidence === null
        && value.human_acceptance_trusted_pin === null
        && value.restore_test === null)
      || (value.human_acceptance_state === "accepted"
        && exactRecord(value.human_acceptance_evidence, ACCEPTANCE_FIELDS) !== null
        && exactRecord(value.human_acceptance_trusted_pin, ACCEPTANCE_PIN_FIELDS) !== null
        && value.restore_test !== null));
}

function technicalReceiptProjection(receipt) {
  const omitted = new Set([
    "human_acceptance_state", "human_acceptance_evidence",
    "human_acceptance_trusted_pin", "restore_test",
  ]);
  return Object.fromEntries(Object.entries(receipt).filter(([key]) => !omitted.has(key)));
}

export function bindSourceBackupGeneration(rawInput, trustedAcceptancePin = undefined) {
  const hazard = scanHazards(rawInput);
  if (hazard !== null) return hold(hazard);
  const input = exactRecord(rawInput, ROOT_FIELDS, ROOT_REQUIRED);
  if (input === null) return hold(H.INPUT_INVALID);

  const capture = exactRecord(input.capture_record, CAPTURE_FIELDS);
  if (capture === null || capture.record_kind !== "capture_generation"
      || !SOURCE_REF.test(capture.source_ref ?? "")
      || !Number.isSafeInteger(capture.generation_seq) || capture.generation_seq < 1
      || !safeRef(capture.capture_ref) || !safeRef(capture.manifest_ref)
      || !Number.isSafeInteger(capture.item_count) || capture.item_count < 0
      || !validDigest(capture.content_digest) || !validClock(capture.captured_at)
      || capture.immutable !== true) return hold(H.CAPTURE_RECORD_INVALID);

  const manifest = exactRecord(input.byte_owner_manifest, MANIFEST_FIELDS);
  if (manifest === null
      || manifest.schema_version !== "soulforge.source_backup.byte_owner_manifest.v0"
      || !SOURCE_REF.test(manifest.source_ref ?? "")
      || !PROJECT_REF.test(manifest.project_scope_ref ?? "")
      || !Number.isSafeInteger(manifest.generation_seq) || manifest.generation_seq < 1
      || !safeRef(manifest.capture_ref) || !safeRef(manifest.capture_manifest_ref)
      || !validDigest(manifest.content_digest)
      || !Number.isSafeInteger(manifest.item_count) || manifest.item_count < 0
      || !Number.isSafeInteger(manifest.byte_length) || manifest.byte_length < 0
      || !safeRef(manifest.byte_owner_ref) || !safeRef(manifest.backup_manifest_ref)
      || manifest.immutable !== true) return hold(H.MANIFEST_INVALID);

  const backup = exactRecord(input.backup_evidence, BACKUP_FIELDS);
  if (backup === null
      || backup.schema_version !== "soulforge.source_backup.generation_evidence.v0"
      || !SOURCE_REF.test(backup.source_ref ?? "")
      || !PROJECT_REF.test(backup.project_scope_ref ?? "")
      || !Number.isSafeInteger(backup.generation_seq) || backup.generation_seq < 1
      || !safeRef(backup.capture_ref) || !validDigest(backup.capture_content_digest)
      || !safeRef(backup.backup_generation_ref) || !safeRef(backup.backup_manifest_ref)
      || !validDigest(backup.backup_content_digest) || !validClock(backup.backed_up_at)
      || typeof backup.create_only !== "boolean" || typeof backup.overwrite_allowed !== "boolean"
      || typeof backup.exact_byte_readback !== "boolean" || !validDigest(backup.readback_digest)
      || !safeRef(backup.byte_owner_ref)) return hold(H.BACKUP_EVIDENCE_INVALID);

  const restore = exactRecord(input.restore_evidence, RESTORE_FIELDS);
  if (restore === null
      || restore.schema_version !== "soulforge.source_backup.restore_evidence.v0"
      || !SOURCE_REF.test(restore.source_ref ?? "")
      || !PROJECT_REF.test(restore.project_scope_ref ?? "")
      || !safeRef(restore.backup_generation_ref) || !safeRef(restore.backup_manifest_ref)
      || !safeRef(restore.restore_test_ref) || !safeRef(restore.isolated_root_ref)
      || !validClock(restore.restored_at) || typeof restore.exact_byte_readback !== "boolean"
      || !validDigest(restore.readback_digest)) {
    return hold(H.RESTORE_EVIDENCE_INVALID);
  }

  const owners = validOwners(input.owners);
  if (owners === null) return hold(H.OWNER_INVALID);
  if (!safeRef(input.retention_policy_ref) || !safeRef(input.rpo_policy_ref)) {
    return hold(H.POLICY_REF_INVALID);
  }

  if (backup.create_only !== true || backup.overwrite_allowed !== false) {
    return hold(H.CREATE_ONLY_REQUIRED);
  }
  if (backup.exact_byte_readback !== true || restore.exact_byte_readback !== true) {
    return hold(H.EXACT_READBACK_REQUIRED);
  }

  if (manifest.source_ref !== capture.source_ref || backup.source_ref !== capture.source_ref
      || restore.source_ref !== capture.source_ref
      || backup.project_scope_ref !== manifest.project_scope_ref
      || restore.project_scope_ref !== manifest.project_scope_ref) return hold(H.SCOPE_MISMATCH);

  if (manifest.generation_seq !== capture.generation_seq
      || backup.generation_seq !== capture.generation_seq
      || manifest.capture_ref !== capture.capture_ref
      || backup.capture_ref !== capture.capture_ref
      || manifest.capture_manifest_ref !== capture.manifest_ref
      || manifest.item_count !== capture.item_count
      || backup.backup_generation_ref !== restore.backup_generation_ref
      || manifest.backup_manifest_ref !== backup.backup_manifest_ref
      || manifest.backup_manifest_ref !== restore.backup_manifest_ref
      || manifest.byte_owner_ref !== owners.byte_owner_ref
      || backup.byte_owner_ref !== owners.byte_owner_ref) return hold(H.CHAIN_MISMATCH);

  if ([manifest.content_digest, backup.capture_content_digest,
    backup.backup_content_digest, backup.readback_digest, restore.readback_digest]
    .some((digest) => digest !== capture.content_digest)) return hold(H.DIGEST_MISMATCH);

  if (Date.parse(backup.backed_up_at) < Date.parse(capture.captured_at)
      || Date.parse(restore.restored_at) < Date.parse(backup.backed_up_at)) {
    return hold(H.TIME_ORDER_INVALID);
  }

  let acceptance = null;
  let acceptedPin = null;
  if (input.human_acceptance_evidence !== undefined) {
    acceptance = exactRecord(input.human_acceptance_evidence, ACCEPTANCE_FIELDS);
    if (acceptance === null
        || acceptance.schema_version !== "soulforge.source_backup.human_acceptance_evidence.v0"
        || acceptance.source_ref !== capture.source_ref
        || acceptance.project_scope_ref !== manifest.project_scope_ref
        || acceptance.backup_generation_ref !== backup.backup_generation_ref
        || acceptance.restore_test_ref !== restore.restore_test_ref
        || acceptance.restore_readback_digest !== restore.readback_digest
        || acceptance.decision !== "accepted" || acceptance.verified !== true
        || !safeRef(acceptance.verifier_ref)
        || acceptance.acceptance_owner_ref !== owners.acceptance_owner_ref
        || !safeRef(acceptance.authority_receipt_ref)
        || !validDigest(acceptance.authority_receipt_digest)
        || !validClock(acceptance.verified_at)
        || Date.parse(acceptance.verified_at) < Date.parse(restore.restored_at)
        || acceptance.claim_ceiling !== "human_acceptance_verified") {
      return hold(H.ACCEPTANCE_EVIDENCE_INVALID);
    }
    if (trustedAcceptancePin === undefined) return hold(H.ACCEPTANCE_PIN_REQUIRED);
    const pinHazard = scanHazards(trustedAcceptancePin);
    if (pinHazard !== null) return hold(H.ACCEPTANCE_PIN_INVALID);
    acceptedPin = exactRecord(trustedAcceptancePin, ACCEPTANCE_PIN_FIELDS);
    if (acceptedPin === null
        || acceptedPin.schema_version !== "soulforge.source_backup.trusted_acceptance_pin.v0"
        || !safeRef(acceptedPin.pin_ref) || !safeRef(acceptedPin.trusted_authority_ref)
        || !validDigest(acceptedPin.acceptance_envelope_digest)
        || acceptedPin.claim_ceiling !== "acceptance_envelope_digest_verified") {
      return hold(H.ACCEPTANCE_PIN_INVALID);
    }
    const observedEnvelopeDigest = `sha256:${createHash("sha256")
      .update(canonical(acceptance)).digest("hex")}`;
    if (acceptedPin.acceptance_envelope_digest !== observedEnvelopeDigest) {
      return hold(H.ACCEPTANCE_PIN_MISMATCH);
    }
  } else if (trustedAcceptancePin !== undefined) {
    return hold(H.ACCEPTANCE_PIN_INVALID);
  }

  const backupGenerationPointer = {
    record_kind: "backup_generation_pointer",
    source_ref: capture.source_ref,
    generation_seq: capture.generation_seq,
    backup_generation_ref: backup.backup_generation_ref,
    content_digest: backup.backup_content_digest,
    backed_up_at: backup.backed_up_at,
  };
  // A pending technical restore is deliberately NOT emitted into the
  // source-lane ledger. That ledger has one restore identity per backup; a
  // pending record would make a later accepted record a duplicate fork.
  const restoreTest = acceptance === null ? null : {
    record_kind: "restore_test",
    source_ref: capture.source_ref,
    restore_test_ref: restore.restore_test_ref,
    backup_generation_ref: backup.backup_generation_ref,
    isolated_root_ref: restore.isolated_root_ref,
    readback_digest: restore.readback_digest,
    restored_at: restore.restored_at,
    human_acceptance_state: "accepted",
  };
  const receipt = deepFreeze({
    schema_version: SOURCE_BACKUP_GENERATION_SCHEMA,
    source_ref: capture.source_ref,
    project_scope_ref: manifest.project_scope_ref,
    capture_generation_seq: capture.generation_seq,
    capture_ref: capture.capture_ref,
    capture_manifest_ref: capture.manifest_ref,
    capture_content_digest: capture.content_digest,
    item_count: capture.item_count,
    byte_length: manifest.byte_length,
    backup_generation_ref: backup.backup_generation_ref,
    backup_manifest_ref: manifest.backup_manifest_ref,
    backup_content_digest: backup.backup_content_digest,
    create_only: true,
    overwrite_allowed: false,
    exact_backup_readback: true,
    exact_restore_readback: true,
    retention_policy_ref: input.retention_policy_ref,
    rpo_policy_ref: input.rpo_policy_ref,
    technical_restore_state: "technical_restore_candidate",
    human_acceptance_state: acceptance === null ? "pending" : "accepted",
    human_acceptance_evidence: acceptance,
    human_acceptance_trusted_pin: acceptedPin,
    owners,
    backup_generation_pointer: backupGenerationPointer,
    restore_test: restoreTest,
  });

  if (input.prior_receipt !== undefined) {
    if (!receiptCompatible(input.prior_receipt)) return hold(H.REPLAY_CONFLICT);
    if (canonical(input.prior_receipt) === canonical(receipt)) {
      return deepFreeze({ status: "NO_OP", receipt });
    }
    if (input.prior_receipt.human_acceptance_state === "pending"
        && receipt.human_acceptance_state === "accepted"
        && canonical(technicalReceiptProjection(input.prior_receipt))
          === canonical(technicalReceiptProjection(receipt))) {
      return deepFreeze({ status: "ADVANCED", receipt });
    }
    return hold(H.REPLAY_CONFLICT);
  }
  return deepFreeze({ status: "BOUND", receipt });
}
