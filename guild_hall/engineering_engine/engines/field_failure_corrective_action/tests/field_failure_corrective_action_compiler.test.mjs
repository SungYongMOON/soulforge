import test from "node:test";
import assert from "node:assert/strict";

import {
  assembleEffectiveRuleSet,
  evaluate,
  loadDomainEngineAdapter,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import {
  compileFieldFailureCorrectiveActionRules,
  FFCA_COMPILER_ERROR_CODES,
} from "../compiler/field_failure_corrective_action_compiler_adapter.mjs";
import { fieldFailureCorrectiveActionAdapter } from "../evaluator/field_failure_corrective_action_evaluator_adapter.mjs";
import {
  buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts,
} from "../fixtures/field_failure_corrective_action_public_synthetic.mjs";
import { FFCA_RULES } from "../rules/field_failure_corrective_action_rules.mjs";

test("FFCA Core adapter compiles identity-only Profile bindings and evaluates typed request facts", () => {
  const adapter = loadDomainEngineAdapter("field_failure_corrective_action");
  const profile = {
    profile_kind: "organization",
    profile_id: "ffca-synthetic-org",
    domain_engine_id: "field_failure_corrective_action",
    revision_or_hash: "ffca-synthetic-org-r1",
    extends_or_base_pin: "ffca-base-v0",
    source_refs: ["synthetic-ffca-profile-source"],
    operations: [],
    order: 0,
  };
  const bindings = resolveProfileBindings(profile, null);
  const effective = assembleEffectiveRuleSet(adapter, bindings, { scope_ref: "synthetic-ffca-scope" });

  assert.equal(effective.domain_engine_id, "field_failure_corrective_action");
  assert.equal(effective.rule_count, FFCA_RULES.length);
  assert.equal(effective.compilation_trace.organization_trace.profile_id, "ffca-synthetic-org");

  const result = evaluate(adapter, effective, buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts());
  assert.equal(result.counts.satisfied, 8);
  assert.equal(result.authority_boundary.quality_disposition, "outside_engine");
});

test("FFCA compiler fails closed on profile rule operations", () => {
  assert.throws(() => compileFieldFailureCorrectiveActionRules([{
    schema_version: "soulforge.engineering_profile_binding.v0",
    profile_kind: "organization",
    profile_id: "ffca-profile-with-operation",
    domain_engine_id: "field_failure_corrective_action",
    revision_or_hash: "ffca-profile-r2",
    extends_or_base_pin: "ffca-base-v0",
    operation_digest: "synthetic-digest",
    source_refs: ["synthetic-profile-source"],
    order: 0,
    operations: [{ op: "condition", token: "unsupported" }],
  }]), (error) => error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED);
});

test("FFCA direct compiler rejects missing provenance, malformed profiles, and untrusted shapes", () => {
  const valid = () => ({
    schema_version: "soulforge.engineering_profile_binding.v0",
    profile_kind: "organization",
    profile_id: "ffca-direct-profile",
    domain_engine_id: "field_failure_corrective_action",
    revision_or_hash: "ffca-direct-r1",
    extends_or_base_pin: "ffca-base-v0",
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ["synthetic-ffca-profile-source"],
    order: 0,
    operations: [],
  });

  for (const field of [
    "profile_kind",
    "profile_id",
    "domain_engine_id",
    "revision_or_hash",
    "extends_or_base_pin",
    "operation_digest",
    "source_refs",
    "order",
    "operations",
    "schema_version",
  ]) {
    const profile = valid();
    delete profile[field];
    assert.throws(() => compileFieldFailureCorrectiveActionRules([profile]), (error) => (
      error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
    ), `missing ${field} must fail direct compile`);
  }

  const emptySourceRefs = valid();
  emptySourceRefs.source_refs = [];
  assert.throws(() => compileFieldFailureCorrectiveActionRules([emptySourceRefs]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  for (const field of ["profile_kind", "profile_id", "revision_or_hash", "extends_or_base_pin", "operation_digest"]) {
    const empty = valid();
    empty[field] = "";
    assert.throws(() => compileFieldFailureCorrectiveActionRules([empty]), (error) => (
      error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
    ), `empty ${field} must fail direct compile`);
  }

  const wrongOrder = valid();
  wrongOrder.order = 1;
  assert.throws(() => compileFieldFailureCorrectiveActionRules([wrongOrder]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  const extra = valid();
  extra.forged_authority = "unexpected";
  assert.throws(() => compileFieldFailureCorrectiveActionRules([extra]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  const crossDomain = valid();
  crossDomain.domain_engine_id = "systems_engineering";
  assert.throws(() => compileFieldFailureCorrectiveActionRules([crossDomain]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_DOMAIN_MISMATCH
  ));

  const accessor = valid();
  Object.defineProperty(accessor, "profile_id", { enumerable: true, get: () => "accessor-profile" });
  assert.throws(() => compileFieldFailureCorrectiveActionRules([accessor]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  assert.throws(() => compileFieldFailureCorrectiveActionRules([new Proxy(valid(), {})]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  const nonPlain = Object.assign(Object.create(null), valid());
  assert.throws(() => compileFieldFailureCorrectiveActionRules([nonPlain]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));
});

test("FFCA evaluator rejects forged effective-rule authority and unsafe effective shapes", () => {
  const base = assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    [],
    { scope_ref: "ffca-forged-effective-test" },
  );
  const typedFacts = buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts();
  const forgedAuthority = structuredClone(base);
  forgedAuthority.effective_rule_set.forged_authority = "unexpected";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(forgedAuthority, typedFacts), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");

  const tamperedRule = structuredClone(base);
  tamperedRule.effective_rule_set.rules[0].source_locator = "forged";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(tamperedRule, typedFacts), (error) => error.code === "FFCA_RULESET_UNSUPPORTED");

  const accessor = structuredClone(base);
  Object.defineProperty(accessor, "schema_version", { enumerable: true, get: () => "forged" });
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(accessor, typedFacts), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");

  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(new Proxy(structuredClone(base), {}), typedFacts), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");

  const profile = {
    schema_version: "soulforge.engineering_profile_binding.v0",
    profile_kind: "organization",
    profile_id: "ffca-adapter-profile",
    domain_engine_id: "field_failure_corrective_action",
    revision_or_hash: "ffca-adapter-r1",
    extends_or_base_pin: "ffca-base-v0",
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ["synthetic-ffca-profile-source"],
    order: 0,
    operations: [],
  };
  const profiled = structuredClone(assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    resolveProfileBindings(profile, null),
    { scope_ref: "ffca-profiled-effective-test" },
  ));
  profiled.effective_rule_set.ruleset_ref.forged_authority = "unexpected";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(profiled, typedFacts), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");

  const forgedProfile = structuredClone(assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    resolveProfileBindings(profile, null),
    { scope_ref: "ffca-forged-profile-test" },
  ));
  forgedProfile.effective_rule_set.profile_rule_provenance[0].forged_authority = "unexpected";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(forgedProfile, typedFacts), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");
});

test("FFCA direct compiler and inner provenance reject unversioned revisions and forged operation digests", () => {
  const valid = () => ({
    schema_version: "soulforge.engineering_profile_binding.v0",
    profile_kind: "organization",
    profile_id: "ffca-integrity-profile",
    domain_engine_id: "field_failure_corrective_action",
    revision_or_hash: "ffca-integrity-r1",
    extends_or_base_pin: "ffca-base-v0",
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ["synthetic-ffca-profile-source"],
    order: 0,
    operations: [],
  });

  const unversioned = valid();
  unversioned.revision_or_hash = "unversioned";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.compile([unversioned]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  const forgedDigest = valid();
  forgedDigest.operation_digest = "forged";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.compile([forgedDigest]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  const innerUnversioned = structuredClone(assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    resolveProfileBindings(valid(), null),
    { scope_ref: "ffca-unversioned-test" },
  ));
  innerUnversioned.effective_rule_set.profile_rule_provenance[0].revision_or_hash = "unversioned";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(
    innerUnversioned,
    buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts(),
  ), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");

  const innerForgedDigest = structuredClone(assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    resolveProfileBindings(valid(), null),
    { scope_ref: "ffca-forged-digest-test" },
  ));
  innerForgedDigest.effective_rule_set.profile_rule_provenance[0].operation_digest = "forged";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(
    innerForgedDigest,
    buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts(),
  ), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");
});

test("FFCA direct compiler rejects floating provenance and hostile binding containers before traps", () => {
  const valid = () => ({
    schema_version: "soulforge.engineering_profile_binding.v0",
    profile_kind: "organization",
    profile_id: "ffca-floating-profile",
    domain_engine_id: "field_failure_corrective_action",
    revision_or_hash: normalizeProfileOperations([]).operation_digest,
    extends_or_base_pin: "ffca-base-v0",
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ["ffca-profile-source"],
    order: 0,
    operations: [],
  });
  for (const [field, value] of [
    ["revision_or_hash", "latest"],
    ["revision_or_hash", "MAIN"],
    ["extends_or_base_pin", "current"],
  ]) {
    const profile = valid();
    profile[field] = value;
    assert.throws(() => fieldFailureCorrectiveActionAdapter.compile([profile]), (error) => (
      error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
    ));
  }
  const sourceFloating = valid();
  sourceFloating.source_refs = ["main"];
  assert.throws(() => fieldFailureCorrectiveActionAdapter.compile([sourceFloating]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  const outerTrap = new Proxy([], { get() { throw new Error("profile list trap"); } });
  assert.throws(() => fieldFailureCorrectiveActionAdapter.compile(outerTrap), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));

  const first = valid();
  assert.throws(() => fieldFailureCorrectiveActionAdapter.compile([first, first]), (error) => (
    error.code === FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID
  ));
});

test("FFCA evaluator rejects forged Core assembly and trace digests while retaining genuine Core assembly", () => {
  const profile = {
    profile_kind: "organization",
    profile_id: "ffca-core-trace-profile",
    domain_engine_id: "field_failure_corrective_action",
    revision_or_hash: "ffca-core-trace-r1",
    extends_or_base_pin: "ffca-base-v0",
    source_refs: ["synthetic-ffca-profile-source"],
    operations: [],
    order: 0,
  };
  const assembly = assembleEffectiveRuleSet(
    fieldFailureCorrectiveActionAdapter,
    resolveProfileBindings(profile, null),
    { scope_ref: "ffca-core-trace-scope" },
  );
  assert.doesNotThrow(() => fieldFailureCorrectiveActionAdapter.evaluate(
    assembly,
    buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts(),
  ));

  const forgedDigests = structuredClone(assembly);
  forgedDigests.assembly_digest = "forged";
  forgedDigests.compilation_trace.effective_ruleset_digest = "forged";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(
    forgedDigests,
    buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts(),
  ), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");

  const forgedTraceProfile = structuredClone(assembly);
  forgedTraceProfile.compilation_trace.profiles[0].profile_id = "forged-profile";
  assert.throws(() => fieldFailureCorrectiveActionAdapter.evaluate(
    forgedTraceProfile,
    buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts(),
  ), (error) => error.code === "FFCA_EFFECTIVE_RULESET_INVALID");
});

test("FFCA compilation is replay-stable for the same identity-only profile", () => {
  const first = compileFieldFailureCorrectiveActionRules([]);
  const second = compileFieldFailureCorrectiveActionRules([]);
  assert.deepEqual(first, second);
  assert.equal(first.effective_rule_set.rules.length, FFCA_RULES.length);
});
