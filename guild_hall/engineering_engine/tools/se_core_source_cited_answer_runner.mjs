#!/usr/bin/env node
// Thin filesystem adapter for the deterministic seven-case source-cited answer run.
//
// Canonical answers always go to stdout. `--out` and `--receipt-out` are independent,
// create-only output paths; neither is used unless explicitly supplied. Every supplied output
// is claimed create-only before the ledger is touched, so an already occupied output refuses
// the run with no capture event appended. An output that names a path this capture attempt
// itself owns is refused before either the claim or the capture, because a create-only claim
// on a not-yet-existing ledger, lock, or raw turn file would create it, let capture append to
// it, and then overwrite it on completion.
//
// The three `--capture-*` flags are an all-or-nothing opt-in. Supplying none of them leaves
// stdout, output files, and behaviour byte-for-byte as before. Supplying all three records the
// seven exact question texts and the seven rendered answer texts as individual turns through
// the existing metadata-only QA interaction ledger, and prints one redacted receipt on stderr.
// The Engine itself still makes no model, network, ERP, or Notebook call.

import { createHash } from 'node:crypto';
import {
  closeSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  captureQaInteraction,
  seCoreEvalQaCaptureTargets,
} from '../evaluation/se_core_eval_qa_capture.mjs';
import { ensureSeCoreEvalQaReportFile } from '../evaluation/se_core_eval_qa_report_writer.mjs';
import { ContractError } from '../kernel/errors.mjs';
import { ACCEPTED_QUESTION_SET_SHA256 } from '../subjects/se_core_crosswalk_case_run.mjs';
import {
  canonicalSeCoreSourceCitedAnswerBatchJson,
  canonicalSeCoreSourceCitedAnswerReceiptJson,
  runSeCoreSourceCitedAnswerBatch,
} from '../subjects/se_core_source_cited_answer_run.mjs';

const CLI_CODES = Object.freeze({
  ARGUMENT_INVALID: 'SE_CORE_SOURCE_CITED_ANSWER_CLI_ARGUMENT_INVALID',
  INPUT_READ_FAILED: 'SE_CORE_SOURCE_CITED_ANSWER_CLI_INPUT_READ_FAILED',
  OUTPUT_REFUSED: 'SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_REFUSED',
  OUTPUT_CAPTURE_COLLISION: 'SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_CAPTURE_COLLISION',
  CAPTURE_REFUSED: 'SE_CORE_SOURCE_CITED_ANSWER_CLI_CAPTURE_REFUSED',
});
const REQUIRED = Object.freeze([
  '--corpus', '--corpus-sha256', '--crosswalk', '--crosswalk-sha256',
  '--review-receipt', '--review-receipt-sha256', '--question-set', '--question-set-sha256',
]);
const OPTIONAL = Object.freeze(['--out', '--receipt-out']);
const CAPTURE = Object.freeze(['--capture-root', '--capture-attempt-id', '--capture-event-time']);
const ALLOWED = new Set([...REQUIRED, ...OPTIONAL, ...CAPTURE]);
const WINDOWS_RESERVED = /^(?:nul|con|prn|aux|com[1-9]|lpt[1-9])(?:\.|$)/iu;

const CAPTURE_RECEIPT_SCHEMA = 'soulforge.engineering_engine.se_core_source_cited_answer_capture_receipt.v1';
const CAPTURE_CLAIM_CEILING = 'metadata_only_observation_ledger';
const CAPTURE_PROVIDER = 'engine';
const CAPTURE_SCOPE = 'fixed_benchmark';
const CAPTURE_INPUT_FIELDS = Object.freeze([
  'capture', 'questionSetBytes', 'questionSetSha256', 'run',
]);
const CAPTURE_FIELDS = Object.freeze(['attempt_id', 'event_time', 'root_path']);
const EXPECTED_ANSWER_COUNT = 7;
const MAX_MISSING_PATH_DEPTH = 64;
const ABSENT_PATH_CODES = Object.freeze(['ENOENT', 'ENOTDIR']);

function parseArgs(argv) {
  if (argv.length % 2 !== 0) {
    throw new ContractError(CLI_CODES.ARGUMENT_INVALID,
      'arguments must be explicit flag/value pairs');
  }
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!ALLOWED.has(flag) || Object.hasOwn(parsed, flag)
        || typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      throw new ContractError(CLI_CODES.ARGUMENT_INVALID,
        'an unknown, duplicate, empty, or valueless argument was supplied');
    }
    parsed[flag] = value;
  }
  if (REQUIRED.some((flag) => !Object.hasOwn(parsed, flag))) {
    throw new ContractError(CLI_CODES.ARGUMENT_INVALID,
      'all source, review, and question paths with exact SHA-256 pins are required');
  }
  const supplied = CAPTURE.filter((flag) => Object.hasOwn(parsed, flag)).length;
  if (supplied !== 0 && supplied !== CAPTURE.length) {
    throw new ContractError(CLI_CODES.ARGUMENT_INVALID,
      'ledger capture is all-or-nothing: supply every capture flag or none of them');
  }
  if (parsed['--out'] && parsed['--receipt-out']
      && resolve(parsed['--out']) === resolve(parsed['--receipt-out'])) {
    throw new ContractError(CLI_CODES.ARGUMENT_INVALID,
      'answer and receipt outputs must be distinct paths');
  }
  return parsed;
}

function readBytes(path) {
  try {
    return readFileSync(path);
  } catch {
    throw new ContractError(CLI_CODES.INPUT_READ_FAILED,
      'an explicitly named input could not be read; its local path is not echoed');
  }
}

function reserveExplicitOutput(path, bytes) {
  if (WINDOWS_RESERVED.test(basename(path))) {
    throw new ContractError(CLI_CODES.OUTPUT_REFUSED, 'reserved device names are not output files');
  }
  try {
    return { path, bytes, fd: openSync(path, 'wx') };
  } catch {
    throw new ContractError(CLI_CODES.OUTPUT_REFUSED,
      'the explicit output could not be created without overwriting an existing path');
  }
}

function completeReservedOutput(reservation) {
  const { fd } = reservation;
  reservation.fd = null;
  try {
    writeFileSync(fd, reservation.bytes, { encoding: 'utf8' });
  } catch {
    throw new ContractError(CLI_CODES.OUTPUT_REFUSED,
      'a claimed explicit output could not be completed');
  } finally {
    closeSync(fd);
  }
}

/** Reclaim only what this run created, so a refused run leaves no empty or partial output. */
function discardReservedOutputs(reservations) {
  for (const reservation of reservations) {
    try {
      if (reservation.fd !== null) closeSync(reservation.fd);
      rmSync(reservation.path, { force: true });
    } catch { /* the run is already failing; nothing further can be reclaimed here */ }
    reservation.fd = null;
  }
}

function collisionRefused(issue) {
  return new ContractError(CLI_CODES.OUTPUT_CAPTURE_COLLISION,
    'an explicit output names a path this exact capture attempt owns; no local path is echoed',
    { issues: [issue] });
}

/**
 * The real path of `path`, or of its nearest existing ancestor with the missing tail rejoined.
 *
 * A capture target usually does not exist yet, so an alias cannot be compared by resolving the
 * target itself. Resolving the deepest ancestor that does exist collapses a junction, symlink,
 * short name, or case variant in the part of the path that is real, and keeps the rest exact.
 * Anything that fails for a reason other than absence is ambiguous and refuses.
 */
function physicalPath(lexical) {
  const missing = [];
  let current = lexical;
  for (;;) {
    try {
      const real = (realpathSync.native ?? realpathSync)(current);
      return missing.length === 0 ? real : join(real, ...missing.reverse());
    } catch (error) {
      if (!ABSENT_PATH_CODES.includes(error?.code)) throw collisionRefused('PATH_IDENTITY_UNRESOLVED');
    }
    const parent = dirname(current);
    if (parent === current) return null;
    if (missing.length >= MAX_MISSING_PATH_DEPTH) throw collisionRefused('PATH_IDENTITY_UNRESOLVED');
    missing.push(basename(current));
    current = parent;
  }
}

/** The device/inode pair of an existing path, which is how a hard link betrays its twin. */
function fileNodeIdentity(lexical) {
  try {
    const stats = statSync(lexical, { bigint: true });
    return stats.ino === 0n ? null : `node:${stats.dev}:${stats.ino}`;
  } catch (error) {
    if (ABSENT_PATH_CODES.includes(error?.code)) return null;
    throw collisionRefused('PATH_IDENTITY_UNRESOLVED');
  }
}

/** Every identity one path can be reached by: lexical, physical, and node where it exists. */
function pathIdentities(path) {
  const lexical = resolve(path);
  const identities = new Set([`path:${lexical.toLowerCase()}`]);
  const physical = physicalPath(lexical);
  if (physical !== null) identities.add(`path:${physical.toLowerCase()}`);
  const node = fileNodeIdentity(lexical);
  if (node !== null) identities.add(node);
  return identities;
}

/**
 * Refuse an explicit output that is the same target as a file this capture attempt owns.
 *
 * Claiming an output creates it, so an output aimed at a capture path that does not exist yet
 * would be created by the claim, appended to by capture, and then overwritten on completion:
 * a real CLI success carrying a PASS receipt for a ledger the same run had already destroyed.
 * The owned set is projected by the capture contract rather than restated here, and an owned
 * set that cannot be projected refuses instead of allowing an unchecked claim.
 */
export function guardExplicitOutputsOutsideCapture(outputPaths, capture) {
  const projected = seCoreEvalQaCaptureTargets(capture);
  if (projected.result !== 'PASS') {
    throw captureRefused(
      'the exact capture targets could not be projected before any output was claimed',
      projected.issues,
    );
  }
  const owned = projected.targets.map((target) => ({
    kind: target.kind,
    identities: pathIdentities(target.path),
  }));
  for (const path of outputPaths) {
    for (const identity of pathIdentities(path)) {
      const collided = owned.find((target) => target.identities.has(identity));
      if (collided) throw collisionRefused(collided.kind);
    }
  }
}

/**
 * Claim every explicit output create-only, then run the capture mutation, then complete them.
 *
 * The claim is the create-only creation itself rather than an earlier existence test, so an
 * output path that is already occupied refuses the run before `mutate` runs: the refused run
 * appends no capture event, writes no capture artifact, and leaves existing bytes untouched.
 *
 * `capture` binds the two: when this run will mutate a capture root, the outputs are checked
 * against that exact attempt's own targets here, at the claim, rather than at a call site that
 * can drift away from it.
 */
export function withExplicitOutputsClaimed(outputs, mutate, capture = null) {
  if (capture !== null && outputs.length > 0) {
    guardExplicitOutputsOutsideCapture(outputs.map(([path]) => path), capture);
  }
  const pending = [];
  try {
    for (const [path, bytes] of outputs) pending.push(reserveExplicitOutput(path, bytes));
    const captured = mutate();
    while (pending.length > 0) {
      completeReservedOutput(pending[0]);
      pending.shift();
    }
    return captured;
  } catch (error) {
    discardReservedOutputs(pending);
    throw error;
  }
}

const exactFields = (value, expected) => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value).length === expected.length
  && expected.every((field) => Object.hasOwn(value, field));

function captureRefused(message, issues = []) {
  return new ContractError(CLI_CODES.CAPTURE_REFUSED, message, { issues });
}

/**
 * The seven exact question texts, taken from bytes already pinned to the accepted question set.
 *
 * The pin is re-checked here rather than trusted from the caller, so this cannot be pointed at
 * a different or edited question file to record turns the Engine never answered.
 */
function questionTextsFor(questionSetBytes, questionSetSha256) {
  const digest = createHash('sha256').update(questionSetBytes).digest('hex');
  if (questionSetSha256 !== ACCEPTED_QUESTION_SET_SHA256 || digest !== ACCEPTED_QUESTION_SET_SHA256) {
    throw captureRefused('capture accepts only the exact pinned question-set bytes');
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(questionSetBytes));
  } catch {
    throw captureRefused('the pinned question set is not one decodable UTF-8 JSON document');
  }
  if (!Array.isArray(parsed?.questions)) {
    throw captureRefused('the pinned question set must hold one closed question array');
  }
  const texts = new Map();
  for (const row of parsed.questions) texts.set(row?.question_id, row?.question);
  if (texts.size !== EXPECTED_ANSWER_COUNT) {
    throw captureRefused('the pinned question set must resolve seven unique question texts');
  }
  return texts;
}

function requirePass(report, message) {
  if (report?.result !== 'PASS') {
    throw captureRefused(message, Array.isArray(report?.issues) ? report.issues : []);
  }
  return report;
}

/**
 * Record the seven question texts and the seven rendered answer texts as individual turns.
 *
 * Each turn carries one exact text. Whole JSON containers are never recorded as a single turn.
 * The first attempt appends fourteen events; a later distinct attempt reuses the byte-identical
 * questions idempotently and appends only its seven answers.
 */
export function captureSeCoreSourceCitedAnswerBatch(input) {
  if (!exactFields(input, CAPTURE_INPUT_FIELDS)) {
    throw captureRefused('the capture seam uses one closed input field set');
  }
  if (!exactFields(input.capture, CAPTURE_FIELDS)) {
    throw captureRefused('capture requires exactly a root path, attempt id, and event time');
  }
  const answers = Array.isArray(input.run?.answers) ? input.run.answers : [];
  if (answers.length !== EXPECTED_ANSWER_COUNT) {
    throw captureRefused('capture requires one completed seven-answer batch');
  }
  const texts = questionTextsFor(input.questionSetBytes, input.questionSetSha256);
  const turns = answers.map((answer) => {
    const questionText = texts.get(answer?.question_id);
    if (typeof questionText !== 'string' || questionText.length === 0
        || typeof answer?.answer_text !== 'string' || answer.answer_text.length === 0) {
      throw captureRefused('every recorded turn needs one exact question and answer text');
    }
    return {
      interaction_id: answer.question_id,
      question_bytes: Buffer.from(questionText, 'utf8'),
      answer_bytes: Buffer.from(answer.answer_text, 'utf8'),
    };
  });
  if (new Set(turns.map((turn) => turn.interaction_id)).size !== EXPECTED_ANSWER_COUNT) {
    throw captureRefused('the recorded batch must cover seven distinct interactions exactly');
  }

  const root = input.capture.root_path;
  const eventTime = input.capture.event_time;
  requirePass(captureQaInteraction({ root_path: root, command: 'initialize' }),
    'the QA interaction ledger could not be initialized');
  for (const turn of turns) {
    requirePass(captureQaInteraction({
      root_path: root,
      command: 'record-question',
      interaction_id: turn.interaction_id,
      scope: CAPTURE_SCOPE,
      event_time: eventTime,
      question_bytes: turn.question_bytes,
    }), 'one exact question turn was not recorded');
  }
  let last;
  for (const turn of turns) {
    last = requirePass(captureQaInteraction({
      root_path: root,
      command: 'record-answer',
      interaction_id: turn.interaction_id,
      provider: CAPTURE_PROVIDER,
      attempt_id: input.capture.attempt_id,
      event_time: eventTime,
      answer_bytes: turn.answer_bytes,
    }), 'one exact answer turn was not recorded');
  }
  // The batch is only reported as captured once its turns are also readable. The ledger is
  // append-only truth, so a refused refresh unwinds nothing: it fails this run with the writer's
  // own closed issue code, and a retry reuses the same bytes idempotently and repairs the report.
  const written = ensureSeCoreEvalQaReportFile({ root_path: root });
  if (written.result !== 'PASS') {
    throw captureRefused(
      'the derived human report could not be created or refreshed for this batch',
      written.issues,
    );
  }
  return {
    schema_version: CAPTURE_RECEIPT_SCHEMA,
    result: 'PASS',
    claim_ceiling: CAPTURE_CLAIM_CEILING,
    provider: CAPTURE_PROVIDER,
    scope: CAPTURE_SCOPE,
    questions_submitted: turns.length,
    answers_submitted: turns.length,
    event_count: last.event_count,
    counts: last.counts,
    ledger_sha256: last.ledger_sha256,
    head_event_hash: last.head_event_hash,
    report_basename: written.basename,
    report_operation: written.operation,
    report_sha256: written.sha256,
  };
}

export function runSeCoreSourceCitedAnswerCli(argv, io = {}) {
  const parsed = parseArgs(argv);
  const questionSetBytes = readBytes(parsed['--question-set']);
  const run = runSeCoreSourceCitedAnswerBatch({
    corpusBytes: readBytes(parsed['--corpus']),
    crosswalkBytes: readBytes(parsed['--crosswalk']),
    reviewReceiptBytes: readBytes(parsed['--review-receipt']),
    questionSetBytes,
    expectedCorpusSha256: parsed['--corpus-sha256'],
    expectedCrosswalkSha256: parsed['--crosswalk-sha256'],
    expectedReviewReceiptSha256: parsed['--review-receipt-sha256'],
    expectedQuestionSetSha256: parsed['--question-set-sha256'],
  });
  const answerOutput = canonicalSeCoreSourceCitedAnswerBatchJson(run);
  const receiptOutput = canonicalSeCoreSourceCitedAnswerReceiptJson(run);
  const outputs = [];
  if (Object.hasOwn(parsed, '--out')) outputs.push([parsed['--out'], answerOutput]);
  if (Object.hasOwn(parsed, '--receipt-out')) {
    outputs.push([parsed['--receipt-out'], receiptOutput]);
  }
  const captureRequest = Object.hasOwn(parsed, '--capture-root')
    ? {
      root_path: parsed['--capture-root'],
      interaction_ids: (Array.isArray(run.answers) ? run.answers : [])
        .map((answer) => answer?.question_id),
      provider: CAPTURE_PROVIDER,
      attempt_id: parsed['--capture-attempt-id'],
    }
    : null;
  const captureReceipt = withExplicitOutputsClaimed(outputs, () => (
    captureRequest === null
      ? null
      : captureSeCoreSourceCitedAnswerBatch({
        run,
        questionSetBytes,
        questionSetSha256: parsed['--question-set-sha256'],
        capture: {
          root_path: parsed['--capture-root'],
          attempt_id: parsed['--capture-attempt-id'],
          event_time: parsed['--capture-event-time'],
        },
      })
  ), captureRequest);
  (io.stdoutWrite ?? ((value) => process.stdout.write(value)))(answerOutput);
  if (captureReceipt !== null) {
    (io.stderrWrite ?? ((value) => process.stderr.write(value)))(
      `${JSON.stringify(captureReceipt)}\n`,
    );
  }
  return run;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    runSeCoreSourceCitedAnswerCli(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof ContractError
      ? error.code
      : 'SE_CORE_SOURCE_CITED_ANSWER_RUN_FAILED';
    const issues = error instanceof ContractError && Array.isArray(error.detail?.issues)
      ? error.detail.issues
      : [];
    process.stderr.write(`${JSON.stringify(
      issues.length === 0 ? { ok: false, code } : { ok: false, code, issues },
    )}\n`);
    process.exitCode = 2;
  }
}
