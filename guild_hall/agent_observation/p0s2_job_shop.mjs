import {
  findLocalPath,
  findSecret,
  findUnknownKeyDeep,
  guardEntry,
  hold,
  isCount,
  isDenseArray,
  isPlainObject,
  isSafeId,
  isSafeIdList,
  isSafeLabel,
  isSafeRef,
  isUtcMs,
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
  RECEIPT_KINDS,
  listAgents,
  listRuns,
  listUsageEvents,
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

export const P0S2_RESULT_SCHEMA = 'soulforge.agent_observation.p0s2_job_shop_result.v1';
export const CONTEXT_CAPSULE_SCHEMA = 'soulforge.agent_observation.context_capsule.v1';

export const P0S2_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'SECRET_VALUE_FORBIDDEN',
  LOCAL_PATH_VALUE_FORBIDDEN: 'LOCAL_PATH_VALUE_FORBIDDEN',
  INPUT_TOO_DEEP: 'INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'ACCESSOR_PROPERTY_FORBIDDEN',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  UNSAFE_DISPLAY_LABEL: 'UNSAFE_DISPLAY_LABEL',
  PROJECT_COUNT_INVALID: 'PROJECT_COUNT_INVALID',
  DUPLICATE_PROJECT_ID: 'DUPLICATE_PROJECT_ID',
  DUPLICATE_DELIVERY_RECEIPT_ID: 'DUPLICATE_DELIVERY_RECEIPT_ID',
  DUPLICATE_PROJECT_IDENTIFIER: 'DUPLICATE_PROJECT_IDENTIFIER',
  CAPSULE_PROJECT_MISMATCH: 'CAPSULE_PROJECT_MISMATCH',
  CAPSULE_WORK_UNIT_MISMATCH: 'CAPSULE_WORK_UNIT_MISMATCH',
  CAPSULE_EXPIRED: 'CAPSULE_EXPIRED',
  CAPSULE_NOT_A_CACHE: 'CAPSULE_NOT_A_CACHE',
});
const S = P0S2_HOLD_CODES;

const ENTRY_CODES = Object.freeze({
  unknownField: S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: S.SECRET_VALUE_FORBIDDEN,
  localPath: S.LOCAL_PATH_VALUE_FORBIDDEN,
  tooDeep: S.INPUT_TOO_DEEP,
  tooLarge: S.INPUT_TOO_LARGE,
  hostileInput: S.HOSTILE_INPUT_REFUSED,
  accessor: S.ACCESSOR_PROPERTY_FORBIDDEN,
});

const FIXTURE_KEYS = Object.freeze([
  'organization_group_id', 'host', 'resource', 'projects',
  'cross_project_parent', 'cross_project_capsule', 'expired_capsule', 'capsule_with_body',
  'timeout_without_reclaim',
]);
const FLAG_KEYS = Object.freeze([
  'cross_project_parent', 'cross_project_capsule', 'expired_capsule', 'capsule_with_body',
  'timeout_without_reclaim',
]);
const HOST_KEYS = Object.freeze(['host_id', 'capability_kinds']);
const RESOURCE_KEYS = Object.freeze(['resource_id', 'tool_kind', 'capacity']);
const PROJECT_KEYS = Object.freeze([
  'project_id', 'work_unit_id', 'requester', 'craftsman', 'capsule', 'job',
  'artifact_ref', 'delivery_receipt_id',
]);
const PARTICIPANT_KEYS = Object.freeze([
  'agent_id', 'functional_role', 'run_id', 'task_id', 'display_label',
  'provider', 'model_id', 'reasoning_effort', 'usage_event_id', 'tokens', 'provider_identities',
]);
const IDENTITY_KEYS = Object.freeze(['provider', 'id_kind', 'id_value']);
const TOKEN_KEYS = Object.freeze(['input', 'cached_input', 'cache_write_input', 'output', 'reasoning_output']);
const JOB_KEYS = Object.freeze(['job_id', 'priority', 'action', 'submitted_seq']);
const CAPSULE_KEYS = Object.freeze([
  'capsule_id', 'project_id', 'work_unit_id', 'source_refs', 'authority_class', 'not_authority', 'expires_at',
]);
const REF_KEYS = Object.freeze(['ref_kind', 'ref_value']);
// The receipt vocabulary is imported rather than copied, so the two cannot drift apart.
const CAPSULE_REF_KINDS = RECEIPT_KINDS;

const REQUIRED_PROJECT_COUNT = 3;
const MAX_IDENTITIES = 8;
const MAX_REFS = 8;
const MAX_TOKENS = 1_000_000_000;

// Every timestamp is a constant. The run reads no clock, so the same fixture always yields the
// same result.
const AT_REQUEST = '2026-08-22T03:00:00.000Z';
const AT_DELIVER = '2026-08-22T03:10:00.000Z';
const CAPSULE_EXPIRES_AT = '2026-08-22T04:00:00.000Z';
const CAPSULE_EXPIRED_AT = '2026-08-22T02:00:00.000Z';
const CAPSULE_NOW = AT_REQUEST;

const CLOCK = Object.freeze({
  start: 1_000,
  leaseTtl: 1_000,
  crashGap: 5_000,
  step: 100,
});

const project = (name, priority, seq, tokens) => Object.freeze({
  project_id: `proj-synthetic-${name}`,
  work_unit_id: `wu-synthetic-${name}-0001`,
  requester: Object.freeze({
    agent_id: `agent.synthetic-${name}.systems-engineering.v1`,
    functional_role: 'systems_engineering',
    run_id: `run-synthetic-${name}-requester`,
    task_id: `task-synthetic-${name}-0001`,
    display_label: `Synthetic ${name} 요구정리 TASK`,
    provider: 'synthetic-provider',
    model_id: 'model-synthetic-high',
    reasoning_effort: 'high',
    usage_event_id: `usage-synthetic-${name}-requester-0001`,
    tokens: Object.freeze(tokens.requester),
    provider_identities: Object.freeze([
      Object.freeze({ provider: 'synthetic-provider', id_kind: 'thread_id', id_value: `th-synthetic-${name}-0001` }),
    ]),
  }),
  craftsman: Object.freeze({
    agent_id: `agent.synthetic-${name}.spreadsheet-craftsman.v1`,
    functional_role: 'spreadsheet',
    run_id: `run-synthetic-${name}-craftsman`,
    task_id: `task-synthetic-${name}-0002`,
    display_label: `Synthetic ${name} 표계산 장인`,
    provider: 'synthetic-provider',
    model_id: 'model-synthetic-low',
    reasoning_effort: 'low',
    usage_event_id: `usage-synthetic-${name}-craftsman-0001`,
    tokens: Object.freeze(tokens.craftsman),
    provider_identities: Object.freeze([
      Object.freeze({ provider: 'synthetic-provider', id_kind: 'thread_id', id_value: `th-synthetic-${name}-0002` }),
    ]),
  }),
  capsule: Object.freeze({
    capsule_id: `capsule-synthetic-${name}-0001`,
    project_id: `proj-synthetic-${name}`,
    work_unit_id: `wu-synthetic-${name}-0001`,
    source_refs: Object.freeze([
      Object.freeze({ ref_kind: 'validation', ref_value: `context://synthetic/${name}-requirements` }),
    ]),
    authority_class: 'cache_only',
    not_authority: true,
    expires_at: CAPSULE_EXPIRES_AT,
  }),
  job: Object.freeze({
    job_id: `job-synthetic-${name}-0001`,
    priority,
    action: 'produce_workbook',
    submitted_seq: seq,
  }),
  artifact_ref: `artifact://synthetic/${name}-workbook-0001`,
  delivery_receipt_id: `rcpt-synthetic-${name}-delivery-0001`,
});

// Submission order is alpha, beta, gamma; priority order is beta, gamma, alpha. Neither rule alone
// explains the dispatch order, so the test can tell them apart.
export const P0S2_SYNTHETIC_FIXTURE = Object.freeze({
  organization_group_id: 'org-synthetic-development1',
  host: Object.freeze({ host_id: 'PC-01', capability_kinds: Object.freeze(['spreadsheet']) }),
  resource: Object.freeze({ resource_id: 'res-spreadsheet-01', tool_kind: 'spreadsheet', capacity: 1 }),
  projects: Object.freeze([
    project('alpha', 'normal', 1, {
      requester: { input: 1800, cached_input: 600, cache_write_input: 200, output: 450, reasoning_output: 180 },
      craftsman: { input: 700, cached_input: 100, cache_write_input: 0, output: 260, reasoning_output: 40 },
    }),
    project('beta', 'urgent', 2, {
      requester: { input: 1500, cached_input: 400, cache_write_input: 100, output: 380, reasoning_output: 120 },
      craftsman: { input: 620, cached_input: 60, cache_write_input: 0, output: 210, reasoning_output: 30 },
    }),
    project('gamma', 'high', 3, {
      requester: { input: 1650, cached_input: 500, cache_write_input: 150, output: 410, reasoning_output: 150 },
      craftsman: { input: 660, cached_input: 80, cache_write_input: 0, output: 230, reasoning_output: 35 },
    }),
  ]),
});

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
  for (const key of ['agent_id', 'functional_role', 'run_id', 'task_id', 'provider', 'model_id', 'reasoning_effort', 'usage_event_id']) {
    if (!isSafeId(spec[key])) return hold(S.INVALID_FIELD_VALUE, `${label}.${key}`);
  }
  if (!isSafeLabel(spec.display_label)) return hold(S.UNSAFE_DISPLAY_LABEL, `${label}.display_label`);

  const identities = spec.provider_identities;
  if (!Array.isArray(identities) || identities.length === 0 || identities.length > MAX_IDENTITIES) {
    return hold(S.INVALID_FIELD_VALUE, `${label}.provider_identities`);
  }
  for (const identity of identities) {
    if (!isPlainObject(identity)) return hold(S.INVALID_FIELD_VALUE, `${label}.provider_identity`);
    const extra = unknownKeyIn(identity, IDENTITY_KEYS);
    if (extra !== null) return hold(S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, `${label}.${extra}`);
    if (!IDENTITY_KEYS.every((key) => isSafeId(identity[key]))) return hold(S.INVALID_FIELD_VALUE, `${label}.provider_identity`);
  }

  const tokens = spec.tokens;
  if (!isPlainObject(tokens)) return hold(S.INVALID_FIELD_VALUE, `${label}.tokens`);
  const tokenExtra = unknownKeyIn(tokens, TOKEN_KEYS);
  if (tokenExtra !== null) return hold(S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, `${label}.${tokenExtra}`);
  if (!TOKEN_KEYS.every((key) => isCount(tokens[key], MAX_TOKENS))) return hold(S.INVALID_FIELD_VALUE, `${label}.tokens`);
  return null;
}

function guardProject(spec, index) {
  const label = `projects[${index}]`;
  const guarded = guardEntry(spec, PROJECT_KEYS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return { ...guarded, detail: `${label}.${guarded.detail ?? 'value'}` };
  if (!isSafeId(spec.project_id)) return hold(S.INVALID_FIELD_VALUE, `${label}.project_id`);
  if (!isSafeId(spec.work_unit_id)) return hold(S.INVALID_FIELD_VALUE, `${label}.work_unit_id`);
  if (!isSafeRef(spec.artifact_ref)) return hold(S.INVALID_FIELD_VALUE, `${label}.artifact_ref`);
  if (!isSafeId(spec.delivery_receipt_id)) return hold(S.INVALID_FIELD_VALUE, `${label}.delivery_receipt_id`);

  if (!isPlainObject(spec.job)) return hold(S.INVALID_FIELD_VALUE, `${label}.job`);
  const jobExtra = unknownKeyIn(spec.job, JOB_KEYS);
  if (jobExtra !== null) return hold(S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, `${label}.job.${jobExtra}`);
  for (const key of ['job_id', 'action']) {
    if (!isSafeId(spec.job[key])) return hold(S.INVALID_FIELD_VALUE, `${label}.job.${key}`);
  }
  if (!QUEUE_PRIORITIES.includes(spec.job.priority)) return hold(S.INVALID_FIELD_VALUE, `${label}.job.priority`);
  if (!Number.isSafeInteger(spec.job.submitted_seq) || spec.job.submitted_seq < 0) return hold(S.INVALID_FIELD_VALUE, `${label}.job.submitted_seq`);

  return guardParticipant(spec.requester, `${label}.requester`) ?? guardParticipant(spec.craftsman, `${label}.craftsman`);
}

function guardFixture(rawFixture) {
  const guarded = guardEntry(rawFixture, FIXTURE_KEYS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const fixture = guarded.value;
  for (const key of FLAG_KEYS) {
    if (fixture[key] !== undefined && typeof fixture[key] !== 'boolean') return hold(S.INVALID_FIELD_VALUE, key);
  }
  if (!isSafeId(fixture.organization_group_id)) return hold(S.INVALID_FIELD_VALUE, 'organization_group_id');

  for (const [value, keys, label] of [[fixture.host, HOST_KEYS, 'host'], [fixture.resource, RESOURCE_KEYS, 'resource']]) {
    if (!isPlainObject(value)) return hold(S.INVALID_FIELD_VALUE, label);
    const extra = unknownKeyIn(value, keys);
    if (extra !== null) return hold(S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, `${label}.${extra}`);
  }
  if (!isSafeId(fixture.host.host_id)) return hold(S.INVALID_FIELD_VALUE, 'host.host_id');
  if (!isSafeIdList(fixture.host.capability_kinds, MAX_REFS)) return hold(S.INVALID_FIELD_VALUE, 'host.capability_kinds');
  if (!isSafeId(fixture.resource.resource_id)) return hold(S.INVALID_FIELD_VALUE, 'resource.resource_id');
  if (!isSafeId(fixture.resource.tool_kind)) return hold(S.INVALID_FIELD_VALUE, 'resource.tool_kind');
  if (fixture.resource.capacity !== 1) return hold(S.INVALID_FIELD_VALUE, 'resource.capacity');

  const projects = fixture.projects;
  if (!Array.isArray(projects) || projects.length !== REQUIRED_PROJECT_COUNT) return hold(S.PROJECT_COUNT_INVALID);
  const seen = new Set();
  const seenReceiptIds = new Set();
  const seenArtifacts = new Set();
  const seenWorkUnits = new Set();
  const seenCapsuleIds = new Set();
  for (let index = 0; index < projects.length; index += 1) {
    const projectGuard = guardProject(projects[index], index);
    if (projectGuard !== null) return projectGuard;
    if (seen.has(projects[index].project_id)) return hold(S.DUPLICATE_PROJECT_ID);
    seen.add(projects[index].project_id);
    // Two projects sharing a receipt id would let one pass the delivery gate on the other's
    // receipt, which is a project binding crossing over in a consumer-facing projection.
    if (seenReceiptIds.has(projects[index].delivery_receipt_id)) return hold(S.DUPLICATE_DELIVERY_RECEIPT_ID);
    seenReceiptIds.add(projects[index].delivery_receipt_id);
    for (const [field, seenSet] of [['artifact_ref', seenArtifacts], ['work_unit_id', seenWorkUnits], ['capsule_id', seenCapsuleIds]]) {
      const value = field === 'capsule_id' ? projects[index].capsule?.capsule_id : projects[index][field];
      // A capsule is optional. Two projects that both omit one share `undefined`, which is an
      // absence rather than a collision - reporting it as a duplicate identifier would name the
      // wrong reason for a correct refusal, and there is nothing here to refuse.
      if (value === undefined || value === null) continue;
      if (seenSet.has(value)) return hold(S.DUPLICATE_PROJECT_IDENTIFIER, field);
      seenSet.add(value);
    }
  }
  return { status: 'OK', value: fixture };
}

// A Context Capsule is the minimum project context an agent may hold for one work unit. It is a
// working cache with an expiry, never an authority, and it carries refs rather than source bodies.
function bindContextCapsule(rawCapsule, { projectId, workUnitId, nowUtc }) {
  const guarded = guardEntry(rawCapsule, CAPSULE_KEYS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const capsule = guarded.value;
  for (const key of ['capsule_id', 'project_id', 'work_unit_id']) {
    if (!isSafeId(capsule[key])) return hold(S.INVALID_FIELD_VALUE, key);
  }
  if (capsule.authority_class !== 'cache_only' || capsule.not_authority !== true) return hold(S.CAPSULE_NOT_A_CACHE);
  if (!isUtcMs(capsule.expires_at)) return hold(S.INVALID_FIELD_VALUE, 'expires_at');

  const refs = capsule.source_refs;
  if (!Array.isArray(refs) || refs.length === 0 || refs.length > MAX_REFS) return hold(S.INVALID_FIELD_VALUE, 'source_refs');
  for (const ref of refs) {
    if (!isPlainObject(ref)) return hold(S.INVALID_FIELD_VALUE, 'source_ref');
    const extra = unknownKeyIn(ref, REF_KEYS);
    if (extra !== null) return hold(S.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, extra);
    if (!CAPSULE_REF_KINDS.includes(ref.ref_kind)) return hold(S.INVALID_FIELD_VALUE, 'ref_kind');
    if (!isSafeRef(ref.ref_value)) return hold(S.INVALID_FIELD_VALUE, 'ref_value');
  }

  if (capsule.project_id !== projectId) return hold(S.CAPSULE_PROJECT_MISMATCH);
  if (capsule.work_unit_id !== workUnitId) return hold(S.CAPSULE_WORK_UNIT_MISMATCH);
  if (capsule.expires_at <= nowUtc) return hold(S.CAPSULE_EXPIRED);

  return {
    status: 'BOUND',
    record: {
      schema_version: CONTEXT_CAPSULE_SCHEMA,
      capsule_id: capsule.capsule_id,
      project_id: capsule.project_id,
      work_unit_id: capsule.work_unit_id,
      source_refs: refs.map((ref) => ({ ref_kind: ref.ref_kind, ref_value: ref.ref_value })),
      authority_class: 'cache_only',
      not_authority: true,
      expires_at: capsule.expires_at,
    },
  };
}

const agentPayload = (spec, kind, projectId, allowedActions) => ({
  agent_id: spec.agent_id,
  agent_kind: kind,
  functional_role: spec.functional_role,
  project_id: projectId,
  provider_identities: spec.provider_identities.map((identity) => ({ ...identity })),
  authority_scope: { allowed_projects: [projectId], allowed_actions: allowedActions },
  memory_class: 'cache_only',
  registered_at: AT_REQUEST,
});

const runPayload = (spec, projectId, workUnitId, parentRunId) => ({
  run_id: spec.run_id,
  parent_run_id: parentRunId,
  agent_id: spec.agent_id,
  task_id: spec.task_id,
  project_id: projectId,
  work_unit_id: workUnitId,
  lifecycle: 'started',
  provider: spec.provider,
  model_id: spec.model_id,
  reasoning_effort: spec.reasoning_effort,
  authority: 'read_only',
  started_at: AT_REQUEST,
  heartbeat_at: AT_REQUEST,
  ended_at: null,
  result_state: 'result_pending',
  side_effect_evidence_refs: [],
});

const usagePayload = (spec, observedAt) => ({
  event_id: spec.usage_event_id,
  run_id: spec.run_id,
  agent_id: spec.agent_id,
  provider: spec.provider,
  model_id: spec.model_id,
  attribution_kind: 'direct',
  tokens: { ...spec.tokens },
  cost_basis: 'token_proxy',
  cost_evidence_refs: [],
  observed_at: observedAt,
});

// Measured over plain records rather than a store handle, so the measurement itself can be
// exercised against deliberately inconsistent input. A checker that can only ever see clean data
// proves nothing. `capsule_bindings` pairs the project a capsule was bound FOR with the capsule.
export function measureProjectIsolation(input) {
  if (!isPlainObject(input)) return hold(S.INVALID_FIELD_VALUE, 'isolation_input');
  const { agents, runs, usage_events: usageEvents, capsule_bindings: capsuleBindings } = input;
  // Dense checks first: `every` skips array holes, so a sparse list would reach the loops below
  // and dereference undefined.
  if (![agents, runs, usageEvents, capsuleBindings].every(isDenseArray)) {
    return hold(S.INVALID_FIELD_VALUE, 'isolation_input');
  }
  if (!capsuleBindings.every((binding) => isPlainObject(binding) && isPlainObject(binding.capsule))) {
    return hold(S.INVALID_FIELD_VALUE, 'capsule_bindings');
  }
  if (![...agents, ...runs, ...usageEvents].every(isPlainObject)) {
    return hold(S.INVALID_FIELD_VALUE, 'isolation_records');
  }
  let crossProjectCapsuleBindings = 0;
  for (const binding of capsuleBindings) {
    if (binding.capsule.project_id !== binding.bound_for_project_id) crossProjectCapsuleBindings += 1;
  }

  const projectOfRun = new Map(runs.map((run) => [run.run_id, run.project_id]));
  let crossProjectParentLinks = 0;
  for (const run of runs) {
    if (run.parent_run_id === null) continue;
    if (projectOfRun.get(run.parent_run_id) !== run.project_id) crossProjectParentLinks += 1;
  }

  const projectOfAgent = new Map(agents.map((agent) => [agent.agent_id, agent.project_id]));
  let crossProjectUsageAttribution = 0;
  for (const event of usageEvents) {
    const runProject = projectOfRun.get(event.run_id);
    if (runProject === undefined || projectOfAgent.get(event.agent_id) !== runProject) crossProjectUsageAttribution += 1;
  }

  return {
    cross_project_capsule_bindings: crossProjectCapsuleBindings,
    cross_project_parent_links: crossProjectParentLinks,
    cross_project_usage_attribution: crossProjectUsageAttribution,
  };
}

const mergePrivacy = (left, right) => ({
  raw_fields_stored: left.raw_fields_stored + right.raw_fields_stored,
  secret_fields_stored: left.secret_fields_stored + right.secret_fields_stored,
  local_path_fields_stored: left.local_path_fields_stored + right.local_path_fields_stored,
});

const CAPSULE_RECORD_KEYS = Object.freeze(['schema_version', ...CAPSULE_KEYS]);

// The observation store audits its own record families. The capsule family and the Board row are
// this module's own output, so this module audits them; otherwise `privacy` would report zero for
// records nothing ever looked at.
export function auditProjectionPrivacy(perProject, boardRows) {
  const counters = { raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0 };
  if (!isDenseArray(perProject) || !isDenseArray(boardRows)) {
    counters.raw_fields_stored += 1;
    return counters;
  }
  const capsuleKeys = new Set([...CAPSULE_RECORD_KEYS, ...REF_KEYS]);
  const audit = (value, allowed) => {
    if (allowed !== null && findUnknownKeyDeep(value, allowed) !== null) counters.raw_fields_stored += 1;
    if (findSecret(value) !== null) counters.secret_fields_stored += 1;
    if (findLocalPath(value) !== null) counters.local_path_fields_stored += 1;
  };
  for (const entry of perProject) {
    if (!isPlainObject(entry)) { counters.raw_fields_stored += 1; continue; }
    audit(entry.capsule, capsuleKeys);
  }
  for (const row of boardRows) {
    if (!isPlainObject(row)) { counters.raw_fields_stored += 1; continue; }
    audit(row, null);
  }
  return counters;
}

function emptyResult(holds) {
  return {
    schema_version: P0S2_RESULT_SCHEMA,
    status: 'HOLD',
    holds,
    counts: null,
    agent_roster: [],
    job_rows: [],
    submission_order: [],
    dispatch_order: [],
    queue_depth_before_dispatch: 0,
    queue_depth_after_drain: 0,
    max_concurrent_leases: 0,
    starvation: null,
    crash_recovery: null,
    per_project: [],
    board_rows: [],
    isolation: null,
    privacy: null,
    privacy_sources: null,
    declared_effect_boundary: { ...DECLARED_EFFECT_BOUNDARY },
  };
}

export function runP0S2JobShop(rawFixture) {
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
  const projects = fixture.projects;
  const capsules = new Map();
  const capsuleBindings = [];
  let capsuleCrossProjectHolds = 0;

  note('register_host', registerHost(shop, {
    host_id: fixture.host.host_id,
    health: 'ok',
    capability_kinds: [...fixture.host.capability_kinds],
    observed_at_ms: 0,
  }));
  note('register_resource', registerResource(shop, {
    resource_id: fixture.resource.resource_id,
    host_id: fixture.host.host_id,
    tool_kind: fixture.resource.tool_kind,
    capacity: fixture.resource.capacity,
    health: 'ok',
    allowed_projects: projects.map((p) => p.project_id),
    allowed_actions: [...new Set(projects.map((spec) => spec.job.action))],
    observed_at_ms: 0,
  }));

  // Each project prepares independently: capsule, agents, runs, then one queued job.
  const prepared = [];
  for (let index = 0; index < projects.length; index += 1) {
    const spec = projects[index];
    const isFirst = index === 0;

    let capsuleInput = spec.capsule;
    if (fixture.cross_project_capsule === true && isFirst) capsuleInput = projects[1].capsule;
    if (fixture.expired_capsule === true && isFirst) capsuleInput = { ...spec.capsule, expires_at: CAPSULE_EXPIRED_AT };
    if (fixture.capsule_with_body === true && isFirst) capsuleInput = { ...spec.capsule, source_body: 'raw requirement text' };

    const bound = note(`bind_capsule:${index}`, bindContextCapsule(capsuleInput, {
      projectId: spec.project_id,
      workUnitId: spec.work_unit_id,
      nowUtc: CAPSULE_NOW,
    }));
    if (bound.status === 'HOLD') {
      if (bound.hold_code === S.CAPSULE_PROJECT_MISMATCH) capsuleCrossProjectHolds += 1;
      continue;
    }
    capsules.set(spec.project_id, bound.record);
    capsuleBindings.push({ bound_for_project_id: spec.project_id, capsule: bound.record });

    const requesterAgent = note(`register_requester:${index}`, registerAgent(
      store, agentPayload(spec.requester, 'project_isolated_functional', spec.project_id, ['request_spreadsheet_job']),
    ));
    const craftsmanAgent = note(`register_craftsman:${index}`, registerAgent(
      store, agentPayload(spec.craftsman, 'tool_specialist_craftsman', spec.project_id, [spec.job.action]),
    ));
    if (requesterAgent.status !== 'REGISTERED' || craftsmanAgent.status !== 'REGISTERED') continue;

    const requesterRun = note(`observe_requester_run:${index}`, observeRun(
      store, runPayload(spec.requester, spec.project_id, spec.work_unit_id, null),
    ));
    if (requesterRun.status !== 'OBSERVED') continue;

    // The cross-project probe hangs this craftsman run under another project's requester run.
    const parentRunId = fixture.cross_project_parent === true && index === 1
      ? projects[0].requester.run_id
      : spec.requester.run_id;
    const craftsmanRun = note(`observe_craftsman_run:${index}`, observeRun(
      store, runPayload(spec.craftsman, spec.project_id, spec.work_unit_id, parentRunId),
    ));
    if (craftsmanRun.status !== 'OBSERVED') continue;

    const submitted = note(`submit_job:${index}`, submitJob(shop, {
      job_id: spec.job.job_id,
      resource_id: fixture.resource.resource_id,
      priority: spec.job.priority,
      project_id: spec.project_id,
      agent_id: spec.craftsman.agent_id,
      run_id: spec.craftsman.run_id,
      action: spec.job.action,
      submitted_seq: spec.job.submitted_seq,
    }));
    if (submitted.status !== 'QUEUED') continue;
    prepared.push(spec);
  }

  const submissionOrder = prepared.map((spec) => spec.job.job_id);
  const queueDepthBeforeDispatch = projectJobShop(shop).queue_depth;

  // One resource, capacity one: the three jobs drain one at a time in priority-then-FIFO order.
  const dispatchOrder = [];
  let maxConcurrentLeases = 0;
  let leasesGranted = 0;
  let completionReplayNoOps = 0;
  let crashRecovery = null;
  let now = CLOCK.start;

  for (let round = 0; round < prepared.length; round += 1) {
    const leaseId = `lease-round-${round}`;
    const granted = note(`acquire_lease:${round}`, acquireLease(shop, {
      resource_id: fixture.resource.resource_id,
      lease_id: leaseId,
      now_ms: now,
      ttl_ms: CLOCK.leaseTtl,
    }));
    if (granted.status !== 'GRANTED') break;
    leasesGranted += 1;
    dispatchOrder.push(granted.job_id);
    maxConcurrentLeases = Math.max(
      maxConcurrentLeases,
      projectJobShop(shop, { now_ms: now }).resources[0].active_leases,
    );

    const artifactRef = prepared.find((spec) => spec.job.job_id === granted.job_id)?.artifact_ref ?? null;
    if (artifactRef === null) break;

    if (round === 0) {
      // The first worker crashes: its lease reaches TTL with no completion.
      const crashedAt = now + CLOCK.crashGap;
      if (fixture.timeout_without_reclaim === true) {
        // No reclaim happens; the stale lease tries to record anyway.
        const stale = note('complete_after_timeout', completeJob(shop, {
          lease_id: leaseId, job_id: granted.job_id, result_ref: artifactRef, now_ms: crashedAt,
        }));
        crashRecovery = {
          crashed_job_id: granted.job_id,
          first_epoch: granted.lease.fencing_epoch,
          reclaim_epoch: null,
          stale_completion_hold_code: stale.hold_code ?? null,
        };
        now = crashedAt + CLOCK.step;
        continue;
      }

      const reclaimId = `lease-round-${round}-reclaim`;
      const reclaimed = note('reclaim_lease', acquireLease(shop, {
        resource_id: fixture.resource.resource_id,
        lease_id: reclaimId,
        now_ms: crashedAt,
        ttl_ms: CLOCK.leaseTtl,
      }));
      if (reclaimed.status !== 'GRANTED') break;
      leasesGranted += 1;

      // The stale worker being fenced out is the designed outcome of the crash, not a fault, so
      // it is recorded as recovery evidence rather than pushed onto `holds`.
      const stale = completeJob(shop, {
        lease_id: leaseId, job_id: granted.job_id, result_ref: artifactRef, now_ms: crashedAt + CLOCK.step,
      });
      crashRecovery = {
        crashed_job_id: granted.job_id,
        first_epoch: granted.lease.fencing_epoch,
        reclaim_epoch: reclaimed.lease.fencing_epoch,
        stale_completion_hold_code: stale.hold_code ?? null,
      };

      const done = { lease_id: reclaimId, job_id: granted.job_id, result_ref: artifactRef, now_ms: crashedAt + CLOCK.step };
      note('complete_after_reclaim', completeJob(shop, done));
      const replay = note('replay_completion', completeJob(shop, done));
      if (replay.status === 'NO_OP') completionReplayNoOps += 1;
      now = crashedAt + CLOCK.step * 2;
      continue;
    }

    note(`complete_job:${round}`, completeJob(shop, {
      lease_id: leaseId, job_id: granted.job_id, result_ref: artifactRef, now_ms: now + CLOCK.step,
    }));
    now += CLOCK.step * 2;
  }

  // Usage and delivery receipts are recorded per project, never pooled.
  for (const spec of prepared) {
    note(`usage_requester:${spec.project_id}`, recordDirectUsage(store, usagePayload(spec.requester, AT_REQUEST)));
    note(`usage_craftsman:${spec.project_id}`, recordDirectUsage(store, usagePayload(spec.craftsman, AT_DELIVER)));
    note(`delivery_receipt:${spec.project_id}`, recordResultReceipt(store, {
      receipt_id: spec.delivery_receipt_id,
      run_id: spec.craftsman.run_id,
      agent_id: spec.craftsman.agent_id,
      receipt_kind: 'delivery',
      producer_evidence_kind: 'producer_observed',
      // Bound to this project's own requester run and work unit. A receipt that named no consumer
      // could be read as reaching any same-project run, which is the crossing this fixture exists
      // to keep closed.
      delivery_target: {
        target_run_id: spec.requester.run_id,
        target_agent_id: spec.requester.agent_id,
        target_work_unit_id: spec.work_unit_id,
      },
      refs: [{ ref_kind: 'artifact', ref_value: spec.artifact_ref }],
      observed_at: AT_DELIVER,
    }));
  }

  const storeCounts = projectStoreCounts(store);
  const shopView = projectJobShop(shop);
  const receipts = listReceipts(store) ?? [];

  const perProject = [];
  const boardRows = [];
  // assigned once both are built, below
  for (const spec of prepared) {
    const rollup = projectUsageRollup(store, { run_id: spec.requester.run_id });
    if (rollup.status !== 'PROJECTED') continue;
    // Scoped to this project's own craftsman run and agent: a receipt id alone would let one
    // project pass the delivery gate on another project's receipt.
    const deliveryReceipt = receipts.find((receipt) => receipt.receipt_id === spec.delivery_receipt_id
      && receipt.run_id === spec.craftsman.run_id
      && receipt.agent_id === spec.craftsman.agent_id
      && receipt.receipt_kind === 'delivery') ?? null;
    if (deliveryReceipt === null) continue;

    // Completion is read from the job ledger, not from the fact that a lease was granted.
    const jobRow = shopView.jobs.find((row) => row.job_id === spec.job.job_id) ?? null;
    if (jobRow === null || jobRow.recorded_completions === 0) continue;

    const row = {
      row_kind: 'agent_run',
      agent_id: spec.requester.agent_id,
      run_id: spec.requester.run_id,
      project_id: spec.project_id,
      organization_group_id: fixture.organization_group_id,
      display_label: spec.requester.display_label,
      status_label: '하위 결과 도착/취합 중',
      result_gate_state: 'result_ready_parent',
    };
    boardRows.push(row);
    perProject.push({
      project_id: spec.project_id,
      work_unit_id: spec.work_unit_id,
      agent_id: spec.requester.agent_id,
      craftsman_agent_id: spec.craftsman.agent_id,
      run_id: spec.requester.run_id,
      craftsman_run_id: spec.craftsman.run_id,
      job_id: spec.job.job_id,
      capsule: capsules.get(spec.project_id),
      usage: { self_usage: rollup.self_usage, child_direct_usage: rollup.child_direct_usage, subtree_usage: rollup.subtree_usage },
      completion_count: jobRow.recorded_completions,
      result_ref: jobRow.result_ref,
      delivery_refs: deliveryReceipt.refs.map((ref) => ref.ref_value),
      board_row: row,
    });
  }

  const projectionPrivacy = auditProjectionPrivacy(perProject, boardRows);
  const completedProjects = perProject.filter((entry) => entry.completion_count === 1).length;
  const dispatchedWithoutCompletion = dispatchOrder.filter((jobId) => {
    const row = shopView.jobs.find((entry) => entry.job_id === jobId);
    return row === undefined || row.recorded_completions === 0;
  }).length;
  const normalJob = projects.find((spec) => spec.job.priority === 'normal')?.job.job_id ?? null;

  return {
    schema_version: P0S2_RESULT_SCHEMA,
    status: holds.length === 0 ? 'PASS' : 'HOLD',
    holds,
    counts: {
      projects: projects.length,
      agents: storeCounts.agents,
      runs: storeCounts.runs,
      jobs_submitted: prepared.length,
      resources: shopView.resources.length,
      resource_capacity: shopView.resources[0]?.capacity ?? 0,
      leases_granted: leasesGranted,
      recorded_completions: shopView.recorded_completion_count,
      duplicate_completions: shopView.duplicate_completion_hold_count,
      fenced_completion_attempts: shopView.fenced_completion_attempt_count,
      completion_replay_no_ops: completionReplayNoOps,
      capsule_bindings: capsules.size,
      capsule_cross_project_holds: capsuleCrossProjectHolds,
      usage_events: storeCounts.usage_events,
      receipts: storeCounts.receipts,
      completed_projects: completedProjects,
      dispatched_without_completion: dispatchedWithoutCompletion,
    },
    agent_roster: (listAgents(store) ?? []).map((agent) => ({
      agent_id: agent.agent_id,
      agent_kind: agent.agent_kind,
      functional_role: agent.functional_role,
      project_id: agent.project_id,
      allowed_projects: [...agent.authority_scope.allowed_projects],
    })),
    job_rows: shopView.jobs.map((row) => ({ ...row })),
    submission_order: submissionOrder,
    dispatch_order: dispatchOrder,
    queue_depth_before_dispatch: queueDepthBeforeDispatch,
    queue_depth_after_drain: shopView.queue_depth,
    max_concurrent_leases: maxConcurrentLeases,
    starvation: {
      lowest_priority_job_id: normalJob,
      dispatched: dispatchOrder.includes(normalJob),
      dispatch_index: dispatchOrder.indexOf(normalJob),
    },
    crash_recovery: crashRecovery,
    per_project: perProject,
    board_rows: boardRows,
    isolation: measureProjectIsolation({
      agents: listAgents(store) ?? [],
      runs: listRuns(store) ?? [],
      usage_events: listUsageEvents(store) ?? [],
      capsule_bindings: capsuleBindings,
    }),
    privacy_sources: { store: storeCounts.privacy, projection: projectionPrivacy },
    privacy: mergePrivacy(storeCounts.privacy, projectionPrivacy),
    declared_effect_boundary: { ...DECLARED_EFFECT_BOUNDARY },
  };
}
