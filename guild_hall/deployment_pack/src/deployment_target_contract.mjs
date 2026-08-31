/**
 * Pure Main Node deployment-target contract.
 *
 * The contract verifies an injected profile, exact binding tuple, and an
 * injected Doctor input. It never reads a host profile, starts a service,
 * changes a root alias, or requests a reboot.
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

export const MAIN_NODE_PROFILE_SCHEMA =
  'soulforge.deployment_pack.main_node_profile.v0';
export const DEPLOYMENT_TARGET_INPUT_SCHEMA =
  'soulforge.deployment_pack.deployment_target_input.v0';
export const DEPLOYMENT_TARGET_RESULT_SCHEMA =
  'soulforge.deployment_pack.deployment_target_result.v0';

export const DEPLOYMENT_TARGET_STATUS = Object.freeze({
  HOLD: 'HOLD',
  VERIFIED_MAIN_NODE_TARGET: 'VERIFIED_MAIN_NODE_TARGET',
});

export const DEPLOYMENT_TARGET_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'DEPLOYMENT_TARGET_RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'DEPLOYMENT_TARGET_SECRET_VALUE_FORBIDDEN',
  ABSOLUTE_PATH_FORBIDDEN: 'DEPLOYMENT_TARGET_ABSOLUTE_PATH_FORBIDDEN',
  INPUT_TOO_DEEP: 'DEPLOYMENT_TARGET_INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'DEPLOYMENT_TARGET_INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'DEPLOYMENT_TARGET_HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'DEPLOYMENT_TARGET_ACCESSOR_PROPERTY_FORBIDDEN',
  INPUT_SHAPE_INVALID: 'DEPLOYMENT_TARGET_INPUT_SHAPE_INVALID',
  PROFILE_INVALID: 'DEPLOYMENT_TARGET_PROFILE_INVALID',
  PROFILE_DIGEST_MISMATCH: 'DEPLOYMENT_TARGET_PROFILE_DIGEST_MISMATCH',
  BINDING_INVALID: 'DEPLOYMENT_TARGET_BINDING_INVALID',
  EXACT_BINDING_MISMATCH: 'DEPLOYMENT_TARGET_EXACT_BINDING_MISMATCH',
  DOCTOR_INPUT_REQUIRED: 'DEPLOYMENT_TARGET_DOCTOR_INPUT_REQUIRED',
  DOCTOR_INPUT_DIGEST_MISMATCH: 'DEPLOYMENT_TARGET_DOCTOR_INPUT_DIGEST_MISMATCH',
  DOCTOR_INPUT_MISMATCH: 'DEPLOYMENT_TARGET_DOCTOR_INPUT_MISMATCH',
  REBOOT_FORBIDDEN: 'DEPLOYMENT_TARGET_REBOOT_FORBIDDEN',
  EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN:
    'DEPLOYMENT_TARGET_EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN',
});

const H = DEPLOYMENT_TARGET_HOLD_CODES;
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
const PROFILE_FIELDS = Object.freeze([
  'schema_version', 'profile_id', 'profile_ref', 'node_role', 'pack_ref',
  'service_ref', 'root_alias', 'cells', 'startup_order', 'reboot_policy',
  'external_runtime_owners',
]);
const CELL_FIELDS = Object.freeze(['cell_ref', 'service_ref']);
const EXTERNAL_RUNTIME_OWNER_FIELDS = Object.freeze([
  'runtime_ref', 'owner_ref', 'managed_by_main_node',
]);
const INPUT_FIELDS = Object.freeze([
  'schema_version', 'evaluation_ref', 'profile', 'profile_digest', 'node_ref',
  'binding', 'doctor_input',
]);
const BINDING_FIELDS = Object.freeze([
  'pack_ref', 'pack_digest', 'service_ref', 'service_digest', 'root_alias',
  'root_digest', 'binding_epoch', 'reboot_requested',
]);
const DOCTOR_INPUT_FIELDS = Object.freeze([
  'doctor_input_ref', 'doctor_input_digest', 'doctor_ref', 'evidence_mode',
  'profile_ref', 'profile_digest', 'node_ref', 'pack_ref', 'pack_digest',
  'service_ref', 'service_digest', 'root_alias', 'root_digest', 'binding_epoch',
  'cell_refs', 'startup_order', 'reboot_policy', 'reboot_requested',
  'external_runtime_owners',
]);
const PROFILE_ALLOWED_KEYS = Object.freeze([
  ...PROFILE_FIELDS, ...CELL_FIELDS, ...EXTERNAL_RUNTIME_OWNER_FIELDS,
]);
const INPUT_ALLOWED_KEYS = Object.freeze([
  ...INPUT_FIELDS, ...PROFILE_FIELDS, ...CELL_FIELDS,
  ...EXTERNAL_RUNTIME_OWNER_FIELDS, ...BINDING_FIELDS, ...DOCTOR_INPUT_FIELDS,
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

function exactStringList(value, expected) {
  return isDenseArray(value) && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function sameRuntimeOwners(value, expected) {
  if (!isDenseArray(value) || value.length !== expected.length) return false;
  return value.every((entry, index) => exactRecord(entry, EXTERNAL_RUNTIME_OWNER_FIELDS)
    && EXTERNAL_RUNTIME_OWNER_FIELDS.every((field) => entry[field] === expected[index][field]));
}

function profileProblems(rawProfile) {
  const entry = guardEntry(rawProfile, PROFILE_FIELDS, ENTRY_CODES);
  if (entry.status === DEPLOYMENT_TARGET_STATUS.HOLD) return [entry.hold_code];
  const profile = entry.value;
  const unknown = findUnknownKeyDeep(profile, new Set(PROFILE_ALLOWED_KEYS));
  if (unknown === TOO_DEEP) return [H.INPUT_TOO_DEEP];
  if (unknown !== null) return [H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN];
  if (!exactRecord(profile, PROFILE_FIELDS)
    || profile.schema_version !== MAIN_NODE_PROFILE_SCHEMA
    || profile.profile_id !== 'main_node'
    || profile.node_role !== 'main_node'
    || profile.reboot_policy !== 'forbidden'
    || !safeRef(profile.profile_ref)
    || !safeRef(profile.pack_ref)
    || !safeRef(profile.service_ref)
    || !safeRef(profile.root_alias)) return [H.PROFILE_INVALID];

  if (!isDenseArray(profile.cells) || profile.cells.length !== 7
    || profile.cells.some((cell) => !exactRecord(cell, CELL_FIELDS)
      || !safeRef(cell.cell_ref) || !safeRef(cell.service_ref))) return [H.PROFILE_INVALID];
  const cellRefs = profile.cells.map((cell) => cell.cell_ref);
  const cellServices = profile.cells.map((cell) => cell.service_ref);
  if (new Set(cellRefs).size !== cellRefs.length
    || new Set(cellServices).size !== cellServices.length
    || !exactStringList(profile.startup_order, cellRefs)) return [H.PROFILE_INVALID];

  if (!isDenseArray(profile.external_runtime_owners)
    || profile.external_runtime_owners.length !== EXPECTED_EXTERNAL_RUNTIMES.length
    || profile.external_runtime_owners.some((entry, index) => !exactRecord(entry, EXTERNAL_RUNTIME_OWNER_FIELDS)
      || entry.runtime_ref !== EXPECTED_EXTERNAL_RUNTIMES[index]
      || !safeRef(entry.owner_ref)
      || !entry.owner_ref.startsWith('owner:external-')
      || entry.managed_by_main_node !== false)) return [H.PROFILE_INVALID];
  const externalOwners = profile.external_runtime_owners.map((entry) => entry.owner_ref);
  if (new Set(externalOwners).size !== externalOwners.length
    || externalOwners.includes(profile.service_ref)
    || cellServices.some((serviceRef) => externalOwners.includes(serviceRef))) {
    return [H.EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN];
  }
  return [];
}

export function validateMainNodeProfile(rawProfile) {
  const problems = profileProblems(rawProfile);
  return deepFreeze({ ok: problems.length === 0, problems: [...problems].sort() });
}

function holdResult(blockers) {
  return deepFreeze({
    schema_version: DEPLOYMENT_TARGET_RESULT_SCHEMA,
    status: DEPLOYMENT_TARGET_STATUS.HOLD,
    effect: 'check_only',
    blockers: [...new Set(blockers)].sort(),
    target: null,
  });
}

function bindingIsValid(binding) {
  return exactRecord(binding, BINDING_FIELDS)
    && safeRef(binding.pack_ref)
    && safeDigest(binding.pack_digest)
    && safeRef(binding.service_ref)
    && safeDigest(binding.service_digest)
    && safeRef(binding.root_alias)
    && safeDigest(binding.root_digest)
    && validEpoch(binding.binding_epoch)
    && typeof binding.reboot_requested === 'boolean';
}

function doctorIsValid(doctor) {
  if (!exactRecord(doctor, DOCTOR_INPUT_FIELDS)
    || !safeRef(doctor.doctor_input_ref)
    || !safeDigest(doctor.doctor_input_digest)
    || !safeRef(doctor.doctor_ref)
    || doctor.evidence_mode !== 'injected_exact_evidence'
    || !safeRef(doctor.profile_ref)
    || !safeDigest(doctor.profile_digest)
    || !safeRef(doctor.node_ref)
    || !safeRef(doctor.pack_ref)
    || !safeDigest(doctor.pack_digest)
    || !safeRef(doctor.service_ref)
    || !safeDigest(doctor.service_digest)
    || !safeRef(doctor.root_alias)
    || !safeDigest(doctor.root_digest)
    || !validEpoch(doctor.binding_epoch)
    || !isDenseArray(doctor.cell_refs)
    || !doctor.cell_refs.every(safeRef)
    || !isDenseArray(doctor.startup_order)
    || !doctor.startup_order.every(safeRef)
    || doctor.reboot_policy !== 'forbidden'
    || typeof doctor.reboot_requested !== 'boolean'
    || !isDenseArray(doctor.external_runtime_owners)) return false;
  const body = { ...doctor };
  delete body.doctor_input_digest;
  return doctor.doctor_input_digest === digestOf(body);
}

/**
 * Verifies only the injected Main Node target evidence. A successful result is
 * a candidate for a later handoff evaluator; it is not a service operation.
 */
export function evaluateDeploymentTarget(rawInput) {
  const entry = guardEntry(rawInput, INPUT_FIELDS, ENTRY_CODES);
  if (entry.status === DEPLOYMENT_TARGET_STATUS.HOLD) return holdResult([entry.hold_code]);
  const input = entry.value;
  const unknown = findUnknownKeyDeep(input, new Set(INPUT_ALLOWED_KEYS));
  if (unknown === TOO_DEEP) return holdResult([H.INPUT_TOO_DEEP]);
  if (unknown !== null) return holdResult([H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);
  if (!exactRecord(input, INPUT_FIELDS)
    || input.schema_version !== DEPLOYMENT_TARGET_INPUT_SCHEMA
    || !safeRef(input.evaluation_ref)
    || !safeRef(input.node_ref)) return holdResult([H.INPUT_SHAPE_INVALID]);

  const profileIssues = profileProblems(input.profile);
  if (profileIssues.length > 0) {
    return holdResult(profileIssues.includes(H.EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN)
      ? profileIssues : [H.PROFILE_INVALID]);
  }
  const profile = input.profile;
  if (!safeDigest(input.profile_digest) || input.profile_digest !== digestOf(profile)) {
    return holdResult([H.PROFILE_DIGEST_MISMATCH]);
  }

  if (!bindingIsValid(input.binding)) return holdResult([H.BINDING_INVALID]);
  const binding = input.binding;
  if (binding.reboot_requested !== false) return holdResult([H.REBOOT_FORBIDDEN]);
  if (binding.pack_ref !== profile.pack_ref || binding.service_ref !== profile.service_ref
    || binding.root_alias !== profile.root_alias) {
    return holdResult([H.EXACT_BINDING_MISMATCH]);
  }

  if (input.doctor_input === undefined || input.doctor_input === null) {
    return holdResult([H.DOCTOR_INPUT_REQUIRED]);
  }
  if (!doctorIsValid(input.doctor_input)) {
    const candidate = input.doctor_input;
    if (isPlainObject(candidate) && Object.hasOwn(candidate, 'doctor_input_digest')) {
      const body = { ...candidate };
      delete body.doctor_input_digest;
      if (safeDigest(candidate.doctor_input_digest) && candidate.doctor_input_digest !== digestOf(body)) {
        return holdResult([H.DOCTOR_INPUT_DIGEST_MISMATCH]);
      }
    }
    return holdResult([H.DOCTOR_INPUT_MISMATCH]);
  }
  const doctor = input.doctor_input;
  if (doctor.reboot_requested !== false) return holdResult([H.REBOOT_FORBIDDEN]);
  const cellRefs = profile.cells.map((cell) => cell.cell_ref);
  if (doctor.profile_ref !== profile.profile_ref
    || doctor.profile_digest !== input.profile_digest
    || doctor.node_ref !== input.node_ref
    || doctor.pack_ref !== binding.pack_ref
    || doctor.pack_digest !== binding.pack_digest
    || doctor.service_ref !== binding.service_ref
    || doctor.service_digest !== binding.service_digest
    || doctor.root_alias !== binding.root_alias
    || doctor.root_digest !== binding.root_digest
    || doctor.binding_epoch !== binding.binding_epoch
    || !exactStringList(doctor.cell_refs, cellRefs)
    || !exactStringList(doctor.startup_order, profile.startup_order)
    || doctor.reboot_policy !== profile.reboot_policy
    || !sameRuntimeOwners(doctor.external_runtime_owners, profile.external_runtime_owners)) {
    return holdResult([H.DOCTOR_INPUT_MISMATCH]);
  }

  return deepFreeze({
    schema_version: DEPLOYMENT_TARGET_RESULT_SCHEMA,
    status: DEPLOYMENT_TARGET_STATUS.VERIFIED_MAIN_NODE_TARGET,
    effect: 'check_only',
    blockers: [],
    target: {
      profile_ref: profile.profile_ref,
      profile_digest: input.profile_digest,
      node_ref: input.node_ref,
      pack_ref: binding.pack_ref,
      pack_digest: binding.pack_digest,
      service_ref: binding.service_ref,
      service_digest: binding.service_digest,
      root_alias: binding.root_alias,
      root_digest: binding.root_digest,
      binding_epoch: binding.binding_epoch,
      reboot_policy: 'forbidden',
      doctor_input_ref: doctor.doctor_input_ref,
      doctor_input_digest: doctor.doctor_input_digest,
      external_runtime_owners: profile.external_runtime_owners.map((entry) => ({ ...entry })),
    },
  });
}
