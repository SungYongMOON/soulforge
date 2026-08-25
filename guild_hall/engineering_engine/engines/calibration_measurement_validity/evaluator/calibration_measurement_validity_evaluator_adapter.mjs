import { registerDomainEngineAdapter } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import {
  CALIBRATION_MEASUREMENT_VALIDITY_RULES,
  CMV_RULESET_REF,
  CMV_RULESET_SCHEMA_VERSION,
  CMV_SOURCE_PACKET_REF,
} from '../rules/calibration_measurement_validity_rules.mjs';
import { calibrationMeasurementValidityCompilerAdapter } from '../compiler/calibration_measurement_validity_compiler_adapter.mjs';
import { assessCalibrationMeasurementValidity, CMV_ERROR_CODES } from './calibration_measurement_validity.mjs';

export const CMV_EVALUATOR_ADAPTER_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.evaluator.v0';

function sameReference(left, right) {
  return Boolean(left && right
    && left.entity_id === right.entity_id
    && left.revision_id === right.revision_id
    && left.content_id === right.content_id);
}

function verifyBaseRuleset(effectiveRuleSet) {
  if (!effectiveRuleSet || typeof effectiveRuleSet !== 'object' || Array.isArray(effectiveRuleSet)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'effective rule set must be an object');
  }
  const ruleSet = effectiveRuleSet.effective_rule_set || effectiveRuleSet;
  if (!ruleSet || typeof ruleSet !== 'object' || Array.isArray(ruleSet)
      || ruleSet.schema_version !== CMV_RULESET_SCHEMA_VERSION
      || ruleSet.domain_engine_id !== 'calibration_measurement_validity'
      || !sameReference(ruleSet.ruleset_ref, CMV_RULESET_REF)
      || !sameReference(ruleSet.source_packet_ref, CMV_SOURCE_PACKET_REF)
      || !Array.isArray(ruleSet.rules)
      || ruleSet.rules.length !== CALIBRATION_MEASUREMENT_VALIDITY_RULES.length) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'effective rule set is not the CMV v0 base ruleset');
  }
  if (ruleSet.profile_rule_provenance && Object.keys(ruleSet.profile_rule_provenance).length !== 0) {
    throw new ContractError(CMV_ERROR_CODES.PROFILE_UNSUPPORTED, 'derived CMV profile rulesets are not supported in v0');
  }
  for (let index = 0; index < CALIBRATION_MEASUREMENT_VALIDITY_RULES.length; index += 1) {
    if (JSON.stringify(ruleSet.rules[index]) !== JSON.stringify(CALIBRATION_MEASUREMENT_VALIDITY_RULES[index])) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `CMV rule mismatch at index ${index}`);
    }
  }
}

export const calibrationMeasurementValidityAdapter = Object.freeze({
  ...calibrationMeasurementValidityCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts) {
    verifyBaseRuleset(effectiveRuleSet);
    return assessCalibrationMeasurementValidity(typedProjectFacts?.request || typedProjectFacts);
  },
});

registerDomainEngineAdapter('calibration_measurement_validity', calibrationMeasurementValidityAdapter);
