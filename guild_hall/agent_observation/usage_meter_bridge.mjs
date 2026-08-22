/**
 * Projects an Agent Observation usage record onto the ledger that already exists.
 *
 * The observation modules define `soulforge.agent_observation.usage_event.v1`, and
 * `guild_hall/ai_usage_meter` defines `soulforge.ai_usage_event.v1`. Two rival usage schemas is one
 * too many, so this module makes the observation record a *projection* of the meter contract rather
 * than a competitor to it. The projection is checked by the meter's own `validateUsageEvent`, not by
 * a local restatement of what that validator is believed to require.
 *
 * Boundaries this module keeps:
 *   - It writes nothing, opens no file, and never reads the persisted meter state.
 *   - It invents no identity. Anything the observation model does not own must arrive in an explicit
 *     binding, and a missing binding field is a HOLD rather than a default.
 *   - It refuses to project a cost basis the meter contract cannot express, instead of flattening
 *     observed money into `rate_unknown` or inventing a number to satisfy `calculated`.
 */

import {
  USAGE_EVENT_SCHEMA as METER_USAGE_EVENT_SCHEMA,
  USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND,
  validateUsageEvent,
} from '../ai_usage_meter/usage_meter.mjs';

import {
  guardEntry,
  hold,
  isCount,
  isSafeId,
  isUtcMs,
} from './guard_primitives.mjs';

import {
  listAgents,
  listRuns,
  listUsageEvents,
} from './agent_observation.mjs';

export const BRIDGE_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'SECRET_VALUE_FORBIDDEN',
  LOCAL_PATH_VALUE_FORBIDDEN: 'LOCAL_PATH_VALUE_FORBIDDEN',
  INPUT_TOO_DEEP: 'INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'ACCESSOR_PROPERTY_FORBIDDEN',
  INVALID_BINDING_FIELD: 'INVALID_BINDING_FIELD',
  UNKNOWN_USAGE_EVENT: 'UNKNOWN_USAGE_EVENT',
  UNKNOWN_RUN: 'UNKNOWN_RUN',
  UNKNOWN_AGENT: 'UNKNOWN_AGENT',
  PROVIDER_NOT_METER_SOURCE_KIND: 'PROVIDER_NOT_METER_SOURCE_KIND',
  PROVIDER_THREAD_IDENTITY_MISSING: 'PROVIDER_THREAD_IDENTITY_MISSING',
  COST_BASIS_NOT_PROJECTABLE: 'COST_BASIS_NOT_PROJECTABLE',
  RUN_LINEAGE_TOO_DEEP: 'RUN_LINEAGE_TOO_DEEP',
  RUN_TIME_INVALID: 'RUN_TIME_INVALID',
  METER_VALIDATION_REJECTED: 'METER_VALIDATION_REJECTED',
});

const B = BRIDGE_HOLD_CODES;

const ENTRY_CODES = Object.freeze({
  unknownField: B.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: B.SECRET_VALUE_FORBIDDEN,
  localPath: B.LOCAL_PATH_VALUE_FORBIDDEN,
  tooDeep: B.INPUT_TOO_DEEP,
  tooLarge: B.INPUT_TOO_LARGE,
  hostileInput: B.HOSTILE_INPUT_REFUSED,
  accessor: B.ACCESSOR_PROPERTY_FORBIDDEN,
});

/**
 * The meter's `source.kind` is a closed three-value enum. A provider outside it has no truthful
 * representation, so it holds rather than being coerced into the nearest member. Hermes is absent
 * on purpose: adding it is a migration of a validated schema with persisted state behind it, and
 * that decision does not belong to a projection function.
 */
export const PROVIDER_TO_METER_SOURCE_KIND = Object.freeze({
  codex: 'codex_session_jsonl',
  claude: 'claude_session_jsonl',
  antigravity: 'antigravity_conversation_db',
});

/**
 * `token_proxy` and `list_price_estimate` are truthfully `rate_unknown` in the meter: no money was
 * observed. `billed_cost` and `subscription_credit_observation` did observe a charge, and the
 * observation record carries only the evidence refs for it, not the amount. Projecting those as
 * `rate_unknown` would silently discard an observed charge and projecting them as `calculated`
 * would require inventing a total, so both hold.
 */
export const METER_PROJECTABLE_COST_BASES = Object.freeze(['token_proxy', 'list_price_estimate']);

export const BINDING_FIELDS = Object.freeze([
  'event_id',
  'organization_id',
  'team_id',
  'turn_id',
  'root_turn_id',
  'service_tier',
  'context_window',
  'model_invocation_count',
  'max_invocation_input_tokens',
  'rate_card_id',
  'source_ref',
  'originator',
]);

const MAX_LINEAGE_DEPTH = 32;
const MAX_TOKENS = 1_000_000_000;
const MAX_TEXT = 200;

const isBoundedText = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT;

/** UTC milliseconds in the observation model, an ISO instant in the meter. Deterministic, no clock. */
function toMeterTimestamp(utcMs) {
  const parsed = Date.parse(utcMs);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function indexBy(records, key) {
  const index = new Map();
  for (const record of records) index.set(record[key], record);
  return index;
}

/**
 * Resolves the provider-side thread identity for an agent from the crosswalk that `registerAgent`
 * already maintains. This is what the crosswalk is for: the meter speaks in provider thread ids and
 * the observation model speaks in durable agent ids, and neither has to learn the other's vocabulary.
 */
function resolveThreadIdentity(agent, provider) {
  if (agent === undefined) return null;
  for (const identity of agent.provider_identities) {
    if (identity.provider === provider && identity.id_kind === 'thread_id') return identity.id_value;
  }
  return null;
}

/**
 * Walks the parent chain to the root run, returning the root and the depth of the starting run.
 * The chain is bounded: a malformed store must hold rather than spin.
 */
function walkLineage(run, runIndex) {
  let current = run;
  let depth = 0;
  const seen = new Set([run.run_id]);
  while (current.parent_run_id !== null) {
    const parent = runIndex.get(current.parent_run_id);
    if (parent === undefined) return { status: 'HOLD', hold_code: B.UNKNOWN_RUN, detail: 'parent_run' };
    if (seen.has(parent.run_id)) return { status: 'HOLD', hold_code: B.RUN_LINEAGE_TOO_DEEP, detail: 'cycle' };
    seen.add(parent.run_id);
    depth += 1;
    if (depth > MAX_LINEAGE_DEPTH) return { status: 'HOLD', hold_code: B.RUN_LINEAGE_TOO_DEEP, detail: 'depth' };
    current = parent;
  }
  return { status: 'OK', root: current, depth };
}

/**
 * Projects one recorded observation usage event onto `soulforge.ai_usage_event.v1`.
 *
 * Returns `{ status: 'PROJECTED', event }` where `event` has already passed the meter's own
 * validator, or a hold. The store is not modified and nothing is persisted; handing the event to the
 * meter is a separate, gated action.
 */
export function projectMeterUsageEvent(store, rawBinding) {
  const guarded = guardEntry(rawBinding, BINDING_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const binding = guarded.value;

  for (const field of ['event_id', 'organization_id', 'team_id', 'turn_id', 'root_turn_id', 'service_tier']) {
    if (!isSafeId(binding[field])) return hold(B.INVALID_BINDING_FIELD, field);
  }
  for (const field of ['rate_card_id', 'source_ref']) {
    if (!isBoundedText(binding[field])) return hold(B.INVALID_BINDING_FIELD, field);
  }
  if (binding.originator !== null && !isBoundedText(binding.originator)) {
    return hold(B.INVALID_BINDING_FIELD, 'originator');
  }
  if (binding.context_window !== null && !isCount(binding.context_window, MAX_TOKENS)) {
    return hold(B.INVALID_BINDING_FIELD, 'context_window');
  }
  for (const field of ['model_invocation_count', 'max_invocation_input_tokens']) {
    if (!isCount(binding[field], MAX_TOKENS)) return hold(B.INVALID_BINDING_FIELD, field);
  }

  const usageEvent = indexBy(listUsageEvents(store), 'event_id').get(binding.event_id);
  if (usageEvent === undefined) return hold(B.UNKNOWN_USAGE_EVENT);

  const runIndex = indexBy(listRuns(store), 'run_id');
  const run = runIndex.get(usageEvent.run_id);
  if (run === undefined) return hold(B.UNKNOWN_RUN);

  const agentIndex = indexBy(listAgents(store), 'agent_id');
  const agent = agentIndex.get(usageEvent.agent_id);
  if (agent === undefined) return hold(B.UNKNOWN_AGENT);

  const sourceKind = Object.hasOwn(PROVIDER_TO_METER_SOURCE_KIND, usageEvent.provider)
    ? PROVIDER_TO_METER_SOURCE_KIND[usageEvent.provider]
    : null;
  if (sourceKind === null) return hold(B.PROVIDER_NOT_METER_SOURCE_KIND, usageEvent.provider);

  if (!METER_PROJECTABLE_COST_BASES.includes(usageEvent.cost_basis)) {
    return hold(B.COST_BASIS_NOT_PROJECTABLE, usageEvent.cost_basis);
  }

  const threadId = resolveThreadIdentity(agent, usageEvent.provider);
  if (threadId === null || !isSafeId(threadId)) return hold(B.PROVIDER_THREAD_IDENTITY_MISSING, usageEvent.provider);

  const lineage = walkLineage(run, runIndex);
  if (lineage.status === 'HOLD') return lineage;

  let parentThreadId = null;
  if (run.parent_run_id !== null) {
    const parentRun = runIndex.get(run.parent_run_id);
    parentThreadId = resolveThreadIdentity(agentIndex.get(parentRun.agent_id), parentRun.provider);
    if (parentThreadId === null || !isSafeId(parentThreadId)) {
      return hold(B.PROVIDER_THREAD_IDENTITY_MISSING, 'parent_run');
    }
  }

  const rootRun = lineage.root;
  const rootThreadId = rootRun.run_id === run.run_id
    ? threadId
    : resolveThreadIdentity(agentIndex.get(rootRun.agent_id), rootRun.provider);
  if (rootThreadId === null || !isSafeId(rootThreadId)) return hold(B.PROVIDER_THREAD_IDENTITY_MISSING, 'root_run');

  if (!isUtcMs(run.started_at)) return hold(B.RUN_TIME_INVALID, 'started_at');
  const startedAt = toMeterTimestamp(run.started_at);
  if (startedAt === null) return hold(B.RUN_TIME_INVALID, 'started_at');

  let completedAt = null;
  let durationMs = null;
  if (run.ended_at !== null) {
    if (!isUtcMs(run.ended_at)) return hold(B.RUN_TIME_INVALID, 'ended_at');
    completedAt = toMeterTimestamp(run.ended_at);
    if (completedAt === null) return hold(B.RUN_TIME_INVALID, 'ended_at');
    durationMs = Date.parse(run.ended_at) - Date.parse(run.started_at);
    if (!Number.isSafeInteger(durationMs) || durationMs < 0) return hold(B.RUN_TIME_INVALID, 'duration');
  }

  const tokens = usageEvent.tokens;
  const event = {
    schema_version: METER_USAGE_EVENT_SCHEMA,
    event_id: usageEvent.event_id,
    organization_id: binding.organization_id,
    team_id: binding.team_id,
    project_id: run.project_id,
    work_id: run.work_unit_id,
    thread_id: threadId,
    turn_id: binding.turn_id,
    parent_thread_id: parentThreadId,
    root_thread_id: rootThreadId,
    root_turn_id: binding.root_turn_id,
    source: {
      kind: sourceKind,
      source_ref: binding.source_ref,
      originator: binding.originator,
    },
    actor: {
      node_id: run.run_id,
      agent_id: agent.agent_id,
      agent_depth: lineage.depth,
      role: agent.functional_role,
    },
    model: {
      id: usageEvent.model_id,
      reasoning_effort: run.reasoning_effort,
      service_tier: binding.service_tier,
      context_window: binding.context_window,
    },
    usage: {
      input_tokens: tokens.input,
      cached_input_tokens: tokens.cached_input,
      cache_write_input_tokens: tokens.cache_write_input,
      output_tokens: tokens.output,
      reasoning_output_tokens: tokens.reasoning_output,
      total_tokens: tokens.input + tokens.output,
      uncached_input_tokens: tokens.input - tokens.cached_input - tokens.cache_write_input,
      model_invocation_count: binding.model_invocation_count,
      max_invocation_input_tokens: binding.max_invocation_input_tokens,
    },
    credits: {
      status: 'rate_unknown',
      rate_card_id: binding.rate_card_id,
      service_tier: binding.service_tier,
      total: null,
      components: null,
    },
    time: {
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
    },
    rate_limit_snapshot: null,
    measurement: {
      status: completedAt === null ? 'active' : 'complete',
      token_confidence: USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND[sourceKind],
      attribution_confidence: 'explicit_binding',
    },
    privacy: {
      metadata_only: true,
      prompt_captured: false,
      reasoning_captured: false,
      tool_payload_captured: false,
    },
  };

  // The meter's own validator is the authority on whether this mapping is legal. A local restatement
  // of its rules would drift from it; calling it cannot.
  try {
    validateUsageEvent(event);
  } catch (error) {
    const code = typeof error?.message === 'string' ? error.message : 'unknown';
    return hold(B.METER_VALIDATION_REJECTED, code);
  }

  return { status: 'PROJECTED', event_id: event.event_id, event };
}

/**
 * Reports which recorded usage events can reach the meter and why the rest cannot, without
 * projecting a single one into anything persistent. This is the health signal for the bridge: a
 * growing `not_projectable` count means the two contracts are drifting apart.
 */
export function measureMeterProjectability(store) {
  const agentIndex = indexBy(listAgents(store), 'agent_id');
  const counts = {
    total: 0,
    projectable: 0,
    provider_not_meter_source_kind: 0,
    cost_basis_not_projectable: 0,
    provider_thread_identity_missing: 0,
  };
  const holdCodes = [];
  for (const usageEvent of listUsageEvents(store)) {
    counts.total += 1;
    if (!Object.hasOwn(PROVIDER_TO_METER_SOURCE_KIND, usageEvent.provider)) {
      counts.provider_not_meter_source_kind += 1;
      holdCodes.push(B.PROVIDER_NOT_METER_SOURCE_KIND);
      continue;
    }
    if (!METER_PROJECTABLE_COST_BASES.includes(usageEvent.cost_basis)) {
      counts.cost_basis_not_projectable += 1;
      holdCodes.push(B.COST_BASIS_NOT_PROJECTABLE);
      continue;
    }
    if (resolveThreadIdentity(agentIndex.get(usageEvent.agent_id), usageEvent.provider) === null) {
      counts.provider_thread_identity_missing += 1;
      holdCodes.push(B.PROVIDER_THREAD_IDENTITY_MISSING);
      continue;
    }
    counts.projectable += 1;
  }
  return { counts, hold_codes: [...new Set(holdCodes)].sort() };
}
