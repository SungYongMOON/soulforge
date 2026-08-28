import test from "node:test";
import assert from "node:assert/strict";

import {
  arrayOrderRules,
  assembleEffectiveRuleSet,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { fieldFailureCorrectiveActionAdapter } from "../evaluator/field_failure_corrective_action_evaluator_adapter.mjs";
import {
  FFCA_EVALUATOR_ERROR_CODES,
} from "../evaluator/field_failure_corrective_action.mjs";
import {
  buildFieldFailureCorrectiveActionPublicSyntheticRequest,
  buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts,
} from "../fixtures/field_failure_corrective_action_public_synthetic.mjs";

const TYPED_FACTS_SCHEMA = "soulforge.typed_project_facts.v0";

function digestFacts(facts) {
  return sha256Hex("soulforge.project_observations.v0\n" + canonicalise(facts, arrayOrderRules(facts)));
}

function buildTypedFacts(overrides = {}) {
  const typed = structuredClone(buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts());
  const request = overrides.request || typed.facts[0];
  const facts = overrides.facts || [request];
  typed.facts = facts;
  typed.facts_digest = overrides.facts_digest || digestFacts(facts);
  typed.project_binding_ref = overrides.project_binding_ref || typed.project_binding_ref;
  typed.valid_at = overrides.valid_at || request.cutoffs.valid_at;
  typed.known_at = overrides.known_at || request.cutoffs.known_at;
  return typed;
}

function effectiveRules() {
  return assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    [],
    { scope_ref: "ffca-typed-facts-test-scope" },
  );
}

test("FFCA adapter accepts exact Core-shaped TypedProjectFacts and binds its receipt", () => {
  const typedFacts = buildTypedFacts();
  const result = fieldFailureCorrectiveActionAdapter.evaluate(effectiveRules(), typedFacts);
  assert.equal(result.counts.satisfied, 8);
  assert.deepEqual(result.receipt.typed_facts_binding, {
    schema_version: "soulforge.field_failure_corrective_action.typed_facts_receipt.v0",
    facts_digest: typedFacts.facts_digest,
    project_binding_ref: typedFacts.project_binding_ref,
    project_binding_revision_hash: typedFacts.project_binding_ref.binding_revision_hash,
    source_manifest_ref: typedFacts.project_binding_ref.source_manifest_ref,
    request_binding_digest: sha256Hex("soulforge.field_failure_corrective_action.project_binding.v0\n" + canonicalise(
      typedFacts.facts[0].binding,
      arrayOrderRules(typedFacts.facts[0].binding),
    )),
    request_input_digest: result.input_digest,
    valid_at: typedFacts.valid_at,
    known_at: typedFacts.known_at,
  });
});

test("FFCA adapter refuses raw, hybrid, stale, and project/time-mismatched facts", () => {
  const rawRequest = buildFieldFailureCorrectiveActionPublicSyntheticRequest();
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(effectiveRules(), rawRequest), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));

  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(effectiveRules(), {
    request: rawRequest,
    facts_digest: "not-a-digest",
  }), (error) => error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED);

  const stale = buildTypedFacts({ facts_digest: "b".repeat(64) });
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(effectiveRules(), stale), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));

  const projectMismatch = buildTypedFacts({
    project_binding_ref: {
      schema_version: "soulforge.project_binding.v0",
      project_id: "other-project",
      domain_engine_id: "field_failure_corrective_action",
      binding_revision_hash: "a".repeat(64),
      source_manifest_ref: typedFactsSourceManifestRef(),
    },
  });
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(effectiveRules(), projectMismatch), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));

  const timeMismatch = buildTypedFacts({ known_at: "2026-08-26T00:00:01.000Z" });
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(effectiveRules(), timeMismatch), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));
});

function typedFactsSourceManifestRef() {
  return buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts().project_binding_ref.source_manifest_ref;
}

test("FFCA adapter traps outer and deep wrapper accessors/proxies with one domain error", () => {
  const getterTrap = new Proxy({}, {
    get() {
      throw new Error("native getter escape");
    },
  });
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(effectiveRules(), getterTrap), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));

  const deepProxy = buildTypedFacts();
  deepProxy.facts = [new Proxy(buildFieldFailureCorrectiveActionPublicSyntheticRequest(), {})];
  deepProxy.facts_digest = digestFacts([buildFieldFailureCorrectiveActionPublicSyntheticRequest()]);
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(effectiveRules(), deepProxy), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));
});

test("FFCA adapter never ignores Core authority or cutoff arguments", () => {
  const typedFacts = buildTypedFacts();
  const effective = effectiveRules();
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(
    effective,
    typedFacts,
    { closure_approval_ref: "forged-approval" },
  ), (error) => error.code === FFCA_EVALUATOR_ERROR_CODES.FORBIDDEN_AUTHORITY_FIELD);

  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(
    effective,
    typedFacts,
    { unexpected_authority: "forged" },
  ), (error) => error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED);

  const explicit = fieldFailureCorrectiveActionAdapter.evaluate(
    effective,
    typedFacts,
    {},
    { valid_at: typedFacts.valid_at, known_at: typedFacts.known_at },
  );
  assert.deepEqual(explicit.receipt.admitted_cutoffs, {
    mode: "explicit_exact",
    valid_at: typedFacts.valid_at,
    known_at: typedFacts.known_at,
  });

  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(
    effective,
    typedFacts,
    {},
    { valid_at: "2026-08-26T00:00:01.000Z", known_at: typedFacts.known_at },
  ), (error) => error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED);

  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(
    effective,
    typedFacts,
    {},
    { valid_at: typedFacts.valid_at, known_at: typedFacts.known_at, forged: true },
  ), (error) => error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED);

  const cutoffTrap = new Proxy({}, { get() { throw new Error("cutoff trap"); } });
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(effective, typedFacts, {}, cutoffTrap), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
  ));
});

test("FFCA bound receipt changes across Core Profile/scope identity and rejects forged scope", () => {
  const typedFacts = buildTypedFacts();
  const profileA = {
    profile_kind: "organization",
    profile_id: "ffca-profile-a",
    domain_engine_id: "field_failure_corrective_action",
    revision_or_hash: "ffca-profile-a-r1",
    extends_or_base_pin: "ffca-base-v0",
    source_refs: ["ffca-profile-a-source"],
    operations: [],
    order: 0,
  };
  const profileB = {
    ...profileA,
    profile_id: "ffca-profile-b",
    revision_or_hash: "ffca-profile-b-r1",
    source_refs: ["ffca-profile-b-source"],
  };
  const assemblyA = assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    resolveProfileBindings(profileA, null),
    { scope_ref: "ffca-scope-a" },
  );
  const assemblyB = assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    resolveProfileBindings(profileB, null),
    { scope_ref: "ffca-scope-b" },
  );
  const resultA = fieldFailureCorrectiveActionAdapter.evaluate(assemblyA, typedFacts);
  const resultB = fieldFailureCorrectiveActionAdapter.evaluate(assemblyB, typedFacts);
  assert.notEqual(resultA.receipt.result_digest, resultB.receipt.result_digest);
  assert.notEqual(
    resultA.receipt.effective_rule_set_binding.profile_provenance_digest,
    resultB.receipt.effective_rule_set_binding.profile_provenance_digest,
  );

  const forgedScope = structuredClone(assemblyA);
  forgedScope.compilation_trace.compilation_scope.scope_ref = "forged-scope";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(forgedScope, typedFacts), (error) => (
    error.code === FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED
      || error.code === "FFCA_EFFECTIVE_RULESET_INVALID"
  ));
});
