/**
 * Prepares result-gate activation for one synthetic exact Agent/Run, against an isolated registry.
 *
 * The live registry at `guild_hall/state/operations/team_ops_board/thread_result_gate.v1.json` is
 * **not disabled**: it carries `disabled: false`, revision 18, and eighteen events forming five
 * threads' complete lifecycles — five `started`, five `result_ready`, four `accepted`, four
 * `closed` — against real thread ids. So the danger this module has to design against is not
 * accidentally enabling a dormant gate; it is letting a synthetic Agent/Run write into a ledger
 * that is already live. Two structural refusals, not promises, keep that from happening:
 *
 *   1. This module performs no I/O. No path is accepted, no file is read or written. The caller
 *      supplies a registry object and receives a new one; persisting it is somebody else's gated
 *      action. A test asserts the absence of every filesystem call in this source.
 *   2. The registry it will append to must be **empty** — revision zero, no events. The live
 *      registry is neither, so it cannot be passed here even by mistake. `createIsolatedRegistry`
 *      exists so a caller never needs to fetch one from disk to get started.
 *
 * The event and registry shapes are validated by the Board's own `appendThreadResultGateEvent` and
 * `deriveThreadResultGateState`, not by a local restatement of their rules, for the same reason the
 * usage bridge calls the meter's own validator: a copy of the rules drifts, a call cannot.
 */

import {
  THREAD_ENROLLMENT_SCHEMA,
  THREAD_RESULT_GATE_SCHEMA,
  appendThreadResultGateEvent,
  deriveThreadResultGateState,
} from '../../ui-workspace/apps/team-ops-board/src/core/live-thread-projection.mjs';

import {
  ACCESSOR_FOUND,
  HOSTILE_INPUT,
  TOO_DEEP,
  TOO_LARGE,
  hold,
  isSafeId,
  isUtcMs,
  snapshotInput,
} from './guard_primitives.mjs';

import { listAgents, listReceipts, listRuns } from './agent_observation.mjs';

export const RESULT_GATE_PREPARATION_HOLD_CODES = Object.freeze({
  UNKNOWN_STORE: 'UNKNOWN_STORE',
  UNKNOWN_RUN: 'UNKNOWN_RUN',
  UNKNOWN_AGENT: 'UNKNOWN_AGENT',
  AGENT_RUN_MISMATCH: 'AGENT_RUN_MISMATCH',
  PROVIDER_THREAD_IDENTITY_MISSING: 'PROVIDER_THREAD_IDENTITY_MISSING',
  RESULT_NOT_OBSERVED: 'RESULT_NOT_OBSERVED',
  RESULT_EVIDENCE_MISSING: 'RESULT_EVIDENCE_MISSING',
  REGISTRY_NOT_ISOLATED: 'REGISTRY_NOT_ISOLATED',
  BOARD_APPEND_REJECTED: 'BOARD_APPEND_REJECTED',
  BOARD_STATE_NOT_ACTIVATED: 'BOARD_STATE_NOT_ACTIVATED',
});

const P = RESULT_GATE_PREPARATION_HOLD_CODES;

/** A deterministic instant for the synthetic registries. Nothing here reads a clock. */
const SYNTHETIC_EPOCH = '2026-08-22T00:00:00.000Z';

/** Receipt kinds that count as evidence a claimed result actually landed somewhere. */
const RESULT_EVIDENCE_KINDS = Object.freeze(['result', 'delivery']);

/**
 * An empty result-gate registry. Revision zero with no events is exactly what
 * `prepareSyntheticResultGateActivation` will accept, and exactly what the live registry is not.
 */
export function createIsolatedRegistry() {
  return {
    schema_version: THREAD_RESULT_GATE_SCHEMA,
    registry_revision: 0,
    updated_at: SYNTHETIC_EPOCH,
    disabled: false,
    events: [],
  };
}

/**
 * A one-entry enrollment registry for the synthetic thread, in the Board's exact entry shape. The
 * six `raw_*` flags are false and `metadata_only` is true, which is the same privacy shape the
 * observation records carry.
 */
export function createIsolatedEnrollment({ threadId, organizationGroupId, displayLabel }) {
  return {
    schema_version: THREAD_ENROLLMENT_SCHEMA,
    registry_revision: 0,
    updated_at: SYNTHETIC_EPOCH,
    disabled: false,
    entries: [{
      thread_id: threadId,
      organization_group_id: organizationGroupId,
      route_id: null,
      work_id: null,
      thread_kind: 'task',
      display_label: displayLabel,
      relationship: 'child',
      lifecycle: 'current',
      parent_thread_id: null,
      prior_thread_history_pointer: null,
      metadata_only: true,
      raw_preview: false,
      raw_turns: false,
      raw_messages: false,
      raw_reasoning: false,
      raw_tool_io: false,
      raw_cwd: false,
      enrolled_at: SYNTHETIC_EPOCH,
      updated_at: SYNTHETIC_EPOCH,
    }],
  };
}

/**
 * Refuses any registry that is not demonstrably empty, which the live one never is.
 *
 * The check reads a snapshot rather than the caller's object. Reading the argument directly let a
 * getter answer "revision 0, no events" once and hold live events afterwards. The Board's own
 * derivation caught that downstream, but a refusal described as structural must not depend on a
 * second line of defence.
 */
function isolationRefusal(rawRegistry) {
  const registry = snapshotInput(rawRegistry);
  if (registry === TOO_DEEP || registry === ACCESSOR_FOUND
    || registry === TOO_LARGE || registry === HOSTILE_INPUT) {
    return { detail: 'not_an_object', registry: null };
  }
  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)) {
    return { detail: 'not_an_object', registry: null };
  }
  if (registry.schema_version !== THREAD_RESULT_GATE_SCHEMA) return { detail: 'schema_version', registry: null };
  if (registry.registry_revision !== 0) return { detail: 'registry_revision_not_zero', registry: null };
  if (!Array.isArray(registry.events) || registry.events.length !== 0) return { detail: 'events_not_empty', registry: null };
  if (registry.disabled !== false) return { detail: 'disabled_flag_set', registry: null };
  // The snapshot is returned, not just consulted. Checking the snapshot and then appending to the
  // caller's object would let a trap show one registry to the check and hand another to the append.
  return { detail: null, registry };
}

function resolveThreadIdentity(agent, provider) {
  if (agent === undefined) return null;
  for (const identity of agent.provider_identities) {
    if (identity.provider === provider && identity.id_kind === 'thread_id') return identity.id_value;
  }
  return null;
}

/**
 * Prepares — and only prepares — the activation of the result gate for one exact Agent/Run.
 *
 * Returns `{ status: 'PREPARED', event, registry, derived_state, would_persist_to }` where
 * `registry` is a new object the caller may inspect and `would_persist_to` is always `null`,
 * because deciding where such a registry goes is an action-time Owner gate rather than a
 * consequence of calling this function.
 */
export function prepareSyntheticResultGateActivation(store, request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    return hold(P.REGISTRY_NOT_ISOLATED, 'request_not_an_object');
  }
  const { run_id: runId, agent_id: agentId, organization_group_id: organizationGroupId, registry } = request;

  if (!isSafeId(runId)) return hold(P.UNKNOWN_RUN, 'run_id');
  if (!isSafeId(agentId)) return hold(P.UNKNOWN_AGENT, 'agent_id');
  if (!isSafeId(organizationGroupId)) return hold(P.UNKNOWN_AGENT, 'organization_group_id');

  const isolated = isolationRefusal(registry);
  if (isolated.detail !== null) return hold(P.REGISTRY_NOT_ISOLATED, isolated.detail);

  let runs;
  let agents;
  let receipts;
  try {
    runs = listRuns(store);
    agents = listAgents(store);
    receipts = listReceipts(store);
  } catch {
    return hold(P.UNKNOWN_STORE);
  }
  if (!Array.isArray(runs) || !Array.isArray(agents) || !Array.isArray(receipts)) return hold(P.UNKNOWN_STORE);

  const run = runs.find((candidate) => candidate.run_id === runId);
  if (run === undefined) return hold(P.UNKNOWN_RUN);
  const agent = agents.find((candidate) => candidate.agent_id === agentId);
  if (agent === undefined) return hold(P.UNKNOWN_AGENT);
  if (run.agent_id !== agentId) return hold(P.AGENT_RUN_MISMATCH);

  // The gate speaks in provider thread ids. Deriving one from the run id would fabricate a
  // provider-side identity for a thread that may not exist on that provider at all.
  const threadId = resolveThreadIdentity(agent, run.provider);
  if (threadId === null) return hold(P.PROVIDER_THREAD_IDENTITY_MISSING, run.provider);

  // A gate event says a result is ready. Emitting one for a run that never claimed a result, or
  // claimed one with no receipt behind it, would announce work that was never observed.
  if (run.result_state !== 'result_observed') return hold(P.RESULT_NOT_OBSERVED, run.result_state);
  const hasEvidence = receipts.some((receipt) => receipt.run_id === runId
    && receipt.agent_id === agentId
    && RESULT_EVIDENCE_KINDS.includes(receipt.receipt_kind));
  if (!hasEvidence) return hold(P.RESULT_EVIDENCE_MISSING);

  const observedAt = run.ended_at ?? run.heartbeat_at;
  if (!isUtcMs(observedAt)) return hold(P.RESULT_NOT_OBSERVED, 'observed_at');

  const privacyFlags = {
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false,
  };

  // The gate lifecycle is started, then result_ready, then accepted, then closed: the Board refuses
  // a result_ready with no started before it. So an activation is a pair, not a single event. The
  // `started` event is stamped at the run's own start rather than at the result, because the two
  // are separate observations and collapsing them would report the run as instantaneous.
  const events = [
    {
      event_id: `synthetic_started_${runId}`,
      thread_id: threadId,
      event_type: 'started',
      target: 'none',
      target_thread_id: null,
      occurred_at: run.started_at,
      ...privacyFlags,
    },
    {
      event_id: `synthetic_result_ready_${runId}`,
      thread_id: threadId,
      event_type: 'result_ready',
      target: 'owner',
      target_thread_id: null,
      occurred_at: observedAt,
      ...privacyFlags,
    },
  ];

  // The Board's own append decides whether each event is legal, and its own derivation decides
  // whether the gate would actually activate. Restating either here would drift from them.
  let current = isolated.registry;
  for (const event of events) {
    // `env` is passed explicitly and empty. Omitting it lets the Board default to the ambient
    // environment, where TEAM_OPS_BOARD_RESULT_GATES_DISABLED would change what this pure
    // preparation returns — and the test proving this module reads no environment works by scanning
    // source text, which a transitive default argument defeats.
    const appended = appendThreadResultGateEvent(current, event, { now: SYNTHETIC_EPOCH, env: {} });
    if (appended.error !== null) return hold(P.BOARD_APPEND_REJECTED, appended.error);
    if (appended.changed !== true) return hold(P.BOARD_APPEND_REJECTED, 'unchanged');
    current = appended.registry;
  }
  const appended = { registry: current };

  const enrollment = createIsolatedEnrollment({
    threadId,
    organizationGroupId,
    displayLabel: run.task_id ?? runId,
  });
  const derived = deriveThreadResultGateState({
    enrollmentRegistry: enrollment,
    resultGateRegistry: appended.registry,
  });
  if (derived.health !== 'available') return hold(P.BOARD_STATE_NOT_ACTIVATED, derived.health);
  const threadState = derived.by_thread_id.get(threadId) ?? null;
  if (threadState === null) return hold(P.BOARD_STATE_NOT_ACTIVATED, 'thread_absent');

  return {
    status: 'PREPARED',
    thread_id: threadId,
    events,
    registry: appended.registry,
    enrollment,
    derived_state: {
      health: derived.health,
      stage: threadState.stage,
      target: threadState.target,
    },
    // Deciding where a prepared registry is written is an action-time Owner gate, so this function
    // names no destination even though it knows the shape of one.
    would_persist_to: null,
    authority_boundary: {
      performs_io: false,
      writes_live_registry: false,
      enables_gate: false,
    },
  };
}
