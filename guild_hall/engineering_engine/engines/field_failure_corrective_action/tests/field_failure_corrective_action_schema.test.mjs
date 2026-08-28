import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import { buildFieldFailureCorrectiveActionPublicSyntheticRequest } from "../fixtures/field_failure_corrective_action_public_synthetic.mjs";
import {
  assessFieldFailureCorrectiveAction,
  FFCA_EVALUATOR_ERROR_CODES,
} from "../evaluator/field_failure_corrective_action.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(HERE, "..", "schemas", "field_failure_corrective_action_schema_v0.json");

function createValidator() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

test("FFCA schema strictly compiles and accepts the full public synthetic request", () => {
  const validate = createValidator();
  const request = buildFieldFailureCorrectiveActionPublicSyntheticRequest();
  assert.equal(validate(request), true, JSON.stringify(validate.errors));
});

test("FFCA schema rejects omitted, extra, and malformed nested public request fields", () => {
  const validate = createValidator();

  const omitted = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  delete omitted.binding.project_binding_ref;
  assert.equal(validate(omitted), false, "binding provenance omission must fail schema");

  const extra = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  extra.forged_authority = "unexpected";
  assert.equal(validate(extra), false, "root extra authority must fail schema");

  const malformedSource = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  malformedSource.binding.source_bindings[0].source_id = "S9-UNKNOWN";
  assert.equal(validate(malformedSource), false, "unknown source binding must fail schema");

  const malformedRow = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  delete malformedRow.domain_input.rows[0].links.configuration_refs;
  assert.equal(validate(malformedRow), false, "omitted link group must fail schema");

  const extraEvidence = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  extraEvidence.domain_input.rows[0].evidence.forged_evidence_ref = "unexpected";
  assert.equal(validate(extraEvidence), false, "extra rule evidence must fail schema");

  const missingEvidence = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  delete missingEvidence.domain_input.rows[0].evidence.action_owner_ref;
  assert.equal(validate(missingEvidence), false, "omitted rule evidence must fail schema");
});

test("FFCA schema accepts evaluator-valid not-applicable and related-change branches", () => {
  const validate = createValidator();

  const notApplicable = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  const containment = notApplicable.domain_input.rows.find((row) => row.row_id === "ROW-009");
  containment.applicability_state = "not_applicable";
  containment.observation_state = "unknown";
  containment.not_applicable_basis_ref = "basis-synthetic";
  assert.equal(validate(notApplicable), true, JSON.stringify(validate.errors));

  const notRequired = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  const changeNotRequired = notRequired.domain_input.rows.find((row) => row.row_id === "ROW-002");
  changeNotRequired.change_state = "not_required";
  changeNotRequired.evidence = { change_not_required_basis_ref: "change-basis-synthetic" };
  assert.equal(validate(notRequired), true, JSON.stringify(validate.errors));

  const unknownChange = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  const changeUnknown = unknownChange.domain_input.rows.find((row) => row.row_id === "ROW-002");
  changeUnknown.change_state = "unknown";
  changeUnknown.evidence = {};
  assert.equal(validate(unknownChange), true, JSON.stringify(validate.errors));
});

test("FFCA schema and evaluator reject mixed-case floating revisions identically", () => {
  const validate = createValidator();
  const request = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  request.binding.source_bindings[0].source_revision_ref = "ecfr-LATEST-v1";
  assert.equal(validate(request), false, "schema must reject evaluator-floating mixed-case revision");
  assert.throws(() => assessFieldFailureCorrectiveAction(request), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED
  ));
});
