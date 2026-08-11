#!/usr/bin/env node
// Thin filesystem adapter for the fixed synthetic SE-core Engine reference run.
//
// Every input path and byte pin is explicit. The evaluator gold artifact is neither accepted
// nor read. Canonical scorer-compatible JSON goes to stdout; `--out` is the only write path
// and uses create-only semantics.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContractError } from '../kernel/errors.mjs';
import {
  canonicalSeCoreCrosswalkEngineResultsJson,
  runSeCoreCrosswalkCases,
} from '../subjects/se_core_crosswalk_case_run.mjs';
import { compileSeCoreCrosswalkProjection } from '../subjects/se_core_crosswalk_projection.mjs';

const CLI_CODES = Object.freeze({
  ARGUMENT_INVALID: 'SE_CORE_CROSSWALK_CASE_CLI_ARGUMENT_INVALID',
  INPUT_READ_FAILED: 'SE_CORE_CROSSWALK_CASE_CLI_INPUT_READ_FAILED',
  OUTPUT_REFUSED: 'SE_CORE_CROSSWALK_CASE_CLI_OUTPUT_REFUSED',
});
const REQUIRED = Object.freeze([
  '--corpus', '--corpus-sha256', '--crosswalk', '--crosswalk-sha256',
  '--review-receipt', '--review-receipt-sha256', '--question-set', '--question-set-sha256',
]);
const OPTIONAL = Object.freeze(['--out']);
const ALLOWED = new Set([...REQUIRED, ...OPTIONAL]);
const WINDOWS_RESERVED = /^(?:nul|con|prn|aux|com[1-9]|lpt[1-9])(?:\.|$)/iu;

function parseArgs(argv) {
  if (argv.length % 2 !== 0) {
    throw new ContractError(CLI_CODES.ARGUMENT_INVALID, 'arguments must be explicit flag/value pairs');
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
      'all source, crosswalk, review, and question paths with exact SHA-256 pins are required');
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

export function runSeCoreCrosswalkCaseCli(argv, io = {}) {
  const parsed = parseArgs(argv);
  const projection = compileSeCoreCrosswalkProjection({
    corpusBytes: readBytes(parsed['--corpus']),
    crosswalkBytes: readBytes(parsed['--crosswalk']),
    reviewReceiptBytes: readBytes(parsed['--review-receipt']),
    expectedCorpusSha256: parsed['--corpus-sha256'],
    expectedCrosswalkSha256: parsed['--crosswalk-sha256'],
    expectedReviewReceiptSha256: parsed['--review-receipt-sha256'],
  });
  const run = runSeCoreCrosswalkCases({
    projection,
    questionSetBytes: readBytes(parsed['--question-set']),
    expectedQuestionSetSha256: parsed['--question-set-sha256'],
  });
  const output = canonicalSeCoreCrosswalkEngineResultsJson(run);
  if (Object.hasOwn(parsed, '--out')) writeExplicitOutput(parsed['--out'], output);
  (io.stdoutWrite ?? ((value) => process.stdout.write(value)))(output);
  return run;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    runSeCoreCrosswalkCaseCli(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof ContractError ? error.code : 'SE_CORE_CROSSWALK_CASE_RUN_FAILED';
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 2;
  }
}
