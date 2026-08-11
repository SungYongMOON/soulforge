// Lane 1C — bounded Context Capsule selector and context_capsule_fingerprint.
//
// An agent never receives a whole project or corpus. It receives a capsule: a bounded set
// of pointers, hashes, and short evidence spans selected by a declared, deterministic
// procedure. Three properties make that safe rather than merely smaller.
//
// 1. The ACL filter runs at every hop, not once on the seed. Filtering only the starting
//    set is the classic leak: hop two reaches material the requester may not see.
// 2. Ranking is deterministic. No embedding, no learned reranker. Ties break on declared
//    keys so the same inputs always select the same evidence.
// 3. What was left out is reported with a reason, and with a reason only. Naming the
//    refused identifier inside the exclusion hands back exactly what the ACL refused to
//    disclose, so an exclusion carries a closed reason, the hop and a count. The identifier
//    does not survive anywhere in the returned object.
// 4. Every edge is validated, and every traversed edge and node has to belong to the
//    selector's project binding. Filtering by binding after traversal is already too late:
//    the other project's material has been read by then.
// 5. The complete node set is mandatory. An edge carries the binding it was *asserted* under,
//    which is a claim by whoever wrote the edge; a node set carries the binding the material
//    itself belongs to. When the node set was optional, a projection slice could simply omit
//    it and every binding claim in the slice became self-certifying — a forged edge binding
//    was then indistinguishable from a true one, and cross-project isolation rested on the
//    honesty of the thing being checked. So: no node set, no capsule. Both endpoints of every
//    traversed edge must be declared, both must agree with the selector, and both must agree
//    with the binding the edge itself claims.
// 6. A node the traversal reaches but the node set does not declare refuses the whole
//    selection. It used to be dropped as an exclusion, which reads as "there was material we
//    would not show you" — but that is not what happened. What happened is that the slice
//    cannot say which project the node belongs to, so the isolation property this selector
//    claims is unproven for every ref it returns, not just for that one. An incomplete
//    witness set is a broken projection, and the answer to a broken projection is no capsule.
// 7. Refs are matched on the complete exact-ref identity tuple, content id included. Matching
//    on entity and revision alone let an edge point at "the same node" while naming different
//    bytes, and the declared node then vouched for content it had never seen. For the same
//    reason a node set may not declare one logical node twice: a second declaration silently
//    replaced the first, so whichever binding or content came last won.
// 8. Both endpoints of every supplied edge are resolved against the node set before the walk
//    begins, not when the walk happens to reach them. Resolving them on the way meant a
//    contradictory edge was skipped rather than reported, and an edge that was the only way
//    out of the seed turned a broken projection into a successful, empty capsule. "Nothing
//    matched" and "this slice does not hold together" are different answers to the caller.

import { createHash } from 'node:crypto';
import { canonicalise, compareCodePoints, inspectInstant } from './canonical.mjs';
import { CANONICAL } from './contract_config.mjs';
import { AUTHORITY_FAMILIES, APPLICABILITY } from './authority.mjs';
import { exactRefIdentityKey, logicalRevisionKey } from './identity.mjs';
import { validateEdge } from './graph.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  SELECTOR_FIELD_MISSING: 'CAPSULE_SELECTOR_FIELD_MISSING',
  HOP_LIMIT_EXCEEDED: 'CAPSULE_HOP_LIMIT_EXCEEDED',
  EDGE_TYPE_NOT_ALLOWLISTED: 'CAPSULE_EDGE_TYPE_NOT_ALLOWLISTED',
  BUDGET_MISSING: 'CAPSULE_BUDGET_MISSING',
  RANKING_NOT_DETERMINISTIC: 'CAPSULE_RANKING_NOT_DETERMINISTIC',
  WHOLE_CORPUS_REQUESTED: 'CAPSULE_WHOLE_CORPUS_REQUESTED',
  ACL_SCOPE_VIOLATION: 'CAPSULE_ACL_SCOPE_VIOLATION',
  PROJECT_BINDING_MISMATCH: 'CAPSULE_PROJECT_BINDING_MISMATCH',
  EDGE_INVALID: 'CAPSULE_EDGE_INVALID',
  NODE_SET_MISSING: 'CAPSULE_NODE_SET_MISSING',
  NODE_BINDING_MISSING: 'CAPSULE_NODE_BINDING_MISSING',
  NODE_NOT_DECLARED: 'CAPSULE_NODE_NOT_DECLARED',
  NODE_DECLARED_TWICE: 'CAPSULE_NODE_DECLARED_TWICE',
  NODE_IDENTITY_MISMATCH: 'CAPSULE_NODE_IDENTITY_MISMATCH',
});

/**
 * Exclusion reasons. Closed, because an exclusion is the only thing a capsule says about
 * material it refused, and a free-text reason would be the obvious place for the refused
 * identifier to reappear.
 */
// `project_binding_unknown` is deliberately absent. An exclusion says "this exists and you are
// not getting it", which is a statement the selector can only make about material whose scope
// it actually knows. A node with no declared binding is not excluded material; it is a hole in
// the witness set, and it refuses the selection instead (see CODES.NODE_NOT_DECLARED).
export const EXCLUSION_REASONS = Object.freeze([
  'acl_denied_at_seed', 'acl_denied_at_hop',
  'project_binding_mismatch',
  'edge_type_not_allowlisted', 'applicability_false', 'applicability_unknown',
  'top_k_budget',
]);

export const SELECTOR_CONTRACT_VERSION = 'capsule-selector-v0';

// V1.2 bounds traversal at one to two hops. Beyond that the capsule stops being bounded
// and starts being a corpus.
export const MAX_HOPS_CEILING = 2;

export const REQUIRED_SELECTOR_FIELDS = Object.freeze([
  'project_binding_ref', 'scope', 'accepted_context_generation',
  'valid_at', 'known_at',
  'acl_filter_revision', 'source_family_filter',
  'seed_refs', 'traversal', 'ranking', 'budgets',
  'graph_projection_revision',
]);

export const REQUIRED_BUDGETS = Object.freeze(['top_k', 'max_nodes', 'max_edges', 'max_sources', 'max_evidence_chars']);

// Ranking keys, applied in order. Every key is a declared property of the candidate, so
// the order is reproducible. Learned relevance has no entry here by design.
export const RANKING_KEYS = Object.freeze(['authority_rank', 'applicability', 'revision_recency', 'ref_lexicographic']);

const AUTHORITY_RANK = new Map(AUTHORITY_FAMILIES.map((f) => [f.key, f.rank]));

function assertSelector(selector) {
  if (selector === null || typeof selector !== 'object' || Array.isArray(selector)) {
    throw new ContractError(CODES.SELECTOR_FIELD_MISSING, 'selector is not an object');
  }
  for (const f of REQUIRED_SELECTOR_FIELDS) {
    if (!Object.hasOwn(selector, f)) throw new ContractError(CODES.SELECTOR_FIELD_MISSING, `selector field "${f}" is missing`);
  }
  for (const t of ['valid_at', 'known_at']) {
    if (!inspectInstant(selector[t]).valid) throw new ContractError(CODES.SELECTOR_FIELD_MISSING, `selector ${t} is not a canonical instant`);
  }
  if (!Number.isInteger(selector.accepted_context_generation) || selector.accepted_context_generation < 0) {
    throw new ContractError(CODES.SELECTOR_FIELD_MISSING, 'accepted_context_generation must be a non-negative integer');
  }
  if (!Array.isArray(selector.seed_refs) || selector.seed_refs.length === 0) {
    throw new ContractError(CODES.SELECTOR_FIELD_MISSING, 'seed_refs must be a non-empty array');
  }

  const { traversal, ranking, budgets } = selector;
  if (!Number.isInteger(traversal?.max_hops) || traversal.max_hops < 1) {
    throw new ContractError(CODES.SELECTOR_FIELD_MISSING, 'traversal.max_hops must be a positive integer');
  }
  if (traversal.max_hops > MAX_HOPS_CEILING) {
    throw new ContractError(CODES.HOP_LIMIT_EXCEEDED, `max_hops ${traversal.max_hops} exceeds the bound of ${MAX_HOPS_CEILING}`);
  }
  if (!Array.isArray(traversal.allowlisted_edge_types) || traversal.allowlisted_edge_types.length === 0) {
    throw new ContractError(CODES.EDGE_TYPE_NOT_ALLOWLISTED, 'traversal.allowlisted_edge_types must be a non-empty allowlist');
  }
  if (ranking?.method !== 'deterministic') {
    throw new ContractError(CODES.RANKING_NOT_DETERMINISTIC, 'capsule ranking must be deterministic; learned relevance is not permitted here');
  }
  if (JSON.stringify(ranking.keys) !== JSON.stringify([...RANKING_KEYS])) {
    throw new ContractError(CODES.RANKING_NOT_DETERMINISTIC, 'ranking.keys must be the declared ordered key list', { expected: [...RANKING_KEYS] });
  }
  for (const b of REQUIRED_BUDGETS) {
    if (!Number.isInteger(budgets?.[b]) || budgets[b] < 1) {
      throw new ContractError(CODES.BUDGET_MISSING, `budgets.${b} must be a positive integer`);
    }
  }
  return true;
}

/** Comparator implementing RANKING_KEYS in order. Total, so selection is reproducible. */
export function compareCandidates(a, b) {
  const ar = AUTHORITY_RANK.get(a.authority_family) ?? Number.MAX_SAFE_INTEGER;
  const br = AUTHORITY_RANK.get(b.authority_family) ?? Number.MAX_SAFE_INTEGER;
  if (ar !== br) return ar - br;
  const score = (v) => (v === true ? 0 : v === APPLICABILITY.UNKNOWN ? 1 : 2);
  if (score(a.applicability) !== score(b.applicability)) return score(a.applicability) - score(b.applicability);
  // more recent revision first, by known_at descending
  const t = compareCodePoints(b.known_at ?? '', a.known_at ?? '');
  if (t !== 0) return t;
  return compareCodePoints(a.ref?.revision_id ?? '', b.ref?.revision_id ?? '');
}

/**
 * Selects a capsule by bounded traversal.
 *
 * @param selector  declared selection procedure, validated before use
 * @param graph     { edges: [...], nodes: [{ ref, project_binding_ref }] } projection slice.
 *                  Both are required. Every edge is validated here rather than assumed valid,
 *                  and every ref the traversal touches must be declared in the node set with
 *                  a binding that matches the selector.
 * @param aclCheck  (ref, hop) => boolean, consulted at EVERY hop
 */
export function selectCapsule(selector, graph, aclCheck) {
  assertSelector(selector);
  if (selector.scope === 'whole_corpus' || selector.scope === 'all_projects') {
    throw new ContractError(CODES.WHOLE_CORPUS_REQUESTED, 'a capsule is bounded by construction; a whole corpus is not a capsule');
  }
  if (typeof aclCheck !== 'function') {
    throw new ContractError(CODES.ACL_SCOPE_VIOLATION, 'an ACL check must be supplied and is applied at every hop');
  }

  // The projection slice is validated before it is walked. An edge that fails its own
  // contract cannot be trusted to carry a binding or an authority claim either, so the whole
  // selection is refused rather than run over a partly checked graph.
  const edges = Array.isArray(graph?.edges) ? graph.edges : null;
  if (edges === null) throw new ContractError(CODES.EDGE_INVALID, 'graph.edges must be an array');
  for (const edge of edges) {
    try {
      validateEdge(edge);
    } catch (e) {
      throw new ContractError(CODES.EDGE_INVALID,
        'a capsule cannot be selected over an edge that fails edge validation',
        { edge_id: edge?.edge_id ?? null, cause_code: e?.code ?? null });
    }
  }

  // Node bindings. An edge says which binding it was asserted under; a node set says which
  // binding the node itself belongs to. Both must agree with the selector, because an alpha
  // bound edge pointing at a bravo node is exactly the shape of a cross-project leak.
  //
  // The node set is required, not optional. Omitting it used to mean "trust the edges", which
  // makes a forged edge binding unfalsifiable: the only witness to a node's project is the
  // edge that wants to reach it. A slice that cannot say which project its nodes belong to is
  // a slice whose isolation cannot be checked, so no capsule is selected over it.
  const declaredNodes = Array.isArray(graph?.nodes) ? graph.nodes : null;
  if (declaredNodes === null) {
    throw new ContractError(CODES.NODE_SET_MISSING,
      'graph.nodes is required; without the complete node set an edge binding is self-certifying and cross-project reach cannot be checked');
  }
  //
  // Keyed on the complete identity tuple, and cross-indexed by the weaker subject-and-revision
  // key so that a *contradiction* in the slice can be told apart from a simple absence. Both
  // maps are built with `set` on a key that has been checked for absence first: the previous
  // build wrote straight into the map, so a second declaration of the same node overwrote the
  // first and the last binding written won. Two declarations of one node — whether they differ
  // in binding, in content id, or in nothing at all — mean the slice does not have a single
  // answer to "which project is this", and a selector cannot pick one on its behalf.
  const nodeBinding = new Map();
  const nodeByLogicalKey = new Map();
  for (const n of declaredNodes) {
    const key = exactRefIdentityKey(n?.ref);
    if (key === null) {
      throw new ContractError(CODES.EDGE_INVALID,
        'a declared node must carry a complete exact revision ref; a node identified by less than the full tuple cannot be matched to what an edge points at');
    }
    if (typeof n.project_binding_ref !== 'string' || !n.project_binding_ref) {
      throw new ContractError(CODES.NODE_BINDING_MISSING,
        'a declared node must carry a project_binding_ref; an unbound node cannot be checked for cross-project reach');
    }
    const logical = logicalRevisionKey(n.ref);
    if (nodeByLogicalKey.has(logical)) {
      throw new ContractError(CODES.NODE_DECLARED_TWICE,
        'the node set declares the same subject revision more than once; a repeated declaration has no single binding or content, and taking the last one silently picks a winner',
        { differs_in_content_id: nodeByLogicalKey.get(logical) !== key });
    }
    nodeByLogicalKey.set(logical, key);
    nodeBinding.set(key, n.project_binding_ref);
  }

  // Every supplied edge, both endpoints, before the walk starts.
  //
  // Checking endpoints only where the traversal happens to reach them left a fail-open: an
  // edge whose `from_ref` named the declared subject revision but different bytes simply did
  // not match the frontier, so it was skipped in silence. When that edge was the only way out
  // of the seed, the result was a *successful, empty* capsule — the consumer read "there was
  // nothing here" from a projection that was in fact self-contradictory. An empty answer and a
  // broken slice have to be distinguishable, so the slice is checked as a whole rather than
  // along whichever path the walk took.
  //
  // This is also why it covers edges the traversal would never touch. An edge is part of the
  // projection whether or not this selector follows it, and a slice that cannot place both
  // ends of one of its own edges in its own node set is not a slice whose isolation can be
  // checked at all.
  for (const edge of edges) {
    for (const [end, ref] of [['from_ref', edge.from_ref], ['to_ref', edge.to_ref]]) {
      const key = exactRefIdentityKey(ref);
      if (key !== null && nodeBinding.has(key)) continue;
      const endpointLogicalKey = logicalRevisionKey(ref);
      if (endpointLogicalKey !== null && nodeByLogicalKey.has(endpointLogicalKey)) {
        throw new ContractError(CODES.NODE_IDENTITY_MISMATCH,
          `an edge ${end} names the same subject revision as a declared node but different content; the node set vouches for bytes, not for names, so this projection contradicts itself`,
          { edge_id: edge.edge_id, endpoint: end });
      }
      throw new ContractError(CODES.NODE_NOT_DECLARED,
        `an edge ${end} is not in the declared node set; the projection cannot say which project that endpoint belongs to, so no capsule is selected over it`,
        { edge_id: edge.edge_id, endpoint: end });
    }
  }

  const allowed = new Set(selector.traversal.allowlisted_edge_types);
  const included = [];
  const exclusions = [];
  const seenNodes = new Set();
  const exclude = (hop, reason) => {
    if (!EXCLUSION_REASONS.includes(reason)) {
      throw new ContractError(CODES.EDGE_INVALID, `"${reason}" is not a declared exclusion reason`);
    }
    exclusions.push({ hop, reason });
  };

  /**
   * Resolves one ref against the declared node set, on the complete identity tuple.
   *
   * Three outcomes, and the two failures are different faults rather than degrees of the same
   * one. A ref whose subject revision is declared but whose content id is not the declared one
   * is a contradiction *inside* the slice: something is pointing at bytes the witness never
   * vouched for, which is exactly the shape of a forged endpoint. A ref that is not declared at
   * all means the witness set is incomplete. Neither can be answered by excluding that one ref,
   * because both say the slice cannot support the isolation claim the capsule would carry.
   */
  const resolveDeclaredNode = (ref, hop) => {
    const key = exactRefIdentityKey(ref);
    if (key !== null && nodeBinding.has(key)) return key;
    const logical = logicalRevisionKey(ref);
    if (logical !== null && nodeByLogicalKey.has(logical)) {
      throw new ContractError(CODES.NODE_IDENTITY_MISMATCH,
        'a traversed ref names the same subject revision as a declared node but different content; the node set vouches for bytes, not for names, so this slice contradicts itself',
        { hop });
    }
    throw new ContractError(CODES.NODE_NOT_DECLARED,
      'the traversal reached a ref the node set does not declare; an undeclared node has no witness to which project it belongs to, so the whole selection is refused rather than one ref quietly omitted',
      { hop });
  };

  /**
   * Node level binding check, over a key already resolved against the node set.
   *
   * Two checks together cover the forged binding, and neither covers it alone. This one says
   * the node itself belongs here; the edge check below says the edge was asserted here. An
   * edge claiming alpha while pointing at a node the projection declares as bravo fails here;
   * an edge claiming bravo between two alpha nodes fails there.
   */
  const nodeBindingVerdict = (key) => (nodeBinding.get(key) === selector.project_binding_ref
    ? 'ok'
    : 'project_binding_mismatch');

  const admit = (ref, hop, deniedReason) => {
    const key = resolveDeclaredNode(ref, hop);
    if (seenNodes.has(key)) return false;
    const binding = nodeBindingVerdict(key);
    if (binding !== 'ok') { exclude(hop, binding); return false; }
    // ACL at this hop, not only at the seed
    if (!aclCheck(ref, hop)) { exclude(hop, deniedReason ?? 'acl_denied_at_hop'); return false; }
    seenNodes.add(key);
    return true;
  };

  let frontier = [];
  for (const ref of selector.seed_refs) {
    // A seed is a traversed node too. Admitting one the node set does not declare would put the
    // whole walk on an unwitnessed footing before the first hop.
    if (admit(ref, 0, 'acl_denied_at_seed')) frontier.push({ ref, hop: 0 });
  }

  const candidates = [];
  for (let hop = 1; hop <= selector.traversal.max_hops; hop++) {
    const next = [];
    for (const { ref } of frontier) {
      const fromKey = exactRefIdentityKey(ref);
      for (const edge of edges) {
        // Matched on the whole tuple. An edge leaving "the same" subject revision but naming
        // different bytes is not an edge out of this node, and reading it as one was how a
        // forged endpoint attached itself to a legitimately admitted frontier.
        if (exactRefIdentityKey(edge.from_ref) !== fromKey) continue;
        // The binding is checked before the edge is read for anything else, so material from
        // another binding is never ranked, counted or pointed at.
        if (edge.project_binding_ref !== selector.project_binding_ref) { exclude(hop, 'project_binding_mismatch'); continue; }
        if (!allowed.has(edge.edge_type)) { exclude(hop, 'edge_type_not_allowlisted'); continue; }
        if (edge.applicability !== true) {
          // kept visible as an exclusion reason rather than silently dropped
          exclude(hop, edge.applicability === APPLICABILITY.UNKNOWN ? 'applicability_unknown' : 'applicability_false');
          continue;
        }
        if (!admit(edge.to_ref, hop)) continue;
        const candidate = {
          ref: edge.to_ref, via_edge_id: edge.edge_id, hop,
          authority_family: edge.authority_family, applicability: edge.applicability,
          known_at: edge.known_at, evidence_claim_ceiling: edge.evidence_claim_ceiling,
        };
        candidates.push(candidate);
        next.push({ ref: edge.to_ref, hop });
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  const ranked = [...candidates].sort(compareCandidates);
  const kept = ranked.slice(0, selector.budgets.top_k);
  for (const dropped of ranked.slice(selector.budgets.top_k)) exclude(dropped.hop, 'top_k_budget');
  if (kept.length > selector.budgets.max_nodes) {
    throw new ContractError(CODES.BUDGET_MISSING, 'selected node count exceeds max_nodes; budgets are inconsistent');
  }
  included.push(...kept);

  // Exclusions are aggregated to (reason, hop, count). A refusal has to be stated, because a
  // silent empty capsule is indistinguishable from "there was nothing", but stating it must
  // not return the identifier the refusal was about.
  const grouped = new Map();
  for (const e of exclusions) {
    const key = `${e.reason}|${e.hop}`;
    grouped.set(key, { reason: e.reason, hop: e.hop, count: (grouped.get(key)?.count ?? 0) + 1 });
  }

  // Last line of defence, over the refs that are actually about to be handed back. Everything
  // above should already have made this unreachable; that is exactly why it is worth keeping,
  // because "should already" is the assumption a leak lives in. A capsule that cannot prove
  // every returned ref is bound to the requested project is not returned at all.
  for (const c of included) {
    const key = exactRefIdentityKey(c.ref);
    if (key === null || !nodeBinding.has(key) || nodeBindingVerdict(key) !== 'ok') {
      throw new ContractError(CODES.PROJECT_BINDING_MISMATCH,
        'a selected ref is not declared, on its full identity tuple, under the requested project binding; the capsule is refused rather than returned',
        { hop: c.hop });
    }
  }

  return {
    selector_contract_version: SELECTOR_CONTRACT_VERSION,
    project_binding_ref: selector.project_binding_ref,
    // Stated so a consumer does not have to infer it: every returned ref, and every node the
    // traversal touched to reach one, was declared under this binding and no other.
    every_returned_ref_bound_to_the_selector: true,
    traversed_node_count: seenNodes.size,
    included_refs: included
      .map((c) => ({ entity_id: c.ref.entity_id, revision_id: c.ref.revision_id, content_id: c.ref.content_id, via_edge_id: c.via_edge_id, hop: c.hop }))
      .sort((a, b) => compareCodePoints(a.revision_id, b.revision_id)),
    excluded: [...grouped.values()].sort((a, b) => compareCodePoints(`${a.reason}|${a.hop}`, `${b.reason}|${b.hop}`)),
    excluded_count: exclusions.length,
    // Contradiction, unknown, and missing evidence travel with the capsule. Dropping them
    // would make the capsule look more certain than the evidence is.
    carries_contradiction_and_unknown: true,
    ranking: { method: 'deterministic', keys: [...RANKING_KEYS] },
  };
}

/**
 * Fails when any identifier from a forbidden set survives anywhere in a capsule.
 *
 * Checked recursively over the whole returned object, keys included. "It is only in the
 * exclusion list" is still disclosure of the thing the ACL refused to disclose.
 */
export function assertNoForbiddenIdentifier(capsule, forbiddenIds) {
  const forbidden = [...forbiddenIds].filter((f) => typeof f === 'string' && f.length > 0);
  const found = new Set();
  const walk = (node) => {
    if (typeof node === 'string') {
      for (const f of forbidden) if (node.includes(f)) found.add(f);
      return;
    }
    if (Array.isArray(node)) { for (const v of node) walk(v); return; }
    if (node !== null && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) { walk(k); walk(v); }
    }
  };
  walk(capsule);
  if (found.size > 0) {
    throw new ContractError(CODES.ACL_SCOPE_VIOLATION,
      'a forbidden identifier survived in the capsule output', { count: found.size });
  }
  return true;
}

/**
 * The capsule fingerprint.
 *
 * It hashes both the selection procedure and the selected result. Inputs alone would miss
 * a changed graph projection producing different evidence from the same selector; the
 * result alone would miss two different procedures happening to agree once. Because this
 * value feeds the snapshot fingerprint, a change in the evidence set has to be visible
 * there.
 */
export function contextCapsuleFingerprint(selector, capsule) {
  assertSelector(selector);
  const material = {
    selector_contract_version: SELECTOR_CONTRACT_VERSION,
    project_binding_ref: selector.project_binding_ref,
    scope: selector.scope,
    accepted_context_generation: selector.accepted_context_generation,
    valid_at: selector.valid_at,
    known_at: selector.known_at,
    acl_filter_revision: selector.acl_filter_revision,
    source_family_filter: [...selector.source_family_filter].sort(compareCodePoints),
    graph_projection_revision: selector.graph_projection_revision,
    traversal: {
      max_hops: selector.traversal.max_hops,
      allowlisted_edge_types: [...selector.traversal.allowlisted_edge_types].sort(compareCodePoints),
    },
    ranking: { method: selector.ranking.method, keys: [...selector.ranking.keys] },
    budgets: Object.fromEntries(REQUIRED_BUDGETS.map((b) => [b, selector.budgets[b]])),
    included_refs: capsule.included_refs,
    excluded_reasons: [...new Set(capsule.excluded.map((e) => e.reason))].sort(compareCodePoints),
  };
  const rules = {
    'source_family_filter': 'insertion_ordered',
    'traversal.allowlisted_edge_types': 'insertion_ordered',
    'ranking.keys': 'insertion_ordered',
    'included_refs': 'sorted_by:revision_id',
    'excluded_reasons': 'insertion_ordered',
  };
  return createHash(CANONICAL.hashAlgorithm)
    .update(`soulforge.se_engine.context_capsule.v0\n${SELECTOR_CONTRACT_VERSION}\n${canonicalise(material, rules)}`)
    .digest('hex');
}

/** Raw private spans are hydrated only at authorised runtime; the capsule holds pointers. */
export function assertNoRawPayload(capsule) {
  for (const r of capsule.included_refs ?? []) {
    if (Object.hasOwn(r, 'body') || Object.hasOwn(r, 'text') || Object.hasOwn(r, 'payload')) {
      throw new ContractError(CODES.WHOLE_CORPUS_REQUESTED, 'a capsule carries pointers and hashes, not raw payload', { ref: r.revision_id });
    }
  }
  return true;
}

export { validateEdge };
