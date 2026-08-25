import { ContractError } from '../../../core/validators/errors.mjs';
import { calibrationMeasurementValiditySha256 } from '../shared/calibration_measurement_validity_canonical_digest.mjs';
import { CMV_OBSERVATION_SCHEMA_VERSION } from '../observation/calibration_measurement_validity_observation.mjs';
import { validateConsumedCmvSourceClassification } from '../source/calibration_measurement_validity_source_classification.mjs';

export const CMV_GUIDANCE_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.guidance.v1';
export const CMV_GUIDANCE_CODES = Object.freeze({ INVALID_INPUT: 'CMV_GUIDANCE_INVALID_INPUT' });

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

export function buildCalibrationMeasurementValidityGuidance(input) {
  if (!input || typeof input !== 'object' || !input.assessment || !input.observation
      || !Array.isArray(input.assessment.determinations) || !Array.isArray(input.observation.candidates)) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires an assessment and source-bound observation candidates');
  }
  if (input.observation.schema_version !== CMV_OBSERVATION_SCHEMA_VERSION) {
    throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance requires the canonical CMV observation envelope');
  }
  for (const candidate of input.observation.candidates) {
    try {
      const source = validateConsumedCmvSourceClassification(candidate?.source_envelope, { requireDirect: true });
      if (candidate.source_id !== source.source_id || candidate.source_classification !== source.classification) {
        throw new Error('candidate source binding mismatch');
      }
    } catch {
      throw new ContractError(CMV_GUIDANCE_CODES.INVALID_INPUT, 'guidance refuses unbound or forged observation candidates');
    }
  }
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
