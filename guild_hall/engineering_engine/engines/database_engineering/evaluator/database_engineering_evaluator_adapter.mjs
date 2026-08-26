import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { arrayOrderRules, registerDomainEngineAdapter, withoutNulls } from '../../../core/interfaces/domain_engine_adapter.mjs';
import {
  DATABASE_ENGINE_ID,
  DATABASE_EVALUATION_SCHEMA,
  DATABASE_GAP_STATE,
  DATABASE_PROFILE_ADVISORY_EVIDENCE_KEY_PATTERN,
  DATABASE_REVIEW_AXES,
  DATABASE_RULE_KINDS,
  DATABASE_RULESET_SCHEMA,
  DATABASE_SOURCE_AUTHORITY,
  DBE_ERROR_CODES,
} from '../rules/database_engineering_vocabulary.mjs';
import {
  DATABASE_BASE_RULESET_REF,
  DATABASE_ENGINEERING_RULES,
  DATABASE_SOURCE_INVENTORY_REF,
} from '../rules/database_engineering_rules.mjs';
import { resolveDatabasePlatformPack, platformAppliesToRule } from '../platform/database_platform_packs.mjs';
import { analyseDatabaseEvidence } from '../analysis/database_evidence_analyzers.mjs';
import {
  calculateDatabaseDerivedRulesetDigest,
  calculateDatabaseProfileOperationItemDigest,
  databaseEngineeringCompilerAdapter,
  cloneDatabasePlainData,
} from '../compiler/database_engineering_compiler_adapter.mjs';
import { validateDatabaseTypedFacts } from './database_project_evidence_adapter.mjs';

const RULE_FIELDS = Object.freeze(['axis', 'claim_ceiling', 'evidence_key', 'kind', 'platforms', 'rule_id', 'source_authority', 'source_locator', 'source_refs']);
const BASE_BY_ID = new Map(DATABASE_ENGINEERING_RULES.map((rule) => [rule.rule_id, rule]));
const BASE_HARD_RULE_EVIDENCE_KEYS = Object.freeze(DATABASE_ENGINEERING_RULES.filter((rule) => rule.kind === 'hard_technical').map((rule) => rule.evidence_key));
const PROVENANCE_FIELDS = Object.freeze([
  'profile_kind', 'profile_id', 'revision_or_hash', 'extends_or_base_pin', 'operation_digest',
  'source_refs', 'order', 'operation_index', 'operation_item_digest',
]);
const CORE_EFFECTIVE_ENVELOPE_FIELDS = Object.freeze([
  'schema_version', 'domain_engine_id', 'effective_rule_set', 'compilation_trace', 'rule_count', 'assembly_digest',
]);
const CORE_COMPILATION_TRACE_FIELDS = Object.freeze([
  'schema_version', 'domain_engine_id', 'domain_adapter_revision', 'organization_trace', 'project_trace',
  'profiles', 'compilation_scope', 'effective_ruleset_digest', 'rule_count',
]);
const CORE_PROFILE_TRACE_FIELDS = Object.freeze([
  'order', 'profile_kind', 'profile_id', 'domain_engine_id', 'revision_or_hash', 'extends_or_base_pin',
  'operation_digest', 'applied_operations_count', 'source_refs',
]);
const CORE_PROFILE_PROJECTION_FIELDS = Object.freeze([
  'profile_id', 'domain_engine_id', 'revision_or_hash', 'extends_or_base_pin', 'operation_digest',
  'applied_operations_count', 'source_refs',
]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const RULE_ID = /^DBE-(?:COMMON|SQLITE|POSTGRESQL|PROFILE)-[A-Z0-9-]+$/u;
const PROFILE_RULE_ID = /^DBE-PROFILE-[A-Z0-9-]+$/u;
const PROFILE_ADVISORY_EVIDENCE_KEY = new RegExp(DATABASE_PROFILE_ADVISORY_EVIDENCE_KEY_PATTERN, 'u');
const PLATFORM_FAMILIES = new Set(['common', 'sqlite', 'postgresql']);
const CLAIM_CEILINGS = new Set(['observed', 'source_supported']);

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const refuse = (code, message) => { throw new ContractError(code, message); };

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertExactKeys(value, expected, label, code = DBE_ERROR_CODES.RULESET_INVALID) {
  const keys = Object.keys(value).sort(compareCodePoints);
  const target = [...expected].sort(compareCodePoints);
  if (keys.length !== target.length || keys.some((key, index) => key !== target[index])) refuse(code, `${label} has an invalid closed key set`);
}

function cloneOuterEnvelope(raw, label) {
  return cloneDatabasePlainData(raw, label, new Set(), new Set(), { allowNull: true, allowAliases: true });
}

function assertRuleShape(rule) {
  assertExactKeys(rule, RULE_FIELDS, 'effective rule row');
  if (!Array.isArray(rule.platforms) || !Array.isArray(rule.source_refs)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective rule row arrays are invalid');
  }
}

function validateDerivedRuleSchemaShape(rule) {
  if (!PROFILE_RULE_ID.test(rule.rule_id)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} rule_id is invalid`);
  }
  if (!DATABASE_REVIEW_AXES.includes(rule.axis)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} axis is invalid`);
  if (!DATABASE_RULE_KINDS.includes(rule.kind)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} kind is invalid`);
  if (!Array.isArray(rule.platforms) || rule.platforms.length === 0 || rule.platforms.some((platform) => !PLATFORM_FAMILIES.has(platform))) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} platforms is invalid`);
  }
  if (!isNonEmptyStringArray(rule.source_refs)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} source_refs is invalid`);
  }
  if (!isNonEmptyString(rule.source_locator)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} source_locator is invalid`);
  }
  if (!DATABASE_SOURCE_AUTHORITY.includes(rule.source_authority)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} source_authority is invalid`);
  }
  if (!CLAIM_CEILINGS.has(rule.claim_ceiling)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} claim_ceiling is invalid`);
  }
  if (!PROFILE_ADVISORY_EVIDENCE_KEY.test(rule.evidence_key)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} evidence_key is invalid`);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isProfileKind(value) {
  return value === 'organization' || value === 'project';
}

function coreProfileProjection(trace) {
  return Object.fromEntries(CORE_PROFILE_PROJECTION_FIELDS.map((field) => [field, trace[field]]));
}

function validateCoreProfileTraceRecord(trace, label) {
  assertExactKeys(trace, CORE_PROFILE_TRACE_FIELDS, label);
  if (!isProfileKind(trace.profile_kind)
      || !isNonEmptyString(trace.profile_id)
      || trace.domain_engine_id !== DATABASE_ENGINE_ID
      || !isNonEmptyString(trace.revision_or_hash)
      || !isNonEmptyString(trace.extends_or_base_pin)
      || !SHA256_HEX.test(trace.operation_digest)
      || !isNonEmptyStringArray(trace.source_refs)
      || !Number.isInteger(trace.order) || trace.order < 0 || trace.order > 1
      || !Number.isInteger(trace.applied_operations_count) || trace.applied_operations_count < 0) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `${label} is malformed`);
  }
}

function validateCoreCompilationEnvelope(envelope, ruleset) {
  assertExactKeys(envelope, CORE_EFFECTIVE_ENVELOPE_FIELDS, 'derived ruleset Core compilation envelope');
  if (envelope.schema_version !== 'soulforge.effective_rule_set.v0'
      || envelope.domain_engine_id !== DATABASE_ENGINE_ID
      || !Number.isInteger(envelope.rule_count)
      || envelope.rule_count !== ruleset.rules.length
      || !SHA256_HEX.test(envelope.assembly_digest)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived ruleset Core compilation envelope is malformed');
  }
  const trace = envelope.compilation_trace;
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived ruleset requires a Core compilation trace');
  }
  assertExactKeys(trace, CORE_COMPILATION_TRACE_FIELDS, 'derived ruleset Core compilation trace');
  if (trace.schema_version !== 'soulforge.compilation_trace.v0'
      || trace.domain_engine_id !== DATABASE_ENGINE_ID
      || trace.domain_adapter_revision !== databaseEngineeringCompilerAdapter.revision
      || !Array.isArray(trace.profiles) || trace.profiles.length === 0 || trace.profiles.length > 2
      || !Number.isInteger(trace.rule_count) || trace.rule_count !== ruleset.rules.length
      || !SHA256_HEX.test(trace.effective_ruleset_digest)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived ruleset Core compilation trace is malformed');
  }
  for (const [index, profileTrace] of trace.profiles.entries()) {
    validateCoreProfileTraceRecord(profileTrace, `derived ruleset Core compilation trace profile ${index}`);
  }
  const traceKeys = trace.profiles.map((profileTrace) => `${profileTrace.profile_kind}\u0000${profileTrace.profile_id}`);
  if (new Set(traceKeys).size !== traceKeys.length) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'derived ruleset Core compilation trace has duplicate profile identity entries');
  }
  for (const [index, profileTrace] of trace.profiles.entries()) {
    if (profileTrace.order !== index) {
      refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'derived ruleset Core compilation trace profile order is inconsistent');
    }
  }
  if (trace.profiles.length === 2 && (trace.profiles[0].profile_kind !== 'organization' || trace.profiles[1].profile_kind !== 'project')) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'derived ruleset Core compilation trace profile sequence is inconsistent');
  }
  const organizationTrace = trace.profiles.find((profileTrace) => profileTrace.profile_kind === 'organization');
  const projectTrace = trace.profiles.find((profileTrace) => profileTrace.profile_kind === 'project');
  if (!sameJson(trace.organization_trace, organizationTrace ? coreProfileProjection(organizationTrace) : null)
      || !sameJson(trace.project_trace, projectTrace ? coreProfileProjection(projectTrace) : null)) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'derived ruleset Core compilation trace projection is inconsistent');
  }
  return trace;
}

function validateProfileProvenanceRecord(ruleId, profile, compilationTrace) {
  assertExactKeys(profile, PROVENANCE_FIELDS, `profile provenance ${ruleId}`);
  if (!isProfileKind(profile.profile_kind)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} profile_kind is invalid`);
  if (!isNonEmptyString(profile.profile_id)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} profile_id is invalid`);
  if (!isNonEmptyString(profile.revision_or_hash)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} revision_or_hash is invalid`);
  if (!isNonEmptyString(profile.extends_or_base_pin)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} extends_or_base_pin is invalid`);
  if (!SHA256_HEX.test(profile.operation_digest)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} operation_digest is invalid`);
  if (!isNonEmptyStringArray(profile.source_refs)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} source_refs is invalid`);
  if (!Number.isInteger(profile.order) || profile.order < 0 || profile.order > 1) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} order is invalid`);
  }
  if (!Number.isInteger(profile.operation_index) || profile.operation_index < 0) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} operation_index is invalid`);
  }
  if (!SHA256_HEX.test(profile.operation_item_digest)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} operation_item_digest is invalid`);
  }
  if (calculateDatabaseProfileOperationItemDigest(profile, ruleId) !== profile.operation_item_digest) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, `profile provenance ${ruleId} operation item digest was tampered`);
  }
  const traces = compilationTrace?.profiles;
  const matchingTraces = Array.isArray(traces)
    ? traces.filter((entry) => entry.profile_kind === profile.profile_kind && entry.profile_id === profile.profile_id)
    : [];
  const trace = matchingTraces[0];
  if (matchingTraces.length !== 1) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, `profile provenance ${ruleId} does not identify exactly one Core compilation trace`);
  }
  if (profile.operation_index >= trace.applied_operations_count) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} operation_index is outside applied Core operations`);
  }
  if (!trace || trace.domain_engine_id !== DATABASE_ENGINE_ID
      || trace.revision_or_hash !== profile.revision_or_hash
      || trace.extends_or_base_pin !== profile.extends_or_base_pin
      || trace.operation_digest !== profile.operation_digest
      || trace.order !== profile.order
      || !sameStringArray(trace.source_refs, profile.source_refs)
      || !Number.isInteger(trace.applied_operations_count)) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, `profile provenance ${ruleId} does not match Core compilation trace`);
  }
}

function calculateCoreEffectiveRulesetDigest(ruleset) {
  const clean = withoutNulls(ruleset);
  return sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(clean, arrayOrderRules(clean))}`);
}

function unwrapAndValidateRuleset(raw) {
  // Clone the complete outer envelope before inspecting its optional effective_rule_set field.
  const envelope = cloneOuterEnvelope(raw, 'effective ruleset argument');
  if (envelope === null || Array.isArray(envelope)) {
    refuse(DBE_ERROR_CODES.INPUT_INVALID, 'effective ruleset argument must be a plain non-null object');
  }
  const isCoreWrapper = Object.hasOwn(envelope, 'effective_rule_set');
  const candidate = isCoreWrapper ? envelope.effective_rule_set : envelope;
  const ruleset = cloneDatabasePlainData(candidate, 'effective ruleset');
  assertExactKeys(ruleset, [
    'schema_version', 'domain_engine_id', 'ruleset_ref', 'source_inventory_ref', 'base_ruleset_ref', 'rules', 'profile_rule_provenance',
  ], 'effective ruleset');
  if (ruleset.schema_version !== DATABASE_RULESET_SCHEMA || ruleset.domain_engine_id !== DATABASE_ENGINE_ID) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective ruleset schema or domain id is invalid');
  }
  if (!sameJson(ruleset.source_inventory_ref, DATABASE_SOURCE_INVENTORY_REF)
      || !sameJson(ruleset.base_ruleset_ref, DATABASE_BASE_RULESET_REF)) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'effective ruleset source/base reference was tampered');
  }
  if (!Array.isArray(ruleset.rules) || !ruleset.profile_rule_provenance || typeof ruleset.profile_rule_provenance !== 'object') {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective ruleset must carry rules and provenance');
  }
  for (const [index, rule] of ruleset.rules.entries()) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || typeof rule.rule_id !== 'string' || !RULE_ID.test(rule.rule_id)) {
      refuse(DBE_ERROR_CODES.RULESET_INVALID, `effective rule ${index} rule_id is invalid`);
    }
  }
  const ids = ruleset.rules.map((rule) => rule.rule_id);
  const sortedIds = [...ids].sort(compareCodePoints);
  if (ids.length !== sortedIds.length || ids.some((id, index) => id !== sortedIds[index]) || new Set(ids).size !== ids.length) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective rules must be complete, unique, and code-point ordered');
  }
  for (const baseRule of DATABASE_ENGINEERING_RULES) {
    const supplied = ruleset.rules.find((rule) => rule?.rule_id === baseRule.rule_id);
    if (!supplied || !sameJson(supplied, baseRule)) {
      refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, `base rule ${baseRule.rule_id} is missing or tampered`);
    }
  }
  const derivedRules = ruleset.rules.filter((rule) => !BASE_BY_ID.has(rule.rule_id));
  const provenanceKeys = Object.keys(ruleset.profile_rule_provenance).sort(compareCodePoints);
  const derivedIds = derivedRules.map((rule) => rule.rule_id);
  if (!sameStringArray(provenanceKeys, derivedIds)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived rules and provenance records must be exact one-to-one members');
  }
  for (const rule of ruleset.rules) assertRuleShape(rule);

  if (derivedRules.length === 0) {
    if (!sameJson(ruleset.rules, DATABASE_ENGINEERING_RULES)
        || provenanceKeys.length !== 0
        || !sameJson(ruleset.ruleset_ref, DATABASE_BASE_RULESET_REF)) {
      refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'base ruleset identity, ordering, or membership was tampered');
    }
    return { ruleset, compilation_trace: null };
  }

  if (!isCoreWrapper) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived ruleset must arrive through the Core compilation envelope');
  }
  const compilationTrace = validateCoreCompilationEnvelope(envelope, ruleset);
  const coreDigest = calculateCoreEffectiveRulesetDigest(ruleset);
  if (envelope.assembly_digest !== coreDigest || compilationTrace.effective_ruleset_digest !== coreDigest) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'Core compilation envelope digest is inconsistent with admitted effective ruleset');
  }
  const derivedCountByTrace = new Map(compilationTrace.profiles.map((trace) => [`${trace.profile_kind}\u0000${trace.profile_id}`, 0]));
  const derivedOperationKeys = new Set();
  for (const rule of derivedRules) {
    validateDerivedRuleSchemaShape(rule);
    const profile = ruleset.profile_rule_provenance[rule.rule_id];
    if (!rule.rule_id.startsWith('DBE-PROFILE-') || rule.kind !== 'advisory'
        || rule.source_authority !== 'profile_declared' || rule.claim_ceiling !== 'observed'
        || !Array.isArray(profile?.source_refs) || rule.source_refs.some((sourceRef) => !profile.source_refs.includes(sourceRef))) {
      refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived rule violates Profile authority/provenance closure');
    }
    validateProfileProvenanceRecord(rule.rule_id, profile, compilationTrace);
    const traceKey = `${profile.profile_kind}\u0000${profile.profile_id}`;
    const operationKey = `${traceKey}\u0000${profile.operation_index}`;
    if (derivedOperationKeys.has(operationKey)) {
      refuse(DBE_ERROR_CODES.RULESET_INVALID, `derived rule ${rule.rule_id} duplicates a Profile operation identity`);
    }
    derivedOperationKeys.add(operationKey);
    derivedCountByTrace.set(traceKey, derivedCountByTrace.get(traceKey) + 1);
  }
  for (const trace of compilationTrace.profiles) {
    const traceKey = `${trace.profile_kind}\u0000${trace.profile_id}`;
    if (derivedCountByTrace.get(traceKey) !== trace.applied_operations_count) {
      refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'derived rules do not match Core applied operation counts');
    }
  }
  const digest = calculateDatabaseDerivedRulesetDigest(ruleset.rules, ruleset.profile_rule_provenance);
  const expectedRef = {
    entity_id: 'database-engineering-ruleset-derived-v0',
    revision_id: `derived:${digest.slice(0, 16)}`,
    content_id: `sha256:${digest}`,
    content_hash_alg: 'sha256',
  };
  if (!sameJson(ruleset.ruleset_ref, expectedRef)) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'derived ruleset identity/provenance digest was tampered');
  }
  return { ruleset, compilation_trace: envelope.compilation_trace };
}

function stateForRule(rule, facts, pack, analysis) {
  if (!pack) return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'platform_unsupported', hard_technical_failure: false };
  if (!platformAppliesToRule(rule, pack)) return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'rule_not_applicable_to_platform', hard_technical_failure: false };
  const requirement = facts.requirements.find((entry) => entry.rule_id === rule.rule_id);
  if (!requirement) return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'project_requirement_unbound', hard_technical_failure: false };
  const observation = facts.evidence.find((entry) => entry.rule_id === rule.rule_id);
  if (!observation || observation.status === 'unknown') return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'machine_observable_evidence_missing', hard_technical_failure: false };
  if (observation.evidence_key !== rule.evidence_key) return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'evidence_key_mismatch', hard_technical_failure: false };
  if (observation.status === 'conflict') return { state: DATABASE_GAP_STATE.CONFLICT, reason_code: 'machine_observable_evidence_conflict', hard_technical_failure: false };
  if (rule.kind === 'hard_technical') {
    if (rule.source_authority !== 'inventory_anchored') return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'hard_rule_authority_not_inventory_anchored', hard_technical_failure: false };
    if (observation.machine_observable !== true) return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'hard_rule_machine_observation_not_confirmed', hard_technical_failure: false };
    const analyzerProof = analysis.evidence_by_key?.[rule.evidence_key];
    if (analyzerProof?.status === 'conflict') return { state: DATABASE_GAP_STATE.CONFLICT, reason_code: 'named_analyzer_cross_input_conflict', hard_technical_failure: false };
    if (!analyzerProof || !['supported', 'contradicted'].includes(analyzerProof.status)) return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'contradiction_not_confirmed_by_named_analyzer', hard_technical_failure: false };
    if (analyzerProof.status !== observation.status) return { state: DATABASE_GAP_STATE.CONFLICT, reason_code: 'caller_and_analyzer_evidence_conflict', hard_technical_failure: false };
  }
  if (observation.status === 'supported') return { state: DATABASE_GAP_STATE.SATISFIED, reason_code: 'bound_requirement_supported', hard_technical_failure: false };
  if (observation.status === 'contradicted' && observation.machine_observable === true) {
    return { state: DATABASE_GAP_STATE.MISSING, reason_code: 'bound_requirement_machine_observation_contradicted', hard_technical_failure: rule.kind === 'hard_technical' };
  }
  return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'contradiction_not_machine_observable', hard_technical_failure: false };
}

function sourceProvenanceForRule(rule, ruleset) {
  if (rule.source_authority === 'inventory_anchored') return { authority_kind: 'inventory_anchored', inventory_content_id: ruleset.source_inventory_ref.content_id };
  if (rule.source_authority === 'project_bound') return { authority_kind: 'project_bound' };
  const profile = ruleset.profile_rule_provenance[rule.rule_id];
  return {
    authority_kind: 'profile_declared',
    profile_id: profile.profile_id,
    revision_or_hash: profile.revision_or_hash,
    operation_digest: profile.operation_digest,
    operation_item_digest: profile.operation_item_digest,
  };
}

function factProvenanceForRule(rule, facts) {
  const requirement = facts.requirements.find((entry) => entry.rule_id === rule.rule_id);
  const observation = facts.evidence.find((entry) => entry.rule_id === rule.rule_id);
  return {
    project_binding: {
      project_id: facts.project_binding.project_id,
      binding_revision_hash: facts.project_binding.binding_revision_hash,
      source_manifest_ref: facts.project_binding.source_manifest_ref,
    },
    requirement: requirement
      ? { project_id: requirement.project_id, requirement_id: requirement.requirement_id, authority_ref: requirement.authority_ref }
      : { binding_state: 'unbound' },
    observation: observation
      ? { project_id: observation.project_id, evidence_ref: observation.evidence_ref, evidence_key: observation.evidence_key }
      : { binding_state: 'unobserved' },
  };
}

function countResults(results) {
  return results.reduce((counts, result) => {
    counts[result.state] = (counts[result.state] || 0) + 1;
    return counts;
  }, {
    [DATABASE_GAP_STATE.SATISFIED]: 0,
    [DATABASE_GAP_STATE.MISSING]: 0,
    [DATABASE_GAP_STATE.UNKNOWN]: 0,
    [DATABASE_GAP_STATE.CONFLICT]: 0,
  });
}

export function validateDatabaseHardAnalyzerCoverage(rules, analysis) {
  const knownKeys = new Set(Object.keys(analysis.evidence_by_key || {}));
  for (const rule of rules) if (rule.kind === 'hard_technical' && !knownKeys.has(rule.evidence_key)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `hard rule ${rule.rule_id} has no named analyzer projection`);
  for (const evidenceKey of BASE_HARD_RULE_EVIDENCE_KEYS) if (!knownKeys.has(evidenceKey)) refuse(DBE_ERROR_CODES.RULESET_INVALID, `base hard-rule analyzer projection is missing ${evidenceKey}`);
}

function assertFactsRuleMembership(facts, rules) {
  const allowed = new Set(rules.map((rule) => rule.rule_id));
  for (const row of [...facts.requirements, ...facts.evidence]) {
    if (!allowed.has(row.rule_id)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, `Typed Facts row ${row.rule_id} is outside the effective ruleset`);
  }
}

function unwrapAndValidateFacts(raw) {
  const envelope = cloneOuterEnvelope(raw, 'typed facts argument');
  if (envelope === null || Array.isArray(envelope)) {
    refuse(DBE_ERROR_CODES.INPUT_INVALID, 'typed facts argument must be a plain non-null object');
  }
  const candidate = Object.hasOwn(envelope, 'typed_project_facts') ? envelope.typed_project_facts : envelope;
  return validateDatabaseTypedFacts(candidate);
}

function validateEvaluatorOptions(authority, cutoffs, facts) {
  const safeAuthority = cloneOuterEnvelope(authority, 'evaluator authority');
  const safeCutoffs = cloneOuterEnvelope(cutoffs, 'evaluator cutoffs');
  if (safeAuthority === null || safeCutoffs === null || Array.isArray(safeAuthority) || Array.isArray(safeCutoffs)) {
    refuse(DBE_ERROR_CODES.INPUT_INVALID, 'evaluator authority and cutoffs must be plain non-null objects');
  }
  if (Object.keys(safeAuthority).length > 0) {
    assertExactKeys(safeAuthority, ['requested_effects'], 'evaluator authority', DBE_ERROR_CODES.EFFECTS_FORBIDDEN);
    refuse(DBE_ERROR_CODES.EFFECTS_FORBIDDEN, 'Database Engineering evaluator offers no effects');
  }
  if (Object.keys(safeCutoffs).length === 0) return;
  assertExactKeys(safeCutoffs, ['valid_at', 'known_at'], 'evaluator cutoffs', DBE_ERROR_CODES.EVIDENCE_INVALID);
  if (safeCutoffs.valid_at !== facts.valid_at || safeCutoffs.known_at !== facts.known_at) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'evaluator cutoffs must exactly match validated Typed Facts cutoffs');
  }
}

export function evaluateDatabaseEngineering(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
  const admittedRuleset = unwrapAndValidateRuleset(effectiveRuleSet);
  const facts = unwrapAndValidateFacts(typedProjectFacts);
  validateEvaluatorOptions(authority, cutoffs, facts);
  const pack = resolveDatabasePlatformPack(facts.project_binding.platform);
  const analysis = analyseDatabaseEvidence(facts.analysis_input);
  assertFactsRuleMembership(facts, admittedRuleset.ruleset.rules);
  validateDatabaseHardAnalyzerCoverage(admittedRuleset.ruleset.rules, analysis);
  const results = admittedRuleset.ruleset.rules.map((rule) => {
    const judgment = stateForRule(rule, facts, pack, analysis);
    const observation = facts.evidence.find((entry) => entry.rule_id === rule.rule_id) || null;
    return {
      rule_id: rule.rule_id,
      axis: rule.axis,
      state: judgment.state,
      reason_code: judgment.reason_code,
      hard_technical_failure: judgment.hard_technical_failure,
      claim_ceiling: rule.claim_ceiling,
      source_authority: rule.source_authority,
      source_provenance: sourceProvenanceForRule(rule, admittedRuleset.ruleset),
      fact_provenance: factProvenanceForRule(rule, facts),
      analysis_evidence_key: rule.evidence_key,
      analysis_status: analysis.evidence_by_key?.[rule.evidence_key]?.status || 'unavailable',
      evidence_ref: observation?.evidence_ref || 'not_observed',
      source_refs: rule.source_refs,
    };
  });
  const counts = countResults(results);
  const resultMaterial = { ruleset_ref: admittedRuleset.ruleset.ruleset_ref, facts_digest: facts.facts_digest, results, analysis };
  const resultDigest = sha256Hex(`soulforge.database_engineering.evaluation.v0\n${canonicalise(resultMaterial, {
    results: 'sorted_by:rule_id',
    'results[].source_refs': 'insertion_ordered',
    'analysis.schema_graph.duplicate_tables': 'insertion_ordered',
    'analysis.schema_graph.missing_foreign_key_targets': 'insertion_ordered',
    'analysis.migration_diff.duplicate_ids': 'insertion_ordered',
    'analysis.migration_diff.irreversible_without_rollback_proof': 'insertion_ordered',
    'analysis.transaction_semantics.duplicate_idempotency_keys': 'insertion_ordered',
    'analysis.data_quality.failed_check_ids': 'insertion_ordered',
  })}`);
  return deepFreeze({
    schema_version: DATABASE_EVALUATION_SCHEMA,
    domain_engine_id: DATABASE_ENGINE_ID,
    ruleset_ref: admittedRuleset.ruleset.ruleset_ref,
    results,
    counts,
    analysis,
    receipt: {
      schema_version: 'soulforge.database_engineering.evaluation_receipt.v0',
      facts_digest: facts.facts_digest,
      evaluation_digest: resultDigest,
      platform: facts.project_binding.platform,
      platform_supported: facts.platform_supported,
      effects: { file_writes: 0, network_calls: 0, db_writes: 0, model_calls: 0 },
    },
  });
}

export const databaseEngineeringAdapter = Object.freeze({
  ...databaseEngineeringCompilerAdapter,
  evaluate: evaluateDatabaseEngineering,
});

registerDomainEngineAdapter(DATABASE_ENGINE_ID, databaseEngineeringAdapter);
