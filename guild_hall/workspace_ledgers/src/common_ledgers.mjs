// CSV row/header shaping for the common-folder ledgers (spec section 3 of
// `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`): the primary-bucket files
// (시스템알림_<원천>.csv, 사내행정.csv, 외부안내.csv, 과제외_<분류>.csv,
// 과제코드대기.csv, 과제없음_확인함.csv, 미분류.csv, 보류.csv), the general-work
// ledger (일반업무_메일.csv, a separate folder), and the secondary vendor/work-tag
// view ledgers (거래처_<이름>.csv, 작업_<태그>.csv). Pure data shaping only --
// `common_refresh.mjs` owns routing a classified mail to the right file name and
// actually writing it (via `refresh.mjs`'s exported `writeLedgerCsv`, so every new
// ledger gets the same Owner-column-preserve/fail-closed/history/receipt contract the
// four per-project ledgers already have).
import { createHash } from 'node:crypto';
import path from 'node:path';

export const COMMON_LEDGER_SCHEMA = 'soulforge.workspace_common_ledger_csv.v1';

const BASE_HEADERS = Object.freeze(['이력키', '분류', '수신시각', '제목', '발신자', '발신자메일', '첨부수', '메일소스ID', '원문복사여부', '메모']);
const ADMIN_HEADERS = Object.freeze(['이력키', '분류', '세부분류', '수신시각', '제목', '발신자', '발신자메일', '첨부수', '메일소스ID', '원문복사여부', '메모']);
const VIEW_HEADERS = Object.freeze(['이력키', '분류', '과제', '과제근거', '수신시각', '제목', '발신자', '발신자메일', '첨부수', '메일소스ID', '원문복사여부', '메모']);

// Files that carry a 세부분류 (sub-classification) column, spec section 3: 사내행정,
// 외부안내, 과제코드대기, 과제없음_확인함, and the separate-folder 일반업무_메일. 보류
// (mail held because two projects' exact triggers collided) has no sub-classification
// of its own -- one bucket, no further split -- so it uses the base headers.
const ADMIN_SHAPED_FILES = Object.freeze(new Set(['사내행정.csv', '외부안내.csv', '과제코드대기.csv', '과제없음_확인함.csv', '일반업무_메일.csv']));

export const HELD_FILE_NAME = '보류.csv';
export const UNCLASSIFIED_FILE_NAME = '미분류.csv';
export const GENERAL_WORK_FILE_NAME = '일반업무_메일.csv';

/** Owner-entered/preserved column index for every common-folder ledger (스펙: "메모" 열) -- fixed at the last column for every header shape above. */
export function memoIndexFor(fileName) {
  return headersFor(fileName).length - 1;
}

export function headersFor(fileName) {
  if (isViewFile(fileName)) return VIEW_HEADERS;
  if (ADMIN_SHAPED_FILES.has(fileName)) return ADMIN_HEADERS;
  return BASE_HEADERS;
}

export function isViewFile(fileName) {
  return fileName.startsWith('거래처_') || fileName.startsWith('작업_');
}

/** `분류` cell: the file's own stem, with the first `_` (if any) rendered as `:` for readability (거래처_Vendor.csv -> "거래처:Vendor"), matching the behavioural reference. */
export function categoryOf(fileName) {
  const stem = fileName.replace(/\.csv$/u, '');
  return stem.includes('_') ? stem.replace('_', ':') : stem;
}

/** A row key stable per (folder-scope, file, mail id) -- distinct files never collide even for the same mail id (a mail can legitimately appear in several vendor/work-tag views plus one primary bucket). */
export function commonRowKey(folderScope, fileName, eventId) {
  return createHash('sha256').update(`${folderScope}|${fileName}|${eventId}`).digest('hex').slice(0, 16);
}

/**
 * Builds one CSV row for `fileName`. `detail` is the 세부분류 cell (admin-shaped files
 * only, ignored otherwise). `projectCell`/`basisCell` are the 과제/과제근거 cells
 * (view files only, ignored otherwise).
 */
export function buildCommonRow({ folderScope, fileName, mail, detail = '', projectCell = '', basisCell = '' }) {
  const key = commonRowKey(folderScope, fileName, mail.event_id);
  const category = categoryOf(fileName);
  const tail = [mail.at, mail.subject, mail.from?.name ?? '', mail.from?.email ?? '', mail.attachment_names.length, mail.event_id, 'false', ''];
  if (isViewFile(fileName)) return [key, category, projectCell, basisCell, ...tail];
  if (ADMIN_SHAPED_FILES.has(fileName)) return [key, category, detail, ...tail];
  return [key, category, ...tail];
}

/** Vendor ledger file name for one matched vendor (spec: 거래처_<이름>.csv). */
export function vendorFileName(vendorName) { return `거래처_${vendorName}.csv`; }
/** Work-tag ledger file name for one tag (spec: 작업_<태그>.csv). */
export function workTagFileName(tag) { return `작업_${tag}.csv`; }

// ------------------------------------------------------------------------ R2: path safety
// R2 (fresh non-author review, 2026-09-21): every dynamic file name above is built
// from Owner-typed text (a 거래처_대응표.csv 거래처명, an 작업태그_목록.csv 태그, or a
// 판독_결정표.csv reading target's free-text tail after `과제외:`) with NO
// sanitisation. A name like `x/../../../../escape` walked the written CSV outside the
// ledger folder (and its lineage file outside the workmeta root) while the receipt
// still said `written: true`; a name containing a literal `/`/`\` (e.g. `a/b`) silently
// created a subdirectory instead of a file. `common_refresh.mjs` runs every file name
// through `isSafeFileName` (reject, never "fix up") before it ever reaches
// `writeLedgerCsv`, and through `resolveSafePath` for BOTH the CSV path and the
// lineage path as a second, independent assertion -- even a future gap in
// `isSafeFileName` cannot walk a write outside its intended base directory.
const RESERVED_DEVICE_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu;
// The control-byte range (codepoint zero through codepoint thirty-one, the NUL
// through Unit-Separator control characters) is built with String.fromCharCode and
// numeric hex literals below, never typed as a control-character source escape --
// an editing tool can turn that kind of escape into the actual raw control byte in
// the FILE's own source (this module's own byte-hygiene test correctly flags that as
// an accident; classifier.mjs's own history describes the same trap for its
// mismatch-candidate array).
const CONTROL_RANGE_START = String.fromCharCode(0x00);
const CONTROL_RANGE_END = String.fromCharCode(0x1F);
const UNSAFE_NAME_CHARS = new RegExp(`[\\\\/:*?"<>|${CONTROL_RANGE_START}-${CONTROL_RANGE_END}]`, 'u');
const MAX_FILE_NAME_LENGTH = 150;

/**
 * True when `fileName` (a full `<stem>.csv` ledger file name) is safe to use as a
 * single path segment directly under a fixed base directory. Rejects: any of
 * `\ / : * ? " < > |` or a control byte; `.`/`..` as the whole name; a trailing dot or
 * space (Windows silently strips these, so two different-looking names can collide on
 * disk); a Windows reserved device stem (`CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9`,
 * case-insensitive, checked before the first `.`); an empty or overlong name.
 */
export function isSafeFileName(fileName) {
  const name = String(fileName ?? '');
  if (!name || name.length > MAX_FILE_NAME_LENGTH) return false;
  if (UNSAFE_NAME_CHARS.test(name)) return false;
  if (name === '.' || name === '..') return false;
  if (/[. ]$/u.test(name)) return false;
  const stem = name.split('.')[0];
  if (RESERVED_DEVICE_NAME.test(stem)) return false;
  return true;
}

/**
 * Resolves `fileName` under `baseDir` and asserts the result is still actually inside
 * `baseDir` (`path.relative` never starts with `..` and is never itself absolute) --
 * the defense-in-depth check that actually stops a write from landing outside the
 * intended folder, independent of whether `isSafeFileName` itself has a gap. Returns
 * the resolved absolute path, or `null` if either check fails.
 */
export function resolveSafePath(baseDir, fileName) {
  if (!isSafeFileName(fileName)) return null;
  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, fileName);
  const rel = path.relative(resolvedBase, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

/** A short, stable, content-only identifier for a rejected file name in a receipt -- never the name itself (R2: an Owner/organisation/tag name is private data). */
export function fileNameHash(fileName) {
  return createHash('sha256').update(String(fileName ?? '')).digest('hex').slice(0, 12);
}

/**
 * The `과제` cell a vendor/work-tag secondary view shows when no project code applies
 * -- a short Korean label naming the mail's actual primary bucket/sub-classification,
 * so a person browsing a vendor ledger can tell at a glance why a given mail has no
 * project yet, without opening the primary ledger too.
 */
export function whereLabelFor(outcome) {
  switch (outcome.bucket) {
    case 'held': return '보류(두 과제 겹침)';
    case 'system': return `시스템알림:${outcome.detail}`;
    case 'ads': return '광고';
    case 'internal_admin': return outcome.detail ? `사내행정(${outcome.detail})` : '사내행정';
    case 'external_notice': return outcome.detail ? `외부안내(${outcome.detail})` : '외부안내';
    case 'out_of_project': return `과제외:${outcome.detail}`;
    case 'code_pending': return outcome.detail ? `과제코드대기(${outcome.detail})` : '과제코드대기';
    case 'no_code_confirmed': return '과제없음';
    case 'general_work': return outcome.detail ? `일반업무:${outcome.detail}` : '일반업무';
    case 'vendor_only': return outcome.detail ? `거래처만(${outcome.detail})` : '거래처만';
    // Coordinator (2026-09-21): a mail filed under a known organisation with no
    // project, no hold and no reading decision at all -- the 과제 cell is always the
    // fixed `미정` (this is what `default` already returned; spelled out explicitly
    // here so the case is not silently relying on the fallback).
    case 'organisation_undecided': return '미정';
    default: return '미정';
  }
}
