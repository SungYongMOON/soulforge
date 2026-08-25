import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validateJsonSchemaSubset } from '../schemas/safety_hazard_schema_validator.mjs';

import {
  adaptProjectEvidence,
  assembleEffectiveRuleSet,
  evaluate,
  loadDomainEngineAdapter,
  resolveProfileBindings,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import {
  SAFETY_HAZARD_RULES,
  SAFETY_HAZARD_RULESET_REF,
  SAFETY_HAZARD_SOURCE_PACKET_REF,
} from '../rules/safety_hazard_rules.mjs';
import {
  compileSafetyHazardRules,
  SAFETY_HAZARD_COMPILER_ERROR_CODES,
} from '../compiler/safety_hazard_compiler_adapter.mjs';
import '../evaluator/safety_hazard_evaluator_adapter.mjs';
import { buildSafetyHazardPublicSyntheticRequest } from '../fixtures/safety_hazard_public_synthetic.mjs';

const profileAddedRule = Object.freeze({
  rule_id: 'SH-ORG-09',
  source_ref: 'contracts/synthetic_safety_hazard_org.json',
  source_locator: 'section-1',
  source_modality: 'synthetic organization evidence check',
  required_evidence_fields: ['hazard_identity_ref'],
  required_authority_families: ['company_approved_procedure'],
  lifecycle_statuses: ['identified'],
  requires_human_authority_binding: false,
});

const organizationProfile = () => ({
  profile_kind: 'organization',
  profile_id: 'org_safety_hazard_synthetic',
  domain_engine_id: 'safety_hazard',
  revision_or_hash: 'rev-1.0.0',
  extends_or_base_pin: 'safety_hazard_base:v0',
  source_refs: ['contracts/synthetic_safety_hazard_org.json'],
  operations: [{ op: 'add', rule: structuredClone(profileAddedRule) }],
  order: 0,
});

test('Safety Hazard compiler: base ruleset is stable and Core adapter loads', () => {
  const adapter = loadDomainEngineAdapter('safety_hazard');
  const compiled = compileSafetyHazardRules();

  assert.equal(adapter.domain_engine_id, 'safety_hazard');
  assert.equal(compiled.rule_count, SAFETY_HAZARD_RULES.length);
  assert.deepEqual(compiled.effective_rule_set.ruleset_ref, SAFETY_HAZARD_RULESET_REF);
});

test('Safety Hazard compiler: Core Profile bindings preserve provenance for a bounded add', () => {
  const adapter = loadDomainEngineAdapter('safety_hazard');
  const bindings = resolveProfileBindings(organizationProfile(), null);
  const effective = assembleEffectiveRuleSet(adapter, bindings, { purpose: 'public_synthetic' });

  assert.equal(effective.domain_engine_id, 'safety_hazard');
  assert.equal(effective.rule_count, SAFETY_HAZARD_RULES.length + 1);
  assert.equal(effective.compilation_trace.organization_trace.profile_id, 'org_safety_hazard_synthetic');
  assert.equal(effective.effective_rule_set.ruleset_ref.entity_id, 'safety-hazard-ruleset-derived-v0');
  assert.ok(effective.effective_rule_set.rules.some((rule) => rule.rule_id === 'SH-ORG-09'));

  assert.throws(
    () => evaluate(adapter, effective, { request: buildSafetyHazardPublicSyntheticRequest() }),
    (error) => error.code === 'SH_PROFILE_EVALUATION_UNSUPPORTED',
  );
});

test('Safety Hazard compiler: unsupported Profile operation fails closed', () => {
  const profile = organizationProfile();
  profile.operations = [{ op: 'remove', rule_id: 'SH-HZ-01' }];
  const bindings = resolveProfileBindings(profile, null);

  assert.throws(
    () => compileSafetyHazardRules(bindings),
    (error) => error.code === SAFETY_HAZARD_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED,
  );
});

test('Safety Hazard adapter: Core evaluation and Typed Facts seams remain compatible without Core changes', () => {
  const adapter = loadDomainEngineAdapter('safety_hazard');
  const effective = assembleEffectiveRuleSet(adapter, resolveProfileBindings(), {});
  const viaCore = evaluate(adapter, effective, { request: buildSafetyHazardPublicSyntheticRequest() });

  assert.equal(viaCore.domain_result.results.length, SAFETY_HAZARD_RULES.length);
  const adapted = adaptProjectEvidence(
    {
      schema_version: 'soulforge.project_binding.v0',
      project_id: 'public_synthetic_project',
      domain_engine_id: 'safety_hazard',
      binding_revision_hash: 'a'.repeat(64),
      source_manifest_ref: 'synthetic/source_manifest.json',
    },
    {
      source_refs: ['synthetic/hazard_observations.json'],
      observations: [{ element_id: 'synthetic_hazard', presence_state: 'present' }],
    },
    {
      valid_at: '2026-08-26T00:00:00.000Z',
      known_at: '2026-08-26T00:00:00.000Z',
    },
  );

  assert.equal(adapted.typed_project_facts.schema_version, 'soulforge.typed_project_facts.v0');
  assert.equal(adapted.observation_receipt.facts_count, 1);
});

test('Safety Hazard compiler: ContractError remains the uniform failure model', () => {
  assert.throws(
    () => compileSafetyHazardRules({}),
    (error) => error instanceof ContractError
      && error.code === SAFETY_HAZARD_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
  );
});

test('Safety Hazard package: source packet is byte-bound and the obsolete NASA source remains non-executable', () => {
  const packetPath = fileURLToPath(new URL('../contracts/safety_hazard_source_packet_v0.md', import.meta.url));
  const inventoryPath = fileURLToPath(new URL('../contracts/safety_hazard_public_source_inventory_candidate_v1.json', import.meta.url));
  const packetDigest = createHash('sha256').update(readFileSync(packetPath)).digest('hex');
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const obsoleteNasa = inventory.records.find((record) => record.source_id === 'S2-NASA-NPR-8715-3D');

  assert.equal(SAFETY_HAZARD_SOURCE_PACKET_REF.content_id, `sha256:${packetDigest}`);
  assert.equal(inventory.rag_boundary.rag_can_issue_verdicts, false);
  assert.equal(obsoleteNasa.status_at_direct_check, 'obsolete_no_longer_used');
  assert.equal(obsoleteNasa.applicability, 'not_executable');
});

test('Safety Hazard package: descriptor, topology, schema, and complete manual remain local and present', () => {
  const packageRoot = dirname(fileURLToPath(new URL('../engine.yaml', import.meta.url)));
  const requiredFiles = [
    'engine.yaml',
    'README.md',
    'schemas/safety_hazard_schema_v0.json',
    'schemas/safety_hazard_schema_validator.mjs',
    'topology/safety_hazard_module_manifest.mjs',
    'topology/safety_hazard_topology_v0.md',
    'topology/safety_hazard_integration_request_v0.md',
    ...Array.from({ length: 12 }, (_, index) => `manual/${String(index + 1).padStart(2, '0')}_${[
      'purpose_and_shape', 'rule_layers', 'source_derivation', 'vocabulary', 'evaluator', 'evidence_trace',
      'runs_and_receipts', 'decisions', 'next_work_and_handoff', 'observation_boundary',
      'guidance_boundary', 'integration_door',
    ][index]}.md`),
  ];
  const descriptor = JSON.parse(readFileSync(join(packageRoot, 'engine.yaml'), 'utf8'));
  const schema = JSON.parse(readFileSync(join(packageRoot, 'schemas/safety_hazard_schema_v0.json'), 'utf8'));

  assert.ok(requiredFiles.every((relative) => existsSync(join(packageRoot, relative))));
  assert.deepEqual(validateJsonSchemaSubset(descriptor, schema), []);
  assert.equal(descriptor.domain_engine_id, 'safety_hazard');
  assert.equal(descriptor.execution_mode, 'deterministic_only');
  assert.equal(schema.$id, 'soulforge.safety_hazard.engine_descriptor.v0');
  assert.equal(schema.properties.domain_engine_id.const, 'safety_hazard');

  const malformed = structuredClone(descriptor);
  malformed.schemas.descriptor = 'soulforge.wrong_descriptor.v0';
  delete malformed.compiler_adapter;
  malformed.unexpected = true;
  const malformedErrors = validateJsonSchemaSubset(malformed, schema);
  assert.ok(malformedErrors.some((error) => error.includes('schemas.descriptor: expected const')));
  assert.ok(malformedErrors.some((error) => error.includes('missing required property compiler_adapter')));
  assert.ok(malformedErrors.some((error) => error.includes('unexpected property unexpected')));
});
