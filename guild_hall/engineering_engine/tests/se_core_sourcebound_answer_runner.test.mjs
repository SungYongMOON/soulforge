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
  MAX_ANSWER_PROPOSITIONS,
  MAX_BENCHMARK_PIN_BYTES,
  MAX_DERIVED_TEXT_BYTES,
  MAX_EXPANSION_TERMS,
  MAX_EXPANSION_TERM_CHARS,
  MAX_MESSAGE_CONTENT_BYTES,
  MAX_MESSAGE_CONTENT_CHARS,
  MAX_PROVIDER_RESPONSE_BYTES,
  MAX_QUESTION_BYTES,
  MAX_SOURCE_SET_CONTRACT_BYTES,
  MAX_TIMEOUT_MS,
  OLLAMA_ADAPTER_REVISION,
  OLLAMA_KEEP_ALIVE,
  MODEL_REFUSAL_REASONS,
  OLLAMA_NUM_CTX,
  OLLAMA_THINK,
  OLLAMA_TRUNCATE_PROMPT,
  TEST_ONLY_OUTPUT_HOOK,
  answerResponseJsonSchema,
  assertLoopbackOllamaTarget,
  assertWritableOutputTarget,
  createLoopbackOllamaAnswerModel,
  expansionResponseJsonSchema,
  finishedReplyContent,
  lastModelRefusalReason,
  openModelRefusalScope,
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

/**
 * One envelope whose `message.content` is the given JSON text.
 *
 * The two completion fields are part of the default because the adapter requires both: a reply
 * that does not say it finished, or does not say it ended on its own, is a refusal rather than an
 * answer. Every caller testing one of those guards overrides exactly the field it is testing.
 */
const envelopeFor = (contentText, envelope = {}) => JSON.stringify({
  done: true, done_reason: 'stop', ...envelope, message: { content: contentText },
});

const jsonResponder = (payload) => async () => bodyResponse(
  envelopeFor(JSON.stringify(payload)),
);

/** One valid rendered answer, as the injected model would return it. */
const OK_SELECTION = {
  schema_version: 'soulforge.se_core_sourcebound_statement_selection.v0',
  result: 'answer',
  propositions: [{ statement_id: 'S1', relation: 'direct' }],
};
const OK_SECTIONS = OK_SELECTION;

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

/**
 * Every top-level member of the command execution receipt, as one closed set.
 *
 * `computed_source_set_sha256` is the one conditional member: it is carried only when the lane
 * published a computed digest, which happens on a source-set commitment mismatch and nowhere else.
 */
const COMMAND_RECEIPT_FIELDS = Object.freeze([
  'answer_emitted_to_stdout', 'answer_rendered', 'benchmark', 'blocker_code', 'blocker_stage',
  'candidate_disposition', 'claim_ceiling', 'lane_id', 'lane_internal_writes', 'lane_ran',
  'model_call_occurred', 'model_invocation_count', 'model_refusal_reason', 'ok',
  'output_safety_reason', 'persistence', 'result', 'schema_version',
]);

test('the command execution receipt is one closed field set at its own schema version', async () => {
  // The set is closed, so a reader keyed to it does not silently accept a receipt carrying a
  // member it has never seen. `model_refusal_reason` was such a member, which is why this schema
  // left v0; `output_safety_reason` is the next one, which is why it is now v2 rather than a v1
  // that quietly grew a field.
  assert.equal(
    COMMAND_RECEIPT_SCHEMA_VERSION,
    'soulforge.se_core_sourcebound_answer_command_receipt.v2',
  );

  const { root, argv } = fixture();
  const passing = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli([...argv, '--out', join(root, 'a.json')],
    passing.io);
  assert.equal(run.receipt.result, 'PASS');
  const passed = commandReceipt(passing.err);
  assert.deepEqual(Object.keys(passed).sort(), [...COMMAND_RECEIPT_FIELDS]);
  assert.equal(passed.schema_version, COMMAND_RECEIPT_SCHEMA_VERSION);
  assert.equal(passed.model_refusal_reason, null);
  assert.equal(passed.output_safety_reason, null);

  // A hold that never reached the lane carries the same closed set and nothing else.
  const early = captureIo(fakeAnswerModel());
  await assert.rejects(runSeCoreSourceboundAnswerCli(['--not-a-flag', 'x'], early.io));
  assert.deepEqual(Object.keys(commandReceipt(early.err)).sort(), [...COMMAND_RECEIPT_FIELDS]);

  // And the one conditional member appears exactly where the lane publishes it.
  const drifted = captureIo(fakeAnswerModel());
  const mismatched = await runSeCoreSourceboundAnswerCli(
    withFlag(argv, '--source-set-sha256', sha256('a source set this run is not')), drifted.io,
  );
  assert.equal(mismatched.receipt.result, 'HOLD');
  const held = commandReceipt(drifted.err);
  assert.deepEqual(Object.keys(held).sort(),
    [...COMMAND_RECEIPT_FIELDS, 'computed_source_set_sha256'].sort());
  assert.match(held.computed_source_set_sha256, /^[0-9a-f]{64}$/u);
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
  const finished = { done: true, done_reason: 'stop' };
  for (const body of [
    // A reply the provider itself marks unfinished is a truncated generation, not an answer.
    { done: false, message: { content: JSON.stringify({ sections: [] }) } },
    // JSON that is not one object cannot carry the closed output schema.
    { ...finished, message: { content: '"just a string"' } },
    { ...finished, message: { content: '[1,2,3]' } },
    { ...finished, message: { content: 'null' } },
    { ...finished, message: { content: '' } },
    { ...finished, message: { content: 42 } },
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
    fetchImpl: jsonResponder(OK_SELECTION),
    timeoutMs: 5000,
  });
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(ok).io);
  assert.equal(run.receipt.result, 'PASS');
});

test('the rendered prompt carries only question and host statements', () => {
  const request = {
    instruction: 'INSTRUCTION',
    question_text: SYNTHETIC_QUESTION,
    statements: [{
      statement_id: 'S1',
      excerpt: 'Each verification activity declares measurable pass and fail criteria.',
    }],
    output_schema: { type: 'object' },
  };
  const prompt = renderPromptText(request);
  assert.ok(prompt.includes(SYNTHETIC_QUESTION));
  assert.ok(prompt.includes('S1'));
  assert.ok(prompt.includes('Each verification activity'));
  assert.equal(prompt.includes('page'), false);
  assert.equal(prompt.includes('_workspaces'), false);
  assert.equal(prompt.endsWith('\n'), true);

  // The renderer reads the two model-visible fields and ignores stray host metadata.
  const stray = renderPromptText({
    ...request,
    statements: [{
      ...request.statements[0],
      source_title: 'Synthetic Systems Engineering Practice Guide',
      source_revision: 'SYN-A rev 1',
      page_number: 12,
    }],
  });
  assert.equal(stray.includes('Synthetic Systems Engineering Practice Guide'), false);
  assert.equal(stray.includes('SYN-A rev 1'), false);
  assert.equal(stray.includes('12'), false);
});

test('the loopback statement shape is opaque while the answer still cites full metadata', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS)));
  };
  const model = createLoopbackOllamaAnswerModel({ fetchImpl, timeoutMs: 5000 });
  const { argv, descriptors } = fixture();
  const run = await runSeCoreSourceboundAnswerCli(argv, captureIo(model).io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(bodies.length, 1);

  const prompt = bodies[0].messages[0].content;
  assert.ok(prompt.includes('S1'));
  for (const descriptor of descriptors) {
    for (const owned of [descriptor.title, descriptor.revision, descriptor.source_id]) {
      assert.equal(prompt.includes(owned), false, `${descriptor.source_id}: ${owned}`);
    }
  }
  assert.equal(/page\s*\d/iu.test(prompt), false, 'no page metadata is rendered into the prompt');

  // Machine-owned metadata is still bound to every citation the answer publishes.
  const titles = new Set(descriptors.map((descriptor) => descriptor.title));
  const revisions = new Set(descriptors.map((descriptor) => descriptor.revision));
  let bound = 0;
  for (const section of run.answer.sections) {
    for (const citation of section.citations) {
      assert.equal(titles.has(citation.title), true);
      assert.equal(revisions.has(citation.revision), true);
      assert.ok(Number.isSafeInteger(citation.page_number) && citation.page_number >= 1);
      bound += 1;
    }
  }
  assert.ok(bound >= 1);
});

test('the adapter revision moves with the prompt rendering it produces', () => {
  assert.equal(
    OLLAMA_ADAPTER_REVISION, 'soulforge.se_core_sourcebound_answer_ollama_adapter.v3',
  );
  const model = createLoopbackOllamaAnswerModel({ fetchImpl: async () => bodyResponse('{}') });
  assert.equal(model.descriptor.adapter_revision, OLLAMA_ADAPTER_REVISION);
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

/**
 * One synthetic streamed response whose reader is driven by `read`.
 *
 * `cancel` is a tripwire rather than a courtesy: a step this adapter refuses must still leave the
 * stream cancelled. `arrayBuffer` throws for the same reason it does elsewhere — a body that
 * exposes a stream commits the call to that stream and is never read a second way.
 */
function streamedResponse(read, seen) {
  return {
    ok: true,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read,
        async cancel() { seen.cancelled = true; },
      }),
    },
    arrayBuffer: async () => { throw new Error('the stream path must be preferred'); },
  };
}

test('a well-formed streamed body is read from its own step snapshot and answered', async () => {
  // The step a reader hands back is provider-shaped material like every other value at this seam,
  // so it is taken as one snapshot of own data. A stream that delivers its chunks that way still
  // answers end to end, in one chunk or several, and with either ordinary prototype a real reader
  // may hand over.
  const bytes = Buffer.from(envelopeFor(JSON.stringify(OK_SECTIONS)), 'utf8');
  const half = Math.floor(bytes.length / 2);
  const bare = (fields) => Object.assign(Object.create(null), fields);
  const cases = [
    ['two ordinary steps then done', [
      { done: false, value: new Uint8Array(bytes.subarray(0, half)) },
      { done: false, value: new Uint8Array(bytes.subarray(half)) },
      { done: true, value: undefined },
    ]],
    ['null-prototype steps', [
      bare({ done: false, value: new Uint8Array(bytes) }),
      bare({ done: true }),
    ]],
    ['an empty chunk between two real ones', [
      { done: false, value: new Uint8Array(bytes.subarray(0, half)) },
      { done: false, value: new Uint8Array(0) },
      { done: false, value: new Uint8Array(bytes.subarray(half)) },
      { done: true },
    ]],
  ];
  for (const [label, steps] of cases) {
    const seen = { cancelled: false };
    let index = 0;
    const model = createLoopbackOllamaAnswerModel({
      fetchImpl: async () => streamedResponse(async () => {
        assert.ok(index < steps.length, `${label}: the reader is not read past its done step`);
        const step = steps[index];
        index += 1;
        return step;
      }, seen),
      timeoutMs: 5000,
    });
    const { io, out } = captureIo(model);
    const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
    assert.equal(run.receipt.result, 'PASS', label);
    assert.equal(out.length, 1, label);
    assert.equal(index, steps.length, label);
    assert.equal(seen.cancelled, false, `${label}: a stream read to its end is not cancelled`);
  }
});

test('a stream step this adapter cannot read as own data is cancelled, refused, and never echoed',
  async () => {
    // A read result is the one provider-authored object this loop both checks and then uses, so a
    // shape that can answer those two moments differently — an accessor, a proxy trap, an inherited
    // or hidden slot — is refused rather than read, and so is a step that does not state its own
    // completion or hand over one ordinary chunk. Every one of them cancels the stream and throws
    // this adapter's own fixed refusal with nothing the step carried.
    const secret = 'stream-secret-detail-never-echoed';
    const bytes = () => new Uint8Array(Buffer.from(envelopeFor(JSON.stringify(OK_SECTIONS)), 'utf8'));
    let accessorRuns = 0;
    const behind = (fields, key, read) => {
      const step = { ...fields };
      Object.defineProperty(step, key, {
        get() { accessorRuns += 1; return read(); }, enumerable: true, configurable: true,
      });
      return step;
    };
    const hidden = (fields, key, held) => {
      const step = { ...fields };
      Object.defineProperty(step, key, { value: held, enumerable: false, configurable: true });
      return step;
    };
    class Step {
      constructor() {
        this.done = false;
        this.value = bytes();
      }
    }
    let shifted = 0;
    const cases = [
      ['a getter-backed done', () => behind({ value: bytes() }, 'done', () => false)],
      // The one shape the old read could not survive: a `value` that answers the type check with
      // one chunk and the copy with another.
      ['a shifting getter-backed value', () => behind({ done: false }, 'value', () => {
        shifted += 1;
        return new Uint8Array(shifted === 1 ? 8 : 1024);
      })],
      ['a hidden done', () => hidden({ value: bytes() }, 'done', false)],
      ['a hidden value', () => hidden({ done: false }, 'value', bytes())],
      ['an inherited done', () => Object.assign(Object.create({ done: false }), { value: bytes() })],
      ['a custom prototype', () => Object.assign(Object.create({ marker: 1 }),
        { done: false, value: bytes() })],
      ['a class instance', () => new Step()],
      ['a proxy', () => new Proxy({ done: false, value: bytes() }, {})],
      ['a proxy that refuses to describe itself', () => new Proxy({ done: false, value: bytes() }, {
        getOwnPropertyDescriptor() { throw new Error(secret); },
      })],
      ['no done at all', () => ({ value: bytes() })],
      ['a string done', () => ({ done: 'true', value: bytes() })],
      ['a numeric done', () => ({ done: 1, value: bytes() })],
      ['a null done', () => ({ done: null, value: bytes() })],
      ['an undefined done', () => ({ done: undefined, value: bytes() })],
      ['no value on an unfinished step', () => ({ done: false })],
      ['an undefined value on an unfinished step', () => ({ done: false, value: undefined })],
      ['a string value', () => ({ done: false, value: secret })],
      ['an array value', () => ({ done: false, value: [1, 2, 3] })],
      ['a raw buffer value', () => ({ done: false, value: new ArrayBuffer(8) })],
      ['a step that is not one object', () => secret],
      ['a null step', () => null],
      ['an undefined step', () => undefined],
      ['an array step', () => [false, bytes()]],
    ];
    for (const [label, step] of cases) {
      const seen = { cancelled: false };
      const model = createLoopbackOllamaAnswerModel({
        fetchImpl: async () => streamedResponse(async () => step(), seen),
        timeoutMs: 5000,
      });
      // Called directly at the adapter seam: one fixed contract error and nothing else.
      await assert.rejects(
        () => model.composeAnswer({
          instruction: 'i', question_text: 'q', statements: [], output_schema: {},
        }),
        (error) => error.code === CLI_CODES.MODEL_CALL_REFUSED
          && error.message.endsWith('the loopback model response body could not be read')
          && !error.message.includes(secret),
        label,
      );
      assert.equal(seen.cancelled, true, `${label}: the stream is cancelled on the way out`);
      assert.equal(lastModelRefusalReason(model), MODEL_REFUSAL_REASONS.BODY_UNREADABLE, label);

      // And through the whole command: one HOLD, no answer, and the same token on the receipt.
      const { io, out, err } = captureIo(createLoopbackOllamaAnswerModel({
        fetchImpl: async () => streamedResponse(async () => step(), { cancelled: false }),
        timeoutMs: 5000,
      }));
      const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
      assert.equal(run.receipt.result, 'HOLD', label);
      assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED, label);
      assert.equal(out.length, 0, label);
      const report = commandReceipt(err);
      assert.equal(report.model_refusal_reason, MODEL_REFUSAL_REASONS.BODY_UNREADABLE, label);
      assert.equal(report.answer_rendered, false, label);
      assert.equal(err.join('').includes(secret), false, label);
    }
    assert.equal(accessorRuns, 0, 'no accessor on a stream step is ever invoked');
    assert.equal(shifted, 0, 'a value that could shift is refused before it is read even once');
  });

/** The same synthetic stream, with a reader that counts how many times it was cancelled. */
function countedStreamedResponse(read, seen) {
  return {
    ok: true,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read,
        async cancel() { seen.cancels += 1; },
      }),
    },
    arrayBuffer: async () => { throw new Error('the stream path must be preferred'); },
  };
}

test('a chunk that could answer through provider code is refused, cancelled once, and never echoed',
  async () => {
    // A chunk that passes a type check is still provider-authored material, and `instanceof` is
    // not a statement about how its slots answer: a proxy and a subclass both satisfy it and both
    // intercept every read afterwards, so `chunk.byteLength` and a copy taken through the chunk
    // are provider dispatch points. Each of them can run provider code, answer the byte counter
    // with one number and the copy with another, and throw an error carrying the provider's own
    // text. So the chunk is measured and copied through the engine's intrinsics only, and a shape
    // those intrinsics will not answer for is refused rather than consulted — with the stream
    // cancelled exactly once and this adapter's own fixed refusal on the way out.
    const secret = 'chunk-secret-detail-never-echoed';
    const envelope = () => new Uint8Array(
      Buffer.from(envelopeFor(JSON.stringify(OK_SECTIONS)), 'utf8'),
    );
    let dispatched = 0;
    const trap = () => { dispatched += 1; throw new Error(secret); };
    class LoudChunk extends Uint8Array {
      get byteLength() { return trap(); }
    }
    const cases = [
      // `instanceof Uint8Array` is true for both of these, and every slot read runs their code.
      ['a proxy around a real chunk', () => new Proxy(envelope(), {
        get: trap, getOwnPropertyDescriptor: trap, has: trap,
      })],
      ['a Uint8Array subclass that overrides byteLength', () => new LoudChunk(envelope())],
      ['a real chunk with an own byteLength getter', () => {
        const chunk = envelope();
        Object.defineProperty(chunk, 'byteLength', { get: trap, configurable: true });
        return chunk;
      }],
      // Exactly the right prototype and no own slot at all — and still nothing the engine's own
      // getter will measure, because there is no typed array underneath it.
      ['an object wearing the Uint8Array prototype', () => Object.create(Uint8Array.prototype)],
      // A genuine chunk whose buffer is gone: it measures, and then the copy is what fails.
      ['a chunk over a transferred buffer', () => {
        const buffer = new ArrayBuffer(64);
        const chunk = new Uint8Array(buffer);
        structuredClone(buffer, { transfer: [buffer] });
        return chunk;
      }],
    ];
    for (const [label, chunk] of cases) {
      const seen = { cancels: 0 };
      const model = createLoopbackOllamaAnswerModel({
        fetchImpl: async () => countedStreamedResponse(
          async () => ({ done: false, value: chunk() }), seen,
        ),
        timeoutMs: 5000,
      });
      // Called directly at the adapter seam: one fixed contract error and nothing else.
      await assert.rejects(
        () => model.composeAnswer({
          instruction: 'i', question_text: 'q', statements: [], output_schema: {},
        }),
        (error) => error.code === CLI_CODES.MODEL_CALL_REFUSED
          && error.message.endsWith('the loopback model response body could not be read')
          && !error.message.includes(secret),
        label,
      );
      assert.equal(seen.cancels, 1, `${label}: the stream is cancelled exactly once`);
      assert.equal(lastModelRefusalReason(model), MODEL_REFUSAL_REASONS.BODY_UNREADABLE, label);

      // And through the whole command: one HOLD, no answer, and nothing the chunk carried.
      const cli = { cancels: 0 };
      const { io, out, err } = captureIo(createLoopbackOllamaAnswerModel({
        fetchImpl: async () => countedStreamedResponse(
          async () => ({ done: false, value: chunk() }), cli,
        ),
        timeoutMs: 5000,
      }));
      const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
      assert.equal(run.receipt.result, 'HOLD', label);
      assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED, label);
      assert.equal(cli.cancels, 1, `${label}: the command cancels the stream exactly once`);
      assert.equal(out.length, 0, `${label}: nothing is published`);
      const report = commandReceipt(err);
      assert.equal(report.model_refusal_reason, MODEL_REFUSAL_REASONS.BODY_UNREADABLE, label);
      assert.equal(report.answer_rendered, false, label);
      assert.equal(err.join('').includes(secret), false, label);
    }
    assert.equal(dispatched, 0, 'no slot of a provider chunk is ever read through the chunk');
  });

test('a body delivered by a real Fetch stream reader is still read to its end and answered',
  async () => {
    // The gate above is only correct if it costs a real reader nothing: an actual WHATWG body
    // hands over ordinary `Uint8Array` chunks, in one piece or several, and must still answer.
    const bytes = Buffer.from(envelopeFor(JSON.stringify(OK_SECTIONS)), 'utf8');
    const half = Math.floor(bytes.length / 2);
    const bodies = [
      ['a real Response body', () => new Response(bytes).body],
      ['a real ReadableStream in two chunks', () => new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(bytes.subarray(0, half)));
          controller.enqueue(new Uint8Array(bytes.subarray(half)));
          controller.close();
        },
      })],
    ];
    for (const [label, body] of bodies) {
      const model = createLoopbackOllamaAnswerModel({
        fetchImpl: async () => ({
          ok: true,
          headers: { get: () => null },
          body: body(),
          arrayBuffer: async () => { throw new Error('the stream path must be preferred'); },
        }),
        timeoutMs: 5000,
      });
      const { io, out } = captureIo(model);
      const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
      assert.equal(run.receipt.result, 'PASS', label);
      assert.equal(out.length, 1, label);
    }
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

// ------------------------------------------------------------------ the pinned request shape
//
// Every test below is a regression on one observed benchmark failure. On this base the runner
// stated a model, a temperature, a seed, and a keep-alive, and left the reasoning channel and the
// context window to whatever the daemon defaulted to. Against the pinned thinking-capable model
// that default spent the whole window on a channel this lane never reads: the reply came back
// `done: true`, `done_reason: "length"`, `message.content: ""`, which `done` alone cannot see.

test('the loopback request pins the reasoning channel, the window, and the exact reply shape', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS)));
  };
  const model = createLoopbackOllamaAnswerModel({ fetchImpl, timeoutMs: 5000 });
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(model).io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(bodies.length, 1);
  const [body] = bodies;

  // The reasoning channel is stated, not inherited. This lane reads only `message.content`, so a
  // channel it never reads must not be able to consume the generation budget it depends on.
  assert.equal(OLLAMA_THINK, false);
  assert.equal(body.think, OLLAMA_THINK);

  // The window is stated, not inherited. An inherited window silently drops the front of an
  // oversize prompt, which would answer from fewer capsules than the receipt commits to.
  assert.equal(body.options.num_ctx, OLLAMA_NUM_CTX);
  assert.equal(body.options.temperature, 0);
  assert.equal(body.options.seed, 0);

  // And what the daemon does when a prompt does not fit that window is stated too. The reply
  // cannot be read for this after the fact, so the request asks to be refused instead of trimmed.
  assert.equal(OLLAMA_TRUNCATE_PROMPT, false);
  assert.equal(body.truncate, OLLAMA_TRUNCATE_PROMPT);

  // The reply shape constrains generation instead of being a request graded afterwards.
  assert.notEqual(body.format, 'json');
  assert.equal(body.format.additionalProperties, false);
  assert.deepEqual(body.format.required, ['schema_version', 'result', 'propositions']);
  assert.equal(body.format.properties.propositions.maxItems, MAX_ANSWER_PROPOSITIONS);

  // Pinning a shape must not have opened a channel the stateless contract closed.
  for (const forbidden of [
    'context', 'conversation_id', 'session_id', 'session', 'tools', 'history', 'system',
  ]) {
    assert.equal(Object.hasOwn(body, forbidden), false, forbidden);
  }
});

test('an advisory expansion request is bound to the term shape the lane accepts', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return bodyResponse(envelopeFor(JSON.stringify({ terms: ['systems engineering'] })));
  };
  const model = createLoopbackOllamaAnswerModel({ fetchImpl, timeoutMs: 5000 });
  await model.proposeQueryExpansion({
    instruction: 'i', question_text: 'q', max_terms: 3, output_schema: {},
  });
  assert.equal(bodies.length, 1);
  const [body] = bodies;
  assert.equal(body.think, OLLAMA_THINK);
  assert.equal(body.truncate, OLLAMA_TRUNCATE_PROMPT);
  assert.equal(body.options.num_ctx, OLLAMA_NUM_CTX);
  assert.deepEqual(body.format.required, ['terms']);
  assert.equal(body.format.additionalProperties, false);
  // The caller's own advisory ceiling, which is at or below the lane ceiling, not the lane's.
  assert.equal(body.format.properties.terms.maxItems, 3);
  assert.ok(body.format.properties.terms.maxItems <= MAX_EXPANSION_TERMS);
  assert.equal(body.format.properties.terms.items.maxLength, MAX_EXPANSION_TERM_CHARS);

  // A request for more than the lane accepts is clamped to the lane ceiling, never above it.
  const over = expansionResponseJsonSchema({ max_terms: MAX_EXPANSION_TERMS + 1 });
  assert.equal(over.properties.terms.maxItems, MAX_EXPANSION_TERMS);
});

test('a generation stopped by the token budget is a truncation, not an answer', async () => {
  // The exact envelope observed in the field, except that its content is a perfectly good answer.
  // `done` is `true`, so only the stop reason separates a finished reply from a cut-off one.
  const truncated = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(envelopeFor(
      JSON.stringify(OK_SECTIONS),
      { done: true, done_reason: 'length', error: 'boom-secret-detail' },
    )),
    timeoutMs: 5000,
  });
  const { io, out, err } = captureIo(truncated);
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(out.length, 0, 'a budget-truncated generation is never rendered as an answer');
  assert.equal(commandReceipt(err).answer_rendered, false);
  assert.equal(err.join('').includes('boom-secret-detail'), false, 'no provider field is echoed');

  // The empty content the same failure actually produced holds on the same path.
  const empty = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(
      JSON.stringify({ done: true, done_reason: 'length', message: { content: '' } }),
    ),
    timeoutMs: 5000,
  });
  const emptied = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(empty).io);
  assert.equal(emptied.receipt.result, 'HOLD');
  assert.equal(emptied.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);

  // A reply the model chose to end still passes: the guard refuses a reason, not every reply.
  const stopped = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(
      envelopeFor(JSON.stringify(OK_SECTIONS), { done: true, done_reason: 'stop' }),
    ),
    timeoutMs: 5000,
  });
  const ok = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(stopped).io);
  assert.equal(ok.receipt.result, 'PASS');
});

test('a prompt the daemon would trim is refused there, not diagnosed from the reply', async () => {
  // A dropped prompt cannot be recognised in the reply: the daemon answers 200 and reports a
  // prompt_eval_count *below* the window it trimmed to, so any threshold on that field reads a
  // silent drop as an ordinary short prompt. The request asks to be refused instead, and that
  // refusal arrives as a non-success status like any other.
  const refused = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => ({ ok: false, status: 400 }),
    timeoutMs: 5000,
  });
  const { io, out, err } = captureIo(refused);
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(out.length, 0);
  const report = commandReceipt(err);
  assert.equal(report.answer_rendered, false);
  assert.equal(report.model_refusal_reason, MODEL_REFUSAL_REASONS.NON_SUCCESS_STATUS);

  // No count in the reply is read as a window verdict, in either direction: an accepted reply
  // that happens to report a large prompt evaluation is still an accepted reply.
  const large = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(
      envelopeFor(JSON.stringify(OK_SECTIONS), { prompt_eval_count: OLLAMA_NUM_CTX }),
    ),
    timeoutMs: 5000,
  });
  const accepted = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(large).io);
  assert.equal(accepted.receipt.result, 'PASS');
});

test('a refusal names its own class without echoing one byte the provider sent', async () => {
  // The lane collapses every adapter throw into one code, so without this the observed benchmark
  // failure - a budget-truncated generation - is indistinguishable from an unreachable daemon.
  // Each token below is chosen from the reply's shape; none is derived from its content.
  const cases = [
    [MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET,
      envelopeFor(JSON.stringify(OK_SECTIONS), { done: true, done_reason: 'length' })],
    [MODEL_REFUSAL_REASONS.UNFINISHED,
      envelopeFor(JSON.stringify(OK_SECTIONS), { done: false })],
    [MODEL_REFUSAL_REASONS.NO_CONTENT,
      JSON.stringify({ done: true, done_reason: 'stop', message: { content: '' } })],
    [MODEL_REFUSAL_REASONS.CONTENT_NOT_ONE_OBJECT,
      envelopeFor('보안값 secret-detail-never-echoed')],
    [MODEL_REFUSAL_REASONS.MODEL_MISMATCH,
      envelopeFor(JSON.stringify(OK_SECTIONS), { model: 'some-other-model:1b' })],
    [MODEL_REFUSAL_REASONS.NOT_ONE_OBJECT, JSON.stringify([1, 2, 3])],
  ];
  for (const [reason, envelope] of cases) {
    const model = createLoopbackOllamaAnswerModel({
      fetchImpl: async () => bodyResponse(envelope), timeoutMs: 5000,
    });
    const { io, err } = captureIo(model);
    const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
    assert.equal(run.receipt.result, 'HOLD', reason);
    const report = commandReceipt(err);
    assert.equal(report.model_refusal_reason, reason);
    assert.equal(lastModelRefusalReason(model), reason);
    // The token is the whole disclosure: the receipt still carries no provider text.
    assert.equal(err.join('').includes('secret-detail-never-echoed'), false);
    assert.equal(err.join('').includes('some-other-model:1b'), false);
  }

  // A hold that never reached the provider names no provider refusal, and a PASS names none.
  const clean = createLoopbackOllamaAnswerModel({
    fetchImpl: jsonResponder(OK_SECTIONS), timeoutMs: 5000,
  });
  const { io, err } = captureIo(clean);
  assert.equal((await runSeCoreSourceboundAnswerCli(fixture().argv, io)).receipt.result, 'PASS');
  assert.equal(commandReceipt(err).model_refusal_reason, null);
  assert.equal(lastModelRefusalReason(clean), null);
  const early = captureIo(createLoopbackOllamaAnswerModel({
    fetchImpl: jsonResponder(OK_SECTIONS), timeoutMs: 5000,
  }));
  await assert.rejects(runSeCoreSourceboundAnswerCli(['--not-a-flag', 'x'], early.io));
  assert.equal(commandReceipt(early.err).model_refusal_reason, null);
});

test('a refusal belongs to the run that took it, not to the adapter that outlived it', async () => {
  // An adapter is one object and a command is one invocation, and the second can be repeated
  // against the first. A reason carried across that boundary would report a provider refusal on
  // the receipt of a run that never reached a provider.
  const reused = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => ({ ok: false, status: 500 }), timeoutMs: 5000,
  });
  const first = captureIo(reused);
  const held = await runSeCoreSourceboundAnswerCli(fixture().argv, first.io);
  assert.equal(held.receipt.result, 'HOLD');
  assert.equal(
    commandReceipt(first.err).model_refusal_reason, MODEL_REFUSAL_REASONS.NON_SUCCESS_STATUS,
  );

  // The same adapter, one run later, refused at the output preflight: zero model calls.
  const { root, argv } = fixture();
  const occupied = join(root, 'occupied.json');
  writeFileSync(occupied, 'not this run\n', 'utf8');
  const second = captureIo(reused);
  await assert.rejects(
    () => runSeCoreSourceboundAnswerCli([...argv, '--out', occupied], second.io),
    (error) => error.code === CLI_CODES.OUTPUT_REFUSED,
  );
  const report = commandReceipt(second.err);
  assert.equal(report.model_call_occurred, false);
  assert.equal(report.model_invocation_count, 0);
  assert.equal(report.model_refusal_reason, null, 'no provider refusal happened on this run');
  assert.equal(readFileSync(occupied, 'utf8'), 'not this run\n');

  // The same rule stated at the seam: a scope reports the refusals of the calls made through the
  // adapter it handed out, and of no others. A call on the bare adapter belongs to no invocation.
  const shared = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => ({ ok: false, status: 500 }), timeoutMs: 5000,
  });
  const scope = openModelRefusalScope(shared);
  assert.notEqual(scope.answerModel, shared, 'an invocation is served by its own adapter');
  await assert.rejects(
    () => shared.composeAnswer({
      instruction: 'i', question_text: 'q', statements: [], output_schema: {},
    }),
    (error) => error.code === CLI_CODES.MODEL_CALL_REFUSED,
  );
  assert.equal(scope.readRefusalReason(), null, 'a call this scope never made is not its refusal');
  assert.equal(lastModelRefusalReason(shared), MODEL_REFUSAL_REASONS.NON_SUCCESS_STATUS);

  // An adapter this module did not create carries no refusal state, and says so. It is also
  // handed back unchanged: there is nothing to scope, and the seam it names stays the seam.
  const foreign = fakeAnswerModel();
  const passthrough = openModelRefusalScope(foreign);
  assert.equal(passthrough.answerModel, foreign);
  assert.equal(passthrough.readRefusalReason(), null);
});

/**
 * One provider response held open until the test resolves it.
 *
 * `seen` settles the moment the adapter enters the client, so a test can put two calls in flight
 * and know both are there before it decides which one finishes first. Nothing here depends on
 * timing: every ordering below is driven by resolving these gates in the order under test.
 */
function pendingResponse() {
  let deliver;
  let arrive;
  const response = new Promise((resolve) => { deliver = resolve; });
  const seen = new Promise((resolve) => { arrive = resolve; });
  return { response, seen, arrive, resolve: (value) => deliver(value) };
}

/** One adapter whose calls are answered by `gates` in the order they arrive. */
function gatedAnswerModel(gates) {
  let taken = 0;
  return createLoopbackOllamaAnswerModel({
    fetchImpl: async () => {
      const gate = gates[taken];
      taken += 1;
      assert.ok(gate !== undefined, 'no call is made that this test did not gate');
      gate.arrive();
      return gate.response;
    },
    timeoutMs: 5000,
  });
}

const REQUEST = Object.freeze({
  instruction: 'i', question_text: 'q', statements: [], output_schema: {}, max_terms: 4,
});
const NON_SUCCESS = Object.freeze({ ok: false, status: 500 });
const BUDGET_STOPPED = () => bodyResponse(
  envelopeFor(JSON.stringify(OK_SECTIONS), { done: true, done_reason: 'length' }),
);

test('two scopes on one adapter each answer for their own call and for nothing else', async () => {
  // An adapter is one object and an invocation is one command, and two of the second can be in
  // flight against the first at once. Attribution therefore cannot live in a slot the adapter
  // rewrites as calls arrive: each invocation holds its own cell, and each call writes only to the
  // cell it captured.
  const gates = [pendingResponse(), pendingResponse()];
  const shared = gatedAnswerModel(gates);
  const first = openModelRefusalScope(shared);
  const second = openModelRefusalScope(shared);
  assert.notEqual(first.answerModel, second.answerModel);

  const callA = first.answerModel.composeAnswer(REQUEST);
  const callB = second.answerModel.proposeQueryExpansion(REQUEST);
  await Promise.all([gates[0].seen, gates[1].seen]);
  assert.equal(first.readRefusalReason(), null, 'a call in flight has settled nothing');
  assert.equal(second.readRefusalReason(), null);

  // A finishes non-success while B is still open: only A has taken a refusal.
  gates[0].resolve(NON_SUCCESS);
  await assert.rejects(callA, (error) => error.code === CLI_CODES.MODEL_CALL_REFUSED);
  assert.equal(first.readRefusalReason(), MODEL_REFUSAL_REASONS.NON_SUCCESS_STATUS);
  assert.equal(second.readRefusalReason(), null, 'an open call carries no other run refusal');

  // B then fails its own way, and neither reason moves to the other invocation.
  gates[1].resolve(BUDGET_STOPPED());
  await assert.rejects(callB, (error) => error.code === CLI_CODES.MODEL_CALL_REFUSED);
  assert.equal(second.readRefusalReason(), MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET);
  assert.equal(first.readRefusalReason(), MODEL_REFUSAL_REASONS.NON_SUCCESS_STATUS,
    'the first invocation keeps the refusal it took');
  assert.equal(lastModelRefusalReason(shared), MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET,
    'the adapter still reports its own last refusal');
});

test('the same two scopes hold when the second call is the one that finishes first', async () => {
  // The reverse completion order, because an attribution that depends on which call finishes first
  // is not attribution. A run that succeeds while another refuses names no refusal at all.
  const gates = [pendingResponse(), pendingResponse()];
  const shared = gatedAnswerModel(gates);
  const first = openModelRefusalScope(shared);
  const second = openModelRefusalScope(shared);

  const callA = first.answerModel.composeAnswer(REQUEST);
  const callB = second.answerModel.composeAnswer(REQUEST);
  await Promise.all([gates[0].seen, gates[1].seen]);

  gates[1].resolve(BUDGET_STOPPED());
  await assert.rejects(callB, (error) => error.code === CLI_CODES.MODEL_CALL_REFUSED);
  assert.equal(second.readRefusalReason(), MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET);
  assert.equal(first.readRefusalReason(), null, 'an open call carries no other run refusal');

  gates[0].resolve(bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS))));
  assert.deepEqual(await callA, OK_SECTIONS);
  assert.equal(first.readRefusalReason(), null, 'a call that succeeded names no refusal');
  assert.equal(second.readRefusalReason(), MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET,
    'the second invocation keeps the refusal it took');
});

test('two overlapping commands on one adapter each report only their own refusal', async () => {
  // The same property where it is actually read: on two command execution receipts. Both runs are
  // held open at the provider, so their model calls genuinely overlap.
  const gates = [pendingResponse(), pendingResponse()];
  const shared = gatedAnswerModel(gates);
  const held = captureIo(shared);
  const passing = captureIo(shared);

  const heldRun = runSeCoreSourceboundAnswerCli(fixture().argv, held.io);
  await gates[0].seen;
  const passingRun = runSeCoreSourceboundAnswerCli(fixture().argv, passing.io);
  await gates[1].seen;

  // The first run refuses while the second is still at the provider.
  gates[0].resolve(NON_SUCCESS);
  assert.equal((await heldRun).receipt.result, 'HOLD');
  assert.equal(
    commandReceipt(held.err).model_refusal_reason, MODEL_REFUSAL_REASONS.NON_SUCCESS_STATUS,
  );

  // The second then answers, and reports no provider refusal: the one that happened was not its.
  gates[1].resolve(bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS))));
  assert.equal((await passingRun).receipt.result, 'PASS');
  assert.equal(passing.out.length, 1);
  assert.equal(commandReceipt(passing.err).model_refusal_reason, null,
    'a run that answered names no refusal another run took');
});

test('two overlapping commands keep their own refusals in either completion order', async () => {
  const gates = [pendingResponse(), pendingResponse()];
  const shared = gatedAnswerModel(gates);
  const first = captureIo(shared);
  const second = captureIo(shared);

  const firstRun = runSeCoreSourceboundAnswerCli(fixture().argv, first.io);
  await gates[0].seen;
  const secondRun = runSeCoreSourceboundAnswerCli(fixture().argv, second.io);
  await gates[1].seen;

  // Reverse order: the run that started second is the one that finishes first.
  gates[1].resolve(BUDGET_STOPPED());
  assert.equal((await secondRun).receipt.result, 'HOLD');
  assert.equal(
    commandReceipt(second.err).model_refusal_reason, MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET,
  );

  gates[0].resolve(NON_SUCCESS);
  assert.equal((await firstRun).receipt.result, 'HOLD');
  assert.equal(
    commandReceipt(first.err).model_refusal_reason, MODEL_REFUSAL_REASONS.NON_SUCCESS_STATUS,
  );
  assert.equal(
    commandReceipt(second.err).model_refusal_reason, MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET,
    'the receipt already written is not the one this run rewrites',
  );
});

test('only an exact length stop reason may be reported as a token-budget stop', async () => {
  // `generation_stopped_on_budget` is a claim about why a generation ended, so it is made for the
  // one reason that means it and for nothing else. Every other spelling — another reason, a near
  // miss, a wrong type, no reason at all — takes the neutral token, and none is echoed.
  const cases = [
    ['length', MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET],
    ['load', MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    ['unload', MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    ['Length', MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    ['length ', MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    ['', MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    ['boom-secret-reason', MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    [42, MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    [null, MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    [['length'], MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
    [{ reason: 'length' }, MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
  ];
  for (const [done_reason, reason] of cases) {
    const model = createLoopbackOllamaAnswerModel({
      fetchImpl: async () => bodyResponse(
        envelopeFor(JSON.stringify(OK_SECTIONS), { done: true, done_reason }),
      ),
      timeoutMs: 5000,
    });
    const { io, out, err } = captureIo(model);
    const label = JSON.stringify(done_reason);
    const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
    assert.equal(run.receipt.result, 'HOLD', label);
    assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED, label);
    assert.equal(out.length, 0, label);
    assert.equal(commandReceipt(err).model_refusal_reason, reason, label);
    assert.equal(err.join('').includes('boom-secret-reason'), false, 'no reason value is echoed');
  }
});

test('a non-streaming reply must state that it finished and that it stopped on its own', async () => {
  // `done` and `done_reason` are read from the reply, so a reply that omits one is not a finished
  // generation this adapter may complete: it is a reply whose completion is simply unstated.
  const reply = (envelope) => JSON.stringify({
    ...envelope, message: { content: JSON.stringify(OK_SECTIONS) },
  });
  const cases = [
    [{}, MODEL_REFUSAL_REASONS.UNFINISHED],
    [{ done_reason: 'stop' }, MODEL_REFUSAL_REASONS.UNFINISHED],
    [{ done: false, done_reason: 'stop' }, MODEL_REFUSAL_REASONS.UNFINISHED],
    [{ done: 'true', done_reason: 'stop' }, MODEL_REFUSAL_REASONS.UNFINISHED],
    [{ done: 1, done_reason: 'stop' }, MODEL_REFUSAL_REASONS.UNFINISHED],
    [{ done: null, done_reason: 'stop' }, MODEL_REFUSAL_REASONS.UNFINISHED],
    [{ done: true }, MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY],
  ];
  for (const [envelope, reason] of cases) {
    const model = createLoopbackOllamaAnswerModel({
      fetchImpl: async () => bodyResponse(reply(envelope)), timeoutMs: 5000,
    });
    const { io, out, err } = captureIo(model);
    const label = JSON.stringify(envelope);
    const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
    assert.equal(run.receipt.result, 'HOLD', label);
    assert.equal(out.length, 0, label);
    assert.equal(commandReceipt(err).model_refusal_reason, reason, label);
  }

  // Both stated, and stated as themselves: that reply is answered.
  const finished = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(reply({ done: true, done_reason: 'stop' })),
    timeoutMs: 5000,
  });
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(finished).io);
  assert.equal(run.receipt.result, 'PASS');
});

test('a consumed reply field is read as own data or refused, never through an accessor', () => {
  // A parsed JSON body cannot carry an accessor, an inherited slot, or a hidden field. This is
  // the boundary where a value is checked and then used, though, so a slot that could run code
  // between those two moments is refused rather than read: it is the one shape that can answer
  // the check and the use differently.
  const content = JSON.stringify(OK_SECTIONS);
  const finished = () => ({ done: true, done_reason: 'stop', message: { content } });
  assert.deepEqual(finishedReplyContent(finished(), EXACT_ANSWER_MODEL), { content });

  let accessorRuns = 0;
  const behind = (target, key) => {
    const held = target[key];
    Object.defineProperty(target, key, {
      get() { accessorRuns += 1; return held; }, enumerable: true, configurable: true,
    });
    return target;
  };
  const hidden = (target, key) => {
    const held = target[key];
    Object.defineProperty(target, key, { value: held, enumerable: false, configurable: true });
    return target;
  };
  const malformed = [
    // Inherited: the prototype is a slot somebody else can still write.
    Object.assign(Object.create({ done: true }), { done_reason: 'stop', message: { content } }),
    behind(finished(), 'done'),
    behind(finished(), 'done_reason'),
    behind(finished(), 'message'),
    behind(Object.assign(finished(), { model: EXACT_ANSWER_MODEL }), 'model'),
    hidden(finished(), 'done'),
    hidden(finished(), 'message'),
    // A message object whose content is the accessor.
    { done: true, done_reason: 'stop', message: behind({ content }, 'content') },
    // A proxy that refuses to describe itself is not readable either.
    new Proxy(finished(), {
      getOwnPropertyDescriptor() { throw new Error('proxy-secret-detail'); },
    }),
  ];
  malformed.forEach((body, index) => {
    // The label is the position, not the body: the last case throws from its own reflection trap.
    const verdict = finishedReplyContent(body, EXACT_ANSWER_MODEL);
    assert.equal(verdict.reason, MODEL_REFUSAL_REASONS.REPLY_FIELD_MALFORMED, `case ${index}`);
    assert.equal(Object.hasOwn(verdict, 'content'), false, `case ${index}`);
    assert.equal(verdict.message.includes('secret'), false, `case ${index}`);
  });
  assert.equal(accessorRuns, 0, 'no accessor on a reply is ever invoked');

  // The declared model keeps its stated asymmetry: absent is accepted, named must be this one.
  assert.deepEqual(
    finishedReplyContent({ ...finished(), model: EXACT_ANSWER_MODEL }, EXACT_ANSWER_MODEL),
    { content },
  );
  assert.equal(
    finishedReplyContent({ ...finished(), model: 'other:1b' }, EXACT_ANSWER_MODEL).reason,
    MODEL_REFUSAL_REASONS.MODEL_MISMATCH,
  );
  assert.equal(
    finishedReplyContent({ ...finished(), model: 7 }, EXACT_ANSWER_MODEL).reason,
    MODEL_REFUSAL_REASONS.MODEL_MISMATCH,
  );

  // And the remaining shapes keep the tokens they already had.
  assert.equal(finishedReplyContent([1, 2, 3], EXACT_ANSWER_MODEL).reason,
    MODEL_REFUSAL_REASONS.NOT_ONE_OBJECT);
  assert.equal(finishedReplyContent(null, EXACT_ANSWER_MODEL).reason,
    MODEL_REFUSAL_REASONS.NOT_ONE_OBJECT);
  for (const message of [undefined, 'a string', 42, { content: '' }, { content: 42 }]) {
    assert.equal(
      finishedReplyContent({ done: true, done_reason: 'stop', message }, EXACT_ANSWER_MODEL).reason,
      MODEL_REFUSAL_REASONS.NO_CONTENT, JSON.stringify(message ?? null),
    );
  }
});

test('a response slot this adapter cannot read is its own refusal, never the provider error', async () => {
  // `ok`, `headers`, `body`, `arrayBuffer`, and `text` are prototype getters and methods on a real
  // Response, so they cannot be required to be own data. What can be required is that a slot which
  // throws leaves this adapter with its own fixed refusal rather than a provider-authored error
  // travelling out of it with whatever text that error carries.
  const throwing = (key) => {
    const response = bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS)));
    Object.defineProperty(response, key, {
      get() { throw new Error(`surface-secret-detail-${key}`); },
      enumerable: true,
      configurable: true,
    });
    return response;
  };
  for (const key of ['ok', 'headers', 'body', 'arrayBuffer', 'text']) {
    const model = createLoopbackOllamaAnswerModel({
      fetchImpl: async () => throwing(key), timeoutMs: 5000,
    });
    const { io, out, err } = captureIo(model);
    const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
    assert.equal(run.receipt.result, 'HOLD', key);
    assert.equal(run.receipt.blocker_code, LANE_CODES.MODEL_CALL_FAILED, key);
    assert.equal(out.length, 0, key);
    const report = commandReceipt(err);
    assert.equal(report.model_refusal_reason, MODEL_REFUSAL_REASONS.RESPONSE_UNREADABLE, key);
    assert.equal(report.answer_rendered, false, key);
    assert.equal(err.join('').includes('surface-secret-detail'), false, key);
  }

  // A header accessor that throws is the same refusal at its own stage, and not a raw error.
  const headers = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS)), {
      headers: { get() { throw new Error('header-secret-detail'); } },
    }),
    timeoutMs: 5000,
  });
  const capture = captureIo(headers);
  const refused = await runSeCoreSourceboundAnswerCli(fixture().argv, capture.io);
  assert.equal(refused.receipt.result, 'HOLD');
  assert.equal(
    commandReceipt(capture.err).model_refusal_reason, MODEL_REFUSAL_REASONS.BODY_UNREADABLE,
  );
  assert.equal(capture.err.join('').includes('header-secret-detail'), false);

  // A body that exposes a stream commits the call to that stream: an unusable reader is refused
  // rather than quietly answered from a second reading path.
  let arrayBufferReads = 0;
  const brokenStream = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS)), {
      body: { getReader: () => 'not a reader' },
      arrayBuffer: async () => { arrayBufferReads += 1; return new ArrayBuffer(0); },
    }),
    timeoutMs: 5000,
  });
  const broken = captureIo(brokenStream);
  const unopened = await runSeCoreSourceboundAnswerCli(fixture().argv, broken.io);
  assert.equal(unopened.receipt.result, 'HOLD');
  assert.equal(arrayBufferReads, 0, 'a body that exposes a stream is never read a second way');
  assert.equal(
    commandReceipt(broken.err).model_refusal_reason, MODEL_REFUSAL_REASONS.BODY_UNREADABLE,
  );

  // Called directly, the adapter throws its own contract error with its own fixed message.
  const direct = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => throwing('ok'), timeoutMs: 5000,
  });
  await assert.rejects(
    () => direct.composeAnswer({
      instruction: 'i', question_text: 'q', statements: [], output_schema: {},
    }),
    (error) => error.code === CLI_CODES.MODEL_CALL_REFUSED
      && !error.message.includes('surface-secret-detail'),
  );
});

test('every consumed response slot is read exactly once', async () => {
  // One snapshot, then checks against the snapshot. A slot read twice is a slot that can pass the
  // bound and then hand a different body to the decode.
  const reads = {
    ok: 0, headers: 0, body: 0, arrayBuffer: 0, text: 0,
  };
  const counted = () => {
    const held = bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS)));
    const response = {};
    for (const key of Object.keys(reads)) {
      Object.defineProperty(response, key, {
        get() { reads[key] += 1; return held[key]; }, enumerable: true, configurable: true,
      });
    }
    return response;
  };
  const model = createLoopbackOllamaAnswerModel({
    fetchImpl: async () => counted(), timeoutMs: 5000,
  });
  const run = await runSeCoreSourceboundAnswerCli(fixture().argv, captureIo(model).io);
  assert.equal(run.receipt.result, 'PASS');
  for (const [key, count] of Object.entries(reads)) assert.equal(count, 1, key);
});

test('the provider shape closes fields and enums while the lane enforces cross-item id uniqueness', () => {
  const schema = answerResponseJsonSchema({
    statements: [{ statement_id: 'S1' }, { statement_id: 'S2' }],
  });
  const proposition = schema.properties.propositions.items;
  assert.deepEqual(
    proposition.properties.statement_id.enum, ['S1', 'S2'],
    'a statement this run never supplied has no spelling the grammar can produce',
  );
  assert.equal(proposition.additionalProperties, false);
  assert.deepEqual(proposition.required.slice().sort(), ['relation', 'statement_id']);
  assert.deepEqual(proposition.properties.relation.enum,
    ['direct', 'support', 'qualification', 'contrast']);
  assert.equal(schema.properties.propositions.maxItems, MAX_ANSWER_PROPOSITIONS);
  // JSON Schema uniqueItems compares whole objects: S1/direct plus S1/support is representable
  // here, then deterministically refused by the lane's statement-id allowlist validator.
  assert.equal(schema.properties.propositions.uniqueItems, true);

  for (const request of [{ statements: [] }, {}, { statements: [{ statement_id: 1 }] }]) {
    const bare = answerResponseJsonSchema(request);
    assert.deepEqual(
      bare.properties.propositions.items.properties.statement_id.enum,
      ['__NO_RETRIEVED_STATEMENT__'],
    );
  }
});

test('the requested proposition bound is exactly eight', () => {
  const schema = answerResponseJsonSchema({
    statements: Array.from({ length: MAX_ANSWER_PROPOSITIONS }, (_, index) => ({
      statement_id: `S${index + 1}`,
    })),
  });
  assert.equal(MAX_ANSWER_PROPOSITIONS, 8);
  assert.equal(schema.properties.propositions.maxItems, 8);
  assert.equal(schema.oneOf[0].properties.propositions.maxItems, 8);
});

test('a pinned request shape adds no retry, no fallback, and no second answer call', async () => {
  // A failed benchmark cell stays one failed historical record. Each failure class guarded here
  // must cost exactly one call, write nothing, and be counted for exactly what it spent.
  for (const envelope of [
    { done: true, done_reason: 'length' },
    { done: true, done_reason: 'load' },
  ]) {
    let calls = 0;
    const model = createLoopbackOllamaAnswerModel({
      fetchImpl: async () => {
        calls += 1;
        return bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS), envelope));
      },
      timeoutMs: 5000,
    });
    const { io, out, err } = captureIo(model);
    const run = await runSeCoreSourceboundAnswerCli(fixture().argv, io);
    assert.equal(run.receipt.result, 'HOLD');
    assert.equal(calls, 1, 'a refusal is never retried against the same or another model');
    const report = commandReceipt(err);
    assert.equal(report.model_invocation_count, 1, 'the count is what was truly spent');
    assert.equal(report.model_call_occurred, true);
    assert.equal(report.persistence.completed, 0, 'a refused call leaves no artifact');
    assert.equal(out.length, 0);
  }
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

// ------------------------------------------------------------------ output-safety reason seam
//
// A lane HOLD receipt never reaches stdout and is never persisted — `--receipt-out` is rolled back
// on a hold — so the command execution receipt is the only surface on which an operator can read
// *which* output-safety check refused a run. These tests pin that it carries the lane's closed
// family token, that it carries nothing else, and that the token belongs to one invocation.

const payloadFieldModel = (text) => fakeAnswerModel({
  compose: () => ({ ...OK_SELECTION, completion: text }),
});

test('a model payload-field hold reaches the command receipt without echoing prose', async () => {
  const probe = 'provider prose that must never escape';
  const { root, argv } = fixture();
  const receiptPath = join(root, 'receipt.json');
  const { io, out, err } = captureIo(payloadFieldModel(probe));
  const run = await runSeCoreSourceboundAnswerCli([...argv, '--receipt-out', receiptPath], io);

  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.OUTPUT_SAFETY_FAILED);
  assert.equal(out.length, 0);
  assert.equal(err.length, 1);
  assert.equal(existsSync(receiptPath), false);

  const command = commandReceipt(err);
  assert.equal(command.output_safety_reason, 'model_payload_field_forbidden');
  assert.equal(command.model_refusal_reason, null);
  assert.equal(command.blocker_code, LANE_CODES.OUTPUT_SAFETY_FAILED);
  assert.equal(command.blocker_stage, 'output_safety');
  assert.deepEqual(Object.keys(command).sort(), [...COMMAND_RECEIPT_FIELDS]);
  assert.equal(err[0].includes(probe), false);
});

test('a selected unsafe source excerpt reaches the rendered-answer scan token', async () => {
  const { argv, descriptors } = fixture();
  const body = Buffer.from('## Page 1\n\nVerification location https://example.org/source\n', 'utf8');
  const descriptor = descriptors[0];
  const digest = sha256(body);
  descriptor.derived_text_bytes = body;
  descriptor.derived_text_sha256 = digest;
  const input = laneInput({ commitment: seCoreSourceSetContractSha256 });
  input.corpus.sources[0] = descriptor;
  input.corpus.sourceSetContract = sourceSetContract(input.corpus.sources);
  input.corpus.expectedSourceSetSha256 =
    seCoreSourceSetContractSha256(input.corpus.sourceSetContract);
  const run = await runSeCoreSourceboundAnswerLane(input, {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(run.receipt.blocker_code, LANE_CODES.OUTPUT_SAFETY_FAILED);
  assert.equal(run.receipt.output_safety_reason, 'rendered_answer_scan_failed');
  assert.equal(argv.length > 0, true);
});
test('a pass and a non-output-safety hold both report a null output-safety reason', async () => {
  const { root, argv } = fixture();
  const passing = captureIo(fakeAnswerModel());
  const run = await runSeCoreSourceboundAnswerCli([...argv, '--out', join(root, 'a.json')],
    passing.io);
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(commandReceipt(passing.err).output_safety_reason, null);

  // A lane hold from another stage.
  const drifted = captureIo(fakeAnswerModel());
  const mismatched = await runSeCoreSourceboundAnswerCli(
    withFlag(argv, '--source-set-sha256', sha256('a source set this run is not')), drifted.io,
  );
  assert.equal(mismatched.receipt.result, 'HOLD');
  assert.equal(commandReceipt(drifted.err).output_safety_reason, null);

  // A hold this command took before the lane ran at all.
  const early = captureIo(fakeAnswerModel());
  await assert.rejects(runSeCoreSourceboundAnswerCli(['--not-a-flag', 'x'], early.io));
  assert.equal(commandReceipt(early.err).output_safety_reason, null);
  assert.equal(commandReceipt(early.err).lane_ran, false);
});

test('a caller cannot put an output-safety reason on the io surface', async () => {
  const { argv } = fixture();
  const err = [];
  const io = {
    answerModel: fakeAnswerModel(),
    stderrWrite: (value) => err.push(value),
    output_safety_reason: 'markup_detected',
  };
  await assert.rejects(
    runSeCoreSourceboundAnswerCli(argv, io),
    (error) => error.code === CLI_CODES.IO_SURFACE_INVALID,
  );
  // The surface was refused before it was read, so this run reports through the process sinks and
  // never adopts the caller's value.
  assert.equal(err.length, 0);
});

test('one adapter reused by two sequential commands never inherits the earlier reason', async () => {
  let call = 0;
  const shared = fakeAnswerModel({
    compose: () => {
      call += 1;
      return call === 1
        ? { ...OK_SELECTION, completion: 'provider prose' }
        : OK_SELECTION;
    },
  });
  const held = captureIo(shared);
  const first = await runSeCoreSourceboundAnswerCli(fixture().argv, held.io);
  assert.equal(first.receipt.blocker_code, LANE_CODES.OUTPUT_SAFETY_FAILED);
  assert.equal(commandReceipt(held.err).output_safety_reason, 'model_payload_field_forbidden');

  const passing = captureIo(shared);
  const second = await runSeCoreSourceboundAnswerCli(fixture().argv, passing.io);
  assert.equal(second.receipt.result, 'PASS');
  assert.equal(commandReceipt(passing.err).output_safety_reason, null);
  assert.equal(
    commandReceipt(held.err).output_safety_reason, 'model_payload_field_forbidden',
    'the receipt already written is not the one a later run rewrites',
  );
});

test('two overlapping commands on one adapter each report only their own output safety', async () => {
  // Both runs are held open at the provider, so their model calls genuinely overlap, and the
  // second one to start is the first one to finish.
  const gates = [pendingResponse(), pendingResponse()];
  const shared = gatedAnswerModel(gates);
  const held = captureIo(shared);
  const passing = captureIo(shared);

  const heldRun = runSeCoreSourceboundAnswerCli(fixture().argv, held.io);
  await gates[0].seen;
  const passingRun = runSeCoreSourceboundAnswerCli(fixture().argv, passing.io);
  await gates[1].seen;

  gates[1].resolve(bodyResponse(envelopeFor(JSON.stringify(OK_SECTIONS))));
  assert.equal((await passingRun).receipt.result, 'PASS');
  assert.equal(commandReceipt(passing.err).output_safety_reason, null);

  gates[0].resolve(bodyResponse(envelopeFor(JSON.stringify({
    ...OK_SELECTION, completion: 'provider prose',
  }))));
  const refused = await heldRun;
  assert.equal(refused.receipt.blocker_code, LANE_CODES.OUTPUT_SAFETY_FAILED);
  assert.equal(commandReceipt(held.err).output_safety_reason, 'model_payload_field_forbidden');
  assert.equal(
    commandReceipt(passing.err).output_safety_reason, null,
    'a run that answered names no output-safety refusal another run took',
  );
});
