import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const EVENT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_interaction_event.v1';
const REPORT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_capture_report.v1';
const QUERY_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_capture_query.v1';
const CLAIM_CEILING = 'metadata_only_observation_ledger';
const LEDGER_FILE = 'qa_interaction_ledger.jsonl';
const LOCK_FILE = 'qa_interaction_ledger.lock';
const GENESIS_HASH = '0'.repeat(64);
const EVENT_TYPES = Object.freeze(['question_recorded', 'answer_received', 'review_recorded']);
const SCOPES = Object.freeze(['fixed_benchmark', 'exploratory']);
const PROVIDERS = Object.freeze(['engine', 'notebook']);
const CAPTURE_MODES = Object.freeze(['live_capture', 'historical_import', 'existing_status_review']);
const MAX_RAW_BYTES = 32 * 1024 * 1024;
const MAX_REVIEW_BYTES = 1024 * 1024;
const MAX_LEDGER_BYTES = 64 * 1024 * 1024;
const MAX_LEDGER_EVENTS = 100_000;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const INTERACTION_ID = /^(?:se-q|historical)-[a-z0-9][a-z0-9._-]{0,82}$/;
const ATTEMPT_ID = /^(?:attempt|round|retry)-[a-z0-9][a-z0-9._-]{0,84}$/;
const SAFE_REF = /^[A-Za-z0-9._/-]{1,512}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const EVENT_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const RESERVED_ID = /(?:^|[._-])(?:accounts?|clients?|customers?|tenants?|projects?|contracts?|credentials?|secrets?|tokens?|passwords?|p\d{2,4}[-_]\d{2,6})(?:[._-]|$)/i;
const PROJECT_ID = /^p\d{2,4}[-_]\d{2,6}$/i;
const SINGLE_TURN_RAW_REF = /\.(?:md|txt)$/i;
const JSON_CONTAINER_HEAD = /^\s*[[{]/;
const SENSITIVE_REF = /(?:^|\/)(?:accounts?|projects?|customers?|contracts?|credentials?|secrets?|tokens?|passwords?)(?:[._/-]|$)/i;
const SENSITIVE_VALUE = /(?:\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-|gh[pousr]_)[a-z0-9_-]{12,}|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|credential|secret)[:=])/i;
const STATUS_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REVIEW_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_status_review.v1';
const REVIEW_KEYS = Object.freeze([
  'schema_version',
  'review_state',
  'interaction_id',
  'provider',
  'attempt_id',
  'verdict',
  'exact_status',
  'citation_status',
  'evidence_status',
  'usefulness_status',
  'safety_violations',
  'authority_action_count',
  'issue_codes',
]);
const REVIEW_REQUIRED_KEYS = Object.freeze([
  'schema_version',
  'review_state',
  'interaction_id',
  'provider',
  'attempt_id',
  'verdict',
]);
const REVIEW_STATUS = Object.freeze(['pass', 'fail', 'hold', 'unknown', 'not_applicable']);
const COMMANDS = Object.freeze([
  'initialize',
  'validate',
  'record-question',
  'record-answer',
  'record-review',
  'import-existing',
  'query',
]);

class CaptureHold extends Error {
  constructor(code) {
    super(code);
    this.name = 'CaptureHold';
    this.code = code;
  }
}

function hold(code) {
  throw new CaptureHold(code);
}

function guard(condition, code) {
  if (!condition) hold(code);
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

function eventHash(core) {
  return sha256(Buffer.concat([
    Buffer.from('soulforge.se_core_eval.qa_interaction_event.v1\n', 'utf8'),
    canonicalBytes(core),
  ]));
}

function safeId(value) {
  guard(typeof value === 'string'
    && value.normalize('NFC') === value
    && SAFE_ID.test(value)
    && !RESERVED_ID.test(value)
    && !PROJECT_ID.test(value)
    && !SENSITIVE_VALUE.test(value),
  'IDENTIFIER_REFUSED');
  return value;
}

function safeInteractionId(value) {
  safeId(value);
  guard(INTERACTION_ID.test(value), 'IDENTIFIER_REFUSED');
  return value;
}

function safeAttemptId(value) {
  safeId(value);
  guard(ATTEMPT_ID.test(value), 'IDENTIFIER_REFUSED');
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

function safeBytes(value, maximum = MAX_RAW_BYTES) {
  guard((Buffer.isBuffer(value) || value instanceof Uint8Array)
    && value.byteLength > 0
    && value.byteLength <= maximum,
  'RAW_BYTES_REFUSED');
  return Buffer.from(value);
}

function safeRelativeRef(value) {
  const normalizedName = typeof value === 'string' ? value.toLowerCase() : '';
  guard(typeof value === 'string'
    && value.normalize('NFC') === value
    && SAFE_REF.test(value)
    && !isAbsolute(value)
    && !value.includes('\\')
    && !value.startsWith('/')
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    && value.split('/').every((part) => !PROJECT_ID.test(part))
    && normalizedName !== LEDGER_FILE
    && normalizedName !== LOCK_FILE
    && !SENSITIVE_REF.test(value)
    && !SENSITIVE_VALUE.test(value),
  'ARTIFACT_REF_REFUSED');
  return value;
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
    if (error instanceof CaptureHold) throw error;
    hold('EVALUATION_ROOT_REFUSED');
  }
}

function resolveExistingArtifact(root, relativeRef, maximum = MAX_RAW_BYTES) {
  const ref = safeRelativeRef(relativeRef);
  try {
    const lexical = resolve(root, ...ref.split('/'));
    guard(withinRoot(root, lexical), 'ARTIFACT_REF_REFUSED');
    const real = realpathSync(lexical);
    guard(withinRoot(root, real), 'ARTIFACT_REF_REFUSED');
    const stats = statSync(real);
    const identityStats = statSync(real, { bigint: true });
    guard(stats.isFile() && stats.size > 0 && stats.size <= maximum, 'ARTIFACT_FILE_REFUSED');
    for (const protectedPath of [ledgerPath(root), join(root, LOCK_FILE)]) {
      if (!existsSync(protectedPath)) continue;
      const protectedReal = realpathSync(protectedPath);
      const protectedIdentityStats = statSync(protectedReal, { bigint: true });
      guard(real.toLowerCase() !== protectedReal.toLowerCase()
        && !(identityStats.dev === protectedIdentityStats.dev
          && identityStats.ino !== 0n
          && identityStats.ino === protectedIdentityStats.ino),
      'ARTIFACT_REF_REFUSED');
    }
    const bytes = readFileSync(real);
    guard(bytes.length === stats.size, 'ARTIFACT_FILE_REFUSED');
    return {
      ref,
      bytes,
      real_path: real,
      device_id: identityStats.dev,
      inode: identityStats.ino,
    };
  } catch (error) {
    if (error instanceof CaptureHold) throw error;
    hold('ARTIFACT_FILE_REFUSED');
  }
}

function ensureContainedDirectory(root, segments) {
  let current = root;
  for (const segment of segments) {
    guard(SAFE_ID.test(segment) && !RESERVED_ID.test(segment), 'ARTIFACT_REF_REFUSED');
    const candidate = join(current, segment);
    if (!existsSync(candidate)) {
      try {
        mkdirSync(candidate, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== 'EEXIST') hold('RAW_WRITE_FAILED');
      }
    }
    try {
      const real = realpathSync(candidate);
      guard(withinRoot(root, real) && statSync(real).isDirectory(), 'ARTIFACT_REF_REFUSED');
      current = real;
    } catch (error) {
      if (error instanceof CaptureHold) throw error;
      hold('ARTIFACT_REF_REFUSED');
    }
  }
  return current;
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    guard(written > 0, 'WRITE_INTERRUPTED');
    offset += written;
  }
}

function createOnlyRawFile(root, relativeRef, bytes) {
  const ref = safeRelativeRef(relativeRef);
  const parts = ref.split('/');
  const parent = ensureContainedDirectory(root, parts.slice(0, -1));
  const target = join(parent, parts.at(-1));
  guard(withinRoot(root, target), 'ARTIFACT_REF_REFUSED');
  if (existsSync(target)) {
    try {
      const links = lstatSync(target);
      guard(links.isFile() && !links.isSymbolicLink(), 'RAW_FILE_CONFLICT');
      const existing = resolveExistingArtifact(root, ref);
      guard(existing.bytes.equals(bytes), 'RAW_FILE_CONFLICT');
      return { ref, disposition: 'recovered_existing' };
    } catch (error) {
      if (error instanceof CaptureHold) throw error;
      hold('RAW_FILE_CONFLICT');
    }
  }
  let fd;
  try {
    fd = openSync(target, 'wx', 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    return { ref, disposition: 'created' };
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* best effort; the immutable partial remains visible */ }
    }
    if (error instanceof CaptureHold) throw error;
    if (error?.code === 'EEXIST') return createOnlyRawFile(root, ref, bytes);
    hold('RAW_WRITE_FAILED');
  }
}

function ledgerPath(root) {
  return join(root, LEDGER_FILE);
}

function inspectFixedLedgerPath(root, { required }) {
  const target = ledgerPath(root);
  if (!existsSync(target)) {
    guard(!required, 'LEDGER_NOT_INITIALIZED');
    return null;
  }
  try {
    const links = lstatSync(target);
    guard(links.isFile() && !links.isSymbolicLink(), 'LEDGER_FILE_REFUSED');
    const real = realpathSync(target);
    guard(withinRoot(root, real), 'LEDGER_FILE_REFUSED');
    const stats = statSync(real);
    guard(stats.isFile() && stats.size <= MAX_LEDGER_BYTES, 'LEDGER_FILE_REFUSED');
    return { path: real, size: stats.size };
  } catch (error) {
    if (error instanceof CaptureHold) throw error;
    hold('LEDGER_FILE_REFUSED');
  }
}

function parseUtf8Json(bytes, code) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    guard(!text.startsWith('\uFEFF'), code);
    const value = JSON.parse(text);
    guard(isRecord(value), code);
    return value;
  } catch (error) {
    if (error instanceof CaptureHold) throw error;
    hold(code);
  }
}

function validateClosedStatusReview(bytes, expected = undefined) {
  guard(bytes.length <= MAX_REVIEW_BYTES, 'REVIEW_STATUS_REFUSED');
  const value = parseUtf8Json(bytes, 'REVIEW_STATUS_REFUSED');
  guard(Object.keys(value).every((key) => REVIEW_KEYS.includes(key))
    && REVIEW_REQUIRED_KEYS.every((key) => Object.hasOwn(value, key)),
  'REVIEW_STATUS_REFUSED');
  guard(value.schema_version === REVIEW_SCHEMA, 'REVIEW_STATUS_REFUSED');
  guard(value.review_state === 'closed', 'REVIEW_NOT_CLOSED');
  safeInteractionId(value.interaction_id);
  guard(PROVIDERS.includes(value.provider), 'REVIEW_STATUS_REFUSED');
  safeAttemptId(value.attempt_id);
  guard(['pass', 'fail', 'hold'].includes(value.verdict), 'REVIEW_STATUS_REFUSED');
  for (const key of ['exact_status', 'citation_status', 'evidence_status']) {
    if (Object.hasOwn(value, key)) {
      guard(REVIEW_STATUS.includes(value[key]), 'REVIEW_STATUS_REFUSED');
    }
  }
  if (Object.hasOwn(value, 'usefulness_status')) {
    guard(['useful', 'not_useful', 'unknown', 'not_applicable', 'hold'].includes(
      value.usefulness_status,
    ), 'REVIEW_STATUS_REFUSED');
  }
  for (const key of ['safety_violations', 'authority_action_count']) {
    if (Object.hasOwn(value, key)) {
      guard(Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 1_000_000,
        'REVIEW_STATUS_REFUSED');
    }
  }
  if (Object.hasOwn(value, 'issue_codes')) {
    guard(Array.isArray(value.issue_codes)
      && value.issue_codes.length <= 256
      && value.issue_codes.every((code) => typeof code === 'string'
        && code.normalize('NFC') === code
        && STATUS_TOKEN.test(code)
        && !SENSITIVE_VALUE.test(code)),
    'REVIEW_STATUS_REFUSED');
  }
  if (expected !== undefined) {
    guard(value.interaction_id === expected.interaction_id
      && value.provider === expected.provider
      && value.attempt_id === expected.attempt_id,
    'REVIEW_IDENTITY_MISMATCH');
  }
  return value;
}

function exactEventKeys(event) {
  return exactKeys(event, [
    'artifact',
    'capture_mode',
    'event_hash',
    'event_time',
    'event_type',
    'identity',
    'links',
    'previous_event_hash',
    'schema_version',
    'scope',
    'sequence',
  ]);
}

function validateArtifactShape(artifact) {
  guard(exactKeys(artifact, ['byte_length', 'kind', 'relative_ref', 'sha256'])
    && Number.isSafeInteger(artifact.byte_length)
    && artifact.byte_length > 0
    && artifact.byte_length <= MAX_RAW_BYTES
    && ['question', 'answer', 'review_status'].includes(artifact.kind)
    && HEX64.test(artifact.sha256),
  'LEDGER_EVENT_REFUSED');
  safeRelativeRef(artifact.relative_ref);
}

function validateEventShape(event) {
  guard(exactEventKeys(event)
    && event.schema_version === EVENT_SCHEMA
    && Number.isSafeInteger(event.sequence)
    && event.sequence > 0
    && EVENT_TYPES.includes(event.event_type)
    && CAPTURE_MODES.includes(event.capture_mode)
    && SCOPES.includes(event.scope)
    && HEX64.test(event.previous_event_hash)
    && HEX64.test(event.event_hash)
    && exactKeys(event.identity, ['attempt_id', 'interaction_id', 'provider'])
    && exactKeys(event.links, ['answer_event_hash', 'question_event_hash']),
  'LEDGER_EVENT_REFUSED');
  safeEventTime(event.event_time);
  safeInteractionId(event.identity.interaction_id);
  validateArtifactShape(event.artifact);
  if (event.event_type === 'question_recorded') {
    guard(event.capture_mode !== 'existing_status_review'
      && event.identity.provider === null
      && event.identity.attempt_id === null
      && event.links.question_event_hash === null
      && event.links.answer_event_hash === null
      && event.artifact.kind === 'question',
    'LEDGER_EVENT_REFUSED');
    return;
  }
  guard(PROVIDERS.includes(event.identity.provider), 'LEDGER_EVENT_REFUSED');
  safeAttemptId(event.identity.attempt_id);
  guard(typeof event.links.question_event_hash === 'string'
    && HEX64.test(event.links.question_event_hash),
  'LEDGER_EVENT_REFUSED');
  if (event.event_type === 'answer_received') {
    guard(event.capture_mode !== 'existing_status_review'
      && event.links.answer_event_hash === null
      && event.artifact.kind === 'answer',
    'LEDGER_EVENT_REFUSED');
    return;
  }
  guard(event.capture_mode === 'existing_status_review'
    && typeof event.links.answer_event_hash === 'string'
    && HEX64.test(event.links.answer_event_hash)
    && event.artifact.kind === 'review_status',
  'LEDGER_EVENT_REFUSED');
}

function answerKey(interactionId, provider, attemptId) {
  return `${interactionId}\u0000${provider}\u0000${attemptId}`;
}

function eventCore(event) {
  const { event_hash: ignored, ...core } = event;
  return core;
}

function validateArtifactCommitment(root, event) {
  const maximum = event.artifact.kind === 'review_status' ? MAX_REVIEW_BYTES : MAX_RAW_BYTES;
  const artifact = resolveExistingArtifact(root, event.artifact.relative_ref, maximum);
  guard(artifact.bytes.length === event.artifact.byte_length
    && sha256(artifact.bytes) === event.artifact.sha256,
  'ARTIFACT_COMMITMENT_MISMATCH');
  if (event.artifact.kind === 'review_status') {
    validateClosedStatusReview(artifact.bytes, event.identity);
  }
}

function validateLedgerEvents(root, events) {
  const questions = new Map();
  const answers = new Map();
  const reviews = new Set();
  let previous = GENESIS_HASH;
  for (let offset = 0; offset < events.length; offset += 1) {
    const event = events[offset];
    validateEventShape(event);
    guard(event.sequence === offset + 1
      && event.previous_event_hash === previous
      && eventHash(eventCore(event)) === event.event_hash,
    'LEDGER_CHAIN_INVALID');
    const interactionId = event.identity.interaction_id;
    if (event.event_type === 'question_recorded') {
      guard(!questions.has(interactionId), 'LEDGER_ORDER_INVALID');
      questions.set(interactionId, event);
    } else {
      const question = questions.get(interactionId);
      guard(question
        && event.links.question_event_hash === question.event_hash
        && event.scope === question.scope
        && Date.parse(event.event_time) >= Date.parse(question.event_time),
      'LEDGER_ORDER_INVALID');
      const key = answerKey(interactionId, event.identity.provider, event.identity.attempt_id);
      if (event.event_type === 'answer_received') {
        guard(!answers.has(key), 'LEDGER_ORDER_INVALID');
        answers.set(key, event);
      } else {
        const answer = answers.get(key);
        guard(answer
          && !reviews.has(key)
          && event.links.answer_event_hash === answer.event_hash
          && Date.parse(event.event_time) >= Date.parse(answer.event_time),
        'LEDGER_ORDER_INVALID');
        reviews.add(key);
      }
    }
    validateArtifactCommitment(root, event);
    previous = event.event_hash;
  }
  return { questions, answers, reviews };
}

function parseLedgerBytes(root, bytes) {
  guard(Buffer.isBuffer(bytes) && bytes.length <= MAX_LEDGER_BYTES, 'LEDGER_FILE_REFUSED');
  if (bytes.length === 0) {
    return { events: [], index: validateLedgerEvents(root, []) };
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    hold('LEDGER_JSON_INVALID');
  }
  guard(text.endsWith('\n'), 'LEDGER_APPEND_INTERRUPTED');
  const lines = text.slice(0, -1).split('\n');
  guard(lines.length <= MAX_LEDGER_EVENTS && lines.every((line) => line.length > 0),
    'LEDGER_JSON_INVALID');
  const events = [];
  for (const line of lines) {
    const lineBytes = Buffer.from(`${line}\n`, 'utf8');
    const event = parseUtf8Json(Buffer.from(line, 'utf8'), 'LEDGER_JSON_INVALID');
    guard(canonicalBytes(event).equals(lineBytes), 'LEDGER_NOT_CANONICAL');
    events.push(event);
  }
  return { events, index: validateLedgerEvents(root, events) };
}

function readLedger(root) {
  const inspected = inspectFixedLedgerPath(root, { required: true });
  try {
    const bytes = readFileSync(inspected.path);
    guard(bytes.length === inspected.size, 'LEDGER_FILE_REFUSED');
    return { bytes, ...parseLedgerBytes(root, bytes) };
  } catch (error) {
    if (error instanceof CaptureHold) throw error;
    hold('LEDGER_FILE_REFUSED');
  }
}

function countsFor(events) {
  const counts = {
    answer_received: 0,
    question_recorded: 0,
    review_recorded: 0,
  };
  for (const event of events) counts[event.event_type] += 1;
  return counts;
}

function reportFor(operation, disposition, events, bytes, appendedEventCount = 0, extras = {}) {
  return {
    schema_version: REPORT_SCHEMA,
    result: 'PASS',
    claim_ceiling: CLAIM_CEILING,
    operation,
    disposition,
    event_count: events.length,
    appended_event_count: appendedEventCount,
    counts: countsFor(events),
    head_event_hash: events.length === 0 ? GENESIS_HASH : events.at(-1).event_hash,
    ledger_sha256: sha256(bytes),
    issues: [],
    ...extras,
  };
}

function failureReport(operation, code) {
  return {
    schema_version: REPORT_SCHEMA,
    result: 'HOLD',
    claim_ceiling: CLAIM_CEILING,
    operation: COMMANDS.includes(operation) ? operation : 'refused',
    disposition: 'none',
    event_count: 0,
    appended_event_count: 0,
    counts: countsFor([]),
    head_event_hash: GENESIS_HASH,
    ledger_sha256: sha256(Buffer.alloc(0)),
    issues: [code],
  };
}

function withWriterLock(root, callback) {
  const target = join(root, LOCK_FILE);
  let fd;
  let acquired = false;
  try {
    fd = openSync(target, 'wx', 0o600);
    acquired = true;
    writeAll(fd, Buffer.from('locked\n', 'utf8'));
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* no report content */ }
    }
    if (acquired) {
      try { unlinkSync(target); } catch { /* failed lock cleanup remains fail-closed */ }
    }
    if (error instanceof CaptureHold) throw error;
    if (error?.code === 'EEXIST') hold('WRITER_LOCKED');
    hold('WRITER_LOCK_FAILED');
  }
  try {
    return callback();
  } finally {
    try { unlinkSync(target); } catch { /* a missing or stuck lock is observable on the next write */ }
  }
}

function initializeLedger(root) {
  return withWriterLock(root, () => {
    const existing = inspectFixedLedgerPath(root, { required: false });
    if (existing) {
      const ledger = readLedger(root);
      return reportFor('initialize', 'idempotent', ledger.events, ledger.bytes);
    }
    let fd;
    try {
      fd = openSync(ledgerPath(root), 'wx', 0o600);
      fsyncSync(fd);
      closeSync(fd);
    } catch (error) {
      if (fd !== undefined) {
        try { closeSync(fd); } catch { /* no report content */ }
      }
      hold(error?.code === 'EEXIST' ? 'WRITER_RACE_REFUSED' : 'LEDGER_INITIALIZE_FAILED');
    }
    return reportFor('initialize', 'created', [], Buffer.alloc(0));
  });
}

function artifact(kind, ref, bytes) {
  return {
    kind,
    relative_ref: ref,
    byte_length: bytes.length,
    sha256: sha256(bytes),
  };
}

function buildEvent(events, values) {
  const core = {
    schema_version: EVENT_SCHEMA,
    sequence: events.length + 1,
    event_type: values.event_type,
    event_time: values.event_time,
    capture_mode: values.capture_mode,
    scope: values.scope,
    identity: {
      interaction_id: values.interaction_id,
      provider: values.provider ?? null,
      attempt_id: values.attempt_id ?? null,
    },
    artifact: values.artifact,
    links: {
      question_event_hash: values.question_event_hash ?? null,
      answer_event_hash: values.answer_event_hash ?? null,
    },
    previous_event_hash: events.length === 0 ? GENESIS_HASH : events.at(-1).event_hash,
  };
  return { ...core, event_hash: eventHash(core) };
}

function appendEvents(root, ledger, valuesList) {
  guard(valuesList.length > 0, 'LEDGER_APPEND_FAILED');
  const events = [...ledger.events];
  const appended = [];
  for (const values of valuesList) {
    const event = buildEvent(events, values);
    events.push(event);
    appended.push(event);
  }
  const appendBytes = Buffer.concat(appended.map(canonicalBytes));
  guard(events.length <= MAX_LEDGER_EVENTS
    && ledger.bytes.length + appendBytes.length <= MAX_LEDGER_BYTES,
  'LEDGER_CAPACITY_EXCEEDED');
  let fd;
  try {
    const current = readFileSync(ledgerPath(root));
    guard(current.equals(ledger.bytes), 'LEDGER_CHANGED_DURING_WRITE');
    fd = openSync(ledgerPath(root), 'a');
    guard(fstatSync(fd).size === ledger.bytes.length, 'LEDGER_CHANGED_DURING_WRITE');
    writeAll(fd, appendBytes);
    fsyncSync(fd);
    closeSync(fd);
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* fail closed on the next validation */ }
    }
    if (error instanceof CaptureHold) throw error;
    hold('LEDGER_APPEND_FAILED');
  }
  return {
    events,
    bytes: Buffer.concat([ledger.bytes, appendBytes]),
    appended,
  };
}

function exactRequest(request, allowed, required = allowed) {
  guard(isRecord(request)
    && Object.keys(request).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(request, key)),
  'REQUEST_REFUSED');
}

function sameArtifactBytes(root, event, bytes) {
  if (event.artifact.byte_length !== bytes.length || event.artifact.sha256 !== sha256(bytes)) {
    return false;
  }
  const existing = resolveExistingArtifact(
    root,
    event.artifact.relative_ref,
    event.artifact.kind === 'review_status' ? MAX_REVIEW_BYTES : MAX_RAW_BYTES,
  );
  return existing.bytes.equals(bytes);
}

function recordQuestion(root, request) {
  exactRequest(request, [
    'root_path', 'command', 'interaction_id', 'scope', 'event_time', 'question_bytes',
  ]);
  const interactionId = safeInteractionId(request.interaction_id);
  guard(SCOPES.includes(request.scope), 'SCOPE_REFUSED');
  const eventTime = safeEventTime(request.event_time);
  const bytes = safeBytes(request.question_bytes);
  return withWriterLock(root, () => {
    const ledger = readLedger(root);
    const existing = ledger.index.questions.get(interactionId);
    if (existing) {
      guard(existing.scope === request.scope && sameArtifactBytes(root, existing, bytes),
        'IDENTITY_CONFLICT');
      return reportFor('record-question', 'idempotent', ledger.events, ledger.bytes);
    }
    const ref = `raw/questions/${interactionId}.md`;
    createOnlyRawFile(root, ref, bytes);
    const appended = appendEvents(root, ledger, [{
      event_type: 'question_recorded',
      event_time: eventTime,
      capture_mode: 'live_capture',
      scope: request.scope,
      interaction_id: interactionId,
      artifact: artifact('question', ref, bytes),
    }]);
    return reportFor('record-question', 'appended', appended.events, appended.bytes, 1);
  });
}

function recordAnswer(root, request) {
  exactRequest(request, [
    'root_path', 'command', 'interaction_id', 'provider', 'attempt_id', 'event_time',
    'answer_bytes',
  ]);
  const interactionId = safeInteractionId(request.interaction_id);
  guard(PROVIDERS.includes(request.provider), 'PROVIDER_REFUSED');
  const attemptId = safeAttemptId(request.attempt_id);
  const eventTime = safeEventTime(request.event_time);
  const bytes = safeBytes(request.answer_bytes);
  return withWriterLock(root, () => {
    const ledger = readLedger(root);
    const question = ledger.index.questions.get(interactionId);
    guard(question, 'QUESTION_MUST_PRECEDE_ANSWER');
    guard(Date.parse(eventTime) >= Date.parse(question.event_time), 'EVENT_TIME_ORDER_REFUSED');
    const key = answerKey(interactionId, request.provider, attemptId);
    const existing = ledger.index.answers.get(key);
    if (existing) {
      guard(sameArtifactBytes(root, existing, bytes), 'IDENTITY_CONFLICT');
      return reportFor('record-answer', 'idempotent', ledger.events, ledger.bytes);
    }
    const ref = `raw/answers/${interactionId}/${request.provider}/${attemptId}.md`;
    createOnlyRawFile(root, ref, bytes);
    const appended = appendEvents(root, ledger, [{
      event_type: 'answer_received',
      event_time: eventTime,
      capture_mode: 'live_capture',
      scope: question.scope,
      interaction_id: interactionId,
      provider: request.provider,
      attempt_id: attemptId,
      artifact: artifact('answer', ref, bytes),
      question_event_hash: question.event_hash,
    }]);
    return reportFor('record-answer', 'appended', appended.events, appended.bytes, 1);
  });
}

function recordReview(root, request) {
  exactRequest(request, [
    'root_path', 'command', 'interaction_id', 'provider', 'attempt_id', 'event_time',
    'review_ref',
  ]);
  const interactionId = safeInteractionId(request.interaction_id);
  guard(PROVIDERS.includes(request.provider), 'PROVIDER_REFUSED');
  const attemptId = safeAttemptId(request.attempt_id);
  const eventTime = safeEventTime(request.event_time);
  const reviewRef = safeRelativeRef(request.review_ref);
  return withWriterLock(root, () => {
    const review = resolveExistingArtifact(root, reviewRef, MAX_REVIEW_BYTES);
    validateClosedStatusReview(review.bytes, {
      interaction_id: interactionId,
      provider: request.provider,
      attempt_id: attemptId,
    });
    const ledger = readLedger(root);
    const question = ledger.index.questions.get(interactionId);
    guard(question, 'QUESTION_MUST_PRECEDE_REVIEW');
    const key = answerKey(interactionId, request.provider, attemptId);
    const answer = ledger.index.answers.get(key);
    guard(answer, 'ANSWER_MUST_PRECEDE_REVIEW');
    guard(Date.parse(eventTime) >= Date.parse(answer.event_time), 'EVENT_TIME_ORDER_REFUSED');
    if (ledger.index.reviews.has(key)) {
      const existing = ledger.events.find((event) => event.event_type === 'review_recorded'
        && answerKey(
          event.identity.interaction_id,
          event.identity.provider,
          event.identity.attempt_id,
        ) === key);
      guard(existing && sameArtifactBytes(root, existing, review.bytes), 'IDENTITY_CONFLICT');
      return reportFor('record-review', 'idempotent', ledger.events, ledger.bytes);
    }
    const appended = appendEvents(root, ledger, [{
      event_type: 'review_recorded',
      event_time: eventTime,
      capture_mode: 'existing_status_review',
      scope: question.scope,
      interaction_id: interactionId,
      provider: request.provider,
      attempt_id: attemptId,
      artifact: artifact('review_status', review.ref, review.bytes),
      question_event_hash: question.event_hash,
      answer_event_hash: answer.event_hash,
    }]);
    return reportFor('record-review', 'appended', appended.events, appended.bytes, 1);
  });
}

function guardSingleTurnRawArtifact(existing) {
  guard(SINGLE_TURN_RAW_REF.test(existing.ref), 'HISTORICAL_IMPORT_FORMAT_REFUSED');
  if (!JSON_CONTAINER_HEAD.test(existing.bytes.subarray(0, 512).toString('utf8'))) return;
  let container = false;
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(existing.bytes));
    container = Array.isArray(value) || isRecord(value);
  } catch { /* not a decodable JSON container, so a single raw turn stays possible */ }
  guard(!container, 'HISTORICAL_IMPORT_FORMAT_REFUSED');
}

function guardDistinctPhysicalArtifacts(first, second) {
  guard(first.real_path.toLowerCase() !== second.real_path.toLowerCase()
    && !(first.device_id === second.device_id
      && first.inode !== 0n
      && first.inode === second.inode),
  'ARTIFACT_IDENTITY_COLLISION');
}

function importExisting(root, request) {
  exactRequest(request, [
    'root_path', 'command', 'interaction_id', 'scope', 'question_event_time', 'question_ref',
    'provider', 'attempt_id', 'answer_event_time', 'answer_ref',
  ]);
  const interactionId = safeInteractionId(request.interaction_id);
  guard(SCOPES.includes(request.scope), 'SCOPE_REFUSED');
  guard(PROVIDERS.includes(request.provider), 'PROVIDER_REFUSED');
  const attemptId = safeAttemptId(request.attempt_id);
  const questionTime = safeEventTime(request.question_event_time);
  const answerTime = safeEventTime(request.answer_event_time);
  guard(Date.parse(answerTime) >= Date.parse(questionTime), 'EVENT_TIME_ORDER_REFUSED');
  const questionRef = safeRelativeRef(request.question_ref);
  const answerRef = safeRelativeRef(request.answer_ref);
  return withWriterLock(root, () => {
    const questionArtifact = resolveExistingArtifact(root, questionRef);
    const answerArtifact = resolveExistingArtifact(root, answerRef);
    guardSingleTurnRawArtifact(questionArtifact);
    guardSingleTurnRawArtifact(answerArtifact);
    guardDistinctPhysicalArtifacts(questionArtifact, answerArtifact);
    const ledger = readLedger(root);
    let question = ledger.index.questions.get(interactionId);
    if (question) {
      guard(question.scope === request.scope
        && sameArtifactBytes(root, question, questionArtifact.bytes),
      'IDENTITY_CONFLICT');
    }
    const key = answerKey(interactionId, request.provider, attemptId);
    const existingAnswer = ledger.index.answers.get(key);
    if (existingAnswer) {
      guard(sameArtifactBytes(root, existingAnswer, answerArtifact.bytes), 'IDENTITY_CONFLICT');
      return reportFor('import-existing', 'idempotent', ledger.events, ledger.bytes);
    }
    const values = [];
    if (!question) {
      values.push({
        event_type: 'question_recorded',
        event_time: questionTime,
        capture_mode: 'historical_import',
        scope: request.scope,
        interaction_id: interactionId,
        artifact: artifact('question', questionArtifact.ref, questionArtifact.bytes),
      });
      question = buildEvent(ledger.events, values[0]);
    } else {
      guard(Date.parse(answerTime) >= Date.parse(question.event_time), 'EVENT_TIME_ORDER_REFUSED');
    }
    values.push({
      event_type: 'answer_received',
      event_time: answerTime,
      capture_mode: 'historical_import',
      scope: request.scope,
      interaction_id: interactionId,
      provider: request.provider,
      attempt_id: attemptId,
      artifact: artifact('answer', answerArtifact.ref, answerArtifact.bytes),
      question_event_hash: question.event_hash,
    });
    const appended = appendEvents(root, ledger, values);
    return reportFor(
      'import-existing',
      'appended',
      appended.events,
      appended.bytes,
      values.length,
    );
  });
}

function validateLedger(root) {
  const ledger = readLedger(root);
  return reportFor('validate', 'validated', ledger.events, ledger.bytes);
}

function validateQueryFilters(filters) {
  guard(filters === undefined || isRecord(filters), 'QUERY_REFUSED');
  if (filters === undefined) return {};
  const allowed = ['event_type', 'interaction_id', 'scope', 'provider', 'attempt_id'];
  guard(Object.keys(filters).every((key) => allowed.includes(key)), 'QUERY_REFUSED');
  if (Object.hasOwn(filters, 'event_type')) {
    guard(EVENT_TYPES.includes(filters.event_type), 'QUERY_REFUSED');
  }
  if (Object.hasOwn(filters, 'interaction_id')) safeInteractionId(filters.interaction_id);
  if (Object.hasOwn(filters, 'scope')) guard(SCOPES.includes(filters.scope), 'QUERY_REFUSED');
  if (Object.hasOwn(filters, 'provider')) guard(PROVIDERS.includes(filters.provider), 'QUERY_REFUSED');
  if (Object.hasOwn(filters, 'attempt_id')) safeAttemptId(filters.attempt_id);
  return filters;
}

function queryLedger(root, request) {
  exactRequest(request, ['root_path', 'command', 'filters'], ['root_path', 'command']);
  const filters = validateQueryFilters(request.filters);
  const ledger = readLedger(root);
  const selected = ledger.events.filter((event) => {
    if (filters.event_type && event.event_type !== filters.event_type) return false;
    if (filters.interaction_id && event.identity.interaction_id !== filters.interaction_id) return false;
    if (filters.scope && event.scope !== filters.scope) return false;
    if (filters.provider && event.identity.provider !== filters.provider) return false;
    if (filters.attempt_id && event.identity.attempt_id !== filters.attempt_id) return false;
    return true;
  });
  return reportFor('query', 'read_only', ledger.events, ledger.bytes, 0, {
    query_schema_version: QUERY_SCHEMA,
    query_count: selected.length,
    events: selected,
  });
}

export function captureQaInteraction(request = {}) {
  const operation = isRecord(request) ? request.command : undefined;
  try {
    guard(isRecord(request)
      && typeof request.command === 'string'
      && COMMANDS.includes(request.command),
    'COMMAND_REFUSED');
    const root = openRoot(request.root_path);
    if (request.command === 'initialize') {
      exactRequest(request, ['root_path', 'command']);
      return initializeLedger(root);
    }
    if (request.command === 'validate') {
      exactRequest(request, ['root_path', 'command']);
      return validateLedger(root);
    }
    if (request.command === 'record-question') return recordQuestion(root, request);
    if (request.command === 'record-answer') return recordAnswer(root, request);
    if (request.command === 'record-review') return recordReview(root, request);
    if (request.command === 'import-existing') return importExisting(root, request);
    return queryLedger(root, request);
  } catch (error) {
    return failureReport(
      operation,
      error instanceof CaptureHold ? error.code : 'CAPTURE_OPERATION_FAILED',
    );
  }
}

export const SE_CORE_EVAL_QA_LEDGER_FILE = LEDGER_FILE;
