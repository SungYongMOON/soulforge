#!/usr/bin/env node
// Daily runner: `refresh()` for every onboarded project, then `refreshCommon()`
// for the common-folder ledgers -- both from ONE org config file. Neither call
// is ever given an explicit --bundle-table/--reading-table/--vendor-table
// override here (both stay `null`), so both calls fall back to reading
// `orgConfigPath`'s own `common_ledgers.owner_tables` block (see
// `src/refresh.mjs`'s and `src/common_refresh.mjs`'s own "S-b" doc on
// `resolveOwnerTablePaths`). Because the SAME `orgConfigPath` (pinned by
// `--org-config-sha256`) goes to both calls, and no override ever diverges
// them, the two writers structurally cannot classify the same mail under two
// different table sets -- this is the module README's "hard operating rule"
// enforced by construction rather than by convention: there is deliberately
// no CLI flag on this file that could reintroduce the divergence.
//
// `allowDegradedOwnerTables` is never passed (never `true`) to either call --
// a malformed Owner table fails the whole day's run closed, on purpose (see
// the module README's "Owner tables" section: the danger is a mail ending up
// recorded in two different ledgers, or dropped from one silently).
// `allowEmpty`/`allowPartialSources` are likewise never passed (both library
// defaults: `[]`/`false`) -- an unattended daily job should fail closed on an
// unreadable custody directory or a ledger that would empty out, not silently
// choose to proceed; a caller who has decided a specific project's empty
// ledger really is fine runs `cli.mjs refresh --allow-empty ...` by hand.
//
// Order and short-circuit: `refresh()` runs first; `refreshCommon()` runs only
// when `refresh()`'s own receipt reports `status !== 'failed'`. A failed first
// step is recorded as `status: 'failed'` in the combined receipt with the
// second step recorded `ran: false` -- it is never silently skipped without a
// trace, and it is never allowed to look like an 'ok' day.
//
// `--dry` deliberately never calls `refresh()`/`refreshCommon()` at all --
// unlike this CLI's own `refresh --dry`/`common-refresh --dry`, which still
// write their own audit-trail receipt file even in dry mode (documented in
// both functions' own doc comments as intentional), THIS runner's `--dry` is
// meant to be what a scheduled-task registrar's preflight checks before it
// ever registers anything, and "writes nothing" needs to be literal there.
// `--dry` here only checks the same preconditions a real run would refuse on
// before ever touching a lock or a ledger: every required argument is
// present, the org-config file reads, parses, and hashes to
// `--org-config-sha256`, and `--workspaces-root`/`--workmeta-root` exist as
// directories. A missing/unreadable custody directory is deliberately NOT
// one of those preconditions -- that is refresh()'s own pre-write gate to
// catch (a `status: 'failed'` receipt, exit 2), the same as a real run, so
// `--dry` never reports a custody path clean that a real run would still
// fail closed on for an unrelated reason. It does not acquire
// the daily lock (report-only: it reads whether one is currently held/stale,
// the same "not even the lock" posture the sibling nightly harness documents
// for its own `--dry`), and it does not classify any custody or compile any
// rule -- that level of preflight is what `cli.mjs refresh --dry` /
// `common-refresh --dry` are for, run by hand against the same inputs.
//
// Exit codes: 0 ok; 2 failed (either step's own receipt reports
// `status: 'failed'` -- an unreadable custody directory, a bad saved rule, a
// malformed Owner table, or an R4 ledger-validation failure, all of which the
// library already reports through that one status field); 3 lock held; 4
// refused before start (bad/missing arguments, an org-config digest mismatch,
// or a missing `--workspaces-root`/`--workmeta-root`).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { refresh } from '../src/refresh.mjs';
import { refreshCommon } from '../src/common_refresh.mjs';

export const DAILY_RECEIPT_SCHEMA = 'soulforge.workspace_ledgers_daily_receipt.v1';
// This lane calls no model and does no per-mail wall-clock work of its own --
// `refresh()`/`refreshCommon()` are bounded CSV rewrites over one custody
// window. Two hours is well past what one day's worth of mail should ever
// take through either pass; a lock older than this is treated as abandoned
// (crashed process, killed task) rather than a run still legitimately going.
export const STALE_LOCK_MS = 2 * 60 * 60 * 1000;
const LOCK_FILE_NAME = 'daily_refresh.lock';

export class DailyRefreshError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'DailyRefreshError';
    this.code = code;
    this.detail = detail ?? null;
  }
}
const fail = (code, detail) => { throw new DailyRefreshError(code, detail); };

export function sha256Hex(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function sha256File(filePath) { return `sha256:${sha256Hex(readFileSync(filePath))}`; }

function encode(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }

/** Writes via a temp file in the same directory, then renames into place -- a crash or kill mid-write never leaves a half-written receipt at the real path. */
export function atomicWriteJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${randomUUID()}`);
  writeFileSync(tmpPath, encode(value));
  renameSync(tmpPath, filePath);
}

// --------------------------------------------------------------------- lock
/**
 * One `--receipts` directory holds one daily lock -- this is a lock above and
 * independent of `refresh()`/`refreshCommon()`'s own internal
 * `.workspace_ledgers_refresh.lock` at `workspacesRoot`'s own root (which each
 * of those two calls still acquires and releases on its own, in turn); this
 * one exists specifically to keep two invocations of THIS daily runner from
 * ever running concurrently against the same receipts directory, the same
 * shape `voice_conversation_list_nightly.mjs`'s own `acquireLock` uses. A
 * fresh lock refuses this run; a stale one (older than `staleLockMs`, or
 * unreadable) is reclaimed atomically, and the reclaim is recorded so the
 * combined receipt's own `lock` block can say so.
 */
export function acquireDailyLock(receiptsDir, now, staleLockMs = STALE_LOCK_MS) {
  mkdirSync(receiptsDir, { recursive: true });
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs <= staleLockMs) return { held: true, existing, age_ms: ageMs, reclaimed: false };
    try { rmSync(lockFile, { force: true }); } catch (error) { fail('workspace_ledgers_daily_lock_unavailable', error?.code ?? error?.message); }
    const ownership = { pid: process.pid, started_at: now, reclaimed_from: existing };
    try { writeFileSync(lockFile, encode(ownership), { flag: 'wx' }); }
    catch (error) {
      if (error?.code === 'EEXIST') return { held: true, existing, age_ms: ageMs, reclaimed: false };
      fail('workspace_ledgers_daily_lock_unavailable', error?.code ?? error?.message);
    }
    return { held: false, reclaimed: true, previous: existing, age_ms: ageMs, ownership };
  }
  const ownership = { pid: process.pid, started_at: now };
  try { writeFileSync(lockFile, encode(ownership), { flag: 'wx' }); }
  catch (error) {
    if (error?.code === 'EEXIST') return { held: true, existing: null, age_ms: 0, reclaimed: false };
    fail('workspace_ledgers_daily_lock_unavailable', error?.code ?? error?.message);
  }
  return { held: false, reclaimed: false, previous: null, age_ms: null, ownership };
}

/** Removes the lock only when it still carries this run's own ownership -- a lock this run's own stale threshold let someone else reclaim is not this run's to delete. */
export function releaseDailyLock(receiptsDir, ownership) {
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (!ownership) { try { rmSync(lockFile, { force: true }); } catch { /* nothing to release */ } return; }
  let current;
  try { current = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { return; }
  if (current?.pid !== ownership.pid || current?.started_at !== ownership.started_at) return;
  try { rmSync(lockFile, { force: true }); } catch { /* nothing to release */ }
}

/** Read-only: whether the daily lock currently looks held, without acquiring or releasing it -- what `--dry`'s plan reports. */
function inspectDailyLock(receiptsDir, now, staleLockMs) {
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (!existsSync(lockFile)) return { present: false, held: false, age_ms: null };
  let existing;
  try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { return { present: true, held: true, age_ms: null, unreadable: true }; }
  const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
  const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
  return { present: true, held: ageMs <= staleLockMs, age_ms: Number.isFinite(ageMs) ? ageMs : null };
}

// ---------------------------------------------------------------- receipts
function refreshCounts(receipt) {
  if (!receipt) return null;
  return {
    schema_version: receipt.schema_version ?? null, status: receipt.status ?? null,
    projects_count: Array.isArray(receipt.projects) ? receipt.projects.length : 0,
    ledger_failures_count: (receipt.ledger_failures ?? []).length,
    rule_failures_count: (receipt.rule_failures ?? []).length,
    owner_table_failures_count: (receipt.owner_table_failures ?? []).length,
    unreadable_dirs_count: (receipt.unreadable_dirs ?? []).length,
    allow_empty_applied_to_count: (receipt.allow_empty_applied_to ?? []).length,
    shrink_allowed_applied_to_count: (receipt.shrink_allowed_applied_to ?? []).length,
    held_two_projects: receipt.held_two_projects ?? null,
    unattributed: receipt.unattributed ?? null,
    duplicates_dropped: receipt.duplicates_dropped ?? null,
  };
}

function commonCounts(receipt) {
  if (!receipt) return null;
  return {
    schema_version: receipt.schema_version ?? null, status: receipt.status ?? null,
    files_count: (receipt.files ?? []).length,
    bucket_counts: receipt.bucket_counts ?? null,
    ledger_failures_count: (receipt.ledger_failures ?? []).length,
    rule_failures_count: (receipt.rule_failures ?? []).length,
    owner_table_failures_count: (receipt.owner_table_failures ?? []).length,
    unreadable_dirs_count: (receipt.unreadable_dirs ?? []).length,
    scanned: receipt.scanned ?? null,
    duplicates_dropped: receipt.duplicates_dropped ?? null,
    total_mails: receipt.total_mails ?? null,
  };
}

// -------------------------------------------------------------- validation
function assertRequiredString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value;
}

function assertDirectoryExists(dirPath, code) {
  let stat;
  try { stat = statSync(dirPath); } catch { fail(code, dirPath ? path.basename(dirPath) : ''); }
  if (!stat.isDirectory()) fail(code, path.basename(dirPath));
}

function assertOrgConfigDigest(orgConfigPath, expectedSha256) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(expectedSha256 ?? '')) fail('workspace_ledgers_daily_org_config_sha256_invalid');
  let actual;
  try { actual = sha256File(orgConfigPath); }
  catch { fail('workspace_ledgers_daily_org_config_unreadable', path.basename(orgConfigPath)); }
  if (actual !== expectedSha256) fail('workspace_ledgers_daily_org_config_sha256_mismatch');
  try { JSON.parse(readFileSync(orgConfigPath, 'utf8')); }
  catch { fail('workspace_ledgers_daily_org_config_invalid_json'); }
}

/**
 * Every precondition a real run refuses on before it ever acquires the lock
 * or touches a ledger -- shared by the real run (which then proceeds) and
 * `--dry` (which stops here).
 */
function validateInputs({ workspacesRoot, workmetaRoot, orgConfigPath, orgConfigSha256, hiworksEvents, gmailSentEvents, receiptsDir }) {
  assertRequiredString(workspacesRoot, 'workspace_ledgers_daily_workspaces_root_required');
  assertRequiredString(workmetaRoot, 'workspace_ledgers_daily_workmeta_root_required');
  assertRequiredString(orgConfigPath, 'workspace_ledgers_daily_org_config_required');
  assertRequiredString(orgConfigSha256, 'workspace_ledgers_daily_org_config_sha256_required');
  assertRequiredString(hiworksEvents, 'workspace_ledgers_daily_hiworks_events_required');
  assertRequiredString(gmailSentEvents, 'workspace_ledgers_daily_gmail_sent_events_required');
  assertRequiredString(receiptsDir, 'workspace_ledgers_daily_receipts_required');
  // Only the two ROOTS refuse before start (exit 4) when missing -- an
  // unreadable/missing custody directory is deliberately left for
  // refresh()'s own pre-write gate to catch (it reports that as `unreadable_
  // dirs` inside a `status: 'failed'` receipt, exit 2: "ran, and failed",
  // not "refused to even try"). `hiworksEvents`/`gmailSentEvents` are still
  // required non-empty strings above; their existence is not checked here.
  assertDirectoryExists(workspacesRoot, 'workspace_ledgers_daily_workspaces_root_missing');
  assertDirectoryExists(workmetaRoot, 'workspace_ledgers_daily_workmeta_root_missing');
  assertOrgConfigDigest(orgConfigPath, orgConfigSha256);
}

// -------------------------------------------------------------------- run
export function runDailyRefresh({ workspacesRoot, workmetaRoot, orgConfigPath, orgConfigSha256, hiworksEvents,
  gmailSentEvents, receiptsDir, dry = false, now = new Date().toISOString(), staleLockMs = STALE_LOCK_MS }) {
  validateInputs({ workspacesRoot, workmetaRoot, orgConfigPath, orgConfigSha256, hiworksEvents, gmailSentEvents, receiptsDir });

  if (dry) {
    // Report-only: never acquires, reclaims, or releases the lock; never
    // calls refresh()/refreshCommon(); writes nothing anywhere.
    const lockState = inspectDailyLock(receiptsDir, now, staleLockMs);
    return {
      schema_version: DAILY_RECEIPT_SCHEMA, generated_at: now, dry: true, status: 'ok',
      org_config_sha256: orgConfigSha256, lock: lockState,
      steps: { refresh: { ran: false, status: null }, common_refresh: { ran: false, status: null } },
    };
  }

  const lock = acquireDailyLock(receiptsDir, now, staleLockMs);
  if (lock.held) fail('workspace_ledgers_daily_lock_held');

  let refreshReceipt = null;
  let commonReceipt = null;
  try {
    refreshReceipt = refresh({
      workspacesRoot, workmetaRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents],
      orgConfigPath, receiptsDir, dry: false, now,
    });
    const refreshOk = refreshReceipt.status !== 'failed';
    if (refreshOk) {
      commonReceipt = refreshCommon({
        workspacesRoot, workmetaRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents],
        orgConfigPath, receiptsDir, dry: false, now,
      });
    }
    const commonOk = commonReceipt !== null && commonReceipt.status !== 'failed';
    const status = (refreshOk && commonOk) ? 'ok' : 'failed';
    const combined = {
      schema_version: DAILY_RECEIPT_SCHEMA, generated_at: now, dry: false, status,
      org_config_sha256: orgConfigSha256,
      lock: { reclaimed: lock.reclaimed === true, stale_reclaimed: lock.reclaimed === true, age_ms: lock.age_ms ?? null },
      steps: {
        refresh: { ran: true, ...refreshCounts(refreshReceipt) },
        common_refresh: refreshOk
          ? { ran: true, ...commonCounts(commonReceipt) }
          : { ran: false, status: null, reason: 'previous_step_failed_closed' },
      },
    };
    atomicWriteJson(path.join(receiptsDir, `daily-${now.replace(/[:.]/gu, '-')}${combined.status === 'failed' ? '-failed' : ''}.json`), combined);
    return combined;
  } catch (error) {
    const combined = {
      schema_version: DAILY_RECEIPT_SCHEMA, generated_at: now, dry: false, status: 'failed',
      org_config_sha256: orgConfigSha256,
      lock: { reclaimed: lock.reclaimed === true, stale_reclaimed: lock.reclaimed === true, age_ms: lock.age_ms ?? null },
      steps: {
        refresh: refreshReceipt ? { ran: true, ...refreshCounts(refreshReceipt) } : { ran: false, status: null },
        common_refresh: commonReceipt ? { ran: true, ...commonCounts(commonReceipt) } : { ran: false, status: null },
      },
      error: { code: error?.code ?? 'workspace_ledgers_daily_run_failed', message: String(error?.message ?? error) },
    };
    try { atomicWriteJson(path.join(receiptsDir, `daily-${now.replace(/[:.]/gu, '-')}-failed.json`), combined); } catch { /* best effort */ }
    throw error;
  } finally {
    releaseDailyLock(receiptsDir, lock.ownership ?? null);
  }
}

// --------------------------------------------------------------------- CLI
function parseArgs(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index += 1, next);
    flags.set(name, value);
  }
  return flags;
}

function stringFlag(flags, name) {
  const value = flags.get(name);
  return typeof value === 'string' ? value : null;
}

function exitCodeFor(code) {
  if (typeof code !== 'string') return 2;
  if (code.includes('lock_held')) return 3;
  if (code.includes('required') || code.includes('missing') || code.includes('sha256_invalid')
    || code.includes('sha256_mismatch') || code.includes('invalid_json') || code.includes('unreadable')) return 4;
  return 2;
}

export function runCli(argv) {
  const flags = parseArgs(argv);
  const dry = flags.get('dry') === true || flags.get('dry') === 'true';
  const nowRaw = stringFlag(flags, 'now');
  const now = nowRaw ?? new Date().toISOString();
  try {
    const receipt = runDailyRefresh({
      workspacesRoot: stringFlag(flags, 'workspaces-root'), workmetaRoot: stringFlag(flags, 'workmeta-root'),
      orgConfigPath: stringFlag(flags, 'org-config'), orgConfigSha256: stringFlag(flags, 'org-config-sha256'),
      hiworksEvents: stringFlag(flags, 'hiworks-events'), gmailSentEvents: stringFlag(flags, 'gmail-sent-events'),
      receiptsDir: stringFlag(flags, 'receipts'), dry, now,
    });
    console.log(JSON.stringify(receipt));
    if (receipt.status === 'failed') { process.exitCode = 2; return; }
    process.exitCode = 0;
  } catch (error) {
    console.error(`workspace_ledgers_daily_refresh_failed: ${error.code ?? error.message}`);
    process.exitCode = exitCodeFor(error?.code);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
