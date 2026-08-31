/**
 * Pure deployment-readiness evaluator.
 *
 * The evaluator consumes only a caller-injected evidence packet. It does not
 * inspect a host, read a path, call a service, or grant install/release/
 * acceptance authority. A passing result is limited to an isolated-canary
 * readiness candidate.
 */

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
import { types } from 'node:util';

export const DEPLOYMENT_READINESS_INPUT_SCHEMA =
  'soulforge.doctor.deployment_readiness_input.v0';
export const DEPLOYMENT_READINESS_RESULT_SCHEMA =
  'soulforge.doctor.deployment_readiness_result.v0';

export const DEPLOYMENT_READINESS_STATUS = Object.freeze({
  HOLD: 'HOLD',
  READY_FOR_ISOLATED_CANARY: 'READY_FOR_ISOLATED_CANARY',
});

export const DEPLOYMENT_READINESS_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'DEPLOYMENT_READINESS_RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'DEPLOYMENT_READINESS_SECRET_VALUE_FORBIDDEN',
  ABSOLUTE_PATH_FORBIDDEN: 'DEPLOYMENT_READINESS_ABSOLUTE_PATH_FORBIDDEN',
  INPUT_TOO_DEEP: 'DEPLOYMENT_READINESS_INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'DEPLOYMENT_READINESS_INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'DEPLOYMENT_READINESS_HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'DEPLOYMENT_READINESS_ACCESSOR_PROPERTY_FORBIDDEN',
  INPUT_SHAPE_INVALID: 'DEPLOYMENT_READINESS_INPUT_SHAPE_INVALID',
  CLOCK_INVALID: 'DEPLOYMENT_READINESS_CLOCK_INVALID',
  STALE_EVIDENCE: 'DEPLOYMENT_READINESS_STALE_EVIDENCE',
  EFFECT_BOUNDARY_FORBIDDEN: 'DEPLOYMENT_READINESS_EFFECT_BOUNDARY_FORBIDDEN',
  IDENTITY_REQUIRED: 'DEPLOYMENT_READINESS_IDENTITY_REQUIRED',
  IDENTITY_MISMATCH: 'DEPLOYMENT_READINESS_IDENTITY_MISMATCH',
  INSTALLED_PACK_REQUIRED: 'DEPLOYMENT_READINESS_INSTALLED_PACK_REQUIRED',
  PACK_DIGEST_MISMATCH: 'DEPLOYMENT_READINESS_PACK_DIGEST_MISMATCH',
  PREFLIGHT_REQUIRED: 'DEPLOYMENT_READINESS_PREFLIGHT_REQUIRED',
  SERVICE_HEALTH_REQUIRED: 'DEPLOYMENT_READINESS_SERVICE_HEALTH_REQUIRED',
  SERVICE_SOURCE_DIGEST_MISMATCH: 'DEPLOYMENT_READINESS_SERVICE_SOURCE_DIGEST_MISMATCH',
  PATH_REGISTRY_BINDING_REQUIRED: 'DEPLOYMENT_READINESS_PATH_REGISTRY_BINDING_REQUIRED',
  BACKUP_RESTORE_REQUIRED: 'DEPLOYMENT_READINESS_BACKUP_RESTORE_REQUIRED',
  ROLLBACK_REQUIRED: 'DEPLOYMENT_READINESS_ROLLBACK_REQUIRED',
  PROJECT_CAPABILITY_REQUIRED: 'DEPLOYMENT_READINESS_PROJECT_CAPABILITY_REQUIRED',
  PROJECT_SCOPE_MISMATCH: 'DEPLOYMENT_READINESS_PROJECT_SCOPE_MISMATCH',
  SINGLE_ACTIVE_ROOT_REQUIRED: 'DEPLOYMENT_READINESS_SINGLE_ACTIVE_ROOT_REQUIRED',
});

const H = DEPLOYMENT_READINESS_HOLD_CODES;
const ENTRY_CODES = Object.freeze({
  unknownField: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: H.SECRET_VALUE_FORBIDDEN,
  localPath: H.ABSOLUTE_PATH_FORBIDDEN,
  tooDeep: H.INPUT_TOO_DEEP,
  tooLarge: H.INPUT_TOO_LARGE,
  hostileInput: H.HOSTILE_INPUT_REFUSED,
  accessor: H.ACCESSOR_PROPERTY_FORBIDDEN,
});

const TARGET_KINDS = new Set(['main_node', 'universal_client']);
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const UTC_MS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u;
const INPUT_FIELDS = Object.freeze([
  'schema_version', 'evaluation_ref', 'target_kind', 'clock', 'effect_boundary',
  'identity', 'installed_pack', 'preflight', 'service_health',
  'path_registry_binding', 'backup_restore', 'rollback', 'project_capability',
  'active_roots',
]);
const CLOCK_FIELDS = Object.freeze(['clock_ref', 'now_utc', 'current_epoch']);
const EFFECT_BOUNDARY_FIELDS = Object.freeze([
  'reboot_policy', 'install_requested', 'release_requested', 'acceptance_requested',
  'runtime_mutation_requested', 'reboot_requested',
]);
const IDENTITY_FIELDS = Object.freeze([
  'identity_ref', 'identity_digest', 'target_kind', 'node_ref', 'device_ref',
  'project_scope_ref', 'identity_epoch',
]);
const INSTALLED_PACK_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'target_kind', 'target_identity_ref', 'pack_ref',
  'expected_pack_digest', 'installed_pack_digest', 'readback_digest', 'state',
  'evidence_epoch', 'observed_at', 'expires_at',
]);
const PREFLIGHT_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'target_kind', 'target_identity_ref',
  'project_scope_ref', 'pack_ref', 'pack_digest', 'module_preflight_state',
  'product_preflight_state', 'source_relocation_performed', 'evidence_epoch',
  'observed_at', 'expires_at',
]);
const SERVICE_HEALTH_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'target_kind', 'target_identity_ref', 'service_ref',
  'service_digest', 'source_digest', 'readback_source_digest', 'health_state',
  'reboot_requested', 'evidence_epoch', 'observed_at', 'expires_at',
]);
const PATH_BINDING_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'target_kind', 'target_identity_ref',
  'project_scope_ref', 'root_alias', 'root_digest', 'current_binding_ref',
  'current_binding_digest', 'binding_epoch', 'state', 'evidence_epoch',
  'observed_at', 'expires_at',
]);
const BACKUP_RESTORE_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'target_kind', 'target_identity_ref',
  'project_scope_ref', 'current_binding_ref', 'current_binding_digest',
  'source_digest', 'backup_digest', 'restore_readback_digest',
  'exact_backup_readback', 'exact_restore_readback', 'state', 'evidence_epoch',
  'observed_at', 'expires_at',
]);
const ROLLBACK_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'target_kind', 'target_identity_ref',
  'project_scope_ref', 'current_binding_ref', 'current_binding_digest',
  'rollback_binding_ref', 'rollback_binding_digest', 'state', 'reboot_requested',
  'evidence_epoch', 'observed_at', 'expires_at',
]);
const PROJECT_CAPABILITY_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'target_kind', 'target_identity_ref',
  'project_scope_ref', 'capability_refs', 'state', 'evidence_epoch',
  'observed_at', 'expires_at',
]);
const ACTIVE_ROOT_FIELDS = Object.freeze([
  'root_alias', 'current_binding_ref', 'current_binding_digest',
  'target_identity_ref', 'state',
]);
const ALL_ALLOWED_KEYS = Object.freeze([
  ...INPUT_FIELDS, ...CLOCK_FIELDS, ...EFFECT_BOUNDARY_FIELDS, ...IDENTITY_FIELDS,
  ...INSTALLED_PACK_FIELDS, ...PREFLIGHT_FIELDS, ...SERVICE_HEALTH_FIELDS,
  ...PATH_BINDING_FIELDS, ...BACKUP_RESTORE_FIELDS, ...ROLLBACK_FIELDS,
  ...PROJECT_CAPABILITY_FIELDS, ...ACTIVE_ROOT_FIELDS,
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

function sortedSafeRefList(value) {
  return isDenseArray(value) && value.length > 0 && value.length <= 32
    && value.every(safeRef) && new Set(value).size === value.length
    && value.every((entry, index) => index === 0 || value[index - 1] < entry);
}

function allRefs(record, fields) {
  return fields.every((field) => safeRef(record[field]));
}

function allDigests(record, fields) {
  return fields.every((field) => safeDigest(record[field]));
}

function validClock(value) {
  return exactRecord(value, CLOCK_FIELDS)
    && safeRef(value.clock_ref)
    && validUtc(value.now_utc)
    && validEpoch(value.current_epoch);
}

function freshAt(record, clock) {
  return validEpoch(record.evidence_epoch)
    && record.evidence_epoch === clock.current_epoch
    && validUtc(record.observed_at)
    && validUtc(record.expires_at)
    && record.observed_at <= clock.now_utc
    && record.expires_at > clock.now_utc;
}

function validReceipt(record, fields, refFields, digestFields, clock) {
  return exactRecord(record, fields)
    && allRefs(record, ['receipt_ref', ...refFields])
    && allDigests(record, ['receipt_digest', ...digestFields])
    && digestMatches(record, 'receipt_digest')
    && freshAt(record, clock);
}

function requiredRecord(input, field, fields, code, blockers) {
  const value = input[field];
  if (value === undefined || value === null || !exactRecord(value, fields)) {
    blockers.add(code);
    return null;
  }
  return value;
}

function holdResult(blockers, clock = null) {
  return deepFreeze({
    schema_version: DEPLOYMENT_READINESS_RESULT_SCHEMA,
    status: DEPLOYMENT_READINESS_STATUS.HOLD,
    effect: 'check_only',
    evaluated_at: validClock(clock) ? clock.now_utc : null,
    evaluation_epoch: validClock(clock) ? clock.current_epoch : null,
    authority: {
      install: 0,
      release: 0,
      acceptance: 0,
      runtime_operation: 0,
    },
    blockers: [...new Set(blockers)].sort(),
    readiness: null,
  });
}

function targetRef(identity) {
  return identity.target_kind === 'main_node' ? identity.node_ref : identity.device_ref;
}

function hasProxy(value, seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object') return false;
  if (depth > 12) return false;
  try {
    if (types.isProxy(value)) return true;
    if (seen.has(value)) return false;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
      if ('value' in descriptor && hasProxy(descriptor.value, seen, depth + 1)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function validIdentity(identity, targetKind) {
  if (!exactRecord(identity, IDENTITY_FIELDS)
    || !safeRef(identity.identity_ref)
    || !safeDigest(identity.identity_digest)
    || identity.target_kind !== targetKind
    || !safeRef(identity.project_scope_ref)
    || !validEpoch(identity.identity_epoch)
    || !digestMatches(identity, 'identity_digest')) return false;
  if (targetKind === 'main_node') {
    return safeRef(identity.node_ref) && identity.device_ref === null;
  }
  return identity.node_ref === null && safeRef(identity.device_ref);
}

function sameTarget(record, identity, targetKind) {
  return record.target_kind === targetKind && record.target_identity_ref === identity.identity_ref;
}

/**
 * Evaluates only caller-supplied deployment evidence for a Main Node or
 * Universal Client. It does not perform the canary or any deployment action.
 */
export function evaluateDeploymentReadiness(rawEvidence) {
  if (hasProxy(rawEvidence)) return holdResult([H.HOSTILE_INPUT_REFUSED]);
  const entry = guardEntry(rawEvidence, INPUT_FIELDS, ENTRY_CODES);
  if (entry.status === DEPLOYMENT_READINESS_STATUS.HOLD) return holdResult([entry.hold_code]);
  const input = entry.value;
  const unknown = findUnknownKeyDeep(input, new Set(ALL_ALLOWED_KEYS));
  if (unknown === TOO_DEEP) return holdResult([H.INPUT_TOO_DEEP]);
  if (unknown !== null) return holdResult([H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);
  if (!knownRecord(input, INPUT_FIELDS)
    || input.schema_version !== DEPLOYMENT_READINESS_INPUT_SCHEMA
    || !safeRef(input.evaluation_ref)
    || !TARGET_KINDS.has(input.target_kind)) return holdResult([H.INPUT_SHAPE_INVALID]);

  const blockers = new Set();
  const clock = input.clock;
  if (!validClock(clock)) blockers.add(H.CLOCK_INVALID);
  const boundary = input.effect_boundary;
  if (!exactRecord(boundary, EFFECT_BOUNDARY_FIELDS)
    || boundary.reboot_policy !== 'forbidden'
    || boundary.install_requested !== false
    || boundary.release_requested !== false
    || boundary.acceptance_requested !== false
    || boundary.runtime_mutation_requested !== false
    || boundary.reboot_requested !== false) blockers.add(H.EFFECT_BOUNDARY_FORBIDDEN);

  const identity = requiredRecord(input, 'identity', IDENTITY_FIELDS, H.IDENTITY_REQUIRED, blockers);
  if (identity !== null && !validIdentity(identity, input.target_kind)) blockers.add(H.IDENTITY_REQUIRED);

  const installedPack = requiredRecord(
    input, 'installed_pack', INSTALLED_PACK_FIELDS, H.INSTALLED_PACK_REQUIRED, blockers,
  );
  const preflight = requiredRecord(input, 'preflight', PREFLIGHT_FIELDS, H.PREFLIGHT_REQUIRED, blockers);
  const serviceHealth = requiredRecord(
    input, 'service_health', SERVICE_HEALTH_FIELDS, H.SERVICE_HEALTH_REQUIRED, blockers,
  );
  const pathBinding = requiredRecord(
    input, 'path_registry_binding', PATH_BINDING_FIELDS, H.PATH_REGISTRY_BINDING_REQUIRED, blockers,
  );
  const backupRestore = requiredRecord(
    input, 'backup_restore', BACKUP_RESTORE_FIELDS, H.BACKUP_RESTORE_REQUIRED, blockers,
  );
  const rollback = requiredRecord(input, 'rollback', ROLLBACK_FIELDS, H.ROLLBACK_REQUIRED, blockers);
  const projectCapability = requiredRecord(
    input, 'project_capability', PROJECT_CAPABILITY_FIELDS, H.PROJECT_CAPABILITY_REQUIRED, blockers,
  );

  if (validClock(clock)) {
    for (const record of [
      installedPack, preflight, serviceHealth, pathBinding, backupRestore, rollback, projectCapability,
    ]) if (record !== null && !freshAt(record, clock)) blockers.add(H.STALE_EVIDENCE);
  }

  if (validClock(clock) && installedPack !== null && !validReceipt(
    installedPack, INSTALLED_PACK_FIELDS,
    ['target_identity_ref', 'pack_ref'],
    ['expected_pack_digest', 'installed_pack_digest', 'readback_digest'], clock,
  ) || installedPack?.state !== 'installed_readback_verified') {
    blockers.add(H.INSTALLED_PACK_REQUIRED);
  }
  if (validClock(clock) && preflight !== null && !validReceipt(
    preflight, PREFLIGHT_FIELDS,
    ['target_identity_ref', 'project_scope_ref', 'pack_ref'], ['pack_digest'], clock,
  ) || preflight?.module_preflight_state !== 'passed'
    || preflight?.product_preflight_state !== 'passed'
    || preflight?.source_relocation_performed !== false) blockers.add(H.PREFLIGHT_REQUIRED);
  if (validClock(clock) && serviceHealth !== null && !validReceipt(
    serviceHealth, SERVICE_HEALTH_FIELDS,
    ['target_identity_ref', 'service_ref'],
    ['service_digest', 'source_digest', 'readback_source_digest'], clock,
  ) || serviceHealth?.health_state !== 'healthy' || serviceHealth?.reboot_requested !== false) {
    blockers.add(H.SERVICE_HEALTH_REQUIRED);
  }
  if (validClock(clock) && pathBinding !== null && !validReceipt(
    pathBinding, PATH_BINDING_FIELDS,
    ['target_identity_ref', 'project_scope_ref', 'root_alias', 'current_binding_ref'],
    ['root_digest', 'current_binding_digest'], clock,
  ) || pathBinding?.state !== 'current' || !validEpoch(pathBinding?.binding_epoch)) {
    blockers.add(H.PATH_REGISTRY_BINDING_REQUIRED);
  }
  if (validClock(clock) && backupRestore !== null && !validReceipt(
    backupRestore, BACKUP_RESTORE_FIELDS,
    ['target_identity_ref', 'project_scope_ref', 'current_binding_ref'],
    ['current_binding_digest', 'source_digest', 'backup_digest', 'restore_readback_digest'], clock,
  ) || backupRestore?.exact_backup_readback !== true
    || backupRestore?.exact_restore_readback !== true || backupRestore?.state !== 'verified') {
    blockers.add(H.BACKUP_RESTORE_REQUIRED);
  }
  if (validClock(clock) && rollback !== null && !validReceipt(
    rollback, ROLLBACK_FIELDS,
    ['target_identity_ref', 'project_scope_ref', 'current_binding_ref', 'rollback_binding_ref'],
    ['current_binding_digest', 'rollback_binding_digest'], clock,
  ) || rollback?.state !== 'verified_ready' || rollback?.reboot_requested !== false) {
    blockers.add(H.ROLLBACK_REQUIRED);
  }
  if (validClock(clock) && projectCapability !== null && !validReceipt(
    projectCapability, PROJECT_CAPABILITY_FIELDS,
    ['target_identity_ref', 'project_scope_ref'], [], clock,
  ) || !sortedSafeRefList(projectCapability?.capability_refs)
    || projectCapability?.state !== 'scoped_verified') blockers.add(H.PROJECT_CAPABILITY_REQUIRED);

  if (validClock(clock) && identity !== null && validIdentity(identity, input.target_kind)) {
    const identityRef = identity.identity_ref;
    const projectScope = identity.project_scope_ref;
    if (identity.identity_epoch !== clock.current_epoch
      || pathBinding?.binding_epoch !== clock.current_epoch) blockers.add(H.STALE_EVIDENCE);
    const targetMismatch = [installedPack, preflight, serviceHealth, pathBinding, backupRestore, rollback, projectCapability]
      .some((record) => record !== null && !sameTarget(record, identity, input.target_kind));
    if (targetMismatch) blockers.add(H.IDENTITY_MISMATCH);
    const scopeMismatch = [preflight, pathBinding, backupRestore, rollback, projectCapability]
      .some((record) => record !== null && record.project_scope_ref !== projectScope);
    if (scopeMismatch) blockers.add(H.PROJECT_SCOPE_MISMATCH);
    if (installedPack !== null && (installedPack.expected_pack_digest !== installedPack.installed_pack_digest
      || installedPack.readback_digest !== installedPack.expected_pack_digest)) {
      blockers.add(H.PACK_DIGEST_MISMATCH);
    }
    if (preflight !== null && installedPack !== null && (preflight.pack_ref !== installedPack.pack_ref
      || preflight.pack_digest !== installedPack.expected_pack_digest)) blockers.add(H.PACK_DIGEST_MISMATCH);
    if (serviceHealth !== null && serviceHealth.source_digest !== serviceHealth.readback_source_digest) {
      blockers.add(H.SERVICE_SOURCE_DIGEST_MISMATCH);
    }
    if (backupRestore !== null && serviceHealth !== null && (backupRestore.source_digest !== serviceHealth.source_digest
      || backupRestore.backup_digest !== serviceHealth.source_digest
      || backupRestore.restore_readback_digest !== serviceHealth.source_digest)) {
      blockers.add(H.SERVICE_SOURCE_DIGEST_MISMATCH);
    }
    if (pathBinding !== null && rollback !== null && (rollback.current_binding_ref !== pathBinding.current_binding_ref
      || rollback.current_binding_digest !== pathBinding.current_binding_digest
      || rollback.rollback_binding_ref === pathBinding.current_binding_ref
      || rollback.rollback_binding_digest === pathBinding.current_binding_digest)) {
      blockers.add(H.ROLLBACK_REQUIRED);
    }
    if (pathBinding !== null && backupRestore !== null && (backupRestore.current_binding_ref !== pathBinding.current_binding_ref
      || backupRestore.current_binding_digest !== pathBinding.current_binding_digest)) {
      blockers.add(H.PATH_REGISTRY_BINDING_REQUIRED);
    }
    if (!isDenseArray(input.active_roots) || input.active_roots.length !== 1
      || !exactRecord(input.active_roots?.[0], ACTIVE_ROOT_FIELDS)
      || !safeRef(input.active_roots[0].root_alias)
      || !safeRef(input.active_roots[0].current_binding_ref)
      || !safeDigest(input.active_roots[0].current_binding_digest)
      || input.active_roots[0].target_identity_ref !== identityRef
      || input.active_roots[0].state !== 'active'
      || pathBinding === null
      || input.active_roots[0].root_alias !== pathBinding.root_alias
      || input.active_roots[0].current_binding_ref !== pathBinding.current_binding_ref
      || input.active_roots[0].current_binding_digest !== pathBinding.current_binding_digest) {
      blockers.add(H.SINGLE_ACTIVE_ROOT_REQUIRED);
    }
  } else if (!isDenseArray(input.active_roots) || input.active_roots.length !== 1) {
    blockers.add(H.SINGLE_ACTIVE_ROOT_REQUIRED);
  }

  if (blockers.size > 0) return holdResult(blockers, clock);
  return deepFreeze({
    schema_version: DEPLOYMENT_READINESS_RESULT_SCHEMA,
    status: DEPLOYMENT_READINESS_STATUS.READY_FOR_ISOLATED_CANARY,
    effect: 'check_only',
    evaluated_at: clock.now_utc,
    evaluation_epoch: clock.current_epoch,
    authority: {
      install: 0,
      release: 0,
      acceptance: 0,
      runtime_operation: 0,
    },
    blockers: [],
    readiness: {
      target_kind: input.target_kind,
      target_ref: targetRef(identity),
      project_scope_ref: identity.project_scope_ref,
      pack_ref: installedPack.pack_ref,
      root_alias: pathBinding.root_alias,
      current_binding_ref: pathBinding.current_binding_ref,
      rollback_binding_ref: rollback.rollback_binding_ref,
      capability_refs: [...projectCapability.capability_refs],
      claim_ceiling: 'isolated_canary_candidate',
    },
  });
}
