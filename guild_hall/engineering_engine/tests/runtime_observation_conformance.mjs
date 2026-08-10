// Conformance for runtime heartbeats and per-edge delivery receipts.
//
// Verification strength: author-written fixtures. Lane 1V's mutation lock covers the guards.

import {
  HEARTBEAT_SURFACES, HEARTBEAT_STATES, REQUIRED_HEARTBEAT_FIELDS, CODES as H,
  assertKnownSurface, validateHeartbeat, validateWindow, judgeSurface, judgeAllSurfaces,
  forbidNeighbourInference,
} from '../kernel/heartbeat.mjs';
import {
  DELIVERY_STATES, OBSERVATION_METHODS, REQUIRED_RECEIPT_FIELDS, CODES as R,
  edgeKey, assertEdgeKey, validateReceipt, judgeEdge,
  classifyEdgeCoverage, assertTopologyIsOneToOne, summariseDelivery,
} from '../kernel/delivery_receipt.mjs';
import { ContractError } from '../kernel/errors.mjs';

const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });
const rejects = (id, fn, expectedCode, note = '') => {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  const ok = err instanceof ContractError && (!expectedCode || err.code === expectedCode);
  record(id, ok, ok ? note : `expected ${expectedCode}, got ${err ? err.code : 'no error'}`);
};
const accepts = (id, fn, note = '') => {
  try { fn(); record(id, true, note); } catch (e) { record(id, false, `unexpected ${e.code ?? e.message}`); }
};

{
  const probe = [];
  const rec = (ok) => probe.push(ok === true);
  const rej = (fn, code) => { let e = null; try { fn(); } catch (x) { e = x; } rec(e instanceof ContractError && (!code || e.code === code)); };
  const acc = (fn) => { try { fn(); rec(true); } catch { rec(false); } };
  rej(() => 1, 'ANY_CODE');
  rej(() => { throw new ContractError('OTHER', 'x'); }, 'WANTED');
  rej(() => { throw new ContractError('WANTED', 'x'); }, 'WANTED');
  rej(() => { throw new TypeError('x'); }, undefined);
  acc(() => { throw new ContractError('X', 'x'); });
  record('RT/harness/self_test',
    probe[0] === false && probe[1] === false && probe[2] === true && probe[3] === false && probe[4] === false,
    'the reject and accept helpers detect what they claim to');
}

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const at = (ageSeconds) => new Date(NOW - ageSeconds * 1000).toISOString();
const WINDOW = { period_seconds: 600, grace_seconds: 300 };

const beat = (over = {}) => ({
  surface_id: 'lane_1a_conformance',
  observed_at: at(0),
  outcome: 'passed',
  evidence: { exit_code: 0, pass_count: 151, failure_count: 0 },
  ...over,
});

// ---------------------------------------------------------------- heartbeat surface list

record('RT/heartbeat/surfaces_are_a_closed_list', HEARTBEAT_SURFACES.length >= 8
  && new Set(HEARTBEAT_SURFACES).size === HEARTBEAT_SURFACES.length);
accepts('RT/heartbeat/known_surface', () => assertKnownSurface('mutation_lock'), 'positive control');
rejects('RT/heartbeat/unknown_surface_refused', () => assertKnownSurface('probably_fine'), H.SURFACE_UNKNOWN,
  'an undeclared surface cannot report itself alive');
rejects('RT/heartbeat/absent_surface_refused', () => assertKnownSurface(undefined), H.SURFACE_UNKNOWN);

// ---------------------------------------------------------------- heartbeat record

accepts('RT/heartbeat/complete_record', () => validateHeartbeat(beat()), 'positive control');
for (const f of REQUIRED_HEARTBEAT_FIELDS) {
  const b = beat(); delete b[f];
  rejects(`RT/heartbeat/missing/${f}`, () => validateHeartbeat(b), undefined, 'nothing defaults');
}
rejects('RT/heartbeat/second_precision_instant', () => validateHeartbeat(beat({ observed_at: '2026-08-10T12:00:00Z' })), H.INSTANT_INVALID);
rejects('RT/heartbeat/impossible_date', () => validateHeartbeat(beat({ observed_at: '2026-02-30T12:00:00.000Z' })), H.INSTANT_INVALID);
rejects('RT/heartbeat/unknown_outcome', () => validateHeartbeat(beat({ outcome: 'probably' })), H.OUTCOME_INVALID);
rejects('RT/heartbeat/evidence_must_be_present',
  () => validateHeartbeat(beat({ evidence: null })), H.FIELD_MISSING,
  'a heartbeat without evidence is only a claim that something happened');
rejects('RT/heartbeat/not_an_object', () => validateHeartbeat(null), H.FIELD_MISSING);

// ---------------------------------------------------------------- window

accepts('RT/window/valid', () => validateWindow(WINDOW), 'positive control');
rejects('RT/window/absent', () => validateWindow(undefined), H.WINDOW_ABSENT,
  'an age cannot be judged without a declared window');
rejects('RT/window/zero_period', () => validateWindow({ period_seconds: 0, grace_seconds: 10 }), H.WINDOW_INVALID);
rejects('RT/window/negative_grace', () => validateWindow({ period_seconds: 60, grace_seconds: -1 }), H.WINDOW_INVALID);
rejects('RT/window/fractional', () => validateWindow({ period_seconds: 60.5, grace_seconds: 0 }), H.WINDOW_INVALID);

// ---------------------------------------------------------------- surface verdict

{
  const judge = (over, window = WINDOW) => judgeSurface({
    surfaceId: 'lane_1a_conformance', heartbeat: beat(over), window, now: NOW,
  });
  record('RT/surface/fresh_inside_period', judge({ observed_at: at(599) }).state === 'fresh');
  record('RT/surface/fresh_at_boundary', judge({ observed_at: at(600) }).state === 'fresh');
  record('RT/surface/late_in_grace', judge({ observed_at: at(601) }).state === 'late');
  record('RT/surface/late_at_grace_boundary', judge({ observed_at: at(900) }).state === 'late');
  record('RT/surface/stale_outside_window', judge({ observed_at: at(901) }).state === 'stale');
  record('RT/surface/stale_is_not_alive', judge({ observed_at: at(5000) }).alive === false);

  // Freshness and success are different questions.
  const failedRecent = judge({ outcome: 'failed', observed_at: at(1) });
  record('RT/surface/recent_failure_is_failed_not_fresh', failedRecent.state === 'failed',
    'a surface that runs promptly and fails every time is not healthy');
  record('RT/surface/failed_still_counts_as_ran', failedRecent.alive === true);

  const absent = judgeSurface({ surfaceId: 'mutation_lock', heartbeat: undefined, window: WINDOW, now: NOW });
  record('RT/surface/no_heartbeat_is_absent', absent.state === 'absent' && absent.alive === false,
    'never ran is not the same as ran and failed');

  rejects('RT/surface/future_heartbeat_refused',
    () => judgeSurface({ surfaceId: 'lane_1a_conformance', heartbeat: beat({ observed_at: new Date(NOW + 5000).toISOString() }), window: WINDOW, now: NOW }),
    H.FUTURE_OBSERVATION);
  rejects('RT/surface/mismatched_surface_refused',
    () => judgeSurface({ surfaceId: 'lane_1b_conformance', heartbeat: beat(), window: WINDOW, now: NOW }),
    H.SURFACE_UNKNOWN);
  rejects('RT/surface/now_is_required',
    () => judgeSurface({ surfaceId: 'lane_1a_conformance', heartbeat: beat(), window: WINDOW }),
    H.FIELD_MISSING, 'this kernel reads no clock');
}

// ---------------------------------------------------------------- all surfaces

{
  const summary = judgeAllSurfaces({
    heartbeats: { lane_1a_conformance: beat() }, windows: { default: WINDOW }, now: NOW,
  });
  record('RT/all/every_declared_surface_is_judged', summary.verdicts.length === HEARTBEAT_SURFACES.length);
  record('RT/all/surfaces_without_evidence_are_reported',
    summary.counts.absent === HEARTBEAT_SURFACES.length - 1,
    'omitting them would make the summary look complete while hiding what has no evidence');
  record('RT/all/counts_cover_every_state', HEARTBEAT_STATES.every((s) => Object.hasOwn(summary.counts, s)));
  record('RT/all/claim_does_not_overstate', summary.claim.includes('without any heartbeat'),
    'one fresh surface out of eleven must not read as healthy');
  const allFresh = judgeAllSurfaces({
    heartbeats: Object.fromEntries(HEARTBEAT_SURFACES.map((s) => [s, beat({ surface_id: s })])),
    windows: { default: WINDOW }, now: NOW,
  });
  record('RT/all/full_coverage_claim', allFresh.counts.fresh === HEARTBEAT_SURFACES.length
    && allFresh.claim.includes(`${HEARTBEAT_SURFACES.length}/${HEARTBEAT_SURFACES.length}`), 'positive control');
}

rejects('RT/heartbeat/neighbour_inference_always_refused',
  () => forbidNeighbourInference('copy_state_from_upstream'), H.NEIGHBOUR_INFERENCE_FORBIDDEN,
  'this is the shortcut that makes a topology look healthier than its evidence');

// ---------------------------------------------------------------- receipts

const receipt = (over = {}) => ({
  edge_key: 'custody>canonical',
  observed_at: at(0),
  outcome: 'delivered',
  observation_method: 'module_load_observation',
  run_id: 'run-1',
  ...over,
});

record('RT/edge_key/composed', edgeKey('a_mod', 'b_mod') === 'a_mod>b_mod');
accepts('RT/edge_key/valid', () => assertEdgeKey('custody>canonical'), 'positive control');
for (const [label, bad] of [['no_arrow', 'custody'], ['empty_side', '>canonical'], ['uppercase', 'Custody>canonical'], ['not_a_string', 7]]) {
  rejects(`RT/edge_key/${label}`, () => assertEdgeKey(bad), R.EDGE_KEY_INVALID);
}

accepts('RT/receipt/complete', () => validateReceipt(receipt()), 'positive control');
for (const f of REQUIRED_RECEIPT_FIELDS) {
  const r = receipt(); delete r[f];
  rejects(`RT/receipt/missing/${f}`, () => validateReceipt(r), undefined);
}
rejects('RT/receipt/unlabelled_method', () => validateReceipt(receipt({ observation_method: 'somehow' })), R.METHOD_INVALID,
  'an unlabelled observation cannot be weighed');
rejects('RT/receipt/unknown_outcome', () => validateReceipt(receipt({ outcome: 'maybe' })), R.OUTCOME_INVALID);
rejects('RT/receipt/empty_run_id', () => validateReceipt(receipt({ run_id: '' })), R.FIELD_MISSING);
record('RT/receipt/methods_named_honestly', OBSERVATION_METHODS.includes('module_load_observation'),
  'the weaker method is named for what it observes');

// ---------------------------------------------------------------- edge verdict

{
  const judge = (over, ageSeconds = 0) => judgeEdge({
    edgeKey: 'custody>canonical', receipt: receipt({ ...over, observed_at: at(ageSeconds) }), window: WINDOW, now: NOW,
  });
  record('RT/edge/delivering_inside_period', judge({}, 600).state === 'delivering');
  record('RT/edge/late_in_grace', judge({}, 601).state === 'late');
  record('RT/edge/late_still_proves_traversal', judge({}, 900).proves_traversal === true);
  const stale = judge({}, 901);
  record('RT/edge/stale_outside_window', stale.state === 'stale');
  record('RT/edge/stale_proves_nothing_now', stale.proves_traversal === false,
    'one successful run must not leave a line green permanently');
  const threeWeeks = judge({}, 21 * 86400);
  record('RT/edge/three_week_old_receipt_is_stale', threeWeeks.state === 'stale' && threeWeeks.proves_traversal === false);
  record('RT/edge/failed_receipt', judge({ outcome: 'failed' }).state === 'failed');
  record('RT/edge/failed_proves_nothing', judge({ outcome: 'failed' }).proves_traversal === false);

  const none = judgeEdge({ edgeKey: 'custody>canonical', receipt: undefined, window: WINDOW, now: NOW });
  record('RT/edge/no_receipt_is_unreceipted', none.state === 'unreceipted' && none.proves_traversal === false);

  rejects('RT/edge/future_receipt_refused',
    () => judgeEdge({ edgeKey: 'custody>canonical', receipt: receipt({ observed_at: new Date(NOW + 5000).toISOString() }), window: WINDOW, now: NOW }),
    R.FUTURE_OBSERVATION);
  rejects('RT/edge/window_required_when_receipted',
    () => judgeEdge({ edgeKey: 'custody>canonical', receipt: receipt(), now: NOW }), R.WINDOW_ABSENT);

  // An edge cannot borrow the liveness of the modules at its ends.
  const plain = judgeEdge({ edgeKey: 'custody>canonical', receipt: undefined, window: WINDOW, now: NOW });
  const withNodeState = judgeEdge({
    edgeKey: 'custody>canonical', receipt: undefined, window: WINDOW, now: NOW,
    fromHealth: 'ok', toHealth: 'ok', nodeHealth: 'ok',
  });
  record('RT/edge/node_health_changes_nothing', JSON.stringify(withNodeState) === JSON.stringify(plain),
    'both ends can be alive while the connection is never used');
}

// ---------------------------------------------------------------- coverage comparison

{
  const declared = ['a>b', 'b>c', 'c>d'];
  const cov = classifyEdgeCoverage({ declaredEdges: declared, observedEdgeKeys: ['a>b', 'b>c'] });
  record('RT/coverage/exercised', cov.exercised.join(',') === 'a>b,b>c');
  record('RT/coverage/idle_edge_reported_not_dropped', cov.declared_not_exercised.join(',') === 'c>d',
    'an idle edge is a fact about the run, not a defect to hide');
  record('RT/coverage/consistent_when_nothing_undeclared', cov.consistent === true);
  record('RT/coverage/ratio_text', cov.coverage_ratio_text === '2/3');
  accepts('RT/coverage/one_to_one_passes', () => assertTopologyIsOneToOne(cov), 'positive control');

  const undeclared = classifyEdgeCoverage({ declaredEdges: declared, observedEdgeKeys: ['a>b', 'x>y'] });
  record('RT/coverage/undeclared_traversal_detected', undeclared.observed_not_declared.join(',') === 'x>y');
  record('RT/coverage/undeclared_breaks_consistency', undeclared.consistent === false);
  rejects('RT/coverage/undeclared_traversal_is_a_fault',
    () => assertTopologyIsOneToOne(undeclared), R.UNDECLARED_EDGE_OBSERVED,
    'a traversal the source parse never found means the topology is not 1:1');

  record('RT/coverage/accepts_object_edges',
    classifyEdgeCoverage({ declaredEdges: [{ from: 'a', to: 'b' }], observedEdgeKeys: ['a>b'] }).exercised.length === 1);
  rejects('RT/coverage/non_array_input', () => classifyEdgeCoverage({ declaredEdges: 'a>b', observedEdgeKeys: [] }), R.COVERAGE_INPUT_INVALID);
  rejects('RT/coverage/malformed_observed_key',
    () => classifyEdgeCoverage({ declaredEdges: ['a>b'], observedEdgeKeys: ['nope'] }), R.EDGE_KEY_INVALID);
  rejects('RT/coverage/assert_requires_a_result', () => assertTopologyIsOneToOne(null), R.COVERAGE_INPUT_INVALID);
}

// ---------------------------------------------------------------- delivery summary

{
  const declared = ['a>b', 'b>c', 'c>d'];
  const none = summariseDelivery({ declaredEdges: declared, receipts: {}, windows: { default: WINDOW }, now: NOW });
  record('RT/summary/nothing_proven_when_no_receipts',
    none.traversal_proven === 0 && none.counts.unreceipted === 3);
  record('RT/summary/claim_says_none_proven', none.claim.includes('증명된 것은 없습니다'),
    'the display wording comes from the count, not from the drawing');
  const some = summariseDelivery({
    declaredEdges: declared,
    receipts: { 'a>b': receipt({ edge_key: 'a>b' }) },
    windows: { default: WINDOW }, now: NOW,
  });
  record('RT/summary/partial_proof_counted', some.traversal_proven === 1 && some.traversal_unproven === 2);
  record('RT/summary/claim_states_the_fraction', some.claim.includes('1/3'));
  record('RT/summary/counts_cover_every_state', DELIVERY_STATES.every((s) => Object.hasOwn(some.counts, s)));
}

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'runtime_heartbeat_and_per_edge_delivery_receipt',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  verification_strength: 'author_written_fixtures',
  independent_lock_owed_by: 'lane_1V',
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
