// Local deterministic producer: mail collector state -> SAFE_PROJECTION_SCHEMA_V1.
//
// This is the only salpi-side code that touches mail stores, and it runs locally. It counts raw
// lines without parsing them, parses event lines only to rebuild the collector's dedupe key
// (`source|provider_message_id|received_at`, see gateway/mail_fetch/collector/pipeline/dedupe.py),
// and reads the run summary, dedupe state and cursor state for integers, booleans and timestamps.
// Nothing it read leaves this module except counts, digests, fixed locators and codes, and the
// result must pass `validateSafeProjection` before it is returned.
//
// Layout it reads (unchanged collector contract, gateway/mail_fetch/collector/storage/sink.py and
// runner.py): <workspace>/mail/raw/<source>/<YYYY>/<YYYY-MM>.jsonl,
// <workspace>/{mail,ads,quarantine}/events/<source>/<YYYY>/<YYYY-MM>.jsonl,
// <runtime>/logs/last_run_summary.json, <runtime>/state/dedupe_keys.json,
// <runtime>/state/cursor_state.json.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { expectedProjectionStatus } from './salpi_audit.mjs';
import {
  MAIL_INPUTS, MAIL_INPUT_LOCATORS as LOCATOR, MAIL_PIPELINE_PROJECTION_TYPE, PROJECTION_CLAIM_CEILING,
  SAFE_PROJECTION_SCHEMA_VERSION, validateSafeProjection,
} from './safe_projection.mjs';

export const MAIL_PROJECTOR_ID = 'salpi_mail_pipeline_projector';
export const MAIL_PROJECTOR_VERSION = '0.1.0';
export const MAIL_SOURCES = Object.freeze(['gmail', 'hiworks', 'o365']);
const EVENT_BUCKETS = Object.freeze(['mail', 'ads', 'quarantine']);
const RUN_SCHEMA = 'email.fetch.run.v1';
const DEDUPE_SCHEMA = 'email.fetch.dedupe.v1';
const CURSOR_SCHEMA = 'email.fetch.cursor.v1';

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function isRealDirectory(path) {
  try {
    const info = await lstat(path);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

// Regular *.jsonl files below a directory, sorted, never following links.
async function jsonlFiles(root) {
  const found = [];
  async function walk(dir, depth) {
    if (depth > 4) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(full);
    }
  }
  await walk(root, 0);
  return found;
}

// Counts non-empty lines by bytes only. The raw payload is never decoded or parsed.
async function countLines(file) {
  let count = 0;
  let lineHasBytes = false;
  for await (const chunk of createReadStream(file)) {
    for (const byte of chunk) {
      if (byte === 0x0a) {
        if (lineHasBytes) count += 1;
        lineHasBytes = false;
      } else if (byte !== 0x0d && byte !== 0x20 && byte !== 0x09) {
        lineHasBytes = true;
      }
    }
  }
  return lineHasBytes ? count + 1 : count;
}

// Counts event lines and rebuilds dedupe keys for the given source. Keys stay in memory only.
async function scanEvents(file, source, keys) {
  let count = 0;
  let unparseable = 0;
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === '') continue;
    count += 1;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === 'object' && typeof row.provider_message_id === 'string') {
        keys.add(`${typeof row.source === 'string' ? row.source : source}|${row.provider_message_id}|${row.received_at ?? ''}`);
      } else {
        unparseable += 1;
      }
    } catch {
      unparseable += 1;
    }
  }
  return { count, unparseable };
}

async function readJsonFile(path) {
  let bytes;
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) return { state: 'absent' };
    bytes = await readFile(path);
  } catch {
    return { state: 'absent' };
  }
  try {
    return { state: 'present', json: JSON.parse(bytes.toString('utf8')), digest: sha256(bytes) };
  } catch {
    return { state: 'unreadable' };
  }
}

const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

function utcMs(value) {
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

export function mailScopeRef(source, scopeId) {
  const fingerprint = createHash('sha256').update(`${source}|${scopeId}`, 'utf8').digest('hex').slice(0, 12);
  return `mail_pipeline:${source}:${fingerprint}`;
}

// options: { runtimeRoot, workspaceRoot, source, scopeId, observedAt? }
// Returns { status: 'OK', value, digest } or { status: 'HOLD', hold_code }.
export async function projectMailPipeline(options) {
  const { runtimeRoot, workspaceRoot, source, scopeId } = options ?? {};
  if (typeof runtimeRoot !== 'string' || typeof workspaceRoot !== 'string') throw new TypeError('runtimeRoot and workspaceRoot are required');
  if (!MAIL_SOURCES.includes(source)) throw new TypeError('source must be gmail, hiworks or o365');
  if (typeof scopeId !== 'string' || scopeId.length === 0 || scopeId.length > 200) throw new TypeError('scopeId is required');
  const observedAt = options.observedAt ?? new Date().toISOString();

  const metrics = {};
  const flags = {};
  const timestamps = {};
  const digests = {};
  const missing = new Set();
  const holdCodes = new Set();

  // raw store: line counts only
  const rawRoot = join(workspaceRoot, 'mail', 'raw', source);
  if (await isRealDirectory(rawRoot)) {
    let total = 0;
    for (const file of await jsonlFiles(rawRoot)) total += await countLines(file);
    metrics.raw_count = total;
  } else {
    missing.add('raw_store');
  }

  // event store: every bucket the sink can route to, so a routed event is not counted as absent
  const eventKeys = new Set();
  let eventStoreSeen = false;
  let eventTotal = 0;
  for (const bucket of EVENT_BUCKETS) {
    const bucketRoot = join(workspaceRoot, bucket, 'events', source);
    if (!(await isRealDirectory(bucketRoot))) continue;
    eventStoreSeen = true;
    let bucketCount = 0;
    for (const file of await jsonlFiles(bucketRoot)) {
      const { count, unparseable } = await scanEvents(file, source, eventKeys);
      bucketCount += count;
      if (unparseable > 0) holdCodes.add('mail_event_line_unparseable');
    }
    metrics[`event_count_${bucket}`] = bucketCount;
    eventTotal += bucketCount;
  }
  if (eventStoreSeen) metrics.event_count = eventTotal;
  else missing.add('event_store');

  // run receipt: integers, one boolean and one timestamp from this source's row
  const receipt = await readJsonFile(join(runtimeRoot, 'logs', 'last_run_summary.json'));
  const row = receipt.state === 'present' && receipt.json?.schema_version === RUN_SCHEMA && Array.isArray(receipt.json.sources)
    ? receipt.json.sources.find((item) => item && item.source === source)
    : undefined;
  if (row && typeof row === 'object') {
    // A dry run still persists its summary with would-be write counts but writes no store rows
    // (runner.py dry_run branch). Its write counts are not evidence of a write, so they are left
    // out and the checks that need them stay UNKNOWN.
    const dryRun = row.notifications?.skipped_reason === 'dry_run' || row.mail_candidates?.skipped_reason === 'dry_run';
    flags.receipt_dry_run = dryRun;
    const fields = dryRun
      ? [['fetched', 'receipt_fetched'], ['duplicates', 'receipt_duplicates']]
      : [['fetched', 'receipt_fetched'], ['new_events', 'receipt_new_events'], ['duplicates', 'receipt_duplicates'],
        ['raw_written', 'receipt_raw_written'], ['event_written', 'receipt_event_written']];
    for (const [from, to] of fields) {
      if (isCount(row[from])) metrics[to] = row[from];
    }
    if (typeof row.partial === 'boolean') flags.receipt_partial = row.partial;
    const finishedAt = utcMs(receipt.json.finished_at);
    if (finishedAt !== undefined) timestamps.receipt_finished_at = finishedAt;
    digests.receipt = receipt.digest;
  } else {
    missing.add('receipt');
    if (receipt.state === 'unreadable') holdCodes.add('mail_receipt_unreadable');
  }

  // dedupe state: key count for this source, and keys with no materialized event
  const dedupe = await readJsonFile(join(runtimeRoot, 'state', 'dedupe_keys.json'));
  if (dedupe.state === 'present' && dedupe.json?.schema_version === DEDUPE_SCHEMA && Array.isArray(dedupe.json.keys)) {
    const own = dedupe.json.keys.filter((key) => typeof key === 'string' && key.startsWith(`${source}|`));
    metrics.dedupe_key_count = own.length;
    flags.dedupe_present = own.length > 0;
    if (eventStoreSeen) metrics.dedupe_orphan_count = own.filter((key) => !eventKeys.has(key)).length;
    const updatedAt = utcMs(dedupe.json.updated_at);
    if (updatedAt !== undefined) timestamps.dedupe_updated_at = updatedAt;
    digests.dedupe_state = dedupe.digest;
  } else {
    missing.add('dedupe_state');
    if (dedupe.state === 'unreadable') holdCodes.add('mail_dedupe_state_unreadable');
  }

  // cursor state: whether this source has a cursor at all; the cursor value itself never leaves
  const cursor = await readJsonFile(join(runtimeRoot, 'state', 'cursor_state.json'));
  const cursorRow = cursor.state === 'present' && cursor.json?.schema_version === CURSOR_SCHEMA
    ? cursor.json.sources?.[source]
    : undefined;
  if (cursorRow && typeof cursorRow === 'object') {
    metrics.cursor_seen = cursorRow.cursor === null || cursorRow.cursor === undefined ? 0 : 1;
    const updatedAt = utcMs(cursorRow.updated_at);
    if (updatedAt !== undefined) timestamps.cursor_updated_at = updatedAt;
    digests.cursor_state = cursor.digest;
  } else {
    missing.add('cursor_state');
    if (cursor.state === 'unreadable') holdCodes.add('mail_cursor_state_unreadable');
  }

  const missingInputs = MAIL_INPUTS.filter((input) => missing.has(input));
  const coverageState = missingInputs.length === 0 ? 'complete'
    : missingInputs.length === MAIL_INPUTS.length ? 'unavailable' : 'partial';

  const projection = {
    schema_version: SAFE_PROJECTION_SCHEMA_VERSION,
    projection_type: MAIL_PIPELINE_PROJECTION_TYPE,
    producer: { id: MAIL_PROJECTOR_ID, version: MAIL_PROJECTOR_VERSION },
    observed_at: utcMs(observedAt),
    scope_ref: mailScopeRef(source, scopeId),
    status: expectedProjectionStatus(metrics, missingInputs, MAIL_INPUTS.length),
    metrics,
    flags,
    timestamps,
    coverage: { state: coverageState, missing_inputs: missingInputs },
    digests,
    locators: MAIL_INPUTS.filter((input) => !missing.has(input)).map((input) => LOCATOR[input]),
    hold_codes: [...holdCodes].sort(),
    safety: {
      raw_payload_copied: false,
      message_bodies_returned: false,
      identities_returned: false,
      absolute_paths_returned: false,
    },
    claim_ceiling: PROJECTION_CLAIM_CEILING,
  };
  return validateSafeProjection(projection);
}
