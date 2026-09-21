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
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RULE_SCHEMA_VERSION } from '../src/classifier.mjs';

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
  assert.equal(spec.lane_id, 'workspace-ledgers-v2');
  assert.deepEqual(spec.tracked_paths, ['guild_hall/workspace_ledgers/']);
  assert.deepEqual(spec.tracked_excludes, ['guild_hall/workspace_ledgers/tests/']);
  assert.deepEqual(spec.carried_forward_prefixes, []);
  for (const entry of spec.entry_points) {
    assert.equal(existsSync(path.join(REPO_ROOT, entry)), true, `entry point missing in the working tree: ${entry}`);
  }
  // v2: the bot-facing wrapper and its skill folder are named entry points, and v1's
  // four are kept -- a bump that quietly dropped one would still pass every other
  // assertion here.
  for (const entry of [
    'guild_hall/workspace_ledgers/cli.mjs',
    'guild_hall/workspace_ledgers/ops/daily_refresh.mjs',
    'guild_hall/workspace_ledgers/ops/register-workspace-ledgers-task.ps1',
    'guild_hall/workspace_ledgers/ops/run-workspace-ledgers-hidden.vbs',
    'guild_hall/workspace_ledgers/ops/bot_triage.mjs',
    'guild_hall/workspace_ledgers/ops/bot-skill/SKILL.md',
    'guild_hall/workspace_ledgers/ops/bot-skill/install_skill.mjs',
  ]) {
    assert.ok(spec.entry_points.includes(entry), `lane spec lost an entry point: ${entry}`);
  }
});

test('the daily runner, the cli and the bot wrapper import inside a tree built from only what the lane spec carries', () => {
  const root = tmp('wl-lane-');
  const spec = buildLaneTree(SPEC_PATH, root);
  const dailyRunner = path.join(root, 'guild_hall', 'workspace_ledgers', 'ops', 'daily_refresh.mjs');
  const cli = path.join(root, 'guild_hall', 'workspace_ledgers', 'cli.mjs');
  const botTriage = path.join(root, 'guild_hall', 'workspace_ledgers', 'ops', 'bot_triage.mjs');
  const botSkillInstaller = path.join(root, 'guild_hall', 'workspace_ledgers', 'ops', 'bot-skill', 'install_skill.mjs');
  const botSkill = path.join(root, 'guild_hall', 'workspace_ledgers', 'ops', 'bot-skill', 'SKILL.md');
  assert.equal(existsSync(dailyRunner), true, 'lane did not carry ops/daily_refresh.mjs');
  assert.equal(existsSync(cli), true, 'lane did not carry cli.mjs');
  assert.equal(existsSync(botTriage), true, 'lane did not carry ops/bot_triage.mjs');
  assert.equal(existsSync(botSkillInstaller), true, 'lane did not carry ops/bot-skill/install_skill.mjs');
  assert.equal(existsSync(botSkill), true, 'lane did not carry ops/bot-skill/SKILL.md');
  // Excluded: the tests directory must never ship in a built lane.
  assert.equal(existsSync(path.join(root, 'guild_hall', 'workspace_ledgers', 'tests')), false,
    'lane unexpectedly carries its own tests directory');

  execFileSync(process.execPath, ['--check', dailyRunner], { stdio: 'ignore' });
  execFileSync(process.execPath, ['--check', cli], { stdio: 'ignore' });
  execFileSync(process.execPath, ['--check', botTriage], { stdio: 'ignore' });
  execFileSync(process.execPath, ['--check', botSkillInstaller], { stdio: 'ignore' });

  const probe = path.join(root, 'lane_probe.mjs');
  writeFileSync(probe, `import { DAILY_RECEIPT_SCHEMA, runDailyRefresh } from './guild_hall/workspace_ledgers/ops/daily_refresh.mjs';
import { refresh } from './guild_hall/workspace_ledgers/src/refresh.mjs';
import { refreshCommon } from './guild_hall/workspace_ledgers/src/common_refresh.mjs';
import { BOT_ALLOWED_LEVELS, BOT_TRIAGE_CONFIG_SCHEMA, runCli as runBotTriage } from './guild_hall/workspace_ledgers/ops/bot_triage.mjs';
import { renderInstalledSkill } from './guild_hall/workspace_ledgers/ops/bot-skill/install_skill.mjs';
if (typeof runDailyRefresh !== 'function' || typeof refresh !== 'function' || typeof refreshCommon !== 'function') process.exit(3);
if (DAILY_RECEIPT_SCHEMA !== 'soulforge.workspace_ledgers_daily_receipt.v1') process.exit(4);
if (typeof runBotTriage !== 'function' || typeof renderInstalledSkill !== 'function') process.exit(5);
if (BOT_TRIAGE_CONFIG_SCHEMA !== 'soulforge.workspace_ledgers_bot_triage_config.v1') process.exit(6);
if (BOT_ALLOWED_LEVELS.includes('include')) process.exit(7);
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
// built lane, then run the daily runner --dry AND the bot-facing wrapper
// (v2) FROM the built lane against a synthetic fixture plane under
// os.tmpdir() (never the real plane).
test('build_source_lane.mjs builds this lane from a clean commit, --verify passes, and both the daily runner --dry and the bot wrapper run from the built copy', async t => {
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

  // v2: the bot-facing wrapper, run FROM the built lane against the same synthetic
  // plane. One mail that lands nowhere, one `list` that finds it, one `decide` that
  // files it -- the whole surface a bot is ever given, proved to work out of a lane
  // rather than only out of the checkout.
  const botFolder = 'P00-001_예시과제';
  const botRuleDir = path.join(workspacesRoot, botFolder, '020_MGMT', '021_자동화설정_운영규칙');
  mkdirSync(botRuleDir, { recursive: true });
  writeFileSync(path.join(botRuleDir, 'mail_routing_rule.json'), `${JSON.stringify({
    schema_version: RULE_SCHEMA_VERSION, project_code: 'P00-001', folder_name: botFolder,
    rule_version: 'v1', status: 'draft', match_fields: ['subject'], case_insensitive_literals: true,
    exact: [{ label: 'P00-001', kind: 'literal', value: 'P00-001' }], hint: [], yields_to: null,
    conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  }, null, 2)}\n`);
  writeFileSync(path.join(hiworksDir, 'events.jsonl'), `${JSON.stringify({
    event_id: 'lane-u1', subject: '어디에도 안 들어가는 메일', from: 'someone@client.example',
    to: ['me@example.com'], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '내용', attachments: [],
  })}\n`);
  const readingTablePath = path.join(fixtureRoot, '판독_결정표.csv');
  const botReceiptsDir = path.join(fixtureRoot, 'bot-receipts');
  const botConfigPath = path.join(fixtureRoot, 'bot_triage.config.json');
  writeFileSync(botConfigPath, `${JSON.stringify({
    schema_version: 'soulforge.workspace_ledgers_bot_triage_config.v1',
    workspaces_root: workspacesRoot, org_config: orgConfigPath, org_config_sha256: orgConfigSha256,
    custody: { hiworks_events: [hiworksDir], gmail_sent_events: [gmailDir] },
    reading_table: readingTablePath, receipts_dir: botReceiptsDir,
    reader_label: '판독봇', human_actors: ['오너'], daily_decision_cap: 5, list_limit_cap: 10,
  }, null, 2)}\n`);
  const botConfigSha256 = `sha256:${createHash('sha256').update(readFileSync(botConfigPath)).digest('hex')}`;
  const botTriage = path.join(outRoot, 'guild_hall', 'workspace_ledgers', 'ops', 'bot_triage.mjs');
  const botPin = ['--config', botConfigPath, '--config-sha256', botConfigSha256];

  const botList = spawnSync(process.execPath, [botTriage, 'list', ...botPin], { encoding: 'utf8' });
  assert.equal(botList.status, 0, `bot_triage list from the built lane failed: ${botList.stdout}\n${botList.stderr}`);
  assert.match(botList.stdout, /lane-u1/u);

  const botDecide = spawnSync(process.execPath, [botTriage, 'decide', ...botPin, '--id', 'lane-u1',
    '--level', 'exclude', '--target', '과제미정', '--why', '과제를 특정할 단서가 없음'], { encoding: 'utf8' });
  assert.equal(botDecide.status, 0, `bot_triage decide from the built lane failed: ${botDecide.stdout}\n${botDecide.stderr}`);
  assert.equal(existsSync(readingTablePath), true, 'the built lane did not append a reading decision');
  assert.equal(readdirSync(botReceiptsDir).filter(name => name.startsWith('bot_triage-')).length, 2);

  // `include` is refused the same way out of a lane as out of the checkout.
  const botInclude = spawnSync(process.execPath, [botTriage, 'decide', ...botPin, '--id', 'lane-u1',
    '--level', 'include', '--target', 'P00-001', '--why', '확실함'], { encoding: 'utf8' });
  assert.equal(botInclude.status, 2, 'include must be refused from the built lane too');
  const receipt = JSON.parse(dryRun.stdout);
  assert.equal(receipt.dry, true);
  assert.equal(receipt.status, 'ok');
});
