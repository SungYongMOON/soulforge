// Owner-PC one-seat pre-physical readiness binder.
//
// This module is deliberately a pure, check-only boundary.  It accepts
// public-safe, already-issued evidence summaries and decides only whether the
// next one-physical-seat gate may be presented.  It never installs, starts,
// enrolls, revokes, recovers, releases, or grants authority.

import { types } from "node:util";

export const PREPHYSICAL_READINESS_INPUT_SCHEMA =
  "soulforge.deployment_pack.prephysical_readiness_input.v0";
export const PREPHYSICAL_READINESS_RESULT_SCHEMA =
  "soulforge.deployment_pack.prephysical_readiness_result.v0";

export const PREPHYSICAL_READINESS_STATUS = Object.freeze({
  HOLD: "HOLD",
  READY_FOR_ONE_PHYSICAL_SEAT_GATE: "READY_FOR_ONE_PHYSICAL_SEAT_GATE",
});

export const PREPHYSICAL_READINESS_HOLD_CODES = Object.freeze({
  INPUT_SHAPE_INVALID: "PREPHYSICAL_INPUT_SHAPE_INVALID",
  PROJECT_SCOPE_INVALID: "PREPHYSICAL_PROJECT_SCOPE_INVALID",
  PROJECT_SCOPE_MISMATCH: "PREPHYSICAL_PROJECT_SCOPE_MISMATCH",
  PACK_EVIDENCE_MISSING: "PREPHYSICAL_PACK_EVIDENCE_MISSING",
  PACK_EVIDENCE_INVALID: "PREPHYSICAL_PACK_EVIDENCE_INVALID",
  PACK_IDENTITY_MISMATCH: "PREPHYSICAL_PACK_IDENTITY_MISMATCH",
  PACK_DIGEST_MISSING: "PREPHYSICAL_PACK_DIGEST_MISSING",
  PACK_DIGEST_MISMATCH: "PREPHYSICAL_PACK_DIGEST_MISMATCH",
  PACK_EVIDENCE_NOT_READY: "PREPHYSICAL_PACK_EVIDENCE_NOT_READY",
  PRODUCT_COMPOSITION_RECEIPT_MISSING: "PREPHYSICAL_PRODUCT_COMPOSITION_RECEIPT_MISSING",
  PRODUCT_COMPOSITION_RECEIPT_INVALID: "PREPHYSICAL_PRODUCT_COMPOSITION_RECEIPT_INVALID",
  PRODUCT_COMPOSITION_NOT_READY: "PREPHYSICAL_PRODUCT_COMPOSITION_NOT_READY",
  MANUAL_RESOLUTION_RECEIPT_MISSING: "PREPHYSICAL_MANUAL_RESOLUTION_RECEIPT_MISSING",
  MANUAL_RESOLUTION_RECEIPT_INVALID: "PREPHYSICAL_MANUAL_RESOLUTION_RECEIPT_INVALID",
  MANUAL_RESOLUTION_NOT_READY: "PREPHYSICAL_MANUAL_RESOLUTION_NOT_READY",
  ACTUAL_MANUAL_EXERCISE_MISSING: "PREPHYSICAL_ACTUAL_MANUAL_EXERCISE_MISSING",
  ACTUAL_MANUAL_EXERCISE_INVALID: "PREPHYSICAL_ACTUAL_MANUAL_EXERCISE_INVALID",
  KNOWN_ISSUES_REF_MISSING: "PREPHYSICAL_KNOWN_ISSUES_REF_MISSING",
  SUPPORT_REF_MISSING: "PREPHYSICAL_SUPPORT_REF_MISSING",
  ROLLBACK_REF_MISSING: "PREPHYSICAL_ROLLBACK_REF_MISSING",
  SUPPORT_ROLLBACK_RECEIPT_INVALID: "PREPHYSICAL_SUPPORT_ROLLBACK_RECEIPT_INVALID",
  SUPPORT_ROLLBACK_NOT_READY: "PREPHYSICAL_SUPPORT_ROLLBACK_NOT_READY",
  AUTHORITY_TAXONOMY_RECEIPT_MISSING: "PREPHYSICAL_AUTHORITY_TAXONOMY_RECEIPT_MISSING",
  AUTHORITY_TAXONOMY_RECEIPT_INVALID: "PREPHYSICAL_AUTHORITY_TAXONOMY_RECEIPT_INVALID",
  AUTHORITY_TAXONOMY_BOUNDARY_INVALID: "PREPHYSICAL_AUTHORITY_TAXONOMY_BOUNDARY_INVALID",
  SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_MISSING: "PREPHYSICAL_SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_MISSING",
  SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_INVALID: "PREPHYSICAL_SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_INVALID",
  SYNTHETIC_RECOVERY_TECHNICAL_NOT_READY: "PREPHYSICAL_SYNTHETIC_RECOVERY_TECHNICAL_NOT_READY",
  SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_MISSING: "PREPHYSICAL_SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_MISSING",
  SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_INVALID: "PREPHYSICAL_SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_INVALID",
  HUMAN_ACCEPTANCE_MISSING: "PREPHYSICAL_HUMAN_ACCEPTANCE_MISSING",
  HUMAN_ACCEPTANCE_INVALID: "PREPHYSICAL_HUMAN_ACCEPTANCE_INVALID",
  RECOVERY_RECEIPT_BINDING_MISMATCH: "PREPHYSICAL_RECOVERY_RECEIPT_BINDING_MISMATCH",
  DEVICE_PROJECT_CREDENTIAL_BINDING_MISSING: "PREPHYSICAL_DEVICE_PROJECT_CREDENTIAL_BINDING_MISSING",
  DEVICE_PROJECT_CREDENTIAL_BINDING_INVALID: "PREPHYSICAL_DEVICE_PROJECT_CREDENTIAL_BINDING_INVALID",
  EXACT_BINDING_MISMATCH: "PREPHYSICAL_EXACT_BINDING_MISMATCH",
  DEVICE_ENROLLMENT_MISSING: "PREPHYSICAL_DEVICE_ENROLLMENT_MISSING",
  DEVICE_ENROLLMENT_INVALID: "PREPHYSICAL_DEVICE_ENROLLMENT_INVALID",
  DEVICE_REVOKE_PROOF_MISSING: "PREPHYSICAL_DEVICE_REVOKE_PROOF_MISSING",
  DEVICE_REVOKE_PROOF_INVALID: "PREPHYSICAL_DEVICE_REVOKE_PROOF_INVALID",
  DEVICE_RECOVERY_PROOF_MISSING: "PREPHYSICAL_DEVICE_RECOVERY_PROOF_MISSING",
  DEVICE_RECOVERY_PROOF_INVALID: "PREPHYSICAL_DEVICE_RECOVERY_PROOF_INVALID",
  FALLBACK_FORBIDDEN: "PREPHYSICAL_FALLBACK_FORBIDDEN",
  FRESHNESS_MISSING: "PREPHYSICAL_FRESHNESS_MISSING",
  FRESHNESS_INVALID: "PREPHYSICAL_FRESHNESS_INVALID",
  PUBLIC_SAFETY_INVALID: "PREPHYSICAL_PUBLIC_SAFETY_INVALID",
});

const H = PREPHYSICAL_READINESS_HOLD_CODES;
const EXPECTED_PACK_IDS = Object.freeze([
  "hpp_server_pack",
  "team_client_pack",
  "backup_recovery_extension",
]);
const REQUIRED_MANUAL_ROLES = Object.freeze([
  "hpp_server_operator",
  "team_client_install_use_revoke_recovery",
  "external_connector_backup_restore",
]);

const ROOT_FIELDS = Object.freeze([
  "schema_version",
  "evaluation_ref",
  "evaluated_at",
  "project_scope_ref",
  "pack_evidence",
  "product_composition_receipt",
  "manual_resolution_receipt",
  "support_rollback_receipt",
  "authority_taxonomy_receipt",
  "synthetic_recovery_receipts",
  "device_project_credential_binding",
]);
const PACK_FIELDS = Object.freeze([
  "pack_id",
  "pack_ref",
  "pack_version",
  "pack_digest",
  "release_manifest_ref",
  "release_manifest_digest",
  "validation_receipt_ref",
  "validation_receipt_digest",
  "project_scope_ref",
  "observed_at",
  "expires_at",
  "freshness",
  "state",
]);
const PACK_PIN_FIELDS = Object.freeze([
  "pack_id",
  "pack_ref",
  "pack_digest",
  "release_manifest_digest",
]);
const PRODUCT_COMPOSITION_FIELDS = Object.freeze([
  "schema_version",
  "receipt_ref",
  "receipt_digest",
  "project_scope_ref",
  "pack_pins",
  "observed_at",
  "expires_at",
  "freshness",
  "composition_state",
  "source_relocation_performed",
  "effects_performed",
  "unresolved_interface_count",
]);
const MANUAL_RESOLUTION_FIELDS = Object.freeze([
  "schema_version",
  "receipt_ref",
  "receipt_digest",
  "project_scope_ref",
  "pack_pins",
  "observed_at",
  "expires_at",
  "freshness",
  "resolution_state",
  "catalog_state",
  "manual_exercise",
]);
const MANUAL_EXERCISE_FIELDS = Object.freeze([
  "exercise_ref",
  "exercise_digest",
  "project_scope_ref",
  "device_ref",
  "credential_handle_ref",
  "pack_pins",
  "exercise_kind",
  "state",
  "operator_ref",
  "completed_at",
  "manual_roles",
  "revocation_recovery_exercised",
]);
const SUPPORT_ROLLBACK_FIELDS = Object.freeze([
  "schema_version",
  "receipt_ref",
  "receipt_digest",
  "project_scope_ref",
  "pack_pins",
  "known_issues_ref",
  "support_owner_ref",
  "support_escalation_ref",
  "rollback_ref",
  "rollback_digest",
  "rollback_pins",
  "observed_at",
  "expires_at",
  "freshness",
  "state",
]);
const ROLLBACK_PIN_FIELDS = Object.freeze([
  "pack_id",
  "pack_ref",
  "pack_digest",
  "release_manifest_digest",
  "rollback_ref",
  "rollback_digest",
]);
const AUTHORITY_FIELDS = Object.freeze([
  "schema_version",
  "receipt_ref",
  "receipt_digest",
  "project_scope_ref",
  "pack_pins",
  "observed_at",
  "expires_at",
  "freshness",
  "status",
  "action_id",
  "risk_class",
  "evidence_class",
  "effect_count",
  "authority_granted",
  "effects_performed",
  "claim_ceiling",
]);
const RECOVERY_ROOT_FIELDS = Object.freeze([
  "technical_receipt",
  "acceptance_receipt",
]);
const RECOVERY_TECHNICAL_FIELDS = Object.freeze([
  "schema_version",
  "receipt_ref",
  "receipt_digest",
  "project_scope_ref",
  "pack_pins",
  "verified_at",
  "expires_at",
  "freshness",
  "technical_state",
  "isolated_restore",
  "item_parity",
  "byte_parity",
  "manifest_readback",
  "backup_readback",
  "restore_readback",
]);
const RECOVERY_ACCEPTANCE_FIELDS = Object.freeze([
  "schema_version",
  "receipt_ref",
  "receipt_digest",
  "project_scope_ref",
  "technical_receipt_digest",
  "accepted_at",
  "expires_at",
  "freshness",
  "decision",
  "accepted_by_human",
  "acceptance_owner_ref",
  "backup_restore_owner_ref",
  "revoked",
  "claim_ceiling",
]);
const BINDING_FIELDS = Object.freeze([
  "schema_version",
  "attestation_ref",
  "attestation_digest",
  "project_scope_ref",
  "device_ref",
  "credential_handle_ref",
  "pack_pins",
  "attested_at",
  "expires_at",
  "freshness",
  "revoked",
  "fallback_used",
  "device_enrollment",
  "device_revoke_exercise",
  "device_recovery_exercise",
]);
const DEVICE_ENROLLMENT_FIELDS = Object.freeze([
  "enrollment_ref",
  "enrollment_digest",
  "project_scope_ref",
  "device_ref",
  "credential_handle_ref",
  "state",
  "enrolled_at",
  "expires_at",
  "freshness",
]);
const DEVICE_REVOKE_FIELDS = Object.freeze([
  "exercise_ref",
  "exercise_digest",
  "project_scope_ref",
  "device_ref",
  "credential_handle_ref",
  "state",
  "verified_at",
  "expires_at",
  "freshness",
]);
const DEVICE_RECOVERY_FIELDS = Object.freeze([
  "exercise_ref",
  "exercise_digest",
  "project_scope_ref",
  "device_ref",
  "credential_handle_ref",
  "state",
  "verified_at",
  "expires_at",
  "freshness",
]);

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const OPAQUE_REF = /^[a-z][a-z0-9._:-]{1,160}$/u;
const ISO_Z = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u;
const UNSAFE_TEXT = /password|passwd|api[_-]?key|token(?:_value)?|secret(?:_value)?|private(?:[_ -]?key)?|raw(?:[_ -]?payload)?|BEGIN [A-Z ]+KEY/iu;
const ABSOLUTE_OR_LOCAL_PATH = /(?:^[a-z]:[\\/]|\\\\|\.{2}[\\/]|\/(?:users|home|tmp|var|etc)(?:\/|$))/iu;

function add(blockers, code) {
  blockers.add(code);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Read descriptors rather than properties.  This refuses accessors, proxies,
// non-plain objects, symbol keys, and trap failures before they can influence
// a readiness decision.
function ownDataRecord(value) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) return null;
    if (Object.values(descriptors).some((descriptor) => !("value" in descriptor)
      || descriptor.get !== undefined || descriptor.set !== undefined)) return null;
    return Object.fromEntries(Object.keys(descriptors).map((key) => [key, descriptors[key].value]));
  } catch {
    return null;
  }
}

function exactRecord(value, fields) {
  const record = ownDataRecord(value);
  if (record === null) return null;
  const keys = Object.keys(record);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))
      || fields.some((key) => !Object.hasOwn(record, key))) return null;
  return Object.fromEntries(fields.map((key) => [key, record[key]]));
}

function plainArray(value) {
  try {
    if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) return null;
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.get !== undefined
        || lengthDescriptor.set !== undefined || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0) return null;
    const values = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        return null;
      }
      values.push(descriptor.value);
    }
    const allowedKeys = new Set(["length", ...values.map((_value, index) => String(index))]);
    if (Object.keys(descriptors).some((key) => !allowedKeys.has(key))) return null;
    return values;
  } catch {
    return null;
  }
}

function publicSafeRef(value) {
  return typeof value === "string" && OPAQUE_REF.test(value)
    && !UNSAFE_TEXT.test(value) && !ABSOLUTE_OR_LOCAL_PATH.test(value);
}

function publicSafeDigest(value) {
  return typeof value === "string" && SHA256.test(value);
}

function humanRef(value) {
  return publicSafeRef(value) && value.startsWith("human:");
}

function deviceRef(value) {
  return publicSafeRef(value) && value.startsWith("device:");
}

function credentialHandleRef(value) {
  return publicSafeRef(value) && value.startsWith("credential:");
}

function validIso(value) {
  if (typeof value !== "string") return false;
  if (!ISO_Z.test(value)) return false;
  const match = value.match(ISO_Z);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function validFreshness(record, observedAtField, evaluatedAt, blockers) {
  if (record === null || record.freshness === undefined || record[observedAtField] === undefined
      || record.expires_at === undefined) {
    add(blockers, H.FRESHNESS_MISSING);
    return false;
  }
  if (record.freshness !== "fresh" || !validIso(record[observedAtField])
      || !validIso(record.expires_at) || !validIso(evaluatedAt)
      || record[observedAtField] > evaluatedAt || record.expires_at <= evaluatedAt) {
    add(blockers, H.FRESHNESS_INVALID);
    return false;
  }
  return true;
}

function sameProject(record, projectScopeRef, blockers) {
  if (record === null || !publicSafeRef(record.project_scope_ref)) {
    add(blockers, H.PROJECT_SCOPE_INVALID);
    return false;
  }
  if (record.project_scope_ref !== projectScopeRef) {
    add(blockers, H.PROJECT_SCOPE_MISMATCH);
    return false;
  }
  return true;
}

function exactStringArray(value, expected) {
  const entries = plainArray(value);
  return entries !== null && entries.length === expected.length
    && entries.every((entry, index) => entry === expected[index]);
}

function packPinFrom(pack) {
  return Object.freeze({
    pack_id: pack.pack_id,
    pack_ref: pack.pack_ref,
    pack_digest: pack.pack_digest,
    release_manifest_digest: pack.release_manifest_digest,
  });
}

function validatePackPins(value, expectedPins, blockers) {
  const entries = plainArray(value);
  if (entries === null || entries.length !== expectedPins.length) {
    add(blockers, H.PACK_DIGEST_MISMATCH);
    return false;
  }
  let valid = true;
  for (let index = 0; index < expectedPins.length; index += 1) {
    const pin = exactRecord(entries[index], PACK_PIN_FIELDS);
    const expected = expectedPins[index];
    if (pin === null || pin.pack_id !== expected.pack_id || pin.pack_ref !== expected.pack_ref
        || pin.pack_digest !== expected.pack_digest
        || pin.release_manifest_digest !== expected.release_manifest_digest) {
      valid = false;
    }
  }
  if (!valid) add(blockers, H.PACK_DIGEST_MISMATCH);
  return valid;
}

function validatePackEvidence(value, projectScopeRef, evaluatedAt, blockers) {
  const entries = plainArray(value);
  if (entries === null) {
    add(blockers, H.PACK_EVIDENCE_MISSING);
    add(blockers, H.PACK_DIGEST_MISSING);
    return [];
  }
  if (entries.length !== EXPECTED_PACK_IDS.length) {
    add(blockers, H.PACK_EVIDENCE_INVALID);
    add(blockers, H.PACK_IDENTITY_MISMATCH);
  }
  const packs = [];
  for (let index = 0; index < EXPECTED_PACK_IDS.length; index += 1) {
    const record = exactRecord(entries[index], PACK_FIELDS);
    if (record === null) {
      add(blockers, H.PACK_EVIDENCE_INVALID);
      add(blockers, H.PACK_DIGEST_MISSING);
      continue;
    }
    if (record.pack_id !== EXPECTED_PACK_IDS[index]) add(blockers, H.PACK_IDENTITY_MISMATCH);
    if (!publicSafeRef(record.pack_ref) || !SEMVER.test(record.pack_version)
        || !publicSafeRef(record.release_manifest_ref) || !publicSafeRef(record.validation_receipt_ref)) {
      add(blockers, H.PACK_EVIDENCE_INVALID);
    }
    if (!publicSafeDigest(record.pack_digest) || !publicSafeDigest(record.release_manifest_digest)
        || !publicSafeDigest(record.validation_receipt_digest)) {
      add(blockers, H.PACK_DIGEST_MISSING);
    }
    sameProject(record, projectScopeRef, blockers);
    validFreshness(record, "observed_at", evaluatedAt, blockers);
    if (record.state !== "prephysical_validated") add(blockers, H.PACK_EVIDENCE_NOT_READY);
    packs.push(record);
  }
  if (entries.length > EXPECTED_PACK_IDS.length) add(blockers, H.PACK_IDENTITY_MISMATCH);
  const refs = new Set(packs.map((pack) => pack.pack_ref));
  const digests = new Set(packs.map((pack) => pack.pack_digest));
  if (refs.size !== packs.length || digests.size !== packs.length) add(blockers, H.PACK_IDENTITY_MISMATCH);
  return packs.length === EXPECTED_PACK_IDS.length ? packs.map(packPinFrom) : [];
}

function validateProductComposition(value, expectedPins, projectScopeRef, evaluatedAt, blockers) {
  if (value === undefined || value === null) {
    add(blockers, H.PRODUCT_COMPOSITION_RECEIPT_MISSING);
    return;
  }
  const record = exactRecord(value, PRODUCT_COMPOSITION_FIELDS);
  if (record === null) {
    add(blockers, H.PRODUCT_COMPOSITION_RECEIPT_INVALID);
    return;
  }
  if (record.schema_version !== "soulforge.module_operability.product_composition_receipt.v0"
      || !publicSafeRef(record.receipt_ref) || !publicSafeDigest(record.receipt_digest)) {
    add(blockers, H.PRODUCT_COMPOSITION_RECEIPT_INVALID);
  }
  sameProject(record, projectScopeRef, blockers);
  validatePackPins(record.pack_pins, expectedPins, blockers);
  validFreshness(record, "observed_at", evaluatedAt, blockers);
  if (record.composition_state !== "verified_no_move" || record.source_relocation_performed !== false
      || record.effects_performed !== 0 || record.unresolved_interface_count !== 0) {
    add(blockers, H.PRODUCT_COMPOSITION_NOT_READY);
  }
}

function validateManualResolution(value, expectedPins, projectScopeRef, evaluatedAt, blockers) {
  if (value === undefined || value === null) {
    add(blockers, H.MANUAL_RESOLUTION_RECEIPT_MISSING);
    add(blockers, H.ACTUAL_MANUAL_EXERCISE_MISSING);
    return null;
  }
  const record = exactRecord(value, MANUAL_RESOLUTION_FIELDS);
  if (record === null) {
    add(blockers, H.MANUAL_RESOLUTION_RECEIPT_INVALID);
    add(blockers, H.ACTUAL_MANUAL_EXERCISE_MISSING);
    return null;
  }
  if (record.schema_version !== "soulforge.deployment_pack.manual_resolution_receipt.v0"
      || !publicSafeRef(record.receipt_ref) || !publicSafeDigest(record.receipt_digest)) {
    add(blockers, H.MANUAL_RESOLUTION_RECEIPT_INVALID);
  }
  sameProject(record, projectScopeRef, blockers);
  validatePackPins(record.pack_pins, expectedPins, blockers);
  validFreshness(record, "observed_at", evaluatedAt, blockers);
  if (record.resolution_state !== "ready" || record.catalog_state !== "ready") {
    add(blockers, H.MANUAL_RESOLUTION_NOT_READY);
  }

  if (record.manual_exercise === null || record.manual_exercise === undefined) {
    add(blockers, H.ACTUAL_MANUAL_EXERCISE_MISSING);
    return null;
  }
  const exercise = exactRecord(record.manual_exercise, MANUAL_EXERCISE_FIELDS);
  if (exercise === null) {
    add(blockers, H.ACTUAL_MANUAL_EXERCISE_INVALID);
    return null;
  }
  if (!publicSafeRef(exercise.exercise_ref) || !publicSafeDigest(exercise.exercise_digest)
      || !deviceRef(exercise.device_ref) || !credentialHandleRef(exercise.credential_handle_ref)
      || !humanRef(exercise.operator_ref) || !validIso(exercise.completed_at)
      || exercise.completed_at > evaluatedAt || exercise.exercise_kind !== "actual_owner_pc_one_seat"
      || exercise.state !== "completed" || exercise.revocation_recovery_exercised !== true
      || !exactStringArray(exercise.manual_roles, REQUIRED_MANUAL_ROLES)) {
    add(blockers, H.ACTUAL_MANUAL_EXERCISE_INVALID);
  }
  sameProject(exercise, projectScopeRef, blockers);
  validatePackPins(exercise.pack_pins, expectedPins, blockers);
  return exercise;
}

function validateSupportRollback(value, expectedPins, projectScopeRef, evaluatedAt, blockers) {
  if (value === undefined || value === null) {
    add(blockers, H.KNOWN_ISSUES_REF_MISSING);
    add(blockers, H.SUPPORT_REF_MISSING);
    add(blockers, H.ROLLBACK_REF_MISSING);
    return;
  }
  const record = exactRecord(value, SUPPORT_ROLLBACK_FIELDS);
  if (record === null) {
    add(blockers, H.SUPPORT_ROLLBACK_RECEIPT_INVALID);
    return;
  }
  if (record.schema_version !== "soulforge.deployment_pack.support_rollback_receipt.v0"
      || !publicSafeRef(record.receipt_ref) || !publicSafeDigest(record.receipt_digest)) {
    add(blockers, H.SUPPORT_ROLLBACK_RECEIPT_INVALID);
  }
  if (!publicSafeRef(record.known_issues_ref)) add(blockers, H.KNOWN_ISSUES_REF_MISSING);
  if (!publicSafeRef(record.support_owner_ref) || !publicSafeRef(record.support_escalation_ref)) {
    add(blockers, H.SUPPORT_REF_MISSING);
  }
  if (!publicSafeRef(record.rollback_ref) || !publicSafeDigest(record.rollback_digest)) {
    add(blockers, H.ROLLBACK_REF_MISSING);
  }
  sameProject(record, projectScopeRef, blockers);
  validatePackPins(record.pack_pins, expectedPins, blockers);
  validFreshness(record, "observed_at", evaluatedAt, blockers);
  const rollbacks = plainArray(record.rollback_pins);
  let rollbackValid = rollbacks !== null && rollbacks.length === expectedPins.length;
  for (let index = 0; rollbackValid && index < expectedPins.length; index += 1) {
    const rollback = exactRecord(rollbacks[index], ROLLBACK_PIN_FIELDS);
    const expected = expectedPins[index];
    rollbackValid = rollback !== null && rollback.pack_id === expected.pack_id
      && rollback.pack_ref === expected.pack_ref && rollback.pack_digest === expected.pack_digest
      && rollback.release_manifest_digest === expected.release_manifest_digest
      && publicSafeRef(rollback.rollback_ref) && publicSafeDigest(rollback.rollback_digest);
  }
  if (!rollbackValid) add(blockers, H.ROLLBACK_REF_MISSING);
  if (record.state !== "ready_for_gate") add(blockers, H.SUPPORT_ROLLBACK_NOT_READY);
}

function validateAuthorityTaxonomy(value, expectedPins, projectScopeRef, evaluatedAt, blockers) {
  if (value === undefined || value === null) {
    add(blockers, H.AUTHORITY_TAXONOMY_RECEIPT_MISSING);
    return;
  }
  const record = exactRecord(value, AUTHORITY_FIELDS);
  if (record === null) {
    add(blockers, H.AUTHORITY_TAXONOMY_RECEIPT_INVALID);
    return;
  }
  if (record.schema_version !== "soulforge.authority_taxonomy.prephysical_receipt.v0"
      || !publicSafeRef(record.receipt_ref) || !publicSafeDigest(record.receipt_digest)) {
    add(blockers, H.AUTHORITY_TAXONOMY_RECEIPT_INVALID);
  }
  sameProject(record, projectScopeRef, blockers);
  validatePackPins(record.pack_pins, expectedPins, blockers);
  validFreshness(record, "observed_at", evaluatedAt, blockers);
  if (record.status !== "ADMISSION_CANDIDATE" || record.action_id !== "read_projection"
      || record.risk_class !== "R0" || record.evidence_class !== "EV1"
      || record.effect_count !== 0 || record.authority_granted !== false
      || record.effects_performed !== 0 || record.claim_ceiling !== "prephysical_gate_evidence") {
    add(blockers, H.AUTHORITY_TAXONOMY_BOUNDARY_INVALID);
  }
}

function validateSyntheticRecovery(value, expectedPins, projectScopeRef, evaluatedAt, blockers) {
  if (value === undefined || value === null) {
    add(blockers, H.SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_MISSING);
    add(blockers, H.SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_MISSING);
    add(blockers, H.HUMAN_ACCEPTANCE_MISSING);
    return;
  }
  const root = exactRecord(value, RECOVERY_ROOT_FIELDS);
  if (root === null) {
    add(blockers, H.SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_INVALID);
    add(blockers, H.SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_INVALID);
    add(blockers, H.HUMAN_ACCEPTANCE_MISSING);
    return;
  }

  let technical = null;
  if (root.technical_receipt === null || root.technical_receipt === undefined) {
    add(blockers, H.SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_MISSING);
  } else {
    technical = exactRecord(root.technical_receipt, RECOVERY_TECHNICAL_FIELDS);
    if (technical === null) {
      add(blockers, H.SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_INVALID);
    } else {
      if (technical.schema_version !== "soulforge.backup_controller.synthetic_recovery_canary_technical_receipt.v0"
          || !publicSafeRef(technical.receipt_ref) || !publicSafeDigest(technical.receipt_digest)) {
        add(blockers, H.SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_INVALID);
      }
      sameProject(technical, projectScopeRef, blockers);
      validatePackPins(technical.pack_pins, expectedPins, blockers);
      validFreshness(technical, "verified_at", evaluatedAt, blockers);
      if (technical.technical_state !== "synthetic_technical_restore_candidate"
          || technical.isolated_restore !== true || technical.item_parity !== true
          || technical.byte_parity !== true || technical.manifest_readback !== true
          || technical.backup_readback !== true || technical.restore_readback !== true) {
        add(blockers, H.SYNTHETIC_RECOVERY_TECHNICAL_NOT_READY);
      }
    }
  }

  if (root.acceptance_receipt === null || root.acceptance_receipt === undefined) {
    add(blockers, H.SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_MISSING);
    add(blockers, H.HUMAN_ACCEPTANCE_MISSING);
    return;
  }
  const acceptance = exactRecord(root.acceptance_receipt, RECOVERY_ACCEPTANCE_FIELDS);
  if (acceptance === null) {
    add(blockers, H.SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_INVALID);
    add(blockers, H.HUMAN_ACCEPTANCE_INVALID);
    return;
  }
  if (acceptance.schema_version !== "soulforge.backup_controller.synthetic_recovery_canary_acceptance_receipt.v0"
      || !publicSafeRef(acceptance.receipt_ref) || !publicSafeDigest(acceptance.receipt_digest)) {
    add(blockers, H.SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_INVALID);
  }
  sameProject(acceptance, projectScopeRef, blockers);
  validFreshness(acceptance, "accepted_at", evaluatedAt, blockers);
  if (acceptance.decision !== "accepted" || acceptance.accepted_by_human !== true
      || !humanRef(acceptance.acceptance_owner_ref)
      || !publicSafeRef(acceptance.backup_restore_owner_ref)
      || acceptance.acceptance_owner_ref === acceptance.backup_restore_owner_ref
      || acceptance.revoked !== false
      || acceptance.claim_ceiling !== "synthetic_human_acceptance_verified") {
    add(blockers, H.HUMAN_ACCEPTANCE_INVALID);
  }
  if (technical === null || acceptance.technical_receipt_digest !== technical.receipt_digest) {
    add(blockers, H.RECOVERY_RECEIPT_BINDING_MISMATCH);
  }
}

function sameBindingTuple(record, binding, projectScopeRef) {
  return record !== null && record.project_scope_ref === projectScopeRef
    && record.device_ref === binding.device_ref
    && record.credential_handle_ref === binding.credential_handle_ref;
}

function validateDeviceProjectCredentialBinding(value, expectedPins, projectScopeRef, evaluatedAt, manualExercise, blockers) {
  if (value === undefined || value === null) {
    add(blockers, H.DEVICE_PROJECT_CREDENTIAL_BINDING_MISSING);
    add(blockers, H.DEVICE_ENROLLMENT_MISSING);
    add(blockers, H.DEVICE_REVOKE_PROOF_MISSING);
    add(blockers, H.DEVICE_RECOVERY_PROOF_MISSING);
    add(blockers, H.EXACT_BINDING_MISMATCH);
    return;
  }
  const binding = exactRecord(value, BINDING_FIELDS);
  if (binding === null) {
    add(blockers, H.DEVICE_PROJECT_CREDENTIAL_BINDING_INVALID);
    add(blockers, H.DEVICE_ENROLLMENT_MISSING);
    add(blockers, H.DEVICE_REVOKE_PROOF_MISSING);
    add(blockers, H.DEVICE_RECOVERY_PROOF_MISSING);
    return;
  }
  if (binding.schema_version !== "soulforge.deployment_pack.device_project_credential_binding_attestation.v0"
      || !publicSafeRef(binding.attestation_ref) || !publicSafeDigest(binding.attestation_digest)
      || !deviceRef(binding.device_ref) || !credentialHandleRef(binding.credential_handle_ref)) {
    add(blockers, H.DEVICE_PROJECT_CREDENTIAL_BINDING_INVALID);
  }
  sameProject(binding, projectScopeRef, blockers);
  validatePackPins(binding.pack_pins, expectedPins, blockers);
  validFreshness(binding, "attested_at", evaluatedAt, blockers);
  if (binding.revoked !== false || binding.fallback_used !== false) add(blockers, H.FALLBACK_FORBIDDEN);
  if (manualExercise === null || !sameBindingTuple(manualExercise, binding, projectScopeRef)) {
    add(blockers, H.EXACT_BINDING_MISMATCH);
  }

  if (binding.device_enrollment === null || binding.device_enrollment === undefined) {
    add(blockers, H.DEVICE_ENROLLMENT_MISSING);
  } else {
    const enrollment = exactRecord(binding.device_enrollment, DEVICE_ENROLLMENT_FIELDS);
    if (enrollment === null) {
      add(blockers, H.DEVICE_ENROLLMENT_INVALID);
    } else {
      if (!publicSafeRef(enrollment.enrollment_ref) || !publicSafeDigest(enrollment.enrollment_digest)
          || enrollment.state !== "enrolled" || !sameBindingTuple(enrollment, binding, projectScopeRef)) {
        add(blockers, H.DEVICE_ENROLLMENT_INVALID);
      }
      sameProject(enrollment, projectScopeRef, blockers);
      validFreshness(enrollment, "enrolled_at", evaluatedAt, blockers);
    }
  }

  if (binding.device_revoke_exercise === null || binding.device_revoke_exercise === undefined) {
    add(blockers, H.DEVICE_REVOKE_PROOF_MISSING);
  } else {
    const revoke = exactRecord(binding.device_revoke_exercise, DEVICE_REVOKE_FIELDS);
    if (revoke === null) {
      add(blockers, H.DEVICE_REVOKE_PROOF_INVALID);
    } else {
      if (!publicSafeRef(revoke.exercise_ref) || !publicSafeDigest(revoke.exercise_digest)
          || revoke.state !== "verified_revoke" || !sameBindingTuple(revoke, binding, projectScopeRef)) {
        add(blockers, H.DEVICE_REVOKE_PROOF_INVALID);
      }
      sameProject(revoke, projectScopeRef, blockers);
      validFreshness(revoke, "verified_at", evaluatedAt, blockers);
    }
  }

  if (binding.device_recovery_exercise === null || binding.device_recovery_exercise === undefined) {
    add(blockers, H.DEVICE_RECOVERY_PROOF_MISSING);
  } else {
    const recovery = exactRecord(binding.device_recovery_exercise, DEVICE_RECOVERY_FIELDS);
    if (recovery === null) {
      add(blockers, H.DEVICE_RECOVERY_PROOF_INVALID);
    } else {
      if (!publicSafeRef(recovery.exercise_ref) || !publicSafeDigest(recovery.exercise_digest)
          || recovery.state !== "verified_recovery" || !sameBindingTuple(recovery, binding, projectScopeRef)) {
        add(blockers, H.DEVICE_RECOVERY_PROOF_INVALID);
      }
      sameProject(recovery, projectScopeRef, blockers);
      validFreshness(recovery, "verified_at", evaluatedAt, blockers);
    }
  }
}

function resultFor(blockers) {
  const codes = [...blockers].sort();
  return deepFreeze({
    schema_version: PREPHYSICAL_READINESS_RESULT_SCHEMA,
    status: codes.length === 0
      ? PREPHYSICAL_READINESS_STATUS.READY_FOR_ONE_PHYSICAL_SEAT_GATE
      : PREPHYSICAL_READINESS_STATUS.HOLD,
    gate: "one_physical_seat",
    effect: "check_only",
    blockers: codes,
  });
}

// The caller supplies its own evaluation timestamp.  The binder never reads a
// clock, and applies freshness only relative to that explicit timestamp.
export function evaluateInternalRcPrephysicalReadiness(rawPacket) {
  const blockers = new Set();
  const packet = exactRecord(rawPacket, ROOT_FIELDS);
  if (packet === null) {
    add(blockers, H.INPUT_SHAPE_INVALID);
  }
  const root = packet ?? {};
  const projectScopeRef = publicSafeRef(root.project_scope_ref) ? root.project_scope_ref : null;
  const evaluatedAt = validIso(root.evaluated_at) ? root.evaluated_at : null;
  if (!publicSafeRef(root.evaluation_ref) || projectScopeRef === null || evaluatedAt === null
      || root.schema_version !== PREPHYSICAL_READINESS_INPUT_SCHEMA) {
    add(blockers, H.INPUT_SHAPE_INVALID);
    add(blockers, H.PROJECT_SCOPE_INVALID);
    add(blockers, H.FRESHNESS_MISSING);
  }

  const safeProjectScopeRef = projectScopeRef ?? "project:invalid";
  const safeEvaluatedAt = evaluatedAt ?? "0001-01-01T00:00:00.000Z";
  const expectedPins = validatePackEvidence(root.pack_evidence, safeProjectScopeRef, safeEvaluatedAt, blockers);
  validateProductComposition(root.product_composition_receipt, expectedPins, safeProjectScopeRef, safeEvaluatedAt, blockers);
  const manualExercise = validateManualResolution(
    root.manual_resolution_receipt,
    expectedPins,
    safeProjectScopeRef,
    safeEvaluatedAt,
    blockers,
  );
  validateSupportRollback(root.support_rollback_receipt, expectedPins, safeProjectScopeRef, safeEvaluatedAt, blockers);
  validateAuthorityTaxonomy(root.authority_taxonomy_receipt, expectedPins, safeProjectScopeRef, safeEvaluatedAt, blockers);
  validateSyntheticRecovery(root.synthetic_recovery_receipts, expectedPins, safeProjectScopeRef, safeEvaluatedAt, blockers);
  validateDeviceProjectCredentialBinding(
    root.device_project_credential_binding,
    expectedPins,
    safeProjectScopeRef,
    safeEvaluatedAt,
    manualExercise,
    blockers,
  );
  return resultFor(blockers);
}

export const assessInternalRcPrephysicalReadiness = evaluateInternalRcPrephysicalReadiness;
