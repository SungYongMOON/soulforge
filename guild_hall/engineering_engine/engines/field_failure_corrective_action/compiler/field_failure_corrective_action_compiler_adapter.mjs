// FFCA compiler adapter: a deliberately small Core-facing adapter. Profile provenance is
// preserved by Core; this first candidate accepts only identity-only (empty operation) profiles.
import types from "node:util/types";

import { ContractError } from "../../../core/validators/errors.mjs";
import { PROFILE_BINDING_SCHEMA_VERSION } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import {
  computeFfcaCompilationScopeDigest,
  isFfcaFloatingRevision,
} from "../rules/field_failure_corrective_action_binding_integrity.mjs";
import {
  FFCA_RULES,
  FFCA_RULESET_REF,
  FFCA_RULESET_SCHEMA,
  FFCA_SOURCE_PACKET_REF,
} from "../rules/field_failure_corrective_action_rules.mjs";

export const FFCA_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.field_failure_corrective_action.compiler.v0";
export const FFCA_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDING_INVALID: "FFCA_PROFILE_BINDING_INVALID",
  PROFILE_OPERATION_UNSUPPORTED: "FFCA_PROFILE_OPERATION_UNSUPPORTED",
  PROFILE_DOMAIN_MISMATCH: "FFCA_PROFILE_DOMAIN_MISMATCH",
});

const PROFILE_FIELDS = Object.freeze([
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

function fail(code, message) {
  throw new ContractError(code, message);
}

function freezeDeep(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function ownDataDescriptors(value, expectedPrototype, label) {
  if (!value || typeof value !== "object" || types.isProxy(value)
      || Object.getPrototypeOf(value) !== expectedPrototype) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, `${label} must be a plain non-proxy data value`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || (key !== "length" && (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable))) {
      fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, `${label} may not contain accessors, symbols, or hidden fields`);
    }
  }
  return descriptors;
}

function copyDenseArray(value, label, itemCopy) {
  const descriptors = ownDataDescriptors(value, Array.prototype, label);
  const length = descriptors.length?.value;
  const keys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
  if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length
      || keys.some((key) => !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length)) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, `${label} must be a dense array without named properties`);
  }
  return Object.freeze(Array.from({ length }, (_unused, index) => itemCopy(descriptors[String(index)].value, `${label}[${index}]`)));
}

function requiredString(value, label, { rejectUnversioned = false, rejectFloating = false } = {}) {
  if (typeof value !== "string" || !value.trim() || (rejectUnversioned && value === "unversioned")
      || (rejectFloating && isFfcaFloatingRevision(value))) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, `${label} must be a non-empty string`);
  }
  return value;
}

function copyProfile(rawProfile, expectedOrder, requiredKind) {
  const descriptors = ownDataDescriptors(rawProfile, Object.prototype, "profile binding");
  const keys = Object.keys(descriptors).sort();
  if (keys.length !== PROFILE_FIELDS.length || keys.some((key, index) => key !== PROFILE_FIELDS[index])) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profile binding must contain exactly the Core profile-provenance fields");
  }
  const profile = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, descriptors[field].value]));
  if (profile.schema_version !== PROFILE_BINDING_SCHEMA_VERSION) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profile schema_version must be the Core profile-binding schema version");
  }
  if (profile.domain_engine_id !== "field_failure_corrective_action") {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_DOMAIN_MISMATCH, "profile domain_engine_id must match field_failure_corrective_action");
  }
  if (profile.profile_kind !== requiredKind) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, `profile_kind must be ${requiredKind} at this profile order`);
  }
  if (!Number.isInteger(profile.order) || profile.order !== expectedOrder) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, `profile order must be ${expectedOrder}`);
  }
  const sourceRefs = copyDenseArray(profile.source_refs, "profile.source_refs", (value, label) => (
    requiredString(value, label, { rejectFloating: true })
  ));
  if (sourceRefs.length === 0) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profile.source_refs must be non-empty");
  }
  const operations = copyDenseArray(profile.operations, "profile.operations", (value) => {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED,
      `FFCA v0 preserves profile identity but does not execute profile operation ${typeof value}`);
  });
  if (operations.length !== 0) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED,
      "FFCA v0 preserves profile identity but does not execute project or organization rule operations");
  }
  const normalizedOperations = normalizeProfileOperations(operations);
  if (profile.operation_digest !== normalizedOperations.operation_digest) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID,
      "profile.operation_digest must match the Core canonical operations digest");
  }
  return Object.freeze({
    schema_version: profile.schema_version,
    profile_kind: profile.profile_kind,
    profile_id: requiredString(profile.profile_id, "profile.profile_id"),
    domain_engine_id: profile.domain_engine_id,
    revision_or_hash: requiredString(profile.revision_or_hash, "profile.revision_or_hash", { rejectUnversioned: true, rejectFloating: true }),
    extends_or_base_pin: requiredString(profile.extends_or_base_pin, "profile.extends_or_base_pin", { rejectFloating: true }),
    operation_digest: normalizedOperations.operation_digest,
    source_refs: sourceRefs,
    order: profile.order,
    operations: normalizedOperations.operations,
  });
}

function compileProfileProvenance(profileBindings) {
  if (!Array.isArray(profileBindings) || types.isProxy(profileBindings)
      || Object.getPrototypeOf(profileBindings) !== Array.prototype || profileBindings.length > 2) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profileBindings must be a bounded plain array");
  }
  const descriptors = ownDataDescriptors(profileBindings, Array.prototype, "profileBindings");
  const keys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
  if (keys.length !== profileBindings.length || keys.some((key) => !/^(0|[1-9][0-9]*)$/u.test(key))) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profileBindings must be a dense array without named properties");
  }
  if (profileBindings.length === 0) return Object.freeze([]);

  const seen = new WeakSet();
  const first = descriptors["0"].value;
  if (seen.has(first)) fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profileBindings may not alias profile objects");
  seen.add(first);
  const firstKind = ownDataDescriptors(first, Object.prototype, "profile binding").profile_kind?.value;
  if (firstKind !== "organization" && firstKind !== "project") {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "first profile_kind must be organization or project");
  }
  const provenance = [copyProfile(first, 0, firstKind)];
  if (profileBindings.length === 2) {
    if (firstKind !== "organization") {
      fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "a second profile requires organization then project ordering");
    }
    const second = descriptors["1"].value;
    if (seen.has(second)) fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profileBindings may not alias profile objects");
    provenance.push(copyProfile(second, 1, "project"));
  }
  return Object.freeze(provenance);
}

export function compileFieldFailureCorrectiveActionRules(profileBindings = [], options = {}) {
  if (!Array.isArray(profileBindings)) {
    throw new ContractError(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profileBindings must be an array");
  }
  const provenance = compileProfileProvenance(profileBindings);
  if (!options || typeof options !== "object" || Array.isArray(options) || types.isProxy(options)
      || Object.getPrototypeOf(options) !== Object.prototype) {
    fail(FFCA_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "compilation scope must be a plain object");
  }
  const effectiveRuleSet = {
    schema_version: FFCA_RULESET_SCHEMA,
    domain_engine_id: "field_failure_corrective_action",
    compilation_scope_digest: computeFfcaCompilationScopeDigest(options),
    source_packet_ref: FFCA_SOURCE_PACKET_REF,
    ruleset_ref: FFCA_RULESET_REF,
    profile_rule_provenance: provenance,
    rules: FFCA_RULES.map((rule) => ({
      ...rule,
      source_refs: [...rule.source_refs],
      required_evidence_keys: [...rule.required_evidence_keys],
      ...(rule.not_required_evidence_keys ? { not_required_evidence_keys: [...rule.not_required_evidence_keys] } : {}),
    })),
  };
  return freezeDeep({
    effective_rule_set: effectiveRuleSet,
    rule_count: effectiveRuleSet.rules.length,
  });
}

export const fieldFailureCorrectiveActionCompilerAdapter = Object.freeze({
  domain_engine_id: "field_failure_corrective_action",
  revision: FFCA_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile: compileFieldFailureCorrectiveActionRules,
});
