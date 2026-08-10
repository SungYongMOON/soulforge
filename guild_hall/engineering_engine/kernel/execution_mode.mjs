// PC-09 the deterministic-only baseline and what may reach an authoritative surface.
//
// Every rule here fails closed. The recurring failure mode in review was not a wrong
// rule but a missing one: an absent field read as "unspecified" and therefore allowed. So
// absence is treated as unproven, and unproven is refused.

import { EXECUTION_MODES, BASELINE_EXECUTION_MODE, ADVISORY_FIELDS } from './contract_config.mjs';
import { classifyRef, RESOLUTION } from './identity.mjs';
import { inspectInstant } from './canonical.mjs';

export const VERDICT = Object.freeze({ ACCEPT: 'accept', REJECT: 'reject' });

export const BASELINE_PHASE = 'phase_1_to_4_baseline';

// Only deterministic retrieval reaches the authoritative path. Embedding and semantic
// reranking are shadow-only candidates until a separate owner decision.
export const ALLOWED_AUTHORITATIVE_RETRIEVAL = Object.freeze(['lexical', 'bm25', 'deterministic_filter']);

const SHA256_HEX = /^[0-9a-f]{64}$/;
const nonEmptyString = (v) => typeof v === 'string' && v.length > 0;

/**
 * Evaluates whether an operation may proceed on the authoritative path.
 *
 * Returns a verdict plus the reason, so a refusal can be acted on rather than merely
 * observed.
 */
export function evaluate(op) {
  const inBaseline = op.phase === BASELINE_PHASE;

  // An absent execution mode inside the baseline is not "unspecified", it is unproven.
  if (inBaseline && !Object.hasOwn(op, 'execution_mode')) {
    return { verdict: VERDICT.REJECT, reason: 'execution_mode absent inside the deterministic baseline' };
  }
  if (Object.hasOwn(op, 'execution_mode')) {
    if (!EXECUTION_MODES.includes(op.execution_mode)) {
      return { verdict: VERDICT.REJECT, reason: `unknown execution_mode "${op.execution_mode}"` };
    }
    if (inBaseline && op.execution_mode !== BASELINE_EXECUTION_MODE) {
      return { verdict: VERDICT.REJECT, reason: `baseline requires ${BASELINE_EXECUTION_MODE}` };
    }
    if (op.execution_mode === 'ai_assisted' && op.owner_ai_authorisation !== true) {
      return { verdict: VERDICT.REJECT, reason: 'ai_assisted requires explicit owner authorisation' };
    }
    if (op.execution_mode === BASELINE_EXECUTION_MODE && op.advisory_fields_present === true) {
      return { verdict: VERDICT.REJECT, reason: `advisory fields must be absent under ${BASELINE_EXECUTION_MODE}` };
    }
  }

  // Disposition candidates: a learned model contributes nothing in the baseline, and even
  // a deterministic validator may only propose, never confirm.
  if (op.disposition_candidate_author === 'learned_model' && inBaseline) {
    return { verdict: VERDICT.REJECT, reason: 'learned model output cannot contribute to disposition in the baseline' };
  }
  if (op.disposition_candidate_author === 'deterministic_finding_validator' && op.confirms_event === true) {
    return { verdict: VERDICT.REJECT, reason: 'only a registered human confirms a disposition event' };
  }

  // The retrieval method on the authoritative path is always mandatory. An earlier
  // iteration made it conditional on a flag, which left omitting the field entirely as an
  // open route.
  if (op.path === 'authoritative') {
    if (!Object.hasOwn(op, 'retrieval_method')) {
      return { verdict: VERDICT.REJECT, reason: 'authoritative path requires a named retrieval method' };
    }
    if (!ALLOWED_AUTHORITATIVE_RETRIEVAL.includes(op.retrieval_method)) {
      return { verdict: VERDICT.REJECT, reason: `retrieval method "${op.retrieval_method}" is not allowed on the authoritative path` };
    }
  }

  if (op.active_eligible === true) {
    const e = inspectActiveEligibility(op);
    if (!e.eligible) return { verdict: VERDICT.REJECT, reason: e.reason };
  }

  return { verdict: VERDICT.ACCEPT, reason: 'no prohibition applies' };
}

/**
 * Active eligibility requires evidence, not a self declaration.
 *
 * A boolean saying "provenance established" is the claim, not the proof. What is required
 * is an exact source revision ref that resolves, and a review receipt that names who
 * reviewed, over what content, and when.
 */
export function inspectActiveEligibility(material) {
  if (classifyRef(material.provenance_ref, { bytesAvailable: true }) !== RESOLUTION.RESOLVABLE) {
    return { eligible: false, reason: 'provenance_ref is not a resolvable exact revision ref' };
  }
  const r = material.review_receipt;
  if (r === null || typeof r !== 'object' || Array.isArray(r)) {
    return { eligible: false, reason: 'review_receipt missing or not an object' };
  }
  if (!nonEmptyString(r.receipt_id)) return { eligible: false, reason: 'review_receipt.receipt_id missing' };
  if (!nonEmptyString(r.reviewer_principal)) return { eligible: false, reason: 'review_receipt.reviewer_principal missing' };
  if (!SHA256_HEX.test(r.content_hash || '')) return { eligible: false, reason: 'review_receipt.content_hash is not a sha256 hex digest' };
  if (!inspectInstant(r.known_at).valid) return { eligible: false, reason: 'review_receipt.known_at is not a canonical instant' };
  // A boolean alone, with no ref, is exactly the self declaration this surface refuses.
  if (Object.hasOwn(material, 'provenance_established') && !Object.hasOwn(material, 'provenance_ref')) {
    return { eligible: false, reason: 'a boolean provenance claim without an exact ref is not evidence' };
  }
  return { eligible: true, reason: 'exact provenance ref and a complete review receipt are present' };
}

/**
 * Deterministic processing does not launder AI-derived provenance.
 *
 * Reading a learned model's output with a deterministic parser makes the reading
 * reproducible; it does not make the content source-grounded. Material whose author or
 * provenance is unclear stays isolated until a human source-bound review closes it.
 */
export function classifyLegacyMaterial({ aiDerived, provenanceKnown, humanSourceBoundReview }) {
  if (aiDerived === true || provenanceKnown !== true) {
    return humanSourceBoundReview === true
      ? { state: 'reviewed_candidate', active_eligible: false, note: 'reviewed; activation still requires a separate gate' }
      : { state: 'legacy_nonreproducible', active_eligible: false, note: 'isolated until human source-bound review' };
  }
  return { state: 'preserved_unverified', active_eligible: false, note: 'byte verification and lineage binding still required' };
}

export const advisoryFieldsAbsent = (provenance) =>
  ADVISORY_FIELDS.every((f) => !Object.hasOwn(provenance ?? {}, f));
