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
} from '../kernel/pipeline.mjs';
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
const finding = (over = {}) => ({
  finding_id: FIND_ID, snapshot_id: SNAP_ID, gap_type: GAP_TYPE.CONFLICT,
  expected_element_id: 'exp-1', evidence_claim_ceiling: 'source_referenced',
  authority_family: 'project_contract_baseline', known_at: '2026-08-03T00:00:00.000Z',
  disposition_state: 'candidate',
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

// P7 is not invented.
record('1A/boundary/p7_is_declared_undefined', P.STAGE_NOT_DEFINED && P7.state === 'UNKNOWN_pending_engine_owner',
  'the frozen contract names P5, P6 and P8 but not P7');
rejects('1A/boundary/p7_cannot_be_contracted', () => assertStageDefined('P7'), P.STAGE_NOT_DEFINED);
accepts('1A/boundary/defined_stage_ok', () => assertStageDefined('P5'), 'positive control');

// ---------------------------------------------------------------- P5

const human = { kind: 'registered_human', principal_id: 'person-1' };
const p5ok = { principal: human, submittedFingerprint: 'fp-1', observedFingerprint: 'fp-1', acceptedInputSetRef: 'set-1', knownAt: '2026-08-03T00:00:00.000Z' };

accepts('1A/p5/registered_human_accepts', () => evaluateP5Acceptance(p5ok), 'positive control');
{
  const r = evaluateP5Acceptance(p5ok);
  record('1A/p5/does_not_advance_generation', r.generation_advanced === false);
  record('1A/p5/does_not_promote_binding', r.binding_promoted === false);
  record('1A/p5/does_not_write_erp', r.erp_written === false);
}
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

accepts('1A/generation/advances_by_one',
  () => evaluateGenerationAdvance({ principal: human, fromGeneration: 4, toGeneration: 5, submittedFingerprint: 'g', observedFingerprint: 'g' }),
  'positive control');
record('1A/generation/does_not_accept_context',
  evaluateGenerationAdvance({ principal: human, fromGeneration: 4, toGeneration: 5, submittedFingerprint: 'g', observedFingerprint: 'g' }).context_accepted_here === false);
for (const [label, to] of [['skips', 6], ['rewinds', 3], ['stays', 4]]) {
  rejects(`1A/generation/${label}`,
    () => evaluateGenerationAdvance({ principal: human, fromGeneration: 4, toGeneration: to, submittedFingerprint: 'g', observedFingerprint: 'g' }),
    P.GENERATION_NOT_MONOTONIC, 'one number must not mean two context sets');
}
rejects('1A/generation/cas_mismatch',
  () => evaluateGenerationAdvance({ principal: human, fromGeneration: 4, toGeneration: 5, submittedFingerprint: 'g', observedFingerprint: 'h' }), P.CAS_MISMATCH);
rejects('1A/generation/needs_a_human',
  () => evaluateGenerationAdvance({ principal: { kind: 'engine', principal_id: 'e' }, fromGeneration: 4, toGeneration: 5, submittedFingerprint: 'g', observedFingerprint: 'g' }),
  P.PRINCIPAL_NOT_REGISTERED_HUMAN);

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

const approval = { approved: true, approver_principal_id: 'person-2' };
const p8ok = { principal: human, approval, taskIntent: { candidate_only: false }, submittedFingerprint: 'fp', observedFingerprint: 'fp' };

accepts('1A/p8/approved_write_passes', () => evaluateP8Write(p8ok), 'positive control');
{
  const r = evaluateP8Write(p8ok);
  record('1A/p8/snapshot_not_rewritten', r.snapshot_rewritten === false,
    'the task points back at the immutable snapshot, not the other way round');
  record('1A/p8/backward_lineage_is_the_snapshot_id', r.backward_lineage_ref === 'snapshot_id');
}
rejects('1A/p8/no_approval', () => evaluateP8Write({ ...p8ok, approval: undefined }), P.WRITE_WITHOUT_APPROVAL);
rejects('1A/p8/approval_not_granted',
  () => evaluateP8Write({ ...p8ok, approval: { approved: false, approver_principal_id: 'person-2' } }), P.WRITE_WITHOUT_APPROVAL);
rejects('1A/p8/approval_without_an_approver',
  () => evaluateP8Write({ ...p8ok, approval: { approved: true } }), P.WRITE_WITHOUT_APPROVAL);
rejects('1A/p8/self_approval_refused_by_default',
  () => evaluateP8Write({ ...p8ok, approval: { approved: true, approver_principal_id: 'person-1' } }), P.WRITE_WITHOUT_APPROVAL,
  'the writer approving their own write is the default refusal');
accepts('1A/p8/self_approval_only_when_permitted',
  () => evaluateP8Write({ ...p8ok, approval: { approved: true, approver_principal_id: 'person-1', self_approval_permitted: true } }),
  'and whether that is ever permitted is an owner decision');
rejects('1A/p8/writing_a_candidate',
  () => evaluateP8Write({ ...p8ok, taskIntent: { candidate_only: true } }), P.WRITE_OF_A_CANDIDATE,
  'the engine proposed it, nobody approved it, and it would appear in the ledger anyway');
rejects('1A/p8/cas_mismatch', () => evaluateP8Write({ ...p8ok, observedFingerprint: 'other' }), P.CAS_MISMATCH);
rejects('1A/p8/needs_a_human',
  () => evaluateP8Write({ ...p8ok, principal: { kind: 'engine', principal_id: 'e' } }), P.PRINCIPAL_NOT_REGISTERED_HUMAN);

record('1A/open_items_declared', OPEN_OWNER_DECISIONS_FOR_THIS_LANE.length >= 3 &&
  OPEN_OWNER_DECISIONS_FOR_THIS_LANE.some((s) => s.includes('p7_stage_definition')),
  'the undefined P7 is recorded as an open item, not filled in');

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
  p7_state: P7.state,
  open_owner_decisions: OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
