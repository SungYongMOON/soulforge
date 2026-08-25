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
} from "../evaluator/interface_consistency.mjs";
import {
  buildInterfaceConsistencyPublicSyntheticRequest,
  INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE,
} from "../fixtures/interface_consistency_public_synthetic.mjs";
import {
  assembleEffectiveRuleSet,
  adaptProjectEvidence,
  evaluate,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { INTERFACE_CONSISTENCY_SOURCE_PACKET_REF } from "../rules/interface_consistency_rules.mjs";
import { INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS } from "../rules/interface_consistency_safety_policy.mjs";
import { createInterfaceConsistencyModuleManifest } from "../topology/interface_consistency_module_manifest.mjs";

const RUNNER_PATH = fileURLToPath(new URL("../tools/interface_consistency_runner.mjs", import.meta.url));
const SOURCE_PACKET_PATH = fileURLToPath(new URL("../contracts/interface_consistency_source_packet_v0.md", import.meta.url));
const ASSESSMENT_SCHEMA_PATH = fileURLToPath(new URL("../schemas/interface_consistency_assessment_schema_v0.json", import.meta.url));
const INPUT_SCHEMA_PATH = fileURLToPath(new URL("../schemas/interface_consistency_schema_v0.json", import.meta.url));
const TOPOLOGY_PATH = fileURLToPath(new URL("../topology/interface_consistency_topology.json", import.meta.url));
const INTEGRATION_REQUEST_PATH = fileURLToPath(new URL("../contracts/interface_consistency_integration_request_v0.md", import.meta.url));
const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));

function interfaceById(request, interfaceId) {
  return request.interfaces.find((entry) => entry.interface_id === interfaceId);
}

function findingByRule(result, interfaceId, ruleId) {
  return result.assessments
    .find((assessment) => assessment.interface_id === interfaceId)
    .findings.find((finding) => finding.rule_id === ruleId);
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

  assert.deepEqual(result.states_by_interface, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.states_by_interface);
  assert.deepEqual(result.counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
  assert.equal(result.execution_mode, "deterministic_only");
  assert.equal(result.external_effects.files_written, 0);
  assert.equal(result.external_effects.network_calls, 0);
});

test("E02 uses the existing Core compiler/evaluator seam without Core changes", () => {
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  const result = evaluate(
    interfaceConsistencyAdapter,
    assembly,
    buildInterfaceConsistencyPublicSyntheticRequest(),
  );

  assert.equal(assembly.domain_engine_id, "interface_consistency");
  assert.equal(assembly.rule_count, 8);
  assert.equal(result.overall_state, INTERFACE_CONSISTENCY_STATES.CONFLICT);
  assert.deepEqual(result.counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
});

test("E02 accepts Core authority/cutoffs arguments without inventing deterministic authority semantics", () => {
  const assembly = assembleEffectiveRuleSet(interfaceConsistencyAdapter, []);
  const baseline = evaluate(interfaceConsistencyAdapter, assembly, buildInterfaceConsistencyPublicSyntheticRequest());
  const supplied = evaluate(
    interfaceConsistencyAdapter,
    assembly,
    buildInterfaceConsistencyPublicSyntheticRequest(),
    { authority_ref: "synthetic-authority" },
    { valid_at: "2026-08-26T00:00:00.000Z", known_at: "2026-08-26T00:00:00.000Z" },
  );
  assert.deepEqual(supplied, baseline);
});

test("E02 evaluation is deterministic and non-mutating", () => {
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  const original = structuredClone(request);
  const first = assessInterfaceConsistency(request);
  const second = assessInterfaceConsistency(request);

  assert.deepEqual(request, original);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.findings));
});

test("E02 accepts its register only through the existing Typed Project Facts envelope", () => {
  const result = assessInterfaceConsistency({
    schema_version: "soulforge.typed_project_facts.v0",
    facts: [{
      fact_type: "interface_consistency_register",
      register: buildInterfaceConsistencyPublicSyntheticRequest(),
    }],
  });

  assert.deepEqual(result.counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
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
  assert.deepEqual(result.counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
  assert.equal(result.receipt.envelope_provenance.asserted_facts_digest, typed.facts_digest);
  assert.equal(result.receipt.envelope_provenance.valid_at, typed.valid_at);
  assert.equal(result.receipt.envelope_provenance.known_at, typed.known_at);
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
  unsafe.interfaces[0].ends[0].observations.electrical.attributes[0].value = "C:\\private\\payload";
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
  assert.ok(schema.$defs.finding.required.includes("pair_results"));
  assert.equal(schema.$defs.finding.properties.pair_results.maxItems, 120);
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
  assert.equal(schema.$defs.bounded_value.oneOf[0].maxLength, 1024);
  assert.equal(schema.$defs.bounded_value.oneOf[3].maxItems, 64);
});

test("E02 schemas compile with AJV 2020 and validate real synthetic inputs/results", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  const validateAssessment = ajv.compile(JSON.parse(readFileSync(ASSESSMENT_SCHEMA_PATH, "utf8")));
  const request = buildInterfaceConsistencyPublicSyntheticRequest();
  const assessment = assessInterfaceConsistency(request);
  assert.equal(validateInput(request), true, JSON.stringify(validateInput.errors));
  assert.equal(validateAssessment(assessment), true, JSON.stringify(validateAssessment.errors));

  const unitOnRevision = buildInterfaceConsistencyPublicSyntheticRequest();
  interfaceById(unitOnRevision, "IF_SAT").revision.unit = "rev";
  assert.equal(validateInput(unitOnRevision), false);
  assert.ok(validateInput.errors.some((error) => error.instancePath.endsWith("/revision")));
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

test("E02 public runner is zero-write and emits stable JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "soulforge-interface-consistency-"));
  try {
    const before = readdirSync(directory);
    const run = spawnSync(process.execPath, [RUNNER_PATH], { cwd: directory, encoding: "utf8" });
    const after = readdirSync(directory);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(before, []);
    assert.deepEqual(after, []);
    assert.deepEqual(JSON.parse(run.stdout).counts, INTERFACE_CONSISTENCY_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("E02 domain-local manifest is explicit and does not imply publication", () => {
  const manifest = createInterfaceConsistencyModuleManifest({
    module_version: "0.1.0",
    build_commit: "a".repeat(40),
    artifact_sha256: "b".repeat(64),
    engine_contract_abi_range: ">=1.0.0 <2.0.0",
    supported_project_classifications: ["public_synthetic"],
    dependency_versions: { engineering_engine_core: "1.0.0" },
    configuration_hash: "c".repeat(64),
    rollback_compatible_with: ["0.1.0"],
    test_receipt_ref: "receipt:synthetic_interface_consistency_test_r1",
  });
  assert.equal(manifest.module_id, "soulforge.engineering_engine.interface_consistency");
  assert.equal(manifest.execution_mode, "deterministic_only");
  assert.ok(Object.isFrozen(manifest));
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
  assert.deepEqual(electrical.pair_results.map(({ pair_key, state }) => ({ pair_key, state })), [
    { pair_key: "IF_SAT_end_a<->IF_SAT_end_b", state: "satisfied" },
    { pair_key: "IF_SAT_end_a<->IF_SAT_end_c", state: "gap_conflict" },
    { pair_key: "IF_SAT_end_b<->IF_SAT_end_c", state: "gap_conflict" },
  ]);
  assert.ok(result.assessments.find((assessment) => assessment.interface_id === "IF_SAT")
    .findings.every((finding) => finding.pair_results.length === 3));
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
    const pairStates = findingByRule(first, "IF_SAT", ruleId).pair_results.map(({ pair_key, state }) => ({ pair_key, state }));
    assert.deepEqual(pairStates, [
      { pair_key: "IF_SAT_end_a<->IF_SAT_end_b", state: "satisfied" },
      { pair_key: "IF_SAT_end_a<->IF_SAT_end_c", state: "gap_conflict" },
      { pair_key: "IF_SAT_end_b<->IF_SAT_end_c", state: "gap_conflict" },
    ]);
    assert.deepEqual(
      findingByRule(second, "IF_SAT", ruleId).pair_results.map(({ pair_key, state }) => ({ pair_key, state })),
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
  assert.equal(electrical.pair_results.length, 120);
  assert.equal(electrical.pair_results[0].pair_key, "IF_SAT_end_00<->IF_SAT_end_01");
  assert.equal(electrical.pair_results.at(-1).pair_key, "IF_SAT_end_14<->IF_SAT_end_15");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
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
  Object.defineProperty(hostileFact, "register", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  expectClosedTypedFactsError({ schema_version: "soulforge.typed_project_facts.v0", facts: [hostileFact] });
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
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateInput = ajv.compile(JSON.parse(readFileSync(INPUT_SCHEMA_PATH, "utf8")));
  assert.equal(validateInput(reject), false);
});

test("E02 enforces empty-string and unsafe-integer schema/runtime parity", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
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
    const result = evaluate(interfaceConsistencyAdapter, assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]), request);
    const finding = findingByRule(result, "IF_SAT", "IC-ELEC-01");
    assert.equal(finding.state, "gap_unknown");
    assert.ok(finding.pair_results.every((pair) => pair.state === "gap_unknown"));
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
  nestedProxy.effective_rule_set.ruleset_ref = new Proxy(nestedProxy.effective_rule_set.ruleset_ref, {});
  expectClosedRulesetError(nestedProxy);

  const malformedRule = structuredClone(assembly);
  malformedRule.effective_rule_set.rules[0].source_locator = 3.3;
  expectClosedRulesetError(malformedRule);

  const unexplainedOverride = structuredClone(assembly.effective_rule_set);
  unexplainedOverride.category_applicability.electrical = true;
  expectClosedRulesetError(unexplainedOverride);
  const unsafeProvenance = structuredClone(assembly.effective_rule_set);
  unsafeProvenance.category_applicability.electrical = true;
  unsafeProvenance.profile_rule_provenance.electrical = {
    profile_id: "C:\\private\\profile",
    profile_kind: "project",
    revision_or_hash: "synthetic-r1",
    operation_digest: "a".repeat(64),
  };
  expectClosedRulesetError(unsafeProvenance);
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

  const fullEnvelope = {
    schema_version: "soulforge.typed_project_facts.v0",
    project_binding_ref: { project_id: "synthetic-project", binding_revision_hash: "a".repeat(64) },
    facts: [{ fact_type: "interface_consistency_register", register: buildInterfaceConsistencyPublicSyntheticRequest() }],
    facts_digest: "b".repeat(64),
    valid_at: "2026-08-26T00:00:00.000Z",
    known_at: "2026-08-26T00:00:00.000Z",
  };
  const envelopeReceipt = assessInterfaceConsistency(fullEnvelope).receipt;
  assert.equal(envelopeReceipt.envelope_provenance.envelope_kind, "core_typed_project_facts");
  assert.equal(envelopeReceipt.envelope_provenance.asserted_facts_digest, "b".repeat(64));
  assert.equal(Object.hasOwn(envelopeReceipt.envelope_provenance, "facts_digest"), false);
  assert.equal(envelopeReceipt.envelope_provenance.valid_at, "2026-08-26T00:00:00.000Z");
  assert.match(envelopeReceipt.envelope_provenance.project_binding_ref_digest, /^sha256:[0-9a-f]{64}$/u);

  const coreShapeTimes = structuredClone(fullEnvelope);
  coreShapeTimes.valid_at = "2026-08-26T00:00:00Z";
  coreShapeTimes.known_at = "2026-08-26T00:00:00.1Z";
  const preserved = assessInterfaceConsistency(coreShapeTimes).receipt.envelope_provenance;
  assert.equal(preserved.valid_at, coreShapeTimes.valid_at);
  assert.equal(preserved.known_at, coreShapeTimes.known_at);
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
    const falseResult = evaluate(
      interfaceConsistencyAdapter,
      assembleEffectiveRuleSet(interfaceConsistencyAdapter, [falseProfile]),
      buildInterfaceConsistencyPublicSyntheticRequest(),
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
    const trueResult = evaluate(
      interfaceConsistencyAdapter,
      assembleEffectiveRuleSet(interfaceConsistencyAdapter, [trueProfile]),
      buildInterfaceConsistencyPublicSyntheticRequest(),
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

  const envelope = {
    schema_version: "soulforge.typed_project_facts.v0",
    project_binding_ref: { project_id: "synthetic-project", binding_revision_hash: "a".repeat(64) },
    facts: [{ fact_type: "interface_consistency_register", register: buildInterfaceConsistencyPublicSyntheticRequest() }],
    facts_digest: "c".repeat(64),
    valid_at: "2026-08-26T00:00:00.000Z",
    known_at: "2026-08-26T00:00:00.000Z",
  };
  const changedAssertion = structuredClone(envelope);
  changedAssertion.facts_digest = "d".repeat(64);
  const firstReceipt = assessInterfaceConsistency(envelope).receipt;
  const secondReceipt = assessInterfaceConsistency(changedAssertion).receipt;
  assert.notEqual(firstReceipt.provenance_digest, secondReceipt.provenance_digest);
  assert.equal(JSON.stringify(firstReceipt).includes("synthetic-project"), false);
});

test("E02 compiler and evaluator share the one local forbidden-string policy", () => {
  assert.ok(INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test("C:\\private\\payload")));
  assert.ok(INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test("Bearer synthetic_token_value")));
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
  assert.equal(findingByRule(evaluate(interfaceConsistencyAdapter, assembly, notApplicable), "IF_SAT", "IC-ELEC-01").state, "not_applicable");

  const unknown = buildInterfaceConsistencyPublicSyntheticRequest();
  interfaceById(unknown, "IF_SAT").applicability = "unknown";
  assert.equal(findingByRule(evaluate(interfaceConsistencyAdapter, assembly, unknown), "IF_SAT", "IC-ELEC-01").state, "gap_unknown");
});
