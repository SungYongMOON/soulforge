// Candidate manifest factory. It creates a bounded manifest only; publishing and binding remain
// the integration lane's responsibility.
import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';
import { REQUIRED_MANIFEST_FIELDS, validateManifest } from '../../../core/validators/module_binding.mjs';
import { CONFIGURATION_CHANGE_IMPACT_ERROR_CODES } from '../rules/configuration_change_impact_rules.mjs';

const INPUT_FIELDS = Object.freeze([
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
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export const CCI_MANIFEST_ERROR_CODES = Object.freeze({
  INPUT_REFUSED: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.MANIFEST_INPUT_REFUSED,
});

function refuse(message) {
  throw new ContractError(CCI_MANIFEST_ERROR_CODES.INPUT_REFUSED, message);
}

function snapshotOrdinaryData(value, depth = 0, ancestors = new Set(), seen = new Set()) {
  if (depth > 16) refuse('manifest input depth exceeds the bounded limit');
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || types.isProxy(value)) {
    refuse('manifest factory input must contain only ordinary JSON-like data');
  }
  if (ancestors.has(value) || seen.has(value)) refuse('manifest factory input may not contain aliases or cycles');
  ancestors.add(value);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) {
        refuse('manifest arrays must be ordinary and bounded');
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
        refuse('manifest arrays may not carry symbols, holes, or named fields');
      }
      const copy = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          refuse('manifest arrays may not carry accessors or holes');
        }
        copy.push(snapshotOrdinaryData(descriptor.value, depth + 1, ancestors, seen));
      }
      return copy;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) refuse('manifest objects must have Object.prototype');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const copy = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)
          || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        refuse('manifest objects may not carry symbols, hidden fields, or accessors');
      }
      copy[key] = snapshotOrdinaryData(descriptor.value, depth + 1, ancestors, seen);
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotInput(input) {
  const ordinaryInput = snapshotOrdinaryData(input);
  if (!ordinaryInput || typeof ordinaryInput !== 'object' || Array.isArray(ordinaryInput)) {
    refuse('manifest factory input must be an object');
  }
  const keys = Object.keys(ordinaryInput).sort();
  const expected = [...INPUT_FIELDS].sort();
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    refuse('manifest factory accepts exactly its required fields');
  }
  return {
    module_version: ordinaryInput.module_version,
    build_commit: ordinaryInput.build_commit,
    artifact_sha256: ordinaryInput.artifact_sha256,
    engine_contract_abi_range: ordinaryInput.engine_contract_abi_range,
    supported_project_classifications: [...ordinaryInput.supported_project_classifications],
    dependency_versions: { ...ordinaryInput.dependency_versions },
    configuration_hash: ordinaryInput.configuration_hash,
    rollback_compatible_with: [...ordinaryInput.rollback_compatible_with],
    test_receipt_ref: ordinaryInput.test_receipt_ref,
  };
}

export function createConfigurationChangeImpactModuleManifest(input) {
  const caller = snapshotInput(input);
  const manifest = {
    module_id: 'soulforge.engineering_engine.configuration_change_impact',
    module_version: caller.module_version,
    build_commit: caller.build_commit,
    artifact_sha256: caller.artifact_sha256,
    engine_contract_abi_range: caller.engine_contract_abi_range,
    input_schema_revision: 'soulforge.configuration_change_impact.input.v0',
    output_schema_revision: 'soulforge.configuration_change_impact.assessment.v0',
    authority_ceiling: 'project_change_authority',
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
    refuse('manifest factory emitted fields outside the common Core contract');
  }
  return freezeDeep(manifest);
}
