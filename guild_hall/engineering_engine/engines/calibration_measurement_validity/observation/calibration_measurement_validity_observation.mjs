import { ContractError } from '../../../core/validators/errors.mjs';
import { calibrationMeasurementValiditySha256 } from '../shared/calibration_measurement_validity_canonical_digest.mjs';
import { validateConsumedCmvSourceClassification } from '../source/calibration_measurement_validity_source_classification.mjs';

export const CMV_OBSERVATION_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.observation_candidates.v1';
export const CMV_OBSERVATION_CODES = Object.freeze({
  INVALID_INPUT: 'CMV_OBSERVATION_INVALID_INPUT',
  SOURCE_BOUND_REQUIRED: 'CMV_OBSERVATION_SOURCE_BOUND_REQUIRED',
});

const FACT_ROWS = Object.freeze([
  ['instrument_identity', 'instrument_identity'],
  ['calibration_status', 'calibration_status'],
  ['measurement_suitability', 'measurement_suitability'],
  ['traceability', 'traceability'],
  ['environment', 'environment'],
  ['exception', 'exception'],
]);

function refuse(code, message) {
  throw new ContractError(code, message);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function observationState(factKey, request) {
  if (factKey === 'instrument_identity') return request.instrument?.instrument_id && request.instrument?.identity_ref ? 'present' : 'missing';
  if (factKey === 'calibration_status') return request.instrument?.calibration?.status ? 'present' : 'missing';
  if (factKey === 'measurement_suitability') return request.requested_measurement && request.calibration_capability ? 'present' : 'missing';
  if (factKey === 'traceability') return request.traceability?.status ?? 'missing';
  if (factKey === 'environment') return request.environment?.status ?? 'missing';
  return request.exception?.status ?? 'missing';
}

export function deriveCalibrationMeasurementValidityObservationCandidates(typedFacts) {
  if (!typedFacts || typeof typedFacts !== 'object' || typedFacts.schema_version !== 'soulforge.calibration_measurement_validity.typed_facts.v1'
      || !typedFacts.request || !typedFacts.fact_provenance || !Array.isArray(typedFacts.source_classifications)) {
    refuse(CMV_OBSERVATION_CODES.INVALID_INPUT, 'CMV observation requires a source-bound typed-facts envelope');
  }
  const sources = new Map(typedFacts.source_classifications.map((source) => [source.source_id, source]));
  const candidates = FACT_ROWS.map(([factKey, candidateId]) => {
    const provenance = typedFacts.fact_provenance[factKey];
    const source = provenance ? sources.get(provenance.source_id) : null;
    let canonicalSource;
    try {
      canonicalSource = source ? validateConsumedCmvSourceClassification(source, { requireDirect: true }) : null;
    } catch {
      canonicalSource = null;
    }
    if (!canonicalSource) {
      refuse(CMV_OBSERVATION_CODES.SOURCE_BOUND_REQUIRED, 'every observation candidate requires direct source-bound typed facts');
    }
    return {
      candidate_id: `cmv-${candidateId}`,
      fact_key: factKey,
      observation_state: observationState(factKey, typedFacts.request),
      source_id: canonicalSource.source_id,
      source_classification: canonicalSource.classification,
      source_envelope: canonicalSource,
      claim_ceiling: 'source_supported',
      needs_owner_confirmation: true,
    };
  });
  const output = {
    schema_version: CMV_OBSERVATION_SCHEMA_VERSION,
    candidates,
    effects: {
      network_calls: 0,
      file_reads: 0,
      file_writes: 0,
      external_mutations: 0,
    },
    receipt: {
      schema_version: 'soulforge.calibration_measurement_validity.observation_receipt.v1',
      candidate_count: candidates.length,
      candidates_digest: `sha256:${calibrationMeasurementValiditySha256(candidates)}`,
      observation_is_not_fact_confirmation: true,
    },
  };
  return freezeDeep(output);
}
