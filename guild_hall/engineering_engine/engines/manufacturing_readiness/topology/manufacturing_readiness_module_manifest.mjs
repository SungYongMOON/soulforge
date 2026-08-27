// Pre-release local manifest factory. It carries caller-pinned build/test identity
// but does not publish a release or mutate a shared engine manifest.
import { ContractError } from '../../../core/validators/errors.mjs';
import { REQUIRED_MANIFEST_FIELDS, validateManifest } from '../../../core/validators/module_binding.mjs';
import { snapshotPublicData } from '../validators/manufacturing_readiness_input_admission.mjs';

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
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

function refuse(message) {
  throw new ContractError('MR_MODULE_MANIFEST_INVALID', message);
}

function ordinaryData(value, prototype, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) !== (prototype === Array.prototype)
      || Object.getPrototypeOf(value) !== prototype) {
    refuse(`${label} must be ordinary data`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value')
        || (key !== 'length' && descriptors[key].enumerable !== true)) {
      refuse(`${label} may not carry symbols, accessors, or hidden fields`);
    }
  }
  return descriptors;
}

function copyStringArray(value, label, { required = false } = {}) {
  const descriptors = ordinaryData(value, Array.prototype, label);
  const keys = Reflect.ownKeys(descriptors).filter((key) => key !== 'length');
  if (keys.length !== value.length || value.length > 64 || (required && value.length === 0)) {
    refuse(`${label} must be a bounded dense${required ? ' non-empty' : ''} array`);
  }
  let prior = null;
  return value.map((item, index) => {
    if (typeof item !== 'string' || !SAFE_TOKEN.test(item) || (prior !== null && prior >= item)) {
      refuse(`${label} must contain sorted unique safe strings at index ${index}`);
    }
    prior = item;
    return item;
  });
}

function copyDependencyVersions(value) {
  const descriptors = ordinaryData(value, Object.prototype, 'dependency_versions');
  const copy = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const version = descriptors[key].value;
    if (!SAFE_TOKEN.test(key) || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(version)) {
      refuse('dependency_versions must use safe names and exact semver values');
    }
    copy[key] = version;
  }
  return copy;
}

function snapshotFactoryInput(input) {
  const descriptors = ordinaryData(input, Object.prototype, 'manifest factory input');
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== FACTORY_FIELDS.length || keys.some((key) => !FACTORY_FIELDS.includes(key))) {
    refuse('manifest factory accepts only caller-pinned required fields');
  }
  const copy = {};
  for (const field of FACTORY_FIELDS) {
    if (!Object.hasOwn(descriptors, field)) refuse(`manifest factory field "${field}" is missing`);
    const value = descriptors[field].value;
    if (field === 'supported_project_classifications') {
      copy[field] = copyStringArray(value, field, { required: true });
    } else if (field === 'rollback_compatible_with') {
      copy[field] = copyStringArray(value, field);
    } else if (field === 'dependency_versions') {
      copy[field] = copyDependencyVersions(value);
    } else if (typeof value !== 'string' || value.length === 0) {
      refuse(`${field} must be a non-empty string`);
    } else {
      copy[field] = value;
    }
  }
  return copy;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function createManufacturingReadinessModuleManifest(input) {
  const caller = snapshotFactoryInput(snapshotPublicData(input, {
    code: 'MR_MODULE_MANIFEST_INVALID',
    label: 'manufacturing module manifest input',
    maxDepth: 12,
    maxArrayLength: 64,
    maxStringLength: 512,
  }));
  const manifest = {
    module_id: 'soulforge.engineering_engine.manufacturing_readiness',
    module_version: caller.module_version,
    build_commit: caller.build_commit,
    artifact_sha256: caller.artifact_sha256,
    engine_contract_abi_range: caller.engine_contract_abi_range,
    input_schema_revision: 'soulforge.manufacturing_readiness.domain_input.v0',
    output_schema_revision: 'soulforge.manufacturing_readiness.assessment.v0',
    authority_ceiling: 'human_owner_review_required',
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
    refuse('manifest factory emitted an unexpected field');
  }
  return freezeDeep(manifest);
}
