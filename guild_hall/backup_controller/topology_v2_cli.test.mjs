import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import {
  DRAFT_SCHEMA,
  collectForbiddenRoots,
  validateOutputDestination,
  writeCreateOnlyAtomic,
} from './topology_v2_cli.mjs';

function makeTempDir(label) {
  return mkdtempSync(join(tmpdir(), `soulforge-test-${label}-`));
}

function sampleDraft(controlDir, overrides = {}) {
  const runtimeRoot = join(controlDir, 'installed-runtime');
  const erpRoot = join(controlDir, 'erp-root');
  const erpData = join(erpRoot, 'dev-erp.db');
  const cMeta = join(controlDir, 'c-workmeta');
  const cState = join(controlDir, 'c-private-state');
  const dWorkspace = join(controlDir, 'd-workspaces');
  const dWorkmeta = join(controlDir, 'd-workmeta');
  const rollback = join(controlDir, 'rollback');

  return {
    schema_version: DRAFT_SCHEMA,
    binding_epoch: 1,
    evaluation_ref: 'evaluation.backup-topology-v2.check',
    clock_ref: 'clock.host.utc',
    receipt_ref: 'receipt.backup-topology-v2.installed-controller-readback',
    inspection_refs: {
      installed_controller_runtime: 'inspection.backup-topology-v2.installed-controller-runtime',
      external_erp_root: 'inspection.backup-topology-v2.external-erp-root',
      external_erp_data: 'inspection.backup-topology-v2.external-erp-data',
      c_project_metadata_transition: 'inspection.backup-topology-v2.c-project-metadata-transition',
      c_cross_project_state_transition: 'inspection.backup-topology-v2.c-cross-project-state-transition',
      d_workspace_canonical_target: 'inspection.backup-topology-v2.d-workspace-canonical-target',
      d_workmeta_canonical_target: 'inspection.backup-topology-v2.d-workmeta-canonical-target',
      rollback_target: 'inspection.backup-topology-v2.rollback-target',
    },
    installed_pack: {
      installed_root_path: runtimeRoot,
      controller_entry_relpath: 'guild_hall/backup_controller/controller.mjs',
    },
    resources: {
      installed_controller_runtime: { path: runtimeRoot, owner_ref: 'owner.runtime' },
      external_erp_root: { path: erpRoot, owner_ref: 'owner.erp' },
      external_erp_data: { path: erpData, owner_ref: 'owner.erp' },
      c_project_metadata_transition: { path: cMeta, owner_ref: 'owner.cmeta' },
      c_cross_project_state_transition: { path: cState, owner_ref: 'owner.cstate' },
      d_workspace_canonical_target: { path: dWorkspace, owner_ref: 'owner.dworkspaces' },
      d_workmeta_canonical_target: { path: dWorkmeta, owner_ref: 'owner.dworkmeta' },
      rollback_target: { path: rollback, owner_ref: 'owner.rollback' },
    },
    installed_pack_digest: `sha256:${'a'.repeat(64)}`,
    refs: {
      binding_ref: 'binding.test',
      controller_ref: 'controller.test',
      runtime_ref: 'runtime.test',
      installed_pack_ref: 'pack.test',
      installed_controller_runtime_ref: 'resource.runtime',
      external_erp_root_ref: 'resource.erproot',
      external_erp_data_ref: 'resource.erpdata',
      c_project_metadata_transition_ref: 'resource.cmeta',
      c_cross_project_state_transition_ref: 'resource.cstate',
      d_workspace_canonical_target_ref: 'resource.dworkspaces',
      d_workmeta_canonical_target_ref: 'resource.dworkmeta',
      rollback_target_ref: 'resource.rollback',
    },
    ...overrides,
  };
}

test('collectForbiddenRoots extracts all declared resource and pack paths', () => {
  const controlDir = makeTempDir('ctrl');
  try {
    const draft = sampleDraft(controlDir);
    const forbidden = collectForbiddenRoots(draft);
    assert.equal(forbidden.length, 9);
    for (const res of Object.values(draft.resources)) {
      assert.ok(forbidden.includes(resolve(res.path)));
    }
    assert.ok(forbidden.includes(resolve(draft.installed_pack.installed_root_path)));
  } finally {
    rmSync(controlDir, { recursive: true, force: true });
  }
});

test('validateOutputDestination enforces approved control directory confinement', () => {
  const controlDir = makeTempDir('ctrl');
  const otherDir = makeTempDir('other');
  try {
    const draft = sampleDraft(controlDir);
    const forbidden = collectForbiddenRoots(draft);

    // Valid destination inside approved control directory
    const validDest = join(controlDir, 'private-binding.json');
    const validCheck = validateOutputDestination({
      destination: validDest,
      approvedControlDir: controlDir,
      forbiddenRoots: forbidden,
    });
    assert.equal(validCheck.ok, true);
    assert.equal(validCheck.resolvedPath, resolve(validDest));

    // Refusal: escaping approved directory via traversal
    const escapingDest = join(controlDir, '..', 'escaped.json');
    const escapeCheck = validateOutputDestination({
      destination: escapingDest,
      approvedControlDir: controlDir,
      forbiddenRoots: forbidden,
    });
    assert.equal(escapeCheck.ok, false);
    assert.equal(escapeCheck.code, 'CONFINEMENT_ESCAPE');

    // Refusal: targeting another directory entirely
    const otherDest = join(otherDir, 'out.json');
    const otherCheck = validateOutputDestination({
      destination: otherDest,
      approvedControlDir: controlDir,
      forbiddenRoots: forbidden,
    });
    assert.equal(otherCheck.ok, false);
    assert.equal(otherCheck.code, 'CONFINEMENT_ESCAPE');

    // Refusal: destination equal to control directory itself
    const equalCheck = validateOutputDestination({
      destination: controlDir,
      approvedControlDir: controlDir,
      forbiddenRoots: forbidden,
    });
    assert.equal(equalCheck.ok, false);
    assert.equal(equalCheck.code, 'CONFINEMENT_ESCAPE');

    // Refusal: invalid/empty destination
    assert.equal(validateOutputDestination({
      destination: '',
      approvedControlDir: controlDir,
      forbiddenRoots: forbidden,
    }).ok, false);
  } finally {
    rmSync(controlDir, { recursive: true, force: true });
    rmSync(otherDir, { recursive: true, force: true });
  }
});

test('validateOutputDestination refuses protected, canonical, legacy, and source roots', () => {
  const controlDir = makeTempDir('ctrl');
  try {
    const draft = sampleDraft(controlDir);
    const forbidden = collectForbiddenRoots(draft);

    // Targeting canonical workspace target
    const workspaceDest = join(draft.resources.d_workspace_canonical_target.path, 'subfile.json');
    const wsCheck = validateOutputDestination({
      destination: workspaceDest,
      approvedControlDir: draft.resources.d_workspace_canonical_target.path,
      forbiddenRoots: forbidden,
    });
    assert.equal(wsCheck.ok, false);
    assert.ok(
      wsCheck.code === 'PROTECTED_ROOT_VIOLATION' || wsCheck.code === 'APPROVED_CONTROL_DIR_FORBIDDEN',
    );

    // Targeting legacy c_project_metadata_transition
    const metaDest = join(draft.resources.c_project_metadata_transition.path, 'out.json');
    const metaCheck = validateOutputDestination({
      destination: metaDest,
      approvedControlDir: draft.resources.c_project_metadata_transition.path,
      forbiddenRoots: forbidden,
    });
    assert.equal(metaCheck.ok, false);
    assert.ok(
      metaCheck.code === 'PROTECTED_ROOT_VIOLATION' || metaCheck.code === 'APPROVED_CONTROL_DIR_FORBIDDEN',
    );
  } finally {
    rmSync(controlDir, { recursive: true, force: true });
  }
});

test('validateOutputDestination enforces create-only semantics and refuses existing destinations', () => {
  const controlDir = makeTempDir('ctrl');
  try {
    const existingFile = join(controlDir, 'already-exists.json');
    writeFileSync(existingFile, '{"existing":true}\n');

    const check = validateOutputDestination({
      destination: existingFile,
      approvedControlDir: controlDir,
      forbiddenRoots: [],
    });
    assert.equal(check.ok, false);
    assert.equal(check.code, 'DESTINATION_EXISTS');
  } finally {
    rmSync(controlDir, { recursive: true, force: true });
  }
});

test('writeCreateOnlyAtomic writes atomically with readback and cleans up on partial failure', () => {
  const controlDir = makeTempDir('ctrl');
  try {
    const dest = join(controlDir, 'output.json');
    const content = '{"verified":true}\n';

    // 1. Successful atomic write
    writeCreateOnlyAtomic({ destination: dest, content, approvedControlDir: controlDir });
    assert.equal(existsSync(dest), true);
    assert.equal(readFileSync(dest, 'utf8'), content);

    // 2. Replay attempt fails because destination already exists (create-only)
    assert.throws(
      () => writeCreateOnlyAtomic({ destination: dest, content: '{"tamper":true}\n', approvedControlDir: controlDir }),
      /destination already exists/,
    );
    // Original content remains unaltered
    assert.equal(readFileSync(dest, 'utf8'), content);

    // 3. No orphan temporary files remain in control directory
    const entries = existsSync(controlDir);
    assert.equal(entries, true);
  } finally {
    rmSync(controlDir, { recursive: true, force: true });
  }
});
