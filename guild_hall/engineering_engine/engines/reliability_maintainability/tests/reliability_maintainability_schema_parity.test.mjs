import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import YAML from 'yaml';

import {
  assessReliabilityMaintainability,
  verifyReliabilityMaintainabilityResult,
} from '../evaluator/reliability_maintainability.mjs';
import {
  RM_ADMISSION_ERROR_CODES,
  admitReliabilityMaintainabilityTypedFacts,
  coreFactsDigest,
} from '../evaluator/reliability_maintainability_admission.mjs';
import { reliabilityMaintainabilityAdapter } from '../evaluator/reliability_maintainability_evaluator_adapter.mjs';
import {
  buildReliabilityMaintainabilityPublicSyntheticRequest,
  buildReliabilityMaintainabilityPublicSyntheticTypedFacts,
} from '../fixtures/reliability_maintainability_public_synthetic.mjs';
import { compileReliabilityMaintainabilityRules } from '../compiler/reliability_maintainability_compiler_adapter.mjs';
import { AUTHORITY_FAMILIES } from '../../../core/validators/authority.mjs';
import { adaptProjectEvidence } from '../../../core/interfaces/domain_engine_adapter.mjs';

const schemaPath = (name) => fileURLToPath(new URL(`../schemas/${name}`, import.meta.url));

function loadSchema(name) {
  const path = schemaPath(name);
  assert.equal(existsSync(path), true, `missing closed schema ${name}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function expectClosedSchema(validator, value, label) {
  assert.equal(validator(value), true, `${label} must validate: ${JSON.stringify(validator.errors)}`);
  const extra = clone(value);
  extra.unexpected_field = true;
  assert.equal(validator(extra), false, `${label} must reject extra fields`);
}

test('RED B3: actual engine descriptor and emitted domain objects have closed AJV schemas', () => {
  const descriptor = YAML.parse(readFileSync(new URL('../engine.yaml', import.meta.url), 'utf8'));
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const result = assessReliabilityMaintainability(request);
  const typedFacts = buildReliabilityMaintainabilityPublicSyntheticTypedFacts();
  const ruleset = compileReliabilityMaintainabilityRules([]).effective_rule_set;
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  const domainInputSchema = loadSchema('reliability_maintainability_domain_input_schema_v0.json');
  ajv.addSchema(domainInputSchema);
  const descriptorValidator = ajv.compile(loadSchema('reliability_maintainability_schema_v0.json'));
  const inputValidator = ajv.getSchema(domainInputSchema.$id);
  const typedFactsValidator = ajv.compile(loadSchema('reliability_maintainability_typed_facts_schema_v0.json'));
  const rulesetValidator = ajv.compile(loadSchema('reliability_maintainability_ruleset_schema_v0.json'));
  const assessmentValidator = ajv.compile(loadSchema('reliability_maintainability_assessment_schema_v0.json'));
  const domainResultValidator = ajv.compile(loadSchema('reliability_maintainability_domain_result_schema_v0.json'));
  const receiptValidator = ajv.compile(loadSchema('reliability_maintainability_receipt_schema_v0.json'));

  expectClosedSchema(descriptorValidator, descriptor, 'engine descriptor');
  expectClosedSchema(inputValidator, request.domain_input, 'domain input');
  expectClosedSchema(typedFactsValidator, typedFacts, 'Core typed facts mapping');
  expectClosedSchema(rulesetValidator, ruleset, 'ruleset');
  expectClosedSchema(assessmentValidator, result.assessment, 'assessment');
  expectClosedSchema(domainResultValidator, result.domain_result, 'domain result');
  expectClosedSchema(receiptValidator, result.receipt, 'receipt');

  const missing = clone(result.assessment);
  delete missing.assessment_kind;
  assert.equal(assessmentValidator(missing), false, 'assessment must reject missing required field');

  const wrongSchema = clone(result.domain_result);
  wrongSchema.schema_version = 'soulforge.wrong.v0';
  assert.equal(domainResultValidator(wrongSchema), false, 'domain result must reject wrong schema id');

  const nestedExtra = clone(request.domain_input);
  nestedExtra.rows[0].context_refs.unexpected_ref = clone(nestedExtra.rows[0].stage_ref);
  assert.equal(inputValidator(nestedExtra), false, 'domain input must reject nested extra context fields');

  const typedMissing = clone(typedFacts);
  delete typedMissing.valid_at;
  assert.equal(typedFactsValidator(typedMissing), false, 'Core typed facts schema must reject missing bitemporal fields');
});

test('RED: schemas and runtime strictly align with Core AUTHORITY_FAMILIES registry and reject invented families', () => {
  const coreFamilyKeys = AUTHORITY_FAMILIES.map((f) => f.key);
  const coreFamilySet = new Set(coreFamilyKeys);

  const rulesetSchema = loadSchema('reliability_maintainability_ruleset_schema_v0.json');
  const domainInputSchema = loadSchema('reliability_maintainability_domain_input_schema_v0.json');
  const domainResultSchema = loadSchema('reliability_maintainability_domain_result_schema_v0.json');
  const typedFactsSchema = loadSchema('reliability_maintainability_typed_facts_schema_v0.json');

  // Assert schema enum sets exactly equal Core AUTHORITY_FAMILIES keys
  const rulesetAuthProp = rulesetSchema.$defs.rule.properties.required_authority_families;
  const rulesetEnums = rulesetAuthProp.items.enum;
  assert.equal(Array.isArray(rulesetEnums), true, 'ruleset required_authority_families items must define enum');
  assert.equal(rulesetEnums.length, coreFamilyKeys.length);
  assert.deepEqual(new Set(rulesetEnums), coreFamilySet);

  const inputAuthProp = domainInputSchema.$defs.authorityBinding.properties.authority_family;
  const inputEnums = inputAuthProp.enum;
  assert.equal(Array.isArray(inputEnums), true, 'domain_input authorityBinding authority_family must define enum');
  assert.equal(inputEnums.length, coreFamilyKeys.length);
  assert.deepEqual(new Set(inputEnums), coreFamilySet);

  const resultAuthRef = domainResultSchema.$defs.authorityBinding.$ref;
  assert.equal(resultAuthRef, 'soulforge.reliability_maintainability.domain_input_schema.v0#/$defs/authorityBinding');

  const conflictGovProp = domainResultSchema.$defs.conflict.properties.governing_authority_family;
  const conflictEnums = conflictGovProp.enum;
  assert.equal(Array.isArray(conflictEnums), true, 'domain_result conflict governing_authority_family must define enum');
  assert.equal(conflictEnums.length, coreFamilyKeys.length);
  assert.deepEqual(new Set(conflictEnums), coreFamilySet);

  const typedFactsAuthProp = typedFactsSchema.properties.project_binding_ref.properties.authority_family;
  const typedFactsEnums = typedFactsAuthProp.enum;
  assert.equal(Array.isArray(typedFactsEnums), true, 'typed_facts project_binding_ref authority_family must define enum');
  assert.equal(typedFactsEnums.length, coreFamilyKeys.length);
  assert.deepEqual(new Set(typedFactsEnums), coreFamilySet);
});

test('RED: runtime enforces semantic invariants beyond syntactic JSON Schema validation (differential testing)', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const domainInputSchema = loadSchema('reliability_maintainability_domain_input_schema_v0.json');
  ajv.addSchema(domainInputSchema);
  const inputValidator = ajv.getSchema(domainInputSchema.$id);

  // 1. Calendar-impossible date (Feb 30) passes JSON Schema regex format but runtime rejects
  const reqWithFeb30 = buildReliabilityMaintainabilityPublicSyntheticRequest();
  reqWithFeb30.cutoffs.valid_at = '2026-02-30T00:00:00.000Z';
  reqWithFeb30.cutoffs.known_at = '2026-02-30T00:00:00.000Z';
  assert.throws(
    () => assessReliabilityMaintainability(reqWithFeb30),
    (error) => error.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
    'runtime must reject non-existent calendar date',
  );

  // 2. Duplicate authority family in authority_bindings
  const reqWithDupFamily = buildReliabilityMaintainabilityPublicSyntheticRequest();
  reqWithDupFamily.domain_input.rows[0].authority_bindings = [
    {
      authority_family: 'project_contract_baseline',
      role_ref: clone(reqWithDupFamily.domain_input.rows[0].stage_ref),
      delegation_ref: clone(reqWithDupFamily.domain_input.rows[0].stage_ref),
      decision_ref: clone(reqWithDupFamily.domain_input.rows[0].stage_ref),
    },
    {
      authority_family: 'project_contract_baseline',
      role_ref: clone(reqWithDupFamily.domain_input.rows[0].stage_ref),
      delegation_ref: clone(reqWithDupFamily.domain_input.rows[0].stage_ref),
      decision_ref: clone(reqWithDupFamily.domain_input.rows[0].stage_ref),
    },
  ];
  // If schema permits multiple authority bindings, runtime must reject duplicate families
  assert.throws(
    () => assessReliabilityMaintainability(reqWithDupFamily),
    (error) => error.code === 'RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED' || error.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
    'runtime must reject duplicate authority family',
  );

  // 3. Alternate host IP URL normalization (http://127.1/admin) passes syntactic token pattern, but runtime WHATWG URL normalization fails closed WITHOUT ECHO
  const reqWithAlternateIp = buildReliabilityMaintainabilityPublicSyntheticRequest();
  reqWithAlternateIp.domain_input.rows[0].case_id = 'http://127.1/admin';
  assert.throws(
    () => assessReliabilityMaintainability(reqWithAlternateIp),
    (error) => {
      assert.equal(error.code, 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED');
      assert.ok(!error.message.includes('127.1'), 'error message must not echo hostile value');
      return true;
    },
    'runtime must reject normalized alternate loopback host',
  );
});

test('RED Blocker 4: Deep-closed schemas validate real emitted result with project_facts_provenance and reject missing engine_ref/extra keys', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const domainInputSchema = loadSchema('reliability_maintainability_domain_input_schema_v0.json');
  const domainResultSchema = loadSchema('reliability_maintainability_domain_result_schema_v0.json');
  const typedFactsSchema = loadSchema('reliability_maintainability_typed_facts_schema_v0.json');
  const receiptSchema = loadSchema('reliability_maintainability_receipt_schema_v0.json');

  ajv.addSchema(domainInputSchema);
  ajv.addSchema(domainResultSchema);
  const typedFactsValidator = ajv.compile(typedFactsSchema);
  const domainResultValidator = ajv.compile(domainResultSchema);
  const receiptValidator = ajv.compile(receiptSchema);

  const typedFacts = buildReliabilityMaintainabilityPublicSyntheticTypedFacts();
  assert.equal(typedFactsValidator(typedFacts), true, 'typed facts must validate against deep closed schema');

  // Missing engine_ref in fact binding must be rejected by schema
  const badTypedFactsNoEngineRef = clone(typedFacts);
  delete badTypedFactsNoEngineRef.facts[0].binding.engine_ref;
  assert.equal(typedFactsValidator(badTypedFactsNoEngineRef), false, 'typed facts schema must require engine_ref in binding');

  // Extra field in module_bindings item must be rejected
  const badTypedFactsExtraManifest = clone(typedFacts);
  badTypedFactsExtraManifest.facts[0].binding.module_bindings[0].extra_field = 'forged';
  assert.equal(typedFactsValidator(badTypedFactsExtraManifest), false, 'typed facts schema must reject extra fields in module_bindings');

  // Emitted result and receipt with project_facts_provenance validate truthfully
  const baseRuleset = compileReliabilityMaintainabilityRules([]).effective_rule_set;
  const emittedResult = reliabilityMaintainabilityAdapter.evaluate(baseRuleset, typedFacts);
  assert.ok(emittedResult.domain_result.project_facts_provenance, 'emitted domain_result must carry project_facts_provenance');
  assert.ok(emittedResult.receipt.project_facts_provenance, 'emitted receipt must carry project_facts_provenance');
  expectClosedSchema(domainResultValidator, emittedResult.domain_result, 'emitted domain result with provenance');
  expectClosedSchema(receiptValidator, emittedResult.receipt, 'emitted receipt with provenance');
});

test('RED: Core project binding schema parity and differential Ajv+runtime checks for schema_version and source_manifest_ref', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const domainInputSchema = loadSchema('reliability_maintainability_domain_input_schema_v0.json');
  const domainResultSchema = loadSchema('reliability_maintainability_domain_result_schema_v0.json');
  const typedFactsSchema = loadSchema('reliability_maintainability_typed_facts_schema_v0.json');

  ajv.addSchema(domainInputSchema);
  ajv.addSchema(domainResultSchema);
  const typedFactsValidator = ajv.compile(typedFactsSchema);

  // Assert schema required fields match Core Project Binding required fields exactly
  const pbRequired = typedFactsSchema.properties.project_binding_ref.required;
  assert.deepEqual(
    [...pbRequired].sort(),
    ['binding_revision_hash', 'domain_engine_id', 'project_id', 'schema_version', 'source_manifest_ref'].sort(),
    'typed_facts schema must require exact Core project binding required fields',
  );

  const typedFacts = buildReliabilityMaintainabilityPublicSyntheticTypedFacts();

  // Omission of schema_version fails Ajv
  const noSchemaVer = clone(typedFacts);
  delete noSchemaVer.project_binding_ref.schema_version;
  assert.equal(typedFactsValidator(noSchemaVer), false, 'schema must reject missing schema_version');

  // Omission of source_manifest_ref fails Ajv
  const noSourceManifest = clone(typedFacts);
  delete noSourceManifest.project_binding_ref.source_manifest_ref;
  assert.equal(typedFactsValidator(noSourceManifest), false, 'schema must reject missing source_manifest_ref');
});

test('RED: schema parity verifies domain input, result, and typed facts with evidence_kind: null and rejects marker objects', () => {
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const relRow = request.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  relRow.evidence_kind = null;

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const domainInputSchema = loadSchema('reliability_maintainability_domain_input_schema_v0.json');
  ajv.addSchema(domainInputSchema);
  const inputValidator = ajv.getSchema(domainInputSchema.$id);
  const domainResultSchema = loadSchema('reliability_maintainability_domain_result_schema_v0.json');
  const resultValidator = ajv.compile(domainResultSchema);
  const typedFactsSchema = loadSchema('reliability_maintainability_typed_facts_schema_v0.json');
  const typedFactsValidator = ajv.compile(typedFactsSchema);

  // Valid domain_input with null evidence_kind passes schema
  assert.equal(inputValidator(request.domain_input), true, 'domain_input with evidence_kind: null must validate');

  // Synthetic result with null evidence_kind passes schema
  const emittedResult = assessReliabilityMaintainability(request);
  assert.equal(resultValidator(emittedResult.domain_result), true, 'domain_result with evidence_kind: null must validate');

  // Domain input rejecting marker object as evidence_kind
  const markerInput = clone(request.domain_input);
  markerInput.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind = { source_native: true };
  assert.equal(inputValidator(markerInput), false, 'domain_input must reject marker object as evidence_kind');

  // Domain input rejecting missing evidence_kind
  const missingKindInput = clone(request.domain_input);
  delete missingKindInput.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind;
  assert.equal(inputValidator(missingKindInput), false, 'domain_input must reject omitted evidence_kind');

  // Domain input rejecting transport marker evidence_kind_projection
  const projectionInput = clone(request.domain_input);
  const rowWithProj = projectionInput.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  delete rowWithProj.evidence_kind;
  rowWithProj.evidence_kind_projection = 'source_native';
  assert.equal(inputValidator(projectionInput), false, 'direct domain_input must reject transport marker evidence_kind_projection');

  // Domain input rejecting hybrid row (both fields present)
  const hybridInput = clone(request.domain_input);
  hybridInput.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind_projection = 'source_native';
  assert.equal(inputValidator(hybridInput), false, 'direct domain_input must reject hybrid row');

  // Domain input rejecting disallowed null in non-nullable field
  const nullCaseIdInput = clone(request.domain_input);
  nullCaseIdInput.rows[0].case_id = null;
  assert.equal(inputValidator(nullCaseIdInput), false, 'domain_input must reject null case_id');

  // Direct runtime evaluation also rejects transport marker
  const directReqWithProj = clone(request);
  const directRow = directReqWithProj.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  delete directRow.evidence_kind;
  directRow.evidence_kind_projection = 'source_native';
  assert.throws(
    () => assessReliabilityMaintainability(directReqWithProj),
    (error) => error.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
    'direct runtime evaluation must reject evidence_kind_projection',
  );

  // Hand-built schema-valid TypedProjectFacts with literal null evidence_kind passes schema and runtime
  const handBuiltTypedFacts = clone(buildReliabilityMaintainabilityPublicSyntheticTypedFacts());
  const handBuiltRow = handBuiltTypedFacts.facts[0].domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  handBuiltRow.evidence_kind = null;
  handBuiltTypedFacts.facts_digest = coreFactsDigest(handBuiltTypedFacts.facts);
  assert.equal(typedFactsValidator(handBuiltTypedFacts), true, 'hand-built typed facts with literal null must validate against schema');
  const baseRuleset = compileReliabilityMaintainabilityRules([]).effective_rule_set;
  const handBuiltResult = reliabilityMaintainabilityAdapter.evaluate(baseRuleset, handBuiltTypedFacts);
  assert.equal(handBuiltResult.domain_result.results.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind, null);
  const handBuiltVerify = verifyReliabilityMaintainabilityResult(handBuiltResult, baseRuleset, handBuiltTypedFacts);
  assert.equal(handBuiltVerify.verified, true);
});

test('RED: Core adaptProjectEvidence envelope with evidence_kind_projection: "source_native" validates schema, evaluates literal null, and verifies', () => {
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const valid_at = '2026-08-26T00:00:00.000Z';
  const known_at = '2026-08-26T00:00:01.000Z';
  req.cutoffs = { ...req.cutoffs, valid_at, known_at };

  // Mutate request row: exactly evidence_kind_projection: 'source_native' and no evidence_kind
  const relRow = req.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  delete relRow.evidence_kind;
  relRow.evidence_kind_projection = 'source_native';

  const coreProjectBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'synthetic-rm-source-manifest-v1',
  };

  // Construct the REAL Core envelope with adaptProjectEvidence
  const realCoreEnvelope = adaptProjectEvidence(
    coreProjectBinding,
    {
      source_refs: ['synthetic-core-rm-source-v1'],
      observations: [req],
    },
    { valid_at, known_at },
  );
  const realCoreTypedFacts = realCoreEnvelope.typed_project_facts;

  // Verify the transport row structure in emitted Core TypedProjectFacts
  const emittedRow = realCoreTypedFacts.facts[0].domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  assert.equal(emittedRow.evidence_kind_projection, 'source_native');
  assert.equal(Object.hasOwn(emittedRow, 'evidence_kind'), false);

  // 1. Emitted TypedProjectFacts must validate against published E06 typed-facts schema
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const domainInputSchema = loadSchema('reliability_maintainability_domain_input_schema_v0.json');
  ajv.addSchema(domainInputSchema);
  const typedFactsSchema = loadSchema('reliability_maintainability_typed_facts_schema_v0.json');
  const typedFactsValidator = ajv.compile(typedFactsSchema);

  const schemaValid = typedFactsValidator(realCoreTypedFacts);
  assert.equal(schemaValid, true, `real Core typed facts must validate: ${JSON.stringify(typedFactsValidator.errors)}`);

  // 2. Adapter evaluation must output literal null
  const baseRuleset = compileReliabilityMaintainabilityRules([]).effective_rule_set;
  const result = reliabilityMaintainabilityAdapter.evaluate(baseRuleset, realCoreTypedFacts);
  const relResult = result.domain_result.results.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  assert.equal(relResult.evidence_kind, null, 'evaluation result must output literal null');
  assert.equal(relResult.state, 'satisfied');

  // 3. Trusted verifier must accept it
  const verification = verifyReliabilityMaintainabilityResult(result, baseRuleset, realCoreTypedFacts);
  assert.equal(verification.verified, true);
  assert.deepEqual(verification.digests, result.receipt.digests);
});

test('RED: transport row schema and runtime admission differential parity (omission, wrong marker, hybrid, objects, extras)', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const domainInputSchema = loadSchema('reliability_maintainability_domain_input_schema_v0.json');
  ajv.addSchema(domainInputSchema);
  const typedFactsSchema = loadSchema('reliability_maintainability_typed_facts_schema_v0.json');
  const typedFactsValidator = ajv.compile(typedFactsSchema);
  const baseRuleset = compileReliabilityMaintainabilityRules([]).effective_rule_set;

  function makeFacts(mutateRow, mutateDomainInput = null) {
    const facts = clone(buildReliabilityMaintainabilityPublicSyntheticTypedFacts());
    const row = facts.facts[0].domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
    mutateRow(row);
    if (mutateDomainInput) mutateDomainInput(facts.facts[0].domain_input);
    facts.facts_digest = coreFactsDigest(facts.facts);
    return facts;
  }

  // 1. Marker omission: missing both evidence_kind and evidence_kind_projection
  const omitted = makeFacts((row) => {
    delete row.evidence_kind;
    delete row.evidence_kind_projection;
  });
  assert.equal(typedFactsValidator(omitted), false, 'schema must reject row missing both evidence fields');
  assert.throws(
    () => admitReliabilityMaintainabilityTypedFacts(omitted),
    (err) => err.code === RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID,
    'runtime admission must reject row missing both evidence fields',
  );

  // 2. Wrong marker value: evidence_kind_projection is not 'source_native'
  const wrongMarker = makeFacts((row) => {
    delete row.evidence_kind;
    row.evidence_kind_projection = 'invalid_projection_marker';
  });
  assert.equal(typedFactsValidator(wrongMarker), false, 'schema must reject invalid evidence_kind_projection');
  assert.throws(
    () => admitReliabilityMaintainabilityTypedFacts(wrongMarker),
    (err) => err.code === RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID,
    'runtime admission must reject invalid evidence_kind_projection',
  );

  // 3. Marker object in evidence_kind_projection
  const markerObj = makeFacts((row) => {
    delete row.evidence_kind;
    row.evidence_kind_projection = { source_native: true };
  });
  assert.equal(typedFactsValidator(markerObj), false, 'schema must reject object in evidence_kind_projection');
  assert.throws(
    () => admitReliabilityMaintainabilityTypedFacts(markerObj),
    (err) => err.code === RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID,
    'runtime admission must reject object in evidence_kind_projection',
  );

  // 4. Hybrid row: both evidence_kind (valid enum string) and evidence_kind_projection
  const hybridString = makeFacts((row) => {
    row.evidence_kind = 'reliability_allocation_model';
    row.evidence_kind_projection = 'source_native';
  });
  assert.equal(typedFactsValidator(hybridString), false, 'schema must reject hybrid row with string evidence_kind + projection');
  assert.throws(
    () => admitReliabilityMaintainabilityTypedFacts(hybridString),
    (err) => err.code === RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID,
    'runtime admission must reject hybrid row with string evidence_kind + projection',
  );

  // 5. Hybrid row: both evidence_kind: null and evidence_kind_projection: 'source_native'
  const hybridNull = makeFacts((row) => {
    row.evidence_kind = null;
    row.evidence_kind_projection = 'source_native';
  });
  assert.equal(typedFactsValidator(hybridNull), false, 'schema must reject hybrid row with null evidence_kind + projection');
  assert.throws(
    () => admitReliabilityMaintainabilityTypedFacts(hybridNull),
    (err) => err.code === RM_ADMISSION_ERROR_CODES.TYPED_FACTS_INVALID,
    'runtime admission must reject hybrid row with null evidence_kind + projection',
  );

  // 6. Marker object in evidence_kind within TypedProjectFacts
  const markerKind = makeFacts((row) => {
    row.evidence_kind = { source_native: true };
    delete row.evidence_kind_projection;
  });
  assert.equal(typedFactsValidator(markerKind), false, 'schema must reject marker object in evidence_kind');
  assert.throws(
    () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset, markerKind),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_VOCABULARY_REFUSED',
    'runtime evaluation must reject marker object in evidence_kind as vocabulary refused',
  );

  // 7. Extra property in normal transport row
  const extraNormal = makeFacts((row) => {
    row.evidence_kind = 'reliability_allocation_model';
    row.unexpected_extra_property = true;
  });
  assert.equal(typedFactsValidator(extraNormal), false, 'schema must reject extra property in normal transport row');
  assert.throws(
    () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset, extraNormal),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
    'runtime evaluation must reject extra property in normal transport row',
  );

  // 8. Extra property in source-native transport row
  const extraSourceNative = makeFacts((row) => {
    delete row.evidence_kind;
    row.evidence_kind_projection = 'source_native';
    row.unexpected_extra_property = true;
  });
  assert.equal(typedFactsValidator(extraSourceNative), false, 'schema must reject extra property in source-native transport row');
  assert.throws(
    () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset, extraSourceNative),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
    'runtime evaluation must reject extra property in source-native transport row',
  );

  // 9. Extra property on domain_input container inside TypedProjectFacts
  const extraDomainInput = makeFacts(() => {}, (domainInput) => {
    domainInput.unexpected_container_property = true;
  });
  assert.equal(typedFactsValidator(extraDomainInput), false, 'schema must reject extra property on domain_input container');
  assert.throws(
    () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset, extraDomainInput),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
    'runtime evaluation must reject extra property on domain_input container',
  );
});
