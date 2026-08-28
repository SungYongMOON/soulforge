// Candidate module-manifest factory. It emits exact public-safe metadata and delegates
// common manifest validity to the existing Core validator. It does not publish or activate.
import { types } from "node:util";

import { validateManifest, REQUIRED_MANIFEST_FIELDS } from "../../../core/validators/module_binding.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { interfaceConsistencyStringHasForbiddenMarker } from "../rules/interface_consistency_safety_policy.mjs";

const INPUT_FIELDS = Object.freeze([
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
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function boundedString(value, field, maxLength = 128) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength
      || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)
      || interfaceConsistencyStringHasForbiddenMarker(value)) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must be a bounded non-empty string`);
  }
  return value;
}

function dataDescriptors(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must be a plain non-proxy object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} cannot contain accessors, symbols, or hidden fields`);
    }
  }
  return descriptors;
}

function denseStringArray(value, field) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length === 0 || value.length > 32) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must be a bounded non-empty array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) {
      throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} cannot contain named or symbol entries`);
    }
  }
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} cannot contain sparse or accessor entries`);
    }
    copy.push(safeString(descriptor.value, field));
  }
  return copy;
}

function safeString(value, field) {
  boundedString(value, field);
  if (!SAFE_TOKEN.test(value)) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must be a safe non-empty token`);
  }
  return value;
}

function cloneStringArray(value, field) {
  const copy = denseStringArray(value, field);
  if (new Set(copy).size !== copy.length) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must not contain duplicates`);
  }
  return copy.sort();
}

function cloneDependencyVersions(value) {
  const descriptors = dataDescriptors(value, "dependency_versions");
  const output = {};
  const keys = Object.keys(descriptors).sort();
  if (keys.length > 32) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", "dependency_versions must be bounded");
  }
  for (const key of keys) {
    safeString(key, "dependency_versions key");
    output[key] = safeString(descriptors[key].value, "dependency_versions value");
  }
  return output;
}

export function createInterfaceConsistencyModuleManifest(input) {
  const inputDescriptors = dataDescriptors(input, "input");
  const keys = Object.keys(inputDescriptors).sort();
  const expected = [...INPUT_FIELDS].sort();
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", "manifest input has an unexpected field set");
  }
  const manifest = {
    module_id: "soulforge.engineering_engine.interface_consistency",
    module_version: safeString(inputDescriptors.module_version.value, "module_version"),
    build_commit: safeString(inputDescriptors.build_commit.value, "build_commit"),
    artifact_sha256: safeString(inputDescriptors.artifact_sha256.value, "artifact_sha256"),
    engine_contract_abi_range: boundedString(inputDescriptors.engine_contract_abi_range.value, "engine_contract_abi_range", 64),
    input_schema_revision: "soulforge.interface_consistency.domain_input.v0",
    output_schema_revision: "soulforge.interface_consistency.assessment.v0",
    authority_ceiling: "project_binding_typed_facts",
    claim_ceiling: "source_supported",
    supported_project_classifications: cloneStringArray(inputDescriptors.supported_project_classifications.value, "supported_project_classifications"),
    execution_mode: "deterministic_only",
    dependency_versions: cloneDependencyVersions(inputDescriptors.dependency_versions.value),
    configuration_hash: safeString(inputDescriptors.configuration_hash.value, "configuration_hash"),
    migration_requirement: "none",
    rollback_compatible_with: cloneStringArray(inputDescriptors.rollback_compatible_with.value, "rollback_compatible_with"),
    test_receipt_ref: safeString(inputDescriptors.test_receipt_ref.value, "test_receipt_ref"),
  };
  validateManifest(manifest);
  if (Object.keys(manifest).length !== REQUIRED_MANIFEST_FIELDS.length) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", "manifest factory must emit exactly the common manifest contract");
  }
  return deepFreeze(manifest);
}
