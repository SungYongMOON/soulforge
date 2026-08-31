// Human-Owner acceptance seam for a synthetic recovery-canary technical receipt.
//
// The technical runner cannot call this module to accept itself.  A separately
// supplied, trusted out-of-band pin binds one Human Owner envelope to the exact
// technical receipt digest, scope, expiry, and revocation state.

import { createHash } from "node:crypto";
import { types } from "node:util";

import {
  SYNTHETIC_RECOVERY_CANARY_TECHNICAL_RECEIPT_SCHEMA,
  syntheticRecoveryCanaryTechnicalReceiptDigest,
  validateSyntheticRecoveryCanaryTechnicalReceipt,
} from "./synthetic_recovery_canary_runner.mjs";

export const SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_RECEIPT_SCHEMA =
  "soulforge.backup_controller.synthetic_recovery_canary_acceptance_receipt.v0";
export const SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_EVIDENCE_SCHEMA =
  "soulforge.backup_controller.synthetic_recovery_canary_human_acceptance_evidence.v0";
export const SYNTHETIC_RECOVERY_CANARY_TRUSTED_PIN_SCHEMA =
  "soulforge.backup_controller.synthetic_recovery_canary_trusted_human_owner_pin.v0";

export const SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_HOLD_CODES = Object.freeze({
  INPUT_INVALID: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_INPUT_INVALID",
  TECHNICAL_RECEIPT_INVALID: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_TECHNICAL_RECEIPT_INVALID",
  TECHNICAL_RECEIPT_NOT_ACCEPTABLE: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_TECHNICAL_RECEIPT_NOT_ACCEPTABLE",
  EVIDENCE_INVALID: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_EVIDENCE_INVALID",
  TECHNICAL_RECEIPT_DIGEST_MISMATCH: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_TECHNICAL_RECEIPT_DIGEST_MISMATCH",
  SCOPE_MISMATCH: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_SCOPE_MISMATCH",
  SELF_ACCEPT_FORBIDDEN: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_SELF_ACCEPT_FORBIDDEN",
  HUMAN_OWNER_REF_INVALID: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_HUMAN_OWNER_REF_INVALID",
  PIN_REQUIRED: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_PIN_REQUIRED",
  PIN_INVALID: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_PIN_INVALID",
  PIN_STALE: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_PIN_STALE",
  PIN_EXPIRED: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_PIN_EXPIRED",
  PIN_REVOKED: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_PIN_REVOKED",
  PIN_DIGEST_MISMATCH: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_PIN_DIGEST_MISMATCH",
  REPLAY_CONFLICT: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_REPLAY_CONFLICT",
  TIME_INVALID: "SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_TIME_INVALID",
});

const H = SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_HOLD_CODES;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_REF = /^[a-z][a-z0-9._-]{1,160}$/u;
const HUMAN_OWNER_REF = /^owner\.human\.[a-z0-9._-]{1,140}$/u;
const HUMAN_ACCEPTANCE_REF = /^acceptance\.human-owner\.[a-z0-9._-]{1,140}$/u;
const HUMAN_AUTHORITY_REF = /^authority\.human-owner\.[a-z0-9._-]{1,140}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

const ROOT_FIELDS = Object.freeze([
  "technical_receipt",
  "human_acceptance_evidence",
  "prior_acceptance_receipt",
]);
const EVIDENCE_FIELDS = Object.freeze([
  "schema_version",
  "acceptance_ref",
  "source_ref",
  "project_scope_ref",
  "backup_generation_ref",
  "restore_test_ref",
  "technical_receipt_digest",
  "acceptance_owner_ref",
  "backup_restore_owner_ref",
  "decision",
  "verified",
  "verified_at",
  "expires_at",
]);
const PIN_FIELDS = Object.freeze([
  "schema_version",
  "pin_ref",
  "trusted_human_owner_authority_ref",
  "acceptance_evidence_digest",
  "technical_receipt_digest",
  "source_ref",
  "project_scope_ref",
  "acceptance_owner_ref",
  "issued_at",
  "expires_at",
  "revoked",
  "revocation_ref",
]);
const ACCEPTANCE_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "acceptance_ref",
  "source_ref",
  "project_scope_ref",
  "backup_generation_ref",
  "restore_test_ref",
  "technical_receipt_digest",
  "acceptance_owner_ref",
  "backup_restore_owner_ref",
  "trusted_acceptance_pin_ref",
  "trusted_human_owner_authority_ref",
  "accepted_at",
  "expires_at",
  "revocation_state",
  "claim_ceiling",
  "acceptance_receipt_digest",
]);

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestCanonical(value) {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function plainDescriptors(value) {
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
    return descriptors;
  } catch {
    return null;
  }
}

function exactRecord(value, fields, optional = []) {
  const descriptors = plainDescriptors(value);
  if (descriptors === null) return null;
  const keys = Object.keys(descriptors);
  if (keys.some((key) => !fields.includes(key))
      || fields.some((key) => !optional.includes(key) && !(key in descriptors))) return null;
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function validDigest(value) {
  return typeof value === "string" && SHA256.test(value);
}

function validRef(value) {
  return typeof value === "string" && SAFE_REF.test(value);
}

function validIso(value) {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const expanded = value.includes(".")
    ? value.replace(/\.(\d{1,3})Z$/u, (_match, fraction) => `.${fraction.padEnd(3, "0")}Z`)
    : value.replace(/Z$/u, ".000Z");
  return new Date(timestamp).toISOString() === expanded;
}

function hold(holdCode) {
  return Object.freeze({ status: "HOLD", hold_code: holdCode });
}

function normalizeRuntime(rawRuntime) {
  if (rawRuntime === undefined) return { now_iso: new Date().toISOString() };
  const runtime = exactRecord(rawRuntime, ["now_iso"]);
  if (runtime === null || !validIso(runtime.now_iso)) return null;
  return runtime;
}

function validEvidence(rawEvidence) {
  const evidence = exactRecord(rawEvidence, EVIDENCE_FIELDS);
  if (evidence === null
      || evidence.schema_version !== SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_EVIDENCE_SCHEMA
      || !HUMAN_ACCEPTANCE_REF.test(evidence.acceptance_ref ?? "")
      || !validRef(evidence.source_ref) || !validRef(evidence.project_scope_ref)
      || !validRef(evidence.backup_generation_ref) || !validRef(evidence.restore_test_ref)
      || !validDigest(evidence.technical_receipt_digest)
      || !validRef(evidence.acceptance_owner_ref) || !validRef(evidence.backup_restore_owner_ref)
      || evidence.decision !== "accepted" || evidence.verified !== true
      || !validIso(evidence.verified_at) || !validIso(evidence.expires_at)
      || Date.parse(evidence.expires_at) <= Date.parse(evidence.verified_at)) return null;
  return evidence;
}

function validPin(rawPin) {
  const pin = exactRecord(rawPin, PIN_FIELDS);
  if (pin === null
      || pin.schema_version !== SYNTHETIC_RECOVERY_CANARY_TRUSTED_PIN_SCHEMA
      || !validRef(pin.pin_ref)
      || !HUMAN_AUTHORITY_REF.test(pin.trusted_human_owner_authority_ref ?? "")
      || !validDigest(pin.acceptance_evidence_digest)
      || !validDigest(pin.technical_receipt_digest)
      || !validRef(pin.source_ref) || !validRef(pin.project_scope_ref)
      || !validRef(pin.acceptance_owner_ref)
      || !validIso(pin.issued_at) || !validIso(pin.expires_at)
      || Date.parse(pin.expires_at) <= Date.parse(pin.issued_at)
      || typeof pin.revoked !== "boolean"
      || (pin.revoked === false && pin.revocation_ref !== null)
      || (pin.revoked === true && !validRef(pin.revocation_ref))) return null;
  return pin;
}

export function syntheticRecoveryCanaryAcceptanceEvidenceDigest(evidence) {
  const record = validEvidence(evidence);
  return record === null ? null : digestCanonical(record);
}

export function syntheticRecoveryCanaryAcceptanceReceiptDigest(receipt) {
  const record = exactRecord(receipt, ACCEPTANCE_RECEIPT_FIELDS);
  if (record === null) return null;
  const { acceptance_receipt_digest: _ignored, ...basis } = record;
  return digestCanonical(basis);
}

export function validateSyntheticRecoveryCanaryAcceptanceReceipt(rawReceipt) {
  const receipt = exactRecord(rawReceipt, ACCEPTANCE_RECEIPT_FIELDS);
  if (receipt === null
      || receipt.schema_version !== SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_RECEIPT_SCHEMA
      || !HUMAN_ACCEPTANCE_REF.test(receipt.acceptance_ref ?? "")
      || !validRef(receipt.source_ref) || !validRef(receipt.project_scope_ref)
      || !validRef(receipt.backup_generation_ref) || !validRef(receipt.restore_test_ref)
      || !validDigest(receipt.technical_receipt_digest)
      || !HUMAN_OWNER_REF.test(receipt.acceptance_owner_ref ?? "")
      || !validRef(receipt.backup_restore_owner_ref)
      || receipt.acceptance_owner_ref === receipt.backup_restore_owner_ref
      || !validRef(receipt.trusted_acceptance_pin_ref)
      || !HUMAN_AUTHORITY_REF.test(receipt.trusted_human_owner_authority_ref ?? "")
      || !validIso(receipt.accepted_at) || !validIso(receipt.expires_at)
      || Date.parse(receipt.expires_at) <= Date.parse(receipt.accepted_at)
      || receipt.revocation_state !== "not_revoked_at_evaluation"
      || receipt.claim_ceiling !== "synthetic_human_acceptance_verified"
      || !validDigest(receipt.acceptance_receipt_digest)
      || syntheticRecoveryCanaryAcceptanceReceiptDigest(receipt) !== receipt.acceptance_receipt_digest) {
    return Object.freeze({ valid: false });
  }
  return deepFreeze({ valid: true, receipt });
}

export function acceptSyntheticRecoveryCanary(rawInput, trustedAcceptancePin = undefined, rawRuntime = undefined) {
  const input = exactRecord(rawInput, ROOT_FIELDS, ["prior_acceptance_receipt"]);
  if (input === null) return hold(H.INPUT_INVALID);
  const runtime = normalizeRuntime(rawRuntime);
  if (runtime === null) return hold(H.TIME_INVALID);

  const technical = validateSyntheticRecoveryCanaryTechnicalReceipt(input.technical_receipt);
  if (!technical.valid) return hold(H.TECHNICAL_RECEIPT_INVALID);
  if (technical.receipt.schema_version !== SYNTHETIC_RECOVERY_CANARY_TECHNICAL_RECEIPT_SCHEMA
      || technical.receipt.technical_state !== "synthetic_technical_restore_candidate") {
    return hold(H.TECHNICAL_RECEIPT_NOT_ACCEPTABLE);
  }
  const technicalDigest = syntheticRecoveryCanaryTechnicalReceiptDigest(technical.receipt);

  const evidence = validEvidence(input.human_acceptance_evidence);
  if (evidence === null) return hold(H.EVIDENCE_INVALID);
  if (evidence.source_ref !== technical.receipt.source_ref
      || evidence.project_scope_ref !== technical.receipt.project_scope_ref
      || evidence.backup_generation_ref !== technical.receipt.backup_generation_ref
      || evidence.restore_test_ref !== technical.receipt.restore_test_ref
      || evidence.backup_restore_owner_ref !== technical.receipt.backup_restore_owner_ref) {
    return hold(H.SCOPE_MISMATCH);
  }
  if (evidence.acceptance_owner_ref === evidence.backup_restore_owner_ref) {
    return hold(H.SELF_ACCEPT_FORBIDDEN);
  }
  if (!HUMAN_OWNER_REF.test(evidence.acceptance_owner_ref)) {
    return hold(H.HUMAN_OWNER_REF_INVALID);
  }
  if (evidence.technical_receipt_digest !== technicalDigest) {
    return hold(H.TECHNICAL_RECEIPT_DIGEST_MISMATCH);
  }
  if (Date.parse(evidence.expires_at) <= Date.parse(runtime.now_iso)) {
    return hold(H.PIN_EXPIRED);
  }

  if (trustedAcceptancePin === undefined) return hold(H.PIN_REQUIRED);
  const pin = validPin(trustedAcceptancePin);
  if (pin === null) return hold(H.PIN_INVALID);
  if (pin.revoked) return hold(H.PIN_REVOKED);
  if (Date.parse(pin.expires_at) <= Date.parse(runtime.now_iso)) return hold(H.PIN_EXPIRED);
  if (Date.parse(pin.issued_at) > Date.parse(evidence.verified_at)) return hold(H.PIN_STALE);
  if (pin.technical_receipt_digest !== technicalDigest) return hold(H.PIN_STALE);
  if (pin.source_ref !== technical.receipt.source_ref
      || pin.project_scope_ref !== technical.receipt.project_scope_ref
      || pin.acceptance_owner_ref !== evidence.acceptance_owner_ref) return hold(H.SCOPE_MISMATCH);
  if (pin.acceptance_evidence_digest !== syntheticRecoveryCanaryAcceptanceEvidenceDigest(evidence)) {
    return hold(H.PIN_DIGEST_MISMATCH);
  }

  const baseReceipt = {
    schema_version: SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_RECEIPT_SCHEMA,
    acceptance_ref: evidence.acceptance_ref,
    source_ref: technical.receipt.source_ref,
    project_scope_ref: technical.receipt.project_scope_ref,
    backup_generation_ref: technical.receipt.backup_generation_ref,
    restore_test_ref: technical.receipt.restore_test_ref,
    technical_receipt_digest: technicalDigest,
    acceptance_owner_ref: evidence.acceptance_owner_ref,
    backup_restore_owner_ref: technical.receipt.backup_restore_owner_ref,
    trusted_acceptance_pin_ref: pin.pin_ref,
    trusted_human_owner_authority_ref: pin.trusted_human_owner_authority_ref,
    accepted_at: evidence.verified_at,
    expires_at: evidence.expires_at,
    revocation_state: "not_revoked_at_evaluation",
    claim_ceiling: "synthetic_human_acceptance_verified",
  };
  const receipt = deepFreeze({
    ...baseReceipt,
    acceptance_receipt_digest: digestCanonical(baseReceipt),
  });

  if (input.prior_acceptance_receipt !== undefined) {
    const prior = validateSyntheticRecoveryCanaryAcceptanceReceipt(input.prior_acceptance_receipt);
    if (!prior.valid || canonical(prior.receipt) !== canonical(receipt)) {
      return hold(H.REPLAY_CONFLICT);
    }
    return deepFreeze({ status: "NO_OP", receipt });
  }
  return deepFreeze({ status: "HUMAN_ACCEPTED_SYNTHETIC_CANARY", receipt });
}
