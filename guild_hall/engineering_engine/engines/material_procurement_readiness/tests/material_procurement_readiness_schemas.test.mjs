import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

import { compileMaterialProcurementReadinessRules } from "../compiler/material_procurement_readiness_compiler_adapter.mjs";
import { materialProcurementReadinessAdapter } from "../evaluator/material_procurement_readiness_evaluator_adapter.mjs";
import { adaptMaterialProcurementProjectEvidence } from "../evaluator/material_procurement_project_evidence_adapter.mjs";
import { buildMaterialProcurementReadinessPublicSyntheticEvidenceInput } from "../fixtures/material_procurement_readiness_public_synthetic.mjs";

const SCHEMA_FILES = Object.freeze([
  "material_procurement_readiness_schema_v0.json",
  "material_procurement_readiness_ruleset_schema_v0.json",
  "material_procurement_readiness_project_binding_schema_v0.json",
  "material_procurement_readiness_typed_facts_schema_v1.json",
  "material_procurement_readiness_observation_receipt_schema_v0.json",
  "material_procurement_readiness_assessment_schema_v0.json",
  "material_procurement_readiness_domain_result_schema_v0.json",
  "material_procurement_readiness_evaluation_receipt_schema_v0.json",
]);

function schema(name) {
  return JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8"));
}

test("closed E03 schemas compile, validate runtime payloads, and reject additional properties/schema swaps", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validators = new Map(SCHEMA_FILES.map((file) => [file, ajv.compile(schema(file))]));
  const engineDescriptor = parseYaml(readFileSync(new URL("../engine.yaml", import.meta.url), "utf8"));
  const adapted = adaptMaterialProcurementProjectEvidence(buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("READY_INBOUND"));
  const compiled = compileMaterialProcurementReadinessRules();
  const result = materialProcurementReadinessAdapter.evaluate(
    compiled.effective_rule_set,
    adapted.typed_project_facts,
    {},
    { valid_at: adapted.typed_project_facts.valid_at, known_at: adapted.typed_project_facts.known_at },
  );
  const payloads = new Map([
    ["material_procurement_readiness_schema_v0.json", engineDescriptor],
    ["material_procurement_readiness_ruleset_schema_v0.json", compiled.effective_rule_set],
    ["material_procurement_readiness_project_binding_schema_v0.json", adapted.typed_project_facts.project_binding],
    ["material_procurement_readiness_typed_facts_schema_v1.json", adapted.typed_project_facts],
    ["material_procurement_readiness_observation_receipt_schema_v0.json", adapted.observation_receipt],
    ["material_procurement_readiness_assessment_schema_v0.json", result.assessment],
    ["material_procurement_readiness_domain_result_schema_v0.json", result.domain_result],
    ["material_procurement_readiness_evaluation_receipt_schema_v0.json", result.receipt],
  ]);

  for (const [file, validate] of validators) {
    assert.equal(validate(payloads.get(file)), true, `${file}: ${JSON.stringify(validate.errors)}`);
  }

  for (const schemaId of Object.values(engineDescriptor.schemas)) {
    assert.equal(typeof ajv.getSchema(schemaId), "function", schemaId);
  }

  const extraTypedFacts = { ...structuredClone(adapted.typed_project_facts), unexpected: true };
  const typedValidator = validators.get("material_procurement_readiness_typed_facts_schema_v1.json");
  assert.equal(typedValidator(extraTypedFacts), false);
  assert.ok(typedValidator.errors.some((error) => error.keyword === "additionalProperties"));
  const malformedTimestamp = structuredClone(adapted.typed_project_facts);
  malformedTimestamp.valid_at = "2026-12-01T24:00:00.000Z";
  assert.equal(typedValidator(malformedTimestamp), false);
  const omittedFraction = structuredClone(adapted.typed_project_facts);
  omittedFraction.valid_at = "2026-10-10T00:00:00Z";
  assert.equal(typedValidator(omittedFraction), false);

  const bindingValidator = validators.get("material_procurement_readiness_project_binding_schema_v0.json");
  assert.equal(bindingValidator(adapted.typed_project_facts), false);

  const domainValidator = validators.get("material_procurement_readiness_domain_result_schema_v0.json");
  for (const [path, value] of [
    [["rows", 0, "purchase_order_state"], "forged"],
    [["rows", 0, "decision_basis", "rule_ids"], ["MPR-FORGED"]],
    [["rows", 0, "decision_basis", "fact_fields_used"], ["forged_fact"]],
    [["rows", 0, "decision_basis", "package_source_refs"], ["FORGED-SOURCE"]],
  ]) {
    const forged = structuredClone(result.domain_result);
    let cursor = forged;
    for (const key of path.slice(0, -1)) cursor = cursor[key];
    cursor[path.at(-1)] = value;
    assert.equal(domainValidator(forged), false, path.join("."));
  }

  const engineDescriptorText = readFileSync(new URL("../engine.yaml", import.meta.url), "utf8");
  for (const declared of [
    "descriptor: soulforge.material_procurement_readiness.domain_descriptor.v0",
    "project_binding: soulforge.material_procurement_readiness.project_binding.v0",
    "typed_project_facts: soulforge.material_procurement_readiness.typed_project_facts.v1",
    "observation_receipt: soulforge.material_procurement_readiness.observation_receipt.v0",
    "evaluation_receipt: soulforge.material_procurement_readiness.evaluation_receipt.v0",
    "project_evidence_adapter: engines/material_procurement_readiness/evaluator/material_procurement_project_evidence_adapter.mjs",
  ]) {
    assert.match(engineDescriptorText, new RegExp(declared.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const descriptorValidator = validators.get("material_procurement_readiness_schema_v0.json");
  const descriptorExtra = { ...structuredClone(engineDescriptor), unexpected: true };
  assert.equal(descriptorValidator(descriptorExtra), false);
  const schemaIdMismatch = structuredClone(engineDescriptor);
  schemaIdMismatch.schemas.typed_project_facts = "soulforge.material_procurement_readiness.typed_project_facts.v0";
  assert.equal(descriptorValidator(schemaIdMismatch), false);
});
