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
// recorded in two different ledgers, or dropped from one silently). This is
// what this lane's own fail-closed posture actually rests on: `refresh()`/
// `refreshCommon()` each check their own Owner-table load BEFORE writing
// anything (their R4 pre-write gate), so a malformed table never reaches a
// half-written ledger here -- this file adds no owner-table validation of
// its own, it only never opts back into the degraded path the library
// already gates.
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
// Exit codes: 0 ok; 2 failed -- either step's own receipt reports
// `status: 'failed'` (an unreadable custody directory, a bad saved rule, a
// malformed Owner table, or an R4 ledger-validation failure, all of which the
// library already reports through that one status field), the org config
// changed mid-run (S1's TOCTOU re-check, `..._org_config_changed_during_run`),
// or a library error reached during step 1/2 that is not one of this
// runner's own codes (e.g. a library `..._org_config_unreadable` thrown
// mid-run is a 2, never a 4 -- see `EXIT_CODE_BY_DAILY_CODE`'s own doc); 3
// lock held (this runner's own daily lock, or an unexpected error acquiring
// it); 4 refused before start (bad/missing arguments, a malformed `--now`,
// an org-config digest mismatch, or a missing `--workspaces-root`/
// `--workmeta-root`) -- ONLY this runner's own pre-lock validation codes ever
// map to 4.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { redactHostPaths, refresh } from '../src/refresh.mjs';
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
 * shape `voice_conversation_list_nightly.mjs`'s own `acquireLock` uses --
 * NOT the only thing standing between two overlapping runs: a scheduled
 * task's own `IgnoreNew` multiple-instances policy (see the registrar) and
 * `refresh()`/`refreshCommon()`'s own internal lock both also apply. A fresh
 * lock refuses this run; a stale one is reclaimed, and the reclaim is
 * recorded so the combined receipt's own `lock` block can say so.
 *
 * R2 (2026-09-22 review): age is computed the same way `src/refresh.mjs`'s
 * own `acquireRefreshLock` computes it -- NOT clamped to a minimum of 0. A
 * lock whose recorded `started_at` is in the FUTURE relative to `now` (clock
 * skew, or corrupted lock data) produces a negative `ageMs`; clamping that to
 * 0 with `Math.max(0, ...)` used to make it look brand new (`ageMs <=
 * staleLockMs` trivially true), so a clock-skewed lock could never be
 * reclaimed and every later run refused with exit 3 forever. The held check
 * is now `ageMs >= 0 && ageMs <= staleLockMs`: a negative age fails that
 * immediately and falls through to reclaim, same as the library.
 *
 * S3 (2026-09-22 review): the stale lock is renamed to a unique sibling name
 * FIRST, and only proceeds to write a fresh lock (`wx`) when that rename
 * itself succeeded -- an `ENOENT` on the rename means a concurrent reclaimer
 * already won the race (the source is already gone), reported as `held:
 * true` rather than racing a second `wx` write that might spuriously
 * "succeed" against a lock file a moment away from being deleted out from
 * under it. The renamed-away file is then a best-effort cleanup, never load-
 * bearing for correctness.
 */
export function acquireDailyLock(receiptsDir, now, staleLockMs = STALE_LOCK_MS) {
  mkdirSync(receiptsDir, { recursive: true });
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? (Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs >= 0 && ageMs <= staleLockMs) return { held: true, existing, age_ms: ageMs, reclaimed: false };
    const staleName = path.join(receiptsDir, `.${LOCK_FILE_NAME}.stale-${randomUUID()}`);
    try { renameSync(lockFile, staleName); }
    catch (error) {
      if (error?.code === 'ENOENT') return { held: true, existing, age_ms: ageMs, reclaimed: false };
      fail('workspace_ledgers_daily_lock_unavailable', redactHostPaths(error?.code ?? String(error?.message ?? error)));
    }
    const ownership = { pid: process.pid, started_at: now, reclaimed_from: existing };
    try { writeFileSync(lockFile, encode(ownership), { flag: 'wx' }); }
    catch (error) {
      if (error?.code === 'EEXIST') return { held: true, existing, age_ms: ageMs, reclaimed: false };
      fail('workspace_ledgers_daily_lock_unavailable', redactHostPaths(error?.code ?? String(error?.message ?? error)));
    }
    try { rmSync(staleName, { force: true }); } catch { /* best-effort cleanup only */ }
    return { held: false, reclaimed: true, previous: existing, age_ms: ageMs, ownership };
  }
  const ownership = { pid: process.pid, started_at: now };
  try { writeFileSync(lockFile, encode(ownership), { flag: 'wx' }); }
  catch (error) {
    if (error?.code === 'EEXIST') return { held: true, existing: null, age_ms: 0, reclaimed: false };
    fail('workspace_ledgers_daily_lock_unavailable', redactHostPaths(error?.code ?? String(error?.message ?? error)));
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

/**
 * Read-only: whether the daily lock currently looks held, without acquiring,
 * reclaiming or releasing it -- what `--dry`'s plan reports. Nit (2026-09-22
 * review): must compute "held" the exact same way `acquireDailyLock` does --
 * an unreadable/unparsable lock file used to report `held: true` here while
 * a real run would treat the same file as `existing = {}` (unparsable
 * `started_at`, infinite age, therefore stale and reclaimable) and proceed.
 * `--dry` disagreeing with what the real run would actually do defeats the
 * point of a preflight. Same age formula as `acquireDailyLock` (R2): not
 * clamped, so a future-dated lock reports `held: false` here too.
 */
function inspectDailyLock(receiptsDir, now, staleLockMs) {
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (!existsSync(lockFile)) return { present: false, held: false, age_ms: null };
  let existing;
  try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
  const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
  const ageMs = Number.isFinite(startedAt) ? (Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
  const held = ageMs >= 0 && ageMs <= staleLockMs;
  return { present: true, held, age_ms: Number.isFinite(ageMs) ? ageMs : null };
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

/**
 * R3 (2026-09-22 review): `refreshCommon()`'s own receipt never has a
 * `ledger_failures` field at all (that field is `refresh()`'s -- the two
 * receipt shapes are not siblings) -- reading it here always read `undefined`
 * and silently reported `ledger_failures_count: 0` even when the common pass
 * failed a file. The common receipt's actual per-file failure signal is
 * `files[]` (each `{ file, failed, code?, ... }` from `writeLedgerCsv`) and
 * `rejected_files` (an unsafe/colliding ledger NAME refused before it was
 * ever written, a different failure class from a file that failed to merge).
 * `legacy_bucket_file_present` is not a failure at all -- the old pre-rename
 * bucket file (`과제없음_확인함.csv`) still sitting on disk is a migration
 * signal this module never acts on by itself -- surfaced as a warning on the
 * combined receipt (see `collectWarnings`) rather than folded into either
 * count.
 */
function commonCounts(receipt) {
  if (!receipt) return null;
  return {
    schema_version: receipt.schema_version ?? null, status: receipt.status ?? null,
    files_count: (receipt.files ?? []).length,
    failed_files_count: (receipt.files ?? []).filter(file => file?.failed === true).length,
    rejected_files_count: (receipt.rejected_files ?? []).length,
    bucket_counts: receipt.bucket_counts ?? null,
    rule_failures_count: (receipt.rule_failures ?? []).length,
    owner_table_failures_count: (receipt.owner_table_failures ?? []).length,
    unreadable_dirs_count: (receipt.unreadable_dirs ?? []).length,
    scanned: receipt.scanned ?? null,
    duplicates_dropped: receipt.duplicates_dropped ?? null,
    total_mails: receipt.total_mails ?? null,
  };
}

/** Warning flags (never failures) surfaced at the top level of the combined receipt -- counts/booleans only, the same no-PII posture the rest of this receipt keeps. */
function collectWarnings(commonReceipt) {
  const warnings = [];
  if (commonReceipt?.legacy_bucket_file_present === true) warnings.push('legacy_bucket_file_present');
  return warnings;
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

// S1 (2026-09-22 review, TOCTOU): the org-config digest is checked once,
// up front, in `validateInputs` -- but this run can take a while (two full
// classification passes), and the SAME file staying pinned for the WHOLE run
// is exactly what the "hard operating rule" (refresh/refreshCommon must
// classify against the same table set) depends on. A caller (or an Owner)
// editing `--org-config` mid-run would otherwise let `refresh()` classify
// against one version and `refreshCommon()` against another, with no trace
// of that in either receipt. Re-checked after step 1 and again after step 2
// (before the final receipt is built), fail-closed, exit 2 -- this is a
// run that STARTED and then hit a genuine problem, not a refusal to start.
const ISO_8601_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u;

function assertOrgConfigUnchanged(orgConfigPath, expectedSha256) {
  let actual;
  try { actual = sha256File(orgConfigPath); }
  catch { fail('workspace_ledgers_daily_org_config_changed_during_run', 'unreadable'); }
  if (actual !== expectedSha256) fail('workspace_ledgers_daily_org_config_changed_during_run');
}

/**
 * Every precondition a real run refuses on before it ever acquires the lock
 * or touches a ledger -- shared by the real run (which then proceeds) and
 * `--dry` (which stops here).
 */
function validateInputs({ workspacesRoot, workmetaRoot, orgConfigPath, orgConfigSha256, hiworksEvents, gmailSentEvents, receiptsDir, now }) {
  assertRequiredString(workspacesRoot, 'workspace_ledgers_daily_workspaces_root_required');
  assertRequiredString(workmetaRoot, 'workspace_ledgers_daily_workmeta_root_required');
  assertRequiredString(orgConfigPath, 'workspace_ledgers_daily_org_config_required');
  assertRequiredString(orgConfigSha256, 'workspace_ledgers_daily_org_config_sha256_required');
  assertRequiredString(hiworksEvents, 'workspace_ledgers_daily_hiworks_events_required');
  assertRequiredString(gmailSentEvents, 'workspace_ledgers_daily_gmail_sent_events_required');
  assertRequiredString(receiptsDir, 'workspace_ledgers_daily_receipts_required');
  // S6 (2026-09-22 review): `now` reaches a receipt FILENAME (via a naive
  // `:`/`.` -> `-` replace) and every lock-age computation above -- a
  // malformed value would produce either a broken filename or a NaN age that
  // silently reads as "infinitely old" (always stale). Refused up front,
  // exit 4, rather than discovered as a strange side effect later.
  if (!ISO_8601_INSTANT.test(now ?? '') || !Number.isFinite(Date.parse(now))) fail('workspace_ledgers_daily_now_invalid');
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
/**
 * `deps` (test-only seam, never used by the CLI wrapper below): overrides
 * for the two library calls, so a test can inject a stub that mutates the
 * fixture (e.g. rewriting the org config file, for S1's TOCTOU coverage)
 * from inside what looks like an ordinary `refresh()`/`refreshCommon()` call
 * without needing a real concurrent process or a timing race.
 */
export function runDailyRefresh({ workspacesRoot, workmetaRoot, orgConfigPath, orgConfigSha256, hiworksEvents,
  gmailSentEvents, receiptsDir, dry = false, now = new Date().toISOString(), staleLockMs = STALE_LOCK_MS, deps = {} }) {
  const refreshFn = deps.refresh ?? refresh;
  const refreshCommonFn = deps.refreshCommon ?? refreshCommon;
  validateInputs({ workspacesRoot, workmetaRoot, orgConfigPath, orgConfigSha256, hiworksEvents, gmailSentEvents, receiptsDir, now });

  if (dry) {
    // Report-only: never acquires, reclaims, or releases the lock; never
    // calls refresh()/refreshCommon(); writes nothing anywhere.
    const lockState = inspectDailyLock(receiptsDir, now, staleLockMs);
    return {
      schema_version: DAILY_RECEIPT_SCHEMA, generated_at: now, dry: true, status: 'ok',
      org_config_sha256: orgConfigSha256, lock: lockState, warnings: [],
      steps: { refresh: { ran: false, status: null }, common_refresh: { ran: false, status: null } },
    };
  }

  const lock = acquireDailyLock(receiptsDir, now, staleLockMs);
  if (lock.held) fail('workspace_ledgers_daily_lock_held');

  let refreshReceipt = null;
  let commonReceipt = null;
  let commonAttempted = false;
  try {
    refreshReceipt = refreshFn({
      workspacesRoot, workmetaRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents],
      orgConfigPath, receiptsDir, dry: false, now,
    });
    // S1: the file this whole run is pinned to must still be the file that
    // was pinned when step 1 ran against it.
    assertOrgConfigUnchanged(orgConfigPath, orgConfigSha256);
    const refreshOk = refreshReceipt.status !== 'failed';
    if (refreshOk) {
      commonAttempted = true;
      commonReceipt = refreshCommonFn({
        workspacesRoot, workmetaRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents],
        orgConfigPath, receiptsDir, dry: false, now,
      });
      // S1: and still the same file after step 2 -- both steps must have
      // classified against byte-identical bytes, not merely the same path.
      assertOrgConfigUnchanged(orgConfigPath, orgConfigSha256);
    }
    const commonOk = commonReceipt !== null && commonReceipt.status !== 'failed';
    const status = (refreshOk && commonOk) ? 'ok' : 'failed';
    const combined = {
      schema_version: DAILY_RECEIPT_SCHEMA, generated_at: now, dry: false, status,
      org_config_sha256: orgConfigSha256,
      lock: { reclaimed: lock.reclaimed === true, stale_reclaimed: lock.reclaimed === true, age_ms: lock.age_ms ?? null },
      warnings: collectWarnings(commonReceipt),
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
    // Nit (2026-09-22 review): `refresh()` is unconditionally attempted, so a
    // null `refreshReceipt` here always means it THREW (never returned), not
    // that it never ran -- `ran: false` used to misreport that. Only
    // `common_refresh` can legitimately be `ran: false` (the first step
    // failed closed and this one never started at all, `commonAttempted`
    // stays `false`); if `commonAttempted` is `true` but `commonReceipt` is
    // still `null`, `refreshCommon()` itself threw, distinct from
    // `previous_step_failed_closed`.
    const combined = {
      schema_version: DAILY_RECEIPT_SCHEMA, generated_at: now, dry: false, status: 'failed',
      org_config_sha256: orgConfigSha256,
      lock: { reclaimed: lock.reclaimed === true, stale_reclaimed: lock.reclaimed === true, age_ms: lock.age_ms ?? null },
      warnings: collectWarnings(commonReceipt),
      steps: {
        refresh: refreshReceipt ? { ran: true, ...refreshCounts(refreshReceipt) } : { ran: true, status: 'failed', reason: 'threw' },
        common_refresh: commonReceipt
          ? { ran: true, ...commonCounts(commonReceipt) }
          : (commonAttempted ? { ran: true, status: 'failed', reason: 'threw' } : { ran: false, status: null }),
      },
      // R1 (2026-09-22 review): a raw thrown error's `.message` can carry a
      // full host-local path (a bare fs error, or a bubbled-up error from
      // this run's own filesystem calls) -- every sibling writer in this
      // module redacts that down to the last path segment before it ever
      // reaches a receipt (`src/refresh.mjs`'s `redactHostPaths`); this
      // combined receipt must not be the one place in the lane that forgets.
      error: { code: error?.code ?? 'workspace_ledgers_daily_run_failed', message: redactHostPaths(String(error?.message ?? error)) },
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

// S2 (2026-09-22 review): an explicit map over THIS runner's own error
// codes, never a substring match against a library error code -- substring
// matching on words like "required"/"missing"/"unreadable" silently
// misclassified a LIBRARY code that happens to contain the same word (e.g.
// `refresh()`/`refreshCommon()` can throw their own `..._org_config_
// unreadable`-shaped codes reached mid-step-2, well past "refused before
// start") as a 4 (refuse-before-start) when it is actually a 2 (ran, and
// something failed). Any code not in this map -- every library code
// included -- defaults to 2, which is exactly right for "this run started
// and something in it failed".
const EXIT_CODE_BY_DAILY_CODE = {
  workspace_ledgers_daily_workspaces_root_required: 4,
  workspace_ledgers_daily_workmeta_root_required: 4,
  workspace_ledgers_daily_org_config_required: 4,
  workspace_ledgers_daily_org_config_sha256_required: 4,
  workspace_ledgers_daily_hiworks_events_required: 4,
  workspace_ledgers_daily_gmail_sent_events_required: 4,
  workspace_ledgers_daily_receipts_required: 4,
  workspace_ledgers_daily_now_invalid: 4,
  workspace_ledgers_daily_workspaces_root_missing: 4,
  workspace_ledgers_daily_workmeta_root_missing: 4,
  workspace_ledgers_daily_org_config_sha256_invalid: 4,
  workspace_ledgers_daily_org_config_unreadable: 4,
  workspace_ledgers_daily_org_config_sha256_mismatch: 4,
  workspace_ledgers_daily_org_config_invalid_json: 4,
  workspace_ledgers_daily_lock_held: 3,
  // S2: this is discovered only once the run has already passed every pure
  // input-validation check above and is actively trying to acquire/reclaim
  // the lock (an unexpected filesystem error on the lock file itself, not
  // simply "another run already holds it") -- grouped under exit 3 so "3"
  // keeps one coherent meaning across both codes ("something about the lock
  // state stopped this run"), distinct from 4 ("refused before touching any
  // runtime state") and 2 ("ran, and a step failed").
  workspace_ledgers_daily_lock_unavailable: 3,
  // S1: the org config changed while this run was already in progress --
  // this run STARTED, so it is a 2 ("ran, and something failed"), never a 4.
  workspace_ledgers_daily_org_config_changed_during_run: 2,
};

export function exitCodeFor(code) {
  return EXIT_CODE_BY_DAILY_CODE[code] ?? 2;
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
    // R1: the same redaction the combined receipt's own `error.message` gets
    // -- stderr is not exempt from the same host-local-path leak.
    const safeMessage = redactHostPaths(String(error?.message ?? error));
    console.error(`workspace_ledgers_daily_refresh_failed: ${error?.code ?? safeMessage}`);
    process.exitCode = exitCodeFor(error?.code);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
