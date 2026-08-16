#!/usr/bin/env node
// Read-only command seam for one raw-byte-pinned role-bound AX/SE packet.
//
// The expected logical-roster reference is supplied independently of the packet. The
// command verifies the raw packet pin before decoding, asks the pure v1 subject to verify
// the independent roster binding, and emits a payload-free stderr receipt with
// cryptographic commitments but no local paths or raw roster identifiers. The canonical
// stdout assessment intentionally retains its exact source bindings. Domain HOLD and
// UNKNOWN are successful assessment results.

import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';

import { canonicalise } from '../kernel/canonical.mjs';
import { assertCanonCeiling } from '../kernel/ceilings.mjs';
import { assessAxSeRoleBoundProject } from '../subjects/ax_se_project_role_bound_assessment.mjs';

export const AX_SE_ROLE_BOUND_COMMAND_RECEIPT_SCHEMA =
  'soulforge.ax_se_project_role_bound_assessment_command_receipt.v1';

export const CLI_CODES = Object.freeze({
  IO_INVALID: 'AX_SE_ROLE_BOUND_COMMAND_IO_INVALID',
  ARGUMENTS_INVALID: 'AX_SE_ROLE_BOUND_COMMAND_ARGUMENTS_INVALID',
  PACKET_UNREADABLE: 'AX_SE_ROLE_BOUND_COMMAND_PACKET_UNREADABLE',
  PACKET_TOO_LARGE: 'AX_SE_ROLE_BOUND_COMMAND_PACKET_TOO_LARGE',
  PACKET_HASH_MISMATCH: 'AX_SE_ROLE_BOUND_COMMAND_PACKET_HASH_MISMATCH',
  PACKET_NOT_UTF8: 'AX_SE_ROLE_BOUND_COMMAND_PACKET_NOT_UTF8',
  PACKET_NOT_JSON: 'AX_SE_ROLE_BOUND_COMMAND_PACKET_NOT_JSON',
  PACKET_CONTRACT_REFUSED: 'AX_SE_ROLE_BOUND_COMMAND_PACKET_CONTRACT_REFUSED',
  ROSTER_BINDING_REFUSED: 'AX_SE_ROLE_BOUND_COMMAND_ROSTER_BINDING_REFUSED',
  CAPABILITY_VOCABULARY_REFUSED:
    'AX_SE_ROLE_BOUND_COMMAND_CAPABILITY_VOCABULARY_REFUSED',
  ASSESSMENT_REFUSED: 'AX_SE_ROLE_BOUND_COMMAND_ASSESSMENT_REFUSED',
  OUTPUT_REFUSED: 'AX_SE_ROLE_BOUND_COMMAND_OUTPUT_REFUSED',
  OUTPUT_TOO_LARGE: 'AX_SE_ROLE_BOUND_COMMAND_OUTPUT_TOO_LARGE',
  STDOUT_FAILED: 'AX_SE_ROLE_BOUND_COMMAND_STDOUT_FAILED',
});

const STAGE = Object.freeze({
  IO: 'io',
  ARGUMENTS: 'arguments',
  PACKET_READ: 'packet_read',
  PACKET_BINDING: 'packet_binding',
  PACKET_DECODE: 'packet_decode',
  PACKET_PARSE: 'packet_parse',
  PACKET_CONTRACT: 'packet_contract',
  ROSTER_BINDING: 'roster_binding',
  ASSESSMENT: 'assessment',
  OUTPUT_PREPARE: 'output_prepare',
  STDOUT: 'stdout',
});

export const MAX_PACKET_BYTES = 2 * 1024 * 1024;
export const MAX_PACKET_PATH_CHARS = 4096;
export const MAX_RESULT_BYTES = 4 * 1024 * 1024;

const REQUIRED_FLAGS = Object.freeze([
  '--packet',
  '--packet-sha256',
  '--expected-role-roster-entity-id',
  '--expected-role-roster-revision-id',
  '--expected-role-roster-content-sha256',
]);
const ALLOWED_FLAGS = new Set(REQUIRED_FLAGS);
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const HOLD_EXIT_CODE = 2;
const PASS_EXIT_CODE = 0;
const RECEIPT_CANON_CLAIM_CEILING = assertCanonCeiling('observed');
const RECEIPT_MODE = 'read_only';
const RECEIPT_SUBMISSION = Object.freeze({ SUBMITTED: 'submitted', FAILED: 'failed' });
const STDOUT_STATE = Object.freeze({ SUBMITTED: 'submitted', PARTIAL_UNKNOWN: 'partial_unknown' });
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const ROSTER_FINGERPRINT_DOMAIN =
  'soulforge.ax_se_project_role_bound_assessment_expected_roster_ref.v1';

const NO_EFFECTS = Object.freeze({
  erp_writes: 0,
  filesystem_writes: 0,
  model_calls: 0,
  network_calls: 0,
  taskdriver_activated: false,
});
const NO_AUTHORITY = Object.freeze({
  stage_clear_allowed: false,
  owner_decision_made: false,
  task_intent_created: false,
  roster_approved: false,
  human_identity_bound: false,
  live_availability_claimed: false,
});
const NO_PERSISTENCE = Object.freeze({ state: 'not_requested', persistent_file_writes: 0 });
const UNPINNED_PACKET = Object.freeze({ pin_verified: false, sha256: null, byte_count: null });
const NO_ROSTER_BINDING = Object.freeze({
  expected_ref_supplied: false,
  expected_ref_verified: false,
  expected_ref_fingerprint_sha256: null,
});
const UNASSESSED = Object.freeze({
  completed: false,
  assessment_state: null,
  assessment_handle: null,
  prepared_output_sha256: null,
  prepared_output_byte_count: null,
  stdout_state: null,
});

const verifiedPacket = (pin, byteCount) => Object.freeze({
  pin_verified: true,
  sha256: pin,
  byte_count: byteCount,
});

const rosterBinding = (fingerprint, verified) => Object.freeze({
  expected_ref_supplied: true,
  expected_ref_verified: verified,
  expected_ref_fingerprint_sha256: fingerprint,
});

const expectedRosterRefFingerprint = (ref) => createHash('sha256')
  .update(`${ROSTER_FINGERPRINT_DOMAIN}\0`, 'utf8')
  .update(canonicalise(ref, {}), 'utf8')
  .digest('hex');

function receiptOf({
  result,
  blockerCode = null,
  blockerStage = null,
  packet = UNPINNED_PACKET,
  rosterBinding = NO_ROSTER_BINDING,
  assessment = UNASSESSED,
  missionCandidateCount = null,
}) {
  return Object.freeze({
    schema_version: AX_SE_ROLE_BOUND_COMMAND_RECEIPT_SCHEMA,
    mode: RECEIPT_MODE,
    result,
    blocker_code: blockerCode,
    blocker_stage: blockerStage,
    packet,
    roster_binding: rosterBinding,
    assessment,
    candidate_disposition: Object.freeze({
      candidate_only: true,
      mission_candidate_count: missionCandidateCount,
    }),
    persistence: NO_PERSISTENCE,
    effects: NO_EFFECTS,
    gates: NO_AUTHORITY,
    canon_claim_ceiling: RECEIPT_CANON_CLAIM_CEILING,
  });
}

function held(
  blockerCode,
  blockerStage,
  packet = UNPINNED_PACKET,
  rosterBinding = NO_ROSTER_BINDING,
) {
  return Object.freeze({
    exitCode: HOLD_EXIT_CODE,
    output: null,
    prepared: null,
    receipt: receiptOf({
      result: 'HOLD',
      blockerCode,
      blockerStage,
      packet,
      rosterBinding,
    }),
  });
}

function completed(packet, verifiedRosterBinding, output, assessment) {
  return Object.freeze({
    exitCode: PASS_EXIT_CODE,
    output,
    prepared: Object.freeze({
      packet,
      rosterBinding: verifiedRosterBinding,
      assessmentState: assessment.assessment_state,
      assessmentHandle: assessment.assessment_handle,
      outputSha256: createHash('sha256').update(output, 'utf8').digest('hex'),
      outputByteCount: Buffer.byteLength(output, 'utf8'),
      missionCandidateCount: assessment.next_mission_candidates.length,
    }),
    receipt: null,
  });
}

const assessed = (prepared, stdoutState) => Object.freeze({
  completed: true,
  assessment_state: prepared.assessmentState,
  assessment_handle: prepared.assessmentHandle,
  prepared_output_sha256: prepared.outputSha256,
  prepared_output_byte_count: prepared.outputByteCount,
  stdout_state: stdoutState,
});

const submittedReceipt = (prepared) => receiptOf({
  result: 'PASS',
  packet: prepared.packet,
  rosterBinding: prepared.rosterBinding,
  assessment: assessed(prepared, STDOUT_STATE.SUBMITTED),
  missionCandidateCount: prepared.missionCandidateCount,
});

const undeliveredReceipt = (prepared) => receiptOf({
  result: 'HOLD',
  blockerCode: CLI_CODES.STDOUT_FAILED,
  blockerStage: STAGE.STDOUT,
  packet: prepared.packet,
  rosterBinding: prepared.rosterBinding,
  assessment: assessed(prepared, STDOUT_STATE.PARTIAL_UNKNOWN),
  missionCandidateCount: prepared.missionCandidateCount,
});

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

const ARGV_LENGTH = REQUIRED_FLAGS.length * 2;
const IO_KEYS = new Set(['stdoutWrite', 'stderrWrite']);
const DEFAULT_IO = Object.freeze({
  stdoutWrite: (value) => process.stdout.write(value),
  stderrWrite: (value) => process.stderr.write(value),
});

function snapshotArgv(argv) {
  try {
    if (typeof argv !== 'object' || argv === null || types.isProxy(argv)) return null;
    if (!Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype) return null;
    const keys = Reflect.ownKeys(argv);
    if (keys.length !== ARGV_LENGTH + 1 || keys[ARGV_LENGTH] !== 'length') return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(argv, 'length');
    if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, 'value')
        || lengthDescriptor.value !== ARGV_LENGTH) return null;
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
    if (typeof io !== 'object' || io === null || types.isProxy(io)) return null;
    if (Object.getPrototypeOf(io) !== Object.prototype) return null;
    const streams = { ...DEFAULT_IO };
    for (const key of Reflect.ownKeys(io)) {
      if (typeof key !== 'string' || !IO_KEYS.has(key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(io, key);
      if (descriptor === undefined || descriptor.enumerable !== true
          || !Object.hasOwn(descriptor, 'value')) return null;
      if (typeof descriptor.value !== 'function' || types.isProxy(descriptor.value)) return null;
      streams[key] = descriptor.value;
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
  if (!REQUIRED_FLAGS.every((flag) => parsed.has(flag))) return null;
  if (!SHA256_HEX.test(parsed.get('--packet-sha256'))
      || !SHA256_HEX.test(parsed.get('--expected-role-roster-content-sha256'))
      || !TOKEN.test(parsed.get('--expected-role-roster-entity-id'))
      || !TOKEN.test(parsed.get('--expected-role-roster-revision-id'))) {
    return null;
  }
  return parsed;
}

const PACKET_READ = Object.freeze({ UNREADABLE: 'unreadable', TOO_LARGE: 'too_large' });
const WINDOWS_UNC_OR_DEVICE_NAMESPACE = /^[\\/]{2}/u;
const WINDOWS_DRIVE_DESIGNATOR = /^[A-Za-z]:(?=[\\/]|$)/u;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/u;
const WINDOWS_TRIMMED_SEGMENT = /[. ](?:[\\/]|$)/u;

function refusedPathForm(path) {
  if (process.platform !== 'win32') return false;
  if (WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(path)) return true;
  if (path.includes(':', WINDOWS_DRIVE_DESIGNATOR.test(path) ? 2 : 0)) return true;
  const leaf = path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1);
  return WINDOWS_DEVICE_NAME.test(leaf);
}

function controlFree(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

function refusedPacketPath(path) {
  if (typeof path !== 'string' || path.length === 0
      || path.length > MAX_PACKET_PATH_CHARS || !controlFree(path)) return true;
  if (process.platform !== 'win32') return !path.startsWith('/');
  if (!WINDOWS_ABSOLUTE_PATH.test(path)) return true;
  if (WINDOWS_TRIMMED_SEGMENT.test(path)) return true;
  return refusedPathForm(path);
}

export function fileState(stat) {
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

export const sameFileState = (left, right) => left !== null && right !== null
  && left.dev === right.dev && left.ino === right.ino
  && left.nlink === right.nlink && left.size === right.size
  && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;

function oneNamedOrdinaryFile(heldStat, namedStat) {
  return heldStat.isFile() && namedStat.isFile() && heldStat.ino !== 0n
    && heldStat.nlink === 1n && namedStat.nlink === 1n
    && heldStat.dev === namedStat.dev && heldStat.ino === namedStat.ino;
}

function readBoundedPacketBytes(path, maxBytes) {
  if (refusedPacketPath(path)) return { refusal: PACKET_READ.UNREADABLE };
  let descriptor = null;
  try {
    descriptor = openSync(path, 'r');
    const opened = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(path, { bigint: true });
    if (!oneNamedOrdinaryFile(opened, named) || opened.size === 0n) {
      return { refusal: PACKET_READ.UNREADABLE };
    }
    if (opened.size > BigInt(maxBytes)) return { refusal: PACKET_READ.TOO_LARGE };

    const openedState = fileState(opened);
    const namedState = fileState(named);
    if (openedState === null || namedState === null) {
      return { refusal: PACKET_READ.UNREADABLE };
    }
    const size = Number(opened.size);
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(descriptor, bytes, offset, size - offset, offset);
      if (count === 0) return { refusal: PACKET_READ.UNREADABLE };
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, size) !== 0) {
      return { refusal: PACKET_READ.UNREADABLE };
    }

    const closing = fstatSync(descriptor, { bigint: true });
    const closingNamed = lstatSync(path, { bigint: true });
    if (!oneNamedOrdinaryFile(closing, closingNamed)
        || !sameFileState(openedState, fileState(closing))
        || !sameFileState(namedState, fileState(closingNamed))) {
      return { refusal: PACKET_READ.UNREADABLE };
    }
    return { bytes };
  } catch {
    return { refusal: PACKET_READ.UNREADABLE };
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // The descriptor was opened in read-only mode and carries no persistent authority.
      }
    }
  }
}

function classifySubjectRefusal(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'AX_SE_ROLE_BOUND_ROSTER_BINDING_MISMATCH') {
    return [CLI_CODES.ROSTER_BINDING_REFUSED, STAGE.ROSTER_BINDING];
  }
  if (code === 'AX_SE_ROLE_BOUND_CAPABILITY_VOCABULARY_MISMATCH') {
    return [CLI_CODES.CAPABILITY_VOCABULARY_REFUSED, STAGE.ASSESSMENT];
  }
  if (code.startsWith('AX_SE_')) {
    return [CLI_CODES.PACKET_CONTRACT_REFUSED, STAGE.PACKET_CONTRACT];
  }
  return [CLI_CODES.ASSESSMENT_REFUSED, STAGE.ASSESSMENT];
}

function decide(argv) {
  const parsed = parseArgs(argv);
  if (parsed === null) return held(CLI_CODES.ARGUMENTS_INVALID, STAGE.ARGUMENTS);

  const expectedRosterRef = {
    entity_id: parsed.get('--expected-role-roster-entity-id'),
    revision_id: parsed.get('--expected-role-roster-revision-id'),
    content_id: `sha256:${parsed.get('--expected-role-roster-content-sha256')}`,
    content_hash_alg: 'sha256',
  };
  const expectedRefFingerprint = expectedRosterRefFingerprint(expectedRosterRef);
  const suppliedRosterBinding = rosterBinding(expectedRefFingerprint, false);
  const verifiedRosterBinding = rosterBinding(expectedRefFingerprint, true);

  const packetRead = readBoundedPacketBytes(parsed.get('--packet'), MAX_PACKET_BYTES);
  if (packetRead.bytes === undefined) {
    return held(
      packetRead.refusal === PACKET_READ.TOO_LARGE
        ? CLI_CODES.PACKET_TOO_LARGE
        : CLI_CODES.PACKET_UNREADABLE,
      STAGE.PACKET_READ,
      UNPINNED_PACKET,
      suppliedRosterBinding,
    );
  }
  const packetPin = parsed.get('--packet-sha256');
  if (createHash('sha256').update(packetRead.bytes).digest('hex') !== packetPin) {
    return held(
      CLI_CODES.PACKET_HASH_MISMATCH,
      STAGE.PACKET_BINDING,
      UNPINNED_PACKET,
      suppliedRosterBinding,
    );
  }
  const packetCommitment = verifiedPacket(packetPin, packetRead.bytes.length);

  let text;
  try {
    text = UTF8.decode(packetRead.bytes);
  } catch {
    return held(
      CLI_CODES.PACKET_NOT_UTF8,
      STAGE.PACKET_DECODE,
      packetCommitment,
      suppliedRosterBinding,
    );
  }

  let packet;
  try {
    packet = JSON.parse(text);
  } catch {
    return held(
      CLI_CODES.PACKET_NOT_JSON,
      STAGE.PACKET_PARSE,
      packetCommitment,
      suppliedRosterBinding,
    );
  }

  let assessment;
  try {
    assessment = assessAxSeRoleBoundProject(packet, expectedRosterRef);
  } catch (error) {
    const [blockerCode, blockerStage] = classifySubjectRefusal(error);
    return held(blockerCode, blockerStage, packetCommitment, suppliedRosterBinding);
  }

  let output;
  try {
    output = `${canonicalise(assessment, insertionOrderRules(assessment))}\n`;
  } catch {
    return held(
      CLI_CODES.OUTPUT_REFUSED,
      STAGE.OUTPUT_PREPARE,
      packetCommitment,
      verifiedRosterBinding,
    );
  }
  if (Buffer.byteLength(output, 'utf8') > MAX_RESULT_BYTES) {
    return held(
      CLI_CODES.OUTPUT_TOO_LARGE,
      STAGE.OUTPUT_PREPARE,
      packetCommitment,
      verifiedRosterBinding,
    );
  }
  return completed(packetCommitment, verifiedRosterBinding, output, assessment);
}

export function runAxSeProjectRoleBoundAssessmentCli(argv, io = {}) {
  const streams = snapshotIo(io);
  if (streams === null) {
    return {
      exitCode: HOLD_EXIT_CODE,
      receipt: receiptOf({
        result: 'HOLD',
        blockerCode: CLI_CODES.IO_INVALID,
        blockerStage: STAGE.IO,
      }),
      receiptSubmissionState: RECEIPT_SUBMISSION.FAILED,
    };
  }
  const decision = decide(snapshotArgv(argv));

  let { exitCode, receipt } = decision;
  if (decision.prepared !== null) {
    let submitted = true;
    try {
      streams.stdoutWrite(decision.output);
    } catch {
      submitted = false;
    }
    receipt = submitted
      ? submittedReceipt(decision.prepared)
      : undeliveredReceipt(decision.prepared);
    exitCode = submitted ? PASS_EXIT_CODE : HOLD_EXIT_CODE;
  }

  let receiptSubmissionState = RECEIPT_SUBMISSION.SUBMITTED;
  try {
    streams.stderrWrite(`${JSON.stringify(receipt)}\n`);
  } catch {
    receiptSubmissionState = RECEIPT_SUBMISSION.FAILED;
    exitCode = HOLD_EXIT_CODE;
  }
  return { exitCode, receipt, receiptSubmissionState };
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

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  process.exitCode = runAxSeProjectRoleBoundAssessmentCli(process.argv.slice(2)).exitCode;
}
