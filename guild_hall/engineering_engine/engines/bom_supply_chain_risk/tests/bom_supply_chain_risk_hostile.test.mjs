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

function withDfars7007Gates(clauseStatus, casStatus) {
  const observation = buildBomSupplyChainRiskPublicSyntheticObservation();
  const evidenceMembers = [
    {
      basis_ref: basisFor("dfars-7008-clause"),
      source_id: "S3-DFARS-252.246-7008",
      gate: "clause_incorporation",
      evidence_class: "project_typed_fact",
    },
  ];
  observation.source_applicability["S3-DFARS-252.246-7008"].basis_ref = basisFor("dfars-7008-clause");
  const gate = (name, status) => {
    if (status !== "affirmative") return { status };
    const basis_ref = basisFor(`dfars-7007-${name}`);
    evidenceMembers.push({
      basis_ref,
      source_id: "S2-DFARS-252.246-7007",
      gate: name,
      evidence_class: "project_typed_fact",
    });
    return { status, basis_ref };
  };
  observation.source_applicability["S2-DFARS-252.246-7007"] = {
    status: clauseStatus === "affirmative" && casStatus === "affirmative" ? "bound_applicable" : "unknown",
    clause_incorporation: gate("clause_incorporation", clauseStatus),
    cost_accounting_standards_applicability: gate("cost_accounting_standards_applicability", casStatus),
  };
  observation.applicability_evidence = evidenceMembers;
  return observation;
}

function basisFor(name) {
  if (name.includes("7008")) return `basis:s3_clause-${name}`;
  if (name.includes("cas") || name.includes("cost")) return `basis:s2_cas-${name}`;
  return `basis:s2_clause-${name}`;
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
    "S2-DFARS-252.246-7007": {
      status: "unknown",
      clause_incorporation: { status: "unknown" },
      cost_accounting_standards_applicability: { status: "unknown" },
    },
    "S3-DFARS-252.246-7008": { status: "unknown" },
    "S4-NIST-MEP-2024": { status: "educational_only" },
    "S5-NIST-SP-800-161R1-UPD1": { status: "educational_only" },
  };
  observation.applicability_evidence = [];
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
  delete observation.applicability_evidence;
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
  const acceptsCoreOrDomainRulesEnvelopeRefusal = (error) => (
    error.code === "BOM_SCR_EFFECTIVE_RULESET_INVALID"
    || (
      error.code === "EVALUATION_FAILED"
      && error.message === "EVALUATION_FAILED: effectiveRuleSet may contain only enumerable own data properties"
    )
  );
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, rulesEnvelope, facts, {}, {}),
    acceptsCoreOrDomainRulesEnvelopeRefusal,
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

test("BOM/SCR evaluator: DFARS 252.246-7007 needs both evidenced clause and CAS gates", () => {
  for (const clauseStatus of ["unknown", "negative", "affirmative"]) {
    for (const casStatus of ["unknown", "negative", "affirmative"]) {
      const result = evaluate(
        bomSupplyChainRiskAdapter,
        assembleWithPublicSyntheticProfile(),
        typedFactsFromObservation(withDfars7007Gates(clauseStatus, casStatus)),
        {},
        {},
      );
      const counterfeit = finding(result, "synthetic-healthy", "counterfeit_control");
      const bothAffirmative = clauseStatus === "affirmative" && casStatus === "affirmative";
      assert.equal(counterfeit.state, bothAffirmative ? "evidence_sufficient" : "unknown");
      assert.deepEqual(counterfeit.source.applicability_gates, {
        clause_incorporation: clauseStatus === "affirmative"
          ? { status: clauseStatus, basis_ref: basisFor("dfars-7007-clause_incorporation") }
          : { status: clauseStatus },
        cost_accounting_standards_applicability: casStatus === "affirmative"
          ? { status: casStatus, basis_ref: basisFor("dfars-7007-cost_accounting_standards_applicability") }
          : { status: casStatus },
      });
      assert.deepEqual(
        result.receipt.bindings.source_applicability["S2-DFARS-252.246-7007"],
        {
          status: bothAffirmative ? "bound_applicable" : "unknown",
          clause_incorporation: counterfeit.source.applicability_gates.clause_incorporation,
          cost_accounting_standards_applicability: counterfeit.source.applicability_gates.cost_accounting_standards_applicability,
        },
      );
    }
  }
});

test("BOM/SCR evaluator: DFARS gate basis references must be admitted matching evidence members", () => {
  const legacy = withDfars7007Gates("affirmative", "affirmative");
  legacy.source_applicability["S2-DFARS-252.246-7007"] = {
    status: "bound_applicable",
    basis_ref: basisFor("legacy-single-token"),
  };
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), typedFactsFromObservation(legacy), {}, {}),
    (error) => error.code === "BOM_SCR_APPLICABILITY_EVIDENCE_INVALID",
  );

  for (const [field, value] of [
    ["source_id", "S3-DFARS-252.246-7008"],
    ["gate", "cost_accounting_standards_applicability"],
    ["evidence_class", "authority_assertion"],
  ]) {
    const forged = withDfars7007Gates("affirmative", "affirmative");
    forged.applicability_evidence.find((entry) => entry.gate === "clause_incorporation" && entry.source_id === "S2-DFARS-252.246-7007")[field] = value;
    assert.throws(
      () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), typedFactsFromObservation(forged), {}, {}),
      (error) => error.code === "BOM_SCR_APPLICABILITY_EVIDENCE_INVALID",
    );
  }

  const missing = withDfars7007Gates("affirmative", "affirmative");
  missing.applicability_evidence = missing.applicability_evidence.filter((entry) => entry.gate !== "cost_accounting_standards_applicability");
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), typedFactsFromObservation(missing), {}, {}),
    (error) => error.code === "BOM_SCR_APPLICABILITY_EVIDENCE_INVALID",
  );

  const unknownWithExtra = withDfars7007Gates("unknown", "unknown");
  unknownWithExtra.applicability_evidence.push({
    basis_ref: basisFor("unbound-extra"),
    source_id: "S2-DFARS-252.246-7007",
    gate: "clause_incorporation",
    evidence_class: "project_typed_fact",
  });
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), typedFactsFromObservation(unknownWithExtra), {}, {}),
    (error) => error.code === "BOM_SCR_APPLICABILITY_EVIDENCE_INVALID",
  );

  const digestTamper = structuredClone(buildBomSupplyChainRiskPublicSyntheticTypedFacts());
  digestTamper.facts[0].applicability_evidence[0].gate = "cost_accounting_standards_applicability";
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembleWithPublicSyntheticProfile(), digestTamper, {}, {}),
    (error) => error.code === "BOM_SCR_TYPED_FACTS_DIGEST_MISMATCH",
  );
});

test("BOM/SCR evaluator: all Core arguments are closed and time-aligned", () => {
  const assembly = assembleWithPublicSyntheticProfile();
  const facts = buildBomSupplyChainRiskPublicSyntheticTypedFacts();
  assert.doesNotThrow(() => evaluate(
    bomSupplyChainRiskAdapter,
    assembly,
    facts,
    {},
    { valid_at: facts.valid_at, known_at: facts.known_at },
  ));
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, facts, { permit: true }, {}),
    (error) => error.code === "BOM_SCR_AUTHORITY_INVALID",
  );
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, facts, {}, { valid_at: facts.valid_at, known_at: "2026-08-27T00:00:00.000Z" }),
    (error) => error.code === "BOM_SCR_CUTOFFS_INVALID",
  );

  let authorityReads = 0;
  const authority = new Proxy({}, { get(target, key, receiver) { authorityReads += 1; return Reflect.get(target, key, receiver); } });
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, facts, authority, {}),
    (error) => error.code === "BOM_SCR_AUTHORITY_INVALID",
  );
  assert.equal(authorityReads, 0);

  let authorityGetterCalls = 0;
  const getterAuthority = {};
  Object.defineProperty(getterAuthority, "permit", {
    enumerable: true,
    get() { authorityGetterCalls += 1; return true; },
  });
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, facts, getterAuthority, {}),
    (error) => error.code === "BOM_SCR_AUTHORITY_INVALID",
  );
  assert.equal(authorityGetterCalls, 0);

  let cutoffReads = 0;
  const cutoffs = new Proxy({}, { get(target, key, receiver) { cutoffReads += 1; return Reflect.get(target, key, receiver); } });
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, facts, {}, cutoffs),
    (error) => error.code === "BOM_SCR_CUTOFFS_INVALID",
  );
  assert.equal(cutoffReads, 0);

  let cutoffGetterCalls = 0;
  const getterCutoffs = {};
  Object.defineProperty(getterCutoffs, "valid_at", {
    enumerable: true,
    get() { cutoffGetterCalls += 1; return facts.valid_at; },
  });
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, facts, {}, getterCutoffs),
    (error) => error.code === "BOM_SCR_CUTOFFS_INVALID",
  );
  assert.equal(cutoffGetterCalls, 0);

  const inverted = structuredClone(facts);
  inverted.known_at = "2026-08-25T00:00:00.000Z";
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, inverted, {}, {}),
    (error) => error.code === "BOM_SCR_PROJECT_FACTS_REQUIRED",
  );
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, buildBomSupplyChainRiskPublicSyntheticObservation(), {}, {}),
    (error) => error.code === "BOM_SCR_PROJECT_FACTS_REQUIRED",
  );
  const hybrid = structuredClone(facts);
  hybrid.raw_observation = buildBomSupplyChainRiskPublicSyntheticObservation();
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, hybrid, {}, {}),
    (error) => error.code === "BOM_SCR_PROJECT_FACTS_REQUIRED",
  );
});

test("BOM/SCR evaluator: derived thresholds require a verified Core assembly wrapper", () => {
  const derivedAssembly = assembleWithPublicSyntheticProfile();
  assert.doesNotThrow(() => evaluate(bomSupplyChainRiskAdapter, derivedAssembly, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}));
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, derivedAssembly.effective_rule_set, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
    (error) => error.code === "BOM_SCR_ASSEMBLY_INTEGRITY",
  );

  for (const tamper of [
    (assembly) => { assembly.assembly_digest = "0".repeat(64); },
    (assembly) => { assembly.compilation_trace.compilation_scope = { caller_rehashed: true }; },
    (assembly) => { assembly.compilation_trace.organization_trace.operation_digest = "0".repeat(64); },
    (assembly) => { assembly.effective_rule_set.profile_threshold_provenance.max_lead_time_days.operation_index = 2; },
  ]) {
    const forged = structuredClone(derivedAssembly);
    tamper(forged);
    assert.throws(
      () => evaluate(bomSupplyChainRiskAdapter, forged, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
      (error) => error.code === "BOM_SCR_ASSEMBLY_INTEGRITY" || error.code === "BOM_SCR_DERIVED_RULESET_INTEGRITY",
    );
  }

  const baseAssembly = assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [], {});
  assert.doesNotThrow(() => evaluate(bomSupplyChainRiskAdapter, baseAssembly, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}));
  assert.doesNotThrow(() => evaluate(bomSupplyChainRiskAdapter, baseAssembly.effective_rule_set, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}));
});

test("BOM/SCR public-safe admission refuses credential-shaped bindings and local Profile refs", () => {
  const assembly = assembleWithPublicSyntheticProfile();
  const credentialShapedProjectId = ["s", "k", "-", "abcdefghijklmno"].join("");
  const unsafeFacts = structuredClone(buildBomSupplyChainRiskPublicSyntheticTypedFacts());
  unsafeFacts.project_binding_ref.project_id = credentialShapedProjectId;
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, assembly, unsafeFacts, {}, {}),
    (error) => error.code === "BOM_SCR_PROJECT_FACTS_REQUIRED",
  );

  const localProfileRef = ["C", ":", "\\", "Users", "\\", "name", "\\", "private", ".txt"].join("");
  const unsafeProfile = buildBomSupplyChainRiskPublicSyntheticProfile();
  unsafeProfile.source_refs = [localProfileRef];
  const [unsafeBinding] = resolveProfileBindings(unsafeProfile, null);
  assert.throws(
    () => compileBomSupplyChainRiskRules([unsafeBinding]),
    (error) => error.code === "BOM_SCR_PROFILE_BINDINGS_INVALID",
  );
});

test("BOM/SCR Core wrapper preserves full Organization and Project threshold programs", () => {
  const organizationProfile = buildBomSupplyChainRiskPublicSyntheticProfile();
  const projectProfile = buildBomSupplyChainRiskPublicSyntheticProfile();
  projectProfile.profile_kind = "project";
  projectProfile.profile_id = "public-synthetic-bom-supply-chain-risk-project";
  projectProfile.revision_or_hash = "public-synthetic-bom-supply-chain-risk-project-v0";
  projectProfile.source_refs = ["public-synthetic:bom-supply-chain-risk-project-profile-v0"];
  projectProfile.operations = [{ op: "set_threshold", metric: "max_lead_time_days", value: 45 }];
  projectProfile.order = 1;
  const bindings = resolveProfileBindings(organizationProfile, projectProfile);
  const assembly = assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, bindings, {});
  assert.equal(assembly.effective_rule_set.thresholds.max_lead_time_days, 45);
  assert.equal(assembly.effective_rule_set.profile_threshold_provenance.max_lead_time_days.profile_kind, "project");
  assert.doesNotThrow(() => evaluate(
    bomSupplyChainRiskAdapter,
    assembly,
    buildBomSupplyChainRiskPublicSyntheticTypedFacts(),
    {},
    {},
  ));
});

test("BOM/SCR Core wrapper accepts exact zero-operation Profile traces but rejects forged counts", () => {
  const zeroOperationOrganization = buildBomSupplyChainRiskPublicSyntheticProfile();
  zeroOperationOrganization.operations = [];
  const [binding] = resolveProfileBindings(zeroOperationOrganization, null);
  const assembly = assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [binding], {});
  assert.deepEqual(assembly.effective_rule_set.thresholds, {});
  assert.deepEqual(assembly.effective_rule_set.profile_threshold_provenance, {});
  assert.doesNotThrow(() => evaluate(
    bomSupplyChainRiskAdapter,
    assembly,
    buildBomSupplyChainRiskPublicSyntheticTypedFacts(),
    {},
    {},
  ));

  const forged = structuredClone(assembly);
  forged.compilation_trace.organization_trace.applied_operations_count = 1;
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, forged, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
    (error) => error.code === "BOM_SCR_ASSEMBLY_INTEGRITY",
  );

  const zeroOperationProject = buildBomSupplyChainRiskPublicSyntheticProfile();
  zeroOperationProject.profile_kind = "project";
  zeroOperationProject.profile_id = "public-synthetic-bom-supply-chain-risk-zero-project";
  zeroOperationProject.revision_or_hash = "public-synthetic-bom-supply-chain-risk-zero-project-v0";
  zeroOperationProject.source_refs = ["public-synthetic:bom-supply-chain-risk-zero-project-profile-v0"];
  zeroOperationProject.operations = [];
  zeroOperationProject.order = 0;
  const [projectBinding] = resolveProfileBindings(null, zeroOperationProject);
  const projectAssembly = assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [projectBinding], {});
  assert.doesNotThrow(() => evaluate(
    bomSupplyChainRiskAdapter,
    projectAssembly,
    buildBomSupplyChainRiskPublicSyntheticTypedFacts(),
    {},
    {},
  ));
});

test("BOM/SCR Core wrapper roots each retained Profile program kind to its trace slot", () => {
  const single = structuredClone(assembleWithPublicSyntheticProfile());
  single.effective_rule_set.profile_operation_programs[0].profile_kind = "project";
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, single, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
    (error) => error.code === "BOM_SCR_ASSEMBLY_INTEGRITY",
  );

  const organization = buildBomSupplyChainRiskPublicSyntheticProfile();
  const project = buildBomSupplyChainRiskPublicSyntheticProfile();
  project.profile_kind = "project";
  project.profile_id = "public-synthetic-bom-supply-chain-risk-kind-project";
  project.revision_or_hash = "public-synthetic-bom-supply-chain-risk-kind-project-v0";
  project.source_refs = ["public-synthetic:bom-supply-chain-risk-kind-project-profile-v0"];
  project.operations = [{ op: "set_threshold", metric: "max_lead_time_days", value: 45 }];
  project.order = 1;
  const two = structuredClone(assembleEffectiveRuleSet(
    bomSupplyChainRiskAdapter,
    resolveProfileBindings(organization, project),
    {},
  ));
  two.effective_rule_set.profile_operation_programs[0].profile_kind = "project";
  assert.throws(
    () => evaluate(bomSupplyChainRiskAdapter, two, buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {}),
    (error) => error.code === "BOM_SCR_ASSEMBLY_INTEGRITY",
  );
});
