// Pre-release E06 manifest factory. It accepts exact caller evidence only and cannot publish,
// activate, or label a release as verified.
import { types } from 'node:util';

import {
  CODES,
  REQUIRED_MANIFEST_FIELDS,
  validateManifest,
} from '../../../core/validators/module_binding.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import {
  RM_ASSESSMENT_SCHEMA,
  RM_DOMAIN_INPUT_SCHEMA,
  RM_MODULE_ID,
} from '../evaluator/reliability_maintainability.mjs';
import { assertRmReceiptRef, assertRmPublicSafeString } from '../rules/reliability_maintainability_public_safe.mjs';

const FACTORY_FIELDS = Object.freeze([
  'module_version',
  'build_commit',
  'artifact_sha256',
  'engine_contract_abi_range',
  'supported_project_classifications',
  'dependency_versions',
  'configuration_hash',
  'rollback_compatible_with',
  'test_receipt_ref',
]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

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

function dataDescriptors(value, prototype, label) {
  if (!value || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== prototype) {
    refuse(`${label} must be an ordinary non-proxy data value`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value')
        || (key !== 'length' && descriptor.enumerable !== true)) {
      refuse(`${label} may not carry symbols, accessors, or hidden fields`);
    }
  }
  return descriptors;
}

function copyStringArray(value, field, { required = false } = {}) {
  const descriptors = dataDescriptors(value, Array.prototype, field);
  const keys = Reflect.ownKeys(descriptors).filter((key) => key !== 'length');
  if (!Number.isSafeInteger(value.length) || value.length > 64 || keys.length !== value.length
      || (required && value.length === 0)) {
    refuse(`${field} must be a bounded dense${required ? ' non-empty' : ''} array`);
  }
  const result = [];
  let prior = null;
  for (let index = 0; index < value.length; index += 1) {
    const item = descriptors[String(index)]?.value;
    if (typeof item !== 'string' || !TOKEN.test(item) || (prior !== null && prior >= item)) {
      refuse(`${field} must contain sorted unique bounded string tokens`);
    }
    prior = item;
    result.push(item);
  }
  return result;
}

function copyStringRecord(value, field) {
  const descriptors = dataDescriptors(value, Object.prototype, field);
  const result = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const item = descriptors[key].value;
    if (!TOKEN.test(key) || PROTOTYPE_KEYS.has(key) || typeof item !== 'string' || item.length === 0) {
      refuse(`${field} must contain bounded safe keys and string values`);
    }
    result[key] = item;
  }
  return result;
}

function snapshotFactoryInput(input) {
  const descriptors = dataDescriptors(input, Object.prototype, 'E06 manifest factory input');
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== FACTORY_FIELDS.length || keys.some((key) => !FACTORY_FIELDS.includes(key))) {
    refuse('E06 manifest factory accepts only its required exact caller values');
  }
  const copy = {};
  for (const field of FACTORY_FIELDS) {
    if (!Object.hasOwn(descriptors, field)) refuse(`E06 manifest field "${field}" is missing`);
    const value = descriptors[field].value;
    if (field === 'supported_project_classifications') {
      copy[field] = copyStringArray(value, field, { required: true });
    } else if (field === 'rollback_compatible_with') {
      copy[field] = copyStringArray(value, field);
    } else if (field === 'dependency_versions') {
      copy[field] = copyStringRecord(value, field);
    } else if (field === 'test_receipt_ref') {
      copy[field] = assertRmReceiptRef(value, {
        code: CODES.MANIFEST_FIELD_MISSING,
        field,
        maxLength: 256,
      });
    } else {
      copy[field] = assertRmPublicSafeString(value, {
        code: CODES.MANIFEST_FIELD_MISSING,
        field,
        maxLength: 512,
      });
    }
  }
  return copy;
}

export function createReliabilityMaintainabilityModuleManifest(input) {
  const caller = snapshotFactoryInput(input);
  const manifest = {
    module_id: RM_MODULE_ID,
    module_version: caller.module_version,
    build_commit: caller.build_commit,
    artifact_sha256: caller.artifact_sha256,
    engine_contract_abi_range: caller.engine_contract_abi_range,
    input_schema_revision: RM_DOMAIN_INPUT_SCHEMA,
    output_schema_revision: RM_ASSESSMENT_SCHEMA,
    authority_ceiling: 'project_contract_baseline',
    claim_ceiling: 'source_supported',
    supported_project_classifications: caller.supported_project_classifications,
    execution_mode: 'deterministic_only',
    dependency_versions: caller.dependency_versions,
    configuration_hash: caller.configuration_hash,
    migration_requirement: 'none',
    rollback_compatible_with: caller.rollback_compatible_with,
    test_receipt_ref: caller.test_receipt_ref,
  };
  validateManifest(manifest);
  if (Object.keys(manifest).length !== REQUIRED_MANIFEST_FIELDS.length) {
    refuse('E06 manifest factory must emit only the common manifest contract');
  }
  return freezeDeep(manifest);
}
