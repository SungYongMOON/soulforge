import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import {
  isMachineActor, listProjects, readRule, RuleStoreError, saveRuleVersion, validateRule,
} from '../src/rule_store.mjs';

const CODE = 'P00-001';
const FOLDER = 'P00-001_예시과제';
const RULE_DIR = '020_MGMT/021_자동화설정_운영규칙';

function baseRuleJson(version = 'v1') {
  return {
    schema_version: RULE_SCHEMA_VERSION, project_code: CODE, folder_name: FOLDER, rule_version: version,
    status: 'draft_open_items', match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: [{ label: 'P00-001', kind: 'literal', value: 'P00-001' }, { label: '예시장비', kind: 'literal', value: '예시장비' }],
    hint: [{ label: '예시', kind: 'literal', value: '예시' }], yields_to: null,
    conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
    human_text: 'mail_routing_rule.md', generated_at: '2026-09-21T00:00:00.000Z',
  };
}

const BASE_MD = [
  '# 메일 라우팅 규칙 — P00-001',
  '',
  '- 상태: 초안 v1',
  '',
  '## 확정 트리거 (제목·본문·첨부명에 있으면 이 과제로 본다)',
  '',
  '- `P00-001`',
  '',
  '## Owner 확인 기록',
  '',
  '- 예시 결정 A',
  '- 예시 결정 B',
  '',
  '## Owner 확인이 필요한 것',
  '',
  '- 예시 미결 항목',
  '',
].join('\n');

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-rule-store-'));
  const workspacesRoot = path.join(root, '_workspaces');
  const workmetaRoot = path.join(root, '_workmeta');
  const ruleDir = path.join(workspacesRoot, FOLDER, RULE_DIR);
  mkdirSync(ruleDir, { recursive: true });
  writeFileSync(path.join(ruleDir, 'mail_routing_rule.json'), `${JSON.stringify(baseRuleJson(), null, 2)}\n`);
  writeFileSync(path.join(ruleDir, 'mail_routing_rule.md'), BASE_MD);
  // a folder with no rule json must not be listed
  mkdirSync(path.join(workspacesRoot, 'P00-002_규칙없음', '020_MGMT'), { recursive: true });
  return { root, workspacesRoot, workmetaRoot, ruleDir };
}

test('listProjects: finds folders with a 021 rule json, skips folders without one', () => {
  const { root, workspacesRoot } = makeFixture();
  try {
    const projects = listProjects({ workspacesRoot });
    assert.deepEqual(projects.map(p => p.project_code), ['P00-001']);
    assert.equal(projects[0].folder_name, FOLDER);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readRule: returns parsed json, md text and sha256 digests', () => {
  const { root, workspacesRoot } = makeFixture();
  try {
    const rule = readRule({ workspacesRoot, code: CODE });
    assert.equal(rule.json.rule_version, 'v1');
    assert.equal(rule.md, BASE_MD);
    assert.match(rule.sha256_json, /^sha256:[0-9a-f]{64}$/u);
    assert.match(rule.sha256_md, /^sha256:[0-9a-f]{64}$/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('validateRule: accepts a well-formed draft, rejects schema/version/policy problems', () => {
  const good = validateRule(baseRuleJson(), { folderName: FOLDER });
  assert.equal(good.valid, true);

  const badSchema = validateRule({ ...baseRuleJson(), schema_version: 'wrong' }, { folderName: FOLDER });
  assert.equal(badSchema.valid, false);
  assert.ok(badSchema.errors.includes('workspace_ledgers_rule_schema_mismatch'));

  const badFolder = validateRule({ ...baseRuleJson(), folder_name: 'X99-999_다른과제' }, { folderName: FOLDER });
  assert.equal(badFolder.valid, false);

  const badVersion = validateRule({ ...baseRuleJson(), rule_version: 'draft' }, { folderName: FOLDER });
  assert.equal(badVersion.valid, false);
  assert.ok(badVersion.errors.includes('workspace_ledgers_rule_version_format'));

  const noExact = validateRule({ ...baseRuleJson(), exact: [] }, { folderName: FOLDER });
  assert.equal(noExact.valid, false);
});

test('isMachineActor: flags the actor: convention, accepts a plain human name', () => {
  assert.equal(isMachineActor('actor:context-engine:voice-card-reconcile-v0'), true);
  assert.equal(isMachineActor('ACTOR:something'), true);
  assert.equal(isMachineActor(''), true);
  assert.equal(isMachineActor(undefined), true);
  assert.equal(isMachineActor('홍길동'), false);
});

test('saveRuleVersion: archives previous pair, bumps version, carries decisions/open-items forward, appends note', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    const draft = { ...baseRuleJson(), exact: [...baseRuleJson().exact, { label: '새트리거', kind: 'literal', value: '새트리거' }] };
    const result = saveRuleVersion({ workspacesRoot, workmetaRoot, code: CODE, draft, by: '홍길동', note: '새 트리거 추가', now: '2026-09-22T00:00:00.000Z' });
    assert.equal(result.previous_version, 'v1');
    assert.equal(result.rule_version, 'v2');

    const historyJson = path.join(ruleDir, 'history', 'mail_routing_rule.v1.json');
    const historyMd = path.join(ruleDir, 'history', 'mail_routing_rule.v1.md');
    assert.equal(existsSync(historyJson), true);
    assert.equal(existsSync(historyMd), true);
    assert.equal(JSON.parse(readFileSync(historyJson, 'utf8')).rule_version, 'v1');
    assert.equal(readFileSync(historyMd, 'utf8'), BASE_MD);

    const newJson = JSON.parse(readFileSync(path.join(ruleDir, 'mail_routing_rule.json'), 'utf8'));
    assert.equal(newJson.rule_version, 'v2');
    assert.ok(newJson.exact.some(term => term.label === '새트리거'));

    const newMd = readFileSync(path.join(ruleDir, 'mail_routing_rule.md'), 'utf8');
    assert.match(newMd, /예시 결정 A/u); // carried decisions
    assert.match(newMd, /예시 결정 B/u);
    assert.match(newMd, /예시 미결 항목/u); // carried open items
    assert.match(newMd, /새 트리거 추가/u); // new note appended
    assert.match(newMd, /홍길동/u);

    const jsonLineage = JSON.parse(readFileSync(path.join(workmetaRoot, FOLDER, 'lineage', 'mail_routing_rule.json.lineage.json'), 'utf8'));
    assert.equal(jsonLineage.rule_version, 'v2');
    assert.equal(jsonLineage.previous_rule_version, 'v1');
    assert.match(jsonLineage.previous_sha256, /^sha256:[0-9a-f]{64}$/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion: measured accepts previewRule\'s own return shape, never renders samples, never renders undefined', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    // exactly what previewRule({...}) returns -- the UI adapter passes this straight through as `measured`.
    const measured = {
      matched_before: 10, matched_after: 12, moved_in: 3, moved_out: 1, newly_held: 2,
      samples: { moved_in: [{ at: '2026-09-21T00:00:00Z', subject: 'REAL SUBJECT SHOULD NEVER APPEAR' }], moved_out: [], newly_held: [] },
    };
    saveRuleVersion({ workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '홍길동', note: 'x', measured, now: '2026-09-22T00:00:00.000Z' });
    const md = readFileSync(path.join(ruleDir, 'mail_routing_rule.md'), 'utf8');
    assert.match(md, /확정 12건/u);
    assert.match(md, /새로 매칭 3건/u);
    assert.match(md, /매칭 해제 1건/u);
    assert.match(md, /새로 보류 2건/u);
    assert.doesNotMatch(md, /undefined/u);
    assert.doesNotMatch(md, /REAL SUBJECT SHOULD NEVER APPEAR/u); // samples must never render
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion: measured also accepts the legacy {subjects, exact, hint_only} shape', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    saveRuleVersion({
      workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '홍길동', note: 'x',
      measured: { subjects: 100, exact: 7, hint_only: 2 }, now: '2026-09-22T00:00:00.000Z',
    });
    const md = readFileSync(path.join(ruleDir, 'mail_routing_rule.md'), 'utf8');
    assert.match(md, /메일 100건 중/u);
    assert.match(md, /이 과제 확정 7건/u);
    assert.match(md, /힌트만 2건/u);
    assert.doesNotMatch(md, /undefined/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion (fresh-review-2 #7/S7): carries prose, a table and nested bullets in Owner sections verbatim, not bullet-only', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    const richMd = [
      '# 메일 라우팅 규칙 — P00-001',
      '',
      '- 상태: 초안 v1',
      '',
      '## 확정 트리거 (제목·본문·첨부명에 있으면 이 과제로 본다)',
      '',
      '- `P00-001`',
      '',
      '## Owner 확인 기록',
      '',
      '2026-09-20 회의에서 아래와 같이 확인했다:',
      '',
      '| 항목 | 결정 |',
      '| --- | --- |',
      '| 범위 | 전부 포함 |',
      '',
      '- 결정 A',
      '  - 세부 사항 1',
      '  - 세부 사항 2',
      '',
      '## Owner 확인이 필요한 것',
      '',
      '- 미결 항목 1',
      '',
    ].join('\n');
    writeFileSync(path.join(ruleDir, 'mail_routing_rule.md'), richMd);
    saveRuleVersion({ workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '홍길동', note: '새 메모', now: '2026-09-22T00:00:00.000Z' });
    const newMd = readFileSync(path.join(ruleDir, 'mail_routing_rule.md'), 'utf8');
    assert.match(newMd, /2026-09-20 회의에서 아래와 같이 확인했다:/u); // prose line
    assert.match(newMd, /\| 항목 \| 결정 \|/u); // table header
    assert.match(newMd, /\| 범위 \| 전부 포함 \|/u); // table row
    assert.match(newMd, /- 결정 A\n {2}- 세부 사항 1\n {2}- 세부 사항 2/u); // nested bullets, verbatim indentation
    assert.match(newMd, /새 메모/u); // new note still appended
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion: a missing measured renders the UNKNOWN line, never undefined', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    saveRuleVersion({ workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '홍길동', note: 'x', now: '2026-09-22T00:00:00.000Z' });
    const md = readFileSync(path.join(ruleDir, 'mail_routing_rule.md'), 'utf8');
    assert.match(md, /측정값 없음 \(UNKNOWN\)/u);
    assert.doesNotMatch(md, /undefined/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion: refuses a machine actor', () => {
  const { root, workspacesRoot, workmetaRoot } = makeFixture();
  try {
    assert.throws(() => saveRuleVersion({
      workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(),
      by: 'actor:context-engine:voice-card-reconcile-v0', note: 'x',
    }), error => error instanceof RuleStoreError && error.code === 'workspace_ledgers_actor_not_human');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion: never overwrites an existing history pair', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    mkdirSync(path.join(ruleDir, 'history'), { recursive: true });
    writeFileSync(path.join(ruleDir, 'history', 'mail_routing_rule.v1.json'), 'pre-existing');
    assert.throws(() => saveRuleVersion({
      workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '홍길동', note: 'x',
    }), error => error instanceof RuleStoreError && error.code === 'workspace_ledgers_rule_history_collision');
    // the canonical file must be untouched -- still v1
    const stillV1 = JSON.parse(readFileSync(path.join(ruleDir, 'mail_routing_rule.json'), 'utf8'));
    assert.equal(stillV1.rule_version, 'v1');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readRule: normalises a legacy single-object yields_to on disk into an array', () => {
  const { root, workspacesRoot, ruleDir } = makeFixture();
  try {
    const legacy = { ...baseRuleJson(), yields_to: { project_code: 'P00-999', when: { label: 'LEGACY', kind: 'literal', value: 'legacy' } } };
    writeFileSync(path.join(ruleDir, 'mail_routing_rule.json'), `${JSON.stringify(legacy, null, 2)}\n`);
    const rule = readRule({ workspacesRoot, code: CODE });
    assert.deepEqual(rule.json.yields_to, [{ project_code: 'P00-999', when: { label: 'LEGACY', kind: 'literal', value: 'legacy' } }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion: always writes the array form of yields_to and renders one 넘김 line per entry', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    const draft = {
      ...baseRuleJson(),
      yields_to: [
        { project_code: 'P00-010', when: { label: 'HANDOVER-A', kind: 'literal', value: '핸드오버A' } },
        { project_code: 'P00-011', when: { label: 'HANDOVER-B', kind: 'literal', value: '핸드오버B' } },
      ],
    };
    saveRuleVersion({ workspacesRoot, workmetaRoot, code: CODE, draft, by: '홍길동', note: '넘김 추가', now: '2026-09-22T00:00:00.000Z' });
    const newJson = JSON.parse(readFileSync(path.join(ruleDir, 'mail_routing_rule.json'), 'utf8'));
    assert.equal(Array.isArray(newJson.yields_to), true);
    assert.equal(newJson.yields_to.length, 2);
    const newMd = readFileSync(path.join(ruleDir, 'mail_routing_rule.md'), 'utf8');
    assert.match(newMd, /넘김: 같은 메일에 `HANDOVER-A`이 있으면 이 과제가 아니라 `P00-010`로 본다\./u);
    assert.match(newMd, /넘김: 같은 메일에 `HANDOVER-B`이 있으면 이 과제가 아니라 `P00-011`로 본다\./u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion: also normalises a legacy single-object draft yields_to into an array on write', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    const draft = { ...baseRuleJson(), yields_to: { project_code: 'P00-010', when: { label: 'HANDOVER-A', kind: 'literal', value: '핸드오버A' } } };
    saveRuleVersion({ workspacesRoot, workmetaRoot, code: CODE, draft, by: '홍길동', note: '레거시 넘김', now: '2026-09-22T00:00:00.000Z' });
    const newJson = JSON.parse(readFileSync(path.join(ruleDir, 'mail_routing_rule.json'), 'utf8'));
    assert.deepEqual(newJson.yields_to, [{ project_code: 'P00-010', when: { label: 'HANDOVER-A', kind: 'literal', value: '핸드오버A' } }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion (N16): allowedActors pins who may save, machine-actor refusal still always applies', () => {
  const { root, workspacesRoot, workmetaRoot } = makeFixture();
  try {
    assert.throws(() => saveRuleVersion({
      workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '아무개', note: 'x', allowedActors: ['owner'],
    }), error => error instanceof RuleStoreError && error.code === 'workspace_ledgers_actor_not_allowed');
    const result = saveRuleVersion({
      workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: 'owner', note: 'pinned actor', allowedActors: ['owner'],
    });
    assert.equal(result.rule_version, 'v2');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion (N15): a failure on the second (md) rename rolls the json twin back to its archived version', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    let renameCalls = 0;
    const failSecondRename = (src, dest) => {
      renameCalls += 1;
      if (renameCalls === 2) { const error = new Error('injected failure'); error.code = 'EINJECTED'; throw error; }
      return renameSync(src, dest);
    };
    assert.throws(() => saveRuleVersion({
      workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '홍길동', note: 'x',
      _renameTwinFn: failSecondRename,
    }), error => error instanceof RuleStoreError && error.code === 'workspace_ledgers_rule_save_write_failed');
    // json must be rolled back to the original v1 content -- never left at v2 while md stayed at v1.
    const jsonAfter = JSON.parse(readFileSync(path.join(ruleDir, 'mail_routing_rule.json'), 'utf8'));
    assert.equal(jsonAfter.rule_version, 'v1');
    const mdAfter = readFileSync(path.join(ruleDir, 'mail_routing_rule.md'), 'utf8');
    assert.equal(mdAfter, BASE_MD); // md was never touched by the failed second rename
    // no leftover staging/rollback temp files
    const entries = readdirSync(ruleDir);
    assert.deepEqual(entries.filter(name => name.includes('.writing-') || name.includes('.rollback-')), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('saveRuleVersion: lock held by a fresh lock refuses; a stale lock is reclaimed', () => {
  const { root, workspacesRoot, workmetaRoot, ruleDir } = makeFixture();
  try {
    const lockFile = path.join(ruleDir, 'rule_save.lock');
    writeFileSync(lockFile, JSON.stringify({ pid: 999999, started_at: '2026-09-22T00:00:00.000Z' }));
    assert.throws(() => saveRuleVersion({
      workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '홍길동', note: 'x', now: '2026-09-22T00:01:00.000Z',
    }), error => error instanceof RuleStoreError && error.code === 'workspace_ledgers_lock_held');

    // a lock far older than the stale window is reclaimed and the save proceeds
    writeFileSync(lockFile, JSON.stringify({ pid: 999999, started_at: '2026-01-01T00:00:00.000Z' }));
    const result = saveRuleVersion({
      workspacesRoot, workmetaRoot, code: CODE, draft: baseRuleJson(), by: '홍길동', note: 'x', now: '2026-09-22T00:01:00.000Z',
    });
    assert.equal(result.rule_version, 'v2');
    assert.equal(existsSync(lockFile), false); // released after the save completes
  } finally { rmSync(root, { recursive: true, force: true }); }
});
