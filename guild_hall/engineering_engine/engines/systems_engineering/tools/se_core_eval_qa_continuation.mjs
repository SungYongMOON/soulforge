#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  backfillSeCoreEvalQaContinuation,
  querySeCoreEvalQaContinuation,
  validateSeCoreEvalQaContinuation,
} from '../evaluation/se_core_eval_qa_continuation.mjs';

const CLI_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_continuation_cli.v1';
const CLAIM_CEILING = 'metadata_only_observation_ledger';
const VALUE_OPTIONS = new Set([
  '--root',
  '--prior-ledger',
  '--prior-anchor',
  '--existing-continuation',
  '--out',
  '--ledger',
  '--event-type',
  '--run-id',
  '--question-id',
  '--attempt-index',
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(stableValue(value))}\n`, 'utf8');
}

function cliHold(code) {
  return {
    exit_code: 2,
    stdout: jsonBytes({
      schema_version: CLI_SCHEMA,
      result: 'HOLD',
      claim_ceiling: CLAIM_CEILING,
      provider_byte_parity: 'not_verified',
      notebook_output_is_gold: false,
      engine_output_is_gold: false,
      final_comparison_allowed: false,
      engine_is_truth: false,
      notebook_is_truth: false,
      winner_declared: false,
      issues: [code],
    }),
  };
}

function parse(argv) {
  if (!Array.isArray(argv) || argv.length < 3) throw new Error('CLI_COMMAND_REQUIRED');
  const command = argv[2];
  if (!['backfill', 'validate', 'query'].includes(command)) throw new Error('CLI_COMMAND_REFUSED');
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!VALUE_OPTIONS.has(name)
      || value === undefined
      || value.startsWith('--')
      || Object.hasOwn(options, name)) throw new Error('CLI_ARGUMENT_REFUSED');
    options[name] = value;
  }
  return { command, options };
}

function exactOptions(options, allowed, required) {
  if (!Object.keys(options).every((name) => allowed.includes(name))
    || !required.every((name) => Object.hasOwn(options, name))) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
}

function readBytes(reference) {
  try {
    return readFileSync(reference);
  } catch {
    throw new Error('CLI_INPUT_UNREADABLE');
  }
}

function readAnchor(reference) {
  try {
    return JSON.parse(readFileSync(reference, 'utf8'));
  } catch {
    throw new Error('CLI_INPUT_UNREADABLE');
  }
}

function priorEvidence(options) {
  if (Object.hasOwn(options, '--prior-ledger') === Object.hasOwn(options, '--prior-anchor')) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
  return Object.hasOwn(options, '--prior-ledger')
    ? { prior_ledger_bytes: readBytes(options['--prior-ledger']) }
    : { prior_ledger_anchor: readAnchor(options['--prior-anchor']) };
}

function runBackfill(options) {
  exactOptions(
    options,
    ['--root', '--prior-ledger', '--prior-anchor', '--existing-continuation', '--out'],
    ['--root'],
  );
  const input = {
    root_path: options['--root'],
    ...priorEvidence(options),
  };
  if (Object.hasOwn(options, '--existing-continuation')) {
    input.existing_continuation_bytes = readBytes(options['--existing-continuation']);
  }
  const result = backfillSeCoreEvalQaContinuation(input);
  if (result.result !== 'PASS') {
    return { exit_code: 2, stdout: jsonBytes(result.report) };
  }
  if (!Object.hasOwn(options, '--out')) {
    return { exit_code: 0, stdout: result.ledger_bytes };
  }
  try {
    writeFileSync(options['--out'], result.ledger_bytes, { flag: 'wx' });
  } catch {
    return cliHold('CLI_CREATE_ONLY_WRITE_REFUSED');
  }
  return { exit_code: 0, stdout: jsonBytes(result.report) };
}

function runValidate(options) {
  exactOptions(options, ['--ledger', '--prior-ledger', '--prior-anchor'], ['--ledger']);
  const evidence = priorEvidence(options);
  const report = validateSeCoreEvalQaContinuation(
    readBytes(options['--ledger']),
    evidence.prior_ledger_bytes ?? evidence.prior_ledger_anchor,
  );
  return { exit_code: report.result === 'PASS' ? 0 : 2, stdout: jsonBytes(report) };
}

function runQuery(options) {
  exactOptions(options, [
    '--ledger', '--prior-ledger', '--prior-anchor', '--event-type', '--run-id', '--question-id',
    '--attempt-index',
  ], ['--ledger']);
  const filters = {};
  for (const [option, key] of [
    ['--event-type', 'event_type'],
    ['--run-id', 'run_id'],
    ['--question-id', 'question_id'],
  ]) {
    if (Object.hasOwn(options, option)) filters[key] = options[option];
  }
  if (Object.hasOwn(options, '--attempt-index')) {
    if (!/^[1-3]$/.test(options['--attempt-index'])) throw new Error('CLI_ARGUMENT_REFUSED');
    filters.attempt_index = Number(options['--attempt-index']);
  }
  const result = querySeCoreEvalQaContinuation(
    readBytes(options['--ledger']),
    (() => {
      const evidence = priorEvidence(options);
      return evidence.prior_ledger_bytes ?? evidence.prior_ledger_anchor;
    })(),
    filters,
  );
  return { exit_code: result.result === 'PASS' ? 0 : 2, stdout: jsonBytes(result) };
}

export function runCli(argv = process.argv) {
  try {
    const { command, options } = parse(argv);
    if (command === 'backfill') return runBackfill(options);
    if (command === 'validate') return runValidate(options);
    return runQuery(options);
  } catch (error) {
    const code = error instanceof Error && /^CLI_[A-Z_]+$/.test(error.message)
      ? error.message
      : 'CLI_OPERATION_REFUSED';
    return cliHold(code);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = runCli();
  process.stdout.write(result.stdout);
  process.exitCode = result.exit_code;
}
