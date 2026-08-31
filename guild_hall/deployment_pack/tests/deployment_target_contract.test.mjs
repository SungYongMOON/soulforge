import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digestOf } from '../../agent_observation/guard_primitives.mjs';
import {
  DEPLOYMENT_TARGET_HOLD_CODES as H,
  DEPLOYMENT_TARGET_INPUT_SCHEMA,
  DEPLOYMENT_TARGET_RESULT_SCHEMA,
  DEPLOYMENT_TARGET_STATUS,
  MAIN_NODE_PROFILE_SCHEMA,
  evaluateDeploymentTarget,
  validateMainNodeProfile,
} from '../src/deployment_target_contract.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;

function profile() {
  return JSON.parse(readFileSync(
    new URL('../profiles/main_node.profile.json', import.meta.url),
    'utf8',
  ));
}

function sealDoctor(doctor) {
  const body = { ...doctor };
  delete body.doctor_input_digest;
  return { ...body, doctor_input_digest: digestOf(body) };
}

function targetInput() {
  const selectedProfile = profile();
  const binding = {
    pack_ref: selectedProfile.pack_ref,
    pack_digest: digest('a'),
    service_ref: selectedProfile.service_ref,
    service_digest: digest('b'),
    root_alias: selectedProfile.root_alias,
    root_digest: digest('c'),
    binding_epoch: 12,
    reboot_requested: false,
  };
  const profileDigest = digestOf(selectedProfile);
  const doctor = sealDoctor({
    doctor_input_ref: 'doctor-input:main-node-12',
    doctor_input_digest: null,
    doctor_ref: 'doctor:main-node',
    evidence_mode: 'injected_exact_evidence',
    profile_ref: selectedProfile.profile_ref,
    profile_digest: profileDigest,
    node_ref: 'node:main-node-01',
    pack_ref: binding.pack_ref,
    pack_digest: binding.pack_digest,
    service_ref: binding.service_ref,
    service_digest: binding.service_digest,
    root_alias: binding.root_alias,
    root_digest: binding.root_digest,
    binding_epoch: binding.binding_epoch,
    cell_refs: selectedProfile.cells.map((cell) => cell.cell_ref),
    startup_order: [...selectedProfile.startup_order],
    reboot_policy: 'forbidden',
    reboot_requested: false,
    external_runtime_owners: selectedProfile.external_runtime_owners.map((owner) => ({ ...owner })),
  });
  return {
    schema_version: DEPLOYMENT_TARGET_INPUT_SCHEMA,
    evaluation_ref: 'evaluation:main-node-target-12',
    profile: selectedProfile,
    profile_digest: profileDigest,
    node_ref: 'node:main-node-01',
    binding,
    doctor_input: doctor,
  };
}

function resealProfileAndDoctor(candidate) {
  candidate.profile_digest = digestOf(candidate.profile);
  candidate.doctor_input.profile_ref = candidate.profile.profile_ref;
  candidate.doctor_input.profile_digest = candidate.profile_digest;
  candidate.doctor_input.cell_refs = candidate.profile.cells.map((cell) => cell.cell_ref);
  candidate.doctor_input.startup_order = [...candidate.profile.startup_order];
  candidate.doctor_input.external_runtime_owners = candidate.profile.external_runtime_owners
    .map((owner) => ({ ...owner }));
  candidate.doctor_input = sealDoctor(candidate.doctor_input);
}

test('the checked-in Main Node profile has exactly seven cells, one startup order, no reboot, and separate Buzz/Hermes ownership', () => {
  const selectedProfile = profile();
  assert.equal(selectedProfile.schema_version, MAIN_NODE_PROFILE_SCHEMA);
  assert.equal(selectedProfile.profile_id, 'main_node');
  assert.equal(selectedProfile.cells.length, 7);
  assert.deepEqual(selectedProfile.startup_order, selectedProfile.cells.map((cell) => cell.cell_ref));
  assert.equal(selectedProfile.reboot_policy, 'forbidden');
  assert.deepEqual(selectedProfile.external_runtime_owners.map((owner) => owner.runtime_ref), [
    'external-runtime:buzz',
    'external-runtime:hermes',
  ]);
  assert.equal(new Set(selectedProfile.external_runtime_owners.map((owner) => owner.owner_ref)).size, 2);
  assert.deepEqual(validateMainNodeProfile(selectedProfile), { ok: true, problems: [] });
});

test('an exact, injected Main Node Doctor input evaluates deterministically without mutating the evidence', () => {
  const candidate = targetInput();
  const before = structuredClone(candidate);
  const first = evaluateDeploymentTarget(candidate);
  const replay = evaluateDeploymentTarget(candidate);

  assert.deepEqual(candidate, before);
  assert.deepEqual(first, replay);
  assert.equal(first.schema_version, DEPLOYMENT_TARGET_RESULT_SCHEMA);
  assert.equal(first.status, DEPLOYMENT_TARGET_STATUS.VERIFIED_MAIN_NODE_TARGET);
  assert.equal(first.effect, 'check_only');
  assert.deepEqual(first.blockers, []);
  assert.equal(first.target.doctor_input_ref, candidate.doctor_input.doctor_input_ref);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.target), true);
});

test('reboot requests, doctor drift, external runtime conflation, raw keys, wildcards, paths, and secret-like values fail closed', () => {
  const bindingReboot = targetInput();
  bindingReboot.binding.reboot_requested = true;
  assert.equal(evaluateDeploymentTarget(bindingReboot).blockers.includes(H.REBOOT_FORBIDDEN), true);

  const doctorReboot = targetInput();
  doctorReboot.doctor_input.reboot_requested = true;
  doctorReboot.doctor_input = sealDoctor(doctorReboot.doctor_input);
  assert.equal(evaluateDeploymentTarget(doctorReboot).blockers.includes(H.REBOOT_FORBIDDEN), true);

  const doctorDrift = targetInput();
  doctorDrift.doctor_input.root_digest = digest('f');
  doctorDrift.doctor_input = sealDoctor(doctorDrift.doctor_input);
  assert.equal(evaluateDeploymentTarget(doctorDrift).blockers.includes(H.DOCTOR_INPUT_MISMATCH), true);

  const conflated = targetInput();
  conflated.profile.external_runtime_owners[1].owner_ref = conflated.profile.external_runtime_owners[0].owner_ref;
  resealProfileAndDoctor(conflated);
  assert.equal(
    evaluateDeploymentTarget(conflated).blockers.includes(H.EXTERNAL_RUNTIME_CONFLATION_FORBIDDEN),
    true,
  );

  const raw = targetInput();
  raw.doctor_input.raw_payload = 'not-permitted';
  assert.equal(evaluateDeploymentTarget(raw).blockers.includes(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN), true);

  const wildcard = targetInput();
  wildcard.binding.root_alias = 'root:*';
  assert.equal(evaluateDeploymentTarget(wildcard).status, DEPLOYMENT_TARGET_STATUS.HOLD);

  const localPath = targetInput();
  localPath.binding.root_alias = 'c:' + '/runtime/main-node';
  assert.equal(evaluateDeploymentTarget(localPath).blockers.includes(H.ABSOLUTE_PATH_FORBIDDEN), true);

  const secretLike = targetInput();
  secretLike.evaluation_ref = 'sk-1234567890abcdef';
  assert.equal(evaluateDeploymentTarget(secretLike).blockers.includes(H.SECRET_VALUE_FORBIDDEN), true);
});

test('the target evaluator has no filesystem, network, clock, process, or writer surface', () => {
  const source = readFileSync(
    new URL('../src/deployment_target_contract.mjs', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'node:fs', 'node:http', 'node:https', 'node:net', 'fetch(', 'Date.now(', 'new Date(',
    'process.env', 'writeFile', 'appendFile', 'mkdir', 'spawn(', 'exec(', 'localStorage',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
