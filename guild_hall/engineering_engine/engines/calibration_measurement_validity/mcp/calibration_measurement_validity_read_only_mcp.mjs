import { ContractError } from '../../../core/validators/errors.mjs';
import {
  classifyCmvSourceEvidence,
  cmvAcceptedSourceBindingInput,
} from '../source/calibration_measurement_validity_source_classification.mjs';
import { buildCalibrationMeasurementValidityPublicSyntheticRequest } from '../fixtures/calibration_measurement_validity_public_synthetic.mjs';
import { assessCalibrationMeasurementValidity } from '../evaluator/calibration_measurement_validity.mjs';
import { buildCalibrationMeasurementValidityGuidance } from '../guidance/calibration_measurement_validity_guidance.mjs';
import { adaptCalibrationMeasurementValidityTypedFacts } from '../typed_facts/calibration_measurement_validity_typed_facts_adapter.mjs';
import { deriveCalibrationMeasurementValidityObservationCandidates } from '../observation/calibration_measurement_validity_observation.mjs';
import { snapshotCalibrationMeasurementValidityPlainData } from '../shared/calibration_measurement_validity_safe_snapshot.mjs';

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
const PUBLIC_SYNTHETIC_CASE_IDS = new Set(['VALID', 'EXPIRED', 'OUT_OF_RANGE', 'EXCEPTION_HELD', 'UNKNOWN']);

export const CALIBRATION_MEASUREMENT_VALIDITY_READ_ONLY_MCP_TOOLS = Object.freeze([
  Object.freeze({ name: 'cmv.classify_source', title: 'Classify public source evidence', write: false }),
  Object.freeze({ name: 'cmv.evaluate_public_synthetic', title: 'Evaluate public synthetic CMV case', write: false }),
  Object.freeze({ name: 'cmv.guidance_public_synthetic', title: 'Build public synthetic CMV guidance', write: false }),
]);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function response(structured) {
  return freezeDeep({
    schema_version: CMV_READ_ONLY_MCP_SCHEMA_VERSION,
    structured,
    effects: { ...ZERO_EFFECTS },
  });
}

function publicSyntheticTypedFacts(caseId) {
  const source = classifyCmvSourceEvidence(
    cmvAcceptedSourceBindingInput('NIST-METROLOGICAL-TRACEABILITY-FAQ', 'synthetic_direct'),
  );
  return adaptCalibrationMeasurementValidityTypedFacts({
    schema_version: 'soulforge.calibration_measurement_validity.source_bound_typed_facts.v1',
    domain_input: buildCalibrationMeasurementValidityPublicSyntheticRequest(caseId),
    source_classifications: [source],
    fact_provenance: Object.fromEntries([
      'instrument_identity', 'calibration_status', 'measurement_suitability', 'traceability', 'environment', 'exception',
    ].map((factKey) => [factKey, { source_id: source.source_id, source_ref: structuredClone(source.source_ref) }])),
  });
}

function publicSyntheticCaseId(args) {
  const keys = Object.keys(args).sort();
  if (keys.length > 1 || (keys.length === 1 && keys[0] !== 'case_id')) {
    throw new ContractError(CMV_READ_ONLY_MCP_CODES.INPUT_INVALID, 'MCP public-synthetic arguments may contain only case_id');
  }
  const caseId = args?.case_id ?? 'VALID';
  if (typeof caseId !== 'string' || !PUBLIC_SYNTHETIC_CASE_IDS.has(caseId)) {
    throw new ContractError(CMV_READ_ONLY_MCP_CODES.INPUT_INVALID, 'MCP public-synthetic case_id must be one declared CMV fixture case');
  }
  return caseId;
}

function admitMcpArgs(args) {
  let value;
  try {
    value = snapshotCalibrationMeasurementValidityPlainData(args, {
      code: CMV_READ_ONLY_MCP_CODES.INPUT_INVALID,
      label: 'read-only MCP arguments',
      rejectAliases: true,
    });
  } catch {
    throw new ContractError(CMV_READ_ONLY_MCP_CODES.INPUT_INVALID, 'read-only MCP arguments must be safely admitted plain data');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractError(CMV_READ_ONLY_MCP_CODES.INPUT_INVALID, 'read-only MCP arguments must be an object');
  }
  return value;
}

export function invokeCalibrationMeasurementValidityReadOnlyMcp(name, args = {}) {
  const admittedArgs = admitMcpArgs(args);
  if (name === 'cmv.classify_source') {
    const keys = Object.keys(admittedArgs).sort();
    if (keys.length !== 1 || keys[0] !== 'source' || !admittedArgs.source) {
      throw new ContractError(CMV_READ_ONLY_MCP_CODES.INPUT_INVALID, 'cmv.classify_source requires a source object');
    }
    return response(classifyCmvSourceEvidence(admittedArgs.source));
  }
  if (name === 'cmv.evaluate_public_synthetic') {
    const caseId = publicSyntheticCaseId(admittedArgs);
    const typed = publicSyntheticTypedFacts(caseId);
    const evaluation = assessCalibrationMeasurementValidity(typed.request);
    return response({
      assessment: evaluation.assessment,
      receipt: evaluation.receipt,
      typed_fact_receipt: typed.typed_fact_receipt,
    });
  }
  if (name === 'cmv.guidance_public_synthetic') {
    const caseId = publicSyntheticCaseId(admittedArgs);
    const typed = publicSyntheticTypedFacts(caseId);
    const assessment = assessCalibrationMeasurementValidity(typed.request).assessment;
    const observation = deriveCalibrationMeasurementValidityObservationCandidates(typed);
    return response(buildCalibrationMeasurementValidityGuidance({ assessment, observation }));
  }
  throw new ContractError(CMV_READ_ONLY_MCP_CODES.UNKNOWN_TOOL, 'only declared CMV read-only tools may be invoked');
}
