// Lane 1B — knowledge lineage.
//
// Every claim the engine can cite has to be traceable back to bytes somebody owns. The
// chain is fixed and ordered:
//
//   source -> source_revision -> extraction_run -> evidence_locator -> claim
//
// Two properties do the real work. A claim may not be more authoritative than the source it
// came from, and processing something deterministically does not remove the fact that its
// input was produced by a model. Both are ways of saying that a derivation cannot improve
// the standing of what it derived from.

import { inspectInstant } from './canonical.mjs';
import { AUTHORITY_FAMILIES } from './authority.mjs';
import { classifyRef, RESOLUTION } from './identity.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  KIND_UNKNOWN: 'LINEAGE_KIND_UNKNOWN',
  CHAIN_ORDER_INVALID: 'LINEAGE_CHAIN_ORDER_INVALID',
  PARENT_REF_MISSING: 'LINEAGE_PARENT_REF_MISSING',
  PARENT_REF_MISMATCH: 'LINEAGE_PARENT_REF_MISMATCH',
  ORPHAN_CLAIM: 'LINEAGE_ORPHAN_CLAIM',
  KNOWN_AT_INVALID: 'LINEAGE_KNOWN_AT_INVALID',
  KNOWN_AT_NOT_MONOTONIC: 'LINEAGE_KNOWN_AT_NOT_MONOTONIC',
  EXTRACTION_FIELD_MISSING: 'LINEAGE_EXTRACTION_FIELD_MISSING',
  AUTHORITY_ESCALATION: 'LINEAGE_AUTHORITY_ESCALATION',
  PROVENANCE_LAUNDERED: 'LINEAGE_PROVENANCE_LAUNDERED',
  CYCLE: 'LINEAGE_CYCLE',
});

export const CHAIN_KINDS = Object.freeze(['source', 'source_revision', 'extraction_run', 'evidence_locator', 'claim']);

const PARENT_OF = Object.freeze({
  source_revision: 'source',
  extraction_run: 'source_revision',
  evidence_locator: 'extraction_run',
  claim: 'evidence_locator',
});

const FAMILY_KEYS = AUTHORITY_FAMILIES.map((f) => f.key ?? f);

export const REQUIRED_EXTRACTION_FIELDS = Object.freeze([
  'method', 'method_revision', 'execution_mode', 'ai_derived',
]);

/**
 * A claim may not outrank the source it came from.
 *
 * Position in the declared family order is compared directly. No arithmetic is done on
 * ranks, because a difference between two ranks is not a quantity that means anything.
 */
export function assertWithinSourceAuthority(claimFamily, sourceFamily) {
  const ci = FAMILY_KEYS.indexOf(claimFamily);
  const si = FAMILY_KEYS.indexOf(sourceFamily);
  if (ci < 0 || si < 0) {
    throw new ContractError(CODES.KIND_UNKNOWN, 'authority family is not registered', { claimFamily, sourceFamily });
  }
  if (ci < si) {
    throw new ContractError(CODES.AUTHORITY_ESCALATION,
      'a claim cannot be more authoritative than the source it was derived from',
      { claim_family: claimFamily, source_family: sourceFamily });
  }
  return true;
}

/**
 * Carries provenance forward across a derivation step.
 *
 * Deterministic processing of a model-produced input yields a deterministic result whose
 * input was still model-produced. Dropping the flag here is the single easiest way to end up
 * citing a model's output as though a human had written it.
 */
export function propagateProvenance({ parentAiDerived, stepExecutionMode, claimedAiDerived }) {
  const derived = parentAiDerived === true || stepExecutionMode === 'ai_assisted';
  if (claimedAiDerived !== undefined && claimedAiDerived !== derived) {
    throw new ContractError(CODES.PROVENANCE_LAUNDERED,
      derived
        ? 'the step declares non-ai provenance while its input or its own mode is ai derived'
        : 'the step declares ai provenance that neither its input nor its mode supports',
      { parentAiDerived: parentAiDerived === true, stepExecutionMode, claimed: claimedAiDerived });
  }
  return { ai_derived: derived, deterministic_processing_does_not_clear_it: derived };
}

export function validateExtractionRun(node) {
  for (const f of REQUIRED_EXTRACTION_FIELDS) {
    if (!Object.hasOwn(node, f)) {
      throw new ContractError(CODES.EXTRACTION_FIELD_MISSING,
        `extraction_run field "${f}" is missing; an extraction that cannot say how it ran is not reproducible`, { field: f });
    }
  }
  if (typeof node.ai_derived !== 'boolean') {
    throw new ContractError(CODES.EXTRACTION_FIELD_MISSING, 'ai_derived must be an explicit boolean, not absent');
  }
  return true;
}

/**
 * Validates a full lineage chain.
 *
 * The chain is checked as a whole rather than per node because every property that matters
 * here is relational: the order, the parent links, the direction of time, and the authority
 * ceiling all describe pairs of nodes.
 */
export function validateLineageChain(chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new ContractError(CODES.CHAIN_ORDER_INVALID, 'a lineage chain is a non-empty ordered array');
  }
  const seen = new Set();
  let previous = null;

  for (let i = 0; i < chain.length; i += 1) {
    const node = chain[i];
    if (node === null || typeof node !== 'object') {
      throw new ContractError(CODES.CHAIN_ORDER_INVALID, `chain position ${i} is not a node`);
    }
    if (!CHAIN_KINDS.includes(node.kind)) {
      throw new ContractError(CODES.KIND_UNKNOWN, `unknown lineage kind "${node.kind}"`, { position: i });
    }
    if (CHAIN_KINDS[i] !== node.kind) {
      throw new ContractError(CODES.CHAIN_ORDER_INVALID,
        `chain position ${i} must be ${CHAIN_KINDS[i]} but is ${node.kind}`, { position: i });
    }
    if (seen.has(node.node_id)) {
      throw new ContractError(CODES.CYCLE, 'a node appears twice in one chain', { node_id: node.node_id });
    }
    seen.add(node.node_id);

    if (!inspectInstant(node.known_at).valid) {
      throw new ContractError(CODES.KNOWN_AT_INVALID, `known_at at position ${i} is not a canonical instant`, { position: i });
    }
    if (previous && node.known_at < previous.known_at) {
      throw new ContractError(CODES.KNOWN_AT_NOT_MONOTONIC,
        'a derived node cannot be known before the node it was derived from',
        { position: i, known_at: node.known_at, parent_known_at: previous.known_at });
    }

    const expectedParentKind = PARENT_OF[node.kind];
    if (expectedParentKind) {
      if (!Object.hasOwn(node, 'parent_ref')) {
        throw new ContractError(CODES.PARENT_REF_MISSING, `${node.kind} must name its ${expectedParentKind}`, { position: i });
      }
      const refState = classifyRef(node.parent_ref, { bytesAvailable: true });
      if (refState === RESOLUTION.MALFORMED || refState === RESOLUTION.FLOATING) {
        throw new ContractError(CODES.PARENT_REF_MISSING,
          `${node.kind} parent_ref must name an exact revision`, { position: i, ref_state: refState });
      }
      if (previous && node.parent_ref.entity_id !== previous.node_id) {
        throw new ContractError(CODES.PARENT_REF_MISMATCH,
          `${node.kind} names a parent that is not the preceding ${expectedParentKind}`,
          { position: i, named: node.parent_ref.entity_id, preceding: previous.node_id });
      }
    }
    if (node.kind === 'extraction_run') validateExtractionRun(node);
    previous = node;
  }

  const claim = chain.find((n) => n.kind === 'claim');
  if (claim) {
    const locator = chain.find((n) => n.kind === 'evidence_locator');
    if (!locator) {
      throw new ContractError(CODES.ORPHAN_CLAIM, 'a claim with no evidence locator cites nothing');
    }
    const source = chain.find((n) => n.kind === 'source');
    assertWithinSourceAuthority(claim.authority_family, source.authority_family);
    const extraction = chain.find((n) => n.kind === 'extraction_run');
    propagateProvenance({
      parentAiDerived: source.ai_derived === true,
      stepExecutionMode: extraction.execution_mode,
      claimedAiDerived: claim.ai_derived,
    });
  }
  return { valid: true, length: chain.length, complete: chain.length === CHAIN_KINDS.length };
}

/** A claim that names no locator is refused outright, wherever it is encountered. */
export function assertNoOrphanClaim(claim) {
  if (claim?.kind !== 'claim') {
    throw new ContractError(CODES.KIND_UNKNOWN, 'not a claim node');
  }
  if (!Object.hasOwn(claim, 'parent_ref') || classifyRef(claim.parent_ref, { bytesAvailable: true }) === RESOLUTION.MALFORMED) {
    throw new ContractError(CODES.ORPHAN_CLAIM, 'a claim must name the evidence locator it rests on');
  }
  return true;
}

// The chain is fixed. A new intermediate kind is a contract change, not a runtime option,
// because every rule above is stated in terms of this exact sequence.
export const NON_CAPABILITIES = Object.freeze([
  'infer a parent from similarity, filename, or proximity',
  'accept a claim whose locator is unresolvable',
  'clear the ai_derived flag by processing deterministically',
  'compare authority families by arithmetic on their ranks',
]);
