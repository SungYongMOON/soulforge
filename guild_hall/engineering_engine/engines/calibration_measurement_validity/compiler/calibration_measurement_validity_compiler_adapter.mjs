import { createHash } from 'node:crypto';

import {
  CALIBRATION_MEASUREMENT_VALIDITY_RULES,
  CMV_RULESET_REF,
  CMV_RULESET_SCHEMA_VERSION,
  CMV_SOURCE_PACKET_REF,
} from '../rules/calibration_measurement_validity_rules.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { compileCmvSourceBoundProfileRequirements } from '../profile/calibration_measurement_validity_source_bound_profile.mjs';
import { canonicalizeCalibrationMeasurementValidity } from '../shared/calibration_measurement_validity_canonical_digest.mjs';

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

export function deriveCalibrationMeasurementValidityRulesetReference(requirements, profileRuleProvenance = {}, profileBindings = []) {
  if (requirements.length === 0 && profileBindings.length === 0 && Object.keys(profileRuleProvenance).length === 0) {
    return copyReference(CMV_RULESET_REF);
  }
  const profileSummaries = Array.isArray(profileBindings) ? profileBindings.map((b) => ({
    profile_kind: b.profile_kind,
    profile_id: b.profile_id,
    revision_or_hash: b.revision_or_hash,
    extends_or_base_pin: b.extends_or_base_pin,
    operation_digest: b.operation_digest,
    source_refs: b.source_refs,
    order: b.order,
  })) : [];
  const material = {
    base_ruleset_ref: CMV_RULESET_REF,
    profile_bindings_summary: profileSummaries,
    profile_rule_provenance: profileRuleProvenance,
    requirements,
  };
  const digest = createHash('sha256').update(
    `soulforge.calibration_measurement_validity.derived_ruleset.v1\n${canonicalizeCalibrationMeasurementValidity(material)}`,
  ).digest('hex');
  return {
    entity_id: 'ruleset:calibration_measurement_validity:derived',
    revision_id: `derived:${digest.slice(0, 16)}`,
    content_id: `sha256:${digest}`,
  };
}

export function compileCalibrationMeasurementValidityRules(profileBindings = [], compilationScope = {}) {
  if (!Array.isArray(profileBindings)) {
    throw new ContractError(
      CMV_COMPILER_ERROR_CODES.PROFILE_UNSUPPORTED,
      'profile bindings must be an array',
    );
  }
  if (!compilationScope || typeof compilationScope !== 'object' || Array.isArray(compilationScope)
      || (Object.getPrototypeOf(compilationScope) !== Object.prototype && Object.getPrototypeOf(compilationScope) !== null)) {
    throw new ContractError(
      CMV_COMPILER_ERROR_CODES.COMPILATION_SCOPE_INVALID,
      'compilation scope must be an ordinary object when supplied',
    );
  }
  if (Object.keys(compilationScope).length !== 0) {
    throw new ContractError(
      CMV_COMPILER_ERROR_CODES.COMPILATION_SCOPE_INVALID,
      'compilation scope must be empty; calibration_measurement_validity defines no compilation scope',
    );
  }
  if (profileBindings.some((binding) => binding?.schema_version !== 'soulforge.engineering_profile_binding.v0')) {
    throw new ContractError(
      CMV_COMPILER_ERROR_CODES.PROFILE_UNSUPPORTED,
      'CMV Profile compilation requires the existing Core-normalized Profile binding contract',
    );
  }

  const profileCompilation = compileCmvSourceBoundProfileRequirements(profileBindings);
  const effectiveRuleSet = {
    schema_version: CMV_RULESET_SCHEMA_VERSION,
    domain_engine_id: 'calibration_measurement_validity',
    ruleset_ref: deriveCalibrationMeasurementValidityRulesetReference(
      profileCompilation.requirements,
      profileCompilation.provenance,
      profileBindings,
    ),
    source_packet_ref: copyReference(CMV_SOURCE_PACKET_REF),
    profile_rule_provenance: profileCompilation.provenance,
    rules: CALIBRATION_MEASUREMENT_VALIDITY_RULES.map(copyRule),
    rule_count: CALIBRATION_MEASUREMENT_VALIDITY_RULES.length,
  };
  if (profileCompilation.requirements.length > 0) {
    effectiveRuleSet.source_bound_profile_requirements = profileCompilation.requirements;
  }
  return freezeDeep(effectiveRuleSet);
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
