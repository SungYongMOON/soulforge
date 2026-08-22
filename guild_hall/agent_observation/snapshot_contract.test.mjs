/**
 * One property, proven at every entry point that accepts caller input:
 *
 *   the record an entry point stores is built from the snapshot it validated, never from the raw
 *   argument.
 *
 * A reviewer showed this was previously unproven. Replacing `const input = guarded.value` with
 * `const input = rawInput` in ten entry points left the whole suite green, while the `observeRun`
 * mutant demonstrably stored `sk-abcdefgh12345678` in a record the privacy audit then reported as
 * clean. Every entry point below is exercised with an input that lies on read, so a builder that
 * reads the argument a second time stores the lie and a builder that reads the snapshot cannot.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SCAN_DEPTH,
  MAX_SNAPSHOT_ITEMS,
  guardEntry,
  snapshotInput,
} from './guard_primitives.mjs';

import { VERTICAL_HOLD_CODES } from './p0s1_vertical.mjs';
import { P0S2_HOLD_CODES } from './p0s2_job_shop.mjs';
import { BRIDGE_HOLD_CODES } from './usage_meter_bridge.mjs';
import { BOARD_HEALTH_HOLD_CODES } from './board_health_projection.mjs';
import { RESULT_GATE_PREPARATION_HOLD_CODES } from './result_gate_preparation.mjs';

import {
  OBSERVATION_HOLD_CODES,
  createObservationStore,
  observeRun,
  projectUsageRollup,
  recordDirectUsage,
  recordResultReceipt,
  registerAgent,
} from './agent_observation.mjs';

import {
  JOB_SHOP_HOLD_CODES,
  acquireLease,
  completeJob,
  createJobShop,
  observeResourceHealth,
  registerHost,
  registerResource,
  releaseLease,
  submitJob,
} from './resource_job_shop.mjs';

const PAYLOAD = 'sk-abcdefgh12345678';
const T0 = 1_780_000_000_000;

/**
 * Wraps `target` so that every `get` for `key` yields the payload and is counted. The guard reads
 * descriptors rather than properties, so a correct entry point leaves the counter at zero; a
 * builder that re-reads the argument drives it above zero and stores the payload.
 */
function lyingProxy(target, key) {
  const counter = { gets: 0 };
  const proxy = new Proxy(target, {
    get(object, property, receiver) {
      if (property === key) { counter.gets += 1; return PAYLOAD; }
      return Reflect.get(object, property, receiver);
    },
  });
  return { proxy, counter };
}

const agentInput = (over = {}) => ({
  agent_id: 'agent.snapshot.systems-engineering.v1',
  agent_kind: 'project_isolated_functional',
  functional_role: 'systems_engineering',
  project_id: 'proj-snapshot',
  provider_identities: [{ provider: 'codex', id_kind: 'thread_id', id_value: 'th-snapshot-0001' }],
  authority_scope: { allowed_projects: ['proj-snapshot'], allowed_actions: ['read'] },
  memory_class: 'cache_only',
  registered_at: '2026-08-22T00:00:00.000Z',
  ...over,
});

const runInput = (over = {}) => ({
  run_id: 'run-snapshot-0001',
  parent_run_id: null,
  agent_id: 'agent.snapshot.systems-engineering.v1',
  task_id: 'task-snapshot-0001',
  project_id: 'proj-snapshot',
  work_unit_id: 'wu-snapshot-0001',
  lifecycle: 'terminal',
  provider: 'codex',
  model_id: 'model-snapshot-high',
  reasoning_effort: 'high',
  authority: 'read_only',
  started_at: '2026-08-22T01:00:00.000Z',
  heartbeat_at: '2026-08-22T01:05:00.000Z',
  ended_at: '2026-08-22T01:10:00.000Z',
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
  ...over,
});

const usageInput = (over = {}) => ({
  event_id: 'usage-snapshot-0001',
  run_id: 'run-snapshot-0001',
  agent_id: 'agent.snapshot.systems-engineering.v1',
  provider: 'codex',
  model_id: 'model-snapshot-high',
  attribution_kind: 'direct',
  tokens: { input: 100, cached_input: 10, cache_write_input: 0, output: 20, reasoning_output: 5 },
  cost_basis: 'token_proxy',
  cost_evidence_refs: [],
  observed_at: '2026-08-22T01:09:00.000Z',
  ...over,
});

const receiptInput = (over = {}) => ({
  receipt_id: 'rcpt-snapshot-0001',
  run_id: 'run-snapshot-0001',
  agent_id: 'agent.snapshot.systems-engineering.v1',
  receipt_kind: 'delivery',
  producer_evidence_kind: 'producer_observed',
  refs: [{ ref_kind: 'artifact', ref_value: 'artifact://snapshot/workbook-0001' }],
  observed_at: '2026-08-22T01:11:00.000Z',
  ...over,
});

const seededStore = () => {
  const store = createObservationStore();
  assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
  assert.equal(observeRun(store, runInput()).status, 'OBSERVED');
  return store;
};

const hostInput = (over = {}) => ({
  host_id: 'PC-01', health: 'ok', capability_kinds: ['spreadsheet'], observed_at_ms: T0, ...over,
});

const resourceInput = (over = {}) => ({
  resource_id: 'res-spreadsheet-01',
  host_id: 'PC-01',
  tool_kind: 'spreadsheet',
  capacity: 1,
  health: 'ok',
  allowed_projects: ['proj-snapshot'],
  allowed_actions: ['produce_workbook'],
  observed_at_ms: T0,
  ...over,
});

const jobInput = (over = {}) => ({
  job_id: 'job-snapshot-0001',
  resource_id: 'res-spreadsheet-01',
  priority: 'normal',
  project_id: 'proj-snapshot',
  agent_id: 'agent.snapshot.spreadsheet.v1',
  run_id: 'run-snapshot-0001',
  action: 'produce_workbook',
  submitted_seq: 1,
  ...over,
});

const readyShop = () => {
  const shop = createJobShop();
  assert.equal(registerHost(shop, hostInput()).status, 'REGISTERED');
  assert.equal(registerResource(shop, resourceInput()).status, 'REGISTERED');
  return shop;
};

/**
 * Every entry point that takes caller input, the field a liar would target, and where the honest
 * value must surface afterwards. `expect` returns the value the entry point actually stored.
 */
const ENTRY_POINTS = [
  {
    name: 'registerAgent',
    key: 'agent_id',
    honest: 'agent.snapshot.systems-engineering.v1',
    run: (proxy) => registerAgent(createObservationStore(), proxy),
    input: agentInput,
    status: 'REGISTERED',
    stored: (result) => result.record.agent_id,
  },
  {
    name: 'observeRun',
    key: 'task_id',
    honest: 'task-snapshot-0001',
    run: (proxy) => {
      const store = createObservationStore();
      assert.equal(registerAgent(store, agentInput()).status, 'REGISTERED');
      return observeRun(store, proxy);
    },
    input: runInput,
    status: 'OBSERVED',
    stored: (result) => result.record.task_id,
  },
  {
    name: 'recordDirectUsage',
    key: 'event_id',
    honest: 'usage-snapshot-0001',
    run: (proxy) => recordDirectUsage(seededStore(), proxy),
    input: usageInput,
    status: 'RECORDED',
    stored: (result) => result.record.event_id,
  },
  {
    name: 'recordResultReceipt',
    key: 'receipt_id',
    honest: 'rcpt-snapshot-0001',
    run: (proxy) => recordResultReceipt(seededStore(), proxy),
    input: receiptInput,
    status: 'RECORDED',
    stored: (result) => result.record.receipt_id,
  },
  {
    name: 'registerHost',
    key: 'host_id',
    honest: 'PC-01',
    run: (proxy) => registerHost(createJobShop(), proxy),
    input: hostInput,
    status: 'REGISTERED',
    stored: (result) => result.host_id,
  },
  {
    name: 'registerResource',
    key: 'resource_id',
    honest: 'res-spreadsheet-01',
    run: (proxy) => {
      const shop = createJobShop();
      assert.equal(registerHost(shop, hostInput()).status, 'REGISTERED');
      return registerResource(shop, proxy);
    },
    input: resourceInput,
    status: 'REGISTERED',
    stored: (result) => result.resource_id,
  },
  {
    name: 'observeResourceHealth',
    key: 'resource_id',
    honest: 'res-spreadsheet-01',
    run: (proxy) => observeResourceHealth(readyShop(), proxy),
    input: () => ({ resource_id: 'res-spreadsheet-01', health: 'degraded', observed_at_ms: T0 + 1000 }),
    status: 'UPDATED',
    stored: (result) => result.resource_id,
  },
  {
    name: 'submitJob',
    key: 'job_id',
    honest: 'job-snapshot-0001',
    run: (proxy) => submitJob(readyShop(), proxy),
    input: jobInput,
    status: 'QUEUED',
    stored: (result) => result.job_id,
  },
  {
    name: 'acquireLease',
    key: 'lease_id',
    honest: 'lease-snapshot-0001',
    run: (proxy) => {
      const shop = readyShop();
      assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
      return acquireLease(shop, proxy);
    },
    input: () => ({ resource_id: 'res-spreadsheet-01', lease_id: 'lease-snapshot-0001', now_ms: T0, ttl_ms: 60_000 }),
    status: 'GRANTED',
    stored: (result) => result.lease.lease_id,
  },
  {
    name: 'completeJob',
    key: 'result_ref',
    honest: 'artifact://snapshot/workbook-0001',
    run: (proxy) => {
      const shop = readyShop();
      assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
      assert.equal(acquireLease(shop, {
        resource_id: 'res-spreadsheet-01', lease_id: 'lease-snapshot-0001', now_ms: T0, ttl_ms: 60_000,
      }).status, 'GRANTED');
      return completeJob(shop, proxy);
    },
    input: () => ({
      lease_id: 'lease-snapshot-0001',
      job_id: 'job-snapshot-0001',
      result_ref: 'artifact://snapshot/workbook-0001',
      now_ms: T0 + 1000,
    }),
    status: 'COMPLETED',
    stored: (result) => result.result_ref,
  },
  {
    name: 'releaseLease',
    key: 'lease_id',
    honest: 'lease-snapshot-0001',
    run: (proxy) => {
      const shop = readyShop();
      assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
      assert.equal(acquireLease(shop, {
        resource_id: 'res-spreadsheet-01', lease_id: 'lease-snapshot-0001', now_ms: T0, ttl_ms: 60_000,
      }).status, 'GRANTED');
      return releaseLease(shop, proxy);
    },
    input: () => ({ lease_id: 'lease-snapshot-0001' }),
    status: 'RELEASED',
    stored: (result) => result.lease_id,
  },
];

for (const entry of ENTRY_POINTS) {
  test(`${entry.name} builds its record from the snapshot, not from the argument`, () => {
    const { proxy, counter } = lyingProxy(entry.input(), entry.key);
    const result = entry.run(proxy);

    assert.equal(result.status, entry.status, `${entry.name} should have succeeded on honest values`);
    assert.equal(counter.gets, 0, `${entry.name} re-read its argument through the trap`);
    assert.equal(entry.stored(result), entry.honest, `${entry.name} stored the lie`);
    assert.notEqual(entry.stored(result), PAYLOAD);
  });
}

test('projectUsageRollup answers about the snapshot of its request', () => {
  const store = seededStore();
  assert.equal(recordDirectUsage(store, usageInput()).status, 'RECORDED');
  const { proxy, counter } = lyingProxy({ run_id: 'run-snapshot-0001' }, 'run_id');
  const rollup = projectUsageRollup(store, proxy);
  assert.equal(rollup.status, 'PROJECTED');
  assert.equal(counter.gets, 0);
  assert.equal(rollup.run_id, 'run-snapshot-0001');
});

test('an accessor placed on a real entry point is refused without being evaluated', () => {
  for (const [name, run, input, key] of [
    ['registerAgent', (i) => registerAgent(createObservationStore(), i), agentInput, 'agent_id'],
    ['submitJob', (i) => submitJob(readyShop(), i), jobInput, 'job_id'],
  ]) {
    let reads = 0;
    const hostile = Object.defineProperty(input(), key, {
      enumerable: true, configurable: true, get() { reads += 1; return PAYLOAD; },
    });
    const result = run(hostile);
    assert.equal(result.status, 'HOLD', name);
    assert.equal(result.hold_code, 'ACCESSOR_PROPERTY_FORBIDDEN', name);
    assert.equal(reads, 0, `${name} evaluated a rejected accessor`);
  }
});

// --------------------------------------------------------------- regressions found in review four

test('an own enumerable __proto__ key cannot vanish from the snapshot', () => {
  // `copy[name] = copied` does not create a data property for `__proto__`; it invokes the inherited
  // setter, which silently discards a primitive. The key disappeared before any scan ran, so a
  // credential-carrying input was reported as a clean PASS.
  const carrier = JSON.parse(`{"__proto__":"${PAYLOAD}"}`);
  assert.equal(Object.prototype.hasOwnProperty.call(carrier, '__proto__'), true, 'the fixture must carry an own key');

  const snapshot = snapshotInput(carrier);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, '__proto__'), true, 'the snapshot dropped the key');
  assert.equal(Object.getOwnPropertyDescriptor(snapshot, '__proto__').value, PAYLOAD);
  assert.equal(Object.getPrototypeOf(snapshot), Object.prototype, 'the prototype must not have moved');

  const hostile = Object.assign(JSON.parse(`{"__proto__":"${PAYLOAD}"}`), agentInput());
  const result = registerAgent(createObservationStore(), hostile);
  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN');

  // The same key holding a local path, and the same key on a nested object, must hold too.
  const nested = { ...agentInput(), authority_scope: Object.assign(JSON.parse(`{"__proto__":"${PAYLOAD}"}`), {
    allowed_projects: ['proj-snapshot'], allowed_actions: ['read'],
  }) };
  assert.equal(registerAgent(createObservationStore(), nested).status, 'HOLD');
});

test('an array whose length is huge but empty holds instead of hanging', () => {
  // `[].length = 4294967294` costs nothing to build and previously bought four billion iterations
  // of the snapshot walk. The bound has to sit inside the snapshot: the list bounds downstream only
  // run once the snapshot has already returned.
  const sparse = [];
  sparse.length = 4_294_967_294;
  const started = process.hrtime.bigint();
  const result = registerAgent(createObservationStore(), agentInput({ provider_identities: sparse }));
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(result.status, 'HOLD');
  assert.equal(result.hold_code, 'INPUT_TOO_LARGE');
  assert.ok(elapsedMs < 1000, `holding took ${elapsedMs.toFixed(0)} ms`);

  const atLimit = new Array(MAX_SNAPSHOT_ITEMS).fill('x');
  assert.equal(snapshotInput(atLimit).length, MAX_SNAPSHOT_ITEMS, 'the bound itself must still be copied');
  const overLimit = new Array(MAX_SNAPSHOT_ITEMS + 1).fill('x');
  assert.equal(
    guardEntry({ a: overLimit }, ['a'], {
      unknownField: 'U', secret: 'S', localPath: 'L', tooDeep: 'D', accessor: 'A', tooLarge: 'TL', hostileInput: 'HI',
    }).hold_code,
    'TL',
  );
});

test('a hostile proxy is refused rather than thrown out of an entry point', () => {
  // A revoked proxy throws from almost every reflective operation, and a trap can throw on purpose.
  // Letting that escape would turn a refusal into a crash at every entry point.
  const { proxy, revoke } = Proxy.revocable(agentInput(), {});
  revoke();
  const revoked = registerAgent(createObservationStore(), proxy);
  assert.equal(revoked.status, 'HOLD');
  assert.equal(revoked.hold_code, 'HOSTILE_INPUT_REFUSED');

  for (const trap of ['ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf']) {
    const hostile = new Proxy(agentInput(), { [trap]() { throw new Error('trap'); } });
    const result = registerAgent(createObservationStore(), hostile);
    assert.equal(result.status, 'HOLD', trap);
    assert.equal(result.hold_code, 'HOSTILE_INPUT_REFUSED', trap);
  }

  const jobShopSide = submitJob(readyShop(), new Proxy(jobInput(), { ownKeys() { throw new Error('trap'); } }));
  assert.equal(jobShopSide.hold_code, 'HOSTILE_INPUT_REFUSED');
});

test('the two new hold codes are published by every module that can emit them', () => {
  for (const table of [OBSERVATION_HOLD_CODES, JOB_SHOP_HOLD_CODES]) {
    assert.equal(table.INPUT_TOO_LARGE, 'INPUT_TOO_LARGE');
    assert.equal(table.HOSTILE_INPUT_REFUSED, 'HOSTILE_INPUT_REFUSED');
  }
});

test('an object with more own names than the bound holds too', () => {
  // The array branch is the cheap attack, but a hostile object can also be wide. Both branches are
  // bounded, and the object bound has to be tested separately from the array one.
  const wide = {};
  for (let index = 0; index <= MAX_SNAPSHOT_ITEMS; index += 1) wide[`k${index}`] = 'v';
  assert.equal(Object.getOwnPropertyNames(wide).length, MAX_SNAPSHOT_ITEMS + 1);

  const CODES = {
    unknownField: 'U', secret: 'S', localPath: 'L', tooDeep: 'D', accessor: 'A',
    tooLarge: 'TL', hostileInput: 'HI',
  };
  assert.equal(guardEntry(wide, ['k0'], CODES).hold_code, 'TL', 'a wide object must hold before the key scan');
  assert.equal(guardEntry({ a: wide }, ['a'], CODES).hold_code, 'TL', 'a nested wide object must hold too');

  const narrow = {};
  for (let index = 0; index < MAX_SNAPSHOT_ITEMS; index += 1) narrow[`k${index}`] = 'v';
  assert.equal(Object.keys(snapshotInput(narrow)).length, MAX_SNAPSHOT_ITEMS, 'the bound itself must still be copied');
});

test('every hold code table is pinned to literal names, not to itself', () => {
  // A reviewer showed that assertions written as `assert.equal(result.hold_code, S.SOME_CODE)`
  // cannot detect a change to the table's own values: both sides move together. Pinning the table
  // once here makes any value swap fail, whatever the per-case assertions compare against.
  // Pinning the size and value-equals-key is not enough: renaming a key while keeping the table
  // the same size leaves both true, and every per-case assertion then compares undefined against
  // undefined while the store ships a hold with no code at all. The key set itself is the pin.
  const TABLES = [
    ["OBSERVATION_HOLD_CODES", OBSERVATION_HOLD_CODES, [
      "ACCESSOR_PROPERTY_FORBIDDEN", "AGENT_MEMORY_NOT_AUTHORITY_REQUIRED", "AGENT_RECORD_CONFLICT",
      "AGENT_RUN_MISMATCH", "CHILD_USAGE_MERGE_FORBIDDEN", "COST_EVIDENCE_REQUIRED",
      "DELIVERY_EDGE_CONFLICT", "EDGE_RECEIPT_NOT_DELIVERY", "HOSTILE_INPUT_REFUSED",
      "INPUT_TOO_DEEP", "INPUT_TOO_LARGE", "INVALID_FIELD_VALUE",
      "LOCAL_PATH_VALUE_FORBIDDEN", "PARENT_PROJECT_MISMATCH", "PROJECT_BINDING_MISMATCH",
      "PROVIDER_IDENTITY_CROSSWALK_CONFLICT", "PROVIDER_IDENTITY_SLOT_CONFLICT", "RAW_OR_UNKNOWN_FIELD_FORBIDDEN",
      "RECEIPT_ALREADY_EVIDENCED", "RECEIPT_RUN_MISMATCH", "RESULT_RECEIPT_CONFLICT",
      "RESULT_WITHOUT_SIDE_EFFECT_EVIDENCE", "RUN_MODEL_MISMATCH", "RUN_RECORD_CONFLICT",
      "SECRET_VALUE_FORBIDDEN", "SELF_DELIVERY_FORBIDDEN", "STRUCTURAL_EDGE_CARRIES_NO_RECEIPT",
      "STRUCTURAL_EDGE_NOT_DELIVERY", "TEMPORAL_ORDER_INVALID", "TOKEN_PARTITION_INVALID",
      "UNKNOWN_AGENT", "UNKNOWN_PARENT_RUN", "UNKNOWN_PROJECT",
      "UNKNOWN_RECEIPT", "UNKNOWN_RUN", "UNKNOWN_STORE",
      "USAGE_CONTENT_DUPLICATE", "USAGE_EVENT_CONFLICT",
    ]],
    ["JOB_SHOP_HOLD_CODES", JOB_SHOP_HOLD_CODES, [
      "ACCESSOR_PROPERTY_FORBIDDEN", "ACTION_NOT_ALLOWED", "CAPABILITY_NOT_SUPPORTED",
      "CAPACITY_EXHAUSTED", "CLOCK_RANGE_INVALID", "HEALTH_OBSERVATION_NOT_NEWER",
      "HOSTILE_INPUT_REFUSED", "HOST_RECORD_CONFLICT", "HOST_UNHEALTHY",
      "INPUT_TOO_DEEP", "INPUT_TOO_LARGE", "INVALID_FIELD_VALUE",
      "JOB_NOT_LEASED", "JOB_RECORD_CONFLICT", "JOB_RESULT_CONFLICT",
      "LEASE_FENCED_OUT", "LEASE_ID_CONFLICT", "LOCAL_PATH_VALUE_FORBIDDEN",
      "PROJECT_NOT_ALLOWED", "QUEUE_EMPTY", "RAW_OR_UNKNOWN_FIELD_FORBIDDEN",
      "RESOURCE_RECORD_CONFLICT", "RESOURCE_UNHEALTHY", "SECRET_VALUE_FORBIDDEN",
      "SUBMISSION_SEQUENCE_NOT_MONOTONIC", "UNKNOWN_HOST", "UNKNOWN_JOB",
      "UNKNOWN_LEASE", "UNKNOWN_RESOURCE", "UNKNOWN_SHOP",
    ]],
    ["VERTICAL_HOLD_CODES", VERTICAL_HOLD_CODES, [
      "ACCESSOR_PROPERTY_FORBIDDEN", "HOSTILE_INPUT_REFUSED", "INPUT_TOO_DEEP",
      "INPUT_TOO_LARGE", "INVALID_FIELD_VALUE", "LOCAL_PATH_VALUE_FORBIDDEN",
      "RAW_OR_UNKNOWN_FIELD_FORBIDDEN", "SECRET_VALUE_FORBIDDEN", "UNSAFE_DISPLAY_LABEL",
    ]],
    ["P0S2_HOLD_CODES", P0S2_HOLD_CODES, [
      "ACCESSOR_PROPERTY_FORBIDDEN", "CAPSULE_EXPIRED", "CAPSULE_NOT_A_CACHE",
      "CAPSULE_PROJECT_MISMATCH", "CAPSULE_WORK_UNIT_MISMATCH", "DUPLICATE_DELIVERY_RECEIPT_ID",
      "DUPLICATE_PROJECT_ID", "DUPLICATE_PROJECT_IDENTIFIER", "HOSTILE_INPUT_REFUSED",
      "INPUT_TOO_DEEP", "INPUT_TOO_LARGE", "INVALID_FIELD_VALUE",
      "LOCAL_PATH_VALUE_FORBIDDEN", "PROJECT_COUNT_INVALID", "RAW_OR_UNKNOWN_FIELD_FORBIDDEN",
      "SECRET_VALUE_FORBIDDEN", "UNSAFE_DISPLAY_LABEL",
    ]],
    ["BRIDGE_HOLD_CODES", BRIDGE_HOLD_CODES, [
      "ACCESSOR_PROPERTY_FORBIDDEN", "COST_BASIS_NOT_PROJECTABLE", "HOSTILE_INPUT_REFUSED",
      "INPUT_TOO_DEEP", "INPUT_TOO_LARGE", "INVALID_BINDING_FIELD",
      "LOCAL_PATH_VALUE_FORBIDDEN", "METER_VALIDATION_REJECTED", "PROVIDER_NOT_METER_SOURCE_KIND",
      "PROVIDER_THREAD_IDENTITY_MISSING", "RAW_OR_UNKNOWN_FIELD_FORBIDDEN", "RUN_LINEAGE_TOO_DEEP",
      "RUN_TIME_INVALID", "SECRET_VALUE_FORBIDDEN", "UNKNOWN_AGENT",
      "UNKNOWN_RUN", "UNKNOWN_STORE", "UNKNOWN_USAGE_EVENT",
    ]],
    ["BOARD_HEALTH_HOLD_CODES", BOARD_HEALTH_HOLD_CODES, [
      "UNKNOWN_STORE",
    ]],
    ["RESULT_GATE_PREPARATION_HOLD_CODES", RESULT_GATE_PREPARATION_HOLD_CODES, [
      "AGENT_RUN_MISMATCH", "BOARD_APPEND_REJECTED", "BOARD_STATE_NOT_ACTIVATED",
      "PROVIDER_THREAD_IDENTITY_MISSING", "REGISTRY_NOT_ISOLATED", "RESULT_EVIDENCE_MISSING",
      "RESULT_NOT_OBSERVED", "UNKNOWN_AGENT", "UNKNOWN_RUN",
      "UNKNOWN_STORE",
    ]],
  ];
  for (const [name, table, keys] of TABLES) {
    assert.deepEqual(Object.keys(table).sort(), keys, `${name} key set changed`);
    assert.equal(Object.isFrozen(table), true, `${name} must be frozen`);
    for (const [key, value] of Object.entries(table)) {
      assert.equal(value, key, `${name}.${key} must equal its own name`);
      assert.match(key, /^[A-Z][A-Z0-9_]*$/u, `${name}.${key} is not a screaming-snake code`);
    }
  }

  // The scan bounds are contract, not tuning: a mutant that widens them has to fail somewhere.
  assert.equal(MAX_SCAN_DEPTH, 12);
  assert.equal(MAX_SNAPSHOT_ITEMS, 4096);
});
