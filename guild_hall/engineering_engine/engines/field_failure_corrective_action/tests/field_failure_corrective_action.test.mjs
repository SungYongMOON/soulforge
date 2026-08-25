import test from "node:test";
import assert from "node:assert/strict";

import { buildFieldFailureCorrectiveActionPublicSyntheticRequest } from "../fixtures/field_failure_corrective_action_public_synthetic.mjs";
import {
  assessFieldFailureCorrectiveAction,
  FFCA_EVALUATOR_ERROR_CODES,
} from "../evaluator/field_failure_corrective_action.mjs";
import { FFCA_FORBIDDEN_AUTHORITY_FIELDS } from "../rules/field_failure_corrective_action_vocabulary.mjs";

test("FFCA public synthetic fixture has deterministic zero-write assessment states", () => {
  const result = assessFieldFailureCorrectiveAction(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  assert.deepEqual(result.counts, {
    satisfied: 8,
    missing: 1,
    unknown: 1,
    conflict: 1,
    not_applicable: 0,
  });
  assert.equal(result.execution_effects.filesystem_writes, 0);
  assert.equal(result.execution_effects.network_calls, 0);
  assert.equal(result.case_summaries.find((row) => row.case_id === "CASE-READY").closure_readiness, "ready_for_human_decision");
});

test("FFCA refuses quality disposition and technical-change approval inputs", () => {
  for (const field of FFCA_FORBIDDEN_AUTHORITY_FIELDS) {
    const request = buildFieldFailureCorrectiveActionPublicSyntheticRequest();
    request[field] = "outside-engine-authority";
    assert.throws(() => assessFieldFailureCorrectiveAction(request), (error) => (
      error.code === FFCA_EVALUATOR_ERROR_CODES.FORBIDDEN_AUTHORITY_FIELD
    ));
  }
});

test("FFCA preserves unknown rather than converting it to missing", () => {
  const result = assessFieldFailureCorrectiveAction(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  const unknown = result.results.find((row) => row.row_id === "ROW-010");
  assert.equal(unknown.assessment_state, "unknown");
  assert.equal(unknown.reason_code, "applicability_or_observation_is_unresolved");
});

test("FFCA evaluates not-applicable, closure readiness, and no-change branches without granting closure authority", () => {
  const request = buildFieldFailureCorrectiveActionPublicSyntheticRequest();
  const containment = request.domain_input.rows.find((row) => row.row_id === "ROW-009");
  containment.applicability_state = "not_applicable";
  containment.observation_state = "unknown";
  containment.not_applicable_basis_ref = "basis-synthetic";

  const relatedChange = request.domain_input.rows.find((row) => row.row_id === "ROW-002");
  relatedChange.change_state = "not_required";
  relatedChange.evidence = { change_not_required_basis_ref: "change-basis-synthetic" };

  const result = assessFieldFailureCorrectiveAction(request);
  const notApplicable = result.results.find((row) => row.row_id === "ROW-009");
  assert.equal(notApplicable.assessment_state, "not_applicable");
  assert.equal(notApplicable.reason_code, "exact_not_applicable_basis_recorded");

  const change = result.results.find((row) => row.row_id === "ROW-002");
  assert.equal(change.assessment_state, "satisfied");

  const summaries = new Map(result.case_summaries.map((summary) => [summary.case_id, summary]));
  assert.equal(summaries.get("CASE-READY").closure_readiness, "ready_for_human_decision");
  for (const caseId of ["CASE-MISSING", "CASE-UNKNOWN", "CASE-CONFLICT"]) {
    assert.equal(summaries.get(caseId).closure_readiness, "not_ready", "case " + caseId + " must remain open");
  }
  for (const summary of result.case_summaries) {
    assert.equal(summary.requires_human_closure_decision, true);
  }
});
