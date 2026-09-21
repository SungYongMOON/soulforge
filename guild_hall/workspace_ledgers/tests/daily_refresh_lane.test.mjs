// Proves the lane spec (guild_hall/deployment_pack/lanes/workspace_ledgers_
// lane.spec.json) actually carries everything ops/daily_refresh.mjs and
// cli.mjs need: builds a lane-shaped tree from ONLY what the spec's own
// tracked_paths/tracked_excludes say it carries (the same `buildLaneTree`
// approach guild_hall/context_engine/tests/answer_eval.test.mjs uses for its
// own two lane specs), then imports the daily runner inside that tree and
// lets Node's own import resolver be the judge -- a cross-module import this
// spec does not actually carry is invisible until the lane runs; building it
// here and importing from it makes that visible in the ordinary test suite
// instead.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const SPEC_PATH = 'guild_hall/deployment_pack/lanes/workspace_ledgers_lane.spec.json';
const tmp = prefix => mkdtempSync(path.join(tmpdir(), prefix));

/** Copies exactly what the lane spec says it carries into a scratch tree -- mirrors answer_eval.test.mjs's own helper. */
function buildLaneTree(specRef, destRoot) {
  const spec = JSON.parse(readFileSync(path.join(REPO_ROOT, specRef), 'utf8'));
  const excludes = spec.tracked_excludes ?? [];
  const posixRel = from => path.relative(REPO_ROOT, from).split(path.sep).join('/');
  const excluded = rel => excludes.some(prefix => rel === prefix.replace(/\/$/u, '') || rel.startsWith(prefix));
  for (const tracked of spec.tracked_paths) {
    const source = path.join(REPO_ROOT, tracked);
    if (!existsSync(source)) continue;
    const destination = path.join(destRoot, tracked);
    if (tracked.endsWith('/')) {
      cpSync(source, destination, { recursive: true,
        filter: from => !excluded(posixRel(from) + (lstatSync(from).isDirectory() ? '/' : '')) });
    } else {
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(source, destination);
    }
  }
  return spec;
}

test('workspace_ledgers_lane.spec.json: tracked_paths carries the whole module wholesale, tests excluded', () => {
  const spec = JSON.parse(readFileSync(path.join(REPO_ROOT, SPEC_PATH), 'utf8'));
  assert.equal(spec.schema, 'soulforge.source_lane_spec.v0');
  assert.equal(spec.lane_id, 'workspace-ledgers-v1');
  assert.deepEqual(spec.tracked_paths, ['guild_hall/workspace_ledgers/']);
  assert.deepEqual(spec.tracked_excludes, ['guild_hall/workspace_ledgers/tests/']);
  assert.deepEqual(spec.carried_forward_prefixes, []);
  for (const entry of spec.entry_points) {
    assert.equal(existsSync(path.join(REPO_ROOT, entry)), true, `entry point missing in the working tree: ${entry}`);
  }
});

test('the daily runner and cli import inside a tree built from only what the lane spec carries', () => {
  const root = tmp('wl-lane-');
  const spec = buildLaneTree(SPEC_PATH, root);
  const dailyRunner = path.join(root, 'guild_hall', 'workspace_ledgers', 'ops', 'daily_refresh.mjs');
  const cli = path.join(root, 'guild_hall', 'workspace_ledgers', 'cli.mjs');
  assert.equal(existsSync(dailyRunner), true, 'lane did not carry ops/daily_refresh.mjs');
  assert.equal(existsSync(cli), true, 'lane did not carry cli.mjs');
  // Excluded: the tests directory must never ship in a built lane.
  assert.equal(existsSync(path.join(root, 'guild_hall', 'workspace_ledgers', 'tests')), false,
    'lane unexpectedly carries its own tests directory');

  execFileSync(process.execPath, ['--check', dailyRunner], { stdio: 'ignore' });
  execFileSync(process.execPath, ['--check', cli], { stdio: 'ignore' });

  const probe = path.join(root, 'lane_probe.mjs');
  writeFileSync(probe, `import { DAILY_RECEIPT_SCHEMA, runDailyRefresh } from './guild_hall/workspace_ledgers/ops/daily_refresh.mjs';
import { refresh } from './guild_hall/workspace_ledgers/src/refresh.mjs';
import { refreshCommon } from './guild_hall/workspace_ledgers/src/common_refresh.mjs';
if (typeof runDailyRefresh !== 'function' || typeof refresh !== 'function' || typeof refreshCommon !== 'function') process.exit(3);
if (DAILY_RECEIPT_SCHEMA !== 'soulforge.workspace_ledgers_daily_receipt.v1') process.exit(4);
process.stdout.write('LANE_IMPORT_OK');
`);
  const out = execFileSync(process.execPath, [probe], { cwd: root, encoding: 'utf8' });
  assert.equal(out.trim(), 'LANE_IMPORT_OK', `${SPEC_PATH} could not import its own runner/library inside the built lane`);
  void spec;
});

// -------------------------------------------------------- real lane build
// This is deliverable 3's own "prove it" step, made an ordinary automated
// test rather than a one-off manual run: build_source_lane.mjs from a CLEAN
// commit (this test skips itself when the working tree is dirty, since
// requireCleanTree refuses otherwise -- exactly what a CI checkout always
// is, and what a local dev checkout with pending edits is not), --verify the
// built lane, then run the daily runner --dry FROM the built lane against a
// synthetic fixture plane under os.tmpdir() (never the real plane).
test('build_source_lane.mjs builds this lane from a clean commit, --verify passes, and the daily runner --dry runs from the built copy', async t => {
  const { spawnSync } = await import('node:child_process');
  const status = spawnSync('git', ['-C', REPO_ROOT, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.status !== 0) { t.skip('git status unavailable; nothing to build'); return; }
  if (status.stdout.trim() !== '') { t.skip('working tree is dirty; build_source_lane.mjs requires a clean commit'); return; }

  const outRoot = path.join(tmp('wl-lane-build-'), 'lane');
  const builder = path.join(REPO_ROOT, 'guild_hall', 'deployment_pack', 'tools', 'build_source_lane.mjs');
  const build = spawnSync(process.execPath, [builder, '--spec', path.join(REPO_ROOT, SPEC_PATH), '--out', outRoot, '--repo', REPO_ROOT],
    { encoding: 'utf8' });
  assert.equal(build.status, 0, `build_source_lane.mjs failed: ${build.stdout}\n${build.stderr}`);

  const verify = spawnSync(process.execPath, [builder, '--verify', outRoot], { encoding: 'utf8' });
  assert.equal(verify.status, 0, `--verify failed: ${verify.stdout}\n${verify.stderr}`);
  assert.match(verify.stdout, /0 failure\(s\)/);

  // A synthetic fixture plane -- never the real _workspaces/_workmeta.
  const fixtureRoot = tmp('wl-fixture-');
  const workspacesRoot = path.join(fixtureRoot, '_workspaces');
  const workmetaRoot = path.join(fixtureRoot, '_workmeta');
  const hiworksDir = path.join(fixtureRoot, 'events', 'hiworks');
  const gmailDir = path.join(fixtureRoot, 'events', 'gmail_sent');
  const receiptsDir = path.join(fixtureRoot, 'receipts');
  for (const dir of [workspacesRoot, workmetaRoot, hiworksDir, gmailDir, receiptsDir]) mkdirSync(dir, { recursive: true });
  const orgConfigPath = path.join(fixtureRoot, 'org_config.json');
  writeFileSync(orgConfigPath, JSON.stringify({ our_domain: 'example.com', organisations: {}, family: {} }));
  const { createHash } = await import('node:crypto');
  const orgConfigSha256 = `sha256:${createHash('sha256').update(readFileSync(orgConfigPath)).digest('hex')}`;

  const dailyRunner = path.join(outRoot, 'guild_hall', 'workspace_ledgers', 'ops', 'daily_refresh.mjs');
  const dryRun = spawnSync(process.execPath, [dailyRunner,
    '--workspaces-root', workspacesRoot, '--workmeta-root', workmetaRoot,
    '--org-config', orgConfigPath, '--org-config-sha256', orgConfigSha256,
    '--hiworks-events', hiworksDir, '--gmail-sent-events', gmailDir,
    '--receipts', receiptsDir, '--dry'], { encoding: 'utf8' });
  assert.equal(dryRun.status, 0, `daily runner --dry from the built lane failed: ${dryRun.stdout}\n${dryRun.stderr}`);
  const receipt = JSON.parse(dryRun.stdout);
  assert.equal(receipt.dry, true);
  assert.equal(receipt.status, 'ok');
});
