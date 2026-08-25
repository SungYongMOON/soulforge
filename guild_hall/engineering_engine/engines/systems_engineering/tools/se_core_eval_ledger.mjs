#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  backfillSeCoreEvalLedger,
  querySeCoreEvalLedger,
  validateSeCoreEvalLedger,
} from '../evaluation/se_core_eval_ledger.mjs';

const CLI_SCHEMA = 'soulforge.engineering_engine.se_core_eval_ledger_cli.v1';
const CLAIM_CEILING = 'metadata_only_observation_ledger';
const VALUE_OPTIONS = new Set([
  '--root',
  '--existing-ledger',
  '--out',
  '--ledger',
  '--event-type',
  '--run-id',
  '--round-id',
  '--question-id',
  '--attempt-index',
  '--natural-key-sha256',
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

function runBackfill(options) {
  exactOptions(options, ['--root', '--existing-ledger', '--out'], ['--root']);
  const input = { root_path: options['--root'] };
  if (Object.hasOwn(options, '--existing-ledger')) {
    input.existing_ledger_bytes = readBytes(options['--existing-ledger']);
  }
  const result = backfillSeCoreEvalLedger(input);
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
  exactOptions(options, ['--ledger'], ['--ledger']);
  const report = validateSeCoreEvalLedger(readBytes(options['--ledger']));
  return { exit_code: report.result === 'PASS' ? 0 : 2, stdout: jsonBytes(report) };
}

function runQuery(options) {
  exactOptions(options, [
    '--ledger', '--event-type', '--run-id', '--round-id', '--question-id',
    '--attempt-index', '--natural-key-sha256',
  ], ['--ledger']);
  const filters = {};
  for (const [option, key] of [
    ['--event-type', 'event_type'],
    ['--run-id', 'run_id'],
    ['--round-id', 'round_id'],
    ['--question-id', 'question_id'],
    ['--natural-key-sha256', 'natural_key_sha256'],
  ]) {
    if (Object.hasOwn(options, option)) filters[key] = options[option];
  }
  if (Object.hasOwn(options, '--attempt-index')) {
    if (!/^[1-3]$/.test(options['--attempt-index'])) throw new Error('CLI_ARGUMENT_REFUSED');
    filters.attempt_index = Number(options['--attempt-index']);
  }
  const result = querySeCoreEvalLedger(readBytes(options['--ledger']), filters);
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
