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
import "../../engines/material_procurement_readiness/evaluator/material_procurement_readiness_evaluator_adapter.mjs";
import "../../engines/reliability_maintainability/evaluator/reliability_maintainability_evaluator_adapter.mjs";
import "../../engines/calibration_measurement_validity/evaluator/calibration_measurement_validity_evaluator_adapter.mjs";
import "../../engines/configuration_change_impact/evaluator/configuration_change_impact_evaluator_adapter.mjs";
import "../../engines/manufacturing_readiness/evaluator/manufacturing_readiness_evaluator_adapter.mjs";
import "../../engines/field_failure_corrective_action/evaluator/field_failure_corrective_action_evaluator_adapter.mjs";
import "../../engines/safety_hazard/evaluator/safety_hazard_evaluator_adapter.mjs";
import "../../engines/pcb_compliance/evaluator/pcb_compliance_evaluator_adapter.mjs";

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

  const mprAdapter = loadDomainEngineAdapter("material_procurement_readiness");
  assert.equal(mprAdapter.domain_engine_id, "material_procurement_readiness");
  assert.ok(validateDomainEngineAdapter(mprAdapter));

  const rmAdapter = loadDomainEngineAdapter("reliability_maintainability");
  assert.equal(rmAdapter.domain_engine_id, "reliability_maintainability");
  assert.ok(validateDomainEngineAdapter(rmAdapter));

  const cmvAdapter = loadDomainEngineAdapter("calibration_measurement_validity");
  assert.equal(cmvAdapter.domain_engine_id, "calibration_measurement_validity");
  assert.ok(validateDomainEngineAdapter(cmvAdapter));

  const cciAdapter = loadDomainEngineAdapter("configuration_change_impact");
  assert.equal(cciAdapter.domain_engine_id, "configuration_change_impact");
  assert.ok(validateDomainEngineAdapter(cciAdapter));

  const mrAdapter = loadDomainEngineAdapter("manufacturing_readiness");
  assert.equal(mrAdapter.domain_engine_id, "manufacturing_readiness");
  assert.ok(validateDomainEngineAdapter(mrAdapter));

  const ffcaAdapter = loadDomainEngineAdapter("field_failure_corrective_action");
  assert.equal(ffcaAdapter.domain_engine_id, "field_failure_corrective_action");
  assert.ok(validateDomainEngineAdapter(ffcaAdapter));

  const shAdapter = loadDomainEngineAdapter("safety_hazard");
  assert.equal(shAdapter.domain_engine_id, "safety_hazard");
  assert.ok(validateDomainEngineAdapter(shAdapter));

  const pcbAdapter = loadDomainEngineAdapter("pcb_compliance");
  assert.equal(pcbAdapter.domain_engine_id, "pcb_compliance");
  assert.ok(validateDomainEngineAdapter(pcbAdapter));

  const revokedRef = Proxy.revocable({ domain_engine_id: "systems_engineering" }, {});
  revokedRef.revoke();
  assert.throws(
    () => loadDomainEngineAdapter(revokedRef.proxy),
    (error) => error.code === "DOMAIN_ADAPTER_INVALID",
  );

  let refReads = 0;
  const accessorRef = {};
  Object.defineProperty(accessorRef, "domain_engine_id", {
    enumerable: true,
    get() {
      refReads += 1;
      return "systems_engineering";
    },
  });
  assert.throws(
    () => loadDomainEngineAdapter(accessorRef),
    (error) => error.code === "DOMAIN_ADAPTER_INVALID",
  );
  assert.equal(refReads, 0);
  assert.equal(loadDomainEngineAdapter({ domain_engine_id: "systems_engineering" }), seAdapter);
});

test("Core Interface: Domain Adapter and compilation scope are snapshotted before use", () => {
  let adapterReads = 0;
  const proxyAdapter = new Proxy({}, {
    get() {
      adapterReads += 1;
      throw new Error("adapter get trap executed");
    },
    getPrototypeOf() {
      adapterReads += 1;
      throw new Error("adapter prototype trap executed");
    },
  });
  assert.throws(
    () => validateDomainEngineAdapter(proxyAdapter),
    (error) => error.code === "DOMAIN_ADAPTER_INVALID",
  );
  assert.equal(adapterReads, 0);

  const revokedAdapter = Proxy.revocable({}, {});
  revokedAdapter.revoke();
  assert.throws(
    () => validateDomainEngineAdapter(revokedAdapter.proxy),
    (error) => error.code === "DOMAIN_ADAPTER_INVALID",
  );

  let accessorReads = 0;
  const accessorAdapter = {
    revision: "core-adapter-accessor-v0",
    compile() { return {}; },
    evaluate() { return {}; },
  };
  Object.defineProperty(accessorAdapter, "domain_engine_id", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return "core_adapter_accessor";
    },
  });
  assert.throws(
    () => validateDomainEngineAdapter(accessorAdapter),
    (error) => error.code === "DOMAIN_ADAPTER_INVALID",
  );
  assert.equal(accessorReads, 0);

  let compileCalls = 0;
  const mutableAdapter = {
    domain_engine_id: "core_adapter_snapshot",
    revision: "core-adapter-snapshot-v0",
    compile() {
      compileCalls += 1;
      mutableAdapter.domain_engine_id = "mutated_after_admission";
      mutableAdapter.revision = "mutated-after-admission";
      return { effective_rule_set: { rules: [] }, rule_count: 0 };
    },
    evaluate() { return {}; },
  };
  const assembled = assembleEffectiveRuleSet(mutableAdapter, [], {});
  assert.equal(compileCalls, 1);
  assert.equal(assembled.domain_engine_id, "core_adapter_snapshot");
  assert.equal(assembled.compilation_trace.domain_adapter_revision, "core-adapter-snapshot-v0");

  const scopeAdapter = {
    domain_engine_id: "core_scope_probe",
    revision: "core-scope-probe-v0",
    compile(_bindings, scope) {
      compileCalls += 1;
      return { effective_rule_set: { rules: [], scope }, rule_count: 0 };
    },
    evaluate() { return {}; },
  };
  const callsBeforeRevokedScope = compileCalls;
  const revokedScope = Proxy.revocable({}, {});
  revokedScope.revoke();
  assert.throws(
    () => assembleEffectiveRuleSet(scopeAdapter, [], revokedScope.proxy),
    (error) => error.code === "RULE_ASSEMBLY_FAILED",
  );
  assert.equal(compileCalls, callsBeforeRevokedScope);

  let scopeReads = 0;
  const accessorScope = {};
  Object.defineProperty(accessorScope, "mode", {
    enumerable: true,
    get() {
      scopeReads += 1;
      return "unsafe";
    },
  });
  assert.throws(
    () => assembleEffectiveRuleSet(scopeAdapter, [], accessorScope),
    (error) => error.code === "RULE_ASSEMBLY_FAILED",
  );
  assert.equal(scopeReads, 0);
  assert.equal(compileCalls, callsBeforeRevokedScope);

  for (const scalarScope of ["scope", 1, true]) {
    assert.throws(
      () => assembleEffectiveRuleSet(scopeAdapter, [], scalarScope),
      (error) => error.code === "RULE_ASSEMBLY_FAILED",
    );
  }
  assert.equal(compileCalls, callsBeforeRevokedScope);

  const cyclicScope = {};
  cyclicScope.self = cyclicScope;
  assert.throws(
    () => assembleEffectiveRuleSet(scopeAdapter, [], cyclicScope),
    (error) => error.code === "RULE_ASSEMBLY_FAILED",
  );
  assert.equal(compileCalls, callsBeforeRevokedScope);

  let mutationError = null;
  const mutatingAdapter = {
    domain_engine_id: "systems_engineering",
    revision: "core-binding-freeze-probe-v0",
    compile(bindings) {
      try {
        bindings.pop();
      } catch (error) {
        mutationError = error;
      }
      return { effective_rule_set: { rules: [] }, rule_count: 0 };
    },
    evaluate() { return {}; },
  };
  const profile = {
    profile_kind: "organization",
    profile_id: "core-binding-freeze-profile",
    domain_engine_id: "systems_engineering",
    revision_or_hash: "rev-core-binding-freeze-1",
    extends_or_base_pin: "systems_engineering:generic_se_base:v0",
    source_refs: ["docs/core-binding-freeze.json"],
    operations: [],
    order: 0,
  };
  const mutationResult = assembleEffectiveRuleSet(mutatingAdapter, [profile], {});
  assert.equal(mutationError instanceof TypeError, true);
  assert.equal(mutationResult.compilation_trace.profiles.length, 1);
  assert.equal(mutationResult.compilation_trace.profiles[0].profile_id, profile.profile_id);

  const uncaughtMutatingAdapter = {
    ...mutatingAdapter,
    revision: "core-binding-freeze-uncaught-v0",
    compile(bindings) {
      bindings.pop();
      return { effective_rule_set: { rules: [] }, rule_count: 0 };
    },
  };
  assert.throws(
    () => assembleEffectiveRuleSet(uncaughtMutatingAdapter, [profile], {}),
    (error) => error.code === "RULE_ASSEMBLY_FAILED",
  );
});

test("Core Interface: evaluate admits the outer effective-rule envelope before any property read", () => {
  let adapterCalls = 0;
  const adapter = Object.freeze({
    domain_engine_id: "core_admission_probe",
    revision: "core-admission-probe-v0",
    compile() { return {}; },
    evaluate() {
      adapterCalls += 1;
      return Object.freeze({ accepted: true });
    },
  });

  let proxyReads = 0;
  const proxy = new Proxy({}, {
    get() {
      proxyReads += 1;
      throw new Error("outer proxy get trap executed");
    },
    getPrototypeOf() {
      proxyReads += 1;
      throw new Error("outer proxy prototype trap executed");
    },
    getOwnPropertyDescriptor() {
      proxyReads += 1;
      throw new Error("outer proxy descriptor trap executed");
    },
    ownKeys() {
      proxyReads += 1;
      throw new Error("outer proxy ownKeys trap executed");
    },
  });
  assert.throws(
    () => evaluate(adapter, proxy, {}, {}, {}),
    (error) => error.code === "EVALUATION_FAILED",
  );
  assert.equal(proxyReads, 0);
  assert.equal(adapterCalls, 0);

  const revokedEffective = Proxy.revocable({}, {});
  revokedEffective.revoke();
  assert.throws(
    () => evaluate(adapter, revokedEffective.proxy, {}, {}, {}),
    (error) => error.code === "EVALUATION_FAILED",
  );
  assert.equal(adapterCalls, 0);

  let accessorReads = 0;
  const accessor = {};
  Object.defineProperty(accessor, "domain_engine_id", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return "core_admission_probe";
    },
  });
  assert.throws(
    () => evaluate(adapter, accessor, {}, {}, {}),
    (error) => error.code === "EVALUATION_FAILED",
  );
  assert.equal(accessorReads, 0);
  assert.equal(adapterCalls, 0);

  const symbolKeyed = { domain_engine_id: "core_admission_probe" };
  symbolKeyed[Symbol("hidden")] = true;
  assert.throws(
    () => evaluate(adapter, symbolKeyed, {}, {}, {}),
    (error) => error.code === "EVALUATION_FAILED",
  );
  assert.throws(
    () => evaluate(adapter, Object.create({ domain_engine_id: "core_admission_probe" }), {}, {}, {}),
    (error) => error.code === "EVALUATION_FAILED",
  );

  assert.throws(
    () => evaluate(adapter, { domain_engine_id: "different_domain" }, {}, {}, {}),
    (error) => error.code === "DOMAIN_ENGINE_MISMATCH",
  );
  assert.equal(adapterCalls, 0);

  assert.deepEqual(
    evaluate(adapter, { domain_engine_id: "core_admission_probe" }, {}, {}, {}),
    { accepted: true },
  );
  assert.deepEqual(evaluate(adapter, {}, {}, {}, {}), { accepted: true });
  assert.equal(adapterCalls, 2);
});

test("Core Interface: Profile binding containers fail closed before hostile property reads", () => {
  const valid = {
    profile_kind: "organization",
    profile_id: "core-profile-admission",
    domain_engine_id: "systems_engineering",
    revision_or_hash: "rev-core-profile-1",
    extends_or_base_pin: "systems_engineering:generic_se_base:v0",
    source_refs: ["docs/core-profile-source.json"],
    operations: [],
    order: 0,
  };

  let outerReads = 0;
  const outerProxy = new Proxy(valid, {
    get() {
      outerReads += 1;
      throw new Error("profile outer get trap executed");
    },
    getPrototypeOf() {
      outerReads += 1;
      throw new Error("profile outer prototype trap executed");
    },
    ownKeys() {
      outerReads += 1;
      throw new Error("profile outer ownKeys trap executed");
    },
  });
  assert.throws(
    () => validateProfileBinding(outerProxy, 0),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );
  assert.throws(
    () => resolveProfileBindings(outerProxy),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );
  assert.equal(outerReads, 0);

  const revokedProfile = Proxy.revocable(valid, {});
  revokedProfile.revoke();
  assert.throws(
    () => validateProfileBinding(revokedProfile.proxy, 0),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );

  let accessorReads = 0;
  const accessor = { ...valid };
  Object.defineProperty(accessor, "profile_id", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return "core-profile-admission";
    },
  });
  assert.throws(
    () => validateProfileBinding(accessor, 0),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );
  assert.equal(accessorReads, 0);

  let sourceReads = 0;
  const sourceRefs = new Proxy(valid.source_refs, {
    get() {
      sourceReads += 1;
      throw new Error("source_refs trap executed");
    },
  });
  assert.throws(
    () => validateProfileBinding({ ...valid, source_refs: sourceRefs }, 0),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );
  assert.equal(sourceReads, 0);

  const revokedSources = Proxy.revocable(["docs/core-profile-source.json"], {});
  revokedSources.revoke();
  assert.throws(
    () => validateProfileBinding({ ...valid, source_refs: revokedSources.proxy }, 0),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );

  let listReads = 0;
  const bindingList = new Proxy([valid], {
    get() {
      listReads += 1;
      throw new Error("binding list trap executed");
    },
  });
  const seAdapter = loadDomainEngineAdapter("systems_engineering");
  assert.throws(
    () => assembleEffectiveRuleSet(seAdapter, bindingList),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );
  assert.equal(listReads, 0);

  const revokedList = Proxy.revocable([valid], {});
  revokedList.revoke();
  assert.throws(
    () => assembleEffectiveRuleSet(seAdapter, revokedList.proxy),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );

  const revokedOperations = Proxy.revocable([], {});
  revokedOperations.revoke();
  assert.throws(
    () => validateProfileBinding({ ...valid, operations: revokedOperations.proxy }, 0),
    (error) => error.code === "PROFILE_OPERATIONS_INVALID",
  );

  const namedSources = [...valid.source_refs];
  Object.defineProperty(namedSources, "4294967295", { value: "hidden", enumerable: true });
  assert.throws(
    () => validateProfileBinding({ ...valid, source_refs: namedSources }, 0),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );

  const namedBindingList = [valid];
  Object.defineProperty(namedBindingList, "4294967295", { value: valid, enumerable: true });
  assert.throws(
    () => assembleEffectiveRuleSet(seAdapter, namedBindingList),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );

  const namedOperations = [];
  Object.defineProperty(namedOperations, "4294967295", { value: {}, enumerable: true });
  assert.throws(
    () => validateProfileBinding({ ...valid, operations: namedOperations }, 0),
    (error) => error.code === "PROFILE_OPERATIONS_INVALID",
  );

  const symbolKeyed = { ...valid, [Symbol("hidden")]: true };
  assert.throws(
    () => validateProfileBinding(symbolKeyed, 0),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );
  assert.throws(
    () => validateProfileBinding(Object.assign(Object.create(null), valid), 0),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );
  assert.throws(
    () => validateProfileBinding({ ...valid, profile_kind: "invalid" }, 0, "organization"),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );
  assert.throws(
    () => resolveProfileBindings({ ...valid, profile_kind: "project" }),
    (error) => error.code === "PROFILE_BINDING_INVALID",
  );

  const admitted = validateProfileBinding(valid, 0);
  assert.equal(admitted.profile_id, valid.profile_id);
  assert.deepEqual(admitted.source_refs, valid.source_refs);
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
