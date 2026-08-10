// Per-edge delivery receipts, and the comparison that keeps the topology honest.
//
// A drawn edge is not evidence that anything crossed it. The topology emitter derives edges
// from the source, which proves the connection is *declared*; it cannot prove the connection
// was *used*. Those are different claims and they get different fields.
//
// So the engine's own graph gets the same treatment the engine gives a project:
//
//   declared edges (parsed from source) = Expected State
//   observed edges (seen during a run)  = Observed State
//   the difference                      = a gap, reported rather than smoothed over
//
// Three outcomes fall out of that comparison, and the third is the one worth having:
//
//   exercised              declared and observed
//   declared_not_exercised declared, never observed — the line is real but idle
//   observed_not_declared  observed, never declared — the emitter or the code is wrong
//
// `observed_not_declared` must be loud. If a run traverses a connection the static parse did
// not find, then either the parser missed something or the code is doing something dynamic,
// and both make the "1:1 with the code" claim false.

import { inspectInstant } from './canonical.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  FIELD_MISSING: 'RECEIPT_FIELD_MISSING',
  EDGE_KEY_INVALID: 'RECEIPT_EDGE_KEY_INVALID',
  INSTANT_INVALID: 'RECEIPT_INSTANT_INVALID',
  OUTCOME_INVALID: 'RECEIPT_OUTCOME_INVALID',
  METHOD_INVALID: 'RECEIPT_METHOD_INVALID',
  WINDOW_ABSENT: 'RECEIPT_WINDOW_ABSENT',
  WINDOW_INVALID: 'RECEIPT_WINDOW_INVALID',
  FUTURE_OBSERVATION: 'RECEIPT_FUTURE_OBSERVATION',
  COVERAGE_INPUT_INVALID: 'RECEIPT_COVERAGE_INPUT_INVALID',
  UNDECLARED_EDGE_OBSERVED: 'RECEIPT_UNDECLARED_EDGE_OBSERVED',
});

export const DELIVERY_STATES = Object.freeze([
  'delivering', 'late', 'stale', 'failed', 'never_delivered', 'unreceipted',
]);

/**
 * How an edge can be evidenced.
 *
 * `module_load_observation` is what the engine can honestly produce today: during a real run
 * the loader reports which module requested which other module, so traversal is observed
 * rather than assumed. It is deliberately not called proof that data was processed — it
 * proves the edge was taken, nothing more, and the name says so.
 */
export const OBSERVATION_METHODS = Object.freeze([
  'module_load_observation',
  'explicit_delivery_receipt',
]);

export const OUTCOMES = Object.freeze(['delivered', 'failed']);

export const REQUIRED_RECEIPT_FIELDS = Object.freeze([
  'edge_key', 'observed_at', 'outcome', 'observation_method', 'run_id',
]);

const EDGE_KEY = /^[a-z][a-z0-9_]{0,63}>[a-z][a-z0-9_]{0,63}$/;

export const edgeKey = (from, to) => `${from}>${to}`;

export function assertEdgeKey(key) {
  if (typeof key !== 'string' || !EDGE_KEY.test(key)) {
    throw new ContractError(CODES.EDGE_KEY_INVALID, 'edge key must be "<from>><to>"', { key: key ?? null });
  }
  return true;
}

export function validateReceipt(receipt) {
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new ContractError(CODES.FIELD_MISSING, 'receipt is not an object');
  }
  for (const f of REQUIRED_RECEIPT_FIELDS) {
    if (!Object.hasOwn(receipt, f)) {
      throw new ContractError(CODES.FIELD_MISSING, `receipt field "${f}" is missing`, { field: f });
    }
  }
  assertEdgeKey(receipt.edge_key);
  if (!inspectInstant(receipt.observed_at).valid) {
    throw new ContractError(CODES.INSTANT_INVALID, 'observed_at must be a canonical instant');
  }
  if (!OUTCOMES.includes(receipt.outcome)) {
    throw new ContractError(CODES.OUTCOME_INVALID, `outcome must be one of ${OUTCOMES.join(', ')}`);
  }
  if (!OBSERVATION_METHODS.includes(receipt.observation_method)) {
    throw new ContractError(CODES.METHOD_INVALID,
      'a receipt must say how the edge was observed; an unlabelled observation cannot be weighed',
      { given: receipt.observation_method ?? null });
  }
  if (typeof receipt.run_id !== 'string' || receipt.run_id.length === 0) {
    throw new ContractError(CODES.FIELD_MISSING, 'a receipt must name the run it came from');
  }
  return { valid: true, edge_key: receipt.edge_key, method: receipt.observation_method };
}

function validateWindow(window, key) {
  if (window === undefined || window === null) {
    throw new ContractError(CODES.WINDOW_ABSENT, 'no freshness window declared for this edge', { edge_key: key });
  }
  for (const field of ['period_seconds', 'grace_seconds']) {
    if (!Number.isSafeInteger(window[field]) || window[field] < 0) {
      throw new ContractError(CODES.WINDOW_INVALID, `${field} must be a non-negative safe integer`, { edge_key: key });
    }
  }
  if (window.period_seconds === 0) {
    throw new ContractError(CODES.WINDOW_INVALID, 'period_seconds must be greater than zero', { edge_key: key });
  }
  return true;
}

/**
 * Judges one edge from its own receipt.
 *
 * Node health is not a parameter. An edge cannot borrow the liveness of the modules at its
 * ends: both can be perfectly alive while the connection between them is never used.
 */
export function judgeEdge({ edgeKey: key, receipt, window, now }) {
  assertEdgeKey(key);
  if (!Number.isFinite(now)) throw new ContractError(CODES.FIELD_MISSING, 'now must be supplied');

  if (receipt === undefined || receipt === null) {
    return { edge_key: key, state: 'unreceipted', proves_traversal: false, reason: 'no_receipt_recorded' };
  }
  validateReceipt(receipt);
  validateWindow(window, key);

  if (receipt.outcome === 'failed') {
    return { edge_key: key, state: 'failed', proves_traversal: false, reason: receipt.failure_code ?? 'delivery_failed' };
  }
  const observedMs = Date.parse(receipt.observed_at);
  if (observedMs > now) {
    throw new ContractError(CODES.FUTURE_OBSERVATION, 'receipt is dated after the observation time', { edge_key: key });
  }
  const ageSeconds = Math.max(0, Math.floor((now - observedMs) / 1000));
  if (ageSeconds <= window.period_seconds) {
    return { edge_key: key, state: 'delivering', age_seconds: ageSeconds, proves_traversal: true, method: receipt.observation_method };
  }
  if (ageSeconds <= window.period_seconds + window.grace_seconds) {
    return { edge_key: key, state: 'late', age_seconds: ageSeconds, proves_traversal: true, reason: 'grace_window' };
  }
  // Outside the window a receipt proves a past traversal and nothing about the present.
  // Without this rule one successful run would leave a line green permanently.
  return { edge_key: key, state: 'stale', age_seconds: ageSeconds, proves_traversal: false, reason: 'receipt_outside_window' };
}

/**
 * Compares declared edges against observed edges.
 *
 * This is the engine's own Expected/Observed comparison turned on itself, so the same rule
 * applies: an edge nobody observed is reported as unexercised, never quietly dropped, and an
 * observation with no declaration is a fault rather than a bonus.
 */
export function classifyEdgeCoverage({ declaredEdges, observedEdgeKeys }) {
  if (!Array.isArray(declaredEdges) || !Array.isArray(observedEdgeKeys)) {
    throw new ContractError(CODES.COVERAGE_INPUT_INVALID, 'declaredEdges and observedEdgeKeys must both be arrays');
  }
  const declared = new Set();
  for (const edge of declaredEdges) {
    const key = typeof edge === 'string' ? edge : edgeKey(edge.from, edge.to);
    assertEdgeKey(key);
    declared.add(key);
  }
  const observed = new Set();
  for (const key of observedEdgeKeys) {
    assertEdgeKey(key);
    observed.add(key);
  }
  const exercised = [...declared].filter((k) => observed.has(k)).sort();
  const declaredNotExercised = [...declared].filter((k) => !observed.has(k)).sort();
  const observedNotDeclared = [...observed].filter((k) => !declared.has(k)).sort();

  return {
    declared_count: declared.size,
    observed_count: observed.size,
    exercised,
    declared_not_exercised: declaredNotExercised,
    observed_not_declared: observedNotDeclared,
    // A run exercises a subset of the graph, so an idle edge is normal and is only reported.
    // An undeclared traversal is not normal: it means the derived topology is not 1:1.
    consistent: observedNotDeclared.length === 0,
    coverage_ratio_text: `${exercised.length}/${declared.size}`,
  };
}

/**
 * Fails when a run traversed an edge the topology never declared.
 *
 * Kept separate from the classifier so a caller has to decide explicitly whether to enforce,
 * and so the enforcing call reads as a claim about the topology rather than a side effect of
 * counting.
 */
export function assertTopologyIsOneToOne(coverage) {
  if (!coverage || !Array.isArray(coverage.observed_not_declared)) {
    throw new ContractError(CODES.COVERAGE_INPUT_INVALID, 'coverage result is required');
  }
  if (coverage.observed_not_declared.length > 0) {
    throw new ContractError(CODES.UNDECLARED_EDGE_OBSERVED,
      'a run traversed edges the derived topology does not declare, so the topology is not 1:1 with the code',
      { undeclared: coverage.observed_not_declared });
  }
  return true;
}

/** Summarises a whole edge set for display, without letting a caller overstate it. */
export function summariseDelivery({ declaredEdges, receipts = {}, windows = {}, now }) {
  const verdicts = declaredEdges.map((edge) => {
    const key = typeof edge === 'string' ? edge : edgeKey(edge.from, edge.to);
    return judgeEdge({ edgeKey: key, receipt: receipts[key], window: windows[key] ?? windows.default, now });
  });
  const counts = Object.fromEntries(DELIVERY_STATES.map((s) => [s, 0]));
  for (const v of verdicts) counts[v.state] += 1;
  const proven = verdicts.filter((v) => v.proves_traversal).length;
  return {
    verdicts,
    counts,
    total: verdicts.length,
    traversal_proven: proven,
    traversal_unproven: verdicts.length - proven,
    claim: proven === 0
      ? '표시된 간선 중 현재 통과가 증명된 것은 없습니다'
      : `${proven}/${verdicts.length} 간선에 윈도 내 통과 관측이 있습니다`,
  };
}
