import types from 'node:util/types';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import {
  DATABASE_ENGINE_ID,
  DATABASE_REVIEW_AXES,
  DATABASE_RULE_KINDS,
  DATABASE_SOURCE_AUTHORITY,
  DATABASE_RULESET_SCHEMA,
  DBE_ERROR_CODES,
} from '../rules/database_engineering_vocabulary.mjs';
import {
  DATABASE_BASE_RULESET_REF,
  DATABASE_ENGINEERING_RULES,
  DATABASE_SOURCE_INVENTORY_REF,
} from '../rules/database_engineering_rules.mjs';

const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const RULE_FIELDS = Object.freeze([
  'axis',
  'claim_ceiling',
  'evidence_key',
  'kind',
  'platforms',
  'rule_id',
  'source_locator',
  'source_authority',
  'source_refs',
]);

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function refuse(code, message) {
  throw new ContractError(code, message);
}

// This package validates untrusted facts and profile rules before any accessor is read.
// `seen` rejects aliases as well as cycles: one supplied reference must describe one value.
export function cloneDatabasePlainData(value, path = 'value', ancestors = new Set(), seen = new Set()) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) {
    if (value === null) refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} must omit null rather than carry it`);
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || !Number.isInteger(value))) {
      refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} may contain only safe integer numbers`);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || types.isProxy(value)) {
    refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} must be plain JSON-like data`);
  }
  if (ancestors.has(value)) refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} is cyclic`);
  if (seen.has(value)) refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} aliases another supplied object`);
  ancestors.add(value);
  seen.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} array prototype is invalid`);
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9][0-9]*)$/u.test(key)))) {
        refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} contains sparse, named, or symbol array entries`);
      }
      const out = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path}[${index}] is accessor-backed or absent`);
        }
        out.push(cloneDatabasePlainData(descriptor.value, `${path}[${index}]`, ancestors, seen));
      }
      return out;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} object prototype is invalid`);
    const out = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || PROTOTYPE_KEYS.has(key)) refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path} has an unsafe key`);
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        refuse(DBE_ERROR_CODES.INPUT_INVALID, `${path}.${key} is accessor-backed or hidden`);
      }
      out[key] = cloneDatabasePlainData(descriptor.value, `${path}.${key}`, ancestors, seen);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

function assertExactKeys(row, expected, label) {
  const actual = Object.keys(row).sort(compareCodePoints);
  const target = [...expected].sort(compareCodePoints);
  if (actual.length !== target.length || actual.some((key, index) => key !== target[index])) {
    refuse(DBE_ERROR_CODES.OPERATION_INVALID, `${label} has an invalid closed key set`);
  }
}

function validateRuleRow(rawRule, permittedSourceRefs, existingRuleIds) {
  const rule = cloneDatabasePlainData(rawRule, 'profile rule');
  assertExactKeys(rule, RULE_FIELDS, 'profile rule');
  if (typeof rule.rule_id !== 'string' || !/^DBE-PROFILE-[A-Z0-9-]+$/u.test(rule.rule_id)) {
    refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'profile rule_id must be a closed DBE-PROFILE token');
  }
  if (existingRuleIds.has(rule.rule_id)) refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'profile rule_id duplicates an existing rule');
  if (!DATABASE_REVIEW_AXES.includes(rule.axis) || !DATABASE_RULE_KINDS.includes(rule.kind)) {
    refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'profile rule axis or kind is unsupported');
  }
  if (rule.source_authority !== 'profile_declared' || !DATABASE_SOURCE_AUTHORITY.includes(rule.source_authority)) {
    refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'profile rule must explicitly declare profile_declared authority');
  }
  if (rule.claim_ceiling !== 'observed') {
    refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'profile rule claim ceiling must remain observed until its source is independently inventory-backed');
  }
  if (rule.kind !== 'advisory') {
    refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'profile-declared rules are advisory and cannot mint a hard technical failure');
  }
  if (!Array.isArray(rule.platforms) || rule.platforms.length === 0 || rule.platforms.some((entry) => !['common', 'sqlite', 'postgresql'].includes(entry))) {
    refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'profile rule platforms must be a non-empty closed vocabulary');
  }
  if (!Array.isArray(rule.source_refs) || rule.source_refs.length === 0 || rule.source_refs.some((ref) => !permittedSourceRefs.includes(ref))) {
    refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'profile rule sources must be explicit Profile source refs');
  }
  for (const field of ['source_locator', 'evidence_key']) {
    if (typeof rule[field] !== 'string' || !rule[field]) refuse(DBE_ERROR_CODES.OPERATION_INVALID, `profile rule ${field} must be a non-empty string`);
  }
  return deepFreeze({
    ...rule,
    platforms: [...new Set(rule.platforms)].sort(compareCodePoints),
    source_refs: [...new Set(rule.source_refs)].sort(compareCodePoints),
  });
}

function profileRuleProvenance(binding, rule, operationIndex) {
  const material = {
    profile_id: binding.profile_id,
    revision_or_hash: binding.revision_or_hash,
    operation_digest: binding.operation_digest,
    rule_id: rule.rule_id,
    operation_index: operationIndex,
  };
  return deepFreeze({
    profile_kind: binding.profile_kind,
    profile_id: binding.profile_id,
    revision_or_hash: binding.revision_or_hash,
    extends_or_base_pin: binding.extends_or_base_pin,
    operation_digest: binding.operation_digest,
    source_refs: [...binding.source_refs],
    order: binding.order,
    operation_item_digest: sha256Hex(`soulforge.database_engineering.profile_rule.v0\n${canonicalise(material)}`),
  });
}

export function compileDatabaseEngineeringRules(profileBindings = [], compilationScope = {}) {
  if (!Array.isArray(profileBindings)) refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'Profile bindings must be an array');
  cloneDatabasePlainData(compilationScope, 'compilation scope');
  const rulesById = new Map(DATABASE_ENGINEERING_RULES.map((rule) => [rule.rule_id, rule]));
  const provenance = {};
  const appliedOperations = [];

  for (let bindingIndex = 0; bindingIndex < profileBindings.length; bindingIndex += 1) {
    const binding = profileBindings[bindingIndex];
    if (!binding || binding.domain_engine_id !== DATABASE_ENGINE_ID || !Array.isArray(binding.operations) || !Array.isArray(binding.source_refs)) {
      refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'Core-normalized DBE Profile Binding is invalid');
    }
    for (let operationIndex = 0; operationIndex < binding.operations.length; operationIndex += 1) {
      const operation = cloneDatabasePlainData(binding.operations[operationIndex], `profile operation ${bindingIndex}:${operationIndex}`);
      if (operation.op === 'add') {
        assertExactKeys(operation, ['op', 'rule'], 'add operation');
        const rule = validateRuleRow(operation.rule, binding.source_refs, rulesById);
        rulesById.set(rule.rule_id, rule);
        provenance[rule.rule_id] = profileRuleProvenance(binding, rule, operationIndex);
        appliedOperations.push({ op: 'add', rule_id: rule.rule_id });
      } else if (operation.op === 'disable') {
        assertExactKeys(operation, ['op', 'rule_id'], 'disable operation');
        if (typeof operation.rule_id !== 'string' || !rulesById.has(operation.rule_id)) {
          refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'disable must name an existing DBE rule');
        }
        rulesById.delete(operation.rule_id);
        delete provenance[operation.rule_id];
        appliedOperations.push({ op: 'disable', rule_id: operation.rule_id });
      } else {
        refuse(DBE_ERROR_CODES.OPERATION_INVALID, 'DBE Profile operations are closed to add and disable');
      }
    }
  }

  const rules = [...rulesById.values()].sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  const provenanceRows = Object.keys(provenance).sort(compareCodePoints).map((ruleId) => ({ rule_id: ruleId, ...provenance[ruleId] }));
  const material = {
    schema_version: DATABASE_RULESET_SCHEMA,
    domain_engine_id: DATABASE_ENGINE_ID,
    source_inventory_ref: DATABASE_SOURCE_INVENTORY_REF,
    base_ruleset_ref: DATABASE_BASE_RULESET_REF,
    rules,
    profile_rule_provenance: provenanceRows,
    applied_operations: appliedOperations,
  };
  const digest = sha256Hex(`soulforge.database_engineering.ruleset.derived.v0\n${canonicalise(material, {
    rules: 'sorted_by:rule_id',
    'rules[].platforms': 'insertion_ordered',
    'rules[].source_refs': 'insertion_ordered',
    profile_rule_provenance: 'sorted_by:rule_id',
    'profile_rule_provenance[].source_refs': 'insertion_ordered',
    applied_operations: 'insertion_ordered',
  })}`);
  const rulesetRef = appliedOperations.length === 0
    ? DATABASE_BASE_RULESET_REF
    : Object.freeze({
      entity_id: 'database-engineering-ruleset-derived-v0',
      revision_id: `derived:${digest.slice(0, 16)}`,
      content_id: `sha256:${digest}`,
      content_hash_alg: 'sha256',
    });
  const compiledProfileProvenance = {};
  for (const row of provenanceRows) {
    const { rule_id: ruleId, ...record } = row;
    compiledProfileProvenance[ruleId] = record;
  }
  return deepFreeze({
    effective_rule_set: {
      schema_version: DATABASE_RULESET_SCHEMA,
      domain_engine_id: DATABASE_ENGINE_ID,
      ruleset_ref: rulesetRef,
      source_inventory_ref: DATABASE_SOURCE_INVENTORY_REF,
      rules,
      profile_rule_provenance: compiledProfileProvenance,
    },
    rule_count: rules.length,
    profile_rule_provenance: compiledProfileProvenance,
  });
}

export const databaseEngineeringCompilerAdapter = Object.freeze({
  domain_engine_id: DATABASE_ENGINE_ID,
  revision: 'soulforge.database_engineering.compiler.v0',
  compile(profileBindings, compilationScope) {
    return compileDatabaseEngineeringRules(profileBindings, compilationScope);
  },
});
