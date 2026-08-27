import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import {
  MANUFACTURING_READINESS_RULES,
  MANUFACTURING_READINESS_RULESET_REF,
  MANUFACTURING_READINESS_RULESET_REVISION,
  MANUFACTURING_READINESS_SOURCE_INVENTORY_REF,
  MANUFACTURING_READINESS_RULESET_SCHEMA,
  MANUFACTURING_READINESS_SOURCE_PACKET_REF,
  isManufacturingReadinessFacetId,
} from '../rules/manufacturing_readiness_rules.mjs';
import {
  deepFreezePublicData,
  snapshotPublicData,
} from '../validators/manufacturing_readiness_input_admission.mjs';

export const MR_COMPILER_ADAPTER_SCHEMA_VERSION = 'soulforge.manufacturing_readiness.compiler.v0';
export const MR_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: 'MR_PROFILE_BINDINGS_INVALID',
  OPERATION_UNSUPPORTED: 'MR_OPERATION_UNSUPPORTED',
  OPERATION_MALFORMED: 'MR_OPERATION_MALFORMED',
  RULE_DUPLICATE_ID: 'MR_RULE_DUPLICATE_ID',
  RULE_SOURCE_REF_UNBOUND: 'MR_RULE_SOURCE_REF_UNBOUND',
});

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/u;
const ADD_RULE_FIELDS = Object.freeze(['rule_id', 'facet_id', 'source_ref', 'source_locator']);
const PROFILE_BINDING_FIELDS = Object.freeze([
  'schema_version',
  'profile_kind',
  'profile_id',
  'domain_engine_id',
  'revision_or_hash',
  'extends_or_base_pin',
  'operation_digest',
  'source_refs',
  'operations',
  'order',
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])(?:_workspaces|_workmeta|private-state)(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/iu,
  /\\\\[^\\]+/u,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /(?:^|[^A-Za-z0-9_])(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)[ \t]*[:=]/iu,
]);

function safeToken(value, field) {
  if (typeof value !== 'string' || !TOKEN.test(value)
      || FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${field} must be a bounded public-safe token`);
  }
  return value;
}

function exactKeys(value, keys, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
    fail(code, `${label} must contain exactly [${keys.join(', ')}]`);
  }
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

function addRule(rawRule, sourceRefs, existingRuleIds) {
  exactKeys(rawRule, ADD_RULE_FIELDS, MR_COMPILER_ERROR_CODES.OPERATION_MALFORMED, 'profile add rule');
  const rule_id = safeToken(rawRule.rule_id, 'rule_id');
  if (!rule_id.startsWith('MR-')) {
    fail(MR_COMPILER_ERROR_CODES.OPERATION_MALFORMED, 'profile rule_id must use the MR- prefix');
  }
  if (existingRuleIds.has(rule_id)) fail(MR_COMPILER_ERROR_CODES.RULE_DUPLICATE_ID, 'duplicate manufacturing rule_id');
  const facet_id = safeToken(rawRule.facet_id, 'facet_id');
  if (!isManufacturingReadinessFacetId(facet_id)) {
    fail(MR_COMPILER_ERROR_CODES.OPERATION_MALFORMED, 'profile rules must target an existing closed facet');
  }
  const source_ref = safeToken(rawRule.source_ref, 'source_ref');
  if (!sourceRefs.includes(source_ref)) {
    fail(MR_COMPILER_ERROR_CODES.RULE_SOURCE_REF_UNBOUND, 'profile rule source_ref must be pinned by its Profile binding');
  }
  const source_locator = safeToken(rawRule.source_locator, 'source_locator');
  existingRuleIds.add(rule_id);
  return Object.freeze({
    rule_id,
    facet_id,
    source_refs: Object.freeze([source_ref]),
    source_locators: Object.freeze([source_locator]),
    required_evidence_states: Object.freeze(['present', 'criteria_met']),
  });
}

function validateProfileBinding(binding, index, existingKinds) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)
      || Object.getPrototypeOf(binding) !== Object.prototype
      || Object.keys(binding).length !== PROFILE_BINDING_FIELDS.length
      || !PROFILE_BINDING_FIELDS.every((field) => Object.hasOwn(binding, field))
      || binding.schema_version !== 'soulforge.engineering_profile_binding.v0'
      || binding.domain_engine_id !== 'manufacturing_readiness'
      || !Array.isArray(binding.source_refs) || !Array.isArray(binding.operations)
      || !['organization', 'project'].includes(binding.profile_kind)
      || existingKinds.has(binding.profile_kind)) {
    fail(MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'manufacturing Profile binding is invalid');
  }
  if (!Number.isInteger(binding.order) || binding.order !== index) {
    fail(MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile binding order must be sequential');
  }
  const sourceRefs = binding.source_refs.map((ref) => safeToken(ref, 'source_ref'));
  if (sourceRefs.length === 0 || new Set(sourceRefs).size !== sourceRefs.length) {
    fail(MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'Profile source_refs must be non-empty and unique');
  }
  safeToken(binding.profile_id, 'profile_id');
  safeToken(binding.revision_or_hash, 'revision_or_hash');
  safeToken(binding.extends_or_base_pin, 'extends_or_base_pin');
  safeToken(binding.operation_digest, 'operation_digest');
  let normalizedOperations;
  try {
    normalizedOperations = normalizeProfileOperations(binding.operations);
  } catch {
    fail(MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile operations must satisfy the Core canonical operation contract');
  }
  if (binding.operation_digest !== normalizedOperations.operation_digest) {
    fail(MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
      'Profile operation_digest must match the Core canonical operation material');
  }
  if (binding.profile_kind === 'organization' && index !== 0) {
    fail(MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'organization Profile must precede project Profile');
  }
  existingKinds.add(binding.profile_kind);
  return {
    sourceRefs,
    operations: normalizedOperations.operations,
    operationDigest: normalizedOperations.operation_digest,
  };
}

function cloneRef(ref) {
  return { ...ref };
}

function cloneBaseRules() {
  return MANUFACTURING_READINESS_RULES.map((entry) => ({
    ...entry,
    source_refs: [...entry.source_refs],
    source_locators: [...entry.source_locators],
    required_evidence_states: [...entry.required_evidence_states],
  }));
}

export function compileManufacturingReadinessRules(profileBindings = []) {
  const admittedBindings = snapshotPublicData(profileBindings, {
    code: MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
    label: 'manufacturing Profile bindings',
    maxDepth: 12,
    maxArrayLength: 32,
    maxStringLength: 512,
  });
  if (!Array.isArray(admittedBindings)) {
    fail(MR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profileBindings must be an array');
  }
  const existingKinds = new Set();
  const existingRuleIds = new Set(MANUFACTURING_READINESS_RULES.map((rule) => rule.rule_id));
  const addedRules = [];
  const profile_rule_provenance = {};

  admittedBindings.forEach((binding, index) => {
    const { sourceRefs, operations, operationDigest } = validateProfileBinding(binding, index, existingKinds);
    operations.forEach((operation) => {
      exactKeys(operation, ['op', 'rule'], MR_COMPILER_ERROR_CODES.OPERATION_MALFORMED, 'Profile operation');
      if (operation.op !== 'add') {
        fail(MR_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED, 'manufacturing Profile compiler supports only add operations');
      }
      const added = addRule(operation.rule, sourceRefs, existingRuleIds);
      addedRules.push(added);
      profile_rule_provenance[added.rule_id] = Object.freeze({
        profile_kind: binding.profile_kind,
        profile_id: binding.profile_id,
        revision_or_hash: binding.revision_or_hash,
        extends_or_base_pin: binding.extends_or_base_pin,
        operation_digest: operationDigest,
        source_refs: Object.freeze([...sourceRefs]),
        order: binding.order,
      });
    });
  });

  if (addedRules.length === 0) {
    return deepFreezePublicData({
      effective_rule_set: {
        schema_version: MANUFACTURING_READINESS_RULESET_SCHEMA,
        ruleset_ref: cloneRef(MANUFACTURING_READINESS_RULESET_REF),
        source_packet_ref: cloneRef(MANUFACTURING_READINESS_SOURCE_PACKET_REF),
        source_inventory_ref: cloneRef(MANUFACTURING_READINESS_SOURCE_INVENTORY_REF),
        rules: cloneBaseRules(),
        profile_rule_provenance: {},
      },
      rule_count: MANUFACTURING_READINESS_RULES.length,
      profile_rule_provenance: {},
    });
  }

  const rules = [...cloneBaseRules(), ...addedRules]
    .sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  const material = {
    schema_version: MANUFACTURING_READINESS_RULESET_SCHEMA,
    revision: MANUFACTURING_READINESS_RULESET_REVISION,
    base_ruleset_ref: MANUFACTURING_READINESS_RULESET_REF,
    source_packet_ref: cloneRef(MANUFACTURING_READINESS_SOURCE_PACKET_REF),
    source_inventory_ref: cloneRef(MANUFACTURING_READINESS_SOURCE_INVENTORY_REF),
    rules,
    profile_rule_provenance,
  };
  const derivedDigest = sha256Hex(
    `soulforge.manufacturing_readiness.derived_ruleset.v0\n${canonicalise(material, arrayOrderRules(material))}`,
  );
  const ruleset_ref = Object.freeze({
    entity_id: 'manufacturing-readiness-ruleset-derived-v0',
    revision_id: `derived:${derivedDigest.slice(0, 16)}`,
    content_id: `sha256:${derivedDigest}`,
    content_hash_alg: 'sha256',
  });
  return deepFreezePublicData({
    effective_rule_set: {
      schema_version: MANUFACTURING_READINESS_RULESET_SCHEMA,
      ruleset_ref,
      source_packet_ref: cloneRef(MANUFACTURING_READINESS_SOURCE_PACKET_REF),
      source_inventory_ref: cloneRef(MANUFACTURING_READINESS_SOURCE_INVENTORY_REF),
      rules,
      profile_rule_provenance,
    },
    rule_count: rules.length,
    profile_rule_provenance,
  });
}

export const manufacturingReadinessCompilerAdapter = Object.freeze({
  domain_engine_id: 'manufacturing_readiness',
  revision: MR_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile(profileBindings = []) {
    return compileManufacturingReadinessRules(profileBindings);
  },
  evaluate() {
    throw new ContractError(
      'MR_EVALUATION_EVALUATOR_REQUIRED',
      'Manufacturing readiness evaluation requires the bound evaluator adapter',
    );
  },
});
