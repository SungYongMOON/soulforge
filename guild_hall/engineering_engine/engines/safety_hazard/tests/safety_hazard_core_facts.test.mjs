import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assembleEffectiveRuleSet,
  evaluate,
  loadDomainEngineAdapter,
  resolveProfileBindings,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { validateJsonSchemaSubset } from '../schemas/safety_hazard_schema_validator.mjs';
import {
  calculateSafetyHazardCoreFactsDigest,
  createSafetyHazardTypedProjectFacts,
  SAFETY_HAZARD_CORE_FACTS_ERROR_CODES,
} from '../evaluator/safety_hazard_project_facts_adapter.mjs';
import '../evaluator/safety_hazard_evaluator_adapter.mjs';
import { buildSafetyHazardPublicSyntheticRequest } from '../fixtures/safety_hazard_public_synthetic.mjs';

const TIMES = Object.freeze({
  valid_at: '2026-08-26T00:00:00.000Z',
  known_at: '2026-08-26T00:00:00.000Z',
});

function buildTypedFacts() {
  const request = buildSafetyHazardPublicSyntheticRequest();
  const requestBinding = request.binding.project_binding_ref;
  return createSafetyHazardTypedProjectFacts({
    project_binding: {
      schema_version: 'soulforge.project_binding.v0',
      project_id: requestBinding.entity_id,
      domain_engine_id: 'safety_hazard',
      binding_revision_hash: requestBinding.content_id.slice('sha256:'.length),
      source_manifest_ref: 'synthetic/safety-hazard-source-manifest',
    },
    request,
    ...TIMES,
  });
}

function evaluateTypedFacts(typedFacts = buildTypedFacts().typed_project_facts, cutoffs = TIMES) {
  const adapter = loadDomainEngineAdapter('safety_hazard');
  const effective = assembleEffectiveRuleSet(adapter, resolveProfileBindings(), {});
  return evaluate(adapter, effective, typedFacts, {}, cutoffs);
}

test('Safety Hazard Core facts: only an exact Core TypedProjectFacts envelope may reach evaluation', () => {
  const typed = buildTypedFacts();
  const result = evaluateTypedFacts(typed.typed_project_facts);

  assert.equal(result.domain_result.results.length, 8);
  assert.equal(result.receipt.bindings.core_typed_facts.facts_digest, typed.typed_project_facts.facts_digest);
  assert.equal(result.receipt.bindings.core_typed_facts.project_id, typed.typed_project_facts.project_binding_ref.project_id);
  assert.equal(result.receipt.bindings.admitted_effective_ruleset.assembly_digest.length, 64);

  const raw = buildSafetyHazardPublicSyntheticRequest();
  assert.throws(
    () => evaluateTypedFacts(raw),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );

  const hybrid = structuredClone(typed.typed_project_facts);
  hybrid.request = buildSafetyHazardPublicSyntheticRequest();
  assert.throws(
    () => evaluateTypedFacts(hybrid),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );
});
test('Safety Hazard Core facts: stale digest, project mismatch, and cutoff mismatch fail closed', () => {
  const stale = structuredClone(buildTypedFacts().typed_project_facts);
  stale.facts_digest = '0'.repeat(64);
  assert.throws(
    () => evaluateTypedFacts(stale),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_TAMPERED,
  );

  const mismatched = structuredClone(buildTypedFacts().typed_project_facts);
  mismatched.facts[0].project_id = 'another-project';
  mismatched.facts_digest = calculateSafetyHazardCoreFactsDigest(mismatched.facts);
  assert.throws(
    () => evaluateTypedFacts(mismatched),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );

  assert.throws(
    () => evaluateTypedFacts(buildTypedFacts().typed_project_facts, {
      valid_at: TIMES.valid_at,
      known_at: '2026-08-26T00:00:01.000Z',
    }),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );
});

test('Safety Hazard Core facts: nested getter and proxy traps are refused before invocation', () => {
  const typed = structuredClone(buildTypedFacts().typed_project_facts);
  let requestGetterCalls = 0;
  Object.defineProperty(typed.facts[0], 'request', {
    enumerable: true,
    configurable: true,
    get() {
      requestGetterCalls += 1;
      throw new Error('must not execute');
    },
  });
  assert.throws(
    () => evaluateTypedFacts(typed),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );
  assert.equal(requestGetterCalls, 0);

  const adapter = loadDomainEngineAdapter('safety_hazard');
  const effective = structuredClone(assembleEffectiveRuleSet(adapter, resolveProfileBindings(), {}));
  let refGetterCalls = 0;
  Object.defineProperty(effective.effective_rule_set, 'ruleset_ref', {
    enumerable: true,
    configurable: true,
    get() {
      refGetterCalls += 1;
      throw new Error('must not execute');
    },
  });
  assert.throws(
    () => evaluate(adapter, effective, buildTypedFacts().typed_project_facts, {}, TIMES),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  assert.equal(refGetterCalls, 0);
});

test('Safety Hazard Core facts: facts and receipt conform to their declared schema surfaces', () => {
  const typed = buildTypedFacts();
  const result = evaluateTypedFacts(typed.typed_project_facts);
  const coreFactsSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../../../core/schemas/typed_project_facts_schema_v0.json', import.meta.url)), 'utf8'));
  const publishedFactsSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/safety_hazard_typed_project_facts_schema_v0.json', import.meta.url)), 'utf8'));
  const receiptSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/safety_hazard_evaluation_receipt_schema_v0.json', import.meta.url)), 'utf8'));

  assert.deepEqual(validateJsonSchemaSubset(typed.typed_project_facts, coreFactsSchema), []);
  assert.deepEqual(validateJsonSchemaSubset(typed.typed_project_facts, publishedFactsSchema), []);
  assert.deepEqual(validateJsonSchemaSubset(result.receipt, receiptSchema), []);
});

test('Safety Hazard Core facts: legitimate optional project_binding fields are accepted and conform to schemas', () => {
  const request = buildSafetyHazardPublicSyntheticRequest();
  const requestBinding = request.binding.project_binding_ref;
  const typedWithOptionals = createSafetyHazardTypedProjectFacts({
    project_binding: {
      schema_version: 'soulforge.project_binding.v0',
      project_id: requestBinding.entity_id,
      domain_engine_id: 'safety_hazard',
      binding_revision_hash: requestBinding.content_id.slice('sha256:'.length),
      source_manifest_ref: 'synthetic/safety-hazard-source-manifest',
      authority_family: 'company_approved_procedure',
      valid_at: TIMES.valid_at,
      known_at: TIMES.known_at,
      document_refs: ['doc:1', 'doc:2'],
    },
    request,
    ...TIMES,
  });

  const result = evaluateTypedFacts(typedWithOptionals.typed_project_facts);
  assert.equal(result.domain_result.results.length, 8);

  const coreFactsSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../../../core/schemas/typed_project_facts_schema_v0.json', import.meta.url)), 'utf8'));
  const publishedFactsSchema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/safety_hazard_typed_project_facts_schema_v0.json', import.meta.url)), 'utf8'));

  assert.deepEqual(validateJsonSchemaSubset(typedWithOptionals.typed_project_facts, coreFactsSchema), []);
  assert.deepEqual(validateJsonSchemaSubset(typedWithOptionals.typed_project_facts, publishedFactsSchema), []);
});

test('Safety Hazard Core facts: invalid optional fields and extra keys fail closed', () => {
  const request = buildSafetyHazardPublicSyntheticRequest();
  const requestBinding = request.binding.project_binding_ref;

  // Unknown authority family
  assert.throws(
    () => createSafetyHazardTypedProjectFacts({
      project_binding: {
        schema_version: 'soulforge.project_binding.v0',
        project_id: requestBinding.entity_id,
        domain_engine_id: 'safety_hazard',
        binding_revision_hash: requestBinding.content_id.slice('sha256:'.length),
        source_manifest_ref: 'synthetic/safety-hazard-source-manifest',
        authority_family: 'unauthorized_family',
      },
      request,
      ...TIMES,
    }),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );

  // Time mismatch in project binding
  assert.throws(
    () => createSafetyHazardTypedProjectFacts({
      project_binding: {
        schema_version: 'soulforge.project_binding.v0',
        project_id: requestBinding.entity_id,
        domain_engine_id: 'safety_hazard',
        binding_revision_hash: requestBinding.content_id.slice('sha256:'.length),
        source_manifest_ref: 'synthetic/safety-hazard-source-manifest',
        valid_at: '2026-08-27T00:00:00.000Z',
      },
      request,
      ...TIMES,
    }),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );

  // Unknown extra key in project binding
  assert.throws(
    () => createSafetyHazardTypedProjectFacts({
      project_binding: {
        schema_version: 'soulforge.project_binding.v0',
        project_id: requestBinding.entity_id,
        domain_engine_id: 'safety_hazard',
        binding_revision_hash: requestBinding.content_id.slice('sha256:'.length),
        source_manifest_ref: 'synthetic/safety-hazard-source-manifest',
        unexpected_extra_key: 'hostile',
      },
      request,
      ...TIMES,
    }),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );
});

test('Safety Hazard Core facts: hostile cycles, proxies, and custom prototypes fail closed', () => {
  const cyclic = buildTypedFacts().typed_project_facts;
  const cycleObj = {};
  cycleObj.self = cycleObj;
  assert.throws(
    () => evaluateTypedFacts(cycleObj),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );

  const proxyFacts = new Proxy(buildTypedFacts().typed_project_facts, {});
  assert.throws(
    () => evaluateTypedFacts(proxyFacts),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );

  const customProto = Object.create({ inherited: true });
  Object.assign(customProto, structuredClone(buildTypedFacts().typed_project_facts));
  assert.throws(
    () => evaluateTypedFacts(customProto),
    (error) => error.code === SAFETY_HAZARD_CORE_FACTS_ERROR_CODES.CORE_FACTS_INVALID,
  );
});
