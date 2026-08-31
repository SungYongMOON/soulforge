import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digestOf } from '../agent_observation/guard_primitives.mjs';
import {
  DEPLOYMENT_READINESS_HOLD_CODES as H,
  DEPLOYMENT_READINESS_INPUT_SCHEMA,
  DEPLOYMENT_READINESS_RESULT_SCHEMA,
  DEPLOYMENT_READINESS_STATUS,
  evaluateDeploymentReadiness,
} from './deployment_readiness.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const NOW = '2026-09-01T00:00:00.000Z';
const OBSERVED = '2026-08-31T23:00:00.000Z';
const EXPIRES = '2026-09-01T01:00:00.000Z';
const EPOCH = 17;

function seal(record, digestField = 'receipt_digest') {
  const body = { ...record };
  delete body[digestField];
  return { ...body, [digestField]: digestOf(body) };
}

function readyEvidence(targetKind = 'main_node') {
  const targetRef = targetKind === 'main_node' ? 'node:main-node-01' : 'device:universal-client-01';
  const identity = seal({
    identity_ref: `identity:${targetKind}-17`,
    identity_digest: null,
    target_kind: targetKind,
    node_ref: targetKind === 'main_node' ? targetRef : null,
    device_ref: targetKind === 'universal_client' ? targetRef : null,
    project_scope_ref: 'project:isolated-canary',
    identity_epoch: EPOCH,
  }, 'identity_digest');
  const common = {
    target_kind: targetKind,
    target_identity_ref: identity.identity_ref,
    evidence_epoch: EPOCH,
    observed_at: OBSERVED,
    expires_at: EXPIRES,
  };
  const packDigest = digest('a');
  const sourceDigest = digest('b');
  const bindingDigest = digest('c');
  const installedPack = seal({
    receipt_ref: `receipt:${targetKind}-installed-pack`,
    receipt_digest: null,
    ...common,
    pack_ref: 'pack:isolated-canary/v1',
    expected_pack_digest: packDigest,
    installed_pack_digest: packDigest,
    readback_digest: packDigest,
    state: 'installed_readback_verified',
  });
  const preflight = seal({
    receipt_ref: `receipt:${targetKind}-preflight`,
    receipt_digest: null,
    ...common,
    project_scope_ref: identity.project_scope_ref,
    pack_ref: installedPack.pack_ref,
    pack_digest: packDigest,
    module_preflight_state: 'passed',
    product_preflight_state: 'passed',
    source_relocation_performed: false,
  });
  const serviceHealth = seal({
    receipt_ref: `receipt:${targetKind}-service-health`,
    receipt_digest: null,
    ...common,
    service_ref: `service:${targetKind}-canary/v1`,
    service_digest: digest('d'),
    source_digest: sourceDigest,
    readback_source_digest: sourceDigest,
    health_state: 'healthy',
    reboot_requested: false,
  });
  const pathBinding = seal({
    receipt_ref: `receipt:${targetKind}-path-binding`,
    receipt_digest: null,
    ...common,
    project_scope_ref: identity.project_scope_ref,
    root_alias: `root:${targetKind}-canary`,
    root_digest: digest('e'),
    current_binding_ref: `binding:${targetKind}-current`,
    current_binding_digest: bindingDigest,
    binding_epoch: EPOCH,
    state: 'current',
  });
  const backupRestore = seal({
    receipt_ref: `receipt:${targetKind}-backup-restore`,
    receipt_digest: null,
    ...common,
    project_scope_ref: identity.project_scope_ref,
    current_binding_ref: pathBinding.current_binding_ref,
    current_binding_digest: bindingDigest,
    source_digest: sourceDigest,
    backup_digest: sourceDigest,
    restore_readback_digest: sourceDigest,
    exact_backup_readback: true,
    exact_restore_readback: true,
    state: 'verified',
  });
  const rollback = seal({
    receipt_ref: `receipt:${targetKind}-rollback`,
    receipt_digest: null,
    ...common,
    project_scope_ref: identity.project_scope_ref,
    current_binding_ref: pathBinding.current_binding_ref,
    current_binding_digest: bindingDigest,
    rollback_binding_ref: `binding:${targetKind}-rollback`,
    rollback_binding_digest: digest('f'),
    state: 'verified_ready',
    reboot_requested: false,
  });
  const projectCapability = seal({
    receipt_ref: `receipt:${targetKind}-project-capability`,
    receipt_digest: null,
    ...common,
    project_scope_ref: identity.project_scope_ref,
    capability_refs: ['capability:canary', 'capability:read'],
    state: 'scoped_verified',
  });
  return {
    schema_version: DEPLOYMENT_READINESS_INPUT_SCHEMA,
    evaluation_ref: `evaluation:${targetKind}-17`,
    target_kind: targetKind,
    clock: {
      clock_ref: 'clock:injected-test',
      now_utc: NOW,
      current_epoch: EPOCH,
    },
    effect_boundary: {
      reboot_policy: 'forbidden',
      install_requested: false,
      release_requested: false,
      acceptance_requested: false,
      runtime_mutation_requested: false,
      reboot_requested: false,
    },
    identity,
    installed_pack: installedPack,
    preflight,
    service_health: serviceHealth,
    path_registry_binding: pathBinding,
    backup_restore: backupRestore,
    rollback,
    project_capability: projectCapability,
    active_roots: [{
      root_alias: pathBinding.root_alias,
      current_binding_ref: pathBinding.current_binding_ref,
      current_binding_digest: pathBinding.current_binding_digest,
      target_identity_ref: identity.identity_ref,
      state: 'active',
    }],
  };
}

test('missing current evidence is HOLD and never creates installation, release, or acceptance authority', () => {
  const result = evaluateDeploymentReadiness({
    schema_version: DEPLOYMENT_READINESS_INPUT_SCHEMA,
    evaluation_ref: 'evaluation:missing',
    target_kind: 'main_node',
  });
  assert.equal(result.status, DEPLOYMENT_READINESS_STATUS.HOLD);
  assert.equal(result.authority.install, 0);
  assert.equal(result.authority.release, 0);
  assert.equal(result.authority.acceptance, 0);
  assert.equal(result.blockers.includes(H.CLOCK_INVALID), true);
  assert.equal(result.blockers.includes(H.IDENTITY_REQUIRED), true);
  assert.equal(result.blockers.includes(H.INSTALLED_PACK_REQUIRED), true);
});

test('complete synthetic Main Node and Universal Client packets are deterministic and ready only for an isolated canary', () => {
  for (const targetKind of ['main_node', 'universal_client']) {
    const candidate = readyEvidence(targetKind);
    const before = structuredClone(candidate);
    const first = evaluateDeploymentReadiness(candidate);
    const replay = evaluateDeploymentReadiness(candidate);

    assert.deepEqual(candidate, before, targetKind);
    assert.deepEqual(first, replay, targetKind);
    assert.equal(first.schema_version, DEPLOYMENT_READINESS_RESULT_SCHEMA, targetKind);
    assert.equal(first.status, DEPLOYMENT_READINESS_STATUS.READY_FOR_ISOLATED_CANARY, targetKind);
    assert.equal(first.effect, 'check_only', targetKind);
    assert.equal(first.readiness.target_kind, targetKind, targetKind);
    assert.equal(first.authority.install, 0, targetKind);
    assert.equal(first.authority.release, 0, targetKind);
    assert.equal(first.authority.acceptance, 0, targetKind);
    assert.deepEqual(first.blockers, [], targetKind);
    assert.equal(Object.isFrozen(first), true, targetKind);
    assert.equal(Object.isFrozen(first.readiness), true, targetKind);
  }
});

test('reboot, multi-active roots, stale epochs, digest drift, foreign scope, and secret-like evidence fail closed', () => {
  const reboot = readyEvidence();
  reboot.effect_boundary.reboot_requested = true;
  assert.equal(
    evaluateDeploymentReadiness(reboot).blockers.includes(H.EFFECT_BOUNDARY_FORBIDDEN),
    true,
  );

  const multipleActive = readyEvidence();
  multipleActive.active_roots.push({
    root_alias: 'root:other',
    current_binding_ref: 'binding:other',
    current_binding_digest: digest('9'),
    target_identity_ref: multipleActive.identity.identity_ref,
    state: 'active',
  });
  assert.equal(
    evaluateDeploymentReadiness(multipleActive).blockers.includes(H.SINGLE_ACTIVE_ROOT_REQUIRED),
    true,
  );

  const stale = readyEvidence();
  stale.path_registry_binding.binding_epoch -= 1;
  stale.path_registry_binding = seal(stale.path_registry_binding);
  assert.equal(evaluateDeploymentReadiness(stale).blockers.includes(H.STALE_EVIDENCE), true);

  const packDrift = readyEvidence();
  packDrift.installed_pack.readback_digest = digest('8');
  packDrift.installed_pack = seal(packDrift.installed_pack);
  assert.equal(
    evaluateDeploymentReadiness(packDrift).blockers.includes(H.PACK_DIGEST_MISMATCH),
    true,
  );

  const foreignScope = readyEvidence();
  foreignScope.project_capability.project_scope_ref = 'project:foreign';
  foreignScope.project_capability = seal(foreignScope.project_capability);
  assert.equal(
    evaluateDeploymentReadiness(foreignScope).blockers.includes(H.PROJECT_SCOPE_MISMATCH),
    true,
  );

  const secretLike = readyEvidence();
  secretLike.evaluation_ref = 'sk-1234567890abcdef';
  assert.equal(
    evaluateDeploymentReadiness(secretLike).blockers.includes(H.SECRET_VALUE_FORBIDDEN),
    true,
  );
});

test('hostile getters, proxies, raw keys, and absolute paths are refused without I/O', () => {
  const accessor = readyEvidence();
  Object.defineProperty(accessor, 'identity', {
    enumerable: true,
    get() { throw new Error('getter must not run'); },
  });
  assert.doesNotThrow(() => evaluateDeploymentReadiness(accessor));
  assert.equal(
    evaluateDeploymentReadiness(accessor).blockers.includes(H.ACCESSOR_PROPERTY_FORBIDDEN),
    true,
  );

  assert.doesNotThrow(() => evaluateDeploymentReadiness(new Proxy(readyEvidence(), {})));
  assert.equal(
    evaluateDeploymentReadiness(new Proxy(readyEvidence(), {})).blockers.includes(H.HOSTILE_INPUT_REFUSED),
    true,
  );

  const raw = readyEvidence();
  raw.service_health.raw_payload = 'not-permitted';
  assert.equal(
    evaluateDeploymentReadiness(raw).blockers.includes(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN),
    true,
  );

  const localPath = readyEvidence();
  localPath.path_registry_binding.root_alias = 'c:' + '/runtime/main-node';
  assert.equal(
    evaluateDeploymentReadiness(localPath).blockers.includes(H.ABSOLUTE_PATH_FORBIDDEN),
    true,
  );
});

test('the deployment readiness evaluator has no filesystem, network, clock, process, or writer surface', () => {
  const source = readFileSync(new URL('./deployment_readiness.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    'node:fs', 'node:http', 'node:https', 'node:net', 'fetch(', 'Date.now(', 'new Date(',
    'process.env', 'writeFile', 'appendFile', 'mkdir', 'spawn(', 'exec(', 'localStorage',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
