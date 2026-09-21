// Pure CSV ledger builders for one project's 020_MGMT folder. Headers, cell escaping,
// person-merge rules and thread-key normalisation mirror the behavioural reference
// (`gen_mgmt_ledgers_20260921.mjs`), parameterised by an org config instead of
// hardcoded company/person data so this module ships no real names.
//
// Each builder returns `{ headers, rows, ... }` plain data -- no filesystem access.
// `refresh.mjs` owns reading/writing/preserving Owner-entered columns and lineage.
import { createHash } from 'node:crypto';

export const LEDGER_SCHEMA = 'soulforge.workspace_management_ledger_csv.v1';

const TITLE = /\s*(수석연구원|책임연구원|선임연구원|수석|책임|선임|전임|주임|사원|대리|과장|차장|부장|팀장|소장|사장|대표이사|대표|박사|교수|연구원)\s*$/u;

/** Splits a display name into base name and trailing Korean job title, if any. */
export function splitTitle(name) {
  let base = String(name ?? '').replace(/\(.*?\)/gu, '').trim();
  let title = '';
  const match = base.match(TITLE);
  if (match && base.length > match[1].length + 1) {
    title = match[1];
    base = base.replace(TITLE, '').trim();
  }
  return { base, title };
}

/** Strips reply/forward/remind prefixes and collapses whitespace, for thread grouping. */
export function normalizeSubject(subject) {
  return String(subject ?? '')
    .replace(/^\s*((re|fw|fwd|답장|전달|회신|re-?mind|remind)\s*[:：]\s*|\[\s*re-?mind\s*\]\s*)+/giu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function threadKey(subject) {
  return `th_${createHash('sha256').update(normalizeSubject(subject)).digest('hex').slice(0, 12)}`;
}

function cell(value) {
  const text = value === null || value === undefined ? '' : String(value).replace(/\r?\n/gu, ' ');
  return /[",]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/** UTF-8 BOM + CRLF CSV, Excel- and machine-readable alike (one copy, per Owner decision). */
export function encodeCsv(headers, rows) {
  return `﻿${[headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/**
 * Decodes CSV text written by `encodeCsv` (BOM, CRLF, `"` quoting with `""` escape,
 * embedded newlines already flattened to spaces by `cell()`) back into
 * `{ headers, rows }`. Used by `refresh.mjs` to read an existing ledger before
 * preserving its Owner-entered columns -- not a general-purpose CSV parser.
 */
export function decodeCsv(text) {
  const source = String(text ?? '').replace(/^﻿/u, '');
  const records = [];
  let record = [], field = '', inQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index += 1; } else { inQuotes = false; }
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; }
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\r') { /* consumed alongside the following \n */ }
    else if (char === '\n') { record.push(field); records.push(record); record = []; field = ''; }
    else field += char;
  }
  if (field !== '' || record.length > 0) { record.push(field); records.push(record); }
  const [headers, ...rows] = records;
  return { headers: headers ?? [], rows };
}

export function domainOf(email) {
  return String(email ?? '').split('@')[1] ?? '';
}

/** Builds `{ ourDomain, familyOf, orgOf }` lookups from an org config (see examples/org_config.example.json). */
export function makeOrgLookup(orgConfig) {
  const organisations = orgConfig?.organisations ?? {};
  const family = orgConfig?.family ?? {};
  const ourDomain = orgConfig?.our_domain ?? '';
  const familyOf = email => family[domainOf(email)] ?? domainOf(email);
  const orgOf = email => organisations[domainOf(email)] ?? domainOf(email);
  return { ourDomain, familyOf, orgOf };
}

// ---------------------------------------------------------------- 023 연락처_장부.csv
export const CONTACTS_HEADERS = Object.freeze(['프로젝트코드', '구분', '이름', '직급', '소속', '메일', '다른메일',
  '발신수', '수신수', '참조수', '처음등장', '마지막등장', '과제내역할(Owner기입)', '다른과제에도등장', '비고']);

/**
 * Person merge rules (Owner 2026-09-21): aggregate by address first, then merge
 * addresses that carry the same best (Korean-first, most-used) display name within
 * one organisation family (a company rename keeps the person); the same local-part
 * within a family also merges even without a display name on one side (a mailbox
 * keeps its local part through a rename). A title is split off into its own column.
 * Different organisations never auto-merge -- `비고` flags a same-name namesake as
 * "동일인 확인 필요".
 */
export function buildContacts({ code, mails, orgConfig, presenceByEmail = new Map() }) {
  const { ourDomain, familyOf, orgOf } = makeOrgLookup(orgConfig);
  const byEmail = new Map();
  const add = (person, role, at) => {
    if (!person) return;
    const { base, title } = splitTitle(person.name);
    const record = byEmail.get(person.email) ?? { email: person.email, names: new Map(), title: '', titleAt: '', from: 0, to: 0, cc: 0, first: at, last: at };
    if (base) record.names.set(base, (record.names.get(base) ?? 0) + 1);
    if (title && at >= record.titleAt) { record.title = title; record.titleAt = at; }
    record[role] += 1;
    if (at < record.first) record.first = at;
    if (at > record.last) record.last = at;
    byEmail.set(person.email, record);
  };
  for (const mail of mails) {
    add(mail.from, 'from', mail.at);
    for (const person of mail.to) add(person, 'to', mail.at);
    for (const person of mail.cc) add(person, 'cc', mail.at);
  }
  const bestName = record => [...record.names]
    .sort((x, y) => (/[가-힣]/u.test(y[0]) ? 1 : 0) - (/[가-힣]/u.test(x[0]) ? 1 : 0) || y[1] - x[1])[0]?.[0] ?? '';
  const localFamily = email => `${email.split('@')[0]}@${familyOf(email)}`;
  const nameByLocal = new Map();
  for (const record of byEmail.values()) {
    const name = bestName(record);
    if (name && !nameByLocal.has(localFamily(record.email))) nameByLocal.set(localFamily(record.email), name);
  }
  const people = new Map();
  for (const record of byEmail.values()) {
    const name = bestName(record) || (nameByLocal.get(localFamily(record.email)) ?? '');
    const key = name ? `${name}@${familyOf(record.email)}` : record.email;
    const group = people.get(key) ?? { key, name, title: '', titleAt: '', emails: new Map(), from: 0, to: 0, cc: 0, first: record.first, last: record.last };
    if (record.title && record.titleAt >= group.titleAt) { group.title = record.title; group.titleAt = record.titleAt; }
    group.emails.set(record.email, record.last);
    group.from += record.from; group.to += record.to; group.cc += record.cc;
    if (record.first < group.first) group.first = record.first;
    if (record.last > group.last) group.last = record.last;
    people.set(key, group);
  }
  const nameCount = new Map();
  for (const group of people.values()) if (group.name) nameCount.set(group.name, (nameCount.get(group.name) ?? 0) + 1);
  const rows = [...people.values()].map(group => {
    const emails = [...group.emails].sort((a, b) => b[1].localeCompare(a[1])).map(entry => entry[0]);
    return { ...group, email: emails[0], others: emails.slice(1), total: group.from + group.to + group.cc };
  }).filter(row => row.total >= 2 || row.from >= 1)
    .sort((a, b) => (domainOf(a.email) === ourDomain ? 0 : 1) - (domainOf(b.email) === ourDomain ? 0 : 1) || b.total - a.total);
  const noteOf = row => [
    row.others.some(email => familyOf(email) === familyOf(row.email) && domainOf(email) !== domainOf(row.email)) ? '회사명·도메인 변경 전 주소 포함' : '',
    (nameCount.get(row.name) ?? 0) > 1 ? '같은 이름이 다른 소속으로도 있음 — 동일인 확인 필요' : '',
  ].filter(Boolean).join(' / ');
  const csvRows = rows.map(row => [code, domainOf(row.email) === ourDomain ? '사내' : '외부', row.name, row.title, orgOf(row.email),
    row.email, row.others.join(' '), row.from, row.to, row.cc, row.first.slice(0, 10), row.last.slice(0, 10), '',
    [...new Set([row.email, ...row.others].flatMap(email => [...(presenceByEmail.get(email) ?? [])]))].filter(c => c !== code).join(' '),
    noteOf(row)]);
  return { headers: CONTACTS_HEADERS, rows: csvRows, records: rows, keyOf: row => row[5] /* 메일 */ };
}

// -------------------------------------------------------- 027 메일_수신/발송이력.csv
export const HISTORY_HEADERS = Object.freeze(['이력키', '스키마버전', '발생시각', '프로젝트코드', '단계', '이벤트유형', '메일소스ID',
  '메일수신시각', '메일함', '스레드', '제목', '발신자', '발신자메일', '발신자소속', '수신자', '참조', '첨부수', '작업상태', '적용규칙', '규칙판', '원문복사여부']);

export function historyKey(code, direction, id) {
  return createHash('sha256').update([code, direction, id].join('|')).digest('hex').slice(0, 16);
}

// `발생시각` intentionally mirrors `mail.at` (메일수신시각), not a per-refresh-run
// "now": a refresh is called repeatedly against the same custody, and a row whose own
// content has not changed must encode to the same bytes on every run (refresh.mjs's
// "archive to history only when content changed" contract depends on this). A
// generation-time stamp that changed on every call would mark every history row
// "changed" on every refresh regardless of custody, which defeats that contract.
function buildHistoryRow({ code, mail, direction, ruleVersion, label, orgOf }) {
  return [historyKey(code, direction, mail.event_id), LEDGER_SCHEMA, mail.at, code, '',
    direction === 'sent' ? '메일발송' : '메일수신', mail.event_id, mail.at, mail.source, threadKey(mail.subject), mail.subject,
    mail.from?.name ?? '', mail.from?.email ?? '', mail.from ? orgOf(mail.from.email) : '',
    mail.to.map(person => person.email).join(' '), mail.cc.map(person => person.email).join(' '),
    mail.attachment_count, '', label, ruleVersion, 'false'];
}

/** `mails` are project-attributed events carrying `direction` ('received'|'sent') and `label` (matched trigger). */
export function buildHistory({ code, mails, orgConfig, ruleVersion }) {
  const { orgOf } = makeOrgLookup(orgConfig);
  const received = mails.filter(mail => mail.direction === 'received');
  const sent = mails.filter(mail => mail.direction === 'sent');
  const row = mail => buildHistoryRow({ code, mail, direction: mail.direction, ruleVersion, label: mail.label, orgOf });
  return {
    headers: HISTORY_HEADERS,
    received: { rows: received.map(row), count: received.length },
    sent: { rows: sent.map(row), count: sent.length },
    keyOf: row => row[0] /* 이력키 */,
  };
}

// ---------------------------------------------------------------- 027 회신_현황.csv
export const REPLY_HEADERS = Object.freeze(['프로젝트코드', '구분', '마지막메일일', '지난날', '제목', '마지막발신자', '발신자소속',
  '묶음메일수', '묶음시작일', '스레드', '처리상태(Owner기입)', '메모']);

/** 답필요 (we owe a reply) / 회신대기 (waiting on their reply), grouped by normalised-subject thread. */
export function buildReplyStatus({ code, mails, orgConfig, now }) {
  const { ourDomain, orgOf } = makeOrgLookup(orgConfig);
  const threads = new Map();
  for (const mail of mails) {
    const key = threadKey(mail.subject);
    (threads.get(key) ?? threads.set(key, []).get(key)).push(mail);
  }
  const days = at => Math.floor((Date.parse(now) - Date.parse(at)) / 86400000);
  const rows = [];
  for (const [key, group] of threads) {
    const external = group.some(mail => [mail.from, ...mail.to, ...mail.cc].filter(Boolean).some(person => domainOf(person.email) !== ourDomain));
    if (!external) continue;
    const last = group[group.length - 1];
    const kind = last.direction === 'received' && last.from && domainOf(last.from.email) !== ourDomain ? '답필요'
      : last.direction === 'sent' ? '회신대기' : null;
    if (kind === null) continue;
    rows.push([code, kind, last.at.slice(0, 10), days(last.at), last.subject, last.from?.name ?? '',
      last.from ? orgOf(last.from.email) : '', group.length, group[0].at.slice(0, 10), key, '', '']);
  }
  rows.sort((a, b) => (a[1] === b[1] ? String(b[2]).localeCompare(String(a[2])) : a[1] === '답필요' ? -1 : 1));
  return { headers: REPLY_HEADERS, rows, keyOf: row => row[9] /* 스레드 */ };
}
