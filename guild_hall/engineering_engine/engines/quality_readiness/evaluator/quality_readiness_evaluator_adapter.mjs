// Quality Readiness Domain Evaluator Adapter. This is the domain-local bridge between the
// Core-assembled effective ruleset and the deterministic E01 evaluator; it owns no Core state.
import types from 'node:util/types';

import { assessQualityReadiness } from './quality_readiness.mjs';
import { registerDomainEngineAdapter } from '../../../core/interfaces/domain_engine_adapter.mjs';
import {
  qualityReadinessCompilerAdapter,
  verifyQualityReadinessEffectiveRuleSet,
} from '../compiler/quality_readiness_compiler_adapter.mjs';
import {
  QUALITY_READINESS_TYPED_FACTS_SCHEMA,
  requestFromQualityReadinessTypedFacts,
} from '../binding/quality_readiness_typed_facts.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { compareCodePoints } from '../../../core/validators/canonical.mjs';

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

function refuse(message) {
  throw new ContractError('QR_PROFILE_EVALUATION_UNSUPPORTED', message);
}

function effectiveFail(message) {
  throw new ContractError('QR_EFFECTIVE_RULESET_INVALID', message);
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
  const trace = assembly.compilation_trace;
  assertPlainData(trace, 'compilation_trace');
  assertExactKeys(trace, COMPILATION_TRACE_KEYS, 'compilation_trace');
  if (trace.schema_version !== 'soulforge.compilation_trace.v0'
      || trace.domain_engine_id !== 'quality_readiness'
      || trace.domain_adapter_revision !== qualityReadinessCompilerAdapter.revision
      || trace.rule_count !== verifiedRuleset.rules.length
      || !SHA256_HEX.test(trace.effective_ruleset_digest)
      || !Array.isArray(trace.profiles) || trace.profiles.length === 0 || trace.profiles.length > 2) {
    refuse('derived evaluation compilation trace is invalid or incomplete');
  }

  const profiles = trace.profiles.map(projectedProfileTrace);
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    if (profile.order !== index || (index > 0 && profile.profile_kind !== 'project')
        || (index === 0 && !['organization', 'project'].includes(profile.profile_kind))) {
      refuse('derived evaluation compilation trace profile order is invalid');
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
  const unwrapped = effectiveRuleSet?.effective_rule_set ?? effectiveRuleSet;
  assertEffectiveRulesetShape(unwrapped);
  let verified;
  try {
    verified = verifyQualityReadinessEffectiveRuleSet(unwrapped);
  } catch {
    refuse('effective E01 ruleset is forged, malformed, stale, or not compiler-derived');
  }
  if (verified.kind === 'base') return { verified, compilationTrace: null, exactCompilationTrace: null };
  if (!effectiveRuleSet || effectiveRuleSet.effective_rule_set === undefined) {
    refuse('derived E01 evaluation requires the Core assembly wrapper and its compilation trace');
  }
  const traceState = verifyCoreCompilationTrace(effectiveRuleSet, verified);
  return {
    verified,
    compilationTrace: traceState.receipt_trace,
    exactCompilationTrace: traceState.exact_trace,
  };
}

export const qualityReadinessAdapter = Object.freeze({
  ...qualityReadinessCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    const { verified, compilationTrace, exactCompilationTrace } = verifyEffectiveRuleSet(effectiveRuleSet);
    const typedEnvelope = typedProjectFacts?.schema_version === QUALITY_READINESS_TYPED_FACTS_SCHEMA
      ? requestFromQualityReadinessTypedFacts(typedProjectFacts)
      : null;
    if (compilationTrace !== null && typedEnvelope === null) {
      refuse('derived E01 evaluation requires the domain-local Core Typed Facts envelope');
    }
    if (typedEnvelope !== null && compilationTrace !== null
        && JSON.stringify(typedEnvelope.compilation_trace) !== JSON.stringify(exactCompilationTrace)) {
      refuse('Typed Facts compilation trace does not exactly match the Core-assembled ruleset');
    }
    const request = typedEnvelope?.request || typedProjectFacts?.request || typedProjectFacts;
    return assessQualityReadiness(request, compilationTrace === null ? {} : {
      rules: verified.rules,
      ruleset_ref: verified.ruleset_ref,
      source_packet_ref: verified.source_packet_ref,
      profile_rule_provenance: verified.profile_rule_provenance,
      profile_compilation_trace: compilationTrace,
      typed_facts_sha256: typedEnvelope.typed_project_facts.facts_digest,
    });
  },
});

registerDomainEngineAdapter('quality_readiness', qualityReadinessAdapter);
