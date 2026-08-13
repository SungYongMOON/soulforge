// Thin CLI for the evaluation-only Soulforge Engineering Answer Lane: public synthetic tests.
//
// No real provider is contacted. The loopback adapter is exercised with an injected fetch, and
// every corpus, question, and response is synthetic.
//
// The output-ownership tests inject `TEST_ONLY_OUTPUT_HOOK`. That seam is symbol-keyed precisely
// so it cannot arrive from an argument, a config file, or any JSON the runtime accepts: it exists
// to simulate a hostile filesystem race at exact checkpoints, and it is never part of the public
// io surface.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SYNTHETIC_POINT_IN_TIME,
  SYNTHETIC_QUESTION,
  SYNTHETIC_SOURCE_SET_ID,
  composeCalls,
  contractFileDocument,
  fakeAnswerModel,
  laneInput,
  sha256,
  sourceDescriptors,
  sourceSetContract,
} from '../fixtures/se_core_sourcebound_synthetic_corpus.mjs';
import {
  CODES as LANE_CODES,
  runSeCoreSourceboundAnswerLane,
  seCoreSourceCohortSha256,
  seCoreSourceSetContractSha256,
} from '../evaluation/se_core_sourcebound_answer_lane.mjs';
import {
  CLI_CODES,
  COMMAND_RECEIPT_SCHEMA_VERSION,
  EXACT_ANSWER_MODEL,
  MAX_BENCHMARK_PIN_BYTES,
  MAX_DERIVED_TEXT_BYTES,
  MAX_MESSAGE_CONTENT_BYTES,
  MAX_MESSAGE_CONTENT_CHARS,
  MAX_PROVIDER_RESPONSE_BYTES,
  MAX_QUESTION_BYTES,
  MAX_SOURCE_SET_CONTRACT_BYTES,
  MAX_TIMEOUT_MS,
  OLLAMA_KEEP_ALIVE,
  TEST_ONLY_OUTPUT_HOOK,
  assertLoopbackOllamaTarget,
  assertWritableOutputTarget,
  createLoopbackOllamaAnswerModel,
  parseArgs,
  readSourceSetContractFile,
  renderPromptText,
  runSeCoreSourceboundAnswerCli,
} from '../tools/se_core_sourcebound_answer_runner.mjs';

const TEMP_ROOTS = [];
test.after(() => {
  for (const root of TEMP_ROOTS) rmSync(root, { recursive: true, force: true });
});

/**
 * One complete on-disk CLI fixture.
 *
 * Both parameters default to the ordinary synthetic corpus and question, so every existing caller
 * is unchanged; the boundary tests below vary exactly one of them to place a named input at an
 * exact byte ceiling.
 */
function fixture(descriptors = sourceDescriptors(), question = SYNTHETIC_QUESTION) {
  const root = mkdtempSync(join(tmpdir(), 'se-core-sourcebound-'));
  TEMP_ROOTS.push(root);
  const contractPath = join(root, 'source_set_contract.json');
  writeFileSync(
    contractPath,
    `${JSON.stringify(contractFileDocument(descriptors), null, 2)}\n`,
    'utf8',
  );
  const questionPath = join(root, 'question.txt');
  const questionBytes = Buffer.from(question, 'utf8');
  writeFileSync(questionPath, questionBytes);
  const derived = descriptors.map((descriptor) => {
    const path = join(root, `${descriptor.source_id}.derived.md`);
    writeFileSync(path, descriptor.derived_text_bytes);
    return `${descriptor.source_id}=${path}`;
  });
  const argv = [
    '--source-set-contract', contractPath,
    '--source-set-sha256', seCoreSourceSetContractSha256(sourceSetContract(descriptors)),
    '--question', questionPath,
    '--question-sha256', sha256(questionBytes),
    '--question-bytes', String(questionBytes.length),
    '--point-in-time', SYNTHETIC_POINT_IN_TIME,
    ...derived.flatMap((entry) => ['--derived-text', entry]),
  ];
  return { root, argv, contractPath, questionPath, descriptors };
}

function captureIo(answerModel, outputHook) {
  const out = [];
  const err = [];
  const io = {
    answerModel,
    stdoutWrite: (value) => out.push(value),
    stderrWrite: (value) => err.push(value),
  };
  if (outputHook !== undefined) io[TEST_ONLY_OUTPUT_HOOK] = outputHook;
  return { io, out, err };
}

/** The command execution receipt is always the last line this runner writes to stderr. */
const commandReceipt = (err) => JSON.parse(err[err.length - 1]);

const JSON_CALLS = { count: 0 };

/**
 * One synthetic provider response carrying real bytes.
 *
 * The adapter under test must bound and decode the body itself, so every fixture exposes
 * `arrayBuffer` and a `content-length` header. `json` is present only as a tripwire: it counts its
 * own invocations so a test can prove the unbounded convenience path is never taken.
 */
function bodyResponse(bodyText, extra = {}) {
  const bytes = Buffer.from(bodyText, 'utf8');
  return {
    ok: true,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'content-length' ? String(bytes.length) : null),
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    json: async () => {
      JSON_CALLS.count += 1;
      return JSON.parse(bodyText);
    },
    ...extra,
  };
}

/** One envelope whose `message.content` is the given JSON text. */
const envelopeFor = (contentText, envelope = {}) => JSON.stringify({
  ...envelope, message: { content: contentText },
});

const jsonResponder = (payload) => async () => bodyResponse(
  envelopeFor(JSON.stringify(payload)),
);

/** One valid rendered answer, as the injected model would return it. */
const OK_SECTIONS = {
  sections: [{ heading: '판단', text: '검증 기준이 필요합니다.', evidence_ids: ['E1'] }],
};

/** Pads one JSON document with insignificant whitespace to an exact byte length. */
function padJsonTo(json, targetBytes) {
  const pad = targetBytes - Buffer.byteLength(json, 'utf8');
  assert.ok(pad >= 0, 'the padding target must not be smaller than the document');
  return `${json.slice(0, -1)}${' '.repeat(pad)}}`;
}

/** The same, to an exact UTF-16 unit count: these differ whenever the document holds Korean. */
function padJsonToChars(json, targetChars) {
  const pad = targetChars - json.length;
  assert.ok(pad >= 0, 'the padding target must not be smaller than the document');
  return `${json.slice(0, -1)}${' '.repeat(pad)}}`;
}

test('the CLI answers to stdout by default and writes create-only files on request', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'answer.json');
  const receiptPath = join(root, 'receipt.json');
  const { io, out, err } = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli(
    [...argv, '--out', outPath, '--receipt-out', receiptPath], io,
  );
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(out.length, 1);
  // stderr carries the immutable lane receipt first and the command execution receipt last.
  assert.equal(err.length, 2);
  assert.equal(readFileSync(outPath, 'utf8'), out[0]);
  assert.equal(readFileSync(receiptPath, 'utf8'), err[0]);
  const receipt = JSON.parse(err[0]);
  const answer = JSON.parse(out[0]);
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.retrieval.searched_source_count, 4);
  assert.equal(receipt.writes.filesystem_writes, 0);
  assert.equal(receipt.writes.erp_writes, 0);
  assert.equal(answer.claim_ceiling, 'observed');
  assert.equal(answer.candidate_disposition, 'external_advisory_candidate');
  assert.deepEqual(answer.authority_actions, []);
});

test('the persisted receipt file is the lane receipt, never the command execution receipt', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'answer.json');
  const receiptPath = join(root, 'receipt.json');
  const { io, err } = captureIo(fakeAnswerModel());
  await runSeCoreSourceboundAnswerCli(
    [...argv, '--out', outPath, '--receipt-out', receiptPath], io,
  );
  const persisted = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const command = commandReceipt(err);
  // The lane receipt describes the lane, which writes nothing; it never describes its own file.
  assert.equal(persisted.writes.filesystem_writes, 0);
  assert.equal(Object.hasOwn(persisted, 'persistence'), false);
  assert.equal(Object.hasOwn(persisted, 'schema_version') && persisted.schema_version
    === COMMAND_RECEIPT_SCHEMA_VERSION, false);
  // The command receipt describes persistence and is not the bytes any output file holds.
  assert.equal(command.schema_version, COMMAND_RECEIPT_SCHEMA_VERSION);
  assert.equal(command.lane_internal_writes.filesystem_writes, 0);
  assert.equal(command.lane_internal_writes.erp_writes, 0);
  assert.equal(command.persistence.persistent_file_writes, 2);
  assert.notEqual(readFileSync(receiptPath, 'utf8'), `${JSON.stringify(command)}\n`);
});

test('the command execution receipt counts exactly the files this run left on disk', async () => {
  const only = async (extra) => {
    const { root, argv } = fixture();
    const flags = extra.map((name) => join(root, name));
    const { io, err } = captureIo(fakeAnswerModel());
    const argument = extra.length === 0
      ? argv
      : extra.length === 1
        ? [...argv, '--out', flags[0]]
        : [...argv, '--out', flags[0], '--receipt-out', flags[1]];
    const run = await runSeCoreSourceboundAnswerCli(argument, io);
    assert.equal(run.receipt.result, 'PASS');
    return { command: commandReceipt(err), root, flags };
  };

  const none = await only([]);
  assert.equal(none.command.result, 'PASS');
  assert.equal(none.command.persistence.state, 'not_requested');
  assert.deepEqual(none.command.persistence, {
    state: 'not_requested',
    requested: 0,
    claimed: 0,
    completed: 0,
    rolled_back: 0,
    unknown: 0,
    persistent_file_writes: 0,
  });

  const one = await only(['answer.json']);
  assert.deepEqual(one.command.persistence, {
    state: 'complete',
    requested: 1,
    claimed: 1,
    completed: 1,
    rolled_back: 0,
    unknown: 0,
    persistent_file_writes: 1,
  });

  const two = await only(['answer.json', 'receipt.json']);
  assert.deepEqual(two.command.persistence, {
    state: 'complete',
    requested: 2,
    claimed: 2,
    completed: 2,
    rolled_back: 0,
    unknown: 0,
    persistent_file_writes: 2,
  });
  assert.equal(two.command.answer_emitted_to_stdout, true);
  assert.equal(two.command.lane_ran, true);
});

test('stdout-only is the default: no file is created without an explicit flag', async () => {
  const { root, argv } = fixture();
  const { io, out, err } = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli(argv, io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(out.length, 1);
  assert.equal(err.length, 2);
  assert.throws(() => readFileSync(join(root, 'answer.json'), 'utf8'), /ENOENT/u);
  assert.throws(() => readFileSync(join(root, 'receipt.json'), 'utf8'), /ENOENT/u);
});

test('an occupied output is refused before any model call', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'already_here.json');
  writeFileSync(outPath, 'existing bytes\n', 'utf8');
  const answerModel = fakeAnswerModel();
  const { io, err } = captureIo(answerModel);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli([...argv, '--out', outPath], io),
    (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
  );
  assert.equal(answerModel.calls.length, 0, 'a refused output must cost zero model calls');
  assert.equal(readFileSync(outPath, 'utf8'), 'existing bytes\n');
  const command = commandReceipt(err);
  assert.equal(command.result, 'HOLD');
  assert.equal(command.model_invocation_count, 0);
  assert.equal(command.persistence.persistent_file_writes, 0);
  assert.equal(err.join('').includes(root), false, 'no local path is echoed');
});

test('an occupied receipt output also refuses before the model runs', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'fresh_answer.json');
  const receiptPath = join(root, 'occupied_receipt.json');
  writeFileSync(receiptPath, '{}\n', 'utf8');
  const answerModel = fakeAnswerModel();
  const { io, err } = captureIo(answerModel);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--out', outPath, '--receipt-out', receiptPath], io,
    ),
    (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
  );
  assert.equal(answerModel.calls.length, 0);
  assert.equal(readFileSync(receiptPath, 'utf8'), '{}\n');
  assert.throws(() => readFileSync(outPath, 'utf8'), /ENOENT/u, 'no partial answer is left behind');
  const command = commandReceipt(err);
  assert.deepEqual(command.persistence, {
    state: 'rolled_back',
    requested: 2,
    claimed: 1,
    completed: 0,
    rolled_back: 1,
    unknown: 0,
    persistent_file_writes: 0,
  });
});

test('a rerun against the same output path is refused with no second model call', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'once_only.json');
  await runSeCoreSourceboundAnswerCli([...argv, '--out', outPath], captureIo(fakeAnswerModel()).io);
  const second = captureIo(fakeAnswerModel());
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli([...argv, '--out', outPath], second.io),
    (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
  );
  assert.equal(composeCalls(second.io.answerModel), 0);
});

// ------------------------------------------------------------------ output target shape

test('an alternate data stream is never an output target', async () => {
  const { root, argv } = fixture();
  const host = join(root, 'answer.json');
  const answerModel = fakeAnswerModel();
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--out', `${host}:evil`], captureIo(answerModel).io,
    ),
    (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
  );
  assert.equal(answerModel.calls.length, 0);
  assert.equal(existsSync(host), false, 'no host file is created for a refused stream name');
  for (const target of [
    `${host}:evil`, `${host}:evil:$DATA`, 'answer.json:hidden', `C:relative${sep}answer.json`,
  ]) {
    assert.throws(
      () => assertWritableOutputTarget(target),
      (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
      target,
    );
  }
});

test('reserved device names are refused, including after a trailing dot or space', () => {
  const root = mkdtempSync(join(tmpdir(), 'se-core-sourcebound-'));
  TEMP_ROOTS.push(root);
  for (const name of [
    'NUL', 'nul', 'CON', 'con', 'PRN', 'AUX', 'COM1', 'com9', 'LPT1', 'lpt9',
    'nul.', 'con ', 'NUL.json', 'con.txt', 'CONIN$', 'conout$',
  ]) {
    assert.throws(
      () => assertWritableOutputTarget(join(root, name)),
      (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
      name,
    );
  }
  // A name that merely starts with a device word is an ordinary file.
  assert.equal(assertWritableOutputTarget(join(root, 'console.json')), join(root, 'console.json'));
  assert.equal(assertWritableOutputTarget(join(root, 'nuls.json')), join(root, 'nuls.json'));
});

test('a trailing dot or space is refused because it names a different file than it spells', async () => {
  const { root, argv } = fixture();
  for (const name of ['answer.json.', 'answer.json ', 'answer.json..', 'sub. /answer.json']) {
    assert.throws(
      () => assertWritableOutputTarget(join(root, name)),
      (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
      name,
    );
  }
  const answerModel = fakeAnswerModel();
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--out', `${join(root, 'answer.json')}.`], captureIo(answerModel).io,
    ),
    (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
  );
  assert.equal(answerModel.calls.length, 0);
  assert.equal(existsSync(join(root, 'answer.json')), false);
});

test('a traversal segment, a UNC root, and an empty segment are refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'se-core-sourcebound-'));
  TEMP_ROOTS.push(root);
  for (const target of [
    `${root}${sep}..${sep}escape.json`,
    `..${sep}escape.json`,
    `${root}${sep}sub${sep}..${sep}..${sep}escape.json`,
    `\\\\server\\share\\answer.json`,
    `\\\\?\\${root}${sep}answer.json`,
    `\\\\.\\NUL`,
    `${root}${sep}answer.json${sep}`,
    `${root}${sep}${sep}answer.json`,
    '',
    "answer\t.json",
  ]) {
    assert.throws(
      () => assertWritableOutputTarget(target),
      (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
      JSON.stringify(target),
    );
  }
  // The rule is trailing-only, so an ordinary filename with an interior space still passes.
  const spaced = join(root, 'answer name.json');
  assert.equal(assertWritableOutputTarget(spaced), spaced);
});

test('the two outputs must be distinct by normalized path and by file identity', async () => {
  const { root, argv } = fixture();
  // Same normalized path, different spelling: refused before anything is created.
  assert.throws(
    () => parseArgs([
      ...argv,
      '--out', join(root, 'a.json'),
      '--receipt-out', `${root}${sep}.${sep}a.json`,
    ]),
    (error) => error.code === CLI_CODES.ARGUMENT_INVALID,
  );

  // Same file through a reparse point: two distinct paths, one identity.
  mkdirSync(join(root, 'd1'));
  symlinkSync(join(root, 'd1'), join(root, 'j1'), 'junction');
  const answerModel = fakeAnswerModel();
  const { io, err } = captureIo(answerModel);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli([
      ...argv, '--out', join(root, 'd1', 'a.json'), '--receipt-out', join(root, 'j1', 'a.json'),
    ], io),
    (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
  );
  assert.equal(answerModel.calls.length, 0);
  assert.equal(existsSync(join(root, 'd1', 'a.json')), false, 'the first claim is withdrawn');
  assert.equal(commandReceipt(err).persistence.state, 'rolled_back');
});

test('a case-only difference cannot alias the two outputs on a case-insensitive filesystem',
  { skip: process.platform !== 'win32' }, async () => {
    const { root, argv } = fixture();
    const answerModel = fakeAnswerModel();
    const { io } = captureIo(answerModel);
    await assert.rejects(
      () => runSeCoreSourceboundAnswerCli([
        ...argv, '--out', join(root, 'Dup.json'), '--receipt-out', join(root, 'dup.json'),
      ], io),
      (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
    );
    assert.equal(answerModel.calls.length, 0);
    assert.equal(existsSync(join(root, 'Dup.json')), false);
  });

// ------------------------------------------------------------------ ownership and rollback

test('a foreign file that replaces a claimed output after the claim is never deleted', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'answer.json');
  const receiptPath = join(root, 'receipt.json');
  const hook = (phase) => {
    if (phase !== 'staged') return;
    rmSync(outPath, { force: true });
    writeFileSync(outPath, 'FOREIGN-SENTINEL\n', 'utf8');
  };
  const { io, out, err } = captureIo(fakeAnswerModel(), hook);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--out', outPath, '--receipt-out', receiptPath], io,
    ),
    (error) => error.code === CLI_CODES.OUTPUT_COMMIT_FAILED,
  );
  assert.equal(readFileSync(outPath, 'utf8'), 'FOREIGN-SENTINEL\n', 'foreign bytes survive');
  assert.equal(existsSync(receiptPath), false, 'the output this run still owned is withdrawn');
  assert.equal(out.length, 0, 'a run that lost an output echoes no answer');
  const command = commandReceipt(err);
  assert.equal(command.result, 'HOLD');
  assert.equal(command.persistence.state, 'partial_unknown');
  assert.equal(command.persistence.unknown, 1);
  assert.equal(command.persistence.rolled_back, 1);
  assert.equal(command.persistence.completed, 0);
  assert.equal(command.persistence.persistent_file_writes, 0);
  assert.equal(err.join('').includes(root), false, 'no local path is echoed');
});

test('a foreign file that replaces a completed output is never deleted and is not claimed', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'answer.json');
  const receiptPath = join(root, 'receipt.json');
  const hook = (phase) => {
    if (phase !== 'committed') return;
    rmSync(outPath, { force: true });
    writeFileSync(outPath, 'FOREIGN-AFTER-COMPLETE\n', 'utf8');
  };
  const { io, out, err } = captureIo(fakeAnswerModel(), hook);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--out', outPath, '--receipt-out', receiptPath], io,
    ),
    (error) => error.code === CLI_CODES.OUTPUT_COMMIT_FAILED,
  );
  assert.equal(readFileSync(outPath, 'utf8'), 'FOREIGN-AFTER-COMPLETE\n');
  assert.equal(existsSync(receiptPath), false);
  assert.equal(out.length, 0);
  const command = commandReceipt(err);
  assert.equal(command.persistence.state, 'partial_unknown');
  assert.equal(command.persistence.unknown, 1);
  assert.equal(command.answer_rendered, true);
  assert.equal(command.answer_emitted_to_stdout, false);
  assert.equal(command.model_invocation_count, 1, 'the model count stays truthful');
});

test('a hardlinked output is reported unknown rather than removed', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'answer.json');
  const aliasPath = join(root, 'alias.json');
  const hook = (phase, index) => {
    if (phase === 'after_write' && index === 0) linkSync(outPath, aliasPath);
  };
  const { io, out, err } = captureIo(fakeAnswerModel(), hook);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli([...argv, '--out', outPath], io),
    (error) => error.code === CLI_CODES.OUTPUT_COMMIT_FAILED,
  );
  assert.equal(existsSync(outPath), true, 'an aliased artifact is not silently removed');
  assert.equal(existsSync(aliasPath), true);
  assert.equal(statSync(outPath).nlink, 2);
  assert.equal(out.length, 0);
  const command = commandReceipt(err);
  assert.equal(command.persistence.state, 'partial_unknown');
  assert.equal(command.persistence.unknown, 1);
  assert.equal(command.persistence.completed, 0);
});

test('a second write failure withdraws both outputs and leaves neither behind', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'answer.json');
  const receiptPath = join(root, 'receipt.json');
  const hook = (phase, index) => {
    if (phase === 'before_write' && index === 1) throw new Error('injected second-write failure');
  };
  const { io, out, err } = captureIo(fakeAnswerModel(), hook);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--out', outPath, '--receipt-out', receiptPath], io,
    ),
    (error) => error.code === CLI_CODES.OUTPUT_COMMIT_FAILED,
  );
  assert.equal(existsSync(outPath), false, 'the first written output is withdrawn');
  assert.equal(existsSync(receiptPath), false);
  assert.equal(out.length, 0, 'one file is never presented as a completed answer');
  const command = commandReceipt(err);
  assert.deepEqual(command.persistence, {
    state: 'rolled_back',
    requested: 2,
    claimed: 2,
    completed: 0,
    rolled_back: 2,
    unknown: 0,
    persistent_file_writes: 0,
  });
});

test('a second write failure over a tampered first output reports partial_unknown', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'answer.json');
  const receiptPath = join(root, 'receipt.json');
  const hook = (phase, index) => {
    if (phase === 'after_write' && index === 0) {
      rmSync(outPath, { force: true });
      writeFileSync(outPath, 'FOREIGN-MIDWAY\n', 'utf8');
    }
    if (phase === 'before_write' && index === 1) throw new Error('injected second-write failure');
  };
  const { io, out, err } = captureIo(fakeAnswerModel(), hook);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--out', outPath, '--receipt-out', receiptPath], io,
    ),
    (error) => error.code === CLI_CODES.OUTPUT_COMMIT_FAILED,
  );
  assert.equal(readFileSync(outPath, 'utf8'), 'FOREIGN-MIDWAY\n', 'foreign bytes are not deleted');
  assert.equal(existsSync(receiptPath), false);
  assert.equal(out.length, 0);
  const command = commandReceipt(err);
  assert.equal(command.persistence.state, 'partial_unknown');
  assert.equal(command.persistence.unknown, 1);
  assert.equal(command.persistence.rolled_back, 1);
  assert.equal(command.persistence.persistent_file_writes, 0);
});

test('a broken stdout sink after commit never withdraws a completed artifact', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'answer.json');
  const receiptPath = join(root, 'receipt.json');
  const err = [];
  const io = {
    answerModel: fakeAnswerModel(),
    stdoutWrite: () => { throw new Error('injected broken stdout sink'); },
    stderrWrite: (value) => err.push(value),
  };
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--out', outPath, '--receipt-out', receiptPath], io,
    ),
  );
  assert.equal(existsSync(outPath), true, 'a committed artifact is not rolled back by a sink error');
  assert.equal(existsSync(receiptPath), true);
  const command = commandReceipt(err);
  assert.equal(command.result, 'HOLD');
  assert.equal(command.persistence.state, 'complete');
  assert.equal(command.persistence.persistent_file_writes, 2);
  assert.equal(command.answer_rendered, true);
  assert.equal(command.answer_emitted_to_stdout, false);
});

test('the runner io surface is closed and the output hook is not part of it', async () => {
  const { argv } = fixture();
  await refusedSurface(argv, {
    answerModel: fakeAnswerModel(),
    stdoutWrite: () => {},
    stderrWrite: () => {},
    outputHook: () => {},
  });
  assert.equal(typeof TEST_ONLY_OUTPUT_HOOK, 'symbol');
  const io = captureIo(fakeAnswerModel(), () => {}).io;
  assert.equal(Object.keys(io).includes('outputHook'), false);
  assert.deepEqual(Object.keys(io).sort(), ['answerModel', 'stderrWrite', 'stdoutWrite']);
});

// ------------------------------------------------------------------ lane holds and inputs

test('a held run reports safe metadata, states the model call, and leaves no artifact', async () => {
  const { root, argv } = fixture();
  const outPath = join(root, 'held_answer.json');
  const answerModel = fakeAnswerModel({ compose: () => ({ sections: [] }) });
  const { io, out, err } = captureIo(answerModel);
  const run = await runSeCoreSourceboundAnswerCli([...argv, '--out', outPath], io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(out.length, 0, 'a held run prints no answer');
  assert.equal(err.length, 1, 'a held run prints one command execution receipt');
  const report = commandReceipt(err);
  assert.equal(report.ok, false);
  assert.equal(report.result, 'HOLD');
  assert.equal(report.blocker_code, LANE_CODES.MODEL_OUTPUT_INVALID);
  assert.equal(report.blocker_stage, 'model_output');
  assert.equal(report.model_call_occurred, true);
  assert.equal(report.model_invocation_count, 1);
  assert.equal(report.answer_rendered, false);
  assert.equal(report.claim_ceiling, 'observed');
  assert.equal(report.lane_internal_writes.filesystem_writes, 0);
  assert.deepEqual(report.persistence, {
    state: 'rolled_back',
    requested: 1,
    claimed: 1,
    completed: 0,
    rolled_back: 1,
    unknown: 0,
    persistent_file_writes: 0,
  });
  assert.throws(() => readFileSync(outPath, 'utf8'), /ENOENT/u);
});

test('a pre-model hold reports that no model call occurred', async () => {
  const { argv } = fixture();
  const drifted = argv.map((value, index) => (
    argv[index - 1] === '--question-sha256' ? sha256('a different question') : value
  ));
  const answerModel = fakeAnswerModel();
  const { io, err } = captureIo(answerModel);
  const run = await runSeCoreSourceboundAnswerCli(drifted, io);
  assert.equal(run.receipt.result, 'HOLD');
  const report = commandReceipt(err);
  assert.equal(report.blocker_code, LANE_CODES.QUESTION_PIN_INVALID);
  assert.equal(report.model_call_occurred, false);
  assert.equal(report.model_invocation_count, 0);
  assert.equal(report.persistence.state, 'not_requested');
  assert.equal(answerModel.calls.length, 0);
});

test('evaluator-only and prior-turn inputs are refused by name before any read', async () => {
  const { root, argv } = fixture();
  for (const name of [
    'se_core_crosswalk.json', 'rubric_v1.json', 'evaluator_gold.md', 'prior_answer.txt',
    'notebooklm_export.json', 'question_set.json', 'review_receipt.json', 'oracle_spec.json',
  ]) {
    const path = join(root, name);
    writeFileSync(path, '{}\n', 'utf8');
    const patched = [...argv];
    patched[patched.indexOf('--source-set-contract') + 1] = path;
    const answerModel = fakeAnswerModel();
    await assert.rejects(
      () => runSeCoreSourceboundAnswerCli(patched, captureIo(answerModel).io),
      (error) => error.code === CLI_CODES.INPUT_REFUSED,
      name,
    );
    assert.equal(answerModel.calls.length, 0);
  }
});

test('a derived-text argument outside the frozen contract is refused', async () => {
  const { root, argv } = fixture();
  const strayPath = join(root, 'syn_stray.derived.md');
  writeFileSync(strayPath, '## Page 1\n\nstray verification text\n', 'utf8');
  const patched = [...argv];
  patched[patched.length - 1] = `syn_stray=${strayPath}`;
  const answerModel = fakeAnswerModel();
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(patched, captureIo(answerModel).io),
    (error) => error.code === CLI_CODES.ARGUMENT_INVALID,
  );
  assert.equal(answerModel.calls.length, 0);
});

test('the contract file is split into a pinned commitment and a declared posture', () => {
  const { contractPath, descriptors } = fixture();
  const { contract, posture } = readSourceSetContractFile(contractPath);
  assert.equal(
    seCoreSourceSetContractSha256(contract),
    seCoreSourceSetContractSha256(sourceSetContract(descriptors)),
  );
  for (const source of contract.sources) {
    assert.deepEqual(Object.keys(source).sort(), [
      'derived_text_sha256', 'page_count', 'revision', 'source_id', 'source_pdf_sha256', 'title',
    ]);
    assert.equal(posture.get(source.source_id).permissions.canon_promotion, false);
    assert.equal(posture.get(source.source_id).approval.reuse_rights_reviewed, true);
  }
});

test('a malformed contract file is refused with no model call', async () => {
  const { root, argv } = fixture();
  for (const body of [
    'not json at all',
    '{"schema_version":"x","source_set_id":"y"}',
    '{"schema_version":"x","source_set_id":"y","sources":[]}',
    '{"schema_version":"x","source_set_id":"y","sources":[{"source_id":"a"}]}',
  ]) {
    const path = join(root, `contract_${sha256(body).slice(0, 8)}.json`);
    writeFileSync(path, body, 'utf8');
    const patched = [...argv];
    patched[patched.indexOf('--source-set-contract') + 1] = path;
    const answerModel = fakeAnswerModel();
    await assert.rejects(
      () => runSeCoreSourceboundAnswerCli(patched, captureIo(answerModel).io),
      (error) => error.code === CLI_CODES.CONTRACT_FILE_INVALID,
      body.slice(0, 20),
    );
    assert.equal(answerModel.calls.length, 0);
  }
});

// ------------------------------------------------------------------ loopback endpoint

test('only a canonical numeric loopback origin is accepted as a model target', () => {
  for (const target of [
    'http://127.0.0.1:11434', 'http://127.0.0.2:11434', 'http://127.1.2.3:8080',
    'http://[::1]:11434',
  ]) {
    assert.equal(assertLoopbackOllamaTarget(target), target, target);
  }
  assert.equal(assertLoopbackOllamaTarget('http://127.0.0.1:11434/'), 'http://127.0.0.1:11434');
  for (const target of [
    // A name is not a number: resolution is someone else's decision.
    'http://localhost:11434',
    'http://LOCALHOST:11434',
    'http://localhost.localdomain:11434',
    'http://ollama.example.com',
    // Decimal, octal, and hex spellings that a URL parser silently folds into 127.0.0.1.
    'http://2130706433:11434',
    'http://0x7f000001:11434',
    'http://0177.0.0.1:11434',
    'http://127.1:11434',
    'http://127.00.0.1:11434',
    'http://127.0.0.256:11434',
    // Non-canonical or mapped IPv6 loopback spellings.
    'http://[0:0:0:0:0:0:0:1]:11434',
    'http://[::ffff:127.0.0.1]:11434',
    'http://[::2]:11434',
    // Off-loopback, wrong scheme, credentials, path, query, fragment.
    'http://192.168.1.20:11434',
    'http://126.0.0.1:11434',
    'https://127.0.0.1:11434',
    'http://user:pass@127.0.0.1:11434',
    'http://127.0.0.1:11434/api/chat',
    'http://127.0.0.1:11434/api',
    'http://127.0.0.1:11434/?x=1',
    'http://127.0.0.1:11434/#frag',
    'ws://127.0.0.1:11434',
    `${'file:'}${'///'}etc/hosts`,
    'not a url',
    // A default or absent port is an ambiguous endpoint for a service that has neither.
    'http://127.0.0.1',
    'http://127.0.0.1:80',
    'http://127.0.0.1:0',
    'http://127.0.0.1:70000',
  ]) {
    assert.throws(
      () => assertLoopbackOllamaTarget(target),
      (error) => error.code === CLI_CODES.MODEL_TARGET_REFUSED,
      target,
    );
  }
});

test('only the exact runtime model is served', () => {
  assert.throws(
    () => createLoopbackOllamaAnswerModel({ model: 'llama3:8b', fetchImpl: async () => ({}) }),
    (error) => error.code === CLI_CODES.MODEL_TARGET_REFUSED,
  );
  assert.throws(
    () => parseArgs(['--model', 'llama3:8b']),
    (error) => error.code === CLI_CODES.ARGUMENT_INVALID,
  );
  const model = createLoopbackOllamaAnswerModel({ fetchImpl: async () => ({}) });
  assert.equal(model.descriptor.adapter_id, 'loopback_ollama_chat');
  assert.equal(model.descriptor.stateless, true);
  assert.equal(model.descriptor.tools_enabled, false);
  assert.equal(model.descriptor.history_enabled, false);
});

test('the loopback adapter is one plain own-data object the hardened lane accepts', () => {
  const model = createLoopbackOllamaAnswerModel({ fetchImpl: async () => ({}) });
  assert.equal(Object.getPrototypeOf(model), Object.prototype);
  for (const key of ['descriptor', 'composeAnswer', 'proposeQueryExpansion']) {
    const slot = Object.getOwnPropertyDescriptor(model, key);
    assert.equal(slot.enumerable, true, key);
    assert.equal(Object.hasOwn(slot, 'value'), true, `${key} must not be an accessor`);
  }
  assert.equal(typeof model.composeAnswer, 'function');
  assert.equal(typeof model.proposeQueryExpansion, 'function');
  assert.equal(Object.getPrototypeOf(model.descriptor), Object.prototype);
  assert.deepEqual(Object.keys(model.descriptor).sort(), [
    'adapter_id', 'adapter_revision', 'history_enabled', 'stateless', 'tools_enabled',
  ]);
});

test('each loopback request is stateless: one message, no history, no tools, no session', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    return bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS)));
  };
  const model = createLoopbackOllamaAnswerModel({ fetchImpl, timeoutMs: 5000 });
  const first = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(model).io);
  const second = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(model).io);
  assert.equal(first.receipt.result, 'PASS');
  assert.equal(second.receipt.result, 'PASS');
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(request.init.method, 'POST');
    assert.equal(request.body.model, EXACT_ANSWER_MODEL);
    assert.equal(request.body.messages.length, 1);
    assert.equal(request.body.messages[0].role, 'user');
    assert.equal(request.body.stream, false);
    assert.equal(request.body.keep_alive, OLLAMA_KEEP_ALIVE);
    assert.equal(request.body.options.temperature, 0);
    for (const forbidden of [
      'context', 'conversation_id', 'session_id', 'session', 'tools', 'history', 'system',
    ]) {
      assert.equal(Object.hasOwn(request.body, forbidden), false, forbidden);
    }
  }
  assert.equal(requests[0].init.body, requests[1].init.body, 'no prior turn leaks into a later call');
  assert.equal(
    first.receipt.prompt_commitment.prompt_sha256,
    second.receipt.prompt_commitment.prompt_sha256,
  );
  assert.equal(first.receipt.model_adapter.adapter_id, 'loopback_ollama_chat');
  assert.equal(first.receipt.model_adapter.history_enabled, false);
});

test('a loopback request refuses to follow a redirect off the pinned origin', async () => {
  const inits = [];
  const fetchImpl = async (url, init) => {
    inits.push(init);
    return bodyResponse(envelopeFor(JSON.stringify({ terms: ['x'] })));
  };
  const model = createLoopbackOllamaAnswerModel({ fetchImpl, timeoutMs: 5000 });
  await model.proposeQueryExpansion({
    instruction: 'i', question_text: 'q', max_terms: 2, output_schema: {},
  });
  assert.equal(inits.length, 1);
  assert.equal(
    inits[0].redirect, 'error',
    'a 307/308 would replay this method and this prompt body at whatever host it names',
  );
});

test('a non-success or unparseable loopback response holds without echoing the body', async () => {
  for (const fetchImpl of [
    async () => bodyResponse('{"error":"boom-secret-detail"}', { ok: false }),
    async () => bodyResponse(envelopeFor('not json')),
    async () => bodyResponse('{}'),
    async () => { throw new Error('ECONNREFUSED at 127.0.0.1:11434'); },
  ]) {
    const model = createLoopbackOllamaAnswerModel({ fetchImpl, timeoutMs: 5000 });
    const { io, out, err } = captureIo(model);
    const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
    assert.equal(run.receipt.result, 'HOLD');
    assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
    assert.equal(out.length, 0);
    const report = commandReceipt(err);
    assert.equal(report.model_call_occurred, true);
    assert.equal(err.join('').includes('boom-secret-detail'), false);
    assert.equal(err.join('').includes('ECONNREFUSED'), false);
  }
});

test('a malformed provider reply is never completed into an answer', async () => {
  for (const body of [
    // A reply the provider itself marks unfinished is a truncated generation, not an answer.
    { done: false, message: { content: JSON.stringify({ sections: [] }) } },
    // JSON that is not one object cannot carry the closed output schema.
    { message: { content: '"just a string"' } },
    { message: { content: '[1,2,3]' } },
    { message: { content: 'null' } },
    { message: { content: '' } },
    { message: { content: 42 } },
    // A response envelope that is not one object at all.
    [1, 2, 3],
  ]) {
    const model = createLoopbackOllamaAnswerModel({
      fetchImpl: async () => bodyResponse(JSON.stringify(body)),
      timeoutMs: 5000,
    });
    const { io, out, err } = captureIo(model);
    const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
    assert.equal(run.receipt.result, 'HOLD', JSON.stringify(body).slice(0, 40));
    assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
    assert.equal(out.length, 0, 'nothing is invented to fill a malformed reply');
    assert.equal(commandReceipt(err).answer_rendered, false);
  }
  // The well-formed shape still passes, so the guard above is not simply refusing everything.
  const ok = createLoopbackOllamaAnswerModel({
    fetchImpl: jsonResponder({
      sections: [{ heading: '판단', text: '검증 기준이 필요합니다.', evidence_ids: ['E1'] }],
    }),
    timeoutMs: 5000,
  });
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(ok).io);
  assert.equal(run.receipt.result, 'PASS');
});

test('the rendered prompt text carries the question and evidence but never a schema key leak', () => {
  const request = {
    instruction: 'INSTRUCTION',
    question_text: SYNTHETIC_QUESTION,
    evidence: [{
      evidence_id: 'E1',
      source_title: 'Synthetic Systems Engineering Practice Guide',
      source_revision: 'SYN-A rev 1',
      page_number: 1,
      text: 'Each verification activity declares measurable pass and fail criteria.',
    }],
    output_schema: { root: 'one plain object whose only key is sections' },
  };
  const prompt = renderPromptText(request);
  assert.ok(prompt.includes(SYNTHETIC_QUESTION));
  assert.ok(prompt.includes('E1'));
  assert.ok(prompt.includes('page 1'));
  assert.ok(prompt.includes('Each verification activity'));
  assert.equal(prompt.includes('_workspaces'), false);
  assert.equal(prompt.endsWith('\n'), true);
});

test('the CLI argument surface stays closed and explicit', () => {
  const { argv, root } = fixture();
  const replace = (flag, value) => {
    const patched = [...argv];
    patched[patched.indexOf(flag) + 1] = value;
    return patched;
  };
  const cases = [
    [...argv, '--unknown', 'x'],
    [...argv, '--out'],
    argv.slice(0, 4),
    [...argv, '--derived-text', `syn_alpha_practice_guide=${join(root, 'x.md')}`],
    [...argv, '--query-expansion', 'always'],
    [...argv, '--max-evidence', '0'],
    [...argv, '--point-in-time', '2026-08-13'],
    [...argv, '--out', join(root, 'a.json'), '--receipt-out', join(root, 'a.json')],
    replace('--question-sha256', 'nothex'),
    replace('--source-set-sha256', 'ABCDEF'),
    replace('--question-bytes', '0'),
  ];
  for (const argument of cases) {
    assert.throws(
      () => parseArgs(argument),
      (error) => error.code === CLI_CODES.ARGUMENT_INVALID,
      JSON.stringify(argument.slice(-2)),
    );
  }
  const accepted = parseArgs(argv);
  assert.equal(accepted.derivedText.length, 4);
  assert.equal(accepted.flags['--point-in-time'], SYNTHETIC_POINT_IN_TIME);
});

test('an advisory query expansion can be requested from the CLI and stays shadow', async () => {
  const { argv } = fixture();
  const answerModel = fakeAnswerModel();
  const { io } = captureIo(answerModel);
  const run = await runSeCoreSourceboundAnswerCli(
    [...argv, '--query-expansion', 'advisory'], io,
  );
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(run.receipt.query_expansion.posture, 'model_advisory_shadow');
  assert.equal(run.receipt.query_expansion.authoritative, false);
  assert.equal(run.receipt.query_expansion.engine_retrieval, false);
  assert.equal(run.receipt.model.expansion_invocation_count, 1);

  const off = await runSeCoreSourceboundAnswerCli(argv, captureIo(fakeAnswerModel()).io);
  assert.equal(off.receipt.query_expansion.posture, 'not_requested');
  assert.equal(off.receipt.model.invocation_count, 1);
});

// ------------------------------------------------------------------ fixed benchmark pin

const PIN_ID = 'syn_four_source_evaluation_pin_v0';

/** One operator-authored pin document over a runtime cohort, with per-test overrides. */
const pinDocument = (descriptors, overrides = {}) => ({
  pin_id: PIN_ID,
  source_set_id: SYNTHETIC_SOURCE_SET_ID,
  expected_cohort_sha256: seCoreSourceCohortSha256(descriptors),
  allowed_source_ids: descriptors.map((descriptor) => descriptor.source_id),
  ...overrides,
});

function writeDocument(root, name, document) {
  const path = join(root, name);
  writeFileSync(
    path,
    typeof document === 'string' ? document : `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
  return path;
}

/** Replaces one flag's value in a copied argument vector. */
function withFlag(argv, flag, value) {
  const patched = [...argv];
  patched[patched.indexOf(flag) + 1] = value;
  return patched;
}

test('a supplied pin routes the run through the fixed benchmark gate', async () => {
  const { root, argv, descriptors } = fixture();
  const pinPath = writeDocument(root, 'benchmark_pin.json', pinDocument(descriptors));
  const { io, out, err } = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli([...argv, '--benchmark-pin', pinPath], io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(run.receipt.source_set.benchmark_pin.pinned, true);
  assert.equal(run.receipt.source_set.benchmark_pin.cohort_commitment_verified, true);
  assert.equal(run.receipt.source_set.benchmark_pin.fixed_benchmark_identity_asserted, true);
  assert.equal(run.receipt.source_set.benchmark_pin.pin_id, PIN_ID);
  assert.equal(out.length, 1);
  const command = commandReceipt(err);
  assert.equal(command.benchmark.mode, 'pinned');
  assert.equal(command.benchmark.pin_supplied, true);
  assert.equal(command.benchmark.fixed_benchmark_identity_asserted, true);
});

test('a run without a pin stays explicitly generic on both receipts', async () => {
  const { argv } = fixture();
  const { io, err } = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli(argv, io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(run.receipt.source_set.benchmark_pin.pinned, false);
  assert.equal(run.receipt.source_set.benchmark_pin.fixed_benchmark_identity_asserted, false);
  const command = commandReceipt(err);
  assert.equal(command.benchmark.mode, 'generic');
  assert.equal(command.benchmark.pin_supplied, false);
  assert.equal(command.benchmark.fixed_benchmark_identity_asserted, false);
});

test('a drifted cohort commitment refuses the pinned run before any model call', async () => {
  const { root, argv, descriptors } = fixture();
  const outPath = join(root, 'drifted_answer.json');
  const pinPath = writeDocument(root, 'drifted_pin.json', pinDocument(descriptors, {
    expected_cohort_sha256: sha256('a cohort this run is not'),
  }));
  const answerModel = fakeAnswerModel();
  const { io, out, err } = captureIo(answerModel);
  const run = await runSeCoreSourceboundAnswerCli(
    [...argv, '--benchmark-pin', pinPath, '--out', outPath], io,
  );
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.BENCHMARK_PIN_INVALID);
  assert.equal(answerModel.calls.length, 0, 'a refused pin costs zero model calls');
  assert.equal(out.length, 0);
  assert.equal(existsSync(outPath), false, 'a refused pin leaves no artifact');
  const command = commandReceipt(err);
  assert.equal(command.benchmark.mode, 'pinned');
  assert.equal(command.benchmark.fixed_benchmark_identity_asserted, false);
  assert.equal(command.model_invocation_count, 0);
  assert.equal(command.persistence.persistent_file_writes, 0);
});

test('a self-recomputed source-set hash is not a cohort commitment', async () => {
  const { root, argv, descriptors } = fixture();
  // The contract commitment covers identity and byte hashes only, so pasting it into the pin is
  // exactly the self-derived value the pinned gate exists to refuse.
  const pinPath = writeDocument(root, 'source_set_hash_pin.json', pinDocument(descriptors, {
    expected_cohort_sha256: seCoreSourceSetContractSha256(sourceSetContract(descriptors)),
  }));
  const answerModel = fakeAnswerModel();
  const { io, out } = captureIo(answerModel);
  const run = await runSeCoreSourceboundAnswerCli([...argv, '--benchmark-pin', pinPath], io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.BENCHMARK_PIN_INVALID);
  assert.equal(answerModel.calls.length, 0);
  assert.equal(out.length, 0);
});

test('a changed approval status refuses the pinned run at zero model calls', async () => {
  const { root, argv, descriptors } = fixture();
  // Both statuses are accepted by the source-set gate and neither participates in the contract
  // commitment, so this run is self-consistent by every hash the caller controls.
  const document = contractFileDocument(descriptors);
  document.sources[0].approval.approval_status = 'official_public_source';
  const contractPath = writeDocument(root, 'reapproved_contract.json', document);
  const pinPath = writeDocument(root, 'approval_pin.json', pinDocument(descriptors));
  const answerModel = fakeAnswerModel();
  const { io, out } = captureIo(answerModel);
  const run = await runSeCoreSourceboundAnswerCli([
    ...withFlag(argv, '--source-set-contract', contractPath), '--benchmark-pin', pinPath,
  ], io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.BENCHMARK_PIN_INVALID);
  assert.equal(answerModel.calls.length, 0);
  assert.equal(out.length, 0);
});

test('a changed permission refuses before the pinned gate is even reached', async () => {
  const { root, argv, descriptors } = fixture();
  // Permissions are fixed exactly by the source-set gate, which runs ahead of the cohort binding,
  // so this refusal is the earlier one. The requirement is that it holds with no model call.
  const document = contractFileDocument(descriptors);
  document.sources[0].permissions.canon_promotion = true;
  const contractPath = writeDocument(root, 'promotable_contract.json', document);
  const pinPath = writeDocument(root, 'permission_pin.json', pinDocument(descriptors));
  const answerModel = fakeAnswerModel();
  const { io, out } = captureIo(answerModel);
  const run = await runSeCoreSourceboundAnswerCli([
    ...withFlag(argv, '--source-set-contract', contractPath), '--benchmark-pin', pinPath,
  ], io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.SOURCE_SET_INVALID);
  assert.equal(answerModel.calls.length, 0);
  assert.equal(out.length, 0);
});

test('a changed source member refuses the pinned run even with every hash recomputed', async () => {
  const { root, argv, descriptors } = fixture();
  const renamed = descriptors.map((descriptor) => (
    descriptor.source_id === 'syn_delta_production_guide'
      ? { ...descriptor, source_id: 'syn_echo_production_guide' }
      : descriptor
  ));
  const contractPath = writeDocument(root, 'renamed_contract.json', contractFileDocument(renamed));
  const pinPath = writeDocument(root, 'member_pin.json', pinDocument(descriptors));
  const answerModel = fakeAnswerModel();
  const { io, out } = captureIo(answerModel);
  const patched = withFlag(
    withFlag(argv, '--source-set-contract', contractPath),
    '--source-set-sha256',
    seCoreSourceSetContractSha256(sourceSetContract(renamed)),
  );
  const derivedIndex = patched.findIndex((value) => value.startsWith('syn_delta_production_guide='));
  patched[derivedIndex] = patched[derivedIndex].replace(
    'syn_delta_production_guide=', 'syn_echo_production_guide=',
  );
  const run = await runSeCoreSourceboundAnswerCli([...patched, '--benchmark-pin', pinPath], io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.BENCHMARK_PIN_INVALID);
  assert.equal(answerModel.calls.length, 0);
  assert.equal(out.length, 0);
});

test('the benchmark pin file is one closed plain document', async () => {
  const { root, argv, descriptors } = fixture();
  const valid = pinDocument(descriptors);
  const cases = [
    ['not_json', 'nothing like json'],
    ['array', '[]'],
    ['string', '"pinned"'],
    ['extra_key', { ...valid, schema_version: 'x' }],
    ['missing_key', { pin_id: PIN_ID, source_set_id: SYNTHETIC_SOURCE_SET_ID }],
    ['upper_sha', { ...valid, expected_cohort_sha256: valid.expected_cohort_sha256.toUpperCase() }],
    ['short_sha', { ...valid, expected_cohort_sha256: 'abc' }],
    ['three_ids', { ...valid, allowed_source_ids: valid.allowed_source_ids.slice(0, 3) }],
    ['duplicate_ids', { ...valid, allowed_source_ids: [...valid.allowed_source_ids.slice(0, 3), valid.allowed_source_ids[0]] }],
    ['nested_ids', { ...valid, allowed_source_ids: [{ source_id: 'a' }, 'b', 'c', 'd'] }],
    ['nested_pin_id', { ...valid, pin_id: { value: PIN_ID } }],
    ['null_pin_id', { ...valid, pin_id: null }],
    ['proto_key', `{"__proto__":{},"pin_id":"${PIN_ID}","source_set_id":"${SYNTHETIC_SOURCE_SET_ID}","expected_cohort_sha256":"${valid.expected_cohort_sha256}","allowed_source_ids":${JSON.stringify(valid.allowed_source_ids)}}`],
    ['oversized', `${JSON.stringify(valid)}${' '.repeat(16384)}`],
  ];
  for (const [name, document] of cases) {
    const pinPath = writeDocument(root, `bad_pin_${name}.json`, document);
    const answerModel = fakeAnswerModel();
    const { io, err } = captureIo(answerModel);
    await assert.rejects(
      () => runSeCoreSourceboundAnswerCli([...argv, '--benchmark-pin', pinPath], io),
      (error) => error.code === CLI_CODES.BENCHMARK_PIN_FILE_INVALID,
      name,
    );
    assert.equal(answerModel.calls.length, 0, name);
    const joined = err.join('');
    assert.equal(joined.includes(root), false, 'no local path is echoed');
    assert.equal(joined.includes(PIN_ID), false, 'no pin content is echoed');
  }
  // Invalid UTF-8 is refused as a pin document rather than replaced.
  const rawPath = join(root, 'bad_pin_utf8.json');
  writeFileSync(rawPath, Buffer.from([0x7b, 0xff, 0x7d]));
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--benchmark-pin', rawPath], captureIo(fakeAnswerModel()).io,
    ),
    (error) => error.code === CLI_CODES.BENCHMARK_PIN_FILE_INVALID,
  );
});

test('an evaluator-only pin filename is refused by name before any read', async () => {
  const { root, argv, descriptors } = fixture();
  const pinPath = writeDocument(root, 'oracle_pin.json', pinDocument(descriptors));
  const answerModel = fakeAnswerModel();
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--benchmark-pin', pinPath], captureIo(answerModel).io,
    ),
    (error) => error.code === CLI_CODES.INPUT_REFUSED,
  );
  assert.equal(answerModel.calls.length, 0);
});

test('the pinned benchmark is reachable as one canonical command with no JS import', () => {
  const { root, argv, descriptors } = fixture();
  const runnerPath = fileURLToPath(
    new URL('../tools/se_core_sourcebound_answer_runner.mjs', import.meta.url),
  );
  const pinPath = writeDocument(root, 'cli_pin.json', pinDocument(descriptors, {
    expected_cohort_sha256: sha256('a cohort this run is not'),
  }));
  // A drifted pin refuses inside the lane, before the adapter is ever asked for a request, so this
  // end-to-end command contacts no provider and needs no running model.
  let status = 0;
  let stderr = '';
  try {
    execFileSync(process.execPath, [runnerPath, ...argv, '--benchmark-pin', pinPath], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    status = error.status;
    stderr = error.stderr ?? '';
  }
  assert.equal(status, 2, 'a held canonical command exits nonzero');
  const lines = stderr.trim().split('\n').filter((line) => line.length > 0);
  const command = JSON.parse(lines[lines.length - 1]);
  assert.equal(command.schema_version, COMMAND_RECEIPT_SCHEMA_VERSION);
  assert.equal(command.result, 'HOLD');
  assert.equal(command.benchmark.mode, 'pinned');
  assert.equal(command.blocker_code, LANE_CODES.BENCHMARK_PIN_INVALID);
  assert.equal(command.model_call_occurred, false, 'no provider is contacted by this command');
  assert.equal(command.model_invocation_count, 0);
});

// ------------------------------------------------------------------ io surface

/**
 * Runs one refused-surface call and returns what the process's own stderr received.
 *
 * A refused io surface has no caller sink this runner may use — reading one would be the very
 * property read the refusal exists to prevent — so the command receipt goes to the process stderr.
 * Capturing it here both keeps the validator output clean and asserts the fallback is that sink
 * rather than silence.
 */
async function refusedSurface(argv, io, code = CLI_CODES.IO_SURFACE_INVALID) {
  const written = [];
  const original = process.stderr.write;
  process.stderr.write = (value) => { written.push(String(value)); return true; };
  try {
    await assert.rejects(
      () => runSeCoreSourceboundAnswerCli(argv, io),
      (error) => error.code === code,
    );
  } finally {
    process.stderr.write = original;
  }
  return written;
}

test('the io surface is validated before any seam is read and no getter ever runs', async () => {
  const { argv } = fixture();
  const reads = { stdoutWrite: 0, stderrWrite: 0, answerModel: 0, hook: 0 };
  for (const key of ['stdoutWrite', 'stderrWrite', 'answerModel']) {
    const io = {};
    Object.defineProperty(io, key, {
      get() { reads[key] += 1; return () => {}; },
      enumerable: true,
      configurable: true,
    });
    const written = await refusedSurface(argv, io);
    assert.equal(written.length, 1, key);
    const command = JSON.parse(written[0]);
    assert.equal(command.blocker_code, CLI_CODES.IO_SURFACE_INVALID);
    assert.equal(command.model_invocation_count, 0);
    assert.equal(command.persistence.persistent_file_writes, 0);
  }
  const hooked = { answerModel: fakeAnswerModel(), stdoutWrite: () => {}, stderrWrite: () => {} };
  Object.defineProperty(hooked, TEST_ONLY_OUTPUT_HOOK, {
    get() { reads.hook += 1; return () => {}; },
    enumerable: true,
    configurable: true,
  });
  await refusedSurface(argv, hooked);
  assert.deepEqual(reads, {
    stdoutWrite: 0, stderrWrite: 0, answerModel: 0, hook: 0,
  }, 'an accessor io surface is refused without ever being invoked');
});

test('an inherited, hidden, or custom-prototype io surface is refused', async () => {
  const { argv } = fixture();
  const inherited = Object.create({ stdoutWrite: () => {} });
  inherited.stderrWrite = () => {};
  const hidden = { stderrWrite: () => {} };
  Object.defineProperty(hidden, 'stdoutWrite', { value: () => {}, enumerable: false });
  const nullPrototype = Object.create(null);
  nullPrototype.stderrWrite = () => {};
  class Surface { constructor() { this.stderrWrite = () => {}; } }
  for (const io of [inherited, hidden, nullPrototype, new Surface(), [], () => {}]) {
    await refusedSurface(argv, io);
  }
});

test('the test-only checkpoint is the sole accepted symbol on the io surface', async () => {
  const { argv } = fixture();
  const stranger = { answerModel: fakeAnswerModel(), stdoutWrite: () => {}, stderrWrite: () => {} };
  stranger[Symbol('soulforge.not_this_hook')] = () => {};
  await refusedSurface(argv, stranger);
  const wellKnown = { answerModel: fakeAnswerModel(), stdoutWrite: () => {}, stderrWrite: () => {} };
  wellKnown[Symbol.iterator] = () => {};
  await refusedSurface(argv, wellKnown);
});

test('every io seam is taken from one descriptor snapshot and never read again', async () => {
  const { argv } = fixture();
  const out = [];
  const err = [];
  let getCount = 0;
  const target = {
    answerModel: fakeAnswerModel(),
    stdoutWrite: (value) => out.push(value),
    stderrWrite: (value) => err.push(value),
  };
  // A `get` trap fires on every property *read*; a descriptor snapshot does not use one. If the
  // runner ever re-reads a seam from the caller's object, this counter moves.
  const io = new Proxy(target, {
    get(...args) { getCount += 1; return Reflect.get(...args); },
  });
  const run = await runSeCoreSourceboundAnswerCli(argv, io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(out.length, 1);
  assert.equal(getCount, 0, 'no io property is read through a get');
});

// ------------------------------------------------------------------ bounded request timeout

test('the request timeout is bounded at exactly 180000 ms', async () => {
  const { argv } = fixture();
  assert.equal(MAX_TIMEOUT_MS, 180000);
  assert.equal(parseArgs([...argv, '--timeout-ms', '180000']).flags['--timeout-ms'], '180000');
  for (const value of ['180001', '9999999']) {
    assert.throws(
      () => parseArgs([...argv, '--timeout-ms', value]),
      (error) => error.code === CLI_CODES.ARGUMENT_INVALID,
      value,
    );
  }
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS)));
  };
  assert.equal(
    typeof createLoopbackOllamaAnswerModel({ fetchImpl, timeoutMs: MAX_TIMEOUT_MS }).composeAnswer,
    'function',
  );
  for (const timeoutMs of [180001, 9999999, 0, -1, 1.5, Number.NaN, '5000']) {
    assert.throws(
      () => createLoopbackOllamaAnswerModel({ fetchImpl, timeoutMs }),
      (error) => error.code === CLI_CODES.MODEL_TARGET_REFUSED,
      String(timeoutMs),
    );
  }
  assert.equal(fetchCalls, 0, 'an out-of-bounds timeout is refused before any request');
  const answerModel = fakeAnswerModel();
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli(
      [...argv, '--timeout-ms', '180001'], captureIo(answerModel).io,
    ),
    (error) => error.code === CLI_CODES.ARGUMENT_INVALID,
  );
  assert.equal(answerModel.calls.length, 0);
});

// ------------------------------------------------------------------ bounded provider response

test('the adapter bounds and decodes the body itself and never calls response.json', async () => {
  JSON_CALLS.count = 0;
  const model = createLoopbackOllamaAnswerModel({
    fetchImpl: jsonResponder(OK_SECTIONS), timeoutMs: 5000,
  });
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(model).io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(JSON_CALLS.count, 0, 'the unbounded convenience path is never taken');
});

test('an oversized declared content length is refused before the body is read', async () => {
  let bodyReads = 0;
  const model = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => ({
      ok: true,
      headers: {
        get: (name) => (String(name).toLowerCase() === 'content-length'
          ? String(MAX_PROVIDER_RESPONSE_BYTES + 1)
          : null),
      },
      arrayBuffer: async () => { bodyReads += 1; return new ArrayBuffer(0); },
    }),
    timeoutMs: 5000,
  });
  const { io, out, err } = captureIo(model);
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(bodyReads, 0, 'a body over the declared cap is never read');
  assert.equal(out.length, 0);
  assert.equal(commandReceipt(err).model_invocation_count, 1, 'the model count stays truthful');
});

test('a streamed body that crosses the cap is cancelled and refused', async () => {
  let cancelled = false;
  let delivered = 0;
  const chunk = new Uint8Array(65536).fill(0x20);
  const model = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          async read() {
            delivered += 1;
            return { done: false, value: chunk };
          },
          async cancel() { cancelled = true; },
        }),
      },
      arrayBuffer: async () => { throw new Error('the stream path must be preferred'); },
    }),
    timeoutMs: 5000,
  });
  const { io, out, err } = captureIo(model);
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(cancelled, true, 'the reader is cancelled once the cap is crossed');
  assert.ok(delivered <= (MAX_PROVIDER_RESPONSE_BYTES / chunk.length) + 1,
    'the counter stops at the cap rather than draining the stream');
  assert.equal(out.length, 0);
  assert.equal(commandReceipt(err).answer_rendered, false);
});

test('a response exactly at the byte bound is accepted and one byte more is refused', async () => {
  const envelope = envelopeFor(JSON.stringify(OK_SECTIONS));
  const exact = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(padJsonTo(envelope, MAX_PROVIDER_RESPONSE_BYTES)),
    timeoutMs: 5000,
  });
  const accepted = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(exact).io);
  assert.equal(accepted.receipt.result, 'PASS');

  const over = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(padJsonTo(envelope, MAX_PROVIDER_RESPONSE_BYTES + 1)),
    timeoutMs: 5000,
  });
  const refused = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(over).io);
  assert.equal(refused.receipt.result, 'HOLD');
  assert.equal(refused.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
});

test('message content is bounded in characters and in UTF-8 bytes', async () => {
  const content = JSON.stringify(OK_SECTIONS);
  const atCharBound = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(
      envelopeFor(padJsonToChars(content, MAX_MESSAGE_CONTENT_CHARS)),
    ),
    timeoutMs: 5000,
  });
  const accepted = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(atCharBound).io);
  assert.equal(accepted.receipt.result, 'PASS');

  const overCharBound = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(
      envelopeFor(padJsonToChars(content, MAX_MESSAGE_CONTENT_CHARS + 1)),
    ),
    timeoutMs: 5000,
  });
  const tooManyChars = await runSeCoreSourceboundAnswerCli(
    fixture().argv, captureIo(overCharBound).io,
  );
  assert.equal(tooManyChars.receipt.result, 'HOLD');
  assert.equal(tooManyChars.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);

  // Under the character cap, over the byte cap: three-byte characters are where the two differ.
  const wide = JSON.stringify({
    sections: [{ heading: '판단', text: '가'.repeat(45000), evidence_ids: ['E1'] }],
  });
  assert.ok(wide.length < MAX_MESSAGE_CONTENT_CHARS);
  assert.ok(Buffer.byteLength(wide, 'utf8') > MAX_MESSAGE_CONTENT_BYTES);
  const overByteBound = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(envelopeFor(wide)),
    timeoutMs: 5000,
  });
  const { io, out, err } = captureIo(overByteBound);
  const tooManyBytes = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
  assert.equal(tooManyBytes.receipt.result, 'HOLD');
  assert.equal(tooManyBytes.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(out.length, 0);
  assert.equal(err.join('').includes('가가'), false, 'no provider text is echoed');
});

test('an undecodable response body is refused rather than replaced', async () => {
  const invalid = Buffer.from([0x7b, 0x22, 0x6d, 0x22, 0x3a, 0xff, 0xfe, 0x7d]);
  const model = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => invalid.buffer.slice(
        invalid.byteOffset, invalid.byteOffset + invalid.length,
      ),
    }),
    timeoutMs: 5000,
  });
  const { io, out, err } = captureIo(model);
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(out.length, 0);
  assert.equal(err.join('').includes('�'), false, 'nothing is replacement-decoded into a log');
});

test('a declared response model must be the exact runtime model', async () => {
  const wrong = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(
      envelopeFor(JSON.stringify(OK_SECTIONS), { model: 'llama3:8b' }),
    ),
    timeoutMs: 5000,
  });
  const { io, out, err } = captureIo(wrong);
  const refused = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
  assert.equal(refused.receipt.result, 'HOLD');
  assert.equal(refused.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(out.length, 0);
  assert.equal(err.join('').includes('llama3'), false, 'no provider field is echoed');

  const declared = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(
      envelopeFor(JSON.stringify(OK_SECTIONS), { model: EXACT_ANSWER_MODEL }),
    ),
    timeoutMs: 5000,
  });
  const named = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(declared).io);
  assert.equal(named.receipt.result, 'PASS');

  // A reply that omits the field is accepted: the request already pins the model, and nothing in
  // the receipt claims provider-side verification either way.
  const silent = createLoopbackOllamaAnswerModel({
    fetchImpl: jsonResponder(OK_SECTIONS), timeoutMs: 5000,
  });
  const unnamed = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(silent).io);
  assert.equal(unnamed.receipt.result, 'PASS');
});

// ------------------------------------------------------------------ bounded local inputs

/**
 * The synthetic question padded to an exact UTF-8 byte length.
 *
 * The pad is deliberately three-byte Korean text rather than spaces. The question ceiling under
 * test counts bytes, but the corpus search bounds its query in UTF-16 units at a lower number, so
 * an ASCII pad would cross that unrelated bound first and the run would hold in retrieval instead
 * of proving anything about the byte ceiling. The original question's own tokens are untouched, so
 * retrieval still hits.
 */
function questionOfExactly(bytes) {
  const pad = bytes - Buffer.byteLength(SYNTHETIC_QUESTION, 'utf8');
  assert.ok(pad >= 0, 'the padding target must not be smaller than the question');
  return `${SYNTHETIC_QUESTION}${' '.repeat(pad % 3)}${'가'.repeat(Math.floor(pad / 3))}`;
}

/**
 * Four runtime descriptors whose first source carries a derived text of exactly `bytes` bytes.
 *
 * The padding is ordinary ASCII prose in blank-line-separated blocks under the chunk ceiling, so
 * the stream stays one valid page-aware document and the lane's chunker packs it the way it packs
 * a real extraction rather than walking an eight-megabyte single word.
 */
function descriptorsWithDerivedTextOf(bytes) {
  const descriptors = sourceDescriptors();
  const target = descriptors[0];
  const base = target.derived_text_bytes.toString('utf8');
  const block = `${'filler '.repeat(114).trim()}\n\n`;
  const pad = bytes - base.length;
  assert.ok(pad >= 0, 'the padding target must not be smaller than the derived text');
  const derived = Buffer.from(
    `${base}${block.repeat(Math.ceil(pad / block.length)).slice(0, pad)}`,
    'utf8',
  );
  assert.equal(derived.length, bytes, 'the padded derived text must land on the exact byte target');
  target.derived_text_bytes = derived;
  target.derived_text_sha256 = sha256(derived);
  return descriptors;
}

/** Asserts one CLI run is refused by the runner's own input gate, before the lane and the model. */
async function refusedInput(argv, root, code = CLI_CODES.INPUT_READ_FAILED) {
  const answerModel = fakeAnswerModel();
  const { io, out, err } = captureIo(answerModel);
  const outPath = join(root, `refused_${sha256(argv.join('|')).slice(0, 10)}.json`);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli([...argv, '--out', outPath], io),
    (error) => error.code === code,
  );
  assert.equal(answerModel.calls.length, 0, 'a refused input must cost zero model calls');
  assert.equal(out.length, 0, 'a refused input emits no answer');
  assert.equal(existsSync(outPath), false, 'a refused input stages no output');
  const command = commandReceipt(err);
  assert.equal(command.result, 'HOLD');
  assert.equal(command.model_invocation_count, 0);
  assert.equal(command.persistence.persistent_file_writes, 0);
  assert.equal(err.join('').includes(root), false, 'no local path is echoed');
}

test('every named local input declares its own byte ceiling', () => {
  assert.equal(MAX_SOURCE_SET_CONTRACT_BYTES, 65536);
  assert.equal(MAX_BENCHMARK_PIN_BYTES, 4096);
  assert.equal(MAX_QUESTION_BYTES, 8192);
  assert.equal(MAX_DERIVED_TEXT_BYTES, 8 * 1024 * 1024);
});

test('the question and derived-text ceilings are exactly the ones the lane enforces', async () => {
  // One byte over each ceiling, handed straight to the lane with every pin computed from those
  // same bytes, so the only property that can refuse either run is the ceiling itself. Together
  // with the two CLI boundary tests below — where the exact ceiling answers end to end — this
  // pins the runner's constant to the lane's from both sides, so neither can drift alone.
  const question = await runSeCoreSourceboundAnswerLane(
    laneInput({
      commitment: seCoreSourceSetContractSha256,
      question: questionOfExactly(MAX_QUESTION_BYTES + 1),
    }),
    { answerModel: fakeAnswerModel() },
  );
  assert.equal(question.receipt.result, 'HOLD');
  assert.equal(question.receipt.blocker_code, LANE_CODES.QUESTION_PIN_INVALID);

  const oversized = descriptorsWithDerivedTextOf(MAX_DERIVED_TEXT_BYTES + 1);
  const contract = sourceSetContract(oversized);
  const input = laneInput({ commitment: seCoreSourceSetContractSha256 });
  input.corpus = {
    sourceSetContract: contract,
    expectedSourceSetSha256: seCoreSourceSetContractSha256(contract),
    sources: oversized,
  };
  const derived = await runSeCoreSourceboundAnswerLane(input, { answerModel: fakeAnswerModel() });
  assert.equal(derived.receipt.result, 'HOLD');
  assert.equal(derived.receipt.blocker_code, LANE_CODES.DERIVED_TEXT_PIN_INVALID);
});

test('a question at exactly the ceiling is answered and one byte more is refused', async () => {
  const { argv } = fixture(sourceDescriptors(), questionOfExactly(MAX_QUESTION_BYTES));
  const { io, out } = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli(argv, io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(out.length, 1);

  const over = fixture(sourceDescriptors(), questionOfExactly(MAX_QUESTION_BYTES + 1));
  await refusedInput(over.argv, over.root);
});

test('a source-set contract at exactly its ceiling is read and one byte more is refused',
  async () => {
    const { root, argv, descriptors } = fixture();
    const document = JSON.stringify(contractFileDocument(descriptors));
    const at = writeDocument(root, 'padded_contract.json',
      padJsonTo(document, MAX_SOURCE_SET_CONTRACT_BYTES));
    const { io, out } = captureIo(fakeAnswerModel());
    const run = await runSeCoreSourceboundAnswerCli(
      withFlag(argv, '--source-set-contract', at), io,
    );
    assert.equal(run.receipt.result, 'PASS');
    assert.equal(out.length, 1);
    assert.equal(statSync(at).size, MAX_SOURCE_SET_CONTRACT_BYTES);

    const over = writeDocument(root, 'oversized_contract.json',
      padJsonTo(document, MAX_SOURCE_SET_CONTRACT_BYTES + 1));
    await refusedInput(withFlag(argv, '--source-set-contract', over), root);
  });

test('a benchmark pin at exactly its ceiling is read and one byte more is refused', async () => {
  const { root, argv, descriptors } = fixture();
  const document = JSON.stringify(pinDocument(descriptors));
  const at = writeDocument(root, 'padded_pin.json', padJsonTo(document, MAX_BENCHMARK_PIN_BYTES));
  const { io, out } = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli([...argv, '--benchmark-pin', at], io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(run.receipt.source_set.benchmark_pin.fixed_benchmark_identity_asserted, true);
  assert.equal(out.length, 1);
  assert.equal(statSync(at).size, MAX_BENCHMARK_PIN_BYTES);

  const over = writeDocument(root, 'oversized_pin.json',
    padJsonTo(document, MAX_BENCHMARK_PIN_BYTES + 1));
  await refusedInput(
    [...argv, '--benchmark-pin', over], root, CLI_CODES.BENCHMARK_PIN_FILE_INVALID,
  );
});

test('a derived text at exactly the ceiling is answered and one byte more is refused', async () => {
  const { argv, root } = fixture(descriptorsWithDerivedTextOf(MAX_DERIVED_TEXT_BYTES));
  const { io, out } = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli(argv, io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(out.length, 1);
  assert.equal(
    statSync(join(root, 'syn_alpha_practice_guide.derived.md')).size, MAX_DERIVED_TEXT_BYTES,
  );

  const over = fixture(descriptorsWithDerivedTextOf(MAX_DERIVED_TEXT_BYTES + 1));
  await refusedInput(over.argv, over.root);
});

test('an empty named input is refused rather than read as zero bytes', async () => {
  const { root, argv } = fixture();
  const empty = join(root, 'empty_input.txt');
  writeFileSync(empty, Buffer.alloc(0));
  await refusedInput(withFlag(argv, '--question', empty), root);

  const patched = [...argv];
  patched[patched.length - 1] = `syn_delta_production_guide=${empty}`;
  await refusedInput(patched, root);
});

test('a directory, a junction, a hard link, and a symlink are not ordinary input files',
  async (t) => {
    const { root, argv, questionPath } = fixture();
    const targets = [['directory', join(root, 'a_directory')]];
    mkdirSync(targets[0][1]);
    symlinkSync(targets[0][1], join(root, 'a_junction'), 'junction');
    targets.push(['junction', join(root, 'a_junction')]);
    // A second hard link is a second name for the same bytes, under which somebody else may be
    // writing while this read is in flight, so the file is no longer one this call can bound.
    linkSync(questionPath, join(root, 'a_hard_link.txt'));
    targets.push(['hard link', join(root, 'a_hard_link.txt')]);
    try {
      symlinkSync(questionPath, join(root, 'a_symlink.txt'), 'file');
      targets.push(['symlink', join(root, 'a_symlink.txt')]);
    } catch {
      t.diagnostic('this platform does not permit creating a file symlink; that case is not run');
    }
    if (process.platform !== 'win32') targets.push(['device', '/dev/null']);
    for (const [kind, path] of targets) {
      await refusedInput(withFlag(argv, '--question', path), root, CLI_CODES.INPUT_READ_FAILED);
      assert.ok(kind.length > 0);
    }
    // The hard link also refuses the file it aliases: the original now carries two names too.
    await refusedInput(argv, root);
  });

test('no named input is read with a whole-file convenience call', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../tools/se_core_sourcebound_answer_runner.mjs', import.meta.url)),
    'utf8',
  );
  assert.equal(
    source.includes('readFileSync'), false,
    'a whole-file read sizes its allocation from the file it has not bounded yet',
  );
  assert.ok(source.includes('fstatSync'), 'the size is taken from the open handle');
});
