import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkIntakeStore } from '../src/work_intake_store.mjs';
import { evaluateWorkIntakeRun, compareWorkIntakeEvaluations } from '../src/work_intake_evaluation.mjs';
import { syntheticInput, syntheticResult, eventAttempt, START, END } from './work_intake_test_helpers.mjs';

function evaluationInput(run, expected = 'NEW') {
  return { partition: 'evaluation', case_set_ref: 'synthetic:independent-case-set',
    verdict_provenance: { kind: 'independent_synthetic_fixture', author_ref: 'synthetic:fixture-reviewer',
      producer_author_ref: 'synthetic:adapter-author', frozen_at: START, source_snapshot_sha256: run.snapshot_sha256,
      development_event_identities: [] }, cases: [{ case_id: 'synthetic:request-case', partition: 'evaluation',
      event_identity: eventAttempt(run).event_identity, expected_classification: expected,
      expected_project_ref: 'P01', verdict_ref: 'synthetic:predeclared-verdict' }], evaluated_at: END };
}

test('bounded adapter→durable record→core evaluation→restart preserves synthetic comparison and unknown utility', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'sf-intake-integration-'));
  const binding = { directory, repositoryRoot: fileURLToPath(new URL('../../../../', import.meta.url)), project_ref: 'P01' };
  let store = createWorkIntakeStore(binding);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const baseline = await syntheticResult(syntheticInput('run:baseline'));
  const missed = await syntheticResult(syntheticInput('run:comparison'), {
    classification: 'NO_ACTION', reason_code: 'NO_NEW_REQUEST', action_semantic_sha256: null,
  });
  assert.equal(baseline.snapshot_sha256, missed.snapshot_sha256);
  const reports = [baseline, missed].map((run) => evaluateWorkIntakeRun(run, evaluationInput(run)));
  assert.ok(reports.every((r) => r.status === 'EVALUATED'));
  assert.equal(store.commitEvaluation(reports[0]).status, 'HOLD');
  store.commitResult(baseline); store.commitResult(missed);
  for (const report of reports) assert.equal(store.commitEvaluation(report).status, 'RECORDED');
  const comparison = compareWorkIntakeEvaluations(reports);
  assert.equal(comparison.status, 'COMPARABLE'); assert.equal(comparison.measured_model_utility, false);
  assert.equal(comparison.variants[0].counts.attempts, 3); assert.equal(comparison.variants[1].counts.missed_actions, 1);
  assert.equal(comparison.variants[0].measurements.input_tokens.value, 'UNKNOWN');
  assert.equal(comparison.variants[0].stage_counts.used.yes, 0);
  store.close(); store = createWorkIntakeStore(binding);
  const restored = store.inspect(); assert.equal(restored.evaluations.length, 2);
  assert.equal(restored.evaluations[1].cursor_status, 'CONFLICT');
  assert.equal(restored.evaluations[1].decision_status, 'HOLD');
  assert.equal(restored.evaluations[1].report.counts.missed_actions, 1);
  assert.equal(store.commitEvaluation(reports[0]).status, 'REPLAY');
  assert.equal(restored.external_effects, 0);
});

test('failed read attempt remains comparable only against the same failed immutable snapshot', async () => {
  const partial = syntheticInput('run:partial'); partial.source_reads[0].status = 'partial';
  const failed = await syntheticResult(partial); const report = evaluateWorkIntakeRun(failed, evaluationInput(failed));
  assert.equal(report.status, 'EVALUATED'); assert.equal(report.report.counts.read_failures, 1);
  assert.equal(report.report.counts.event_attempts, 1); assert.equal(report.report.counts.excess_holds, 1);
  const successful = await syntheticResult();
  assert.equal(compareWorkIntakeEvaluations([report, evaluateWorkIntakeRun(successful, evaluationInput(successful))]).status, 'HOLD');
});
