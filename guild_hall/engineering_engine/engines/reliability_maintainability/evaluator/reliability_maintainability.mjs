// E06 deterministic, read-only R&M evidence-readiness assessment. It evaluates exact-bound
// metadata/refs only; it neither calculates a reliability target nor accepts a product, repair,
// supply decision, risk closure, or Quality outcome.
import { types } from 'node:util';

import {
  APPLICABILITY,
  APPLICABILITY_COMPONENTS,
  AUTHORITY_FAMILIES,
  REQUIRED_SOURCE_CLAIM_FIELDS,
  recordSourceConflict,
  resolveApplicability,
} from '../../../core/validators/authority.mjs';
import { canonicalise, compareCodePoints, inspectInstant } from '../../../core/validators/canonical.mjs';
import { assertCanonCeiling, assertEvidenceCeiling } from '../../../core/validators/ceilings.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { sameExactRef } from '../../../core/validators/identity.mjs';
import {
  REQUIRED_BINDING_FIELDS,
  REQUIRED_MANIFEST_FIELDS,
  bindingRevision,
  validateBinding,
  validateManifest,
} from '../../../core/validators/module_binding.mjs';
import { GAP_TYPE } from '../../../core/validators/snapshot.mjs';
import { PRESENCE } from '../../../core/validators/custody.mjs';
import {
  RELIABILITY_MAINTAINABILITY_RULES,
  RELIABILITY_MAINTAINABILITY_RULESET_REF,
  RELIABILITY_MAINTAINABILITY_RULESET_REVISION,
  RELIABILITY_MAINTAINABILITY_SOURCE_IDS,
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
  isReliabilityMaintainabilityEvidenceKind,
} from '../rules/reliability_maintainability_rules.mjs';

export const RM_DOMAIN_INPUT_SCHEMA = 'soulforge.reliability_maintainability.domain_input.v0';
export const RM_ASSESSMENT_SCHEMA = 'soulforge.reliability_maintainability.assessment.v0';
export const RM_DOMAIN_RESULT_SCHEMA = 'soulforge.reliability_maintainability.domain_result.v0';
export const RM_RECEIPT_SCHEMA = 'soulforge.reliability_maintainability.receipt.v0';
export const RM_MODULE_ID = 'soulforge.engineering_engine.reliability_maintainability';
export const RM_ADAPTER_REVISION = 'soulforge.reliability_maintainability.adapter.v0';
export const RM_MODULE_ABI_REVISION = '1.0.0';

export const RM_EVALUATOR_ERROR_CODES = Object.freeze({
  INPUT_REFUSED: 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  BINDING_REFUSED: 'RELIABILITY_MAINTAINABILITY_BINDING_REFUSED',
  UNACCEPTED_RULE: 'RELIABILITY_MAINTAINABILITY_UNACCEPTED_RULE',
  VOCABULARY_REFUSED: 'RELIABILITY_MAINTAINABILITY_VOCABULARY_REFUSED',
  AUTHORITY_REFUSED: 'RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED',
});

const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const FLOATING_REVISION = /(?:^|[-_.:])(latest|current|head|main|master|develop|development|dev|trunk|branch|release|stable|production|prod)(?:$|[-_.:])|[*^~<>]|\d+\.\d+\.\d+\s*(?:-|\.\.)\s*\d+\.\d+\.\d+|(?:^|[-_.:])\d+(?:\.\d+)*\.[xX](?:$|[-_.:])/iu;
const IMMUTABLE_REVISION = /(?:^|[-_.:])(?:v|r|rev|revision|gen|generation)\d+(?:$|[-_.:])|^[0-9a-f]{7,64}$|^\d+\.\d+\.\d+$/iu;
const AUTHORITY_FAMILY = new Set(AUTHORITY_FAMILIES.map((family) => family.key));
const RULE_BY_ID = new Map(RELIABILITY_MAINTAINABILITY_RULES.map((rule) => [rule.rule_id, rule]));
const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_body', 'source_text', 'project_payload', 'payload', 'transcript',
  'raw_transcript', 'hidden_reasoning', 'prompt', 'completion', 'private_path',
  'absolute_private_path', 'absolute_path', 'source_path', 'secret', 'credential', 'password',
  'cookie',
]);
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /(?:^|[^A-Za-z0-9_])\/(?:tmp|temp|var|etc|opt|srv|usr|bin|sbin|lib|dev|proc|sys|root|home|users|mnt|media|private|data)\/\S/iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);
const MAX = Object.freeze({ depth: 16, values: 4096, array: 64, keys: 32, string: 512 });
const EFFECTS = Object.freeze({
  filesystem: 0,
  network: 0,
  model: 0,
  rag: 0,
  wiki: 0,
  erp: 0,
  task: 0,
  approval: 0,
});

const ROOT_FIELDS = Object.freeze(['manifest', 'binding', 'domain_input', 'cutoffs']);
const BINDING_FIELDS = Object.freeze([
  ...REQUIRED_BINDING_FIELDS,
  'engine_ref',
  'objective_ref',
  'policy_ref',
  'snapshot_ref',
  'source_packet_ref',
  'ruleset_ref',
  'adapter_revision',
  'source_bindings',
  'accepted_rule_bindings',
]);
const CUTOFF_FIELDS = Object.freeze(['accepted_context_generation', 'assessment_cutoff_ref']);
const DOMAIN_INPUT_FIELDS = Object.freeze(['schema_version', 'rows']);
const ROW_REQUIRED_FIELDS = Object.freeze([
  'case_id', 'rule_id', 'stage_ref', 'applicability', 'context_refs', 'authority_bindings',
  'observation_attempted', 'presence_state', 'evidence_refs', 'evidence_kind',
]);
const ROW_OPTIONAL_FIELDS = Object.freeze([
  'observation_attempt_ref', 'not_applicable_basis_ref', 'evaluation_result_ref',
  'evaluation_result_state', 'conflict_claims',
]);
const SOURCE_BINDING_FIELDS = Object.freeze(['source_id', 'metadata_revision_ref', 'body_revision_ref']);
const RULE_BINDING_FIELDS = Object.freeze(['rule_id', 'stage_ref', 'owner_acceptance_ref']);
const AUTHORITY_BINDING_FIELDS = Object.freeze([
  'authority_family', 'role_ref', 'delegation_ref', 'decision_ref',
]);

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function assertSafeString(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'input strings must be bounded NFC text without controls', { field });
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'private paths, credentials, and payload-bearing strings are refused', { field });
  }
  return value;
}

// Snapshot plain data before validation so the engine does not mutate or retain caller-owned
// input. Aliases, getters, proxies, cycles, hidden keys, and private-content field names fail
// before a source/evidence decision can be attempted.
function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;
  const walk = (value, depth, field) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'input exceeds bounded plain-data limits', { field });
    }
    if (typeof value === 'string') return assertSafeString(value, field);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'only safe integer metadata values are accepted', { field });
      }
      return value;
    }
    if (value === null) return null;
    if (!value || typeof value !== 'object' || types.isProxy(value)) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'only plain JSON-compatible data is accepted', { field });
    }
    if (seen.has(value)) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'cycles and aliases are refused', { field });
    }
    seen.add(value);
    {
      if (Array.isArray(value)) {
        const keys = Reflect.ownKeys(value);
        if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX.array
            || Object.keys(value).length !== value.length
            || keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
          fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
            'arrays must be ordinary, bounded, dense, unnamed, and symbol-free', { field });
        }
        const descriptors = Object.getOwnPropertyDescriptors(value);
        return Array.from({ length: value.length }, (_, index) => {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
              'arrays may not carry accessors or hidden entries', { field: `${field}[${index}]` });
          }
          return walk(descriptor.value, depth + 1, `${field}[${index}]`);
        });
      }
      if (Object.getPrototypeOf(value) !== Object.prototype) {
        fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'only ordinary object records are accepted', { field });
      }
      const keys = Reflect.ownKeys(value);
      if (keys.length > MAX.keys || keys.some((key) => typeof key !== 'string' || PROTOTYPE_SENSITIVE_KEYS.has(key))) {
        fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
          'record keys must be bounded, non-symbol, and prototype-safe', { field });
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const copy = {};
      for (const key of keys) {
        if (FORBIDDEN_KEYS.has(key)) {
          fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
            'raw source, project payload, and private fields are refused', { field: `${field}.${key}` });
        }
        const descriptor = descriptors[key];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
            'records may not carry accessors or hidden fields', { field: `${field}.${key}` });
        }
        Object.defineProperty(copy, key, {
          value: walk(descriptor.value, depth + 1, `${field}.${key}`),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return copy;
    }
  };
  return walk(root, 0, 'request');
}

function assertExactKeys(value, required, optional, field, code = RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${field} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(code, `${field}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code, `${field}.${key} is not permitted`);
  }
}

function assertToken(value, field, code = RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  if (typeof value !== 'string' || !TOKEN.test(value)) {
    fail(code, `${field} must be a bounded opaque token`);
  }
  return value;
}

function assertPinnedRevision(value, field, code = RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED) {
  assertToken(value, field, code);
  if (FLOATING_REVISION.test(value)) fail(code, `${field} must not use floating revision text`);
  return value;
}

function assertImmutableRevision(value, field, code = RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED) {
  assertPinnedRevision(value, field, code);
  if (!IMMUTABLE_REVISION.test(value)) {
    fail(code, `${field} must carry an immutable revision marker, exact hash, or exact semver`);
  }
  return value;
}

function assertExactRef(ref, field, code = RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  assertExactKeys(ref, ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'], [], field, code);
  for (const key of ['entity_id', 'revision_id', 'content_id', 'content_hash_alg']) {
    assertSafeString(ref[key], `${field}.${key}`);
  }
  assertToken(ref.entity_id, `${field}.entity_id`, code);
  assertPinnedRevision(ref.revision_id, `${field}.revision_id`, code);
  if (!SHA256_CONTENT_ID.test(ref.content_id) || ref.content_hash_alg !== 'sha256') {
    fail(code, `${field} must be a complete exact sha256 reference`);
  }
  return ref;
}

function refKey(ref) {
  return [ref.entity_id, ref.revision_id, ref.content_id, ref.content_hash_alg].join('\u001f');
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function assertRefArray(refs, field, { required = false } = {}, code = RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  if (!Array.isArray(refs) || (required && refs.length === 0)) {
    fail(code, `${field} must be an explicit${required ? ' non-empty' : ''} array`);
  }
  let prior = null;
  for (const ref of refs) {
    assertExactRef(ref, field, code);
    const key = refKey(ref);
    if (prior !== null && compareCodePoints(prior, key) >= 0) {
      fail(code, `${field} must be sorted by exact-ref tuple without duplicates`);
    }
    prior = key;
  }
}

function assertApplicability(components) {
  assertExactKeys(components, APPLICABILITY_COMPONENTS, [], 'row.applicability');
  for (const field of APPLICABILITY_COMPONENTS) {
    if (![true, false, APPLICABILITY.UNKNOWN].includes(components[field])) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
        `row.applicability.${field} must be true, false, or unknown`);
    }
  }
}

function assertConflictClaims(claims, row) {
  if (claims === undefined) return;
  if (!Array.isArray(claims) || claims.length < 2 || row.presence_state !== PRESENCE.PRESENT) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'conflict_claims require a present observation and at least two exact source sides');
  }
  let prior = null;
  for (const claim of claims) {
    assertExactKeys(claim, REQUIRED_SOURCE_CLAIM_FIELDS, [], 'conflict_claim');
    assertToken(claim.claim_id, 'conflict_claim.claim_id');
    if (prior !== null && compareCodePoints(prior, claim.claim_id) >= 0) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'conflict_claims must be sorted and unique by claim_id');
    }
    prior = claim.claim_id;
    if (!AUTHORITY_FAMILY.has(claim.authority_family)) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'conflict claim authority family is unregistered');
    }
    assertExactRef(claim.source_revision_ref, 'conflict_claim.source_revision_ref');
    assertToken(claim.lineage_ref, 'conflict_claim.lineage_ref');
    assertToken(claim.asserted_value, 'conflict_claim.asserted_value');
    if (![true, false, APPLICABILITY.UNKNOWN].includes(claim.applicability)) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'conflict claim applicability is invalid');
    }
    if (!inspectInstant(claim.valid_at).valid || !inspectInstant(claim.known_at).valid
        || compareCodePoints(claim.known_at, claim.valid_at) < 0) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'conflict claim times must be canonical and coherent');
    }
  }
}

function validateSourceBindings(sourceBindings) {
  if (!Array.isArray(sourceBindings) || sourceBindings.length !== RELIABILITY_MAINTAINABILITY_SOURCE_IDS.length) {
    fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, 'exactly two named source bindings are required');
  }
  const seenIds = new Set();
  const seenRefs = new Set();
  let prior = null;
  for (const sourceBinding of sourceBindings) {
    assertExactKeys(sourceBinding, SOURCE_BINDING_FIELDS, [], 'source_binding', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    assertToken(sourceBinding.source_id, 'source_binding.source_id', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    if (prior !== null && compareCodePoints(prior, sourceBinding.source_id) >= 0) {
      fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, 'source_bindings must be sorted and unique by source_id');
    }
    prior = sourceBinding.source_id;
    seenIds.add(sourceBinding.source_id);
    assertExactRef(sourceBinding.metadata_revision_ref, 'source_binding.metadata_revision_ref', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    assertExactRef(sourceBinding.body_revision_ref, 'source_binding.body_revision_ref', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    if (sameExactRef(sourceBinding.metadata_revision_ref, sourceBinding.body_revision_ref)) {
      fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, 'source metadata/body refs must remain distinct');
    }
    for (const ref of [sourceBinding.metadata_revision_ref, sourceBinding.body_revision_ref]) {
      const key = refKey(ref);
      if (seenRefs.has(key)) {
        fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, 'each source metadata/body ref must be globally distinct');
      }
      seenRefs.add(key);
    }
  }
  if (seenIds.size !== RELIABILITY_MAINTAINABILITY_SOURCE_IDS.length
      || RELIABILITY_MAINTAINABILITY_SOURCE_IDS.some((sourceId) => !seenIds.has(sourceId))) {
    fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, 'source_bindings must name the two source inventory IDs exactly');
  }
}

function acceptedRuleBindingMap(ruleBindings) {
  if (!Array.isArray(ruleBindings) || ruleBindings.length === 0) {
    fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, 'accepted_rule_bindings must be a non-empty array');
  }
  const byRuleId = new Map();
  let prior = null;
  for (const ruleBinding of ruleBindings) {
    assertExactKeys(ruleBinding, RULE_BINDING_FIELDS, [], 'accepted_rule_binding', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    assertToken(ruleBinding.rule_id, 'accepted_rule_binding.rule_id', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    if (!RULE_BY_ID.has(ruleBinding.rule_id) || byRuleId.has(ruleBinding.rule_id)
        || (prior !== null && compareCodePoints(prior, ruleBinding.rule_id) >= 0)) {
      fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED,
        'accepted_rule_bindings must be known, sorted, and unique by rule_id');
    }
    prior = ruleBinding.rule_id;
    assertExactRef(ruleBinding.stage_ref, 'accepted_rule_binding.stage_ref', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    assertExactRef(ruleBinding.owner_acceptance_ref, 'accepted_rule_binding.owner_acceptance_ref', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    if (sameExactRef(ruleBinding.stage_ref, ruleBinding.owner_acceptance_ref)) {
      fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, 'stage and owner acceptance refs must be distinct');
    }
    byRuleId.set(ruleBinding.rule_id, ruleBinding);
  }
  return byRuleId;
}

function canonicalDigest(domain, value) {
  const arrayRules = {};
  const inspect = (current, path = '') => {
    if (Array.isArray(current)) {
      arrayRules[path] = 'insertion_ordered';
      for (const child of current) inspect(child, `${path}[]`);
    } else if (current && typeof current === 'object') {
      for (const [key, child] of Object.entries(current)) inspect(child, path ? `${path}.${key}` : key);
    }
  };
  inspect(value);
  return sha256Hex(`${domain}\n${canonicalise(value, arrayRules)}`);
}

function validateManifestBinding(manifest, binding, cutoffs) {
  try {
    assertExactKeys(manifest, REQUIRED_MANIFEST_FIELDS, [], 'manifest', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    validateManifest(manifest);
    if (manifest.module_id !== RM_MODULE_ID
        || manifest.input_schema_revision !== RM_DOMAIN_INPUT_SCHEMA
        || manifest.output_schema_revision !== RM_ASSESSMENT_SCHEMA
        || manifest.authority_ceiling !== 'project_contract_baseline'
        || manifest.claim_ceiling !== 'source_supported'
        || manifest.execution_mode !== 'deterministic_only'
        || manifest.migration_requirement !== 'none') {
      fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED, 'manifest is not the exact E06 deterministic candidate manifest');
    }
    assertExactKeys(binding, BINDING_FIELDS, [], 'binding', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    for (const field of [
      'engine_contract_revision', 'snapshot_schema_revision', 'engine_release_version',
      'module_abi_revision', 'ruleset_revision', 'adapter_revision',
    ]) assertPinnedRevision(binding[field], `binding.${field}`, RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    for (const field of [
      'common_knowledge_revision', 'project_knowledge_revision', 'policy_bundle_revision',
      'acl_policy_revision',
    ]) assertImmutableRevision(binding[field], `binding.${field}`, RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    validateBinding(binding, { engineAbiVersion: RM_MODULE_ABI_REVISION });
    assertExactRef(binding.project_binding_ref, 'binding.project_binding_ref', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    for (const field of ['engine_ref', 'objective_ref', 'policy_ref', 'snapshot_ref']) {
      assertExactRef(binding[field], `binding.${field}`, RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    }
    assertExactRef(binding.source_packet_ref, 'binding.source_packet_ref', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    assertExactRef(binding.ruleset_ref, 'binding.ruleset_ref', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    if (!sameExactRef(binding.source_packet_ref, RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF)
        || !sameExactRef(binding.ruleset_ref, RELIABILITY_MAINTAINABILITY_RULESET_REF)
        || binding.ruleset_revision !== RELIABILITY_MAINTAINABILITY_RULESET_REVISION
        || binding.adapter_revision !== RM_ADAPTER_REVISION) {
      fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED,
        'source packet, ruleset, and adapter refs must pin the exact E06 base candidate');
    }
    if (!Array.isArray(binding.module_bindings) || binding.module_bindings.length !== 1
        || canonicalDigest('soulforge.reliability_maintainability.manifest.v0', binding.module_bindings[0])
          !== canonicalDigest('soulforge.reliability_maintainability.manifest.v0', manifest)) {
      fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED,
        'binding must carry exactly the same single validated E06 module manifest');
    }
    const accepted_rule_bindings = acceptedRuleBindingMap(binding.accepted_rule_bindings);
    validateSourceBindings(binding.source_bindings);
    assertExactKeys(cutoffs, CUTOFF_FIELDS, [], 'cutoffs', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    assertExactRef(cutoffs.assessment_cutoff_ref, 'cutoffs.assessment_cutoff_ref', RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    if (!Number.isSafeInteger(cutoffs.accepted_context_generation)
        || cutoffs.accepted_context_generation !== binding.accepted_context_generation) {
      fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED,
        'cutoffs must pin the accepted_context_generation from the exact binding');
    }
    return {
      accepted_rule_bindings,
      module_binding_revision: bindingRevision(binding),
      binding_sha256: canonicalDigest('soulforge.reliability_maintainability.binding.v0', { manifest, binding, cutoffs }),
    };
  } catch (error) {
    if (error instanceof ContractError && error.code === RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED) throw error;
    fail(RM_EVALUATOR_ERROR_CODES.BINDING_REFUSED,
      'common module binding validation refused this E06 candidate binding',
      { cause_code: error instanceof ContractError ? error.code : 'UNEXPECTED_BINDING_VALIDATION_ERROR' });
  }
}

function inspectContextRefs(contextRefs, rule) {
  assertExactKeys(contextRefs, [], rule.context_ref_fields, 'row.context_refs');
  for (const field of Object.keys(contextRefs)) {
    assertExactRef(contextRefs[field], `row.context_refs.${field}`);
  }
  return rule.context_ref_fields.filter((field) => !Object.hasOwn(contextRefs, field));
}

function authorityBindingPresent(authorityBindings, rule) {
  if (!Array.isArray(authorityBindings)) {
    fail(RM_EVALUATOR_ERROR_CODES.AUTHORITY_REFUSED, 'typed authority_bindings must be an explicit array');
  }
  if (authorityBindings.length === 0) return false;
  const required = new Set(rule.required_authority_families);
  const actual = new Set();
  let prior = null;
  for (const authorityBinding of authorityBindings) {
    assertExactKeys(authorityBinding, AUTHORITY_BINDING_FIELDS, [], 'authority_binding', RM_EVALUATOR_ERROR_CODES.AUTHORITY_REFUSED);
    if (!AUTHORITY_FAMILY.has(authorityBinding.authority_family)
        || !required.has(authorityBinding.authority_family)
        || (prior !== null && compareCodePoints(prior, authorityBinding.authority_family) >= 0)) {
      fail(RM_EVALUATOR_ERROR_CODES.AUTHORITY_REFUSED,
        'authority bindings must use only required registered families in stable order');
    }
    prior = authorityBinding.authority_family;
    actual.add(authorityBinding.authority_family);
    for (const field of ['role_ref', 'delegation_ref', 'decision_ref']) {
      assertExactRef(authorityBinding[field], `authority_binding.${field}`, RM_EVALUATOR_ERROR_CODES.AUTHORITY_REFUSED);
    }
  }
  return actual.size === required.size;
}

function assertAuthorityRefSeparation(row, acceptedRuleBinding) {
  const nonAuthorityRefs = [
    row.stage_ref,
    acceptedRuleBinding.owner_acceptance_ref,
    ...Object.values(row.context_refs),
    ...row.evidence_refs,
    ...(row.conflict_claims ?? []).map((claim) => claim.source_revision_ref),
  ];
  for (const field of [
    'observation_attempt_ref', 'not_applicable_basis_ref', 'evaluation_result_ref',
  ]) {
    if (Object.hasOwn(row, field)) nonAuthorityRefs.push(row[field]);
  }
  const forbidden = new Set(nonAuthorityRefs.map(refKey));
  const authorityRefs = new Set();
  for (const authorityBinding of row.authority_bindings) {
    for (const field of ['role_ref', 'delegation_ref', 'decision_ref']) {
      const key = refKey(authorityBinding[field]);
      if (forbidden.has(key) || authorityRefs.has(key)) {
        fail(RM_EVALUATOR_ERROR_CODES.AUTHORITY_REFUSED,
          'authority role/delegation/decision refs must be mutually distinct and disjoint from evidence/context refs');
      }
      authorityRefs.add(key);
    }
  }
}

function validateRow(row, acceptedRuleBindings) {
  assertExactKeys(row, ROW_REQUIRED_FIELDS, ROW_OPTIONAL_FIELDS, 'row');
  assertToken(row.case_id, 'row.case_id');
  assertToken(row.rule_id, 'row.rule_id');
  const rule = RULE_BY_ID.get(row.rule_id);
  if (!rule) fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'row rule_id is not a known E06 candidate rule');
  const acceptedRuleBinding = acceptedRuleBindings.get(row.rule_id);
  if (!acceptedRuleBinding) {
    fail(RM_EVALUATOR_ERROR_CODES.UNACCEPTED_RULE,
      'candidate rule remains non-executable until an exact accepted rule binding exists');
  }
  assertExactRef(row.stage_ref, 'row.stage_ref');
  if (!sameExactRef(row.stage_ref, acceptedRuleBinding.stage_ref)) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'row stage_ref does not exactly match its accepted rule binding');
  }
  assertApplicability(row.applicability);
  const missing_context_fields = inspectContextRefs(row.context_refs, rule);
  const authority_present = authorityBindingPresent(row.authority_bindings, rule);
  const hasFalseApplicability = APPLICABILITY_COMPONENTS.some((field) => row.applicability[field] === false);
  if (hasFalseApplicability) {
    if (!Object.hasOwn(row, 'not_applicable_basis_ref')) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
        'resolved not_applicable requires a typed exact basis reference');
    }
    assertExactRef(row.not_applicable_basis_ref, 'row.not_applicable_basis_ref');
  } else if (Object.hasOwn(row, 'not_applicable_basis_ref')) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'not_applicable_basis_ref is allowed only with explicit false applicability');
  }
  if (typeof row.observation_attempted !== 'boolean' || !Object.values(PRESENCE).includes(row.presence_state)) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'observation state is invalid');
  }
  if (row.observation_attempted) {
    if (!Object.hasOwn(row, 'observation_attempt_ref')) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'attempted observation requires observation_attempt_ref');
    }
    assertExactRef(row.observation_attempt_ref, 'row.observation_attempt_ref');
  } else if (Object.hasOwn(row, 'observation_attempt_ref')) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'unattempted observation cannot carry observation_attempt_ref');
  }
  if (row.presence_state !== PRESENCE.UNKNOWN && !row.observation_attempted) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'present or confirmed-absent evidence requires an observation attempt');
  }
  assertRefArray(row.evidence_refs, 'row.evidence_refs', { required: row.presence_state === PRESENCE.PRESENT });
  if (row.presence_state === PRESENCE.UNKNOWN && row.evidence_refs.length !== 0) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'unavailable observation cannot carry resolved evidence refs');
  }
  if (!rule.allowed_evidence_kinds.includes(row.evidence_kind)
      || (row.evidence_kind !== null && !isReliabilityMaintainabilityEvidenceKind(row.evidence_kind))) {
    fail(RM_EVALUATOR_ERROR_CODES.VOCABULARY_REFUSED,
      'evidence_kind requires an exact declared R&M mapping; near synonyms and Quality labels are refused');
  }
  for (const field of ['evaluation_result_ref']) {
    if (Object.hasOwn(row, field)) assertExactRef(row[field], `row.${field}`);
  }
  if (Object.hasOwn(row, 'evaluation_result_state')
      && !['criteria_met', 'criteria_not_met', 'unknown'].includes(row.evaluation_result_state)) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'evaluation_result_state is invalid');
  }
  if (Object.hasOwn(row, 'evaluation_result_ref') !== Object.hasOwn(row, 'evaluation_result_state')) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'evaluation_result_ref and evaluation_result_state must be supplied together');
  }
  assertConflictClaims(row.conflict_claims, row);
  assertAuthorityRefSeparation(row, acceptedRuleBinding);
  return { row, rule, accepted_rule_binding: acceptedRuleBinding, authority_present, missing_context_fields };
}

function validateDomainInput(domainInput, acceptedRuleBindings) {
  assertExactKeys(domainInput, DOMAIN_INPUT_FIELDS, [], 'domain_input');
  if (domainInput.schema_version !== RM_DOMAIN_INPUT_SCHEMA || !Array.isArray(domainInput.rows)
      || domainInput.rows.length > MAX.array) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'domain input schema or rows are invalid');
  }
  const seenCaseIds = new Set();
  const seenRuleIds = new Set();
  const prepared = domainInput.rows.map((row) => {
    const preparedRow = validateRow(row, acceptedRuleBindings);
    if (seenCaseIds.has(row.case_id) || seenRuleIds.has(row.rule_id)) {
      fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
        'each case and each accepted rule may execute only once');
    }
    seenCaseIds.add(row.case_id);
    seenRuleIds.add(row.rule_id);
    return preparedRow;
  });
  if (prepared.length !== acceptedRuleBindings.size
      || [...acceptedRuleBindings.keys()].some((ruleId) => !seenRuleIds.has(ruleId))) {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'each accepted rule requires exactly one bounded R&M domain row');
  }
  return prepared.sort((left, right) => compareCodePoints(left.row.rule_id, right.row.rule_id)
    || compareCodePoints(left.row.case_id, right.row.case_id));
}

function sourceConflictProjection(claims) {
  let record;
  try {
    record = recordSourceConflict(claims);
  } catch {
    fail(RM_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      'two-sided source disagreement is not a valid retained conflict');
  }
  return {
    claim_count: record.claim_count,
    governing_authority_family: record.governing_authority_family,
    resolution_reason: record.resolution_reason,
    retained_claims: record.retained_claims.map((claim) => ({
      claim_id: claim.claim_id,
      authority_family: claim.authority_family,
      source_revision_ref: cloneRef(claim.source_revision_ref),
      lineage_ref: claim.lineage_ref,
      applicability: claim.applicability,
      asserted_value: claim.asserted_value,
      valid_at: claim.valid_at,
      known_at: claim.known_at,
    })),
    sides_dropped: record.sides_dropped,
  };
}

function cloneAuthorityBinding(authorityBinding) {
  return {
    authority_family: authorityBinding.authority_family,
    role_ref: cloneRef(authorityBinding.role_ref),
    delegation_ref: cloneRef(authorityBinding.delegation_ref),
    decision_ref: cloneRef(authorityBinding.decision_ref),
  };
}

function axisFields(state) {
  const evidenceByState = Object.freeze({
    [GAP_TYPE.SATISFIED]: 'source_sufficient',
    [GAP_TYPE.MISSING]: 'source_referenced',
    [GAP_TYPE.UNKNOWN]: 'unknown',
    [GAP_TYPE.CONFLICT]: 'contradicted',
    not_applicable: 'not_applicable',
  });
  return {
    canon_claim_ceiling: assertCanonCeiling('source_supported'),
    evidence_claim_ceiling: assertEvidenceCeiling(evidenceByState[state]),
  };
}

function resultBase(row, rule, acceptedRuleBinding) {
  const context_refs = {};
  for (const key of Object.keys(row.context_refs)) context_refs[key] = cloneRef(row.context_refs[key]);
  const result = {
    case_id: row.case_id,
    rule_id: rule.rule_id,
    stage_ref: cloneRef(row.stage_ref),
    owner_acceptance_ref: cloneRef(acceptedRuleBinding.owner_acceptance_ref),
    source_ref: rule.source_ref,
    source_locator: rule.source_locator,
    source_modality: rule.source_modality,
    evidence_kind: row.evidence_kind,
    applicability_components: { ...row.applicability },
    context_refs,
    authority_bindings: row.authority_bindings.map(cloneAuthorityBinding),
    observation_attempted: row.observation_attempted,
    presence_state: row.presence_state,
    evidence_refs: row.evidence_refs.map(cloneRef),
  };
  for (const field of ['observation_attempt_ref', 'not_applicable_basis_ref', 'evaluation_result_ref']) {
    if (Object.hasOwn(row, field)) result[field] = cloneRef(row[field]);
  }
  if (Object.hasOwn(row, 'evaluation_result_state')) result.evaluation_result_state = row.evaluation_result_state;
  return result;
}

function evaluateRow({ row, rule, accepted_rule_binding, authority_present, missing_context_fields }) {
  const base = resultBase(row, rule, accepted_rule_binding);
  const applicability = resolveApplicability(row.applicability);
  if (applicability === APPLICABILITY.NO) {
    return { ...base, ...axisFields('not_applicable'), state: 'not_applicable', reason_code: 'not_applicable', authority_hold: false };
  }
  if (applicability === APPLICABILITY.UNKNOWN) {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN), state: GAP_TYPE.UNKNOWN, reason_code: 'applicability_unknown', authority_hold: false };
  }
  if (missing_context_fields.length > 0) {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN), state: GAP_TYPE.UNKNOWN, reason_code: 'context_facts_missing', authority_hold: false };
  }
  if (!authority_present) {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN), state: GAP_TYPE.UNKNOWN, reason_code: 'authority_missing', authority_hold: true };
  }
  if (row.conflict_claims !== undefined) {
    return {
      ...base,
      ...axisFields(GAP_TYPE.CONFLICT),
      state: GAP_TYPE.CONFLICT,
      reason_code: 'retained_source_conflict',
      authority_hold: false,
      conflict: sourceConflictProjection(row.conflict_claims),
    };
  }
  if (!row.observation_attempted || row.presence_state === PRESENCE.UNKNOWN) {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN), state: GAP_TYPE.UNKNOWN, reason_code: 'observation_unavailable', authority_hold: false };
  }
  if (row.presence_state === PRESENCE.ABSENCE_CONFIRMED) {
    return { ...base, ...axisFields(GAP_TYPE.MISSING), state: GAP_TYPE.MISSING, reason_code: 'absence_confirmed', authority_hold: false };
  }
  const missingSufficiency = rule.sufficiency_fields.filter((field) => !Object.hasOwn(row, field));
  if (missingSufficiency.length > 0 || row.evaluation_result_state === 'unknown') {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN), state: GAP_TYPE.UNKNOWN, reason_code: 'evaluation_unknown', authority_hold: false };
  }
  if (row.evaluation_result_state === 'criteria_not_met') {
    return { ...base, ...axisFields(GAP_TYPE.CONFLICT), state: GAP_TYPE.CONFLICT, reason_code: 'evaluation_not_met', authority_hold: false };
  }
  const satisfied = {
    ...base,
    ...axisFields(GAP_TYPE.SATISFIED),
    state: GAP_TYPE.SATISFIED,
    reason_code: 'evidence_sufficient',
    authority_hold: false,
  };
  // A sufficient closure trace is not a closure decision. Only the closure rule carries this
  // extra refusal signal, so other R&M results do not acquire an unrelated closure field.
  if (rule.rule_id === 'RM-CLS-07') satisfied.closure_authority_exercised = false;
  return satisfied;
}

function countsFor(results) {
  const counts = {
    satisfied: 0,
    gap_missing: 0,
    gap_unknown: 0,
    gap_conflict: 0,
    not_applicable: 0,
    total: results.length,
  };
  for (const result of results) counts[result.state] += 1;
  return counts;
}

function overallState(counts) {
  if (counts.gap_missing || counts.gap_unknown || counts.gap_conflict) return 'hold';
  if (counts.total === 0) return 'no_accepted_rows';
  if (counts.not_applicable === counts.total) return 'not_applicable';
  return 'evidence_ready_for_owner_review';
}

function aggregateEvidenceCeiling(counts) {
  const value = counts.gap_unknown ? 'unknown'
    : counts.gap_conflict ? 'contradicted'
      : counts.gap_missing ? 'source_referenced'
        : counts.not_applicable === counts.total ? 'not_applicable'
          : 'source_sufficient';
  return assertEvidenceCeiling(value);
}

/**
 * Assess only R&M evidence readiness against an exact project binding.
 *
 * @param {{manifest: object, binding: object, domain_input: object, cutoffs: object}} request
 * @returns {{assessment: object, domain_result: object, receipt: object}}
 */
export function assessReliabilityMaintainability(request) {
  const input = snapshotPlainData(request);
  assertExactKeys(input, ROOT_FIELDS, [], 'request');
  const bindingState = validateManifestBinding(input.manifest, input.binding, input.cutoffs);
  const prepared = validateDomainInput(input.domain_input, bindingState.accepted_rule_bindings);
  const results = prepared.map(evaluateRow);
  const counts = countsFor(results);
  const canon_claim_ceiling = assertCanonCeiling('source_supported');
  const evidence_claim_ceiling = aggregateEvidenceCeiling(counts);
  const domain_result = {
    schema_version: RM_DOMAIN_RESULT_SCHEMA,
    canon_claim_ceiling,
    evidence_claim_ceiling,
    results,
    counts: { ...counts },
  };
  const assessment = {
    schema_version: RM_ASSESSMENT_SCHEMA,
    assessment_kind: 'reliability_maintainability_evidence_readiness',
    canon_claim_ceiling,
    evidence_claim_ceiling,
    overall_state: overallState(counts),
    result_counts: { ...counts },
  };
  const normalizedInput = {
    manifest: input.manifest,
    binding: input.binding,
    domain_input: { schema_version: input.domain_input.schema_version, rows: prepared.map(({ row }) => row) },
    cutoffs: input.cutoffs,
  };
  const receipt = {
    schema_version: RM_RECEIPT_SCHEMA,
    digests: {
      input_sha256: canonicalDigest('soulforge.reliability_maintainability.input.v0', normalizedInput),
      binding_sha256: bindingState.binding_sha256,
      assessment_sha256: canonicalDigest('soulforge.reliability_maintainability.assessment.v0', assessment),
      domain_result_sha256: canonicalDigest('soulforge.reliability_maintainability.domain_result.v0', domain_result),
    },
    counts: { ...counts },
    bindings: {
      module_binding_revision: bindingState.module_binding_revision,
      source_packet_ref: cloneRef(input.binding.source_packet_ref),
      engine_ref: cloneRef(input.binding.engine_ref),
      objective_ref: cloneRef(input.binding.objective_ref),
      policy_ref: cloneRef(input.binding.policy_ref),
      snapshot_ref: cloneRef(input.binding.snapshot_ref),
      ruleset_ref: cloneRef(input.binding.ruleset_ref),
      ruleset_revision: input.binding.ruleset_revision,
      adapter_revision: input.binding.adapter_revision,
      execution_mode: input.binding.execution_mode,
      project_binding_ref: cloneRef(input.binding.project_binding_ref),
      context_generation: input.binding.accepted_context_generation,
      assessment_cutoff_ref: cloneRef(input.cutoffs.assessment_cutoff_ref),
      source_bindings: input.binding.source_bindings.map((sourceBinding) => ({
        source_id: sourceBinding.source_id,
        metadata_revision_ref: cloneRef(sourceBinding.metadata_revision_ref),
        body_revision_ref: cloneRef(sourceBinding.body_revision_ref),
      })),
      accepted_rule_bindings: input.binding.accepted_rule_bindings.map((ruleBinding) => ({
        rule_id: ruleBinding.rule_id,
        stage_ref: cloneRef(ruleBinding.stage_ref),
        owner_acceptance_ref: cloneRef(ruleBinding.owner_acceptance_ref),
      })),
    },
    effects: { ...EFFECTS },
  };
  return freezeDeep({ assessment, domain_result, receipt });
}
