import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SE_TESTS = path.resolve(HERE, '..', '..', 'engines', 'systems_engineering', 'tests');

const PUBLIC_SUITES = [
  ['lane_1a_conformance.mjs', []],
  ['lane_1b_conformance.mjs', []],
  ['lane_1c_conformance.mjs', []],
  ['lane_1d_conformance.mjs', []],
  ['lane_1e_conformance.mjs', []],
  ['minting_conformance.mjs', []],
  ['runtime_observation_conformance.mjs', []],
  ['end_to_end_engine_run.mjs', []],
  ['phase_2_oracle_conformance.mjs', []],
  ['phase_3_context_receipts.mjs', []],
  ['manifest_blob_integrity.mjs', []],
];

test('Phase 1 Public Integration: all 11 standalone conformance suites PASS on canonical code', () => {
  for (const [suite, args] of PUBLIC_SUITES) {
    const fullPath = path.join(SE_TESTS, suite);
    const r = spawnSync(process.execPath, [fullPath, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, `Suite ${suite} must exit with code 0. stderr: ${r.stderr}`);
    let parsed = null;
    try { parsed = JSON.parse(r.stdout); } catch (e) {}
    assert.equal(parsed?.result, 'PASS', `Suite ${suite} must report result: PASS`);
    assert.equal(parsed?.failure_count ?? 0, 0, `Suite ${suite} must have 0 failures`);
  }
});

test('Phase 1 Public Integration: output contract conformance PASS with scratch dir', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'output_contract_scratch_'));
  try {
    const fullPath = path.join(SE_TESTS, 'output_contract_conformance.mjs');
    const r = spawnSync(process.execPath, [fullPath, '--scratch', tempDir], { encoding: 'utf8' });
    assert.equal(r.status, 0, `output_contract_conformance.mjs must exit with code 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.result, 'PASS');
    assert.equal(parsed.failure_count, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
