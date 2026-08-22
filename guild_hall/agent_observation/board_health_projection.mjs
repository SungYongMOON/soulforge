/**
 * Projects the two health fields the Team Ops Board already publishes, from an observation store.
 *
 * `live-thread-projection.mjs` defines `scope.result_gate_health` and `scope.binding_coverage`,
 * validates them against closed value sets, and nothing currently feeds them from agent
 * observation. This module fills them in the Board's own vocabulary rather than inventing a third
 * health signal beside them.
 *
 * Boundaries:
 *   - It reads an in-memory store and returns a value. It writes nothing, reads no file, and does
 *     not touch the live `thread_result_gate.v1.json` registry, which is enabled and holds real
 *     thread ids.
 *   - It never emits `disabled`. Disabled-ness is a property of that registry's `disabled` flag and
 *     of `TEAM_OPS_BOARD_RESULT_GATES_DISABLED` in whichever process runs the Board. An in-memory
 *     store cannot observe either, and reporting `disabled` from here would be a guess.
 *   - Both fields fail to the conservative value. An empty store is `missing` and `hold`, never
 *     `available` and `exact` by vacuous quantification.
 */

import { hold } from './guard_primitives.mjs';

import {
  listAgents,
  listReceipts,
  listRuns,
} from './agent_observation.mjs';

export const BOARD_HEALTH_HOLD_CODES = Object.freeze({
  UNKNOWN_STORE: 'UNKNOWN_STORE',
});

/** The Board's own value sets, restated here so a drift between the two is a test failure. */
export const RESULT_GATE_HEALTH_VALUES = Object.freeze(['available', 'missing', 'invalid', 'disabled']);
export const BINDING_COVERAGE_VALUES = Object.freeze(['exact', 'hold']);

/** Receipt kinds that count as evidence a claimed result actually landed somewhere. */
const RESULT_EVIDENCE_KINDS = Object.freeze(['result', 'delivery']);

/**
 * A run is exactly bound when its agent is registered, that agent is bound to the same project, and
 * the agent carries a provider identity for the provider the run actually used. The third condition
 * is what keeps this from being vacuous: the store already refuses the first two at write time, but
 * an agent registered with identities for one provider can legally run on another, and such a run
 * cannot be traced back to any provider-side thread.
 */
function isExactlyBound(run, agentIndex) {
  const agent = agentIndex.get(run.agent_id);
  if (agent === undefined) return false;
  if (agent.project_id !== run.project_id) return false;
  return agent.provider_identities.some((identity) => identity.provider === run.provider);
}

export function projectBoardHealth(store) {
  let runs;
  let agents;
  let receipts;
  try {
    runs = listRuns(store);
    agents = listAgents(store);
    receipts = listReceipts(store);
  } catch {
    return hold(BOARD_HEALTH_HOLD_CODES.UNKNOWN_STORE);
  }
  // An unrecognised handle yields `null` from each list accessor rather than an empty array or a
  // throw. Testing for `undefined` alone would let a foreign handle fall through as an empty store
  // and be reported as a healthy, if vacuous, scope.
  if (!Array.isArray(runs) || !Array.isArray(agents) || !Array.isArray(receipts)) {
    return hold(BOARD_HEALTH_HOLD_CODES.UNKNOWN_STORE);
  }

  const agentIndex = new Map(agents.map((agent) => [agent.agent_id, agent]));

  const runsWithEvidence = new Set();
  for (const receipt of receipts) {
    if (RESULT_EVIDENCE_KINDS.includes(receipt.receipt_kind)) runsWithEvidence.add(receipt.run_id);
  }

  let claimingResult = 0;
  let claimingResultWithEvidence = 0;
  let exactlyBound = 0;
  for (const run of runs) {
    if (run.result_state === 'result_observed') {
      claimingResult += 1;
      if (runsWithEvidence.has(run.run_id)) claimingResultWithEvidence += 1;
    }
    if (isExactlyBound(run, agentIndex)) exactlyBound += 1;
  }

  let resultGateHealth;
  if (runs.length === 0) resultGateHealth = 'missing';
  else if (claimingResult === 0) resultGateHealth = 'missing';
  else if (claimingResultWithEvidence < claimingResult) resultGateHealth = 'invalid';
  else resultGateHealth = 'available';

  const bindingCoverage = runs.length > 0 && exactlyBound === runs.length ? 'exact' : 'hold';

  return {
    status: 'PROJECTED',
    scope: {
      result_gate_health: resultGateHealth,
      binding_coverage: bindingCoverage,
    },
    // The counts the two verdicts were computed from, so a consumer can see why rather than
    // having to trust the verdict.
    evidence: {
      run_count: runs.length,
      agent_count: agents.length,
      runs_claiming_result: claimingResult,
      runs_claiming_result_with_evidence: claimingResultWithEvidence,
      exactly_bound_run_count: exactlyBound,
      unbound_run_count: runs.length - exactlyBound,
    },
    authority_boundary: {
      read_only: true,
      result_gate_writer: false,
      board_enrollment_writer: false,
      // Never emitted; see the module header.
      can_report_disabled: false,
    },
  };
}
