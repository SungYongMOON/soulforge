// Hermetic tests for the daily runner (`ops/daily_refresh.mjs`): happy path
// (both steps run, one combined receipt), config-digest refusal (exit 4,
// nothing written), first-step-failed-closed (second step never runs, exit
// 2), lock held (exit 3), stale lock reclaimed and recorded, `--dry` writes
// nothing, and the combined receipt never carries a subject/address/host
// path even though the underlying custody fixture does.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import {
  acquireDailyLock, atomicWriteJson, DAILY_RECEIPT_SCHEMA, releaseDailyLock, runDailyRefresh, sha256File,
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
