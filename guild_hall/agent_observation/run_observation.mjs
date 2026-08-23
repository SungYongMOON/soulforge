/**
 * Seam B - Run Observation.
 *
 * This seam owns what an observed run is: its lifecycle, the authority it ran under, the model that
 * answered, the times it claims, and its place in the run graph. It also owns the two boundaries
 * that a run can violate on its own - a run may not claim a project its agent was not registered
 * into, and a child run may not sit under a parent from another project.
 *
 * The run graph belongs here rather than with the ledger that reads it. Parentage is a property of
 * runs, so `listChildRunIds` and `listDescendantRunIds` are this seam's public interface and the
 * Usage Ledger crosses it instead of walking `parent_run_id` a second time.
 */

import {
  guardEntry,
  hold,
  isSafeId,
  isUtcMs,
} from './guard_primitives.mjs';

import { findAgentRecord } from './agent_registry.mjs';

import {
  ENTRY_CODES,
  EVIDENCE_REF_KINDS,
  OBSERVATION_HOLD_CODES,
  append,
  guardRefList,
  normalizeRefs,
  recordsOf,
  stateOf,
} from './observation_internals.mjs';

const H = OBSERVATION_HOLD_CODES;

export const RUN_RECORD_SCHEMA = 'soulforge.agent_observation.run_record.v1';

export const RUN_LIFECYCLES = Object.freeze(['started', 'running', 'waiting', 'stopped', 'terminal']);
export const RUN_AUTHORITIES = Object.freeze(['read_only', 'append_only', 'bounded_create_only', 'dispatch_only']);
export const RUN_RESULT_STATES = Object.freeze(['result_pending', 'result_observed', 'unknown']);

const RUN_FIELDS = Object.freeze(['run_id', 'parent_run_id', 'agent_id', 'task_id', 'project_id', 'work_unit_id', 'lifecycle', 'provider', 'model_id', 'reasoning_effort', 'authority', 'started_at', 'heartbeat_at', 'ended_at', 'result_state', 'side_effect_evidence_refs']);

export const RUN_RECORD_KEYS = Object.freeze(['schema_version', ...RUN_FIELDS]);

export function observeRun(store, rawInput) {
  const state = stateOf(store);
  if (state === undefined) return hold(H.UNKNOWN_STORE);
  const guarded = guardEntry(rawInput, RUN_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const input = guarded.value;

  if (!isSafeId(input.run_id)) return hold(H.INVALID_FIELD_VALUE, 'run_id');
  if (!isSafeId(input.agent_id)) return hold(H.INVALID_FIELD_VALUE, 'agent_id');
  // The registry decides what a registered agent is; this seam only asks.
  const agent = findAgentRecord(store, input.agent_id);
  if (agent === undefined) return hold(H.UNKNOWN_AGENT);

  if (input.parent_run_id !== null) {
    if (!isSafeId(input.parent_run_id)) return hold(H.INVALID_FIELD_VALUE, 'parent_run_id');
    if (input.parent_run_id === input.run_id) return hold(H.INVALID_FIELD_VALUE, 'parent_run_id_self');
    if (!state.runs.has(input.parent_run_id)) return hold(H.UNKNOWN_PARENT_RUN);
  }
  const parent = input.parent_run_id === null ? null : state.runs.get(input.parent_run_id);

  if (input.project_id === null || input.project_id === undefined || input.project_id === '') return hold(H.UNKNOWN_PROJECT);
  if (!isSafeId(input.project_id)) return hold(H.INVALID_FIELD_VALUE, 'project_id');
  if (input.project_id !== agent.project_id) return hold(H.PROJECT_BINDING_MISMATCH);
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

  const refGuard = guardRefList(input.side_effect_evidence_refs, EVIDENCE_REF_KINDS, { allowEmpty: true });
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

export const listRuns = (store) => recordsOf(store, 'runs');

/**
 * The observed run behind an id, or `undefined`, and `null` for an unrecognized store handle.
 *
 * The Usage Ledger and the Evidence seam both have to check a run they did not write - the run a
 * usage event is attributed to, the run a receipt belongs to, the run a delivery was targeted at.
 * They ask here so that "an observed run" has one definition.
 */
export function findRunRecord(store, runId) {
  const state = stateOf(store);
  if (state === undefined) return null;
  const entry = state.runs.get(runId);
  return entry === undefined ? undefined : entry.record;
}

/** Direct children of a run. */
export function listChildRunIds(store, runId) {
  const state = stateOf(store);
  if (state === undefined) return null;
  const children = [];
  for (const entry of state.runs.values()) if (entry.record.parent_run_id === runId) children.push(entry.record.run_id);
  return children;
}

/** Every run beneath a run, cycle-safe, as a Set so a caller can test membership directly. */
export function listDescendantRunIds(store, runId) {
  const direct = listChildRunIds(store, runId);
  if (direct === null) return null;
  const seen = new Set();
  const stack = [...direct];
  while (stack.length > 0) {
    const next = stack.pop();
    if (seen.has(next)) continue;
    seen.add(next);
    for (const child of listChildRunIds(store, next)) if (!seen.has(child)) stack.push(child);
  }
  return seen;
}
