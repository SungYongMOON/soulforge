// Phase 3 (synthetic) — the Context Request and Context Response receipts.
//
// The frozen runtime sequence puts two immutable receipts and one still-candidate response
// between a gap and a human acceptance, and none of them existed. What existed was a topology
// delivery receipt (about this engine's own edges) and an MCP idempotency response (about a
// repeated request key), and neither is evidence that anybody was asked anything or answered.
//
// Every case here is synthetic. Nothing is transported, no P5 is performed, no generation
// advances and nothing is written.

import { createHash } from 'node:crypto';

import {
  RECEIPT_KINDS, RECEIPT_KIND_OWNERS, CODES as C,
  REQUIRED_REQUEST_RECEIPT_FIELDS, REQUIRED_RESPONSE_RECEIPT_FIELDS, REQUIRED_RESPONSE_CANDIDATE_FIELDS,
  validateContextRequestReceipt, validateContextResponseReceipt, validateResponseCandidate,
  assessResponseSufficiency, assertP5OrchestrationBoundaryEvaluable, assertNoTransport, NON_CAPABILITIES,
} from '../kernel/context_receipt.mjs';
import { REQUIRED_RECEIPT_FIELDS as TOPOLOGY_RECEIPT_FIELDS } from '../kernel/delivery_receipt.mjs';
import { CODES as REG } from '../kernel/registration.mjs';
import { buildRegistrationRegistry, humanEntry, authorityEntry } from '../fixtures/registration_evidence.mjs';
import { resolveIdempotency } from '../kernel/mcp_contract.mjs';
import { ContractError } from '../kernel/errors.mjs';

const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });
const rejects = (id, fn, expectedCode, note = '') => {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  const ok = err instanceof ContractError && (!expectedCode || err.code === expectedCode);
  record(id, ok, ok ? note : `expected ${expectedCode}, got ${err ? err.code : 'no error'}`);
};
const accepts = (id, fn, note = '') => {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  record(id, err === null, err ? `unexpected ${err.code ?? err.message}` : note);
};

{
  const probe = [];
  const rej = (fn, code) => { let e = null; try { fn(); } catch (x) { e = x; } probe.push((e instanceof ContractError && (!code || e.code === code)) === true); };
  rej(() => 1, 'ANY');
  rej(() => { throw new ContractError('OTHER', 'x'); }, 'WANTED');
  rej(() => { throw new ContractError('WANTED', 'x'); }, 'WANTED');
  record('P3/harness/self_test', probe[0] === false && probe[1] === false && probe[2] === true,
    'the reject helper detects what it claims to');
}

// ---------------------------------------------------------------- synthetic material

const uuid = (n) => `a3f1c2d4-5e6f-4a7b-8c9d-${n.toString(16).padStart(12, '0')}`;
const hash = (s) => createHash('sha256').update(s).digest('hex');

const VALID_AT = '2026-08-10T00:00:00.000Z';
const ASKED_AT = '2026-08-10T09:00:00.000Z';
const ANSWERED_AT = '2026-08-10T09:30:00.000Z';
const NOW = Date.parse('2026-08-10T09:45:00.000Z');
const WINDOW = { period_seconds: 3600, grace_seconds: 1800 };
const CAS = hash('accepted-context-generation-7');
const BINDING = 'pb-alpha';
const GENERATION = 7;

const REQUEST_ID = uuid(1);
const REQUEST_RECEIPT_ID = uuid(2);
const RESPONSE_ID = uuid(3);
const RESPONSE_RECEIPT_ID = uuid(4);

const exactRef = (id) => ({ entity_id: id, revision_id: `${id}-r1`, content_id: `${id}-c1`, content_hash_alg: 'sha256' });

const requestReceipt = (over = {}) => ({
  receipt_kind: RECEIPT_KINDS.CONTEXT_REQUEST,
  context_request_receipt_id: REQUEST_RECEIPT_ID,
  context_request_id: REQUEST_ID,
  context_request_content_hash: hash('the question as sent'),
  project_binding_ref: BINDING,
  accepted_context_generation: GENERATION,
  accepted_context_cas_fingerprint: CAS,
  principal_ref: 'person-3', authority_ref: 'authority-registration-1',
  valid_at: VALID_AT, known_at: ASKED_AT,
  immutable: true, is_acceptance: false,
  ...over,
});

const responseReceipt = (over = {}) => ({
  receipt_kind: RECEIPT_KINDS.CONTEXT_RESPONSE,
  context_response_receipt_id: RESPONSE_RECEIPT_ID,
  context_response_id: RESPONSE_ID,
  in_response_to_context_request_id: REQUEST_ID,
  in_response_to_receipt_id: REQUEST_RECEIPT_ID,
  context_response_content_hash: hash('the answer as received'),
  source_revision_refs: [exactRef('src_contract_baseline')],
  artifact_revision_refs: [exactRef('art_interface_spec')],
  project_binding_ref: BINDING,
  accepted_context_generation: GENERATION,
  accepted_context_cas_fingerprint: CAS,
  principal_ref: 'person-3', authority_ref: 'authority-registration-1',
  valid_at: VALID_AT, known_at: ANSWERED_AT,
  immutable: true, is_acceptance: false,
  ...over,
});

// The candidate carries the linkage a real exchange already produced: which request it
// answers, which receipts attest it, what it hashes to, what it cites, who said it and under
// what authority. Nothing here is new information; it is the same information stated where it
// can be compared.
const responseCandidate = (over = {}) => ({
  context_response_id: RESPONSE_ID,
  context_request_id: REQUEST_ID,
  context_response_receipt_id: RESPONSE_RECEIPT_ID,
  in_response_to_receipt_id: REQUEST_RECEIPT_ID,
  context_response_content_hash: hash('the answer as received'),
  project_binding_ref: BINDING,
  accepted_context_generation: GENERATION,
  accepted_context_cas_fingerprint: CAS,
  responding_authority_family: 'project_contract_baseline',
  applicability_components: {
    project_binding: true, jurisdiction: true, time_window: true,
    document_revision: true, approval_scope: true,
  },
  evidence_claim_ceiling: 'source_sufficient',
  source_revision_refs: [exactRef('src_contract_baseline')],
  artifact_revision_refs: [exactRef('art_interface_spec')],
  principal_ref: 'person-3', authority_ref: 'authority-registration-1',
  valid_at: VALID_AT,
  known_at: ANSWERED_AT,
  candidate_only: true, erp_delta: 0, accepted: false,
  ...over,
});

// The authority reference the exchange is conducted under has to resolve to something. Until
// it did, the three records only had to agree on a string, and whoever assembled them wrote all
// three. Synthetic evidence, pinned and content-addressed, exactly as the P5 boundary itself
// requires; it does not settle D-P10-08 any more than the lane 1A fixtures do.
const REG_FROM = '2026-01-01T00:00:00.000Z';
const REG_TO = '2026-12-31T00:00:00.000Z';
const REGISTRY = buildRegistrationRegistry({
  projectBindingRef: BINDING,
  entries: [
    authorityEntry({
      subjectId: 'authority-registration-1', projectBindingRef: BINDING,
      authorityFamily: 'project_contract_baseline', validFrom: REG_FROM, validTo: REG_TO,
    }),
    humanEntry({ subjectId: 'person-3', projectBindingRef: BINDING, validFrom: REG_FROM, validTo: REG_TO }),
  ],
});
const BRAVO_REGISTRY = buildRegistrationRegistry({
  projectBindingRef: 'pb-bravo',
  entries: [authorityEntry({
    subjectId: 'authority-registration-1', projectBindingRef: 'pb-bravo',
    authorityFamily: 'project_contract_baseline', validFrom: REG_FROM, validTo: REG_TO,
  })],
  revisionId: 'registration-registry-bravo-r1',
});

const boundary = (over = {}) => ({
  requestReceipt: requestReceipt(), responseReceipt: responseReceipt(), responseCandidate: responseCandidate(),
  projectBindingRef: BINDING, acceptedContextGeneration: GENERATION, observedCasFingerprint: CAS,
  freshnessWindow: WINDOW, now: NOW, registrationRegistry: REGISTRY,
  ...over,
});

// ---------------------------------------------------------------- four receipt kinds, kept apart

record('P3/kinds/four_distinct_kinds', new Set(Object.values(RECEIPT_KINDS)).size === 4);
record('P3/kinds/owners_declared',
  RECEIPT_KIND_OWNERS[RECEIPT_KINDS.TOPOLOGY_DELIVERY] === 'kernel/delivery_receipt.mjs'
    && RECEIPT_KIND_OWNERS[RECEIPT_KINDS.MCP_IDEMPOTENCY_RESPONSE] === 'kernel/mcp_contract.mjs'
    && RECEIPT_KIND_OWNERS[RECEIPT_KINDS.CONTEXT_REQUEST] === 'kernel/context_receipt.mjs'
    && RECEIPT_KIND_OWNERS[RECEIPT_KINDS.CONTEXT_RESPONSE] === 'kernel/context_receipt.mjs');

// A topology delivery receipt is about an edge in this engine. It cannot stand in for a
// context request receipt, and its field set says so.
record('P3/kinds/topology_receipt_is_not_a_context_receipt',
  TOPOLOGY_RECEIPT_FIELDS.every((f) => !REQUIRED_REQUEST_RECEIPT_FIELDS.includes(f)),
  'the two receipt shapes share no required field');
rejects('P3/kinds/topology_receipt_refused_as_a_request_receipt',
  () => validateContextRequestReceipt({
    edge_key: 'alpha>bravo', observed_at: ASKED_AT, outcome: 'delivered',
    observation_method: 'module_load_observation', run_id: 'run-1',
  }), C.RECEIPT_FIELD_MISSING);

// An MCP idempotency replay says "you already asked this". It is not evidence that anybody
// answered, and it carries no principal, authority or source refs at all.
{
  const store = new Map();
  const req = { idempotency_key: 'k1', operation: 'read_snapshot', payload: { q: 1 } };
  store.set('k1', { operation: 'read_snapshot', payload_digest: resolveIdempotency(new Map(), req).payload_digest, response: { ok: true } });
  const replay = resolveIdempotency(store, req);
  record('P3/kinds/idempotency_replay_is_not_a_response_receipt',
    replay.outcome === 'replay' && !Object.hasOwn(replay, 'principal_ref') && !Object.hasOwn(replay, 'context_response_id'),
    'a retry device does not attest that a principal replied');
  rejects('P3/kinds/idempotency_replay_refused_as_a_response_receipt',
    () => validateContextResponseReceipt(replay), C.RECEIPT_FIELD_MISSING);
}

// ---------------------------------------------------------------- the request receipt

accepts('P3/request/complete_receipt_passes', () => validateContextRequestReceipt(requestReceipt()), 'positive control');
record('P3/request/field_count', REQUIRED_REQUEST_RECEIPT_FIELDS.length === 13);
for (const f of REQUIRED_REQUEST_RECEIPT_FIELDS) {
  rejects(`P3/request/missing_${f}`, () => {
    const r = requestReceipt(); delete r[f]; return validateContextRequestReceipt(r);
  }, C.RECEIPT_FIELD_MISSING);
}
rejects('P3/request/wrong_kind',
  () => validateContextRequestReceipt(requestReceipt({ receipt_kind: RECEIPT_KINDS.CONTEXT_RESPONSE })), C.RECEIPT_KIND_INVALID);
rejects('P3/request/receipt_is_not_the_candidate',
  () => validateContextRequestReceipt(requestReceipt({ context_request_receipt_id: REQUEST_ID })), C.RECEIPT_NOT_DISTINCT,
  'one identifier for both would make "asked" and "recorded as asked" the same record');
rejects('P3/request/mutable_receipt_refused',
  () => validateContextRequestReceipt(requestReceipt({ immutable: false })), C.RECEIPT_NOT_IMMUTABLE);
rejects('P3/request/receipt_claiming_acceptance_refused',
  () => validateContextRequestReceipt(requestReceipt({ is_acceptance: true })), C.RECEIPT_CLAIMS_ACCEPTANCE,
  'a receipt proves transmission; only a registered human accepts');
rejects('P3/request/exact_request_revision_required',
  () => validateContextRequestReceipt(requestReceipt({ context_request_content_hash: 'not-a-hash' })), C.RECEIPT_FIELD_MISSING);
rejects('P3/request/cas_linkage_required',
  () => validateContextRequestReceipt(requestReceipt({ accepted_context_cas_fingerprint: 'nope' })), C.RECEIPT_FIELD_MISSING);
rejects('P3/request/known_at_before_valid_at',
  () => validateContextRequestReceipt(requestReceipt({ known_at: '2026-08-09T00:00:00.000Z' })), C.RECEIPT_FIELD_MISSING);

// ---------------------------------------------------------------- the response receipt

accepts('P3/response/complete_receipt_passes',
  () => validateContextResponseReceipt(responseReceipt(), { requestReceipt: requestReceipt() }), 'positive control');
record('P3/response/field_count', REQUIRED_RESPONSE_RECEIPT_FIELDS.length === 17);
for (const f of REQUIRED_RESPONSE_RECEIPT_FIELDS) {
  rejects(`P3/response/missing_${f}`, () => {
    const r = responseReceipt(); delete r[f]; return validateContextResponseReceipt(r);
  }, C.RECEIPT_FIELD_MISSING);
}
rejects('P3/response/receipt_is_not_the_candidate',
  () => validateContextResponseReceipt(responseReceipt({ context_response_receipt_id: RESPONSE_ID })), C.RECEIPT_NOT_DISTINCT);
rejects('P3/response/source_refs_must_be_exact',
  () => validateContextResponseReceipt(responseReceipt({ source_revision_refs: [{ entity_id: 'src' }] })), C.RECEIPT_FIELD_MISSING,
  'a floating source ref is not a citation');
rejects('P3/response/answers_a_different_request',
  () => validateContextResponseReceipt(responseReceipt({ in_response_to_context_request_id: uuid(99) }), { requestReceipt: requestReceipt() }),
  C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/response/answers_a_different_receipt',
  () => validateContextResponseReceipt(responseReceipt({ in_response_to_receipt_id: uuid(98) }), { requestReceipt: requestReceipt() }),
  C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/response/cross_project_pair',
  () => validateContextResponseReceipt(responseReceipt({ project_binding_ref: 'pb-bravo' }), { requestReceipt: requestReceipt() }),
  C.RECEIPT_CROSS_PROJECT);
rejects('P3/response/generation_moved',
  () => validateContextResponseReceipt(responseReceipt({ accepted_context_generation: 8 }), { requestReceipt: requestReceipt() }),
  C.RECEIPT_GENERATION_MISMATCH);
rejects('P3/response/accepted_context_moved',
  () => validateContextResponseReceipt(responseReceipt({ accepted_context_cas_fingerprint: hash('moved') }), { requestReceipt: requestReceipt() }),
  C.RECEIPT_CAS_MISMATCH);
rejects('P3/response/answer_predates_the_question',
  () => validateContextResponseReceipt(responseReceipt({ known_at: '2026-08-10T08:00:00.000Z' }), { requestReceipt: requestReceipt() }),
  C.RECEIPT_LINKAGE_BROKEN);

// ---------------------------------------------------------------- the response stays a candidate

accepts('P3/candidate/valid_candidate_passes',
  () => validateResponseCandidate(responseCandidate(), { responseReceipt: responseReceipt() }), 'positive control');
record('P3/candidate/field_count', REQUIRED_RESPONSE_CANDIDATE_FIELDS.length === 20,
  `${REQUIRED_RESPONSE_CANDIDATE_FIELDS.length} fields: the twelve of the candidate itself plus eight of linkage`);
for (const f of REQUIRED_RESPONSE_CANDIDATE_FIELDS) {
  rejects(`P3/candidate/missing_${f}`, () => {
    const c = responseCandidate(); delete c[f]; return validateResponseCandidate(c);
  }, undefined);
}
rejects('P3/candidate/an_answer_is_not_accepted_context',
  () => validateResponseCandidate(responseCandidate({ accepted: true })), C.RESPONSE_NOT_CANDIDATE,
  'receiving an answer from an authority does not accept it');
rejects('P3/candidate/candidate_only_must_hold',
  () => validateResponseCandidate(responseCandidate({ candidate_only: false })), C.RESPONSE_NOT_CANDIDATE);
rejects('P3/candidate/no_erp_delta',
  () => validateResponseCandidate(responseCandidate({ erp_delta: 1 })), C.RESPONSE_NOT_CANDIDATE);
rejects('P3/candidate/belongs_to_its_receipt',
  () => validateResponseCandidate(responseCandidate({ context_response_id: uuid(97) }), { responseReceipt: responseReceipt() }),
  C.RECEIPT_LINKAGE_BROKEN);

// ---------------------------------------------------------------- the candidate is bound to
// its exchange, by content
//
// The hole this section closes: the candidate used to be checked on its response id, its
// binding and its generation, and nothing else. So an answer to request B — carrying source B,
// hashing to something else entirely, from a different principal — passed against the receipt
// pair for request A, as long as the two exchanges happened to share a response id. Everything
// the receipts attest is now compared to what the candidate claims.

const EXCHANGE_B = {
  requestId: uuid(11), requestReceiptId: uuid(12),
};

accepts('P3/linkage/positive_control_bound_to_both_receipts',
  () => validateResponseCandidate(responseCandidate(), { responseReceipt: responseReceipt(), requestReceipt: requestReceipt() }),
  'a candidate whose every linkage field matches both receipts');
{
  const r = validateResponseCandidate(responseCandidate(), { responseReceipt: responseReceipt(), requestReceipt: requestReceipt() });
  record('P3/linkage/reports_that_both_halves_were_checked', r.linkage_checked === true);
  const half = validateResponseCandidate(responseCandidate(), { responseReceipt: responseReceipt() });
  record('P3/linkage/one_receipt_is_not_full_linkage', half.linkage_checked === false,
    'checking against the response receipt alone leaves the request side unproven');
}

// THE SPLICE: request A with receipt A, and a candidate that answers request B carrying
// source B. Every individual record is internally valid; the combination is not one exchange.
rejects('P3/linkage/request_a_receipt_a_with_request_b_candidate',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    responseCandidate: responseCandidate({
      context_request_id: EXCHANGE_B.requestId,
      in_response_to_receipt_id: EXCHANGE_B.requestReceiptId,
      source_revision_refs: [exactRef('src_exchange_b')],
    }),
  })), C.RECEIPT_LINKAGE_BROKEN,
  'an answer to another question, presented against this question\'s receipts');
rejects('P3/linkage/candidate_answers_a_different_request',
  () => validateResponseCandidate(responseCandidate({ context_request_id: EXCHANGE_B.requestId }),
    { responseReceipt: responseReceipt(), requestReceipt: requestReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
// The two halves are checked separately as well as together, because a caller holding only one
// receipt still gets a decision, and each half has to be able to refuse on its own.
rejects('P3/linkage/response_receipt_alone_catches_the_wrong_request',
  () => validateResponseCandidate(responseCandidate({ context_request_id: EXCHANGE_B.requestId }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/request_receipt_alone_catches_the_wrong_request',
  () => validateResponseCandidate(responseCandidate({ context_request_id: EXCHANGE_B.requestId }),
    { requestReceipt: requestReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/request_receipt_alone_catches_a_cross_project_candidate',
  () => validateResponseCandidate(responseCandidate({ project_binding_ref: 'pb-bravo' }),
    { requestReceipt: requestReceipt() }), C.RECEIPT_CROSS_PROJECT);
rejects('P3/linkage/request_receipt_alone_catches_a_moved_cas',
  () => validateResponseCandidate(responseCandidate({ accepted_context_cas_fingerprint: hash('moved') }),
    { requestReceipt: requestReceipt() }), C.RECEIPT_CAS_MISMATCH);
rejects('P3/linkage/candidate_names_a_different_request_receipt',
  () => validateResponseCandidate(responseCandidate({ in_response_to_receipt_id: EXCHANGE_B.requestReceiptId }),
    { responseReceipt: responseReceipt(), requestReceipt: requestReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/candidate_names_a_different_response_receipt',
  () => validateResponseCandidate(responseCandidate({ context_response_receipt_id: uuid(96) }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/candidate_content_hash_does_not_match',
  () => validateResponseCandidate(responseCandidate({ context_response_content_hash: hash('a different answer') }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_CAS_MISMATCH,
  'the candidate is not the response revision the receipt pinned');
rejects('P3/linkage/candidate_cites_other_sources',
  () => validateResponseCandidate(responseCandidate({ source_revision_refs: [exactRef('src_exchange_b')] }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/candidate_cites_another_revision_of_the_same_source',
  () => validateResponseCandidate(responseCandidate({
    source_revision_refs: [{ ...exactRef('src_contract_baseline'), revision_id: 'src_contract_baseline-r2' }],
  }), { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN,
  'the same document at a different revision is different evidence');
rejects('P3/linkage/candidate_cites_other_artifacts',
  () => validateResponseCandidate(responseCandidate({ artifact_revision_refs: [exactRef('art_exchange_b')] }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/candidate_adds_a_source_the_receipt_never_attested',
  () => validateResponseCandidate(responseCandidate({
    source_revision_refs: [exactRef('src_contract_baseline'), exactRef('src_smuggled')],
  }), { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/candidate_names_another_principal',
  () => validateResponseCandidate(responseCandidate({ principal_ref: 'person-9' }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/candidate_names_another_authority_registration',
  () => validateResponseCandidate(responseCandidate({ authority_ref: 'authority-registration-9' }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/candidate_is_dated_differently',
  () => validateResponseCandidate(responseCandidate({ known_at: '2026-08-10T09:31:00.000Z' }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_LINKAGE_BROKEN);
rejects('P3/linkage/candidate_cas_moved',
  () => validateResponseCandidate(responseCandidate({ accepted_context_cas_fingerprint: hash('moved') }),
    { responseReceipt: responseReceipt() }), C.RECEIPT_CAS_MISMATCH);
rejects('P3/linkage/candidate_content_hash_must_be_a_hash',
  () => validateResponseCandidate(responseCandidate({ context_response_content_hash: 'not-a-hash' })),
  C.RECEIPT_FIELD_MISSING);
rejects('P3/linkage/candidate_needs_a_principal',
  () => validateResponseCandidate(responseCandidate({ principal_ref: '' })), C.RECEIPT_FIELD_MISSING);
rejects('P3/linkage/candidate_needs_a_canonical_valid_at',
  () => validateResponseCandidate(responseCandidate({ valid_at: 'yesterday' })), C.RECEIPT_FIELD_MISSING);

// The P5 boundary is not reachable while any of it is unproven, and it says so in one field.
{
  const r = assertP5OrchestrationBoundaryEvaluable(boundary());
  record('P3/linkage/p5_boundary_states_linkage_verified', r.linkage_verified === true);
}
rejects('P3/linkage/p5_not_evaluable_on_a_spliced_source',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    responseCandidate: responseCandidate({ source_revision_refs: [exactRef('src_exchange_b')] }),
  })), C.RECEIPT_LINKAGE_BROKEN,
  'evaluability is false unless every linkage check passes, not only the sufficiency ones');

// ---------------------------------------------------------------- sufficiency and applicability

{
  const s = assessResponseSufficiency(responseCandidate(), { requiredAuthorityFamily: 'company_approved_procedure' });
  record('P3/sufficiency/positive_control', s.sufficient === true && s.evidence_sufficient && s.authority_applicable);
}
{
  const s = assessResponseSufficiency(responseCandidate({ evidence_claim_ceiling: 'source_referenced' }));
  record('P3/sufficiency/a_ref_is_not_sufficiency', s.evidence_sufficient === false && s.sufficient === false,
    'source_referenced says a ref exists, not that it covers the claim');
}
{
  const s = assessResponseSufficiency(responseCandidate({ source_revision_refs: [] }));
  record('P3/sufficiency/no_citable_source', s.evidence_sufficient === false && s.reasons.includes('no_resolvable_source_ref'));
}
{
  const s = assessResponseSufficiency(responseCandidate({
    applicability_components: { project_binding: true, jurisdiction: 'unknown', time_window: true, document_revision: true, approval_scope: true },
  }));
  record('P3/sufficiency/unresolved_applicability_is_not_applicable',
    s.authority_applicable === false && s.applicability === 'unknown',
    'one unresolved component makes the whole applicability unknown');
}
{
  const s = assessResponseSufficiency(responseCandidate({ responding_authority_family: 'reviewed_wiki' }),
    { requiredAuthorityFamily: 'project_contract_baseline' });
  record('P3/sufficiency/authority_below_what_was_sought',
    s.authority_applicable === false && s.reasons.includes('authority_below_the_family_the_question_sought'));
}
{
  const s = assessResponseSufficiency(responseCandidate({ responding_authority_family: 'vendor_blog' }));
  record('P3/sufficiency/unregistered_family', s.authority_applicable === false && s.reasons.includes('unregistered_authority_family'));
}

// ---------------------------------------------------------------- the P5 orchestration boundary

accepts('P3/p5_boundary/complete_pair_is_evaluable', () => assertP5OrchestrationBoundaryEvaluable(boundary()), 'positive control');
{
  const r = assertP5OrchestrationBoundaryEvaluable(boundary());
  record('P3/p5_boundary/still_a_candidate', r.remains_context_candidate === true);
  record('P3/p5_boundary/no_acceptance_performed', r.p5_acceptance_performed === false);
  record('P3/p5_boundary/no_generation_advance', r.generation_advanced === false);
  record('P3/p5_boundary/no_erp_delta', r.erp_delta === 0);
  record('P3/p5_boundary/names_both_receipts',
    r.context_request_receipt_id === REQUEST_RECEIPT_ID && r.context_response_receipt_id === RESPONSE_RECEIPT_ID);
}

// Both receipts are required. Either one alone stops the sequence.
for (const missing of ['requestReceipt', 'responseReceipt', 'responseCandidate']) {
  rejects(`P3/p5_boundary/missing_${missing}`,
    () => assertP5OrchestrationBoundaryEvaluable(boundary({ [missing]: null })), C.P5_BOUNDARY_NOT_EVALUABLE);
}
rejects('P3/p5_boundary/one_record_counted_twice',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    responseReceipt: responseReceipt({ context_response_receipt_id: REQUEST_RECEIPT_ID }),
  })), C.RECEIPT_NOT_DISTINCT);

rejects('P3/p5_boundary/cross_project_request',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ projectBindingRef: 'pb-bravo' })), C.RECEIPT_CROSS_PROJECT);
rejects('P3/p5_boundary/cross_project_candidate',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ responseCandidate: responseCandidate({ project_binding_ref: 'pb-bravo' }) })),
  C.RECEIPT_CROSS_PROJECT);
rejects('P3/p5_boundary/generation_mismatch',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ acceptedContextGeneration: 8 })), C.RECEIPT_GENERATION_MISMATCH);
rejects('P3/p5_boundary/accepted_context_moved',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ observedCasFingerprint: hash('moved') })), C.RECEIPT_CAS_MISMATCH,
  'receipts taken against a state that has since moved are stale evidence');

// Stale. A response is always at least as recent as the request it answers, so the pair goes
// stale together; the response-side case that can stand alone is one dated after the instant
// the run is judging at, which is a receipt claiming to know the future.
// The candidate travels with its receipts, because a real old exchange is old on every
// record. Moving only the receipts would test the linkage check, not the freshness one.
rejects('P3/p5_boundary/stale_pair',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    requestReceipt: requestReceipt({ valid_at: '2026-07-01T00:00:00.000Z', known_at: '2026-07-01T00:00:00.000Z' }),
    responseReceipt: responseReceipt({ valid_at: '2026-07-01T00:00:00.000Z', known_at: '2026-07-01T01:00:00.000Z' }),
    responseCandidate: responseCandidate({ valid_at: '2026-07-01T00:00:00.000Z', known_at: '2026-07-01T01:00:00.000Z' }),
  })), C.RECEIPT_STALE, 'an old exchange proves the exchange, not that the answer still holds');
rejects('P3/p5_boundary/response_dated_after_the_observation_instant',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    responseReceipt: responseReceipt({ known_at: '2026-08-10T10:30:00.000Z' }),
    responseCandidate: responseCandidate({ known_at: '2026-08-10T10:30:00.000Z' }),
  })), C.RECEIPT_STALE);
rejects('P3/p5_boundary/window_must_be_declared',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ freshnessWindow: undefined })), C.RECEIPT_STALE);
rejects('P3/p5_boundary/instant_must_be_supplied',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ now: undefined })), C.RECEIPT_STALE,
  'the module does not read a clock, so a replay gives the same verdict');
accepts('P3/p5_boundary/positive_control_inside_the_window',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ now: Date.parse(ANSWERED_AT) + 1000 })), 'positive control');

// Insufficient evidence and inapplicable authority each stop the sequence, separately.
rejects('P3/p5_boundary/insufficient_evidence_stops',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    responseCandidate: responseCandidate({ evidence_claim_ceiling: 'source_referenced' }),
  })), C.RESPONSE_EVIDENCE_INSUFFICIENT);
rejects('P3/p5_boundary/inapplicable_authority_stops',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    responseCandidate: responseCandidate({
      applicability_components: { project_binding: false, jurisdiction: true, time_window: true, document_revision: true, approval_scope: true },
    }),
  })), C.RESPONSE_AUTHORITY_NOT_APPLICABLE);
rejects('P3/p5_boundary/a_receipt_cannot_declare_acceptance',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ responseReceipt: responseReceipt({ is_acceptance: true }) })),
  C.RECEIPT_CLAIMS_ACCEPTANCE);

// ---------------------------------------------------------------- B-07: the authority_ref
//
// The reproduced attack, first. A request receipt, a response receipt and a candidate all
// naming one arbitrary authority reference used to make P5 evaluable: the three records agreed,
// every linkage check passed, and nothing asked whether the thing they agreed about exists.
// Whoever assembles the three writes all three, so the agreement cost the attacker nothing.

{
  const invented = 'authority-registration-invented';
  let refusal = null;
  try {
    assertP5OrchestrationBoundaryEvaluable(boundary({
      requestReceipt: requestReceipt({ authority_ref: invented }),
      responseReceipt: responseReceipt({ authority_ref: invented }),
      responseCandidate: responseCandidate({ authority_ref: invented }),
    }));
  } catch (e) { refusal = e; }
  record('P3/p5_boundary/shared_nonexistent_authority_ref_is_not_evaluable',
    refusal?.code === C.AUTHORITY_REF_NOT_REGISTERED,
    refusal ? `${refusal.code} (cause ${refusal.detail?.cause_code})` : 'NOT REFUSED — three records agreed about nothing');
  record('P3/p5_boundary/refusal_names_the_registration_cause',
    refusal?.detail?.cause_code === REG.SUBJECT_NOT_REGISTERED
      && refusal.detail.authority_family === 'project_contract_baseline',
    'the refusal says which family it looked under and what the registration check answered');
}
rejects('P3/p5_boundary/registration_evidence_is_required',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ registrationRegistry: undefined })),
  C.AUTHORITY_REF_NOT_REGISTERED, 'with no evidence supplied there is nothing to resolve the reference in');
rejects('P3/p5_boundary/authority_registered_in_another_project',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({ registrationRegistry: BRAVO_REGISTRY })),
  C.AUTHORITY_REF_NOT_REGISTERED, 'the same reference registered for another project does not carry into this one');
rejects('P3/p5_boundary/authority_registered_for_another_family',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    responseCandidate: responseCandidate({ responding_authority_family: 'reviewed_wiki' }),
  })),
  C.AUTHORITY_REF_NOT_REGISTERED, 'the entry covers this reference under the baseline family and does not carry to another');
rejects('P3/p5_boundary/authority_outside_its_registration_window',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    requestReceipt: requestReceipt({ valid_at: '2027-03-01T00:00:00.000Z', known_at: '2027-03-01T09:00:00.000Z' }),
    responseReceipt: responseReceipt({ valid_at: '2027-03-01T00:00:00.000Z', known_at: '2027-03-01T09:30:00.000Z' }),
    responseCandidate: responseCandidate({ valid_at: '2027-03-01T00:00:00.000Z', known_at: '2027-03-01T09:30:00.000Z' }),
    now: Date.parse('2027-03-01T09:45:00.000Z'),
  })),
  C.AUTHORITY_REF_NOT_REGISTERED, 'a lapsed registration does not make a later exchange evaluable');
rejects('P3/p5_boundary/forged_registry_entry_refused',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    requestReceipt: requestReceipt({ authority_ref: 'authority-smuggled' }),
    responseReceipt: responseReceipt({ authority_ref: 'authority-smuggled' }),
    responseCandidate: responseCandidate({ authority_ref: 'authority-smuggled' }),
    registrationRegistry: {
      ...REGISTRY,
      entries: [...REGISTRY.entries, authorityEntry({
        subjectId: 'authority-smuggled', projectBindingRef: BINDING,
        authorityFamily: 'project_contract_baseline', validFrom: REG_FROM, validTo: REG_TO,
      })],
    },
  })),
  C.AUTHORITY_REF_NOT_REGISTERED, 'appending an entry breaks the address the registry declares about itself');
rejects('P3/p5_boundary/two_halves_naming_different_authorities',
  () => assertP5OrchestrationBoundaryEvaluable(boundary({
    requestReceipt: requestReceipt({ authority_ref: 'authority-registration-2' }),
  })),
  C.RECEIPT_LINKAGE_BROKEN, 'a pair whose halves name different authorities is not one exchange under one authority');

{
  // The paired positive control. Everything the boundary is supposed to keep is still intact:
  // it names one registered authority, and it remains an evaluation of whether a question can
  // be put to a human — no acceptance, no generation advance, no ledger delta, both receipts
  // linked by content.
  const r = assertP5OrchestrationBoundaryEvaluable(boundary());
  record('P3/p5_boundary/registered_authority_positive_control',
    r.evaluable === true
      && r.authority_registration.authority_ref === 'authority-registration-1'
      && r.authority_registration.authority_family === 'project_contract_baseline'
      && r.authority_registration.registry_revision_id === REGISTRY.registry_revision_ref.revision_id
      && /^[0-9a-f]{64}$/.test(r.authority_registration.entry_content_address),
    'the reference resolves in the evidence and the verdict says which entry resolved it');
  record('P3/p5_boundary/registration_does_not_turn_the_candidate_into_an_acceptance',
    r.remains_context_candidate === true
      && r.p5_acceptance_performed === false
      && r.generation_advanced === false
      && r.erp_delta === 0
      && r.linkage_verified === true
      && r.context_request_receipt_id === REQUEST_RECEIPT_ID
      && r.context_response_receipt_id === RESPONSE_RECEIPT_ID,
    'candidate-only, zero generation advance, and the exact two-receipt linkage all survive the new check');
}

// ---------------------------------------------------------------- what this slice will not do

record('P3/non_capabilities_declared', NON_CAPABILITIES.length === 5
  && NON_CAPABILITIES.includes('transport_or_external_service_call')
  && NON_CAPABILITIES.includes('live_p5_acceptance')
  && NON_CAPABILITIES.includes('erp_write'));
rejects('P3/transport_refused', () => assertNoTransport('send_the_request_over_http'), C.TRANSPORT_REFUSED);

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'phase_3_context_request_and_response_receipts',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  verification_strength: 'author_written_fixtures',
  independent_lock_owed_by: 'lane_1V',
  honest_limits: [
    'every receipt here is handed to the module; nothing was transported, so this says nothing about a real exchange',
    'reaching the P5 boundary means the question may be put to a registered human, not that anything was accepted',
    'the fixtures and the rules share one author, so a rule wrong in both survives this',
  ],
  p5_acceptance_performed: 0,
  generation_advances: 0,
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
