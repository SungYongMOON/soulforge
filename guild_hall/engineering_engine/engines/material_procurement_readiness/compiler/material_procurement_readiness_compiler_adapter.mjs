// E03 compiler adapter. It accepts Core-normalized Profile Bindings, produces a replayable
// rule set, and never reads ERP/project sources or creates procurement actions.
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import { types } from "node:util";
import {
  MATERIAL_PROCUREMENT_READINESS_RULES,
  MATERIAL_PROCUREMENT_READINESS_RULESET_REF,
  MATERIAL_PROCUREMENT_READINESS_RULESET_REVISION,
  MATERIAL_PROCUREMENT_READINESS_RULESET_SCHEMA,
  MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF,
} from "../rules/material_procurement_readiness_rules.mjs";

export const MPR_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.material_procurement_readiness.compiler.v0";

export const MPR_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: "MPR_PROFILE_BINDINGS_INVALID",
  PROFILE_OPERATION_UNSUPPORTED: "MPR_PROFILE_OPERATION_UNSUPPORTED",
});

const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must be an ordinary object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || PROTOTYPE_SENSITIVE_KEYS.has(key)
      || !descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} may not carry unsafe keys, accessors, or hidden fields`);
    }
  }
}

function copyExactFields(value, fields, label) {
  assertPlainObject(value, label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must use the exact typed field set`);
  }
  const copy = {};
  for (const field of fields) copy[field] = descriptors[field].value;
  return copy;
}

function copyPlainArray(value, label, { required = false } = {}) {
  if (types.isProxy(value) || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype || value.length > 64
    || (required && value.length === 0)) {
    fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must be a bounded ordinary array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string"
    || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) {
    fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} may not carry named or symbol fields`);
  }
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must be dense and data-only`);
    }
    copy.push(descriptor.value);
  }
  return copy;
}

function assertSafeSourceRefs(value, label) {
  const sourceRefs = copyPlainArray(value, label, { required: true });
  for (const ref of sourceRefs) {
    if (typeof ref !== "string" || !TOKEN.test(ref)) {
      fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, `${label} must contain bounded source tokens`);
    }
  }
  return sourceRefs;
}

function validateBinding(rawBinding, expectedOrder, seenKinds) {
  const required = [
    "schema_version",
    "profile_kind",
    "profile_id",
    "domain_engine_id",
    "revision_or_hash",
    "extends_or_base_pin",
    "operation_digest",
    "source_refs",
    "order",
    "operations",
  ];
  const binding = copyExactFields(rawBinding, required, "profile binding");
  if (binding.domain_engine_id !== "material_procurement_readiness"
    || !TOKEN.test(binding.profile_id)
    || typeof binding.revision_or_hash !== "string"
    || binding.revision_or_hash === "unversioned"
    || !binding.revision_or_hash.trim()
    || !TOKEN.test(binding.extends_or_base_pin)) {
    fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding identity or provenance is invalid");
  }
  if ((binding.profile_kind !== "organization" && binding.profile_kind !== "project")
    || binding.order !== expectedOrder
    || seenKinds.has(binding.profile_kind)) {
    fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding order or kind is invalid");
  }
  if (binding.profile_kind === "organization" && expectedOrder !== 0) {
    fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "organization profile must precede project profile");
  }
  const sourceRefs = assertSafeSourceRefs(binding.source_refs, "profile binding source_refs");
  const operations = copyPlainArray(binding.operations, "profile binding operations");
  for (const operation of operations) assertPlainObject(operation, "profile binding operation");
  const normalized = normalizeProfileOperations(operations);
  if (normalized.operation_digest !== binding.operation_digest) {
    fail(MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, "profile binding operation digest does not match its operations");
  }
  seenKinds.add(binding.profile_kind);
  return {
    profile_kind: binding.profile_kind,
    profile_id: binding.profile_id,
    revision_or_hash: binding.revision_or_hash,
    extends_or_base_pin: binding.extends_or_base_pin,
    operation_digest: normalized.operation_digest,
    source_refs: sourceRefs,
    order: binding.order,
    operations: normalized.operations,
  };
}

function applyOperation(operation, policy, trace) {
  assertPlainObject(operation, "profile operation");
  const operationDescriptors = Object.getOwnPropertyDescriptors(operation);
  if (operationDescriptors.op?.value !== "set_default_receipt_required") {
    fail(
      MPR_COMPILER_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED,
      "only { op: 'set_default_receipt_required', value: boolean } is supported; procurement actions are not profile operations",
    );
  }
  const value = copyExactFields(operation, ["op", "value"], "profile operation");
  if (typeof value.value !== "boolean") {
    fail(
      MPR_COMPILER_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED,
      "only { op: 'set_default_receipt_required', value: boolean } is supported; procurement actions are not profile operations",
    );
  }
  policy.default_receipt_required = value.value;
  trace.push({ op: value.op, value: value.value });
}

export function compileMaterialProcurementReadinessRules(profileBindings = [], options = {}) {
  const bindingInputs = copyPlainArray(profileBindings, "profile bindings");
  assertPlainObject(options, "compiler options");
  const seenKinds = new Set();
  const validatedBindings = bindingInputs.map((binding, index) => validateBinding(binding, index, seenKinds));
  const policy = { default_receipt_required: false };
  const operationTrace = [];

  for (const binding of validatedBindings) {
    for (const operation of binding.operations) {
      applyOperation(operation, policy, operationTrace);
    }
  }

  const effectiveRuleSet = {
    schema_version: MATERIAL_PROCUREMENT_READINESS_RULESET_SCHEMA,
    revision: MATERIAL_PROCUREMENT_READINESS_RULESET_REVISION,
    domain_engine_id: "material_procurement_readiness",
    source_packet_ref: MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF,
    rules: MATERIAL_PROCUREMENT_READINESS_RULES.map((rule) => ({
      ...rule,
      required_fact_fields: [...rule.required_fact_fields],
      source_refs: [...rule.source_refs],
    })),
    policy,
  };
  const material = canonicalise(effectiveRuleSet, {
    rules: "sorted_by:rule_id",
    "rules[].required_fact_fields": "insertion_ordered",
    "rules[].source_refs": "insertion_ordered",
  });
  const derivedDigest = sha256Hex(`soulforge.material_procurement_readiness.derived_ruleset.v0\n${material}`);
  const usesBaseRuleset = validatedBindings.length === 0;
  effectiveRuleSet.ruleset_ref = usesBaseRuleset
    ? MATERIAL_PROCUREMENT_READINESS_RULESET_REF
    : {
      entity_id: "material-procurement-readiness-ruleset-derived-v0",
      revision_id: `derived:${derivedDigest.slice(0, 16)}`,
      content_id: `sha256:${derivedDigest}`,
      content_hash_alg: "sha256",
    };

  const profileRuleProvenance = validatedBindings.map((binding) => ({
    profile_kind: binding.profile_kind,
    profile_id: binding.profile_id,
    revision_or_hash: binding.revision_or_hash,
    extends_or_base_pin: binding.extends_or_base_pin,
    operation_digest: binding.operation_digest,
    source_refs: binding.source_refs,
    order: binding.order,
  }));

  return freezeDeep({
    effective_rule_set: effectiveRuleSet,
    rule_count: effectiveRuleSet.rules.length,
    profile_rule_provenance: profileRuleProvenance,
    profile_operation_trace: operationTrace,
  });
}

export const materialProcurementReadinessCompilerAdapter = Object.freeze({
  domain_engine_id: "material_procurement_readiness",
  revision: MPR_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile(profileBindings = [], options = {}) {
    return compileMaterialProcurementReadinessRules(profileBindings, options);
  },
  evaluate() {
    throw new ContractError(
      "MPR_EVALUATION_EVALUATOR_REQUIRED",
      "Material and procurement readiness evaluation must run through materialProcurementReadinessAdapter",
    );
  },
});
