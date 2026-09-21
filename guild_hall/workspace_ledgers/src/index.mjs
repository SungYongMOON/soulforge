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
//   previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields?, orgConfigPath? })
//     -> { matched_before, matched_after, moved_in, moved_out, newly_held, samples }
//        `orgConfigPath` (optional) resolves the same `system_sender_domains` merge a
//        real `refresh()` against that config would use; omitted, only the built-in
//        default skip list applies.
//   saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now?, measured?, allowedActors? })
//     -> { project_code, folder_name, previous_version, rule_version, json_path, md_path,
//          history_json_path, history_md_path, sha256_json, sha256_md }
//   refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
//             projects?, fields?, dry?, receiptsDir, now?, allowEmpty?, allowPartialSources? })
//     -> the refresh receipt body (soulforge.workspace_ledgers_refresh_receipt.v1);
//        `receipt.status` is `'failed'` when one or more ledger files failed strict
//        validation (`receipt.ledger_failures`), when any custody directory could not
//        be read (`receipt.unreadable_dirs`), when a saved rule for one project failed
//        to read/compile (`receipt.rule_failures` -- that project alone is excluded,
//        S-8), or when one mail's matching overran its per-mail budget
//        (`receipt.match_timeouts`, S-1) -- every other file for every other project
//        still refreshed in each case. `receipt.match_run_budget_exceeded` (S-2, non-
//        null only when it triggered) is a harder gate: it means nothing was written
//        for ANY project this run, same as an unreadable custody directory without
//        `allowPartialSources`.
//        REQUIRED CHANGE (fresh-review-4 S-5): `allowEmpty` MUST be an array of
//        project codes now -- a bare `true` (if this adapter was passing one) now
//        THROWS `workspace_ledgers_allow_empty_must_be_list` instead of silently
//        matching no projects. Pass `[]` for "no override", or the exact codes that
//        need one; every code must be a real, currently-onboarded project or the call
//        throws `workspace_ledgers_unknown_project`. Codes that actually needed the
//        override are echoed in `receipt.allow_empty_applied_to`.
//        `allowPartialSources` (default false): an unreadable custody directory blocks
//        every write for the whole run unless this is explicitly true, in which case
//        the run proceeds on whatever custody was readable
//        (`receipt.allow_partial_sources_applied`).
export { isMachineActor, listProjects, readRule, RuleStoreError, saveRuleVersion, validateRule } from './rule_store.mjs';
export { clearCustodyCache, previewRule, refresh, RefreshError } from './refresh.mjs';
export {
  classifyMail, compileRule, compileRules, hintCodes, MATCH_FIELDS, normalizeYieldsTo, RuleCompileError, RULE_SCHEMA_VERSION,
} from './classifier.mjs';
export { buildContacts, buildHistory, buildReplyStatus, decodeCsv, encodeCsv, LEDGER_SCHEMA, seoulDateOf } from './ledgers.mjs';
export { loadMailEvents, parseAddressField } from './mail_events.mjs';
