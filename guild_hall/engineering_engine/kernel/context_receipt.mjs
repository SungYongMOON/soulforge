// Phase 3 (synthetic only) — the semantic Context Request and Context Response receipts.
//
// The frozen runtime sequence puts four things between a gap and a human acceptance:
//
//   context_request_candidate
//   -> context_request_receipt      (immutable, transmission proof, NOT acceptance)
//   -> context_response_receipt     (immutable, transmission proof, NOT acceptance)
//   -> response_remains_context_candidate
//   -> P5 registered-human acceptance
//
// Four different things are called a receipt around this engine, and conflating any two of
// them loses a boundary:
//
//   topology_delivery_receipt   an edge in the engine's own graph was traversed during a run.
//                               Evidence about this engine, owned by delivery_receipt.mjs.
//   mcp_idempotency_response    a recorded response replayed for a repeated request key.
//                               A concurrency device, owned by mcp_contract.mjs. It proves
//                               "you already asked this", not "somebody answered you".
//   context_request_receipt     this engine asked a named principal a named question, at a
//                               named time, about an exact request revision.
//   context_response_receipt    that principal answered, and this is the exact revision and
//                               hash of what came back.
//
// The last two are what this module owns, and the rules that matter are the negative ones.
//
// 1. A receipt is not an acceptance. It proves transmission. Only a registered human at P5
//    accepts, and this module never performs that acceptance.
// 2. A receipt is distinct from the thing it is about. The request receipt is not the
//    request candidate; the response receipt is not the response candidate. Collapsing them
//    would make "we asked" and "we decided the answer is good" the same record.
// 3. A response is still a candidate. Receiving an answer changes nothing about the accepted
//    context until P5 says so.
// 4. Missing, mismatched, stale or cross-project receipts stop the sequence. They do not
//    degrade into a weaker but still passing state.
//
// Nothing here transports anything. There is no socket, no external service, no live P5, no
// generation advance and no ERP write; the module decides whether a boundary could be
// evaluated at all, over values it was handed.

import { inspectInstant, compareCodePoints } from './canonical.mjs';
import { classifyRef, RESOLUTION } from './identity.mjs';
import { assertIsMintedIdentifier } from './minting.mjs';
import { AUTHORITY_FAMILIES, resolveApplicability, APPLICABILITY } from './authority.mjs';
import { isEvidenceCeiling } from './ceilings.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  RECEIPT_KIND_INVALID: 'CONTEXT_RECEIPT_KIND_INVALID',
  RECEIPT_FIELD_MISSING: 'CONTEXT_RECEIPT_FIELD_MISSING',
  RECEIPT_NOT_IMMUTABLE: 'CONTEXT_RECEIPT_NOT_IMMUTABLE',
  RECEIPT_CLAIMS_ACCEPTANCE: 'CONTEXT_RECEIPT_CLAIMS_ACCEPTANCE',
  RECEIPT_NOT_DISTINCT: 'CONTEXT_RECEIPT_NOT_DISTINCT',
  RECEIPT_LINKAGE_BROKEN: 'CONTEXT_RECEIPT_LINKAGE_BROKEN',
  RECEIPT_CROSS_PROJECT: 'CONTEXT_RECEIPT_CROSS_PROJECT',
  RECEIPT_GENERATION_MISMATCH: 'CONTEXT_RECEIPT_GENERATION_MISMATCH',
  RECEIPT_CAS_MISMATCH: 'CONTEXT_RECEIPT_CAS_MISMATCH',
  RECEIPT_STALE: 'CONTEXT_RECEIPT_STALE',
  RESPONSE_NOT_CANDIDATE: 'CONTEXT_RESPONSE_NOT_CANDIDATE',
  RESPONSE_EVIDENCE_INSUFFICIENT: 'CONTEXT_RESPONSE_EVIDENCE_INSUFFICIENT',
  RESPONSE_AUTHORITY_NOT_APPLICABLE: 'CONTEXT_RESPONSE_AUTHORITY_NOT_APPLICABLE',
  P5_BOUNDARY_NOT_EVALUABLE: 'P5_ORCHESTRATION_BOUNDARY_NOT_EVALUABLE',
  TRANSPORT_REFUSED: 'CONTEXT_RECEIPT_TRANSPORT_REFUSED',
});

/** The four conceptually distinct receipt kinds, named so they cannot be conflated. */
export const RECEIPT_KINDS = Object.freeze({
  TOPOLOGY_DELIVERY: 'topology_delivery_receipt',
  MCP_IDEMPOTENCY_RESPONSE: 'mcp_idempotency_response',
  CONTEXT_REQUEST: 'context_request_receipt',
  CONTEXT_RESPONSE: 'context_response_receipt',
});

/** Which module owns each kind. Recorded so a later reader does not have to reconstruct it. */
export const RECEIPT_KIND_OWNERS = Object.freeze({
  [RECEIPT_KINDS.TOPOLOGY_DELIVERY]: 'kernel/delivery_receipt.mjs',
  [RECEIPT_KINDS.MCP_IDEMPOTENCY_RESPONSE]: 'kernel/mcp_contract.mjs',
  [RECEIPT_KINDS.CONTEXT_REQUEST]: 'kernel/context_receipt.mjs',
  [RECEIPT_KINDS.CONTEXT_RESPONSE]: 'kernel/context_receipt.mjs',
});

export const REQUIRED_REQUEST_RECEIPT_FIELDS = Object.freeze([
  'receipt_kind', 'context_request_receipt_id', 'context_request_id',
  'context_request_content_hash',
  'project_binding_ref', 'accepted_context_generation', 'accepted_context_cas_fingerprint',
  'principal_ref', 'authority_ref',
  'valid_at', 'known_at',
  'immutable', 'is_acceptance',
]);

export const REQUIRED_RESPONSE_RECEIPT_FIELDS = Object.freeze([
  'receipt_kind', 'context_response_receipt_id', 'context_response_id',
  'in_response_to_context_request_id', 'in_response_to_receipt_id',
  'context_response_content_hash',
  'source_revision_refs', 'artifact_revision_refs',
  'project_binding_ref', 'accepted_context_generation', 'accepted_context_cas_fingerprint',
  'principal_ref', 'authority_ref',
  'valid_at', 'known_at',
  'immutable', 'is_acceptance',
]);

/**
 * What a response candidate has to carry.
 *
 * The first twelve are the candidate as such. The rest are the linkage, and they are required
 * for the same reason the receipts are: a candidate that names only its own response id can
 * be attached to any receipt pair whose response id happens to match, and "happens to match"
 * is how a request-A receipt ends up certifying a request-B answer. Every field below is one
 * a valid exchange already produced, so requiring it costs a real exchange nothing and costs
 * a spliced one everything.
 */
export const REQUIRED_RESPONSE_CANDIDATE_FIELDS = Object.freeze([
  'context_response_id', 'context_request_id', 'project_binding_ref',
  'accepted_context_generation',
  'responding_authority_family', 'applicability_components',
  'evidence_claim_ceiling', 'source_revision_refs',
  'known_at', 'candidate_only', 'erp_delta', 'accepted',
  // linkage: which receipts this candidate is bound to, and by what content
  'context_response_receipt_id', 'in_response_to_receipt_id',
  'context_response_content_hash', 'accepted_context_cas_fingerprint',
  'artifact_revision_refs', 'principal_ref', 'authority_ref', 'valid_at',
]);

const AUTHORITY_RANK = new Map(AUTHORITY_FAMILIES.map((f) => [f.key, f.rank]));
const isHash = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/**
 * The comparison form of an exact revision ref list.
 *
 * Refs are compared as sets of (entity, revision, content, algorithm), because that tuple is
 * what makes a citation exact. Order is not part of the claim, so it is sorted away; the
 * content id is, so it is not. Comparing only entity ids would let a candidate cite a
 * different revision of the same document than the receipt attests.
 */
const refSetKey = (refs) => (Array.isArray(refs) ? refs : [])
  .map((r) => `${r?.entity_id}|${r?.revision_id}|${r?.content_id}|${r?.content_hash_alg}`)
  .sort(compareCodePoints)
  .join('\n');

const requireFields = (object, fields, label) => {
  if (object === null || typeof object !== 'object' || Array.isArray(object)) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${label} is not an object`);
  }
  for (const f of fields) {
    if (!Object.hasOwn(object, f)) {
      throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${label} field "${f}" is missing`, { field: f });
    }
  }
};

/** Both receipt kinds share these rules: immutable, not an acceptance, exactly dated. */
function assertReceiptCommon(receipt, label) {
  if (receipt.immutable !== true) {
    throw new ContractError(CODES.RECEIPT_NOT_IMMUTABLE,
      `${label} must be immutable; a receipt that can be rewritten proves nothing about what was sent`);
  }
  if (receipt.is_acceptance !== false) {
    throw new ContractError(CODES.RECEIPT_CLAIMS_ACCEPTANCE,
      `${label} is proof of transmission, not acceptance; only a registered human accepts at P5`);
  }
  for (const t of ['valid_at', 'known_at']) {
    if (!inspectInstant(receipt[t]).valid) {
      throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${label} ${t} must be a canonical instant`);
    }
  }
  if (compareCodePoints(receipt.known_at, receipt.valid_at) < 0) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${label} known_at cannot precede valid_at`);
  }
  for (const f of ['project_binding_ref', 'principal_ref', 'authority_ref']) {
    if (typeof receipt[f] !== 'string' || !receipt[f]) {
      throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${label} ${f} must be a non-empty string`);
    }
  }
  if (!Number.isSafeInteger(receipt.accepted_context_generation) || receipt.accepted_context_generation < 0) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${label} accepted_context_generation must be a non-negative safe integer`);
  }
  if (!isHash(receipt.accepted_context_cas_fingerprint)) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING,
      `${label} must carry the accepted-context CAS fingerprint it was taken against`);
  }
}

/**
 * Validates a Context Request receipt.
 *
 * The receipt identifier and the request identifier are both required and must differ. They
 * are two different things: one is the question, the other is the record that the question
 * was sent. A single identifier for both makes "asked" and "recorded as asked" the same
 * fact, and the whole point of a receipt is that it is a separate, immutable artifact.
 */
export function validateContextRequestReceipt(receipt) {
  requireFields(receipt, REQUIRED_REQUEST_RECEIPT_FIELDS, 'context request receipt');
  if (receipt.receipt_kind !== RECEIPT_KINDS.CONTEXT_REQUEST) {
    throw new ContractError(CODES.RECEIPT_KIND_INVALID,
      `receipt_kind must be "${RECEIPT_KINDS.CONTEXT_REQUEST}"`, { given: receipt.receipt_kind ?? null });
  }
  assertIsMintedIdentifier(receipt.context_request_receipt_id, 'context_request_receipt_id');
  assertIsMintedIdentifier(receipt.context_request_id, 'context_request_id');
  if (receipt.context_request_receipt_id === receipt.context_request_id) {
    throw new ContractError(CODES.RECEIPT_NOT_DISTINCT,
      'the request receipt must be a distinct record from the request candidate it attests');
  }
  if (!isHash(receipt.context_request_content_hash)) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING,
      'the receipt must pin the exact request revision by content hash');
  }
  assertReceiptCommon(receipt, 'context request receipt');
  return { valid: true, receipt_kind: receipt.receipt_kind, context_request_id: receipt.context_request_id };
}

/**
 * Validates a Context Response receipt against the request receipt it answers.
 *
 * This is deliberately not the MCP idempotency response. That one says "this key was already
 * used, here is what you were told last time"; this one says "a named principal answered
 * this exact question at this time, and here is the hash of what they said". A retry
 * mechanism cannot stand in for evidence that somebody replied.
 */
export function validateContextResponseReceipt(receipt, { requestReceipt } = {}) {
  requireFields(receipt, REQUIRED_RESPONSE_RECEIPT_FIELDS, 'context response receipt');
  if (receipt.receipt_kind !== RECEIPT_KINDS.CONTEXT_RESPONSE) {
    throw new ContractError(CODES.RECEIPT_KIND_INVALID,
      `receipt_kind must be "${RECEIPT_KINDS.CONTEXT_RESPONSE}"`, { given: receipt.receipt_kind ?? null });
  }
  assertIsMintedIdentifier(receipt.context_response_receipt_id, 'context_response_receipt_id');
  assertIsMintedIdentifier(receipt.context_response_id, 'context_response_id');
  if (receipt.context_response_receipt_id === receipt.context_response_id) {
    throw new ContractError(CODES.RECEIPT_NOT_DISTINCT,
      'the response receipt must be a distinct record from the response candidate it attests');
  }
  if (!isHash(receipt.context_response_content_hash)) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING,
      'the receipt must pin the exact response revision by content hash');
  }
  for (const field of ['source_revision_refs', 'artifact_revision_refs']) {
    if (!Array.isArray(receipt[field])) {
      throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${field} must be an array of exact revision refs`);
    }
    for (const ref of receipt[field]) {
      if (classifyRef(ref, { bytesAvailable: true }) !== RESOLUTION.RESOLVABLE) {
        throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${field} contains a ref that is not an exact revision ref`);
      }
    }
  }
  assertReceiptCommon(receipt, 'context response receipt');

  if (requestReceipt !== undefined) {
    validateContextRequestReceipt(requestReceipt);
    if (receipt.in_response_to_context_request_id !== requestReceipt.context_request_id
        || receipt.in_response_to_receipt_id !== requestReceipt.context_request_receipt_id) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
        'the response receipt does not answer this request receipt');
    }
    if (receipt.project_binding_ref !== requestReceipt.project_binding_ref) {
      throw new ContractError(CODES.RECEIPT_CROSS_PROJECT,
        'the response receipt belongs to a different project binding than the request it answers');
    }
    if (receipt.accepted_context_generation !== requestReceipt.accepted_context_generation) {
      throw new ContractError(CODES.RECEIPT_GENERATION_MISMATCH,
        'the response receipt was taken against a different accepted context generation');
    }
    if (receipt.accepted_context_cas_fingerprint !== requestReceipt.accepted_context_cas_fingerprint) {
      throw new ContractError(CODES.RECEIPT_CAS_MISMATCH,
        'the accepted context moved between the request and the response');
    }
    // A reply cannot predate the question it answers.
    if (compareCodePoints(receipt.known_at, requestReceipt.known_at) < 0) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
        'the response was recorded as known before the request was');
    }
  }
  return { valid: true, receipt_kind: receipt.receipt_kind, context_response_id: receipt.context_response_id };
}

/**
 * Validates that the response is still a candidate.
 *
 * The frozen sequence has a gate whose entire content is "the response remains a context
 * candidate". It exists because the natural mistake is to treat an answer from an authority
 * as an accepted fact. It is not one until a registered human accepts it at P5.
 *
 * The second half of this function is the linkage, and it is what makes the candidate
 * content-addressed to its exchange rather than merely adjacent to it. Checking the response
 * id alone was the hole: a candidate answering request B, carrying source B, passed against
 * the receipt pair for request A, because nothing compared the candidate's request, its
 * sources, its artifacts, its content hash, its principal or its authority to what the
 * receipts actually attest. Each of those is now compared, in both directions where both
 * receipts are supplied, so the candidate is bound to one exchange and cannot be re-pointed
 * at another.
 */
export function validateResponseCandidate(candidate, { responseReceipt, requestReceipt } = {}) {
  requireFields(candidate, REQUIRED_RESPONSE_CANDIDATE_FIELDS, 'context response candidate');
  assertIsMintedIdentifier(candidate.context_response_id, 'context_response_id');
  assertIsMintedIdentifier(candidate.context_request_id, 'context_request_id');
  if (candidate.candidate_only !== true || candidate.accepted !== false) {
    throw new ContractError(CODES.RESPONSE_NOT_CANDIDATE,
      'a received response is still a context candidate; it is not accepted context until P5 accepts it');
  }
  if (candidate.erp_delta !== 0) {
    throw new ContractError(CODES.RESPONSE_NOT_CANDIDATE, 'a context response changes nothing in the ERP ledger');
  }
  if (!inspectInstant(candidate.known_at).valid) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING, 'the response candidate must carry a canonical known_at');
  }
  if (!isEvidenceCeiling(candidate.evidence_claim_ceiling)) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING,
      `"${candidate.evidence_claim_ceiling}" is not an evidence claim ceiling`);
  }
  for (const field of ['source_revision_refs', 'artifact_revision_refs']) {
    if (!Array.isArray(candidate[field])) {
      throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `${field} must be an array of exact revision refs`);
    }
  }
  for (const field of ['principal_ref', 'authority_ref']) {
    if (typeof candidate[field] !== 'string' || !candidate[field]) {
      throw new ContractError(CODES.RECEIPT_FIELD_MISSING, `the response candidate ${field} must be a non-empty string`);
    }
  }
  if (!inspectInstant(candidate.valid_at).valid) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING, 'the response candidate must carry a canonical valid_at');
  }
  if (!isHash(candidate.context_response_content_hash)) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING,
      'the candidate must pin the exact response revision by content hash');
  }
  if (!isHash(candidate.accepted_context_cas_fingerprint)) {
    throw new ContractError(CODES.RECEIPT_FIELD_MISSING,
      'the candidate must carry the accepted-context CAS fingerprint it was produced against');
  }

  if (responseReceipt !== undefined) {
    if (candidate.context_response_id !== responseReceipt.context_response_id
        || candidate.context_response_receipt_id !== responseReceipt.context_response_receipt_id) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN, 'the candidate is not the response this receipt attests');
    }
    // The request side, read off the receipt rather than off the candidate. This is the check
    // that fails a request-B answer presented against a request-A receipt.
    if (candidate.context_request_id !== responseReceipt.in_response_to_context_request_id
        || candidate.in_response_to_receipt_id !== responseReceipt.in_response_to_receipt_id) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
        'the candidate answers a different request than the one its response receipt attests');
    }
    if (candidate.context_response_content_hash !== responseReceipt.context_response_content_hash) {
      throw new ContractError(CODES.RECEIPT_CAS_MISMATCH,
        'the candidate content does not hash to what the response receipt pinned');
    }
    // The cited material has to be the material the receipt attests, revision for revision.
    // A candidate carrying another exchange's sources is the same splice by a different route.
    if (refSetKey(candidate.source_revision_refs) !== refSetKey(responseReceipt.source_revision_refs)) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
        'the candidate cites different source revisions than its response receipt attests');
    }
    if (refSetKey(candidate.artifact_revision_refs) !== refSetKey(responseReceipt.artifact_revision_refs)) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
        'the candidate cites different artifact revisions than its response receipt attests');
    }
    if (candidate.principal_ref !== responseReceipt.principal_ref
        || candidate.authority_ref !== responseReceipt.authority_ref) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
        'the candidate names a different principal or authority than the receipt recorded');
    }
    if (candidate.valid_at !== responseReceipt.valid_at || candidate.known_at !== responseReceipt.known_at) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
        'the candidate is dated differently from the receipt that attests it');
    }
    if (candidate.project_binding_ref !== responseReceipt.project_binding_ref) {
      throw new ContractError(CODES.RECEIPT_CROSS_PROJECT, 'the candidate belongs to a different project binding than its receipt');
    }
    if (candidate.accepted_context_generation !== responseReceipt.accepted_context_generation) {
      throw new ContractError(CODES.RECEIPT_GENERATION_MISMATCH, 'the candidate belongs to a different generation than its receipt');
    }
    if (candidate.accepted_context_cas_fingerprint !== responseReceipt.accepted_context_cas_fingerprint) {
      throw new ContractError(CODES.RECEIPT_CAS_MISMATCH,
        'the candidate was produced against a different accepted-context state than its receipt');
    }
  }

  if (requestReceipt !== undefined) {
    if (candidate.context_request_id !== requestReceipt.context_request_id
        || candidate.in_response_to_receipt_id !== requestReceipt.context_request_receipt_id) {
      throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
        'the candidate does not answer the request this request receipt attests');
    }
    if (candidate.project_binding_ref !== requestReceipt.project_binding_ref) {
      throw new ContractError(CODES.RECEIPT_CROSS_PROJECT,
        'the candidate belongs to a different project binding than the request it answers');
    }
    if (candidate.accepted_context_generation !== requestReceipt.accepted_context_generation) {
      throw new ContractError(CODES.RECEIPT_GENERATION_MISMATCH,
        'the candidate belongs to a different generation than the request it answers');
    }
    if (candidate.accepted_context_cas_fingerprint !== requestReceipt.accepted_context_cas_fingerprint) {
      throw new ContractError(CODES.RECEIPT_CAS_MISMATCH,
        'the accepted context moved between the request and this candidate');
    }
  }

  return {
    valid: true,
    context_response_id: candidate.context_response_id,
    remains_context_candidate: true,
    linkage_checked: responseReceipt !== undefined && requestReceipt !== undefined,
  };
}

/**
 * Judges whether the response is sufficient, and whether its authority actually applies.
 *
 * A verdict rather than a throw, because "not sufficient" is a legitimate and common answer
 * that leaves the finding open. The two halves are separate on purpose: a perfectly
 * applicable authority can answer with nothing citable, and an exhaustively cited answer can
 * come from a source that does not govern this project.
 */
export function assessResponseSufficiency(candidate, { requiredAuthorityFamily = null } = {}) {
  validateResponseCandidate(candidate);

  const resolvable = candidate.source_revision_refs
    .filter((r) => classifyRef(r, { bytesAvailable: true }) === RESOLUTION.RESOLVABLE).length;
  // Only source_sufficient means the applicable source deterministically covers the claim.
  // source_referenced is "there is a ref"; that is not the same statement.
  const evidenceSufficient = resolvable > 0 && candidate.evidence_claim_ceiling === 'source_sufficient';

  const family = candidate.responding_authority_family;
  const registered = AUTHORITY_RANK.has(family);
  const applicability = resolveApplicability(candidate.applicability_components);
  const outranksRequirement = requiredAuthorityFamily === null
    ? true
    : AUTHORITY_RANK.has(requiredAuthorityFamily) && AUTHORITY_RANK.get(family) <= AUTHORITY_RANK.get(requiredAuthorityFamily);
  const authorityApplicable = registered && applicability === APPLICABILITY.YES && outranksRequirement;

  const reasons = [];
  if (!evidenceSufficient) reasons.push(resolvable === 0 ? 'no_resolvable_source_ref' : 'evidence_ceiling_below_source_sufficient');
  if (!registered) reasons.push('unregistered_authority_family');
  else if (applicability !== APPLICABILITY.YES) reasons.push(`applicability_${String(applicability)}`);
  else if (!outranksRequirement) reasons.push('authority_below_the_family_the_question_sought');

  return {
    evidence_sufficient: evidenceSufficient,
    authority_applicable: authorityApplicable,
    sufficient: evidenceSufficient && authorityApplicable,
    resolvable_source_refs: resolvable,
    applicability,
    reasons,
  };
}

/**
 * Decides whether the P5 orchestration boundary can even be evaluated yet.
 *
 * Not whether to accept. This engine never accepts: acceptance is a registered human at a
 * serialised boundary, and the result below says so in as many fields as it takes. What this
 * answers is the question in front of that one — is there a complete, fresh, same-project,
 * same-generation pair of receipts plus a still-candidate response with sufficient evidence
 * and applicable authority? If not, the sequence stops here and the finding stays open.
 *
 * `freshnessWindow` and `now` are supplied, never read from a clock inside this module, so a
 * replay produces the same verdict as the original run.
 */
export function assertP5OrchestrationBoundaryEvaluable({
  requestReceipt, responseReceipt, responseCandidate,
  projectBindingRef, acceptedContextGeneration, observedCasFingerprint,
  freshnessWindow, now, requiredAuthorityFamily = null,
}) {
  for (const [name, value] of [
    ['requestReceipt', requestReceipt], ['responseReceipt', responseReceipt], ['responseCandidate', responseCandidate],
  ]) {
    if (value === undefined || value === null) {
      throw new ContractError(CODES.P5_BOUNDARY_NOT_EVALUABLE,
        `the P5 boundary cannot be evaluated without ${name}`, { missing: name });
    }
  }
  validateContextRequestReceipt(requestReceipt);
  validateContextResponseReceipt(responseReceipt, { requestReceipt });

  // Two distinct receipts, not one record counted twice. Checked before the candidate, because
  // if the two receipts are one record then there is no pair for a candidate to be bound to
  // and every linkage complaint downstream would be a symptom rather than the fault.
  if (requestReceipt.context_request_receipt_id === responseReceipt.context_response_receipt_id) {
    throw new ContractError(CODES.RECEIPT_NOT_DISTINCT, 'the request and response receipts are the same record');
  }

  // Both receipts, not just the response one. The candidate has to be bound to the exact
  // request that was asked and to the exact response that was recorded; either half alone
  // leaves a seam a different exchange can be spliced into.
  const candidateLinkage = validateResponseCandidate(responseCandidate, { responseReceipt, requestReceipt });
  if (candidateLinkage.linkage_checked !== true) {
    throw new ContractError(CODES.RECEIPT_LINKAGE_BROKEN,
      'the candidate was not checked against both receipts, so its linkage is unproven');
  }

  for (const [label, value] of [
    ['request receipt', requestReceipt.project_binding_ref],
    ['response receipt', responseReceipt.project_binding_ref],
    ['response candidate', responseCandidate.project_binding_ref],
  ]) {
    if (value !== projectBindingRef) {
      throw new ContractError(CODES.RECEIPT_CROSS_PROJECT,
        `the ${label} belongs to a different project binding than the request being served`);
    }
  }
  for (const [label, value] of [
    ['request receipt', requestReceipt.accepted_context_generation],
    ['response receipt', responseReceipt.accepted_context_generation],
    ['response candidate', responseCandidate.accepted_context_generation],
  ]) {
    if (value !== acceptedContextGeneration) {
      throw new ContractError(CODES.RECEIPT_GENERATION_MISMATCH,
        `the ${label} was taken against a different accepted context generation`);
    }
  }
  if (!isHash(observedCasFingerprint)) {
    throw new ContractError(CODES.RECEIPT_CAS_MISMATCH, 'the observed accepted-context CAS fingerprint must be supplied');
  }
  if (requestReceipt.accepted_context_cas_fingerprint !== observedCasFingerprint
      || responseReceipt.accepted_context_cas_fingerprint !== observedCasFingerprint) {
    throw new ContractError(CODES.RECEIPT_CAS_MISMATCH,
      'the accepted context moved since these receipts were taken, so they are stale evidence');
  }

  // Freshness. An old receipt proves the exchange happened; it does not prove the answer
  // still describes the present, which is the same rule the edge receipts follow.
  if (!Number.isSafeInteger(freshnessWindow?.period_seconds) || freshnessWindow.period_seconds <= 0
      || !Number.isSafeInteger(freshnessWindow?.grace_seconds) || freshnessWindow.grace_seconds < 0) {
    throw new ContractError(CODES.RECEIPT_STALE, 'a freshness window must be declared before a receipt can be judged fresh');
  }
  if (!Number.isFinite(now)) {
    throw new ContractError(CODES.RECEIPT_STALE, 'the observation instant must be supplied; this module does not read a clock');
  }
  const limit = freshnessWindow.period_seconds + freshnessWindow.grace_seconds;
  for (const [label, receipt] of [['request', requestReceipt], ['response', responseReceipt]]) {
    const ageSeconds = Math.floor((now - Date.parse(receipt.known_at)) / 1000);
    if (ageSeconds < 0) {
      throw new ContractError(CODES.RECEIPT_STALE, `the ${label} receipt is dated after the observation instant`);
    }
    if (ageSeconds > limit) {
      throw new ContractError(CODES.RECEIPT_STALE,
        `the ${label} receipt is outside its freshness window and proves only a past exchange`,
        { age_seconds: ageSeconds, limit_seconds: limit });
    }
  }

  const sufficiency = assessResponseSufficiency(responseCandidate, { requiredAuthorityFamily });
  if (!sufficiency.evidence_sufficient) {
    throw new ContractError(CODES.RESPONSE_EVIDENCE_INSUFFICIENT,
      'the response does not carry sufficient evidence, so the finding stays open and P5 is not reachable',
      { reasons: sufficiency.reasons });
  }
  if (!sufficiency.authority_applicable) {
    throw new ContractError(CODES.RESPONSE_AUTHORITY_NOT_APPLICABLE,
      'the responding authority does not apply here, so the finding stays open and P5 is not reachable',
      { reasons: sufficiency.reasons });
  }

  return {
    boundary: 'p5_acceptance',
    evaluable: true,
    context_request_receipt_id: requestReceipt.context_request_receipt_id,
    context_response_receipt_id: responseReceipt.context_response_receipt_id,
    context_response_id: responseCandidate.context_response_id,
    project_binding_ref: projectBindingRef,
    accepted_context_generation: acceptedContextGeneration,
    sufficiency,
    // Stated so a reader does not have to re-derive it: the candidate was bound to both
    // receipts by content, not merely found next to them.
    linkage_verified: true,
    // Stated rather than left to inference: reaching this point is permission to put the
    // question to a registered human, and nothing else.
    remains_context_candidate: true,
    p5_acceptance_performed: false,
    generation_advanced: false,
    erp_delta: 0,
  };
}

/** What this slice deliberately does not do. Asserted, so it cannot quietly grow. */
export const NON_CAPABILITIES = Object.freeze([
  'transport_or_external_service_call',
  'live_p5_acceptance',
  'accepted_context_generation_advance',
  'erp_write',
  'learned_model_invocation',
]);

export function assertNoTransport(intent) {
  throw new ContractError(CODES.TRANSPORT_REFUSED,
    `this slice records receipts it is handed; "${intent}" would make it a transport`, { non_capabilities: [...NON_CAPABILITIES] });
}
