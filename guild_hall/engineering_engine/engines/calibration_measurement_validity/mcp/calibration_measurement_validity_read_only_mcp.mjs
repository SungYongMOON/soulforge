import { ContractError } from '../../../core/validators/errors.mjs';
import { classifyCmvSourceEvidence } from '../source/calibration_measurement_validity_source_classification.mjs';
import { buildCalibrationMeasurementValidityPublicSyntheticRequest } from '../fixtures/calibration_measurement_validity_public_synthetic.mjs';
import { assessCalibrationMeasurementValidity } from '../evaluator/calibration_measurement_validity.mjs';
import { buildCalibrationMeasurementValidityGuidance } from '../guidance/calibration_measurement_validity_guidance.mjs';
import { adaptCalibrationMeasurementValidityTypedFacts } from '../typed_facts/calibration_measurement_validity_typed_facts_adapter.mjs';
import { deriveCalibrationMeasurementValidityObservationCandidates } from '../observation/calibration_measurement_validity_observation.mjs';

export const CMV_READ_ONLY_MCP_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.read_only_mcp.v1';
export const CMV_READ_ONLY_MCP_CODES = Object.freeze({
  UNKNOWN_TOOL: 'CMV_READ_ONLY_MCP_UNKNOWN_TOOL',
  INPUT_INVALID: 'CMV_READ_ONLY_MCP_INPUT_INVALID',
});

const ZERO_EFFECTS = Object.freeze({
  network_calls: 0,
  file_reads: 0,
  file_writes: 0,
  external_mutations: 0,
});

export const CALIBRATION_MEASUREMENT_VALIDITY_READ_ONLY_MCP_TOOLS = Object.freeze([
  Object.freeze({ name: 'cmv.classify_source', title: 'Classify public source evidence', write: false }),
  Object.freeze({ name: 'cmv.evaluate_public_synthetic', title: 'Evaluate public synthetic CMV case', write: false }),
  Object.freeze({ name: 'cmv.guidance_public_synthetic', title: 'Build public synthetic CMV guidance', write: false }),
]);

function response(structured) {
  return Object.freeze({
    schema_version: CMV_READ_ONLY_MCP_SCHEMA_VERSION,
    structured,
    effects: { ...ZERO_EFFECTS },
  });
}

function publicSyntheticTypedFacts(caseId) {
  const source = classifyCmvSourceEvidence({
    source_id: 'NIST-METROLOGICAL-TRACEABILITY-FAQ',
    authority: 'National Institute of Standards and Technology',
    revision: 'synthetic-v1',
    access_class: 'official_public',
    direct_access_verified: true,
    retrieval_path: 'direct',
    applicability_state: 'in_scope',
    source_ref: {
      entity_id: 'synthetic:cmv-mcp-source',
      revision_id: 'v1',
      content_id: `sha256:${'c'.repeat(64)}`,
    },
  });
  return adaptCalibrationMeasurementValidityTypedFacts({
    schema_version: 'soulforge.calibration_measurement_validity.source_bound_typed_facts.v1',
    domain_input: buildCalibrationMeasurementValidityPublicSyntheticRequest(caseId),
    source_classifications: [source],
    fact_provenance: Object.fromEntries([
      'instrument_identity', 'calibration_status', 'measurement_suitability', 'traceability', 'environment', 'exception',
    ].map((factKey) => [factKey, { source_id: source.source_id, source_ref: source.source_ref }])),
  });
}

export function invokeCalibrationMeasurementValidityReadOnlyMcp(name, args = {}) {
  if (name === 'cmv.classify_source') {
    if (!args || typeof args !== 'object' || !args.source) {
      throw new ContractError(CMV_READ_ONLY_MCP_CODES.INPUT_INVALID, 'cmv.classify_source requires a source object');
    }
    return response(classifyCmvSourceEvidence(args.source));
  }
  if (name === 'cmv.evaluate_public_synthetic') {
    const caseId = args?.case_id ?? 'VALID';
    const typed = publicSyntheticTypedFacts(caseId);
    const evaluation = assessCalibrationMeasurementValidity(typed.request);
    return response({
      assessment: evaluation.assessment,
      receipt: evaluation.receipt,
      typed_fact_receipt: typed.typed_fact_receipt,
    });
  }
  if (name === 'cmv.guidance_public_synthetic') {
    const caseId = args?.case_id ?? 'VALID';
    const typed = publicSyntheticTypedFacts(caseId);
    const assessment = assessCalibrationMeasurementValidity(typed.request).assessment;
    const observation = deriveCalibrationMeasurementValidityObservationCandidates(typed);
    return response(buildCalibrationMeasurementValidityGuidance({ assessment, observation }));
  }
  throw new ContractError(CMV_READ_ONLY_MCP_CODES.UNKNOWN_TOOL, 'only declared CMV read-only tools may be invoked');
}
