import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createMailRuleReader, createMailRulePlugin, validateRuleDocument, parseBulletSection,
  validateDraft, findProjectFolders, createDefaultMailRuleCore,
  MAIL_RULES_SNAPSHOT_PATH, MAIL_RULE_SNAPSHOT_PATH, MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH,
} from './mail-rule-adapter.mjs';

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
  assert.equal(validateRuleDocument(doc, 'P00-001'), doc);
  assert.throws(() => validateRuleDocument({ ...doc, schema_version: 'wrong' }, 'P00-001'));
  assert.throws(() => validateRuleDocument({ ...doc, project_code: 'P00-002' }, 'P00-001'));
  assert.throws(() => validateRuleDocument({ ...doc, exact: [{ label: 'x' }] }, 'P00-001'));
  assert.throws(() => validateRuleDocument(null, 'P00-001'));
  assert.throws(() => validateRuleDocument({ ...doc, yields_to: { project_code: 'P00-002' } }, 'P00-001'));
  const withYield = ruleDoc({ yields_to: { project_code: 'P00-002', when: { label: 'a', kind: 'literal', value: 'a' } } });
  assert.equal(validateRuleDocument(withYield, 'P00-001'), withYield);
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
    const res = await call(MAIL_RULES_SNAPSHOT_PATH, { method, headers });
    assert.equal(res.statusCode, code, `${method} ${JSON.stringify(headers)}`);
  }
});

test('GET /mail-rules.snapshot.json and /mail-rule.snapshot.json reject unexpected query keys with 400', async () => {
  const call = harness({});
  assert.equal((await call(`${MAIL_RULES_SNAPSHOT_PATH}?x=1`)).statusCode, 400);
  assert.equal((await call(`${MAIL_RULE_SNAPSHOT_PATH}?other=1`)).statusCode, 400);
});

test('GET /mail-rule.snapshot.json returns the ready projection for a configured project', async t => {
  const f = await fixture(t);
  await writeProject(f.workspacesRoot, 'P00-001_예시과제', ruleDoc(), MD_FIXTURE);
  const call = harness({ workspacesRoot: f.workspacesRoot });
  const res = await call(`${MAIL_RULE_SNAPSHOT_PATH}?project=P00-001`);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.state, 'ready');
  assert.equal(body.rule.project_code, 'P00-001');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
});

test('POST /mail-rule/save refuses write_disabled before any body parsing when the write flag is off', async t => {
  const f = await fixture(t);
  const call = harness({ workspacesRoot: f.workspacesRoot, writeEnabled: false });
  const res = await call(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'not even json' });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(JSON.parse(res.body), { state: 'write_disabled' });
});

test('POST /mail-rule/preview and /mail-rule/save answer core_module_unavailable once validation passes and no core is wired', async t => {
  const f = await fixture(t);
  const call = harness({ workspacesRoot: f.workspacesRoot, writeEnabled: true });
  const draft = { project: 'P00-001', draft: { exact: [{ label: 'a', kind: 'literal', value: 'a' }], hint: [] } };
  for (const p of [MAIL_RULE_PREVIEW_PATH, MAIL_RULE_SAVE_PATH]) {
    const res = await call(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
    assert.equal(res.statusCode, 503, p);
    assert.deepEqual(JSON.parse(res.body), { state: 'core_module_unavailable' }, p);
  }
});

test('POST routes validate content-type, oversized bodies and invalid drafts with an injected fake core', async t => {
  const f = await fixture(t);
  const fakeCore = { previewRule: async args => ({ matched_before: 1, matched_after: 2, args }), saveRuleVersion: async () => ({ rule_version: 'v2' }), refresh: async () => ({}) };
  const call = harness({ workspacesRoot: f.workspacesRoot, writeEnabled: true, core: fakeCore });

  const wrongType = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(wrongType.statusCode, 415);

  const tooLarge = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [], note: 'x'.repeat(64 * 1024) } }) });
  assert.equal(tooLarge.statusCode, 413);

  const badDraft = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-001', draft: { exact: [{ label: 'a', kind: 'literal', value: 'a'.repeat(200) }], hint: [] } }) });
  assert.equal(badDraft.statusCode, 400);

  const badProject = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'not-a-code', draft: { exact: [], hint: [] } }) });
  assert.equal(badProject.statusCode, 400);

  const ok = await call(MAIL_RULE_PREVIEW_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-001', draft: { exact: [{ label: 'a', kind: 'literal', value: 'a' }], hint: [] } }) });
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).state, 'ready');

  const saved = await call(MAIL_RULE_SAVE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'P00-001', draft: { exact: [], hint: [] } }) });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(JSON.parse(saved.body), { state: 'ready', result: { rule_version: 'v2' } });
});
