import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { arrayOrderRules, registerDomainEngineAdapter, withoutNulls } from '../../../core/interfaces/domain_engine_adapter.mjs';
import {
  DATABASE_ENGINE_ID,
  DATABASE_EVALUATION_SCHEMA,
  DATABASE_GAP_STATE,
  DATABASE_RULESET_SCHEMA,
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

function validateProfileProvenanceRecord(ruleId, profile, compilationTrace) {
  assertExactKeys(profile, PROVENANCE_FIELDS, `profile provenance ${ruleId}`);
  if (typeof profile.profile_id !== 'string' || typeof profile.revision_or_hash !== 'string'
      || typeof profile.extends_or_base_pin !== 'string' || typeof profile.operation_digest !== 'string'
      || typeof profile.operation_index !== 'number' || !Number.isInteger(profile.operation_index)
      || !Array.isArray(profile.source_refs) || !/^[a-f0-9]{64}$/u.test(profile.operation_item_digest)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, `profile provenance ${ruleId} is malformed`);
  }
  if (calculateDatabaseProfileOperationItemDigest(profile, ruleId) !== profile.operation_item_digest) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, `profile provenance ${ruleId} operation item digest was tampered`);
  }
  const traces = compilationTrace?.profiles;
  if (!Array.isArray(traces)) refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived ruleset requires a Core compilation trace');
  const trace = traces.find((entry) => entry && entry.profile_kind === profile.profile_kind && entry.profile_id === profile.profile_id);
  if (!trace || trace.domain_engine_id !== DATABASE_ENGINE_ID
      || trace.revision_or_hash !== profile.revision_or_hash
      || trace.extends_or_base_pin !== profile.extends_or_base_pin
      || trace.operation_digest !== profile.operation_digest
      || trace.order !== profile.order
      || !sameStringArray(trace.source_refs, profile.source_refs)
      || !Number.isInteger(trace.applied_operations_count)
      || profile.operation_index < 0 || profile.operation_index >= trace.applied_operations_count) {
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
  const ids = ruleset.rules.map((rule) => rule?.rule_id);
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

  if (!isCoreWrapper || !envelope.compilation_trace || envelope.domain_engine_id !== DATABASE_ENGINE_ID) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived ruleset must arrive through the Core compilation envelope');
  }
  if (!Array.isArray(envelope.compilation_trace.profiles)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived ruleset Core compilation trace has no profiles array');
  }
  const traceKeys = envelope.compilation_trace.profiles.map((trace) => `${trace?.profile_kind}\u0000${trace?.profile_id}`);
  if (new Set(traceKeys).size !== traceKeys.length) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'derived ruleset Core compilation trace has duplicate profile identity entries');
  }
  const coreDigest = calculateCoreEffectiveRulesetDigest(ruleset);
  if (envelope.assembly_digest !== coreDigest || envelope.compilation_trace.effective_ruleset_digest !== coreDigest) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'Core compilation envelope digest is inconsistent with admitted effective ruleset');
  }
  for (const rule of derivedRules) {
    const profile = ruleset.profile_rule_provenance[rule.rule_id];
    if (!rule.rule_id.startsWith('DBE-PROFILE-') || rule.kind !== 'advisory'
        || rule.source_authority !== 'profile_declared' || rule.claim_ceiling !== 'observed'
        || !Array.isArray(profile?.source_refs) || rule.source_refs.some((sourceRef) => !profile.source_refs.includes(sourceRef))) {
      refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived rule violates Profile authority/provenance closure');
    }
    validateProfileProvenanceRecord(rule.rule_id, profile, envelope.compilation_trace);
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
