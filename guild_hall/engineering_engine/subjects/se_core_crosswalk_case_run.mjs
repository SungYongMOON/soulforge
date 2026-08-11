// Fixed synthetic SE-core questions -> deterministic Engine reference rows.
//
// The case facts below are a structured transcription of facts stated in the pinned public-
// safe prompts. They are not answers, labels, model output, or evaluator gold. Each case first
// crosses the accepted common-SE projection adapter and runEnginePass. Boundary-only facts that
// are not Engine gap types (stale revision evidence, ACL denial, and binding refusal) remain
// separate typed guards and are applied only after the Engine result is observed.

import { createHash } from 'node:crypto';

import { runEnginePass } from '../assembly/engine_pass.mjs';
import { assertTwoSourceAuthorityInvariant } from '../kernel/authority.mjs';
import { RANKING_KEYS, assertNoForbiddenIdentifier, selectCapsule } from '../kernel/capsule.mjs';
import { canonicalise, compareCodePoints } from '../kernel/canonical.mjs';
import { ContractError } from '../kernel/errors.mjs';
import { GAP_TYPE } from '../kernel/snapshot.mjs';
import {
  CODES as PROJECTION_CODES,
  SELECTOR_SCOPE,
  SUBJECT_ID,
  buildStatesFromCommonSeProjection,
} from './common_se_corpus_projection.mjs';
import { PROJECT_BINDING_REF, PROJECTION_INSTANT } from './se_core_crosswalk_projection.mjs';

export const CODES = Object.freeze({
  INPUT_INVALID: 'SE_CORE_CROSSWALK_CASE_INPUT_INVALID',
  QUESTION_PIN_INVALID: 'SE_CORE_CROSSWALK_QUESTION_PIN_INVALID',
  QUESTION_SCHEMA_INVALID: 'SE_CORE_CROSSWALK_QUESTION_SCHEMA_INVALID',
  QUESTION_CONTRACT_MISMATCH: 'SE_CORE_CROSSWALK_QUESTION_CONTRACT_MISMATCH',
  PROJECTION_CASE_MISSING: 'SE_CORE_CROSSWALK_PROJECTION_CASE_MISSING',
  CASE_INVARIANT_FAILED: 'SE_CORE_CROSSWALK_CASE_INVARIANT_FAILED',
  OUTPUT_SAFETY_FAILED: 'SE_CORE_CROSSWALK_OUTPUT_SAFETY_FAILED',
});

export const CASE_POLICY_REVISION = 'soulforge.se_core_crosswalk_case_run.v0';
export const ACCEPTED_QUESTION_SET_SHA256 = 'fe4ca0bca255d78bbcde6e865f6e72c9984dd22312eb3d60ef0b69769bb77e4d';
export const RESULT_CLAIM_CEILING = 'external_advisory_candidate';

const SHA256 = /^[0-9a-f]{64}$/u;
const QUESTION_IDS = Object.freeze([
  'se-q-01', 'se-q-02', 'se-q-03', 'se-q-04', 'se-q-05', 'se-q-06', 'se-q-07',
]);
const QUESTION_TEXT_SHA256 = Object.freeze({
  'se-q-01': 'ae98ee756b0b7f4d1721bf8adca81667d5b08068ed8d1b8b2b799ebfed65a767',
  'se-q-02': 'e6738b5f24572ac77d2ac3f14e0e3d03ff172e75286c14580211565ed8c81cf8',
  'se-q-03': 'a5689081063ce13b9a02c2da567b40e374aea662d71c39d9cfe04667ccd90f44',
  'se-q-04': '6bb2160201abc17be28fdf7d40defe84b632875fd243826ad2593f50c2267f29',
  'se-q-05': '0400385247cf648484e430b259f95feb8cdd0e82a6b1e0563a04ab26e1d5e5bb',
  'se-q-06': '0961216070f9cc5391bcbe162cce5a4e2462d95c979d12817584a931eaf3a13e',
  'se-q-07': '7322123c62266024e2e6a6ea549fe5f40e443e794db93559ea12a41d17237f8f',
});

// Structured observations, not target classifications. The generic reducer below derives the
// manual-shadow vocabulary from Engine gaps or typed boundary receipts.
const CASE_FACTS = Object.freeze({
  'se-q-01': Object.freeze({
    observation_kind: 'inspection', inspection_complete: true, failed_surfaces: 0,
    required_items_present: true, evidence_current: true,
  }),
  'se-q-02': Object.freeze({
    observation_kind: 'inspection', inspection_complete: true, failed_surfaces: 0,
    required_items_present: false, absence_explicitly_confirmed: true,
  }),
  'se-q-03': Object.freeze({
    observation_kind: 'inspection', declared_surfaces: 3, successful_surfaces: 1,
    failed_surfaces: 1, not_run_surfaces: 1, reliable_observation: false,
  }),
  'se-q-04': Object.freeze({
    observation_kind: 'two_source_threshold', both_current: true, both_applicable: true,
    controlling_value_seconds: 4, secondary_value_seconds: 6,
    controlling_revision: 'R7', secondary_revision: 'W12',
  }),
  'se-q-05': Object.freeze({
    observation_kind: 'revision_evidence', evidence_revision: 'D3', current_revision: 'D5',
    current_revision_required: true, impact_assessment_present: false,
    regression_receipt_present: false,
  }),
  'se-q-06': Object.freeze({
    observation_kind: 'bounded_acl_traversal', denied_at_seed: 1, denied_at_hop: 1,
    authorized_evidence_sufficient: true,
  }),
  'se-q-07': Object.freeze({
    observation_kind: 'binding_guard', request_binding: 'selected',
    cached_binding: 'different', evidence_binding: 'different', approved_cross_binding: false,
  }),
});

const CASE_FACTS_SHA256 = createHash('sha256')
  .update(`soulforge.se_core_crosswalk.case_facts.v0\n${canonicalise(CASE_FACTS)}`)
  .digest('hex');
const INPUT_FIELDS = Object.freeze(['projection', 'questionSetBytes', 'expectedQuestionSetSha256']);
const QUESTION_SET_FIELDS = Object.freeze(['questions']);
const QUESTION_FIELDS = Object.freeze(['question_id', 'question']);
const ROW_FIELDS = Object.freeze([
  'question_id', 'classification', 'safety_violations', 'claim_ceiling', 'authority_actions',
]);
const CLASSIFICATIONS = new Set([
  'correct', 'missing', 'unknown', 'contradictory', 'stale', 'unauthorized', 'wrong-project',
]);
const FORBIDDEN_OUTPUT = Object.freeze([
  /(?:^|[\\/])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[\\/])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[\\/])private-state(?:[\\/]|$)/iu,
  /[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /\bP\d{2,4}[-_]\d{2,6}\b/u,
  /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}\b/iu,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
  /\b(?:cedar|quartz)\b/iu,
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const semanticSha256 = (domain, value) => createHash('sha256')
  .update(`${domain}\n${canonicalise(value)}`).digest('hex');
const exactKeys = (value, expected) => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort(compareCodePoints))
    === JSON.stringify([...expected].sort(compareCodePoints));

function fail(code, message) {
  throw new ContractError(code, message);
}

function asQuestionBytes(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > 16_000) {
    fail(CODES.INPUT_INVALID, 'questionSetBytes must be non-empty bounded bytes');
  }
  return Uint8Array.from(value);
}

function validateQuestionSet(questionSetBytes, expectedSha256) {
  if (!SHA256.test(expectedSha256 ?? '') || expectedSha256 !== ACCEPTED_QUESTION_SET_SHA256) {
    fail(CODES.QUESTION_PIN_INVALID, 'the accepted question-set SHA-256 pin is required exactly');
  }
  const bytes = asQuestionBytes(questionSetBytes);
  if (sha256(bytes) !== expectedSha256) {
    fail(CODES.QUESTION_PIN_INVALID, 'question-set bytes do not match the accepted exact pin');
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(CODES.QUESTION_SCHEMA_INVALID, 'question-set bytes must be one valid UTF-8 JSON document');
  }
  if (!exactKeys(parsed, QUESTION_SET_FIELDS) || !Array.isArray(parsed.questions)
      || parsed.questions.length !== QUESTION_IDS.length) {
    fail(CODES.QUESTION_SCHEMA_INVALID, 'the question set uses one closed seven-row schema');
  }
  const seen = new Set();
  for (const question of parsed.questions) {
    if (!exactKeys(question, QUESTION_FIELDS) || !QUESTION_IDS.includes(question.question_id)
        || seen.has(question.question_id) || typeof question.question !== 'string'
        || question.question.length < 1 || question.question.length > 2_000
        || question.question.normalize('NFC') !== question.question
        || sha256(Buffer.from(question.question, 'utf8')) !== QUESTION_TEXT_SHA256[question.question_id]) {
      fail(CODES.QUESTION_CONTRACT_MISMATCH,
        'a question id, prompt commitment, or closed row shape differs from the accepted contract');
    }
    seen.add(question.question_id);
  }
  if (QUESTION_IDS.some((id) => !seen.has(id))) {
    fail(CODES.QUESTION_CONTRACT_MISMATCH, 'the accepted question set must contain every exact case once');
  }
  return { sha256: expectedSha256 };
}

function projectionNode(projection, questionId, nodeType) {
  const entity = nodeType === 'rule'
    ? `se-core-eval-rule-${questionId}`
    : `se-core-eval-expected-${questionId}`;
  const nodes = Array.isArray(projection?.nodes)
    ? projection.nodes.filter((node) => node?.node_type === nodeType && node?.ref?.entity_id === entity)
    : [];
  if (nodes.length !== 1) {
    fail(CODES.PROJECTION_CASE_MISSING, 'the projection must contain one exact rule and expected node per case');
  }
  return nodes[0];
}

function selector(projection, seedRefs) {
  const seeds = seedRefs.map((ref) => structuredClone(ref)).sort((a, b) => compareCodePoints(
    a.revision_id, b.revision_id,
  ));
  const count = seeds.length;
  return {
    project_binding_ref: PROJECT_BINDING_REF,
    scope: SELECTOR_SCOPE,
    accepted_context_generation: 0,
    valid_at: PROJECTION_INSTANT,
    known_at: PROJECTION_INSTANT,
    acl_filter_revision: 'se-core-crosswalk-case-acl-r1',
    source_family_filter: ['llm_proposal'],
    seed_refs: seeds,
    traversal: { max_hops: 1, allowlisted_edge_types: ['requires'] },
    ranking: {
      method: 'deterministic',
      keys: ['authority_rank', 'applicability', 'revision_recency', 'ref_lexicographic'],
    },
    budgets: {
      top_k: count, max_nodes: Math.max(2, count * 2), max_edges: count,
      max_sources: count, max_evidence_chars: 1_000,
    },
    graph_projection_revision: projection.projection_revision,
  };
}

function exactRef(entityId, revisionId, contentSha256) {
  return {
    entity_id: entityId,
    revision_id: revisionId,
    content_id: `sha256:${contentSha256}`,
    content_hash_alg: 'sha256',
  };
}

function observationFor(expectedNode, questionId, presenceState) {
  const facts = CASE_FACTS[questionId];
  const commitment = semanticSha256('soulforge.se_core_crosswalk.case_observation.v0', {
    question_id: questionId,
    question_text_sha256: QUESTION_TEXT_SHA256[questionId],
    facts,
    presence_state: presenceState,
  });
  return {
    element_id: `obs_${expectedNode.state_element.element_id}`,
    axis: 'observed',
    artifact_revision_ref: exactRef(
      `se-core-case-observation-${questionId}`,
      `se-core-case-observation-${questionId}-${commitment.slice(0, 16)}`,
      commitment,
    ),
    presence_state: presenceState,
    valid_at: PROJECTION_INSTANT,
    known_at: PROJECTION_INSTANT,
    project_binding_ref: PROJECT_BINDING_REF,
  };
}

function presenceFromFacts(facts) {
  if (facts.observation_kind === 'inspection') {
    if (facts.inspection_complete === true && facts.failed_surfaces === 0
        && facts.required_items_present === true && facts.evidence_current === true) return 'present';
    if (facts.inspection_complete === true && facts.failed_surfaces === 0
        && facts.required_items_present === false
        && facts.absence_explicitly_confirmed === true) return 'absence_confirmed';
    return 'unknown';
  }
  if (facts.observation_kind === 'two_source_threshold') return 'present';
  if (facts.observation_kind === 'revision_evidence') return 'unknown';
  if (facts.observation_kind === 'bounded_acl_traversal'
      || facts.observation_kind === 'binding_guard') return 'present';
  fail(CODES.CASE_INVARIANT_FAILED, 'a structured case fact kind is not supported');
}

function conflictClaims() {
  const facts = CASE_FACTS['se-q-04'];
  const makeRef = (side, revision, seconds) => {
    const digest = semanticSha256('soulforge.se_core_crosswalk.synthetic_claim_source.v0', {
      side, revision, seconds,
    });
    return exactRef(`se-core-synthetic-${side}`, `se-core-synthetic-${side}-${revision}`, digest);
  };
  return [
    {
      claim_id: 'se-core-synthetic-controlling-claim',
      authority_family: 'project_contract_baseline',
      source_revision_ref: makeRef('controlling', facts.controlling_revision, facts.controlling_value_seconds),
      lineage_ref: 'lineage:synthetic:controlling:R7',
      applicability: facts.both_applicable,
      asserted_value: `settling_time_lte_${facts.controlling_value_seconds}_seconds`,
      valid_at: PROJECTION_INSTANT,
      known_at: PROJECTION_INSTANT,
    },
    {
      claim_id: 'se-core-synthetic-secondary-claim',
      authority_family: 'reviewed_wiki',
      source_revision_ref: makeRef('secondary', facts.secondary_revision, facts.secondary_value_seconds),
      lineage_ref: 'lineage:synthetic:secondary:W12',
      applicability: facts.both_applicable,
      asserted_value: `settling_time_lte_${facts.secondary_value_seconds}_seconds`,
      valid_at: PROJECTION_INSTANT,
      known_at: PROJECTION_INSTANT,
    },
  ];
}

function uuidSource(caseIndex) {
  let next = 0;
  return () => {
    next += 1;
    const suffix = (caseIndex * 100 + next).toString(16).padStart(12, '0');
    return `a3f1c2d4-5e6f-4a7b-8c9d-${suffix}`;
  };
}

function runPass(projection, states, questionId, caseIndex) {
  return runEnginePass({
    states,
    subjectId: SUBJECT_ID,
    projectBindingRef: PROJECT_BINDING_REF,
    generation: 0,
    topologyDigest: projection.projection_sha256,
    observationRunId: `se-core-crosswalk-case-run-${questionId}`,
    takenAt: PROJECTION_INSTANT,
    validAt: PROJECTION_INSTANT,
    mintValue: uuidSource(caseIndex),
  });
}

function baseStates(projection, questionId, options = {}) {
  const ruleNode = projectionNode(projection, questionId, 'rule');
  const expectedNode = projectionNode(projection, questionId, 'expected_state_element');
  const presence = presenceFromFacts(CASE_FACTS[questionId]);
  const selected = options.seedRefs ?? [ruleNode.ref];
  return buildStatesFromCommonSeProjection({
    projection,
    selector: options.selector ?? selector(projection, selected),
    observedStateElements: [observationFor(expectedNode, questionId, presence)],
    aclCheck: options.aclCheck ?? (() => true),
    expectedProjectBindingRef: PROJECT_BINDING_REF,
  });
}

function runOrdinaryCase(projection, questionId, caseIndex) {
  const states = baseStates(projection, questionId);
  const passStates = structuredClone(states);
  if (questionId === 'se-q-04') {
    const expectedId = states.expected[0].element_id;
    passStates.conflicting_element_ids = [expectedId];
    passStates.source_claims = { [expectedId]: conflictClaims() };
  }
  const engine = runPass(projection, passStates, questionId, caseIndex);
  if (questionId === 'se-q-04') {
    const conflict = engine.findings[0]?.source_conflict;
    assertTwoSourceAuthorityInvariant(conflict);
  }
  const facts = CASE_FACTS[questionId];
  const staleRevisionEvidence = facts.observation_kind === 'revision_evidence'
    && facts.evidence_revision !== facts.current_revision
    && facts.current_revision_required === true
    && facts.impact_assessment_present === false
    && facts.regression_receipt_present === false;
  return { engine, boundary: { stale_revision_evidence: staleRevisionEvidence } };
}

function runAclCase(projection, caseIndex) {
  const boundaryRef = (id) => {
    const digest = semanticSha256('soulforge.se_core_crosswalk.synthetic_acl_ref.v0', { id });
    return exactRef(`se-core-acl-${id}`, `se-core-acl-${id}-r1`, digest);
  };
  const deniedSeed = boundaryRef('denied-seed');
  const traversalSeed = boundaryRef('traversal-seed');
  const deniedHop = boundaryRef('denied-hop');
  const authorizedSeed = boundaryRef('authorized-seed');
  const authorizedHop = boundaryRef('authorized-hop');
  const evidence = boundaryRef('edge-evidence');
  const edge = (edgeId, fromRef, toRef) => ({
    edge_id: edgeId,
    edge_type: 'has_revision',
    from_type: 'source',
    to_type: 'source_revision',
    from_ref: fromRef,
    to_ref: toRef,
    authority_family: 'company_approved_procedure',
    evidence_ref: evidence,
    valid_at: PROJECTION_INSTANT,
    known_at: PROJECTION_INSTANT,
    applicability: true,
    review_state: 'reviewed',
    evidence_claim_ceiling: 'source_sufficient',
    generating_policy_revision: CASE_POLICY_REVISION,
    project_binding_ref: PROJECT_BINDING_REF,
  });
  const graph = {
    edges: [
      edge('se-core-acl-denied-hop-edge', traversalSeed, deniedHop),
      edge('se-core-acl-authorized-hop-edge', authorizedSeed, authorizedHop),
    ],
    nodes: [deniedSeed, traversalSeed, deniedHop, authorizedSeed, authorizedHop]
      .map((ref) => ({ ref, project_binding_ref: PROJECT_BINDING_REF })),
  };
  const capsuleSelector = {
    project_binding_ref: PROJECT_BINDING_REF,
    scope: 'project',
    accepted_context_generation: 0,
    valid_at: PROJECTION_INSTANT,
    known_at: PROJECTION_INSTANT,
    acl_filter_revision: 'se-core-crosswalk-case-acl-r1',
    source_family_filter: ['company_approved_procedure'],
    seed_refs: [deniedSeed, traversalSeed, authorizedSeed],
    traversal: { max_hops: 1, allowlisted_edge_types: ['has_revision'] },
    ranking: { method: 'deterministic', keys: [...RANKING_KEYS] },
    budgets: { top_k: 3, max_nodes: 10, max_edges: 5, max_sources: 5, max_evidence_chars: 1_000 },
    graph_projection_revision: 'se-core-crosswalk-acl-projection-r1',
  };
  const deniedIds = new Set([deniedSeed.entity_id, deniedHop.entity_id]);
  const capsule = selectCapsule(
    capsuleSelector,
    graph,
    (ref) => !deniedIds.has(typeof ref === 'string' ? ref : ref.entity_id),
  );
  assertNoForbiddenIdentifier(capsule, [...deniedIds]);
  const states = baseStates(projection, 'se-q-06');
  const engine = runPass(projection, states, 'se-q-06', caseIndex);
  const facts = CASE_FACTS['se-q-06'];
  const accessRefusal = facts.authorized_evidence_sufficient === true
    && capsule.excluded_count === facts.denied_at_seed + facts.denied_at_hop
    && capsule.included_refs.length > 0
    && capsule.excluded.some((entry) => entry.reason === 'acl_denied_at_seed')
    && capsule.excluded.some((entry) => entry.reason === 'acl_denied_at_hop')
    && engine.findings.length === 0;
  return {
    engine,
    boundary: {
      access_refusal: accessRefusal,
      denied_count: capsule.excluded_count,
      denied_identifier_count_in_result: 0,
    },
  };
}

function runBindingCase(projection, caseIndex) {
  const q7Rule = projectionNode(projection, 'se-q-07', 'rule');
  const mismatchedSelector = selector(projection, [q7Rule.ref]);
  mismatchedSelector.project_binding_ref = 'synthetic-alternate-binding-v1';
  let refusal = null;
  try {
    baseStates(projection, 'se-q-07', { selector: mismatchedSelector });
  } catch (error) {
    if (error instanceof ContractError && error.code === PROJECTION_CODES.PROJECT_BINDING_MISMATCH) {
      refusal = error.code;
    } else {
      throw error;
    }
  }
  const states = baseStates(projection, 'se-q-07');
  const engine = runPass(projection, states, 'se-q-07', caseIndex);
  const facts = CASE_FACTS['se-q-07'];
  const bindingRefusal = refusal === PROJECTION_CODES.PROJECT_BINDING_MISMATCH
    && facts.cached_binding !== facts.request_binding
    && facts.evidence_binding !== facts.request_binding
    && facts.approved_cross_binding === false
    && engine.findings.length === 0;
  return {
    engine,
    boundary: { binding_refusal: bindingRefusal, refusal_reason_stated: refusal !== null },
  };
}

function classificationFromRun({ engine, boundary }) {
  if (boundary.binding_refusal === true && boundary.refusal_reason_stated === true) return 'wrong-project';
  if (boundary.access_refusal === true && boundary.denied_count === 2
      && boundary.denied_identifier_count_in_result === 0) return 'unauthorized';
  if (boundary.stale_revision_evidence === true
      && engine.gap_counts[GAP_TYPE.UNKNOWN] === 1) return 'stale';
  if (engine.gap_counts[GAP_TYPE.CONFLICT] === 1 && engine.findings.length === 1) return 'contradictory';
  if (engine.gap_counts[GAP_TYPE.MISSING] === 1 && engine.findings.length === 1) return 'missing';
  if (engine.gap_counts[GAP_TYPE.UNKNOWN] === 1 && engine.findings.length === 1
      && engine.contextRequest?.candidate_only === true) return 'unknown';
  if (engine.gap_counts[GAP_TYPE.SATISFIED] === 1 && engine.findings.length === 0) return 'correct';
  fail(CODES.CASE_INVARIANT_FAILED, 'the Engine and boundary receipts do not yield one normalized case');
}

function resultRow(questionId, classification) {
  const row = {
    question_id: questionId,
    classification,
    safety_violations: 0,
    claim_ceiling: RESULT_CLAIM_CEILING,
    authority_actions: [],
  };
  if (!exactKeys(row, ROW_FIELDS) || !CLASSIFICATIONS.has(row.classification)) {
    fail(CODES.CASE_INVARIANT_FAILED, 'a normalized row does not match the manual-shadow interface');
  }
  return row;
}

function assertOutputSafe(value) {
  const serialised = canonicalise(value, {
    'engine_results.rows': 'insertion_ordered',
    'engine_results.rows[].authority_actions': 'insertion_ordered',
    'verification.case_receipts': 'insertion_ordered',
    'verification.case_receipts[].gap_types': 'insertion_ordered',
  });
  if (FORBIDDEN_OUTPUT.some((pattern) => pattern.test(serialised))) {
    fail(CODES.OUTPUT_SAFETY_FAILED,
      'the candidate result contains a private path, credential, real-project marker, or denied binding name');
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Run the seven accepted synthetic prompts through the crosswalk projection and Engine.
 *
 * The returned `engine_results` object has exactly the shape consumed by the existing manual
 * shadow scorer. `verification` is a safe, payload-free receipt for tests and orchestration;
 * the CLI intentionally emits only `engine_results`.
 */
export function runSeCoreCrosswalkCases(input) {
  if (!exactKeys(input, INPUT_FIELDS)) {
    fail(CODES.INPUT_INVALID, 'the case runner uses one closed input field set');
  }
  const question = validateQuestionSet(input.questionSetBytes, input.expectedQuestionSetSha256);
  const executions = QUESTION_IDS.map((questionId, caseIndex) => {
    if (questionId === 'se-q-06') return runAclCase(input.projection, caseIndex + 1);
    if (questionId === 'se-q-07') return runBindingCase(input.projection, caseIndex + 1);
    return runOrdinaryCase(input.projection, questionId, caseIndex + 1);
  });
  const rows = executions.map((execution, index) => resultRow(
    QUESTION_IDS[index], classificationFromRun(execution),
  ));
  const engineResults = { rows };
  const verification = {
    schema_version: 'soulforge.se_core_crosswalk_case_verification.v0',
    artifact_state: 'candidate_only',
    case_policy_revision: CASE_POLICY_REVISION,
    question_set_sha256: question.sha256,
    case_facts_sha256: CASE_FACTS_SHA256,
    projection_revision: input.projection.projection_revision,
    projection_sha256: input.projection.projection_sha256,
    cases_run_through_engine: executions.length,
    learned_model_invocations: executions.reduce(
      (total, execution) => total + execution.engine.learned_model_invocations, 0,
    ),
    erp_writes: executions.reduce((total, execution) => total + execution.engine.erp_writes, 0),
    network_calls: 0,
    filesystem_writes: 0,
    case_receipts: executions.map((execution, index) => ({
      question_id: QUESTION_IDS[index],
      requirements_judged: execution.engine.requirements_judged,
      gap_types: Object.keys(execution.engine.gap_counts).sort(compareCodePoints),
      boundary_refusal: execution.boundary.binding_refusal === true
        || execution.boundary.access_refusal === true,
      stale_revision_evidence: execution.boundary.stale_revision_evidence === true,
    })),
  };
  const result = { engine_results: engineResults, verification };
  assertOutputSafe(result);
  return deepFreeze(result);
}

/** Canonical scorer-compatible JSON; this deliberately omits the auxiliary receipt. */
export function canonicalSeCoreCrosswalkEngineResultsJson(run) {
  if (!exactKeys(run, ['engine_results', 'verification'])
      || !exactKeys(run.engine_results, ['rows'])) {
    fail(CODES.INPUT_INVALID, 'one completed case run is required for canonical output');
  }
  assertOutputSafe(run);
  return `${canonicalise(run.engine_results, {
    rows: 'insertion_ordered',
    'rows[].authority_actions': 'insertion_ordered',
  })}\n`;
}
