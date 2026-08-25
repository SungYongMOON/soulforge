// Candidate module-manifest factory. It emits exact public-safe metadata and delegates
// common manifest validity to the existing Core validator. It does not publish or activate.
import { validateManifest, REQUIRED_MANIFEST_FIELDS } from "../../../core/validators/module_binding.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";

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
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must be a bounded non-empty string`);
  }
  return value;
}

function safeString(value, field) {
  boundedString(value, field);
  if (!SAFE_TOKEN.test(value)) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must be a safe non-empty token`);
  }
  return value;
}

function cloneStringArray(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must be a bounded non-empty array`);
  }
  const copy = value.map((entry) => safeString(entry, field));
  if (new Set(copy).size !== copy.length) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", `manifest field ${field} must not contain duplicates`);
  }
  return copy.sort();
}

function cloneDependencyVersions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", "dependency_versions must be a plain object");
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    safeString(key, "dependency_versions key");
    output[key] = safeString(value[key], "dependency_versions value");
  }
  return output;
}

export function createInterfaceConsistencyModuleManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", "manifest input must be a plain object");
  }
  const keys = Object.keys(input).sort();
  const expected = [...INPUT_FIELDS].sort();
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", "manifest input has an unexpected field set");
  }
  const manifest = {
    module_id: "soulforge.engineering_engine.interface_consistency",
    module_version: safeString(input.module_version, "module_version"),
    build_commit: safeString(input.build_commit, "build_commit"),
    artifact_sha256: safeString(input.artifact_sha256, "artifact_sha256"),
    engine_contract_abi_range: boundedString(input.engine_contract_abi_range, "engine_contract_abi_range", 64),
    input_schema_revision: "soulforge.interface_consistency.domain_input.v0",
    output_schema_revision: "soulforge.interface_consistency.assessment.v0",
    authority_ceiling: "project_binding_typed_facts",
    claim_ceiling: "source_supported",
    supported_project_classifications: cloneStringArray(input.supported_project_classifications, "supported_project_classifications"),
    execution_mode: "deterministic_only",
    dependency_versions: cloneDependencyVersions(input.dependency_versions),
    configuration_hash: safeString(input.configuration_hash, "configuration_hash"),
    migration_requirement: "none",
    rollback_compatible_with: cloneStringArray(input.rollback_compatible_with, "rollback_compatible_with"),
    test_receipt_ref: safeString(input.test_receipt_ref, "test_receipt_ref"),
  };
  validateManifest(manifest);
  if (Object.keys(manifest).length !== REQUIRED_MANIFEST_FIELDS.length) {
    throw new ContractError("IC_MODULE_MANIFEST_INVALID", "manifest factory must emit exactly the common manifest contract");
  }
  return deepFreeze(manifest);
}
