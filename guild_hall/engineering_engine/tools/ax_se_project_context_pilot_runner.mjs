#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';

import { canonicalise, compareCodePoints } from '../kernel/canonical.mjs';
import { inspectIdentifierOpacity, isWellFormedRef, sameExactRef } from '../kernel/identity.mjs';
import { selectProjectKnowledgeView } from '../../shared/project_knowledge_view.mjs';
import { comparablePathIdentity } from '../../shared/physical_path_identity.mjs';
import {
  AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN,
  AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA,
  AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION as SUBJECT_PILOT_POLICY_REVISION,
  assessOwnerFrozenProjectContext,
} from '../subjects/ax_se_project_context_pilot.mjs';

export const AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA =
  'soulforge.ax_se_project_context_pilot_launch.v0';
export const AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION =
  SUBJECT_PILOT_POLICY_REVISION;
export const COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN =
  AX_SE_PROJECT_CONTEXT_COMMON_BINDINGS_HASH_DOMAIN;
export const TEST_ONLY_READ_HOOK =
  Symbol('soulforge.ax_se_project_context_pilot_runner.test_only_read_hook');

export const AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_RECEIPT_SCHEMA =
  'soulforge.ax_se_project_context_pilot_command_receipt.v0';

export const CLI_CODES = Object.freeze({
  IO_INVALID: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_IO_INVALID',
  ARGUMENTS_INVALID: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_ARGUMENTS_INVALID',
  LAUNCH_UNREADABLE: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_LAUNCH_UNREADABLE',
  LAUNCH_TOO_LARGE: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_LAUNCH_TOO_LARGE',
  LAUNCH_HASH_MISMATCH: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_LAUNCH_HASH_MISMATCH',
  LAUNCH_NOT_UTF8: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_LAUNCH_NOT_UTF8',
  LAUNCH_NOT_JSON: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_LAUNCH_NOT_JSON',
  LAUNCH_NOT_CANONICAL: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_LAUNCH_NOT_CANONICAL',
  LAUNCH_CONTRACT_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_LAUNCH_CONTRACT_REFUSED',
  KNOWLEDGE_VIEW_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_KNOWLEDGE_VIEW_REFUSED',
  PROJECT_BINDING_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PROJECT_BINDING_REFUSED',
  ROOT_BINDING_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_ROOT_BINDING_REFUSED',
  PACKET_UNREADABLE: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PACKET_UNREADABLE',
  PACKET_TOO_LARGE: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PACKET_TOO_LARGE',
  PACKET_HASH_MISMATCH: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PACKET_HASH_MISMATCH',
  PACKET_NOT_UTF8: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PACKET_NOT_UTF8',
  PACKET_NOT_JSON: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PACKET_NOT_JSON',
  PACKET_NOT_CANONICAL: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PACKET_NOT_CANONICAL',
  PACKET_CONTRACT_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PACKET_CONTRACT_REFUSED',
  PILOT_GRANT_BINDING_REFUSED:
    'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_PILOT_GRANT_BINDING_REFUSED',
  MANIFEST_BINDING_REFUSED:
    'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_MANIFEST_BINDING_REFUSED',
  ROSTER_BINDING_REFUSED:
    'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_ROSTER_BINDING_REFUSED',
  COMMON_BINDING_REFUSED:
    'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_COMMON_BINDING_REFUSED',
  ASSESSMENT_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_ASSESSMENT_REFUSED',
  OUTPUT_REFUSED: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_OUTPUT_REFUSED',
  OUTPUT_TOO_LARGE: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_OUTPUT_TOO_LARGE',
  STDOUT_FAILED: 'AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_STDOUT_FAILED',
});

export const MAX_LAUNCH_BYTES = 2 * 1024 * 1024;
export const MAX_PATH_CHARS = 4096;
export const MAX_PACKET_LOCATOR_CHARS = 1024;
export const MAX_PACKET_BYTES = 2 * 1024 * 1024;
export const MAX_RESULT_BYTES = 4 * 1024 * 1024;

const MODE = 'owner_frozen_manual_zero_write';
const HOLD_EXIT_CODE = 2;
const PASS_EXIT_CODE = 0;
const REQUIRED_FLAGS = Object.freeze(['--launch', '--launch-sha256']);
const ALLOWED_FLAGS = new Set(REQUIRED_FLAGS);
const ARGV_LENGTH = REQUIRED_FLAGS.length * 2;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CONTENT_DERIVED_REVISION = /^[0-9a-f]{12,64}$/iu;
const NUMBERED_REVISION = /(?:^|[-_.])(?:r|rev|v)\d+(?:[-_.]\d+)*$/iu;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const SAFE_READ_OPEN_FLAGS = constants.O_RDONLY
  | (constants.O_NOFOLLOW ?? 0)
  | (constants.O_NONBLOCK ?? 0);
const IO_KEYS = new Set(['stdoutWrite', 'stderrWrite']);
const DEFAULT_IO = Object.freeze({
  stdoutWrite: (value) => process.stdout.write(value),
  stderrWrite: (value) => process.stderr.write(value),
});

const LAUNCH_FIELDS = Object.freeze([
  'schema_version',
  'feature_state',
  'mode',
  'pilot_policy_revision',
  'knowledge_view_request',
  'knowledge_view_authority_grant',
  'expected_knowledge_view_authority_grant_ref',
  'expected_project_binding_ref',
  'expected_pilot_grant_ref',
  'expected_project_source_binding_manifest_ref',
  'expected_role_roster_ref',
  'expected_common_projection_bindings_fingerprint_sha256',
  'pilot_packet_relative_locator',
  'pilot_packet_sha256',
]);
const PILOT_PACKET_FIELDS = Object.freeze([
  'schema_version',
  'feature_state',
  'knowledge_view_request',
  'knowledge_view_authority_grant',
  'common_projection_bindings',
  'project_source_binding_manifest',
  'pilot_grant',
  'role_bound_packet',
]);
const EXACT_REF_FIELDS = Object.freeze([
  'entity_id', 'revision_id', 'content_id', 'content_hash_alg',
]);

const emptyFingerprints = () => ({
  pilot_grant_sha256: null,
  project_binding_sha256: null,
  project_source_binding_manifest_sha256: null,
  common_projection_bindings_sha256: null,
  role_roster_sha256: null,
});
const emptyAdmission = () => ({
  root_binding_verified: false,
  packet_file_binding_verified: false,
});
const emptyAssessment = () => ({
  completed: false,
  assessment_state: null,
  assessment_handle: null,
  prepared_output_sha256: null,
  prepared_output_byte_count: null,
  stdout_state: null,
});
const emptyCandidateDisposition = () => ({
  candidate_only: true,
  mission_candidate_count: null,
});

const unverifiedFile = () => ({ pin_verified: false, sha256: null, byte_count: null });

function receiptOf({
  result = 'HOLD',
  blockerCode = null,
  stage,
  launch = unverifiedFile(),
  packet = unverifiedFile(),
  fingerprints = emptyFingerprints(),
  knowledgeScopeFingerprint = null,
  admission = emptyAdmission(),
  assessment = emptyAssessment(),
  candidateDisposition = emptyCandidateDisposition(),
}) {
  return {
    schema_version: AX_SE_PROJECT_CONTEXT_PILOT_COMMAND_RECEIPT_SCHEMA,
    mode: MODE,
    result,
    blocker_code: blockerCode,
    stage,
    launch,
    packet,
    fingerprints,
    knowledge_scope_fingerprint_sha256: knowledgeScopeFingerprint,
    admission,
    assessment,
    candidate_disposition: candidateDisposition,
    persistence: { state: 'not_requested', persistent_file_writes: 0 },
    gates: {
      stage_clear_allowed: false,
      owner_decision_made: false,
      task_intent_created: false,
      roster_approved: false,
      human_identity_bound: false,
      live_availability_claimed: false,
    },
    effects: {
      filesystem_writes: 0,
      explicit_network_calls: 0,
      model_calls: 0,
      erp_writes: 0,
      taskdriver_activated: false,
    },
    canon_claim_ceiling: 'observed',
  };
}

const verifiedFile = (sha256, byteCount) => ({
  pin_verified: true,
  sha256,
  byte_count: byteCount,
});

const FILE_READ = Object.freeze({ UNREADABLE: 'unreadable', TOO_LARGE: 'too_large' });
const WINDOWS_UNC_OR_DEVICE_NAMESPACE = /^[\\/]{2}/u;
const WINDOWS_DRIVE_DESIGNATOR = /^[A-Za-z]:(?=[\\/]|$)/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const WINDOWS_TRIMMED_SEGMENT = /[. ](?:[\\/]|$)/u;

function controlFree(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

function refusedAbsoluteFilePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH_CHARS
      || !controlFree(value) || value.normalize('NFC') !== value || !isAbsolute(value)
      || resolve(value) !== value || WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(value)) return true;
  if (process.platform !== 'win32') return false;
  if (WINDOWS_TRIMMED_SEGMENT.test(value)) return true;
  const colonStart = WINDOWS_DRIVE_DESIGNATOR.test(value) ? 2 : 0;
  if (value.includes(':', colonStart)) return true;
  return value.split(/[\\/]/u).filter(Boolean).some((segment) => WINDOWS_DEVICE_NAME.test(segment));
}

function fileState(stat) {
  const state = {
    dev: stat.dev,
    ino: stat.ino,
    nlink: stat.nlink,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
  return Object.values(state).every((value) => typeof value === 'bigint') ? state : null;
}

function sameFileState(left, right) {
  return left !== null && right !== null
    && left.dev === right.dev && left.ino === right.ino
    && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function oneNamedOrdinaryFile(held, named) {
  return held.isFile() && named.isFile() && held.ino !== 0n
    && held.nlink === 1n && named.nlink === 1n
    && held.dev === named.dev && held.ino === named.ino;
}

function preflightBoundedNamedFile(path, maxBytes) {
  try {
    const named = lstatSync(path, { bigint: true });
    const namedState = fileState(named);
    if (!named.isFile() || named.isSymbolicLink() || named.ino === 0n
        || named.nlink !== 1n || named.size === 0n || namedState === null) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    if (named.size > BigInt(maxBytes)) return { refusal: FILE_READ.TOO_LARGE };
    const namedRealPath = realpathSync.native(path);
    if (comparablePathIdentity(namedRealPath) !== comparablePathIdentity(path)) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    return { namedState, namedRealPath };
  } catch {
    return { refusal: FILE_READ.UNREADABLE };
  }
}

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = '') => {
    if (Array.isArray(node)) {
      rules[path] = 'insertion_ordered';
      for (const child of node) visit(child, `${path}[]`);
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        visit(child, path ? `${path}.${key}` : key);
      }
    }
  };
  visit(value);
  return rules;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${canonicalise(value, insertionOrderRules(value))}\n`, 'utf8');
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  return actual.length === required.length
    && actual.every((key, index) => key === required[index]);
}

function validExactRef(ref) {
  return exactKeys(ref, EXACT_REF_FIELDS)
    && isWellFormedRef(ref)
    && ref.content_hash_alg === 'sha256'
    && SHA256_CONTENT_ID.test(ref.content_id)
    && SAFE_IDENTIFIER.test(ref.entity_id)
    && SAFE_IDENTIFIER.test(ref.revision_id)
    && inspectIdentifierOpacity(ref.entity_id).opaque === true
    && inspectIdentifierOpacity(ref.revision_id).opaque === true
    && (CANONICAL_UUID.test(ref.revision_id)
      || CONTENT_DERIVED_REVISION.test(ref.revision_id)
      || NUMBERED_REVISION.test(ref.revision_id));
}

function canonicalFingerprint(domain, material) {
  return `sha256:${createHash('sha256')
    .update(`${domain}\0`, 'utf8')
    .update(canonicalise(material, insertionOrderRules(material)), 'utf8')
    .digest('hex')}`;
}

function launchFingerprints(launch) {
  const fingerprintRef = (role, ref) => canonicalFingerprint(
    `soulforge.ax_se_project_context_pilot_command.${role}.v0`,
    ref,
  );
  return {
    pilot_grant_sha256: fingerprintRef('pilot_grant_ref', launch.expected_pilot_grant_ref),
    project_binding_sha256: fingerprintRef(
      'project_binding_ref',
      launch.expected_project_binding_ref,
    ),
    project_source_binding_manifest_sha256: fingerprintRef(
      'project_source_binding_manifest_ref',
      launch.expected_project_source_binding_manifest_ref,
    ),
    common_projection_bindings_sha256:
      launch.expected_common_projection_bindings_fingerprint_sha256,
    role_roster_sha256: fingerprintRef('role_roster_ref', launch.expected_role_roster_ref),
  };
}

function validLaunchContract(launch) {
  return exactKeys(launch, LAUNCH_FIELDS)
    && launch.schema_version === AX_SE_PROJECT_CONTEXT_PILOT_LAUNCH_SCHEMA
    && launch.feature_state === 'off'
    && launch.mode === MODE
    && launch.pilot_policy_revision === AX_SE_PROJECT_CONTEXT_PILOT_POLICY_REVISION
    && launch.knowledge_view_request !== null
    && typeof launch.knowledge_view_request === 'object'
    && !Array.isArray(launch.knowledge_view_request)
    && launch.knowledge_view_authority_grant !== null
    && typeof launch.knowledge_view_authority_grant === 'object'
    && !Array.isArray(launch.knowledge_view_authority_grant)
    && validExactRef(launch.expected_knowledge_view_authority_grant_ref)
    && validExactRef(launch.expected_project_binding_ref)
    && validExactRef(launch.expected_pilot_grant_ref)
    && validExactRef(launch.expected_project_source_binding_manifest_ref)
    && validExactRef(launch.expected_role_roster_ref)
    && SHA256_CONTENT_ID.test(
      launch.expected_common_projection_bindings_fingerprint_sha256,
    )
    && typeof launch.pilot_packet_relative_locator === 'string'
    && SHA256_HEX.test(launch.pilot_packet_sha256);
}

function semanticEqual(left, right) {
  try {
    return canonicalise(left, insertionOrderRules(left))
      === canonicalise(right, insertionOrderRules(right));
  } catch {
    return false;
  }
}

function externalPacketBindingRefusal(packet, launch) {
  if (!exactKeys(packet, PILOT_PACKET_FIELDS)
      || packet.schema_version !== AX_SE_PROJECT_CONTEXT_PILOT_PACKET_SCHEMA
      || packet.feature_state !== 'off'
      || !semanticEqual(packet.knowledge_view_request, launch.knowledge_view_request)
      || !semanticEqual(
        packet.knowledge_view_authority_grant,
        launch.knowledge_view_authority_grant,
      )) {
    return [CLI_CODES.PACKET_CONTRACT_REFUSED, 'packet_contract'];
  }
  let commonFingerprint;
  try {
    commonFingerprint = canonicalFingerprint(
      COMMON_PROJECTION_BINDINGS_FINGERPRINT_DOMAIN,
      packet.common_projection_bindings,
    );
  } catch {
    return [CLI_CODES.COMMON_BINDING_REFUSED, 'common_binding'];
  }
  if (commonFingerprint
      !== launch.expected_common_projection_bindings_fingerprint_sha256) {
    return [CLI_CODES.COMMON_BINDING_REFUSED, 'common_binding'];
  }

  const grant = packet.pilot_grant;
  if (grant === null || typeof grant !== 'object' || Array.isArray(grant)
      || !validExactRef(grant.grant_ref)
      || !validExactRef(grant.knowledge_view_authority_grant_ref)
      || !validExactRef(grant.project_binding_ref)
      || !validExactRef(grant.project_source_binding_manifest_ref)
      || !validExactRef(grant.expected_role_roster_ref)
      || !sameExactRef(grant.grant_ref, launch.expected_pilot_grant_ref)
      || !sameExactRef(
        grant.knowledge_view_authority_grant_ref,
        launch.expected_knowledge_view_authority_grant_ref,
      )) {
    return [CLI_CODES.PILOT_GRANT_BINDING_REFUSED, 'pilot_grant_binding'];
  }
  if (!sameExactRef(grant.project_binding_ref, launch.expected_project_binding_ref)
      || !sameExactRef(
        packet.role_bound_packet?.expected_project_binding_ref,
        launch.expected_project_binding_ref,
      )) {
    return [CLI_CODES.PROJECT_BINDING_REFUSED, 'project_binding'];
  }
  if (!sameExactRef(
    grant.project_source_binding_manifest_ref,
    launch.expected_project_source_binding_manifest_ref,
  ) || !sameExactRef(
    packet.project_source_binding_manifest?.manifest_ref,
    launch.expected_project_source_binding_manifest_ref,
  ) || !sameExactRef(
    packet.project_source_binding_manifest?.project_binding_ref,
    launch.expected_project_binding_ref,
  )) {
    return [CLI_CODES.MANIFEST_BINDING_REFUSED, 'manifest_binding'];
  }
  if (!sameExactRef(grant.expected_role_roster_ref, launch.expected_role_roster_ref)) {
    return [CLI_CODES.ROSTER_BINDING_REFUSED, 'roster_binding'];
  }
  return null;
}

function classifySubjectRefusal(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'AX_SE_PROJECT_CONTEXT_PILOT_GRANT_REFUSED') {
    return [CLI_CODES.PILOT_GRANT_BINDING_REFUSED, 'pilot_grant_binding'];
  }
  if (code === 'AX_SE_PROJECT_CONTEXT_PILOT_ASSESSMENT_REFUSED') {
    return [CLI_CODES.ASSESSMENT_REFUSED, 'assessment'];
  }
  if (code.startsWith('AX_SE_PROJECT_CONTEXT_PILOT_')) {
    return [CLI_CODES.PACKET_CONTRACT_REFUSED, 'packet_contract'];
  }
  return [CLI_CODES.ASSESSMENT_REFUSED, 'assessment'];
}

function packetLocatorSegments(value) {
  if (typeof value !== 'string' || value.length === 0
      || value.length > MAX_PACKET_LOCATOR_CHARS || !controlFree(value)
      || value.normalize('NFC') !== value || isAbsolute(value)
      || WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(value)
      || /^[A-Za-z]:/u.test(value) || value.includes('\\') || value.includes(':')) return null;
  const segments = value.split('/');
  if (segments.length === 0 || segments.length > 64) return null;
  for (const segment of segments) {
    if (segment.length === 0 || segment.length > 255 || segment === '.' || segment === '..'
        || /[. ]$/u.test(segment) || WINDOWS_DEVICE_NAME.test(segment)) return null;
  }
  return segments;
}

function rootSnapshot(path) {
  try {
    const named = lstatSync(path, { bigint: true });
    const state = fileState(named);
    if (!named.isDirectory() || named.isSymbolicLink() || named.ino === 0n || state === null) {
      return null;
    }
    const realPath = realpathSync.native(path);
    return {
      state,
      real_path: realPath,
      comparable_real_path: comparablePathIdentity(realPath),
    };
  } catch {
    return null;
  }
}

function sameRootSnapshot(left, right) {
  return left !== null && right !== null
    && left.comparable_real_path === right.comparable_real_path
    && sameFileState(left.state, right.state);
}

function rootPathCommitment(snapshot) {
  return `sha256:${createHash('sha256')
    .update('soulforge.knowledge_root.local_path.v0\0', 'utf8')
    .update(snapshot.comparable_real_path, 'utf8')
    .digest('hex')}`;
}

function directoryChainSnapshot(root, segments) {
  const snapshots = [];
  let lexical = root.real_path;
  for (const segment of segments.slice(0, -1)) {
    lexical = join(lexical, segment);
    try {
      const named = lstatSync(lexical, { bigint: true });
      const state = fileState(named);
      if (!named.isDirectory() || named.isSymbolicLink() || named.ino === 0n || state === null) {
        return null;
      }
      const realPath = realpathSync.native(lexical);
      if (comparablePathIdentity(realPath) !== comparablePathIdentity(lexical)) return null;
      snapshots.push({ state, comparable_real_path: comparablePathIdentity(realPath) });
    } catch {
      return null;
    }
  }
  return snapshots;
}

function sameDirectoryChain(left, right) {
  return left !== null && right !== null && left.length === right.length
    && left.every((entry, index) => (
      entry.comparable_real_path === right[index].comparable_real_path
      && sameFileState(entry.state, right[index].state)
    ));
}

function invokeReadHook(hook, phase) {
  if (hook === null) return true;
  try {
    hook(phase);
    return true;
  } catch {
    return false;
  }
}

const PROJECT_PACKET_READ = Object.freeze({
  ROOT: 'root',
  UNREADABLE: 'unreadable',
  TOO_LARGE: 'too_large',
});

function readBoundedProjectPacket({
  projectRootPath,
  locatorSegments,
  expectedRootCommitment,
  maxBytes,
  hook,
}) {
  const root = rootSnapshot(projectRootPath);
  if (root === null || rootPathCommitment(root) !== expectedRootCommitment) {
    return { refusal: PROJECT_PACKET_READ.ROOT, rootVerified: false };
  }
  const ancestors = directoryChainSnapshot(root, locatorSegments);
  if (ancestors === null) {
    return { refusal: PROJECT_PACKET_READ.UNREADABLE, rootVerified: true };
  }
  if (!invokeReadHook(hook, 'after_root_snapshot')
      || !invokeReadHook(hook, 'before_packet_open')
      || !sameRootSnapshot(root, rootSnapshot(projectRootPath))
      || !sameDirectoryChain(ancestors, directoryChainSnapshot(root, locatorSegments))) {
    return { refusal: PROJECT_PACKET_READ.ROOT, rootVerified: false };
  }

  const packetPath = join(root.real_path, ...locatorSegments);
  const preflight = preflightBoundedNamedFile(packetPath, maxBytes);
  if (!invokeReadHook(hook, 'after_packet_preflight')
      || !sameRootSnapshot(root, rootSnapshot(projectRootPath))
      || !sameDirectoryChain(ancestors, directoryChainSnapshot(root, locatorSegments))) {
    return { refusal: PROJECT_PACKET_READ.ROOT, rootVerified: false };
  }
  if (preflight.namedState === undefined) {
    return {
      refusal: preflight.refusal === FILE_READ.TOO_LARGE
        ? PROJECT_PACKET_READ.TOO_LARGE
        : PROJECT_PACKET_READ.UNREADABLE,
      rootVerified: preflight.refusal === FILE_READ.TOO_LARGE,
    };
  }
  let descriptor = null;
  try {
    descriptor = openSync(packetPath, SAFE_READ_OPEN_FLAGS);
    const opened = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(packetPath, { bigint: true });
    const openedState = fileState(opened);
    const namedState = fileState(named);
    const packetReal = realpathSync.native(packetPath);
    const expectedPacketReal = join(root.real_path, ...locatorSegments);
    if (!oneNamedOrdinaryFile(opened, named) || opened.size === 0n
        || openedState === null || namedState === null
        || !sameFileState(preflight.namedState, namedState)
        || comparablePathIdentity(packetReal)
          !== comparablePathIdentity(preflight.namedRealPath)
        || comparablePathIdentity(packetReal) !== comparablePathIdentity(expectedPacketReal)
        || !sameRootSnapshot(root, rootSnapshot(projectRootPath))
        || !sameDirectoryChain(ancestors, directoryChainSnapshot(root, locatorSegments))) {
      return { refusal: PROJECT_PACKET_READ.UNREADABLE, rootVerified: false };
    }
    if (opened.size > BigInt(maxBytes)) {
      return { refusal: PROJECT_PACKET_READ.TOO_LARGE, rootVerified: true };
    }
    if (!invokeReadHook(hook, 'after_packet_open')) {
      return { refusal: PROJECT_PACKET_READ.UNREADABLE, rootVerified: true };
    }
    const beforeReadHeld = fstatSync(descriptor, { bigint: true });
    const beforeReadNamed = lstatSync(packetPath, { bigint: true });
    if (!oneNamedOrdinaryFile(beforeReadHeld, beforeReadNamed)
        || !sameFileState(openedState, fileState(beforeReadHeld))
        || !sameFileState(namedState, fileState(beforeReadNamed))
        || !sameRootSnapshot(root, rootSnapshot(projectRootPath))
        || !sameDirectoryChain(ancestors, directoryChainSnapshot(root, locatorSegments))) {
      return { refusal: PROJECT_PACKET_READ.UNREADABLE, rootVerified: false };
    }

    const size = Number(opened.size);
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(descriptor, bytes, offset, size - offset, offset);
      if (count === 0) {
        return { refusal: PROJECT_PACKET_READ.UNREADABLE, rootVerified: true };
      }
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, size) !== 0
        || !invokeReadHook(hook, 'after_packet_read')) {
      return { refusal: PROJECT_PACKET_READ.UNREADABLE, rootVerified: true };
    }
    const closing = fstatSync(descriptor, { bigint: true });
    const closingNamed = lstatSync(packetPath, { bigint: true });
    const closingReal = realpathSync.native(packetPath);
    if (!oneNamedOrdinaryFile(closing, closingNamed)
        || !sameFileState(openedState, fileState(closing))
        || !sameFileState(namedState, fileState(closingNamed))
        || comparablePathIdentity(closingReal) !== comparablePathIdentity(packetReal)
        || !sameRootSnapshot(root, rootSnapshot(projectRootPath))
        || !sameDirectoryChain(ancestors, directoryChainSnapshot(root, locatorSegments))) {
      return { refusal: PROJECT_PACKET_READ.UNREADABLE, rootVerified: false };
    }
    return { bytes, rootVerified: true, packetVerified: true };
  } catch {
    return { refusal: PROJECT_PACKET_READ.UNREADABLE, rootVerified: false };
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // This descriptor was opened read-only and carries no persistent authority.
      }
    }
  }
}

function readBoundedNamedFile(path, maxBytes) {
  if (refusedAbsoluteFilePath(path)) return { refusal: FILE_READ.UNREADABLE };
  const preflight = preflightBoundedNamedFile(path, maxBytes);
  if (preflight.namedState === undefined) return { refusal: preflight.refusal };
  let descriptor = null;
  try {
    descriptor = openSync(path, SAFE_READ_OPEN_FLAGS);
    const opened = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(path, { bigint: true });
    const openedState = fileState(opened);
    const namedState = fileState(named);
    const namedRealPath = realpathSync.native(path);
    if (!oneNamedOrdinaryFile(opened, named) || opened.size === 0n
        || openedState === null || namedState === null
        || !sameFileState(preflight.namedState, namedState)
        || comparablePathIdentity(namedRealPath)
          !== comparablePathIdentity(preflight.namedRealPath)) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    if (opened.size > BigInt(maxBytes)) return { refusal: FILE_READ.TOO_LARGE };

    const size = Number(opened.size);
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(descriptor, bytes, offset, size - offset, offset);
      if (count === 0) return { refusal: FILE_READ.UNREADABLE };
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, size) !== 0) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    const closing = fstatSync(descriptor, { bigint: true });
    const closingNamed = lstatSync(path, { bigint: true });
    if (!oneNamedOrdinaryFile(closing, closingNamed)
        || !sameFileState(openedState, fileState(closing))
        || !sameFileState(namedState, fileState(closingNamed))) {
      return { refusal: FILE_READ.UNREADABLE };
    }
    return { bytes };
  } catch {
    return { refusal: FILE_READ.UNREADABLE };
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // This descriptor was opened read-only and carries no persistent authority.
      }
    }
  }
}

function snapshotArgv(argv) {
  try {
    if (typeof argv !== 'object' || argv === null || types.isProxy(argv)) return null;
    if (!Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype) return null;
    const keys = Reflect.ownKeys(argv);
    if (keys.length !== ARGV_LENGTH + 1 || keys[ARGV_LENGTH] !== 'length') return null;
    const length = Object.getOwnPropertyDescriptor(argv, 'length');
    if (length === undefined || !Object.hasOwn(length, 'value')
        || length.value !== ARGV_LENGTH) return null;
    const snapshot = [];
    for (let index = 0; index < ARGV_LENGTH; index += 1) {
      if (keys[index] !== String(index)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(argv, index);
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')
          || typeof descriptor.value !== 'string') return null;
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return null;
  }
}

function snapshotIo(io) {
  try {
    if (typeof io !== 'object' || io === null || types.isProxy(io)
        || Object.getPrototypeOf(io) !== Object.prototype) return null;
    const streams = { ...DEFAULT_IO, readHook: null };
    for (const key of Reflect.ownKeys(io)) {
      const known = typeof key === 'symbol' ? key === TEST_ONLY_READ_HOOK : IO_KEYS.has(key);
      if (!known) return null;
      const descriptor = Object.getOwnPropertyDescriptor(io, key);
      if (descriptor === undefined || descriptor.enumerable !== true
          || !Object.hasOwn(descriptor, 'value')
          || typeof descriptor.value !== 'function' || types.isProxy(descriptor.value)) {
        return null;
      }
      if (key === TEST_ONLY_READ_HOOK) streams.readHook = descriptor.value;
      else streams[key] = descriptor.value;
    }
    return streams;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== ARGV_LENGTH) return null;
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!ALLOWED_FLAGS.has(flag) || parsed.has(flag)
        || typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      return null;
    }
    parsed.set(flag, value);
  }
  if (!REQUIRED_FLAGS.every((flag) => parsed.has(flag))
      || !SHA256_HEX.test(parsed.get('--launch-sha256'))) return null;
  return parsed;
}

function decide(argv, readHook = null) {
  const parsed = parseArgs(argv);
  if (parsed === null) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({ blockerCode: CLI_CODES.ARGUMENTS_INVALID, stage: 'arguments' }),
    };
  }
  const launchRead = readBoundedNamedFile(parsed.get('--launch'), MAX_LAUNCH_BYTES);
  if (launchRead.bytes === undefined) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: launchRead.refusal === FILE_READ.TOO_LARGE
          ? CLI_CODES.LAUNCH_TOO_LARGE
          : CLI_CODES.LAUNCH_UNREADABLE,
        stage: 'launch_read',
      }),
    };
  }
  const pin = parsed.get('--launch-sha256');
  if (createHash('sha256').update(launchRead.bytes).digest('hex') !== pin) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({ blockerCode: CLI_CODES.LAUNCH_HASH_MISMATCH, stage: 'launch_binding' }),
    };
  }
  const launchCommitment = verifiedFile(pin, launchRead.bytes.length);
  let text;
  try {
    text = UTF8.decode(launchRead.bytes);
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.LAUNCH_NOT_UTF8,
        stage: 'launch_decode',
        launch: launchCommitment,
      }),
    };
  }
  let launch;
  try {
    launch = JSON.parse(text);
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.LAUNCH_NOT_JSON,
        stage: 'launch_parse',
        launch: launchCommitment,
      }),
    };
  }
  try {
    if (!launchRead.bytes.equals(canonicalJsonBytes(launch))) {
      return {
        exitCode: HOLD_EXIT_CODE,
        receipt: receiptOf({
          blockerCode: CLI_CODES.LAUNCH_NOT_CANONICAL,
          stage: 'launch_canonical',
          launch: launchCommitment,
        }),
      };
    }
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.LAUNCH_NOT_CANONICAL,
        stage: 'launch_canonical',
        launch: launchCommitment,
      }),
    };
  }
  if (!validLaunchContract(launch)) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.LAUNCH_CONTRACT_REFUSED,
        stage: 'launch_contract',
        launch: launchCommitment,
      }),
    };
  }

  let fingerprints;
  try {
    fingerprints = launchFingerprints(launch);
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.LAUNCH_CONTRACT_REFUSED,
        stage: 'launch_contract',
        launch: launchCommitment,
      }),
    };
  }

  let knowledgeView;
  try {
    knowledgeView = selectProjectKnowledgeView(
      launch.knowledge_view_request,
      launch.knowledge_view_authority_grant,
      launch.expected_knowledge_view_authority_grant_ref,
    );
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.KNOWLEDGE_VIEW_REFUSED,
        stage: 'knowledge_view',
        launch: launchCommitment,
        fingerprints,
      }),
    };
  }
  if (!sameExactRef(knowledgeView.project_binding_ref, launch.expected_project_binding_ref)) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.PROJECT_BINDING_REFUSED,
        stage: 'project_binding',
        launch: launchCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
      }),
    };
  }
  const locatorSegments = packetLocatorSegments(launch.pilot_packet_relative_locator);
  if (locatorSegments === null) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.PACKET_UNREADABLE,
        stage: 'packet_locator',
        launch: launchCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
      }),
    };
  }
  const packetRead = readBoundedProjectPacket({
    projectRootPath: launch.knowledge_view_authority_grant.project_root_path,
    locatorSegments,
    expectedRootCommitment: knowledgeView.project_root_local_path_commitment_sha256,
    maxBytes: MAX_PACKET_BYTES,
    hook: readHook,
  });
  if (packetRead.bytes === undefined) {
    const rootRefused = packetRead.refusal === PROJECT_PACKET_READ.ROOT;
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: rootRefused
          ? CLI_CODES.ROOT_BINDING_REFUSED
          : packetRead.refusal === PROJECT_PACKET_READ.TOO_LARGE
            ? CLI_CODES.PACKET_TOO_LARGE
            : CLI_CODES.PACKET_UNREADABLE,
        stage: rootRefused ? 'root_binding' : 'packet_read',
        launch: launchCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: {
          root_binding_verified: packetRead.rootVerified === true,
          packet_file_binding_verified: false,
        },
      }),
    };
  }
  if (createHash('sha256').update(packetRead.bytes).digest('hex')
      !== launch.pilot_packet_sha256) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.PACKET_HASH_MISMATCH,
        stage: 'packet_binding',
        launch: launchCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: {
          root_binding_verified: true,
          packet_file_binding_verified: true,
        },
      }),
    };
  }
  const packetCommitment = verifiedFile(
    launch.pilot_packet_sha256,
    packetRead.bytes.length,
  );
  const verifiedAdmission = {
    root_binding_verified: true,
    packet_file_binding_verified: true,
  };
  let packetText;
  try {
    packetText = UTF8.decode(packetRead.bytes);
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.PACKET_NOT_UTF8,
        stage: 'packet_decode',
        launch: launchCommitment,
        packet: packetCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: verifiedAdmission,
      }),
    };
  }
  let packet;
  try {
    packet = JSON.parse(packetText);
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.PACKET_NOT_JSON,
        stage: 'packet_parse',
        launch: launchCommitment,
        packet: packetCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: verifiedAdmission,
      }),
    };
  }
  try {
    if (!packetRead.bytes.equals(canonicalJsonBytes(packet))) {
      return {
        exitCode: HOLD_EXIT_CODE,
        receipt: receiptOf({
          blockerCode: CLI_CODES.PACKET_NOT_CANONICAL,
          stage: 'packet_canonical',
          launch: launchCommitment,
          packet: packetCommitment,
          fingerprints,
          knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
          admission: verifiedAdmission,
        }),
      };
    }
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.PACKET_NOT_CANONICAL,
        stage: 'packet_canonical',
        launch: launchCommitment,
        packet: packetCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: verifiedAdmission,
      }),
    };
  }
  const bindingRefusal = externalPacketBindingRefusal(packet, launch);
  if (bindingRefusal !== null) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: bindingRefusal[0],
        stage: bindingRefusal[1],
        launch: launchCommitment,
        packet: packetCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: verifiedAdmission,
      }),
    };
  }

  let assessment;
  try {
    assessment = assessOwnerFrozenProjectContext(
      packet,
      launch.expected_pilot_grant_ref,
    );
  } catch (error) {
    const [blockerCode, stage] = classifySubjectRefusal(error);
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode,
        stage,
        launch: launchCommitment,
        packet: packetCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: verifiedAdmission,
      }),
    };
  }
  if (assessment.knowledge_view?.knowledge_scope_fingerprint_sha256
      !== knowledgeView.knowledge_scope_fingerprint_sha256
      || !sameExactRef(assessment.project_binding_ref, launch.expected_project_binding_ref)) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.ASSESSMENT_REFUSED,
        stage: 'assessment',
        launch: launchCommitment,
        packet: packetCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: verifiedAdmission,
      }),
    };
  }

  let output;
  try {
    output = canonicalJsonBytes(assessment).toString('utf8');
  } catch {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.OUTPUT_REFUSED,
        stage: 'output_prepare',
        launch: launchCommitment,
        packet: packetCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: verifiedAdmission,
      }),
    };
  }
  if (Buffer.byteLength(output, 'utf8') > MAX_RESULT_BYTES) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        blockerCode: CLI_CODES.OUTPUT_TOO_LARGE,
        stage: 'output_prepare',
        launch: launchCommitment,
        packet: packetCommitment,
        fingerprints,
        knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
        admission: verifiedAdmission,
      }),
    };
  }
  return {
    exitCode: PASS_EXIT_CODE,
    output,
    receipt: null,
    prepared: {
      launch: launchCommitment,
      packet: packetCommitment,
      fingerprints,
      knowledgeScopeFingerprint: knowledgeView.knowledge_scope_fingerprint_sha256,
      admission: verifiedAdmission,
      assessmentState: assessment.role_bound_assessment.assessment_state,
      assessmentHandle: assessment.role_bound_assessment.assessment_handle,
      outputSha256: createHash('sha256').update(output, 'utf8').digest('hex'),
      outputByteCount: Buffer.byteLength(output, 'utf8'),
      missionCandidateCount:
        assessment.role_bound_assessment.next_mission_candidates.length,
    },
  };
}

function assessmentReceipt(prepared, stdoutState) {
  return {
    completed: true,
    assessment_state: prepared.assessmentState,
    assessment_handle: prepared.assessmentHandle,
    prepared_output_sha256: prepared.outputSha256,
    prepared_output_byte_count: prepared.outputByteCount,
    stdout_state: stdoutState,
  };
}

function completedReceipt(prepared) {
  return receiptOf({
    result: 'PASS',
    stage: 'completed',
    launch: prepared.launch,
    packet: prepared.packet,
    fingerprints: prepared.fingerprints,
    knowledgeScopeFingerprint: prepared.knowledgeScopeFingerprint,
    admission: prepared.admission,
    assessment: assessmentReceipt(prepared, 'submitted'),
    candidateDisposition: {
      candidate_only: true,
      mission_candidate_count: prepared.missionCandidateCount,
    },
  });
}

function stdoutFailedReceipt(prepared) {
  return receiptOf({
    blockerCode: CLI_CODES.STDOUT_FAILED,
    stage: 'stdout',
    launch: prepared.launch,
    packet: prepared.packet,
    fingerprints: prepared.fingerprints,
    knowledgeScopeFingerprint: prepared.knowledgeScopeFingerprint,
    admission: prepared.admission,
    assessment: assessmentReceipt(prepared, 'partial_unknown'),
    candidateDisposition: {
      candidate_only: true,
      mission_candidate_count: prepared.missionCandidateCount,
    },
  });
}

export function runAxSeProjectContextPilotCli(argv, io = {}) {
  const streams = snapshotIo(io);
  if (streams === null) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({ blockerCode: CLI_CODES.IO_INVALID, stage: 'io' }),
      receiptSubmissionState: 'failed',
    };
  }
  const decision = decide(snapshotArgv(argv), streams.readHook);
  let { receipt } = decision;
  let exitCode = decision.exitCode;
  if (decision.prepared !== undefined) {
    let submitted = true;
    try {
      streams.stdoutWrite(decision.output);
    } catch {
      submitted = false;
    }
    receipt = submitted
      ? completedReceipt(decision.prepared)
      : stdoutFailedReceipt(decision.prepared);
    exitCode = submitted ? PASS_EXIT_CODE : HOLD_EXIT_CODE;
  }
  let receiptSubmissionState = 'submitted';
  try {
    streams.stderrWrite(`${JSON.stringify(receipt)}\n`);
  } catch {
    receiptSubmissionState = 'failed';
  }
  return {
    exitCode: receiptSubmissionState === 'submitted' ? exitCode : HOLD_EXIT_CODE,
    receipt,
    receiptSubmissionState,
  };
}

export function isDirectInvocation(entryPath, moduleUrl) {
  if (typeof entryPath !== 'string' || entryPath.length === 0
      || typeof moduleUrl !== 'string' || moduleUrl.length === 0) return false;
  try {
    const entryUrl = pathToFileURL(entryPath).href;
    if (process.platform !== 'win32') return entryUrl === moduleUrl;
    const normalizedDrive = (value) => value.replace(
      /^file:\/\/\/[A-Za-z]:/u,
      (drivePrefix) => drivePrefix.toLowerCase(),
    );
    return normalizedDrive(entryUrl) === normalizedDrive(moduleUrl);
  } catch {
    return false;
  }
}

function asyncStdoutFailedReceipt(receipt) {
  return {
    ...receipt,
    result: 'HOLD',
    blocker_code: CLI_CODES.STDOUT_FAILED,
    stage: 'stdout',
    assessment: {
      ...receipt.assessment,
      stdout_state: 'partial_unknown',
    },
  };
}

function runDirectInvocation(argv) {
  let output = '';
  const result = runAxSeProjectContextPilotCli(argv, {
    stdoutWrite(value) { output += value; },
    stderrWrite() {},
  });
  let outputFailed = false;
  const markOutputFailed = () => {
    outputFailed = true;
    process.exitCode = HOLD_EXIT_CODE;
  };
  process.stdout.on('error', markOutputFailed);
  process.stderr.on('error', markOutputFailed);
  process.exitCode = HOLD_EXIT_CODE;

  const submitReceipt = (receipt, exitCode) => {
    try {
      process.stderr.write(`${JSON.stringify(receipt)}\n`, (error) => {
        if (error) markOutputFailed();
        else process.exitCode = outputFailed ? HOLD_EXIT_CODE : exitCode;
      });
    } catch {
      markOutputFailed();
    }
  };

  if (output.length === 0) {
    submitReceipt(result.receipt, result.exitCode);
    return;
  }
  try {
    process.stdout.write(output, (error) => {
      if (error || outputFailed) {
        markOutputFailed();
        submitReceipt(asyncStdoutFailedReceipt(result.receipt), HOLD_EXIT_CODE);
      } else {
        submitReceipt(result.receipt, result.exitCode);
      }
    });
  } catch {
    markOutputFailed();
    submitReceipt(asyncStdoutFailedReceipt(result.receipt), HOLD_EXIT_CODE);
  }
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  runDirectInvocation(process.argv.slice(2));
}
