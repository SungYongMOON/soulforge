// CSV row/header shaping for the common-folder ledgers (spec section 3 of
// `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`): the primary-bucket files
// (시스템알림_<원천>.csv, 사내행정.csv, 외부안내.csv, 과제외_<분류>.csv,
// 과제코드대기.csv, 판독_과제미정.csv (A2 item 2's rename of the former
// 과제없음_확인함.csv -- R2, coordinator fresh review round 2), 미분류.csv,
// 보류.csv), the general-work
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
// 외부안내, 과제코드대기, 판독_과제미정 (A2 item 2's rename of 과제없음_확인함 -- R2,
// coordinator fresh review round 2: this set still named the OLD file after the
// rename, so the renamed bucket silently lost both its 세부분류 column and the
// reader's own 이유 text -- `resolveReadingDecision` in `common_classifier.mjs`
// already emits the NEW file name, this set just had not caught up), and the
// separate-folder 일반업무_메일. 보류 (mail held because two projects' exact triggers
// collided) has no sub-classification of its own -- one bucket, no further split --
// so it uses the base headers.
const ADMIN_SHAPED_FILES = Object.freeze(new Set(['사내행정.csv', '외부안내.csv', '과제코드대기.csv', '판독_과제미정.csv', '일반업무_메일.csv']));

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
// Every non-printable/invisible codepoint checked below is built with
// String.fromCharCode and a numeric literal, never typed as a control-character
// source escape directly -- an editing tool can turn that kind of escape into the
// actual raw codepoint in the FILE's own source (this module's own byte-hygiene test
// correctly flags that as an accident; classifier.mjs's own history describes the
// same trap for its mismatch-candidate array).
//
// The control-byte range: codepoint zero through codepoint thirty-one (NUL through
// Unit Separator).
const CONTROL_RANGE_START = String.fromCharCode(0x00);
const CONTROL_RANGE_END = String.fromCharCode(0x1F);
// NIT 12 (fresh non-author review, 2026-09-21): a file name built from Owner-typed
// text could also carry the DEL codepoint, or an invisible/bidi-control codepoint --
// none of these are rejected by the plain ASCII-punctuation/control-byte check above,
// yet a zero-width or bidi-override codepoint in a file name is exactly the kind of
// thing that makes two visually-identical-looking names actually different bytes (or
// makes one name's DISPLAYED text lie about its actual byte order). Rejected here:
// DEL (codepoint 127); the zero-width joiners/space and word joiner
// (`tests/byte_hygiene.test.mjs` already treats these as an accident in tracked
// SOURCE -- here they are rejected in Owner-typed DATA for the same reason: invisible
// in an editor, but a real, distinguishing byte on disk); the BOM/zero-width
// no-break space; the left-to-right/right-to-left marks; and the bidi
// embedding/override/isolate control block.
const DEL_CHAR = String.fromCharCode(0x7F);
const ZERO_WIDTH_CHARS = [0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF].map(code => String.fromCharCode(code)).join('');
const BIDI_MARK_CHARS = [0x200E, 0x200F].map(code => String.fromCharCode(code)).join('');
const BIDI_EMBEDDING_RANGE_START = String.fromCharCode(0x202A);
const BIDI_EMBEDDING_RANGE_END = String.fromCharCode(0x202E);
const BIDI_ISOLATE_RANGE_START = String.fromCharCode(0x2066);
const BIDI_ISOLATE_RANGE_END = String.fromCharCode(0x2069);
const UNSAFE_NAME_CHARS = new RegExp(
  `[\\\\/:*?"<>|${CONTROL_RANGE_START}-${CONTROL_RANGE_END}${DEL_CHAR}${ZERO_WIDTH_CHARS}${BIDI_MARK_CHARS}`
  + `${BIDI_EMBEDDING_RANGE_START}-${BIDI_EMBEDDING_RANGE_END}${BIDI_ISOLATE_RANGE_START}-${BIDI_ISOLATE_RANGE_END}]`,
  'u',
);
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
    // A2 item 2 (rename, 2026-09-21 night addition): this bucket means "read, project
    // still undetermined" now, not "confirmed no project" -- see `resolveReadingDecision`.
    case 'no_code_confirmed': return '과제미정';
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
