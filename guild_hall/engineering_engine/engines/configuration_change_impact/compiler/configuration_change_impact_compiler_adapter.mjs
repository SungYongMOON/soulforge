// Compiler adapter for the fixed public-safe Configuration Change Impact rule pack.
import types from 'node:util/types';

import { canonicalise } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { validateProfileBinding } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import {
  CONFIGURATION_CHANGE_IMPACT_RULES,
  CONFIGURATION_CHANGE_IMPACT_ERROR_CODES,
  CONFIGURATION_CHANGE_IMPACT_RULESET_REF,
  CONFIGURATION_CHANGE_IMPACT_RULESET_SCHEMA,
  CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF,
} from '../rules/configuration_change_impact_rules.mjs';

export const CCI_COMPILER_ADAPTER_SCHEMA_VERSION = 'soulforge.configuration_change_impact.compiler.v0';

export const CCI_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDINGS_INVALID: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.PROFILE_BINDINGS_INVALID,
  PROFILE_DOMAIN_MISMATCH: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.PROFILE_DOMAIN_MISMATCH,
  PROFILE_PROVENANCE_INVALID: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.PROFILE_PROVENANCE_INVALID,
  PROFILE_OPERATION_UNSUPPORTED: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED,
  EVALUATOR_REQUIRED: CONFIGURATION_CHANGE_IMPACT_ERROR_CODES.EVALUATOR_REQUIRED,
});

export const CCI_EMPTY_PROFILE_OPERATION_DIGEST = normalizeProfileOperations([]).operation_digest;
export const CCI_PROFILE_PROVENANCE_SCHEMA_VERSION = 'soulforge.configuration_change_impact.profile_provenance.v0';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SHA256_REFERENCE = /^sha256:[0-9a-f]{64}$/u;

function assertReference(value, label) {
  if (typeof value !== 'string' || !TOKEN.test(value) || value === 'latest' || /^file:/iu.test(value)) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, `${label} must be a safe reference token`);
  }
  return value;
}

function snapshotPlainData(value, depth = 0, ancestors = new Set(), seen = new Set()) {
  if (depth > 16) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile input depth exceeds the bounded limit');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || types.isProxy(value)) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile inputs must contain only ordinary JSON-like data');
  }
  if (ancestors.has(value) || seen.has(value)) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile inputs may not contain aliases or cycles');
  }
  ancestors.add(value);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) {
        throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile arrays must be ordinary and bounded');
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
        throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile arrays may not carry symbols, holes, or named fields');
      }
      const copy = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile arrays may not carry accessors or holes');
        }
        copy.push(snapshotPlainData(descriptor.value, depth + 1, ancestors, seen));
      }
      return copy;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile objects must have Object.prototype');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const copy = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile objects may not carry symbols, hidden fields, or accessors');
      }
      copy[key] = snapshotPlainData(descriptor.value, depth + 1, ancestors, seen);
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || !actual.every((key, index) => key === required[index])) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, `${label} must contain exactly ${required.join(', ')}`);
  }
}

function assertPinnedProfileBinding(binding) {
  assertReference(binding.profile_id, 'profile_id');
  if (!SHA256_REFERENCE.test(binding.revision_or_hash)) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'profile revision_or_hash must be a sha256 pin');
  }
  if (binding.extends_or_base_pin !== CONFIGURATION_CHANGE_IMPACT_RULESET_REF.content_id) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'profile extends_or_base_pin must pin the fixed ruleset content');
  }
  if (binding.operations.length !== 0) {
    throw new ContractError(
      CCI_COMPILER_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED,
      'configuration-change impact v0 preserves provenance but supports no semantic Profile operations',
    );
  }
  if (binding.operation_digest !== CCI_EMPTY_PROFILE_OPERATION_DIGEST) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'v0 accepts only the pinned empty Profile operation digest');
  }
  let previous = null;
  for (const sourceRef of binding.source_refs) {
    assertReference(sourceRef, 'profile source_ref');
    if (previous !== null && previous >= sourceRef) {
      throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'profile source_refs must be sorted and unique');
    }
    previous = sourceRef;
  }
}

function profileProvenance(binding) {
  return Object.freeze({
    profile_kind: binding.profile_kind,
    profile_id: binding.profile_id,
    domain_engine_id: binding.domain_engine_id,
    revision_or_hash: binding.revision_or_hash,
    extends_or_base_pin: binding.extends_or_base_pin,
    operation_digest: binding.operation_digest,
    source_refs: Object.freeze([...binding.source_refs]),
    order: binding.order,
    applied_operations_count: binding.operations.length,
  });
}

export function validateConfigurationChangeImpactProfileProvenance(provenance) {
  const snapshot = snapshotPlainData(provenance);
  if (!Array.isArray(snapshot) || snapshot.length > 2) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'profile provenance must be a bounded array');
  }
  const normalized = [];
  const seenKinds = new Set();
  for (let index = 0; index < snapshot.length; index += 1) {
    const entry = snapshot[index];
    assertExactKeys(entry, [
      'profile_kind',
      'profile_id',
      'domain_engine_id',
      'revision_or_hash',
      'extends_or_base_pin',
      'operation_digest',
      'source_refs',
      'order',
      'applied_operations_count',
    ], 'profile provenance entry');
    if ((entry.profile_kind !== 'organization' && entry.profile_kind !== 'project') || seenKinds.has(entry.profile_kind)) {
      throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'profile provenance kinds must be unique organization/project values');
    }
    if (entry.order !== index || entry.domain_engine_id !== 'configuration_change_impact'
        || !SHA256_REFERENCE.test(entry.revision_or_hash)
        || entry.extends_or_base_pin !== CONFIGURATION_CHANGE_IMPACT_RULESET_REF.content_id
        || entry.operation_digest !== CCI_EMPTY_PROFILE_OPERATION_DIGEST
        || entry.applied_operations_count !== 0) {
      throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'profile provenance pins, domain, order, or operation digest are invalid');
    }
    assertReference(entry.profile_id, 'profile provenance profile_id');
    if (!Array.isArray(entry.source_refs) || entry.source_refs.length === 0) {
      throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'profile provenance source_refs must be non-empty');
    }
    let previous = null;
    for (const sourceRef of entry.source_refs) {
      assertReference(sourceRef, 'profile provenance source_ref');
      if (previous !== null && previous >= sourceRef) {
        throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_PROVENANCE_INVALID, 'profile provenance source_refs must be sorted and unique');
      }
      previous = sourceRef;
    }
    seenKinds.add(entry.profile_kind);
    normalized.push(Object.freeze({
      profile_kind: entry.profile_kind,
      profile_id: entry.profile_id,
      domain_engine_id: entry.domain_engine_id,
      revision_or_hash: entry.revision_or_hash,
      extends_or_base_pin: entry.extends_or_base_pin,
      operation_digest: entry.operation_digest,
      source_refs: Object.freeze([...entry.source_refs]),
      order: entry.order,
      applied_operations_count: entry.applied_operations_count,
    }));
  }
  return Object.freeze(normalized);
}

export function configurationChangeImpactProfileProvenanceDigest(provenance) {
  const normalized = validateConfigurationChangeImpactProfileProvenance(provenance);
  return sha256Hex(`${CCI_PROFILE_PROVENANCE_SCHEMA_VERSION}\n${canonicalise({
    schema_version: CCI_PROFILE_PROVENANCE_SCHEMA_VERSION,
    profiles: normalized,
  }, {
    profiles: 'insertion_ordered',
    'profiles[].source_refs': 'insertion_ordered',
  })}`);
}

export function compileConfigurationChangeImpactRules(profileBindings = [], options = {}) {
  const safeProfileBindings = snapshotPlainData(profileBindings);
  const safeOptions = snapshotPlainData(options);
  if (!Array.isArray(safeProfileBindings)) {
    throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profileBindings must be an array');
  }

  const provenance = [];
  const seenKinds = new Set();
  for (let index = 0; index < safeProfileBindings.length; index += 1) {
    let binding;
    try {
      binding = validateProfileBinding(safeProfileBindings[index], index);
    } catch (error) {
      throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'profile binding is not a valid Core binding');
    }
    if (binding.domain_engine_id !== 'configuration_change_impact') {
      throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_DOMAIN_MISMATCH, 'profile binding targets another domain engine');
    }
    assertPinnedProfileBinding(binding);
    if (seenKinds.has(binding.profile_kind)) {
      throw new ContractError(CCI_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID, 'at most one binding per profile kind is accepted');
    }
    seenKinds.add(binding.profile_kind);
    provenance.push(profileProvenance(binding));
  }

  const normalizedProvenance = validateConfigurationChangeImpactProfileProvenance(provenance);
  const profile_provenance_digest = configurationChangeImpactProfileProvenanceDigest(normalizedProvenance);

  return Object.freeze({
    effective_rule_set: Object.freeze({
      schema_version: CONFIGURATION_CHANGE_IMPACT_RULESET_SCHEMA,
      ruleset_ref: CONFIGURATION_CHANGE_IMPACT_RULESET_REF,
      source_packet_ref: CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF,
      rules: Object.freeze([...CONFIGURATION_CHANGE_IMPACT_RULES]),
      profile_provenance: normalizedProvenance,
      profile_provenance_digest,
    }),
    rule_count: CONFIGURATION_CHANGE_IMPACT_RULES.length,
    profile_provenance: normalizedProvenance,
    profile_provenance_digest,
    compilation_scope: safeOptions?.compilation_scope ?? null,
  });
}

export const configurationChangeImpactCompilerAdapter = Object.freeze({
  domain_engine_id: 'configuration_change_impact',
  revision: CCI_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile(profileBindings = [], options = {}) {
    return compileConfigurationChangeImpactRules(profileBindings, options);
  },
  evaluate() {
    throw new ContractError(
      CCI_COMPILER_ERROR_CODES.EVALUATOR_REQUIRED,
      'Configuration Change Impact evaluation requires its evaluator adapter',
    );
  },
});
