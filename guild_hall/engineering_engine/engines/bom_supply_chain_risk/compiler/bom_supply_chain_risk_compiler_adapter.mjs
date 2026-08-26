import types from "node:util/types";

import { compareCodePoints } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import {
  BOM_SCR_DOMAIN_ENGINE_ID,
  THRESHOLD_METRICS,
} from "../vocabulary/bom_supply_chain_risk_vocabulary.mjs";
import {
  BOM_SCR_RULES,
  BOM_SCR_RULESET_REF,
  BOM_SCR_RULESET_SCHEMA_VERSION,
  BOM_SCR_SOURCE_PACKET_REF,
  deriveBomSupplyChainRiskRulesetRef,
} from "../rules/bom_supply_chain_risk_rules.mjs";

export const BOM_SCR_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.bom_supply_chain_risk.compiler.v0";

export const BOM_SCR_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: "BOM_SCR_PROFILE_BINDINGS_INVALID",
  PROFILE_OPERATION_INVALID: "BOM_SCR_PROFILE_OPERATION_INVALID",
  THRESHOLD_INVALID: "BOM_SCR_THRESHOLD_INVALID",
  THRESHOLD_CONFLICT: "BOM_SCR_THRESHOLD_CONFLICT",
});

const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertPlainRecord(value, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || (types && types.isProxy(value))
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, `${label} must be a plain object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") {
      fail(code, `${label} has a prohibited key`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(code, `${label} must not contain accessor-backed or hidden values`);
    }
  }
}

function assertExactKeys(value, expectedKeys, code, label) {
  assertPlainRecord(value, code, label);
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...expectedKeys].sort(compareCodePoints);
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    fail(code, `${label} must contain exactly the closed binding fields`);
  }
}

function assertPlainArray(value, code, label) {
  if (!Array.isArray(value) || (types && types.isProxy(value)) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail(code, `${label} must be a standard plain array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) {
      fail(code, `${label} has a prohibited array key`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(code, `${label} contains an accessor-backed or sparse entry`);
    }
  }
}

function assertBoundedText(value, code, label, maxLength = 160) {
  if (typeof value !== "string" || !value || value.length > maxLength
      || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(code, `${label} must be a non-empty bounded NFC string without controls`);
  }
  return value;
}

function copyRef(ref) {
  return Object.freeze({
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  });
}

function validateBinding(binding, index) {
  assertExactKeys(binding, [
    "domain_engine_id",
    "extends_or_base_pin",
    "operation_digest",
    "operations",
    "order",
    "profile_id",
    "profile_kind",
    "revision_or_hash",
    "schema_version",
    "source_refs",
  ], BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `profileBindings[${index}]`);
  if (binding.schema_version !== "soulforge.engineering_profile_binding.v0") {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding schema_version must be the existing Core binding schema");
  }
  if (binding.domain_engine_id !== BOM_SCR_DOMAIN_ENGINE_ID) {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding domain_engine_id does not match bom_supply_chain_risk");
  }
  if (binding.profile_kind !== "organization" && binding.profile_kind !== "project") {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding profile_kind must be organization or project");
  }
  if (!Number.isSafeInteger(binding.order) || binding.order !== index) {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding order must preserve existing Core order");
  }
  assertBoundedText(binding.profile_id, BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile_id");
  assertBoundedText(binding.revision_or_hash, BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "revision_or_hash");
  assertBoundedText(binding.operation_digest, BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "operation_digest");
  assertPlainArray(binding.source_refs, BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding source_refs");
  if (binding.source_refs.length === 0) {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding source_refs must be non-empty");
  }
  const sourceRefs = binding.source_refs.map((sourceRef) => assertBoundedText(
    sourceRef,
    BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
    "source_ref",
    256,
  ));
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding source_refs must not contain duplicates");
  }
  assertPlainArray(binding.operations, BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding operations");
  const normalizedOperations = normalizeProfileOperations(binding.operations);
  if (binding.operation_digest !== normalizedOperations.operation_digest) {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding operation_digest must match the existing Core operation canon");
  }
  return { sourceRefs, operations: normalizedOperations.operations };
}

function validateOperation(operation, bindingIndex, operationIndex) {
  assertPlainRecord(operation, BOM_SCR_COMPILER_ERROR_CODES.PROFILE_OPERATION_INVALID, `operations[${bindingIndex}][${operationIndex}]`);
  const keys = Object.keys(operation).sort(compareCodePoints);
  if (keys.length !== 3 || keys[0] !== "metric" || keys[1] !== "op" || keys[2] !== "value") {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_OPERATION_INVALID, "a BOM/SCR Profile operation must contain exactly metric, op, and value");
  }
  if (operation.op !== "set_threshold" || !THRESHOLD_METRICS.includes(operation.metric)) {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_OPERATION_INVALID, "only the closed set_threshold operation and known threshold metric are allowed");
  }
  if (!Number.isSafeInteger(operation.value) || operation.value < 1 || operation.value > 100000) {
    fail(BOM_SCR_COMPILER_ERROR_CODES.THRESHOLD_INVALID, "threshold value must be a safe integer from 1 through 100000");
  }
  return Object.freeze({ metric: operation.metric, value: operation.value });
}

export function compileBomSupplyChainRiskRules(profileBindings = [], options = {}) {
  assertPlainArray(profileBindings, BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profileBindings");
  if (profileBindings.length > 2) fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "at most two ordered Core Profile Bindings are allowed");
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "options must be a plain object when provided");
  }

  const thresholds = {};
  const profileThresholdProvenance = {};
  const seenProfileKinds = new Set();

  for (let bindingIndex = 0; bindingIndex < profileBindings.length; bindingIndex += 1) {
    const binding = profileBindings[bindingIndex];
    const { sourceRefs, operations } = validateBinding(binding, bindingIndex);
    if (seenProfileKinds.has(binding.profile_kind)
        || (binding.profile_kind === "organization" && seenProfileKinds.has("project"))) {
      fail(BOM_SCR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "Profile Binding kinds must be unique and organization precedes project");
    }
    seenProfileKinds.add(binding.profile_kind);
    const seenMetrics = new Set();
    for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
      const operation = validateOperation(operations[operationIndex], bindingIndex, operationIndex);
      if (seenMetrics.has(operation.metric)) {
        fail(BOM_SCR_COMPILER_ERROR_CODES.THRESHOLD_CONFLICT, "one Profile cannot set the same BOM/SCR threshold more than once");
      }
      seenMetrics.add(operation.metric);
      thresholds[operation.metric] = operation.value;
      profileThresholdProvenance[operation.metric] = {
        profile_kind: binding.profile_kind,
        profile_id: binding.profile_id,
        revision_or_hash: binding.revision_or_hash,
        operation_digest: binding.operation_digest,
        source_refs: [...sourceRefs],
      };
    }
  }

  const orderedThresholds = Object.fromEntries(Object.entries(thresholds).sort(([left], [right]) => compareCodePoints(left, right)));
  const orderedProvenance = Object.fromEntries(Object.entries(profileThresholdProvenance)
    .sort(([left], [right]) => compareCodePoints(left, right)));
  const rulesetRef = deriveBomSupplyChainRiskRulesetRef(orderedThresholds, orderedProvenance);
  const effectiveRuleSet = {
    schema_version: BOM_SCR_RULESET_SCHEMA_VERSION,
    domain_engine_id: BOM_SCR_DOMAIN_ENGINE_ID,
    ruleset_ref: rulesetRef,
    source_packet_ref: copyRef(BOM_SCR_SOURCE_PACKET_REF),
    rules: BOM_SCR_RULES.map((entry) => ({ ...entry })),
    thresholds: orderedThresholds,
    profile_threshold_provenance: orderedProvenance,
  };

  return freezeDeep({
    effective_rule_set: effectiveRuleSet,
    rule_count: BOM_SCR_RULES.length,
  });
}

export const bomSupplyChainRiskCompilerAdapter = Object.freeze({
  domain_engine_id: BOM_SCR_DOMAIN_ENGINE_ID,
  revision: BOM_SCR_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile: compileBomSupplyChainRiskRules,
  evaluate() {
    fail("BOM_SCR_EVALUATOR_REQUIRED", "BOM/SCR evaluation requires bomSupplyChainRiskAdapter");
  },
});
