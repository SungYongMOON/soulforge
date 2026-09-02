/**
 * Default-OFF NAS disaster-recovery binding preflight.
 *
 * The pure judge for the native-SMB DR destination. It reads an injected,
 * public-safe binding packet and a separately trusted pin. It never opens the
 * private binding, never resolves a path, never touches SMB, never creates a
 * generation and never authorizes a writer.
 *
 * A passing verdict means one thing only: the declared OFF binding is
 * internally coherent and separates duties correctly. It is not proof that the
 * share exists, that an ACL was measured, that a backup ran, or that a restore
 * is possible. Those are measured gates that live outside this module.
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

export const NAS_DR_BINDING_SCHEMA = 'soulforge.backup_controller.nas_dr_binding.v0';
export const NAS_DR_PRIVATE_BINDING_SCHEMA = 'soulforge.backup_controller.nas_dr_private_binding.v0';
export const NAS_DR_PREFLIGHT_RESULT_SCHEMA = 'soulforge.backup_controller.nas_dr_preflight_result.v0';

export const NAS_DR_PREFLIGHT_STATUS = Object.freeze({
  HOLD: 'HOLD',
  BINDING_OFF_READY: 'NAS_DR_BINDING_OFF_READY',
});

export const NAS_DR_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'NAS_DR_RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'NAS_DR_SECRET_VALUE_FORBIDDEN',
  ABSOLUTE_PATH_FORBIDDEN: 'NAS_DR_ABSOLUTE_PATH_FORBIDDEN',
  INPUT_TOO_DEEP: 'NAS_DR_INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'NAS_DR_INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'NAS_DR_HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'NAS_DR_ACCESSOR_PROPERTY_FORBIDDEN',
  BINDING_SHAPE_INVALID: 'NAS_DR_BINDING_SHAPE_INVALID',
  BINDING_DIGEST_MISMATCH: 'NAS_DR_BINDING_DIGEST_MISMATCH',
  DEFAULT_OFF_REQUIRED: 'NAS_DR_DEFAULT_OFF_REQUIRED',
  DESTINATION_KIND_INVALID: 'NAS_DR_DESTINATION_KIND_INVALID',
  DESTINATION_NOT_DR_TARGET: 'NAS_DR_DESTINATION_NOT_DR_TARGET',
  LEGACY_ADDRESSING_FORBIDDEN: 'NAS_DR_LEGACY_ADDRESSING_FORBIDDEN',
  DESTINATION_IDENTITY_DRIFT: 'NAS_DR_DESTINATION_IDENTITY_DRIFT',
  GENERATION_FAMILY_SET_INVALID: 'NAS_DR_GENERATION_FAMILY_SET_INVALID',
  GENERATION_FAMILY_NAMESPACE_MISMATCH: 'NAS_DR_GENERATION_FAMILY_NAMESPACE_MISMATCH',
  GENERATION_RETIREMENT_BY_DELETION_FORBIDDEN: 'NAS_DR_GENERATION_RETIREMENT_BY_DELETION_FORBIDDEN',
  SERVICE_PRINCIPAL_INVALID: 'NAS_DR_SERVICE_PRINCIPAL_INVALID',
  DUTY_SEPARATION_REQUIRED: 'NAS_DR_DUTY_SEPARATION_REQUIRED',
  HUMAN_ADMIN_AS_WRITER_FORBIDDEN: 'NAS_DR_HUMAN_ADMIN_AS_WRITER_FORBIDDEN',
  ACCESS_EXPECTATION_INCOMPLETE: 'NAS_DR_ACCESS_EXPECTATION_INCOMPLETE',
  ACCESS_EXPECTATION_MISMATCH: 'NAS_DR_ACCESS_EXPECTATION_MISMATCH',
  SOURCE_SET_INCOMPLETE: 'NAS_DR_SOURCE_SET_INCOMPLETE',
  SOURCE_SET_DUPLICATE_CLASS: 'NAS_DR_SOURCE_SET_DUPLICATE_CLASS',
  LIVE_DATABASE_COPY_FORBIDDEN: 'NAS_DR_LIVE_DATABASE_COPY_FORBIDDEN',
  EXCLUDED_SET_INCOMPLETE: 'NAS_DR_EXCLUDED_SET_INCOMPLETE',
  FENCING_INVALID: 'NAS_DR_FENCING_INVALID',
  EPOCH_REGRESSION: 'NAS_DR_EPOCH_REGRESSION',
  TWO_PHASE_CLOSE_REQUIRED: 'NAS_DR_TWO_PHASE_CLOSE_REQUIRED',
  PARTIAL_GENERATION_EXPOSURE_FORBIDDEN: 'NAS_DR_PARTIAL_GENERATION_EXPOSURE_FORBIDDEN',
  MANIFEST_POLICY_INVALID: 'NAS_DR_MANIFEST_POLICY_INVALID',
  RETENTION_POLICY_INVALID: 'NAS_DR_RETENTION_POLICY_INVALID',
  LOW_SPACE_STOP_REQUIRED: 'NAS_DR_LOW_SPACE_STOP_REQUIRED',
  ACCEPTANCE_POLICY_INVALID: 'NAS_DR_ACCEPTANCE_POLICY_INVALID',
  SELF_ACCEPTANCE_FORBIDDEN: 'NAS_DR_SELF_ACCEPTANCE_FORBIDDEN',
  PRODUCTION_OVERWRITE_FORBIDDEN: 'NAS_DR_PRODUCTION_OVERWRITE_FORBIDDEN',
});

const H = NAS_DR_HOLD_CODES;

const TOP_LEVEL_KEYS = Object.freeze([
  'schema_version', 'controller_id', 'feature_state', 'binding_ref', 'binding_digest',
  'binding_epoch', 'destination', 'generation_families', 'principals', 'access_expectations',
  'source_sets', 'excluded_classes', 'fencing', 'close_protocol', 'manifest_policy',
  'retention', 'acceptance',
]);

const REQUIRED_SOURCE_CLASSES = Object.freeze([
  'runtime_state', 'canonical_payload', 'canonical_lineage', 'software_and_pack', 'collector_state',
]);

const REQUIRED_EXCLUDED_CLASSES = Object.freeze([
  'secret', 'temp_or_cache', 'active_worktree_scratch', 'tool_transient_data',
]);

// The shared guard scans string VALUES, and only checks unknown keys at the top
// level. A secret- or path-shaped string parked in a KEY would otherwise ride
// through, so this module names every key it accepts at any depth and rejects
// anything else deeply.
const ALLOWED_KEYS_DEEP = new Set([
  ...TOP_LEVEL_KEYS,
  'kind', 'purpose', 'host_ref', 'share_ref', 'volume_ref', 'filesystem', 'identity_digest',
  'drive_letter_mapping_allowed', 'raidrive_allowed', 'is_working_drive',
  'family', 'namespace_segment', 'generation_id_grammar', 'retire_by_deletion_allowed',
  'writer', 'restore_verifier', 'operator', 'break_glass_admin',
  'principal_ref', 'group_ref', 'is_administrator', 'is_human_account', 'secret_ref',
  'automated_use_allowed',
  'subject_class', 'subject_ref', 'effective_access',
  'class', 'source_ref', 'source_owner_ref', 'revision_pin_kind', 'acceptance_ref',
  'backup_owner_ref', 'capture_method',
  'sole_writer', 'lease_ref', 'lease_seconds', 'epoch', 'replay_is_no_op',
  'mode', 'partial_visible_in_current_projection', 'finalize_within_same_share',
  'completeness_required', 'digest_algorithm', 'records_excluded_set', 'two_way_readback',
  'rpo_minutes', 'rto_minutes', 'keep_generations', 'min_free_bytes', 'low_space_stop',
  'quota_state',
  'named_human_ref', 'self_accept_allowed', 'isolated_restore_required',
  'production_overwrite_allowed',
]);
Object.freeze(ALLOWED_KEYS_DEEP);

// Windows account names are case-insensitive, and a trailing dot or surrounding
// whitespace resolves to the same principal. Comparing raw strings would let
// "svc.a", "SVC.A" and "svc.a." read as three identities when they are one, which
// would defeat duty separation, the break-glass rule and non-self acceptance at
// the same time.
function identityKey(value) {
  if (typeof value !== 'string') return null;
  return value.trim().replace(/[.\s]+$/u, '').toLowerCase();
}

const distinctIdentities = (refs) => new Set(refs.map(identityKey)).size;
const includesIdentity = (refs, candidate) => {
  const key = identityKey(candidate);
  return key !== null && refs.map(identityKey).includes(key);
};

// Self-seal: the declared digest must recompute over the record's own remaining
// content. Without this the digest is a label that any edit can carry along, and
// "drift detection" would only detect a drift somebody chose to declare.
function sealMatches(record, field) {
  if (!isPlainObject(record) || typeof record[field] !== 'string') return false;
  const body = { ...record };
  delete body[field];
  return record[field] === digestOf(body);
}

// The two families are addressed by fixed segments. A family that claims the
// other family's segment would let one generation id space overwrite the other.
const FAMILY_SEGMENT = Object.freeze({
  LEGACY_FREEZE: 'legacy-freeze',
  D_CANONICAL: 'd-generations',
});

// Every subject class whose effective access must be declared, with the only
// outcome each one is allowed to have. An ordinary user or a guest that reads
// the DR share is a finding, not a configuration choice.
const REQUIRED_ACCESS = Object.freeze({
  writer: 'read_write',
  restore_verifier: 'read_only',
  operator: 'read_only',
  break_glass_admin: 'read_write',
  ordinary_user: 'deny',
  guest: 'deny',
  // Unauthenticated access is the one row most likely to become a real grant if
  // it is merely omitted, so it is required and pinned to deny like the rest.
  anonymous_service: 'deny',
});

// A subject class outside this set has no required outcome, so an extra row could
// carry any access an ACL applier would later honour. The set is closed.
const KNOWN_SUBJECT_CLASSES = Object.freeze(Object.keys(REQUIRED_ACCESS));

const isDigest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const isPositiveInt = (value, max) => Number.isSafeInteger(value) && value >= 1 && value <= max;

function serviceProblems(principal) {
  if (!isPlainObject(principal)) return true;
  return !isSafeRef(principal.principal_ref)
    || !isSafeRef(principal.group_ref)
    || !isSafeRef(principal.secret_ref)
    || principal.is_administrator !== false
    || principal.is_human_account !== false;
}

/**
 * @param {unknown} rawBinding public-safe binding packet
 * @param {{binding_digest: string, destination_identity_digest: string, minimum_epoch: number}} trustedPin
 *   Independently supplied. A binding cannot vouch for itself.
 */
export function evaluateNasDrPreflight(rawBinding, trustedPin) {
  const guarded = guardEntry(rawBinding, TOP_LEVEL_KEYS, {
    tooDeep: H.INPUT_TOO_DEEP,
    accessor: H.ACCESSOR_PROPERTY_FORBIDDEN,
    tooLarge: H.INPUT_TOO_LARGE,
    hostileInput: H.HOSTILE_INPUT_REFUSED,
    unknownField: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
    secret: H.SECRET_VALUE_FORBIDDEN,
    localPath: H.ABSOLUTE_PATH_FORBIDDEN,
  });
  if (guarded.status !== 'OK') return refuse([guarded.hold_code]);

  const b = guarded.value;
  const deepUnknown = findUnknownKeyDeep(b, ALLOWED_KEYS_DEEP);
  if (deepUnknown === TOO_DEEP) return refuse([H.INPUT_TOO_DEEP]);
  if (deepUnknown !== null) return refuse([H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);

  const blockers = [];
  const add = (code) => { if (!blockers.includes(code)) blockers.push(code); };

  if (!isPlainObject(trustedPin)
    || !isDigest(trustedPin.binding_digest)
    || !isDigest(trustedPin.destination_identity_digest)
    || !Number.isSafeInteger(trustedPin.minimum_epoch)
    || trustedPin.minimum_epoch < 1) {
    return refuse([H.BINDING_SHAPE_INVALID]);
  }

  if (b.schema_version !== NAS_DR_BINDING_SCHEMA
    || b.controller_id !== 'soulforge-backup-controller'
    || !isSafeRef(b.binding_ref)
    || !isDigest(b.binding_digest)
    || !isPositiveInt(b.binding_epoch, Number.MAX_SAFE_INTEGER)) {
    add(H.BINDING_SHAPE_INVALID);
  }
  // Two independent conditions: the digest must recompute over this binding's own
  // content, AND it must equal the separately supplied pin. A caller that derives
  // the pin from the binding still cannot hide an edit, because any edit moves the
  // recomputed digest and fails the seal.
  if (!sealMatches(b, 'binding_digest')) add(H.BINDING_DIGEST_MISMATCH);
  if (b.binding_digest !== trustedPin.binding_digest) add(H.BINDING_DIGEST_MISMATCH);
  if (b.feature_state !== 'off') add(H.DEFAULT_OFF_REQUIRED);
  if (Number.isSafeInteger(b.binding_epoch) && b.binding_epoch < trustedPin.minimum_epoch) {
    add(H.EPOCH_REGRESSION);
  }

  // Destination: native SMB, DR purpose, no legacy addressing, identity pinned.
  const dest = b.destination;
  if (!isPlainObject(dest)) {
    add(H.BINDING_SHAPE_INVALID);
  } else {
    if (dest.kind !== 'smb_native_share') add(H.DESTINATION_KIND_INVALID);
    if (dest.purpose !== 'disaster_recovery_target' || dest.is_working_drive !== false) {
      add(H.DESTINATION_NOT_DR_TARGET);
    }
    if (dest.raidrive_allowed !== false || dest.drive_letter_mapping_allowed !== false) {
      add(H.LEGACY_ADDRESSING_FORBIDDEN);
    }
    if (!isSafeRef(dest.host_ref) || !isSafeRef(dest.share_ref) || !isSafeRef(dest.volume_ref)
      || !['btrfs', 'ext4'].includes(dest.filesystem)) {
      add(H.BINDING_SHAPE_INVALID);
    }
    // The identity digest must actually fold the four identity fields, so a NAS
    // rebuild, a recreated share or a swapped volume moves it whether or not
    // anyone remembers to update it.
    if (!isDigest(dest.identity_digest)) {
      add(H.BINDING_SHAPE_INVALID);
    } else {
      const recomputed = digestOf({
        host_ref: dest.host_ref,
        share_ref: dest.share_ref,
        volume_ref: dest.volume_ref,
        filesystem: dest.filesystem,
      });
      if (dest.identity_digest !== recomputed
        || dest.identity_digest !== trustedPin.destination_identity_digest) {
        add(H.DESTINATION_IDENTITY_DRIFT);
      }
    }
  }

  // Two generation families, each on its own fixed segment, neither retirable by deletion.
  const families = b.generation_families;
  if (!isDenseArray(families) || families.length !== 2 || !families.every(isPlainObject)) {
    add(H.GENERATION_FAMILY_SET_INVALID);
  } else {
    const names = families.map((f) => f.family);
    if (!names.includes('LEGACY_FREEZE') || !names.includes('D_CANONICAL')
      || new Set(names).size !== 2) {
      add(H.GENERATION_FAMILY_SET_INVALID);
    }
    const segments = families.map((f) => f.namespace_segment);
    if (new Set(segments).size !== 2) add(H.GENERATION_FAMILY_NAMESPACE_MISMATCH);
    for (const f of families) {
      if (FAMILY_SEGMENT[f.family] !== f.namespace_segment) {
        add(H.GENERATION_FAMILY_NAMESPACE_MISMATCH);
      }
      if (!['epoch', 'generation_id'].includes(f.generation_id_grammar)) {
        add(H.GENERATION_FAMILY_SET_INVALID);
      }
      if (f.retire_by_deletion_allowed !== false) {
        add(H.GENERATION_RETIREMENT_BY_DELETION_FORBIDDEN);
      }
    }
  }

  // Principals: three distinct non-admin service identities plus a human break-glass account.
  const p = b.principals;
  let principalRefs = null;
  if (!isPlainObject(p)) {
    add(H.BINDING_SHAPE_INVALID);
  } else {
    const services = [p.writer, p.restore_verifier, p.operator];
    if (services.some(serviceProblems)) add(H.SERVICE_PRINCIPAL_INVALID);
    const refs = services.map((s) => (isPlainObject(s) ? s.principal_ref : null));
    // Distinctness is over normalized identities, not raw strings.
    if (refs.every((r) => typeof r === 'string') && distinctIdentities(refs) !== 3) {
      add(H.DUTY_SEPARATION_REQUIRED);
    }
    // Three roles sharing one stored credential is one identity wearing three hats.
    const secretRefs = services.map((s) => (isPlainObject(s) ? s.secret_ref : null));
    if (secretRefs.every((r) => typeof r === 'string') && distinctIdentities(secretRefs) !== 3) {
      add(H.DUTY_SEPARATION_REQUIRED);
    }
    const admin = p.break_glass_admin;
    if (!isPlainObject(admin) || !isSafeRef(admin.principal_ref)
      || admin.is_human_account !== true || admin.is_administrator !== true) {
      add(H.BINDING_SHAPE_INVALID);
    } else {
      if (admin.automated_use_allowed !== false) add(H.HUMAN_ADMIN_AS_WRITER_FORBIDDEN);
      if (includesIdentity(refs, admin.principal_ref)) add(H.HUMAN_ADMIN_AS_WRITER_FORBIDDEN);
    }
    principalRefs = {
      writer: refs[0], restore_verifier: refs[1], operator: refs[2],
      break_glass_admin: isPlainObject(admin) ? admin.principal_ref : null,
    };
  }

  // Effective access must be declared for every subject class, with the only allowed outcome.
  const access = b.access_expectations;
  if (!isDenseArray(access) || !access.every(isPlainObject)) {
    add(H.BINDING_SHAPE_INVALID);
  } else {
    // Exactly the known classes, once each. An unrecognized class has no required
    // outcome, so an extra row is a grant nobody reviewed.
    if (access.length !== KNOWN_SUBJECT_CLASSES.length) add(H.ACCESS_EXPECTATION_INCOMPLETE);
    const seen = new Map();
    for (const row of access) {
      if (!isSafeRef(row.subject_ref) || typeof row.subject_class !== 'string') {
        add(H.BINDING_SHAPE_INVALID);
        continue;
      }
      if (!KNOWN_SUBJECT_CLASSES.includes(row.subject_class)) {
        add(H.ACCESS_EXPECTATION_MISMATCH);
        continue;
      }
      if (seen.has(row.subject_class)) add(H.ACCESS_EXPECTATION_MISMATCH);
      seen.set(row.subject_class, row);
    }
    for (const [subjectClass, expected] of Object.entries(REQUIRED_ACCESS)) {
      const row = seen.get(subjectClass);
      if (row === undefined) { add(H.ACCESS_EXPECTATION_INCOMPLETE); continue; }
      if (row.effective_access !== expected) add(H.ACCESS_EXPECTATION_MISMATCH);
      const bound = principalRefs?.[subjectClass];
      if (typeof bound === 'string' && !includesIdentity([bound], row.subject_ref)) {
        add(H.ACCESS_EXPECTATION_MISMATCH);
      }
      // A denied class must not name an identity that another row grants.
      if (expected === 'deny' && principalRefs !== null
        && includesIdentity(Object.values(principalRefs), row.subject_ref)) {
        add(H.ACCESS_EXPECTATION_MISMATCH);
      }
    }
  }

  // Source sets: every class exactly once, and no live database copied in place.
  const sets = b.source_sets;
  if (!isDenseArray(sets) || !sets.every(isPlainObject)) {
    add(H.BINDING_SHAPE_INVALID);
  } else {
    const classes = sets.map((s) => s.class);
    if (new Set(classes).size !== classes.length) add(H.SOURCE_SET_DUPLICATE_CLASS);
    for (const required of REQUIRED_SOURCE_CLASSES) {
      if (!classes.includes(required)) add(H.SOURCE_SET_INCOMPLETE);
    }
    for (const s of sets) {
      if (!isSafeRef(s.source_ref) || !isSafeRef(s.source_owner_ref)
        || !isSafeRef(s.acceptance_ref) || !isSafeRef(s.backup_owner_ref)
        || !['content_digest', 'generation_id', 'commit_sha', 'epoch'].includes(s.revision_pin_kind)) {
        add(H.SOURCE_SET_INCOMPLETE);
      }
      if (!['copy_only_file_walk', 'wal_safe_logical_export', 'closed_generation_reference']
        .includes(s.capture_method)) {
        add(H.SOURCE_SET_INCOMPLETE);
      }
      if (s.class === 'runtime_state' && s.capture_method === 'copy_only_file_walk') {
        add(H.LIVE_DATABASE_COPY_FORBIDDEN);
      }
    }
  }

  const excluded = b.excluded_classes;
  if (!isDenseArray(excluded)
    || new Set(excluded).size !== excluded.length
    || !REQUIRED_EXCLUDED_CLASSES.every((c) => excluded.includes(c))) {
    add(H.EXCLUDED_SET_INCOMPLETE);
  }

  const f = b.fencing;
  if (!isPlainObject(f) || f.sole_writer !== true || f.replay_is_no_op !== true
    || !isSafeRef(f.lease_ref) || !isPositiveInt(f.lease_seconds, 86400)
    || !isPositiveInt(f.epoch, Number.MAX_SAFE_INTEGER)) {
    add(H.FENCING_INVALID);
  } else if (f.epoch < trustedPin.minimum_epoch) {
    add(H.EPOCH_REGRESSION);
  }

  const close = b.close_protocol;
  if (!isPlainObject(close) || close.mode !== 'two_phase_staging_then_verified'
    || close.finalize_within_same_share !== true) {
    add(H.TWO_PHASE_CLOSE_REQUIRED);
  }
  if (!isPlainObject(close) || close.partial_visible_in_current_projection !== false) {
    add(H.PARTIAL_GENERATION_EXPOSURE_FORBIDDEN);
  }

  const mp = b.manifest_policy;
  if (!isPlainObject(mp) || mp.completeness_required !== true
    || mp.digest_algorithm !== 'sha256' || mp.records_excluded_set !== true
    || mp.two_way_readback !== true) {
    add(H.MANIFEST_POLICY_INVALID);
  }

  const r = b.retention;
  if (!isPlainObject(r)
    || !isPositiveInt(r.rpo_minutes, 43200) || !isPositiveInt(r.rto_minutes, 43200)
    || !Number.isSafeInteger(r.keep_generations) || r.keep_generations < 2
    || !isPositiveInt(r.min_free_bytes, Number.MAX_SAFE_INTEGER)
    || !['disabled', 'enabled'].includes(r.quota_state)) {
    add(H.RETENTION_POLICY_INVALID);
  }
  if (!isPlainObject(r) || r.low_space_stop !== true) add(H.LOW_SPACE_STOP_REQUIRED);

  const a = b.acceptance;
  if (!isPlainObject(a) || !isSafeRef(a.named_human_ref)
    || a.isolated_restore_required !== true) {
    add(H.ACCEPTANCE_POLICY_INVALID);
  }
  if (!isPlainObject(a) || a.production_overwrite_allowed !== false) {
    add(H.PRODUCTION_OVERWRITE_FORBIDDEN);
  }
  if (!isPlainObject(a) || a.self_accept_allowed !== false) add(H.SELF_ACCEPTANCE_FORBIDDEN);
  // The person who accepts a restore must not be one of the identities that produced it.
  if (isPlainObject(a) && principalRefs !== null
    && includesIdentity(Object.values(principalRefs), a.named_human_ref)) {
    add(H.SELF_ACCEPTANCE_FORBIDDEN);
  }

  if (blockers.length > 0) return refuse(blockers);

  return deepFreeze({
    schema_version: NAS_DR_PREFLIGHT_RESULT_SCHEMA,
    status: NAS_DR_PREFLIGHT_STATUS.BINDING_OFF_READY,
    feature_state: 'off',
    // A coherent OFF binding is not a capability. Every one of these stays false
    // until its own measured gate passes somewhere else.
    activation_authority: false,
    backup_run_authorized: false,
    destination_reachability_proven: false,
    acl_effect_proven: false,
    restore_readiness_proven: false,
    // A pure judge cannot tell whether the caller fetched the pin from an
    // independent approved store or simply read it back off this binding. The
    // self-seal makes a SILENT edit impossible, because any edit moves the
    // recomputed digest. It cannot make a dishonest caller impossible. Stating
    // that here stops a consumer reading this verdict as proof of independence.
    pin_independence_is_caller_obligation: true,
    blockers: Object.freeze([]),
  });
}

function refuse(blockers) {
  return deepFreeze({
    schema_version: NAS_DR_PREFLIGHT_RESULT_SCHEMA,
    status: NAS_DR_PREFLIGHT_STATUS.HOLD,
    feature_state: 'off',
    activation_authority: false,
    backup_run_authorized: false,
    destination_reachability_proven: false,
    acl_effect_proven: false,
    restore_readiness_proven: false,
    pin_independence_is_caller_obligation: true,
    blockers: Object.freeze([...blockers]),
  });
}
