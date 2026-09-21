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

/** `Map(메일소스ID -> { level, target, why, reader, readAt, ownerConfirmed })`. A later row for the same id overwrites an earlier one (last write wins, matching a plain CSV append-then-edit history). */
export function buildReadingTable(rows) {
  const map = new Map();
  for (const row of rows) {
    const id = row['메일소스ID'];
    if (!id) continue;
    map.set(id, {
      id, receivedAt: row['수신일'] ?? '', subject: row['제목'] ?? '', level: row['결정'] ?? '',
      target: row['과제_또는_분류'] ?? '', why: row['이유'] ?? '', reader: row['판독자'] ?? '',
      readAt: row['판독일'] ?? '', ownerConfirmed: row['Owner확인'] ?? '',
    });
  }
  return map;
}

/** Array of non-empty 태그 strings. */
export function buildWorkTagTable(rows) {
  return rows.map(row => String(row['태그'] ?? '').trim()).filter(Boolean);
}

/**
 * `Map(lowercased domain-or-address -> { name, kind, memo })`. The 도메인 column may
 * hold either a bare domain or a full address (spec section 2's own description of
 * this column, not a different header text -- coordinator correction 2026-09-21: the
 * real Owner table's header is the plain `도메인`) -- both are valid lookup keys,
 * matched against a mail's own domains/addresses (`vendorsOfMail` in
 * `common_classifier.mjs`) the same way.
 */
export function buildVendorTable(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row['도메인'] ?? '').trim().toLowerCase();
    if (!key) continue;
    map.set(key, { key, name: row['거래처명'] ?? '', kind: row['구분'] ?? '', memo: row['메모'] ?? '' });
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
  return {
    bundles: bundleResult.ok ? buildBundleTable(bundleResult.rows) : [],
    vendors: vendorResult.ok ? buildVendorTable(vendorResult.rows) : new Map(),
    readings: readingResult.ok ? buildReadingTable(readingResult.rows) : new Map(),
    workTags: workTagResult.ok ? buildWorkTagTable(workTagResult.rows) : [],
    failures,
  };
}
