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
//        validation and were left untouched (`receipt.ledger_failures`), or when any
//        custody directory could not be read (`receipt.unreadable_dirs`) -- every other
//        file for every other project still refreshed. `allowEmpty` is a list of
//        project codes (not a boolean) allowed to rebuild down to zero rows; codes that
//        actually needed it are echoed in `receipt.allow_empty_applied_to`.
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
