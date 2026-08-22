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
  RESULT_GATE_PREPARATION_HOLD_CODES as P,
  createIsolatedEnrollment,
  createIsolatedRegistry,
  prepareSyntheticResultGateActivation,
} from './result_gate_preparation.mjs';

const RUN_ID = 'run-gate-synthetic-0001';
const AGENT_ID = 'agent.gate-synthetic.systems-engineering.v1';
const THREAD_ID = 'th-gate-synthetic-0001';
const ORG_ID = 'org-synthetic-development1';

const agentInput = (over = {}) => ({
  agent_id: AGENT_ID,
  agent_kind: 'project_isolated_functional',
  functional_role: 'systems_engineering',
  project_id: 'proj-gate-synthetic',
  provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: THREAD_ID }],
  authority_scope: { allowed_projects: ['proj-gate-synthetic'], allowed_actions: ['read'] },
  memory_class: 'cache_only',
  registered_at: '2026-08-22T00:00:00.000Z',
  ...over,
});

const runInput = (over = {}) => ({
  run_id: RUN_ID,
  parent_run_id: null,
  agent_id: AGENT_ID,
  task_id: 'task-gate-synthetic-0001',
  project_id: 'proj-gate-synthetic',
  work_unit_id: 'wu-gate-synthetic-0001',
  lifecycle: 'terminal',
  provider: 'codex',
  model_id: 'model-gate-high',
  reasoning_effort: 'high',
  authority: 'read_only',
  started_at: '2026-08-22T01:00:00.000Z',
  heartbeat_at: '2026-08-22T01:05:00.000Z',
  ended_at: '2026-08-22T01:10:00.000Z',
  result_state: 'result_observed',
  side_effect_evidence_refs: [{ ref_kind: 'artifact', ref_value: 'artifact://gate/workbook-0001' }],
  ...over,
});

const receiptInput = (over = {}) => ({
  receipt_id: 'rcpt-gate-synthetic-0001',
  run_id: RUN_ID,
  agent_id: AGENT_ID,
  receipt_kind: 'delivery',
  producer_evidence_kind: 'producer_observed',
  refs: [{ ref_kind: 'artifact', ref_value: 'artifact://gate/workbook-0001' }],
  observed_at: '2026-08-22T01:11:00.000Z',
  ...over,
});

const seeded = ({ agent = {}, run = {}, receipt = {}, withReceipt = true } = {}) => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput(agent)).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput(run)).status, 'OBSERVED');
  if (withReceipt) assert.equal(recordResultReceipt(store, receiptInput(receipt)).status, 'RECORDED');
  return store;
};

const request = (over = {}) => ({
  run_id: RUN_ID,
  agent_id: AGENT_ID,
  organization_group_id: ORG_ID,
  registry: createIsolatedRegistry(),
  ...over,
});

test('one synthetic exact Agent/Run prepares an activation the Board itself accepts', () => {
  const result = prepareSyntheticResultGateActivation(seeded(), request());
  assert.equal(result.status, 'PREPARED');
  assert.equal(result.thread_id, THREAD_ID);

  // An activation is a pair, not one event: the Board's lifecycle refuses a result_ready that no
  // started precedes, so a module that emitted only the announcement would never activate anything.
  assert.deepEqual(result.events.map((event) => event.event_type), ['started', 'result_ready']);
  assert.equal(result.events[0].target, 'none');
  assert.equal(result.events[0].occurred_at, '2026-08-22T01:00:00.000Z', 'started is stamped at the run start');
  assert.equal(result.events[1].target, 'owner');
  assert.equal(result.events[1].target_thread_id, null);
  assert.equal(result.events[1].occurred_at, '2026-08-22T01:10:00.000Z', 'the result is stamped at the run end');

  // The verdict comes from the Board's own derivation, not from this module's opinion.
  assert.equal(result.derived_state.health, 'available');
  assert.equal(result.derived_state.stage, 'result_ready');
  assert.equal(result.derived_state.target, 'owner');

  assert.equal(result.registry.events.length, 2);
  assert.equal(result.registry.registry_revision, 2);
  assert.equal(result.would_persist_to, null, 'this function names no destination');
  assert.deepEqual(result.authority_boundary, {
    performs_io: false, writes_live_registry: false, enables_gate: false,
  });
});

test('the live registry cannot be passed here, by shape rather than by promise', () => {
  // The live registry is revision 18 with eighteen real events, so each of these is enough on its
  // own to refuse it. The refusal is structural: there is no flag to set that would let it through.
  const store = seeded();
  const cases = [
    ['registry_revision_not_zero', { ...createIsolatedRegistry(), registry_revision: 18 }],
    ['events_not_empty', {
      ...createIsolatedRegistry(),
      events: [{ event_id: 'system_manager_result_ready_owner_20260804', thread_id: 'x' }],
    }],
    ['disabled_flag_set', { ...createIsolatedRegistry(), disabled: true }],
    ['schema_version', { ...createIsolatedRegistry(), schema_version: 'something.else.v1' }],
    ['not_an_object', null],
    ['not_an_object', 'guild_hall/state/operations/team_ops_board/thread_result_gate.v1.json'],
    ['not_an_object', []],
  ];
  for (const [detail, registry] of cases) {
    const result = prepareSyntheticResultGateActivation(store, request({ registry }));
    assert.equal(result.status, 'HOLD', detail);
    assert.equal(result.hold_code, P.REGISTRY_NOT_ISOLATED, detail);
    assert.equal(result.detail, detail);
  }
});

test('a run that never claimed a result cannot announce one', () => {
  for (const state of ['result_pending', 'unknown']) {
    const result = prepareSyntheticResultGateActivation(seeded({ run: { result_state: state, side_effect_evidence_refs: [] } }), request());
    assert.equal(result.hold_code, P.RESULT_NOT_OBSERVED, state);
    assert.equal(result.detail, state);
  }
});

test('a claimed result with no receipt behind it cannot announce one either', () => {
  const noReceipt = prepareSyntheticResultGateActivation(seeded({ withReceipt: false }), request());
  assert.equal(noReceipt.hold_code, P.RESULT_EVIDENCE_MISSING);

  // Paperwork of another kind is not delivery evidence.
  for (const kind of ['approval', 'validation', 'artifact', 'recovery']) {
    const store = seeded({ receipt: { receipt_kind: kind } });
    assert.equal(prepareSyntheticResultGateActivation(store, request()).hold_code, P.RESULT_EVIDENCE_MISSING, kind);
  }
  for (const kind of ['result', 'delivery']) {
    const store = seeded({ receipt: { receipt_kind: kind } });
    assert.equal(prepareSyntheticResultGateActivation(store, request()).status, 'PREPARED', kind);
  }
});

test('the thread id is resolved through the crosswalk, never derived from the run id', () => {
  const store = seeded({
    agent: { provider_identities: [{ provider: 'codex', id_kind: 'session_id', id_value: 'se-gate-0001' }] },
  });
  const result = prepareSyntheticResultGateActivation(store, request());
  assert.equal(result.hold_code, P.PROVIDER_THREAD_IDENTITY_MISSING);
  assert.equal(result.detail, 'codex');
});

test('an agent that did not run this run cannot prepare its gate', () => {
  const store = seeded();
  assert.equal(registerAgent(store, agentInput({
    agent_id: 'agent.gate-synthetic.spreadsheet.v1',
    functional_role: 'spreadsheet',
    provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-gate-synthetic-0002' }],
  })).status, 'REGISTERED');

  const mismatched = prepareSyntheticResultGateActivation(store, request({ agent_id: 'agent.gate-synthetic.spreadsheet.v1' }));
  assert.equal(mismatched.hold_code, P.AGENT_RUN_MISMATCH);

  assert.equal(prepareSyntheticResultGateActivation(store, request({ run_id: 'run-absent-0001' })).hold_code, P.UNKNOWN_RUN);
  assert.equal(prepareSyntheticResultGateActivation(store, request({ agent_id: 'agent.absent.v1' })).hold_code, P.UNKNOWN_AGENT);

  const foreign = Object.freeze({ kind: 'soulforge.agent_observation.store.v1' });
  assert.equal(prepareSyntheticResultGateActivation(foreign, request()).hold_code, P.UNKNOWN_STORE);
});

test('preparing twice yields the same registry, so a replay is not a second announcement', () => {
  const store = seeded();
  const first = prepareSyntheticResultGateActivation(store, request());
  const second = prepareSyntheticResultGateActivation(store, request());
  assert.deepEqual(second.registry, first.registry, 'the preparation must be deterministic');
  assert.deepEqual(second.events, first.events);

  // Appending the same event to the registry it already produced is refused as unchanged rather
  // than silently doubling the announcement.
  const again = prepareSyntheticResultGateActivation(store, request({ registry: first.registry }));
  assert.equal(again.status, 'HOLD');
  assert.equal(again.hold_code, P.REGISTRY_NOT_ISOLATED);
  assert.equal(again.detail, 'registry_revision_not_zero', 'a registry this function produced is no longer isolated');
});

test('the isolated enrollment carries the same privacy shape the observation records do', () => {
  const enrollment = createIsolatedEnrollment({
    threadId: THREAD_ID, organizationGroupId: ORG_ID, displayLabel: 'task-gate-synthetic-0001',
  });
  const entry = enrollment.entries[0];
  assert.equal(entry.metadata_only, true);
  for (const flag of ['raw_preview', 'raw_turns', 'raw_messages', 'raw_reasoning', 'raw_tool_io', 'raw_cwd']) {
    assert.equal(entry[flag], false, flag);
  }
  assert.equal(entry.parent_thread_id, null);
  assert.equal(enrollment.registry_revision, 0);
});

test('this module performs no I/O and reads no clock', () => {
  // The refusal that matters most is the one that cannot be argued with: there is no filesystem
  // call in this source to point at the live registry, whatever a caller asks for.
  const text = readFileSync(new URL('./result_gate_preparation.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    'readFile', 'writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'node:fs',
    'fetch(', 'execFile', 'spawn(', 'process.env', 'defaultThreadResultGateRegistryPath',
  ]) {
    assert.equal(text.includes(forbidden), false, `${forbidden} must not appear`);
  }
  assert.equal(text.includes('Date.now'), false);
  assert.equal(text.includes('new Date('), false);
  assert.equal(text.includes('Math.random'), false);
  assert.equal(text.includes('setThreadResultGateDisabled'), false, 'this module must not toggle the gate');
});

test('the synthetic marker, timestamps and label are all pinned outputs', () => {
  // These were unasserted. The `synthetic_` prefix is the only in-band signal distinguishing these
  // ids from real gate events if the two ever share a registry, so it is contract, not cosmetics.
  const result = prepareSyntheticResultGateActivation(seeded(), request());
  assert.equal(result.events[0].event_id, `synthetic_started_${RUN_ID}`);
  assert.equal(result.events[1].event_id, `synthetic_result_ready_${RUN_ID}`);
  for (const event of result.events) {
    assert.ok(event.event_id.startsWith('synthetic_'), 'a synthetic event must be identifiable as one');
    assert.equal(event.thread_id, THREAD_ID);
  }

  const enrollment = result.enrollment;
  assert.equal(enrollment.updated_at, '2026-08-22T00:00:00.000Z', 'the synthetic epoch is fixed');
  assert.equal(enrollment.entries[0].enrolled_at, '2026-08-22T00:00:00.000Z');
  assert.equal(enrollment.entries[0].display_label, 'task-gate-synthetic-0001', 'the label is the run task');
  assert.equal(enrollment.entries[0].organization_group_id, ORG_ID);

  // The label falls back to the run id when a run carries no task, rather than to a constant.
  const noTask = prepareSyntheticResultGateActivation(seeded({ run: { task_id: null } }), request());
  assert.equal(noTask.enrollment.entries[0].display_label, RUN_ID);
});

test('the organization group id is validated, not passed through', () => {
  const store = seeded();
  for (const bad of [null, '', 'has space', 'sk-abcdefgh12345678'.repeat(20), 42]) {
    const result = prepareSyntheticResultGateActivation(store, request({ organization_group_id: bad }));
    assert.equal(result.status, 'HOLD', String(bad));
    assert.equal(result.hold_code, P.UNKNOWN_AGENT, String(bad));
    assert.equal(result.detail, 'organization_group_id', String(bad));
  }
});

test('a registry that lies on read cannot pass the isolation check', () => {
  // Reading the caller's object directly let a getter answer "revision 0, no events" for the check
  // and hold live events afterwards. The Board's derivation caught it downstream, but a refusal
  // called structural must not lean on a second line of defence.
  const store = seeded();

  let reads = 0;
  const lying = Object.defineProperty(createIsolatedRegistry(), 'registry_revision', {
    enumerable: true,
    configurable: true,
    get() { reads += 1; return reads > 1 ? 18 : 0; },
  });
  const viaGetter = prepareSyntheticResultGateActivation(store, request({ registry: lying }));
  assert.equal(viaGetter.status, 'HOLD');
  assert.equal(viaGetter.hold_code, P.REGISTRY_NOT_ISOLATED);
  assert.equal(reads, 0, 'a rejected accessor must never be evaluated');

  let gets = 0;
  const proxied = new Proxy(createIsolatedRegistry(), {
    get(target, key, receiver) {
      if (key === 'events') { gets += 1; return [{ event_id: 'system_manager_result_ready_owner_20260804' }]; }
      return Reflect.get(target, key, receiver);
    },
  });
  const viaProxy = prepareSyntheticResultGateActivation(store, request({ registry: proxied }));
  assert.equal(gets, 0, 'the lying trap must never fire');
  assert.equal(viaProxy.status, 'PREPARED', 'the honest target is what gets used');
  assert.equal(viaProxy.registry.events.length, 2);
});

test('the preparation does not depend on the environment', () => {
  // appendThreadResultGateEvent defaults its `env` to process.env, so an omitted argument let
  // TEAM_OPS_BOARD_RESULT_GATES_DISABLED change the result of a function documented as pure.
  const store = seeded();
  const before = process.env.TEAM_OPS_BOARD_RESULT_GATES_DISABLED;
  process.env.TEAM_OPS_BOARD_RESULT_GATES_DISABLED = '1';
  try {
    const result = prepareSyntheticResultGateActivation(store, request());
    assert.equal(result.status, 'PREPARED', 'an environment variable must not change a pure preparation');
    assert.equal(result.derived_state.health, 'available');
  } finally {
    if (before === undefined) delete process.env.TEAM_OPS_BOARD_RESULT_GATES_DISABLED;
    else process.env.TEAM_OPS_BOARD_RESULT_GATES_DISABLED = before;
  }
});

test('a registry with a non-plain prototype is refused, not silently read live', () => {
  // snapshotValue returns anything that is not a plain object or array BY REFERENCE, so a registry
  // whose prototype is not Object.prototype was never copied and every later read went through the
  // caller's accessors. guardEntry already refuses on isPlainObject; this call site did not, and
  // registry_revision has no second line of defence because the Board never reads it.
  const store = seeded();

  for (const [name, registry] of [
    ['plain-object prototype', Object.assign(Object.create({}), createIsolatedRegistry())],
    ['class instance', Object.assign(new (class Registry {})(), createIsolatedRegistry())],
  ]) {
    const result = prepareSyntheticResultGateActivation(store, request({ registry }));
    assert.equal(result.status, 'HOLD', name);
    assert.equal(result.hold_code, P.REGISTRY_NOT_ISOLATED, name);
    assert.equal(result.detail, 'not_an_object', name);
  }

  // A null prototype is a different case and is legitimately accepted: `isPlainObject` admits it,
  // so the snapshot copies it like any other plain object rather than passing it through by
  // reference. Refusing it would be a guess dressed as caution.
  const nullProto = Object.assign(Object.create(null), createIsolatedRegistry());
  const accepted = prepareSyntheticResultGateActivation(store, request({ registry: nullProto }));
  assert.equal(accepted.status, 'PREPARED', 'a null-prototype registry is copied, not read live');
  assert.equal(accepted.registry.registry_revision, 2);
  assert.notEqual(accepted.registry, nullProto, 'the returned registry is not the caller object');
  assert.equal(nullProto.events.length, 0, 'the caller object is left unmutated');

  // The concrete escape: a getter behind a non-plain prototype answered 0 for the check and 1000
  // afterwards, yielding a registry at revision 1002 that looked like the successor to a long
  // history while carrying two synthetic events.
  const lying = Object.assign(Object.create({}), {
    schema_version: 'soulforge.team_ops_board.thread_result_gate.v1',
    updated_at: '2026-08-22T00:00:00.000Z',
    disabled: false,
    events: [],
  });
  let reads = 0;
  Object.defineProperty(lying, 'registry_revision', {
    enumerable: true, configurable: true,
    get() { reads += 1; return reads === 1 ? 0 : 1000; },
  });
  const escaped = prepareSyntheticResultGateActivation(store, request({ registry: lying }));
  assert.equal(escaped.status, 'HOLD');
  assert.equal(reads, 0, 'the caller\'s accessors must never be read');
});

test('the store hold carries no caller-supplied detail', () => {
  // The owner echoes no caller string into a hold detail, because a key or value can itself be a
  // credential that passes the safe-id grammar.
  for (const notAStore of [Object.freeze({ kind: 'sk-abcdefgh12345678' }), 'sk-abcdefgh12345678', 42]) {
    const result = prepareSyntheticResultGateActivation(notAStore, request());
    assert.equal(result.hold_code, P.UNKNOWN_STORE);
    assert.equal(JSON.stringify(result).includes('sk-'), false, 'a hold must not echo the caller');
  }
});
