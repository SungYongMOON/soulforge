import { types } from 'node:util';

import { validateManifest, REQUIRED_MANIFEST_FIELDS, CODES } from '../../../core/validators/module_binding.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

const FACTORY_FIELDS = Object.freeze([
  'module_version', 'build_commit', 'artifact_sha256', 'engine_contract_abi_range',
  'supported_project_classifications', 'dependency_versions', 'configuration_hash',
  'rollback_compatible_with', 'test_receipt_ref',
]);

function refuse(message) {
  throw new ContractError(CODES.MANIFEST_FIELD_MISSING, message);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function plainValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    refuse(`${label} must be a plain non-proxy object`);
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      refuse(`${label} must contain only enumerable data properties`);
    }
  }
  return value;
}

export function createCalibrationMeasurementValidityModuleManifest(input) {
  const caller = plainValue(input, 'CMV manifest factory input');
  const keys = Object.keys(caller).sort();
  if (keys.length !== FACTORY_FIELDS.length || FACTORY_FIELDS.some((field) => !Object.hasOwn(caller, field))) {
    refuse('CMV manifest factory accepts only its required exact caller values');
  }
  if (!Array.isArray(caller.supported_project_classifications) || !Array.isArray(caller.rollback_compatible_with)) {
    refuse('CMV manifest arrays are required');
  }
  if (!caller.dependency_versions || typeof caller.dependency_versions !== 'object' || Array.isArray(caller.dependency_versions)) {
    refuse('CMV dependency_versions must be an object');
  }
  const manifest = {
    module_id: 'soulforge.engineering_engine.calibration_measurement_validity',
    module_version: caller.module_version,
    build_commit: caller.build_commit,
    artifact_sha256: caller.artifact_sha256,
    engine_contract_abi_range: caller.engine_contract_abi_range,
    input_schema_revision: 'soulforge.calibration_measurement_validity.domain_input.v0',
    output_schema_revision: 'soulforge.calibration_measurement_validity.assessment.v0',
    authority_ceiling: 'typed_project_facts',
    claim_ceiling: 'source_supported',
    supported_project_classifications: [...caller.supported_project_classifications],
    execution_mode: 'deterministic_only',
    dependency_versions: { ...caller.dependency_versions },
    configuration_hash: caller.configuration_hash,
    migration_requirement: 'none',
    rollback_compatible_with: [...caller.rollback_compatible_with],
    test_receipt_ref: caller.test_receipt_ref,
  };
  validateManifest(manifest);
  if (Object.keys(manifest).length !== REQUIRED_MANIFEST_FIELDS.length) {
    refuse('CMV manifest must emit only the shared module-manifest contract');
  }
  return freezeDeep(manifest);
}
