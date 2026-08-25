import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';

import { assembleEffectiveRuleSet, evaluate, registerDomainEngineAdapter, resolveProfileBindings } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { DATABASE_BASE_RULESET_REF, DATABASE_ENGINEERING_RULES, DATABASE_SOURCE_INVENTORY_REF } from '../rules/database_engineering_rules.mjs';
import { POSTGRESQL_18_6_EXECUTABLE_SOURCE_IDS, validatePostgresql18_6ExecutableSourcePins } from '../rules/database_engineering_source_pins.mjs';
import { DATABASE_GAP_STATE } from '../rules/database_engineering_vocabulary.mjs';
import { databaseEngineeringAdapter, evaluateDatabaseEngineering } from '../evaluator/database_engineering_evaluator_adapter.mjs';
import { adaptDatabaseProjectEvidence } from '../evaluator/database_project_evidence_adapter.mjs';
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

function run(input, profiles = []) {
  const facts = adaptDatabaseProjectEvidence(input.binding, input.evidence, input.cutoffs).typed_project_facts;
  const bindings = profiles.length === 0 ? [] : resolveProfileBindings(...profiles);
  const effective = assembleEffectiveRuleSet(databaseEngineeringAdapter, bindings, { purpose: 'public_synthetic' });
  return { facts, effective, result: evaluate(databaseEngineeringAdapter, effective, facts, {}, input.cutoffs) };
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
  assert.equal(topology.internal_modules.length, 7);
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
});

test('closed DBE descriptor, ruleset, project-binding, and typed-facts schemas compile and admit only package shape', () => {
  const ajv = new Ajv2020({ strict: false });
  const schema = (name) => JSON.parse(readFileSync(resolve(packageRoot, `schemas/${name}`), 'utf8'));
  const descriptorSchema = ajv.compile(schema('database_engineering_descriptor_schema_v0.json'));
  const rulesetSchema = ajv.compile(schema('database_engineering_ruleset_schema_v0.json'));
  const bindingSchema = ajv.compile(schema('database_project_binding_schema_v0.json'));
  const factsSchema = ajv.compile(schema('database_typed_facts_schema_v0.json'));
  assert.equal(descriptorSchema({
    schema_version: 'soulforge.domain_engine_descriptor.v0', domain_engine_id: 'database_engineering', display_name: 'Database Engineering Domain Engine',
    version: '0.1.0', status: 'candidate', claim_ceiling: 'source_supported', execution_mode: 'deterministic_only',
  }), true);
  const input = buildSqlitePublicSyntheticInput();
  const adapted = adaptDatabaseProjectEvidence(input.binding, input.evidence, input.cutoffs);
  const effective = assembleEffectiveRuleSet(databaseEngineeringAdapter, [], {});
  assert.equal(bindingSchema(input.binding), true, JSON.stringify(bindingSchema.errors));
  assert.equal(factsSchema(adapted.typed_project_facts), true, JSON.stringify(factsSchema.errors));
  assert.equal(rulesetSchema(effective.effective_rule_set), true, JSON.stringify(rulesetSchema.errors));
  const malformed = structuredClone(input.binding);
  malformed.unapproved_field = true;
  assert.equal(bindingSchema(malformed), false);

  const deeplyMalformed = structuredClone(adapted.typed_project_facts);
  deeplyMalformed.analysis_input.platform_controls.sqlite.unapproved_field = true;
  assert.equal(factsSchema(deeplyMalformed), false);
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
});

test('a Core Profile-added rule is compiled with provenance and evaluated end-to-end', () => {
  const input = buildSqlitePublicSyntheticInput();
  const projectId = input.binding.project_id;
  const profileSource = `ref:${projectId}:profile:retention`;
  const derivedRuleId = 'DBE-PROFILE-RETENTION-001';
  input.evidence.requirements.push({
    rule_id: derivedRuleId,
    requirement_id: `${projectId}:REQ:${derivedRuleId}`,
    authority_ref: `ref:${projectId}:authority:${derivedRuleId}`,
  });
  input.evidence.observations.push({
    rule_id: derivedRuleId,
    evidence_key: 'retention_proof',
    status: 'supported',
    evidence_ref: `ref:${projectId}:observation:${derivedRuleId}`,
    machine_observable: true,
    project_id: projectId,
  });
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
