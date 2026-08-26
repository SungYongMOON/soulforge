import { timingSafeEqual } from 'node:crypto';
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
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
const OPAQUE_REFERENCE_MAX_LENGTH = 256;

// JSON Schema maxLength counts Unicode code points. Scan only until the first
// disallowed point instead of materializing an unbounded code-point array.
function exceedsUnicodeCodePointLimit(value, limit) {
  let count = 0;
  for (const _codePoint of value) {
    count += 1;
    if (count > limit) return true;
  }
  return false;
}

function assertSafeReference(value, label) {
  if (typeof value !== 'string' || !value || exceedsUnicodeCodePointLimit(value, OPAQUE_REFERENCE_MAX_LENGTH) || FORBIDDEN_DATA_PATTERNS.some((pattern) => pattern.test(value))) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label} must be an opaque public-safe reference`);
  }
}

function assertExactKeys(value, keys, label, code = DBE_ERROR_CODES.EVIDENCE_INVALID) {
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    refuse(code, `${label} has an invalid closed key set`);
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

function normalizeSortedUniqueRefs(rawRefs, label, projectId) {
  if (!Array.isArray(rawRefs) || rawRefs.length === 0) refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label} must be a non-empty reference array`);
  const prefix = `ref:${projectId}:`;
  const refs = rawRefs.map((ref, index) => {
    assertSafeReference(ref, `${label}[${index}]`);
    if (!ref.startsWith(prefix) || ref.length === prefix.length) {
      refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label}[${index}] is not exactly bound to project_id`);
    }
    return ref;
  }).sort(compareCodePoints);
  if (new Set(refs).size !== refs.length) refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label} must not duplicate a reference`);
  return refs;
}

function assertMember(ref, allowlist, label) {
  if (!allowlist.includes(ref)) refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label} is not explicitly allowed by project binding`);
}

function normalizeRuleBindings(rawBindings, label, projectId, refKind) {
  if (!Array.isArray(rawBindings)) refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label} must be an array`);
  const prefix = `ref:${projectId}:${refKind}:`;
  const rows = rawBindings.map((raw, index) => {
    const row = cloneDatabasePlainData(raw, `${label}[${index}]`);
    assertExactKeys(row, ['rule_id', `${refKind}_ref`, 'source_manifest_ref'], `${label}[${index}]`, DBE_ERROR_CODES.BINDING_INVALID);
    assertSafeReference(row.rule_id, `${label}[${index}].rule_id`);
    const ref = row[`${refKind}_ref`];
    assertSafeReference(ref, `${label}[${index}].${refKind}_ref`);
    if (!ref.startsWith(prefix) || ref.length === prefix.length) {
      refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label}[${index}] ref is not exactly bound to project_id and kind`);
    }
    if (row.source_manifest_ref !== `ref:${projectId}:source-manifest`) {
      refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label}[${index}] must explicitly bind to the project source manifest`);
    }
    return { rule_id: row.rule_id, [`${refKind}_ref`]: ref, source_manifest_ref: row.source_manifest_ref };
  }).sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  if (new Set(rows.map((row) => row.rule_id)).size !== rows.length) refuse(DBE_ERROR_CODES.BINDING_INVALID, `${label} must not duplicate a rule_id`);
  return rows;
}

function bindingMap(rows, refKey) {
  return new Map(rows.map((row) => [row.rule_id, row[refKey]]));
}

export function validateDatabaseProjectBinding(raw) {
  const binding = cloneDatabasePlainData(raw, 'project binding');
  assertExactKeys(binding, [
    'schema_version', 'project_id', 'domain_engine_id', 'binding_revision_hash', 'platform',
    'source_manifest_ref', 'source_refs', 'authority_bindings', 'evidence_bindings', 'evidence_ref_allowlist',
  ], 'project binding', DBE_ERROR_CODES.BINDING_INVALID);
  if (binding.schema_version !== DATABASE_PROJECT_BINDING_SCHEMA || binding.domain_engine_id !== DATABASE_ENGINE_ID) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'binding schema or domain engine is invalid');
  }
  if (typeof binding.project_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/u.test(binding.project_id)) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'project_id must be a bounded opaque token');
  }
  if (typeof binding.binding_revision_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(binding.binding_revision_hash)) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'binding_revision_hash must be SHA-256 hex');
  }
  assertExactKeys(binding.platform, ['family', 'version'], 'project binding platform', DBE_ERROR_CODES.BINDING_INVALID);
  assertString(binding.platform.family, 'project binding platform.family');
  assertString(binding.platform.version, 'project binding platform.version');
  const sourceRefs = normalizeSortedUniqueRefs(binding.source_refs, 'binding.source_refs', binding.project_id);
  assertSafeReference(binding.source_manifest_ref, 'binding.source_manifest_ref');
  if (binding.source_manifest_ref !== `ref:${binding.project_id}:source-manifest` || !sourceRefs.includes(binding.source_manifest_ref)) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'source_manifest_ref must be the exact project-bound source manifest member');
  }
  const authorityBindings = normalizeRuleBindings(binding.authority_bindings, 'binding.authority_bindings', binding.project_id, 'authority');
  const evidenceBindings = normalizeRuleBindings(binding.evidence_bindings, 'binding.evidence_bindings', binding.project_id, 'evidence');
  const evidenceRefs = normalizeSortedUniqueRefs(binding.evidence_ref_allowlist, 'binding.evidence_ref_allowlist', binding.project_id);
  for (const row of evidenceBindings) assertMember(row.evidence_ref, evidenceRefs, 'binding.evidence_bindings evidence_ref');
  return {
    schema_version: binding.schema_version,
    project_id: binding.project_id,
    domain_engine_id: binding.domain_engine_id,
    binding_revision_hash: binding.binding_revision_hash,
    platform: binding.platform,
    source_manifest_ref: binding.source_manifest_ref,
    source_refs: sourceRefs,
    authority_bindings: authorityBindings,
    evidence_bindings: evidenceBindings,
    evidence_ref_allowlist: evidenceRefs,
  };
}

export function validateDatabaseAnalysisInput(raw, binding) {
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
    assertMember(metric.evidence_ref, binding.evidence_ref_allowlist, 'analysis_input.workload.metrics[].evidence_ref');
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
    assertMember(check.evidence_ref, binding.evidence_ref_allowlist, 'analysis_input.data_quality.checks[].evidence_ref');
  }
  return input;
}

function validateRequirement(raw, binding) {
  const row = cloneDatabasePlainData(raw, 'requirement');
  assertExactKeys(row, ['project_id', 'rule_id', 'requirement_id', 'authority_ref'], 'requirement');
  if (row.project_id !== binding.project_id) refuse(DBE_ERROR_CODES.BINDING_INVALID, 'requirement.project_id must exactly equal binding project_id');
  assertSafeReference(row.rule_id, 'requirement.rule_id');
  assertSafeReference(row.requirement_id, 'requirement.requirement_id');
  assertSafeReference(row.authority_ref, 'requirement.authority_ref');
  if (bindingMap(binding.authority_bindings, 'authority_ref').get(row.rule_id) !== row.authority_ref) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'requirement.authority_ref must exactly match its per-rule project binding');
  }
  return row;
}

function validateObservation(raw, binding) {
  const row = cloneDatabasePlainData(raw, 'observation');
  assertExactKeys(row, ['project_id', 'rule_id', 'evidence_key', 'status', 'evidence_ref', 'machine_observable'], 'observation');
  if (row.project_id !== binding.project_id) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'observation.project_id must exactly equal binding project_id');
  assertSafeReference(row.rule_id, 'observation.rule_id');
  assertSafeReference(row.evidence_key, 'observation.evidence_key');
  assertSafeReference(row.evidence_ref, 'observation.evidence_ref');
  if (bindingMap(binding.evidence_bindings, 'evidence_ref').get(row.rule_id) !== row.evidence_ref) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'observation.evidence_ref must exactly match its per-rule project binding');
  }
  if (!DATABASE_EVIDENCE_STATUS.includes(row.status) || typeof row.machine_observable !== 'boolean') {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'observation status or machine flag is invalid');
  }
  return row;
}

function factsMaterial(binding, requirements, observations, analysisInput, validAt, knownAt) {
  return { binding, requirements, observations, analysis_input: analysisInput, valid_at: validAt, known_at: knownAt };
}

export function calculateDatabaseTypedFactsDigest(binding, requirements, observations, analysisInput, validAt, knownAt) {
  return sha256Hex(`soulforge.database_engineering.typed_facts.v0\n${canonicalise(factsMaterial(binding, requirements, observations, analysisInput, validAt, knownAt), {
    'binding.source_refs': 'insertion_ordered',
    'binding.authority_bindings': 'sorted_by:rule_id',
    'binding.evidence_bindings': 'sorted_by:rule_id',
    'binding.evidence_ref_allowlist': 'insertion_ordered',
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
}

function constantTimeDigestEquals(actual, expected) {
  if (typeof actual !== 'string' || !/^[a-f0-9]{64}$/u.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, 'utf8'), Buffer.from(expected, 'utf8'));
}

function normalizeTypedFacts(raw) {
  const facts = cloneDatabasePlainData(raw, 'typed database facts');
  assertExactKeys(facts, ['schema_version', 'project_binding', 'requirements', 'evidence', 'analysis_input', 'platform_supported', 'facts_digest', 'valid_at', 'known_at'], 'typed database facts');
  if (facts.schema_version !== DATABASE_TYPED_FACTS_SCHEMA) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'typed facts schema is invalid');
  const binding = validateDatabaseProjectBinding(facts.project_binding);
  if (!Array.isArray(facts.requirements) || !Array.isArray(facts.evidence)) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'typed facts requirements/evidence must be arrays');
  const requirements = facts.requirements.map((row) => validateRequirement(row, binding)).sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  const observations = facts.evidence.map((row) => validateObservation(row, binding)).sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  if (new Set(requirements.map((row) => row.rule_id)).size !== requirements.length || new Set(observations.map((row) => row.rule_id)).size !== observations.length) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'typed facts must not duplicate a rule_id');
  }
  if (requirements.map((row) => row.rule_id).join('\u0000') !== binding.authority_bindings.map((row) => row.rule_id).join('\u0000')
      || observations.map((row) => row.rule_id).join('\u0000') !== binding.evidence_bindings.map((row) => row.rule_id).join('\u0000')) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'per-rule authority/evidence bindings must exactly cover submitted facts');
  }
  const analysisInput = validateDatabaseAnalysisInput(facts.analysis_input, binding);
  const validAt = validateCanonicalInstant(facts.valid_at, 'typed facts valid_at');
  const knownAt = validateCanonicalInstant(facts.known_at, 'typed facts known_at');
  const platformSupported = Boolean(resolveDatabasePlatformPack(binding.platform));
  if (facts.platform_supported !== platformSupported) refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'platform_supported does not match exact binding platform');
  const expectedDigest = calculateDatabaseTypedFactsDigest(binding, requirements, observations, analysisInput, validAt, knownAt);
  if (!constantTimeDigestEquals(facts.facts_digest, expectedDigest)) refuse(DBE_ERROR_CODES.SOURCE_TAMPERED, 'typed facts digest does not match validated facts material');
  return { binding, requirements, observations, analysisInput, validAt, knownAt, platformSupported, digest: expectedDigest };
}

// Evaluator ingress shares this exact strict seam with the adapter. It clones the complete
// candidate before property access, revalidates every nested contract, and rebinds the digest.
export function validateDatabaseTypedFacts(raw) {
  const normalized = normalizeTypedFacts(raw);
  return deepFreeze({
    schema_version: DATABASE_TYPED_FACTS_SCHEMA,
    project_binding: normalized.binding,
    requirements: normalized.requirements,
    evidence: normalized.observations,
    analysis_input: normalized.analysisInput,
    platform_supported: normalized.platformSupported,
    facts_digest: normalized.digest,
    valid_at: normalized.validAt,
    known_at: normalized.knownAt,
  });
}

export function adaptDatabaseProjectEvidence(projectBinding, evidence, cutoffs) {
  // Admit complete argument envelopes before reading individual fields; getter/proxy traps are
  // rejected by the shared plain-data clone without executing property accessors.
  const admittedBinding = cloneDatabasePlainData(projectBinding, 'project binding argument');
  const admittedEvidence = cloneDatabasePlainData(evidence, 'database evidence argument');
  const admittedCutoffs = cloneDatabasePlainData(cutoffs, 'cutoffs argument');
  const binding = validateDatabaseProjectBinding(admittedBinding);
  assertExactKeys(admittedEvidence, ['requirements', 'observations', 'analysis_input'], 'database evidence');
  if (!Array.isArray(admittedEvidence.requirements) || !Array.isArray(admittedEvidence.observations) || !admittedEvidence.analysis_input || typeof admittedEvidence.analysis_input !== 'object') {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'requirements, observations, and analysis_input are required');
  }
  assertExactKeys(admittedCutoffs, ['valid_at', 'known_at'], 'cutoffs');
  const requirements = admittedEvidence.requirements.map((row) => validateRequirement(row, binding)).sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  const observations = admittedEvidence.observations.map((row) => validateObservation(row, binding)).sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  if (new Set(requirements.map((row) => row.rule_id)).size !== requirements.length || new Set(observations.map((row) => row.rule_id)).size !== observations.length) {
    refuse(DBE_ERROR_CODES.EVIDENCE_INVALID, 'requirement and observation rows must not duplicate a rule_id');
  }
  if (requirements.map((row) => row.rule_id).join('\u0000') !== binding.authority_bindings.map((row) => row.rule_id).join('\u0000')
      || observations.map((row) => row.rule_id).join('\u0000') !== binding.evidence_bindings.map((row) => row.rule_id).join('\u0000')) {
    refuse(DBE_ERROR_CODES.BINDING_INVALID, 'per-rule authority/evidence bindings must exactly cover submitted facts');
  }
  const analysisInput = validateDatabaseAnalysisInput(admittedEvidence.analysis_input, binding);
  const validAt = validateCanonicalInstant(admittedCutoffs.valid_at, 'cutoffs.valid_at');
  const knownAt = validateCanonicalInstant(admittedCutoffs.known_at, 'cutoffs.known_at');
  const platformSupported = Boolean(resolveDatabasePlatformPack(binding.platform));
  const digest = calculateDatabaseTypedFactsDigest(binding, requirements, observations, analysisInput, validAt, knownAt);
  const typedFacts = {
    schema_version: DATABASE_TYPED_FACTS_SCHEMA,
    project_binding: binding,
    requirements,
    evidence: observations,
    analysis_input: analysisInput,
    platform_supported: platformSupported,
    facts_digest: digest,
    valid_at: validAt,
    known_at: knownAt,
  };
  const receipt = {
    schema_version: 'soulforge.database_engineering.evidence_receipt.v0',
    project_id: binding.project_id,
    binding_revision_hash: binding.binding_revision_hash,
    source_manifest_ref: binding.source_manifest_ref,
    facts_digest: digest,
    platform_supported: platformSupported,
    effects: { file_writes: 0, network_calls: 0, db_writes: 0, model_calls: 0 },
  };
  return deepFreeze({ typed_project_facts: typedFacts, observation_receipt: receipt });
}
