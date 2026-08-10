// PC-05 the two claim ceiling axes.
//
// These measure different things and share only a similar name. The canon axis says how
// far a piece of knowledge has been promoted; the evidence axis says how well a claim
// about project state is supported. Converting between them would let an evidence
// judgement quietly become a promotion, so no conversion exists.

import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  UNKNOWN_CANON_VALUE: 'CEILING_UNKNOWN_CANON_VALUE',
  UNKNOWN_EVIDENCE_VALUE: 'CEILING_UNKNOWN_EVIDENCE_VALUE',
  CROSS_AXIS_CONVERSION: 'CEILING_CROSS_AXIS_CONVERSION',
  BARE_FIELD_NAME: 'CEILING_BARE_FIELD_NAME',
});

// Bound by reference to the execution contract's enum. New values are not minted here.
export const CANON_CLAIM_CEILING = Object.freeze([
  'observed', 'source_supported', 'validated_private', 'canon_candidate', 'canon_entry', 'rejected_or_blocked',
]);

// Engine-internal axis. Approved as D-P10-05.
export const EVIDENCE_CLAIM_CEILING = Object.freeze([
  'unknown',            // observation, authority, time, or grounding is insufficient to judge
  'observed_artifact',  // the artifact and its revision are confirmed to exist, nothing more
  'source_referenced',  // an exact source revision is cited but sufficiency is unjudged
  'source_sufficient',  // applicable sources deterministically cover the claim's scope
  'human_accepted',     // holds inside a P5-accepted context generation
  'contradicted',       // conflicting grounding exists alongside
  'not_applicable',     // applicability resolved to "out of scope"
]);

export const isCanonCeiling = (v) => CANON_CLAIM_CEILING.includes(v);
export const isEvidenceCeiling = (v) => EVIDENCE_CLAIM_CEILING.includes(v);

export function assertCanonCeiling(v) {
  if (!isCanonCeiling(v)) {
    throw new ContractError(CODES.UNKNOWN_CANON_VALUE, `"${v}" is not a canon claim ceiling value`, { allowed: CANON_CLAIM_CEILING });
  }
  return v;
}

export function assertEvidenceCeiling(v) {
  if (!isEvidenceCeiling(v)) {
    throw new ContractError(CODES.UNKNOWN_EVIDENCE_VALUE, `"${v}" is not an evidence claim ceiling value`, { allowed: EVIDENCE_CLAIM_CEILING });
  }
  return v;
}

/** There is deliberately no mapping. Calling this is the bug it reports. */
export function convertBetweenAxes() {
  throw new ContractError(CODES.CROSS_AXIS_CONVERSION,
    'the evidence axis and the canon axis never convert into one another; promotion requires its own gate');
}

// ---------------------------------------------------------------- D-P10-01 (approved)

// The V1.2 snapshot already carries a short field literally named claim_ceiling. Renaming
// it would break a preserved contract that an earlier review restored after a drift
// finding, so the name stays and the meaning is fixed instead: it carries evidence axis
// values, and the canon axis never appears inside a snapshot.
export const SNAPSHOT_CLAIM_CEILING_AXIS = 'evidence';

export function readSnapshotClaimCeiling(snapshot) {
  const v = snapshot?.claim_ceiling;
  return assertEvidenceCeiling(v);
}

export function assertCanonAxisAbsentFromSnapshot(snapshot) {
  if (snapshot && Object.hasOwn(snapshot, 'canon_claim_ceiling')) {
    throw new ContractError(CODES.CROSS_AXIS_CONVERSION, 'the canon axis must not appear inside a snapshot');
  }
  return true;
}

/**
 * New contracts spell the axis out. A bare "claim_ceiling" is only legitimate on the
 * preserved V1.2 snapshot field, where its meaning is pinned above.
 */
export function assertExplicitFieldName(fieldName, { allowLegacySnapshotField = false } = {}) {
  if (fieldName === 'claim_ceiling' && !allowLegacySnapshotField) {
    throw new ContractError(CODES.BARE_FIELD_NAME,
      'name the axis explicitly: evidence_claim_ceiling or canon_claim_ceiling');
  }
  return fieldName;
}
