// Lane 1D — request envelope, idempotency, compare-and-set, and serialisation classes.
//
// Several people can ask the engine things at almost the same moment. Reads and candidate
// computations over immutable input can run together; anything that advances state cannot.
// The rules here are all fail-closed, because the dangerous outcome is not a refused
// request but an accepted one that quietly used stale state.
//
// Three decisions carry most of the weight.
//
// 1. An idempotency key is a promise about the payload, not just a label. The same key
//    with a different payload is a caller bug and is refused, never silently re-executed.
// 2. State-advancing operations carry the fingerprint the caller believes is current. A
//    mismatch means someone moved underneath them, so the request is refused with the
//    observed value rather than applied on top.
// 3. The cache key contains the project binding, so project A structurally cannot read
//    project B's entry. Isolation by construction, not by a filter that runs afterwards.

import { createHash } from 'node:crypto';
import { canonicalise, inspectInstant, compareCodePoints } from './canonical.mjs';
import { CANONICAL } from './contract_config.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  REQUEST_FIELD_MISSING: 'MCP_REQUEST_FIELD_MISSING',
  UNKNOWN_OPERATION: 'MCP_UNKNOWN_OPERATION',
  AUTHORITY_INSUFFICIENT: 'MCP_AUTHORITY_INSUFFICIENT',
  STALE_GENERATION: 'MCP_STALE_GENERATION',
  PROJECT_MISMATCH: 'MCP_PROJECT_MISMATCH',
  BINDING_CHANGED: 'MCP_BINDING_CHANGED',
  IDEMPOTENCY_PAYLOAD_CONFLICT: 'MCP_IDEMPOTENCY_PAYLOAD_CONFLICT',
  IDEMPOTENCY_OPERATION_CONFLICT: 'MCP_IDEMPOTENCY_OPERATION_CONFLICT',
  CAS_FINGERPRINT_MISMATCH: 'MCP_CAS_FINGERPRINT_MISMATCH',
  CAS_FINGERPRINT_REQUIRED: 'MCP_CAS_FINGERPRINT_REQUIRED',
  SERIALISED_LANE_BUSY: 'MCP_SERIALISED_LANE_BUSY',
  EVIDENCE_NEWER_THAN_KNOWN_AT: 'MCP_EVIDENCE_NEWER_THAN_KNOWN_AT',
  CACHE_CROSS_PROJECT: 'MCP_CACHE_CROSS_PROJECT',
});

export const REQUIRED_REQUEST_FIELDS = Object.freeze([
  'request_id', 'idempotency_key',
  'caller_identity', 'caller_role', 'caller_authority_ceiling',
  'project_binding_ref', 'accepted_context_generation',
  'engine_binding_revision', 'module_binding_revision',
  'operation', 'requested_ceiling',
  'known_at_boundary',
]);

// Ordered weakest to strongest. A caller may request at or below their ceiling.
export const CEILINGS = Object.freeze(['read', 'candidate', 'write']);
const ceilingRank = (c) => CEILINGS.indexOf(c);

// Each operation declares the ceiling it needs and whether it may run concurrently.
// The serialised lane name matters: two different serialised operations do not block each
// other, but two attempts at the same lane do.
export const OPERATIONS = Object.freeze({
  read_snapshot: { ceiling: 'read', concurrency: 'parallel' },
  read_finding_view: { ceiling: 'read', concurrency: 'parallel' },
  read_capsule: { ceiling: 'read', concurrency: 'parallel' },
  compute_candidate_finding: { ceiling: 'candidate', concurrency: 'parallel' },
  compute_context_request_candidate: { ceiling: 'candidate', concurrency: 'parallel' },
  compute_taskintent_candidate: { ceiling: 'candidate', concurrency: 'parallel' },
  p5_accept_context: { ceiling: 'write', concurrency: 'serialised', lane: 'p5_acceptance' },
  advance_generation: { ceiling: 'write', concurrency: 'serialised', lane: 'generation_advance' },
  promote_binding: { ceiling: 'write', concurrency: 'serialised', lane: 'binding_promotion' },
  p8_write_task: { ceiling: 'write', concurrency: 'serialised', lane: 'p8_writer' },
});

// State-advancing operations must state the fingerprint they believe is current.
const REQUIRES_CAS = new Set(Object.entries(OPERATIONS)
  .filter(([, spec]) => spec.concurrency === 'serialised')
  .map(([name]) => name));

export const digest = (value) => createHash(CANONICAL.hashAlgorithm).update(canonicalise(value, {})).digest('hex');

/**
 * Validates a request envelope against the current server view.
 *
 * `current` supplies what the server actually holds: generation, binding revisions, and
 * the present fingerprint. Every comparison below is against observed state, never
 * against a value the caller supplied about itself.
 */
export function admitRequest(request, current) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new ContractError(CODES.REQUEST_FIELD_MISSING, 'request is not an object');
  }
  for (const f of REQUIRED_REQUEST_FIELDS) {
    if (!Object.hasOwn(request, f)) {
      throw new ContractError(CODES.REQUEST_FIELD_MISSING, `request field "${f}" is missing`, { request_id: request.request_id });
    }
  }
  const spec = OPERATIONS[request.operation];
  if (!spec) throw new ContractError(CODES.UNKNOWN_OPERATION, `unknown operation "${request.operation}"`);

  if (ceilingRank(request.requested_ceiling) < 0 || ceilingRank(request.caller_authority_ceiling) < 0) {
    throw new ContractError(CODES.AUTHORITY_INSUFFICIENT, 'ceiling values must be read, candidate, or write');
  }
  // the operation needs at least its declared ceiling, and the caller may not exceed theirs
  if (ceilingRank(request.requested_ceiling) < ceilingRank(spec.ceiling)) {
    throw new ContractError(CODES.AUTHORITY_INSUFFICIENT,
      `${request.operation} needs ceiling ${spec.ceiling}, request asked for ${request.requested_ceiling}`);
  }
  if (ceilingRank(request.requested_ceiling) > ceilingRank(request.caller_authority_ceiling)) {
    throw new ContractError(CODES.AUTHORITY_INSUFFICIENT,
      `caller ceiling ${request.caller_authority_ceiling} cannot request ${request.requested_ceiling}`);
  }

  if (request.project_binding_ref !== current.project_binding_ref) {
    throw new ContractError(CODES.PROJECT_MISMATCH, 'request project binding does not match the served binding');
  }
  if (!Number.isInteger(request.accepted_context_generation)) {
    throw new ContractError(CODES.REQUEST_FIELD_MISSING, 'accepted_context_generation must be an integer');
  }
  // a request built against an older generation is refused rather than upgraded
  if (request.accepted_context_generation !== current.accepted_context_generation) {
    throw new ContractError(CODES.STALE_GENERATION,
      'request generation does not match the current accepted generation',
      { requested: request.accepted_context_generation, current: current.accepted_context_generation });
  }
  for (const b of ['engine_binding_revision', 'module_binding_revision']) {
    if (request[b] !== current[b]) {
      throw new ContractError(CODES.BINDING_CHANGED, `${b} changed between request construction and admission`,
        { requested: request[b], current: current[b] });
    }
  }
  if (!inspectInstant(request.known_at_boundary).valid) {
    throw new ContractError(CODES.REQUEST_FIELD_MISSING, 'known_at_boundary is not a canonical instant');
  }

  if (REQUIRES_CAS.has(request.operation)) {
    if (!Object.hasOwn(request, 'expected_prior_fingerprint')) {
      throw new ContractError(CODES.CAS_FINGERPRINT_REQUIRED,
        `${request.operation} advances state and must declare expected_prior_fingerprint`);
    }
    if (request.expected_prior_fingerprint !== current.fingerprint) {
      throw new ContractError(CODES.CAS_FINGERPRINT_MISMATCH,
        'state moved since the caller read it; the request is refused rather than applied on top',
        { expected: request.expected_prior_fingerprint, observed: current.fingerprint });
    }
  }

  return { admitted: true, operation: request.operation, concurrency: spec.concurrency, lane: spec.lane ?? null };
}

/**
 * An idempotency key promises "this exact request, possibly retried".
 *
 * Same key and same payload replays the recorded response without re-executing. Same key
 * with a different payload or a different operation is a caller bug: silently running it
 * would make the key meaningless, so it is refused.
 */
export function resolveIdempotency(store, request) {
  const key = request.idempotency_key;
  if (typeof key !== 'string' || !key) {
    throw new ContractError(CODES.REQUEST_FIELD_MISSING, 'idempotency_key must be a non-empty string');
  }
  const payloadDigest = digest(request.payload ?? {});
  const prior = store.get(key);
  if (!prior) return { outcome: 'first_use', payload_digest: payloadDigest };
  if (prior.operation !== request.operation) {
    throw new ContractError(CODES.IDEMPOTENCY_OPERATION_CONFLICT,
      'the same idempotency key was already used for a different operation',
      { key, prior: prior.operation, incoming: request.operation });
  }
  if (prior.payload_digest !== payloadDigest) {
    throw new ContractError(CODES.IDEMPOTENCY_PAYLOAD_CONFLICT,
      'the same idempotency key was already used with a different payload', { key });
  }
  return { outcome: 'replay', response: prior.response, payload_digest: payloadDigest };
}

export function recordIdempotency(store, request, response) {
  store.set(request.idempotency_key, {
    operation: request.operation,
    payload_digest: digest(request.payload ?? {}),
    response,
  });
  return store;
}

/**
 * Serialised lanes admit one holder at a time.
 *
 * A second attempt is refused, not queued. Queueing is a runtime implementation choice
 * that is still an open decision; refusing is the contract, because a caller that is told
 * "busy" can decide what to do, while one silently parked cannot.
 */
export function acquireLane(lanes, laneName, holder) {
  if (!laneName) return { acquired: true, lane: null };
  const current = lanes.get(laneName);
  if (current && current !== holder) {
    throw new ContractError(CODES.SERIALISED_LANE_BUSY,
      `serialised lane "${laneName}" is held by another writer`, { lane: laneName, held_by: current });
  }
  lanes.set(laneName, holder);
  return { acquired: true, lane: laneName, holder };
}

export function releaseLane(lanes, laneName, holder) {
  if (lanes.get(laneName) === holder) lanes.delete(laneName);
  return lanes;
}

/**
 * Cache identity.
 *
 * The project binding, generation, and binding revisions are inside the key, so a lookup
 * from one project can never land on another project's entry. That is isolation by
 * construction; a post-hoc filter would already have read the other project's material.
 */
export function cacheKey({ project_binding_ref, accepted_context_generation, engine_binding_revision, module_binding_revision, operation, query }) {
  const material = {
    project_binding_ref, accepted_context_generation,
    engine_binding_revision, module_binding_revision,
    operation, query_digest: digest(query ?? {}),
  };
  return createHash(CANONICAL.hashAlgorithm)
    .update(`soulforge.se_engine.mcp_cache.v0\n${canonicalise(material, {})}`)
    .digest('hex');
}

export function assertCacheEntryServesRequest(entry, request) {
  if (entry.project_binding_ref !== request.project_binding_ref) {
    throw new ContractError(CODES.CACHE_CROSS_PROJECT, 'a cache entry from another project binding must never serve this request');
  }
  if (entry.accepted_context_generation !== request.accepted_context_generation) {
    throw new ContractError(CODES.STALE_GENERATION, 'a cache entry from another generation must not serve this request');
  }
  return true;
}

/**
 * The caller's known_at boundary is a ceiling on what the answer may use. Evidence the
 * server learned later would make the response depend on timing rather than on the
 * declared observation window.
 */
export function assertEvidenceWithinKnownAt(evidence, knownAtBoundary) {
  if (!inspectInstant(knownAtBoundary).valid) {
    throw new ContractError(CODES.REQUEST_FIELD_MISSING, 'known_at_boundary is not a canonical instant');
  }
  for (const e of evidence ?? []) {
    if (!inspectInstant(e.known_at).valid) {
      throw new ContractError(CODES.EVIDENCE_NEWER_THAN_KNOWN_AT, 'evidence known_at is not a canonical instant', { ref: e.ref });
    }
    if (compareCodePoints(e.known_at, knownAtBoundary) > 0) {
      throw new ContractError(CODES.EVIDENCE_NEWER_THAN_KNOWN_AT,
        'evidence is newer than the declared known_at boundary', { ref: e.ref, known_at: e.known_at, boundary: knownAtBoundary });
    }
  }
  return true;
}

/** Which operations may genuinely run at the same time. */
export function classifyConcurrency(operationNames) {
  const parallel = [], serialised = new Map();
  for (const name of operationNames) {
    const spec = OPERATIONS[name];
    if (!spec) throw new ContractError(CODES.UNKNOWN_OPERATION, `unknown operation "${name}"`);
    if (spec.concurrency === 'parallel') parallel.push(name);
    else {
      const list = serialised.get(spec.lane) ?? [];
      list.push(name);
      serialised.set(spec.lane, list);
    }
  }
  return {
    parallel,
    serialised_lanes: [...serialised.entries()].map(([lane, ops]) => ({ lane, operations: ops })),
    // two attempts at the same lane conflict; different lanes do not
    conflicts: [...serialised.entries()].filter(([, ops]) => ops.length > 1).map(([lane]) => lane),
  };
}

// Still open at the contract level: exact wire schema, lock or queue implementation, and
// retry/timeout policy. This module fixes admission, idempotency, CAS, lane exclusion, and
// cache identity, which are the parts that determine correctness under concurrency.
export const OPEN_AT_RUNTIME = Object.freeze(['exact_request_response_wire_schema', 'lock_or_queue_mechanism', 'retry_and_timeout_policy']);
