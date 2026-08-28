// Quality Readiness Domain Evaluator Adapter. This is the domain-local bridge between the
// Core-assembled effective ruleset and the deterministic E01 evaluator; it owns no Core state.
import { isDeepStrictEqual } from 'node:util';
import types from 'node:util/types';

import {
  assessQualityReadiness,
  verifyQualityReadinessAssessmentResultShape,
} from './quality_readiness.mjs';
import {
  arrayOrderRules,
  registerDomainEngineAdapter,
  withoutNulls,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import {
  qualityReadinessCompilerAdapter,
  verifyQualityReadinessEffectiveRuleSet,
} from '../compiler/quality_readiness_compiler_adapter.mjs';
import {
  QUALITY_READINESS_TYPED_FACTS_SCHEMA,
  qualityReadinessCanonicalDataDigest,
  requestFromQualityReadinessTypedFacts,
} from '../binding/quality_readiness_typed_facts.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

export const QR_EVALUATOR_ADAPTER_SCHEMA_VERSION = 'soulforge.quality_readiness.evaluator.v0';

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const PROFILE_TRACE_KEYS = Object.freeze([
  'applied_operations_count',
  'domain_engine_id',
  'extends_or_base_pin',
  'operation_digest',
  'order',
  'profile_id',
  'profile_kind',
  'revision_or_hash',
  'source_refs',
]);
const COMPILATION_TRACE_KEYS = Object.freeze([
  'compilation_scope',
  'domain_adapter_revision',
  'domain_engine_id',
  'effective_ruleset_digest',
  'organization_trace',
  'profiles',
  'project_trace',
  'rule_count',
  'schema_version',
]);
const ASSEMBLY_KEYS = Object.freeze([
  'assembly_digest',
  'compilation_trace',
  'domain_engine_id',
  'effective_rule_set',
  'rule_count',
  'schema_version',
]);
const BASE_REQUEST_KEYS = Object.freeze(['binding', 'cutoffs', 'domain_input', 'manifest']);
const LEGACY_REQUEST_WRAPPER_KEYS = Object.freeze(['request']);
const TYPED_FACTS_ENVELOPE_KEYS = Object.freeze([
  'assessment_context', 'compilation_trace', 'schema_version', 'typed_project_facts',
]);
const REPLAY_CONTEXT_KEYS = Object.freeze(['effective_rule_set', 'typed_facts']);
const CORE_CUTOFF_KEYS = Object.freeze(['accepted_context_generation', 'assessment_cutoff_ref']);
const EXACT_REF_KEYS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const OUTER_INPUT_MAX_DEPTH = 16;
const OUTER_INPUT_MAX_ARRAY = 4096;
const OUTER_INPUT_PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const QR_EVALUATOR_ADAPTER_CODES = Object.freeze({
  INPUT_REFUSED: 'QR_EVALUATION_INPUT_REFUSED',
});

function refuse(message) {
  throw new ContractError('QR_PROFILE_EVALUATION_UNSUPPORTED', message);
}

function effectiveFail(message) {
  throw new ContractError('QR_EFFECTIVE_RULESET_INVALID', message);
}

function inputRefuse(message) {
  throw new ContractError(QR_EVALUATOR_ADAPTER_CODES.INPUT_REFUSED, message);
}

function sameKeySet(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const sorted = [...expected].sort(compareCodePoints);
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Copies the public adapter argument using descriptors only. Proxies are rejected before any
 * reflective operation, so a hostile get/ownKeys trap cannot choose the evaluation lane.
 */
function snapshotOuterData(value, label, failClosed, depth = 0, seen = new WeakSet(), ancestors = new Set(), {
  allowCoreProvenanceMap = false,
  allowFrozenCoreTraceAliases = false,
} = {}) {
  if (depth > OUTER_INPUT_MAX_DEPTH) failClosed(`${label} exceeds the outer admission depth limit`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      failClosed(`${label} must use finite canonical JSON numbers`);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || (types && types.isProxy(value))) {
    failClosed(`${label} must be ordinary JSON-like data; proxies and non-data values are refused`);
  }
  if (ancestors.has(value)) failClosed(`${label} may not contain a cycle`);
  const frozenCoreTraceAlias = allowFrozenCoreTraceAliases
    && label.includes('.compilation_trace.') && Object.isFrozen(value);
  if (seen.has(value) && !frozenCoreTraceAlias) failClosed(`${label} may not contain a shared alias`);
  seen.add(value);
  ancestors.add(value);
  const array = Array.isArray(value);
  const expectedPrototype = array ? Array.prototype : Object.prototype;
  const nullCoreProvenanceMap = allowCoreProvenanceMap
    && !array && label.endsWith('.profile_rule_provenance') && Object.getPrototypeOf(value) === null;
  if (Object.getPrototypeOf(value) !== expectedPrototype && !nullCoreProvenanceMap) {
    failClosed(`${label} must use the standard ${array ? 'Array' : 'Object'} prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (array) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
        || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value > OUTER_INPUT_MAX_ARRAY) {
      failClosed(`${label} must be a bounded dense array`);
    }
    if (keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
      failClosed(`${label} may not contain symbol, sparse, or named array entries`);
    }
    if (keys.length !== lengthDescriptor.value + 1) {
      failClosed(`${label} must be a dense data-only array`);
    }
    const copy = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        failClosed(`${label} must be a dense data-only array`);
      }
      copy.push(snapshotOuterData(descriptor.value, `${label}[${index}]`, failClosed, depth + 1, seen, ancestors, {
        allowCoreProvenanceMap,
        allowFrozenCoreTraceAliases,
      }));
    }
    ancestors.delete(value);
    return copy;
  }
  const copy = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || OUTER_INPUT_PROTOTYPE_KEYS.has(key)
        || !descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      failClosed(`${label} may not contain symbols, prototype keys, accessors, or hidden fields`);
    }
    Object.defineProperty(copy, key, {
      value: snapshotOuterData(descriptor.value, `${label}.${key}`, failClosed, depth + 1, seen, ancestors, {
        allowCoreProvenanceMap,
        allowFrozenCoreTraceAliases,
      }),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  ancestors.delete(value);
  return copy;
}

function snapshotOuterEvaluationInput(value, seen = new WeakSet()) {
  return snapshotOuterData(value, 'evaluation input', inputRefuse, 0, seen, new Set());
}

function snapshotOuterEffectiveRuleset(value) {
  return snapshotOuterData(value, 'effective rule set', effectiveFail, 0, new WeakSet(), new Set(), {
    allowCoreProvenanceMap: true,
    allowFrozenCoreTraceAliases: true,
  });
}

function admitAssessmentReplayContext(value) {
  const context = snapshotOuterData(
    value,
    'assessment replay context',
    inputRefuse,
    0,
    new WeakSet(),
    new Set(),
    { allowCoreProvenanceMap: true, allowFrozenCoreTraceAliases: true },
  );
  if (!sameKeySet(context, REPLAY_CONTEXT_KEYS)
      || !sameKeySet(context.effective_rule_set, ASSEMBLY_KEYS)
      || !sameKeySet(context.typed_facts, TYPED_FACTS_ENVELOPE_KEYS)) {
    inputRefuse('assessment replay context must contain one exact Core assembly and one exact Typed Facts envelope');
  }
  return context;
}

function admitEvaluationInput(rawInput, seen) {
  const input = snapshotOuterEvaluationInput(rawInput, seen);
  if (sameKeySet(input, TYPED_FACTS_ENVELOPE_KEYS)) {
    if (input.schema_version !== QUALITY_READINESS_TYPED_FACTS_SCHEMA) {
      inputRefuse('Typed Facts envelope schema is not accepted at the evaluation boundary');
    }
    return Object.freeze({ lane: 'typed_facts', input });
  }
  if (sameKeySet(input, BASE_REQUEST_KEYS)) {
    return Object.freeze({ lane: 'base_raw_request', request: input });
  }
  if (sameKeySet(input, LEGACY_REQUEST_WRAPPER_KEYS) && sameKeySet(input.request, BASE_REQUEST_KEYS)) {
    return Object.freeze({ lane: 'base_legacy_wrapper', request: input.request });
  }
  inputRefuse('evaluation input must be one exact base request, one exact legacy request wrapper, or one exact Typed Facts envelope');
}

function admitCoreAuthorityAndCutoffs(rawAuthority, rawCutoffs) {
  const seen = new WeakSet();
  const authority = snapshotOuterData(rawAuthority, 'Core authority', inputRefuse, 0, seen, new Set());
  if (!sameKeySet(authority, [])) {
    inputRefuse('Core authority must be absent or an exact empty data record; evaluation does not invent authority');
  }
  const cutoffs = snapshotOuterData(rawCutoffs, 'Core cutoffs', inputRefuse, 0, seen, new Set());
  if (sameKeySet(cutoffs, [])) {
    return Object.freeze({ seen, cutoffs: null });
  }
  if (!sameKeySet(cutoffs, CORE_CUTOFF_KEYS)) {
    inputRefuse('Core cutoffs must be empty or the exact accepted context/cutoff projection');
  }
  return Object.freeze({ seen, cutoffs });
}

function sameExactCutoffRef(left, right) {
  return sameKeySet(left, EXACT_REF_KEYS)
    && sameKeySet(right, EXACT_REF_KEYS)
    && EXACT_REF_KEYS.every((field) => left[field] === right[field]);
}

function assertCoreCutoffsMatchTypedFacts(coreCutoffs, typedEnvelope) {
  if (coreCutoffs === null) return false;
  const typedCutoffs = typedEnvelope.request.cutoffs;
  if (coreCutoffs.accepted_context_generation !== typedCutoffs.accepted_context_generation
      || !sameExactCutoffRef(coreCutoffs.assessment_cutoff_ref, typedCutoffs.assessment_cutoff_ref)) {
    inputRefuse('Core cutoffs do not exactly match the admitted Typed Facts cutoff pins');
  }
  return true;
}

function assertOwnDataShape(value, label, error = effectiveFail) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (types && types.isProxy(value))) {
    error(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) error(`${label} has an unsupported prototype`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value')
        || descriptor.enumerable !== true) error(`${label} may not contain accessors, symbols, or hidden fields`);
  }
}

function assertEffectiveRulesetShape(unwrapped) {
  assertOwnDataShape(unwrapped, 'effective rule set');
  const keys = Object.keys(unwrapped).sort(compareCodePoints);
  const base = ['rules', 'ruleset_ref', 'schema_version', 'source_packet_ref'].sort(compareCodePoints);
  const derived = [...base, 'profile_rule_provenance'].sort(compareCodePoints);
  if (!((keys.length === base.length && keys.every((key, index) => key === base[index]))
      || (keys.length === derived.length && keys.every((key, index) => key === derived[index])))) {
    effectiveFail('effective rule set has an unexpected key set');
  }
  assertOwnDataShape(unwrapped.ruleset_ref, 'effective rule set ruleset_ref');
  assertOwnDataShape(unwrapped.source_packet_ref, 'effective rule set source_packet_ref');
  if (!Array.isArray(unwrapped.rules)) effectiveFail('effective rule set rules must be an array');
  const ruleKeys = [
    'allowed_artifact_tokens', 'context_ref_fields', 'required_authority_families', 'rule_id',
    'source_locator', 'source_modality', 'source_ref', 'sufficiency_fields',
  ].sort(compareCodePoints);
  for (const rule of unwrapped.rules) {
    assertOwnDataShape(rule, 'effective rule set rule');
    const actual = Object.keys(rule).sort(compareCodePoints);
    if (actual.length !== ruleKeys.length || !actual.every((key, index) => key === ruleKeys[index])) {
      effectiveFail('effective rule set rule has an unexpected key set');
    }
  }
}

function assertPlainData(value, label, depth = 0, ancestors = new Set()) {
  if (depth > 16) refuse(`${label} exceeds the bounded data depth`);
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return;
  if (!value || typeof value !== 'object' || (types && types.isProxy(value))) {
    refuse(`${label} must be plain data`);
  }
  if (ancestors.has(value)) refuse(`${label} may not be circular`);
  ancestors.add(value);
  try {
    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== (isArray ? Array.prototype : Object.prototype)
        && !(prototype === null && !isArray)) {
      refuse(`${label} has an unsupported prototype`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value')
          || (key !== 'length' && descriptor.enumerable !== true)) {
        refuse(`${label} may not contain accessors, symbols, or hidden properties`);
      }
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (isArray && key === 'length') continue;
      assertPlainData(descriptor.value, `${label}.${key}`, depth + 1, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(`${label} must be an object`);
  const actual = Object.keys(value).sort(compareCodePoints);
  const sorted = [...expected].sort(compareCodePoints);
  if (actual.length !== sorted.length || !actual.every((key, index) => key === sorted[index])) {
    refuse(`${label} has an unexpected key set`);
  }
}

function projectedProfileTrace(profile) {
  assertExactKeys(profile, PROFILE_TRACE_KEYS, 'compilation_trace.profiles[]');
  if (!['organization', 'project'].includes(profile.profile_kind)
      || profile.domain_engine_id !== 'quality_readiness'
      || !Number.isSafeInteger(profile.order)
      || !Number.isSafeInteger(profile.applied_operations_count)
      || profile.applied_operations_count < 0
      || !SHA256_HEX.test(profile.operation_digest)
      || !Array.isArray(profile.source_refs) || profile.source_refs.length === 0) {
    refuse('compilation trace profile is incomplete or malformed');
  }
  for (const field of ['profile_id', 'revision_or_hash', 'extends_or_base_pin']) {
    if (typeof profile[field] !== 'string' || profile[field].length === 0 || profile[field].length > 256) {
      refuse(`compilation trace profile ${field} is invalid`);
    }
  }
  for (const sourceRef of profile.source_refs) {
    if (typeof sourceRef !== 'string' || sourceRef.length === 0 || sourceRef.length > 256) {
      refuse('compilation trace profile source_refs must be bounded strings');
    }
  }
  return {
    order: profile.order,
    profile_kind: profile.profile_kind,
    profile_id: profile.profile_id,
    domain_engine_id: profile.domain_engine_id,
    revision_or_hash: profile.revision_or_hash,
    extends_or_base_pin: profile.extends_or_base_pin,
    operation_digest: profile.operation_digest,
    applied_operations_count: profile.applied_operations_count,
    source_refs: [...profile.source_refs],
  };
}

function coreAssemblyDigest(effectiveRuleSet) {
  const cleanRules = withoutNulls(effectiveRuleSet);
  const canonicalRules = canonicalise(cleanRules, arrayOrderRules(cleanRules));
  return sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalRules}`);
}

function profileOperationCount(provenance, profile) {
  return Object.values(provenance).filter((record) => (
    record.profile_kind === profile.profile_kind
    && record.profile_id === profile.profile_id
    && record.order === profile.order
  )).length;
}

function hasAcceptedProfileSequence(profiles) {
  if (profiles.length === 1) {
    return profiles[0].order === 0
      && ['organization', 'project'].includes(profiles[0].profile_kind);
  }
  return profiles.length === 2
    && profiles[0].order === 0
    && profiles[0].profile_kind === 'organization'
    && profiles[1].order === 1
    && profiles[1].profile_kind === 'project';
}

function verifyCoreCompilationTrace(assembly, verifiedRuleset) {
  assertPlainData(assembly, 'effective ruleset assembly');
  assertExactKeys(assembly, ASSEMBLY_KEYS, 'effective ruleset assembly');
  if (assembly.schema_version !== 'soulforge.effective_rule_set.v0'
      || assembly.domain_engine_id !== 'quality_readiness'
      || assembly.effective_rule_set === null
      || assembly.rule_count !== verifiedRuleset.rules.length
      || !SHA256_HEX.test(assembly.assembly_digest)) {
    refuse('derived evaluation requires a coherent Core effective-rule-set assembly');
  }
  const recomputedAssemblyDigest = coreAssemblyDigest(assembly.effective_rule_set);
  if (assembly.assembly_digest !== recomputedAssemblyDigest) {
    refuse('Core assembly_digest does not match the recomputed effective ruleset');
  }
  const trace = assembly.compilation_trace;
  assertPlainData(trace, 'compilation_trace');
  assertExactKeys(trace, COMPILATION_TRACE_KEYS, 'compilation_trace');
  if (trace.schema_version !== 'soulforge.compilation_trace.v0'
      || trace.domain_engine_id !== 'quality_readiness'
      || trace.domain_adapter_revision !== qualityReadinessCompilerAdapter.revision
      || trace.rule_count !== verifiedRuleset.rules.length
      || trace.effective_ruleset_digest !== recomputedAssemblyDigest
      || !Array.isArray(trace.profiles) || trace.profiles.length === 0 || trace.profiles.length > 2) {
    refuse('derived evaluation compilation trace is invalid or incomplete');
  }
  if (!trace.compilation_scope || typeof trace.compilation_scope !== 'object'
      || Array.isArray(trace.compilation_scope)
      || Object.getPrototypeOf(trace.compilation_scope) !== Object.prototype) {
    refuse('derived evaluation accepts only an empty standard Core compilation_scope');
  }
  assertExactKeys(trace.compilation_scope, [], 'compilation_trace.compilation_scope');

  const profiles = trace.profiles.map(projectedProfileTrace);
  if (!hasAcceptedProfileSequence(profiles)) {
    refuse('derived evaluation compilation trace has an unsupported Profile topology');
  }
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    if (profile.applied_operations_count !== profileOperationCount(verifiedRuleset.profile_rule_provenance, profile)) {
      refuse('derived evaluation compilation trace applied operation count is not compiler-derived');
    }
  }
  const profileByKey = new Map(profiles.map((profile) => [
    `${profile.profile_kind}\u001f${profile.profile_id}\u001f${profile.order}`,
    profile,
  ]));
  for (const provenance of Object.values(verifiedRuleset.profile_rule_provenance)) {
    const traceProfile = profileByKey.get(
      `${provenance.profile_kind}\u001f${provenance.profile_id}\u001f${provenance.order}`,
    );
    if (!traceProfile || traceProfile.revision_or_hash !== provenance.revision_or_hash
        || traceProfile.extends_or_base_pin !== provenance.extends_or_base_pin
        || traceProfile.operation_digest !== provenance.operation_digest
        || traceProfile.source_refs.length !== provenance.source_refs.length
        || !traceProfile.source_refs.every((sourceRef, index) => sourceRef === provenance.source_refs[index])) {
      refuse('derived rule Profile provenance does not match the Core compilation trace');
    }
  }
  const organization = profiles.find((profile) => profile.profile_kind === 'organization') ?? null;
  const project = profiles.find((profile) => profile.profile_kind === 'project') ?? null;
  if ((trace.organization_trace === null) !== (organization === null)
      || (trace.project_trace === null) !== (project === null)) {
    refuse('Core compilation trace summary fields do not match its per-Profile trace');
  }
  for (const [label, profile] of [['organization_trace', organization], ['project_trace', project]]) {
    if (profile !== null) {
      const summary = trace[label];
      if (!summary || summary.profile_id !== profile.profile_id
          || summary.domain_engine_id !== profile.domain_engine_id
          || summary.revision_or_hash !== profile.revision_or_hash
          || summary.extends_or_base_pin !== profile.extends_or_base_pin
          || summary.operation_digest !== profile.operation_digest
          || summary.applied_operations_count !== profile.applied_operations_count
          || !Array.isArray(summary.source_refs)
          || summary.source_refs.length !== profile.source_refs.length
          || !summary.source_refs.every((sourceRef, index) => sourceRef === profile.source_refs[index])) {
        refuse('Core compilation trace summary loses Profile provenance');
      }
    }
  }
  return Object.freeze({
    receipt_trace: Object.freeze({
      schema_version: trace.schema_version,
      domain_engine_id: trace.domain_engine_id,
      domain_adapter_revision: trace.domain_adapter_revision,
      effective_ruleset_digest: trace.effective_ruleset_digest,
      rule_count: trace.rule_count,
      profiles: Object.freeze(profiles.map((profile) => Object.freeze({
        ...profile,
        source_refs: Object.freeze([...profile.source_refs]),
      }))),
    }),
    exact_trace: trace,
  });
}

function verifyEffectiveRuleSet(effectiveRuleSet) {
  const admitted = snapshotOuterEffectiveRuleset(effectiveRuleSet);
  assertOwnDataShape(admitted, 'effective rule set wrapper');
  const unwrapped = Object.hasOwn(admitted, 'effective_rule_set')
    ? admitted.effective_rule_set
    : admitted;
  assertEffectiveRulesetShape(unwrapped);
  let verified;
  try {
    verified = verifyQualityReadinessEffectiveRuleSet(unwrapped);
  } catch {
    refuse('effective E01 ruleset is forged, malformed, stale, or not compiler-derived');
  }
  if (verified.kind === 'base') return { verified, compilationTrace: null, exactCompilationTrace: null };
  if (!Object.hasOwn(admitted, 'effective_rule_set')) {
    refuse('derived E01 evaluation requires the Core assembly wrapper and its compilation trace');
  }
  const traceState = verifyCoreCompilationTrace(admitted, verified);
  return {
    verified,
    compilationTrace: traceState.receipt_trace,
    exactCompilationTrace: traceState.exact_trace,
  };
}

export const qualityReadinessAdapter = Object.freeze({
  ...qualityReadinessCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    const coreArguments = admitCoreAuthorityAndCutoffs(authority, cutoffs);
    const admittedInput = admitEvaluationInput(typedProjectFacts, coreArguments.seen);
    if (coreArguments.cutoffs !== null && admittedInput.lane !== 'typed_facts') {
      inputRefuse('non-empty Core cutoffs require the exact domain-local Typed Facts lane');
    }
    const { verified, compilationTrace, exactCompilationTrace } = verifyEffectiveRuleSet(effectiveRuleSet);
    if (verified.kind === 'base' && admittedInput.lane === 'typed_facts') {
      inputRefuse('base rulesets accept only the explicit base raw-request lanes');
    }
    if (verified.kind === 'derived' && admittedInput.lane !== 'typed_facts') {
      inputRefuse('derived E01 evaluation requires the domain-local Core Typed Facts envelope');
    }
    let typedEnvelope = null;
    if (admittedInput.lane === 'typed_facts') {
      try {
        typedEnvelope = requestFromQualityReadinessTypedFacts(admittedInput.input);
      } catch (error) {
        if (error instanceof ContractError) {
          inputRefuse('Typed Facts envelope is malformed, mismatched, or incomplete at the evaluation boundary');
        }
        throw error;
      }
    }
    if (typedEnvelope !== null && compilationTrace !== null
        && qualityReadinessCanonicalDataDigest(
          typedEnvelope.compilation_trace,
          'soulforge.quality_readiness.compilation_trace.v1',
        ) !== qualityReadinessCanonicalDataDigest(
          exactCompilationTrace,
          'soulforge.quality_readiness.compilation_trace.v1',
        )) {
      inputRefuse('Typed Facts compilation trace does not exactly match the Core-assembled ruleset');
    }
    const coreSuppliedCutoffsMatch = typedEnvelope === null
      ? false
      : assertCoreCutoffsMatchTypedFacts(coreArguments.cutoffs, typedEnvelope);
    const request = typedEnvelope === null ? admittedInput.request : typedEnvelope.request;
    const evaluationOptions = compilationTrace === null
      ? { evaluation_input_lane: admittedInput.lane }
      : {
        rules: verified.rules,
        ruleset_ref: verified.ruleset_ref,
        source_packet_ref: verified.source_packet_ref,
        profile_rule_provenance: verified.profile_rule_provenance,
        profile_compilation_trace: compilationTrace,
        typed_facts_sha256: typedEnvelope.typed_project_facts.facts_digest,
        evaluation_input_lane: admittedInput.lane,
        ...(coreSuppliedCutoffsMatch ? { core_supplied_cutoffs_match: true } : {}),
      };
    return assessQualityReadiness(request, evaluationOptions);
  },
});

/**
 * Fixed-point verifier for downstream QR seams. It requires an exact replay context and accepts
 * only a complete byte-equivalent replay in exactly one of the two admitted Core cutoff modes.
 */
export function verifyQualityReadinessAssessmentResult(result, replayContext) {
  let candidate;
  try {
    candidate = freezeDeep(structuredClone(verifyQualityReadinessAssessmentResultShape(result)));
  } catch {
    inputRefuse('assessment result is structurally invalid before fixed-point replay');
  }
  const context = admitAssessmentReplayContext(replayContext);
  let omittedCoreCutoffs;
  let suppliedCoreCutoffs;
  try {
    omittedCoreCutoffs = qualityReadinessAdapter.evaluate(
      context.effective_rule_set,
      context.typed_facts,
      {},
      {},
    );
    suppliedCoreCutoffs = qualityReadinessAdapter.evaluate(
      context.effective_rule_set,
      context.typed_facts,
      {},
      structuredClone(context.typed_facts.assessment_context.cutoffs),
    );
  } catch {
    inputRefuse('assessment replay context cannot produce an admitted deterministic evaluation');
  }
  const matches = Number(isDeepStrictEqual(candidate, omittedCoreCutoffs))
    + Number(isDeepStrictEqual(candidate, suppliedCoreCutoffs));
  if (matches !== 1) {
    inputRefuse('assessment result is not exactly bound to one admitted deterministic replay');
  }
  return candidate;
}

registerDomainEngineAdapter('quality_readiness', qualityReadinessAdapter);
