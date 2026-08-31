import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digestOf } from '../../agent_observation/guard_primitives.mjs';
import {
  RELOCATION_HANDOFF_HOLD_CODES as H,
  RELOCATION_HANDOFF_INPUT_SCHEMA,
  RELOCATION_HANDOFF_RESULT_SCHEMA,
  RELOCATION_HANDOFF_STATUS,
  evaluateRelocationHandoff,
} from '../src/relocation_handoff_contract.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;

function seal(record, digestField = 'receipt_digest') {
  const body = { ...record };
  delete body[digestField];
  return { ...body, [digestField]: digestOf(body) };
}

function binding({ ref, root, rootDigest, epoch, digestCharacter }) {
  return seal({
    binding_ref: ref,
    binding_digest: null,
    root_alias: root,
    root_digest: rootDigest,
    pack_ref: 'pack:main-node/v1',
    pack_digest: digest('a'),
    service_ref: 'service:main-node-control/v1',
    service_digest: digest(digestCharacter),
    binding_epoch: epoch,
  }, 'binding_digest');
}

function readyHandoff() {
  const handoffEpoch = 42;
  const oldBinding = binding({
    ref: 'binding:main-node-old', root: 'root:main-node-old', rootDigest: digest('b'),
    epoch: handoffEpoch - 1, digestCharacter: 'c',
  });
  const newBinding = binding({
    ref: 'binding:main-node-new', root: 'root:main-node-new', rootDigest: digest('d'),
    epoch: handoffEpoch, digestCharacter: 'e',
  });
  const backupContentDigest = digest('f');
  const backup = seal({
    receipt_ref: 'receipt:verified-backup-42',
    receipt_digest: null,
    stage: 1,
    handoff_epoch: handoffEpoch,
    source_binding_ref: oldBinding.binding_ref,
    source_binding_digest: oldBinding.binding_digest,
    source_root_alias: oldBinding.root_alias,
    source_root_digest: oldBinding.root_digest,
    backup_content_digest: backupContentDigest,
    state: 'verified_backup',
    reboot_requested: false,
  });
  const copy = seal({
    receipt_ref: 'receipt:candidate-copy-readback-42',
    receipt_digest: null,
    stage: 2,
    handoff_epoch: handoffEpoch,
    source_backup_receipt_ref: backup.receipt_ref,
    source_backup_receipt_digest: backup.receipt_digest,
    source_binding_ref: oldBinding.binding_ref,
    source_binding_digest: oldBinding.binding_digest,
    candidate_binding_ref: newBinding.binding_ref,
    candidate_binding_digest: newBinding.binding_digest,
    source_root_digest: oldBinding.root_digest,
    candidate_root_digest: newBinding.root_digest,
    backup_content_digest: backupContentDigest,
    candidate_content_digest: backupContentDigest,
    exact_readback: true,
    state: 'candidate_copy_readback_verified',
    reboot_requested: false,
  });
  const doctor = seal({
    receipt_ref: 'receipt:offline-doctor-42',
    receipt_digest: null,
    stage: 3,
    handoff_epoch: handoffEpoch,
    doctor_input_ref: 'doctor-input:main-node-42',
    doctor_input_digest: digest('1'),
    candidate_binding_ref: newBinding.binding_ref,
    candidate_binding_digest: newBinding.binding_digest,
    candidate_root_alias: newBinding.root_alias,
    candidate_root_digest: newBinding.root_digest,
    candidate_content_digest: backupContentDigest,
    state: 'offline_doctor_healthy',
    reboot_requested: false,
  });
  const oldStop = seal({
    receipt_ref: 'receipt:old-stop-42',
    receipt_digest: null,
    stage: 4,
    handoff_epoch: handoffEpoch,
    binding_ref: oldBinding.binding_ref,
    binding_digest: oldBinding.binding_digest,
    root_alias: oldBinding.root_alias,
    root_digest: oldBinding.root_digest,
    state: 'stopped',
    reboot_requested: false,
  });
  const pointer = seal({
    receipt_ref: 'receipt:pointer-switch-42',
    receipt_digest: null,
    stage: 5,
    handoff_epoch: handoffEpoch,
    pointer_ref: 'pointer:main-node-active',
    pointer_digest: digest('2'),
    old_binding_ref: oldBinding.binding_ref,
    old_binding_digest: oldBinding.binding_digest,
    new_binding_ref: newBinding.binding_ref,
    new_binding_digest: newBinding.binding_digest,
    state: 'switched',
    reboot_requested: false,
  });
  const newStart = seal({
    receipt_ref: 'receipt:new-start-health-42',
    receipt_digest: null,
    stage: 6,
    handoff_epoch: handoffEpoch,
    binding_ref: newBinding.binding_ref,
    binding_digest: newBinding.binding_digest,
    root_alias: newBinding.root_alias,
    root_digest: newBinding.root_digest,
    startup_state: 'started',
    health_state: 'healthy',
    reboot_requested: false,
  });
  const rollback = seal({
    receipt_ref: 'receipt:rollback-ready-42',
    receipt_digest: null,
    stage: 7,
    handoff_epoch: handoffEpoch,
    from_binding_ref: newBinding.binding_ref,
    from_binding_digest: newBinding.binding_digest,
    to_binding_ref: oldBinding.binding_ref,
    to_binding_digest: oldBinding.binding_digest,
    state: 'verified_ready',
    reboot_requested: false,
  });
  return {
    schema_version: RELOCATION_HANDOFF_INPUT_SCHEMA,
    handoff_ref: 'handoff:main-node-r7-42',
    operation_mode: 'contract_evaluation_only',
    handoff_epoch: handoffEpoch,
    current_epoch: handoffEpoch,
    effect_boundary: {
      reboot_policy: 'forbidden',
      move_requested: false,
      delete_requested: false,
      reboot_requested: false,
    },
    external_runtime_owners: [
      {
        runtime_ref: 'external-runtime:buzz',
        owner_ref: 'owner:external-buzz',
        managed_by_main_node: false,
      },
      {
        runtime_ref: 'external-runtime:hermes',
        owner_ref: 'owner:external-hermes',
        managed_by_main_node: false,
      },
    ],
    old_binding: oldBinding,
    new_binding: newBinding,
    verified_backup: backup,
    candidate_copy_readback: copy,
    offline_doctor: doctor,
    old_stop: oldStop,
    binding_pointer_switch: pointer,
    new_start_health: newStart,
    rollback,
    active_roots: [{
      root_alias: newBinding.root_alias,
      binding_ref: newBinding.binding_ref,
      binding_digest: newBinding.binding_digest,
      state: 'active',
    }],
  };
}

test('the complete R7 receipt chain is deterministic and still check-only', () => {
  const candidate = readyHandoff();
  const before = structuredClone(candidate);
  const first = evaluateRelocationHandoff(candidate);
  const replay = evaluateRelocationHandoff(candidate);

  assert.deepEqual(candidate, before);
  assert.deepEqual(first, replay);
  assert.equal(first.schema_version, RELOCATION_HANDOFF_RESULT_SCHEMA);
  assert.equal(first.status, RELOCATION_HANDOFF_STATUS.VERIFIED_R7_HANDOFF);
  assert.equal(first.effect, 'check_only');
  assert.deepEqual(first.blockers, []);
  assert.equal(first.handoff.active_root_alias, candidate.new_binding.root_alias);
  assert.equal(first.handoff.rollback_receipt_ref, candidate.rollback.receipt_ref);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.handoff), true);
});

test('reboot requests, multi-active roots, digest drift, missing backup or rollback, stale epochs, and external runtime conflation fail closed', () => {
  const reboot = readyHandoff();
  reboot.effect_boundary.reboot_requested = true;
  assert.equal(
    evaluateRelocationHandoff(reboot).blockers.includes(H.NO_MOVE_DELETE_REBOOT_REQUIRED),
    true,
  );

  const multipleActive = readyHandoff();
  multipleActive.active_roots.push({
    root_alias: multipleActive.old_binding.root_alias,
    binding_ref: multipleActive.old_binding.binding_ref,
    binding_digest: multipleActive.old_binding.binding_digest,
    state: 'active',
  });
  assert.equal(
    evaluateRelocationHandoff(multipleActive).blockers.includes(H.SINGLE_ACTIVE_ROOT_REQUIRED),
    true,
  );

  const digestDrift = readyHandoff();
  digestDrift.candidate_copy_readback.candidate_content_digest = digest('9');
  digestDrift.candidate_copy_readback = seal(digestDrift.candidate_copy_readback);
  assert.equal(
    evaluateRelocationHandoff(digestDrift).blockers.includes(H.DIGEST_DRIFT),
    true,
  );

  const missingBackup = readyHandoff();
  delete missingBackup.verified_backup;
  assert.equal(
    evaluateRelocationHandoff(missingBackup).blockers.includes(H.VERIFIED_BACKUP_REQUIRED),
    true,
  );

  const missingRollback = readyHandoff();
  delete missingRollback.rollback;
  assert.equal(
    evaluateRelocationHandoff(missingRollback).blockers.includes(H.ROLLBACK_REQUIRED),
    true,
  );

  const staleEpoch = readyHandoff();
  staleEpoch.current_epoch += 1;
  assert.equal(evaluateRelocationHandoff(staleEpoch).blockers.includes(H.STALE_EPOCH), true);

  const conflated = readyHandoff();
  conflated.external_runtime_owners[0].managed_by_main_node = true;
  assert.equal(
    evaluateRelocationHandoff(conflated).blockers.includes(H.EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN),
    true,
  );
});

test('raw keys, wildcards, absolute paths, and secret-like values are refused before any handoff claim', () => {
  const raw = readyHandoff();
  raw.offline_doctor.raw_payload = 'not-permitted';
  assert.equal(
    evaluateRelocationHandoff(raw).blockers.includes(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN),
    true,
  );

  const wildcard = readyHandoff();
  wildcard.old_binding.root_alias = 'root:*';
  wildcard.old_binding = seal(wildcard.old_binding, 'binding_digest');
  assert.equal(evaluateRelocationHandoff(wildcard).status, RELOCATION_HANDOFF_STATUS.HOLD);

  const path = readyHandoff();
  path.new_binding.root_alias = 'c:' + '/runtime/main-node';
  assert.equal(evaluateRelocationHandoff(path).blockers.includes(H.ABSOLUTE_PATH_FORBIDDEN), true);

  const secretLike = readyHandoff();
  secretLike.handoff_ref = 'sk-1234567890abcdef';
  assert.equal(evaluateRelocationHandoff(secretLike).blockers.includes(H.SECRET_VALUE_FORBIDDEN), true);
});

test('the evaluator has no filesystem, network, clock, process, or writer surface', () => {
  const source = readFileSync(
    new URL('../src/relocation_handoff_contract.mjs', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'node:fs', 'node:http', 'node:https', 'node:net', 'fetch(', 'Date.now(', 'new Date(',
    'process.env', 'writeFile', 'appendFile', 'mkdir', 'spawn(', 'exec(', 'localStorage',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
