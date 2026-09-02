import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import Ajv2020 from 'ajv/dist/2020.js';

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

const BINDING_DIGEST = `sha256:${'1'.repeat(64)}`;
const IDENTITY_DIGEST = `sha256:${'2'.repeat(64)}`;
const PIN = Object.freeze({
  binding_digest: BINDING_DIGEST,
  destination_identity_digest: IDENTITY_DIGEST,
  minimum_epoch: 3,
});

// Bad-input probes are assembled at runtime. The repository path-policy validator
// scans source bytes, so a literal drive-letter or UNC path written here would be
// a policy violation in the very test that exists to reject it.
const DRIVE_LETTER_PATH = `Z:${'\\'}soulforge_backup`;
const UNC = (host, share) => `${'\\'.repeat(2)}${host}${'\\'}${share}`;

const WRITER = 'principal.sf_backup_controller';
const VERIFIER = 'principal.sf_restore_verifier';
const OPERATOR = 'principal.sf_backup_operator';
const ADMIN = 'principal.human_break_glass_admin';

function binding() {
  return {
    schema_version: NAS_DR_BINDING_SCHEMA,
    controller_id: 'soulforge-backup-controller',
    feature_state: 'off',
    binding_ref: 'binding.nas_dr.v0',
    binding_digest: BINDING_DIGEST,
    binding_epoch: 3,
    destination: {
      kind: 'smb_native_share',
      purpose: 'disaster_recovery_target',
      host_ref: 'nas.host.primary',
      share_ref: 'nas.share.soulforge_backup',
      volume_ref: 'nas.volume.one',
      filesystem: 'btrfs',
      identity_digest: IDENTITY_DIGEST,
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
      writer: {
        principal_ref: WRITER,
        group_ref: 'group.sf_backup_writers',
        is_administrator: false,
        is_human_account: false,
        secret_ref: 'protected.store.target.writer',
      },
      restore_verifier: {
        principal_ref: VERIFIER,
        group_ref: 'group.sf_restore_verifiers',
        is_administrator: false,
        is_human_account: false,
        secret_ref: 'protected.store.target.verifier',
      },
      operator: {
        principal_ref: OPERATOR,
        group_ref: 'group.sf_backup_operators',
        is_administrator: false,
        is_human_account: false,
        secret_ref: 'protected.store.target.operator',
      },
      break_glass_admin: {
        principal_ref: ADMIN,
        is_human_account: true,
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
      named_human_ref: 'person.named_restore_reviewer',
      self_accept_allowed: false,
      isolated_restore_required: true,
      production_overwrite_allowed: false,
    },
  };
}

const blockersOf = (mutate) => {
  const candidate = binding();
  mutate(candidate);
  return evaluateNasDrPreflight(candidate, PIN).blockers;
};

test('both schemas compile and pin the OFF, native-SMB, two-family contract', () => {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, formats: { 'date-time': true } });
  assert.equal(typeof ajv.compile(publicSchema), 'function');
  assert.equal(typeof ajv.compile(privateSchema), 'function');

  assert.equal(publicSchema.$id, NAS_DR_BINDING_SCHEMA);
  assert.equal(privateSchema.$id, NAS_DR_PRIVATE_BINDING_SCHEMA);
  assert.equal(publicSchema.properties.feature_state.const, 'off');
  assert.equal(privateSchema.properties.feature_state.const, 'off');
  assert.equal(publicSchema.$defs.destination.properties.kind.const, 'smb_native_share');
  assert.equal(publicSchema.$defs.destination.properties.raidrive_allowed.const, false);
  assert.equal(publicSchema.$defs.destination.properties.drive_letter_mapping_allowed.const, false);
  assert.equal(publicSchema.$defs.destination.properties.is_working_drive.const, false);
  assert.equal(publicSchema.$defs.generationFamily.properties.retire_by_deletion_allowed.const, false);
  assert.deepEqual(
    publicSchema.$defs.generationFamily.properties.namespace_segment.enum,
    ['legacy-freeze', 'd-generations'],
  );
  assert.equal(privateSchema.$defs.namespaces.properties.legacy_freeze_segment.const, 'legacy-freeze');
  assert.equal(privateSchema.$defs.namespaces.properties.d_generations_segment.const, 'd-generations');
});

test('the private UNC pattern accepts a native share and refuses RaiDrive, drive letters and deeper paths', () => {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
  const validate = ajv.compile({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...privateSchema.$defs.smbDestination.properties.unc_share,
  });

  assert.equal(validate(UNC('sonartech', 'soulforge_backup')), true, 'native SMB share must validate');
  assert.equal(validate(UNC('nas-01', 'dr_target')), true);

  for (const rejected of [
    UNC('RaiDrive-user', 'Synology'),
    UNC('raidrive-user', 'Synology'),
    UNC('RaiDrive_user', 'Synology'),
    DRIVE_LETTER_PATH,
    `${UNC('sonartech', 'soulforge_backup')}${'\\'}d-generations`,
    `${'\\'.repeat(2)}sonartech`,
    '//sonartech/soulforge_backup',
    '',
  ]) {
    assert.equal(validate(rejected), false, `must refuse: ${rejected}`);
  }
});

test('a coherent OFF binding is accepted, is deterministic, and still proves nothing operational', () => {
  const candidate = binding();
  const before = structuredClone(candidate);
  const first = evaluateNasDrPreflight(candidate, PIN);
  const replay = evaluateNasDrPreflight(candidate, PIN);

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
});

test('default-off, digest pin and destination identity drift fail closed', () => {
  assert.ok(blockersOf((b) => { b.feature_state = 'on'; }).includes(H.DEFAULT_OFF_REQUIRED));
  assert.ok(blockersOf((b) => { b.binding_digest = `sha256:${'9'.repeat(64)}`; })
    .includes(H.BINDING_DIGEST_MISMATCH));
  assert.ok(blockersOf((b) => { b.destination.identity_digest = `sha256:${'8'.repeat(64)}`; })
    .includes(H.DESTINATION_IDENTITY_DRIFT));
  assert.ok(blockersOf((b) => { b.binding_epoch = 2; }).includes(H.EPOCH_REGRESSION));
  assert.ok(blockersOf((b) => { b.fencing.epoch = 1; }).includes(H.EPOCH_REGRESSION));
});

test('legacy addressing and a working-drive destination are refused', () => {
  assert.ok(blockersOf((b) => { b.destination.raidrive_allowed = true; })
    .includes(H.LEGACY_ADDRESSING_FORBIDDEN));
  assert.ok(blockersOf((b) => { b.destination.drive_letter_mapping_allowed = true; })
    .includes(H.LEGACY_ADDRESSING_FORBIDDEN));
  assert.ok(blockersOf((b) => { b.destination.is_working_drive = true; })
    .includes(H.DESTINATION_NOT_DR_TARGET));
  assert.ok(blockersOf((b) => { b.destination.kind = 'raidrive_network_directory'; })
    .includes(H.DESTINATION_KIND_INVALID));
});

test('the two generation families cannot merge, swap segments, or be retired by deletion', () => {
  assert.ok(blockersOf((b) => { b.generation_families[1].family = 'LEGACY_FREEZE'; })
    .includes(H.GENERATION_FAMILY_SET_INVALID));
  assert.ok(blockersOf((b) => { b.generation_families[0].namespace_segment = 'd-generations'; })
    .includes(H.GENERATION_FAMILY_NAMESPACE_MISMATCH));
  assert.ok(blockersOf((b) => { b.generation_families[0].retire_by_deletion_allowed = true; })
    .includes(H.GENERATION_RETIREMENT_BY_DELETION_FORBIDDEN));
});

test('duty separation holds and the human admin can never be an automated writer', () => {
  assert.ok(blockersOf((b) => { b.principals.operator.principal_ref = WRITER; })
    .includes(H.DUTY_SEPARATION_REQUIRED));
  assert.ok(blockersOf((b) => { b.principals.writer.is_administrator = true; })
    .includes(H.SERVICE_PRINCIPAL_INVALID));
  assert.ok(blockersOf((b) => { b.principals.writer.is_human_account = true; })
    .includes(H.SERVICE_PRINCIPAL_INVALID));
  assert.ok(blockersOf((b) => { b.principals.break_glass_admin.automated_use_allowed = true; })
    .includes(H.HUMAN_ADMIN_AS_WRITER_FORBIDDEN));
  assert.ok(blockersOf((b) => {
    b.principals.break_glass_admin.principal_ref = WRITER;
  }).includes(H.HUMAN_ADMIN_AS_WRITER_FORBIDDEN));
});

test('every subject class must declare its effective access, and only the allowed outcome', () => {
  assert.ok(blockersOf((b) => {
    b.access_expectations = b.access_expectations.filter((r) => r.subject_class !== 'ordinary_user');
  }).includes(H.ACCESS_EXPECTATION_INCOMPLETE));
  assert.ok(blockersOf((b) => {
    b.access_expectations.find((r) => r.subject_class === 'guest').effective_access = 'read_only';
  }).includes(H.ACCESS_EXPECTATION_MISMATCH));
  assert.ok(blockersOf((b) => {
    b.access_expectations.find((r) => r.subject_class === 'writer').subject_ref = OPERATOR;
  }).includes(H.ACCESS_EXPECTATION_MISMATCH));
});

test('the source set is complete, unique, and never copies a live database in place', () => {
  assert.ok(blockersOf((b) => { b.source_sets.pop(); }).includes(H.SOURCE_SET_INCOMPLETE));
  assert.ok(blockersOf((b) => { b.source_sets[1].class = 'canonical_lineage'; })
    .includes(H.SOURCE_SET_DUPLICATE_CLASS));
  assert.ok(blockersOf((b) => { b.source_sets[0].capture_method = 'copy_only_file_walk'; })
    .includes(H.LIVE_DATABASE_COPY_FORBIDDEN));
  assert.ok(blockersOf((b) => { b.excluded_classes = ['secret', 'temp_or_cache']; })
    .includes(H.EXCLUDED_SET_INCOMPLETE));
});

test('fencing, two-phase close and partial exposure fail closed', () => {
  assert.ok(blockersOf((b) => { b.fencing.sole_writer = false; }).includes(H.FENCING_INVALID));
  assert.ok(blockersOf((b) => { b.fencing.replay_is_no_op = false; }).includes(H.FENCING_INVALID));
  assert.ok(blockersOf((b) => { b.close_protocol.mode = 'single_phase'; })
    .includes(H.TWO_PHASE_CLOSE_REQUIRED));
  assert.ok(blockersOf((b) => { b.close_protocol.partial_visible_in_current_projection = true; })
    .includes(H.PARTIAL_GENERATION_EXPOSURE_FORBIDDEN));
  assert.ok(blockersOf((b) => { b.close_protocol.finalize_within_same_share = false; })
    .includes(H.TWO_PHASE_CLOSE_REQUIRED));
});

test('manifest completeness, retention floors and the low-space stop are mandatory', () => {
  assert.ok(blockersOf((b) => { b.manifest_policy.completeness_required = false; })
    .includes(H.MANIFEST_POLICY_INVALID));
  assert.ok(blockersOf((b) => { b.manifest_policy.two_way_readback = false; })
    .includes(H.MANIFEST_POLICY_INVALID));
  assert.ok(blockersOf((b) => { b.retention.keep_generations = 1; })
    .includes(H.RETENTION_POLICY_INVALID));
  assert.ok(blockersOf((b) => { b.retention.min_free_bytes = 0; })
    .includes(H.RETENTION_POLICY_INVALID));
  assert.ok(blockersOf((b) => { b.retention.low_space_stop = false; })
    .includes(H.LOW_SPACE_STOP_REQUIRED));
});

test('acceptance cannot be self-granted and cannot overwrite production', () => {
  assert.ok(blockersOf((b) => { b.acceptance.self_accept_allowed = true; })
    .includes(H.SELF_ACCEPTANCE_FORBIDDEN));
  assert.ok(blockersOf((b) => { b.acceptance.named_human_ref = WRITER; })
    .includes(H.SELF_ACCEPTANCE_FORBIDDEN));
  assert.ok(blockersOf((b) => { b.acceptance.named_human_ref = ADMIN; })
    .includes(H.SELF_ACCEPTANCE_FORBIDDEN));
  assert.ok(blockersOf((b) => { b.acceptance.production_overwrite_allowed = true; })
    .includes(H.PRODUCTION_OVERWRITE_FORBIDDEN));
  assert.ok(blockersOf((b) => { b.acceptance.isolated_restore_required = false; })
    .includes(H.ACCEPTANCE_POLICY_INVALID));
});

test('a packet carrying a secret, a real path or an unknown key is refused before any field is read', () => {
  const secret = binding();
  secret.binding_ref = 'password: hunter2';
  assert.deepEqual(evaluateNasDrPreflight(secret, PIN).blockers, [H.SECRET_VALUE_FORBIDDEN]);

  const unc = binding();
  unc.destination.share_ref = UNC('sonartech', 'soulforge_backup');
  assert.deepEqual(evaluateNasDrPreflight(unc, PIN).blockers, [H.ABSOLUTE_PATH_FORBIDDEN]);

  const drive = binding();
  drive.binding_ref = DRIVE_LETTER_PATH;
  assert.deepEqual(evaluateNasDrPreflight(drive, PIN).blockers, [H.ABSOLUTE_PATH_FORBIDDEN]);

  const extra = binding();
  extra.nas_password = 'anything';
  assert.deepEqual(
    evaluateNasDrPreflight(extra, PIN).blockers,
    [H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN],
  );
});

test('an untrusted or missing pin cannot be supplied by the binding itself', () => {
  assert.deepEqual(evaluateNasDrPreflight(binding(), null).blockers, [H.BINDING_SHAPE_INVALID]);
  assert.deepEqual(
    evaluateNasDrPreflight(binding(), { ...PIN, minimum_epoch: 0 }).blockers,
    [H.BINDING_SHAPE_INVALID],
  );
});
