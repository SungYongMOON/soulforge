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
} from '../../../core/validators/graph.mjs';
import {
  selectCapsule, contextCapsuleFingerprint, assertNoRawPayload, assertNoForbiddenIdentifier,
  MAX_HOPS_CEILING, RANKING_KEYS, REQUIRED_BUDGETS, EXCLUSION_REASONS,
} from '../../../core/validators/capsule.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

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
  project_binding_ref: 'binding-alpha',
};
const edge = (o) => ({ ...baseEdge, ...o });

// ---------------------------------------------------------------- typed edges

expectOk('1C/EDGE/allowed_shape', () => validateEdge(baseEdge), 'a whitelisted shape validates');
record('1C/EDGE/shapes_declared', EDGE_SHAPES.length >= 15 && NODE_TYPES.length >= 12, `${EDGE_SHAPES.length} shapes, ${NODE_TYPES.length} node types`);
record('1C/EDGE/attributes_declared', REQUIRED_EDGE_ATTRIBUTES.length === 15, `${REQUIRED_EDGE_ATTRIBUTES.length} required attributes`);
expectThrow('1C/EDGE/binding_required',
  () => { const e = edge({}); delete e.project_binding_ref; validateEdge(e); },
  'an edge with no project binding cannot be checked for cross-project reach and is refused');
expectThrow('1C/EDGE/binding_must_not_be_empty',
  () => validateEdge(edge({ project_binding_ref: '' })),
  'an empty binding is present as a key and says nothing, which is the same hole');
expectThrow('1C/EDGE/binding_must_be_a_string',
  () => validateEdge(edge({ project_binding_ref: 7 })),
  'a binding that is not a name cannot be compared to the selector');

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

// The node set is part of the projection slice, not an optional extra: it is the only
// independent witness to which project a node belongs to, and without it every edge's binding
// claim is self-certifying.
const alphaNodes = [
  { ref: seed, project_binding_ref: 'binding-alpha' },
  { ref: mid, project_binding_ref: 'binding-alpha' },
  { ref: leaf, project_binding_ref: 'binding-alpha' },
];

const graph = {
  edges: [
    edge({ edge_id: 'e-hop1', edge_type: 'has_revision', from_type: 'source', from_ref: seed, to_type: 'source_revision', to_ref: mid }),
    edge({ edge_id: 'e-hop2', edge_type: 'extracted_by', from_type: 'source_revision', from_ref: mid, to_type: 'extraction_run', to_ref: leaf, known_at: T(3) }),
  ],
  nodes: alphaNodes,
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
  const deniedAtHop = capsule.excluded.some((e) => e.reason === 'acl_denied_at_hop' && e.hop === 2 && e.count === 1);
  record('1C/ACL/hop2_target_excluded', !includedIds.includes('exrun-1'), 'a hop-2 target the requester may not see is not included');
  record('1C/ACL/hop2_denial_reported', deniedAtHop, 'the hop-2 denial is reported with a reason and a count rather than silently dropped');
  record('1C/ACL/hop1_still_included', includedIds.includes('srev-1'), 'permitted hop-1 material is still selected');
  // The denial is stated without restating what was denied.
  expectOk('1C/ACL/denied_identifier_absent_recursively',
    () => assertNoForbiddenIdentifier(capsule, ['exrun-1']),
    'the denied identifier survives nowhere in the returned capsule, exclusions included');
  record('1C/ACL/exclusions_carry_no_ref',
    capsule.excluded.every((e) => !Object.hasOwn(e, 'ref')),
    'an exclusion carries a reason, a hop and a count, never the refused identifier');
}

// ---------------------------------------------------------------- project binding isolation
//
// A capsule bound to one project must not reach another's material, and the check has to be
// on the way in. Filtering afterwards means the other project's edges were already read.

{
  // hop 2 belongs to another binding: reachable in the graph, refused by the selector.
  const mixed = {
    edges: [
      graph.edges[0],
      edge({ ...graph.edges[1], project_binding_ref: 'binding-bravo' }),
    ],
    nodes: alphaNodes,
  };
  const capsule = selectCapsule(selector, mixed, allowAll);
  const includedIds = capsule.included_refs.map((r) => r.entity_id);
  record('1C/BIND/foreign_hop2_edge_not_traversed', !includedIds.includes('exrun-1'),
    'a hop-2 edge asserted under another binding does not put its target in an alpha capsule');
  record('1C/BIND/foreign_edge_reported',
    capsule.excluded.some((e) => e.reason === 'project_binding_mismatch'),
    'the cross-binding refusal is stated');
  record('1C/BIND/own_binding_survives', includedIds.includes('srev-1'),
    'material in the requested binding is still selected');
  expectOk('1C/BIND/foreign_identifier_absent',
    () => assertNoForbiddenIdentifier(capsule, ['binding-bravo', 'exrun-1']),
    'neither the foreign binding nor its target appears anywhere in the capsule');
}
{
  // The node itself belongs to another binding even though the edge claims this one.
  const declaredNodes = [
    { ref: seed, project_binding_ref: 'binding-alpha' },
    { ref: mid, project_binding_ref: 'binding-alpha' },
    { ref: leaf, project_binding_ref: 'binding-bravo' },
  ];
  const capsule = selectCapsule(selector, { ...graph, nodes: declaredNodes }, allowAll);
  record('1C/BIND/foreign_node_refused',
    !capsule.included_refs.map((r) => r.entity_id).includes('exrun-1')
      && capsule.excluded.some((e) => e.reason === 'project_binding_mismatch'),
    'an alpha-bound edge pointing at a bravo node does not smuggle the node in');
}
// Fail closed, and loudly: once the projection declares node bindings, a node the traversal
// reaches but the set does not declare refuses the whole selection.
//
// This used to be an exclusion. An exclusion is a statement about material whose scope the
// selector knows and is declining to hand over, and that is not what an undeclared node is:
// the slice cannot say which project it belongs to, so the isolation claim the capsule carries
// is unproven for the whole result, not merely for that ref. Omitting it left a capsule that
// still asserted `every_returned_ref_bound_to_the_selector: true` over a walk that had passed
// through a node nothing vouched for.
expectThrow('1C/BIND/undeclared_node_refuses_the_selection',
  () => selectCapsule(selector, { ...graph, nodes: [{ ref: seed, project_binding_ref: 'binding-alpha' }, { ref: mid, project_binding_ref: 'binding-alpha' }] }, allowAll),
  'a node absent from a declared node set refuses the capsule, rather than being dropped as an exclusion');
expectThrow('1C/BIND/undeclared_seed_refuses_the_selection',
  () => selectCapsule(sel({ seed_refs: [ref('src-elsewhere', 'src-elsewhere-r1')] }), graph, allowAll),
  'a seed is a traversed node too; an undeclared one puts the whole walk on an unwitnessed footing');
{
  // A seed is the one traversed ref that is not an edge endpoint, so it is the case the
  // pre-pass cannot reach and the traversal-time resolver still has to answer. A selector
  // seeded with the declared subject revision but different bytes is the same forgery entering
  // by the one door the pre-pass does not cover.
  const forgedSeed = { ...seed, content_id: 'c-src-1-r1-forged' };
  let error = null;
  try { selectCapsule(sel({ seed_refs: [forgedSeed] }), graph, allowAll); } catch (e) { error = e; }
  record('1C/BIND/forged_seed_content_id_refused',
    error?.code === 'CAPSULE_NODE_IDENTITY_MISMATCH',
    error ? error.code : 'NOT REFUSED — a forged seed was admitted');
}
{
  let error = null;
  try {
    selectCapsule(selector, { ...graph, nodes: [{ ref: seed, project_binding_ref: 'binding-alpha' }, { ref: mid, project_binding_ref: 'binding-alpha' }] }, allowAll);
  } catch (e) { error = e; }
  // The refusal locates the fault — which edge, which end, or which hop — and does not restate
  // the ref it refused. Asserted over the serialised error rather than against one exact detail
  // shape, so it keeps holding when the fault is located differently.
  const serialised = `${error?.message ?? ''}${JSON.stringify(error?.detail ?? {})}`;
  record('1C/BIND/undeclared_node_names_no_identifier',
    error?.code === 'CAPSULE_NODE_NOT_DECLARED'
      && !['exrun-1', 'exrun-1-r1', 'c-exrun-1-r1'].some((id) => serialised.includes(id)),
    'the refusal locates the fault without restating the ref it refused');
}
record('1C/BIND/unknown_binding_is_no_longer_an_exclusion_reason',
  !EXCLUSION_REASONS.includes('project_binding_unknown'),
  'an unwitnessed node is a broken slice, not excluded material, so the reason is gone from the closed list');

// ---------------------------------------------------------------- the complete identity tuple
//
// Every one of these passed while refs were keyed on entity_id and revision_id alone. The
// declared node vouches for bytes; matching on the name let an edge collect that vouching for
// content the node set had never seen.

{
  // A forged edge target: same subject revision as the declared leaf, different content id.
  const forgedTarget = { ...leaf, content_id: 'c-exrun-1-forged' };
  const forged = {
    edges: [graph.edges[0], edge({ ...graph.edges[1], to_ref: forgedTarget })],
    nodes: alphaNodes,
  };
  let error = null;
  try { selectCapsule(selector, forged, allowAll); } catch (e) { error = e; }
  record('1C/ID/forged_target_content_id_refused',
    error?.code === 'CAPSULE_NODE_IDENTITY_MISMATCH',
    'an edge naming the declared subject revision but different bytes contradicts the slice and refuses it');
}
{
  // The same attack, asked the way it actually matters: the forged content id must not reach
  // the caller. A capsule is not returned at all, so there is nothing for it to appear in.
  const forgedTarget = { ...leaf, content_id: 'c-exrun-1-forged' };
  const forged = {
    edges: [graph.edges[0], edge({ ...graph.edges[1], to_ref: forgedTarget })],
    nodes: alphaNodes,
  };
  let capsule = null;
  try { capsule = selectCapsule(selector, forged, allowAll); } catch { /* refused, which is the point */ }
  record('1C/ID/forged_target_content_id_never_reaches_included_refs',
    capsule === null,
    'no capsule is produced, so the forged content id cannot appear in included_refs');
}
// ---------------------------------------------------------------- every supplied edge, both ends
//
// A forged edge *source* was skipped rather than reported: it did not match the frontier, so the
// walk moved on in silence. That is fine right up until the forged edge is the only way out of
// the seed, at which point a self-contradictory projection returned a successful, empty capsule
// and the caller read it as "there was nothing here". Both endpoints of every supplied edge are
// now resolved against the node set before the walk starts.

{
  // The reproduced attack: the hop-1 edge leaves bytes the node set never declared, so the walk
  // has nowhere to go. This used to return `{ included_refs: [], excluded: [] }` and no error.
  const forgedSeedEdge = {
    edges: [edge({ ...graph.edges[0], from_ref: { ...seed, content_id: 'c-src-1-r1-forged' } }), graph.edges[1]],
    nodes: alphaNodes,
  };
  let capsule = null;
  let error = null;
  try { capsule = selectCapsule(selector, forgedSeedEdge, allowAll); } catch (e) { error = e; }
  record('1C/ID/forged_source_on_the_only_seed_edge_is_not_an_empty_capsule',
    capsule === null && error?.code === 'CAPSULE_NODE_IDENTITY_MISMATCH',
    capsule
      ? `returned a capsule with ${capsule.included_refs.length} refs and ${capsule.excluded.length} exclusions instead of refusing`
      : `${error?.code} — a broken slice and an empty answer are different answers`);
  record('1C/ID/forged_source_refusal_names_the_edge_and_the_endpoint',
    error?.detail?.edge_id === 'e-hop1' && error.detail.endpoint === 'from_ref',
    'the refusal says which edge and which end, and does not restate the ref');
}
{
  // The same forgery one hop further in: previously it was skipped and hop one still returned,
  // so the capsule looked complete while an edge of its own projection did not resolve.
  const forgedSource = { ...mid, content_id: 'c-srev-1-forged' };
  const forged = {
    edges: [graph.edges[0], edge({ ...graph.edges[1], from_ref: forgedSource })],
    nodes: alphaNodes,
  };
  let error = null;
  try { selectCapsule(selector, forged, allowAll); } catch (e) { error = e; }
  record('1C/ID/forged_source_content_id_refuses_the_projection',
    error?.code === 'CAPSULE_NODE_IDENTITY_MISMATCH' && error.detail?.endpoint === 'from_ref',
    'an edge leaving different bytes than any declared node is refused, not skipped');
}
expectThrow('1C/ID/undeclared_edge_source_refused',
  () => selectCapsule(selector, {
    edges: [graph.edges[0], edge({ ...graph.edges[1], from_ref: ref('srev-elsewhere', 'srev-elsewhere-r1') })],
    nodes: alphaNodes,
  }, allowAll),
  'an edge leaving a node the slice never declared cannot be placed in any project');
expectThrow('1C/ID/undeclared_edge_target_refused',
  () => selectCapsule(selector, {
    edges: [graph.edges[0], edge({ ...graph.edges[1], to_ref: ref('exrun-elsewhere', 'exrun-elsewhere-r1') })],
    nodes: alphaNodes,
  }, allowAll),
  'an edge target the slice never declared cannot be placed in any project');
{
  // The check covers edges the traversal would never follow. An edge is part of the projection
  // whether or not this selector walks it, and a slice that cannot place both ends of one of its
  // own edges is not a slice whose isolation can be checked.
  const unreachable = edge({
    edge_id: 'e-unreachable', edge_type: 'supersedes',
    from_type: 'source_revision', from_ref: ref('srev-orphan', 'srev-orphan-r1'),
    to_type: 'source_revision', to_ref: mid,
  });
  let error = null;
  try { selectCapsule(selector, { edges: [...graph.edges, unreachable], nodes: alphaNodes }, allowAll); } catch (e) { error = e; }
  record('1C/ID/untraversed_edge_endpoints_are_still_checked',
    error?.code === 'CAPSULE_NODE_NOT_DECLARED' && error.detail?.edge_id === 'e-unreachable',
    'an edge nothing reaches is still an edge this projection asserts');
}
{
  // Positive control for the pre-pass: a policy exclusion still needs a fully declared, fully
  // bound endpoint, so an excluded node is excluded rather than turning into a refusal.
  const g = { edges: [graph.edges[0], edge({ ...graph.edges[1], applicability: false })], nodes: alphaNodes };
  const capsule = selectCapsule(selector, g, allowAll);
  record('1C/ID/policy_exclusion_survives_the_endpoint_prepass',
    capsule.included_refs.map((r) => r.entity_id).join(',') === 'srev-1'
      && capsule.excluded.some((e) => e.reason === 'applicability_false'),
    'a declared, bound endpoint excluded by policy is still an exclusion, not a broken slice');
}
{
  // And the ACL case, for the same reason: the denied node is declared and bound, so the
  // refusal belongs in the closed exclusion list rather than refusing the whole selection.
  const capsule = selectCapsule(selector, graph, (r) => r.entity_id !== 'exrun-1');
  record('1C/ID/acl_denial_survives_the_endpoint_prepass',
    capsule.excluded.some((e) => e.reason === 'acl_denied_at_hop')
      && !capsule.included_refs.some((r) => r.entity_id === 'exrun-1'),
    'an ACL denial over a fully bound declared node stays an exclusion');
}
{
  // Positive control for the whole pre-pass: the untouched slice still selects both hops.
  const capsule = selectCapsule(selector, graph, allowAll);
  record('1C/ID/every_edge_endpoint_declared_positive_control',
    capsule.included_refs.length === 2 && capsule.excluded.length === 0,
    'a slice whose every edge endpoint is declared is selected exactly as before');
}
expectThrow('1C/ID/duplicate_node_declaration_refused',
  () => selectCapsule(selector, { edges: graph.edges, nodes: [...alphaNodes, { ref: leaf, project_binding_ref: 'binding-alpha' }] }, allowAll),
  'the same subject revision declared twice has no single answer, even when both declarations agree');
{
  // The one that mattered: a second declaration of the same logical node under another binding.
  // With last-write-wins, the bravo row simply replaced the alpha row — or the reverse, purely
  // on input order — and cross-project isolation turned on the order of an array.
  let error = null;
  try {
    selectCapsule(selector, {
      edges: graph.edges,
      nodes: [...alphaNodes, { ref: leaf, project_binding_ref: 'binding-bravo' }],
    }, allowAll);
  } catch (e) { error = e; }
  record('1C/ID/duplicate_node_binding_is_not_last_write_wins',
    error?.code === 'CAPSULE_NODE_DECLARED_TWICE',
    'two declarations of one node with different bindings refuse the slice instead of one overwriting the other');
}
{
  // Duplicate logical node differing in content id: the same refusal, and the detail says which.
  let error = null;
  try {
    selectCapsule(selector, {
      edges: graph.edges,
      nodes: [...alphaNodes, { ref: { ...leaf, content_id: 'c-exrun-1-other' }, project_binding_ref: 'binding-alpha' }],
    }, allowAll);
  } catch (e) { error = e; }
  record('1C/ID/duplicate_node_content_id_refused',
    error?.code === 'CAPSULE_NODE_DECLARED_TWICE' && error.detail?.differs_in_content_id === true,
    'a second declaration naming different bytes is refused and the refusal says the two disagree on content');
}
expectThrow('1C/ID/declared_node_needs_the_full_tuple',
  () => selectCapsule(selector, {
    edges: graph.edges,
    nodes: [{ ref: { entity_id: 'src-1', revision_id: 'src-1-r1', content_id: 'c-src-1-r1' }, project_binding_ref: 'binding-alpha' }, ...alphaNodes.slice(1)],
  }, allowAll),
  'a node declared without its hash algorithm is not an exact ref and cannot be matched on identity');
{
  // Positive control for the whole tuple rule: nothing above narrows the legitimate case.
  const capsule = selectCapsule(selector, graph, allowAll);
  record('1C/ID/fully_bound_two_hop_positive_control',
    capsule.included_refs.length === 2
      && capsule.traversed_node_count === 3
      && capsule.every_returned_ref_bound_to_the_selector === true
      && capsule.included_refs.every((r) => r.content_id === `c-${r.revision_id}`)
      && capsule.excluded.length === 0,
    `${capsule.included_refs.length} refs over two hops, every content id the declared one, no exclusions`);
}
expectThrow('1C/BIND/invalid_edge_refuses_the_whole_selection',
  () => selectCapsule(selector, { edges: [graph.edges[0], { edge_id: 'e-broken' }], nodes: alphaNodes }, allowAll),
  'a capsule is not selected over a projection slice holding an edge that fails validation');
{
  // Edge validation and the endpoint pre-pass answer different questions, and this case is the
  // one that keeps them apart: every endpoint here is declared and bound, so the pre-pass has
  // nothing to say, and the edge is still refused on its own contract. Without it, disabling
  // edge validation would go unnoticed because the malformed fixture above happens to trip the
  // endpoint check instead.
  let error = null;
  try {
    selectCapsule(selector, {
      edges: [graph.edges[0], edge({ ...graph.edges[1], authority_family: 'vendor_blog' })],
      nodes: alphaNodes,
    }, allowAll);
  } catch (e) { error = e; }
  record('1C/BIND/invalid_edge_with_declared_endpoints_still_refused',
    error?.code === 'CAPSULE_EDGE_INVALID' && error.detail?.cause_code === 'GRAPH_EDGE_AUTHORITY_UNKNOWN',
    error ? `${error.code} / ${error.detail?.cause_code}` : 'NOT REFUSED');
}

// ---------------------------------------------------------------- the node set is mandatory
//
// While the node set was optional, omitting it turned every edge binding into its own only
// witness. These cases are the ones that used to pass: a slice with no node set at all, a node
// carrying no binding, and an edge whose asserted binding disagrees with the nodes it joins.

expectThrow('1C/BIND/node_set_is_required',
  () => selectCapsule(selector, { edges: graph.edges }, allowAll),
  'no node set means no independent witness to which project the material belongs to');
expectThrow('1C/BIND/node_set_may_not_be_a_non_array',
  () => selectCapsule(selector, { edges: graph.edges, nodes: {} }, allowAll),
  'a node set that is not a set of nodes is not a node set');
expectThrow('1C/BIND/declared_node_needs_a_binding',
  () => selectCapsule(selector, { edges: graph.edges, nodes: [{ ref: seed }, { ref: mid, project_binding_ref: 'binding-alpha' }] }, allowAll),
  'an unbound node cannot be checked for cross-project reach');
expectThrow('1C/BIND/declared_node_binding_must_not_be_empty',
  () => selectCapsule(selector, { edges: graph.edges, nodes: [{ ref: seed, project_binding_ref: '' }, ...alphaNodes.slice(1)] }, allowAll),
  'an empty binding is present as a key and says nothing');
expectThrow('1C/BIND/declared_node_needs_an_exact_ref',
  () => selectCapsule(selector, { edges: graph.edges, nodes: [{ ref: { entity_id: 'src-1' }, project_binding_ref: 'binding-alpha' }, ...alphaNodes.slice(1)] }, allowAll),
  'a node identified by entity alone cannot be matched to the revision an edge points at');

{
  // Forged binding: the edge claims alpha, and the node it points at is declared bravo. The
  // edge alone would certify itself; the node set is what catches it.
  const forged = {
    edges: graph.edges,
    nodes: [alphaNodes[0], alphaNodes[1], { ref: leaf, project_binding_ref: 'binding-bravo' }],
  };
  const capsule = selectCapsule(selector, forged, allowAll);
  record('1C/BIND/forged_edge_binding_refused',
    !capsule.included_refs.map((r) => r.entity_id).includes('exrun-1')
      && capsule.excluded.some((e) => e.reason === 'project_binding_mismatch'),
    'an alpha-asserted edge cannot vouch for a node the projection declares as bravo');
  expectOk('1C/BIND/forged_target_absent_from_the_output',
    () => assertNoForbiddenIdentifier(capsule, ['exrun-1', 'binding-bravo']),
    'the refused node and the foreign binding survive nowhere in the returned capsule');
}
{
  // Multi-hop: the foreign material is reachable only after one legitimate alpha hop, which is
  // the shape a seed-only filter misses entirely.
  const twoHop = {
    edges: graph.edges,
    nodes: [alphaNodes[0], alphaNodes[1], { ref: leaf, project_binding_ref: 'binding-bravo' }],
  };
  const capsule = selectCapsule(selector, twoHop, allowAll);
  record('1C/BIND/multi_hop_cross_project_stops_at_hop_one',
    capsule.included_refs.map((r) => r.entity_id).join(',') === 'srev-1',
    'hop one is alpha and is kept; hop two is bravo and is not reached');
}
{
  // Positive control: fully bound, and the capsule says so about every ref it returns.
  const capsule = selectCapsule(selector, graph, allowAll);
  record('1C/BIND/fully_bound_positive_control',
    capsule.every_returned_ref_bound_to_the_selector === true
      && capsule.included_refs.length === 2
      && capsule.traversed_node_count === 3
      && !capsule.excluded.some((e) => e.reason.startsWith('project_binding')),
    `${capsule.included_refs.length} refs returned, ${capsule.traversed_node_count} nodes traversed`);
}
{
  const capsule = selectCapsule(selector, graph, allowAll);
  record('1C/SEL/two_hops_reached', capsule.included_refs.map((r) => r.entity_id).includes('exrun-1'), 'two hops are reachable when permitted');
  record('1C/SEL/carries_uncertainty', capsule.carries_contradiction_and_unknown === true, 'contradiction and unknown travel with the capsule');
  record('1C/SEL/ranking_recorded', capsule.ranking.method === 'deterministic', 'the capsule records how it was ranked');
}
{
  // an edge whose applicability is unresolved is excluded with a stated reason
  const g2 = { edges: [graph.edges[0], edge({ ...graph.edges[1], applicability: 'unknown' })], nodes: alphaNodes };
  const capsule = selectCapsule(selector, g2, allowAll);
  record('1C/SEL/unknown_applicability_excluded_with_reason',
    capsule.excluded.some((e) => e.reason === 'applicability_unknown'), 'unresolved applicability is reported, not hidden');
}
{
  // top_k budget must report what it dropped
  const capsule = selectCapsule(sel({ budgets: { ...selector.budgets, top_k: 1 } }), graph, allowAll);
  record('1C/SEL/top_k_drop_reported', capsule.included_refs.length === 1 && capsule.excluded.some((e) => e.reason === 'top_k_budget' && e.count === 1),
    'budget-driven exclusion states its reason');
}
{
  const g3 = { edges: [graph.edges[0], edge({ ...graph.edges[1], edge_type: 'supersedes', from_type: 'source_revision', to_type: 'source_revision' })], nodes: alphaNodes };
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
