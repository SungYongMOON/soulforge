import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  interfaceConsistencyAdapter,
} from "../evaluator/interface_consistency_evaluator_adapter.mjs";
import { compileInterfaceConsistencyRules, INTERFACE_CONSISTENCY_COMPILER_CODES } from "../compiler/interface_consistency_compiler_adapter.mjs";
import {
  assessInterfaceConsistency,
  digestInterfaceConsistencyAssessmentBody,
  evaluateInterfaceConsistency,
  INTERFACE_CONSISTENCY_EVALUATOR_CODES,
  INTERFACE_CONSISTENCY_STATES,
  verifyInterfaceConsistencyAssessment,
} from "../evaluator/interface_consistency.mjs";
import {
  buildInterfaceConsistencyPublicSyntheticRequest,
  INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE,
} from "../fixtures/interface_consistency_public_synthetic.mjs";
import {
  assembleEffectiveRuleSet,
  adaptProjectEvidence,
  arrayOrderRules,
  evaluate,
  resolveProfileBindings,
  withoutNulls,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import { INTERFACE_CONSISTENCY_SOURCE_PACKET_REF } from "../rules/interface_consistency_rules.mjs";
import { INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS } from "../rules/interface_consistency_safety_policy.mjs";
import { createInterfaceConsistencyModuleManifest } from "../topology/interface_consistency_module_manifest.mjs";
import { findLocalAbsolutePathViolations } from "../../../../validate/local_absolute_path_policy.mjs";

const RUNNER_PATH = fileURLToPath(new URL("../tools/interface_consistency_runner.mjs", import.meta.url));
const SOURCE_PACKET_PATH = fileURLToPath(new URL("../contracts/interface_consistency_source_packet_v0.md", import.meta.url));
const ASSESSMENT_SCHEMA_PATH = fileURLToPath(new URL("../schemas/interface_consistency_assessment_schema_v0.json", import.meta.url));
const INPUT_SCHEMA_PATH = fileURLToPath(new URL("../schemas/interface_consistency_schema_v0.json", import.meta.url));
const RULESET_SCHEMA_PATH = fileURLToPath(new URL("../schemas/interface_consistency_ruleset_schema_v0.json", import.meta.url));
const TOPOLOGY_PATH = fileURLToPath(new URL("../topology/interface_consistency_topology.json", import.meta.url));
const INTEGRATION_REQUEST_PATH = fileURLToPath(new URL("../contracts/interface_consistency_integration_request_v0.md", import.meta.url));
const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));

function interfaceById(request, interfaceId) {
  return request.interfaces.find((entry) => entry.interface_id === interfaceId);
}

function findingByRule(result, interfaceId, ruleId) {
  const pair_results = Object.fromEntries(Object.entries(result.assessments[interfaceId].pairs).map(([pairKey, pair]) => [
    pairKey,
    pair.rules.find((candidate) => candidate.rule_id === ruleId),
  ]));
  const first = Object.values(pair_results)[0];
  return {
    rule_id: first.rule_id,
    category: first.category,
    pair_results,
    state: aggregateStates(Object.values(pair_results).map((pair) => pair.state)),
  };
}

function aggregateStates(states) {
  if (states.includes("gap_conflict")) return "gap_conflict";
  if (states.includes("gap_missing")) return "gap_missing";
  if (states.includes("gap_unknown")) return "gap_unknown";
  if (states.every((state) => state === "not_applicable")) return "not_applicable";
  return "satisfied";
}

function summarizeAssessment(result) {
  const states_by_interface = Object.fromEntries(Object.entries(result.assessments).map(([interfaceId, assessment]) => [
    interfaceId,
    aggregateStates(Object.values(assessment.pairs).flatMap((pair) => pair.rules.map((rule) => rule.state))),
  ]));
  const states = Object.values(states_by_interface);
  return {
    states_by_interface,
    overall_state: aggregateStates(states),
    counts: {
      satisfied: states.filter((state) => state === "satisfied").length,
      gap_missing: states.filter((state) => state === "gap_missing").length,
      gap_unknown: states.filter((state) => state === "gap_unknown").length,
      gap_conflict: states.filter((state) => state === "gap_conflict").length,
      not_applicable: states.filter((state) => state === "not_applicable").length,
      total: states.length,
    },
  };
}

function thirdEndFrom(secondEnd, endId) {
  const output = structuredClone(secondEnd);
  output.end_id = endId;
  return output;
}

function setAttributeFact(request, interfaceId, category, leftFact, rightFact) {
  const record = interfaceById(request, interfaceId);
  record.ends[0].observations[category].attributes[0] = { attribute_id: record.ends[0].observations[category].attributes[0].attribute_id, ...leftFact };
  record.ends[1].observations[category].attributes[0] = { attribute_id: record.ends[1].observations[category].attributes[0].attribute_id, ...rightFact };
}

function prototypeTrapArray(values) {
  let trapCount = 0;
  const value = new Proxy(values, {
    getPrototypeOf() {
      trapCount += 1;
      throw new Error("getPrototypeOf must not execute");
    },
  });
  return { value, trapCount: () => trapCount };
}

function runtimeWindowsPath(...segments) {
  return ["C:", ...segments].join(String.fromCharCode(92));
}

function runtimePosixPath(...segments) {
  return `${String.fromCharCode(47)}${segments.join(String.fromCharCode(47))}`;
}

function runtimeCredentialPrefix(...parts) {
  return parts.join("");
}

function adaptSyntheticTypedFacts(register, suffix = "receipt") {
  return adaptProjectEvidence(
    {
      schema_version: "soulforge.project_binding.v0",
      project_id: `synthetic-${suffix}-project`,
      domain_engine_id: "interface_consistency",
      binding_revision_hash: "e".repeat(64),
      source_manifest_ref: `synthetic:${suffix}:manifest`,
    },
    {
      snapshot_id: `synthetic-${suffix}-snapshot`,
      source_refs: [`synthetic:${suffix}:source`],
      observations: [{ fact_type: "interface_consistency_register", register }],
    },
    { valid_at: "2026-08-26T00:00:00.000Z", known_at: "2026-08-26T00:00:00.000Z" },
  ).typed_project_facts;
}

function evaluateCoreAssembly(assembly, request, suffix = "core") {
  return evaluate(interfaceConsistencyAdapter, assembly, adaptSyntheticTypedFacts(request, suffix));
}

function manifestInput(overrides = {}) {
  return {
    module_version: "0.1.0",
    build_commit: "a".repeat(40),
    artifact_sha256: "b".repeat(64),
    engine_contract_abi_range: ">=1.0.0 <2.0.0",
    supported_project_classifications: ["public_synthetic"],
    dependency_versions: { engineering_engine_core: "1.0.0" },
    configuration_hash: "c".repeat(64),
    rollback_compatible_with: ["0.1.0"],
    test_receipt_ref: "receipt:synthetic_interface_consistency_test_r1",
    ...overrides,
  };
}

function createE02Ajv() {
  return new Ajv2020({ allErrors: true, strict: false });
}

function recomputeCoreEffectiveRulesetDigest(effectiveRuleSet) {
  const clean = withoutNulls(effectiveRuleSet);
  return sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(clean, arrayOrderRules(clean))}`);
}

function packageRelativeFiles(directory = PACKAGE_ROOT, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...packageRelativeFiles(join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

test("E02 public-synthetic fixture covers every terminal consistency state", () => {
  const result = assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest());

  assert.deepEqual(summarizeAssessment(result).states_by_interface, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.states_by_interface);
  assert.deepEqual(summarizeAssessment(result).counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
  assert.equal(result.execution_mode, "deterministic_only");
  assert.equal(result.external_effects.files_written, 0);
  assert.equal(result.external_effects.network_calls, 0);
});

test("E02 uses the existing Core compiler/evaluator seam without Core changes", () => {
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  const result = evaluateCoreAssembly(assembly, buildInterfaceConsistencyPublicSyntheticRequest(), "core-seam");

  assert.equal(assembly.domain_engine_id, "interface_consistency");
  assert.equal(assembly.rule_count, 8);
  assert.equal(summarizeAssessment(result).overall_state, INTERFACE_CONSISTENCY_STATES.CONFLICT);
  assert.deepEqual(summarizeAssessment(result).counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
});

test("E02 admits only neutral authority and matching Core cutoffs", () => {
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  const typed = adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "authority-cutoffs");
  const baseline = evaluate(interfaceConsistencyAdapter, assembly, typed);
  const supplied = evaluate(
    interfaceConsistencyAdapter,
    assembly,
    typed,
    {},
    { valid_at: "2026-08-26T00:00:00.000Z", known_at: "2026-08-26T00:00:00.000Z" },
  );
  assert.deepEqual(supplied, baseline);
  assert.throws(
    () => evaluate(interfaceConsistencyAdapter, assembly, typed, { authority_ref: "synthetic-authority" }),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
  assert.throws(
    () => evaluate(interfaceConsistencyAdapter, assembly, typed, {}, {
      valid_at: "2026-08-26T00:00:00.001Z",
      known_at: "2026-08-26T00:00:00.001Z",
    }),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
  assert.throws(
    () => evaluateInterfaceConsistency(
      compileInterfaceConsistencyRules([]),
      buildInterfaceConsistencyPublicSyntheticRequest(),
      {},
      { valid_at: "2026-08-26T00:00:00.000Z", known_at: "2026-08-26T00:00:00.000Z" },
    ),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
});

test("E02 Core assembly requires one complete Core Typed Facts envelope", () => {
  const [profile] = resolveProfileBindings(null, {
    profile_id: "synthetic-core-envelope-required",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-core-envelope-required-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:core:envelope-required"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  });
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]);
  assert.throws(
    () => evaluate(interfaceConsistencyAdapter, assembly, buildInterfaceConsistencyPublicSyntheticRequest()),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
  const truncated = structuredClone(adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "truncated-core-envelope"));
  delete truncated.known_at;
  assert.throws(
    () => evaluate(interfaceConsistencyAdapter, assembly, truncated),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );

  const emptyBinding = structuredClone(adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "empty-core-binding"));
  emptyBinding.project_binding_ref = {};
  assert.throws(
    () => evaluate(interfaceConsistencyAdapter, assembly, emptyBinding),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
  const wrongBindingDomain = structuredClone(adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "wrong-core-binding-domain"));
  wrongBindingDomain.project_binding_ref.domain_engine_id = "systems_engineering";
  assert.throws(
    () => evaluate(interfaceConsistencyAdapter, assembly, wrongBindingDomain),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
});

test("E02 evaluation is deterministic and non-mutating", () => {
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  const original = structuredClone(request);
  const first = assessInterfaceConsistency(request);
  const second = assessInterfaceConsistency(request);

  assert.deepEqual(request, original);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.assessments));
});

test("E02 accepts its register only through the existing Typed Project Facts envelope", () => {
  const result = assessInterfaceConsistency({
    schema_version: "soulforge.typed_project_facts.v0",
    facts: [{
      fact_type: "interface_consistency_register",
      register: buildInterfaceConsistencyPublicSyntheticRequest(),
    }],
  });

  assert.deepEqual(summarizeAssessment(result).counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
});

test("E02 accepts the exact Core adaptProjectEvidence Typed Facts producer shape", () => {
  const adapted = adaptProjectEvidence(
    {
      schema_version: "soulforge.project_binding.v0",
      project_id: "synthetic-interface-project",
      domain_engine_id: "interface_consistency",
      binding_revision_hash: "a".repeat(64),
      source_manifest_ref: "synthetic:interface-manifest",
    },
    {
      snapshot_id: "synthetic-interface-snapshot",
      source_refs: ["synthetic:interface-source"],
      observations: [{
        fact_type: "interface_consistency_register",
        register: buildInterfaceConsistencyPublicSyntheticRequest(),
      }],
    },
    {
      valid_at: "2026-08-26T00:00:00.000Z",
      known_at: "2026-08-26T00:00:00.000Z",
    },
  );
  const typed = adapted.typed_project_facts;
  assert.match(typed.facts_digest, /^[0-9a-f]{64}$/u);
  const result = evaluate(interfaceConsistencyAdapter, assembleEffectiveRuleSet(interfaceConsistencyAdapter, []), typed);
  assert.deepEqual(summarizeAssessment(result).counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
  assert.equal(result.receipt.envelope_provenance.asserted_facts_digest, typed.facts_digest);
  assert.match(result.receipt.envelope_provenance.cutoff_pair_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.hasOwn(result.receipt.envelope_provenance, "valid_at"), false);
  assert.equal(Object.hasOwn(result.receipt.envelope_provenance, "known_at"), false);
});

test("E02 fails closed on a tampered ruleset and unsafe typed fact value", () => {
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  const tampered = structuredClone(assembly);
  tampered.effective_rule_set.rules.reverse();
  assert.throws(
    () => evaluateInterfaceConsistency(tampered, buildInterfaceConsistencyPublicSyntheticRequest()),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );

  const unsafe = buildInterfaceConsistencyPublicSyntheticRequest();
  unsafe.interfaces[0].ends[0].observations.electrical.attributes[0].value = runtimeWindowsPath("private", "payload");
  assert.throws(
    () => assessInterfaceConsistency(unsafe),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
  );
});

test("E02 source-packet reference locks the exact public-safe packet bytes", () => {
  const digest = createHash("sha256").update(readFileSync(SOURCE_PACKET_PATH)).digest("hex");
  assert.equal(INTERFACE_CONSISTENCY_SOURCE_PACKET_REF.content_id, `sha256:${digest}`);
});

test("E02 assessment schema requires unambiguous bounded pair results", () => {
  const schema = JSON.parse(readFileSync(ASSESSMENT_SCHEMA_PATH, "utf8"));
  const inputSchema = JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8"));
  assert.equal(schema.$id, "soulforge.interface_consistency.assessment.v0");
  assert.ok(schema.$defs.assessment.required.includes("pairs"));
  assert.equal(schema.$defs.assessment.properties.pairs.maxProperties, 120);
  assert.equal(schema.properties.assessments.type, "object");
  assert.equal(schema.$defs.pair_assessment.properties.rules.items, false);
  assert.equal(schema.$defs.token.pattern, inputSchema.$defs.token.pattern);
  assert.ok(schema.required.includes("receipt"));
  assert.deepEqual(Object.keys(inputSchema.$defs.revision_fact.properties).sort(), ["state", "value"]);
  assert.equal(JSON.stringify(schema).includes("request_wrapper"), false);
});

test("E02 input schema publishes the evaluator's bounded structural contract", () => {
  const schema = JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8"));
  assert.equal(schema.properties.interfaces.maxItems, 256);
  assert.equal(schema.$defs.category_scope.properties.required_attributes.maxItems, 64);
  assert.equal(schema.$defs.category_scope.properties.required_attributes.uniqueItems, true);
  assert.equal(schema.$defs.interface.properties.revision.$ref, "#/$defs/revision_fact");
  assert.equal(schema.$defs.agreement.properties.revision.$ref, "#/$defs/revision_fact");
  assert.equal(schema.$defs.safe_text.maxLength, 1024);
  assert.equal(schema.$defs.bounded_value.$ref, "#/$defs/bounded_value_0");
  assert.equal(schema.$defs.bounded_value_0.oneOf[1].maxItems, 64);
});

test("E02 schemas compile with AJV 2020 and validate real synthetic inputs/results", () => {
  const ajv = createE02Ajv();
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  const validateAssessment = ajv.compile(JSON.parse(readFileSync(ASSESSMENT_SCHEMA_PATH, "utf8")));
  const validateRuleset = ajv.compile(JSON.parse(readFileSync(RULESET_SCHEMA_PATH, "utf8")));
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  const assessment = assessInterfaceConsistency(request);
  assert.equal(validateInput(request), true, JSON.stringify(validateInput.errors));
  assert.equal(validateAssessment(assessment), true, JSON.stringify(validateAssessment.errors));
  assert.equal(validateRuleset(compileInterfaceConsistencyRules([]).effective_rule_set), true, JSON.stringify(validateRuleset.errors));

  const unitOnRevision = buildInterfaceConsistencyPublicSyntheticRequest();
  interfaceById(unitOnRevision, "IF_SAT").revision.unit = "rev";
  assert.equal(validateInput(unitOnRevision), false);
  assert.ok(validateInput.errors.some((error) => error.instancePath.endsWith("/revision")));
});

test("E02 schemas compile under strict AJV 2020", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schemaPath of [INPUT_SCHEMA_PATH, ASSESSMENT_SCHEMA_PATH, RULESET_SCHEMA_PATH]) {
    assert.doesNotThrow(() => ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8"))));
  }
});

test("E02 safety policy permits official HTTPS URLs but rejects embedded drive paths", () => {
  const officialUrl = "https://www.nasa.gov/public-interface";
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  interfaceById(request, "IF_SAT").ends[0].observations.data_protocol.attributes[0].value = officialUrl;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  assert.equal(validateInput(request), true, JSON.stringify(validateInput.errors));
  assert.doesNotThrow(() => assessInterfaceConsistency(request));
  const embeddedDrive = buildInterfaceConsistencyPublicSyntheticRequest();
  interfaceById(embeddedDrive, "IF_SAT").ends[0].observations.data_protocol.attributes[0].value = runtimeCredentialPrefix("prefix", runtimeWindowsPath("private", "payload"));
  assert.equal(validateInput(embeddedDrive), false);
  assert.throws(
    () => assessInterfaceConsistency(embeddedDrive),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
  );
});

test("E02 input and assessment schemas reject the runtime's unsafe public shapes", () => {
  const ajv = createE02Ajv();
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  const validateAssessment = ajv.compile(JSON.parse(readFileSync(ASSESSMENT_SCHEMA_PATH, "utf8")));
  const unsafeStrings = [
    runtimeWindowsPath("private", "payload"),
    runtimePosixPath("ho" + "me", "synthetic", "payload"),
    runtimeCredentialPrefix("fi", "le", "://", "synthetic", "/payload"),
    runtimeCredentialPrefix("github", "_pat_", "synthetic"),
    runtimeCredentialPrefix("GITHUB", "_PAT_", "synthetic"),
    runtimeCredentialPrefix("FI", "LE", "://", "synthetic", "/payload"),
    `safe${String.fromCharCode(1)}value`,
    "e\u0301",
    "2026-08-26T00:00:00Z",
    "2026-02-30T00:00:00.000Z",
  ];
  for (const unsafe of unsafeStrings) {
    const request = buildInterfaceConsistencyPublicSyntheticRequest();
    interfaceById(request, "IF_SAT").ends[0].observations.electrical.attributes[0].value = unsafe;
    assert.equal(validateInput(request), false, `schema unexpectedly accepted unsafe value ${JSON.stringify(unsafe)}`);
    assert.throws(
      () => assessInterfaceConsistency(request),
      (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
    );
  }
  const deepRequest = buildInterfaceConsistencyPublicSyntheticRequest();
  let nested = "synthetic";
  for (let index = 0; index < 9; index += 1) nested = [nested];
  interfaceById(deepRequest, "IF_SAT").ends[0].observations.electrical.attributes[0].value = nested;
  assert.equal(validateInput(deepRequest), false);
  assert.throws(
    () => assessInterfaceConsistency(deepRequest),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
  );

  const unsafeStates = structuredClone(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()));
  unsafeStates.states_by_interface = { [runtimeWindowsPath("private", "interface")]: "satisfied" };
  assert.equal(validateAssessment(unsafeStates), false);
  const unsafeRef = structuredClone(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()));
  unsafeRef.ruleset_ref.revision_id = runtimeCredentialPrefix("fi", "le", "://", "synthetic", "/ruleset");
  assert.equal(validateAssessment(unsafeRef), false);
  const emptyAssessment = structuredClone(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()));
  emptyAssessment.assessments = [];
  assert.equal(validateAssessment(emptyAssessment), false);
});

test("E02 schemas close immutable rule semantics, receipt chronology, and aggregate assessment shape", () => {
  const ajv = createE02Ajv();
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  const validateAssessment = ajv.compile(JSON.parse(readFileSync(ASSESSMENT_SCHEMA_PATH, "utf8")));
  const validateRuleset = ajv.compile(JSON.parse(readFileSync(RULESET_SCHEMA_PATH, "utf8")));

  const leapInput = buildInterfaceConsistencyPublicSyntheticRequest();
  interfaceById(leapInput, "IF_SAT").ends[0].observations.timing.attributes[0].value = "2025-02-29T00:00:00.000Z";
  assert.equal(validateInput(leapInput), false);
  assert.throws(
    () => assessInterfaceConsistency(leapInput),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
  );

  const forgedRulesetRef = structuredClone(compileInterfaceConsistencyRules([]).effective_rule_set);
  forgedRulesetRef.ruleset_ref.entity_id = "synthetic-forged-ruleset";
  assert.equal(validateRuleset(forgedRulesetRef), false);
  const forgedRulesetContent = structuredClone(compileInterfaceConsistencyRules([]).effective_rule_set);
  forgedRulesetContent.ruleset_ref.content_id = `sha256:${"f".repeat(64)}`;
  assert.equal(validateRuleset(forgedRulesetContent), false);
  const forgedRule = structuredClone(compileInterfaceConsistencyRules([]).effective_rule_set);
  forgedRule.rules[0].rule_id = "IC-SIG-01";
  assert.equal(validateRuleset(forgedRule), false);

  const forgedAssessment = structuredClone(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()));
  const forgedAssessmentPair = forgedAssessment.assessments[Object.keys(forgedAssessment.assessments)[0]].pairs;
  forgedAssessmentPair[Object.keys(forgedAssessmentPair)[0]].rules[0].category = "electrical";
  assert.equal(validateAssessment(forgedAssessment), false);
  const forgedDetail = structuredClone(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()));
  const forgedDetailPair = forgedDetail.assessments[Object.keys(forgedDetail.assessments)[0]].pairs;
  forgedDetailPair[Object.keys(forgedDetailPair)[0]].rules[0].detail_code = "IC_FORGED";
  assert.equal(validateAssessment(forgedDetail), false);
  const forgedCounts = structuredClone(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()));
  forgedCounts.counts = { total: 3 };
  assert.equal(validateAssessment(forgedCounts), false);
  const invertedReceipt = structuredClone(assessInterfaceConsistency(adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "receipt-chronology")));
  invertedReceipt.receipt.envelope_provenance.valid_at = "2026-08-27T00:00:00.000Z";
  assert.equal(validateAssessment(invertedReceipt), false);
});

test("E02 raw AJV does not accept forged redundant summaries or cutoff chronology", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateAssessment = ajv.compile(JSON.parse(readFileSync(ASSESSMENT_SCHEMA_PATH, "utf8")));
  const coreAssessment = structuredClone(assessInterfaceConsistency(
    adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "plain-ajv-cutoffs"),
  ));
  const forgedCounts = structuredClone(coreAssessment);
  forgedCounts.counts = {
    satisfied: 1,
    gap_missing: 0,
    gap_unknown: 0,
    gap_conflict: 0,
    not_applicable: 0,
    total: 1,
  };
  assert.equal(validateAssessment(forgedCounts), false);
  const forgedStateSummary = structuredClone(coreAssessment);
  forgedStateSummary.states_by_interface = { IF_SAT: "satisfied" };
  forgedStateSummary.overall_state = "satisfied";
  assert.equal(validateAssessment(forgedStateSummary), false);
  const forgedFlattenedFindings = structuredClone(coreAssessment);
  forgedFlattenedFindings.findings = [];
  assert.equal(validateAssessment(forgedFlattenedFindings), false);
  const forgedNestedSummary = structuredClone(coreAssessment);
  const forgedNestedPair = forgedNestedSummary.assessments[Object.keys(forgedNestedSummary.assessments)[0]].pairs;
  forgedNestedSummary.assessments[Object.keys(forgedNestedSummary.assessments)[0]].state = "satisfied";
  forgedNestedPair[Object.keys(forgedNestedPair)[0]].rules[0].detail_code = "IC_FORGED";
  assert.equal(validateAssessment(forgedNestedSummary), false);
  const invertedCutoffs = structuredClone(coreAssessment);
  invertedCutoffs.receipt.envelope_provenance.valid_at = "2026-08-27T00:00:00.000Z";
  invertedCutoffs.receipt.envelope_provenance.known_at = "2026-08-26T00:00:00.000Z";
  assert.equal(validateAssessment(invertedCutoffs), false);
});

test("E02 raw AJV rejects sibling identity and ordered-rule projection forgeries", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateAssessment = ajv.compile(JSON.parse(readFileSync(ASSESSMENT_SCHEMA_PATH, "utf8")));
  const assessment = structuredClone(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()));
  const [firstInterfaceId, firstAssessment] = Object.entries(assessment.assessments)[0];
  const [firstPairKey, firstPair] = Object.entries(firstAssessment.pairs)[0];
  const forgedInterface = structuredClone(assessment);
  forgedInterface.assessments[firstInterfaceId].interface_id = "IF_FORGED";
  assert.equal(validateAssessment(forgedInterface), false);
  const forgedEnds = structuredClone(assessment);
  forgedEnds.assessments[firstInterfaceId].pairs[firstPairKey].end_ids = ["forged_a", "forged_b"];
  assert.equal(validateAssessment(forgedEnds), false);
  const replacedFinding = structuredClone(assessment);
  replacedFinding.assessments[firstInterfaceId].pairs[firstPairKey].rules[1] = structuredClone(replacedFinding.assessments[firstInterfaceId].pairs[firstPairKey].rules[0]);
  assert.equal(validateAssessment(replacedFinding), false);
  const reversedFindings = structuredClone(assessment);
  reversedFindings.assessments[firstInterfaceId].pairs[firstPairKey].rules.reverse();
  assert.equal(validateAssessment(reversedFindings), false);
  const duplicatedAssessment = structuredClone(assessment);
  duplicatedAssessment.assessments[firstInterfaceId] = { ...structuredClone(firstAssessment), interface_id: firstInterfaceId };
  assert.equal(validateAssessment(duplicatedAssessment), false);
  const duplicatedPair = structuredClone(assessment);
  duplicatedPair.assessments[firstInterfaceId].pairs[firstPairKey] = {
    ...structuredClone(firstPair),
    pair_key: firstPairKey,
  };
  assert.equal(validateAssessment(duplicatedPair), false);
  const samePairDifferentPayload = structuredClone(assessment);
  samePairDifferentPayload.assessments[firstInterfaceId].pairs[firstPairKey].rules[0] = {
    ...structuredClone(firstPair.rules[0]),
    state: firstPair.rules[0].state === "satisfied" ? "gap_unknown" : "satisfied",
  };
  assert.equal(Object.keys(samePairDifferentPayload.assessments[firstInterfaceId].pairs).filter((key) => key === firstPairKey).length, 1);
  assert.equal(validateAssessment(samePairDifferentPayload), true);
});

test("E02 semantic verifier rejects input identity, pair orientation, and hostile result wrappers", () => {
  const input = buildInterfaceConsistencyPublicSyntheticRequest();
  const result = assessInterfaceConsistency(input);
  const context = compileInterfaceConsistencyRules([]);
  assert.throws(
    () => verifyInterfaceConsistencyAssessment(input, result),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  assert.doesNotThrow(() => verifyInterfaceConsistencyAssessment(input, result, context));

  const forgedInterface = structuredClone(result);
  forgedInterface.assessments.FORGED_INTERFACE = structuredClone(forgedInterface.assessments.IF_SAT);
  assert.throws(
    () => verifyInterfaceConsistencyAssessment(input, forgedInterface, context),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  const reversedPair = structuredClone(result);
  const pair = reversedPair.assessments.IF_SAT.pairs;
  const pairKey = Object.keys(pair)[0];
  const [left, right] = pairKey.split("<->");
  pair[`${right}<->${left}`] = pair[pairKey];
  delete pair[pairKey];
  assert.throws(
    () => verifyInterfaceConsistencyAssessment(input, reversedPair, context),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  const pairDrift = structuredClone(result);
  const firstPair = pairDrift.assessments.IF_SAT.pairs[Object.keys(pairDrift.assessments.IF_SAT.pairs)[0]];
  firstPair.rules[0].state = firstPair.rules[0].state === "satisfied" ? "gap_unknown" : "satisfied";
  assert.throws(
    () => verifyInterfaceConsistencyAssessment(input, pairDrift, context),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  let trapCount = 0;
  const hostile = new Proxy(result, {
    getPrototypeOf() {
      trapCount += 1;
      throw new Error("must not execute");
    },
  });
  assert.throws(
    () => verifyInterfaceConsistencyAssessment(input, hostile, context),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  assert.equal(trapCount, 0);
  let contextTrapCount = 0;
  const hostileContext = new Proxy(context, {
    getPrototypeOf() {
      contextTrapCount += 1;
      throw new Error("must not execute");
    },
  });
  assert.throws(
    () => verifyInterfaceConsistencyAssessment(input, result, hostileContext),
    (error) => typeof error?.code === "string" && error.code.startsWith("IC_"),
  );
  assert.equal(contextTrapCount, 0);
});

test("E02 semantic verifier rejects reclosed same-key outcome substitutions", () => {
  const input = buildInterfaceConsistencyPublicSyntheticRequest();
  const context = compileInterfaceConsistencyRules([]);
  const baseline = assessInterfaceConsistency(input);
  for (const mutate of [
    (outcome) => { outcome.state = outcome.state === "satisfied" ? "gap_unknown" : "satisfied"; },
    (outcome) => { outcome.detail_code = "IC_PAIRWISE_ATTRIBUTE_STATE"; },
    (outcome) => { outcome.attribute_ids = ["synthetic_attribute"]; },
  ]) {
    const reclosed = structuredClone(baseline);
    const pair = reclosed.assessments.IF_SAT.pairs[Object.keys(reclosed.assessments.IF_SAT.pairs)[0]];
    mutate(pair.rules[0]);
    const { receipt, ...body } = reclosed;
    reclosed.receipt.assessment_digest = digestInterfaceConsistencyAssessmentBody(body);
    assert.throws(
      () => verifyInterfaceConsistencyAssessment(input, reclosed, context),
      (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
    );
  }
});

test("E02 topology and integration request declare the complete local dependency and table shape", () => {
  const topology = JSON.parse(readFileSync(TOPOLOGY_PATH, "utf8"));
  assert.ok(topology.external_dependencies.includes("../../../core/validators/module_binding.mjs"));
  const request = readFileSync(INTEGRATION_REQUEST_PATH, "utf8");
  assert.match(request, /\| shared owner \| requested follow-up \| reason \| E02 result \|\r?\n\| --- \| --- \| --- \| --- \|/u);
});

test("E02 topology inventory exactly matches package files and static Core imports", () => {
  const topology = JSON.parse(readFileSync(TOPOLOGY_PATH, "utf8"));
  const actualFiles = packageRelativeFiles();
  assert.deepEqual([...topology.owned_paths].sort(), actualFiles);
  const coreImports = new Set();
  for (const file of actualFiles.filter((path) => path.endsWith(".mjs"))) {
    const source = readFileSync(join(PACKAGE_ROOT, file), "utf8");
    for (const match of source.matchAll(/from\s+["'](\.\.\/\.\.\/\.\.\/core\/[^"']+)["']/gu)) {
      coreImports.add(match[1]);
    }
  }
  assert.deepEqual([...topology.external_dependencies].sort(), [...coreImports].sort());
});

test("E02 dynamically intersects tracked path-policy findings with its owned package", () => {
  const packageFiles = packageRelativeFiles();
  const packagePrefix = "guild_hall/engineering_engine/engines/interface_consistency/";
  const violations = packageFiles.flatMap((relativePath) => findLocalAbsolutePathViolations(
    readFileSync(join(PACKAGE_ROOT, relativePath), "utf8"),
    `${packagePrefix}${relativePath}`,
  ));
  const ownedIntersection = violations.filter((violation) => violation.file.startsWith(packagePrefix));
  assert.deepEqual(ownedIntersection, []);
});

test("E02 public runner is zero-write and emits stable JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "soulforge-interface-consistency-"));
  try {
    const before = readdirSync(directory);
    const run = spawnSync(process.execPath, [RUNNER_PATH], { cwd: directory, encoding: "utf8" });
    const after = readdirSync(directory);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(before, []);
    assert.deepEqual(after, []);
    assert.deepEqual(summarizeAssessment(JSON.parse(run.stdout)).counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("E02 compiler and evaluator runtime seams contain no current-time, I/O, network, or process calls", () => {
  const seamFiles = [
    "compiler/interface_consistency_compiler_adapter.mjs",
    "evaluator/interface_consistency.mjs",
    "evaluator/interface_consistency_evaluator_adapter.mjs",
  ];
  const forbidden = [
    /\bDate(?:\.now)?\b/u,
    /\bperformance\.now\b/u,
    /\bprocess\.(?:hrtime|exit|spawn|exec)\b/u,
    /node:(?:fs|child_process|net|http|https|tls|dgram)\b/u,
    /\b(?:readFile|writeFile|appendFile|createReadStream|createWriteStream|fetch|XMLHttpRequest|WebSocket)\b/u,
  ];
  for (const relativePath of seamFiles) {
    const text = readFileSync(join(PACKAGE_ROOT, relativePath), "utf8");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(text), false, `${relativePath} must not contain ${pattern}`);
    }
  }
});

test("E02 domain-local manifest is explicit and does not imply publication", () => {
  const manifest = createInterfaceConsistencyModuleManifest(manifestInput());
  assert.equal(manifest.module_id, "soulforge.engineering_engine.interface_consistency");
  assert.equal(manifest.execution_mode, "deterministic_only");
  assert.ok(Object.isFrozen(manifest));
});

test("E02 manifest factory fails closed on proxy traps and forbidden public strings", () => {
  const expectManifestError = (value) => assert.throws(
    () => createInterfaceConsistencyModuleManifest(value),
    (error) => error?.code === "IC_MODULE_MANIFEST_INVALID",
  );
  let outerTrapCount = 0;
  expectManifestError(new Proxy(manifestInput(), {
    getPrototypeOf() {
      outerTrapCount += 1;
      throw new Error("must not execute");
    },
  }));
  assert.equal(outerTrapCount, 0);
  let dependencyTrapCount = 0;
  expectManifestError(manifestInput({
    dependency_versions: new Proxy({}, {
      getPrototypeOf() {
        dependencyTrapCount += 1;
        throw new Error("must not execute");
      },
    }),
  }));
  assert.equal(dependencyTrapCount, 0);
  let classificationTrapCount = 0;
  expectManifestError(manifestInput({
    supported_project_classifications: new Proxy(["public_synthetic"], {
      getPrototypeOf() {
        classificationTrapCount += 1;
        throw new Error("must not execute");
      },
    }),
  }));
  assert.equal(classificationTrapCount, 0);
  expectManifestError(manifestInput({
    test_receipt_ref: runtimeCredentialPrefix("github", "_pat_", "synthetic"),
  }));
});

test("E02 emits stable three-end pair outcomes without echoing compared values", () => {
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  const record = interfaceById(request, "IF_SAT");
  const third = thirdEndFrom(record.ends[1], "IF_SAT_end_c");
  third.observations.electrical.attributes[0].value = 24;
  record.ends = [third, record.ends[1], record.ends[0]];

  const result = assessInterfaceConsistency(request);
  const electrical = findingByRule(result, "IF_SAT", "IC-ELEC-01");
  assert.equal(electrical.state, "gap_conflict");
  assert.deepEqual(Object.entries(electrical.pair_results).map(([pair_key, { state }]) => ({ pair_key, state })), [
    { pair_key: "IF_SAT_end_a<->IF_SAT_end_b", state: "satisfied" },
    { pair_key: "IF_SAT_end_a<->IF_SAT_end_c", state: "gap_conflict" },
    { pair_key: "IF_SAT_end_b<->IF_SAT_end_c", state: "gap_conflict" },
  ]);
  assert.equal(Object.keys(result.assessments.IF_SAT.pairs).length, 3);
  assert.ok(Object.values(result.assessments.IF_SAT.pairs)
    .every((pair) => pair.rules.length === 8));
  assert.equal(JSON.stringify(electrical).includes('"value"'), false);
});

test("E02 aggregates revision and bilateral agreement from deterministic three-end pair results", () => {
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  const record = interfaceById(request, "IF_SAT");
  const third = thirdEndFrom(record.ends[1], "IF_SAT_end_c");
  third.revision = { state: "present", value: "synthetic-r2" };
  third.agreement = { state: "agreed", revision: { state: "present", value: "synthetic-r2" } };
  record.ends = [third, record.ends[0], record.ends[1]];

  const first = assessInterfaceConsistency(request);
  const reordered = structuredClone(request);
  interfaceById(reordered, "IF_SAT").ends.reverse();
  const second = assessInterfaceConsistency(reordered);
  for (const ruleId of ["IC-REV-01", "IC-BILAT-01"]) {
    const pairStates = Object.entries(findingByRule(first, "IF_SAT", ruleId).pair_results).map(([pair_key, { state }]) => ({ pair_key, state }));
    assert.deepEqual(pairStates, [
      { pair_key: "IF_SAT_end_a<->IF_SAT_end_b", state: "satisfied" },
      { pair_key: "IF_SAT_end_a<->IF_SAT_end_c", state: "gap_conflict" },
      { pair_key: "IF_SAT_end_b<->IF_SAT_end_c", state: "gap_conflict" },
    ]);
    assert.deepEqual(
      Object.entries(findingByRule(second, "IF_SAT", ruleId).pair_results).map(([pair_key, { state }]) => ({ pair_key, state })),
      pairStates,
    );
  }
});

test("E02 emits 120 stable pair results for a valid 16-end interface and passes AJV", () => {
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  const record = interfaceById(request, "IF_SAT");
  const baseEnd = structuredClone(record.ends[0]);
  record.ends = Array.from({ length: 16 }, (_, index) => ({
    ...structuredClone(baseEnd),
    end_id: `IF_SAT_end_${String(index).padStart(2, "0")}`,
  })).reverse();
  const result = assessInterfaceConsistency(request);
  const electrical = findingByRule(result, "IF_SAT", "IC-ELEC-01");
  assert.equal(Object.keys(electrical.pair_results).length, 120);
  assert.equal(Object.keys(electrical.pair_results)[0], "IF_SAT_end_00<->IF_SAT_end_01");
  assert.equal(Object.keys(electrical.pair_results).at(-1), "IF_SAT_end_14<->IF_SAT_end_15");
  const ajv = createE02Ajv();
  const validateAssessment = ajv.compile(JSON.parse(readFileSync(ASSESSMENT_SCHEMA_PATH, "utf8")));
  assert.equal(validateAssessment(result), true, JSON.stringify(validateAssessment.errors));
});

test("E02 Typed Facts envelope rejects hostile wrappers before getters execute", () => {
  const register = buildInterfaceConsistencyPublicSyntheticRequest();
  const validFact = () => ({ fact_type: "interface_consistency_register", register: structuredClone(register) });
  const expectClosedTypedFactsError = (value) => assert.throws(
    () => assessInterfaceConsistency(value),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );

  let getterCalls = 0;
  const getterWrapper = { schema_version: "soulforge.typed_project_facts.v0" };
  Object.defineProperty(getterWrapper, "facts", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  expectClosedTypedFactsError(getterWrapper);
  assert.equal(getterCalls, 0);

  expectClosedTypedFactsError(new Proxy({
    schema_version: "soulforge.typed_project_facts.v0",
    facts: [validFact()],
  }, {}));

  const symbolWrapper = { schema_version: "soulforge.typed_project_facts.v0", facts: [validFact()] };
  symbolWrapper[Symbol("hidden")] = "x";
  expectClosedTypedFactsError(symbolWrapper);

  const hiddenWrapper = { schema_version: "soulforge.typed_project_facts.v0", facts: [validFact()] };
  Object.defineProperty(hiddenWrapper, "hidden", { enumerable: false, value: "x" });
  expectClosedTypedFactsError(hiddenWrapper);

  const sparseFacts = new Array(2);
  sparseFacts[1] = validFact();
  expectClosedTypedFactsError({ schema_version: "soulforge.typed_project_facts.v0", facts: sparseFacts });

  const hostileFact = validFact();
  let hostileFactGetterCalls = 0;
  Object.defineProperty(hostileFact, "register", {
    enumerable: true,
    get() {
      hostileFactGetterCalls += 1;
      throw new Error("must not execute");
    },
  });
  expectClosedTypedFactsError({ schema_version: "soulforge.typed_project_facts.v0", facts: [hostileFact] });
  assert.equal(hostileFactGetterCalls, 0);

  let nestedRegisterTrapCount = 0;
  const proxiedFact = validFact();
  proxiedFact.register = new Proxy(proxiedFact.register, {
    getPrototypeOf() {
      nestedRegisterTrapCount += 1;
      throw new Error("getPrototypeOf must not execute");
    },
  });
  assert.throws(
    () => assessInterfaceConsistency({ schema_version: "soulforge.typed_project_facts.v0", facts: [proxiedFact] }),
    (error) => typeof error?.code === "string" && error.code.startsWith("IC_"),
  );
  assert.equal(nestedRegisterTrapCount, 0);
});

test("E02 proxy arrays fail closed before getPrototypeOf traps execute", () => {
  const expectInputError = (request) => assert.throws(
    () => assessInterfaceConsistency(request),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
  const domain = buildInterfaceConsistencyPublicSyntheticRequest();
  const domainProxy = prototypeTrapArray(domain.interfaces);
  domain.interfaces = domainProxy.value;
  expectInputError(domain);
  assert.equal(domainProxy.trapCount(), 0);

  const ends = buildInterfaceConsistencyPublicSyntheticRequest();
  const endsProxy = prototypeTrapArray(interfaceById(ends, "IF_SAT").ends);
  interfaceById(ends, "IF_SAT").ends = endsProxy.value;
  expectInputError(ends);
  assert.equal(endsProxy.trapCount(), 0);

  const attributes = buildInterfaceConsistencyPublicSyntheticRequest();
  const attributesProxy = prototypeTrapArray(interfaceById(attributes, "IF_SAT").ends[0].observations.electrical.attributes);
  interfaceById(attributes, "IF_SAT").ends[0].observations.electrical.attributes = attributesProxy.value;
  expectInputError(attributes);
  assert.equal(attributesProxy.trapCount(), 0);

  const required = buildInterfaceConsistencyPublicSyntheticRequest();
  const requiredProxy = prototypeTrapArray(interfaceById(required, "IF_SAT").category_scope.electrical.required_attributes);
  interfaceById(required, "IF_SAT").category_scope.electrical.required_attributes = requiredProxy.value;
  expectInputError(required);
  assert.equal(requiredProxy.trapCount(), 0);

  const typedFacts = prototypeTrapArray([{ fact_type: "interface_consistency_register", register: buildInterfaceConsistencyPublicSyntheticRequest() }]);
  assert.throws(
    () => assessInterfaceConsistency({ schema_version: "soulforge.typed_project_facts.v0", facts: typedFacts.value }),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
  assert.equal(typedFacts.trapCount(), 0);

  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  const rulesProxy = prototypeTrapArray(structuredClone(assembly.effective_rule_set.rules));
  const malformedAssembly = structuredClone(assembly);
  malformedAssembly.effective_rule_set.rules = rulesProxy.value;
  assert.throws(
    () => evaluateInterfaceConsistency(malformedAssembly, buildInterfaceConsistencyPublicSyntheticRequest()),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
  assert.equal(rulesProxy.trapCount(), 0);

  const operationsProxy = prototypeTrapArray([]);
  assert.throws(
    () => compileInterfaceConsistencyRules([{ operations: operationsProxy.value }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );
  assert.equal(operationsProxy.trapCount(), 0);
});

test("E02 rejects the retired request_wrapper surface as ordinary invalid input", () => {
  assert.throws(
    () => assessInterfaceConsistency({ request: buildInterfaceConsistencyPublicSyntheticRequest() }),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
  );
});

test("E02 admits only Core-compatible integer/string/array value representations", () => {
  for (const value of ["3.3", [1, 2, 3], "2026-08-26T10:20:30.000Z"]) {
    const request = buildInterfaceConsistencyPublicSyntheticRequest();
    setAttributeFact(
      request,
      "IF_SAT",
      "electrical",
      { state: "present", value, unit: "V" },
      { state: "present", value: structuredClone(value), unit: "V" },
    );
    assert.equal(findingByRule(assessInterfaceConsistency(request), "IF_SAT", "IC-ELEC-01").state, "satisfied");
  }

  for (const value of [3.3, "1e+3", "2026-08-26T10:20:30+09:00", Number.NaN]) {
    const request = buildInterfaceConsistencyPublicSyntheticRequest();
    setAttributeFact(request, "IF_SAT", "electrical", { state: "present", value, unit: "V" }, { state: "present", value, unit: "V" });
    assert.throws(
      () => assessInterfaceConsistency(request),
      (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
    );
  }

  const decimalRequest = buildInterfaceConsistencyPublicSyntheticRequest();
  setAttributeFact(decimalRequest, "IF_SAT", "electrical", { state: "present", value: "3.3", unit: "V" }, { state: "present", value: "3.3", unit: "V" });
  const coreTyped = adaptProjectEvidence(
    {
      schema_version: "soulforge.project_binding.v0",
      project_id: "synthetic-decimal-project",
      domain_engine_id: "interface_consistency",
      binding_revision_hash: "c".repeat(64),
      source_manifest_ref: "synthetic:decimal-manifest",
    },
    {
      snapshot_id: "synthetic-decimal-snapshot",
      source_refs: ["synthetic:decimal-source"],
      observations: [{ fact_type: "interface_consistency_register", register: decimalRequest }],
    },
    { valid_at: "2026-08-26T00:00:00.000Z", known_at: "2026-08-26T00:00:00.000Z" },
  ).typed_project_facts;
  assert.equal(
    findingByRule(evaluate(interfaceConsistencyAdapter, assembleEffectiveRuleSet(interfaceConsistencyAdapter, []), coreTyped), "IF_SAT", "IC-ELEC-01").state,
    "satisfied",
  );
});

test("E02 limits ordinary object values to 64 members in runtime and AJV", () => {
  const makeObject = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`k${index}`, index]));
  const pass = buildInterfaceConsistencyPublicSyntheticRequest();
  setAttributeFact(pass, "IF_SAT", "electrical", { state: "present", value: makeObject(64) }, { state: "present", value: makeObject(64) });
  assert.equal(findingByRule(assessInterfaceConsistency(pass), "IF_SAT", "IC-ELEC-01").state, "satisfied");

  const reject = buildInterfaceConsistencyPublicSyntheticRequest();
  setAttributeFact(reject, "IF_SAT", "electrical", { state: "present", value: makeObject(65) }, { state: "present", value: makeObject(65) });
  assert.throws(
    () => assessInterfaceConsistency(reject),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
  );
  const ajv = createE02Ajv();
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  assert.equal(validateInput(reject), false);
});

test("E02 enforces empty-string and unsafe-integer schema/runtime parity", () => {
  const ajv = createE02Ajv();
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  for (const value of ["", Number.MAX_SAFE_INTEGER + 1]) {
    const request = buildInterfaceConsistencyPublicSyntheticRequest();
    setAttributeFact(request, "IF_SAT", "electrical", { state: "present", value }, { state: "present", value });
    assert.equal(validateInput(request), false);
    assert.throws(
      () => assessInterfaceConsistency(request),
      (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
    );
  }
});

test("E02 treats present versus known-absent facts as contradiction while both absent remain missing", () => {
  const contradiction = buildInterfaceConsistencyPublicSyntheticRequest();
  setAttributeFact(contradiction, "IF_SAT", "electrical", { state: "present", value: 28, unit: "V" }, { state: "known_absent" });
  assert.equal(findingByRule(assessInterfaceConsistency(contradiction), "IF_SAT", "IC-ELEC-01").state, "gap_conflict");

  const bothAbsent = buildInterfaceConsistencyPublicSyntheticRequest();
  setAttributeFact(bothAbsent, "IF_SAT", "electrical", { state: "known_absent" }, { state: "known_absent" });
  assert.equal(findingByRule(assessInterfaceConsistency(bothAbsent), "IF_SAT", "IC-ELEC-01").state, "gap_missing");
});

test("E02 keeps an absent category scope unknown even when a Profile forces applicability either way", () => {
  for (const applicable of [true, false]) {
    const [profile] = resolveProfileBindings(null, {
      profile_id: `synthetic-force-electrical-profile-${applicable}`,
      domain_engine_id: "interface_consistency",
      revision_or_hash: `synthetic-force-electrical-profile-${applicable}-r1`,
      extends_or_base_pin: "interface_consistency:base:v0",
      source_refs: [`synthetic:force-electrical-profile:${applicable}`],
      operations: [{ op: "set_category_applicability", category: "electrical", applicable }],
    });
    const request = buildInterfaceConsistencyPublicSyntheticRequest();
    delete interfaceById(request, "IF_SAT").category_scope.electrical;
    const result = evaluateCoreAssembly(assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]), request, `absent-scope-${applicable}`);
    const finding = findingByRule(result, "IF_SAT", "IC-ELEC-01");
    assert.equal(finding.state, "gap_unknown");
    assert.ok(Object.values(finding.pair_results).every((pair) => pair.state === "gap_unknown"));
  }
});

test("E02 effective ruleset admission rejects hostile wrappers and nested refs without getter execution", () => {
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  const expectClosedRulesetError = (value) => assert.throws(
    () => evaluateInterfaceConsistency(value, request),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );

  let wrapperGetterCalls = 0;
  const getterWrapper = {};
  Object.defineProperty(getterWrapper, "effective_rule_set", {
    enumerable: true,
    get() {
      wrapperGetterCalls += 1;
      throw new Error("must not execute");
    },
  });
  expectClosedRulesetError(getterWrapper);
  assert.equal(wrapperGetterCalls, 0);

  expectClosedRulesetError(new Proxy(assembly, {}));
  const symbolWrapper = structuredClone(assembly);
  symbolWrapper[Symbol("hidden")] = "x";
  expectClosedRulesetError(symbolWrapper);
  const hiddenWrapper = structuredClone(assembly);
  Object.defineProperty(hiddenWrapper, "hidden", { enumerable: false, value: "x" });
  expectClosedRulesetError(hiddenWrapper);
  const extraWrapper = structuredClone(assembly);
  extraWrapper.extra = true;
  expectClosedRulesetError(extraWrapper);
  const wrongDomainWrapper = structuredClone(assembly);
  wrongDomainWrapper.domain_engine_id = "systems_engineering";
  expectClosedRulesetError(wrongDomainWrapper);

  const nestedGetter = structuredClone(assembly);
  let nestedGetterCalls = 0;
  Object.defineProperty(nestedGetter.effective_rule_set.ruleset_ref, "entity_id", {
    enumerable: true,
    get() {
      nestedGetterCalls += 1;
      throw new Error("must not execute");
    },
  });
  expectClosedRulesetError(nestedGetter);
  assert.equal(nestedGetterCalls, 0);

  const nestedProxy = structuredClone(assembly);
  let nestedProxyTrapCalls = 0;
  nestedProxy.effective_rule_set.ruleset_ref = new Proxy(nestedProxy.effective_rule_set.ruleset_ref, {
    getPrototypeOf() {
      nestedProxyTrapCalls += 1;
      throw new Error("must not execute");
    },
  });
  expectClosedRulesetError(nestedProxy);
  assert.equal(nestedProxyTrapCalls, 0);

  const malformedRule = structuredClone(assembly);
  malformedRule.effective_rule_set.rules[0].source_locator = 3.3;
  expectClosedRulesetError(malformedRule);

  const unexplainedOverride = structuredClone(assembly.effective_rule_set);
  unexplainedOverride.category_applicability.electrical = true;
  expectClosedRulesetError(unexplainedOverride);
  const unsafeProvenance = structuredClone(assembly.effective_rule_set);
  unsafeProvenance.category_applicability.electrical = true;
  unsafeProvenance.profile_rule_provenance.electrical = {
    profile_id: runtimeWindowsPath("private", "profile"),
    profile_kind: "project",
    revision_or_hash: "synthetic-r1",
    operation_digest: "a".repeat(64),
  };
  expectClosedRulesetError(unsafeProvenance);
});

test("E02 evaluator rejects stale Core assembly and trace digests after a category/provenance mutation", () => {
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  assert.equal(
    findingByRule(
      evaluateCoreAssembly(assembly, buildInterfaceConsistencyPublicSyntheticRequest(), "stale-base"),
      "IF_SAT",
      "IC-ELEC-01",
    ).state,
    "satisfied",
  );
  const [conflictingProfile] = resolveProfileBindings(null, {
    profile_id: "synthetic-stale-assembly-profile",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-stale-assembly-profile-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:stale:assembly"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: false }],
  });
  assert.equal(
    findingByRule(
      evaluateCoreAssembly(
        assembleEffectiveRuleSet(interfaceConsistencyAdapter, [conflictingProfile]),
        buildInterfaceConsistencyPublicSyntheticRequest(),
        "stale-profile",
      ),
      "IF_SAT",
      "IC-ELEC-01",
    ).state,
    "gap_conflict",
  );
  const stale = structuredClone(assembly);
  stale.effective_rule_set.category_applicability.electrical = false;
  stale.effective_rule_set.profile_rule_provenance.electrical = {
    profile_id: "synthetic-forged-profile",
    profile_kind: "project",
    revision_or_hash: "synthetic-forged-r1",
    operation_digest: "a".repeat(64),
  };
  assert.throws(
    () => evaluateCoreAssembly(stale, buildInterfaceConsistencyPublicSyntheticRequest(), "stale-mutated"),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
});

test("G1 RED: evaluator rejects a rehashed category override not produced by Profile operations", () => {
  const [profile] = resolveProfileBindings(null, {
    profile_id: "synthetic-semantic-provenance",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-semantic-provenance-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:semantic:provenance"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  });
  const forged = structuredClone(assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]));
  forged.effective_rule_set.category_applicability.electrical = false;
  const rehashed = recomputeCoreEffectiveRulesetDigest(forged.effective_rule_set);
  forged.assembly_digest = rehashed;
  forged.compilation_trace.effective_ruleset_digest = rehashed;
  assert.throws(
    () => evaluateCoreAssembly(forged, buildInterfaceConsistencyPublicSyntheticRequest(), "rehashed-category"),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
});

test("G1 RED: evaluator rejects a rehashed arbitrary trace digest without matching normalized operations", () => {
  const [profile] = resolveProfileBindings(null, {
    profile_id: "synthetic-forged-trace",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-forged-trace-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:forged:trace"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  });
  const forged = structuredClone(assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]));
  const arbitraryDigest = "b".repeat(64);
  forged.effective_rule_set.profile_rule_provenance.electrical.operation_digest = arbitraryDigest;
  forged.compilation_trace.profiles[0].operation_digest = arbitraryDigest;
  forged.compilation_trace.project_trace.operation_digest = arbitraryDigest;
  const rehashed = recomputeCoreEffectiveRulesetDigest(forged.effective_rule_set);
  forged.assembly_digest = rehashed;
  forged.compilation_trace.effective_ruleset_digest = rehashed;
  assert.throws(
    () => evaluateCoreAssembly(forged, buildInterfaceConsistencyPublicSyntheticRequest(), "rehashed-trace"),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
});

test("E02 rejects a reclosed Profile-package substitution and preserves ordered override provenance", () => {
  const bindings = resolveProfileBindings({
    profile_id: "synthetic-reclosed-org",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-reclosed-org-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:reclosed:org"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  }, {
    profile_id: "synthetic-reclosed-project",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-reclosed-project-r1",
    extends_or_base_pin: "synthetic-reclosed-org",
    source_refs: ["synthetic:reclosed:project"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: false }],
  });
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, bindings);
  assert.equal(assembly.effective_rule_set.category_applicability.electrical, false);
  assert.deepEqual(assembly.effective_rule_set.profile_rule_provenance.electrical, {
    profile_package_index: 1,
    operation_index: 0,
  });

  const forged = structuredClone(assembly);
  forged.effective_rule_set.profile_packages[1].operations[0].applicable = true;
  forged.effective_rule_set.profile_packages[1].operation_digest = normalizeProfileOperations(
    forged.effective_rule_set.profile_packages[1].operations,
  ).operation_digest;
  forged.effective_rule_set.category_applicability.electrical = true;
  const rehashed = recomputeCoreEffectiveRulesetDigest(forged.effective_rule_set);
  forged.assembly_digest = rehashed;
  forged.compilation_trace.effective_ruleset_digest = rehashed;
  assert.throws(
    () => evaluateCoreAssembly(forged, buildInterfaceConsistencyPublicSyntheticRequest(), "reclosed-substitution"),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );

  const [zeroOperationProfile] = resolveProfileBindings(null, {
    profile_id: "synthetic-zero-operation-profile",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-zero-operation-profile-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:zero-operation"],
    operations: [],
  });
  assert.doesNotThrow(() => evaluateCoreAssembly(
    assembleEffectiveRuleSet(interfaceConsistencyAdapter, [zeroOperationProfile]),
    buildInterfaceConsistencyPublicSyntheticRequest(),
    "zero-operation-profile",
  ));
});

test("E02 direct compiler output cannot claim forged Profile provenance", () => {
  const direct = structuredClone(compileInterfaceConsistencyRules([]));
  direct.effective_rule_set.category_applicability.electrical = false;
  direct.effective_rule_set.profile_rule_provenance.electrical = {
    profile_id: "synthetic-forged-direct-profile",
    profile_kind: "project",
    revision_or_hash: "synthetic-forged-direct-r1",
    operation_digest: "a".repeat(64),
  };
  assert.throws(
    () => evaluateInterfaceConsistency(direct, buildInterfaceConsistencyPublicSyntheticRequest()),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
});

test("E02 evaluator admits an ordered Core Organization-to-Project assembly trace", () => {
  const bindings = resolveProfileBindings({
    profile_id: "synthetic-evaluator-org",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-evaluator-org-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:evaluator:org"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  }, {
    profile_id: "synthetic-evaluator-project",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-evaluator-project-r1",
    extends_or_base_pin: "synthetic-evaluator-org",
    source_refs: ["synthetic:evaluator:project"],
    operations: [{ op: "set_category_applicability", category: "revision", applicable: false }],
  });
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, bindings, {});
  const result = evaluateCoreAssembly(assembly, buildInterfaceConsistencyPublicSyntheticRequest(), "ordered-trace");
  assert.equal(findingByRule(result, "IF_SAT", "IC-ELEC-01").state, "satisfied");
  assert.equal(findingByRule(result, "IF_SAT", "IC-REV-01").state, "not_applicable");
  assert.deepEqual(assembly.compilation_trace.profiles.map((profile) => profile.profile_id), [
    "synthetic-evaluator-org",
    "synthetic-evaluator-project",
  ]);
});

test("E02 evaluator rejects mismatched Core trace metadata before verdict", () => {
  const [profile] = resolveProfileBindings(null, {
    profile_id: "synthetic-trace-profile",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-trace-profile-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:trace:profile"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  });
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]);
  for (const mutate of [
    (candidate) => { candidate.compilation_trace.effective_ruleset_digest = "f".repeat(64); },
    (candidate) => { candidate.compilation_trace.profiles[0].operation_digest = "f".repeat(64); },
    (candidate) => { candidate.compilation_trace.profiles[0].source_refs = []; },
    (candidate) => { candidate.compilation_trace.profiles[0].operation_digest = "synthetic-not-a-core-digest"; },
    (candidate) => { candidate.compilation_trace.domain_adapter_revision = "synthetic-forged-adapter"; },
  ]) {
    const stale = structuredClone(assembly);
    mutate(stale);
    assert.throws(
      () => evaluateCoreAssembly(stale, buildInterfaceConsistencyPublicSyntheticRequest(), "trace-metadata"),
      (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
    );
  }
});

test("E02 evaluator rejects a Core Typed Facts register mutation with stale facts_digest", () => {
  const adapted = adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "stale-facts");
  const stale = structuredClone(adapted);
  stale.facts[0].register.interfaces[0].ends[0].observations.electrical.attributes[0].value = 24;
  assert.throws(
    () => evaluate(interfaceConsistencyAdapter, assembleEffectiveRuleSet(interfaceConsistencyAdapter, []), stale),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
});

test("E02 emits deterministic bounded replay receipt digests without payload echo", () => {
  const first = assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest());
  const second = assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest());
  assert.deepEqual(first.receipt, second.receipt);
  for (const key of ["input_digest", "domain_ruleset_digest", "assessment_digest"]) {
    assert.match(first.receipt[key], /^sha256:[0-9a-f]{64}$/u);
  }
  assert.equal(JSON.stringify(first.receipt).includes('"value"'), false);
  const { receipt, ...assessmentBody } = first;
  assert.equal(
    receipt.assessment_digest,
    digestInterfaceConsistencyAssessmentBody(assessmentBody),
  );

  const fullEnvelope = adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "receipt");
  const envelopeReceipt = assessInterfaceConsistency(fullEnvelope).receipt;
  assert.equal(envelopeReceipt.envelope_provenance.envelope_kind, "core_typed_project_facts");
  assert.equal(envelopeReceipt.envelope_provenance.asserted_facts_digest, fullEnvelope.facts_digest);
  assert.equal(Object.hasOwn(envelopeReceipt.envelope_provenance, "facts_digest"), false);
  assert.match(envelopeReceipt.envelope_provenance.cutoff_pair_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.hasOwn(envelopeReceipt.envelope_provenance, "valid_at"), false);
  assert.equal(Object.hasOwn(envelopeReceipt.envelope_provenance, "known_at"), false);
  assert.match(envelopeReceipt.envelope_provenance.project_binding_ref_digest, /^sha256:[0-9a-f]{64}$/u);

  const coreShapeTimes = structuredClone(fullEnvelope);
  coreShapeTimes.valid_at = "2026-08-26T00:00:00Z";
  coreShapeTimes.known_at = "2026-08-26T00:00:00.1Z";
  assert.throws(
    () => assessInterfaceConsistency(coreShapeTimes),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.TYPED_FACTS_INVALID,
  );
});

test("E02 global category Profiles treat false as not-applicable without manufacturing a contradiction", () => {
  const categories = [
    ["interface_register", "IC-REG-01"],
    ["revision", "IC-REV-01"],
    ["bilateral_agreement", "IC-BILAT-01"],
  ];
  for (const [category, ruleId] of categories) {
    const [falseProfile] = resolveProfileBindings(null, {
      profile_id: `synthetic-false-${category}`,
      domain_engine_id: "interface_consistency",
      revision_or_hash: `synthetic-false-${category}-r1`,
      extends_or_base_pin: "interface_consistency:base:v0",
      source_refs: [`synthetic:false:${category}`],
      operations: [{ op: "set_category_applicability", category, applicable: false }],
    });
    const falseResult = evaluateCoreAssembly(
      assembleEffectiveRuleSet(interfaceConsistencyAdapter, [falseProfile]),
      buildInterfaceConsistencyPublicSyntheticRequest(),
      `global-false-${category}`,
    );
    assert.equal(findingByRule(falseResult, "IF_SAT", ruleId).state, "not_applicable");

    const [trueProfile] = resolveProfileBindings(null, {
      profile_id: `synthetic-true-${category}`,
      domain_engine_id: "interface_consistency",
      revision_or_hash: `synthetic-true-${category}-r1`,
      extends_or_base_pin: "interface_consistency:base:v0",
      source_refs: [`synthetic:true:${category}`],
      operations: [{ op: "set_category_applicability", category, applicable: true }],
    });
    const trueResult = evaluateCoreAssembly(
      assembleEffectiveRuleSet(interfaceConsistencyAdapter, [trueProfile]),
      buildInterfaceConsistencyPublicSyntheticRequest(),
      `global-true-${category}`,
    );
    assert.equal(findingByRule(trueResult, "IF_SAT", ruleId).state, "satisfied");
    assert.equal(findingByRule(assessInterfaceConsistency(buildInterfaceConsistencyPublicSyntheticRequest()), "IF_SAT", ruleId).state, "satisfied");
  }
});

test("E02 receipt binds envelope provenance while normalizing order-only input differences", () => {
  const direct = buildInterfaceConsistencyPublicSyntheticRequest();
  const reordered = structuredClone(direct);
  reordered.interfaces.reverse();
  for (const record of reordered.interfaces) record.ends.reverse();
  const first = assessInterfaceConsistency(direct);
  const second = assessInterfaceConsistency(reordered);
  assert.equal(first.receipt.input_digest, second.receipt.input_digest);

  const envelope = adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "provenance-a");
  const changedAssertion = adaptSyntheticTypedFacts(buildInterfaceConsistencyPublicSyntheticRequest(), "provenance-b");
  const firstReceipt = assessInterfaceConsistency(envelope).receipt;
  const secondReceipt = assessInterfaceConsistency(changedAssertion).receipt;
  assert.notEqual(firstReceipt.provenance_digest, secondReceipt.provenance_digest);
  assert.equal(JSON.stringify(firstReceipt).includes("synthetic-project"), false);
});

test("E02 compiler and evaluator share the one local forbidden-string policy", () => {
  const bearer = runtimeCredentialPrefix("Bear", "er", " ", "synthetic_token_value");
  const fileUri = runtimeCredentialPrefix("fi", "le", "://", "synthetic", "/payload");
  const sentinels = [
    runtimeWindowsPath("private", "payload"),
    bearer,
    fileUri,
    runtimePosixPath("ho" + "me", "synthetic", "payload"),
    runtimePosixPath("Us" + "ers", "synthetic", "payload"),
    runtimePosixPath("tm" + "p", "synthetic", "payload"),
    runtimeCredentialPrefix("sk", "-proj-", "synthetic"),
    runtimeCredentialPrefix("gh", "p_", "synthetic"),
    runtimeCredentialPrefix("xox", "b-", "synthetic"),
  ];
  for (const sentinel of sentinels) {
    assert.ok(INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(sentinel)));
  }
});

test("E02 Core compilation scope rejects a forbidden nonempty scope before assembly", () => {
  const scope = { source_hint: runtimePosixPath("ho" + "me", "synthetic", "scope") };
  assert.throws(
    () => assembleEffectiveRuleSet(interfaceConsistencyAdapter, [], scope),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );
});

test("E02 rejects nonempty compilation scope and reclosed trace-scope substitutions", () => {
  assert.throws(
    () => compileInterfaceConsistencyRules([], { scope_id: "scope-original" }),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  const forged = structuredClone(assembly);
  forged.compilation_trace.compilation_scope = { scope_id: "scope-forged" };
  assert.throws(
    () => evaluateCoreAssembly(forged, buildInterfaceConsistencyPublicSyntheticRequest(), "scope-forged"),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.EFFECTIVE_RULESET_INVALID,
  );
});

test("E02 refuses embedded credential markers in public identifiers across schema and runtime", () => {
  const ajv = createE02Ajv();
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  const marker = runtimeCredentialPrefix("prefix_", "gh", "p_", "syntheticcredential123456");
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  request.register_id = marker;
  assert.equal(validateInput(request), false);
  assert.throws(
    () => assessInterfaceConsistency(request),
    (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.UNSAFE_VALUE,
  );
});

test("E02 rejects units on all unitless revision fact call sites", () => {
  const cases = [
    (request) => { interfaceById(request, "IF_SAT").revision.unit = "rev"; },
    (request) => { interfaceById(request, "IF_SAT").ends[0].revision.unit = "rev"; },
    (request) => { interfaceById(request, "IF_SAT").ends[0].agreement.revision.unit = "rev"; },
  ];
  for (const mutate of cases) {
    const request = buildInterfaceConsistencyPublicSyntheticRequest();
    mutate(request);
    assert.throws(
      () => assessInterfaceConsistency(request),
      (error) => error?.code === INTERFACE_CONSISTENCY_EVALUATOR_CODES.INPUT_INVALID,
    );
  }
});

test("E02 top-level interface applicability dominates lower category and Profile statements", () => {
  const [profile] = resolveProfileBindings(null, {
    profile_id: "synthetic-applicability-precedence",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-applicability-precedence-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:applicability-precedence"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: false }],
  });
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]);
  const notApplicable = buildInterfaceConsistencyPublicSyntheticRequest();
  interfaceById(notApplicable, "IF_SAT").applicability = "not_applicable";
  assert.equal(findingByRule(evaluateCoreAssembly(assembly, notApplicable, "precedence-not-applicable"), "IF_SAT", "IC-ELEC-01").state, "not_applicable");

  const unknown = buildInterfaceConsistencyPublicSyntheticRequest();
  interfaceById(unknown, "IF_SAT").applicability = "unknown";
  assert.equal(findingByRule(evaluateCoreAssembly(assembly, unknown, "precedence-unknown"), "IF_SAT", "IC-ELEC-01").state, "gap_unknown");
});
