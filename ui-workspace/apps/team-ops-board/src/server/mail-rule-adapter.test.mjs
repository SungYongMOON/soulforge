import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createMailRuleReader, createMailRulePlugin, validateRuleDocument, parseBulletSection,
  validateDraft, findProjectFolders, createDefaultMailRuleCore, normalizeYieldsTo,
  MAIL_RULE_SNAPSHOT_PATH, MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH, MAIL_RULE_REFRESH_PATH,
} from './mail-rule-adapter.mjs';

const sha256Of = text => createHash('sha256').update(text, 'utf8').digest('hex');

const RULE_DIR = ['020_MGMT', '021_자동화설정_운영규칙'];

function ruleDoc(overrides = {}) {
  return {
    schema_version: 'soulforge.project_mail_routing_rule.v0',
    project_code: 'P00-001', folder_name: 'P00-001_예시과제', rule_version: 'v1', status: '확정',
    exact: [{ label: '견적', kind: 'literal', value: '견적' }],
    hint: [{ label: '문의', kind: 'literal', value: '문의' }],
    yields_to: null, conflict_policy: 'first_match', sender_policy: 'any',
    ...overrides,
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'mail-rule-adapter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspacesRoot = path.join(root, 'workspaces');
  await mkdir(workspacesRoot, { recursive: true });
  return { root, workspacesRoot };
}

async function writeProject(workspacesRoot, folderName, doc, markdown) {
  const dir = path.join(workspacesRoot, folderName, ...RULE_DIR);
  await mkdir(dir, { recursive: true });
  if (doc !== undefined) await writeFile(path.join(dir, 'mail_routing_rule.json'), JSON.stringify(doc));
  if (markdown !== undefined) await writeFile(path.join(dir, 'mail_routing_rule.md'), markdown);
}

const MD_FIXTURE = `# P00-001 메일 분류 규칙

## Owner 확인 기록 (2026-09-20)
- 견적 요청은 항상 이 과제로 분류한다
- 발신자 도메인만으로는 분류하지 않는다

## Owner 확인이 필요한 것
- 타 과제와 겹치는 키워드 처리 방식
`;

// ---------- pure helpers ----------

test('validateRuleDocument accepts a well-formed document and rejects shape/schema/project mismatches', () => {
  const doc = ruleDoc();
  assert.deepEqual(validateRuleDocument(doc, 'P00-001'), { ...doc, yields_to: [] });
  assert.throws(() => validateRuleDocument({ ...doc, schema_version: 'wrong' }, 'P00-001'));
  assert.throws(() => validateRuleDocument({ ...doc, project_code: 'P00-002' }, 'P00-001'));
  assert.throws(() => validateRuleDocument({ ...doc, exact: [{ label: 'x' }] }, 'P00-001'));
  assert.throws(() => validateRuleDocument(null, 'P00-001'));
  assert.throws(() => validateRuleDocument({ ...doc, yields_to: { project_code: 'P00-002' } }, 'P00-001'), 'a bare object missing `when` is still invalid');
});

// yields_to changed shape after the panel's first slice: it is now an array of hand-over
// rules, but older files on disk may still carry `null` or a single bare object. All three
// must normalize onto the same array shape.
test('normalizeYieldsTo accepts null, a single object, or an array — and only those', () => {
  const entry = { project_code: 'P00-002', when: { label: '견적', kind: 'literal', value: '견적' } };
  assert.deepEqual(normalizeYieldsTo(null), []);
  assert.deepEqual(normalizeYieldsTo(undefined), []);
  assert.deepEqual(normalizeYieldsTo(entry), [entry]);
  assert.deepEqual(normalizeYieldsTo([entry, entry]), [entry, entry]);
  assert.deepEqual(normalizeYieldsTo([]), []);
  assert.throws(() => normalizeYieldsTo('P00-002'));
  assert.throws(() => normalizeYieldsTo({ project_code: 'P00-002' })); // missing `when`
  assert.throws(() => normalizeYieldsTo([{ project_code: 'not-a-code', when: entry.when }]));
  assert.throws(() => normalizeYieldsTo(Array.from({ length: 9 }, () => entry)), 'over the 8-entry cap');
  assert.deepEqual(normalizeYieldsTo(Array.from({ length: 8 }, () => entry)).length, 8, 'exactly at the cap is fine');
});

test('validateRuleDocument normalizes all three yields_to shapes onto the same array', () => {
  const entry = { project_code: 'P00-002', when: { label: '견적', kind: 'literal', value: '견적' } };
  assert.deepEqual(validateRuleDocument(ruleDoc({ yields_to: null }), 'P00-001').yields_to, []);
  assert.deepEqual(validateRuleDocument(ruleDoc({ yields_to: entry }), 'P00-001').yields_to, [entry]);
  assert.deepEqual(validateRuleDocument(ruleDoc({ yields_to: [entry] }), 'P00-001').yields_to, [entry]);
  assert.deepEqual(validateRuleDocument(ruleDoc({ yields_to: [] }), 'P00-001').yields_to, []);
  assert.deepEqual(validateRuleDocument(ruleDoc({ yields_to: [entry, entry] }), 'P00-001').yields_to, [entry, entry]);
});

test('parseBulletSection reads only the named section, drops overlong bullets and caps the count', () => {
  const decisions = parseBulletSection(MD_FIXTURE, 'Owner 확인 기록');
  assert.deepEqual(decisions, ['견적 요청은 항상 이 과제로 분류한다', '발신자 도메인만으로는 분류하지 않는다']);
  const openItems = parseBulletSection(MD_FIXTURE, 'Owner 확인이 필요한 것');
  assert.deepEqual(openItems, ['타 과제와 겹치는 키워드 처리 방식']);
  assert.deepEqual(parseBulletSection(MD_FIXTURE, '없는 섹션'), []);
  const long = '## Owner 확인 기록\n' + `- ${'x'.repeat(301)}\n` + Array.from({ length: 40 }, (_, i) => `- item ${i}`).join('\n');
  const parsed = parseBulletSection(long, 'Owner 확인 기록');
  assert.equal(parsed.length, 30);
  assert.ok(!parsed.includes('x'.repeat(301)));
});

test('validateDraft enforces literal/regex limits, unique labels and compiles regex terms', () => {
  assert.throws(() => validateDraft(null));
  assert.throws(() => validateDraft({ exact: [] })); // hint array missing
  const empty = { exact: [], hint: [] };
  assert.equal(validateDraft(empty), empty, 'empty arrays with no note are a valid draft');
  const ok = { exact: [{ label: 'a', kind: 'literal', value: 'a' }], hint: [] };
  assert.equal(validateDraft(ok), ok);
  assert.throws(() => validateDraft({ exact: [{ label: 'a', kind: 'literal', value: 'a'.repeat(81) }], hint: [] }));
  assert.throws(() => validateDraft({ exact: [{ label: 'a', kind: 'regex', value: '(' }], hint: [] }));
  assert.throws(() => validateDraft({ exact: [{ label: 'a', kind: 'literal', value: 'a' }, { label: 'a', kind: 'literal', value: 'b' }], hint: [] }));
  assert.throws(() => validateDraft({ exact: Array.from({ length: 61 }, (_, i) => ({ label: `l${i}`, kind: 'literal', value: 'x' })), hint: [] }));
  assert.throws(() => validateDraft({ exact: [], hint: [], note: 'x'.repeat(501) }));
  const regexOk = { exact: [{ label: 'r', kind: 'regex', value: '^abc$', flags: 'iu' }], hint: [] };
  assert.equal(validateDraft(regexOk), regexOk);
});

test('validateDraft accepts an absent, null, single-object or array yields_to and rejects an invalid one', () => {
  const entry = { project_code: 'P00-002', when: { label: '견적', kind: 'literal', value: '견적' } };
  const noKey = { exact: [], hint: [] };
  assert.equal(validateDraft(noKey), noKey, 'no yields_to key at all is fine');
  const withNull = { exact: [], hint: [], yields_to: null };
  assert.equal(validateDraft(withNull), withNull, 'yields_to is passed through unchanged, not normalized, by the draft validator');
  const withObject = { exact: [], hint: [], yields_to: entry };
  assert.equal(validateDraft(withObject), withObject);
  const withArray = { exact: [], hint: [], yields_to: [entry] };
  assert.equal(validateDraft(withArray), withArray);
  assert.throws(() => validateDraft({ exact: [], hint: [], yields_to: { project_code: 'not-a-code', when: entry.when } }));
  assert.throws(() => validateDraft({ exact: [], hint: [], yields_to: 'nope' }));
});

test('findProjectFolders accepts a forward-slash root spelling on the same real directory (not a symlink escape)', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.workspacesRoot, 'P00-005_슬래시'));
  const forwardSlashRoot = f.workspacesRoot.split(path.sep).join('/');
  assert.notEqual(forwardSlashRoot, f.workspacesRoot, 'the fixture root actually differs by separator style, or this assertion is not exercising the bug');
  assert.deepEqual(await findProjectFolders(forwardSlashRoot, 'P00-005'), ['P00-005_슬래시']);
});

test('findProjectFolders resolves by exact "<code>_" prefix and denies escape via symlink', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.workspacesRoot, 'P00-001_예시과제'));
  await mkdir(path.join(f.workspacesRoot, 'P00-001_다른이름'));
  await mkdir(path.join(f.workspacesRoot, 'P00-002_다른과제'));
  assert.deepEqual((await findProjectFolders(f.workspacesRoot, 'P00-002')).sort(), ['P00-002_다른과제']);
  assert.deepEqual((await findProjectFolders(f.workspacesRoot, 'P00-001')).sort(), ['P00-001_다른이름', 'P00-001_예시과제']);
  assert.deepEqual(await findProjectFolders(f.workspacesRoot, 'P99-999'), []);
  const outside = path.join(f.root, 'outside'); await mkdir(outside);
  await symlink(outside, path.join(f.workspacesRoot, 'P00-003_링크'), 'junction');
  assert.deepEqual(await findProjectFolders(f.workspacesRoot, 'P00-003'), []);
});

// ---------- reader ----------

test('listProjects is unconfigured without a root, lists only folders with a valid rule file, and excludes secrets from output', async t => {
  const f = await fixture(t);
  const readerUnconfigured = createMailRuleReader({});
  assert.equal((await readerUnconfigured.listProjects()).state, 'unconfigured');

  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  await mkdir(path.join(f.workspacesRoot, 'P00-002_규칙없음'), { recursive: true }); // no rule file
  await writeProject(f.workspacesRoot, 'P00-003_손상됨', { schema_version: 'wrong' });
  let time = Date.now();
  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot, now: () => time });
  const first = await reader.listProjects();
  assert.equal(first.state, 'ready');
  assert.deepEqual(first.projects.map(p => p.project_code), ['P00-001']);
  assert.equal(first.projects[0].exact_count, 1);
  assert.equal(first.projects[0].hint_count, 1);
  assert.equal(JSON.stringify(first).includes(f.root), false);
  time += 1000;
  await writeProject(f.workspacesRoot, 'P00-004_추가', ruleDoc({ project_code: 'P00-004', folder_name: 'P00-004_추가' }));
  const cachedResult = await reader.listProjects();
  assert.deepEqual(cachedResult.projects.map(p => p.project_code), ['P00-001'], 'still cached within 60s TTL');
  time += 61_000;
  const refreshed = await reader.listProjects();
  assert.deepEqual(refreshed.projects.map(p => p.project_code).sort(), ['P00-001', 'P00-004']);
});

// nit: when the folder scan itself is cut off by MAX_FOLDER_SCAN (bounded work per call), the
// caller has no way to tell "fewer than 500 folders, all examined" from "cut off partway
// through, there may be more" without this flag.
test('listProjects sets truncated:true when the folder scan is cut off by MAX_FOLDER_SCAN', async t => {
  const f = await fixture(t);
  await Promise.all(Array.from({ length: 501 }, (_, i) => mkdir(path.join(f.workspacesRoot, `unrelated-${String(i).padStart(4, '0')}`))));
  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot });
  const result = await reader.listProjects();
  assert.equal(result.state, 'ready');
  assert.equal(result.truncated, true);
});

test('listProjects sets truncated:false when the scan completes without hitting a cap', async t => {
  const f = await fixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot });
  assert.equal((await reader.listProjects()).truncated, false);
});

test('readProject rejects invalid codes, reports no_rule, ambiguous folders, and returns the parsed rule plus md sections', async t => {
  const f = await fixture(t);
  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot, writeEnabled: true });
  assert.equal((await reader.readProject('not-a-code')).state, 'denied');
  assert.equal((await reader.readProject('P00-009')).state, 'no_rule');

  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc(), MD_FIXTURE);
  const ready = await reader.readProject('P00-001');
  assert.equal(ready.state, 'ready');
  assert.equal(ready.write_enabled, true);
  assert.deepEqual(ready.decisions, ['견적 요청은 항상 이 과제로 분류한다', '발신자 도메인만으로는 분류하지 않는다']);
  assert.deepEqual(ready.open_items, ['타 과제와 겹치는 키워드 처리 방식']);
  assert.equal(ready.rule.project_code, 'P00-001');

  await mkdir(path.join(f.workspacesRoot, 'P00-001_또다른'), { recursive: true });
  const ambiguous = await reader.readProject('P00-001');
  assert.equal(ambiguous.state, 'ready', 'still cached from the earlier call');
});

test('readProject reports ambiguous folders as unavailable when not cached', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.workspacesRoot, 'P00-001_예시과제'), { recursive: true });
  await mkdir(path.join(f.workspacesRoot, 'P00-001_또다른'), { recursive: true });
  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot });
  assert.equal((await reader.readProject('P00-001')).state, 'unavailable');
});

test('a rule file missing its optional md twin still returns ready with empty decision lists', async t => {
  const f = await fixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot });
  const result = await reader.readProject('P00-001');
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.decisions, []);
  assert.deepEqual(result.open_items, []);
});

// ---------- preview / save / refresh (reader level, injected fake core) ----------

async function custodyFixture(t) {
  const f = await fixture(t);
  const hiworksDir = path.join(f.root, 'events', 'hiworks');
  const gmailDir = path.join(f.root, 'events', 'gmail_sent');
  const receiptsDir = path.join(f.root, 'receipts');
  const workmetaRoot = path.join(f.root, 'workmeta');
  for (const dir of [hiworksDir, gmailDir, receiptsDir]) await mkdir(dir, { recursive: true });
  const orgConfigPath = path.join(f.root, 'org_config.json');
  await writeFile(orgConfigPath, JSON.stringify({ our_domain: 'example.com', organisations: { 'example.com': 'Example Corp' }, family: {} }));
  return { ...f, hiworksDir, gmailDir, receiptsDir, orgConfigPath, workmetaRoot };
}
function custodyOptions(f, extra = {}) {
  // R1: `workmetaRoot` belongs here — fullCustodyReady now requires it (a save/refresh call
  // with it missing must answer custody_unconfigured before ever reaching the core), and this
  // helper is what almost every save/refresh test below builds its options from. Before this
  // fix, every one of those tests was unknowingly exercising `save`/`refresh` with no
  // `workmetaRoot` at all — exactly the gap R1 found, just never surfaced because
  // `fullCustodyReady` did not check it yet either.
  return { workspacesRoot: f.workspacesRoot, workmetaRoot: f.workmetaRoot, hiworksEventsDir: f.hiworksDir, gmailSentEventsDir: f.gmailDir,
    ledgerOrgConfigPath: f.orgConfigPath, ledgerReceiptsDir: f.receiptsDir, ...extra };
}
// A `refresh()` receipt on the success path: every project written, no failures of any kind.
function refreshReceiptFixture(codes, overrides = {}) {
  return { status: 'ok', ledger_failures: [], rule_failures: [], unreadable_dirs: [],
    projects: codes.map(project_code => ({ project_code,
      contacts: { written: true }, received_history: { written: false }, sent_history: { written: true }, reply_status: { written: false } })),
    ...overrides };
}
// R2: a receipt that returns *normally* (refresh() never throws for this) but reports
// `status: 'failed'` — R4 ledger validation, an unreadable custody directory, or a bad saved
// rule for one project. `codes` are the projects that still completed despite the failure
// (often none, when every custody directory was unreadable).
function failedRefreshReceiptFixture(codes, failureOverrides = {}) {
  return refreshReceiptFixture(codes, { status: 'failed', ledger_failures: [{ file: 'contacts.csv', code: 'workspace_ledgers_ledger_header_mismatch' }], ...failureOverrides });
}

test('buildFullDraft (via preview) merges the UI draft onto the current on-disk rule, preserving unedited fields; throws when there is no current rule', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc({ status: 'draft_open_items' }));
  let seenDraft;
  const fakeCore = { previewRule: async args => { seenDraft = args.draft; return { matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }; },
    saveRuleVersion: async () => ({}), refresh: async () => ({ projects: [] }) };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore }));
  await reader.preview('P00-001', { exact: [{ label: 'new', kind: 'literal', value: 'new' }], hint: [] });
  assert.deepEqual(seenDraft.exact, [{ label: 'new', kind: 'literal', value: 'new' }]);
  assert.equal(seenDraft.status, 'draft_open_items', 'unedited fields (status, schema_version, conflict_policy, …) carry through from disk');
  assert.equal(seenDraft.schema_version, 'soulforge.project_mail_routing_rule.v0');
  assert.equal(seenDraft.project_code, 'P00-001');

  await assert.rejects(reader.preview('P00-009', { exact: [], hint: [] }), error => error.code === 'no_current_rule');
});

test('preview requires custody dirs and answers a tagged custody_unconfigured error otherwise', async t => {
  const f = await fixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot, core: { previewRule: async () => ({}), saveRuleVersion: async () => ({}), refresh: async () => ({}) } });
  await assert.rejects(reader.preview('P00-001', { exact: [], hint: [] }), error => error.code === 'custody_unconfigured');
  await assert.rejects(reader.save('P00-001', { exact: [], hint: [] }, 'note'), error => error.code === 'custody_unconfigured');
  await assert.rejects(reader.refreshAll(), error => error.code === 'custody_unconfigured');
});

test('save re-runs preview server-side for `measured`, saves, then refreshes every onboarded project (omitting `projects` means "all")', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  let refreshArgs, saveArgs, previewArgs, previewCount = 0;
  const measuredStub = { matched_before: 3, matched_after: 4, moved_in: 1, moved_out: 0, newly_held: 0, samples: {} };
  const fakeCore = {
    previewRule: async args => { previewCount += 1; previewArgs = args; return measuredStub; },
    saveRuleVersion: async args => { saveArgs = args; return { rule_version: 'v2', previous_version: 'v1' }; },
    refresh: async args => { refreshArgs = args; return refreshReceiptFixture(['P00-001', 'P00-002']); },
  };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore, writeEnabled: true }));
  const outcome = await reader.save('P00-001', { exact: [{ label: 'a', kind: 'literal', value: 'a' }], hint: [] }, '메모');
  assert.equal(previewCount, 1, 'preview is re-run server-side exactly once to obtain measured');
  assert.equal(previewArgs.orgConfigPath, f.orgConfigPath, 'R3: the internal measured-preview call resolves system_sender_domains the same way refresh() below does');
  assert.deepEqual(saveArgs.measured, measuredStub);
  assert.equal(saveArgs.by, 'owner');
  assert.equal(saveArgs.note, '메모');
  assert.deepEqual(saveArgs.allowedActors, ['owner'], 'nit: pin saves to the single owner actor');
  assert.equal(refreshArgs.projects, undefined, 'projects is omitted so refresh() covers every onboarded project, not a guessed subset');
  assert.equal(refreshArgs.fields[0], 'subject');
  assert.deepEqual(outcome, { kind: 'saved', rule_version: 'v2', previous_version: 'v1',
    refresh: { projects: ['P00-001', 'P00-002'], changed_files: 4, status: 'ok', ledger_failures: 0, rule_failures: 0, unreadable_dirs: 0 } });
});

test('R2: a refresh receipt that returns normally with status "failed" reports saved_refresh_partial, not the plain saved success', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const fakeCore = {
    previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }),
    refresh: async () => failedRefreshReceiptFixture(['P00-001']),
  };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore, writeEnabled: true }));
  const outcome = await reader.save('P00-001', { exact: [], hint: [] }, '메모');
  assert.equal(outcome.kind, 'saved_refresh_partial', 'a structurally-successful refresh that itself reports failure is not the same as a clean saved');
  assert.equal(outcome.refresh.status, 'failed');
  assert.equal(outcome.refresh.ledger_failures, 1);
});

test('R2: an empty projects list caused entirely by unreadable custody directories is distinguishable from a genuinely quiet 0-files-changed run', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const fakeCore = {
    previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }),
    refresh: async () => ({ status: 'failed', projects: [], ledger_failures: [], rule_failures: [],
      unreadable_dirs: [{ source: 'hiworks-events', dir: 'events', code: 'workspace_ledgers_custody_dir_unreadable' }] }),
  };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore, writeEnabled: true }));
  const outcome = await reader.save('P00-001', { exact: [], hint: [] }, '메모');
  assert.equal(outcome.kind, 'saved_refresh_partial');
  assert.deepEqual(outcome.refresh, { projects: [], changed_files: 0, status: 'failed', ledger_failures: 0, rule_failures: 0, unreadable_dirs: 1 },
    'an empty projects list from unreadable custody must carry status:failed and unreadable_dirs:1, never look identical to a quiet run');

  const retryReceipt = await reader.refreshAll();
  assert.deepEqual(retryReceipt, { projects: [], changed_files: 0, status: 'failed', ledger_failures: 0, rule_failures: 0, unreadable_dirs: 1 });
});

test('R2: an owner_table_failures count present on the receipt is carried through; absent, no such field is invented', async t => {
  const f = await custodyFixture(t);
  const withField = { status: 'ok', projects: [], ledger_failures: [], rule_failures: [], unreadable_dirs: [], owner_table_failures: [{ code: 'x' }] };
  const withoutField = refreshReceiptFixture([]);
  const reader = createMailRuleReader(custodyOptions(f, {
    core: { previewRule: async () => ({}), saveRuleVersion: async () => ({}), refresh: async () => withField }, writeEnabled: true }));
  assert.equal((await reader.refreshAll()).owner_table_failures, 1);
  const reader2 = createMailRuleReader(custodyOptions(f, {
    core: { previewRule: async () => ({}), saveRuleVersion: async () => ({}), refresh: async () => withoutField }, writeEnabled: true }));
  assert.equal('owner_table_failures' in (await reader2.refreshAll()), false);
});

test('a refresh failure after a successful save reports saved_refresh_failed and does not roll the save back', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const fakeCore = {
    previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }),
    refresh: async () => { const error = new Error('refresh boom'); error.code = 'workspace_ledgers_refresh_lock_held'; throw error; },
  };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore, writeEnabled: true }));
  const outcome = await reader.save('P00-001', { exact: [], hint: [] }, '메모');
  assert.deepEqual(outcome, { kind: 'saved_refresh_failed', rule_version: 'v2', error_code: 'workspace_ledgers_refresh_lock_held' });
});

test('save invalidates this adapter\'s own GET cache for the project and the list so a reload sees the new version', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  let version = 'v1';
  const fakeCore = {
    previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }),
    refresh: async () => refreshReceiptFixture(['P00-001']),
  };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore, writeEnabled: true }));
  const before = await reader.readProject('P00-001');
  assert.equal(before.rule.rule_version, 'v1');
  await reader.save('P00-001', { exact: [], hint: [] }, '메모');
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc({ rule_version: 'v2' })); // stand-in for the real core's on-disk write
  const after = await reader.readProject('P00-001');
  assert.equal(after.rule.rule_version, 'v2', 'not served from the pre-save cache entry');
});

test('refreshAll summarizes the receipt into project codes, a changed-file count, and the status/failure counts', async t => {
  const f = await custodyFixture(t);
  const fakeCore = { previewRule: async () => ({}), saveRuleVersion: async () => ({}), refresh: async () => refreshReceiptFixture(['P00-001', 'P00-002', 'P00-003']) };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore }));
  assert.deepEqual(await reader.refreshAll(), { projects: ['P00-001', 'P00-002', 'P00-003'], changed_files: 6,
    status: 'ok', ledger_failures: 0, rule_failures: 0, unreadable_dirs: 0 });
});

// ---------- R1: fullCustodyReady requires workspacesRoot and workmetaRoot ----------

test('R1: save and refresh answer custody_unconfigured (never touching the core) when workmetaRoot is missing; preview still works', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  let coreCalled = false;
  const trapCore = {
    previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => { coreCalled = true; throw new Error('saveRuleVersion must never be reached when workmetaRoot is missing'); },
    refresh: async () => { coreCalled = true; throw new Error('refresh must never be reached when workmetaRoot is missing'); },
  };
  const options = { ...custodyOptions(f, { core: trapCore, writeEnabled: true }), workmetaRoot: undefined };
  const reader = createMailRuleReader(options);
  assert.equal(reader.fullCustodyReady, false, 'fullCustodyReady must be false with no workmetaRoot');
  assert.equal(reader.previewCustodyReady, true, 'previewCustodyReady does not require workmetaRoot');

  await assert.rejects(reader.save('P00-001', { exact: [], hint: [] }, '메모', { rule_version: 'v1', sha256_json: 'x'.repeat(64) }),
    error => error.code === 'custody_unconfigured');
  await assert.rejects(reader.refreshAll(), error => error.code === 'custody_unconfigured');
  await reader.preview('P00-001', { exact: [], hint: [] }); // does not throw: preview needs no workmetaRoot
  assert.equal(coreCalled, false, 'saveRuleVersion/refresh were never invoked — nothing was written before the custody check ran');

  // The same gap, exercised over real HTTP: a save POST with everything else configured but a
  // missing workmetaRoot answers 503 before any core call, not a 400 from a core throw partway
  // through a write (fresh review R1's exact failure mode).
  const call = harness(options);
  const res = await call(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, note: '메모', rule_version: 'v1', sha256_json: 'a'.repeat(64) }) });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), { state: 'custody_unconfigured' });
  assert.equal(coreCalled, false);
});

// ---------- R3: orgConfigPath forwarded to previewRule ----------

test('R3: preview() forwards orgConfigPath to previewRule when configured', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  let seenArgs;
  const fakeCore = { previewRule: async args => { seenArgs = args; return { matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }; },
    saveRuleVersion: async () => ({}), refresh: async () => refreshReceiptFixture([]) };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore }));
  await reader.preview('P00-001', { exact: [], hint: [] });
  assert.equal(seenArgs.orgConfigPath, f.orgConfigPath,
    'without this, previewRule would resolve system_sender_domains differently than a later refresh() using the same org config');
});

test('R3: preview() omits orgConfigPath when it is not configured, rather than forwarding undefined', async t => {
  const f = await fixture(t);
  const hiworksDir = path.join(f.root, 'events', 'hiworks'), gmailDir = path.join(f.root, 'events', 'gmail_sent');
  await mkdir(hiworksDir, { recursive: true }); await mkdir(gmailDir, { recursive: true });
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  let seenArgs;
  const fakeCore = { previewRule: async args => { seenArgs = args; return { matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }; },
    saveRuleVersion: async () => ({}), refresh: async () => ({}) };
  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot, hiworksEventsDir: hiworksDir, gmailSentEventsDir: gmailDir, core: fakeCore });
  await reader.preview('P00-001', { exact: [], hint: [] });
  assert.equal('orgConfigPath' in seenArgs, false);
});

// ---------- S1: optimistic concurrency ----------

test('S1: save refuses rule_changed when the caller-supplied rule_version/sha256_json no longer match the fresh on-disk read', async t => {
  const f = await custodyFixture(t);
  const initialDoc = ruleDoc();
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', initialDoc);
  const staleExpected = { rule_version: initialDoc.rule_version, sha256_json: sha256Of(JSON.stringify(initialDoc)) };
  // Someone else's write lands between the panel's load and this save's call.
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc({ rule_version: 'v2' }));
  let coreCalled = false;
  const trapCore = { previewRule: async () => { coreCalled = true; return {}; },
    saveRuleVersion: async () => { coreCalled = true; return {}; }, refresh: async () => { coreCalled = true; return refreshReceiptFixture([]); } };
  const reader = createMailRuleReader(custodyOptions(f, { core: trapCore, writeEnabled: true }));
  await assert.rejects(reader.save('P00-001', { exact: [], hint: [] }, '메모', staleExpected), error => error.code === 'rule_changed');
  assert.equal(coreCalled, false, 'no core call happens once the version mismatch is caught');
});

test('S1: save proceeds when the caller-supplied rule_version/sha256_json still match the fresh on-disk read', async t => {
  const f = await custodyFixture(t);
  const doc = ruleDoc();
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', doc);
  const freshExpected = { rule_version: doc.rule_version, sha256_json: sha256Of(JSON.stringify(doc)) };
  const fakeCore = { previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }), refresh: async () => refreshReceiptFixture(['P00-001']) };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore, writeEnabled: true }));
  const outcome = await reader.save('P00-001', { exact: [], hint: [] }, '메모', freshExpected);
  assert.equal(outcome.kind, 'saved');
});

test('S1: save with no expected version supplied at the reader level skips the check (the HTTP route requires it instead)', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const fakeCore = { previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }), refresh: async () => refreshReceiptFixture(['P00-001']) };
  const reader = createMailRuleReader(custodyOptions(f, { core: fakeCore, writeEnabled: true }));
  const outcome = await reader.save('P00-001', { exact: [], hint: [] }, '메모');
  assert.equal(outcome.kind, 'saved');
});

test('S1: the HTTP save route requires rule_version and sha256_json in the body, and refuses 409 rule_changed on a stale pair', async t => {
  const f = await custodyFixture(t);
  const doc = ruleDoc();
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', doc);
  const fakeCore = { previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }), refresh: async () => refreshReceiptFixture(['P00-001']) };
  const call = harness(custodyOptions(f, { writeEnabled: true, core: fakeCore }));

  const missing = await call(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, note: '메모' }) });
  assert.equal(missing.statusCode, 400);
  assert.deepEqual(JSON.parse(missing.body), { state: 'denied', reason: 'expected_version_missing' });

  const stale = await call(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, note: '메모', rule_version: 'v0-stale', sha256_json: 'a'.repeat(64) }) });
  assert.equal(stale.statusCode, 409);
  assert.deepEqual(JSON.parse(stale.body), { state: 'rule_changed' });

  const fresh = await call(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, note: '메모', rule_version: doc.rule_version, sha256_json: sha256Of(JSON.stringify(doc)) }) });
  assert.equal(fresh.statusCode, 200);
  assert.equal(JSON.parse(fresh.body).state, 'saved');
});

// ---------- S5: one preview/save/refresh call at a time ----------

test('S5: a second concurrent preview/save/refresh call is refused 409 busy rather than run alongside the first', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const slowCore = {
    previewRule: async () => { await gate; return { matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }; },
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }),
    refresh: async () => refreshReceiptFixture(['P00-001']),
  };
  const reader = createMailRuleReader(custodyOptions(f, { core: slowCore, writeEnabled: true }));
  const first = reader.preview('P00-001', { exact: [], hint: [] });
  await assert.rejects(reader.preview('P00-001', { exact: [], hint: [] }), error => error.code === 'busy');
  await assert.rejects(reader.refreshAll(), error => error.code === 'busy');
  release();
  await first;
  // Once the first call has released the lock, a new call is accepted again.
  await reader.preview('P00-001', { exact: [], hint: [] });
});

// ---------- default core loader ----------

test('the default core reports core_module_unavailable when the sibling module cannot be imported', async () => {
  const core = createDefaultMailRuleCore({ importModule: async () => { throw new Error('not found'); } });
  await assert.rejects(core.previewRule({}), /core_module_unavailable/);
  await assert.rejects(core.saveRuleVersion({}), /core_module_unavailable/);
});

test('the default core accepts a module only once it exports all three required functions', async () => {
  const fakeModule = { previewRule: async () => ({ ok: true }), saveRuleVersion: async () => ({ ok: true }), refresh: async () => ({ ok: true }) };
  const core = createDefaultMailRuleCore({ importModule: async () => fakeModule });
  assert.deepEqual(await core.previewRule({}), { ok: true });
  const incomplete = createDefaultMailRuleCore({ importModule: async () => ({ previewRule: async () => ({}) }) });
  await assert.rejects(incomplete.saveRuleVersion({}), /core_module_unavailable/);
});

// ---------- HTTP plugin ----------

function harness(options) {
  let middleware;
  createMailRulePlugin(options).configureServer({ middlewares: { use(fn) { middleware = fn; } } });
  return (url, { method = 'GET', headers = {}, body } = {}) => new Promise(resolve => {
    const response = { statusCode: 200, headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; }, end(chunk) { if (chunk) this.body += chunk; resolve(response); } };
    const request = { url, method, headers: { host: 'localhost:4194', ...headers }, socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]: async function* () { if (body !== undefined) yield Buffer.from(body); } };
    middleware(request, response, () => resolve({ ...response, passedThrough: true }));
  });
}

test('GET routes reject mutation, proxy passage, cross-origin and rebinding hosts the same way the sibling adapters do', async () => {
  const call = harness({});
  for (const [method, headers, code] of [
    ['POST', {}, 405],
    ['GET', { host: 'evil.test' }, 403],
    ['GET', { 'x-forwarded-for': '1.2.3.4' }, 403],
    ['GET', { origin: 'https://evil.test' }, 403],
  ]) {
    const res = await call(MAIL_RULE_SNAPSHOT_PATH, { method, headers });
    assert.equal(res.statusCode, code, `${method} ${JSON.stringify(headers)}`);
  }
});

test('GET /mail-rule.snapshot.json rejects unexpected query keys with 400', async () => {
  const call = harness({});
  assert.equal((await call(`${MAIL_RULE_SNAPSHOT_PATH}?other=1`)).statusCode, 400);
});

// nit: the earlier GET /mail-rules.snapshot.json project-list route had no UI consumer and was
// removed (see the top-of-file comment); this pins that it is genuinely gone rather than merely
// undocumented — a request to it now passes straight through to `next()`, the same as any other
// unrelated path, instead of being intercepted and answered by this plugin.
test('the removed GET /mail-rules.snapshot.json route is no longer intercepted', async () => {
  const call = harness({});
  const res = await call('/mail-rules.snapshot.json');
  assert.equal(res.passedThrough, true);
});

test('GET /mail-rule.snapshot.json returns the ready projection for a configured project, with the security headers every route sets', async t => {
  const f = await fixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc(), MD_FIXTURE);
  const call = harness({ workspacesRoot: f.workspacesRoot });
  const res = await call(`${MAIL_RULE_SNAPSHOT_PATH}?project=P00-001`);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.state, 'ready');
  assert.equal(body.rule.project_code, 'P00-001');
  assert.equal(typeof body.sha256_json, 'string', 'S1: the GET path carries the digest the save route will later compare against');
  assert.match(body.sha256_json, /^[0-9a-f]{64}$/u);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer', 'nit: matches operations-spaces-adapter.mjs');
});

test('POST /mail-rule/save and /mail-rule/refresh both refuse write_disabled before any body parsing when the write flag is off; preview does not', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const fakeCore = { previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }), saveRuleVersion: async () => ({}), refresh: async () => ({ projects: [] }) };
  const call = harness(custodyOptions(f, { writeEnabled: false, core: fakeCore }));
  for (const p of [MAIL_RULE_SAVE_PATH, MAIL_RULE_REFRESH_PATH]) {
    const res = await call(p, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'not even json' });
    assert.equal(res.statusCode, 403, p);
    assert.deepEqual(JSON.parse(res.body), { state: 'write_disabled' }, p);
  }
  const previewOk = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] } }) });
  assert.equal(previewOk.statusCode, 200, 'preview never writes and has no write-flag gate');
});

test('POST /mail-rule/preview, /mail-rule/save and /mail-rule/refresh all answer 503 custody_unconfigured when the mail-event directories are not set', async t => {
  const f = await fixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const fakeCore = { previewRule: async () => ({}), saveRuleVersion: async () => ({}), refresh: async () => ({ projects: [] }) };
  const call = harness({ workspacesRoot: f.workspacesRoot, writeEnabled: true, core: fakeCore });
  // rule_version/sha256_json included so the save leg reaches the custody check (503) rather
  // than being turned away earlier by the request-shape check (400 expected_version_missing) —
  // this test is specifically about the custody gate, not body validation.
  const body = JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, rule_version: 'v1', sha256_json: 'a'.repeat(64) });
  for (const p of [MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH, MAIL_RULE_REFRESH_PATH]) {
    const res = await call(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(res.statusCode, 503, p);
    assert.deepEqual(JSON.parse(res.body), { state: 'custody_unconfigured' }, p);
  }
});

test('POST routes validate content-type, oversized bodies and invalid drafts with an injected fake core', async t => {
  const f = await custodyFixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc());
  const fakeCore = { previewRule: async () => ({ matched_before: 1, matched_after: 2, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }), saveRuleVersion: async () => ({ rule_version: 'v2' }), refresh: async () => ({}) };
  const call = harness(custodyOptions(f, { writeEnabled: true, core: fakeCore }));

  const wrongType = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(wrongType.statusCode, 415);

  const tooLarge = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [], note: 'x'.repeat(64 * 1024) } }) });
  assert.equal(tooLarge.statusCode, 413);

  const badDraft = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-001', draft: { exact: [{ label: 'a', kind: 'literal', value: 'a'.repeat(200) }], hint: [] } }) });
  assert.equal(badDraft.statusCode, 400);

  const badProject = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'not-a-code', draft: { exact: [], hint: [] } }) });
  assert.equal(badProject.statusCode, 400);

  const noCurrentRule = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-009', draft: { exact: [], hint: [] } }) });
  assert.equal(noCurrentRule.statusCode, 400);
  assert.deepEqual(JSON.parse(noCurrentRule.body), { state: 'denied', reason: 'no_current_rule' });

  const ok = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-001', draft: { exact: [{ label: 'a', kind: 'literal', value: 'a' }], hint: [] } }) });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(JSON.parse(ok.body).result, { matched_before: 1, matched_after: 2, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} });
});

test('POST /mail-rule/save: success answers state:saved with version and refresh summary; a refresh failure answers state:saved_refresh_failed; a refresh that returns failed answers state:saved_refresh_partial', async t => {
  const f = await custodyFixture(t);
  const doc = ruleDoc();
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', doc);
  const expected = { rule_version: doc.rule_version, sha256_json: sha256Of(JSON.stringify(doc)) };
  const okCore = { previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => ({ rule_version: 'v2', previous_version: 'v1' }), refresh: async () => refreshReceiptFixture(['P00-001']) };
  const okCall = harness(custodyOptions(f, { writeEnabled: true, core: okCore }));
  const saved = await okCall(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, note: '메모', ...expected }) });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(JSON.parse(saved.body), { state: 'saved', rule_version: 'v2', previous_version: 'v1',
    refresh: { projects: ['P00-001'], changed_files: 2, status: 'ok', ledger_failures: 0, rule_failures: 0, unreadable_dirs: 0 } });

  const failingCore = { previewRule: okCore.previewRule, saveRuleVersion: okCore.saveRuleVersion,
    refresh: async () => { const error = new Error('boom'); error.code = 'workspace_ledgers_refresh_lock_held'; throw error; } };
  const failCall = harness(custodyOptions(f, { writeEnabled: true, core: failingCore }));
  const savedButRefreshFailed = await failCall(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, note: '메모', ...expected }) });
  assert.equal(savedButRefreshFailed.statusCode, 200, 'the rule itself is already saved; this is not an HTTP error');
  assert.deepEqual(JSON.parse(savedButRefreshFailed.body), { state: 'saved_refresh_failed', rule_version: 'v2', error_code: 'workspace_ledgers_refresh_lock_held' });

  const partialCore = { previewRule: okCore.previewRule, saveRuleVersion: okCore.saveRuleVersion,
    refresh: async () => failedRefreshReceiptFixture(['P00-001']) };
  const partialCall = harness(custodyOptions(f, { writeEnabled: true, core: partialCore }));
  const savedButRefreshPartial = await partialCall(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, note: '메모', ...expected }) });
  assert.equal(savedButRefreshPartial.statusCode, 200, 'the rule is saved; refresh returning normally with a failure is still not an HTTP error');
  const partialBody = JSON.parse(savedButRefreshPartial.body);
  assert.equal(partialBody.state, 'saved_refresh_partial');
  assert.equal(partialBody.refresh.status, 'failed');
  assert.equal(partialBody.refresh.ledger_failures, 1);
});

test('POST /mail-rule/refresh (retry) requires the write flag, ignores its body, and returns the same project/changed_files summary', async t => {
  const f = await custodyFixture(t);
  let sawProjectsArg = 'unset';
  const fakeCore = { previewRule: async () => ({}), saveRuleVersion: async () => ({}),
    refresh: async args => { sawProjectsArg = args.projects; return refreshReceiptFixture(['P00-001', 'P00-002']); } };
  const call = harness(custodyOptions(f, { writeEnabled: true, core: fakeCore }));
  const res = await call(MAIL_RULE_REFRESH_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { state: 'ready',
    refresh: { projects: ['P00-001', 'P00-002'], changed_files: 4, status: 'ok', ledger_failures: 0, rule_failures: 0, unreadable_dirs: 0 } });
  assert.equal(sawProjectsArg, undefined, 'retry also refreshes every onboarded project, not a remembered subset');
});

test('R2: POST /mail-rule/refresh (retry) answers state:refresh_partial (still 200) when the receipt reports status failed', async t => {
  const f = await custodyFixture(t);
  const fakeCore = { previewRule: async () => ({}), saveRuleVersion: async () => ({}),
    refresh: async () => failedRefreshReceiptFixture(['P00-001']) };
  const call = harness(custodyOptions(f, { writeEnabled: true, core: fakeCore }));
  const res = await call(MAIL_RULE_REFRESH_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.statusCode, 200, 'a structurally-successful refresh call is not an HTTP error even when its receipt reports failure');
  const body = JSON.parse(res.body);
  assert.equal(body.state, 'refresh_partial');
  assert.equal(body.refresh.status, 'failed');
});

test('nit: a code that is not this module\'s own lowercase_with_underscores shape maps to the stable internal_error reason instead of a bare denied', async t => {
  const f = await custodyFixture(t);
  const doc = ruleDoc();
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', doc);
  const explodingCore = { previewRule: async () => ({ matched_before: 0, matched_after: 0, moved_in: 0, moved_out: 0, newly_held: 0, samples: {} }),
    saveRuleVersion: async () => { const error = new TypeError('The "path" argument must be of type string'); error.code = 'ERR_INVALID_ARG_TYPE'; throw error; },
    refresh: async () => refreshReceiptFixture([]) };
  const call = harness(custodyOptions(f, { writeEnabled: true, core: explodingCore }));
  const res = await call(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] }, note: '메모', rule_version: doc.rule_version, sha256_json: sha256Of(JSON.stringify(doc)) }) });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(res.body), { state: 'denied', reason: 'internal_error' });
});

// ---------- integration: the REAL guild_hall/workspace_ledgers core module, no injected core ----------
// Synthetic temp workspace + synthetic custody fixture only — no real project data anywhere.

test('integration: preview then save against the real core module actually versions the rule and refreshes ledgers on disk', async t => {
  const f = await custodyFixture(t);
  const code = 'P00-001', folder = 'P00-001_예시과제';
  const baseRule = {
    schema_version: 'soulforge.project_mail_routing_rule.v0', project_code: code, folder_name: folder, rule_version: 'v1',
    status: 'draft_open_items', match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: [{ label: 'P00-001', kind: 'literal', value: 'P00-001' }], hint: [],
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
    human_text: 'mail_routing_rule.md', generated_at: '2026-09-21T00:00:00.000Z',
  };
  const baseMd = [
    `# 메일 라우팅 규칙 — ${code}`, '', '- 상태: 초안 v1', '',
    '## 확정 트리거 (제목·본문·첨부명에 있으면 이 과제로 본다)', '', '- `P00-001`', '',
    '## Owner 확인 기록', '', '- 예시 결정 A', '',
    '## Owner 확인이 필요한 것', '', '- 예시 미결 항목', '',
  ].join('\n');
  await writeProject(f.workspacesRoot, folder, baseRule, baseMd);
  await writeFile(path.join(f.hiworksDir, 'events.jsonl'), [
    { event_id: 'h1', subject: '[P00-001] 납품 안내', from: 'staff@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    { event_id: 'h2', subject: '새로운 장비 문의', from: 'other@client.example', to: ['me@example.com'], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
  ].map(line => JSON.stringify(line)).join('\n'));

  const reader = createMailRuleReader({ workspacesRoot: f.workspacesRoot, workmetaRoot: f.workmetaRoot, writeEnabled: true,
    hiworksEventsDir: f.hiworksDir, gmailSentEventsDir: f.gmailDir, ledgerOrgConfigPath: f.orgConfigPath, ledgerReceiptsDir: f.receiptsDir });
  // No `core` option: this exercises the real default loader importing the real, now-merged
  // guild_hall/workspace_ledgers/src/index.mjs — not a fake.
  const draft = { exact: [{ label: 'P00-001', kind: 'literal', value: 'P00-001' }, { label: '새로운장비', kind: 'literal', value: '새로운 장비' }], hint: [] };

  const preview = await reader.preview(code, draft);
  assert.equal(preview.matched_before, 1, 'only h1 matches the current rule');
  assert.equal(preview.matched_after, 2, 'h2 now also matches the draft\'s new term');
  assert.equal(preview.moved_in, 1);
  assert.equal(existsSync(path.join(f.workspacesRoot, folder, ...RULE_DIR, 'history')), false, 'preview never writes');

  const outcome = await reader.save(code, draft, '실측 확인 후 확정 트리거 추가');
  assert.equal(outcome.kind, 'saved');
  assert.equal(outcome.previous_version, 'v1');
  assert.equal(outcome.rule_version, 'v2');
  assert.ok(outcome.refresh.changed_files > 0, 'the refresh actually rewrote at least one ledger CSV');
  assert.ok(outcome.refresh.projects.includes(code));

  const currentRuleText = await readFile(path.join(f.workspacesRoot, folder, ...RULE_DIR, 'mail_routing_rule.json'), 'utf8');
  const currentRule = JSON.parse(currentRuleText);
  assert.equal(currentRule.rule_version, 'v2', 'the canonical file now holds vN+1');
  assert.deepEqual(currentRule.exact.map(term => term.label), ['P00-001', '새로운장비']);

  const historyJsonPath = path.join(f.workspacesRoot, folder, ...RULE_DIR, 'history', 'mail_routing_rule.v1.json');
  assert.equal(existsSync(historyJsonPath), true, 'history holds vN');
  const historyRule = JSON.parse(await readFile(historyJsonPath, 'utf8'));
  assert.equal(historyRule.rule_version, 'v1');
  assert.deepEqual(historyRule.exact.map(term => term.label), ['P00-001'], 'the archived version is the pre-save rule, unedited');

  const contactsCsvPath = path.join(f.workspacesRoot, folder, '020_MGMT/023_연락처_이해관계자/연락처_장부.csv');
  assert.equal(existsSync(contactsCsvPath), true, 'refresh() wrote a ledger CSV, not just the receipt');

  // The GET-path cache was invalidated by save(); a fresh readProject sees v2, not the
  // pre-save v1 that would otherwise still be cached for up to 60 seconds.
  const reread = await reader.readProject(code);
  assert.equal(reread.rule.rule_version, 'v2');
});
