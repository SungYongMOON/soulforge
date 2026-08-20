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
import { types } from 'node:util';

import {
  OUTPUT_SAFETY_REASONS,
  canonicalSeCoreSourceboundAnswerJson,
  canonicalSeCoreSourceboundReceiptJson,
  runSeCorePinnedBenchmarkAnswerLane,
  runSeCoreSourceboundAnswerLane,
  seCoreSourceCohortSha256,
  seCoreSourceSetContractSha256,
  statementSelectionResponseJsonSchema,
} from '../evaluation/se_core_sourcebound_answer_lane.mjs';
import { ContractError } from '../kernel/errors.mjs';

export const EXACT_ANSWER_MODEL = 'qwen3.5:9b';
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
// v3: the prompt carries host-owned S-ids and entire exact chunks, while the response schema
// permits only statement ids and relation labels. No provider-authored answer prose exists.
export const OLLAMA_ADAPTER_REVISION = 'soulforge.se_core_sourcebound_answer_ollama_adapter.v3';
export const OLLAMA_KEEP_ALIVE = '5m';
export const OLLAMA_CHAT_PATH = '/api/chat';
// The reasoning channel, pinned off rather than inherited.
//
// The exact model this adapter serves is thinking-capable, and Ollama turns thinking on by
// default for a model that reports the capability. A request that states no preference therefore
// spends its generation budget on a channel this lane never reads: only `message.content` is
// ever taken from a reply. Left at the default, the reasoning block alone exhausted the window
// and the reply arrived `done: true`, `done_reason: "length"`, with empty content. One stateless
// JSON emission is the whole contract here, so the channel that is not part of it is turned off.
export const OLLAMA_THINK = false;
// The context window, pinned for the same reason and one more.
//
// An inherited window is not merely smaller than this lane needs: when a prompt does not fit,
// Ollama drops the front of it and answers from the remainder, with no field in the reply that
// says so. The receipt commits to the evidence the prompt carried, so a silently trimmed prompt
// would make that commitment false.
//
// The value is the smallest power-of-two window measured to hold this lane's widest legal
// prompt. That prompt was the lane's own ceilings rendered at once - 24 evidence capsules of 900
// characters, each carrying a title and a revision at the 400-character metadata ceiling, and a
// question at the 8192-byte ceiling - and it measured 31 939 prompt tokens on the served model.
// The same prompt reported the same count against a 65 536 window, so that figure is a true
// length and not itself a trimmed one. 16 384 does not hold it; 32 768 does. The model-visible
// capsule has since lost its title and revision lines, so the same ceilings now render strictly
// fewer tokens: 31 939 stands as a measured upper bound on the widest legal prompt rather than a
// fresh measurement of it, and the window that held the larger prompt holds the smaller one.
//
// The current reply is much smaller than the historical free-prose reply: it contains one result
// token and at most eight statement-id/relation pairs. The 32 768 window is therefore retained as
// a conservative prompt bound, not as a fresh claim that the current prompt and reply fill it. A
// provider-side length stop is still refused rather than presented as a complete selection. The
// lane's own default retrieval is 6 statements, well under the ceiling this bound is sized for.
export const OLLAMA_NUM_CTX = 32768;
// Prompt truncation, refused by the daemon rather than inferred from the reply.
//
// The reply cannot be read for this. Measured on the served daemon, a 3413-token prompt sent
// against a 2048-token window returned HTTP 200 with `prompt_eval_count: 1026` - below the
// window rather than at it - so no threshold on that field can separate a trimmed prompt from an
// ordinary short one. Asking the daemon to refuse is exact instead of heuristic: the same
// oversize request with this pinned returns a non-success status and performs no generation,
// which the status check below already turns into a refusal that costs one call and writes
// nothing.
export const OLLAMA_TRUNCATE_PROMPT = false;
// The command execution receipt is a *closed* top-level field set, so a reader keyed to it breaks
// on a member it has never seen rather than ignoring one. `model_refusal_reason` was such a member,
// which is why this left v0; `output_safety_reason` is the next one, which is why it is now v2. A
// version that quietly grew a field would be a version no reader could trust.
export const COMMAND_RECEIPT_SCHEMA_VERSION =
  'soulforge.se_core_sourcebound_answer_command_receipt.v2';

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

/**
 * One deterministic prompt text. The lane commits to the request object, not to this rendering.
 *
 * A statement renders as its host id and its entire exact normalized chunk. Citation metadata
 * stays behind the lane seam. The model selects ids and relations; it never writes answer prose.
 */
export function renderPromptText(request) {
  const lines = [request.instruction, '', '## 질문', request.question_text, '', '## Host statements'];
  for (const statement of request.statements) {
    lines.push(`- ${statement.statement_id}`, statement.excerpt);
  }
  lines.push('', '## 출력 형식(JSON Schema)', JSON.stringify(request.output_schema));
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

// ------------------------------------------------------------------ the requested reply shape
//
// The lane declares its two closed output shapes both in the prompt and as JSON Schema Ollama can
// apply while generating. The provider schema closes fields, enums, bounds, and answer/abstain
// structure. The lane then performs the exact final contract checks, including uniqueness of the
// statement_id property across proposition objects — something JSON Schema `uniqueItems` alone
// does not express. A schema-shaped reply that fails that second stage is still refused.
//
// The bounds are the lane's, restated here for the same reason the byte ceilings above are: a
// bound applied after a reply has already been built is not a bound on how it was built. The
// suite pins each one to the lane's own boundary from both sides, so the two cannot drift apart
// silently.
export const MAX_ANSWER_PROPOSITIONS = 8;
export const MAX_EXPANSION_TERMS = 12;
export const MAX_EXPANSION_TERM_CHARS = 60;
const MIN_EXPANSION_TERM_CHARS = 2;
// Mirrors the lane's S1..S24 vocabulary. An invalid request receives a closed sentinel enum which
// the lane never accepts; this cap is not an open-string fallback or a citation authority.
const MAX_STATEMENT_ID_CHARS = 3;

/** The statement ids this request actually carries, or `null` when it names none usable. */
function retrievedStatementIds(request) {
  const statements = plainObject(request) ? request.statements : undefined;
  if (!Array.isArray(statements) || statements.length === 0) return null;
  const ids = [];
  for (const statement of statements) {
    const id = plainObject(statement) ? statement.statement_id : undefined;
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_STATEMENT_ID_CHARS
        || ids.includes(id)) {
      return null;
    }
    ids.push(id);
  }
  return ids;
}

/**
 * The answer shape this run asks for, bound to the ids this run actually retrieved.
 *
 * Selection ids are why this is worth binding at the provider rather than only checking later: an
 * `enum` of exactly the retrieved ids leaves no spelling for a statement the run never showed the
 * model. When a request names no usable id, the enum contains one closed sentinel which the lane
 * never accepts; there is no open-string fallback. Cross-item id uniqueness remains a lane check.
 */
export function answerResponseJsonSchema(request) {
  return statementSelectionResponseJsonSchema(retrievedStatementIds(request));
}

/**
 * The advisory expansion shape, bound to the caller's own term ceiling.
 *
 * The lane refuses more terms than the caller asked for, not merely more than the lane allows, so
 * the request carries the caller's number and the shape is built from it. A request naming no
 * usable ceiling falls back to the lane ceiling, never above it.
 */
export function expansionResponseJsonSchema(request) {
  const requested = plainObject(request) ? request.max_terms : undefined;
  const maxItems = Number.isSafeInteger(requested) && requested >= 1
    && requested <= MAX_EXPANSION_TERMS ? requested : MAX_EXPANSION_TERMS;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['terms'],
    properties: {
      terms: {
        type: 'array',
        minItems: 1,
        maxItems,
        items: {
          type: 'string',
          minLength: MIN_EXPANSION_TERM_CHARS,
          maxLength: MAX_EXPANSION_TERM_CHARS,
        },
      },
    },
  };
}

// ------------------------------------------------------------------ bounded response reading
//
// Nothing about a provider reply is trusted for its size. `response.json()` would read and parse a
// body of unbounded length into this process before a single check could run, so it is never used:
// the bytes are counted first, the decode is fatal, and the parse happens last.
//
// The v3 selection reply is far smaller than these inherited hard caps. Retaining the lower-level
// byte and character ceilings preserves the established bounded reader while the dynamic JSON
// schema and lane validator impose the much narrower eight-proposition selection contract.
export const MAX_PROVIDER_RESPONSE_BYTES = 262144;
export const MAX_MESSAGE_CONTENT_BYTES = 131072;
export const MAX_MESSAGE_CONTENT_CHARS = 49152;

const CONTENT_LENGTH_VALUE = /^[0-9]{1,15}$/u;

// Every slot this adapter takes from a response, read once and then read from the snapshot.
//
// These cannot be required to be own data the way a caller-supplied object can: a real Fetch
// Response answers `ok`, `headers`, and `body` from prototype getters and `arrayBuffer`/`text`
// from prototype methods. What can be required is that each is read exactly once — a slot read
// twice is a slot that can pass a check with one value and hand a different one to the code that
// uses it — and that a slot which throws becomes this adapter's own fixed refusal rather than a
// provider-authored error travelling out of it with whatever text that error carries.
const RESPONSE_SLOTS = Object.freeze(['ok', 'headers', 'body', 'arrayBuffer', 'text']);

/** One frozen snapshot of the consumed response slots, or `null` if any of them cannot be read. */
function responseSurface(response) {
  if (response === null || typeof response !== 'object') return null;
  const surface = {};
  for (const slot of RESPONSE_SLOTS) {
    try {
      surface[slot] = response[slot];
    } catch {
      return null;
    }
  }
  return Object.freeze(surface);
}

/** The declared body length, or `null` when the response declares none. */
function declaredContentLength(headers) {
  if (headers === null || typeof headers !== 'object') return null;
  let read;
  let declared;
  try {
    read = headers.get;
    if (typeof read !== 'function') return null;
    declared = Reflect.apply(read, headers, ['content-length']);
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

/** The one step shape that ends a stream, so a finished read allocates nothing to say so. */
const FINISHED_STREAM_STEP = Object.freeze({ done: true, value: null });

// The engine's own typed-array reflection, taken once at load time.
//
// A chunk is provider-authored material, so reading `chunk.byteLength` or calling `chunk.set` is a
// dispatch through the provider's object: a proxy trap, an own accessor, or a subclass override
// all run provider code at that point, can answer the byte counter with one number and the copy
// with another, and can throw an error whose text is the provider's. These two intrinsics are
// applied to the chunk instead, so the size this loop counts and the bytes it keeps come from the
// engine. Both refuse an object without the typed-array internal slots rather than consult it.
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE, 'byteLength',
).get;
const TYPED_ARRAY_SET = TYPED_ARRAY_PROTOTYPE.set;

/**
 * `true` only for an ordinary `Uint8Array` — the one chunk shape safe to reflect on directly.
 *
 * `instanceof` is not that check: it answers `true` for a proxy wrapping a `Uint8Array` and for a
 * subclass, and both can intercept every slot read afterwards. A real Fetch stream hands over an
 * exact `Uint8Array` with no own `byteLength`, so requiring exactly that costs a real reader
 * nothing and leaves nothing for a provider object to answer.
 */
function ordinaryChunk(value) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)) return false;
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  if (prototype !== Uint8Array.prototype) return false;
  let customized;
  try {
    customized = Object.getOwnPropertyDescriptor(value, 'byteLength');
  } catch {
    return false;
  }
  return customized === undefined;
}

/** One numeric byte length taken from the intrinsic getter, or `null` when it cannot be taken. */
function chunkByteLength(chunk) {
  let size;
  try {
    size = Reflect.apply(TYPED_ARRAY_BYTE_LENGTH, chunk, []);
  } catch {
    return null;
  }
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

/**
 * One fresh ordinary `Uint8Array` holding `size` bytes copied from `chunk`, or `null` when the
 * copy cannot be made.
 *
 * The copy runs through the intrinsic `set` with a genuine typed array on both sides, which moves
 * bytes from the internal slots and dispatches nothing back to the provider. A chunk whose buffer
 * is gone — detached, transferred, resized out from under the count — fails here rather than
 * yielding a short or stale copy, and the failure is this adapter's own.
 */
function copiedChunkBytes(chunk, size) {
  let copy;
  try {
    copy = new Uint8Array(size);
    Reflect.apply(TYPED_ARRAY_SET, copy, [chunk]);
  } catch {
    return null;
  }
  return copy;
}

/**
 * One snapshot of one `reader.read()` result, or `null` when it is not a step this adapter reads.
 *
 * A step is provider-authored material like every other value at this seam, so it is read the same
 * way: as an ordinary plain object, through own enumerable **data** descriptors, with no accessor
 * invoked and each consumed slot taken exactly once. A getter, a proxy, a custom prototype, and an
 * inherited or hidden slot are all shapes that can run provider code between the check and the use,
 * or answer the byte counter with one chunk and the copy with another, so each is refused here
 * rather than read. A real reader hands back an ordinary `{ value, done }` object and is unaffected.
 *
 * `done` is required to be a boolean rather than merely truthy: a step that does not state its
 * completion as itself has not stated it. `value` is required only of a step that says it is not
 * done, which is exactly the step that carries bytes, and it is returned once so the caller counts
 * and copies the same object it type-checked.
 */
function readerStepSnapshot(step) {
  if (step === null || typeof step !== 'object' || types.isProxy(step)) return null;
  let prototype;
  try {
    prototype = Object.getPrototypeOf(step);
  } catch {
    return null;
  }
  if (prototype !== Object.prototype && prototype !== null) return null;
  const done = ownDataSlot(step, 'done');
  if (done === null || typeof done.value !== 'boolean') return null;
  if (done.value) return FINISHED_STREAM_STEP;
  const value = ownDataSlot(step, 'value');
  if (value === null || !ordinaryChunk(value.value)) return null;
  return { done: false, value: value.value };
}

/** Reads a streamed body with a running byte counter, cancelling the moment the cap is crossed. */
async function readBoundedStream(reader) {
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
    const snapshot = readerStepSnapshot(step);
    if (snapshot === null) { failed = true; break; }
    if (snapshot.done) break;
    // Everything below reads the snapshot and never the step again, and reads the chunk only
    // through the engine's intrinsics and never through a slot the chunk itself could answer.
    const size = chunkByteLength(snapshot.value);
    if (size === null) { failed = true; break; }
    // Counted against what is left before anything is allocated, so one oversized chunk is refused
    // rather than first copied into this process.
    if (size > MAX_PROVIDER_RESPONSE_BYTES - total) { overflow = true; break; }
    // A copy, not a view: the chunk's backing buffer belongs to the stream and may be reused.
    const chunk = copiedChunkBytes(snapshot.value, size);
    if (chunk === null) { failed = true; break; }
    // The copy is what this process now holds, so the counter is only honest if it is the copy's
    // length. A chunk that changed length between the two is not one this call can bound.
    if (chunk.length !== size || chunkByteLength(snapshot.value) !== size) { failed = true; break; }
    total += size;
    chunks.push(chunk);
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
async function readBoundedResponseBytes(response, surface) {
  const declared = declaredContentLength(surface.headers);
  if (declared !== null && declared > MAX_PROVIDER_RESPONSE_BYTES) {
    refuse(CLI_CODES.MODEL_CALL_REFUSED,
      'the loopback model declared a response over the accepted byte ceiling');
  }
  // A body that exposes a stream is read as one. Once it does, this call is committed to that
  // path: a reader that cannot be obtained is a refusal, never a reason to try a second one.
  if (plainObject(surface.body)) {
    let open;
    try {
      open = surface.body.getReader;
    } catch {
      refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response body could not be opened');
    }
    if (typeof open === 'function') {
      let reader;
      try {
        reader = Reflect.apply(open, surface.body, []);
      } catch {
        refuse(CLI_CODES.MODEL_CALL_REFUSED,
          'the loopback model response body could not be opened');
      }
      if (reader === null || typeof reader !== 'object') {
        refuse(CLI_CODES.MODEL_CALL_REFUSED,
          'the loopback model response body could not be opened');
      }
      return readBoundedStream(reader);
    }
  }
  if (typeof surface.arrayBuffer === 'function') {
    let bytes;
    try {
      bytes = Buffer.from(await Reflect.apply(surface.arrayBuffer, response, []));
    } catch {
      refuse(CLI_CODES.MODEL_CALL_REFUSED, 'the loopback model response body could not be read');
    }
    if (bytes.length > MAX_PROVIDER_RESPONSE_BYTES) {
      refuse(CLI_CODES.MODEL_CALL_REFUSED,
        'the loopback model returned a response over the accepted byte ceiling');
    }
    return bytes;
  }
  if (typeof surface.text === 'function') {
    // A client that exposes only text has already decoded, so this bound is taken on the
    // re-encoded bytes and cannot prove what crossed the socket. Real `fetch` always exposes a
    // stream, so nothing but an injected client reaches this branch.
    let text;
    try {
      text = await Reflect.apply(surface.text, response, []);
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
async function readBoundedResponseJson(response, surface) {
  const bytes = await readBoundedResponseBytes(response, surface);
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

export const MODEL_REFUSAL_REASONS = Object.freeze({
  REQUEST_FAILED: 'request_failed_or_timed_out',
  NON_SUCCESS_STATUS: 'non_success_status',
  RESPONSE_UNREADABLE: 'response_surface_unreadable',
  BODY_UNREADABLE: 'response_body_unreadable',
  NOT_ONE_OBJECT: 'response_not_one_json_object',
  REPLY_FIELD_MALFORMED: 'reply_field_not_one_own_value',
  UNFINISHED: 'generation_unfinished',
  STOPPED_ON_BUDGET: 'generation_stopped_on_budget',
  // Deliberately says nothing about *why*. `generation_stopped_on_budget` is a claim about the
  // cause of a truncation, so it is reserved for the one reason that means it; every other
  // spelling — another reason, a wrong type, no reason at all — reports only that the generation
  // did not end normally, and the value itself is never echoed.
  DID_NOT_STOP_NORMALLY: 'generation_did_not_stop_normally',
  MODEL_MISMATCH: 'reply_names_another_model',
  NO_CONTENT: 'no_message_content',
  CONTENT_OVER_CEILING: 'message_content_over_ceiling',
  CONTENT_NOT_ONE_OBJECT: 'message_content_not_one_json_object',
});

/**
 * Reads one own enumerable **data** property, without ever invoking an accessor.
 *
 * Returns a one-element holder so a legitimately `undefined` value stays distinguishable from an
 * absent, inherited, hidden, or accessor-backed slot.
 */
function ownDataSlot(target, key) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(target, key);
  } catch {
    return null;
  }
  if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    return null;
  }
  return { value: descriptor.value };
}

/**
 * One consumed reply field: `{ value }` when the reply carries it as own data or not at all, and
 * `null` when it carries it in any other way.
 *
 * A parsed JSON body cannot hold an accessor, an inherited slot, or a hidden field, so nothing a
 * provider sends can reach the `null` here. This is still the boundary where a value is checked
 * and then used, and a slot that can run code between those two moments is a slot that can answer
 * them differently, so it is refused rather than read.
 */
function consumedReplyField(target, key) {
  const slot = ownDataSlot(target, key);
  if (slot !== null) return slot;
  let present;
  try {
    present = Reflect.has(target, key);
  } catch {
    present = true;
  }
  return present ? null : { value: undefined };
}

const MALFORMED_REPLY_FIELD = Object.freeze({
  reason: MODEL_REFUSAL_REASONS.REPLY_FIELD_MALFORMED,
  message: 'a consumed field of the loopback model reply is not one own value; nothing it holds '
    + 'is echoed',
});

/**
 * The message content of one finished non-streaming reply, or the refusal that reply earns.
 *
 * Returns `{ content }` or `{ reason, message }`. It records nothing: the adapter stays the only
 * place a refusal is remembered, which keeps this one pure function the suite can drive with the
 * shapes a JSON parse can never produce.
 *
 * Both completion fields are *required*, not merely checked when present. `done: true` is the
 * reply saying the generation finished, and `done_reason: "stop"` is it saying the model ended it
 * rather than a budget doing so — the observed benchmark failure arrived `done: true` with
 * `done_reason: "length"` and empty content, which is exactly the pair of claims that separates a
 * finished answer from a truncated one. A reply that states neither has not made either claim, so
 * it is held rather than completed on this side.
 *
 * The declared model keeps its stated asymmetry: a reply that names one must name the served one,
 * and a reply that names none is still accepted, because the request already pinned the model and
 * neither receipt claims provider-side verification.
 */
export function finishedReplyContent(body, servedModel) {
  if (!plainObject(body)) {
    return {
      reason: MODEL_REFUSAL_REASONS.NOT_ONE_OBJECT,
      message: 'the loopback model response was not one JSON object',
    };
  }
  const done = consumedReplyField(body, 'done');
  const stopReason = consumedReplyField(body, 'done_reason');
  const declaredModel = consumedReplyField(body, 'model');
  const message = consumedReplyField(body, 'message');
  if (done === null || stopReason === null || declaredModel === null || message === null) {
    return MALFORMED_REPLY_FIELD;
  }
  if (done.value !== true) {
    return {
      reason: MODEL_REFUSAL_REASONS.UNFINISHED,
      message: 'the loopback model did not report one finished generation',
    };
  }
  if (stopReason.value !== 'stop') {
    const onBudget = stopReason.value === 'length';
    return {
      reason: onBudget
        ? MODEL_REFUSAL_REASONS.STOPPED_ON_BUDGET
        : MODEL_REFUSAL_REASONS.DID_NOT_STOP_NORMALLY,
      message: onBudget
        ? 'the loopback model stopped this generation on the token budget'
        : 'the loopback model did not end this generation normally; its reason is not echoed',
    };
  }
  if (declaredModel.value !== undefined && declaredModel.value !== servedModel) {
    return {
      reason: MODEL_REFUSAL_REASONS.MODEL_MISMATCH,
      message: 'the loopback model reply names a different model than this runner serves',
    };
  }
  const content = plainObject(message.value)
    ? consumedReplyField(message.value, 'content')
    : { value: undefined };
  if (content === null) return MALFORMED_REPLY_FIELD;
  if (typeof content.value !== 'string' || content.value.length === 0) {
    return {
      reason: MODEL_REFUSAL_REASONS.NO_CONTENT,
      message: 'the loopback model returned no message content',
    };
  }
  return { content: content.value };
}

const MODEL_REFUSAL_STATE = new WeakMap();

/**
 * Which refusal this adapter last took, as one token from the closed set above, or `null`.
 *
 * The lane converts every adapter throw into one `MODEL_CALL_FAILED` and carries no provider
 * detail, by design. That is correct for the lane and it is also why a hold used to be opaque:
 * the observed benchmark failure - a budget-truncated generation with empty content - reported
 * the same code as an unreachable daemon. These tokens are chosen from the reply's *shape*, never
 * from its content, so naming one echoes no provider text, no path, no question, and no source.
 *
 * The state is held off the adapter object, on a WeakMap, so the surface the lane validates is
 * exactly the surface it validated before.
 *
 * This is the *adapter's* last refusal. A receipt names an *invocation's* refusal, which is not
 * the same question once an adapter outlives one command; that reader is below.
 */
export function lastModelRefusalReason(answerModel) {
  return MODEL_REFUSAL_STATE.get(answerModel)?.reason ?? null;
}

/**
 * One invocation's refusal cell: the single slot a scoped call may write.
 *
 * The cell is created when a scope opens and is captured by the adapter that scope hands out, so
 * the binding between a call and the slot it settles is fixed before the call is made. Nothing
 * re-points it and nothing else can reach it, which is what makes an attribution independent of
 * how two invocations interleave.
 */
function createModelRefusalCell() {
  let reason = null;
  return Object.freeze({
    settle(value) { reason = value; },
    read: () => reason,
  });
}

/**
 * Opens one refusal scope for one command invocation: its own adapter and its own reader.
 *
 * An adapter is one object and a command is one invocation, and the same object can serve several
 * of them — sequentially, when a later run reuses it, and at the same time, when two commands hold
 * calls open at once. Attribution therefore cannot live in a slot the adapter rewrites as calls
 * arrive: the run that read it would report whichever refusal happened last, on any invocation, and
 * a run that never reached a provider could report one taken by a run that did.
 *
 * So each scope creates one cell and one adapter bound to it, and every call made through that
 * adapter settles that cell and no other. The caller must use the adapter it is handed: a call on
 * the underlying adapter belongs to no invocation and settles no cell.
 *
 * An adapter this module did not create holds no refusal state. It is handed back unchanged — there
 * is nothing to scope — and its reader answers `null`, which is the honest answer for a seam whose
 * refusals this module never observed.
 */
export function openModelRefusalScope(answerModel) {
  const record = MODEL_REFUSAL_STATE.get(answerModel) ?? null;
  if (record === null) {
    return Object.freeze({ answerModel, readRefusalReason: () => null });
  }
  const cell = createModelRefusalCell();
  return Object.freeze({
    answerModel: record.bindInvocation(cell),
    readRefusalReason: () => cell.read(),
  });
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
 * Nothing here fills a gap. A non-success status - which is what an oversize prompt becomes,
 * since the request asks the daemon to refuse one rather than trim it - a reply that does not
 * state both that it finished and that the model ended it, a reply the token budget cut off, a
 * reply whose content is not a string, and content that is not one JSON object are refusals, not
 * partial answers to complete. A response this adapter cannot read is one of its own refusals
 * too: every slot it consumes is snapshotted once, and one that throws is answered with a fixed
 * message rather than by letting somebody else's error out of here carrying somebody else's text.
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

  // This adapter's own last refusal, which is what `lastModelRefusalReason` reads. It is a
  // different question from the one a receipt asks — a receipt names one *invocation's* refusal —
  // so an invocation's answer is not kept here but in the cell that invocation captured.
  const record = { reason: null, bindInvocation: null };

  // One call, settling exactly one outcome into the cell it was bound to when its invocation
  // opened. Nothing is cleared on the way in: a call that cleared a shared slot as it started would
  // erase the refusal of a call that is still open on another invocation.
  const call = async (cell, promptText, responseSchema) => {
    const settle = (reason) => {
      record.reason = reason;
      if (cell !== null) cell.settle(reason);
    };
    const refuseCall = (reason, message) => {
      settle(reason);
      refuse(CLI_CODES.MODEL_CALL_REFUSED, message);
    };
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
          think: OLLAMA_THINK,
          truncate: OLLAMA_TRUNCATE_PROMPT,
          format: responseSchema,
          options: { temperature: 0, seed: 0, num_ctx: OLLAMA_NUM_CTX },
        }),
      });
    } catch {
      refuseCall(MODEL_REFUSAL_REASONS.REQUEST_FAILED,
        'the loopback model request failed or timed out; no provider text is echoed');
    }
    // One snapshot of every slot this adapter consumes, taken before any of them is judged. A
    // response whose own surface cannot be read is refused here, with this adapter's message.
    const surface = responseSurface(response);
    if (surface === null) {
      refuseCall(MODEL_REFUSAL_REASONS.RESPONSE_UNREADABLE,
        'the loopback model response could not be read as one HTTP response');
    }
    if (surface.ok !== true) {
      refuseCall(MODEL_REFUSAL_REASONS.NON_SUCCESS_STATUS,
        'the loopback model returned a non-success status; no provider body is echoed');
    }
    let body;
    try {
      body = await readBoundedResponseJson(response, surface);
    } catch (error) {
      settle(MODEL_REFUSAL_REASONS.BODY_UNREADABLE);
      throw error;
    }
    // The reply must state that it finished and that it ended on its own, and every field that
    // decides it is read as own data. Nothing here is completed, repaired, or assumed.
    const verdict = finishedReplyContent(body, model);
    if (verdict.reason !== undefined) refuseCall(verdict.reason, verdict.message);
    const { content } = verdict;
    if (content.length > MAX_MESSAGE_CONTENT_CHARS
        || Buffer.byteLength(content, 'utf8') > MAX_MESSAGE_CONTENT_BYTES) {
      refuseCall(MODEL_REFUSAL_REASONS.CONTENT_OVER_CEILING,
        'the loopback model returned message content over the accepted ceiling');
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      refuseCall(MODEL_REFUSAL_REASONS.CONTENT_NOT_ONE_OBJECT,
        'the loopback model did not return one JSON object; no provider text is echoed');
    }
    if (!plainObject(parsed)) {
      refuseCall(MODEL_REFUSAL_REASONS.CONTENT_NOT_ONE_OBJECT,
        'the loopback model content was not one JSON object; no provider text is echoed');
    }
    // An answered call is an outcome too: it settles this invocation's cell at no refusal, so a
    // run that reached a provider and got an answer never carries an earlier call's token.
    settle(null);
    return parsed;
  };

  const descriptor = {
    adapter_id: 'loopback_ollama_chat',
    adapter_revision: OLLAMA_ADAPTER_REVISION,
    stateless: true,
    tools_enabled: false,
    history_enabled: false,
  };
  // One adapter per invocation, each closing over that invocation's cell and over nothing else.
  // The shape is the one the hardened lane validates — a plain frozen object whose seams are own
  // enumerable data functions — and it is the same shape whether or not a cell was bound.
  const boundAdapter = (cell) => Object.freeze({
    descriptor,
    composeAnswer: (request) =>
      call(cell, renderPromptText(request), answerResponseJsonSchema(request)),
    proposeQueryExpansion: (request) =>
      call(cell, renderExpansionPromptText(request), expansionResponseJsonSchema(request)),
  });
  record.bindInvocation = (cell) => {
    const scoped = boundAdapter(cell);
    // Registered too, so this module's own reader answers for a scoped adapter exactly as it does
    // for the one it was made from: both are this adapter, and both share its last refusal.
    MODEL_REFUSAL_STATE.set(scoped, record);
    return scoped;
  };

  const adapter = boundAdapter(null);
  MODEL_REFUSAL_STATE.set(adapter, record);
  return adapter;
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

const OUTPUT_SAFETY_REASON_TOKENS = new Set(Object.values(OUTPUT_SAFETY_REASONS));

/**
 * Which output-safety family this invocation's lane run refused on, or `null`.
 *
 * The lane names it on its own receipt — under a key it carries only where there is a token to
 * carry, since a canonical receipt omits a field with nothing to say. This command receipt is a
 * JSON-safe execution summary rather than canonical material, so it keeps one closed top-level
 * field set and states the absence as `null`. It is written here because a HOLD lane receipt is
 * not emitted to stdout and `--receipt-out` is rolled back on a hold, so this command receipt is
 * the only surface an operator can read it from. It is taken from the lane result this call
 * awaited and from nothing
 * else — no module state, no adapter slot, no earlier run — so a reused adapter cannot hand a later
 * run an earlier reason, and two commands overlapping on one adapter cannot cross-attribute one.
 * That is the same invocation-local rule `model_refusal_reason` holds, reached without a cell
 * because a lane result is already one call's own value.
 *
 * The token must be one the lane publishes. Anything else is reported as no reason rather than
 * passed through, so nothing that is not a closed family token can reach a reader by this field.
 */
function invocationOutputSafetyReason(laneReceipt) {
  const reason = laneReceipt === null || typeof laneReceipt !== 'object'
    ? null
    : laneReceipt.output_safety_reason;
  return typeof reason === 'string' && OUTPUT_SAFETY_REASON_TOKENS.has(reason) ? reason : null;
}

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
    // Which refusal the provider adapter took, named from the closed set the adapter publishes
    // and never from anything the provider said. `null` whenever the hold came from somewhere
    // else, which is most of them: an argument, an input, an output, or the lane itself.
    model_refusal_reason: passed ? null : (state.modelRefusalReason ?? null),
    // Which output-safety family the lane refused on, named from the closed set the lane publishes
    // and never from the text it refused. `null` on a pass, on every hold that is not an
    // output-safety refusal, and on every hold this command took before the lane ran at all.
    output_safety_reason: passed ? null : invocationOutputSafetyReason(laneReceipt),
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
  let answerModel = null;
  // Nothing has been asked of a provider yet, and no earlier run's refusal may answer for it.
  let readModelRefusalReason = () => null;
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
        modelRefusalReason: readModelRefusalReason(),
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

    const seamModel = seams.answerModel ?? createLoopbackOllamaAnswerModel({
      baseUrl: flags['--ollama-url'] ?? DEFAULT_OLLAMA_BASE_URL,
      model: flags['--model'] ?? EXACT_ANSWER_MODEL,
      timeoutMs: Number(flags['--timeout-ms'] ?? DEFAULTS.timeout_ms),
    });
    // This invocation's own adapter and its own reader, opened before an output is staged. Every
    // model call this run makes goes through the adapter below and settles this run's cell alone,
    // so a run that refuses at the preflight — at zero model calls — reports no provider refusal
    // even when the adapter it was handed is one another run is refusing on right now.
    const scope = openModelRefusalScope(seamModel);
    answerModel = scope.answerModel;
    readModelRefusalReason = scope.readRefusalReason;

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
