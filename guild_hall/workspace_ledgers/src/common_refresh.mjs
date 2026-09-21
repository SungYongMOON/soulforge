// Org-wide (common-folder) classification and ledger refresh -- spec Step 1 of
// `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`. Companion to `refresh.mjs`'s
// per-project pipeline: that module writes each onboarded project's four ledgers;
// this one writes everything that does NOT resolve to exactly one project (system
// notifications, ads-excluded, internal admin, external notice, out-of-project,
// code-pending, no-code-confirmed, general work, vendor-only, organisation-undecided,
// unclassified, and held) plus the vendor/work-tag secondary view ledgers, all under
// the common folder (and the separate general-work folder for 일반업무_메일.csv).
//
// `classifyAllCommonMail` is the shared read-only classification pass -- both
// `refreshCommon` (writes) and `triage.mjs`'s `listUnclassified` (never writes) call
// it, so "what bucket is this mail in" is computed exactly once, the same way, in both
// places.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertSubjectOnlyFields, DEFAULT_MATCH_FIELDS } from './classifier.mjs';
import { domainOf, makeOrgLookup, normalizeSubject } from './ledgers.mjs';
import { loadRawMailRecords } from './common_events.mjs';
import { loadOwnerTables, ownerTableUsageEntry, resolveOwnerTablePaths } from './owner_tables.mjs';
import {
  addressesOfMail, buildCommonConfig, classifyProjectHits, OrgConfigPatternError, OrgConfigValueError, participantEmailsOf,
  PRIMARY_BUCKETS, resolvePrimaryBucket, STEP1_TITLE_BASIS, THREAD_VENDOR_INHERITANCE_MARKER, workTagsOf,
} from './common_classifier.mjs';
import {
  buildCommonRow, categoryOf, fileNameHash, HELD_FILE_NAME, headersFor, isViewFile, memoIndexFor, resolveSafePath,
  vendorFileName, whereLabelFor, workTagFileName,
} from './common_ledgers.mjs';
import {
  acquireRefreshLock, assertNoOverlappingCustodyDirs, disambiguateCrossSourceIds, readAllRuleJsonSafely, releaseRefreshLock,
  redactHostPaths, RefreshError, writeLedgerCsv,
} from './refresh.mjs';

// S8 (coordinator, fresh review round 2): the pre-rename bucket file name -- a plane
// still carrying it (from before this module's own A2 rename) is a migration signal,
// not silently ignored and not auto-deleted (spec-adjacent hard rule: this module
// never deletes anything on its own initiative).
const LEGACY_NO_CODE_CONFIRMED_FILE_NAME = '과제없음_확인함.csv';

export const COMMON_REFRESH_RECEIPT_SCHEMA = 'soulforge.workspace_common_ledger_refresh_receipt.v1';
// S4: a thread-inherited vendor (no direct address match on the mail itself) is only
// trusted within this window of a direct-match mail in the same thread -- a generic
// subject shared across unrelated conversations months apart must not inherit an
// unrelated organisation just because the normalised subject happens to collide.
const THREAD_VENDOR_INHERITANCE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export class CommonRefreshError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'CommonRefreshError';
    this.code = code;
  }
}
const fail = (code, detail) => { throw new CommonRefreshError(code, detail); };

/** The code segment before a folder name's first `_` (e.g. "P00-000_공통" -> "P00-000"), the same convention `rule_store.mjs`'s `listProjects` uses -- falls back to the whole name when there is no `_` at all. */
function projectCodeOfFolder(folderName) {
  const index = folderName.indexOf('_');
  return index > 0 ? folderName.slice(0, index) : folderName;
}

function readOrgConfig(orgConfigPath) {
  let text;
  try { text = readFileSync(orgConfigPath, 'utf8'); }
  catch (error) { fail('workspace_ledgers_org_config_unreadable', error?.code ?? path.basename(orgConfigPath)); }
  try { return JSON.parse(text); }
  catch (error) { fail('workspace_ledgers_org_config_invalid_json', error.message); }
  return null;
}

/**
 * The shared, read-only classification pass. Reads every onboarded project's rule,
 * the four Owner tables, and every custody record from `hiworksDirs`/`gmailSentDirs`;
 * classifies each (deduped) mail through the spec section 1 order
 * (`common_classifier.mjs`'s `classifyProjectHits`) and, for one not resolving to a
 * project, the spec section 3 primary-bucket order (`resolvePrimaryBucket`). Never
 * writes anything.
 *
 * Returns `{ ourDomain, commonConfig, ruleFailures, ownerTableFailures,
 * unreadableDirs, scanned, duplicatesDropped, totalMails, bucketTally, classified,
 * threadBuckets, unknownTargets, decisionOverrodePattern, vendorOnlyWithoutOrganisation
 * }`. `classified[]` entries are `{ mail, projectResult, outcome, workTags }` --
 * `mail` still carries `body_text` (this pass's whole point is to support
 * classification and triage preview; `common_events.mjs`'s loader is the one that
 * keeps it, unlike `mail_events.mjs`). `threadBuckets` maps a normalised subject to the
 * set of short labels every mail in that thread ended up under -- what `triage.mjs`'s
 * `listUnclassified` calls "같은 대화의 다른 메일이 어디로 분류됐는지".
 *
 * S7 (fresh non-author review): `buildCommonConfig` can throw `OrgConfigPatternError`
 * when an org-config pattern fails the same static-shape/ReDoS-canary checks a rule
 * term would -- re-thrown here as `CommonRefreshError` (`workspace_ledgers_org_config_
 * pattern_invalid`, naming only the offending config key), failing the WHOLE run
 * before any classification happens, not just the one pattern.
 */
export function classifyAllCommonMail({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
  bundleTablePath = null, vendorTablePath = null, readingTablePath = null, workTagTablePath = null, fields = DEFAULT_MATCH_FIELDS }) {
  if (typeof workspacesRoot !== 'string' || workspacesRoot.trim() === '') fail('workspace_ledgers_workspaces_root_required');
  if (!Array.isArray(hiworksDirs) || !Array.isArray(gmailSentDirs)) fail('workspace_ledgers_refresh_dirs_required');
  if (typeof orgConfigPath !== 'string' || orgConfigPath.trim() === '') fail('workspace_ledgers_org_config_required');
  // R1 (coordinator, fresh review round 4): asserted up front, before any rule/table
  // read or classification -- not only implicitly the first time `classifyProjectHits`
  // itself is reached inside the per-record loop below (which would only fire once
  // custody actually has a record, and only after every other setup step already ran).
  try { assertSubjectOnlyFields(fields); }
  catch (error) { fail(error.code, JSON.stringify(fields)); }

  const orgConfig = readOrgConfig(orgConfigPath);
  let commonConfig;
  try { commonConfig = buildCommonConfig(orgConfig); }
  catch (error) {
    if (error instanceof OrgConfigPatternError || error instanceof OrgConfigValueError) fail(error.code, error.configKey);
    throw error;
  }
  const { ourDomain } = makeOrgLookup(orgConfig);
  // NIT (coordinator, fresh review round 3): the same per-rule-isolated loader
  // `refresh()`'s own pipeline uses (S-8), extracted as one shared helper rather than
  // kept as a drifting twin -- this pass's `ruleFailures` now also carries `term_ref`
  // (a hash of the failing term's label, never the label itself), matching
  // `refresh()`'s own receipt shape.
  const { ok: ruleRows, ruleFailures } = readAllRuleJsonSafely(workspacesRoot);
  const compiledRules = ruleRows.map(row => row.compiled);
  // S-b (coordinator, fresh review round 3): the same one-place Owner-table-path
  // resolution `refresh()` uses -- an explicit bundleTablePath/readingTablePath/
  // vendorTablePath always wins; otherwise falls back to
  // `orgConfig.common_ledgers.owner_tables.{bundle,reading,vendor}`. `workTagTablePath`
  // stays explicit-only (out of this resolver's scope, see its own doc).
  const resolvedTables = resolveOwnerTablePaths({ bundleTablePath, readingTablePath, vendorTablePath }, { orgConfig, workspacesRoot });
  const owner = loadOwnerTables({ bundleTablePath: resolvedTables.bundleTablePath, vendorTablePath: resolvedTables.vendorTablePath,
    readingTablePath: resolvedTables.readingTablePath, workTagTablePath, configuredPaths: resolvedTables.configuredPaths });
  const ownerTablesUsed = ['bundle', 'reading', 'vendor']
    .map(table => ownerTableUsageEntry(table, resolvedTables[`${table}TablePath`]))
    .filter(Boolean);

  // Same realpath-based overlap guard `refresh.mjs`'s per-project pipeline runs
  // before classifying custody (coordinator, 2026-09-21) -- an operator pointing
  // `--hiworks-events` and `--gmail-sent-events` at the same real directory would
  // otherwise have every event read and classified twice here too.
  try { assertNoOverlappingCustodyDirs(hiworksDirs, gmailSentDirs); }
  catch (error) {
    fail(error?.code ?? 'workspace_ledgers_custody_dirs_overlap', error instanceof RefreshError ? error.message : undefined);
  }

  const hiworks = loadRawMailRecords({ dirs: hiworksDirs, source: '하이웍스_수집' });
  const gmail = loadRawMailRecords({ dirs: gmailSentDirs, source: 'Gmail_보낸메일_수집' });
  // D-c (coordinator, fresh review round 2): the same cross-source id-collision
  // disambiguation `refresh()`'s own classification loop runs, reused here rather than
  // a second, potentially-drifting copy -- this pass had none at all before (a mail
  // whose `event_id` genuinely collided across hiworks and gmail-sent custody could
  // silently merge two different mails under one key downstream).
  const records = disambiguateCrossSourceIds([...hiworks.records, ...gmail.records]);

  const bucketTally = Object.fromEntries(PRIMARY_BUCKETS.map(bucket => [bucket, 0]));
  const classified = [];
  const threadBuckets = new Map();
  const unknownTargets = { bundle: 0, reading: 0 };
  let decisionOverrodePattern = 0;
  let vendorOnlyWithoutOrganisation = 0;
  // A2 item 2 (2026-09-21 night addition): triage-progress counts, reported separately
  // in the receipt rather than folded into the primary-bucket tally (a mail can be
  // "미판독"/"판독했으나 미정"/neither, independent of which primary bucket it lands in).
  // - unreadCount (미판독): no 판독_결정표 row at all for this mail, whatever bucket it
  //   ends up in -- genuinely never looked at by anyone.
  // - readUndeterminedCount (판독했으나 미정): either an explicit `hold_owner_review`
  //   decision, or one that resolved to the renamed 과제미정 bucket -- read, but which
  //   project (if any) is still not decided.
  // - noProjectConfirmedCount (과제 없음 확인): a reading decision that positively
  //   routed the mail to 일반업무/과제외:... -- "read, and confirmed there is no
  //   project", the case A2 item 2 separates from 과제미정.
  let unreadCount = 0;
  let readUndeterminedCount = 0;
  let noProjectConfirmedCount = 0;
  // A2 item 5: "검색 근거로 쓸 수 있는 귀속" -- a mail whose project attribution (if
  // any) is solid enough to use as RAG/search evidence: an approved subject-rule hit,
  // an Owner-confirmed bundle-table hit, or ANY reading decision whose own Owner확인
  // cell is filled in (regardless of which bucket that reading decision routed to --
  // an Owner-confirmed 일반업무/과제외 exclusion is just as usable as evidence that a
  // mail does NOT belong to a project as an included one is that it does). S3: named
  // `commonSearchEligibleAttributions` (receipt: `common_search_eligible_attributions`),
  // deliberately distinct from `refresh()`'s own `project_search_eligible_attributions`
  // -- the two count different (overlapping) populations and must never be summed.
  let commonSearchEligibleAttributions = 0;

  // Pass 1: classify every mail's own (direct-address) project hits/vendors.
  const prepared = records.map(record => {
    const addresses = addressesOfMail(record);
    const fromDomain = domainOf(record.from?.email ?? '');
    const mail = { ...record, fromDomain, addresses };
    const projectResult = classifyProjectHits(
      { id: record.event_id, subject: record.subject, body: record.body_text, addresses, at: record.at },
      { compiledRules, bundles: owner.bundles, readings: owner.readings, vendorLookup: owner.vendors, fields },
    );
    if (projectResult.unknownBundleTarget) unknownTargets.bundle += 1;
    if (projectResult.unknownReadingTarget) unknownTargets.reading += 1;
    return { mail, projectResult };
  });

  // Thread-level vendor inheritance (spec section 2, 거래처_대응표.csv's own contract:
  // "같은 대화(정규화 제목)의 다른 메일에 거래처가 있으면 사내 전달·수신확인도 그
  // 거래처로 본다"). Built from every mail that has a DIRECT vendor-address match,
  // keyed by normalised subject; a mail with none (an internal forward or a
  // read-receipt that no longer carries the vendor's own address in from/to/cc)
  // inherits its thread's vendors for OUTER bucket routing (vendor_only/
  // organisation_undecided resolution and the vendor secondary-view assignment
  // below) only -- this never re-runs `classifyProjectHits`'s own step 1-5 project
  // attribution, which already ran using the mail's own direct vendors (step 4's
  // supplier-body confirmation is unaffected, matching the private reference: there
  // this inheritance is applied strictly AFTER classification, to the already-
  // computed result, never fed back into it).
  //
  // S4 (fresh non-author review, 2026-09-21): keying on normalised subject ALONE lets
  // a generic, commonly-reused subject inherit an unrelated organisation from a
  // different conversation that merely happens to share the same words. A candidate
  // direct-match mail only donates its vendors to a subject-mate when they ALSO share
  // at least one participant address (from/to/cc overlap -- the actual signal that
  // they are the same real conversation), OR were received within
  // `THREAD_VENDOR_INHERITANCE_WINDOW_MS` (30 days) of each other. Either alone is
  // sufficient (an internal forward days later, with the same participants, or a
  // same-day reply from a slightly different participant set, are both legitimate).
  const threadCandidates = new Map();
  for (const { mail, projectResult } of prepared) {
    if (projectResult.vendors.length === 0) continue;
    const key = normalizeSubject(mail.subject);
    const list = threadCandidates.get(key) ?? [];
    const atMs = Date.parse(mail.at);
    list.push({ vendors: projectResult.vendors, participants: participantEmailsOf(mail), atMs: Number.isNaN(atMs) ? null : atMs });
    threadCandidates.set(key, list);
  }
  for (const entry of prepared) {
    if (entry.projectResult.vendors.length > 0) continue;
    const candidates = threadCandidates.get(normalizeSubject(entry.mail.subject));
    if (!candidates) continue;
    const myParticipants = participantEmailsOf(entry.mail);
    const myAtMs = (() => { const parsed = Date.parse(entry.mail.at); return Number.isNaN(parsed) ? null : parsed; })();
    const inherited = new Map();
    for (const candidate of candidates) {
      const sharesParticipant = [...candidate.participants].some(address => myParticipants.has(address));
      const withinWindow = myAtMs !== null && candidate.atMs !== null
        && Math.abs(myAtMs - candidate.atMs) <= THREAD_VENDOR_INHERITANCE_WINDOW_MS;
      if (!sharesParticipant && !withinWindow) continue;
      for (const vendor of candidate.vendors) inherited.set(vendor.name, vendor);
    }
    if (inherited.size > 0) {
      entry.projectResult = { ...entry.projectResult, vendors: [...inherited.values()], basis: `${entry.projectResult.basis}${THREAD_VENDOR_INHERITANCE_MARKER}` };
    }
  }

  let projectAttributionRows = 0;
  for (const { mail, projectResult } of prepared) {
    let outcome;
    if (projectResult.held) {
      outcome = { bucket: 'held', detail: null, fileName: HELD_FILE_NAME };
    } else if (projectResult.hits.length > 0) {
      outcome = { bucket: 'project', detail: null, fileName: null, projectCodes: projectResult.hits.map(hit => hit.project_code) };
    } else {
      outcome = resolvePrimaryBucket(mail, projectResult, commonConfig, { ourDomain });
    }
    bucketTally[outcome.bucket] += 1;
    if (outcome.decisionOverrodePattern) decisionOverrodePattern += 1;
    // N1 (2026-09-21 night addition, cli.mjs `parity`'s "like with like" project row):
    // the real per-project ledgers record one ROW per project a mail is attributed to
    // (a 공유 A;B mail is a row in BOTH project A's and project B's own history CSV),
    // while `bucketTally.project` counts the mail once no matter how many projects it
    // shares. Summed separately here so a caller comparing against the real files' row
    // counts (which necessarily double-count a shared mail) is comparing the same
    // population, not silently comparing a per-mail count against a per-row sum.
    if (outcome.bucket === 'project') projectAttributionRows += outcome.projectCodes.length;

    // A2 item 2: triage-progress counts (see this function's own header note).
    // S2 (coordinator, fresh review round 2): "unread" must mean "no 판독_결정표 row
    // for this mail id AT ALL", checked directly against the reading table
    // (`owner.readings`) -- NOT `projectResult.reading`, which `classifyProjectHits`
    // only ever populates when classification actually reached step 3 (its own
    // early-return steps -- step 1's title-rule hit, and the two-project hold -- never
    // look the mail up in the reading table at all, so `projectResult.reading` being
    // `undefined` there does NOT mean "no reading row exists"; it means "classification
    // never checked"). The previous version read `!projectResult.reading` here, which
    // counted every rule-attributed and every held mail as "미판독" even when a
    // reading-table row genuinely existed for it (e.g. one recorded for search/audit
    // purposes after the mail was already rule-attributed).
    const hasReadingRow = owner.readings.has(mail.event_id);
    if (!hasReadingRow) {
      unreadCount += 1;
    } else if (projectResult.reading?.level === 'hold_owner_review' || outcome.bucket === 'no_code_confirmed') {
      readUndeterminedCount += 1;
    } else if (projectResult.reading?.level === 'exclude' && (outcome.bucket === 'general_work' || outcome.bucket === 'out_of_project')) {
      noProjectConfirmedCount += 1;
    }
    // A2 item 5 / S3 (coordinator, fresh review round 2): "common_search_eligible_
    // attributions" -- see this function's own header note. Distinctly named from
    // `refresh()`'s own `project_search_eligible_attributions` (S3: the two populations
    // must never be summed -- this one is computed across EVERY mail this pass
    // classified, project-bucket mail included, while `refresh()`'s own count is
    // scoped to project-ledger mail only; a project-attributed mail is genuinely
    // counted in both, by design, not a bug). Never double-counts a shared (공유) mail
    // -- this increments at most once per MAIL (this loop iterates records, not hits),
    // regardless of how many projects a table hit named.
    const ownerConfirmedReading = projectResult.reading && String(projectResult.reading.ownerConfirmed ?? '').trim() !== '';
    if ((outcome.bucket === 'project' && projectResult.basis === STEP1_TITLE_BASIS) || projectResult.basis === '묶음 확정' || ownerConfirmedReading) {
      commonSearchEligibleAttributions += 1;
    }
    // S3: a mail with an EXPLICIT vendor_only reading decision but no matched
    // organisation at all -- it can never route to `vendor_only` (there is no ledger
    // to put it in) and stays `unclassified`, but it is not an ordinary "never looked
    // at" unclassified mail either: someone already tried to decide it. Counted here
    // (receipt-visible) and flagged per-item by `triage.mjs`'s `listUnclassified`.
    if (projectResult.reading?.level === 'vendor_only' && projectResult.vendors.length === 0) vendorOnlyWithoutOrganisation += 1;

    const workTags = workTagsOf(mail.subject, owner.workTags);
    classified.push({ mail, projectResult, outcome, workTags });

    const threadKey = normalizeSubject(mail.subject);
    const set = threadBuckets.get(threadKey) ?? new Set();
    set.add(outcome.bucket === 'project' ? `과제:${outcome.projectCodes.join(';')}` : (outcome.fileName ?? outcome.bucket));
    threadBuckets.set(threadKey, set);
  }

  return {
    // `compiledRules` (2026-09-22, additive): every onboarded project's compiled rule
    // this pass actually used. Returned so a read-only caller (`triage.mjs`) can run
    // this codebase's own review-only primitive (`classifier.mjs`'s `hintCodes`) over
    // the SAME rule set this classification used, rather than compiling a second,
    // possibly-divergent set of its own. No existing field changed.
    orgConfig, commonConfig, compiledRules, ourDomain, ruleFailures, ownerTableFailures: owner.failures, ownerTablesUsed,
    unreadableDirs: [...hiworks.unreadableDirs, ...gmail.unreadableDirs],
    scanned: hiworks.scanned + gmail.scanned, duplicatesDropped: hiworks.duplicatesDropped + gmail.duplicatesDropped,
    idCollisionsKept: (hiworks.idCollisionsKept ?? 0) + (gmail.idCollisionsKept ?? 0),
    totalMails: records.length, bucketTally, classified, threadBuckets, workTagPool: owner.workTags,
    unknownTargets, decisionOverrodePattern, vendorOnlyWithoutOrganisation, invalidDecisionLevels: owner.invalidDecisionLevels,
    projectAttributionRows, unreadCount, readUndeterminedCount, noProjectConfirmedCount, commonSearchEligibleAttributions,
  };
}

function writeReceiptFile({ receiptsDir, now, dry, body }) {
  try {
    mkdirSync(receiptsDir, { recursive: true });
    const stamp = now.replace(/[:.]/gu, '-');
    const target = path.join(receiptsDir, `common-refresh-${stamp}${dry ? '-dry' : ''}.json`);
    const staging = `${target}.writing-${process.pid}-${Date.now()}`;
    writeFileSync(staging, `${JSON.stringify(body, null, 2)}\n`);
    renameSync(staging, target);
  } catch { /* best effort: a receipt-write failure must never mask the original error */ }
}

/**
 * Rewrites the common-folder (and general-work-folder) ledgers from the classification
 * pass above, preserving the 메모 column by 이력키 (spec: "공통 장부에도 과제 장부와
 * 같은 Owner 칸 보존·이력 보관·fail-closed·영수증 규칙을 적용한다"), via `refresh.mjs`'s
 * `writeLedgerCsv` -- the exact same contract the four per-project ledgers get.
 *
 * `dry` (default `false`): when `true`, nothing is written -- classification still
 * runs and the receipt still reports what WOULD have been written (row counts,
 * bucket tally), the same "dry leaves an audit trail" contract `refresh()` has. This
 * module NEVER writes to the real data plane on its own initiative -- spec Step 1
 * section 6: "실제 평면에 쓰지 않는다(dry만)" is a caller-side promise this function
 * cannot enforce by itself, since `workspacesRoot` is an explicit argument; the
 * caller (this codebase's own CLI/tests, or a future lane) is responsible for never
 * pointing a non-dry call at the real plane before the coordinator's own cutover.
 *
 * `allowEmpty` (array of common-ledger file names, default `[]`) permits a named file
 * to be rewritten down to zero rows even when it previously had content -- the same
 * per-target opt-in `refresh()`'s `allowEmpty` (project codes) uses, scoped to file
 * names here since there is no single "project" a common-folder file belongs to.
 *
 * `allowPartialSources` (R5, default `false`, mirrors `refresh()`): an unreadable
 * custody directory blocks EVERY write for the whole run -- receipt only, `status:
 * 'failed'`, `unreadable_dirs` named -- unless this is explicitly `true`, in which case
 * the run proceeds on whatever custody was readable and `partialSourcesInEffect`
 * (`unreadableDirs.length > 0 && allowPartialSources`) is threaded into every
 * `writeLedgerCsv` call so its shrink guard actually activates (before this fix,
 * `refreshCommon` had no gate at all -- a typo'd custody flag silently wrote whatever
 * partial custody it DID read as if it were the complete picture, and never passed the
 * in-effect boolean writeLedgerCsv's shrink guard needs to do anything).
 *
 * `allowDegradedOwnerTables` (R4, default `false`): a malformed Owner table (bad
 * header/encoding/row-shape) makes `loadOwnerTables` substitute an EMPTY table, which
 * silently degrades classification -- mail that used to route through that table (a
 * vendor match, a bundle confirmation, a reading decision) falls to a different bucket
 * instead, and a normal refresh would then rewrite every ledger to match: the file(s)
 * that table used to feed lose their rows, while the mail's NEW (wrong) bucket's file
 * gains them -- so the same mail ends up recorded in two different ledgers on disk,
 * with the receipt still saying `status: 'ok'`/`written: true` throughout. By default,
 * ANY `ownerTableFailures` blocks every ledger write for the whole run (receipt only,
 * `status: 'failed'`, the failing table(s) named) -- the project ledgers `refresh()`'s
 * own pipeline produces are a completely separate code path and are never affected by
 * this gate either way. Passing `true` opts into the old (degraded but writing)
 * behaviour explicitly, for a caller that has already decided it wants best-effort
 * output despite a known-bad table.
 */
export function refreshCommon({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
  bundleTablePath = null, vendorTablePath = null, readingTablePath = null, workTagTablePath = null,
  dry = false, receiptsDir, now = new Date().toISOString(), allowEmpty = [],
  allowPartialSources = false, allowDegradedOwnerTables = false }) {
  if (typeof workmetaRoot !== 'string' || workmetaRoot.trim() === '') fail('workspace_ledgers_workmeta_root_required');
  if (typeof receiptsDir !== 'string' || receiptsDir.trim() === '') fail('workspace_ledgers_receipts_dir_required');
  if (!Array.isArray(allowEmpty)) fail('workspace_ledgers_allow_empty_must_be_list', typeof allowEmpty);
  const allowEmptyFiles = new Set(allowEmpty);

  const emitReceipt = body => writeReceiptFile({ receiptsDir, now, dry, body });
  const baseReceipt = () => ({ schema_version: COMMON_REFRESH_RECEIPT_SCHEMA, generated_at: now, dry });

  let lock;
  try { lock = acquireRefreshLock(workspacesRoot, now); }
  catch (error) {
    emitReceipt({ ...baseReceipt(), status: 'failed',
      error: { code: error?.code ?? 'workspace_ledgers_refresh_lock_unavailable', message: redactHostPaths(error?.message ?? String(error)) } });
    throw error;
  }
  if (lock.held) {
    // N2: the same lock-held condition must carry the same code everywhere it can be
    // observed (`refresh.mjs`'s own lock-held path, and `triage.mjs`'s
    // `appendReadingDecision`, both reuse this exact lock) -- unified on
    // `workspace_ledgers_refresh_lock_held`.
    emitReceipt({ ...baseReceipt(), status: 'failed',
      error: { code: 'workspace_ledgers_refresh_lock_held', message: 'refresh lock already held' } });
    fail('workspace_ledgers_refresh_lock_held');
  }

  try {
    const pass = classifyAllCommonMail({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
      bundleTablePath, vendorTablePath, readingTablePath, workTagTablePath });
    const { commonConfig } = pass;

    // R5 pre-write gate (mirrors refresh()'s own): an unreadable custody directory
    // blocks every write for the whole run unless the caller explicitly opted into a
    // partial-sources run.
    if (pass.unreadableDirs.length > 0 && !allowPartialSources) {
      const receipt = {
        ...baseReceipt(), status: 'failed',
        scanned: pass.scanned, duplicates_dropped: pass.duplicatesDropped, total_mails: pass.totalMails,
        unreadable_dirs: pass.unreadableDirs, allow_partial_sources_applied: false,
        rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures, owner_tables_used: pass.ownerTablesUsed,
        bucket_counts: pass.bucketTally, files: [],
      };
      emitReceipt(receipt);
      return receipt;
    }
    const partialSourcesInEffect = pass.unreadableDirs.length > 0 && allowPartialSources;

    // R4 pre-write gate: any malformed Owner table blocks every write for the whole
    // run unless the caller explicitly opted into degraded output -- see this
    // function's own doc above for why a partial write here is actively dangerous
    // (the same mail ending up recorded in two different ledgers on disk).
    if (pass.ownerTableFailures.length > 0 && !allowDegradedOwnerTables) {
      const receipt = {
        ...baseReceipt(), status: 'failed',
        scanned: pass.scanned, duplicates_dropped: pass.duplicatesDropped, total_mails: pass.totalMails,
        unreadable_dirs: pass.unreadableDirs, allow_partial_sources_applied: partialSourcesInEffect,
        rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures, owner_tables_used: pass.ownerTablesUsed,
        bucket_counts: pass.bucketTally, files: [], degraded_owner_tables_allowed: false,
      };
      emitReceipt(receipt);
      return receipt;
    }

    // Required-review item 1: defense-in-depth, independent of `buildCommonConfig`'s
    // own `isSafeFileName` check on the folder names (config-build time) -- assert
    // both folder names actually resolve safely under BOTH roots right before any
    // write, the same two-layer contract R2 already gives every ledger FILE name
    // (`isSafeFileName` at build time, `resolveSafePath` again at write time).
    for (const folderName of [commonConfig.commonFolderName, commonConfig.generalWorkFolderName]) {
      if (!resolveSafePath(workspacesRoot, folderName) || !resolveSafePath(workmetaRoot, folderName)) {
        const receipt = {
          ...baseReceipt(), status: 'failed',
          error: { code: 'workspace_ledgers_org_config_folder_name_unsafe', message: 'common_folder_name/general_work_folder_name resolved outside its root' },
          scanned: pass.scanned, duplicates_dropped: pass.duplicatesDropped, total_mails: pass.totalMails,
          unreadable_dirs: pass.unreadableDirs, allow_partial_sources_applied: partialSourcesInEffect,
          rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures, owner_tables_used: pass.ownerTablesUsed,
          bucket_counts: pass.bucketTally, files: [],
        };
        emitReceipt(receipt);
        return receipt;
      }
    }

    // file name -> { folder, rows: [] }
    const grouped = new Map();
    const put = (folder, fileName, row) => {
      const key = `${folder}::${fileName}`;
      const entry = grouped.get(key) ?? { folder, fileName, rows: [] };
      entry.rows.push(row);
      grouped.set(key, entry);
    };

    for (const entry of pass.classified) {
      const { mail, projectResult, outcome, workTags } = entry;
      if (outcome.fileName) {
        const folder = outcome.bucket === 'general_work' ? commonConfig.generalWorkFolderName : commonConfig.commonFolderName;
        put(folder, outcome.fileName, buildCommonRow({ folderScope: folder, fileName: outcome.fileName, mail, detail: outcome.detail ?? '' }));
      }
      if (projectResult.vendors.length > 0 || workTags.length > 0) {
        const projectCell = outcome.bucket === 'project' ? outcome.projectCodes.join(';') : whereLabelFor(outcome);
        // `outcome.basisOverride` (organisation_undecided only, spec-per-coordinator
        // 2026-09-21): the row's basis is always the fixed "거래처(자동)", never
        // whatever `classifyProjectHits` happened to compute (e.g. a body match
        // against more than one project) -- this bucket's whole point is "an
        // organisation is known, a project is not", not a record of why not.
        const basisCell = outcome.basisOverride
          ?? (projectResult.basis + (projectResult.candidates.length ? ` 후보 ${projectResult.candidates.join(';')}` : ''));
        for (const vendor of projectResult.vendors) {
          const fileName = vendorFileName(vendor.name);
          put(commonConfig.commonFolderName, fileName,
            buildCommonRow({ folderScope: commonConfig.commonFolderName, fileName, mail, projectCell, basisCell }));
        }
        for (const tag of workTags) {
          const fileName = workTagFileName(tag);
          put(commonConfig.commonFolderName, fileName,
            buildCommonRow({ folderScope: commonConfig.commonFolderName, fileName, mail, projectCell, basisCell }));
        }
      }
    }

    // R3: a case-insensitive collision between two DIFFERENT file names in the same
    // folder (an Owner-typed organisation/tag differing only by letter case, e.g.
    // "거래처_ABC.csv" vs "거래처_abc.csv") would overwrite each other's ledger on a
    // case-insensitive filesystem (Windows) while both looked like they wrote fine.
    // Detected across the whole grouped map before anything is written; every
    // colliding file name is rejected (never written), named in the receipt by hash
    // only (R2: this text is Owner-typed organisation/tag data, private).
    //
    // Required-review item 2: the collision key is Unicode-normalised (NFC) before
    // case-folding -- `owner_tables.mjs` already normalises every vendor name/tag to
    // NFC at read time (so two table ROWS that differ only by composition are already
    // the same string well before this point), but this key is the last line of
    // defense against any other source of a non-NFC file name reaching this far, and
    // makes the actual collision RULE explicit: same organisation/tag under NFC +
    // lower-case is one file, never two.
    const byFolderLowerName = new Map();
    for (const { folder, fileName } of grouped.values()) {
      const bucketKey = `${folder}::${fileName.normalize('NFC').toLowerCase()}`;
      const names = byFolderLowerName.get(bucketKey) ?? new Set();
      names.add(fileName);
      byFolderLowerName.set(bucketKey, names);
    }
    const caseCollisionNames = new Set();
    for (const names of byFolderLowerName.values()) {
      if (names.size > 1) for (const name of names) caseCollisionNames.add(name);
    }

    const rejectedFiles = [];
    const files = [];
    for (const { folder, fileName, rows } of grouped.values()) {
      if (caseCollisionNames.has(fileName)) {
        rejectedFiles.push({ folder, file_name_hash: fileNameHash(fileName), code: 'workspace_ledgers_ledger_name_case_collision' });
        continue;
      }
      // R2: reject (never "fix up") an unsafe file name, and independently assert the
      // resolved CSV/lineage paths never escape their base directories -- defense in
      // depth even if `isSafeFileName` itself ever had a gap.
      const base = path.join(workspacesRoot, folder, '020_MGMT/027_수신이력_이동이력');
      const lineageBase = path.join(workmetaRoot, folder, 'lineage');
      const csvPath = resolveSafePath(base, fileName);
      const lineagePath = resolveSafePath(lineageBase, `${fileName}.lineage.json`);
      if (!csvPath || !lineagePath) {
        rejectedFiles.push({ folder, file_name_hash: fileNameHash(fileName), code: 'workspace_ledgers_ledger_name_unsafe' });
        continue;
      }

      const headers = headersFor(fileName);
      // NIT 14 (fresh non-author review, 2026-09-21): the common folder's lineage
      // `project_code` used to hardcode the literal "P00-000" while its own folder
      // name is fully configurable (`common_folder_name`) -- derived from the
      // folder name's own code part instead (the segment before its first `_`,
      // the same convention `rule_store.mjs`'s `listProjects` uses to read a
      // project's own code off its folder name).
      const code = folder === commonConfig.generalWorkFolderName ? 'general_work' : projectCodeOfFolder(commonConfig.commonFolderName);
      const result = writeLedgerCsv({
        filePath: csvPath, lineagePath, headers, rows, keyIndex: 0, preserveIndices: [memoIndexFor(fileName)],
        code, folder,
        relPath: `020_MGMT/027_수신이력_이동이력/${fileName}`, now, dry, allowEmpty: allowEmptyFiles.has(fileName),
        partialSourcesInEffect,
      });
      // S6 (fresh non-author review, 2026-09-21): an ACCEPTED organisation-/tag-
      // derived file name used to be written verbatim into the receipt while a
      // REJECTED one (R2/R3) was already hashed -- an inconsistent privacy stance on
      // the exact same category of Owner-typed text. Every 거래처_*/작업_* entry now
      // records the fixed folder part plus a short hash instead of the name itself;
      // every OTHER (fixed, non-Owner-derived) ledger name -- 사내행정.csv,
      // 미분류.csv, 시스템알림_<source>.csv (source names come from the org config,
      // not Owner mail data), 과제외_<label>.csv, etc. -- stays readable, unchanged.
      const displayFileName = isViewFile(fileName) ? `${categoryOf(fileName).split(':')[0]}_${fileNameHash(fileName)}.csv` : fileName;
      files.push({ file: `${folder}/020_MGMT/027_수신이력_이동이력/${displayFileName}`, ...result });
    }

    // S8 (coordinator, fresh review round 2): a plane that still carries the
    // pre-rename bucket file (`과제없음_확인함.csv`, retired by A2 item 2's rename to
    // `판독_과제미정.csv`) is a migration signal -- surfaced as a receipt warning, never
    // auto-deleted or auto-migrated (this module never deletes anything on its own
    // initiative). Checked in the common folder only, the one place that file ever
    // lived.
    const legacyBucketFilePath = path.join(workspacesRoot, commonConfig.commonFolderName,
      '020_MGMT/027_수신이력_이동이력', LEGACY_NO_CODE_CONFIRMED_FILE_NAME);
    const legacyBucketFilePresent = existsSync(legacyBucketFilePath);

    const receipt = {
      schema_version: COMMON_REFRESH_RECEIPT_SCHEMA, generated_at: now, dry,
      status: (pass.ruleFailures.length > 0 || pass.ownerTableFailures.length > 0
        || pass.unreadableDirs.length > 0 || rejectedFiles.length > 0 || files.some(file => file.failed)) ? 'failed' : 'ok',
      scanned: pass.scanned, duplicates_dropped: pass.duplicatesDropped, id_collisions_kept: pass.idCollisionsKept,
      total_mails: pass.totalMails,
      unreadable_dirs: pass.unreadableDirs, allow_partial_sources_applied: partialSourcesInEffect,
      rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures, owner_tables_used: pass.ownerTablesUsed,
      bucket_counts: pass.bucketTally, files, rejected_files: rejectedFiles,
      unknown_targets: pass.unknownTargets, decision_overrode_pattern: pass.decisionOverrodePattern,
      vendor_only_without_organisation: pass.vendorOnlyWithoutOrganisation, invalid_decision_levels: pass.invalidDecisionLevels,
      // A2 item 2: triage-progress counts, separate from the primary-bucket tally.
      unread_count: pass.unreadCount, read_undetermined_count: pass.readUndeterminedCount,
      no_project_confirmed_count: pass.noProjectConfirmedCount,
      // A2 item 5 / S3: mail whose project attribution is solid enough to use as
      // search/RAG evidence (approved subject rule, approved bundle table, or any
      // reading decision with its own Owner확인 cell filled in) -- across every mail
      // THIS pass classified (project-bucket mail included). Deliberately named
      // differently from `refresh()`'s own `project_search_eligible_attributions`
      // receipt field -- the two populations overlap by design and must never be summed.
      common_search_eligible_attributions: pass.commonSearchEligibleAttributions,
      // S8: `true` only means the OLD file is still present on disk -- this receipt
      // never reads or writes it, and never implies anything about its content.
      legacy_bucket_file_present: legacyBucketFilePresent,
      // S3: symmetric with `allow_partial_sources_applied` -- present on the success
      // path too (not only R4's own failure-and-no-write receipt above), so a caller
      // reading a run that DID write can still tell whether it did so only because
      // `allowDegradedOwnerTables` was explicitly passed.
      degraded_owner_tables_allowed: pass.ownerTableFailures.length > 0 && allowDegradedOwnerTables,
    };
    emitReceipt(receipt);
    return receipt;
  } catch (error) {
    emitReceipt({ ...baseReceipt(), status: 'failed',
      error: { code: error?.code ?? 'workspace_ledgers_common_refresh_unexpected_error', message: redactHostPaths(error?.message ?? String(error)) } });
    throw error;
  } finally {
    releaseRefreshLock(workspacesRoot);
  }
}
