import { ContractError } from '../../../core/validators/errors.mjs';
import {
  calibrationMeasurementValiditySha256,
  canonicalizeCalibrationMeasurementValidity,
} from '../shared/calibration_measurement_validity_canonical_digest.mjs';
import { snapshotCalibrationMeasurementValidityPlainData } from '../shared/calibration_measurement_validity_safe_snapshot.mjs';
import { CMV_OBSERVATION_SCHEMA_VERSION } from '../observation/calibration_measurement_validity_observation.mjs';
import { validateConsumedCmvSourceClassification } from '../source/calibration_measurement_validity_source_classification.mjs';

export const CMV_GUIDANCE_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.guidance.v1';
export const CMV_GUIDANCE_CODES = Object.freeze({ INVALID_INPUT: 'CMV_GUIDANCE_INVALID_INPUT' });

const EXPECTED_CANDIDATES = Object.freeze([
  ['instrument_identity', 'cmv-instrument_identity'],
  ['calibration_status', 'cmv-calibration_status'],
  ['measurement_suitability', 'cmv-measurement_suitability'],
  ['traceability', 'cmv-traceability'],
  ['environment', 'cmv-environment'],
  ['exception', 'cmv-exception'],
]);
const ASSESSMENT_BASE_KEYS = Object.freeze([
  'claim_ceiling', 'determinations', 'domain_engine_id', 'evaluated_at', 'project_binding_ref',
  'result_impact', 'result_status', 'schema_version',
]);
const ASSESSMENT_PROFILE_KEYS = Object.freeze([...ASSESSMENT_BASE_KEYS, 'profile_evaluation'].sort());
const REFERENCE_KEYS = Object.freeze(['content_id', 'entity_id', 'revision_id']);
const EVALUATED_AT_KEYS = Object.freeze(['known_at', 'tested_at']);
const DETERMINATION_KEYS = Object.freeze(['criterion_id', 'reason_code', 'source_refs', 'status']);
const PROFILE_EVALUATION_KEYS = Object.freeze(['claim_ceiling', 'hold_codes', 'requirements', 'schema_version', 'status']);
const BASE_CRITERIA = Object.freeze([
  'CMV-INSTRUMENT-IDENTITY-01', 'CMV-CALIBRATION-STATUS-01', 'CMV-RANGE-01', 'CMV-ACCURACY-01',
  'CMV-UNCERTAINTY-01', 'CMV-TRACEABILITY-01', 'CMV-ENVIRONMENT-01', 'CMV-EXCEPTION-01',
  'CMV-RESULT-IMPACT-01',
]);
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256_REFERENCE = /^sha256:[a-f0-9]{64}$/u;

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function validCanonicalInstant(value) {
  if (typeof value !== 'string' || !CANONICAL_INSTANT.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function validateGuidanceAssessment(assessment) {
  const expectedKeys = Object.hasOwn(assessment ?? {}, 'profile_evaluation')
    ? ASSESSMENT_PROFILE_KEYS : ASSESSMENT_BASE_KEYS;
  if (!hasExactKeys(assessment, expectedKeys)
      || assessment.schema_version !== 'soulforge.calibration_measurement_validity.assessment.v0'
      || assessment.domain_engine_id !== 'calibration_measurement_validity'
      || !['observed', 'source_supported'].includes(assessment.claim_ceiling)
      || !['valid', 'unknown', 'held', 'invalid'].includes(assessment.result_status)
      || !['none', 'hold', 'invalidate'].includes(assessment.result_impact)
      || !hasExactKeys(assessment.project_binding_ref, REFERENCE_KEYS)
      || typeof assessment.project_binding_ref.entity_id !== 'string' || assessment.project_binding_ref.entity_id.length === 0
      || typeof assessment.project_binding_ref.revision_id !== 'string' || assessment.project_binding_ref.revision_id.length === 0
      || !SHA256_REFERENCE.test(assessment.project_binding_ref.content_id)
      || !hasExactKeys(assessment.evaluated_at, EVALUATED_AT_KEYS)
      || !validCanonicalInstant(assessment.evaluated_at.tested_at)
      || !validCanonicalInstant(assessment.evaluated_at.known_at)
      || new Date(assessment.evaluated_at.known_at).valueOf() < new Date(assessment.evaluated_at.tested_at).valueOf()
      || !Array.isArray(assessment.determinations)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance assessment has an invalid CMV output shape');
  }
  const expectedCriteria = [...BASE_CRITERIA];
  if (assessment.profile_evaluation?.status === 'hold') expectedCriteria.push('CMV-SOURCE-BOUND-PROFILE-01');
  if (assessment.determinations.length !== expectedCriteria.length) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance assessment determination count is invalid');
  }
  for (let index = 0; index < expectedCriteria.length; index += 1) {
    const determination = assessment.determinations[index];
    if (!hasExactKeys(determination, DETERMINATION_KEYS)
        || determination.criterion_id !== expectedCriteria[index]
        || typeof determination.reason_code !== 'string' || determination.reason_code.length === 0
        || !['valid', 'missing', 'unknown', 'expired', 'out_of_range', 'not_suitable', 'exception_held', 'not_applicable', 'held', 'invalid'].includes(determination.status)
        || !Array.isArray(determination.source_refs) || determination.source_refs.length === 0
        || determination.source_refs.some((sourceRef) => typeof sourceRef !== 'string' || sourceRef.length === 0)) {
      throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance assessment determination has an invalid CMV output shape');
    }
  }
  if ((assessment.result_status === 'valid') !== (assessment.result_impact === 'none')
      || (assessment.result_status === 'invalid') !== (assessment.result_impact === 'invalidate')
      || (['unknown', 'held'].includes(assessment.result_status)) !== (assessment.result_impact === 'hold')) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance assessment status and impact are inconsistent');
  }
    if (Object.hasOwn(assessment, 'profile_evaluation')) {
    const profile = assessment.profile_evaluation;
    if (!hasExactKeys(profile, PROFILE_EVALUATION_KEYS)
        || profile.schema_version !== 'soulforge.calibration_measurement_validity.source_bound_profile.v1'
        || !['supported', 'hold'].includes(profile.status)
        || !['observed', 'source_supported'].includes(profile.claim_ceiling)
        || !Array.isArray(profile.requirements) || !Array.isArray(profile.hold_codes)) {
      throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance assessment Profile summary has an invalid shape');
    }
    for (const req of profile.requirements) {
      if (!req || typeof req !== 'object' || Array.isArray(req)
          || typeof req.requirement_id !== 'string'
          || !['supported', 'hold'].includes(req.status)
          || !Array.isArray(req.required_source_ids) || req.required_source_ids.length === 0
          || req.required_classification !== 'official_public_direct'
          || typeof req.profile_id !== 'string') {
        throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance assessment profile requirement has an invalid shape');
      }
    }
  }
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function cardFor(determination) {
  if (determination.status === 'expired') {
    return { action_code: 'obtain_current_calibration_evidence', reason_code: determination.reason_code, authority_required: true };
  }
  if (determination.status === 'exception_held') {
    return { action_code: 'request_authorized_exception_disposition', reason_code: determination.reason_code, authority_required: true };
  }
  if (determination.status === 'out_of_range' || determination.status === 'not_suitable') {
    return { action_code: 'hold_measurement_result_for_suitability_review', reason_code: determination.reason_code, authority_required: true };
  }
  if (determination.status === 'missing' || determination.status === 'unknown') {
    return { action_code: 'supply_typed_source_bound_evidence', reason_code: determination.reason_code, authority_required: false };
  }
  return null;
}

function deriveGuidanceCards(determinations) {
  const cards = determinations
    .map(cardFor)
    .filter(Boolean)
    .map((card, index) => ({ card_id: `cmv-guidance-${String(index + 1).padStart(2, '0')}`, ...card }));
  if (cards.length === 0) {
    cards.push({
      card_id: 'cmv-guidance-01',
      action_code: 'retain_typed_evidence_for_auditability',
      reason_code: 'all_current_evidence_valid',
      authority_required: false,
    });
  }
  return cards;
}

function validateObservationEnvelope(observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)
      || observation.schema_version !== CMV_OBSERVATION_SCHEMA_VERSION
      || !Array.isArray(observation.candidates)
      || !observation.effects || !observation.receipt) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires the canonical CMV observation envelope');
  }
  const topKeys = Object.keys(observation).sort();
  const expectedTop = ['candidates', 'effects', 'receipt', 'schema_version'];
  if (topKeys.length !== expectedTop.length || !topKeys.every((key, index) => key === expectedTop[index])) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance observation envelope has unexpected fields');
  }
  const effects = observation.effects;
  if (canonicalizeCalibrationMeasurementValidity(effects) !== canonicalizeCalibrationMeasurementValidity({
    network_calls: 0, file_reads: 0, file_writes: 0, external_mutations: 0,
  })) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance observation effects must be exact zero-effect metadata');
  }
  if (observation.candidates.length !== EXPECTED_CANDIDATES.length) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance observation candidate count is invalid');
  }
  const seen = new Set();
  for (const [factKey, candidateId] of EXPECTED_CANDIDATES) {
    const candidate = observation.candidates.find((row) => row?.fact_key === factKey) ?? null;
    const expectedKeys = ['candidate_id', 'claim_ceiling', 'fact_key', 'needs_owner_confirmation', 'observation_state', 'source_classification', 'source_envelope', 'source_id'];
    if (!candidate || seen.has(factKey) || candidate.candidate_id !== candidateId
        || Object.keys(candidate).sort().length !== expectedKeys.length
        || !Object.keys(candidate).sort().every((key, index) => key === expectedKeys[index])
        || candidate.claim_ceiling !== 'source_supported' || candidate.needs_owner_confirmation !== true) {
      throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance observation candidate shape is invalid');
    }
    let source;
    try {
      source = validateConsumedCmvSourceClassification(candidate.source_envelope, { requireDirect: true });
    } catch {
      throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance refuses unbound or forged observation candidates');
    }
    if (candidate.source_id !== source.source_id || candidate.source_classification !== source.classification) {
      throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance observation candidate source binding mismatches its envelope');
    }
    seen.add(factKey);
  }
  if (!hasExactKeys(observation.receipt?.project_binding_ref, REFERENCE_KEYS)
      || typeof observation.receipt.project_binding_ref.entity_id !== 'string' || observation.receipt.project_binding_ref.entity_id.length === 0
      || typeof observation.receipt.project_binding_ref.revision_id !== 'string' || observation.receipt.project_binding_ref.revision_id.length === 0
      || !SHA256_REFERENCE.test(observation.receipt.project_binding_ref.content_id)
      || !validCanonicalInstant(observation.receipt.valid_at)
      || !validCanonicalInstant(observation.receipt.known_at)
      || new Date(observation.receipt.known_at).valueOf() < new Date(observation.receipt.valid_at).valueOf()) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance observation receipt metadata is invalid');
  }
  const expectedReceipt = {
    schema_version: 'soulforge.calibration_measurement_validity.observation_receipt.v1',
    project_binding_ref: {
      entity_id: observation.receipt.project_binding_ref.entity_id,
      revision_id: observation.receipt.project_binding_ref.revision_id,
      content_id: observation.receipt.project_binding_ref.content_id,
    },
    valid_at: observation.receipt.valid_at,
    known_at: observation.receipt.known_at,
    candidate_count: observation.candidates.length,
    candidates_digest: `sha256:${calibrationMeasurementValiditySha256(observation.candidates)}`,
    observation_is_not_fact_confirmation: true,
  };
  if (canonicalizeCalibrationMeasurementValidity(observation.receipt) !== canonicalizeCalibrationMeasurementValidity(expectedReceipt)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance observation receipt is missing, stale, or mismatched');
  }
}

function admitGuidanceInput(input) {
  let value;
  try {
    value = snapshotCalibrationMeasurementValidityPlainData(input, {
      code: CMV_GUIDANCE_CODES.INVALID_INPUT,
      label: 'guidance input',
      rejectAliases: true,
    });
  } catch {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance input must be a safely admitted CMV assessment and observation graph');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires an assessment and source-bound observation candidates');
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'assessment' || keys[1] !== 'observation') {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance input must contain exactly assessment and observation');
  }
  return value;
}

function admitGuidanceEnvelope(guidance) {
  let value;
  try {
    value = snapshotCalibrationMeasurementValidityPlainData(guidance, {
      code: CMV_GUIDANCE_CODES.INVALID_INPUT,
      label: 'guidance envelope',
      rejectAliases: true,
    });
  } catch {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance envelope must be safely admitted plain data');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance envelope must be an object');
  }
  return value;
}

function admitGuidanceValidationContext(context) {
  let value;
  try {
    value = snapshotCalibrationMeasurementValidityPlainData(context, {
      code: CMV_GUIDANCE_CODES.INVALID_INPUT,
      label: 'guidance validation context',
      rejectAliases: true,
    });
  } catch {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance validation context must be safely admitted plain data');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance validation requires trusted assessment and observation context');
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'assessment' || keys[1] !== 'observation') {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance validation context must contain exactly assessment and observation');
  }
  return value;
}

export function validateCalibrationMeasurementValidityGuidance(guidance, context) {
  const admittedGuidance = admitGuidanceEnvelope(guidance);
  const admittedContext = admitGuidanceValidationContext(context);

  const { assessment, observation } = admittedContext;
  validateGuidanceAssessment(assessment);
  validateObservationEnvelope(observation);

  const obsReceipt = observation.receipt;
  if (obsReceipt.project_binding_ref.entity_id !== assessment.project_binding_ref.entity_id
      || obsReceipt.project_binding_ref.revision_id !== assessment.project_binding_ref.revision_id
      || obsReceipt.project_binding_ref.content_id !== assessment.project_binding_ref.content_id) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires assessment and observation to share the exact same project_binding_ref');
  }
  if (obsReceipt.valid_at !== assessment.evaluated_at.tested_at
      || obsReceipt.known_at !== assessment.evaluated_at.known_at) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires assessment and observation to share matching evaluated_at and cutoff timestamps');
  }

  // Top-level guidance structure checks
  if (admittedGuidance.schema_version !== CMV_GUIDANCE_SCHEMA_VERSION
      || admittedGuidance.judgment_changed !== false
      || !hasExactKeys(admittedGuidance.project_binding_ref, REFERENCE_KEYS)
      || !validCanonicalInstant(admittedGuidance.valid_at)
      || !validCanonicalInstant(admittedGuidance.known_at)
      || !SHA256_REFERENCE.test(admittedGuidance.assessment_digest)
      || !SHA256_REFERENCE.test(admittedGuidance.candidates_digest)
      || !Array.isArray(admittedGuidance.cards)
      || !admittedGuidance.effects || !admittedGuidance.receipt) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance envelope is invalid');
  }
  const topKeys = Object.keys(admittedGuidance).sort();
  const expectedTop = [
    'assessment_digest', 'cards', 'candidates_digest', 'effects',
    'judgment_changed', 'known_at', 'project_binding_ref', 'receipt', 'schema_version', 'valid_at',
  ].sort();
  if (topKeys.length !== expectedTop.length || !topKeys.every((k, i) => k === expectedTop[i])) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance envelope has unexpected keys');
  }

  if (canonicalizeCalibrationMeasurementValidity(admittedGuidance.effects) !== canonicalizeCalibrationMeasurementValidity({
    network_calls: 0, file_reads: 0, file_writes: 0, external_mutations: 0,
  })) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance effects must be exact zero-effect metadata');
  }

  // Receipt structure checks
  const receipt = admittedGuidance.receipt;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
      || receipt.schema_version !== 'soulforge.calibration_measurement_validity.guidance_receipt.v1'
      || receipt.assessment_result_preserved !== true
      || receipt.source_bound_candidate_count !== 6
      || !SHA256_REFERENCE.test(receipt.guidance_digest)
      || canonicalizeCalibrationMeasurementValidity(receipt.project_binding_ref) !== canonicalizeCalibrationMeasurementValidity(admittedGuidance.project_binding_ref)
      || receipt.valid_at !== admittedGuidance.valid_at
      || receipt.known_at !== admittedGuidance.known_at
      || receipt.assessment_digest !== admittedGuidance.assessment_digest
      || receipt.candidates_digest !== admittedGuidance.candidates_digest) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance receipt is invalid or mismatched');
  }
  const expectedReceiptKeys = [
    'assessment_digest', 'assessment_result_preserved', 'candidates_digest', 'guidance_digest',
    'known_at', 'project_binding_ref', 'schema_version', 'source_bound_candidate_count', 'valid_at',
  ].sort();
  const receiptKeys = Object.keys(receipt).sort();
  if (receiptKeys.length !== expectedReceiptKeys.length || !receiptKeys.every((k, i) => k === expectedReceiptKeys[i])) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance receipt has unexpected keys');
  }

  // Exact byte-level equality against trusted upstream context:
  // 1. project_binding_ref identity, revision, content
  if (admittedGuidance.project_binding_ref.entity_id !== assessment.project_binding_ref.entity_id
      || admittedGuidance.project_binding_ref.revision_id !== assessment.project_binding_ref.revision_id
      || admittedGuidance.project_binding_ref.content_id !== assessment.project_binding_ref.content_id
      || receipt.project_binding_ref.entity_id !== assessment.project_binding_ref.entity_id
      || receipt.project_binding_ref.revision_id !== assessment.project_binding_ref.revision_id
      || receipt.project_binding_ref.content_id !== assessment.project_binding_ref.content_id) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance project_binding_ref does not match trusted upstream context');
  }

  // 2. valid_at / tested_at relationship
  if (admittedGuidance.valid_at !== assessment.evaluated_at.tested_at
      || receipt.valid_at !== assessment.evaluated_at.tested_at
      || admittedGuidance.valid_at !== obsReceipt.valid_at
      || receipt.valid_at !== obsReceipt.valid_at) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance valid_at does not match trusted upstream context');
  }

  // 3. known_at
  if (admittedGuidance.known_at !== assessment.evaluated_at.known_at
      || receipt.known_at !== assessment.evaluated_at.known_at
      || admittedGuidance.known_at !== obsReceipt.known_at
      || receipt.known_at !== obsReceipt.known_at) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance known_at does not match trusted upstream context');
  }

  // 4. Recompute upstream assessment digest
  const expectedAssessmentDigest = `sha256:${calibrationMeasurementValiditySha256(assessment)}`;
  if (admittedGuidance.assessment_digest !== expectedAssessmentDigest
      || receipt.assessment_digest !== expectedAssessmentDigest) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance assessment digest does not match trusted upstream assessment');
  }

  // 5. Recompute upstream observation/candidates digest
  const expectedCandidatesDigest = `sha256:${calibrationMeasurementValiditySha256(observation.candidates)}`;
  if (obsReceipt.candidates_digest !== expectedCandidatesDigest
      || admittedGuidance.candidates_digest !== expectedCandidatesDigest
      || receipt.candidates_digest !== expectedCandidatesDigest) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance candidates digest does not match trusted upstream observation');
  }

  // 6. Recompute cards from determinations and compare exact cards body
  const expectedCards = deriveGuidanceCards(assessment.determinations);
  if (canonicalizeCalibrationMeasurementValidity(admittedGuidance.cards) !== canonicalizeCalibrationMeasurementValidity(expectedCards)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance cards do not match trusted upstream determinations');
  }

  // 7. Recompute guidance digest from complete trusted context and exact cards/receipt body
  const receiptBody = {
    schema_version: 'soulforge.calibration_measurement_validity.guidance_receipt.v1',
    project_binding_ref: {
      entity_id: assessment.project_binding_ref.entity_id,
      revision_id: assessment.project_binding_ref.revision_id,
      content_id: assessment.project_binding_ref.content_id,
    },
    valid_at: assessment.evaluated_at.tested_at,
    known_at: assessment.evaluated_at.known_at,
    assessment_digest: expectedAssessmentDigest,
    candidates_digest: expectedCandidatesDigest,
    assessment_status: assessment.result_status,
    assessment_result_preserved: true,
    source_bound_candidate_count: observation.candidates.length,
    cards: expectedCards,
  };
  const expectedGuidanceDigest = `sha256:${calibrationMeasurementValiditySha256(receiptBody)}`;
  if (receipt.guidance_digest !== expectedGuidanceDigest) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance digest is stale or mismatched');
  }

  return true;
}

export function buildCalibrationMeasurementValidityGuidance(input) {
  const value = admitGuidanceInput(input);
  if (!value.assessment || !value.observation
      || !Array.isArray(value.assessment.determinations) || !Array.isArray(value.observation.candidates)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires an assessment and source-bound observation candidates');
  }
  validateGuidanceAssessment(value.assessment);
  validateObservationEnvelope(value.observation);
  const obsReceipt = value.observation.receipt;
  if (obsReceipt.project_binding_ref.entity_id !== value.assessment.project_binding_ref.entity_id
      || obsReceipt.project_binding_ref.revision_id !== value.assessment.project_binding_ref.revision_id
      || obsReceipt.project_binding_ref.content_id !== value.assessment.project_binding_ref.content_id) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires assessment and observation to share the exact same project_binding_ref');
  }
  if (obsReceipt.valid_at !== value.assessment.evaluated_at.tested_at
      || obsReceipt.known_at !== value.assessment.evaluated_at.known_at) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires assessment and observation to share matching evaluated_at and cutoff timestamps');
  }
  const cards = deriveGuidanceCards(value.assessment.determinations);
  const projectBindingRef = {
    entity_id: value.assessment.project_binding_ref.entity_id,
    revision_id: value.assessment.project_binding_ref.revision_id,
    content_id: value.assessment.project_binding_ref.content_id,
  };
  const validAt = value.assessment.evaluated_at.tested_at;
  const knownAt = value.assessment.evaluated_at.known_at;
  const assessmentDigest = `sha256:${calibrationMeasurementValiditySha256(value.assessment)}`;
  const candidatesDigest = `sha256:${calibrationMeasurementValiditySha256(value.observation.candidates)}`;

  const receiptBody = {
    schema_version: 'soulforge.calibration_measurement_validity.guidance_receipt.v1',
    project_binding_ref: projectBindingRef,
    valid_at: validAt,
    known_at: knownAt,
    assessment_digest: assessmentDigest,
    candidates_digest: candidatesDigest,
    assessment_status: value.assessment.result_status,
    assessment_result_preserved: true,
    source_bound_candidate_count: value.observation.candidates.length,
    cards,
  };
  const guidanceDigest = `sha256:${calibrationMeasurementValiditySha256(receiptBody)}`;

  return freezeDeep({
    schema_version: CMV_GUIDANCE_SCHEMA_VERSION,
    project_binding_ref: structuredClone(projectBindingRef),
    valid_at: validAt,
    known_at: knownAt,
    assessment_digest: assessmentDigest,
    candidates_digest: candidatesDigest,
    judgment_changed: false,
    cards,
    effects: {
      network_calls: 0,
      file_reads: 0,
      file_writes: 0,
      external_mutations: 0,
    },
    receipt: {
      schema_version: 'soulforge.calibration_measurement_validity.guidance_receipt.v1',
      project_binding_ref: structuredClone(projectBindingRef),
      valid_at: validAt,
      known_at: knownAt,
      assessment_digest: assessmentDigest,
      candidates_digest: candidatesDigest,
      guidance_digest: guidanceDigest,
      assessment_result_preserved: true,
      source_bound_candidate_count: value.observation.candidates.length,
    },
  });
}
