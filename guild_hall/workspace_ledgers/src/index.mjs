// Single entry point for external callers (e.g. a console/UI adapter) of this module.
// Every exported function takes one options object with paths/directories passed
// explicitly -- nothing in this library reads environment variables or other implicit
// config, so a caller (this process or another) fully controls what gets read/written.
//
// K1 (coordinator, fresh review round 3, settled round 2's D-b -- READ THIS FIRST):
// project-ledger step 1 (the project's own title/subject rule) matches the SUBJECT
// ONLY, full stop, everywhere below. `fields`, wherever it appears in a signature
// below, is accepted ONLY for backward compatibility and MUST be exactly
// `['subject']` (`DEFAULT_MATCH_FIELDS`, exported below, checked by VALUE not
// reference) -- any other value (including the old, now-gone `MATCH_FIELDS` full
// enum) THROWS `workspace_ledgers_fields_not_supported`
// (`FIELDS_NOT_SUPPORTED_CODE`, also exported below -- `assertSubjectOnlyFields`/
// `isSubjectOnlyFields`, exported for a caller that wants to check a value before
// calling in). A saved rule's own `match_fields` property stays schema-valid
// (`compileRule` still accepts and validates it -- existing saved rules on the
// private plane still carry `["subject", "body_text", "attachment_names"]`) but is
// NOT consulted for step-1 ledger placement any more; do not add it expecting it to
// widen matching. Body text only ever matters via step 4 (a supplier-type vendor
// mail whose body contains exactly one project's exact keyword -- see
// `vendorTablePath` below), which is unaffected by `fields` either way.
//
// `classifyMail`/`hintCodes` (re-exported below from `classifier.mjs`) are the
// LOW-LEVEL match primitive `classifyProjectHits` itself is built from -- they accept
// an arbitrary `fields` list and will happily match against `body_text`/
// `attachment_names` when asked to. They are exported for callers that need that raw
// primitive directly (step 4's own supplier-body tie-break is exactly one such use,
// internal to this module), but a caller building a NEW step-1-shaped entry point of
// its own must still enforce subject-only itself (`assertSubjectOnlyFields`) -- these
// two functions do not do it for you, and are never a step-1 entry point on their own.
//
// Required signatures (workspacesRoot/workmetaRoot and custody directories are always
// explicit arguments, never inferred):
//   listProjects({ workspacesRoot })
//     -> [{ project_code, folder_name, rule_json_path, rule_md_path }]
//   readRule({ workspacesRoot, code })
//     -> { project_code, folder_name, json, md, json_path, md_path, sha256_json, sha256_md }
//   previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields?, orgConfigPath?,
//                 bundleTablePath?, readingTablePath?, vendorTablePath? })
//     -> { rule_matched_before, rule_matched_after, matched_before, matched_after,
//          table_attributed_after, matched_from_system_senders, moved_in, moved_out,
//          newly_held, duplicates_dropped, id_collisions_kept, samples, rule_failures,
//          owner_table_failures }
//        R4 (coordinator decision, fresh review round 4): TWO views, never conflated.
//        `rule_matched_before`/`rule_matched_after` are step 1 ONLY -- mails this
//        project's OWN subject terms place here (every other onboarded project's rule
//        still in play for hold-detection, but every Owner table emptied out) -- the
//        number that actually reflects what editing the rule ITSELF changes.
//        `matched_before`/`matched_after` are what `refresh()` will ACTUALLY write for
//        this project (every step -- subject rule, bundle table, reading table,
//        supplier-body tie-break). `table_attributed_after` is the portion of
//        `matched_after` NOT explained by this rule's own subject terms (an Owner
//        table, or step 4, holding mail the rule itself no longer would), clamped at
//        0. There is no `table_attributed` field any more (D-a: one classification
//        function means a table hit is baked into `matched_before`/`matched_after`
//        directly, on BOTH sides, since the table is not part of the draft being
//        previewed -- removed, replaced by the split above).
//        K2 (coordinator, fresh review round 3): `previewRule` reads custody through
//        the exact SAME loader/window `refresh()` does, with no system-sender/
//        skip-subject pre-filter -- `matched_before`/`matched_after` are NEVER
//        reduced by system-sender status; `matched_from_system_senders` reports that
//        population separately, purely for the Owner's own visibility.
//        `orgConfigPath` (optional) resolves the same merged system-sender list a
//        real `refresh()` against that config would use; omitted, only the built-in
//        default list applies. `rule_failures` (fresh-review-5 #7) lists any OTHER
//        project whose own saved rule failed to read/compile and was excluded from this
//        comparison; `owner_table_failures` (S1, fresh review round 4) lists any Owner
//        table that failed to load. BOTH need the exact same caveat treatment when
//        rendering `measured` into an Owner-facing doc -- non-empty means the counts
//        above are computed with less than the full picture in play; render a caveat
//        (or don't render `measured` at all) rather than presenting the counts as
//        complete, the same way `saveRuleVersion` does when it renders `measured` into
//        the Owner-facing rule `.md` (see `renderMeasuredLine` in `rule_store.mjs`).
//        `bundleTablePath`/`readingTablePath`/`vendorTablePath` (all optional, `null`
//        by default): each falls back to `orgConfig.common_ledgers.owner_tables.
//        {bundle,reading,vendor}` when omitted (S-b) -- see `refresh()`'s own note
//        below, which applies here identically, including S3's fail-closed behaviour
//        for a config-resolved path naming a file that does not exist.
//   saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now?, measured?, allowedActors? })
//     -> { project_code, folder_name, previous_version, rule_version, json_path, md_path,
//          history_json_path, history_md_path, sha256_json, sha256_md }
//   refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
//             projects?, fields?, dry?, receiptsDir, now?, allowEmpty?, allowPartialSources?,
//             bundleTablePath?, readingTablePath?, vendorTablePath?, allowDegradedOwnerTables? })
//     -> the refresh receipt body (soulforge.workspace_ledgers_refresh_receipt.v1);
//        `fields` -- see K1 above: accepted only for backward compatibility, must be
//        exactly `['subject']`/omitted, throws otherwise. A rule with no explicit
//        `match_fields` of its own, or an adapter never passing `fields`, matches
//        step 1 against the subject ONLY -- there is no way to widen this back any
//        more (round 2's "pass `fields: MATCH_FIELDS` to widen it back" is gone).
//        Body text still matters via step 4 (see `vendorTablePath` below) -- that is
//        unaffected either way.
//        `receipt.status` is `'failed'` when one or more ledger files failed strict
//        validation (`receipt.ledger_failures`), when any custody directory could not
//        be read (`receipt.unreadable_dirs`), when a saved rule for one project
//        failed to read/compile (`receipt.rule_failures` -- that project alone is
//        excluded, S-8), or when an Owner table failed to load (`receipt.owner_table_
//        failures`, unless `allowDegradedOwnerTables: true`) -- every other file for
//        every other project still refreshed in each case. fresh-review-5 (design
//        simplification): there is no per-mail match timeout and no cumulative
//        match-time run budget any more -- matching is a direct call now (see
//        `classifier.mjs`'s `classifyMail` doc for why).
//        `rule_failures[].term_ref` (fresh-review-5 #9), when present, is
//        `{ list, index, label_hash }` -- never the term's own label text, which is
//        Owner-authored routing keyword text and may itself be a real name.
//        `allowEmpty` MUST be an array of project codes -- a bare `true` THROWS
//        `workspace_ledgers_allow_empty_must_be_list` instead of silently matching no
//        projects. Pass `[]` for "no override", or the exact codes that need one;
//        every code must be a real, currently-onboarded project whose rule did NOT
//        fail this run, or the call throws `workspace_ledgers_unknown_project` (code
//        does not exist) / `workspace_ledgers_allow_empty_targets_rule_failure`
//        (fresh-review-5 #8: code exists but that project's own rule failed to compile
//        this run -- check `receipt.rule_failures` first). Codes that actually needed
//        the override are echoed in `receipt.allow_empty_applied_to`.
//        `allowPartialSources` (default false): an unreadable custody directory blocks
//        every write for the whole run unless this is explicitly true, in which case
//        the run proceeds on whatever custody was readable
//        (`receipt.allow_partial_sources_applied`).
//        `bundleTablePath`/`readingTablePath`/`vendorTablePath` (all `null` by
//        default): each falls back to `orgConfig.common_ledgers.owner_tables.
//        {bundle,reading,vendor}` when omitted (S-b, coordinator fresh review round
//        3) -- an explicit param always wins. Supplying `bundleTablePath`/
//        `readingTablePath` (via either source) attributes mail via the common
//        pipeline's bundle/reading tables (steps 2-3) into the four project ledgers;
//        supplying `vendorTablePath` additionally enables step 4 (a supplier-type
//        vendor mail whose body contains exactly one project's exact keyword). None of
//        the three ever overrides a subject-rule hit or a two-project hold. A
//        malformed table blocks the whole run (`receipt.owner_table_failures`,
//        `status: 'failed'`) unless `allowDegradedOwnerTables: true` is passed. S3
//        (fresh review round 4): a path resolved from ORG CONFIG (not an explicit
//        argument) naming a file that does not exist is itself a failure
//        (`workspace_ledgers_owner_table_configured_but_missing`) -- distinct from "no
//        table configured", which only an omitted param/config entry means; an
//        EXPLICITLY passed missing path keeps the original silent-skip behaviour.
//        `receipt.owner_tables_used` (S-b) is `[{ table, file, sha256 }]` for every
//        table actually read this run (`file` a basename only, never a host path) --
//        `refresh` and `refreshCommon`/`parity`/`triage` MUST run against the SAME
//        resolved table set for the same custody window, or the partition invariant
//        between the project ledgers and the common-folder ledgers breaks.
//        `receipt.table_attributed_mails` and `receipt.project_search_eligible_
//        attributions` (renamed, S3 round 2) are always present. S-c (round 3): two
//        top-level org-config keys change what counts as a system sender --
//        `system_sender_exclude_domains` (opts specific domains OUT of the built-in
//        list) and `system_sender_builtin: false` (drops the built-in list entirely);
//        neither is set by default.
export {
  assertSubjectOnlyFields, classifyMail, compileRule, compileRules, DEFAULT_MATCH_FIELDS, FIELDS_NOT_SUPPORTED_CODE,
  hintCodes, isSubjectOnlyFields, MATCH_FIELDS, normalizeYieldsTo, RuleCompileError, RULE_SCHEMA_VERSION,
} from './classifier.mjs';
export { isMachineActor, listProjects, readRule, RuleStoreError, saveRuleVersion, validateRule } from './rule_store.mjs';
export { clearCustodyCache, previewRule, refresh, RefreshError } from './refresh.mjs';
export { buildContacts, buildHistory, buildReplyStatus, decodeCsv, encodeCsv, LEDGER_SCHEMA, normalizeSubject, seoulDateOf } from './ledgers.mjs';
export { loadMailEvents, parseAddressField } from './mail_events.mjs';

// ---------------------------------------------------------------------------------
// Step 1 (common-folder / org-wide classification, private handoff spec sections 1-7)
// additions below. These are new exports -- every function above this line keeps its
// existing NAME and ARGUMENT SHAPE unchanged (no removed/renamed params), so an
// existing call site still compiles and runs -- but see `refresh()`'s and
// `previewRule()`'s own notes above on `fields` (K1): it is now a hard constraint, not
// merely a changed default, for a caller that reaches either function.
export { baseBasisOf, buildCommonConfig, buildSystemSenderConfig, classifyByOwnerTables, classifyProjectHits, detectSystemSender,
  detectSystemSource, PRIMARY_BUCKETS, resolvePrimaryBucket, STEP1_TITLE_BASIS, THREAD_VENDOR_INHERITANCE_MARKER,
  workTagsOf } from './common_classifier.mjs';
export {
  categoryOf, headersFor as commonLedgerHeadersFor, vendorFileName, whereLabelFor, workTagFileName,
} from './common_ledgers.mjs';
export { loadOwnerTables, OwnerTableConfigError, READING_LEVELS, resolveOwnerTablePaths } from './owner_tables.mjs';
export { classifyAllCommonMail, CommonRefreshError, refreshCommon } from './common_refresh.mjs';
// 2026-09-22 (bot-wrapper addition): the exclude-target vocabulary is exported so a
// wrapper that OFFERS a fixed menu of categories to a local model reads it from here
// rather than copying the tokens into its own source. `listUnclassified`'s items also
// gained an additive `candidates` array (the classifier's own candidate project codes
// for a mail it did not attribute) -- no existing field changed.
export {
  appendReadingDecision, EXCLUDE_FIXED_TARGETS, EXCLUDE_LEGACY_TARGETS, EXCLUDE_PREFIXES,
  isAllowedExcludeTarget, listUnclassified, TriageError,
} from './triage.mjs';
