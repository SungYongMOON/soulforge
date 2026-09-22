#!/usr/bin/env node
// Night chain runner: replaces a set of independently-clocked nightly cron jobs
// (SoulforgeVoiceConversationList 00:00, SoulforgeWorkspaceLedgers 05:30,
// SoulforgeGraphSync every 30 min) for an OWNER-CHOSEN ORDERED SUBSET, where
// each step only starts after the previous step's own receipt says success --
// not at a fixed clock blind to whether the step before it actually finished.
// The motivating gap: guild_hall/workspace_ledgers/ops/mail_attribution_index.mjs
// (the mail attribution index builder) is in no automation chain yet and its
// consumer fails closed once the index is older than 36h.
//
// This file is deliberately self-contained: it imports nothing but node:
// builtins. Its own lane spec (night_chain_lane.spec.json, lane id
// night-chain-v1) must carry an import closure of node: builtins plus files
// inside guild_hall/context_engine/ only -- reaching into
// guild_hall/workspace_ledgers/ (for its own, already-written
// `redactHostPaths`) or guild_hall/deployment_pack/ (for its own
// `verifyLane`) would pull a cross-module dependency into this lane, so both
// are reimplemented locally below rather than imported (the same posture this
// module's README already documents for `src/runtime/safe_pattern.mjs`
// duplicating, rather than importing, `guild_hall/workspace_ledgers/src/
// classifier.mjs`'s own regex-safety check).
//
// A step is one already-existing lane entry point, run as `node <lane_root>/
// <entry> <args...>` -- this file starts and stops OTHER processes, it does
// not import or re-implement voice_conversation_list_nightly.mjs, daily_
// refresh.mjs, mail_attribution_index.mjs or estate_graph_sync.mjs.
//
// Chain config shape (an external, Owner-controlled JSON file, sha256-pinned
// on the command line -- never hardcoded, never trusted before its digest is
// checked):
//   { "schema_version": "soulforge.night_chain_config.v1",
//     "steps": [ { id, lane_root, entry, args, receipts_dir, success_rule,
//                  on_failure, timeout_minutes, enabled, lane_manifest_sha256,
//                  deadline, note } , ... ] }
// This file accepts ONLY the `{ steps: [...] }` object shape (not a bare
// top-level array) -- picked for consistency with every other schema in this
// module, which is always an object with its own `schema_version`.
//
//   id                    unique, `[a-zA-Z][a-zA-Z0-9_-]*`.
//   lane_root             a built lane directory (never this dev checkout).
//   entry                 a `.mjs` path relative to lane_root; must resolve
//                         inside lane_root (no `..`, no absolute path).
//   args                  string[] passed straight to that entry as argv --
//                         never a shell string, so nothing here is shell-
//                         interpreted.
//   receipts_dir          where THAT STEP already writes its own receipts;
//                         this runner never writes there.
//   success_rule          optional; null/absent means "exit code 0 is
//                         enough". Given, `{ receipt_glob, json_path,
//                         allowed_values }`: after the child exits, this
//                         globs receipts_dir (recursively, so
//                         "*/*.json" reaches a per-project subdirectory the
//                         way estate_graph_sync.mjs's own receipts do), keeps
//                         only files whose mtime is STRICTLY AFTER this
//                         step's own start (mtime >= start + 1 ms; a
//                         PRE-EXISTING receipt from a run before this chain
//                         ever started this step must never count as this
//                         step's success signal -- see `evaluateSuccessRule`
//                         and its S1 note), takes the newest of what is
//                         left, and checks `json_path` (dot-separated) against
//                         `allowed_values`. mtime, not an embedded timestamp
//                         field, is the freshness signal: every step's own
//                         receipt shape names its own timestamp field
//                         differently (`ran_at`, `built_at`, ...), and mtime
//                         is the one thing every receipt file has regardless.
//   on_failure            "stop" halts the whole chain at this step; every
//                         step after it is recorded `not_started` and never
//                         runs. "continue" records the failure and moves on.
//   timeout_minutes       may be fractional (a synthetic test lane can use
//                         0.02 = 1.2s). A child that runs longer is sent
//                         SIGTERM, then SIGKILL after a short grace
//                         (`TIMEOUT_KILL_GRACE_MS`), and is recorded
//                         `timed_out: true` -- always a failure for
//                         `on_failure` purposes, regardless of its own exit
//                         code (there usually is none once it is killed).
//   enabled               default true. `false` is listed in `--dry`'s plan
//                         and the real receipt as skipped, and is NEVER
//                         executed by a plain run, `--from`, or `--only` --
//                         `--only` explicitly naming a disabled step is
//                         refused outright (a clear usage error) rather than
//                         silently running it or silently doing nothing.
//   lane_manifest_sha256  `sha256:<hex>`, the exact digest of that lane's own
//                         `LANE_MANIFEST.sha256` FILE (its bytes, the same
//                         thing every `register-*-task.ps1` in this module
//                         already pins with its own `Get-Sha256File`) -- not
//                         a re-verification of every entry that file lists.
//                         Checked for EVERY ENABLED step before this runner
//                         ever starts step 1, `--only` and `--from` included.
//                         A step with `enabled: false` is exempt: it can
//                         never run, and the whole point of a disabled
//                         placeholder (the example config's
//                         `voice_cards_to_index`) is to reserve a slot for a
//                         lane that does not exist yet -- demanding its
//                         manifest would make every placeholder a chain-
//                         blocking CONFIG_INVALID.
//   deadline, note        both optional. Copied verbatim into that step's own
//                         row of the chain receipt (`deadline`/`note` fields,
//                         `null` when absent) -- R2, 2026-09-22 review: the
//                         first version parsed them and then dropped them.
//                         `deadline` is NOT interpreted by this version --
//                         only the chain-level `--deadline` below governs
//                         when this runner stops starting new steps. A
//                         per-step override was in the original ask but
//                         nothing about this build needs one yet; carried so
//                         a future version can honour it without a schema
//                         change, documented rather than silently implemented.
//
// Chain-level flags:
//   --chain-config <file> --chain-config-sha256 sha256:<hex>   required,
//     verified before the config's own bytes are ever parsed or trusted.
//   --receipts <dir>      required; THIS chain's own receipts dir -- never
//                         any step's own `receipts_dir`. Holds the lock file
//                         and the one chain receipt this run writes.
//   --deadline HH:MM [--scheduled-start HH:MM]   optional; anchored exactly
//     like `voice_conversation_list_nightly.mjs`'s own `nextDeadlineInstant`
//     (Asia/Seoul, fixed +09:00, next occurrence strictly after the anchor;
//     `--scheduled-start` anchors to the registered trigger time rather than
//     to whenever this process actually started, for the same reason that
//     file documents -- a late-woken machine must not get a fresh runway).
//     Reimplemented here rather than imported, for the closure reason above;
//     read that file's own doc before changing either copy.
//   --dry                  resolves and prints the plan (every step, its lane
//                         manifest check, its args, whether it would run or
//                         is skipped disabled/out-of-scope) and writes
//                         NOTHING -- no lock, no receipt, not even a log file.
//   --only <id> | --from <id>   mutually exclusive; still validate every
//                         enabled step's config/lane digest first, and still
//                         respect on_failure/deadline/lock for the step(s)
//                         they touch. Naming a disabled step with either is
//                         refused (S5, 2026-09-22 review -- `--from` the same
//                         as `--only`: an explicitly named start point that
//                         can never run is a mistake, not a request).
//   --node-path <path>    the `node` executable used to run every step
//                         (default `process.execPath`) -- the registrar pins
//                         this to its own verified `-NodePath`.
//   Any other `--flag`, or any bare positional token, is refused outright
//   (S3, 2026-09-22 review): a typo like `--dry-run` must never be silently
//   ignored and then run the chain for real.
//
// Exit codes: 0 OK (matches voice_conversation_list_nightly.mjs's own 0),
// 2 FAILED (2, same file), 3 LOCK_HELD (3, same file), 4 SKIPPED_PAST_DEADLINE
// (4, same file) -- these four are read from that file's own `main()`, not
// assumed. This file adds three more that file has no equivalent for (0-4
// were already spoken for by the reused mapping): 5 CONFIG_INVALID (the chain
// config's digest, shape, or any enabled step's lane-manifest digest failed
// validation before anything ran -- also every other pre-run usage refusal,
// such as an unknown flag, `--only`/`--from` both given, or either naming an
// unknown/disabled step), 6 PARTIAL (the deadline was reached BETWEEN steps
// -- some ran, some did not, and none of the ones that did run failed),
// 7 NOTHING_TO_RUN (S4, 2026-09-22 review: every in-scope step was disabled,
// so the run attempted nothing -- not `OK`/0, which a watcher reads as "the
// chain did its work tonight"; its own code rather than 4 so it is never
// mistaken for a deadline stop). A receipt is still written for it.
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const NIGHT_CHAIN_CONFIG_SCHEMA = 'soulforge.night_chain_config.v1';
export const NIGHT_CHAIN_RECEIPT_SCHEMA = 'soulforge.night_chain_receipt.v1';
export const LOCK_FILE_NAME = 'night_chain.lock';
export const CHAIN_LOCK_MARGIN_MS = 30 * 60 * 1000;
export const TIMEOUT_KILL_GRACE_MS = 5000;
export const MAX_CAPTURED_LOG_LINES = 4000;
const MAX_CONFIG_BYTES = 1024 * 1024;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const STEP_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/u;
const DEADLINE_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/u;

export class NightChainError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'NightChainError';
    this.code = code;
    this.detail = detail ?? null;
  }
}
const fail = (code, detail) => { throw new NightChainError(code, detail); };

const sha256Prefixed = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

// ------------------------------------------------------------- redaction
// See the file-header comment for why this is a local reimplementation, not
// an import of guild_hall/workspace_ledgers/src/refresh.mjs's own
// `redactHostPaths` (same three shapes: quoted, unquoted Windows/UNC,
// unquoted POSIX -- kept in a separate module-scope export, `redactHostPathsLocal`,
// so a test can exercise it directly without spawning a child).
const QUOTED_HOST_PATH = /(['"])((?:[A-Za-z]:[\\/]|\\\\|\/)[^'"]*)\1/gu;
const UNQUOTED_WINDOWS_PATH = /[A-Za-z]:[\\/][^\s'"]+/gu;
const UNQUOTED_UNC_PATH = /\\\\[^\s'"]+/gu;
const UNQUOTED_POSIX_PATH = /(^|[\s(])(\/[^\s'")]+\/[^\s'")]*)/gu;
function lastPathSegment(value) {
  const parts = String(value).split(/[\\/]+/u).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(value);
}
export function redactHostPathsLocal(message) {
  if (typeof message !== 'string') return message;
  let out = message.replace(QUOTED_HOST_PATH, (match, quote, innerPath) => `${quote}${lastPathSegment(innerPath)}${quote}`);
  out = out.replace(UNQUOTED_WINDOWS_PATH, match => lastPathSegment(match));
  out = out.replace(UNQUOTED_UNC_PATH, match => lastPathSegment(match));
  out = out.replace(UNQUOTED_POSIX_PATH, (match, pre, p) => `${pre}${lastPathSegment(p)}`);
  return out;
}

// ------------------------------------------------------------- atomic write
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_RETRY_ATTEMPTS = 4;
const RENAME_RETRY_DELAY_MS = 50;
function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/** Temp-write-then-rename, with a short bounded retry on Windows's transient
 * EPERM/EACCES/EBUSY (a reader briefly holding the file open) before falling
 * back to a direct overwrite -- the same lesson
 * `voice_conversation_list_nightly.mjs`'s own `atomicWriteFileSync` documents
 * in more depth; this is the essential shape without its full recovered-path
 * fallback (this file writes exactly one receipt per run, never twice). */
export function atomicWriteFileSync(filePath, buffer) {
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${randomUUID()}`);
  writeFileSync(tmpPath, buffer);
  for (let attempt = 0; ; attempt++) {
    try { renameSync(tmpPath, filePath); return; }
    catch (error) {
      if (!RETRYABLE_RENAME_CODES.has(error?.code)) throw error;
      if (attempt >= RENAME_RETRY_ATTEMPTS - 1) break;
      sleepSync(RENAME_RETRY_DELAY_MS);
    }
  }
  writeFileSync(filePath, buffer);
  try { rmSync(tmpPath, { force: true }); } catch { /* best-effort cleanup only */ }
}

// ----------------------------------------------------------------- deadline
// Reimplemented from `voice_conversation_list_nightly.mjs`'s `nextDeadlineInstant`/
// `lastOccurrenceAtOrBefore` -- identical semantics, kept in sync by hand (see
// the file-header comment for why this is not an import). Asia/Seoul, fixed
// +09:00, no DST.
function seoulMsFor(iso, code) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) fail(code);
  return ms + 9 * 60 * 60 * 1000;
}
function lastOccurrenceAtOrBefore(anchorIso, hhmm) {
  const match = DEADLINE_HHMM.exec(hhmm ?? '');
  if (match === null) fail('night_chain_scheduled_start_invalid');
  const seoulAnchorMs = seoulMsFor(anchorIso, 'night_chain_scheduled_start_invalid');
  const seoulAnchor = new Date(seoulAnchorMs);
  const candidateSeoulMs = Date.UTC(seoulAnchor.getUTCFullYear(), seoulAnchor.getUTCMonth(), seoulAnchor.getUTCDate(),
    Number(match[1]), Number(match[2]), 0, 0);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const resolvedSeoulMs = candidateSeoulMs > seoulAnchorMs ? candidateSeoulMs - oneDayMs : candidateSeoulMs;
  return new Date(resolvedSeoulMs - 9 * 60 * 60 * 1000).toISOString();
}
export function nextDeadlineInstant(nowIso, hhmm, scheduledStart = null) {
  const match = DEADLINE_HHMM.exec(hhmm ?? '');
  if (match === null) fail('night_chain_deadline_invalid');
  if (scheduledStart !== null && scheduledStart === hhmm) fail('night_chain_deadline_equals_scheduled_start');
  const anchorIso = scheduledStart !== null ? lastOccurrenceAtOrBefore(nowIso, scheduledStart) : nowIso;
  const seoulAnchorMs = seoulMsFor(anchorIso, 'night_chain_deadline_invalid');
  const seoulAnchor = new Date(seoulAnchorMs);
  const candidateSeoulMs = Date.UTC(seoulAnchor.getUTCFullYear(), seoulAnchor.getUTCMonth(), seoulAnchor.getUTCDate(),
    Number(match[1]), Number(match[2]), 0, 0);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const deadlineSeoulMs = candidateSeoulMs <= seoulAnchorMs ? candidateSeoulMs + oneDayMs : candidateSeoulMs;
  return new Date(deadlineSeoulMs - 9 * 60 * 60 * 1000).toISOString();
}

// -------------------------------------------------------------------- lock
function wrapLockError(cause) {
  const error = new NightChainError('night_chain_lock_unavailable');
  error.cause_code = typeof cause?.code === 'string' ? cause.code : null;
  return error;
}
/** Sum of every configured step's own `timeout_minutes` (every step in the
 * config, not just the ones a `--only`/`--from` run touches -- a lock this
 * run's own registrar could re-run at any scope must stay safely stale-dated
 * against the chain's full worst case) plus `CHAIN_LOCK_MARGIN_MS` (30
 * minutes, the margin the build spec asked for, documented once here). */
export function computeStaleLockMs(steps) {
  const totalTimeoutMs = steps.reduce((sum, step) => sum + Math.max(0, step.timeout_minutes) * 60 * 1000, 0);
  return totalTimeoutMs + CHAIN_LOCK_MARGIN_MS;
}
/** Same shape as `voice_conversation_list_nightly.mjs`'s own `acquireLock` --
 * see that file's doc for the reclaim race and why `wx` is what makes it
 * EEXIST-safe. Reimplemented rather than imported for the closure reason in
 * the file header. */
export function acquireLock(receiptsDir, now, staleLockMs) {
  mkdirSync(receiptsDir, { recursive: true });
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs <= staleLockMs) return { held: true, existing, age_ms: ageMs };
    try { rmSync(lockFile, { force: true }); } catch (error) { throw wrapLockError(error); }
    try {
      writeFileSync(lockFile, encode({ pid: process.pid, started_at: now, reclaimed_from: existing }), { flag: 'wx' });
    } catch (error) {
      if (error?.code === 'EEXIST') return { held: true, existing, age_ms: ageMs };
      throw wrapLockError(error);
    }
    return { held: false, reclaimed: true, previous: existing, age_ms: ageMs };
  }
  try { writeFileSync(lockFile, encode({ pid: process.pid, started_at: now }), { flag: 'wx' }); }
  catch (error) {
    if (error?.code === 'EEXIST') return { held: true, existing: null, age_ms: 0 };
    throw wrapLockError(error);
  }
  return { held: false, reclaimed: false, previous: null, age_ms: null };
}
export function releaseLock(receiptsDir, ownership = null) {
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (ownership !== null) {
    let current;
    try { current = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { return; }
    if (current?.pid !== ownership.pid || current?.started_at !== ownership.started_at) return;
  }
  try { rmSync(lockFile, { force: true }); } catch { /* nothing to release */ }
}

// ------------------------------------------------------------------- config
function validateStepShape(step, index) {
  if (step === null || typeof step !== 'object' || Array.isArray(step)) fail('night_chain_step_shape_invalid', String(index));
  for (const field of ['id', 'lane_root', 'entry', 'receipts_dir', 'on_failure', 'lane_manifest_sha256']) {
    if (typeof step[field] !== 'string' || step[field].trim() === '') fail('night_chain_step_field_missing', `${index}:${field}`);
  }
  if (!STEP_ID_RE.test(step.id)) fail('night_chain_step_id_invalid', step.id);
  if (!['stop', 'continue'].includes(step.on_failure)) fail('night_chain_step_on_failure_invalid', step.id);
  if (!SHA256_RE.test(step.lane_manifest_sha256)) fail('night_chain_step_lane_manifest_sha256_invalid', step.id);
  if (!Number.isFinite(step.timeout_minutes) || step.timeout_minutes <= 0) fail('night_chain_step_timeout_invalid', step.id);
  if (step.args !== undefined && !(Array.isArray(step.args) && step.args.every(a => typeof a === 'string'))) {
    fail('night_chain_step_args_invalid', step.id);
  }
  if (step.enabled !== undefined && typeof step.enabled !== 'boolean') fail('night_chain_step_enabled_invalid', step.id);
  if (step.success_rule !== undefined && step.success_rule !== null) {
    const rule = step.success_rule;
    if (rule === null || typeof rule !== 'object' || Array.isArray(rule)
      || typeof rule.receipt_glob !== 'string' || rule.receipt_glob.trim() === ''
      || typeof rule.json_path !== 'string' || rule.json_path.trim() === ''
      || !Array.isArray(rule.allowed_values) || rule.allowed_values.length === 0) {
      fail('night_chain_step_success_rule_invalid', step.id);
    }
  }
  if (path.isAbsolute(step.entry) || step.entry.split(/[\\/]+/u).some(seg => seg === '..' || seg === '.')) {
    fail('night_chain_step_entry_traversal', step.id);
  }
}

/** Verifies the chain config file's own sha256 BEFORE trusting a byte of its
 * content (an external, Owner-controlled file -- see the file header), then
 * parses and shape-checks every step. Throws on the first problem found;
 * nothing downstream of this call ever sees a partially-valid config. */
export function loadChainConfig({ configPath, expectedConfigSha256 }) {
  if (!SHA256_RE.test(expectedConfigSha256 ?? '')) fail('night_chain_config_sha256_usage_invalid');
  let bytes;
  try { bytes = readFileSync(configPath); }
  catch (error) {
    const wrapped = new NightChainError('night_chain_config_unreadable');
    wrapped.cause_code = typeof error?.code === 'string' ? error.code : null;
    throw wrapped;
  }
  if (bytes.length > MAX_CONFIG_BYTES) fail('night_chain_config_too_large');
  const actualSha256 = sha256Prefixed(bytes);
  if (actualSha256 !== expectedConfigSha256) fail('night_chain_config_sha256_mismatch');
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { fail('night_chain_config_json_invalid'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) fail('night_chain_config_shape_invalid');
  if (parsed.schema_version !== NIGHT_CHAIN_CONFIG_SCHEMA) fail('night_chain_config_schema_unrecognized');
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) fail('night_chain_config_steps_empty');

  const seenIds = new Set();
  const steps = parsed.steps.map((step, index) => {
    validateStepShape(step, index);
    if (seenIds.has(step.id)) fail('night_chain_config_step_id_duplicate', step.id);
    seenIds.add(step.id);
    return {
      id: step.id, lane_root: step.lane_root, entry: step.entry,
      args: Array.isArray(step.args) ? step.args.slice() : [],
      receipts_dir: step.receipts_dir, success_rule: step.success_rule ?? null,
      on_failure: step.on_failure, timeout_minutes: step.timeout_minutes,
      enabled: step.enabled !== false, lane_manifest_sha256: step.lane_manifest_sha256,
      deadline: step.deadline ?? null, note: typeof step.note === 'string' ? step.note : null,
    };
  });
  return { steps, config_sha256: actualSha256 };
}

/** Every step's `lane_manifest_sha256` against that lane's actual
 * `LANE_MANIFEST.sha256` FILE (its bytes -- the same thing every
 * `register-*-task.ps1` in this module already pins with its own
 * `Get-Sha256File`), and every step's `entry` against the lane root it
 * actually resolves inside and actually exists at. Checked for EVERY ENABLED
 * step in the config -- before ANY step runs, `--only`/`--from` included; a
 * disabled step is skipped here because it can never run (see the file-header
 * comment on `lane_manifest_sha256`). Throws on the first mismatch; nothing
 * runs after a partial check. */
export function verifyStepLanes(steps) {
  for (const step of steps) {
    if (step.enabled === false) continue;
    const manifestPath = path.join(step.lane_root, 'LANE_MANIFEST.sha256');
    let manifestBytes;
    try { manifestBytes = readFileSync(manifestPath); }
    catch (error) {
      const wrapped = new NightChainError('night_chain_lane_manifest_unreadable', step.id);
      wrapped.cause_code = typeof error?.code === 'string' ? error.code : null;
      throw wrapped;
    }
    if (sha256Prefixed(manifestBytes) !== step.lane_manifest_sha256) fail('night_chain_lane_manifest_sha256_mismatch', step.id);

    const laneRootAbs = path.resolve(step.lane_root);
    const entryAbs = path.resolve(laneRootAbs, step.entry);
    const boundary = laneRootAbs.endsWith(path.sep) ? laneRootAbs : laneRootAbs + path.sep;
    if (entryAbs !== laneRootAbs && !entryAbs.startsWith(boundary)) fail('night_chain_step_entry_outside_lane_root', step.id);
    if (!existsSync(entryAbs)) fail('night_chain_step_entry_missing', step.id);
  }
}

function normalizeDir(p) { return path.resolve(p).replace(/[\\/]+$/u, ''); }
function isSameOrChild(parent, candidate) {
  const p = normalizeDir(parent);
  const c = normalizeDir(candidate);
  return c === p || c.startsWith(p + path.sep);
}
/** This runner may never write into a step's own `receipts_dir` or lane
 * root (build spec (l)) -- a static guard against a config that would make
 * the chain's own receipts dir the same as, or nested inside, either. */
function assertNoStepOverlap(steps, chainReceiptsDirAbs) {
  for (const step of steps) {
    const stepReceiptsAbs = path.resolve(step.receipts_dir);
    if (isSameOrChild(chainReceiptsDirAbs, stepReceiptsAbs) || isSameOrChild(stepReceiptsAbs, chainReceiptsDirAbs)) {
      fail('night_chain_receipts_overlap', step.id);
    }
    const laneRootAbs = path.resolve(step.lane_root);
    if (isSameOrChild(laneRootAbs, chainReceiptsDirAbs) || isSameOrChild(chainReceiptsDirAbs, laneRootAbs)) {
      fail('night_chain_receipts_overlap_lane_root', step.id);
    }
  }
}

function resolveTargetIds(steps, only, from) {
  if (only !== null && from !== null) fail('night_chain_only_and_from_conflict');
  const ids = steps.map(s => s.id);
  if (only !== null) {
    const step = steps.find(s => s.id === only);
    if (!step) fail('night_chain_only_step_unknown', only);
    if (step.enabled === false) fail('night_chain_only_step_disabled', only);
    return [only];
  }
  if (from !== null) {
    const index = ids.indexOf(from);
    if (index === -1) fail('night_chain_from_step_unknown', from);
    if (steps[index].enabled === false) fail('night_chain_from_step_disabled', from);
    return ids.slice(index);
  }
  return ids;
}

// -------------------------------------------------------------- success_rule
function getJsonPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc !== null && typeof acc === 'object' ? acc[key] : undefined), obj);
}
function listFilesRecursive(dir, depth = 0, maxDepth = 8) {
  if (depth > maxDepth) return [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full, depth + 1, maxDepth));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
/** `*` matches within one path segment; `**` matches across segments
 * (needed for `estate_graph_sync.mjs`'s own per-project receipt
 * subdirectories, e.g. a glob of "star slash star dot json"). Everything
 * else is escaped literally. */
function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        source += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1;
      } else {
        source += '[^/]*';
      }
    } else if (ch === '/') {
      source += '/';
    } else if ('.+^${}()|[]\\?'.includes(ch)) {
      source += `\\${ch}`;
    } else {
      source += ch;
    }
  }
  return new RegExp(`^${source}$`, 'u');
}
/** Decides whether one step succeeded, beyond its own exit code. `sinceMs` is
 * the step's own start instant (`Date.now()` captured right before the child
 * was spawned) -- a receipt file whose mtime is EARLIER than that is a
 * leftover from a previous run (or from a step run outside this chain
 * entirely) and must never be read as this step's own success signal, however
 * well it matches the glob. S1 (2026-09-22 review): `sinceMs` is a whole
 * millisecond (`Date.now()` truncates) while `mtimeMs` may carry a fraction,
 * so a receipt written a few hundred microseconds BEFORE the captured start,
 * inside that same millisecond, would still read as `>= sinceMs`. Requiring
 * `mtimeMs >= sinceMs + 1` -- the file's own millisecond strictly after the
 * one the start was captured in -- closes that; no real child can spawn and
 * write a receipt inside the millisecond it was started in. `null`
 * `successRule` means "the exit code alone is the answer" (`checked: false`). */
export function evaluateSuccessRule({ receiptsDir, successRule, sinceMs }) {
  if (successRule === null || successRule === undefined) {
    return { checked: false, success: true, receipt_found: false, receipt_path: null, value: undefined };
  }
  const pattern = globToRegExp(successRule.receipt_glob);
  const candidates = listFilesRecursive(receiptsDir)
    .map(filePath => ({ filePath, rel: path.relative(receiptsDir, filePath).split(path.sep).join('/') }))
    .filter(({ rel }) => pattern.test(rel))
    .map(({ filePath, rel }) => {
      let mtimeMs = Number.NEGATIVE_INFINITY;
      try { mtimeMs = statSync(filePath).mtimeMs; } catch { /* vanished between list and stat */ }
      return { filePath, rel, mtimeMs };
    })
    .filter(({ mtimeMs }) => mtimeMs >= sinceMs + 1);
  if (candidates.length === 0) return { checked: true, success: false, receipt_found: false, receipt_path: null, value: undefined };
  candidates.sort((a, b) => (b.mtimeMs - a.mtimeMs) || (a.rel < b.rel ? 1 : -1));
  const newest = candidates[0];
  let body;
  try { body = JSON.parse(readFileSync(newest.filePath, 'utf8')); }
  catch { return { checked: true, success: false, receipt_found: true, receipt_path: newest.rel, value: undefined }; }
  const value = getJsonPath(body, successRule.json_path);
  return { checked: true, success: successRule.allowed_values.includes(value), receipt_found: true, receipt_path: newest.rel, value };
}

// ------------------------------------------------------------------- child
/** Runs one step's entry as `node <entryAbs> <args...>`, sequentially -- this
 * runner never starts two steps at once. Kills the child (SIGTERM, then
 * SIGKILL after `TIMEOUT_KILL_GRACE_MS`) once `timeout_minutes` elapses, and
 * reports `timed_out: true`. stdout/stderr are relayed line-by-line to `log`
 * (already redacted by the caller) and never buffered into the chain receipt
 * itself -- the receipt only ever records step metadata (ids, timestamps,
 * exit codes, the success-rule outcome), never raw child output, which is
 * this file's own answer to "no secrets, no host paths beyond the lane roots
 * the config itself names" for the receipt half of that requirement. */
export function defaultRunStepChild({ nodePath, laneRoot, entry, args, timeoutMinutes, log = () => {} }) {
  return new Promise(resolve => {
    const entryAbs = path.resolve(laneRoot, entry);
    const startedAtMs = Date.now();
    let child;
    try {
      child = spawn(nodePath, [entryAbs, ...args], { cwd: laneRoot, windowsHide: true });
    } catch (error) {
      resolve({ exit_code: null, signal: null, timed_out: false, spawn_error: typeof error?.code === 'string' ? error.code : 'night_chain_spawn_failed',
        started_at: new Date(startedAtMs).toISOString(), ended_at: new Date().toISOString() });
      return;
    }
    let timedOut = false;
    let killTimer = null;
    const timeoutMs = Math.max(0, timeoutMinutes) * 60 * 1000;
    const termTimer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, TIMEOUT_KILL_GRACE_MS);
    }, timeoutMs);

    let lineCount = 0;
    let buffered = '';
    const emitLines = chunk => {
      buffered += chunk.toString('utf8');
      const parts = buffered.split(/\r?\n/u);
      buffered = parts.pop() ?? '';
      for (const part of parts) {
        if (part.length === 0) continue;
        lineCount += 1;
        if (lineCount <= MAX_CAPTURED_LOG_LINES) log(part);
      }
    };
    child.stdout?.on('data', emitLines);
    child.stderr?.on('data', emitLines);
    child.on('close', (code, signal) => {
      // Captured into locals immediately, before any further logging touches
      // anything -- `code`/`signal` are this handler's own parameters, not a
      // shared mutable global, but this still follows the same "capture the
      // exit code before it can be reset by a log call" discipline used
      // everywhere else in this build.
      const exitCode = code;
      const finishedSignal = signal;
      clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      if (buffered.length > 0 && lineCount < MAX_CAPTURED_LOG_LINES) log(buffered);
      resolve({ exit_code: exitCode, signal: finishedSignal, timed_out: timedOut,
        started_at: new Date(startedAtMs).toISOString(), ended_at: new Date().toISOString() });
    });
    child.on('error', error => {
      clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ exit_code: null, signal: null, timed_out: timedOut,
        spawn_error: typeof error?.code === 'string' ? error.code : 'night_chain_spawn_failed',
        started_at: new Date(startedAtMs).toISOString(), ended_at: new Date().toISOString() });
    });
  });
}

// -------------------------------------------------------------------- run
/**
 * One chain run. `clock` is read fresh every time this checks the deadline
 * (never cached), the same seam `voice_conversation_list_nightly.mjs` uses so
 * a deadline stop is provable without an actual wait. `spawnStep` defaults to
 * `defaultRunStepChild`; tests may still inject a scripted one, but the build
 * spec's own test plan mostly points real tiny synthetic `.mjs` lane entries
 * at the real one instead.
 */
export async function runChain({ configPath, expectedConfigSha256, receiptsDir, deadline = null,
  scheduledStart = null, dry = false, only = null, from = null, now = new Date().toISOString(),
  clock = () => new Date().toISOString(), log = () => {}, nodePath = process.execPath,
  spawnStep = defaultRunStepChild } = {}) {
  if (deadline === null && scheduledStart !== null) fail('night_chain_scheduled_start_requires_deadline');
  if (deadline !== null && scheduledStart !== null && deadline === scheduledStart) fail('night_chain_deadline_equals_scheduled_start');
  if (typeof receiptsDir !== 'string' || receiptsDir.trim() === '') fail('night_chain_receipts_required');

  const { steps, config_sha256 } = loadChainConfig({ configPath, expectedConfigSha256 });
  verifyStepLanes(steps);
  const targetIds = resolveTargetIds(steps, only, from);
  const targetSet = new Set(targetIds);
  const receiptsDirAbs = path.resolve(receiptsDir);
  assertNoStepOverlap(steps, receiptsDirAbs);

  const deadlineAt = deadline !== null ? nextDeadlineInstant(now, deadline, scheduledStart) : null;

  if (dry) {
    const planSteps = steps.map(step => ({
      id: step.id, lane_root: step.lane_root, entry: step.entry, args: step.args.slice(),
      enabled: step.enabled, in_scope: targetSet.has(step.id), on_failure: step.on_failure,
      // `true` here means "verifyStepLanes above passed for this step" -- it
      // throws on the first failure, so reaching this line means every
      // enabled step passed; `null` is a disabled step it never checked.
      timeout_minutes: step.timeout_minutes, lane_manifest_ok: step.enabled === false ? null : true,
    }));
    for (const row of planSteps) {
      const label = row.enabled === false ? 'disabled' : (row.in_scope ? 'would_run' : 'out_of_scope');
      log(`${row.id} ${label} lane_manifest=${row.lane_manifest_ok === null ? 'not_checked' : 'ok'}`);
    }
    return { status: 'DRY', config_sha256, scope: { only, from }, steps: planSteps,
      deadline: deadlineAt !== null ? { configured: deadline, scheduled_start: scheduledStart, at: deadlineAt } : null };
  }

  const staleLockMs = computeStaleLockMs(steps);
  const lock = acquireLock(receiptsDirAbs, now, staleLockMs);
  if (lock.held) {
    log(`lock held, skipping this chain run (age_ms=${lock.age_ms ?? 'unknown'})`);
    return { status: 'LOCK_HELD', lock, steps: [] };
  }

  const stepReceipts = [];
  let deadlineStopped = false;
  let attemptedCount = 0;
  const notStarted = [];
  let stoppedAtId = null;
  // R2 (2026-09-22 review): every row carries the step's own `deadline`/
  // `note` verbatim (the first version parsed and dropped them).
  const disabledRow = step => ({ id: step.id, status: 'SKIPPED_DISABLED', started_at: null, ended_at: null,
    exit_code: null, signal: null, timed_out: false, receipt_found: false, receipt_path: null, reason: null,
    deadline: step.deadline, note: step.note });
  try {
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (!targetSet.has(step.id)) continue;
      if (step.enabled === false) {
        stepReceipts.push(disabledRow(step));
        log(`${step.id} skipped (disabled)`);
        continue;
      }
      // Checked right before this pass would actually start the step's own
      // child process -- never mid-step (this pass cannot interrupt a
      // step already running; see `defaultRunStepChild`'s own timeout, which
      // is the only thing that ever kills a step in flight).
      if (deadlineAt !== null && Date.parse(clock()) >= Date.parse(deadlineAt)) {
        deadlineStopped = true;
        notStarted.push(step.id);
        log(`deadline ${deadline} reached before ${step.id}; stopping the chain for tonight`);
        continue;
      }
      attemptedCount += 1;
      const startedAtMs = Date.now();
      const child = await spawnStep({ nodePath, laneRoot: step.lane_root, entry: step.entry, args: step.args,
        timeoutMinutes: step.timeout_minutes, log: line => log(`[${step.id}] ${redactHostPathsLocal(line)}`) });
      const successRuleResult = evaluateSuccessRule({ receiptsDir: step.receipts_dir, successRule: step.success_rule, sinceMs: startedAtMs });
      const success = child.exit_code === 0 && child.timed_out !== true && successRuleResult.success;
      const reason = success ? null
        : (child.timed_out ? 'night_chain_step_timed_out'
          : (child.spawn_error ? child.spawn_error
            : (child.exit_code !== 0 ? 'night_chain_step_nonzero_exit' : 'night_chain_step_receipt_not_matched')));
      const row = { id: step.id, status: success ? 'OK' : 'FAILED', started_at: child.started_at, ended_at: child.ended_at,
        exit_code: child.exit_code, signal: child.signal ?? null, timed_out: child.timed_out === true,
        receipt_found: successRuleResult.receipt_found, receipt_path: successRuleResult.receipt_path, reason,
        deadline: step.deadline, note: step.note };
      stepReceipts.push(row);
      log(`${step.id} ${row.status} exit=${row.exit_code ?? '-'} receipt=${row.receipt_found ? 'found' : 'absent'}`);
      if (!success && step.on_failure === 'stop') {
        stoppedAtId = step.id;
        // N2 (2026-09-22 review): a disabled step after the stop point is
        // still listed as `SKIPPED_DISABLED` (it was never going to run, stop
        // or no stop); only the enabled ones become `not_started`.
        for (let rest = index + 1; rest < steps.length; rest++) {
          if (!targetSet.has(steps[rest].id)) continue;
          if (steps[rest].enabled === false) stepReceipts.push(disabledRow(steps[rest]));
          else notStarted.push(steps[rest].id);
        }
        break;
      }
    }
  } finally {
    releaseLock(receiptsDirAbs, { pid: process.pid, started_at: now });
  }

  const anyFailed = stepReceipts.some(row => row.status === 'FAILED');
  let status;
  if (anyFailed) status = 'FAILED';
  else if (deadlineStopped && attemptedCount === 0) status = 'SKIPPED_PAST_DEADLINE';
  // S4 (2026-09-22 review): nothing was attempted and no deadline stopped it
  // -- every in-scope step was disabled. Not `OK`.
  else if (attemptedCount === 0) status = 'NOTHING_TO_RUN';
  else if (notStarted.length > 0) status = 'PARTIAL';
  else status = 'OK';

  const receipt = {
    // S2 (2026-09-22 review): the config's basename only -- its sha256 (next
    // field) already binds exactly which file this was, and a full path here
    // would be the one host-local path the config itself never named.
    schema_version: NIGHT_CHAIN_RECEIPT_SCHEMA, ran_at: now, config_file: path.basename(configPath),
    config_sha256, dry: false, scope: { only, from },
    lock: { reclaimed_stale: lock.reclaimed === true, previous_lock_age_ms: lock.reclaimed === true ? (lock.age_ms ?? null) : null },
    deadline: deadlineAt !== null ? { configured: deadline, scheduled_start: scheduledStart, at: deadlineAt, stopped: deadlineStopped } : null,
    steps: stepReceipts, stopped_at_step: stoppedAtId, not_started: notStarted, status,
  };
  const receiptPath = path.join(receiptsDirAbs, `${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`);
  atomicWriteFileSync(receiptPath, encode(receipt));
  return { status, receipt };
}

// -------------------------------------------------------------------- CLI
// The complete flag vocabulary. S3 (2026-09-22 review): anything not in this
// set -- `--dry-run`, `--receipt`, a bare positional word -- is refused before
// anything is read, hashed, locked or spawned, rather than silently ignored.
const KNOWN_FLAGS = new Set(['chain-config', 'chain-config-sha256', 'receipts', 'deadline', 'scheduled-start',
  'dry', 'only', 'from', 'node-path']);

function options(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) fail('night_chain_argument_unexpected', token);
    const name = token.slice(2);
    if (!KNOWN_FLAGS.has(name)) fail('night_chain_flag_unknown', token);
    const next = argv[i + 1];
    flags.set(name, next === undefined || next.startsWith('--') ? true : (i++, next));
  }
  return flags;
}

export async function runNightChainCli(argv, { log: onLine, now, clock, spawnStep, nodePath } = {}) {
  const flags = options(argv);
  const configPath = flags.get('chain-config');
  if (typeof configPath !== 'string' || configPath.trim() === '') fail('night_chain_config_path_required');
  const configSha256 = flags.get('chain-config-sha256');
  if (typeof configSha256 !== 'string') fail('night_chain_config_sha256_required');
  const receiptsDir = flags.get('receipts');
  if (typeof receiptsDir !== 'string' || receiptsDir.trim() === '') fail('night_chain_receipts_required');
  const dry = flags.get('dry') === true;

  const deadlineFlag = flags.get('deadline');
  if (deadlineFlag !== undefined && typeof deadlineFlag !== 'string') fail('night_chain_deadline_usage_invalid');
  const deadline = typeof deadlineFlag === 'string' ? deadlineFlag : null;

  const scheduledStartFlag = flags.get('scheduled-start');
  if (scheduledStartFlag !== undefined && typeof scheduledStartFlag !== 'string') fail('night_chain_scheduled_start_usage_invalid');
  const scheduledStart = typeof scheduledStartFlag === 'string' ? scheduledStartFlag : null;

  const onlyFlag = flags.get('only');
  if (onlyFlag !== undefined && typeof onlyFlag !== 'string') fail('night_chain_only_usage_invalid');
  const only = typeof onlyFlag === 'string' ? onlyFlag : null;

  const fromFlag = flags.get('from');
  if (fromFlag !== undefined && typeof fromFlag !== 'string') fail('night_chain_from_usage_invalid');
  const from = typeof fromFlag === 'string' ? fromFlag : null;

  const nodePathFlag = flags.get('node-path');
  const resolvedNodePath = nodePath ?? (typeof nodePathFlag === 'string' ? nodePathFlag : process.execPath);
  const nowIso = now ?? new Date().toISOString();

  const lines = [];
  const log = line => { lines.push(line); if (onLine) onLine(line); };
  const result = await runChain({ configPath, expectedConfigSha256: configSha256, receiptsDir, deadline, scheduledStart,
    dry, only, from, now: nowIso, ...(clock ? { clock } : {}), log, nodePath: resolvedNodePath,
    ...(spawnStep ? { spawnStep } : {}) });
  return { result, lines };
}

export function exitCodeFor(status) {
  switch (status) {
    case 'OK': return 0;
    case 'FAILED': return 2;
    case 'LOCK_HELD': return 3;
    case 'SKIPPED_PAST_DEADLINE': return 4;
    case 'PARTIAL': return 6;
    case 'NOTHING_TO_RUN': return 7;
    default: return 2;
  }
}

async function main() {
  try {
    const { result } = await runNightChainCli(process.argv.slice(2), { log: line => process.stdout.write(`${line}\n`) });
    if (result.status === 'DRY') return 0;
    return exitCodeFor(result.status);
  } catch (error) {
    // An unknown flag names the offending token so the typo is visible in the
    // scheduler's captured stderr -- but only when it is shaped like a plain
    // flag; anything else (a path, a value that landed in the wrong slot) is
    // omitted rather than echoed.
    const flagToken = error?.code === 'night_chain_flag_unknown' && /^--[a-z0-9-]+$/u.test(error?.detail ?? '')
      ? ` ${error.detail}` : '';
    process.stderr.write(`[night-chain] ${redactHostPathsLocal(error?.code ?? error?.message ?? 'failed')}${flagToken}\n`);
    return 5;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, () => { process.exitCode = 5; });
}
