// E01 deterministic, read-only quality-evidence readiness assessment. It evaluates only
// exact-bound metadata and refs; it neither accepts a product nor changes any external state.
import { types } from 'node:util';

import {
  APPLICABILITY,
  APPLICABILITY_COMPONENTS,
  AUTHORITY_FAMILIES,
  recordSourceConflict,
  resolveApplicability,
} from '../../../core/validators/authority.mjs';
import { canonicalise, compareCodePoints, inspectInstant } from '../../../core/validators/canonical.mjs';
import { assertCanonCeiling, assertEvidenceCeiling } from '../../../core/validators/ceilings.mjs';
import { CONTRACT_REVISION, REF_REQUIRED_FIELDS } from '../../../core/validators/contract_config.mjs';
import { PRESENCE } from '../../../core/validators/custody.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { isWellFormedRef, sameExactRef } from '../../../core/validators/identity.mjs';
import {
  bindingRevision,
  REQUIRED_BINDING_FIELDS,
  REQUIRED_MANIFEST_FIELDS,
  validateBinding,
  validateManifest,
} from '../../../core/validators/module_binding.mjs';
import { GAP_TYPE } from '../../../core/validators/snapshot.mjs';
// Domain-owned Quality Readiness token vocabulary
import { isQualityReadinessArtifactToken } from '../rules/quality_readiness_rules.mjs';
import {
  QUALITY_READINESS_RULESET_REF,
  QUALITY_READINESS_RULESET_REVISION,
  QUALITY_READINESS_RULES,
  QUALITY_READINESS_SOURCE_PACKET_REF,
} from '../rules/quality_readiness_rules.mjs';

const DOMAIN_INPUT_SCHEMA = 'soulforge.quality_readiness.domain_input.v0';
const ASSESSMENT_SCHEMA = 'soulforge.quality_readiness.assessment.v0';
const DOMAIN_RESULT_SCHEMA = 'soulforge.quality_readiness.domain_result.v0';
const RECEIPT_SCHEMA = 'soulforge.quality_readiness.receipt.v0';
const MODULE_ID = 'soulforge.engineering_engine.quality_readiness';
const ADAPTER_REVISION = 'soulforge.quality_readiness.adapter.v0';
const MODULE_ABI_REVISION = '1.0.0';
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const AUTHORITY_FAMILY = new Set(AUTHORITY_FAMILIES.map((family) => family.key));
const RULE_BY_ID = new Map(QUALITY_READINESS_RULES.map((rule) => [rule.rule_id, rule]));
const SOURCE_IDS = Object.freeze([...new Set(QUALITY_READINESS_RULES.map((rule) => rule.source_ref))]
  .sort(compareCodePoints));
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
const PROFILE_SOURCE_BINDING_FIELDS = Object.freeze([
  'source_id',
  'source_ref',
  'metadata_revision_ref',
  'body_revision_ref',
  'direct_derivation_ref',
  'access_class',
  'direct_source_state',
  'source_lane',
  'claim_ceiling',
]);
const CUTOFF_FIELDS = Object.freeze(['accepted_context_generation', 'assessment_cutoff_ref']);
const DOMAIN_INPUT_FIELDS = Object.freeze(['schema_version', 'rows']);
const ROW_REQUIRED_FIELDS = Object.freeze([
  'case_id',
  'rule_id',
  'stage_ref',
  'applicability',
  'context_refs',
  'authority_bindings',
  'observation_attempted',
  'presence_state',
  'evidence_refs',
  'artifact_token',
]);
const ROW_OPTIONAL_FIELDS = Object.freeze([
  'observation_attempt_ref',
  'not_applicable_basis_ref',
  'approved_evidence_selection_ref',
  'measurement_evaluation_criteria_ref',
  'evaluation_result_ref',
  'evaluation_result_state',
  'conflict_claims',
]);
const SOURCE_BINDING_FIELDS = Object.freeze(['source_id', 'metadata_revision_ref', 'body_revision_ref']);
const RULE_BINDING_FIELDS = Object.freeze(['rule_id', 'stage_ref', 'owner_acceptance_ref']);
const AUTHORITY_BINDING_FIELDS = Object.freeze([
  'authority_family',
  'role_ref',
  'delegation_ref',
  'decision_ref',
]);
const CLAIM_FIELDS = Object.freeze([
  'claim_id',
  'authority_family',
  'source_revision_ref',
  'lineage_ref',
  'applicability',
  'asserted_value',
  'valid_at',
  'known_at',
]);
const FORBIDDEN_KEYS = new Set([
  'raw',
  'raw_text',
  'source_body',
  'source_text',
  'project_payload',
  'payload',
  'transcript',
  'raw_transcript',
  'hidden_reasoning',
  'prompt',
  'completion',
  'private_path',
  'absolute_private_path',
  'absolute_path',
  'source_path',
  'secret',
  'credential',
  'password',
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
const FLOATING_REVISION = /(?:^|[-_.:])(latest|current|head|main|master|develop|development|dev|trunk|branch|release|stable|production|prod)(?:$|[-_.:])|[*^~<>]|\d+\.\d+\.\d+\s*(?:-|\.\.)\s*\d+\.\d+\.\d+|(?:^|[-_.:])\d+(?:\.\d+)*\.[xX](?:$|[-_.:])/iu;
const IMMUTABLE_REVISION_TOKEN = /(?:^|[-_.:])(?:v|r|rev|revision|gen|generation)\d+(?:$|[-_.:])|^[0-9a-f]{7,64}$|^\d+\.\d+\.\d+$/iu;
const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const CODES = Object.freeze({
  INPUT_REFUSED: 'QUALITY_READINESS_INPUT_REFUSED',
  BINDING_REFUSED: 'QUALITY_READINESS_BINDING_REFUSED',
  UNACCEPTED_RULE: 'QUALITY_READINESS_UNACCEPTED_RULE',
  VOCABULARY_REFUSED: 'QUALITY_READINESS_VOCABULARY_REFUSED',
  AUTHORITY_REFUSED: 'QUALITY_READINESS_AUTHORITY_REFUSED',
  PROFILE_SOURCE_REFUSED: 'QUALITY_READINESS_PROFILE_SOURCE_REFUSED',
});

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
    fail(CODES.INPUT_REFUSED, 'input strings must be bounded NFC text without controls', { field });
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(CODES.INPUT_REFUSED, 'private paths, credentials, and payload-bearing strings are refused', { field });
  }
  return value;
}

// A plain-data snapshot makes the result independent from caller object identity and prevents
// freezing or otherwise mutating caller-owned material on the way out.
function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;

  const walk = (value, depth, field) => {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) {
      fail(CODES.INPUT_REFUSED, 'input exceeds bounded plain-data limits', { field });
    }
    if (typeof value === 'string') return assertSafeString(value, field);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) fail(CODES.INPUT_REFUSED, 'only safe integers are accepted', { field });
      return value;
    }
    if (value === null) return null;
    if (typeof value !== 'object' || types.isProxy(value)) {
      fail(CODES.INPUT_REFUSED, 'only plain JSON-compatible data is accepted', { field });
    }
    if (seen.has(value)) fail(CODES.INPUT_REFUSED, 'cycles are refused', { field });
    seen.add(value);

    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (Object.getPrototypeOf(value) !== Array.prototype
          || value.length > MAX.array || Object.keys(value).length !== value.length
          || keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
        fail(CODES.INPUT_REFUSED, 'arrays must be ordinary, bounded, dense, unnamed, and symbol-free', { field });
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const copy = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          fail(CODES.INPUT_REFUSED, 'arrays may not carry hidden or accessor entries', { field: `${field}[${index}]` });
        }
        copy.push(walk(descriptor.value, depth + 1, `${field}[${index}]`));
      }
      return copy;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      fail(CODES.INPUT_REFUSED, 'only ordinary object records are accepted', { field });
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX.keys || keys.some((key) => typeof key !== 'string' || PROTOTYPE_SENSITIVE_KEYS.has(key))) {
      fail(CODES.INPUT_REFUSED, 'record keys must be bounded, non-symbol, and prototype-safe strings', { field });
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const copy = Object.create(null);
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) {
        fail(CODES.INPUT_REFUSED, 'raw source, project payload, and private fields are refused', { field: `${field}.${key}` });
      }
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        fail(CODES.INPUT_REFUSED, 'accessor-backed or hidden input is refused', { field: `${field}.${key}` });
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

  return walk(root, 0, 'request');
}

function assertExactKeys(value, required, optional, field, code = CODES.INPUT_REFUSED) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
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

function assertToken(value, field, code = CODES.INPUT_REFUSED) {
  if (typeof value !== 'string' || !TOKEN.test(value)) {
    fail(code, `${field} must be a bounded opaque token`);
  }
  return value;
}

function assertPinnedRevision(value, field, code = CODES.BINDING_REFUSED) {
  assertToken(value, field, code);
  if (FLOATING_REVISION.test(value)) {
    fail(code, `${field} must not use floating revision text`);
  }
  return value;
}

function assertImmutableRevisionToken(value, field, code = CODES.BINDING_REFUSED) {
  assertPinnedRevision(value, field, code);
  if (!IMMUTABLE_REVISION_TOKEN.test(value)) {
    fail(code, `${field} must carry an immutable revision marker, exact hash, or exact semver`);
  }
  return value;
}

function assertExactRef(ref, field, code = CODES.INPUT_REFUSED) {
  assertExactKeys(ref, REF_REQUIRED_FIELDS, [], field, code);
  if (!isWellFormedRef(ref) || !SHA256_CONTENT_ID.test(ref.content_id)) {
    fail(code, `${field} must be a complete sha256 exact ref`);
  }
  assertToken(ref.entity_id, `${field}.entity_id`, code);
  assertPinnedRevision(ref.revision_id, `${field}.revision_id`, code);
  if (ref.content_hash_alg !== 'sha256') fail(code, `${field}.content_hash_alg must be sha256`);
  return ref;
}

function refKey(ref) {
  return REF_REQUIRED_FIELDS.map((field) => ref[field]).join('\u001f');
}

function assertRefArray(refs, field, { required = false } = {}, code = CODES.INPUT_REFUSED) {
  if (!Array.isArray(refs) || (required && refs.length === 0)) {
    fail(code, `${field} must be an explicit${required ? ' non-empty' : ''} array`);
  }
  const keys = [];
  for (const ref of refs) {
    assertExactRef(ref, field, code);
    keys.push(refKey(ref));
  }
  for (let index = 1; index < keys.length; index += 1) {
    if (compareCodePoints(keys[index - 1], keys[index]) >= 0) {
      fail(code, `${field} must be sorted by exact-ref tuple without duplicates`);
    }
  }
}

function assertApplicability(components) {
  assertExactKeys(components, APPLICABILITY_COMPONENTS, [], 'row.applicability');
  for (const name of APPLICABILITY_COMPONENTS) {
    if (![true, false, APPLICABILITY.UNKNOWN].includes(components[name])) {
      fail(CODES.INPUT_REFUSED, `row.applicability.${name} must be true, false, or unknown`);
    }
  }
}

function assertConflictClaims(claims, row) {
  if (claims === undefined) return;
  if (!Array.isArray(claims) || claims.length < 2 || row.presence_state !== PRESENCE.PRESENT) {
    fail(CODES.INPUT_REFUSED, 'conflict claims require a present observation and two explicit sides');
  }
  let prior = null;
  for (const claim of claims) {
    assertExactKeys(claim, CLAIM_FIELDS, [], 'conflict_claim');
    assertToken(claim.claim_id, 'conflict_claim.claim_id');
    if (prior !== null && compareCodePoints(prior, claim.claim_id) >= 0) {
      fail(CODES.INPUT_REFUSED, 'conflict claims must be sorted and unique by claim_id');
    }
    prior = claim.claim_id;
    if (!AUTHORITY_FAMILY.has(claim.authority_family)) {
      fail(CODES.INPUT_REFUSED, 'conflict claim authority family is unregistered');
    }
    assertExactRef(claim.source_revision_ref, 'conflict_claim.source_revision_ref');
    assertToken(claim.lineage_ref, 'conflict_claim.lineage_ref');
    assertToken(claim.asserted_value, 'conflict_claim.asserted_value');
    if (![true, false, APPLICABILITY.UNKNOWN].includes(claim.applicability)) {
      fail(CODES.INPUT_REFUSED, 'conflict claim applicability must be true, false, or unknown');
    }
    if (!inspectInstant(claim.valid_at).valid || !inspectInstant(claim.known_at).valid
        || compareCodePoints(claim.known_at, claim.valid_at) < 0) {
      fail(CODES.INPUT_REFUSED, 'conflict claim times must be canonical and coherent');
    }
  }
}

function assertSortedUniqueTokenArray(values, field, { required = false } = {}, code = CODES.BINDING_REFUSED) {
  if (!Array.isArray(values) || (required && values.length === 0)) {
    fail(code, `${field} must be an explicit${required ? ' non-empty' : ''} token array`);
  }
  let prior = null;
  for (const value of values) {
    assertToken(value, field, code);
    if (prior !== null && compareCodePoints(prior, value) >= 0) {
      fail(code, `${field} must be sorted and unique`);
    }
    prior = value;
  }
}

function assertE01ManifestNestedShape(manifest) {
  assertSortedUniqueTokenArray(
    manifest.supported_project_classifications,
    'manifest.supported_project_classifications',
    { required: true },
  );
  assertSortedUniqueTokenArray(manifest.rollback_compatible_with, 'manifest.rollback_compatible_with');
  if (manifest.dependency_versions === null || typeof manifest.dependency_versions !== 'object'
      || Array.isArray(manifest.dependency_versions)) {
    fail(CODES.BINDING_REFUSED, 'manifest.dependency_versions must be an exact version record');
  }
  for (const [dependency, version] of Object.entries(manifest.dependency_versions)) {
    assertToken(dependency, 'manifest.dependency_versions key', CODES.BINDING_REFUSED);
    assertPinnedRevision(version, `manifest.dependency_versions.${dependency}`, CODES.BINDING_REFUSED);
  }
}

function exactRefEqual(left, right) {
  return Boolean(left && right)
    && left.entity_id === right.entity_id
    && left.revision_id === right.revision_id
    && left.content_id === right.content_id
    && left.content_hash_alg === right.content_hash_alg;
}

function assertProfileSourceRef(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256
      || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)
      || FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(CODES.PROFILE_SOURCE_REFUSED, `${field} must be a bounded public-safe source ref`);
  }
  return value;
}

function normaliseEvaluationContract(options = {}) {
  if (options === undefined || options === null) options = {};
  if (typeof options !== 'object' || Array.isArray(options)) {
    fail(CODES.BINDING_REFUSED, 'evaluation options must be a bounded internal contract');
  }
  const hasDerived = options.profile_rule_provenance !== undefined;
  const rules = options.rules ?? QUALITY_READINESS_RULES;
  const rulesetRef = options.ruleset_ref ?? QUALITY_READINESS_RULESET_REF;
  const sourcePacketRef = options.source_packet_ref ?? QUALITY_READINESS_SOURCE_PACKET_REF;
  if (!Array.isArray(rules) || rules.length === 0 || !rulesetRef || !sourcePacketRef) {
    fail(CODES.BINDING_REFUSED, 'evaluation contract requires a non-empty exact ruleset and source packet');
  }
  const ruleById = new Map();
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object' || typeof rule.rule_id !== 'string' || ruleById.has(rule.rule_id)) {
      fail(CODES.BINDING_REFUSED, 'evaluation contract rules must have unique rule IDs');
    }
    ruleById.set(rule.rule_id, rule);
  }
  if (!hasDerived) {
    if (!exactRefEqual(rulesetRef, QUALITY_READINESS_RULESET_REF)
        || !exactRefEqual(sourcePacketRef, QUALITY_READINESS_SOURCE_PACKET_REF)
        || rules.length !== QUALITY_READINESS_RULES.length
        || rules.some((rule, index) => rule.rule_id !== QUALITY_READINESS_RULES[index].rule_id)) {
      fail(CODES.BINDING_REFUSED, 'base evaluation contract must use the exact accepted E01 ruleset');
    }
    return Object.freeze({
      derived: false,
      rules,
      rule_by_id: ruleById,
      ruleset_ref: rulesetRef,
      ruleset_revision: QUALITY_READINESS_RULESET_REVISION,
      source_packet_ref: sourcePacketRef,
      profile_rule_provenance: null,
      profile_compilation_trace: null,
    });
  }

  if (!options.profile_rule_provenance || typeof options.profile_rule_provenance !== 'object'
      || Array.isArray(options.profile_rule_provenance)
      || !options.profile_compilation_trace || typeof options.profile_compilation_trace !== 'object') {
    fail(CODES.BINDING_REFUSED, 'derived evaluation requires Profile provenance and a Core compilation trace');
  }
  if (!exactRefEqual(sourcePacketRef, QUALITY_READINESS_SOURCE_PACKET_REF)
      || rulesetRef.entity_id !== 'quality-readiness-ruleset-derived-v0'
      || typeof rulesetRef.revision_id !== 'string'
      || !/^derived:[0-9a-f]{16}$/u.test(rulesetRef.revision_id)
      || !SHA256_CONTENT_ID.test(rulesetRef.content_id)
      || rulesetRef.content_hash_alg !== 'sha256') {
    fail(CODES.BINDING_REFUSED, 'derived evaluation contract requires an exact E01-derived ruleset ref');
  }
  if (typeof options.typed_facts_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(options.typed_facts_sha256)) {
    fail(CODES.BINDING_REFUSED, 'derived evaluation contract requires the exact Typed Facts digest');
  }
  return Object.freeze({
    derived: true,
    rules,
    rule_by_id: ruleById,
    ruleset_ref: rulesetRef,
    ruleset_revision: rulesetRef.revision_id,
    source_packet_ref: sourcePacketRef,
    profile_rule_provenance: options.profile_rule_provenance,
    profile_compilation_trace: options.profile_compilation_trace,
    typed_facts_sha256: options.typed_facts_sha256,
  });
}

function assertSourceBindings(sourceBindings) {
  if (!Array.isArray(sourceBindings) || sourceBindings.length !== SOURCE_IDS.length) {
    fail(CODES.BINDING_REFUSED, 'exactly the three accepted source bindings are required');
  }
  let prior = null;
  const seen = new Set();
  const exactRefs = new Set();
  for (const sourceBinding of sourceBindings) {
    assertExactKeys(sourceBinding, SOURCE_BINDING_FIELDS, [], 'source_binding', CODES.BINDING_REFUSED);
    assertToken(sourceBinding.source_id, 'source_binding.source_id', CODES.BINDING_REFUSED);
    if (prior !== null && compareCodePoints(prior, sourceBinding.source_id) >= 0) {
      fail(CODES.BINDING_REFUSED, 'source bindings must be sorted and unique by source_id');
    }
    prior = sourceBinding.source_id;
    seen.add(sourceBinding.source_id);
    assertExactRef(sourceBinding.metadata_revision_ref, 'source_binding.metadata_revision_ref', CODES.BINDING_REFUSED);
    assertExactRef(sourceBinding.body_revision_ref, 'source_binding.body_revision_ref', CODES.BINDING_REFUSED);
    if (sameExactRef(sourceBinding.metadata_revision_ref, sourceBinding.body_revision_ref)) {
      fail(CODES.BINDING_REFUSED, 'source metadata and body refs must remain distinct');
    }
    for (const ref of [sourceBinding.metadata_revision_ref, sourceBinding.body_revision_ref]) {
      const key = refKey(ref);
      if (exactRefs.has(key)) {
        fail(CODES.BINDING_REFUSED, 'each source metadata/body binding must have a globally distinct exact ref');
      }
      exactRefs.add(key);
    }
  }
  if (seen.size !== SOURCE_IDS.length || SOURCE_IDS.some((sourceId) => !seen.has(sourceId))) {
    fail(CODES.BINDING_REFUSED, 'source bindings do not name the accepted three source IDs exactly');
  }
  return exactRefs;
}

function assertProfileSourceBindings(sourceBindings, evaluationContract, baseExactRefs, manifest) {
  const requiredSourceRefs = [...new Set(Object.values(evaluationContract.profile_rule_provenance)
    .flatMap((provenance) => provenance.source_refs))].sort(compareCodePoints);
  if (!Array.isArray(sourceBindings) || sourceBindings.length !== requiredSourceRefs.length) {
    fail(CODES.PROFILE_SOURCE_REFUSED, 'derived evaluation requires one pinned source binding per Profile source ref');
  }
  const seenSourceRefs = new Set();
  const exactRefs = new Set(baseExactRefs);
  const lanes = new Set();
  let prior = null;
  for (const sourceBinding of sourceBindings) {
    assertExactKeys(sourceBinding, PROFILE_SOURCE_BINDING_FIELDS, [], 'profile_source_binding', CODES.PROFILE_SOURCE_REFUSED);
    assertToken(sourceBinding.source_id, 'profile_source_binding.source_id', CODES.PROFILE_SOURCE_REFUSED);
    const sourceRef = assertProfileSourceRef(sourceBinding.source_ref, 'profile_source_binding.source_ref');
    if (prior !== null && compareCodePoints(prior, sourceRef) >= 0 || seenSourceRefs.has(sourceRef)) {
      fail(CODES.PROFILE_SOURCE_REFUSED, 'Profile source bindings must be sorted uniquely by source_ref');
    }
    prior = sourceRef;
    seenSourceRefs.add(sourceRef);
    for (const field of ['metadata_revision_ref', 'body_revision_ref', 'direct_derivation_ref']) {
      assertExactRef(sourceBinding[field], `profile_source_binding.${field}`, CODES.PROFILE_SOURCE_REFUSED);
      const key = refKey(sourceBinding[field]);
      if (exactRefs.has(key)) {
        fail(CODES.PROFILE_SOURCE_REFUSED, 'Profile source refs must remain globally distinct from source metadata/body/derivation refs');
      }
      exactRefs.add(key);
    }
    if (sameExactRef(sourceBinding.metadata_revision_ref, sourceBinding.body_revision_ref)
        || sameExactRef(sourceBinding.metadata_revision_ref, sourceBinding.direct_derivation_ref)
        || sameExactRef(sourceBinding.body_revision_ref, sourceBinding.direct_derivation_ref)) {
      fail(CODES.PROFILE_SOURCE_REFUSED, 'Profile source metadata, body, and direct-derivation refs must remain distinct');
    }
    const official = sourceBinding.access_class === 'official_public'
      && sourceBinding.direct_source_state === 'direct_confirmed'
      && sourceBinding.source_lane === 'official_public'
      && sourceBinding.claim_ceiling === 'source_supported';
    const synthetic = sourceBinding.access_class === 'public_synthetic'
      && sourceBinding.direct_source_state === 'synthetic_direct_confirmed'
      && sourceBinding.source_lane === 'public_synthetic'
      && sourceBinding.claim_ceiling === 'observed';
    if (!official && !synthetic) {
      fail(CODES.PROFILE_SOURCE_REFUSED, 'Profile source binding must be directly confirmed official-public or explicitly public-synthetic only');
    }
    lanes.add(sourceBinding.source_lane);
  }
  if (seenSourceRefs.size !== requiredSourceRefs.length
      || requiredSourceRefs.some((sourceRef) => !seenSourceRefs.has(sourceRef))) {
    fail(CODES.PROFILE_SOURCE_REFUSED, 'Profile source bindings do not exactly cover the derived Profile provenance');
  }
  if (lanes.size !== 1) {
    fail(CODES.PROFILE_SOURCE_REFUSED, 'Profile source bindings may not mix public-synthetic and official-public lanes');
  }
  const [sourceLane] = lanes;
  if (sourceLane === 'public_synthetic'
      && (manifest.supported_project_classifications.length !== 1
        || manifest.supported_project_classifications[0] !== 'public_synthetic')) {
    fail(CODES.PROFILE_SOURCE_REFUSED, 'public-synthetic Profile evaluation requires a public-synthetic-only manifest classification');
  }
  const bindings = Object.freeze(sourceBindings.map((binding) => ({
    source_id: binding.source_id,
    source_ref: binding.source_ref,
    metadata_revision_ref: cloneRef(binding.metadata_revision_ref),
    body_revision_ref: cloneRef(binding.body_revision_ref),
    direct_derivation_ref: cloneRef(binding.direct_derivation_ref),
    access_class: binding.access_class,
    direct_source_state: binding.direct_source_state,
    source_lane: binding.source_lane,
    claim_ceiling: binding.claim_ceiling,
  })));
  const ruleCanonCeilings = new Map(Object.entries(evaluationContract.profile_rule_provenance)
    .map(([ruleId]) => [ruleId, sourceLane === 'public_synthetic' ? 'observed' : 'source_supported']));
  return Object.freeze({
    bindings,
    source_lane: sourceLane,
    rule_canon_ceilings: ruleCanonCeilings,
  });
}

function acceptedRuleBindingMap(ruleBindings, ruleById = RULE_BY_ID) {
  if (!Array.isArray(ruleBindings)) fail(CODES.BINDING_REFUSED, 'accepted rule bindings must be an explicit array');
  const byRuleId = new Map();
  let prior = null;
  for (const ruleBinding of ruleBindings) {
    assertExactKeys(ruleBinding, RULE_BINDING_FIELDS, [], 'accepted_rule_binding', CODES.BINDING_REFUSED);
    assertToken(ruleBinding.rule_id, 'accepted_rule_binding.rule_id', CODES.BINDING_REFUSED);
    if (!ruleById.has(ruleBinding.rule_id) || byRuleId.has(ruleBinding.rule_id)
        || (prior !== null && compareCodePoints(prior, ruleBinding.rule_id) >= 0)) {
      fail(CODES.BINDING_REFUSED, 'accepted rule bindings must be known, sorted, and unique');
    }
    prior = ruleBinding.rule_id;
    assertExactRef(ruleBinding.stage_ref, 'accepted_rule_binding.stage_ref', CODES.BINDING_REFUSED);
    assertExactRef(ruleBinding.owner_acceptance_ref, 'accepted_rule_binding.owner_acceptance_ref', CODES.BINDING_REFUSED);
    byRuleId.set(ruleBinding.rule_id, ruleBinding);
  }
  return byRuleId;
}

function validateManifestBinding(manifest, binding, cutoffs, evaluationContract) {
  try {
    assertExactKeys(manifest, REQUIRED_MANIFEST_FIELDS, [], 'manifest', CODES.BINDING_REFUSED);
    validateManifest(manifest);
    assertE01ManifestNestedShape(manifest);
    assertCanonCeiling(manifest.claim_ceiling);
    if (manifest.module_id !== MODULE_ID
        || manifest.input_schema_revision !== DOMAIN_INPUT_SCHEMA
        || manifest.output_schema_revision !== ASSESSMENT_SCHEMA
        || manifest.authority_ceiling !== 'project_contract_baseline'
        || manifest.claim_ceiling !== 'source_supported'
        || manifest.execution_mode !== 'deterministic_only'
        || manifest.migration_requirement !== 'none') {
      fail(CODES.BINDING_REFUSED, 'manifest is not the exact E01 deterministic compatibility manifest');
    }

    assertExactKeys(
      binding,
      BINDING_FIELDS,
      evaluationContract.derived ? ['profile_source_bindings'] : [],
      'binding',
      CODES.BINDING_REFUSED,
    );
    for (const field of [
      'engine_contract_revision', 'snapshot_schema_revision', 'engine_release_version',
      'module_abi_revision', 'ruleset_revision', 'adapter_revision',
    ]) assertPinnedRevision(binding[field], `binding.${field}`, CODES.BINDING_REFUSED);
    for (const field of [
      'common_knowledge_revision', 'project_knowledge_revision',
      'policy_bundle_revision', 'acl_policy_revision',
    ]) assertImmutableRevisionToken(binding[field], `binding.${field}`, CODES.BINDING_REFUSED);
    validateBinding(binding, { engineAbiVersion: binding.module_abi_revision });
    for (const field of [
      'engine_ref', 'project_binding_ref', 'objective_ref', 'policy_ref', 'snapshot_ref',
      'source_packet_ref', 'ruleset_ref',
    ]) assertExactRef(binding[field], `binding.${field}`, CODES.BINDING_REFUSED);
    if (binding.engine_contract_revision !== CONTRACT_REVISION
        || binding.snapshot_schema_revision !== DOMAIN_INPUT_SCHEMA
        || binding.module_abi_revision !== MODULE_ABI_REVISION
        || binding.execution_mode !== 'deterministic_only'
        || binding.ruleset_revision !== evaluationContract.ruleset_revision
        || binding.adapter_revision !== ADAPTER_REVISION
        || !sameExactRef(binding.source_packet_ref, evaluationContract.source_packet_ref)
        || !sameExactRef(binding.ruleset_ref, evaluationContract.ruleset_ref)
        || !Array.isArray(binding.module_bindings)
        || binding.module_bindings.length !== 1
        || canonicalDigest('soulforge.quality_readiness.manifest-binding.v0', binding.module_bindings[0])
          !== canonicalDigest('soulforge.quality_readiness.manifest-binding.v0', manifest)) {
      fail(CODES.BINDING_REFUSED, 'binding is stale, floating, mismatched, or not exact for E01');
    }
    const sourceExactRefs = assertSourceBindings(binding.source_bindings);
    const profileSourceState = evaluationContract.derived
      ? assertProfileSourceBindings(binding.profile_source_bindings, evaluationContract, sourceExactRefs, manifest)
      : null;
    const ruleBindings = acceptedRuleBindingMap(binding.accepted_rule_bindings, evaluationContract.rule_by_id);

    assertExactKeys(cutoffs, CUTOFF_FIELDS, [], 'cutoffs', CODES.BINDING_REFUSED);
    assertExactRef(cutoffs.assessment_cutoff_ref, 'cutoffs.assessment_cutoff_ref', CODES.BINDING_REFUSED);
    if (!Number.isSafeInteger(cutoffs.accepted_context_generation)
        || cutoffs.accepted_context_generation !== binding.accepted_context_generation) {
      fail(CODES.BINDING_REFUSED, 'cutoffs must pin the current accepted context generation exactly');
    }
    return {
      accepted_rule_bindings: ruleBindings,
      module_binding_revision: bindingRevision(binding),
      binding_sha256: canonicalDigest('soulforge.quality_readiness.binding.v0', { manifest, binding, cutoffs }),
      profile_source_bindings: profileSourceState?.bindings ?? null,
      profile_evaluation_lane: profileSourceState?.source_lane ?? null,
      profile_rule_canon_ceilings: profileSourceState?.rule_canon_ceilings ?? new Map(),
    };
  } catch (error) {
    if (error instanceof ContractError
        && [CODES.BINDING_REFUSED, CODES.PROFILE_SOURCE_REFUSED].includes(error.code)) throw error;
    fail(CODES.BINDING_REFUSED, 'common module binding validation refused this E01 binding');
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
    fail(CODES.AUTHORITY_REFUSED, 'typed authority bindings must be an explicit array');
  }
  if (authorityBindings.length === 0) return false;
  const required = new Set(rule.required_authority_families);
  const actual = new Set();
  let prior = null;
  for (const authorityBinding of authorityBindings) {
    assertExactKeys(authorityBinding, AUTHORITY_BINDING_FIELDS, [], 'authority_binding', CODES.AUTHORITY_REFUSED);
    if (!AUTHORITY_FAMILY.has(authorityBinding.authority_family)
        || !required.has(authorityBinding.authority_family)
        || (prior !== null && compareCodePoints(prior, authorityBinding.authority_family) >= 0)) {
      fail(CODES.AUTHORITY_REFUSED, 'authority bindings must use only rule-required registered families in stable order');
    }
    prior = authorityBinding.authority_family;
    actual.add(authorityBinding.authority_family);
    for (const field of ['role_ref', 'delegation_ref', 'decision_ref']) {
      assertExactRef(authorityBinding[field], `authority_binding.${field}`, CODES.AUTHORITY_REFUSED);
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
    'observation_attempt_ref', 'not_applicable_basis_ref',
    'approved_evidence_selection_ref', 'measurement_evaluation_criteria_ref',
    'evaluation_result_ref',
  ]) {
    if (Object.hasOwn(row, field)) nonAuthorityRefs.push(row[field]);
  }
  const forbidden = new Set(nonAuthorityRefs.map(refKey));
  const authorityRefs = new Set();
  for (const authorityBinding of row.authority_bindings) {
    for (const field of ['role_ref', 'delegation_ref', 'decision_ref']) {
      const key = refKey(authorityBinding[field]);
      if (forbidden.has(key) || authorityRefs.has(key)) {
        fail(CODES.AUTHORITY_REFUSED,
          'authority role, delegation, and decision refs must be mutually distinct and disjoint from evidence/context refs');
      }
      authorityRefs.add(key);
    }
  }
}

function validateRow(row, acceptedRuleBindings, ruleById) {
  assertExactKeys(row, ROW_REQUIRED_FIELDS, ROW_OPTIONAL_FIELDS, 'row');
  assertToken(row.case_id, 'row.case_id');
  assertToken(row.rule_id, 'row.rule_id');
  const rule = ruleById.get(row.rule_id);
  if (!rule) fail(CODES.INPUT_REFUSED, 'row rule_id is not a known candidate rule');
  const acceptedRuleBinding = acceptedRuleBindings.get(row.rule_id);
  if (!acceptedRuleBinding) {
    fail(CODES.UNACCEPTED_RULE, 'an unaccepted candidate rule remains data and cannot execute');
  }
  assertExactRef(row.stage_ref, 'row.stage_ref');
  if (!sameExactRef(row.stage_ref, acceptedRuleBinding.stage_ref)) {
    fail(CODES.INPUT_REFUSED, 'row stage ref does not exactly match its accepted rule binding');
  }

  assertApplicability(row.applicability);
  const missingContextFields = inspectContextRefs(row.context_refs, rule);
  const authorityPresent = authorityBindingPresent(row.authority_bindings, rule);
  const hasFalseApplicability = APPLICABILITY_COMPONENTS.some((field) => row.applicability[field] === false);
  if (hasFalseApplicability) {
    if (!Object.hasOwn(row, 'not_applicable_basis_ref')) {
      fail(CODES.INPUT_REFUSED, 'resolved not-applicable output requires an exact basis ref');
    }
    assertExactRef(row.not_applicable_basis_ref, 'row.not_applicable_basis_ref');
  } else if (Object.hasOwn(row, 'not_applicable_basis_ref')) {
    fail(CODES.INPUT_REFUSED, 'not-applicable basis is only valid with an explicit false component');
  }
  if (typeof row.observation_attempted !== 'boolean' || !Object.values(PRESENCE).includes(row.presence_state)) {
    fail(CODES.INPUT_REFUSED, 'row observation attempt and presence state are invalid');
  }
  if (row.observation_attempted) {
    if (!Object.hasOwn(row, 'observation_attempt_ref')) {
      fail(CODES.INPUT_REFUSED, 'an attempted observation requires its exact attempt ref');
    }
    assertExactRef(row.observation_attempt_ref, 'row.observation_attempt_ref');
  } else if (Object.hasOwn(row, 'observation_attempt_ref')) {
    fail(CODES.INPUT_REFUSED, 'an unattempted observation may not claim an attempt ref');
  }

  const observationRequired = row.presence_state !== PRESENCE.UNKNOWN;
  if (observationRequired && !row.observation_attempted) {
    fail(CODES.INPUT_REFUSED, 'present or confirmed-absent evidence requires an observation attempt');
  }
  assertRefArray(row.evidence_refs, 'row.evidence_refs', { required: row.presence_state === PRESENCE.PRESENT });
  if (row.presence_state === PRESENCE.UNKNOWN && row.evidence_refs.length !== 0) {
    fail(CODES.INPUT_REFUSED, 'an inaccessible observation cannot carry resolved evidence refs');
  }

  if (!rule.allowed_artifact_tokens.includes(row.artifact_token)
      || (row.artifact_token !== null && (typeof row.artifact_token !== 'string' || !isQualityReadinessArtifactToken(row.artifact_token)))) {
    fail(CODES.VOCABULARY_REFUSED, 'artifact tokens require an exact declared mapping; near synonyms are refused');
  }

  for (const field of ['approved_evidence_selection_ref', 'measurement_evaluation_criteria_ref', 'evaluation_result_ref']) {
    if (Object.hasOwn(row, field)) assertExactRef(row[field], `row.${field}`);
  }
  if (Object.hasOwn(row, 'evaluation_result_state')
      && !['criteria_met', 'criteria_not_met', 'unknown'].includes(row.evaluation_result_state)) {
    fail(CODES.INPUT_REFUSED, 'evaluation result state is invalid');
  }
  if (Object.hasOwn(row, 'evaluation_result_ref') !== Object.hasOwn(row, 'evaluation_result_state')) {
    fail(CODES.INPUT_REFUSED, 'evaluation result ref and state must be supplied together');
  }
  assertConflictClaims(row.conflict_claims, row);
  assertAuthorityRefSeparation(row, acceptedRuleBinding);
  return {
    row,
    rule,
    accepted_rule_binding: acceptedRuleBinding,
    authority_present: authorityPresent,
    missing_context_fields: missingContextFields,
  };
}

function validateDomainInput(domainInput, acceptedRuleBindings, ruleById, ruleCanonCeilings = new Map()) {
  assertExactKeys(domainInput, DOMAIN_INPUT_FIELDS, [], 'domain_input');
  if (domainInput.schema_version !== DOMAIN_INPUT_SCHEMA || !Array.isArray(domainInput.rows)
      || domainInput.rows.length > MAX.array) {
    fail(CODES.INPUT_REFUSED, 'domain input schema or rows are invalid');
  }
  const seenCases = new Set();
  const seenRules = new Set();
  const prepared = domainInput.rows.map((row) => {
    const result = validateRow(row, acceptedRuleBindings, ruleById);
    if (seenCases.has(row.case_id) || seenRules.has(row.rule_id)) {
      fail(CODES.INPUT_REFUSED, 'each case and accepted rule may execute at most once');
    }
    seenCases.add(row.case_id);
    seenRules.add(row.rule_id);
    return {
      ...result,
      canon_claim_ceiling: ruleCanonCeilings.get(row.rule_id) ?? 'source_supported',
    };
  });
  if (prepared.length !== acceptedRuleBindings.size || [...acceptedRuleBindings.keys()].some((ruleId) => !seenRules.has(ruleId))) {
    fail(CODES.INPUT_REFUSED, 'each explicit accepted rule requires exactly one bounded domain row');
  }
  return prepared.sort((a, b) => compareCodePoints(a.row.rule_id, b.row.rule_id)
    || compareCodePoints(a.row.case_id, b.row.case_id));
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function sourceConflictProjection(claims) {
  let record;
  try {
    record = recordSourceConflict(claims);
  } catch {
    fail(CODES.INPUT_REFUSED, 'two-sided source disagreement is not a valid retained conflict');
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

function axisFields(state, canonClaimCeiling = 'source_supported') {
  const evidenceByState = Object.freeze({
    [GAP_TYPE.SATISFIED]: 'source_sufficient',
    [GAP_TYPE.MISSING]: 'source_referenced',
    [GAP_TYPE.UNKNOWN]: 'unknown',
    [GAP_TYPE.CONFLICT]: 'contradicted',
    not_applicable: 'not_applicable',
  });
  const evidence_claim_ceiling = evidenceByState[state];
  assertCanonCeiling(canonClaimCeiling);
  assertEvidenceCeiling(evidence_claim_ceiling);
  return { canon_claim_ceiling: canonClaimCeiling, evidence_claim_ceiling };
}

function resultBase(row, rule, acceptedRuleBinding) {
  const context_refs = {};
  for (const field of Object.keys(row.context_refs)) context_refs[field] = cloneRef(row.context_refs[field]);
  const result = {
    case_id: row.case_id,
    rule_id: rule.rule_id,
    stage_ref: cloneRef(row.stage_ref),
    owner_acceptance_ref: cloneRef(acceptedRuleBinding.owner_acceptance_ref),
    source_ref: rule.source_ref,
    source_locator: rule.source_locator,
    source_modality: rule.source_modality,
    artifact_token: row.artifact_token,
    applicability_components: { ...row.applicability },
    context_refs,
    authority_bindings: row.authority_bindings.map(cloneAuthorityBinding),
    observation_attempted: row.observation_attempted,
    presence_state: row.presence_state,
    evidence_refs: row.evidence_refs.map(cloneRef),
  };
  if (Object.hasOwn(row, 'observation_attempt_ref')) result.observation_attempt_ref = cloneRef(row.observation_attempt_ref);
  if (Object.hasOwn(row, 'not_applicable_basis_ref')) result.not_applicable_basis_ref = cloneRef(row.not_applicable_basis_ref);
  for (const field of ['approved_evidence_selection_ref', 'measurement_evaluation_criteria_ref', 'evaluation_result_ref']) {
    if (Object.hasOwn(row, field)) result[field] = cloneRef(row[field]);
  }
  if (Object.hasOwn(row, 'evaluation_result_state')) result.evaluation_result_state = row.evaluation_result_state;
  return result;
}

function evaluateRow({ row, rule, accepted_rule_binding, authority_present, missing_context_fields, canon_claim_ceiling }) {
  const base = resultBase(row, rule, accepted_rule_binding);
  const applicability = resolveApplicability(row.applicability);
  if (applicability === APPLICABILITY.NO) {
    return {
      ...base,
      ...axisFields('not_applicable', canon_claim_ceiling),
      state: 'not_applicable',
      reason_code: 'not_applicable',
      authority_hold: false,
    };
  }
  if (applicability === APPLICABILITY.UNKNOWN) {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN, canon_claim_ceiling), state: GAP_TYPE.UNKNOWN, reason_code: 'applicability_unknown', authority_hold: false };
  }
  if (missing_context_fields.length > 0) {
    return {
      ...base,
      ...axisFields(GAP_TYPE.UNKNOWN, canon_claim_ceiling),
      state: GAP_TYPE.UNKNOWN,
      reason_code: 'context_facts_missing',
      authority_hold: false,
    };
  }
  if (!authority_present) {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN, canon_claim_ceiling), state: GAP_TYPE.UNKNOWN, reason_code: 'authority_missing', authority_hold: true };
  }
  if (row.conflict_claims !== undefined) {
    return {
      ...base,
      ...axisFields(GAP_TYPE.CONFLICT, canon_claim_ceiling),
      state: GAP_TYPE.CONFLICT,
      reason_code: 'retained_source_conflict',
      authority_hold: false,
      conflict: sourceConflictProjection(row.conflict_claims),
    };
  }
  if (!row.observation_attempted || row.presence_state === PRESENCE.UNKNOWN) {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN, canon_claim_ceiling), state: GAP_TYPE.UNKNOWN, reason_code: 'observation_unavailable', authority_hold: false };
  }
  if (row.presence_state === PRESENCE.ABSENCE_CONFIRMED) {
    return { ...base, ...axisFields(GAP_TYPE.MISSING, canon_claim_ceiling), state: GAP_TYPE.MISSING, reason_code: 'absence_confirmed', authority_hold: false };
  }
  const missingFacts = rule.sufficiency_fields.filter((field) => !Object.hasOwn(row, field));
  if (missingFacts.length > 0) {
    return {
      ...base,
      ...axisFields(GAP_TYPE.UNKNOWN, canon_claim_ceiling),
      state: GAP_TYPE.UNKNOWN,
      reason_code: 'sufficiency_facts_missing',
      authority_hold: false,
    };
  }
  if (!Object.hasOwn(row, 'evaluation_result_ref') || row.evaluation_result_state === 'unknown') {
    return { ...base, ...axisFields(GAP_TYPE.UNKNOWN, canon_claim_ceiling), state: GAP_TYPE.UNKNOWN, reason_code: 'evaluation_unknown', authority_hold: false };
  }
  if (row.evaluation_result_state === 'criteria_not_met') {
    return { ...base, ...axisFields(GAP_TYPE.CONFLICT, canon_claim_ceiling), state: GAP_TYPE.CONFLICT, reason_code: 'evaluation_not_met', authority_hold: false };
  }
  return { ...base, ...axisFields(GAP_TYPE.SATISFIED, canon_claim_ceiling), state: GAP_TYPE.SATISFIED, reason_code: 'evidence_sufficient', authority_hold: false };
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

function encodeTypedValue(value) {
  if (value === null) return { kind: 'null' };
  if (typeof value === 'string') return { kind: 'string', value };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (typeof value === 'number') return { kind: 'number', value };
  if (Array.isArray(value)) return { kind: 'array', value: value.map(encodeTypedValue) };
  if (value && typeof value === 'object') {
    return {
      kind: 'object',
      value: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeTypedValue(child)])),
    };
  }
  fail(CODES.INPUT_REFUSED, 'canonical digest input contains an unsupported value type');
}

function arrayRulesFor(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) arrayRulesFor(child, `${path}[]`, rules);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      arrayRulesFor(child, path ? `${path}.${key}` : key, rules);
    }
  }
  return rules;
}

function canonicalDigest(domain, value) {
  const encoded = encodeTypedValue(value);
  return sha256Hex(`${domain}\n${canonicalise(encoded, arrayRulesFor(encoded))}`);
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

function aggregateCanonClaimCeiling(results) {
  const order = new Map([
    ['rejected_or_blocked', 0],
    ['observed', 1],
    ['source_supported', 2],
    ['validated_private', 3],
    ['canon_candidate', 4],
    ['canon_entry', 5],
  ]);
  if (results.length === 0) return assertCanonCeiling('observed');
  let aggregate = 'canon_entry';
  for (const result of results) {
    assertCanonCeiling(result.canon_claim_ceiling);
    if (order.get(result.canon_claim_ceiling) < order.get(aggregate)) {
      aggregate = result.canon_claim_ceiling;
    }
  }
  return assertCanonCeiling(aggregate);
}

function clampCanonClaimCeilingForProfileLane(canonClaimCeiling, profileEvaluationLane) {
  assertCanonCeiling(canonClaimCeiling);
  if (profileEvaluationLane === null || profileEvaluationLane === undefined || profileEvaluationLane === 'official_public') {
    return canonClaimCeiling;
  }
  if (profileEvaluationLane === 'public_synthetic') {
    return assertCanonCeiling('observed');
  }
  fail(CODES.PROFILE_SOURCE_REFUSED, 'derived Profile evaluation lane is not recognised for canon-ceiling aggregation');
}

/**
 * Assesses only quality-evidence readiness for exact accepted rule rows.
 *
 * @param {{manifest: object, binding: object, domain_input: object, cutoffs: object}} request
 * @returns {{assessment: object, domain_result: object, receipt: object}}
 */
export function assessQualityReadiness(request, options = {}) {
  const evaluationContract = normaliseEvaluationContract(options);
  const input = snapshotPlainData(request);
  assertExactKeys(input, ROOT_FIELDS, [], 'request');
  const bindingState = validateManifestBinding(input.manifest, input.binding, input.cutoffs, evaluationContract);
  const prepared = validateDomainInput(
    input.domain_input,
    bindingState.accepted_rule_bindings,
    evaluationContract.rule_by_id,
    bindingState.profile_rule_canon_ceilings,
  );
  const results = prepared.map(evaluateRow);
  const counts = countsFor(results);
  const canon_claim_ceiling = clampCanonClaimCeilingForProfileLane(
    aggregateCanonClaimCeiling(results),
    bindingState.profile_evaluation_lane,
  );
  const evidence_claim_ceiling = aggregateEvidenceCeiling(counts);
  const domain_result = {
    schema_version: DOMAIN_RESULT_SCHEMA,
    canon_claim_ceiling,
    evidence_claim_ceiling,
    results,
    counts: { ...counts },
  };
  const assessment = {
    schema_version: ASSESSMENT_SCHEMA,
    assessment_kind: 'quality_evidence_readiness',
    canon_claim_ceiling,
    evidence_claim_ceiling,
    overall_state: overallState(counts),
    result_counts: { ...counts },
  };
  const normalizedInput = {
    manifest: input.manifest,
    binding: input.binding,
    domain_input: {
      schema_version: input.domain_input.schema_version,
      rows: prepared.map(({ row }) => row),
    },
    cutoffs: input.cutoffs,
  };
  const receipt = {
    schema_version: RECEIPT_SCHEMA,
    digests: {
      input_sha256: canonicalDigest('soulforge.quality_readiness.input.v0', normalizedInput),
      binding_sha256: bindingState.binding_sha256,
      assessment_sha256: canonicalDigest('soulforge.quality_readiness.assessment.v0', assessment),
      domain_result_sha256: canonicalDigest('soulforge.quality_readiness.domain_result.v0', domain_result),
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
  if (evaluationContract.derived) {
    receipt.bindings.profile_source_bindings = bindingState.profile_source_bindings;
    receipt.bindings.profile_evaluation_lane = bindingState.profile_evaluation_lane;
    receipt.bindings.typed_facts_sha256 = evaluationContract.typed_facts_sha256;
    receipt.bindings.profile_compilation_trace = evaluationContract.profile_compilation_trace;
  }
  return freezeDeep({ assessment, domain_result, receipt });
}
