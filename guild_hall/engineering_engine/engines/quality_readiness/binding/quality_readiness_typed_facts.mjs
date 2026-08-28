// Domain-local Typed Facts envelope. It projects only bounded references and observations into
// the Core TypedProjectFacts shape; source bodies, RAG text, project payloads, and writes stay out.
import types from 'node:util/types';

import { canonicalise, inspectInstant } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

export const QUALITY_READINESS_TYPED_FACTS_SCHEMA = 'soulforge.quality_readiness.typed_facts_envelope.v0';
export const QUALITY_READINESS_TYPED_FACTS_CORE_SCHEMA = 'soulforge.typed_project_facts.v0';
export const QUALITY_READINESS_TYPED_FACTS_CODES = Object.freeze({
  INVALID: 'QUALITY_READINESS_TYPED_FACTS_INVALID',
  DIGEST_MISMATCH: 'QUALITY_READINESS_TYPED_FACTS_DIGEST_MISMATCH',
  TRACE_MISMATCH: 'QUALITY_READINESS_TYPED_FACTS_TRACE_MISMATCH',
  PUBLIC_BOUNDARY: 'QUALITY_READINESS_TYPED_FACTS_PUBLIC_BOUNDARY',
});

const ROOT_KEYS = Object.freeze(['request', 'compilation_trace', 'valid_at', 'known_at']);
const ENVELOPE_KEYS = Object.freeze(['schema_version', 'typed_project_facts', 'assessment_context', 'compilation_trace']);
const TYPED_FACTS_KEYS = Object.freeze(['schema_version', 'project_binding_ref', 'facts', 'facts_digest', 'valid_at', 'known_at']);
const CONTEXT_KEYS = Object.freeze(['manifest', 'binding', 'domain_input_schema_version', 'cutoffs']);
const TRACE_KEYS = Object.freeze([
  'schema_version', 'domain_engine_id', 'domain_adapter_revision', 'organization_trace',
  'project_trace', 'profiles', 'compilation_scope', 'effective_ruleset_digest', 'rule_count',
]);
const PROFILE_KEYS = Object.freeze([
  'order', 'profile_kind', 'profile_id', 'domain_engine_id', 'revision_or_hash',
  'extends_or_base_pin', 'operation_digest', 'applied_operations_count', 'source_refs',
]);
const PROFILE_SUMMARY_KEYS = Object.freeze([
  'profile_id', 'domain_engine_id', 'revision_or_hash', 'extends_or_base_pin',
  'operation_digest', 'applied_operations_count', 'source_refs',
]);
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_body', 'source_text', 'project_payload', 'payload', 'transcript',
  'prompt', 'completion', 'private_path', 'absolute_path', 'source_path', 'secret',
  'credential', 'password', 'cookie', 'token',
]);
const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FORBIDDEN_STRINGS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} has an unexpected key set`);
  }
}

/**
 * Descriptor-only, alias-closing snapshot for the public Typed Facts seam.  This is deliberately
 * stricter than ordinary JSON parsing: an admitted envelope must have one unambiguous value tree
 * before any field-specific validation or digesting takes place.
 */
function copyPlainData(value, label, depth = 0, seen = new WeakSet(), ancestors = new Set(), { allowFrozenAliases = false } = {}) {
  if (depth > 16) fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} exceeds the data depth limit`);
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} must use a finite canonical JSON number`);
    }
    if (typeof value === 'string' && FORBIDDEN_STRINGS.some((pattern) => pattern.test(value))) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.PUBLIC_BOUNDARY, `${label} contains a private-path or credential sentinel`);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || (types && types.isProxy(value))) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} must be plain data`);
  }
  if (ancestors.has(value)) fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} may not be circular`);
  if (seen.has(value) && (!allowFrozenAliases || !Object.isFrozen(value))) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} may not be shared`);
  }
  seen.add(value);
  ancestors.add(value);
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} has an unsupported prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (array) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
        || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} must be a bounded dense array`);
    }
    const length = lengthDescriptor.value;
    if (keys.some((key) => typeof key === 'symbol'
        || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} may not carry symbols, sparse entries, or named array fields`);
    }
    if (keys.length !== length + 1) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} may not be sparse or carry hidden array entries`);
    }
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} may not carry accessor-backed array entries`);
      }
      result.push(copyPlainData(descriptor.value, `${label}[${index}]`, depth + 1, seen, ancestors, { allowFrozenAliases }));
    }
    ancestors.delete(value);
    return result;
  }
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || PROTOTYPE_SENSITIVE_KEYS.has(key)
        || !descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `${label} may not carry symbols, prototype keys, accessors, or hidden fields`);
    }
    if (FORBIDDEN_KEYS.has(key)) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.PUBLIC_BOUNDARY, `${label}.${key} is outside the Typed Facts boundary`);
    }
    Object.defineProperty(result, key, {
      value: copyPlainData(descriptor.value, `${label}.${key}`, depth + 1, seen, ancestors, { allowFrozenAliases }),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  ancestors.delete(value);
  return result;
}

function encodeTypedValue(value) {
  if (value === null) return { kind: 'null' };
  if (['string', 'boolean', 'number'].includes(typeof value)) return { kind: typeof value, value };
  if (Array.isArray(value)) return { kind: 'array', value: value.map(encodeTypedValue) };
  return {
    kind: 'object',
    value: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeTypedValue(child)])),
  };
}

function arrayOrderRules(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
  }
  return rules;
}

function typedFactsDigestMaterial(typedProjectFacts, assessmentContext, compilationTrace) {
  return {
    schema_version: 'soulforge.quality_readiness.typed_facts_digest.v1',
    typed_project_facts: {
      schema_version: typedProjectFacts.schema_version,
      project_binding_ref: typedProjectFacts.project_binding_ref,
      facts: typedProjectFacts.facts,
      valid_at: typedProjectFacts.valid_at,
      known_at: typedProjectFacts.known_at,
    },
    assessment_context: {
      manifest: assessmentContext.manifest,
      binding: assessmentContext.binding,
      domain_input_schema_version: assessmentContext.domain_input_schema_version,
      cutoffs: assessmentContext.cutoffs,
    },
    compilation_trace: compilationTrace,
  };
}

/**
 * The envelope digest intentionally includes all admitted context, time pins, project binding,
 * fact rows, and complete Core trace.  `facts_digest` is retained as the Core-shaped field name,
 * but it is not a rows-only checksum.
 */
export function qualityReadinessTypedFactsDigest(typedProjectFacts, assessmentContext, compilationTrace) {
  const material = typedFactsDigestMaterial(typedProjectFacts, assessmentContext, compilationTrace);
  const encoded = encodeTypedValue(material);
  return sha256Hex(`soulforge.quality_readiness.typed_facts.envelope.v1\n${canonicalise(encoded, arrayOrderRules(encoded))}`);
}

// Retained public helper name: a QR Facts digest is the complete admitted Typed Facts envelope,
// never a rows-only checksum.  The explicit parameters make every bound constituent visible.
export function qualityReadinessFactsDigest(typedProjectFacts, assessmentContext, compilationTrace) {
  return qualityReadinessTypedFactsDigest(typedProjectFacts, assessmentContext, compilationTrace);
}

export function qualityReadinessCanonicalDataDigest(value, domain = 'soulforge.quality_readiness.canonical_data.v1') {
  const copied = copyPlainData(value, 'canonical digest material');
  const encoded = encodeTypedValue(copied);
  return sha256Hex(`${domain}\n${canonicalise(encoded, arrayOrderRules(encoded))}`);
}

function projectCompilationTrace(rawTrace) {
  // Core currently retains immutable `source_refs` arrays in more than one trace location.  A
  // logical-location snapshot duplicates only those frozen values; ordinary caller aliases stay
  // refused everywhere else and cycles are never admitted.
  const trace = copyPlainData(rawTrace, 'compilation_trace', 0, new WeakSet(), new Set(), {
    allowFrozenAliases: true,
  });
  assertExactKeys(trace, TRACE_KEYS, 'compilation_trace');
  if (trace.schema_version !== 'soulforge.compilation_trace.v0'
      || trace.domain_engine_id !== 'quality_readiness'
      || typeof trace.domain_adapter_revision !== 'string'
      || !SHA256_HEX.test(trace.effective_ruleset_digest)
      || !Number.isSafeInteger(trace.rule_count)
      || !Array.isArray(trace.profiles) || trace.profiles.length === 0 || trace.profiles.length > 2) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.TRACE_MISMATCH, 'compilation trace is not an E01 Core trace');
  }
  const profiles = trace.profiles.map((profile, index) => {
    assertExactKeys(profile, PROFILE_KEYS, `compilation_trace.profiles[${index}]`);
    if (!['organization', 'project'].includes(profile.profile_kind)
        || profile.domain_engine_id !== 'quality_readiness'
        || profile.order !== index
        || !Number.isSafeInteger(profile.applied_operations_count)
        || !SHA256_HEX.test(profile.operation_digest)
        || !Array.isArray(profile.source_refs) || profile.source_refs.length === 0) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.TRACE_MISMATCH, 'Profile compilation trace is incomplete');
    }
    return profile;
  });
  const hasAcceptedProfileSequence = profiles.length === 1
    ? profiles[0].order === 0 && ['organization', 'project'].includes(profiles[0].profile_kind)
    : profiles.length === 2
      && profiles[0].order === 0
      && profiles[0].profile_kind === 'organization'
      && profiles[1].order === 1
      && profiles[1].profile_kind === 'project';
  if (!hasAcceptedProfileSequence) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.TRACE_MISMATCH,
      'compilation trace has an unsupported Profile topology');
  }
  const organization = profiles.find((profile) => profile.profile_kind === 'organization') ?? null;
  const project = profiles.find((profile) => profile.profile_kind === 'project') ?? null;
  for (const [label, profile] of [['organization_trace', organization], ['project_trace', project]]) {
    const summary = trace[label];
    if ((summary === null) !== (profile === null)) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.TRACE_MISMATCH, `${label} does not match the retained Profile trace`);
    }
    if (summary !== null) {
      assertExactKeys(summary, PROFILE_SUMMARY_KEYS, label);
      for (const field of PROFILE_SUMMARY_KEYS) {
        if (field === 'source_refs') {
          if (!Array.isArray(summary.source_refs) || summary.source_refs.length !== profile.source_refs.length
              || !summary.source_refs.every((sourceRef, index) => sourceRef === profile.source_refs[index])) {
            fail(QUALITY_READINESS_TYPED_FACTS_CODES.TRACE_MISMATCH, `${label}.source_refs does not match its Profile trace`);
          }
        } else if (summary[field] !== profile[field]) {
          fail(QUALITY_READINESS_TYPED_FACTS_CODES.TRACE_MISMATCH, `${label}.${field} does not match its Profile trace`);
        }
      }
    }
  }
  return trace;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function copyTypedFactsBuildInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || (types && types.isProxy(input))
      || Object.getPrototypeOf(input) !== Object.prototype) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, 'typed facts build input must be an ordinary object');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  const expected = [...ROOT_KEYS].sort();
  const actual = keys.filter((key) => typeof key === 'string').sort();
  if (keys.some((key) => typeof key !== 'string' || PROTOTYPE_SENSITIVE_KEYS.has(key))
      || actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, 'typed facts build input has an unexpected key set');
  }
  const result = {};
  for (const key of ROOT_KEYS) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, `typed facts build input.${key} must be an enumerable data field`);
    }
    const snapshotOptions = key === 'compilation_trace' ? { allowFrozenAliases: true } : {};
    Object.defineProperty(result, key, {
      value: copyPlainData(descriptor.value, `typed facts build input.${key}`, 0, new WeakSet(), new Set(), snapshotOptions),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

export function buildQualityReadinessTypedFacts(input) {
  const copied = copyTypedFactsBuildInput(input);
  assertExactKeys(copied, ROOT_KEYS, 'typed facts build input');
  if (!inspectInstant(copied.valid_at).valid || !inspectInstant(copied.known_at).valid
      || copied.known_at < copied.valid_at) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, 'Typed Facts valid_at and known_at must be canonical and coherent');
  }
  assertExactKeys(copied.request, ['manifest', 'binding', 'domain_input', 'cutoffs'], 'typed facts request');
  assertExactKeys(copied.request.domain_input, ['schema_version', 'rows'], 'typed facts request.domain_input');
  if (copied.request.domain_input.schema_version !== 'soulforge.quality_readiness.domain_input.v0'
      || !Array.isArray(copied.request.domain_input.rows)
      || !copied.request.binding.project_binding_ref) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, 'Typed Facts request must carry an E01 domain input and project binding ref');
  }
  const compilationTrace = projectCompilationTrace(copied.compilation_trace);
  const facts = copied.request.domain_input.rows;
  const typedProjectFacts = {
    schema_version: QUALITY_READINESS_TYPED_FACTS_CORE_SCHEMA,
    // Keep the Core linkage value-equal but object-distinct from assessment_context.binding so
    // the public adapter can reject every shared-reference alias at its outer admission seam.
    project_binding_ref: copyPlainData(
      copied.request.binding.project_binding_ref,
      'typed facts project_binding_ref',
    ),
    facts,
    valid_at: copied.valid_at,
    known_at: copied.known_at,
  };
  const assessmentContext = {
    manifest: copied.request.manifest,
    binding: copied.request.binding,
    domain_input_schema_version: copied.request.domain_input.schema_version,
    cutoffs: copied.request.cutoffs,
  };
  typedProjectFacts.facts_digest = qualityReadinessTypedFactsDigest(
    typedProjectFacts,
    assessmentContext,
    compilationTrace,
  );
  return freezeDeep({
    schema_version: QUALITY_READINESS_TYPED_FACTS_SCHEMA,
    typed_project_facts: typedProjectFacts,
    assessment_context: assessmentContext,
    compilation_trace: compilationTrace,
  });
}

export function requestFromQualityReadinessTypedFacts(envelope) {
  const copied = copyPlainData(envelope, 'typed facts envelope');
  assertExactKeys(copied, ENVELOPE_KEYS, 'typed facts envelope');
  if (copied.schema_version !== QUALITY_READINESS_TYPED_FACTS_SCHEMA) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.INVALID, 'unexpected Quality Readiness Typed Facts schema');
  }
  assertExactKeys(copied.typed_project_facts, TYPED_FACTS_KEYS, 'typed_project_facts');
  assertExactKeys(copied.assessment_context, CONTEXT_KEYS, 'assessment_context');
  const typed = copied.typed_project_facts;
  if (typed.schema_version !== QUALITY_READINESS_TYPED_FACTS_CORE_SCHEMA
      || !Array.isArray(typed.facts)
      || !inspectInstant(typed.valid_at).valid || !inspectInstant(typed.known_at).valid
      || typed.known_at < typed.valid_at
      || !SHA256_HEX.test(typed.facts_digest)
      || typed.facts_digest !== qualityReadinessTypedFactsDigest(
        typed,
        copied.assessment_context,
        copied.compilation_trace,
      )) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.DIGEST_MISMATCH, 'Typed Facts digest or time pin is invalid');
  }
  if (copied.assessment_context.domain_input_schema_version !== 'soulforge.quality_readiness.domain_input.v0'
      || qualityReadinessCanonicalDataDigest(
        typed.project_binding_ref,
        'soulforge.quality_readiness.project_binding_ref.v1',
      ) !== qualityReadinessCanonicalDataDigest(
        copied.assessment_context.binding.project_binding_ref,
        'soulforge.quality_readiness.project_binding_ref.v1',
      )) {
    fail(QUALITY_READINESS_TYPED_FACTS_CODES.TRACE_MISMATCH, 'Typed Facts project binding does not match its assessment context');
  }
  const compilationTrace = projectCompilationTrace(copied.compilation_trace);
  return freezeDeep({
    request: {
      manifest: copied.assessment_context.manifest,
      binding: copied.assessment_context.binding,
      domain_input: {
        schema_version: copied.assessment_context.domain_input_schema_version,
        rows: typed.facts,
      },
      cutoffs: copied.assessment_context.cutoffs,
    },
    compilation_trace: compilationTrace,
    typed_project_facts: typed,
  });
}
