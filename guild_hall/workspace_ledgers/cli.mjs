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
// fresh rows where its existing ledger had content still fails closed for it.
// `refresh` also accepts an optional `--allow-partial-sources` (fresh-review-3 #1):
// without it, any unreadable custody directory blocks every write for the whole run
// (the failed receipt is still written); with it, the run proceeds on whatever
// custody was readable, and the receipt records `allow_partial_sources_applied`.
// `save-rule` accepts an optional `--allowed-actors a,b,c` (N16) to further restrict
// `--by` to that exact list, on top of the always-applied machine-actor refusal.
// `preview-rule` prints counts only by default; `--show-samples` also prints
// `samples`, which carries real mail subjects (fresh-review-2 #6) -- private, not for
// casual/automated logging. `preview-rule` accepts an optional `--org-config` so its
// counts use the same `system_sender_domains` skip list a real `refresh` against that
// config would (fresh-review-3 #6); omitted, only the built-in default list applies.
import { readFileSync } from 'node:fs';
import { MATCH_FIELDS } from './src/classifier.mjs';
import { previewRule, refresh, RefreshError } from './src/refresh.mjs';
import { RuleStoreError, saveRuleVersion } from './src/rule_store.mjs';

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

function fieldsOf(flags) {
  const raw = flags.get('fields');
  if (raw === undefined || raw === 'all') return MATCH_FIELDS;
  if (raw === 'subject') return ['subject'];
  usageError(`--fields must be "subject" or "all", got "${raw}"`);
  return null;
}

function exitCodeFor(code) {
  if (typeof code !== 'string') return 3;
  if (code.includes('lock')) return 3;
  if (code.includes('required') || code.includes('invalid') || code.includes('unknown_project')
    || code.includes('no_projects_found') || code.includes('not_found') || code.includes('unreadable')) return 2;
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
  const allowEmpty = typeof allowEmptyRaw === 'string' ? allowEmptyRaw.split(',').map(item => item.trim()).filter(Boolean) : [];
  const allowPartialSources = flags.get('allow-partial-sources') === true || flags.get('allow-partial-sources') === 'true';
  try {
    const receipt = refresh({ workspacesRoot, workmetaRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents],
      orgConfigPath, projects, fields, dry, receiptsDir, allowEmpty, allowPartialSources });
    console.log(JSON.stringify(receipt));
    // R4: one or more ledger files failed strict validation and were left untouched;
    // every other file still refreshed. That is a real failure for automation to
    // notice, even though this call did not throw.
    if (receipt.status === 'failed') {
      console.error(`workspace_ledgers_refresh_ledger_validation_failed: ${JSON.stringify(receipt.ledger_failures)}`);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`workspace_ledgers_refresh_failed: ${error.code ?? error.message}`);
    process.exitCode = error instanceof RefreshError ? exitCodeFor(error.code) : 3;
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
  try {
    const result = previewRule({ workspacesRoot, code, draft, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents], fields, orgConfigPath });
    // fresh-review-2 #6: `samples` carries real mail subjects -- printed only when
    // explicitly asked for, never by default.
    const { samples, ...counts } = result;
    console.log(JSON.stringify(showSamples ? result : counts));
  } catch (error) {
    console.error(`workspace_ledgers_preview_rule_failed: ${error.code ?? error.message}`);
    process.exitCode = error instanceof RefreshError ? exitCodeFor(error.code) : 3;
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

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseArgs(rest);
  if (command === 'refresh') { runRefresh(flags); return; }
  if (command === 'preview-rule') { runPreviewRule(flags); return; }
  if (command === 'save-rule') { runSaveRule(flags); return; }
  usageError(`unknown command "${command ?? ''}" (expected refresh | preview-rule | save-rule)`);
}

main();
