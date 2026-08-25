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
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { interfaceConsistencyAdapter } from "../evaluator/interface_consistency_evaluator_adapter.mjs";

test("E02 compiler preserves the base ruleset with no Profile bindings", () => {
  const compiled = compileInterfaceConsistencyRules([]);
  assert.equal(compiled.rule_count, INTERFACE_CONSISTENCY_RULES.length);
  assert.equal(compiled.effective_rule_set.category_applicability.data_protocol, null);
});

test("E02 compiler applies bounded category applicability from an ordered Project Profile", () => {
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
  assert.equal(compiled.effective_rule_set.category_applicability.data_protocol, false);
  assert.equal(compiled.effective_rule_set.profile_rule_provenance.data_protocol.profile_id, "synthetic-interface-profile");
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
      profile_id: "C:\\private\\profile",
      operations: [],
    }]),
    (error) => error?.code === INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID,
  );

  assert.throws(
    () => compileInterfaceConsistencyRules([{
      source_refs: ["Bearer synthetic_token_value"],
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
    source_refs: ["C:\\private\\binding"],
    operations: [],
  });
  assert.throws(
    () => compileInterfaceConsistencyRules([corePrivateRef]),
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
