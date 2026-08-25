// Lane 1B conformance — inventory, byte custody, eligibility, lineage.
//
// Verification strength: author-written fixtures. The frozen Phase 1-0 oracle encodes no 1B
// case. Lane 1V owes a mutation-based lock over this file.

import {
  CUSTODY_MODE, PRESENCE, LICENSE_STATES, SENSITIVITY_STATES, REQUIRED_INVENTORY_FIELDS,
  CODES as C, assertSingleCustodyMode, validateInventoryRecord, validateCitedSpan,
  assertSpanRetained, classifyIntegrity, evaluateReplayability, evaluateEligibility,
  planRetentionWithdrawal, OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
} from '../../../core/validators/custody.mjs';
import {
  CHAIN_KINDS, CODES as L, REQUIRED_EXTRACTION_FIELDS,
  assertWithinSourceAuthority, propagateProvenance, validateLineageChain, assertNoOrphanClaim,
  NON_CAPABILITIES,
} from '../../../core/validators/lineage.mjs';
import { APPLICABILITY } from '../../../core/validators/authority.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

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
  record('1B/harness/self_test',
    probe[0] === false && probe[1] === false && probe[2] === true && probe[3] === false && probe[4] === false,
    'the reject and accept helpers detect what they claim to');
}

const ref = (id, over = {}) => ({ entity_id: id, revision_id: `${id}-r1`, content_id: `${id}-c1`, content_hash_alg: 'sha256', ...over });

const inv = (over = {}) => ({
  source_id: 'src-0001',
  source_revision_ref: ref('src-0001'),
  surface_id: 'surface-a',
  observed_at: '2026-08-10T09:00:00.000Z',
  byte_hash: 'a'.repeat(64),
  byte_length: 4096,
  format: 'hwpx',
  authority_family: 'company_approved_procedure',
  license_state: 'cleared',
  sensitivity_state: 'internal',
  custody_mode: CUSTODY_MODE,
  presence_state: PRESENCE.PRESENT,
  ...over,
});

const span = (over = {}) => ({ byte_start: 100, byte_end: 260, span_hash: 'b'.repeat(64), retention_ref: 'ret-0001', ...over });
const store = (entries = [['ret-0001', { span_hash: 'b'.repeat(64) }]]) => new Map(entries);

// ---------------------------------------------------------------- custody mode is single

accepts('1B/mode/decided_mode_accepted', () => assertSingleCustodyMode(CUSTODY_MODE), 'positive control');
for (const [label, bad] of [
  ['copy_everything', 'copy_into_immutable_store'],
  ['hash_only', 'hash_pinned_only'],
  ['per_source_choice', 'per_source'],
  ['absent', undefined],
]) {
  rejects(`1B/mode/${label}_rejected`, () => assertSingleCustodyMode(bad), C.CUSTODY_MODE_INVALID,
    'one snapshot must not carry several replay guarantees');
}

// ---------------------------------------------------------------- inventory

accepts('1B/inventory/complete_record_passes', () => validateInventoryRecord(inv()), 'positive control');
for (const field of REQUIRED_INVENTORY_FIELDS) {
  const r = inv();
  delete r[field];
  rejects(`1B/inventory/missing/${field}`, () => validateInventoryRecord(r), undefined, 'nothing defaults');
}
rejects('1B/inventory/uppercase_hash', () => validateInventoryRecord(inv({ byte_hash: 'A'.repeat(64) })), C.HASH_INVALID);
rejects('1B/inventory/short_hash', () => validateInventoryRecord(inv({ byte_hash: 'abc' })), C.HASH_INVALID);
rejects('1B/inventory/negative_length', () => validateInventoryRecord(inv({ byte_length: -1 })), C.LENGTH_INVALID);
rejects('1B/inventory/fractional_length', () => validateInventoryRecord(inv({ byte_length: 10.5 })), C.LENGTH_INVALID);
accepts('1B/inventory/empty_file_is_legal', () => validateInventoryRecord(inv({ byte_length: 0 })), 'a zero byte source is observable');
rejects('1B/inventory/second_precision_instant', () => validateInventoryRecord(inv({ observed_at: '2026-08-10T09:00:00Z' })), C.INSTANT_INVALID,
  'three fractional digits per D-P10-07');
rejects('1B/inventory/impossible_date', () => validateInventoryRecord(inv({ observed_at: '2026-02-30T09:00:00.000Z' })), C.INSTANT_INVALID);
rejects('1B/inventory/unknown_authority_family', () => validateInventoryRecord(inv({ authority_family: 'blog_post' })), C.AUTHORITY_FAMILY_UNKNOWN);
rejects('1B/inventory/unknown_license_state', () => validateInventoryRecord(inv({ license_state: 'probably_fine' })), C.LICENSE_STATE_INVALID);
rejects('1B/inventory/unknown_sensitivity_state', () => validateInventoryRecord(inv({ sensitivity_state: 'secret_ish' })), C.SENSITIVITY_STATE_INVALID);
rejects('1B/inventory/floating_source_ref', () => validateInventoryRecord(inv({ source_revision_ref: { entity_id: 'src-0001' } })), C.INVENTORY_FIELD_MISSING,
  'an inventory entry names an exact revision, not latest');
rejects('1B/inventory/bad_presence_state', () => validateInventoryRecord(inv({ presence_state: 'gone_probably' })), C.PRESENCE_INVALID);

// Missing and unknown stay distinct.
record('1B/presence/three_distinct_states',
  new Set(Object.values(PRESENCE)).size === 3 && PRESENCE.UNKNOWN !== PRESENCE.ABSENCE_CONFIRMED,
  '"could not look" is not "looked and it is gone"');
for (const p of Object.values(PRESENCE)) {
  accepts(`1B/presence/accepted/${p}`, () => validateInventoryRecord(inv({ presence_state: p })));
}
record('1B/state_vocabularies_declared', LICENSE_STATES.includes('unknown') && SENSITIVITY_STATES.includes('unknown'),
  'unknown is a real state, not the absence of one');

// ---------------------------------------------------------------- cited span

accepts('1B/span/valid_span_passes', () => validateCitedSpan(span(), { pinnedByteLength: 4096 }), 'positive control');
rejects('1B/span/empty_span', () => validateCitedSpan(span({ byte_start: 100, byte_end: 100 })), C.SPAN_INVALID);
rejects('1B/span/inverted_span', () => validateCitedSpan(span({ byte_start: 260, byte_end: 100 })), C.SPAN_INVALID);
rejects('1B/span/negative_start', () => validateCitedSpan(span({ byte_start: -1, byte_end: 10 })), C.SPAN_INVALID);
rejects('1B/span/fractional_offset', () => validateCitedSpan(span({ byte_end: 260.5 })), C.SPAN_INVALID);
rejects('1B/span/past_pinned_length',
  () => validateCitedSpan(span({ byte_end: 99999 }), { pinnedByteLength: 4096 }), C.SPAN_INVALID,
  'a span outside the pin does not describe the bytes that were pinned');
rejects('1B/span/no_span_hash', () => validateCitedSpan(span({ span_hash: undefined })), C.SPAN_RETENTION_UNVERIFIABLE,
  'a retained copy that cannot be verified is as untrustworthy as the original');
rejects('1B/span/no_retention_ref', () => validateCitedSpan(span({ retention_ref: '' })), C.SPAN_NOT_RETAINED);
rejects('1B/span/not_an_object', () => validateCitedSpan(null), C.SPAN_INVALID);

// ---------------------------------------------------------------- retention is fail-closed

accepts('1B/retention/present_and_matching', () => assertSpanRetained(span(), { retentionStore: store() }), 'positive control');
rejects('1B/retention/no_store_is_treated_as_absent',
  () => assertSpanRetained(span(), {}), C.SPAN_RETENTION_UNVERIFIABLE,
  'unconfirmed retention is not assumed to have happened');
rejects('1B/retention/ref_resolves_to_nothing',
  () => assertSpanRetained(span(), { retentionStore: store([]) }), C.SPAN_NOT_RETAINED);
rejects('1B/retention/retained_bytes_hash_differs',
  () => assertSpanRetained(span(), { retentionStore: store([['ret-0001', { span_hash: 'c'.repeat(64) }]]) }), C.SPAN_NOT_RETAINED,
  'the retained copy must still be the bytes that were cited');

// ---------------------------------------------------------------- integrity

record('1B/integrity/intact', classifyIntegrity({ pinnedHash: 'a'.repeat(64), observedHash: 'a'.repeat(64), readable: true }).state === 'intact');
record('1B/integrity/content_changed', classifyIntegrity({ pinnedHash: 'a'.repeat(64), observedHash: 'd'.repeat(64), readable: true }).state === 'content_changed');
record('1B/integrity/unreadable_is_unknown_not_missing',
  classifyIntegrity({ pinnedHash: 'a'.repeat(64), readable: false }).state === 'unknown',
  'failing to read is not evidence of absence');
record('1B/integrity/confirmed_absence',
  classifyIntegrity({ pinnedHash: 'a'.repeat(64), readable: false, absenceConfirmed: true }).state === 'absence_confirmed');
record('1B/integrity/absence_wins_over_unreadable',
  classifyIntegrity({ pinnedHash: 'a'.repeat(64), readable: true, observedHash: 'a'.repeat(64), absenceConfirmed: true }).state === 'absence_confirmed',
  'a positive confirmation outranks a successful read of something else');
rejects('1B/integrity/readable_without_a_hash',
  () => classifyIntegrity({ pinnedHash: 'a'.repeat(64), readable: true }), C.HASH_INVALID);

// ---------------------------------------------------------------- replayability

{
  const intact = { state: 'intact', intact: true };
  const changed = { state: 'content_changed', intact: false };
  const gone = { state: 'absence_confirmed', intact: false };

  record('1B/replay/intact_is_fully_replayable',
    evaluateReplayability({ integrity: intact, citedSpans: [span()], retentionStore: store() }).state === 'fully_replayable');
  const degraded = evaluateReplayability({ integrity: changed, citedSpans: [span()], retentionStore: store() });
  record('1B/replay/changed_original_keeps_cited_evidence', degraded.state === 'cited_evidence_replayable',
    'the snapshot recorded what was true when it was taken; the original moving on is not a defect');
  record('1B/replay/degraded_state_states_its_limit',
    degraded.rereading_outside_the_citation_requires_the_original === true,
    'the accepted cost of hash-pinning is stated, not implied');
  record('1B/replay/vanished_original_keeps_cited_evidence',
    evaluateReplayability({ integrity: gone, citedSpans: [span()], retentionStore: store() }).state === 'cited_evidence_replayable',
    'this is what the owner decision buys');
  const broken = evaluateReplayability({ integrity: changed, citedSpans: [span()], retentionStore: store([]) });
  record('1B/replay/unretained_span_is_not_replayable', broken.state === 'not_replayable');
  record('1B/replay/not_replayable_is_loud', broken.loud === true,
    'never softened into unknown');
  record('1B/replay/unretained_spans_are_itemised', Array.isArray(broken.unretained) && broken.unretained.length === 1);
  record('1B/replay/no_citations_still_resolves',
    evaluateReplayability({ integrity: intact, citedSpans: [], retentionStore: store() }).state === 'fully_replayable');
  rejects('1B/replay/requires_an_integrity_state', () => evaluateReplayability({ citedSpans: [] }), C.REPLAYABILITY_UNDECIDABLE);
}

// ---------------------------------------------------------------- eligibility

{
  const base = { record: inv(), applicability: APPLICABILITY.YES, integrity: { state: 'intact', intact: true }, citedSpans: [span()], retentionStore: store() };
  const e = evaluateEligibility(base);
  record('1B/eligibility/clean_source_is_eligible', e.eligible === true && e.reasons.length === 0, 'positive control');

  const cases = [
    ['license_unknown', { record: inv({ license_state: 'unknown' }) }, 'license_unknown'],
    ['license_restricted', { record: inv({ license_state: 'restricted' }) }, 'license_restricted'],
    ['sensitivity_unknown', { record: inv({ sensitivity_state: 'unknown' }) }, 'sensitivity_unknown'],
    ['applicability_unknown', { applicability: APPLICABILITY.UNKNOWN }, 'applicability_unknown'],
    ['not_applicable', { applicability: APPLICABILITY.NO }, 'not_applicable'],
    ['presence_unknown', { record: inv({ presence_state: PRESENCE.UNKNOWN }) }, 'presence_unknown'],
    ['span_not_retained', { retentionStore: store([]) }, 'cited_span_not_retained'],
  ];
  for (const [label, over, reason] of cases) {
    const r = evaluateEligibility({ ...base, ...over });
    record(`1B/eligibility/blocked/${label}`, r.eligible === false && r.reasons.includes(reason), `expected reason ${reason}, got ${r.reasons.join('|')}`);
  }
  const multi = evaluateEligibility({ ...base, record: inv({ license_state: 'unknown', sensitivity_state: 'unknown' }), applicability: APPLICABILITY.UNKNOWN });
  record('1B/eligibility/all_blockers_reported_at_once', multi.reasons.length >= 3,
    'a caller should not discover blockers one round trip at a time');
  const llm = evaluateEligibility({ ...base, record: inv({ authority_family: 'llm_proposal' }) });
  record('1B/eligibility/llm_proposal_needs_source_bound_review',
    llm.eligible === false && llm.reasons.includes('llm_proposal_without_source_bound_review'));
  const llmReviewed = evaluateEligibility({ ...base, record: inv({ authority_family: 'llm_proposal' }), reviewState: 'human_source_bound_review_passed' });
  record('1B/eligibility/reviewed_llm_proposal_clears_that_blocker', llmReviewed.eligible === true, 'positive control');
  record('1B/eligibility/ineligible_is_still_recordable', llm.observation_still_recordable === true,
    'ineligible for the authoritative path is not the same as unobserved');
}

// ---------------------------------------------------------------- withdrawal

rejects('1B/withdrawal/needs_a_reason',
  () => planRetentionWithdrawal({ retainedSpans: [span()], consequenceStated: true }), C.WITHDRAWAL_CONSEQUENCE_UNSTATED);
rejects('1B/withdrawal/consequence_must_be_stated',
  () => planRetentionWithdrawal({ retainedSpans: [span()], reason: 'licence revoked' }), C.WITHDRAWAL_CONSEQUENCE_UNSTATED,
  'a quiet withdrawal leaves conclusions standing on evidence that no longer exists');
{
  const plan = planRetentionWithdrawal({
    retainedSpans: [span(), span({ retention_ref: 'ret-0002' })],
    reason: 'sensitivity reclassified',
    affectedFindingIds: ['f-2', 'f-1'],
    consequenceStated: true,
  });
  record('1B/withdrawal/lists_what_is_withdrawn', plan.withdraw_count === 2 && plan.withdraw_refs.join(',') === 'ret-0001,ret-0002');
  record('1B/withdrawal/names_the_findings_it_breaks', plan.findings_becoming_unreplayable.join(',') === 'f-1,f-2');
  record('1B/withdrawal/authority_is_not_assumed', plan.authority_required === 'owner_decision_pending');
  record('1B/withdrawal/planning_is_not_executing', plan.executed === false, 'the kernel plans, it does not delete');
}

// ---------------------------------------------------------------- lineage

const chain = (over = {}) => {
  const base = [
    { kind: 'source', node_id: 'src-1', known_at: '2026-08-01T00:00:00.000Z', authority_family: 'company_approved_procedure', ai_derived: false },
    { kind: 'source_revision', node_id: 'rev-1', known_at: '2026-08-01T00:00:00.000Z', parent_ref: ref('src-1') },
    { kind: 'extraction_run', node_id: 'ext-1', known_at: '2026-08-02T00:00:00.000Z', parent_ref: ref('rev-1'), method: 'text_layer', method_revision: '1.0.0', execution_mode: 'deterministic_only', ai_derived: false },
    { kind: 'evidence_locator', node_id: 'loc-1', known_at: '2026-08-02T00:00:00.000Z', parent_ref: ref('ext-1') },
    { kind: 'claim', node_id: 'clm-1', known_at: '2026-08-03T00:00:00.000Z', parent_ref: ref('loc-1'), authority_family: 'company_approved_procedure', ai_derived: false },
  ];
  return base.map((n, i) => ({ ...n, ...(over[i] ?? {}) }));
};

record('1B/lineage/chain_is_five_ordered_kinds', CHAIN_KINDS.length === 5 && CHAIN_KINDS[0] === 'source' && CHAIN_KINDS[4] === 'claim');
accepts('1B/lineage/complete_chain_passes', () => validateLineageChain(chain()), 'positive control');
record('1B/lineage/completeness_reported', validateLineageChain(chain()).complete === true);
accepts('1B/lineage/partial_prefix_passes', () => validateLineageChain(chain().slice(0, 3)), 'a chain may be incomplete without being wrong');
rejects('1B/lineage/out_of_order', () => validateLineageChain([chain()[1], chain()[0]]), L.CHAIN_ORDER_INVALID);
rejects('1B/lineage/unknown_kind', () => validateLineageChain(chain({ 0: { kind: 'rumour' } })), L.KIND_UNKNOWN);
rejects('1B/lineage/empty_chain', () => validateLineageChain([]), L.CHAIN_ORDER_INVALID);
rejects('1B/lineage/duplicate_node_is_a_cycle', () => validateLineageChain([chain()[0], { ...chain()[1], node_id: 'src-1' }]), L.CYCLE);
rejects('1B/lineage/missing_parent_ref',
  () => validateLineageChain(chain({ 1: { parent_ref: undefined } })), L.PARENT_REF_MISSING);
rejects('1B/lineage/floating_parent_ref',
  () => validateLineageChain(chain({ 1: { parent_ref: { entity_id: 'src-1' } } })), L.PARENT_REF_MISSING);
rejects('1B/lineage/parent_ref_points_elsewhere',
  () => validateLineageChain(chain({ 1: { parent_ref: ref('src-9') } })), L.PARENT_REF_MISMATCH,
  'a parent is named, not inferred from position alone');
rejects('1B/lineage/known_at_goes_backwards',
  () => validateLineageChain(chain({ 4: { known_at: '2026-07-01T00:00:00.000Z' } })), L.KNOWN_AT_NOT_MONOTONIC,
  'a derived node cannot be known before its input');
rejects('1B/lineage/bad_known_at',
  () => validateLineageChain(chain({ 2: { known_at: '2026-08-02' } })), L.KNOWN_AT_INVALID);
for (const f of REQUIRED_EXTRACTION_FIELDS) {
  const c = chain();
  delete c[2][f];
  rejects(`1B/lineage/extraction_missing/${f}`, () => validateLineageChain(c), L.EXTRACTION_FIELD_MISSING);
}
rejects('1B/lineage/ai_derived_must_be_explicit',
  () => validateLineageChain(chain({ 2: { ai_derived: 'no' } })), L.EXTRACTION_FIELD_MISSING);
rejects('1B/lineage/orphan_claim',
  () => validateLineageChain([chain()[0], chain()[1], chain()[2], { ...chain()[4], parent_ref: ref('ext-1') }]), L.CHAIN_ORDER_INVALID,
  'the claim cannot sit where the locator should be');
accepts('1B/lineage/locator_present_claim_ok', () => assertNoOrphanClaim(chain()[4]), 'positive control');
rejects('1B/lineage/claim_without_locator_ref', () => assertNoOrphanClaim({ kind: 'claim' }), L.ORPHAN_CLAIM);
rejects('1B/lineage/not_a_claim', () => assertNoOrphanClaim({ kind: 'source' }), L.KIND_UNKNOWN);

// ---------------------------------------------------------------- authority ceiling

accepts('1B/authority/equal_family_ok', () => assertWithinSourceAuthority('reviewed_wiki', 'reviewed_wiki'), 'positive control');
accepts('1B/authority/weaker_claim_ok', () => assertWithinSourceAuthority('reviewed_wiki', 'project_contract_baseline'));
rejects('1B/authority/claim_outranks_source',
  () => assertWithinSourceAuthority('project_contract_baseline', 'reviewed_wiki'), L.AUTHORITY_ESCALATION,
  'a derivation cannot improve the standing of what it derived from');
rejects('1B/authority/unregistered_family', () => assertWithinSourceAuthority('vibes', 'reviewed_wiki'), L.KIND_UNKNOWN);
rejects('1B/lineage/escalating_claim_in_a_chain',
  () => validateLineageChain(chain({ 4: { authority_family: 'project_contract_baseline' } })), L.AUTHORITY_ESCALATION);

// ---------------------------------------------------------------- provenance propagation

record('1B/provenance/clean_stays_clean',
  propagateProvenance({ parentAiDerived: false, stepExecutionMode: 'deterministic_only' }).ai_derived === false);
record('1B/provenance/ai_input_taints_deterministic_step',
  propagateProvenance({ parentAiDerived: true, stepExecutionMode: 'deterministic_only' }).ai_derived === true,
  'processing deterministically does not launder the input');
record('1B/provenance/flag_says_it_cannot_be_cleared',
  propagateProvenance({ parentAiDerived: true, stepExecutionMode: 'deterministic_only' }).deterministic_processing_does_not_clear_it === true);
record('1B/provenance/ai_step_taints_clean_input',
  propagateProvenance({ parentAiDerived: false, stepExecutionMode: 'ai_assisted' }).ai_derived === true);
rejects('1B/provenance/cannot_declare_clean_over_ai_input',
  () => propagateProvenance({ parentAiDerived: true, stepExecutionMode: 'deterministic_only', claimedAiDerived: false }), L.PROVENANCE_LAUNDERED);
rejects('1B/provenance/cannot_declare_ai_without_basis',
  () => propagateProvenance({ parentAiDerived: false, stepExecutionMode: 'deterministic_only', claimedAiDerived: true }), L.PROVENANCE_LAUNDERED,
  'an unfounded ai flag is also a false provenance claim');
rejects('1B/lineage/laundered_claim_in_a_chain',
  () => validateLineageChain(chain({ 0: { ai_derived: true }, 4: { ai_derived: false } })), L.PROVENANCE_LAUNDERED);
accepts('1B/lineage/honest_ai_chain_passes',
  () => validateLineageChain(chain({ 0: { ai_derived: true }, 4: { ai_derived: true } })), 'ai provenance carried forward honestly is fine');

// ---------------------------------------------------------------- declared boundaries

record('1B/non_capabilities_declared',
  NON_CAPABILITIES.length >= 4 && NON_CAPABILITIES.some((s) => s.includes('similarity')),
  'no parent inference from filename or proximity');
record('1B/open_items_declared',
  OPEN_OWNER_DECISIONS_FOR_THIS_LANE.includes('which_source_surfaces_are_in_scope_for_inventory'),
  'the lane fixes the custody contract, not which drives are in scope');

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'lane_1b_inventory_custody_eligibility_lineage',
  owns_field_group: 'inventory_custody_eligibility_and_lineage',
  custody_mode: CUSTODY_MODE,
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  verification_strength: 'author_written_fixtures',
  independent_lock_owed_by: 'lane_1V',
  open_owner_decisions: OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
