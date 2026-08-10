// Lane 1A — Project State Snapshot envelope, state axes, and the Finding schema.
//
// The engine's whole job reduces to one comparison: what the contract and rules require
// (expected) against what the project artifacts show (observed). A snapshot is the frozen
// record of one such comparison, and a Finding is one place they disagreed.
//
// Three rules carry the weight here.
//
// 1. An element belongs to exactly one axis. Expected and observed are different kinds of
//    claim, and an element that is both loses the ability to disagree with itself.
// 2. "Missing" requires confirmed absence. If the observation could not be made, the gap is
//    unknown, and it stays unknown. This is the single rule most likely to be eroded by
//    convenience, because unknown gaps are less satisfying to report.
// 3. A snapshot is not edited. A correction is a new snapshot, because the old one recorded
//    what was believed at the time and that record is the point.

import { inspectInstant } from './canonical.mjs';
import { FINGERPRINT_INPUT_KEYS } from './contract_config.mjs';
import { deterministicReplayFingerprint } from './fingerprint.mjs';
import { assertEvidenceCeiling, assertCanonAxisAbsentFromSnapshot, SNAPSHOT_CLAIM_CEILING_AXIS } from './ceilings.mjs';
import { assertIsMintedIdentifier } from './minting.mjs';
import { classifyRef, RESOLUTION } from './identity.mjs';
import { PRESENCE } from './custody.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  ENVELOPE_FIELD_MISSING: 'SNAPSHOT_ENVELOPE_FIELD_MISSING',
  SNAPSHOT_IMMUTABLE: 'SNAPSHOT_IMMUTABLE',
  FINGERPRINT_MISMATCH: 'SNAPSHOT_FINGERPRINT_MISMATCH',
  OBSERVATIONAL_LAYER_LEAKED: 'SNAPSHOT_OBSERVATIONAL_LAYER_LEAKED',
  AXIS_INVALID: 'STATE_AXIS_INVALID',
  AXIS_AMBIGUOUS: 'STATE_AXIS_AMBIGUOUS',
  ELEMENT_FIELD_MISSING: 'STATE_ELEMENT_FIELD_MISSING',
  GAP_TYPE_INVALID: 'GAP_TYPE_INVALID',
  MISSING_WITHOUT_CONFIRMED_ABSENCE: 'GAP_MISSING_WITHOUT_CONFIRMED_ABSENCE',
  FINDING_FIELD_MISSING: 'FINDING_FIELD_MISSING',
  FINDING_CITES_NOTHING: 'FINDING_CITES_NOTHING',
  INSTANT_INVALID: 'SNAPSHOT_INSTANT_INVALID',
});

export const AXIS = Object.freeze({ EXPECTED: 'expected', OBSERVED: 'observed' });

export const GAP_TYPE = Object.freeze({
  SATISFIED: 'satisfied',
  MISSING: 'gap_missing',
  UNKNOWN: 'gap_unknown',
  CONFLICT: 'gap_conflict',
  UNEXPECTED: 'unexpected_observed',
});

export const REQUIRED_ENVELOPE_FIELDS = Object.freeze([
  'snapshot_id', 'project_binding_ref', 'accepted_context_generation',
  'snapshot_schema_version', 'taken_at',
  'deterministic_replay_fingerprint',
  'canonical_accepted_input_set', 'replay_relevant_provenance', 'run_observational_provenance',
  'expected_state_elements', 'observed_state_elements', 'findings',
  'claim_ceiling', 'execution_mode', 'custody_summary',
]);

export const REQUIRED_EXPECTED_ELEMENT_FIELDS = Object.freeze([
  'element_id', 'axis', 'requirement_ref', 'authority_family', 'applicability', 'valid_at', 'known_at',
]);

export const REQUIRED_OBSERVED_ELEMENT_FIELDS = Object.freeze([
  'element_id', 'axis', 'artifact_revision_ref', 'presence_state', 'valid_at', 'known_at',
]);

export const REQUIRED_FINDING_FIELDS = Object.freeze([
  'finding_id', 'snapshot_id', 'gap_type', 'expected_element_id',
  'evidence_claim_ceiling', 'authority_family', 'known_at', 'disposition_state',
]);

const assertInstant = (value, field) => {
  if (!inspectInstant(value).valid) {
    throw new ContractError(CODES.INSTANT_INVALID, `${field} must be a canonical instant with three fractional digits`, { field, value });
  }
};

/**
 * Validates one state element and returns which axis it belongs to.
 *
 * An element carrying both a requirement and an artifact observation is refused rather than
 * assigned a winner. The comparison downstream is between two independent claims; if one
 * object can be both, it can never disagree with itself and every gap silently disappears.
 */
export function validateStateElement(element) {
  if (element === null || typeof element !== 'object' || Array.isArray(element)) {
    throw new ContractError(CODES.ELEMENT_FIELD_MISSING, 'state element is not an object');
  }
  if (!Object.values(AXIS).includes(element.axis)) {
    throw new ContractError(CODES.AXIS_INVALID, `axis must be "${AXIS.EXPECTED}" or "${AXIS.OBSERVED}"`, { given: element.axis ?? null });
  }
  const hasRequirement = Object.hasOwn(element, 'requirement_ref');
  const hasArtifact = Object.hasOwn(element, 'artifact_revision_ref');
  if (hasRequirement && hasArtifact) {
    throw new ContractError(CODES.AXIS_AMBIGUOUS,
      'an element cannot carry both a requirement and an artifact observation; expected and observed are different kinds of claim',
      { element_id: element.element_id });
  }
  const required = element.axis === AXIS.EXPECTED ? REQUIRED_EXPECTED_ELEMENT_FIELDS : REQUIRED_OBSERVED_ELEMENT_FIELDS;
  for (const f of required) {
    if (!Object.hasOwn(element, f)) {
      throw new ContractError(CODES.ELEMENT_FIELD_MISSING, `${element.axis} element field "${f}" is missing`, { field: f, element_id: element.element_id });
    }
  }
  assertInstant(element.valid_at, 'valid_at');
  assertInstant(element.known_at, 'known_at');
  if (element.known_at < element.valid_at) {
    throw new ContractError(CODES.INSTANT_INVALID,
      'known_at cannot precede valid_at; a fact cannot be known before it holds',
      { element_id: element.element_id });
  }
  const refField = element.axis === AXIS.EXPECTED ? 'requirement_ref' : 'artifact_revision_ref';
  const refState = classifyRef(element[refField], { bytesAvailable: element.presence_state === PRESENCE.PRESENT });
  if (refState === RESOLUTION.MALFORMED || refState === RESOLUTION.FLOATING) {
    throw new ContractError(CODES.ELEMENT_FIELD_MISSING, `${refField} must name an exact revision`, { ref_state: refState });
  }
  if (element.axis === AXIS.OBSERVED && !Object.values(PRESENCE).includes(element.presence_state)) {
    throw new ContractError(CODES.ELEMENT_FIELD_MISSING, 'observed element must declare a presence_state');
  }
  return { valid: true, axis: element.axis, element_id: element.element_id };
}

/**
 * Compares one expected element against its observed counterpart.
 *
 * The important branch is the third one. A missing gap is only reachable from positively
 * confirmed absence; an observation that could not be made yields an unknown gap and is
 * never promoted. Reporting "the document does not exist" when the truth is "the share was
 * unreachable" is the failure this function exists to prevent.
 */
export function compareStates({ expected, observed, conflicts }) {
  validateStateElement(expected);
  if (expected.axis !== AXIS.EXPECTED) {
    throw new ContractError(CODES.AXIS_INVALID, 'the first argument must be an expected element');
  }
  if (observed === undefined || observed === null) {
    // Nothing was even looked for. That is unknown, not missing.
    return { gap_type: GAP_TYPE.UNKNOWN, reason: 'no observation was attempted for this requirement' };
  }
  validateStateElement(observed);
  if (observed.axis !== AXIS.OBSERVED) {
    throw new ContractError(CODES.AXIS_INVALID, 'the second argument must be an observed element');
  }
  if (observed.presence_state === PRESENCE.UNKNOWN) {
    return { gap_type: GAP_TYPE.UNKNOWN, reason: 'the observation could not be made' };
  }
  if (observed.presence_state === PRESENCE.ABSENCE_CONFIRMED) {
    return { gap_type: GAP_TYPE.MISSING, reason: 'absence was positively confirmed' };
  }
  if (conflicts === true) {
    return { gap_type: GAP_TYPE.CONFLICT, reason: 'the requirement and the artifact disagree' };
  }
  return { gap_type: GAP_TYPE.SATISFIED, reason: 'the artifact meets the requirement' };
}

/** An observed element with no expected counterpart is for review, not a defect. */
export function classifyUnmatchedObservation(observed) {
  validateStateElement(observed);
  return {
    gap_type: GAP_TYPE.UNEXPECTED,
    reason: 'observed with no expected counterpart',
    // Deliberately not a defect: the requirement set may simply be incomplete, and deciding
    // which it is belongs to a human.
    is_defect: false,
  };
}

/** Guards the rule directly, for callers that assemble a gap type themselves. */
export function assertMissingIsConfirmed(gapType, presenceState) {
  if (gapType === GAP_TYPE.MISSING && presenceState !== PRESENCE.ABSENCE_CONFIRMED) {
    throw new ContractError(CODES.MISSING_WITHOUT_CONFIRMED_ABSENCE,
      'a missing gap requires positively confirmed absence; an unmade observation is unknown',
      { presence_state: presenceState ?? null });
  }
  return true;
}

/**
 * Validates a Finding.
 *
 * A finding must rest on something citable. For a conflict or a satisfied comparison that
 * means a retained evidence span; for a missing or unknown gap the citable thing is the
 * requirement plus the record of what the observation attempt returned. What is refused is
 * a finding that cites nothing at all, because such a finding is an assertion with no way
 * to check it.
 */
export function validateFinding(finding) {
  if (finding === null || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new ContractError(CODES.FINDING_FIELD_MISSING, 'finding is not an object');
  }
  for (const f of REQUIRED_FINDING_FIELDS) {
    if (!Object.hasOwn(finding, f)) {
      throw new ContractError(CODES.FINDING_FIELD_MISSING, `finding field "${f}" is missing`, { field: f, finding_id: finding.finding_id });
    }
  }
  assertIsMintedIdentifier(finding.finding_id, 'finding_id');
  assertIsMintedIdentifier(finding.snapshot_id, 'snapshot_id');
  if (!Object.values(GAP_TYPE).includes(finding.gap_type)) {
    throw new ContractError(CODES.GAP_TYPE_INVALID, `gap_type must be one of ${Object.values(GAP_TYPE).join(', ')}`, { given: finding.gap_type });
  }
  assertEvidenceCeiling(finding.evidence_claim_ceiling);
  assertInstant(finding.known_at, 'known_at');
  assertMissingIsConfirmed(finding.gap_type, finding.observed_presence_state);

  const spans = finding.cited_spans ?? [];
  const hasSpans = Array.isArray(spans) && spans.length > 0;
  const hasAbsenceRecord = typeof finding.observation_attempt_ref === 'string' && finding.observation_attempt_ref.length > 0;
  if (!hasSpans && !hasAbsenceRecord) {
    throw new ContractError(CODES.FINDING_CITES_NOTHING,
      'a finding must cite a retained evidence span or the record of the observation attempt; otherwise it cannot be checked',
      { finding_id: finding.finding_id, gap_type: finding.gap_type });
  }
  return { valid: true, finding_id: finding.finding_id, gap_type: finding.gap_type };
}

/**
 * Validates the snapshot envelope and confirms the fingerprint was computed over the
 * declared projection.
 *
 * The fingerprint is recomputed rather than trusted. A stored fingerprint that nobody
 * recomputes is a comment, and the whole replay guarantee rests on it being a check.
 */
export function validateSnapshotEnvelope(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new ContractError(CODES.ENVELOPE_FIELD_MISSING, 'snapshot is not an object');
  }
  for (const f of REQUIRED_ENVELOPE_FIELDS) {
    if (!Object.hasOwn(snapshot, f)) {
      throw new ContractError(CODES.ENVELOPE_FIELD_MISSING, `envelope field "${f}" is missing`, { field: f, snapshot_id: snapshot.snapshot_id });
    }
  }
  assertIsMintedIdentifier(snapshot.snapshot_id, 'snapshot_id');
  assertInstant(snapshot.taken_at, 'taken_at');
  if (!Number.isSafeInteger(snapshot.accepted_context_generation) || snapshot.accepted_context_generation < 0) {
    throw new ContractError(CODES.ENVELOPE_FIELD_MISSING, 'accepted_context_generation must be a non-negative safe integer');
  }
  // D-P10-01: the preserved claim_ceiling field carries evidence axis values, and the canon
  // axis must not appear here at all.
  assertEvidenceCeiling(snapshot.claim_ceiling);
  assertCanonAxisAbsentFromSnapshot(snapshot);

  for (const e of snapshot.expected_state_elements) {
    validateStateElement(e);
    if (e.axis !== AXIS.EXPECTED) throw new ContractError(CODES.AXIS_INVALID, 'expected_state_elements contains a non-expected element');
  }
  for (const e of snapshot.observed_state_elements) {
    validateStateElement(e);
    if (e.axis !== AXIS.OBSERVED) throw new ContractError(CODES.AXIS_INVALID, 'observed_state_elements contains a non-observed element');
  }
  for (const f of snapshot.findings) {
    validateFinding(f);
    if (f.snapshot_id !== snapshot.snapshot_id) {
      throw new ContractError(CODES.FINDING_FIELD_MISSING, 'a finding names a different snapshot', { finding_id: f.finding_id });
    }
  }

  const recomputed = deterministicReplayFingerprint(Object.fromEntries(
    FINGERPRINT_INPUT_KEYS.map((k) => [k, snapshot[k]]),
  ));
  if (recomputed !== snapshot.deterministic_replay_fingerprint) {
    throw new ContractError(CODES.FINGERPRINT_MISMATCH,
      'the stored fingerprint does not match the declared projection of this envelope',
      { stored: snapshot.deterministic_replay_fingerprint, recomputed });
  }
  return {
    valid: true,
    snapshot_id: snapshot.snapshot_id,
    fingerprint: recomputed,
    claim_ceiling_axis: SNAPSHOT_CLAIM_CEILING_AXIS,
    finding_count: snapshot.findings.length,
  };
}

/**
 * A snapshot is never edited in place.
 *
 * A correction produces a new snapshot that supersedes the old one. Editing would destroy
 * the record of what was believed when a decision was made, which is most of what a
 * snapshot is for.
 */
export function assertSnapshotImmutable(intent) {
  if (intent === 'edit' || intent === 'patch' || intent === 'update_in_place') {
    throw new ContractError(CODES.SNAPSHOT_IMMUTABLE,
      'a snapshot cannot be edited; a correction is a new snapshot that supersedes this one',
      { intent });
  }
  return true;
}

/** The two provenance layers must stay separated in the envelope, not merged for tidiness. */
export function assertProvenanceLayersSeparate(snapshot) {
  const replay = snapshot.replay_relevant_provenance ?? {};
  const observational = snapshot.run_observational_provenance ?? {};
  const overlap = Object.keys(observational).filter((k) => Object.hasOwn(replay, k));
  if (overlap.length) {
    throw new ContractError(CODES.OBSERVATIONAL_LAYER_LEAKED,
      'a run observational field also appears in the replay relevant layer, which would make every replay produce a new fingerprint',
      { overlap });
  }
  return true;
}
