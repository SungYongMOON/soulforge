// Pre-release FFCA module-manifest factory. It snapshots hostile caller material before any
// field read, emits only the shared manifest contract, and never writes or labels a release.
import types from "node:util/types";

import { validateManifest, REQUIRED_MANIFEST_FIELDS, CODES as MODULE_CODES } from "../../../core/validators/module_binding.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";

const MODULE_ID = "soulforge.engineering_engine.field_failure_corrective_action";
const INPUT_SCHEMA = "soulforge.field_failure_corrective_action.request.v0";
const OUTPUT_SCHEMA = "soulforge.field_failure_corrective_action.assessment.v0";
const FACTORY_FIELDS = Object.freeze([
  "artifact_sha256",
  "build_commit",
  "configuration_hash",
  "dependency_versions",
  "engine_contract_abi_range",
  "module_version",
  "rollback_compatible_with",
  "supported_project_classifications",
  "test_receipt_ref",
]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function refuse(message) {
  throw new ContractError(MODULE_CODES.MANIFEST_FIELD_MISSING, message);
}

function freezeDeep(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function descriptorsFor(value, expectedPrototype, label, seen) {
  if (!value || typeof value !== "object" || types.isProxy(value)) refuse(label + " must be a plain non-proxy data value");
  if (seen.has(value)) refuse(label + " may not contain aliases or cycles");
  seen.add(value);
  let descriptors;
  let prototype;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
    prototype = Object.getPrototypeOf(value);
  } catch {
    refuse(label + " reflection failed");
  }
  if (prototype !== expectedPrototype) refuse(label + " must use the standard expected prototype");
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || (key !== "length" && (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable))
        || (key !== "length" && expectedPrototype === Object.prototype && PROTOTYPE_SENSITIVE_KEYS.has(key))) {
      refuse(label + " may not contain accessors, symbols, hidden fields, or prototype-sensitive keys");
    }
  }
  return descriptors;
}

function copyTokenArray(value, label, seen, { required = false } = {}) {
  const descriptors = descriptorsFor(value, Array.prototype, label, seen);
  const length = descriptors.length?.value;
  const keys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
  if (!Number.isSafeInteger(length) || length < 0 || (required && length === 0) || keys.length !== length
      || keys.some((key) => !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length)) {
    refuse(label + " must be a bounded dense token array");
  }
  const copy = [];
  for (let index = 0; index < length; index += 1) {
    const item = descriptors[String(index)].value;
    if (typeof item !== "string" || !TOKEN.test(item)) refuse(label + " contains an invalid token");
    if (index > 0 && copy[index - 1] >= item) refuse(label + " must be sorted and unique");
    copy.push(item);
  }
  return Object.freeze(copy);
}

function copyDependencies(value, seen) {
  const descriptors = descriptorsFor(value, Object.prototype, "dependency_versions", seen);
  const copy = {};
  for (const key of Object.keys(descriptors).sort()) {
    const item = descriptors[key].value;
    if (!TOKEN.test(key) || typeof item !== "string" || item.length === 0) {
      refuse("dependency_versions must contain safe keys and non-empty string values");
    }
    copy[key] = item;
  }
  return Object.freeze(copy);
}

function snapshotFactoryInput(input) {
  const seen = new WeakSet();
  const descriptors = descriptorsFor(input, Object.prototype, "manifest factory input", seen);
  const keys = Object.keys(descriptors).sort();
  const expected = [...FACTORY_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    refuse("manifest factory input must contain exactly its documented caller fields");
  }
  const copy = {};
  for (const field of FACTORY_FIELDS) {
    const value = descriptors[field].value;
    if (field === "supported_project_classifications") copy[field] = copyTokenArray(value, field, seen, { required: true });
    else if (field === "rollback_compatible_with") copy[field] = copyTokenArray(value, field, seen);
    else if (field === "dependency_versions") copy[field] = copyDependencies(value, seen);
    else if (typeof value !== "string" || value.length === 0) refuse(field + " must be a non-empty string");
    else copy[field] = value;
  }
  return Object.freeze(copy);
}

export function createFieldFailureCorrectiveActionModuleManifest(input) {
  const caller = snapshotFactoryInput(input);
  const manifest = {
    module_id: MODULE_ID,
    module_version: caller.module_version,
    build_commit: caller.build_commit,
    artifact_sha256: caller.artifact_sha256,
    engine_contract_abi_range: caller.engine_contract_abi_range,
    input_schema_revision: INPUT_SCHEMA,
    output_schema_revision: OUTPUT_SCHEMA,
    authority_ceiling: "project_contract_baseline",
    claim_ceiling: "source_supported",
    supported_project_classifications: caller.supported_project_classifications,
    execution_mode: "deterministic_only",
    dependency_versions: caller.dependency_versions,
    configuration_hash: caller.configuration_hash,
    migration_requirement: "none",
    rollback_compatible_with: caller.rollback_compatible_with,
    test_receipt_ref: caller.test_receipt_ref,
  };
  validateManifest(manifest);
  if (Object.keys(manifest).length !== REQUIRED_MANIFEST_FIELDS.length) refuse("manifest must emit only the shared contract fields");
  return freezeDeep(manifest);
}
