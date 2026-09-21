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
    default: return '미정';
  }
}
