// Pre-release manifest factory. The caller supplies every release-sensitive value; this helper
// neither creates a release nor implies independent review, deployment, or applicability.
import { validateManifest, REQUIRED_MANIFEST_FIELDS, CODES } from "../../../core/validators/module_binding.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";

const FACTORY_FIELDS = Object.freeze([
  "module_version",
  "build_commit",
  "artifact_sha256",
  "engine_contract_abi_range",
  "supported_project_classifications",
  "dependency_versions",
  "configuration_hash",
  "rollback_compatible_with",
  "test_receipt_ref",
]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function refuse(message) {
  throw new ContractError(CODES.MANIFEST_FIELD_MISSING, message);
}

function strictObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) refuse(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) refuse(`${label} contains an unsafe field`);
  }
  return descriptors;
}

function sortedTokenArray(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse(`${label} must be an array`);
  let prior = null;
  const copy = [];
  for (const item of value) {
    if (typeof item !== "string" || !TOKEN.test(item) || (prior !== null && prior >= item)) refuse(`${label} must be sorted unique tokens`);
    prior = item;
    copy.push(item);
  }
  return copy;
}

export function createPcbComplianceModuleManifest(input) {
  const descriptors = strictObject(input, "PCB manifest input");
  if (Object.keys(descriptors).length !== FACTORY_FIELDS.length || FACTORY_FIELDS.some((field) => !Object.hasOwn(descriptors, field))) {
    refuse("PCB manifest input must contain only its required caller-pinned fields");
  }
  const dependencyVersions = strictObject(descriptors.dependency_versions.value, "dependency_versions");
  const dependencies = {};
  for (const [key, descriptor] of Object.entries(dependencyVersions)) {
    if (!TOKEN.test(key) || typeof descriptor.value !== "string") refuse("dependency_versions must contain safe string entries");
    dependencies[key] = descriptor.value;
  }
  const manifest = {
    module_id: "soulforge.engineering_engine.pcb_compliance",
    module_version: descriptors.module_version.value,
    build_commit: descriptors.build_commit.value,
    artifact_sha256: descriptors.artifact_sha256.value,
    engine_contract_abi_range: descriptors.engine_contract_abi_range.value,
    input_schema_revision: "soulforge.pcb_compliance.domain_input.v0",
    output_schema_revision: "soulforge.pcb_compliance.assessment.v0",
    authority_ceiling: "project_contract_baseline",
    claim_ceiling: "source_supported",
    supported_project_classifications: sortedTokenArray(descriptors.supported_project_classifications.value, "supported_project_classifications"),
    execution_mode: "deterministic_only",
    dependency_versions: dependencies,
    configuration_hash: descriptors.configuration_hash.value,
    migration_requirement: "none",
    rollback_compatible_with: sortedTokenArray(descriptors.rollback_compatible_with.value, "rollback_compatible_with"),
    test_receipt_ref: descriptors.test_receipt_ref.value,
  };
  validateManifest(manifest);
  if (Object.keys(manifest).length !== REQUIRED_MANIFEST_FIELDS.length) refuse("manifest factory emitted an unexpected shape");
  return deepFreeze(manifest);
}
