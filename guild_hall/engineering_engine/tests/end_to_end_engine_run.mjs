// End-to-end: does the engine actually find things, and does a replay behave like a replay?
//
// The self-topology run passes with zero findings because every edge happened to be traversed,
// and a test where nothing is found proves nothing about the finding. So this drives whole
// passes over controlled subjects where the answer is known in advance, including the case the
// entire kernel is built around: not-observed must become unknown, not missing, whenever the
// observation itself was not trustworthy.

import { buildStates, observationTrustworthiness, SUBJECT_ID } from '../subjects/engine_self_topology.mjs';
import { runEnginePass, classifyReplay } from '../assembly/engine_pass.mjs';
import { GAP_TYPE } from '../kernel/snapshot.mjs';
import { PRESENCE } from '../kernel/custody.mjs';
import { ContractError } from '../kernel/errors.mjs';

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
const pass = ({ receipts, observation, seed = 0, generation = 1 }) => {
  const states = buildStates({
    topology: topologyOf(EDGES), receipts, observation, validAt: VALID_AT, knownAt: TAKEN_AT,
  });
  return runEnginePass({
    states, subjectId: SUBJECT_ID, projectBindingRef: 'pb-test', generation,
    topologyDigest: 'd'.repeat(64), observationRunId: observation.run_id,
    takenAt: TAKEN_AT, validAt: VALID_AT, mintValue: uuidSource(seed),
  });
};
const receiptFor = (keys) => Object.fromEntries(keys.map((k) => [k, {
  edge_key: k, observed_at: VALID_AT, outcome: 'delivered',
  observation_method: 'module_load_observation', run_id: 'run-test-1',
}]));

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

record('E2E/trust/clean_observation_permits_absence',
  observationTrustworthiness({ observationRecorded: true, failingSurfaces: [], surfacesRun: 8, surfacesDeclared: 11 }).absence_reportable === true,
  'positive control');
for (const [label, input] of [
  ['no_observation_recorded', { observationRecorded: false, failingSurfaces: [], surfacesRun: 8 }],
  ['a_surface_failed', { observationRecorded: true, failingSurfaces: ['x'], surfacesRun: 8 }],
  ['nothing_ran', { observationRecorded: true, failingSurfaces: [], surfacesRun: 0 }],
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
rejects('E2E/inputs/receipts_required',
  () => buildStates({ topology: topologyOf(EDGES), observation: cleanObservation(), validAt: VALID_AT, knownAt: TAKEN_AT }),
  'SUBJECT_INPUT_INVALID');
rejects('E2E/inputs/topology_required',
  () => buildStates({ receipts: {}, observation: cleanObservation(), validAt: VALID_AT, knownAt: TAKEN_AT }),
  'SUBJECT_INPUT_INVALID');

// ---------------------------------------------------------------- axes stay separated

{
  const states = buildStates({
    topology: topologyOf(EDGES), receipts: receiptFor(['alpha>bravo']), observation: cleanObservation(),
    validAt: VALID_AT, knownAt: TAKEN_AT,
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
