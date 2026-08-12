#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER,
  renderSeCoreEvalQaHumanReport,
} from '../evaluation/se_core_eval_qa_human_report.mjs';

const CLI_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_human_report_cli.v1';
const ALLOWED = new Set(['--root', '--out', '--refresh', '--expected-sha256']);
const HEX64 = /^[0-9a-f]{64}$/;
const WINDOWS_RESERVED = /^(?:nul|con|prn|aux|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const TEMP_SUFFIX = '.refresh-tmp';
const MAX_EXISTING_REPORT_BYTES = 64 * 1024 * 1024;

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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function within(root, candidate) {
  const locator = relative(root, candidate);
  return locator === ''
    || (locator !== '..' && !locator.startsWith(`..${sep}`) && !isAbsolute(locator));
}

/**
 * Resolves a derived-report path that must stay inside the supplied evaluation root.
 *
 * The parent directory is resolved through the filesystem before the leaf is joined back on, so a
 * junction, symlink, short name, or case variant cannot place the report outside the root while
 * still looking contained.
 */
function resolveReportTarget(rootPath, outputPath, code) {
  const leaf = basename(resolve(outputPath));
  if (WINDOWS_RESERVED.test(leaf) || !leaf.toLowerCase().endsWith('.md')) throw new Error(code);
  try {
    const root = realpathSync(rootPath);
    if (!statSync(root).isDirectory()) throw new Error(code);
    const parent = realpathSync(dirname(resolve(outputPath)));
    const target = resolve(parent, leaf);
    if (!within(root, parent) || !within(root, target)) throw new Error(code);
    return target;
  } catch (error) {
    throw error instanceof Error && error.message === code ? error : new Error(code);
  }
}

function assertCreateOnlyTarget(rootPath, outputPath) {
  const target = resolveReportTarget(rootPath, outputPath, 'CLI_OUTPUT_REFUSED');
  try {
    lstatSync(target);
  } catch {
    return target;
  }
  throw new Error('CLI_OUTPUT_REFUSED');
}

function writeCreateOnly(target, bytes) {
  let fd;
  try {
    fd = openSync(target, 'wx', 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* the create-only claim already failed */ }
    }
    throw new Error('CLI_CREATE_ONLY_WRITE_REFUSED');
  }
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new Error('CLI_WRITE_INTERRUPTED');
    offset += written;
  }
}

/**
 * Replaces a report this tool generated, and only such a report.
 *
 * Two independent signals have to agree before anything is written: the file still hashes to the
 * digest the caller observed, and its bytes still begin with this renderer's own marker. An
 * arbitrary file the caller happens to know the hash of is refused, and so is a generated report
 * that changed under the caller since they read it. The replacement is staged as a create-only
 * sibling inside the same directory — never in an OS temp directory — the guard is re-checked, and
 * only then does one rename swap it in. Any failure unlinks the staged file, so a refused refresh
 * leaves the existing report byte-identical and no residue behind.
 */
function refreshRecognizedReport(rootPath, outputPath, expectedSha256, bytes) {
  const target = resolveReportTarget(rootPath, outputPath, 'CLI_REFRESH_REFUSED');
  const marker = Buffer.from(SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER, 'utf8');
  const readGuarded = () => {
    const links = lstatSync(target);
    if (!links.isFile() || links.isSymbolicLink()) throw new Error('CLI_REFRESH_REFUSED');
    const stats = statSync(target);
    if (!stats.isFile() || stats.size > MAX_EXISTING_REPORT_BYTES) {
      throw new Error('CLI_REFRESH_REFUSED');
    }
    const current = readFileSync(target);
    if (current.length !== stats.size
      || sha256(current) !== expectedSha256
      || !current.subarray(0, marker.length).equals(marker)) {
      throw new Error('CLI_REFRESH_REFUSED');
    }
    return current;
  };

  let staged;
  try {
    readGuarded();
    staged = resolve(dirname(target), `${basename(target)}${TEMP_SUFFIX}`);
    if (!within(realpathSync(rootPath), staged)) throw new Error('CLI_REFRESH_REFUSED');
    let fd;
    try {
      fd = openSync(staged, 'wx', 0o600);
      writeAll(fd, bytes);
      fsyncSync(fd);
      closeSync(fd);
    } catch (error) {
      if (fd !== undefined) {
        try { closeSync(fd); } catch { /* the staged claim already failed */ }
      }
      throw error;
    }
    readGuarded();
    renameSync(staged, target);
    return target;
  } catch (error) {
    if (staged !== undefined) {
      try { unlinkSync(staged); } catch { /* nothing was staged, or it is already gone */ }
    }
    throw error instanceof Error && error.message === 'CLI_REFRESH_REFUSED'
      ? error
      : new Error('CLI_REFRESH_REFUSED');
  }
}

function writeReceipt(operation, report, target, bytes) {
  return {
    exit_code: 0,
    stdout: jsonBytes({
      schema_version: CLI_SCHEMA,
      result: 'PASS',
      output_format: 'markdown',
      operation,
      claim_ceiling: report.claim_ceiling,
      event_count: report.event_count,
      question_count: report.question_count,
      answer_count: report.answer_count,
      review_count: report.review_count,
      pending_question_count: report.pending_question_count,
      ledger_sha256: report.ledger_sha256,
      head_event_hash: report.head_event_hash,
      output_basename: basename(target),
      output_byte_length: bytes.length,
      output_sha256: report.markdown_sha256,
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
    const rendered = renderSeCoreEvalQaHumanReport({ root_path: options['--root'] });
    if (rendered.result !== 'PASS') {
      return { exit_code: 2, stdout: jsonBytes(rendered.report) };
    }
    if (Object.hasOwn(options, '--out')) {
      const target = assertCreateOnlyTarget(options['--root'], options['--out']);
      writeCreateOnly(target, rendered.markdown_bytes);
      return writeReceipt('create', rendered.report, target, rendered.markdown_bytes);
    }
    if (Object.hasOwn(options, '--refresh')) {
      const target = refreshRecognizedReport(
        options['--root'],
        options['--refresh'],
        options['--expected-sha256'],
        rendered.markdown_bytes,
      );
      return writeReceipt('refresh', rendered.report, target, rendered.markdown_bytes);
    }
    return { exit_code: 0, stdout: rendered.markdown_bytes };
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
