// Reads the four Owner-editable tables under the common folder's
// `020_MGMT/021_자동화설정_운영규칙/` and `023_연락처_이해관계자/` (spec section 2 of
// `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`). This module only ever READS these
// tables -- writing/editing them is the Owner's own job, done by hand in the CSV
// (`묶음_확정표.csv`, `작업태그_목록.csv`, `거래처_대응표.csv`) or, for
// `판독_결정표.csv` specifically, via `triage.mjs`'s `appendReadingDecision` (the one
// exception, since that table is meant to accumulate AI/Owner reading decisions one
// row at a time -- see spec section 7).
//
// Fail-closed per table (spec section 2): a table that is missing or has zero data
// rows is simply skipped (that classification step contributes nothing -- never an
// error); a table whose header or encoding is wrong is reported as a failure for THAT
// table only (never thrown) so every other table, and every other classification step,
// still runs normally.
import { readFileSync } from 'node:fs';
import { decodeCsv } from './ledgers.mjs';

// A2 item 1 (2026-09-21 night addition): the real 묶음_확정표.csv now carries a 5th
// column, `적용끝` (YYYY-MM-DD, may be blank) -- Owner: the same title-phrase/vendor
// may take on different, unrelated work later, so a bundle confirmation is scoped to
// "this particular episode", not a standing rule (external review: a bundle is the
// set of mails from that one event, not a general rule). `BUNDLE_HEADERS` (4 columns)
// is kept as the LEGACY shape a table saved before this change still has --
// `readOwnerTable` accepts either shape (see its own doc) so a file with no 적용끝
// column at all still loads, meaning "applies indefinitely" (spec: "열이 없으면
// 무기한").
export const BUNDLE_HEADERS = Object.freeze(['제목구절', '과제', '근거', '확정일']);
export const BUNDLE_HEADERS_V2 = Object.freeze(['제목구절', '과제', '근거', '확정일', '적용끝']);
export const READING_HEADERS = Object.freeze(['메일소스ID', '수신일', '제목', '결정', '과제_또는_분류', '이유', '판독자', '판독일', 'Owner확인']);
export const WORKTAG_HEADERS = Object.freeze(['태그', '설명']);
export const VENDOR_HEADERS = Object.freeze(['도메인', '거래처명', '구분', '메모']);

export const READING_LEVELS = Object.freeze(['include', 'include_with_review', 'exclude', 'vendor_only', 'hold_owner_review']);

const REPLACEMENT_CHARACTER = '�';

// S4 (coordinator, fresh review round 2): `적용끝` must be a real calendar date in
// YYYY-MM-DD shape, not merely digits-and-dashes -- "2026-13-40" is shape-valid but
// not a real date, and a broken/garbage value must never be silently treated as "no
// cutoff" (unlimited) or compared lexically against a mail's own date (which can give
// a wrong yes/no answer that looks like a correct one). `Date.UTC` normalises an
// out-of-range month/day (rolling June 31 into July 1, say) rather than rejecting it,
// so the round-trip check below is what actually catches that shape.
const CALENDAR_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;
export function isValidCalendarDateString(value) {
  if (typeof value !== 'string' || !CALENDAR_DATE_SHAPE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Reads and strictly validates one Owner table CSV against its expected header.
 * `expectedHeaders` is normally a single header array (unchanged for the vendor/
 * reading/work-tag tables); the bundle table (A2 item 1) instead passes an ARRAY OF
 * header arrays (tried in order, first exact match wins) so a file written under the
 * new 5-column shape (with `적용끝`) and a file still written under the legacy
 * 4-column shape both load, each validated against its own matching column count for
 * the row-shape check below.
 *
 * Returns `{ present: false }` when the file does not exist or has zero data rows
 * (spec: "표가 없거나 비어 있으면 그 단계는 건너뛴다" -- skip, not fail); `{ present:
 * true, ok: false, code }` on a header/encoding mismatch (fail-closed for this table
 * only, matching NEITHER variant when more than one is offered); `{ present: true,
 * ok: true, rows }` (array of plain objects keyed by header) otherwise.
 */
export function readOwnerTable(filePath, expectedHeaders) {
  let rawText;
  try { rawText = readFileSync(filePath, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return { present: false }; return { present: true, ok: false, code: 'workspace_ledgers_owner_table_unreadable' }; }
  if (rawText.trim() === '') return { present: false };
  if (rawText.includes(REPLACEMENT_CHARACTER)) return { present: true, ok: false, code: 'workspace_ledgers_owner_table_encoding' };
  const decoded = decodeCsv(rawText);
  const variants = Array.isArray(expectedHeaders[0]) ? expectedHeaders : [expectedHeaders];
  const matchedHeaders = variants.find(variant => JSON.stringify(decoded.headers) === JSON.stringify(variant));
  if (!matchedHeaders) return { present: true, ok: false, code: 'workspace_ledgers_owner_table_header_mismatch' };
  if (decoded.rows.some(row => row.length !== matchedHeaders.length)) {
    return { present: true, ok: false, code: 'workspace_ledgers_owner_table_row_shape' };
  }
  if (decoded.rows.length === 0) return { present: false };
  const rows = decoded.rows.map(row => Object.fromEntries(matchedHeaders.map((header, index) => [header, row[index] ?? ''])));
  return { present: true, ok: true, rows };
}

/**
 * `{ phrase: lowercased 제목구절, codes: [project_code,...], why, appliesUntil }`,
 * entries with an empty phrase or no codes dropped. A2 item 1: `appliesUntil` is the
 * (trimmed) `적용끝` cell -- `null` when the column is absent (a legacy 4-column
 * table -- `row['적용끝']` is simply `undefined` on the row object) or blank, meaning
 * "applies indefinitely" either way (spec: "값이 있으면 그 날짜 이후에 받은 메일에는
 * 적용하지 않는다" / "열이 없으면 무기한"). The actual cutoff comparison against a
 * mail's own receipt date lives in `common_classifier.mjs`'s `classifyByOwnerTables`
 * (the one place bundle matching happens), not here -- this module only parses the
 * table.
 */
export function buildBundleTable(rows) {
  return rows.map(row => ({
    phrase: String(row['제목구절'] ?? '').toLowerCase(),
    codes: String(row['과제'] ?? '').split(';').map(code => code.trim()).filter(Boolean),
    why: row['근거'] ?? '',
    appliesUntil: typeof row['적용끝'] === 'string' && row['적용끝'].trim() !== '' ? row['적용끝'].trim() : null,
  })).filter(entry => entry.phrase && entry.codes.length > 0);
}

// S9 (fresh non-author review, 2026-09-21): a hand-typed 결정 value in the wrong case
// (e.g. "Include", "EXCLUDE") is normalised to its canonical lowercase form here, the
// one place every downstream consumer (`classifyProjectHits`'s level switch) reads it
// from. A value that is neither a case-only variant nor an exact match of any
// recognised level is kept AS TYPED (matching every other case `classifyProjectHits`'s
// generic reading branch already treats as "not a routing decision" -- the mail stays
// in the triage queue either way, per R1) but counted, so it is visible in the receipt
// instead of silently blending in with a genuine `hold_owner_review`.
const LOWERCASE_TO_CANONICAL_LEVEL = new Map(READING_LEVELS.map(level => [level.toLowerCase(), level]));

/**
 * `Map(메일소스ID -> { level, target, why, reader, readAt, ownerConfirmed })`. A later
 * row for the same id overwrites an earlier one (last write wins, matching a plain CSV
 * append-then-edit history). The returned Map also carries an `invalidLevelCount`
 * property (S9) -- the number of rows whose 결정 value was neither empty nor a
 * recognised level (case-insensitively).
 */
export function buildReadingTable(rows) {
  const map = new Map();
  let invalidLevelCount = 0;
  for (const row of rows) {
    const id = row['메일소스ID'];
    if (!id) continue;
    const rawLevel = String(row['결정'] ?? '');
    const canonical = LOWERCASE_TO_CANONICAL_LEVEL.get(rawLevel.trim().toLowerCase());
    if (!canonical && rawLevel.trim() !== '') invalidLevelCount += 1;
    map.set(id, {
      id, receivedAt: row['수신일'] ?? '', subject: row['제목'] ?? '', level: canonical ?? rawLevel,
      target: row['과제_또는_분류'] ?? '', why: row['이유'] ?? '', reader: row['판독자'] ?? '',
      readAt: row['판독일'] ?? '', ownerConfirmed: row['Owner확인'] ?? '',
    });
  }
  map.invalidLevelCount = invalidLevelCount;
  return map;
}

/**
 * Array of non-empty 태그 strings, normalised to Unicode NFC (required-review item 2,
 * 2026-09-21): composed vs decomposed Hangul (routine after a macOS paste) must not
 * produce two different-looking tags that are really the same one -- `workTagFileName`
 * and `workTagsOf`'s `[태그]` subject match both run on this already-normalised form,
 * so grouping, the file name, and the row key all agree. NIT 11: a whitespace-only tag
 * (indistinguishable from "no tag" once trimmed) is dropped, not kept as an empty one.
 */
export function buildWorkTagTable(rows) {
  return rows.map(row => String(row['태그'] ?? '').normalize('NFC').trim()).filter(Boolean);
}

/**
 * `Map(lowercased domain-or-address -> { name, kind, memo })`. The 도메인 column may
 * hold either a bare domain or a full address (spec section 2's own description of
 * this column, not a different header text -- coordinator correction 2026-09-21: the
 * real Owner table's header is the plain `도메인`) -- both are valid lookup keys,
 * matched against a mail's own domains/addresses (`vendorsOfMail` in
 * `common_classifier.mjs`) the same way.
 *
 * Required-review item 2 (2026-09-21): `거래처명` is normalised to Unicode NFC here,
 * the one place every downstream consumer (vendor grouping/dedup by name in
 * `vendorsOfAddresses`, `vendorFileName`, the row key, the case-insensitive collision
 * check) reads it from -- two rows naming "the same" organisation under different
 * Unicode compositions (composed vs decomposed Hangul, routine after a macOS paste)
 * become byte-identical strings after this normalisation and are therefore already
 * treated as one organisation by every later `Map`/`Set` keyed on the name, without
 * needing a separate merge step. NIT 11: a row whose name is empty/whitespace-only
 * after normalising is dropped -- it identifies no organisation to file anything under.
 */
export function buildVendorTable(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row['도메인'] ?? '').trim().toLowerCase();
    if (!key) continue;
    const name = String(row['거래처명'] ?? '').normalize('NFC').trim();
    if (!name) continue;
    map.set(key, { key, name, kind: row['구분'] ?? '', memo: row['메모'] ?? '' });
  }
  return map;
}

/**
 * Loads all four tables from explicit paths (never inferred). Any path may be `null`/
 * `undefined` -- that table is treated as absent (skip). `failures` lists `{ table,
 * code }` for each table that failed strict validation; the corresponding
 * bundles/vendors/readings/workTags entry for a failed table is empty (not partially
 * populated), so a caller never classifies against a half-parsed table.
 */
export function loadOwnerTables({ bundleTablePath = null, vendorTablePath = null, readingTablePath = null, workTagTablePath = null } = {}) {
  const failures = [];
  const load = (filePath, headers, table) => {
    if (!filePath) return { present: false };
    const result = readOwnerTable(filePath, headers);
    if (result.present && !result.ok) failures.push({ table, code: result.code });
    return result;
  };
  // A2 item 1: try the current 5-column shape first, fall back to the legacy 4-column
  // shape -- `readOwnerTable` matches whichever the file's own header row actually is.
  let bundleResult = load(bundleTablePath, [BUNDLE_HEADERS_V2, BUNDLE_HEADERS], '묶음_확정표.csv');
  // S4 (coordinator, fresh review round 2): a `적용끝` cell present (5-column shape
  // only -- `'적용끝' in row` is `false` for every row under the legacy 4-column
  // shape) but not a real YYYY-MM-DD calendar date fails the WHOLE bundle table
  // closed, the same as a header/encoding/row-shape problem -- never silently
  // ignored per-row (which would look identical to a genuine blank cell, "applies
  // indefinitely") and never compared as if it were a valid date anyway.
  if (bundleResult.ok) {
    const badRow = bundleResult.rows.find(row => '적용끝' in row && row['적용끝'].trim() !== '' && !isValidCalendarDateString(row['적용끝'].trim()));
    if (badRow) {
      bundleResult = { present: true, ok: false, code: 'workspace_ledgers_owner_table_bundle_apply_until_invalid' };
      failures.push({ table: '묶음_확정표.csv', code: bundleResult.code });
    }
  }
  const vendorResult = load(vendorTablePath, VENDOR_HEADERS, '거래처_대응표.csv');
  const readingResult = load(readingTablePath, READING_HEADERS, '판독_결정표.csv');
  const workTagResult = load(workTagTablePath, WORKTAG_HEADERS, '작업태그_목록.csv');
  const readings = readingResult.ok ? buildReadingTable(readingResult.rows) : new Map();
  return {
    bundles: bundleResult.ok ? buildBundleTable(bundleResult.rows) : [],
    vendors: vendorResult.ok ? buildVendorTable(vendorResult.rows) : new Map(),
    readings,
    workTags: workTagResult.ok ? buildWorkTagTable(workTagResult.rows) : [],
    failures,
    // S9: surfaced separately from `failures` -- an invalid 결정 value degrades that
    // ONE row (it behaves like hold_owner_review, per `classifyProjectHits`'s generic
    // reading branch -- the mail stays in the triage queue either way), it does not
    // fail the whole table the way a header/encoding/shape problem does.
    invalidDecisionLevels: readings.invalidLevelCount ?? 0,
  };
}
