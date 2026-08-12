// Query-only NotebookLM capture for the SE-core evaluation seam.
//
// This module runs exactly one NotebookLM command shape and nothing else:
//
//   nlm notebook query <notebook_id> <question> --conversation-id <fresh_uuid>
//       --source-ids <csv> --profile <profile> --json --timeout <seconds>
//
// It cannot select login, notebook create/delete, source add/sync/import, research
// start/import, note mutation, chat deletion, or any other NotebookLM verb: the argv is a
// constant shape whose only variable positions are separately validated values. It never
// inspects or manages authentication; runtime availability belongs to the caller.
//
// Question and answer turns are recorded through the existing metadata-only QA interaction
// ledger. Raw answers, citations, references, notebook/source/conversation identifiers, and
// provider stdout stay inside the explicitly supplied private evaluation root. Nothing here
// declares a winner, accepts an answer, writes to Task/ERP, uploads, or mutates a source.
//
// `--timeout` is passed in seconds. That unit is this repository's own established NotebookLM
// CLI contract rather than an assumption introduced here.
//
// The default executor spawns `nlm` directly, with no shell. That is deliberate, and it means
// the default path only works where `nlm` is itself a spawnable executable on PATH. Where it is
// a wrapper shim that only a shell resolves, the caller injects an `execute` dependency rather
// than this module relaxing its shell-free spawn.

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { captureQaInteraction } from './se_core_eval_qa_capture.mjs';

const REPORT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_notebook_query_capture_report.v1';
const INTENT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_notebook_query_intent.v1';
const FAILURE_SCHEMA = 'soulforge.engineering_engine.se_core_eval_notebook_query_failure.v1';
const CLAIM_CEILING = 'metadata_only_observation_ledger';

const PROVIDER = 'notebook';
const COMMAND = 'nlm';
const SUBCOMMAND = Object.freeze(['notebook', 'query']);
const REQUIRED_SOURCE_ID_COUNT = 4;
const SCOPES = Object.freeze(['fixed_benchmark', 'exploratory']);
const RESPONSE_KEYS = Object.freeze([
  'answer', 'citations', 'conversation_id', 'question', 'references', 'sources_used',
]);
// nlm 0.9.10 returns each reference as `source_id` plus the 1-based `citation_number` it
// resolves, optionally carrying the quoted `cited_text` or the extracted `cited_table`.
const REFERENCE_KEYS = Object.freeze([
  'citation_number', 'cited_table', 'cited_text', 'source_id',
]);
const REFERENCE_REQUIRED_KEYS = Object.freeze(['citation_number', 'source_id']);
const CITED_TABLE_KEYS = Object.freeze(['num_columns', 'rows']);
const REQUEST_KEYS = Object.freeze([
  'root_path', 'interaction_id', 'scope', 'attempt_id', 'event_time', 'question_bytes',
  'notebook_id', 'source_ids', 'profile', 'timeout_seconds',
]);
const DEPENDENCY_KEYS = Object.freeze(['execute', 'newConversationId']);
const INTENT_KEYS = Object.freeze([
  'attempt_id', 'conversation_id', 'event_time', 'interaction_id', 'notebook_id', 'profile',
  'provider', 'question_byte_length', 'question_sha256', 'schema_version', 'scope', 'source_ids',
  'timeout_seconds',
]);

const PRIVATE_ROOT_SEGMENT = 'private';
const PRIVATE_LANE_SEGMENT = 'notebook_query';
const INTENT_SEGMENT = 'intent';
const RESPONSE_SEGMENT = 'response';
const FAILURE_SEGMENT = 'failure';
const LEDGER_FILE = 'qa_interaction_ledger.jsonl';
const LOCK_FILE = 'qa_interaction_ledger.lock';

const MAX_QUESTION_BYTES = 16 * 1024;
const MAX_ANSWER_BYTES = 1024 * 1024;
const MAX_STDOUT_BYTES = 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const MAX_CITATIONS = 512;
const MAX_REFERENCES = 512;
const MAX_CITED_TEXT_BYTES = 64 * 1024;
const MAX_TABLE_COLUMNS = 64;
const MAX_TABLE_ROWS = 512;
const MAX_TABLE_CELL_BYTES = 8 * 1024;
const MAX_SCANNED_INTENTS = 4_096;
const MAX_SCANNED_INTENT_DIRECTORIES = 1_024;
const MIN_TIMEOUT_SECONDS = 5;
const MAX_TIMEOUT_SECONDS = 600;
const SPAWN_GRACE_MS = 5_000;

const TAB = 0x09;
const LINE_FEED = 0x0a;
const SPACE = 0x20;
const DELETE = 0x7f;
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_SCAN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const INTERACTION_ID = /^(?:se-q|historical)-[a-z0-9][a-z0-9._-]{0,82}$/;
const ATTEMPT_ID = /^(?:attempt|round|retry)-[a-z0-9][a-z0-9._-]{0,84}$/;
const PROFILE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EVENT_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const TIMEOUT_DIGITS = /^\d{1,3}$/;
const CITATION_NUMBER_KEY = /^[1-9][0-9]{0,3}$/;
const RESERVED_ID = /(?:^|[._-])(?:accounts?|clients?|customers?|tenants?|projects?|contracts?|credentials?|secrets?|tokens?|passwords?|p\d{2,4}[-_]\d{2,6})(?:[._-]|$)/i;
const PROJECT_ID = /^p\d{2,4}[-_]\d{2,6}$/i;
const SENSITIVE_VALUE = /(?:\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-|gh[pousr]_)[a-z0-9_-]{12,}|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|credential|secret)[:=])/i;

/** A refusal that must never carry the rejected value, only its closed issue code. */
class NotebookQueryHold extends Error {
  constructor(code, result = 'HOLD') {
    super(code);
    this.name = 'NotebookQueryHold';
    this.code = code;
    this.result = result;
  }
}

function hold(code) {
  throw new NotebookQueryHold(code, 'HOLD');
}

function unknown(code) {
  throw new NotebookQueryHold(code, 'UNKNOWN');
}

function guard(condition, code) {
  if (!condition) hold(code);
}

/** Tab and line feed stay legal in a question body; every other C0 control and DEL does not. */
function hasControlCharacter(text) {
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code === TAB || code === LINE_FEED) continue;
    if (code < SPACE || code === DELETE) return true;
  }
  return false;
}

function isRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

/** A record whose own keys stay inside `allowed` and that carries every key in `required`. */
function boundedKeys(value, allowed, required) {
  return isRecord(value)
    && Object.keys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(stableValue(value))}\n`, 'utf8');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeId(value, code) {
  guard(typeof value === 'string'
    && value.normalize('NFC') === value
    && SAFE_ID.test(value)
    && !RESERVED_ID.test(value)
    && !PROJECT_ID.test(value)
    && !SENSITIVE_VALUE.test(value),
  code);
  return value;
}

function safeInteractionId(value) {
  safeId(value, 'IDENTIFIER_REFUSED');
  guard(INTERACTION_ID.test(value), 'IDENTIFIER_REFUSED');
  return value;
}

function safeAttemptId(value) {
  safeId(value, 'IDENTIFIER_REFUSED');
  guard(ATTEMPT_ID.test(value), 'IDENTIFIER_REFUSED');
  return value;
}

function safeProfile(value) {
  guard(typeof value === 'string'
    && value.normalize('NFC') === value
    && PROFILE_ID.test(value)
    && !RESERVED_ID.test(value)
    && !PROJECT_ID.test(value)
    && !SENSITIVE_VALUE.test(value),
  'PROFILE_REFUSED');
  return value;
}

function safeEventTime(value) {
  const parsed = typeof value === 'string' && EVENT_TIME.test(value) ? Date.parse(value) : NaN;
  const fraction = typeof value === 'string' ? value.match(/\.(\d{1,3})Z$/)?.[1] : undefined;
  const normalized = typeof value === 'string' && value.length >= 20
    ? `${value.slice(0, 19)}.${(fraction ?? '').padEnd(3, '0')}Z`
    : '';
  guard(typeof value === 'string'
    && EVENT_TIME.test(value)
    && Number.isFinite(parsed)
    && new Date(parsed).toISOString() === normalized,
  'EVENT_TIME_REFUSED');
  return value;
}

function safeNotebookId(value) {
  guard(typeof value === 'string' && UUID.test(value), 'NOTEBOOK_ID_REFUSED');
  return value;
}

function safeSourceIds(value) {
  guard(Array.isArray(value)
    && value.length === REQUIRED_SOURCE_ID_COUNT
    && value.every((id) => typeof id === 'string' && UUID.test(id))
    && new Set(value).size === REQUIRED_SOURCE_ID_COUNT,
  'SOURCE_ID_SET_REFUSED');
  return [...value];
}

function safeTimeoutSeconds(value) {
  guard(Number.isSafeInteger(value)
    && value >= MIN_TIMEOUT_SECONDS
    && value <= MAX_TIMEOUT_SECONDS,
  'TIMEOUT_REFUSED');
  return value;
}

/** The question becomes one argv value, so it must be bounded, flag-free, and control-free. */
function safeQuestion(value) {
  guard((Buffer.isBuffer(value) || value instanceof Uint8Array)
    && value.byteLength > 0
    && value.byteLength <= MAX_QUESTION_BYTES,
  'QUESTION_BYTES_REFUSED');
  const bytes = Buffer.from(value);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    hold('QUESTION_BYTES_REFUSED');
  }
  guard(text.length > 0
    && !text.startsWith(BYTE_ORDER_MARK)
    && !text.startsWith('-')
    && !hasControlCharacter(text),
  'QUESTION_BYTES_REFUSED');
  return { bytes, text, sha256: sha256(bytes) };
}

function withinRoot(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function openRoot(rootPath) {
  guard(typeof rootPath === 'string' && rootPath.length > 0 && isAbsolute(rootPath),
    'EVALUATION_ROOT_REFUSED');
  try {
    const root = realpathSync(rootPath);
    guard(statSync(root).isDirectory(), 'EVALUATION_ROOT_REFUSED');
    return root;
  } catch (error) {
    if (error instanceof NotebookQueryHold) throw error;
    hold('EVALUATION_ROOT_REFUSED');
  }
}

function privateSegments(kind, interactionId) {
  return [PRIVATE_ROOT_SEGMENT, PRIVATE_LANE_SEGMENT, kind, interactionId];
}

/**
 * Resolves a private directory inside the root, creating missing levels.
 *
 * Every level is re-resolved through `realpath` so a symlink, junction, or other reparse
 * point that leaves the supplied evaluation root refuses instead of being followed.
 */
function containedDirectory(root, segments) {
  let current = root;
  for (const segment of segments) {
    guard(SAFE_ID.test(segment) && !RESERVED_ID.test(segment), 'PRIVATE_REF_REFUSED');
    const candidate = join(current, segment);
    if (!existsSync(candidate)) {
      try {
        mkdirSync(candidate, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== 'EEXIST') hold('PRIVATE_WRITE_FAILED');
      }
    }
    try {
      const real = realpathSync(candidate);
      guard(withinRoot(root, real) && statSync(real).isDirectory(), 'PRIVATE_REF_REFUSED');
      current = real;
    } catch (error) {
      if (error instanceof NotebookQueryHold) throw error;
      hold('PRIVATE_REF_REFUSED');
    }
  }
  return current;
}

/**
 * Resolves a directory that must already exist inside the root, without ever creating a level.
 *
 * The entry is `lstat`ed first so a symlink, junction, or other reparse point is refused before
 * anything lists or reads through it, and the resolved target must still be contained by the
 * supplied evaluation root. A missing directory returns null; every other refusal holds.
 */
function containedExistingDirectory(root, target) {
  let links;
  try {
    links = lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    hold('PRIVATE_REF_REFUSED');
  }
  guard(links.isDirectory() && !links.isSymbolicLink(), 'PRIVATE_REF_REFUSED');
  try {
    const real = realpathSync(target);
    guard(withinRoot(root, real) && statSync(real).isDirectory(), 'PRIVATE_REF_REFUSED');
    return real;
  } catch (error) {
    if (error instanceof NotebookQueryHold) throw error;
    hold('PRIVATE_REF_REFUSED');
  }
}

function protectedIdentities(root) {
  const identities = [];
  for (const name of [LEDGER_FILE, LOCK_FILE]) {
    const target = join(root, name);
    if (!existsSync(target)) continue;
    try {
      const real = realpathSync(target);
      identities.push({ real: real.toLowerCase(), stats: statSync(real, { bigint: true }) });
    } catch {
      hold('PRIVATE_REF_REFUSED');
    }
  }
  return identities;
}

/** Refuses a target that is the protected ledger or lock by path or by hardlink identity. */
function guardNotProtected(root, target) {
  const identities = protectedIdentities(root);
  if (identities.length === 0) return;
  let real;
  let stats;
  try {
    real = realpathSync(target);
    stats = statSync(real, { bigint: true });
  } catch {
    return;
  }
  for (const identity of identities) {
    guard(real.toLowerCase() !== identity.real
      && !(stats.dev === identity.stats.dev
        && stats.ino !== 0n
        && stats.ino === identity.stats.ino),
    'PRIVATE_ARTIFACT_COLLISION');
  }
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    guard(written > 0, 'PRIVATE_WRITE_INTERRUPTED');
    offset += written;
  }
}

function privateArtifactPath(root, kind, interactionId, attemptId) {
  return join(root, ...privateSegments(kind, interactionId), `${attemptId}.json`);
}

function readPrivateArtifact(root, kind, interactionId, attemptId) {
  const target = privateArtifactPath(root, kind, interactionId, attemptId);
  if (!existsSync(target)) return null;
  try {
    const links = lstatSync(target);
    guard(links.isFile() && !links.isSymbolicLink(), 'PRIVATE_REF_REFUSED');
    const real = realpathSync(target);
    guard(withinRoot(root, real), 'PRIVATE_REF_REFUSED');
    guardNotProtected(root, real);
    const stats = statSync(real);
    guard(stats.isFile() && stats.size > 0 && stats.size <= MAX_STDOUT_BYTES,
      'PRIVATE_ARTIFACT_REFUSED');
    const bytes = readFileSync(real);
    guard(bytes.length === stats.size, 'PRIVATE_ARTIFACT_REFUSED');
    return bytes;
  } catch (error) {
    if (error instanceof NotebookQueryHold) throw error;
    hold('PRIVATE_ARTIFACT_REFUSED');
  }
}

/** Create-only private write. An identical retry recovers; different bytes never overwrite. */
function createPrivateArtifact(root, kind, interactionId, attemptId, bytes) {
  guard(bytes.length > 0 && bytes.length <= MAX_STDOUT_BYTES, 'PRIVATE_ARTIFACT_REFUSED');
  const parent = containedDirectory(root, privateSegments(kind, interactionId));
  const target = join(parent, `${attemptId}.json`);
  guard(withinRoot(root, target), 'PRIVATE_REF_REFUSED');
  if (existsSync(target)) {
    const existing = readPrivateArtifact(root, kind, interactionId, attemptId);
    guard(existing !== null && existing.equals(bytes), 'PRIVATE_ARTIFACT_CONFLICT');
    return 'recovered_existing';
  }
  let fd;
  try {
    fd = openSync(target, 'wx', 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    return 'created';
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* the immutable partial stays visible to the next retry */ }
    }
    if (error instanceof NotebookQueryHold) throw error;
    if (error?.code === 'EEXIST') {
      return createPrivateArtifact(root, kind, interactionId, attemptId, bytes);
    }
    hold('PRIVATE_WRITE_FAILED');
  }
}

function parseUtf8Json(bytes, code) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    guard(!text.startsWith(BYTE_ORDER_MARK), code);
    const value = JSON.parse(text);
    guard(isRecord(value), code);
    return value;
  } catch (error) {
    if (error instanceof NotebookQueryHold) throw error;
    hold(code);
  }
}

function intentValue(values, conversationId, question) {
  return {
    schema_version: INTENT_SCHEMA,
    provider: PROVIDER,
    interaction_id: values.interaction_id,
    attempt_id: values.attempt_id,
    scope: values.scope,
    event_time: values.event_time,
    notebook_id: values.notebook_id,
    source_ids: [...values.source_ids],
    conversation_id: conversationId,
    profile: values.profile,
    timeout_seconds: values.timeout_seconds,
    question_sha256: question.sha256,
    question_byte_length: question.bytes.length,
  };
}

function readIntent(root, interactionId, attemptId) {
  const bytes = readPrivateArtifact(root, INTENT_SEGMENT, interactionId, attemptId);
  if (bytes === null) return null;
  const value = parseUtf8Json(bytes, 'INTENT_ARTIFACT_REFUSED');
  guard(exactKeys(value, INTENT_KEYS)
    && value.schema_version === INTENT_SCHEMA
    && value.provider === PROVIDER
    && value.interaction_id === interactionId
    && value.attempt_id === attemptId
    && SCOPES.includes(value.scope)
    && typeof value.notebook_id === 'string' && UUID.test(value.notebook_id)
    && typeof value.conversation_id === 'string' && UUID_V4.test(value.conversation_id)
    && Array.isArray(value.source_ids)
    && value.source_ids.length === REQUIRED_SOURCE_ID_COUNT
    && value.source_ids.every((id) => typeof id === 'string' && UUID.test(id))
    && new Set(value.source_ids).size === REQUIRED_SOURCE_ID_COUNT
    && typeof value.question_sha256 === 'string' && HEX64.test(value.question_sha256)
    && Number.isSafeInteger(value.question_byte_length),
  'INTENT_ARTIFACT_REFUSED');
  return value;
}

/**
 * The same attempt with the same identity bytes is idempotent; a different identity holds.
 *
 * `conversation_id` is deliberately excluded: it is minted once per attempt and pinned by the
 * intent, so a retry resumes the recorded conversation rather than opening a second one.
 * `event_time` is excluded for the same reason the ledger excludes it — it labels the turn
 * rather than identifying it.
 */
function guardIntentIdentity(intent, values, question) {
  guard(intent.scope === values.scope
    && intent.notebook_id === values.notebook_id
    && intent.profile === values.profile
    && intent.timeout_seconds === values.timeout_seconds
    && intent.question_sha256 === question.sha256
    && intent.question_byte_length === question.bytes.length
    && intent.source_ids.length === values.source_ids.length
    && intent.source_ids.every((id, index) => id === values.source_ids[index]),
  'ATTEMPT_IDENTITY_CONFLICT');
}

/**
 * Reads one scanned intent file that lives under an already-resolved contained directory.
 *
 * The entry is `lstat`ed and re-resolved before it is opened, so a reparse point planted between
 * the directory listing and the read cannot redirect it outside the evaluation root, and the byte
 * length is bounded by the same limit the private artifact reader already enforces.
 */
function readScannedIntentFile(root, directory, name) {
  const target = join(directory, name);
  let links;
  try {
    links = lstatSync(target);
  } catch (error) {
    if (error instanceof NotebookQueryHold) throw error;
    hold('INTENT_ARTIFACT_REFUSED');
  }
  guard(links.isFile() && !links.isSymbolicLink(), 'PRIVATE_REF_REFUSED');
  try {
    const real = realpathSync(target);
    guard(withinRoot(root, real), 'PRIVATE_REF_REFUSED');
    guardNotProtected(root, real);
    const stats = statSync(real);
    guard(stats.isFile() && stats.size > 0 && stats.size <= MAX_STDOUT_BYTES,
      'INTENT_ARTIFACT_REFUSED');
    const bytes = readFileSync(real);
    guard(bytes.length === stats.size, 'INTENT_ARTIFACT_REFUSED');
    return bytes;
  } catch (error) {
    if (error instanceof NotebookQueryHold) throw error;
    hold('INTENT_ARTIFACT_REFUSED');
  }
}

/**
 * A newly minted conversation must not collide with any conversation already recorded here.
 *
 * The scan stays inside the evaluation root. The lane, every interaction directory, and every
 * scanned file are refused if they are a symlink, junction, or other reparse point, or if they
 * resolve outside the root, before anything lists or reads them. Directory count, file count, and
 * each file's byte length are all bounded.
 */
function guardConversationUnused(root, conversationId) {
  const base = containedExistingDirectory(
    root, join(root, PRIVATE_ROOT_SEGMENT, PRIVATE_LANE_SEGMENT, INTENT_SEGMENT),
  );
  if (base === null) return;
  let interactions;
  try {
    interactions = readdirSync(base, { withFileTypes: true });
  } catch {
    hold('PRIVATE_REF_REFUSED');
  }
  guard(interactions.length <= MAX_SCANNED_INTENT_DIRECTORIES, 'INTENT_SCAN_EXCEEDED');
  let scanned = 0;
  for (const interaction of interactions) {
    guard(!interaction.isSymbolicLink(), 'PRIVATE_REF_REFUSED');
    if (!interaction.isDirectory()) continue;
    const directory = containedExistingDirectory(root, join(base, interaction.name));
    if (directory === null) continue;
    let attempts;
    try {
      attempts = readdirSync(directory, { withFileTypes: true });
    } catch {
      hold('PRIVATE_REF_REFUSED');
    }
    for (const attempt of attempts) {
      guard(!attempt.isSymbolicLink(), 'PRIVATE_REF_REFUSED');
      if (!attempt.isFile() || !attempt.name.endsWith('.json')) continue;
      scanned += 1;
      guard(scanned <= MAX_SCANNED_INTENTS, 'INTENT_SCAN_EXCEEDED');
      const value = parseUtf8Json(
        readScannedIntentFile(root, directory, attempt.name), 'INTENT_ARTIFACT_REFUSED',
      );
      guard(value.conversation_id !== conversationId, 'CONVERSATION_ID_REUSED');
    }
  }
}

function guardQueryArgv(argv, values) {
  guard(Array.isArray(argv) && argv.length === 13, 'ARGV_REFUSED');
  guard(argv.every((part) => typeof part === 'string' && part.length > 0), 'ARGV_REFUSED');
  guard(argv[0] === SUBCOMMAND[0] && argv[1] === SUBCOMMAND[1], 'ARGV_REFUSED');
  guard(argv[2] === values.notebook_id && UUID.test(argv[2]), 'ARGV_REFUSED');
  guard(argv[3] === values.question_text && !argv[3].startsWith('-'), 'ARGV_REFUSED');
  guard(argv[4] === '--conversation-id'
    && argv[5] === values.conversation_id
    && UUID_V4.test(argv[5]),
  'ARGV_REFUSED');
  const csv = argv[7].split(',');
  guard(argv[6] === '--source-ids'
    && Array.isArray(values.source_ids)
    && argv[7] === values.source_ids.join(',')
    && csv.length === REQUIRED_SOURCE_ID_COUNT
    && csv.every((id) => UUID.test(id))
    && new Set(csv).size === REQUIRED_SOURCE_ID_COUNT,
  'ARGV_REFUSED');
  guard(argv[8] === '--profile' && argv[9] === values.profile && PROFILE_ID.test(argv[9]),
    'ARGV_REFUSED');
  guard(argv[10] === '--json', 'ARGV_REFUSED');
  guard(argv[11] === '--timeout'
    && argv[12] === String(values.timeout_seconds)
    && TIMEOUT_DIGITS.test(argv[12]),
  'ARGV_REFUSED');
}

/** The constant query argv. Only separately validated values occupy the variable positions. */
export function buildNotebookQueryArgv(values) {
  guard(exactKeys(values, [
    'conversation_id', 'notebook_id', 'profile', 'question_text', 'source_ids', 'timeout_seconds',
  ]), 'ARGV_REFUSED');
  const argv = [
    SUBCOMMAND[0],
    SUBCOMMAND[1],
    values.notebook_id,
    values.question_text,
    '--conversation-id',
    values.conversation_id,
    '--source-ids',
    Array.isArray(values.source_ids) ? values.source_ids.join(',') : '',
    '--profile',
    values.profile,
    '--json',
    '--timeout',
    String(values.timeout_seconds),
  ];
  guardQueryArgv(argv, values);
  return argv;
}

function defaultExecute(invocation) {
  const result = spawnSync(invocation.command, invocation.args, {
    shell: false,
    windowsHide: true,
    timeout: invocation.timeout_ms,
    maxBuffer: Math.max(invocation.max_stdout_bytes, invocation.max_stderr_bytes) + 1,
  });
  return {
    status: typeof result.status === 'number' ? result.status : null,
    timed_out: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
    failed: result.error !== undefined && result.error !== null,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0),
  };
}

function runQuery(execute, argv, timeoutSeconds) {
  let outcome;
  try {
    outcome = execute({
      command: COMMAND,
      args: argv,
      timeout_ms: (timeoutSeconds * 1_000) + SPAWN_GRACE_MS,
      max_stdout_bytes: MAX_STDOUT_BYTES,
      max_stderr_bytes: MAX_STDERR_BYTES,
    });
  } catch {
    hold('PROVIDER_QUERY_FAILED');
  }
  guard(isRecord(outcome), 'PROVIDER_QUERY_FAILED');
  const stdout = Buffer.isBuffer(outcome.stdout) ? outcome.stdout : Buffer.alloc(0);
  const stderr = Buffer.isBuffer(outcome.stderr) ? outcome.stderr : Buffer.alloc(0);
  guard(outcome.timed_out !== true, 'PROVIDER_QUERY_TIMED_OUT');
  guard(outcome.failed !== true && outcome.status === 0, 'PROVIDER_QUERY_FAILED');
  guard(stdout.length > 0 && stdout.length <= MAX_STDOUT_BYTES, 'PROVIDER_OUTPUT_REFUSED');
  guard(stderr.length <= MAX_STDERR_BYTES, 'PROVIDER_OUTPUT_REFUSED');
  return stdout;
}

/** Every UUID anywhere in the response must be one the caller supplied or this module minted. */
function guardBoundIdentifiers(response, allowed) {
  for (const match of JSON.stringify(response).match(UUID_SCAN) ?? []) {
    guard(allowed.has(match.toLowerCase()), 'RESPONSE_IDENTIFIER_DRIFT');
  }
}

/** An extracted table declares its own width, so `num_columns` must match every row exactly. */
function guardCitedTable(value) {
  guard(exactKeys(value, CITED_TABLE_KEYS)
    && Number.isSafeInteger(value.num_columns)
    && value.num_columns >= 0
    && value.num_columns <= MAX_TABLE_COLUMNS
    && Array.isArray(value.rows)
    && value.rows.length <= MAX_TABLE_ROWS
    && value.rows.every((row) => Array.isArray(row)
      && row.length === value.num_columns
      && row.every((cell) => typeof cell === 'string'
        && Buffer.byteLength(cell, 'utf8') <= MAX_TABLE_CELL_BYTES)),
  'RESPONSE_REFERENCE_REFUSED');
}

/**
 * `citations` maps a 1-based citation number to the source UUID that number resolves to.
 *
 * Keys are validated as canonical positive integers, so `1` and `01` can never both claim the same
 * citation, and every value must be one of the exact source ids this attempt requested. A foreign
 * alias that is not a UUID at all is refused here rather than slipping past a UUID-shaped scan.
 */
function citationMap(citations, requested) {
  guard(isRecord(citations), 'RESPONSE_CITATION_REFUSED');
  const keys = Object.keys(citations);
  guard(keys.length <= MAX_CITATIONS, 'RESPONSE_CITATION_REFUSED');
  const bound = new Map();
  for (const key of keys) {
    guard(CITATION_NUMBER_KEY.test(key), 'RESPONSE_CITATION_REFUSED');
    const number = Number(key);
    guard(Number.isSafeInteger(number)
      && String(number) === key
      && number >= 1
      && number <= MAX_CITATIONS,
    'RESPONSE_CITATION_REFUSED');
    const sourceId = citations[key];
    guard(typeof sourceId === 'string' && requested.has(sourceId), 'RESPONSE_CITATION_REFUSED');
    bound.set(number, sourceId);
  }
  return bound;
}

/**
 * Every reference is one exact record bound to one citation.
 *
 * Its `source_id` must be one of the requested sources, its `citation_number` must exist in the
 * citations mapping and agree with the source recorded there, and no two references may claim the
 * same citation number. Optional `cited_text` and `cited_table` are bounded plain own data.
 */
function guardReferences(references, requested, citations) {
  guard(Array.isArray(references) && references.length <= MAX_REFERENCES,
    'RESPONSE_REFERENCE_REFUSED');
  const claimed = new Set();
  for (const reference of references) {
    guard(boundedKeys(reference, REFERENCE_KEYS, REFERENCE_REQUIRED_KEYS),
      'RESPONSE_REFERENCE_REFUSED');
    guard(typeof reference.source_id === 'string' && requested.has(reference.source_id),
      'RESPONSE_REFERENCE_REFUSED');
    guard(Number.isSafeInteger(reference.citation_number)
      && reference.citation_number >= 1
      && reference.citation_number <= MAX_CITATIONS,
    'RESPONSE_REFERENCE_REFUSED');
    if (Object.hasOwn(reference, 'cited_text')) {
      guard(typeof reference.cited_text === 'string'
        && Buffer.byteLength(reference.cited_text, 'utf8') <= MAX_CITED_TEXT_BYTES,
      'RESPONSE_REFERENCE_REFUSED');
    }
    if (Object.hasOwn(reference, 'cited_table')) guardCitedTable(reference.cited_table);
    guard(citations.get(reference.citation_number) === reference.source_id
      && !claimed.has(reference.citation_number),
    'RESPONSE_CITATION_BINDING_REFUSED');
    claimed.add(reference.citation_number);
  }
  return references.length;
}

function validateResponse(bytes, intent, question) {
  const value = parseUtf8Json(bytes, 'RESPONSE_SCHEMA_REFUSED');
  guard(exactKeys(value, RESPONSE_KEYS), 'RESPONSE_SCHEMA_REFUSED');
  guard(typeof value.question === 'string', 'RESPONSE_SCHEMA_REFUSED');
  guard(sha256(Buffer.from(value.question, 'utf8')) === question.sha256, 'RESPONSE_QUESTION_DRIFT');
  guard(typeof value.conversation_id === 'string'
    && value.conversation_id === intent.conversation_id,
  'RESPONSE_CONVERSATION_DRIFT');
  const requested = new Set(intent.source_ids);
  guard(Array.isArray(value.sources_used)
    && value.sources_used.length <= REQUIRED_SOURCE_ID_COUNT
    && new Set(value.sources_used).size === value.sources_used.length
    && value.sources_used.every((id) => typeof id === 'string' && requested.has(id)),
  'RESPONSE_SOURCE_DRIFT');
  const citations = citationMap(value.citations, requested);
  const referenceCount = guardReferences(value.references, requested, citations);
  guardBoundIdentifiers(value, new Set([
    intent.notebook_id, intent.conversation_id, ...intent.source_ids,
  ]));
  guard(typeof value.answer === 'string' && value.answer.length > 0, 'RESPONSE_ANSWER_REFUSED');
  const answerBytes = Buffer.from(value.answer, 'utf8');
  guard(answerBytes.length <= MAX_ANSWER_BYTES, 'RESPONSE_ANSWER_REFUSED');
  return {
    answer_bytes: answerBytes,
    citation_count: citations.size,
    reference_count: referenceCount,
    source_used_count: value.sources_used.length,
  };
}

function requireCapture(report, code) {
  guard(isRecord(report) && report.result === 'PASS', code);
  return report;
}

/**
 * The safe facts already established when a report is emitted.
 *
 * A refusal is still an audit record, so it must not claim a query was skipped that was actually
 * attempted, nor claim an empty ledger once a question turn has been appended. Only hashes and
 * counts are staged here; no raw text, provider output, or runtime identifier is ever kept.
 */
function newStage() {
  return {
    query_performed: false,
    question_sha256: null,
    event_count: null,
    appended_event_count: 0,
    ledger_sha256: null,
    head_event_hash: null,
  };
}

/** Folds one accepted ledger report into the facts every later report must keep reporting. */
function stageLedgerFacts(stage, report) {
  stage.event_count = report.event_count;
  stage.ledger_sha256 = report.ledger_sha256;
  stage.head_event_hash = report.head_event_hash;
  stage.appended_event_count += report.appended_event_count;
  return report;
}

function reportFor(stage, state, disposition, extras) {
  return {
    schema_version: REPORT_SCHEMA,
    result: 'PASS',
    claim_ceiling: CLAIM_CEILING,
    provider: PROVIDER,
    state,
    disposition,
    query_performed: stage.query_performed,
    question_sha256: stage.question_sha256,
    answer_sha256: extras.answer_sha256,
    response_artifact_sha256: extras.response_artifact_sha256,
    source_id_count: REQUIRED_SOURCE_ID_COUNT,
    source_used_count: extras.source_used_count,
    citation_count: extras.citation_count,
    reference_count: extras.reference_count,
    event_count: stage.event_count,
    appended_event_count: stage.appended_event_count,
    ledger_sha256: stage.ledger_sha256,
    head_event_hash: stage.head_event_hash,
    issues: [],
  };
}

function failureReport(stage, result, code) {
  return {
    schema_version: REPORT_SCHEMA,
    result,
    claim_ceiling: CLAIM_CEILING,
    provider: PROVIDER,
    state: result === 'UNKNOWN' ? 'unresolved_query_attempt' : 'refused',
    disposition: 'none',
    query_performed: stage.query_performed,
    question_sha256: stage.question_sha256,
    answer_sha256: null,
    response_artifact_sha256: null,
    source_id_count: REQUIRED_SOURCE_ID_COUNT,
    source_used_count: null,
    citation_count: null,
    reference_count: null,
    event_count: stage.event_count,
    appended_event_count: stage.appended_event_count,
    ledger_sha256: stage.ledger_sha256,
    head_event_hash: stage.head_event_hash,
    issues: [code],
  };
}

function validateRequest(request) {
  guard(exactKeys(request, REQUEST_KEYS), 'REQUEST_REFUSED');
  const question = safeQuestion(request.question_bytes);
  guard(SCOPES.includes(request.scope), 'SCOPE_REFUSED');
  const values = {
    root_path: request.root_path,
    interaction_id: safeInteractionId(request.interaction_id),
    attempt_id: safeAttemptId(request.attempt_id),
    scope: request.scope,
    event_time: safeEventTime(request.event_time),
    notebook_id: safeNotebookId(request.notebook_id),
    source_ids: safeSourceIds(request.source_ids),
    profile: safeProfile(request.profile),
    timeout_seconds: safeTimeoutSeconds(request.timeout_seconds),
  };
  guard(!values.source_ids.includes(values.notebook_id), 'SOURCE_ID_SET_REFUSED');
  return { values, question };
}

function mintConversationId(root, newConversationId, values) {
  let conversationId;
  try {
    conversationId = newConversationId();
  } catch {
    hold('CONVERSATION_ID_REFUSED');
  }
  guard(typeof conversationId === 'string' && UUID_V4.test(conversationId),
    'CONVERSATION_ID_REFUSED');
  guard(conversationId !== values.notebook_id && !values.source_ids.includes(conversationId),
    'CONVERSATION_ID_REFUSED');
  guardConversationUnused(root, conversationId);
  return conversationId;
}

/**
 * Record one NotebookLM question/answer turn, querying at most once per attempt.
 *
 * Crash safety comes from two create-only private artifacts. The intent is written before the
 * external query, so a process that dies mid-query is found again as an unfinished attempt and
 * returns UNKNOWN instead of querying a second time. The response artifact is persisted before
 * the answer is recorded, so a crash between those two steps resumes from stored bytes.
 *
 * Both recorded outcomes are read before any execute call, so an attempt whose history is missing
 * or self-contradicting closes deterministically instead of asking the provider a second question.
 */
export function captureSeCoreNotebookQuery(request = {}, dependencies = {}) {
  const stage = newStage();
  try {
    guard(isRecord(request), 'REQUEST_REFUSED');
    guard(isRecord(dependencies)
      && Object.keys(dependencies).every((key) => DEPENDENCY_KEYS.includes(key)),
    'DEPENDENCIES_REFUSED');
    const execute = dependencies.execute ?? defaultExecute;
    const newConversationId = dependencies.newConversationId ?? randomUUID;
    guard(typeof execute === 'function' && typeof newConversationId === 'function',
      'DEPENDENCIES_REFUSED');

    const { values, question } = validateRequest(request);
    const root = openRoot(values.root_path);

    stageLedgerFacts(stage, requireCapture(
      captureQaInteraction({ root_path: root, command: 'initialize' }),
      'LEDGER_INITIALIZE_REFUSED',
    ));
    stageLedgerFacts(stage, requireCapture(captureQaInteraction({
      root_path: root,
      command: 'record-question',
      interaction_id: values.interaction_id,
      scope: values.scope,
      event_time: values.event_time,
      question_bytes: question.bytes,
    }), 'QUESTION_CAPTURE_REFUSED'));
    stage.question_sha256 = question.sha256;

    // Preflight. Both recorded outcomes are resolved before the execute branch is chosen.
    const existingIntent = readIntent(root, values.interaction_id, values.attempt_id);
    const recordedResponse = readPrivateArtifact(
      root, RESPONSE_SEGMENT, values.interaction_id, values.attempt_id,
    );
    const recordedFailure = readPrivateArtifact(
      root, FAILURE_SEGMENT, values.interaction_id, values.attempt_id,
    );

    let intent = existingIntent;
    let responseBytes = null;

    if (existingIntent !== null) {
      guardIntentIdentity(existingIntent, values, question);
      // One attempt cannot have both succeeded and failed. Nothing here can decide which record
      // is the real one, so the attempt closes rather than guessing or querying again.
      guard(recordedResponse === null || recordedFailure === null, 'CONFLICTING_QUERY_OUTCOME');
      if (recordedFailure !== null) hold('PROVIDER_QUERY_ATTEMPT_CLOSED');
      if (recordedResponse === null) unknown('UNRESOLVED_QUERY_ATTEMPT');
      responseBytes = recordedResponse;
    } else {
      // An outcome with no intent is an orphan: the identity that produced it cannot be
      // reconstructed, so a first query under a freshly minted conversation is refused.
      guard(recordedResponse === null && recordedFailure === null, 'ORPHANED_QUERY_OUTCOME');
      const conversationId = mintConversationId(root, newConversationId, values);
      intent = intentValue(values, conversationId, question);
      createPrivateArtifact(
        root, INTENT_SEGMENT, values.interaction_id, values.attempt_id, canonicalBytes(intent),
      );
      const argv = buildNotebookQueryArgv({
        notebook_id: values.notebook_id,
        question_text: question.text,
        conversation_id: conversationId,
        source_ids: values.source_ids,
        profile: values.profile,
        timeout_seconds: values.timeout_seconds,
      });
      stage.query_performed = true;
      try {
        responseBytes = runQuery(execute, argv, values.timeout_seconds);
      } catch (error) {
        const code = error instanceof NotebookQueryHold ? error.code : 'PROVIDER_QUERY_FAILED';
        createPrivateArtifact(
          root, FAILURE_SEGMENT, values.interaction_id, values.attempt_id, canonicalBytes({
            schema_version: FAILURE_SCHEMA,
            provider: PROVIDER,
            interaction_id: values.interaction_id,
            attempt_id: values.attempt_id,
            event_time: values.event_time,
            issue_code: code,
          }),
        );
        hold(code);
      }
      createPrivateArtifact(
        root, RESPONSE_SEGMENT, values.interaction_id, values.attempt_id, responseBytes,
      );
    }

    const validated = validateResponse(responseBytes, intent, question);
    const answered = stageLedgerFacts(stage, requireCapture(captureQaInteraction({
      root_path: root,
      command: 'record-answer',
      interaction_id: values.interaction_id,
      provider: PROVIDER,
      attempt_id: values.attempt_id,
      event_time: values.event_time,
      answer_bytes: validated.answer_bytes,
    }), 'ANSWER_CAPTURE_REFUSED'));

    return reportFor(stage, stage.query_performed ? 'captured' : 'resumed', answered.disposition, {
      answer_sha256: sha256(validated.answer_bytes),
      response_artifact_sha256: sha256(responseBytes),
      source_used_count: validated.source_used_count,
      citation_count: validated.citation_count,
      reference_count: validated.reference_count,
    });
  } catch (error) {
    if (error instanceof NotebookQueryHold) return failureReport(stage, error.result, error.code);
    return failureReport(stage, 'HOLD', 'NOTEBOOK_QUERY_CAPTURE_FAILED');
  }
}

export const SE_CORE_NOTEBOOK_QUERY_COMMAND = COMMAND;
export const SE_CORE_NOTEBOOK_QUERY_SOURCE_ID_COUNT = REQUIRED_SOURCE_ID_COUNT;
