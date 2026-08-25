import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { canonicalise } from '../../../core/validators/canonical.mjs';
import { assessAxSeRoleBoundProject } from '../evaluator/ax_se_project_role_bound_assessment.mjs';
import { buildAxSeProjectRoleRoster } from '../evaluator/ax_se_project_role_roster.mjs';
import {
  AX_SE_ROLE_BOUND_COMMAND_RECEIPT_SCHEMA,
  CLI_CODES,
  MAX_PACKET_BYTES,
  MAX_PACKET_PATH_CHARS,
  MAX_RESULT_BYTES,
  fileState,
  isDirectInvocation,
  runAxSeProjectRoleBoundAssessmentCli,
  sameFileState,
} from '../tools/ax_se_project_role_bound_assessment_runner.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER_PATH = join(HERE, '..', 'tools', 'ax_se_project_role_bound_assessment_runner.mjs');
const FIXTURE_PATH = join(
  HERE,
  '..', '..', '..', '..', '..',
  'docs', 'architecture', 'workspace', 'examples', 'ax_se_project_assessment',
  'ax_se_project_role_bound_assessment_synthetic_v1.json',
);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
const SPAWN_OPTIONS = Object.freeze({ encoding: 'utf8', windowsHide: true });
const PAYLOAD_MARKER = 'role-bound-payload-echo-marker';
const REF_MARKER = 'role-bound-ref-echo-marker';
const HASH_MARKER = 'f'.repeat(64);
const ROSTER_FINGERPRINT_DOMAIN =
  'soulforge.ax_se_project_role_bound_assessment_expected_roster_ref.v1';

const clone = (value) => structuredClone(value);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rosterFingerprint = (ref) => createHash('sha256')
  .update(`${ROSTER_FINGERPRINT_DOMAIN}\0`, 'utf8')
  .update(canonicalise(ref, {}), 'utf8')
  .digest('hex');
const packetBytes = (packet = FIXTURE.packet) => Buffer.from(JSON.stringify(packet), 'utf8');
const oneJsonLine = (text, label) => {
  assert.equal(text.endsWith('\n'), true, `${label} ends with one newline`);
  assert.equal(text.slice(0, -1).includes('\n'), false, `${label} is one line`);
  return JSON.parse(text);
};
const insertionOrderRules = (value) => {
  const rules = {};
  const visit = (node, path = '') => {
    if (Array.isArray(node)) {
      rules[path] = 'insertion_ordered';
      node.forEach((child) => visit(child, `${path}[]`));
    } else if (node !== null && typeof node === 'object') {
      Object.entries(node).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  visit(value);
  return rules;
};

function argsFor(path, bytes = packetBytes(), expectedRef = FIXTURE.expected_role_roster_ref) {
  return [
    '--packet', path,
    '--packet-sha256', sha256(bytes),
    '--expected-role-roster-entity-id', expectedRef.entity_id,
    '--expected-role-roster-revision-id', expectedRef.revision_id,
    '--expected-role-roster-content-sha256', expectedRef.content_id.slice('sha256:'.length),
  ];
}

function invoke(argv, io = {}) {
  let stdout = '';
  let stderr = '';
  const result = runAxSeProjectRoleBoundAssessmentCli(argv, {
    stdoutWrite(value) { stdout += value; },
    stderrWrite(value) { stderr += value; },
    ...io,
  });
  return { ...result, stdout, stderr };
}

function tempPacket(bytes = packetBytes(), name = 'packet.json') {
  const root = mkdtempSync(join(tmpdir(), 'ax-se-role-bound-runner-'));
  const path = join(root, name);
  writeFileSync(path, bytes);
  return { root, path, bytes };
}

function assertClosedReceipt(receipt, label) {
  assert.deepEqual(Object.keys(receipt), [
    'schema_version', 'mode', 'result', 'blocker_code', 'blocker_stage',
    'packet', 'roster_binding', 'assessment', 'candidate_disposition',
    'persistence', 'effects', 'gates', 'canon_claim_ceiling',
  ], label);
  assert.equal(receipt.schema_version, AX_SE_ROLE_BOUND_COMMAND_RECEIPT_SCHEMA);
  assert.equal(receipt.mode, 'read_only');
  assert.deepEqual(Object.keys(receipt.packet), ['pin_verified', 'sha256', 'byte_count']);
  assert.deepEqual(Object.keys(receipt.roster_binding), [
    'expected_ref_supplied', 'expected_ref_verified', 'expected_ref_fingerprint_sha256',
  ]);
  assert.deepEqual(Object.keys(receipt.assessment), [
    'completed', 'assessment_state', 'assessment_handle', 'prepared_output_sha256',
    'prepared_output_byte_count', 'stdout_state',
  ]);
  assert.deepEqual(Object.keys(receipt.candidate_disposition), [
    'candidate_only', 'mission_candidate_count',
  ]);
  assert.equal(receipt.candidate_disposition.candidate_only, true);
  assert.deepEqual(receipt.persistence, { state: 'not_requested', persistent_file_writes: 0 });
  assert.deepEqual(receipt.effects, {
    erp_writes: 0,
    filesystem_writes: 0,
    model_calls: 0,
    network_calls: 0,
    taskdriver_activated: false,
  });
  assert.deepEqual(receipt.gates, {
    stage_clear_allowed: false,
    owner_decision_made: false,
    task_intent_created: false,
    roster_approved: false,
    human_identity_bound: false,
    live_availability_claimed: false,
  });
  assert.equal(receipt.canon_claim_ceiling, 'observed');
}

function assertNoSensitiveEcho(emitted, values) {
  for (const value of values) {
    assert.equal(emitted.includes(value), false, `must not echo ${value.slice(0, 24)}`);
  }
}

test('happy path emits exactly one canonical v1 assessment and one closed payload-free receipt', () => {
  const { path, bytes } = tempPacket();
  const run = invoke(argsFor(path, bytes));
  const expected = assessAxSeRoleBoundProject(FIXTURE.packet, FIXTURE.expected_role_roster_ref);
  const expectedOutput = `${canonicalise(expected, insertionOrderRules(expected))}\n`;

  assert.equal(run.exitCode, 0);
  assert.equal(run.stdout, expectedOutput);
  assert.equal(run.stdout.slice(0, -1).includes('\n'), false);
  const receipt = oneJsonLine(run.stderr, 'receipt');
  assertClosedReceipt(receipt, 'happy receipt');
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.blocker_code, null);
  assert.equal(receipt.blocker_stage, null);
  assert.deepEqual(receipt.packet, {
    pin_verified: true,
    sha256: sha256(bytes),
    byte_count: bytes.length,
  });
  assert.deepEqual(receipt.roster_binding, {
    expected_ref_supplied: true,
    expected_ref_verified: true,
    expected_ref_fingerprint_sha256: rosterFingerprint(FIXTURE.expected_role_roster_ref),
  });
  assert.deepEqual(receipt.assessment, {
    completed: true,
    assessment_state: expected.assessment_state,
    assessment_handle: expected.assessment_handle,
    prepared_output_sha256: sha256(Buffer.from(expectedOutput, 'utf8')),
    prepared_output_byte_count: Buffer.byteLength(expectedOutput, 'utf8'),
    stdout_state: 'submitted',
  });
  assert.deepEqual(receipt.candidate_disposition, {
    candidate_only: true,
    mission_candidate_count: expected.next_mission_candidates.length,
  });
  assertNoSensitiveEcho(run.stderr, [
    path,
    FIXTURE.expected_role_roster_ref.entity_id,
    FIXTURE.expected_role_roster_ref.revision_id,
    FIXTURE.expected_role_roster_ref.content_id,
  ]);
});

test('receipt commitments distinguish valid packet, roster, and prepared output pairs', () => {
  const first = tempPacket(packetBytes(), 'first.json');
  const secondPacket = clone(FIXTURE.packet);
  secondPacket.role_roster_packet.coverage_state = 'partial';
  const second = tempPacket(packetBytes(secondPacket), 'second.json');
  const secondRef = assessRosterRef(secondPacket);

  const firstRun = invoke(argsFor(first.path, first.bytes));
  const secondRun = invoke(argsFor(second.path, second.bytes, secondRef));
  const firstReceipt = oneJsonLine(firstRun.stderr, 'first receipt');
  const secondReceipt = oneJsonLine(secondRun.stderr, 'second receipt');

  assert.equal(firstRun.exitCode, 0);
  assert.equal(secondRun.exitCode, 0);
  assert.equal(firstReceipt.packet.sha256, sha256(first.bytes));
  assert.equal(secondReceipt.packet.sha256, sha256(second.bytes));
  assert.notEqual(firstReceipt.packet.sha256, secondReceipt.packet.sha256);
  assert.notEqual(
    firstReceipt.roster_binding.expected_ref_fingerprint_sha256,
    secondReceipt.roster_binding.expected_ref_fingerprint_sha256,
  );
  assert.equal(firstReceipt.assessment.prepared_output_sha256, sha256(Buffer.from(firstRun.stdout)));
  assert.equal(secondReceipt.assessment.prepared_output_sha256, sha256(Buffer.from(secondRun.stdout)));
  assert.notEqual(
    firstReceipt.assessment.prepared_output_sha256,
    secondReceipt.assessment.prepared_output_sha256,
  );
  assert.notEqual(firstReceipt.assessment.assessment_handle, secondReceipt.assessment.assessment_handle);
});

test('wrong raw pin stops before UTF-8 and JSON parsing without echo', () => {
  const bytes = Buffer.from(`not-json-${PAYLOAD_MARKER}`, 'utf8');
  const { path } = tempPacket(bytes);
  const argv = argsFor(path, bytes);
  argv[3] = '0'.repeat(64);
  const run = invoke(argv);

  assert.equal(run.exitCode, 2);
  assert.equal(run.stdout, '');
  const receipt = oneJsonLine(run.stderr, 'hash refusal receipt');
  assertClosedReceipt(receipt, 'hash refusal');
  assert.equal(receipt.blocker_code, CLI_CODES.PACKET_HASH_MISMATCH);
  assert.equal(receipt.blocker_stage, 'packet_binding');
  assert.deepEqual(receipt.packet, { pin_verified: false, sha256: null, byte_count: null });
  assert.deepEqual(receipt.roster_binding, {
    expected_ref_supplied: true,
    expected_ref_verified: false,
    expected_ref_fingerprint_sha256: rosterFingerprint(FIXTURE.expected_role_roster_ref),
  });
  assertNoSensitiveEcho(run.stderr, [path, PAYLOAD_MARKER, sha256(bytes), '0'.repeat(64)]);
});

test('correctly pinned invalid UTF-8 and invalid JSON stop at distinct decode stages', () => {
  const cases = [
    [Buffer.from([0xc3, 0x28]), CLI_CODES.PACKET_NOT_UTF8, 'packet_decode'],
    [Buffer.from('{"not":', 'utf8'), CLI_CODES.PACKET_NOT_JSON, 'packet_parse'],
  ];
  for (const [bytes, blockerCode, blockerStage] of cases) {
    const { path } = tempPacket(bytes);
    const run = invoke(argsFor(path, bytes));
    const receipt = oneJsonLine(run.stderr, `${blockerStage} receipt`);
    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    assert.equal(receipt.blocker_code, blockerCode);
    assert.equal(receipt.blocker_stage, blockerStage);
    assert.deepEqual(receipt.packet, {
      pin_verified: true,
      sha256: sha256(bytes),
      byte_count: bytes.length,
    });
    assert.equal(receipt.roster_binding.expected_ref_verified, false);
    assertNoSensitiveEcho(run.stderr, [path, bytes.toString('hex')]);
  }
});

test('external roster drift is refused even when the combined packet is freshly repinned', () => {
  const { path, bytes } = tempPacket();
  const expected = clone(FIXTURE.expected_role_roster_ref);
  expected.content_id = `sha256:${HASH_MARKER}`;
  const run = invoke(argsFor(path, bytes, expected));

  assert.equal(run.exitCode, 2);
  assert.equal(run.stdout, '');
  const receipt = oneJsonLine(run.stderr, 'roster refusal receipt');
  assertClosedReceipt(receipt, 'roster refusal');
  assert.equal(receipt.blocker_code, CLI_CODES.ROSTER_BINDING_REFUSED);
  assert.equal(receipt.blocker_stage, 'roster_binding');
  assert.equal(receipt.packet.pin_verified, true);
  assert.equal(receipt.roster_binding.expected_ref_supplied, true);
  assert.equal(receipt.roster_binding.expected_ref_verified, false);
  assertNoSensitiveEcho(run.stderr, [path, HASH_MARKER]);
});

test('the closed packet cannot embed its expected roster ref or caller-supplied roles', () => {
  for (const field of ['expected_role_roster_ref', 'roles']) {
    const packet = clone(FIXTURE.packet);
    packet[field] = field === 'roles' ? [] : {
      ...clone(FIXTURE.expected_role_roster_ref),
      entity_id: REF_MARKER,
    };
    const bytes = packetBytes(packet);
    const { path } = tempPacket(bytes, `${field}.json`);
    const run = invoke(argsFor(path, bytes));
    const receipt = oneJsonLine(run.stderr, `${field} refusal receipt`);

    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    assert.equal(receipt.blocker_code, CLI_CODES.PACKET_CONTRACT_REFUSED);
    assert.equal(receipt.blocker_stage, 'packet_contract');
    assertNoSensitiveEcho(run.stderr, [path, REF_MARKER]);
  }
});

test('capability vocabulary, project binding, and deep contract failures are closed and echo-free', () => {
  const cases = [
    [
      'vocabulary',
      (packet) => { packet.policy_capability_vocabulary_ref.entity_id = REF_MARKER; },
      CLI_CODES.CAPABILITY_VOCABULARY_REFUSED,
      'assessment',
    ],
    [
      'project',
      (packet) => { packet.role_roster_packet.project_binding_ref.entity_id = REF_MARKER; },
      CLI_CODES.PACKET_CONTRACT_REFUSED,
      'packet_contract',
    ],
    [
      'payload-key',
      (packet) => { packet.context_packet.raw = PAYLOAD_MARKER; },
      CLI_CODES.PACKET_CONTRACT_REFUSED,
      'packet_contract',
    ],
  ];
  for (const [name, mutate, blockerCode, blockerStage] of cases) {
    const packet = clone(FIXTURE.packet);
    mutate(packet);
    const bytes = packetBytes(packet);
    const { path } = tempPacket(bytes, `${name}.json`);
    const run = invoke(argsFor(path, bytes));
    const receipt = oneJsonLine(run.stderr, `${name} refusal receipt`);
    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    assert.equal(receipt.blocker_code, blockerCode);
    assert.equal(receipt.blocker_stage, blockerStage);
    assertNoSensitiveEcho(run.stderr, [path, REF_MARKER, PAYLOAD_MARKER]);
  }
});

test('a partial roster is a command PASS whose domain result remains HOLD', () => {
  const packet = clone(FIXTURE.packet);
  packet.role_roster_packet.coverage_state = 'partial';
  const bytes = packetBytes(packet);
  const { path } = tempPacket(bytes);
  const expectedRef = assessRosterRef(packet);
  const run = invoke(argsFor(path, bytes, expectedRef));
  const receipt = oneJsonLine(run.stderr, 'partial receipt');

  assert.equal(run.exitCode, 0);
  assert.equal(JSON.parse(run.stdout).assessment_state, 'HOLD');
  assert.equal(receipt.result, 'PASS');
  assert.deepEqual(receipt.assessment, {
    completed: true,
    assessment_state: 'HOLD',
    assessment_handle: JSON.parse(run.stdout).assessment_handle,
    prepared_output_sha256: sha256(Buffer.from(run.stdout)),
    prepared_output_byte_count: Buffer.byteLength(run.stdout, 'utf8'),
    stdout_state: 'submitted',
  });
});

test('a complete roster preserves a domain UNKNOWN as a command PASS', () => {
  const packet = clone(FIXTURE.packet);
  packet.context_packet.observations = packet.context_packet.observations.filter(
    (row) => row.requirement_id !== 'srr_review_actions_closed',
  );
  const bytes = packetBytes(packet);
  const { path } = tempPacket(bytes);
  const run = invoke(argsFor(path, bytes));
  const receipt = oneJsonLine(run.stderr, 'unknown receipt');

  assert.equal(run.exitCode, 0);
  assert.equal(JSON.parse(run.stdout).assessment_state, 'UNKNOWN');
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.assessment.assessment_state, 'UNKNOWN');
});

function assessRosterRef(packet) {
  return buildAxSeProjectRoleRoster({
    rosterPacket: packet.role_roster_packet,
    expectedProjectBindingRef: packet.expected_project_binding_ref,
  }).role_roster_ref;
}

test('argv and injected stream objects are exact plain closed data', () => {
  const { path, bytes } = tempPacket();
  const valid = argsFor(path, bytes);
  const variants = [
    valid.slice(0, -2),
    [...valid, '--out', join(dirname(path), 'out.json')],
    valid.with(0, '--unknown'),
    valid.with(1, '--looks-like-a-flag'),
    valid.with(2, valid[0]),
    valid.with(3, 'A'.repeat(64)),
  ];
  for (const argv of variants) {
    const run = invoke(argv);
    assert.equal(run.exitCode, 2);
    assert.equal(run.stdout, '');
    assert.equal(oneJsonLine(run.stderr, 'argv receipt').blocker_code, CLI_CODES.ARGUMENTS_INVALID);
  }

  let traps = 0;
  const proxyArgv = new Proxy(valid, {
    get() { traps += 1; return undefined; },
    ownKeys() { traps += 1; return []; },
  });
  const proxyRun = invoke(proxyArgv);
  assert.equal(proxyRun.exitCode, 2);
  assert.equal(traps, 0);

  const accessorArgv = [...valid];
  Object.defineProperty(accessorArgv, 1, {
    enumerable: true,
    get() { throw new Error(PAYLOAD_MARKER); },
  });
  const accessorRun = invoke(accessorArgv);
  assert.equal(accessorRun.exitCode, 2);
  assertNoSensitiveEcho(accessorRun.stderr, [PAYLOAD_MARKER]);

  const proxyIo = new Proxy({}, {
    get() { traps += 1; return undefined; },
    ownKeys() { traps += 1; return []; },
  });
  const ioRun = runAxSeProjectRoleBoundAssessmentCli(valid, proxyIo);
  assert.equal(ioRun.exitCode, 2);
  assert.equal(ioRun.receipt.blocker_code, CLI_CODES.IO_INVALID);
  assert.equal(ioRun.receiptSubmissionState, 'failed');
});

test('packet byte cap accepts exact size and refuses one byte more before allocation', () => {
  const base = packetBytes();
  const exact = Buffer.concat([base, Buffer.alloc(MAX_PACKET_BYTES - base.length, 0x20)]);
  const exactFile = tempPacket(exact, 'exact.json');
  const exactRun = invoke(argsFor(exactFile.path, exact));
  assert.equal(exactRun.exitCode, 0);
  assert.equal(oneJsonLine(exactRun.stderr, 'exact receipt').packet.pin_verified, true);

  const over = Buffer.concat([exact, Buffer.from(' ')]);
  const overFile = tempPacket(over, 'over.json');
  const overRun = invoke(argsFor(overFile.path, over));
  const receipt = oneJsonLine(overRun.stderr, 'over receipt');
  assert.equal(overRun.exitCode, 2);
  assert.equal(receipt.blocker_code, CLI_CODES.PACKET_TOO_LARGE);
  assert.equal(receipt.packet.pin_verified, false);
});

test('relative, overlong, directory, hardlink, symlink, and ADS packet paths are refused', (t) => {
  const { root, path, bytes } = tempPacket();
  const directory = join(root, 'folder');
  mkdirSync(directory);
  const hardlink = join(root, 'hardlink.json');
  linkSync(path, hardlink);
  const windowsSeparator = String.fromCharCode(92);
  const windowsDriveRoot = ['C', ':', windowsSeparator].join('');
  const paths = [
    'relative.json',
    `${windowsDriveRoot}${'x'.repeat(MAX_PACKET_PATH_CHARS)}`,
    [windowsSeparator, windowsSeparator, 'server', windowsSeparator,
      'share', windowsSeparator, 'packet.json'].join(''),
    [windowsSeparator, windowsSeparator, '?', windowsSeparator,
      windowsDriveRoot, 'packet.json'].join(''),
    `${windowsDriveRoot}NUL`,
    directory,
    hardlink,
    `${path}:alternate`,
  ];

  const symlink = join(root, 'symlink.json');
  try {
    symlinkSync(path, symlink, 'file');
    paths.push(symlink);
  } catch (error) {
    t.diagnostic(`symlink creation unavailable: ${error?.code ?? 'unknown'}`);
  }

  for (const refused of paths) {
    const run = invoke(argsFor(refused, bytes));
    const receipt = oneJsonLine(run.stderr, 'path refusal receipt');
    assert.equal(run.exitCode, 2, refused === hardlink ? 'hardlink' : 'path');
    assert.equal(receipt.blocker_code, CLI_CODES.PACKET_UNREADABLE);
    assertNoSensitiveEcho(run.stderr, [refused, path, sha256(bytes)]);
  }
  assert.equal(lstatSync(path, { bigint: true }).nlink >= 2n, true);
});

test('file-state identity comparison includes growth, replacement, and timestamp fields', () => {
  const state = {
    dev: 1n, ino: 2n, nlink: 1n, size: 3n, mtimeNs: 4n, ctimeNs: 5n,
  };
  assert.deepEqual(fileState(state), state);
  assert.equal(sameFileState(state, { ...state }), true);
  for (const key of Object.keys(state)) {
    assert.equal(sameFileState(state, { ...state, [key]: state[key] + 1n }), false, key);
  }
  assert.equal(fileState({ ...state, size: 3 }), null);
  assert.equal(sameFileState(null, state), false);
});

test('stdout and stderr failures are contained, never retried, and never echoed', () => {
  const { path, bytes } = tempPacket();
  const argv = argsFor(path, bytes);
  let stdoutCalls = 0;
  let stderr = '';
  const stdoutFailure = runAxSeProjectRoleBoundAssessmentCli(argv, {
    stdoutWrite() { stdoutCalls += 1; throw new Error(PAYLOAD_MARKER); },
    stderrWrite(value) { stderr += value; },
  });
  assert.equal(stdoutCalls, 1);
  assert.equal(stdoutFailure.exitCode, 2);
  assert.equal(stdoutFailure.receipt.blocker_code, CLI_CODES.STDOUT_FAILED);
  assert.equal(stdoutFailure.receipt.assessment.stdout_state, 'partial_unknown');
  assertNoSensitiveEcho(stderr, [PAYLOAD_MARKER, path]);

  let stderrCalls = 0;
  const stderrFailure = runAxSeProjectRoleBoundAssessmentCli(argv, {
    stdoutWrite() {},
    stderrWrite() { stderrCalls += 1; throw new Error(PAYLOAD_MARKER); },
  });
  assert.equal(stderrCalls, 1);
  assert.equal(stderrFailure.exitCode, 2);
  assert.equal(stderrFailure.receiptSubmissionState, 'failed');
});

test('a real child process preserves stdout and stderr framing', () => {
  const { path, bytes } = tempPacket();
  const child = spawnSync(process.execPath, [RUNNER_PATH, ...argsFor(path, bytes)], SPAWN_OPTIONS);
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0);
  assert.equal(JSON.parse(child.stdout).schema_version, 'soulforge.ax_se_project_role_bound_assessment.v1');
  const receipt = oneJsonLine(child.stderr, 'child receipt');
  assertClosedReceipt(receipt, 'child receipt');
  assert.equal(receipt.result, 'PASS');
  assertNoSensitiveEcho(child.stderr, [path]);
});

test('the runner has a closed read-only import and capability surface', () => {
  const source = readFileSync(RUNNER_PATH, 'utf8');
  const specifiers = [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gmu)]
    .map((match) => match[1]);
  for (const specifier of specifiers) {
    assert.doesNotMatch(specifier, /(?:child_process|http|https|net|dgram|tls|worker_threads)/u);
    assert.doesNotMatch(specifier, /(?:model|rag|wiki|erp|task_?driver)/iu);
  }
  assert.doesNotMatch(source, /\bimport\s*\(/u);
  assert.doesNotMatch(source, /\bfetch\b/u);
  assert.equal(source.includes('process.env'), false);

  const fsImport = source.match(/^import\s*\{([^}]*)\}\s*from\s+'node:fs';/mu);
  assert.notEqual(fsImport, null);
  assert.deepEqual(
    fsImport[1].split(',').map((name) => name.trim()).filter(Boolean).sort(),
    ['closeSync', 'fstatSync', 'lstatSync', 'openSync', 'readSync'],
  );
  for (const token of [
    'readFileSync', 'writeFileSync', 'writeSync', 'appendFileSync', 'createWriteStream',
    'mkdirSync', 'rmSync', 'unlinkSync', 'renameSync', 'copyFileSync', 'linkSync',
    'symlinkSync', 'truncateSync', 'chmodSync', 'chownSync', 'utimesSync',
    'node:fs/promises', 'fs.promises', '--out', '--receipt-out',
  ]) {
    assert.equal(source.includes(token), false, token);
  }
  assert.equal(MAX_PACKET_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_PACKET_PATH_CHARS, 4096);
  assert.equal(MAX_RESULT_BYTES, 4 * 1024 * 1024);
});

test('direct-invocation identity is exact and does not accept lookalikes', () => {
  const runnerUrl = new URL('../tools/ax_se_project_role_bound_assessment_runner.mjs', import.meta.url);
  assert.equal(isDirectInvocation(RUNNER_PATH, runnerUrl.href), true);
  assert.equal(isDirectInvocation(`${RUNNER_PATH}.bak`, runnerUrl.href), false);
  assert.equal(isDirectInvocation('', runnerUrl.href), false);
  assert.equal(isDirectInvocation(RUNNER_PATH, ''), false);
});
