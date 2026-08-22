import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateUsageEvent } from '../ai_usage_meter/usage_meter.mjs';

import {
  createObservationStore,
  registerAgent,
  observeRun,
  recordDirectUsage,
} from './agent_observation.mjs';

import {
  BINDING_FIELDS,
  BRIDGE_HOLD_CODES as B,
  METER_PROJECTABLE_COST_BASES,
  PROVIDER_TO_METER_SOURCE_KIND,
  measureMeterProjectability,
  projectMeterUsageEvent,
} from './usage_meter_bridge.mjs';

// Built from parts so the repository stores no literal local absolute path while the detector
// still sees the exact shape it must reject.
const winPath = (...parts) => parts.join('\\');

const agentInput = (overrides = {}) => ({
  agent_id: 'agent.bridge-alpha.systems-engineering.v1',
  agent_kind: 'project_isolated_functional',
  functional_role: 'systems_engineering',
  project_id: 'proj-bridge-alpha',
  provider_identities: [
    { provider: 'codex', id_kind: 'thread_id', id_value: 'th-bridge-alpha-0001' },
  ],
  authority_scope: { allowed_projects: ['proj-bridge-alpha'], allowed_actions: ['read'] },
  memory_class: 'cache_only',
  registered_at: '2026-08-22T00:00:00.000Z',
  ...overrides,
});

const runInput = (overrides = {}) => ({
  run_id: 'run-bridge-alpha-0001',
  parent_run_id: null,
  agent_id: 'agent.bridge-alpha.systems-engineering.v1',
  task_id: 'task-bridge-alpha-0001',
  project_id: 'proj-bridge-alpha',
  work_unit_id: 'wu-bridge-alpha-0001',
  lifecycle: 'terminal',
  provider: 'codex',
  model_id: 'model-bridge-high',
  reasoning_effort: 'high',
  authority: 'read_only',
  started_at: '2026-08-22T01:00:00.000Z',
  heartbeat_at: '2026-08-22T01:05:00.000Z',
  ended_at: '2026-08-22T01:10:00.000Z',
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
  ...overrides,
});

const usageInput = (overrides = {}) => ({
  event_id: 'usage-bridge-alpha-0001',
  run_id: 'run-bridge-alpha-0001',
  agent_id: 'agent.bridge-alpha.systems-engineering.v1',
  provider: 'codex',
  model_id: 'model-bridge-high',
  attribution_kind: 'direct',
  tokens: { input: 1800, cached_input: 600, cache_write_input: 200, output: 450, reasoning_output: 180 },
  cost_basis: 'token_proxy',
  cost_evidence_refs: [],
  observed_at: '2026-08-22T01:09:00.000Z',
  ...overrides,
});

const binding = (overrides = {}) => ({
  event_id: 'usage-bridge-alpha-0001',
  organization_id: 'org-synthetic-development1',
  team_id: 'team-synthetic-development1',
  turn_id: 'turn-bridge-alpha-0001',
  root_turn_id: 'turn-bridge-alpha-0001',
  service_tier: 'standard',
  context_window: 200000,
  model_invocation_count: 3,
  max_invocation_input_tokens: 900,
  rate_card_id: 'rate-card-synthetic-v1',
  source_ref: 'session:codex:bridge-alpha-0001',
  originator: null,
  ...overrides,
});

/** A store holding one registered agent, one terminal run and one direct usage record. */
function seededStore({ agent = {}, run = {}, usage = {} } = {}) {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput(agent)).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput(run)).status, 'OBSERVED');
  assert.equal(recordDirectUsage(store, usageInput(usage)).status, 'RECORDED');
  return store;
}

test('a projected event is accepted by the meter validator, not merely by this module', () => {
  const store = seededStore();
  const result = projectMeterUsageEvent(store, binding());
  assert.equal(result.status, 'PROJECTED');

  // Re-validating here is deliberate duplication: if the bridge ever stopped calling the meter's
  // validator, the internal call disappearing would not fail a test, but this one would.
  assert.equal(validateUsageEvent(result.event), result.event);
  assert.equal(result.event.schema_version, 'soulforge.ai_usage_event.v1');
});

test('identity and binding come from the observation store, never from the caller', () => {
  const store = seededStore();
  const { event } = projectMeterUsageEvent(store, binding());

  assert.equal(event.project_id, 'proj-bridge-alpha', 'project comes from the run');
  assert.equal(event.work_id, 'wu-bridge-alpha-0001', 'work unit comes from the run');
  assert.equal(event.actor.agent_id, 'agent.bridge-alpha.systems-engineering.v1');
  assert.equal(event.actor.node_id, 'run-bridge-alpha-0001');
  assert.equal(event.actor.role, 'systems_engineering');
  assert.equal(event.model.id, 'model-bridge-high', 'model comes from the usage record');
  assert.equal(event.model.reasoning_effort, 'high', 'effort comes from the run');

  // project_id and work_id are not in the binding allowlist at all, so a caller cannot even offer a
  // conflicting value - an attempt to supply one is an unknown field.
  assert.equal(BINDING_FIELDS.includes('project_id'), false);
  assert.equal(BINDING_FIELDS.includes('work_id'), false);
  const spoofed = projectMeterUsageEvent(store, { ...binding(), project_id: 'proj-other' });
  assert.equal(spoofed.hold_code, B.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
});

test('the thread id is resolved through the provider crosswalk rather than guessed', () => {
  const store = seededStore();
  const { event } = projectMeterUsageEvent(store, binding());
  assert.equal(event.thread_id, 'th-bridge-alpha-0001');

  // The same agent under a provider it has no thread identity for cannot be projected. Falling back
  // to the run id or the agent id here would fabricate a provider-side identity.
  const otherProvider = seededStore({
    agent: {
      provider_identities: [{ provider: 'codex', id_kind: 'session_id', id_value: 'se-bridge-alpha-0001' }],
    },
  });
  const held = projectMeterUsageEvent(otherProvider, binding());
  assert.equal(held.hold_code, B.PROVIDER_THREAD_IDENTITY_MISSING);
  assert.equal(held.detail, 'codex');
});

test('a provider with no meter source kind holds instead of being coerced to the nearest one', () => {
  const store = seededStore({
    agent: { provider_identities: [{ provider: 'hermes', id_kind: 'thread_id', id_value: 'th-hermes-0001' }] },
    run: { provider: 'hermes' },
    usage: { provider: 'hermes' },
  });
  const result = projectMeterUsageEvent(store, binding());
  assert.equal(result.hold_code, B.PROVIDER_NOT_METER_SOURCE_KIND);
  assert.equal(result.detail, 'hermes');
  assert.equal(Object.hasOwn(PROVIDER_TO_METER_SOURCE_KIND, 'hermes'), false);
});

test('an observed charge is never flattened into rate_unknown or invented as a total', () => {
  for (const costBasis of ['billed_cost', 'subscription_credit_observation']) {
    const store = seededStore({
      usage: { cost_basis: costBasis, cost_evidence_refs: [{ ref_kind: 'validation', ref_value: 'invoice/2026-08' }] },
    });
    const result = projectMeterUsageEvent(store, binding());
    assert.equal(result.hold_code, B.COST_BASIS_NOT_PROJECTABLE, costBasis);
    assert.equal(result.detail, costBasis);
  }

  for (const costBasis of METER_PROJECTABLE_COST_BASES) {
    const store = seededStore({ usage: { cost_basis: costBasis } });
    const result = projectMeterUsageEvent(store, binding());
    assert.equal(result.status, 'PROJECTED', costBasis);
    assert.equal(result.event.credits.status, 'rate_unknown');
    assert.equal(result.event.credits.total, null);
    assert.equal(result.event.credits.components, null);
  }
});

test('the token partition the meter derives matches the one the observation record stores', () => {
  const store = seededStore();
  const { event } = projectMeterUsageEvent(store, binding());
  assert.deepEqual(event.usage, {
    input_tokens: 1800,
    cached_input_tokens: 600,
    cache_write_input_tokens: 200,
    output_tokens: 450,
    reasoning_output_tokens: 180,
    total_tokens: 2250,
    uncached_input_tokens: 1000,
    model_invocation_count: 3,
    max_invocation_input_tokens: 900,
  });
});

test('run lineage becomes meter lineage, with depth counted from the root', () => {
  const store = seededStore();
  assert.equal(registerAgent(store, agentInput({
    agent_id: 'agent.bridge-alpha.spreadsheet.v1',
    functional_role: 'spreadsheet',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-bridge-alpha-0002' }],
  })).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput({
    run_id: 'run-bridge-alpha-0002',
    parent_run_id: 'run-bridge-alpha-0001',
    agent_id: 'agent.bridge-alpha.spreadsheet.v1',
    task_id: 'task-bridge-alpha-0002',
    work_unit_id: 'wu-bridge-alpha-0002',
    model_id: 'model-bridge-low',
    reasoning_effort: 'low',
  })).status, 'OBSERVED');
  assert.equal(recordDirectUsage(store, usageInput({
    event_id: 'usage-bridge-alpha-0002',
    run_id: 'run-bridge-alpha-0002',
    agent_id: 'agent.bridge-alpha.spreadsheet.v1',
    model_id: 'model-bridge-low',
  })).status, 'RECORDED');

  const child = projectMeterUsageEvent(store, binding({ event_id: 'usage-bridge-alpha-0002' }));
  assert.equal(child.status, 'PROJECTED');
  assert.equal(child.event.thread_id, 'th-bridge-alpha-0002');
  assert.equal(child.event.parent_thread_id, 'th-bridge-alpha-0001');
  assert.equal(child.event.root_thread_id, 'th-bridge-alpha-0001');
  assert.equal(child.event.actor.agent_depth, 1);

  const parent = projectMeterUsageEvent(store, binding());
  assert.equal(parent.event.parent_thread_id, null, 'a root run has no parent thread');
  assert.equal(parent.event.root_thread_id, 'th-bridge-alpha-0001', 'a root run is its own root');
  assert.equal(parent.event.actor.agent_depth, 0);
});

test('an unfinished run projects as active, and a finished one carries a real duration', () => {
  const finished = projectMeterUsageEvent(seededStore(), binding());
  assert.equal(finished.event.measurement.status, 'complete');
  assert.equal(finished.event.time.started_at, '2026-08-22T01:00:00.000Z');
  assert.equal(finished.event.time.completed_at, '2026-08-22T01:10:00.000Z');
  assert.equal(finished.event.time.duration_ms, 600000);

  const running = projectMeterUsageEvent(
    seededStore({ run: { lifecycle: 'running', ended_at: null } }),
    binding(),
  );
  assert.equal(running.event.measurement.status, 'active');
  assert.equal(running.event.time.completed_at, null);
  assert.equal(running.event.time.duration_ms, null);
});

test('token confidence is taken from the meter table, not restated locally', () => {
  const store = seededStore();
  const { event } = projectMeterUsageEvent(store, binding());
  assert.equal(event.source.kind, 'codex_session_jsonl');
  assert.equal(event.measurement.token_confidence, 'exact_cumulative_delta');
  assert.equal(event.measurement.attribution_confidence, 'explicit_binding');
});

test('the privacy boundary the observation model guarantees is carried across intact', () => {
  const { event } = projectMeterUsageEvent(seededStore(), binding());
  assert.deepEqual(event.privacy, {
    metadata_only: true,
    prompt_captured: false,
    reasoning_captured: false,
    tool_payload_captured: false,
  });
});

test('every binding field the observation model does not own must be supplied explicitly', () => {
  const store = seededStore();
  for (const field of BINDING_FIELDS) {
    if (field === 'event_id' || field === 'originator') continue;
    const partial = binding();
    delete partial[field];
    const result = projectMeterUsageEvent(store, partial);
    assert.equal(result.status, 'HOLD', `${field} must not default`);
    assert.equal(result.hold_code, B.INVALID_BINDING_FIELD, field);
    assert.equal(result.detail, field);
  }

  // originator is nullable in the meter contract, so an explicit null is legal but an omission is
  // not - undefined would silently become null and lose the distinction.
  const omitted = binding();
  delete omitted.originator;
  assert.equal(projectMeterUsageEvent(store, omitted).detail, 'originator');
  assert.equal(projectMeterUsageEvent(store, binding({ originator: null })).status, 'PROJECTED');
  assert.equal(projectMeterUsageEvent(store, binding({ originator: 'owner' })).event.source.originator, 'owner');
});

test('an unrecorded usage event, run or agent cannot be projected', () => {
  const store = seededStore();
  assert.equal(projectMeterUsageEvent(store, binding({ event_id: 'usage-absent-0001' })).hold_code, B.UNKNOWN_USAGE_EVENT);
  assert.equal(projectMeterUsageEvent(createObservationStore(), binding()).hold_code, B.UNKNOWN_USAGE_EVENT);
});

test('a hostile binding is refused by the same guards the observation entry points use', () => {
  const store = seededStore();
  assert.equal(projectMeterUsageEvent(store, { ...binding(), extra: 1 }).hold_code, B.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  assert.equal(projectMeterUsageEvent(store, binding({ team_id: 'sk-abcdefgh12345678' })).hold_code, B.SECRET_VALUE_FORBIDDEN);
  assert.equal(projectMeterUsageEvent(store, binding({ source_ref: winPath('D:', 'synthetic', 'note.txt') })).hold_code, B.LOCAL_PATH_VALUE_FORBIDDEN);
  assert.equal(projectMeterUsageEvent(store, null).hold_code, B.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);

  let reads = 0;
  const getter = Object.defineProperty(binding(), 'team_id', {
    enumerable: true,
    configurable: true,
    get() { reads += 1; return 'sk-abcdefgh12345678'; },
  });
  assert.equal(projectMeterUsageEvent(store, getter).hold_code, B.ACCESSOR_PROPERTY_FORBIDDEN);
  assert.equal(reads, 0, 'a rejected accessor must never be evaluated');

  let gets = 0;
  const proxied = new Proxy(binding(), {
    get(target, key, receiver) {
      if (key === 'team_id') { gets += 1; return 'sk-PROXYPAYLOAD123'; }
      return Reflect.get(target, key, receiver);
    },
  });
  const viaProxy = projectMeterUsageEvent(store, proxied);
  assert.equal(viaProxy.status, 'PROJECTED');
  assert.equal(gets, 0, 'the lying trap must never fire');
  assert.equal(viaProxy.event.team_id, 'team-synthetic-development1');
});

test('projectability is measurable without projecting anything', () => {
  const clean = measureMeterProjectability(seededStore());
  assert.deepEqual(clean.counts, {
    total: 1,
    projectable: 1,
    provider_not_meter_source_kind: 0,
    cost_basis_not_projectable: 0,
    provider_thread_identity_missing: 0,
  });
  assert.deepEqual(clean.hold_codes, []);

  const drifting = measureMeterProjectability(seededStore({
    agent: { provider_identities: [{ provider: 'hermes', id_kind: 'thread_id', id_value: 'th-hermes-0001' }] },
    run: { provider: 'hermes' },
    usage: { provider: 'hermes' },
  }));
  assert.equal(drifting.counts.projectable, 0);
  assert.equal(drifting.counts.provider_not_meter_source_kind, 1);
  assert.deepEqual(drifting.hold_codes, [B.PROVIDER_NOT_METER_SOURCE_KIND]);

  const unbridgeable = measureMeterProjectability(seededStore({
    agent: { provider_identities: [{ provider: 'codex', id_kind: 'session_id', id_value: 'se-only-0001' }] },
  }));
  assert.equal(unbridgeable.counts.provider_thread_identity_missing, 1);
  assert.deepEqual(unbridgeable.hold_codes, [B.PROVIDER_THREAD_IDENTITY_MISSING]);
});

test('the bridge opens no external effect surface', () => {
  const text = readFileSync(new URL('./usage_meter_bridge.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'fetch(', 'execFile', 'spawn(']) {
    assert.equal(text.includes(forbidden), false, `${forbidden} must not appear in the bridge`);
  }
  assert.equal(text.includes('Date.now'), false, 'the projection must not read a clock');
  assert.equal(text.includes('Math.random'), false, 'the projection must be deterministic');
});

test('the meter validator inside the bridge is load-bearing, not decorative', () => {
  // A run may legally have no work unit: `observeRun` treats `work_unit_id` as nullable. The meter
  // requires a safe id for `work_id` and rejects null. Nothing in this module's own checks catches
  // that, so the only thing standing between a null work id and a projected event is the meter's
  // own validator being called. Removing that call has to fail here.
  const store = seededStore({ run: { work_unit_id: null } });
  const result = projectMeterUsageEvent(store, binding());
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, B.METER_VALIDATION_REJECTED);
  assert.equal(result.detail, 'work_id_invalid');
});

test('a lineage deeper than the bound holds instead of walking forever', () => {
  const store = createObservationStore();
  const DEPTH = 40;
  for (let index = 0; index <= DEPTH; index += 1) {
    const agentId = `agent.bridge-chain-${index}.systems-engineering.v1`;
    assert.equal(registerAgent(store, agentInput({
      agent_id: agentId,
      provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: `th-bridge-chain-${index}` }],
    })).status, 'REGISTERED');
    assert.equal(observeRun(store, runInput({
      run_id: `run-bridge-chain-${index}`,
      parent_run_id: index === 0 ? null : `run-bridge-chain-${index - 1}`,
      agent_id: agentId,
      task_id: `task-bridge-chain-${index}`,
      work_unit_id: `wu-bridge-chain-${index}`,
    })).status, 'OBSERVED');
  }
  assert.equal(recordDirectUsage(store, usageInput({
    event_id: 'usage-bridge-chain-deep',
    run_id: `run-bridge-chain-${DEPTH}`,
    agent_id: `agent.bridge-chain-${DEPTH}.systems-engineering.v1`,
  })).status, 'RECORDED');

  const deep = projectMeterUsageEvent(store, binding({ event_id: 'usage-bridge-chain-deep' }));
  assert.equal(deep.status, 'HOLD');
  assert.equal(deep.hold_code, B.RUN_LINEAGE_TOO_DEEP);
  assert.equal(deep.detail, 'depth');

  // A chain just inside the bound still projects, so the bound refuses depth rather than lineage.
  assert.equal(recordDirectUsage(store, usageInput({
    event_id: 'usage-bridge-chain-shallow',
    run_id: 'run-bridge-chain-30',
    agent_id: 'agent.bridge-chain-30.systems-engineering.v1',
  })).status, 'RECORDED');
  const shallow = projectMeterUsageEvent(store, binding({ event_id: 'usage-bridge-chain-shallow' }));
  assert.equal(shallow.status, 'PROJECTED');
  assert.equal(shallow.event.actor.agent_depth, 30);
  assert.equal(shallow.event.root_thread_id, 'th-bridge-chain-0');
});
