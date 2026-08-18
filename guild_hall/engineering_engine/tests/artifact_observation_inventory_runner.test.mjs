// TDD: the walk is a caller, and a caller may not quietly replace evidence.
//
// The three observation modules are pure by contract. This runner is the one place that reads a
// disk and a clock, so what is checked here is exactly the boundary: what it skips, what it
// writes, and that a second run over one output folder refuses rather than overwrites.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RUNNER = fileURLToPath(new URL('../tools/artifact_observation_inventory_runner.mjs', import.meta.url));
const FIXTURE = JSON.parse(readFileSync(new URL(
  '../../../docs/architecture/workspace/examples/se_stage_rules/observation_candidates_synthetic_v0.json',
  import.meta.url,
), 'utf8'));

const TEMP_ROOTS = [];
test.after(() => {
  for (const root of TEMP_ROOTS) rmSync(root, { recursive: true, force: true });
});

function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'soulforge-observation-runner-'));
  TEMP_ROOTS.push(root);
  return root;
}

const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
};

/**
 * A synthetic project tree: one task output, one working file, one file in the scratch folder the
 * walk must skip, and one file under a trash holding area it must also skip.
 */
function syntheticProject() {
  const root = scratch();
  write(join(root, '120_CDR', '125_synthetic_hdd_F', '03_Out', 'synthetic_hdd_final.pdf'), 'synthetic-hdd-final');
  write(join(root, '120_CDR', '125_synthetic_hdd_F', '01_Work', 'synthetic_hdd_draft.docx'), 'synthetic-hdd-draft');
  write(join(root, '120_CDR', '125_synthetic_hdd_F', '00_Temp', 'synthetic_scratch.tmp'), 'scratch');
  write(join(root, '_trash_260818', 'synthetic_hdd_old.pdf'), 'old');
  write(join(root, 'node_modules', 'synthetic_package', 'index.js'), 'module');
  write(join(root, 'synthetic_readme.md'), 'readme');
  return root;
}

function variantPath() {
  const root = scratch();
  const path = join(root, 'compiled_variant.json');
  writeFileSync(path, JSON.stringify(FIXTURE.request.compiled_variants[0]), 'utf8');
  return path;
}

const run = (args) => spawnSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8' });

test('one run walks the project, writes six outputs, and skips what it declares it skips', () => {
  const projectRoot = syntheticProject();
  const out = join(scratch(), 'observation_candidates_run_01');
  const result = run([
    '--project-root', projectRoot,
    '--out', out,
    '--compiled-variant', variantPath(),
    '--known-at', '2026-08-18T00:00:00.000Z',
  ]);
  assert.equal(result.status, 0, result.stderr);

  for (const name of ['inventory.json', 'candidates.json', 'confirmation_sheet.md',
    'confirmation_sheet.json', 'artifact_observations_auto.json', 'receipt.json']) {
    assert.ok(existsSync(join(out, name)), name);
  }

  const inventory = JSON.parse(readFileSync(join(out, 'inventory.json'), 'utf8'));
  const refs = inventory.rows.map((row) => row.file_ref);
  assert.deepEqual([...refs].sort(), [
    '120_CDR/125_synthetic_hdd_F/01_Work/synthetic_hdd_draft.docx',
    '120_CDR/125_synthetic_hdd_F/03_Out/synthetic_hdd_final.pdf',
    'synthetic_readme.md',
  ]);
  for (const row of inventory.rows) {
    assert.match(row.sha256, /^[0-9a-f]{64}$/u);
    assert.match(row.mtime_iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  }
  const hint = inventory.rows.find((row) => row.file_ref.endsWith('synthetic_hdd_final.pdf'));
  assert.equal(hint.gate_hint, '120_CDR');
  assert.equal(hint.task_folder_hint, '125_synthetic_hdd_F');

  const candidates = JSON.parse(readFileSync(join(out, 'candidates.json'), 'utf8'));
  const autoConfirmed = candidates.candidates.filter((row) => row.auto_confirmed);
  assert.equal(autoConfirmed.length, 1);
  assert.equal(autoConfirmed[0].artifact_type_id, 'hdd');
  assert.equal(autoConfirmed[0].stage_code, '120_CDR');
  assert.equal(autoConfirmed[0].maturity, 'final');

  const observations = JSON.parse(readFileSync(join(out, 'artifact_observations_auto.json'), 'utf8'));
  assert.equal(observations.artifact_observations.length, 1);
  assert.equal(observations.artifact_observations[0].presence_state, 'present');

  const sheet = readFileSync(join(out, 'confirmation_sheet.md'), 'utf8');
  assert.match(sheet, /관측 후보 확인표/u);

  const receipt = JSON.parse(readFileSync(join(out, 'receipt.json'), 'utf8'));
  assert.equal(receipt.walk.files_inventoried, 3);
  assert.ok(receipt.walk.skipped.directories >= 3);
  // The receipt names folders, never absolute paths.
  assert.equal(JSON.stringify(receipt).includes(projectRoot.split('\\').join('/')), false);
  for (const value of Object.values(receipt.candidates.effects)) assert.equal(value, 0);
});

test('a second run over one output folder refuses rather than overwrites', () => {
  const projectRoot = syntheticProject();
  const out = join(scratch(), 'observation_candidates_run_01');
  const args = [
    '--project-root', projectRoot,
    '--out', out,
    '--compiled-variant', variantPath(),
    '--known-at', '2026-08-18T00:00:00.000Z',
  ];
  assert.equal(run(args).status, 0);
  const second = run(args);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /refusing to overwrite/u);
});

test('the same project and instant produce the same bytes twice', () => {
  const projectRoot = syntheticProject();
  const scratchRoot = scratch();
  const args = (name) => [
    '--project-root', projectRoot,
    '--out', join(scratchRoot, name),
    '--compiled-variant', variantPath(),
    '--known-at', '2026-08-18T00:00:00.000Z',
  ];
  assert.equal(run(args('run_a')).status, 0);
  assert.equal(run(args('run_b')).status, 0);
  for (const name of ['candidates.json', 'confirmation_sheet.md', 'artifact_observations_auto.json']) {
    assert.equal(readFileSync(join(scratchRoot, 'run_b', name), 'utf8'),
      readFileSync(join(scratchRoot, 'run_a', name), 'utf8'), name);
  }
});

test('an include glob narrows the walk without changing how a file is read', () => {
  const projectRoot = syntheticProject();
  const out = join(scratch(), 'observation_candidates_run_globbed');
  const result = run([
    '--project-root', projectRoot,
    '--out', out,
    '--compiled-variant', variantPath(),
    '--include-globs', '120_CDR/**/03_Out/**',
    '--known-at', '2026-08-18T00:00:00.000Z',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(readFileSync(join(out, 'inventory.json'), 'utf8'));
  assert.deepEqual(inventory.rows.map((row) => row.file_ref),
    ['120_CDR/125_synthetic_hdd_F/03_Out/synthetic_hdd_final.pdf']);
});

test('a missing required argument is refused', () => {
  const result = run(['--out', join(scratch(), 'nowhere')]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--project-root is required/u);
});
