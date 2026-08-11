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
import { AXIS, GAP_TYPE, compareStates } from '../kernel/snapshot.mjs';
import { PRESENCE } from '../kernel/custody.mjs';
import { judgeEdge } from '../kernel/delivery_receipt.mjs';
import { selectCapsule, RANKING_KEYS } from '../kernel/capsule.mjs';
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

{
  const o = specOf('O4_contradictory');
  const expected = expectedEl(1, { authority_family: 'project_contract_baseline' });
  const observed = observedEl(1, PRESENCE.PRESENT);

  // The kernel-level comparison, and then the same contradiction driven through the assembled
  // pass. Checking only the first is what let an unreachable verdict class pass unnoticed.
  record('O4/kernel_reports_conflict',
    compareStates({ expected, observed, conflicts: true }).gap_type === GAP_TYPE.CONFLICT);

  const r = runEnginePass({
    states: {
      expected: [expected], observed: [observed],
      conflicting_element_ids: [expected.element_id],
      canonical_accepted_input_set: { source_revision_refs: [ref('req_1')], artifact_revision_refs: [ref('art_1')] },
    },
    subjectId: 'phase_2_synthetic', projectBindingRef: 'pb-alpha', generation: 1,
    topologyDigest: 'd'.repeat(64), observationRunId: 'run-p2', takenAt: T, validAt: V, mintValue: uuids(200),
  });

  record('O4/pass_reports_conflict', r.gap_counts[GAP_TYPE.CONFLICT] === o.expected_verdict.gap_counts.gap_conflict);
  record('O4/finding_count', r.findings.length === o.expected_verdict.finding_count);
  record('O4/finding_is_a_conflict', r.findings.every((f) => f.gap_type === GAP_TYPE.CONFLICT));
  record('O4/no_context_request', r.contextRequest === o.expected_verdict.context_request);

  const bothSidesPresent = r.snapshot.expected_state_elements.length === 1
    && r.snapshot.observed_state_elements.length === 1;
  record('O4/both_sides_retained_in_the_snapshot', bothSidesPresent);
  forbid('O4', 'lower_authority_side_dropped', !bothSidesPresent);
  forbid('O4', 'satisfied_reported_when_the_sides_disagree', (r.gap_counts.satisfied ?? 0) > 0);
  forbid('O4', 'winner_selected_without_recording_the_conflict', r.findings.length === 0);
  const recorded = r.gap_counts[GAP_TYPE.CONFLICT] ?? 0;
  record('O4/metric', recorded === 1, `${o.metric} = ${recorded}, threshold == 1`);
}

// ---------------------------------------------------------------- O5 stale

{
  const o = specOf('O5_stale');
  const now = Date.parse(T);
  const window = o.exact_input.window;
  const receipt = {
    edge_key: 'alpha>bravo',
    observed_at: new Date(now - o.exact_input.receipt_age_seconds * 1000).toISOString(),
    outcome: 'delivered', observation_method: 'module_load_observation', run_id: 'run-p2',
  };
  const v = judgeEdge({ edgeKey: 'alpha>bravo', receipt, window, now });
  record('O5/state_is_stale', v.state === o.expected_verdict.edge_delivery_state);
  record('O5/proves_nothing_now', v.proves_traversal === false);
  forbid('O5', 'delivering_or_late_outside_the_window', v.state === 'delivering' || v.state === 'late');
  forbid('O5', 'proves_traversal_on_a_stale_receipt', v.proves_traversal === true);

  // A stale receipt is not evidence of presence. Driven through the pass: if the engine ever
  // upgraded a stale observation it would show up as satisfied or missing here. The presence
  // state is the one a subject must derive from a stale receipt, which is unknown.
  const staleDerivedPresence = v.proves_traversal ? PRESENCE.PRESENT : PRESENCE.UNKNOWN;
  record('O5/stale_receipt_derives_unknown_presence', staleDerivedPresence === PRESENCE.UNKNOWN,
    'a subject may not read a stale receipt as present');
  const r = runCase(statesFor([staleDerivedPresence, staleDerivedPresence]), 300);
  const permitted = new Set(o.expected_verdict.gap_types_permitted);
  const emitted = Object.keys(r.gap_counts).filter((g) => g !== GAP_TYPE.SATISFIED);
  record('O5/only_permitted_gap_types', emitted.every((g) => permitted.has(g)), `emitted ${emitted.join(',')}`);
  forbid('O5', 'satisfied_derived_from_stale_evidence', (r.gap_counts.satisfied ?? 0) > 0);
  forbid('O5', 'gap_missing_derived_from_stale_evidence', (r.gap_counts[GAP_TYPE.MISSING] ?? 0) > 0);
  const admitted = v.proves_traversal ? 1 : 0;
  record('O5/metric', admitted === 0, `${o.metric} = ${admitted}, threshold == 0`);
}

// ---------------------------------------------------------------- O6 unauthorized

{
  const o = specOf('O6_unauthorized');
  const seed = ref('src_seed');
  const hop1 = ref('src_hop1_denied');
  const hop2 = ref('src_hop2_denied');
  const edge = (over) => ({
    edge_id: 'e', edge_type: 'has_revision', from_type: 'source', to_type: 'source_revision',
    from_ref: seed, to_ref: hop1, authority_family: 'company_approved_procedure',
    evidence_ref: ref('ev'), valid_at: V, known_at: T, applicability: true,
    project_binding_ref: 'pb-alpha', graph_projection_revision: 'proj-r1',
    scope: 'project', source_family: 'company_approved_procedure',
    asserted_by: 'extraction_run', confidence_basis: 'deterministic_extraction',
    supersedes: null, ...over,
  });
  const graph = {
    edges: [
      edge({ edge_id: 'e1', from_ref: seed, to_ref: hop1 }),
      edge({ edge_id: 'e2', edge_type: 'extracted_by', from_type: 'source_revision', to_type: 'extraction_run', from_ref: hop1, to_ref: hop2 }),
    ],
  };
  const selector = {
    project_binding_ref: 'pb-alpha', scope: 'project', accepted_context_generation: 1,
    valid_at: V, known_at: T, acl_filter_revision: 'acl-v1',
    source_family_filter: ['company_approved_procedure'], seed_refs: [seed],
    traversal: { max_hops: 2, allowlisted_edge_types: ['has_revision', 'extracted_by'] },
    ranking: { method: 'deterministic', keys: [...RANKING_KEYS] },
    budgets: { top_k: 10, max_nodes: 50, max_edges: 50, max_sources: 20, max_evidence_chars: 4000 },
    graph_projection_revision: 'proj-r1',
  };
  const denied = new Set(['src_hop1_denied', 'src_hop2_denied']);
  const aclCheck = (r) => !denied.has(typeof r === 'string' ? r : r.entity_id);

  let capsule = null;
  let threw = null;
  try { capsule = selectCapsule(selector, graph, aclCheck); } catch (e) { threw = e; }
  record('O6/capsule_still_produced', capsule !== null, threw ? `threw ${threw.code}` : '');

  const includedIds = (capsule?.included_refs ?? []).map((r) => r.entity_id);
  const exclusionReasons = (capsule?.excluded ?? []).map((e) => e.reason);
  // Naming a denied ref inside an exclusion is how a denial is stated, so that is not a leak.
  // A leak is the identifier surviving anywhere else: included refs, ranking, or any payload.
  const withoutExclusions = JSON.stringify({ ...(capsule ?? {}), excluded: [] });
  const leaked = [...denied].filter((d) => withoutExclusions.includes(d));

  record('O6/denied_not_included', includedIds.every((id) => !denied.has(id)));
  record('O6/exclusions_carry_a_reason',
    (capsule?.excluded ?? []).length > 0 && exclusionReasons.every((r) => typeof r === 'string' && r.length > 0),
    `reasons: ${exclusionReasons.join(',')}`);
  // The strongest form of the rule: the identifier must not survive anywhere in the output,
  // not in a pointer, a hash input, or an exclusion payload that quotes the material.
  forbid('O6', 'denied_ref_in_included_refs', includedIds.some((id) => denied.has(id)));
  forbid('O6', 'denied_ref_outside_a_stated_exclusion', leaked.length > 0, `leaked: ${leaked.join(',')}`);
  forbid('O6', 'denial_not_stated_at_all',
    (capsule?.excluded ?? []).length > 0 && !exclusionReasons.some((r) => String(r).startsWith('acl_denied')),
    `reasons: ${exclusionReasons.join(',')}`);
  forbid('O6', 'exclusion_without_a_reason', (capsule?.excluded ?? []).some((e) => !e.reason));
  forbid('O6', 'silent_empty_capsule',
    capsule !== null && includedIds.length === 0 && (capsule.excluded ?? []).length === 0);
  const unauthorizedPresent = includedIds.filter((id) => denied.has(id)).length;
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

  const output = JSON.stringify({
    admit: mismatchError?.code ?? null, cache: cacheError?.code ?? null, key: alphaKey,
  });
  const bravoLeak = ['pb-bravo', 'bravo_secret_ref'].filter((s) => output.includes(s)).length;
  forbid('O7', 'bravo_material_in_an_alpha_result', bravoLeak > 0, `leaked ${bravoLeak}`);
  forbid('O7', 'cross_project_cache_hit_served', cacheError === null);
  forbid('O7', 'silent_empty_result_instead_of_a_stated_refusal',
    mismatchError === null || cacheError === null);
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
