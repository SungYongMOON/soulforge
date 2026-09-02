import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import Ajv2020 from 'ajv/dist/2020.js';

import { digestOf } from '../agent_observation/guard_primitives.mjs';
import {
  NAS_DR_BINDING_SCHEMA,
  NAS_DR_HOLD_CODES as H,
  NAS_DR_PREFLIGHT_RESULT_SCHEMA,
  NAS_DR_PREFLIGHT_STATUS,
  NAS_DR_PRIVATE_BINDING_SCHEMA,
  evaluateNasDrPreflight,
} from './nas_dr_preflight.mjs';

const publicSchema = JSON.parse(
  readFileSync(new URL('./nas_dr_binding.schema.json', import.meta.url), 'utf8'),
);
const privateSchema = JSON.parse(
  readFileSync(new URL('./nas_dr_private_binding.schema.json', import.meta.url), 'utf8'),
);

// Bad-input probes are assembled at runtime. The repository path-policy validator
// scans source bytes, so a literal drive-letter or UNC path written here would be
// a policy violation in the very test that exists to reject it.
const BS = String.fromCharCode(92);
const DRIVE_LETTER_PATH = `Z:${BS}soulforge_backup`;
const UNC = (host, share) => `${BS}${BS}${host}${BS}${share}`;

const WRITER = 'principal.sf_backup_controller';
const VERIFIER = 'principal.sf_restore_verifier';
const OPERATOR = 'principal.sf_backup_operator';
const ADMIN = 'principal.human_break_glass_admin';
const REVIEWER = 'person.named_restore_reviewer';

function identityDigest(dest) {
  return digestOf({
    host_ref: dest.host_ref,
    share_ref: dest.share_ref,
    volume_ref: dest.volume_ref,
    filesystem: dest.filesystem,
  });
}

function seal(candidate) {
  candidate.destination.identity_digest = identityDigest(candidate.destination);
  const body = { ...candidate };
  delete body.binding_digest;
  candidate.binding_digest = digestOf(body);
  return candidate;
}

const pinFor = (candidate) => Object.freeze({
  binding_digest: candidate.binding_digest,
  destination_identity_digest: candidate.destination.identity_digest,
  minimum_epoch: 3,
});

function service(principalRef, groupRef, secretRef) {
  return {
    principal_ref: principalRef,
    group_ref: groupRef,
    is_administrator: false,
    is_human_account: false,
    secret_ref: secretRef,
  };
}

function binding() {
  return seal({
    schema_version: NAS_DR_BINDING_SCHEMA,
    controller_id: 'soulforge-backup-controller',
    feature_state: 'off',
    binding_ref: 'binding.nas_dr.v0',
    binding_digest: null,
    binding_epoch: 3,
    destination: {
      kind: 'smb_native_share',
      purpose: 'disaster_recovery_target',
      host_ref: 'nas.host.primary',
      share_ref: 'nas.share.soulforge_backup',
      volume_ref: 'nas.volume.one',
      filesystem: 'btrfs',
      identity_digest: null,
      drive_letter_mapping_allowed: false,
      raidrive_allowed: false,
      is_working_drive: false,
    },
    generation_families: [
      {
        family: 'LEGACY_FREEZE',
        namespace_segment: 'legacy-freeze',
        generation_id_grammar: 'epoch',
        retire_by_deletion_allowed: false,
      },
      {
        family: 'D_CANONICAL',
        namespace_segment: 'd-generations',
        generation_id_grammar: 'generation_id',
        retire_by_deletion_allowed: false,
      },
    ],
    principals: {
      writer: service(WRITER, 'group.sf_backup_writers', 'protected.target.writer'),
      restore_verifier: service(VERIFIER, 'group.sf_restore_verifiers', 'protected.target.verifier'),
      operator: service(OPERATOR, 'group.sf_backup_operators', 'protected.target.operator'),
      break_glass_admin: {
        principal_ref: ADMIN,
        is_human_account: true,
        is_administrator: true,
        automated_use_allowed: false,
      },
    },
    access_expectations: [
      { subject_class: 'writer', subject_ref: WRITER, effective_access: 'read_write' },
      { subject_class: 'restore_verifier', subject_ref: VERIFIER, effective_access: 'read_only' },
      { subject_class: 'operator', subject_ref: OPERATOR, effective_access: 'read_only' },
      { subject_class: 'break_glass_admin', subject_ref: ADMIN, effective_access: 'read_write' },
      { subject_class: 'ordinary_user', subject_ref: 'subject.ordinary_users', effective_access: 'deny' },
      { subject_class: 'guest', subject_ref: 'subject.guest', effective_access: 'deny' },
      { subject_class: 'anonymous_service', subject_ref: 'subject.anonymous', effective_access: 'deny' },
    ],
    source_sets: [
      {
        class: 'runtime_state',
        source_ref: 'source.erp_database',
        source_owner_ref: 'owner.erp',
        revision_pin_kind: 'content_digest',
        acceptance_ref: 'acceptance.runtime_state.v0',
        backup_owner_ref: 'owner.backup_controller',
        capture_method: 'wal_safe_logical_export',
      },
      {
        class: 'canonical_payload',
        source_ref: 'source.canonical_payload',
        source_owner_ref: 'owner.project_authority',
        revision_pin_kind: 'content_digest',
        acceptance_ref: 'acceptance.canonical_payload.v0',
        backup_owner_ref: 'owner.backup_controller',
        capture_method: 'copy_only_file_walk',
      },
      {
        class: 'canonical_lineage',
        source_ref: 'source.canonical_lineage',
        source_owner_ref: 'owner.project_authority',
        revision_pin_kind: 'generation_id',
        acceptance_ref: 'acceptance.canonical_lineage.v0',
        backup_owner_ref: 'owner.backup_controller',
        capture_method: 'copy_only_file_walk',
      },
      {
        class: 'software_and_pack',
        source_ref: 'source.installed_pack',
        source_owner_ref: 'owner.deployment_pack',
        revision_pin_kind: 'commit_sha',
        acceptance_ref: 'acceptance.software_and_pack.v0',
        backup_owner_ref: 'owner.backup_controller',
        capture_method: 'closed_generation_reference',
      },
      {
        class: 'collector_state',
        source_ref: 'source.collector_state',
        source_owner_ref: 'owner.ingress',
        revision_pin_kind: 'epoch',
        acceptance_ref: 'acceptance.collector_state.v0',
        backup_owner_ref: 'owner.backup_controller',
        capture_method: 'copy_only_file_walk',
      },
    ],
    excluded_classes: ['secret', 'temp_or_cache', 'active_worktree_scratch', 'tool_transient_data'],
    fencing: {
      sole_writer: true,
      lease_ref: 'lease.nas_dr.writer',
      lease_seconds: 3600,
      epoch: 3,
      replay_is_no_op: true,
    },
    close_protocol: {
      mode: 'two_phase_staging_then_verified',
      partial_visible_in_current_projection: false,
      finalize_within_same_share: true,
    },
    manifest_policy: {
      completeness_required: true,
      digest_algorithm: 'sha256',
      records_excluded_set: true,
      two_way_readback: true,
    },
    retention: {
      rpo_minutes: 1440,
      rto_minutes: 480,
      keep_generations: 30,
      min_free_bytes: 1099511627776,
      low_space_stop: true,
      quota_state: 'disabled',
    },
    acceptance: {
      named_human_ref: REVIEWER,
      self_accept_allowed: false,
      isolated_restore_required: true,
      production_overwrite_allowed: false,
    },
  });
}

// Mutate, then re-seal and re-derive the pin so a test isolates exactly the fault
// it introduced instead of also tripping the digest seal.
function blockersOf(mutate) {
  const candidate = binding();
  mutate(candidate);
  seal(candidate);
  return evaluateNasDrPreflight(candidate, pinFor(candidate)).blockers;
}

// Single-fault cases assert the EXACT blocker list. `includes` would also be
// satisfied by an implementation that refuses everything, which is not a test.
const only = (code, mutate) => assert.deepEqual(blockersOf(mutate), [code]);

test('both schemas compile, and a fixture instance actually validates against the public schema', () => {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, formats: { 'date-time': true } });
  const validatePublic = ajv.compile(publicSchema);
  assert.equal(typeof ajv.compile(privateSchema), 'function');

  assert.equal(publicSchema.$id, NAS_DR_BINDING_SCHEMA);
  assert.equal(privateSchema.$id, NAS_DR_PRIVATE_BINDING_SCHEMA);
  assert.equal(publicSchema.properties.feature_state.const, 'off');
  assert.equal(privateSchema.properties.feature_state.const, 'off');

  // The judge must not be looser than the schema it claims to enforce: the very
  // packet the judge accepts has to validate against the published contract.
  assert.equal(validatePublic(binding()), true, JSON.stringify(validatePublic.errors));
});

test('the private UNC pattern refuses every RaiDrive spelling, device paths and admin shares', () => {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
  const validate = ajv.compile({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...privateSchema.$defs.smbDestination.properties.unc_share,
  });

  // Legitimate shares this org could actually use must not be falsely rejected.
  for (const accepted of [
    UNC('sonartech', 'soulforge_backup'),
    UNC('nas-01', 'dr_target'),
    UNC('my_nas', 'share'),
    UNC('nas', 'My Share'),
    UNC('nas', 'backup$'),
    UNC('nas.corp.local', 'dr'),
  ]) {
    assert.equal(validate(accepted), true, `must accept: ${accepted}`);
  }

  for (const rejected of [
    // Every RaiDrive spelling, not only the hyphen and underscore forms.
    UNC('RaiDrive-user', 'Synology'), UNC('raidrive-user', 'Synology'),
    UNC('RaiDrive_user', 'Synology'), UNC('RaiDrive', 'Synology'),
    UNC('raidrive', 'Synology'), UNC('RaiDrive1', 'Synology'),
    UNC('RaiDrive.user', 'Synology'), UNC('raidrive.local', 'Synology'),
    UNC('raidriveuser', 'Synology'), UNC('myRaiDrive-1', 'Synology'),
    UNC('0RaiDrive-1', 'Synology'), UNC('NOTRAIDRIVE', 'x'),
    // Drive letters, device and extended-length prefixes.
    DRIVE_LETTER_PATH, UNC('C:', 'share'), `${BS}${BS}?${BS}C:${BS}share`,
    `${BS}${BS}${BS}nas${BS}share`,
    // Admin shares.
    UNC('nas', 'C$'), UNC('nas', 'ADMIN$'), UNC('nas', 'ipc$'), UNC('nas', 'Print$'),
    // Anything deeper than the share, and non-canonical forms.
    `${UNC('sonartech', 'soulforge_backup')}${BS}d-generations`,
    `${UNC('nas', 'share')}${BS}`, UNC('nas.', 'share'), UNC('nas', 'share.'),
    UNC('nas', 'share '), UNC('nas', ' share'), UNC('-nas', 'share'),
    `${BS}${BS}sonartech`, '//sonartech/soulforge_backup', '',
  ]) {
    assert.equal(validate(rejected), false, `must refuse: ${rejected}`);
  }
});

test('a credential VALUE cannot be passed off as a protected-storage target name', () => {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
  const validate = ajv.compile({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...privateSchema.$defs.credentialTargetRef,
  });
  assert.equal(validate('protected.target.writer'), true);
  // Token and key shapes carry no dotted namespace, so they cannot match.
  for (const rejected of ['sk-abcdefgh12345678', 'ghp_abcdefgh12345678', 'hunter2', 'xoxb-1234-5678']) {
    assert.equal(validate(rejected), false, `must refuse: ${rejected}`);
  }
});

test('a coherent OFF binding is accepted, is deterministic, and still proves nothing operational', () => {
  const candidate = binding();
  const pin = pinFor(candidate);
  const before = structuredClone(candidate);
  const first = evaluateNasDrPreflight(candidate, pin);
  const replay = evaluateNasDrPreflight(candidate, pin);

  assert.deepEqual(candidate, before, 'input must not be mutated');
  assert.deepEqual(first, replay, 'replay must be a NO_OP with an identical verdict');
  assert.equal(first.schema_version, NAS_DR_PREFLIGHT_RESULT_SCHEMA);
  assert.equal(first.status, NAS_DR_PREFLIGHT_STATUS.BINDING_OFF_READY);
  assert.deepEqual(first.blockers, []);
  assert.equal(Object.isFrozen(first), true);

  // The whole point of the ceiling: coherence is not capability.
  assert.equal(first.feature_state, 'off');
  assert.equal(first.activation_authority, false);
  assert.equal(first.backup_run_authorized, false);
  assert.equal(first.destination_reachability_proven, false);
  assert.equal(first.acl_effect_proven, false);
  assert.equal(first.restore_readiness_proven, false);

  // A deep-frozen input must not tempt the judge into writing anything.
  assert.equal(
    evaluateNasDrPreflight(Object.freeze(structuredClone(candidate)), pin).status,
    NAS_DR_PREFLIGHT_STATUS.BINDING_OFF_READY,
  );
});

test('the digest is a seal over content, so a silent edit is impossible', () => {
  // Edit a field without touching the digest: the recomputed seal no longer matches.
  const tampered = binding();
  tampered.retention.keep_generations = 2;
  assert.deepEqual(
    evaluateNasDrPreflight(tampered, pinFor(binding())).blockers,
    [H.BINDING_DIGEST_MISMATCH],
  );

  // The identity digest must fold the four identity fields, not merely be declared.
  const drifted = binding();
  drifted.destination.identity_digest = `sha256:${'8'.repeat(64)}`;
  assert.equal(
    evaluateNasDrPreflight(drifted, pinFor(drifted)).blockers.includes(H.DESTINATION_IDENTITY_DRIFT),
    true,
  );

  // A moved destination moves the identity digest whether or not anyone updates it.
  const moved = binding();
  moved.destination.volume_ref = 'nas.volume.two';
  assert.deepEqual(
    evaluateNasDrPreflight(moved, pinFor(binding())).blockers.includes(H.DESTINATION_IDENTITY_DRIFT),
    true,
  );
});

test('the verdict states plainly that pin independence is the caller obligation', () => {
  // A caller that derives the pin from the binding still passes. The judge cannot
  // detect that, so it must not let a consumer read the verdict as proof.
  const candidate = binding();
  const derivedPin = pinFor(candidate);
  const verdict = evaluateNasDrPreflight(candidate, derivedPin);
  assert.equal(verdict.status, NAS_DR_PREFLIGHT_STATUS.BINDING_OFF_READY);
  assert.equal(verdict.pin_independence_is_caller_obligation, true);
  assert.equal(
    evaluateNasDrPreflight(candidate, { ...derivedPin, binding_digest: `sha256:${'0'.repeat(64)}` })
      .pin_independence_is_caller_obligation,
    true,
  );
});

test('default-off, pin mismatch and epoch regression fail closed', () => {
  only(H.DEFAULT_OFF_REQUIRED, (b) => { b.feature_state = 'on'; });
  only(H.EPOCH_REGRESSION, (b) => { b.binding_epoch = 2; });
  only(H.EPOCH_REGRESSION, (b) => { b.fencing.epoch = 1; });
  assert.deepEqual(
    evaluateNasDrPreflight(binding(), { ...pinFor(binding()), binding_digest: `sha256:${'9'.repeat(64)}` })
      .blockers,
    [H.BINDING_DIGEST_MISMATCH],
  );
});

test('legacy addressing and a working-drive destination are refused', () => {
  only(H.LEGACY_ADDRESSING_FORBIDDEN, (b) => { b.destination.raidrive_allowed = true; });
  only(H.LEGACY_ADDRESSING_FORBIDDEN, (b) => { b.destination.drive_letter_mapping_allowed = true; });
  only(H.DESTINATION_NOT_DR_TARGET, (b) => { b.destination.is_working_drive = true; });
  only(H.DESTINATION_KIND_INVALID, (b) => { b.destination.kind = 'raidrive_network_directory'; });
});

test('the two generation families cannot merge, swap segments, or be retired by deletion', () => {
  only(H.GENERATION_FAMILY_NAMESPACE_MISMATCH, (b) => {
    b.generation_families[0].namespace_segment = 'd-generations';
  });
  only(H.GENERATION_RETIREMENT_BY_DELETION_FORBIDDEN, (b) => {
    b.generation_families[0].retire_by_deletion_allowed = true;
  });
  assert.equal(
    blockersOf((b) => { b.generation_families[1].family = 'LEGACY_FREEZE'; })
      .includes(H.GENERATION_FAMILY_SET_INVALID),
    true,
  );
});

test('duty separation survives case folding and trailing dots, not just exact strings', () => {
  // Collapse the operator onto the writer, keeping the access row consistent so the
  // mutation is single-fault and the exact blocker list stays meaningful.
  only(H.DUTY_SEPARATION_REQUIRED, (b) => {
    b.principals.operator.principal_ref = WRITER;
    b.access_expectations.find((r) => r.subject_class === 'operator').subject_ref = WRITER;
  });

  // Windows account names are case-insensitive and a trailing dot is stripped, so
  // these are ONE identity wearing three hats.
  only(H.DUTY_SEPARATION_REQUIRED, (b) => {
    b.principals.restore_verifier.principal_ref = WRITER.toUpperCase();
    b.access_expectations.find((r) => r.subject_class === 'restore_verifier').subject_ref = WRITER.toUpperCase();
  });
  only(H.DUTY_SEPARATION_REQUIRED, (b) => {
    b.principals.operator.principal_ref = `${WRITER}.`;
    b.access_expectations.find((r) => r.subject_class === 'operator').subject_ref = `${WRITER}.`;
  });
  // Three roles sharing one stored credential is also one identity.
  only(H.DUTY_SEPARATION_REQUIRED, (b) => {
    b.principals.operator.secret_ref = b.principals.writer.secret_ref;
  });
});

test('the human break-glass account can never become an automated writer', () => {
  only(H.SERVICE_PRINCIPAL_INVALID, (b) => { b.principals.writer.is_administrator = true; });
  only(H.SERVICE_PRINCIPAL_INVALID, (b) => { b.principals.writer.is_human_account = true; });
  only(H.HUMAN_ADMIN_AS_WRITER_FORBIDDEN, (b) => {
    b.principals.break_glass_admin.automated_use_allowed = true;
  });
  only(H.BINDING_SHAPE_INVALID, (b) => { b.principals.break_glass_admin.is_administrator = false; });
  // Case folding must not smuggle the admin into a service slot.
  for (const spelling of [WRITER, WRITER.toUpperCase(), `${WRITER}.`]) {
    assert.equal(
      blockersOf((b) => {
        b.principals.break_glass_admin.principal_ref = spelling;
        b.access_expectations.find((r) => r.subject_class === 'break_glass_admin').subject_ref = spelling;
      }).includes(H.HUMAN_ADMIN_AS_WRITER_FORBIDDEN),
      true,
      `spelling must be caught: ${spelling}`,
    );
  }
});

test('every subject class is declared exactly once, and an extra grant cannot ride along', () => {
  only(H.ACCESS_EXPECTATION_MISMATCH, (b) => {
    b.access_expectations.find((r) => r.subject_class === 'guest').effective_access = 'read_only';
  });
  only(H.ACCESS_EXPECTATION_MISMATCH, (b) => {
    b.access_expectations.find((r) => r.subject_class === 'anonymous_service').effective_access = 'read_write';
  });
  only(H.ACCESS_EXPECTATION_MISMATCH, (b) => {
    b.access_expectations.find((r) => r.subject_class === 'writer').subject_ref = OPERATOR;
  });
  // Dropping a row must not silently leave that class unconstrained.
  assert.equal(
    blockersOf((b) => {
      b.access_expectations = b.access_expectations.filter((r) => r.subject_class !== 'ordinary_user');
    }).includes(H.ACCESS_EXPECTATION_INCOMPLETE),
    true,
  );
  // An unrecognized subject class has no required outcome, so it is refused.
  assert.equal(
    blockersOf((b) => {
      b.access_expectations.push({
        subject_class: 'everyone', subject_ref: 'subject.everyone', effective_access: 'read_write',
      });
    }).length > 0,
    true,
  );
  // A denied row must not name an identity another row grants.
  only(H.ACCESS_EXPECTATION_MISMATCH, (b) => {
    b.access_expectations.find((r) => r.subject_class === 'guest').subject_ref = WRITER;
  });
});

test('the source set is complete, unique, and never copies a live database in place', () => {
  only(H.LIVE_DATABASE_COPY_FORBIDDEN, (b) => {
    b.source_sets[0].capture_method = 'copy_only_file_walk';
  });
  only(H.EXCLUDED_SET_INCOMPLETE, (b) => { b.excluded_classes = ['secret', 'temp_or_cache']; });
  assert.equal(
    blockersOf((b) => { b.source_sets.pop(); }).includes(H.SOURCE_SET_INCOMPLETE),
    true,
  );
  assert.equal(
    blockersOf((b) => { b.source_sets[1].class = 'canonical_lineage'; })
      .includes(H.SOURCE_SET_DUPLICATE_CLASS),
    true,
  );
  only(H.SOURCE_SET_INCOMPLETE, (b) => { b.source_sets[2].revision_pin_kind = 'vibes'; });
});

test('fencing, two-phase close and partial exposure fail closed', () => {
  only(H.FENCING_INVALID, (b) => { b.fencing.sole_writer = false; });
  only(H.FENCING_INVALID, (b) => { b.fencing.replay_is_no_op = false; });
  only(H.TWO_PHASE_CLOSE_REQUIRED, (b) => { b.close_protocol.mode = 'single_phase'; });
  only(H.TWO_PHASE_CLOSE_REQUIRED, (b) => { b.close_protocol.finalize_within_same_share = false; });
  only(H.PARTIAL_GENERATION_EXPOSURE_FORBIDDEN, (b) => {
    b.close_protocol.partial_visible_in_current_projection = true;
  });
});

test('manifest completeness, retention floors and the low-space stop are mandatory', () => {
  only(H.MANIFEST_POLICY_INVALID, (b) => { b.manifest_policy.completeness_required = false; });
  only(H.MANIFEST_POLICY_INVALID, (b) => { b.manifest_policy.two_way_readback = false; });
  only(H.RETENTION_POLICY_INVALID, (b) => { b.retention.keep_generations = 1; });
  only(H.RETENTION_POLICY_INVALID, (b) => { b.retention.min_free_bytes = 0; });
  only(H.LOW_SPACE_STOP_REQUIRED, (b) => { b.retention.low_space_stop = false; });
});

test('acceptance cannot be self-granted, in any spelling, and cannot overwrite production', () => {
  only(H.SELF_ACCEPTANCE_FORBIDDEN, (b) => { b.acceptance.self_accept_allowed = true; });
  only(H.PRODUCTION_OVERWRITE_FORBIDDEN, (b) => { b.acceptance.production_overwrite_allowed = true; });
  only(H.ACCEPTANCE_POLICY_INVALID, (b) => { b.acceptance.isolated_restore_required = false; });
  for (const spelling of [WRITER, OPERATOR.toUpperCase(), `${ADMIN}.`, VERIFIER]) {
    only(H.SELF_ACCEPTANCE_FORBIDDEN, (b) => { b.acceptance.named_human_ref = spelling; });
  }
});

test('a secret or path in a KEY is refused, not only in a value', () => {
  // The shared guard scans values; this module additionally rejects unknown keys
  // at any depth, which is what closes the key-position vector.
  for (const mutate of [
    (b) => { b.destination['api_key: AKIAIOSFODNN7EXAMPLE'] = 1; },
    (b) => { b.principals['password: hunter2'] = 1; },
    (b) => { b.destination[DRIVE_LETTER_PATH] = 1; },
    (b) => { b.retention[UNC('nas', 'dr_target')] = 1; },
    (b) => { b.acceptance['_workmeta/P26-014/secret.json'] = 1; },
  ]) {
    const candidate = binding();
    mutate(candidate);
    assert.deepEqual(
      evaluateNasDrPreflight(candidate, pinFor(candidate)).blockers,
      [H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN],
    );
  }
});

test('a packet carrying a secret or a real path in a value is refused before any field is read', () => {
  const secret = binding();
  secret.binding_ref = 'password: hunter2';
  assert.deepEqual(evaluateNasDrPreflight(secret, pinFor(secret)).blockers, [H.SECRET_VALUE_FORBIDDEN]);

  const unc = binding();
  unc.destination.share_ref = UNC('sonartech', 'soulforge_backup');
  assert.deepEqual(evaluateNasDrPreflight(unc, pinFor(unc)).blockers, [H.ABSOLUTE_PATH_FORBIDDEN]);

  const drive = binding();
  drive.binding_ref = DRIVE_LETTER_PATH;
  assert.deepEqual(evaluateNasDrPreflight(drive, pinFor(drive)).blockers, [H.ABSOLUTE_PATH_FORBIDDEN]);

  const extra = binding();
  extra.nas_password = 'anything';
  assert.deepEqual(
    evaluateNasDrPreflight(extra, pinFor(extra)).blockers,
    [H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN],
  );
});

test('hostile input shapes are refused, and each has its own code', () => {
  const accessor = binding();
  Object.defineProperty(accessor, 'binding_ref', { get: () => 'x', enumerable: true, configurable: true });
  assert.deepEqual(
    evaluateNasDrPreflight(accessor, pinFor(binding())).blockers,
    [H.ACCESSOR_PROPERTY_FORBIDDEN],
  );

  let deep = { schema_version: NAS_DR_BINDING_SCHEMA };
  let cursor = deep;
  for (let i = 0; i < 14; i += 1) { cursor.destination = {}; cursor = cursor.destination; }
  assert.deepEqual(evaluateNasDrPreflight(deep, pinFor(binding())).blockers, [H.INPUT_TOO_DEEP]);

  const huge = binding();
  huge.excluded_classes = new Array(4097).fill('secret');
  assert.deepEqual(evaluateNasDrPreflight(huge, pinFor(huge)).blockers, [H.INPUT_TOO_LARGE]);

  const hostile = binding();
  Object.defineProperty(hostile.excluded_classes, 'length', { value: 4294967294 });
  assert.equal(evaluateNasDrPreflight(hostile, pinFor(binding())).blockers.length > 0, true);

  assert.deepEqual(evaluateNasDrPreflight('not an object', pinFor(binding())).blockers,
    [H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN]);
});

test('an untrusted or missing pin cannot be supplied by the binding itself', () => {
  assert.deepEqual(evaluateNasDrPreflight(binding(), null).blockers, [H.BINDING_SHAPE_INVALID]);
  assert.deepEqual(
    evaluateNasDrPreflight(binding(), { ...pinFor(binding()), minimum_epoch: 0 }).blockers,
    [H.BINDING_SHAPE_INVALID],
  );
});
