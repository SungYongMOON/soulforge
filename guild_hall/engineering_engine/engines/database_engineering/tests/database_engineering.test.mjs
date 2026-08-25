import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';

import { arrayOrderRules, assembleEffectiveRuleSet, evaluate, registerDomainEngineAdapter, resolveProfileBindings, withoutNulls } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { DATABASE_BASE_RULESET_REF, DATABASE_ENGINEERING_RULES, DATABASE_SOURCE_INVENTORY_REF } from '../rules/database_engineering_rules.mjs';
import { POSTGRESQL_18_6_EXECUTABLE_SOURCE_IDS, validatePostgresql18_6ExecutableSourcePins } from '../rules/database_engineering_source_pins.mjs';
import { DATABASE_GAP_STATE } from '../rules/database_engineering_vocabulary.mjs';
import { databaseEngineeringAdapter, evaluateDatabaseEngineering, validateDatabaseHardAnalyzerCoverage } from '../evaluator/database_engineering_evaluator_adapter.mjs';
import { adaptDatabaseProjectEvidence, validateDatabaseTypedFacts } from '../evaluator/database_project_evidence_adapter.mjs';
import { calculateDatabaseDerivedRulesetDigest, calculateDatabaseProfileOperationItemDigest } from '../compiler/database_engineering_compiler_adapter.mjs';
import {
  buildPostgresqlPublicSyntheticInput,
  buildSqlitePublicSyntheticInput,
  buildUnsupportedDatabasePublicSyntheticInput,
} from '../fixtures/database_engineering_public_synthetic.mjs';
import { createDatabaseEngineeringModuleManifest } from '../topology/database_engineering_module_manifest.mjs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const inventoryPath = fileURLToPath(new URL('../contracts/database_engineering_source_inventory_v0.json', import.meta.url));

function resultFor(result, ruleId) {
  const row = result.results.find((entry) => entry.rule_id === ruleId);
  assert.ok(row, `missing ${ruleId}`);
  return row;
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), 'output object should be frozen');
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function parseFlatMappingYaml(source) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  for (const line of source.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^(\s*)([A-Za-z0-9_]+):(?:\s*(.*))?$/u.exec(line);
    assert.ok(match, `unsupported descriptor YAML line: ${line}`);
    const indent = match[1].length;
    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).value;
    const value = match[3] ?? '';
    if (value === '') {
      parent[match[2]] = {};
      stack.push({ indent, value: parent[match[2]] });
    } else {
      parent[match[2]] = value;
    }
  }
  return root;
}

function run(input, profiles = []) {
  const facts = adaptDatabaseProjectEvidence(input.binding, input.evidence, input.cutoffs).typed_project_facts;
  const bindings = profiles.length === 0 ? [] : resolveProfileBindings(...profiles);
  const effective = assembleEffectiveRuleSet(databaseEngineeringAdapter, bindings, { purpose: 'public_synthetic' });
  return { facts, effective, result: evaluate(databaseEngineeringAdapter, effective, facts, {}, input.cutoffs) };
}

function recloseDerivedWrapper(wrapper) {
  const ruleset = wrapper.effective_rule_set;
  const derivedDigest = calculateDatabaseDerivedRulesetDigest(ruleset.rules, ruleset.profile_rule_provenance);
  ruleset.ruleset_ref = {
    entity_id: 'database-engineering-ruleset-derived-v0',
    revision_id: `derived:${derivedDigest.slice(0, 16)}`,
    content_id: `sha256:${derivedDigest}`,
    content_hash_alg: 'sha256',
  };
  const clean = withoutNulls(ruleset);
  const coreDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(clean, arrayOrderRules(clean))}`);
  wrapper.assembly_digest = coreDigest;
  wrapper.compilation_trace.effective_ruleset_digest = coreDigest;
  return wrapper;
}

test('source inventory is public-safe, exact-pinned metadata with a closed official source set', () => {
  const raw = readFileSync(inventoryPath);
  const inventory = JSON.parse(raw);
  assert.equal(createHash('sha256').update(raw).digest('hex'), '52af0d396b227a8f935303bf14cada7c4453cd2146990e2dd5235fbbdcd92435');
  assert.equal(DATABASE_SOURCE_INVENTORY_REF.content_id, `sha256:${createHash('sha256').update(raw).digest('hex')}`);
  assert.equal(inventory.contains_source_bodies, false);
  assert.equal(inventory.contains_actual_project_data, false);
  assert.equal(inventory.contains_private_data, false);
  assert.equal(inventory.accessed_at, '2026-08-26');
  assert.deepEqual(inventory.source_access_defaults, { access_class: 'public_direct', accessed_at: '2026-08-26', body_storage: 'none' });
  assert.ok(inventory.sources.length >= 12);
  const ids = inventory.sources.map((source) => source.source_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'SQLITE-DOCS-INDEX', 'SQLITE-PUBLIC-DOMAIN-NOTICE', 'SQLITE-RELEASE-3.53.4', 'SQLITE-FK-2026-03-20',
    'SQLITE-PRAGMA-2026-06-04', 'SQLITE-TXN-2026-02-18', 'SQLITE-ISOLATION-2022-04-18', 'SQLITE-BACKUP-2025-11-13',
    'SQLITE-EQP-2025-05-31', 'SQLITE-QUERY-PLANNER-2026-03-22', 'POSTGRESQL-18.6-RELEASE', 'POSTGRESQL-VERSIONING-POLICY',
    'POSTGRESQL-LICENSE', 'POSTGRESQL-18-CONSTRAINTS', 'POSTGRESQL-18-INDEXES', 'POSTGRESQL-18-TRANSACTION-ISOLATION',
    'POSTGRESQL-18-RLS', 'POSTGRESQL-18-PRIVILEGES', 'POSTGRESQL-18-ALTER', 'POSTGRESQL-18-BACKUP',
    'POSTGRESQL-18-BACKUP-PITR', 'NIST-SP-800-34R1', 'EPA-QA-G9-PORTAL-2026-05-01',
  ]);
  for (const source of inventory.sources) {
    assert.match(source.url, /^https:\/\//u);
    assert.ok(['official_primary', 'government_primary'].includes(source.source_class));
    assert.equal(typeof source.revision, 'string');
    assert.equal(typeof source.licence, 'string');
    assert.equal(typeof source.applicability, 'string');
    assert.equal(/(?:C:\\|\\\\|BEGIN [A-Z ]+ KEY|password=|api[_-]?key=)/iu.test(JSON.stringify(source)), false);
  }
  const sourceIds = new Set(ids);
  for (const rule of DATABASE_ENGINEERING_RULES) {
    for (const sourceRef of rule.source_refs) {
      assert.equal(sourceRef === 'PROJECT-BOUND' || sourceIds.has(sourceRef), true, `${rule.rule_id} source ref`);
    }
  }
});

test('required DBE package surfaces are local, complete, and declare a small public Interface', () => {
  const required = [
    'engine.yaml', 'README.md',
    'contracts/database_engineering_source_inventory_v0.json',
    'contracts/database_engineering_source_packet_v0.md',
    'contracts/database_engineering_derivation_v0.md',
    'contracts/database_engineering_authority_boundary_v0.md',
    'contracts/database_engineering_evidence_contract_v0.md',
    'contracts/database_engineering_error_model_v0.md',
    'contracts/database_engineering_integration_request_v0.md',
    'schemas/database_engineering_descriptor_schema_v0.json',
    'schemas/database_engineering_ruleset_schema_v0.json',
    'schemas/database_project_binding_schema_v0.json',
    'schemas/database_typed_facts_schema_v0.json',
    'schemas/database_engineering_evaluation_schema_v0.json',
    'schemas/database_engineering_receipt_schema_v0.json',
    'rules/database_engineering_source_pins.mjs',
    'compiler/database_engineering_compiler_adapter.mjs',
    'evaluator/database_engineering_evaluator_adapter.mjs',
    'evaluator/database_project_evidence_adapter.mjs',
    'fixtures/database_engineering_public_synthetic.mjs',
    'tools/database_engineering_runner.mjs',
    'guidance/database_engineering_guidance.mjs',
    'guidance/source_cited_guidance.md',
    'topology/database_engineering_module_manifest.mjs',
    'topology/database_engineering_topology.json',
  ];
  for (const relative of required) assert.equal(existsSync(resolve(packageRoot, relative)), true, relative);
  const topology = JSON.parse(readFileSync(resolve(packageRoot, 'topology/database_engineering_topology.json'), 'utf8'));
  assert.equal(topology.public_interface.length, 3);
  assert.equal(topology.internal_modules.length, 8);
  assert.equal(topology.effects.db_writes, 0);
});

test('every executable PostgreSQL 18.6 rule has a public-safe exact source-byte pin and detects drift metadata', () => {
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const pins = validatePostgresql18_6ExecutableSourcePins(inventory);
  assert.deepEqual(pins.map((pin) => pin.source_id).sort(), [...POSTGRESQL_18_6_EXECUTABLE_SOURCE_IDS].sort());
  const hardPostgresqlRules = DATABASE_ENGINEERING_RULES.filter((rule) => rule.kind === 'hard_technical' && rule.platforms.includes('postgresql'));
  assert.deepEqual(pins.map((pin) => pin.rule_id).sort(), hardPostgresqlRules.map((rule) => rule.rule_id).sort());
  for (const pin of pins) {
    assert.match(pin.content_sha256, /^[a-f0-9]{64}$/u);
    assert.ok(pin.byte_length > 0);
  }
  const absentHash = structuredClone(inventory);
  delete absentHash.sources.find((source) => source.source_id === 'POSTGRESQL-18-RLS').content_sha256;
  assert.throws(() => validatePostgresql18_6ExecutableSourcePins(absentHash), (error) => error.code === 'DBE_SOURCE_TAMPERED');
  const floating = structuredClone(inventory);
  floating.sources.find((source) => source.source_id === 'POSTGRESQL-18-RLS').final_url = 'https://www.postgresql.org/docs/current/ddl-rowsecurity.html';
  assert.throws(() => validatePostgresql18_6ExecutableSourcePins(floating), (error) => error.code === 'DBE_SOURCE_TAMPERED');
  const duplicateSourceId = structuredClone(inventory);
  duplicateSourceId.sources.push(structuredClone(duplicateSourceId.sources.find((source) => source.source_id === 'POSTGRESQL-18-RLS')));
  assert.throws(() => validatePostgresql18_6ExecutableSourcePins(duplicateSourceId), (error) => error.code === 'DBE_SOURCE_TAMPERED');
  const releaseLocatorDrift = structuredClone(inventory);
  releaseLocatorDrift.sources.find((source) => source.source_id === 'POSTGRESQL-18.6-RELEASE').final_url = 'https://www.postgresql.org/docs/release/18.7/';
  assert.throws(() => validatePostgresql18_6ExecutableSourcePins(releaseLocatorDrift), (error) => error.code === 'DBE_SOURCE_TAMPERED');
  const swapped = structuredClone(inventory);
  const rls = swapped.sources.find((source) => source.source_id === 'POSTGRESQL-18-RLS');
  const constraints = swapped.sources.find((source) => source.source_id === 'POSTGRESQL-18-CONSTRAINTS');
  [rls.rule_ids, constraints.rule_ids] = [constraints.rule_ids, rls.rule_ids];
  assert.throws(() => validatePostgresql18_6ExecutableSourcePins(swapped), (error) => error.code === 'DBE_SOURCE_TAMPERED');
  const missingSource = structuredClone(inventory);
  missingSource.sources = missingSource.sources.filter((source) => source.source_id !== 'POSTGRESQL-18-RLS');
  assert.throws(() => validatePostgresql18_6ExecutableSourcePins(missingSource), (error) => error.code === 'DBE_SOURCE_TAMPERED');
  const duplicateMapping = structuredClone(inventory);
  duplicateMapping.sources.find((source) => source.source_id === 'POSTGRESQL-18-RLS').rule_ids = ['DBE-POSTGRESQL-RLS-001', 'DBE-POSTGRESQL-RLS-001'];
  assert.throws(() => validatePostgresql18_6ExecutableSourcePins(duplicateMapping), (error) => error.code === 'DBE_SOURCE_TAMPERED');
});

test('closed DBE descriptor, ruleset, project-binding, and typed-facts schemas compile and admit only package shape', () => {
  const ajv = new Ajv2020({ strict: false });
  const schema = (name) => JSON.parse(readFileSync(resolve(packageRoot, `schemas/${name}`), 'utf8'));
  const descriptorSchema = ajv.compile(schema('database_engineering_descriptor_schema_v0.json'));
  const rulesetSchema = ajv.compile(schema('database_engineering_ruleset_schema_v0.json'));
  const bindingSchema = ajv.compile(schema('database_project_binding_schema_v0.json'));
  const factsSchema = ajv.compile(schema('database_typed_facts_schema_v0.json'));
  const receiptSchemaBytes = schema('database_engineering_receipt_schema_v0.json');
  ajv.addSchema(receiptSchemaBytes);
  const evaluationSchema = ajv.compile(schema('database_engineering_evaluation_schema_v0.json'));
  const receiptSchema = ajv.getSchema('database_engineering_receipt_schema_v0.json');
  const descriptor = parseFlatMappingYaml(readFileSync(resolve(packageRoot, 'engine.yaml'), 'utf8'));
  assert.equal(descriptorSchema(descriptor), true, JSON.stringify(descriptorSchema.errors));
  const input = buildSqlitePublicSyntheticInput();
  const postgresInput = buildPostgresqlPublicSyntheticInput();
  const unsupportedInput = buildUnsupportedDatabasePublicSyntheticInput();
  const adapted = adaptDatabaseProjectEvidence(input.binding, input.evidence, input.cutoffs);
  const postgresAdapted = adaptDatabaseProjectEvidence(postgresInput.binding, postgresInput.evidence, postgresInput.cutoffs);
  const effective = assembleEffectiveRuleSet(databaseEngineeringAdapter, [], {});
  assert.equal(bindingSchema(input.binding), true, JSON.stringify(bindingSchema.errors));
  assert.equal(bindingSchema(postgresInput.binding), true, JSON.stringify(bindingSchema.errors));
  assert.equal(bindingSchema(unsupportedInput.binding), true, JSON.stringify(bindingSchema.errors));
  assert.equal(factsSchema(adapted.typed_project_facts), true, JSON.stringify(factsSchema.errors));
  assert.equal(factsSchema(postgresAdapted.typed_project_facts), true, JSON.stringify(factsSchema.errors));
  assert.equal(rulesetSchema(effective.effective_rule_set), true, JSON.stringify(rulesetSchema.errors));
  const evaluated = evaluate(databaseEngineeringAdapter, effective, adapted.typed_project_facts, {}, input.cutoffs);
  assert.equal(evaluationSchema(evaluated), true, JSON.stringify(evaluationSchema.errors));
  assert.equal(receiptSchema(evaluated.receipt), true, JSON.stringify(receiptSchema.errors));
  const malformed = structuredClone(input.binding);
  malformed.unapproved_field = true;
  assert.equal(bindingSchema(malformed), false);

  const malformedDescriptor = structuredClone(descriptor);
  malformedDescriptor.status = 'released';
  assert.equal(descriptorSchema(malformedDescriptor), false);

  const malformedBindingEnum = structuredClone(input.binding);
  malformedBindingEnum.platform.version = 18;
  assert.equal(bindingSchema(malformedBindingEnum), false);

  const deeplyMalformed = structuredClone(adapted.typed_project_facts);
  deeplyMalformed.analysis_input.platform_controls.sqlite.unapproved_field = true;
  assert.equal(factsSchema(deeplyMalformed), false);
  const malformedResult = structuredClone(evaluated);
  malformedResult.receipt.effects.db_writes = 1;
  assert.equal(evaluationSchema(malformedResult), false);
  const malformedState = structuredClone(evaluated);
  malformedState.results[0].state = 'readiness';
  assert.equal(evaluationSchema(malformedState), false);
});

test('SQLite and PostgreSQL public-synthetic bindings compile and evaluate through the Core seam', () => {
  const sqlite = run(buildSqlitePublicSyntheticInput());
  assert.equal(sqlite.effective.domain_engine_id, 'database_engineering');
  assert.deepEqual(sqlite.effective.effective_rule_set.ruleset_ref, DATABASE_BASE_RULESET_REF);
  assert.equal(resultFor(sqlite.result, 'DBE-SQLITE-FK-CONNECTION-001').state, DATABASE_GAP_STATE.SATISFIED);
  assert.equal(resultFor(sqlite.result, 'DBE-POSTGRESQL-RLS-001').state, DATABASE_GAP_STATE.UNKNOWN);
  assert.equal(sqlite.result.receipt.platform_supported, true);

  const postgresql = run(buildPostgresqlPublicSyntheticInput());
  assert.equal(resultFor(postgresql.result, 'DBE-POSTGRESQL-RLS-001').state, DATABASE_GAP_STATE.SATISFIED);
  assert.equal(resultFor(postgresql.result, 'DBE-SQLITE-FK-CONNECTION-001').state, DATABASE_GAP_STATE.UNKNOWN);
  assert.equal(postgresql.result.receipt.platform.version, '18.6');
});

test('unsupported database family fails closed to unknown rather than borrowing relational rules', () => {
  const unsupported = run(buildUnsupportedDatabasePublicSyntheticInput());
  assert.equal(unsupported.result.receipt.platform_supported, false);
  for (const row of unsupported.result.results) {
    assert.equal(row.state, DATABASE_GAP_STATE.UNKNOWN);
    assert.equal(row.reason_code, 'platform_unsupported');
  }
  const wrongVersion = buildSqlitePublicSyntheticInput();
  wrongVersion.binding.platform.version = '3.53.3';
  const versionResult = run(wrongVersion).result;
  assert.equal(versionResult.receipt.platform_supported, false);
  assert.equal(resultFor(versionResult, 'DBE-SQLITE-FK-CONNECTION-001').state, DATABASE_GAP_STATE.UNKNOWN);
});

test('adapter registration is idempotent for the exact implementation object', () => {
  assert.doesNotThrow(() => registerDomainEngineAdapter('database_engineering', databaseEngineeringAdapter));
});

test('machine-observable contradictory evidence yields missing only under the complete applicability triple', () => {
  const contradicted = buildSqlitePublicSyntheticInput();
  const fk = contradicted.evidence.observations.find((entry) => entry.rule_id === 'DBE-SQLITE-FK-CONNECTION-001');
  fk.status = 'contradicted';
  contradicted.evidence.analysis_input.platform_controls.sqlite.foreign_keys_enabled = false;
  const contradiction = run(contradicted).result;
  const missing = resultFor(contradiction, 'DBE-SQLITE-FK-CONNECTION-001');
  assert.equal(missing.state, DATABASE_GAP_STATE.MISSING);
  assert.equal(missing.hard_technical_failure, true);

  const missingRequirement = buildSqlitePublicSyntheticInput();
  missingRequirement.evidence.requirements = missingRequirement.evidence.requirements.filter((entry) => entry.rule_id !== 'DBE-SQLITE-FK-CONNECTION-001');
  missingRequirement.binding.authority_bindings = missingRequirement.binding.authority_bindings.filter((entry) => entry.rule_id !== 'DBE-SQLITE-FK-CONNECTION-001');
  const unknown = run(missingRequirement).result;
  assert.equal(resultFor(unknown, 'DBE-SQLITE-FK-CONNECTION-001').state, DATABASE_GAP_STATE.UNKNOWN);

  const incoherent = buildSqlitePublicSyntheticInput();
  incoherent.evidence.observations.find((entry) => entry.rule_id === 'DBE-SQLITE-FK-CONNECTION-001').status = 'contradicted';
  const incoherentResult = run(incoherent).result;
  const conflict = resultFor(incoherentResult, 'DBE-SQLITE-FK-CONNECTION-001');
  assert.equal(conflict.state, DATABASE_GAP_STATE.CONFLICT);
  assert.equal(conflict.hard_technical_failure, false);
  assert.equal(conflict.reason_code, 'caller_and_analyzer_evidence_conflict');

  const wrongKey = buildSqlitePublicSyntheticInput();
  const wrongKeyObservation = wrongKey.evidence.observations.find((entry) => entry.rule_id === 'DBE-SQLITE-FK-CONNECTION-001');
  wrongKeyObservation.status = 'contradicted';
  wrongKeyObservation.evidence_key = 'postgresql_rls';
  wrongKey.evidence.analysis_input.platform_controls.sqlite.foreign_keys_enabled = false;
  const wrongKeyResult = run(wrongKey).result;
  assert.equal(resultFor(wrongKeyResult, 'DBE-SQLITE-FK-CONNECTION-001').state, DATABASE_GAP_STATE.UNKNOWN);
  assert.equal(resultFor(wrongKeyResult, 'DBE-SQLITE-FK-CONNECTION-001').reason_code, 'evidence_key_mismatch');

  const notMachineObservable = buildSqlitePublicSyntheticInput();
  notMachineObservable.evidence.observations.find((entry) => entry.rule_id === 'DBE-SQLITE-FK-CONNECTION-001').machine_observable = false;
  const notMachineResult = run(notMachineObservable).result;
  assert.equal(resultFor(notMachineResult, 'DBE-SQLITE-FK-CONNECTION-001').state, DATABASE_GAP_STATE.UNKNOWN);
  assert.equal(resultFor(notMachineResult, 'DBE-SQLITE-FK-CONNECTION-001').reason_code, 'hard_rule_machine_observation_not_confirmed');

  const transactionConflict = buildSqlitePublicSyntheticInput();
  transactionConflict.evidence.analysis_input.platform_controls.sqlite.shared_cache_enabled = true;
  transactionConflict.evidence.analysis_input.platform_controls.sqlite.read_uncommitted_enabled = true;
  const transactionConflictResult = run(transactionConflict).result;
  assert.equal(resultFor(transactionConflictResult, 'DBE-SQLITE-ISOLATION-001').state, DATABASE_GAP_STATE.CONFLICT);
  assert.equal(resultFor(transactionConflictResult, 'DBE-SQLITE-ISOLATION-001').reason_code, 'named_analyzer_cross_input_conflict');

  const recoveryConflict = buildPostgresqlPublicSyntheticInput();
  recoveryConflict.evidence.analysis_input.recovery.plan_evidence_present = false;
  recoveryConflict.evidence.analysis_input.recovery.proofs.find((proof) => proof.kind === 'pitr_preconditions').passed = false;
  const recoveryConflictResult = run(recoveryConflict).result;
  assert.equal(resultFor(recoveryConflictResult, 'DBE-COMMON-RECOVERY-001').state, DATABASE_GAP_STATE.CONFLICT);
  assert.equal(resultFor(recoveryConflictResult, 'DBE-POSTGRESQL-PITR-001').state, DATABASE_GAP_STATE.CONFLICT);
  assert.equal(resultFor(recoveryConflictResult, 'DBE-POSTGRESQL-PITR-001').reason_code, 'named_analyzer_cross_input_conflict');

  const pitrProofAbsent = buildPostgresqlPublicSyntheticInput();
  pitrProofAbsent.evidence.analysis_input.recovery.proofs = pitrProofAbsent.evidence.analysis_input.recovery.proofs.filter((proof) => proof.kind !== 'pitr_preconditions');
  const pitrProofAbsentResult = run(pitrProofAbsent).result;
  assert.equal(resultFor(pitrProofAbsentResult, 'DBE-POSTGRESQL-PITR-001').state, DATABASE_GAP_STATE.UNKNOWN);
  assert.equal(resultFor(pitrProofAbsentResult, 'DBE-POSTGRESQL-PITR-001').reason_code, 'contradiction_not_confirmed_by_named_analyzer');
});

test('a Core Profile-added rule is compiled with provenance and evaluated end-to-end', () => {
  const input = buildSqlitePublicSyntheticInput();
  const projectId = input.binding.project_id;
  const profileSource = `ref:${projectId}:profile:retention`;
  const derivedRuleId = 'DBE-PROFILE-RETENTION-001';
  input.evidence.requirements.push({
    project_id: projectId,
    rule_id: derivedRuleId,
    requirement_id: `${projectId}:REQ:${derivedRuleId}`,
    authority_ref: `ref:${projectId}:authority:${derivedRuleId}`,
  });
  input.evidence.observations.push({
    rule_id: derivedRuleId,
    evidence_key: 'retention_proof',
    status: 'supported',
    evidence_ref: `ref:${projectId}:evidence:${derivedRuleId}`,
    machine_observable: true,
    project_id: projectId,
  });
  input.binding.authority_bindings.push({ rule_id: derivedRuleId, authority_ref: `ref:${projectId}:authority:${derivedRuleId}`, source_manifest_ref: `ref:${projectId}:source-manifest` });
  input.binding.evidence_bindings.push({ rule_id: derivedRuleId, evidence_ref: `ref:${projectId}:evidence:${derivedRuleId}`, source_manifest_ref: `ref:${projectId}:source-manifest` });
  input.binding.authority_bindings.sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  input.binding.evidence_bindings.sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  input.binding.evidence_ref_allowlist.push(`ref:${projectId}:evidence:${derivedRuleId}`);
  input.binding.evidence_ref_allowlist.sort();
  const organizationProfile = {
    profile_id: 'org_public_synthetic_database',
    domain_engine_id: 'database_engineering',
    revision_or_hash: 'database-profile-r1',
    extends_or_base_pin: 'database_engineering:v0',
    source_refs: [profileSource],
    operations: [{
      op: 'add',
      rule: {
        rule_id: derivedRuleId,
        axis: 'data_quality_governance_retention_retirement',
        kind: 'advisory',
        platforms: ['common'],
        source_refs: [profileSource],
        source_locator: 'synthetic retention requirement',
        source_authority: 'profile_declared',
        claim_ceiling: 'observed',
        evidence_key: 'retention_proof',
      },
    }],
  };
  const compiled = run(input, [organizationProfile]);
  assert.equal(compiled.effective.rule_count, DATABASE_ENGINEERING_RULES.length + 1);
  assert.ok(compiled.effective.effective_rule_set.profile_rule_provenance[derivedRuleId]);
  const derived = resultFor(compiled.result, derivedRuleId);
  assert.equal(derived.state, DATABASE_GAP_STATE.SATISFIED);
  assert.equal(derived.source_authority, 'profile_declared');
  assert.equal(derived.source_provenance.profile_id, 'org_public_synthetic_database');
  assert.equal(resultFor(compiled.result, 'DBE-SQLITE-FK-CONNECTION-001').source_authority, 'inventory_anchored');

  const hardProfile = structuredClone(organizationProfile);
  hardProfile.operations[0].rule.kind = 'hard_technical';
  assert.throws(() => run(input, [hardProfile]), (error) => error.code === 'DBE_OPERATION_INVALID');

  const overclaimedProfile = structuredClone(organizationProfile);
  overclaimedProfile.operations[0].rule.source_authority = 'inventory_anchored';
  overclaimedProfile.operations[0].rule.claim_ceiling = 'source_supported';
  assert.throws(() => run(input, [overclaimedProfile]), (error) => error.code === 'DBE_OPERATION_INVALID');

  const tamperedHardDerived = structuredClone(compiled.effective.effective_rule_set);
  tamperedHardDerived.rules.find((rule) => rule.rule_id === derivedRuleId).kind = 'hard_technical';
  assert.throws(() => evaluateDatabaseEngineering(tamperedHardDerived, compiled.facts), (error) => error.code === 'DBE_RULESET_INVALID');

  const tamperedDerivedSource = structuredClone(compiled.effective.effective_rule_set);
  tamperedDerivedSource.rules.find((rule) => rule.rule_id === derivedRuleId).source_refs = ['ref:unbound-profile-source'];
  assert.throws(() => evaluateDatabaseEngineering(tamperedDerivedSource, compiled.facts), (error) => error.code === 'DBE_RULESET_INVALID');

  const tamperedDerivedCeiling = structuredClone(compiled.effective.effective_rule_set);
  tamperedDerivedCeiling.rules.find((rule) => rule.rule_id === derivedRuleId).claim_ceiling = 'source_supported';
  assert.throws(() => evaluateDatabaseEngineering(tamperedDerivedCeiling, compiled.facts), (error) => error.code === 'DBE_RULESET_INVALID');
  const ajv = new Ajv2020({ strict: false });
  const rulesetSchema = ajv.compile(JSON.parse(readFileSync(resolve(packageRoot, 'schemas/database_engineering_ruleset_schema_v0.json'), 'utf8')));
  assert.equal(rulesetSchema(compiled.effective.effective_rule_set), true, JSON.stringify(rulesetSchema.errors));
  assert.equal(rulesetSchema(tamperedDerivedCeiling), false);
  ajv.addSchema(JSON.parse(readFileSync(resolve(packageRoot, 'schemas/database_engineering_receipt_schema_v0.json'), 'utf8')));
  const evaluationSchema = ajv.compile(JSON.parse(readFileSync(resolve(packageRoot, 'schemas/database_engineering_evaluation_schema_v0.json'), 'utf8')));
  const receiptSchema = ajv.getSchema('database_engineering_receipt_schema_v0.json');
  assert.equal(evaluationSchema(compiled.result), true, JSON.stringify(evaluationSchema.errors));
  assert.equal(receiptSchema(compiled.result.receipt), true, JSON.stringify(receiptSchema.errors));
  const malformedProvenance = structuredClone(compiled.result);
  malformedProvenance.results.find((row) => row.rule_id === derivedRuleId).source_provenance.operation_item_digest = 'not-a-digest';
  assert.equal(evaluationSchema(malformedProvenance), false);

  assert.throws(() => evaluateDatabaseEngineering(compiled.effective.effective_rule_set, compiled.facts), (error) => error.code === 'DBE_RULESET_INVALID');
  const provenanceSubstitution = structuredClone(compiled.effective);
  const provenance = provenanceSubstitution.effective_rule_set.profile_rule_provenance[derivedRuleId];
  provenance.profile_id = 'forged_profile';
  provenance.operation_item_digest = calculateDatabaseProfileOperationItemDigest(provenance, derivedRuleId);
  const rehashed = calculateDatabaseDerivedRulesetDigest(provenanceSubstitution.effective_rule_set.rules, provenanceSubstitution.effective_rule_set.profile_rule_provenance);
  provenanceSubstitution.effective_rule_set.ruleset_ref = {
    entity_id: 'database-engineering-ruleset-derived-v0', revision_id: `derived:${rehashed.slice(0, 16)}`,
    content_id: `sha256:${rehashed}`, content_hash_alg: 'sha256',
  };
  assert.throws(() => evaluateDatabaseEngineering(provenanceSubstitution, compiled.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED');
  const wrongOperationItem = structuredClone(compiled.effective);
  wrongOperationItem.effective_rule_set.profile_rule_provenance[derivedRuleId].operation_item_digest = '0'.repeat(64);
  assert.throws(() => evaluateDatabaseEngineering(wrongOperationItem, compiled.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED');

  const reclosed = recloseDerivedWrapper(structuredClone(compiled.effective));
  assert.doesNotThrow(() => evaluateDatabaseEngineering(reclosed, compiled.facts));

  const reclosedKind = recloseDerivedWrapper(structuredClone(compiled.effective));
  reclosedKind.effective_rule_set.rules.find((row) => row.rule_id === derivedRuleId).kind = 'hard_technical';
  recloseDerivedWrapper(reclosedKind);
  assert.throws(() => evaluateDatabaseEngineering(reclosedKind, compiled.facts), (error) => error.code === 'DBE_RULESET_INVALID' && /Profile authority/.test(error.message));

  const reclosedAuthority = recloseDerivedWrapper(structuredClone(compiled.effective));
  reclosedAuthority.effective_rule_set.rules.find((row) => row.rule_id === derivedRuleId).source_authority = 'inventory_anchored';
  recloseDerivedWrapper(reclosedAuthority);
  assert.throws(() => evaluateDatabaseEngineering(reclosedAuthority, compiled.facts), (error) => error.code === 'DBE_RULESET_INVALID' && /Profile authority/.test(error.message));

  const reclosedCeiling = recloseDerivedWrapper(structuredClone(compiled.effective));
  reclosedCeiling.effective_rule_set.rules.find((row) => row.rule_id === derivedRuleId).claim_ceiling = 'source_supported';
  recloseDerivedWrapper(reclosedCeiling);
  assert.throws(() => evaluateDatabaseEngineering(reclosedCeiling, compiled.facts), (error) => error.code === 'DBE_RULESET_INVALID' && /Profile authority/.test(error.message));

  const reclosedSource = recloseDerivedWrapper(structuredClone(compiled.effective));
  reclosedSource.effective_rule_set.rules.find((row) => row.rule_id === derivedRuleId).source_refs = ['ref:unbound-profile-source'];
  recloseDerivedWrapper(reclosedSource);
  assert.throws(() => evaluateDatabaseEngineering(reclosedSource, compiled.facts), (error) => error.code === 'DBE_RULESET_INVALID' && /Profile authority/.test(error.message));

  const reclosedWrongItem = recloseDerivedWrapper(structuredClone(compiled.effective));
  reclosedWrongItem.effective_rule_set.profile_rule_provenance[derivedRuleId].operation_item_digest = '0'.repeat(64);
  recloseDerivedWrapper(reclosedWrongItem);
  assert.throws(() => evaluateDatabaseEngineering(reclosedWrongItem, compiled.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED' && /operation item digest/.test(error.message));

  const reclosedTraceMismatch = recloseDerivedWrapper(structuredClone(compiled.effective));
  const traceMismatchProvenance = reclosedTraceMismatch.effective_rule_set.profile_rule_provenance[derivedRuleId];
  traceMismatchProvenance.profile_id = 'forged_profile';
  traceMismatchProvenance.operation_item_digest = calculateDatabaseProfileOperationItemDigest(traceMismatchProvenance, derivedRuleId);
  recloseDerivedWrapper(reclosedTraceMismatch);
  assert.throws(() => evaluateDatabaseEngineering(reclosedTraceMismatch, compiled.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED' && /compilation trace/.test(error.message));

  const duplicateTrace = recloseDerivedWrapper(structuredClone(compiled.effective));
  duplicateTrace.compilation_trace.profiles.push(structuredClone(duplicateTrace.compilation_trace.profiles[0]));
  assert.throws(() => evaluateDatabaseEngineering(duplicateTrace, compiled.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED' && /duplicate profile identity/.test(error.message));
});

test('typed facts reject hostile proxy, accessor, cycle, alias, and cross-project evidence before evaluation', () => {
  const proxyInput = buildSqlitePublicSyntheticInput();
  assert.throws(() => adaptDatabaseProjectEvidence(proxyInput.binding, new Proxy(proxyInput.evidence, {}), proxyInput.cutoffs), (error) => error.code === 'DBE_INPUT_INVALID');

  const accessorInput = buildSqlitePublicSyntheticInput();
  Object.defineProperty(accessorInput.evidence, 'requirements', { enumerable: true, get() { return []; } });
  assert.throws(() => adaptDatabaseProjectEvidence(accessorInput.binding, accessorInput.evidence, accessorInput.cutoffs), (error) => error.code === 'DBE_INPUT_INVALID');

  const cycleInput = buildSqlitePublicSyntheticInput();
  cycleInput.evidence.analysis_input.schema.self = cycleInput.evidence.analysis_input;
  assert.throws(() => adaptDatabaseProjectEvidence(cycleInput.binding, cycleInput.evidence, cycleInput.cutoffs), (error) => error.code === 'DBE_INPUT_INVALID');

  const aliasInput = buildSqlitePublicSyntheticInput();
  const shared = { metrics: [] };
  aliasInput.evidence.analysis_input.workload = shared;
  aliasInput.evidence.analysis_input.data_quality = shared;
  assert.throws(() => adaptDatabaseProjectEvidence(aliasInput.binding, aliasInput.evidence, aliasInput.cutoffs), (error) => error.code === 'DBE_INPUT_INVALID');

  const crossProjectInput = buildSqlitePublicSyntheticInput();
  crossProjectInput.evidence.observations[0].project_id = 'PROJECT_OTHER_SYNTHETIC';
  assert.throws(() => adaptDatabaseProjectEvidence(crossProjectInput.binding, crossProjectInput.evidence, crossProjectInput.cutoffs), (error) => error.code === 'DBE_EVIDENCE_INVALID');

  const deepSchemaInput = buildSqlitePublicSyntheticInput();
  deepSchemaInput.evidence.analysis_input.platform_controls.sqlite.unapproved_field = true;
  assert.throws(() => adaptDatabaseProjectEvidence(deepSchemaInput.binding, deepSchemaInput.evidence, deepSchemaInput.cutoffs), (error) => error.code === 'DBE_EVIDENCE_INVALID');
});

test('evaluator revalidates Typed Facts digest, exact project binding, platform, times, and cutoffs at ingress', () => {
  const subject = run(buildPostgresqlPublicSyntheticInput());
  const reject = (mutate, code) => {
    const facts = structuredClone(subject.facts);
    mutate(facts);
    assert.throws(() => evaluateDatabaseEngineering(subject.effective, facts, {}, { valid_at: subject.facts.valid_at, known_at: subject.facts.known_at }), (error) => error.code === code);
  };
  reject((facts) => { facts.facts_digest = '0'.repeat(64); }, 'DBE_SOURCE_TAMPERED');
  reject((facts) => { facts.known_at = 'not-an-instant'; }, 'INSTANT_INVALID');
  reject((facts) => { facts.project_binding.project_id = 'FORGED_PROJECT'; }, 'DBE_BINDING_INVALID');
  reject((facts) => { facts.platform_supported = false; }, 'DBE_EVIDENCE_INVALID');
  reject((facts) => { facts.analysis_input.platform_controls.postgresql.unapproved = true; }, 'DBE_EVIDENCE_INVALID');
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, subject.facts, {}, {
    valid_at: '2026-08-27T00:00:00.000Z', known_at: subject.facts.known_at,
  }), (error) => error.code === 'DBE_EVIDENCE_INVALID');
  assert.doesNotThrow(() => validateDatabaseTypedFacts(subject.facts));
});

test('evaluator fails closed on base omission, order drift, forged ruleset identity, and add-only Profile operations', () => {
  const subject = run(buildPostgresqlPublicSyntheticInput());
  const omitted = structuredClone(subject.effective.effective_rule_set);
  omitted.rules = omitted.rules.filter((rule) => rule.rule_id !== 'DBE-POSTGRESQL-RLS-001');
  assert.throws(() => evaluateDatabaseEngineering(omitted, subject.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED');

  const reordered = structuredClone(subject.effective.effective_rule_set);
  reordered.rules.reverse();
  assert.throws(() => evaluateDatabaseEngineering(reordered, subject.facts), (error) => error.code === 'DBE_RULESET_INVALID');

  const forgedRef = structuredClone(subject.effective.effective_rule_set);
  forgedRef.ruleset_ref = { ...forgedRef.ruleset_ref, content_id: `sha256:${'f'.repeat(64)}` };
  assert.throws(() => evaluateDatabaseEngineering(forgedRef, subject.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED');

  const disableProfile = {
    profile_id: 'org_disable_attempt', domain_engine_id: 'database_engineering', revision_or_hash: 'disable-r1',
    extends_or_base_pin: 'database_engineering:v0', source_refs: ['ref:PROJECT_DB_SQLITE_SYNTHETIC:profile:disable'],
    operations: [{ op: 'disable', rule_id: 'DBE-SQLITE-FK-CONNECTION-001' }],
  };
  assert.throws(() => assembleEffectiveRuleSet(databaseEngineeringAdapter, resolveProfileBindings(disableProfile), {}), (error) => error.code === 'DBE_OPERATION_INVALID');
});

test('project authority and evidence refs are exact per-rule binding members, not substring hints', () => {
  const foreignAuthority = buildSqlitePublicSyntheticInput();
  foreignAuthority.evidence.requirements[0].authority_ref = `ref:${foreignAuthority.binding.project_id}:authority:unlisted`;
  assert.throws(() => adaptDatabaseProjectEvidence(foreignAuthority.binding, foreignAuthority.evidence, foreignAuthority.cutoffs), (error) => error.code === 'DBE_BINDING_INVALID');

  const prefixCollision = buildSqlitePublicSyntheticInput();
  prefixCollision.evidence.requirements[0].project_id = `${prefixCollision.binding.project_id}_OTHER`;
  prefixCollision.evidence.requirements[0].requirement_id = `foreign-${prefixCollision.binding.project_id}-suffix`;
  assert.throws(() => adaptDatabaseProjectEvidence(prefixCollision.binding, prefixCollision.evidence, prefixCollision.cutoffs), (error) => error.code === 'DBE_BINDING_INVALID');

  const foreignEvidence = buildSqlitePublicSyntheticInput();
  foreignEvidence.evidence.observations[0].evidence_ref = `ref:${foreignEvidence.binding.project_id}:evidence:unlisted`;
  assert.throws(() => adaptDatabaseProjectEvidence(foreignEvidence.binding, foreignEvidence.evidence, foreignEvidence.cutoffs), (error) => error.code === 'DBE_BINDING_INVALID');

  const foreignBindingRef = buildSqlitePublicSyntheticInput();
  foreignBindingRef.binding.evidence_ref_allowlist[0] = 'ref:PROJECT_OTHER:evidence:foreign';
  assert.throws(() => adaptDatabaseProjectEvidence(foreignBindingRef.binding, foreignBindingRef.evidence, foreignBindingRef.cutoffs), (error) => error.code === 'DBE_BINDING_INVALID');

  const positive = run(buildSqlitePublicSyntheticInput()).result;
  const factProvenance = resultFor(positive, 'DBE-SQLITE-FK-CONNECTION-001').fact_provenance;
  assert.equal(factProvenance.requirement.project_id, 'PROJECT_DB_SQLITE_SYNTHETIC');
  assert.equal(factProvenance.observation.evidence_ref, 'ref:PROJECT_DB_SQLITE_SYNTHETIC:evidence:DBE-SQLITE-FK-CONNECTION-001');

  const unknownRule = buildSqlitePublicSyntheticInput();
  const projectId = unknownRule.binding.project_id;
  const unknownRuleId = 'DBE-PROFILE-UNBOUND-001';
  unknownRule.binding.authority_bindings.push({ rule_id: unknownRuleId, authority_ref: `ref:${projectId}:authority:${unknownRuleId}`, source_manifest_ref: `ref:${projectId}:source-manifest` });
  unknownRule.binding.evidence_bindings.push({ rule_id: unknownRuleId, evidence_ref: `ref:${projectId}:evidence:${unknownRuleId}`, source_manifest_ref: `ref:${projectId}:source-manifest` });
  unknownRule.binding.authority_bindings.sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  unknownRule.binding.evidence_bindings.sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  unknownRule.binding.evidence_ref_allowlist.push(`ref:${projectId}:evidence:${unknownRuleId}`);
  unknownRule.binding.evidence_ref_allowlist.sort();
  unknownRule.evidence.requirements.push({ project_id: projectId, rule_id: unknownRuleId, requirement_id: `${projectId}:REQ:${unknownRuleId}`, authority_ref: `ref:${projectId}:authority:${unknownRuleId}` });
  unknownRule.evidence.observations.push({ project_id: projectId, rule_id: unknownRuleId, evidence_key: 'unknown', status: 'supported', evidence_ref: `ref:${projectId}:evidence:${unknownRuleId}`, machine_observable: true });
  const unknownFacts = adaptDatabaseProjectEvidence(unknownRule.binding, unknownRule.evidence, unknownRule.cutoffs).typed_project_facts;
  const baseEffective = assembleEffectiveRuleSet(databaseEngineeringAdapter, [], {});
  assert.throws(() => evaluateDatabaseEngineering(baseEffective, unknownFacts), (error) => error.code === 'DBE_EVIDENCE_INVALID');
});

test('outer wrappers, authority, and cutoffs reject accessors or proxies without executing traps', () => {
  const subject = run(buildSqlitePublicSyntheticInput());
  let rulesGetterCalls = 0;
  const rulesWrapper = {};
  Object.defineProperty(rulesWrapper, 'effective_rule_set', { enumerable: true, get() { rulesGetterCalls += 1; return subject.effective.effective_rule_set; } });
  assert.throws(() => evaluateDatabaseEngineering(rulesWrapper, subject.facts), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.equal(rulesGetterCalls, 0);

  let factsGetterCalls = 0;
  const factsWrapper = {};
  Object.defineProperty(factsWrapper, 'typed_project_facts', { enumerable: true, get() { factsGetterCalls += 1; return subject.facts; } });
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, factsWrapper), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.equal(factsGetterCalls, 0);

  let authorityGets = 0;
  const authorityProxy = new Proxy({}, { get() { authorityGets += 1; return undefined; } });
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, subject.facts, authorityProxy), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.equal(authorityGets, 0);

  let rulesProxyGets = 0;
  const rulesProxy = new Proxy(subject.effective, { get() { rulesProxyGets += 1; return undefined; } });
  assert.throws(() => evaluateDatabaseEngineering(rulesProxy, subject.facts), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.equal(rulesProxyGets, 0);

  let factsProxyGets = 0;
  const factsProxy = new Proxy(subject.facts, { get() { factsProxyGets += 1; return undefined; } });
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, factsProxy), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.equal(factsProxyGets, 0);

  let cutoffsGetterCalls = 0;
  const hostileCutoffs = {};
  Object.defineProperty(hostileCutoffs, 'valid_at', { enumerable: true, get() { cutoffsGetterCalls += 1; return subject.facts.valid_at; } });
  Object.defineProperty(hostileCutoffs, 'known_at', { enumerable: true, get() { cutoffsGetterCalls += 1; return subject.facts.known_at; } });
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, subject.facts, {}, hostileCutoffs), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.equal(cutoffsGetterCalls, 0);

  let cutoffsProxyGets = 0;
  const cutoffsProxy = new Proxy({}, { get() { cutoffsProxyGets += 1; return undefined; } });
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, subject.facts, {}, cutoffsProxy), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.equal(cutoffsProxyGets, 0);
  assert.throws(() => evaluateDatabaseEngineering(null, subject.facts), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, null), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, subject.facts, null, {}), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, subject.facts, {}, null), (error) => error.code === 'DBE_INPUT_INVALID');
  assert.throws(() => evaluateDatabaseEngineering(subject.effective, subject.facts, { requested_effects: true }, {}), (error) => error.code === 'DBE_EFFECTS_FORBIDDEN');
});

test('conflict observations and missing hard analyzer coverage reach explicit closure branches', () => {
  const conflictInput = buildSqlitePublicSyntheticInput();
  conflictInput.evidence.observations.find((row) => row.rule_id === 'DBE-SQLITE-FK-CONNECTION-001').status = 'conflict';
  const conflictResult = run(conflictInput).result;
  assert.equal(resultFor(conflictResult, 'DBE-SQLITE-FK-CONNECTION-001').state, DATABASE_GAP_STATE.CONFLICT);
  assert.equal(resultFor(conflictResult, 'DBE-SQLITE-FK-CONNECTION-001').reason_code, 'machine_observable_evidence_conflict');

  const subject = run(buildSqlitePublicSyntheticInput());
  const missingCoverage = structuredClone(subject.result.analysis);
  delete missingCoverage.evidence_by_key.sqlite_fk_connection;
  assert.throws(() => validateDatabaseHardAnalyzerCoverage(subject.effective.effective_rule_set.rules, missingCoverage), (error) => error.code === 'DBE_RULESET_INVALID');
});

test('source tamper, replay, input immutability, and zero-effect receipt are deterministic', () => {
  const input = buildSqlitePublicSyntheticInput();
  const before = JSON.stringify(input);
  const first = run(input);
  const second = run(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(first.effective.assembly_digest, second.effective.assembly_digest);
  assert.deepEqual(first.result, second.result);
  assertDeepFrozen(first.result);
  assert.deepEqual(first.result.receipt.effects, { file_writes: 0, network_calls: 0, db_writes: 0, model_calls: 0 });

  const tampered = structuredClone(first.effective.effective_rule_set);
  tampered.source_inventory_ref.content_id = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => evaluateDatabaseEngineering(tampered, first.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED');

  const tamperedRule = structuredClone(first.effective.effective_rule_set);
  tamperedRule.rules.find((rule) => rule.rule_id === 'DBE-SQLITE-FK-CONNECTION-001').source_locator = 'tampered';
  assert.throws(() => evaluateDatabaseEngineering(tamperedRule, first.facts), (error) => error.code === 'DBE_SOURCE_TAMPERED');
});

test('analysis facade exercises schema, migration, transaction, workload, recovery, and data-quality modules without a DB connection', () => {
  const input = buildSqlitePublicSyntheticInput();
  input.evidence.analysis_input.workload.query_plan_text = 'SCAN orders';
  const { result } = run(input);
  assert.equal(result.analysis.schema_graph.structurally_consistent, true);
  assert.equal(result.analysis.migration_diff.migration_proof_complete, true);
  assert.equal(result.analysis.transaction_semantics.dirty_read_exception_observed, false);
  assert.equal(result.analysis.query_workload.textual_query_plan_present, true);
  assert.equal(result.analysis.query_workload.textual_query_plan_used_as_verdict, false);
  assert.equal(result.analysis.recovery_proof.restore_test_observed, true);
  assert.equal(result.analysis.data_quality.quality_evidence_present, true);
  assert.equal(result.analysis.evidence_by_key.sqlite_fk_connection.status, 'supported');
  const hardEvidenceKeys = DATABASE_ENGINEERING_RULES.filter((rule) => rule.kind === 'hard_technical').map((rule) => rule.evidence_key);
  assert.deepEqual([...new Set(hardEvidenceKeys)].sort(), [
    'postgresql_constraints', 'postgresql_isolation', 'postgresql_pitr', 'postgresql_rls', 'recovery_proof',
    'sqlite_dirty_read_exception', 'sqlite_fk_check', 'sqlite_fk_connection', 'sqlite_integrity_check', 'sqlite_single_writer',
  ]);
  for (const evidenceKey of hardEvidenceKeys) assert.ok(result.analysis.evidence_by_key[evidenceKey], evidenceKey);
});

test('package-local manifest uses caller pins and never claims a release', () => {
  const manifest = createDatabaseEngineeringModuleManifest({
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    configuration_hash: '2'.repeat(64),
    test_receipt_ref: 'receipt:database-engineering-public-synthetic',
  });
  assert.equal(manifest.execution_mode, 'deterministic_only');
  assert.equal(manifest.claim_ceiling, 'source_supported');
  assert.deepEqual(manifest.effects, { file_writes: 0, network_calls: 0, db_writes: 0, model_calls: 0 });
  assert.throws(() => createDatabaseEngineeringModuleManifest({}), TypeError);
});

test('manual and local guidance links resolve within the package', () => {
  const manual = resolve(packageRoot, 'manual');
  const docs = [resolve(packageRoot, 'README.md'), resolve(packageRoot, 'guidance/source_cited_guidance.md')];
  for (let chapter = 1; chapter <= 12; chapter += 1) {
    const name = `${String(chapter).padStart(2, '0')}_${[
      'purpose_and_shape', 'rule_layers', 'source_derivation', 'vocabulary', 'compiler', 'evidence_trace',
      'runs_and_receipts', 'decisions', 'next_work_and_handoff', 'observation_boundary', 'guidance_boundary', 'integration_door',
    ][chapter - 1]}.md`;
    docs.push(resolve(manual, name));
  }
  docs.push(resolve(manual, 'README.md'));
  for (const document of docs) {
    assert.equal(existsSync(document), true, document);
    const source = readFileSync(document, 'utf8');
    for (const match of source.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/gu)) {
      const target = match[1];
      if (/^[a-z]+:/iu.test(target)) continue;
      assert.equal(existsSync(resolve(dirname(document), target)), true, `${document} -> ${target}`);
    }
  }
});

test('stdout-only runner is replay-stable and leaves its caller directory empty', () => {
  const runner = fileURLToPath(new URL('../tools/database_engineering_runner.mjs', import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), 'database-engineering-runner-'));
  try {
    const first = spawnSync(process.execPath, [runner], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    const second = spawnSync(process.execPath, [runner], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stderr, '');
    assert.equal(second.stderr, '');
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(readdirSync(sandbox), []);
    assert.equal(JSON.parse(first.stdout).receipt.effects.db_writes, 0);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
