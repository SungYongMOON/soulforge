// Pre-release FFCA module-manifest factory. Callers supply exact build/test values; this factory
// neither labels a release nor writes a binding.
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

function refuse(message) {
  throw new ContractError(MODULE_CODES.MANIFEST_FIELD_MISSING, message);
}

function copyTokenArray(value, field, { required = false } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)) refuse(`${field} must be a bounded array`);
  const copy = value.map((item) => {
    if (typeof item !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(item)) refuse(`${field} contains an invalid token`);
    return item;
  });
  for (let index = 1; index < copy.length; index += 1) {
    if (copy[index - 1] >= copy[index]) refuse(`${field} must be sorted and unique`);
  }
  return copy;
}

function snapshotFactoryInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) refuse("manifest factory input must be an object");
  const keys = Object.keys(input);
  if (keys.length !== FACTORY_FIELDS.length || FACTORY_FIELDS.some((field) => !Object.hasOwn(input, field))
      || keys.some((field) => !FACTORY_FIELDS.includes(field))) {
    refuse("manifest factory input must contain exactly its documented caller fields");
  }
  const copy = {};
  for (const field of FACTORY_FIELDS) {
    const value = input[field];
    if (field === "supported_project_classifications") copy[field] = copyTokenArray(value, field, { required: true });
    else if (field === "rollback_compatible_with") copy[field] = copyTokenArray(value, field);
    else if (field === "dependency_versions") {
      if (!value || typeof value !== "object" || Array.isArray(value)) refuse("dependency_versions must be an object");
      copy[field] = { ...value };
    } else if (typeof value !== "string" || value.length === 0) refuse(`${field} must be a non-empty string`);
    else copy[field] = value;
  }
  return copy;
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
  return Object.freeze(manifest);
}
