/**
 * Default-OFF Backup Controller topology v2 preflight.
 *
 * This module accepts only injected, public-safe reference evidence. It never
 * reads a binding file, follows a path, accesses NAS, starts a controller, or
 * authorizes a backup. A passing verdict remains an OFF topology candidate.
 */

import { types } from 'node:util';

import {
  TOO_DEEP,
  deepFreeze,
  digestOf,
  findUnknownKeyDeep,
  guardEntry,
  isDenseArray,
  isPlainObject,
  isSafeRef,
} from '../agent_observation/guard_primitives.mjs';

export const BACKUP_TOPOLOGY_V2_BINDING_SCHEMA = 'soulforge.backup_controller.binding.v2';
export const BACKUP_TOPOLOGY_V2_PREFLIGHT_INPUT_SCHEMA =
  'soulforge.backup_controller.preflight_v2_input.v0';
export const BACKUP_TOPOLOGY_V2_PREFLIGHT_RESULT_SCHEMA =
  'soulforge.backup_controller.preflight_v2_result.v0';

export const BACKUP_TOPOLOGY_V2_PREFLIGHT_STATUS = Object.freeze({
  HOLD: 'HOLD',
  PREFLIGHT_OFF_READY: 'PREFLIGHT_OFF_READY',
});

export const BACKUP_TOPOLOGY_V2_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_SECRET_VALUE_FORBIDDEN',
  ABSOLUTE_PATH_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_ABSOLUTE_PATH_FORBIDDEN',
  INPUT_TOO_DEEP: 'BACKUP_TOPOLOGY_V2_INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'BACKUP_TOPOLOGY_V2_INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'BACKUP_TOPOLOGY_V2_HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_ACCESSOR_PROPERTY_FORBIDDEN',
  INPUT_SHAPE_INVALID: 'BACKUP_TOPOLOGY_V2_INPUT_SHAPE_INVALID',
  CLOCK_INVALID: 'BACKUP_TOPOLOGY_V2_CLOCK_INVALID',
  STALE_EPOCH: 'BACKUP_TOPOLOGY_V2_STALE_EPOCH',
  BINDING_INVALID: 'BACKUP_TOPOLOGY_V2_BINDING_INVALID',
  BINDING_DIGEST_MISMATCH: 'BACKUP_TOPOLOGY_V2_BINDING_DIGEST_MISMATCH',
  DEFAULT_OFF_REQUIRED: 'BACKUP_TOPOLOGY_V2_DEFAULT_OFF_REQUIRED',
  FALLBACK_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_FALLBACK_FORBIDDEN',
  OWNER_EPOCH_MISMATCH: 'BACKUP_TOPOLOGY_V2_OWNER_EPOCH_MISMATCH',
  OWNER_CONFLATION_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_OWNER_CONFLATION_FORBIDDEN',
  EXTERNAL_ERP_OWNER_REQUIRED: 'BACKUP_TOPOLOGY_V2_EXTERNAL_ERP_OWNER_REQUIRED',
  TRANSITION_METADATA_REQUIRED: 'BACKUP_TOPOLOGY_V2_TRANSITION_METADATA_REQUIRED',
  CANONICAL_TARGET_REQUIRED: 'BACKUP_TOPOLOGY_V2_CANONICAL_TARGET_REQUIRED',
  ROLLBACK_TARGET_REQUIRED: 'BACKUP_TOPOLOGY_V2_ROLLBACK_TARGET_REQUIRED',
  INSTALLED_CONTROLLER_READBACK_REQUIRED:
    'BACKUP_TOPOLOGY_V2_INSTALLED_CONTROLLER_READBACK_REQUIRED',
  INSTALLED_PACK_DIGEST_MISMATCH: 'BACKUP_TOPOLOGY_V2_INSTALLED_PACK_DIGEST_MISMATCH',
  EXECUTING_RUNTIME_ROOT_MISMATCH: 'BACKUP_TOPOLOGY_V2_EXECUTING_RUNTIME_ROOT_MISMATCH',
  RESOURCE_INSPECTION_REQUIRED: 'BACKUP_TOPOLOGY_V2_RESOURCE_INSPECTION_REQUIRED',
  RESOURCE_BINDING_MISMATCH: 'BACKUP_TOPOLOGY_V2_RESOURCE_BINDING_MISMATCH',
  TOPOLOGY_OVERLAP_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_TOPOLOGY_OVERLAP_FORBIDDEN',
  SYMLINK_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_SYMLINK_FORBIDDEN',
  REPARSE_FORBIDDEN: 'BACKUP_TOPOLOGY_V2_REPARSE_FORBIDDEN',
});

const H = BACKUP_TOPOLOGY_V2_HOLD_CODES;
const ENTRY_CODES = Object.freeze({
  unknownField: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: H.SECRET_VALUE_FORBIDDEN,
  localPath: H.ABSOLUTE_PATH_FORBIDDEN,
  tooDeep: H.INPUT_TOO_DEEP,
  tooLarge: H.INPUT_TOO_LARGE,
  hostileInput: H.HOSTILE_INPUT_REFUSED,
  accessor: H.ACCESSOR_PROPERTY_FORBIDDEN,
});
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const UTC_MS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u;

const BINDING_FIELDS = Object.freeze([
  'schema_version', 'controller_id', 'feature_state', 'binding_ref', 'binding_digest',
  'binding_epoch', 'fallback_allowed', 'installed_controller', 'external_erp_data_owner',
  'transition_metadata_owners', 'canonical_targets', 'rollback_target',
]);
const INSTALLED_CONTROLLER_FIELDS = Object.freeze([
  'controller_owner_ref', 'owner_epoch', 'controller_ref', 'runtime_ref', 'runtime_digest',
  'runtime_root_ref', 'runtime_root_digest', 'installed_pack_ref', 'installed_pack_digest',
]);
const EXTERNAL_ERP_FIELDS = Object.freeze([
  'owner_ref', 'owner_epoch', 'source_plane', 'data_kind', 'data_ref', 'data_digest',
  'source_root_kind', 'source_root_ref', 'source_root_digest', 'fallback_allowed',
]);
const TRANSITION_FIELDS = Object.freeze([
  'source_id', 'owner_ref', 'owner_epoch', 'source_plane', 'source_ref', 'source_digest',
  'source_root_ref', 'source_root_digest', 'source_state', 'fallback_allowed',
]);
const CANONICAL_TARGET_FIELDS = Object.freeze([
  'target_id', 'owner_ref', 'owner_epoch', 'target_plane', 'target_ref', 'target_digest',
  'target_root_ref', 'target_root_digest', 'target_state', 'source_eligible',
]);
const ROLLBACK_FIELDS = Object.freeze([
  'owner_ref', 'owner_epoch', 'rollback_ref', 'rollback_digest', 'rollback_root_ref',
  'rollback_root_digest', 'state',
]);
const INPUT_FIELDS = Object.freeze([
  'schema_version', 'evaluation_ref', 'clock', 'binding', 'installed_controller_readback',
  'resource_inspections',
]);
const CLOCK_FIELDS = Object.freeze(['clock_ref', 'now_utc', 'current_epoch']);
const READBACK_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'binding_ref', 'binding_digest', 'controller_ref',
  'runtime_ref', 'runtime_digest', 'executing_runtime_root_ref',
  'executing_runtime_root_digest', 'installed_pack_ref', 'expected_installed_pack_digest',
  'observed_installed_pack_digest', 'pack_readback_digest', 'evidence_epoch', 'state',
]);
const INSPECTION_FIELDS = Object.freeze([
  'inspection_ref', 'inspection_digest', 'resource_id', 'resource_ref', 'resource_digest',
  'owner_ref', 'owner_epoch', 'resource_kind', 'realpath_digest', 'is_symlink',
  'reparse_tag', 'parent_resource_id', 'overlap_resource_ids', 'state', 'evidence_epoch',
]);
const TRANSITION_IDS = Object.freeze([
  'c_project_metadata_transition',
  'c_cross_project_state_transition',
]);
const CANONICAL_TARGET_IDS = Object.freeze([
  'd_workspace_canonical_target',
  'd_workmeta_canonical_target',
]);
const INSPECTION_IDS = Object.freeze([
  'installed_controller_runtime',
  'external_erp_root',
  'external_erp_data',
  ...TRANSITION_IDS,
  ...CANONICAL_TARGET_IDS,
  'rollback_target',
]);
const ALL_ALLOWED_KEYS = Object.freeze([
  ...INPUT_FIELDS, ...CLOCK_FIELDS, ...BINDING_FIELDS, ...INSTALLED_CONTROLLER_FIELDS,
  ...EXTERNAL_ERP_FIELDS, ...TRANSITION_FIELDS, ...CANONICAL_TARGET_FIELDS,
  ...ROLLBACK_FIELDS, ...READBACK_FIELDS, ...INSPECTION_FIELDS,
]);

function safeRef(value) {
  return isSafeRef(value) && !value.includes('*') && !value.includes('//')
    && !value.startsWith('/') && !value.startsWith('file:');
}

function safeDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function validEpoch(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function exactRecord(value, fields) {
  return isPlainObject(value) && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function knownRecord(value, fields) {
  return isPlainObject(value) && Object.keys(value).every((field) => fields.includes(field));
}

function digestMatches(record, field) {
  if (!safeDigest(record[field])) return false;
  const body = { ...record };
  delete body[field];
  return record[field] === digestOf(body);
}

function allRefs(record, fields) {
  return fields.every((field) => safeRef(record[field]));
}

function allDigests(record, fields) {
  return fields.every((field) => safeDigest(record[field]));
}

function validUtc(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(UTC_MS);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59;
}

function validClock(clock) {
  return exactRecord(clock, CLOCK_FIELDS) && safeRef(clock.clock_ref)
    && validUtc(clock.now_utc) && validEpoch(clock.current_epoch);
}

function hasProxy(value, seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object') return false;
  if (depth > 12) return false;
  try {
    if (types.isProxy(value)) return true;
    if (seen.has(value)) return false;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.values(descriptors).some((descriptor) => (
      'value' in descriptor && hasProxy(descriptor.value, seen, depth + 1)
    ));
  } catch {
    return true;
  }
}

function bindingProblems(rawBinding) {
  if (hasProxy(rawBinding)) return [H.HOSTILE_INPUT_REFUSED];
  const entry = guardEntry(rawBinding, BINDING_FIELDS, ENTRY_CODES);
  if (entry.status === BACKUP_TOPOLOGY_V2_PREFLIGHT_STATUS.HOLD) return [entry.hold_code];
  const binding = entry.value;
  const unknown = findUnknownKeyDeep(binding, new Set(ALL_ALLOWED_KEYS));
  if (unknown === TOO_DEEP) return [H.INPUT_TOO_DEEP];
  if (unknown !== null) return [H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN];
  if (!exactRecord(binding, BINDING_FIELDS)
    || binding.schema_version !== BACKUP_TOPOLOGY_V2_BINDING_SCHEMA
    || binding.controller_id !== 'soulforge-backup-controller'
    || !safeRef(binding.binding_ref)
    || !validEpoch(binding.binding_epoch)) return [H.BINDING_INVALID];

  const problems = new Set();
  if (binding.feature_state !== 'off') problems.add(H.DEFAULT_OFF_REQUIRED);
  if (binding.fallback_allowed !== false) problems.add(H.FALLBACK_FORBIDDEN);
  if (!digestMatches(binding, 'binding_digest')) problems.add(H.BINDING_DIGEST_MISMATCH);

  const controller = binding.installed_controller;
  if (!exactRecord(controller, INSTALLED_CONTROLLER_FIELDS)
    || !allRefs(controller, ['controller_owner_ref', 'controller_ref', 'runtime_ref', 'runtime_root_ref', 'installed_pack_ref'])
    || !allDigests(controller, ['runtime_digest', 'runtime_root_digest', 'installed_pack_digest'])
    || !validEpoch(controller.owner_epoch)) problems.add(H.BINDING_INVALID);

  const erp = binding.external_erp_data_owner;
  if (!exactRecord(erp, EXTERNAL_ERP_FIELDS)
    || !allRefs(erp, ['owner_ref', 'data_ref', 'source_root_ref'])
    || !allDigests(erp, ['data_digest', 'source_root_digest'])
    || !validEpoch(erp.owner_epoch)
    || erp.source_plane !== 'external_d_data'
    || erp.data_kind !== 'file'
    || erp.source_root_kind !== 'directory') problems.add(H.EXTERNAL_ERP_OWNER_REQUIRED);
  else if (erp.fallback_allowed !== false) problems.add(H.FALLBACK_FORBIDDEN);

  const transitions = binding.transition_metadata_owners;
  if (!isDenseArray(transitions) || transitions.length !== TRANSITION_IDS.length
    || transitions.some((source, index) => !exactRecord(source, TRANSITION_FIELDS)
      || source.source_id !== TRANSITION_IDS[index]
      || !allRefs(source, ['owner_ref', 'source_ref', 'source_root_ref'])
      || !allDigests(source, ['source_digest', 'source_root_digest'])
      || !validEpoch(source.owner_epoch)
      || source.source_plane !== 'c_transition'
      || source.source_state !== 'legacy_transition_source')) {
    problems.add(H.TRANSITION_METADATA_REQUIRED);
  } else if (transitions.some((source) => source.fallback_allowed !== false)) {
    problems.add(H.FALLBACK_FORBIDDEN);
  }

  const targets = binding.canonical_targets;
  if (!isDenseArray(targets) || targets.length !== CANONICAL_TARGET_IDS.length
    || targets.some((target, index) => !exactRecord(target, CANONICAL_TARGET_FIELDS)
      || target.target_id !== CANONICAL_TARGET_IDS[index]
      || !allRefs(target, ['owner_ref', 'target_ref', 'target_root_ref'])
      || !allDigests(target, ['target_digest', 'target_root_digest'])
      || !validEpoch(target.owner_epoch)
      || target.target_plane !== 'd_canonical'
      || target.target_state !== 'empty_canonical_only'
      || target.source_eligible !== false)) problems.add(H.CANONICAL_TARGET_REQUIRED);

  const rollback = binding.rollback_target;
  if (!exactRecord(rollback, ROLLBACK_FIELDS)
    || !allRefs(rollback, ['owner_ref', 'rollback_ref', 'rollback_root_ref'])
    || !allDigests(rollback, ['rollback_digest', 'rollback_root_digest'])
    || !validEpoch(rollback.owner_epoch)
    || rollback.state !== 'verified_empty_rollback_target') problems.add(H.ROLLBACK_TARGET_REQUIRED);

  const ownerRecords = [controller, erp, ...(isDenseArray(transitions) ? transitions : []),
    ...(isDenseArray(targets) ? targets : []), rollback];
  if (ownerRecords.some((record) => !record || record.owner_epoch !== binding.binding_epoch)) {
    problems.add(H.OWNER_EPOCH_MISMATCH);
  }
  const ownerRefs = ownerRecords.map((record) => record?.controller_owner_ref ?? record?.owner_ref)
    .filter((value) => typeof value === 'string');
  if (ownerRefs.length !== 7 || new Set(ownerRefs).size !== ownerRefs.length) {
    problems.add(H.OWNER_CONFLATION_FORBIDDEN);
  }
  return [...problems].sort();
}

export function validateBackupTopologyBindingV2(rawBinding) {
  const problems = bindingProblems(rawBinding);
  return deepFreeze({ ok: problems.length === 0, problems: [...problems] });
}

function expectedResources(binding) {
  return Object.freeze([
    Object.freeze({
      resource_id: 'installed_controller_runtime',
      resource_ref: binding.installed_controller.runtime_root_ref,
      resource_digest: binding.installed_controller.runtime_root_digest,
      owner_ref: binding.installed_controller.controller_owner_ref,
      resource_kind: 'directory',
      parent_resource_id: null,
    }),
    Object.freeze({
      resource_id: 'external_erp_root',
      resource_ref: binding.external_erp_data_owner.source_root_ref,
      resource_digest: binding.external_erp_data_owner.source_root_digest,
      owner_ref: binding.external_erp_data_owner.owner_ref,
      resource_kind: 'directory',
      parent_resource_id: null,
    }),
    Object.freeze({
      resource_id: 'external_erp_data',
      resource_ref: binding.external_erp_data_owner.data_ref,
      resource_digest: binding.external_erp_data_owner.data_digest,
      owner_ref: binding.external_erp_data_owner.owner_ref,
      resource_kind: 'file',
      parent_resource_id: 'external_erp_root',
    }),
    ...binding.transition_metadata_owners.map((source) => Object.freeze({
      resource_id: source.source_id,
      resource_ref: source.source_root_ref,
      resource_digest: source.source_root_digest,
      owner_ref: source.owner_ref,
      resource_kind: 'directory',
      parent_resource_id: null,
    })),
    ...binding.canonical_targets.map((target) => Object.freeze({
      resource_id: target.target_id,
      resource_ref: target.target_root_ref,
      resource_digest: target.target_root_digest,
      owner_ref: target.owner_ref,
      resource_kind: 'directory',
      parent_resource_id: null,
    })),
    Object.freeze({
      resource_id: 'rollback_target',
      resource_ref: binding.rollback_target.rollback_root_ref,
      resource_digest: binding.rollback_target.rollback_root_digest,
      owner_ref: binding.rollback_target.owner_ref,
      resource_kind: 'directory',
      parent_resource_id: null,
    }),
  ]);
}

function holdResult(blockers, clock = null) {
  return deepFreeze({
    schema_version: BACKUP_TOPOLOGY_V2_PREFLIGHT_RESULT_SCHEMA,
    status: BACKUP_TOPOLOGY_V2_PREFLIGHT_STATUS.HOLD,
    effect: 'check_only',
    feature_state: 'off',
    evaluated_at: validClock(clock) ? clock.now_utc : null,
    evaluation_epoch: validClock(clock) ? clock.current_epoch : null,
    activation_authority: false,
    backup_run_authorized: false,
    blockers: [...new Set(blockers)].sort(),
    topology: null,
  });
}

function validReadback(record, binding, clock) {
  if (!exactRecord(record, READBACK_FIELDS)
    || !allRefs(record, ['receipt_ref', 'binding_ref', 'controller_ref', 'runtime_ref',
      'executing_runtime_root_ref', 'installed_pack_ref'])
    || !allDigests(record, ['receipt_digest', 'binding_digest', 'runtime_digest',
      'executing_runtime_root_digest', 'expected_installed_pack_digest',
      'observed_installed_pack_digest', 'pack_readback_digest'])
    || !digestMatches(record, 'receipt_digest')
    || record.state !== 'installed_readback_verified'
    || !validEpoch(record.evidence_epoch)
    || record.evidence_epoch !== clock.current_epoch) return false;
  return true;
}

function validInspection(record, expected, binding, clock) {
  return exactRecord(record, INSPECTION_FIELDS)
    && allRefs(record, ['inspection_ref', 'resource_ref', 'owner_ref'])
    && allDigests(record, ['inspection_digest', 'resource_digest', 'realpath_digest'])
    && digestMatches(record, 'inspection_digest')
    && record.resource_id === expected.resource_id
    && record.resource_ref === expected.resource_ref
    && record.resource_digest === expected.resource_digest
    && record.owner_ref === expected.owner_ref
    && record.owner_epoch === binding.binding_epoch
    && record.resource_kind === expected.resource_kind
    && record.parent_resource_id === expected.parent_resource_id
    && record.is_symlink === false
    && record.reparse_tag === null
    && isDenseArray(record.overlap_resource_ids)
    && record.overlap_resource_ids.length === 0
    && record.state === 'verified_distinct'
    && record.evidence_epoch === clock.current_epoch;
}

/**
 * Evaluates an injected v2 topology packet. Even a pass authorizes neither a
 * binding activation nor a NAS backup; those require a separate owner action.
 */
export function evaluateBackupTopologyPreflightV2(rawEvidence) {
  if (hasProxy(rawEvidence)) return holdResult([H.HOSTILE_INPUT_REFUSED]);
  const entry = guardEntry(rawEvidence, INPUT_FIELDS, ENTRY_CODES);
  if (entry.status === BACKUP_TOPOLOGY_V2_PREFLIGHT_STATUS.HOLD) {
    return holdResult([entry.hold_code]);
  }
  const input = entry.value;
  const unknown = findUnknownKeyDeep(input, new Set(ALL_ALLOWED_KEYS));
  if (unknown === TOO_DEEP) return holdResult([H.INPUT_TOO_DEEP]);
  if (unknown !== null) return holdResult([H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);
  if (!knownRecord(input, INPUT_FIELDS)
    || input.schema_version !== BACKUP_TOPOLOGY_V2_PREFLIGHT_INPUT_SCHEMA
    || !safeRef(input.evaluation_ref)) return holdResult([H.INPUT_SHAPE_INVALID]);

  const clock = input.clock;
  const blockers = new Set();
  if (!validClock(clock)) blockers.add(H.CLOCK_INVALID);
  const bindingIssues = bindingProblems(input.binding);
  for (const issue of bindingIssues) blockers.add(issue);
  if (!validClock(clock) || bindingIssues.length > 0) return holdResult(blockers, clock);
  const binding = input.binding;
  if (binding.binding_epoch !== clock.current_epoch) blockers.add(H.STALE_EPOCH);

  const readback = input.installed_controller_readback;
  if (!validReadback(readback, binding, clock)) {
    blockers.add(H.INSTALLED_CONTROLLER_READBACK_REQUIRED);
  } else {
    const installed = binding.installed_controller;
    if (readback.binding_ref !== binding.binding_ref || readback.binding_digest !== binding.binding_digest
      || readback.controller_ref !== installed.controller_ref || readback.runtime_ref !== installed.runtime_ref
      || readback.runtime_digest !== installed.runtime_digest
      || readback.installed_pack_ref !== installed.installed_pack_ref) {
      blockers.add(H.RESOURCE_BINDING_MISMATCH);
    }
    if (readback.executing_runtime_root_ref !== installed.runtime_root_ref
      || readback.executing_runtime_root_digest !== installed.runtime_root_digest) {
      blockers.add(H.EXECUTING_RUNTIME_ROOT_MISMATCH);
    }
    if (readback.expected_installed_pack_digest !== installed.installed_pack_digest
      || readback.observed_installed_pack_digest !== installed.installed_pack_digest
      || readback.pack_readback_digest !== installed.installed_pack_digest) {
      blockers.add(H.INSTALLED_PACK_DIGEST_MISMATCH);
    }
  }

  const expected = expectedResources(binding);
  const inspections = input.resource_inspections;
  if (!isDenseArray(inspections) || inspections.length !== expected.length) {
    blockers.add(H.RESOURCE_INSPECTION_REQUIRED);
  } else {
    const realpaths = [];
    for (let index = 0; index < expected.length; index += 1) {
      const inspection = inspections[index];
      if (!exactRecord(inspection, INSPECTION_FIELDS)) {
        blockers.add(H.RESOURCE_INSPECTION_REQUIRED);
        continue;
      }
      if (inspection.is_symlink !== false) blockers.add(H.SYMLINK_FORBIDDEN);
      if (inspection.reparse_tag !== null) blockers.add(H.REPARSE_FORBIDDEN);
      if (isDenseArray(inspection.overlap_resource_ids) && inspection.overlap_resource_ids.length > 0) {
        blockers.add(H.TOPOLOGY_OVERLAP_FORBIDDEN);
      }
      if (inspection.evidence_epoch !== clock.current_epoch) blockers.add(H.STALE_EPOCH);
      if (!validInspection(inspection, expected[index], binding, clock)) {
        blockers.add(H.RESOURCE_BINDING_MISMATCH);
      } else {
        realpaths.push(inspection.realpath_digest);
      }
    }
    if (realpaths.length !== expected.length || new Set(realpaths).size !== realpaths.length) {
      blockers.add(H.TOPOLOGY_OVERLAP_FORBIDDEN);
    }
  }

  if (blockers.size > 0) return holdResult(blockers, clock);
  return deepFreeze({
    schema_version: BACKUP_TOPOLOGY_V2_PREFLIGHT_RESULT_SCHEMA,
    status: BACKUP_TOPOLOGY_V2_PREFLIGHT_STATUS.PREFLIGHT_OFF_READY,
    effect: 'check_only',
    feature_state: 'off',
    evaluated_at: clock.now_utc,
    evaluation_epoch: clock.current_epoch,
    activation_authority: false,
    backup_run_authorized: false,
    blockers: [],
    topology: {
      binding_ref: binding.binding_ref,
      binding_digest: binding.binding_digest,
      external_erp_owner_ref: binding.external_erp_data_owner.owner_ref,
      transition_source_ids: binding.transition_metadata_owners.map((source) => source.source_id),
      canonical_target_ids: binding.canonical_targets.map((target) => target.target_id),
      rollback_ref: binding.rollback_target.rollback_ref,
      claim_ceiling: 'default_off_topology_preflight',
    },
  });
}
