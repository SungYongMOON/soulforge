#!/usr/bin/env node
// Lane 1C acceptance — typed graph edges and the bounded Context Capsule.
//
// VERIFICATION STRENGTH NOTICE
//
// The Phase 1-0 frozen oracle contains no 1C fixtures, so the expectations below were
// written by the same author as the implementation. That is weaker than the kernel
// conformance run, which is judged against an independently reviewed oracle. Lane 1V owes
// an independent locked fixture set for 1C, and this file states its own weakness rather
// than letting a green result imply more than it does.
//
// Read only. Writes nothing.

import {
  validateEdge, assertNotTruthOwner, projectionDescriptor, EDGE_SHAPES, NODE_TYPES, REQUIRED_EDGE_ATTRIBUTES,
} from '../kernel/graph.mjs';
import {
  selectCapsule, contextCapsuleFingerprint, assertNoRawPayload,
  MAX_HOPS_CEILING, RANKING_KEYS, REQUIRED_BUDGETS,
} from '../kernel/capsule.mjs';
import { ContractError } from '../kernel/errors.mjs';

const results = [];
const record = (id, ok, note) => results.push({ id, ok, note });
const expectThrow = (id, fn, note) => {
  let e = null;
  try { fn(); } catch (err) { e = err; }
  record(id, e instanceof ContractError, `${note}${e ? '' : ' — NOTHING THROWN'}`);
};
const expectOk = (id, fn, note) => {
  try { fn(); record(id, true, note); } catch (err) { record(id, false, `${note} — threw ${err.code ?? err.message}`); }
};

const ref = (e, r) => ({ entity_id: e, revision_id: r, content_id: `c-${r}`, content_hash_alg: 'sha256' });
const T = (d, h = '00') => `2026-0${d}-01T${h}:00:00.000Z`;

const baseEdge = {
  edge_id: 'edge-0001',
  edge_type: 'has_revision',
  from_type: 'source', from_ref: ref('src-1', 'src-1-r1'),
  to_type: 'source_revision', to_ref: ref('srev-1', 'srev-1-r1'),
  evidence_ref: ref('ev-1', 'ev-1-r1'),
  authority_family: 'company_approved_procedure',
  applicability: true,
  valid_at: T(1), known_at: T(2),
  review_state: 'reviewed',
  evidence_claim_ceiling: 'source_sufficient',
  generating_policy_revision: 'graph-policy-v0',
};
const edge = (o) => ({ ...baseEdge, ...o });

// ---------------------------------------------------------------- typed edges

expectOk('1C/EDGE/allowed_shape', () => validateEdge(baseEdge), 'a whitelisted shape validates');
record('1C/EDGE/shapes_declared', EDGE_SHAPES.length >= 15 && NODE_TYPES.length >= 12, `${EDGE_SHAPES.length} shapes, ${NODE_TYPES.length} node types`);
record('1C/EDGE/attributes_declared', REQUIRED_EDGE_ATTRIBUTES.length === 14, `${REQUIRED_EDGE_ATTRIBUTES.length} required attributes`);

expectThrow('1C/EDGE/shape_not_allowed',
  () => validateEdge(edge({ from_type: 'source', edge_type: 'has_revision', to_type: 'finding' })),
  'an endpoint type pair outside the whitelist is refused');
expectThrow('1C/EDGE/unknown_edge_type',
  () => validateEdge(edge({ edge_type: 'relates_to' })), 'an ad hoc edge type is refused');
expectThrow('1C/EDGE/unknown_node_type',
  () => validateEdge(edge({ from_type: 'spreadsheet' })), 'an ad hoc node type is refused');

for (const attr of ['edge_id', 'evidence_ref', 'applicability', 'generating_policy_revision', 'evidence_claim_ceiling']) {
  expectThrow(`1C/EDGE/missing_${attr}`, () => {
    const e = edge({}); delete e[attr]; validateEdge(e);
  }, `a missing ${attr} is refused`);
}

expectThrow('1C/EDGE/malformed_endpoint_ref',
  () => validateEdge(edge({ to_ref: { entity_id: 'x' } })), 'an endpoint that is not an exact revision ref is refused');
expectThrow('1C/EDGE/malformed_evidence_ref',
  () => validateEdge(edge({ evidence_ref: { entity_id: 'e', revision_id: 'r', content_id: 'c', content_hash_alg: 'md5' } })),
  'evidence with the wrong hash algorithm is refused');
expectThrow('1C/EDGE/known_before_valid',
  () => validateEdge(edge({ valid_at: T(3), known_at: T(1) })), 'known_at earlier than valid_at is refused');
expectThrow('1C/EDGE/non_instant_time',
  () => validateEdge(edge({ known_at: '2026-02-30T00:00:00.000Z' })), 'a non existent date is refused');
expectThrow('1C/EDGE/unregistered_authority',
  () => validateEdge(edge({ authority_family: 'vendor_blog' })), 'an unregistered authority family is refused');
expectThrow('1C/EDGE/invalid_claim_ceiling',
  () => validateEdge(edge({ evidence_claim_ceiling: 'pretty_sure' })), 'an invalid evidence ceiling is refused');
expectThrow('1C/EDGE/invalid_applicability',
  () => validateEdge(edge({ applicability: 'maybe' })), 'applicability must be true, false, or unknown');

// the authority ceiling: a derived edge may not outrank its own evidence
expectThrow('1C/EDGE/authority_exceeds_evidence',
  () => validateEdge(edge({ authority_family: 'project_contract_baseline' }), { evidenceAuthority: 'reviewed_wiki' }),
  'an edge claiming higher authority than its evidence is refused');
expectOk('1C/EDGE/authority_at_or_below_evidence',
  () => validateEdge(edge({ authority_family: 'reviewed_wiki' }), { evidenceAuthority: 'project_contract_baseline' }),
  'an edge claiming equal or lower authority than its evidence is allowed');

{
  const r = validateEdge(edge({ applicability: 'unknown' }));
  record('1C/EDGE/unknown_applicability_not_traversable', r.traversable_for_authoritative_conclusion === false,
    'an edge with unresolved applicability exists but carries no authoritative conclusion');
}

expectThrow('1C/GRAPH/not_truth_owner', () => assertNotTruthOwner('store the accepted project baseline'),
  'the graph refuses to be asked for truth ownership');
expectThrow('1C/GRAPH/projection_needs_source_refs',
  () => projectionDescriptor({ projectionRevision: 'p1', generatedFromRefs: [] }), 'a projection must name what it was built from');
{
  const d = projectionDescriptor({ projectionRevision: 'p1', generatedFromRefs: ['b', 'a'], policyRevision: 'pol1' });
  record('1C/GRAPH/projection_rebuildable', d.rebuildable === true && d.is_truth_owner === false && d.generated_from_refs[0] === 'a',
    'a projection declares itself rebuildable, not authoritative, with sorted source refs');
}

// ---------------------------------------------------------------- capsule selector

const seed = ref('src-1', 'src-1-r1');
const mid = ref('srev-1', 'srev-1-r1');
const leaf = ref('exrun-1', 'exrun-1-r1');

const graph = {
  edges: [
    edge({ edge_id: 'e-hop1', edge_type: 'has_revision', from_type: 'source', from_ref: seed, to_type: 'source_revision', to_ref: mid }),
    edge({ edge_id: 'e-hop2', edge_type: 'extracted_by', from_type: 'source_revision', from_ref: mid, to_type: 'extraction_run', to_ref: leaf, known_at: T(3) }),
  ],
};

const selector = {
  project_binding_ref: 'binding-alpha',
  scope: 'project',
  accepted_context_generation: 4,
  valid_at: T(1), known_at: T(4),
  acl_filter_revision: 'acl-v3',
  source_family_filter: ['company_approved_procedure', 'reviewed_wiki'],
  seed_refs: [seed],
  traversal: { max_hops: 2, allowlisted_edge_types: ['has_revision', 'extracted_by'] },
  ranking: { method: 'deterministic', keys: [...RANKING_KEYS] },
  budgets: { top_k: 10, max_nodes: 50, max_edges: 50, max_sources: 20, max_evidence_chars: 4000 },
  graph_projection_revision: 'proj-r7',
};
const sel = (o) => ({ ...selector, ...o });
const allowAll = () => true;

expectOk('1C/SEL/valid_selector', () => selectCapsule(selector, graph, allowAll), 'a fully declared selector runs');

for (const f of ['seed_refs', 'budgets', 'graph_projection_revision', 'acl_filter_revision', 'traversal']) {
  expectThrow(`1C/SEL/missing_${f}`, () => {
    const s = sel({}); delete s[f]; selectCapsule(s, graph, allowAll);
  }, `a missing selector field "${f}" is refused`);
}
expectThrow('1C/SEL/hop_limit', () => selectCapsule(sel({ traversal: { max_hops: 3, allowlisted_edge_types: ['has_revision'] } }), graph, allowAll),
  `max_hops above ${MAX_HOPS_CEILING} is refused`);
expectThrow('1C/SEL/empty_edge_allowlist', () => selectCapsule(sel({ traversal: { max_hops: 1, allowlisted_edge_types: [] } }), graph, allowAll),
  'an empty edge allowlist is refused');
expectThrow('1C/SEL/learned_ranking', () => selectCapsule(sel({ ranking: { method: 'embedding_similarity', keys: [...RANKING_KEYS] } }), graph, allowAll),
  'learned relevance is not permitted in the selector');
expectThrow('1C/SEL/ranking_keys_changed', () => selectCapsule(sel({ ranking: { method: 'deterministic', keys: ['authority_rank'] } }), graph, allowAll),
  'the ranking key list must be the declared ordered list');
for (const b of REQUIRED_BUDGETS) {
  expectThrow(`1C/SEL/missing_budget_${b}`, () => {
    const s = sel({ budgets: { ...selector.budgets } }); delete s.budgets[b]; selectCapsule(s, graph, allowAll);
  }, `a missing budget "${b}" is refused`);
}
expectThrow('1C/SEL/whole_corpus', () => selectCapsule(sel({ scope: 'whole_corpus' }), graph, allowAll),
  'a whole corpus request is not a capsule');
expectThrow('1C/SEL/acl_check_required', () => selectCapsule(selector, graph, null),
  'an ACL check must be supplied');

// THE LEAK TEST: ACL must be applied at every hop, not only on the seed.
{
  const denyLeaf = (r) => r.entity_id !== 'exrun-1';
  const capsule = selectCapsule(selector, graph, denyLeaf);
  const includedIds = capsule.included_refs.map((r) => r.entity_id);
  const deniedAtHop = capsule.excluded.some((e) => e.ref.startsWith('exrun-1') && e.reason === 'acl_denied_at_hop');
  record('1C/ACL/hop2_target_excluded', !includedIds.includes('exrun-1'), 'a hop-2 target the requester may not see is not included');
  record('1C/ACL/hop2_denial_reported', deniedAtHop, 'the hop-2 denial is reported with a reason rather than silently dropped');
  record('1C/ACL/hop1_still_included', includedIds.includes('srev-1'), 'permitted hop-1 material is still selected');
}
{
  const capsule = selectCapsule(selector, graph, allowAll);
  record('1C/SEL/two_hops_reached', capsule.included_refs.map((r) => r.entity_id).includes('exrun-1'), 'two hops are reachable when permitted');
  record('1C/SEL/carries_uncertainty', capsule.carries_contradiction_and_unknown === true, 'contradiction and unknown travel with the capsule');
  record('1C/SEL/ranking_recorded', capsule.ranking.method === 'deterministic', 'the capsule records how it was ranked');
}
{
  // an edge whose applicability is unresolved is excluded with a stated reason
  const g2 = { edges: [graph.edges[0], edge({ ...graph.edges[1], applicability: 'unknown' })] };
  const capsule = selectCapsule(selector, g2, allowAll);
  record('1C/SEL/unknown_applicability_excluded_with_reason',
    capsule.excluded.some((e) => e.reason === 'applicability_unknown'), 'unresolved applicability is reported, not hidden');
}
{
  // top_k budget must report what it dropped
  const capsule = selectCapsule(sel({ budgets: { ...selector.budgets, top_k: 1 } }), graph, allowAll);
  record('1C/SEL/top_k_drop_reported', capsule.included_refs.length === 1 && capsule.excluded.some((e) => e.reason === 'top_k_budget'),
    'budget-driven exclusion states its reason');
}
{
  const g3 = { edges: [graph.edges[0], edge({ ...graph.edges[1], edge_type: 'supersedes', from_type: 'source_revision', to_type: 'source_revision' })] };
  const capsule = selectCapsule(sel({ traversal: { max_hops: 2, allowlisted_edge_types: ['has_revision'] } }), g3, allowAll);
  record('1C/SEL/non_allowlisted_edge_excluded', capsule.excluded.some((e) => e.reason === 'edge_type_not_allowlisted'),
    'an edge type outside the traversal allowlist is excluded with a reason');
}

// ---------------------------------------------------------------- capsule fingerprint

{
  const capsule = selectCapsule(selector, graph, allowAll);
  const fp = contextCapsuleFingerprint(selector, capsule);
  record('1C/FP/stable', contextCapsuleFingerprint(selector, capsule) === fp, 'the same selector and capsule fingerprint identically');

  const fpProjection = contextCapsuleFingerprint(sel({ graph_projection_revision: 'proj-r8' }), capsule);
  record('1C/FP/projection_revision_changes_it', fpProjection !== fp, 'a different graph projection revision changes the fingerprint');

  const fpGeneration = contextCapsuleFingerprint(sel({ accepted_context_generation: 5 }), capsule);
  record('1C/FP/generation_changes_it', fpGeneration !== fp, 'a different accepted generation changes the fingerprint');

  const fpBudget = contextCapsuleFingerprint(sel({ budgets: { ...selector.budgets, top_k: 3 } }), capsule);
  record('1C/FP/budget_changes_it', fpBudget !== fp, 'a different budget changes the fingerprint');

  const narrower = selectCapsule(sel({ budgets: { ...selector.budgets, top_k: 1 } }), graph, allowAll);
  record('1C/FP/included_set_changes_it', contextCapsuleFingerprint(selector, narrower) !== fp,
    'a different included set changes the fingerprint even with the same selector');

  const denied = selectCapsule(selector, graph, (r) => r.entity_id !== 'exrun-1');
  record('1C/FP/exclusion_reasons_change_it', contextCapsuleFingerprint(selector, denied) !== fp,
    'a different exclusion reason set changes the fingerprint');

  record('1C/FP/hex64', /^[0-9a-f]{64}$/.test(fp), 'the fingerprint is a sha256 hex digest');
}

expectThrow('1C/FP/raw_payload_refused',
  () => assertNoRawPayload({ included_refs: [{ revision_id: 'r1', body: 'secret text' }] }),
  'a capsule carrying raw payload instead of pointers is refused');
expectOk('1C/FP/pointer_only_ok',
  () => assertNoRawPayload({ included_refs: [{ revision_id: 'r1', content_id: 'c-r1' }] }), 'a pointer-only capsule is accepted');

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  lane: '1C_graph_typed_edge_and_bounded_context_capsule',
  defines: ['typed_node_and_edge_whitelist', 'edge_temporal_and_authority_validation', 'bounded_capsule_selector', 'context_capsule_fingerprint'],
  verification_strength: 'author_written_fixtures',
  verification_caveat: 'the Phase 1-0 frozen oracle has no 1C cases; lane 1V owes an independent locked fixture set before this counts as independently verified',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
