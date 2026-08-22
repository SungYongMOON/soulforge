import {
  COMPOSITE_SEPARATOR,
  deepFreeze,
  digestOf,
  findLocalPath,
  findSecret,
  findUnknownKeyDeep,
  guardEntry,
  hold,
  isCount,
  isPlainObject,
  isSafeId,
  isSafeRef,
  isUtcMs,
  unknownKeyIn,
} from './guard_primitives.mjs';

export const AGENT_RECORD_SCHEMA = 'soulforge.agent_observation.agent_record.v1';
export const RUN_RECORD_SCHEMA = 'soulforge.agent_observation.run_record.v1';
export const USAGE_EVENT_SCHEMA = 'soulforge.agent_observation.usage_event.v1';
export const RESULT_RECEIPT_SCHEMA = 'soulforge.agent_observation.result_receipt.v1';

export const OBSERVATION_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'SECRET_VALUE_FORBIDDEN',
  LOCAL_PATH_VALUE_FORBIDDEN: 'LOCAL_PATH_VALUE_FORBIDDEN',
  INPUT_TOO_DEEP: 'INPUT_TOO_DEEP',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  UNKNOWN_STORE: 'UNKNOWN_STORE',
  UNKNOWN_PROJECT: 'UNKNOWN_PROJECT',
  UNKNOWN_AGENT: 'UNKNOWN_AGENT',
  UNKNOWN_RUN: 'UNKNOWN_RUN',
  UNKNOWN_PARENT_RUN: 'UNKNOWN_PARENT_RUN',
  PROJECT_BINDING_MISMATCH: 'PROJECT_BINDING_MISMATCH',
  PARENT_PROJECT_MISMATCH: 'PARENT_PROJECT_MISMATCH',
  AGENT_MEMORY_NOT_AUTHORITY_REQUIRED: 'AGENT_MEMORY_NOT_AUTHORITY_REQUIRED',
  PROVIDER_IDENTITY_SLOT_CONFLICT: 'PROVIDER_IDENTITY_SLOT_CONFLICT',
  PROVIDER_IDENTITY_CROSSWALK_CONFLICT: 'PROVIDER_IDENTITY_CROSSWALK_CONFLICT',
  AGENT_RECORD_CONFLICT: 'AGENT_RECORD_CONFLICT',
  RUN_RECORD_CONFLICT: 'RUN_RECORD_CONFLICT',
  USAGE_EVENT_CONFLICT: 'USAGE_EVENT_CONFLICT',
  USAGE_CONTENT_DUPLICATE: 'USAGE_CONTENT_DUPLICATE',
  RESULT_RECEIPT_CONFLICT: 'RESULT_RECEIPT_CONFLICT',
  AGENT_RUN_MISMATCH: 'AGENT_RUN_MISMATCH',
  RUN_MODEL_MISMATCH: 'RUN_MODEL_MISMATCH',
  CHILD_USAGE_MERGE_FORBIDDEN: 'CHILD_USAGE_MERGE_FORBIDDEN',
  TOKEN_PARTITION_INVALID: 'TOKEN_PARTITION_INVALID',
  COST_EVIDENCE_REQUIRED: 'COST_EVIDENCE_REQUIRED',
  TEMPORAL_ORDER_INVALID: 'TEMPORAL_ORDER_INVALID',
  RESULT_WITHOUT_SIDE_EFFECT_EVIDENCE: 'RESULT_WITHOUT_SIDE_EFFECT_EVIDENCE',
  STRUCTURAL_EDGE_NOT_DELIVERY: 'STRUCTURAL_EDGE_NOT_DELIVERY',
});
const H = OBSERVATION_HOLD_CODES;

const ENTRY_CODES = Object.freeze({
  unknownField: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: H.SECRET_VALUE_FORBIDDEN,
  localPath: H.LOCAL_PATH_VALUE_FORBIDDEN,
  tooDeep: H.INPUT_TOO_DEEP,
});

export const AGENT_KINDS = Object.freeze(['project_isolated_functional', 'shared_capability', 'tool_specialist_craftsman', 'resource_controller']);
export const FUNCTIONAL_ROLES = Object.freeze(['hardware', 'software', 'systems_engineering', 'quality', 'document', 'spreadsheet']);
export const RUN_LIFECYCLES = Object.freeze(['started', 'running', 'waiting', 'stopped', 'terminal']);
export const RUN_AUTHORITIES = Object.freeze(['read_only', 'append_only', 'bounded_create_only', 'dispatch_only']);
export const RUN_RESULT_STATES = Object.freeze(['result_pending', 'result_observed', 'unknown']);
export const COST_BASES = Object.freeze(['token_proxy', 'list_price_estimate', 'billed_cost', 'subscription_credit_observation']);
// A cost basis that asserts real money or real credit must carry its own evidence refs.
export const COST_BASES_REQUIRING_EVIDENCE = Object.freeze(['billed_cost', 'subscription_credit_observation']);
export const RECEIPT_KINDS = Object.freeze(['result', 'delivery', 'artifact', 'approval', 'validation', 'recovery']);
// Ref kinds intentionally share the receipt vocabulary; kept internal so the two names cannot
// drift apart as two exported constants.
const REF_KINDS = RECEIPT_KINDS;
export const PRODUCER_EVIDENCE_KINDS = Object.freeze(['producer_observed', 'structural_only']);

const FIELDS = Object.freeze({
  agent: ['agent_id', 'agent_kind', 'functional_role', 'project_id', 'provider_identities', 'authority_scope', 'memory_class', 'registered_at'],
  authorityScope: ['allowed_projects', 'allowed_actions'],
  providerIdentity: ['provider', 'id_kind', 'id_value'],
  run: ['run_id', 'parent_run_id', 'agent_id', 'task_id', 'project_id', 'work_unit_id', 'lifecycle', 'provider', 'model_id', 'reasoning_effort', 'authority', 'started_at', 'heartbeat_at', 'ended_at', 'result_state', 'side_effect_evidence_refs'],
  usage: ['event_id', 'run_id', 'agent_id', 'provider', 'model_id', 'attribution_kind', 'tokens', 'cost_basis', 'cost_evidence_refs', 'observed_at'],
  tokens: ['input', 'cached_input', 'cache_write_input', 'output', 'reasoning_output'],
  receipt: ['receipt_id', 'run_id', 'agent_id', 'receipt_kind', 'producer_evidence_kind', 'refs', 'observed_at'],
  ref: ['ref_kind', 'ref_value'],
});

export const RECORD_KEY_ALLOWLIST = Object.freeze({
  agent: Object.freeze(['schema_version', ...FIELDS.agent]),
  run: Object.freeze(['schema_version', ...FIELDS.run]),
  usage: Object.freeze(['schema_version', ...FIELDS.usage]),
  receipt: Object.freeze(['schema_version', ...FIELDS.receipt]),
});

// Every key that may legally appear below the top level of a stored record.
const NESTED_RECORD_KEYS = Object.freeze([
  ...FIELDS.providerIdentity, ...FIELDS.authorityScope, ...FIELDS.tokens, ...FIELDS.ref,
]);

const MAX_TOKENS = 1_000_000_000;
const MAX_LIST = 64;

// Store state lives outside the handle so an append-only ledger cannot be cleared, spliced, or
// rewritten by a consumer that happens to hold the store object.
const STATE = new WeakMap();

const stateOf = (store) => STATE.get(store);

function guardRefList(list, allowedKinds, { allowEmpty }) {
  if (!Array.isArray(list) || list.length > MAX_LIST) return hold(H.INVALID_FIELD_VALUE, 'ref_list');
  if (!allowEmpty && list.length === 0) return hold(H.INVALID_FIELD_VALUE, 'ref_list_empty');
  for (const entry of list) {
    if (!isPlainObject(entry)) return hold(H.INVALID_FIELD_VALUE, 'ref_entry');
    const extra = unknownKeyIn(entry, FIELDS.ref);
    if (extra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, extra);
    if (!allowedKinds.includes(entry.ref_kind)) return hold(H.INVALID_FIELD_VALUE, 'ref_kind');
    if (!isSafeRef(entry.ref_value)) return hold(H.INVALID_FIELD_VALUE, 'ref_value');
  }
  return null;
}

const normalizeRefs = (list) => list.map((ref) => ({ ref_kind: ref.ref_kind, ref_value: ref.ref_value }));

function append(map, key, record, conflictCode) {
  const digest = digestOf(record);
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing.digest === digest
      ? { status: 'NO_OP', record: existing.record }
      : hold(conflictCode);
  }
  const frozen = deepFreeze(record);
  map.set(key, { record: frozen, digest });
  return { status: 'NEW', record: frozen };
}

export function createObservationStore() {
  const store = Object.freeze({ kind: 'soulforge.agent_observation.store.v1' });
  STATE.set(store, {
    agents: new Map(),
    runs: new Map(),
    usage: new Map(),
    receipts: new Map(),
    providerCrosswalk: new Map(),
    usageContentIndex: new Map(),
  });
  return store;
}

export function registerAgent(store, input) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guard = guardEntry(input, FIELDS.agent, ENTRY_CODES);
  if (guard !== null) return guard;

  if (!isSafeId(input.agent_id)) return hold(H.INVALID_FIELD_VALUE, 'agent_id');
  if (input.project_id === null || input.project_id === undefined || input.project_id === '') return hold(H.UNKNOWN_PROJECT);
  if (!isSafeId(input.project_id)) return hold(H.INVALID_FIELD_VALUE, 'project_id');
  if (input.memory_class !== 'cache_only') return hold(H.AGENT_MEMORY_NOT_AUTHORITY_REQUIRED);
  if (!AGENT_KINDS.includes(input.agent_kind)) return hold(H.INVALID_FIELD_VALUE, 'agent_kind');
  if (!FUNCTIONAL_ROLES.includes(input.functional_role)) return hold(H.INVALID_FIELD_VALUE, 'functional_role');
  if (!isUtcMs(input.registered_at)) return hold(H.INVALID_FIELD_VALUE, 'registered_at');

  const scope = input.authority_scope;
  if (!isPlainObject(scope)) return hold(H.INVALID_FIELD_VALUE, 'authority_scope');
  const scopeExtra = unknownKeyIn(scope, FIELDS.authorityScope);
  if (scopeExtra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, scopeExtra);
  for (const key of FIELDS.authorityScope) {
    const list = scope[key];
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_LIST || !list.every(isSafeId)) return hold(H.INVALID_FIELD_VALUE, key);
  }
  if (!scope.allowed_projects.includes(input.project_id)) return hold(H.PROJECT_BINDING_MISMATCH, 'authority_scope');

  const identities = input.provider_identities;
  if (!Array.isArray(identities) || identities.length === 0 || identities.length > MAX_LIST) return hold(H.INVALID_FIELD_VALUE, 'provider_identities');
  const slots = new Set();
  for (const identity of identities) {
    if (!isPlainObject(identity)) return hold(H.INVALID_FIELD_VALUE, 'provider_identity');
    const extra = unknownKeyIn(identity, FIELDS.providerIdentity);
    if (extra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, extra);
    if (!isSafeId(identity.provider) || !isSafeId(identity.id_kind) || !isSafeId(identity.id_value)) return hold(H.INVALID_FIELD_VALUE, 'provider_identity');
    const slot = `${identity.provider}${COMPOSITE_SEPARATOR}${identity.id_kind}`;
    if (slots.has(slot)) return hold(H.PROVIDER_IDENTITY_SLOT_CONFLICT, identity.id_kind);
    slots.add(slot);
  }
  const crosswalkKeys = identities.map((identity) => [identity.provider, identity.id_kind, identity.id_value].join(COMPOSITE_SEPARATOR));
  for (const key of crosswalkKeys) {
    const boundAgent = state.providerCrosswalk.get(key);
    if (boundAgent !== undefined && boundAgent !== input.agent_id) return hold(H.PROVIDER_IDENTITY_CROSSWALK_CONFLICT);
  }

  const record = {
    schema_version: AGENT_RECORD_SCHEMA,
    agent_id: input.agent_id,
    agent_kind: input.agent_kind,
    functional_role: input.functional_role,
    project_id: input.project_id,
    provider_identities: identities.map((i) => ({ provider: i.provider, id_kind: i.id_kind, id_value: i.id_value })),
    authority_scope: { allowed_projects: [...scope.allowed_projects], allowed_actions: [...scope.allowed_actions] },
    memory_class: 'cache_only',
    registered_at: input.registered_at,
  };

  const written = append(state.agents, input.agent_id, record, H.AGENT_RECORD_CONFLICT);
  if (written.status === 'HOLD') return written;
  if (written.status === 'NO_OP') return { status: 'NO_OP', agent_id: input.agent_id, record: written.record };
  for (const key of crosswalkKeys) state.providerCrosswalk.set(key, input.agent_id);
  return { status: 'REGISTERED', agent_id: input.agent_id, record: written.record };
}

export function observeRun(store, input) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guard = guardEntry(input, FIELDS.run, ENTRY_CODES);
  if (guard !== null) return guard;

  if (!isSafeId(input.run_id)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  if (!isSafeId(input.agent_id)) return hold(H.INVALID_FIELD_VALUE, 'agent_id');
  const agent = state.agents.get(input.agent_id);
  if (agent === undefined) return hold(H.UNKNOWN_AGENT);

  if (input.parent_run_id !== null) {
    if (!isSafeId(input.parent_run_id)) return hold(H.INVALID_FIELD_VALUE, 'parent_run_id');
    if (input.parent_run_id === input.run_id) return hold(H.INVALID_FIELD_VALUE, 'parent_run_id_self');
    if (!state.runs.has(input.parent_run_id)) return hold(H.UNKNOWN_PARENT_RUN);
  }
  const parent = input.parent_run_id === null ? null : state.runs.get(input.parent_run_id);

  if (input.project_id === null || input.project_id === undefined || input.project_id === '') return hold(H.UNKNOWN_PROJECT);
  if (!isSafeId(input.project_id)) return hold(H.INVALID_FIELD_VALUE, 'project_id');
  if (input.project_id !== agent.record.project_id) return hold(H.PROJECT_BINDING_MISMATCH);
  // A child run in another project would carry that project's work under this parent's subtree.
  if (parent !== null && parent.record.project_id !== input.project_id) return hold(H.PARENT_PROJECT_MISMATCH);

  for (const key of ['task_id', 'work_unit_id']) {
    if (input[key] !== null && !isSafeId(input[key])) return hold(H.INVALID_FIELD_VALUE, key);
  }
  if (!RUN_LIFECYCLES.includes(input.lifecycle)) return hold(H.INVALID_FIELD_VALUE, 'lifecycle');
  if (!RUN_AUTHORITIES.includes(input.authority)) return hold(H.INVALID_FIELD_VALUE, 'authority');
  if (!RUN_RESULT_STATES.includes(input.result_state)) return hold(H.INVALID_FIELD_VALUE, 'result_state');
  if (!isSafeId(input.provider)) return hold(H.INVALID_FIELD_VALUE, 'provider');
  if (!isSafeId(input.model_id)) return hold(H.INVALID_FIELD_VALUE, 'model_id');
  if (!isSafeId(input.reasoning_effort)) return hold(H.INVALID_FIELD_VALUE, 'reasoning_effort');
  if (!isUtcMs(input.started_at)) return hold(H.INVALID_FIELD_VALUE, 'started_at');
  if (!isUtcMs(input.heartbeat_at)) return hold(H.INVALID_FIELD_VALUE, 'heartbeat_at');
  if (input.ended_at !== null && !isUtcMs(input.ended_at)) return hold(H.INVALID_FIELD_VALUE, 'ended_at');
  if (input.heartbeat_at < input.started_at) return hold(H.TEMPORAL_ORDER_INVALID, 'heartbeat_before_start');
  if (input.ended_at !== null && input.ended_at < input.started_at) return hold(H.TEMPORAL_ORDER_INVALID, 'end_before_start');

  const refGuard = guardRefList(input.side_effect_evidence_refs, REF_KINDS, { allowEmpty: true });
  if (refGuard !== null) return refGuard;
  if (input.result_state === 'result_observed' && input.side_effect_evidence_refs.length === 0) return hold(H.RESULT_WITHOUT_SIDE_EFFECT_EVIDENCE);

  const record = {
    schema_version: RUN_RECORD_SCHEMA,
    run_id: input.run_id,
    parent_run_id: input.parent_run_id,
    agent_id: input.agent_id,
    task_id: input.task_id,
    project_id: input.project_id,
    work_unit_id: input.work_unit_id,
    lifecycle: input.lifecycle,
    provider: input.provider,
    model_id: input.model_id,
    reasoning_effort: input.reasoning_effort,
    authority: input.authority,
    started_at: input.started_at,
    heartbeat_at: input.heartbeat_at,
    ended_at: input.ended_at,
    result_state: input.result_state,
    side_effect_evidence_refs: normalizeRefs(input.side_effect_evidence_refs),
  };

  const written = append(state.runs, input.run_id, record, H.RUN_RECORD_CONFLICT);
  if (written.status === 'HOLD') return written;
  return { status: written.status === 'NO_OP' ? 'NO_OP' : 'OBSERVED', run_id: input.run_id, record: written.record };
}

export function recordDirectUsage(store, input) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guard = guardEntry(input, FIELDS.usage, ENTRY_CODES);
  if (guard !== null) return guard;

  if (!isSafeId(input.event_id)) return hold(H.INVALID_FIELD_VALUE, 'event_id');
  if (input.attribution_kind !== 'direct') return hold(H.CHILD_USAGE_MERGE_FORBIDDEN);
  if (!isSafeId(input.run_id)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  const run = state.runs.get(input.run_id);
  if (run === undefined) return hold(H.UNKNOWN_RUN);
  if (input.agent_id !== run.record.agent_id) return hold(H.AGENT_RUN_MISMATCH);
  if (!isSafeId(input.provider)) return hold(H.INVALID_FIELD_VALUE, 'provider');
  if (!isSafeId(input.model_id)) return hold(H.INVALID_FIELD_VALUE, 'model_id');
  if (input.provider !== run.record.provider || input.model_id !== run.record.model_id) return hold(H.RUN_MODEL_MISMATCH);
  if (!COST_BASES.includes(input.cost_basis)) return hold(H.INVALID_FIELD_VALUE, 'cost_basis');
  if (!isUtcMs(input.observed_at)) return hold(H.INVALID_FIELD_VALUE, 'observed_at');
  if (input.observed_at < run.record.started_at) return hold(H.TEMPORAL_ORDER_INVALID, 'usage_before_run_start');

  const costRefs = input.cost_evidence_refs ?? [];
  const costGuard = guardRefList(costRefs, REF_KINDS, { allowEmpty: true });
  if (costGuard !== null) return costGuard;
  if (COST_BASES_REQUIRING_EVIDENCE.includes(input.cost_basis) && costRefs.length === 0) return hold(H.COST_EVIDENCE_REQUIRED);

  const tokens = input.tokens;
  if (!isPlainObject(tokens)) return hold(H.INVALID_FIELD_VALUE, 'tokens');
  const tokenExtra = unknownKeyIn(tokens, FIELDS.tokens);
  if (tokenExtra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, tokenExtra);
  for (const key of FIELDS.tokens) if (!isCount(tokens[key], MAX_TOKENS)) return hold(H.INVALID_FIELD_VALUE, `tokens.${key}`);
  if (tokens.cached_input + tokens.cache_write_input > tokens.input) return hold(H.TOKEN_PARTITION_INVALID, 'input');
  if (tokens.reasoning_output > tokens.output) return hold(H.TOKEN_PARTITION_INVALID, 'output');

  const record = {
    schema_version: USAGE_EVENT_SCHEMA,
    event_id: input.event_id,
    run_id: input.run_id,
    agent_id: input.agent_id,
    provider: input.provider,
    model_id: input.model_id,
    attribution_kind: 'direct',
    tokens: { ...tokens },
    cost_basis: input.cost_basis,
    cost_evidence_refs: normalizeRefs(costRefs),
    observed_at: input.observed_at,
  };

  // Natural key: the same run/agent/model/time/token vector re-emitted under a fresh correlation
  // ID must not silently double the ledger. Cost fields are excluded on purpose - re-emitting the
  // same measurement under a different cost basis or with an added evidence ref is the same
  // measurement, and including them would let it be counted twice.
  const contentKey = digestOf({
    ...record, event_id: null, cost_basis: null, cost_evidence_refs: null,
  });
  const contentOwner = state.usageContentIndex.get(contentKey);
  if (contentOwner !== undefined && contentOwner !== input.event_id) return hold(H.USAGE_CONTENT_DUPLICATE);

  const written = append(state.usage, input.event_id, record, H.USAGE_EVENT_CONFLICT);
  if (written.status === 'HOLD') return written;
  if (written.status === 'NEW') state.usageContentIndex.set(contentKey, input.event_id);
  return { status: written.status === 'NO_OP' ? 'NO_OP' : 'RECORDED', event_id: input.event_id, record: written.record };
}

export function recordResultReceipt(store, input) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guard = guardEntry(input, FIELDS.receipt, ENTRY_CODES);
  if (guard !== null) return guard;

  if (!isSafeId(input.receipt_id)) return hold(H.INVALID_FIELD_VALUE, 'receipt_id');
  if (!isSafeId(input.run_id)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  const run = state.runs.get(input.run_id);
  if (run === undefined) return hold(H.UNKNOWN_RUN);
  if (input.agent_id !== run.record.agent_id) return hold(H.AGENT_RUN_MISMATCH);
  if (!RECEIPT_KINDS.includes(input.receipt_kind)) return hold(H.INVALID_FIELD_VALUE, 'receipt_kind');
  if (!PRODUCER_EVIDENCE_KINDS.includes(input.producer_evidence_kind)) return hold(H.INVALID_FIELD_VALUE, 'producer_evidence_kind');
  if (input.receipt_kind === 'delivery' && input.producer_evidence_kind === 'structural_only') return hold(H.STRUCTURAL_EDGE_NOT_DELIVERY);
  if (!isUtcMs(input.observed_at)) return hold(H.INVALID_FIELD_VALUE, 'observed_at');
  if (input.observed_at < run.record.started_at) return hold(H.TEMPORAL_ORDER_INVALID, 'receipt_before_run_start');

  const refGuard = guardRefList(input.refs, REF_KINDS, { allowEmpty: false });
  if (refGuard !== null) return refGuard;

  const record = {
    schema_version: RESULT_RECEIPT_SCHEMA,
    receipt_id: input.receipt_id,
    run_id: input.run_id,
    agent_id: input.agent_id,
    receipt_kind: input.receipt_kind,
    producer_evidence_kind: input.producer_evidence_kind,
    refs: normalizeRefs(input.refs),
    observed_at: input.observed_at,
  };

  const written = append(state.receipts, input.receipt_id, record, H.RESULT_RECEIPT_CONFLICT);
  if (written.status === 'HOLD') return written;
  return { status: written.status === 'NO_OP' ? 'NO_OP' : 'RECORDED', receipt_id: input.receipt_id, record: written.record };
}

const emptyUsage = () => ({
  event_count: 0,
  total_tokens: 0,
  input_tokens: 0,
  cached_input_tokens: 0,
  cache_write_input_tokens: 0,
  output_tokens: 0,
  reasoning_output_tokens: 0,
});

function addUsage(target, record) {
  const t = record.tokens;
  target.event_count += 1;
  target.input_tokens += t.input;
  target.cached_input_tokens += t.cached_input;
  target.cache_write_input_tokens += t.cache_write_input;
  target.output_tokens += t.output;
  target.reasoning_output_tokens += t.reasoning_output;
  // input already contains cached and cache-write; reasoning_output is a subset of output.
  target.total_tokens += t.input + t.output;
  return target;
}

function childRunIds(state, runId) {
  const children = [];
  for (const entry of state.runs.values()) if (entry.record.parent_run_id === runId) children.push(entry.record.run_id);
  return children;
}

function descendantRunIds(state, runId) {
  const seen = new Set();
  const stack = childRunIds(state, runId);
  while (stack.length > 0) {
    const next = stack.pop();
    if (seen.has(next)) continue;
    seen.add(next);
    for (const child of childRunIds(state, next)) if (!seen.has(child)) stack.push(child);
  }
  return seen;
}

export function projectUsageRollup(store, request) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  if (!isPlainObject(request)) return hold(H.INVALID_FIELD_VALUE, 'request');
  const runId = request.run_id;
  if (!isSafeId(runId)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  // A typo must read as unknown, never as "this manager used nothing".
  if (!state.runs.has(runId)) return hold(H.UNKNOWN_RUN);

  const self = emptyUsage();
  const childDirect = emptyUsage();
  const subtree = emptyUsage();
  const direct = new Set(childRunIds(state, runId));
  const descendants = descendantRunIds(state, runId);

  for (const entry of state.usage.values()) {
    const record = entry.record;
    if (record.run_id === runId) {
      addUsage(self, record);
      addUsage(subtree, record);
      continue;
    }
    if (direct.has(record.run_id)) addUsage(childDirect, record);
    if (descendants.has(record.run_id)) addUsage(subtree, record);
  }

  return { status: 'PROJECTED', run_id: runId, self_usage: self, child_direct_usage: childDirect, subtree_usage: subtree };
}

// Exported as a pure function over records so the audit itself can be exercised against a
// deliberately bad record. A guard that can only ever see clean input proves nothing.
export function auditRecordPrivacy(records, allowedKeys) {
  if (!Array.isArray(records) || !Array.isArray(allowedKeys)) {
    return hold(H.INVALID_FIELD_VALUE, 'audit_input');
  }
  // Nested keys count too: a raw field hidden inside a ref entry or a token block is still a raw
  // field stored. The allowlist is the record's own keys plus every legal nested key.
  const allowed = new Set([...allowedKeys, ...NESTED_RECORD_KEYS]);
  const counters = { raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0 };
  for (const record of records) {
    // A value too deep to scan is counted as a finding on every axis rather than passed as clean.
    const unknownKey = findUnknownKeyDeep(record, allowed);
    const secret = findSecret(record);
    const localPath = findLocalPath(record);
    if (unknownKey !== null) counters.raw_fields_stored += 1;
    if (secret !== null) counters.secret_fields_stored += 1;
    if (localPath !== null) counters.local_path_fields_stored += 1;
  }
  return counters;
}

function mergeCounters(target, source) {
  for (const key of Object.keys(source)) target[key] += source[key];
  return target;
}

export function projectStoreCounts(store) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);

  const privacy = { raw_fields_stored: 0, secret_fields_stored: 0, local_path_fields_stored: 0 };
  mergeCounters(privacy, auditRecordPrivacy(listAgents(store), RECORD_KEY_ALLOWLIST.agent));
  mergeCounters(privacy, auditRecordPrivacy(listRuns(store), RECORD_KEY_ALLOWLIST.run));
  mergeCounters(privacy, auditRecordPrivacy(listUsageEvents(store), RECORD_KEY_ALLOWLIST.usage));
  mergeCounters(privacy, auditRecordPrivacy(listReceipts(store), RECORD_KEY_ALLOWLIST.receipt));

  return {
    status: 'PROJECTED',
    agents: state.agents.size,
    runs: state.runs.size,
    usage_events: state.usage.size,
    receipts: state.receipts.size,
    privacy,
    // A declared boundary, not a measurement. What actually proves it is the absence of any
    // effectful import or global call, which the validator checks against the module source.
    declared_effect_boundary: {
      erp_world_tree_writes: 0,
      board_enrollment_writes: 0,
      result_gate_writes: 0,
      file_writes: 0,
      external_calls: 0,
    },
  };
}

// Returns null - not an empty array - for an unrecognized handle, so an unknown store can never
// read as "this store holds nothing".
const recordsOf = (store, mapName) => {
  const state = stateOf(store);
  return state === undefined ? null : [...state[mapName].values()].map((entry) => entry.record);
};

export const listAgents = (store) => recordsOf(store, 'agents');
export const listRuns = (store) => recordsOf(store, 'runs');
export const listUsageEvents = (store) => recordsOf(store, 'usage');
export const listReceipts = (store) => recordsOf(store, 'receipts');
