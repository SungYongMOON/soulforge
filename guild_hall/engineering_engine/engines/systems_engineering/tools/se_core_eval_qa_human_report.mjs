#!/usr/bin/env node
// Thin adapter over the shared derived-report writer.
//
// Both explicit modes — create-only `--out` and guarded `--refresh` — reach the same owner-local
// writer the automatic capture lanes use, so an explicit run and an automatic refresh cannot
// drift into two different notions of which file may be replaced.

import { fileURLToPath } from 'node:url';

import { renderSeCoreEvalQaHumanReport } from '../evaluation/se_core_eval_qa_human_report.mjs';
import {
  createSeCoreEvalQaReportFile,
  refreshSeCoreEvalQaReportFile,
} from '../evaluation/se_core_eval_qa_report_writer.mjs';

const CLI_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_human_report_cli.v1';
const ALLOWED = new Set(['--root', '--out', '--refresh', '--expected-sha256']);
const HEX64 = /^[0-9a-f]{64}$/;
/** The writer's closed refusals, kept on this CLI's own established issue surface. */
const CLI_ISSUE = Object.freeze({
  REPORT_REQUEST_REFUSED: 'CLI_ARGUMENT_REFUSED',
  REPORT_OUTPUT_REFUSED: 'CLI_OUTPUT_REFUSED',
  REPORT_CREATE_ONLY_WRITE_REFUSED: 'CLI_CREATE_ONLY_WRITE_REFUSED',
  REPORT_REFRESH_REFUSED: 'CLI_REFRESH_REFUSED',
  REPORT_WRITE_INTERRUPTED: 'CLI_WRITE_INTERRUPTED',
  REPORT_WRITE_FAILED: 'CLI_OPERATION_REFUSED',
});

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
      output_format: 'markdown',
      operation: 'none',
      final_comparison_allowed: false,
      issues: [code],
    }),
  };
}

function parse(argv) {
  if (!Array.isArray(argv) || argv.length < 4 || (argv.length - 2) % 2 !== 0) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
  const options = {};
  for (let index = 2; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!ALLOWED.has(name)
      || typeof value !== 'string'
      || value.length === 0
      || value.startsWith('--')
      || Object.hasOwn(options, name)) throw new Error('CLI_ARGUMENT_REFUSED');
    options[name] = value;
  }
  const hasOut = Object.hasOwn(options, '--out');
  const hasRefresh = Object.hasOwn(options, '--refresh');
  const hasExpected = Object.hasOwn(options, '--expected-sha256');
  if (!Object.hasOwn(options, '--root')
    || (hasOut && hasRefresh)
    || (hasRefresh !== hasExpected)
    || (hasExpected && !HEX64.test(options['--expected-sha256']))) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
  return options;
}

/**
 * One written report, reported as counts, hashes, and a basename.
 *
 * A refused write is reported with the writer's own render report when the ledger was the
 * problem, and otherwise as this CLI's closed issue code. No absolute path and no captured text
 * ever reaches stdout.
 */
function writeReceipt(operation, written) {
  if (written.result !== 'PASS') {
    return written.issues[0] === 'REPORT_RENDER_REFUSED'
      ? { exit_code: 2, stdout: jsonBytes(written.report) }
      : cliHold(CLI_ISSUE[written.issues[0]] ?? 'CLI_OPERATION_REFUSED');
  }
  return {
    exit_code: 0,
    stdout: jsonBytes({
      schema_version: CLI_SCHEMA,
      result: 'PASS',
      output_format: 'markdown',
      operation,
      claim_ceiling: written.report.claim_ceiling,
      event_count: written.report.event_count,
      question_count: written.report.question_count,
      answer_count: written.report.answer_count,
      review_count: written.report.review_count,
      pending_question_count: written.report.pending_question_count,
      ledger_sha256: written.report.ledger_sha256,
      head_event_hash: written.report.head_event_hash,
      output_basename: written.basename,
      output_byte_length: written.byte_length,
      output_sha256: written.sha256,
      derived_view_only: true,
      notebook_is_gold: false,
      engine_is_gold: false,
      final_comparison_allowed: false,
      issues: [],
    }),
  };
}

export function runCli(argv = process.argv) {
  try {
    const options = parse(argv);
    if (Object.hasOwn(options, '--out')) {
      return writeReceipt('create', createSeCoreEvalQaReportFile({
        root_path: options['--root'],
        output_path: options['--out'],
      }));
    }
    if (Object.hasOwn(options, '--refresh')) {
      return writeReceipt('refresh', refreshSeCoreEvalQaReportFile({
        root_path: options['--root'],
        output_path: options['--refresh'],
        expected_sha256: options['--expected-sha256'],
      }));
    }
    const rendered = renderSeCoreEvalQaHumanReport({ root_path: options['--root'] });
    return rendered.result === 'PASS'
      ? { exit_code: 0, stdout: rendered.markdown_bytes }
      : { exit_code: 2, stdout: jsonBytes(rendered.report) };
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
