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

export const BUNDLE_HEADERS = Object.freeze(['제목구절', '과제', '근거', '확정일']);
export const READING_HEADERS = Object.freeze(['메일소스ID', '수신일', '제목', '결정', '과제_또는_분류', '이유', '판독자', '판독일', 'Owner확인']);
export const WORKTAG_HEADERS = Object.freeze(['태그', '설명']);
export const VENDOR_HEADERS = Object.freeze(['도메인', '거래처명', '구분', '메모']);

export const READING_LEVELS = Object.freeze(['include', 'include_with_review', 'exclude', 'vendor_only', 'hold_owner_review']);

const REPLACEMENT_CHARACTER = '�';

/**
 * Reads and strictly validates one Owner table CSV against its expected header.
 * Returns `{ present: false }` when the file does not exist or has zero data rows
 * (spec: "표가 없거나 비어 있으면 그 단계는 건너뛴다" -- skip, not fail); `{ present:
 * true, ok: false, code }` on a header/encoding mismatch (fail-closed for this table
 * only); `{ present: true, ok: true, rows }` (array of plain objects keyed by header)
 * otherwise.
 */
export function readOwnerTable(filePath, expectedHeaders) {
  let rawText;
  try { rawText = readFileSync(filePath, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return { present: false }; return { present: true, ok: false, code: 'workspace_ledgers_owner_table_unreadable' }; }
  if (rawText.trim() === '') return { present: false };
  if (rawText.includes(REPLACEMENT_CHARACTER)) return { present: true, ok: false, code: 'workspace_ledgers_owner_table_encoding' };
  const decoded = decodeCsv(rawText);
  if (JSON.stringify(decoded.headers) !== JSON.stringify(expectedHeaders)) {
    return { present: true, ok: false, code: 'workspace_ledgers_owner_table_header_mismatch' };
  }
  if (decoded.rows.some(row => row.length !== expectedHeaders.length)) {
    return { present: true, ok: false, code: 'workspace_ledgers_owner_table_row_shape' };
  }
  if (decoded.rows.length === 0) return { present: false };
  const rows = decoded.rows.map(row => Object.fromEntries(expectedHeaders.map((header, index) => [header, row[index] ?? ''])));
  return { present: true, ok: true, rows };
}

/** `{ phrase: lowercased 제목구절, codes: [project_code,...], why }`, entries with an empty phrase or no codes dropped. */
export function buildBundleTable(rows) {
  return rows.map(row => ({
    phrase: String(row['제목구절'] ?? '').toLowerCase(),
    codes: String(row['과제'] ?? '').split(';').map(code => code.trim()).filter(Boolean),
    why: row['근거'] ?? '',
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
  const bundleResult = load(bundleTablePath, BUNDLE_HEADERS, '묶음_확정표.csv');
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
