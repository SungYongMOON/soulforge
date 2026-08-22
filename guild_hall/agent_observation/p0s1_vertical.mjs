import {
  guardEntry,
  hold,
  isCount,
  isPlainObject,
  isSafeId,
  isSafeIdList,
  isSafeLabel,
  isSafeRef,
  unknownKeyIn,
} from './guard_primitives.mjs';
import {
  createObservationStore,
  registerAgent,
  observeRun,
  recordDirectUsage,
  recordResultReceipt,
  projectUsageRollup,
  projectStoreCounts,
  listReceipts,
} from './agent_observation.mjs';
import {
  QUEUE_PRIORITIES,
  createJobShop,
  registerHost,
  registerResource,
  submitJob,
  acquireLease,
  completeJob,
  projectJobShop,
} from './resource_job_shop.mjs';

export const P0S1_VERTICAL_SCHEMA = 'soulforge.agent_observation.p0s1_vertical_result.v1';

export const VERTICAL_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'SECRET_VALUE_FORBIDDEN',
  LOCAL_PATH_VALUE_FORBIDDEN: 'LOCAL_PATH_VALUE_FORBIDDEN',
  INPUT_TOO_DEEP: 'INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'ACCESSOR_PROPERTY_FORBIDDEN',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  UNSAFE_DISPLAY_LABEL: 'UNSAFE_DISPLAY_LABEL',
});
const V = VERTICAL_HOLD_CODES;

const ENTRY_CODES = Object.freeze({
  unknownField: V.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: V.SECRET_VALUE_FORBIDDEN,
  localPath: V.LOCAL_PATH_VALUE_FORBIDDEN,
  tooDeep: V.INPUT_TOO_DEEP,
  tooLarge: V.INPUT_TOO_LARGE,
  hostileInput: V.HOSTILE_INPUT_REFUSED,
  accessor: V.ACCESSOR_PROPERTY_FORBIDDEN,
});

const FIXTURE_KEYS = Object.freeze([
  'organization_group_id', 'host', 'resource', 'requester', 'craftsman', 'job',
  'artifact_ref', 'delivery_receipt_id',
  'replay_usage_event', 'conflicting_usage_replay', 'unknown_parent_run', 'unknown_project',
  'skip_delivery_receipt',
]);
const PARTICIPANT_KEYS = Object.freeze([
  'agent_id', 'functional_role', 'project_id', 'run_id', 'task_id', 'work_unit_id',
  'display_label', 'provider', 'model_id', 'reasoning_effort', 'usage_event_id', 'tokens',
  'provider_identities',
]);
const HOST_KEYS = Object.freeze(['host_id', 'capability_kinds']);
const RESOURCE_KEYS = Object.freeze(['resource_id', 'tool_kind', 'capacity']);
const JOB_KEYS = Object.freeze(['job_id', 'priority', 'action', 'submitted_seq', 'lease_id']);
const FLAG_KEYS = Object.freeze(['replay_usage_event', 'conflicting_usage_replay', 'unknown_parent_run', 'unknown_project', 'skip_delivery_receipt']);

const IDENTITY_KEYS = Object.freeze(['provider', 'id_kind', 'id_value']);
const TOKEN_KEYS = Object.freeze(['input', 'cached_input', 'cache_write_input', 'output', 'reasoning_output']);
const MAX_IDENTITIES = 8;
const MAX_CAPABILITIES = 8;
const MAX_FIXTURE_TOKENS = 1_000_000_000;

const AT_REQUEST = '2026-08-22T02:00:00.000Z';
const AT_DELIVER = '2026-08-22T02:05:00.000Z';

export const P0S1_SYNTHETIC_FIXTURE = Object.freeze({
  organization_group_id: 'org-synthetic-development1',
  host: Object.freeze({ host_id: 'PC-01', capability_kinds: Object.freeze(['spreadsheet']) }),
  resource: Object.freeze({ resource_id: 'res-spreadsheet-01', tool_kind: 'spreadsheet', capacity: 1 }),
  requester: Object.freeze({
    agent_id: 'agent.synthetic-alpha.systems-engineering.v1',
    functional_role: 'systems_engineering',
    project_id: 'proj-synthetic-alpha',
    run_id: 'run-synthetic-alpha-requester',
    task_id: 'task-synthetic-alpha-0001',
    work_unit_id: 'wu-synthetic-alpha-0001',
    display_label: 'Synthetic Alpha 요구정리 TASK',
    provider: 'synthetic-provider',
    model_id: 'model-synthetic-high',
    reasoning_effort: 'high',
    usage_event_id: 'usage-synthetic-alpha-requester-0001',
    tokens: Object.freeze({ input: 1800, cached_input: 600, cache_write_input: 200, output: 450, reasoning_output: 180 }),
    provider_identities: Object.freeze([
      Object.freeze({ provider: 'synthetic-provider', id_kind: 'thread_id', id_value: 'th-synthetic-alpha-0001' }),
      Object.freeze({ provider: 'synthetic-provider', id_kind: 'session_id', id_value: 'se-synthetic-alpha-0001' }),
    ]),
  }),
  craftsman: Object.freeze({
    agent_id: 'agent.synthetic-alpha.spreadsheet-craftsman.v1',
    functional_role: 'spreadsheet',
    project_id: 'proj-synthetic-alpha',
    run_id: 'run-synthetic-alpha-craftsman',
    task_id: 'task-synthetic-alpha-0002',
    work_unit_id: 'wu-synthetic-alpha-0002',
    display_label: 'Synthetic Alpha 표계산 장인',
    provider: 'synthetic-provider',
    model_id: 'model-synthetic-low',
    reasoning_effort: 'low',
    usage_event_id: 'usage-synthetic-alpha-craftsman-0001',
    tokens: Object.freeze({ input: 700, cached_input: 100, cache_write_input: 0, output: 260, reasoning_output: 40 }),
    provider_identities: Object.freeze([
      Object.freeze({ provider: 'synthetic-provider', id_kind: 'thread_id', id_value: 'th-synthetic-alpha-0002' }),
    ]),
  }),
  job: Object.freeze({ job_id: 'job-synthetic-alpha-0001', priority: 'normal', action: 'produce_workbook', submitted_seq: 1, lease_id: 'lease-synthetic-alpha-0001' }),
  artifact_ref: 'artifact://synthetic/alpha-workbook-0001',
  delivery_receipt_id: 'rcpt-synthetic-alpha-delivery-0001',
});

// Declared, not measured. The measurement is the validator's source scan for any effectful
// import or global plus the runtime probe that no network global is touched.
const DECLARED_EFFECT_BOUNDARY = Object.freeze({
  erp_world_tree_writes: 0,
  board_enrollment_writes: 0,
  result_gate_writes: 0,
  file_writes: 0,
  external_calls: 0,
  spreadsheet_app_invocations: 0,
});

function guardParticipant(spec, label) {
  const guarded = guardEntry(spec, PARTICIPANT_KEYS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return { ...guarded, detail: `${label}.${guarded.detail ?? 'value'}` };
  for (const key of ['agent_id', 'project_id', 'run_id', 'task_id', 'work_unit_id', 'provider', 'model_id', 'reasoning_effort', 'usage_event_id', 'functional_role']) {
    if (!isSafeId(spec[key])) return hold(V.INVALID_FIELD_VALUE, `${label}.${key}`);
  }
  // display_label is the only free-text field that reaches a Board-facing projection, so it is
  // held to the Board's own label rule rather than passed through.
  if (!isSafeLabel(spec.display_label)) return hold(V.UNSAFE_DISPLAY_LABEL, `${label}.display_label`);

  // Nested shapes are validated here too. Anything malformed must return a HOLD result; this entry
  // point never throws.
  const identities = spec.provider_identities;
  if (!Array.isArray(identities) || identities.length === 0 || identities.length > MAX_IDENTITIES) {
    return hold(V.INVALID_FIELD_VALUE, `${label}.provider_identities`);
  }
  for (const identity of identities) {
    if (!isPlainObject(identity)) return hold(V.INVALID_FIELD_VALUE, `${label}.provider_identity`);
    const extra = unknownKeyIn(identity, IDENTITY_KEYS);
    if (extra !== null) return hold(V.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, `${label}.${extra}`);
    if (!IDENTITY_KEYS.every((key) => isSafeId(identity[key]))) return hold(V.INVALID_FIELD_VALUE, `${label}.provider_identity`);
  }

  const tokens = spec.tokens;
  if (!isPlainObject(tokens)) return hold(V.INVALID_FIELD_VALUE, `${label}.tokens`);
  const tokenExtra = unknownKeyIn(tokens, TOKEN_KEYS);
  if (tokenExtra !== null) return hold(V.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, `${label}.${tokenExtra}`);
  if (!TOKEN_KEYS.every((key) => isCount(tokens[key], MAX_FIXTURE_TOKENS))) return hold(V.INVALID_FIELD_VALUE, `${label}.tokens`);
  return null;
}

function guardFixture(rawFixture) {
  const guarded = guardEntry(rawFixture, FIXTURE_KEYS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const fixture = guarded.value;
  for (const key of FLAG_KEYS) {
    if (fixture[key] !== undefined && typeof fixture[key] !== 'boolean') return hold(V.INVALID_FIELD_VALUE, key);
  }
  if (!isSafeId(fixture.organization_group_id)) return hold(V.INVALID_FIELD_VALUE, 'organization_group_id');
  if (!isSafeRef(fixture.artifact_ref)) return hold(V.INVALID_FIELD_VALUE, 'artifact_ref');
  if (!isSafeId(fixture.delivery_receipt_id)) return hold(V.INVALID_FIELD_VALUE, 'delivery_receipt_id');

  for (const [value, keys, label] of [
    [fixture.host, HOST_KEYS, 'host'],
    [fixture.resource, RESOURCE_KEYS, 'resource'],
    [fixture.job, JOB_KEYS, 'job'],
  ]) {
    if (!isPlainObject(value)) return hold(V.INVALID_FIELD_VALUE, label);
    const extra = unknownKeyIn(value, keys);
    if (extra !== null) return hold(V.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, `${label}.${extra}`);
  }

  if (!isSafeId(fixture.host.host_id)) return hold(V.INVALID_FIELD_VALUE, 'host.host_id');
  if (!isSafeIdList(fixture.host.capability_kinds, MAX_CAPABILITIES)) return hold(V.INVALID_FIELD_VALUE, 'host.capability_kinds');
  if (!isSafeId(fixture.resource.resource_id)) return hold(V.INVALID_FIELD_VALUE, 'resource.resource_id');
  if (!isSafeId(fixture.resource.tool_kind)) return hold(V.INVALID_FIELD_VALUE, 'resource.tool_kind');
  if (!Number.isSafeInteger(fixture.resource.capacity) || fixture.resource.capacity < 1) return hold(V.INVALID_FIELD_VALUE, 'resource.capacity');
  for (const key of ['job_id', 'action', 'lease_id']) {
    if (!isSafeId(fixture.job[key])) return hold(V.INVALID_FIELD_VALUE, `job.${key}`);
  }
  if (!QUEUE_PRIORITIES.includes(fixture.job.priority)) return hold(V.INVALID_FIELD_VALUE, 'job.priority');
  if (!Number.isSafeInteger(fixture.job.submitted_seq) || fixture.job.submitted_seq < 0) return hold(V.INVALID_FIELD_VALUE, 'job.submitted_seq');

  return guardParticipant(fixture.requester, 'requester')
    ?? guardParticipant(fixture.craftsman, 'craftsman')
    ?? { status: 'OK', value: fixture };
}

const agentPayload = (spec, kind, projectId, allowedActions, at) => ({
  agent_id: spec.agent_id,
  agent_kind: kind,
  functional_role: spec.functional_role,
  project_id: projectId,
  provider_identities: spec.provider_identities.map((i) => ({ ...i })),
  authority_scope: { allowed_projects: [spec.project_id], allowed_actions: allowedActions },
  memory_class: 'cache_only',
  registered_at: at,
});

const runPayload = (spec, parentRunId, at) => ({
  run_id: spec.run_id,
  parent_run_id: parentRunId,
  agent_id: spec.agent_id,
  task_id: spec.task_id,
  project_id: spec.project_id,
  work_unit_id: spec.work_unit_id,
  lifecycle: 'started',
  provider: spec.provider,
  model_id: spec.model_id,
  reasoning_effort: spec.reasoning_effort,
  authority: 'read_only',
  started_at: at,
  heartbeat_at: at,
  ended_at: null,
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
});

const usagePayload = (spec, at) => ({
  event_id: spec.usage_event_id,
  run_id: spec.run_id,
  agent_id: spec.agent_id,
  provider: spec.provider,
  model_id: spec.model_id,
  attribution_kind: 'direct',
  tokens: { ...spec.tokens },
  cost_basis: 'token_proxy',
  cost_evidence_refs: [],
  observed_at: at,
});

function emptyResult(holds) {
  return {
    schema_version: P0S1_VERTICAL_SCHEMA,
    status: 'HOLD',
    holds,
    counts: null,
    usage_rollup: null,
    board_rows: [],
    delivery_evidence: { producer_evidence_kind: 'none' },
    privacy: null,
    declared_effect_boundary: { ...DECLARED_EFFECT_BOUNDARY },
  };
}

export function runP0S1Vertical(rawFixture) {
  const fixtureGuard = guardFixture(rawFixture);
  if (fixtureGuard.status === 'HOLD') {
    return emptyResult([{ step: 'guard_fixture', hold_code: fixtureGuard.hold_code, detail: fixtureGuard.detail ?? null }]);
  }
  const fixture = fixtureGuard.value;

  const holds = [];
  const note = (step, result) => {
    if (result.status === 'HOLD') holds.push({ step, hold_code: result.hold_code, detail: result.detail ?? null });
    return result;
  };

  const store = createObservationStore();
  const shop = createJobShop();
  const { requester, craftsman } = fixture;
  const requesterProject = fixture.unknown_project === true ? null : requester.project_id;
  let usageReplayNoOps = 0;
  let leasesGranted = 0;

  const requesterAgent = note('register_requester_agent', registerAgent(
    store,
    agentPayload(requester, 'project_isolated_functional', requesterProject, ['request_spreadsheet_job'], AT_REQUEST),
  ));
  const craftsmanAgent = requesterAgent.status === 'HOLD'
    ? { status: 'SKIPPED' }
    : note('register_craftsman_agent', registerAgent(
      store,
      agentPayload(craftsman, 'tool_specialist_craftsman', craftsman.project_id, ['produce_workbook'], AT_REQUEST),
    ));

  const requesterRun = requesterAgent.status === 'HOLD'
    ? { status: 'SKIPPED' }
    : note('observe_requester_run', observeRun(store, runPayload(requester, null, AT_REQUEST)));

  const parentRunId = fixture.unknown_parent_run === true ? 'run-synthetic-not-registered' : requester.run_id;
  const craftsmanRun = (craftsmanAgent.status !== 'REGISTERED' || requesterRun.status !== 'OBSERVED')
    ? { status: 'SKIPPED' }
    : note('observe_craftsman_run', observeRun(store, runPayload(craftsman, parentRunId, AT_REQUEST)));

  if (craftsmanRun.status === 'OBSERVED') {
    note('register_host', registerHost(shop, { host_id: fixture.host.host_id, health: 'ok', capability_kinds: [...fixture.host.capability_kinds], observed_at_ms: 0 }));
    note('register_resource', registerResource(shop, {
      resource_id: fixture.resource.resource_id,
      host_id: fixture.host.host_id,
      tool_kind: fixture.resource.tool_kind,
      capacity: fixture.resource.capacity,
      health: 'ok',
      observed_at_ms: 0,
      allowed_projects: [craftsman.project_id],
      allowed_actions: [fixture.job.action],
    }));
    note('submit_job', submitJob(shop, {
      job_id: fixture.job.job_id,
      resource_id: fixture.resource.resource_id,
      priority: fixture.job.priority,
      project_id: craftsman.project_id,
      agent_id: craftsman.agent_id,
      run_id: craftsman.run_id,
      action: fixture.job.action,
      submitted_seq: fixture.job.submitted_seq,
    }));
    const lease = note('acquire_lease', acquireLease(shop, {
      resource_id: fixture.resource.resource_id,
      lease_id: fixture.job.lease_id,
      now_ms: 0,
      ttl_ms: 600_000,
    }));
    if (lease.status === 'GRANTED') {
      leasesGranted += 1;
      note('complete_job', completeJob(shop, {
        lease_id: fixture.job.lease_id,
        job_id: fixture.job.job_id,
        result_ref: fixture.artifact_ref,
        now_ms: 1_000,
      }));
    }

    note('record_requester_usage', recordDirectUsage(store, usagePayload(requester, AT_REQUEST)));
    note('record_craftsman_usage', recordDirectUsage(store, usagePayload(craftsman, AT_DELIVER)));

    if (fixture.replay_usage_event === true) {
      const replay = note('replay_requester_usage', recordDirectUsage(store, usagePayload(requester, AT_REQUEST)));
      if (replay.status === 'NO_OP') usageReplayNoOps += 1;
    }
    if (fixture.conflicting_usage_replay === true) {
      note('conflicting_requester_usage', recordDirectUsage(store, {
        ...usagePayload(requester, AT_REQUEST),
        tokens: { ...requester.tokens, input: requester.tokens.input + 1_000 },
      }));
    }

    if (fixture.skip_delivery_receipt !== true) note('record_delivery_receipt', recordResultReceipt(store, {
      receipt_id: fixture.delivery_receipt_id,
      run_id: craftsman.run_id,
      agent_id: craftsman.agent_id,
      receipt_kind: 'delivery',
      producer_evidence_kind: 'producer_observed',
      refs: [{ ref_kind: 'artifact', ref_value: fixture.artifact_ref }],
      observed_at: AT_DELIVER,
    }));
  }

  const counts = projectStoreCounts(store);
  const shopView = projectJobShop(shop);
  const rollup = requesterRun.status === 'OBSERVED' ? projectUsageRollup(store, { run_id: requester.run_id }) : null;
  // Read the delivery evidence back out of the stored receipt so the projection reports the
  // stored value rather than a constant. The store already refuses a structural_only delivery,
  // so that guard is proven in the store's own tests, not here.
  const deliveryReceipt = listReceipts(store).find((r) => r.receipt_kind === 'delivery') ?? null;
  const deliveredToParent = deliveryReceipt !== null && craftsmanRun.status === 'OBSERVED';

  const boardRows = deliveredToParent
    ? [{
      row_kind: 'agent_run',
      agent_id: requester.agent_id,
      run_id: requester.run_id,
      project_id: requester.project_id,
      organization_group_id: fixture.organization_group_id,
      display_label: requester.display_label,
      status_label: '하위 결과 도착/취합 중',
      result_gate_state: 'result_ready_parent',
    }]
    : [];

  return {
    schema_version: P0S1_VERTICAL_SCHEMA,
    status: holds.length === 0 ? 'PASS' : 'HOLD',
    holds,
    counts: {
      agents: counts.agents,
      runs: counts.runs,
      requester_runs: requesterRun.status === 'OBSERVED' ? 1 : 0,
      usage_events: counts.usage_events,
      requester_direct_usage_events: rollup === null || rollup.status !== 'PROJECTED' ? 0 : rollup.self_usage.event_count,
      usage_replay_no_ops: usageReplayNoOps,
      receipts: counts.receipts,
      resources: shopView.resources.length,
      resource_capacity: shopView.resources[0]?.capacity ?? 0,
      leases_granted: leasesGranted,
      recorded_completions: shopView.recorded_completion_count,
      fenced_completion_attempts: shopView.fenced_completion_attempt_count,
      duplicate_completion_holds: shopView.duplicate_completion_hold_count,
    },
    usage_rollup: rollup !== null && rollup.status === 'PROJECTED' ? rollup : null,
    board_rows: boardRows,
    delivery_evidence: {
      producer_evidence_kind: deliveryReceipt === null ? 'none' : deliveryReceipt.producer_evidence_kind,
    },
    privacy: counts.privacy,
    declared_effect_boundary: { ...DECLARED_EFFECT_BOUNDARY },
  };
}
