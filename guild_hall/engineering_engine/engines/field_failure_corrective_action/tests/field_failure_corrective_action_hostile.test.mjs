import test from "node:test";
import assert from "node:assert/strict";

import {
  assessFieldFailureCorrectiveAction,
  FFCA_EVALUATOR_ERROR_CODES,
} from "../evaluator/field_failure_corrective_action.mjs";
import { buildFieldFailureCorrectiveActionPublicSyntheticRequest } from "../fixtures/field_failure_corrective_action_public_synthetic.mjs";

const copy = () => JSON.parse(JSON.stringify(buildFieldFailureCorrectiveActionPublicSyntheticRequest()));

function deeplyFrozen(value) {
  assert.ok(Object.isFrozen(value));
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deeplyFrozen(child);
  }
}

test("FFCA replay has the same digest and no mutable result object", () => {
  const first = assessFieldFailureCorrectiveAction(copy());
  const second = assessFieldFailureCorrectiveAction(copy());
  assert.deepEqual(first, second);
  assert.equal(first.receipt.input_digest, second.receipt.input_digest);
  assert.equal(first.receipt.result_digest, second.receipt.result_digest);
  deeplyFrozen(first);
});

test("FFCA rejects floating source binding revisions and unlinked affected items", () => {
  const floating = copy();
  floating.binding.source_bindings[0].source_revision_ref = "latest";
  assert.throws(() => assessFieldFailureCorrectiveAction(floating), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED
  ));

  const unlinked = copy();
  unlinked.domain_input.rows[0].links.affected_asset_refs = [];
  unlinked.domain_input.rows[0].links.affected_lot_refs = [];
  assert.throws(() => assessFieldFailureCorrectiveAction(unlinked), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));
});

test("FFCA rejects mixed-case floating revisions and wraps Core cutoff errors in the FFCA contract", () => {
  const floating = copy();
  floating.binding.source_bindings[0].source_revision_ref = "ecfr-LATEST-v1";
  assert.throws(() => assessFieldFailureCorrectiveAction(floating), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED
  ));

  const malformedCutoff = copy();
  malformedCutoff.cutoffs.valid_at = "not-a-canonical-instant";
  assert.throws(() => assessFieldFailureCorrectiveAction(malformedCutoff), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));
});

test("FFCA rejects accessor-backed payloads before assessment", () => {
  const request = copy();
  Object.defineProperty(request.domain_input.rows[0].links, "configuration_refs", {
    enumerable: true,
    get() { return ["config-hidden"]; },
  });
  assert.throws(() => assessFieldFailureCorrectiveAction(request), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));
});

test("FFCA reports an unresolved related change as unknown without inventing approval", () => {
  const request = copy();
  const row = request.domain_input.rows.find((candidate) => candidate.row_id === "ROW-002");
  row.change_state = "unknown";
  row.evidence = {};
  const result = assessFieldFailureCorrectiveAction(request);
  const change = result.results.find((candidate) => candidate.row_id === "ROW-002");
  assert.equal(change.assessment_state, "unknown");
  assert.equal(change.reason_code, "related_change_need_is_unresolved");
  assert.equal(result.authority_boundary.technical_change_approval, "outside_engine");
});
