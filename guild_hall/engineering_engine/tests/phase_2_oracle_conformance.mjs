// Phase 2 — the seven synthetic oracles, run against the frozen spec.
//
// The spec was written and hashed before any of this existed. This file re-verifies that hash
// on every run, so the expectations cannot be quietly edited to match whatever the code turned
// out to do. That is the only independence a single author can manufacture, and it is not a
// substitute for a second author.
//
// Forbidden outputs are absolute. A case fails on a forbidden output even when every positive
// assertion passed, because "it also produced the right answer" is no defence for leaking a
// reference the requester may not see.
//
// Everything here is public and synthetic. No project material, no private payload, no runtime,
// no P5 or P8, no learned model.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runEnginePass } from '../assembly/engine_pass.mjs';
import { buildStates, SUBJECT_ID } from '../subjects/engine_self_topology.mjs';
import { AXIS, GAP_TYPE, compareStates } from '../kernel/snapshot.mjs';
import { PRESENCE } from '../kernel/custody.mjs';
import { judgeEdge } from '../kernel/delivery_receipt.mjs';
import { selectCapsule, RANKING_KEYS, assertNoForbiddenIdentifier } from '../kernel/capsule.mjs';
import {
  recordSourceConflict, assertTwoSourceAuthorityInvariant, TWO_SOURCE_AUTHORITY_INVARIANT,
} from '../kernel/authority.mjs';
import { admitRequest, cacheKey, assertCacheEntryServesRequest } from '../kernel/mcp_contract.mjs';
import { ContractError } from '../kernel/errors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');

// ---------------------------------------------------------------- the spec, and its freeze

const SPEC_PATH = join(ENGINE, 'fixtures', 'phase_2_oracle_spec.json');
const FREEZE_PATH = join(ENGINE, 'fixtures', 'phase_2_oracle_spec.sha256');
const specBytes = readFileSync(SPEC_PATH);
const spec = JSON.parse(specBytes);
const actualDigest = createHash('sha256').update(specBytes).digest('hex');
const freezeText = readFileSync(FREEZE_PATH, 'utf8');
const declaredDigest = /^([0-9a-f]{64})\s+\S+/m.exec(freezeText)?.[1] ?? null;

const results = [];
const violations = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });
/** A forbidden output fails its case outright, whatever else passed. */
const forbid = (oracle, label, violated, detail = '') => {
  if (violated) violations.push({ oracle, forbidden: label, detail });
  record(`${oracle}/forbidden/${label}`, !violated, detail);
};

record('SPEC/freeze_digest_matches', declaredDigest === actualDigest,
  `spec was frozen at ${String(declaredDigest).slice(0, 12)} but now hashes to ${actualDigest.slice(0, 12)}`);
record('SPEC/declares_frozen_before_implementation', spec.status === 'FROZEN_BEFORE_IMPLEMENTATION');
record('SPEC/seven_oracles', spec.oracles.length === 7);
record('SPEC/scope_is_synthetic_only', spec.scope === 'public_synthetic_only');

{
  const probe = [];
  const rej = (fn, code) => { let e = null; try { fn(); } catch (x) { e = x; } probe.push((e instanceof ContractError && (!code || e.code === code)) === true); };
  rej(() => 1, 'ANY');
  rej(() => { throw new ContractError('OTHER', 'x'); }, 'WANTED');
  rej(() => { throw new ContractError('WANTED', 'x'); }, 'WANTED');
  record('P2/harness/self_test', probe[0] === false && probe[1] === false && probe[2] === true,
    'the reject helper detects what it claims to');
}

const specOf = (id) => spec.oracles.find((o) => o.id === id);

// ---------------------------------------------------------------- shared synthetic material

const T = '2026-08-11T00:00:00.000Z';
const V = '2026-08-10T00:00:00.000Z';
const uuids = (seed) => { let n = seed; return () => { n += 1; return `a3f1c2d4-5e6f-4a7b-8c9d-${n.toString(16).padStart(12, '0')}`; }; };
const ref = (id) => ({ entity_id: id, revision_id: `${id}-r1`, content_id: `${id}-c1`, content_hash_alg: 'sha256' });

const expectedEl = (n, over = {}) => ({
  element_id: `req_${n}`, axis: AXIS.EXPECTED, requirement_ref: ref(`req_${n}`),
  authority_family: 'company_approved_procedure', applicability: true, valid_at: V, known_at: T, ...over,
});
const observedEl = (n, presence, over = {}) => ({
  element_id: `obs_req_${n}`, axis: AXIS.OBSERVED, artifact_revision_ref: ref(`art_${n}`),
  presence_state: presence, valid_at: V, known_at: T, ...over,
});

const statesFor = (presences) => ({
  expected: presences.map((_, i) => expectedEl(i + 1)),
  observed: presences.map((p, i) => observedEl(i + 1, p)),
  canonical_accepted_input_set: {
    source_revision_refs: presences.map((_, i) => ref(`req_${i + 1}`)),
    artifact_revision_refs: presences.map((_, i) => ref(`art_${i + 1}`)),
  },
});

const runCase = (states, seed = 0) => runEnginePass({
  states, subjectId: 'phase_2_synthetic', projectBindingRef: 'pb-alpha', generation: 1,
  topologyDigest: 'd'.repeat(64), observationRunId: 'run-p2', takenAt: T, validAt: V, mintValue: uuids(seed),
});

// ---------------------------------------------------------------- O1 correct

{
  const o = specOf('O1_correct');
  const r = runCase(statesFor([PRESENCE.PRESENT, PRESENCE.PRESENT, PRESENCE.PRESENT]));
  record('O1/satisfied_three', r.gap_counts.satisfied === o.expected_verdict.gap_counts.satisfied);
  record('O1/no_findings', r.findings.length === o.expected_verdict.finding_count);
  record('O1/ceiling', r.snapshot.claim_ceiling === o.expected_verdict.snapshot_claim_ceiling);
  forbid('O1', 'finding_for_a_satisfied_pair', r.findings.length > 0);
  forbid('O1', 'context_request_when_nothing_unresolved', r.contextRequest !== null);
  record('O1/metric', r.findings.length === 0, `${o.metric} = ${r.findings.length}, threshold == 0`);
}

// ---------------------------------------------------------------- O2 missing

{
  const o = specOf('O2_missing');
  const r = runCase(statesFor([PRESENCE.PRESENT, PRESENCE.ABSENCE_CONFIRMED, PRESENCE.ABSENCE_CONFIRMED]));
  const wronglyUnknown = r.findings.filter((f) => f.gap_type === GAP_TYPE.UNKNOWN).length;
  record('O2/gap_counts', r.gap_counts.satisfied === 1 && r.gap_counts[GAP_TYPE.MISSING] === 2);
  record('O2/finding_count', r.findings.length === o.expected_verdict.finding_count);
  record('O2/ceiling_is_observed_artifact',
    r.findings.every((f) => f.evidence_claim_ceiling === o.expected_verdict.finding_evidence_ceiling));
  record('O2/every_finding_cites_the_attempt',
    r.findings.every((f) => typeof f.observation_attempt_ref === 'string' && f.observation_attempt_ref.length > 0));
  forbid('O2', 'gap_unknown_for_a_confirmed_absence', wronglyUnknown > 0);
  forbid('O2', 'context_request_for_a_confirmed_absence', r.contextRequest !== null);
  forbid('O2', 'finding_that_cites_nothing',
    r.findings.some((f) => !f.observation_attempt_ref && (f.cited_spans ?? []).length === 0));
  record('O2/metric', wronglyUnknown === 0, `${o.metric} = ${wronglyUnknown}, threshold == 0`);
}

// ---------------------------------------------------------------- O3 unknown

{
  const o = specOf('O3_unknown');
  let falseMissing = 0;
  for (const variant of o.exact_input.compromise_variants) {
    // A compromised observation is expressed here as the state the subject adapter would have
    // produced: unobserved elements are unknown, not absent.
    const r = runCase(statesFor([PRESENCE.PRESENT, PRESENCE.UNKNOWN, PRESENCE.UNKNOWN]), 100);
    const missing = r.gap_counts[GAP_TYPE.MISSING] ?? 0;
    falseMissing += missing;
    record(`O3/${variant}/unknown_two`, r.gap_counts[GAP_TYPE.UNKNOWN] === 2);
    record(`O3/${variant}/no_missing`, missing === 0);
    record(`O3/${variant}/snapshot_ceiling_unknown`, r.snapshot.claim_ceiling === 'unknown');
    record(`O3/${variant}/findings_carry_unknown_ceiling`,
      r.findings.every((f) => f.evidence_claim_ceiling === 'unknown'));
    record(`O3/${variant}/context_request_produced`, r.contextRequest !== null);
    record(`O3/${variant}/request_is_candidate_only`,
      r.contextRequest?.candidate_only === true && r.contextRequest?.erp_delta === 0);
    const namesOnlyUnknown = (r.contextRequest?.finding_ids ?? [])
      .every((id) => r.findings.find((f) => f.finding_id === id)?.gap_type === GAP_TYPE.UNKNOWN);
    record(`O3/${variant}/request_names_only_unknown`, namesOnlyUnknown);
    forbid('O3', `gap_missing_under_${variant}`, missing > 0);
    forbid('O3', `observed_artifact_ceiling_under_${variant}`,
      r.findings.some((f) => f.evidence_claim_ceiling === 'observed_artifact'));
    forbid('O3', `request_names_a_non_unknown_finding_under_${variant}`, !namesOnlyUnknown);
  }
  record('O3/metric', falseMissing === 0, `${o.metric} = ${falseMissing}, threshold == 0`);
}

// ---------------------------------------------------------------- O4 contradictory
//
// The frozen input is two *sources* that disagree, one project_contract_baseline and one
// reviewed_wiki. Expected-versus-Observed is a different disagreement and proving that one
// is preserved says nothing about this one: the failure mode here is the lower-authority
// source quietly vanishing once precedence has picked a winner.

{
  const o = specOf('O4_contradictory');
  const expected = expectedEl(1, { authority_family: 'project_contract_baseline' });
  const observed = observedEl(1, PRESENCE.PRESENT);

  const claims = [
    {
      claim_id: 'claim_baseline', authority_family: 'project_contract_baseline',
      source_revision_ref: ref('src_baseline'), lineage_ref: 'lineage_baseline',
      applicability: true, asserted_value: 'the interface review is required at PDR',
      valid_at: V, known_at: T,
    },
    {
      claim_id: 'claim_wiki', authority_family: 'reviewed_wiki',
      source_revision_ref: ref('src_wiki'), lineage_ref: 'lineage_wiki',
      applicability: true, asserted_value: 'the interface review is required at CDR',
      valid_at: V, known_at: T,
    },
  ];

  // The kernel-level comparison, and then the same contradiction driven through the assembled
  // pass. Checking only the first is what let an unreachable verdict class pass unnoticed.
  record('O4/kernel_reports_conflict',
    compareStates({ expected, observed, conflicts: true }).gap_type === GAP_TYPE.CONFLICT);

  const r = runEnginePass({
    states: {
      expected: [expected], observed: [observed],
      conflicting_element_ids: [expected.element_id],
      source_claims: { [expected.element_id]: claims },
      canonical_accepted_input_set: { source_revision_refs: [ref('req_1')], artifact_revision_refs: [ref('art_1')] },
    },
    subjectId: 'phase_2_synthetic', projectBindingRef: 'pb-alpha', generation: 1,
    topologyDigest: 'd'.repeat(64), observationRunId: 'run-p2', takenAt: T, validAt: V, mintValue: uuids(200),
  });

  record('O4/pass_reports_conflict', r.gap_counts[GAP_TYPE.CONFLICT] === o.expected_verdict.gap_counts.gap_conflict);
  record('O4/finding_count', r.findings.length === o.expected_verdict.finding_count);
  record('O4/finding_is_a_conflict', r.findings.every((f) => f.gap_type === GAP_TYPE.CONFLICT));
  record('O4/no_context_request', r.contextRequest === o.expected_verdict.context_request);

  const conflict = r.findings[0]?.source_conflict ?? null;
  const families = (conflict?.retained_claims ?? []).map((c) => c.authority_family);
  const claimIds = (conflict?.retained_claims ?? []).map((c) => c.claim_id);
  const lineage = (conflict?.retained_claims ?? []).map((c) => c.lineage_ref);
  const sourceRefs = (conflict?.retained_claims ?? []).map((c) => c.source_revision_ref?.revision_id);
  const values = (conflict?.retained_claims ?? []).map((c) => c.asserted_value);

  record('O4/two_disagreeing_sources_recorded',
    conflict?.claim_count === o.exact_input.disagreeing_sources && claimIds.length === 2,
    `recorded ${claimIds.length} claims`);
  record('O4/both_authority_families_present',
    o.exact_input.authority_families.every((f) => families.includes(f)),
    `families: ${families.join(',')}`);
  record('O4/both_source_revisions_preserved',
    sourceRefs.includes('src_baseline-r1') && sourceRefs.includes('src_wiki-r1'));
  record('O4/both_lineages_preserved',
    lineage.includes('lineage_baseline') && lineage.includes('lineage_wiki'));
  record('O4/both_claim_texts_preserved', values.length === 2 && new Set(values).size === 2,
    'the two sides said different things and both statements survive');
  record('O4/higher_authority_governs',
    conflict?.governing_authority_family === 'project_contract_baseline',
    `governing: ${conflict?.governing_authority_family}`);
  record('O4/nothing_dropped', conflict?.sides_dropped === 0);

  // Expected/Observed preservation is still checked, but it is a separate claim and is not
  // allowed to stand in for the two-source one.
  const bothAxesPresent = r.snapshot.expected_state_elements.length === 1
    && r.snapshot.observed_state_elements.length === 1;
  record('O4/both_axes_retained_in_the_snapshot', bothAxesPresent);

  forbid('O4', 'lower_authority_side_dropped',
    !families.includes('reviewed_wiki'), `families: ${families.join(',')}`);
  forbid('O4', 'winner_selected_without_recording_the_conflict',
    r.findings.length === 0 || !conflict || conflict.conflict !== true);
  forbid('O4', 'satisfied_reported_when_the_sides_disagree', (r.gap_counts.satisfied ?? 0) > 0);
  forbid('O4', 'evidence_ceiling_that_hides_the_disagreement',
    r.findings.some((f) => f.evidence_claim_ceiling === 'source_sufficient'),
    'source_sufficient on a conflict would claim the question is settled');

  // Negative control: a conflict signalled without its sides is refused outright, so the
  // record cannot be omitted quietly.
  let refusedWithoutClaims = null;
  try {
    runEnginePass({
      states: {
        expected: [expected], observed: [observed],
        conflicting_element_ids: [expected.element_id],
        canonical_accepted_input_set: { source_revision_refs: [ref('req_1')], artifact_revision_refs: [ref('art_1')] },
      },
      subjectId: 'phase_2_synthetic', projectBindingRef: 'pb-alpha', generation: 1,
      topologyDigest: 'd'.repeat(64), observationRunId: 'run-p2', takenAt: T, validAt: V, mintValue: uuids(250),
    });
  } catch (e) { refusedWithoutClaims = e; }
  record('O4/conflict_without_sides_is_refused', refusedWithoutClaims instanceof ContractError,
    `code ${refusedWithoutClaims?.code ?? 'none'}`);

  // ---- the exact invariant, and the pairs that are not it
  //
  // "A conflict was recorded with both sides retained" is much weaker than what the frozen
  // exact_input specifies, and every gap between the two is a way to satisfy the assertions
  // above without holding the property. The invariant names the pair exactly: one
  // project_contract_baseline, one reviewed_wiki, two revisions, an actual disagreement, both
  // applicable, baseline governing, loser retained. Each attack below produces a record that
  // still says `conflict: true`, and each must be refused.

  record('O4/invariant_declares_the_exact_pair',
    TWO_SOURCE_AUTHORITY_INVARIANT.claim_count === 2
      && TWO_SOURCE_AUTHORITY_INVARIANT.governing_family === o.exact_input.authority_families[0]
      && TWO_SOURCE_AUTHORITY_INVARIANT.contesting_family === o.exact_input.authority_families[1],
    `${TWO_SOURCE_AUTHORITY_INVARIANT.governing_family} vs ${TWO_SOURCE_AUTHORITY_INVARIANT.contesting_family}`);

  {
    // Positive control, on the record the assembled pass actually produced.
    let held = null;
    let error = null;
    try { held = assertTwoSourceAuthorityInvariant(conflict); } catch (e) { error = e; }
    record('O4/invariant_positive_control',
      held?.holds === true && held.governing_authority_family === 'project_contract_baseline',
      error ? `refused with ${error.code}: ${JSON.stringify(error.detail ?? {})}` : 'two genuinely disagreeing sources');
  }

  const claim = (over = {}) => ({
    claim_id: 'claim_baseline', authority_family: 'project_contract_baseline',
    source_revision_ref: ref('src_baseline'), lineage_ref: 'lineage_baseline',
    applicability: true, asserted_value: 'the interface review is required at PDR',
    valid_at: V, known_at: T, ...over,
  });
  const wikiClaim = (over = {}) => claim({
    claim_id: 'claim_wiki', authority_family: 'reviewed_wiki',
    source_revision_ref: ref('src_wiki'), lineage_ref: 'lineage_wiki',
    asserted_value: 'the interface review is required at CDR', ...over,
  });

  // Some attacks are refused when the record is built, others only when the invariant is
  // applied to a record that was legitimately built. Both are refusals, and this helper does
  // not care which stage caught it — it cares that nothing concluded the invariant held.
  const attack = (label, claims, note = '') => {
    let refusal = null;
    try { assertTwoSourceAuthorityInvariant(recordSourceConflict(claims)); } catch (e) { refusal = e; }
    record(`O4/attack/${label}`, refusal instanceof ContractError,
      refusal ? `${refusal.code}${note ? ` — ${note}` : ''}` : 'NOT REFUSED');
    return refusal;
  };

  attack('one_source_substituted_for_two', [
    claim(),
    claim({ claim_id: 'claim_baseline_again', asserted_value: 'the interface review is required at CDR' }),
  ], 'two baseline claims are not a two-authority disagreement');
  attack('duplicate_source_revision', [
    claim(),
    wikiClaim({ source_revision_ref: ref('src_baseline') }),
  ], 'one revision cannot disagree with itself');
  attack('same_value_pair', [
    claim(),
    wikiClaim({ asserted_value: 'The interface review is required at   PDR ' }),
  ], 'the same statement in different whitespace and case is agreement, not conflict');
  attack('two_reviewed_wiki_claims', [
    wikiClaim({ claim_id: 'wiki_a', source_revision_ref: ref('src_wiki_a') }),
    wikiClaim({ claim_id: 'wiki_b', source_revision_ref: ref('src_wiki_b'), asserted_value: 'no review is required' }),
  ], 'no baseline side means nothing governs');
  attack('equal_authority_pair', [
    claim({ claim_id: 'base_a', source_revision_ref: ref('src_a') }),
    claim({ claim_id: 'base_b', source_revision_ref: ref('src_b'), asserted_value: 'the interface review is required at CDR' }),
  ], 'two claims of the same family cannot resolve by precedence');
  attack('unknown_applicability', [
    claim(),
    wikiClaim({ applicability: 'unknown' }),
  ], 'an unresolved applicability is not a weaker yes');
  attack('inapplicable_side', [
    claim(),
    wikiClaim({ applicability: false }),
  ], 'a side that does not apply cannot be the contesting authority');
  attack('a_pair_of_two_other_families', [
    claim(),
    claim({
      claim_id: 'claim_guidance', authority_family: 'general_se_guidance',
      source_revision_ref: ref('src_iso'), lineage_ref: 'lineage_iso',
      asserted_value: 'the interface review is required at SRR',
    }),
  ], 'baseline against ISO guidance is a real disagreement and it is not the O4 pair');
  attack('a_third_party_to_the_pair', [
    claim(),
    wikiClaim(),
    claim({ claim_id: 'claim_procedure', authority_family: 'company_approved_procedure', source_revision_ref: ref('src_proc'), asserted_value: 'the interface review is required at SRR' }),
  ], 'a third claim changes which pair governs');
  attack('lineage_dropped', [
    claim({ lineage_ref: '' }),
    wikiClaim(),
  ], 'a side that cannot be re-derived is not preserved');

  // Two guards stand between a bad pair and an O4 pass, and they are separate on purpose:
  // `recordSourceConflict` refuses to *build* a record that is not a disagreement, and the
  // invariant refuses to *conclude* from a record that is not the exact pair. A record handed
  // in from anywhere else never went through the first guard, so the second is exercised here
  // against records built by hand rather than by the kernel.
  const built = (claims, over = {}) => ({
    conflict: true,
    claim_count: claims.length,
    retained_claims: claims,
    retained_claim_ids: claims.map((c) => c.claim_id),
    retained_authority_families: claims.map((c) => c.authority_family),
    governing_authority_family: 'project_contract_baseline',
    outranked_but_inapplicable: [],
    resolution_reason: 'highest applicable tier',
    sides_dropped: 0,
    ...over,
  });
  const invariantRefuses = (label, conflictRecord, note = '') => {
    let refusal = null;
    try { assertTwoSourceAuthorityInvariant(conflictRecord); } catch (e) { refusal = e; }
    record(`O4/invariant/${label}`, refusal instanceof ContractError,
      refusal ? `${refusal.code}${note ? ` — ${note}` : ''}` : 'NOT REFUSED');
  };
  const recordRefuses = (label, claims, note = '') => {
    let refusal = null;
    try { recordSourceConflict(claims); } catch (e) { refusal = e; }
    record(`O4/record/${label}`, refusal instanceof ContractError,
      refusal ? `${refusal.code}${note ? ` — ${note}` : ''}` : 'NOT REFUSED');
  };

  recordRefuses('duplicate_revision_refused_when_built', [claim(), wikiClaim({ source_revision_ref: ref('src_baseline') })]);
  recordRefuses('agreement_refused_when_built', [claim(), wikiClaim({ asserted_value: 'the interface review is required at PDR' })]);
  recordRefuses('duplicate_claim_id_refused_when_built', [claim(), wikiClaim({ claim_id: 'claim_baseline' })]);
  recordRefuses('missing_lineage_refused_when_built', [claim({ lineage_ref: '' }), wikiClaim()]);

  invariantRefuses('duplicate_revision_in_a_hand_built_record',
    built([claim(), wikiClaim({ source_revision_ref: ref('src_baseline') })]),
    'a record that never passed through the builder still has to face the invariant');
  invariantRefuses('agreement_in_a_hand_built_record',
    built([claim(), wikiClaim({ asserted_value: 'The interface review is required at PDR' })]));
  invariantRefuses('missing_lineage_in_a_hand_built_record',
    built([claim({ lineage_ref: '' }), wikiClaim()]));
  invariantRefuses('one_side_only', built([claim()]));
  invariantRefuses('three_sides', built([claim(), wikiClaim(),
    claim({ claim_id: 'c3', authority_family: 'general_se_guidance', source_revision_ref: ref('src_iso'), asserted_value: 'at SRR' })]));
  invariantRefuses('a_side_was_dropped', built([claim(), wikiClaim()], { sides_dropped: 1 }));
  invariantRefuses('not_declared_a_conflict', built([claim(), wikiClaim()], { conflict: false }));
  invariantRefuses('claim_count_disagrees_with_the_claims', built([claim(), wikiClaim()], { claim_count: 5 }));
  invariantRefuses('not_a_record_at_all', null);

  // ---- B-08: a bare string is not a source revision, and a date that does not resolve is
  // not a time.
  //
  // Both of these produced records that satisfied every other check. `source_revision_ref:
  // 'src_baseline'` was read as a revision id, so two different strings counted as two
  // different revisions — while neither could be resolved to any bytes, which is the whole
  // point of citing a revision. And `valid_at` / `known_at` were carried through untouched, so
  // a pair dated 'yesterday', or known before it was valid, still resolved a precedence
  // question that is only ever asked at an instant.

  recordRefuses('bare_string_source_ref_refused_when_built',
    [claim({ source_revision_ref: 'src_baseline' }), wikiClaim()],
    'a string names nothing that can be resolved back to bytes');
  recordRefuses('both_sides_bare_string_refused_when_built',
    [claim({ source_revision_ref: 'src_baseline' }), wikiClaim({ source_revision_ref: 'src_wiki' })],
    'two different strings are not two different revisions');
  recordRefuses('partial_ref_refused_when_built',
    [claim({ source_revision_ref: { entity_id: 'src_baseline', revision_id: 'src_baseline-r1' } }), wikiClaim()],
    'a ref without a content id is not an exact revision ref');
  recordRefuses('wrong_hash_algorithm_refused_when_built',
    [claim({ source_revision_ref: { ...ref('src_baseline'), content_hash_alg: 'md5' } }), wikiClaim()],
    'a ref outside the declared hash algorithm cannot be checked against the bytes');
  recordRefuses('non_instant_valid_at_refused_when_built',
    [claim({ valid_at: 'yesterday' }), wikiClaim()], 'a side that is not dated cannot be placed in a window');
  recordRefuses('impossible_date_refused_when_built',
    [claim({ known_at: '2026-02-30T00:00:00.000Z' }), wikiClaim()], 'a date that does not exist is not a time');
  recordRefuses('known_before_valid_refused_when_built',
    [claim({ valid_at: T, known_at: V }), wikiClaim()], 'a side known before the fact it asserts was dated');
  // Sorts *after* a real instant, so the ordering check cannot catch it. Only the shape check can.
  recordRefuses('unparseable_known_at_refused_when_built',
    [claim({ known_at: 'zzz-not-a-time' }), wikiClaim()],
    'a value that is not an instant at all is refused on its shape, not on where it happens to sort');

  invariantRefuses('bare_string_source_ref_in_a_hand_built_record',
    built([claim({ source_revision_ref: 'src_baseline' }), wikiClaim()]),
    'the builder is not the only way a record arrives, so the invariant refuses it too');
  invariantRefuses('both_sides_bare_string_in_a_hand_built_record',
    built([claim({ source_revision_ref: 'src_baseline' }), wikiClaim({ source_revision_ref: 'src_wiki' })]),
    'two strings that differ still cite no revision at all');
  invariantRefuses('partial_ref_in_a_hand_built_record',
    built([claim({ source_revision_ref: { entity_id: 'src_baseline', revision_id: 'src_baseline-r1' } }), wikiClaim()]));
  invariantRefuses('non_instant_valid_at_in_a_hand_built_record',
    built([claim({ valid_at: 'yesterday' }), wikiClaim()]));
  invariantRefuses('impossible_date_in_a_hand_built_record',
    built([claim(), wikiClaim({ known_at: '2026-02-30T00:00:00.000Z' })]));
  invariantRefuses('known_before_valid_in_a_hand_built_record',
    built([claim(), wikiClaim({ valid_at: T, known_at: V })]));
  invariantRefuses('unparseable_known_at_in_a_hand_built_record',
    built([claim({ known_at: 'zzz-not-a-time' }), wikiClaim()]),
    'sorting after a real instant is not being one');

  {
    // The refusals name the property that is missing rather than an aggregate, so a caller
    // cannot reshape the input until something passes without knowing what they changed.
    let refusal = null;
    try { assertTwoSourceAuthorityInvariant(built([claim({ source_revision_ref: 'src_baseline' }), wikiClaim()])); } catch (e) { refusal = e; }
    record('O4/invariant/bare_string_names_the_failed_check',
      refusal?.detail?.failed_checks?.includes('exact_typed_source_revision_refs') === true
        && refusal.detail.sides_without_an_exact_ref === 1,
      refusal ? JSON.stringify(refusal.detail.failed_checks) : 'NOT REFUSED');

    let timeRefusal = null;
    try { assertTwoSourceAuthorityInvariant(built([claim(), wikiClaim({ valid_at: T, known_at: V })])); } catch (e) { timeRefusal = e; }
    record('O4/invariant/incoherent_time_names_the_failed_check',
      timeRefusal?.detail?.failed_checks?.includes('both_sides_dated_coherently') === true
        && timeRefusal.detail.time_faults?.includes('known_at_precedes_valid_at') === true,
      timeRefusal ? JSON.stringify(timeRefusal.detail.failed_checks) : 'NOT REFUSED');
  }

  {
    // Positive control paired with the two attacks above: the exact baseline-versus-wiki pair,
    // with exact typed refs and coherent times, still holds — with the baseline governing and
    // both lineages preserved.
    const valid = recordSourceConflict([claim(), wikiClaim()]);
    let held = null;
    try { held = assertTwoSourceAuthorityInvariant(valid); } catch (e) { held = e; }
    const lineages = valid.retained_claims.map((c) => c.lineage_ref).sort();
    record('O4/invariant/exact_typed_refs_positive_control',
      held?.holds === true
        && held.governing_authority_family === 'project_contract_baseline'
        && held.contesting_authority_family === 'reviewed_wiki'
        && valid.retained_claims.every((c) => c.source_revision_ref?.content_hash_alg === 'sha256')
        && JSON.stringify(lineages) === JSON.stringify(['lineage_baseline', 'lineage_wiki'])
        && valid.sides_dropped === 0,
      held?.code ? `refused with ${held.code}` : 'baseline governs, both lineages preserved, both refs exact');
  }

  {
    // Positive control for the hand-built path, so the invariant is discriminating rather than
    // refusing everything that did not come out of the builder.
    let held = null;
    try { held = assertTwoSourceAuthorityInvariant(built([claim(), wikiClaim()])); } catch (e) { held = e; }
    record('O4/invariant/hand_built_valid_pair_holds', held?.holds === true,
      held?.code ? `refused with ${held.code}` : 'two genuinely disagreeing sources, built by hand');
  }

  {
    // The losing claim removed from an otherwise valid record. Built legitimately, then
    // tampered with, which is exactly the failure O4 exists to catch.
    const valid = recordSourceConflict([claim(), wikiClaim()]);
    const loserDropped = {
      ...valid,
      retained_claims: valid.retained_claims.filter((c) => c.authority_family !== 'reviewed_wiki'),
      retained_claim_ids: ['claim_baseline'],
    };
    let refusal = null;
    try { assertTwoSourceAuthorityInvariant(loserDropped); } catch (e) { refusal = e; }
    record('O4/attack/losing_claim_removed_after_the_fact', refusal instanceof ContractError,
      refusal ? refusal.code : 'NOT REFUSED');

    const wrongGovernor = { ...valid, governing_authority_family: 'reviewed_wiki' };
    let governorRefusal = null;
    try { assertTwoSourceAuthorityInvariant(wrongGovernor); } catch (e) { governorRefusal = e; }
    record('O4/attack/reviewed_wiki_claimed_to_govern', governorRefusal instanceof ContractError,
      governorRefusal ? governorRefusal.code : 'NOT REFUSED');
  }

  forbid('O4', 'a_pair_that_is_not_the_invariant_treated_as_the_invariant',
    results.filter((x) => x.id.startsWith('O4/attack/') && !x.ok).length > 0,
    `${results.filter((x) => x.id.startsWith('O4/attack/') && !x.ok).length} attack(s) not refused`);

  const recorded = r.gap_counts[GAP_TYPE.CONFLICT] ?? 0;
  record('O4/metric', recorded === 1 && claimIds.length === 2,
    `${o.metric} = ${recorded} with ${claimIds.length} refs, threshold == 1`);
}

// ---------------------------------------------------------------- O5 stale
//
// Driven through the real subject adapter, not converted by hand in this file. The previous
// version computed the presence state here — `proves_traversal ? present : unknown` — and so
// tested the test. The engine itself was reading "a receipt exists for this edge" as present,
// which is exactly what the frozen O5 forbids, and no assertion here could see it.

{
  const o = specOf('O5_stale');
  const now = Date.parse(T);
  const window = o.exact_input.window;
  const staleAt = new Date(now - o.exact_input.receipt_age_seconds * 1000).toISOString();
  const receiptFor = (keys, over = {}) => Object.fromEntries(keys.map((k) => [k, {
    edge_key: k, observed_at: staleAt, outcome: 'delivered',
    observation_method: 'module_load_observation', run_id: 'run-p2', ...over,
  }]));

  const v = judgeEdge({ edgeKey: 'alpha>bravo', receipt: receiptFor(['alpha>bravo'])['alpha>bravo'], window, now });
  record('O5/state_is_stale', v.state === o.expected_verdict.edge_delivery_state);
  record('O5/proves_nothing_now', v.proves_traversal === false);
  forbid('O5', 'delivering_or_late_outside_the_window', v.state === 'delivering' || v.state === 'late');
  forbid('O5', 'proves_traversal_on_a_stale_receipt', v.proves_traversal === true);

  // The assembled path. Both expected elements are covered by receipts, and both receipts are
  // outside the window, which is the frozen exact_input: "receipts_cover: both".
  const EDGES = [['alpha', 'bravo'], ['bravo', 'charlie']];
  const topology = { module_edges: EDGES.map(([from, to]) => ({ from, to, relation: 'imports' })), topology_digest: 'd'.repeat(64) };
  // The observation declares the exact edge key set it produced receipts for. The adapter
  // refuses to weigh a receipt map it cannot match against that declaration, so the frozen
  // exact_input ("receipts_cover: both") has to be stated by the run and not just implied by
  // whatever keys happen to be in the object.
  const observationCovering = (keys) => ({
    run_id: 'run-p2',
    surfaces: { declared: 8, run: 8, failing: [], counts: {} },
    edges: { exercised_edge_keys: [...keys].sort() },
  });
  const engineRun = (receipts, seed) => {
    const observation = observationCovering(Object.keys(receipts));
    const states = buildStates({ topology, receipts, observation, validAt: V, knownAt: T, window, now });
    return {
      states,
      result: runEnginePass({
        states, subjectId: SUBJECT_ID, projectBindingRef: 'pb-alpha', generation: 1,
        topologyDigest: 'd'.repeat(64), observationRunId: 'run-p2', takenAt: T, validAt: V, mintValue: uuids(seed),
      }),
    };
  };

  const stale = engineRun(receiptFor(['alpha>bravo', 'bravo>charlie']), 300);
  record('O5/adapter_did_not_read_the_receipt_as_present',
    stale.states.observed.every((e) => e.presence_state === PRESENCE.UNKNOWN),
    'the subject adapter judged the receipt rather than counting its key');
  const permitted = new Set(o.expected_verdict.gap_types_permitted);
  const emitted = Object.keys(stale.result.gap_counts).filter((g) => g !== GAP_TYPE.SATISFIED);
  record('O5/only_permitted_gap_types', emitted.every((g) => permitted.has(g)), `emitted ${emitted.join(',')}`);
  record('O5/two_unknown_gaps', stale.result.gap_counts[GAP_TYPE.UNKNOWN] === 2);
  record('O5/snapshot_ceiling_unknown', stale.result.snapshot.claim_ceiling === 'unknown');
  forbid('O5', 'satisfied_derived_from_stale_evidence', (stale.result.gap_counts.satisfied ?? 0) > 0);
  forbid('O5', 'gap_missing_derived_from_stale_evidence', (stale.result.gap_counts[GAP_TYPE.MISSING] ?? 0) > 0);

  // Positive control on the same path: an in-window receipt still satisfies, so the rule is
  // discriminating rather than refusing everything.
  const inWindowAt = new Date(now - 60 * 1000).toISOString();
  const fresh = engineRun(receiptFor(['alpha>bravo', 'bravo>charlie'], { observed_at: inWindowAt }), 400);
  record('O5/positive_control_fresh_receipt_satisfies', fresh.result.gap_counts.satisfied === 2,
    'a receipt inside the window is still evidence');

  const admitted = v.proves_traversal || (stale.result.gap_counts.satisfied ?? 0) > 0 ? 1 : 0;
  record('O5/metric', admitted === 0, `${o.metric} = ${admitted}, threshold == 0`);
}

// ---------------------------------------------------------------- O6 unauthorized
//
// The frozen forbidden list says a denied ref must not appear "anywhere in the capsule
// payload, hash or pointer set". An exclusion entry is part of the capsule payload, so
// naming the denied ref there is disclosure of exactly what the ACL refused. The exclusion
// still has to be stated — a silent empty capsule is also forbidden — which is why the
// reason and the count are kept and the identifier is not.

const capsuleRef = (id) => ({ entity_id: id, revision_id: `${id}-r1`, content_id: `${id}-c1`, content_hash_alg: 'sha256' });
const capsuleEdge = (over) => ({
  edge_id: 'e', edge_type: 'has_revision', from_type: 'source', to_type: 'source_revision',
  from_ref: capsuleRef('src_seed'), to_ref: capsuleRef('src_hop1'),
  authority_family: 'company_approved_procedure', evidence_ref: capsuleRef('ev'),
  valid_at: V, known_at: T, applicability: true,
  review_state: 'reviewed', evidence_claim_ceiling: 'source_sufficient',
  generating_policy_revision: 'graph-policy-v0',
  project_binding_ref: 'pb-alpha', ...over,
});
const capsuleSelector = (over = {}) => ({
  project_binding_ref: 'pb-alpha', scope: 'project', accepted_context_generation: 1,
  valid_at: V, known_at: T, acl_filter_revision: 'acl-v1',
  source_family_filter: ['company_approved_procedure'], seed_refs: [capsuleRef('src_seed')],
  traversal: { max_hops: 2, allowlisted_edge_types: ['has_revision', 'extracted_by'] },
  ranking: { method: 'deterministic', keys: [...RANKING_KEYS] },
  budgets: { top_k: 10, max_nodes: 50, max_edges: 50, max_sources: 20, max_evidence_chars: 4000 },
  graph_projection_revision: 'proj-r1', ...over,
});

{
  const o = specOf('O6_unauthorized');
  const seed = capsuleRef('src_seed');
  const hop1 = capsuleRef('src_hop1_denied');
  const hop2 = capsuleRef('src_hop2_denied');
  const graph = {
    edges: [
      capsuleEdge({ edge_id: 'e1', from_ref: seed, to_ref: hop1 }),
      capsuleEdge({ edge_id: 'e2', edge_type: 'extracted_by', from_type: 'source_revision', to_type: 'extraction_run', from_ref: hop1, to_ref: hop2 }),
    ],
    // Every node the traversal can touch is declared, and declared as alpha. The refusal
    // under test here is the ACL one, so the binding side is given no way to do the work.
    nodes: [seed, hop1, hop2].map((r) => ({ ref: r, project_binding_ref: 'pb-alpha' })),
  };
  const denied = new Set(['src_hop1_denied', 'src_hop2_denied']);
  const aclCheck = (r) => !denied.has(typeof r === 'string' ? r : r.entity_id);

  let capsule = null;
  let threw = null;
  try { capsule = selectCapsule(capsuleSelector(), graph, aclCheck); } catch (e) { threw = e; }
  record('O6/capsule_still_produced', capsule !== null, threw ? `threw ${threw.code}` : '');

  const includedIds = (capsule?.included_refs ?? []).map((r) => r.entity_id);
  const exclusionReasons = (capsule?.excluded ?? []).map((e) => e.reason);

  // The strongest form of the rule, checked recursively over the whole returned object with
  // its keys: the identifier must not survive in a pointer, a hash input, a ranking entry or
  // an exclusion payload.
  let leakError = null;
  try { assertNoForbiddenIdentifier(capsule ?? {}, [...denied]); } catch (e) { leakError = e; }

  record('O6/denied_not_included', includedIds.every((id) => !denied.has(id)));
  record('O6/exclusions_carry_a_reason',
    (capsule?.excluded ?? []).length > 0 && exclusionReasons.every((r) => typeof r === 'string' && r.length > 0),
    `reasons: ${exclusionReasons.join(',')}`);
  record('O6/exclusions_carry_a_count',
    (capsule?.excluded ?? []).every((e) => Number.isInteger(e.count) && e.count > 0),
    'a refusal states how much was refused without saying what');
  record('O6/exclusions_hold_no_identifier',
    (capsule?.excluded ?? []).every((e) => !Object.hasOwn(e, 'ref') && !Object.hasOwn(e, 'entity_id')));

  forbid('O6', 'denied_ref_in_included_refs', includedIds.some((id) => denied.has(id)));
  forbid('O6', 'denied_ref_anywhere_in_the_returned_object', leakError !== null,
    leakError ? `${leakError.code}` : '');
  forbid('O6', 'denial_not_stated_at_all',
    !exclusionReasons.some((r) => String(r).startsWith('acl_denied')),
    `reasons: ${exclusionReasons.join(',')}`);
  forbid('O6', 'exclusion_without_a_reason', (capsule?.excluded ?? []).some((e) => !e.reason));
  forbid('O6', 'silent_empty_capsule',
    capsule !== null && includedIds.length === 0 && (capsule.excluded ?? []).length === 0);

  // Positive control for the rejection family: with nothing denied, the same graph yields the
  // material and no acl exclusion, so the rule discriminates rather than always refusing.
  const permitted = selectCapsule(capsuleSelector(), graph, () => true);
  record('O6/positive_control_permitted_material_is_returned',
    permitted.included_refs.map((r) => r.entity_id).includes('src_hop1_denied')
      && !permitted.excluded.some((e) => String(e.reason).startsWith('acl_denied')));

  const unauthorizedPresent = includedIds.filter((id) => denied.has(id)).length + (leakError ? 1 : 0);
  record('O6/metric', unauthorizedPresent === 0, `${o.metric} = ${unauthorizedPresent}, threshold == 0`);
}

// ---------------------------------------------------------------- O7 wrong project

{
  const o = specOf('O7_wrong_project');
  const base = {
    request_id: 'rq-1', idempotency_key: 'idem-1', caller_identity: 'person-1', caller_role: 'engineer',
    caller_authority_ceiling: 'read', project_binding_ref: 'pb-alpha', accepted_context_generation: 1,
    engine_binding_revision: 'eb-1', module_binding_revision: 'mb-1',
    operation: 'read_snapshot', requested_ceiling: 'read', known_at_boundary: T,
  };
  const current = { project_binding_ref: 'pb-alpha', accepted_context_generation: 1, engine_binding_revision: 'eb-1', module_binding_revision: 'mb-1' };

  let mismatchError = null;
  try { admitRequest({ ...base, project_binding_ref: 'pb-bravo' }, current); } catch (e) { mismatchError = e; }
  record('O7/project_mismatch_refused', mismatchError instanceof ContractError);
  record('O7/refusal_states_a_reason', typeof mismatchError?.code === 'string' && mismatchError.code.length > 0,
    `code ${mismatchError?.code}`);

  // A cache entry from another project must not serve this request even on a colliding query.
  const alphaKey = cacheKey({ ...current, operation: 'read_snapshot', query: 'same-question' });
  const bravoKey = cacheKey({ ...current, project_binding_ref: 'pb-bravo', operation: 'read_snapshot', query: 'same-question' });
  record('O7/cache_keys_differ_by_project', alphaKey !== bravoKey,
    'isolation is structural, not a filter applied after reading');

  let cacheError = null;
  try {
    assertCacheEntryServesRequest(
      { project_binding_ref: 'pb-bravo', accepted_context_generation: 1, payload: { ref: 'bravo_secret_ref' } },
      base,
    );
  } catch (e) { cacheError = e; }
  record('O7/cross_project_cache_entry_rejected', cacheError instanceof ContractError);

  // The capsule side of the same rule. Refusing the request envelope is not enough if the
  // selector will happily walk into another binding once it is inside.
  const seed = capsuleRef('src_seed');
  const alphaHop = capsuleRef('src_alpha_hop');
  const bravoHop = capsuleRef('src_bravo_only');
  const mixedGraph = {
    edges: [
      capsuleEdge({ edge_id: 'e-alpha', from_ref: seed, to_ref: alphaHop }),
      // Multi-hop: reachable only by traversing an alpha edge first, then a bravo one.
      capsuleEdge({
        edge_id: 'e-bravo', edge_type: 'extracted_by', from_type: 'source_revision', to_type: 'extraction_run',
        from_ref: alphaHop, to_ref: bravoHop, project_binding_ref: 'pb-bravo',
      }),
    ],
    nodes: [
      { ref: seed, project_binding_ref: 'pb-alpha' },
      { ref: alphaHop, project_binding_ref: 'pb-alpha' },
      { ref: bravoHop, project_binding_ref: 'pb-bravo' },
    ],
  };
  const alphaCapsule = selectCapsule(capsuleSelector(), mixedGraph, () => true);
  const alphaIds = alphaCapsule.included_refs.map((r) => r.entity_id);
  record('O7/multi_hop_foreign_edge_not_traversed', !alphaIds.includes('src_bravo_only'),
    'a bravo edge at hop two does not put bravo material in an alpha capsule');
  record('O7/foreign_edge_refusal_stated',
    alphaCapsule.excluded.some((e) => e.reason === 'project_binding_mismatch'));
  record('O7/alpha_material_still_returned', alphaIds.includes('src_alpha_hop'),
    'the refusal is targeted, not a blanket empty result');

  // Mixed binding at the node level: the edge claims alpha, the node says bravo.
  const mixedNodes = {
    edges: [capsuleEdge({ edge_id: 'e-alpha', from_ref: seed, to_ref: alphaHop })],
    nodes: [
      { ref: seed, project_binding_ref: 'pb-alpha' },
      { ref: alphaHop, project_binding_ref: 'pb-bravo' },
    ],
  };
  const nodeCapsule = selectCapsule(capsuleSelector(), mixedNodes, () => true);
  record('O7/foreign_node_behind_a_local_edge_refused',
    nodeCapsule.included_refs.length === 0
      && nodeCapsule.excluded.some((e) => e.reason === 'project_binding_mismatch'));

  let capsuleLeak = null;
  try {
    assertNoForbiddenIdentifier(alphaCapsule, ['pb-bravo', 'src_bravo_only']);
    assertNoForbiddenIdentifier(nodeCapsule, ['pb-bravo']);
  } catch (e) { capsuleLeak = e; }
  record('O7/no_bravo_identifier_in_an_alpha_capsule', capsuleLeak === null);

  const output = JSON.stringify({
    admit: mismatchError?.code ?? null, cache: cacheError?.code ?? null, key: alphaKey,
  });
  const bravoLeak = ['pb-bravo', 'bravo_secret_ref'].filter((str) => output.includes(str)).length
    + (capsuleLeak ? 1 : 0);
  forbid('O7', 'bravo_material_in_an_alpha_result', bravoLeak > 0, `leaked ${bravoLeak}`);
  forbid('O7', 'cross_project_cache_hit_served', cacheError === null);
  forbid('O7', 'bravo_ref_reachable_by_traversal', alphaIds.includes('src_bravo_only'));
  forbid('O7', 'silent_empty_result_instead_of_a_stated_refusal',
    mismatchError === null || cacheError === null
      || !alphaCapsule.excluded.some((e) => e.reason === 'project_binding_mismatch'));
  record('O7/metric', bravoLeak === 0, `${o.metric} = ${bravoLeak}, threshold == 0`);
}

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);
for (const v of violations) console.error(`FORBIDDEN  ${v.oracle}  ${v.forbidden}  ${v.detail}`);

const byOracle = Object.fromEntries(spec.oracles.map((o) => {
  const prefix = o.id.split('_')[0];
  const mine = results.filter((r) => r.id.startsWith(`${prefix}/`));
  return [o.id, { checks: mine.length, failed: mine.filter((r) => !r.ok).length }];
}));

console.log(JSON.stringify({
  slice: 'phase_2_synthetic_oracles',
  spec_digest: actualDigest,
  spec_frozen_before_implementation: declaredDigest === actualDigest && spec.status === 'FROZEN_BEFORE_IMPLEMENTATION',
  result: failures.length === 0 && violations.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  forbidden_output_violations: violations.length,
  violations,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  by_oracle: byOracle,
  verification_strength: 'author_written_spec_frozen_before_implementation',
  honest_limits: spec.honest_limits,
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 && violations.length === 0 ? 0 : 1);
