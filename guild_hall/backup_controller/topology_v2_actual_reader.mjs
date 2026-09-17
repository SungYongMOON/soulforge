/**
 * Backup Controller topology v2 ACTUAL reader.
 *
 * `preflight_v2.mjs` is a pure judge over an injected, public-safe evidence
 * packet. It deliberately cannot touch a filesystem. This module is the other
 * half: it turns REAL local resources into exactly that packet, and nothing
 * more.
 *
 * Boundaries this module keeps:
 * - It reads. It never creates, moves, deletes, mounts, activates a binding,
 *   writes a NAS byte, or starts a controller.
 * - Absolute paths live only in the injected private binding and inside this
 *   module's own locals. Every value it EMITS is a ref, a digest, a boolean,
 *   an epoch or an enum, so the emitted packet stays public-safe and survives
 *   `guardEntry`'s local-path and secret scans.
 * - The public-safe v2 binding is NOT regenerated per run. It is carried
 *   frozen inside the private binding, and every run re-derives resource
 *   identity from OBSERVED state and compares. A resource that moved, became
 *   a link, gained a reparse point, or started overlapping another resource
 *   fails closed against the frozen expectation.
 * - A clean read is still `feature_state: off` evidence. It authorizes no
 *   activation and no backup.
 */

import { digestOf } from '../agent_observation/guard_primitives.mjs';
import { recomputePackDigest } from '../shared/pack_digest_recipe.mjs';

export const TOPOLOGY_V2_PRIVATE_BINDING_SCHEMA =
  'soulforge.backup_controller.topology_v2_private_binding.v0';
export const TOPOLOGY_V2_ACTUAL_READER_SCHEMA =
  'soulforge.backup_controller.topology_v2_actual_reader.v0';

export const TOPOLOGY_V2_ACTUAL_READER_STATUS = Object.freeze({
  HOLD: 'HOLD',
  EVIDENCE_READY: 'EVIDENCE_READY',
});

export const TOPOLOGY_V2_ACTUAL_READER_HOLD_CODES = Object.freeze({
  PORT_INVALID: 'TOPOLOGY_V2_ACTUAL_PORT_INVALID',
  CLOCK_INVALID: 'TOPOLOGY_V2_ACTUAL_CLOCK_INVALID',
  PRIVATE_BINDING_INVALID: 'TOPOLOGY_V2_ACTUAL_PRIVATE_BINDING_INVALID',
  RESOURCE_MAP_INCOMPLETE: 'TOPOLOGY_V2_ACTUAL_RESOURCE_MAP_INCOMPLETE',
  RESOURCE_MISSING: 'TOPOLOGY_V2_ACTUAL_RESOURCE_MISSING',
  RESOURCE_KIND_MISMATCH: 'TOPOLOGY_V2_ACTUAL_RESOURCE_KIND_MISMATCH',
  RESOURCE_REALPATH_UNRESOLVED: 'TOPOLOGY_V2_ACTUAL_RESOURCE_REALPATH_UNRESOLVED',
  RESOURCE_NOT_EMPTY: 'TOPOLOGY_V2_ACTUAL_RESOURCE_NOT_EMPTY',
  INSTALLED_PACK_MANIFEST_INVALID: 'TOPOLOGY_V2_ACTUAL_INSTALLED_PACK_MANIFEST_INVALID',
  INSTALLED_PACK_READBACK_MISMATCH: 'TOPOLOGY_V2_ACTUAL_INSTALLED_PACK_READBACK_MISMATCH',
  CONTROLLER_ENTRY_MISSING: 'TOPOLOGY_V2_ACTUAL_CONTROLLER_ENTRY_MISSING',
});

const HC = TOPOLOGY_V2_ACTUAL_READER_HOLD_CODES;

// Fixed evaluation order. preflight_v2 compares inspections positionally
// against its own expectedResources(), so this order is a contract, not a
// convenience.
export const TOPOLOGY_V2_RESOURCE_IDS = Object.freeze([
  'installed_controller_runtime',
  'external_erp_root',
  'external_erp_data',
  'c_project_metadata_transition',
  'c_cross_project_state_transition',
  'd_workspace_canonical_target',
  'd_workmeta_canonical_target',
  'rollback_target',
]);

const RESOURCE_KIND = Object.freeze({
  installed_controller_runtime: 'directory',
  external_erp_root: 'directory',
  external_erp_data: 'file',
  c_project_metadata_transition: 'directory',
  c_cross_project_state_transition: 'directory',
  d_workspace_canonical_target: 'directory',
  d_workmeta_canonical_target: 'directory',
  rollback_target: 'directory',
});

// The one declared containment pair. Everything else that contains or is
// contained by another bound resource is an overlap.
const DECLARED_PARENT = Object.freeze({ external_erp_data: 'external_erp_root' });

// Resources whose contract says "empty": the two canonical targets are
// `empty_canonical_only` and the rollback target is
// `verified_empty_rollback_target`. Emptiness is checked here because the
// pure judge cannot look.
const MUST_BE_EMPTY = Object.freeze([
  'd_workspace_canonical_target',
  'd_workmeta_canonical_target',
  'rollback_target',
]);

const PRIVATE_BINDING_FIELDS = Object.freeze([
  'schema_version', 'binding_epoch', 'evaluation_ref', 'clock_ref', 'receipt_ref',
  'inspection_refs', 'installed_pack', 'resources', 'public_binding',
]);
const INSTALLED_PACK_FIELDS = Object.freeze([
  'installed_root_path', 'controller_entry_relpath',
]);
const RESOURCE_FIELDS = Object.freeze(['path', 'owner_ref']);
const PORT_METHODS = Object.freeze(['lstat', 'realpath', 'readUtf8', 'hashFile', 'listDir', 'joinPath']);

const SHA256_PREFIXED = /^sha256:[a-f0-9]{64}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function exactKeys(value, fields) {
  return isPlainObject(value) && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

/**
 * The comparison identity for a physical path: separator-normalized, trailing
 * separators dropped, and case-folded on win32 where the filesystem is
 * case-insensitive. Two spellings of one location must collapse to one
 * identity or the overlap check would be trivially bypassable.
 */
export function pathIdentity(value, platform) {
  const normalized = String(value).replace(/\\/gu, '/').replace(/(.)\/+$/u, '$1');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function computeRealpathDigest(identity) {
  return digestOf({ path_identity: identity });
}

/**
 * The identity a bound resource must keep. It folds the resource's role, its
 * declared owner, its kind and WHERE IT ACTUALLY RESOLVES into one digest, so
 * a resource that silently moved cannot present the binding's digest.
 */
export function computeResourceIdentityDigest({ resourceId, resourceKind, ownerRef, identity }) {
  return digestOf({
    resource_id: resourceId,
    resource_kind: resourceKind,
    owner_ref: ownerRef,
    path_identity: identity,
  });
}

function contains(parentIdentity, childIdentity) {
  return childIdentity.startsWith(`${parentIdentity}/`);
}

function validPort(port) {
  return isPlainObject(port)
    && (port.platform === 'win32' || port.platform === 'darwin' || port.platform === 'linux')
    && PORT_METHODS.every((method) => typeof port[method] === 'function');
}

function validClock(clock) {
  return isPlainObject(clock)
    && typeof clock.now_utc === 'string' && UTC_MS.test(clock.now_utc)
    && Number.isSafeInteger(clock.current_epoch) && clock.current_epoch > 0;
}

function validPrivateBinding(binding) {
  if (!exactKeys(binding, PRIVATE_BINDING_FIELDS)) return false;
  if (binding.schema_version !== TOPOLOGY_V2_PRIVATE_BINDING_SCHEMA) return false;
  if (!Number.isSafeInteger(binding.binding_epoch) || binding.binding_epoch < 1) return false;
  if (typeof binding.evaluation_ref !== 'string' || typeof binding.clock_ref !== 'string'
    || typeof binding.receipt_ref !== 'string') return false;
  if (!exactKeys(binding.installed_pack, INSTALLED_PACK_FIELDS)) return false;
  if (typeof binding.installed_pack.installed_root_path !== 'string'
    || typeof binding.installed_pack.controller_entry_relpath !== 'string') return false;
  if (!isPlainObject(binding.inspection_refs)
    || !TOPOLOGY_V2_RESOURCE_IDS.every((id) => typeof binding.inspection_refs[id] === 'string')
    || Object.keys(binding.inspection_refs).length !== TOPOLOGY_V2_RESOURCE_IDS.length) return false;
  if (!isPlainObject(binding.public_binding)) return false;
  if (!isPlainObject(binding.resources)) return false;
  return true;
}

function resourceMapComplete(resources) {
  if (Object.keys(resources).length !== TOPOLOGY_V2_RESOURCE_IDS.length) return false;
  return TOPOLOGY_V2_RESOURCE_IDS.every((id) => exactKeys(resources[id], RESOURCE_FIELDS)
    && typeof resources[id].path === 'string' && resources[id].path.length > 0
    && typeof resources[id].owner_ref === 'string');
}

function hold(holds, evaluatedAt) {
  return Object.freeze({
    schema_version: TOPOLOGY_V2_ACTUAL_READER_SCHEMA,
    status: TOPOLOGY_V2_ACTUAL_READER_STATUS.HOLD,
    effect: 'read_only',
    evaluated_at: evaluatedAt,
    holds: Object.freeze([...new Set(holds)].sort()),
    detail: Object.freeze([]),
    evidence: null,
  });
}

/**
 * Inspect every bound resource and emit the preflight_v2 evidence packet.
 *
 * @param {object} args
 * @param {object} args.privateBinding parsed private binding (carries absolute paths)
 * @param {object} args.port injected filesystem port
 * @param {object} args.clock `{ now_utc, current_epoch }`
 */
export function buildTopologyV2Evidence({ privateBinding, port, clock } = {}) {
  if (!validPort(port)) return hold([HC.PORT_INVALID], null);
  if (!validClock(clock)) return hold([HC.CLOCK_INVALID], null);
  const evaluatedAt = clock.now_utc;
  if (!validPrivateBinding(privateBinding)) return hold([HC.PRIVATE_BINDING_INVALID], evaluatedAt);
  if (!resourceMapComplete(privateBinding.resources)) {
    return hold([HC.RESOURCE_MAP_INCOMPLETE], evaluatedAt);
  }

  const holds = [];
  const detail = [];
  const observed = new Map();

  for (const resourceId of TOPOLOGY_V2_RESOURCE_IDS) {
    const declared = privateBinding.resources[resourceId];
    const expectedKind = RESOURCE_KIND[resourceId];
    const stat = port.lstat(declared.path);
    if (!isPlainObject(stat) || stat.exists !== true) {
      holds.push(HC.RESOURCE_MISSING);
      detail.push({ resource_id: resourceId, hold: HC.RESOURCE_MISSING });
      continue;
    }
    if (stat.kind !== expectedKind) {
      holds.push(HC.RESOURCE_KIND_MISMATCH);
      detail.push({ resource_id: resourceId, hold: HC.RESOURCE_KIND_MISMATCH, observed_kind: stat.kind });
      continue;
    }
    const real = port.realpath(declared.path);
    if (typeof real !== 'string' || real.length === 0) {
      holds.push(HC.RESOURCE_REALPATH_UNRESOLVED);
      detail.push({ resource_id: resourceId, hold: HC.RESOURCE_REALPATH_UNRESOLVED });
      continue;
    }
    const declaredIdentity = pathIdentity(declared.path, port.platform);
    const realIdentity = pathIdentity(real, port.platform);
    // Node cannot read a Windows reparse tag. `is_symlink` covers symlinks and
    // junctions; resolution drift covers a reparse point anywhere in the
    // ancestry. Either one makes the tag non-null and the judge refuses.
    const reparseTag = stat.is_symlink === true || realIdentity !== declaredIdentity
      ? 'path_resolution_drift'
      : null;
    if (MUST_BE_EMPTY.includes(resourceId)) {
      const entries = port.listDir(declared.path);
      if (!Array.isArray(entries) || entries.length > 0) {
        holds.push(HC.RESOURCE_NOT_EMPTY);
        detail.push({
          resource_id: resourceId,
          hold: HC.RESOURCE_NOT_EMPTY,
          entry_count: Array.isArray(entries) ? entries.length : null,
        });
        continue;
      }
    }
    observed.set(resourceId, {
      resourceId,
      ownerRef: declared.owner_ref,
      resourceKind: expectedKind,
      identity: realIdentity,
      isSymlink: stat.is_symlink === true,
      reparseTag,
    });
  }

  if (observed.size !== TOPOLOGY_V2_RESOURCE_IDS.length) {
    return Object.freeze({
      ...hold(holds, evaluatedAt),
      detail: Object.freeze(detail.map((item) => Object.freeze(item))),
    });
  }

  const inspections = TOPOLOGY_V2_RESOURCE_IDS.map((resourceId) => {
    const item = observed.get(resourceId);
    const parent = DECLARED_PARENT[resourceId] ?? null;
    const overlaps = TOPOLOGY_V2_RESOURCE_IDS.filter((otherId) => {
      if (otherId === resourceId) return false;
      const other = observed.get(otherId);
      if (DECLARED_PARENT[resourceId] === otherId || DECLARED_PARENT[otherId] === resourceId) return false;
      return item.identity === other.identity
        || contains(other.identity, item.identity)
        || contains(item.identity, other.identity);
    });
    const record = {
      inspection_ref: privateBinding.inspection_refs[resourceId],
      resource_id: resourceId,
      resource_ref: null,
      resource_digest: computeResourceIdentityDigest({
        resourceId,
        resourceKind: item.resourceKind,
        ownerRef: item.ownerRef,
        identity: item.identity,
      }),
      owner_ref: item.ownerRef,
      owner_epoch: privateBinding.binding_epoch,
      resource_kind: item.resourceKind,
      realpath_digest: computeRealpathDigest(item.identity),
      is_symlink: item.isSymlink,
      reparse_tag: item.reparseTag,
      parent_resource_id: parent,
      overlap_resource_ids: overlaps,
      state: 'verified_distinct',
      evidence_epoch: clock.current_epoch,
    };
    return record;
  });

  // The resource_ref is the binding's own ref for that resource; taking it
  // from the frozen public binding is what makes the inspection bind to the
  // binding rather than describe itself.
  const refByResourceId = publicBindingResourceRefs(privateBinding.public_binding);
  for (const record of inspections) {
    record.resource_ref = refByResourceId[record.resource_id] ?? null;
    record.inspection_digest = digestOf(withoutKey(record, 'inspection_digest'));
  }

  const installedRoot = privateBinding.installed_pack.installed_root_path;
  const manifestRaw = port.readUtf8(port.joinPath(installedRoot, 'pack.manifest.json'));
  let manifest = null;
  try {
    manifest = manifestRaw === null ? null : JSON.parse(manifestRaw);
  } catch {
    manifest = null;
  }
  if (!isPlainObject(manifest) || typeof manifest.pack_digest !== 'string'
    || !SHA256_HEX.test(manifest.pack_digest) || !Array.isArray(manifest.files)
    || manifest.files.length === 0
    || !manifest.files.every((entry) => isPlainObject(entry) && typeof entry.path === 'string'
      && typeof entry.sha256 === 'string' && SHA256_HEX.test(entry.sha256)
      && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0)) {
    return hold([...holds, HC.INSTALLED_PACK_MANIFEST_INVALID], evaluatedAt);
  }

  // Full observed readback: every manifested file is re-hashed from disk and
  // the pack digest is recomputed with the BUILDER's exact recipe. A single
  // changed byte moves pack_readback_digest and the judge refuses.
  const observedEntries = [];
  let readbackOk = true;
  for (const entry of manifest.files) {
    const hashed = port.hashFile(port.joinPath(installedRoot, 'payload', ...entry.path.split('/')));
    if (!isPlainObject(hashed) || typeof hashed.sha256 !== 'string'
      || !SHA256_HEX.test(hashed.sha256) || !Number.isSafeInteger(hashed.bytes)) {
      readbackOk = false;
      break;
    }
    observedEntries.push({ path: entry.path, sha256: hashed.sha256, bytes: hashed.bytes });
  }
  if (!readbackOk) return hold([...holds, HC.INSTALLED_PACK_READBACK_MISMATCH], evaluatedAt);

  const controllerEntry = port.hashFile(
    port.joinPath(installedRoot, 'payload', ...privateBinding.installed_pack.controller_entry_relpath.split('/')),
  );
  if (!isPlainObject(controllerEntry) || typeof controllerEntry.sha256 !== 'string'
    || !SHA256_HEX.test(controllerEntry.sha256)) {
    return hold([...holds, HC.CONTROLLER_ENTRY_MISSING], evaluatedAt);
  }

  const controllerResource = observed.get('installed_controller_runtime');
  const installedController = privateBinding.public_binding?.installed_controller ?? {};
  const readback = {
    receipt_ref: privateBinding.receipt_ref,
    binding_ref: privateBinding.public_binding?.binding_ref ?? null,
    binding_digest: privateBinding.public_binding?.binding_digest ?? null,
    controller_ref: installedController.controller_ref ?? null,
    runtime_ref: installedController.runtime_ref ?? null,
    runtime_digest: `sha256:${controllerEntry.sha256}`,
    executing_runtime_root_ref: installedController.runtime_root_ref ?? null,
    executing_runtime_root_digest: computeResourceIdentityDigest({
      resourceId: 'installed_controller_runtime',
      resourceKind: 'directory',
      ownerRef: controllerResource.ownerRef,
      identity: controllerResource.identity,
    }),
    installed_pack_ref: installedController.installed_pack_ref ?? null,
    expected_installed_pack_digest: installedController.installed_pack_digest ?? null,
    observed_installed_pack_digest: `sha256:${manifest.pack_digest}`,
    pack_readback_digest: `sha256:${recomputePackDigest(observedEntries)}`,
    evidence_epoch: clock.current_epoch,
    state: 'installed_readback_verified',
  };
  readback.receipt_digest = digestOf(withoutKey(readback, 'receipt_digest'));

  const evidence = {
    schema_version: 'soulforge.backup_controller.preflight_v2_input.v0',
    evaluation_ref: privateBinding.evaluation_ref,
    clock: {
      clock_ref: privateBinding.clock_ref,
      now_utc: clock.now_utc,
      current_epoch: clock.current_epoch,
    },
    binding: privateBinding.public_binding,
    installed_controller_readback: orderedReadback(readback),
    resource_inspections: inspections.map(orderedInspection),
  };

  return Object.freeze({
    schema_version: TOPOLOGY_V2_ACTUAL_READER_SCHEMA,
    status: TOPOLOGY_V2_ACTUAL_READER_STATUS.EVIDENCE_READY,
    effect: 'read_only',
    evaluated_at: evaluatedAt,
    holds: Object.freeze([]),
    detail: Object.freeze([]),
    evidence,
  });
}

function withoutKey(record, key) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

// preflight_v2 requires exact record shapes, so both emitted records are
// rebuilt with exactly the allowed keys instead of spread from a superset.
function orderedReadback(record) {
  return {
    receipt_ref: record.receipt_ref,
    receipt_digest: record.receipt_digest,
    binding_ref: record.binding_ref,
    binding_digest: record.binding_digest,
    controller_ref: record.controller_ref,
    runtime_ref: record.runtime_ref,
    runtime_digest: record.runtime_digest,
    executing_runtime_root_ref: record.executing_runtime_root_ref,
    executing_runtime_root_digest: record.executing_runtime_root_digest,
    installed_pack_ref: record.installed_pack_ref,
    expected_installed_pack_digest: record.expected_installed_pack_digest,
    observed_installed_pack_digest: record.observed_installed_pack_digest,
    pack_readback_digest: record.pack_readback_digest,
    evidence_epoch: record.evidence_epoch,
    state: record.state,
  };
}

function orderedInspection(record) {
  return {
    inspection_ref: record.inspection_ref,
    inspection_digest: record.inspection_digest,
    resource_id: record.resource_id,
    resource_ref: record.resource_ref,
    resource_digest: record.resource_digest,
    owner_ref: record.owner_ref,
    owner_epoch: record.owner_epoch,
    resource_kind: record.resource_kind,
    realpath_digest: record.realpath_digest,
    is_symlink: record.is_symlink,
    reparse_tag: record.reparse_tag,
    parent_resource_id: record.parent_resource_id,
    overlap_resource_ids: record.overlap_resource_ids,
    state: record.state,
    evidence_epoch: record.evidence_epoch,
  };
}

function publicBindingResourceRefs(publicBinding) {
  if (!isPlainObject(publicBinding)) return {};
  const controller = publicBinding.installed_controller ?? {};
  const erp = publicBinding.external_erp_data_owner ?? {};
  const transitions = Array.isArray(publicBinding.transition_metadata_owners)
    ? publicBinding.transition_metadata_owners : [];
  const targets = Array.isArray(publicBinding.canonical_targets)
    ? publicBinding.canonical_targets : [];
  const rollback = publicBinding.rollback_target ?? {};
  const refs = {
    installed_controller_runtime: controller.runtime_root_ref ?? null,
    external_erp_root: erp.source_root_ref ?? null,
    external_erp_data: erp.data_ref ?? null,
    rollback_target: rollback.rollback_root_ref ?? null,
  };
  for (const source of transitions) {
    if (isPlainObject(source) && typeof source.source_id === 'string') {
      refs[source.source_id] = source.source_root_ref ?? null;
    }
  }
  for (const target of targets) {
    if (isPlainObject(target) && typeof target.target_id === 'string') {
      refs[target.target_id] = target.target_root_ref ?? null;
    }
  }
  return refs;
}

/**
 * Author-time helper: derive the public-safe v2 binding from OBSERVED state so
 * the frozen binding and the reader agree on the digest recipe by
 * construction. This is a generator, not a gate. Freezing its output into the
 * private binding is what turns it into an expectation the reader can fail
 * against on every later run.
 */
export function generatePublicBindingV2({ privateBinding, port, refs, packDigest } = {}) {
  if (!validPort(port)) return null;
  if (!isPlainObject(privateBinding) || !isPlainObject(privateBinding.resources)) return null;
  if (!isPlainObject(refs) || typeof packDigest !== 'string' || !SHA256_PREFIXED.test(packDigest)) return null;
  const identityOf = (resourceId) => {
    const declared = privateBinding.resources[resourceId];
    const real = port.realpath(declared.path);
    return pathIdentity(typeof real === 'string' && real.length > 0 ? real : declared.path, port.platform);
  };
  const digestFor = (resourceId) => computeResourceIdentityDigest({
    resourceId,
    resourceKind: RESOURCE_KIND[resourceId],
    ownerRef: privateBinding.resources[resourceId].owner_ref,
    identity: identityOf(resourceId),
  });
  const epoch = privateBinding.binding_epoch;
  const controllerEntry = port.hashFile(port.joinPath(
    privateBinding.installed_pack.installed_root_path,
    'payload',
    ...privateBinding.installed_pack.controller_entry_relpath.split('/'),
  ));
  if (!isPlainObject(controllerEntry) || typeof controllerEntry.sha256 !== 'string') return null;
  const binding = {
    schema_version: 'soulforge.backup_controller.binding.v2',
    controller_id: 'soulforge-backup-controller',
    feature_state: 'off',
    binding_ref: refs.binding_ref,
    binding_digest: null,
    binding_epoch: epoch,
    fallback_allowed: false,
    installed_controller: {
      controller_owner_ref: privateBinding.resources.installed_controller_runtime.owner_ref,
      owner_epoch: epoch,
      controller_ref: refs.controller_ref,
      runtime_ref: refs.runtime_ref,
      runtime_digest: `sha256:${controllerEntry.sha256}`,
      runtime_root_ref: refs.installed_controller_runtime_ref,
      runtime_root_digest: digestFor('installed_controller_runtime'),
      installed_pack_ref: refs.installed_pack_ref,
      installed_pack_digest: packDigest,
    },
    external_erp_data_owner: {
      owner_ref: privateBinding.resources.external_erp_root.owner_ref,
      owner_epoch: epoch,
      source_plane: 'external_d_data',
      data_kind: 'file',
      data_ref: refs.external_erp_data_ref,
      data_digest: digestFor('external_erp_data'),
      source_root_kind: 'directory',
      source_root_ref: refs.external_erp_root_ref,
      source_root_digest: digestFor('external_erp_root'),
      fallback_allowed: false,
    },
    transition_metadata_owners: [
      {
        source_id: 'c_project_metadata_transition',
        owner_ref: privateBinding.resources.c_project_metadata_transition.owner_ref,
        owner_epoch: epoch,
        source_plane: 'c_transition',
        source_ref: refs.c_project_metadata_transition_ref,
        source_digest: digestFor('c_project_metadata_transition'),
        source_root_ref: refs.c_project_metadata_transition_ref,
        source_root_digest: digestFor('c_project_metadata_transition'),
        source_state: 'legacy_transition_source',
        fallback_allowed: false,
      },
      {
        source_id: 'c_cross_project_state_transition',
        owner_ref: privateBinding.resources.c_cross_project_state_transition.owner_ref,
        owner_epoch: epoch,
        source_plane: 'c_transition',
        source_ref: refs.c_cross_project_state_transition_ref,
        source_digest: digestFor('c_cross_project_state_transition'),
        source_root_ref: refs.c_cross_project_state_transition_ref,
        source_root_digest: digestFor('c_cross_project_state_transition'),
        source_state: 'legacy_transition_source',
        fallback_allowed: false,
      },
    ],
    canonical_targets: [
      {
        target_id: 'd_workspace_canonical_target',
        owner_ref: privateBinding.resources.d_workspace_canonical_target.owner_ref,
        owner_epoch: epoch,
        target_plane: 'd_canonical',
        target_ref: refs.d_workspace_canonical_target_ref,
        target_digest: digestFor('d_workspace_canonical_target'),
        target_root_ref: refs.d_workspace_canonical_target_ref,
        target_root_digest: digestFor('d_workspace_canonical_target'),
        target_state: 'empty_canonical_only',
        source_eligible: false,
      },
      {
        target_id: 'd_workmeta_canonical_target',
        owner_ref: privateBinding.resources.d_workmeta_canonical_target.owner_ref,
        owner_epoch: epoch,
        target_plane: 'd_canonical',
        target_ref: refs.d_workmeta_canonical_target_ref,
        target_digest: digestFor('d_workmeta_canonical_target'),
        target_root_ref: refs.d_workmeta_canonical_target_ref,
        target_root_digest: digestFor('d_workmeta_canonical_target'),
        target_state: 'empty_canonical_only',
        source_eligible: false,
      },
    ],
    rollback_target: {
      owner_ref: privateBinding.resources.rollback_target.owner_ref,
      owner_epoch: epoch,
      rollback_ref: refs.rollback_target_ref,
      rollback_digest: digestFor('rollback_target'),
      rollback_root_ref: refs.rollback_target_ref,
      rollback_root_digest: digestFor('rollback_target'),
      state: 'verified_empty_rollback_target',
    },
  };
  delete binding.binding_digest;
  binding.binding_digest = digestOf(binding);
  return {
    schema_version: binding.schema_version,
    controller_id: binding.controller_id,
    feature_state: binding.feature_state,
    binding_ref: binding.binding_ref,
    binding_digest: binding.binding_digest,
    binding_epoch: binding.binding_epoch,
    fallback_allowed: binding.fallback_allowed,
    installed_controller: binding.installed_controller,
    external_erp_data_owner: binding.external_erp_data_owner,
    transition_metadata_owners: binding.transition_metadata_owners,
    canonical_targets: binding.canonical_targets,
    rollback_target: binding.rollback_target,
  };
}
