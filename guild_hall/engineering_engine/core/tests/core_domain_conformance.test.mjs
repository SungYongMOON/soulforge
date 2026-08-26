import test from "node:test";
import assert from "node:assert/strict";

import {
  loadDomainEngineAdapter,
  validateDomainEngineAdapter,
  resolveProfileBindings,
  validateProfileBinding,
  assembleEffectiveRuleSet,
  evaluate,
  adaptProjectEvidence,
  DOMAIN_ENGINE_ADAPTER_SCHEMA_VERSION,
  PROFILE_BINDING_SCHEMA_VERSION,
  EFFECTIVE_RULE_SET_SCHEMA_VERSION,
  COMPILATION_TRACE_SCHEMA_VERSION,
} from "../interfaces/domain_engine_adapter.mjs";

import { adaptLegacyProjectProfile } from "../interfaces/project_profile_adapter.mjs";

import "../../engines/systems_engineering/evaluator/se_evaluator_adapter.mjs";
import "../../engines/quality_readiness/evaluator/quality_readiness_evaluator_adapter.mjs";
import "../../engines/database_engineering/evaluator/database_engineering_evaluator_adapter.mjs";

test("Core Interface: domain engine adapters register and load successfully", () => {
  const seAdapter = loadDomainEngineAdapter("systems_engineering");
  assert.equal(seAdapter.domain_engine_id, "systems_engineering");
  assert.ok(validateDomainEngineAdapter(seAdapter));

  const qrAdapter = loadDomainEngineAdapter("quality_readiness");
  assert.equal(qrAdapter.domain_engine_id, "quality_readiness");
  assert.ok(validateDomainEngineAdapter(qrAdapter));

  const dbAdapter = loadDomainEngineAdapter("database_engineering");
  assert.equal(dbAdapter.domain_engine_id, "database_engineering");
  assert.ok(validateDomainEngineAdapter(dbAdapter));
});

test("Core Interface: resolveProfileBindings preserves distinct Organization and Project Profile provenance", () => {
  const orgProfile = {
    profile_id: "org-defense-standard",
    domain_engine_id: "systems_engineering",
    revision_or_hash: "rev-2026.1",
    extends_or_base_pin: "systems_engineering:generic_se_base:v0",
    source_refs: ["docs/org_source.json"],
    operations: [
      { op: "alias", stage_code: "030_SRR", artifact_type_id: "srd", alias: "System Requirements Document" },
    ],
  };

  const projProfile = {
    profile_id: "proj-falcon-99",
    domain_engine_id: "systems_engineering",
    revision_or_hash: "rev-0.9.0",
    extends_or_base_pin: "org-defense-standard",
    source_refs: ["docs/proj_source.json"],
    operations: [
      { op: "condition", token: "sw_included" },
    ],
  };

  const bindings = resolveProfileBindings(orgProfile, projProfile);
  assert.equal(bindings.length, 2);

  // Org Profile check
  assert.equal(bindings[0].profile_kind, "organization");
  assert.equal(bindings[0].profile_id, "org-defense-standard");
  assert.equal(bindings[0].domain_engine_id, "systems_engineering");
  assert.equal(bindings[0].order, 0);
  assert.ok(bindings[0].operation_digest);

  // Project Profile check
  assert.equal(bindings[1].profile_kind, "project");
  assert.equal(bindings[1].profile_id, "proj-falcon-99");
  assert.equal(bindings[1].domain_engine_id, "systems_engineering");
  assert.equal(bindings[1].order, 1);
  assert.ok(bindings[1].operation_digest);
});

test("Core Interface: assembleEffectiveRuleSet produces effective rules and compilation trace for SE", () => {
  const seAdapter = loadDomainEngineAdapter("systems_engineering");
  const orgProfile = {
    profile_kind: "organization",
    profile_id: "org-standard",
    domain_engine_id: "systems_engineering",
    revision_or_hash: "rev-1.0.0",
    extends_or_base_pin: "generic_se_base:v0",
    source_refs: ["docs/org.json"],
    operations: [{ op: "condition", token: "sw_included" }],
  };
  const bindings = resolveProfileBindings(orgProfile);

  const result1 = assembleEffectiveRuleSet(seAdapter, bindings);
  assert.equal(result1.schema_version, EFFECTIVE_RULE_SET_SCHEMA_VERSION);
  assert.equal(result1.domain_engine_id, "systems_engineering");
  assert.ok(result1.effective_rule_set);
  assert.equal(result1.compilation_trace.schema_version, COMPILATION_TRACE_SCHEMA_VERSION);
  assert.equal(result1.compilation_trace.profiles.length, 1);
  assert.equal(result1.compilation_trace.profiles[0].profile_id, "org-standard");

  // Replay determinism check
  const result2 = assembleEffectiveRuleSet(seAdapter, bindings);
  assert.equal(result1.assembly_digest, result2.assembly_digest);
  assert.equal(result1.compilation_trace.effective_ruleset_digest, result2.compilation_trace.effective_ruleset_digest);
});

test("Core Interface: assembleEffectiveRuleSet produces effective rules and compilation trace for QR (empty and non-empty)", () => {
  const qrAdapter = loadDomainEngineAdapter("quality_readiness");
  const emptyOrgProfile = {
    profile_kind: "organization",
    profile_id: "qr-org-empty",
    domain_engine_id: "quality_readiness",
    revision_or_hash: "rev-qr-1.0.0",
    extends_or_base_pin: "qr_base:v0",
    source_refs: ["docs/qr_org.json"],
    operations: [],
  };
  const emptyBindings = resolveProfileBindings(emptyOrgProfile);
  const emptyResult = assembleEffectiveRuleSet(qrAdapter, emptyBindings);
  assert.equal(emptyResult.schema_version, EFFECTIVE_RULE_SET_SCHEMA_VERSION);
  assert.equal(emptyResult.domain_engine_id, "quality_readiness");
  assert.ok(emptyResult.effective_rule_set);
  assert.equal(emptyResult.compilation_trace.profiles[0].profile_id, "qr-org-empty");
  assert.equal(emptyResult.rule_count, 9);

  const validQrRule = {
    rule_id: "QR-CONF-01",
    source_ref: "docs/qr_org.json",
    source_locator: "§3.1",
    source_modality: "mandatory conformance rule",
    allowed_artifact_tokens: [null],
    required_authority_families: ["company_approved_procedure"],
    context_ref_fields: ["scope_ref"],
    sufficiency_fields: [],
  };

  const nonEmptyOrgProfile = {
    profile_kind: "organization",
    profile_id: "qr-org-rules",
    domain_engine_id: "quality_readiness",
    revision_or_hash: "rev-qr-1.0.1",
    extends_or_base_pin: "qr_base:v0",
    source_refs: ["docs/qr_org.json"],
    operations: [{ op: "add", rule: validQrRule }],
  };
  const nonEmptyBindings = resolveProfileBindings(nonEmptyOrgProfile);
  const nonEmptyResult = assembleEffectiveRuleSet(qrAdapter, nonEmptyBindings);
  assert.equal(nonEmptyResult.rule_count, 10);
  assert.notEqual(nonEmptyResult.assembly_digest, emptyResult.assembly_digest);
  assert.equal(nonEmptyResult.effective_rule_set.ruleset_ref.entity_id, "quality-readiness-ruleset-derived-v0");
  assert.ok(nonEmptyResult.effective_rule_set.rules.some((r) => r.rule_id === "QR-CONF-01"));
});

test("Core Interface: adaptLegacyProjectProfile translates legacy envelopes without loss of provenance", () => {
  const legacyEnvelope = {
    domain_engine_id: "systems_engineering",
    project_code: "PROJECT_ALPHA",
    revision: "rev-1.0.0",
    extends: "prime_synthetic_org_a",
    source_refs: ["docs/proj.json"],
    binding_revision_hash: "bind_rev_synthetic_1234567890abcdef",
    source_manifest_ref: "docs/manifests/synthetic_manifest.json",
    valid_at: "2026-08-25T12:00:00.000Z",
    known_at: "2026-08-25T12:00:00.000Z",
    prime_overlay: {
      profile_id: "prime_synthetic_org_a",
      revision: "r1",
      extends: "generic_se_base:v0",
      source_refs: ["docs/prime.json"],
      ops: [{ op: "alias", stage_code: "030_SRR", artifact_type_id: "srd", alias: "SRD" }],
    },
    operations: [{ op: "condition", token: "sw_included" }],
    conditions: ["hardware_only"],
    authority_family: "company_approved_procedure",
  };

  const adapted = adaptLegacyProjectProfile(legacyEnvelope);
  assert.equal(adapted.profile_bindings.length, 2);
  assert.equal(adapted.profile_bindings[0].profile_kind, "organization");
  assert.equal(adapted.profile_bindings[0].profile_id, "prime_synthetic_org_a");
  assert.equal(adapted.profile_bindings[1].profile_kind, "project");
  assert.equal(adapted.profile_bindings[1].profile_id, "PROJECT_ALPHA");
  assert.equal(adapted.profile_bindings[1].operations.length, 2);
});

test("Core Interface: adaptProjectEvidence produces typed project facts and observation receipt", () => {
  const projectBindingRef = {
    schema_version: "soulforge.project_binding.v0",
    project_id: "proj-alpha",
    domain_engine_id: "systems_engineering",
    binding_revision_hash: "a".repeat(64),
    source_manifest_ref: "manifests/manifest.json",
  };
  const sourceSnapshotRefs = {
    snapshot_id: "snap_001",
    source_refs: ["docs/srd.pdf"],
    observations: [
      { element_id: "obs_srd", presence_state: "present" },
    ],
  };

  const evidence = adaptProjectEvidence(projectBindingRef, sourceSnapshotRefs, {
    valid_at: "2026-08-25T00:00:00.000Z",
    known_at: "2026-08-25T00:00:00.000Z",
  });

  assert.equal(evidence.typed_project_facts.schema_version, "soulforge.typed_project_facts.v0");
  assert.equal(evidence.typed_project_facts.facts.length, 1);
  assert.equal(evidence.observation_receipt.facts_count, 1);
  assert.equal(evidence.observation_receipt.observed_at, "2026-08-25T00:00:00.000Z");
});
