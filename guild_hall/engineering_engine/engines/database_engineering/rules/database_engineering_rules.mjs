import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { DATABASE_ENGINE_ID, DATABASE_REVIEW_AXES, DATABASE_RULESET_SCHEMA } from './database_engineering_vocabulary.mjs';

const freezeRule = (rule) => Object.freeze({
  ...rule,
  source_authority: rule.source_authority || (rule.source_refs.includes('PROJECT-BOUND') ? 'project_bound' : 'inventory_anchored'),
  platforms: Object.freeze([...rule.platforms]),
  source_refs: Object.freeze([...rule.source_refs]),
});

export const DATABASE_SOURCE_INVENTORY_REF = Object.freeze({
  entity_id: 'database-engineering-source-inventory-v0',
  revision_id: 'database-engineering-source-inventory-v0',
  // Exact inventory-byte pin is verified by the package test and never represents a source body.
  content_id: 'sha256:52af0d396b227a8f935303bf14cada7c4453cd2146990e2dd5235fbbdcd92435',
  content_hash_alg: 'sha256',
});

export const DATABASE_ENGINEERING_RULES = Object.freeze([
  freezeRule({
    rule_id: 'DBE-COMMON-REQ-001',
    axis: 'requirements_workload_authority',
    kind: 'advisory',
    platforms: ['common'],
    source_refs: ['PROJECT-BOUND'],
    source_locator: 'project-owned requirement/workload/authority binding',
    claim_ceiling: 'source_supported',
    evidence_key: 'requirements_authority',
  }),
  freezeRule({
    rule_id: 'DBE-COMMON-MODEL-001',
    axis: 'conceptual_logical_model',
    kind: 'advisory',
    platforms: ['common'],
    source_refs: ['PROJECT-BOUND'],
    source_locator: 'project-bound model decision',
    claim_ceiling: 'source_supported',
    evidence_key: 'schema_graph',
  }),
  freezeRule({
    rule_id: 'DBE-COMMON-MIG-001',
    axis: 'schema_evolution_migration_backfill_rollback',
    kind: 'advisory',
    platforms: ['common'],
    source_refs: ['PROJECT-BOUND'],
    source_locator: 'project-bound migration/backfill/rollback requirement',
    claim_ceiling: 'source_supported',
    evidence_key: 'migration_diff',
  }),
  freezeRule({
    rule_id: 'DBE-COMMON-PERF-001',
    axis: 'performance_capacity_observability',
    kind: 'advisory',
    platforms: ['common'],
    source_refs: ['PROJECT-BOUND'],
    source_locator: 'project-bound workload/capacity/observability requirement',
    claim_ceiling: 'source_supported',
    evidence_key: 'query_workload',
  }),
  freezeRule({
    rule_id: 'DBE-COMMON-DQ-001',
    axis: 'data_quality_governance_retention_retirement',
    kind: 'advisory',
    platforms: ['common'],
    source_refs: ['PROJECT-BOUND'],
    source_locator: 'project-bound data-quality/governance/retention requirement',
    claim_ceiling: 'source_supported',
    evidence_key: 'data_quality',
  }),
  freezeRule({
    rule_id: 'DBE-COMMON-RECOVERY-001',
    axis: 'backup_restore_pitr_rpo_rto_dr',
    kind: 'hard_technical',
    platforms: ['common'],
    source_refs: ['NIST-SP-800-34R1'],
    source_locator: 'project-bound recovery planning/test/maintenance evidence',
    claim_ceiling: 'source_supported',
    evidence_key: 'recovery_proof',
  }),
  freezeRule({
    rule_id: 'DBE-SQLITE-FK-CONNECTION-001',
    axis: 'identifiers_nulls_integrity',
    kind: 'hard_technical',
    platforms: ['sqlite'],
    source_refs: ['SQLITE-FK-2026-03-20'],
    source_locator: 'connection-scoped foreign-key enforcement',
    claim_ceiling: 'source_supported',
    evidence_key: 'sqlite_fk_connection',
  }),
  freezeRule({
    rule_id: 'DBE-SQLITE-FK-CHECK-001',
    axis: 'identifiers_nulls_integrity',
    kind: 'hard_technical',
    platforms: ['sqlite'],
    source_refs: ['SQLITE-FK-2026-03-20', 'SQLITE-PRAGMA-2026-06-04'],
    source_locator: 'foreign_key_check is distinct from integrity_check',
    claim_ceiling: 'source_supported',
    evidence_key: 'sqlite_fk_check',
  }),
  freezeRule({
    rule_id: 'DBE-SQLITE-INTEGRITY-001',
    axis: 'identifiers_nulls_integrity',
    kind: 'hard_technical',
    platforms: ['sqlite'],
    source_refs: ['SQLITE-PRAGMA-2026-06-04'],
    source_locator: 'integrity_check proof only',
    claim_ceiling: 'source_supported',
    evidence_key: 'sqlite_integrity_check',
  }),
  freezeRule({
    rule_id: 'DBE-SQLITE-ISOLATION-001',
    axis: 'transactions_isolation_concurrency_idempotency',
    kind: 'hard_technical',
    platforms: ['sqlite'],
    source_refs: ['SQLITE-ISOLATION-2022-04-18'],
    source_locator: 'shared-cache/read_uncommitted dirty-read exception',
    claim_ceiling: 'source_supported',
    evidence_key: 'sqlite_dirty_read_exception',
  }),
  freezeRule({
    rule_id: 'DBE-SQLITE-WRITER-001',
    axis: 'transactions_isolation_concurrency_idempotency',
    kind: 'hard_technical',
    platforms: ['sqlite'],
    source_refs: ['SQLITE-TXN-2026-02-18'],
    source_locator: 'one simultaneous write transaction capability',
    claim_ceiling: 'source_supported',
    evidence_key: 'sqlite_single_writer',
  }),
  freezeRule({
    rule_id: 'DBE-POSTGRESQL-CONSTRAINT-001',
    axis: 'identifiers_nulls_integrity',
    kind: 'hard_technical',
    platforms: ['postgresql'],
    source_refs: ['POSTGRESQL-18-CONSTRAINTS'],
    source_locator: 'project-bound database-enforced constraints',
    claim_ceiling: 'source_supported',
    evidence_key: 'postgresql_constraints',
  }),
  freezeRule({
    rule_id: 'DBE-POSTGRESQL-ISOLATION-001',
    axis: 'transactions_isolation_concurrency_idempotency',
    kind: 'hard_technical',
    platforms: ['postgresql'],
    source_refs: ['POSTGRESQL-18-TRANSACTION-ISOLATION'],
    source_locator: 'project-bound isolation guarantee',
    claim_ceiling: 'source_supported',
    evidence_key: 'postgresql_isolation',
  }),
  freezeRule({
    rule_id: 'DBE-POSTGRESQL-RLS-001',
    axis: 'security_access_project_isolation',
    kind: 'hard_technical',
    platforms: ['postgresql'],
    source_refs: ['POSTGRESQL-18-RLS'],
    source_locator: 'project-bound row-level-security requirement and bypass boundary',
    claim_ceiling: 'source_supported',
    evidence_key: 'postgresql_rls',
  }),
  freezeRule({
    rule_id: 'DBE-POSTGRESQL-PITR-001',
    axis: 'backup_restore_pitr_rpo_rto_dr',
    kind: 'hard_technical',
    platforms: ['postgresql'],
    source_refs: ['POSTGRESQL-18-BACKUP-PITR'],
    source_locator: 'project-bound PITR preconditions',
    claim_ceiling: 'source_supported',
    evidence_key: 'postgresql_pitr',
  }),
].sort((left, right) => compareCodePoints(left.rule_id, right.rule_id)));

const baseRuleIds = DATABASE_ENGINEERING_RULES.map((rule) => rule.rule_id);
if (new Set(baseRuleIds).size !== baseRuleIds.length || [...baseRuleIds].sort(compareCodePoints).some((id, index) => id !== baseRuleIds[index])) {
  throw new Error('Database Engineering base rules must be unique and code-point sorted');
}
for (const rule of DATABASE_ENGINEERING_RULES) {
  if (!DATABASE_REVIEW_AXES.includes(rule.axis)) throw new Error(`Unknown DBE review axis: ${rule.axis}`);
}

const baseMaterial = {
  schema_version: DATABASE_RULESET_SCHEMA,
  domain_engine_id: DATABASE_ENGINE_ID,
  source_inventory_ref: DATABASE_SOURCE_INVENTORY_REF,
  rules: DATABASE_ENGINEERING_RULES,
};
export const DATABASE_BASE_RULESET_DIGEST = sha256Hex(
  `soulforge.database_engineering.ruleset.base.v0\n${canonicalise(baseMaterial, {
    rules: 'sorted_by:rule_id',
    'rules[].platforms': 'insertion_ordered',
    'rules[].source_refs': 'insertion_ordered',
  })}`,
);
export const DATABASE_BASE_RULESET_REF = Object.freeze({
  entity_id: 'database-engineering-ruleset-v0',
  revision_id: 'database-engineering-ruleset-v0',
  content_id: `sha256:${DATABASE_BASE_RULESET_DIGEST}`,
  content_hash_alg: 'sha256',
});
