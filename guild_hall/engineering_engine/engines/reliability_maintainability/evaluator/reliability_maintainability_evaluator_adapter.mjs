// Reliability and Maintainability Domain Evaluator Adapter. Base-source evaluation is pinned
// to the reviewed candidate ruleset; added Profile rules compile with provenance but remain
// non-executable until a later source packet and evaluator review explicitly cover them.
import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';
import { registerDomainEngineAdapter } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { reliabilityMaintainabilityCompilerAdapter } from '../compiler/reliability_maintainability_compiler_adapter.mjs';
import {
  RELIABILITY_MAINTAINABILITY_RULES,
  RELIABILITY_MAINTAINABILITY_RULESET_REF,
  RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA,
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
} from '../rules/reliability_maintainability_rules.mjs';
import { assessReliabilityMaintainability } from './reliability_maintainability.mjs';

export const RM_EVALUATOR_ADAPTER_SCHEMA_VERSION =
  'soulforge.reliability_maintainability.evaluator.v0';

const ALLOWED_RULESET_KEYS = Object.freeze([
  'schema_version',
  'ruleset_ref',
  'source_packet_ref',
  'rules',
  'profile_rule_provenance',
]);

function assertPlainObjectNoAccessor(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ContractError('RM_EFFECTIVE_RULESET_INVALID', `${label} must be a plain non-proxy object`);
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor'
        || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new ContractError('RM_EFFECTIVE_RULESET_INVALID',
        `${label} may not contain prototype-sensitive, accessor, or hidden fields`);
    }
  }
}

function exactRefMatches(actual, expected) {
  return actual && typeof actual === 'object'
    && actual.entity_id === expected.entity_id
    && actual.revision_id === expected.revision_id
    && actual.content_id === expected.content_id
    && actual.content_hash_alg === expected.content_hash_alg;
}

export function verifyReliabilityMaintainabilityBaseRuleset(effectiveRuleSet) {
  assertPlainObjectNoAccessor(effectiveRuleSet, 'effectiveRuleSet');
  const ruleset = effectiveRuleSet.effective_rule_set || effectiveRuleSet;
  assertPlainObjectNoAccessor(ruleset, 'unwrapped effective rule set');
  for (const key of Object.keys(ruleset)) {
    if (!ALLOWED_RULESET_KEYS.includes(key)) {
      throw new ContractError('RM_EFFECTIVE_RULESET_INVALID', 'unexpected field in effective rule set');
    }
  }
  if (ruleset.schema_version !== RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA) {
    throw new ContractError('RM_EFFECTIVE_RULESET_INVALID', 'R&M ruleset schema_version does not match the candidate');
  }
  if (!exactRefMatches(ruleset.ruleset_ref, RELIABILITY_MAINTAINABILITY_RULESET_REF)
      || !exactRefMatches(ruleset.source_packet_ref, RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF)) {
    throw new ContractError('RM_PROFILE_EVALUATION_UNSUPPORTED',
      'E06 evaluator is pinned to the base source packet/ruleset; derived Profile rules require a reviewed evaluator revision');
  }
  if (ruleset.profile_rule_provenance && Object.keys(ruleset.profile_rule_provenance).length > 0) {
    throw new ContractError('RM_PROFILE_EVALUATION_UNSUPPORTED',
      'E06 evaluator does not execute Profile-added rules without source/evaluator review');
  }
  if (!Array.isArray(ruleset.rules) || ruleset.rules.length !== RELIABILITY_MAINTAINABILITY_RULES.length
      || JSON.stringify(ruleset.rules) !== JSON.stringify(RELIABILITY_MAINTAINABILITY_RULES)) {
    throw new ContractError('RM_PROFILE_EVALUATION_UNSUPPORTED',
      'base R&M rule rows are missing, reordered, or semantically altered');
  }
  return true;
}

export const reliabilityMaintainabilityAdapter = Object.freeze({
  ...reliabilityMaintainabilityCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    void authority;
    void cutoffs;
    verifyReliabilityMaintainabilityBaseRuleset(effectiveRuleSet);
    const request = typedProjectFacts?.request || typedProjectFacts;
    return assessReliabilityMaintainability(request);
  },
});

registerDomainEngineAdapter('reliability_maintainability', reliabilityMaintainabilityAdapter);
