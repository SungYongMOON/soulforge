import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { assessManufacturingReadiness } from '../evaluator/manufacturing_readiness.mjs';
import {
  buildManufacturingReadinessPublicSyntheticRequest,
  MANUFACTURING_READINESS_PUBLIC_SYNTHETIC_FIXTURE,
} from '../fixtures/manufacturing_readiness_public_synthetic.mjs';

test('public synthetic fixture retains ready, missing, unknown, conflict, and not-applicable evidence states', () => {
  const result = assessManufacturingReadiness(buildManufacturingReadinessPublicSyntheticRequest('hold'));
  assert.equal(result.assessment.overall_state, 'hold');
  assert.deepEqual(result.domain_result.counts, MANUFACTURING_READINESS_PUBLIC_SYNTHETIC_FIXTURE.hold_expected.counts);
  assert.equal(result.domain_result.results.find((row) => row.facet_id === 'bom').state, 'gap_missing');
  assert.equal(result.domain_result.results.find((row) => row.facet_id === 'processes').state, 'gap_unknown');
  assert.equal(result.domain_result.results.find((row) => row.facet_id === 'tooling').state, 'gap_conflict');
  assert.equal(result.domain_result.results.find((row) => row.facet_id === 'inspections').state, 'not_applicable');
});

test('zero-write runner emits a stable all-ready synthetic assessment and creates no files', () => {
  const runnerPath = fileURLToPath(new URL('../tools/manufacturing_readiness_runner.mjs', import.meta.url));
  const sandbox = mkdtempSync(join(tmpdir(), 'manufacturing-readiness-runner-'));
  try {
    const first = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    const second = spawnSync(process.execPath, [runnerPath], { cwd: sandbox, encoding: 'utf8', timeout: 10_000 });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stderr, '');
    assert.equal(second.stdout, first.stdout);
    assert.deepEqual(JSON.parse(first.stdout), assessManufacturingReadiness(buildManufacturingReadinessPublicSyntheticRequest('ready')));
    assert.deepEqual(readdirSync(sandbox), []);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
