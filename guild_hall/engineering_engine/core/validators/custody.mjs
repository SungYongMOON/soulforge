// Lane 1B — source inventory, byte custody, and eligibility.
//
// The snapshot is immutable. The files it was derived from are not: a shared drive keeps
// living, and a document can be edited or moved after a finding cited it. Custody is how a
// snapshot stays meaningful anyway.
//
// Owner decision (custody_mode): the original stays where its owner keeps it and only its
// byte hash is pinned, while the span that was actually cited is retained immutably. One
// mode, not a menu — a snapshot in which different sources carry different replay
// guarantees has no single answer to "can this conclusion be reproduced".
//
// The consequence the design accepts: the cited part survives the original changing, and
// re-reading anything outside the citation needs the original. That is stated rather than
// hidden, because a custody scheme whose limits are unstated reads as a stronger guarantee
// than it is.

import { inspectInstant } from './canonical.mjs';
import { AUTHORITY_FAMILIES, APPLICABILITY } from './authority.mjs';
import { classifyRef, RESOLUTION } from './identity.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  INVENTORY_FIELD_MISSING: 'CUSTODY_INVENTORY_FIELD_MISSING',
  CUSTODY_MODE_INVALID: 'CUSTODY_MODE_INVALID',
  HASH_INVALID: 'CUSTODY_HASH_INVALID',
  LENGTH_INVALID: 'CUSTODY_LENGTH_INVALID',
  INSTANT_INVALID: 'CUSTODY_INSTANT_INVALID',
  PRESENCE_INVALID: 'CUSTODY_PRESENCE_INVALID',
  SPAN_INVALID: 'CUSTODY_SPAN_INVALID',
  SPAN_NOT_RETAINED: 'CUSTODY_SPAN_NOT_RETAINED',
  SPAN_RETENTION_UNVERIFIABLE: 'CUSTODY_SPAN_RETENTION_UNVERIFIABLE',
  AUTHORITY_FAMILY_UNKNOWN: 'CUSTODY_AUTHORITY_FAMILY_UNKNOWN',
  LICENSE_STATE_INVALID: 'CUSTODY_LICENSE_STATE_INVALID',
  SENSITIVITY_STATE_INVALID: 'CUSTODY_SENSITIVITY_STATE_INVALID',
  WITHDRAWAL_CONSEQUENCE_UNSTATED: 'CUSTODY_WITHDRAWAL_CONSEQUENCE_UNSTATED',
  REPLAYABILITY_UNDECIDABLE: 'CUSTODY_REPLAYABILITY_UNDECIDABLE',
});

/** The single mode the owner decided. Any other value is refused, not defaulted. */
export const CUSTODY_MODE = 'hash_pinned_with_cited_span_retention';

/**
 * Missing and unknown are different states and are never merged.
 *
 * "I looked and it is gone" supports a conclusion. "I could not look" does not. Collapsing
 * the second into the first manufactures evidence of absence.
 */
export const PRESENCE = Object.freeze({
  PRESENT: 'present',
  UNKNOWN: 'unknown',
  ABSENCE_CONFIRMED: 'absence_confirmed',
});

export const LICENSE_STATES = Object.freeze(['cleared', 'restricted', 'unknown']);
export const SENSITIVITY_STATES = Object.freeze(['public', 'internal', 'restricted', 'unknown']);

export const REQUIRED_INVENTORY_FIELDS = Object.freeze([
  'source_id', 'source_revision_ref', 'surface_id',
  'observed_at', 'byte_hash', 'byte_length', 'format',
  'authority_family', 'license_state', 'sensitivity_state',
  'custody_mode', 'presence_state',
]);

const SHA256_HEX = /^[0-9a-f]{64}$/;
const FAMILY_KEYS = AUTHORITY_FAMILIES.map((f) => f.key ?? f);

export function assertSingleCustodyMode(mode) {
  if (mode !== CUSTODY_MODE) {
    throw new ContractError(CODES.CUSTODY_MODE_INVALID,
      `custody_mode must be exactly "${CUSTODY_MODE}"; per-source modes would give one snapshot several replay guarantees`,
      { given: mode ?? null });
  }
  return true;
}

/** Validates one inventory record. Nothing defaults, including the states. */
export function validateInventoryRecord(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new ContractError(CODES.INVENTORY_FIELD_MISSING, 'inventory record is not an object');
  }
  for (const f of REQUIRED_INVENTORY_FIELDS) {
    if (!Object.hasOwn(record, f)) {
      throw new ContractError(CODES.INVENTORY_FIELD_MISSING, `inventory field "${f}" is missing`, { field: f, source_id: record.source_id });
    }
  }
  assertSingleCustodyMode(record.custody_mode);
  if (!SHA256_HEX.test(record.byte_hash)) {
    throw new ContractError(CODES.HASH_INVALID, 'byte_hash must be a lowercase sha256 hex digest');
  }
  if (!Number.isSafeInteger(record.byte_length) || record.byte_length < 0) {
    throw new ContractError(CODES.LENGTH_INVALID, 'byte_length must be a non-negative safe integer');
  }
  if (!inspectInstant(record.observed_at).valid) {
    throw new ContractError(CODES.INSTANT_INVALID, 'observed_at must be a canonical instant with three fractional digits');
  }
  if (!Object.values(PRESENCE).includes(record.presence_state)) {
    throw new ContractError(CODES.PRESENCE_INVALID, `presence_state must be one of ${Object.values(PRESENCE).join(', ')}`);
  }
  if (!FAMILY_KEYS.includes(record.authority_family)) {
    throw new ContractError(CODES.AUTHORITY_FAMILY_UNKNOWN,
      'authority_family must be one of the eight registered families', { given: record.authority_family });
  }
  if (!LICENSE_STATES.includes(record.license_state)) {
    throw new ContractError(CODES.LICENSE_STATE_INVALID, `license_state must be one of ${LICENSE_STATES.join(', ')}`);
  }
  if (!SENSITIVITY_STATES.includes(record.sensitivity_state)) {
    throw new ContractError(CODES.SENSITIVITY_STATE_INVALID, `sensitivity_state must be one of ${SENSITIVITY_STATES.join(', ')}`);
  }
  const refState = classifyRef(record.source_revision_ref, { bytesAvailable: record.presence_state === PRESENCE.PRESENT });
  if (refState === RESOLUTION.MALFORMED || refState === RESOLUTION.FLOATING) {
    throw new ContractError(CODES.INVENTORY_FIELD_MISSING,
      'source_revision_ref must name an exact revision', { ref_state: refState });
  }
  return { valid: true, source_id: record.source_id, presence_state: record.presence_state, ref_state: refState };
}

/**
 * Validates a cited span and its retained copy.
 *
 * A span is byte offsets into the pinned revision, so it is meaningless without the pin it
 * was taken against — hence the length check. Retention without its own hash cannot be
 * verified later, which would make the retained copy exactly as untrustworthy as the
 * original it was meant to outlive.
 */
export function validateCitedSpan(span, { pinnedByteLength } = {}) {
  if (span === null || typeof span !== 'object') {
    throw new ContractError(CODES.SPAN_INVALID, 'span is not an object');
  }
  const { byte_start: s, byte_end: e } = span;
  if (!Number.isSafeInteger(s) || !Number.isSafeInteger(e)) {
    throw new ContractError(CODES.SPAN_INVALID, 'span offsets must be safe integers');
  }
  if (s < 0 || e <= s) {
    throw new ContractError(CODES.SPAN_INVALID, 'span must be non-empty and start at or after zero', { byte_start: s, byte_end: e });
  }
  if (Number.isSafeInteger(pinnedByteLength) && e > pinnedByteLength) {
    throw new ContractError(CODES.SPAN_INVALID,
      'span extends past the pinned revision length, so it does not describe the bytes that were pinned',
      { byte_end: e, pinnedByteLength });
  }
  if (!SHA256_HEX.test(span.span_hash ?? '')) {
    throw new ContractError(CODES.SPAN_RETENTION_UNVERIFIABLE,
      'a retained span needs its own hash, otherwise the retained copy cannot be verified later');
  }
  if (typeof span.retention_ref !== 'string' || !span.retention_ref) {
    throw new ContractError(CODES.SPAN_NOT_RETAINED,
      'the cited span declares no retention ref; retention failure is fail-closed, not best effort');
  }
  return { valid: true, byte_start: s, byte_end: e, byte_length: e - s };
}

/**
 * Retention failure is fail-closed.
 *
 * A citation whose span was not retained must not be usable as though it were, because the
 * whole point of retaining the span is that the original may not answer later.
 */
export function assertSpanRetained(span, { retentionStore } = {}) {
  validateCitedSpan(span, {});
  if (!retentionStore || typeof retentionStore.get !== 'function') {
    throw new ContractError(CODES.SPAN_RETENTION_UNVERIFIABLE,
      'retention cannot be confirmed without the retention store; unconfirmed retention is treated as absent');
  }
  const held = retentionStore.get(span.retention_ref);
  if (!held) {
    throw new ContractError(CODES.SPAN_NOT_RETAINED, 'the retention ref resolves to nothing', { retention_ref: span.retention_ref });
  }
  if (held.span_hash !== span.span_hash) {
    throw new ContractError(CODES.SPAN_NOT_RETAINED,
      'the retained bytes do not hash to the value recorded at citation time', { retention_ref: span.retention_ref });
  }
  return true;
}

/** Compares a pinned hash against what the surface holds now. */
export function classifyIntegrity({ pinnedHash, observedHash, readable, absenceConfirmed }) {
  if (absenceConfirmed === true) return { state: 'absence_confirmed', intact: false };
  if (readable !== true) return { state: 'unknown', intact: false };
  if (!SHA256_HEX.test(observedHash ?? '')) {
    throw new ContractError(CODES.HASH_INVALID, 'observedHash must be a sha256 hex digest when the source is readable');
  }
  if (observedHash === pinnedHash) return { state: 'intact', intact: true };
  return { state: 'content_changed', intact: false };
}

/**
 * States what a change to the original does and does not cost.
 *
 * The original changing is not a snapshot defect: the snapshot recorded what was true when
 * it was taken. What matters is whether the cited basis still resolves. So a changed or
 * vanished original degrades replay from full to cited-evidence-only, and only an
 * unretained citation makes a finding unreplayable — which is reported loudly, never
 * softened into "unknown".
 */
export function evaluateReplayability({ integrity, citedSpans, retentionStore }) {
  if (!integrity || typeof integrity.state !== 'string') {
    throw new ContractError(CODES.REPLAYABILITY_UNDECIDABLE, 'integrity state is required');
  }
  const spans = citedSpans ?? [];
  const unretained = [];
  for (const span of spans) {
    try { assertSpanRetained(span, { retentionStore }); } catch (e) { unretained.push({ retention_ref: span.retention_ref ?? null, code: e.code }); }
  }
  if (unretained.length) {
    return {
      state: 'not_replayable',
      reason: 'a cited span is not retained',
      unretained,
      // Named explicitly so a caller cannot quietly treat this as a soft unknown.
      loud: true,
    };
  }
  if (integrity.intact === true) return { state: 'fully_replayable', loud: false };
  return {
    state: 'cited_evidence_replayable',
    reason: `the original is ${integrity.state}, and every cited span is retained`,
    rereading_outside_the_citation_requires_the_original: true,
    loud: false,
  };
}

/**
 * Decides whether a source may be used on the authoritative path.
 *
 * Every reason is collected rather than returning on the first failure, because a caller
 * that fixes one blocker and retries should not have to discover the rest one round trip at
 * a time. Unknown is a blocker in both the license and sensitivity axes: for this material
 * "we have not established it" is not a permissive default.
 */
export function evaluateEligibility({ record, applicability, integrity, citedSpans, retentionStore, reviewState }) {
  validateInventoryRecord(record);
  const reasons = [];

  if (record.license_state === 'unknown') reasons.push('license_unknown');
  if (record.license_state === 'restricted') reasons.push('license_restricted');
  if (record.sensitivity_state === 'unknown') reasons.push('sensitivity_unknown');
  if (applicability === APPLICABILITY.UNKNOWN) reasons.push('applicability_unknown');
  if (applicability === APPLICABILITY.NO) reasons.push('not_applicable');
  if (record.presence_state === PRESENCE.UNKNOWN) reasons.push('presence_unknown');

  const replay = evaluateReplayability({ integrity, citedSpans, retentionStore });
  if (replay.state === 'not_replayable') reasons.push('cited_span_not_retained');
  if (record.authority_family === 'llm_proposal' && reviewState !== 'human_source_bound_review_passed') {
    reasons.push('llm_proposal_without_source_bound_review');
  }
  return {
    eligible: reasons.length === 0,
    reasons,
    replayability: replay.state,
    // A source can be ineligible for authoritative use and still be citable as an
    // observation, so the two are reported separately rather than collapsed.
    observation_still_recordable: true,
  };
}

/**
 * Plans withdrawal of retained spans when a licence or sensitivity change creates a
 * destruction obligation.
 *
 * Withdrawal makes prior findings unreplayable. That consequence has to be stated in the
 * plan, because a withdrawal executed quietly leaves conclusions standing on evidence that
 * no longer exists, and nothing in the record would say so.
 *
 * Who may order a withdrawal is an owner decision this lane does not take.
 */
export function planRetentionWithdrawal({ retainedSpans, reason, affectedFindingIds, consequenceStated }) {
  if (typeof reason !== 'string' || !reason) {
    throw new ContractError(CODES.WITHDRAWAL_CONSEQUENCE_UNSTATED, 'a withdrawal must name its reason');
  }
  if (consequenceStated !== true) {
    throw new ContractError(CODES.WITHDRAWAL_CONSEQUENCE_UNSTATED,
      'a withdrawal plan must state that the affected findings become unreplayable before it can be acted on');
  }
  const spans = retainedSpans ?? [];
  return {
    action: 'withdraw_retained_spans',
    reason,
    withdraw_count: spans.length,
    withdraw_refs: spans.map((s) => s.retention_ref).filter(Boolean).sort(),
    findings_becoming_unreplayable: [...(affectedFindingIds ?? [])].sort(),
    authority_required: 'owner_decision_pending',
    executed: false,
  };
}

export const OPEN_OWNER_DECISIONS_FOR_THIS_LANE = Object.freeze([
  'which_source_surfaces_are_in_scope_for_inventory',
  'retention_withdrawal_authority',
  'span_retention_store_location_and_owner',
]);
