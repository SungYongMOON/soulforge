#!/usr/bin/env node
// CLI entry point for the workspace ledgers module. Three subcommands:
//   refresh       rewrite a project's four management CSVs from mail custody
//   preview-rule  read-only comparison of a draft rule against custody (no writes)
//   save-rule     version-bump a project's saved mail routing rule
//
// Exit codes: 0 success, 2 usage/config error (bad flags, unreadable/invalid input
// that never reached a write) OR `refresh` finishing with one or more ledger files
// that failed strict validation (R4 -- left untouched, every other file still
// refreshed) OR an unreadable custody directory, 3 runtime failure during execution
// (lock held, write failure, rule store error after args were valid).
// `refresh` accepts an optional `--allow-empty P00-001,P00-002` (fresh-review-3 #4: a
// comma-separated project-code list, not a bare boolean) to explicitly permit
// rebuilding just those projects' ledgers to zero rows when custody genuinely
// produced none for them (fresh-review-2 #1) -- without naming a project here, 0
// fresh rows where its existing ledger had content still fails closed for it. A
// valueless `--allow-empty` is a usage error (S-5), not a silent no-op.
// `refresh` also accepts an optional `--allow-partial-sources` (fresh-review-3 #1):
// without it, any unreadable custody directory blocks every write for the whole run
// (the failed receipt is still written); with it, the run proceeds on whatever
// custody was readable, and the receipt records `allow_partial_sources_applied`.
// `refresh`'s `status: 'failed'` can have several distinct causes (unreadable custody,
// a bad saved rule excluded for one project, or R4's ledger validation) -- the CLI
// (S-6) prints a message naming which one(s) actually applied, including the
// `--allow-partial-sources` hint specifically for the unreadable-custody case.
// fresh-review-5 (design simplification): there is no per-mail match timeout and no
// cumulative match-time run budget any more -- matching is a direct, untimed call.
// `save-rule` accepts an optional `--allowed-actors a,b,c` (N16) to further restrict
// `--by` to that exact list, on top of the always-applied machine-actor refusal.
// `preview-rule` prints counts only by default; `--show-samples` also prints
// `samples`, which carries real mail subjects (fresh-review-2 #6) -- private, not for
// casual/automated logging. `preview-rule` accepts an optional `--org-config` so its
// counts use the same merged system-sender list a real `refresh` against that config
// would (fresh-review-3 #6); omitted, only the built-in default list applies. K2
// (coordinator, fresh review round 3): a system-sender mail is NEVER excluded from
// `matched_before`/`matched_after` -- `preview-rule` reads custody through the exact
// same loader/window `refresh` does, so its counts always equal what the next refresh
// will write; `matched_from_system_senders` reports separately how many of those
// matches came from a recognised system sender, for the Owner's own visibility.
// K1 (settles round 2's D-b/R1): `--fields` omitted (or `subject`) is the only
// supported value now -- step 1 matches the subject only, full stop; `--fields all`
// is gone (see `fieldsOf`'s own doc below).
// S-b: `--bundle-table`/`--reading-table`/`--vendor-table` (refresh/preview-rule) and
// `--bundle-table`/`--reading-table`/`--vendor-table`/`--work-tag-table`
// (common-refresh/parity/triage list) are all optional overrides -- omitted, each
// command falls back to `orgConfig.common_ledgers.owner_tables.{bundle,reading,vendor}`
// (see `owner_tables.mjs`'s `resolveOwnerTablePaths`). HARD OPERATING RULE: `refresh`
// and `common-refresh` (and `parity`/`triage`) MUST be run against the SAME resolved
// table set for the same custody window -- mixing an explicit override on one command
// with the org-config default on the other classifies the same mail differently in the
// two writers and breaks the partition invariant between the project ledgers and the
// common-folder ledgers.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_MATCH_FIELDS } from './src/classifier.mjs';
import { previewRule, refresh, RefreshError } from './src/refresh.mjs';
import { listProjects, RuleStoreError, saveRuleVersion } from './src/rule_store.mjs';
import { classifyAllCommonMail, CommonRefreshError, refreshCommon } from './src/common_refresh.mjs';
import { decodeCsv } from './src/ledgers.mjs';
import { appendReadingDecision, listUnclassified, TriageError } from './src/triage.mjs';

function parseArgs(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index += 1, next);
    flags.set(name, value);
  }
  return flags;
}

function usageError(message) {
  console.error(`workspace_ledgers_cli_usage: ${message}`);
  process.exitCode = 2;
}

function requireFlag(flags, name) {
  const value = flags.get(name);
  if (typeof value !== 'string' || value.trim() === '') { usageError(`--${name} is required`); return null; }
  return value;
}

// K1 (coordinator, fresh review round 3 -- settles round 2's D-b/R1): step 1 matches
// the SUBJECT ONLY, full stop -- there is no wider mode any more. `--fields` OMITTED
// defaults to subject-only (`DEFAULT_MATCH_FIELDS`); `--fields subject` is accepted
// explicitly for the same value, for a caller/script that always passes it. `--fields
// all` is GONE (round 2's widening mode never really matched step 1's own contract --
// see `classifier.mjs`'s `DEFAULT_MATCH_FIELDS` doc) -- passing it, or any other value,
// is a usage error here, matching the library's own `assertSubjectOnlyFields` throw
// for a caller that reaches `refresh()`/`previewRule()` directly instead of through
// this CLI.
function fieldsOf(flags) {
  const raw = flags.get('fields');
  if (raw === undefined) return DEFAULT_MATCH_FIELDS;
  if (raw === 'subject') return ['subject'];
  usageError(`--fields must be "subject" (or omitted) -- "all" is no longer supported (step 1 is subject-only, full stop), got "${raw}"`);
  return null;
}

function exitCodeFor(code) {
  if (typeof code !== 'string') return 3;
  if (code.includes('lock')) return 3;
  // K1: a caller reaching the library directly with an unsupported `fields` value
  // (this CLI's own `fieldsOf` already refuses it before ever calling in) throws
  // `workspace_ledgers_fields_not_supported` -- a bad-input/usage error, same class as
  // `invalid`/`required` below, never a runtime failure.
  if (code.includes('required') || code.includes('invalid') || code.includes('unknown_project')
    || code.includes('no_projects_found') || code.includes('not_found') || code.includes('unreadable')
    || code.includes('allow_empty_must_be_list') || code.includes('custody_dirs_overlap')
    || code.includes('allow_empty_targets_rule_failure') || code.includes('fields_not_supported')
    // NIT (fresh review round 4): a bad org-config owner-table path (escape outside
    // workspacesRoot) is a config error, same class as the others above --
    // `..._workspaces_root_required` is already covered by the `required` check.
    || code.includes('owner_table_config_path_escape')) return 2;
  return 3;
}

function readDraft(draftPath) {
  try { return JSON.parse(readFileSync(draftPath, 'utf8')); }
  catch (error) { usageError(`--draft unreadable or invalid JSON: ${error.message}`); return undefined; }
}

function runRefresh(flags) {
  const workspacesRoot = requireFlag(flags, 'workspaces-root');
  const workmetaRoot = requireFlag(flags, 'workmeta-root');
  const hiworksEvents = requireFlag(flags, 'hiworks-events');
  const gmailSentEvents = requireFlag(flags, 'gmail-sent-events');
  const orgConfigPath = requireFlag(flags, 'org-config');
  const receiptsDir = requireFlag(flags, 'receipts');
  if (!workspacesRoot || !workmetaRoot || !hiworksEvents || !gmailSentEvents || !orgConfigPath || !receiptsDir) return;
  const fields = fieldsOf(flags);
  if (fields === null) return;
  const projectsRaw = flags.get('projects');
  const projects = typeof projectsRaw === 'string' ? projectsRaw.split(',').map(item => item.trim()).filter(Boolean) : null;
  const dry = flags.get('dry') === true || flags.get('dry') === 'true';
  const allowEmptyRaw = flags.get('allow-empty');
  // S-5: a bare `--allow-empty` (no value) used to parse to the boolean `true`, which
  // silently became an empty list -- indistinguishable from never having passed the
  // flag at all, and no override actually took effect. A valueless flag is now a
  // usage error instead of a silent no-op; the list form (`--allow-empty a,b`) is the
  // only way to grant the override.
  if (allowEmptyRaw === true) { usageError('--allow-empty requires a comma-separated project-code list, e.g. --allow-empty P00-001,P00-002'); return; }
  const allowEmpty = typeof allowEmptyRaw === 'string' ? allowEmptyRaw.split(',').map(item => item.trim()).filter(Boolean) : [];
  const allowPartialSources = flags.get('allow-partial-sources') === true || flags.get('allow-partial-sources') === 'true';
  // A1/A2 (2026-09-21 night addition): both optional and both omitted by default --
  // `refresh()` reads no table and behaves exactly as before this addition unless one
  // is explicitly given (see `refresh.mjs`'s own doc on `bundleTablePath`/
  // `readingTablePath`).
  const bundleTableRaw = flags.get('bundle-table');
  const bundleTablePath = typeof bundleTableRaw === 'string' ? bundleTableRaw : null;
  const readingTableRaw = flags.get('reading-table');
  const readingTablePath = typeof readingTableRaw === 'string' ? readingTableRaw : null;
  // D-a (coordinator, fresh review round 2): needed for step 4 (a supplier-type
  // vendor mail whose body contains exactly one project's exact keyword) to
  // attribute anything here -- omitted, step 4 never fires (see `refresh()`'s own doc).
  const vendorTableRaw = flags.get('vendor-table');
  const vendorTablePath = typeof vendorTableRaw === 'string' ? vendorTableRaw : null;
  const allowDegradedOwnerTables = flags.get('allow-degraded-owner-tables') === true || flags.get('allow-degraded-owner-tables') === 'true';
  try {
    const receipt = refresh({ workspacesRoot, workmetaRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents],
      orgConfigPath, projects, fields, dry, receiptsDir, allowEmpty, allowPartialSources,
      bundleTablePath, readingTablePath, vendorTablePath, allowDegradedOwnerTables });
    console.log(JSON.stringify(receipt));
    // S-6: `status: 'failed'` has more than one possible cause now -- branch on which
    // one(s) actually applied instead of always naming `ledger_failures` (which is
    // often empty when the real cause was, say, an unreadable custody directory).
    if (receipt.status === 'failed') {
      if (receipt.unreadable_dirs?.length > 0 && !receipt.allow_partial_sources_applied) {
        console.error(`workspace_ledgers_refresh_unreadable_dirs: ${JSON.stringify(receipt.unreadable_dirs)}`
          + ' -- pass --allow-partial-sources to proceed on whatever custody was readable');
      }
      if (receipt.rule_failures?.length > 0) {
        console.error(`workspace_ledgers_refresh_rule_failures: ${JSON.stringify(receipt.rule_failures)}`);
      }
      if (receipt.owner_table_failures?.length > 0) {
        console.error(`workspace_ledgers_refresh_owner_table_failures: ${JSON.stringify(receipt.owner_table_failures)}`
          + ' -- pass --allow-degraded-owner-tables to proceed with degraded table attribution');
      }
      if (receipt.ledger_failures?.length > 0) {
        console.error(`workspace_ledgers_refresh_ledger_validation_failed: ${JSON.stringify(receipt.ledger_failures)}`);
      }
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`workspace_ledgers_refresh_failed: ${error.code ?? error.message}`);
    // NIT (fresh review round 4): a thrown `OwnerTableConfigError` (a bad org-config
    // owner-table path) is not a `RefreshError`, but still carries a real `.code` --
    // classify by code, not by class, so it still maps through `exitCodeFor` instead of
    // always falling to the generic runtime-failure exit code.
    process.exitCode = typeof error?.code === 'string' ? exitCodeFor(error.code) : 3;
  }
}

function runPreviewRule(flags) {
  const workspacesRoot = requireFlag(flags, 'workspaces-root');
  const code = requireFlag(flags, 'code');
  const draftPath = requireFlag(flags, 'draft');
  const hiworksEvents = requireFlag(flags, 'hiworks-events');
  const gmailSentEvents = requireFlag(flags, 'gmail-sent-events');
  if (!workspacesRoot || !code || !draftPath || !hiworksEvents || !gmailSentEvents) return;
  const fields = fieldsOf(flags);
  if (fields === null) return;
  const draft = readDraft(draftPath);
  if (draft === undefined) return;
  const showSamples = flags.get('show-samples') === true || flags.get('show-samples') === 'true';
  const orgConfigRaw = flags.get('org-config');
  const orgConfigPath = typeof orgConfigRaw === 'string' ? orgConfigRaw : null;
  // A1/D-a/S-b: all three optional, all omitted by default falling back to org-config
  // (`resolveOwnerTablePaths`) -- D-a: `classifyProjectHits` is the ONE classification
  // function `previewRule` and `refresh` both run, so a table's effect on
  // matched_before/matched_after here is exactly what the next refresh would write
  // (never a separate `table_attributed` field any more -- removed, K2/D-a).
  const bundleTableRaw = flags.get('bundle-table');
  const bundleTablePath = typeof bundleTableRaw === 'string' ? bundleTableRaw : null;
  const readingTableRaw = flags.get('reading-table');
  const readingTablePath = typeof readingTableRaw === 'string' ? readingTableRaw : null;
  const vendorTableRaw = flags.get('vendor-table');
  const vendorTablePath = typeof vendorTableRaw === 'string' ? vendorTableRaw : null;
  try {
    const result = previewRule({ workspacesRoot, code, draft, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents], fields, orgConfigPath,
      bundleTablePath, readingTablePath, vendorTablePath });
    // fresh-review-2 #6: `samples` carries real mail subjects -- printed only when
    // explicitly asked for, never by default.
    const { samples, ...counts } = result;
    console.log(JSON.stringify(showSamples ? result : counts));
    // fresh-review-5 #7: another project's rule failing to compile means these counts
    // were computed with fewer rules in play than normal -- flagged, not silent.
    if (result.rule_failures?.length > 0) {
      console.error(`workspace_ledgers_preview_rule_partial_rule_failures: ${JSON.stringify(result.rule_failures)}`);
    }
    // SHOULD (coordinator, fresh review round 5): S1's own caveat, mirrored here -- an
    // Owner table that failed to load makes these counts just as incomplete as an
    // excluded project's rule does. Counts/codes only, matching `owner_table_failures`'s
    // own shape (`{ table, code }`) -- never a table's own file content or path.
    if (result.owner_table_failures?.length > 0) {
      console.error(`workspace_ledgers_preview_rule_partial_owner_table_failures: ${JSON.stringify(result.owner_table_failures)}`);
    }
  } catch (error) {
    console.error(`workspace_ledgers_preview_rule_failed: ${error.code ?? error.message}`);
    // NIT (fresh review round 4): see runRefresh's own identical note -- classify by
    // `.code`, not by class, so `OwnerTableConfigError` also maps through `exitCodeFor`.
    process.exitCode = typeof error?.code === 'string' ? exitCodeFor(error.code) : 3;
  }
}

function runSaveRule(flags) {
  const workspacesRoot = requireFlag(flags, 'workspaces-root');
  const workmetaRoot = requireFlag(flags, 'workmeta-root');
  const code = requireFlag(flags, 'code');
  const draftPath = requireFlag(flags, 'draft');
  const by = requireFlag(flags, 'by');
  const note = requireFlag(flags, 'note');
  if (!workspacesRoot || !workmetaRoot || !code || !draftPath || !by || !note) return;
  const draft = readDraft(draftPath);
  if (draft === undefined) return;
  const allowedActorsRaw = flags.get('allowed-actors');
  const allowedActors = typeof allowedActorsRaw === 'string' ? allowedActorsRaw.split(',').map(item => item.trim()).filter(Boolean) : undefined;
  try {
    const result = saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, allowedActors });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`workspace_ledgers_save_rule_failed: ${error.code ?? error.message}`);
    process.exitCode = error instanceof RuleStoreError ? exitCodeFor(error.code) : 3;
  }
}

// --------------------------------------------------------------------------------
// Step 1 additions: common-refresh (org-wide/common-folder ledgers), parity (real-
// plane read-only comparison), and the "triage" (판독) API's CLI surface (spec
// section 7). `refresh`/`preview-rule`/`save-rule` above are untouched.

function commonTablesFromFlags(flags) {
  const get = name => (typeof flags.get(name) === 'string' ? flags.get(name) : null);
  return {
    bundleTablePath: get('bundle-table'), vendorTablePath: get('vendor-table'),
    readingTablePath: get('reading-table'), workTagTablePath: get('work-tag-table'),
  };
}

function runCommonRefresh(flags) {
  const workspacesRoot = requireFlag(flags, 'workspaces-root');
  const workmetaRoot = requireFlag(flags, 'workmeta-root');
  const hiworksEvents = requireFlag(flags, 'hiworks-events');
  const gmailSentEvents = requireFlag(flags, 'gmail-sent-events');
  const orgConfigPath = requireFlag(flags, 'org-config');
  const receiptsDir = requireFlag(flags, 'receipts');
  if (!workspacesRoot || !workmetaRoot || !hiworksEvents || !gmailSentEvents || !orgConfigPath || !receiptsDir) return;
  const dry = flags.get('dry') === true || flags.get('dry') === 'true';
  const allowEmptyRaw = flags.get('allow-empty');
  if (allowEmptyRaw === true) { usageError('--allow-empty requires a comma-separated ledger-file-name list'); return; }
  const allowEmpty = typeof allowEmptyRaw === 'string' ? allowEmptyRaw.split(',').map(item => item.trim()).filter(Boolean) : [];
  const allowPartialSources = flags.get('allow-partial-sources') === true || flags.get('allow-partial-sources') === 'true';
  const allowDegradedOwnerTables = flags.get('allow-degraded-owner-tables') === true || flags.get('allow-degraded-owner-tables') === 'true';
  try {
    const receipt = refreshCommon({
      workspacesRoot, workmetaRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents], orgConfigPath,
      ...commonTablesFromFlags(flags), dry, receiptsDir, allowEmpty, allowPartialSources, allowDegradedOwnerTables,
    });
    console.log(JSON.stringify(receipt));
    if (receipt.status === 'failed') process.exitCode = 2;
  } catch (error) {
    console.error(`workspace_ledgers_common_refresh_failed: ${error.code ?? error.message}`);
    process.exitCode = error instanceof CommonRefreshError ? 3 : 3;
  }
}

/** Row count of a real ledger CSV at `filePath`, or `null` when the file does not exist -- never thrown, so a still-unwritten bucket file reads as "no real data yet" rather than a parity-check crash. */
function realRowCount(filePath) {
  let text;
  try { text = readFileSync(filePath, 'utf8'); } catch { return null; }
  return decodeCsv(text).rows.length;
}

// N1 (fresh non-author review, 2026-09-21): the parity report used to compare only
// five of the twelve primary buckets -- the largest one (`project`, the mail that DID
// resolve to a project and is written by refresh()'s own per-project pipeline, not
// this module) was never checked at all. Sums every onboarded project's
// 메일_수신이력.csv + 메일_발송이력.csv row count (deduped by construction -- each
// project's own two files never share a mail).
const PROJECT_RECV_REL = '020_MGMT/027_수신이력_이동이력/메일_수신이력.csv';
const PROJECT_SENT_REL = '020_MGMT/027_수신이력_이동이력/메일_발송이력.csv';
function realProjectMailCount(workspacesRoot) {
  const projects = listProjects({ workspacesRoot });
  let total = 0;
  let anyFound = false;
  for (const project of projects) {
    for (const rel of [PROJECT_RECV_REL, PROJECT_SENT_REL]) {
      const count = realRowCount(path.join(workspacesRoot, project.folder_name, rel));
      if (count !== null) { total += count; anyFound = true; }
    }
  }
  return anyFound ? total : null;
}

/** Sums every 거래처_*.csv row whose 과제 cell is exactly "거래처만" or starts with "거래처만(" -- there is no single dedicated file for this bucket (spec: 거래처 장부에만 둔다), so parity for it means counting across every vendor ledger. */
function realVendorOnlyCount(baseDir) {
  let names;
  try { names = readdirSync(baseDir).filter(name => /^거래처_.*\.csv$/u.test(name)); } catch { return null; }
  let total = 0;
  let anyFound = false;
  for (const name of names) {
    let text;
    try { text = readFileSync(path.join(baseDir, name), 'utf8'); } catch { continue; }
    anyFound = true;
    const { headers, rows } = decodeCsv(text);
    const projectIndex = headers.indexOf('과제');
    if (projectIndex === -1) continue;
    for (const row of rows) {
      const cell = String(row[projectIndex] ?? '');
      if (cell === '거래처만' || cell.startsWith('거래처만(')) total += 1;
    }
  }
  return anyFound ? total : null;
}

// R3 (coordinator, fresh review round 2): A2 item 2 renamed the on-disk bucket file
// from `과제없음_확인함.csv` to `판독_과제미정.csv`; this parity check kept reading the
// OLD name, which would silently under-report (or read stale content) forever on a
// plane refreshed with the current code. Reads the NEW name; falls back to the OLD
// name only when the new one is not present at all -- a plane that has not been
// refreshed since the rename yet still has something meaningful to compare against.
// The comparison KEY stays `no_code_confirmed` -- it is not a display label but the
// exact `PRIMARY_BUCKETS`/`bucketTally` identifier `moduleCountFor` (below) looks up
// by, and that identifier was never renamed (only the ON-DISK FILE name changed in
// A2 item 2) -- so there is no separate "old key" to alias here; this comment is the
// explicit record of that, so a future reader does not go looking for one.
const NO_CODE_CONFIRMED_FILE_NAME = '판독_과제미정.csv';
const LEGACY_NO_CODE_CONFIRMED_FILE_NAME = '과제없음_확인함.csv';
function realNoCodeConfirmedCount(commonBase) {
  const currentPath = path.join(commonBase, NO_CODE_CONFIRMED_FILE_NAME);
  const currentCount = realRowCount(currentPath);
  if (currentCount !== null) return currentCount;
  return realRowCount(path.join(commonBase, LEGACY_NO_CODE_CONFIRMED_FILE_NAME));
}

function runParity(flags) {
  const workspacesRoot = requireFlag(flags, 'workspaces-root');
  const hiworksEvents = requireFlag(flags, 'hiworks-events');
  const gmailSentEvents = requireFlag(flags, 'gmail-sent-events');
  const orgConfigPath = requireFlag(flags, 'org-config');
  if (!workspacesRoot || !hiworksEvents || !gmailSentEvents || !orgConfigPath) return;
  try {
    const pass = classifyAllCommonMail({
      workspacesRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents], orgConfigPath, ...commonTablesFromFlags(flags),
    });
    const { commonFolderName } = pass.commonConfig;
    const commonBase = path.join(workspacesRoot, commonFolderName, '020_MGMT/027_수신이력_이동이력');
    const generalWorkBase = path.join(workspacesRoot, pass.commonConfig.generalWorkFolderName, '020_MGMT/027_수신이력_이동이력');
    const real = {
      project: realProjectMailCount(workspacesRoot),
      unclassified: realRowCount(path.join(commonBase, '미분류.csv')),
      code_pending: realRowCount(path.join(commonBase, '과제코드대기.csv')),
      no_code_confirmed: realNoCodeConfirmedCount(commonBase),
      general_work: realRowCount(path.join(generalWorkBase, '일반업무_메일.csv')),
      vendor_only: realVendorOnlyCount(commonBase),
    };
    // A1 (2026-09-21 night addition): "그 뒤 parity의 과제 행은 같은 모집단끼리
    // 비교한다" -- `real.project` sums each onboarded project's OWN
    // 메일_수신이력.csv/메일_발송이력.csv row count, which necessarily counts a mail
    // shared across two projects (묶음/판독 공유 A;B) ONCE PER PROJECT it landed in
    // (it is a genuinely separate row in each project's own ledger). `bucketTally`
    // counts that same mail once, no matter how many projects it shares -- comparing
    // it directly against `real.project` would always show a "module < real" gap sized
    // exactly by however much sharing exists, which is not a defect. Use
    // `projectAttributionRows` (the row-sum equivalent) for this one bucket only, so
    // both sides count the same thing: ledger rows, not deduped mails.
    const moduleCountFor = bucket => (bucket === 'project' ? pass.projectAttributionRows : pass.bucketTally[bucket]);
    const comparison = Object.fromEntries(Object.entries(real).map(([bucket, realCount]) => [
      bucket, { module: moduleCountFor(bucket), real: realCount, diff: realCount === null ? null : moduleCountFor(bucket) - realCount },
    ]));
    console.log(JSON.stringify({
      total_mails: pass.totalMails, scanned: pass.scanned, duplicates_dropped: pass.duplicatesDropped,
      bucket_counts: pass.bucketTally, real_plane_comparison: comparison,
      rule_failures: pass.ruleFailures, owner_table_failures: pass.ownerTableFailures, unreadable_dirs: pass.unreadableDirs,
    }));
  } catch (error) {
    console.error(`workspace_ledgers_parity_failed: ${error.code ?? error.message}`);
    process.exitCode = error instanceof CommonRefreshError ? 3 : 3;
  }
}

function runTriageList(flags) {
  const workspacesRoot = requireFlag(flags, 'workspaces-root');
  const hiworksEvents = requireFlag(flags, 'hiworks-events');
  const gmailSentEvents = requireFlag(flags, 'gmail-sent-events');
  const orgConfigPath = requireFlag(flags, 'org-config');
  if (!workspacesRoot || !hiworksEvents || !gmailSentEvents || !orgConfigPath) return;
  const limitRaw = flags.get('limit');
  const limit = typeof limitRaw === 'string' ? Number(limitRaw) : undefined;
  const asJson = flags.get('json') === true || flags.get('json') === 'true';
  // Default list = truly unclassified only (spec section 7); pass this to also pull
  // in mail already filed under a known organisation but still missing a project
  // (coordinator, 2026-09-21) -- a different, opt-in sweep.
  const includeOrganisationUndecided = flags.get('include-organisation-undecided') === true
    || flags.get('include-organisation-undecided') === 'true';
  // S6 (coordinator, fresh review round 2): omitted (the default), a malformed Owner
  // table refuses the whole call (see `listUnclassified`'s own doc) -- pass this to
  // opt back into the old (degraded but returning) behaviour explicitly.
  const allowDegradedOwnerTables = flags.get('allow-degraded-owner-tables') === true || flags.get('allow-degraded-owner-tables') === 'true';
  try {
    const result = listUnclassified({
      workspacesRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents], orgConfigPath,
      ...commonTablesFromFlags(flags), ...(limit !== undefined ? { limit } : {}), includeOrganisationUndecided, allowDegradedOwnerTables,
    });
    // `list`'s default output carries subject/names (spec section 7) -- printed to
    // stdout only, never written to a receipts/log file by this command.
    if (asJson) { console.log(JSON.stringify(result)); return; }
    console.log(`총 ${result.total}건, ${result.items.length}건 표시`);
    for (const item of result.items) {
      console.log(`- [${item.bucket}] ${item.mail_source_id} ${item.received_at} ${item.subject} | ${item.from?.name ?? item.from?.email ?? ''}`);
    }
  } catch (error) {
    // S6: a non-zero exit with a clear reason -- `workspace_ledgers_triage_owner_table_
    // failures` names the failing table(s) in `error.message` (see `TriageError`'s own
    // `code: detail` message shape).
    console.error(`workspace_ledgers_triage_list_failed: ${error.code ?? error.message}`);
    if (error?.code === 'workspace_ledgers_triage_owner_table_failures') {
      console.error('-- pass --allow-degraded-owner-tables to proceed with a degraded list');
    }
    process.exitCode = 3;
  }
}

function runTriageDecide(flags) {
  const workspacesRoot = requireFlag(flags, 'workspaces-root');
  const readingTablePath = requireFlag(flags, 'reading-table');
  const id = requireFlag(flags, 'id');
  const level = requireFlag(flags, 'level');
  const why = requireFlag(flags, 'why');
  const reader = requireFlag(flags, 'reader');
  if (!workspacesRoot || !readingTablePath || !id || !level || !why || !reader) return;
  const targetRaw = flags.get('target');
  const target = typeof targetRaw === 'string' ? targetRaw : '';
  const lineageRaw = flags.get('lineage');
  const lineagePath = typeof lineageRaw === 'string' ? lineageRaw : null;
  // A2 item 4 (2026-09-21 night addition): a comma-separated allowlist of reader
  // names/ids this CLI invocation considers human -- omitted (the default, `null`), no
  // restriction applies, matching today's behaviour exactly.
  const humanActorsRaw = flags.get('human-actors');
  const humanActors = typeof humanActorsRaw === 'string' ? humanActorsRaw.split(',').map(item => item.trim()).filter(Boolean) : null;
  // nit (coordinator, fresh review round 2): fills 수신일/제목 in the written row when
  // the caller (a lane wrapper that already has this from its own `triage list` call)
  // supplies them -- omitted (the default), both stay empty, unchanged from before.
  // 2026-09-22: `appendReadingDecision` itself now normalises `--received-at` to the
  // Seoul calendar date when it parses as a date at all (an already-YYYY-MM-DD value
  // passes through unchanged) -- this CLI passes the raw flag value straight through
  // and lets that one shared normalisation decide, rather than duplicating it here.
  const receivedAtRaw = flags.get('received-at');
  const receivedAt = typeof receivedAtRaw === 'string' ? receivedAtRaw : '';
  const subjectRaw = flags.get('subject');
  const subject = typeof subjectRaw === 'string' ? subjectRaw : '';
  try {
    const result = appendReadingDecision({
      workspacesRoot, readingTablePath, lineagePath, id, level, target, why, reader, humanActors, receivedAt, subject,
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`workspace_ledgers_triage_decide_failed: ${error.code ?? error.message}`);
    process.exitCode = error instanceof TriageError ? exitCodeFor(error.code) : 3;
  }
}

function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  if (command === 'triage') {
    const flags = parseArgs(rest);
    if (sub === 'list') { runTriageList(flags); return; }
    if (sub === 'decide') { runTriageDecide(flags); return; }
    usageError(`unknown "triage" subcommand "${sub ?? ''}" (expected list | decide)`);
    return;
  }
  const flags = parseArgs([sub, ...rest].filter(token => token !== undefined));
  if (command === 'refresh') { runRefresh(flags); return; }
  if (command === 'preview-rule') { runPreviewRule(flags); return; }
  if (command === 'save-rule') { runSaveRule(flags); return; }
  if (command === 'common-refresh') { runCommonRefresh(flags); return; }
  if (command === 'parity') { runParity(flags); return; }
  usageError(`unknown command "${command ?? ''}" (expected refresh | preview-rule | save-rule | common-refresh | parity | triage)`);
}

main();
