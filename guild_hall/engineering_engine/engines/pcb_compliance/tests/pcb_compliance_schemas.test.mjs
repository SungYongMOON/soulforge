import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

import { AUTHORITY_FAMILIES } from "../../../core/validators/authority.mjs";
import { compilePcbComplianceRules } from "../compiler/pcb_compliance_compiler_adapter.mjs";
import { calculatePcbCoreTypedFactsDigest, pcbComplianceAdapter } from "../evaluator/pcb_compliance_evaluator_adapter.mjs";
import { assessPcbCompliance } from "../evaluator/pcb_compliance.mjs";
import { buildPcbCompliancePublicSyntheticRequest } from "../fixtures/pcb_compliance_public_synthetic.mjs";
import { createProjectBindingAdapter } from "../../../core/interfaces/project_binding_adapter.mjs";
import { assembleEffectiveRuleSet, evaluate, resolveProfileBindings } from "../../../core/interfaces/domain_engine_adapter.mjs";

const SCHEMA_FILES = Object.freeze([
  "pcb_compliance_schema_v0.json",
  "pcb_compliance_ruleset_schema_v0.json",
  "pcb_compliance_domain_input_schema_v0.json",
  "pcb_compliance_request_schema_v0.json",
  "pcb_compliance_assessment_schema_v0.json",
  "pcb_compliance_domain_result_schema_v0.json",
  "pcb_compliance_receipt_schema_v0.json",
]);

function loadSchema(name) {
  return JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8"));
}

test("closed PCB compliance schemas compile, validate runtime payloads, and reject additional properties/schema swaps", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const file of SCHEMA_FILES) {
    ajv.addSchema(loadSchema(file));
  }
  const validators = new Map(SCHEMA_FILES.map((file) => [file, ajv.getSchema(loadSchema(file).$id)]));

  const engineDescriptor = parseYaml(readFileSync(new URL("../engine.yaml", import.meta.url), "utf8"));
  const baseRuleset = compilePcbComplianceRules();
  const request = buildPcbCompliancePublicSyntheticRequest();
  const directResult = assessPcbCompliance(request);

  const bindingAdapter = createProjectBindingAdapter("pcb_compliance", {
    schema_version: "soulforge.project_binding.v0",
    project_id: "public_synthetic_pcb",
    binding_revision_hash: "b".repeat(64),
    source_manifest_ref: "public-synthetic-manifest-v0",
  });
  const adapted = bindingAdapter.adaptEvidence({
    snapshot_id: "pcb_synthetic_snapshot_v0",
    source_refs: ["public-synthetic-source-v0"],
    observations: [{
      fact_type: "pcb_compliance_evaluation_request",
      request,
    }],
  }, {
    valid_at: "2026-08-26T00:00:00.000Z",
    known_at: "2026-08-26T00:00:00.000Z",
  });
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  const coreResult = evaluate(pcbComplianceAdapter, effective, adapted.typed_project_facts);

  const payloads = new Map([
    ["pcb_compliance_schema_v0.json", engineDescriptor],
    ["pcb_compliance_ruleset_schema_v0.json", baseRuleset],
    ["pcb_compliance_domain_input_schema_v0.json", request.domain_input],
    ["pcb_compliance_request_schema_v0.json", request],
    ["pcb_compliance_assessment_schema_v0.json", directResult.assessment],
    ["pcb_compliance_domain_result_schema_v0.json", coreResult.domain_result],
    ["pcb_compliance_receipt_schema_v0.json", coreResult.receipt],
  ]);

  for (const [file, validate] of validators) {
    assert.equal(typeof validate, "function", `validator for ${file} must exist`);
    assert.equal(validate(payloads.get(file)), true, `${file}: ${JSON.stringify(validate.errors)}`);
  }

  for (const schemaId of Object.values(engineDescriptor.schemas)) {
    assert.equal(typeof ajv.getSchema(schemaId), "function", `schema ${schemaId} must be registered`);
  }

  // Reject additional properties on descriptor
  const descriptorValidator = validators.get("pcb_compliance_schema_v0.json");
  const extraDescriptor = { ...structuredClone(engineDescriptor), unexpected_prop: "invalid" };
  assert.equal(descriptorValidator(extraDescriptor), false);
  assert.ok(descriptorValidator.errors.some((e) => e.keyword === "additionalProperties"));

  // Reject additional properties on ruleset
  const rulesetValidator = validators.get("pcb_compliance_ruleset_schema_v0.json");
  const extraRuleset = { ...structuredClone(baseRuleset), unexpected_prop: "invalid" };
  assert.equal(rulesetValidator(extraRuleset), false);

  // Reject forged claim ceiling
  const forgedRuleset = structuredClone(baseRuleset);
  forgedRuleset.rules[0].claim_ceiling = "workmanship_compliance";
  assert.equal(rulesetValidator(forgedRuleset), false);

  // Reject additional properties on request
  const requestValidator = validators.get("pcb_compliance_request_schema_v0.json");
  const extraRequest = { ...structuredClone(request), unexpected_prop: "invalid" };
  assert.equal(requestValidator(extraRequest), false);

  // Reject non-millisecond timestamps on request cutoffs
  const omittedFraction = structuredClone(request);
  omittedFraction.cutoffs.valid_at = "2026-08-26T00:00:00Z";
  assert.equal(requestValidator(omittedFraction), false);

  // Reject additional properties on assessment
  const assessmentValidator = validators.get("pcb_compliance_assessment_schema_v0.json");
  const extraAssessment = { ...structuredClone(directResult.assessment), unexpected_prop: "invalid" };
  assert.equal(assessmentValidator(extraAssessment), false);

  // Reject forged overall_state on assessment
  const forgedAssessment = structuredClone(directResult.assessment);
  forgedAssessment.overall_state = "PASSED";
  assert.equal(assessmentValidator(forgedAssessment), false);

  // Reject additional properties on domain_result
  const domainResultValidator = validators.get("pcb_compliance_domain_result_schema_v0.json");
  const extraDomainResult = { ...structuredClone(coreResult.domain_result), unexpected_prop: "invalid" };
  assert.equal(domainResultValidator(extraDomainResult), false);

  // Reject forged product_acceptance on domain_result
  const forgedDomainResult = structuredClone(coreResult.domain_result);
  forgedDomainResult.product_acceptance = "ACCEPTED";
  assert.equal(domainResultValidator(forgedDomainResult), false);

  // Reject additional properties on receipt
  const receiptValidator = validators.get("pcb_compliance_receipt_schema_v0.json");
  const extraReceipt = { ...structuredClone(coreResult.receipt), unexpected_prop: "invalid" };
  assert.equal(receiptValidator(extraReceipt), false);

  // Reject non-zero effects in receipt
  const forgedReceipt = structuredClone(coreResult.receipt);
  forgedReceipt.effects.filesystem_writes = 1;
  assert.equal(receiptValidator(forgedReceipt), false);

  // Reject schema cross-swaps
  assert.equal(rulesetValidator(request), false, "request must not validate as ruleset");
  assert.equal(requestValidator(directResult.assessment), false, "assessment must not validate as request");
  assert.equal(assessmentValidator(coreResult.receipt), false, "receipt must not validate as assessment");
  assert.equal(domainResultValidator(engineDescriptor), false, "descriptor must not validate as domain_result");
});

test("derived ruleset and derived domain result with observed claim ceiling validate against schemas", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const file of SCHEMA_FILES) {
    ajv.addSchema(loadSchema(file));
  }
  const rulesetValidator = ajv.getSchema("soulforge.pcb_compliance.ruleset.v0");
  const domainResultValidator = ajv.getSchema("soulforge.pcb_compliance.domain_result.v0");

  const orgProfile = {
    profile_kind: "organization",
    profile_id: "pcb_public_synthetic_org",
    domain_engine_id: "pcb_compliance",
    revision_or_hash: "pcb_public_synthetic_org_v1",
    extends_or_base_pin: "pcb_compliance:v0",
    source_refs: ["synthetic-profile-source-v1"],
    operations: [{
      op: "add",
      rule: {
        rule_id: "PCB-PROFILE-01",
        source_ref: "synthetic-profile-source-v1",
        source_locator: "synthetic:1",
        source_modality: "synthetic fixture only",
        coverage_area: "inspection",
        required_authority_families: ["project_contract_baseline"],
        expected_evidence_keys: ["synthetic_evidence_ref"],
        allowed_artifact_tokens: [null],
        controlled_clause_hold: false,
      },
    }],
    order: 0,
  };

  const derivedRuleset = compilePcbComplianceRules(resolveProfileBindings(orgProfile, null));
  assert.equal(rulesetValidator(derivedRuleset), true, `${JSON.stringify(rulesetValidator.errors)}`);

  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(orgProfile, null), {});
  const req = buildPcbCompliancePublicSyntheticRequest();
  req.binding.ruleset_ref = { ...effective.effective_rule_set.ruleset_ref };
  req.domain_input.rows.push({
    case_id: "p1e_synthetic_org_pcb_profile_01",
    rule_id: "PCB-PROFILE-01",
    applicability: {
      approval_scope: true,
      document_revision: true,
      jurisdiction: true,
      project_binding: true,
      time_window: true,
    },
    authority_bindings: [{ family: "project_contract_baseline", authority_ref: "AUTH-NASA-STD-001" }],
    observation: {
      attempted: true,
      evidence_state: "present",
      evidence_by_key: {
        synthetic_evidence_ref: ["synthetic_profile_evidence"],
      },
    },
    standard_binding: null,
  });

  const bindingAdapter = createProjectBindingAdapter("pcb_compliance", {
    schema_version: "soulforge.project_binding.v0",
    project_id: "public_synthetic_pcb",
    binding_revision_hash: "b".repeat(64),
    source_manifest_ref: "public-synthetic-manifest-v0",
  });
  const adapted = bindingAdapter.adaptEvidence({
    snapshot_id: "pcb_synthetic_snapshot_v0",
    source_refs: ["public-synthetic-source-v0"],
    observations: [{ fact_type: "pcb_compliance_evaluation_request", request: req }],
  }, { valid_at: "2026-08-26T00:00:00.000Z", known_at: "2026-08-26T00:00:00.000Z" });

  const coreResult = evaluate(pcbComplianceAdapter, effective, adapted.typed_project_facts);
  assert.equal(coreResult.domain_result.claim_ceiling, "observed");
  assert.equal(domainResultValidator(coreResult.domain_result), true, `${JSON.stringify(domainResultValidator.errors)}`);
});

test("differential: runtime enforces semantic invariants beyond syntactic JSON Schema validation", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const file of SCHEMA_FILES) {
    ajv.addSchema(loadSchema(file));
  }
  const requestValidator = ajv.getSchema("soulforge.pcb_compliance.request.v0");

  // 1. Invalid calendar date (Feb 30) matches JSON Schema regex pattern ^[0-9]{4}-[0-9]{2}-[0-9]{2}T...
  const reqWithFeb30 = buildPcbCompliancePublicSyntheticRequest();
  reqWithFeb30.cutoffs.valid_at = "2026-02-30T00:00:00.000Z";
  reqWithFeb30.cutoffs.known_at = "2026-02-30T00:00:00.000Z";
  // Syntactic schema check passes regex
  assert.equal(requestValidator(reqWithFeb30), true, "syntactic schema accepts calendar-impossible date format");
  // Semantic runtime rejects it
  assert.throws(
    () => assessPcbCompliance(reqWithFeb30),
    (error) => error.code === "PCB_INPUT_REFUSED",
    "runtime must reject non-existent calendar date",
  );

  // 2. Duplicate authority family in authority_bindings
  const reqWithDupFamily = buildPcbCompliancePublicSyntheticRequest();
  reqWithDupFamily.domain_input.rows[0].authority_bindings = [
    { family: "project_contract_baseline", authority_ref: "AUTH-1" },
    { family: "project_contract_baseline", authority_ref: "AUTH-2" },
  ];
  const inputValidator = ajv.getSchema("soulforge.pcb_compliance.domain_input.v0");
  assert.equal(inputValidator(reqWithDupFamily.domain_input), true, "syntactic schema accepts array with duplicate family");
  assert.throws(
    () => assessPcbCompliance(reqWithDupFamily),
    (error) => error.code === "PCB_INPUT_REFUSED",
    "runtime must reject duplicate authority family",
  );

  // 3. Unknown evidence key in observation.evidence_by_key
  const reqWithUnknownKey = buildPcbCompliancePublicSyntheticRequest();
  reqWithUnknownKey.domain_input.rows[0].observation.evidence_by_key.unregistered_extraneous_key = ["DOC-NASA-001"];
  assert.equal(inputValidator(reqWithUnknownKey.domain_input), true, "syntactic schema accepts additional property keys in evidence_by_key");
  assert.throws(
    () => assessPcbCompliance(reqWithUnknownKey),
    (error) => error.code === "PCB_INPUT_REFUSED",
    "runtime must reject unregistered evidence keys",
  );

  // 4. Alternate host IP normalization (http://127.1/admin) matches syntactic string regex, but runtime WHATWG URL normalization fails closed
  const reqWithAlternateIp = buildPcbCompliancePublicSyntheticRequest();
  reqWithAlternateIp.domain_input.rows[0].authority_bindings[0].authority_ref = "http://127.1/admin";
  assert.equal(inputValidator(reqWithAlternateIp.domain_input), true, "syntactic schema accepts alternate IP URL string");
  assert.throws(
    () => assessPcbCompliance(reqWithAlternateIp),
    (error) => {
      assert.equal(error.code, "PCB_INPUT_REFUSED");
      assert.ok(!error.message.includes("http://127.1/admin"), "error message must not echo hostile value");
      return true;
    },
    "runtime must reject normalized alternate loopback host",
  );
});

test("regression: schemas and runtime strictly align with Core AUTHORITY_FAMILIES registry and reject invented families", () => {
  const coreFamilyKeys = AUTHORITY_FAMILIES.map((f) => f.key);
  const coreFamilySet = new Set(coreFamilyKeys);

  const rulesetSchema = loadSchema("pcb_compliance_ruleset_schema_v0.json");
  const domainInputSchema = loadSchema("pcb_compliance_domain_input_schema_v0.json");
  const domainResultSchema = loadSchema("pcb_compliance_domain_result_schema_v0.json");

  // 1. Assert schema enum sets exactly equal Core AUTHORITY_FAMILIES keys
  const rulesetAuthProp = rulesetSchema.$defs.rule.properties.required_authority_families;
  assert.equal(rulesetAuthProp.minItems, 1);
  assert.equal(rulesetAuthProp.uniqueItems, true);
  const rulesetEnums = rulesetAuthProp.items.enum;
  assert.equal(rulesetEnums.length, coreFamilyKeys.length);
  assert.deepEqual(new Set(rulesetEnums), coreFamilySet);

  const inputAuthProp = domainInputSchema.$defs.authority_binding.properties.family;
  const inputEnums = inputAuthProp.enum;
  assert.equal(inputEnums.length, coreFamilyKeys.length);
  assert.deepEqual(new Set(inputEnums), coreFamilySet);

  const resultAuthProp = domainResultSchema.$defs.project_binding_ref.properties.authority_family;
  const resultEnums = resultAuthProp.enum;
  assert.equal(resultEnums.length, coreFamilyKeys.length);
  assert.deepEqual(new Set(resultEnums), coreFamilySet);

  // Setup Ajv validators
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const file of SCHEMA_FILES) {
    ajv.addSchema(loadSchema(file));
  }
  const rulesetValidator = ajv.getSchema("soulforge.pcb_compliance.ruleset.v0");
  const domainInputValidator = ajv.getSchema("soulforge.pcb_compliance.domain_input.v0");
  const domainResultValidator = ajv.getSchema("soulforge.pcb_compliance.domain_result.v0");

  // 2. Actual runtime payload using reviewed_wiki must schema-validate and evaluate GREEN
  const wikiProfile = {
    profile_kind: "organization",
    profile_id: "pcb_wiki_org",
    domain_engine_id: "pcb_compliance",
    revision_or_hash: "pcb_wiki_org_v1",
    extends_or_base_pin: "pcb_compliance:v0",
    source_refs: ["wiki-profile-source-v1"],
    operations: [{
      op: "add",
      rule: {
        rule_id: "PCB-PROFILE-WIKI-01",
        source_ref: "wiki-profile-source-v1",
        source_locator: "wiki:1",
        source_modality: "reviewed wiki guidance fixture",
        coverage_area: "inspection",
        required_authority_families: ["reviewed_wiki"],
        expected_evidence_keys: ["wiki_evidence_ref"],
        allowed_artifact_tokens: [null],
        controlled_clause_hold: false,
      },
    }],
    order: 0,
  };
  const wikiCompiled = compilePcbComplianceRules(resolveProfileBindings(wikiProfile, null));
  assert.equal(rulesetValidator(wikiCompiled), true, `compiled ruleset with reviewed_wiki must pass schema: ${JSON.stringify(rulesetValidator.errors)}`);

  const effectiveWiki = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(wikiProfile, null), {});
  const wikiRequest = buildPcbCompliancePublicSyntheticRequest();
  wikiRequest.binding.ruleset_ref = { ...effectiveWiki.effective_rule_set.ruleset_ref };
  wikiRequest.domain_input.rows.push({
    case_id: "pcb_wiki_case",
    rule_id: "PCB-PROFILE-WIKI-01",
    applicability: {
      approval_scope: true,
      document_revision: true,
      jurisdiction: true,
      project_binding: true,
      time_window: true,
    },
    authority_bindings: [{ family: "reviewed_wiki", authority_ref: "wiki_ref_01" }],
    observation: {
      attempted: true,
      evidence_state: "present",
      evidence_by_key: {
        wiki_evidence_ref: ["wiki_evidence_doc_1"],
      },
    },
  });
  assert.equal(domainInputValidator(wikiRequest.domain_input), true, `domain_input with reviewed_wiki must pass schema: ${JSON.stringify(domainInputValidator.errors)}`);

  const wikiTypedFacts = {
    schema_version: "soulforge.typed_project_facts.v0",
    project_binding_ref: {
      schema_version: "soulforge.project_binding.v0",
      project_id: "public_synthetic_pcb",
      domain_engine_id: "pcb_compliance",
      binding_revision_hash: "b".repeat(64),
      source_manifest_ref: "public-synthetic-manifest-v0",
      authority_family: "reviewed_wiki",
    },
    facts: [{
      fact_type: "pcb_compliance_evaluation_request",
      request: wikiRequest,
    }],
    facts_digest: "a".repeat(64),
    valid_at: "2026-08-26T00:00:00.000Z",
    known_at: "2026-08-26T00:00:00.000Z",
  };
  wikiTypedFacts.facts_digest = calculatePcbCoreTypedFactsDigest(wikiTypedFacts.facts);

  const wikiCoreResult = evaluate(pcbComplianceAdapter, effectiveWiki, wikiTypedFacts);
  assert.equal(wikiCoreResult.domain_result.claim_ceiling, "observed");
  assert.equal(domainResultValidator(wikiCoreResult.domain_result), true, `domain_result with reviewed_wiki must pass schema: ${JSON.stringify(domainResultValidator.errors)}`);

  // 3. Each invented value must fail schema and runtime
  const INVENTED_FAMILIES = [
    "quality_management_system",
    "regulatory_oversight",
    "safety_authority",
    "technical_authority",
  ];

  for (const invented of INVENTED_FAMILIES) {
    // (a) Schema: ruleset with invented required_authority_family
    const badRuleset = structuredClone(wikiCompiled);
    badRuleset.rules[0].required_authority_families = [invented];
    assert.equal(rulesetValidator(badRuleset), false, `ruleset schema must reject invented family ${invented}`);

    // (b) Runtime: compiler rejects profile with invented required_authority_family
    const badProfile = structuredClone(wikiProfile);
    badProfile.operations[0].rule.required_authority_families = [invented];
    assert.throws(
      () => compilePcbComplianceRules(resolveProfileBindings(badProfile, null)),
      (error) => error.code === "PCB_PROFILE_RULE_INVALID",
      `compiler runtime must reject invented family ${invented}`,
    );

    // (c) Schema: domain_input with invented authority_binding family
    const badInput = structuredClone(wikiRequest.domain_input);
    badInput.rows[0].authority_bindings = [{ family: invented, authority_ref: "ref-1" }];
    assert.equal(domainInputValidator(badInput), false, `domain_input schema must reject invented family ${invented}`);

    // (d) Runtime: assessPcbCompliance rejects invented authority_binding family
    const badReq = structuredClone(wikiRequest);
    badReq.domain_input.rows[0].authority_bindings = [{ family: invented, authority_ref: "ref-1" }];
    assert.throws(
      () => assessPcbCompliance(badReq, effectiveWiki),
      (error) => error.code === "PCB_INPUT_REFUSED",
      `assessPcbCompliance runtime must reject invented family ${invented}`,
    );

    // (e) Schema: domain_result with invented project_binding_ref.authority_family
    const badResult = structuredClone(wikiCoreResult.domain_result);
    badResult.project_facts_provenance.project_binding_ref.authority_family = invented;
    assert.equal(domainResultValidator(badResult), false, `domain_result schema must reject invented family ${invented}`);

    // (f) Runtime: evaluator rejects typed facts with invented authority_family
    const badFacts = structuredClone(wikiTypedFacts);
    badFacts.project_binding_ref.authority_family = invented;
    badFacts.facts_digest = calculatePcbCoreTypedFactsDigest(badFacts.facts);
    assert.throws(
      () => evaluate(pcbComplianceAdapter, effectiveWiki, badFacts),
      (error) => error.code === "PCB_TYPED_FACTS_INVALID",
      `evaluate runtime must reject invented authority_family ${invented}`,
    );
  }

  // 4. Schema minItems:1 and uniqueItems:true on required_authority_families
  const emptyFamRuleset = structuredClone(wikiCompiled);
  emptyFamRuleset.rules[0].required_authority_families = [];
  assert.equal(rulesetValidator(emptyFamRuleset), false, "ruleset schema must reject empty required_authority_families");

  const dupFamRuleset = structuredClone(wikiCompiled);
  dupFamRuleset.rules[0].required_authority_families = ["reviewed_wiki", "reviewed_wiki"];
  assert.equal(rulesetValidator(dupFamRuleset), false, "ruleset schema must reject duplicate required_authority_families");
});
