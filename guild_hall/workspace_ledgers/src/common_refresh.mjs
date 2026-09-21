// Org-wide (common-folder) classification and ledger refresh -- spec Step 1 of
// `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`. Companion to `refresh.mjs`'s
// per-project pipeline: that module writes each onboarded project's four ledgers;
// this one writes everything that does NOT resolve to exactly one project (system
// notifications, ads-excluded, internal admin, external notice, out-of-project,
// code-pending, no-code-confirmed, general work, vendor-only, unclassified, and held)
// plus the vendor/work-tag secondary view ledgers, all under the common folder (and
// the separate general-work folder for 일반업무_메일.csv).
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
  addressesOfMail, buildCommonConfig, classifyProjectHits, PRIMARY_BUCKETS, resolvePrimaryBucket, workTagsOf,
} from './common_classifier.mjs';
import {
  buildCommonRow, HELD_FILE_NAME, headersFor, memoIndexFor, vendorFileName, whereLabelFor, workTagFileName,
} from './common_ledgers.mjs';
import { acquireRefreshLock, releaseRefreshLock, redactHostPaths, writeLedgerCsv } from './refresh.mjs';

export const COMMON_REFRESH_RECEIPT_SCHEMA = 'soulforge.workspace_common_ledger_refresh_receipt.v1';

export class CommonRefreshError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'CommonRefreshError';
    this.code = code;
  }
}
const fail = (code, detail) => { throw new CommonRefreshError(code, detail); };

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
 * threadBuckets }`. `classified[]` entries are `{ mail, projectResult, outcome,
 * workTags }` -- `mail` still carries `body_text` (this pass's whole point is to
 * support classification and triage preview; `common_events.mjs`'s loader is the one
 * that keeps it, unlike `mail_events.mjs`). `threadBuckets` maps a normalised subject
 * to the set of short labels every mail in that thread ended up under -- what
 * `triage.mjs`'s `listUnclassified` calls "같은 대화의 다른 메일이 어디로 분류됐는지".
 */
export function classifyAllCommonMail({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
  bundleTablePath = null, vendorTablePath = null, readingTablePath = null, workTagTablePath = null }) {
  if (typeof workspacesRoot !== 'string' || workspacesRoot.trim() === '') fail('workspace_ledgers_workspaces_root_required');
  if (!Array.isArray(hiworksDirs) || !Array.isArray(gmailSentDirs)) fail('workspace_ledgers_refresh_dirs_required');
  if (typeof orgConfigPath !== 'string' || orgConfigPath.trim() === '') fail('workspace_ledgers_org_config_required');

  const orgConfig = readOrgConfig(orgConfigPath);
  const commonConfig = buildCommonConfig(orgConfig);
  const { ourDomain } = makeOrgLookup(orgConfig);
  const { ok: ruleRows, ruleFailures } = readAllRulesSafely(workspacesRoot);
  const compiledRules = ruleRows.map(row => row.compiled);
  const owner = loadOwnerTables({ bundleTablePath, vendorTablePath, readingTablePath, workTagTablePath });

  const hiworks = loadRawMailRecords({ dirs: hiworksDirs, source: '하이웍스_수집' });
  const gmail = loadRawMailRecords({ dirs: gmailSentDirs, source: 'Gmail_보낸메일_수집' });
  const records = [...hiworks.records, ...gmail.records];

  const bucketTally = Object.fromEntries(PRIMARY_BUCKETS.map(bucket => [bucket, 0]));
  const classified = [];
  const threadBuckets = new Map();

  for (const record of records) {
    const addresses = addressesOfMail(record);
    const fromDomain = domainOf(record.from?.email ?? '');
    const mail = { ...record, fromDomain, addresses };
    const projectResult = classifyProjectHits(
      { id: record.event_id, subject: record.subject, body: record.body_text, addresses },
      { compiledRules, bundles: owner.bundles, readings: owner.readings, vendorLookup: owner.vendors },
    );

    let outcome;
    if (projectResult.held) {
      outcome = { bucket: 'held', detail: null, fileName: HELD_FILE_NAME };
    } else if (projectResult.hits.length > 0) {
      outcome = { bucket: 'project', detail: null, fileName: null, projectCodes: projectResult.hits.map(hit => hit.project_code) };
    } else {
      outcome = resolvePrimaryBucket(mail, projectResult, commonConfig, { ourDomain });
    }
    bucketTally[outcome.bucket] += 1;

    const workTags = workTagsOf(record.subject, owner.workTags);
    classified.push({ mail, projectResult, outcome, workTags });

    const threadKey = normalizeSubject(record.subject);
    const set = threadBuckets.get(threadKey) ?? new Set();
    set.add(outcome.bucket === 'project' ? `과제:${outcome.projectCodes.join(';')}` : (outcome.fileName ?? outcome.bucket));
    threadBuckets.set(threadKey, set);
  }

  return {
    orgConfig, commonConfig, ourDomain, ruleFailures, ownerTableFailures: owner.failures,
    unreadableDirs: [...hiworks.unreadableDirs, ...gmail.unreadableDirs],
    scanned: hiworks.scanned + gmail.scanned, duplicatesDropped: hiworks.duplicatesDropped + gmail.duplicatesDropped,
    totalMails: records.length, bucketTally, classified, threadBuckets, workTagPool: owner.workTags,
  };
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
 */
export function refreshCommon({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
  bundleTablePath = null, vendorTablePath = null, readingTablePath = null, workTagTablePath = null,
  dry = false, receiptsDir, now = new Date().toISOString(), allowEmpty = [] }) {
  if (typeof workmetaRoot !== 'string' || workmetaRoot.trim() === '') fail('workspace_ledgers_workmeta_root_required');
  if (typeof receiptsDir !== 'string' || receiptsDir.trim() === '') fail('workspace_ledgers_receipts_dir_required');
  if (!Array.isArray(allowEmpty)) fail('workspace_ledgers_allow_empty_must_be_list', typeof allowEmpty);
  const allowEmptyFiles = new Set(allowEmpty);

  const writeReceiptFile = body => {
    try {
      mkdirSync(receiptsDir, { recursive: true });
      const stamp = now.replace(/[:.]/gu, '-');
      const target = path.join(receiptsDir, `common-refresh-${stamp}${dry ? '-dry' : ''}.json`);
      const staging = `${target}.writing-${process.pid}-${Date.now()}`;
      writeFileSync(staging, `${JSON.stringify(body, null, 2)}\n`);
      renameSync(staging, target);
    } catch { /* best effort: a receipt-write failure must never mask the original error */ }
  };

  let lock;
  try { lock = acquireRefreshLock(workspacesRoot, now); }
  catch (error) {
    writeReceiptFile({ schema_version: COMMON_REFRESH_RECEIPT_SCHEMA, generated_at: now, dry, status: 'failed',
      error: { code: error?.code ?? 'workspace_ledgers_refresh_lock_unavailable', message: redactHostPaths(error?.message ?? String(error)) } });
    throw error;
  }
  if (lock.held) {
    writeReceiptFile({ schema_version: COMMON_REFRESH_RECEIPT_SCHEMA, generated_at: now, dry, status: 'failed',
      error: { code: 'workspace_ledgers_refresh_lock_held', message: 'refresh lock already held' } });
    fail('workspace_ledgers_refresh_lock_held');
  }

  try {
    const pass = classifyAllCommonMail({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
      bundleTablePath, vendorTablePath, readingTablePath, workTagTablePath });
    const { commonConfig } = pass;

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
        const basisCell = projectResult.basis + (projectResult.candidates.length ? ` 후보 ${projectResult.candidates.join(';')}` : '');
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

    const files = [];
    for (const { folder, fileName, rows } of grouped.values()) {
      const headers = headersFor(fileName);
      const base = path.join(workspacesRoot, folder, '020_MGMT/027_수신이력_이동이력');
      const lineageBase = path.join(workmetaRoot, folder, 'lineage');
      const result = writeLedgerCsv({
        filePath: path.join(base, fileName), lineagePath: path.join(lineageBase, `${fileName}.lineage.json`),
        headers, rows, keyIndex: 0, preserveIndices: [memoIndexFor(fileName)],
        code: folder === commonConfig.generalWorkFolderName ? 'general_work' : 'P00-000', folder,
        relPath: `020_MGMT/027_수신이력_이동이력/${fileName}`, now, dry, allowEmpty: allowEmptyFiles.has(fileName),
      });
      files.push({ file: `${folder}/020_MGMT/027_수신이력_이동이력/${fileName}`, ...result });
    }

    const receipt = {
      schema_version: COMMON_REFRESH_RECEIPT_SCHEMA, generated_at: now, dry,
      status: (pass.ruleFailures.length > 0 || pass.ownerTableFailures.length > 0
        || pass.unreadableDirs.length > 0 || files.some(file => file.failed)) ? 'failed' : 'ok',
      scanned: pass.scanned, duplicates_dropped: pass.duplicatesDropped, total_mails: pass.totalMails,
      unreadable_dirs: pass.unreadableDirs, rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures,
      bucket_counts: pass.bucketTally, files,
    };
    writeReceiptFile(receipt);
    return receipt;
  } catch (error) {
    writeReceiptFile({ schema_version: COMMON_REFRESH_RECEIPT_SCHEMA, generated_at: now, dry, status: 'failed',
      error: { code: error?.code ?? 'workspace_ledgers_common_refresh_unexpected_error', message: redactHostPaths(error?.message ?? String(error)) } });
    throw error;
  } finally {
    releaseRefreshLock(workspacesRoot);
  }
}
