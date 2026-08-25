import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { validateCanonicalInstant } from '../../../core/interfaces/domain_engine_adapter.mjs';
import {
  DATABASE_ENGINE_ID,
  DATABASE_EVIDENCE_STATUS,
  DATABASE_PROJECT_BINDING_SCHEMA,
  DATABASE_TYPED_FACTS_SCHEMA,
  DBE_ERROR_CODES,
  FORBIDDEN_DATA_PATTERNS,
} from '../rules/database_engineering_vocabulary.mjs';
import { resolveDatabasePlatformPack } from '../platform/database_platform_packs.mjs';
import { cloneDatabasePlainData } from '../compiler/database_engineering_compiler_adapter.mjs';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const refuse = (code, message) => { throw new ContractError(code, message); };

function assertSafeReference(value, label) {
  if (typeof value !== 'string' || !value || FORBIDDEN_DATA_PATTERNS.some((pattern) => pattern.test(value))) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label} must be an opaque public-safe reference`);
  }
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, `${label} has an invalid closed key set`);
  }
}

function assertAllowedKeys(value, requiredKeys, optionalKeys, label) {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const keys = Object.keys(value);
  if (requiredKeys.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, `${label} has an invalid closed key set`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, `${label} must be boolean`);
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, `${label} must be a non-empty string`);
}

function validateAnalysisInput(raw) {
  const input = cloneDatabasePlainData(raw, 'analysis_input');
  assertExactKeys(input, ['schema', 'migrations', 'transactions', 'workload', 'recovery', 'platform_controls', 'data_quality'], 'analysis_input');

  assertExactKeys(input.schema, ['tables'], 'analysis_input.schema');
  if (!Array.isArray(input.schema.tables)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'analysis_input.schema.tables must be an array');
  for (const table of input.schema.tables) {
    assertExactKeys(table, ['name', 'foreign_keys'], 'analysis_input.schema.tables[]');
    assertString(table.name, 'analysis_input.schema.tables[].name');
    if (!Array.isArray(table.foreign_keys)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'analysis_input.schema.tables[].foreign_keys must be an array');
    for (const foreignKey of table.foreign_keys) {
      assertExactKeys(foreignKey, ['target_table'], 'analysis_input.schema.tables[].foreign_keys[]');
      assertString(foreignKey.target_table, 'analysis_input.schema.tables[].foreign_keys[].target_table');
    }
  }

  if (!Array.isArray(input.migrations)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'analysis_input.migrations must be an array');
  for (const migration of input.migrations) {
    assertExactKeys(migration, ['id', 'irreversible', 'rollback_proof'], 'analysis_input.migrations[]');
    assertString(migration.id, 'analysis_input.migrations[].id');
    assertBoolean(migration.irreversible, 'analysis_input.migrations[].irreversible');
    assertBoolean(migration.rollback_proof, 'analysis_input.migrations[].rollback_proof');
  }

  assertExactKeys(input.transactions, ['isolation', 'shared_cache_enabled', 'read_uncommitted_enabled', 'idempotency_keys'], 'analysis_input.transactions');
  assertString(input.transactions.isolation, 'analysis_input.transactions.isolation');
  assertBoolean(input.transactions.shared_cache_enabled, 'analysis_input.transactions.shared_cache_enabled');
  assertBoolean(input.transactions.read_uncommitted_enabled, 'analysis_input.transactions.read_uncommitted_enabled');
  if (!Array.isArray(input.transactions.idempotency_keys) || input.transactions.idempotency_keys.some((key) => typeof key !== 'string' || !key)) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'analysis_input.transactions.idempotency_keys must be a string array');
  }

  assertAllowedKeys(input.workload, ['metrics'], ['query_plan_text'], 'analysis_input.workload');
  if (!Array.isArray(input.workload.metrics)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'analysis_input.workload.metrics must be an array');
  for (const metric of input.workload.metrics) {
    assertExactKeys(metric, ['evidence_ref', 'observed'], 'analysis_input.workload.metrics[]');
    assertSafeReference(metric.evidence_ref, 'analysis_input.workload.metrics[].evidence_ref');
    assertBoolean(metric.observed, 'analysis_input.workload.metrics[].observed');
  }
  if (Object.hasOwn(input.workload, 'query_plan_text')) assertString(input.workload.query_plan_text, 'analysis_input.workload.query_plan_text');

  assertAllowedKeys(input.recovery, ['plan_evidence_present', 'proofs'], ['restore_test_required_but_failed'], 'analysis_input.recovery');
  assertBoolean(input.recovery.plan_evidence_present, 'analysis_input.recovery.plan_evidence_present');
  if (Object.hasOwn(input.recovery, 'restore_test_required_but_failed')) assertBoolean(input.recovery.restore_test_required_but_failed, 'analysis_input.recovery.restore_test_required_but_failed');
  if (!Array.isArray(input.recovery.proofs)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'analysis_input.recovery.proofs must be an array');
  for (const proof of input.recovery.proofs) {
    assertExactKeys(proof, ['kind', 'passed'], 'analysis_input.recovery.proofs[]');
    assertString(proof.kind, 'analysis_input.recovery.proofs[].kind');
    assertBoolean(proof.passed, 'analysis_input.recovery.proofs[].passed');
  }

  assertExactKeys(input.platform_controls, ['sqlite', 'postgresql'], 'analysis_input.platform_controls');
  assertExactKeys(input.platform_controls.sqlite, [
    'foreign_keys_enabled', 'foreign_key_check_clean', 'integrity_check_clean', 'shared_cache_enabled', 'read_uncommitted_enabled', 'single_writer_requirement_met',
  ], 'analysis_input.platform_controls.sqlite');
  for (const [key, value] of Object.entries(input.platform_controls.sqlite)) assertBoolean(value, `analysis_input.platform_controls.sqlite.${key}`);
  assertExactKeys(input.platform_controls.postgresql, [
    'constraints_requirement_met', 'isolation_requirement_met', 'rls_requirement_met', 'pitr_preconditions_met',
  ], 'analysis_input.platform_controls.postgresql');
  for (const [key, value] of Object.entries(input.platform_controls.postgresql)) assertBoolean(value, `analysis_input.platform_controls.postgresql.${key}`);

  assertExactKeys(input.data_quality, ['checks'], 'analysis_input.data_quality');
  if (!Array.isArray(input.data_quality.checks)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'analysis_input.data_quality.checks must be an array');
  for (const check of input.data_quality.checks) {
    assertExactKeys(check, ['check_id', 'status', 'evidence_ref'], 'analysis_input.data_quality.checks[]');
    assertString(check.check_id, 'analysis_input.data_quality.checks[].check_id');
    if (!['passed', 'failed', 'unknown'].includes(check.status)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'analysis_input.data_quality.checks[].status is invalid');
    assertSafeReference(check.evidence_ref, 'analysis_input.data_quality.checks[].evidence_ref');
  }
  return input;
}

function validateBinding(raw) {
  const binding = cloneDatabasePlainData(raw, 'project binding');
  assertExactKeys(binding, ['schema_version', 'project_id', 'domain_engine_id', 'binding_revision_hash', 'platform', 'source_refs'], 'project binding');
  if (binding.schema_version !== DATABASE_PROJECT_BINDING_SCHEMA || binding.domain_engine_id !== DATABASE_ENGINE_ID) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'binding schema or domain engine is invalid');
  }
  if (typeof binding.project_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,80}$/u.test(binding.project_id)) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'project_id must be a bounded opaque token');
  }
  if (typeof binding.binding_revision_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(binding.binding_revision_hash)) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'binding_revision_hash must be SHA-256 hex');
  }
  if (!binding.platform || typeof binding.platform !== 'object' || Object.keys(binding.platform).length !== 2
      || typeof binding.platform.family !== 'string' || typeof binding.platform.version !== 'string') {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'platform must declare one exact family and version');
  }
  if (!Array.isArray(binding.source_refs) || binding.source_refs.length === 0) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'binding must retain at least one source reference');
  }
  binding.source_refs.forEach((ref, index) => assertSafeReference(ref, `binding.source_refs[${index}]`));
  return binding;
}

function validateRequirement(raw, binding) {
  const row = cloneDatabasePlainData(raw, 'requirement');
  assertExactKeys(row, ['rule_id', 'requirement_id', 'authority_ref'], 'requirement');
  for (const key of ['rule_id', 'requirement_id', 'authority_ref']) assertSafeReference(row[key], `requirement.${key}`);
  if (row.requirement_id.includes(binding.project_id) === false) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'requirement_id must bind to the declared project token');
  }
  return row;
}

function validateObservation(raw, binding) {
  const row = cloneDatabasePlainData(raw, 'observation');
  assertExactKeys(row, ['rule_id', 'evidence_key', 'status', 'evidence_ref', 'machine_observable', 'project_id'], 'observation');
  assertSafeReference(row.rule_id, 'observation.rule_id');
  assertSafeReference(row.evidence_key, 'observation.evidence_key');
  assertSafeReference(row.evidence_ref, 'observation.evidence_ref');
  if (!DATABASE_EVIDENCE_STATUS.includes(row.status) || typeof row.machine_observable !== 'boolean' || row.project_id !== binding.project_id) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'observation status, machine flag, or project binding is invalid');
  }
  return row;
}

export function adaptDatabaseProjectEvidence(projectBinding, evidence, cutoffs) {
  const binding = validateBinding(projectBinding);
  const rawEvidence = cloneDatabasePlainData(evidence, 'database evidence');
  assertExactKeys(rawEvidence, ['requirements', 'observations', 'analysis_input'], 'database evidence');
  if (!Array.isArray(rawEvidence.requirements) || !Array.isArray(rawEvidence.observations) || !rawEvidence.analysis_input || typeof rawEvidence.analysis_input !== 'object') {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'requirements, observations, and analysis_input are required');
  }
  const analysisInput = validateAnalysisInput(rawEvidence.analysis_input);
  const requirements = rawEvidence.requirements.map((row) => validateRequirement(row, binding)).sort((a, b) => a.rule_id.localeCompare(b.rule_id));
  const observations = rawEvidence.observations.map((row) => validateObservation(row, binding)).sort((a, b) => a.rule_id.localeCompare(b.rule_id));
  if (new Set(requirements.map((row) => row.rule_id)).size !== requirements.length || new Set(observations.map((row) => row.rule_id)).size !== observations.length) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'requirement and observation rows must not duplicate a rule_id');
  }
  const validAt = validateCanonicalInstant(cutoffs?.valid_at, 'cutoffs.valid_at');
  const knownAt = validateCanonicalInstant(cutoffs?.known_at, 'cutoffs.known_at');
  const platformPack = resolveDatabasePlatformPack(binding.platform);
  const material = { binding, requirements, observations, analysis_input: analysisInput, valid_at: validAt, known_at: knownAt };
  const digest = sha256Hex(`soulforge.database_engineering.typed_facts.v0\n${canonicalise(material, {
    'binding.source_refs': 'insertion_ordered',
    requirements: 'sorted_by:rule_id',
    observations: 'sorted_by:rule_id',
    'analysis_input.schema.tables': 'insertion_ordered',
    'analysis_input.schema.tables[].foreign_keys': 'insertion_ordered',
    'analysis_input.migrations': 'insertion_ordered',
    'analysis_input.transactions.idempotency_keys': 'insertion_ordered',
    'analysis_input.workload.metrics': 'insertion_ordered',
    'analysis_input.recovery.proofs': 'insertion_ordered',
    'analysis_input.data_quality.checks': 'insertion_ordered',
  })}`);
  const typedFacts = {
    schema_version: DATABASE_TYPED_FACTS_SCHEMA,
    project_binding: binding,
    requirements,
    evidence: observations,
    analysis_input: analysisInput,
    platform_supported: Boolean(platformPack),
    facts_digest: digest,
    valid_at: validAt,
    known_at: knownAt,
  };
  const receipt = {
    schema_version: 'soulforge.database_engineering.evidence_receipt.v0',
    project_id: binding.project_id,
    binding_revision_hash: binding.binding_revision_hash,
    facts_digest: digest,
    platform_supported: Boolean(platformPack),
    effects: { file_writes: 0, network_calls: 0, db_writes: 0, model_calls: 0 },
  };
  return deepFreeze({ typed_project_facts: typedFacts, observation_receipt: receipt });
}
