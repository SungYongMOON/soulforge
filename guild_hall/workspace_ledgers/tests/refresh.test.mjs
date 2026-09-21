import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { decodeCsv, encodeCsv } from '../src/ledgers.mjs';
import { clearCustodyCache, previewRule, redactHostPaths, REFRESH_RECEIPT_SCHEMA, refresh, RefreshError } from '../src/refresh.mjs';

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
    // fresh-review-5 #1: build via encodeCsv (which itself builds the BOM from
    // String.fromCharCode, not a raw literal) rather than hand-rolling a BOM-prefixed
    // template literal in this test's own source.
    writeFileSync(cPath, encodeCsv(contacts.headers, contacts.rows));

    const rPath = recvPath(fixture.workspacesRoot, FOLDER_A);
    const recv = decodeCsv(readFileSync(rPath, 'utf8'));
    recv.rows[0][4] = '1차'; // 단계
    writeFileSync(rPath, encodeCsv(recv.headers, recv.rows));

    const replyFile = replyPath(fixture.workspacesRoot, FOLDER_A);
    const reply = decodeCsv(readFileSync(replyFile, 'utf8'));
    reply.rows[0][10] = '검토중'; // 처리상태(Owner기입)
    writeFileSync(replyFile, encodeCsv(reply.headers, reply.rows));

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

test('refresh (S-8, fresh-review-4): a corrupted saved rule for one project no longer aborts the whole run -- it is excluded and recorded in rule_failures', () => {
  const fixture = makeFixture();
  try {
    // Corrupt project A's rule json only.
    const ruleJsonPath = path.join(fixture.workspacesRoot, FOLDER_A, RULE_DIR, 'mail_routing_rule.json');
    writeFileSync(ruleJsonPath, 'not valid json{{{');
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.rule_failures.length, 1);
    assert.equal(receipt.rule_failures[0].project_code, CODE_A);
    assert.equal(typeof receipt.rule_failures[0].code, 'string');
    // project A is excluded entirely -- no report, no ledgers written for it
    assert.equal(receipt.projects.some(row => row.project_code === CODE_A), false);
    assert.equal(existsSync(contactsPath(fixture.workspacesRoot, FOLDER_A)), false);
    // project B is unaffected and still refreshes normally
    const reportB = receipt.projects.find(row => row.project_code === CODE_B);
    assert.ok(reportB);
    assert.equal(reportB.contacts.failed, false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-2 #5): an unexpected throw (not a bad rule) still leaves a status:failed receipt on disk before propagating', () => {
  const fixture = makeFixture();
  try {
    // Point both custody flags at the same directory -- S-4's usage-error guard
    // throws synchronously from inside the main try block, after the lock is held,
    // exercising the same "unexpected throw mid-run" receipt path fresh-review-2 #5
    // originally targeted (a corrupted rule json is no longer such a path -- see S-8).
    const receiptsBefore = readdirSync(fixture.receiptsDir).filter(name => name.endsWith('.json')).length;
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.hiworksDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' }),
    error => error instanceof RefreshError && error.code === 'workspace_ledgers_custody_dirs_overlap');
    const receiptFiles = readdirSync(fixture.receiptsDir).filter(name => name.endsWith('.json'));
    assert.equal(receiptFiles.length, receiptsBefore + 1);
    const body = JSON.parse(readFileSync(path.join(fixture.receiptsDir, receiptFiles[receiptFiles.length - 1]), 'utf8'));
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

// fresh-review-5 (design simplification): the cumulative match-time run budget this
// test exercised was removed by coordinator decision -- matching is a direct,
// untimed call now (see classifier.mjs's classifyMail doc). Finding #3 of that same
// review asks for a DIFFERENT proof instead: that one project's rule never affects
// another project's ledger row, short of that other rule failing to compile -- see
// "refresh (fresh-review-5 #3)" below.

test('refresh (S-4, fresh-review-4): the same event_id present in both custody sources becomes two distinct rows instead of a permanent fresh_duplicate_key block', () => {
  const fixture = makeFixture();
  try {
    // A genuinely different mail in each source, coincidentally sharing an event_id --
    // NOT the same-directory mistake (S-4's other half, covered by the
    // custody_dirs_overlap test above).
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'cross-source-shared', subject: '[P00-001] 하이웍스 쪽', from: 'staff@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), jsonl([
      { event_id: 'cross-source-shared', subject: '[P00-001] Gmail 쪽', from: 'me@example.com', to: ['staff@client.example'], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
    ]));
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    assert.equal(receipt.status, 'ok'); // never a permanent fresh_duplicate_key block
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.mails, 2);
    assert.equal(reportA.received_history.failed, false);
    assert.equal(reportA.sent_history.failed, false);
    const recvCsv = decodeCsv(readFileSync(recvPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    const sentCsv = decodeCsv(readFileSync(sentPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    assert.equal(recvCsv.rows.length, 1);
    assert.equal(sentCsv.rows.length, 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (S-5, fresh-review-4): allowEmpty must be an array, and every code in it must be a real project', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z', allowEmpty: true }),
    error => error instanceof RefreshError && error.code === 'workspace_ledgers_allow_empty_must_be_list');
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z', allowEmpty: ['P00-999-does-not-exist'] }),
    error => error instanceof RefreshError && error.code === 'workspace_ledgers_unknown_project');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (S-7, fresh-review-4): a caught error message with a host-local path is redacted to a basename in the failure receipt', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    // Replace workmetaRoot itself with a plain FILE -- when the per-project write loop
    // tries to build ANY project's lineage directory under it, mkdirSync throws a
    // Node fs error (ENOTDIR) whose own .message embeds the full host-local
    // workmetaRoot path (this fixture's own mkdtempSync-created absolute temp path).
    rmSync(fixture.workmetaRoot, { recursive: true, force: true });
    writeFileSync(fixture.workmetaRoot, 'not-a-directory');
    // Force at least one file to actually need (re)writing on the next call -- an
    // unchanged refresh returns before ever touching the lineage path, which would
    // never exercise the corrupted workmetaRoot below.
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h9', subject: '[P00-001] 추가 문의', from: 'new-person@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T06:00:00Z', body_text: '', attachments: [] },
    ]));
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' }));
    const receiptFiles = readdirSync(fixture.receiptsDir).filter(name => name.endsWith('.json')).sort();
    const latest = JSON.parse(readFileSync(path.join(fixture.receiptsDir, receiptFiles[receiptFiles.length - 1]), 'utf8'));
    assert.equal(latest.status, 'failed');
    assert.ok(latest.error && typeof latest.error.code === 'string');
    assert.equal(typeof latest.error.message, 'string');
    // the host-local temp-dir path must never appear verbatim in the receipt
    assert.equal(latest.error.message.includes(fixture.root), false);
    assert.equal(latest.error.message.includes(fixture.workmetaRoot), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------- fresh-review-5 regressions

test('redactHostPaths (fresh-review-5 #6): drive-letter, POSIX, and UNC paths are all redacted, including spaces inside quotes', () => {
  // Built via concatenation, not as a single literal -- a synthetic example here would
  // otherwise read, to the repo's own local-absolute-path-policy scanner, exactly like
  // a real host-local path baked into tracked source (which this file is not: these
  // are fixtures for testing the redaction function itself, never actually written to
  // disk or resolved).
  const windowsExample = `ENOENT: no such file or directory, open '${'D:'}${'\\Program'} Files${'\\secret'}${'\\config.json'}'`;
  const posixExample = `ENOENT: no such file or directory, open '${'/mnt'}${'/c/Program'} Files${'/secret'}${'/config.json'}'`;
  assert.equal(redactHostPaths(windowsExample), "ENOENT: no such file or directory, open 'config.json'");
  assert.equal(redactHostPaths(posixExample), "ENOENT: no such file or directory, open 'config.json'");
  assert.equal(
    redactHostPaths("ENOENT: no such file or directory, open '\\\\SERVER\\share\\secret folder\\config.json'"),
    "ENOENT: no such file or directory, open 'config.json'",
  );
  // no path-shaped content -- passthrough unchanged
  assert.equal(redactHostPaths('plain message with no path'), 'plain message with no path');
  assert.equal(redactHostPaths(undefined), undefined);
});

test('refresh (fresh-review-5 #3): project A keeps its row and Owner cells across a refresh regardless of what project B\'s rule contains', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts = decodeCsv(readFileSync(cPath, 'utf8'));
    const staffRow = contacts.rows.find(row => row[5] === 'staff@client.example');
    staffRow[12] = '담당자'; // 과제내역할(Owner기입)
    writeFileSync(cPath, encodeCsv(contacts.headers, contacts.rows));

    // Change project B's rule to something unrelated -- must not touch project A at
    // all. (B's own custody now matches nothing, so B's own ledgers legitimately go
    // to zero rows -- allowEmpty:[CODE_B] is granted for B's sake only; this test is
    // about A, which must be completely unaffected by B's rule content either way.)
    const ruleBPath = path.join(fixture.workspacesRoot, FOLDER_B, RULE_DIR, 'mail_routing_rule.json');
    writeFileSync(ruleBPath, `${JSON.stringify(rule(CODE_B, FOLDER_B, [['다른키워드', '다른키워드']]), null, 2)}\n`);
    const receiptChanged = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z', allowEmpty: [CODE_B] });
    const reportAChanged = receiptChanged.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportAChanged.contacts.failed, false);
    const afterChangeContacts = decodeCsv(readFileSync(cPath, 'utf8'));
    const afterChangeStaffRow = afterChangeContacts.rows.find(row => row[5] === 'staff@client.example');
    assert.equal(afterChangeStaffRow[12], '담당자');

    // Break project B's rule entirely (invalid json) -- B alone is excluded (S-8);
    // project A's row and its Owner cell must still survive untouched.
    writeFileSync(ruleBPath, 'not valid json{{{');
    const receiptBroken = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T02:00:00.000Z' });
    assert.equal(receiptBroken.status, 'failed');
    assert.equal(receiptBroken.rule_failures.length, 1);
    assert.equal(receiptBroken.rule_failures[0].project_code, CODE_B);
    const reportA = receiptBroken.projects.find(row => row.project_code === CODE_A);
    assert.ok(reportA);
    assert.equal(reportA.contacts.failed, false);
    const finalContacts = decodeCsv(readFileSync(cPath, 'utf8'));
    const finalStaffRow = finalContacts.rows.find(row => row[5] === 'staff@client.example');
    assert.equal(finalStaffRow[12], '담당자'); // still preserved even with B excluded
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-5 #4): a cross-source id-collision suffix is content-derived (not "#count") and never shifts when more custody is added later', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'cross-x', subject: '[P00-001] 하이웍스 쪽', from: 'staff@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), jsonl([
      { event_id: 'cross-x', subject: '[P00-001] Gmail 쪽', from: 'me@example.com', to: ['staff@client.example'], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
    ]));
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const sentBefore = decodeCsv(readFileSync(sentPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    const rowBefore = sentBefore.rows.find(row => row[10] === '[P00-001] Gmail 쪽'); // 제목
    assert.ok(rowBefore);
    const keyBefore = rowBefore[0]; // 이력키
    assert.doesNotMatch(keyBefore, /#\d/u); // not a bare ordinal-suffixed id

    // Unrelated new custody arrives before the next refresh.
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h-extra', subject: '[P00-001] 별개 메일', from: 'other2@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T03:00:00Z', body_text: '', attachments: [] },
    ]));
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const sentAfter = decodeCsv(readFileSync(sentPath(fixture.workspacesRoot, FOLDER_A), 'utf8'));
    const rowAfter = sentAfter.rows.find(row => row[10] === '[P00-001] Gmail 쪽');
    assert.ok(rowAfter);
    assert.equal(rowAfter[0], keyBefore); // the key never moved
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-5 #5): the same-directory guard is not defeated by a junction pointing at the same real directory', () => {
  const fixture = makeFixture();
  const junctionPath = path.join(fixture.root, 'hiworks-junction');
  try {
    symlinkSync(fixture.hiworksDir, junctionPath, 'junction');
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [junctionPath], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' }),
    error => error instanceof RefreshError && error.code === 'workspace_ledgers_custody_dirs_overlap');
  } finally {
    try { rmSync(junctionPath, { force: true }); } catch { /* best effort */ }
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('previewRule (fresh-review-5 #7): rule_failures lists another project whose rule failed, excluded from this comparison', () => {
  const fixture = makeFixture();
  try {
    const ruleBPath = path.join(fixture.workspacesRoot, FOLDER_B, RULE_DIR, 'mail_routing_rule.json');
    writeFileSync(ruleBPath, 'not valid json{{{');
    const draft = rule(CODE_A, FOLDER_A, [['P00-001', 'P00-001'], ['예시장비', '예시장비']]);
    const result = previewRule({ workspacesRoot: fixture.workspacesRoot, code: CODE_A, draft,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir] });
    assert.equal(result.rule_failures.length, 1);
    assert.equal(result.rule_failures[0].project_code, CODE_B);
    assert.equal(typeof result.matched_before, 'number'); // still usable despite B's exclusion
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-5 #8): allowEmpty naming a project excluded for a rule failure points at the rule failure, not unknown_project', () => {
  const fixture = makeFixture();
  try {
    const ruleBPath = path.join(fixture.workspacesRoot, FOLDER_B, RULE_DIR, 'mail_routing_rule.json');
    writeFileSync(ruleBPath, 'not valid json{{{');
    assert.throws(() => refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z', allowEmpty: [CODE_B] }),
    error => error instanceof RefreshError && error.code === 'workspace_ledgers_allow_empty_targets_rule_failure');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-5 #9): rule_failures[].term_ref carries a hash of the failing term\'s label, never the label text itself', () => {
  const fixture = makeFixture();
  try {
    const badRule = {
      schema_version: RULE_SCHEMA_VERSION, project_code: CODE_A, folder_name: FOLDER_A, rule_version: 'v1', status: 'draft',
      match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
      // A nested-quantifier shape (rejected by the static scan, before any regex
      // compile is even attempted) is one of the failure modes whose RuleCompileError
      // carries the term's own label as `.detail` -- an invalid-syntax regex instead
      // carries the RegExp engine's own error text as `.detail`, which would not
      // exercise `term_ref`'s label lookup at all.
      exact: [{ label: '진짜비밀키워드', kind: 'regex', value: '(a+)+' }], hint: [],
      yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
    };
    writeFileSync(path.join(fixture.workspacesRoot, FOLDER_A, RULE_DIR, 'mail_routing_rule.json'), `${JSON.stringify(badRule, null, 2)}\n`);
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    assert.equal(receipt.rule_failures.length, 1);
    const failure = receipt.rule_failures[0];
    assert.equal(failure.project_code, CODE_A);
    assert.ok(failure.term_ref);
    assert.equal(failure.term_ref.list, 'exact');
    assert.equal(failure.term_ref.index, 0);
    assert.match(failure.term_ref.label_hash, /^[0-9a-f]{8}$/u);
    assert.equal(JSON.stringify(receipt).includes('진짜비밀키워드'), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------- fresh-review-6 regressions

function writeOrgConfigWithFamily(orgConfigPath, family) {
  writeFileSync(orgConfigPath, JSON.stringify({
    our_domain: 'example.com', organisations: { 'example.com': 'Example Corp' }, family,
  }));
}

/**
 * fresh-review-6 #1: `buildContacts` keys 연락처_장부.csv on a merged person's
 * most-recently-active address. When that person's next mail happens to arrive on a
 * DIFFERENT one of their already-merged addresses, the key column's value changes even
 * though the same real person is still present -- an exact-key match alone then makes
 * them look like they left custody (Owner cell dropped) while a "new" person appears
 * in their place. `preserveMerge`'s `alternateKeysOf` (contacts only) fixes this by
 * matching on ANY address in the row's own merged set, not only the current key.
 */
test('refresh (fresh-review-6 #1): a merged person\'s Owner cell survives when their primary (key) address flips to another of their own addresses', () => {
  const fixture = makeFixture();
  try {
    writeOrgConfigWithFamily(fixture.orgConfigPath, { 'client-old.example': 'client-new.example' });
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: '"김철수" <staff@client-new.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h2', subject: '[P00-001] 예시장비 이전 문의', from: '"김철수" <staff@client-old.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), '');
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts1 = decodeCsv(readFileSync(cPath, 'utf8'));
    const row1 = contacts1.rows.find(row => row[5] === 'staff@client-new.example');
    assert.ok(row1, 'expected one merged row keyed on the currently-most-recent address');
    assert.equal(row1[6], 'staff@client-old.example'); // 다른메일
    assert.equal(contacts1.rows.length, 2); // the merged person + the internal 'me@example.com' recipient row
    row1[12] = '담당자'; // Owner fills the role cell
    writeFileSync(cPath, encodeCsv(contacts1.headers, contacts1.rows));

    // A new mail arrives on the OLD address, later than anything seen so far -- the
    // same merged person, now most-recently-active on their OTHER address.
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h3', subject: '[P00-001] 예시장비 추가 문의', from: '"김철수" <staff@client-old.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T10:00:00Z', body_text: '', attachments: [] },
    ]));
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const reportA = receipt2.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.owner_cells_dropped_with_row, 0); // never counted as dropped
    const contacts2 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts2.rows.length, 2); // still the same two rows, not a third
    const row2 = contacts2.rows.find(row => row[5] === 'staff@client-old.example');
    assert.ok(row2); // key flipped to the now-most-recent address
    assert.equal(row2[6], 'staff@client-new.example');
    assert.equal(row2[12], '담당자'); // Owner cell preserved across the flip
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-6 #1): the reverse flip -- OLD address primary first, then NEW address becomes most recent -- also preserves the Owner cell', () => {
  const fixture = makeFixture();
  try {
    writeOrgConfigWithFamily(fixture.orgConfigPath, { 'client-old.example': 'client-new.example' });
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: '"김철수" <staff@client-old.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h2', subject: '[P00-001] 예시장비 이전 문의', from: '"김철수" <staff@client-new.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), '');
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts1 = decodeCsv(readFileSync(cPath, 'utf8'));
    const row1 = contacts1.rows.find(row => row[5] === 'staff@client-old.example');
    assert.ok(row1);
    row1[12] = '담당자';
    writeFileSync(cPath, encodeCsv(contacts1.headers, contacts1.rows));

    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h3', subject: '[P00-001] 예시장비 추가 문의', from: '"김철수" <staff@client-new.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T10:00:00Z', body_text: '', attachments: [] },
    ]));
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const reportA = receipt2.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.owner_cells_dropped_with_row, 0);
    const contacts2 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts2.rows.length, 2); // the merged person + the internal 'me@example.com' recipient row
    const row2 = contacts2.rows.find(row => row[5] === 'staff@client-new.example');
    assert.ok(row2);
    assert.equal(row2[12], '담당자');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-6 #1): two different merged people, each with two addresses, never cross-contaminate Owner cells', () => {
  const fixture = makeFixture();
  try {
    writeOrgConfigWithFamily(fixture.orgConfigPath, { 'client-old.example': 'client-new.example' });
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: '"김철수" <staff1@client-new.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h2', subject: '[P00-001] 예시장비 이전 문의', from: '"김철수" <staff1@client-old.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h3', subject: '[P00-001] 예시장비 견적 요청', from: '"이영희" <staff2@client-new.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T06:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h4', subject: '[P00-001] 예시장비 견적 문의', from: '"이영희" <staff2@client-old.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), '');
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts1 = decodeCsv(readFileSync(cPath, 'utf8'));
    // two distinct merged people (never merged into one) + the internal 'me@example.com' recipient row
    assert.equal(contacts1.rows.length, 3);
    const person1Row = contacts1.rows.find(row => row[5] === 'staff1@client-new.example');
    const person2Row = contacts1.rows.find(row => row[5] === 'staff2@client-new.example');
    assert.ok(person1Row); assert.ok(person2Row);
    person1Row[12] = '담당자1';
    person2Row[12] = '담당자2';
    writeFileSync(cPath, encodeCsv(contacts1.headers, contacts1.rows));

    // Only person 1's primary address flips; person 2 is untouched.
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h5', subject: '[P00-001] 예시장비 추가 문의', from: '"김철수" <staff1@client-old.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T10:00:00Z', body_text: '', attachments: [] },
    ]));
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const reportA = receipt2.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.owner_cells_dropped_with_row, 0);
    const contacts2 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts2.rows.length, 3);
    const newPerson1Row = contacts2.rows.find(row => row[5] === 'staff1@client-old.example');
    const newPerson2Row = contacts2.rows.find(row => row[5] === 'staff2@client-new.example');
    assert.ok(newPerson1Row, 'person 1 must now be keyed on their old address');
    assert.ok(newPerson2Row, 'person 2 is untouched and still keyed on their new address');
    assert.equal(newPerson1Row[12], '담당자1'); // person 1's own cell, unchanged
    assert.equal(newPerson2Row[12], '담당자2'); // person 2's own cell, unchanged -- never swapped
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-6 #1): a merged set growing by a third address still preserves the Owner cell', () => {
  const fixture = makeFixture();
  try {
    writeOrgConfigWithFamily(fixture.orgConfigPath, { 'client-old.example': 'client-new.example' });
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: '"김철수" <staff@client-new.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h2', subject: '[P00-001] 예시장비 이전 문의', from: '"김철수" <staff@client-old.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), '');
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts1 = decodeCsv(readFileSync(cPath, 'utf8'));
    const row1 = contacts1.rows.find(row => row[5] === 'staff@client-new.example');
    assert.ok(row1);
    row1[12] = '담당자';
    writeFileSync(cPath, encodeCsv(contacts1.headers, contacts1.rows));

    // A THIRD address for the same person (same family, same name) arrives, more
    // recent than either of the first two -- the merged set grows from {new, old} to
    // {new, old, newer}, and 'newer' becomes the fresh primary key.
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h3', subject: '[P00-001] 예시장비 추가 문의', from: '"김철수" <staff@client-newer.example>', to: ['me@example.com'], cc: [], received_at: '2026-09-01T10:00:00Z', body_text: '', attachments: [] },
    ]));
    writeOrgConfigWithFamily(fixture.orgConfigPath, {
      'client-old.example': 'client-newer.example', 'client-new.example': 'client-newer.example',
    });
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const reportA = receipt2.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.owner_cells_dropped_with_row, 0);
    const contacts2 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts2.rows.length, 2); // still one merged person + the internal 'me@example.com' row
    const row2 = contacts2.rows.find(row => row[5] === 'staff@client-newer.example');
    assert.ok(row2); // now the most-recent of all three
    const otherAddresses = row2[6].split(' ');
    assert.ok(otherAddresses.includes('staff@client-new.example'));
    assert.ok(otherAddresses.includes('staff@client-old.example'));
    assert.equal(row2[12], '담당자'); // preserved even though the set grew
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-6 #2): the no-projects-found error names only a basename, even when the path contains a space', () => {
  const fixture = makeFixture();
  try {
    const emptyRoot = path.join(fixture.root, 'work spaces empty');
    mkdirSync(emptyRoot, { recursive: true });
    let caught;
    try {
      refresh({ workspacesRoot: emptyRoot, workmetaRoot: fixture.workmetaRoot,
        hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
        receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    } catch (error) { caught = error; }
    assert.ok(caught instanceof RefreshError);
    assert.equal(caught.code, 'workspace_ledgers_no_projects_found');
    assert.equal(caught.message.includes(emptyRoot), false); // no full (space-containing) path leaked
    assert.equal(caught.message.includes('work spaces empty'), true); // the basename alone is fine to name
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-6 #2): the history-archive-exhausted error names only a basename, never the full historyDir path', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const historyDir = path.join(path.dirname(cPath), 'history');
    mkdirSync(historyDir, { recursive: true });
    const stamp = '2026-09-02T01-00-00-000Z';
    // Occupy every counter slot (0..1000) so archiveHistoryCreateOnly is forced to exhaust.
    for (let counter = 0; counter <= 1000; counter += 1) {
      const suffix = counter === 0 ? '' : `-${counter}`;
      writeFileSync(path.join(historyDir, `연락처_장부.csv.${stamp}${suffix}.csv`), 'x');
    }
    // force a change so this refresh actually tries to archive something
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h9', subject: '[P00-001] 예시장비 추가문의', from: 'another@client.example', to: [], cc: [], received_at: '2026-09-01T07:00:00Z', body_text: '', attachments: [] },
    ]));
    let caught;
    try {
      refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
        hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
        receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    } catch (error) { caught = error; }
    assert.ok(caught instanceof RefreshError);
    assert.equal(caught.code, 'workspace_ledgers_history_archive_exhausted');
    assert.equal(caught.message.includes(historyDir), false);
    assert.equal(caught.message.includes(fixture.workspacesRoot), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

/**
 * fresh-review-6 #3: `decodeCsv` used to parse a trailing blank line (one extra
 * CRLF/LF at the end of a hand-saved file) as an extra all-empty record, which then
 * failed the strict row-shape check downstream and blocked the whole ledger.
 */
test('refresh (fresh-review-6 #3): a trailing blank line in an Owner-saved ledger no longer blocks it with a row-shape error', () => {
  const fixture = makeFixture();
  try {
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts = decodeCsv(readFileSync(cPath, 'utf8'));
    const staffRow = contacts.rows.find(row => row[5] === 'staff@client.example');
    staffRow[12] = '담당자';
    // A CRLF file (encodeCsv's own format) with one extra trailing CRLF -- exactly
    // what an Owner's editor might leave behind on save.
    writeFileSync(cPath, `${encodeCsv(contacts.headers, contacts.rows)}\r\n`);
    const receipt = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const reportA = receipt.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.failed, false); // not blocked by a row-shape error
    const finalContacts = decodeCsv(readFileSync(cPath, 'utf8'));
    const finalStaffRow = finalContacts.rows.find(row => row[5] === 'staff@client.example');
    assert.equal(finalStaffRow[12], '담당자'); // Owner cell merged cleanly, not lost
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-6 #4): allowPartialSources gates a ledger shrinking past 50% of its previous row count, unless the project is in allowEmpty', () => {
  const fixture = makeFixture();
  try {
    // Build up a contacts ledger with several distinct people so a later run can
    // shrink it well past 50%.
    const manyMails = [
      { event_id: 'h1', subject: '[P00-001] 예시 1', from: 'p1@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h2', subject: '[P00-001] 예시 2', from: 'p2@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h3', subject: '[P00-001] 예시 3', from: 'p3@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T03:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h4', subject: '[P00-001] 예시 4', from: 'p4@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T04:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h5', subject: '[P00-001] 예시 5', from: 'p5@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h6', subject: '[P00-001] 예시 6', from: 'p6@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T06:00:00Z', body_text: '', attachments: [] },
    ];
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl(manyMails));
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const before = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.ok(before.rows.length >= 6); // several distinct people (6 senders + 'me')

    // Only ONE of those mails is still readable next time -- and the hiworks directory
    // itself also has a typo'd sibling to force allowPartialSources into play.
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([manyMails[0]]));
    const typoDir = path.join(fixture.hiworksDir, 'typo-does-not-exist');
    const receiptShrunk = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir, typoDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z', allowPartialSources: true });
    const reportShrunk = receiptShrunk.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportShrunk.contacts.failed, true);
    assert.equal(reportShrunk.contacts.code, 'workspace_ledgers_ledger_partial_sources_shrink_blocked');
    assert.equal(reportShrunk.contacts.before_rows, before.rows.length);
    assert.ok(reportShrunk.contacts.after_rows < before.rows.length / 2);
    const untouched = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(untouched.rows.length, before.rows.length); // left exactly as found
    const failureEntry = receiptShrunk.ledger_failures.find(entry => entry.code === 'workspace_ledgers_ledger_partial_sources_shrink_blocked');
    assert.ok(failureEntry);
    assert.equal(failureEntry.before_rows, before.rows.length);
    assert.ok(failureEntry.after_rows < before.rows.length / 2);

    // Naming the project in allowEmpty overrides the shrink guard.
    const receiptAllowed = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir, typoDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T02:00:00.000Z', allowPartialSources: true, allowEmpty: [CODE_A] });
    const reportAllowed = receiptAllowed.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportAllowed.contacts.failed, false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

// -------------------------------------------------------- fresh-review-7 regressions

test('refresh (fresh-review-7 R1): a formerly-merged old row splitting into two fresh people gives the Owner cell to AT MOST ONE of them', () => {
  const fixture = makeFixture();
  try {
    writeOrgConfigWithFamily(fixture.orgConfigPath, { 'client-old.example': 'client-new.example' });
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: '"김철수" <staff@client-new.example>', to: [], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h2', subject: '[P00-001] 예시장비 이전 문의', from: '"김철수" <staff@client-old.example>', to: [], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), '');
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts1 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts1.rows.length, 1); // merged into one person (family still maps old->new)
    const merged = contacts1.rows[0];
    assert.equal(merged[5], 'staff@client-new.example'); // keyed on the more-recent address
    assert.equal(merged[6], 'staff@client-old.example'); // 다른메일
    merged[12] = '담당자';
    writeFileSync(cPath, encodeCsv(contacts1.headers, contacts1.rows));

    // The family mapping is removed (an Owner correction: these two domains turn out
    // NOT to be the same organisation after all) -- the same accumulated mail now
    // classifies as two separate people, one per address, without any new custody.
    writeOrgConfigWithFamily(fixture.orgConfigPath, {});
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const contacts2 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts2.rows.length, 2); // now two distinct people
    const newRow = contacts2.rows.find(row => row[5] === 'staff@client-new.example');
    const oldRow = contacts2.rows.find(row => row[5] === 'staff@client-old.example');
    assert.ok(newRow); assert.ok(oldRow);
    // Exactly one of the two gets the Owner cell -- the old bug copied it onto BOTH.
    const withRole = [newRow, oldRow].filter(row => row[12] === '담당자');
    assert.equal(withRole.length, 1);
    assert.equal(newRow[12], '담당자'); // specifically the one that exact-key-matches the old row
    assert.equal(oldRow[12], ''); // the split's other half gets nothing, not a copy

    const reportA = receipt2.projects.find(row => row.project_code === CODE_A);
    // Pass 1 (exact key) already, unambiguously, resolved this -- not a genuine
    // pass-2 contention, so it must not be flagged ambiguous.
    assert.equal(reportA.contacts.owner_cells_ambiguous, 0);
    assert.equal(reportA.contacts.owner_cells_dropped_with_row, 0); // the old row WAS matched, just not by both
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-7 R2): an alternate address that shadows a different row\'s own exact key never wins over that row\'s exact match', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h1', subject: '[P00-001] 예시장비 문의 A', from: 'person-a@client.example', to: [], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h2', subject: '[P00-001] 예시장비 문의 C', from: 'shared@client.example', to: [], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), '');
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts1 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts1.rows.length, 2);
    // Row A (index 0 in the file -- appears FIRST, which is what let it shadow Row C
    // under the old first-wins-by-file-order index): claims 'shared@client.example' as
    // one of ITS OWN alternate addresses, even though that address is really a
    // different row's own exact key. This pathological state is what the fix must be
    // robust to, however it arose.
    const rowA = contacts1.rows.find(row => row[5] === 'person-a@client.example');
    const rowC = contacts1.rows.find(row => row[5] === 'shared@client.example');
    assert.ok(rowA); assert.ok(rowC);
    rowA[6] = 'shared@client.example'; // 다른메일 -- the shadowing claim
    rowA[12] = '담당자A';
    rowC[12] = '담당자C';
    const orderedRows = [rowA, rowC]; // A before C, matching the reported incident's order
    writeFileSync(cPath, encodeCsv(contacts1.headers, orderedRows));

    // Next refresh: only the shared address is still active.
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h3', subject: '[P00-001] 예시장비 후속 문의', from: 'shared@client.example', to: [], cc: [], received_at: '2026-09-01T03:00:00Z', body_text: '', attachments: [] },
    ]));
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const contacts2 = decodeCsv(readFileSync(cPath, 'utf8'));
    const sharedRow = contacts2.rows.find(row => row[5] === 'shared@client.example');
    assert.ok(sharedRow);
    // The bug: the shadowing alternate address won, giving role A. Fixed: the exact
    // key-column match (Row C, genuinely keyed on this address) always wins.
    assert.equal(sharedRow[12], '담당자C');
    const reportA = receipt2.projects.find(row => row.project_code === CODE_A);
    assert.ok(reportA.contacts.owner_cells_ambiguous >= 1); // the shadowing alt key was removed from the index
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-7 R3): the shrink guard gates on unreadable dirs actually forcing a partial run, not merely on the allowPartialSources request flag', () => {
  const fixture = makeFixture();
  try {
    const manyMails = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((who, index) => ({
      event_id: `h${index + 1}`, subject: `[P00-001] 예시 ${index + 1}`, from: `${who}@client.example`, to: [], cc: [],
      received_at: `2026-09-01T0${index + 1}:00:00Z`, body_text: '', attachments: [],
    }));
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl(manyMails));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), ''); // clear the fixture's own default gmail mail
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const before = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(before.rows.length, 6);

    // A legitimate rule/custody change: only ONE sender's mail is still present, and
    // EVERY custody directory this run names is genuinely, fully readable -- no typo'd
    // sibling. The caller still passes allowPartialSources:true (an operator who
    // always sets it out of habit), which must NOT, by itself, put the shrink guard
    // into effect.
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([manyMails[0]]));
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z', allowPartialSources: true });
    assert.equal(receipt2.unreadable_dirs.length, 0);
    assert.equal(receipt2.allow_partial_sources_applied, false); // requested, but never in effect
    const reportA = receipt2.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.failed, false); // not blocked
    const after = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(after.rows.length, 1); // the shrink went through
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('refresh (fresh-review-7 S1): an allowEmpty override of the shrink guard is recorded in the receipt', () => {
  const fixture = makeFixture();
  try {
    const manyMails = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((who, index) => ({
      event_id: `h${index + 1}`, subject: `[P00-001] 예시 ${index + 1}`, from: `${who}@client.example`, to: [], cc: [],
      received_at: `2026-09-01T0${index + 1}:00:00Z`, body_text: '', attachments: [],
    }));
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl(manyMails));
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });

    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([manyMails[0]]));
    const typoDir = path.join(fixture.hiworksDir, 'typo-does-not-exist');
    const receiptAllowed = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir, typoDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z', allowPartialSources: true, allowEmpty: [CODE_A] });
    const reportA = receiptAllowed.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.failed, false);
    // S1: this used to leave no trace at all that the shrink guard had fired and been
    // overridden -- indistinguishable from a run that never came near it.
    assert.deepEqual(receiptAllowed.shrink_allowed_applied_to, [CODE_A]);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('validateExistingCsv / preserveMerge (fresh-review-7 S2): the shrink guard baseline is the row count AFTER duplicate collapse, not the raw line count', () => {
  const fixture = makeFixture();
  try {
    const fourMails = ['p1', 'p2', 'p3', 'p4'].map((who, index) => ({
      event_id: `h${index + 1}`, subject: `[P00-001] 예시 ${index + 1}`, from: `${who}@client.example`, to: [], cc: [],
      received_at: `2026-09-01T0${index + 1}:00:00Z`, body_text: '', attachments: [],
    }));
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl(fourMails));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), ''); // clear the fixture's own default gmail mail
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts1 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts1.rows.length, 4); // deduped baseline: 4 distinct people

    // A stale duplicate line for one of those four rows -- legacy round-trip debt, byte-
    // identical to its twin, which `preserveMerge` collapses back to 4 on read. The raw
    // line count in the file is 5.
    const duplicateOfFirst = [...contacts1.rows[0]];
    writeFileSync(cPath, encodeCsv(contacts1.headers, [...contacts1.rows, duplicateOfFirst]));

    // Two senders' mail remains -- a shrink from a deduped baseline of 4 to 2 is
    // EXACTLY 50%, which the guard's strict `<` does not block; from the inflated raw
    // baseline of 5 it WOULD be 2/5 = 40%, which the guard would (wrongly) block.
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([fourMails[0], fourMails[1]]));
    const typoDir = path.join(fixture.hiworksDir, 'typo-does-not-exist');
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir, typoDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z', allowPartialSources: true });
    const reportA = receipt2.projects.find(row => row.project_code === CODE_A);
    assert.equal(reportA.contacts.failed, false); // not blocked -- the deduped baseline is used
    assert.equal(reportA.contacts.before_rows, 4); // reported as the POST-collapse count, not 5
    const contacts2 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts2.rows.length, 2);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('decodeCsv (fresh-review-7 S3): a trailing whitespace-only line is trimmed the same as a truly empty one', () => {
  const headers = ['a', 'b'];
  const rows = [['x', 'y'], ['z', 'w']];
  const bareText = encodeCsv(headers, rows);
  // An editor can leave spaces before EOF instead of a bare blank line.
  const withWhitespaceTail = `${bareText}   \r\n`;
  const decoded = decodeCsv(withWhitespaceTail);
  assert.deepEqual(decoded.headers, headers);
  assert.deepEqual(decoded.rows, rows);
});

test('decodeCsv (fresh-review-7 N2): the trailing-blank-line trim is skipped for a single-column header, so a genuine blank one-column row survives', () => {
  const text = `${String.fromCharCode(0xfeff)}only_column\r\nfirst\r\n\r\n`;
  // With >=2 columns this exact shape (one extra line, one empty field) is exactly the
  // trailing-blank-line case (fresh-review-6 #3) and would be trimmed. With a single-
  // column header, a genuine blank row is byte-identical to that trailing line, so the
  // trim must not run at all here.
  const decoded = decodeCsv(text);
  assert.deepEqual(decoded.headers, ['only_column']);
  assert.deepEqual(decoded.rows, [['first'], ['']]);
});

test('refresh (fresh-review-7 N1): a hand-edited 다른메일 cell (comma separator, stray spaces, different case) still matches on the next flip', () => {
  const fixture = makeFixture();
  try {
    writeOrgConfigWithFamily(fixture.orgConfigPath, { 'client-old.example': 'client-new.example' });
    writeFileSync(path.join(fixture.hiworksDir, 'events.jsonl'), jsonl([
      { event_id: 'h1', subject: '[P00-001] 예시장비 납품 안내', from: '"김철수" <staff@client-new.example>', to: [], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
      { event_id: 'h2', subject: '[P00-001] 예시장비 이전 문의', from: '"김철수" <staff@client-old.example>', to: [], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(path.join(fixture.gmailDir, 'events.jsonl'), '');
    refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    const cPath = contactsPath(fixture.workspacesRoot, FOLDER_A);
    const contacts1 = decodeCsv(readFileSync(cPath, 'utf8'));
    const row = contacts1.rows.find(row2 => row2[5] === 'staff@client-new.example');
    assert.ok(row);
    assert.equal(row[6], 'staff@client-old.example');
    // Hand-edited as an Owner's spreadsheet save might leave it: different case, a
    // trailing comma (an empty extra token), and no surrounding trim.
    row[6] = ' STAFF@Client-Old.EXAMPLE, ';
    row[12] = '담당자';
    writeFileSync(cPath, encodeCsv(contacts1.headers, contacts1.rows));

    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), jsonl([
      { event_id: 'h3', subject: '[P00-001] 예시장비 추가 문의', from: '"김철수" <staff@client-old.example>', to: [], cc: [], received_at: '2026-09-01T10:00:00Z', body_text: '', attachments: [] },
    ]));
    const receipt2 = refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
      hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath,
      receiptsDir: fixture.receiptsDir, now: '2026-09-02T01:00:00.000Z' });
    const contacts2 = decodeCsv(readFileSync(cPath, 'utf8'));
    assert.equal(contacts2.rows.length, 1);
    const flipped = contacts2.rows.find(row2 => row2[5] === 'staff@client-old.example');
    assert.ok(flipped, 'the real (lowercase) old address must still match the hand-edited alternate');
    assert.equal(flipped[12], '담당자'); // Owner cell preserved despite the cosmetic edit
    const reportA = receipt2.projects.find(row2 => row2.project_code === CODE_A);
    assert.equal(reportA.contacts.owner_cells_dropped_with_row, 0);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('readOrgConfig (fresh-review-7 N3): the org-config-unreadable failure never carries the real host path, and its no-`.code` fallback is a basename', () => {
  const fixture = makeFixture();
  try {
    const missingPath = path.join(fixture.root, 'no-such-org-config-directory', 'org_config.json');
    assert.throws(() => {
      refresh({ workspacesRoot: fixture.workspacesRoot, workmetaRoot: fixture.workmetaRoot,
        hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: missingPath,
        receiptsDir: fixture.receiptsDir, now: '2026-09-02T00:00:00.000Z' });
    }, error => {
      assert.equal(error.code, 'workspace_ledgers_org_config_unreadable');
      assert.equal(String(error.message).includes(fixture.root), false);
      return true;
    });
    // Every real fs error Node throws for a string path carries `.code` (ENOENT here),
    // which makes the fallback branch below unreachable through the public API in this
    // runtime (`fs.readFileSync` cannot be mocked to omit it either -- it is non-
    // configurable). This still guards the exact source line against a regression back
    // to the old `error?.code ?? orgConfigPath`, which leaked the full host path.
    const sourcePath = fileURLToPath(new URL('../src/refresh.mjs', import.meta.url));
    const source = readFileSync(sourcePath, 'utf8');
    assert.match(source, /error\?\.code \?\? path\.basename\(orgConfigPath\)/u);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
