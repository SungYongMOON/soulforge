// The one deep admission seam between the generic Core evaluator call and Safety Hazard's
// legacy request evaluator. It accepts only a closed Core TypedProjectFacts envelope and a
// Core effective-ruleset envelope, snapshots both before any nested property read, then emits
// the exact request and receipt material that the domain evaluator may use.
import types from 'node:util/types';
import { timingSafeEqual } from 'node:crypto';

import {
  adaptProjectEvidence,
  arrayOrderRules,
  COMPILATION_TRACE_SCHEMA_VERSION,
  EFFECTIVE_RULE_SET_SCHEMA_VERSION,
  validateCanonicalInstant,
  withoutNulls,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { SAFETY_HAZARD_COMPILER_ADAPTER_SCHEMA_VERSION } from '../compiler/safety_hazard_compiler_adapter.mjs';
import { AUTHORITY_FAMILIES } from '../../../core/validators/authority.mjs';
import {
  SAFETY_HAZARD_RULES,
  SAFETY_HAZARD_RULESET_REF,
  SAFETY_HAZARD_RULESET_SCHEMA,
  SAFETY_HAZARD_SOURCE_PACKET_REF,
} from '../rules/safety_hazard_rules.mjs';

export const SAFETY_HAZARD_CORE_TYPED_FACTS_SCHEMA = 'soulforge.typed_project_facts.v0';
export const SAFETY_HAZARD_CORE_FACT_KIND = 'safety_hazard_evaluation_request';

const KNOWN_AUTHORITY_FAMILIES = new Set(AUTHORITY_FAMILIES.map((family) => family.key));
const PROJECT_BINDING_REQUIRED_KEYS = Object.freeze([
  'schema_version', 'project_id', 'domain_engine_id', 'binding_revision_hash', 'source_manifest_ref',
]);
const PROJECT_BINDING_OPTIONAL_KEYS = Object.freeze([
  'authority_family', 'document_refs', 'valid_at', 'known_at',
]);

export const SAFETY_HAZARD_CORE_FACTS_ERROR_CODES = Object.freeze({
  CORE_FACTS_INVALID: 'SH_CORE_FACTS_INVALID',
  CORE_FACTS_TAMPERED: 'SH_CORE_FACTS_TAMPERED',
  EFFECTIVE_RULESET_INVALID: 'SH_EFFECTIVE_RULESET_INVALID',
  EFFECTIVE_RULESET_TAMPERED: 'SH_EFFECTIVE_RULESET_TAMPERED',
  PROFILE_EVALUATION_UNSUPPORTED: 'SH_PROFILE_EVALUATION_UNSUPPORTED',
});

const CORE_PROJECT_BINDING_SCHEMA = 'soulforge.project_binding.v0';
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[a-f0-9]{64}$/u;
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/u;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX = Object.freeze({ depth: 24, nodes: 4096, array: 128, keys: 64, string: 4096 });
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

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const fail = (code, message, detail = {}) => { throw new ContractError(code, message, detail); };

export function snapshotSafetyHazardPlainData(raw, label, code, { allowAliases = false } = {}) {
  let nodes = 0;
  const ancestors = new Set();
  const seen = new Set();
  const visit = (value, path, depth) => {
    nodes += 1;
    if (nodes > MAX.nodes || depth > MAX.depth) fail(code, `${path} exceeds bounded input limits`);
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.length > MAX.string || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
        fail(code, `${path} is not a bounded NFC string`);
      }
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) fail(code, `${path} may contain only safe integer numbers`);
      return value;
    }
    if (types.isProxy(value) || !value || typeof value !== 'object') {
      fail(code, `${path} must be non-proxy plain JSON-like data`);
    }
    if (ancestors.has(value)) fail(code, `${path} is cyclic`);
    if (!allowAliases && seen.has(value)) fail(code, `${path} aliases another supplied object`);
    ancestors.add(value);
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX.array) {
          fail(code, `${path} must be a bounded Array.prototype array`);
        }
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const own = Reflect.ownKeys(value);
        if (own.some((key) => typeof key !== 'string' || (key !== 'length' && !ARRAY_INDEX.test(key)))) {
          fail(code, `${path} contains symbol, sparse, or named array entries`);
        }
        const out = [];
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            fail(code, `${path}[${index}] is accessor-backed or absent`);
          }
          out.push(visit(descriptor.value, `${path}[${index}]`, depth + 1));
        }
        return out;
      }
      if (Object.getPrototypeOf(value) !== Object.prototype) {
        fail(code, `${path} must use Object.prototype`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const own = Reflect.ownKeys(value);
      if (own.length > MAX.keys || own.some((key) => typeof key !== 'string' || UNSAFE_KEYS.has(key))) {
        fail(code, `${path} has unsafe, symbol, or excessive keys`);
      }
      const out = {};
      for (const key of own) {
        const descriptor = descriptors[key];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          fail(code, `${path}.${key} is accessor-backed or hidden`);
        }
        Object.defineProperty(out, key, {
          value: visit(descriptor.value, `${path}.${key}`, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return out;
    } finally {
      ancestors.delete(value);
    }
  };
  return visit(raw, label, 0);
}

function assertAllowedKeys(value, required, optional, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, `${label} must be a plain object`);
  }
  const actualKeys = Object.keys(value);
  for (const req of required) {
    if (!Object.hasOwn(value, req)) {
      fail(code, `${label} is missing required key ${req}`);
    }
  }
  const allowedSet = new Set([...required, ...optional]);
  for (const key of actualKeys) {
    if (!allowedSet.has(key)) {
      fail(code, `${label} has an invalid closed key set`);
    }
  }
}

function assertExactKeys(value, expected, label, code) {
  assertAllowedKeys(value, expected, [], label, code);
}

function assertSafeText(value, label, code, { token = false } = {}) {
  if (typeof value !== 'string' || !value || value.length > MAX.string || value.normalize('NFC') !== value) {
    fail(code, `${label} must be a bounded non-empty NFC string`);
  }
  if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    fail(code, `${label} contains a forbidden path or secret sentinel`);
  }
  if (token && !PROJECT_ID.test(value)) fail(code, `${label} must be a bounded project token`);
  return value;
}

function assertExactRef(value, label, code) {
  assertExactKeys(value, ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'], label, code);
  const ref = {
    entity_id: assertSafeText(value.entity_id, `${label}.entity_id`, code),
    revision_id: assertSafeText(value.revision_id, `${label}.revision_id`, code),
    content_id: assertSafeText(value.content_id, `${label}.content_id`, code),
    content_hash_alg: value.content_hash_alg,
  };
  if (!SHA256_CONTENT_ID.test(ref.content_id) || ref.content_hash_alg !== 'sha256') {
    fail(code, `${label} must carry an exact sha256 content id`);
  }
  return ref;
}

function canonicalMaterial(value) {
  const clean = withoutNulls(value);
  return canonicalise(clean, arrayOrderRules(clean));
}

function sameMaterial(left, right) {
  return canonicalMaterial(left) === canonicalMaterial(right);
}

function constantTimeDigestEquals(actual, expected) {
  if (typeof actual !== 'string' || !SHA256.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, 'utf8'), Buffer.from(expected, 'utf8'));
}

function validateCoreProjectBinding(raw, code, factsTimes = null) {
  assertAllowedKeys(raw, PROJECT_BINDING_REQUIRED_KEYS, PROJECT_BINDING_OPTIONAL_KEYS, 'project_binding_ref', code);
  if (raw.schema_version !== CORE_PROJECT_BINDING_SCHEMA || raw.domain_engine_id !== 'safety_hazard') {
    fail(code, 'project binding schema or domain engine is invalid');
  }
  const binding = {
    schema_version: raw.schema_version,
    project_id: assertSafeText(raw.project_id, 'project_binding_ref.project_id', code, { token: true }),
    domain_engine_id: raw.domain_engine_id,
    binding_revision_hash: raw.binding_revision_hash,
    source_manifest_ref: assertSafeText(raw.source_manifest_ref, 'project_binding_ref.source_manifest_ref', code),
  };
  if (!SHA256.test(binding.binding_revision_hash)) {
    fail(code, 'project_binding_ref.binding_revision_hash must be SHA-256 hex');
  }
  if (raw.authority_family !== undefined) {
    assertSafeText(raw.authority_family, 'project_binding_ref.authority_family', code);
    if (!KNOWN_AUTHORITY_FAMILIES.has(raw.authority_family)) {
      fail(code, 'project_binding_ref.authority_family is not a known authority family');
    }
    binding.authority_family = raw.authority_family;
  }
  if (raw.valid_at !== undefined) {
    const validAt = validateCanonicalInstant(raw.valid_at, 'project_binding_ref.valid_at');
    if (factsTimes && factsTimes.valid_at && validAt !== factsTimes.valid_at) {
      fail(code, 'project_binding_ref.valid_at does not match typed facts valid_at');
    }
    binding.valid_at = validAt;
  }
  if (raw.known_at !== undefined) {
    const knownAt = validateCanonicalInstant(raw.known_at, 'project_binding_ref.known_at');
    if (factsTimes && factsTimes.known_at && knownAt !== factsTimes.known_at) {
      fail(code, 'project_binding_ref.known_at does not match typed facts known_at');
    }
    binding.known_at = knownAt;
  }
  if (binding.valid_at && binding.known_at) {
    if (compareCodePoints(binding.known_at, binding.valid_at) < 0) {
      fail(code, 'project_binding_ref.known_at must not precede valid_at');
    }
  }
  if (raw.document_refs !== undefined) {
    if (!Array.isArray(raw.document_refs)) {
      fail(code, 'project_binding_ref.document_refs must be an array');
    }
    binding.document_refs = raw.document_refs.map((ref, idx) => assertSafeText(ref, `project_binding_ref.document_refs[${idx}]`, code));
  }
  return binding;
}

function validateTimes(validAt, knownAt, code, label = 'typed facts') {
  const valid = validateCanonicalInstant(validAt, `${label}.valid_at`);
  const known = validateCanonicalInstant(knownAt, `${label}.known_at`);
  if (compareCodePoints(known, valid) < 0) fail(code, `${label}.known_at must not precede valid_at`);
  return { valid_at: valid, known_at: known };
}

function requestBindingClosure(request, code) {
  assertExactKeys(request, ['manifest', 'binding', 'domain_input', 'cutoffs'], 'safety request', code);
  if (!request.binding || !request.cutoffs || typeof request.binding !== 'object' || typeof request.cutoffs !== 'object') {
    fail(code, 'safety request binding/cutoffs are invalid');
  }
  const projectBindingRef = assertExactRef(request.binding.project_binding_ref, 'safety request binding.project_binding_ref', code);
  const cutoffRef = assertExactRef(request.cutoffs.assessment_cutoff_ref, 'safety request cutoffs.assessment_cutoff_ref', code);
  return { project_binding_ref: projectBindingRef, assessment_cutoff_ref: cutoffRef };
}

export function calculateSafetyHazardCoreFactsDigest(facts) {
  return sha256Hex(`soulforge.project_observations.v0\n${canonicalMaterial(facts)}`);
}

export function calculateSafetyHazardRequestDigest(request) {
  return sha256Hex(`soulforge.safety_hazard.core_request.v0\n${canonicalMaterial(request)}`);
}

export function createSafetyHazardTypedProjectFacts(raw) {
  const input = snapshotSafetyHazardPlainData(raw, 'typed facts factory input', SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID);
  assertExactKeys(input, ['project_binding', 'request', 'valid_at', 'known_at'], 'typed facts factory input', SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID);
  const times = validateTimes(input.valid_at, input.known_at, SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID, 'typed facts factory input');
  const binding = validateCoreProjectBinding(input.project_binding, SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID, times);
  const closure = requestBindingClosure(input.request, SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID);
  if (binding.project_id !== closure.project_binding_ref.entity_id
      || binding.binding_revision_hash !== closure.project_binding_ref.content_id.slice('sha256:'.length)) {
    fail(SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
      'Core project binding must exactly close over the safety request project binding ref');
  }
  const fact = {
    fact_kind: SAFETY_HAZARD_CORE_FACT_KIND,
    project_id: binding.project_id,
    request_binding_ref: closure.project_binding_ref,
    request_cutoff_ref: closure.assessment_cutoff_ref,
    request_digest: calculateSafetyHazardRequestDigest(input.request),
    request: input.request,
  };
  const core = adaptProjectEvidence(binding, {
    source_refs: [binding.source_manifest_ref],
    observations: [fact],
  }, times);
  return deepFreeze(core);
}

function admitTypedFacts(raw, rawCutoffs) {
  const code = SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID;
  const facts = snapshotSafetyHazardPlainData(raw, 'typedProjectFacts', code);
  const cutoffs = snapshotSafetyHazardPlainData(rawCutoffs ?? {}, 'cutoffs', code);
  assertExactKeys(facts, ['schema_version', 'project_binding_ref', 'facts', 'facts_digest', 'valid_at', 'known_at'], 'typedProjectFacts', code);
  if (facts.schema_version !== SAFETY_HAZARD_CORE_TYPED_FACTS_SCHEMA || !Array.isArray(facts.facts) || facts.facts.length !== 1) {
    fail(code, 'typedProjectFacts must be the exact one-fact Core envelope');
  }
  const times = validateTimes(facts.valid_at, facts.known_at, code);
  const binding = validateCoreProjectBinding(facts.project_binding_ref, code, times);
  const expectedFactsDigest = calculateSafetyHazardCoreFactsDigest(facts.facts);
  if (!constantTimeDigestEquals(facts.facts_digest, expectedFactsDigest)) {
    fail(SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_TAMPERED, 'typedProjectFacts facts_digest is stale or tampered');
  }
  const fact = facts.facts[0];
  assertExactKeys(fact, ['fact_kind', 'project_id', 'request_binding_ref', 'request_cutoff_ref', 'request_digest', 'request'], 'safety fact', code);
  if (fact.fact_kind !== SAFETY_HAZARD_CORE_FACT_KIND || fact.project_id !== binding.project_id) {
    fail(code, 'safety fact kind or project identity is invalid');
  }
  const factBindingRef = assertExactRef(fact.request_binding_ref, 'safety fact request_binding_ref', code);
  const factCutoffRef = assertExactRef(fact.request_cutoff_ref, 'safety fact request_cutoff_ref', code);
  const closure = requestBindingClosure(fact.request, code);
  if (!sameMaterial(factBindingRef, closure.project_binding_ref)
      || !sameMaterial(factCutoffRef, closure.assessment_cutoff_ref)
      || binding.project_id !== factBindingRef.entity_id
      || binding.binding_revision_hash !== factBindingRef.content_id.slice('sha256:'.length)
      || !constantTimeDigestEquals(fact.request_digest, calculateSafetyHazardRequestDigest(fact.request))) {
    fail(SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_TAMPERED, 'safety fact binding or request digest is inconsistent');
  }
  let admittedCutoffs;
  const cutoffKeys = Object.keys(cutoffs);
  if (cutoffKeys.length === 0) {
    admittedCutoffs = { valid_at: times.valid_at, known_at: times.known_at };
  } else {
    assertExactKeys(cutoffs, ['valid_at', 'known_at'], 'cutoffs', code);
    admittedCutoffs = validateTimes(cutoffs.valid_at, cutoffs.known_at, code, 'cutoffs');
    if (admittedCutoffs.valid_at !== times.valid_at || admittedCutoffs.known_at !== times.known_at) {
      fail(code, 'Core evaluator cutoffs must exactly match admitted TypedProjectFacts times');
    }
  }
  return {
    request: fact.request,
    binding: {
      schema_version: facts.schema_version,
      project_id: binding.project_id,
      binding_revision_hash: binding.binding_revision_hash,
      source_manifest_ref: binding.source_manifest_ref,
      facts_digest: expectedFactsDigest,
      valid_at: times.valid_at,
      known_at: times.known_at,
      cutoff_valid_at: admittedCutoffs.valid_at,
      cutoff_known_at: admittedCutoffs.known_at,
      request_digest: fact.request_digest,
      request_binding_ref: factBindingRef,
      request_cutoff_ref: factCutoffRef,
    },
  };
}

function admitAuthority(raw) {
  const authority = snapshotSafetyHazardPlainData(raw, 'authority', SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID);
  assertExactKeys(authority, [], 'authority', SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID);
}

function admitBaseEffectiveRuleset(raw) {
  const invalid = SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.EFFECTIVE_RULESET_INVALID;
  const tampered = SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.EFFECTIVE_RULESET_TAMPERED;
  const envelope = snapshotSafetyHazardPlainData(raw, 'effectiveRuleSet', invalid, { allowAliases: true });
  assertExactKeys(envelope, [
    'schema_version', 'domain_engine_id', 'effective_rule_set', 'compilation_trace', 'rule_count', 'assembly_digest',
  ], 'effectiveRuleSet', invalid);
  if (envelope.schema_version !== EFFECTIVE_RULE_SET_SCHEMA_VERSION || envelope.domain_engine_id !== 'safety_hazard') {
    fail(invalid, 'effectiveRuleSet Core schema or domain is invalid');
  }
  const ruleset = envelope.effective_rule_set;
  if (Object.hasOwn(ruleset, 'profile_rule_provenance')) {
    fail(SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.PROFILE_EVALUATION_UNSUPPORTED,
      'Profile-derived Safety Hazard rules are not admitted for evaluation');
  }
  assertExactKeys(ruleset, ['schema_version', 'ruleset_ref', 'source_packet_ref', 'rules'], 'effective_rule_set', invalid);
  if (ruleset.schema_version !== SAFETY_HAZARD_RULESET_SCHEMA
      || !sameMaterial(ruleset.ruleset_ref, SAFETY_HAZARD_RULESET_REF)
      || !sameMaterial(ruleset.source_packet_ref, SAFETY_HAZARD_SOURCE_PACKET_REF)
      || !Array.isArray(ruleset.rules)
      || !sameMaterial(ruleset.rules, SAFETY_HAZARD_RULES)) {
    fail(tampered, 'base safety ruleset identity, refs, ordering, or rows were tampered');
  }
  const expectedDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalMaterial(ruleset)}`);
  if (!constantTimeDigestEquals(envelope.assembly_digest, expectedDigest) || envelope.rule_count !== SAFETY_HAZARD_RULES.length) {
    fail(tampered, 'effective ruleset assembly digest or count is inconsistent');
  }
  const trace = envelope.compilation_trace;
  assertExactKeys(trace, [
    'schema_version', 'domain_engine_id', 'domain_adapter_revision', 'organization_trace', 'project_trace',
    'profiles', 'compilation_scope', 'effective_ruleset_digest', 'rule_count',
  ], 'compilation_trace', invalid);
  if (trace.schema_version !== COMPILATION_TRACE_SCHEMA_VERSION
      || trace.domain_engine_id !== 'safety_hazard'
      || trace.domain_adapter_revision !== SAFETY_HAZARD_COMPILER_ADAPTER_SCHEMA_VERSION
      || trace.organization_trace !== null || trace.project_trace !== null
      || !Array.isArray(trace.profiles) || trace.profiles.length !== 0
      || !trace.compilation_scope || typeof trace.compilation_scope !== 'object'
      || Object.keys(trace.compilation_scope).length !== 0
      || trace.rule_count !== SAFETY_HAZARD_RULES.length
      || !constantTimeDigestEquals(trace.effective_ruleset_digest, expectedDigest)) {
    fail(tampered, 'base-only Core compilation trace is inconsistent or profile-derived');
  }
  return {
    ruleset_ref: ruleset.ruleset_ref,
    source_packet_ref: ruleset.source_packet_ref,
    assembly_digest: expectedDigest,
    effective_ruleset_digest: trace.effective_ruleset_digest,
    rule_count: envelope.rule_count,
    compilation_trace_schema_version: trace.schema_version,
  };
}

export function admitSafetyHazardCoreEvaluation({ effective_rule_set, typed_project_facts, authority, cutoffs }) {
  const effective = admitBaseEffectiveRuleset(effective_rule_set);
  const facts = admitTypedFacts(typed_project_facts, cutoffs);
  admitAuthority(authority);
  return deepFreeze({ effective_ruleset: effective, core_typed_facts: facts.binding, request: facts.request });
}

export function calculateSafetyHazardAdmissionDigest(admitted) {
  return sha256Hex(`soulforge.safety_hazard.core_admission.v0\n${canonicalMaterial({
    effective_ruleset: admitted.effective_ruleset,
    core_typed_facts: admitted.core_typed_facts,
  })}`);
}
