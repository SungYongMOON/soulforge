// Salpi review contract v1: the deterministic checker owns the answer, the model is a second eye.
//
// `buildCanonicalReviewPacket` runs the deterministic checklist (auditMailProjection) and freezes
// its findings, evidence pointers, UNKNOWNs, hold codes and overall status as the canonical set,
// each finding under a fixed id (F01, F02, ...). The model receives that packet next to the
// projection and may only answer, per finding id, CONFIRMED / CONFLICT_WITH_INPUT /
// INSUFFICIENT_PROJECTION, plus one set-level review_status.
//
// The review schema has no field that can carry a finding code, evidence pointer, UNKNOWN, status,
// hold code or overall value, so the model cannot add, drop, rewrite or soften any of them.
// `validateSalpiReview` fails closed on anything else. `decideSalpiOutcome` keeps the canonical
// verdict unchanged and can only hold harder: a rejected review or any non-CONFIRMED answer is
// routed to the Owner as a HOLD, never used to release one.

import { deepFreeze, digestOf, isDenseArray, isPlainObject } from '../../agent_observation/guard_primitives.mjs';
import { AUDIT_CLAIM_CEILING, AUTHORITY_KEYS, MAIL_CHECKLIST_ID, auditMailProjection } from './salpi_audit.mjs';

export const REVIEW_PACKET_SCHEMA_VERSION = 'soulforge.salpi.review_packet.v1';
export const REVIEW_SCHEMA_VERSION = 'soulforge.salpi.review.v1';
export const OUTCOME_SCHEMA_VERSION = 'soulforge.salpi.review_outcome.v1';

// Ordered by severity: a set-level review_status may be stricter than its per-finding answers,
// never milder.
export const REVIEW_RESULTS = Object.freeze(['CONFIRMED', 'INSUFFICIENT_PROJECTION', 'CONFLICT_WITH_INPUT']);
const REVIEW_SEVERITY = Object.freeze(Object.fromEntries(REVIEW_RESULTS.map((value, index) => [value, index])));

export const REVIEW_KEYS = Object.freeze(['schema_version', 'packet_digest', 'review_status', 'finding_checks', 'authority', 'claim_ceiling']);
const CHECK_KEYS = Object.freeze(['finding_id', 'result']);
// Canonical fields the model must never write, anywhere in its review.
export const CANONICAL_FIELDS = Object.freeze([
  'findings', 'finding_code', 'code', 'check_group', 'evidence', 'pointer', 'unknowns', 'reason_code', 'input', 'check',
  'status', 'severity', 'overall', 'hold_codes', 'hold_code', 'escalate_to', 'escalation', 'projection_digest', 'scope_ref',
]);
const FINDING_ID = /^F\d{2}$/u;

export const REVIEW_VIOLATION_CODES = Object.freeze({
  shape: 'SALPI_REVIEW_SHAPE_INVALID',
  unknownField: 'SALPI_REVIEW_UNKNOWN_FIELD',
  canonicalField: 'SALPI_REVIEW_CANONICAL_FIELD_WRITTEN',
  packet: 'SALPI_REVIEW_PACKET_MISMATCH',
  invented: 'SALPI_REVIEW_FINDING_INVENTED',
  dropped: 'SALPI_REVIEW_FINDING_DROPPED',
  duplicate: 'SALPI_REVIEW_FINDING_DUPLICATED',
  result: 'SALPI_REVIEW_RESULT_INVALID',
  softened: 'SALPI_REVIEW_STATUS_SOFTENED',
  authority: 'SALPI_REVIEW_AUTHORITY_CLAIMED',
});

export const OUTCOME_HOLD_CODES = Object.freeze({
  reviewRejected: 'salpi_review_rejected',
  reviewDisagreed: 'salpi_review_disagreement',
});

// options: same as auditMailProjection ({ auditedAt, maxReceiptAgeSeconds, previous }).
// Returns { status: 'OK', packet, digest } or { status: 'HOLD', hold_codes, projection_hold_code }.
export function buildCanonicalReviewPacket(rawProjection, options = {}) {
  const report = auditMailProjection(rawProjection, options);
  if (report.projection_digest === null) {
    // A rejected projection is never reviewed: there is nothing canonical to show the model.
    return deepFreeze({ status: 'HOLD', hold_codes: [...report.hold_codes], projection_hold_code: report.projection_hold_code });
  }
  if (report.findings.length > 99) throw new RangeError('finding ids are two digits');
  const packet = {
    schema_version: REVIEW_PACKET_SCHEMA_VERSION,
    checklist_id: MAIL_CHECKLIST_ID,
    projection_digest: report.projection_digest,
    scope_ref: report.scope_ref,
    audited_at: report.audited_at,
    canonical_report_digest: digestOf(report),
    overall: report.overall,
    hold_codes: [...report.hold_codes],
    findings: report.findings.map((item, index) => ({ finding_id: `F${String(index + 1).padStart(2, '0')}`, ...item })),
    unknowns: report.unknowns.map((item) => ({ ...item })),
    claim_ceiling: AUDIT_CLAIM_CEILING,
  };
  return deepFreeze({ status: 'OK', packet, digest: digestOf(packet) });
}

// Collects every key name in a value, at any depth, so a canonical field nested anywhere is found.
function keyNames(value, names = new Set(), depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object') return names;
  for (const [key, item] of Object.entries(value)) {
    if (!Array.isArray(value)) names.add(key);
    keyNames(item, names, depth + 1);
  }
  return names;
}

// `packet` must be the one this code built (buildCanonicalReviewPacket(...).packet), never one read
// back from the model.
export function validateSalpiReview(rawReview, packet) {
  const { status, violations } = checkReview(rawReview, packet);
  return { status, violations };
}

// Validates a JSON copy of the review and returns that copy, so callers act on exactly the bytes
// that were checked (a getter or toJSON on the original cannot answer differently later).
function checkReview(rawReview, packet) {
  if (!isPlainObject(packet) || packet.schema_version !== REVIEW_PACKET_SCHEMA_VERSION || !isDenseArray(packet.findings)) {
    throw new TypeError('a canonical review packet built by buildCanonicalReviewPacket is required');
  }
  const violations = [];
  const add = (code) => { if (!violations.includes(code)) violations.push(code); };
  if (!isPlainObject(rawReview)) return { status: 'HOLD', violations: [REVIEW_VIOLATION_CODES.shape] };
  let review;
  try { review = JSON.parse(JSON.stringify(rawReview)); } catch { return { status: 'HOLD', violations: [REVIEW_VIOLATION_CODES.shape] }; }
  if (!isPlainObject(review)) return { status: 'HOLD', violations: [REVIEW_VIOLATION_CODES.shape] };

  for (const name of keyNames(review)) if (CANONICAL_FIELDS.includes(name)) add(REVIEW_VIOLATION_CODES.canonicalField);
  for (const key of Object.keys(review)) {
    if (!REVIEW_KEYS.includes(key) && !CANONICAL_FIELDS.includes(key)) add(REVIEW_VIOLATION_CODES.unknownField);
  }
  if (review.schema_version !== REVIEW_SCHEMA_VERSION || review.claim_ceiling !== AUDIT_CLAIM_CEILING) add(REVIEW_VIOLATION_CODES.shape);
  if (review.packet_digest !== digestOf(packet)) add(REVIEW_VIOLATION_CODES.packet);
  if (!isPlainObject(review.authority) || Object.keys(review.authority).length !== AUTHORITY_KEYS.length
    || AUTHORITY_KEYS.some((key) => review.authority[key] !== false)) add(REVIEW_VIOLATION_CODES.authority);

  const canonicalIds = packet.findings.map((item) => item.finding_id);
  const checks = isDenseArray(review.finding_checks) ? review.finding_checks : (add(REVIEW_VIOLATION_CODES.shape), []);
  const seen = new Set();
  let worst = 'CONFIRMED';
  for (const item of checks) {
    if (!isPlainObject(item)) { add(REVIEW_VIOLATION_CODES.shape); continue; }
    if (Object.keys(item).some((key) => !CHECK_KEYS.includes(key) && !CANONICAL_FIELDS.includes(key))) add(REVIEW_VIOLATION_CODES.unknownField);
    if (typeof item.finding_id !== 'string' || !FINDING_ID.test(item.finding_id) || !canonicalIds.includes(item.finding_id)) {
      add(REVIEW_VIOLATION_CODES.invented);
    } else if (seen.has(item.finding_id)) {
      add(REVIEW_VIOLATION_CODES.duplicate);
    } else {
      seen.add(item.finding_id);
    }
    if (!REVIEW_RESULTS.includes(item.result)) add(REVIEW_VIOLATION_CODES.result);
    else if (REVIEW_SEVERITY[item.result] > REVIEW_SEVERITY[worst]) worst = item.result;
  }
  if (canonicalIds.some((id) => !seen.has(id))) add(REVIEW_VIOLATION_CODES.dropped);
  if (!REVIEW_RESULTS.includes(review.review_status)) add(REVIEW_VIOLATION_CODES.result);
  else if (REVIEW_SEVERITY[review.review_status] < REVIEW_SEVERITY[worst]) add(REVIEW_VIOLATION_CODES.softened);

  return violations.length === 0 ? { status: 'OK', violations: [], review: deepFreeze(review) } : { status: 'HOLD', violations };
}

// The record kept after a run. Canonical findings, evidence, UNKNOWNs and overall come from the
// packet only; the model's answer can add a hold, never remove one.
export function decideSalpiOutcome(packet, rawReview) {
  const verdict = checkReview(rawReview, packet);
  const review = verdict.review;
  const holdCodes = new Set(packet.hold_codes);
  let reviewStatus = null;
  if (verdict.status !== 'OK') {
    holdCodes.add(OUTCOME_HOLD_CODES.reviewRejected);
  } else {
    reviewStatus = review.review_status;
    if (reviewStatus !== 'CONFIRMED') holdCodes.add(OUTCOME_HOLD_CODES.reviewDisagreed);
  }
  const heldByReview = verdict.status !== 'OK' || reviewStatus !== 'CONFIRMED';
  const flagged = verdict.status === 'OK'
    ? review.finding_checks.filter((item) => item.result !== 'CONFIRMED').map((item) => ({ finding_id: item.finding_id, result: item.result }))
    : [];
  return deepFreeze({
    schema_version: OUTCOME_SCHEMA_VERSION,
    packet_digest: digestOf(packet),
    canonical_overall: packet.overall,
    canonical_finding_count: packet.findings.length,
    review_valid: verdict.status === 'OK',
    review_violations: [...verdict.violations],
    review_status: reviewStatus,
    flagged_findings: flagged,
    overall: heldByReview ? 'HOLD' : packet.overall,
    hold_codes: [...holdCodes].sort(),
    escalate_review_to: heldByReview ? 'owner' : null,
    claim_ceiling: AUDIT_CLAIM_CEILING,
  });
}
