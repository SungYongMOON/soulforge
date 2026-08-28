// Safety and Hazard Domain Compiler Adapter. The Core owns Profile normalisation; this
// adapter only validates bounded safety-domain additions and emits a derived ruleset.
import { AUTHORITY_FAMILIES } from '../../../core/validators/authority.mjs';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import {
  isSafetyHazardEvidenceField,
  isSafetyHazardLifecycleStatus,
} from '../vocabulary/safety_hazard_vocabulary.mjs';
import {
  SAFETY_HAZARD_RULES,
  SAFETY_HAZARD_RULESET_REF,
  SAFETY_HAZARD_RULESET_REVISION,
  SAFETY_HAZARD_RULESET_SCHEMA,
  SAFETY_HAZARD_SOURCE_PACKET_REF,
} from '../rules/safety_hazard_rules.mjs';

export const SAFETY_HAZARD_COMPILER_ADAPTER_SCHEMA_VERSION = 'soulforge.safety_hazard.compiler.v0';

export const SAFETY_HAZARD_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: 'SH_PROFILE_BINDINGS_INVALID',
  OPERATION_UNSUPPORTED: 'SH_OPERATION_UNSUPPORTED',
  OPERATION_MALFORMED: 'SH_OPERATION_MALFORMED',
  RULE_MALFORMED: 'SH_RULE_MALFORMED',
  RULE_INVALID_FIELD: 'SH_RULE_INVALID_FIELD',
  RULE_SOURCE_REF_UNBOUND: 'SH_RULE_SOURCE_REF_UNBOUND',
  RULE_DUPLICATE_ID: 'SH_RULE_DUPLICATE_ID',
});

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

const PROFILE_FIELDS = Object.freeze([
  'domain_engine_id',
  'extends_or_base_pin',
  'operation_digest',
  'operations',
  'order',
  'profile_id',
  'profile_kind',
  'revision_or_hash',
  'schema_version',
  'source_refs',
]);

const KNOWN_AUTHORITY_FAMILIES = new Set(AUTHORITY_FAMILIES.map((family) => family.key));
const RULE_ID = /^SH-[A-Z0-9]{2,12}-[0-9]{2}$/u;
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);

const isPlainObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertSafeString(value, field, maxLength = 512) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
      `${field} must be a bounded non-empty NFC string without controls`);
  }
  for (const pattern of FORBIDDEN_STRING_PATTERNS) {
    if (pattern.test(value)) {
      fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
        `${field} contains a forbidden private-path or secret sentinel`);
    }
  }
  return value;
}

function assertExactKeys(value, expected, label, code) {
  if (!isPlainObject(value)) fail(code, `${label} must be an ordinary object`);
  const actual = Object.keys(value).sort(compareCodePoints);
  const wanted = [...expected].sort(compareCodePoints);
  if (actual.length !== wanted.length || !actual.every((key, index) => key === wanted[index])) {
    fail(code, `${label} has unsupported or missing fields`);
  }
}

function assertDistinctKnownTokens(values, field, predicate) {
  if (!Array.isArray(values) || values.length === 0) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, `${field} must be a non-empty array`);
  }
  const seen = new Set();
  for (const value of values) {
    if (!predicate(value) || seen.has(value)) {
      fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, `${field} must contain distinct known tokens`);
    }
    seen.add(value);
  }
  return [...values];
}

function validateRule(rawRule, sourceRefs, existingRuleIds) {
  assertExactKeys(rawRule, RULE_FIELDS, 'safety hazard rule', SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_MALFORMED);
  const ruleId = assertSafeString(rawRule.rule_id, 'rule_id', 128);
  if (!RULE_ID.test(ruleId)) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, 'rule_id must match SH-<TOKEN>-<NN>');
  }
  if (existingRuleIds.has(ruleId)) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_DUPLICATE_ID, `duplicate safety hazard rule_id ${ruleId}`);
  }
  const sourceRef = assertSafeString(rawRule.source_ref, 'source_ref');
  if (!sourceRefs.includes(sourceRef)) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_SOURCE_REF_UNBOUND,
      'Profile-added rule source_ref must be explicitly present in profile source_refs');
  }
  const sourceLocator = assertSafeString(rawRule.source_locator, 'source_locator');
  const sourceModality = assertSafeString(rawRule.source_modality, 'source_modality');
  const requiredEvidenceFields = assertDistinctKnownTokens(
    rawRule.required_evidence_fields,
    'required_evidence_fields',
    isSafetyHazardEvidenceField,
  );
  const requiredAuthorityFamilies = assertDistinctKnownTokens(
    rawRule.required_authority_families,
    'required_authority_families',
    (value) => typeof value === 'string' && KNOWN_AUTHORITY_FAMILIES.has(value),
  );
  const lifecycleStatuses = assertDistinctKnownTokens(
    rawRule.lifecycle_statuses,
    'lifecycle_statuses',
    isSafetyHazardLifecycleStatus,
  );
  if (typeof rawRule.requires_human_authority_binding !== 'boolean') {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
      'requires_human_authority_binding must be boolean');
  }
  return deepFreeze({
    rule_id: ruleId,
    source_ref: sourceRef,
    source_locator: sourceLocator,
    source_modality: sourceModality,
    required_evidence_fields: requiredEvidenceFields,
    required_authority_families: requiredAuthorityFamilies,
    lifecycle_statuses: lifecycleStatuses,
    requires_human_authority_binding: rawRule.requires_human_authority_binding,
  });
}

function validateBinding(rawBinding, expectedOrder, seenKinds) {
  assertExactKeys(rawBinding, PROFILE_FIELDS, 'Profile binding', SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);
  if (rawBinding.domain_engine_id !== 'safety_hazard') {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile binding domain_engine_id must be safety_hazard');
  }
  if (!['organization', 'project'].includes(rawBinding.profile_kind) || seenKinds.has(rawBinding.profile_kind)) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile binding must use one ordered organization or project profile');
  }
  if (rawBinding.order !== expectedOrder) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding order is not sequential');
  }
  for (const field of ['profile_id', 'revision_or_hash', 'extends_or_base_pin', 'schema_version', 'operation_digest']) {
    assertSafeString(rawBinding[field], field);
  }
  if (!Array.isArray(rawBinding.source_refs) || rawBinding.source_refs.length === 0) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile source_refs must be non-empty');
  }
  const sourceRefs = rawBinding.source_refs.map((value) => assertSafeString(value, 'source_refs[]'));
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile source_refs must be unique');
  }
  const normalized = normalizeProfileOperations(rawBinding.operations);
  if (normalized.operation_digest !== rawBinding.operation_digest) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile operation_digest does not match the Core normalisation');
  }
  return {
    ...rawBinding,
    source_refs: sourceRefs,
    operations: normalized.operations,
  };
}

function arrayOrderRules(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
    }
  }
  return rules;
}

export function compileSafetyHazardRules(profileBindings = [], compilationScope = {}) {
  if (!Array.isArray(profileBindings)) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profileBindings must be an array');
  }
  if (!isPlainObject(compilationScope)) {
    fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'compilationScope must be an ordinary object');
  }
  // This candidate has no scope-sensitive rule selection. Retaining the Core scope argument
  // keeps the adapter seam explicit without letting a free-form scope alter source authority.
  void compilationScope;

  const existingRuleIds = new Set(SAFETY_HAZARD_RULES.map((rule) => rule.rule_id));
  const addedRules = [];
  const profileRuleProvenance = {};
  const seenKinds = new Set();

  for (let index = 0; index < profileBindings.length; index += 1) {
    const binding = validateBinding(profileBindings[index], index, seenKinds);
    seenKinds.add(binding.profile_kind);
    for (const operation of binding.operations) {
      if (!isPlainObject(operation) || typeof operation.op !== 'string') {
        fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.OPERATION_MALFORMED, 'Profile operation must declare a string op');
      }
      if (operation.op !== 'add') {
        fail(SAFETY_HAZARD_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED,
          `unsupported safety hazard Profile operation ${operation.op}`);
      }
      assertExactKeys(operation, ['op', 'rule'], 'Profile operation', SAFETY_HAZARD_COMPILER_ERROR_CODES.OPERATION_MALFORMED);
      const rule = validateRule(operation.rule, binding.source_refs, existingRuleIds);
      existingRuleIds.add(rule.rule_id);
      addedRules.push(rule);
      profileRuleProvenance[rule.rule_id] = deepFreeze({
        profile_kind: binding.profile_kind,
        profile_id: binding.profile_id,
        revision_or_hash: binding.revision_or_hash,
        extends_or_base_pin: binding.extends_or_base_pin,
        operation_digest: binding.operation_digest,
        source_refs: [...binding.source_refs],
        order: binding.order,
      });
    }
  }

  if (addedRules.length === 0) {
    return deepFreeze({
      effective_rule_set: {
        schema_version: SAFETY_HAZARD_RULESET_SCHEMA,
        ruleset_ref: SAFETY_HAZARD_RULESET_REF,
        source_packet_ref: SAFETY_HAZARD_SOURCE_PACKET_REF,
        rules: [...SAFETY_HAZARD_RULES],
      },
      rule_count: SAFETY_HAZARD_RULES.length,
      profile_rule_provenance: {},
    });
  }

  const rules = [...SAFETY_HAZARD_RULES, ...addedRules]
    .sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  const digestMaterial = {
    schema_version: SAFETY_HAZARD_RULESET_SCHEMA,
    revision: SAFETY_HAZARD_RULESET_REVISION,
    source_packet_ref: SAFETY_HAZARD_SOURCE_PACKET_REF,
    base_ruleset_ref: SAFETY_HAZARD_RULESET_REF,
    rules,
    profile_rule_provenance: profileRuleProvenance,
  };
  const derivedDigest = sha256Hex(canonicalise(digestMaterial, {
    ...arrayOrderRules(digestMaterial),
    rules: 'sorted_by:rule_id',
  }));
  const rulesetRef = deepFreeze({
    entity_id: 'safety-hazard-ruleset-derived-v0',
    revision_id: `derived:${derivedDigest.slice(0, 16)}`,
    content_id: `sha256:${derivedDigest}`,
    content_hash_alg: 'sha256',
  });

  return deepFreeze({
    effective_rule_set: {
      schema_version: SAFETY_HAZARD_RULESET_SCHEMA,
      ruleset_ref: rulesetRef,
      source_packet_ref: SAFETY_HAZARD_SOURCE_PACKET_REF,
      rules,
      profile_rule_provenance: profileRuleProvenance,
    },
    rule_count: rules.length,
    profile_rule_provenance: profileRuleProvenance,
  });
}

export const safetyHazardCompilerAdapter = Object.freeze({
  domain_engine_id: 'safety_hazard',
  revision: SAFETY_HAZARD_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile(profileBindings = [], compilationScope = {}) {
    return compileSafetyHazardRules(profileBindings, compilationScope);
  },
  evaluate() {
    throw new ContractError('SH_EVALUATION_EVALUATOR_REQUIRED',
      'Safety and Hazard evaluation must use the bound evaluator adapter');
  },
});
