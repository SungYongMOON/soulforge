import { types } from "node:util";

import {
  INTERFACE_CONSISTENCY_CATEGORIES,
  INTERFACE_CONSISTENCY_RULES,
  INTERFACE_CONSISTENCY_RULESET_REF,
  INTERFACE_CONSISTENCY_RULESET_SCHEMA,
  INTERFACE_CONSISTENCY_SOURCE_PACKET_REF,
} from "../rules/interface_consistency_rules.mjs";
import {
  INTERFACE_CONSISTENCY_EXPONENT_LIKE,
  INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS,
  INTERFACE_CONSISTENCY_SAFE_PROVENANCE_TOKEN,
  INTERFACE_CONSISTENCY_SAFE_SOURCE_REF,
} from "../rules/interface_consistency_safety_policy.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";

export const INTERFACE_CONSISTENCY_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.interface_consistency.compiler.v0";

export const INTERFACE_CONSISTENCY_COMPILER_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: "IC_PROFILE_BINDINGS_INVALID",
  OPERATION_UNSUPPORTED: "IC_PROFILE_OPERATION_UNSUPPORTED",
  OPERATION_INVALID: "IC_PROFILE_OPERATION_INVALID",
  CATEGORY_UNKNOWN: "IC_PROFILE_CATEGORY_UNKNOWN",
  DOMAIN_ENGINE_MISMATCH: "IC_PROFILE_DOMAIN_ENGINE_MISMATCH",
});


const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function profileError(code, message) {
  throw new ContractError(code, message);
}

function dataDescriptors(value, label, code = INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    profileError(code, `${label} must be a plain non-proxy object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      profileError(code, `${label} cannot contain accessors, symbols, or hidden fields`);
    }
  }
  return descriptors;
}

function denseArrayDescriptors(value, label, maxLength = 64, code = INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maxLength) {
    profileError(code, `${label} must be a bounded ordinary array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) {
      profileError(code, `${label} cannot contain symbols or named entries`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      profileError(code, `${label} cannot contain sparse or accessor entries`);
    }
  }
  return descriptors;
}

function assertSafeProvenanceString(value, field, { sourceRef = false, rejectExponent = false } = {}) {
  const matcher = sourceRef ? INTERFACE_CONSISTENCY_SAFE_SOURCE_REF : INTERFACE_CONSISTENCY_SAFE_PROVENANCE_TOKEN;
  const maxLength = sourceRef ? 256 : 128;
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength
      || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value) || !matcher.test(value)) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, `Profile provenance field ${field} is not a bounded safe string`);
  }
  if (rejectExponent && INTERFACE_CONSISTENCY_EXPONENT_LIKE.test(value)) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, `Profile provenance field ${field} cannot use exponent-like revision syntax`);
  }
  for (const pattern of INTERFACE_CONSISTENCY_FORBIDDEN_STRING_PATTERNS) {
    if (pattern.test(value)) {
      profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, `Profile provenance field ${field} contains a forbidden path or secret sentinel`);
    }
  }
  return value;
}

function validateBindingProvenance(descriptors) {
  for (const field of ["profile_id", "profile_kind", "extends_or_base_pin", "operation_digest"]) {
    if (Object.hasOwn(descriptors, field)) assertSafeProvenanceString(descriptors[field].value, field);
  }
  if (Object.hasOwn(descriptors, "revision_or_hash")) {
    assertSafeProvenanceString(descriptors.revision_or_hash.value, "revision_or_hash", { rejectExponent: true });
  }
  if (Object.hasOwn(descriptors, "source_refs")) {
    const sourceRefs = descriptors.source_refs.value;
    const sourceDescriptors = denseArrayDescriptors(sourceRefs, "Profile source_refs", 64);
    for (let index = 0; index < sourceRefs.length; index += 1) {
      assertSafeProvenanceString(sourceDescriptors[String(index)].value, `source_refs[${index}]`, { sourceRef: true });
    }
  }
}

function assertBinding(binding) {
  const descriptors = dataDescriptors(binding, "Interface Consistency Profile binding");
  if (!Object.hasOwn(descriptors, "operations")) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "each Interface Consistency Profile binding must provide an operations array");
  }
  if (Object.hasOwn(descriptors, "domain_engine_id")) {
    if (typeof descriptors.domain_engine_id.value !== "string") {
      profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Profile binding domain_engine_id must be a string when supplied");
    }
    if (descriptors.domain_engine_id.value !== "interface_consistency") {
      profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.DOMAIN_ENGINE_MISMATCH, "Profile binding domain_engine_id must equal interface_consistency");
    }
  }
  validateBindingProvenance(descriptors);
  return {
    descriptors,
    operations: descriptors.operations.value,
    operation_descriptors: denseArrayDescriptors(descriptors.operations.value, "Profile operations", 64),
  };
}

function provenanceFrom(descriptors) {
  return {
    profile_id: Object.hasOwn(descriptors, "profile_id") ? descriptors.profile_id.value : "direct_compiler_input",
    profile_kind: Object.hasOwn(descriptors, "profile_kind") ? descriptors.profile_kind.value : "unknown",
    revision_or_hash: Object.hasOwn(descriptors, "revision_or_hash") ? descriptors.revision_or_hash.value : "unknown",
    operation_digest: Object.hasOwn(descriptors, "operation_digest") ? descriptors.operation_digest.value : "unknown",
  };
}

export function compileInterfaceConsistencyRules(profileBindings = []) {
  if (!Array.isArray(profileBindings) || types.isProxy(profileBindings) || Object.getPrototypeOf(profileBindings) !== Array.prototype) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "profileBindings must be an ordinary array");
  }
  if (profileBindings.length > 2) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "profileBindings may contain at most two ordered bindings");
  }
  const bindingDescriptors = denseArrayDescriptors(profileBindings, "profileBindings", 2);
  const categoryApplicability = Object.fromEntries(INTERFACE_CONSISTENCY_CATEGORIES.map((category) => [category, null]));
  const profileRuleProvenance = {};

  for (let index = 0; index < profileBindings.length; index += 1) {
    const bindingInfo = assertBinding(bindingDescriptors[String(index)].value);
    for (let opIndex = 0; opIndex < bindingInfo.operations.length; opIndex += 1) {
      const operationDescriptors = dataDescriptors(
        bindingInfo.operation_descriptors[String(opIndex)].value,
        "Interface Consistency Profile operation",
      );
      const op = operationDescriptors.op?.value;
      if (Object.hasOwn(operationDescriptors, "op") && typeof op !== "string") {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.OPERATION_INVALID, "Profile operation op must be a string");
      }
      if (typeof op === "string" && op !== "set_category_applicability") {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.OPERATION_UNSUPPORTED, "unsupported Interface Consistency Profile operation kind");
      }
      const keys = Object.keys(operationDescriptors).sort();
      const expected = ["applicable", "category", "op"];
      if (keys.length !== expected.length || !keys.every((key, position) => key === expected[position])) {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.OPERATION_INVALID, "set_category_applicability requires exactly op, category, and applicable");
      }
      const category = operationDescriptors.category.value;
      if (typeof category !== "string") {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.OPERATION_INVALID, "set_category_applicability.category must be a string");
      }
      assertSafeProvenanceString(category, "operation.category");
      if (!INTERFACE_CONSISTENCY_CATEGORIES.includes(category)) {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.CATEGORY_UNKNOWN, "unknown Interface Consistency category");
      }
      const applicable = operationDescriptors.applicable.value;
      if (typeof applicable !== "boolean") {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.OPERATION_INVALID, "set_category_applicability.applicable must be boolean");
      }
      categoryApplicability[category] = applicable;
      profileRuleProvenance[category] = provenanceFrom(bindingInfo.descriptors);
    }
  }

  const effectiveRuleSet = {
    schema_version: INTERFACE_CONSISTENCY_RULESET_SCHEMA,
    ruleset_ref: structuredClone(INTERFACE_CONSISTENCY_RULESET_REF),
    source_packet_ref: structuredClone(INTERFACE_CONSISTENCY_SOURCE_PACKET_REF),
    rules: INTERFACE_CONSISTENCY_RULES.map((rule) => structuredClone(rule)),
    category_applicability: categoryApplicability,
    profile_rule_provenance: profileRuleProvenance,
  };

  return deepFreeze({
    effective_rule_set: effectiveRuleSet,
    rule_count: effectiveRuleSet.rules.length,
  });
}

export const interfaceConsistencyCompilerAdapter = Object.freeze({
  domain_engine_id: "interface_consistency",
  revision: INTERFACE_CONSISTENCY_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile: compileInterfaceConsistencyRules,
});
