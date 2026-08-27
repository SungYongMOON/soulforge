// Reliability and Maintainability Domain Compiler Adapter. It consumes only Core-normalised
// Profile bindings and produces deterministic candidate rule material. It never reads project
// sources, invokes RAG, or decides project applicability.
import types from 'node:util/types';

import {
  RELIABILITY_MAINTAINABILITY_EVIDENCE_KINDS,
  RELIABILITY_MAINTAINABILITY_RULES,
  RELIABILITY_MAINTAINABILITY_RULESET_REF,
  RELIABILITY_MAINTAINABILITY_RULESET_REVISION,
  RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA,
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
  isReliabilityMaintainabilityEvidenceKind,
} from '../rules/reliability_maintainability_rules.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { AUTHORITY_FAMILIES } from '../../../core/validators/authority.mjs';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import {
  assertRmOpaqueToken,
  assertRmPublicSafeLocator,
  assertRmPublicSafeString,
} from '../rules/reliability_maintainability_public_safe.mjs';

export const RM_COMPILER_ADAPTER_SCHEMA_VERSION =
  'soulforge.reliability_maintainability.compiler.v0';

export const RM_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: 'RM_PROFILE_BINDINGS_INVALID',
  OPERATION_UNSUPPORTED: 'RM_OPERATION_UNSUPPORTED',
  OPERATION_MALFORMED: 'RM_OPERATION_MALFORMED',
  RULE_MALFORMED: 'RM_RULE_MALFORMED',
  RULE_INVALID_FIELD: 'RM_RULE_INVALID_FIELD',
  RULE_SOURCE_REF_UNBOUND: 'RM_RULE_SOURCE_REF_UNBOUND',
  RULE_DUPLICATE_ID: 'RM_RULE_DUPLICATE_ID',
});

const CANONICAL_RM_RULE_FIELDS = Object.freeze([
  'allowed_evidence_kinds',
  'context_ref_fields',
  'required_authority_families',
  'rule_id',
  'source_locator',
  'source_modality',
  'source_ref',
  'sufficiency_fields',
]);

const PROFILE_BINDING_FIELDS = Object.freeze([
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

const KNOWN_AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((family) => family.key));
const PROTOTYPE_SENSITIVE_KEYS = new Set([
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
]);
const RM_RULE_ID = /^RM-[A-Za-z0-9_-]{1,60}$/u;
const TOKEN = /^[A-Za-z][A-Za-z0-9_]{0,127}$/u;
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /(?:^|[^A-Za-z0-9_])\/(?:tmp|temp|var|etc|opt|srv|usr|bin|sbin|lib|dev|proc|sys|root|home|users|mnt|media|private|data)\/\S/iu,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);

function refuse(code, message) {
  throw new ContractError(code, message);
}

function assertSafeString(value, fieldName, maxLength = 512) {
  return assertRmPublicSafeString(value, {
    code: RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
    field: fieldName,
    maxLength,
  });
}

function assertPlainData(value, depth = 0, ancestors = new Set()) {
  if (depth > 16) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'nested Profile data exceeds depth limit');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') {
    assertSafeString(value, 'Profile data', 2048);
    return;
  }
  if (!value || typeof value !== 'object' || types.isProxy(value)) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile bindings accept only plain JSON data; proxies, functions, and symbols are refused');
  }
  if (ancestors.has(value)) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'circular Profile data is refused');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile arrays must use Array.prototype');
      }
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
        refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile arrays must be dense and unnamed');
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile arrays may not contain accessors');
        }
        assertPlainData(descriptor.value, depth + 1, ancestors);
      }
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile records must use Object.prototype');
    }
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (typeof key !== 'string' || PROTOTYPE_SENSITIVE_KEYS.has(key)) {
        refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile record includes a prototype-sensitive key');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile records may not contain accessors or hidden fields');
      }
      assertPlainData(descriptor.value, depth + 1, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

// Compiler inputs arrive from caller-owned Profile bindings. Snapshot the full array before
// any `.length`, index, operation, or source-ref read so hostile getters/Proxies never run.
function snapshotProfileBindings(value) {
  const seen = new WeakSet();
  let values = 0;
  const walk = (current, depth, field) => {
    values += 1;
    if (values > 4096 || depth > 16) {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile bindings exceed bounded plain-data limits');
    }
    if (typeof current === 'string') return assertSafeString(current, field, 2048);
    if (typeof current === 'boolean' || typeof current === 'number' || current === null) return current;
    if (!current || typeof current !== 'object' || types.isProxy(current)) {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
        'Profile bindings accept only non-proxy plain JSON data');
    }
    if (seen.has(current)) {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding cycles and aliases are refused');
    }
    seen.add(current);
    const array = Array.isArray(current);
    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(current);
      descriptors = Object.getOwnPropertyDescriptors(current);
    } catch {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding reflection failed');
    }
    if ((array && prototype !== Array.prototype) || (!array && prototype !== Object.prototype)) {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding custom prototypes are refused');
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding symbol keys are refused');
    }
    const dataKeys = array ? keys.filter((key) => key !== 'length') : keys;
    if (array) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > 64) {
        refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding arrays must be bounded dense arrays');
      }
      const expected = new Set(Array.from({ length }, (_, index) => String(index)));
      if (dataKeys.length !== expected.size || dataKeys.some((key) => !expected.has(key))) {
        refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding arrays may not carry named or sparse entries');
      }
      const copy = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
          refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding array accessors are refused');
        }
        copy[index] = walk(descriptor.value, depth + 1, `${field}[${index}]`);
      }
      return copy;
    }
    if (dataKeys.length > 32) {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding object has too many fields');
    }
    const copy = {};
    for (const key of dataKeys) {
      if (PROTOTYPE_SENSITIVE_KEYS.has(key)) {
        refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding prototype-sensitive key is refused');
      }
      const descriptor = descriptors[key];
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
        refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding object accessors are refused');
      }
      Object.defineProperty(copy, key, {
        value: walk(descriptor.value, depth + 1, `${field}.${key}`),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return copy;
  };

  const snapshot = walk(value, 0, 'profileBindings');
  if (!Array.isArray(snapshot)) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profileBindings must be an array');
  }
  return snapshot;
}

function assertSortedUniqueStrings(values, fieldName, { allowNull = false, vocabulary = null } = {}) {
  if (!Array.isArray(values)) {
    refuse(RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, `${fieldName} must be an array`);
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null && allowNull) {
      // null sorts before every string and means source-native rather than omitted evidence.
    } else if (typeof value !== 'string' || !TOKEN.test(value)
      || (vocabulary && !vocabulary(value))) {
      refuse(RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
        `${fieldName} must contain only declared bounded vocabulary tokens`);
    }
    if (index > 0) {
      const prior = values[index - 1];
      const comparison = prior === null && value === null ? 0
        : (prior === null ? -1 : (value === null ? 1 : compareCodePoints(prior, value)));
      if (comparison >= 0) {
        refuse(RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
          `${fieldName} must be strictly sorted without duplicates (null first when allowed)`);
      }
    }
  }
}

const OPTIONAL_RM_RULE_FIELDS = Object.freeze(['claim_ceiling']);

function validateRmRule(rawRule, bindingSourceRefs, existingRuleIds) {
  if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
    refuse(RM_COMPILER_ERROR_CODES.RULE_MALFORMED, 'R&M rule must be a plain object');
  }
  const allowed = new Set([...CANONICAL_RM_RULE_FIELDS, ...OPTIONAL_RM_RULE_FIELDS]);
  for (const f of CANONICAL_RM_RULE_FIELDS) {
    if (!Object.hasOwn(rawRule, f)) {
      refuse(RM_COMPILER_ERROR_CODES.RULE_MALFORMED,
        `R&M rule must contain exactly canonical fields (${CANONICAL_RM_RULE_FIELDS.join(', ')})`);
    }
  }
  for (const k of Object.keys(rawRule)) {
    if (!allowed.has(k)) {
      refuse(RM_COMPILER_ERROR_CODES.RULE_MALFORMED,
        `R&M rule must contain exactly canonical fields (${CANONICAL_RM_RULE_FIELDS.join(', ')})`);
    }
  }
  if (rawRule.claim_ceiling !== undefined && rawRule.claim_ceiling !== 'observed') {
    refuse(RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, 'Profile rule claim_ceiling cannot exceed observed');
  }
  const ruleId = assertSafeString(rawRule.rule_id, 'rule_id', 128);
  if (!RM_RULE_ID.test(ruleId) || PROTOTYPE_SENSITIVE_KEYS.has(ruleId)) {
    refuse(RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD, 'rule_id must match the closed RM identifier grammar');
  }
  if (existingRuleIds.has(ruleId)) {
    refuse(RM_COMPILER_ERROR_CODES.RULE_DUPLICATE_ID, 'duplicate R&M rule_id is refused');
  }
  const sourceRef = assertRmOpaqueToken(rawRule.source_ref, {
    code: RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
    field: 'source_ref',
    maxLength: 256,
  });
  if (!bindingSourceRefs.includes(sourceRef)) {
    refuse(RM_COMPILER_ERROR_CODES.RULE_SOURCE_REF_UNBOUND,
      'a Profile-added R&M rule must cite a source_ref explicitly bound by that Profile');
  }
  const sourceLocator = assertRmPublicSafeLocator(rawRule.source_locator, {
    code: RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
    field: 'source_locator',
    maxLength: 512,
  });
  const sourceModality = assertSafeString(rawRule.source_modality, 'source_modality', 512);
  assertSortedUniqueStrings(rawRule.allowed_evidence_kinds, 'allowed_evidence_kinds', {
    allowNull: true,
    vocabulary: isReliabilityMaintainabilityEvidenceKind,
  });
  assertSortedUniqueStrings(rawRule.required_authority_families, 'required_authority_families', {
    vocabulary: (key) => KNOWN_AUTHORITY_KEYS.has(key),
  });
  assertSortedUniqueStrings(rawRule.context_ref_fields, 'context_ref_fields');
  assertSortedUniqueStrings(rawRule.sufficiency_fields, 'sufficiency_fields');
  const result = {
    rule_id: ruleId,
    source_ref: sourceRef,
    source_locator: sourceLocator,
    source_modality: sourceModality,
    allowed_evidence_kinds: Object.freeze([...rawRule.allowed_evidence_kinds]),
    required_authority_families: Object.freeze([...rawRule.required_authority_families]),
    context_ref_fields: Object.freeze([...rawRule.context_ref_fields]),
    sufficiency_fields: Object.freeze([...rawRule.sufficiency_fields]),
  };
  if (rawRule.claim_ceiling !== undefined) {
    result.claim_ceiling = 'observed';
  }
  return Object.freeze(result);
}

function validateProfileBinding(rawBinding, expectedOrder, existingKinds) {
  assertPlainData(rawBinding);
  const keys = Object.keys(rawBinding).sort(compareCodePoints);
  const expected = [...PROFILE_BINDING_FIELDS].sort(compareCodePoints);
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile binding has unexpected or missing provenance fields');
  }
  if (rawBinding.schema_version !== 'soulforge.engineering_profile_binding.v0') {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding schema_version is invalid');
  }
  if (rawBinding.domain_engine_id !== 'reliability_maintainability') {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile binding must name domain_engine_id "reliability_maintainability"');
  }
  const kind = rawBinding.profile_kind;
  if (kind !== 'organization' && kind !== 'project' || existingKinds.has(kind)) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile kind must be unique organization/project');
  }
  const requiredOrder = kind === 'organization' ? 0 : (existingKinds.has('organization') ? 1 : 0);
  if (rawBinding.order !== expectedOrder || rawBinding.order !== requiredOrder
      || (kind === 'organization' && existingKinds.has('project'))) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding order must preserve organization then project');
  }
  const profileId = assertRmOpaqueToken(rawBinding.profile_id, {
    code: RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
    field: 'profile_id',
    maxLength: 128,
  });
  const revision = assertRmOpaqueToken(rawBinding.revision_or_hash, {
    code: RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
    field: 'revision_or_hash',
    maxLength: 128,
  });
  const basePin = assertRmOpaqueToken(rawBinding.extends_or_base_pin, {
    code: RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
    field: 'extends_or_base_pin',
    maxLength: 128,
  });
  if (revision === 'unversioned') {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile revision_or_hash cannot be unversioned');
  }
  if (!Array.isArray(rawBinding.source_refs) || rawBinding.source_refs.length === 0) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile source_refs must be a non-empty array');
  }
  const sourceRefs = [];
  const sourceRefSet = new Set();
  for (const sourceRef of rawBinding.source_refs) {
    const safeRef = assertRmOpaqueToken(sourceRef, {
      code: RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
      field: 'source_ref',
      maxLength: 256,
    });
    if (sourceRefSet.has(safeRef)) {
      refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile source_refs must not duplicate values');
    }
    sourceRefSet.add(safeRef);
    sourceRefs.push(safeRef);
  }
  if (!Array.isArray(rawBinding.operations)) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile operations must be an array');
  }
  const normalized = normalizeProfileOperations(rawBinding.operations);
  if (rawBinding.operation_digest !== normalized.operation_digest) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile operation_digest must equal the single Core canonical operation digest');
  }
  return {
    profile_kind: kind,
    profile_id: profileId,
    revision_or_hash: revision,
    extends_or_base_pin: basePin,
    operation_digest: normalized.operation_digest,
    source_refs: sourceRefs,
    order: rawBinding.order,
    operations: normalized.operations,
  };
}

export function calculateReliabilityMaintainabilityProfileOperationItemDigest(provenance, ruleId) {
  const material = {
    profile_id: provenance.profile_id,
    revision_or_hash: provenance.revision_or_hash,
    operation_digest: provenance.operation_digest,
    rule_id: ruleId,
    operation_index: provenance.operation_index,
  };
  return sha256Hex(`soulforge.reliability_maintainability.profile_rule.v0\n${canonicalise(material)}`);
}

function arrayOrderRules(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
    }
  }
  return rules;
}

export function compileReliabilityMaintainabilityRules(profileBindings = [], options = {}) {
  const admittedProfileBindings = snapshotProfileBindings(profileBindings);
  // Options are intentionally ignored. Domain compilation owns policy only; project evidence
  // and RAG are separate seams and cannot become hidden compiler inputs.
  void options;
  const existingKinds = new Set();
  const existingRuleIds = new Set(RELIABILITY_MAINTAINABILITY_RULES.map((rule) => rule.rule_id));
  const addedRules = [];
  const profileRuleProvenance = Object.create(null);

  for (let index = 0; index < admittedProfileBindings.length; index += 1) {
    const binding = validateProfileBinding(admittedProfileBindings[index], index, existingKinds);
    existingKinds.add(binding.profile_kind);
    for (let operationIndex = 0; operationIndex < binding.operations.length; operationIndex += 1) {
      const operation = binding.operations[operationIndex];
      assertPlainData(operation);
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
        refuse(RM_COMPILER_ERROR_CODES.OPERATION_MALFORMED, 'Profile operation must be a plain object');
      }
      const operationKeys = Object.keys(operation).sort(compareCodePoints);
      if (operationKeys.length !== 2 || operationKeys[0] !== 'op' || operationKeys[1] !== 'rule'
          || operation.op !== 'add') {
        if (operation.op !== 'add') {
          refuse(RM_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED,
            `R&M compiler supports only add operations, got "${operation.op}"`);
        }
        refuse(RM_COMPILER_ERROR_CODES.OPERATION_MALFORMED, 'add operation must contain exactly op and rule');
      }
      const rule = validateRmRule(operation.rule, binding.source_refs, existingRuleIds);
      existingRuleIds.add(rule.rule_id);
      addedRules.push(rule);
      const provenanceRecord = {
        profile_kind: binding.profile_kind,
        profile_id: binding.profile_id,
        revision_or_hash: binding.revision_or_hash,
        extends_or_base_pin: binding.extends_or_base_pin,
        operation_digest: binding.operation_digest,
        source_refs: Object.freeze([...binding.source_refs]),
        order: binding.order,
        operation_index: operationIndex,
      };
      const operationItemDigest = calculateReliabilityMaintainabilityProfileOperationItemDigest(provenanceRecord, rule.rule_id);
      Object.defineProperty(profileRuleProvenance, rule.rule_id, {
        value: Object.freeze({
          ...provenanceRecord,
          operation_item_digest: operationItemDigest,
        }),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
  }

  if (addedRules.length !== Object.keys(profileRuleProvenance).length) {
    refuse(RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'every Profile-added rule must have exactly one provenance record');
  }
  if (addedRules.length === 0) {
    return Object.freeze({
      effective_rule_set: Object.freeze({
        schema_version: RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA,
        ruleset_ref: RELIABILITY_MAINTAINABILITY_RULESET_REF,
        source_packet_ref: RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
        rules: RELIABILITY_MAINTAINABILITY_RULES,
      }),
      rule_count: RELIABILITY_MAINTAINABILITY_RULES.length,
      profile_rule_provenance: Object.freeze(Object.create(null)),
    });
  }

  const rules = [...RELIABILITY_MAINTAINABILITY_RULES, ...addedRules]
    .sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  const frozenProvenance = Object.freeze(profileRuleProvenance);
  const digestMaterial = {
    schema_version: RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA,
    revision: RELIABILITY_MAINTAINABILITY_RULESET_REVISION,
    source_packet_ref: RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
    base_ruleset_ref: RELIABILITY_MAINTAINABILITY_RULESET_REF,
    rules: rules.map(({ allowed_evidence_kinds, ...rule }) => ({
      ...rule,
      allowed_evidence_mappings: allowed_evidence_kinds.map((evidence_kind) => (
        evidence_kind === null ? { source_native: true } : { evidence_kind }
      )),
    })),
    profile_rule_provenance: frozenProvenance,
  };
  const derivedDigest = sha256Hex(
    `soulforge.reliability_maintainability.ruleset.derived.digest.v0\n${canonicalise(digestMaterial, {
      ...arrayOrderRules(digestMaterial),
      rules: 'sorted_by:rule_id',
    })}`,
  );
  return Object.freeze({
    effective_rule_set: Object.freeze({
      schema_version: RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA,
      ruleset_ref: Object.freeze({
        entity_id: 'reliability-maintainability-ruleset-derived-v0',
        revision_id: `derived:${derivedDigest.slice(0, 16)}`,
        content_id: `sha256:${derivedDigest}`,
        content_hash_alg: 'sha256',
      }),
      source_packet_ref: RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
      rules: Object.freeze(rules),
      profile_rule_provenance: frozenProvenance,
    }),
    rule_count: rules.length,
    profile_rule_provenance: frozenProvenance,
  });
}

export const reliabilityMaintainabilityCompilerAdapter = Object.freeze({
  domain_engine_id: 'reliability_maintainability',
  revision: RM_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile(profileBindings = [], options = {}) {
    return compileReliabilityMaintainabilityRules(profileBindings, options);
  },
  evaluate() {
    throw new ContractError(
      'RM_EVALUATION_EVALUATOR_REQUIRED',
      'Reliability and Maintainability evaluation requires the bound evaluator adapter',
    );
  },
});

// Exported only for hostile tests and manual vocabulary inspection; callers must not derive
// project truth from this list.
export const RM_COMPILER_VOCABULARY = RELIABILITY_MAINTAINABILITY_EVIDENCE_KINDS;
