import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HOST_RECORD_SCHEMA,
  RESOURCE_RECORD_SCHEMA,
  JOB_RECORD_SCHEMA,
  LEASE_RECORD_SCHEMA,
  QUEUE_PRIORITIES,
  JOB_SHOP_HOLD_CODES,
  createJobShop,
  registerHost,
  registerResource,
  observeResourceHealth,
  submitJob,
  acquireLease,
  completeJob,
  releaseLease,
  projectJobShop,
} from './resource_job_shop.mjs';

// Built from parts so the repository stores no literal local absolute path.
const fileUri = (...parts) => ['file:', '', '', ...parts].join('/');

const C = JOB_SHOP_HOLD_CODES;
const T0 = 1_000_000;

const hostInput = (over = {}) => ({
  host_id: 'PC-01',
  health: 'ok',
  capability_kinds: ['spreadsheet'],
  observed_at_ms: T0,
  ...over,
});

const resourceInput = (over = {}) => ({
  resource_id: 'res-spreadsheet-01',
  host_id: 'PC-01',
  tool_kind: 'spreadsheet',
  capacity: 1,
  health: 'ok',
  allowed_projects: ['proj-synthetic-alpha', 'proj-synthetic-beta', 'proj-synthetic-gamma'],
  allowed_actions: ['produce_workbook'],
  observed_at_ms: T0,
  ...over,
});

const jobInput = (over = {}) => ({
  job_id: 'job-synthetic-0001',
  resource_id: 'res-spreadsheet-01',
  priority: 'normal',
  project_id: 'proj-synthetic-alpha',
  agent_id: 'agent.kvds.spreadsheet_requester.v1',
  run_id: 'run-synthetic-0001',
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

const lease = (shop, id, nowMs, ttlMs = 60_000, resourceId = 'res-spreadsheet-01') => acquireLease(shop, {
  resource_id: resourceId, lease_id: id, now_ms: nowMs, ttl_ms: ttlMs,
});

// ------------------------------------------------------------------------- contract surface

test('schema versions and the three-tier queue are pinned', () => {
  assert.equal(HOST_RECORD_SCHEMA, 'soulforge.agent_observation.host_record.v1');
  assert.equal(RESOURCE_RECORD_SCHEMA, 'soulforge.agent_observation.resource_record.v1');
  assert.equal(JOB_RECORD_SCHEMA, 'soulforge.agent_observation.job_record.v1');
  // The lease schema was the one of the four that no test pinned, so its version string could
  // change without anything failing even though a lease record is what crosses to a worker.
  assert.equal(LEASE_RECORD_SCHEMA, 'soulforge.agent_observation.lease_record.v1');
  assert.deepEqual(QUEUE_PRIORITIES, ['urgent', 'high', 'normal']);

  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
  const granted = acquireLease(shop, {
    resource_id: 'res-spreadsheet-01', lease_id: 'lease-schema-0001', now_ms: T0, ttl_ms: 60_000,
  });
  assert.equal(granted.status, 'GRANTED');
  assert.equal(granted.lease.schema_version, LEASE_RECORD_SCHEMA, 'the handed-out lease must carry it');
});

test('the job shop projection is guarded the same way the write entry points are', () => {
  // This projection used to check its options with a bare key allowlist on the raw argument. The
  // one allowed key must pass isClock, so no string payload could land in a record - but the
  // surface still differed: a hostile Proxy threw instead of holding, and a non-enumerable own key
  // was invisible to Object.keys.
  const shop = readyShop();
  assert.equal(projectJobShop(shop, { unexpected: 1 }).hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);

  const hidden = Object.defineProperty({ now_ms: T0 }, 'smuggled', {
    value: 'sk-abcdefgh12345678', enumerable: false, configurable: true,
  });
  assert.equal(projectJobShop(shop, hidden).hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);

  const throwing = new Proxy({ now_ms: T0 }, { ownKeys() { throw new Error('trap'); } });
  const trapped = projectJobShop(shop, throwing);
  assert.equal(trapped.status, 'HOLD');
  assert.equal(trapped.hold_code, C.HOSTILE_INPUT_REFUSED, 'a hostile proxy must hold, not throw');

  let reads = 0;
  const accessor = Object.defineProperty({}, 'now_ms', {
    enumerable: true, configurable: true, get() { reads += 1; return T0; },
  });
  assert.equal(projectJobShop(shop, accessor).hold_code, C.ACCESSOR_PROPERTY_FORBIDDEN);
  assert.equal(reads, 0);

  // The honest path still works and still reads the clock it was given.
  assert.equal(projectJobShop(shop, { now_ms: T0 }).status, 'PROJECTED');
  assert.equal(projectJobShop(shop, {}).hosts.length, 1);
});

test('the job shop state is not reachable from the shop handle', () => {
  const shop = readyShop();
  assert.deepEqual(Object.keys(shop), ['kind']);
  assert.equal(shop.jobs, undefined);
  assert.equal(shop.leases, undefined);
  const foreign = Object.freeze({ kind: 'soulforge.agent_observation.job_shop.v1' });
  assert.equal(submitJob(foreign, jobInput()).hold_code, C.UNKNOWN_SHOP);
  assert.equal(projectJobShop(foreign).hold_code, C.UNKNOWN_SHOP);
});

test('host and resource identity, capacity and capability stay separate fields', () => {
  const shop = readyShop();
  const view = projectJobShop(shop);
  assert.equal(view.hosts.length, 1);
  assert.equal(view.resources.length, 1);
  const resource = view.resources[0];
  assert.equal(resource.resource_id, 'res-spreadsheet-01');
  assert.equal(resource.host_id, 'PC-01');
  assert.equal(resource.tool_kind, 'spreadsheet');
  assert.equal(resource.capacity, 1);
  assert.equal(resource.active_leases, 0);
});

test('unknown keys, secrets and local paths are refused at every job shop entry point', () => {
  const shop = readyShop();
  assert.equal(registerHost(shop, hostInput({ transcript: 'x' })).hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  assert.equal(registerResource(shop, resourceInput({ allowed_actions: ['sk-abcdefgh12345678'] })).hold_code, C.SECRET_VALUE_FORBIDDEN);
  assert.equal(submitJob(shop, jobInput({ cwd: 'x' })).hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
  assert.equal(lease(shop, 'lease-1', T0).status, 'GRANTED');
  const pathy = completeJob(shop, {
    lease_id: 'lease-1', job_id: 'job-synthetic-0001',
    result_ref: fileUri('C:', 'Users', 'user', 'OneDrive', 'secret.xlsx'), now_ms: T0 + 1,
  });
  assert.equal(pathy.hold_code, C.LOCAL_PATH_VALUE_FORBIDDEN);
  assert.equal(projectJobShop(shop).recorded_completion_count, 0);
});

// -------------------------------------------------------------------- registration and health

test('a resource on an unregistered host is refused', () => {
  const shop = createJobShop();
  const result = registerResource(shop, resourceInput());
  assert.equal(result.hold_code, C.UNKNOWN_HOST);
});

test('a resource whose tool kind the host cannot serve is refused', () => {
  const shop = createJobShop();
  assert.equal(registerHost(shop, hostInput({ capability_kinds: ['pdf'] })).status, 'REGISTERED');
  assert.equal(registerResource(shop, resourceInput()).hold_code, C.CAPABILITY_NOT_SUPPORTED);
});

test('capacity is bounded and enum fields are validated', () => {
  const shop = createJobShop();
  assert.equal(registerHost(shop, hostInput()).status, 'REGISTERED');
  assert.equal(registerResource(shop, resourceInput({ capacity: 0 })).hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(registerResource(shop, resourceInput({ capacity: 65 })).hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(registerResource(shop, resourceInput({ health: 'made_up' })).hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(registerHost(shop, hostInput({ health: 'made_up', observed_at_ms: T0 + 1 })).hold_code, C.INVALID_FIELD_VALUE);
});

test('host re-registration replays, advances health only on a strictly newer observation, and fails closed on identity', () => {
  const shop = createJobShop();
  assert.equal(registerHost(shop, hostInput()).status, 'REGISTERED');
  assert.equal(registerHost(shop, hostInput()).status, 'NO_OP');
  assert.equal(registerHost(shop, hostInput({ health: 'degraded', observed_at_ms: T0 + 10 })).status, 'UPDATED');
  assert.equal(projectJobShop(shop).hosts[0].health, 'degraded');
  assert.equal(registerHost(shop, hostInput({ health: 'degraded', observed_at_ms: T0 + 11 })).status, 'NO_OP',
    'a newer clock with unchanged health is a replay, not a health update');

  // A stale observation and an identity conflict are different refusals and must not share a code.
  const stale = registerHost(shop, hostInput({ health: 'ok', observed_at_ms: T0 + 10 }));
  assert.equal(stale.hold_code, C.HEALTH_OBSERVATION_NOT_NEWER);
  assert.equal(stale.detail, 'host');
  assert.equal(registerHost(shop, hostInput({ observed_at_ms: T0 - 1 })).hold_code, C.HEALTH_OBSERVATION_NOT_NEWER);
  const identity = registerHost(shop, hostInput({ capability_kinds: ['pdf'], observed_at_ms: T0 + 20 }));
  assert.equal(identity.hold_code, C.HOST_RECORD_CONFLICT);
  assert.equal(identity.detail, 'identity');
  assert.equal(projectJobShop(shop).hosts[0].health, 'degraded');
});

test('a stale observation reports one code whichever record kind it arrives at', () => {
  // The host path used to answer this with HOST_RECORD_CONFLICT while both resource paths answered
  // with HEALTH_OBSERVATION_NOT_NEWER, so a caller handling a stale collector reading had to
  // special-case the record kind for a refusal that means exactly the same thing.
  const shop = readyShop();
  assert.equal(
    registerHost(shop, hostInput({ health: 'degraded', observed_at_ms: T0 - 1 })).hold_code,
    C.HEALTH_OBSERVATION_NOT_NEWER,
  );
  assert.equal(
    registerResource(shop, resourceInput({ observed_at_ms: T0 - 1 })).hold_code,
    C.HEALTH_OBSERVATION_NOT_NEWER,
  );
  assert.equal(
    observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'degraded', observed_at_ms: T0 }).hold_code,
    C.HEALTH_OBSERVATION_NOT_NEWER,
  );
});

test('resource configuration is immutable but health moves through its own observation call', () => {
  const shop = readyShop();
  assert.equal(registerResource(shop, resourceInput()).status, 'NO_OP');
  assert.equal(registerResource(shop, resourceInput({ capacity: 4 })).hold_code, C.RESOURCE_RECORD_CONFLICT);
  assert.equal(projectJobShop(shop).resources[0].capacity, 1);

  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'ok', observed_at_ms: T0 + 1 }).status, 'NO_OP');
  assert.equal(observeResourceHealth(shop, { resource_id: 'res-nope', health: 'down', observed_at_ms: T0 + 1 }).hold_code, C.UNKNOWN_RESOURCE);
  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'down', observed_at_ms: T0 + 2 }).status, 'UPDATED');
  assert.equal(projectJobShop(shop).resources[0].health, 'down');
});

test('an unhealthy resource or an unhealthy host stops dispatch', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'degraded', observed_at_ms: T0 + 1 }).status, 'UPDATED');
  assert.equal(lease(shop, 'lease-1', T0).hold_code, C.RESOURCE_UNHEALTHY);

  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'ok', observed_at_ms: T0 + 2 }).status, 'UPDATED');
  assert.equal(registerHost(shop, hostInput({ health: 'down', observed_at_ms: T0 + 5 })).status, 'UPDATED');
  assert.equal(lease(shop, 'lease-2', T0 + 6).hold_code, C.HOST_UNHEALTHY);
  assert.equal(projectJobShop(shop).queue_depth, 1);
});

// -------------------------------------------------------------------------- queue and leases

test('a job outside the resource project or action allowlist is refused', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput({ project_id: 'proj-not-allowed' })).hold_code, C.PROJECT_NOT_ALLOWED);
  assert.equal(submitJob(shop, jobInput({ job_id: 'job-synthetic-0002', action: 'delete_workbook' })).hold_code, C.ACTION_NOT_ALLOWED);
  assert.equal(submitJob(shop, jobInput({ resource_id: 'res-nope' })).hold_code, C.UNKNOWN_RESOURCE);
  assert.equal(submitJob(shop, jobInput({ priority: 'made_up' })).hold_code, C.INVALID_FIELD_VALUE);
});

test('the controller owns FIFO: a replayed or backdated sequence cannot preempt the queue', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput({ job_id: 'n1', submitted_seq: 5 })).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput({ job_id: 'n2', submitted_seq: 6 })).status, 'QUEUED');
  const jumper = submitJob(shop, jobInput({ job_id: 'late-jumper', submitted_seq: 0 }));
  assert.equal(jumper.hold_code, C.SUBMISSION_SEQUENCE_NOT_MONOTONIC);
  assert.equal(submitJob(shop, jobInput({ job_id: 'dup-seq', submitted_seq: 6 })).hold_code, C.SUBMISSION_SEQUENCE_NOT_MONOTONIC);
  assert.equal(projectJobShop(shop).queue_depth, 2);
});

test('resubmitting the same job is idempotent and a changed payload conflicts', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput()).status, 'NO_OP');
  assert.equal(submitJob(shop, jobInput({ priority: 'urgent' })).hold_code, C.JOB_RECORD_CONFLICT);
  assert.equal(projectJobShop(shop).queue_depth, 1);
});

test('capacity 1 grants a single lease and the second acquire is capacity exhausted', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput({ job_id: 'job-synthetic-0002', submitted_seq: 2 })).status, 'QUEUED');

  const first = lease(shop, 'lease-1', T0);
  assert.equal(first.status, 'GRANTED');
  assert.equal(first.job_id, 'job-synthetic-0001');

  const second = lease(shop, 'lease-2', T0 + 1);
  assert.equal(second.hold_code, C.CAPACITY_EXHAUSTED);
  assert.equal(projectJobShop(shop).resources[0].active_leases, 1);
});

test('a reused lease id is refused and an out-of-range clock is refused', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
  assert.equal(lease(shop, 'lease-1', T0).status, 'GRANTED');
  assert.equal(lease(shop, 'lease-1', T0 + 1).hold_code, C.LEASE_ID_CONFLICT);
  assert.equal(acquireLease(shop, {
    resource_id: 'res-spreadsheet-01', lease_id: 'lease-huge',
    now_ms: Number.MAX_SAFE_INTEGER, ttl_ms: 1,
  }).hold_code, C.INVALID_FIELD_VALUE);
  assert.equal(acquireLease(shop, {
    resource_id: 'res-spreadsheet-01', lease_id: 'lease-overflow',
    now_ms: 1, ttl_ms: Number.MAX_SAFE_INTEGER,
  }).hold_code, C.CLOCK_RANGE_INVALID);
});

test('dispatch order is urgent then high then normal', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput({ job_id: 'n1', priority: 'normal', submitted_seq: 1 })).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput({ job_id: 'n2', priority: 'normal', submitted_seq: 2 })).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput({ job_id: 'h1', priority: 'high', submitted_seq: 3 })).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput({ job_id: 'u1', priority: 'urgent', submitted_seq: 4 })).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput({ job_id: 'h2', priority: 'high', submitted_seq: 5 })).status, 'QUEUED');

  const order = [];
  for (let i = 0; i < 5; i += 1) {
    const granted = lease(shop, `lease-${i}`, T0 + i);
    assert.equal(granted.status, 'GRANTED');
    order.push(granted.job_id);
    assert.equal(completeJob(shop, {
      lease_id: `lease-${i}`, job_id: granted.job_id,
      result_ref: `artifact://synthetic/${granted.job_id}`, now_ms: T0 + i + 1,
    }).status, 'COMPLETED');
  }
  assert.deepEqual(order, ['u1', 'h1', 'h2', 'n1', 'n2']);
});

test('a queued low-priority job runs once a finite higher-priority batch drains', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput({ job_id: 'n1', priority: 'normal', submitted_seq: 1 })).status, 'QUEUED');
  for (let i = 0; i < 3; i += 1) {
    assert.equal(submitJob(shop, jobInput({ job_id: `u${i}`, priority: 'urgent', submitted_seq: 10 + i })).status, 'QUEUED');
  }
  const drained = [];
  for (let i = 0; i < 4; i += 1) {
    const granted = lease(shop, `lease-${i}`, T0 + i);
    drained.push(granted.job_id);
    completeJob(shop, { lease_id: `lease-${i}`, job_id: granted.job_id, result_ref: `artifact://synthetic/${granted.job_id}`, now_ms: T0 + i + 1 });
  }
  assert.equal(drained.at(-1), 'n1');
  assert.equal(projectJobShop(shop).queue_depth, 0);
});

test('strict priority has no aging, so sustained urgent arrivals starve a normal job by design', () => {
  // This is the accepted v1 behaviour, not an accident: an aging or optimizing scheduler is
  // deliberately out of scope until real processing-time data exists. The test pins the
  // trade-off so it cannot be silently claimed as starvation-free.
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput({ job_id: 'normal-old', priority: 'normal', submitted_seq: 1 })).status, 'QUEUED');
  const served = [];
  for (let i = 0; i < 6; i += 1) {
    assert.equal(submitJob(shop, jobInput({ job_id: `u${i}`, priority: 'urgent', submitted_seq: 100 + i })).status, 'QUEUED');
    const granted = lease(shop, `lease-${i}`, T0 + i);
    served.push(granted.job_id);
    completeJob(shop, { lease_id: `lease-${i}`, job_id: granted.job_id, result_ref: `artifact://synthetic/${granted.job_id}`, now_ms: T0 + i + 1 });
  }
  assert.deepEqual(served, ['u0', 'u1', 'u2', 'u3', 'u4', 'u5']);
  assert.equal(projectJobShop(shop).queue_depth, 1, 'normal-old is still waiting');
});

test('two resources on one host keep their own queue and their own capacity', () => {
  const shop = createJobShop();
  assert.equal(registerHost(shop, hostInput({ capability_kinds: ['spreadsheet', 'pdf'] })).status, 'REGISTERED');
  assert.equal(registerResource(shop, resourceInput()).status, 'REGISTERED');
  assert.equal(registerResource(shop, resourceInput({ resource_id: 'res-pdf-01', tool_kind: 'pdf', allowed_actions: ['produce_pdf'] })).status, 'REGISTERED');

  // The pdf job carries a lower sequence than the spreadsheet job, so a dispatcher that ignored
  // the resource filter would pick it first and this test would fail.
  assert.equal(submitJob(shop, jobInput({ job_id: 'sheet-1', submitted_seq: 50 })).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput({ job_id: 'pdf-1', resource_id: 'res-pdf-01', action: 'produce_pdf', submitted_seq: 1 })).status, 'QUEUED');

  const sheetLease = lease(shop, 'lease-sheet', T0);
  assert.equal(sheetLease.job_id, 'sheet-1', 'a spreadsheet lease must never pick up the pdf queue');
  const pdfLease = lease(shop, 'lease-pdf', T0, 60_000, 'res-pdf-01');
  assert.equal(pdfLease.status, 'GRANTED', 'a busy spreadsheet resource must not exhaust pdf capacity');
  assert.equal(pdfLease.job_id, 'pdf-1');

  const view = projectJobShop(shop);
  assert.equal(view.resources.find((r) => r.resource_id === 'res-spreadsheet-01').active_leases, 1);
  assert.equal(view.resources.find((r) => r.resource_id === 'res-pdf-01').active_leases, 1);
});

// --------------------------------------------------------------------- completion and fencing

test('completing a job twice with the same result is idempotent and records one completion', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  assert.equal(lease(shop, 'lease-1', T0).status, 'GRANTED');
  const done = { lease_id: 'lease-1', job_id: 'job-synthetic-0001', result_ref: 'artifact://synthetic/workbook-0001', now_ms: T0 + 5 };
  assert.equal(completeJob(shop, done).status, 'COMPLETED');
  assert.equal(completeJob(shop, done).status, 'NO_OP');
  const view = projectJobShop(shop);
  assert.equal(view.recorded_completion_count, 1);
  assert.equal(view.duplicate_completion_hold_count, 0);
});

test('a conflicting completion of the same job is HOLD and is counted', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  lease(shop, 'lease-1', T0);
  assert.equal(completeJob(shop, { lease_id: 'lease-1', job_id: 'job-synthetic-0001', result_ref: 'artifact://synthetic/a', now_ms: T0 + 5 }).status, 'COMPLETED');
  const conflict = completeJob(shop, { lease_id: 'lease-1', job_id: 'job-synthetic-0001', result_ref: 'artifact://synthetic/b', now_ms: T0 + 6 });
  assert.equal(conflict.hold_code, C.JOB_RESULT_CONFLICT);
  const view = projectJobShop(shop);
  assert.equal(view.recorded_completion_count, 1);
  assert.equal(view.duplicate_completion_hold_count, 1);
});

test('a completion whose lease does not own the job is refused', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput({ job_id: 'job-a' })).status, 'QUEUED');
  assert.equal(submitJob(shop, jobInput({ job_id: 'job-b', submitted_seq: 2 })).status, 'QUEUED');
  assert.equal(lease(shop, 'lease-1', T0).job_id, 'job-a');
  assert.equal(completeJob(shop, { lease_id: 'lease-1', job_id: 'job-b', result_ref: 'artifact://synthetic/x', now_ms: T0 + 1 }).hold_code, C.JOB_NOT_LEASED);
  assert.equal(completeJob(shop, { lease_id: 'lease-nope', job_id: 'job-a', result_ref: 'artifact://synthetic/x', now_ms: T0 + 1 }).hold_code, C.UNKNOWN_LEASE);
  assert.equal(completeJob(shop, { lease_id: 'lease-1', job_id: 'job-nope', result_ref: 'artifact://synthetic/x', now_ms: T0 + 1 }).hold_code, C.UNKNOWN_JOB);
  assert.equal(projectJobShop(shop).recorded_completion_count, 0);
});

test('an expired lease is fenced out and the fenced attempt is counted', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  const first = lease(shop, 'lease-1', T0, 1_000);
  assert.equal(first.status, 'GRANTED');
  assert.equal(first.lease.fencing_epoch, 1);

  const reclaim = lease(shop, 'lease-2', T0 + 2_000);
  assert.equal(reclaim.status, 'GRANTED');
  assert.equal(reclaim.job_id, 'job-synthetic-0001');
  assert.equal(reclaim.lease.fencing_epoch, 2);

  const stale = completeJob(shop, { lease_id: 'lease-1', job_id: 'job-synthetic-0001', result_ref: 'artifact://synthetic/stale', now_ms: T0 + 2_100 });
  assert.equal(stale.hold_code, C.LEASE_FENCED_OUT);

  assert.equal(completeJob(shop, { lease_id: 'lease-2', job_id: 'job-synthetic-0001', result_ref: 'artifact://synthetic/fresh', now_ms: T0 + 2_200 }).status, 'COMPLETED');
  const view = projectJobShop(shop);
  assert.equal(view.recorded_completion_count, 1);
  assert.equal(view.fenced_completion_attempt_count, 1, 'the stale worker attempt is recorded, not silently dropped');
});

test('a zombie lease cannot re-record an already completed job', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  assert.equal(lease(shop, 'lease-1', T0, 1_000).status, 'GRANTED');
  const reclaim = lease(shop, 'lease-2', T0 + 2_000);
  assert.equal(reclaim.status, 'GRANTED');
  assert.equal(completeJob(shop, {
    lease_id: 'lease-2', job_id: 'job-synthetic-0001',
    result_ref: 'artifact://synthetic/fresh', now_ms: T0 + 2_100,
  }).status, 'COMPLETED');

  // The crashed worker wakes up and writes the same result, then a different one. Both are the
  // wrong epoch, so both are fenced rather than replayed or reported as a result conflict.
  const same = completeJob(shop, {
    lease_id: 'lease-1', job_id: 'job-synthetic-0001',
    result_ref: 'artifact://synthetic/fresh', now_ms: T0 + 2_200,
  });
  assert.equal(same.hold_code, C.LEASE_FENCED_OUT);
  const different = completeJob(shop, {
    lease_id: 'lease-1', job_id: 'job-synthetic-0001',
    result_ref: 'artifact://synthetic/zombie', now_ms: T0 + 2_300,
  });
  assert.equal(different.hold_code, C.LEASE_FENCED_OUT);

  const view = projectJobShop(shop);
  assert.equal(view.recorded_completion_count, 1);
  assert.equal(view.duplicate_completion_hold_count, 0, 'a fenced write is not a result conflict');
  assert.ok(view.fenced_completion_attempt_count >= 2);
});

test('the job ledger rows expose the identity a consumer needs', () => {
  const shop = readyShop();
  submitJob(shop, jobInput({ job_id: 'job-a', priority: 'high', submitted_seq: 1 }));
  submitJob(shop, jobInput({ job_id: 'job-b', priority: 'normal', submitted_seq: 2 }));
  const granted = lease(shop, 'lease-1', T0);
  completeJob(shop, { lease_id: 'lease-1', job_id: granted.job_id, result_ref: 'artifact://synthetic/a', now_ms: T0 + 1 });

  const rows = projectJobShop(shop).jobs;
  assert.equal(rows.length, 2);
  const done = rows.find((row) => row.job_id === 'job-a');
  assert.equal(done.project_id, 'proj-synthetic-alpha');
  assert.equal(done.resource_id, 'res-spreadsheet-01');
  assert.equal(done.priority, 'high');
  assert.equal(done.state, 'completed');
  assert.equal(done.result_ref, 'artifact://synthetic/a');
  assert.equal(done.recorded_completions, 1);

  const queued = rows.find((row) => row.job_id === 'job-b');
  assert.equal(queued.state, 'queued');
  assert.equal(queued.result_ref, null);
  assert.equal(queued.recorded_completions, 0);
  assert.equal(Object.isFrozen(queued), true);
});

test('a released lease cannot later record a completion', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  assert.equal(lease(shop, 'lease-1', T0).status, 'GRANTED');
  assert.equal(releaseLease(shop, { lease_id: 'lease-1' }).status, 'RELEASED');
  const late = completeJob(shop, { lease_id: 'lease-1', job_id: 'job-synthetic-0001', result_ref: 'artifact://synthetic/late', now_ms: T0 + 10 });
  assert.equal(late.hold_code, C.LEASE_FENCED_OUT);
  assert.equal(projectJobShop(shop).recorded_completion_count, 0);
});

test('releasing a lease frees capacity without recording a completion', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  lease(shop, 'lease-1', T0);
  assert.equal(releaseLease(shop, { lease_id: 'lease-1' }).status, 'RELEASED');
  assert.equal(releaseLease(shop, { lease_id: 'lease-1' }).status, 'NO_OP');
  assert.equal(releaseLease(shop, { lease_id: 'lease-nope' }).hold_code, C.UNKNOWN_LEASE);
  assert.equal(projectJobShop(shop).resources[0].active_leases, 0);
  assert.equal(projectJobShop(shop).recorded_completion_count, 0);
  const again = lease(shop, 'lease-3', T0 + 10);
  assert.equal(again.job_id, 'job-synthetic-0001');
});

test('the projection can be read against a clock so a time-expired lease is not shown as active', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  assert.equal(lease(shop, 'lease-1', T0, 1_000).status, 'GRANTED');
  assert.equal(projectJobShop(shop).resources[0].active_leases, 1);
  assert.equal(projectJobShop(shop, { now_ms: T0 + 500 }).resources[0].active_leases, 1);
  assert.equal(projectJobShop(shop, { now_ms: T0 + 5_000 }).resources[0].active_leases, 0);
  assert.equal(projectJobShop(shop, { unexpected: 1 }).hold_code, C.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
});

test('an empty queue grants nothing instead of inventing work', () => {
  const shop = readyShop();
  assert.equal(lease(shop, 'lease-1', T0).hold_code, C.QUEUE_EMPTY);
  assert.equal(acquireLease(shop, { resource_id: 'res-nope', lease_id: 'lease-2', now_ms: T0, ttl_ms: 1 }).hold_code, C.UNKNOWN_RESOURCE);
});

test('a stale or same-instant resource health observation cannot re-enable dispatch', () => {
  const shop = readyShop();
  assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'down', observed_at_ms: T0 + 10 }).status, 'UPDATED');

  const stale = observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'ok', observed_at_ms: 5 });
  assert.equal(stale.hold_code, C.HEALTH_OBSERVATION_NOT_NEWER);
  const sameInstant = observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'ok', observed_at_ms: T0 + 10 });
  assert.equal(sameInstant.hold_code, C.HEALTH_OBSERVATION_NOT_NEWER);

  assert.equal(projectJobShop(shop).resources[0].health, 'down');
  assert.equal(lease(shop, 'lease-1', T0).hold_code, C.RESOURCE_UNHEALTHY);

  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'ok', observed_at_ms: T0 + 11 }).status, 'UPDATED');
  assert.equal(lease(shop, 'lease-2', T0).status, 'GRANTED');
});

test('a lease past its TTL cannot record a completion even when nobody re-acquires', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  assert.equal(lease(shop, 'lease-1', T0, 1_000).status, 'GRANTED');
  const late = completeJob(shop, {
    lease_id: 'lease-1', job_id: 'job-synthetic-0001',
    result_ref: 'artifact://synthetic/zombie', now_ms: T0 + 999_999,
  });
  assert.equal(late.hold_code, C.LEASE_FENCED_OUT);
  const view = projectJobShop(shop);
  assert.equal(view.recorded_completion_count, 0);
  assert.equal(view.fenced_completion_attempt_count, 1);
  assert.equal(view.queue_depth, 1, 'the job returns to the queue rather than staying invisible');
});

test('a completion exactly at the expiry instant is refused', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  assert.equal(lease(shop, 'lease-1', T0, 1_000).status, 'GRANTED');
  assert.equal(completeJob(shop, {
    lease_id: 'lease-1', job_id: 'job-synthetic-0001',
    result_ref: 'artifact://synthetic/x', now_ms: T0 + 1_000,
  }).hold_code, C.LEASE_FENCED_OUT);
});

test('a clock-aware projection never hides outstanding work', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  assert.equal(lease(shop, 'lease-1', T0, 1_000).status, 'GRANTED');

  const live = projectJobShop(shop, { now_ms: T0 + 500 });
  assert.equal(live.resources[0].active_leases, 1);
  assert.equal(live.queue_depth, 0);
  assert.equal(live.leased_count, 1);

  const afterTtl = projectJobShop(shop, { now_ms: T0 + 999_999 });
  assert.equal(afterTtl.resources[0].active_leases, 0);
  assert.equal(afterTtl.queue_depth, 1, 'a reclaimable job is outstanding work, not an idle shop');
  assert.equal(afterTtl.leased_count, 0);
  assert.equal(afterTtl.recorded_completion_count, 0);
});

test('a resource registered unhealthy cannot be re-opened by an older health report', () => {
  const shop = createJobShop();
  assert.equal(registerHost(shop, hostInput()).status, 'REGISTERED');
  assert.equal(registerResource(shop, resourceInput({ health: 'down', observed_at_ms: T0 })).status, 'REGISTERED');
  assert.equal(submitJob(shop, jobInput()).status, 'QUEUED');
  assert.equal(lease(shop, 'lease-0', T0).hold_code, C.RESOURCE_UNHEALTHY);

  // Registration is itself the first health observation, so there is no null baseline for a stale
  // report to slip past.
  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'ok', observed_at_ms: 1 }).hold_code, C.HEALTH_OBSERVATION_NOT_NEWER);
  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'ok', observed_at_ms: T0 }).hold_code, C.HEALTH_OBSERVATION_NOT_NEWER);
  assert.equal(projectJobShop(shop).resources[0].health, 'down');
  assert.equal(lease(shop, 'lease-1', T0).hold_code, C.RESOURCE_UNHEALTHY);

  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'ok', observed_at_ms: T0 + 1 }).status, 'UPDATED');
  assert.equal(lease(shop, 'lease-2', T0).status, 'GRANTED');
});

test('registering a resource without a health observation clock is refused', () => {
  const shop = createJobShop();
  assert.equal(registerHost(shop, hostInput()).status, 'REGISTERED');
  const { observed_at_ms: _dropped, ...withoutClock } = resourceInput();
  assert.equal(registerResource(shop, withoutClock).hold_code, C.INVALID_FIELD_VALUE);
});

test('re-registering a resource compares the clock the record actually stores', () => {
  const shop = readyShop();
  assert.equal(registerResource(shop, resourceInput()).status, 'NO_OP');

  // Stale repeat: identical config at an older clock must not pass as idempotent.
  const stale = registerResource(shop, resourceInput({ observed_at_ms: 1 }));
  assert.equal(stale.status, 'HOLD');
  assert.equal(stale.hold_code, C.HEALTH_OBSERVATION_NOT_NEWER);

  // Newer clock with identical config only advances the health observation.
  assert.equal(registerResource(shop, resourceInput({ observed_at_ms: T0 + 50 })).status, 'NO_OP');
  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'down', observed_at_ms: T0 + 20 }).hold_code, C.HEALTH_OBSERVATION_NOT_NEWER);
  assert.equal(observeResourceHealth(shop, { resource_id: 'res-spreadsheet-01', health: 'down', observed_at_ms: T0 + 51 }).status, 'UPDATED');
});

test('a granted lease is handed out as a frozen copy of internal state', () => {
  const shop = readyShop();
  submitJob(shop, jobInput());
  const granted = lease(shop, 'lease-1', T0, 1_000);
  assert.equal(granted.status, 'GRANTED');
  assert.equal(Object.isFrozen(granted.lease), true);
  assert.throws(() => { granted.lease.expires_at_ms = T0 + 9_000_000; }, TypeError);
  assert.throws(() => { granted.lease.state = 'released'; }, TypeError);

  // The internal lease is untouched, so the TTL guard still fires.
  assert.equal(completeJob(shop, {
    lease_id: 'lease-1', job_id: 'job-synthetic-0001',
    result_ref: 'artifact://synthetic/x', now_ms: T0 + 5_000,
  }).hold_code, C.LEASE_FENCED_OUT);
});

test('the job shop module opens no external effect surface', () => {
  const source = readFileSync(new URL('./resource_job_shop.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('\u0000'), false, 'must stay plain text for grep-based validators');
  for (const forbidden of [
    'node:fs', 'node:net', 'node:http', 'node:https', 'node:child_process', 'node:dgram',
    'node:worker_threads', 'node:cluster', 'node:v8', 'node:vm',
  ]) {
    assert.equal(source.includes(forbidden), false, `must not import ${forbidden}`);
  }
  for (const pattern of [/\brequire\s*\(/u, /\bimport\s*\(/u, /\bfetch\s*\(/u, /\beval\s*\(/u, /new\s+Function\s*\(/u, /\bprocess\./u, /\bglobalThis\./u, /\bDate\.now\s*\(/u]) {
    assert.equal(pattern.test(source), false, `must not use ${pattern}`);
  }
});
