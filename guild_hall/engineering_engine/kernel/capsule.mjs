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
// 3. What was left out is reported with a reason. A capsule that silently drops evidence
//    is indistinguishable from one where the evidence never existed.

import { createHash } from 'node:crypto';
import { canonicalise, compareCodePoints, inspectInstant } from './canonical.mjs';
import { CANONICAL } from './contract_config.mjs';
import { AUTHORITY_FAMILIES, APPLICABILITY } from './authority.mjs';
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
});

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
 * @param graph     { edges: [...] } already-validated projection slice
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

  const allowed = new Set(selector.traversal.allowlisted_edge_types);
  const included = [];
  const excluded = [];
  const seenNodes = new Set();

  const admit = (ref, hop, reasonIfDenied) => {
    const key = `${ref.entity_id}@${ref.revision_id}`;
    if (seenNodes.has(key)) return false;
    // ACL at this hop, not only at the seed
    if (!aclCheck(ref, hop)) { excluded.push({ ref: key, hop, reason: reasonIfDenied ?? 'acl_denied_at_hop' }); return false; }
    seenNodes.add(key);
    return true;
  };

  let frontier = [];
  for (const ref of selector.seed_refs) {
    if (admit(ref, 0, 'acl_denied_at_seed')) frontier.push({ ref, hop: 0 });
  }

  const candidates = [];
  for (let hop = 1; hop <= selector.traversal.max_hops; hop++) {
    const next = [];
    for (const { ref } of frontier) {
      for (const edge of graph.edges) {
        if (edge.from_ref?.entity_id !== ref.entity_id || edge.from_ref?.revision_id !== ref.revision_id) continue;
        if (!allowed.has(edge.edge_type)) { excluded.push({ ref: edge.edge_id, hop, reason: 'edge_type_not_allowlisted' }); continue; }
        if (edge.applicability !== true) {
          // kept visible as an exclusion reason rather than silently dropped
          excluded.push({ ref: edge.edge_id, hop, reason: `applicability_${String(edge.applicability)}` });
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
  for (const dropped of ranked.slice(selector.budgets.top_k)) {
    excluded.push({ ref: `${dropped.ref.entity_id}@${dropped.ref.revision_id}`, hop: dropped.hop, reason: 'top_k_budget' });
  }
  if (kept.length > selector.budgets.max_nodes) {
    throw new ContractError(CODES.BUDGET_MISSING, 'selected node count exceeds max_nodes; budgets are inconsistent');
  }
  included.push(...kept);

  return {
    selector_contract_version: SELECTOR_CONTRACT_VERSION,
    included_refs: included
      .map((c) => ({ entity_id: c.ref.entity_id, revision_id: c.ref.revision_id, content_id: c.ref.content_id, via_edge_id: c.via_edge_id, hop: c.hop }))
      .sort((a, b) => compareCodePoints(a.revision_id, b.revision_id)),
    excluded: excluded.sort((a, b) => compareCodePoints(a.ref + a.reason, b.ref + b.reason)),
    // Contradiction, unknown, and missing evidence travel with the capsule. Dropping them
    // would make the capsule look more certain than the evidence is.
    carries_contradiction_and_unknown: true,
    ranking: { method: 'deterministic', keys: [...RANKING_KEYS] },
  };
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
