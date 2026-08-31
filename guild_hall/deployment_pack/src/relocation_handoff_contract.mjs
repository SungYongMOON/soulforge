/**
 * R7 relocation handoff evaluator.
 *
 * It evaluates injected receipts only. This module never copies, moves,
 * deletes, stops, starts, switches a pointer, or reboots a machine.
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
} from '../../agent_observation/guard_primitives.mjs';

export const RELOCATION_HANDOFF_INPUT_SCHEMA =
  'soulforge.deployment_pack.relocation_handoff_input.v0';
export const RELOCATION_HANDOFF_RESULT_SCHEMA =
  'soulforge.deployment_pack.relocation_handoff_result.v0';

export const RELOCATION_HANDOFF_STATUS = Object.freeze({
  HOLD: 'HOLD',
  VERIFIED_R7_HANDOFF: 'VERIFIED_R7_HANDOFF',
});

export const RELOCATION_HANDOFF_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'RELOCATION_HANDOFF_RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'RELOCATION_HANDOFF_SECRET_VALUE_FORBIDDEN',
  ABSOLUTE_PATH_FORBIDDEN: 'RELOCATION_HANDOFF_ABSOLUTE_PATH_FORBIDDEN',
  INPUT_TOO_DEEP: 'RELOCATION_HANDOFF_INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'RELOCATION_HANDOFF_INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'RELOCATION_HANDOFF_HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'RELOCATION_HANDOFF_ACCESSOR_PROPERTY_FORBIDDEN',
  INPUT_SHAPE_INVALID: 'RELOCATION_HANDOFF_INPUT_SHAPE_INVALID',
  NO_MOVE_DELETE_REBOOT_REQUIRED: 'RELOCATION_HANDOFF_NO_MOVE_DELETE_REBOOT_REQUIRED',
  STALE_EPOCH: 'RELOCATION_HANDOFF_STALE_EPOCH',
  OLD_BINDING_REQUIRED: 'RELOCATION_HANDOFF_OLD_BINDING_REQUIRED',
  NEW_BINDING_REQUIRED: 'RELOCATION_HANDOFF_NEW_BINDING_REQUIRED',
  EXACT_BINDING_REQUIRED: 'RELOCATION_HANDOFF_EXACT_BINDING_REQUIRED',
  BINDING_DIGEST_MISMATCH: 'RELOCATION_HANDOFF_BINDING_DIGEST_MISMATCH',
  VERIFIED_BACKUP_REQUIRED: 'RELOCATION_HANDOFF_VERIFIED_BACKUP_REQUIRED',
  CANDIDATE_COPY_READBACK_REQUIRED: 'RELOCATION_HANDOFF_CANDIDATE_COPY_READBACK_REQUIRED',
  OFFLINE_DOCTOR_REQUIRED: 'RELOCATION_HANDOFF_OFFLINE_DOCTOR_REQUIRED',
  OLD_STOP_REQUIRED: 'RELOCATION_HANDOFF_OLD_STOP_REQUIRED',
  POINTER_SWITCH_REQUIRED: 'RELOCATION_HANDOFF_POINTER_SWITCH_REQUIRED',
  NEW_START_HEALTH_REQUIRED: 'RELOCATION_HANDOFF_NEW_START_HEALTH_REQUIRED',
  ROLLBACK_REQUIRED: 'RELOCATION_HANDOFF_ROLLBACK_REQUIRED',
  DIGEST_DRIFT: 'RELOCATION_HANDOFF_DIGEST_DRIFT',
  SEQUENCE_INVALID: 'RELOCATION_HANDOFF_SEQUENCE_INVALID',
  SINGLE_ACTIVE_ROOT_REQUIRED: 'RELOCATION_HANDOFF_SINGLE_ACTIVE_ROOT_REQUIRED',
  EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN:
    'RELOCATION_HANDOFF_EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN',
});

const H = RELOCATION_HANDOFF_HOLD_CODES;
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
const INPUT_FIELDS = Object.freeze([
  'schema_version', 'handoff_ref', 'operation_mode', 'handoff_epoch', 'current_epoch',
  'effect_boundary', 'external_runtime_owners', 'old_binding', 'new_binding',
  'verified_backup', 'candidate_copy_readback', 'offline_doctor', 'old_stop',
  'binding_pointer_switch', 'new_start_health', 'rollback', 'active_roots',
]);
const EFFECT_BOUNDARY_FIELDS = Object.freeze([
  'reboot_policy', 'move_requested', 'delete_requested', 'reboot_requested',
]);
const EXTERNAL_RUNTIME_OWNER_FIELDS = Object.freeze([
  'runtime_ref', 'owner_ref', 'managed_by_main_node',
]);
const BINDING_FIELDS = Object.freeze([
  'binding_ref', 'binding_digest', 'root_alias', 'root_digest', 'pack_ref',
  'pack_digest', 'service_ref', 'service_digest', 'binding_epoch',
]);
const BACKUP_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'stage', 'handoff_epoch', 'source_binding_ref',
  'source_binding_digest', 'source_root_alias', 'source_root_digest',
  'backup_content_digest', 'state', 'reboot_requested',
]);
const COPY_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'stage', 'handoff_epoch', 'source_backup_receipt_ref',
  'source_backup_receipt_digest', 'source_binding_ref', 'source_binding_digest',
  'candidate_binding_ref', 'candidate_binding_digest', 'source_root_digest',
  'candidate_root_digest', 'backup_content_digest', 'candidate_content_digest',
  'exact_readback', 'state', 'reboot_requested',
]);
const DOCTOR_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'stage', 'handoff_epoch', 'doctor_input_ref',
  'doctor_input_digest', 'candidate_binding_ref', 'candidate_binding_digest',
  'candidate_root_alias', 'candidate_root_digest', 'candidate_content_digest',
  'state', 'reboot_requested',
]);
const OLD_STOP_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'stage', 'handoff_epoch', 'binding_ref',
  'binding_digest', 'root_alias', 'root_digest', 'state', 'reboot_requested',
]);
const POINTER_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'stage', 'handoff_epoch', 'pointer_ref',
  'pointer_digest', 'old_binding_ref', 'old_binding_digest', 'new_binding_ref',
  'new_binding_digest', 'state', 'reboot_requested',
]);
const NEW_START_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'stage', 'handoff_epoch', 'binding_ref',
  'binding_digest', 'root_alias', 'root_digest', 'startup_state', 'health_state',
  'reboot_requested',
]);
const ROLLBACK_FIELDS = Object.freeze([
  'receipt_ref', 'receipt_digest', 'stage', 'handoff_epoch', 'from_binding_ref',
  'from_binding_digest', 'to_binding_ref', 'to_binding_digest', 'state',
  'reboot_requested',
]);
const ACTIVE_ROOT_FIELDS = Object.freeze([
  'root_alias', 'binding_ref', 'binding_digest', 'state',
]);
const ALL_ALLOWED_KEYS = Object.freeze([
  ...INPUT_FIELDS, ...EFFECT_BOUNDARY_FIELDS, ...EXTERNAL_RUNTIME_OWNER_FIELDS,
  ...BINDING_FIELDS, ...BACKUP_FIELDS, ...COPY_FIELDS, ...DOCTOR_FIELDS,
  ...OLD_STOP_FIELDS, ...POINTER_FIELDS, ...NEW_START_FIELDS, ...ROLLBACK_FIELDS,
  ...ACTIVE_ROOT_FIELDS,
]);
const EXPECTED_EXTERNAL_RUNTIMES = Object.freeze([
  'external-runtime:buzz',
  'external-runtime:hermes',
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

function digestMatches(record, digestField) {
  if (!safeDigest(record[digestField])) return false;
  const body = { ...record };
  delete body[digestField];
  return record[digestField] === digestOf(body);
}

function allRefs(record, fields) {
  return fields.every((field) => safeRef(record[field]));
}

function allDigests(record, fields) {
  return fields.every((field) => safeDigest(record[field]));
}

function validBinding(binding) {
  return exactRecord(binding, BINDING_FIELDS)
    && allRefs(binding, ['binding_ref', 'root_alias', 'pack_ref', 'service_ref'])
    && allDigests(binding, ['binding_digest', 'root_digest', 'pack_digest', 'service_digest'])
    && validEpoch(binding.binding_epoch);
}

function validExternalRuntimeOwners(value, serviceRefs) {
  if (!isDenseArray(value) || value.length !== EXPECTED_EXTERNAL_RUNTIMES.length) return false;
  const owners = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!exactRecord(entry, EXTERNAL_RUNTIME_OWNER_FIELDS)
      || entry.runtime_ref !== EXPECTED_EXTERNAL_RUNTIMES[index]
      || !safeRef(entry.owner_ref)
      || !entry.owner_ref.startsWith('owner:external-')
      || entry.managed_by_main_node !== false) return false;
    owners.push(entry.owner_ref);
  }
  return new Set(owners).size === owners.length
    && owners.every((ownerRef) => !serviceRefs.includes(ownerRef));
}

function validReceipt(record, fields, state, stage, refFields, digestFields) {
  return exactRecord(record, fields)
    && allRefs(record, ['receipt_ref', ...refFields])
    && allDigests(record, ['receipt_digest', ...digestFields])
    && digestMatches(record, 'receipt_digest')
    && record.stage === stage
    && validEpoch(record.handoff_epoch)
    && record.state === state
    && record.reboot_requested === false;
}

function holdResult(blockers) {
  return deepFreeze({
    schema_version: RELOCATION_HANDOFF_RESULT_SCHEMA,
    status: RELOCATION_HANDOFF_STATUS.HOLD,
    effect: 'check_only',
    blockers: [...new Set(blockers)].sort(),
    handoff: null,
  });
}

function requiredRecord(input, field, fields, missingCode, blockers) {
  const value = input[field];
  if (value === undefined || value === null) {
    blockers.add(missingCode);
    return null;
  }
  if (!exactRecord(value, fields)) {
    blockers.add(missingCode);
    return null;
  }
  return value;
}

/**
 * Evaluates the full R7 receipt chain. A pass is a check-only assertion about
 * supplied evidence; any real operation remains outside this module.
 */
export function evaluateRelocationHandoff(rawInput) {
  const entry = guardEntry(rawInput, INPUT_FIELDS, ENTRY_CODES);
  if (entry.status === RELOCATION_HANDOFF_STATUS.HOLD) return holdResult([entry.hold_code]);
  const input = entry.value;
  const unknown = findUnknownKeyDeep(input, new Set(ALL_ALLOWED_KEYS));
  if (unknown === TOO_DEEP) return holdResult([H.INPUT_TOO_DEEP]);
  if (unknown !== null) return holdResult([H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);
  if (!knownRecord(input, INPUT_FIELDS)
    || input.schema_version !== RELOCATION_HANDOFF_INPUT_SCHEMA
    || !safeRef(input.handoff_ref)
    || input.operation_mode !== 'contract_evaluation_only') {
    return holdResult([H.INPUT_SHAPE_INVALID]);
  }

  const blockers = new Set();
  if (!validEpoch(input.handoff_epoch) || !validEpoch(input.current_epoch)
    || input.current_epoch !== input.handoff_epoch) blockers.add(H.STALE_EPOCH);

  const boundary = input.effect_boundary;
  if (!exactRecord(boundary, EFFECT_BOUNDARY_FIELDS)
    || boundary.reboot_policy !== 'forbidden'
    || boundary.move_requested !== false
    || boundary.delete_requested !== false
    || boundary.reboot_requested !== false) blockers.add(H.NO_MOVE_DELETE_REBOOT_REQUIRED);

  const oldBinding = requiredRecord(input, 'old_binding', BINDING_FIELDS, H.OLD_BINDING_REQUIRED, blockers);
  const newBinding = requiredRecord(input, 'new_binding', BINDING_FIELDS, H.NEW_BINDING_REQUIRED, blockers);
  if (oldBinding !== null && !validBinding(oldBinding)) blockers.add(H.OLD_BINDING_REQUIRED);
  if (newBinding !== null && !validBinding(newBinding)) blockers.add(H.NEW_BINDING_REQUIRED);
  if (oldBinding !== null && !digestMatches(oldBinding, 'binding_digest')) blockers.add(H.BINDING_DIGEST_MISMATCH);
  if (newBinding !== null && !digestMatches(newBinding, 'binding_digest')) blockers.add(H.BINDING_DIGEST_MISMATCH);
  if (oldBinding !== null && newBinding !== null) {
    if (oldBinding.binding_ref === newBinding.binding_ref
      || oldBinding.root_alias === newBinding.root_alias
      || oldBinding.root_digest === newBinding.root_digest
      || oldBinding.binding_epoch !== input.handoff_epoch - 1
      || newBinding.binding_epoch !== input.handoff_epoch) blockers.add(H.EXACT_BINDING_REQUIRED);
  }

  const serviceRefs = oldBinding !== null && newBinding !== null
    ? [oldBinding.service_ref, newBinding.service_ref] : [];
  if (!validExternalRuntimeOwners(input.external_runtime_owners, serviceRefs)) {
    blockers.add(H.EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN);
  }

  const backup = requiredRecord(input, 'verified_backup', BACKUP_FIELDS, H.VERIFIED_BACKUP_REQUIRED, blockers);
  const copy = requiredRecord(
    input, 'candidate_copy_readback', COPY_FIELDS, H.CANDIDATE_COPY_READBACK_REQUIRED, blockers,
  );
  const doctor = requiredRecord(input, 'offline_doctor', DOCTOR_FIELDS, H.OFFLINE_DOCTOR_REQUIRED, blockers);
  const oldStop = requiredRecord(input, 'old_stop', OLD_STOP_FIELDS, H.OLD_STOP_REQUIRED, blockers);
  const pointer = requiredRecord(
    input, 'binding_pointer_switch', POINTER_FIELDS, H.POINTER_SWITCH_REQUIRED, blockers,
  );
  const newStart = requiredRecord(
    input, 'new_start_health', NEW_START_FIELDS, H.NEW_START_HEALTH_REQUIRED, blockers,
  );
  const rollback = requiredRecord(input, 'rollback', ROLLBACK_FIELDS, H.ROLLBACK_REQUIRED, blockers);

  if (backup !== null && !validReceipt(
    backup, BACKUP_FIELDS, 'verified_backup', 1,
    ['source_binding_ref', 'source_root_alias'],
    ['source_binding_digest', 'source_root_digest', 'backup_content_digest'],
  )) blockers.add(H.VERIFIED_BACKUP_REQUIRED);
  if (copy !== null && !validReceipt(
    copy, COPY_FIELDS, 'candidate_copy_readback_verified', 2,
    ['source_backup_receipt_ref', 'source_binding_ref', 'candidate_binding_ref'],
    ['source_backup_receipt_digest', 'source_binding_digest', 'candidate_binding_digest',
      'source_root_digest', 'candidate_root_digest', 'backup_content_digest',
      'candidate_content_digest'],
  ) || copy?.exact_readback !== true) blockers.add(H.CANDIDATE_COPY_READBACK_REQUIRED);
  if (doctor !== null && !validReceipt(
    doctor, DOCTOR_FIELDS, 'offline_doctor_healthy', 3,
    ['doctor_input_ref', 'candidate_binding_ref', 'candidate_root_alias'],
    ['doctor_input_digest', 'candidate_binding_digest', 'candidate_root_digest',
      'candidate_content_digest'],
  )) blockers.add(H.OFFLINE_DOCTOR_REQUIRED);
  if (oldStop !== null && !validReceipt(
    oldStop, OLD_STOP_FIELDS, 'stopped', 4,
    ['binding_ref', 'root_alias'], ['binding_digest', 'root_digest'],
  )) blockers.add(H.OLD_STOP_REQUIRED);
  if (pointer !== null && !validReceipt(
    pointer, POINTER_FIELDS, 'switched', 5,
    ['pointer_ref', 'old_binding_ref', 'new_binding_ref'],
    ['pointer_digest', 'old_binding_digest', 'new_binding_digest'],
  )) blockers.add(H.POINTER_SWITCH_REQUIRED);
  if (newStart !== null && (!exactRecord(newStart, NEW_START_FIELDS)
    || !allRefs(newStart, ['receipt_ref', 'binding_ref', 'root_alias'])
    || !allDigests(newStart, ['receipt_digest', 'binding_digest', 'root_digest'])
    || !digestMatches(newStart, 'receipt_digest')
    || newStart.stage !== 6 || !validEpoch(newStart.handoff_epoch)
    || newStart.startup_state !== 'started' || newStart.health_state !== 'healthy'
    || newStart.reboot_requested !== false)) blockers.add(H.NEW_START_HEALTH_REQUIRED);
  if (rollback !== null && !validReceipt(
    rollback, ROLLBACK_FIELDS, 'verified_ready', 7,
    ['from_binding_ref', 'to_binding_ref'], ['from_binding_digest', 'to_binding_digest'],
  )) blockers.add(H.ROLLBACK_REQUIRED);

  const phaseRecords = [backup, copy, doctor, oldStop, pointer, newStart, rollback];
  if (phaseRecords.some((record) => record !== null && record.handoff_epoch !== input.handoff_epoch)) {
    blockers.add(H.STALE_EPOCH);
  }
  if (oldBinding !== null && newBinding !== null && backup !== null && copy !== null
    && doctor !== null && oldStop !== null && pointer !== null && newStart !== null && rollback !== null) {
    if (backup.source_binding_ref !== oldBinding.binding_ref
      || backup.source_binding_digest !== oldBinding.binding_digest
      || backup.source_root_alias !== oldBinding.root_alias
      || backup.source_root_digest !== oldBinding.root_digest
      || copy.source_backup_receipt_ref !== backup.receipt_ref
      || copy.source_backup_receipt_digest !== backup.receipt_digest
      || copy.source_binding_ref !== oldBinding.binding_ref
      || copy.source_binding_digest !== oldBinding.binding_digest
      || copy.candidate_binding_ref !== newBinding.binding_ref
      || copy.candidate_binding_digest !== newBinding.binding_digest
      || copy.source_root_digest !== oldBinding.root_digest
      || copy.candidate_root_digest !== newBinding.root_digest
      || doctor.candidate_binding_ref !== newBinding.binding_ref
      || doctor.candidate_binding_digest !== newBinding.binding_digest
      || doctor.candidate_root_alias !== newBinding.root_alias
      || doctor.candidate_root_digest !== newBinding.root_digest
      || oldStop.binding_ref !== oldBinding.binding_ref
      || oldStop.binding_digest !== oldBinding.binding_digest
      || oldStop.root_alias !== oldBinding.root_alias
      || oldStop.root_digest !== oldBinding.root_digest
      || pointer.old_binding_ref !== oldBinding.binding_ref
      || pointer.old_binding_digest !== oldBinding.binding_digest
      || pointer.new_binding_ref !== newBinding.binding_ref
      || pointer.new_binding_digest !== newBinding.binding_digest
      || newStart.binding_ref !== newBinding.binding_ref
      || newStart.binding_digest !== newBinding.binding_digest
      || newStart.root_alias !== newBinding.root_alias
      || newStart.root_digest !== newBinding.root_digest
      || rollback.from_binding_ref !== newBinding.binding_ref
      || rollback.from_binding_digest !== newBinding.binding_digest
      || rollback.to_binding_ref !== oldBinding.binding_ref
      || rollback.to_binding_digest !== oldBinding.binding_digest) blockers.add(H.EXACT_BINDING_REQUIRED);
    if (copy.backup_content_digest !== backup.backup_content_digest
      || copy.candidate_content_digest !== backup.backup_content_digest
      || doctor.candidate_content_digest !== backup.backup_content_digest) {
      blockers.add(H.DIGEST_DRIFT);
    }
  }

  if (!isDenseArray(input.active_roots) || input.active_roots.length !== 1
    || !exactRecord(input.active_roots?.[0], ACTIVE_ROOT_FIELDS)
    || input.active_roots[0].state !== 'active'
    || !safeRef(input.active_roots[0].root_alias)
    || !safeRef(input.active_roots[0].binding_ref)
    || !safeDigest(input.active_roots[0].binding_digest)
    || newBinding === null
    || input.active_roots[0].root_alias !== newBinding.root_alias
    || input.active_roots[0].binding_ref !== newBinding.binding_ref
    || input.active_roots[0].binding_digest !== newBinding.binding_digest) {
    blockers.add(H.SINGLE_ACTIVE_ROOT_REQUIRED);
  }

  if (blockers.size > 0) return holdResult(blockers);
  return deepFreeze({
    schema_version: RELOCATION_HANDOFF_RESULT_SCHEMA,
    status: RELOCATION_HANDOFF_STATUS.VERIFIED_R7_HANDOFF,
    effect: 'check_only',
    blockers: [],
    handoff: {
      handoff_ref: input.handoff_ref,
      handoff_epoch: input.handoff_epoch,
      old_binding_ref: oldBinding.binding_ref,
      new_binding_ref: newBinding.binding_ref,
      active_root_alias: newBinding.root_alias,
      rollback_receipt_ref: rollback.receipt_ref,
      reboot_policy: 'forbidden',
    },
  });
}
