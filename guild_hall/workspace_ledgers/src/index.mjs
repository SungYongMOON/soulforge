// Single entry point for external callers (e.g. a console/UI adapter) of this module.
// Every exported function takes one options object with paths/directories passed
// explicitly -- nothing in this library reads environment variables or other implicit
// config, so a caller (this process or another) fully controls what gets read/written.
//
// Required signatures (workspacesRoot/workmetaRoot and custody directories are always
// explicit arguments, never inferred):
//   listProjects({ workspacesRoot })
//     -> [{ project_code, folder_name, rule_json_path, rule_md_path }]
//   readRule({ workspacesRoot, code })
//     -> { project_code, folder_name, json, md, json_path, md_path, sha256_json, sha256_md }
//   previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields?, orgConfigPath?,
//                 bundleTablePath?, readingTablePath? })
//     -> { matched_before, matched_after, moved_in, moved_out, newly_held, samples, rule_failures,
//          table_attributed? }
//        `orgConfigPath` (optional) resolves the same `system_sender_domains` merge a
//        real `refresh()` against that config would use; omitted, only the built-in
//        default skip list applies. `rule_failures` (fresh-review-5 #7) lists any OTHER
//        project whose own saved rule failed to read/compile and was excluded from this
//        comparison -- non-empty means the counts above are computed with fewer rules
//        in play than normal; render it as a caveat (or don't render `measured` at all)
//        rather than presenting the counts as complete, the same way `saveRuleVersion`
//        does when it renders `measured` into the Owner-facing rule `.md`.
//        `bundleTablePath`/`readingTablePath` (부록 A1, 2026-09-21 night addition,
//        both optional): when either is supplied, the return gains `table_attributed`
//        -- how many mails this project would ALSO gain via the Owner tables, on top
//        of (never instead of) the draft's own subject-rule comparison above, which is
//        unaffected either way. Omitted (the default), no new key is added at all, so
//        an existing caller's result is unchanged.
//   saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now?, measured?, allowedActors? })
//     -> { project_code, folder_name, previous_version, rule_version, json_path, md_path,
//          history_json_path, history_md_path, sha256_json, sha256_md }
//   refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
//             projects?, fields?, dry?, receiptsDir, now?, allowEmpty?, allowPartialSources?,
//             bundleTablePath?, readingTablePath?, allowDegradedOwnerTables? })
//     -> the refresh receipt body (soulforge.workspace_ledgers_refresh_receipt.v1);
//        `receipt.status` is `'failed'` when one or more ledger files failed strict
//        validation (`receipt.ledger_failures`), when any custody directory could not
//        be read (`receipt.unreadable_dirs`), or when a saved rule for one project
//        failed to read/compile (`receipt.rule_failures` -- that project alone is
//        excluded, S-8) -- every other file for every other project still refreshed in
//        each case. fresh-review-5 (design simplification): there is no per-mail match
//        timeout and no cumulative match-time run budget any more -- matching is a
//        direct call now (see `classifier.mjs`'s `classifyMail` doc for why).
//        `rule_failures[].term_ref` (fresh-review-5 #9), when present, is
//        `{ list, index, label_hash }` -- never the term's own label text, which is
//        Owner-authored routing keyword text and may itself be a real name.
//        REQUIRED CHANGE (fresh-review-4 S-5): `allowEmpty` MUST be an array of
//        project codes now -- a bare `true` (if this adapter was passing one) now
//        THROWS `workspace_ledgers_allow_empty_must_be_list` instead of silently
//        matching no projects. Pass `[]` for "no override", or the exact codes that
//        need one; every code must be a real, currently-onboarded project whose rule
//        did NOT fail this run, or the call throws `workspace_ledgers_unknown_project`
//        (code does not exist) / `workspace_ledgers_allow_empty_targets_rule_failure`
//        (fresh-review-5 #8: code exists but that project's own rule failed to compile
//        this run -- check `receipt.rule_failures` first). Codes that actually needed
//        the override are echoed in `receipt.allow_empty_applied_to`.
//        `allowPartialSources` (default false): an unreadable custody directory blocks
//        every write for the whole run unless this is explicitly true, in which case
//        the run proceeds on whatever custody was readable
//        (`receipt.allow_partial_sources_applied`).
//        `bundleTablePath`/`readingTablePath` (부록 A1, 2026-09-21 night addition, both
//        `null` by default): omitted, no table is read and every result is byte-
//        identical to before this addition. Supplying either also attributes mail via
//        the common pipeline's bundle/reading tables (spec section 1 steps 2-3) into
//        the four project ledgers -- never overriding a subject-rule hit or a
//        two-project hold. A malformed table blocks the whole run
//        (`receipt.owner_table_failures`, `status: 'failed'`) unless
//        `allowDegradedOwnerTables: true` is passed. `receipt.table_attributed_mails`
//        and `receipt.search_eligible_attributions` (부록 A2 item 5) are always present.
export { isMachineActor, listProjects, readRule, RuleStoreError, saveRuleVersion, validateRule } from './rule_store.mjs';
export { clearCustodyCache, previewRule, refresh, RefreshError } from './refresh.mjs';
export {
  classifyMail, compileRule, compileRules, hintCodes, MATCH_FIELDS, normalizeYieldsTo, RuleCompileError, RULE_SCHEMA_VERSION,
} from './classifier.mjs';
export { buildContacts, buildHistory, buildReplyStatus, decodeCsv, encodeCsv, LEDGER_SCHEMA, normalizeSubject, seoulDateOf } from './ledgers.mjs';
export { loadMailEvents, parseAddressField } from './mail_events.mjs';

// ---------------------------------------------------------------------------------
// Step 1 (common-folder / org-wide classification, spec
// `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md` sections 1-7) additions below. These
// are new exports -- every function above this line keeps its existing name and
// argument shape unchanged, so the console/UI adapter's existing calls
// (`listProjects`, `readRule`, `previewRule`, `saveRuleVersion`, `refresh`) are
// unaffected.
export { buildCommonConfig, classifyByOwnerTables, classifyProjectHits, PRIMARY_BUCKETS, resolvePrimaryBucket, workTagsOf } from './common_classifier.mjs';
export {
  categoryOf, headersFor as commonLedgerHeadersFor, vendorFileName, whereLabelFor, workTagFileName,
} from './common_ledgers.mjs';
export { loadOwnerTables, READING_LEVELS } from './owner_tables.mjs';
export { classifyAllCommonMail, CommonRefreshError, refreshCommon } from './common_refresh.mjs';
export { appendReadingDecision, listUnclassified, TriageError } from './triage.mjs';
