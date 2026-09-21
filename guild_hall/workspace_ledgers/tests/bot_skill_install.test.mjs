// `ops/bot-skill/install_skill.mjs`: placeholder substitution, determinism, and the
// `--check` drift mode. Everything runs against os.tmpdir(); nothing is installed
// anywhere a bot would actually read from.
//
// Linux/Windows: paths are compared through the installer's own `shellPath` (which is
// what it writes into the installed copy), so no assertion depends on path.sep.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  INSTALLED_FILE_NAME, SKILL_INSTALL_SCHEMA, renderInstalledSkill, runCli, shellPath,
} from '../ops/bot-skill/install_skill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRACKED_SKILL = path.join(HERE, '..', 'ops', 'bot-skill', INSTALLED_FILE_NAME);
const CONFIG_SHA = `sha256:${'a'.repeat(64)}`;

function capture(argv) {
  const out = [];
  const err = [];
  const code = runCli(argv, {
    stdout: { write: text => out.push(text) },
    stderr: { write: text => err.push(text) },
    at: '2026-09-22T00:00:00.000Z',
  });
  return { code, stdout: out.join(''), stderr: err.join('') };
}

function makeArgs(root, { outDir = path.join(root, 'installed') } = {}) {
  return {
    outDir,
    lane: path.join(root, 'lane'),
    config: path.join(root, 'bot_triage.config.json'),
    guideline: path.join(root, 'workspaces', 'common', '메일_내용판독_분류지침.md'),
    argv(extra = []) {
      return ['--lane', this.lane, '--config', this.config, '--config-sha256', CONFIG_SHA,
        '--guideline', this.guideline, '--out', outDir, ...extra];
    },
  };
}

test('the tracked SKILL.md still carries every placeholder the installer substitutes', () => {
  const source = readFileSync(TRACKED_SKILL, 'utf8');
  for (const needle of ["'<lane>/", "--config '<config>'", "--config-sha256 '<config sha256>'", "'<guideline>'"]) {
    assert.ok(source.includes(needle), `tracked SKILL.md lost the placeholder: ${needle}`);
  }
  // And it must not carry a host-local path of its own.
  assert.equal(/[A-Za-z]:[\\/]/u.test(source), false, 'tracked SKILL.md must not name a host path');
});

test('install: every placeholder is substituted, none is left, and the result is deterministic', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wl-bot-skill-'));
  try {
    const args = makeArgs(root);
    const first = capture(args.argv());
    assert.equal(first.code, 0, first.stderr);
    const receipt = JSON.parse(first.stdout);
    assert.equal(receipt.schema_version, SKILL_INSTALL_SCHEMA);
    assert.equal(receipt.mode, 'install');
    assert.equal(receipt.existed, false);
    assert.match(receipt.sha256_after, /^sha256:[0-9a-f]{64}$/u);

    const installed = readFileSync(path.join(args.outDir, INSTALLED_FILE_NAME), 'utf8');
    assert.equal(`sha256:${createHash('sha256').update(Buffer.from(installed, 'utf8')).digest('hex')}`, receipt.sha256_after);
    assert.ok(installed.includes(`node '${shellPath(args.lane)}/guild_hall/workspace_ledgers/ops/bot_triage.mjs'`));
    assert.ok(installed.includes(`--config '${shellPath(args.config)}'`));
    assert.ok(installed.includes(`--config-sha256 '${CONFIG_SHA}'`));
    assert.ok(installed.includes(`'${shellPath(args.guideline)}'`));
    for (const needle of ["'<lane>/", "--config '<config>'", "--config-sha256 '<config sha256>'", "'<guideline>'"]) {
      assert.equal(installed.includes(needle), false, `placeholder left behind: ${needle}`);
    }
    // The explaining sentence keeps the bare placeholder names, on purpose.
    assert.ok(installed.includes('`<lane>`'));

    // Deterministic: same inputs, same bytes (no timestamp inside the file).
    const second = capture(args.argv());
    assert.equal(second.code, 0);
    assert.equal(JSON.parse(second.stdout).sha256_after, receipt.sha256_after);
    assert.equal(JSON.parse(second.stdout).existed, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--dry-run prints the digest it would write and writes nothing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wl-bot-skill-'));
  try {
    const args = makeArgs(root);
    const result = capture(args.argv(['--dry-run']));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).dry_run, true);
    assert.equal(existsSync(path.join(args.outDir, INSTALLED_FILE_NAME)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--check: 0 when the installed copy matches, 3 when it drifted or is absent', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wl-bot-skill-'));
  try {
    const args = makeArgs(root);
    const absent = capture(args.argv(['--check']));
    assert.equal(absent.code, 3);
    assert.equal(JSON.parse(absent.stdout).installed_present, false);

    assert.equal(capture(args.argv()).code, 0);
    const matched = capture(args.argv(['--check']));
    assert.equal(matched.code, 0, matched.stderr);
    const matchedReceipt = JSON.parse(matched.stdout);
    assert.equal(matchedReceipt.match, true);
    assert.equal(matchedReceipt.mode, 'check');
    assert.equal(matchedReceipt.actual_sha256, matchedReceipt.expected_sha256);

    // Someone edited the installed copy.
    const target = path.join(args.outDir, INSTALLED_FILE_NAME);
    writeFileSync(target, `${readFileSync(target, 'utf8')}\n<!-- local edit -->\n`);
    const drifted = capture(args.argv(['--check']));
    assert.equal(drifted.code, 3);
    assert.equal(JSON.parse(drifted.stdout).match, false);

    // Different arguments render a different file, so --check catches that too.
    assert.equal(capture(args.argv()).code, 0);
    const otherLane = capture(['--lane', path.join(root, 'other-lane'), '--config', args.config,
      '--config-sha256', CONFIG_SHA, '--guideline', args.guideline, '--out', args.outDir, '--check']);
    assert.equal(otherLane.code, 3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--receipt writes the receipt where asked, and only for a real install', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wl-bot-skill-'));
  try {
    const args = makeArgs(root);
    const receiptPath = path.join(root, 'receipts', 'install.json');
    assert.equal(capture(args.argv(['--receipt', receiptPath])).code, 0);
    assert.equal(JSON.parse(readFileSync(receiptPath, 'utf8')).mode, 'install');

    const dryReceipt = path.join(root, 'receipts', 'dry.json');
    assert.equal(capture(args.argv(['--receipt', dryReceipt, '--dry-run'])).code, 0);
    assert.equal(existsSync(dryReceipt), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing arguments, a broken template and a bad digest shape all exit 2', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wl-bot-skill-'));
  try {
    const args = makeArgs(root);
    assert.equal(capture(['--lane', args.lane]).code, 2);

    const broken = path.join(root, 'broken', INSTALLED_FILE_NAME);
    mkdirSync(path.dirname(broken), { recursive: true });
    writeFileSync(broken, readFileSync(TRACKED_SKILL, 'utf8').replaceAll("'<guideline>'", '(지침)'));
    const brokenRun = capture(args.argv(['--source', broken]));
    assert.equal(brokenRun.code, 2);
    assert.match(brokenRun.stderr, /skill_template_placeholder_missing/u);

    const badPin = capture(['--lane', args.lane, '--config', args.config, '--config-sha256', 'not-a-digest',
      '--guideline', args.guideline, '--out', args.outDir]);
    assert.equal(badPin.code, 2);
    assert.match(badPin.stderr, /skill_install_config_sha256_invalid/u);

    const missingSource = capture(args.argv(['--source', path.join(root, 'nope.md')]));
    assert.equal(missingSource.code, 2);
    assert.match(missingSource.stderr, /skill_install_source_unreadable/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('renderInstalledSkill refuses a template whose placeholder would survive substitution', () => {
  // A template that mentions the needle twice, once inside a code fence the
  // substitution does not reach, is exactly the "left behind" case.
  const source = readFileSync(TRACKED_SKILL, 'utf8');
  assert.throws(() => renderInstalledSkill({
    source: source.replaceAll("'<lane>/", 'LANE/'), lane: '/lane', configPath: '/config.json',
    configSha256: CONFIG_SHA, guideline: '/guideline.md', sourceSha256: CONFIG_SHA,
  }), error => error.code === 'skill_template_placeholder_missing');
});
