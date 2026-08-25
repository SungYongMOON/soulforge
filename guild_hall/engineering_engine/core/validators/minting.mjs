// D-P10-03 — the single serialised identifier minting boundary.
//
// Owner decision: one boundary inside the engine issues every permanent identifier,
// identifiers carry no meaning, and a collision is rejected rather than worked around.
//
// The third clause is the one that does the work. Retrying with a suffix, or appending a
// counter, converts a collision from a loud fault into a quiet second identifier for the
// same thing — which is exactly the state the no-reuse rule exists to prevent. So a
// collision fails the mint.
//
// A consequence worth stating, because it changes where identifiers may be created: work
// that runs in parallel cannot mint. Candidate findings are computed concurrently, so they
// carry a content-derived candidate handle instead, and a permanent finding_id is minted
// only when the candidate crosses a serialised boundary. A handle is deliberately not
// usable anywhere an identifier is required.

import { inspectIdentifierOpacity } from './identity.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  FAMILY_UNKNOWN: 'MINT_FAMILY_UNKNOWN',
  FAMILY_NOT_MINTABLE: 'MINT_FAMILY_NOT_MINTABLE',
  LANE_NOT_HELD: 'MINT_LANE_NOT_HELD',
  LANE_BUSY: 'MINT_LANE_BUSY',
  FORM_INVALID: 'MINT_FORM_INVALID',
  NOT_OPAQUE: 'MINT_NOT_OPAQUE',
  DERIVATION_FORBIDDEN: 'MINT_DERIVATION_FORBIDDEN',
  COLLISION: 'MINT_COLLISION',
  MINTER_UNAVAILABLE: 'MINT_MINTER_UNAVAILABLE',
  HANDLE_NOT_AN_IDENTIFIER: 'MINT_HANDLE_NOT_AN_IDENTIFIER',
  IDENTIFIER_REQUIRED: 'MINT_IDENTIFIER_REQUIRED',
});

/** The engine mints these. Each one is permanent and citable. */
export const MINTED_FAMILIES = Object.freeze([
  'snapshot_id', 'finding_id', 'event_id', 'entity_id', 'revision_id',
  'capsule_id', 'receipt_id', 'release_id',
]);

/** Computed from content. Never minted, because the bytes already determine them. */
export const DERIVED_FAMILIES = Object.freeze([
  'content_id', 'candidate_handle',
  'context_capsule_fingerprint', 'deterministic_replay_fingerprint', 'module_binding_revision',
]);

/** Supplied by the caller. The engine validates them and never issues them. */
export const CALLER_FAMILIES = Object.freeze([
  'request_id', 'idempotency_key', 'caller_identity',
]);

export const MINTING_LANE = 'identifier_minting';

// Canonical UUID form, version 4 or 7, lowercase, RFC 4122 variant nibble.
// Version 1 embeds a MAC address and a timestamp, which is meaning; it is refused.
const UUID_RANDOM_OR_TIME_SORTED = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function classifyIdentifierFamily(family) {
  if (MINTED_FAMILIES.includes(family)) return 'minted';
  if (DERIVED_FAMILIES.includes(family)) return 'derived';
  if (CALLER_FAMILIES.includes(family)) return 'caller_supplied';
  throw new ContractError(CODES.FAMILY_UNKNOWN,
    'identifier family is not declared; a new family needs a contract change, not an ad hoc string', { family });
}

/**
 * Acquires the minting lane.
 *
 * Refuses rather than queues, matching the serialised state-advancing lanes. A caller told
 * "busy" can decide what to do; a caller silently parked cannot.
 */
export function acquireMintingLane(laneState) {
  if (laneState && laneState.held === true) {
    throw new ContractError(CODES.LANE_BUSY,
      'the minting lane is held; the request is refused rather than queued', { holder: laneState.holder ?? null });
  }
  return { lane: MINTING_LANE, held: true, token: `${MINTING_LANE}:held` };
}

export function assertMintingLaneHeld(laneToken) {
  if (laneToken !== `${MINTING_LANE}:held`) {
    throw new ContractError(CODES.LANE_NOT_HELD,
      'an identifier may only be minted while the serialised minting lane is held');
  }
}

/**
 * Mints one permanent identifier.
 *
 * The value is supplied by the boundary rather than generated here, so the kernel stays
 * deterministic and testable and the random source remains a runtime concern. The kernel's
 * job is to refuse everything that is not a well-formed opaque identifier, and to refuse a
 * value that already exists.
 *
 * `registry` is any object with `has(id)`. It represents the set of identifiers already
 * issued for that family. Passing no registry is refused: minting without a duplicate check
 * cannot honour the no-reuse rule.
 */
export function mint({ family, value, laneToken, registry, derivation, contentHash }) {
  const kind = classifyIdentifierFamily(family);
  if (kind !== 'minted') {
    throw new ContractError(CODES.FAMILY_NOT_MINTABLE,
      `${family} is ${kind}; it must not be minted`, { family, kind });
  }
  assertMintingLaneHeld(laneToken);

  if (typeof value !== 'string' || !UUID_RANDOM_OR_TIME_SORTED.test(value)) {
    throw new ContractError(CODES.FORM_INVALID,
      'an identifier must be a lowercase canonical UUID of version 4 or 7', { family, value });
  }
  // Opacity is checked separately from form: a syntactically valid UUID could still be
  // wrapped in a meaning-bearing prefix by a caller that assembled its own string.
  const opacity = inspectIdentifierOpacity(value);
  if (opacity.opaque !== true) {
    throw new ContractError(CODES.NOT_OPAQUE,
      'an identifier must carry no meaning: no project code, path, or date component', { family, reason: opacity.reason ?? null });
  }
  if (derivation !== 'random') {
    throw new ContractError(CODES.DERIVATION_FORBIDDEN,
      'an identifier must be randomly generated, not derived from content; content-derived values collapse distinct observations of the same content into one subject',
      { family, derivation: derivation ?? null });
  }
  // A cheap positive check that the declared derivation is honest: if the value's hex
  // appears inside the content hash, it was derived from content whatever the label says.
  if (typeof contentHash === 'string' && contentHash) {
    const hex = value.replace(/-/g, '');
    if (contentHash.includes(hex.slice(0, 12))) {
      throw new ContractError(CODES.DERIVATION_FORBIDDEN,
        'the identifier appears to be derived from the content hash despite declaring random derivation', { family });
    }
  }
  if (!registry || typeof registry.has !== 'function') {
    throw new ContractError(CODES.COLLISION,
      'minting requires the issued-identifier set so a duplicate can be detected; without it no-reuse cannot be honoured', { family });
  }
  if (registry.has(value)) {
    throw new ContractError(CODES.COLLISION,
      'identifier already issued; the mint fails rather than retrying with a variant', { family, value });
  }
  return { family, value, minted_at_boundary: MINTING_LANE, reused: false, retried: false };
}

/**
 * A candidate handle is content-derived and stands in for an identifier during parallel
 * work. It is prefixed so it cannot be mistaken for one at a glance, and the guards below
 * make the distinction enforceable rather than conventional.
 */
export function candidateHandle(contentDigestHex) {
  if (typeof contentDigestHex !== 'string' || !/^[0-9a-f]{64}$/.test(contentDigestHex)) {
    throw new ContractError(CODES.FORM_INVALID, 'a candidate handle is derived from a sha256 digest');
  }
  return `cand-${contentDigestHex}`;
}

export function isCandidateHandle(v) {
  return typeof v === 'string' && v.startsWith('cand-');
}

/** Refuses a candidate handle where a permanent identifier is required. */
export function assertIsMintedIdentifier(value, field) {
  if (isCandidateHandle(value)) {
    throw new ContractError(CODES.HANDLE_NOT_AN_IDENTIFIER,
      `${field} requires a minted identifier; a candidate handle is not citable and is not permanent`, { field, value });
  }
  if (typeof value !== 'string' || !UUID_RANDOM_OR_TIME_SORTED.test(value)) {
    throw new ContractError(CODES.IDENTIFIER_REQUIRED, `${field} is not a minted identifier`, { field, value });
  }
  return true;
}

/** Parallel work may produce handles but never identifiers. */
export function assertParallelStageMayNotMint(stage) {
  const parallelStages = ['compute_candidate_finding', 'compute_context_request_candidate', 'compute_taskintent_candidate',
    'read_snapshot', 'read_finding_view', 'read_capsule'];
  if (parallelStages.includes(stage)) {
    throw new ContractError(CODES.LANE_NOT_HELD,
      `${stage} runs in parallel and may not mint; it produces a candidate handle and the identifier is minted at a serialised boundary`, { stage });
  }
  return true;
}

/**
 * The minter is a single boundary, so it is a single point of failure. The accepted
 * trade-off is stated as behaviour: reads keep working, anything that would create a new
 * permanent identifier refuses. Degrading the other way would mean minting outside the
 * boundary, which is the thing the decision forbids.
 */
export function evaluateMinterOutage({ minterAvailable, operation }) {
  const readOnly = ['read_snapshot', 'read_finding_view', 'read_capsule', 'replay_verification'];
  if (minterAvailable === true) return { permitted: true, reason: 'minter available' };
  if (readOnly.includes(operation)) {
    return { permitted: true, reason: 'read path does not mint', degraded: true };
  }
  throw new ContractError(CODES.MINTER_UNAVAILABLE,
    'the minting boundary is unavailable, so no new permanent identifier can be created; reads continue and writes refuse',
    { operation });
}

// Whether the outage policy above should also fail reads in a restricted deployment is a
// runtime choice, not a contract one.
export const OPEN_AT_RUNTIME = Object.freeze([
  'minter_process_placement_and_failover',
  'issued_identifier_set_durability_mechanism',
]);
