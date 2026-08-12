#!/usr/bin/env node
// Thin adapter for the query-only NotebookLM capture module.
//
// Every runtime value is supplied explicitly; nothing here hard-codes a notebook, source,
// account, profile, or path. stdout carries hashes, counts, and redacted state only: no
// question, answer, citation, reference, notebook/source/conversation identifier, absolute
// path, provider stdout/stderr, or rejected value is ever echoed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { captureSeCoreNotebookQuery } from '../evaluation/se_core_eval_notebook_query_capture.mjs';

const CLI_SCHEMA = 'soulforge.engineering_engine.se_core_eval_notebook_query_capture_cli.v1';
const CLAIM_CEILING = 'metadata_only_observation_ledger';
const EXIT_CODES = Object.freeze({ PASS: 0, HOLD: 2, UNKNOWN: 3 });
const VALUE_OPTIONS = Object.freeze([
  '--root',
  '--interaction-id',
  '--scope',
  '--attempt-id',
  '--event-time',
  '--question-file',
  '--notebook-id',
  '--source-ids',
  '--profile',
  '--timeout-seconds',
]);
const TIMEOUT_DIGITS = /^\d{1,3}$/;

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
    exit_code: EXIT_CODES.HOLD,
    stdout: jsonBytes({
      schema_version: CLI_SCHEMA,
      result: 'HOLD',
      claim_ceiling: CLAIM_CEILING,
      provider: 'notebook',
      query_performed: false,
      issues: [code],
    }),
  };
}

function parse(argv) {
  if (!Array.isArray(argv) || (argv.length - 2) % 2 !== 0) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
  const options = {};
  for (let index = 2; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!VALUE_OPTIONS.includes(name)
      || typeof value !== 'string'
      || value.length === 0
      || value.startsWith('--')
      || Object.hasOwn(options, name)) {
      throw new Error('CLI_ARGUMENT_REFUSED');
    }
    options[name] = value;
  }
  if (VALUE_OPTIONS.some((name) => !Object.hasOwn(options, name))) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
  return options;
}

function explicitBytes(path) {
  try {
    return readFileSync(path);
  } catch {
    throw new Error('CLI_INPUT_UNREADABLE');
  }
}

function requestFor(options) {
  const timeout = options['--timeout-seconds'];
  if (!TIMEOUT_DIGITS.test(timeout)) throw new Error('CLI_ARGUMENT_REFUSED');
  return {
    root_path: options['--root'],
    interaction_id: options['--interaction-id'],
    scope: options['--scope'],
    attempt_id: options['--attempt-id'],
    event_time: options['--event-time'],
    question_bytes: explicitBytes(options['--question-file']),
    notebook_id: options['--notebook-id'],
    source_ids: options['--source-ids'].split(','),
    profile: options['--profile'],
    timeout_seconds: Number(timeout),
  };
}

export function runCli(argv = process.argv, dependencies = {}) {
  try {
    const report = captureSeCoreNotebookQuery(requestFor(parse(argv)), dependencies);
    return {
      exit_code: EXIT_CODES[report.result] ?? EXIT_CODES.HOLD,
      stdout: jsonBytes({ ...report, schema_version: CLI_SCHEMA, module_schema_version: report.schema_version }),
    };
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
