import {
  CALIBRATION_MEASUREMENT_VALIDITY_RULES,
  CMV_RULESET_REF,
  CMV_RULESET_SCHEMA_VERSION,
  CMV_SOURCE_PACKET_REF,
} from '../rules/calibration_measurement_validity_rules.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

export const CMV_COMPILER_ADAPTER_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.compiler.v0';
export const CMV_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_UNSUPPORTED: 'CMV_PROFILE_UNSUPPORTED',
  COMPILATION_SCOPE_INVALID: 'CMV_COMPILATION_SCOPE_INVALID',
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function copyReference(reference) {
  return {
    entity_id: reference.entity_id,
    revision_id: reference.revision_id,
    content_id: reference.content_id,
  };
}

function copyRule(rule) {
  return {
    criterion_id: rule.criterion_id,
    required_fact_paths: [...rule.required_fact_paths],
    source_refs: [...rule.source_refs],
    purpose: rule.purpose,
  };
}

export function compileCalibrationMeasurementValidityRules(profileBindings = [], compilationScope = {}) {
  if (!Array.isArray(profileBindings) || profileBindings.length !== 0) {
    throw new ContractError(
      CMV_COMPILER_ERROR_CODES.PROFILE_UNSUPPORTED,
      'Calibration and Measurement Validity v0 accepts only the base ruleset; non-empty profile deltas require a future shared integration.',
    );
  }
  if (!compilationScope || typeof compilationScope !== 'object' || Array.isArray(compilationScope)) {
    throw new ContractError(
      CMV_COMPILER_ERROR_CODES.COMPILATION_SCOPE_INVALID,
      'compilation scope must be an ordinary object when supplied',
    );
  }

  return freezeDeep({
    schema_version: CMV_RULESET_SCHEMA_VERSION,
    domain_engine_id: 'calibration_measurement_validity',
    ruleset_ref: copyReference(CMV_RULESET_REF),
    source_packet_ref: copyReference(CMV_SOURCE_PACKET_REF),
    profile_rule_provenance: {},
    rules: CALIBRATION_MEASUREMENT_VALIDITY_RULES.map(copyRule),
    rule_count: CALIBRATION_MEASUREMENT_VALIDITY_RULES.length,
  });
}

export const calibrationMeasurementValidityCompilerAdapter = Object.freeze({
  domain_engine_id: 'calibration_measurement_validity',
  revision: '0.1.0',
  compile(profileBindings, compilationScope) {
    const effectiveRuleSet = compileCalibrationMeasurementValidityRules(profileBindings, compilationScope);
    return Object.freeze({
      effective_rule_set: effectiveRuleSet,
      rule_count: effectiveRuleSet.rule_count,
    });
  },
});
