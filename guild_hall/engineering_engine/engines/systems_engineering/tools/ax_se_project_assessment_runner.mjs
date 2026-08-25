#!/usr/bin/env node
// The AX/SE pilot command seam.
//
// The packet pin is decided over the raw bytes this command read, before any decode and
// before any parse, so a packet whose pin does not match is never trusted enough to be read
// as JSON. A refusal names the decision and nothing else: not the digest it computed, not the
// local path it was given, not a byte of the packet, and not the text of a read or parse error.
//
// Past that gate the command assesses the packet it was pinned to and speaks in one fixed
// receipt shape, whatever it decided. The command result and the project assessment state are
// separate facts: a project assessed cleanly is a command PASS whichever state it reached.
// This command performs no write, network, model, or ERP call.

import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';

import { canonicalise } from '../../../core/validators/canonical.mjs';
import { assertCanonCeiling } from '../../../core/validators/ceilings.mjs';
import { assessAxSeProject, buildAxSeAssessmentInput } from '../evaluator/ax_se_project_assessment.mjs';

export const AX_SE_PILOT_COMMAND_RECEIPT_SCHEMA =
  'soulforge.ax_se_project_assessment_pilot_command_receipt.v0';

export const CLI_CODES = Object.freeze({
  IO_INVALID: 'AX_SE_PILOT_IO_INVALID',
  ARGUMENTS_INVALID: 'AX_SE_PILOT_ARGUMENTS_INVALID',
  PACKET_UNREADABLE: 'AX_SE_PILOT_PACKET_UNREADABLE',
  PACKET_TOO_LARGE: 'AX_SE_PILOT_PACKET_TOO_LARGE',
  PACKET_HASH_MISMATCH: 'AX_SE_PILOT_PACKET_HASH_MISMATCH',
  PACKET_NOT_UTF8: 'AX_SE_PILOT_PACKET_NOT_UTF8',
  PACKET_NOT_JSON: 'AX_SE_PILOT_PACKET_NOT_JSON',
  PACKET_CONTRACT_REFUSED: 'AX_SE_PILOT_PACKET_CONTRACT_REFUSED',
  ASSESSMENT_REFUSED: 'AX_SE_PILOT_ASSESSMENT_REFUSED',
  OUTPUT_REFUSED: 'AX_SE_PILOT_OUTPUT_REFUSED',
  OUTPUT_TOO_LARGE: 'AX_SE_PILOT_OUTPUT_TOO_LARGE',
  STDOUT_FAILED: 'AX_SE_PILOT_STDOUT_FAILED',
});

const STAGE = Object.freeze({
  IO: 'io',
  ARGUMENTS: 'arguments',
  PACKET_READ: 'packet_read',
  PACKET_BINDING: 'packet_binding',
  PACKET_DECODE: 'packet_decode',
  PACKET_PARSE: 'packet_parse',
  PACKET_CONTRACT: 'packet_contract',
  ASSESSMENT: 'assessment',
  OUTPUT_PREPARE: 'output_prepare',
  STDOUT: 'stdout',
});
export const MAX_PACKET_BYTES = 2 * 1024 * 1024;
export const MAX_PACKET_PATH_CHARS = 4096;
export const MAX_RESULT_BYTES = 4 * 1024 * 1024;
const REQUIRED_FLAGS = Object.freeze(['--packet', '--packet-sha256']);
const ALLOWED_FLAGS = new Set(REQUIRED_FLAGS);
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const HOLD_EXIT_CODE = 2;
const PASS_EXIT_CODE = 0;
const RECEIPT_CANON_CLAIM_CEILING = assertCanonCeiling('observed');
const RECEIPT_MODE = 'read_only';
const STDOUT_STATE = Object.freeze({ SUBMITTED: 'submitted', PARTIAL_UNKNOWN: 'partial_unknown' });
const RECEIPT_SUBMISSION = Object.freeze({ SUBMITTED: 'submitted', FAILED: 'failed' });
const UTF8 = new TextDecoder('utf-8', { fatal: true });

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
});
const NO_PERSISTENCE = Object.freeze({ state: 'not_requested', persistent_file_writes: 0 });
const UNPINNED_PACKET = Object.freeze({ pin_verified: false, sha256: null, byte_count: null });
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

function receiptOf({
  result,
  blockerCode = null,
  blockerStage = null,
  packet = UNPINNED_PACKET,
  assessment = UNASSESSED,
  missionCandidateCount = null,
}) {
  return Object.freeze({
    schema_version: AX_SE_PILOT_COMMAND_RECEIPT_SCHEMA,
    mode: RECEIPT_MODE,
    result,
    blocker_code: blockerCode,
    blocker_stage: blockerStage,
    packet,
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

function held(blockerCode, blockerStage, packet = UNPINNED_PACKET) {
  return Object.freeze({
    exitCode: HOLD_EXIT_CODE,
    output: null,
    prepared: null,
    receipt: receiptOf({ result: 'HOLD', blockerCode, blockerStage, packet }),
  });
}

/**
 * Prepares an assessment output commitment before either process stream is invoked.
 */
function completed(packet, output, assessment) {
  return Object.freeze({
    exitCode: PASS_EXIT_CODE,
    output,
    prepared: Object.freeze({
      packet,
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
  assessment: assessed(prepared, STDOUT_STATE.SUBMITTED),
  missionCandidateCount: prepared.missionCandidateCount,
});

const undeliveredReceipt = (prepared) => receiptOf({
  result: 'HOLD',
  blockerCode: CLI_CODES.STDOUT_FAILED,
  blockerStage: STAGE.STDOUT,
  packet: prepared.packet,
  assessment: assessed(prepared, STDOUT_STATE.PARTIAL_UNKNOWN),
  missionCandidateCount: prepared.missionCandidateCount,
});

/**
 * Declares every array in one value insertion ordered, at the paths the canonical layer names.
 *
 * The assessment already fixed each of those orders, so a rule that re-sorted them here would
 * be this command deciding an order the subject had already decided.
 */
function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = '') => {
    if (Array.isArray(node)) {
      rules[path] = 'insertion_ordered';
      for (const child of node) visit(child, `${path}[]`);
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) visit(child, path ? `${path}.${key}` : key);
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
    if (lengthDescriptor === undefined || !('value' in lengthDescriptor)
        || lengthDescriptor.value !== ARGV_LENGTH) return null;
    const snapshot = [];
    for (let index = 0; index < ARGV_LENGTH; index += 1) {
      if (keys[index] !== String(index)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(argv, index);
      if (descriptor === undefined || !('value' in descriptor)
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
      if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
        return null;
      }
      if (typeof descriptor.value !== 'function' || types.isProxy(descriptor.value)) return null;
      streams[key] = descriptor.value;
    }
    return streams;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== REQUIRED_FLAGS.length * 2) return null;
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
  return REQUIRED_FLAGS.every((flag) => parsed.has(flag)) ? parsed : null;
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
      || path.length > MAX_PACKET_PATH_CHARS || !controlFree(path)) {
    return true;
  }
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

function oneNamedOrdinaryFile(held, named) {
  return held.isFile() && named.isFile() && held.ino !== 0n
    && held.nlink === 1n && named.nlink === 1n
    && held.dev === named.dev && held.ino === named.ino;
}

/**
 * Reads one bounded ordinary packet after descriptor/name identity checks.
 *
 * Node does not expose every Windows reparse tag through this API. This rejects the leaf links
 * reported by lstat, not every possible reparse ancestor. Any read or identity ambiguity is one
 * payload-free unreadable result.
 */
function readBoundedPacketBytes(path, maxBytes) {
  if (refusedPacketPath(path)) return { refusal: PACKET_READ.UNREADABLE };
  let fd = null;
  try {
    fd = openSync(path, 'r');
    const opened = fstatSync(fd, { bigint: true });
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
      const count = readSync(fd, bytes, offset, size - offset, offset);
      if (count === 0) return { refusal: PACKET_READ.UNREADABLE };
      offset += count;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, size) !== 0) {
      return { refusal: PACKET_READ.UNREADABLE };
    }

    const closing = fstatSync(fd, { bigint: true });
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
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // No write or persistent state was attempted through this read-only handle.
      }
    }
  }
}

function decide(argv) {
  const parsed = parseArgs(argv);
  if (parsed === null) return held(CLI_CODES.ARGUMENTS_INVALID, STAGE.ARGUMENTS);
  const pin = parsed.get('--packet-sha256');
  if (!SHA256_HEX.test(pin)) return held(CLI_CODES.ARGUMENTS_INVALID, STAGE.ARGUMENTS);

  const packet = readBoundedPacketBytes(parsed.get('--packet'), MAX_PACKET_BYTES);
  if (packet.bytes === undefined) {
    return held(
      packet.refusal === PACKET_READ.TOO_LARGE
        ? CLI_CODES.PACKET_TOO_LARGE
        : CLI_CODES.PACKET_UNREADABLE,
      STAGE.PACKET_READ,
    );
  }
  if (createHash('sha256').update(packet.bytes).digest('hex') !== pin) {
    return held(CLI_CODES.PACKET_HASH_MISMATCH, STAGE.PACKET_BINDING);
  }
  const verified = verifiedPacket(pin, packet.bytes.length);

  let text;
  try {
    text = UTF8.decode(packet.bytes);
  } catch {
    return held(CLI_CODES.PACKET_NOT_UTF8, STAGE.PACKET_DECODE, verified);
  }

  let request;
  try {
    request = JSON.parse(text);
  } catch {
    return held(CLI_CODES.PACKET_NOT_JSON, STAGE.PACKET_PARSE, verified);
  }

  let input;
  try {
    input = buildAxSeAssessmentInput(request);
  } catch {
    return held(CLI_CODES.PACKET_CONTRACT_REFUSED, STAGE.PACKET_CONTRACT, verified);
  }

  let assessment;
  try {
    assessment = assessAxSeProject(input);
  } catch {
    return held(CLI_CODES.ASSESSMENT_REFUSED, STAGE.ASSESSMENT, verified);
  }

  let output;
  try {
    output = `${canonicalise(assessment, insertionOrderRules(assessment))}\n`;
  } catch {
    return held(CLI_CODES.OUTPUT_REFUSED, STAGE.OUTPUT_PREPARE, verified);
  }
  if (Buffer.byteLength(output, 'utf8') > MAX_RESULT_BYTES) {
    return held(CLI_CODES.OUTPUT_TOO_LARGE, STAGE.OUTPUT_PREPARE, verified);
  }
  return completed(verified, output, assessment);
}

/**
 * Runs one pilot command and returns its exit code, receipt, and receipt submission state.
 *
 * `submitted` means the callback returned normally; it does not claim an OS flush. A writer
 * exception is contained, never echoed, and never retried. A failed stdout callback leaves the
 * prepared output state `partial_unknown` and changes the command result to HOLD. If stderr
 * submission fails, `receipt` remains the exact attempted receipt while `receiptSubmissionState`
 * says it was not submitted and the process exits 2; callers must interpret those fields together.
 */
export function runAxSeProjectAssessmentCli(argv, io = {}) {
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
  process.exitCode = runAxSeProjectAssessmentCli(process.argv.slice(2)).exitCode;
}
