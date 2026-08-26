import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptProjectEvidence,
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { compileBomSupplyChainRiskRules } from "../compiler/bom_supply_chain_risk_compiler_adapter.mjs";
import { bomSupplyChainRiskAdapter } from "../evaluator/bom_supply_chain_risk_evaluator_adapter.mjs";
import {
  buildBomSupplyChainRiskPublicSyntheticObservation,
  buildBomSupplyChainRiskPublicSyntheticProjectBinding,
  buildBomSupplyChainRiskPublicSyntheticProfile,
  buildBomSupplyChainRiskPublicSyntheticTypedFacts,
} from "../fixtures/bom_supply_chain_risk_public_synthetic.mjs";

function assembleWithPublicSyntheticProfile() {
  const [profile] = resolveProfileBindings(buildBomSupplyChainRiskPublicSyntheticProfile(), null);
  return assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [profile], {});
}

function finding(result, itemId, riskDimension) {
  return result.domain_result.findings.find((entry) => entry.item_id === itemId && entry.risk_dimension === riskDimension);
}

function typedFactsFromObservation(observation) {
  return adaptProjectEvidence(
    buildBomSupplyChainRiskPublicSyntheticProjectBinding(),
    {
      source_refs: ["public-synthetic:bom-supply-chain-risk-fixture-v0"],
      observations: [observation],
    },
    {
      valid_at: "2026-08-26T00:00:00.000Z",
      known_at: "2026-08-26T00:00:00.000Z",
    },
  ).typed_project_facts;
}

test("BOM/SCR compiler: only closed threshold Profile operations are accepted", () => {
  const invalid = buildBomSupplyChainRiskPublicSyntheticProfile();
  invalid.operations = [{ op: "add_rule", metric: "max_lead_time_days", value: 60 }];
  const [binding] = resolveProfileBindings(invalid, null);

  assert.throws(
    () => compileBomSupplyChainRiskRules([binding]),
    (error) => error.code === "BOM_SCR_PROFILE_OPERATION_INVALID",
  );
});

test("BOM/SCR compiler: forged Core operation digests and accessor-backed source refs fail closed", () => {
  const [validBinding] = resolveProfileBindings(buildBomSupplyChainRiskPublicSyntheticProfile(), null);
  const forgedDigest = structuredClone(validBinding);
  forgedDigest.operation_digest = "0".repeat(64);
  assert.throws(
    () => compileBomSupplyChainRiskRules([forgedDigest]),
    (error) => error.code === "BOM_SCR_PROFILE_BINDINGS_INVALID",
  );

  const accessorSources = structuredClone(validBinding);
  let getterCalls = 0;
  const originalSource = accessorSources.source_refs[0];
  Object.defineProperty(accessorSources.source_refs, "0", {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return originalSource;
    },
  });
  assert.throws(
    () => compileBomSupplyChainRiskRules([accessorSources]),
    (error) => error.code === "BOM_SCR_PROFILE_BINDINGS_INVALID",
  );
  assert.equal(getterCalls, 0);
});

test("BOM/SCR evaluator: absent Profile thresholds remain unknown rather than getting invented defaults", () => {
  const result = evaluate(
    bomSupplyChainRiskAdapter,
    assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [], {}),
    buildBomSupplyChainRiskPublicSyntheticTypedFacts(),
    {},
    {},
  );

  assert.equal(finding(result, "synthetic-healthy", "long_lead").state, "unknown");
  assert.equal(finding(result, "synthetic-healthy", "supplier_concentration").state, "unknown");
  assert.equal(finding(result, "synthetic-healthy", "geographic_concentration").state, "unknown");
});

test("BOM/SCR evaluator: a tampered source packet reference fails closed", () => {
  const compiled = assembleWithPublicSyntheticProfile();
  const tampered = structuredClone(compiled);
  tampered.effective_rule_set.source_packet_ref.content_id = `sha256:${"0".repeat(64)}`;

  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, tampered, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
    (error) => error.code === "BOM_SCR_EFFECTIVE_RULESET_UNSUPPORTED",
  );
});

test("BOM/SCR evaluator: accessor-backed facts are rejected without invoking the accessor", () => {
  const hostileFacts = structuredClone(buildBomSupplyChainRiskPublicSyntheticTypedFacts());
  let getterCalls = 0;
  const firstItem = hostileFacts.facts[0].bom_items[0];
  Object.defineProperty(hostileFacts.facts[0].bom_items, "0", {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return firstItem;
    },
  });

  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), hostileFacts, {}, {}),
    (error) => error.code === "BOM_SCR_PROJECT_FACTS_REQUIRED",
  );
  assert.equal(getterCalls, 0);
});

test("BOM/SCR evaluator: a conflict is retained and never resolved by source rank", () => {
  const result = evaluate(
    bomSupplyChainRiskAdapter,
    assembleWithPublicSyntheticProfile(),
    buildBomSupplyChainRiskPublicSyntheticTypedFacts(),
    {},
    {},
  );
  const retained = finding(result, "synthetic-conflict", "lifecycle_status");
  assert.equal(retained.state, "conflict");
  assert.equal(retained.reason_code, "typed_fact_conflict_retained");
});

test("BOM/SCR evaluator: conditional DFARS sources stay unknown until typed applicability is explicitly bound", () => {
  const observation = buildBomSupplyChainRiskPublicSyntheticObservation();
  observation.source_applicability = {
    "S1-DODM-4245.15": { status: "vocabulary_only" },
    "S2-DFARS-252.246-7007": { status: "unknown" },
    "S3-DFARS-252.246-7008": { status: "unknown" },
    "S4-NIST-MEP-2024": { status: "educational_only" },
    "S5-NIST-SP-800-161R1-UPD1": { status: "educational_only" },
  };
  const result = evaluate(
    bomSupplyChainRiskAdapter,
    assembleWithPublicSyntheticProfile(),
    typedFactsFromObservation(observation),
    {},
    {},
  );

  assert.equal(finding(result, "synthetic-healthy", "alternate_qualification").state, "unknown");
  assert.equal(finding(result, "synthetic-healthy", "counterfeit_control").state, "unknown");
});

test("BOM/SCR evaluator: an omitted typed applicability map defaults only conditional sources to unknown", () => {
  const observation = buildBomSupplyChainRiskPublicSyntheticObservation();
  delete observation.source_applicability;
  const result = evaluate(
    bomSupplyChainRiskAdapter,
    assembleWithPublicSyntheticProfile(),
    typedFactsFromObservation(observation),
    {},
    {},
  );
  assert.equal(finding(result, "synthetic-healthy", "lifecycle_status").state, "evidence_sufficient");
  assert.equal(finding(result, "synthetic-healthy", "alternate_qualification").state, "unknown");
  assert.equal(finding(result, "synthetic-healthy", "counterfeit_control").state, "unknown");
});

test("BOM/SCR evaluator: exact BOM identity and revision references are required in the typed snapshot and receipt", () => {
  const observation = buildBomSupplyChainRiskPublicSyntheticObservation();
  delete observation.bom_identity_ref;
  delete observation.bom_revision_ref;
  delete observation.source_system_revision_ref;

  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), typedFactsFromObservation(observation), {}, {}),
    (error) => error.code === "BOM_SCR_INPUT_INVALID",
  );
});

test("BOM/SCR evaluator: stale Core facts digests and stale derived ruleset references cannot change a verdict", () => {
  const staleFacts = structuredClone(buildBomSupplyChainRiskPublicSyntheticTypedFacts());
  staleFacts.facts[0].bom_items.find((item) => item.item_id === "synthetic-healthy").lifecycle_status = "end_of_life";
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), staleFacts, {}, {}),
    (error) => error.code === "BOM_SCR_TYPED_FACTS_DIGEST_MISMATCH",
  );

  const staleRuleSet = structuredClone(assembleWithPublicSyntheticProfile());
  staleRuleSet.effective_rule_set.thresholds.max_lead_time_days = 1;
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, staleRuleSet, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
    (error) => error.code === "BOM_SCR_DERIVED_RULESET_INTEGRITY",
  );

  const staleProvenance = structuredClone(assembleWithPublicSyntheticProfile());
  staleProvenance.effective_rule_set.profile_threshold_provenance.max_lead_time_days.source_refs.push("public-synthetic:forged-provenance");
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, staleProvenance, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
    (error) => error.code === "BOM_SCR_DERIVED_RULESET_INTEGRITY",
  );

  const extraNestedRuleKey = structuredClone(assembleWithPublicSyntheticProfile());
  extraNestedRuleKey.effective_rule_set.rules[0].extra = "forged";
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, extraNestedRuleKey, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
    (error) => error.code === "BOM_SCR_EFFECTIVE_RULESET_INVALID",
  );
});

test("BOM/SCR evaluator: outer envelope getters and proxies are refused before property access", () => {
  const facts = buildBomSupplyChainRiskPublicSyntheticTypedFacts();
  let typedGetterCalls = 0;
  const typedEnvelope = {};
  Object.defineProperty(typedEnvelope, "typed_project_facts", {
    enumerable: true,
    get() {
      typedGetterCalls += 1;
      return facts;
    },
  });
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), typedEnvelope, {}, {}),
    (error) => error.code === "BOM_SCR_PROJECT_FACTS_REQUIRED",
  );
  assert.equal(typedGetterCalls, 0);

  const assembly = assembleWithPublicSyntheticProfile();
  let rulesGetterCalls = 0;
  const rulesEnvelope = {};
  Object.defineProperty(rulesEnvelope, "effective_rule_set", {
    enumerable: true,
    get() {
      rulesGetterCalls += 1;
      return assembly.effective_rule_set;
    },
  });
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, rulesEnvelope, facts, {}, {}),
    (error) => error.code === "BOM_SCR_EFFECTIVE_RULESET_INVALID",
  );
  assert.equal(rulesGetterCalls, 0);

  let proxyGetCalls = 0;
  const proxiedFacts = new Proxy(facts, {
    get(target, key, receiver) {
      proxyGetCalls += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), proxiedFacts, {}, {}),
    (error) => error.code === "BOM_SCR_PROJECT_FACTS_REQUIRED",
  );
  assert.equal(proxyGetCalls, 0);
});

test("BOM/SCR admission rejects hidden, symbol, cyclic, depth, and array-budget hostile envelopes", () => {
  const assembly = assembleWithPublicSyntheticProfile();
  const facts = buildBomSupplyChainRiskPublicSyntheticTypedFacts();
  const rejectsTypedFacts = (value) => assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, value, {}, {}),
    (error) => error.code === "BOM_SCR_PROJECT_FACTS_REQUIRED",
  );

  const hidden = structuredClone(facts);
  Object.defineProperty(hidden, "hidden", { value: true, enumerable: false });
  rejectsTypedFacts(hidden);

  const symbolKey = structuredClone(facts);
  symbolKey[Symbol("hidden")] = true;
  rejectsTypedFacts(symbolKey);

  const cyclic = structuredClone(facts);
  cyclic.loop = cyclic;
  rejectsTypedFacts(cyclic);

  let deep = structuredClone(facts);
  for (let index = 0; index < 18; index += 1) deep = { nested: deep };
  rejectsTypedFacts(deep);

  const oversized = structuredClone(facts);
  oversized.facts = Array.from({ length: 10001 }, () => ({ snapshot_kind: "other_snapshot" }));
  rejectsTypedFacts(oversized);
});

test("BOM/SCR compiler: outer Profile Binding proxies are refused before array property access", () => {
  const [binding] = resolveProfileBindings(buildBomSupplyChainRiskPublicSyntheticProfile(), null);
  let proxyGetCalls = 0;
  const proxiedBindings = new Proxy([binding], {
    get(target, key, receiver) {
      proxyGetCalls += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(
    () => compileBomSupplyChainRiskRules(proxiedBindings),
    (error) => error.code === "BOM_SCR_PROFILE_BINDINGS_INVALID",
  );
  assert.equal(proxyGetCalls, 0);
});

test("BOM/SCR evaluator: explicit evidenced zero counts are risk findings while absent counts stay unknown", () => {
  const observation = buildBomSupplyChainRiskPublicSyntheticObservation();
  const healthy = observation.bom_items.find((item) => item.item_id === "synthetic-healthy");
  healthy.approved_source_count = 0;
  healthy.supplier_count = 0;
  healthy.geography_count = 0;

  const result = evaluate(
    bomSupplyChainRiskAdapter,
    assembleWithPublicSyntheticProfile(),
    typedFactsFromObservation(observation),
    {},
    {},
  );
  assert.equal(finding(result, "synthetic-healthy", "sole_source").state, "risk_detected");
  assert.equal(finding(result, "synthetic-healthy", "supplier_concentration").state, "risk_detected");
  assert.equal(finding(result, "synthetic-healthy", "geographic_concentration").state, "risk_detected");

  const missingObservation = buildBomSupplyChainRiskPublicSyntheticObservation();
  const missingHealthy = missingObservation.bom_items.find((item) => item.item_id === "synthetic-healthy");
  delete missingHealthy.approved_source_count;
  delete missingHealthy.supplier_count;
  delete missingHealthy.geography_count;
  const missingResult = evaluate(
    bomSupplyChainRiskAdapter,
    assembleWithPublicSyntheticProfile(),
    typedFactsFromObservation(missingObservation),
    {},
    {},
  );
  assert.equal(finding(missingResult, "synthetic-healthy", "sole_source").state, "unknown");
  assert.equal(finding(missingResult, "synthetic-healthy", "supplier_concentration").state, "unknown");
  assert.equal(finding(missingResult, "synthetic-healthy", "geographic_concentration").state, "unknown");
});
