import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { registerDomainEngineAdapter } from '../../../core/interfaces/domain_engine_adapter.mjs';
import {
  DATABASE_ENGINE_ID,
  DATABASE_EVALUATION_SCHEMA,
  DATABASE_GAP_STATE,
  DATABASE_RULESET_SCHEMA,
  DATABASE_TYPED_FACTS_SCHEMA,
  DBE_ERROR_CODES,
} from '../rules/database_engineering_vocabulary.mjs';
import {
  DATABASE_BASE_RULESET_REF,
  DATABASE_ENGINEERING_RULES,
  DATABASE_SOURCE_INVENTORY_REF,
} from '../rules/database_engineering_rules.mjs';
import { resolveDatabasePlatformPack, platformAppliesToRule } from '../platform/database_platform_packs.mjs';
import { analyseDatabaseEvidence } from '../analysis/database_evidence_analyzers.mjs';
import { databaseEngineeringCompilerAdapter, cloneDatabasePlainData } from '../compiler/database_engineering_compiler_adapter.mjs';

const RULE_FIELDS = Object.freeze(['axis', 'claim_ceiling', 'evidence_key', 'kind', 'platforms', 'rule_id', 'source_authority', 'source_locator', 'source_refs']);
const BASE_BY_ID = new Map(DATABASE_ENGINEERING_RULES.map((rule) => [rule.rule_id, rule]));
const BASE_HARD_RULE_EVIDENCE_KEYS = Object.freeze(
  DATABASE_ENGINEERING_RULES.filter((rule) => rule.kind === 'hard_technical').map((rule) => rule.evidence_key),
);

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

function assertRuleShape(rule) {
  const fields = Object.keys(rule).sort(compareCodePoints);
  const expected = [...RULE_FIELDS].sort(compareCodePoints);
  if (fields.length !== expected.length || fields.some((field, index) => field !== expected[index])) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective rule row violates the closed DBE rule schema');
  }
  if (!Array.isArray(rule.platforms) || !Array.isArray(rule.source_refs)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective rule row arrays are invalid');
  }
}

function unwrapAndValidateRuleset(raw) {
  const candidate = raw?.effective_rule_set || raw;
  const ruleset = cloneDatabasePlainData(candidate, 'effective rule set');
  const expectedKeys = ['schema_version', 'domain_engine_id', 'ruleset_ref', 'source_inventory_ref', 'rules', 'profile_rule_provenance'];
  const keys = Object.keys(ruleset).sort(compareCodePoints);
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys.sort(compareCodePoints)[index])) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective rule set has an invalid closed key set');
  }
  if (ruleset.schema_version !== DATABASE_RULESET_SCHEMA || ruleset.domain_engine_id !== DATABASE_ENGINE_ID) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective ruleset schema or domain id is invalid');
  }
  if (!sameJson(ruleset.source_inventory_ref, DATABASE_SOURCE_INVENTORY_REF)) {
    refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'effective ruleset source inventory reference was tampered');
  }
  if (!ruleset.ruleset_ref || !/^sha256:[a-f0-9]{64}$/u.test(ruleset.ruleset_ref.content_id)) {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'ruleset reference must carry a digest');
  }
  if (!Array.isArray(ruleset.rules) || !ruleset.profile_rule_provenance || typeof ruleset.profile_rule_provenance !== 'object') {
    refuse(DBE_ERROR_CODES.RULESET_INVALID, 'ruleset must carry rules and provenance');
  }
  const seen = new Set();
  for (const rule of ruleset.rules) {
    assertRuleShape(rule);
    if (seen.has(rule.rule_id)) refuse(DBE_ERROR_CODES.RULESET_INVALID, 'effective ruleset has duplicate rule IDs');
    seen.add(rule.rule_id);
    const base = BASE_BY_ID.get(rule.rule_id);
    if (base && !sameJson(rule, base)) refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, `base rule ${rule.rule_id} was tampered`);
    if (!base) {
      const profile = ruleset.profile_rule_provenance[rule.rule_id];
      if (!rule.rule_id.startsWith('DBE-PROFILE-') || !profile
          || rule.kind !== 'advisory' || rule.source_authority !== 'profile_declared'
          || rule.claim_ceiling !== 'observed'
          || !Array.isArray(profile.source_refs)
          || rule.source_refs.some((sourceRef) => !profile.source_refs.includes(sourceRef))) {
        refuse(DBE_ERROR_CODES.RULESET_INVALID, 'derived rule has no Profile provenance');
      }
    }
  }
  if (ruleset.rules.length === DATABASE_ENGINEERING_RULES.length && !sameJson(ruleset.ruleset_ref, DATABASE_BASE_RULESET_REF)) {
    // A profile can disable then add enough rows to match the count; only a no-provenance base
    // set is expected to use the base identity.
    if (Object.keys(ruleset.profile_rule_provenance).length === 0) {
      refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'base ruleset identity was tampered');
    }
  }
  return ruleset;
}

function validateTypedFacts(raw) {
  const facts = cloneDatabasePlainData(raw, 'typed database facts');
  const required = ['schema_version', 'project_binding', 'requirements', 'evidence', 'analysis_input', 'platform_supported', 'facts_digest', 'valid_at', 'known_at'];
  const keys = Object.keys(facts).sort(compareCodePoints);
  if (keys.length !== required.length || keys.some((key, index) => key !== required.sort(compareCodePoints)[index])) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'typed facts have an invalid closed key set');
  }
  if (facts.schema_version !== DATABASE_TYPED_FACTS_SCHEMA || facts.project_binding?.domain_engine_id !== DATABASE_ENGINE_ID) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'typed facts schema or domain id is invalid');
  }
  if (!Array.isArray(facts.requirements) || !Array.isArray(facts.evidence) || typeof facts.facts_digest !== 'string') {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'typed facts evidence fields are invalid');
  }
  return facts;
}

function stateForRule(rule, facts, pack, analysis) {
  if (!pack) {
    return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'platform_unsupported', hard_technical_failure: false };
  }
  if (!platformAppliesToRule(rule, pack)) {
    return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'rule_not_applicable_to_platform', hard_technical_failure: false };
  }
  const requirement = facts.requirements.find((entry) => entry.rule_id === rule.rule_id);
  if (!requirement) {
    return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'project_requirement_unbound', hard_technical_failure: false };
  }
  const observation = facts.evidence.find((entry) => entry.rule_id === rule.rule_id);
  if (!observation || observation.status === 'unknown') {
    return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'machine_observable_evidence_missing', hard_technical_failure: false };
  }
  if (observation.evidence_key !== rule.evidence_key) {
    return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'evidence_key_mismatch', hard_technical_failure: false };
  }
  if (observation.status === 'conflict') {
    return { state: DATABASE_GAP_STATE.CONFLICT, reason_code: 'machine_observable_evidence_conflict', hard_technical_failure: false };
  }
  if (rule.kind === 'hard_technical') {
    if (rule.source_authority !== 'inventory_anchored') {
      return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'hard_rule_authority_not_inventory_anchored', hard_technical_failure: false };
    }
    const analyzerProof = analysis.evidence_by_key?.[rule.evidence_key];
    if (!analyzerProof || !['supported', 'contradicted'].includes(analyzerProof.status)) {
      return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'contradiction_not_confirmed_by_named_analyzer', hard_technical_failure: false };
    }
    if (analyzerProof.status !== observation.status) {
      return { state: DATABASE_GAP_STATE.CONFLICT, reason_code: 'caller_and_analyzer_evidence_conflict', hard_technical_failure: false };
    }
  }
  if (observation.status === 'supported') {
    return { state: DATABASE_GAP_STATE.SATISFIED, reason_code: 'bound_requirement_supported', hard_technical_failure: false };
  }
  if (observation.status === 'contradicted' && observation.machine_observable === true) {
    return {
      state: DATABASE_GAP_STATE.MISSING,
      reason_code: 'bound_requirement_machine_observation_contradicted',
      hard_technical_failure: rule.kind === 'hard_technical',
    };
  }
  return { state: DATABASE_GAP_STATE.UNKNOWN, reason_code: 'contradiction_not_machine_observable', hard_technical_failure: false };
}

function sourceProvenanceForRule(rule, ruleset) {
  if (rule.source_authority === 'inventory_anchored') {
    return {
      authority_kind: 'inventory_anchored',
      inventory_content_id: ruleset.source_inventory_ref.content_id,
    };
  }
  if (rule.source_authority === 'project_bound') {
    return { authority_kind: 'project_bound' };
  }
  const profile = ruleset.profile_rule_provenance[rule.rule_id];
  return {
    authority_kind: 'profile_declared',
    profile_id: profile.profile_id,
    revision_or_hash: profile.revision_or_hash,
    operation_digest: profile.operation_digest,
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

function assertHardRuleAnalyzerCoverage(rules, analysis) {
  const knownKeys = new Set(Object.keys(analysis.evidence_by_key || {}));
  for (const rule of rules) {
    if (rule.kind === 'hard_technical' && !knownKeys.has(rule.evidence_key)) {
      refuse(DBE_ERROR_CODES.RULESET_INVALID, `hard rule ${rule.rule_id} has no named analyzer projection`);
    }
  }
  for (const evidenceKey of BASE_HARD_RULE_EVIDENCE_KEYS) {
    if (!knownKeys.has(evidenceKey)) {
      refuse(DBE_ERROR_CODES.RULESET_INVALID, `base hard-rule analyzer projection is missing ${evidenceKey}`);
    }
  }
}

export function evaluateDatabaseEngineering(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
  if (authority?.requested_effects || cutoffs?.requested_effects) {
    refuse(DBE_ERROR_CODES.EFFECTS_FORBIDDEN, 'Database Engineering evaluator offers no effects');
  }
  const ruleset = unwrapAndValidateRuleset(effectiveRuleSet);
  const facts = validateTypedFacts(typedProjectFacts?.typed_project_facts || typedProjectFacts);
  const pack = resolveDatabasePlatformPack(facts.project_binding.platform);
  const analysis = analyseDatabaseEvidence(facts.analysis_input);
  assertHardRuleAnalyzerCoverage(ruleset.rules, analysis);
  const results = ruleset.rules.map((rule) => {
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
      source_provenance: sourceProvenanceForRule(rule, ruleset),
      analysis_evidence_key: rule.evidence_key,
      analysis_status: analysis.evidence_by_key?.[rule.evidence_key]?.status || 'unavailable',
      evidence_ref: observation?.evidence_ref || 'not_observed',
      source_refs: rule.source_refs,
    };
  });
  const counts = countResults(results);
  const resultMaterial = { ruleset_ref: ruleset.ruleset_ref, facts_digest: facts.facts_digest, results, analysis };
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
    ruleset_ref: ruleset.ruleset_ref,
    results,
    counts,
    analysis,
    receipt: {
      schema_version: 'soulforge.database_engineering.evaluation_receipt.v0',
      facts_digest: facts.facts_digest,
      evaluation_digest: resultDigest,
      platform: facts.project_binding.platform,
      platform_supported: Boolean(pack),
      effects: { file_writes: 0, network_calls: 0, db_writes: 0, model_calls: 0 },
    },
  });
}

export const databaseEngineeringAdapter = Object.freeze({
  ...databaseEngineeringCompilerAdapter,
  evaluate: evaluateDatabaseEngineering,
});

registerDomainEngineAdapter(DATABASE_ENGINE_ID, databaseEngineeringAdapter);
