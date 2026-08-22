import {
  guardEntry,
  hold,
  isPlainObject,
  isSafeId,
  isSafeIdList as isSafeIdListOf,
  isSafeRef,
  unknownKeyIn,
} from './guard_primitives.mjs';

export const HOST_RECORD_SCHEMA = 'soulforge.agent_observation.host_record.v1';
export const RESOURCE_RECORD_SCHEMA = 'soulforge.agent_observation.resource_record.v1';
export const JOB_RECORD_SCHEMA = 'soulforge.agent_observation.job_record.v1';
export const LEASE_RECORD_SCHEMA = 'soulforge.agent_observation.lease_record.v1';

export const QUEUE_PRIORITIES = Object.freeze(['urgent', 'high', 'normal']);
export const HEALTH_STATES = Object.freeze(['ok', 'degraded', 'down']);

export const JOB_SHOP_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'SECRET_VALUE_FORBIDDEN',
  LOCAL_PATH_VALUE_FORBIDDEN: 'LOCAL_PATH_VALUE_FORBIDDEN',
  INPUT_TOO_DEEP: 'INPUT_TOO_DEEP',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  UNKNOWN_SHOP: 'UNKNOWN_SHOP',
  UNKNOWN_HOST: 'UNKNOWN_HOST',
  UNKNOWN_RESOURCE: 'UNKNOWN_RESOURCE',
  UNKNOWN_JOB: 'UNKNOWN_JOB',
  UNKNOWN_LEASE: 'UNKNOWN_LEASE',
  HOST_RECORD_CONFLICT: 'HOST_RECORD_CONFLICT',
  RESOURCE_RECORD_CONFLICT: 'RESOURCE_RECORD_CONFLICT',
  HEALTH_OBSERVATION_NOT_NEWER: 'HEALTH_OBSERVATION_NOT_NEWER',
  CAPABILITY_NOT_SUPPORTED: 'CAPABILITY_NOT_SUPPORTED',
  PROJECT_NOT_ALLOWED: 'PROJECT_NOT_ALLOWED',
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  SUBMISSION_SEQUENCE_NOT_MONOTONIC: 'SUBMISSION_SEQUENCE_NOT_MONOTONIC',
  HOST_UNHEALTHY: 'HOST_UNHEALTHY',
  RESOURCE_UNHEALTHY: 'RESOURCE_UNHEALTHY',
  CAPACITY_EXHAUSTED: 'CAPACITY_EXHAUSTED',
  QUEUE_EMPTY: 'QUEUE_EMPTY',
  JOB_RECORD_CONFLICT: 'JOB_RECORD_CONFLICT',
  JOB_RESULT_CONFLICT: 'JOB_RESULT_CONFLICT',
  JOB_NOT_LEASED: 'JOB_NOT_LEASED',
  LEASE_ID_CONFLICT: 'LEASE_ID_CONFLICT',
  LEASE_FENCED_OUT: 'LEASE_FENCED_OUT',
  CLOCK_RANGE_INVALID: 'CLOCK_RANGE_INVALID',
});
const H = JOB_SHOP_HOLD_CODES;

const ENTRY_CODES = Object.freeze({
  unknownField: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: H.SECRET_VALUE_FORBIDDEN,
  localPath: H.LOCAL_PATH_VALUE_FORBIDDEN,
  tooDeep: H.INPUT_TOO_DEEP,
});

const FIELDS = Object.freeze({
  host: ['host_id', 'health', 'capability_kinds', 'observed_at_ms'],
  resource: ['resource_id', 'host_id', 'tool_kind', 'capacity', 'health', 'allowed_projects', 'allowed_actions', 'observed_at_ms'],
  resourceHealth: ['resource_id', 'health', 'observed_at_ms'],
  job: ['job_id', 'resource_id', 'priority', 'project_id', 'agent_id', 'run_id', 'action', 'submitted_seq'],
  acquire: ['resource_id', 'lease_id', 'now_ms', 'ttl_ms'],
  complete: ['lease_id', 'job_id', 'result_ref', 'now_ms'],
  release: ['lease_id'],
});

const MAX_CAPACITY = 64;
const MAX_LIST = 64;
const MAX_CLOCK_MS = Number.MAX_SAFE_INTEGER / 4;

const STATE = new WeakMap();
const stateOf = (shop) => STATE.get(shop);

const isClock = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_CLOCK_MS;
const isSafeIdList = (list) => isSafeIdListOf(list, MAX_LIST);

function sameFields(a, b, fields) {
  return fields.every((key) => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((v, i) => v === right[i]);
    }
    return left === right;
  });
}

export function createJobShop() {
  const shop = Object.freeze({ kind: 'soulforge.agent_observation.job_shop.v1' });
  STATE.set(shop, {
    hosts: new Map(),
    resources: new Map(),
    jobs: new Map(),
    leases: new Map(),
    fencingEpoch: new Map(),
    lastSubmittedSeq: new Map(),
    fencedCompletionAttempts: 0,
    duplicateCompletionHolds: 0,
  });
  return shop;
}

export function registerHost(shop, input) {
  const state = stateOf(shop);
  if (state === undefined) return hold(H.UNKNOWN_SHOP);
  const guard = guardEntry(input, FIELDS.host, ENTRY_CODES);
  if (guard !== null) return guard;
  if (!isSafeId(input.host_id)) return hold(H.INVALID_FIELD_VALUE, 'host_id');
  if (!HEALTH_STATES.includes(input.health)) return hold(H.INVALID_FIELD_VALUE, 'health');
  if (!isSafeIdList(input.capability_kinds)) return hold(H.INVALID_FIELD_VALUE, 'capability_kinds');
  if (!isClock(input.observed_at_ms)) return hold(H.INVALID_FIELD_VALUE, 'observed_at_ms');

  const record = Object.freeze({
    schema_version: HOST_RECORD_SCHEMA,
    host_id: input.host_id,
    health: input.health,
    capability_kinds: Object.freeze([...input.capability_kinds]),
    observed_at_ms: input.observed_at_ms,
  });

  const existing = state.hosts.get(input.host_id);
  if (existing !== undefined) {
    if (!sameFields(existing, record, ['host_id', 'capability_kinds'])) return hold(H.HOST_RECORD_CONFLICT, 'identity');
    if (sameFields(existing, record, FIELDS.host)) return { status: 'NO_OP', host_id: input.host_id };
    // Health is an observation: it may only advance on a strictly newer collector timestamp, so
    // two collectors reporting the same instant cannot race to last-writer-wins.
    if (input.observed_at_ms <= existing.observed_at_ms) return hold(H.HOST_RECORD_CONFLICT, 'observation_not_newer');
    state.hosts.set(input.host_id, record);
    return existing.health === input.health
      ? { status: 'NO_OP', host_id: input.host_id }
      : { status: 'UPDATED', host_id: input.host_id };
  }
  state.hosts.set(input.host_id, record);
  return { status: 'REGISTERED', host_id: input.host_id };
}

export function registerResource(shop, input) {
  const state = stateOf(shop);
  if (state === undefined) return hold(H.UNKNOWN_SHOP);
  const guard = guardEntry(input, FIELDS.resource, ENTRY_CODES);
  if (guard !== null) return guard;
  if (!isSafeId(input.resource_id)) return hold(H.INVALID_FIELD_VALUE, 'resource_id');
  if (!isSafeId(input.host_id)) return hold(H.INVALID_FIELD_VALUE, 'host_id');
  const host = state.hosts.get(input.host_id);
  if (host === undefined) return hold(H.UNKNOWN_HOST);
  if (!isSafeId(input.tool_kind)) return hold(H.INVALID_FIELD_VALUE, 'tool_kind');
  if (!host.capability_kinds.includes(input.tool_kind)) return hold(H.CAPABILITY_NOT_SUPPORTED);
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 1 || input.capacity > MAX_CAPACITY) return hold(H.INVALID_FIELD_VALUE, 'capacity');
  if (!HEALTH_STATES.includes(input.health)) return hold(H.INVALID_FIELD_VALUE, 'health');
  if (!isSafeIdList(input.allowed_projects)) return hold(H.INVALID_FIELD_VALUE, 'allowed_projects');
  if (!isSafeIdList(input.allowed_actions)) return hold(H.INVALID_FIELD_VALUE, 'allowed_actions');
  if (!isClock(input.observed_at_ms)) return hold(H.INVALID_FIELD_VALUE, 'observed_at_ms');

  const record = Object.freeze({
    schema_version: RESOURCE_RECORD_SCHEMA,
    resource_id: input.resource_id,
    host_id: input.host_id,
    tool_kind: input.tool_kind,
    capacity: input.capacity,
    health: input.health,
    allowed_projects: Object.freeze([...input.allowed_projects]),
    allowed_actions: Object.freeze([...input.allowed_actions]),
    health_observed_at_ms: input.observed_at_ms,
  });

  const existing = state.resources.get(input.resource_id);
  if (existing !== undefined) {
    // Configuration is immutable here on purpose; health moves through observeResourceHealth.
    return sameFields(existing, record, FIELDS.resource)
      ? { status: 'NO_OP', resource_id: input.resource_id }
      : hold(H.RESOURCE_RECORD_CONFLICT);
  }
  state.resources.set(input.resource_id, record);
  if (!state.fencingEpoch.has(input.resource_id)) state.fencingEpoch.set(input.resource_id, 0);
  return { status: 'REGISTERED', resource_id: input.resource_id };
}

export function observeResourceHealth(shop, input) {
  const state = stateOf(shop);
  if (state === undefined) return hold(H.UNKNOWN_SHOP);
  const guard = guardEntry(input, FIELDS.resourceHealth, ENTRY_CODES);
  if (guard !== null) return guard;
  if (!isSafeId(input.resource_id)) return hold(H.INVALID_FIELD_VALUE, 'resource_id');
  const existing = state.resources.get(input.resource_id);
  if (existing === undefined) return hold(H.UNKNOWN_RESOURCE);
  if (!HEALTH_STATES.includes(input.health)) return hold(H.INVALID_FIELD_VALUE, 'health');
  if (!isClock(input.observed_at_ms)) return hold(H.INVALID_FIELD_VALUE, 'observed_at_ms');
  // The observation clock is retained and must move strictly forward, so a stale or same-instant
  // collector report cannot flip the health gate back and re-enable dispatch.
  if (input.observed_at_ms <= existing.health_observed_at_ms) return hold(H.HEALTH_OBSERVATION_NOT_NEWER);
  if (existing.health === input.health) {
    state.resources.set(input.resource_id, Object.freeze({ ...existing, health_observed_at_ms: input.observed_at_ms }));
    return { status: 'NO_OP', resource_id: input.resource_id, health: input.health };
  }

  state.resources.set(input.resource_id, Object.freeze({
    ...existing, health: input.health, health_observed_at_ms: input.observed_at_ms,
  }));
  return { status: 'UPDATED', resource_id: input.resource_id, health: input.health };
}

export function submitJob(shop, input) {
  const state = stateOf(shop);
  if (state === undefined) return hold(H.UNKNOWN_SHOP);
  const guard = guardEntry(input, FIELDS.job, ENTRY_CODES);
  if (guard !== null) return guard;
  if (!isSafeId(input.job_id)) return hold(H.INVALID_FIELD_VALUE, 'job_id');
  if (!isSafeId(input.resource_id)) return hold(H.INVALID_FIELD_VALUE, 'resource_id');
  const resource = state.resources.get(input.resource_id);
  if (resource === undefined) return hold(H.UNKNOWN_RESOURCE);
  if (!QUEUE_PRIORITIES.includes(input.priority)) return hold(H.INVALID_FIELD_VALUE, 'priority');
  if (!isSafeId(input.project_id)) return hold(H.INVALID_FIELD_VALUE, 'project_id');
  if (!resource.allowed_projects.includes(input.project_id)) return hold(H.PROJECT_NOT_ALLOWED);
  if (!isSafeId(input.action)) return hold(H.INVALID_FIELD_VALUE, 'action');
  if (!resource.allowed_actions.includes(input.action)) return hold(H.ACTION_NOT_ALLOWED);
  if (!isSafeId(input.agent_id)) return hold(H.INVALID_FIELD_VALUE, 'agent_id');
  if (!isSafeId(input.run_id)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  if (!Number.isSafeInteger(input.submitted_seq) || input.submitted_seq < 0) return hold(H.INVALID_FIELD_VALUE, 'submitted_seq');

  const existing = state.jobs.get(input.job_id);
  if (existing !== undefined) {
    return sameFields(existing, input, FIELDS.job)
      ? { status: 'NO_OP', job_id: input.job_id }
      : hold(H.JOB_RECORD_CONFLICT);
  }

  // FIFO inside a priority tier is only meaningful if the controller owns the sequence. A client
  // that replays a low sequence would otherwise preempt everything already queued.
  const lastSeq = state.lastSubmittedSeq.get(input.resource_id);
  if (lastSeq !== undefined && input.submitted_seq <= lastSeq) return hold(H.SUBMISSION_SEQUENCE_NOT_MONOTONIC);
  state.lastSubmittedSeq.set(input.resource_id, input.submitted_seq);

  state.jobs.set(input.job_id, {
    schema_version: JOB_RECORD_SCHEMA,
    job_id: input.job_id,
    resource_id: input.resource_id,
    priority: input.priority,
    project_id: input.project_id,
    agent_id: input.agent_id,
    run_id: input.run_id,
    action: input.action,
    submitted_seq: input.submitted_seq,
    state: 'queued',
    lease_id: null,
    fencing_epoch: null,
    result_ref: null,
    completed_at_ms: null,
    recorded_completions: 0,
  });
  return { status: 'QUEUED', job_id: input.job_id };
}

const leaseIsActive = (lease, nowMs) => lease.state === 'active' && (nowMs === null || lease.expires_at_ms > nowMs);

function activeLeaseCount(state, resourceId, nowMs) {
  let count = 0;
  for (const lease of state.leases.values()) {
    if (lease.resource_id === resourceId && leaseIsActive(lease, nowMs)) count += 1;
  }
  return count;
}

function expireLeases(state, resourceId, nowMs) {
  for (const lease of state.leases.values()) {
    if (lease.resource_id !== resourceId || lease.state !== 'active' || lease.expires_at_ms > nowMs) continue;
    lease.state = 'expired';
    const job = state.jobs.get(lease.job_id);
    if (job !== undefined && job.state === 'leased' && job.lease_id === lease.lease_id) {
      job.state = 'queued';
      job.lease_id = null;
      job.fencing_epoch = null;
    }
  }
}

function nextQueuedJob(state, resourceId) {
  let best = null;
  for (const job of state.jobs.values()) {
    if (job.resource_id !== resourceId || job.state !== 'queued') continue;
    if (best === null) { best = job; continue; }
    const rank = QUEUE_PRIORITIES.indexOf(job.priority) - QUEUE_PRIORITIES.indexOf(best.priority);
    if (rank < 0 || (rank === 0 && job.submitted_seq < best.submitted_seq)) best = job;
  }
  return best;
}

export function acquireLease(shop, input) {
  const state = stateOf(shop);
  if (state === undefined) return hold(H.UNKNOWN_SHOP);
  const guard = guardEntry(input, FIELDS.acquire, ENTRY_CODES);
  if (guard !== null) return guard;
  if (!isSafeId(input.resource_id)) return hold(H.INVALID_FIELD_VALUE, 'resource_id');
  const resource = state.resources.get(input.resource_id);
  if (resource === undefined) return hold(H.UNKNOWN_RESOURCE);
  if (resource.health !== 'ok') return hold(H.RESOURCE_UNHEALTHY);
  const host = state.hosts.get(resource.host_id);
  if (host.health !== 'ok') return hold(H.HOST_UNHEALTHY);
  if (!isSafeId(input.lease_id)) return hold(H.INVALID_FIELD_VALUE, 'lease_id');
  if (state.leases.has(input.lease_id)) return hold(H.LEASE_ID_CONFLICT);
  if (!isClock(input.now_ms)) return hold(H.INVALID_FIELD_VALUE, 'now_ms');
  if (!Number.isSafeInteger(input.ttl_ms) || input.ttl_ms < 1) return hold(H.INVALID_FIELD_VALUE, 'ttl_ms');
  if (input.now_ms + input.ttl_ms > MAX_CLOCK_MS) return hold(H.CLOCK_RANGE_INVALID);

  expireLeases(state, input.resource_id, input.now_ms);
  if (activeLeaseCount(state, input.resource_id, input.now_ms) >= resource.capacity) return hold(H.CAPACITY_EXHAUSTED);

  const job = nextQueuedJob(state, input.resource_id);
  if (job === null) return hold(H.QUEUE_EMPTY);

  const epoch = state.fencingEpoch.get(input.resource_id) + 1;
  state.fencingEpoch.set(input.resource_id, epoch);
  const lease = {
    schema_version: LEASE_RECORD_SCHEMA,
    lease_id: input.lease_id,
    resource_id: input.resource_id,
    job_id: job.job_id,
    fencing_epoch: epoch,
    granted_at_ms: input.now_ms,
    expires_at_ms: input.now_ms + input.ttl_ms,
    state: 'active',
  };
  state.leases.set(input.lease_id, lease);
  job.state = 'leased';
  job.lease_id = input.lease_id;
  job.fencing_epoch = epoch;
  return { status: 'GRANTED', job_id: job.job_id, lease: Object.freeze({ ...lease }) };
}

export function completeJob(shop, input) {
  const state = stateOf(shop);
  if (state === undefined) return hold(H.UNKNOWN_SHOP);
  const guard = guardEntry(input, FIELDS.complete, ENTRY_CODES);
  if (guard !== null) return guard;
  if (!isSafeId(input.lease_id)) return hold(H.INVALID_FIELD_VALUE, 'lease_id');
  if (!isSafeId(input.job_id)) return hold(H.INVALID_FIELD_VALUE, 'job_id');
  if (!isSafeRef(input.result_ref)) return hold(H.INVALID_FIELD_VALUE, 'result_ref');
  if (!isClock(input.now_ms)) return hold(H.INVALID_FIELD_VALUE, 'now_ms');

  const lease = state.leases.get(input.lease_id);
  if (lease === undefined) return hold(H.UNKNOWN_LEASE);
  const job = state.jobs.get(input.job_id);
  if (job === undefined) return hold(H.UNKNOWN_JOB);
  if (lease.job_id !== input.job_id) return hold(H.JOB_NOT_LEASED);

  if (job.state === 'completed') {
    if (job.fencing_epoch !== lease.fencing_epoch) {
      state.fencedCompletionAttempts += 1;
      return hold(H.LEASE_FENCED_OUT);
    }
    if (job.result_ref === input.result_ref) return { status: 'NO_OP', job_id: job.job_id };
    state.duplicateCompletionHolds += 1;
    return hold(H.JOB_RESULT_CONFLICT);
  }
  // TTL is enforced here, not only when someone else happens to re-acquire. Otherwise a lease that
  // expired long ago still records a completion whenever the resource stays idle.
  if (input.now_ms >= lease.expires_at_ms) {
    expireLeases(state, lease.resource_id, input.now_ms);
    state.fencedCompletionAttempts += 1;
    return hold(H.LEASE_FENCED_OUT);
  }
  if (job.fencing_epoch !== lease.fencing_epoch || lease.state !== 'active') {
    state.fencedCompletionAttempts += 1;
    return hold(H.LEASE_FENCED_OUT);
  }

  job.state = 'completed';
  job.result_ref = input.result_ref;
  job.completed_at_ms = input.now_ms;
  job.recorded_completions += 1;
  lease.state = 'completed';
  return { status: 'COMPLETED', job_id: job.job_id, result_ref: input.result_ref };
}

export function releaseLease(shop, input) {
  const state = stateOf(shop);
  if (state === undefined) return hold(H.UNKNOWN_SHOP);
  const guard = guardEntry(input, FIELDS.release, ENTRY_CODES);
  if (guard !== null) return guard;
  if (!isSafeId(input.lease_id)) return hold(H.INVALID_FIELD_VALUE, 'lease_id');
  const lease = state.leases.get(input.lease_id);
  if (lease === undefined) return hold(H.UNKNOWN_LEASE);
  if (lease.state !== 'active') return { status: 'NO_OP', lease_id: input.lease_id };

  lease.state = 'released';
  const job = state.jobs.get(lease.job_id);
  if (job !== undefined && job.state === 'leased' && job.lease_id === lease.lease_id) {
    job.state = 'queued';
    job.lease_id = null;
    job.fencing_epoch = null;
  }
  return { status: 'RELEASED', lease_id: input.lease_id };
}

export function projectJobShop(shop, options = {}) {
  const state = stateOf(shop);
  if (state === undefined) return hold(H.UNKNOWN_SHOP);
  if (!isPlainObject(options)) return hold(H.INVALID_FIELD_VALUE, 'options');
  const extra = unknownKeyIn(options, ['now_ms']);
  if (extra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, extra);
  const nowMs = options.now_ms ?? null;
  if (nowMs !== null && !isClock(nowMs)) return hold(H.INVALID_FIELD_VALUE, 'now_ms');

  const resources = [...state.resources.values()].map((resource) => ({
    resource_id: resource.resource_id,
    host_id: resource.host_id,
    tool_kind: resource.tool_kind,
    capacity: resource.capacity,
    health: resource.health,
    active_leases: [...state.leases.values()].filter((l) => l.resource_id === resource.resource_id && leaseIsActive(l, nowMs)).length,
  }));

  const reclaimable = new Set();
  for (const lease of state.leases.values()) {
    if (lease.state === 'active' && !leaseIsActive(lease, nowMs)) reclaimable.add(lease.job_id);
  }

  let queueDepth = 0;
  let leasedCount = 0;
  let recordedCompletions = 0;
  for (const job of state.jobs.values()) {
    // A job whose lease has passed its TTL is reclaimable work, not idle work. Counting it as
    // queued keeps outstanding work visible in a clock-aware read instead of vanishing.
    if (job.state === 'queued' || reclaimable.has(job.job_id)) queueDepth += 1;
    else if (job.state === 'leased') leasedCount += 1;
    recordedCompletions += job.recorded_completions;
  }

  return {
    status: 'PROJECTED',
    hosts: [...state.hosts.values()].map((host) => ({ host_id: host.host_id, health: host.health, capability_kinds: [...host.capability_kinds] })),
    resources,
    queue_depth: queueDepth,
    leased_count: leasedCount,
    // Completions actually recorded through the fenced writer. This is a ledger count, not proof
    // that the craftsman's side effect ran exactly once: see README `중복 실행 경계`.
    recorded_completion_count: recordedCompletions,
    fenced_completion_attempt_count: state.fencedCompletionAttempts,
    duplicate_completion_hold_count: state.duplicateCompletionHolds,
    lease_count: state.leases.size,
  };
}
