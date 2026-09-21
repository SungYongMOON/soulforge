import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { decodeCsv, encodeCsv } from '../src/ledgers.mjs';
import { READING_HEADERS } from '../src/owner_tables.mjs';
import { classifyAllCommonMail } from '../src/common_refresh.mjs';
import { appendReadingDecision, listUnclassified, TriageError } from '../src/triage.mjs';

function rule(code, folder) {
  return {
    schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: folder, rule_version: 'v1', status: 'draft',
    match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: [{ label: code, kind: 'literal', value: code }], hint: [],
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  };
}
function jsonl(lines) { return lines.map(line => JSON.stringify(line)).join('\n'); }

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-triage-'));
  const workspacesRoot = path.join(root, '_workspaces');
  const hiworksDir = path.join(root, 'events', 'hiworks');
  const gmailDir = path.join(root, 'events', 'gmail_sent');
  for (const dir of [hiworksDir, gmailDir]) mkdirSync(dir, { recursive: true });

  const folderA = 'P00-001_예시과제';
  const ruleDir = path.join(workspacesRoot, folderA, '020_MGMT/021_자동화설정_운영규칙');
  mkdirSync(ruleDir, { recursive: true });
  writeFileSync(path.join(ruleDir, 'mail_routing_rule.json'), `${JSON.stringify(rule('P00-001', folderA), null, 2)}\n`);

  writeFileSync(path.join(hiworksDir, 'events.jsonl'), jsonl([
    {
      event_id: 'u1', subject: '분류 안 되는 메일', from: 'x@client.example', to: ['me@example.com'], cc: [],
      received_at: '2026-09-01T01:00:00Z',
      body_text: '보낸 사람: x\n안녕하세요.\n\n논의할 내용이 있습니다.\n\n감사합니다.\n김담당 드림',
      attachments: [{ name: '첨부.pdf' }],
    },
    { event_id: 'u2', subject: 'Re: 분류 안 되는 메일', from: 'me@example.com', to: ['x@client.example'], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
  ]));

  const orgConfigPath = path.join(root, 'org_config.json');
  writeFileSync(orgConfigPath, JSON.stringify({ our_domain: 'example.com', organisations: {}, family: {} }));
  const readingTablePath = path.join(root, '판독_결정표.csv');

  return { root, workspacesRoot, hiworksDir, gmailDir, orgConfigPath, readingTablePath };
}

test('listUnclassified: returns only the 미분류 bucket, with a cleaned body preview and same-thread routing', () => {
  const fixture = makeFixture();
  try {
    const result = listUnclassified({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath });
    // Neither u1 (received) nor u2 (a reply, gmail-sent custody) matches any project
    // rule or common-bucket pattern in this minimal fixture -- both are 미분류.
    assert.equal(result.total, 2);
    const item = result.items.find(entry => entry.mail_source_id === 'u1');
    assert.ok(item);
    assert.equal(item.subject, '분류 안 되는 메일');
    assert.ok(!item.body_preview.includes('보낸 사람'));
    assert.ok(item.body_preview.includes('논의할 내용이 있습니다.'));
    assert.ok(!item.body_preview.includes('감사합니다'));
    assert.deepEqual(item.attachment_names, ['첨부.pdf']);
    // same_thread_routing sees both u1 and u2's outcome (both 미분류.csv here).
    assert.ok(item.same_thread_routing.includes('미분류.csv'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('appendReadingDecision: validation rejects an unknown level, an unknown project code, a disallowed exclude target, empty why/reader', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'not_a_level', target: '', why: 'x', reader: 'tester',
    }), error => error instanceof TriageError && error.code === 'workspace_ledgers_triage_level_invalid');

    assert.throws(() => appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'include', target: 'P99-999', why: 'x', reader: 'tester',
    }), error => error instanceof TriageError && error.code === 'workspace_ledgers_triage_target_unknown_project');

    assert.throws(() => appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'exclude', target: '아무거나', why: 'x', reader: 'tester',
    }), error => error instanceof TriageError && error.code === 'workspace_ledgers_triage_target_not_allowed');

    assert.throws(() => appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'exclude', target: '광고', why: '', reader: 'tester',
    }), error => error instanceof TriageError && error.code === 'workspace_ledgers_triage_why_required');

    assert.throws(() => appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'exclude', target: '광고', why: 'x', reader: '',
    }), error => error instanceof TriageError && error.code === 'workspace_ledgers_triage_reader_required');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('appendReadingDecision: a valid decision appends a row, creating the table fresh when it does not exist yet', () => {
  const fixture = makeFixture();
  try {
    const result = appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'include', target: 'P00-001', why: '메일 본문에서 확인', reader: 'tester',
    });
    assert.equal(result.row_count, 1);
    const decoded = decodeCsv(readFileSync(fixture.readingTablePath, 'utf8'));
    assert.deepEqual(decoded.headers, [...READING_HEADERS]);
    assert.equal(decoded.rows[0][0], 'u1');
    assert.equal(decoded.rows[0][3], 'include');
    assert.equal(decoded.rows[0][4], 'P00-001');
    assert.equal(decoded.rows[0][8], ''); // Owner확인 always empty -- this API can never fill it
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('appendReadingDecision: rejects a second decision for the same mail id (already has a row)', () => {
  const fixture = makeFixture();
  try {
    appendReadingDecision({ workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'include', target: 'P00-001', why: '첫 판독', reader: 'tester' });
    assert.throws(() => appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'exclude', target: '광고', why: '재판독', reader: 'tester2',
    }), error => error instanceof TriageError && error.code === 'workspace_ledgers_triage_decision_duplicate');
    // the original row is unchanged
    const decoded = decodeCsv(readFileSync(fixture.readingTablePath, 'utf8'));
    assert.equal(decoded.rows.length, 1);
    assert.equal(decoded.rows[0][3], 'include');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('appendReadingDecision: an Owner확인 value already set by hand is never touched by a later, different mail\'s decision', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['u0', '2026-09-01', 'existing', 'include', 'P00-001', 'earlier', 'someone', '2026-09-01', '2026-09-02'],
    ]));
    appendReadingDecision({ workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'hold_owner_review', target: '', why: '판단 보류', reader: 'tester' });
    const decoded = decodeCsv(readFileSync(fixture.readingTablePath, 'utf8'));
    assert.equal(decoded.rows.length, 2);
    const existingRow = decoded.rows.find(row => row[0] === 'u0');
    assert.equal(existingRow[8], '2026-09-02');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('appendReadingDecision: archives previous table bytes to history/ before appending', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['u0', '2026-09-01', 'existing', 'exclude', '광고', 'ad', 'r', '2026-09-01', ''],
    ]));
    appendReadingDecision({ workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'exclude', target: '광고', why: 'ad2', reader: 'tester' });
    const historyDir = path.join(path.dirname(fixture.readingTablePath), 'history');
    const entries = readdirSync(historyDir);
    assert.equal(entries.length, 1);
    const archived = decodeCsv(readFileSync(path.join(historyDir, entries[0]), 'utf8'));
    assert.equal(archived.rows.length, 1); // the pre-append content, one row only
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('a write via appendReadingDecision is reflected by the next classification pass (refresh --dry equivalent)', () => {
  const fixture = makeFixture();
  try {
    const before = classifyAllCommonMail({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, readingTablePath: fixture.readingTablePath });
    const beforeEntry = before.classified.find(entry => entry.mail.event_id === 'u1');
    assert.equal(beforeEntry.outcome.bucket, 'unclassified');

    appendReadingDecision({ workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'include', target: 'P00-001', why: '판독 확인', reader: 'tester' });

    const after = classifyAllCommonMail({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, readingTablePath: fixture.readingTablePath });
    const afterEntry = after.classified.find(entry => entry.mail.event_id === 'u1');
    assert.equal(afterEntry.outcome.bucket, 'project');
    assert.deepEqual(afterEntry.outcome.projectCodes, ['P00-001']);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
