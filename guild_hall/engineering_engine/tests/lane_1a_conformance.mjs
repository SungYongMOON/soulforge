// Lane 1A conformance — snapshot envelope, state axes, Finding schema, Context Request
// schema, P5 to P8 boundaries.
//
// Verification strength: author-written fixtures. Lane 1V owes a mutation-based lock.

import {
  AXIS, GAP_TYPE, REQUIRED_ENVELOPE_FIELDS, REQUIRED_FINDING_FIELDS,
  REQUIRED_EXPECTED_ELEMENT_FIELDS, REQUIRED_OBSERVED_ELEMENT_FIELDS, CODES as S,
  validateStateElement, compareStates, classifyUnmatchedObservation, assertMissingIsConfirmed,
  validateFinding, validateSnapshotEnvelope, assertSnapshotImmutable, assertProvenanceLayersSeparate,
} from '../kernel/snapshot.mjs';
import {
  SERIALISED_BOUNDARIES, BOUNDARY_LANES, BOUNDARY_EFFECTS, P7, CODES as P,
  REQUIRED_CONTEXT_REQUEST_FIELDS,
  assertStageDefined, assertBoundarySeparation, evaluateP5Acceptance, evaluateGenerationAdvance,
  validateContextRequest, assertZeroErpDelta, evaluateP8Write, OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
  DEFINED_STAGES, TASK_DRIVER_POLICY_CHECKS, POLICY_GATE_ID,
  evaluateTaskDriverPolicyGate, evaluateP7TaskDriver, assertTaskDriverNotActivated,
  REQUIRED_P8_CHAIN_ELEMENTS, P8_CHAIN_RECORD_ELEMENTS, P8_RECOMPUTED_CHAIN_ELEMENTS,
  REQUIRED_CHAIN_PROVENANCE_FIELDS, chainElementContentAddress,
} from '../kernel/pipeline.mjs';
import { CODES as REG } from '../kernel/registration.mjs';
import { buildRegistrationRegistry, humanEntry, authorityEntry } from '../fixtures/registration_evidence.mjs';
import { deterministicReplayFingerprint } from '../kernel/fingerprint.mjs';
import { FINGERPRINT_INPUT_KEYS } from '../kernel/contract_config.mjs';
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
  record('1A/harness/self_test',
    probe[0] === false && probe[1] === false && probe[2] === true && probe[3] === false && probe[4] === false,
    'the reject and accept helpers detect what they claim to');
}

const SNAP_ID = 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const FIND_ID = '0192f0a1-b2c3-7d4e-8f01-234567890abc';
const REQ_ID = 'b7c8d9e0-1f2a-4b3c-9d4e-5f6a7b8c9d0e';
const ref = (id) => ({ entity_id: id, revision_id: `${id}-r1`, content_id: `${id}-c1`, content_hash_alg: 'sha256' });

const expectedEl = (over = {}) => ({
  element_id: 'exp-1', axis: AXIS.EXPECTED, requirement_ref: ref('req-1'),
  authority_family: 'project_contract_baseline', applicability: true,
  valid_at: '2026-08-01T00:00:00.000Z', known_at: '2026-08-02T00:00:00.000Z', ...over,
});
const observedEl = (over = {}) => ({
  element_id: 'obs-1', axis: AXIS.OBSERVED, artifact_revision_ref: ref('art-1'),
  presence_state: PRESENCE.PRESENT,
  valid_at: '2026-08-01T00:00:00.000Z', known_at: '2026-08-02T00:00:00.000Z', ...over,
});
// A conflict finding has to carry both disagreeing sides, so the default fixture does.
const sourceConflict = (over = {}) => ({
  conflict: true, claim_count: 2,
  retained_claims: [
    { claim_id: 'c-baseline', authority_family: 'project_contract_baseline', asserted_value: 'A' },
    { claim_id: 'c-wiki', authority_family: 'reviewed_wiki', asserted_value: 'B' },
  ],
  governing_authority_family: 'project_contract_baseline',
  sides_dropped: 0, ...over,
});
const finding = (over = {}) => ({
  finding_id: FIND_ID, snapshot_id: SNAP_ID, gap_type: GAP_TYPE.CONFLICT,
  expected_element_id: 'exp-1', evidence_claim_ceiling: 'source_referenced',
  authority_family: 'project_contract_baseline', known_at: '2026-08-03T00:00:00.000Z',
  disposition_state: 'candidate',
  source_conflict: sourceConflict(),
  cited_spans: [{ retention_ref: 'ret-1', span_hash: 'b'.repeat(64) }], ...over,
});

const fpInput = {
  canonical_accepted_input_set: { source_revision_refs: [], artifact_revision_refs: [] },
  accepted_context_generation: 4,
  project_binding_ref: 'pb-0001',
  replay_relevant_provenance: { engine_id: 'eng-1', execution_mode: 'deterministic_only' },
};

const snapshot = (over = {}) => {
  const base = {
    snapshot_id: SNAP_ID,
    ...fpInput,
    snapshot_schema_version: 'snap.v1',
    taken_at: '2026-08-03T00:00:00.000Z',
    run_observational_provenance: { engine_run_id: 'run-9' },
    expected_state_elements: [expectedEl()],
    observed_state_elements: [observedEl()],
    findings: [finding()],
    claim_ceiling: 'source_referenced',
    execution_mode: 'deterministic_only',
    custody_summary: { pinned: 1, retained_spans: 1 },
    ...over,
  };
  // Recompute so the fixture is self-consistent unless a case deliberately breaks it.
  if (!Object.hasOwn(over, 'deterministic_replay_fingerprint')) {
    base.deterministic_replay_fingerprint = deterministicReplayFingerprint(
      Object.fromEntries(FINGERPRINT_INPUT_KEYS.map((k) => [k, base[k]])),
    );
  }
  return base;
};

// ---------------------------------------------------------------- state axes

record('1A/axis/two_axes_only', Object.values(AXIS).length === 2);
accepts('1A/axis/expected_element_passes', () => validateStateElement(expectedEl()), 'positive control');
accepts('1A/axis/observed_element_passes', () => validateStateElement(observedEl()), 'positive control');
rejects('1A/axis/unknown_axis', () => validateStateElement(expectedEl({ axis: 'inferred' })), S.AXIS_INVALID);
rejects('1A/axis/both_kinds_of_claim_refused',
  () => validateStateElement({ ...expectedEl(), artifact_revision_ref: ref('art-1') }), S.AXIS_AMBIGUOUS,
  'an element that is both can never disagree with itself');
for (const f of REQUIRED_EXPECTED_ELEMENT_FIELDS) {
  const e = expectedEl(); delete e[f];
  rejects(`1A/axis/expected_missing/${f}`, () => validateStateElement(e), undefined);
}
for (const f of REQUIRED_OBSERVED_ELEMENT_FIELDS) {
  const e = observedEl(); delete e[f];
  rejects(`1A/axis/observed_missing/${f}`, () => validateStateElement(e), undefined);
}
rejects('1A/axis/known_before_valid',
  () => validateStateElement(expectedEl({ valid_at: '2026-08-05T00:00:00.000Z', known_at: '2026-08-01T00:00:00.000Z' })),
  S.INSTANT_INVALID, 'a fact cannot be known before it holds');
rejects('1A/axis/floating_requirement_ref',
  () => validateStateElement(expectedEl({ requirement_ref: { entity_id: 'req-1' } })), S.ELEMENT_FIELD_MISSING);
rejects('1A/axis/second_precision_instant',
  () => validateStateElement(expectedEl({ known_at: '2026-08-02T00:00:00Z' })), S.INSTANT_INVALID);
rejects('1A/axis/bad_presence_state',
  () => validateStateElement(observedEl({ presence_state: 'probably_there' })), S.ELEMENT_FIELD_MISSING);

// ---------------------------------------------------------------- comparison

record('1A/compare/satisfied',
  compareStates({ expected: expectedEl(), observed: observedEl() }).gap_type === GAP_TYPE.SATISFIED);
record('1A/compare/conflict',
  compareStates({ expected: expectedEl(), observed: observedEl(), conflicts: true }).gap_type === GAP_TYPE.CONFLICT);
record('1A/compare/confirmed_absence_is_missing',
  compareStates({ expected: expectedEl(), observed: observedEl({ presence_state: PRESENCE.ABSENCE_CONFIRMED }) }).gap_type === GAP_TYPE.MISSING);
record('1A/compare/unmade_observation_is_unknown_not_missing',
  compareStates({ expected: expectedEl(), observed: observedEl({ presence_state: PRESENCE.UNKNOWN }) }).gap_type === GAP_TYPE.UNKNOWN,
  'reporting "does not exist" when the truth is "could not look" is the failure this prevents');
record('1A/compare/no_observation_at_all_is_unknown',
  compareStates({ expected: expectedEl(), observed: undefined }).gap_type === GAP_TYPE.UNKNOWN);
record('1A/compare/unknown_never_becomes_missing',
  compareStates({ expected: expectedEl(), observed: observedEl({ presence_state: PRESENCE.UNKNOWN }), conflicts: true }).gap_type === GAP_TYPE.UNKNOWN,
  'a conflict flag does not upgrade an unmade observation');
rejects('1A/compare/expected_argument_must_be_expected',
  () => compareStates({ expected: observedEl(), observed: observedEl() }), S.AXIS_INVALID);
rejects('1A/compare/observed_argument_must_be_observed',
  () => compareStates({ expected: expectedEl(), observed: expectedEl() }), S.AXIS_INVALID);
{
  const u = classifyUnmatchedObservation(observedEl());
  record('1A/compare/unmatched_observation_is_for_review', u.gap_type === GAP_TYPE.UNEXPECTED && u.is_defect === false,
    'the requirement set may simply be incomplete; deciding which belongs to a human');
}
accepts('1A/compare/missing_with_confirmation_ok',
  () => assertMissingIsConfirmed(GAP_TYPE.MISSING, PRESENCE.ABSENCE_CONFIRMED), 'positive control');
rejects('1A/compare/missing_from_unknown_refused',
  () => assertMissingIsConfirmed(GAP_TYPE.MISSING, PRESENCE.UNKNOWN), S.MISSING_WITHOUT_CONFIRMED_ABSENCE);
rejects('1A/compare/missing_with_no_presence_refused',
  () => assertMissingIsConfirmed(GAP_TYPE.MISSING, undefined), S.MISSING_WITHOUT_CONFIRMED_ABSENCE);
accepts('1A/compare/other_gap_types_unaffected',
  () => assertMissingIsConfirmed(GAP_TYPE.UNKNOWN, PRESENCE.UNKNOWN), 'positive control');

// ---------------------------------------------------------------- finding

accepts('1A/finding/complete_finding_passes', () => validateFinding(finding()), 'positive control');
for (const f of REQUIRED_FINDING_FIELDS) {
  const x = finding(); delete x[f];
  rejects(`1A/finding/missing/${f}`, () => validateFinding(x), undefined);
}
rejects('1A/finding/id_must_be_minted',
  () => validateFinding(finding({ finding_id: 'finding-7' })), 'MINT_IDENTIFIER_REQUIRED',
  'per D-P10-03 a finding_id comes from the serialised boundary');
rejects('1A/finding/candidate_handle_is_not_an_id',
  () => validateFinding(finding({ finding_id: `cand-${'9'.repeat(64)}` })), 'MINT_HANDLE_NOT_AN_IDENTIFIER',
  'parallel candidate output is not citable');
rejects('1A/finding/unknown_gap_type', () => validateFinding(finding({ gap_type: 'looks_wrong' })), S.GAP_TYPE_INVALID);
rejects('1A/finding/canon_axis_value_refused',
  () => validateFinding(finding({ evidence_claim_ceiling: 'canon_entry' })), undefined,
  'the evidence axis and the canon axis do not interconvert');
accepts('1A/finding/evidence_axis_value_accepted',
  () => validateFinding(finding({ evidence_claim_ceiling: 'human_accepted' })), 'positive control');
rejects('1A/finding/cites_nothing',
  () => validateFinding(finding({ cited_spans: [] })), S.FINDING_CITES_NOTHING,
  'an assertion with no way to check it');
accepts('1A/finding/absence_record_counts_as_a_citation',
  () => validateFinding(finding({ gap_type: GAP_TYPE.MISSING, observed_presence_state: PRESENCE.ABSENCE_CONFIRMED, cited_spans: [], observation_attempt_ref: 'obs-attempt-1' })),
  'a missing finding cites the attempt, not a source span');
// A conflict must carry the disagreement, not just the label. Dropping the lower authority
// side while still calling it a conflict is the silent-loss failure the frozen O4 names.
rejects('1A/finding/conflict_without_a_record',
  () => validateFinding(finding({ source_conflict: undefined })), S.CONFLICT_SIDES_NOT_PRESERVED);
rejects('1A/finding/conflict_with_one_side_only',
  () => validateFinding(finding({ source_conflict: sourceConflict({ claim_count: 1, retained_claims: [{ claim_id: 'c-baseline', authority_family: 'project_contract_baseline' }] }) })),
  S.CONFLICT_SIDES_NOT_PRESERVED, 'one retained claim is a verdict, not a conflict record');
rejects('1A/finding/conflict_admitting_a_dropped_side',
  () => validateFinding(finding({ source_conflict: sourceConflict({ sides_dropped: 1 }) })),
  S.CONFLICT_SIDES_NOT_PRESERVED);
rejects('1A/finding/conflict_without_a_stated_winner',
  () => validateFinding(finding({ source_conflict: sourceConflict({ governing_authority_family: undefined }) })),
  S.CONFLICT_SIDES_NOT_PRESERVED, 'picking a winner silently is the other half of the same failure');
accepts('1A/finding/non_conflict_needs_no_conflict_record',
  () => validateFinding(finding({ gap_type: GAP_TYPE.UNKNOWN, source_conflict: undefined, evidence_claim_ceiling: 'unknown' })),
  'positive control: the rule applies to conflicts only');

rejects('1A/finding/missing_gap_from_unknown_presence',
  () => validateFinding(finding({ gap_type: GAP_TYPE.MISSING, observed_presence_state: PRESENCE.UNKNOWN })),
  S.MISSING_WITHOUT_CONFIRMED_ABSENCE);

// ---------------------------------------------------------------- envelope

accepts('1A/envelope/complete_snapshot_passes', () => validateSnapshotEnvelope(snapshot()), 'positive control');
record('1A/envelope/reports_the_evidence_axis', validateSnapshotEnvelope(snapshot()).claim_ceiling_axis === 'evidence',
  'D-P10-01');
for (const f of REQUIRED_ENVELOPE_FIELDS) {
  const s = snapshot(); delete s[f];
  rejects(`1A/envelope/missing/${f}`, () => validateSnapshotEnvelope(s), undefined);
}
rejects('1A/envelope/fingerprint_is_recomputed_not_trusted',
  () => validateSnapshotEnvelope(snapshot({ deterministic_replay_fingerprint: 'f'.repeat(64) })), S.FINGERPRINT_MISMATCH,
  'a stored fingerprint nobody recomputes is a comment, not a check');
rejects('1A/envelope/changing_a_fingerprint_input_invalidates_it', () => {
  const s = snapshot();
  s.accepted_context_generation = 5;   // fingerprint now stale
  validateSnapshotEnvelope(s);
}, S.FINGERPRINT_MISMATCH);
accepts('1A/envelope/observational_layer_change_does_not_break_it', () => {
  const s = snapshot();
  s.run_observational_provenance = { engine_run_id: 'run-different' };
  validateSnapshotEnvelope(s);
}, 'a replay must not produce a new fingerprint just because the run id differs');
rejects('1A/envelope/snapshot_id_must_be_minted',
  () => validateSnapshotEnvelope(snapshot({ snapshot_id: 'snap-1' })), 'MINT_IDENTIFIER_REQUIRED');
rejects('1A/envelope/negative_generation',
  () => validateSnapshotEnvelope(snapshot({ accepted_context_generation: -1 })), S.ENVELOPE_FIELD_MISSING);
rejects('1A/envelope/expected_list_holds_only_expected',
  () => validateSnapshotEnvelope(snapshot({ expected_state_elements: [observedEl()] })), S.AXIS_INVALID);
rejects('1A/envelope/observed_list_holds_only_observed',
  () => validateSnapshotEnvelope(snapshot({ observed_state_elements: [expectedEl()] })), S.AXIS_INVALID);
rejects('1A/envelope/finding_from_another_snapshot',
  () => validateSnapshotEnvelope(snapshot({ findings: [finding({ snapshot_id: REQ_ID })] })), S.FINDING_FIELD_MISSING);
rejects('1A/envelope/canon_axis_value_in_claim_ceiling',
  () => validateSnapshotEnvelope(snapshot({ claim_ceiling: 'canon_entry' })), undefined,
  'the evidence field must not carry a canon axis value');
// Separate guard, separate test: the previous case fails on the enum, so it never reached
// the check that the canon axis field itself is absent. Lane 1V exposed that.
rejects('1A/envelope/canon_axis_field_present_at_all',
  () => validateSnapshotEnvelope(snapshot({ canon_claim_ceiling: 'canon_entry' })), 'CEILING_CROSS_AXIS_CONVERSION',
  'the canon axis must not appear inside a snapshot under any field name');

for (const intent of ['edit', 'patch', 'update_in_place']) {
  rejects(`1A/envelope/immutable/${intent}`, () => assertSnapshotImmutable(intent), S.SNAPSHOT_IMMUTABLE,
    'a correction is a new snapshot');
}
accepts('1A/envelope/superseding_is_allowed', () => assertSnapshotImmutable('supersede'), 'positive control');
accepts('1A/envelope/provenance_layers_separate', () => assertProvenanceLayersSeparate(snapshot()), 'positive control');
rejects('1A/envelope/observational_field_leaking_into_replay_layer',
  () => assertProvenanceLayersSeparate({
    replay_relevant_provenance: { engine_id: 'e', engine_run_id: 'run-9' },
    run_observational_provenance: { engine_run_id: 'run-9' },
  }), S.OBSERVATIONAL_LAYER_LEAKED,
  'that is exactly what makes every replay produce a new fingerprint');

// ---------------------------------------------------------------- boundaries

record('1A/boundary/four_serialised_boundaries', SERIALISED_BOUNDARIES.length === 4);
record('1A/boundary/lane_names_come_from_lane_1d',
  BOUNDARY_LANES.join(',') === 'binding_promotion,generation_advance,p5_acceptance,p8_writer',
  'derived from lane 1D OPERATIONS, not restated');
record('1A/boundary/every_lane_declares_effects',
  BOUNDARY_LANES.every((l) => BOUNDARY_EFFECTS[l] && BOUNDARY_EFFECTS[l].does_not.length >= 3),
  'the does_not half is the load-bearing one');
accepts('1A/boundary/declared_effect_allowed',
  () => assertBoundarySeparation('p5_acceptance', 'accepted_context_set'), 'positive control');
for (const [lane, implied] of [
  ['p5_acceptance', 'advance_generation'],
  ['p5_acceptance', 'write_erp_task'],
  ['generation_advance', 'accept_context'],
  ['binding_promotion', 'write_erp_task'],
  ['p8_writer', 'advance_generation'],
]) {
  rejects(`1A/boundary/conflation/${lane}_does_not_${implied}`,
    () => assertBoundarySeparation(lane, implied), P.BOUNDARY_CONFLATED,
    'one approval must not buy a second effect');
}
rejects('1A/boundary/unknown_lane', () => assertBoundarySeparation('p9_something', 'x'), P.BOUNDARY_UNKNOWN);
rejects('1A/boundary/undeclared_effect', () => assertBoundarySeparation('p5_acceptance', 'delete_project'), P.BOUNDARY_UNKNOWN);

// P7 is the TaskDriver, as the frozen plan says, and it sits behind the four-check gate.
record('1A/boundary/p7_is_the_task_driver',
  P7.stage === 'P7' && P7.name === 'task_driver' && P7.gate_id === 'p7_taskdriver',
  'V1.2, V1.2.1 and the frozen work lanes all name P7 as the TaskDriver');
record('1A/boundary/p7_is_preceded_by_the_policy_gate',
  P7.preceded_by_gate_id === POLICY_GATE_ID
    && JSON.stringify(P7.policy_checks) === JSON.stringify(['why', 'why_now', 'authority', 'idempotency']),
  'the four checks are a gate in front of P7, not an unwritten habit inside it');
record('1A/boundary/p7_is_not_activated', P7.activation_state === 'not_activated' && P7.erp_delta === 0,
  'the stage is defined; no live driver is switched on by defining it');
accepts('1A/boundary/p7_is_a_defined_stage', () => assertStageDefined('P7'), 'positive control');
accepts('1A/boundary/defined_stage_ok', () => assertStageDefined('P5'), 'positive control');
rejects('1A/boundary/unknown_stage_refused', () => assertStageDefined('P9'), P.STAGE_NOT_DEFINED,
  'a stage nobody defined still cannot be contracted');
record('1A/boundary/defined_stages_are_the_frozen_four',
  JSON.stringify([...DEFINED_STAGES]) === JSON.stringify(['P5', 'P6', 'P7', 'P8']));

// ---------------------------------------------------------------- registration evidence
//
// Three boundaries below used to take registration from the record being judged. They now take
// it from evidence: a content-addressed registry, pinned to a revision, scoped to one project.
// Everything in it is synthetic, and none of it settles D-P10-08 — who may be registered is
// still an open owner decision. What it settles is that saying so is no longer enough.

const WINDOW_FROM = '2026-01-01T00:00:00.000Z';
const WINDOW_TO = '2026-12-31T00:00:00.000Z';
const humanIn = (subjectId, projectBindingRef = 'pb-alpha', over = {}) =>
  humanEntry({ subjectId, projectBindingRef, validFrom: WINDOW_FROM, validTo: WINDOW_TO, ...over });

const REGISTRY = buildRegistrationRegistry({
  projectBindingRef: 'pb-alpha',
  entries: [
    humanIn('person-1'), humanIn('person-2'), humanIn('person-3'),
    authorityEntry({
      subjectId: 'auth-1', projectBindingRef: 'pb-alpha',
      authorityFamily: 'project_contract_baseline', validFrom: WINDOW_FROM, validTo: WINDOW_TO,
    }),
  ],
});
// A registry for another project, so "scoped to this project" is tested against a registry that
// is valid in every other respect rather than against a broken one.
const BRAVO_REGISTRY = buildRegistrationRegistry({
  projectBindingRef: 'pb-bravo',
  entries: [humanIn('person-1', 'pb-bravo'), humanIn('person-2', 'pb-bravo'), humanIn('person-3', 'pb-bravo')],
  revisionId: 'registration-registry-bravo-r1',
});

// ---------------------------------------------------------------- the policy gate before P7

const taskIntent = {
  task_intent_id: 'ti-1', finding_id: FIND_ID, snapshot_id: SNAP_ID,
  project_binding_ref: 'pb-alpha', candidate_only: true, erp_delta: 0,
};
const gateOk = {
  taskIntent,
  why: { finding_id: FIND_ID, rationale_ref: 'rationale-1' },
  whyNow: { trigger_ref: 'trigger-1', triggered_at: '2026-08-03T00:00:00.000Z' },
  authority: { authority_ref: 'auth-1', authority_family: 'project_contract_baseline' },
  idempotency: { idempotency_key: 'idem-1', payload_digest: 'a'.repeat(64) },
  knownAt: '2026-08-03T00:00:00.000Z',
  registrationRegistry: REGISTRY,
};

accepts('1A/p7/policy_gate_passes', () => evaluateTaskDriverPolicyGate(gateOk), 'positive control');
{
  const g = evaluateTaskDriverPolicyGate(gateOk);
  record('1A/p7/gate_reports_every_check',
    TASK_DRIVER_POLICY_CHECKS.every((c) => g.checks[c] === true) && g.passed === true);
  record('1A/p7/gate_writes_nothing', g.erp_delta === 0);
}
rejects('1A/p7/why_must_name_this_finding',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, why: { finding_id: 'a3f1c2d4-5e6f-4a7b-8c9d-00000000dead', rationale_ref: 'r' } }),
  P.POLICY_CHECK_FAILED, 'a reason belonging to another finding is not this task intent\'s reason');
rejects('1A/p7/why_now_needs_a_time',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, whyNow: { trigger_ref: 't' } }), P.POLICY_CHECK_FAILED);

// B-06: the authority half of the gate, which used to be two booleans the caller wrote.
//
// The reproduced attack is the first case: an authority_ref naming nothing that exists, with
// `registered: true` supplied alongside it, cleared the gate and therefore cleared P7 and every
// P8 write resting on it. Registration is now looked up in evidence, and a caller asserting its
// own registration is refused rather than ignored — asserting it is asserting the thing the
// gate exists to determine.
rejects('1A/p7/nonexistent_authority_ref_with_caller_supplied_registered',
  () => evaluateTaskDriverPolicyGate({
    ...gateOk,
    authority: { authority_ref: 'auth-does-not-exist', authority_family: 'project_contract_baseline', registered: true, applicability: true },
  }),
  P.POLICY_CHECK_FAILED, 'a ref naming nothing, plus the caller saying it is registered, is not a registration');
rejects('1A/p7/nonexistent_authority_ref_without_any_assertion',
  () => evaluateTaskDriverPolicyGate({
    ...gateOk, authority: { authority_ref: 'auth-does-not-exist', authority_family: 'project_contract_baseline' },
  }),
  P.POLICY_CHECK_FAILED, 'the ref is refused on the evidence, not on the shape of the claim beside it');
{
  let refusal = null;
  try {
    evaluateTaskDriverPolicyGate({
      ...gateOk,
      authority: { authority_ref: 'auth-1', authority_family: 'project_contract_baseline', registered: true },
    });
  } catch (e) { refusal = e; }
  record('1A/p7/caller_asserted_registration_is_refused_not_ignored',
    refusal?.detail?.authority_failure === 'caller_asserted_its_own_registration_or_applicability',
    'even for a ref that IS registered, asserting the verdict is refused and the refusal says why');
}
{
  let refusal = null;
  try {
    evaluateTaskDriverPolicyGate({
      ...gateOk,
      authority: { authority_ref: 'auth-1', authority_family: 'project_contract_baseline', applicability: true },
    });
  } catch (e) { refusal = e; }
  record('1A/p7/caller_asserted_applicability_is_refused_not_ignored',
    refusal?.detail?.authority_failure === 'caller_asserted_its_own_registration_or_applicability',
    'applicability is read from the registration scope, not from a field beside the ref');
}
rejects('1A/p7/authority_family_required',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, authority: { authority_ref: 'auth-1' } }),
  P.POLICY_CHECK_FAILED, 'a registered authority is registered for a family; without one there is nothing to check');
rejects('1A/p7/authority_registered_for_another_family',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, authority: { authority_ref: 'auth-1', authority_family: 'reviewed_wiki' } }),
  P.POLICY_CHECK_FAILED, 'the entry covers this ref under the baseline family and does not carry over to another');
rejects('1A/p7/authority_registration_requires_evidence',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, registrationRegistry: undefined }),
  P.POLICY_CHECK_FAILED, 'with no evidence supplied there is nothing to establish registration from');
rejects('1A/p7/authority_registered_in_another_project',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, registrationRegistry: BRAVO_REGISTRY }),
  P.POLICY_CHECK_FAILED, 'a registry scoped to another project cannot register an authority for this one');
rejects('1A/p7/authority_outside_its_registration_window',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, knownAt: '2027-06-01T00:00:00.000Z', whyNow: { trigger_ref: 'trigger-1', triggered_at: '2027-06-01T00:00:00.000Z' } }),
  P.POLICY_CHECK_FAILED, 'a registration that has lapsed does not authorise anything after it lapsed');
rejects('1A/p7/tampered_registry_refused',
  () => evaluateTaskDriverPolicyGate({
    ...gateOk,
    registrationRegistry: {
      ...REGISTRY,
      entries: [...REGISTRY.entries, authorityEntry({
        subjectId: 'auth-smuggled', projectBindingRef: 'pb-alpha',
        authorityFamily: 'project_contract_baseline', validFrom: WINDOW_FROM, validTo: WINDOW_TO,
      })],
    },
  }),
  P.POLICY_CHECK_FAILED, 'an entry appended after the registry was addressed breaks the address it declares');
{
  // Positive control for the whole authority half: the evidence path passes, and the verdict
  // carries which evidence it rested on rather than a bare boolean.
  const g = evaluateTaskDriverPolicyGate(gateOk);
  record('1A/p7/authority_positive_control_names_its_evidence',
    g.passed === true
      && g.authority_registration.authority_ref === 'auth-1'
      && g.authority_registration.authority_family === 'project_contract_baseline'
      && g.authority_registration.registry_revision_id === REGISTRY.registry_revision_ref.revision_id
      && /^[0-9a-f]{64}$/.test(g.authority_registration.entry_content_address),
    'the gate passes on evidence and records the registry revision and entry it used');
}
rejects('1A/p7/idempotency_key_must_promise_a_payload',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, idempotency: { idempotency_key: 'k' } }), P.POLICY_CHECK_FAILED);
rejects('1A/p7/conflicting_prior_use_refused',
  () => evaluateTaskDriverPolicyGate({ ...gateOk, idempotency: { ...gateOk.idempotency, conflicting_prior_use: true } }),
  P.POLICY_CHECK_FAILED);

const policyGate = evaluateTaskDriverPolicyGate(gateOk);
accepts('1A/p7/driver_evaluates_behind_its_gate',
  () => evaluateP7TaskDriver({ policyGate, taskIntent, projectBindingRef: 'pb-alpha' }), 'positive control');
{
  const d = evaluateP7TaskDriver({ policyGate, taskIntent, projectBindingRef: 'pb-alpha' });
  record('1A/p7/driver_is_candidate_only', d.candidate_only === true && d.erp_delta === 0);
  record('1A/p7/driver_not_activated', d.driver_activated === false);
  accepts('1A/p7/non_activation_asserted', () => assertTaskDriverNotActivated(d), 'positive control');
}
rejects('1A/p7/gate_cannot_be_skipped',
  () => evaluateP7TaskDriver({ policyGate: undefined, taskIntent, projectBindingRef: 'pb-alpha' }),
  P.TASK_DRIVER_NOT_EVALUATED, 'calling P7 directly does not bypass the four checks');
rejects('1A/p7/failed_gate_cannot_drive',
  () => evaluateP7TaskDriver({ policyGate: { ...policyGate, passed: false }, taskIntent, projectBindingRef: 'pb-alpha' }),
  P.TASK_DRIVER_NOT_EVALUATED);
rejects('1A/p7/gate_for_another_intent',
  () => evaluateP7TaskDriver({ policyGate, taskIntent: { ...taskIntent, task_intent_id: 'ti-2' }, projectBindingRef: 'pb-alpha' }),
  P.TASK_DRIVER_NOT_EVALUATED);
rejects('1A/p7/cross_project_intent',
  () => evaluateP7TaskDriver({ policyGate, taskIntent, projectBindingRef: 'pb-bravo' }),
  P.TASK_DRIVER_NOT_EVALUATED, 'a bravo request cannot drive an alpha intent');
rejects('1A/p7/activated_driver_refused',
  () => assertTaskDriverNotActivated({ driver_activated: true }), P.TASK_DRIVER_ACTIVATION_REFUSED);

// ---------------------------------------------------------------- P5

const human = { kind: 'registered_human', principal_id: 'person-1' };
const p5ok = {
  principal: human, submittedFingerprint: 'fp-1', observedFingerprint: 'fp-1',
  acceptedInputSetRef: 'set-1', knownAt: '2026-08-03T00:00:00.000Z',
  registrationRegistry: REGISTRY, projectBindingRef: 'pb-alpha',
};

accepts('1A/p5/registered_human_accepts', () => evaluateP5Acceptance(p5ok), 'positive control');
{
  const r = evaluateP5Acceptance(p5ok);
  record('1A/p5/does_not_advance_generation', r.generation_advanced === false);
  record('1A/p5/does_not_promote_binding', r.binding_promoted === false);
  record('1A/p5/does_not_write_erp', r.erp_written === false);
  record('1A/p5/acceptance_names_the_evidence_that_cleared_the_acceptor',
    r.acceptor_registration.registry_revision_id === REGISTRY.registry_revision_ref.revision_id
      && /^[0-9a-f]{64}$/.test(r.acceptor_registration.entry_content_address),
    'the verdict says which registration revision and entry cleared the acceptor');
}

// B-06: the reproduced attack. A principal that merely claims `kind: 'registered_human'`, with
// an identifier nobody has registered, used to clear P5 — the boundary the whole contract is
// most emphatic that only a registered human may cross.
rejects('1A/p5/self_declared_human_is_not_a_registered_human',
  () => evaluateP5Acceptance({ ...p5ok, principal: { kind: 'registered_human', principal_id: 'person-nobody-registered' } }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'claiming the kind is not being in the registry');
{
  let refusal = null;
  try {
    evaluateP5Acceptance({ ...p5ok, principal: { kind: 'registered_human', principal_id: 'person-nobody-registered' } });
  } catch (e) { refusal = e; }
  record('1A/p5/unregistered_principal_refusal_names_its_cause',
    refusal?.detail?.cause_code === REG.SUBJECT_NOT_REGISTERED,
    'the boundary reports its own code and carries the underlying refusal in the detail');
}
rejects('1A/p5/registration_evidence_is_required',
  () => evaluateP5Acceptance({ ...p5ok, registrationRegistry: undefined }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'with no evidence supplied there is nothing to establish registration from');
rejects('1A/p5/registration_in_another_project_does_not_carry_over',
  () => evaluateP5Acceptance({ ...p5ok, projectBindingRef: 'pb-bravo' }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'an alpha registration cannot clear a bravo acceptance, however well formed it is');
rejects('1A/p5/registry_scope_must_match_the_boundary',
  () => evaluateP5Acceptance({ ...p5ok, registrationRegistry: BRAVO_REGISTRY }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'a registry scoped elsewhere is refused even when it holds this person');
rejects('1A/p5/registration_window_is_enforced',
  () => evaluateP5Acceptance({ ...p5ok, knownAt: '2025-06-01T00:00:00.000Z' }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'a registration that had not begun does not clear an earlier acceptance');
rejects('1A/p5/forged_registry_entry_refused',
  () => evaluateP5Acceptance({
    ...p5ok,
    principal: { kind: 'registered_human', principal_id: 'person-smuggled' },
    registrationRegistry: { ...REGISTRY, entries: [...REGISTRY.entries, humanIn('person-smuggled')] },
  }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'adding oneself to the registry changes the address the registry declares');
rejects('1A/p5/declared_entry_addresses_must_be_the_addresses_the_entries_produce',
  () => evaluateP5Acceptance({
    ...p5ok,
    registrationRegistry: {
      ...REGISTRY,
      entry_content_addresses: [...REGISTRY.entry_content_addresses.slice(1), 'a'.repeat(64)],
    },
  }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN,
  'the declared address set is checked in its own right; a registry whose index disagrees with its entries is not consistent evidence');
rejects('1A/p5/registry_address_must_recompute',
  () => evaluateP5Acceptance({
    ...p5ok,
    registrationRegistry: {
      ...REGISTRY,
      registry_content_address: 'f'.repeat(64),
      registry_revision_ref: { ...REGISTRY.registry_revision_ref, content_id: 'f'.repeat(64) },
    },
  }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'a declared address consistent with its own pin but not with the entries is still not the address');
rejects('1A/p5/registry_not_pinned_to_its_revision',
  () => evaluateP5Acceptance({
    ...p5ok,
    registrationRegistry: {
      ...REGISTRY,
      registry_revision_ref: { ...REGISTRY.registry_revision_ref, content_id: 'e'.repeat(64) },
    },
  }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'a registry whose address is not its revision content id is pinned to no revision');
rejects('1A/p5/engine_cannot_accept',
  () => evaluateP5Acceptance({ ...p5ok, principal: { kind: 'engine', principal_id: 'eng-1' } }), P.ENGINE_CANNOT_ACCEPT);
rejects('1A/p5/agent_cannot_accept',
  () => evaluateP5Acceptance({ ...p5ok, principal: { kind: 'agent', principal_id: 'agent-1' } }), P.ENGINE_CANNOT_ACCEPT);
rejects('1A/p5/unregistered_principal',
  () => evaluateP5Acceptance({ ...p5ok, principal: { kind: 'service_account', principal_id: 's-1' } }), P.PRINCIPAL_NOT_REGISTERED_HUMAN);
rejects('1A/p5/unidentified_principal',
  () => evaluateP5Acceptance({ ...p5ok, principal: { kind: 'registered_human' } }), P.PRINCIPAL_NOT_REGISTERED_HUMAN);
rejects('1A/p5/cas_required', () => evaluateP5Acceptance({ ...p5ok, submittedFingerprint: undefined }), P.CAS_MISSING);
rejects('1A/p5/cas_mismatch_refuses',
  () => evaluateP5Acceptance({ ...p5ok, observedFingerprint: 'fp-2' }), P.CAS_MISMATCH,
  'refused rather than applied over the newer state');
rejects('1A/p5/known_at_required', () => evaluateP5Acceptance({ ...p5ok, knownAt: 'today' }), P.CAS_MISSING);

// ---------------------------------------------------------------- generation advance

// The advance is the second boundary the same self-declared principal used to clear, so it
// takes the same evidence. It also now has to name an instant: a registration holds at a time,
// and a boundary that picked one on the caller's behalf would keep clearing a lapsed one.
const advanceOk = {
  principal: human, fromGeneration: 4, toGeneration: 5,
  submittedFingerprint: 'g', observedFingerprint: 'g',
  registrationRegistry: REGISTRY, projectBindingRef: 'pb-alpha', knownAt: '2026-08-03T00:00:00.000Z',
};

accepts('1A/generation/advances_by_one', () => evaluateGenerationAdvance(advanceOk), 'positive control');
record('1A/generation/does_not_accept_context',
  evaluateGenerationAdvance(advanceOk).context_accepted_here === false);
for (const [label, to] of [['skips', 6], ['rewinds', 3], ['stays', 4]]) {
  rejects(`1A/generation/${label}`,
    () => evaluateGenerationAdvance({ ...advanceOk, toGeneration: to }),
    P.GENERATION_NOT_MONOTONIC, 'one number must not mean two context sets');
}
rejects('1A/generation/cas_mismatch',
  () => evaluateGenerationAdvance({ ...advanceOk, observedFingerprint: 'h' }), P.CAS_MISMATCH);
rejects('1A/generation/needs_a_human',
  () => evaluateGenerationAdvance({ ...advanceOk, principal: { kind: 'engine', principal_id: 'e' } }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN);
rejects('1A/generation/self_declared_human_refused',
  () => evaluateGenerationAdvance({ ...advanceOk, principal: { kind: 'registered_human', principal_id: 'person-nobody-registered' } }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'the advance is a state-advancing boundary and takes the same evidence P5 does');
rejects('1A/generation/needs_a_canonical_instant',
  () => evaluateGenerationAdvance({ ...advanceOk, knownAt: 'today' }), P.BOUNDARY_TIME_INVALID);
record('1A/generation/records_the_registration_that_cleared_it',
  evaluateGenerationAdvance(advanceOk).advanced_by_registration.registry_revision_id === REGISTRY.registry_revision_ref.revision_id);

// ---------------------------------------------------------------- P6 context request

const request = (over = {}) => ({
  context_request_id: REQ_ID, snapshot_id: SNAP_ID, finding_ids: [FIND_ID],
  question_text: 'which revision governs this interface',
  requested_from_role: 'systems_engineer', authority_family_sought: 'project_contract_baseline',
  known_at: '2026-08-03T00:00:00.000Z', candidate_only: true, erp_delta: 0, ...over,
});

accepts('1A/p6/valid_request_passes', () => validateContextRequest(request()), 'positive control');
for (const f of REQUIRED_CONTEXT_REQUEST_FIELDS) {
  const r = request(); delete r[f];
  rejects(`1A/p6/missing/${f}`, () => validateContextRequest(r), undefined);
}
rejects('1A/p6/must_be_candidate_only',
  () => validateContextRequest(request({ candidate_only: false })), P.REQUEST_NOT_CANDIDATE_ONLY,
  'P6 does not create a task');
rejects('1A/p6/erp_delta_must_be_zero',
  () => validateContextRequest(request({ erp_delta: 1 })), P.ERP_DELTA_NOT_ZERO);
rejects('1A/p6/no_findings_named',
  () => validateContextRequest(request({ finding_ids: [] })), P.REQUEST_FIELD_MISSING);
rejects('1A/p6/finding_id_must_be_minted',
  () => validateContextRequest(request({ finding_ids: ['f-1'] })), 'MINT_IDENTIFIER_REQUIRED');
for (const key of ['body', 'payload', 'raw_span', 'text', 'file_bytes']) {
  rejects(`1A/p6/no_raw_payload/${key}`,
    () => validateContextRequest(request({ [key]: 'some evidence body' })), P.RAW_PAYLOAD_PRESENT,
    'a request carries pointers, not evidence bodies');
}
accepts('1A/p6/zero_delta_asserted', () => assertZeroErpDelta(request()), 'positive control');
rejects('1A/p6/nonzero_delta_asserted', () => assertZeroErpDelta({ erp_delta: 2 }), P.ERP_DELTA_NOT_ZERO);

// ---------------------------------------------------------------- P8 write
//
// A write is a gate evaluation here and nothing else: this engine holds no external writer
// authority, so the pass case still reports zero writes. What is being tested is the refusal
// set, and specifically that no single field is sufficient on its own.
//
// The chain is *sealed* rather than written by hand. Every record carries provenance whose
// content address is computed from the record's own content, which is what makes the
// immutability claim checkable instead of decorative: change one field of a sealed record and
// its declared address stops matching. `tampered` below is the whole attack surface in one
// helper — it edits a link and leaves the old address in place, which is exactly what a forged
// chain looks like.

const FP = 'b'.repeat(64);
const RECORDED_AT = '2026-08-03T00:00:00.000Z';

/** Attaches provenance whose content address is the one this content actually produces. */
const seal = (name, element, over = {}) => {
  const provenance = {
    immutable: true, project_binding_ref: 'pb-alpha', recorded_at: RECORDED_AT,
    content_address: chainElementContentAddress(name, element), ...over,
  };
  return { ...element, provenance };
};
/** Re-seals after an edit, so the record is internally consistent and only its meaning changed. */
const resealed = (name, element, over) => seal(name, { ...(({ provenance, ...rest }) => rest)(element), ...over });
/** Edits a record and leaves its old address in place: an altered link claiming to be original. */
const tampered = (element, over) => ({ ...element, ...over });

const approvedIntent = { ...taskIntent, candidate_only: false };
const approvedGate = evaluateTaskDriverPolicyGate({ ...gateOk, taskIntent: approvedIntent, registrationRegistry: REGISTRY });
const approvedDriver = evaluateP7TaskDriver({ policyGate: approvedGate, taskIntent: approvedIntent, projectBindingRef: 'pb-alpha' });

// The inputs each recomputed boundary is re-run over. They are part of the record, so they are
// covered by its content address: a forger cannot swap the inputs without breaking the seal,
// and cannot keep the inputs without reproducing the verdict.
//
// The registration registry is deliberately NOT among them. P8 supplies its own, so a chain
// cannot bring the evidence that vouches for its own acceptor; the recompute inputs carry only
// what the boundary needs besides that.
const p5Inputs = {
  principal: { kind: 'registered_human', principal_id: 'person-3' },
  submittedFingerprint: FP, observedFingerprint: FP,
  acceptedInputSetRef: 'set-1', knownAt: RECORDED_AT,
};
const advanceInputs = {
  principal: { kind: 'registered_human', principal_id: 'person-3' },
  fromGeneration: 6, toGeneration: 7,
  submittedFingerprint: FP, observedFingerprint: FP, knownAt: RECORDED_AT,
};
const gateInputs = {
  why: gateOk.why, whyNow: gateOk.whyNow, authority: gateOk.authority,
  idempotency: gateOk.idempotency, knownAt: gateOk.knownAt,
};

const receiptMaterial = {
  receipt_ref: 'ctx-response-receipt-1',
  receipt_kind: 'context_response_receipt',
  context_response_id: 'a3f1c2d4-5e6f-4a7b-8c9d-000000000501',
  recorded_at: RECORDED_AT,
};
const RECEIPT_ADDRESS = chainElementContentAddress('evidence_receipt', receiptMaterial);

const chain = {
  project_binding_ref: 'pb-alpha',
  accepted_context_generation: 7,
  p5_acceptance: seal('p5_acceptance', {
    ...evaluateP5Acceptance({ ...p5Inputs, registrationRegistry: REGISTRY, projectBindingRef: 'pb-alpha' }),
    project_binding_ref: 'pb-alpha', recompute_inputs: p5Inputs,
  }),
  generation_advance: seal('generation_advance', {
    ...evaluateGenerationAdvance({ ...advanceInputs, registrationRegistry: REGISTRY, projectBindingRef: 'pb-alpha' }),
    project_binding_ref: 'pb-alpha', recompute_inputs: advanceInputs,
  }),
  snapshot: seal('snapshot', {
    snapshot_id: SNAP_ID, project_binding_ref: 'pb-alpha',
    accepted_context_generation: 7, deterministic_replay_fingerprint: FP,
  }),
  finding: seal('finding', { finding_id: FIND_ID, snapshot_id: SNAP_ID, project_binding_ref: 'pb-alpha' }),
  disposition_event: seal('disposition_event', {
    event_id: 'ev-1', finding_id: FIND_ID, project_binding_ref: 'pb-alpha',
    append_only: true, confirmed_by_registered_human: true,
    confirmed_by_principal_kind: 'registered_human', confirmed_by_principal_id: 'person-4',
  }),
  context_authority_gate: seal('context_authority_gate', {
    snapshot_id: SNAP_ID, project_binding_ref: 'pb-alpha',
    context_sufficiency: true, evidence_sufficiency: true, registered_authority: true,
    applicability: true, authority_family: 'project_contract_baseline',
  }),
  task_intent: seal('task_intent', approvedIntent),
  policy_gate: seal('policy_gate', {
    ...approvedGate, project_binding_ref: 'pb-alpha', recompute_inputs: gateInputs,
  }),
  task_driver: seal('task_driver', approvedDriver),
  evidence: seal('evidence', {
    project_binding_ref: 'pb-alpha', immutable: true,
    receipt_ref: 'ctx-response-receipt-1', content_address: RECEIPT_ADDRESS, cas_fingerprint: FP,
    receipt_material: receiptMaterial,
  }),
};

const approval = seal('approval', {
  approved: true, approver_principal_id: 'person-2', approver_kind: 'registered_human',
  approved_at: RECORDED_AT, project_binding_ref: 'pb-alpha', task_intent_id: approvedIntent.task_intent_id,
});
const p8ok = {
  principal: human, approval, chain,
  submittedFingerprint: FP, observedFingerprint: FP, registrationRegistry: REGISTRY,
};
const withChain = (over) => ({ ...p8ok, chain: { ...chain, ...over } });
const withApproval = (over) => ({ ...p8ok, approval: resealed('approval', approval, over) });

accepts('1A/p8/complete_chain_passes', () => evaluateP8Write(p8ok), 'one fully pinned valid positive control');
{
  const r = evaluateP8Write(p8ok);
  record('1A/p8/snapshot_not_rewritten', r.snapshot_rewritten === false,
    'the task points back at the immutable snapshot, not the other way round');
  record('1A/p8/backward_lineage_is_the_snapshot_id', r.backward_lineage_ref === 'snapshot_id');
  record('1A/p8/backward_lineage_names_every_origin',
    r.backward_lineage.snapshot_id === SNAP_ID && r.backward_lineage.finding_id === FIND_ID
      && r.backward_lineage.accepted_context_generation === 7
      && r.backward_lineage.task_intent_ref === approvedIntent.task_intent_id
      && r.backward_lineage.task_driver_ref === P7.gate_id);
  record('1A/p8/gate_only_no_write', r.gate_evaluation_only === true && r.erp_write_performed === false && r.erp_writes === 0,
    'evaluating the gate is not holding the writer authority');
  record('1A/p8/reports_what_it_verified',
    r.chain_elements_verified.length === REQUIRED_P8_CHAIN_ELEMENTS.length
      && r.chain_elements_recomputed.join(',') === P8_RECOMPUTED_CHAIN_ELEMENTS.join(',')
      && r.provenance_verified_for.includes('approval'),
    `${r.provenance_verified_for.length} records provenance-checked, ${r.chain_elements_recomputed.length} recomputed`);
}

// The blocker this section exists for: "it says it is not a candidate" proves nothing.
rejects('1A/p8/not_a_candidate_is_not_enough',
  () => evaluateP8Write({ principal: human, approval, chain: undefined, submittedFingerprint: FP, observedFingerprint: FP }),
  P.WRITE_CHAIN_INCOMPLETE, 'candidate_only false with no chain behind it is not an approved write');
record('1A/p8/chain_elements_declared', REQUIRED_P8_CHAIN_ELEMENTS.length === 12);
record('1A/p8/record_elements_declared', P8_CHAIN_RECORD_ELEMENTS.length === 10,
  'the ten records; the binding and the generation are the two scalars they all have to agree with');
record('1A/p8/provenance_fields_declared', REQUIRED_CHAIN_PROVENANCE_FIELDS.length === 4);
for (const element of REQUIRED_P8_CHAIN_ELEMENTS) {
  rejects(`1A/p8/chain_missing_${element}`, () => {
    const c = { ...chain }; delete c[element];
    return evaluateP8Write({ ...p8ok, chain: c });
  }, P.WRITE_CHAIN_INCOMPLETE);
}

rejects('1A/p8/no_approval', () => evaluateP8Write({ ...p8ok, approval: undefined }), P.WRITE_WITHOUT_APPROVAL);
rejects('1A/p8/approval_not_granted',
  () => evaluateP8Write(withApproval({ approved: false })), P.WRITE_WITHOUT_APPROVAL);
rejects('1A/p8/approval_without_an_approver',
  () => evaluateP8Write({ ...p8ok, approval: { approved: true, approver_kind: 'registered_human' } }), P.WRITE_WITHOUT_APPROVAL);
rejects('1A/p8/ai_approval_refused',
  () => evaluateP8Write(withApproval({ approver_kind: 'agent' })), P.WRITE_APPROVAL_NOT_HUMAN,
  'a model or agent approving the engine\'s own proposal is not an approval');
rejects('1A/p8/engine_approval_refused',
  () => evaluateP8Write(withApproval({ approver_kind: 'engine' })), P.WRITE_APPROVAL_NOT_HUMAN);
rejects('1A/p8/self_approval_refused_by_default',
  () => evaluateP8Write(withApproval({ approver_principal_id: 'person-1' })), P.WRITE_WITHOUT_APPROVAL,
  'the writer approving their own write is the default refusal');
accepts('1A/p8/self_approval_only_when_permitted',
  () => evaluateP8Write(withApproval({ approver_principal_id: 'person-1', self_approval_permitted: true })),
  'and whether that is ever permitted is an owner decision');
rejects('1A/p8/needs_a_human',
  () => evaluateP8Write({ ...p8ok, principal: { kind: 'engine', principal_id: 'e' } }), P.PRINCIPAL_NOT_REGISTERED_HUMAN);
rejects('1A/p8/undated_approval_refused',
  () => evaluateP8Write({
    ...p8ok,
    approval: seal('approval', (({ provenance, approved_at, ...rest }) => rest)(approval)),
  }), P.WRITE_WITHOUT_APPROVAL, 'an undated approval cannot be shown to precede this write');
rejects('1A/p8/approval_of_another_intent',
  () => evaluateP8Write(withApproval({ task_intent_id: 'ti-somewhere-else' })), P.WRITE_WITHOUT_APPROVAL,
  'a human who approved something else has approved something else');
rejects('1A/p8/cross_project_approval',
  () => evaluateP8Write({ ...p8ok, approval: resealed('approval', approval, { project_binding_ref: 'pb-bravo' }) }),
  P.WRITE_CHAIN_CROSS_PROJECT);

rejects('1A/p8/writing_a_candidate',
  () => evaluateP8Write(withChain({ task_intent: resealed('task_intent', chain.task_intent, { candidate_only: true }) })),
  P.WRITE_OF_A_CANDIDATE,
  'the engine proposed it, nobody approved it, and it would appear in the ledger anyway');

// ---- cross-project, on every record rather than the four that used to be checked

for (const element of P8_CHAIN_RECORD_ELEMENTS) {
  rejects(`1A/p8/cross_project_${element}`,
    () => evaluateP8Write(withChain({ [element]: resealed(element, chain[element], { project_binding_ref: 'pb-bravo' }) })),
    P.WRITE_CHAIN_CROSS_PROJECT, 'a write assembled from two projects is refused, not filtered');
  rejects(`1A/p8/cross_project_provenance_${element}`,
    () => evaluateP8Write(withChain({
      [element]: seal(element, (({ provenance, ...rest }) => rest)(chain[element]), { project_binding_ref: 'pb-bravo' }),
    })),
    P.WRITE_CHAIN_CROSS_PROJECT, 'a record recorded under another binding is refused even when its own field agrees');
}

// ---- immutable provenance, recomputed rather than read

for (const element of [...P8_CHAIN_RECORD_ELEMENTS]) {
  rejects(`1A/p8/provenance_missing_${element}`,
    () => evaluateP8Write(withChain({ [element]: (({ provenance, ...rest }) => rest)(chain[element]) })),
    P.WRITE_EVIDENCE_NOT_IMMUTABLE, 'a record with no provenance cannot be checked at all');
  rejects(`1A/p8/tampered_${element}`,
    () => evaluateP8Write(withChain({ [element]: tampered(chain[element], { injected_field: 'added after sealing' }) })),
    P.WRITE_EVIDENCE_NOT_IMMUTABLE, 'an edited record no longer hashes to the address it declares');
}
rejects('1A/p8/provenance_not_immutable',
  () => evaluateP8Write(withChain({
    snapshot: { ...chain.snapshot, provenance: { ...chain.snapshot.provenance, immutable: false } },
  })), P.WRITE_EVIDENCE_NOT_IMMUTABLE);
rejects('1A/p8/provenance_address_absent',
  () => evaluateP8Write(withChain({
    snapshot: { ...chain.snapshot, provenance: { ...chain.snapshot.provenance, content_address: 'short' } },
  })), P.WRITE_EVIDENCE_NOT_IMMUTABLE);
rejects('1A/p8/provenance_undated',
  () => evaluateP8Write(withChain({
    snapshot: { ...chain.snapshot, provenance: { ...chain.snapshot.provenance, recorded_at: 'yesterday' } },
  })), P.WRITE_EVIDENCE_NOT_IMMUTABLE);
rejects('1A/p8/provenance_address_forged',
  () => evaluateP8Write(withChain({
    snapshot: { ...chain.snapshot, provenance: { ...chain.snapshot.provenance, content_address: 'e'.repeat(64) } },
  })), P.WRITE_EVIDENCE_NOT_IMMUTABLE,
  'an address that is a plausible hash but not this content\'s hash');
{
  // Two different links with identical content do not share an address, so a record cannot be
  // moved from one position in the chain into another.
  const a = chainElementContentAddress('finding', { x: 1 });
  const b = chainElementContentAddress('snapshot', { x: 1 });
  record('1A/p8/content_address_is_position_bound', a !== b && /^[0-9a-f]{64}$/.test(a));
}

// ---- recomputation: "passed: true" is not evidence that anything was evaluated

record('1A/p8/recomputed_elements_declared',
  P8_RECOMPUTED_CHAIN_ELEMENTS.join(',') === 'p5_acceptance,generation_advance,policy_gate,task_driver');
for (const element of P8_RECOMPUTED_CHAIN_ELEMENTS.filter((e) => e !== 'task_driver')) {
  rejects(`1A/p8/recompute_inputs_missing_${element}`,
    () => evaluateP8Write(withChain({
      [element]: seal(element, (({ provenance, recompute_inputs, ...rest }) => rest)(chain[element])),
    })), P.WRITE_CHAIN_INCOMPLETE, 'a verdict nobody can recompute is a claim, not a result');
}
rejects('1A/p8/policy_gate_verdict_forged',
  () => evaluateP8Write(withChain({
    policy_gate: resealed('policy_gate', chain.policy_gate, {
      recompute_inputs: { ...gateInputs, authority: { authority_ref: 'a', registered: false, applicability: true } },
    }),
  })), P.WRITE_CHAIN_MISMATCH,
  'the gate says it passed and its own inputs say it could not have');
rejects('1A/p8/policy_gate_checks_forged',
  () => evaluateP8Write(withChain({
    policy_gate: resealed('policy_gate', chain.policy_gate, { idempotency_key: 'a-different-key' }),
  })), P.WRITE_CHAIN_MISMATCH,
  'a sealed, internally consistent record that still does not reproduce from its inputs');
rejects('1A/p8/p5_acceptance_verdict_forged',
  () => evaluateP8Write(withChain({
    p5_acceptance: resealed('p5_acceptance', chain.p5_acceptance, { acceptor: 'person-nobody' }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/p5_acceptance_by_an_agent',
  () => evaluateP8Write(withChain({
    p5_acceptance: resealed('p5_acceptance', chain.p5_acceptance, {
      acceptor: 'agent-1',
      recompute_inputs: { ...p5Inputs, principal: { kind: 'agent', principal_id: 'agent-1' } },
    }),
  })), P.WRITE_CHAIN_MISMATCH, 'the engine does not accept context on a human behalf, and P8 re-runs the check');
rejects('1A/p8/p5_acceptance_cas_moved',
  () => evaluateP8Write(withChain({
    p5_acceptance: resealed('p5_acceptance', chain.p5_acceptance, {
      recompute_inputs: { ...p5Inputs, observedFingerprint: 'f'.repeat(64) },
    }),
  })), P.WRITE_CHAIN_MISMATCH, 'an acceptance taken against a state that had already moved');
rejects('1A/p8/generation_advance_verdict_forged',
  () => evaluateP8Write(withChain({
    generation_advance: resealed('generation_advance', chain.generation_advance, {
      recompute_inputs: { ...advanceInputs, fromGeneration: 5 },
    }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/task_driver_verdict_forged',
  () => evaluateP8Write(withChain({
    task_driver: resealed('task_driver', chain.task_driver, { driver_activated: true }),
  })), P.WRITE_CHAIN_MISMATCH,
  'a driver that claims activation does not reproduce, and this engine activates nothing');

// ---- the rest of the chain

rejects('1A/p8/stale_generation',
  () => evaluateP8Write(withChain({ snapshot: resealed('snapshot', chain.snapshot, { accepted_context_generation: 6 }) })),
  P.WRITE_CHAIN_MISMATCH, 'a snapshot from an older generation is stale evidence for this write');
rejects('1A/p8/generation_not_the_advanced_one',
  () => evaluateP8Write(withChain({
    generation_advance: seal('generation_advance', {
      ...evaluateGenerationAdvance({
        ...advanceInputs, fromGeneration: 5, toGeneration: 6,
        registrationRegistry: REGISTRY, projectBindingRef: 'pb-alpha',
      }),
      project_binding_ref: 'pb-alpha',
      recompute_inputs: { ...advanceInputs, fromGeneration: 5, toGeneration: 6 },
    }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/acceptance_missing_its_acceptor',
  () => evaluateP8Write(withChain({ p5_acceptance: seal('p5_acceptance', { boundary: 'p5_acceptance', project_binding_ref: 'pb-alpha' }) })),
  P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/finding_from_another_snapshot',
  () => evaluateP8Write(withChain({
    finding: resealed('finding', chain.finding, { snapshot_id: 'a3f1c2d4-5e6f-4a7b-8c9d-0000000000ff' }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/disposition_not_confirmed_by_a_human',
  () => evaluateP8Write(withChain({
    disposition_event: resealed('disposition_event', chain.disposition_event, { confirmed_by_registered_human: false }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/disposition_not_append_only',
  () => evaluateP8Write(withChain({
    disposition_event: resealed('disposition_event', chain.disposition_event, { append_only: false }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/disposition_confirmed_by_an_agent',
  () => evaluateP8Write(withChain({
    disposition_event: resealed('disposition_event', chain.disposition_event, {
      confirmed_by_principal_kind: 'agent', confirmed_by_principal_id: 'agent-7',
    }),
  })), P.WRITE_APPROVAL_NOT_HUMAN,
  'the flag says a human confirmed it and the named principal is a model');
rejects('1A/p8/disposition_confirmer_unnamed',
  () => evaluateP8Write(withChain({
    disposition_event: resealed('disposition_event', chain.disposition_event, { confirmed_by_principal_id: '' }),
  })), P.WRITE_APPROVAL_NOT_HUMAN);
for (const check of ['context_sufficiency', 'evidence_sufficiency', 'registered_authority', 'applicability']) {
  rejects(`1A/p8/authority_gate_${check}_failed`,
    () => evaluateP8Write(withChain({
      context_authority_gate: resealed('context_authority_gate', chain.context_authority_gate, { [check]: false }),
    })), P.WRITE_CHAIN_MISMATCH);
}
rejects('1A/p8/authority_gate_family_unregistered',
  () => evaluateP8Write(withChain({
    context_authority_gate: resealed('context_authority_gate', chain.context_authority_gate, { authority_family: 'vendor_blog' }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/authority_gate_for_another_snapshot',
  () => evaluateP8Write(withChain({
    context_authority_gate: resealed('context_authority_gate', chain.context_authority_gate, {
      snapshot_id: 'a3f1c2d4-5e6f-4a7b-8c9d-0000000000ff',
    }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/intent_not_from_this_finding',
  () => evaluateP8Write(withChain({
    task_intent: resealed('task_intent', chain.task_intent, { finding_id: 'a3f1c2d4-5e6f-4a7b-8c9d-0000000000aa' }),
  })), P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/policy_gate_not_passed',
  () => evaluateP8Write(withChain({ policy_gate: resealed('policy_gate', chain.policy_gate, { passed: false }) })),
  P.WRITE_CHAIN_MISMATCH, 'a write cannot rest on a gate that did not pass');
rejects('1A/p8/policy_gate_for_another_intent',
  () => evaluateP8Write(withChain({ policy_gate: resealed('policy_gate', chain.policy_gate, { task_intent_id: 'ti-other' }) })),
  P.WRITE_CHAIN_MISMATCH);
rejects('1A/p8/task_driver_missing_its_gate',
  () => evaluateP8Write(withChain({ task_driver: resealed('task_driver', chain.task_driver, { policy_gate_id: 'something_else' }) })),
  P.WRITE_CHAIN_MISMATCH);

rejects('1A/p8/mutable_evidence',
  () => evaluateP8Write(withChain({ evidence: resealed('evidence', chain.evidence, { immutable: false }) })),
  P.WRITE_EVIDENCE_NOT_IMMUTABLE);
rejects('1A/p8/evidence_without_a_content_address',
  () => evaluateP8Write(withChain({ evidence: resealed('evidence', chain.evidence, { content_address: 'short' }) })),
  P.WRITE_EVIDENCE_NOT_IMMUTABLE);
rejects('1A/p8/evidence_receipt_material_absent',
  () => evaluateP8Write(withChain({
    evidence: seal('evidence', (({ provenance, receipt_material, ...rest }) => rest)(chain.evidence)),
  })), P.WRITE_EVIDENCE_NOT_IMMUTABLE, 'a content address with nothing behind it addresses nothing');
rejects('1A/p8/evidence_receipt_material_swapped',
  () => evaluateP8Write(withChain({
    evidence: resealed('evidence', chain.evidence, {
      receipt_material: { ...receiptMaterial, context_response_id: 'a3f1c2d4-5e6f-4a7b-8c9d-0000000009ff' },
    }),
  })), P.WRITE_EVIDENCE_NOT_IMMUTABLE, 'the material no longer hashes to the address the evidence declares');
rejects('1A/p8/evidence_receipt_material_names_another_receipt',
  () => evaluateP8Write(withChain({
    evidence: resealed('evidence', chain.evidence, {
      receipt_material: { ...receiptMaterial, receipt_ref: 'some-other-receipt' },
    }),
  })), P.WRITE_EVIDENCE_NOT_IMMUTABLE);
rejects('1A/p8/cas_missing', () => evaluateP8Write({ ...p8ok, submittedFingerprint: undefined }), P.CAS_MISSING);
rejects('1A/p8/cas_mismatch', () => evaluateP8Write({ ...p8ok, observedFingerprint: 'other' }), P.CAS_MISMATCH);
rejects('1A/p8/receipt_fingerprint_is_stale',
  () => evaluateP8Write(withChain({ evidence: resealed('evidence', chain.evidence, { cas_fingerprint: 'd'.repeat(64) }) })),
  P.CAS_MISMATCH, 'a receipt taken against a different state is stale evidence for this write');

// ---- B-06 at P8: the registration a write rests on, and where it may come from.
//
// P8 recomputes four boundaries, and two of them turn on somebody being a registered human. If
// the chain supplied the registry those recomputations were checked against, a forged chain
// would be certifying its own acceptor and its own approver — the recomputation would agree
// with itself and prove nothing. So the registry comes from this gate, and a registry carried
// inside a recompute input is ignored rather than preferred.

rejects('1A/p8/registration_evidence_is_required',
  () => evaluateP8Write({ ...p8ok, registrationRegistry: undefined }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'a write with no registration evidence establishes nobody');
rejects('1A/p8/self_declared_writer_refused',
  () => evaluateP8Write({ ...p8ok, principal: { kind: 'registered_human', principal_id: 'person-nobody-registered' } }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'the writer claiming the kind is not the writer being registered');
rejects('1A/p8/self_declared_approver_refused',
  () => evaluateP8Write(withApproval({ approver_principal_id: 'person-nobody-registered' })),
  P.WRITE_APPROVAL_NOT_HUMAN, 'an approver nobody registered is not an approver, whatever approver_kind says');
{
  let refusal = null;
  try { evaluateP8Write(withApproval({ approver_principal_id: 'person-nobody-registered' })); } catch (e) { refusal = e; }
  record('1A/p8/unregistered_approver_refusal_names_its_cause',
    refusal?.detail?.cause_code === REG.SUBJECT_NOT_REGISTERED,
    'the P8 code is reported with the registration refusal underneath it');
}
rejects('1A/p8/registration_from_another_project_refused',
  () => evaluateP8Write({ ...p8ok, registrationRegistry: BRAVO_REGISTRY }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN, 'the registry has to be scoped to the binding the whole chain agrees on');
{
  // The attack the injection exists to stop: a chain whose recompute inputs carry a registry of
  // the chain's own making, holding an acceptor nobody else registered. The gate's registry is
  // the one used, so the recomputation refuses the recorded verdict instead of reproducing it.
  const forgedRegistry = buildRegistrationRegistry({
    projectBindingRef: 'pb-alpha',
    entries: [humanIn('person-invented'), humanIn('person-1'), humanIn('person-2')],
    revisionId: 'registration-registry-forged-r1',
  });
  const forgedInputs = { ...p5Inputs, principal: { kind: 'registered_human', principal_id: 'person-invented' } };
  const forgedChain = withChain({
    p5_acceptance: seal('p5_acceptance', {
      ...evaluateP5Acceptance({ ...forgedInputs, registrationRegistry: forgedRegistry, projectBindingRef: 'pb-alpha' }),
      project_binding_ref: 'pb-alpha',
      recompute_inputs: { ...forgedInputs, registrationRegistry: forgedRegistry },
    }),
  });
  let refusal = null;
  try { evaluateP8Write(forgedChain); } catch (e) { refusal = e; }
  record('1A/p8/chain_may_not_supply_the_registry_that_vouches_for_it',
    refusal instanceof ContractError,
    refusal ? refusal.code : 'NOT REFUSED — the chain certified its own acceptor');
}
{
  // Positive control for the whole registration layer at P8: the valid chain still passes, and
  // the verdict names the one registry every registration in it was checked against.
  const r = evaluateP8Write(p8ok);
  record('1A/p8/registration_positive_control',
    r.registration_registry_revision_id === REGISTRY.registry_revision_ref.revision_id
      && r.registration_verified_for.includes('writer_principal')
      && r.registration_verified_for.includes('approver')
      && r.registration_verified_for.includes('policy_gate_authority')
      && /^[0-9a-f]{64}$/.test(r.approver_registration_entry_address)
      && r.erp_writes === 0,
    'one registry, named, covering the writer, the approver and the recomputed boundaries');
}

record('1A/p8/no_erp_write_under_any_of_these',
  evaluateP8Write(p8ok).erp_writes === 0,
  'the only case that reaches a verdict still performs zero writes');

record('1A/open_items_declared', OPEN_OWNER_DECISIONS_FOR_THIS_LANE.length >= 2 &&
  !OPEN_OWNER_DECISIONS_FOR_THIS_LANE.some((s) => s.includes('p7_stage_definition')),
  'P7 is no longer an open item; the frozen plan already defined it');

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'lane_1a_snapshot_envelope_state_axes_finding_context_request_p5_p8',
  owns_field_group: 'snapshot_envelope_state_axes_finding_and_pipeline_contract_fields',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  verification_strength: 'author_written_fixtures',
  independent_lock_owed_by: 'lane_1V',
  p7_stage: { gate_id: P7.gate_id, name: P7.name, activation_state: P7.activation_state },
  open_owner_decisions: OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
