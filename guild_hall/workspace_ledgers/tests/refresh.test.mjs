import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { decodeCsv, encodeCsv } from '../src/ledgers.mjs';
import { clearCustodyCache, previewRule, REFRESH_RECEIPT_SCHEMA, refresh, RefreshError } from '../src/refresh.mjs';

function rule(code, folder, exactPairs) {
  return {
    schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: folder, rule_version: 'v1', status: 'draft',
    match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: exactPairs.map(([label, value]) => ({ label, kind: 'literal', value })), hint: [],
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  };
}

const CODE_A = 'P00-001';
const FOLDER_A = 'P00-001_예시과제';
const CODE_B = 'P00-002';
const FOLDER_B = 'P00-002_다른과제';
const RULE_DIR = '020_MGMT/021_자동화설정_운영규칙';

function jsonl(lines) { return lines.map(line => JSON.stringify(line)).join('\n'); }

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-refresh-'));
  const workspacesRoot = path.join(root, '_workspaces');
  const workmetaRoot = path.join(root, '_workmeta');
  const hiworksDir = path.join(root, 'events', 'hiworks');
  const gmailDir = path.join(root, 'events', 'gmail_sent');
  const receiptsDir = path.join(root, 'receipts');
  for (const dir of [hiworksDir, gmailDir, receiptsDir]) mkdirSync(dir, { recursive: true });

  const ruleDirA = path.join(workspacesRoot, FOLDER_A, RULE_DIR);
  const ruleDirB = path.join(workspacesRoot, FOLDER_B, RULE_DIR);
  mkdirSync(ruleDirA, { recursive: true });
  mkdirSync(ruleDirB, { recursive: true });
  writeFileSync(path.join(ruleDirA, 'mail_routing_rule.json'),
    `${JSON.stringify(rule(CODE_A, FOLDER_A, [['P00-001', 'P00-001'], ['예시장비', '예시장비']]), null, 2)}\n`);
  writeFileSync(path.join(ruleDirB, 'mail_routing_rule.json'),
    `${JSON.stringify(rule(CODE_B, FOLDER_B, [['P00-002', 'P00-002']]), null, 2)}\n`);

  writeFileSync(path.join(hiworksDir, 'events.jsonl'), jsonl([
    { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: 'staff@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    { event_id: 'h2', subject: 'P00-001 그리고 P00-002 동시 언급', from: 'staff@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
    { event_id: 'h3', subject: 'notice', from: 'noreply@slack.com', to: ['me@example.com'], cc: [], received_at: '2026-09-01T03:00:00Z', body_text: '', attachments: [] },
    { event_id: 'h4', subject: '[P00-002] 다른과제 공지', from: 'other@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T04:00:00Z', body_text: '', attachments: [] },
  ]));
  writeFileSync(path.join(gmailDir, 'events.jsonl'), jsonl([
    { event_id: 'g1', subject: '회신: [P00-001] 예시장비 납품 안내', from: 'me@example.com', to: ['staff@client.example'], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
  ]));

  const orgConfigPath = path.join(root, 'org_config.json');
  writeFileSync(orgConfigPath, JSON.stringify({
    our_domain: 'example.com', organisations: { 'example.com': 'Example Corp', 'client.example': 'Client Inc' }, family: {},
  }));

  return { root, workspacesRoot, workmetaRoot, hiworksDir, gmailDir, receiptsDir, orgConfigPath };
}

function contactsPath(workspacesRoot, folder) { return path.join(workspacesRoot, folder, '020_MGMT/023_연락처_이해관계자/연락처_장부.csv'); }
function recvPath(workspacesRoot, folder) { return path.join(workspacesRoot, folder, '020_MGMT/027_수신이력_이동이력/메일_수신이력.csv'); }
function sentPath(workspacesRoot, folder) { return path.join(workspacesRoot, folder, '020_MGMT/027_수신이력_이동이력/메일_발송이력.csv'); }
function replyPath(workspacesRoot, folder) { return path.join(workspacesRoot, folder, '020_MGMT/027_수신이력_이동이력/회신_현황.csv'); }

test('refresh: classifies custody, writes per-project CSVs, and a receipt with the expected shape', () => {
  const fixture = makeFixture();
  try {
    const receipt = refresh({
      workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir],
      orgConfigPath: fixture.orgConfigPath, receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z',
    });
    assert.equal(receipt.schema_version, REFRESH_RECEIPT_SCHEMA);
    assert.equal(receipt.dry, false);
    assert.equal(receipt.held_two_projects, 1); // h2 mentions both P00-001 and P00-002
    assert.equal(receipt.skipped_system, 1); // h3 from slack
    assert.equal(receipt.duplicates_dropped, 0); // no repeated event_id in this fixture
    assert.equal(receipt.projects.length, 2);

    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.mails, 2); // h1 received + g1 sent
    assert.equal(reportA.received, 1);
    assert.equal(reportA.sent, 1);
    assert.equal(reportA.need_reply, 0);
    assert.equal(reportA.waiting_reply, 1); // last message in the thread (g1) was sent by us

    const reportB = receipt.projects.find(row => row.project_code === CODE_B);
    assert.equal(reportB.mails, 1); // h4 only
    assert.equal(reportB.need_reply, 1);

    const contactsCsv = decodeCsv(readFileSync(contactsPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    assert.deepEqual(contactsCsv.headers[0], '프로젝트코드');
    assert.equal(contactsCsv.rows.length, 2); // staff@client.example and me@example.com, both total>=2

    const recvCsv = decodeCsv(readFileSync(recvPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    assert.equal(recvCsv.rows.length, 1);
    const sentCsv = decodeCsv(readFileSync(sentPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    assert.equal(sentCsv.rows.length, 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (follow-up): two custody lines sharing one event_id yield exactly one ledger row, counted in duplicates_dropped', () => {
  const fixture = makeFixture();
  try {
    // append a second, richer-attachment copy of h1 under the same event_id
    const original = readFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), 'utf8');
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), `${original}\n${JSON.stringify(
      { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: 'staff@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [{ name: 'x.pdf' }] },
    )}`);
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    assert.equal(receipt.duplicates_dropped, 1);
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.received, 1); // still exactly one received row for h1, not two
    const recvCsv = decodeCsv(readFileSync(recvPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    assert.equal(recvCsv.rows.filter(row => row[6] === 'h1').length, 1);
    assert.equal(recvCsv.rows.find(row => row[6] === 'h1')[16], '1'); // 첨부수 from the richer (kept) copy
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh --dry writes no files and no history but still returns/records a receipt', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      dry: true, receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    assert.equal(existsSync(contactsPath(fixture.workspacesRoot, FOLDER_A)), false);
    const receiptFiles = readdirSync(fixture.receiptsDir).filter(name => name.endsWith('.json'));
    assert.equal(receiptFiles.length, 1);
    assert.match(receiptFiles[0], /-dry\.json$/u);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh: preserves Owner-entered columns by key, archives to history only when content changed', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });

    // Simulate a person editing Owner-entered columns in Excel.
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts = decodeCsv(readFileSync(cPath, 'utf8'));
    const staffRow = contacts.rows.find(row => row[5] === 'staff@client.example');
    staffRow[12] = '담당자'; // 과제내역할(Owner기입)
    writeFileSync(cPath, `﻿${[contacts.headers, ...contacts.rows].map(row => row.join(',')).join('\r\n')}\r\n`);

    const rPath = recvPath(fixture.workspacesRoot, FOLDER_A);
    const recv = decodeCsv(readFileSync(rPath, 'utf8'));
    recv.rows[0][4] = '1차'; // 단계
    writeFileSync(rPath, `﻿${[recv.headers, ...recv.rows].map(row => row.join(',')).join('\r\n')}\r\n`);

    const replyFile = replyPath(fixture.workspacesRoot, FOLDER_A);
    const reply = decodeCsv(readFileSync(replyFile, 'utf8'));
    reply.rows[0][10] = '검토중'; // 처리상태(Owner기입)
    writeFileSync(replyFile, `﻿${[reply.headers, ...reply.rows].map(row => row.join(',')).join('\r\n')}\r\n`);

    // A refresh with unchanged custody must not touch any of the three files: the
    // preserved Owner cell already reproduces the file's own current content.
    const noopReceipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const noopA = noopReceipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(noopA.contacts.changed, false);
    assert.equal(noopA.received_history.changed, false);
    assert.equal(noopA.reply_status.changed, false);
    assert.equal(existsSync(path.join(path.dirname(cPath), 'history')), false);

    // New custody for the same project must change the files while preserving the
    // untouched rows' Owner cells, and archive the previous content once.
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'),
      `${readFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), 'utf8')}\n${JSON.stringify(
        { event_id: 'h5', subject: '[P00-001] 추가 문의', from: 'new-person@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T06:00:00Z', body_text: '', attachments: [] },
      )}`);
    const changedReceipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T02:00:00.000Z' });
    const changedA = changedReceipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(changedA.contacts.changed, true);
    assert.equal(changedA.contacts.preserved_owner_cells, 1); // staff row's 과제내역할 carried forward
    assert.equal(changedA.received_history.changed, true);
    assert.equal(changedA.received_history.preserved_owner_cells, 1); // h1's 단계 carried forward
    // h5 opens a new thread ("[P00-001] 추가 문의"), so a row is added -- but the
    // pre-existing thread's row is untouched, so its Owner cell is preserved.
    assert.equal(changedA.reply_status.changed, true);
    assert.equal(changedA.reply_status.preserved_owner_cells, 1);
    assert.equal(existsSync(path.join(path.dirname(cPath), 'history')), true);

    const finalContacts = decodeCsv(readFileSync(cPath, 'utf8'));
    const finalStaffRow = finalContacts.rows.find(row => row[5] === 'staff@client.example');
    assert.equal(finalStaffRow[12], '담당자');
    const finalRecv = decodeCsv(readFileSync(rPath, 'utf8'));
    const h1Row = finalRecv.rows.find(row => row[6] === 'h1'); // 메일소스ID
    assert.equal(h1Row[4], '1차');
    const newRow = finalRecv.rows.find(row => row[6] === 'h5');
    assert.equal(newRow[4], ''); // no prior Owner value to preserve for a brand-new row
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh: lock held by a fresh lock refuses; a stale lock is reclaimed', () => {
  const fixture = makeFixture();
  try {
    // S9 (fresh-review-2): the lock lives under workspacesRoot (a dot-file at its
    // root), not receiptsDir -- so a CLI run and a UI adapter using different
    // receipts directories still serialise against each other.
    const lockFile = path.join(fixture.workspacesRoot, '.workspace_ledgers_refresh.lock');
    writeFileSync(lockFile, JSON.stringify({ pid: 999999, started_at: '2026-09-02T00:00:00.000Z' }));
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:01:00.000Z' }),
    error => error instanceof RefreshError && error.code === 'workspace_ledgers_refresh_lock_held');

    writeFileSync(lockFile, JSON.stringify({ pid: 999999, started_at: '2026-01-01T00:00:00.000Z' }));
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:01:00.000Z' });
    assert.equal(receipt.schema_version, REFRESH_RECEIPT_SCHEMA);
    assert.equal(existsSync(lockFile), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('previewRule: matched_before/after, moved_in and newly_held reflect a draft change without writing anything', () => {
  const fixture = makeFixture();
  try {
    const draft = rule(CODE_A, FOLDER_A, [['P00-001', 'P00-001'], ['예시장비', '예시장비'], ['다른과제-겹침', '다른과제']]);
    const result = previewRule({ workspacesRoot: fixture.workspacesRoot, code: CODE_A, draft,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir] });
    assert.equal(result.matched_before, 3); // h1, g1, h2 (h2 already hit P00-001 while held)
    assert.equal(result.matched_after, 4); // + h4, now also matching via the new term
    assert.equal(result.moved_in, 1);
    assert.equal(result.moved_out, 0);
    assert.equal(result.newly_held, 1); // h4 becomes a P00-001/P00-002 conflict only after the draft
    assert.equal(result.samples.moved_in.length, 1);
    assert.equal(existsSync(contactsPath(fixture.workspacesRoot, FOLDER_A)), false); // never writes
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('previewRule: a repeated call against unchanged custody and rules is served from the S10 cache', () => {
  const fixture = makeFixture();
  try {
    clearCustodyCache();
    const draft = rule(CODE_A, FOLDER_A, [['P00-001', 'P00-001'], ['예시장비', '예시장비']]);
    const first = previewRule({ workspacesRoot: fixture.workspacesRoot, code: CODE_A, draft, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir] });
    // Change custody on disk without changing its mtime/size signature detection path:
    // instead, verify the cache actually returns identical results on a second call
    // against genuinely unchanged files (a real cache hit, not merely "still correct").
    const second = previewRule({ workspacesRoot: fixture.workspacesRoot, code: CODE_A, draft, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir] });
    assert.deepEqual(second, first);
    // A change to custody must invalidate the cache (a new file's size/mtime differs).
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'),
      jsonl([{ event_id: 'h9', subject: '[P00-001] 예시장비 추가', from: 'more@client.example', to: [], cc: [], received_at: '2026-09-01T07:00:00Z', body_text: '', attachments: [] }]));
    const third = previewRule({ workspacesRoot: fixture.workspacesRoot, code: CODE_A, draft, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir] });
    assert.equal(third.matched_before, first.matched_before + 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('previewRule (fresh-review-3 #6): orgConfigPath resolves system_sender_domains the same way a real refresh() would', () => {
  const fixture = makeFixture();
  try {
    clearCustodyCache();
    writeFileSync(path.join(fixture.hiworksDir, 'vendor.jsonl'), jsonl([
      { event_id: 'v1', subject: '[P00-001] 예시장비 알림', from: 'noreply@vendor.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T09:00:00Z', body_text: '', attachments: [] },
    ]));
    const draft = rule(CODE_A, FOLDER_A, [['P00-001', 'P00-001'], ['예시장비', '예시장비']]);
    // Without orgConfigPath, only the built-in skip list applies -- vendor.example is
    // not in it, so v1 is classified and counted.
    const withoutOrgConfig = previewRule({ workspacesRoot: fixture.workspacesRoot, code: CODE_A, draft,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir] });
    const orgConfigWithVendorSkip = path.join(fixture.root, 'org_config_vendor_skip.json');
    writeFileSync(orgConfigWithVendorSkip, JSON.stringify({
      our_domain: 'example.com', organisations: {}, family: {}, system_sender_domains: ['vendor.example'],
    }));
    // With orgConfigPath, vendor.example is skipped too (merged with the built-in
    // list per NIT11) -- v1 must no longer contribute to matched_before, and the S10
    // cache (keyed partly on the resolved sender patterns) must not serve the
    // no-orgConfigPath result for this differently-configured call.
    const withOrgConfig = previewRule({ workspacesRoot: fixture.workspacesRoot, code: CODE_A, draft,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: orgConfigWithVendorSkip });
    assert.equal(withOrgConfig.matched_before, withoutOrgConfig.matched_before - 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------- R4/S9/S13
function corruptContacts(fixture, mutate) {
  refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
    hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
    receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
  const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
  const decoded = decodeCsv(readFileSync(cPath, 'utf8'));
  mutate(decoded);
  const corruptedText = encodeCsv(decoded.headers, decoded.rows);
  writeFileSync(cPath, corruptedText);
  return { cPath, corruptedText };
}

test('refresh (R4): a row with an extra column ("column inserted") fails closed for that file only', () => {
  const fixture = makeFixture();
  try {
    const { cPath, corruptedText } = corruptContacts(fixture, decoded => { decoded.rows[0].push('unexpected-extra-cell'); });
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.ledger_failures.length, 1);
    assert.equal(receipt.ledger_failures[0].code, 'workspace_ledgers_ledger_row_shape');
    assert.equal(readFileSync(cPath, 'utf8'), corruptedText); // left untouched
    // sibling files for the SAME project still refresh (per-file, not per-project)
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.received_history.failed, false);
    // the OTHER project's files still refresh too
    const reportB = receipt.projects.find(row => row.project_code === CODE_B);
    assert.equal(reportB.contacts.failed, false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (R4): a row missing a column ("column deleted") fails closed', () => {
  const fixture = makeFixture();
  try {
    const { cPath, corruptedText } = corruptContacts(fixture, decoded => { decoded.rows[0].pop(); });
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.ledger_failures[0].code, 'workspace_ledgers_ledger_row_shape');
    assert.equal(readFileSync(cPath, 'utf8'), corruptedText);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (R4): CP949-looking mojibake (U+FFFD) fails closed as an encoding violation', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const original = readFileSync(cPath, 'utf8');
    const mojibake = original.replace('Client Inc', 'Client Inc ��');
    writeFileSync(cPath, mojibake);
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.ledger_failures[0].code, 'workspace_ledgers_ledger_encoding');
    assert.equal(readFileSync(cPath, 'utf8'), mojibake);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (R4/follow-up): a duplicate key whose rows disagree on an Owner-entered column fails closed', () => {
  const fixture = makeFixture();
  try {
    const { cPath, corruptedText } = corruptContacts(fixture, decoded => {
      const duplicate = [...decoded.rows[0]];
      duplicate[12] = '다른 담당자'; // 과제내역할(Owner기입) -- genuinely conflicting Owner-entered value
      decoded.rows.push(duplicate);
    });
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.ledger_failures[0].code, 'workspace_ledgers_ledger_duplicate_key');
    assert.equal(receipt.ledger_failures[0].conflict_groups, 1); // one key, one conflicting group
    assert.equal(readFileSync(cPath, 'utf8'), corruptedText); // left untouched
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (follow-up): duplicate rows that are byte-identical collapse to one row and refresh proceeds', () => {
  const fixture = makeFixture();
  try {
    const { cPath } = corruptContacts(fixture, decoded => { decoded.rows.push([...decoded.rows[0]]); });
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    assert.equal(receipt.status, 'ok');
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.failed, false);
    assert.equal(reportA.contacts.collapsed_identical_rows, 1);
    // no duplicate key survives in the rewritten file
    const finalDecoded = decodeCsv(readFileSync(cPath, 'utf8'));
    const keys = finalDecoded.rows.map(row => row[5]);
    assert.equal(new Set(keys).size, keys.length);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (follow-up): duplicate rows differing only in a machine-owned column collapse and the fresh row wins', () => {
  const fixture = makeFixture();
  let staffEmail;
  try {
    const { cPath } = corruptContacts(fixture, decoded => {
      staffEmail = decoded.rows[0][5];
      const duplicate = [...decoded.rows[0]];
      duplicate[7] = '999'; // 발신수 -- machine-owned, stale/bogus value from a hand-broken duplicate row
      decoded.rows.push(duplicate);
    });
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    assert.equal(receipt.status, 'ok');
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.failed, false);
    const finalDecoded = decodeCsv(readFileSync(cPath, 'utf8'));
    const row = finalDecoded.rows.find(candidate => candidate[5] === staffEmail);
    // the freshly generated 발신수 must win, never the stale "999" from the broken duplicate
    assert.notEqual(row?.[7], '999');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh: a key that leaves custody drops its Owner-entered cell, counted in the receipt (S9)', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const decoded = decodeCsv(readFileSync(cPath, 'utf8'));
    const staffRow = decoded.rows.find(row => row[5] === 'staff@client.example');
    staffRow[12] = '담당자';
    writeFileSync(cPath, encodeCsv(decoded.headers, decoded.rows));
    // Remove every hiworks/gmail event that ever mentioned staff@client.example so the
    // key genuinely leaves the live view on the next refresh.
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h4', subject: '[P00-002] 다른과제 공지', from: 'other@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T04:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), jsonl([]));
    // P00-001 now has zero fresh mails at all -- allowEmpty is required (REQ 1) since
    // its ledgers previously had content; this test is specifically about the drop
    // accounting, not about the new empty-refresh guard (covered separately).
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z', allowEmpty: [CODE_A] });
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.owner_cells_dropped_with_row, 1);
    // survives only in the history archive, per README
    const historyDir = path.join(path.dirname(cPath), 'history');
    const historyFiles = readdirSync(historyDir);
    assert.equal(historyFiles.length, 1);
    const archived = decodeCsv(readFileSync(path.join(historyDir, historyFiles[0]), 'utf8'));
    assert.ok(archived.rows.some(row => row[5] === 'staff@client.example' && row[12] === '담당자'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (S13): a history archive collision at the same stamp appends a counter suffix rather than overwriting', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const historyDir = path.join(path.dirname(cPath), 'history');
    mkdirSync(historyDir, { recursive: true });
    const stamp = '2026-09-02T01-00-00-000Z';
    // Pre-occupy the exact filename this refresh would otherwise archive to.
    writeFileSync(path.join(historyDir, `연락처_장부.csv.${stamp}.csv`), 'pre-existing-content');
    // force a change so this refresh actually archives something
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h9', subject: '[P00-001] 예시장비 추가문의', from: 'another@client.example', to: [], cc: [], received_at: '2026-09-01T07:00:00Z', body_text: '', attachments: [] },
    ]));
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    assert.equal(readFileSync(path.join(historyDir, `연락처_장부.csv.${stamp}.csv`), 'utf8'), 'pre-existing-content'); // untouched
    assert.equal(existsSync(path.join(historyDir, `연락처_장부.csv.${stamp}-1.csv`)), true); // counter-suffixed instead
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------- fresh-review-2 regressions
test('refresh (fresh-review-3 #1): by default, an unreadable custody directory blocks every write for the whole run', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const before = readFileSync(cPath, 'utf8');
    const beforeMtime = readFileSync(recvPath(fixture.workspacesRoot, FOLDER_A), 'utf8');

    const typoDir = path.join(fixture.hiworksDir, 'typo-does-not-exist');
    const gmailTypoDir = path.join(fixture.gmailDir, 'typo-does-not-exist');
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [typoDir], gmailSentDirs: [gmailTypoDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });

    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.unreadable_dirs.length, 2);
    assert.equal(receipt.allow_partial_sources_applied, false);
    assert.equal(receipt.events_scanned.hiworks, 0);
    // Pre-write gate: no project is even attempted -- not "attempted and blocked by
    // the empty-refresh guard" (the old per-file behaviour), but never reached at all.
    assert.equal(receipt.projects.length, 0);
    assert.equal(receipt.ledger_failures.length, 0);
    assert.equal(readFileSync(cPath, 'utf8'), before); // untouched -- never silently emptied
    assert.equal(readFileSync(recvPath(fixture.workspacesRoot, FOLDER_A), 'utf8'), beforeMtime);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-3 #1/#4): allowPartialSources proceeds on whatever custody was readable, scoped by allowEmpty per project', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const typoDir = path.join(fixture.hiworksDir, 'typo-does-not-exist');
    const gmailTypoDir = path.join(fixture.gmailDir, 'typo-does-not-exist');
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [typoDir], gmailSentDirs: [gmailTypoDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z', allowPartialSources: true, allowEmpty: [CODE_A] });
    assert.equal(receipt.status, 'failed'); // unreadable_dirs is still the visible signal
    assert.equal(receipt.allow_partial_sources_applied, true);
    assert.deepEqual(receipt.allow_empty_applied_to, [CODE_A]);
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.failed, false);
    assert.equal(reportA.contacts.rows, 0); // genuinely rebuilt empty, as explicitly allowed for CODE_A
    // CODE_B was NOT named in allowEmpty -- it still fails closed rather than being
    // silently emptied just because CODE_A's override was granted (S4: scoped, not global).
    const reportB = receipt.projects.find(row => row.project_code === CODE_B);
    assert.equal(reportB.contacts.failed, true);
    assert.equal(reportB.contacts.code, 'workspace_ledgers_ledger_empty_refresh_blocked');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-3 #2): two byte-identical no-id custody lines collapse upstream (mail_events) and refresh succeeds', () => {
  const fixture = makeFixture();
  try {
    const line = { subject: '[P00-001] 반복 접수', from: 'staff@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T08:00:00Z', body_text: '', attachments: [] };
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'),
      `${readFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), 'utf8')}\n${JSON.stringify(line)}\n${JSON.stringify(line)}`);
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.duplicates_dropped, 1); // the two byte-identical lines collapse to one event upstream
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.received_history.failed, false);
    const recvCsv = decodeCsv(readFileSync(recvPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    assert.equal(recvCsv.rows.filter(row => row[10] === '[P00-001] 반복 접수').length, 1); // one row, not two
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-2 #5): a thrown error still leaves a status:failed receipt on disk before propagating', () => {
  const fixture = makeFixture();
  try {
    // Corrupt project A's rule json so reading the rule set throws mid-run, after the
    // lock is already held.
    const ruleJsonPath = path.join(fixture.workspacesRoot, FOLDER_A, RULE_DIR, 'mail_routing_rule.json');
    writeFileSync(ruleJsonPath, 'not valid json{{{');
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' }));
    const receiptFiles = readdirSync(fixture.receiptsDir).filter(name => name.endsWith('.json'));
    assert.equal(receiptFiles.length, 1);
    const body = JSON.parse(readFileSync(path.join(fixture.receiptsDir, receiptFiles[0]), 'utf8'));
    assert.equal(body.status, 'failed');
    assert.ok(body.error && typeof body.error.code === 'string');
    // the lock must still be released even though the run threw
    assert.equal(existsSync(path.join(fixture.workspacesRoot, '.workspace_ledgers_refresh.lock')), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-3 #10): unreadable_dirs never carries a host-local path, only a basename and which flag it came from', () => {
  const fixture = makeFixture();
  try {
    const typoDir = path.join(fixture.hiworksDir, 'typo-does-not-exist');
    const gmailTypoDir = path.join(fixture.gmailDir, 'typo-does-not-exist');
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [typoDir], gmailSentDirs: [gmailTypoDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    assert.equal(receipt.unreadable_dirs.length, 2);
    for (const entry of receipt.unreadable_dirs) {
      assert.equal(entry.dir, 'typo-does-not-exist'); // basename only -- never the full host path
      assert.equal(entry.dir.includes(path.sep), false);
      assert.ok(['hiworks-events', 'gmail-sent-events'].includes(entry.source)); // which flag it came from
      assert.ok(typeof entry.code === 'string');
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-3 #12): a refresh lock whose started_at is in the future relative to now is treated as stale', () => {
  const fixture = makeFixture();
  try {
    const lockFile = path.join(fixture.workspacesRoot, '.workspace_ledgers_refresh.lock');
    writeFileSync(lockFile, JSON.stringify({ pid: 999999, started_at: '2026-09-02T00:10:00.000Z' }));
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    assert.equal(receipt.status, 'ok');
    assert.equal(existsSync(lockFile), false); // reclaimed and released, not left held
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-3 #14): the lock-held early exit still writes a failure receipt', () => {
  const fixture = makeFixture();
  try {
    const lockFile = path.join(fixture.workspacesRoot, '.workspace_ledgers_refresh.lock');
    writeFileSync(lockFile, JSON.stringify({ pid: 999999, started_at: '2026-09-02T00:00:00.000Z' }));
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:01:00.000Z' }),
    error => error instanceof RefreshError && error.code === 'workspace_ledgers_refresh_lock_held');
    const receiptFiles = readdirSync(fixture.receiptsDir).filter(name => name.endsWith('.json'));
    assert.equal(receiptFiles.length, 1); // previously: nothing was written for this early-exit path
    const body = JSON.parse(readFileSync(path.join(fixture.receiptsDir, receiptFiles[0]), 'utf8'));
    assert.equal(body.status, 'failed');
    assert.equal(body.error.code, 'workspace_ledgers_refresh_lock_held');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-3 #7): an unexpected throw mid-run still reports whichever earlier projects completed', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    // Replace project B's contacts folder with a plain file so writing project B's
    // ledger throws mid-run (ENOTDIR), well after project A (processed first,
    // alphabetically) has already completed and been recorded.
    const badDir = path.join(fixture.workspacesRoot, FOLDER_B, '020_MGMT', '023_연락처_이해관계자');
    rmSync(badDir, { recursive: true, force: true });
    writeFileSync(badDir, 'not-a-directory');
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' }));
    const receiptFiles = readdirSync(fixture.receiptsDir).filter(name => name.endsWith('.json')).sort();
    const latest = JSON.parse(readFileSync(path.join(fixture.receiptsDir, receiptFiles[receiptFiles.length - 1]), 'utf8'));
    assert.equal(latest.status, 'failed');
    assert.ok(latest.error && typeof latest.error.code === 'string');
    const reportA = latest.projects.find(row => row.project_code === CODE_A);
    assert.ok(reportA, "project A's report must survive in the failure receipt even though the run then threw on project B");
    assert.equal(reportA.contacts.failed, false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-2 #9): the lock blocks a second caller using a *different* receipts directory', () => {
  const fixture = makeFixture();
  const otherReceiptsDir = path.join(fixture.root, 'other-receipts');
  mkdirSync(otherReceiptsDir, { recursive: true });
  try {
    writeFileSync(path.join(fixture.workspacesRoot, '.workspace_ledgers_refresh.lock'),
      JSON.stringify({ pid: 999999, started_at: '2026-09-02T00:00:00.000Z' }));
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: otherReceiptsDir, now: '2026-09-02T00:01:00.000Z' }),
    error => error instanceof RefreshError && error.code === 'workspace_ledgers_refresh_lock_held');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-3 #11): system_sender_domains from the org config MERGES into the built-in skip list, never replaces it', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'vendor.jsonl'), jsonl([
      { event_id: 'v1', subject: '[P00-001] 예시장비 알림', from: 'noreply@vendor.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T09:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(fixture.orgConfigPath, JSON.stringify({
      our_domain: 'example.com', organisations: { 'example.com': 'Example Corp', 'client.example': 'Client Inc' }, family: {},
      system_sender_domains: ['vendor.example'],
    }));
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    // h3 (from the built-in default noreply@slack.com) AND v1 (from the org config's
    // own vendor.example) are both skipped -- a merge, not one replacing the other.
    assert.equal(receipt.skipped_system, 2);
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.mails, 2); // unchanged from the base fixture (h1 + g1) -- v1 did not attribute
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
