#!/usr/bin/env node
// Thin filesystem adapter for the deterministic seven-case source-cited answer run.
//
// Canonical answers always go to stdout. `--out` and `--receipt-out` are independent,
// create-only output paths; neither is used unless explicitly supplied.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContractError } from '../kernel/errors.mjs';
import {
  canonicalSeCoreSourceCitedAnswerBatchJson,
  canonicalSeCoreSourceCitedAnswerReceiptJson,
  runSeCoreSourceCitedAnswerBatch,
} from '../subjects/se_core_source_cited_answer_run.mjs';

const CLI_CODES = Object.freeze({
  ARGUMENT_INVALID: 'SE_CORE_SOURCE_CITED_ANSWER_CLI_ARGUMENT_INVALID',
  INPUT_READ_FAILED: 'SE_CORE_SOURCE_CITED_ANSWER_CLI_INPUT_READ_FAILED',
  OUTPUT_REFUSED: 'SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_REFUSED',
});
const REQUIRED = Object.freeze([
  '--corpus', '--corpus-sha256', '--crosswalk', '--crosswalk-sha256',
  '--review-receipt', '--review-receipt-sha256', '--question-set', '--question-set-sha256',
]);
const OPTIONAL = Object.freeze(['--out', '--receipt-out']);
const ALLOWED = new Set([...REQUIRED, ...OPTIONAL]);
const WINDOWS_RESERVED = /^(?:nul|con|prn|aux|com[1-9]|lpt[1-9])(?:\.|$)/iu;

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

function writeExplicitOutput(path, bytes) {
  if (WINDOWS_RESERVED.test(basename(path))) {
    throw new ContractError(CLI_CODES.OUTPUT_REFUSED, 'reserved device names are not output files');
  }
  try {
    writeFileSync(path, bytes, { encoding: 'utf8', flag: 'wx' });
  } catch {
    throw new ContractError(CLI_CODES.OUTPUT_REFUSED,
      'the explicit output could not be created without overwriting an existing path');
  }
}

export function runSeCoreSourceCitedAnswerCli(argv, io = {}) {
  const parsed = parseArgs(argv);
  const run = runSeCoreSourceCitedAnswerBatch({
    corpusBytes: readBytes(parsed['--corpus']),
    crosswalkBytes: readBytes(parsed['--crosswalk']),
    reviewReceiptBytes: readBytes(parsed['--review-receipt']),
    questionSetBytes: readBytes(parsed['--question-set']),
    expectedCorpusSha256: parsed['--corpus-sha256'],
    expectedCrosswalkSha256: parsed['--crosswalk-sha256'],
    expectedReviewReceiptSha256: parsed['--review-receipt-sha256'],
    expectedQuestionSetSha256: parsed['--question-set-sha256'],
  });
  const answerOutput = canonicalSeCoreSourceCitedAnswerBatchJson(run);
  const receiptOutput = canonicalSeCoreSourceCitedAnswerReceiptJson(run);
  if (Object.hasOwn(parsed, '--out')) writeExplicitOutput(parsed['--out'], answerOutput);
  if (Object.hasOwn(parsed, '--receipt-out')) {
    writeExplicitOutput(parsed['--receipt-out'], receiptOutput);
  }
  (io.stdoutWrite ?? ((value) => process.stdout.write(value)))(answerOutput);
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
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 2;
  }
}
