// Candidate-module manifest factory. It validates caller-supplied immutable release metadata
// but never publishes, promotes, or labels a release as verified.
import { types } from 'node:util';

import { CODES, REQUIRED_MANIFEST_FIELDS, validateManifest } from '../../../core/validators/module_binding.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

const MODULE_ID = 'soulforge.engineering_engine.safety_hazard';
const INPUT_SCHEMA = 'soulforge.safety_hazard.domain_input.v0';
const OUTPUT_SCHEMA = 'soulforge.safety_hazard.assessment.v0';
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
const SAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

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

function assertDataContainer(value, prototype, label) {
  if (!value || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== prototype) {
    refuse(`${label} must be an ordinary non-proxy data container`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!Object.hasOwn(descriptor, 'value') || (key !== 'length' && descriptor.enumerable !== true) || SAFE_KEYS.has(key)) {
      refuse(`${label} may not carry hidden, accessor, or prototype-sensitive fields`);
    }
  }
  return descriptors;
}

function copyTokenArray(value, label, { required = false } = {}) {
  const descriptors = assertDataContainer(value, Array.prototype, label);
  const keys = Object.keys(descriptors).filter((key) => key !== 'length');
  if (!Number.isSafeInteger(value.length) || keys.length !== value.length || (required && value.length === 0)) {
    refuse(`${label} must be a dense${required ? ' non-empty' : ''} array`);
  }
  const copy = [];
  let prior = null;
  for (let index = 0; index < value.length; index += 1) {
    const item = descriptors[String(index)]?.value;
    if (typeof item !== 'string' || !TOKEN.test(item) || (prior !== null && prior >= item)) {
      refuse(`${label} must contain sorted, unique bounded tokens`);
    }
    prior = item;
    copy.push(item);
  }
  return copy;
}

function copyVersionRecord(value) {
  const descriptors = assertDataContainer(value, Object.prototype, 'dependency_versions');
  const copy = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!TOKEN.test(key) || SAFE_KEYS.has(key) || typeof descriptor.value !== 'string' || !descriptor.value) {
      refuse('dependency_versions must contain bounded keys and exact version strings');
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function snapshotInput(input) {
  const descriptors = assertDataContainer(input, Object.prototype, 'manifest factory input');
  const actual = Object.keys(descriptors).sort();
  const expected = [...FACTORY_FIELDS].sort();
  if (actual.length !== expected.length || !actual.every((field, index) => field === expected[index])) {
    refuse('manifest factory accepts exactly its required caller values');
  }
  const copy = {};
  for (const field of FACTORY_FIELDS) {
    const value = descriptors[field]?.value;
    if (field === 'supported_project_classifications') {
      copy[field] = copyTokenArray(value, field, { required: true });
    } else if (field === 'rollback_compatible_with') {
      copy[field] = copyTokenArray(value, field);
    } else if (field === 'dependency_versions') {
      copy[field] = copyVersionRecord(value);
    } else if (typeof value !== 'string' || !value) {
      refuse(`${field} must be a non-empty string`);
    } else {
      copy[field] = value;
    }
  }
  return copy;
}

export function createSafetyHazardModuleManifest(input) {
  const caller = snapshotInput(input);
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
  validateManifest(manifest);
  if (Object.keys(manifest).length !== REQUIRED_MANIFEST_FIELDS.length) {
    refuse('manifest factory must emit exactly the common manifest contract');
  }
  return freezeDeep(manifest);
}
