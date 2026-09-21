// The "판독 API" -- spec section 7 of `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`
// (the Step 3 module surface, built together with Step 1 per the spec header note).
// `listUnclassified` is a read-only preview of the 미분류 bucket for an AI/human
// reader (the loopback reader is 맥락이, a local Hermes bot); `appendReadingDecision`
// appends exactly one row to `판독_결정표.csv` per mail, never overwrites an existing
// one (a person editing the CSV by hand is the only way to correct a row).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { listProjects } from './rule_store.mjs';
import { decodeCsv, encodeCsv, normalizeSubject } from './ledgers.mjs';
import { classifyAllCommonMail } from './common_refresh.mjs';
import { READING_HEADERS, READING_LEVELS } from './owner_tables.mjs';
import { acquireRefreshLock, releaseRefreshLock } from './refresh.mjs';

export class TriageError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'TriageError';
    this.code = code;
  }
}
const fail = (code, detail) => { throw new TriageError(code, detail); };

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;
const DEFAULT_BODY_PREVIEW_CHARS = 400;
const MAX_WHY_LENGTH = 1000;

// Lines that are quote-header/signature noise, not the mail's own content -- stripped
// before building `body_preview` (mirrors the private reference's own dump script,
// with no real values carried over -- these are structural mail-client conventions,
// not org-specific text).
const QUOTE_HEADER_LINE = /^(>|From:|Sent:|To:|Cc:|Subject:|보낸 ?사람|받는 ?사람|참조|제목|날짜|-{5,})/iu;
const SIGNATURE_CUT = /\n?(={6,}|-{6,}|감사합니다\.?|Best regards|Kind regards|Regards,)/iu;

function buildBodyPreview(bodyText, maxChars) {
  const lines = String(bodyText ?? '').replace(/\r/gu, '').split('\n').map(line => line.trim()).filter(line => line && !QUOTE_HEADER_LINE.test(line));
  let joined = lines.join(' / ');
  const cut = joined.search(SIGNATURE_CUT);
  if (cut >= 0) joined = joined.slice(0, cut);
  return joined.replace(/\s+/gu, ' ').slice(0, maxChars);
}

/**
 * Read-only preview of the 미분류 bucket, for an AI/human reader deciding
 * `appendReadingDecision` rows (spec section 7). Runs the exact same classification
 * pass `refreshCommon` would (`common_refresh.mjs`'s `classifyAllCommonMail`) but
 * never writes -- this function's whole contract is "no side effects".
 *
 * Returns `{ total, items: [{ mail_source_id, received_at, subject, from, to,
 * attachment_names, body_preview, same_thread_routing, vendors }] }`. `body_preview`
 * strips quote-header/signature lines and is capped at `bodyPreviewChars` (default
 * 400) -- private mail content; a caller must keep this off any receipt/log the same
 * way `previewRule`'s `samples` already is (see `refresh.mjs`'s doc on that). `to` is
 * capped to the first `maxParticipants` (default 6) names to keep a very large
 * recipient list from dominating the preview.
 */
export function listUnclassified({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
  bundleTablePath = null, vendorTablePath = null, readingTablePath = null, workTagTablePath = null,
  limit = DEFAULT_LIST_LIMIT, bodyPreviewChars = DEFAULT_BODY_PREVIEW_CHARS, maxParticipants = 6 }) {
  const boundedLimit = Math.max(0, Math.min(MAX_LIST_LIMIT, Number.isFinite(limit) ? limit : DEFAULT_LIST_LIMIT));
  const pass = classifyAllCommonMail({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
    bundleTablePath, vendorTablePath, readingTablePath, workTagTablePath });
  const unclassified = pass.classified.filter(entry => entry.outcome.bucket === 'unclassified');
  const items = unclassified.slice(0, boundedLimit).map(entry => {
    const { mail, projectResult } = entry;
    const routing = [...(pass.threadBuckets.get(normalizeSubject(mail.subject)) ?? [])];
    return {
      mail_source_id: mail.event_id,
      received_at: mail.at,
      subject: mail.subject,
      from: mail.from ? { name: mail.from.name, email: mail.from.email } : null,
      to: mail.to.slice(0, maxParticipants).map(person => person.name || person.email),
      attachment_names: mail.attachment_names,
      body_preview: buildBodyPreview(mail.body_text, bodyPreviewChars),
      same_thread_routing: routing,
      vendors: projectResult.vendors.map(vendor => vendor.name),
    };
  });
  return { total: unclassified.length, items };
}

const EXCLUDE_FIXED_TARGETS = new Set(['광고', '알림', '테스트', '일반업무', '과제없음', '사내행정']);
const EXCLUDE_PREFIXES = ['일반업무:', '과제코드대기:', '과제외:'];

function isAllowedExcludeTarget(target) {
  const trimmed = String(target ?? '').trim();
  if (EXCLUDE_FIXED_TARGETS.has(trimmed)) return true;
  return EXCLUDE_PREFIXES.some(prefix => trimmed.startsWith(prefix) && trimmed.length > prefix.length);
}

function sha256Hex(text) { return createHash('sha256').update(text).digest('hex'); }

/**
 * Appends exactly one row to `판독_결정표.csv` for a mail with no existing row
 * (spec section 7 -- "이미 줄이 있는 메일은 거부한다"; correcting a row is a person
 * editing the CSV by hand, never this API). Validates:
 * - `level` is one of the five recognised values (`owner_tables.mjs`'s `READING_LEVELS`).
 * - `include`/`include_with_review`: `target` is one or more real, currently-onboarded
 *   project codes (`;`-joined).
 * - `exclude`: `target` is one of the fixed classification tokens or a
 *   `일반업무:`/`과제코드대기:`/`과제외:`-prefixed one (see `resolvePrimaryBucket` in
 *   `common_classifier.mjs` for the exact same allow-list on the reading side).
 * - `vendor_only`/`hold_owner_review`: `target` is free text (a vendor note or a
 *   candidate-project note), only length-capped, matching the spec's looser contract
 *   for these two levels.
 * - `why` non-empty, length-capped; `reader` non-empty.
 *
 * `Owner확인` is always written empty -- this API can never fill it (spec: "Owner확인
 * 칸은 이 API가 채울 수 없다"). Previous table bytes are archived to `history/`
 * (create-only) before the new row is written; a genuinely first-ever table (no file
 * on disk yet) is created fresh with the header row plus this one decision, nothing to
 * archive. Locking reuses `refresh.mjs`'s own refresh lock, scoped to `workspacesRoot`
 * (spec: "잠금은 refresh와 같은 잠금") -- a triage decision and a refresh/common-refresh
 * can never run concurrently and race on the same tables/ledgers.
 */
export function appendReadingDecision({ workspacesRoot, readingTablePath, lineagePath = null, id, level, target, why, reader, now = new Date().toISOString() }) {
  if (typeof workspacesRoot !== 'string' || workspacesRoot.trim() === '') fail('workspace_ledgers_workspaces_root_required');
  if (typeof readingTablePath !== 'string' || readingTablePath.trim() === '') fail('workspace_ledgers_reading_table_path_required');
  if (typeof id !== 'string' || id.trim() === '') fail('workspace_ledgers_triage_id_required');
  if (!READING_LEVELS.includes(level)) fail('workspace_ledgers_triage_level_invalid', String(level));
  if (typeof reader !== 'string' || reader.trim() === '') fail('workspace_ledgers_triage_reader_required');
  if (typeof why !== 'string' || why.trim() === '') fail('workspace_ledgers_triage_why_required');
  if (why.length > MAX_WHY_LENGTH) fail('workspace_ledgers_triage_why_too_long');

  const targetText = String(target ?? '').trim();
  if (level === 'include' || level === 'include_with_review') {
    const codes = targetText.split(';').map(code => code.trim()).filter(Boolean);
    if (codes.length === 0) fail('workspace_ledgers_triage_target_required', level);
    const known = new Set(listProjects({ workspacesRoot }).map(project => project.project_code));
    const unknown = codes.filter(code => !known.has(code));
    if (unknown.length > 0) fail('workspace_ledgers_triage_target_unknown_project', unknown.join(';'));
  } else if (level === 'exclude') {
    if (!isAllowedExcludeTarget(targetText)) fail('workspace_ledgers_triage_target_not_allowed', targetText);
  }
  // vendor_only / hold_owner_review: free text, only the length cap below applies.
  if (targetText.length > MAX_WHY_LENGTH) fail('workspace_ledgers_triage_target_too_long');

  const lock = acquireRefreshLock(workspacesRoot, now);
  if (lock.held) fail('workspace_ledgers_lock_held');
  try {
    let headers = READING_HEADERS;
    let rows = [];
    let rawText = null;
    if (existsSync(readingTablePath)) {
      rawText = readFileSync(readingTablePath, 'utf8');
      if (rawText.includes('�')) fail('workspace_ledgers_owner_table_encoding', path.basename(readingTablePath));
      const decoded = decodeCsv(rawText);
      if (JSON.stringify(decoded.headers) !== JSON.stringify([...READING_HEADERS])) {
        fail('workspace_ledgers_owner_table_header_mismatch', path.basename(readingTablePath));
      }
      headers = decoded.headers;
      rows = decoded.rows;
      if (rows.some(row => row[0] === id)) fail('workspace_ledgers_triage_decision_duplicate', id);
    }

    const newRow = [id, '', '', level, targetText, why, reader, now.slice(0, 10), ''];
    const nextRows = [...rows, newRow];
    const newText = encodeCsv(headers, nextRows);

    if (rawText !== null) {
      const historyDir = path.join(path.dirname(readingTablePath), 'history');
      mkdirSync(historyDir, { recursive: true });
      const stamp = now.replace(/[:.]/gu, '-');
      let historyPath = path.join(historyDir, `${path.basename(readingTablePath)}.${stamp}.csv`);
      for (let counter = 1; existsSync(historyPath); counter += 1) {
        historyPath = path.join(historyDir, `${path.basename(readingTablePath)}.${stamp}-${counter}.csv`);
      }
      writeFileSync(historyPath, rawText, { flag: 'wx' });
    }
    mkdirSync(path.dirname(readingTablePath), { recursive: true });
    const staging = `${readingTablePath}.writing-${process.pid}-${Date.now()}`;
    writeFileSync(staging, newText);
    renameSync(staging, readingTablePath);

    if (lineagePath) {
      let previousSha256 = null;
      if (rawText !== null) previousSha256 = `sha256:${sha256Hex(rawText)}`;
      const lineage = {
        schema_version: 'soulforge.canonical_byte_lineage.draft.v0',
        object: readingTablePath, sha256: `sha256:${sha256Hex(newText)}`, bytes: Buffer.byteLength(newText),
        rows: nextRows.length, previous_sha256: previousSha256, written_at: now, written_by: reader,
        note: `triage decision: ${id}`,
      };
      mkdirSync(path.dirname(lineagePath), { recursive: true });
      const lineageStaging = `${lineagePath}.writing-${process.pid}-${Date.now()}`;
      writeFileSync(lineageStaging, `${JSON.stringify(lineage, null, 2)}\n`);
      renameSync(lineageStaging, lineagePath);
    }

    return { id, level, target: targetText, row_count: nextRows.length, sha256: `sha256:${sha256Hex(newText)}` };
  } finally {
    releaseRefreshLock(workspacesRoot);
  }
}
