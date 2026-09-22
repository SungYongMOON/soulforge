import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildContacts, buildHistory, decodeCsv, encodeCsv, HISTORY_HEADERS, mailboxCellOf, normalizeSubject, seoulDateOf, splitTitle,
  threadKey,
} from '../src/ledgers.mjs';

const ORG_CONFIG = {
  our_domain: 'example.com',
  organisations: { 'example.com': 'Example Corp', 'partner-old.example': 'Partner Co', 'partner-new.example': 'Partner Co', 'client.example': 'Client Inc' },
  family: { 'partner-old.example': 'partner-new.example' },
};

function person(name, email) { return { name, email }; }
function mail({ from, to = [], cc = [], at }) { return { from, to, cc, at }; }

test('splitTitle: splits a trailing Korean job title, strips parenthetical', () => {
  assert.deepEqual(splitTitle('김철수 수석연구원'), { base: '김철수', title: '수석연구원' });
  assert.deepEqual(splitTitle('김철수(Partner Co)'), { base: '김철수', title: '' }); // R5: synthetic org name only
  assert.deepEqual(splitTitle('김철수'), { base: '김철수', title: '' });
});

test('normalizeSubject / threadKey: strips Re/Fw/답장/전달/회신/Remind prefixes and collapses whitespace', () => {
  assert.equal(normalizeSubject('RE: hello   world'), 'hello world');
  assert.equal(normalizeSubject('[Remind] 회신: 답장: hello'), 'hello');
  assert.equal(threadKey('RE: hello'), threadKey('hello'));
  assert.equal(threadKey('[Remind] hello'), threadKey('Fwd: hello'));
  assert.notEqual(threadKey('hello'), threadKey('goodbye'));
});

test('normalizeSubject: also strips read-receipt prefixes (읽음:/Read:) alongside RE/FW (Owner note, 2026-09-21)', () => {
  assert.equal(normalizeSubject('읽음: hello'), 'hello');
  assert.equal(normalizeSubject('Read: hello'), 'hello');
  assert.equal(normalizeSubject('read: 읽음: RE: hello'), 'hello'); // stacked prefixes
  assert.equal(threadKey('읽음: hello'), threadKey('hello'));
  assert.equal(threadKey('Read: hello'), threadKey('hello'));
});

test('encodeCsv / decodeCsv: BOM, CRLF, quote escaping round trip', () => {
  const headers = ['a', 'b'];
  const rows = [['simple', 'has,comma'], ['has"quote', 'multi\nline']];
  const text = encodeCsv(headers, rows);
  assert.equal(text.startsWith(String.fromCharCode(0xfeff)), true); // fresh-review-5 #1: built, not a raw literal
  assert.equal(text.includes('\r\n'), true);
  const decoded = decodeCsv(text);
  assert.deepEqual(decoded.headers, headers);
  assert.deepEqual(decoded.rows[0], ['simple', 'has,comma']);
  assert.deepEqual(decoded.rows[1], ['has"quote', 'multi\nline']); // S8: embedded newlines round-trip, not flattened
});

test('decodeCsv (fresh-review-6 #3): a trailing blank line is not parsed as a spurious extra row', () => {
  const headers = ['a', 'b'];
  const rows = [['x', 'y'], ['z', 'w']];
  const bareText = encodeCsv(headers, rows);

  // CRLF file with one extra trailing CRLF.
  const withExtraCrlf = `${bareText}\r\n`;
  const decodedCrlf = decodeCsv(withExtraCrlf);
  assert.deepEqual(decodedCrlf.headers, headers);
  assert.deepEqual(decodedCrlf.rows, rows); // no spurious ['' ] row appended

  // LF-only file (an Owner's editor may normalise CRLF to LF) with two trailing LFs.
  const lfText = bareText.replace(/\r\n/gu, '\n');
  const withTwoTrailingLfs = `${lfText}\n\n`;
  const decodedLf = decodeCsv(withTwoTrailingLfs);
  assert.deepEqual(decodedLf.headers, headers);
  assert.deepEqual(decodedLf.rows, rows);
});

test('encodeCsv / decodeCsv: formula-injection trigger cells are guarded on write and unguarded on read (R1)', () => {
  const headers = ['a', 'b'];
  const rows = [
    ["=cmd|' /C calc'!A0", 'safe'],
    ['+82-10-1234-5678', 'safe'],
    ['-5', 'safe'],
    ['@mention', 'safe'],
    ['  =leading-space-then-trigger', 'safe'],
    ['plain text', 'safe'],
  ];
  const text = encodeCsv(headers, rows);
  // every trigger cell must be guarded with a single leading apostrophe in the raw bytes
  assert.match(text, /'=cmd\|' \/C calc'!A0/u);
  assert.match(text, /'\+82-10-1234-5678/u);
  assert.match(text, /'-5/u);
  assert.match(text, /'@mention/u);
  const decoded = decodeCsv(text);
  assert.deepEqual(decoded.rows, rows); // round trip strips the guard back off
});

test('encodeCsv / decodeCsv: an embedded newline round-trips via a quoted cell (fresh-review-2 #8/S8)', () => {
  const headers = ['key', '메모'];
  const rows = [['k1', '첫 줄\n둘째 줄\n셋째 줄']];
  const text = encodeCsv(headers, rows);
  assert.match(text, /"첫 줄\n둘째 줄\n셋째 줄"/u); // kept as a real newline inside a quoted cell, not flattened
  const decoded = decodeCsv(text);
  assert.deepEqual(decoded.rows, rows);
});

test('seoulDateOf: derives the Asia/Seoul calendar date from a UTC instant, crossing midnight both ways (S12)', () => {
  assert.equal(seoulDateOf('2026-09-01T15:30:00.000Z'), '2026-09-02'); // 00:30 KST the next day
  assert.equal(seoulDateOf('2026-09-01T14:59:00.000Z'), '2026-09-01'); // 23:59 KST the same day
});

test('buildContacts: same name within an organisation family merges across a domain rename', () => {
  const mails = [
    mail({ from: person('김철수', 'kim@partner-old.example'), at: '2026-01-01T00:00:00Z' }),
    mail({ from: person('김철수', 'kim@partner-new.example'), at: '2026-02-01T00:00:00Z' }),
  ];
  const { records } = buildContacts({ code: 'P00-001', mails, orgConfig: ORG_CONFIG });
  assert.equal(records.length, 1);
  assert.equal(records[0].name, '김철수');
  assert.equal(records[0].emails.size, 2);
});

test('buildContacts: same local-part within a family merges even with no display name on one side', () => {
  const mails = [
    mail({ from: person('이영희', 'lee@partner-old.example'), at: '2026-01-01T00:00:00Z' }),
    mail({ from: person('', 'lee@partner-new.example'), at: '2026-02-01T00:00:00Z' }),
  ];
  const { records } = buildContacts({ code: 'P00-001', mails, orgConfig: ORG_CONFIG });
  assert.equal(records.length, 1);
  assert.equal(records[0].name, '이영희');
});

test('buildContacts: same name across different organisations is never auto-merged (namesake)', () => {
  const mails = [
    mail({ from: person('박민수', 'park@partner-new.example'), at: '2026-01-01T00:00:00Z' }),
    mail({ from: person('박민수', 'park@client.example'), at: '2026-02-01T00:00:00Z' }),
  ];
  const { rows } = buildContacts({ code: 'P00-001', mails, orgConfig: ORG_CONFIG });
  assert.equal(rows.length, 2);
  // both rows must flag the namesake collision in 비고 (the last CSV column)
  for (const row of rows) assert.match(row[row.length - 1], /동일인 확인 필요/u);
});

test('buildContacts: title is split into its own column, not left in the name', () => {
  const mails = [mail({ from: person('최지훈 책임연구원', 'choi@client.example'), at: '2026-01-01T00:00:00Z' })];
  const { rows } = buildContacts({ code: 'P00-001', mails, orgConfig: ORG_CONFIG });
  assert.equal(rows.length, 1);
  assert.equal(rows[0][2], '최지훈'); // 이름
  assert.equal(rows[0][3], '책임연구원'); // 직급
});

test('buildContacts: intra-family namesake risk is flagged when a rare shared spelling merges two different local parts (S8)', () => {
  const mails = [
    // kim1's dominant spelling is "Sumin Kim" (5x); "정수민" is a rare minority spelling (1x).
    ...Array.from({ length: 5 }, (unused, index) => mail({ from: person('Sumin Kim', 'kim1@client.example'), at: `2026-01-0${index + 1}T00:00:00Z` })),
    mail({ from: person('정수민', 'kim1@client.example'), at: '2026-01-06T00:00:00Z' }),
    // kim2 (a different local part, no relation to kim1) only ever used "정수민".
    mail({ from: person('정수민', 'kim2@client.example'), at: '2026-02-01T00:00:00Z' }),
  ];
  const { records, rows } = buildContacts({ code: 'P00-001', mails, orgConfig: ORG_CONFIG });
  const index = records.findIndex(record => record.name === '정수민');
  assert.notEqual(index, -1, 'the rare shared spelling must still merge the two addresses');
  assert.equal(records[index].others.length + 1, 2); // both kim1 and kim2 pooled under one row
  const note = rows[index][rows[index].length - 1];
  assert.match(note, /같은 이름·같은 조직의 다른 주소 — 동일인 확인 필요/u);
});

test('buildContacts: no namesake-risk note when addresses share their dominant spelling', () => {
  const mails = [
    mail({ from: person('정수민', 'kim1@client.example'), at: '2026-01-01T00:00:00Z' }),
    mail({ from: person('정수민', 'kim1@client.example'), at: '2026-01-02T00:00:00Z' }),
    mail({ from: person('정수민', 'kim2@client.example'), at: '2026-02-01T00:00:00Z' }),
  ];
  const { records, rows } = buildContacts({ code: 'P00-001', mails, orgConfig: ORG_CONFIG });
  const index = records.findIndex(record => record.name === '정수민');
  assert.notEqual(index, -1);
  const note = rows[index][rows[index].length - 1];
  assert.doesNotMatch(note, /같은 이름·같은 조직의 다른 주소/u);
});

test('buildContacts: varying display names on one address settle on the most-used Korean-first name', () => {
  const mails = [
    mail({ from: person('정수민', 'jung@client.example'), at: '2026-01-01T00:00:00Z' }),
    mail({ from: person('정수민', 'jung@client.example'), at: '2026-01-02T00:00:00Z' }),
    mail({ from: person('Sumin Jung', 'jung@client.example'), at: '2026-01-03T00:00:00Z' }),
  ];
  const { records } = buildContacts({ code: 'P00-001', mails, orgConfig: ORG_CONFIG });
  assert.equal(records.length, 1);
  assert.equal(records[0].name, '정수민');
});

// ----------------------------------------------------- 메일함 owner attribution (2026-09-22)
const MAILBOX_INDEX = HISTORY_HEADERS.indexOf('메일함');

function historyMail({ source, mailbox_owners, direction = 'received', event_id = 'e1', label = 'l' }) {
  return {
    source, mailbox_owners, direction, event_id, at: '2026-09-01T00:00:00Z', subject: 's',
    from: person('김철수', 'staff@client.example'), to: [], cc: [], attachment_count: 0, label,
  };
}

test('mailboxCellOf: joins mailbox_owners with " ; ", never re-sorting the order given', () => {
  assert.equal(mailboxCellOf(historyMail({ source: '하이웍스_수집', mailbox_owners: ['김철수 kim@company.example'] })), '김철수 kim@company.example');
  assert.equal(
    mailboxCellOf(historyMail({ source: '하이웍스_수집', mailbox_owners: ['김철수 kim@company.example', '이영희 lee@company.example'] })),
    '김철수 kim@company.example ; 이영희 lee@company.example',
  );
});

test('mailboxCellOf: falls back to the fixed source label when mailbox_owners is empty, missing, or not an array', () => {
  assert.equal(mailboxCellOf(historyMail({ source: '하이웍스_수집', mailbox_owners: [] })), '하이웍스_수집');
  assert.equal(mailboxCellOf(historyMail({ source: 'Gmail_보낸메일_수집', mailbox_owners: undefined })), 'Gmail_보낸메일_수집');
  assert.equal(mailboxCellOf({ source: '하이웍스_수집' }), '하이웍스_수집'); // no mailbox_owners key at all
});

test('buildHistory: 메일함 cell carries the real mailbox owner for hiworks mail, the fixed label as fallback', () => {
  const mails = [
    { ...historyMail({ source: '하이웍스_수집', mailbox_owners: ['김철수 kim@company.example'], event_id: 'h1' }) },
    { ...historyMail({ source: '하이웍스_수집', mailbox_owners: [], event_id: 'h2' }) },
  ];
  const { received } = buildHistory({ code: 'P00-001', mails, orgConfig: ORG_CONFIG, ruleVersion: 'v1' });
  assert.equal(received.rows.length, 2);
  const rowWithOwner = received.rows.find(row => row[6] === 'h1'); // 메일소스ID
  const rowFallback = received.rows.find(row => row[6] === 'h2');
  assert.equal(rowWithOwner[MAILBOX_INDEX], '김철수 kim@company.example');
  assert.equal(rowFallback[MAILBOX_INDEX], '하이웍스_수집');
});

test('buildHistory: 메일함 cell carries the real mailbox owner for gmail-sent mail too', () => {
  const mails = [historyMail({ source: 'Gmail_보낸메일_수집', mailbox_owners: ['오너 me@company.example'], direction: 'sent', event_id: 'g1' })];
  const { sent } = buildHistory({ code: 'P00-001', mails, orgConfig: ORG_CONFIG, ruleVersion: 'v1' });
  assert.equal(sent.rows.length, 1);
  assert.equal(sent.rows[0][MAILBOX_INDEX], '오너 me@company.example');
});

test('buildHistory: a mail deduplicated across two mailboxes lists both owners, joined by " ; ", in the given order', () => {
  const mails = [historyMail({
    source: '하이웍스_수집', mailbox_owners: ['김철수 kim@company.example', '이영희 lee@company.example'], event_id: 'h1',
  })];
  const { received } = buildHistory({ code: 'P00-001', mails, orgConfig: ORG_CONFIG, ruleVersion: 'v1' });
  assert.equal(received.rows[0][MAILBOX_INDEX], '김철수 kim@company.example ; 이영희 lee@company.example');
});

test('buildHistory: HISTORY_HEADERS is unchanged -- 메일함 owner attribution never adds/renames/removes a column', () => {
  assert.deepEqual([...HISTORY_HEADERS], [
    '이력키', '스키마버전', '발생시각', '프로젝트코드', '단계', '이벤트유형', '메일소스ID',
    '메일수신시각', '메일함', '스레드', '제목', '발신자', '발신자메일', '발신자소속', '수신자', '참조', '첨부수', '작업상태', '적용규칙', '규칙판', '원문복사여부',
  ]);
});
