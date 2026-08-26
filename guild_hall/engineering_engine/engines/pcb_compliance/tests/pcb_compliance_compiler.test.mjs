import test from "node:test";
import assert from "node:assert/strict";

import {
  arrayOrderRules,
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
  withoutNulls,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { createProjectBindingAdapter } from "../../../core/interfaces/project_binding_adapter.mjs";
import { calculatePcbCoreTypedFactsDigest, pcbComplianceAdapter } from "../evaluator/pcb_compliance_evaluator_adapter.mjs";
import { calculatePcbDerivedRulesetContentId, compilePcbComplianceRules } from "../compiler/pcb_compliance_compiler_adapter.mjs";
import { assessPcbCompliance, validatePcbEffectiveRuleSet, validateRequest, verifyPcbComplianceResult } from "../evaluator/pcb_compliance.mjs";
import { buildPcbCompliancePublicSyntheticRequest } from "../fixtures/pcb_compliance_public_synthetic.mjs";
import { PCB_COMPLIANCE_RULES, projectPcbRuleForDigest } from "../rules/pcb_compliance_rules.mjs";

function profileAdd({
  profileKind = "organization",
  profileId = "pcb_public_synthetic_org",
  sourceRef = "synthetic-profile-source-v1",
  sourceLocator = "synthetic:1",
  sourceModality = "synthetic fixture only",
  ruleId = "PCB-PROFILE-01",
  revisionOrHash = null,
  extendsOrBasePin = "pcb_compliance:v0",
  authorityFamilies = ["project_contract_baseline"],
  artifactTokens = [null],
  controlledClauseHold = false,
  order = 0,
} = {}) {
  return {
    profile_kind: profileKind,
    profile_id: profileId,
    domain_engine_id: "pcb_compliance",
    revision_or_hash: revisionOrHash ?? `${profileId}_v1`,
    extends_or_base_pin: extendsOrBasePin,
    source_refs: [sourceRef],
    operations: [{
      op: "add",
      rule: {
        rule_id: ruleId,
        source_ref: sourceRef,
        source_locator: sourceLocator,
        source_modality: sourceModality,
        coverage_area: "inspection",
        required_authority_families: authorityFamilies,
        expected_evidence_keys: ["synthetic_evidence_ref"],
        allowed_artifact_tokens: artifactTokens,
        controlled_clause_hold: controlledClauseHold,
      },
    }],
    order,
  };
}

function reclosePcbEnvelope(env) {
  const cloned = structuredClone(env);
  const cleanRules = withoutNulls(cloned.effective_rule_set);
  const canonicalRules = canonicalise(cleanRules, arrayOrderRules(cleanRules));
  const expectedAssemblyDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalRules}`);
  cloned.assembly_digest = expectedAssemblyDigest;
  cloned.compilation_trace.effective_ruleset_digest = expectedAssemblyDigest;
  return cloned;
}

function requestForEffectiveEnvelope(effective, label) {
  const request = buildPcbCompliancePublicSyntheticRequest();
  request.binding.ruleset_ref = { ...effective.effective_rule_set.ruleset_ref };
  for (const rule of effective.effective_rule_set.rules.filter((candidate) => candidate.rule_id.startsWith("PCB-PROFILE-"))) {
    request.domain_input.rows.push({
      case_id: `${label}_${rule.rule_id.toLowerCase().replaceAll("-", "_")}`,
      rule_id: rule.rule_id,
      applicability: {
        approval_scope: true,
        document_revision: true,
        jurisdiction: true,
        project_binding: true,
        time_window: true,
      },
      authority_bindings: [{ family: "project_contract_baseline", authority_ref: "synthetic_contract_baseline_v0" }],
      observation: {
        attempted: true,
        evidence_state: "present",
        evidence_by_key: {
          synthetic_evidence_ref: ["synthetic_profile_evidence"],
        },
      },
    });
  }
  return request;
}

function adaptedFactsForEffective(effective, request, label, bindingExtras = {}) {
  const bindingAdapter = createProjectBindingAdapter("pcb_compliance", {
    schema_version: "soulforge.project_binding.v0",
    project_id: `public_synthetic_${label}`,
    binding_revision_hash: "b".repeat(64),
    source_manifest_ref: `public_synthetic_manifest_${label}`,
    ...bindingExtras,
  });
  return bindingAdapter.adaptEvidence({
    snapshot_id: `pcb_synthetic_snapshot_${label}`,
    source_refs: ["public-synthetic-source-v0"],
    observations: [{
      fact_type: "pcb_compliance_evaluation_request",
      request,
    }],
  }, {
    valid_at: "2026-08-26T00:00:00.000Z",
    known_at: "2026-08-26T00:00:00.000Z",
  }).typed_project_facts;
}

test("PCB compiler produces a stable Core effective rule set without a Core change", () => {
  const empty = resolveProfileBindings(null, null);
  const first = assembleEffectiveRuleSet(pcbComplianceAdapter, empty, { mode: "public_synthetic" });
  const second = assembleEffectiveRuleSet(pcbComplianceAdapter, empty, { mode: "public_synthetic" });

  assert.equal(first.domain_engine_id, "pcb_compliance");
  assert.equal(first.rule_count, 6);
  assert.equal(first.assembly_digest, second.assembly_digest);
  assert.equal(first.effective_rule_set.ruleset_ref.entity_id, "pcb-compliance-ruleset-v0");
});

test("PCB compiler permits only sourced, typed Profile additions and preserves provenance", () => {
  const profile = profileAdd();
  const bindings = resolveProfileBindings(profile, null);
  const result = assembleEffectiveRuleSet(pcbComplianceAdapter, bindings, {});

  assert.equal(result.rule_count, 7);
  assert.ok(result.effective_rule_set.rules.some((rule) => rule.rule_id === "PCB-PROFILE-01"));
  assert.equal(result.compilation_trace.organization_trace.profile_id, "pcb_public_synthetic_org");
  const replay = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(profileAdd(), null), {});
  assert.equal(result.effective_rule_set.ruleset_ref.content_id, replay.effective_rule_set.ruleset_ref.content_id);
});

test("PCB Core full envelopes with one or two Profiles remain evaluable", () => {
  const organization = profileAdd();
  const organizationEffective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});
  const organizationRequest = requestForEffectiveEnvelope(organizationEffective, "organization");
  const organizationFacts = adaptedFactsForEffective(organizationEffective, organizationRequest, "organization");
  assert.doesNotThrow(() => evaluate(pcbComplianceAdapter, organizationEffective, organizationFacts));
  const organizationInnerAlias = structuredClone(organizationEffective);
  organizationInnerAlias.effective_rule_set.rules[0].allowed_artifact_tokens = organizationInnerAlias.effective_rule_set.rules[1].allowed_artifact_tokens;
  assert.throws(
    () => evaluate(pcbComplianceAdapter, organizationInnerAlias, organizationFacts),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  const project = {
    ...profileAdd({
      profileId: "pcb_public_synthetic_project",
      sourceRef: "synthetic-project-source-v1",
      ruleId: "PCB-PROFILE-02",
    }),
    profile_kind: "project",
    revision_or_hash: "pcb_public_synthetic_project_v1",
    extends_or_base_pin: "pcb_public_synthetic_org",
    source_refs: ["synthetic-project-source-v1"],
    order: 1,
  };
  const twoProfileEffective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, project), {});
  const twoProfileRequest = requestForEffectiveEnvelope(twoProfileEffective, "two_profile");
  const twoProfileFacts = adaptedFactsForEffective(twoProfileEffective, twoProfileRequest, "two_profile");
  assert.doesNotThrow(() => evaluate(pcbComplianceAdapter, twoProfileEffective, twoProfileFacts));
  const twoProfileInnerAlias = structuredClone(twoProfileEffective);
  twoProfileInnerAlias.effective_rule_set.rules[0].allowed_artifact_tokens = twoProfileInnerAlias.effective_rule_set.rules[1].allowed_artifact_tokens;
  assert.throws(
    () => evaluate(pcbComplianceAdapter, twoProfileInnerAlias, twoProfileFacts),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );
});

test("PCB admits only exact Core TypedProjectFacts and binds facts provenance into output", () => {
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  const request = requestForEffectiveEnvelope(effective, "typed_facts");
  const typedFacts = adaptedFactsForEffective(effective, request, "typed_facts");
  const result = evaluate(pcbComplianceAdapter, effective, typedFacts);
  const expectedProvenance = {
    project_binding_ref: typedFacts.project_binding_ref,
    facts_digest: typedFacts.facts_digest,
    valid_at: typedFacts.valid_at,
    known_at: typedFacts.known_at,
  };
  assert.deepEqual(result.domain_result.project_facts_provenance, expectedProvenance);
  assert.deepEqual(result.receipt.project_facts_provenance, expectedProvenance);

  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, { request }),
    (error) => error.code === "PCB_TYPED_FACTS_INVALID",
  );
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, { request, facts_digest: "f".repeat(64) }),
    (error) => error.code === "PCB_TYPED_FACTS_INVALID",
  );

  const badDigest = structuredClone(typedFacts);
  badDigest.facts_digest = "f".repeat(64);
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, badDigest), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const staleCutoff = structuredClone(typedFacts);
  staleCutoff.valid_at = "2026-08-27T00:00:00.000Z";
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, staleCutoff), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const temporalInversion = structuredClone(typedFacts);
  temporalInversion.known_at = "2026-08-25T00:00:00.000Z";
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, temporalInversion), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, typedFacts, {}, {
      valid_at: "2026-08-27T00:00:00.000Z",
      known_at: "2026-08-27T00:00:00.000Z",
    }),
    (error) => error.code === "PCB_TYPED_FACTS_INVALID",
  );

  const projectMismatch = structuredClone(typedFacts);
  projectMismatch.project_binding_ref.domain_engine_id = "other_domain";
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, projectMismatch), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const missingFacts = structuredClone(typedFacts);
  missingFacts.facts = [];
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, missingFacts), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const duplicateFacts = structuredClone(typedFacts);
  duplicateFacts.facts.push(structuredClone(duplicateFacts.facts[0]));
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, duplicateFacts), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const wrongFactIdentity = structuredClone(typedFacts);
  wrongFactIdentity.facts[0].fact_type = "other_request_fact";
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, wrongFactIdentity), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const extraFactField = structuredClone(typedFacts);
  extraFactField.facts[0].unexpected = "synthetic";
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, extraFactField), (error) => error.code === "PCB_TYPED_FACTS_INVALID");
});

test("PCB TypedProjectFacts admission refuses zero-trap hostile wrappers before reads", () => {
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  const request = requestForEffectiveEnvelope(effective, "typed_hostile");
  const typedFacts = adaptedFactsForEffective(effective, request, "typed_hostile");

  let outerGetterCalls = 0;
  const outerGetter = {};
  Object.defineProperty(outerGetter, "facts", {
    enumerable: true,
    get() { outerGetterCalls += 1; return typedFacts.facts; },
  });
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, outerGetter), (error) => error.code === "PCB_TYPED_FACTS_INVALID");
  assert.equal(outerGetterCalls, 0);

  const nestedGetter = structuredClone(typedFacts);
  let nestedGetterCalls = 0;
  Object.defineProperty(nestedGetter.facts[0], "request", {
    enumerable: true,
    get() { nestedGetterCalls += 1; return request; },
  });
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, nestedGetter), (error) => error.code === "PCB_TYPED_FACTS_INVALID");
  assert.equal(nestedGetterCalls, 0);

  assert.throws(() => evaluate(pcbComplianceAdapter, effective, new Proxy(typedFacts, {})), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const symbolTypedFacts = structuredClone(typedFacts);
  symbolTypedFacts[Symbol("typed_facts")] = "synthetic";
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, symbolTypedFacts), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const aliasTypedFacts = structuredClone(typedFacts);
  aliasTypedFacts.project_binding_ref = aliasTypedFacts.facts[0].request.binding;
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, aliasTypedFacts), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const cycleTypedFacts = structuredClone(typedFacts);
  cycleTypedFacts.facts[0].cycle = cycleTypedFacts;
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, cycleTypedFacts), (error) => error.code === "PCB_TYPED_FACTS_INVALID");

  const customPrototypeTypedFacts = Object.assign(Object.create({ inherited: true }), structuredClone(typedFacts));
  assert.throws(() => evaluate(pcbComplianceAdapter, effective, customPrototypeTypedFacts), (error) => error.code === "PCB_TYPED_FACTS_INVALID");
});

test("PCB TypedProjectFacts binds closed document_refs provenance into a stable assessment receipt", () => {
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  const request = requestForEffectiveEnvelope(effective, "typed_document_refs");
  const typedFacts = adaptedFactsForEffective(effective, request, "typed_document_refs", {
    document_refs: ["doc_a", "doc_b"],
  });
  const first = evaluate(pcbComplianceAdapter, effective, typedFacts);
  const replay = evaluate(pcbComplianceAdapter, effective, structuredClone(typedFacts));
  const expectedProvenance = {
    project_binding_ref: typedFacts.project_binding_ref,
    facts_digest: typedFacts.facts_digest,
    valid_at: typedFacts.valid_at,
    known_at: typedFacts.known_at,
  };
  assert.deepEqual(first.domain_result.project_facts_provenance, expectedProvenance);
  assert.deepEqual(first.receipt.project_facts_provenance, expectedProvenance);
  assert.equal(first.receipt.assessment_digest, replay.receipt.assessment_digest);

  for (const documentRefs of [["doc_b", "doc_a"], ["doc_a", "doc_a"]]) {
    const invalidTypedFacts = adaptedFactsForEffective(effective, request, `typed_document_refs_${documentRefs.join("_")}`, {
      document_refs: documentRefs,
    });
    assert.throws(
      () => evaluate(pcbComplianceAdapter, effective, invalidTypedFacts),
      (error) => error.code === "PCB_TYPED_FACTS_INVALID",
    );
  }
});

test("PCB TypedProjectFacts requires Core millisecond precision at every admitted time boundary", () => {
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  const request = requestForEffectiveEnvelope(effective, "typed_precision");
  const typedFacts = adaptedFactsForEffective(effective, request, "typed_precision");
  const invalidInstants = ["2026-08-26T00:00:00Z", "2026-08-26T00:00:00.123456Z"];

  for (const instant of invalidInstants) {
    for (const typedField of ["valid_at", "known_at"]) {
      const invalidTypedFacts = structuredClone(typedFacts);
      invalidTypedFacts[typedField] = instant;
      assert.throws(
        () => evaluate(pcbComplianceAdapter, effective, invalidTypedFacts),
        (error) => error.code === "PCB_TYPED_FACTS_INVALID",
      );
    }

    for (const cutoffField of ["valid_at", "known_at"]) {
      const invalidRequestFacts = structuredClone(typedFacts);
      invalidRequestFacts.facts[0].request.cutoffs[cutoffField] = instant;
      assert.throws(
        () => evaluate(pcbComplianceAdapter, effective, invalidRequestFacts),
        (error) => error.code === "PCB_TYPED_FACTS_INVALID",
      );

      const invalidEvaluatorCutoffs = {
        valid_at: typedFacts.valid_at,
        known_at: typedFacts.known_at,
        [cutoffField]: instant,
      };
      assert.throws(
        () => evaluate(pcbComplianceAdapter, effective, typedFacts, {}, invalidEvaluatorCutoffs),
        (error) => error.code === "PCB_TYPED_FACTS_INVALID",
      );
    }
  }
});

test("PCB derived ruleset roundtrips exactly and rejects digest, rule, and authority tampering", () => {
  const env = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(profileAdd(), null), {});
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(env));

  const ruleTamper = structuredClone(env);
  ruleTamper.effective_rule_set.rules.find((rule) => rule.rule_id === "PCB-PROFILE-01").source_locator = "synthetic:forged";
  assert.throws(() => validatePcbEffectiveRuleSet(ruleTamper), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const contentTamper = structuredClone(env);
  contentTamper.effective_rule_set.ruleset_ref.content_id = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  assert.throws(() => validatePcbEffectiveRuleSet(contentTamper), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const authorityTamper = structuredClone(env);
  authorityTamper.effective_rule_set.rules.find((rule) => rule.rule_id === "PCB-PROFILE-01").required_authority_families = ["unregistered_authority_family"];
  assert.throws(() => validatePcbEffectiveRuleSet(authorityTamper), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const provenanceTamper = structuredClone(env);
  provenanceTamper.effective_rule_set.profile_rule_provenance["PCB-PROFILE-01"].profile_id = "forged_profile";
  assert.throws(() => validatePcbEffectiveRuleSet(provenanceTamper), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const mutatedBase = structuredClone(env);
  mutatedBase.effective_rule_set.rules.find((rule) => rule.rule_id === "PCB-NASA-FAB-01").source_locator = "synthetic:mutated-base";
  mutatedBase.effective_rule_set.ruleset_ref.content_id = calculatePcbDerivedRulesetContentId(mutatedBase.effective_rule_set.rules, mutatedBase.effective_rule_set.profile_rule_provenance);
  assert.throws(() => validatePcbEffectiveRuleSet(mutatedBase), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const deletedBase = structuredClone(env);
  deletedBase.effective_rule_set.rules = deletedBase.effective_rule_set.rules.filter((rule) => rule.rule_id !== "PCB-NASA-PROTECT-01");
  deletedBase.effective_rule_set.rule_count = deletedBase.effective_rule_set.rules.length;
  deletedBase.effective_rule_set.ruleset_ref.content_id = calculatePcbDerivedRulesetContentId(deletedBase.effective_rule_set.rules, deletedBase.effective_rule_set.profile_rule_provenance);
  assert.throws(() => validatePcbEffectiveRuleSet(deletedBase), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const controlledBypass = structuredClone(env);
  const profileRule = controlledBypass.effective_rule_set.rules.find((rule) => rule.rule_id === "PCB-PROFILE-01");
  profileRule.source_ref = "S-IPC-REVISION-CATALOG";
  profileRule.controlled_clause_hold = false;
  controlledBypass.effective_rule_set.profile_rule_provenance["PCB-PROFILE-01"].source_ref = "S-IPC-REVISION-CATALOG";
  controlledBypass.effective_rule_set.ruleset_ref.content_id = calculatePcbDerivedRulesetContentId(controlledBypass.effective_rule_set.rules, controlledBypass.effective_rule_set.profile_rule_provenance);
  assert.throws(() => validatePcbEffectiveRuleSet(controlledBypass), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");
});

test("PCB compiler closes Profile bindings and preserves null/source-native digest distinctions", () => {
  const binding = resolveProfileBindings(profileAdd(), null)[0];
  const missingId = structuredClone(binding);
  delete missingId.profile_id;
  assert.throws(() => compilePcbComplianceRules([missingId]), (error) => error.code === "PCB_PROFILE_BINDING_INVALID");

  const unsafeId = structuredClone(binding);
  unsafeId.profile_id = ["C:", "private", "profile"].join(String.fromCharCode(92));
  assert.throws(() => compilePcbComplianceRules([unsafeId]), (error) => error.code === "PCB_PROFILE_BINDING_INVALID");

  const controlled = resolveProfileBindings(profileAdd({ sourceRef: "S-IPC-REVISION-CATALOG", ruleId: "PCB-PROFILE-IPC-01" }), null);
  assert.throws(() => compilePcbComplianceRules(controlled), (error) => error.code === "PCB_PROFILE_RULE_INVALID");

  const sourceNative = compilePcbComplianceRules(resolveProfileBindings(profileAdd({ ruleId: "PCB-PROFILE-NULL-01", artifactTokens: [null] }), null));
  const noArtifact = compilePcbComplianceRules(resolveProfileBindings(profileAdd({ ruleId: "PCB-PROFILE-EMPTY-01", artifactTokens: [] }), null));
  assert.notEqual(sourceNative.ruleset_ref.content_id, noArtifact.ruleset_ref.content_id);
});

test("PCB digest projection is shared by rules, compiler, and evaluator paths", () => {
  const sourceNativeRule = PCB_COMPLIANCE_RULES.find((rule) => rule.rule_id === "PCB-NASA-FAB-01");
  const projected = projectPcbRuleForDigest(sourceNativeRule);
  assert.deepEqual(projected.allowed_artifact_mappings, [{ source_native: true }]);

  const derived = compilePcbComplianceRules(resolveProfileBindings(profileAdd(), null));
  assert.equal(
    derived.ruleset_ref.content_id,
    calculatePcbDerivedRulesetContentId(derived.rules, derived.profile_rule_provenance),
  );
  assert.throws(() => validatePcbEffectiveRuleSet(derived), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");
  const env = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(profileAdd(), null), {});
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(env));
});

test("PCB compiler fails closed for flat, unbound, duplicate, and unsupported Profile operations", () => {
  const base = {
    profile_kind: "organization",
    profile_id: "pcb_bad_profile",
    domain_engine_id: "pcb_compliance",
    revision_or_hash: "pcb_bad_profile_v1",
    extends_or_base_pin: "pcb_compliance:v0",
    source_refs: ["synthetic-profile-source-v1"],
    order: 0,
  };
  const flat = resolveProfileBindings({ ...base, operations: [{ op: "add", rule_id: "PCB-PROFILE-02" }] }, null);
  assert.throws(() => compilePcbComplianceRules(flat), (error) => error.code === "PCB_PROFILE_OPERATION_MALFORMED");

  const unbound = resolveProfileBindings({
    ...base,
    operations: [{ op: "add", rule: {
      rule_id: "PCB-PROFILE-02",
      source_ref: "unbound-source",
      source_locator: "synthetic:2",
      source_modality: "synthetic",
      coverage_area: "inspection",
      required_authority_families: ["project_contract_baseline"],
      expected_evidence_keys: ["synthetic_evidence_ref"],
      allowed_artifact_tokens: [null],
      controlled_clause_hold: false,
    } }],
  }, null);
  assert.throws(() => compilePcbComplianceRules(unbound), (error) => error.code === "PCB_PROFILE_SOURCE_UNBOUND");

  const duplicate = resolveProfileBindings({ ...base, operations: [{ op: "add", rule: {
    rule_id: "PCB-NASA-FAB-01",
    source_ref: "synthetic-profile-source-v1",
    source_locator: "synthetic:3",
    source_modality: "synthetic",
    coverage_area: "inspection",
    required_authority_families: ["project_contract_baseline"],
    expected_evidence_keys: ["synthetic_evidence_ref"],
    allowed_artifact_tokens: [null],
    controlled_clause_hold: false,
  } }],
  }, null);
  assert.throws(() => compilePcbComplianceRules(duplicate), (error) => error.code === "PCB_PROFILE_RULE_DUPLICATE");
});

test("PCB adapter accepts Core Typed Project Facts and rejects a tampered effective ruleset", () => {
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  const request = buildPcbCompliancePublicSyntheticRequest();
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
  const result = evaluate(pcbComplianceAdapter, effective, adapted.typed_project_facts);
  assert.equal(result.assessment.domain_engine_id, "pcb_compliance");

  const tampered = structuredClone(effective);
  tampered.effective_rule_set.rules[0].source_locator = "forged";
  assert.throws(
    () => evaluate(pcbComplianceAdapter, tampered, adapted.typed_project_facts),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );
});

function reclosePcbDerivedWrapper(wrapper) {
  const ruleset = wrapper.effective_rule_set;
  const derivedContentId = calculatePcbDerivedRulesetContentId(ruleset.rules, ruleset.profile_rule_provenance);
  ruleset.ruleset_ref = {
    entity_id: "pcb-compliance-ruleset-derived-v0",
    revision_id: "soulforge.pcb_compliance.ruleset.v0",
    content_id: derivedContentId,
    content_hash_alg: "sha256",
  };
  const clean = withoutNulls(ruleset);
  const coreDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(clean, arrayOrderRules(clean))}`);
  wrapper.rule_count = ruleset.rules.length;
  wrapper.assembly_digest = coreDigest;
  wrapper.compilation_trace.rule_count = ruleset.rules.length;
  wrapper.compilation_trace.effective_ruleset_digest = coreDigest;
  return wrapper;
}

test("PCB evaluator strictly admits descriptor-first authority and rejects non-empty, hostile, or non-plain authority", () => {
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  const request = requestForEffectiveEnvelope(effective, "authority_test");
  const typedFacts = adaptedFactsForEffective(effective, request, "authority_test");

  // Non-empty authority object must be refused
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, typedFacts, { action: "approve" }),
    (error) => error.code === "PCB_TYPED_FACTS_INVALID",
  );
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, typedFacts, { role: "admin" }),
    (error) => error.code === "PCB_TYPED_FACTS_INVALID",
  );

  // Primitive, array, null authorities must be refused
  for (const badAuthority of [null, "action", 123, true, [1, 2]]) {
    assert.throws(
      () => evaluate(pcbComplianceAdapter, effective, typedFacts, badAuthority),
      (error) => error.code === "PCB_TYPED_FACTS_INVALID",
    );
  }

  // Proxy authority must be refused
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, typedFacts, new Proxy({}, {})),
    (error) => error.code === "PCB_TYPED_FACTS_INVALID",
  );

  // Hostile getter on authority must be refused without executing
  let getterRan = false;
  const hostileAuthority = {};
  Object.defineProperty(hostileAuthority, "action", {
    enumerable: true,
    get() {
      getterRan = true;
      return "approve";
    },
  });
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, typedFacts, hostileAuthority),
    (error) => error.code === "PCB_TYPED_FACTS_INVALID",
  );
  assert.equal(getterRan, false, "getter must not be executed during authority admission");
});

test("PCB evaluator strictly admits evaluator cutoffs argument and rejects non-plain or mismatched cutoffs", () => {
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  const request = requestForEffectiveEnvelope(effective, "cutoffs_test");
  const typedFacts = adaptedFactsForEffective(effective, request, "cutoffs_test");

  // Valid matching cutoffs pass
  assert.doesNotThrow(() => evaluate(pcbComplianceAdapter, effective, typedFacts, {}, {
    valid_at: typedFacts.valid_at,
    known_at: typedFacts.known_at,
  }));

  // Empty cutoffs pass
  assert.doesNotThrow(() => evaluate(pcbComplianceAdapter, effective, typedFacts, {}, {}));

  // Null, primitive, array cutoffs must be refused
  for (const badCutoffs of [null, "2026-08-26", 123, true, []]) {
    assert.throws(
      () => evaluate(pcbComplianceAdapter, effective, typedFacts, {}, badCutoffs),
      (error) => error.code === "PCB_TYPED_FACTS_INVALID",
    );
  }

  // Extra keys on cutoffs must be refused
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, typedFacts, {}, {
      valid_at: typedFacts.valid_at,
      known_at: typedFacts.known_at,
      extra_key: true,
    }),
    (error) => error.code === "PCB_TYPED_FACTS_INVALID",
  );
});

test("PCB outer Core envelope enforces cryptographic closure preventing derived rule forgery via caller rehash", () => {
  const organization = profileAdd();
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});
  const request = requestForEffectiveEnvelope(effective, "rehash_test");
  const typedFacts = adaptedFactsForEffective(effective, request, "rehash_test");

  // Legitimate compilation envelope evaluates cleanly
  assert.doesNotThrow(() => evaluate(pcbComplianceAdapter, effective, typedFacts));
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(effective));

  // Caller mutates derived rule source_locator and rehashes all envelope digests
  const tamperedLocator = reclosePcbDerivedWrapper(structuredClone(effective));
  tamperedLocator.effective_rule_set.rules.find((r) => r.rule_id === "PCB-PROFILE-01").source_locator = "synthetic:forged";
  reclosePcbDerivedWrapper(tamperedLocator);
  assert.throws(
    () => evaluate(pcbComplianceAdapter, tamperedLocator, typedFacts),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );
  assert.throws(
    () => validatePcbEffectiveRuleSet(tamperedLocator),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Caller mutates coverage area and rehashes
  const tamperedCoverage = reclosePcbDerivedWrapper(structuredClone(effective));
  tamperedCoverage.effective_rule_set.rules.find((r) => r.rule_id === "PCB-PROFILE-01").coverage_area = "fabrication_and_assembly";
  reclosePcbDerivedWrapper(tamperedCoverage);
  assert.throws(
    () => validatePcbEffectiveRuleSet(tamperedCoverage),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Caller mutates required_authority_families and rehashes
  const tamperedAuthority = reclosePcbDerivedWrapper(structuredClone(effective));
  tamperedAuthority.effective_rule_set.rules.find((r) => r.rule_id === "PCB-PROFILE-01").required_authority_families = ["project_contract_baseline", "quality_manual"];
  reclosePcbDerivedWrapper(tamperedAuthority);
  assert.throws(
    () => validatePcbEffectiveRuleSet(tamperedAuthority),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Envelope assembly_digest mismatch
  const badAssemblyDigest = structuredClone(effective);
  badAssemblyDigest.assembly_digest = "0".repeat(64);
  assert.throws(
    () => validatePcbEffectiveRuleSet(badAssemblyDigest),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Compilation trace effective_ruleset_digest mismatch
  const badTraceDigest = structuredClone(effective);
  badTraceDigest.compilation_trace.effective_ruleset_digest = "0".repeat(64);
  assert.throws(
    () => validatePcbEffectiveRuleSet(badTraceDigest),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Extra keys on outer envelope
  const extraOuterKey = structuredClone(effective);
  extraOuterKey.forged_property = "unsupported";
  assert.throws(
    () => validatePcbEffectiveRuleSet(extraOuterKey),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Duplicate profile in trace
  const duplicateTrace = reclosePcbDerivedWrapper(structuredClone(effective));
  duplicateTrace.compilation_trace.profiles.push(structuredClone(duplicateTrace.compilation_trace.profiles[0]));
  assert.throws(
    () => validatePcbEffectiveRuleSet(duplicateTrace),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Mismatched applied operations count
  const badAppliedCount = reclosePcbDerivedWrapper(structuredClone(effective));
  badAppliedCount.compilation_trace.profiles[0].applied_operations_count = 5;
  assert.throws(
    () => validatePcbEffectiveRuleSet(badAppliedCount),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );
});

test("PCB compilation envelope rejects probe forgeries: scope, adapter revision, summary profile_id, summary digest, and summary source_refs", () => {
  const organization = profileAdd();
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});

  // 1. Forged compilation_scope
  const tamperedScope = structuredClone(effective);
  tamperedScope.compilation_trace.compilation_scope = { forged: true };
  assert.throws(
    () => validatePcbEffectiveRuleSet(tamperedScope),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "compilation_scope={forged:true} must fail",
  );

  // 2. Forged or un-assembled domain_adapter_revision (including compiler.v0 which cannot be assembled by Core)
  for (const badRevision of [
    "forged",
    "soulforge.pcb_compliance.compiler.v0",
    "soulforge.pcb_compliance.evaluator.v1",
    "soulforge.pcb_compliance.compiler.v1",
    "soulforge.other_domain.evaluator.v0",
  ]) {
    const tamperedRevision = structuredClone(effective);
    tamperedRevision.compilation_trace.domain_adapter_revision = badRevision;
    assert.throws(
      () => validatePcbEffectiveRuleSet(tamperedRevision),
      (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
      `domain_adapter_revision='${badRevision}' must fail`,
    );
  }

  // 3. Forged organization_trace.profile_id
  const tamperedSummaryId = structuredClone(effective);
  tamperedSummaryId.compilation_trace.organization_trace.profile_id = "forged";
  assert.throws(
    () => validatePcbEffectiveRuleSet(tamperedSummaryId),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "organization_trace.profile_id='forged' must fail",
  );

  // 4. Forged organization_trace.operation_digest
  const tamperedSummaryDigest = structuredClone(effective);
  tamperedSummaryDigest.compilation_trace.organization_trace.operation_digest = "f".repeat(64);
  assert.throws(
    () => validatePcbEffectiveRuleSet(tamperedSummaryDigest),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "organization_trace.operation_digest='f'*64 must fail",
  );

  // 5. Forged organization_trace.source_refs
  const tamperedSummarySources = structuredClone(effective);
  tamperedSummarySources.compilation_trace.organization_trace.source_refs = ["forged-source"];
  assert.throws(
    () => validatePcbEffectiveRuleSet(tamperedSummarySources),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "organization_trace.source_refs=['forged-source'] must fail",
  );

  // 6. Forged project_trace variants
  const project = profileAdd({ profileKind: "project", profileId: "pcb_public_synthetic_proj", ruleId: "PCB-PROFILE-02", order: 0 });
  const effectiveProj = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, project), {});

  const tamperedProjId = structuredClone(effectiveProj);
  tamperedProjId.compilation_trace.project_trace.profile_id = "forged";
  assert.throws(() => validatePcbEffectiveRuleSet(tamperedProjId), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const tamperedProjDigest = structuredClone(effectiveProj);
  tamperedProjDigest.compilation_trace.project_trace.operation_digest = "f".repeat(64);
  assert.throws(() => validatePcbEffectiveRuleSet(tamperedProjDigest), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const tamperedProjSources = structuredClone(effectiveProj);
  tamperedProjSources.compilation_trace.project_trace.source_refs = ["forged-source"];
  assert.throws(() => validatePcbEffectiveRuleSet(tamperedProjSources), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");
});

test("PCB compilation envelope rejects summary nullability mismatches, extra keys, and hostile scope shapes", () => {
  const organization = profileAdd({ profileKind: "organization", profileId: "pcb_public_synthetic_org", ruleId: "PCB-PROFILE-01", order: 0 });
  const project = profileAdd({ profileKind: "project", profileId: "pcb_public_synthetic_proj", ruleId: "PCB-PROFILE-02", order: 1 });
  const effectiveOrgOnly = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});
  const effectiveBoth = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, project), {});
  const effectiveZero = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});

  // organization_trace null when org profile exists
  const nullOrgWhenPresent = structuredClone(effectiveOrgOnly);
  nullOrgWhenPresent.compilation_trace.organization_trace = null;
  assert.throws(
    () => validatePcbEffectiveRuleSet(nullOrgWhenPresent),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // project_trace non-null when project profile absent
  const nonNullProjWhenAbsent = structuredClone(effectiveOrgOnly);
  nonNullProjWhenAbsent.compilation_trace.project_trace = structuredClone(effectiveBoth.compilation_trace.project_trace);
  assert.throws(
    () => validatePcbEffectiveRuleSet(nonNullProjWhenAbsent),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // organization_trace non-null when 0 profiles
  const nonNullOrgZero = structuredClone(effectiveZero);
  nonNullOrgZero.compilation_trace.organization_trace = structuredClone(effectiveOrgOnly.compilation_trace.organization_trace);
  assert.throws(
    () => validatePcbEffectiveRuleSet(nonNullOrgZero),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // extra key on organization_trace
  const extraKeySummary = structuredClone(effectiveOrgOnly);
  extraKeySummary.compilation_trace.organization_trace.unexpected_key = "forged";
  assert.throws(
    () => validatePcbEffectiveRuleSet(extraKeySummary),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Hostile scope shapes: null, array, primitive, proxy, getter
  for (const badScope of [null, [1, 2], "scope", 123, true]) {
    const hostileScope = structuredClone(effectiveZero);
    hostileScope.compilation_trace.compilation_scope = badScope;
    assert.throws(
      () => validatePcbEffectiveRuleSet(hostileScope),
      (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    );
  }

  // Hostile getter on compilation_scope
  let scopeGetterRan = false;
  const hostileScopeGetter = structuredClone(effectiveZero);
  Object.defineProperty(hostileScopeGetter.compilation_trace.compilation_scope, "forged", {
    enumerable: true,
    get() {
      scopeGetterRan = true;
      return true;
    },
  });
  assert.throws(
    () => validatePcbEffectiveRuleSet(hostileScopeGetter),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );
});

test("PCB compilation envelope validates legitimate 0-profile, 1-profile, and 2-profile matrix", () => {
  const organization = profileAdd({ profileKind: "organization", profileId: "pcb_public_synthetic_org", ruleId: "PCB-PROFILE-01", order: 0 });
  const projectOrder0 = profileAdd({ profileKind: "project", profileId: "pcb_public_synthetic_proj", ruleId: "PCB-PROFILE-02", order: 0 });
  const projectOrder1 = profileAdd({ profileKind: "project", profileId: "pcb_public_synthetic_proj", ruleId: "PCB-PROFILE-02", order: 1 });

  // 0 profiles
  const env0 = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, null), {});
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(env0));
  const req0 = requestForEffectiveEnvelope(env0, "matrix_0");
  const typed0 = adaptedFactsForEffective(env0, req0, "matrix_0");
  const res0 = evaluate(pcbComplianceAdapter, env0, typed0);
  assert.equal(res0.assessment.overall_state, "UNKNOWN");

  // 1 profile: organization only
  const env1Org = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(env1Org));
  const req1Org = requestForEffectiveEnvelope(env1Org, "matrix_1_org");
  const typed1Org = adaptedFactsForEffective(env1Org, req1Org, "matrix_1_org");
  const res1Org = evaluate(pcbComplianceAdapter, env1Org, typed1Org);
  assert.equal(res1Org.assessment.overall_state, "UNKNOWN");

  // 1 profile: project only
  const env1Proj = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(null, projectOrder0), {});
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(env1Proj));
  const req1Proj = requestForEffectiveEnvelope(env1Proj, "matrix_1_proj");
  const typed1Proj = adaptedFactsForEffective(env1Proj, req1Proj, "matrix_1_proj");
  const res1Proj = evaluate(pcbComplianceAdapter, env1Proj, typed1Proj);
  assert.equal(res1Proj.assessment.overall_state, "UNKNOWN");

  // 2 profiles: organization + project
  const env2 = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, projectOrder1), {});
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(env2));
  const req2 = requestForEffectiveEnvelope(env2, "matrix_2");
  const typed2 = adaptedFactsForEffective(env2, req2, "matrix_2");
  const res2 = evaluate(pcbComplianceAdapter, env2, typed2);
  assert.equal(res2.assessment.overall_state, "UNKNOWN");
  assert.equal(res2.domain_result.claim_ceiling, "observed", "domain result claim ceiling must clamp to observed when profile rules present");
});

test("P1-A: arbitrary Profile source cannot mint source_supported and aggregate clamps to observed", () => {
  const organization = profileAdd({ profileKind: "organization", profileId: "pcb_public_synthetic_org", ruleId: "PCB-PROFILE-01" });
  const compiled = compilePcbComplianceRules(resolveProfileBindings(organization, null));
  const profileRule = compiled.rules.find((r) => r.rule_id === "PCB-PROFILE-01");
  assert.equal(profileRule.claim_ceiling, "observed", "compiled profile rule must have observed claim ceiling");

  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});
  const req = requestForEffectiveEnvelope(effective, "p1a_test");
  const typed = adaptedFactsForEffective(effective, req, "p1a_test");
  const evalResult = evaluate(pcbComplianceAdapter, effective, typed);
  assert.equal(evalResult.domain_result.claim_ceiling, "observed", "domain result claim ceiling must clamp to observed");

  // Attempt self-rehash forging source_supported on derived rule
  const forgedEnvelope = structuredClone(effective);
  const derivedRule = forgedEnvelope.effective_rule_set.rules.find((r) => r.rule_id === "PCB-PROFILE-01");
  derivedRule.claim_ceiling = "source_supported";
  assert.throws(
    () => validatePcbEffectiveRuleSet(reclosePcbEnvelope(forgedEnvelope)),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "derived rule cannot claim source_supported even after rehash",
  );
});

test("P1-B: bare derived ruleset without Core compilation envelope is rejected", () => {
  const organization = profileAdd({ profileKind: "organization", profileId: "pcb_public_synthetic_org", ruleId: "PCB-PROFILE-01" });
  const bareDerived = compilePcbComplianceRules(resolveProfileBindings(organization, null));

  // Direct validatePcbEffectiveRuleSet must reject bare derived ruleset
  assert.throws(
    () => validatePcbEffectiveRuleSet(bareDerived),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "bare derived ruleset must be rejected without Core envelope",
  );

  // evaluate must reject bare derived ruleset
  const req = requestForEffectiveEnvelope({ effective_rule_set: bareDerived }, "bare_test");
  const typed = adaptedFactsForEffective({ effective_rule_set: bareDerived }, req, "bare_test");
  assert.throws(
    () => evaluate(pcbComplianceAdapter, bareDerived, typed),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
  );

  // Bare base ruleset is allowed
  const bareBase = compilePcbComplianceRules([]);
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(bareBase));
});

test("P1-C: reverse-ID ordered Profile operations succeed and provenance indices/item digests are enforced", () => {
  // Define profile with 2 operations in reverse rule_id order: ZZ then AA
  const reverseOpsProfile = {
    profile_kind: "organization",
    profile_id: "pcb_reverse_ops_org",
    domain_engine_id: "pcb_compliance",
    revision_or_hash: "pcb_reverse_ops_org_v1",
    extends_or_base_pin: "pcb_compliance:v0",
    source_refs: ["synthetic-profile-source-v1"],
    operations: [
      {
        op: "add",
        rule: {
          rule_id: "PCB-PROFILE-ZZ",
          source_ref: "synthetic-profile-source-v1",
          source_locator: "synthetic:zz",
          source_modality: "synthetic fixture only",
          coverage_area: "inspection",
          required_authority_families: ["project_contract_baseline"],
          expected_evidence_keys: ["synthetic_evidence_ref"],
          allowed_artifact_tokens: [null],
          controlled_clause_hold: false,
        },
      },
      {
        op: "add",
        rule: {
          rule_id: "PCB-PROFILE-AA",
          source_ref: "synthetic-profile-source-v1",
          source_locator: "synthetic:aa",
          source_modality: "synthetic fixture only",
          coverage_area: "inspection",
          required_authority_families: ["project_contract_baseline"],
          expected_evidence_keys: ["synthetic_evidence_ref"],
          allowed_artifact_tokens: [null],
          controlled_clause_hold: false,
        },
      },
    ],
    order: 0,
  };

  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(reverseOpsProfile, null), {});
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(effective), "reverse-ID operations must pass validation");

  const provZZ = effective.effective_rule_set.profile_rule_provenance["PCB-PROFILE-ZZ"];
  const provAA = effective.effective_rule_set.profile_rule_provenance["PCB-PROFILE-AA"];
  assert.equal(provZZ.operation_index, 0);
  assert.equal(provAA.operation_index, 1);
  assert.match(provZZ.operation_item_digest, /^[0-9a-f]{64}$/);
  assert.match(provAA.operation_item_digest, /^[0-9a-f]{64}$/);

  // Provenance index duplicate
  const dupIndex = structuredClone(effective);
  dupIndex.effective_rule_set.profile_rule_provenance["PCB-PROFILE-AA"].operation_index = 0;
  assert.throws(
    () => validatePcbEffectiveRuleSet(reclosePcbEnvelope(dupIndex)),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "duplicate operation_index must be rejected",
  );

  // Provenance index gap
  const gapIndex = structuredClone(effective);
  gapIndex.effective_rule_set.profile_rule_provenance["PCB-PROFILE-AA"].operation_index = 5;
  assert.throws(
    () => validatePcbEffectiveRuleSet(reclosePcbEnvelope(gapIndex)),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "operation_index gap must be rejected",
  );

  // Provenance tampered item digest
  const badItemDigest = structuredClone(effective);
  badItemDigest.effective_rule_set.profile_rule_provenance["PCB-PROFILE-AA"].operation_item_digest = "0".repeat(64);
  assert.throws(
    () => validatePcbEffectiveRuleSet(reclosePcbEnvelope(badItemDigest)),
    (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID",
    "tampered operation_item_digest must be rejected",
  );
});

test("P1-D: public output sentinels reject secrets, file URIs, POSIX paths, localhost and alternate normalized host representations", () => {
  const organization = profileAdd();
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});
  const req = requestForEffectiveEnvelope(effective, "sentinels_test");

  const hostileDocs = [
    "ghp_12345678901234567890",
    "sk-12345678901234567890",
    "xoxb-123456789012-123456789012",
    "Bearer token_value_secret",
    ["file:", "", "", "etc", "passwd"].join("/"),
    "http://127.1/admin",
    "127.1/admin",
    "http://0177.0.0.1/admin",
    "0177.0.0.1/admin",
    "http://0x7f000001/admin",
    "0x7f000001/admin",
    "http://2130706433/admin",
    "2130706433/admin",
    "http://127.0.0.1/admin",
    "http://[::1]/admin",
    "[::1]/admin",
    "http://[::ffff:127.0.0.1]/admin",
    "http://[fc00::1]/admin",
    "http://[fe80::1]/admin",
    "http://0.0.0.0/",
    "http://10.0.0.1/internal",
    "http://172.16.0.1/meta",
    "http://192.168.1.1/status",
    "http://169.254.169.254/latest",
    "http://localhost:8080/api",
    ["C:", "secret", "keys.txt"].join(String.fromCharCode(92)),
    ["", "", "server", "share", "data"].join(String.fromCharCode(92)),
    ["", "etc", "passwd"].join("/"),
    ["", "root", ".ssh", "id_rsa"].join("/"),
  ];

  for (const hostileDoc of hostileDocs) {
    const hostileTypedFacts = {
      schema_version: "soulforge.typed_project_facts.v0",
      project_binding_ref: {
        schema_version: "soulforge.project_binding.v0",
        project_id: "public_synthetic_pcb",
        domain_engine_id: "pcb_compliance",
        binding_revision_hash: "b".repeat(64),
        source_manifest_ref: "public-synthetic-manifest-v0",
        document_refs: [hostileDoc],
      },
      facts: [{
        fact_type: "pcb_compliance_evaluation_request",
        request: req,
      }],
      facts_digest: "a".repeat(64),
      valid_at: "2026-08-26T00:00:00.000Z",
      known_at: "2026-08-26T00:00:00.000Z",
    };
    hostileTypedFacts.facts_digest = calculatePcbCoreTypedFactsDigest(hostileTypedFacts.facts);

    assert.throws(
      () => evaluate(pcbComplianceAdapter, effective, hostileTypedFacts),
      (error) => {
        assert.equal(error.code, "PCB_TYPED_FACTS_INVALID");
        assert.ok(!error.message.includes(hostileDoc), "error message must not echo hostile value");
        return true;
      },
      `document_ref '${hostileDoc}' must be rejected without echoing`,
    );
  }
});

test("P1-D: caller-originated project binding, row case_id, and observation fields reject hostile strings without echo", () => {
  const organization = profileAdd();
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});

  // 1. Hostile project_id
  const hostileProjectIdFacts = {
    schema_version: "soulforge.typed_project_facts.v0",
    project_binding_ref: {
      schema_version: "soulforge.project_binding.v0",
      project_id: "ghp_12345678901234567890",
      domain_engine_id: "pcb_compliance",
      binding_revision_hash: "b".repeat(64),
      source_manifest_ref: "public-synthetic-manifest-v0",
    },
    facts: [{ fact_type: "pcb_compliance_evaluation_request", request: requestForEffectiveEnvelope(effective, "field_test") }],
    facts_digest: "a".repeat(64),
    valid_at: "2026-08-26T00:00:00.000Z",
    known_at: "2026-08-26T00:00:00.000Z",
  };
  hostileProjectIdFacts.facts_digest = calculatePcbCoreTypedFactsDigest(hostileProjectIdFacts.facts);
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, hostileProjectIdFacts),
    (error) => {
      assert.equal(error.code, "PCB_TYPED_FACTS_INVALID");
      assert.ok(!error.message.includes("ghp_12345678901234567890"));
      return true;
    },
  );

  // 2. Hostile source_manifest_ref
  const hostileManifestFacts = structuredClone(hostileProjectIdFacts);
  hostileManifestFacts.project_binding_ref.project_id = "public_synthetic_pcb";
  hostileManifestFacts.project_binding_ref.source_manifest_ref = "xoxb-123456789012-123456789012";
  hostileManifestFacts.facts_digest = calculatePcbCoreTypedFactsDigest(hostileManifestFacts.facts);
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, hostileManifestFacts),
    (error) => {
      assert.equal(error.code, "PCB_TYPED_FACTS_INVALID");
      assert.ok(!error.message.includes("xoxb-123456789012-123456789012"));
      return true;
    },
  );

  // 3. Hostile binding_revision_hash (URL: http://127.1/admin)
  const hostileHashFacts = structuredClone(hostileProjectIdFacts);
  hostileHashFacts.project_binding_ref.project_id = "public_synthetic_pcb";
  hostileHashFacts.project_binding_ref.binding_revision_hash = "http://127.1/admin";
  hostileHashFacts.facts_digest = calculatePcbCoreTypedFactsDigest(hostileHashFacts.facts);
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, hostileHashFacts),
    (error) => {
      assert.equal(error.code, "PCB_TYPED_FACTS_INVALID");
      assert.ok(!error.message.includes("http://127.1/admin"));
      return true;
    },
  );

  // 4. Hostile authority_family in project_binding_ref
  const hostileAuthFamFacts = structuredClone(hostileProjectIdFacts);
  hostileAuthFamFacts.project_binding_ref.project_id = "public_synthetic_pcb";
  hostileAuthFamFacts.project_binding_ref.authority_family = "Bearer token_secret";
  hostileAuthFamFacts.facts_digest = calculatePcbCoreTypedFactsDigest(hostileAuthFamFacts.facts);
  assert.throws(
    () => evaluate(pcbComplianceAdapter, effective, hostileAuthFamFacts),
    (error) => {
      assert.equal(error.code, "PCB_TYPED_FACTS_INVALID");
      assert.ok(!error.message.includes("Bearer token_secret"));
      return true;
    },
  );

  // 5. Hostile case_id in request
  const reqHostileCase = requestForEffectiveEnvelope(effective, "case_test");
  reqHostileCase.domain_input.rows[0].case_id = "sk-12345678901234567890";
  assert.throws(
    () => assessPcbCompliance(reqHostileCase, effective),
    (error) => {
      assert.equal(error.code, "PCB_INPUT_REFUSED");
      assert.ok(!error.message.includes("sk-12345678901234567890"));
      return true;
    },
  );

  // 6. Hostile authority_ref in row authority_bindings
  const reqHostileAuthRef = requestForEffectiveEnvelope(effective, "auth_test");
  reqHostileAuthRef.domain_input.rows[0].authority_bindings[0].authority_ref = "http://127.1/admin";
  assert.throws(
    () => assessPcbCompliance(reqHostileAuthRef, effective),
    (error) => {
      assert.equal(error.code, "PCB_INPUT_REFUSED");
      assert.ok(!error.message.includes("http://127.1/admin"));
      return true;
    },
  );

  // 7. Hostile evidence_ref in row observation
  const reqHostileEvidence = requestForEffectiveEnvelope(effective, "ev_test");
  const profileRow = reqHostileEvidence.domain_input.rows.find((r) => r.rule_id === "PCB-PROFILE-01");
  profileRow.observation.evidence_by_key.synthetic_evidence_ref = ["http://127.1/admin"];
  assert.throws(
    () => assessPcbCompliance(reqHostileEvidence, effective),
    (error) => {
      assert.equal(error.code, "PCB_INPUT_REFUSED");
      assert.ok(!error.message.includes("http://127.1/admin"));
      return true;
    },
  );
});

test("P1-D: Core Profile metadata and rule fields reject hostile strings without echo", () => {
  // 1. Profile source_locator = http://127.1/admin
  const hostileLocatorProfile = profileAdd({ sourceLocator: "http://127.1/admin" });
  assert.throws(
    () => compilePcbComplianceRules(resolveProfileBindings(hostileLocatorProfile, null)),
    (error) => {
      assert.equal(error.code, "PCB_PROFILE_RULE_INVALID");
      assert.ok(!error.message.includes("http://127.1/admin"));
      return true;
    },
    "Profile source_locator=http://127.1/admin must be rejected without echoing",
  );

  // 2. Profile source_modality = http://127.1/admin
  const hostileModalityProfile = profileAdd({ sourceModality: "http://127.1/admin" });
  assert.throws(
    () => compilePcbComplianceRules(resolveProfileBindings(hostileModalityProfile, null)),
    (error) => {
      assert.equal(error.code, "PCB_PROFILE_RULE_INVALID");
      assert.ok(!error.message.includes("http://127.1/admin"));
      return true;
    },
    "Profile source_modality=http://127.1/admin must be rejected without echoing",
  );

  // 3. Profile source_ref = ghp_12345678901234567890
  const hostileSourceRefProfile = profileAdd({ sourceRef: "ghp_12345678901234567890" });
  assert.throws(
    () => compilePcbComplianceRules(resolveProfileBindings(hostileSourceRefProfile, null)),
    (error) => {
      assert.ok(error.code === "PCB_PROFILE_BINDING_INVALID" || error.code === "PCB_PROFILE_RULE_INVALID");
      assert.ok(!error.message.includes("ghp_12345678901234567890"));
      return true;
    },
    "Profile source_ref=ghp_... must be rejected without echoing",
  );

  // 4. Profile profile_id = ghp_12345678901234567890
  const hostileProfileId = profileAdd({ profileId: "ghp_12345678901234567890" });
  assert.throws(
    () => compilePcbComplianceRules(resolveProfileBindings(hostileProfileId, null)),
    (error) => {
      assert.equal(error.code, "PCB_PROFILE_BINDING_INVALID");
      assert.ok(!error.message.includes("ghp_12345678901234567890"));
      return true;
    },
    "Profile profile_id=ghp_... must be rejected without echoing",
  );

  // 5. Profile revision_or_hash = sk-12345678901234567890
  const hostileRevision = profileAdd({ revisionOrHash: "sk-12345678901234567890" });
  assert.throws(
    () => compilePcbComplianceRules(resolveProfileBindings(hostileRevision, null)),
    (error) => {
      assert.equal(error.code, "PCB_PROFILE_BINDING_INVALID");
      assert.ok(!error.message.includes("sk-12345678901234567890"));
      return true;
    },
    "Profile revision_or_hash=sk-... must be rejected without echoing",
  );

  // 6. Profile extends_or_base_pin = xoxb-123456789012-123456789012
  const hostileExtends = profileAdd({ extendsOrBasePin: "xoxb-123456789012-123456789012" });
  assert.throws(
    () => compilePcbComplianceRules(resolveProfileBindings(hostileExtends, null)),
    (error) => {
      assert.equal(error.code, "PCB_PROFILE_BINDING_INVALID");
      assert.ok(!error.message.includes("xoxb-123456789012-123456789012"));
      return true;
    },
    "Profile extends_or_base_pin=xoxb-... must be rejected without echoing",
  );
});

test("RED/GREEN: verifyPcbComplianceResult rejects mutations, rehashed forgeries, and missing/wrong trusted inputs", () => {
  const organization = profileAdd();
  const effective = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(organization, null), {});
  const req = requestForEffectiveEnvelope(effective, "verify_test");

  // 1. Valid derived result with observed claim ceiling passes verification with trusted request
  const validDerivedResult = assessPcbCompliance(req, effective);
  assert.equal(validDerivedResult.domain_result.claim_ceiling, "observed");
  const verification = verifyPcbComplianceResult(validDerivedResult, effective, req);
  assert.equal(verification.verified, true);
  assert.equal(verification.input_digest, validDerivedResult.receipt.input_digest);
  assert.equal(verification.assessment_digest, validDerivedResult.receipt.assessment_digest);
  assert.equal(verification.domain_result_digest, validDerivedResult.receipt.domain_result_digest);
  assert.equal(verification.result_digest, validDerivedResult.receipt.result_digest);

  // 2. Claim-only mutation (tampering claim_ceiling to source_supported without touching receipt)
  const claimOnlyMutation = structuredClone(validDerivedResult);
  claimOnlyMutation.domain_result.claim_ceiling = "source_supported";
  assert.throws(
    () => verifyPcbComplianceResult(claimOnlyMutation, effective, req),
    (error) => error.code === "PCB_INPUT_REFUSED",
    "claim-only mutation must be rejected by verification",
  );

  // 3. Claim mutation plus self-consistent receipt rehash
  const rehashedMutation = structuredClone(validDerivedResult);
  rehashedMutation.domain_result.claim_ceiling = "source_supported";
  const drOrder = arrayOrderRules(rehashedMutation.domain_result);
  rehashedMutation.receipt.domain_result_digest = sha256Hex(`soulforge.pcb_compliance.domain_result.v0\n${canonicalise(rehashedMutation.domain_result, drOrder)}`);
  const resMat = { assessment: rehashedMutation.assessment, domain_result: rehashedMutation.domain_result };
  const resOrder = { ...arrayOrderRules(resMat), results: "sorted_by:rule_id", "assessment.results": "sorted_by:rule_id" };
  rehashedMutation.receipt.result_digest = sha256Hex(`soulforge.pcb_compliance.result.v0\n${canonicalise(resMat, resOrder)}`);
  assert.throws(
    () => verifyPcbComplianceResult(rehashedMutation, effective, req),
    (error) => error.code === "PCB_INPUT_REFUSED",
    "claim mutation with self-consistent receipt rehash must still be rejected by verification against effective rules",
  );

  // 4. project_facts_provenance mutation and both copies self-rehashed
  const typedFacts = adaptedFactsForEffective(effective, req, "provenance_tamper_test");
  const coreResult = evaluate(pcbComplianceAdapter, effective, typedFacts);
  assert.ok(coreResult.domain_result.project_facts_provenance);
  assert.ok(coreResult.receipt.project_facts_provenance);

  // Valid core result passes verification with typedFacts
  assert.doesNotThrow(() => verifyPcbComplianceResult(coreResult, effective, typedFacts));
  // Valid core result passes verification with closed container { request, project_facts_provenance }
  assert.doesNotThrow(() => verifyPcbComplianceResult(coreResult, effective, {
    request: req,
    project_facts_provenance: coreResult.domain_result.project_facts_provenance,
  }));

  // Both provenance copies + all digests self-rehashed (attacker replaces project_id, facts_digest in both copies)
  const bothProvForged = structuredClone(coreResult);
  bothProvForged.domain_result.project_facts_provenance.project_binding_ref.project_id = "forged_project_id";
  bothProvForged.domain_result.project_facts_provenance.project_binding_ref.source_manifest_ref = "forged_manifest_ref";
  bothProvForged.domain_result.project_facts_provenance.facts_digest = "f".repeat(64);
  bothProvForged.receipt.project_facts_provenance = structuredClone(bothProvForged.domain_result.project_facts_provenance);
  const acceptedReq = validateRequest(req, effective);
  const forgedCanInput = {
    request: acceptedReq,
    ruleset_ref: { ...effective.ruleset_ref },
    source_packet_ref: { ...effective.source_packet_ref },
    project_facts_provenance: bothProvForged.receipt.project_facts_provenance,
  };
  bothProvForged.receipt.input_digest = sha256Hex(`soulforge.pcb_compliance.input.v0\n${canonicalise(forgedCanInput, { ...arrayOrderRules(forgedCanInput), rows: "sorted_by:rule_id", "request.domain_input.rows": "sorted_by:rule_id" })}`);
  const forgedAssessMat = { assessment: bothProvForged.assessment, project_facts_provenance: bothProvForged.receipt.project_facts_provenance };
  bothProvForged.receipt.assessment_digest = sha256Hex(`soulforge.pcb_compliance.assessment.v0\n${canonicalise(forgedAssessMat, { ...arrayOrderRules(forgedAssessMat), results: "sorted_by:rule_id", "assessment.results": "sorted_by:rule_id" })}`);
  bothProvForged.receipt.domain_result_digest = sha256Hex(`soulforge.pcb_compliance.domain_result.v0\n${canonicalise(bothProvForged.domain_result, arrayOrderRules(bothProvForged.domain_result))}`);
  const forgedResMat = { assessment: bothProvForged.assessment, domain_result: bothProvForged.domain_result };
  bothProvForged.receipt.result_digest = sha256Hex(`soulforge.pcb_compliance.result.v0\n${canonicalise(forgedResMat, { ...arrayOrderRules(forgedResMat), results: "sorted_by:rule_id", "assessment.results": "sorted_by:rule_id" })}`);
  assert.throws(
    () => verifyPcbComplianceResult(bothProvForged, effective, typedFacts),
    (error) => error.code === "PCB_INPUT_REFUSED",
    "both provenance copies tampered and all digests self-rehashed must reject against trusted Typed Facts",
  );

  // 5. source_locator/ref/modality/coverage changed + all digests self-rehashed
  for (const field of ["source_locator", "source_ref", "source_modality", "coverage_area"]) {
    const tamperedRuleMeta = structuredClone(validDerivedResult);
    tamperedRuleMeta.assessment.results[0][field] = "forged_value";
    const assessMat = { assessment: tamperedRuleMeta.assessment };
    tamperedRuleMeta.receipt.assessment_digest = sha256Hex(`soulforge.pcb_compliance.assessment.v0\n${canonicalise(assessMat, { ...arrayOrderRules(assessMat), results: "sorted_by:rule_id", "assessment.results": "sorted_by:rule_id" })}`);
    const rMat = { assessment: tamperedRuleMeta.assessment, domain_result: tamperedRuleMeta.domain_result };
    tamperedRuleMeta.receipt.result_digest = sha256Hex(`soulforge.pcb_compliance.result.v0\n${canonicalise(rMat, { ...arrayOrderRules(rMat), results: "sorted_by:rule_id", "assessment.results": "sorted_by:rule_id" })}`);
    assert.throws(
      () => verifyPcbComplianceResult(tamperedRuleMeta, effective, req),
      (error) => error.code === "PCB_INPUT_REFUSED",
      `tampered assessment ${field} with self-rehashed receipt must reject`,
    );
  }

  // 6. state/reason/counts self-consistently changed + all digests self-rehashed
  const tamperedOutcome = structuredClone(validDerivedResult);
  const targetRow = tamperedOutcome.assessment.results.find((r) => r.state === "UNKNOWN");
  targetRow.state = "SATISFIED";
  targetRow.reason_code = "PCB_EVIDENCE_READY";
  tamperedOutcome.assessment.counts.UNKNOWN -= 1;
  tamperedOutcome.assessment.counts.SATISFIED += 1;
  const outcomeAssessMat = { assessment: tamperedOutcome.assessment };
  tamperedOutcome.receipt.assessment_digest = sha256Hex(`soulforge.pcb_compliance.assessment.v0\n${canonicalise(outcomeAssessMat, { ...arrayOrderRules(outcomeAssessMat), results: "sorted_by:rule_id", "assessment.results": "sorted_by:rule_id" })}`);
  const outcomeRMat = { assessment: tamperedOutcome.assessment, domain_result: tamperedOutcome.domain_result };
  tamperedOutcome.receipt.result_digest = sha256Hex(`soulforge.pcb_compliance.result.v0\n${canonicalise(outcomeRMat, { ...arrayOrderRules(outcomeRMat), results: "sorted_by:rule_id", "assessment.results": "sorted_by:rule_id" })}`);
  assert.throws(
    () => verifyPcbComplianceResult(tamperedOutcome, effective, req),
    (error) => error.code === "PCB_INPUT_REFUSED",
    "tampered outcome state/reason/counts with self-rehashed receipt must reject",
  );

  // 7. Missing and wrong trusted input
  assert.throws(() => verifyPcbComplianceResult(validDerivedResult, effective, null), (error) => error.code === "PCB_INPUT_REFUSED");
  assert.throws(() => verifyPcbComplianceResult(validDerivedResult, effective, undefined), (error) => error.code === "PCB_INPUT_REFUSED");
  assert.throws(() => verifyPcbComplianceResult(validDerivedResult, effective, { unexpected: true }), (error) => error.code === "PCB_INPUT_REFUSED");
});
