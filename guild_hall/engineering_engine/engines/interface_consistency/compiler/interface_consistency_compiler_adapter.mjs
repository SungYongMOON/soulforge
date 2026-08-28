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
  INTERFACE_CONSISTENCY_SAFE_PROVENANCE_TOKEN,
  INTERFACE_CONSISTENCY_SAFE_SOURCE_REF,
  interfaceConsistencyStringHasForbiddenMarker,
} from "../rules/interface_consistency_safety_policy.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { validateProfileBinding } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";

export const INTERFACE_CONSISTENCY_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.interface_consistency.compiler.v0";

export const INTERFACE_CONSISTENCY_COMPILER_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: "IC_PROFILE_BINDINGS_INVALID",
  OPERATION_UNSUPPORTED: "IC_PROFILE_OPERATION_UNSUPPORTED",
  OPERATION_INVALID: "IC_PROFILE_OPERATION_INVALID",
  CATEGORY_UNKNOWN: "IC_PROFILE_CATEGORY_UNKNOWN",
  DOMAIN_ENGINE_MISMATCH: "IC_PROFILE_DOMAIN_ENGINE_MISMATCH",
});

const CORE_PROFILE_FIELDS = Object.freeze([
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
]);


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
  if (interfaceConsistencyStringHasForbiddenMarker(value)) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, `Profile provenance field ${field} contains a forbidden path or secret sentinel`);
  }
  return value;
}

function validateBindingProvenance(descriptors, expectedOrder) {
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

  const coreProvenanceFields = CORE_PROFILE_FIELDS.filter((field) => field !== "operations");
  const presentCoreFields = coreProvenanceFields.filter((field) => Object.hasOwn(descriptors, field));
  const suppliedKeys = Object.keys(descriptors).sort();
  if (presentCoreFields.length === 0) {
    if (suppliedKeys.length !== 1 || suppliedKeys[0] !== "operations") {
      profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "direct Profile bindings may carry only an operations array");
    }
    return null;
  }
  if (presentCoreFields.length !== coreProvenanceFields.length) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile provenance must provide the complete exact Core binding shape");
  }
  if (suppliedKeys.length !== CORE_PROFILE_FIELDS.length
      || !CORE_PROFILE_FIELDS.every((field, index) => suppliedKeys[index] === field)) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile binding has an invalid exact-key shape");
  }
  if (descriptors.schema_version.value !== "soulforge.engineering_profile_binding.v0"
      || !Number.isSafeInteger(descriptors.order.value)
      || descriptors.order.value !== expectedOrder
      || (descriptors.profile_kind.value !== "organization" && descriptors.profile_kind.value !== "project")
      || (descriptors.profile_kind.value === "organization" && expectedOrder !== 0)
      || (descriptors.profile_kind.value === "project" && expectedOrder > 1)) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile binding metadata is invalid");
  }
  const sourceRefs = descriptors.source_refs.value;
  if (sourceRefs.length === 0) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile binding must provide at least one source reference");
  }
  let normalizedOperations;
  try {
    normalizedOperations = normalizeProfileOperations(descriptors.operations.value);
  } catch {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile operations do not satisfy the Core operation canonical contract");
  }
  if (descriptors.operation_digest.value !== normalizedOperations.operation_digest) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Profile operation_digest does not match the Core operation canonical contract");
  }
  let coreBinding;
  try {
    coreBinding = validateProfileBinding({
      schema_version: descriptors.schema_version.value,
      profile_kind: descriptors.profile_kind.value,
      profile_id: descriptors.profile_id.value,
      domain_engine_id: descriptors.domain_engine_id.value,
      revision_or_hash: descriptors.revision_or_hash.value,
      extends_or_base_pin: descriptors.extends_or_base_pin.value,
      operation_digest: descriptors.operation_digest.value,
      source_refs: sourceRefs,
      order: descriptors.order.value,
      operations: normalizedOperations.operations,
    }, expectedOrder);
  } catch {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile binding does not satisfy the Core binding contract");
  }
  if (coreBinding.operation_digest !== normalizedOperations.operation_digest) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile operation digest parity failed");
  }
  return coreBinding;
}

function assertBinding(binding, expectedOrder) {
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
  const coreBinding = validateBindingProvenance(descriptors, expectedOrder);
  return {
    descriptors,
    core_binding: coreBinding,
    operations: coreBinding?.operations ?? descriptors.operations.value,
    operation_descriptors: denseArrayDescriptors(coreBinding?.operations ?? descriptors.operations.value, "Profile operations", 64),
  };
}

function provenanceFrom(profilePackageIndex, operationIndex) {
  return {
    profile_package_index: profilePackageIndex,
    operation_index: operationIndex,
  };
}

export function compileInterfaceConsistencyRules(profileBindings = [], compilationScope = undefined) {
  if (!Array.isArray(profileBindings) || types.isProxy(profileBindings) || Object.getPrototypeOf(profileBindings) !== Array.prototype) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "profileBindings must be an ordinary array");
  }
  if (profileBindings.length > 2) {
    profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "profileBindings may contain at most two ordered bindings");
  }
  const bindingDescriptors = denseArrayDescriptors(profileBindings, "profileBindings", 2);
  if (compilationScope !== undefined) {
    const scopeDescriptors = dataDescriptors(compilationScope, "compilationScope");
    if (Object.keys(scopeDescriptors).length !== 0) {
      profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Interface Consistency compilationScope must be the exact empty object");
    }
  }
  // Core calls domain compilers with its admitted compilation scope as a second argument.
  // A one-argument compiler call remains a base-ruleset surface: it may validate supplied
  // bindings, but it cannot manufacture a Profile-effective ruleset without the Core wrapper.
  const coreAssemblyMode = compilationScope !== undefined;
  const categoryApplicability = Object.fromEntries(INTERFACE_CONSISTENCY_CATEGORIES.map((category) => [category, null]));
  const profileRuleProvenance = {};
  const profilePackages = [];
  let organizationSeen = false;
  let projectSeen = false;
  let directBindingSeen = false;

  for (let index = 0; index < profileBindings.length; index += 1) {
    const bindingInfo = assertBinding(bindingDescriptors[String(index)].value, index);
    if (bindingInfo.core_binding && directBindingSeen) {
      profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile bindings may not follow a direct compiler-only binding");
    }
    if (!bindingInfo.core_binding) directBindingSeen = true;
    const profilePackageIndex = bindingInfo.core_binding ? profilePackages.length : null;
    if (bindingInfo.core_binding) {
      if (bindingInfo.core_binding.order !== profilePackageIndex) {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile package order is not contiguous");
      }
      profilePackages.push(structuredClone(bindingInfo.core_binding));
    }
    if (bindingInfo.core_binding?.profile_kind === "organization") {
      if (organizationSeen || projectSeen) {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile bindings must order one organization before any project binding");
      }
      organizationSeen = true;
    }
    if (bindingInfo.core_binding?.profile_kind === "project") {
      if (projectSeen) {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Core Profile bindings may contain at most one project binding");
      }
      projectSeen = true;
    }
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
      if (profilePackageIndex === null) {
        profileError(INTERFACE_CONSISTENCY_COMPILER_CODES.PROFILE_BINDINGS_INVALID, "Profile applicability operations require a complete Core Profile binding");
      }
      if (coreAssemblyMode) {
        categoryApplicability[category] = applicable;
        profileRuleProvenance[category] = provenanceFrom(profilePackageIndex, opIndex);
      }
    }
  }

  const effectiveRuleSet = {
    schema_version: INTERFACE_CONSISTENCY_RULESET_SCHEMA,
    ruleset_ref: structuredClone(INTERFACE_CONSISTENCY_RULESET_REF),
    source_packet_ref: structuredClone(INTERFACE_CONSISTENCY_SOURCE_PACKET_REF),
    rules: INTERFACE_CONSISTENCY_RULES.map((rule) => structuredClone(rule)),
    category_applicability: categoryApplicability,
    profile_packages: coreAssemblyMode ? profilePackages : [],
    profile_rule_provenance: coreAssemblyMode ? profileRuleProvenance : {},
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
