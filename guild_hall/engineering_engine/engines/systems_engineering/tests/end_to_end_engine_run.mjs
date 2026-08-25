// End-to-end: does the engine actually find things, and does a replay behave like a replay?
//
// The self-topology run passes with zero findings because every edge happened to be traversed,
// and a test where nothing is found proves nothing about the finding. So this drives whole
// passes over controlled subjects where the answer is known in advance, including the case the
// entire kernel is built around: not-observed must become unknown, not missing, whenever the
// observation itself was not trustworthy.

import { buildStates, observationTrustworthiness, SUBJECT_ID } from '../evaluator/engine_self_topology.mjs';
import { runEnginePass, classifyReplay } from '../../../core/runtime/engine_pass.mjs';
import { GAP_TYPE } from '../../../core/validators/snapshot.mjs';
import { PRESENCE } from '../../../core/validators/custody.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });
const rejects = (id, fn, expectedCode, note = '') => {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  const ok = err instanceof ContractError && (!expectedCode || err.code === expectedCode);
  record(id, ok, ok ? note : `expected ${expectedCode}, got ${err ? err.code : 'no error'}`);
};

{
  const probe = [];
  const rej = (fn, code) => { let e = null; try { fn(); } catch (x) { e = x; } probe.push((e instanceof ContractError && (!code || e.code === code)) === true); };
  rej(() => 1, 'ANY');
  rej(() => { throw new ContractError('OTHER', 'x'); }, 'WANTED');
  rej(() => { throw new ContractError('WANTED', 'x'); }, 'WANTED');
  record('E2E/harness/self_test', probe[0] === false && probe[1] === false && probe[2] === true,
    'the reject helper detects what it claims to');
}

const TAKEN_AT = '2026-08-10T15:00:00.000Z';
const VALID_AT = '2026-08-10T14:00:00.000Z';

// A deterministic identifier source. Real runs use randomUUID; a replay comparison needs the
// values to be controllable, and the fingerprint must not depend on them either way.
const uuidSource = (seed) => {
  let n = seed;
  return () => {
    n += 1;
    const hex = n.toString(16).padStart(12, '0');
    return `a3f1c2d4-5e6f-4a7b-8c9d-${hex}`;
  };
};

const topologyOf = (edges) => ({
  module_edges: edges.map(([from, to]) => ({ from, to, relation: 'imports' })),
  topology_digest: 'd'.repeat(64),
});
const cleanObservation = (over = {}) => ({
  run_id: 'run-test-1',
  surfaces: { declared: 8, run: 8, failing: [], counts: {} },
  ...over,
});

const EDGES = [['alpha', 'bravo'], ['bravo', 'charlie'], ['charlie', 'delta']];
// The window the receipts are judged against, and the instant they are judged at. Both are
// supplied rather than read, so the same fixture always produces the same verdict.
const WINDOW = { period_seconds: 3600, grace_seconds: 1800 };
const NOW = Date.parse(TAKEN_AT);
// A run has to declare the exact edge key set it produced receipts for, so unless a case is
// specifically attacking that declaration it states the truth: the keys that are in the map.
// The cases below that supply their own `edges` block are the ones testing what happens when
// the declaration and the map disagree.
const declaring = (observation, receipts) => (observation.edges
  ? observation
  : { ...observation, edges: { exercised_edge_keys: Object.keys(receipts).sort() } });

const pass = ({ receipts, observation, seed = 0, generation = 1, window = WINDOW, now = NOW }) => {
  const states = buildStates({
    topology: topologyOf(EDGES), receipts, observation: declaring(observation, receipts),
    validAt: VALID_AT, knownAt: TAKEN_AT,
    window, now,
  });
  return runEnginePass({
    states, subjectId: SUBJECT_ID, projectBindingRef: 'pb-test', generation,
    topologyDigest: 'd'.repeat(64), observationRunId: observation.run_id,
    takenAt: TAKEN_AT, validAt: VALID_AT, mintValue: uuidSource(seed),
  });
};
const receiptFor = (keys, over = {}) => Object.fromEntries(keys.map((k) => [k, {
  edge_key: k, observed_at: VALID_AT, outcome: 'delivered',
  observation_method: 'module_load_observation', run_id: 'run-test-1', ...over,
}]));
// Three weeks old, far outside the window above.
const STALE_AT = new Date(NOW - 1814400 * 1000).toISOString();

// ---------------------------------------------------------------- everything traversed

{
  const r = pass({ receipts: receiptFor(['alpha>bravo', 'bravo>charlie', 'charlie>delta']), observation: cleanObservation() });
  record('E2E/all_traversed/no_findings', r.findings.length === 0 && r.gap_counts.satisfied === 3);
  record('E2E/all_traversed/envelope_valid', r.envelope.valid === true);
  record('E2E/all_traversed/no_context_request', r.contextRequest === null,
    'nothing needs a human when the evidence answered the question');
  record('E2E/all_traversed/ceiling_is_observed_artifact', r.snapshot.claim_ceiling === 'observed_artifact');
  record('E2E/all_traversed/no_writes', r.erp_writes === 0 && r.learned_model_invocations === 0);
}

// ---------------------------------------------------------------- a real gap is found

{
  const r = pass({ receipts: receiptFor(['alpha>bravo']), observation: cleanObservation() });
  record('E2E/gap/findings_produced', r.findings.length === 2,
    'two declared connections were never traversed and the engine said so');
  record('E2E/gap/missing_because_observation_was_complete',
    r.gap_counts[GAP_TYPE.MISSING] === 2 && r.findings.every((f) => f.gap_type === GAP_TYPE.MISSING));
  record('E2E/gap/findings_cite_the_attempt',
    r.findings.every((f) => typeof f.observation_attempt_ref === 'string' && f.observation_attempt_ref.includes('run-test-1')),
    'a finding must rest on something checkable');
  record('E2E/gap/findings_name_their_requirement',
    r.findings.map((f) => f.expected_element_id).sort().join(',') === 'edge_bravo__charlie,edge_charlie__delta');
  record('E2E/gap/findings_are_candidates',
    r.findings.every((f) => f.disposition_state === 'candidate'),
    'nothing was accepted; P5 was never invoked');
  record('E2E/gap/every_finding_has_a_minted_id',
    new Set(r.findings.map((f) => f.finding_id)).size === r.findings.length);
  record('E2E/gap/no_context_request_for_missing', r.contextRequest === null,
    'a confirmed absence is an answer, not a question for a human');
}

// ---------------------------------------------------------------- the rule that matters

{
  // Same receipts as the gap case, but a surface failed, so the observation cannot be trusted.
  const r = pass({
    receipts: receiptFor(['alpha>bravo']),
    observation: cleanObservation({ surfaces: { declared: 8, run: 8, failing: ['lane_1c_conformance'], counts: {} } }),
  });
  record('E2E/untrustworthy/unknown_not_missing',
    r.gap_counts[GAP_TYPE.UNKNOWN] === 2 && (r.gap_counts[GAP_TYPE.MISSING] ?? 0) === 0,
    'a failed surface means we did not look properly; that is unknown, never absent');
  record('E2E/untrustworthy/ceiling_drops_to_unknown', r.snapshot.claim_ceiling === 'unknown',
    'the snapshot cannot claim an observed artifact it never obtained');
  record('E2E/untrustworthy/findings_carry_unknown_ceiling',
    r.findings.every((f) => f.evidence_claim_ceiling === 'unknown'));
  record('E2E/untrustworthy/context_request_produced', r.contextRequest !== null,
    'an unknown is a question for a human, which is what P6 is for');
  record('E2E/untrustworthy/request_is_candidate_only',
    r.contextRequest.candidate_only === true && r.contextRequest.erp_delta === 0,
    'P6 creates no task and touches no ledger');
  record('E2E/untrustworthy/request_names_only_unknown_findings',
    r.contextRequest.finding_ids.length === 2
    && r.contextRequest.finding_ids.every((id) => r.findings.find((f) => f.finding_id === id).gap_type === GAP_TYPE.UNKNOWN));

  // The observation with no receipts at all is equally untrustworthy in the other direction.
  const nothing = pass({ receipts: {}, observation: cleanObservation() });
  record('E2E/untrustworthy/no_receipts_is_unknown_not_all_missing',
    nothing.gap_counts[GAP_TYPE.UNKNOWN] === 3 && (nothing.gap_counts[GAP_TYPE.MISSING] ?? 0) === 0,
    'zero evidence is not evidence that everything is dead');
}

const trustworthy = {
  observationRecorded: true, failingSurfaces: [], surfacesRun: 8, surfacesDeclared: 11,
  receiptKeySetExact: true, edgeReceiptsRecorded: true,
};
record('E2E/trust/clean_observation_permits_absence',
  observationTrustworthiness(trustworthy).absence_reportable === true,
  'positive control');
for (const [label, input] of [
  ['no_observation_recorded', { ...trustworthy, observationRecorded: false }],
  ['a_surface_failed', { ...trustworthy, failingSurfaces: ['x'] }],
  ['nothing_ran', { ...trustworthy, surfacesRun: 0 }],
  // The two the previous rule could not express at all. "The receipts object is not empty"
  // used to stand in for both of them.
  ['receipt_key_set_does_not_match', { ...trustworthy, receiptKeySetExact: false }],
  ['no_edge_receipt_recorded', { ...trustworthy, edgeReceiptsRecorded: false }],
  // Fail closed on omission: a caller that does not state these does not get the benefit of
  // the doubt, because the whole point is that absence is only reportable when it was checked.
  ['key_set_claim_omitted', { observationRecorded: true, failingSurfaces: [], surfacesRun: 8, edgeReceiptsRecorded: true }],
  ['receipt_record_claim_omitted', { observationRecorded: true, failingSurfaces: [], surfacesRun: 8, receiptKeySetExact: true }],
]) {
  record(`E2E/trust/blocked/${label}`, observationTrustworthiness(input).absence_reportable === false);
}

// ---------------------------------------------------------------- replay

{
  const receipts = receiptFor(['alpha>bravo']);
  const first = pass({ receipts, observation: cleanObservation(), seed: 0 });
  const second = pass({ receipts, observation: cleanObservation(), seed: 5000 });

  record('E2E/replay/fingerprint_is_identical', first.fingerprint === second.fingerprint,
    'the same inputs must give the same fingerprint even with fresh identifiers');
  record('E2E/replay/snapshot_ids_differ', first.snapshot.snapshot_id !== second.snapshot.snapshot_id,
    'each snapshot is its own subject; identifiers are minted per snapshot');
  record('E2E/replay/finding_ids_differ',
    first.findings[0].finding_id !== second.findings[0].finding_id);
  record('E2E/replay/run_observational_layer_differs',
    first.snapshot.run_observational_provenance.engine_run_id !== second.snapshot.run_observational_provenance.engine_run_id,
    'and that difference must not have moved the fingerprint');

  const rerun = classifyReplay({ prior: first, next: second });
  record('E2E/replay/emits_a_verification_receipt',
    rerun.action === 'emit_verification_receipt' && rerun.materialise === false,
    `an identical fingerprint is the same question asked twice, got ${rerun.action}`);
  record('E2E/replay/receipt_cites_the_original_snapshot',
    rerun.snapshot_id === first.snapshot.snapshot_id,
    'one accepted generation keeps exactly one snapshot');

  // A changed input must move the fingerprint, otherwise the replay property is vacuous.
  const changed = pass({ receipts, observation: cleanObservation(), generation: 2 });
  record('E2E/replay/changed_generation_moves_fingerprint', changed.fingerprint !== first.fingerprint,
    'if nothing moved it, the fingerprint would prove nothing');
  const changedRerun = classifyReplay({ prior: first, next: changed });
  record('E2E/replay/changed_input_materialises_a_new_snapshot',
    changedRerun.action === 'materialise_new_snapshot' && changedRerun.materialise === true,
    'a different question deserves its own snapshot');
  const moreEvidence = pass({ receipts: receiptFor(['alpha>bravo', 'bravo>charlie']), observation: cleanObservation() });
  record('E2E/replay/same_inputs_only', moreEvidence.gap_counts[GAP_TYPE.MISSING] === 1,
    'more evidence, fewer gaps');
}

// ---------------------------------------------------------------- inputs are required

rejects('E2E/inputs/states_required', () => runEnginePass({ takenAt: TAKEN_AT, mintValue: uuidSource(0) }), 'ENGINE_PASS_INPUT_MISSING');
rejects('E2E/inputs/instant_required', () => runEnginePass({ states: { expected: [], observed: [] }, mintValue: uuidSource(0) }), 'ENGINE_PASS_INPUT_MISSING');
rejects('E2E/inputs/mint_source_required', () => runEnginePass({ states: { expected: [], observed: [] }, takenAt: TAKEN_AT }), 'ENGINE_PASS_INPUT_MISSING');
// ---------------------------------------------------------------- a receipt is judged, not counted
//
// The whole point of the delivery window is that a receipt stops proving anything once it is
// outside it. That was enforced in the kernel and then thrown away by the adapter, which read
// "there is a key for this edge" as "present" and produced a satisfied pair from a month-old
// observation. These cases drive the stale receipt through the assembled pass, which is where
// the loss actually happened.

{
  const r = pass({ receipts: receiptFor(['alpha>bravo', 'bravo>charlie', 'charlie>delta'], { observed_at: STALE_AT }), observation: cleanObservation() });
  record('E2E/stale/nothing_satisfied', (r.gap_counts.satisfied ?? 0) === 0,
    'a stale receipt does not satisfy the requirement it once evidenced');
  record('E2E/stale/no_missing_either', (r.gap_counts[GAP_TYPE.MISSING] ?? 0) === 0,
    'and it is not evidence of absence; something did happen on that edge');
  record('E2E/stale/all_unknown', r.gap_counts[GAP_TYPE.UNKNOWN] === 3);
  record('E2E/stale/snapshot_ceiling_unknown', r.snapshot.claim_ceiling === 'unknown');
  record('E2E/stale/context_request_raised', r.contextRequest !== null && r.contextRequest.erp_delta === 0);
}
{
  // One stale receipt also costs the run its right to report the other edges as absent: a run
  // holding evidence it cannot believe did not look properly.
  const receipts = { ...receiptFor(['alpha>bravo'], { observed_at: STALE_AT }) };
  const r = pass({ receipts, observation: cleanObservation() });
  record('E2E/stale/unbelievable_receipt_blocks_confirmed_absence',
    (r.gap_counts[GAP_TYPE.MISSING] ?? 0) === 0 && r.gap_counts[GAP_TYPE.UNKNOWN] === 3);
}
{
  // Positive control for the same path: a fresh receipt still satisfies.
  const r = pass({ receipts: receiptFor(['alpha>bravo']), observation: cleanObservation() });
  record('E2E/stale/positive_control_fresh_receipt_satisfies', r.gap_counts.satisfied === 1);
}
{
  // A failed delivery is a receipt too, and it proves nothing about traversal.
  const r = pass({ receipts: receiptFor(['alpha>bravo'], { outcome: 'failed' }), observation: cleanObservation() });
  record('E2E/stale/failed_receipt_is_unknown_not_satisfied',
    (r.gap_counts.satisfied ?? 0) === 0 && r.gap_counts[GAP_TYPE.UNKNOWN] === 3);
}
{
  // A malformed receipt must not abort the pass and must not be believed.
  const r = pass({ receipts: { 'alpha>bravo': { edge_key: 'alpha>bravo' } }, observation: cleanObservation() });
  record('E2E/stale/malformed_receipt_is_unknown',
    (r.gap_counts.satisfied ?? 0) === 0 && r.gap_counts[GAP_TYPE.UNKNOWN] === 3);
}

// ---------------------------------------------------------------- the receipt map is a set
//
// The previous rule read "there is at least one key in the receipts object" as "an observation
// was recorded", and never compared the map to anything. That let three separate records pass
// as evidence for an edge they were not about: a receipt filed under the wrong key, a receipt
// from a different run, and a receipt for an edge the topology does not declare. Each of them
// must leave the edge unknown, and each must also cost the run its right to report the edges
// it did not reach as confirmed absences.

{
  // Misfiled: a valid, fresh receipt whose own edge_key names a different connection.
  const receipts = { 'alpha>bravo': { ...receiptFor(['bravo>charlie'])['bravo>charlie'] } };
  const states = buildStates({
    topology: topologyOf(EDGES), receipts, observation: declaring(cleanObservation(), receipts),
    validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW, now: NOW,
  });
  record('E2E/receipt_map/misfiled_receipt_is_not_proof',
    states.receipt_verdicts['alpha>bravo'] === 'misfiled'
      && states.observed.every((o) => o.presence_state !== PRESENCE.PRESENT),
    'a record about another edge does not evidence this one however fresh it is');
  const r = pass({ receipts, observation: cleanObservation() });
  record('E2E/receipt_map/misfiled_receipt_blocks_absence',
    (r.gap_counts[GAP_TYPE.MISSING] ?? 0) === 0 && r.gap_counts[GAP_TYPE.UNKNOWN] === 3
      && (r.gap_counts.satisfied ?? 0) === 0);
}
{
  // A receipt from another run. It attests a real traversal, in an observation this is not.
  const receipts = receiptFor(['alpha>bravo'], { run_id: 'run-some-other' });
  const states = buildStates({
    topology: topologyOf(EDGES), receipts, observation: declaring(cleanObservation(), receipts),
    validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW, now: NOW,
  });
  record('E2E/receipt_map/foreign_run_receipt_is_not_proof',
    states.receipt_verdicts['alpha>bravo'] === 'foreign_run');
  const r = pass({ receipts, observation: cleanObservation() });
  record('E2E/receipt_map/foreign_run_receipt_blocks_absence',
    (r.gap_counts.satisfied ?? 0) === 0 && r.gap_counts[GAP_TYPE.UNKNOWN] === 3);
}
{
  // An unexpected key: a receipt for an edge the topology never declared, sitting alongside a
  // perfectly good one. The good receipt must stop counting too, because the map it arrived in
  // is not the map this topology can account for.
  const receipts = { ...receiptFor(['alpha>bravo']), ...receiptFor(['delta>echo']) };
  const states = buildStates({
    topology: topologyOf(EDGES), receipts, observation: declaring(cleanObservation(), receipts),
    validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW, now: NOW,
  });
  record('E2E/receipt_map/undeclared_key_reported',
    states.receipt_key_set.undeclared_by_topology.join(',') === 'delta>echo'
      && states.receipt_key_set.exact === false);
  const r = pass({ receipts, observation: cleanObservation() });
  record('E2E/receipt_map/undeclared_key_blocks_everything',
    (r.gap_counts.satisfied ?? 0) === 0 && (r.gap_counts[GAP_TYPE.MISSING] ?? 0) === 0
      && r.gap_counts[GAP_TYPE.UNKNOWN] === 3,
    'an unexpected receipt never makes a declared edge present, satisfied or absent');
}
{
  // The run claims a key set the map does not hold, in each direction.
  const receipts = receiptFor(['alpha>bravo']);
  const overclaimed = pass({
    receipts,
    observation: cleanObservation({ edges: { exercised_edge_keys: ['alpha>bravo', 'bravo>charlie'] } }),
  });
  record('E2E/receipt_map/run_claims_a_receipt_that_is_absent',
    (overclaimed.gap_counts.satisfied ?? 0) === 0 && overclaimed.gap_counts[GAP_TYPE.UNKNOWN] === 3);
  const underclaimed = pass({
    receipts,
    observation: cleanObservation({ edges: { exercised_edge_keys: [] } }),
  });
  record('E2E/receipt_map/map_holds_a_receipt_the_run_never_claimed',
    (underclaimed.gap_counts.satisfied ?? 0) === 0 && underclaimed.gap_counts[GAP_TYPE.UNKNOWN] === 3);
}
{
  // A non-empty receipt map with no observation record behind it. This is the exact shape the
  // old rule accepted as "an observation was recorded".
  const receipts = receiptFor(['alpha>bravo']);
  const states = buildStates({
    topology: topologyOf(EDGES), receipts,
    observation: { surfaces: { declared: 8, run: 8, failing: [], counts: {} } },
    validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW, now: NOW,
  });
  record('E2E/receipt_map/non_empty_map_is_not_a_recorded_observation',
    states.observation_record.recorded === false
      && states.observation_record.reasons.includes('observation_names_no_run')
      && states.observation_record.reasons.includes('observation_declares_no_exercised_edge_key_set')
      && states.trust.absence_reportable === false,
    'holding keys is not the same as having recorded a run');
  record('E2E/receipt_map/unrecorded_observation_yields_no_present',
    states.observed.every((o) => o.presence_state === PRESENCE.UNKNOWN));
}
{
  // Positive control on the same path: a complete record, an exact key set, fresh receipts.
  const receipts = receiptFor(['alpha>bravo', 'bravo>charlie', 'charlie>delta']);
  const states = buildStates({
    topology: topologyOf(EDGES), receipts, observation: declaring(cleanObservation(), receipts),
    validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW, now: NOW,
  });
  const r = pass({ receipts, observation: cleanObservation() });
  record('E2E/receipt_map/positive_control_exact_set',
    states.receipt_key_set.exact === true && states.trust.absence_reportable === true
      && r.gap_counts.satisfied === 3 && r.findings.length === 0,
    'an exact, fresh, same-run receipt map still proves traversal');
  const partial = pass({ receipts: receiptFor(['alpha>bravo']), observation: cleanObservation() });
  record('E2E/receipt_map/positive_control_exact_partial_set',
    partial.gap_counts.satisfied === 1 && partial.gap_counts[GAP_TYPE.MISSING] === 2,
    'and a run that exactly declares one exercised edge may still report the other two absent');
}

rejects('E2E/inputs/window_required',
  () => buildStates({ topology: topologyOf(EDGES), receipts: {}, observation: cleanObservation(), validAt: VALID_AT, knownAt: TAKEN_AT, now: NOW }),
  'SUBJECT_INPUT_INVALID', 'without a declared window "fresh" would mean whatever the caller wanted');
rejects('E2E/inputs/now_required',
  () => buildStates({ topology: topologyOf(EDGES), receipts: {}, observation: cleanObservation(), validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW }),
  'SUBJECT_INPUT_INVALID', 'the adapter does not read a clock of its own');

rejects('E2E/inputs/receipts_required',
  () => buildStates({ topology: topologyOf(EDGES), observation: cleanObservation(), validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW, now: NOW }),
  'SUBJECT_INPUT_INVALID');
rejects('E2E/inputs/topology_required',
  () => buildStates({ receipts: {}, observation: cleanObservation(), validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW, now: NOW }),
  'SUBJECT_INPUT_INVALID');

// ---------------------------------------------------------------- axes stay separated

{
  const receipts = receiptFor(['alpha>bravo']);
  const states = buildStates({
    topology: topologyOf(EDGES), receipts, observation: declaring(cleanObservation(), receipts),
    validAt: VALID_AT, knownAt: TAKEN_AT, window: WINDOW, now: NOW,
  });
  record('E2E/axes/one_expected_per_requirement', states.expected.length === EDGES.length);
  record('E2E/axes/expected_carry_no_artifact',
    states.expected.every((e) => !Object.hasOwn(e, 'artifact_revision_ref')),
    'an element that is both cannot disagree with itself');
  record('E2E/axes/observed_carry_no_requirement',
    states.observed.every((o) => !Object.hasOwn(o, 'requirement_ref')));
  record('E2E/axes/presence_reflects_the_receipt',
    states.observed.find((o) => o.element_id === 'obs_edge_alpha__bravo').presence_state === PRESENCE.PRESENT
    && states.observed.find((o) => o.element_id === 'obs_edge_bravo__charlie').presence_state === PRESENCE.ABSENCE_CONFIRMED);
  record('E2E/axes/accepted_input_set_carries_refs_not_strings',
    states.canonical_accepted_input_set.source_revision_refs.every((r) => typeof r === 'object' && typeof r.revision_id === 'string'),
    'the kernel declares this path sorted_by:revision_id, so the elements are refs');
}

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'end_to_end_engine_pass',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  verification_strength: 'author_written_fixtures',
  independent_lock_owed_by: 'lane_1V',
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
