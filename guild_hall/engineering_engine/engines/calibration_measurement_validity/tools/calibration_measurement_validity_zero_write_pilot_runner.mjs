#!/usr/bin/env node
import { buildCalibrationMeasurementValidityPublicSyntheticRequest } from '../fixtures/calibration_measurement_validity_public_synthetic.mjs';
import {
  classifyCmvSourceEvidence,
  cmvAcceptedSourceBindingInput,
} from '../source/calibration_measurement_validity_source_classification.mjs';
import { adaptCalibrationMeasurementValidityTypedFacts } from '../typed_facts/calibration_measurement_validity_typed_facts_adapter.mjs';
import { calibrationMeasurementValidityAdapter } from '../evaluator/calibration_measurement_validity_evaluator_adapter.mjs';
import { deriveCalibrationMeasurementValidityObservationCandidates } from '../observation/calibration_measurement_validity_observation.mjs';
import { buildCalibrationMeasurementValidityGuidance } from '../guidance/calibration_measurement_validity_guidance.mjs';
import { assembleEffectiveRuleSet, evaluate, resolveProfileBindings } from '../../../core/interfaces/domain_engine_adapter.mjs';

const source = classifyCmvSourceEvidence(
  cmvAcceptedSourceBindingInput('NIST-METROLOGICAL-TRACEABILITY-FAQ', 'synthetic_direct'),
);
const request = buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID');
const typed = adaptCalibrationMeasurementValidityTypedFacts({
  schema_version: 'soulforge.calibration_measurement_validity.source_bound_typed_facts.v1',
  domain_input: request,
  source_classifications: [source],
  fact_provenance: Object.fromEntries([
    'instrument_identity', 'calibration_status', 'measurement_suitability', 'traceability', 'environment', 'exception',
  ].map((factKey) => [factKey, { source_id: source.source_id, source_ref: source.source_ref }])),
});
const profile = {
  profile_id: 'synthetic-cmv-pilot-profile',
  domain_engine_id: 'calibration_measurement_validity',
  revision_or_hash: `sha256:${'b'.repeat(64)}`,
  extends_or_base_pin: 'calibration_measurement_validity@0.1.0',
  source_refs: ['source:NIST-METROLOGICAL-TRACEABILITY-FAQ'],
  operations: [{
    op: 'source_bound_requirements',
    requirement_id: 'cmv-pilot-direct-source',
    required_source_ids: ['NIST-METROLOGICAL-TRACEABILITY-FAQ'],
    required_classification: 'official_public_direct',
  }],
};
const effective = assembleEffectiveRuleSet(calibrationMeasurementValidityAdapter, resolveProfileBindings(null, profile));
const evaluation = evaluate(calibrationMeasurementValidityAdapter, effective, typed);
const observation = deriveCalibrationMeasurementValidityObservationCandidates(typed);
const guidance = buildCalibrationMeasurementValidityGuidance({ assessment: evaluation.assessment, observation });

process.stdout.write(`${JSON.stringify({
  schema_version: 'soulforge.calibration_measurement_validity.zero_write_pilot.v1',
  pilot_status: 'public_synthetic_only',
  assessment: evaluation.assessment,
  profile_status: evaluation.assessment.profile_evaluation?.status ?? 'not_applicable',
  observation_receipt: observation.receipt,
  guidance_receipt: guidance.receipt,
  effects: {
    network_calls: 0,
    file_reads: 0,
    file_writes: 0,
    external_mutations: 0,
  },
})}\n`);
