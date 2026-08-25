import { GAP_TYPE } from '../../../core/validators/snapshot.mjs';

export const DATABASE_ENGINE_ID = 'database_engineering';
export const DATABASE_RULESET_SCHEMA = 'soulforge.database_engineering.ruleset.v0';
export const DATABASE_TYPED_FACTS_SCHEMA = 'soulforge.database_engineering.typed_facts.v0';
export const DATABASE_PROJECT_BINDING_SCHEMA = 'soulforge.database_engineering.project_binding.v0';
export const DATABASE_EVALUATION_SCHEMA = 'soulforge.database_engineering.evaluation.v0';

// These keys intentionally map to the existing Core vocabulary; the package never invents
// a fifth "risk" or aggregate readiness state.
export const DATABASE_GAP_STATE = Object.freeze({
  SATISFIED: GAP_TYPE.SATISFIED,
  MISSING: GAP_TYPE.MISSING,
  UNKNOWN: GAP_TYPE.UNKNOWN,
  CONFLICT: GAP_TYPE.CONFLICT,
});

export const DATABASE_EVIDENCE_STATUS = Object.freeze([
  'supported',
  'contradicted',
  'unknown',
  'conflict',
]);

export const DATABASE_PLATFORM_FAMILIES = Object.freeze(['sqlite', 'postgresql']);
export const DATABASE_RULE_KINDS = Object.freeze(['hard_technical', 'advisory']);
export const DATABASE_SOURCE_AUTHORITY = Object.freeze([
  'inventory_anchored',
  'project_bound',
  'profile_declared',
]);
export const DATABASE_REVIEW_AXES = Object.freeze([
  'requirements_workload_authority',
  'conceptual_logical_model',
  'identifiers_nulls_integrity',
  'temporal_revision_semantics',
  'physical_design_indexes',
  'transactions_isolation_concurrency_idempotency',
  'security_access_project_isolation',
  'schema_evolution_migration_backfill_rollback',
  'performance_capacity_observability',
  'backup_restore_pitr_rpo_rto_dr',
  'data_quality_governance_retention_retirement',
]);

export const DBE_ERROR_CODES = Object.freeze({
  INPUT_INVALID: 'DBE_INPUT_INVALID',
  BINDING_INVALID: 'DBE_BINDING_INVALID',
  RULESET_INVALID: 'DBE_RULESET_INVALID',
  OPERATION_INVALID: 'DBE_OPERATION_INVALID',
  EVIDENCE_INVALID: 'DBE_EVIDENCE_INVALID',
  SOURCE_TAMPERED: 'DBE_SOURCE_TAMPERED',
  EFFECTS_FORBIDDEN: 'DBE_EFFECTS_FORBIDDEN',
});

export const FORBIDDEN_DATA_PATTERNS = Object.freeze([
  /^[A-Za-z]:[\\/]/u,
  /^\\\\[^\\]+\\[^\\]+/u,
  /^\/(?:etc|var|usr|home|root|tmp)/u,
  /(?:secret|password|bearer|api[_-]?key|access[_-]?token)/iu,
]);
