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

import { createHash } from 'node:crypto';
import { OPERATIONS } from './mcp_contract.mjs';
import { canonicalise, inspectInstant } from './canonical.mjs';
import { CANONICAL } from './contract_config.mjs';
import { AUTHORITY_FAMILIES } from './authority.mjs';
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
  POLICY_CHECK_FAILED: 'P7_POLICY_CHECK_FAILED',
  TASK_DRIVER_NOT_EVALUATED: 'P7_TASK_DRIVER_NOT_EVALUATED',
  TASK_DRIVER_ACTIVATION_REFUSED: 'P7_TASK_DRIVER_ACTIVATION_REFUSED',
  WRITE_CHAIN_INCOMPLETE: 'P8_WRITE_CHAIN_INCOMPLETE',
  WRITE_CHAIN_MISMATCH: 'P8_WRITE_CHAIN_MISMATCH',
  WRITE_CHAIN_CROSS_PROJECT: 'P8_WRITE_CHAIN_CROSS_PROJECT',
  WRITE_APPROVAL_NOT_HUMAN: 'P8_WRITE_APPROVAL_NOT_HUMAN',
  WRITE_EVIDENCE_NOT_IMMUTABLE: 'P8_WRITE_EVIDENCE_NOT_IMMUTABLE',
});

/** Derived from lane 1D so the two cannot drift. */
export const SERIALISED_BOUNDARIES = Object.freeze(
  Object.entries(OPERATIONS)
    .filter(([, o]) => o.concurrency === 'serialised')
    .map(([operation, o]) => ({ operation, lane: o.lane }))
    .sort((a, b) => (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : 0)),
);

export const BOUNDARY_LANES = Object.freeze(SERIALISED_BOUNDARIES.map((b) => b.lane));

/** The four checks the frozen lifecycle puts between P6 and P7, in the frozen order. */
export const TASK_DRIVER_POLICY_CHECKS = Object.freeze(['why', 'why_now', 'authority', 'idempotency']);

export const POLICY_GATE_ID = 'why_why_now_authority_and_idempotency';

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
 * P7 is the TaskDriver stage, and it is preceded by an internal policy gate.
 *
 * V1.2 3.3, V1.2.1 6.2 and the frozen work-lanes runtime sequence agree on the shape:
 *
 *   P6 TaskIntent candidate
 *   -> why / why-now / authority / idempotency internal policy gate
 *   -> P7 TaskDriver
 *   -> separately authorised external P8 sole writer
 *
 * V1.2 described the four checks as behaviour inside P7. V1.2.1 promoted them to a separate
 * gate that cannot be bypassed, without weakening any of them. Both readings are honoured
 * here by evaluating the gate as its own function whose result P7 requires.
 *
 * Nothing in this module activates a live TaskDriver. Evaluating P7 produces a candidate
 * verdict and an ERP delta of zero; the writer that could act on it is a separate boundary
 * with a separate approval that this engine does not hold.
 */
export const P7 = Object.freeze({
  stage: 'P7',
  gate_id: 'p7_taskdriver',
  name: 'task_driver',
  preceded_by_gate_id: POLICY_GATE_ID,
  policy_checks: [...TASK_DRIVER_POLICY_CHECKS],
  activation_state: 'not_activated',
  erp_delta: 0,
});

export const DEFINED_STAGES = Object.freeze(['P5', 'P6', 'P7', 'P8']);

export function assertStageDefined(stage) {
  if (!DEFINED_STAGES.includes(stage)) {
    throw new ContractError(CODES.STAGE_NOT_DEFINED,
      `"${stage}" is not a stage the frozen lifecycle defines`, { stage, defined: [...DEFINED_STAGES] });
  }
  return true;
}

/**
 * The internal policy gate: why, why-now, authority, idempotency.
 *
 * Each check is answered from supplied evidence rather than asserted by the caller. `why`
 * has to point at the finding the work comes from; `why_now` has to point at a trigger with
 * a time; `authority` has to name a registered authority that actually applies; and
 * `idempotency` has to be a key bound to a payload digest, so a retry is distinguishable
 * from a second, different request wearing the same key.
 *
 * A failing check is named. An aggregate "policy gate failed" would let a caller retry
 * blindly until something passed.
 */
export function evaluateTaskDriverPolicyGate({ taskIntent, why, whyNow, authority, idempotency, knownAt }) {
  const failed = [];
  if (!taskIntent || typeof taskIntent.task_intent_id !== 'string' || !taskIntent.task_intent_id) {
    throw new ContractError(CODES.POLICY_CHECK_FAILED, 'the policy gate needs the P6 task intent it is judging');
  }
  // why: the reason has to be a finding this intent actually came from
  if (!why || why.finding_id !== taskIntent.finding_id || typeof why.rationale_ref !== 'string' || !why.rationale_ref) {
    failed.push('why');
  }
  // why-now: a trigger with a canonical instant, not "it is on the list"
  if (!whyNow || typeof whyNow.trigger_ref !== 'string' || !whyNow.trigger_ref || !inspectInstant(whyNow.triggered_at).valid) {
    failed.push('why_now');
  }
  // authority: registered, and applicable here
  if (!authority || typeof authority.authority_ref !== 'string' || !authority.authority_ref
      || authority.registered !== true || authority.applicability !== true) {
    failed.push('authority');
  }
  // idempotency: a key that promises a payload
  if (!idempotency || typeof idempotency.idempotency_key !== 'string' || !idempotency.idempotency_key
      || typeof idempotency.payload_digest !== 'string' || idempotency.payload_digest.length !== 64
      || idempotency.conflicting_prior_use === true) {
    failed.push('idempotency');
  }
  if (!inspectInstant(knownAt).valid) failed.push('known_at');

  if (failed.length) {
    throw new ContractError(CODES.POLICY_CHECK_FAILED,
      'the internal policy gate before P7 did not pass every check', { failed_checks: failed });
  }
  return {
    gate_id: POLICY_GATE_ID,
    task_intent_id: taskIntent.task_intent_id,
    finding_id: taskIntent.finding_id,
    checks: Object.fromEntries(TASK_DRIVER_POLICY_CHECKS.map((c) => [c, true])),
    passed: true,
    idempotency_key: idempotency.idempotency_key,
    known_at: knownAt,
    erp_delta: 0,
  };
}

/**
 * Evaluates P7 for one task intent.
 *
 * The policy gate result is required as input, so the gate cannot be skipped by calling P7
 * directly. The verdict is candidate-only and states that no driver was activated, because
 * activating one is a separate authority this engine does not hold.
 */
export function evaluateP7TaskDriver({ policyGate, taskIntent, projectBindingRef }) {
  if (!policyGate || policyGate.gate_id !== POLICY_GATE_ID || policyGate.passed !== true) {
    throw new ContractError(CODES.TASK_DRIVER_NOT_EVALUATED,
      'P7 requires a passed why / why-now / authority / idempotency gate result as its input');
  }
  if (!taskIntent || policyGate.task_intent_id !== taskIntent.task_intent_id) {
    throw new ContractError(CODES.TASK_DRIVER_NOT_EVALUATED, 'the policy gate result names a different task intent');
  }
  if (typeof projectBindingRef !== 'string' || !projectBindingRef || taskIntent.project_binding_ref !== projectBindingRef) {
    throw new ContractError(CODES.TASK_DRIVER_NOT_EVALUATED, 'the task intent is bound to a different project');
  }
  assertZeroErpDelta(taskIntent);
  return {
    stage: 'P7',
    gate_id: P7.gate_id,
    policy_gate_id: policyGate.gate_id,
    task_intent_id: taskIntent.task_intent_id,
    finding_id: taskIntent.finding_id,
    project_binding_ref: projectBindingRef,
    idempotency_key: policyGate.idempotency_key,
    // Candidate-only by construction. P7 decides whether a driver *would* run; running one
    // is P8's writer, which is external and separately authorised.
    candidate_only: true,
    driver_activated: false,
    erp_delta: 0,
  };
}

/** Refuses any attempt to treat an evaluated P7 verdict as an activated driver. */
export function assertTaskDriverNotActivated(verdict) {
  if (verdict?.driver_activated === true) {
    throw new ContractError(CODES.TASK_DRIVER_ACTIVATION_REFUSED,
      'a live TaskDriver is not activated by this engine; P7 here evaluates a candidate verdict only');
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
 * The elements a P8 write has to be able to point at, in the frozen lifecycle order.
 *
 * Named as a list because the failure this guards is a chain evaluated one link at a time:
 * each link looked fine on its own and nobody checked that they were links of the same
 * chain.
 */
export const REQUIRED_P8_CHAIN_ELEMENTS = Object.freeze([
  'project_binding_ref',
  'accepted_context_generation',
  'p5_acceptance',
  'generation_advance',
  'snapshot',
  'finding',
  'disposition_event',
  'context_authority_gate',
  'task_intent',
  'policy_gate',
  'task_driver',
  'evidence',
]);

/**
 * The chain elements that are records rather than scalars, and therefore have to carry their
 * own immutable provenance. The two scalars are checked separately: they are the binding and
 * the generation every record has to agree with.
 */
export const P8_CHAIN_RECORD_ELEMENTS = Object.freeze(
  REQUIRED_P8_CHAIN_ELEMENTS.filter((k) => k !== 'project_binding_ref' && k !== 'accepted_context_generation'),
);

/**
 * The elements P8 recomputes instead of believing, and the boundary function that decides
 * each one. A recorded verdict is a claim that a function was run; recomputing it from the
 * inputs the record carries is the only way to find out whether the claim is true.
 */
export const P8_RECOMPUTED_CHAIN_ELEMENTS = Object.freeze([
  'p5_acceptance', 'generation_advance', 'policy_gate', 'task_driver',
]);

export const REQUIRED_CHAIN_PROVENANCE_FIELDS = Object.freeze([
  'immutable', 'content_address', 'project_binding_ref', 'recorded_at',
]);

const AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((f) => f.key));
const HUMAN_APPROVER_KIND = 'registered_human';
const IS_SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Declares an insertion order for every array inside a value.
 *
 * `canonicalise` refuses an array with no declared order rule, which is right for a
 * fingerprint over accepted inputs: there, the order either carries meaning or it must be
 * sorted, and guessing would let two different input sets share a fingerprint. A content
 * address answers a different question — "are these the exact bytes that were recorded" — and
 * for that, recorded order *is* the content. So the rule is declared rather than inferred.
 */
function insertionOrderRulesFor(value, path = '', rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = 'insertion_ordered';
    for (const element of value) insertionOrderRulesFor(element, `${path}[]`, rules);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      insertionOrderRulesFor(child, path ? `${path}.${key}` : key, rules);
    }
  }
  return rules;
}

/**
 * The content address of one recorded chain element.
 *
 * Computed over the element as recorded, minus its own provenance block — an address cannot
 * include itself. The element name is in the material, so the same bytes recorded as two
 * different links do not share an address.
 *
 * This is what makes "immutable" checkable. A record that merely says `immutable: true` is a
 * record asserting a property about itself; a record whose declared address is recomputed
 * from its own content either matches or has been edited since it was written.
 */
export function chainElementContentAddress(name, element) {
  const { provenance: _ignored, ...material } = element ?? {};
  const body = canonicalise(material, insertionOrderRulesFor(material));
  return createHash(CANONICAL.hashAlgorithm)
    .update(`soulforge.se_engine.p8_chain_element.v0\n${name}\n${body}`)
    .digest('hex');
}

/**
 * Verifies that one chain element is immutable, addressed, bound and dated — and that the
 * address it declares is the address its own content produces.
 */
function assertChainElementProvenance(name, element, binding) {
  if (element === null || typeof element !== 'object' || Array.isArray(element)) {
    throw new ContractError(CODES.WRITE_CHAIN_INCOMPLETE, `chain element "${name}" is not a record`, { element: name });
  }
  const provenance = element.provenance;
  if (provenance === null || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      `chain element "${name}" carries no provenance, so nothing about it can be checked`, { element: name });
  }
  for (const field of REQUIRED_CHAIN_PROVENANCE_FIELDS) {
    if (!Object.hasOwn(provenance, field)) {
      throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
        `chain element "${name}" provenance is missing "${field}"`, { element: name, field });
    }
  }
  if (provenance.immutable !== true) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      `chain element "${name}" is not immutable; a rewritable link proves nothing about what happened`, { element: name });
  }
  if (!IS_SHA256_HEX.test(provenance.content_address ?? '')) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      `chain element "${name}" declares no content address`, { element: name });
  }
  if (provenance.project_binding_ref !== binding) {
    throw new ContractError(CODES.WRITE_CHAIN_CROSS_PROJECT,
      `chain element "${name}" was recorded under a different project binding`, { element: name });
  }
  if (!inspectInstant(provenance.recorded_at).valid) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      `chain element "${name}" provenance carries no canonical recorded_at`, { element: name });
  }
  let recomputed = null;
  try {
    recomputed = chainElementContentAddress(name, element);
  } catch (e) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      `chain element "${name}" cannot be canonically addressed, so its immutability cannot be verified`,
      { element: name, cause_code: e?.code ?? null });
  }
  if (recomputed !== provenance.content_address) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      `chain element "${name}" does not hash to the content address it declares; it was altered after it was recorded`,
      { element: name });
  }
  return recomputed;
}

/**
 * The verdict part of a record: everything except the three fields that are *about* the
 * record rather than part of what the boundary decided.
 *
 * `provenance` and `recompute_inputs` are the record's own scaffolding. `project_binding_ref`
 * is stripped because not every boundary function returns one, while every chain record has to
 * carry one — it is checked directly, against the chain binding, before this comparison runs,
 * so removing it here narrows nothing.
 */
const recordedVerdictOf = (element) => {
  const { provenance: _p, recompute_inputs: _r, project_binding_ref: _b, ...verdict } = element;
  return verdict;
};

/**
 * Recomputes a boundary verdict and refuses anything that does not reproduce exactly.
 *
 * The comparison is over the canonical form of the whole verdict, not over a handful of
 * fields, because a spot check tells a forger which fields to keep consistent.
 */
function assertRecomputes(name, element, recompute, { requiresInputs = true } = {}) {
  const inputs = element.recompute_inputs;
  if (requiresInputs && (inputs === null || typeof inputs !== 'object' || Array.isArray(inputs))) {
    throw new ContractError(CODES.WRITE_CHAIN_INCOMPLETE,
      `chain element "${name}" carries no recompute inputs, so its verdict cannot be verified and is not believed`,
      { element: name });
  }
  let produced = null;
  try {
    produced = recompute(inputs);
  } catch (e) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
      `chain element "${name}" does not recompute: the boundary it claims to record refuses its own inputs`,
      { element: name, cause_code: e?.code ?? null });
  }
  const recorded = recordedVerdictOf(element);
  const expected = recordedVerdictOf(produced);
  const rules = { ...insertionOrderRulesFor(recorded), ...insertionOrderRulesFor(expected) };
  if (canonicalise(recorded, rules) !== canonicalise(expected, rules)) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
      `chain element "${name}" does not match the verdict its own inputs produce`, { element: name });
  }
  return produced;
}

/**
 * Evaluates a P8 ERP write, and performs none.
 *
 * This is a gate, not a writer. It answers one question: would the frozen lifecycle permit
 * this write? Nothing in this engine holds the external sole-writer authority, so the result
 * always reports `erp_write_performed: false`.
 *
 * The rule that matters is what it refuses. A task intent that has merely stopped calling
 * itself a candidate proves nothing; `candidate_only === false` is a necessary condition and
 * never a sufficient one. The write has to be able to name, and to agree with, every element
 * of the chain the frozen sequence puts in front of it:
 *
 *   accepted context generation -> immutable snapshot -> finding -> disposition event
 *   -> context/authority gate -> P6 task intent -> policy gate -> P7 task driver
 *
 * plus one project binding shared by all of them, and immutable receipt/CAS evidence that
 * the state has not moved underneath the request. Anything missing, stale, mismatched,
 * cross-project, AI-approved or unauthorised is refused.
 *
 * Three things this gate deliberately refuses to do, because each of them was how a forged
 * chain used to get through:
 *
 * 1. It does not read object shape as evidence. Every record has to carry immutable
 *    provenance whose content address is recomputed here from the record's own content, so a
 *    link edited after it was written fails even though every field still looks right.
 * 2. It does not believe `passed: true`. The P5 acceptance, the generation advance, the
 *    policy gate and P7 are re-run over the inputs they carry, and the recorded verdict has to
 *    reproduce exactly. A verdict nobody can recompute is a claim, not a result.
 * 3. It checks the binding on every element, not on the four that were easiest to reach.
 *    Partial coverage is what makes a cross-project chain assemblable in the first place.
 */
export function evaluateP8Write({ principal, approval, chain, submittedFingerprint, observedFingerprint }) {
  assertRegisteredHuman(principal, CODES.PRINCIPAL_NOT_REGISTERED_HUMAN);

  if (!approval || approval.approved !== true || !approval.approver_principal_id) {
    throw new ContractError(CODES.WRITE_WITHOUT_APPROVAL,
      'a P8 write requires an explicit approval naming its approver');
  }
  // An approval produced by a model, an agent or the engine is not an approval. The engine
  // may propose; it may not be the thing that says yes to its own proposal.
  if (approval.approver_kind !== HUMAN_APPROVER_KIND) {
    throw new ContractError(CODES.WRITE_APPROVAL_NOT_HUMAN,
      'a P8 approval must come from a registered human; an engine, agent or model approval is not an approval',
      { approver_kind: approval.approver_kind ?? null });
  }
  if (approval.approver_principal_id === principal.principal_id && approval.self_approval_permitted !== true) {
    throw new ContractError(CODES.WRITE_WITHOUT_APPROVAL,
      'the writer approved their own write and self approval was not permitted',
      { principal: principal.principal_id });
  }
  if (!inspectInstant(approval.approved_at).valid) {
    throw new ContractError(CODES.WRITE_WITHOUT_APPROVAL,
      'an approval must say when it was given; an undated approval cannot be shown to precede this write');
  }

  if (chain === null || typeof chain !== 'object' || Array.isArray(chain)) {
    throw new ContractError(CODES.WRITE_CHAIN_INCOMPLETE,
      'a P8 write must supply the validated lifecycle chain it rests on', { required: [...REQUIRED_P8_CHAIN_ELEMENTS] });
  }
  const missing = REQUIRED_P8_CHAIN_ELEMENTS.filter((k) => chain[k] === undefined || chain[k] === null);
  if (missing.length) {
    throw new ContractError(CODES.WRITE_CHAIN_INCOMPLETE,
      'the lifecycle chain in front of this write is incomplete', { missing });
  }

  const binding = chain.project_binding_ref;
  if (typeof binding !== 'string' || !binding) {
    throw new ContractError(CODES.WRITE_CHAIN_INCOMPLETE, 'the chain must name its project binding');
  }
  // One binding, everywhere, on every record — not on the four that were easiest to reach.
  // A chain checked in part is a chain with a hole in it, and the hole is where the other
  // project's material comes in. The approval is in the list because an approval granted for
  // one project is not an approval for another.
  const bindings = [
    ...P8_CHAIN_RECORD_ELEMENTS.map((name) => [name, chain[name]?.project_binding_ref]),
    ['approval', approval.project_binding_ref],
  ];
  const crossProject = bindings.filter(([, v]) => v !== binding).map(([k]) => k);
  if (crossProject.length) {
    throw new ContractError(CODES.WRITE_CHAIN_CROSS_PROJECT,
      'elements of this chain belong to different project bindings', { elements: crossProject });
  }

  // Immutable provenance, on every record, recomputed rather than read. This runs before any
  // field of any element is trusted, because a link that has been edited since it was written
  // has nothing to say about what its fields mean.
  for (const name of P8_CHAIN_RECORD_ELEMENTS) assertChainElementProvenance(name, chain[name], binding);
  assertChainElementProvenance('approval', approval, binding);

  const generation = chain.accepted_context_generation;
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new ContractError(CODES.WRITE_CHAIN_INCOMPLETE, 'accepted_context_generation must be a non-negative safe integer');
  }
  if (chain.p5_acceptance.boundary !== 'p5_acceptance' || !chain.p5_acceptance.acceptor) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH, 'the chain does not carry a P5 acceptance by a named acceptor');
  }
  if (chain.generation_advance.boundary !== 'generation_advance' || chain.generation_advance.to !== generation) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
      'the generation this write cites is not the generation the advance produced',
      { advanced_to: chain.generation_advance.to ?? null, cited: generation });
  }
  // The acceptance and the advance are recomputed from the inputs they carry. `boundary:
  // 'p5_acceptance'` is a label anyone can type; running evaluateP5Acceptance over the
  // recorded principal and fingerprints is what decides whether a registered human actually
  // cleared that boundary on this state.
  assertRecomputes('p5_acceptance', chain.p5_acceptance, (i) => evaluateP5Acceptance(i));
  // Recomputing the advance also settles where it started from: the boundary refuses anything
  // but a single step, and the step it produced has to end at the generation this write cites.
  assertRecomputes('generation_advance', chain.generation_advance, (i) => evaluateGenerationAdvance(i));
  if (chain.snapshot.accepted_context_generation !== generation) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
      'the snapshot belongs to a different accepted context generation, so this write is stale',
      { snapshot_generation: chain.snapshot.accepted_context_generation ?? null, cited: generation });
  }
  assertIsMintedIdentifier(chain.snapshot.snapshot_id, 'snapshot_id');
  assertIsMintedIdentifier(chain.finding.finding_id, 'finding_id');

  // Lineage: every downstream element has to name the same snapshot and the same finding.
  if (chain.finding.snapshot_id !== chain.snapshot.snapshot_id) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH, 'the finding belongs to a different snapshot');
  }
  if (chain.disposition_event.finding_id !== chain.finding.finding_id
      || chain.disposition_event.append_only !== true
      || chain.disposition_event.confirmed_by_registered_human !== true) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
      'the disposition event is not an append-only event, confirmed by a registered human, for this finding');
  }
  // "confirmed_by_registered_human: true" is a boolean the writer of the event chose. The
  // named principal and its kind are what make it checkable, and an agent or model confirming
  // a disposition is not a confirmation however the flag is set.
  if (chain.disposition_event.confirmed_by_principal_kind !== HUMAN_APPROVER_KIND
      || typeof chain.disposition_event.confirmed_by_principal_id !== 'string'
      || !chain.disposition_event.confirmed_by_principal_id) {
    throw new ContractError(CODES.WRITE_APPROVAL_NOT_HUMAN,
      'the disposition confirmation does not name a registered human principal',
      { confirmed_by_principal_kind: chain.disposition_event.confirmed_by_principal_kind ?? null });
  }
  // Applicability joins the three that were already checked. A context gate can be sufficient
  // and authoritative and still be about a source that does not govern this project, which is
  // the one combination the previous three-check list let through.
  for (const check of ['context_sufficiency', 'evidence_sufficiency', 'registered_authority', 'applicability']) {
    if (chain.context_authority_gate[check] !== true) {
      throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
        'the context and authority gate before P6 did not pass', { check });
    }
  }
  if (!AUTHORITY_KEYS.has(chain.context_authority_gate.authority_family)) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
      'the context and authority gate names no registered authority family',
      { given: chain.context_authority_gate.authority_family ?? null });
  }
  if (chain.context_authority_gate.snapshot_id !== chain.snapshot.snapshot_id) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
      'the context and authority gate was evaluated against a different snapshot');
  }
  if (chain.task_intent.snapshot_id !== chain.snapshot.snapshot_id
      || chain.task_intent.finding_id !== chain.finding.finding_id) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH, 'the task intent does not descend from this snapshot and finding');
  }

  // The policy gate and P7, in that order, for this exact intent.
  if (chain.policy_gate.gate_id !== POLICY_GATE_ID || chain.policy_gate.passed !== true
      || chain.policy_gate.task_intent_id !== chain.task_intent.task_intent_id) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH,
      'the why / why-now / authority / idempotency gate did not pass for this task intent');
  }
  if (chain.task_driver.gate_id !== P7.gate_id
      || chain.task_driver.policy_gate_id !== POLICY_GATE_ID
      || chain.task_driver.task_intent_id !== chain.task_intent.task_intent_id) {
    throw new ContractError(CODES.WRITE_CHAIN_MISMATCH, 'P7 was not evaluated for this task intent behind its policy gate');
  }
  // `passed: true` is the single most forgeable field in this chain, so it is not read as
  // evidence of anything. The gate is re-run over the why, why-now, authority and idempotency
  // records it carries, against the task intent in this same chain, and P7 is then re-run over
  // the gate that recomputation produced rather than over the one the caller supplied.
  const recomputedGate = assertRecomputes('policy_gate', chain.policy_gate,
    (i) => evaluateTaskDriverPolicyGate({ ...i, taskIntent: chain.task_intent }));
  // P7 carries no recompute inputs of its own: its inputs are two other links of this same
  // chain, which have already been verified above.
  assertRecomputes('task_driver', chain.task_driver,
    () => evaluateP7TaskDriver({ policyGate: recomputedGate, taskIntent: chain.task_intent, projectBindingRef: binding }),
    { requiresInputs: false });

  // The approval has to be an approval of *this* intent. A human who approved something else
  // has approved something else, and an approval that names nothing approves anything.
  if (approval.task_intent_id !== chain.task_intent.task_intent_id) {
    throw new ContractError(CODES.WRITE_WITHOUT_APPROVAL,
      'the approval does not name the task intent this write would create',
      { approved: approval.task_intent_id ?? null });
  }

  // A candidate is not writable. This is necessary and, on its own, nothing: everything
  // above had to hold before this line is even reached.
  if (chain.task_intent.candidate_only !== false) {
    throw new ContractError(CODES.WRITE_OF_A_CANDIDATE,
      'this task intent is still a candidate; a candidate must be approved before it can be written');
  }

  // Immutable receipt and CAS evidence. A mutable receipt proves nothing about what was
  // received, and a fingerprint that has moved means the state was read before it changed.
  const evidence = chain.evidence;
  if (evidence.immutable !== true || typeof evidence.receipt_ref !== 'string' || !evidence.receipt_ref
      || typeof evidence.content_address !== 'string' || evidence.content_address.length !== 64) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      'the write must rest on an immutable receipt with a content address');
  }
  // A content address with nothing behind it addresses nothing. The receipt material has to
  // be present and has to hash to the address the evidence declares, so the "content
  // addressed" claim is a computation rather than a field name.
  const receiptMaterial = evidence.receipt_material;
  if (receiptMaterial === null || typeof receiptMaterial !== 'object' || Array.isArray(receiptMaterial)
      || receiptMaterial.receipt_ref !== evidence.receipt_ref) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      'the evidence names a receipt but does not carry the receipt material its address is supposed to address');
  }
  let receiptAddress = null;
  try {
    receiptAddress = chainElementContentAddress('evidence_receipt', receiptMaterial);
  } catch (e) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      'the receipt material cannot be canonically addressed', { cause_code: e?.code ?? null });
  }
  if (receiptAddress !== evidence.content_address) {
    throw new ContractError(CODES.WRITE_EVIDENCE_NOT_IMMUTABLE,
      'the receipt material does not hash to the content address the evidence declares');
  }
  if (typeof submittedFingerprint !== 'string' || !submittedFingerprint) {
    throw new ContractError(CODES.CAS_MISSING, 'a write must submit the fingerprint the caller believes is current');
  }
  if (submittedFingerprint !== observedFingerprint) {
    throw new ContractError(CODES.CAS_MISMATCH, 'the snapshot moved since the task intent was computed');
  }
  if (evidence.cas_fingerprint !== observedFingerprint
      || chain.snapshot.deterministic_replay_fingerprint !== observedFingerprint) {
    throw new ContractError(CODES.CAS_MISMATCH,
      'the receipt and the snapshot do not agree with the observed fingerprint, so the evidence is stale');
  }

  return {
    boundary: 'p8_writer',
    writer: principal.principal_id,
    approver: approval.approver_principal_id,
    project_binding_ref: binding,
    accepted_context_generation: generation,
    // A snapshot is not rewritten afterwards to carry the resulting task ref; the link is
    // held on the task side, pointing back at the immutable snapshot.
    snapshot_rewritten: false,
    backward_lineage_ref: 'snapshot_id',
    backward_lineage: {
      snapshot_id: chain.snapshot.snapshot_id,
      finding_id: chain.finding.finding_id,
      accepted_context_generation: generation,
      task_intent_ref: chain.task_intent.task_intent_id,
      task_driver_ref: chain.task_driver.gate_id,
    },
    // Stated so a reader does not have to infer how much was actually checked.
    chain_elements_verified: [...REQUIRED_P8_CHAIN_ELEMENTS],
    chain_elements_recomputed: [...P8_RECOMPUTED_CHAIN_ELEMENTS],
    provenance_verified_for: [...P8_CHAIN_RECORD_ELEMENTS, 'approval'],
    // This engine evaluates the gate. It does not hold the external sole-writer authority,
    // so no ledger entry is produced here and the count says so.
    gate_evaluation_only: true,
    erp_write_performed: false,
    erp_writes: 0,
  };
}

export const OPEN_OWNER_DECISIONS_FOR_THIS_LANE = Object.freeze([
  'p5_and_p8_registered_human_approver_registration_policy',
  'whether_self_approval_is_ever_permitted_and_for_whom',
]);
