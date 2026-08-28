import test from "node:test";
import assert from "node:assert/strict";

import {
  compileInterfaceConsistencyRules,
  INTERFACE_CONSISTENCY_COMPILER_CODES,
} from "../compiler/interface_consistency_compiler_adapter.mjs";
import {
  INTERFACE_CONSISTENCY_RULES,
} from "../rules/interface_consistency_rules.mjs";
import {
  resolveProfileBindings,
  assembleEffectiveRuleSet,
  loadDomainEngineAdapter,
  validateProfileBinding,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { interfaceConsistencyAdapter } from "../evaluator/interface_consistency_evaluator_adapter.mjs";

function runtimeWindowsPath(...segments) {
  return ["C:", ...segments].join(String.fromCharCode(92));
}

function runtimeBearerToken() {
  return ["Bear", "er", " ", "synthetic_token_value"].join("");
}

function runtimeCredentialPrefix(...parts) {
  return parts.join("");
}

function prototypeTrapArray(values) {
  let trapCount = 0;
  return {
    value: new Proxy(values, {
      getPrototypeOf() {
        trapCount += 1;
        throw new Error("getPrototypeOf must not execute");
      },
    }),
    trapCount: () => trapCount,
  };
}

test("E02 compiler preserves the base ruleset with no Profile bindings", () => {
  const compiled = compileInterfaceConsistencyRules([]);
  assert.equal(compiled.rule_count, INTERFACE_CONSISTENCY_RULES.length);
  assert.equal(compiled.effective_rule_set.category_applicability.data_protocol, null);
});

test("E02 compiler rejects a Core Profile binding with a mismatched operation digest", () => {
  const coreBinding = validateProfileBinding({
    profile_kind: "organization",
    profile_id: "synthetic-org-digest",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-org-digest-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:org:digest"],
    order: 0,
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  }, 0);
  const forged = { ...coreBinding, operation_digest: "f".repeat(64) };
  assert.throws(
    () => compileInterfaceConsistencyRules([forged]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );
});

test("E02 direct compiler preserves the base-only ruleset when given an ordered Project Profile", () => {
  const [profile] = resolveProfileBindings(null, {
    profile_id: "synthetic-interface-profile",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-interface-profile-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:interface-profile"],
    operations: [
      { op: "set_category_applicability", category: "data_protocol", applicable: false },
    ],
  });

  const compiled = compileInterfaceConsistencyRules([profile]);
  assert.equal(compiled.effective_rule_set.category_applicability.data_protocol, null);
  assert.deepEqual(compiled.effective_rule_set.profile_packages, []);
  assert.deepEqual(compiled.effective_rule_set.profile_rule_provenance, {});

  const assembled = assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]);
  assert.equal(assembled.effective_rule_set.category_applicability.data_protocol, false);
  assert.deepEqual(assembled.effective_rule_set.profile_rule_provenance.data_protocol, {
    profile_package_index: 0,
    operation_index: 0,
  });
});

test("E02 Profile compilation is digest-replay stable through the Core seam", () => {
  const [profile] = resolveProfileBindings(null, {
    profile_id: "synthetic-interface-replay-profile",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-interface-replay-profile-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:interface-replay-profile"],
    operations: [{ op: "set_category_applicability", category: "timing", applicable: true }],
  });
  const first = assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]);
  const second = assembleEffectiveRuleSet(interfaceConsistencyAdapter, [profile]);
  assert.equal(first.assembly_digest, second.assembly_digest);
  assert.equal(first.compilation_trace.effective_ruleset_digest, second.compilation_trace.effective_ruleset_digest);
});

test("G1 GREEN: registered adapter preserves ordered Core Organization to Project Profile parity", () => {
  const adapter = loadDomainEngineAdapter("interface_consistency");
  const bindings = resolveProfileBindings({
    profile_id: "synthetic-org-parity",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-org-parity-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:org:parity"],
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  }, {
    profile_id: "synthetic-project-parity",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-project-parity-r1",
    extends_or_base_pin: "synthetic-org-parity",
    source_refs: ["synthetic:project:parity"],
    operations: [{ op: "set_category_applicability", category: "signal", applicable: false }],
  });
  const direct = compileInterfaceConsistencyRules(bindings);
  const assembled = assembleEffectiveRuleSet(adapter, bindings);
  assert.ok(Object.values(direct.effective_rule_set.category_applicability).every((value) => value === null));
  assert.deepEqual(direct.effective_rule_set.profile_packages, []);
  assert.deepEqual(direct.effective_rule_set.profile_rule_provenance, {});
  assert.deepEqual(assembled.effective_rule_set.profile_rule_provenance.electrical, {
    profile_package_index: 0,
    operation_index: 0,
  });
  assert.deepEqual(assembled.effective_rule_set.profile_rule_provenance.signal, {
    profile_package_index: 1,
    operation_index: 0,
  });
  assert.deepEqual(assembled.compilation_trace.profiles.map((profile) => profile.profile_id), ["synthetic-org-parity", "synthetic-project-parity"]);
});

test("E02 compiler fails closed on unsupported Profile operations", () => {
  assert.throws(
    () => compileInterfaceConsistencyRules([{ operations: [{ op: "add", rule: {} }] }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.OPERATION_UNSUPPORTED,
  );
});

test("E02 compiler fails closed on hostile Profile accessor and domain mismatch inputs", () => {
  const accessorBinding = { operations: [] };
  Object.defineProperty(accessorBinding, "operations", {
    enumerable: true,
    get() {
      throw new Error("accessor must not be invoked");
    },
  });
  assert.throws(
    () => compileInterfaceConsistencyRules([accessorBinding]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );
  assert.throws(
    () => compileInterfaceConsistencyRules([{ domain_engine_id: "systems_engineering", operations: [] }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.DOMAIN_ENGINE_MISMATCH,
  );
});

test("E02 compiler rejects hostile full-Core binding scalars and proxy arrays without traps", () => {
  const binding = validateProfileBinding({
    profile_kind: "project",
    profile_id: "synthetic-hostile-core-binding",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-hostile-core-binding-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:hostile:core-binding"],
    order: 0,
    operations: [{ op: "set_category_applicability", category: "electrical", applicable: true }],
  }, 0);
  for (const candidate of [
    { ...binding, schema_version: Symbol("schema") },
    { ...binding, order: Symbol("order") },
  ]) {
    assert.throws(
      () => compileInterfaceConsistencyRules([candidate]),
      (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
    );
  }
  const operations = prototypeTrapArray(binding.operations);
  assert.throws(
    () => compileInterfaceConsistencyRules([{ ...binding, operations: operations.value }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );
  assert.equal(operations.trapCount(), 0);

  const bindings = prototypeTrapArray([]);
  assert.throws(
    () => compileInterfaceConsistencyRules(bindings.value),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );
  assert.equal(bindings.trapCount(), 0);
});

test("E02 direct compiler rejects hostile scalar operations without coercion or raw TypeError", () => {
  const expectProfileError = (operation) => assert.throws(
    () => compileInterfaceConsistencyRules([{ operations: [operation] }]),
    (error) => typeof error?.code === "string" && error.code.startsWith("IC_PROFILE_"),
  );
  for (const hostile of [Symbol("op"), () => {}, {}]) {
    expectProfileError({ op: hostile, category: "electrical", applicable: true });
    expectProfileError({ op: "set_category_applicability", category: hostile, applicable: true });
    expectProfileError({ op: "set_category_applicability", category: "electrical", applicable: hostile });
  }

  let getterCalls = 0;
  const accessorOperation = { category: "electrical", applicable: true };
  Object.defineProperty(accessorOperation, "op", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  expectProfileError(accessorOperation);
  assert.equal(getterCalls, 0);
});

test("E02 compiler validates provenance strings before copying them in direct and Core-mediated calls", () => {
  assert.throws(
    () => compileInterfaceConsistencyRules([{
      profile_id: runtimeWindowsPath("private", "profile"),
      operations: [],
    }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );

  assert.throws(
    () => compileInterfaceConsistencyRules([{
      source_refs: [runtimeBearerToken()],
      operations: [],
    }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );

  const [coreProfile] = resolveProfileBindings(null, {
    profile_id: "synthetic-core-provenance",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "1e+3",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: ["synthetic:core-provenance"],
    operations: [],
  });
  assert.throws(
    () => compileInterfaceConsistencyRules([coreProfile]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );

  const [corePrivateRef] = resolveProfileBindings(null, {
    profile_id: "synthetic-core-private-ref",
    domain_engine_id: "interface_consistency",
    revision_or_hash: "synthetic-core-private-ref-r1",
    extends_or_base_pin: "interface_consistency:base:v0",
    source_refs: [runtimeWindowsPath("private", "binding")],
    operations: [],
  });
  assert.throws(
    () => compileInterfaceConsistencyRules([corePrivateRef]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );

  assert.throws(
    () => compileInterfaceConsistencyRules([{
      source_refs: [runtimeCredentialPrefix("gh", "p_", "synthetic")],
      operations: [],
    }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );

  assert.throws(
    () => compileInterfaceConsistencyRules([{
      profile_id: runtimeCredentialPrefix("prefix_", "gh", "p_", "syntheticcredential123456"),
      operations: [],
    }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );
});

test("E02 compiler reports an accurate closed binding-count error for more than two direct bindings", () => {
  assert.throws(
    () => compileInterfaceConsistencyRules([
      { operations: [] },
      { operations: [] },
      { operations: [] },
    ]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID
      && /at most two/u.test(error.message),
  );
});
