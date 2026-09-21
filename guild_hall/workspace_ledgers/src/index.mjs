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
//   previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields? })
//     -> { matched_before, matched_after, moved_in, moved_out, newly_held, samples }
//   saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now?, measured? })
//     -> { project_code, folder_name, previous_version, rule_version, json_path, md_path,
//          history_json_path, history_md_path, sha256_json, sha256_md }
//   refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
//             projects?, fields?, dry?, receiptsDir, now? })
//     -> the refresh receipt body (soulforge.workspace_ledgers_refresh_receipt.v1)
export { isMachineActor, listProjects, readRule, RuleStoreError, saveRuleVersion, validateRule } from './rule_store.mjs';
export { previewRule, refresh, RefreshError } from './refresh.mjs';
export {
  classifyMail, compileRule, compileRules, hintCodes, MATCH_FIELDS, normalizeYieldsTo, RuleCompileError, RULE_SCHEMA_VERSION,
} from './classifier.mjs';
export { buildContacts, buildHistory, buildReplyStatus, decodeCsv, encodeCsv, LEDGER_SCHEMA } from './ledgers.mjs';
export { loadMailEvents, parseAddressField } from './mail_events.mjs';
