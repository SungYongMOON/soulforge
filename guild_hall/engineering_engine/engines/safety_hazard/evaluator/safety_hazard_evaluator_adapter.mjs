// Registered Core evaluator adapter. The base ruleset is the only evaluable candidate surface;
// a compiled Profile delta is deliberately held until its evaluation semantics are accepted.
import { registerDomainEngineAdapter } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { compareCodePoints } from '../../../core/validators/canonical.mjs';
import { safetyHazardCompilerAdapter } from '../compiler/safety_hazard_compiler_adapter.mjs';
import {
  SAFETY_HAZARD_RULES,
  SAFETY_HAZARD_RULESET_REF,
  SAFETY_HAZARD_RULESET_SCHEMA,
  SAFETY_HAZARD_SOURCE_PACKET_REF,
} from '../rules/safety_hazard_rules.mjs';
import { assessSafetyHazard } from './safety_hazard.mjs';

export const SAFETY_HAZARD_EVALUATOR_ADAPTER_SCHEMA_VERSION = 'soulforge.safety_hazard.evaluator.v0';

const RULE_FIELDS = Object.freeze([
  'lifecycle_statuses',
  'required_authority_families',
  'required_evidence_fields',
  'requires_human_authority_binding',
  'rule_id',
  'source_locator',
  'source_modality',
  'source_ref',
]);

const refEqual = (left, right) => left?.entity_id === right.entity_id
  && left?.revision_id === right.revision_id
  && left?.content_id === right.content_id
  && left?.content_hash_alg === right.content_hash_alg;

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ContractError('SH_EFFECTIVE_RULESET_INVALID', `${label} must be an ordinary object`);
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)
        || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new ContractError('SH_EFFECTIVE_RULESET_INVALID', `${label} has an unsafe or accessor-backed property`);
    }
  }
}

function verifyBaseRuleset(effectiveRuleSet) {
  assertPlainObject(effectiveRuleSet, 'effectiveRuleSet');
  const ruleSet = effectiveRuleSet.effective_rule_set || effectiveRuleSet;
  assertPlainObject(ruleSet, 'unwrapped effective rule set');
  if (ruleSet.schema_version !== SAFETY_HAZARD_RULESET_SCHEMA
      || !refEqual(ruleSet.ruleset_ref, SAFETY_HAZARD_RULESET_REF)
      || !refEqual(ruleSet.source_packet_ref, SAFETY_HAZARD_SOURCE_PACKET_REF)) {
    throw new ContractError('SH_PROFILE_EVALUATION_UNSUPPORTED',
      'Safety and Hazard evaluation is bound to the accepted base ruleset only');
  }
  const provenance = ruleSet.profile_rule_provenance || effectiveRuleSet.profile_rule_provenance;
  if (provenance && Object.keys(provenance).length > 0) {
    throw new ContractError('SH_PROFILE_EVALUATION_UNSUPPORTED',
      'Profile-derived safety hazard rules need separate evaluation acceptance');
  }
  if (!Array.isArray(ruleSet.rules) || ruleSet.rules.length !== SAFETY_HAZARD_RULES.length) {
    throw new ContractError('SH_PROFILE_EVALUATION_UNSUPPORTED', 'effective rules differ from the accepted base ruleset');
  }
  for (let index = 0; index < SAFETY_HAZARD_RULES.length; index += 1) {
    const actual = ruleSet.rules[index];
    const expected = SAFETY_HAZARD_RULES[index];
    assertPlainObject(actual, `rules[${index}]`);
    const keys = Object.keys(actual).sort(compareCodePoints);
    const wanted = [...RULE_FIELDS].sort(compareCodePoints);
    if (keys.length !== wanted.length || !keys.every((key, keyIndex) => key === wanted[keyIndex])
        || actual.rule_id !== expected.rule_id
        || actual.source_ref !== expected.source_ref
        || actual.source_locator !== expected.source_locator
        || actual.source_modality !== expected.source_modality
        || actual.requires_human_authority_binding !== expected.requires_human_authority_binding
        || !['required_evidence_fields', 'required_authority_families', 'lifecycle_statuses'].every((field) => (
          Array.isArray(actual[field])
          && actual[field].length === expected[field].length
          && actual[field].every((item, itemIndex) => item === expected[field][itemIndex])
        ))) {
      throw new ContractError('SH_PROFILE_EVALUATION_UNSUPPORTED', `base rule mismatch at index ${index}`);
    }
  }
}

export const safetyHazardAdapter = Object.freeze({
  ...safetyHazardCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    // The candidate evaluator reads no authority or cutoff payload directly; those are bound
    // inside the typed request. Keep the Core signature exact without inventing semantics.
    void authority;
    void cutoffs;
    verifyBaseRuleset(effectiveRuleSet);
    const request = typedProjectFacts?.request || typedProjectFacts;
    return assessSafetyHazard(request);
  },
});

registerDomainEngineAdapter('safety_hazard', safetyHazardAdapter);
