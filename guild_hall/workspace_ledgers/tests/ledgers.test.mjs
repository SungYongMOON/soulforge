import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContacts, decodeCsv, encodeCsv, normalizeSubject, splitTitle, threadKey } from '../src/ledgers.mjs';

const ORG_CONFIG = {
  our_domain: 'example.com',
  organisations: { 'example.com': 'Example Corp', 'partner-old.example': 'Partner Co', 'partner-new.example': 'Partner Co', 'client.example': 'Client Inc' },
  family: { 'partner-old.example': 'partner-new.example' },
};

function person(name, email) { return { name, email }; }
function mail({ from, to = [], cc = [], at }) { return { from, to, cc, at }; }

test('splitTitle: splits a trailing Korean job title, strips parenthetical', () => {
  assert.deepEqual(splitTitle('김철수 수석연구원'), { base: '김철수', title: '수석연구원' });
  assert.deepEqual(splitTitle('김철수(LIG D&A)'), { base: '김철수', title: '' });
  assert.deepEqual(splitTitle('김철수'), { base: '김철수', title: '' });
});

test('normalizeSubject / threadKey: strips Re/Fw/답장/전달/회신/Remind prefixes and collapses whitespace', () => {
  assert.equal(normalizeSubject('RE: hello   world'), 'hello world');
  assert.equal(normalizeSubject('[Remind] 회신: 답장: hello'), 'hello');
  assert.equal(threadKey('RE: hello'), threadKey('hello'));
  assert.equal(threadKey('[Remind] hello'), threadKey('Fwd: hello'));
  assert.notEqual(threadKey('hello'), threadKey('goodbye'));
});

test('encodeCsv / decodeCsv: BOM, CRLF, quote escaping round trip', () => {
  const headers = ['a', 'b'];
  const rows = [['simple', 'has,comma'], ['has"quote', 'multi\nline']];
  const text = encodeCsv(headers, rows);
  assert.equal(text.startsWith('﻿'), true);
  assert.equal(text.includes('\r\n'), true);
  const decoded = decodeCsv(text);
  assert.deepEqual(decoded.headers, headers);
  assert.deepEqual(decoded.rows[0], ['simple', 'has,comma']);
  assert.deepEqual(decoded.rows[1], ['has"quote', 'multi line']); // encodeCsv flattens embedded newlines to spaces
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
