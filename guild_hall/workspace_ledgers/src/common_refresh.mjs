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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compileRule } from './classifier.mjs';
import { listProjects, readRule } from './rule_store.mjs';
import { domainOf, makeOrgLookup, normalizeSubject } from './ledgers.mjs';
import { loadRawMailRecords } from './common_events.mjs';
import { loadOwnerTables } from './owner_tables.mjs';
import {
  addressesOfMail, buildCommonConfig, classifyProjectHits, OrgConfigPatternError, OrgConfigValueError, participantEmailsOf,
  PRIMARY_BUCKETS, resolvePrimaryBucket, THREAD_VENDOR_INHERITANCE_MARKER, workTagsOf,
} from './common_classifier.mjs';
import {
  buildCommonRow, categoryOf, fileNameHash, HELD_FILE_NAME, headersFor, isViewFile, memoIndexFor, resolveSafePath,
  vendorFileName, whereLabelFor, workTagFileName,
} from './common_ledgers.mjs';
import {
  acquireRefreshLock, assertNoOverlappingCustodyDirs, releaseRefreshLock, redactHostPaths, RefreshError, writeLedgerCsv,
} from './refresh.mjs';

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
 * Compiles every onboarded project's saved rule individually -- the same per-rule
 * isolation `refresh.mjs`'s `readAllRuleJsonSafely` uses (S-8: a bad rule for one
 * project must not abort reading every other project's rule), kept as its own small
 * copy here rather than importing a refresh.mjs-internal helper (that function is not
 * part of `refresh.mjs`'s exported surface, and duplicating ~12 lines is cheaper than
 * widening that module's public API further for this one call site).
 */
function readAllRulesSafely(workspacesRoot) {
  const projects = listProjects({ workspacesRoot });
  const ok = [];
  const ruleFailures = [];
  for (const project of projects) {
    try {
      const json = readRule({ workspacesRoot, code: project.project_code }).json;
      const compiled = compileRule(json, { timeSafety: false });
      ok.push({ project, json, compiled });
    } catch (error) {
      ruleFailures.push({ project_code: project.project_code, code: error?.code ?? 'workspace_ledgers_rule_unreadable' });
    }
  }
  return { ok, ruleFailures };
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
  bundleTablePath = null, vendorTablePath = null, readingTablePath = null, workTagTablePath = null }) {
  if (typeof workspacesRoot !== 'string' || workspacesRoot.trim() === '') fail('workspace_ledgers_workspaces_root_required');
  if (!Array.isArray(hiworksDirs) || !Array.isArray(gmailSentDirs)) fail('workspace_ledgers_refresh_dirs_required');
  if (typeof orgConfigPath !== 'string' || orgConfigPath.trim() === '') fail('workspace_ledgers_org_config_required');

  const orgConfig = readOrgConfig(orgConfigPath);
  let commonConfig;
  try { commonConfig = buildCommonConfig(orgConfig); }
  catch (error) {
    if (error instanceof OrgConfigPatternError || error instanceof OrgConfigValueError) fail(error.code, error.configKey);
    throw error;
  }
  const { ourDomain } = makeOrgLookup(orgConfig);
  const { ok: ruleRows, ruleFailures } = readAllRulesSafely(workspacesRoot);
  const compiledRules = ruleRows.map(row => row.compiled);
  const owner = loadOwnerTables({ bundleTablePath, vendorTablePath, readingTablePath, workTagTablePath });

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
  const records = [...hiworks.records, ...gmail.records];

  const bucketTally = Object.fromEntries(PRIMARY_BUCKETS.map(bucket => [bucket, 0]));
  const classified = [];
  const threadBuckets = new Map();
  const unknownTargets = { bundle: 0, reading: 0 };
  let decisionOverrodePattern = 0;
  let vendorOnlyWithoutOrganisation = 0;

  // Pass 1: classify every mail's own (direct-address) project hits/vendors.
  const prepared = records.map(record => {
    const addresses = addressesOfMail(record);
    const fromDomain = domainOf(record.from?.email ?? '');
    const mail = { ...record, fromDomain, addresses };
    const projectResult = classifyProjectHits(
      { id: record.event_id, subject: record.subject, body: record.body_text, addresses },
      { compiledRules, bundles: owner.bundles, readings: owner.readings, vendorLookup: owner.vendors },
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
    orgConfig, commonConfig, ourDomain, ruleFailures, ownerTableFailures: owner.failures,
    unreadableDirs: [...hiworks.unreadableDirs, ...gmail.unreadableDirs],
    scanned: hiworks.scanned + gmail.scanned, duplicatesDropped: hiworks.duplicatesDropped + gmail.duplicatesDropped,
    totalMails: records.length, bucketTally, classified, threadBuckets, workTagPool: owner.workTags,
    unknownTargets, decisionOverrodePattern, vendorOnlyWithoutOrganisation, invalidDecisionLevels: owner.invalidDecisionLevels,
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
        rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures,
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
        rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures,
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
          rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures,
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

    const receipt = {
      schema_version: COMMON_REFRESH_RECEIPT_SCHEMA, generated_at: now, dry,
      status: (pass.ruleFailures.length > 0 || pass.ownerTableFailures.length > 0
        || pass.unreadableDirs.length > 0 || rejectedFiles.length > 0 || files.some(file => file.failed)) ? 'failed' : 'ok',
      scanned: pass.scanned, duplicates_dropped: pass.duplicatesDropped, total_mails: pass.totalMails,
      unreadable_dirs: pass.unreadableDirs, allow_partial_sources_applied: partialSourcesInEffect,
      rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures,
      bucket_counts: pass.bucketTally, files, rejected_files: rejectedFiles,
      unknown_targets: pass.unknownTargets, decision_overrode_pattern: pass.decisionOverrodePattern,
      vendor_only_without_organisation: pass.vendorOnlyWithoutOrganisation, invalid_decision_levels: pass.invalidDecisionLevels,
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
