#!/usr/bin/env node
// CLI entry point for the workspace ledgers module. Three subcommands:
//   refresh       rewrite a project's four management CSVs from mail custody
//   preview-rule  read-only comparison of a draft rule against custody (no writes)
//   save-rule     version-bump a project's saved mail routing rule
//
// Exit codes: 0 success, 2 usage/config error (bad flags, unreadable/invalid input
// that never reached a write), 3 runtime failure during execution (lock held, write
// failure, rule store error after args were valid).
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
  try {
    const receipt = refresh({ workspacesRoot, workmetaRoot, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents],
      orgConfigPath, projects, fields, dry, receiptsDir });
    console.log(JSON.stringify(receipt));
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
  try {
    const result = previewRule({ workspacesRoot, code, draft, hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents], fields });
    console.log(JSON.stringify(result));
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
  try {
    const result = saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note });
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
