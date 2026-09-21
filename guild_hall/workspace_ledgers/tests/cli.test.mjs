import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { BUNDLE_HEADERS_V2 } from '../src/owner_tables.mjs';
import { encodeCsv } from '../src/ledgers.mjs';

const CLI_PATH = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const CODE = 'P00-001';
const FOLDER = 'P00-001_예시과제';
const RULE_DIR = '020_MGMT/021_자동화설정_운영규칙';

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-cli-'));
  const workspacesRoot = path.join(root, '_workspaces');
  const ruleDir = path.join(workspacesRoot, FOLDER, RULE_DIR);
  mkdirSync(ruleDir, { recursive: true });
  const rule = {
    schema_version: RULE_SCHEMA_VERSION, project_code: CODE, folder_name: FOLDER, rule_version: 'v1', status: 'draft',
    match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: [{ label: 'P00-001', kind: 'literal', value: 'P00-001' }], hint: [],
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  };
  writeFileSync(path.join(ruleDir, 'mail_routing_rule.json'), `${JSON.stringify(rule, null, 2)}\n`);
  const hiworksDir = path.join(root, 'events', 'hiworks');
  mkdirSync(hiworksDir, { recursive: true });
  writeFileSync(path.join(hiworksDir, 'events.jsonl'), JSON.stringify({
    event_id: 'h1', subject: '[P00-001] REAL SUBJECT TEXT THAT MUST STAY PRIVATE', from: 'a@example.com', to: [], cc: [],
    received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [],
  }));
  const gmailDir = path.join(root, 'events', 'gmail');
  mkdirSync(gmailDir, { recursive: true });
  writeFileSync(path.join(gmailDir, 'events.jsonl'), '');
  const draftPath = path.join(root, 'draft.json');
  writeFileSync(draftPath, JSON.stringify({ ...rule, exact: [...rule.exact, { label: '새트리거', kind: 'literal', value: '새트리거' }] }));
  const workmetaRoot = path.join(root, '_workmeta');
  const receiptsDir = path.join(root, 'receipts');
  mkdirSync(receiptsDir, { recursive: true });
  const orgConfigPath = path.join(root, 'org_config.json');
  writeFileSync(orgConfigPath, JSON.stringify({ our_domain: 'example.com', organisations: {}, family: {} }));
  return { root, workspacesRoot, workmetaRoot, hiworksDir, gmailDir, draftPath, receiptsDir, orgConfigPath };
}

test('cli preview-rule (fresh-review-2 #6): samples are hidden by default, shown only with --show-samples', () => {
  const fixture = makeFixture();
  try {
    const baseArgs = ['preview-rule', '--workspaces-root', fixture.workspacesRoot, '--code', CODE, '--draft', fixture.draftPath,
      '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir];

    const defaultOut = execFileSync(process.execPath, [CLI_PATH, ...baseArgs], { encoding: 'utf8' });
    const defaultResult = JSON.parse(defaultOut);
    assert.equal('samples' in defaultResult, false);
    assert.equal(typeof defaultResult.matched_before, 'number');
    assert.equal(defaultOut.includes('REAL SUBJECT TEXT'), false);

    const shownOut = execFileSync(process.execPath, [CLI_PATH, ...baseArgs, '--show-samples'], { encoding: 'utf8' });
    const shownResult = JSON.parse(shownOut);
    assert.equal('samples' in shownResult, true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('cli refresh (S-5, fresh-review-4): a valueless --allow-empty is a usage error, exit code 2, no receipt written', () => {
  const fixture = makeFixture();
  try {
    const args = ['refresh', '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
      '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir, '--org-config', fixture.orgConfigPath,
      '--receipts', fixture.receiptsDir, '--dry', '--allow-empty'];
    let error;
    try { execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' }); }
    catch (thrown) { error = thrown; }
    assert.ok(error, 'expected the CLI to exit non-zero');
    assert.equal(error.status, 2);
    assert.match(error.stderr, /--allow-empty requires a comma-separated project-code list/u);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('cli refresh (K1, coordinator fresh review round 3): --fields all is gone, a usage error, exit code 2', () => {
  const fixture = makeFixture();
  try {
    const args = ['refresh', '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
      '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir, '--org-config', fixture.orgConfigPath,
      '--receipts', fixture.receiptsDir, '--dry', '--fields', 'all'];
    let error;
    try { execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' }); }
    catch (thrown) { error = thrown; }
    assert.ok(error, 'expected the CLI to exit non-zero');
    assert.equal(error.status, 2);
    assert.match(error.stderr, /--fields must be "subject"/u);
    assert.match(error.stderr, /"all" is no longer supported/u);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('cli preview-rule (K1): --fields subject is still accepted explicitly (back-compat with the merged console adapter)', () => {
  const fixture = makeFixture();
  try {
    const args = ['preview-rule', '--workspaces-root', fixture.workspacesRoot, '--code', CODE, '--draft', fixture.draftPath,
      '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir, '--fields', 'subject'];
    const out = execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
    const result = JSON.parse(out);
    assert.equal(typeof result.matched_before, 'number');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('cli preview-rule (SHOULD, coordinator fresh review round 5): an owner_table_failures entry prints the same class of stderr caveat rule_failures already gets', () => {
  const fixture = makeFixture();
  try {
    const bundleTablePath = path.join(fixture.root, '묶음_확정표.csv');
    writeFileSync(bundleTablePath, encodeCsv(['잘못된헤더'], [['x']])); // header mismatch -- a real owner_table_failures entry
    const args = ['preview-rule', '--workspaces-root', fixture.workspacesRoot, '--code', CODE, '--draft', fixture.draftPath,
      '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir, '--bundle-table', bundleTablePath];
    const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0); // a malformed table never throws previewRule -- it is reported, not fatal
    assert.match(result.stderr, /workspace_ledgers_preview_rule_partial_owner_table_failures/u);
    assert.match(result.stderr, /workspace_ledgers_owner_table_header_mismatch/u); // the code, never the table's own content
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('cli refresh (S-6, fresh-review-4): an unreadable custody directory prints the --allow-partial-sources hint, not the ledger-validation message', () => {
  const fixture = makeFixture();
  try {
    const typoDir = path.join(fixture.hiworksDir, 'typo-does-not-exist');
    const args = ['refresh', '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
      '--hiworks-events', typoDir, '--gmail-sent-events', fixture.gmailDir, '--org-config', fixture.orgConfigPath,
      '--receipts', fixture.receiptsDir, '--dry'];
    let error;
    try { execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' }); }
    catch (thrown) { error = thrown; }
    assert.ok(error, 'expected the CLI to exit non-zero');
    assert.equal(error.status, 2);
    assert.match(error.stderr, /workspace_ledgers_refresh_unreadable_dirs/u);
    assert.match(error.stderr, /--allow-partial-sources/u);
    assert.equal(error.stderr.includes('workspace_ledgers_refresh_ledger_validation_failed'), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('cli refresh (A1, 2026-09-21 night addition): --bundle-table wires bundle-table attribution through, --dry receipt reports table_attributed_mails', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.hiworksDir, 'more.jsonl'), JSON.stringify({
      event_id: 'h-bundle', subject: '전혀 무관한 별도 문의', from: 'other@example.com', to: [], cc: [],
      received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [],
    }));
    const bundleTablePath = path.join(fixture.root, '묶음_확정표.csv');
    writeFileSync(bundleTablePath, encodeCsv(BUNDLE_HEADERS_V2, [['전혀 무관한', CODE, 'Owner 확인', '2026-09-01', '']]));
    const args = ['refresh', '--workspaces-root', fixture.workspacesRoot, '--workmeta-root', fixture.workmetaRoot,
      '--hiworks-events', fixture.hiworksDir, '--gmail-sent-events', fixture.gmailDir, '--org-config', fixture.orgConfigPath,
      '--receipts', fixture.receiptsDir, '--dry', '--bundle-table', bundleTablePath];
    const out = execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
    const receipt = JSON.parse(out);
    assert.equal(receipt.status, 'ok');
    assert.equal(receipt.table_attributed_mails, 1);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
