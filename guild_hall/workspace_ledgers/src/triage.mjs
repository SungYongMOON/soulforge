// The "판독 API" -- spec section 7 of `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`
// (the Step 3 module surface, built together with Step 1 per the spec header note).
// `listUnclassified` is a read-only preview of the 미분류 bucket for an AI/human
// reader (the loopback reader is 맥락이, a local Hermes bot); `appendReadingDecision`
// appends exactly one row to `판독_결정표.csv` per mail, never overwrites an existing
// one (a person editing the CSV by hand is the only way to correct a row).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { hintCodes, MATCH_FIELDS } from './classifier.mjs';
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
// S6 (fresh non-author review, 2026-09-21): `reader` was unbounded -- capped the same
// way `why`/`target` already are (a shorter cap is enough for a name/identifier, but
// using the same constant keeps this module's validation limits to one number).
const MAX_READER_LENGTH = MAX_WHY_LENGTH;

// Lines that are quote-header/signature noise, not the mail's own content -- stripped
// before building `body_preview` (mirrors the private reference's own dump script,
// with no real values carried over -- these are structural mail-client conventions,
// not org-specific text).
//
// N3 (fresh non-author review, 2026-09-21): the Korean alternatives here used to match
// as a bare word prefix (`^제목`, `^날짜`, ...), so an ordinary prose line that simply
// STARTED with one of those common words (e.g. a sentence opening with "제목" or "날짜"
// as its first word, not a mail-client-generated header) was silently dropped from the
// preview. Restricted to header-SHAPED lines only: `>` (a blockquote marker), a run of
// 5+ dashes/equals (a separator fence), or `Label:`/`Label：` at the very start of the
// line (a colon -- half- or full-width -- immediately after the label is what actually
// distinguishes a mail-client-generated header line from prose that merely starts with
// the same word).
const QUOTE_HEADER_LINE = /^(>|(={6,}|-{6,})|(From|Sent|To|Cc|Subject|보낸 ?사람|받는 ?사람|참조|제목|날짜)\s*[:：])/iu;
// S5: tested per LINE (already newline-free after splitting), not against a flattened
// multi-line string -- anchored at line start, so only a line that IS itself a
// signature marker counts, never a line that merely CONTAINS one of these words
// somewhere in its middle.
const SIGNATURE_LINE = /^(={6,}|-{6,}|감사합니다\.?|Best regards|Kind regards|Regards,)/iu;
// S5: the signature cut only ever looks at the trailing 40% of the (already
// quote-header-stripped) lines, and always at a LINE boundary -- a courtesy phrase
// ("감사합니다") near the START of a short reply (e.g. "감사합니다, 확인 부탁드립니다:
// ...") must never discard the real content that follows it. If no signature line is
// found in that trailing window, nothing is cut; a mail whose ONLY content happens to
// look like a signature line still returns that line rather than an empty preview.
const SIGNATURE_TAIL_FRACTION = 0.6;

function buildBodyPreview(bodyText, maxChars) {
  const rawLines = String(bodyText ?? '').replace(/\r/gu, '').split('\n').map(line => line.trim()).filter(Boolean);
  const stripped = rawLines.filter(line => !QUOTE_HEADER_LINE.test(line));
  // S5 (fresh non-author review, 2026-09-21): a forward with no comment of its own is
  // ENTIRELY quoted/header-shaped content -- stripping it all away used to return an
  // empty preview even though the mail plainly has content (just none of it is the
  // forwarder's own words). Falling back to the unstripped lines means a reader still
  // sees SOMETHING (the forwarded material itself), rather than nothing at all.
  const lines = stripped.length > 0 ? stripped : rawLines;
  if (lines.length === 0) return '';
  const tailStart = Math.floor(lines.length * SIGNATURE_TAIL_FRACTION);
  let cutIndex = -1;
  for (let index = tailStart; index < lines.length; index += 1) {
    if (SIGNATURE_LINE.test(lines[index])) { cutIndex = index; break; }
  }
  const kept = cutIndex === -1 ? lines : lines.slice(0, cutIndex);
  // Never return empty when real content exists -- a cut that would leave nothing
  // (every line before the signature marker was itself blank/stripped) keeps the
  // full line set instead of discarding it.
  const finalLines = kept.length > 0 ? kept : lines;
  return finalLines.join(' / ').replace(/\s+/gu, ' ').trim().slice(0, maxChars);
}

/**
 * Read-only preview of the 미분류 bucket, for an AI/human reader deciding
 * `appendReadingDecision` rows (spec section 7). Runs the exact same classification
 * pass `refreshCommon` would (`common_refresh.mjs`'s `classifyAllCommonMail`) but
 * never writes -- this function's whole contract is "no side effects".
 *
 * `includeOrganisationUndecided` (default `false`): the default list is truly
 * unclassified mail only (`bucket === 'unclassified'`). Coordinator correction
 * (2026-09-21): a mail already filed under a known organisation with no project yet
 * (`bucket === 'organisation_undecided'`) is a DIFFERENT situation from truly
 * unclassified mail -- it already has a home (that organisation's ledger), it is just
 * missing a project. Passing `true` pulls those in too, for a reader who specifically
 * wants to go decide a project for organisation-filed mail (not the default triage
 * sweep, which is about mail with no home at all yet).
 *
 * Returns `{ total, items: [...], owner_table_failures }`. `body_preview` strips
 * quote-header/signature lines and is capped at `bodyPreviewChars` (default 400) --
 * private mail content; a caller must keep this off any receipt/log the same way
 * `previewRule`'s `samples` already is (see `refresh.mjs`'s doc on that). `to` is
 * capped to the first `maxParticipants` (default 6) names to keep a very large
 * recipient list from dominating the preview.
 *
 * `owner_table_failures` (S6, coordinator fresh review round 2): the same `{table,
 * code}` list `refreshCommon`'s own receipt carries. A malformed Owner table degrades
 * classification the exact same way it does for `refreshCommon` (mail that used to
 * route via that table lands in a different bucket instead) -- silently handing a
 * reader a WRONG triage list is worse than refusing outright, so by default this
 * function throws `workspace_ledgers_triage_owner_table_failures` when
 * `ownerTableFailures` is non-empty, naming the failing table(s), rather than
 * returning a list it cannot vouch for. `allowDegradedOwnerTables: true` opts back
 * into the old (degraded but returning) behaviour explicitly, mirroring
 * `refreshCommon`'s own `allowDegradedOwnerTables` -- and `owner_table_failures` is
 * still present on the returned object in that case, so a caller that opted in can
 * still tell.
 */
/**
 * S8/S3 (fresh non-author review, 2026-09-21): why an `unclassified`/
 * `organisation_undecided` mail already has a reading decision that did not (and
 * cannot, without a person editing the CSV) route it anywhere -- distinct from having
 * no decision at all, and distinct from `hold_owner_review` (a legitimate "I looked,
 * I do not know yet" pending state, not a broken one). `null` for every other case.
 */
function alreadyDecidedInvalidReason(projectResult) {
  const reading = projectResult.reading;
  if (!reading) return null;
  // S5 (coordinator, fresh review round 2): an unrecognised 결정 token (neither empty
  // nor a case-insensitive match of any of the five recognised levels --
  // `owner_tables.mjs`'s `buildReadingTable`/S9 keeps it AS TYPED rather than
  // coercing it) used to fall through this function silently, reaching
  // `appendReadingDecision`'s own duplicate-id refusal with no explanation -- a
  // reader/AI calling this API again for the same mail id got only "already
  // decided", with no way to tell that the EXISTING row is the actual problem (a typo
  // in the 결정 cell that needs a person to fix by hand, not a real decision at all).
  // Checked first, before any of the specific-level branches below -- an invalid
  // level string never happens to equal one of the five recognised ones, so this
  // never shadows a genuine case.
  if (!READING_LEVELS.includes(reading.level)) return 'invalid_decision_level';
  if (reading.level === 'vendor_only' && projectResult.vendors.length === 0) return 'vendor_only_without_organisation';
  if (reading.level === 'exclude') return 'unroutable_exclude_target';
  if (projectResult.unknownReadingTarget) return 'unknown_reading_target';
  return null;
}

export function listUnclassified({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
  bundleTablePath = null, vendorTablePath = null, readingTablePath = null, workTagTablePath = null,
  limit = DEFAULT_LIST_LIMIT, bodyPreviewChars = DEFAULT_BODY_PREVIEW_CHARS, maxParticipants = 6,
  includeOrganisationUndecided = false, allowDegradedOwnerTables = false }) {
  const boundedLimit = Math.max(0, Math.min(MAX_LIST_LIMIT, Number.isFinite(limit) ? limit : DEFAULT_LIST_LIMIT));
  const pass = classifyAllCommonMail({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
    bundleTablePath, vendorTablePath, readingTablePath, workTagTablePath });
  // S6: refuse rather than silently hand back a list computed against a known-broken
  // table, unless the caller explicitly opts into the degraded view.
  if (pass.ownerTableFailures.length > 0 && !allowDegradedOwnerTables) {
    fail('workspace_ledgers_triage_owner_table_failures', pass.ownerTableFailures.map(entry => entry.table).join(','));
  }
  const wantedBuckets = includeOrganisationUndecided ? new Set(['unclassified', 'organisation_undecided']) : new Set(['unclassified']);
  const unclassified = pass.classified.filter(entry => wantedBuckets.has(entry.outcome.bucket));
  const items = unclassified.slice(0, boundedLimit).map(entry => {
    const { mail, projectResult, outcome } = entry;
    const routing = [...(pass.threadBuckets.get(normalizeSubject(mail.subject)) ?? [])];
    return {
      mail_source_id: mail.event_id,
      // 'unclassified' or 'organisation_undecided' -- only meaningful when
      // `includeOrganisationUndecided` pulled both in; lets a caller tell "no home
      // yet" apart from "already filed under a vendor, just no project".
      bucket: outcome.bucket,
      // S3 (fresh non-author review, 2026-09-21): a mail whose 판독_결정표 row already
      // says `vendor_only` but names no organisation this module can match can never
      // route to `vendor_only` (there is no ledger to put it in) -- it sits in
      // `unclassified` forever, and `appendReadingDecision` refuses a second decision
      // for the same id as a duplicate (spec: correcting a row is a person editing the
      // CSV by hand). Flagged here so a reader knows NOT to call `appendReadingDecision`
      // again for it (it will only fail) -- the existing row needs a person to edit it
      // directly instead. `null` for every other item (no existing decision, or a
      // legitimate `hold_owner_review` -- that one is working as intended, not broken).
      already_decided_invalid: alreadyDecidedInvalidReason(projectResult),
      received_at: mail.at,
      subject: mail.subject,
      from: mail.from ? { name: mail.from.name, email: mail.from.email } : null,
      to: mail.to.slice(0, maxParticipants).map(person => person.name || person.email),
      attachment_names: mail.attachment_names,
      body_preview: buildBodyPreview(mail.body_text, bodyPreviewChars),
      same_thread_routing: routing,
      vendors: projectResult.vendors.map(vendor => vendor.name),
      // 2026-09-22 (bot-wrapper addition): the project codes `classifyProjectHits`
      // already computed as CANDIDATES for this mail but did not attribute to it --
      // a two-project subject collision (step 1's hold) or several projects' terms in
      // the body (step 4's ambiguity). Additive: every field above keeps its name and
      // meaning, so an existing caller is unaffected. Always an array (`[]` when the
      // classifier found none), never `null`, so a caller can iterate unconditionally.
      candidates: [...projectResult.candidates],
      // 2026-09-22 (bot-wrapper addition): `classifier.mjs`'s own review-only signal --
      // projects whose HINT terms matched this mail while their exact terms did not.
      // Never attribution (that is exactly what `hintCodes`' own doc says it is not);
      // it is the "maybe look here" list a reader wants before opening a mail, and the
      // one thing the classification pass computes that a triage caller could not
      // otherwise see. Run over the SAME compiled rule set this pass classified with,
      // and over all three fields -- subject-only (K1) constrains step 1's LEDGER
      // PLACEMENT, not a review hint, and a hint term appearing in the body or an
      // attachment name is precisely what a reader is looking for here.
      hint_codes: hintCodes(
        { subject: mail.subject, body_text: mail.body_text, attachment_names: mail.attachment_names },
        pass.compiledRules, { fields: MATCH_FIELDS },
      ),
    };
  });
  return { total: unclassified.length, items, owner_table_failures: pass.ownerTableFailures };
}

// A2 item 2 (rename, 2026-09-21 night addition): '과제미정' is the current token for
// "read, project still undetermined"; '과제없음' is kept accepted too (a row already
// written under the old name, or a caller that has not switched yet) -- both resolve
// to the same bucket (`common_classifier.mjs`'s `resolveReadingDecision`).
// Exported (2026-09-22, bot-wrapper addition) so a caller that has to OFFER these
// tokens -- rather than merely have one validated after the fact -- enumerates them
// FROM this module instead of copying the list into its own source, where the two
// would drift the first time a token changes here. `ops/bot_triage.mjs` is the one
// such caller today: a local model picks an exclude category from a fixed menu, and
// that menu has to be this set.
export const EXCLUDE_FIXED_TARGETS = new Set(['광고', '알림', '테스트', '일반업무', '과제없음', '과제미정', '사내행정']);
// The superseded spelling of 과제미정 (A2 item 2's rename): still ACCEPTED below, so a
// row written before the rename keeps working, but named separately so a caller
// building a menu of what to WRITE NOW can leave it out.
export const EXCLUDE_LEGACY_TARGETS = new Set(['과제없음']);
export const EXCLUDE_PREFIXES = Object.freeze(['일반업무:', '과제코드대기:', '과제외:']);

export function isAllowedExcludeTarget(target) {
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
 *
 * `humanActors` (A2 item 4, 2026-09-21 night addition, optional): when supplied (an
 * array of reader names/ids the caller considers human), a `level: 'include'` decision
 * from a `reader` NOT in that list is refused
 * (`workspace_ledgers_triage_include_requires_human_reader`) -- an AI reader's
 * positive attribution must start at `include_with_review`, never the stronger
 * `include`, which this codebase treats the same as an Owner-confirmed subject-rule
 * hit (`refresh.mjs`'s `project_search_eligible_attributions`, A2 item 5). Omitted
 * (the default, `null`), no restriction applies -- unchanged from before this
 * addition, so an existing caller that never passes it keeps exactly today's
 * behaviour.
 *
 * `receivedAt`/`subject` (nit, coordinator fresh review round 2, both optional):
 * fill the 수신일/제목 columns from the mail actually being decided -- previously
 * always written empty, which made the Owner-facing table unreadable (every row
 * showed only an opaque mail-source id). `subject` is capped the same way `why`/
 * `target` already are. A caller with no convenient subject/date at hand (or a test
 * fixture, which stays synthetic per the private-plane-only scope of this change)
 * simply omits them -- both default to `''`, matching the previous, always-empty
 * behaviour exactly.
 */
export function appendReadingDecision({ workspacesRoot, readingTablePath, lineagePath = null, id, level, target, why, reader,
  receivedAt = '', subject = '', humanActors = null, now = new Date().toISOString() }) {
  if (typeof workspacesRoot !== 'string' || workspacesRoot.trim() === '') fail('workspace_ledgers_workspaces_root_required');
  if (typeof readingTablePath !== 'string' || readingTablePath.trim() === '') fail('workspace_ledgers_reading_table_path_required');
  if (typeof id !== 'string' || id.trim() === '') fail('workspace_ledgers_triage_id_required');
  if (!READING_LEVELS.includes(level)) fail('workspace_ledgers_triage_level_invalid', String(level));
  if (typeof reader !== 'string' || reader.trim() === '') fail('workspace_ledgers_triage_reader_required');
  if (reader.length > MAX_READER_LENGTH) fail('workspace_ledgers_triage_reader_too_long');
  if (typeof why !== 'string' || why.trim() === '') fail('workspace_ledgers_triage_why_required');
  if (why.length > MAX_WHY_LENGTH) fail('workspace_ledgers_triage_why_too_long');
  if (level === 'include' && Array.isArray(humanActors) && !humanActors.includes(reader)) {
    fail('workspace_ledgers_triage_include_requires_human_reader', reader);
  }

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
  // N2 (fresh non-author review, 2026-09-21): the same underlying condition (this
  // module's own refresh lock already held by another caller) used to raise a
  // DIFFERENT code here (`workspace_ledgers_lock_held`) than `refresh.mjs`'s and
  // `common_refresh.mjs`'s own lock-held path (`workspace_ledgers_refresh_lock_held`)
  // -- unified on the latter, since all three share the literal same lock file.
  if (lock.held) fail('workspace_ledgers_refresh_lock_held');
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

    const receivedAtText = String(receivedAt ?? '').trim().slice(0, MAX_WHY_LENGTH);
    const subjectText = String(subject ?? '').trim().slice(0, MAX_WHY_LENGTH);
    const newRow = [id, receivedAtText, subjectText, level, targetText, why, reader, now.slice(0, 10), ''];
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
