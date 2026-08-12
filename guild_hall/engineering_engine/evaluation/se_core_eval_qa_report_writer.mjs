// The one place the derived SE-core QA human report is written to disk.
//
// Three callers share this seam: the report CLI's explicit `--out` and `--refresh` modes, the
// NotebookLM query-and-capture adapter, and the Engine source-cited capture adapter. They all
// reach the same resolution, recognition, and staged-replacement rules, so an automatic refresh
// can never write a file the explicit CLI would have refused.
//
// The report stays a derived, non-authoritative view. The append-only QA interaction ledger and
// the hash-bound raw question and answer files remain the truth and the evidence; this module
// only projects them onto one readable file and holds rather than guessing.

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
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { SE_CORE_EVAL_QA_DERIVED_REPORT_FILE } from './se_core_eval_qa_capture.mjs';
import {
  renderSeCoreEvalQaHumanReport,
  verifySeCoreEvalQaHumanReportBytes,
} from './se_core_eval_qa_human_report.mjs';

const WRITER_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_report_writer.v1';
const GENESIS_HASH = '0'.repeat(64);
const HEX64 = /^[0-9a-f]{64}$/;
const WINDOWS_RESERVED = /^(?:nul|con|prn|aux|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const TEMP_SUFFIX = '.refresh-tmp';
const MAX_EXISTING_REPORT_BYTES = 64 * 1024 * 1024;

/** The fixed basename every automatic capture lane creates or refreshes under its own root. */
export const SE_CORE_EVAL_QA_REPORT_BASENAME = SE_CORE_EVAL_QA_DERIVED_REPORT_FILE;

class ReportWriteHold extends Error {
  constructor(code, report = null) {
    super(code);
    this.name = 'ReportWriteHold';
    this.code = code;
    this.report = report;
  }
}

function hold(code) {
  throw new ReportWriteHold(code);
}

function isRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!isRecord(value)
    || Object.keys(value).length !== keys.length
    || !keys.every((key) => Object.hasOwn(value, key))) {
    hold('REPORT_REQUEST_REFUSED');
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
  if (typeof outputPath !== 'string' || outputPath.length === 0) hold(code);
  const leaf = basename(resolve(outputPath));
  if (WINDOWS_RESERVED.test(leaf) || !leaf.toLowerCase().endsWith('.md')) hold(code);
  try {
    const root = realpathSync(rootPath);
    if (!statSync(root).isDirectory()) hold(code);
    const parent = realpathSync(dirname(resolve(outputPath)));
    const target = resolve(parent, leaf);
    if (!within(root, parent) || !within(root, target)) hold(code);
    return target;
  } catch (error) {
    if (error instanceof ReportWriteHold) throw error;
    return hold(code);
  }
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) hold('REPORT_WRITE_INTERRUPTED');
    offset += written;
  }
}

/**
 * Claims a free path and fills it, or leaves nothing of its own behind.
 *
 * The create-only open is what proves this call, and no other writer, owns the file at that path.
 * If the open succeeds but the write does not, the partial file this call created is removed again:
 * a half-written report is worse than none, and a staged file must not survive its own failure. A
 * path that was already occupied is refused without being touched, because this call did not
 * create it and has no claim to it.
 */
function writeCreateOnly(target, bytes, code) {
  let fd;
  let created = false;
  try {
    fd = openSync(target, 'wx', 0o600);
    created = true;
    writeAll(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    return;
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* the create-only claim already failed */ }
    }
    if (created) {
      try { unlinkSync(target); } catch { /* the file this call created is already gone */ }
    }
    hold(code);
  }
}

function exists(target) {
  try {
    lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the existing report only if it is still exactly the file this seam may replace.
 *
 * Three independent signals have to agree. The entry is a plain regular file rather than a symlink,
 * junction, or other reparse point. It carries no second hard link that would let a replacement
 * rewrite a file elsewhere. And its bytes prove, on their own, that this renderer produced exactly
 * them: the head is the renderer's, and the digest that head commits to still matches the body it
 * covers. That last check is what a fixed marker could not do — a hand-edited body under a copied
 * marker no longer verifies — and it needs no digest from the caller, so a caller that reads the
 * file and hands its hash straight back cannot make recognition vacuous.
 *
 * `expectedSha256` is an additional constraint, never a substitute for recognition. The explicit
 * CLI passes the digest it observed so a report that changed since the human read it is refused;
 * the automatic lanes pass null and rely on the self-authenticating bytes plus the re-read below.
 */
function readRecognizedReport(target, expectedSha256) {
  let current;
  try {
    const links = lstatSync(target);
    if (!links.isFile() || links.isSymbolicLink() || links.nlink !== 1) {
      hold('REPORT_REFRESH_REFUSED');
    }
    const stats = statSync(target);
    if (!stats.isFile() || stats.size > MAX_EXISTING_REPORT_BYTES) hold('REPORT_REFRESH_REFUSED');
    current = readFileSync(target);
    if (current.length !== stats.size) hold('REPORT_REFRESH_REFUSED');
  } catch (error) {
    if (error instanceof ReportWriteHold) throw error;
    return hold('REPORT_REFRESH_REFUSED');
  }
  if (!verifySeCoreEvalQaHumanReportBytes(current)) hold('REPORT_REFRESH_REFUSED');
  if (expectedSha256 !== null && sha256(current) !== expectedSha256) {
    hold('REPORT_REFRESH_REFUSED');
  }
  return current;
}

/**
 * Replaces a recognized report, and only a recognized report.
 *
 * The replacement is staged as a create-only sibling inside the same directory — never in an OS
 * temp directory. The create-only open is also the ownership proof: only a staged file this call
 * actually created is ever unlinked, so a foreign file already sitting at that sibling path refuses
 * the refresh instead of being deleted by it. After staging, the target is re-read and compared
 * against the exact bytes recognized a moment ago, so a file that drifted underneath this call is
 * caught before anything is swapped, and only then does one rename replace it.
 */
function replaceRecognizedReport(rootPath, target, expectedSha256, bytes) {
  let owned = null;
  try {
    const recognized = readRecognizedReport(target, expectedSha256);
    const staged = resolve(dirname(target), `${basename(target)}${TEMP_SUFFIX}`);
    if (!within(realpathSync(rootPath), staged)) hold('REPORT_REFRESH_REFUSED');
    writeCreateOnly(staged, bytes, 'REPORT_REFRESH_REFUSED');
    owned = staged;
    if (!readRecognizedReport(target, expectedSha256).equals(recognized)) {
      hold('REPORT_REFRESH_REFUSED');
    }
    renameSync(staged, target);
    owned = null;
  } catch (error) {
    if (owned !== null) {
      try { unlinkSync(owned); } catch { /* the file this call staged is already gone */ }
    }
    if (error instanceof ReportWriteHold) throw error;
    hold('REPORT_REFRESH_REFUSED');
  }
}

function passResult(operation, target, bytes, report) {
  return {
    schema_version: WRITER_SCHEMA,
    result: 'PASS',
    operation,
    basename: basename(target),
    byte_length: bytes.length,
    sha256: sha256(bytes),
    report,
    issues: [],
  };
}

function holdResult(code, report) {
  return {
    schema_version: WRITER_SCHEMA,
    result: 'HOLD',
    operation: 'none',
    basename: null,
    byte_length: 0,
    sha256: GENESIS_HASH,
    report,
    issues: [code],
  };
}

/**
 * Validate the request, render the ledger, then let one write mode place the bytes.
 *
 * The render happens before any path is claimed, so a ledger this module cannot project refuses
 * with the renderer's own closed issue code and touches no file at all.
 */
function writeRenderedReport(options, keys, place) {
  try {
    exactKeys(options, keys);
    const rendered = renderSeCoreEvalQaHumanReport({ root_path: options.root_path });
    if (rendered.result !== 'PASS') {
      throw new ReportWriteHold('REPORT_RENDER_REFUSED', rendered.report);
    }
    const placed = place(rendered.markdown_bytes);
    return passResult(placed.operation, placed.target, rendered.markdown_bytes, rendered.report);
  } catch (error) {
    if (error instanceof ReportWriteHold) return holdResult(error.code, error.report);
    return holdResult('REPORT_WRITE_FAILED', null);
  }
}

/** Create the report at an explicit path, refusing a path that is already occupied. */
export function createSeCoreEvalQaReportFile(options = {}) {
  return writeRenderedReport(options, ['root_path', 'output_path'], (bytes) => {
    const target = resolveReportTarget(
      options.root_path, options.output_path, 'REPORT_OUTPUT_REFUSED',
    );
    if (exists(target)) hold('REPORT_OUTPUT_REFUSED');
    writeCreateOnly(target, bytes, 'REPORT_CREATE_ONLY_WRITE_REFUSED');
    return { operation: 'created', target };
  });
}

/** Refresh a report at an explicit path against the exact bytes the caller observed. */
export function refreshSeCoreEvalQaReportFile(options = {}) {
  return writeRenderedReport(options, ['root_path', 'output_path', 'expected_sha256'], (bytes) => {
    if (typeof options.expected_sha256 !== 'string' || !HEX64.test(options.expected_sha256)) {
      hold('REPORT_REQUEST_REFUSED');
    }
    const target = resolveReportTarget(
      options.root_path, options.output_path, 'REPORT_REFRESH_REFUSED',
    );
    replaceRecognizedReport(options.root_path, target, options.expected_sha256, bytes);
    return { operation: 'refreshed', target };
  });
}

/**
 * Create or refresh the fixed-basename report under one explicit capture root.
 *
 * This is the seam every automatic capture lane uses, so a captured turn becomes readable without
 * a separate manual command. The first capture creates the file only if that basename is free. A
 * later capture refreshes it only when the existing bytes still prove themselves to be exactly what
 * this renderer produced, which no caller-supplied digest is involved in deciding, and the same
 * bytes are re-read after staging so a file that drifted underneath refuses instead of being
 * clobbered. An arbitrary file, a hand-edited report, and a report written in an older format
 * without a body commitment are all refused and left byte-identical for a human to move or remove.
 */
export function ensureSeCoreEvalQaReportFile(options = {}) {
  return writeRenderedReport(options, ['root_path'], (bytes) => {
    const target = resolveReportTarget(
      options.root_path,
      join(options.root_path, SE_CORE_EVAL_QA_REPORT_BASENAME),
      'REPORT_OUTPUT_REFUSED',
    );
    if (!exists(target)) {
      writeCreateOnly(target, bytes, 'REPORT_CREATE_ONLY_WRITE_REFUSED');
      return { operation: 'created', target };
    }
    replaceRecognizedReport(options.root_path, target, null, bytes);
    return { operation: 'refreshed', target };
  });
}
