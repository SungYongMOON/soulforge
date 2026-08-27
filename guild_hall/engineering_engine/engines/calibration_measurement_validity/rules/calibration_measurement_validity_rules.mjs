import { calibrationMeasurementValiditySha256 } from '../shared/calibration_measurement_validity_canonical_digest.mjs';

export const CMV_RULESET_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.ruleset.v0';
export const CMV_RULESET_REVISION = 'soulforge.calibration_measurement_validity.ruleset.v0';
export const CMV_SOURCE_PACKET_REF = Object.freeze({
  entity_id: 'source_packet:calibration_measurement_validity_public_source_packet',
  revision_id: 'v0',
  content_id: 'sha256:b8e0134de445b048c12838e6e8c454648fbbd0bfabe1ea3e88d523846a71c67e',
});

export const CMV_VOCABULARY = Object.freeze({
  calibration_status: Object.freeze(['in_calibration', 'expired', 'out_of_service', 'unknown']),
  traceability_status: Object.freeze(['documented', 'not_documented', 'unknown']),
  environment_status: Object.freeze(['within_limit', 'out_of_limit', 'not_applicable', 'unknown']),
  exception_status: Object.freeze(['none', 'approved_hold', 'unapproved', 'unknown']),
  evidence_status: Object.freeze(['valid', 'missing', 'unknown', 'expired', 'out_of_range', 'not_suitable', 'exception_held', 'not_applicable']),
  result_status: Object.freeze(['valid', 'unknown', 'held', 'invalid']),
});

const freezeRule = (rule) => Object.freeze({
  criterion_id: rule.criterion_id,
  required_fact_paths: Object.freeze([...rule.required_fact_paths]),
  source_refs: Object.freeze([...rule.source_refs]),
  purpose: rule.purpose,
});

export const CALIBRATION_MEASUREMENT_VALIDITY_RULES = Object.freeze([
  freezeRule({
    criterion_id: 'CMV-INSTRUMENT-IDENTITY-01',
    required_fact_paths: ['instrument.instrument_id', 'instrument.identity_ref'],
    source_refs: ['NIST-METROLOGICAL-TRACEABILITY-FAQ'],
    purpose: 'Tie the supplied calibration and test facts to an explicitly identified instrument.',
  }),
  freezeRule({
    criterion_id: 'CMV-CALIBRATION-STATUS-01',
    required_fact_paths: ['instrument.calibration.status', 'instrument.calibration.certificate_ref', 'instrument.calibration.due_at', 'evaluation_context.tested_at'],
    source_refs: ['NIST-RECOMMENDED-CALIBRATION-INTERVAL-2026-05-29', 'ILAC-G24-2022-PUBLICATION'],
    purpose: 'Compare supplied status and due time with the supplied test time; do not choose an interval.',
  }),
  freezeRule({
    criterion_id: 'CMV-RANGE-01',
    required_fact_paths: ['requested_measurement.range', 'calibration_capability.range'],
    source_refs: ['NIST-TN-1297-1994'],
    purpose: 'Check that supplied requested range lies inside supplied calibrated range in the same unit.',
  }),
  freezeRule({
    criterion_id: 'CMV-ACCURACY-01',
    required_fact_paths: ['requested_measurement.required_accuracy_limit', 'calibration_capability.accuracy_limit'],
    source_refs: ['NIST-TN-1297-1994'],
    purpose: 'Compare supplied accuracy limits in the same unit; do not derive an error model.',
  }),
  freezeRule({
    criterion_id: 'CMV-UNCERTAINTY-01',
    required_fact_paths: ['requested_measurement.maximum_uncertainty', 'calibration_capability.uncertainty.expanded'],
    source_refs: ['NIST-TN-1297-1994'],
    purpose: 'Compare supplied expanded uncertainty facts in the same unit; do not calculate uncertainty.',
  }),
  freezeRule({
    criterion_id: 'CMV-TRACEABILITY-01',
    required_fact_paths: ['traceability.status', 'traceability.chain_ref'],
    source_refs: ['NIST-METROLOGICAL-TRACEABILITY-FAQ'],
    purpose: 'Preserve documented traceability as a separately supplied evidence fact.',
  }),
  freezeRule({
    criterion_id: 'CMV-ENVIRONMENT-01',
    required_fact_paths: ['environment.status', 'environment.record_ref'],
    source_refs: ['NIST-TN-1297-1994', 'NIST-RECOMMENDED-CALIBRATION-INTERVAL-2026-05-29'],
    purpose: 'Preserve whether supplied environmental conditions are within their upstream control limit.',
  }),
  freezeRule({
    criterion_id: 'CMV-EXCEPTION-01',
    required_fact_paths: ['exception.status', 'exception.exception_ref', 'exception.approval_ref'],
    source_refs: ['ENGINE-SAFETY-BOUNDARY'],
    purpose: 'Hold an exception rather than treating it as measurement validity or an approved disposition.',
  }),
  freezeRule({
    criterion_id: 'CMV-RESULT-IMPACT-01',
    required_fact_paths: ['all CMV determinations'],
    source_refs: ['ENGINE-SAFETY-BOUNDARY'],
    purpose: 'Aggregate evidence states into a hold, invalidation, unknown, or valid result impact without approving a disposition.',
  }),
]);

const rulesetHash = calibrationMeasurementValiditySha256({
  domain_separator: 'soulforge.calibration_measurement_validity.ruleset.v0',
  rules: CALIBRATION_MEASUREMENT_VALIDITY_RULES,
});

export const CMV_RULESET_REF = Object.freeze({
  entity_id: 'ruleset:calibration_measurement_validity',
  revision_id: CMV_RULESET_REVISION,
  content_id: `sha256:${rulesetHash}`,
});
