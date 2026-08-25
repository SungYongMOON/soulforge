// TDD: the AX·SE pilot command speaks in one closed receipt, whatever it decides.
//
// The command result and the project assessment state are separate facts. A project that holds,
// assessed cleanly, is a command that succeeded. A refused packet or failed output is not.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA,
  assessAxSeProject,
  buildAxSeAssessmentInput,
} from '../evaluator/ax_se_project_assessment.mjs';
import { CANON_CLAIM_CEILING, EVIDENCE_CLAIM_CEILING } from '../../../core/validators/ceilings.mjs';
import {
  CLI_CODES,
  runAxSeProjectAssessmentCli,
} from '../tools/ax_se_project_assessment_runner.mjs';
import * as runner from '../tools/ax_se_project_assessment_runner.mjs';

const RUNNER_SOURCE = new URL('../tools/ax_se_project_assessment_runner.mjs', import.meta.url);

const PILOT_COMMAND_RECEIPT_SCHEMA = 'soulforge.ax_se_project_assessment_pilot_command_receipt.v0';
const FIXTURE_URL = new URL('../../../../../docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_assessment_synthetic_v0.json', import.meta.url);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
const TEMP_ROOTS = [];
test.after(() => {
  for (const root of TEMP_ROOTS) rmSync(root, { recursive: true, force: true });
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const RECEIPT_KEYS = Object.freeze({
  receipt: [
    'assessment', 'blocker_code', 'blocker_stage', 'candidate_disposition', 'canon_claim_ceiling',
    'effects', 'gates', 'mode', 'packet', 'persistence', 'result', 'schema_version',
  ],
  packet: ['byte_count', 'pin_verified', 'sha256'],
  assessment: [
    'assessment_handle', 'assessment_state', 'completed', 'prepared_output_byte_count',
    'prepared_output_sha256', 'stdout_state',
  ],
  persistence: ['persistent_file_writes', 'state'],
  effects: [
    'erp_writes', 'filesystem_writes', 'model_calls', 'network_calls', 'taskdriver_activated',
  ],
  gates: ['owner_decision_made', 'stage_clear_allowed', 'task_intent_created'],
  candidate_disposition: ['candidate_only', 'mission_candidate_count'],
});
const NESTED_BLOCKS = Object.freeze([
  'assessment', 'candidate_disposition', 'effects', 'gates', 'packet', 'persistence',
]);
const RECEIPT_MODE = 'read_only';
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
const UNASSESSED = Object.freeze({
  completed: false,
  assessment_state: null,
  assessment_handle: null,
  prepared_output_sha256: null,
  prepared_output_byte_count: null,
  stdout_state: null,
});

function assertClosedReceiptShape(receipt, label) {
  const keysOf = (value) => Object.keys(value).sort();
  assert.deepEqual(keysOf(receipt), [...RECEIPT_KEYS.receipt].sort(), `${label}: receipt fields`);
  for (const block of NESTED_BLOCKS) {
    assert.equal(receipt[block] !== null && typeof receipt[block] === 'object', true,
      `${label}: ${block} is present in every receipt`);
    assert.deepEqual(keysOf(receipt[block]), [...RECEIPT_KEYS[block]].sort(),
      `${label}: ${block} fields`);
  }
  assert.equal(receipt.schema_version, PILOT_COMMAND_RECEIPT_SCHEMA, label);
  assert.equal(receipt.mode, RECEIPT_MODE, label);
  assert.equal(['PASS', 'HOLD'].includes(receipt.result), true, `${label}: ${receipt.result}`);
  assert.equal(Object.hasOwn(receipt, 'claim_ceiling'), false, `${label}: the axis is never bare`);
  assert.equal(receipt.canon_claim_ceiling, 'observed', label);
  assert.deepEqual(receipt.effects, NO_EFFECTS, label);
  assert.deepEqual(receipt.gates, NO_AUTHORITY, label);
  assert.equal(receipt.persistence.state, 'not_requested', label);
  assert.equal(receipt.persistence.persistent_file_writes, 0, label);
  assert.equal(receipt.candidate_disposition.candidate_only, true, label);
}

/** One small ordinary file whose bytes are not JSON, plus the pin this run must refuse. */
function unpinnedPacket() {
  const root = mkdtempSync(join(tmpdir(), 'ax-se-pilot-'));
  TEMP_ROOTS.push(root);
  const packetPath = join(root, 'context_packet.json');
  const bytes = '{ packet_payload_echo_marker, not json\n';
  writeFileSync(packetPath, bytes, 'utf8');
  const wrongSha256 = 'a'.repeat(64);
  const actualSha256 = sha256(bytes);
  assert.notEqual(wrongSha256, actualSha256, 'the refused pin must not be the actual digest');
  return { root, packetPath, actualSha256, wrongSha256 };
}

test('a packet pin mismatch holds at packet_binding without echoing the packet', async () => {
  const { root, packetPath, actualSha256, wrongSha256 } = unpinnedPacket();
  const out = [];
  const err = [];
  const run = await runAxSeProjectAssessmentCli(
    ['--packet', packetPath, '--packet-sha256', wrongSha256],
    { stdoutWrite: (value) => out.push(value), stderrWrite: (value) => err.push(value) },
  );

  assert.equal(run.exitCode, 2);
  assert.deepEqual(out, [], 'a held run emits no assessment on stdout');
  assert.equal(err.length, 1, 'a held run emits exactly one command receipt');
  assert.equal(err[0].endsWith('\n'), true);
  assert.equal(err[0].trimEnd().includes('\n'), false, 'the receipt is one JSON line');

  const receipt = JSON.parse(err[0]);
  assertClosedReceiptShape(receipt, 'a refused pin');
  assert.equal(receipt.result, 'HOLD');
  assert.equal(receipt.blocker_code, 'AX_SE_PILOT_PACKET_HASH_MISMATCH');
  assert.equal(receipt.blocker_stage, 'packet_binding');
  assert.equal(receipt.packet.pin_verified, false);
  assert.equal(receipt.packet.sha256, null);
  assert.equal(receipt.packet.byte_count, null);
  assert.deepEqual(receipt.assessment, UNASSESSED);

  // The refusal names no digest it computed, no local path, no packet bytes, and no read error.
  const emitted = err.join('');
  for (const forbidden of [
    actualSha256, root, packetPath, 'context_packet.json', 'packet_payload_echo_marker',
    'SyntaxError', 'Unexpected token', 'ENOENT',
  ]) {
    assert.equal(emitted.includes(forbidden), false, forbidden);
  }
});

/**
 * The exact builder request this pilot binds, projected from the public synthetic fixture.
 *
 * Every branch is cloned on its own. A request that arrives as bytes cannot hold the same object
 * in two places, so an in-memory request that aliased one would be refused for a reason the file
 * the command actually reads could never reproduce.
 */
function pilotRequest() {
  const source = structuredClone(FIXTURE.input);
  return {
    contextPacket: {
      schema_version: AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA,
      project_binding_ref: source.project_binding_ref,
      objective_ref: source.objective_ref,
      policy_ref: source.policy.policy_ref,
      project_snapshot_identity: {
        entity_id: source.snapshot.project_snapshot_ref.entity_id,
        revision_id: source.snapshot.project_snapshot_ref.revision_id,
      },
      observations: source.snapshot.observations,
      risks: source.snapshot.risks,
    },
    expectedProjectBindingRef: structuredClone(FIXTURE.input.project_binding_ref),
    policy: structuredClone(FIXTURE.input.policy),
    roles: structuredClone(FIXTURE.input.roles),
  };
}

/** One ordinary temp file holding the request, plus the pin taken over those exact raw bytes. */
function pinnedPacket(request) {
  const root = mkdtempSync(join(tmpdir(), 'ax-se-pilot-'));
  TEMP_ROOTS.push(root);
  const packetPath = join(root, 'context_packet.json');
  const bytes = `${JSON.stringify(request)}\n`;
  writeFileSync(packetPath, bytes, 'utf8');
  return { root, packetPath, pin: sha256(bytes) };
}

test('a pinned public packet completes and commits to exactly the assessment it emitted', async () => {
  const request = pilotRequest();
  const { root, packetPath, pin } = pinnedPacket(request);
  const out = [];
  const err = [];

  const run = await runAxSeProjectAssessmentCli(
    ['--packet', packetPath, '--packet-sha256', pin],
    { stdoutWrite: (value) => out.push(value), stderrWrite: (value) => err.push(value) },
  );

  assert.equal(run.exitCode, 0);
  assert.equal(out.length, 1, 'a completed run emits exactly one assessment');
  assert.equal(out[0].endsWith('\n'), true);
  assert.equal(out[0].trimEnd().includes('\n'), false, 'the assessment is one JSON line');

  // The command owns reading and pinning bytes, nothing else. What it emits is exactly what the
  // public builder and subject produce from the same request, computed here independently.
  assert.deepEqual(JSON.parse(out[0]), assessAxSeProject(buildAxSeAssessmentInput(request)));

  assert.equal(err.length, 1, 'a completed run emits exactly one command receipt');
  assert.equal(err[0].endsWith('\n'), true);
  assert.equal(err[0].trimEnd().includes('\n'), false, 'the receipt is one JSON line');

  const receipt = JSON.parse(err[0]);
  assertClosedReceiptShape(receipt, 'a pinned public packet');
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.blocker_code, null);
  assert.equal(receipt.blocker_stage, null);
  assert.equal(run.receiptSubmissionState, 'submitted');
  assert.equal(receipt.packet.pin_verified, true);
  assert.equal(receipt.packet.sha256, pin, 'a verified pin is the caller’s own supplied value');
  assert.equal(receipt.packet.byte_count, statSync(packetPath).size);

  // This is a prepared-output commitment. `submitted` means the callback returned normally;
  // it does not claim an OS-level flush or delivery acknowledgement.
  const emitted = JSON.parse(out[0]);
  assert.equal(receipt.assessment.completed, true);
  assert.equal(receipt.assessment.assessment_state, emitted.assessment_state);
  assert.equal(receipt.assessment.assessment_handle, emitted.assessment_handle);
  assert.equal(receipt.assessment.prepared_output_sha256, sha256(out[0]));
  assert.equal(receipt.assessment.prepared_output_byte_count, Buffer.byteLength(out[0], 'utf8'));
  assert.equal(receipt.assessment.stdout_state, 'submitted');
  assert.deepEqual(receipt.candidate_disposition, {
    candidate_only: true,
    mission_candidate_count: emitted.next_mission_candidates.length,
  });

  // A run that reported zero filesystem writes must have left the only directory it was told
  // about holding nothing but the file the caller put there.
  assert.deepEqual(readdirSync(root), ['context_packet.json'], 'the run creates no file of its own');
});

// The command decides in this order: arguments, one bounded ordinary file, the caller's pin,
// then decoding and parsing. Refusals identify only that decision and never echo local details.
const HOLD = Object.freeze({
  ARGUMENTS_INVALID: { code: 'AX_SE_PILOT_ARGUMENTS_INVALID', stage: 'arguments' },
  PACKET_UNREADABLE: { code: 'AX_SE_PILOT_PACKET_UNREADABLE', stage: 'packet_read' },
  PACKET_TOO_LARGE: { code: 'AX_SE_PILOT_PACKET_TOO_LARGE', stage: 'packet_read' },
  PACKET_HASH_MISMATCH: { code: 'AX_SE_PILOT_PACKET_HASH_MISMATCH', stage: 'packet_binding' },
  PACKET_NOT_UTF8: { code: 'AX_SE_PILOT_PACKET_NOT_UTF8', stage: 'packet_decode' },
  PACKET_NOT_JSON: { code: 'AX_SE_PILOT_PACKET_NOT_JSON', stage: 'packet_parse' },
  STDOUT_FAILED: { code: 'AX_SE_PILOT_STDOUT_FAILED', stage: 'stdout' },
});

const MAX_PACKET_BYTES = 2 * 1024 * 1024;
const PAYLOAD_MARKER = 'packet_payload_echo_marker';
const FORBIDDEN_ERROR_TEXT = Object.freeze([
  'SyntaxError', 'TypeError', 'RangeError', 'Unexpected token', 'Unexpected end',
  'ENOENT', 'EISDIR', 'EACCES', 'ELOOP', 'EPERM', 'ERR_ENCODING_INVALID_ENCODED_DATA',
]);
const spellings = (value) => [value, JSON.stringify(value).slice(1, -1)];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'ax-se-pilot-'));
  TEMP_ROOTS.push(root);
  return root;
}

function packetFile(root, name, bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  const path = join(root, name);
  writeFileSync(path, buffer);
  return { path, pin: sha256(buffer), byteCount: buffer.byteLength };
}

function filler(size) {
  const bytes = Buffer.alloc(size, 0x61);
  bytes.write(PAYLOAD_MARKER, 0, 'utf8');
  return bytes;
}

async function runCli(argv) {
  const out = [];
  const err = [];
  const run = await runAxSeProjectAssessmentCli(argv, {
    stdoutWrite: (value) => out.push(value),
    stderrWrite: (value) => err.push(value),
  });
  return { run, out, err };
}

async function heldAt(argv, hold, options) {
  const {
    root, contents, pinVerified = false, pin = null, byteCount = null,
    forbidden = [], label = hold.code,
  } = options;
  const { run, out, err } = await runCli(argv);

  assert.equal(run.exitCode, 2, label);
  assert.equal(run.receiptSubmissionState, 'submitted', label);
  assert.deepEqual(out, [], `${label}: a held run emits no assessment on stdout`);
  assert.equal(err.length, 1, `${label}: a held run emits exactly one command receipt`);
  assert.equal(err[0].endsWith('\n'), true, label);
  assert.equal(err[0].trimEnd().includes('\n'), false, `${label}: the receipt is one JSON line`);

  const receipt = JSON.parse(err[0]);
  assertClosedReceiptShape(receipt, label);
  assert.equal(receipt.result, 'HOLD', label);
  assert.equal(receipt.blocker_code, hold.code, label);
  assert.equal(receipt.blocker_stage, hold.stage, label);
  assert.equal(receipt.packet.pin_verified, pinVerified, label);
  assert.equal(receipt.packet.sha256, pin, label);
  assert.equal(receipt.packet.byte_count, byteCount, label);
  assert.deepEqual(receipt.assessment, UNASSESSED, `${label}: a hold assesses nothing`);
  assert.deepEqual(receipt.candidate_disposition,
    { candidate_only: true, mission_candidate_count: null }, label);

  const emitted = err.join('');
  for (const value of [...forbidden.flatMap(spellings), ...FORBIDDEN_ERROR_TEXT, PAYLOAD_MARKER]) {
    assert.equal(emitted.includes(value), false, `${label}: ${value}`);
  }
  assert.deepEqual(readdirSync(root).sort(), [...contents].sort(),
    `${label}: a held run creates no file of its own`);
  return receipt;
}

test('the argument surface is exact and closed, and no mistake in it opens a packet', async () => {
  const root = tempRoot();
  const packet = packetFile(root, 'context_packet.json', `${JSON.stringify(pilotRequest())}\n`);
  const absent = join(root, 'no_such_packet.json');
  const cases = [
    ['no arguments at all', []],
    ['the packet flag alone', ['--packet', packet.path]],
    ['the pin flag alone', ['--packet-sha256', packet.pin]],
    ['a duplicated packet flag', ['--packet', packet.path, '--packet', packet.path]],
    ['a duplicated pin flag', ['--packet-sha256', packet.pin, '--packet-sha256', packet.pin]],
    ['an unknown flag in place of a required one', ['--packet', packet.path, '--sha256', packet.pin]],
    ['an extra unknown flag',
      ['--packet', packet.path, '--packet-sha256', packet.pin, '--verbose', 'yes']],
    ['a valueless flag', ['--packet', packet.path, '--packet-sha256']],
    ['an empty value', ['--packet', '', '--packet-sha256', packet.pin]],
    ['a flag where a value belongs',
      ['--packet', '--packet-sha256', '--packet-sha256', packet.pin]],
    ['an uppercase pin', ['--packet', packet.path, '--packet-sha256', packet.pin.toUpperCase()]],
    ['a short pin', ['--packet', packet.path, '--packet-sha256', packet.pin.slice(0, 63)]],
    ['a long pin', ['--packet', packet.path, '--packet-sha256', `${packet.pin}a`]],
    ['a non-hex pin', ['--packet', packet.path, '--packet-sha256', 'g'.repeat(64)]],
    ['a bad pin over an absent packet', ['--packet', absent, '--packet-sha256', 'A'.repeat(64)]],
  ];
  for (const [label, argv] of cases) {
    await heldAt(argv, HOLD.ARGUMENTS_INVALID, {
      root,
      contents: ['context_packet.json'],
      forbidden: [root, packet.path, absent, 'context_packet.json'],
      label,
    });
  }
});

test('a packet is bounded before it is read, and the exact ceiling still reaches the pin',
  async () => {
    const root = tempRoot();
    const empty = packetFile(root, 'empty_packet.json', Buffer.alloc(0));
    const at = packetFile(root, 'at_ceiling.json', filler(MAX_PACKET_BYTES));
    const over = packetFile(root, 'over_ceiling.json', filler(MAX_PACKET_BYTES + 1));
    const contents = ['at_ceiling.json', 'empty_packet.json', 'over_ceiling.json'];
    assert.equal(statSync(at.path).size, MAX_PACKET_BYTES);
    assert.equal(statSync(over.path).size, MAX_PACKET_BYTES + 1);

    await heldAt(['--packet', empty.path, '--packet-sha256', empty.pin], HOLD.PACKET_UNREADABLE,
      { root, contents, forbidden: [root, empty.path], label: 'an empty packet' });
    await heldAt(['--packet', at.path, '--packet-sha256', 'b'.repeat(64)],
      HOLD.PACKET_HASH_MISMATCH,
      { root, contents, forbidden: [root, at.path, at.pin], label: 'a packet at the ceiling' });
    await heldAt(['--packet', over.path, '--packet-sha256', over.pin], HOLD.PACKET_TOO_LARGE,
      { root, contents, forbidden: [root, over.path], label: 'a packet one byte over' });
  });

test('a directory, a hard link, a symlink, and an alternate data stream are not packets',
  async (t) => {
    const root = tempRoot();
    const request = `${JSON.stringify(pilotRequest())}\n`;
    const packet = packetFile(root, 'context_packet.json', request);
    const contents = ['context_packet.json'];
    const targets = [];

    mkdirSync(join(root, 'a_directory'));
    contents.push('a_directory');
    targets.push(['a directory', join(root, 'a_directory'), packet.pin]);

    let hardLinked = false;
    try {
      linkSync(packet.path, join(root, 'a_hard_link.json'));
      contents.push('a_hard_link.json');
      targets.push(['a hard link', join(root, 'a_hard_link.json'), packet.pin]);
      hardLinked = true;
    } catch {
      t.diagnostic('this platform does not permit creating a hard link; that case is not run');
    }

    try {
      symlinkSync(packet.path, join(root, 'a_symlink.json'), 'file');
      contents.push('a_symlink.json');
      targets.push(['a symlink', join(root, 'a_symlink.json'), packet.pin]);
    } catch {
      t.diagnostic('this platform does not permit creating a file symlink; that case is not run');
    }

    if (process.platform === 'win32') {
      const stream = `${packet.path}:packet`;
      try {
        writeFileSync(stream, request, 'utf8');
        targets.push(['an alternate data stream', stream, packet.pin]);
      } catch {
        t.diagnostic('this filesystem carries no alternate data streams; that case is not run');
      }
    } else {
      targets.push(['a character device', '/dev/null', sha256(Buffer.alloc(0))]);
    }

    for (const [label, path, pin] of targets) {
      await heldAt(['--packet', path, '--packet-sha256', pin], HOLD.PACKET_UNREADABLE,
        { root, contents, forbidden: [root, path], label });
    }

    if (hardLinked) {
      await heldAt(['--packet', packet.path, '--packet-sha256', packet.pin],
        HOLD.PACKET_UNREADABLE,
        { root, contents, forbidden: [root, packet.path], label: 'an aliased packet' });
    }
  });

test('an undecodable packet and an unparseable one hold at distinct decisions past the pin',
  async () => {
    const root = tempRoot();
    const undecodable = packetFile(root, 'not_utf8.json', Buffer.concat([
      Buffer.from(`{"note":"${PAYLOAD_MARKER}`, 'utf8'),
      Buffer.from([0xff, 0xfe]),
      Buffer.from('"}\n', 'utf8'),
    ]));
    const unparseable = packetFile(root, 'not_json.json', `{ ${PAYLOAD_MARKER}, not json\n`);
    const contents = ['not_json.json', 'not_utf8.json'];

    const decoded = await heldAt(
      ['--packet', undecodable.path, '--packet-sha256', undecodable.pin], HOLD.PACKET_NOT_UTF8,
      {
        root, contents, pinVerified: true, pin: undecodable.pin, byteCount: undecodable.byteCount,
        forbidden: [root, undecodable.path],
      },
    );
    const parsed = await heldAt(
      ['--packet', unparseable.path, '--packet-sha256', unparseable.pin], HOLD.PACKET_NOT_JSON,
      {
        root, contents, pinVerified: true, pin: unparseable.pin, byteCount: unparseable.byteCount,
        forbidden: [root, unparseable.path],
      },
    );

    assert.notEqual(decoded.blocker_code, parsed.blocker_code);
    assert.notEqual(decoded.blocker_stage, parsed.blocker_stage);
    for (const receipt of [decoded, parsed]) {
      assert.notEqual(receipt.blocker_code, 'AX_SE_PILOT_RUN_INCOMPLETE');
    }
  });

const exactRef = (id, fill) => ({
  entity_id: id,
  revision_id: `${id}-r1`,
  content_id: `sha256:${fill.repeat(64)}`,
  content_hash_alg: 'sha256',
});

function unknownRequest() {
  const request = pilotRequest();
  request.contextPacket.observations = request.contextPacket.observations.filter(
    (row) => row.requirement_id !== 'srr_review_actions_closed',
  );
  request.contextPacket.risks[0].state = 'closed';
  return request;
}

function readyRequest() {
  const request = pilotRequest();
  request.contextPacket.observations.find(
    (row) => row.requirement_id === 'srr_review_actions_closed',
  ).presence_state = 'present';
  request.contextPacket.observations.push({
    requirement_id: 'sfr_functional_baseline',
    presence_state: 'present',
    observation_attempt_ref: 'observation:synthetic:sfr-functional-baseline',
    artifact_revision_ref: exactRef('synthetic-functional-baseline-artifact', 'f'),
    valid_at: '2026-08-01T00:00:00.000Z',
    known_at: '2026-08-02T00:00:00.000Z',
    evidence_refs: [exactRef('synthetic-functional-baseline-evidence', '0')],
  });
  request.contextPacket.risks[0].state = 'closed';
  return request;
}

const ASSESSMENT_STATES = Object.freeze([
  ['a held project', pilotRequest, 'HOLD'],
  ['an unknown project', unknownRequest, 'UNKNOWN'],
  ['an evidenced project', readyRequest, 'READY_FOR_OWNER_REVIEW'],
]);

test('a valid packet passes at every assessment state the subject can reach', async () => {
  for (const [label, build, state] of ASSESSMENT_STATES) {
    const request = build();
    const expected = assessAxSeProject(buildAxSeAssessmentInput(request));
    assert.equal(expected.assessment_state, state, `${label}: the request reaches this state`);

    const { root, packetPath, pin } = pinnedPacket(request);
    const { run, out, err } = await runCli(['--packet', packetPath, '--packet-sha256', pin]);

    assert.equal(run.exitCode, 0, `${label}: an assessed project is a completed command`);
    assert.equal(run.receiptSubmissionState, 'submitted', label);
    assert.equal(out.length, 1, label);
    assert.deepEqual(JSON.parse(out[0]), expected, label);

    const receipt = JSON.parse(err[0]);
    assertClosedReceiptShape(receipt, label);
    assert.equal(receipt.result, 'PASS', `${label}: a project hold is not a command hold`);
    assert.equal(receipt.blocker_code, null, label);
    assert.equal(receipt.blocker_stage, null, label);
    assert.equal(receipt.assessment.completed, true, label);
    assert.equal(receipt.assessment.assessment_state, state, label);
    assert.equal(receipt.assessment.assessment_handle, expected.assessment_handle, label);
    assert.equal(receipt.assessment.stdout_state, 'submitted', label);
    assert.equal(receipt.assessment.prepared_output_sha256, sha256(out[0]), label);
    assert.equal(receipt.assessment.prepared_output_byte_count,
      Buffer.byteLength(out[0], 'utf8'), label);
    assert.equal(receipt.candidate_disposition.mission_candidate_count,
      expected.next_mission_candidates.length, label);
    assert.deepEqual(readdirSync(root), ['context_packet.json'],
      `${label}: the run creates no file of its own`);
  }
});

test('a stage with nothing open is a review candidate, never a cleared stage', async () => {
  const { packetPath, pin } = pinnedPacket(readyRequest());
  const { run, out, err } = await runCli(['--packet', packetPath, '--packet-sha256', pin]);
  const receipt = JSON.parse(err[0]);

  assert.equal(run.exitCode, 0);
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.assessment.assessment_state, 'READY_FOR_OWNER_REVIEW');
  const assessment = JSON.parse(out[0]);
  assert.equal(assessment.current_stage.floor_status, 'active');
  assert.equal(assessment.next_mission_candidates.length, 0);
  assert.deepEqual(receipt.gates, NO_AUTHORITY);
  assert.deepEqual(receipt.candidate_disposition, {
    candidate_only: true,
    mission_candidate_count: 0,
  });
  assert.deepEqual(receipt.effects, NO_EFFECTS);
});

test('a stdout writer that fails holds without claiming the assessment reached anyone', async () => {
  const request = pilotRequest();
  const { root, packetPath, pin } = pinnedPacket(request);
  const argv = ['--packet', packetPath, '--packet-sha256', pin];
  const prepared = (await runCli(argv)).out[0];
  const marker = 'stdout_write_failure_echo_marker';
  const writers = [
    ['a writer that throws before any character', () => () => { throw new Error(marker); }],
    ['a writer that throws after one character', (seen) => (value) => {
      seen.push(value.slice(0, 1));
      throw new Error(marker);
    }],
  ];

  for (const [label, writerFor] of writers) {
    const seen = [];
    const err = [];
    const run = await runAxSeProjectAssessmentCli(argv, {
      stdoutWrite: writerFor(seen),
      stderrWrite: (value) => err.push(value),
    });

    assert.equal(run.exitCode, 2, `${label}: an undelivered assessment is a command hold`);
    assert.equal(run.receiptSubmissionState, 'submitted', label);
    assert.equal(err.length, 1, `${label}: exactly one receipt, never a second`);
    assert.equal(seen.join('').length <= 1, true, label);

    const receipt = JSON.parse(err[0]);
    assertClosedReceiptShape(receipt, label);
    assert.equal(receipt.result, 'HOLD', label);
    assert.equal(receipt.blocker_code, 'AX_SE_PILOT_STDOUT_FAILED', label);
    assert.equal(receipt.blocker_stage, 'stdout', label);
    assert.equal(receipt.assessment.stdout_state, 'partial_unknown', label);
    assert.equal(receipt.assessment.completed, true, label);
    assert.equal(receipt.assessment.assessment_state, 'HOLD', label);
    assert.equal(receipt.assessment.prepared_output_sha256, sha256(prepared), label);
    assert.equal(receipt.assessment.prepared_output_byte_count,
      Buffer.byteLength(prepared, 'utf8'), label);
    assert.equal(receipt.packet.pin_verified, true, label);
    assert.equal(receipt.packet.sha256, pin, label);

    const emitted = err.join('');
    assert.equal(emitted.includes('PASS'), false, `${label}: a failed delivery is never a pass`);
    for (const value of [
      marker, 'Error', 'stack', root, packetPath, 'context_packet.json', PAYLOAD_MARKER,
      ...FORBIDDEN_ERROR_TEXT,
    ]) {
      assert.equal(emitted.includes(value), false, `${label}: ${value}`);
    }
    assert.deepEqual(readdirSync(root), ['context_packet.json'], label);
  }
});

test('a failing receipt writer is contained, counted once, and never retried', async () => {
  const { packetPath, pin } = pinnedPacket(pilotRequest());
  const marker = 'stderr_write_failure_echo_marker';
  const cases = [
    ['a completed run', ['--packet', packetPath, '--packet-sha256', pin], 'PASS', 1],
    ['a refused run', ['--packet', packetPath], 'HOLD', 0],
  ];

  for (const [label, argv, result, stdoutLines] of cases) {
    let attempts = 0;
    const out = [];
    const run = await runAxSeProjectAssessmentCli(argv, {
      stdoutWrite: (value) => out.push(value),
      stderrWrite: () => { attempts += 1; throw new Error(marker); },
    });

    assert.equal(attempts, 1, `${label}: the receipt writer is called exactly once`);
    assert.equal(run.receiptSubmissionState, 'failed', label);
    assert.equal(run.exitCode, 2, `${label}: an unsubmitted receipt is not a successful command`);
    assert.equal(out.length, stdoutLines, label);
    assertClosedReceiptShape(run.receipt, label);
    assert.equal(run.receipt.result, result, label);
  }

  const { run } = await runCli(['--packet', packetPath, '--packet-sha256', pin]);
  assert.equal(run.receiptSubmissionState, 'submitted', 'a writer that returns submitted it');
  assert.equal(run.exitCode, 0);
});

test('the same packet replays byte for byte, whichever order the flags arrive in', async () => {
  const { packetPath, pin } = pinnedPacket(pilotRequest());
  const first = await runCli(['--packet', packetPath, '--packet-sha256', pin]);
  const again = await runCli(['--packet', packetPath, '--packet-sha256', pin]);
  const permuted = await runCli(['--packet-sha256', pin, '--packet', packetPath]);

  for (const replay of [again, permuted]) {
    assert.equal(replay.run.exitCode, first.run.exitCode);
    assert.equal(replay.out[0], first.out[0]);
    assert.equal(replay.err[0], first.err[0]);
  }
  assert.equal(
    JSON.parse(first.err[0]).assessment.prepared_output_byte_count,
    Buffer.byteLength(first.out[0], 'utf8'),
  );
});

test('every fixed refusal this command can name is distinct and exported', () => {
  const codes = Object.values(HOLD).map((decision) => decision.code);
  assert.equal(new Set(codes).size, codes.length, 'each decision carries its own code');
  const exported = new Set(Object.values(CLI_CODES));
  for (const code of codes) assert.equal(exported.has(code), true, code);
});

test('the command receipt names its canon ceiling axis explicitly', () => {
  assert.equal(CANON_CLAIM_CEILING.includes('observed'), true);
  assert.equal(EVIDENCE_CLAIM_CEILING.includes('observed'), false);
});

test('an unmeasured nanosecond timestamp is not accepted as a matching file state', () => {
  const measured = {
    dev: 1n, ino: 2n, nlink: 1n, size: 3n, mtimeNs: 4n, ctimeNs: 5n,
  };
  const narrowed = { ...measured, mtimeNs: 4, ctimeNs: 5 };
  assert.notEqual(runner.fileState(measured), null);
  assert.equal(runner.fileState(narrowed), null);
  assert.equal(runner.sameFileState(null, null), false);
  assert.equal(
    runner.sameFileState(runner.fileState(measured), runner.fileState(measured)),
    true,
  );
});

test('the packet is never taken with a whole-file convenience read', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../tools/ax_se_project_assessment_runner.mjs', import.meta.url)),
    'utf8',
  );
  assert.equal(source.includes('readFileSync'), false);
});

const PROXY_TRAPS = Object.freeze([
  'apply', 'construct', 'defineProperty', 'deleteProperty', 'get', 'getOwnPropertyDescriptor',
  'getPrototypeOf', 'has', 'isExtensible', 'ownKeys', 'preventExtensions', 'set',
  'setPrototypeOf',
]);

function countingProxy(target) {
  const trapCalls = [];
  const handler = {};
  for (const trap of PROXY_TRAPS) {
    handler[trap] = (...args) => {
      trapCalls.push(trap);
      return Reflect[trap](...args);
    };
  }
  return { proxy: new Proxy(target, handler), trapCalls };
}

test('argv is one exact ordinary dense array of four primitive strings, refused unread otherwise',
  async () => {
    const { root, packetPath, pin } = pinnedPacket(pilotRequest());
    const valid = () => ['--packet', packetPath, '--packet-sha256', pin];

    const rooted = countingProxy(valid());
    const trapMarker = 'argv_trap_echo_marker';
    const throwing = new Proxy(valid(), Object.fromEntries(
      PROXY_TRAPS.map((trap) => [trap, () => { throw new Error(trapMarker); }]),
    ));
    let accessorReads = 0;
    const accessor = valid();
    Object.defineProperty(accessor, 1, {
      get() { accessorReads += 1; return packetPath; },
      enumerable: true,
      configurable: true,
    });
    const sparse = valid();
    delete sparse[3];
    const named = valid();
    named.extra = 'a named own property';
    const symboled = valid();
    symboled[Symbol('extra')] = 'a symbol own property';
    const reprototyped = Object.setPrototypeOf(valid(), Object.create(Array.prototype));

    const cases = [
      ['a root proxy over a valid argv', rooted.proxy, []],
      ['a proxy whose every trap throws', throwing, [trapMarker]],
      ['an accessor element', accessor, []],
      ['a sparse argv with one hole', sparse, []],
      ['a named own property', named, []],
      ['a symbol own property', symboled, []],
      ['a custom array prototype', reprototyped, []],
    ];
    for (const [label, argv, alsoForbidden] of cases) {
      await heldAt(argv, HOLD.ARGUMENTS_INVALID, {
        root,
        contents: ['context_packet.json'],
        forbidden: [root, packetPath, ...alsoForbidden],
        label,
      });
    }

    assert.equal(rooted.trapCalls.length, 0, 'a root proxy argv is refused without one trap call');
    assert.equal(accessorReads, 0, 'an accessor element is refused without being read');
  });

test('io is one exact ordinary pair of plain stream functions, refused uninvoked otherwise',
  async () => {
    const { root, packetPath, pin } = pinnedPacket(pilotRequest());
    const argv = ['--packet', packetPath, '--packet-sha256', pin];
    const supplied = [];
    const writer = (name) => (value) => { supplied.push([name, value]); };
    const validIo = () => ({ stdoutWrite: writer('stdout'), stderrWrite: writer('stderr') });

    const rooted = countingProxy(validIo());
    const proxiedFunction = countingProxy(writer('proxied function'));
    let accessorReads = 0;
    const accessor = { stderrWrite: writer('stderr') };
    Object.defineProperty(accessor, 'stdoutWrite', {
      get() { accessorReads += 1; return writer('accessor'); },
      enumerable: true,
      configurable: true,
    });

    const cases = [
      ['a root proxy over a valid io', rooted.proxy],
      ['an accessor property', accessor],
      ['an unknown own property', { ...validIo(), extra: writer('extra') }],
      ['a symbol own property', { ...validIo(), [Symbol('extra')]: writer('symbol') }],
      ['a custom prototype', Object.assign(Object.create({ inherited: true }), validIo())],
      ['a proxied stream function',
        { stdoutWrite: proxiedFunction.proxy, stderrWrite: writer('stderr') }],
      ['a string where a stream function belongs',
        { stdoutWrite: 'not a function', stderrWrite: writer('stderr') }],
    ];

    const trusted = [];
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    process.stdout.write = (value) => { trusted.push(['stdout', value]); return true; };
    process.stderr.write = (value) => { trusted.push(['stderr', value]); return true; };
    try {
      for (const [label, io] of cases) {
        const run = await runAxSeProjectAssessmentCli(argv, io);

        assert.equal(run.exitCode, 2, `${label}: an untrusted io is a command hold`);
        assert.equal(run.receiptSubmissionState, 'failed',
          `${label}: no stream is handed the receipt`);
        assertClosedReceiptShape(run.receipt, label);
        assert.equal(run.receipt.result, 'HOLD', label);
        assert.equal(run.receipt.blocker_code, 'AX_SE_PILOT_IO_INVALID', label);
        assert.equal(run.receipt.blocker_stage, 'io', label);
        assert.equal(run.receipt.packet.pin_verified, false, label);
        assert.equal(run.receipt.packet.sha256, null, label);
        assert.equal(run.receipt.packet.byte_count, null, label);
        assert.deepEqual(run.receipt.assessment, UNASSESSED,
          `${label}: an untrusted io assesses nothing`);
        assert.deepEqual(run.receipt.candidate_disposition,
          { candidate_only: true, mission_candidate_count: null }, label);

        const rendered = JSON.stringify(run.receipt);
        for (const value of [...[root, packetPath].flatMap(spellings), ...FORBIDDEN_ERROR_TEXT]) {
          assert.equal(rendered.includes(value), false, `${label}: ${value}`);
        }
      }
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    assert.deepEqual(trusted, [], 'no trusted process stream callback ran');
    assert.deepEqual(supplied, [], 'no supplied stream callback ran');
    assert.equal(rooted.trapCalls.length, 0, 'a root proxy io is refused without one trap call');
    assert.equal(proxiedFunction.trapCalls.length, 0,
      'a proxied stream function is refused without one trap call or invocation');
    assert.equal(accessorReads, 0, 'an accessor property is refused without being read');
    assert.equal(Object.values(CLI_CODES).includes('AX_SE_PILOT_IO_INVALID'), true,
      'the io refusal is a fixed exported code');
    assert.deepEqual(readdirSync(root), ['context_packet.json'],
      'a refused io creates no file of its own');
  });

const MAX_PACKET_PATH_CHARS = 4096;
const MAX_RESULT_BYTES = 4 * 1024 * 1024;
const CONTRACT_REFUSED = Object.freeze({
  code: 'AX_SE_PILOT_PACKET_CONTRACT_REFUSED', stage: 'packet_contract',
});
const RESULT_CODES = Object.freeze([
  'AX_SE_PILOT_ASSESSMENT_REFUSED', 'AX_SE_PILOT_OUTPUT_REFUSED', 'AX_SE_PILOT_OUTPUT_TOO_LARGE',
]);

test('a relative packet path is refused unopened, and the absolute form of it still passes',
  async (t) => {
    assert.equal(runner.MAX_PACKET_PATH_CHARS, MAX_PACKET_PATH_CHARS,
      'the packet path ceiling is one fixed exported number');
    assert.equal(runner.MAX_RESULT_BYTES, MAX_RESULT_BYTES,
      'the result ceiling is one fixed exported number');

    const root = tempRoot();
    const request = pilotRequest();
    const packet = packetFile(root, 'context_packet.json', `${JSON.stringify(request)}\n`);
    const contents = ['context_packet.json'];

    const relativePath = relative(process.cwd(), packet.path);
    if (isAbsolute(relativePath) || resolve(relativePath) !== resolve(packet.path)) {
      t.diagnostic('this directory reaches no relative form of the packet; that case is not run');
    } else {
      await heldAt(['--packet', relativePath, '--packet-sha256', packet.pin],
        HOLD.PACKET_UNREADABLE, {
          root,
          contents,
          forbidden: [root, packet.path, relativePath, process.cwd()],
          label: 'a relative packet path',
        });
    }

    const { run, out, err } = await runCli(
      ['--packet', packet.path, '--packet-sha256', packet.pin],
    );
    assert.equal(run.exitCode, 0, 'an absolute packet path still reaches the assessment');
    assert.equal(out.length, 1);
    assert.deepEqual(JSON.parse(out[0]), assessAxSeProject(buildAxSeAssessmentInput(request)));

    const receipt = JSON.parse(err[0]);
    assertClosedReceiptShape(receipt, 'an absolute packet path');
    assert.equal(receipt.result, 'PASS');
    assert.equal(receipt.packet.pin_verified, true);
    assert.equal(receipt.packet.sha256, packet.pin);
    assert.deepEqual(readdirSync(root), contents, 'the run creates no file of its own');
  });

test('a packet bound to another exact project is refused at its contract, past a verified pin',
  async () => {
    const root = tempRoot();
    const request = pilotRequest();
    request.expectedProjectBindingRef = exactRef('synthetic-other-bound-project', '1');
    assert.notDeepEqual(request.expectedProjectBindingRef,
      request.contextPacket.project_binding_ref, 'the two bindings are different exact refs');
    assert.throws(() => buildAxSeAssessmentInput(structuredClone(request)),
      (error) => error.code === 'AX_SE_PROJECT_BINDING_MISMATCH',
      'the subject refuses this request on its own');

    const packet = packetFile(root, 'context_packet.json', `${JSON.stringify(request)}\n`);
    const receipt = await heldAt(
      ['--packet', packet.path, '--packet-sha256', packet.pin], CONTRACT_REFUSED, {
        root,
        contents: ['context_packet.json'],
        pinVerified: true,
        pin: packet.pin,
        byteCount: packet.byteCount,
        forbidden: [
          root, packet.path, 'ContractError', 'AX_SE_PROJECT_BINDING_MISMATCH',
          'AX_SE_PILOT_RUN_INCOMPLETE', 'different exact project revision',
          request.expectedProjectBindingRef.entity_id,
          request.expectedProjectBindingRef.revision_id,
          request.expectedProjectBindingRef.content_id,
          request.contextPacket.project_binding_ref.entity_id,
        ],
        label: 'a packet bound to another project',
      },
    );

    assert.equal(receipt.packet.pin_verified, true);
    assert.equal(receipt.packet.sha256, packet.pin);
    assert.equal(receipt.packet.byte_count, packet.byteCount);
    assert.deepEqual(receipt.assessment, UNASSESSED, 'a refused contract assesses nothing');
    assert.equal(Object.values(CLI_CODES).includes(CONTRACT_REFUSED.code), true,
      'the contract refusal is a fixed exported code');
  });

test('every refusal past the packet is its own exported code, decided before the write seam',
  () => {
    const exported = Object.values(CLI_CODES);
    assert.equal(new Set(exported).size, exported.length, 'each decision carries its own code');
    for (const code of [...RESULT_CODES, CONTRACT_REFUSED.code]) {
      assert.equal(exported.includes(code), true, code);
    }

    const source = readFileSync(fileURLToPath(RUNNER_SOURCE), 'utf8');
    assert.equal(source.split('streams.stdoutWrite(').length - 1, 1,
      'the assessment reaches stdout through exactly one seam');
    const capChecked = source.search(
      /(?:<|<=|>|>=)\s*MAX_RESULT_BYTES|MAX_RESULT_BYTES\s*(?:<|<=|>|>=)/u,
    );
    assert.notEqual(capChecked, -1, 'the result ceiling is compared, not only declared');
    assert.equal(capChecked < source.indexOf('streams.stdoutWrite('), true,
      'the result ceiling is decided before the seam invokes stdoutWrite');
  });

const RUNNER_PATH = fileURLToPath(RUNNER_SOURCE);
const SPAWN_OPTIONS = Object.freeze({
  cwd: fileURLToPath(new URL('../../../', RUNNER_SOURCE)),
  encoding: 'utf8',
  timeout: 30_000,
  windowsHide: true,
});

function oneJsonLine(stream, label) {
  assert.equal(stream.endsWith('\n'), true, label);
  assert.equal(stream.trimEnd().includes('\n'), false, `${label}: exactly one JSON line`);
  return JSON.parse(stream);
}

test('the entry gate compares normalized file URLs rather than raw argv spelling', () => {
  const dotSegment = `${dirname(RUNNER_PATH)}${sep}.${sep}${basename(RUNNER_PATH)}`;
  assert.equal(runner.isDirectInvocation(RUNNER_PATH, RUNNER_SOURCE.href), true);
  assert.equal(runner.isDirectInvocation(dotSegment, RUNNER_SOURCE.href), true);
  assert.equal(runner.isDirectInvocation(undefined, RUNNER_SOURCE.href), false);
  assert.equal(runner.isDirectInvocation('', RUNNER_SOURCE.href), false);
  assert.equal(
    runner.isDirectInvocation(join(dirname(RUNNER_PATH), 'other_module.mjs'), RUNNER_SOURCE.href),
    false,
  );
  if (process.platform === 'win32') {
    const alternateDriveCase = `${RUNNER_PATH[0] === RUNNER_PATH[0].toUpperCase()
      ? RUNNER_PATH[0].toLowerCase() : RUNNER_PATH[0].toUpperCase()}${RUNNER_PATH.slice(1)}`;
    assert.equal(runner.isDirectInvocation(alternateDriveCase, RUNNER_SOURCE.href), true);
  }
});

test('a real child process assesses a pinned public packet and exits carrying its receipt', () => {
  const request = pilotRequest();
  const { packetPath, pin } = pinnedPacket(request);
  const child = spawnSync(
    process.execPath,
    [RUNNER_PATH, '--packet', packetPath, '--packet-sha256', pin],
    SPAWN_OPTIONS,
  );

  assert.equal(child.error, undefined, 'the process spawned without a harness error');
  assert.equal(child.signal, null, 'the process exited on its own, not on a signal');
  assert.equal(child.status, 0);

  const emitted = oneJsonLine(child.stdout, 'the child stdout is one assessment');
  assert.deepEqual(emitted, assessAxSeProject(buildAxSeAssessmentInput(request)));

  const receipt = oneJsonLine(child.stderr, 'the child stderr is one command receipt');
  assertClosedReceiptShape(receipt, 'a real child process pass');
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.blocker_code, null);
  assert.equal(receipt.blocker_stage, null);
  assert.equal(receipt.packet.pin_verified, true);
  assert.equal(receipt.packet.sha256, pin);
  assert.equal(receipt.packet.byte_count, statSync(packetPath).size);
  assert.equal(receipt.assessment.completed, true);
  assert.equal(receipt.assessment.assessment_state, emitted.assessment_state);
  assert.equal(receipt.assessment.assessment_handle, emitted.assessment_handle);
  assert.equal(receipt.assessment.stdout_state, 'submitted');
  assert.equal(receipt.assessment.prepared_output_sha256, sha256(child.stdout));
  assert.equal(receipt.assessment.prepared_output_byte_count,
    Buffer.byteLength(child.stdout, 'utf8'));
  assert.equal(receipt.candidate_disposition.mission_candidate_count,
    emitted.next_mission_candidates.length);
});

test('a real child process refuses a wrong pin over invalid JSON, echoing nothing it read', () => {
  const { root, packetPath, actualSha256, wrongSha256 } = unpinnedPacket();
  const child = spawnSync(
    process.execPath,
    [RUNNER_PATH, '--packet', packetPath, '--packet-sha256', wrongSha256],
    SPAWN_OPTIONS,
  );

  assert.equal(child.error, undefined, 'the process spawned without a harness error');
  assert.equal(child.signal, null, 'the process exited on its own, not on a signal');
  assert.equal(child.status, 2);
  assert.equal(child.stdout, '', 'a held run emits no assessment on stdout');

  const receipt = oneJsonLine(child.stderr, 'the child stderr is one command receipt');
  assertClosedReceiptShape(receipt, 'a real child process refusal');
  assert.equal(receipt.result, 'HOLD');
  assert.equal(receipt.blocker_code, 'AX_SE_PILOT_PACKET_HASH_MISMATCH');
  assert.equal(receipt.blocker_stage, 'packet_binding');
  assert.equal(receipt.packet.pin_verified, false);
  assert.equal(receipt.packet.sha256, null);
  assert.equal(receipt.packet.byte_count, null);
  assert.deepEqual(receipt.assessment, UNASSESSED);

  const emitted = child.stdout + child.stderr;
  for (const value of [
    ...[root, packetPath].flatMap(spellings),
    actualSha256, 'context_packet.json', 'stack', PAYLOAD_MARKER,
    ...FORBIDDEN_ERROR_TEXT,
  ]) {
    assert.equal(emitted.includes(value), false, value);
  }
});

test('the production command source holds no process, network, write, or platform capability',
  () => {
    const source = readFileSync(RUNNER_PATH, 'utf8');
    const specifiers = [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gmu)]
      .map((match) => match[1]);
    assert.equal(specifiers.length > 0, true, 'the static import surface is visible');

    for (const specifier of specifiers) {
      assert.equal(
        /^(?:node:)?(?:child_process|http|https|net|dgram|tls|worker_threads)$/u.test(specifier),
        false, specifier);
      assert.equal(/model|rag|wiki|erp|task_?driver/iu.test(specifier), false, specifier);
    }

    assert.equal(/\bimport\s*\(/u.test(source), false, 'no dynamic import');
    assert.equal(/\bfetch\b/u.test(source), false, 'no fetch call');
    assert.equal(source.includes('process.env'), false, 'no environment read');

    const fsImport = source.match(/^import\s*\{([^}]*)\}\s*from\s+'node:fs';/mu);
    assert.notEqual(fsImport, null, 'the fs surface is one named static import');
    assert.deepEqual(
      fsImport[1].split(',').map((name) => name.trim()).filter(Boolean).sort(),
      ['closeSync', 'fstatSync', 'lstatSync', 'openSync', 'readSync'],
      'the exact allowed fs import set is read-only');

    for (const api of [
      'writeFileSync', 'writeSync', 'writevSync', 'appendFileSync', 'createWriteStream',
      'mkdirSync', 'mkdtempSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync',
      'copyFileSync', 'cpSync', 'linkSync', 'symlinkSync', 'truncateSync', 'ftruncateSync',
      'chmodSync', 'chownSync', 'utimesSync', 'node:fs/promises', 'fs.promises',
    ]) {
      assert.equal(source.includes(api), false, api);
    }

    assert.equal(source.includes('--out'), false, 'no output file flag');
    assert.equal(source.includes('--receipt-out'), false, 'no receipt file flag');
  });
