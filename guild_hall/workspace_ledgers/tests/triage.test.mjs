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

test('appendReadingDecision (A2 item 2): the renamed "과제미정" exclude target is accepted, same as the old "과제없음"', () => {
  const fixture = makeFixture();
  try {
    const result = appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'exclude', target: '과제미정', why: '아직 모름', reader: 'tester',
    });
    assert.equal(result.target, '과제미정');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('appendReadingDecision (A2 item 4): with humanActors supplied, an "include" from a reader NOT on the list is refused -- must use include_with_review', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'include', target: 'P00-001', why: 'AI 추정', reader: '맥락이', humanActors: ['owner', 'teammate'],
    }), error => error instanceof TriageError && error.code === 'workspace_ledgers_triage_include_requires_human_reader');
    // include_with_review from the same non-human reader is fine.
    const result = appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'include_with_review', target: 'P00-001', why: 'AI 추정', reader: '맥락이', humanActors: ['owner', 'teammate'],
    });
    assert.equal(result.level, 'include_with_review');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('appendReadingDecision (A2 item 4): a reader ON the humanActors list may still use "include"; omitting humanActors applies no restriction at all', () => {
  const fixture = makeFixture();
  try {
    const result = appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'include', target: 'P00-001', why: '사람 확인', reader: 'owner', humanActors: ['owner'],
    });
    assert.equal(result.level, 'include');

    // A second, independent fixture: no humanActors passed at all -- unchanged default.
    const fixture2 = makeFixture();
    try {
      const result2 = appendReadingDecision({
        workspacesRoot: fixture2.workspacesRoot, readingTablePath: fixture2.readingTablePath,
        id: 'u1', level: 'include', target: 'P00-001', why: 'AI 추정', reader: '맥락이',
      });
      assert.equal(result2.level, 'include');
    } finally { rmSync(fixture2.root, { recursive: true, force: true }); }
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

test('listUnclassified (coordinator, 2026-09-21): organisation_undecided mail is excluded by default, included only with includeOrganisationUndecided', () => {
  const fixture = makeFixture();
  try {
    const vendorTablePath = path.join(fixture.root, '거래처_대응표.csv');
    writeFileSync(vendorTablePath, encodeCsv(['도메인', '거래처명', '구분', '메모'], [['vendor.example', '거래처A', '부품', '']]));
    writeFileSync(path.join(fixture.hiworksDir, 'events2.jsonl'), jsonl([
      { event_id: 'v1', subject: '거래처 문의', from: 'sales@vendor.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T03:00:00Z', body_text: '', attachments: [] },
    ]));

    const defaultList = listUnclassified({
      workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir],
      orgConfigPath: fixture.orgConfigPath, vendorTablePath,
    });
    assert.ok(!defaultList.items.some(item => item.mail_source_id === 'v1'));
    assert.ok(defaultList.items.every(item => item.bucket === 'unclassified'));

    const withOrgUndecided = listUnclassified({
      workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir],
      orgConfigPath: fixture.orgConfigPath, vendorTablePath, includeOrganisationUndecided: true,
    });
    const v1 = withOrgUndecided.items.find(item => item.mail_source_id === 'v1');
    assert.ok(v1);
    assert.equal(v1.bucket, 'organisation_undecided');
    assert.deepEqual(v1.vendors, ['거래처A']);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('listUnclassified (S3, fresh non-author review): a vendor_only reading decision with no matched organisation is flagged already_decided_invalid', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['u1', '2026-09-01', '분류 안 되는 메일', 'vendor_only', '', '거래처 표기 없음', 'tester', '2026-09-21', ''],
    ]));
    const result = listUnclassified({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, readingTablePath: fixture.readingTablePath });
    const u1 = result.items.find(item => item.mail_source_id === 'u1');
    assert.ok(u1);
    assert.equal(u1.already_decided_invalid, 'vendor_only_without_organisation');
    // a mail with no reading decision at all is not flagged.
    const u2 = result.items.find(item => item.mail_source_id === 'u2');
    assert.equal(u2.already_decided_invalid, null);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('listUnclassified (S5, fresh non-author review): a courtesy phrase near the START of a short reply never discards the real content after it', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 's5.jsonl'), jsonl([
      {
        event_id: 's5-1', subject: '완전히 무관한 제목', from: 'x@client.example', to: ['me@example.com'], cc: [],
        received_at: '2026-09-01T03:00:00Z',
        body_text: '감사합니다.\n\n본론: 실제 중요한 내용입니다.\n\n추가로 확인 부탁드립니다.',
        attachments: [],
      },
    ]));
    const result = listUnclassified({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath });
    const item = result.items.find(entry => entry.mail_source_id === 's5-1');
    assert.ok(item);
    assert.notEqual(item.body_preview, '');
    assert.ok(item.body_preview.includes('실제 중요한 내용입니다'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('listUnclassified (S5): a genuine trailing signature block is still cut', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 's5b.jsonl'), jsonl([
      {
        event_id: 's5-2', subject: '완전히 무관한 제목 둘', from: 'x@client.example', to: ['me@example.com'], cc: [],
        received_at: '2026-09-01T04:00:00Z',
        body_text: '본론: 실제 중요한 내용입니다.\n\n추가 설명입니다.\n\n감사합니다.\n김담당 드림',
        attachments: [],
      },
    ]));
    const result = listUnclassified({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath });
    const item = result.items.find(entry => entry.mail_source_id === 's5-2');
    assert.ok(item);
    assert.ok(!item.body_preview.includes('감사합니다'));
    assert.ok(item.body_preview.includes('실제 중요한 내용입니다'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('listUnclassified (S5, fresh non-author review): a forward that is entirely quoted/header-shaped content never returns an empty preview', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 's5c.jsonl'), jsonl([
      {
        event_id: 's5-3', subject: '완전히 무관한 제목 넷', from: 'x@client.example', to: ['me@example.com'], cc: [],
        received_at: '2026-09-01T06:00:00Z',
        body_text: 'From: original@client.example\nSent: 2026-09-01\nTo: someone@example.com\nSubject: 원본 제목',
        attachments: [],
      },
    ]));
    const result = listUnclassified({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath });
    const item = result.items.find(entry => entry.mail_source_id === 's5-3');
    assert.ok(item);
    assert.notEqual(item.body_preview, ''); // falls back to the unstripped lines rather than returning nothing
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('listUnclassified (N3, fresh non-author review): ordinary prose starting with a header-like word (no colon) is kept in the body preview', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'n3.jsonl'), jsonl([
      {
        event_id: 'n3-1', subject: '완전히 무관한 제목 셋', from: 'x@client.example', to: ['me@example.com'], cc: [],
        received_at: '2026-09-01T05:00:00Z',
        body_text: '제목이 아직 정해지지 않았습니다.\n날짜는 다음 주로 조정하겠습니다.',
        attachments: [],
      },
    ]));
    const result = listUnclassified({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath });
    const item = result.items.find(entry => entry.mail_source_id === 'n3-1');
    assert.ok(item);
    // neither line is a "Label: value" mail-client header -- both must survive.
    assert.ok(item.body_preview.includes('제목이 아직 정해지지 않았습니다'));
    assert.ok(item.body_preview.includes('날짜는 다음 주로 조정하겠습니다'));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('appendReadingDecision (S6, fresh non-author review): reader is length-capped the same way why is', () => {
  const fixture = makeFixture();
  try {
    assert.throws(() => appendReadingDecision({
      workspacesRoot: fixture.workspacesRoot, readingTablePath: fixture.readingTablePath,
      id: 'u1', level: 'exclude', target: '광고', why: 'x', reader: 'r'.repeat(1001),
    }), error => error instanceof TriageError && error.code === 'workspace_ledgers_triage_reader_too_long');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('listUnclassified (S8, fresh non-author review): already_decided_invalid also covers an unroutable exclude target and an unknown-code include, not just vendor_only', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 's8.jsonl'), jsonl([
      { event_id: 's8-exclude', subject: '완전히 무관한 제목 A', from: 'x@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T06:00:00Z', body_text: '', attachments: [] },
      { event_id: 's8-unknown', subject: '완전히 무관한 제목 B', from: 'x@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T07:00:00Z', body_text: '', attachments: [] },
    ]));
    writeFileSync(fixture.readingTablePath, encodeCsv(READING_HEADERS, [
      ['s8-exclude', '2026-09-01', '완전히 무관한 제목 A', 'exclude', '알 수 없는 분류', '분류 불명', 'tester', '2026-09-21', ''],
      ['s8-unknown', '2026-09-01', '완전히 무관한 제목 B', 'include', 'P99-999', '잘못된 코드', 'tester', '2026-09-21', ''],
    ]));
    const result = listUnclassified({ workspacesRoot: fixture.workspacesRoot, hiworksDirs: [fixture.hiworksDir], gmailSentDirs: [fixture.gmailDir], orgConfigPath: fixture.orgConfigPath, readingTablePath: fixture.readingTablePath });
    const excludeItem = result.items.find(item => item.mail_source_id === 's8-exclude');
    const unknownItem = result.items.find(item => item.mail_source_id === 's8-unknown');
    assert.equal(excludeItem.already_decided_invalid, 'unroutable_exclude_target');
    assert.equal(unknownItem.already_decided_invalid, 'unknown_reading_target');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
