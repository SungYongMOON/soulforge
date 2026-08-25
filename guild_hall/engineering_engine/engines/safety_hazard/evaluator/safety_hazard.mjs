// Deterministic Safety and Hazard evidence evaluator. It verifies bounded references only.
// It cannot read project material, calculate acceptability, close a hazard, or accept risk.
import { types } from 'node:util';

import {
  APPLICABILITY_COMPONENTS,
  AUTHORITY_FAMILIES,
  recordSourceConflict,
  resolveApplicability,
} from '../../../core/validators/authority.mjs';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { assertCanonCeiling, assertEvidenceCeiling } from '../../../core/validators/ceilings.mjs';
import { CONTRACT_REVISION } from '../../../core/validators/contract_config.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { validateBinding, validateManifest } from '../../../core/validators/module_binding.mjs';
import {
  isSafetyHazardEvidenceField,
  isSafetyHazardLifecycleStatus,
  isSafetyHazardPresenceState,
  isSafetyHazardProbabilityBand,
  isSafetyHazardRiskBand,
  isSafetyHazardSeverityBand,
} from '../vocabulary/safety_hazard_vocabulary.mjs';
import {
  SAFETY_HAZARD_RULES,
  SAFETY_HAZARD_RULESET_REF,
  SAFETY_HAZARD_RULESET_REVISION,
  SAFETY_HAZARD_SOURCE_PACKET_REF,
} from '../rules/safety_hazard_rules.mjs';

const DOMAIN_INPUT_SCHEMA = 'soulforge.safety_hazard.domain_input.v0';
const ASSESSMENT_SCHEMA = 'soulforge.safety_hazard.assessment.v0';
const DOMAIN_RESULT_SCHEMA = 'soulforge.safety_hazard.domain_result.v0';
const RECEIPT_SCHEMA = 'soulforge.safety_hazard.receipt.v0';
const MODULE_ID = 'soulforge.engineering_engine.safety_hazard';
const ADAPTER_REVISION = 'soulforge.safety_hazard.adapter.v0';
const MODULE_ABI_REVISION = '1.0.0';
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

export const SAFETY_HAZARD_ERROR_CODES = Object.freeze({
  INPUT_REFUSED: 'SH_INPUT_REFUSED',
  BINDING_REFUSED: 'SH_BINDING_REFUSED',
  ACCEPTANCE_AUTHORITY_NOT_HUMAN: 'SH_ACCEPTANCE_AUTHORITY_NOT_HUMAN',
});

const RULE_BY_ID = new Map(SAFETY_HAZARD_RULES.map((rule) => [rule.rule_id, rule]));
const SOURCE_IDS = Object.freeze([...new Set(SAFETY_HAZARD_RULES.map((rule) => rule.source_ref))]
  .sort(compareCodePoints));
const AUTHORITY_FAMILY = new Set(AUTHORITY_FAMILIES.map((family) => family.key));
const EFFECTS = Object.freeze({
  filesystem_reads: 0,
  filesystem_writes: 0,
  network_calls: 0,
  model_calls: 0,
  rag_queries: 0,
  wiki_queries: 0,
  erp_writes: 0,
  task_writes: 0,
  acceptance_actions: 0,
  human_authority_mutations: 0,
});

const ROOT_FIELDS = Object.freeze(['manifest', 'binding', 'domain_input', 'cutoffs']);
const BINDING_FIELDS = Object.freeze([
  'engine_contract_revision',
  'snapshot_schema_revision',
  'engine_ref',
  'project_binding_ref',
  'objective_ref',
  'policy_ref',
  'snapshot_ref',
  'engine_release_version',
  'engine_artifact_sha256',
  'module_abi_revision',
  'module_bindings',
  'common_knowledge_revision',
  'project_knowledge_revision',
  'policy_bundle_revision',
  'ruleset_revision',
  'accepted_context_generation',
  'acl_policy_revision',
  'execution_mode',
  'source_packet_ref',
  'ruleset_ref',
  'adapter_revision',
  'source_bindings',
  'accepted_rule_bindings',
]);
const CUTOFF_FIELDS = Object.freeze(['accepted_context_generation', 'assessment_cutoff_ref']);
const DOMAIN_INPUT_FIELDS = Object.freeze(['schema_version', 'rows']);
const ROW_REQUIRED_FIELDS = Object.freeze([
  'case_id',
  'rule_id',
  'applicability',
  'observation_attempted',
  'presence_state',
  'lifecycle_status',
  'authority_bindings',
  'evidence',
]);
const ROW_OPTIONAL_FIELDS = Object.freeze([
  'observation_attempt_ref',
  'not_applicable_basis_ref',
  'acceptance_authority_binding',
  'risk_characterization',
  'conflict_claims',
]);
const SOURCE_BINDING_FIELDS = Object.freeze(['source_id', 'metadata_revision_ref', 'body_revision_ref']);
const RULE_BINDING_FIELDS = Object.freeze(['rule_id', 'stage_ref', 'human_rule_acceptance_ref']);
const AUTHORITY_BINDING_FIELDS = Object.freeze(['authority_family', 'role_ref', 'delegation_ref', 'decision_ref']);
const HUMAN_AUTHORITY_BINDING_FIELDS = Object.freeze([
  'authority_kind',
  'named_human_authority_ref',
  'delegation_ref',
  'authority_scope_ref',
]);
const RISK_CHARACTERIZATION_FIELDS = Object.freeze(['severity', 'probability', 'risk']);
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
const FLOATING_REVISION = /(?:^|[-_.:])(latest|current|head|main|master|develop|development|dev|trunk|branch|release|stable|production|prod)(?:$|[-_.:])|[*^~<>]/iu;
const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX = Object.freeze({ depth: 16, values: 4096, array: 128, keys: 64, string: 512 });

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

function assertSafeString(value, field, code = SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, maxLength = MAX.string) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(code, `${field} must be a bounded non-empty NFC string without controls`);
  }
  for (const pattern of FORBIDDEN_STRING_PATTERNS) {
    if (pattern.test(value)) fail(code, `${field} contains a forbidden private-path or secret sentinel`);
  }
  return value;
}

function assertExactKeys(value, required, optional, field, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, `${field} must be an ordinary object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (keys.length > allowed.size || keys.some((key) => !allowed.has(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    fail(code, `${field} has unsupported or missing fields`);
  }
}

function snapshotPlainData(root) {
  let values = 0;
  const seen = new Set();
  const copy = (value, depth, field) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'input exceeds bounded plain-data limits');
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return assertSafeString(value, field);
    if (typeof value !== 'object' || types.isProxy(value) || seen.has(value)) {
      fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, `${field} must be acyclic plain JSON data`);
    }
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX.array) {
          fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, `${field} must be a bounded ordinary array`);
        }
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors);
        if (keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
          fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, `${field} contains sparse, named, or symbol array fields`);
        }
        const result = [];
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, `${field} contains an accessor-backed array item`);
          }
          result.push(copy(descriptor.value, depth + 1, `${field}[${index}]`));
        }
        return result;
      }
      if (Object.getPrototypeOf(value) !== Object.prototype) {
        fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, `${field} must be a plain object`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.length > MAX.keys || keys.some((key) => typeof key !== 'string' || PROTOTYPE_SENSITIVE_KEYS.has(key))) {
        fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, `${field} contains an unsafe object key`);
      }
      const result = {};
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, `${field}.${key} is accessor-backed or hidden`);
        }
        Object.defineProperty(result, key, {
          value: copy(descriptor.value, depth + 1, `${field}.${key}`),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return result;
    } finally {
      seen.delete(value);
    }
  };
  return copy(root, 0, 'request');
}

function assertExactRef(value, field, code = SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED) {
  assertExactKeys(value, ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'], [], field, code);
  const entityId = assertSafeString(value.entity_id, `${field}.entity_id`, code, 256);
  const revisionId = assertSafeString(value.revision_id, `${field}.revision_id`, code, 256);
  const contentId = assertSafeString(value.content_id, `${field}.content_id`, code, 128);
  if (!SHA256_CONTENT_ID.test(contentId) || value.content_hash_alg !== 'sha256') {
    fail(code, `${field} must have a sha256 content_id and content_hash_alg`);
  }
  return { entity_id: entityId, revision_id: revisionId, content_id: contentId, content_hash_alg: 'sha256' };
}

const refKey = (ref) => `${ref.entity_id}|${ref.revision_id}|${ref.content_id}|${ref.content_hash_alg}`;
const refsEqual = (left, right) => refKey(left) === refKey(right);

function assertPinnedText(value, field) {
  const text = assertSafeString(value, field, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
  if (FLOATING_REVISION.test(text)) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, `${field} must not be floating`);
  }
  return text;
}

function assertApplicability(value) {
  assertExactKeys(value, APPLICABILITY_COMPONENTS, [], 'applicability', SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED);
  for (const name of APPLICABILITY_COMPONENTS) {
    if (!(value[name] === true || value[name] === false || value[name] === 'unknown')) {
      fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, `applicability.${name} must be true, false, or unknown`);
    }
  }
  return { ...value };
}

function validateAuthorityBindings(value, rule) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'authority_bindings must be a non-empty bounded array');
  }
  const seen = new Set();
  const bindings = value.map((binding, index) => {
    assertExactKeys(binding, AUTHORITY_BINDING_FIELDS, [], `authority_bindings[${index}]`, SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED);
    const family = assertSafeString(binding.authority_family, `authority_bindings[${index}].authority_family`);
    if (!AUTHORITY_FAMILY.has(family) || seen.has(family)) {
      fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'authority_bindings must name distinct known authority families');
    }
    seen.add(family);
    return {
      authority_family: family,
      role_ref: assertExactRef(binding.role_ref, `authority_bindings[${index}].role_ref`),
      delegation_ref: assertExactRef(binding.delegation_ref, `authority_bindings[${index}].delegation_ref`),
      decision_ref: assertExactRef(binding.decision_ref, `authority_bindings[${index}].decision_ref`),
    };
  }).sort((left, right) => compareCodePoints(left.authority_family, right.authority_family));
  const missing = rule.required_authority_families.filter((family) => !seen.has(family));
  return { bindings, missing };
}

function validateHumanAuthorityBinding(value) {
  if (value === undefined) return null;
  assertExactKeys(value, HUMAN_AUTHORITY_BINDING_FIELDS, [], 'acceptance_authority_binding', SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED);
  if (value.authority_kind !== 'named_human') {
    fail(SAFETY_HAZARD_ERROR_CODES.ACCEPTANCE_AUTHORITY_NOT_HUMAN,
      'only a named human authority may be supplied as residual-risk acceptance evidence');
  }
  return {
    authority_kind: 'named_human',
    named_human_authority_ref: assertExactRef(value.named_human_authority_ref, 'acceptance_authority_binding.named_human_authority_ref'),
    delegation_ref: assertExactRef(value.delegation_ref, 'acceptance_authority_binding.delegation_ref'),
    authority_scope_ref: assertExactRef(value.authority_scope_ref, 'acceptance_authority_binding.authority_scope_ref'),
  };
}

function validateRiskCharacterization(value) {
  assertExactKeys(value, RISK_CHARACTERIZATION_FIELDS, [], 'risk_characterization', SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED);
  if (!isSafetyHazardSeverityBand(value.severity)
      || !isSafetyHazardProbabilityBand(value.probability)
      || !isSafetyHazardRiskBand(value.risk)) {
    fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED,
      'risk_characterization must use the closed severity, probability, and risk vocabularies');
  }
  return { severity: value.severity, probability: value.probability, risk: value.risk };
}

function validateEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'evidence must be an ordinary object');
  }
  const evidence = {};
  for (const [field, reference] of Object.entries(value)) {
    if (!isSafetyHazardEvidenceField(field)) {
      fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'evidence may contain only named exact-ref fields');
    }
    evidence[field] = assertExactRef(reference, `evidence.${field}`);
  }
  return evidence;
}

function validateConflictClaims(value) {
  if (value === undefined) return null;
  try {
    return recordSourceConflict(value);
  } catch (error) {
    if (error instanceof ContractError) {
      fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'conflict_claims failed the Core source-conflict contract', { cause: error.code });
    }
    throw error;
  }
}

function validateRow(row, acceptedRuleBindings) {
  assertExactKeys(row, ROW_REQUIRED_FIELDS, ROW_OPTIONAL_FIELDS, 'domain_input row', SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED);
  const caseId = assertSafeString(row.case_id, 'case_id', SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 128);
  if (!TOKEN.test(caseId)) fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'case_id must be a bounded token');
  const ruleId = assertSafeString(row.rule_id, 'rule_id', SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 128);
  const rule = RULE_BY_ID.get(ruleId);
  if (!rule || !acceptedRuleBindings.has(ruleId)) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'row rule_id must be an explicitly accepted base safety-hazard rule');
  }
  if (typeof row.observation_attempted !== 'boolean' || !isSafetyHazardPresenceState(row.presence_state)
      || !isSafetyHazardLifecycleStatus(row.lifecycle_status)) {
    fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'row observation and lifecycle fields are invalid');
  }
  if (row.observation_attempted && row.observation_attempt_ref === undefined) {
    fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'an observation_attempt_ref is required when observation_attempted is true');
  }
  if (!row.observation_attempted && row.observation_attempt_ref !== undefined) {
    fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'observation_attempt_ref is forbidden when observation_attempted is false');
  }
  const observationAttemptRef = row.observation_attempt_ref === undefined
    ? null
    : assertExactRef(row.observation_attempt_ref, 'observation_attempt_ref');
  const applicability = assertApplicability(row.applicability);
  const notApplicableBasisRef = row.not_applicable_basis_ref === undefined
    ? null
    : assertExactRef(row.not_applicable_basis_ref, 'not_applicable_basis_ref');
  const authority = validateAuthorityBindings(row.authority_bindings, rule);
  const acceptanceAuthorityBinding = validateHumanAuthorityBinding(row.acceptance_authority_binding);
  const evidence = validateEvidence(row.evidence);
  const riskCharacterization = rule.rule_id === 'SH-RSK-02'
    ? validateRiskCharacterization(row.risk_characterization)
    : null;
  if (rule.rule_id !== 'SH-RSK-02' && row.risk_characterization !== undefined) {
    fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'risk_characterization is permitted only on SH-RSK-02 rows');
  }
  const conflictRecord = validateConflictClaims(row.conflict_claims);
  return {
    case_id: caseId,
    rule_id: ruleId,
    rule,
    applicability,
    observation_attempted: row.observation_attempted,
    observation_attempt_ref: observationAttemptRef,
    presence_state: row.presence_state,
    lifecycle_status: row.lifecycle_status,
    authority_bindings: authority.bindings,
    missing_authority_families: authority.missing,
    acceptance_authority_binding: acceptanceAuthorityBinding,
    evidence,
    risk_characterization: riskCharacterization,
    not_applicable_basis_ref: notApplicableBasisRef,
    conflict_record: conflictRecord,
  };
}

function validateDomainInput(domainInput, acceptedRuleBindings) {
  assertExactKeys(domainInput, DOMAIN_INPUT_FIELDS, [], 'domain_input', SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED);
  if (domainInput.schema_version !== DOMAIN_INPUT_SCHEMA || !Array.isArray(domainInput.rows)
      || domainInput.rows.length === 0 || domainInput.rows.length > 128) {
    fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'domain_input schema_version or rows are invalid');
  }
  const seen = new Set();
  const rows = domainInput.rows.map((row) => validateRow(row, acceptedRuleBindings));
  for (const row of rows) {
    if (seen.has(row.case_id)) fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED, 'case_id values must be unique');
    seen.add(row.case_id);
  }
  return rows.sort((left, right) => compareCodePoints(left.case_id, right.case_id));
}

function assertSourceBindings(value) {
  if (!Array.isArray(value) || value.length !== SOURCE_IDS.length) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'source_bindings must bind every base source exactly once');
  }
  const bindings = value.map((binding, index) => {
    assertExactKeys(binding, SOURCE_BINDING_FIELDS, [], `source_bindings[${index}]`, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
    const sourceId = assertSafeString(binding.source_id, `source_bindings[${index}].source_id`, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
    return {
      source_id: sourceId,
      metadata_revision_ref: assertExactRef(binding.metadata_revision_ref, `source_bindings[${index}].metadata_revision_ref`, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED),
      body_revision_ref: assertExactRef(binding.body_revision_ref, `source_bindings[${index}].body_revision_ref`, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED),
    };
  }).sort((left, right) => compareCodePoints(left.source_id, right.source_id));
  if (!bindings.every((binding, index) => binding.source_id === SOURCE_IDS[index])
      || bindings.some((binding) => refsEqual(binding.metadata_revision_ref, binding.body_revision_ref))) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'source_bindings must use exact distinct metadata and body refs');
  }
  return bindings;
}

function acceptedRuleBindingMap(value) {
  if (!Array.isArray(value) || value.length !== SAFETY_HAZARD_RULES.length) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'accepted_rule_bindings must bind every base rule exactly once');
  }
  const bindings = value.map((binding, index) => {
    assertExactKeys(binding, RULE_BINDING_FIELDS, [], `accepted_rule_bindings[${index}]`, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
    return {
      rule_id: assertSafeString(binding.rule_id, `accepted_rule_bindings[${index}].rule_id`, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED),
      stage_ref: assertExactRef(binding.stage_ref, `accepted_rule_bindings[${index}].stage_ref`, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED),
      human_rule_acceptance_ref: assertExactRef(binding.human_rule_acceptance_ref, `accepted_rule_bindings[${index}].human_rule_acceptance_ref`, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED),
    };
  }).sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  if (!bindings.every((binding, index) => binding.rule_id === SAFETY_HAZARD_RULES[index].rule_id)) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'accepted_rule_bindings must be sorted and exactly match the base ruleset');
  }
  return new Map(bindings.map((binding) => [binding.rule_id, binding]));
}

function validateManifestBinding(manifest, binding, cutoffs) {
  assertExactKeys(manifest, [
    'module_id', 'module_version', 'build_commit', 'artifact_sha256', 'engine_contract_abi_range',
    'input_schema_revision', 'output_schema_revision', 'authority_ceiling', 'claim_ceiling',
    'supported_project_classifications', 'execution_mode', 'dependency_versions', 'configuration_hash',
    'migration_requirement', 'rollback_compatible_with', 'test_receipt_ref',
  ], [], 'manifest', SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
  validateManifest(manifest);
  if (manifest.module_id !== MODULE_ID || manifest.input_schema_revision !== DOMAIN_INPUT_SCHEMA
      || manifest.output_schema_revision !== ASSESSMENT_SCHEMA || manifest.execution_mode !== 'deterministic_only'
      || manifest.claim_ceiling !== 'source_supported' || manifest.authority_ceiling !== 'project_contract_baseline') {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'manifest is not the safety-hazard candidate module contract');
  }
  assertExactKeys(binding, BINDING_FIELDS, [], 'binding', SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
  validateBinding(binding, { engineAbiVersion: MODULE_ABI_REVISION });
  if (binding.engine_contract_revision !== CONTRACT_REVISION || binding.snapshot_schema_revision !== DOMAIN_INPUT_SCHEMA
      || binding.execution_mode !== 'deterministic_only' || binding.module_abi_revision !== MODULE_ABI_REVISION
      || binding.adapter_revision !== ADAPTER_REVISION || binding.ruleset_revision !== SAFETY_HAZARD_RULESET_REVISION
      || binding.accepted_context_generation !== cutoffs.accepted_context_generation) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'binding does not match the safety-hazard candidate contract');
  }
  for (const field of ['common_knowledge_revision', 'project_knowledge_revision', 'policy_bundle_revision', 'acl_policy_revision']) {
    assertPinnedText(binding[field], field);
  }
  for (const field of ['engine_ref', 'project_binding_ref', 'objective_ref', 'policy_ref', 'snapshot_ref']) {
    assertExactRef(binding[field], field, SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
  }
  const sourcePacketRef = assertExactRef(binding.source_packet_ref, 'source_packet_ref', SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
  const rulesetRef = assertExactRef(binding.ruleset_ref, 'ruleset_ref', SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
  if (!refsEqual(sourcePacketRef, SAFETY_HAZARD_SOURCE_PACKET_REF) || !refsEqual(rulesetRef, SAFETY_HAZARD_RULESET_REF)) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'source packet or ruleset binding is not the exact candidate ref');
  }
  if (!Array.isArray(binding.module_bindings) || binding.module_bindings.length !== 1
      || binding.module_bindings[0].module_id !== MODULE_ID
      || binding.module_bindings[0].artifact_sha256 !== manifest.artifact_sha256) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'binding must carry the exact single safety-hazard manifest');
  }
  assertExactKeys(cutoffs, CUTOFF_FIELDS, [], 'cutoffs', SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
  if (!Number.isInteger(cutoffs.accepted_context_generation) || cutoffs.accepted_context_generation < 0) {
    fail(SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED, 'cutoffs.accepted_context_generation must be a non-negative integer');
  }
  const assessmentCutoffRef = assertExactRef(cutoffs.assessment_cutoff_ref, 'assessment_cutoff_ref', SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED);
  const sourceBindings = assertSourceBindings(binding.source_bindings);
  const acceptedRuleBindings = acceptedRuleBindingMap(binding.accepted_rule_bindings);
  return { source_bindings: sourceBindings, accepted_rule_bindings: acceptedRuleBindings, assessment_cutoff_ref: assessmentCutoffRef };
}

function axisFields(state) {
  if (state === 'not_applicable') return { canon_claim_ceiling: 'source_supported', evidence_claim_ceiling: 'not_applicable' };
  if (state === 'gap_conflict') return { canon_claim_ceiling: 'source_supported', evidence_claim_ceiling: 'contradicted' };
  if (state === 'gap_unknown') return { canon_claim_ceiling: 'source_supported', evidence_claim_ceiling: 'unknown' };
  if (state === 'gap_missing') return { canon_claim_ceiling: 'source_supported', evidence_claim_ceiling: 'observed_artifact' };
  return { canon_claim_ceiling: 'source_supported', evidence_claim_ceiling: 'source_referenced' };
}

function evaluateRow(row) {
  const applicability = resolveApplicability(row.applicability);
  const requiredEvidence = row.rule.required_evidence_fields;
  const missingEvidence = requiredEvidence.filter((field) => !Object.hasOwn(row.evidence, field));
  const lifecycleStatusSupported = row.rule.lifecycle_statuses.includes(row.lifecycle_status);
  const riskCharacterizationUnknown = row.risk_characterization
    && Object.values(row.risk_characterization).includes('unclassified');
  const humanBindingRequired = row.rule.requires_human_authority_binding;
  const humanBindingPresent = row.acceptance_authority_binding !== null;
  let state;

  if (applicability === false) {
    if (!row.not_applicable_basis_ref) {
      fail(SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED,
        'not_applicable requires an exact not_applicable_basis_ref');
    }
    state = 'not_applicable';
  } else if (applicability === 'unknown' || !lifecycleStatusSupported || riskCharacterizationUnknown) {
    state = 'gap_unknown';
  } else if (row.conflict_record) {
    state = 'gap_conflict';
  } else if (row.missing_authority_families.length > 0 || (humanBindingRequired && !humanBindingPresent)) {
    state = 'gap_unknown';
  } else if (!row.observation_attempted || row.presence_state === 'unknown') {
    state = 'gap_unknown';
  } else if (row.presence_state === 'absence_confirmed' || missingEvidence.length > 0) {
    state = 'gap_missing';
  } else {
    state = 'satisfied';
  }

  const axes = axisFields(state);
  assertCanonCeiling(axes.canon_claim_ceiling);
  assertEvidenceCeiling(axes.evidence_claim_ceiling);
  return {
    case_id: row.case_id,
    rule_id: row.rule_id,
    source_ref: row.rule.source_ref,
    source_locator: row.rule.source_locator,
    source_modality: row.rule.source_modality,
    lifecycle_status: row.lifecycle_status,
    lifecycle_status_supported: lifecycleStatusSupported,
    state,
    ...axes,
    required_evidence_fields: [...row.rule.required_evidence_fields],
    missing_evidence_fields: missingEvidence,
    required_authority_families: [...row.rule.required_authority_families],
    missing_authority_families: [...row.missing_authority_families],
    human_authority_binding_state: humanBindingRequired
      ? (humanBindingPresent ? 'evidence_bound' : 'evidence_missing')
      : 'not_required',
    written_record_evidence_state: Object.hasOwn(row.evidence, 'written_acceptance_record_ref')
      ? 'evidence_present'
      : (row.rule.rule_id === 'SH-AUT-06' ? 'evidence_missing' : 'not_required'),
    conflict_claim_count: row.conflict_record?.claim_count ?? 0,
    governing_authority_family: row.conflict_record?.governing_authority_family ?? null,
  };
}

function countsFor(results) {
  const counts = { satisfied: 0, gap_missing: 0, gap_unknown: 0, gap_conflict: 0, not_applicable: 0, total: results.length };
  for (const result of results) counts[result.state] += 1;
  return counts;
}

function overallState(counts) {
  if (counts.gap_conflict > 0 || counts.gap_missing > 0 || counts.gap_unknown > 0) {
    return 'evidence_gaps_require_human_review';
  }
  if (counts.satisfied === 0 && counts.not_applicable > 0) return 'not_applicable';
  return 'evidence_complete_for_human_review';
}

function aggregateEvidenceCeiling(counts) {
  if (counts.gap_conflict > 0) return 'contradicted';
  if (counts.gap_unknown > 0) return 'unknown';
  if (counts.gap_missing > 0) return 'observed_artifact';
  if (counts.satisfied === 0 && counts.not_applicable > 0) return 'not_applicable';
  return 'source_referenced';
}

function arrayOrderRules(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
  }
  return rules;
}

function withoutNulls(value) {
  if (Array.isArray(value)) return value.filter((child) => child !== null).map(withoutNulls);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, withoutNulls(child)]));
  }
  return value;
}

const canonicalDigest = (domain, value) => {
  const clean = withoutNulls(value);
  return sha256Hex(`${domain}\n${canonicalise(clean, arrayOrderRules(clean))}`);
};

export function assessSafetyHazard(request) {
  const input = snapshotPlainData(request);
  assertExactKeys(input, ROOT_FIELDS, [], 'request', SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED);
  const bindingState = validateManifestBinding(input.manifest, input.binding, input.cutoffs);
  const rows = validateDomainInput(input.domain_input, bindingState.accepted_rule_bindings);
  const results = rows.map(evaluateRow);
  const counts = countsFor(results);
  const canonClaimCeiling = assertCanonCeiling('source_supported');
  const evidenceClaimCeiling = assertEvidenceCeiling(aggregateEvidenceCeiling(counts));
  const domainResult = {
    schema_version: DOMAIN_RESULT_SCHEMA,
    canon_claim_ceiling: canonClaimCeiling,
    evidence_claim_ceiling: evidenceClaimCeiling,
    results,
    counts: { ...counts },
  };
  const assessment = {
    schema_version: ASSESSMENT_SCHEMA,
    assessment_kind: 'safety_hazard_evidence_readiness',
    canon_claim_ceiling: canonClaimCeiling,
    evidence_claim_ceiling: evidenceClaimCeiling,
    overall_state: overallState(counts),
    result_counts: { ...counts },
  };
  const normalizedInput = {
    manifest: input.manifest,
    binding: input.binding,
    domain_input: { schema_version: input.domain_input.schema_version, rows },
    cutoffs: input.cutoffs,
  };
  const receipt = {
    schema_version: RECEIPT_SCHEMA,
    digests: {
      input_sha256: canonicalDigest('soulforge.safety_hazard.input.v0', normalizedInput),
      assessment_sha256: canonicalDigest('soulforge.safety_hazard.assessment.v0', assessment),
      domain_result_sha256: canonicalDigest('soulforge.safety_hazard.domain_result.v0', domainResult),
    },
    counts: { ...counts },
    bindings: {
      source_packet_ref: { ...SAFETY_HAZARD_SOURCE_PACKET_REF },
      ruleset_ref: { ...SAFETY_HAZARD_RULESET_REF },
      ruleset_revision: input.binding.ruleset_revision,
      adapter_revision: input.binding.adapter_revision,
      execution_mode: input.binding.execution_mode,
      context_generation: input.binding.accepted_context_generation,
      assessment_cutoff_ref: bindingState.assessment_cutoff_ref,
      source_bindings: bindingState.source_bindings,
      accepted_rule_bindings: [...bindingState.accepted_rule_bindings.values()],
    },
    effects: { ...EFFECTS },
  };
  return deepFreeze({ assessment, domain_result: domainResult, receipt });
}
