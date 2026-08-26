// Pre-release manifest factory for E03. It creates an immutable description from caller-pinned
// build/test facts and does not publish, register, activate, or bind a release.
import { types } from "node:util";

import { validateManifest } from "../../../core/validators/module_binding.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";

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
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function refuse(message) {
  throw new ContractError("MPR_MODULE_MANIFEST_INVALID", message);
}

function assertPlain(value, prototype, label) {
  if (!value || typeof value !== "object" || types.isProxy(value)
    || Object.getPrototypeOf(value) !== prototype) {
    refuse(`${label} must be an ordinary non-proxy data value`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || PROTOTYPE_SENSITIVE_KEYS.has(key)
      || !descriptor || !Object.hasOwn(descriptor, "value")
      || (key !== "length" && descriptor.enumerable !== true)) {
      refuse(`${label} may not contain unsafe keys, accessors, symbols, or hidden fields`);
    }
  }
}

function copySortedTokens(value, label, required = false) {
  assertPlain(value, Array.prototype, label);
  if (value.length > 64 || (required && value.length === 0)) refuse(`${label} length is invalid`);
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || typeof descriptor.value !== "string" || !TOKEN.test(descriptor.value)
      || (index > 0 && copy[index - 1] >= descriptor.value)) {
      refuse(`${label} must be a sorted, unique, bounded token array`);
    }
    copy.push(descriptor.value);
  }
  return copy;
}

function copyTokenRecord(value, label) {
  assertPlain(value, Object.prototype, label);
  const copy = {};
  for (const key of Object.keys(value)) {
    if (!TOKEN.test(key) || typeof value[key] !== "string" || !/^\d+\.\d+\.\d+$/u.test(value[key])) {
      refuse(`${label} must contain bounded dependency names and exact semantic versions`);
    }
    copy[key] = value[key];
  }
  return copy;
}

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function createMaterialProcurementReadinessModuleManifest(input) {
  assertPlain(input, Object.prototype, "material-procurement-readiness manifest factory input");
  const keys = Object.keys(input).sort();
  const expected = [...FACTORY_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    refuse("manifest factory accepts only the exact caller-pinned field set");
  }
  for (const field of ["module_version", "build_commit", "artifact_sha256", "engine_contract_abi_range", "configuration_hash", "test_receipt_ref"]) {
    if (typeof input[field] !== "string" || input[field].length === 0) refuse(`${field} must be a non-empty string`);
  }
  const manifest = {
    module_id: "soulforge.engineering_engine.material_procurement_readiness",
    module_version: input.module_version,
    build_commit: input.build_commit,
    artifact_sha256: input.artifact_sha256,
    engine_contract_abi_range: input.engine_contract_abi_range,
    input_schema_revision: "soulforge.material_procurement_readiness.typed_project_facts.v1",
    output_schema_revision: "soulforge.material_procurement_readiness.assessment.v0",
    authority_ceiling: "erp_owned_read_only_snapshot",
    claim_ceiling: "source_supported",
    supported_project_classifications: copySortedTokens(input.supported_project_classifications, "supported_project_classifications", true),
    execution_mode: "deterministic_only",
    dependency_versions: copyTokenRecord(input.dependency_versions, "dependency_versions"),
    configuration_hash: input.configuration_hash,
    migration_requirement: "none",
    rollback_compatible_with: copySortedTokens(input.rollback_compatible_with, "rollback_compatible_with"),
    test_receipt_ref: input.test_receipt_ref,
  };
  validateManifest(manifest);
  return freezeDeep(manifest);
}
