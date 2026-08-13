#!/usr/bin/env node
// Thin CLI adapter for the evaluation-only Soulforge Engineering Answer Lane.
//
// This file is the only place that knows a provider exists. It reads exactly one source-set
// contract, one exact question file, exactly four explicit derived-text files, and — when the run
// is meant to be the fixed benchmark — one operator-authored cohort pin, then calls one loopback
// Ollama model. The deep lane stays provider-independent.
//
// It is also the whole operator surface. Both lane entry points are reachable from here as one
// command: without `--benchmark-pin` the run is the generic validated-contract lane and says so on
// both receipts; with one it is the pinned benchmark gate. Neither requires a caller to import
// this module or the lane.
//
// Output rules: stdout carries the canonical answer, stderr carries the payload-free lane receipt
// followed by one command execution receipt. `--out` and `--receipt-out` are independent
// create-only files, and both are staged *before* the model is invoked, so an occupied output
// refuses the run with no model call and no partial artifact. The prompt, the source prose, and
// the provider response body are never logged.
//
// Four properties this adapter owes its caller, and how each is held:
//
//   ownership   A staged output is identified by the file this run created — device and inode —
//               not by the path string that named it. Nothing is ever removed by path alone, so a
//               file that replaced ours between the claim and the rollback is left untouched and
//               reported unknown. Losing an output is a refusal, never a silent overwrite.
//   accounting  The lane writes nothing and says so in its own receipt. Persistence is this
//               file's business, so it is reported separately, with the exact requested, claimed,
//               completed, rolled-back, and unknown counts, and never inferred from a PASS.
//   independence  A benchmark pin is read as operator configuration and never derived, recomputed,
//               or repaired from the corpus it is supposed to bind. A pin that disagrees with the
//               runtime cohort refuses the run; it does not become a new pin.
//   bounded I/O  Every byte this process takes from outside is bounded before it is interpreted:
//               the io surface is one closed descriptor snapshot, every named local input is one
//               ordinary file sized from its own open handle and read under that input kind's
//               ceiling, the request timeout has a hard ceiling, and a provider response is
//               counted, capped, and fatally decoded before anything parses it.

import {
  closeSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, unlinkSync, writeSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalSeCoreSourceboundAnswerJson,
  canonicalSeCoreSourceboundReceiptJson,
  runSeCorePinnedBenchmarkAnswerLane,
  runSeCoreSourceboundAnswerLane,
  seCoreSourceCohortSha256,
  seCoreSourceSetContractSha256,
} from '../evaluation/se_core_sourcebound_answer_lane.mjs';
import { ContractError } from '../kernel/errors.mjs';

export const EXACT_ANSWER_MODEL = 'qwen3.5:9b';
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
export const OLLAMA_ADAPTER_REVISION = 'soulforge.se_core_sourcebound_answer_ollama_adapter.v0';
export const OLLAMA_KEEP_ALIVE = '5m';
export const OLLAMA_CHAT_PATH = '/api/chat';
export const COMMAND_RECEIPT_SCHEMA_VERSION =
  'soulforge.se_core_sourcebound_answer_command_receipt.v0';

/**
 * A test-only checkpoint seam for the output transaction.
 *
 * It is symbol-keyed on purpose. The public io surface below is a closed set of *string* keys, so
 * this hook cannot arrive from an argument, an environment value, a config file, or any JSON a
 * runtime caller could hand over — only from a module that imports this symbol. It exists so the
 * suite can simulate a hostile filesystem race at the exact instants that matter, and it is not
 * part of the runtime contract.
 */
export const TEST_ONLY_OUTPUT_HOOK =
  Symbol('soulforge.se_core_sourcebound_answer_runner.test_only_output_hook');

export const CLI_CODES = Object.freeze({
  ARGUMENT_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_ARGUMENT_INVALID',
  IO_SURFACE_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_IO_SURFACE_INVALID',
  INPUT_REFUSED: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_INPUT_REFUSED',
  INPUT_READ_FAILED: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_INPUT_READ_FAILED',
  CONTRACT_FILE_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_CONTRACT_FILE_INVALID',
  BENCHMARK_PIN_FILE_INVALID: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_BENCHMARK_PIN_FILE_INVALID',
  OUTPUT_REFUSED: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_OUTPUT_REFUSED',
  OUTPUT_COMMIT_FAILED: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_OUTPUT_COMMIT_FAILED',
  MODEL_TARGET_REFUSED: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_MODEL_TARGET_REFUSED',
  MODEL_CALL_REFUSED: 'SE_CORE_SOURCEBOUND_ANSWER_CLI_MODEL_CALL_REFUSED',
});

/**
 * The hard ceiling on one provider request, in milliseconds.
 *
 * A timeout is the only bound on how long this command can hold a staged create-only output open
 * while a provider says nothing, so it is capped rather than left to an argument. Three minutes is
 * already generous for one bounded local generation; the default is the same value, so the ceiling
 * is what an unspecified run gets and nothing can ask for more.
 */
export const MAX_TIMEOUT_MS = 180000;

const REQUIRED_FLAGS = Object.freeze([
  '--source-set-contract', '--source-set-sha256', '--question', '--question-sha256',
  '--question-bytes', '--point-in-time',
]);
const OPTIONAL_FLAGS = Object.freeze([
  '--benchmark-pin', '--max-evidence', '--max-per-source', '--query-expansion', '--model',
  '--ollama-url', '--timeout-ms', '--out', '--receipt-out',
]);
const REPEATABLE_FLAGS = Object.freeze(['--derived-text']);
const ALLOWED_FLAGS = new Set([...REQUIRED_FLAGS, ...OPTIONAL_FLAGS, ...REPEATABLE_FLAGS]);
const OUTPUT_FLAGS = Object.freeze([['--out', 'answer'], ['--receipt-out', 'receipt']]);
const IO_FIELDS = new Set(['answerModel', 'stdoutWrite', 'stderrWrite']);
const EXPECTED_DERIVED_TEXT_COUNT = 4;
const CONTRACT_FILE_FIELDS = Object.freeze(['schema_version', 'source_set_id', 'sources']);
const CONTRACT_FILE_SOURCE_FIELDS = Object.freeze([
  'source_id', 'title', 'revision', 'source_pdf_sha256', 'derived_text_sha256', 'page_count',
  'approval', 'permissions',
]);
const PINNED_SOURCE_FIELDS = Object.freeze([
  'source_id', 'title', 'revision', 'source_pdf_sha256', 'derived_text_sha256', 'page_count',
]);
// Exactly the field set the deep pinned-benchmark API accepts. It declares no schema version of
// its own, so a pin file that carries one is refused here rather than dropped on the way in.
const BENCHMARK_PIN_FILE_FIELDS = Object.freeze([
  'pin_id', 'source_set_id', 'expected_cohort_sha256', 'allowed_source_ids',
]);
// A pin is four identifiers and one digest. The ceiling is deliberately far below anything that
// could be a corpus, a document, or a transcript that wandered in under a pin's name.
export const MAX_BENCHMARK_PIN_BYTES = 4096;
// The contract is one closed four-member document: four sources of eight bounded fields each, so
// even a generously indented spelling is a few kilobytes. This leaves an order of magnitude of
// headroom for whitespace and still refuses anything the size of a document.
export const MAX_SOURCE_SET_CONTRACT_BYTES = 65536;
// The two ceilings the lane itself enforces on the same material, restated here because a bound
// applied after the bytes are already in this process is not a bound on this process. They are not
// independent values: the suite pins each to the lane's own boundary from both sides — the exact
// ceiling answers end to end, one byte more is refused — so the two cannot drift apart silently.
export const MAX_QUESTION_BYTES = 8192;
export const MAX_DERIVED_TEXT_BYTES = 8 * 1024 * 1024;
// Evaluator-only and prior-turn material is refused by name before a single byte is read.
const FORBIDDEN_INPUT_BASENAME = /(crosswalk|rubric|gold|answer[_-]?key|expected[_-]?answer|prior[_-]?(answer|review)|review[_-]?receipt|notebook|notebooklm|nlm[_-]|question[_-]?set|oracle)/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,6}$/u;
const QUERY_EXPANSION_MODES = new Set(['off', 'advisory']);
const DEFAULTS = Object.freeze({
  max_evidence: 6, max_per_source: 2, query_expansion: 'off', timeout_ms: MAX_TIMEOUT_MS,
});

function refuse(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

export function parseArgs(argv) {
  if (argv.length % 2 !== 0) {
    refuse(CLI_CODES.ARGUMENT_INVALID, 'arguments must be explicit flag/value pairs');
  }
  const parsed = {};
  const derivedText = [];
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!ALLOWED_FLAGS.has(flag) || typeof value !== 'string' || value.length === 0
        || value.startsWith('--')) {
      refuse(CLI_CODES.ARGUMENT_INVALID,
        'an unknown, empty, or valueless argument was supplied');
    }
    if (flag === '--derived-text') {
      const split = value.indexOf('=');
      if (split < 1 || split === value.length - 1) {
        refuse(CLI_CODES.ARGUMENT_INVALID, '--derived-text takes <source_id>=<path>');
      }
      derivedText.push({ source_id: value.slice(0, split), path: value.slice(split + 1) });
      continue;
    }
    if (Object.hasOwn(parsed, flag)) {
      refuse(CLI_CODES.ARGUMENT_INVALID, 'a non-repeatable argument was supplied twice');
    }
    parsed[flag] = value;
  }
  if (REQUIRED_FLAGS.some((flag) => !Object.hasOwn(parsed, flag))) {
    refuse(CLI_CODES.ARGUMENT_INVALID,
      'the contract, question, pins, and point-in-time arguments are all required');
  }
  if (derivedText.length !== EXPECTED_DERIVED_TEXT_COUNT
      || new Set(derivedText.map((entry) => entry.source_id)).size !== EXPECTED_DERIVED_TEXT_COUNT) {
    refuse(CLI_CODES.ARGUMENT_INVALID,
      'exactly four distinct --derived-text <source_id>=<path> arguments are required');
  }
  if (!SHA256.test(parsed['--source-set-sha256']) || !SHA256.test(parsed['--question-sha256'])) {
    refuse(CLI_CODES.ARGUMENT_INVALID, 'both pins must be lowercase sha256 digests');
  }
  if (!POSITIVE_INTEGER.test(parsed['--question-bytes'])) {
    refuse(CLI_CODES.ARGUMENT_INVALID, '--question-bytes must be one positive integer');
  }
  for (const flag of ['--max-evidence', '--max-per-source', '--timeout-ms']) {
    if (Object.hasOwn(parsed, flag) && !POSITIVE_INTEGER.test(parsed[flag])) {
      refuse(CLI_CODES.ARGUMENT_INVALID, `${flag} must be one positive integer`);
    }
  }
  if (Object.hasOwn(parsed, '--timeout-ms') && Number(parsed['--timeout-ms']) > MAX_TIMEOUT_MS) {
    refuse(CLI_CODES.ARGUMENT_INVALID, `--timeout-ms may not exceed ${MAX_TIMEOUT_MS}`);
  }
  if (Object.hasOwn(parsed, '--query-expansion')
      && !QUERY_EXPANSION_MODES.has(parsed['--query-expansion'])) {
    refuse(CLI_CODES.ARGUMENT_INVALID, '--query-expansion accepts only "off" or "advisory"');
  }
  if (Object.hasOwn(parsed, '--model') && parsed['--model'] !== EXACT_ANSWER_MODEL) {
    refuse(CLI_CODES.ARGUMENT_INVALID, `this runner serves exactly ${EXACT_ANSWER_MODEL}`);
  }
  // One normalised-path check here, before anything is opened. It catches the ordinary spelling
  // collision cheaply; the file-identity check at stage time catches the rest — case folding,
  // reparse points, and hard links, none of which a path string can reveal.
  if (Object.hasOwn(parsed, '--out') && Object.hasOwn(parsed, '--receipt-out')
      && resolve(parsed['--out']) === resolve(parsed['--receipt-out'])) {
    refuse(CLI_CODES.ARGUMENT_INVALID, 'answer and receipt outputs must be distinct paths');
  }
  return { flags: parsed, derivedText };
}

/** Refuses an evaluator-only or prior-turn input by name before any read. */
export function assertReadableInputPath(path) {
  if (FORBIDDEN_INPUT_BASENAME.test(basename(path))) {
    refuse(CLI_CODES.INPUT_REFUSED,
      'crosswalk, rubric, gold, prior-answer, question-set, and Notebook inputs are refused');
  }
  return path;
}

// ------------------------------------------------------------------ bounded local input reading
//
// A whole-file read takes its allocation size from the file, which is the one number this process
// does not control. So no buffer exists here until a size has been read from the *open handle* and
// compared against the ceiling for that kind of input.
//
// The handle is the file; the path is only a name for it. A name can mean a directory, a device, a
// symlink, or a junction, it can be a second name for a file somebody else is writing, and it can
// stop meaning the same file between the open and the last byte. None of that is visible in a path
// string, so identity is taken from the descriptor and from the name — without following it — both
// before and after the read, and any disagreement refuses.

const identityOf = (stat) => ({ dev: stat.dev, ino: stat.ino });

const sameIdentity = (left, right) => left !== null && right !== null
  && left.dev === right.dev && left.ino === right.ino;

/**
 * Whether a held descriptor and an unfollowed name describe one and the same singly named ordinary
 * file.
 *
 * `lstat` is what refuses a symlink or a junction: `open` follows a reparse point silently, so the
 * only way to know the name was not a link is to look at the name without following it. `nlink`
 * must be exactly one, because a second hard link is a second name — one this call never checked
 * and cannot bound — under which the same bytes may be rewritten while this read is in flight.
 *
 * `bigint: true` is not decoration: a Windows file index does not fit in a double, so a Number
 * inode is a rounded value and two different files can compare equal.
 */
function oneNamedOrdinaryFile(held, named) {
  return held.isFile() && named.isFile() && held.ino !== 0n
    && held.nlink === 1n && named.nlink === 1n
    && sameIdentity(identityOf(held), identityOf(named));
}

/**
 * Reads exactly one bounded ordinary file, opened read-only, or returns `null`.
 *
 * The order is the whole point. The handle's size is checked against `maxBytes` *before* anything
 * is allocated, so an oversized file costs one stat and no memory. The allocation is then exactly
 * that size, the read is driven to completion at explicit offsets, and one byte is probed past the
 * end — a file that grew after the stat must not be silently accepted as the shorter document that
 * happens to still parse. Finally the descriptor and the name are stated again and must agree with
 * the first pair at the same size.
 *
 * Everything else — a directory, a device, a symlink, a junction, a second hard link, a short read,
 * a replacement mid-read, an oversized document — returns `null` and lets the caller refuse with
 * its own code and its own fixed message, so no local path and no file content can reach an error
 * string by way of which check failed.
 */
function readBoundedRegularFileBytes(path, maxBytes) {
  let fd = null;
  try {
    fd = openSync(path, 'r');
    const opened = fstatSync(fd, { bigint: true });
    if (!oneNamedOrdinaryFile(opened, lstatSync(path, { bigint: true }))
        || opened.size > BigInt(maxBytes)) {
      return null;
    }
    const size = Number(opened.size);
    const bytes = Buffer.alloc(size);
    let read = 0;
    while (read < size) {
      const chunk = readSync(fd, bytes, read, size - read, read);
      if (chunk === 0) return null;
      read += chunk;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, size) !== 0) return null;
    const closing = fstatSync(fd, { bigint: true });
    if (closing.size !== opened.size
        || !sameIdentity(identityOf(opened), identityOf(closing))
        || !oneNamedOrdinaryFile(closing, lstatSync(path, { bigint: true }))) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch { /* the handle is already gone; nothing was written through it */ }
    }
  }
}

/**
 * One explicitly named CLI input, read under the exact ceiling that kind of input is allowed.
 *
 * The name is refused first, so an evaluator-only or prior-turn basename never reaches an open.
 * Every remaining refusal shares one fixed message: which check failed, which path was named, and
 * what the file held are all withheld, because a caller who can name a path could otherwise read
 * the filesystem one refusal at a time.
 */
function readBoundedInputBytes(path, maxBytes) {
  assertReadableInputPath(path);
  const bytes = readBoundedRegularFileBytes(path, maxBytes);
  if (bytes === null || bytes.length === 0) {
    refuse(CLI_CODES.INPUT_READ_FAILED,
      'an explicitly named input is not one bounded non-empty ordinary file; '
      + 'its local path is not echoed');
  }
  return bytes;
}

/**
 * Reads one operator-authored fixed-benchmark cohort pin.
 *
 * The pin is *configuration*, not corpus: four identifiers and one digest, in the exact closed
 * shape the deep pinned API accepts. Nothing here is derived from the source-set contract under
 * test — that independence is the entire property the pin exists to provide, so this function
 * never reads, recomputes, or repairs a commitment. A pin that does not match refuses the run; it
 * is not quietly re-derived from the corpus it was supposed to bind.
 *
 * The document is rebuilt from validated primitives, so no prototype, accessor, or extra field
 * from the file rides through to the lane. Nothing it contains is echoed on any failure path.
 */
export function readBenchmarkPinFile(path) {
  assertReadableInputPath(path);
  const bytes = readBoundedRegularFileBytes(path, MAX_BENCHMARK_PIN_BYTES);
  if (bytes === null) {
    refuse(CLI_CODES.BENCHMARK_PIN_FILE_INVALID,
      'the benchmark pin is not one bounded readable ordinary file');
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    refuse(CLI_CODES.BENCHMARK_PIN_FILE_INVALID, 'the benchmark pin is not decodable UTF-8 JSON');
  }
  if (!exactFields(parsed, BENCHMARK_PIN_FILE_FIELDS)) {
    refuse(CLI_CODES.BENCHMARK_PIN_FILE_INVALID,
      'a benchmark pin is one closed plain document of pin_id, source_set_id, '
      + 'expected_cohort_sha256, and allowed_source_ids');
  }
  for (const field of ['pin_id', 'source_set_id']) {
    if (typeof parsed[field] !== 'string' || !SAFE_IDENTIFIER.test(parsed[field])) {
      refuse(CLI_CODES.BENCHMARK_PIN_FILE_INVALID,
        'a benchmark pin names its pin and its source set with one bounded safe identifier each');
    }
  }
  if (typeof parsed.expected_cohort_sha256 !== 'string'
      || !SHA256.test(parsed.expected_cohort_sha256)) {
    refuse(CLI_CODES.BENCHMARK_PIN_FILE_INVALID,
      'expected_cohort_sha256 must be one lowercase sha256 digest');
  }
  if (!Array.isArray(parsed.allowed_source_ids)
      || parsed.allowed_source_ids.length !== EXPECTED_DERIVED_TEXT_COUNT
      || parsed.allowed_source_ids.some(
        (id) => typeof id !== 'string' || !SAFE_IDENTIFIER.test(id),
      )
      || new Set(parsed.allowed_source_ids).size !== EXPECTED_DERIVED_TEXT_COUNT) {
    refuse(CLI_CODES.BENCHMARK_PIN_FILE_INVALID,
      'a benchmark pin allowlists exactly four distinct safe source ids');
  }
  return {
    pin_id: parsed.pin_id,
    source_set_id: parsed.source_set_id,
    expected_cohort_sha256: parsed.expected_cohort_sha256,
    allowed_source_ids: [...parsed.allowed_source_ids],
  };
}

function exactFields(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

/**
 * Splits the operator-authored contract file into the pinned commitment and the declared
 * approval/permission posture.
 *
 * Only the six identity-and-byte fields participate in the canonical commitment, so re-affirming
 * approval never silently changes the corpus pin, and changing a byte hash always does.
 */
export function readSourceSetContractFile(path) {
  const bytes = readBoundedInputBytes(path, MAX_SOURCE_SET_CONTRACT_BYTES);
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    refuse(CLI_CODES.CONTRACT_FILE_INVALID, 'the source-set contract is not decodable UTF-8 JSON');
  }
  if (!exactFields(parsed, CONTRACT_FILE_FIELDS) || !Array.isArray(parsed.sources)
      || parsed.sources.length !== EXPECTED_DERIVED_TEXT_COUNT) {
    refuse(CLI_CODES.CONTRACT_FILE_INVALID,
      'the source-set contract must hold a schema version, a set id, and exactly four sources');
  }
  for (const source of parsed.sources) {
    if (!exactFields(source, CONTRACT_FILE_SOURCE_FIELDS)) {
      refuse(CLI_CODES.CONTRACT_FILE_INVALID,
        'each contract source uses one closed field set including approval and permissions');
    }
  }
  const contract = {
    schema_version: parsed.schema_version,
    source_set_id: parsed.source_set_id,
    sources: parsed.sources.map((source) => Object.fromEntries(
      PINNED_SOURCE_FIELDS.map((field) => [field, source[field]]),
    )),
  };
  const posture = new Map(parsed.sources.map((source) => [source.source_id, {
    approval: source.approval,
    permissions: source.permissions,
  }]));
  return { contract, posture };
}

// ------------------------------------------------------------------ loopback model adapter

// One exact origin shape: `http://<host>:<port>` with at most a bare trailing slash. Credentials,
// a path, a query, and a fragment cannot match at all, and the *raw* host text is captured so it
// can be compared against what a URL parser would make of it.
const LOOPBACK_ORIGIN =
  /^http:\/\/(?<host>\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]{3,45}\]):(?<port>\d{1,5})\/?$/u;
// Canonical dotted-quad inside 127/8: no leading zeros, so no octal reading exists.
const IPV4_LOOPBACK = /^127(?:\.(?:0|[1-9][0-9]{0,2})){3}$/u;
const CANONICAL_IPV6_LOOPBACK = '[::1]';
const PORT_NUMBER = /^[1-9][0-9]{0,4}$/u;

/**
 * Accepts only a canonical numeric loopback HTTP origin. Any other target refuses before a request.
 *
 * The check is deliberately made against the *raw* text as well as the parsed URL, because a URL
 * parser is not a validator here: `http://2130706433`, `http://0x7f000001`, and `http://0177.0.0.1`
 * all normalise to `127.0.0.1`, and `http://[0:0:0:0:0:0:0:1]` normalises to `[::1]`. Folding those
 * spellings would mean this function accepts a class of strings that no operator wrote on purpose
 * and that no reader of a command line can evaluate at a glance. `localhost` is refused for the
 * related reason that it is a *name*: what it resolves to is a decision taken somewhere else, in a
 * hosts file or a resolver, and this runner does not delegate the boundary it exists to hold.
 *
 * A missing or default port is refused too. This service has no default port of its own, so
 * `http://127.0.0.1` silently means port 80 — a different endpoint than the one anybody intended.
 */
export function assertLoopbackOllamaTarget(baseUrl) {
  if (typeof baseUrl !== 'string') {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED, 'the model base URL is not one absolute URL');
  }
  const parts = LOOPBACK_ORIGIN.exec(baseUrl);
  if (parts === null) {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED,
      'this runner calls only a plain loopback origin spelled http://<numeric-host>:<port>');
  }
  const { host, port } = parts.groups;
  const numericLoopback = host === CANONICAL_IPV6_LOOPBACK
    || (IPV4_LOOPBACK.test(host) && host.split('.').every((octet) => Number(octet) <= 255));
  if (!numericLoopback) {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED,
      'only canonical numeric loopback hosts — 127.0.0.0/8 or [::1] — are accepted');
  }
  if (!PORT_NUMBER.test(port) || Number(port) > 65535) {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED, 'the model base URL needs one explicit valid port');
  }
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED, 'the model base URL is not one absolute URL');
  }
  // The parser must agree with the raw text. A disagreement is exactly the ambiguity above.
  if (url.protocol !== 'http:' || url.username !== '' || url.password !== ''
      || url.search !== '' || url.hash !== '' || url.pathname !== '/'
      || url.hostname !== host || url.port !== port) {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED,
      'the model base URL carries a non-canonical host, a port default, credentials, a path, '
      + 'a query, or a fragment');
  }
  return `http://${host}:${port}`;
}

/** One deterministic prompt text. The lane commits to the request object, not to this rendering. */
export function renderPromptText(request) {
  const lines = [request.instruction, '', '## 질문', request.question_text, '', '## 근거'];
  for (const capsule of request.evidence) {
    lines.push(
      `- ${capsule.evidence_id} | ${capsule.source_title} | ${capsule.source_revision} `
      + `| page ${capsule.page_number}`,
      capsule.text,
    );
  }
  lines.push('', '## 출력 형식(JSON only)');
  for (const [key, value] of Object.entries(request.output_schema)) lines.push(`- ${key}: ${value}`);
  return `${lines.join('\n')}\n`;
}

function renderExpansionPromptText(request) {
  return [
    request.instruction,
    '',
    '## 질문',
    request.question_text,
    '',
    `## 최대 검색어 수: ${request.max_terms}`,
    '## 출력 형식(JSON only)',
    ...Object.entries(request.output_schema).map(([key, value]) => `- ${key}: ${value}`),
    '',
  ].join('\n');
}

const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// ------------------------------------------------------------------ bounded response reading
//
// Nothing about a provider reply is trusted for its size. `response.json()` would read and parse a
// body of unbounded length into this process before a single check could run, so it is never used:
// the bytes are counted first, the decode is fatal, and the parse happens last.
//
// The ceilings below are derived from the closed output schema this lane accepts, not guessed. At
// most 8 sections, each with a 120-character heading, 4000 characters of prose, and 8 evidence
// ids, is about 33 000 UTF-16 units; at three bytes per character — the worst UTF-8 case for the
// Korean and Latin text this lane renders — that is under 100 000 bytes. Each bound sits above the
// widest legal reply with margin and far below a size that could exhaust this process.
export const MAX_PROVIDER_RESPONSE_BYTES = 262144;
export const MAX_MESSAGE_CONTENT_BYTES = 131072;
export const MAX_MESSAGE_CONTENT_CHARS = 49152;

const CONTENT_LENGTH_VALUE = /^[0-9]{1,15}$/u;

/** The declared body length, or `null` when the response declares none. */
function declaredContentLength(response) {
  const headers = response?.headers;
  if (headers === null || typeof headers !== 'object' || typeof headers.get !== 'function') {
    return null;
  }
  let declared;
  try {
    declared = headers.get('content-length');
  } catch {
    refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response headers could not be read');
  }
  if (declared === null || declared === undefined) return null;
  if (typeof declared !== 'string' || !CONTENT_LENGTH_VALUE.test(declared)) {
    refuse(CLI_CODES.MODEL_CALL_REFUSED,
      'the loopback model declared a content length this adapter will not interpret');
  }
  return Number(declared);
}

/** Reads a streamed body with a running byte counter, cancelling the moment the cap is crossed. */
async function readBoundedStream(body) {
  let reader;
  try {
    reader = body.getReader();
  } catch {
    refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response body could not be opened');
  }
  const chunks = [];
  let total = 0;
  let overflow = false;
  let failed = false;
  for (;;) {
    let step;
    try {
      step = await reader.read();
    } catch {
      failed = true;
      break;
    }
    if (!plainObject(step)) { failed = true; break; }
    if (step.done === true) break;
    if (!(step.value instanceof Uint8Array)) { failed = true; break; }
    total += step.value.byteLength;
    if (total > MAX_PROVIDER_RESPONSE_BYTES) { overflow = true; break; }
    // A copy, not a view: the chunk's backing buffer belongs to the stream and may be reused.
    chunks.push(Buffer.from(step.value));
  }
  if (overflow || failed) {
    try {
      await reader.cancel();
    } catch { /* the stream is already unusable; nothing further is read from it */ }
    refuse(CLI_CODES.MODEL_CALL_REFUSED, overflow
      ? 'the loopback model streamed a response over the accepted byte ceiling'
      : 'the loopback model response body could not be read');
  }
  return Buffer.concat(chunks, total);
}

/** The response body as bytes, bounded at every path a body can arrive by. */
async function readBoundedResponseBytes(response) {
  const declared = declaredContentLength(response);
  if (declared !== null && declared > MAX_PROVIDER_RESPONSE_BYTES) {
    refuse(CLI_CODES.MODEL_CALL_REFUSED,
      'the loopback model declared a response over the accepted byte ceiling');
  }
  const body = response.body;
  if (plainObject(body) && typeof body.getReader === 'function') {
    return readBoundedStream(body);
  }
  if (typeof response.arrayBuffer === 'function') {
    let bytes;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
    } catch {
      refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response body could not be read');
    }
    if (bytes.length > MAX_PROVIDER_RESPONSE_BYTES) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model returned a response over the accepted byte ceiling');
    }
    return bytes;
  }
  if (typeof response.text === 'function') {
    // A client that exposes only text has already decoded, so this bound is taken on the
    // re-encoded bytes and cannot prove what crossed the socket. Real `fetch` always exposes a
    // stream, so nothing but an injected client reaches this branch.
    let text;
    try {
      text = await response.text();
    } catch {
      refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response body could not be read');
    }
    if (typeof text !== 'string') {
      refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response body was not text');
    }
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length > MAX_PROVIDER_RESPONSE_BYTES) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model returned a response over the accepted byte ceiling');
    }
    return bytes;
  }
  refuse(CLI_CODES.MODEL_CALL_REFUSED,
    'the loopback model response exposed no bounded body reader');
}

/** Bytes, then bound, then fatal UTF-8, then parse — in that order and no other. */
async function readBoundedResponseJson(response) {
  const bytes = await readBoundedResponseBytes(response);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response was not decodable UTF-8');
  }
  try {
    return JSON.parse(text);
  } catch {
    refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response was not decodable JSON');
  }
}

/**
 * A stateless, tool-free, loopback-only Ollama chat adapter.
 *
 * Each call is one independent request: one user message, no conversation id, no prior context,
 * no tools, no system history. Nothing about a previous call is reused, and no response body is
 * logged or persisted.
 *
 * The returned adapter is one plain own-data object with own enumerable data functions, which is
 * the shape the hardened lane validates: an accessor could hand the lane one value at validation
 * and another at call time, so it would be refused there rather than tolerated.
 *
 * Nothing here fills a gap. A reply the provider marks unfinished, a reply whose content is not a
 * string, and content that is not one JSON object are refusals, not partial answers to complete.
 */
export function createLoopbackOllamaAnswerModel(options = {}) {
  const origin = assertLoopbackOllamaTarget(options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL);
  const model = options.model ?? EXACT_ANSWER_MODEL;
  if (model !== EXACT_ANSWER_MODEL) {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED, `this adapter serves exactly ${EXACT_ANSWER_MODEL}`);
  }
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeout_ms;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED,
      `a request timeout must be one integer from 1 to ${MAX_TIMEOUT_MS} milliseconds`);
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED, 'no HTTP client is available for the loopback adapter');
  }
  const chatUrl = `${origin}${OLLAMA_CHAT_PATH}`;
  if (new URL(chatUrl).pathname !== OLLAMA_CHAT_PATH) {
    refuse(CLI_CODES.MODEL_TARGET_REFUSED, 'the composed chat endpoint is not the exact API path');
  }

  const call = async (promptText) => {
    let response;
    try {
      response = await fetchImpl(chatUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Validating the origin only pins where the first request goes. A 307/308 from that
        // origin would replay this method and this body — the prompt — at whatever host the
        // redirect names, so "loopback only" holds only if a redirect is an error, not a hop.
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: promptText }],
          stream: false,
          keep_alive: OLLAMA_KEEP_ALIVE,
          format: 'json',
          options: { temperature: 0, seed: 0 },
        }),
      });
    } catch {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model request failed or timed out; no provider text is echoed');
    }
    if (response?.ok !== true) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model returned a non-success status; no provider body is echoed');
    }
    const body = await readBoundedResponseJson(response);
    if (!plainObject(body)) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response was not one JSON object');
    }
    // A non-streaming reply reports `done`. An explicitly unfinished generation is a truncation,
    // and a truncation completed on this side would be an answer the model never finished giving.
    if (Object.hasOwn(body, 'done') && body.done !== true) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model reported an unfinished generation');
    }
    // Ollama's chat reply names the model it served. When the field is present it must name this
    // one; when it is absent the reply is still accepted, because the request already pinned the
    // model on the way out and nothing in either receipt claims provider-side verification. That
    // asymmetry is the honest one: a named mismatch is evidence, a silent reply is not.
    if (Object.hasOwn(body, 'model') && body.model !== model) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model reply names a different model than this runner serves');
    }
    const content = plainObject(body.message) ? body.message.content : undefined;
    if (typeof content !== 'string' || content.length === 0) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model returned no message content');
    }
    if (content.length > MAX_MESSAGE_CONTENT_CHARS
        || Buffer.byteLength(content, 'utf8') > MAX_MESSAGE_CONTENT_BYTES) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model returned message content over the accepted ceiling');
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model did not return one JSON object; no provider text is echoed');
    }
    if (!plainObject(parsed)) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model content was not one JSON object; no provider text is echoed');
    }
    return parsed;
  };

  return Object.freeze({
    descriptor: {
      adapter_id: 'loopback_ollama_chat',
      adapter_revision: OLLAMA_ADAPTER_REVISION,
      stateless: true,
      tools_enabled: false,
      history_enabled: false,
    },
    composeAnswer: (request) => call(renderPromptText(request)),
    proposeQueryExpansion: (request) => call(renderExpansionPromptText(request)),
  });
}

// ------------------------------------------------------------------ output target shape

// The reserved DOS device names, matched with or without an extension because `nul.json` opens the
// NUL device just as `nul` does. `com0`/`lpt0` are not devices; the superscript digits are, because
// Windows folds them to 1/2/3.
const WINDOWS_RESERVED =
  /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³])(?:\.|$)/iu;
const PATH_SEPARATOR = /[\\/]/u;
const DRIVE_DESIGNATOR = /^[A-Za-z]:$/u;
const PATH_CONTROL = /[\u0000-\u001f\u007f]/u;
const TRAILING_DOT_OR_SPACE = /[. ]$/u;

/**
 * Refuses an output target whose spelling and whose meaning on disk can differ.
 *
 * Every rule here exists because the name would otherwise not be the file:
 *
 *   `host.txt:stream`   an alternate data stream. The bytes land inside another file, and the
 *                       create-only open still succeeds, so nothing downstream would notice.
 *   `nul`, `con.json`   a character device. It accepts a write, reports success, and keeps nothing.
 *   `answer.json.`      Windows strips trailing dots and spaces, so this can name `answer.json` —
 *                       or, through a long-path form, a file no other tool can open.
 *   `..`                a traversal segment: the target is decided by where the path starts, not
 *                       by what it says.
 *   `\\server\share`    a UNC or device-namespace root, which is a remote or device write.
 *   `a//b`, `a/b/`      an empty segment: two spellings for one location, or no final name at all.
 */
export function assertWritableOutputTarget(path) {
  if (typeof path !== 'string' || path.length === 0 || PATH_CONTROL.test(path)) {
    refuse(CLI_CODES.OUTPUT_REFUSED, 'an output target must be one non-empty control-free path');
  }
  if (PATH_SEPARATOR.test(path.charAt(0)) && PATH_SEPARATOR.test(path.charAt(1))) {
    refuse(CLI_CODES.OUTPUT_REFUSED, 'UNC and device-namespace roots are not output files');
  }
  const segments = path.split(PATH_SEPARATOR);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.length === 0) {
      // Only a leading root separator may produce an empty segment.
      if (index !== 0) {
        refuse(CLI_CODES.OUTPUT_REFUSED, 'an output path carries an empty or trailing segment');
      }
      continue;
    }
    if (segment === '..') {
      refuse(CLI_CODES.OUTPUT_REFUSED, 'a traversal segment is not an output target');
    }
    if (index === 0 && DRIVE_DESIGNATOR.test(segment)) continue;
    if (segment.includes(':')) {
      refuse(CLI_CODES.OUTPUT_REFUSED,
        'an alternate data stream or drive-relative name is not an output file');
    }
    if (TRAILING_DOT_OR_SPACE.test(segment)) {
      refuse(CLI_CODES.OUTPUT_REFUSED,
        'a trailing dot or space names a different file than it spells');
    }
    if (WINDOWS_RESERVED.test(segment)) {
      refuse(CLI_CODES.OUTPUT_REFUSED, 'reserved device names are not output files');
    }
  }
  return path;
}

// ------------------------------------------------------------------ create-only output transaction

/**
 * Proves that `fd` and `path` are the same newly created, exclusively named ordinary file.
 *
 * Identity is the only thing standing between a rollback and somebody else's data, so it is read
 * exactly — through the same singly named ordinary-file predicate the input reader uses — or not
 * at all.
 */
function ownedFileIdentity(fd, path) {
  let held;
  let named;
  try {
    held = fstatSync(fd, { bigint: true });
    named = lstatSync(path, { bigint: true });
  } catch {
    return null;
  }
  return oneNamedOrdinaryFile(held, named) ? identityOf(held) : null;
}

/** Whether `claim.path` still names the exact file this run created, with no second name. */
function stillOwns(claim) {
  let named;
  try {
    named = lstatSync(claim.path, { bigint: true });
  } catch {
    return false;
  }
  return named.isFile() && named.nlink === 1n
    && sameIdentity(claim.identity, identityOf(named));
}

/**
 * The two explicit outputs as one staged-then-committed unit.
 *
 * Two files on one filesystem cannot be made to appear atomically, so this does the next honest
 * thing: both are created exclusively before the model is called, both are written and flushed
 * before either is closed, and every path is checked against the file this run actually created
 * before it is either kept or removed. What cannot be made atomic is reported instead of glossed:
 * a run that loses an output ends in `partial_unknown` with exact counts and removes nothing it
 * does not own.
 */
function createOutputTransaction(hook) {
  const claims = [];
  const ledger = {
    requested: 0, claimed: 0, completed: 0, rolled_back: 0, unknown: 0,
  };
  let settled = false;

  const fire = (phase, index) => {
    if (hook === null) return;
    try {
      hook(phase, index);
    } catch {
      refuse(CLI_CODES.OUTPUT_COMMIT_FAILED, 'the test-only output checkpoint aborted this run');
    }
  };

  /** Closes our handle first, then removes the file only if the path still names it. */
  const withdraw = (claim) => {
    if (claim.fd !== null) {
      try {
        closeSync(claim.fd);
      } catch { /* the handle is already gone; the identity check below still decides */ }
      claim.fd = null;
    }
    if (claim.identity === null || !stillOwns(claim)) return 'unknown';
    try {
      unlinkSync(claim.path);
      return 'rolled_back';
    } catch {
      return 'unknown';
    }
  };

  return {
    declareRequested(count) {
      ledger.requested = count;
    },

    stage(path, kind) {
      assertWritableOutputTarget(path);
      let fd;
      try {
        fd = openSync(path, 'wx');
      } catch {
        refuse(CLI_CODES.OUTPUT_REFUSED,
          'an explicit output could not be created without overwriting an existing path');
      }
      // Recorded before it is verified, so a target that fails verification is still withdrawn
      // by the same identity-checked path as everything else.
      const claim = {
        kind, path, fd, identity: ownedFileIdentity(fd, path),
      };
      claims.push(claim);
      if (claim.identity === null) {
        refuse(CLI_CODES.OUTPUT_REFUSED,
          'an explicit output did not resolve to one newly created ordinary file this run owns');
      }
      if (claims.some((other) => other !== claim && sameIdentity(other.identity, claim.identity))) {
        refuse(CLI_CODES.OUTPUT_REFUSED,
          'the two explicit outputs resolve to one and the same file');
      }
      ledger.claimed += 1;
    },

    checkpoint(phase) {
      fire(phase);
    },

    /** Writes and flushes every staged output before any of them is closed. */
    write(bytesByKind) {
      claims.forEach((claim, index) => {
        fire('before_write', index);
        try {
          const buffer = Buffer.from(bytesByKind[claim.kind], 'utf8');
          let written = 0;
          while (written < buffer.length) {
            written += writeSync(claim.fd, buffer, written, buffer.length - written, written);
          }
          fsyncSync(claim.fd);
        } catch {
          refuse(CLI_CODES.OUTPUT_COMMIT_FAILED,
            'a staged explicit output could not be written and flushed');
        }
        fire('after_write', index);
      });
    },

    /**
     * Closes every handle, then proves each path still names the file this run wrote.
     *
     * If any output was lost, nothing foreign is touched: the outputs still owned are withdrawn,
     * the rest is counted unknown, and the command refuses rather than presenting a partial set
     * of files as a completed answer.
     */
    commit() {
      for (const claim of claims) {
        if (claim.fd !== null) {
          try {
            closeSync(claim.fd);
          } catch { /* the bytes were already flushed; ownership is decided below */ }
          claim.fd = null;
        }
      }
      fire('committed');
      const retained = claims.filter((claim) => stillOwns(claim));
      if (retained.length !== claims.length) {
        for (const claim of claims) {
          if (retained.includes(claim)) ledger[withdraw(claim)] += 1;
          else ledger.unknown += 1;
        }
        settled = true;
        refuse(CLI_CODES.OUTPUT_COMMIT_FAILED,
          'a written explicit output is no longer the file this run created');
      }
      ledger.completed = claims.length;
      settled = true;
    },

    /** Idempotent. A settled transaction is final: nothing below it can withdraw a kept file. */
    rollback() {
      if (settled) return;
      for (const claim of claims) ledger[withdraw(claim)] += 1;
      settled = true;
    },

    persistence() {
      const {
        requested, claimed, completed, rolled_back: rolledBack, unknown,
      } = ledger;
      let state;
      if (requested === 0) state = 'not_requested';
      else if (completed === requested && unknown === 0) state = 'complete';
      else if (completed === 0 && unknown === 0 && rolledBack === claimed) state = 'rolled_back';
      else state = 'partial_unknown';
      return {
        state,
        requested,
        claimed,
        completed,
        rolled_back: rolledBack,
        unknown,
        persistent_file_writes: completed,
      };
    },
  };
}

// ------------------------------------------------------------------ CLI

const HOLD_UNSPECIFIED = 'SE_CORE_SOURCEBOUND_ANSWER_HOLD_UNSPECIFIED';

/**
 * One command execution receipt: what this process did, as distinct from what the lane decided.
 *
 * The lane's own receipt is a payload-free verification record of an in-memory evaluation, and it
 * truthfully reports zero writes because the lane performs none. It is also what `--receipt-out`
 * persists, so it cannot describe its own persistence without describing a file that does not
 * exist yet. Persistence therefore lives here, on stderr, next to it and never inside it.
 *
 * Closed metadata only: no prompt, no body, no answer prose, and no local path.
 */
function commandExecutionReceipt(state) {
  const laneReceipt = state.laneReceipt ?? null;
  const passed = state.result === 'PASS';
  return {
    schema_version: COMMAND_RECEIPT_SCHEMA_VERSION,
    ok: passed,
    result: state.result,
    lane_ran: laneReceipt !== null,
    lane_id: laneReceipt?.lane_id ?? null,
    // Which route this command was asked to take, and whether the lane actually asserted the
    // fixed-benchmark identity. The second is read back out of the lane receipt and is never
    // asserted here: this process supplies the pin, so it is not a witness to its own claim. A
    // generic run says `generic` and `false`, which is the whole point of keeping the two apart.
    benchmark: {
      mode: state.benchmarkMode,
      pin_supplied: state.benchmarkMode === 'pinned',
      fixed_benchmark_identity_asserted:
        laneReceipt?.source_set?.benchmark_pin?.fixed_benchmark_identity_asserted === true,
    },
    blocker_code: passed
      ? null
      : (state.blockerCode ?? laneReceipt?.blocker_code ?? HOLD_UNSPECIFIED),
    blocker_stage: passed ? null : (state.blockerStage ?? laneReceipt?.blocker_stage ?? 'cli'),
    model_call_occurred: state.modelInvocations > 0,
    model_invocation_count: state.modelInvocations,
    answer_rendered: state.answerRendered,
    answer_emitted_to_stdout: state.answerEmitted,
    persistence: state.persistence,
    // The lane's own zero-write claim, kept under its own name so it can never be read as a
    // statement about the files this command left behind.
    lane_internal_writes: {
      filesystem_writes: laneReceipt?.writes?.filesystem_writes ?? 0,
      erp_writes: laneReceipt?.writes?.erp_writes ?? 0,
    },
    claim_ceiling: 'observed',
    candidate_disposition: 'external_advisory_candidate',
    ...(SHA256.test(laneReceipt?.computed_source_set_sha256 ?? '')
      ? { computed_source_set_sha256: laneReceipt.computed_source_set_sha256 }
      : {}),
  };
}

/**
 * Validates the caller's io surface and returns its seams, each taken from one descriptor read.
 *
 * Nothing on the surface is read as a *property* — not here and not afterwards. One
 * `getOwnPropertyDescriptors` call is the whole reflection, so a getter never runs, and each seam
 * is bound once from that snapshot and used from there for the rest of the command. A property
 * read would be two reads of a caller-controlled slot: one that passes validation and one that
 * actually gets called, which is precisely the substitution this closure exists to prevent.
 *
 * The surface is closed in both key spaces. String keys must name one of the three public seams;
 * the only own symbol accepted is this module's test checkpoint, which no argument, config file,
 * or JSON value can carry, and every accepted key must be an own enumerable data property — an
 * inherited, hidden, or accessor seam is refused rather than tolerated.
 */
function snapshotIoSurface(io) {
  if (io === null || typeof io !== 'object' || Array.isArray(io)
      || Object.getPrototypeOf(io) !== Object.prototype) {
    refuse(CLI_CODES.IO_SURFACE_INVALID, 'the runner io surface must be one plain object');
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(io);
  } catch {
    refuse(CLI_CODES.IO_SURFACE_INVALID, 'the runner io surface could not be reflected');
  }
  const seams = {
    answerModel: null, stdoutWrite: null, stderrWrite: null, outputHook: null,
  };
  for (const key of Reflect.ownKeys(descriptors)) {
    const known = typeof key === 'symbol' ? key === TEST_ONLY_OUTPUT_HOOK : IO_FIELDS.has(key);
    if (!known) {
      refuse(CLI_CODES.IO_SURFACE_INVALID, 'the runner io surface is one closed field set');
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      refuse(CLI_CODES.IO_SURFACE_INVALID,
        'every io seam must be one own enumerable data property');
    }
    const { value } = descriptor;
    if (key === TEST_ONLY_OUTPUT_HOOK) {
      if (typeof value !== 'function') {
        refuse(CLI_CODES.IO_SURFACE_INVALID,
          'the test-only output checkpoint must be one function');
      }
      seams.outputHook = value;
    } else if (key === 'answerModel') {
      if (!plainObject(value)) {
        refuse(CLI_CODES.IO_SURFACE_INVALID, 'an injected answer model must be one object');
      }
      seams.answerModel = value;
    } else {
      if (typeof value !== 'function') {
        refuse(CLI_CODES.IO_SURFACE_INVALID, 'an io sink must be one function');
      }
      seams[key] = value;
    }
  }
  return Object.freeze(seams);
}

export async function runSeCoreSourceboundAnswerCli(argv, io = {}) {
  // The process sinks are the starting point, not a fallback chosen after peeking at the caller's
  // object. Nothing on `io` is read until it has been validated, so a surface that is refused can
  // only ever be reported through this process's own stderr.
  let stdoutWrite = (value) => process.stdout.write(value);
  let stderrWrite = (value) => process.stderr.write(value);
  let transaction = createOutputTransaction(null);
  let laneReceipt = null;
  let modelInvocations = 0;
  let answerRendered = false;
  let benchmarkMode = 'generic';
  let reported = false;

  const report = (state) => {
    reported = true;
    try {
      stderrWrite(`${JSON.stringify(commandExecutionReceipt({
        laneReceipt,
        modelInvocations,
        answerRendered,
        benchmarkMode,
        persistence: transaction.persistence(),
        ...state,
      }))}\n`);
    } catch { /* the caller's own sink failed; there is nowhere left to report it */ }
  };

  try {
    const seams = snapshotIoSurface(io);
    if (seams.stdoutWrite !== null) stdoutWrite = seams.stdoutWrite;
    if (seams.stderrWrite !== null) stderrWrite = seams.stderrWrite;
    transaction = createOutputTransaction(seams.outputHook);
    const { flags, derivedText } = parseArgs(argv);
    // Declared from the argument alone, so a pin that is supplied and then refused is still
    // reported as the route this command was asked to take.
    benchmarkMode = Object.hasOwn(flags, '--benchmark-pin') ? 'pinned' : 'generic';
    const benchmarkPin = benchmarkMode === 'pinned'
      ? readBenchmarkPinFile(flags['--benchmark-pin'])
      : null;
    const { contract, posture } = readSourceSetContractFile(flags['--source-set-contract']);
    const contractIds = new Set(contract.sources.map((source) => source.source_id));
    if (derivedText.some((entry) => !contractIds.has(entry.source_id))) {
      refuse(CLI_CODES.ARGUMENT_INVALID,
        'every --derived-text source_id must name one source in the frozen contract');
    }
    const bytesBySource = new Map(derivedText.map(
      (entry) => [entry.source_id, readBoundedInputBytes(entry.path, MAX_DERIVED_TEXT_BYTES)],
    ));
    const questionBytes = readBoundedInputBytes(flags['--question'], MAX_QUESTION_BYTES);
    const sources = contract.sources.map((source) => {
      const declared = posture.get(source.source_id);
      return {
        ...source,
        derived_text_bytes: bytesBySource.get(source.source_id),
        approval: declared?.approval,
        permissions: declared?.permissions,
      };
    });

    const answerModel = seams.answerModel ?? createLoopbackOllamaAnswerModel({
      baseUrl: flags['--ollama-url'] ?? DEFAULT_OLLAMA_BASE_URL,
      model: flags['--model'] ?? EXACT_ANSWER_MODEL,
      timeoutMs: Number(flags['--timeout-ms'] ?? DEFAULTS.timeout_ms),
    });

    // Staged before the lane runs, so an occupied or ambiguous output costs zero model calls.
    const requested = OUTPUT_FLAGS.filter(([flag]) => Object.hasOwn(flags, flag));
    transaction.declareRequested(requested.length);
    for (const [flag, kind] of requested) transaction.stage(flags[flag], kind);
    transaction.checkpoint('staged');

    const invocation = {
      questionBytes,
      expectedQuestionSha256: flags['--question-sha256'],
      expectedQuestionBytes: Number(flags['--question-bytes']),
      corpus: {
        sourceSetContract: contract,
        expectedSourceSetSha256: flags['--source-set-sha256'],
        sources,
      },
      scope: {
        evaluation_only: true,
        point_in_time: flags['--point-in-time'],
        actual_project_data_included: false,
        private_data_included: false,
        authority_to_approve: false,
        authority_to_create_task: false,
        authority_to_promote_canon: false,
        action_execution_allowed: false,
      },
      retrieval: {
        max_evidence: Number(flags['--max-evidence'] ?? DEFAULTS.max_evidence),
        max_per_source: Number(flags['--max-per-source'] ?? DEFAULTS.max_per_source),
      },
      queryExpansion: {
        requested: (flags['--query-expansion'] ?? DEFAULTS.query_expansion) === 'advisory',
        max_terms: 6,
      },
    };
    // Two different claims, two different entry points. Without a pin this stays the generic
    // validated-contract API and says so; with one it is the pinned benchmark gate, which binds
    // the full runtime cohort material — identity, bytes, approval, permissions — to a commitment
    // this command did not derive, and refuses before any model call when they disagree.
    const run = benchmarkPin === null
      ? await runSeCoreSourceboundAnswerLane(invocation, { answerModel })
      : await runSeCorePinnedBenchmarkAnswerLane(invocation, { answerModel }, benchmarkPin);
    laneReceipt = run.receipt;
    modelInvocations = run.receipt?.model?.invocation_count ?? 0;
    if (run.receipt.result !== 'PASS') {
      transaction.rollback();
      report({ result: 'HOLD', answerEmitted: false });
      return run;
    }
    answerRendered = true;
    const bytes = {
      answer: canonicalSeCoreSourceboundAnswerJson(run),
      receipt: canonicalSeCoreSourceboundReceiptJson(run),
    };
    transaction.write(bytes);
    transaction.commit();

    // Past this line the two outputs are final. No sink below can withdraw them, and no sink was
    // called above, so nothing a caller does with stdout or stderr can reach a file this run owns
    // while that file is still rollback-eligible.
    stdoutWrite(bytes.answer);
    stderrWrite(bytes.receipt);
    report({ result: 'PASS', answerEmitted: true });
    return run;
  } catch (error) {
    transaction.rollback();
    const blockerCode = error instanceof ContractError
      ? error.code
      : 'SE_CORE_SOURCEBOUND_ANSWER_CLI_FAILED';
    if (error instanceof ContractError) {
      error.detail = {
        ...(error.detail ?? {}),
        model_invocation_count: modelInvocations,
        persistence: transaction.persistence(),
      };
    }
    if (!reported) {
      report({
        result: 'HOLD', blockerCode, blockerStage: 'cli', answerEmitted: false,
      });
    }
    throw error;
  }
}

// Re-exported for the one-time, out-of-band authoring of a source-set commitment and a benchmark
// pin. Neither is ever computed during a run: a pin the runner derived from the corpus under test
// would prove nothing about that corpus.
export { seCoreSourceCohortSha256, seCoreSourceSetContractSha256 };

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const run = await runSeCoreSourceboundAnswerCli(process.argv.slice(2));
    if (run.receipt.result !== 'PASS') process.exitCode = 2;
  } catch {
    // One closed command execution receipt was already written to stderr by the call above.
    process.exitCode = 2;
  }
}
