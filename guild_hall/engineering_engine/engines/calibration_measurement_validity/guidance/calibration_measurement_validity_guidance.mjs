import { ContractError } from '../../../core/validators/errors.mjs';
import {
  calibrationMeasurementValiditySha256,
  canonicalizeCalibrationMeasurementValidity,
} from '../shared/calibration_measurement_validity_canonical_digest.mjs';
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
  const expectedReceipt = {
    schema_version: 'soulforge.calibration_measurement_validity.observation_receipt.v1',
    candidate_count: observation.candidates.length,
    candidates_digest: `sha256:${calibrationMeasurementValiditySha256(observation.candidates)}`,
    observation_is_not_fact_confirmation: true,
  };
  if (canonicalizeCalibrationMeasurementValidity(observation.receipt) !== canonicalizeCalibrationMeasurementValidity(expectedReceipt)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance observation receipt is missing, stale, or mismatched');
  }
}

export function buildCalibrationMeasurementValidityGuidance(input) {
  if (!input || typeof input !== 'object' || !input.assessment || !input.observation
      || !Array.isArray(input.assessment.determinations) || !Array.isArray(input.observation.candidates)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires an assessment and source-bound observation candidates');
  }
  validateObservationEnvelope(input.observation);
  const cards = input.assessment.determinations
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
  const receiptBody = {
    assessment_status: input.assessment.result_status,
    candidate_count: input.observation.candidates.length,
    cards,
  };
  return freezeDeep({
    schema_version: CMV_GUIDANCE_SCHEMA_VERSION,
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
      guidance_digest: `sha256:${calibrationMeasurementValiditySha256(receiptBody)}`,
      assessment_result_preserved: true,
      source_bound_candidate_count: input.observation.candidates.length,
    },
  });
}
