import { DATABASE_PROJECT_BINDING_SCHEMA } from '../rules/database_engineering_vocabulary.mjs';
import { DATABASE_ENGINEERING_RULES } from '../rules/database_engineering_rules.mjs';

const SQLITE_PROJECT = 'PROJECT_DB_SQLITE_SYNTHETIC';
const POSTGRESQL_PROJECT = 'PROJECT_DB_POSTGRESQL_SYNTHETIC';

function bindingFor(projectId, family, version) {
  return {
    schema_version: DATABASE_PROJECT_BINDING_SCHEMA,
    project_id: projectId,
    domain_engine_id: 'database_engineering',
    binding_revision_hash: family === 'sqlite' ? 'a'.repeat(64) : 'b'.repeat(64),
    platform: { family, version },
    source_refs: [`ref:${projectId}:binding`],
  };
}

function requirementsFor(projectId, ruleIds) {
  return ruleIds.map((ruleId) => ({
    rule_id: ruleId,
    requirement_id: `${projectId}:REQ:${ruleId}`,
    authority_ref: `ref:${projectId}:authority:${ruleId}`,
  }));
}

function observationsFor(projectId, rules) {
  const evidenceKeyByRule = new Map(DATABASE_ENGINEERING_RULES.map((rule) => [rule.rule_id, rule.evidence_key]));
  return rules.map(([ruleId, status = 'supported', machine_observable = true]) => ({
    rule_id: ruleId,
    evidence_key: evidenceKeyByRule.get(ruleId),
    status,
    evidence_ref: `ref:${projectId}:observation:${ruleId}`,
    machine_observable,
    project_id: projectId,
  }));
}

function analysisInput() {
  return {
    schema: {
      tables: [
        { name: 'orders', foreign_keys: [{ target_table: 'customers' }] },
        { name: 'customers', foreign_keys: [] },
      ],
    },
    migrations: [{ id: 'm001', irreversible: false, rollback_proof: true }],
    transactions: { isolation: 'serializable', shared_cache_enabled: false, read_uncommitted_enabled: false, idempotency_keys: ['order_request_id'] },
    workload: { metrics: [{ evidence_ref: 'ref:workload:latency', observed: true }] },
    recovery: { plan_evidence_present: true, proofs: [{ kind: 'restore_test', passed: true }, { kind: 'pitr_preconditions', passed: true }] },
    platform_controls: {
      sqlite: {
        foreign_keys_enabled: true,
        foreign_key_check_clean: true,
        integrity_check_clean: true,
        shared_cache_enabled: false,
        read_uncommitted_enabled: false,
        single_writer_requirement_met: true,
      },
      postgresql: {
        constraints_requirement_met: true,
        isolation_requirement_met: true,
        rls_requirement_met: true,
        pitr_preconditions_met: true,
      },
    },
    data_quality: { checks: [{ check_id: 'dq_orders_fk', status: 'passed', evidence_ref: 'ref:dq:orders_fk' }] },
  };
}

export function buildSqlitePublicSyntheticInput() {
  const ruleIds = [
    'DBE-COMMON-MIG-001',
    'DBE-COMMON-RECOVERY-001',
    'DBE-SQLITE-FK-CHECK-001',
    'DBE-SQLITE-FK-CONNECTION-001',
    'DBE-SQLITE-INTEGRITY-001',
    'DBE-SQLITE-ISOLATION-001',
    'DBE-SQLITE-WRITER-001',
  ];
  return {
    binding: bindingFor(SQLITE_PROJECT, 'sqlite', '3.53.4'),
    evidence: {
      requirements: requirementsFor(SQLITE_PROJECT, ruleIds),
      observations: observationsFor(SQLITE_PROJECT, ruleIds.map((ruleId) => [ruleId])),
      analysis_input: analysisInput(),
    },
    cutoffs: { valid_at: '2026-08-26T00:00:00.000Z', known_at: '2026-08-26T00:00:00.000Z' },
  };
}

export function buildPostgresqlPublicSyntheticInput() {
  const ruleIds = [
    'DBE-COMMON-RECOVERY-001',
    'DBE-POSTGRESQL-CONSTRAINT-001',
    'DBE-POSTGRESQL-ISOLATION-001',
    'DBE-POSTGRESQL-PITR-001',
    'DBE-POSTGRESQL-RLS-001',
  ];
  return {
    binding: bindingFor(POSTGRESQL_PROJECT, 'postgresql', '18.6'),
    evidence: {
      requirements: requirementsFor(POSTGRESQL_PROJECT, ruleIds),
      observations: observationsFor(POSTGRESQL_PROJECT, ruleIds.map((ruleId) => [ruleId])),
      analysis_input: analysisInput(),
    },
    cutoffs: { valid_at: '2026-08-26T00:00:00.000Z', known_at: '2026-08-26T00:00:00.000Z' },
  };
}

export function buildUnsupportedDatabasePublicSyntheticInput() {
  const input = buildSqlitePublicSyntheticInput();
  input.binding.platform = { family: 'mysql', version: '8.4.0' };
  input.binding.binding_revision_hash = 'c'.repeat(64);
  return input;
}

export const DATABASE_ENGINEERING_PUBLIC_SYNTHETIC = Object.freeze({
  contains_actual_project_data: false,
  contains_private_data: false,
  contains_source_bodies: false,
  sqlite_project_id: SQLITE_PROJECT,
  postgresql_project_id: POSTGRESQL_PROJECT,
});
