// Lane 1A — the Context Request schema and the P5 to P8 boundary contract.
//
// Four state-advancing boundaries exist and they are separate. Accepting a context set does
// not advance the generation, advancing the generation does not promote a binding, and none
// of them writes to the ERP. Each one is somebody deciding something, so each one is its own
// gate; collapsing any pair means one approval silently buys a second effect.
//
// The lane names are imported from lane 1D rather than restated here. Two lists of the same
// four boundaries would eventually disagree, and the disagreement would surface as a lock
// that never contends.

import { OPERATIONS } from './mcp_contract.mjs';
import { inspectInstant } from './canonical.mjs';
import { PLACEHOLDERS } from './identity.mjs';
import { assertIsMintedIdentifier } from './minting.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  BOUNDARY_UNKNOWN: 'PIPELINE_BOUNDARY_UNKNOWN',
  BOUNDARY_CONFLATED: 'PIPELINE_BOUNDARY_CONFLATED',
  PRINCIPAL_NOT_REGISTERED_HUMAN: 'PIPELINE_PRINCIPAL_NOT_REGISTERED_HUMAN',
  ENGINE_CANNOT_ACCEPT: 'PIPELINE_ENGINE_CANNOT_ACCEPT',
  CAS_MISSING: 'PIPELINE_CAS_MISSING',
  CAS_MISMATCH: 'PIPELINE_CAS_MISMATCH',
  REQUEST_FIELD_MISSING: 'CONTEXT_REQUEST_FIELD_MISSING',
  REQUEST_NOT_CANDIDATE_ONLY: 'CONTEXT_REQUEST_NOT_CANDIDATE_ONLY',
  ERP_DELTA_NOT_ZERO: 'CONTEXT_REQUEST_ERP_DELTA_NOT_ZERO',
  RAW_PAYLOAD_PRESENT: 'CONTEXT_REQUEST_RAW_PAYLOAD_PRESENT',
  WRITE_WITHOUT_APPROVAL: 'P8_WRITE_WITHOUT_APPROVAL',
  WRITE_OF_A_CANDIDATE: 'P8_WRITE_OF_A_CANDIDATE',
  GENERATION_NOT_MONOTONIC: 'PIPELINE_GENERATION_NOT_MONOTONIC',
  STAGE_NOT_DEFINED: 'PIPELINE_STAGE_NOT_DEFINED',
});

/** Derived from lane 1D so the two cannot drift. */
export const SERIALISED_BOUNDARIES = Object.freeze(
  Object.entries(OPERATIONS)
    .filter(([, o]) => o.concurrency === 'serialised')
    .map(([operation, o]) => ({ operation, lane: o.lane }))
    .sort((a, b) => (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : 0)),
);

export const BOUNDARY_LANES = Object.freeze(SERIALISED_BOUNDARIES.map((b) => b.lane));

/**
 * What each boundary is allowed to change, and what it explicitly does not.
 *
 * The `does_not` entries are the load-bearing half. Without them a reader has to infer the
 * limits, and inference is how a single acceptance ends up advancing a generation.
 */
export const BOUNDARY_EFFECTS = Object.freeze({
  p5_acceptance: {
    changes: ['accepted_context_set'],
    does_not: ['advance_generation', 'promote_binding', 'write_erp_task'],
    requires_registered_human: true,
  },
  generation_advance: {
    changes: ['accepted_context_generation'],
    does_not: ['accept_context', 'promote_binding', 'write_erp_task'],
    requires_registered_human: true,
  },
  binding_promotion: {
    changes: ['project_binding_ref'],
    does_not: ['accept_context', 'advance_generation', 'write_erp_task'],
    requires_registered_human: true,
  },
  p8_writer: {
    changes: ['erp_task_ledger'],
    does_not: ['accept_context', 'advance_generation', 'promote_binding'],
    requires_registered_human: true,
  },
});

/**
 * P7 is not defined by the frozen Phase 1-0 contract.
 *
 * The frozen text describes the route as context candidate, then a request and response
 * receipt, then P5, then a new generation, then a new snapshot. It names P5, P6 and P8 but
 * never P7. Rather than invent a stage to fill the numbering, this lane records the gap: a
 * stage nobody has specified cannot be given a contract here.
 */
export const P7 = Object.freeze({
  state: PLACEHOLDERS.PENDING_ENGINE_OWNER,
  note: 'the frozen Phase 1-0 contract names P5, P6 and P8 but does not define P7',
});

export function assertStageDefined(stage) {
  if (stage === 'P7') {
    throw new ContractError(CODES.STAGE_NOT_DEFINED,
      'P7 is not defined by the frozen contract, so no contract can be asserted for it here', { stage, state: P7.state });
  }
  return true;
}

/**
 * Refuses the claim that clearing one boundary also clears another.
 *
 * Called with what actually happened and what a caller wants to treat as having happened.
 */
export function assertBoundarySeparation(performedLane, impliedEffect) {
  const effects = BOUNDARY_EFFECTS[performedLane];
  if (!effects) {
    throw new ContractError(CODES.BOUNDARY_UNKNOWN, 'unknown boundary lane', { performedLane, known: BOUNDARY_LANES });
  }
  if (effects.does_not.includes(impliedEffect)) {
    throw new ContractError(CODES.BOUNDARY_CONFLATED,
      `${performedLane} does not ${impliedEffect}; that is a separate boundary with its own approval`,
      { performedLane, impliedEffect });
  }
  if (!effects.changes.includes(impliedEffect)) {
    throw new ContractError(CODES.BOUNDARY_UNKNOWN,
      `${impliedEffect} is not an effect this boundary declares at all`, { performedLane, impliedEffect });
  }
  return true;
}

const assertRegisteredHuman = (principal, code) => {
  if (!principal || principal.kind !== 'registered_human') {
    throw new ContractError(code,
      'this boundary requires a registered human principal', { kind: principal?.kind ?? null });
  }
  if (!principal.principal_id) {
    throw new ContractError(code, 'the principal must be identified');
  }
};

/**
 * Evaluates a P5 context acceptance.
 *
 * The engine cannot accept on a human's behalf, and the check is on the observed principal
 * kind rather than on anything the caller asserts about its own authority. Acceptance also
 * carries a compare-and-set on the fingerprint, so a caller cannot accept a context set that
 * has already moved on underneath it.
 */
export function evaluateP5Acceptance({ principal, submittedFingerprint, observedFingerprint, acceptedInputSetRef, knownAt }) {
  if (principal?.kind === 'engine' || principal?.kind === 'agent') {
    throw new ContractError(CODES.ENGINE_CANNOT_ACCEPT,
      'the engine does not accept context on a human behalf', { kind: principal.kind });
  }
  assertRegisteredHuman(principal, CODES.PRINCIPAL_NOT_REGISTERED_HUMAN);
  if (typeof submittedFingerprint !== 'string' || !submittedFingerprint) {
    throw new ContractError(CODES.CAS_MISSING, 'acceptance must submit the fingerprint the caller believes is current');
  }
  if (submittedFingerprint !== observedFingerprint) {
    throw new ContractError(CODES.CAS_MISMATCH,
      'the context set moved since it was read; the acceptance is refused rather than applied over the newer state',
      { submitted: submittedFingerprint, observed: observedFingerprint });
  }
  if (!inspectInstant(knownAt).valid) {
    throw new ContractError(CODES.CAS_MISSING, 'acceptance must carry a canonical known_at');
  }
  return {
    boundary: 'p5_acceptance',
    accepted_input_set_ref: acceptedInputSetRef,
    acceptor: principal.principal_id,
    known_at: knownAt,
    // Stated rather than left to inference.
    generation_advanced: false,
    binding_promoted: false,
    erp_written: false,
  };
}

/**
 * Advances the accepted context generation. Its own boundary, its own approval.
 *
 * The generation only ever moves forward. A generation that could move backwards would make
 * two different accepted context sets share one number, and every snapshot citing that
 * number would become ambiguous.
 */
export function evaluateGenerationAdvance({ principal, fromGeneration, toGeneration, submittedFingerprint, observedFingerprint }) {
  assertRegisteredHuman(principal, CODES.PRINCIPAL_NOT_REGISTERED_HUMAN);
  if (!Number.isSafeInteger(fromGeneration) || !Number.isSafeInteger(toGeneration)) {
    throw new ContractError(CODES.GENERATION_NOT_MONOTONIC, 'generations must be safe integers');
  }
  if (toGeneration !== fromGeneration + 1) {
    throw new ContractError(CODES.GENERATION_NOT_MONOTONIC,
      'a generation advances by exactly one; skipping or rewinding would make one number mean two context sets',
      { fromGeneration, toGeneration });
  }
  if (submittedFingerprint !== observedFingerprint) {
    throw new ContractError(CODES.CAS_MISMATCH, 'the generation moved since it was read');
  }
  return { boundary: 'generation_advance', from: fromGeneration, to: toGeneration, context_accepted_here: false };
}

export const REQUIRED_CONTEXT_REQUEST_FIELDS = Object.freeze([
  'context_request_id', 'snapshot_id', 'finding_ids', 'question_text',
  'requested_from_role', 'authority_family_sought', 'known_at',
  'candidate_only', 'erp_delta',
]);

const RAW_PAYLOAD_KEYS = ['body', 'payload', 'raw_span', 'text', 'file_bytes'];

/**
 * Validates a P6 Context Request.
 *
 * P6 produces candidates only. A context request is the engine saying "a human needs to tell
 * us this", and it creates no task and no ledger entry. It becomes work only by going through
 * P8, which has its own approval. Both facts are asserted rather than documented, because a
 * candidate that quietly counted as a task would be an unapproved write.
 */
export function validateContextRequest(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new ContractError(CODES.REQUEST_FIELD_MISSING, 'context request is not an object');
  }
  for (const f of REQUIRED_CONTEXT_REQUEST_FIELDS) {
    if (!Object.hasOwn(request, f)) {
      throw new ContractError(CODES.REQUEST_FIELD_MISSING, `context request field "${f}" is missing`, { field: f });
    }
  }
  assertIsMintedIdentifier(request.snapshot_id, 'snapshot_id');
  if (!Array.isArray(request.finding_ids) || request.finding_ids.length === 0) {
    throw new ContractError(CODES.REQUEST_FIELD_MISSING, 'a context request must name the findings it arises from');
  }
  for (const id of request.finding_ids) assertIsMintedIdentifier(id, 'finding_ids[]');
  if (!inspectInstant(request.known_at).valid) {
    throw new ContractError(CODES.REQUEST_FIELD_MISSING, 'known_at must be a canonical instant');
  }
  if (request.candidate_only !== true) {
    throw new ContractError(CODES.REQUEST_NOT_CANDIDATE_ONLY,
      'a context request is candidate only; it is not a task and does not become one without P8');
  }
  if (request.erp_delta !== 0) {
    throw new ContractError(CODES.ERP_DELTA_NOT_ZERO,
      'P6 changes nothing in the ERP ledger', { erp_delta: request.erp_delta });
  }
  const raw = RAW_PAYLOAD_KEYS.filter((k) => Object.hasOwn(request, k));
  if (raw.length) {
    throw new ContractError(CODES.RAW_PAYLOAD_PRESENT,
      'a context request carries pointers to findings, not evidence bodies', { keys: raw });
  }
  return { valid: true, context_request_id: request.context_request_id, finding_count: request.finding_ids.length };
}

export function assertZeroErpDelta(candidate) {
  if (candidate?.erp_delta !== 0) {
    throw new ContractError(CODES.ERP_DELTA_NOT_ZERO, 'a candidate stage must report a zero ERP delta');
  }
  return true;
}

/**
 * Evaluates a P8 ERP write.
 *
 * A write needs an explicit approval from a registered human, and the thing being written
 * must have stopped being a candidate. Writing a candidate is the failure mode this guards:
 * the engine proposed it, nobody approved it, and it appears in the ledger anyway.
 */
export function evaluateP8Write({ principal, approval, taskIntent, submittedFingerprint, observedFingerprint }) {
  assertRegisteredHuman(principal, CODES.PRINCIPAL_NOT_REGISTERED_HUMAN);
  if (!approval || approval.approved !== true || !approval.approver_principal_id) {
    throw new ContractError(CODES.WRITE_WITHOUT_APPROVAL,
      'a P8 write requires an explicit approval naming its approver');
  }
  if (approval.approver_principal_id === principal.principal_id && approval.self_approval_permitted !== true) {
    throw new ContractError(CODES.WRITE_WITHOUT_APPROVAL,
      'the writer approved their own write and self approval was not permitted',
      { principal: principal.principal_id });
  }
  if (taskIntent?.candidate_only === true) {
    throw new ContractError(CODES.WRITE_OF_A_CANDIDATE,
      'this task intent is still a candidate; a candidate must be approved before it can be written');
  }
  if (submittedFingerprint !== observedFingerprint) {
    throw new ContractError(CODES.CAS_MISMATCH, 'the snapshot moved since the task intent was computed');
  }
  return {
    boundary: 'p8_writer',
    writer: principal.principal_id,
    approver: approval.approver_principal_id,
    // A snapshot is not rewritten afterwards to carry the resulting task ref; the link is
    // held on the task side, pointing back at the immutable snapshot.
    snapshot_rewritten: false,
    backward_lineage_ref: 'snapshot_id',
  };
}

export const OPEN_OWNER_DECISIONS_FOR_THIS_LANE = Object.freeze([
  'p5_and_p8_registered_human_approver_registration_policy',
  'whether_self_approval_is_ever_permitted_and_for_whom',
  'p7_stage_definition_or_removal_from_the_numbering',
]);
