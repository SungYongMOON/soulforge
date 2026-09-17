import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { hasLocalPath, hasSecret } from '../agent_observation/guard_primitives.mjs';
import { recomputePackDigest } from '../shared/pack_digest_recipe.mjs';
import { evaluateBackupTopologyPreflightV2 } from './preflight_v2.mjs';
import {
  TOPOLOGY_V2_ACTUAL_READER_HOLD_CODES as HC,
  TOPOLOGY_V2_ACTUAL_READER_STATUS,
  TOPOLOGY_V2_PRIVATE_BINDING_SCHEMA,
  TOPOLOGY_V2_RESOURCE_IDS,
  buildTopologyV2Evidence,
  computeRealpathDigest,
  computeResourceIdentityDigest,
  generatePublicBindingV2,
  pathIdentity,
} from './topology_v2_actual_reader.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
// Fixture paths are assembled from parts: a literal drive-rooted path in
// tracked source bytes is a path-policy violation, and these fixtures are
// deliberately win32-shaped.
const SEP = '\\';
const winPath = (driveLetter, ...segments) => `${driveLetter}:${SEP}${segments.join(SEP)}`;
const winIdentity = (driveLetter, ...segments) => `${driveLetter.toLowerCase()}:/${segments.join('/')}`;
const key = (path) => path.replace(/\\/gu, '/').toLowerCase().replace(/(.)\/+$/u, '$1');

const PACK_ROOT = winPath('D', 'Soulforge', 'install', 'backup-recovery-pack', '0.1.2');
const CONTROLLER_RELPATH = 'guild_hall/backup_controller/controller.mjs';
const PAYLOAD_FILES = [
  { path: CONTROLLER_RELPATH, content: 'export const controller = true;\n' },
  { path: 'guild_hall/backup_controller/README.md', content: '# backup controller\n' },
];

const RESOURCE_PATHS = {
  installed_controller_runtime: PACK_ROOT,
  external_erp_root: winPath('D', 'Soulforge-data', 'runtime', 'erp'),
  external_erp_data: winPath('D', 'Soulforge-data', 'runtime', 'erp', 'dev-erp.db'),
  c_project_metadata_transition: winPath('C', 'Soulforge', '_workmeta'),
  c_cross_project_state_transition: winPath('C', 'Soulforge', 'private-state'),
  d_workspace_canonical_target: winPath('D', 'Soulforge', '_workspaces'),
  d_workmeta_canonical_target: winPath('D', 'Soulforge', '_workmeta'),
  rollback_target: winPath('D', 'Soulforge', 'local-recovery', 'backup-controller-v2', 'rollback'),
};

const OWNER_REFS = {
  installed_controller_runtime: 'owner.backup-controller.installed-runtime',
  external_erp_root: 'owner.backup-controller.external-erp-data',
  external_erp_data: 'owner.backup-controller.external-erp-data',
  c_project_metadata_transition: 'owner.backup-controller.c-project-metadata',
  c_cross_project_state_transition: 'owner.backup-controller.c-cross-project-state',
  d_workspace_canonical_target: 'owner.backup-controller.d-workspace-canonical',
  d_workmeta_canonical_target: 'owner.backup-controller.d-workmeta-canonical',
  rollback_target: 'owner.backup-controller.rollback-target',
};

const REFS = {
  binding_ref: 'binding.backup-controller.topology-v2',
  controller_ref: 'controller.backup-controller.daily',
  runtime_ref: 'runtime.backup-controller.controller-entry',
  installed_pack_ref: 'pack.backup-recovery-extension.0-1-2',
  installed_controller_runtime_ref: 'resource.installed-controller-runtime',
  external_erp_root_ref: 'resource.external-erp-root',
  external_erp_data_ref: 'resource.external-erp-data',
  c_project_metadata_transition_ref: 'resource.c-project-metadata-transition',
  c_cross_project_state_transition_ref: 'resource.c-cross-project-state-transition',
  d_workspace_canonical_target_ref: 'resource.d-workspace-canonical-target',
  d_workmeta_canonical_target_ref: 'resource.d-workmeta-canonical-target',
  rollback_target_ref: 'resource.rollback-target',
};

const INSPECTION_REFS = Object.fromEntries(
  TOPOLOGY_V2_RESOURCE_IDS.map((id) => [id, `inspection.backup-topology-v2.${id.replace(/_/gu, '-')}`]),
);

const CLOCK = { now_utc: '2026-09-02T00:00:00.000Z', current_epoch: 1 };

function manifestEntries() {
  return PAYLOAD_FILES.map((file) => ({
    path: file.path,
    sha256: sha256(file.content),
    bytes: Buffer.byteLength(file.content),
  }));
}

function packManifest() {
  const files = manifestEntries();
  return { schema: 'soulforge.deployment_pack_manifest.v0', pack_digest: recomputePackDigest(files), files };
}

/** In-memory win32-shaped tree. `nodes` maps a normalized path to its facts. */
function makeTree(overrides = {}) {
  const nodes = new Map();
  const dir = (path, entries = []) => nodes.set(key(path), { kind: 'directory', is_symlink: false, entries });
  const file = (path, content) => nodes.set(key(path), { kind: 'file', is_symlink: false, content });

  dir(RESOURCE_PATHS.installed_controller_runtime, ['pack.manifest.json', 'payload']);
  file(`${PACK_ROOT}\\pack.manifest.json`, `${JSON.stringify(packManifest(), null, 2)}\n`);
  for (const entry of PAYLOAD_FILES) {
    file(`${PACK_ROOT}\\payload\\${entry.path.replace(/\//gu, '\\')}`, entry.content);
  }
  dir(RESOURCE_PATHS.external_erp_root, ['dev-erp.db']);
  file(RESOURCE_PATHS.external_erp_data, 'sqlite-bytes');
  dir(RESOURCE_PATHS.c_project_metadata_transition, ['system']);
  dir(RESOURCE_PATHS.c_cross_project_state_transition, ['CHANGELOG.md']);
  dir(RESOURCE_PATHS.d_workspace_canonical_target, []);
  dir(RESOURCE_PATHS.d_workmeta_canonical_target, []);
  dir(RESOURCE_PATHS.rollback_target, []);

  for (const [path, patch] of Object.entries(overrides)) {
    const existing = nodes.get(key(path));
    if (patch === null) nodes.delete(key(path));
    else nodes.set(key(path), { ...(existing ?? { kind: 'directory', is_symlink: false, entries: [] }), ...patch });
  }
  return nodes;
}

function makePort(nodes) {
  return {
    platform: 'win32',
    lstat(path) {
      const node = nodes.get(key(path));
      if (node === undefined) return { exists: false, kind: 'other', is_symlink: false };
      return { exists: true, kind: node.kind, is_symlink: node.is_symlink === true };
    },
    realpath(path) {
      const node = nodes.get(key(path));
      if (node === undefined) return null;
      return node.real ?? path;
    },
    readUtf8(path) {
      const node = nodes.get(key(path));
      return node === undefined || node.kind !== 'file' ? null : node.content;
    },
    hashFile(path) {
      const node = nodes.get(key(path));
      if (node === undefined || node.kind !== 'file') return null;
      return { sha256: sha256(node.content), bytes: Buffer.byteLength(node.content) };
    },
    listDir(path) {
      const node = nodes.get(key(path));
      return node === undefined || node.kind !== 'directory' ? null : node.entries;
    },
    joinPath(...segments) {
      return segments.join('\\');
    },
  };
}

function skeleton() {
  return {
    schema_version: TOPOLOGY_V2_PRIVATE_BINDING_SCHEMA,
    binding_epoch: 1,
    evaluation_ref: 'evaluation.backup-topology-v2.check',
    clock_ref: 'clock.host.utc',
    receipt_ref: 'receipt.backup-topology-v2.installed-controller-readback',
    inspection_refs: INSPECTION_REFS,
    installed_pack: {
      installed_root_path: PACK_ROOT,
      controller_entry_relpath: CONTROLLER_RELPATH,
    },
    resources: Object.fromEntries(TOPOLOGY_V2_RESOURCE_IDS.map((id) => [id, {
      path: RESOURCE_PATHS[id],
      owner_ref: OWNER_REFS[id],
    }])),
    public_binding: null,
  };
}

/** Author the frozen binding against a CLEAN tree, exactly as the CLI does. */
function frozenPrivateBinding() {
  const port = makePort(makeTree());
  const draft = skeleton();
  const publicBinding = generatePublicBindingV2({
    privateBinding: draft,
    port,
    refs: REFS,
    packDigest: `sha256:${packManifest().pack_digest}`,
  });
  assert.notEqual(publicBinding, null);
  return { ...draft, public_binding: publicBinding };
}

test('a clean tree produces evidence the pure judge accepts', () => {
  const privateBinding = frozenPrivateBinding();
  const read = buildTopologyV2Evidence({ privateBinding, port: makePort(makeTree()), clock: CLOCK });
  assert.equal(read.status, TOPOLOGY_V2_ACTUAL_READER_STATUS.EVIDENCE_READY);
  assert.deepEqual(read.holds, []);

  const verdict = evaluateBackupTopologyPreflightV2(read.evidence);
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.status, 'PREFLIGHT_OFF_READY');
  // A green read is still OFF evidence and grants nothing.
  assert.equal(verdict.effect, 'check_only');
  assert.equal(verdict.feature_state, 'off');
  assert.equal(verdict.activation_authority, false);
  assert.equal(verdict.backup_run_authorized, false);
});

test('every emitted string passes the shared local-path and secret guards', () => {
  const privateBinding = frozenPrivateBinding();
  const read = buildTopologyV2Evidence({ privateBinding, port: makePort(makeTree()), clock: CLOCK });
  const strings = [];
  const walk = (value) => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(read.evidence);
  assert.ok(strings.length > 0);
  for (const value of strings) {
    assert.equal(hasLocalPath(value), false, `local path leaked: ${value}`);
    assert.equal(hasSecret(value), false, 'secret leaked');
  }
  // The declared resource paths themselves never appear anywhere in the packet.
  const serialized = JSON.stringify(read.evidence);
  for (const path of Object.values(RESOURCE_PATHS)) {
    assert.equal(serialized.includes(path.replace(/\\/gu, '\\\\')), false);
  }
});

test('the readback recomputes the pack digest with the builder recipe over observed bytes', () => {
  const privateBinding = frozenPrivateBinding();
  const read = buildTopologyV2Evidence({ privateBinding, port: makePort(makeTree()), clock: CLOCK });
  const expected = `sha256:${packManifest().pack_digest}`;
  assert.equal(read.evidence.installed_controller_readback.observed_installed_pack_digest, expected);
  assert.equal(read.evidence.installed_controller_readback.pack_readback_digest, expected);
});

test('one changed installed byte moves the readback digest and the judge refuses', () => {
  const privateBinding = frozenPrivateBinding();
  const tampered = makeTree({
    [`${PACK_ROOT}\\payload\\${PAYLOAD_FILES[1].path.replace(/\//gu, '\\')}`]: {
      kind: 'file', is_symlink: false, content: '# backup controller (tampered)\n',
    },
  });
  const read = buildTopologyV2Evidence({ privateBinding, port: makePort(tampered), clock: CLOCK });
  assert.equal(read.status, TOPOLOGY_V2_ACTUAL_READER_STATUS.EVIDENCE_READY);
  const verdict = evaluateBackupTopologyPreflightV2(read.evidence);
  assert.equal(verdict.status, 'HOLD');
  assert.ok(verdict.blockers.includes('BACKUP_TOPOLOGY_V2_INSTALLED_PACK_DIGEST_MISMATCH'));
});

test('a resource that moved cannot present the frozen binding identity', () => {
  const privateBinding = frozenPrivateBinding();
  const moved = { ...privateBinding, resources: { ...privateBinding.resources } };
  const relocated = winPath('D', 'Soulforge', 'local-recovery', 'backup-controller-v2', 'rollback-moved');
  moved.resources.rollback_target = { path: relocated, owner_ref: OWNER_REFS.rollback_target };
  const tree = makeTree({ [relocated]: { kind: 'directory', is_symlink: false, entries: [] } });
  const read = buildTopologyV2Evidence({ privateBinding: moved, port: makePort(tree), clock: CLOCK });
  assert.equal(read.status, TOPOLOGY_V2_ACTUAL_READER_STATUS.EVIDENCE_READY);
  const verdict = evaluateBackupTopologyPreflightV2(read.evidence);
  assert.equal(verdict.status, 'HOLD');
  assert.ok(verdict.blockers.includes('BACKUP_TOPOLOGY_V2_RESOURCE_BINDING_MISMATCH'));
});

test('a symlinked resource and a resolution-drifted resource both stamp a reparse tag', () => {
  const privateBinding = frozenPrivateBinding();
  const linked = makeTree({
    [RESOURCE_PATHS.c_cross_project_state_transition]: {
      kind: 'directory', is_symlink: true, entries: ['CHANGELOG.md'],
    },
  });
  const linkedRead = buildTopologyV2Evidence({ privateBinding, port: makePort(linked), clock: CLOCK });
  const linkedInspection = linkedRead.evidence.resource_inspections
    .find((item) => item.resource_id === 'c_cross_project_state_transition');
  assert.equal(linkedInspection.is_symlink, true);
  assert.equal(linkedInspection.reparse_tag, 'path_resolution_drift');
  const linkedVerdict = evaluateBackupTopologyPreflightV2(linkedRead.evidence);
  assert.ok(linkedVerdict.blockers.includes('BACKUP_TOPOLOGY_V2_SYMLINK_FORBIDDEN'));
  assert.ok(linkedVerdict.blockers.includes('BACKUP_TOPOLOGY_V2_REPARSE_FORBIDDEN'));

  const drifted = makeTree({
    [RESOURCE_PATHS.c_project_metadata_transition]: {
      kind: 'directory', is_symlink: false, entries: ['system'], real: winPath('E', 'elsewhere', 'meta-elsewhere'),
    },
  });
  const driftedRead = buildTopologyV2Evidence({ privateBinding, port: makePort(drifted), clock: CLOCK });
  const driftedInspection = driftedRead.evidence.resource_inspections
    .find((item) => item.resource_id === 'c_project_metadata_transition');
  assert.equal(driftedInspection.is_symlink, false);
  assert.equal(driftedInspection.reparse_tag, 'path_resolution_drift');
  assert.ok(evaluateBackupTopologyPreflightV2(driftedRead.evidence).blockers
    .includes('BACKUP_TOPOLOGY_V2_REPARSE_FORBIDDEN'));
});

test('overlapping resources are reported, but the declared erp parent pair is not an overlap', () => {
  const clean = frozenPrivateBinding();
  const cleanRead = buildTopologyV2Evidence({ privateBinding: clean, port: makePort(makeTree()), clock: CLOCK });
  for (const inspection of cleanRead.evidence.resource_inspections) {
    assert.deepEqual(inspection.overlap_resource_ids, []);
  }
  assert.equal(
    cleanRead.evidence.resource_inspections.find((item) => item.resource_id === 'external_erp_data')
      .parent_resource_id,
    'external_erp_root',
  );

  const nested = winPath('D', 'Soulforge', 'local-recovery', 'backup-controller-v2', 'rollback', 'inner');
  const overlapping = { ...clean, resources: { ...clean.resources } };
  overlapping.resources.d_workspace_canonical_target = {
    path: nested, owner_ref: OWNER_REFS.d_workspace_canonical_target,
  };
  const tree = makeTree({ [nested]: { kind: 'directory', is_symlink: false, entries: [] } });
  const read = buildTopologyV2Evidence({ privateBinding: overlapping, port: makePort(tree), clock: CLOCK });
  const workspace = read.evidence.resource_inspections
    .find((item) => item.resource_id === 'd_workspace_canonical_target');
  assert.deepEqual(workspace.overlap_resource_ids, ['rollback_target']);
  assert.ok(evaluateBackupTopologyPreflightV2(read.evidence).blockers
    .includes('BACKUP_TOPOLOGY_V2_TOPOLOGY_OVERLAP_FORBIDDEN'));
});

test('a canonical target or rollback target with any entry holds before evidence is built', () => {
  const privateBinding = frozenPrivateBinding();
  for (const resourceId of ['d_workspace_canonical_target', 'd_workmeta_canonical_target', 'rollback_target']) {
    const tree = makeTree({
      [RESOURCE_PATHS[resourceId]]: { kind: 'directory', is_symlink: false, entries: ['stray.txt'] },
    });
    const read = buildTopologyV2Evidence({ privateBinding, port: makePort(tree), clock: CLOCK });
    assert.equal(read.status, TOPOLOGY_V2_ACTUAL_READER_STATUS.HOLD);
    assert.deepEqual(read.holds, [HC.RESOURCE_NOT_EMPTY]);
    assert.equal(read.evidence, null);
    assert.ok(read.detail.some((item) => item.resource_id === resourceId && item.entry_count === 1));
  }
});

test('a missing resource, a wrong kind and an unresolvable realpath each hold with their own code', () => {
  const privateBinding = frozenPrivateBinding();
  const missing = makeTree({ [RESOURCE_PATHS.rollback_target]: null });
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding, port: makePort(missing), clock: CLOCK }).holds,
    [HC.RESOURCE_MISSING],
  );

  const wrongKind = makeTree({
    [RESOURCE_PATHS.external_erp_data]: { kind: 'directory', is_symlink: false, entries: [] },
  });
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding, port: makePort(wrongKind), clock: CLOCK }).holds,
    [HC.RESOURCE_KIND_MISMATCH],
  );

  const unresolvable = makePort(makeTree());
  const shadowed = { ...unresolvable, realpath: (path) => (key(path) === key(RESOURCE_PATHS.d_workmeta_canonical_target) ? null : path) };
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding, port: shadowed, clock: CLOCK }).holds,
    [HC.RESOURCE_REALPATH_UNRESOLVED],
  );
});

test('a bad port, a bad clock and a malformed private binding refuse before any read', () => {
  const privateBinding = frozenPrivateBinding();
  assert.deepEqual(buildTopologyV2Evidence({ privateBinding, port: {}, clock: CLOCK }).holds, [HC.PORT_INVALID]);
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding, port: makePort(makeTree()), clock: { now_utc: 'nope', current_epoch: 1 } }).holds,
    [HC.CLOCK_INVALID],
  );
  const extraKey = { ...privateBinding, unexpected: true };
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding: extraKey, port: makePort(makeTree()), clock: CLOCK }).holds,
    [HC.PRIVATE_BINDING_INVALID],
  );
  const shortMap = { ...privateBinding, resources: { installed_controller_runtime: privateBinding.resources.installed_controller_runtime } };
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding: shortMap, port: makePort(makeTree()), clock: CLOCK }).holds,
    [HC.RESOURCE_MAP_INCOMPLETE],
  );
});

test('an unreadable or shape-invalid installed pack manifest holds', () => {
  const privateBinding = frozenPrivateBinding();
  const noManifest = makeTree({ [`${PACK_ROOT}\\pack.manifest.json`]: null });
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding, port: makePort(noManifest), clock: CLOCK }).holds,
    [HC.INSTALLED_PACK_MANIFEST_INVALID],
  );

  const badManifest = makeTree({
    [`${PACK_ROOT}\\pack.manifest.json`]: { kind: 'file', is_symlink: false, content: '{"pack_digest":"nope"}' },
  });
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding, port: makePort(badManifest), clock: CLOCK }).holds,
    [HC.INSTALLED_PACK_MANIFEST_INVALID],
  );

  const missingPayloadFile = makeTree({
    [`${PACK_ROOT}\\payload\\${CONTROLLER_RELPATH.replace(/\//gu, '\\')}`]: null,
  });
  assert.deepEqual(
    buildTopologyV2Evidence({ privateBinding, port: makePort(missingPayloadFile), clock: CLOCK }).holds,
    [HC.INSTALLED_PACK_READBACK_MISMATCH],
  );
});

test('path identity folds separators, trailing separators and win32 case', () => {
  const workmetaIdentity = winIdentity('D', 'soulforge', '_workmeta');
  assert.equal(pathIdentity(`${winPath('D', 'Soulforge', '_workmeta')}${SEP}`, 'win32'), workmetaIdentity);
  assert.equal(pathIdentity(winIdentity('D', 'SOULFORGE', '_workmeta'), 'win32'), workmetaIdentity);
  assert.equal(pathIdentity('/srv/Soulforge/', 'linux'), '/srv/Soulforge');
  assert.notEqual(pathIdentity('/srv/soulforge', 'linux'), pathIdentity('/srv/Soulforge', 'linux'));
});

test('resource identity binds role, owner and location; realpath identity binds location alone', () => {
  const base = {
    resourceId: 'rollback_target',
    resourceKind: 'directory',
    ownerRef: OWNER_REFS.rollback_target,
    identity: winIdentity('D', 'soulforge', 'local-recovery', 'backup-controller-v2', 'rollback'),
  };
  const digest = computeResourceIdentityDigest(base);
  assert.match(digest, /^sha256:[a-f0-9]{64}$/u);
  assert.notEqual(digest, computeResourceIdentityDigest({ ...base, ownerRef: 'owner.other' }));
  assert.notEqual(digest, computeResourceIdentityDigest({ ...base, identity: `${base.identity}-2` }));
  assert.notEqual(digest, computeRealpathDigest(base.identity));
  assert.equal(computeRealpathDigest(base.identity), computeRealpathDigest(base.identity));
});
