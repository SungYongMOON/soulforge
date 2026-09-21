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

/** Strips reply/forward/remind/read-receipt prefixes and collapses whitespace, for thread grouping. */
export function normalizeSubject(subject) {
  return String(subject ?? '')
    .replace(/^\s*((re|fw|fwd|답장|전달|회신|읽음|read|re-?mind|remind)\s*[:：]\s*|\[\s*re-?mind\s*\]\s*)+/giu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function threadKey(subject) {
  return `th_${createHash('sha256').update(normalizeSubject(subject)).digest('hex').slice(0, 12)}`;
}

// R1: CSV/formula injection guard. A cell whose content -- after any leading spaces
// or tabs -- starts with `=`, `+`, `-` or `@` is a formula trigger in Excel/Sheets/
// LibreOffice (`=cmd|' /C calc'!A0`, a `+82-10...` phone number, a `-5` negative
// figure, an `@name` mention). Every such cell is guarded with a single leading `'`,
// which every one of those applications renders as literal text. `decodeCsv` strips
// exactly that single guard back off on the way in, so a preserved Owner-entered cell
// round-trips unchanged. A genuine value that itself started with `'=...` (a real
// leading apostrophe immediately followed by a trigger character) is indistinguishable
// from a guarded one and is accepted as guarded -- a deliberately rare, documented
// edge case, not a data-loss risk (the apostrophe was already there to say "treat as
// text" in the spreadsheet sense).
const FORMULA_TRIGGER = /^[ \t]*[=+\-@]/u;
const guardFormula = text => (FORMULA_TRIGGER.test(text) ? `'${text}` : text);
const unguardFormula = text => (text.startsWith("'") && FORMULA_TRIGGER.test(text.slice(1)) ? text.slice(1) : text);

// S8 (fresh-review-2): an embedded newline in a cell -- most often a soft-wrapped
// Owner note typed in Excel -- used to be flattened to a space unconditionally, which
// silently lost it on the very next refresh (decodeCsv reads a quoted embedded
// newline back correctly; encodeCsv was the lossy side). CRLF is normalised to LF so
// the row's own `\r\n` separator can never be ambiguous with an in-cell line break,
// but the line break itself is kept -- RFC4180 quoting (below) already handles an
// embedded newline exactly like it handles an embedded comma or quote.
function cell(value) {
  const text = value === null || value === undefined ? '' : String(value).replace(/\r\n?/gu, '\n');
  const guarded = guardFormula(text);
  return /[",\n]/u.test(guarded) ? `"${guarded.replace(/"/gu, '""')}"` : guarded;
}

// fresh-review-5 #1: written as `String.fromCharCode(0xFEFF)`, not a raw BOM
// character embedded in this source file -- a byte-hygiene scan over this module's
// tracked *source* (tests/byte_hygiene.test.mjs) treats U+FEFF as a problem the same
// way it treats a stray zero-width space, since either one is invisible in an editor
// and in a diff. Writing it this way means the scanner never needs a special-case
// allow-list for these two intentional spots -- there is simply no raw U+FEFF byte
// anywhere in this module's source to find. The two CSV BOM bytes this module
// actually WRITES into ledger files (data, not source) are unaffected.
const CSV_BOM = String.fromCharCode(0xFEFF);

/** UTF-8 BOM + CRLF CSV, Excel- and machine-readable alike (one copy, per Owner decision). */
export function encodeCsv(headers, rows) {
  return `${CSV_BOM}${[headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/**
 * Decodes CSV text written by `encodeCsv` (BOM, CRLF, `"` quoting with `""` escape,
 * an embedded newline kept and quoted rather than flattened -- see `cell()` above --
 * formula-injection guard stripped by `unguardFormula`) back into `{ headers, rows }`.
 * Used by `refresh.mjs` to read an existing ledger before preserving its Owner-entered
 * columns -- not a general-purpose CSV parser.
 */
export function decodeCsv(text) {
  const raw = String(text ?? '');
  const source = raw.startsWith(CSV_BOM) ? raw.slice(CSV_BOM.length) : raw;
  const records = [];
  let record = [], field = '', inQuotes = false;
  const pushField = () => { record.push(unguardFormula(field)); field = ''; };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index += 1; } else { inQuotes = false; }
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; }
    else if (char === ',') { pushField(); }
    else if (char === '\r') { /* consumed alongside the following \n */ }
    else if (char === '\n') { pushField(); records.push(record); record = []; }
    else field += char;
  }
  if (field !== '' || record.length > 0) { pushField(); records.push(record); }
  // fresh-review-6 #3: a trailing blank line (one extra CRLF/LF at the end of a file --
  // easy for an Owner to add by hand in Excel/a text editor, or for a save to leave
  // behind) parses as one extra all-empty record: a single field that is the empty
  // string. That is not a row -- there is no comma-separated content on that line at
  // all -- but without this trim it fails the row-shape check downstream (its length,
  // 1, never matches the header count) and blocks the whole ledger. Multiple trailing
  // blank lines are trimmed the same way; a genuine data row is never a single empty
  // field (every header row in this module has more than one column).
  while (records.length > 0) {
    const last = records[records.length - 1];
    if (last.length === 1 && last[0] === '') records.pop();
    else break;
  }
  const [headers, ...rows] = records;
  return { headers: headers ?? [], rows };
}

export function domainOf(email) {
  return String(email ?? '').split('@')[1] ?? '';
}

// S12: `mail_events.mjs` normalises every `at` to a UTC instant on read; display
// dates (처음등장/마지막등장/마지막메일일) are Asia/Seoul calendar dates derived from
// that instant, not a raw UTC slice -- Seoul is a fixed UTC+9 offset with no DST, so a
// plain millisecond shift is exact.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
export function seoulDateOf(isoInstant) {
  const parsed = Date.parse(isoInstant);
  if (Number.isNaN(parsed)) return String(isoInstant ?? '').slice(0, 10);
  return new Date(parsed + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
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
  // S8: the plain-frequency winner, without the Korean-first tiebreak `bestName` uses.
  // Two different addresses can each carry a rare/minority spelling that happens to be
  // identical (e.g. an initials-only signature) while their own *dominant* spelling
  // differs -- that coincidence is exactly the risky merge `noteOf` below flags.
  const dominantName = record => [...record.names].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
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
    const group = people.get(key) ?? { key, name, title: '', titleAt: '', emails: new Map(), from: 0, to: 0, cc: 0, first: record.first, last: record.last, offDominantEmails: new Set() };
    if (record.title && record.titleAt >= group.titleAt) { group.title = record.title; group.titleAt = record.titleAt; }
    group.emails.set(record.email, record.last);
    group.from += record.from; group.to += record.to; group.cc += record.cc;
    if (record.first < group.first) group.first = record.first;
    if (record.last > group.last) group.last = record.last;
    const recordDominant = dominantName(record);
    if (name && recordDominant && recordDominant !== name) group.offDominantEmails.add(record.email);
    people.set(key, group);
  }
  const nameCount = new Map();
  for (const group of people.values()) if (group.name) nameCount.set(group.name, (nameCount.get(group.name) ?? 0) + 1);
  const rows = [...people.values()].map(group => {
    const emails = [...group.emails].sort((a, b) => b[1].localeCompare(a[1])).map(entry => entry[0]);
    return { ...group, email: emails[0], others: emails.slice(1), total: group.from + group.to + group.cc };
  }).filter(row => row.total >= 2 || row.from >= 1)
    .sort((a, b) => (domainOf(a.email) === ourDomain ? 0 : 1) - (domainOf(b.email) === ourDomain ? 0 : 1) || b.total - a.total);
  // S8: a merged person pooling >=2 addresses whose local parts differ (so the merge
  // did not come from the safe "same local-part through a rename" path) where at least
  // one pooled address's own dominant spelling disagrees with the merged name is an
  // intra-family namesake risk, not a confirmed rename -- flagged, never un-merged.
  const localPartsOf = row => new Set([row.email, ...row.others].map(email => email.split('@')[0]));
  const noteOf = row => [
    row.others.some(email => familyOf(email) === familyOf(row.email) && domainOf(email) !== domainOf(row.email)) ? '회사명·도메인 변경 전 주소 포함' : '',
    (nameCount.get(row.name) ?? 0) > 1 ? '같은 이름이 다른 소속으로도 있음 — 동일인 확인 필요' : '',
    (row.offDominantEmails.size > 0 && localPartsOf(row).size > 1) ? '같은 이름·같은 조직의 다른 주소 — 동일인 확인 필요' : '',
  ].filter(Boolean).join(' / ');
  const csvRows = rows.map(row => [code, domainOf(row.email) === ourDomain ? '사내' : '외부', row.name, row.title, orgOf(row.email),
    row.email, row.others.join(' '), row.from, row.to, row.cc, seoulDateOf(row.first), seoulDateOf(row.last), '',
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
    rows.push([code, kind, seoulDateOf(last.at), days(last.at), last.subject, last.from?.name ?? '',
      last.from ? orgOf(last.from.email) : '', group.length, seoulDateOf(group[0].at), key, '', '']);
  }
  rows.sort((a, b) => (a[1] === b[1] ? String(b[2]).localeCompare(String(a[2])) : a[1] === '답필요' ? -1 : 1));
  return { headers: REPLY_HEADERS, rows, keyOf: row => row[9] /* 스레드 */ };
}
