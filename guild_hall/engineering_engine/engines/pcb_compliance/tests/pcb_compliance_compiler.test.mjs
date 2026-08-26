import test from "node:test";
import assert from "node:assert/strict";

import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { createProjectBindingAdapter } from "../../../core/interfaces/project_binding_adapter.mjs";
import { pcbComplianceAdapter } from "../evaluator/pcb_compliance_evaluator_adapter.mjs";
import { calculatePcbDerivedRulesetContentId, compilePcbComplianceRules } from "../compiler/pcb_compliance_compiler_adapter.mjs";
import { validatePcbEffectiveRuleSet } from "../evaluator/pcb_compliance.mjs";
import { buildPcbCompliancePublicSyntheticRequest } from "../fixtures/pcb_compliance_public_synthetic.mjs";
import { PCB_COMPLIANCE_RULES, projectPcbRuleForDigest } from "../rules/pcb_compliance_rules.mjs";

function profileAdd({
  profileId = "pcb_public_synthetic_org",
  sourceRef = "synthetic-profile-source-v1",
  ruleId = "PCB-PROFILE-01",
  authorityFamilies = ["project_contract_baseline"],
  artifactTokens = [null],
  controlledClauseHold = false,
} = {}) {
  return {
    profile_kind: "organization",
    profile_id: profileId,
    domain_engine_id: "pcb_compliance",
    revision_or_hash: "pcb_public_synthetic_org_v1",
    extends_or_base_pin: "pcb_compliance:v0",
    source_refs: [sourceRef],
    operations: [{
      op: "add",
      rule: {
        rule_id: ruleId,
        source_ref: sourceRef,
        source_locator: "synthetic:1",
        source_modality: "synthetic fixture only",
        coverage_area: "inspection",
        required_authority_families: authorityFamilies,
        expected_evidence_keys: ["synthetic_evidence_ref"],
        allowed_artifact_tokens: artifactTokens,
        controlled_clause_hold: controlledClauseHold,
      },
    }],
    order: 0,
  };
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

function adaptedFactsForEffective(effective, request, label) {
  const bindingAdapter = createProjectBindingAdapter("pcb_compliance", {
    schema_version: "soulforge.project_binding.v0",
    project_id: `public_synthetic_${label}`,
    binding_revision_hash: "b".repeat(64),
    source_manifest_ref: `public_synthetic_manifest_${label}`,
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

test("PCB derived ruleset roundtrips exactly and rejects digest, rule, and authority tampering", () => {
  const derived = assembleEffectiveRuleSet(pcbComplianceAdapter, resolveProfileBindings(profileAdd(), null), {}).effective_rule_set;
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(derived));

  const ruleTamper = structuredClone(derived);
  ruleTamper.rules.find((rule) => rule.rule_id === "PCB-PROFILE-01").source_locator = "synthetic:forged";
  assert.throws(() => validatePcbEffectiveRuleSet(ruleTamper), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const contentTamper = structuredClone(derived);
  contentTamper.ruleset_ref.content_id = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  assert.throws(() => validatePcbEffectiveRuleSet(contentTamper), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const authorityTamper = structuredClone(derived);
  authorityTamper.rules.find((rule) => rule.rule_id === "PCB-PROFILE-01").required_authority_families = ["unregistered_authority_family"];
  assert.throws(() => validatePcbEffectiveRuleSet(authorityTamper), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const provenanceTamper = structuredClone(derived);
  provenanceTamper.profile_rule_provenance["PCB-PROFILE-01"].profile_id = "forged_profile";
  assert.throws(() => validatePcbEffectiveRuleSet(provenanceTamper), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const mutatedBase = structuredClone(derived);
  mutatedBase.rules.find((rule) => rule.rule_id === "PCB-NASA-FAB-01").source_locator = "synthetic:mutated-base";
  mutatedBase.ruleset_ref.content_id = calculatePcbDerivedRulesetContentId(mutatedBase.rules, mutatedBase.profile_rule_provenance);
  assert.throws(() => validatePcbEffectiveRuleSet(mutatedBase), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const deletedBase = structuredClone(derived);
  deletedBase.rules = deletedBase.rules.filter((rule) => rule.rule_id !== "PCB-NASA-PROTECT-01");
  deletedBase.rule_count = deletedBase.rules.length;
  deletedBase.ruleset_ref.content_id = calculatePcbDerivedRulesetContentId(deletedBase.rules, deletedBase.profile_rule_provenance);
  assert.throws(() => validatePcbEffectiveRuleSet(deletedBase), (error) => error.code === "PCB_EFFECTIVE_RULESET_INVALID");

  const controlledBypass = structuredClone(derived);
  const profileRule = controlledBypass.rules.find((rule) => rule.rule_id === "PCB-PROFILE-01");
  profileRule.source_ref = "S-IPC-REVISION-CATALOG";
  profileRule.controlled_clause_hold = false;
  controlledBypass.profile_rule_provenance["PCB-PROFILE-01"].source_ref = "S-IPC-REVISION-CATALOG";
  controlledBypass.ruleset_ref.content_id = calculatePcbDerivedRulesetContentId(controlledBypass.rules, controlledBypass.profile_rule_provenance);
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
  assert.doesNotThrow(() => validatePcbEffectiveRuleSet(derived));
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
