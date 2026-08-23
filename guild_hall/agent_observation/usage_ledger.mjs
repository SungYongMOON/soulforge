/**
 * Seam C - the Usage Ledger.
 *
 * This seam owns direct usage attribution: what a token vector may claim, which cost bases have to
 * carry their own evidence, and the rule that the same measurement cannot enter the ledger twice
 * under a fresh correlation id. It also owns the rollup that reads the ledger, because self,
 * child-direct and subtree are three different claims about the same rows and only the ledger knows
 * which rows exist.
 *
 * It owns no parentage. The subtree it sums is the run graph as Run Observation reports it.
 */

import {
  digestOf,
  guardEntry,
  hold,
  isCount,
  isPlainObject,
  isSafeId,
  isUtcMs,
  unknownKeyIn,
} from './guard_primitives.mjs';

import {
  findRunRecord,
  listChildRunIds,
  listDescendantRunIds,
} from './run_observation.mjs';

import {
  ENTRY_CODES,
  EVIDENCE_REF_KINDS,
  MAX_TOKENS,
  OBSERVATION_HOLD_CODES,
  append,
  guardRefList,
  normalizeRefs,
  recordsOf,
  stateOf,
} from './observation_internals.mjs';

const H = OBSERVATION_HOLD_CODES;

export const USAGE_EVENT_SCHEMA = 'soulforge.agent_observation.usage_event.v1';

export const COST_BASES = Object.freeze(['token_proxy', 'list_price_estimate', 'billed_cost', 'subscription_credit_observation']);
// A cost basis that asserts real money or real credit must carry its own evidence refs.
export const COST_BASES_REQUIRING_EVIDENCE = Object.freeze(['billed_cost', 'subscription_credit_observation']);

const USAGE_FIELDS = Object.freeze(['event_id', 'run_id', 'agent_id', 'provider', 'model_id', 'attribution_kind', 'tokens', 'cost_basis', 'cost_evidence_refs', 'observed_at']);
const TOKEN_FIELDS = Object.freeze(['input', 'cached_input', 'cache_write_input', 'output', 'reasoning_output']);
const ROLLUP_REQUEST_FIELDS = Object.freeze(['run_id']);

export const USAGE_RECORD_KEYS = Object.freeze(['schema_version', ...USAGE_FIELDS]);
export const USAGE_NESTED_KEYS = Object.freeze([...TOKEN_FIELDS]);

export function recordDirectUsage(store, rawInput) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guarded = guardEntry(rawInput, USAGE_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const input = guarded.value;

  if (!isSafeId(input.event_id)) return hold(H.INVALID_FIELD_VALUE, 'event_id');
  if (input.attribution_kind !== 'direct') return hold(H.CHILD_USAGE_MERGE_FORBIDDEN);
  if (!isSafeId(input.run_id)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  const run = findRunRecord(store, input.run_id);
  if (run === undefined) return hold(H.UNKNOWN_RUN);
  if (input.agent_id !== run.agent_id) return hold(H.AGENT_RUN_MISMATCH);
  if (!isSafeId(input.provider)) return hold(H.INVALID_FIELD_VALUE, 'provider');
  if (!isSafeId(input.model_id)) return hold(H.INVALID_FIELD_VALUE, 'model_id');
  if (input.provider !== run.provider || input.model_id !== run.model_id) return hold(H.RUN_MODEL_MISMATCH);
  if (!COST_BASES.includes(input.cost_basis)) return hold(H.INVALID_FIELD_VALUE, 'cost_basis');
  if (!isUtcMs(input.observed_at)) return hold(H.INVALID_FIELD_VALUE, 'observed_at');
  if (input.observed_at < run.started_at) return hold(H.TEMPORAL_ORDER_INVALID, 'usage_before_run_start');

  const costRefs = input.cost_evidence_refs ?? [];
  const costGuard = guardRefList(costRefs, EVIDENCE_REF_KINDS, { allowEmpty: true });
  if (costGuard !== null) return costGuard;
  if (COST_BASES_REQUIRING_EVIDENCE.includes(input.cost_basis) && costRefs.length === 0) return hold(H.COST_EVIDENCE_REQUIRED);

  const tokens = input.tokens;
  if (!isPlainObject(tokens)) return hold(H.INVALID_FIELD_VALUE, 'tokens');
  const tokenExtra = unknownKeyIn(tokens, TOKEN_FIELDS);
  if (tokenExtra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, tokenExtra);
  for (const key of TOKEN_FIELDS) if (!isCount(tokens[key], MAX_TOKENS)) return hold(H.INVALID_FIELD_VALUE, `tokens.${key}`);
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

export function projectUsageRollup(store, rawRequest) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  // A non-object argument is refused by the shared guard, which reports it the same way here as at
  // every other entry point. The local pre-check that used to sit here answered the identical
  // question with a different code, so the same mistake had two names depending on which function
  // the caller reached.
  const guarded = guardEntry(rawRequest, ROLLUP_REQUEST_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const runId = guarded.value.run_id;
  if (!isSafeId(runId)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  // A typo must read as unknown, never as "this manager used nothing".
  if (findRunRecord(store, runId) === undefined) return hold(H.UNKNOWN_RUN);

  const self = emptyUsage();
  const childDirect = emptyUsage();
  const subtree = emptyUsage();
  const direct = new Set(listChildRunIds(store, runId));
  const descendants = listDescendantRunIds(store, runId);

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

export const listUsageEvents = (store) => recordsOf(store, 'usage');
