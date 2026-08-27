import {
  arrayOrderRules,
  COMPILATION_TRACE_SCHEMA_VERSION,
  EFFECTIVE_RULE_SET_SCHEMA_VERSION,
  registerDomainEngineAdapter,
  withoutNulls,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { canonicalise } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import {
  MANUFACTURING_READINESS_RULES,
  MANUFACTURING_READINESS_RULESET_REF,
  MANUFACTURING_READINESS_RULESET_SCHEMA,
  MANUFACTURING_READINESS_SOURCE_INVENTORY_REF,
  MANUFACTURING_READINESS_SOURCE_PACKET_REF,
} from '../rules/manufacturing_readiness_rules.mjs';
import { manufacturingReadinessCompilerAdapter } from '../compiler/manufacturing_readiness_compiler_adapter.mjs';
import {
  assessManufacturingReadiness,
  MANUFACTURING_READINESS_DOMAIN_INPUT_SCHEMA,
} from './manufacturing_readiness.mjs';
import {
  compareCanonicalUtcInstants,
  parseCanonicalUtcInstant,
  snapshotPublicData,
} from '../validators/manufacturing_readiness_input_admission.mjs';

export const MR_EVALUATOR_ADAPTER_SCHEMA_VERSION = 'soulforge.manufacturing_readiness.evaluator.v0';
export const MR_EVALUATOR_ADAPTER_ERROR_CODES = Object.freeze({
  PROFILE_EVALUATION_UNSUPPORTED: 'MR_PROFILE_EVALUATION_UNSUPPORTED',
  EFFECTIVE_RULESET_INVALID: 'MR_EFFECTIVE_RULESET_INVALID',
  TYPED_PROJECT_FACTS_INVALID: 'MR_TYPED_PROJECT_FACTS_INVALID',
  EVALUATION_INPUT_REQUIRED: 'MR_EVALUATION_INPUT_REQUIRED',
});
const TYPED_PROJECT_FACTS_SCHEMA = 'soulforge.typed_project_facts.v0';
const TYPED_PROJECT_FACTS_FIELDS = Object.freeze([
  'schema_version',
  'project_binding_ref',
  'facts',
  'facts_digest',
  'valid_at',
  'known_at',
]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const REF_FIELDS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const BASE_RULESET_FIELDS = Object.freeze([
  'schema_version',
  'ruleset_ref',
  'source_packet_ref',
  'source_inventory_ref',
  'rules',
  'profile_rule_provenance',
]);
const EFFECTIVE_RULE_WRAPPER_FIELDS = Object.freeze([
  'schema_version',
  'domain_engine_id',
  'effective_rule_set',
  'compilation_trace',
  'rule_count',
  'assembly_digest',
]);
const COMPILATION_TRACE_FIELDS = Object.freeze([
  'schema_version',
  'domain_engine_id',
  'domain_adapter_revision',
  'organization_trace',
  'project_trace',
  'profiles',
  'compilation_scope',
  'effective_ruleset_digest',
  'rule_count',
]);
const RULE_FIELDS = Object.freeze([
  'rule_id',
  'facet_id',
  'source_refs',
  'source_locators',
  'required_evidence_states',
]);
const PROFILE_PROVENANCE_FIELDS = Object.freeze([
  'profile_kind',
  'profile_id',
  'revision_or_hash',
  'extends_or_base_pin',
  'operation_digest',
  'source_refs',
  'order',
]);
const PUBLIC_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/u;

function hasExactFields(value, fields) {
  return isPlainObject(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sameRef(left, right) {
  return hasExactFields(left, REF_FIELDS) && right
    && left.entity_id === right.entity_id
    && left.revision_id === right.revision_id
    && left.content_id === right.content_id
    && left.content_hash_alg === right.content_hash_alg;
}

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameBaseRule(candidate, expected) {
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    && Object.getPrototypeOf(candidate) === Object.prototype
    && Object.keys(candidate).length === RULE_FIELDS.length
    && RULE_FIELDS.every((field) => Object.hasOwn(candidate, field))
    && candidate.rule_id === expected.rule_id
    && candidate.facet_id === expected.facet_id
    && sameStringArray(candidate.source_refs, expected.source_refs)
    && sameStringArray(candidate.source_locators, expected.source_locators)
    && sameStringArray(candidate.required_evidence_states, expected.required_evidence_states);
}

function hasExactProfileProvenance(ruleset) {
  const provenance = ruleset.profile_rule_provenance;
  const baseRuleIds = new Set(MANUFACTURING_READINESS_RULES.map((rule) => rule.rule_id));
  const derivedRuleIds = new Set();
  for (const rule of ruleset.rules) {
    if (!isPlainObject(rule) || typeof rule.rule_id !== 'string') return false;
    if (!baseRuleIds.has(rule.rule_id)) derivedRuleIds.add(rule.rule_id);
  }
  const provenanceRuleIds = Object.keys(provenance);
  if (provenanceRuleIds.length !== derivedRuleIds.size) return false;
  for (const ruleId of provenanceRuleIds) {
    const entry = provenance[ruleId];
    if (!PUBLIC_TOKEN.test(ruleId) || !derivedRuleIds.has(ruleId)
        || !hasExactFields(entry, PROFILE_PROVENANCE_FIELDS)
        || !['organization', 'project'].includes(entry.profile_kind)
        || !['profile_id', 'revision_or_hash', 'extends_or_base_pin', 'operation_digest']
          .every((field) => typeof entry[field] === 'string' && PUBLIC_TOKEN.test(entry[field]))
        || !Number.isSafeInteger(entry.order) || entry.order < 0
        || !Array.isArray(entry.source_refs) || entry.source_refs.length === 0
        || new Set(entry.source_refs).size !== entry.source_refs.length
        || entry.source_refs.some((sourceRef) => typeof sourceRef !== 'string' || !PUBLIC_TOKEN.test(sourceRef))) {
      return false;
    }
  }
  return true;
}

function unwrapCoreEffectiveRuleWrapper(effectiveRuleSet) {
  if (!isPlainObject(effectiveRuleSet) || !Object.hasOwn(effectiveRuleSet, 'effective_rule_set')) return effectiveRuleSet;
  const trace = effectiveRuleSet.compilation_trace;
  if (!hasExactFields(effectiveRuleSet, EFFECTIVE_RULE_WRAPPER_FIELDS)
      || !hasExactFields(trace, COMPILATION_TRACE_FIELDS)
      || effectiveRuleSet.schema_version !== EFFECTIVE_RULE_SET_SCHEMA_VERSION
      || effectiveRuleSet.domain_engine_id !== 'manufacturing_readiness'
      || trace.schema_version !== COMPILATION_TRACE_SCHEMA_VERSION
      || trace.domain_engine_id !== 'manufacturing_readiness'
      || trace.domain_adapter_revision !== manufacturingReadinessCompilerAdapter.revision
      || !Array.isArray(trace.profiles)
      || !isPlainObject(trace.compilation_scope)
      || ![trace.organization_trace, trace.project_trace].every((entry) => entry === null || isPlainObject(entry))
      || !Number.isSafeInteger(effectiveRuleSet.rule_count)
      || effectiveRuleSet.rule_count < 0
      || trace.rule_count !== effectiveRuleSet.rule_count
      || !SHA256_HEX.test(effectiveRuleSet.assembly_digest)
      || !SHA256_HEX.test(trace.effective_ruleset_digest)
      || !isPlainObject(effectiveRuleSet.effective_rule_set)
      || !Array.isArray(effectiveRuleSet.effective_rule_set.rules)
      || effectiveRuleSet.effective_rule_set.rules.length !== effectiveRuleSet.rule_count) {
    throw new ContractError(
      MR_EVALUATOR_ADAPTER_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      'Core effective-rule wrapper must use the exact closed shape',
    );
  }
  const cleanRules = withoutNulls(effectiveRuleSet.effective_rule_set);
  const expectedDigest = sha256Hex(
    `soulforge.effective_rule_set.v0\n${canonicalise(cleanRules, arrayOrderRules(cleanRules))}`,
  );
  if (effectiveRuleSet.assembly_digest !== expectedDigest
      || trace.effective_ruleset_digest !== expectedDigest) {
    throw new ContractError(
      MR_EVALUATOR_ADAPTER_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      'Core effective-rule wrapper digest does not match the enclosed ruleset',
    );
  }
  return effectiveRuleSet.effective_rule_set;
}

function verifyBaseRuleset(effectiveRuleSet) {
  const ruleset = unwrapCoreEffectiveRuleWrapper(effectiveRuleSet);
  if (!hasExactFields(ruleset, BASE_RULESET_FIELDS)
      || !Array.isArray(ruleset.rules)
      || !isPlainObject(ruleset.profile_rule_provenance)
      || !hasExactFields(ruleset.ruleset_ref, REF_FIELDS)
      || !hasExactFields(ruleset.source_packet_ref, REF_FIELDS)
      || !hasExactFields(ruleset.source_inventory_ref, REF_FIELDS)) {
    throw new ContractError(
      MR_EVALUATOR_ADAPTER_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      'base manufacturing ruleset must use the exact closed base shape',
    );
  }
  if (!hasExactProfileProvenance(ruleset)) {
    throw new ContractError(
      MR_EVALUATOR_ADAPTER_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      'manufacturing Profile provenance must use the exact closed derived shape',
    );
  }
  if (Object.keys(ruleset.profile_rule_provenance).length !== 0) {
    throw new ContractError(
      MR_EVALUATOR_ADAPTER_ERROR_CODES.PROFILE_EVALUATION_UNSUPPORTED,
      'E05 evaluator accepts only the exact base ruleset; derived Profile rules are held for a later evaluator revision',
    );
  }
  if (ruleset.schema_version !== MANUFACTURING_READINESS_RULESET_SCHEMA
      || !sameRef(ruleset.ruleset_ref, MANUFACTURING_READINESS_RULESET_REF)
      || !sameRef(ruleset.source_packet_ref, MANUFACTURING_READINESS_SOURCE_PACKET_REF)
      || !sameRef(ruleset.source_inventory_ref, MANUFACTURING_READINESS_SOURCE_INVENTORY_REF)
      || ruleset.rules.length !== MANUFACTURING_READINESS_RULES.length) {
    throw new ContractError(
      MR_EVALUATOR_ADAPTER_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      'base manufacturing ruleset does not match the locked base identity',
    );
  }
  for (let index = 0; index < MANUFACTURING_READINESS_RULES.length; index += 1) {
    if (!sameBaseRule(ruleset.rules[index], MANUFACTURING_READINESS_RULES[index])) {
      throw new ContractError(
        MR_EVALUATOR_ADAPTER_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
        'base manufacturing ruleset does not match the locked rule semantics',
      );
    }
  }
}

function typedFactsFail(message) {
  throw new ContractError(MR_EVALUATOR_ADAPTER_ERROR_CODES.TYPED_PROJECT_FACTS_INVALID, message);
}

function assertExactTypedFactsEnvelope(typedProjectFacts) {
  if (!typedProjectFacts || typeof typedProjectFacts !== 'object' || Array.isArray(typedProjectFacts)
      || Object.getPrototypeOf(typedProjectFacts) !== Object.prototype
      || Object.keys(typedProjectFacts).length !== TYPED_PROJECT_FACTS_FIELDS.length
      || !TYPED_PROJECT_FACTS_FIELDS.every((field) => Object.hasOwn(typedProjectFacts, field))) {
    typedFactsFail('typed Project Facts must use the canonical closed envelope');
  }
  const validAt = parseCanonicalUtcInstant(typedProjectFacts.valid_at);
  const knownAt = parseCanonicalUtcInstant(typedProjectFacts.known_at);
  if (typedProjectFacts.schema_version !== TYPED_PROJECT_FACTS_SCHEMA
      || !Array.isArray(typedProjectFacts.facts)
      || typeof typedProjectFacts.facts_digest !== 'string'
      || !SHA256_HEX.test(typedProjectFacts.facts_digest)
      || !validAt
      || !knownAt
      || compareCanonicalUtcInstants(knownAt, validAt) < 0) {
    typedFactsFail('typed Project Facts have an invalid schema, digest, or temporal pin');
  }
  const expectedDigest = sha256Hex(
    `soulforge.project_observations.v0\n${canonicalise(typedProjectFacts.facts, arrayOrderRules(typedProjectFacts.facts))}`,
  );
  if (typedProjectFacts.facts_digest !== expectedDigest) {
    typedFactsFail('typed Project Facts digest does not match the supplied fact rows');
  }
}

function typedFactsToManufacturingRequest(typedProjectFacts) {
  assertExactTypedFactsEnvelope(typedProjectFacts);
  if (!typedProjectFacts.project_binding_ref || typeof typedProjectFacts.project_binding_ref !== 'object') {
    typedFactsFail('typed Project Facts require an exact Project Binding');
  }
  const request = {
    schema_version: MANUFACTURING_READINESS_DOMAIN_INPUT_SCHEMA,
    project_binding_ref: { ...typedProjectFacts.project_binding_ref },
    facets: typedProjectFacts.facts.map((fact) => ({ ...fact })),
  };
  try {
    return assessManufacturingReadiness(request);
  } catch (error) {
    if (error instanceof ContractError) {
      throw new ContractError(
        MR_EVALUATOR_ADAPTER_ERROR_CODES.TYPED_PROJECT_FACTS_INVALID,
        'typed Project Facts do not contain the exact closed manufacturing facet rows',
      );
    }
    throw error;
  }
}

function evaluateTypedProjectFacts(typedProjectFacts) {
  try {
    return typedFactsToManufacturingRequest(typedProjectFacts);
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError(
      MR_EVALUATOR_ADAPTER_ERROR_CODES.TYPED_PROJECT_FACTS_INVALID,
      'typed Project Facts could not be evaluated as manufacturing facets',
    );
  }
}

function assertEmptyIgnoredCoreArgument(value, label) {
  const admitted = snapshotPublicData(value, {
    code: MR_EVALUATOR_ADAPTER_ERROR_CODES.EVALUATION_INPUT_REQUIRED,
    label,
    maxDepth: 4,
    maxArrayLength: 0,
    maxStringLength: 128,
  });
  if (Array.isArray(admitted) || !admitted || typeof admitted !== 'object'
      || Object.getPrototypeOf(admitted) !== Object.prototype
      || Object.keys(admitted).length !== 0) {
    throw new ContractError(
      MR_EVALUATOR_ADAPTER_ERROR_CODES.EVALUATION_INPUT_REQUIRED,
      `${label} is not owned by the Manufacturing Readiness adapter and must be empty`,
    );
  }
}

export const manufacturingReadinessAdapter = Object.freeze({
  ...manufacturingReadinessCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    assertEmptyIgnoredCoreArgument(authority, 'manufacturing evaluation authority');
    assertEmptyIgnoredCoreArgument(cutoffs, 'manufacturing evaluation cutoffs');
    const admittedRuleSet = snapshotPublicData(effectiveRuleSet, {
      code: MR_EVALUATOR_ADAPTER_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      label: 'manufacturing effective rule set',
      maxDepth: 16,
      maxArrayLength: 64,
      maxStringLength: 512,
    });
    const admittedTypedFacts = snapshotPublicData(typedProjectFacts, {
      code: MR_EVALUATOR_ADAPTER_ERROR_CODES.TYPED_PROJECT_FACTS_INVALID,
      label: 'typed manufacturing Project Facts',
      maxDepth: 16,
      maxArrayLength: 64,
      maxStringLength: 512,
    });
    verifyBaseRuleset(admittedRuleSet);
    return evaluateTypedProjectFacts(admittedTypedFacts);
  },
});

registerDomainEngineAdapter('manufacturing_readiness', manufacturingReadinessAdapter);
