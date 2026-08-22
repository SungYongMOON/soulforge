import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createObservationStore,
  observeRun,
  recordResultReceipt,
  registerAgent,
} from './agent_observation.mjs';

import {
  BINDING_COVERAGE_VALUES,
  BOARD_HEALTH_HOLD_CODES,
  RESULT_GATE_HEALTH_VALUES,
  projectBoardHealth,
} from './board_health_projection.mjs';

const agentInput = (over = {}) => ({
  agent_id: 'agent.health.systems-engineering.v1',
  agent_kind: 'project_isolated_functional',
  functional_role: 'systems_engineering',
  project_id: 'proj-health',
  provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-health-0001' }],
  authority_scope: { allowed_projects: ['proj-health'], allowed_actions: ['read'] },
  memory_class: 'cache_only',
  registered_at: '2026-08-22T00:00:00.000Z',
  ...over,
});

const runInput = (over = {}) => ({
  run_id: 'run-health-0001',
  parent_run_id: null,
  agent_id: 'agent.health.systems-engineering.v1',
  task_id: 'task-health-0001',
  project_id: 'proj-health',
  work_unit_id: 'wu-health-0001',
  lifecycle: 'terminal',
  provider: 'codex',
  model_id: 'model-health-high',
  reasoning_effort: 'high',
  authority: 'read_only',
  started_at: '2026-08-22T01:00:00.000Z',
  heartbeat_at: '2026-08-22T01:05:00.000Z',
  ended_at: '2026-08-22T01:10:00.000Z',
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
  ...over,
});

const OBSERVED = {
  result_state: 'result_observed',
  side_effect_evidence_refs: [{ ref_kind: 'artifact', ref_value: 'artifact://health/workbook-0001' }],
};

const receiptInput = (over = {}) => ({
  receipt_id: 'rcpt-health-0001',
  run_id: 'run-health-0001',
  agent_id: 'agent.health.systems-engineering.v1',
  receipt_kind: 'delivery',
  producer_evidence_kind: 'producer_observed',
  refs: [{ ref_kind: 'artifact', ref_value: 'artifact://health/workbook-0001' }],
  observed_at: '2026-08-22T01:11:00.000Z',
  ...over,
});

const storeWith = ({ agent = {}, run = null, receipt = null } = {}) => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput(agent)).status, 'REGISTERED');
  if (run !== null) assert.equal(observeRun(store, runInput(run)).status, 'OBSERVED');
  if (receipt !== null) assert.equal(recordResultReceipt(store, receiptInput(receipt)).status, 'RECORDED');
  return store;
};

test('the projected vocabulary is the Board\'s own, not a parallel one', () => {
  // These sets are copied from live-thread-projection.mjs. If that file's sets change, this
  // module is publishing values the Board will reject, and this assertion is where it shows.
  const boardSource = readFileSync(
    new URL('../../ui-workspace/apps/team-ops-board/src/core/live-thread-projection.mjs', import.meta.url),
    'utf8',
  );
  for (const value of RESULT_GATE_HEALTH_VALUES) {
    assert.ok(
      boardSource.includes(`"${value}"`),
      `result_gate_health value ${value} is not present in the Board projection`,
    );
  }
  assert.ok(boardSource.includes('const RESULT_GATE_HEALTH = new Set(["available", "missing", "invalid", "disabled"])'));
  assert.ok(boardSource.includes('["exact", "hold"].includes(value.binding_coverage)'));
  assert.deepEqual([...BINDING_COVERAGE_VALUES], ['exact', 'hold']);
});

test('an empty store reports the conservative value, never a vacuous pass', () => {
  const empty = projectBoardHealth(createObservationStore());
  assert.equal(empty.status, 'PROJECTED');
  assert.equal(empty.scope.result_gate_health, 'missing');
  assert.equal(empty.scope.binding_coverage, 'hold');
  assert.equal(empty.evidence.run_count, 0);

  // An agent with no runs is still not coverage.
  const agentOnly = projectBoardHealth(storeWith());
  assert.equal(agentOnly.scope.binding_coverage, 'hold');
  assert.equal(agentOnly.evidence.agent_count, 1);
  assert.equal(agentOnly.evidence.run_count, 0);
});

test('a run claiming an observed result without a receipt makes the gate invalid', () => {
  const claimed = projectBoardHealth(storeWith({ run: OBSERVED }));
  assert.equal(claimed.scope.result_gate_health, 'invalid');
  assert.equal(claimed.evidence.runs_claiming_result, 1);
  assert.equal(claimed.evidence.runs_claiming_result_with_evidence, 0);

  const receipted = projectBoardHealth(storeWith({ run: OBSERVED, receipt: {} }));
  assert.equal(receipted.scope.result_gate_health, 'available');
  assert.equal(receipted.evidence.runs_claiming_result_with_evidence, 1);
});

test('a receipt that is not result or delivery evidence does not satisfy the gate', () => {
  // An approval or a validation receipt says something happened around the run, not that a result
  // was produced. Counting them would let a run claim an observed result on unrelated paperwork.
  for (const kind of ['approval', 'validation', 'artifact', 'recovery']) {
    const store = storeWith({ run: OBSERVED, receipt: { receipt_kind: kind } });
    assert.equal(projectBoardHealth(store).scope.result_gate_health, 'invalid', kind);
  }
  for (const kind of ['result', 'delivery']) {
    const store = storeWith({ run: OBSERVED, receipt: { receipt_kind: kind } });
    assert.equal(projectBoardHealth(store).scope.result_gate_health, 'available', kind);
  }
});

test('a run on a provider its agent has no identity for is not exact coverage', () => {
  // The store already refuses an unregistered agent and a project mismatch, so those two alone
  // would make this measurement vacuous. An agent registered for one provider running on another
  // is legal, and that run cannot be traced to any provider-side thread.
  const bound = projectBoardHealth(storeWith({ run: {} }));
  assert.equal(bound.scope.binding_coverage, 'exact');
  assert.equal(bound.evidence.unbound_run_count, 0);

  const drifted = projectBoardHealth(storeWith({
    agent: { provider_identities: [{ provider: 'antigravity', id_kind: 'thread_id', id_value: 'th-other-0001' }] },
    run: {},
  }));
  assert.equal(drifted.scope.binding_coverage, 'hold');
  assert.equal(drifted.evidence.exactly_bound_run_count, 0);
  assert.equal(drifted.evidence.unbound_run_count, 1);
});

test('one unbound run among several is enough to hold the whole coverage', () => {
  const store = storeWith({ run: {} });
  assert.equal(registerAgent(store, agentInput({
    agent_id: 'agent.health.spreadsheet.v1',
    functional_role: 'spreadsheet',
    provider_identities: [{ provider: 'antigravity', id_kind: 'thread_id', id_value: 'th-health-0002' }],
  })).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput({
    run_id: 'run-health-0002',
    agent_id: 'agent.health.spreadsheet.v1',
    task_id: 'task-health-0002',
    work_unit_id: 'wu-health-0002',
  })).status, 'OBSERVED');

  const result = projectBoardHealth(store);
  assert.equal(result.evidence.run_count, 2);
  assert.equal(result.evidence.exactly_bound_run_count, 1);
  assert.equal(result.scope.binding_coverage, 'hold', 'partial coverage is not exact coverage');
});

test('disabled is never reported, because this store cannot observe it', () => {
  // The live registry's `disabled` flag and TEAM_OPS_BOARD_RESULT_GATES_DISABLED are the only two
  // things that disable the gate, and neither is visible from an in-memory store. Emitting
  // `disabled` from here would be a guess presented as an observation.
  const seen = new Set();
  for (const store of [
    createObservationStore(),
    storeWith(),
    storeWith({ run: {} }),
    storeWith({ run: OBSERVED }),
    storeWith({ run: OBSERVED, receipt: {} }),
  ]) {
    seen.add(projectBoardHealth(store).scope.result_gate_health);
  }
  assert.equal(seen.has('disabled'), false);
  assert.deepEqual([...seen].sort(), ['available', 'invalid', 'missing']);

  const text = readFileSync(new URL('./board_health_projection.mjs', import.meta.url), 'utf8');
  assert.equal(text.includes("= 'disabled'"), false, 'the module must never assign disabled');
});

test('a foreign handle holds rather than reporting a healthy empty scope', () => {
  const foreign = Object.freeze({ kind: 'soulforge.agent_observation.store.v1' });
  const result = projectBoardHealth(foreign);
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, BOARD_HEALTH_HOLD_CODES.UNKNOWN_STORE);
});

test('the projection opens no external effect surface and reads no clock', () => {
  const text = readFileSync(new URL('./board_health_projection.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'fetch(', 'execFile', 'spawn(', 'readFileSync', 'process.env']) {
    assert.equal(text.includes(forbidden), false, `${forbidden} must not appear`);
  }
  assert.equal(text.includes('Date.now'), false);
  assert.equal(text.includes('Math.random'), false);
});
