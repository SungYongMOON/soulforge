// Lane 1C — typed graph edges with temporal and authority validation.
//
// The graph is a rebuildable projection, never a truth owner. It connects existing
// contracts so a judgement can be traced; it does not hold the source. Two consequences
// shape this module:
//
// 1. Every edge is typed at both ends. An untyped edge would let a claim attach to
//    anything, which is how a navigation aid turns into an accidental ontology.
// 2. An edge cannot assert more authority than the evidence it rests on. Without that
//    ceiling, a derived edge could outrank the document it was derived from.

import { inspectInstant, compareCodePoints } from './canonical.mjs';
import { classifyRef, RESOLUTION } from './identity.mjs';
import { AUTHORITY_FAMILIES, APPLICABILITY } from './authority.mjs';
import { isEvidenceCeiling } from './ceilings.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  NODE_TYPE_UNKNOWN: 'GRAPH_NODE_TYPE_UNKNOWN',
  EDGE_TYPE_UNKNOWN: 'GRAPH_EDGE_TYPE_UNKNOWN',
  ENDPOINT_TYPE_NOT_ALLOWED: 'GRAPH_ENDPOINT_TYPE_NOT_ALLOWED',
  ENDPOINT_REF_MALFORMED: 'GRAPH_ENDPOINT_REF_MALFORMED',
  EDGE_ATTRIBUTE_MISSING: 'GRAPH_EDGE_ATTRIBUTE_MISSING',
  EDGE_TIME_INVALID: 'GRAPH_EDGE_TIME_INVALID',
  EDGE_AUTHORITY_UNKNOWN: 'GRAPH_EDGE_AUTHORITY_UNKNOWN',
  EDGE_AUTHORITY_EXCEEDS_EVIDENCE: 'GRAPH_EDGE_AUTHORITY_EXCEEDS_EVIDENCE',
  EDGE_CLAIM_CEILING_INVALID: 'GRAPH_EDGE_CLAIM_CEILING_INVALID',
  EDGE_POLICY_MISSING: 'GRAPH_EDGE_POLICY_MISSING',
  EDGE_BINDING_MISSING: 'GRAPH_EDGE_BINDING_MISSING',
  GRAPH_AS_TRUTH_OWNER: 'GRAPH_AS_TRUTH_OWNER',
});

// Node types are closed. A new kind of thing needs a contract change, not an ad hoc label.
export const NODE_TYPES = Object.freeze([
  'source', 'source_revision', 'extraction_run', 'evidence_locator',
  'claim', 'rule', 'wiki_revision',
  'artifact', 'artifact_revision',
  'expected_state_element', 'observed_state_element',
  'finding', 'context_request', 'snapshot',
]);

// The typed edge whitelist. Each row is (from_type, edge_type, to_type). Anything not
// listed is refused, which is what keeps the projection small and reviewable.
export const EDGE_SHAPES = Object.freeze([
  // knowledge lineage
  ['source', 'has_revision', 'source_revision'],
  ['source_revision', 'extracted_by', 'extraction_run'],
  ['extraction_run', 'produced_locator', 'evidence_locator'],
  ['evidence_locator', 'grounds_claim', 'claim'],
  ['claim', 'realised_as_rule', 'rule'],
  ['claim', 'summarised_in', 'wiki_revision'],
  ['source_revision', 'supersedes', 'source_revision'],
  ['claim', 'contradicts', 'claim'],
  // project context
  ['artifact', 'has_revision', 'artifact_revision'],
  ['artifact_revision', 'evidences', 'observed_state_element'],
  ['rule', 'requires', 'expected_state_element'],
  // engine projection
  ['expected_state_element', 'compared_with', 'observed_state_element'],
  ['expected_state_element', 'yields_finding', 'finding'],
  ['observed_state_element', 'yields_finding', 'finding'],
  ['finding', 'raises_context_request', 'context_request'],
  ['snapshot', 'fixes_finding_baseline', 'finding'],
]);

const EDGE_TYPES = Object.freeze([...new Set(EDGE_SHAPES.map((s) => s[1]))]);
export { EDGE_TYPES };

const SHAPE_KEY = (a, e, b) => `${a}|${e}|${b}`;
const ALLOWED_SHAPES = new Set(EDGE_SHAPES.map((s) => SHAPE_KEY(...s)));
const AUTHORITY_RANK = new Map(AUTHORITY_FAMILIES.map((f) => [f.key, f.rank]));

// Every asserted edge carries these. None is optional: an edge missing its grounding is
// an assertion without a reason, which cannot be reviewed later.
export const REQUIRED_EDGE_ATTRIBUTES = Object.freeze([
  'edge_id', 'edge_type',
  'from_type', 'from_ref', 'to_type', 'to_ref',
  'evidence_ref', 'authority_family', 'applicability',
  'valid_at', 'known_at',
  'review_state', 'evidence_claim_ceiling',
  'generating_policy_revision',
  // PC-04.3: every element of the projection is scoped. An edge that does not say which
  // project binding it belongs to cannot be checked for cross-project reach at all, so the
  // binding is required rather than inferred from whoever happens to be traversing.
  'project_binding_ref',
]);

/**
 * Validates one asserted edge.
 *
 * @param edge              the edge to validate
 * @param evidenceAuthority authority family of the evidence the edge rests on, used to
 *                          cap the edge's own authority claim
 */
export function validateEdge(edge, { evidenceAuthority = null, evidenceResolvable = true } = {}) {
  if (edge === null || typeof edge !== 'object' || Array.isArray(edge)) {
    throw new ContractError(CODES.EDGE_ATTRIBUTE_MISSING, 'edge is not an object');
  }
  for (const attr of REQUIRED_EDGE_ATTRIBUTES) {
    if (!Object.hasOwn(edge, attr)) {
      throw new ContractError(CODES.EDGE_ATTRIBUTE_MISSING, `edge attribute "${attr}" is missing`, { edge_id: edge.edge_id });
    }
  }
  if (!NODE_TYPES.includes(edge.from_type)) throw new ContractError(CODES.NODE_TYPE_UNKNOWN, `unknown node type "${edge.from_type}"`);
  if (!NODE_TYPES.includes(edge.to_type)) throw new ContractError(CODES.NODE_TYPE_UNKNOWN, `unknown node type "${edge.to_type}"`);
  if (!EDGE_TYPES.includes(edge.edge_type)) throw new ContractError(CODES.EDGE_TYPE_UNKNOWN, `unknown edge type "${edge.edge_type}"`);
  if (!ALLOWED_SHAPES.has(SHAPE_KEY(edge.from_type, edge.edge_type, edge.to_type))) {
    throw new ContractError(CODES.ENDPOINT_TYPE_NOT_ALLOWED,
      `${edge.from_type} -${edge.edge_type}-> ${edge.to_type} is not an allowed edge shape`);
  }

  // endpoints and evidence are exact revision refs, not names
  for (const [name, ref] of [['from_ref', edge.from_ref], ['to_ref', edge.to_ref], ['evidence_ref', edge.evidence_ref]]) {
    if (classifyRef(ref, { bytesAvailable: true }) !== RESOLUTION.RESOLVABLE) {
      throw new ContractError(CODES.ENDPOINT_REF_MALFORMED, `${name} is not a well formed exact revision ref`, { edge_id: edge.edge_id });
    }
  }

  for (const t of ['valid_at', 'known_at']) {
    if (!inspectInstant(edge[t]).valid) {
      throw new ContractError(CODES.EDGE_TIME_INVALID, `${t} is not a canonical instant`, { edge_id: edge.edge_id });
    }
  }
  // an edge cannot be known before the fact it asserts holds is even dated
  if (compareCodePoints(edge.known_at, edge.valid_at) < 0) {
    throw new ContractError(CODES.EDGE_TIME_INVALID, 'known_at precedes valid_at', { edge_id: edge.edge_id });
  }

  if (!AUTHORITY_RANK.has(edge.authority_family)) {
    throw new ContractError(CODES.EDGE_AUTHORITY_UNKNOWN, `unregistered authority family "${edge.authority_family}"`, { edge_id: edge.edge_id });
  }
  // The ceiling that keeps a derived edge from outranking its own source.
  if (evidenceAuthority !== null) {
    if (!AUTHORITY_RANK.has(evidenceAuthority)) {
      throw new ContractError(CODES.EDGE_AUTHORITY_UNKNOWN, `unregistered evidence authority "${evidenceAuthority}"`);
    }
    if (AUTHORITY_RANK.get(edge.authority_family) < AUTHORITY_RANK.get(evidenceAuthority)) {
      throw new ContractError(CODES.EDGE_AUTHORITY_EXCEEDS_EVIDENCE,
        'an edge may not claim higher authority than the evidence it rests on',
        { edge: edge.authority_family, evidence: evidenceAuthority });
    }
  }
  if (!evidenceResolvable) {
    throw new ContractError(CODES.ENDPOINT_REF_MALFORMED, 'evidence ref does not resolve', { edge_id: edge.edge_id });
  }

  if (!(edge.applicability === true || edge.applicability === false || edge.applicability === APPLICABILITY.UNKNOWN)) {
    throw new ContractError(CODES.EDGE_AUTHORITY_UNKNOWN, 'applicability must be true, false, or "unknown"', { edge_id: edge.edge_id });
  }
  if (!isEvidenceCeiling(edge.evidence_claim_ceiling)) {
    throw new ContractError(CODES.EDGE_CLAIM_CEILING_INVALID, `"${edge.evidence_claim_ceiling}" is not an evidence claim ceiling`, { edge_id: edge.edge_id });
  }
  if (typeof edge.generating_policy_revision !== 'string' || !edge.generating_policy_revision) {
    throw new ContractError(CODES.EDGE_POLICY_MISSING, 'generating_policy_revision is required so the projection can be rebuilt');
  }
  if (typeof edge.project_binding_ref !== 'string' || !edge.project_binding_ref) {
    throw new ContractError(CODES.EDGE_BINDING_MISSING,
      'project_binding_ref is required; an unscoped edge cannot be checked for cross-project reach',
      { edge_id: edge.edge_id });
  }

  return {
    valid: true,
    // An edge whose applicability is unresolved exists in the projection but must not
    // carry an authoritative conclusion across it.
    traversable_for_authoritative_conclusion: edge.applicability === true,
  };
}

/** The graph is a projection. Asking it to be the source is the error this reports. */
export function assertNotTruthOwner(intent) {
  throw new ContractError(CODES.GRAPH_AS_TRUTH_OWNER,
    `the graph is a rebuildable projection; "${intent}" would make it a truth owner`);
}

/**
 * A projection is only legitimate if it can be rebuilt from its declared inputs. The
 * revision identifies which rebuild produced this view.
 */
export function projectionDescriptor({ projectionRevision, generatedFromRefs, policyRevision }) {
  if (typeof projectionRevision !== 'string' || !projectionRevision) {
    throw new ContractError(CODES.EDGE_POLICY_MISSING, 'projection_revision is required');
  }
  if (!Array.isArray(generatedFromRefs) || generatedFromRefs.length === 0) {
    throw new ContractError(CODES.EDGE_POLICY_MISSING, 'a projection must name the refs it was generated from');
  }
  return {
    projection_revision: projectionRevision,
    generated_from_refs: [...generatedFromRefs].sort((a, b) => compareCodePoints(a, b)),
    policy_revision: policyRevision,
    rebuildable: true,
    is_truth_owner: false,
  };
}
