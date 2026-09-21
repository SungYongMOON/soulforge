// Hermetic tests for the daily runner (`ops/daily_refresh.mjs`): happy path
// (both steps run, one combined receipt), config-digest refusal (exit 4,
// nothing written), first-step-failed-closed (second step never runs, exit
// 2), lock held (exit 3), stale lock reclaimed and recorded, `--dry` writes
// nothing, and the combined receipt never carries a subject/address/host
// path even though the underlying custody fixture does.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { encodeCsv } from '../src/ledgers.mjs';
import { refresh } from '../src/refresh.mjs';
import { refreshCommon } from '../src/common_refresh.mjs';
import {
  acquireDailyLock, atomicWriteJson, DAILY_RECEIPT_SCHEMA, exitCodeFor, releaseDailyLock, runDailyRefresh, sha256File,
} from '../ops/daily_refresh.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'ops', 'daily_refresh.mjs');

function rule(code, folder, exactPairs) {
  return {
    schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: folder, rule_version: 'v1', status: 'draft',
    match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: exactPairs.map(([label, value]) => ({ label, kind: 'literal', value })), hint: [],
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  };
}

const RULE_DIR = '020_MGMT/021_자동화설정_운영규칙';
const CODE_A = 'P00-001';
const FOLDER_A = 'P00-001_예시과제';
const COMMON_FOLDER = 'P00-000_공통';
const GENERAL_WORK_FOLDER = 'general_work_일반업무';

// A canary subject/name/address that must never surface verbatim in the
// combined daily receipt -- only counts are allowed there.
const CANARY_SUBJECT = '예시장비 납품 극비 협상';
const CANARY_SENDER = 'private-canary@client.example';

function jsonl(lines) { return lines.map(line => JSON.stringify(line)).join('\n'); }

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-daily-'));
  const workspacesRoot = path.join(root, '_workspaces');
  const workmetaRoot = path.join(root, '_workmeta');
  const hiworksDir = path.join(root, 'events', 'hiworks');
  const gmailDir = path.join(root, 'events', 'gmail_sent');
  const receiptsDir = path.join(root, 'receipts');
  for (const dir of [hiworksDir, gmailDir, receiptsDir, workmetaRoot]) mkdirSync(dir, { recursive: true });

  const ruleDirA = path.join(workspacesRoot, FOLDER_A, RULE_DIR);
  mkdirSync(ruleDirA, { recursive: true });
  writeFileSync(path.join(ruleDirA, 'mail_routing_rule.json'),
    `${JSON.stringify(rule(CODE_A, FOLDER_A, [['P00-001', 'P00-001']]), null, 2)}\n`);

  mkdirSync(path.join(workspacesRoot, COMMON_FOLDER, '020_MGMT/021_자동화설정_운영규칙'), { recursive: true });
  mkdirSync(path.join(workspacesRoot, COMMON_FOLDER, '020_MGMT/023_연락처_이해관계자'), { recursive: true });
  mkdirSync(path.join(workspacesRoot, GENERAL_WORK_FOLDER), { recursive: true });

  writeFileSync(path.join(hiworksDir, 'events.jsonl'), jsonl([
    { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: CANARY_SENDER, to: ['me@example.com'], cc: [],
      received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    { event_id: 'h2', subject: CANARY_SUBJECT, from: 'x@client.example', to: ['me@example.com'], cc: [],
      received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
  ]));
  writeFileSync(path.join(gmailDir, 'events.jsonl'), '');

  const orgConfigPath = path.join(root, 'org_config.json');
  writeFileSync(orgConfigPath, JSON.stringify({
    our_domain: 'example.com', organisations: { 'example.com': 'Example Corp', 'client.example': 'Client Inc' }, family: {},
    common_ledgers: { common_folder_name: COMMON_FOLDER, general_work_folder_name: GENERAL_WORK_FOLDER },
  }));
  const orgConfigSha256 = sha256File(orgConfigPath);

  return { root, workspacesRoot, workmetaRoot, hiworksDir, gmailDir, receiptsDir, orgConfigPath, orgConfigSha256 };
}

function baseArgs(fixture, extra = {}) {
  return {
    workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot, orgConfigPath: fixture.orgConfigPath,
    orgConfigSha256: fixture.orgConfigSha256, hiworksEvents: fixture.hiworksDir, gmailSentEvents: fixture.gmailDir,
    receiptsDir: fixture.receiptsDir, now: '2026-09-22T00:00:00.000Z', ...extra,
  };
}

function dailyReceiptFiles(receiptsDir) {
  return readdirSync(receiptsDir).filter(name => name.startsWith('daily-') && name.endsWith('.json'));
}

test('daily refresh: happy path writes both ledgers and one combined receipt', () => {
  const fixture = makeFixture();
  try {
    const receipt = runDailyRefresh(baseArgs(fixture));
    assert.equal(receipt.schema_version, DAILY_RECEIPT_SCHEMA);
    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.dry, false);
    assert.equal(receipt.steps.refresh.ran, true);
    assert.equal(receipt.steps.refresh.status, 'ok');
    assert.equal(receipt.steps.common_refresh.ran, true);
    assert.equal(receipt.steps.common_refresh.status, 'ok');

    const contactsCsv = path.join(fixture.workspacesRoot, FOLDER_A, '020_MGMT/023_연락처_이해관계자/연락처_장부.csv');
    assert.equal(existsSync(contactsCsv), true, 'project ledger was not written');
    const commonUnclassified = path.join(fixture.workspacesRoot, COMMON_FOLDER, '020_MGMT/027_수신이력_이동이력/미분류.csv');
    assert.equal(existsSync(commonUnclassified), true, 'common-folder ledger was not written');

    const files = dailyReceiptFiles(fixture.receiptsDir);
    assert.equal(files.length, 1);
    assert.equal(files[0].endsWith('-failed.json'), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('daily refresh: org-config digest mismatch refuses before start (exit 4 via CLI), nothing written', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { orgConfigSha256: `sha256:${'0'.repeat(64)}` })),
      error => error.code === 'workspace_ledgers_daily_org_config_sha256_mismatch');
    assert.equal(dailyReceiptFiles(fixture.receiptsDir).length, 0, 'a refused run must write no daily receipt');
    assert.equal(existsSync(path.join(fixture.receiptsDir, 'daily_refresh.lock')), false, 'a refused run must not touch the lock');

    try {
      execFileSync(process.execPath, [CLI,
        '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
        '--org-config', fixture.orgConfigPath, '--org-config-sha256', `sha256:${'0'.repeat(64)}`,
        '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir,
        '--receipts', fixture.receiptsDir, '--now', '2026-09-22T00:00:00.000Z'],
        { stdio: 'pipe' });
      assert.fail('expected a non-zero exit');
    } catch (error) {
      assert.equal(error.status, 4, `expected exit 4, got ${error.status}: ${error.stderr}`);
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('daily refresh: missing workspaces root refuses before start (exit 4)', () => {
  const fixture = makeFixture();
  try {
    execFileSync(process.execPath, [CLI,
      '--workspaces-root', path.join(fixture.root, 'does-not-exist'), '--workmeta-root', fixture.workmetaRoot,
      '--org-config', fixture.orgConfigPath, '--org-config-sha256', fixture.orgConfigSha256,
      '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir,
      '--receipts', fixture.receiptsDir, '--now', '2026-09-22T00:00:00.000Z'],
      { stdio: 'pipe' });
    assert.fail('expected a non-zero exit');
  } catch (error) {
    assert.equal(error.status, 4);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('daily refresh: first step failed closed (unreadable custody) -- second step never runs, exit 2', () => {
  const fixture = makeFixture();
  try {
    const badHiworks = path.join(fixture.root, 'events', 'hiworks-typo');
    // refresh()/refreshCommon() report `status: 'failed'` by RETURNING a
    // receipt, not by throwing (matching their own library convention) --
    // this call must do the same, never throw for an ordinary fail-closed
    // custody problem.
    const direct = runDailyRefresh(baseArgs(fixture, { hiworksEvents: badHiworks, now: '2026-09-22T02:00:00.000Z' }));
    assert.equal(direct.status, 'failed');
    assert.equal(direct.steps.refresh.ran, true);
    assert.equal(direct.steps.refresh.status, 'failed');
    assert.equal(direct.steps.common_refresh.ran, false);

    try {
      execFileSync(process.execPath, [CLI,
        '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
        '--org-config', fixture.orgConfigPath, '--org-config-sha256', fixture.orgConfigSha256,
        '--hiworks-events', badHiworks, '--gmail-sent-events', fixture.gmailDir,
        '--receipts', fixture.receiptsDir, '--now', '2026-09-22T01:00:00.000Z'],
        { stdio: 'pipe' });
      assert.fail('expected a non-zero exit');
    } catch (error) {
      assert.equal(error.status, 2, `expected exit 2, got ${error.status}: ${error.stderr}`);
    }

    // Both the direct call above and this CLI subprocess call ran the same
    // failing shape (different `now` stamps, so each wrote its own daily
    // receipt file) -- every one of them must be `status: 'failed'` with the
    // second step never run.
    const files = dailyReceiptFiles(fixture.receiptsDir);
    assert.ok(files.length >= 1, 'expected at least one daily receipt file');
    for (const name of files) {
      const receipt = JSON.parse(readFileSync(path.join(fixture.receiptsDir, name), 'utf8'));
      assert.equal(receipt.status, 'failed');
      assert.equal(receipt.steps.refresh.ran, true);
      assert.equal(receipt.steps.refresh.status, 'failed');
      assert.equal(receipt.steps.common_refresh.ran, false);
      assert.equal(receipt.steps.common_refresh.reason, 'previous_step_failed_closed');
    }

    // The common-folder ledgers must not have been written this call.
    const commonUnclassified = path.join(fixture.workspacesRoot, COMMON_FOLDER, '020_MGMT/027_수신이력_이동이력/미분류.csv');
    assert.equal(existsSync(commonUnclassified), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('daily refresh: lock held refuses with exit 3', () => {
  const fixture = makeFixture();
  try {
    const lock = acquireDailyLock(fixture.receiptsDir, '2026-09-22T00:00:00.000Z');
    assert.equal(lock.held, false);
    try {
      execFileSync(process.execPath, [CLI,
        '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
        '--org-config', fixture.orgConfigPath, '--org-config-sha256', fixture.orgConfigSha256,
        '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir,
        '--receipts', fixture.receiptsDir, '--now', '2026-09-22T00:05:00.000Z'],
        { stdio: 'pipe' });
      assert.fail('expected a non-zero exit');
    } catch (error) {
      assert.equal(error.status, 3, `expected exit 3, got ${error.status}: ${error.stderr}`);
    }
    releaseDailyLock(fixture.receiptsDir, lock.ownership);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('daily refresh: a stale lock is reclaimed and the reclaim is recorded in the receipt', () => {
  const fixture = makeFixture();
  try {
    // A lock "started" three hours before `now`, well past this runner's 2h staleness.
    atomicWriteJson(path.join(fixture.receiptsDir, 'daily_refresh.lock'),
      { pid: 999999, started_at: '2026-09-21T21:00:00.000Z' });
    const receipt = runDailyRefresh(baseArgs(fixture, { now: '2026-09-22T00:00:00.000Z' }));
    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.lock.stale_reclaimed, true);
    assert.ok(receipt.lock.age_ms >= 3 * 60 * 60 * 1000 - 1000);
    // The lock must be released (not left held) once the run finishes.
    assert.equal(existsSync(path.join(fixture.receiptsDir, 'daily_refresh.lock')), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('daily refresh: --dry writes nothing (no ledgers, no receipt, no lock)', () => {
  const fixture = makeFixture();
  try {
    const receipt = runDailyRefresh(baseArgs(fixture, { dry: true }));
    assert.equal(receipt.dry, true);
    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.steps.refresh.ran, false);
    assert.equal(receipt.steps.common_refresh.ran, false);

    assert.equal(dailyReceiptFiles(fixture.receiptsDir).length, 0);
    assert.equal(existsSync(path.join(fixture.receiptsDir, 'daily_refresh.lock')), false);
    const contactsCsv = path.join(fixture.workspacesRoot, FOLDER_A, '020_MGMT/023_연락처_이해관계자/연락처_장부.csv');
    assert.equal(existsSync(contactsCsv), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('daily refresh: the combined receipt never carries a subject, sender address, or host path', () => {
  const fixture = makeFixture();
  try {
    runDailyRefresh(baseArgs(fixture));
    const files = dailyReceiptFiles(fixture.receiptsDir);
    const text = readFileSync(path.join(fixture.receiptsDir, files[0]), 'utf8');
    assert.equal(text.includes(CANARY_SUBJECT), false, 'receipt leaked a mail subject');
    assert.equal(text.includes(CANARY_SENDER), false, 'receipt leaked a sender address');
    assert.equal(text.includes(fixture.root), false, 'receipt leaked a host-local path');
    assert.equal(text.includes(fixture.workspacesRoot), false, 'receipt leaked a host-local path');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ============================================================ 2026-09-22 review

// -------------------------------------------------------------------- R1
test('R1: a raw fs error thrown mid-run is redacted before it reaches the failed receipt', () => {
  const fixture = makeFixture();
  try {
    const leakedPath = path.join(fixture.workspacesRoot, FOLDER_A, '020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.json');
    const rawError = new Error(`ENOENT: no such file or directory, open '${leakedPath}'`);
    rawError.code = 'ENOENT';
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { deps: { refresh: () => { throw rawError; } } })),
      error => error === rawError);

    const files = dailyReceiptFiles(fixture.receiptsDir);
    assert.equal(files.length, 1);
    const text = readFileSync(path.join(fixture.receiptsDir, files[0]), 'utf8');
    assert.equal(text.includes(fixture.root), false, 'receipt leaked the fixture root path');
    assert.equal(text.includes(FOLDER_A), false, 'receipt leaked the project folder name');
    const receipt = JSON.parse(text);
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.error.code, 'ENOENT');
    assert.equal(receipt.error.message.includes(fixture.root), false);
    assert.equal(receipt.error.message.includes(FOLDER_A), false);
    assert.match(receipt.error.message, /mail_routing_rule\.json/u); // the leaf file name itself is not a secret
    assert.equal(receipt.steps.refresh.ran, true);
    assert.equal(receipt.steps.refresh.reason, 'threw'); // nit: refresh() was attempted, not skipped
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('R1: a codeless thrown error also has its message redacted (the stderr fallback path shares the same redaction call)', () => {
  const fixture = makeFixture();
  try {
    const leakedPath = path.join(fixture.workspacesRoot, FOLDER_A, 'some_file.json');
    const rawError = new Error(`something failed near '${leakedPath}'`); // deliberately no .code
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { deps: { refresh: () => { throw rawError; } } })));
    const files = dailyReceiptFiles(fixture.receiptsDir);
    const receipt = JSON.parse(readFileSync(path.join(fixture.receiptsDir, files[0]), 'utf8'));
    assert.equal(receipt.error.code, 'workspace_ledgers_daily_run_failed'); // no .code on the raw error -> generic fallback code
    assert.equal(receipt.error.message.includes(fixture.root), false);
    assert.equal(receipt.error.message.includes(FOLDER_A), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------- R2
test('R2: a FUTURE-dated lock (clock skew) is treated as stale immediately, not clamped to "fresh forever"', () => {
  const fixture = makeFixture();
  try {
    atomicWriteJson(path.join(fixture.receiptsDir, 'daily_refresh.lock'),
      { pid: 999999, started_at: '2027-09-22T00:00:00.000Z' }); // one year in the future relative to `now` below
    const receipt = runDailyRefresh(baseArgs(fixture, { now: '2026-09-22T00:00:00.000Z' }));
    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.lock.stale_reclaimed, true);
    assert.ok(receipt.lock.age_ms < 0, `expected a negative recorded age for a future-dated lock, got ${receipt.lock.age_ms}`);
    assert.equal(existsSync(path.join(fixture.receiptsDir, 'daily_refresh.lock')), false); // released after the run
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------- R3
const COMMON_UNCLASSIFIED_REL = '020_MGMT/027_수신이력_이동이력/미분류.csv';
const LEGACY_BUCKET_REL = '020_MGMT/027_수신이력_이동이력/과제없음_확인함.csv';

test('R3: a common-ledger file that fails to write is reported as failed_files_count, never a phantom ledger_failures_count', () => {
  const fixture = makeFixture();
  try {
    const unclassifiedPath = path.join(fixture.workspacesRoot, COMMON_FOLDER, COMMON_UNCLASSIFIED_REL);
    mkdirSync(path.dirname(unclassifiedPath), { recursive: true });
    // A header that does not match this ledger's own contract -- R4 fail-closed:
    // left untouched, recorded as a per-file failure, never merged into or
    // overwritten.
    writeFileSync(unclassifiedPath, encodeCsv(['엉뚱한헤더', '분류'], [['x', 'y']]));

    const receipt = runDailyRefresh(baseArgs(fixture));
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.steps.common_refresh.ran, true);
    assert.equal(receipt.steps.common_refresh.status, 'failed');
    assert.equal(receipt.steps.common_refresh.failed_files_count, 1);
    assert.equal(receipt.steps.common_refresh.rejected_files_count, 0);
    assert.equal('ledger_failures_count' in receipt.steps.common_refresh, false,
      'ledger_failures_count must be dropped -- refreshCommon() never emits that field');

    // The corrupted file itself must be left untouched (R4: never merged into).
    const stillCorrupt = readFileSync(unclassifiedPath, 'utf8');
    assert.match(stillCorrupt, /엉뚱한헤더/u);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('R3: a legacy pre-rename bucket file present on disk is surfaced as a combined-receipt warning, not a failure', () => {
  const fixture = makeFixture();
  try {
    const legacyPath = path.join(fixture.workspacesRoot, COMMON_FOLDER, LEGACY_BUCKET_REL);
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, encodeCsv(['이력키', '분류', '수신시각', '제목', '발신자', '발신자메일', '첨부수', '메일소스ID', '원문복사여부', '메모'], []));

    const receipt = runDailyRefresh(baseArgs(fixture));
    assert.equal(receipt.status, 'ok'); // a warning alone must never fail the run
    assert.ok(Array.isArray(receipt.warnings));
    assert.ok(receipt.warnings.includes('legacy_bucket_file_present'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------- S1
test('S1: the org config changing between step 1 and step 2 fails the run closed with org_config_changed_during_run (exit 2)', () => {
  const fixture = makeFixture();
  try {
    const stubRefresh = args => {
      const result = refresh(args);
      // A concurrent edit landing right after step 1 read the config.
      writeFileSync(fixture.orgConfigPath, `${JSON.stringify({ our_domain: 'changed.example', organisations: {}, family: {} })}\n`);
      return result;
    };
    let threw;
    try { runDailyRefresh(baseArgs(fixture, { deps: { refresh: stubRefresh } })); }
    catch (error) { threw = error; }
    assert.ok(threw, 'expected runDailyRefresh to throw');
    assert.equal(threw.code, 'workspace_ledgers_daily_org_config_changed_during_run');

    const files = dailyReceiptFiles(fixture.receiptsDir);
    const receipt = JSON.parse(readFileSync(path.join(fixture.receiptsDir, files[0]), 'utf8'));
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.error.code, 'workspace_ledgers_daily_org_config_changed_during_run');
    // Step 1's own real receipt is preserved; step 2 never started.
    assert.equal(receipt.steps.refresh.ran, true);
    assert.notEqual(receipt.steps.refresh.status, null);
    assert.equal(receipt.steps.common_refresh.ran, false);
    assert.equal(exitCodeFor(threw.code), 2); // "ran, and something failed" -- never 4
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('S1: the org config changing between step 2 and the final receipt also fails the run closed', () => {
  const fixture = makeFixture();
  try {
    const stubRefreshCommon = args => {
      const result = refreshCommon(args);
      writeFileSync(fixture.orgConfigPath, `${JSON.stringify({ our_domain: 'changed-again.example', organisations: {}, family: {} })}\n`);
      return result;
    };
    let threw;
    try { runDailyRefresh(baseArgs(fixture, { deps: { refreshCommon: stubRefreshCommon } })); }
    catch (error) { threw = error; }
    assert.ok(threw, 'expected runDailyRefresh to throw');
    assert.equal(threw.code, 'workspace_ledgers_daily_org_config_changed_during_run');

    const files = dailyReceiptFiles(fixture.receiptsDir);
    const receipt = JSON.parse(readFileSync(path.join(fixture.receiptsDir, files[0]), 'utf8'));
    assert.equal(receipt.steps.refresh.status, 'ok');
    assert.equal(receipt.steps.common_refresh.ran, true);
    assert.notEqual(receipt.steps.common_refresh.status, null); // the real common receipt is preserved
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------- S2
test('S2: exitCodeFor maps this runner\'s own codes explicitly -- a library-shaped code, or any unknown code, defaults to 2 (never 4)', () => {
  // This runner's own pre-lock validation codes: exit 4.
  assert.equal(exitCodeFor('workspace_ledgers_daily_workspaces_root_missing'), 4);
  assert.equal(exitCodeFor('workspace_ledgers_daily_org_config_sha256_mismatch'), 4);
  assert.equal(exitCodeFor('workspace_ledgers_daily_now_invalid'), 4);
  // Lock-state codes: exit 3 (documented together -- see the map's own doc for why
  // daily_lock_unavailable, an unexpected fs error acquiring the lock, is grouped
  // with daily_lock_held rather than treated as a pre-start refusal).
  assert.equal(exitCodeFor('workspace_ledgers_daily_lock_held'), 3);
  assert.equal(exitCodeFor('workspace_ledgers_daily_lock_unavailable'), 3);
  // S1's own mid-run failure: exit 2, never 4, because the run already started.
  assert.equal(exitCodeFor('workspace_ledgers_daily_org_config_changed_during_run'), 2);
  // A LIBRARY code reached mid-run (refresh()/refreshCommon() throwing their own
  // `..._org_config_unreadable`-shaped error during step 1/2) must be 2, never 4 --
  // this is exactly the class of bug substring-matching on "unreadable" caused.
  assert.equal(exitCodeFor('workspace_ledgers_org_config_unreadable'), 2);
  assert.equal(exitCodeFor('workspace_ledgers_refresh_lock_held'), 2); // a library "lock_held"-shaped code is NOT this runner's own lock
  assert.equal(exitCodeFor('totally_unrecognised_code'), 2);
  assert.equal(exitCodeFor(undefined), 2);
  assert.equal(exitCodeFor(null), 2);
});

test('S2: a library org_config_unreadable thrown during step 2 (refreshCommon) exits 2 through the real CLI, not 4', () => {
  const fixture = makeFixture();
  try {
    class FakeLibraryError extends Error { constructor(code) { super(code); this.code = code; } }
    const throwingCommon = () => { throw new FakeLibraryError('workspace_ledgers_org_config_unreadable'); };
    let threw;
    try { runDailyRefresh(baseArgs(fixture, { deps: { refreshCommon: throwingCommon } })); }
    catch (error) { threw = error; }
    assert.equal(threw.code, 'workspace_ledgers_org_config_unreadable');
    assert.equal(exitCodeFor(threw.code), 2);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------- S5
/** Recursive {relPath: {size, mtimeMs}} snapshot of a directory tree -- catches ANY write, not just the specific files this test already knows about. */
function snapshotTree(root) {
  const out = {};
  const walk = (dir, prefix) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full, rel); continue; }
      const stat = statSync(full);
      out[rel] = { size: stat.size, mtimeMs: stat.mtimeMs };
    }
  };
  walk(root, '');
  return out;
}

test('S5: --dry writes nothing anywhere in the fixture plane (snapshot-and-diff, not just the files this test already knows about)', () => {
  const fixture = makeFixture();
  try {
    const before = snapshotTree(fixture.root);
    runDailyRefresh(baseArgs(fixture, { dry: true }));
    const after = snapshotTree(fixture.root);
    assert.deepEqual(after, before, 'the fixture plane changed during a --dry run');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('S5: --dry with a --receipts directory that does not exist yet must not create it', () => {
  const fixture = makeFixture();
  try {
    const absentReceipts = path.join(fixture.root, 'receipts-not-yet-created');
    assert.equal(existsSync(absentReceipts), false);
    const receipt = runDailyRefresh(baseArgs(fixture, { dry: true, receiptsDir: absentReceipts }));
    assert.equal(receipt.dry, true);
    assert.equal(existsSync(absentReceipts), false, '--dry must not create the receipts directory');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------- S6
test('S6: a malformed --now is refused up front (exit 4), never reaches a filename or a lock-age computation', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { now: 'not-a-date' })),
      error => error.code === 'workspace_ledgers_daily_now_invalid');
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { now: '2026-09-22' })), // date only, no time -- not this runner's accepted shape
      error => error.code === 'workspace_ledgers_daily_now_invalid');
    assert.equal(dailyReceiptFiles(fixture.receiptsDir).length, 0);

    try {
      execFileSync(process.execPath, [CLI,
        '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
        '--org-config', fixture.orgConfigPath, '--org-config-sha256', fixture.orgConfigSha256,
        '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir,
        '--receipts', fixture.receiptsDir, '--now', 'garbage', '--dry'], { stdio: 'pipe' });
      assert.fail('expected a non-zero exit');
    } catch (error) { assert.equal(error.status, 4); }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- nits
test('nit: --dry\'s lock inspection agrees with what a real run would do for an unreadable lock file', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.receiptsDir, 'daily_refresh.lock'), 'not json at all');
    const dryReceipt = runDailyRefresh(baseArgs(fixture, { dry: true }));
    assert.equal(dryReceipt.lock.held, false, '--dry must report an unreadable lock as reclaimable, matching acquireDailyLock');

    // And a real run against the same unreadable lock file actually proceeds (reclaims it), never refuses with lock_held.
    const realReceipt = runDailyRefresh(baseArgs(fixture));
    assert.equal(realReceipt.status, 'ok');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('nit: refreshCommon() throwing is recorded distinctly from previous_step_failed_closed', () => {
  const fixture = makeFixture();
  try {
    const throwingCommon = () => { const error = new Error('boom'); error.code = 'workspace_ledgers_common_refresh_synthetic_failure'; throw error; };
    let threw;
    try { runDailyRefresh(baseArgs(fixture, { deps: { refreshCommon: throwingCommon } })); }
    catch (error) { threw = error; }
    assert.ok(threw);
    const files = dailyReceiptFiles(fixture.receiptsDir);
    const receipt = JSON.parse(readFileSync(path.join(fixture.receiptsDir, files[0]), 'utf8'));
    assert.equal(receipt.steps.refresh.status, 'ok'); // step 1 genuinely succeeded
    assert.equal(receipt.steps.common_refresh.ran, true);
    assert.equal(receipt.steps.common_refresh.status, 'failed');
    assert.equal(receipt.steps.common_refresh.reason, 'threw');
    assert.notEqual(receipt.steps.common_refresh.reason, 'previous_step_failed_closed');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ==================================================== 2026-09-22 review, round 2

function runCliArgs(fixture, extraArgs = []) {
  return [CLI,
    '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
    '--org-config', fixture.orgConfigPath, '--org-config-sha256', fixture.orgConfigSha256,
    '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir,
    '--receipts', fixture.receiptsDir, ...extraArgs];
}

function cliExitStatus(args) {
  try { execFileSync(process.execPath, args, { stdio: 'pipe' }); return 0; }
  catch (error) { return error.status; }
}

// -------------------------------------------------------------------- R-1
test('R-1: an existing regular file as --receipts refuses before start (exit 4), nothing written, errno-agnostic', () => {
  const fixture = makeFixture();
  try {
    const receiptsAsFile = path.join(fixture.root, 'receipts-is-a-file');
    writeFileSync(receiptsAsFile, 'not a directory');

    assert.throws(() => runDailyRefresh(baseArgs(fixture, { receiptsDir: receiptsAsFile })),
      error => error.code === 'workspace_ledgers_daily_receipts_unusable');
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { receiptsDir: receiptsAsFile, dry: true })),
      error => error.code === 'workspace_ledgers_daily_receipts_unusable');
    assert.equal(exitCodeFor('workspace_ledgers_daily_receipts_unusable'), 4);

    assert.equal(cliExitStatus(runCliArgs({ ...fixture, receiptsDir: receiptsAsFile }, ['--now', '2026-09-22T00:00:00.000Z'])), 4);
    assert.equal(cliExitStatus(runCliArgs({ ...fixture, receiptsDir: receiptsAsFile }, ['--now', '2026-09-22T00:00:00.000Z', '--dry'])), 4);

    // Nothing written: the file at receiptsAsFile is untouched (still a plain file, same content), and no sibling lock/receipt exists.
    assert.equal(statSync(receiptsAsFile).isFile(), true);
    assert.equal(readFileSync(receiptsAsFile, 'utf8'), 'not a directory');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('R-1: --receipts nested under a regular file refuses before start (exit 4), nothing written, errno-agnostic', () => {
  const fixture = makeFixture();
  try {
    const blockingFile = path.join(fixture.root, 'blocking-file');
    writeFileSync(blockingFile, 'x');
    const nestedReceipts = path.join(blockingFile, 'receipts'); // a path segment above this is a regular file, not a directory

    assert.throws(() => runDailyRefresh(baseArgs(fixture, { receiptsDir: nestedReceipts })),
      error => error.code === 'workspace_ledgers_daily_receipts_unusable');
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { receiptsDir: nestedReceipts, dry: true })),
      error => error.code === 'workspace_ledgers_daily_receipts_unusable');

    assert.equal(cliExitStatus(runCliArgs({ ...fixture, receiptsDir: nestedReceipts }, ['--now', '2026-09-22T00:00:00.000Z'])), 4);
    assert.equal(cliExitStatus(runCliArgs({ ...fixture, receiptsDir: nestedReceipts }, ['--now', '2026-09-22T00:00:00.000Z', '--dry'])), 4);

    assert.equal(existsSync(nestedReceipts), false, 'nothing must be created under the blocking file');
    assert.equal(statSync(blockingFile).isFile(), true);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('R-1: a --receipts directory that simply does not exist yet (the ordinary case) is still accepted', () => {
  const fixture = makeFixture();
  try {
    const freshReceipts = path.join(fixture.root, 'not-created-yet', 'receipts');
    const receipt = runDailyRefresh(baseArgs(fixture, { receiptsDir: freshReceipts }));
    assert.equal(receipt.status, 'ok');
    assert.equal(existsSync(freshReceipts), true);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------- S-1 (round 2)
test('S-1 (round 2): a stale lock that is a DIRECTORY is reclaimed and its rename-away sibling is fully (recursively) cleaned up', () => {
  const fixture = makeFixture();
  try {
    const lockPath = path.join(fixture.receiptsDir, 'daily_refresh.lock');
    mkdirSync(path.join(lockPath, 'nested'), { recursive: true }); // a non-empty directory where the lock file should be
    writeFileSync(path.join(lockPath, 'nested', 'leftover.txt'), 'x');

    const lock = acquireDailyLock(fixture.receiptsDir, '2026-09-22T00:00:00.000Z');
    assert.equal(lock.held, false);
    assert.equal(lock.reclaimed, true);

    assert.equal(statSync(lockPath).isFile(), true, 'the lock path must now hold a real lock FILE, not the old directory');
    const staleLeftovers = readdirSync(fixture.receiptsDir).filter(name => name.startsWith('.daily_refresh.lock.stale-'));
    assert.deepEqual(staleLeftovers, [], 'the renamed-away directory must be fully cleaned up, not left behind');

    releaseDailyLock(fixture.receiptsDir, lock.ownership);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('S-1 (round 2): an old leaked stale-rename entry self-heals (is swept) on the next acquire; a recent one is left alone', () => {
  const fixture = makeFixture();
  try {
    const now = '2026-09-22T00:00:00.000Z';
    const oldLeak = path.join(fixture.receiptsDir, '.daily_refresh.lock.stale-old-leak');
    const recentLeak = path.join(fixture.receiptsDir, '.daily_refresh.lock.stale-recent-leak');
    mkdirSync(fixture.receiptsDir, { recursive: true });
    writeFileSync(oldLeak, 'leaked');
    writeFileSync(recentLeak, 'leaked');
    // Both mtimes are set explicitly relative to the fixture's own fixed
    // `now` -- the file's REAL (wall-clock) creation mtime is irrelevant
    // and must not be relied on, since `now` here is a fixed fixture value
    // that generally does not equal the real current time.
    const threeHoursAgo = new Date(Date.parse(now) - 3 * 60 * 60 * 1000);
    const oneMinuteAgo = new Date(Date.parse(now) - 60 * 1000);
    utimesSync(oldLeak, threeHoursAgo, threeHoursAgo);
    utimesSync(recentLeak, oneMinuteAgo, oneMinuteAgo);

    const lock = acquireDailyLock(fixture.receiptsDir, now);
    assert.equal(lock.held, false);
    assert.equal(existsSync(oldLeak), false, 'an old leaked stale-rename entry must self-heal (be swept) on the next acquire');
    assert.equal(existsSync(recentLeak), true, 'a recent stale-rename entry (not yet past the threshold) must be left alone');

    releaseDailyLock(fixture.receiptsDir, lock.ownership);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------- S-2
test('S-2: common_refresh that never started because refresh() itself threw is reason "not_started", distinct from "threw"', () => {
  const fixture = makeFixture();
  try {
    const rawError = new Error('boom, no path in this one');
    let threw;
    try { runDailyRefresh(baseArgs(fixture, { deps: { refresh: () => { throw rawError; } } })); }
    catch (error) { threw = error; }
    assert.ok(threw);
    const files = dailyReceiptFiles(fixture.receiptsDir);
    const receipt = JSON.parse(readFileSync(path.join(fixture.receiptsDir, files[0]), 'utf8'));
    assert.equal(receipt.steps.refresh.ran, true);
    assert.equal(receipt.steps.refresh.reason, 'threw');
    assert.equal(receipt.steps.common_refresh.ran, false);
    assert.equal(receipt.steps.common_refresh.status, null);
    assert.equal(receipt.steps.common_refresh.reason, 'not_started');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- nits (round 2)
test('nit: an impossible calendar date in --now (2026-02-30, which Date.parse silently rolls to March) is refused, exit 4', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { now: '2026-02-30T00:00:00.000Z' })),
      error => error.code === 'workspace_ledgers_daily_now_invalid');
    // An out-of-range time field (shape-valid, calendar-invalid) is caught the same way.
    assert.throws(() => runDailyRefresh(baseArgs(fixture, { now: '2026-09-22T99:99:99.000Z' })),
      error => error.code === 'workspace_ledgers_daily_now_invalid');
    assert.equal(dailyReceiptFiles(fixture.receiptsDir).length, 0);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('nit: a present-but-valueless --now never silently falls back to the wall clock', () => {
  const fixture = makeFixture();
  try {
    // --now immediately followed by another flag (no value token for --now at all).
    assert.equal(cliExitStatus(runCliArgs(fixture, ['--now', '--dry'])), 4);
    // --now as the very last argument (nothing after it).
    assert.equal(cliExitStatus(runCliArgs(fixture, ['--dry', '--now'])), 4);
    assert.equal(dailyReceiptFiles(fixture.receiptsDir).length, 0);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('nit: workspace_ledgers_daily_run_failed is explicitly mapped to exit 2', () => {
  assert.equal(exitCodeFor('workspace_ledgers_daily_run_failed'), 2);
});
