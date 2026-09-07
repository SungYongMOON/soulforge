import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorldSlotState, projectWorldCoverage } from './forge-world-state.mjs';
const at = '2026-09-07T00:00:00Z';
const nowMs = Date.parse(at);
const slot = (coverage_state, coverage_reason) => ({project_code: 'SYNTHETIC', stage_code: '120_CDR',
  artifact_family_id: 'test_report', source_observed_at: at, coverage_state, coverage_reason, observation_count: 1});

test('six coverage meanings remain six text and color states', () => {
  const cases = [
    ['satisfied', 'satisfied', 'lit'], ['gap_missing', 'absence_confirmed', 'missing'],
    ['gap_unknown', 'observation_inconclusive', 'warm'], ['gap_unknown', 'needs_undeclared', 'fog'],
    ['gap_conflict', 'observation_disagreement', 'conflict'], ['gap_unknown', 'coverage_not_attempted', 'fog'],
  ];
  const labels = new Set();
  for (const [state, reason, expected] of cases) {
    const result = deriveWorldSlotState(slot(state, reason), {nowMs, observedAt: at});
    assert.equal(result.state, expected); labels.add(result.label);
    assert.equal(result.acceptance_label, '수락 미확인');
  }
  assert.equal(labels.size, 6);
  assert.equal(deriveWorldSlotState(slot('gap_unknown','needs_undeclared'),{nowMs,observedAt:at}).border,'dashed');
  assert.equal(deriveWorldSlotState(slot('not_applicable','not_applicable'),{nowMs,observedAt:at}).state,'planned');
});

test('artifact reference defects remain fog with specific source reasons', () => {
  for(const reason of ['artifact_ref_floating','artifact_ref_malformed','artifact_bytes_unresolvable']){
    const result=deriveWorldSlotState(slot('gap_unknown',reason),{nowMs,observedAt:at});
    assert.equal(result.state,'fog');assert.equal(result.reason,reason);assert.notEqual(result.label,'미확인');
  }
});

test('stale source cannot be refreshed by a new generation/read timestamp', () => {
  const old = {...slot('satisfied'), source_observed_at: '2026-08-18T00:00:00Z'};
  assert.equal(deriveWorldSlotState(old, {nowMs, observedAt: at}).reason, 'source_stale');
  assert.equal(deriveWorldSlotState(slot('satisfied'), {nowMs, observedAt: '2026-08-18T00:00:00Z'}).reason, 'source_stale');
  assert.equal(deriveWorldSlotState(slot('satisfied'), {nowMs: nowMs - 1, observedAt: at}).state, 'fog');
  assert.equal(deriveWorldSlotState(slot('satisfied'), {observedAt: at}).state, 'fog');
});

test('sample opt-in is explicit; qualification excludes stale and inconclusive observations', () => {
  const document = {schema_version: 'soulforge.forge_world.coverage.v1', project_code: 'SYNTHETIC',
    source_kind: 'sample', observed_at: at, slots: [slot('satisfied', 'satisfied')]};
  const options = {projectCode: 'SYNTHETIC', nowMs};
  assert.equal(projectWorldCoverage(document, options).slots.length, 0);
  const sample = projectWorldCoverage(document, {...options, includeSamples: true});
  assert.equal(sample.sample_slots, 1); assert.equal(sample.observed_slots, 0);
  document.source_kind = 'observed';
  assert.equal(projectWorldCoverage(document, options).qualifying_observed_slots, 1);
  document.slots[0].source_observed_at = '2026-08-18T00:00:00Z';
  assert.equal(projectWorldCoverage(document, options).qualifying_observed_slots, 0);
});

test('foreign or duplicate slots reject entire project projection', () => {
  const document = {schema_version: 'soulforge.forge_world.coverage.v1', project_code: 'SYNTHETIC',
    source_kind: 'observed', observed_at: at, slots: [slot('satisfied')]};
  const options = {projectCode: 'SYNTHETIC', nowMs};
  document.slots.push({...document.slots[0]});
  assert.equal(projectWorldCoverage(document, options).reason, 'source_scope_conflict');
  document.slots.pop(); document.slots[0].project_code = 'OTHER';
  assert.equal(projectWorldCoverage(document, options).reason, 'source_scope_conflict');
});
