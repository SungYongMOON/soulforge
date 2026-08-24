// Pre-release manifest factory for the E01 module. It requires caller-supplied exact build and
// test values and deliberately does not publish or label a verified release.
import { types } from 'node:util';

import { validateManifest, REQUIRED_MANIFEST_FIELDS, CODES } from '../kernel/module_binding.mjs';
import { ContractError } from '../kernel/errors.mjs';

const MODULE_ID = 'soulforge.engineering_engine.quality_readiness';
const INPUT_SCHEMA = 'soulforge.quality_readiness.domain_input.v0';
const OUTPUT_SCHEMA = 'soulforge.quality_readiness.assessment.v0';
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

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

function refuse(message) {
  throw new ContractError(CODES.MANIFEST_FIELD_MISSING, message);
}

function dataDescriptors(value, expectedPrototype, label) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== expectedPrototype) {
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

function copyStringArray(value, label, { required = false } = {}) {
  const descriptors = dataDescriptors(value, Array.prototype, label);
  const keys = Reflect.ownKeys(descriptors).filter((key) => key !== 'length');
  if (!Number.isSafeInteger(value.length) || value.length > 64 || keys.length !== value.length
      || (required && value.length === 0)) {
    refuse(`${label} must be a bounded dense${required ? ' non-empty' : ''} array`);
  }
  const copy = [];
  let prior = null;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    const item = descriptor?.value;
    if (!descriptor || typeof item !== 'string' || !TOKEN.test(item)
        || (prior !== null && prior >= item)) {
      refuse(`${label} must contain sorted unique bounded string tokens`);
    }
    prior = item;
    copy.push(item);
  }
  return copy;
}

function copyStringRecord(value, label) {
  const descriptors = dataDescriptors(value, Object.prototype, label);
  const copy = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const item = descriptors[key].value;
    if (!TOKEN.test(key) || PROTOTYPE_KEYS.has(key) || typeof item !== 'string' || item.length === 0) {
      refuse(`${label} must contain bounded safe keys and string values`);
    }
    Object.defineProperty(copy, key, {
      value: item,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function snapshotFactoryInput(input) {
  const descriptors = dataDescriptors(input, Object.prototype, 'quality-readiness manifest factory input');
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== FACTORY_FIELDS.length
      || keys.some((key) => !FACTORY_FIELDS.includes(key))) {
    refuse('quality-readiness manifest factory accepts only its required exact caller values');
  }
  for (const field of FACTORY_FIELDS) {
    if (!Object.hasOwn(descriptors, field)) refuse(`quality-readiness manifest factory field "${field}" is missing`);
  }
  const copy = {};
  for (const field of FACTORY_FIELDS) {
    const value = descriptors[field].value;
    if (field === 'supported_project_classifications') {
      copy[field] = copyStringArray(value, field, { required: true });
    } else if (field === 'rollback_compatible_with') {
      copy[field] = copyStringArray(value, field);
    } else if (field === 'dependency_versions') {
      copy[field] = copyStringRecord(value, field);
    } else {
      if (typeof value !== 'string' || value.length === 0) refuse(`${field} must be a non-empty string`);
      copy[field] = value;
    }
  }
  return copy;
}

export function createQualityReadinessModuleManifest(input) {
  const caller = snapshotFactoryInput(input);
  const manifest = {
    module_id: MODULE_ID,
    module_version: caller.module_version,
    build_commit: caller.build_commit,
    artifact_sha256: caller.artifact_sha256,
    engine_contract_abi_range: caller.engine_contract_abi_range,
    input_schema_revision: INPUT_SCHEMA,
    output_schema_revision: OUTPUT_SCHEMA,
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

  // The common kernel remains the authoritative manifest validator.
  validateManifest(manifest);
  if (Object.keys(manifest).length !== REQUIRED_MANIFEST_FIELDS.length) {
    refuse('quality-readiness manifest factory must emit only the common manifest contract');
  }
  return freezeDeep(manifest);
}
