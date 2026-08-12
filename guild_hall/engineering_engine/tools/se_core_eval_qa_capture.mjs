#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { captureQaInteraction } from '../evaluation/se_core_eval_qa_capture.mjs';
import { ensureSeCoreEvalQaReportFile } from '../evaluation/se_core_eval_qa_report_writer.mjs';

const CLI_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_capture_cli.v1';
const CLAIM_CEILING = 'metadata_only_observation_ledger';
/** The commands that append a turn, and therefore owe the derived report a refresh. */
const RECORDING_COMMANDS = new Set([
  'record-question',
  'record-answer',
  'record-review',
  'import-existing',
]);
const COMMANDS = new Set([
  'initialize',
  'validate',
  'record-question',
  'record-answer',
  'record-review',
  'import-existing',
  'query',
]);
const VALUE_OPTIONS = new Set([
  '--root',
  '--interaction-id',
  '--scope',
  '--event-time',
  '--question-file',
  '--provider',
  '--attempt-id',
  '--answer-file',
  '--review-ref',
  '--question-event-time',
  '--question-ref',
  '--answer-event-time',
  '--answer-ref',
  '--event-type',
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
      event_count: 0,
      appended_event_count: 0,
      issues: [code],
    }),
  };
}

function parse(argv) {
  if (!Array.isArray(argv) || argv.length < 3 || !COMMANDS.has(argv[2])) {
    throw new Error('CLI_COMMAND_REFUSED');
  }
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!VALUE_OPTIONS.has(name)
      || value === undefined
      || value.startsWith('--')
      || Object.hasOwn(options, name)) {
      throw new Error('CLI_ARGUMENT_REFUSED');
    }
    options[name] = value;
  }
  return { command: argv[2], options };
}

function exactOptions(options, allowed, required = allowed) {
  if (!Object.keys(options).every((name) => allowed.includes(name))
    || !required.every((name) => Object.hasOwn(options, name))) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
}

function explicitBytes(path) {
  try {
    return readFileSync(path);
  } catch {
    throw new Error('CLI_INPUT_UNREADABLE');
  }
}

function requestFor(command, options) {
  const root_path = options['--root'];
  if (command === 'initialize' || command === 'validate') {
    exactOptions(options, ['--root']);
    return { root_path, command };
  }
  if (command === 'record-question') {
    exactOptions(options, [
      '--root', '--interaction-id', '--scope', '--event-time', '--question-file',
    ]);
    return {
      root_path,
      command,
      interaction_id: options['--interaction-id'],
      scope: options['--scope'],
      event_time: options['--event-time'],
      question_bytes: explicitBytes(options['--question-file']),
    };
  }
  if (command === 'record-answer') {
    exactOptions(options, [
      '--root', '--interaction-id', '--provider', '--attempt-id', '--event-time', '--answer-file',
    ]);
    return {
      root_path,
      command,
      interaction_id: options['--interaction-id'],
      provider: options['--provider'],
      attempt_id: options['--attempt-id'],
      event_time: options['--event-time'],
      answer_bytes: explicitBytes(options['--answer-file']),
    };
  }
  if (command === 'record-review') {
    exactOptions(options, [
      '--root', '--interaction-id', '--provider', '--attempt-id', '--event-time', '--review-ref',
    ]);
    return {
      root_path,
      command,
      interaction_id: options['--interaction-id'],
      provider: options['--provider'],
      attempt_id: options['--attempt-id'],
      event_time: options['--event-time'],
      review_ref: options['--review-ref'],
    };
  }
  if (command === 'import-existing') {
    exactOptions(options, [
      '--root',
      '--interaction-id',
      '--scope',
      '--question-event-time',
      '--question-ref',
      '--provider',
      '--attempt-id',
      '--answer-event-time',
      '--answer-ref',
    ]);
    return {
      root_path,
      command,
      interaction_id: options['--interaction-id'],
      scope: options['--scope'],
      question_event_time: options['--question-event-time'],
      question_ref: options['--question-ref'],
      provider: options['--provider'],
      attempt_id: options['--attempt-id'],
      answer_event_time: options['--answer-event-time'],
      answer_ref: options['--answer-ref'],
    };
  }
  exactOptions(options, [
    '--root', '--event-type', '--interaction-id', '--scope', '--provider', '--attempt-id',
  ], ['--root']);
  const filters = {};
  for (const [name, key] of [
    ['--event-type', 'event_type'],
    ['--interaction-id', 'interaction_id'],
    ['--scope', 'scope'],
    ['--provider', 'provider'],
    ['--attempt-id', 'attempt_id'],
  ]) {
    if (Object.hasOwn(options, name)) filters[key] = options[name];
  }
  return Object.keys(filters).length === 0
    ? { root_path, command }
    : { root_path, command, filters };
}

/**
 * Every recorded turn refreshes the derived human report before the command reports success.
 *
 * The ledger and the hash-bound raw files stay canonical, so a refused refresh never unwinds a
 * recorded turn: the receipt keeps reporting the exact ledger facts the append really reached and
 * marks the derived view as pending instead of claiming a readable report that does not exist.
 */
function withDerivedReport(command, report, rootPath) {
  if (!RECORDING_COMMANDS.has(command) || report.result !== 'PASS') {
    return { exit_code: report.result === 'PASS' ? 0 : 2, stdout: jsonBytes(report) };
  }
  const written = ensureSeCoreEvalQaReportFile({ root_path: rootPath });
  if (written.result !== 'PASS') {
    return {
      exit_code: 2,
      stdout: jsonBytes({
        ...report,
        result: 'HOLD',
        report_operation: 'none',
        report_refresh_pending: true,
        issues: written.issues,
      }),
    };
  }
  return {
    exit_code: 0,
    stdout: jsonBytes({
      ...report,
      report_operation: written.operation,
      report_refresh_pending: false,
    }),
  };
}

export function runCli(argv = process.argv) {
  try {
    const { command, options } = parse(argv);
    const report = captureQaInteraction(requestFor(command, options));
    return withDerivedReport(command, report, options['--root']);
  } catch (error) {
    return cliHold(
      error instanceof Error && /^CLI_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'CLI_OPERATION_REFUSED',
    );
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = runCli();
  process.stdout.write(result.stdout);
  process.exitCode = result.exit_code;
}
