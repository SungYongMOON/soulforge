import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digestOf } from '../agent_observation/guard_primitives.mjs';
import {
  BACKUP_TOPOLOGY_V2_BINDING_SCHEMA,
  BACKUP_TOPOLOGY_V2_HOLD_CODES as H,
  BACKUP_TOPOLOGY_V2_PREFLIGHT_INPUT_SCHEMA,
  BACKUP_TOPOLOGY_V2_PREFLIGHT_RESULT_SCHEMA,
  BACKUP_TOPOLOGY_V2_PREFLIGHT_STATUS,
  evaluateBackupTopologyPreflightV2,
  validateBackupTopologyBindingV2,
} from './preflight_v2.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const NOW = '2026-09-01T00:00:00.000Z';
const EPOCH = 21;

function seal(record, digestField = 'receipt_digest') {
  const body = { ...record };
  delete body[digestField];
  return { ...body, [digestField]: digestOf(body) };
}

function binding() {
  const body = {
    schema_version: BACKUP_TOPOLOGY_V2_BINDING_SCHEMA,
    controller_id: 'soulforge-backup-controller',
    feature_state: 'off',
    binding_ref: 'binding:backup-topology-v2',
    binding_digest: null,
    binding_epoch: EPOCH,
    fallback_allowed: false,
    installed_controller: {
      controller_owner_ref: 'owner:controller-runtime',
      owner_epoch: EPOCH,
      controller_ref: 'controller:backup-controller-v2',
      runtime_ref: 'runtime:pack-0-1-4',
      runtime_digest: digest('a'),
      runtime_root_ref: 'root:d-runtime-pack',
      runtime_root_digest: digest('b'),
      installed_pack_ref: 'pack:backup-recovery-extension-0-1-4',
      installed_pack_digest: digest('c'),
    },
    external_erp_data_owner: {
      owner_ref: 'owner:external-erp-data',
      owner_epoch: EPOCH,
      source_plane: 'external_d_data',
      data_kind: 'file',
      data_ref: 'data:erp-db-active',
      data_digest: digest('d'),
      source_root_kind: 'directory',
      source_root_ref: 'root:external-erp-db',
      source_root_digest: digest('e'),
      fallback_allowed: false,
    },
    transition_metadata_owners: [
      {
        source_id: 'c_project_metadata_transition',
        owner_ref: 'owner:c-project-metadata',
        owner_epoch: EPOCH,
        source_plane: 'c_transition',
        source_ref: 'metadata:c-project-transition',
        source_digest: digest('f'),
        source_root_ref: 'root:c-workmeta-transition',
        source_root_digest: digest('1'),
        source_state: 'legacy_transition_source',
        fallback_allowed: false,
      },
      {
        source_id: 'c_cross_project_state_transition',
        owner_ref: 'owner:c-cross-project-state',
        owner_epoch: EPOCH,
        source_plane: 'c_transition',
        source_ref: 'state:c-private-transition',
        source_digest: digest('2'),
        source_root_ref: 'root:c-private-state-transition',
        source_root_digest: digest('3'),
        source_state: 'legacy_transition_source',
        fallback_allowed: false,
      },
    ],
    canonical_targets: [
      {
        target_id: 'd_workspace_canonical_target',
        owner_ref: 'owner:d-workspace-canonical',
        owner_epoch: EPOCH,
        target_plane: 'd_canonical',
        target_ref: 'target:d-workspaces-canonical',
        target_digest: digest('4'),
        target_root_ref: 'root:d-workspaces-canonical',
        target_root_digest: digest('5'),
        target_state: 'empty_canonical_only',
        source_eligible: false,
      },
      {
        target_id: 'd_workmeta_canonical_target',
        owner_ref: 'owner:d-workmeta-canonical',
        owner_epoch: EPOCH,
        target_plane: 'd_canonical',
        target_ref: 'target:d-workmeta-canonical',
        target_digest: digest('6'),
        target_root_ref: 'root:d-workmeta-canonical',
        target_root_digest: digest('7'),
        target_state: 'empty_canonical_only',
        source_eligible: false,
      },
    ],
    rollback_target: {
      owner_ref: 'owner:rollback-target',
      owner_epoch: EPOCH,
      rollback_ref: 'rollback:empty-isolated-v1',
      rollback_digest: digest('8'),
      rollback_root_ref: 'root:rollback-isolated-empty',
      rollback_root_digest: digest('9'),
      state: 'verified_empty_rollback_target',
    },
  };
  return seal(body, 'binding_digest');
}

function expectedResources(selectedBinding) {
  return [
    ['installed_controller_runtime', selectedBinding.installed_controller.runtime_root_ref,
      selectedBinding.installed_controller.runtime_root_digest,
      selectedBinding.installed_controller.controller_owner_ref, 'directory', null],
    ['external_erp_root', selectedBinding.external_erp_data_owner.source_root_ref,
      selectedBinding.external_erp_data_owner.source_root_digest,
      selectedBinding.external_erp_data_owner.owner_ref, 'directory', null],
    ['external_erp_data', selectedBinding.external_erp_data_owner.data_ref,
      selectedBinding.external_erp_data_owner.data_digest,
      selectedBinding.external_erp_data_owner.owner_ref, 'file', 'external_erp_root'],
    ...selectedBinding.transition_metadata_owners.map((source) => [
      source.source_id, source.source_root_ref, source.source_root_digest, source.owner_ref, 'directory', null,
    ]),
    ...selectedBinding.canonical_targets.map((target) => [
      target.target_id, target.target_root_ref, target.target_root_digest, target.owner_ref, 'directory', null,
    ]),
    ['rollback_target', selectedBinding.rollback_target.rollback_root_ref,
      selectedBinding.rollback_target.rollback_root_digest,
      selectedBinding.rollback_target.owner_ref, 'directory', null],
  ];
}

function inspection([resource_id, resource_ref, resource_digest, owner_ref, resource_kind, parent_resource_id], index) {
  return seal({
    inspection_ref: `inspection:${resource_id}`,
    inspection_digest: null,
    resource_id,
    resource_ref,
    resource_digest,
    owner_ref,
    owner_epoch: EPOCH,
    resource_kind,
    realpath_digest: digest(String(index + 1)),
    is_symlink: false,
    reparse_tag: null,
    parent_resource_id,
    overlap_resource_ids: [],
    state: 'verified_distinct',
    evidence_epoch: EPOCH,
  }, 'inspection_digest');
}

function readyEvidence() {
  const selectedBinding = binding();
  const installed = selectedBinding.installed_controller;
  const readback = seal({
    receipt_ref: 'receipt:installed-controller-readback',
    receipt_digest: null,
    binding_ref: selectedBinding.binding_ref,
    binding_digest: selectedBinding.binding_digest,
    controller_ref: installed.controller_ref,
    runtime_ref: installed.runtime_ref,
    runtime_digest: installed.runtime_digest,
    executing_runtime_root_ref: installed.runtime_root_ref,
    executing_runtime_root_digest: installed.runtime_root_digest,
    installed_pack_ref: installed.installed_pack_ref,
    expected_installed_pack_digest: installed.installed_pack_digest,
    observed_installed_pack_digest: installed.installed_pack_digest,
    pack_readback_digest: installed.installed_pack_digest,
    evidence_epoch: EPOCH,
    state: 'installed_readback_verified',
  });
  return {
    schema_version: BACKUP_TOPOLOGY_V2_PREFLIGHT_INPUT_SCHEMA,
    evaluation_ref: 'evaluation:backup-topology-v2',
    clock: {
      clock_ref: 'clock:injected',
      now_utc: NOW,
      current_epoch: EPOCH,
    },
    binding: selectedBinding,
    installed_controller_readback: readback,
    resource_inspections: expectedResources(selectedBinding).map(inspection),
  };
}

function resealBinding(candidate) {
  candidate.binding = seal(candidate.binding, 'binding_digest');
}

test('schema and binding require a default-OFF split of controller, external ERP, C transition metadata, D empty targets, and rollback', () => {
  const schema = JSON.parse(readFileSync(new URL('./binding_v2.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.$id, BACKUP_TOPOLOGY_V2_BINDING_SCHEMA);
  assert.equal(schema.properties.feature_state.const, 'off');
  assert.equal(schema.$defs.externalErpOwner.properties.source_plane.const, 'external_d_data');
  assert.equal(schema.$defs.externalErpOwner.properties.source_root_kind.const, 'directory');
  assert.equal(schema.$defs.externalErpOwner.properties.data_kind.const, 'file');
  assert.equal(schema.$defs.canonicalTarget.properties.target_state.const, 'empty_canonical_only');
  assert.deepEqual(validateBackupTopologyBindingV2(binding()), { ok: true, problems: [] });
});

test('exact injected topology/readback evidence is deterministic but remains default-OFF and non-authorizing', () => {
  const candidate = readyEvidence();
  const before = structuredClone(candidate);
  const first = evaluateBackupTopologyPreflightV2(candidate);
  const replay = evaluateBackupTopologyPreflightV2(candidate);

  assert.deepEqual(candidate, before);
  assert.deepEqual(first, replay);
  assert.equal(first.schema_version, BACKUP_TOPOLOGY_V2_PREFLIGHT_RESULT_SCHEMA);
  assert.equal(first.status, BACKUP_TOPOLOGY_V2_PREFLIGHT_STATUS.PREFLIGHT_OFF_READY);
  assert.equal(first.feature_state, 'off');
  assert.equal(first.activation_authority, false);
  assert.equal(first.backup_run_authorized, false);
  assert.deepEqual(first.blockers, []);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.topology), true);
});

test('default-off, no-fallback, owner/epoch pins, C/D role separation, and installed runtime identity fail closed', () => {
  const active = readyEvidence();
  active.binding.feature_state = 'on';
  resealBinding(active);
  assert.equal(
    evaluateBackupTopologyPreflightV2(active).blockers.includes(H.DEFAULT_OFF_REQUIRED),
    true,
  );

  const fallback = readyEvidence();
  fallback.binding.external_erp_data_owner.fallback_allowed = true;
  resealBinding(fallback);
  assert.equal(
    evaluateBackupTopologyPreflightV2(fallback).blockers.includes(H.FALLBACK_FORBIDDEN),
    true,
  );

  const staleOwner = readyEvidence();
  staleOwner.binding.transition_metadata_owners[0].owner_epoch -= 1;
  resealBinding(staleOwner);
  assert.equal(
    evaluateBackupTopologyPreflightV2(staleOwner).blockers.includes(H.OWNER_EPOCH_MISMATCH),
    true,
  );

  const conflated = readyEvidence();
  conflated.binding.external_erp_data_owner.owner_ref = conflated.binding.installed_controller.controller_owner_ref;
  resealBinding(conflated);
  assert.equal(
    evaluateBackupTopologyPreflightV2(conflated).blockers.includes(H.OWNER_CONFLATION_FORBIDDEN),
    true,
  );

  const canonicalSource = readyEvidence();
  canonicalSource.binding.canonical_targets[0].source_eligible = true;
  resealBinding(canonicalSource);
  assert.equal(
    evaluateBackupTopologyPreflightV2(canonicalSource).blockers.includes(H.CANONICAL_TARGET_REQUIRED),
    true,
  );

  const wrongRoot = readyEvidence();
  wrongRoot.installed_controller_readback.executing_runtime_root_ref = 'root:wrong-runtime';
  wrongRoot.installed_controller_readback = seal(wrongRoot.installed_controller_readback);
  assert.equal(
    evaluateBackupTopologyPreflightV2(wrongRoot).blockers.includes(H.EXECUTING_RUNTIME_ROOT_MISMATCH),
    true,
  );

  const packDrift = readyEvidence();
  packDrift.installed_controller_readback.pack_readback_digest = digest('0');
  packDrift.installed_controller_readback = seal(packDrift.installed_controller_readback);
  assert.equal(
    evaluateBackupTopologyPreflightV2(packDrift).blockers.includes(H.INSTALLED_PACK_DIGEST_MISMATCH),
    true,
  );
});

test('stale evidence, overlap, symlink, reparse, raw keys, paths, secrets, getters, and proxies are refused', () => {
  const stale = readyEvidence();
  stale.clock.current_epoch += 1;
  assert.equal(evaluateBackupTopologyPreflightV2(stale).blockers.includes(H.STALE_EPOCH), true);

  const overlap = readyEvidence();
  overlap.resource_inspections[1].realpath_digest = overlap.resource_inspections[0].realpath_digest;
  overlap.resource_inspections[1] = seal(overlap.resource_inspections[1], 'inspection_digest');
  assert.equal(
    evaluateBackupTopologyPreflightV2(overlap).blockers.includes(H.TOPOLOGY_OVERLAP_FORBIDDEN),
    true,
  );

  const erpDataDrift = readyEvidence();
  erpDataDrift.resource_inspections[2].resource_digest = digest('0');
  erpDataDrift.resource_inspections[2] = seal(erpDataDrift.resource_inspections[2], 'inspection_digest');
  assert.equal(
    evaluateBackupTopologyPreflightV2(erpDataDrift).blockers.includes(H.RESOURCE_BINDING_MISMATCH),
    true,
  );

  const erpFileRootConflation = readyEvidence();
  erpFileRootConflation.resource_inspections[2].parent_resource_id = null;
  erpFileRootConflation.resource_inspections[2].resource_kind = 'directory';
  erpFileRootConflation.resource_inspections[2] = seal(
    erpFileRootConflation.resource_inspections[2],
    'inspection_digest',
  );
  assert.equal(
    evaluateBackupTopologyPreflightV2(erpFileRootConflation).blockers.includes(H.RESOURCE_BINDING_MISMATCH),
    true,
  );

  const erpContainmentOverlap = readyEvidence();
  erpContainmentOverlap.resource_inspections[2].overlap_resource_ids = ['external_erp_root'];
  erpContainmentOverlap.resource_inspections[2] = seal(
    erpContainmentOverlap.resource_inspections[2],
    'inspection_digest',
  );
  assert.equal(
    evaluateBackupTopologyPreflightV2(erpContainmentOverlap)
      .blockers.includes(H.TOPOLOGY_OVERLAP_FORBIDDEN),
    true,
  );

  const symlink = readyEvidence();
  symlink.resource_inspections[2].is_symlink = true;
  symlink.resource_inspections[2] = seal(symlink.resource_inspections[2], 'inspection_digest');
  assert.equal(
    evaluateBackupTopologyPreflightV2(symlink).blockers.includes(H.SYMLINK_FORBIDDEN),
    true,
  );

  const reparse = readyEvidence();
  reparse.resource_inspections[3].reparse_tag = 'reparse:unexpected';
  reparse.resource_inspections[3] = seal(reparse.resource_inspections[3], 'inspection_digest');
  assert.equal(
    evaluateBackupTopologyPreflightV2(reparse).blockers.includes(H.REPARSE_FORBIDDEN),
    true,
  );

  const raw = readyEvidence();
  raw.binding.external_erp_data_owner.raw_payload = 'not-permitted';
  assert.equal(
    evaluateBackupTopologyPreflightV2(raw).blockers.includes(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN),
    true,
  );

  const localPath = readyEvidence();
  localPath.binding.external_erp_data_owner.source_root_ref = ['c:', 'external', 'data'].join('/');
  assert.equal(
    evaluateBackupTopologyPreflightV2(localPath).blockers.includes(H.ABSOLUTE_PATH_FORBIDDEN),
    true,
  );

  const secretLike = readyEvidence();
  secretLike.evaluation_ref = 'sk-1234567890abcdef';
  assert.equal(
    evaluateBackupTopologyPreflightV2(secretLike).blockers.includes(H.SECRET_VALUE_FORBIDDEN),
    true,
  );

  const accessor = readyEvidence();
  Object.defineProperty(accessor, 'binding', {
    enumerable: true,
    get() { throw new Error('getter must not run'); },
  });
  assert.doesNotThrow(() => evaluateBackupTopologyPreflightV2(accessor));
  assert.equal(
    evaluateBackupTopologyPreflightV2(accessor).blockers.includes(H.ACCESSOR_PROPERTY_FORBIDDEN),
    true,
  );

  assert.equal(
    evaluateBackupTopologyPreflightV2(new Proxy(readyEvidence(), {})).blockers.includes(H.HOSTILE_INPUT_REFUSED),
    true,
  );
});

test('the v2 preflight has no filesystem, network, clock, process, or writer surface', () => {
  const source = readFileSync(new URL('./preflight_v2.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    'node:fs', 'node:http', 'node:https', 'node:net', 'fetch(', 'Date.now(', 'new Date(',
    'process.env', 'writeFile', 'appendFile', 'mkdir', 'spawn(', 'exec(', 'localStorage',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
