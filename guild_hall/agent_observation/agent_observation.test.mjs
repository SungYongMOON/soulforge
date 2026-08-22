import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COMPOSITE_SEPARATOR, SAFE_ID } from './guard_primitives.mjs';

import {
  AGENT_RECORD_SCHEMA,
  RUN_RECORD_SCHEMA,
  USAGE_EVENT_SCHEMA,
  RESULT_RECEIPT_SCHEMA,
  RECORD_KEY_ALLOWLIST,
  OBSERVATION_HOLD_CODES,
  auditRecordPrivacy,
  createObservationStore,
  registerAgent,
  observeRun,
  recordDirectUsage,
  recordResultReceipt,
  projectUsageRollup,
  projectStoreCounts,
  listAgents,
  listRuns,
  listUsageEvents,
  listReceipts,
} from './agent_observation.mjs';

// Local absolute paths are built from parts so the repository never stores a literal one, while
// the guard still sees the exact shape it must reject.
const fileUri = (...parts) => ['file:', '', '', ...parts].join('/');
const posixPath = (...parts) => ['', ...parts].join('/');

const C = OBSERVATION_HOLD_CODES;
const AT = '2026-08-22T01:00:00.000Z';
const LATER = '2026-08-22T01:30:00.000Z';
const EARLIER = '2026-08-22T00:30:00.000Z';

const AGENT_ID = 'agent.kvds.spreadsheet_requester.v1';
const CRAFTSMAN_ID = 'agent.kvds.spreadsheet_craftsman.v1';

const agentInput = (over = {}) => ({
  agent_id: AGENT_ID,
  agent_kind: 'project_isolated_functional',
  functional_role: 'systems_engineering',
  project_id: 'proj-synthetic-alpha',
  provider_identities: [
    { provider: 'codex', id_kind: 'thread_id', id_value: 'th-synthetic-0001' },
    { provider: 'codex', id_kind: 'session_id', id_value: 'se-synthetic-0001' },
    { provider: 'hermes', id_kind: 'session_id', id_value: 'hs-synthetic-0001' },
  ],
  authority_scope: { allowed_projects: ['proj-synthetic-alpha'], allowed_actions: ['request_spreadsheet_job'] },
  memory_class: 'cache_only',
  registered_at: AT,
  ...over,
});

const runInput = (over = {}) => ({
  run_id: 'run-synthetic-0001',
  parent_run_id: null,
  agent_id: AGENT_ID,
  task_id: 'task-synthetic-0001',
  project_id: 'proj-synthetic-alpha',
  work_unit_id: 'wu-synthetic-0001',
  lifecycle: 'started',
  provider: 'codex',
  model_id: 'model-synthetic-a',
  reasoning_effort: 'medium',
  authority: 'read_only',
  started_at: AT,
  heartbeat_at: AT,
  ended_at: null,
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
  ...over,
});

const usageInput = (over = {}) => ({
  event_id: 'usage-synthetic-0001',
  run_id: 'run-synthetic-0001',
  agent_id: AGENT_ID,
  provider: 'codex',
  model_id: 'model-synthetic-a',
  attribution_kind: 'direct',
  tokens: { input: 1200, cached_input: 400, cache_write_input: 100, output: 300, reasoning_output: 120 },
  cost_basis: 'token_proxy',
  cost_evidence_refs: [],
  observed_at: AT,
  ...over,
});

const receiptInput = (over = {}) => ({
  receipt_id: 'rcpt-synthetic-0001',
  run_id: 'run-synthetic-0001',
  agent_id: AGENT_ID,
  receipt_kind: 'result',
  producer_evidence_kind: 'producer_observed',
  refs: [{ ref_kind: 'artifact', ref_value: 'artifact://synthetic/workbook-0001' }],
  observed_at: AT,
  ...over,
});

const seeded = () => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput()).status, 'OBSERVED');
  return store;
};

const craftsmanAgentInput = () => agentInput({
  agent_id: CRAFTSMAN_ID,
  agent_kind: 'tool_specialist_craftsman',
  functional_role: 'spreadsheet',
  provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-synthetic-0002' }],
  authority_scope: { allowed_projects: ['proj-synthetic-alpha'], allowed_actions: ['produce_workbook'] },
});

// ---------------------------------------------------------------- schema and store encapsulation

test('schema versions are pinned and provider-neutral', () => {
  assert.equal(AGENT_RECORD_SCHEMA, 'soulforge.agent_observation.agent_record.v1');
  assert.equal(RUN_RECORD_SCHEMA, 'soulforge.agent_observation.run_record.v1');
  assert.equal(USAGE_EVENT_SCHEMA, 'soulforge.agent_observation.usage_event.v1');
  assert.equal(RESULT_RECEIPT_SCHEMA, 'soulforge.agent_observation.result_receipt.v1');
});

test('the append-only ledger is not reachable from the store handle', () => {
  const store = seeded();
  assert.deepEqual(Object.keys(store), ['kind']);
  assert.equal(store.usage, undefined);
  assert.equal(store.agents, undefined);
  assert.equal(Object.isFrozen(store), true);
  assert.equal(projectStoreCounts(store).runs, 1);
});

test('an unrecognised store handle holds instead of throwing', () => {
  const foreign = Object.freeze({ kind: 'soulforge.agent_observation.store.v1' });
  assert.equal(registerAgent(foreign, agentInput()).hold_code, C.UNKNOWN_STORE);
  assert.equal(observeRun(foreign, runInput()).hold_code, C.UNKNOWN_STORE);
  assert.equal(recordDirectUsage(foreign, usageInput()).hold_code, C.UNKNOWN_STORE);
  assert.equal(recordResultReceipt(foreign, receiptInput()).hold_code, C.UNKNOWN_STORE);
  assert.equal(projectStoreCounts(foreign).hold_code, C.UNKNOWN_STORE);
});

test('stored records are deeply immutable, so authority and evidence cannot be widened after the write', () => {
  const store = seeded();
  const agent = listAgents(store)[0];
  assert.throws(() => agent.authority_scope.allowed_projects.push('proj-other'), TypeError);
  assert.throws(() => { agent.provider_identities[0].id_value = 'th-forged'; }, TypeError);
  assert.deepEqual(listAgents(store)[0].authority_scope.allowed_projects, ['proj-synthetic-alpha']);
  assert.equal(listAgents(store)[0].provider_identities[0].id_value, 'th-synthetic-0001');

  const run = listRuns(store)[0];
  assert.throws(() => run.side_effect_evidence_refs.push({ ref_kind: 'delivery', ref_value: 'artifact://forged' }), TypeError);
  assert.deepEqual(listRuns(store)[0].side_effect_evidence_refs, []);

  assert.equal(recordResultReceipt(store, receiptInput()).status, 'RECORDED');
  const receipt = listReceipts(store)[0];
  assert.throws(() => { receipt.refs[0].ref_value = 'artifact://forged'; }, TypeError);
  assert.equal(listReceipts(store)[0].refs[0].ref_value, 'artifact://synthetic/workbook-0001');
});

// ---------------------------------------------------------------------------- agent registry

test('registry stores exactly one durable agent and preserves the provider crosswalk', () => {
  const store = createObservationStore();
  const result = registerAgent(store, agentInput());
  assert.equal(result.status, 'REGISTERED');
  assert.equal(result.agent_id, AGENT_ID);
  assert.equal(projectStoreCounts(store).agents, 1);

  const crosswalk = result.record.provider_identities;
  assert.equal(crosswalk.length, 3);
  const slot = (provider, kind) => crosswalk.find((r) => r.provider === provider && r.id_kind === kind)?.id_value;
  assert.equal(slot('codex', 'thread_id'), 'th-synthetic-0001');
  assert.equal(slot('codex', 'session_id'), 'se-synthetic-0001');
  assert.equal(slot('hermes', 'session_id'), 'hs-synthetic-0001');
});

test('a second provider id of the same kind never overwrites the first slot', () => {
  const store = createObservationStore();
  const result = registerAgent(store, agentInput({
    provider_identities: [
      { provider: 'codex', id_kind: 'thread_id', id_value: 'th-synthetic-0001' },
      { provider: 'codex', id_kind: 'thread_id', id_value: 'th-synthetic-0002' },
    ],
  }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.PROVIDER_IDENTITY_SLOT_CONFLICT);
  assert.equal(projectStoreCounts(store).agents, 0);
});

test('the same provider identity cannot be bound to two Soulforge agents', () => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  const second = registerAgent(store, agentInput({
    agent_id: 'agent.kvds.other.v1',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-synthetic-0001' }],
  }));
  assert.equal(second.status, 'HOLD');
  assert.equal(second.hold_code, C.PROVIDER_IDENTITY_CROSSWALK_CONFLICT);
  assert.equal(projectStoreCounts(store).agents, 1);
});

test('the crosswalk separator keeps composite keys unambiguous', () => {
  // Both splits must be ones that WOULD collide under any separator drawn from the safe-id
  // alphabet. `.` and `-` are both inside SAFE_ID, so each is tested: a separator swapped to
  // either one merges these pairs into a single key and turns the second registration into a
  // spurious crosswalk conflict.
  for (const [firstKind, secondProvider] of [['thread.id', 'codex.thread'], ['thread-id', 'codex-thread']]) {
    const store = createObservationStore();
    assert.equal(registerAgent(store, agentInput({
      provider_identities: [{ provider: 'codex', id_kind: firstKind, id_value: 'x' }],
    })).status, 'REGISTERED');
    const other = registerAgent(store, agentInput({
      agent_id: 'agent.kvds.other.v1',
      provider_identities: [{ provider: secondProvider, id_kind: 'id', id_value: 'x' }],
    }));
    assert.equal(other.status, 'REGISTERED', `${secondProvider} must not collide with codex/${firstKind}`);
  }

  // The separator itself must be outside the safe-id alphabet, or some future pair collides again.
  assert.equal(SAFE_ID.test(COMPOSITE_SEPARATOR), false, 'the separator must not be a legal id character');
  assert.equal(COMPOSITE_SEPARATOR.length, 1);
});

test('unknown project holds instead of inferring one', () => {
  const store = createObservationStore();
  const result = registerAgent(store, agentInput({ project_id: null }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.UNKNOWN_PROJECT);
  assert.equal(projectStoreCounts(store).agents, 0);
});

test('agent memory must be declared a non-authoritative cache', () => {
  const store = createObservationStore();
  const result = registerAgent(store, agentInput({ memory_class: 'long_term_authority' }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.AGENT_MEMORY_NOT_AUTHORITY_REQUIRED);
});

test('an agent whose authority scope excludes its own project is a binding mismatch', () => {
  const store = createObservationStore();
  const result = registerAgent(store, agentInput({
    authority_scope: { allowed_projects: ['proj-synthetic-beta'], allowed_actions: ['x'] },
  }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.PROJECT_BINDING_MISMATCH);
});

test('identical agent replay is NO_OP and a divergent payload is a conflict HOLD', () => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  assert.equal(registerAgent(store, agentInput()).status, 'NO_OP');
  assert.equal(projectStoreCounts(store).agents, 1);

  const conflict = registerAgent(store, agentInput({ functional_role: 'quality' }));
  assert.equal(conflict.status, 'HOLD');
  assert.equal(conflict.hold_code, C.AGENT_RECORD_CONFLICT);
  assert.equal(projectStoreCounts(store).agents, 1);
});

test('agent enum and grammar violations are refused', () => {
  const store = createObservationStore();
  const cases = [
    ['agent_kind', { agent_kind: 'made_up_kind' }],
    ['functional_role', { functional_role: 'made_up_role' }],
    ['agent_id', { agent_id: 'has spaces' }],
    ['registered_at', { registered_at: '2026-08-22' }],
    ['allowed_projects', { authority_scope: { allowed_projects: [], allowed_actions: ['x'] } }],
    ['authority_scope', { authority_scope: { allowed_projects: ['proj-synthetic-alpha'], allowed_actions: ['x'], extra: 1 } }],
    ['provider_identities', { provider_identities: [] }],
  ];
  for (const [label, over] of cases) {
    const result = registerAgent(store, agentInput(over));
    assert.equal(result.status, 'HOLD', `${label} must hold`);
    assert.ok(
      [C.INVALID_FIELD_VALUE, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, C.PROJECT_BINDING_MISMATCH].includes(result.hold_code),
      `${label} unexpected code ${result.hold_code}`,
    );
  }
  assert.equal(projectStoreCounts(store).agents, 0);
});

// -------------------------------------------------------------------------- run observation

test('run observation stores exactly one run with exact identity fields', () => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  const result = observeRun(store, runInput());
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.run_id, 'run-synthetic-0001');
  assert.equal(result.record.parent_run_id, null);
  assert.equal(result.record.agent_id, AGENT_ID);
  assert.equal(result.record.work_unit_id, 'wu-synthetic-0001');
  assert.equal(projectStoreCounts(store).runs, 1);
});

test('an unknown parent run holds and is never inferred from age or title', () => {
  const store = seeded();
  const result = observeRun(store, runInput({ run_id: 'run-synthetic-0002', parent_run_id: 'run-not-registered' }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.UNKNOWN_PARENT_RUN);
  assert.equal(projectStoreCounts(store).runs, 1);
});

test('a run cannot be its own parent', () => {
  const store = seeded();
  const result = observeRun(store, runInput({ run_id: 'run-synthetic-0007', parent_run_id: 'run-synthetic-0007' }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(result.detail, 'parent_run_id_self');
});

test('an unregistered agent holds the run', () => {
  const store = createObservationStore();
  const result = observeRun(store, runInput());
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.UNKNOWN_AGENT);
});

test('a run bound to a different project than its agent is a context firewall HOLD', () => {
  const store = seeded();
  const result = observeRun(store, runInput({ run_id: 'run-synthetic-0003', project_id: 'proj-synthetic-beta' }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.PROJECT_BINDING_MISMATCH);
});

test('an observed result without side-effect evidence cannot claim a completed result', () => {
  const store = seeded();
  const result = observeRun(store, runInput({
    run_id: 'run-synthetic-0004',
    result_state: 'result_observed',
    side_effect_evidence_refs: [],
  }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.RESULT_WITHOUT_SIDE_EFFECT_EVIDENCE);
});

test('an observed result with producer evidence is accepted', () => {
  const store = seeded();
  const result = observeRun(store, runInput({
    run_id: 'run-synthetic-0005',
    result_state: 'result_observed',
    side_effect_evidence_refs: [{ ref_kind: 'artifact', ref_value: 'artifact://synthetic/out-1' }],
  }));
  assert.equal(result.status, 'OBSERVED');
});

test('run timestamps must be ordered', () => {
  const store = seeded();
  const backwardsHeartbeat = observeRun(store, runInput({ run_id: 'run-synthetic-0010', heartbeat_at: EARLIER }));
  assert.equal(backwardsHeartbeat.hold_code, C.TEMPORAL_ORDER_INVALID);
  const backwardsEnd = observeRun(store, runInput({ run_id: 'run-synthetic-0011', ended_at: EARLIER }));
  assert.equal(backwardsEnd.hold_code, C.TEMPORAL_ORDER_INVALID);
  assert.equal(projectStoreCounts(store).runs, 1);
});

test('run enum violations are refused and an identical replay is NO_OP while a divergent one conflicts', () => {
  const store = seeded();
  for (const over of [{ lifecycle: 'made_up' }, { authority: 'made_up' }, { result_state: 'made_up' }]) {
    const result = observeRun(store, runInput({ run_id: 'run-synthetic-enum', ...over }));
    assert.equal(result.hold_code, C.INVALID_FIELD_VALUE);
  }
  assert.equal(observeRun(store, runInput()).status, 'NO_OP');
  const conflict = observeRun(store, runInput({ lifecycle: 'running' }));
  assert.equal(conflict.hold_code, C.RUN_RECORD_CONFLICT);
  assert.equal(projectStoreCounts(store).runs, 1);
});

// ------------------------------------------------------------------------------ usage ledger

test('direct usage is stored exactly once for the exact run', () => {
  const store = seeded();
  const result = recordDirectUsage(store, usageInput());
  assert.equal(result.status, 'RECORDED');
  assert.equal(projectStoreCounts(store).usage_events, 1);
  assert.equal(result.record.tokens.input, 1200);
  assert.equal(result.record.cost_basis, 'token_proxy');
});

test('an identical usage replay is NO_OP and does not increase totals', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  const before = projectUsageRollup(store, { run_id: 'run-synthetic-0001' });
  assert.equal(recordDirectUsage(store, usageInput()).status, 'NO_OP');
  assert.equal(projectStoreCounts(store).usage_events, 1);
  const after = projectUsageRollup(store, { run_id: 'run-synthetic-0001' });
  assert.deepEqual(after.self_usage, before.self_usage);
  assert.equal(after.self_usage.total_tokens, 1500);
});

test('a conflicting usage duplicate is HOLD and leaves the ledger unchanged', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  const conflict = recordDirectUsage(store, usageInput({
    tokens: { input: 9999, cached_input: 400, cache_write_input: 100, output: 300, reasoning_output: 120 },
  }));
  assert.equal(conflict.status, 'HOLD');
  assert.equal(conflict.hold_code, C.USAGE_EVENT_CONFLICT);
  assert.equal(projectStoreCounts(store).usage_events, 1);
  assert.equal(projectUsageRollup(store, { run_id: 'run-synthetic-0001' }).self_usage.total_tokens, 1500);
});

test('the same measurement re-emitted under a fresh correlation id does not double the ledger', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  const reEmitted = recordDirectUsage(store, usageInput({ event_id: 'usage-synthetic-0001-retry' }));
  assert.equal(reEmitted.status, 'HOLD');
  assert.equal(reEmitted.hold_code, C.USAGE_CONTENT_DUPLICATE);
  assert.equal(projectStoreCounts(store).usage_events, 1);
  assert.equal(projectUsageRollup(store, { run_id: 'run-synthetic-0001' }).self_usage.total_tokens, 1500);
});

test('a genuinely different measurement on the same run is still accepted', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  assert.equal(recordDirectUsage(store, usageInput({ event_id: 'usage-synthetic-0002', observed_at: LATER })).status, 'RECORDED');
  assert.equal(projectUsageRollup(store, { run_id: 'run-synthetic-0001' }).self_usage.event_count, 2);
});

test('non-direct usage attribution is refused so child usage is never merged into a manager', () => {
  const store = seeded();
  const result = recordDirectUsage(store, usageInput({ attribution_kind: 'subtree' }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.CHILD_USAGE_MERGE_FORBIDDEN);
});

test('usage attributed to a run/agent pair that does not match is HOLD', () => {
  const store = seeded();
  const result = recordDirectUsage(store, usageInput({ agent_id: 'agent.kvds.other.v1' }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.AGENT_RUN_MISMATCH);
});

test('usage whose provider or model disagrees with its run is HOLD', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput({ model_id: 'model-other' })).hold_code, C.RUN_MODEL_MISMATCH);
  assert.equal(recordDirectUsage(store, usageInput({ provider: 'anthropic' })).hold_code, C.RUN_MODEL_MISMATCH);
  assert.equal(projectStoreCounts(store).usage_events, 0);
});

test('usage against an unknown run is HOLD', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput({ run_id: 'run-not-registered' })).hold_code, C.UNKNOWN_RUN);
});

test('the token partition rule is enforced in both directions', () => {
  const store = seeded();
  const overInput = recordDirectUsage(store, usageInput({
    tokens: { input: 100, cached_input: 80, cache_write_input: 40, output: 10, reasoning_output: 0 },
  }));
  assert.equal(overInput.hold_code, C.TOKEN_PARTITION_INVALID);
  const overOutput = recordDirectUsage(store, usageInput({
    tokens: { input: 100, cached_input: 0, cache_write_input: 0, output: 10, reasoning_output: 50 },
  }));
  assert.equal(overOutput.hold_code, C.TOKEN_PARTITION_INVALID);
  assert.equal(projectStoreCounts(store).usage_events, 0);
});

test('a cost basis that asserts real money or credit must carry its own evidence refs', () => {
  const store = seeded();
  for (const basis of ['billed_cost', 'subscription_credit_observation']) {
    const missing = recordDirectUsage(store, usageInput({ event_id: `u-${basis}`, cost_basis: basis }));
    assert.equal(missing.hold_code, C.COST_EVIDENCE_REQUIRED, basis);
  }
  const withEvidence = recordDirectUsage(store, usageInput({
    event_id: 'u-billed-ok',
    cost_basis: 'billed_cost',
    cost_evidence_refs: [{ ref_kind: 'validation', ref_value: 'invoice://synthetic/2026-08' }],
  }));
  assert.equal(withEvidence.status, 'RECORDED');
  assert.equal(recordDirectUsage(store, usageInput({ cost_basis: 'made_up' })).hold_code, C.INVALID_FIELD_VALUE);
});

test('usage observed before its run started is a temporal HOLD', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput({ observed_at: EARLIER })).hold_code, C.TEMPORAL_ORDER_INVALID);
});

test('self, child-direct and subtree usage are separate projections across two generations', () => {
  const store = seeded();
  assert.equal(registerAgent(store, craftsmanAgentInput()).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput({
    run_id: 'run-child', parent_run_id: 'run-synthetic-0001', agent_id: CRAFTSMAN_ID,
  })).status, 'OBSERVED');
  assert.equal(observeRun(store, runInput({
    run_id: 'run-grandchild', parent_run_id: 'run-child', agent_id: CRAFTSMAN_ID,
  })).status, 'OBSERVED');

  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  assert.equal(recordDirectUsage(store, usageInput({
    event_id: 'usage-child', run_id: 'run-child', agent_id: CRAFTSMAN_ID,
    tokens: { input: 500, cached_input: 0, cache_write_input: 0, output: 100, reasoning_output: 0 },
  })).status, 'RECORDED');
  assert.equal(recordDirectUsage(store, usageInput({
    event_id: 'usage-grandchild', run_id: 'run-grandchild', agent_id: CRAFTSMAN_ID,
    tokens: { input: 70, cached_input: 0, cache_write_input: 0, output: 30, reasoning_output: 0 },
  })).status, 'RECORDED');

  const rollup = projectUsageRollup(store, { run_id: 'run-synthetic-0001' });
  assert.equal(rollup.self_usage.total_tokens, 1500);
  assert.equal(rollup.child_direct_usage.total_tokens, 600, 'child direct excludes the grandchild');
  assert.equal(rollup.subtree_usage.total_tokens, 2200, 'subtree includes the grandchild');
  assert.equal(rollup.self_usage.event_count, 1);
  assert.equal(rollup.child_direct_usage.event_count, 1);
  assert.equal(rollup.subtree_usage.event_count, 3);
});

test('a rollup for an unknown run is HOLD, never a silent zero', () => {
  const store = seeded();
  const result = projectUsageRollup(store, { run_id: 'run-synthetic-0001-typo' });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.UNKNOWN_RUN);
  assert.equal(projectUsageRollup(store, {}).hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(projectUsageRollup(store, null).hold_code, C.INVALID_FIELD_VALUE);
});

// ------------------------------------------------------------------------------- receipts

test('result receipts store only refs and reject a structural edge claimed as delivery', () => {
  const store = seeded();
  const ok = recordResultReceipt(store, receiptInput());
  assert.equal(ok.status, 'RECORDED');
  assert.equal(projectStoreCounts(store).receipts, 1);
  assert.deepEqual(Object.keys(ok.record).sort(), [...RECORD_KEY_ALLOWLIST.receipt].sort());

  const structural = recordResultReceipt(store, receiptInput({
    receipt_id: 'rcpt-synthetic-0002',
    receipt_kind: 'delivery',
    producer_evidence_kind: 'structural_only',
  }));
  assert.equal(structural.status, 'HOLD');
  assert.equal(structural.hold_code, C.STRUCTURAL_EDGE_NOT_DELIVERY);
  assert.equal(projectStoreCounts(store).receipts, 1);
});

test('a receipt needs at least one ref, a known run, and a matching agent', () => {
  const store = seeded();
  assert.equal(recordResultReceipt(store, receiptInput({ refs: [] })).hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(recordResultReceipt(store, receiptInput({ run_id: 'run-not-registered' })).hold_code, C.UNKNOWN_RUN);
  assert.equal(recordResultReceipt(store, receiptInput({ agent_id: 'agent.kvds.other.v1' })).hold_code, C.AGENT_RUN_MISMATCH);
  assert.equal(recordResultReceipt(store, receiptInput({ receipt_kind: 'made_up' })).hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(projectStoreCounts(store).receipts, 0);
});

test('an identical receipt replay is NO_OP and a divergent one conflicts', () => {
  const store = seeded();
  assert.equal(recordResultReceipt(store, receiptInput()).status, 'RECORDED');
  assert.equal(recordResultReceipt(store, receiptInput()).status, 'NO_OP');
  const conflict = recordResultReceipt(store, receiptInput({ receipt_kind: 'artifact' }));
  assert.equal(conflict.hold_code, C.RESULT_RECEIPT_CONFLICT);
  assert.equal(projectStoreCounts(store).receipts, 1);
});

// ------------------------------------------------------------------------ privacy boundary

test('raw transcript, reasoning, tool payload and secret fields are refused at every entry point', () => {
  const store = seeded();

  const rawAgent = registerAgent(createObservationStore(), agentInput({ transcript: 'hello' }));
  assert.equal(rawAgent.hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);

  const rawRun = observeRun(store, runInput({ run_id: 'run-synthetic-0009', reasoning_content: 'chain of thought' }));
  assert.equal(rawRun.hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);

  const secretReceipt = recordResultReceipt(store, receiptInput({
    receipt_id: 'rcpt-synthetic-0003',
    refs: [{ ref_kind: 'artifact', ref_value: 'Bearer abcdef0123456789' }],
  }));
  assert.equal(secretReceipt.hold_code, C.SECRET_VALUE_FORBIDDEN);

  const counts = projectStoreCounts(store);
  assert.equal(counts.privacy.raw_fields_stored, 0);
  assert.equal(counts.privacy.secret_fields_stored, 0);
});

test('an absolute local path is refused wherever it appears, not only at the start of a value', () => {
  const store = seeded();
  const cases = [
    ['receipt', () => recordResultReceipt(store, receiptInput({
      receipt_id: 'rcpt-path', refs: [{ ref_kind: 'artifact', ref_value: fileUri('C:', 'Users', 'user', 'OneDrive', 'secret.xlsx') }],
    }))],
    ['run evidence', () => observeRun(store, runInput({
      run_id: 'run-path', result_state: 'result_observed',
      side_effect_evidence_refs: [{ ref_kind: 'delivery', ref_value: fileUri('C:', 'Soulforge', '_workspaces', 'plan.hwpx') }],
    }))],
    ['workspace marker', () => recordResultReceipt(store, receiptInput({
      receipt_id: 'rcpt-ws', refs: [{ ref_kind: 'artifact', ref_value: 'store:_workspaces/alpha/plan.xlsx' }],
    }))],
    ['posix root', () => recordResultReceipt(store, receiptInput({
      receipt_id: 'rcpt-posix', refs: [{ ref_kind: 'artifact', ref_value: `ref:${posixPath('home', 'user', 'plan.xlsx')}` }],
    }))],
  ];
  for (const [label, run] of cases) {
    const result = run();
    assert.equal(result.status, 'HOLD', label);
    assert.equal(result.hold_code, C.LOCAL_PATH_VALUE_FORBIDDEN, label);
  }
  const counts = projectStoreCounts(store);
  assert.equal(counts.privacy.local_path_fields_stored, 0);
  assert.equal(counts.receipts, 0);
});

test('the privacy audit actually detects a bad record rather than always reporting zero', () => {
  const clean = listRuns(seeded());
  assert.deepEqual(auditRecordPrivacy(clean, RECORD_KEY_ALLOWLIST.run), {
    raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0,
  });

  const tampered = [{ ...clean[0], transcript: 'raw body' }];
  assert.equal(auditRecordPrivacy(tampered, RECORD_KEY_ALLOWLIST.run).raw_fields_stored, 1);

  const withSecret = [{ ...clean[0], task_id: 'Bearer abcdef0123456789' }];
  assert.equal(auditRecordPrivacy(withSecret, RECORD_KEY_ALLOWLIST.run).secret_fields_stored, 1);

  const withPath = [{ ...clean[0], task_id: fileUri('C:', 'Users', 'user', 'x') }];
  assert.equal(auditRecordPrivacy(withPath, RECORD_KEY_ALLOWLIST.run).local_path_fields_stored, 1);
});

test('the declared effect boundary is reported as a declaration alongside the measured privacy audit', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  assert.equal(recordResultReceipt(store, receiptInput()).status, 'RECORDED');
  const counts = projectStoreCounts(store);
  assert.deepEqual(counts.declared_effect_boundary, {
    erp_world_tree_writes: 0,
    board_enrollment_writes: 0,
    result_gate_writes: 0,
    file_writes: 0,
    external_calls: 0,
  });
  assert.deepEqual(counts.privacy, { raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0 });
});

test('a receipt observed before its run started is a temporal HOLD', () => {
  const store = seeded();
  const result = recordResultReceipt(store, receiptInput({ observed_at: EARLIER }));
  assert.equal(result.hold_code, C.TEMPORAL_ORDER_INVALID);
  assert.equal(projectStoreCounts(store).receipts, 0);
});

test('token counts and list lengths are bounded', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput({
    tokens: { input: 1_000_000_001, cached_input: 0, cache_write_input: 0, output: 0, reasoning_output: 0 },
  })).hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(recordDirectUsage(store, usageInput({
    tokens: { input: -1, cached_input: 0, cache_write_input: 0, output: 0, reasoning_output: 0 },
  })).hold_code, C.INVALID_FIELD_VALUE);

  const tooManyIdentities = registerAgent(createObservationStore(), agentInput({
    provider_identities: Array.from({ length: 65 }, (_, i) => ({ provider: 'codex', id_kind: `kind-${i}`, id_value: `v-${i}` })),
  }));
  assert.equal(tooManyIdentities.hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(recordResultReceipt(store, receiptInput({
    refs: Array.from({ length: 65 }, (_, i) => ({ ref_kind: 'artifact', ref_value: `artifact://synthetic/${i}` })),
  })).hold_code, C.INVALID_FIELD_VALUE);
});

test('a value nested deeper than the scan bound fails closed at every entry point', () => {
  const store = seeded();
  let deep = 'leaf';
  for (let i = 0; i < 60_000; i += 1) deep = { nested: deep };
  assert.equal(registerAgent(createObservationStore(), agentInput({ authority_scope: deep })).hold_code, C.INPUT_TOO_DEEP);
  assert.equal(observeRun(store, runInput({ run_id: 'run-deep', side_effect_evidence_refs: deep })).hold_code, C.INPUT_TOO_DEEP);
  assert.equal(recordDirectUsage(store, usageInput({ tokens: deep })).hold_code, C.INPUT_TOO_DEEP);
  assert.equal(recordResultReceipt(store, receiptInput({ refs: deep })).hold_code, C.INPUT_TOO_DEEP);
});

test('the privacy audit also detects a raw key nested below the top level of a record', () => {
  const clean = listRuns(seeded());
  const nestedRaw = [{
    ...clean[0],
    side_effect_evidence_refs: [{ ref_kind: 'artifact', ref_value: 'artifact://synthetic/x', transcript: 'RAW BODY' }],
  }];
  assert.equal(auditRecordPrivacy(nestedRaw, RECORD_KEY_ALLOWLIST.run).raw_fields_stored, 1);

  const nestedOk = [{
    ...clean[0],
    side_effect_evidence_refs: [{ ref_kind: 'artifact', ref_value: 'artifact://synthetic/x' }],
  }];
  assert.equal(auditRecordPrivacy(nestedOk, RECORD_KEY_ALLOWLIST.run).raw_fields_stored, 0);
});

test('a rejected agent registration does not poison the provider crosswalk', () => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  const conflict = registerAgent(store, agentInput({
    functional_role: 'quality',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-never-committed' }],
  }));
  assert.equal(conflict.hold_code, C.AGENT_RECORD_CONFLICT);

  const other = registerAgent(store, agentInput({
    agent_id: 'agent.kvds.other.v1',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-never-committed' }],
  }));
  assert.equal(other.status, 'REGISTERED', 'an identity from a rejected registration must stay claimable');
});

test('a ref value must be a safe ref, not merely present', () => {
  const store = seeded();
  const cases = [
    ['non-string object', { transcript: 'RAW CHAIN OF THOUGHT', tool_output: 'x' }],
    ['non-string number', 42],
    ['null', null],
    ['empty', ''],
    ['over length', `artifact://synthetic/${'a'.repeat(220)}`],
    ['bad charset', 'artifact://synthetic/plan file.xlsx'],
    ['leading punctuation', '://synthetic/x'],
  ];
  for (const [label, refValue] of cases) {
    const result = recordResultReceipt(store, receiptInput({
      receipt_id: 'rcpt-refval', refs: [{ ref_kind: 'artifact', ref_value: refValue }],
    }));
    assert.equal(result.status, 'HOLD', label);
    assert.equal(result.hold_code, C.INVALID_FIELD_VALUE, label);
  }
  assert.equal(projectStoreCounts(store).receipts, 0);
});

test('an unknown key inside a ref entry is refused rather than silently dropped', () => {
  const store = seeded();
  const result = recordResultReceipt(store, receiptInput({
    refs: [{ ref_kind: 'artifact', ref_value: 'artifact://synthetic/x', note: 'extra' }],
  }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  assert.equal(projectStoreCounts(store).receipts, 0);
});

test('an unsafe key name is withheld from the hold detail at every store entry point', () => {
  const store = seeded();
  const hostile = 'Bearer abcdef0123456789';
  for (const [label, result] of [
    ['agent', registerAgent(createObservationStore(), { ...agentInput(), [hostile]: 1 })],
    ['run', observeRun(store, { ...runInput({ run_id: 'run-hostile' }), [hostile]: 1 })],
    ['usage', recordDirectUsage(store, { ...usageInput(), [hostile]: 1 })],
    ['receipt', recordResultReceipt(store, { ...receiptInput(), [hostile]: 1 })],
  ]) {
    assert.equal(result.hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, label);
    assert.notEqual(result.detail, hostile, `${label} detail must not reproduce the key`);
  }
});

test('the same measurement re-emitted under a different cost basis is still one measurement', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  const otherBasis = recordDirectUsage(store, usageInput({ event_id: 'u-basis', cost_basis: 'list_price_estimate' }));
  assert.equal(otherBasis.hold_code, C.USAGE_CONTENT_DUPLICATE);
  const withEvidence = recordDirectUsage(store, usageInput({
    event_id: 'u-evidence',
    cost_basis: 'billed_cost',
    cost_evidence_refs: [{ ref_kind: 'validation', ref_value: 'invoice://synthetic/2026-08' }],
  }));
  assert.equal(withEvidence.hold_code, C.USAGE_CONTENT_DUPLICATE);
  assert.equal(projectStoreCounts(store).usage_events, 1);
  assert.equal(projectUsageRollup(store, { run_id: 'run-synthetic-0001' }).self_usage.total_tokens, 1500);
});

test('a child run in another project cannot be attached to this parent', () => {
  const store = seeded();
  assert.equal(registerAgent(store, agentInput({
    agent_id: 'agent.beta.worker.v1',
    project_id: 'proj-synthetic-beta',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-beta-0001' }],
    authority_scope: { allowed_projects: ['proj-synthetic-beta'], allowed_actions: ['x'] },
  })).status, 'REGISTERED');

  const crossProject = observeRun(store, runInput({
    run_id: 'run-beta-child',
    parent_run_id: 'run-synthetic-0001',
    agent_id: 'agent.beta.worker.v1',
    project_id: 'proj-synthetic-beta',
  }));
  assert.equal(crossProject.status, 'HOLD');
  assert.equal(crossProject.hold_code, C.PARENT_PROJECT_MISMATCH);
  assert.equal(projectStoreCounts(store).runs, 1);
});

test('the privacy audit refuses malformed input instead of throwing', () => {
  for (const bad of [null, undefined, 42, 'x', {}]) {
    const result = auditRecordPrivacy(bad, RECORD_KEY_ALLOWLIST.run);
    assert.equal(result.status, 'HOLD');
    assert.equal(result.hold_code, C.INVALID_FIELD_VALUE);
  }
  assert.equal(auditRecordPrivacy([], null).hold_code, C.INVALID_FIELD_VALUE);
});

test('a record listing for an unrecognised store is null, never an empty ledger', () => {
  const foreign = Object.freeze({ kind: 'soulforge.agent_observation.store.v1' });
  for (const list of [listAgents, listRuns, listUsageEvents, listReceipts]) {
    assert.equal(list(foreign), null);
  }
  const store = createObservationStore();
  for (const list of [listAgents, listRuns, listUsageEvents, listReceipts]) {
    assert.deepEqual(list(store), []);
  }
});

test('a duplicate provider id kind is reported without echoing the caller value', () => {
  const store = createObservationStore();
  const result = registerAgent(store, agentInput({
    provider_identities: [
      { provider: 'codex', id_kind: 'AcmeProgramDeltaClassified', id_value: 'a' },
      { provider: 'codex', id_kind: 'AcmeProgramDeltaClassified', id_value: 'b' },
    ],
  }));
  assert.equal(result.hold_code, C.PROVIDER_IDENTITY_SLOT_CONFLICT);
  assert.equal(result.detail, 'duplicate_provider_id_kind');
  assert.equal(JSON.stringify(result).includes('AcmeProgramDeltaClassified'), false);
});

test('an authority scope list must be dense, not merely pass a per-element check', () => {
  const sparse = ['proj-synthetic-alpha'];
  sparse[2] = 'proj-synthetic-beta';
  const result = registerAgent(createObservationStore(), agentInput({
    authority_scope: { allowed_projects: sparse, allowed_actions: ['x'] },
  }));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, C.INVALID_FIELD_VALUE);
});

test('the rollup request is key-checked like every other entry point', () => {
  const store = seeded();
  const extra = projectUsageRollup(store, { run_id: 'run-synthetic-0001', transcript: 'raw body' });
  assert.equal(extra.status, 'HOLD');
  assert.equal(extra.hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  const secret = projectUsageRollup(store, { run_id: 'run-synthetic-0001', ['Bearer abcdef0123456789']: 1 });
  assert.equal(secret.hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  assert.equal(projectUsageRollup(store, { run_id: 'run-synthetic-0001' }).status, 'PROJECTED');
});

test('a payload rejected as a conflict does not claim its content key', () => {
  const store = seeded();
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');

  const rival = { tokens: { input: 777, cached_input: 0, cache_write_input: 0, output: 111, reasoning_output: 0 } };
  const conflict = recordDirectUsage(store, usageInput(rival));
  assert.equal(conflict.hold_code, C.USAGE_EVENT_CONFLICT);

  // The rejected content was never indexed, so a genuinely new event carrying it is still accepted.
  const later = recordDirectUsage(store, usageInput({ event_id: 'usage-synthetic-0002', ...rival }));
  assert.equal(later.status, 'RECORDED', 'a rejected payload must not reserve its content key');
  assert.equal(projectStoreCounts(store).usage_events, 2);
});

test('a stored delivery receipt keeps the producer evidence kind it was written with', () => {
  const store = seeded();
  assert.equal(recordResultReceipt(store, receiptInput({
    receipt_id: 'rcpt-delivery', receipt_kind: 'delivery', producer_evidence_kind: 'producer_observed',
  })).status, 'RECORDED');
  const stored = listReceipts(store).find((r) => r.receipt_kind === 'delivery');
  assert.equal(stored.producer_evidence_kind, 'producer_observed');

  // `structural_only` is legal on a non-delivery receipt, so the read-back must be proven with a
  // receipt that actually carries it. Otherwise a consumer could hardcode `producer_observed` and
  // silently relabel a structural edge.
  assert.equal(recordResultReceipt(store, receiptInput({
    receipt_id: 'rcpt-structural-result', receipt_kind: 'result', producer_evidence_kind: 'structural_only',
  })).status, 'RECORDED');
  const structural = listReceipts(store).find((r) => r.receipt_id === 'rcpt-structural-result');
  assert.equal(structural.producer_evidence_kind, 'structural_only');

  // It stays refused for a delivery.
  assert.equal(recordResultReceipt(store, receiptInput({
    receipt_id: 'rcpt-structural', receipt_kind: 'delivery', producer_evidence_kind: 'structural_only',
  })).hold_code, C.STRUCTURAL_EDGE_NOT_DELIVERY);
  assert.equal(listReceipts(store).filter((r) => r.receipt_kind === 'delivery').length, 1);
});

test('the observation module and its guards open no external effect surface', () => {
  for (const name of ['agent_observation.mjs', 'guard_primitives.mjs']) {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.equal(source.includes('\u0000'), false, `${name} must stay plain text for grep-based validators`);
    for (const forbidden of [
      'node:fs', 'node:net', 'node:http', 'node:https', 'node:child_process', 'node:dgram',
      'node:worker_threads', 'node:cluster', 'node:v8', 'node:vm',
    ]) {
      assert.equal(source.includes(forbidden), false, `${name} must not import ${forbidden}`);
    }
    for (const pattern of [/\brequire\s*\(/u, /\bimport\s*\(/u, /\bfetch\s*\(/u, /\beval\s*\(/u, /new\s+Function\s*\(/u, /\bprocess\./u, /\bglobalThis\./u, /\bXMLHttpRequest\b/u, /\bDate\.now\s*\(/u, /new\s+Date\s*\(/u]) {
      assert.equal(pattern.test(source), false, `${name} must not use ${pattern}`);
    }
  }
});
