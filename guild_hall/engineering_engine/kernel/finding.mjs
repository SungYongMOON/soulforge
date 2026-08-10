// PC-08 finding disposition lifecycle and the derived current view.
//
// The snapshot fixes the finding baseline for its generation and is never rewritten.
// Dispositions are append-only events owned by the Gap Finding lifecycle owner, and the
// current view is a pure fold of the two. That split is what keeps a second truth owner
// from appearing: the view can always be rebuilt, so it never becomes authoritative.

import { compareCodePoints, inspectInstant } from './canonical.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  EVENT_NOT_OBJECT: 'DISPOSITION_EVENT_NOT_OBJECT',
  EVENT_ID_INVALID: 'DISPOSITION_EVENT_ID_INVALID',
  EVENT_ID_DUPLICATE: 'DISPOSITION_EVENT_ID_DUPLICATE',
  FINDING_ID_INVALID: 'DISPOSITION_FINDING_ID_INVALID',
  NEXT_STATE_INVALID: 'DISPOSITION_NEXT_STATE_INVALID',
  KNOWN_AT_INVALID: 'DISPOSITION_KNOWN_AT_INVALID',
  EVENT_SEQ_INVALID: 'DISPOSITION_EVENT_SEQ_INVALID',
  CHAIN_STEP_SKIPPED: 'DISPOSITION_CHAIN_STEP_SKIPPED',
  DIRECT_P6_FORBIDDEN: 'DISPOSITION_DIRECT_P6_FORBIDDEN',
});

export const DISPOSITION = Object.freeze({ CLOSE: 'close', SUPERSEDE: 'supersede', REOPEN: 'reopen' });

// The authority chain. A receipt proves transmission or review happened; it is not the
// authority itself, so the confirmation step cannot be skipped by presenting a receipt.
export const CHAIN = Object.freeze([
  'candidate',
  'review_receipt_not_authority',
  'registered_human_confirmation',
  'append_only_authoritative_event',
]);

const nonEmptyString = (v) => typeof v === 'string' && v.length > 0;

function validateEvent(e, seen) {
  if (e === null || typeof e !== 'object' || Array.isArray(e)) {
    throw new ContractError(CODES.EVENT_NOT_OBJECT, 'event is not an object');
  }
  if (!nonEmptyString(e.event_id)) {
    throw new ContractError(CODES.EVENT_ID_INVALID, 'event_id missing or not a non-empty string');
  }
  // event_id is the final tie-break in the total order. If two events share it the order
  // is undetermined and the fold becomes dependent on input order.
  if (seen.has(e.event_id)) {
    throw new ContractError(CODES.EVENT_ID_DUPLICATE,
      `duplicate event_id "${e.event_id}" leaves the total order undetermined`, { event_id: e.event_id });
  }
  seen.add(e.event_id);
  if (!nonEmptyString(e.finding_id)) throw new ContractError(CODES.FINDING_ID_INVALID, 'finding_id missing or not a non-empty string');
  if (!nonEmptyString(e.next_state)) throw new ContractError(CODES.NEXT_STATE_INVALID, 'next_state missing or not a non-empty string');
  const t = inspectInstant(e.known_at);
  if (!t.valid) throw new ContractError(CODES.KNOWN_AT_INVALID, 'known_at is not a canonical instant', { code: t.code });
  if (!Number.isInteger(e.event_seq) || e.event_seq < 0) {
    throw new ContractError(CODES.EVENT_SEQ_INVALID, 'event_seq must be a non-negative integer');
  }
}

/**
 * Total order over disposition events.
 *
 * known_at alone ties whenever two events share a timestamp, so the order continues
 * through event_seq and finally event_id. Without that last term two implementations
 * could fold the same event set into different views.
 */
export function compareEvents(a, b) {
  return compareCodePoints(a.finding_id, b.finding_id)
    || compareCodePoints(a.known_at, b.known_at)
    || (a.event_seq - b.event_seq)
    || compareCodePoints(a.event_id, b.event_id);
}

/**
 * Folds the immutable snapshot baseline and the append-only events into the current view.
 * Pure: the same baseline and the same event set always produce the same result, in any
 * input order.
 */
export function foldCurrentView(baseline, events) {
  if (!Array.isArray(baseline) || !Array.isArray(events)) {
    throw new ContractError(CODES.EVENT_NOT_OBJECT, 'baseline and events must both be arrays');
  }
  const seen = new Set();
  for (const e of events) validateEvent(e, seen);

  const view = new Map();
  for (const f of baseline) {
    if (!nonEmptyString(f?.finding_id)) throw new ContractError(CODES.FINDING_ID_INVALID, 'baseline entry lacks finding_id');
    view.set(f.finding_id, f.state);
  }
  for (const e of [...events].sort(compareEvents)) view.set(e.finding_id, e.next_state);

  return [...view.entries()]
    .map(([finding_id, state]) => ({ finding_id, state }))
    .sort((a, b) => compareCodePoints(a.finding_id, b.finding_id));
}

/**
 * Routes a disposition according to whether it changes accepted state.
 *
 * A triage-only disposition stays inside the generation and does not disturb the snapshot
 * fingerprint. A disposition that changes accepted context, evidence interpretation, or
 * Expected/Observed state must re-enter through a new context candidate and P5, producing
 * the next generation. Reaching P6 directly from the changed state is refused, because
 * that would let a finding rewrite accepted context without human acceptance.
 */
export function routeDisposition({ changesAcceptedState, targetGate }) {
  if (changesAcceptedState !== true) {
    return { path: 'accepted_state_unchanged', generation_effect: 'same_generation', may_reach_p6: true, snapshot_fingerprint_changes: false };
  }
  if (targetGate === 'p6_taskintent_candidate') {
    throw new ContractError(CODES.DIRECT_P6_FORBIDDEN,
      'a disposition that changes accepted state cannot reach P6 in the current generation');
  }
  return {
    path: 'accepted_state_changed',
    generation_effect: 'next_generation_only',
    requires: ['new_context_candidate', 'request_and_response_receipts', 'p5_registered_human_acceptance', 'new_snapshot'],
    may_reach_p6: false,
    existing_snapshot_mutation: 'forbidden',
  };
}

/** The chain may not be entered part way through. */
export function assertChainStep(from, to) {
  const i = CHAIN.indexOf(from), j = CHAIN.indexOf(to);
  if (i < 0 || j < 0 || j !== i + 1) {
    throw new ContractError(CODES.CHAIN_STEP_SKIPPED, `disposition chain step ${from} -> ${to} is not adjacent`, { CHAIN });
  }
  return true;
}
