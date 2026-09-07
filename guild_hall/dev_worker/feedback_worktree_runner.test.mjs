import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFeedbackWorktreeRunner } from './feedback_worktree_runner.mjs';
import { createFeedbackCycle } from './feedback_cycle.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gitExe = process.platform === 'win32'
  ? execFileSync('where.exe', ['git.exe'], { encoding: 'utf8' }).trim().split(/\r?\n/u)[0]
  : execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const gitHash = sha(readFileSync(gitExe));
const nodeHash = sha(readFileSync(process.execPath));
const patch = (target = 'src/value.mjs') => `diff --git a/${target} b/${target}\n--- a/${target}\n+++ b/${target}\n@@ -1 +1 @@\n-export const answer = 1;\n+export const answer = 2;\n`;
const packet = () => ({ schema_version: 'soulforge.dev_worker_request.v0', task_id: 'bounded_fix', status: 'ready',
  summary: 'Synthetic local source repair', allowed_write_paths: ['src/value.mjs'], acceptance_checks: ['check.answer'],
  draft_branch_allowed: true, origin: { kind: 'agent_generated' },
  owner_approval: { required: true, approved: true, approved_by: 'trusted.synthetic' } });
const context = (extra = {}) => ({ run_ref: `feedback.run.${Math.random().toString(16).slice(2)}`,
  deadline_at: new Date(Date.now() + 60_000).toISOString(), signal: new AbortController().signal, ...extra });

function fixture(t, overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'feedback-worktree-test-'));
  const repoRoot = path.join(root, 'repo'), worktreeRoot = path.join(root, 'candidates');
  mkdirSync(repoRoot); mkdirSync(worktreeRoot); mkdirSync(path.join(repoRoot, 'src')); mkdirSync(path.join(repoRoot, 'checks'));
  writeFileSync(path.join(repoRoot, 'src/value.mjs'), 'export const answer = 1;\n');
  writeFileSync(path.join(repoRoot, 'src/other.mjs'), 'export const answer = 1;\n');
  const validator = "import assert from 'node:assert/strict';\nimport {answer} from '../src/value.mjs';\nassert.equal(answer,2);\nassert.equal(process.env.FEEDBACK_SYNTHETIC_SECRET,undefined);\nconsole.log('synthetic validation passed');\n";
  writeFileSync(path.join(repoRoot, 'checks/answer.mjs'), validator);
  const git = args => execFileSync(gitExe, ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: repoRoot, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q']); git(['add', '--', 'src/value.mjs', 'src/other.mjs', 'checks/answer.mjs']);
  git(['-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'synthetic base']);
  const calls = [];
  const config = { repoRoot, worktreeRoot, baseCommit: git(['rev-parse', 'HEAD']).trim(),
    git: { executable: gitExe, sha256: gitHash }, allowedFiles: ['src/value.mjs'],
    validationCatalog: [{ check_id: 'check.answer', executable: process.execPath, executable_sha256: nodeHash,
      argv: ['checks/answer.mjs'], file_pins: [{ path: 'checks/answer.mjs', sha256: sha(validator) }] }],
    authorRef: 'author.synthetic', patchReviewerRef: 'reviewer.independent',
    authorizeInput: async (value, refs) => { calls.push(['authorize', refs]); return true; },
    proposePatch: async value => { calls.push(['propose', value]); return { author_ref: 'author.synthetic', patch: patch() }; },
    inspectPatch: async value => { calls.push(['inspect', value]); return { status: 'ACCEPT', author_ref: value.author_ref,
      reviewer_ref: 'reviewer.independent', patch_sha256: value.patch_sha256, review_ref: 'review.patch.synthetic' }; },
    ...overrides };
  t.after(() => {
    // Only test-owned synthetic repositories are recursively removed.
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith('feedback-worktree-test-'));
    rmSync(root, { recursive: true, force: true });
  });
  return { root, repoRoot, worktreeRoot, git, config, calls, runner: () => createFeedbackWorktreeRunner(config) };
}

test('real sparse Git candidate changes imported code; pinned validator passes while base still fails', async t => {
  const f = fixture(t), runner = f.runner(), p = packet(), ctx = context();
  assert.throws(() => execFileSync(process.execPath, ['checks/answer.mjs'], { cwd: f.repoRoot, stdio: 'pipe' }));
  const candidate = await runner.execute(p, ctx);
  assert.match(candidate.branch_ref, /^codex\/feedback-/u);
  assert.equal(readFileSync(path.join(candidate.worktree_path, 'src/value.mjs'), 'utf8'), 'export const answer = 2;\n');
  assert.equal(existsSync(path.join(candidate.worktree_path, 'src/other.mjs')), false);
  const before = process.env.FEEDBACK_SYNTHETIC_SECRET;
  process.env.FEEDBACK_SYNTHETIC_SECRET = 'synthetic-no-export';
  try { assert.equal((await runner.validate(candidate, p, ctx)).status, 'PASS'); }
  finally { if (before === undefined) delete process.env.FEEDBACK_SYNTHETIC_SECRET; else process.env.FEEDBACK_SYNTHETIC_SECRET = before; }
  assert.equal(readFileSync(path.join(f.repoRoot, 'src/value.mjs'), 'utf8'), 'export const answer = 1;\n');
  assert.equal(f.git(['status', '--porcelain']), '');
  assert.deepEqual(f.calls.map(x => x[0]), ['authorize', 'propose', 'inspect', 'authorize']);
  assert.equal(f.calls[0][1][0].sha256, sha('export const answer = 1;\n'));
  assert.equal(f.calls[1][1].sources[0].content, 'export const answer = 1;\n');
  const state = JSON.stringify(runner.state());
  assert.equal(state.includes('export const answer'), false);
  assert.equal(state.includes('synthetic validation passed'), false);
  assert.match(state, /feedback-worktree\.log\./u);
});

test('source authority denial precedes proposer and preserves base', async t => {
  const f = fixture(t, { authorizeInput: async () => false });
  await assert.rejects(f.runner().execute(packet(), context()), { feedbackCode: 'FEEDBACK_INPUT_DENIED' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.git(['status', '--porcelain']), '');
});

test('exact catalog rejects protected scopes, globs, case aliases, and generated commands', async t => {
  const f = fixture(t);
  for (const bad of ['AGENTS.md', '_workmeta/a.json', 'private-state/x.mjs', 'src/.env', 'src/credentials.json', 'src/*.mjs', 'SRC/value.mjs', '../src/value.mjs']) {
    const p = { ...packet(), allowed_write_paths: [bad] };
    await assert.rejects(f.runner().execute(p, context()));
  }
  await assert.rejects(f.runner().execute({ ...packet(), acceptance_checks: ['node -e process.exit(0)'] }, context()));
  assert.equal(f.calls.length, 0);
  assert.equal(f.git(['status', '--porcelain']), '');
});

test('out-of-scope, rename, new-file, binary, and mode patches fail closed', async t => {
  for (const bad of [patch('src/other.mjs'),
    'diff --git a/src/value.mjs b/src/other.mjs\nsimilarity index 100%\nrename from src/value.mjs\nrename to src/other.mjs\n',
    'diff --git a/src/value.mjs b/src/value.mjs\nold mode 100644\nnew mode 100755\n',
    'diff --git a/src/new.mjs b/src/new.mjs\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.mjs\n@@ -0,0 +1 @@\n+x\n',
    'diff --git a/src/value.mjs b/src/value.mjs\nGIT binary patch\nliteral 0\nHcmV?d00001\n',
  ]) {
    const f = fixture(t, { proposePatch: async () => ({ author_ref: 'author.synthetic', patch: bad }) });
    await assert.rejects(f.runner().execute(packet(), context()));
    assert.equal(f.git(['status', '--porcelain']), '');
  }
});

test('independent patch review binds exact hash and fixed distinct identities', async t => {
  for (const receipt of [{ status: 'ACCEPT', reviewer_ref: 'author.synthetic' }, { status: 'ACCEPT', reviewer_ref: 'reviewer.independent', patch_sha256: '0'.repeat(64) }]) {
    const f = fixture(t, { inspectPatch: async value => ({ author_ref: value.author_ref, patch_sha256: value.patch_sha256, review_ref: 'review.synthetic', ...receipt }) });
    await assert.rejects(f.runner().execute(packet(), context()), { feedbackCode: 'FEEDBACK_PATCH_REVIEW_DENIED' });
  }
});

test('dirty base and base SHA mismatch stop before source dispatch', async t => {
  const f = fixture(t); writeFileSync(path.join(f.repoRoot, 'src/other.mjs'), 'changed');
  await assert.rejects(f.runner().execute(packet(), context()), { feedbackCode: 'FEEDBACK_BASE_CHANGED' });
  assert.equal(f.calls.length, 0);
  const g = fixture(t); g.config.baseCommit = '0'.repeat(40);
  await assert.rejects(g.runner().execute(packet(), context()), { feedbackCode: 'FEEDBACK_BASE_CHANGED' });
});

test('candidate validator and candidate source drift deny validation', async t => {
  for (const target of ['checks/answer.mjs', 'src/value.mjs']) {
    const f = fixture(t), runner = f.runner(), p = packet(), ctx = context();
    const candidate = await runner.execute(p, ctx);
    writeFileSync(path.join(candidate.worktree_path, target), 'process.exit(0);\n');
    await assert.rejects(runner.validate(candidate, p, ctx), { feedbackCode: 'FEEDBACK_CANDIDATE_CHANGED' });
  }
});

test('executable hash and validator catalog pin drift fail before execution', async t => {
  const f = fixture(t); f.config.git.sha256 = '0'.repeat(64);
  await assert.rejects(f.runner().execute(packet(), context()), { feedbackCode: 'FEEDBACK_EXECUTABLE_CHANGED' });
  const g = fixture(t); g.config.validationCatalog[0].file_pins[0].sha256 = '0'.repeat(64);
  await assert.rejects(g.runner().execute(packet(), context()), { feedbackCode: 'FEEDBACK_VALIDATOR_CHANGED' });
});

test('run references cannot recreate branches, and unissued candidate metadata cannot authorize validation', async t => {
  const f = fixture(t), runner = f.runner(), ctx = context(), p = packet();
  const c = await runner.execute(p, ctx);
  await assert.rejects(runner.execute(p, ctx), { feedbackCode: 'FEEDBACK_RUN_REUSED' });
  await assert.rejects(runner.validate({ ...c, patch_sha256: '0'.repeat(64) }, p, ctx), { feedbackCode: 'FEEDBACK_CANDIDATE_UNKNOWN' });
});

test('abort waits for direct validator child close and retains an internal review candidate', async t => {
  const f = fixture(t);
  const slow = "console.log('synthetic slow validator'); setTimeout(() => process.exit(0), 30000);\n";
  writeFileSync(path.join(f.repoRoot, 'checks/answer.mjs'), slow);
  f.git(['add', '--', 'checks/answer.mjs']); f.git(['-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'slow validator']);
  f.config.baseCommit = f.git(['rev-parse', 'HEAD']).trim(); f.config.validationCatalog[0].file_pins[0].sha256 = sha(slow);
  const runner = f.runner(), abort = new AbortController(), ctx = context({ signal: abort.signal }), p = packet();
  const candidate = await runner.execute(p, ctx);
  const pending = runner.validate(candidate, p, ctx);
  const timer = setTimeout(() => abort.abort(), 300);
  try { await assert.rejects(pending, { feedbackCode: 'FEEDBACK_CHILD_INTERRUPTED' }); } finally { clearTimeout(timer); }
  assert.equal(runner.state().active_children, 0);
  assert.equal(existsSync(candidate.worktree_path), true);
});

test('ordinary-file gate rejects a symlinked source directory before reading source bytes', async t => {
  const f = fixture(t);
  const p = { ...packet(), allowed_write_paths: ['linked/value.mjs'] };
  f.config.allowedFiles = ['linked/value.mjs'];
  // No symlink contents or external real data: this junction targets fixture src.
  symlinkSync(path.join(f.repoRoot, 'src'), path.join(f.repoRoot, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.runner().execute(p, context()));
  assert.equal(f.calls.length, 0);
});

test('tracked source hardlinks are refused before the proposer receives any content', async t => {
  const f = fixture(t);
  linkSync(path.join(f.repoRoot, 'src/value.mjs'), path.join(f.root, 'synthetic-hardlink.mjs'));
  assert.equal(f.git(['status', '--porcelain']), '');
  await assert.rejects(f.runner().execute(packet(), context()), { feedbackCode: 'FEEDBACK_FILE_INVALID' });
  assert.equal(f.calls.length, 0);
});

test('ignored candidate additions cannot become undeclared validator dependencies', async t => {
  const f = fixture(t), runner = f.runner(), ctx = context(), p = packet();
  writeFileSync(path.join(f.repoRoot, '.git/info/exclude'), 'checks/extra.mjs\n');
  const candidate = await runner.execute(p, ctx);
  writeFileSync(path.join(candidate.worktree_path, 'checks/extra.mjs'), 'process.exit(0);\n');
  assert.equal(execFileSync(gitExe, ['ls-files', '--others', '--exclude-standard'], { cwd: candidate.worktree_path, encoding: 'utf8' }), '');
  await assert.rejects(runner.validate(candidate, p, ctx), { feedbackCode: 'FEEDBACK_CANDIDATE_CHANGED' });
});

test('a stopped or expired context never dispatches source, and output overflow is bounded', async t => {
  const f = fixture(t), abort = new AbortController(); abort.abort();
  await assert.rejects(f.runner().execute(packet(), context({ signal: abort.signal })), { feedbackCode: 'FEEDBACK_CHILD_INTERRUPTED' });
  await assert.rejects(f.runner().execute(packet(), context({ deadline_at: new Date(Date.now() - 1).toISOString() })), { feedbackCode: 'FEEDBACK_CHILD_INTERRUPTED' });
  assert.equal(f.calls.length, 0);
  const g = fixture(t, { maxLogBytes: 1024 });
  const loud = "process.stdout.write('x'.repeat(100000));\n";
  writeFileSync(path.join(g.repoRoot, 'checks/answer.mjs'), loud);
  g.git(['add', '--', 'checks/answer.mjs']); g.git(['-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'bounded output']);
  g.config.baseCommit = g.git(['rev-parse', 'HEAD']).trim(); g.config.validationCatalog[0].file_pins[0].sha256 = sha(loud);
  const runner = g.runner(), p = packet(), ctx = context(), candidate = await runner.execute(p, ctx);
  await assert.rejects(runner.validate(candidate, p, ctx), { feedbackCode: 'FEEDBACK_LOG_LIMIT' });
  assert.equal(runner.state().active_children, 0);
});

test('real execution and validation integrate through the durable cycle to an independently reviewed report', async t => {
  const f = fixture(t), runner = f.runner(), p = packet(), db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const item = { source_ref: 'linear.synthetic.worktree', source_revision: 'revision.synthetic.1',
    scope_ref: 'scope.synthetic.source', semantic_sha256: sha('synthetic meaningful change'), kind: 'bug' };
  let reviewed = 0, reported = 0;
  const cycle = createFeedbackCycle({ db,
    source: { snapshot: async () => ({ status: 'CURRENT', snapshot_ref: 'snapshot.synthetic.worktree', items: [item] }),
      current: async (ref, digest) => ref === item.source_ref && digest === item.semantic_sha256 },
    authorize: async () => true,
    prepare: async () => ({ status: 'READY', packet: p, packet_sha256: sha(JSON.stringify(p)) }),
    execute: runner.execute, validate: runner.validate,
    review: async (candidate, checked, reviewPacket) => {
      assert.equal(checked.status, 'PASS'); assert.equal(checked.checks[0].check_id, 'check.answer');
      assert.equal(candidate.packet_sha256, sha(JSON.stringify(reviewPacket)));
      assert.equal(candidate.patch_sha256, sha(patch()));
      assert.match(candidate.candidate_ref, /^feedback\.candidate\./u); assert.match(checked.validation_ref, /^feedback\.validation\./u);
      reviewed++; return { status: 'ACCEPT', review_ref: 'review.independent.worktree' };
    },
    report: async result => {
      assert.equal(result.source_ref, item.source_ref); assert.equal(result.review_ref, 'review.independent.worktree');
      assert.match(result.validation_ref, /^feedback\.validation\./u);
      reported++; return { report_ref: 'report.synthetic.worktree' };
    },
  });
  const result = await cycle.runOnce();
  assert.equal(result.status, 'CANDIDATE_REPORTED'); assert.equal(result.official_done, false);
  assert.equal((await cycle.runOnce()).status, 'NO_CHANGE');
  assert.equal(reviewed, 1); assert.equal(reported, 1);
  assert.equal(readFileSync(path.join(f.repoRoot, 'src/value.mjs'), 'utf8'), 'export const answer = 1;\n');
  assert.equal(f.git(['status', '--porcelain']), '');
});
