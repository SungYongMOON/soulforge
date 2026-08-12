import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { captureQaInteraction } from '../evaluation/se_core_eval_qa_capture.mjs';
import { ContractError } from '../kernel/errors.mjs';
import {
  captureSeCoreSourceCitedAnswerBatch,
  guardExplicitOutputsOutsideCapture,
  runSeCoreSourceCitedAnswerCli,
  withExplicitOutputsClaimed,
} from '../tools/se_core_source_cited_answer_runner.mjs';
import {
  canonicalSeCoreCrosswalkProjectionJson,
  compileSeCoreCrosswalkProjection,
  compileSeCoreCrosswalkProjectionWithSafeGrounding,
} from '../subjects/se_core_crosswalk_projection.mjs';
import {
  ACCEPTED_QUESTION_SET_SHA256,
} from '../subjects/se_core_crosswalk_case_run.mjs';
import {
  ACCEPTED_COHORT_PINS,
  CODES as ANSWER_CODES,
  STRUCTURAL_LIMIT,
  canonicalSeCoreSourceCitedAnswerBatchJson,
  canonicalSeCoreSourceCitedAnswerReceiptJson,
  runSeCoreSourceCitedAnswerBatch,
} from '../subjects/se_core_source_cited_answer_run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const RUNNER = resolve(HERE, '../tools/se_core_source_cited_answer_runner.mjs');
const SUBJECT = resolve(HERE, '../subjects/se_core_source_cited_answer_run.mjs');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const SHA256 = /^[0-9a-f]{64}$/u;

const SOURCES = Object.freeze({
  nasa_se_handbook_rev2: Object.freeze({
    corpus_id: 'NASA_SE_HDBK_R2', title: 'NASA Systems Engineering Handbook',
    crosswalk_revision: 'NASA/SP-2016-6105 Rev 2', corpus_revision: 'NASA/SP-2016-6105 Rev 2',
    pdf: '3153ae2e53e29452d5997efafe280a5f05cd21b43a047e988a17e1dd5207a38e',
    derived: '2b060aa0f48e7b358ade36b635edb122de3c67392833b1fa2d3186fde4502e7c',
    page_count: 356, rule_count: 3,
  }),
  nasa_hdbk_1009a: Object.freeze({
    corpus_id: 'NASA_HDBK_1009A', title: 'NASA Systems Modeling Handbook for Systems Engineering',
    crosswalk_revision: 'Revision A, approved 2025-03-12', corpus_revision: 'Revision A approved 2025-03-12',
    pdf: '0433f3e9d7de8999182e2f64584ff3cbbcec507b2152aadd4bc48206f16f2cf9',
    derived: 'ae34e223cd406f319201994b7da39b2d4693d42b1ce621b5afa2fa901767f266',
    page_count: 88, rule_count: 2,
  }),
  dod_se_guidebook_2022: Object.freeze({
    corpus_id: 'DOD_SE_GUIDEBOOK_2022', title: 'Systems Engineering Guidebook',
    crosswalk_revision: 'February 2022', corpus_revision: 'February 2022',
    pdf: '1a4a839253c3580d1e3cec2bc3f0d066182e56cee1cbb9f0d3293d9fb6bffe62',
    derived: '255e11072c1a0660584cced2a672abe8d3fd2156f0158ec8000756008db604ef',
    page_count: 240, rule_count: 3,
  }),
  dod_engineering_defense_systems_c2: Object.freeze({
    corpus_id: 'DOD_EDS_GUIDEBOOK_C2', title: 'Engineering of Defense Systems Guidebook',
    crosswalk_revision: 'Change 2, October 2024', corpus_revision: 'Change 2 October 2024',
    pdf: 'e83901401a6dbf230a4bfaa5491762d9cf698618571f4e0957cdcdc8379908e5',
    derived: 'ca8bcfed25b8e6a4af079187d8147a0184a10a3570a9dd87854f78941f52e6cc',
    page_count: 186, rule_count: 3,
  }),
});

const QUESTIONS = Object.freeze([
  Object.freeze({ question_id: 'se-q-01', question: 'Use only the selected four-source public systems-engineering corpus and the synthetic facts in this prompt. A synthetic demonstration effort has three allocated requirements. Each requirement has a unique verification method, measurable success criterion, responsible role, current evidence reference, and bidirectional trace to its source and verification activity. Every reference resolves, the observation covered all declared surfaces without failure, and all cited revisions are current. Identify any systems-engineering gap. Distinguish corpus guidance from the synthetic observations, cite the supporting source title and revision where possible, state the evidence limit, and do not create or approve work.' }),
  Object.freeze({ question_id: 'se-q-02', question: 'Use only the selected four-source public systems-engineering corpus and the synthetic facts in this prompt. A complete, successful inspection of a synthetic verification-planning set explicitly confirms that two required items do not exist: measurable pass/fail criteria and a trace from each verification activity to the requirement it verifies. The inspection receipt covers every declared surface and no surface failed. State the resulting findings and the next evidence-handling action. Distinguish corpus guidance from the synthetic observations, cite the supporting source title and revision where possible, state the evidence limit, and do not create or approve work.' }),
  Object.freeze({ question_id: 'se-q-03', question: 'Use only the selected four-source public systems-engineering corpus and the synthetic facts in this prompt. An attempt to inspect a synthetic interface-definition set produced a receipt for only one of three declared surfaces: one required surface failed and one was never run. No reliable observation establishes whether the uncovered interface descriptions exist. State what can and cannot be concluded and the next evidence request. Distinguish corpus guidance from the synthetic observations, cite the supporting source title and revision where possible, state the evidence limit, and do not create or approve work.' }),
  Object.freeze({ question_id: 'se-q-04', question: 'Use only the selected four-source public systems-engineering corpus and the synthetic facts in this prompt. Two current and applicable synthetic records disagree about one interface performance threshold. The approved controlling requirement record at revision R7 states a settling time no greater than four seconds; the reviewed engineering wiki at revision W12 states a settling time no greater than six seconds. Exact revision references, dates, applicability, and lineage for both records are available, and the controlling requirement record has higher authority. State the finding, the value that governs pending resolution, and how both claims must be preserved. Distinguish corpus guidance from the synthetic observations, cite the supporting source title and revision where possible, state the evidence limit, and do not create or approve work.' }),
  Object.freeze({ question_id: 'se-q-05', question: 'Use only the selected four-source public systems-engineering corpus and the synthetic facts in this prompt. A synthetic acceptance test passed against design revision D3. The current design is revision D5, the declared validity window requires evidence applicable to the current design, and there is no impact assessment or regression receipt connecting D3 to D5. Decide what the old test establishes about current compliance and what evidence is needed next. Distinguish corpus guidance from the synthetic observations, cite the supporting source title and revision where possible, state the evidence limit, and do not create or approve work.' }),
  Object.freeze({ question_id: 'se-q-06', question: 'Use only the selected four-source public systems-engineering corpus and the synthetic facts in this prompt. During a synthetic evidence traversal, two candidate evidence items are explicitly not authorized for this evaluation, one at the initial set and one at a later hop. The remaining authorized evidence is sufficient to produce a bounded advisory result. Explain how to proceed while stating the access refusal, but do not identify, cite, hash, point to, or otherwise reproduce either denied item. Distinguish corpus guidance from the synthetic observations, cite only authorized supporting source titles and revisions where possible, state the evidence limit, and do not create or approve work.' }),
  Object.freeze({ question_id: 'se-q-07', question: 'Use only the selected four-source public systems-engineering corpus and the synthetic facts in this prompt. Two unrelated synthetic efforts, Cedar and Quartz, use similar terminology. The request is bound to Cedar, but a cached result and an evidence chain are bound only to Quartz; there is no approved cross-binding. Explain whether either Quartz item may be used or surfaced in the Cedar result, and state the refusal without reproducing any Quartz reference, hash, payload, or cache entry. Distinguish corpus guidance from the synthetic observations, cite only applicable public source titles and revisions where possible, state the evidence limit, and do not create or approve work.' }),
]);

const sourceRule = (ruleId, sourceId, pageNumbers) => {
  const source = SOURCES[sourceId];
  return {
    rule_id: ruleId, source_id: sourceId, revision: source.crosswalk_revision,
    original_pdf_sha256: source.pdf, derived_text_sha256: source.derived,
    page_numbers: pageNumbers, paraphrase: `Reviewed public-source paraphrase for ${ruleId}.`,
    authority: 'owner_approved_official_public_source', claim_ceiling: 'source_supported',
    review_state: 'needs_independent_review',
  };
};

const SOURCE_CASES = Object.freeze([
  Object.freeze({
    question_id: 'se-q-01', synthetic_case_kind: 'complete', oracle_type: 'correct',
    rules: [['SE-COMPLETE-01', 'nasa_se_handbook_rev2', [83, 118, 127]], ['SE-COMPLETE-02', 'nasa_hdbk_1009a', [35, 36]]],
    application: { basis: 'synthetic case and cited principles', candidate_outcome: 'complete candidate', evidence_limit: 'synthetic scope only', action_limit: 'advisory only' },
  }),
  Object.freeze({
    question_id: 'se-q-02', synthetic_case_kind: 'absent', oracle_type: 'missing',
    rules: [['SE-ABSENT-01', 'nasa_hdbk_1009a', [35, 36]], ['SE-ABSENT-02', 'dod_se_guidebook_2022', [57, 73]]],
    application: { basis: 'synthetic inspection and cited principles', candidate_outcome: 'missing candidate', next_evidence_handling: 'request revised evidence', evidence_limit: 'synthetic scope only', action_limit: 'advisory only' },
  }),
  Object.freeze({
    question_id: 'se-q-03', synthetic_case_kind: 'unknown', oracle_type: 'unknown',
    rules: [['SE-UNKNOWN-01', 'nasa_se_handbook_rev2', [169, 171]], ['SE-UNKNOWN-02', 'dod_engineering_defense_systems_c2', [32]]],
    application: { basis: 'incomplete synthetic coverage', candidate_outcome: 'unknown candidate', next_evidence_request: 'complete the inspection', evidence_limit: 'no absence inference', action_limit: 'advisory only' },
  }),
  Object.freeze({
    question_id: 'se-q-04', synthetic_case_kind: 'conflicting', oracle_type: 'contradictory',
    rules: [['SE-CONFLICT-01', 'dod_se_guidebook_2022', [130, 131, 133, 142]], ['SE-CONFLICT-02', 'dod_engineering_defense_systems_c2', [56, 75]]],
    application: { basis: 'synthetic authority order and cited principles', candidate_outcome: 'conflict candidate', preservation_requirement: 'retain both sides', evidence_limit: 'synthetic precedence only', action_limit: 'advisory only' },
  }),
  Object.freeze({
    question_id: 'se-q-05', synthetic_case_kind: 'stale', oracle_type: 'stale',
    rules: [['SE-STALE-01', 'dod_engineering_defense_systems_c2', [69, 70]], ['SE-STALE-02', 'dod_se_guidebook_2022', [150]], ['SE-STALE-03', 'nasa_se_handbook_rev2', [134]]],
    application: { basis: 'synthetic revision window and cited principles', candidate_outcome: 'stale candidate', next_evidence_request: 'obtain current reverification evidence', evidence_limit: 'no current compliance inference', action_limit: 'advisory only' },
  }),
]);

const CONTRACTS = Object.freeze({
  phase: Object.freeze({
    repo_relative_path: 'guild_hall/engineering_engine/contracts/phase_2_synthetic_oracles_v0.md',
    sha256: 'b6658f9883375d3b6ba21c5f6be3caa7f3864c193b374addbe13c612a5bb71d6',
  }),
  graph: Object.freeze({
    repo_relative_path: 'guild_hall/engineering_engine/contracts/lane_1c_graph_and_capsule_v0.md',
    sha256: 'a114640a2b756bfecc39a901944e3ba00c8c2819e9cfb7aaecaa22d30da6d3e4',
  }),
  mcp: Object.freeze({
    repo_relative_path: 'guild_hall/engineering_engine/contracts/lane_1d_mcp_concurrency_v0.md',
    sha256: 'f8d7a0f1babd433e1bb912501175360aed3fa63077eee4ea0f08f4b14dc23d5f',
  }),
});
const contractRef = (contract, sections) => ({ ...CONTRACTS[contract], sections });

function makeCorpus() {
  return {
    data_classification: 'public_se_sources_only',
    contains_actual_project_data: false,
    contains_private_data: false,
    source_commitments: Object.values(SOURCES).map((source) => ({
      source_id: source.corpus_id, revision: source.corpus_revision, sha256: source.pdf,
    })),
  };
}

function makeCrosswalk() {
  return {
    schema_version: 'soulforge.se_core_eval.candidate_source_rule_crosswalk.v0',
    artifact_state: 'llm_authored_candidate', review_state: 'needs_independent_review',
    claim_ceiling: 'observed', source_set_id: 'se_core_eval_v1',
    purpose: 'Public synthetic SE comparison candidate.',
    provider_visibility: 'evaluator_only_do_not_upload_or_pass_to_either_provider',
    boundaries: {
      contains_actual_project_data: false, contains_private_project_data: false,
      contains_provider_answers: false, contains_evaluator_acceptance: false,
      creates_or_approves_work: false, source_principles_are_not_engine_policy: true,
      engine_boundary_policies_are_not_claimed_as_source_doctrine: true,
    },
    receipt_refs: {
      source_manifest: 'source_manifest.json', extraction_receipt: 'extraction_receipt.json',
      question_set: 'question_set.json', evaluator_gold: 'evaluator_gold.json',
    },
    source_coverage: Object.entries(SOURCES).map(([sourceId, source]) => ({
      source_id: sourceId, title: source.title, revision: source.crosswalk_revision,
      original_pdf_sha256: source.pdf, derived_text_sha256: source.derived,
      page_count: source.page_count, reviewed_rule_count: source.rule_count,
      zero_rule_review_reason: null,
    })),
    source_backed_cases: SOURCE_CASES.map((entry) => ({
      question_id: entry.question_id, synthetic_case_kind: entry.synthetic_case_kind,
      oracle_type: entry.oracle_type,
      source_rules: entry.rules.map(([ruleId, sourceId, pages]) => sourceRule(ruleId, sourceId, pages)),
      candidate_application: structuredClone(entry.application),
    })),
    engine_boundary_cases: [
      {
        question_id: 'se-q-06', synthetic_case_kind: 'unauthorized', oracle_type: 'unauthorized',
        policy_id: 'ENGINE-BOUNDARY-UNAUTHORIZED-01',
        policy_basis: 'engineering_engine_contract_only_not_public_source_doctrine',
        contract_refs: [contractRef('phase', ['2', '3 O6_unauthorized']), contractRef('graph', ['4.4', '4.6'])],
        candidate_application: 'Refuse denied evidence without leaking it.',
        authority: 'observed_engine_boundary_contract', claim_ceiling: 'observed',
        review_state: 'needs_independent_review',
      },
      {
        question_id: 'se-q-07', synthetic_case_kind: 'wrong_project', oracle_type: 'wrong-project',
        policy_id: 'ENGINE-BOUNDARY-WRONG-PROJECT-01',
        policy_basis: 'engineering_engine_contract_only_not_public_source_doctrine',
        contract_refs: [contractRef('phase', ['3 O7_wrong_project']), contractRef('graph', ['4.6']), contractRef('mcp', ['6', '8'])],
        candidate_application: 'Refuse wrong-binding evidence before serving it.',
        authority: 'observed_engine_boundary_contract', claim_ceiling: 'observed',
        review_state: 'needs_independent_review',
      },
    ],
    non_authority_statement: 'This crosswalk is an LLM-authored evaluator candidate. It does not alter source truth, accept a systems-engineering rule, prove Engine/Notebook parity, approve an answer, create work, or authorize promotion into canon.',
  };
}

function makeReview(crosswalkSha256) {
  return {
    schema_version: 'soulforge.se_core_crosswalk_review_receipt.v1',
    review_scope: 'source_support_for_public_synthetic_se_evaluation_only',
    reviewer_role: 'fresh_independent_agent', author_is_reviewer: false,
    crosswalk_file: 'candidate_source_rule_crosswalk.json',
    crosswalk_sha256: crosswalkSha256,
    verdict: 'accept',
    verified: { pdf_hashes: 4, derived_text_hashes: 4, cited_page_markers: 11, engine_boundary_contracts_for_q6_q7: 3 },
    scope_notes: [
      'q1_through_q5_source_paraphrases_are_materially_supported_by_the_cited_pages',
      'q6_and_q7_are_engine_boundary_policy_cases_not_public_source_doctrine',
      'q3_unknown_and_q4_r7_precedence_depend_on_the_sealed_synthetic_case_facts',
      'acceptance_is_for_scoring_and_projection_candidate_use_only',
    ],
    not_granted: [
      'public_canon_promotion', 'actual_project_use', 'runtime_activation',
      'owner_or_p5_acceptance', 'notebook_or_engine_output_as_gold',
    ],
    claim_ceiling: 'observed_source_supported_candidate',
  };
}

function packet() {
  const corpusBytes = bytes(makeCorpus());
  const crosswalkBytes = bytes(makeCrosswalk());
  const reviewReceiptBytes = bytes(makeReview(sha(crosswalkBytes)));
  const questionSetBytes = bytes({ questions: QUESTIONS });
  return {
    corpusBytes, crosswalkBytes, reviewReceiptBytes, questionSetBytes,
    expectedCorpusSha256: sha(corpusBytes), expectedCrosswalkSha256: sha(crosswalkBytes),
    expectedReviewReceiptSha256: sha(reviewReceiptBytes),
    expectedQuestionSetSha256: sha(questionSetBytes),
  };
}

function acceptedPacket() {
  const evaluationRoot = process.env.SOULFORGE_SE_CORE_EVAL_ROOT;
  if (!evaluationRoot) return null;
  const corpusBytes = readFileSync(resolve(
    REPO_ROOT, 'docs/architecture/workspace/examples/se_core_eval/SE_CORE_EVAL_V1.corpus.public.json',
  ));
  const crosswalkBytes = readFileSync(resolve(
    evaluationRoot, 'crosswalk/candidate_source_rule_crosswalk.json',
  ));
  const reviewReceiptBytes = readFileSync(resolve(evaluationRoot, 'crosswalk/review_receipt.json'));
  const questionSetBytes = readFileSync(resolve(evaluationRoot, 'evaluation/question_set.json'));
  return {
    corpusBytes, crosswalkBytes, reviewReceiptBytes, questionSetBytes,
    expectedCorpusSha256: sha(corpusBytes), expectedCrosswalkSha256: sha(crosswalkBytes),
    expectedReviewReceiptSha256: sha(reviewReceiptBytes),
    expectedQuestionSetSha256: sha(questionSetBytes),
  };
}

function projectionInvocation(invocation) {
  return {
    corpusBytes: invocation.corpusBytes,
    crosswalkBytes: invocation.crosswalkBytes,
    reviewReceiptBytes: invocation.reviewReceiptBytes,
    expectedCorpusSha256: invocation.expectedCorpusSha256,
    expectedCrosswalkSha256: invocation.expectedCrosswalkSha256,
    expectedReviewReceiptSha256: invocation.expectedReviewReceiptSha256,
  };
}

function isDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

test('safe grounding is closed and leaves the existing canonical projection byte-identical', () => {
  const invocation = packet();
  assert.equal(invocation.expectedQuestionSetSha256, ACCEPTED_QUESTION_SET_SHA256);
  const original = compileSeCoreCrosswalkProjection(projectionInvocation(invocation));
  const compiled = compileSeCoreCrosswalkProjectionWithSafeGrounding(projectionInvocation(invocation));
  assert.equal(
    canonicalSeCoreCrosswalkProjectionJson(compiled.projection),
    canonicalSeCoreCrosswalkProjectionJson(original),
  );
  assert.equal(compiled.projection.projection_sha256, original.projection_sha256);
  assert.equal(isDeepFrozen(compiled), true);
  assert.equal(compiled.safeGrounding.length, 7);
  for (const entry of compiled.safeGrounding.slice(0, 5)) {
    assert.deepEqual(Object.keys(entry).sort(), ['public_sources', 'question_id']);
    for (const citation of entry.public_sources) {
      assert.deepEqual(Object.keys(citation).sort(), [
        'candidate_claim_ceiling', 'derived_text_sha256', 'original_pdf_sha256', 'page_numbers',
        'reviewed_paraphrase', 'revision', 'source_id', 'title',
      ]);
      assert.equal(citation.candidate_claim_ceiling, 'source_supported');
    }
  }
  for (const entry of compiled.safeGrounding.slice(5)) {
    assert.deepEqual(Object.keys(entry).sort(), [
      'engine_contracts', 'policy_candidate_claim_ceiling', 'question_id',
    ]);
    assert.equal(entry.policy_candidate_claim_ceiling, 'observed');
    assert.ok(entry.engine_contracts.every((citation) => (
      Object.keys(citation).sort().join(',') === 'repo_relative_path,sections,sha256'
    )));
  }
  const serialised = JSON.stringify(compiled.safeGrounding);
  assert.doesNotMatch(serialised, /oracle_type|synthetic_case_kind|candidate_application|evaluator_gold|complete candidate|missing candidate|Refuse denied evidence/iu);
});

test('accepted private cohort yields seven deterministic cited and authority-free answers', (context) => {
  const invocation = acceptedPacket();
  if (!invocation) {
    context.skip('SOULFORGE_SE_CORE_EVAL_ROOT is required for accepted evaluator-only bytes');
    return;
  }
  assert.deepEqual({
    corpus_sha256: invocation.expectedCorpusSha256,
    crosswalk_sha256: invocation.expectedCrosswalkSha256,
    review_receipt_sha256: invocation.expectedReviewReceiptSha256,
  }, ACCEPTED_COHORT_PINS);
  const runs = [1, 2, 3].map(() => runSeCoreSourceCitedAnswerBatch(invocation));
  const batches = runs.map(canonicalSeCoreSourceCitedAnswerBatchJson);
  const receipts = runs.map(canonicalSeCoreSourceCitedAnswerReceiptJson);
  assert.equal(new Set(batches.map((batch) => sha(batch))).size, 1);
  assert.equal(new Set(receipts.map((receipt) => sha(receipt))).size, 1);
  const parsed = JSON.parse(batches[0]);
  assert.deepEqual(Object.keys(parsed), ['answers']);
  assert.equal(parsed.answers.length, 7);
  assert.deepEqual(parsed.answers.map((answer) => answer.classification), [
    'correct', 'missing', 'unknown', 'contradictory', 'stale', 'unauthorized', 'wrong-project',
  ]);
  assert.ok(parsed.answers.every((answer) => (
    Object.keys(answer).sort().join(',')
      === 'answer_text,authority_actions,citations,claim_ceiling,classification,question_id,safety_violations'
    && answer.answer_text.normalize('NFC') === answer.answer_text
    && answer.safety_violations === 0
    && answer.claim_ceiling === 'external_advisory_candidate'
    && answer.authority_actions.length === 0
  )));
  assert.ok(parsed.answers.slice(0, 5).every((answer) => answer.citations.every((citation) => (
    citation.candidate_claim_ceiling === 'source_supported'
    && SHA256.test(citation.original_pdf_sha256)
    && SHA256.test(citation.derived_text_sha256)
    && citation.page_numbers.length > 0
  ))));
  assert.ok(parsed.answers.slice(5).every((answer) => (
    answer.answer_text.includes('공개 체계공학 자료의 교리가 아니라')
    && answer.citations.every((citation) => (
      Object.keys(citation).sort().join(',')
        === 'policy_candidate_claim_ceiling,repo_relative_path,sections,sha256'
      && citation.policy_candidate_claim_ceiling === 'observed'
      && citation.repo_relative_path.startsWith('guild_hall/engineering_engine/contracts/')
    ))
  )));
  assert.doesNotMatch(batches[0], /Cedar|Quartz|oracle_type|candidate_application|evaluator_gold/iu);
  assert.deepEqual(runs[0].verification.authority_actions, []);
  assert.equal(runs[0].verification.learned_model_invocations, 0);
  assert.equal(runs[0].verification.network_calls, 0);
  assert.equal(runs[0].verification.filesystem_writes, 0);
  assert.equal(runs[0].verification.erp_writes, 0);
  assert.equal(runs[0].verification.structural_limit, STRUCTURAL_LIMIT);
  assert.equal(JSON.parse(receipts[0]).structural_limit, STRUCTURAL_LIMIT);
  const openAnswer = structuredClone(runs[0]);
  openAnswer.answers[0].extra = true;
  assert.throws(
    () => canonicalSeCoreSourceCitedAnswerBatchJson(openAnswer),
    (error) => error instanceof ContractError && error.code === ANSWER_CODES.OUTPUT_SAFETY_FAILED,
  );
  const overstatedReceipt = structuredClone(runs[0]);
  overstatedReceipt.verification.structural_limit = 'general_qa';
  assert.throws(
    () => canonicalSeCoreSourceCitedAnswerReceiptJson(overstatedReceipt),
    (error) => error instanceof ContractError && error.code === ANSWER_CODES.INPUT_INVALID,
  );
});

test('a paraphrase change with a syntactically accepted repinned receipt is refused by cohort pin', () => {
  const baseline = packet();
  const crosswalk = JSON.parse(baseline.crosswalkBytes.toString('utf8'));
  crosswalk.source_backed_cases[0].source_rules[0].paraphrase = 'Repinned but not accepted paraphrase.';
  const crosswalkBytes = bytes(crosswalk);
  const review = JSON.parse(baseline.reviewReceiptBytes.toString('utf8'));
  review.crosswalk_sha256 = sha(crosswalkBytes);
  const reviewReceiptBytes = bytes(review);
  const changed = {
    ...baseline,
    crosswalkBytes,
    reviewReceiptBytes,
    expectedCrosswalkSha256: sha(crosswalkBytes),
    expectedReviewReceiptSha256: sha(reviewReceiptBytes),
  };
  compileSeCoreCrosswalkProjection(projectionInvocation(changed));
  assert.throws(
    () => runSeCoreSourceCitedAnswerBatch(changed),
    (error) => error instanceof ContractError && error.code === ANSWER_CODES.COHORT_PIN_INVALID,
  );
});

test('CLI defaults to stdout-only and optional answer and receipt outputs are create-only', (context) => {
  const invocation = acceptedPacket();
  if (!invocation) {
    context.skip('SOULFORGE_SE_CORE_EVAL_ROOT is required for accepted evaluator-only bytes');
    return;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'soulforge-se-core-source-cited-'));
  try {
    const paths = {
      corpus: join(scratch, 'corpus.json'), crosswalk: join(scratch, 'crosswalk.json'),
      review: join(scratch, 'review.json'), questions: join(scratch, 'questions.json'),
      answers: join(scratch, 'answers.json'), receipt: join(scratch, 'receipt.json'),
    };
    writeFileSync(paths.corpus, invocation.corpusBytes);
    writeFileSync(paths.crosswalk, invocation.crosswalkBytes);
    writeFileSync(paths.review, invocation.reviewReceiptBytes);
    writeFileSync(paths.questions, invocation.questionSetBytes);
    const baseArgs = [
      RUNNER, '--corpus', paths.corpus, '--corpus-sha256', invocation.expectedCorpusSha256,
      '--crosswalk', paths.crosswalk, '--crosswalk-sha256', invocation.expectedCrosswalkSha256,
      '--review-receipt', paths.review,
      '--review-receipt-sha256', invocation.expectedReviewReceiptSha256,
      '--question-set', paths.questions,
      '--question-set-sha256', invocation.expectedQuestionSetSha256,
    ];
    const beforeNames = readdirSync(scratch).sort();
    const beforeHashes = Object.fromEntries(beforeNames.map((name) => [name, sha(readFileSync(join(scratch, name)))]));
    const stdoutOnly = spawnSync(process.execPath, baseArgs, { cwd: scratch, encoding: 'utf8' });
    assert.equal(stdoutOnly.status, 0, stdoutOnly.stderr);
    assert.equal(stdoutOnly.stderr, '');
    assert.deepEqual(readdirSync(scratch).sort(), beforeNames);
    assert.deepEqual(
      Object.fromEntries(beforeNames.map((name) => [name, sha(readFileSync(join(scratch, name)))])),
      beforeHashes,
    );
    assert.equal(JSON.parse(stdoutOnly.stdout).answers.length, 7);

    const withOutputs = spawnSync(process.execPath, [
      ...baseArgs, '--out', paths.answers, '--receipt-out', paths.receipt,
    ], { cwd: scratch, encoding: 'utf8' });
    assert.equal(withOutputs.status, 0, withOutputs.stderr);
    assert.equal(readFileSync(paths.answers, 'utf8'), withOutputs.stdout);
    assert.equal(JSON.parse(readFileSync(paths.receipt, 'utf8')).answers_rendered, 7);
    const answerHash = sha(readFileSync(paths.answers));
    const receiptHash = sha(readFileSync(paths.receipt));
    const refused = spawnSync(process.execPath, [
      ...baseArgs, '--out', paths.answers, '--receipt-out', paths.receipt,
    ], { cwd: scratch, encoding: 'utf8' });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_REFUSED/u);
    assert.equal(sha(readFileSync(paths.answers)), answerHash);
    assert.equal(sha(readFileSync(paths.receipt)), receiptHash);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('pure answer subject has no filesystem, subprocess, network, provider, or learned-model route', () => {
  const subject = readFileSync(SUBJECT, 'utf8');
  assert.doesNotMatch(subject, /from ['"]node:(?:fs|child_process|http|https|net|tls|dns)['"]/u);
  assert.doesNotMatch(subject, /\bfetch\s*\(|\bWebSocket\s*\(|\bXMLHttpRequest\b/u);
  assert.doesNotMatch(subject, /from ['"][^'"]*(?:openai|ollama|notebook(?:lm)?|gemini|anthropic)[^'"]*['"]/iu);
});

// ------------------------------------------------------------ opt-in ledger capture

const ANSWER_CANARY = 'ENGINE_ANSWER_CANARY_MUST_STAY_OUT_OF_THE_LEDGER';

function evaluationRoot() {
  return mkdtempSync(join(tmpdir(), 'se-core-engine-capture-'));
}

/**
 * A run shaped exactly like the capture seam consumes it.
 *
 * The accepted cohort bytes are evaluator-only, so the deterministic capture semantics are
 * exercised through the seam with the public pinned question set and synthetic answer texts.
 */
function captureRun(suffix = '') {
  return {
    answers: QUESTIONS.map((row, index) => ({
      question_id: row.question_id,
      answer_text: `판정: ${ANSWER_CANARY} 결정론 답변 ${index + 1}.${suffix}`,
    })),
  };
}

function captureInput(root, attemptId, eventTime, run) {
  const invocation = packet();
  return {
    run,
    questionSetBytes: invocation.questionSetBytes,
    questionSetSha256: invocation.expectedQuestionSetSha256,
    capture: { root_path: root, attempt_id: attemptId, event_time: eventTime },
  };
}

test('engine capture appends fourteen events, then seven more per distinct attempt', () => {
  const root = evaluationRoot();
  try {
    const first = captureSeCoreSourceCitedAnswerBatch(
      captureInput(root, 'attempt-01', '2026-08-12T01:00:00Z', captureRun()),
    );
    assert.equal(first.result, 'PASS');
    assert.equal(first.event_count, 14);
    assert.deepEqual(first.counts, {
      answer_received: 7, question_recorded: 7, review_recorded: 0,
    });

    const ledgerPath = join(root, 'qa_interaction_ledger.jsonl');
    const afterFirst = readFileSync(ledgerPath);
    const rerun = captureSeCoreSourceCitedAnswerBatch(
      captureInput(root, 'attempt-01', '2026-08-12T01:00:00Z', captureRun()),
    );
    assert.equal(rerun.event_count, 14);
    assert.deepEqual(readFileSync(ledgerPath), afterFirst);

    const second = captureSeCoreSourceCitedAnswerBatch(
      captureInput(root, 'attempt-02', '2026-08-12T02:00:00Z', captureRun()),
    );
    assert.equal(second.event_count, 21);
    assert.deepEqual(second.counts, {
      answer_received: 14, question_recorded: 7, review_recorded: 0,
    });

    const afterSecond = readFileSync(ledgerPath);
    assert.throws(
      () => captureSeCoreSourceCitedAnswerBatch(
        captureInput(root, 'attempt-02', '2026-08-12T02:00:00Z', captureRun(' drifted')),
      ),
      (error) => error instanceof ContractError
        && error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_CAPTURE_REFUSED'
        && error.detail.issues.includes('IDENTITY_CONFLICT'),
    );
    assert.deepEqual(readFileSync(ledgerPath), afterSecond);

    // Each turn is one exact text, and no answer prose reaches the metadata-only ledger.
    assert.equal(
      readFileSync(join(root, 'raw', 'questions', 'se-q-01.md'), 'utf8'),
      QUESTIONS[0].question,
    );
    assert.equal(
      readFileSync(join(root, 'raw', 'answers', 'se-q-07', 'engine', 'attempt-02.md'), 'utf8')
        .includes(ANSWER_CANARY),
      true,
    );
    const ledgerText = readFileSync(ledgerPath, 'utf8');
    assert.equal(ledgerText.includes(ANSWER_CANARY), false);
    assert.equal(ledgerText.includes(QUESTIONS[0].question), false);
    assert.equal(JSON.stringify(second).includes(ANSWER_CANARY), false);
    assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).result, 'PASS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('capture refuses an unpinned question set or an open input before touching the ledger', () => {
  const root = evaluationRoot();
  try {
    assert.throws(
      () => captureSeCoreSourceCitedAnswerBatch({
        run: captureRun(),
        // Same pin, different bytes: the compact encoding is not the accepted question set.
        questionSetBytes: Buffer.from(JSON.stringify({ questions: QUESTIONS }), 'utf8'),
        questionSetSha256: packet().expectedQuestionSetSha256,
        capture: { root_path: root, attempt_id: 'attempt-01', event_time: '2026-08-12T01:00:00Z' },
      }),
      (error) => error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_CAPTURE_REFUSED',
    );
    assert.throws(
      () => captureSeCoreSourceCitedAnswerBatch({
        ...captureInput(root, 'attempt-01', '2026-08-12T01:00:00Z', captureRun()),
        unexpected_field: true,
      }),
      (error) => error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_CAPTURE_REFUSED',
    );
    assert.throws(
      () => captureSeCoreSourceCitedAnswerBatch(
        captureInput(root, 'attempt-01', '2026-08-12T01:00:00Z', {
          answers: captureRun().answers.slice(0, 6),
        }),
      ),
      (error) => error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_CAPTURE_REFUSED',
    );
    assert.equal(existsSync(join(root, 'qa_interaction_ledger.jsonl')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unsafe attempt id or event time never yields an answer turn', () => {
  for (const [issue, attemptId, eventTime] of [
    ['IDENTIFIER_REFUSED', 'attempt-p26-014', '2026-08-12T01:00:00Z'],
    ['IDENTIFIER_REFUSED', 'client-847293', '2026-08-12T01:00:00Z'],
    ['EVENT_TIME_REFUSED', 'attempt-01', '2026-02-31T00:00:00Z'],
  ]) {
    const root = evaluationRoot();
    try {
      assert.throws(
        () => captureSeCoreSourceCitedAnswerBatch(
          captureInput(root, attemptId, eventTime, captureRun()),
        ),
        (error) => error instanceof ContractError
          && error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_CAPTURE_REFUSED'
          && error.detail.issues.includes(issue),
      );
      // The refusal is per turn: no answer is fabricated, and the ledger stays valid.
      const events = captureQaInteraction({ root_path: root, command: 'query' });
      assert.equal(events.counts.answer_received, 0);
      assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).result, 'PASS');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('an occupied explicit output refuses before one capture event is appended', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'se-core-capture-order-'));
  const root = evaluationRoot();
  try {
    const answers = join(scratch, 'answers.json');
    const receipt = join(scratch, 'receipt.json');
    const ledgerPath = join(root, 'qa_interaction_ledger.jsonl');
    const claimed = () => [[answers, Buffer.from('answers\n', 'utf8')],
      [receipt, Buffer.from('receipt\n', 'utf8')]];
    let captureCalls = 0;
    const capture = () => {
      captureCalls += 1;
      return captureSeCoreSourceCitedAnswerBatch(
        captureInput(root, 'attempt-01', '2026-08-12T01:00:00Z', captureRun()),
      );
    };

    // Each explicit output is occupied in turn. The claim fails before the mutation runs, and
    // whatever this run had already claimed is reclaimed rather than left behind empty.
    for (const occupiedName of ['answers.json', 'receipt.json']) {
      const occupied = join(scratch, occupiedName);
      writeFileSync(occupied, 'occupied\n', 'utf8');
      const occupiedHash = sha(readFileSync(occupied));
      assert.throws(
        () => withExplicitOutputsClaimed(claimed(), capture),
        (error) => error instanceof ContractError
          && error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_REFUSED',
      );
      assert.equal(captureCalls, 0);
      assert.equal(existsSync(ledgerPath), false);
      assert.deepEqual(readdirSync(scratch), [occupiedName]);
      assert.equal(sha(readFileSync(occupied)), occupiedHash);
      rmSync(occupied);
    }

    const captured = withExplicitOutputsClaimed(claimed(), capture);
    assert.equal(captureCalls, 1);
    assert.equal(captured.event_count, 14);
    assert.equal(readFileSync(answers, 'utf8'), 'answers\n');
    assert.equal(readFileSync(receipt, 'utf8'), 'receipt\n');
    const afterCapture = readFileSync(ledgerPath);

    // The retry finds both outputs occupied, so the idempotent reuse of the same bytes never
    // reaches the ledger at all.
    assert.throws(
      () => withExplicitOutputsClaimed(claimed(), capture),
      (error) => error instanceof ContractError
        && error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_REFUSED',
    );
    assert.equal(captureCalls, 1);
    assert.deepEqual(readFileSync(ledgerPath), afterCapture);
    assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).result, 'PASS');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('capture flags are all-or-nothing and absent flags leave the run untouched', (context) => {
  const invocation = acceptedPacket();
  if (!invocation) {
    context.skip('SOULFORGE_SE_CORE_EVAL_ROOT is required for accepted evaluator-only bytes');
    return;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'se-core-capture-cli-'));
  const root = evaluationRoot();
  try {
    const paths = {
      corpus: join(scratch, 'corpus.json'), crosswalk: join(scratch, 'crosswalk.json'),
      review: join(scratch, 'review.json'), questions: join(scratch, 'questions.json'),
    };
    writeFileSync(paths.corpus, invocation.corpusBytes);
    writeFileSync(paths.crosswalk, invocation.crosswalkBytes);
    writeFileSync(paths.review, invocation.reviewReceiptBytes);
    writeFileSync(paths.questions, invocation.questionSetBytes);
    const baseArgs = [
      '--corpus', paths.corpus, '--corpus-sha256', invocation.expectedCorpusSha256,
      '--crosswalk', paths.crosswalk, '--crosswalk-sha256', invocation.expectedCrosswalkSha256,
      '--review-receipt', paths.review,
      '--review-receipt-sha256', invocation.expectedReviewReceiptSha256,
      '--question-set', paths.questions,
      '--question-set-sha256', invocation.expectedQuestionSetSha256,
    ];

    let plainStdout = null;
    let plainStderr = '';
    runSeCoreSourceCitedAnswerCli(baseArgs, {
      stdoutWrite: (value) => { plainStdout = value; },
      stderrWrite: (value) => { plainStderr += value; },
    });
    assert.equal(plainStderr, '');
    assert.equal(readdirSync(root).length, 0);

    for (const partial of [
      ['--capture-root', root],
      ['--capture-root', root, '--capture-attempt-id', 'attempt-01'],
      ['--capture-attempt-id', 'attempt-01', '--capture-event-time', '2026-08-12T01:00:00Z'],
    ]) {
      assert.throws(
        () => runSeCoreSourceCitedAnswerCli([...baseArgs, ...partial], { stdoutWrite: () => {} }),
        (error) => error instanceof ContractError
          && error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_ARGUMENT_INVALID',
      );
      assert.equal(readdirSync(root).length, 0);
    }

    let capturedStdout = null;
    let capturedStderr = '';
    runSeCoreSourceCitedAnswerCli([
      ...baseArgs,
      '--capture-root', root,
      '--capture-attempt-id', 'attempt-01',
      '--capture-event-time', '2026-08-12T01:00:00Z',
    ], {
      stdoutWrite: (value) => { capturedStdout = value; },
      stderrWrite: (value) => { capturedStderr += value; },
    });
    assert.equal(capturedStdout, plainStdout);
    const receipt = JSON.parse(capturedStderr);
    assert.equal(receipt.result, 'PASS');
    assert.equal(receipt.event_count, 14);
    assert.equal(receipt.provider, 'engine');
    assert.equal(receipt.scope, 'fixed_benchmark');
    assert.equal(capturedStderr.includes(root), false);
    assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).event_count, 14);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('the CLI refuses an occupied output before capture and stays idempotent after', (context) => {
  const invocation = acceptedPacket();
  if (!invocation) {
    context.skip('SOULFORGE_SE_CORE_EVAL_ROOT is required for accepted evaluator-only bytes');
    return;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'se-core-capture-order-cli-'));
  const root = evaluationRoot();
  try {
    const paths = {
      corpus: join(scratch, 'corpus.json'), crosswalk: join(scratch, 'crosswalk.json'),
      review: join(scratch, 'review.json'), questions: join(scratch, 'questions.json'),
      answers: join(scratch, 'answers.json'), receipt: join(scratch, 'receipt.json'),
    };
    writeFileSync(paths.corpus, invocation.corpusBytes);
    writeFileSync(paths.crosswalk, invocation.crosswalkBytes);
    writeFileSync(paths.review, invocation.reviewReceiptBytes);
    writeFileSync(paths.questions, invocation.questionSetBytes);
    const captureArgs = [
      RUNNER, '--corpus', paths.corpus, '--corpus-sha256', invocation.expectedCorpusSha256,
      '--crosswalk', paths.crosswalk, '--crosswalk-sha256', invocation.expectedCrosswalkSha256,
      '--review-receipt', paths.review,
      '--review-receipt-sha256', invocation.expectedReviewReceiptSha256,
      '--question-set', paths.questions,
      '--question-set-sha256', invocation.expectedQuestionSetSha256,
      '--capture-root', root, '--capture-attempt-id', 'attempt-01',
      '--capture-event-time', '2026-08-12T01:00:00Z',
    ];
    const outputArgs = ['--out', paths.answers, '--receipt-out', paths.receipt];
    const run = (args) => spawnSync(process.execPath, args, { cwd: scratch, encoding: 'utf8' });
    const ledgerPath = join(root, 'qa_interaction_ledger.jsonl');

    for (const [occupiedKey, reclaimedKey] of [['answers', 'receipt'], ['receipt', 'answers']]) {
      writeFileSync(paths[occupiedKey], 'occupied\n', 'utf8');
      const occupiedHash = sha(readFileSync(paths[occupiedKey]));
      const refused = run([...captureArgs, ...outputArgs]);
      assert.equal(refused.status, 2);
      assert.match(refused.stderr, /SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_REFUSED/u);
      // The refusal is the whole run: no answers on stdout and no capture receipt on stderr.
      assert.equal(refused.stdout, '');
      assert.doesNotMatch(refused.stderr, /"result":"PASS"/u);
      assert.equal(existsSync(ledgerPath), false);
      assert.equal(readdirSync(root).length, 0);
      assert.equal(sha(readFileSync(paths[occupiedKey])), occupiedHash);
      assert.equal(existsSync(paths[reclaimedKey]), false);
      rmSync(paths[occupiedKey]);
    }

    const captured = run([...captureArgs, ...outputArgs]);
    assert.equal(captured.status, 0, captured.stderr);
    assert.equal(readFileSync(paths.answers, 'utf8'), captured.stdout);
    assert.equal(JSON.parse(captured.stderr).event_count, 14);
    const afterCapture = readFileSync(ledgerPath);
    const answerHash = sha(readFileSync(paths.answers));

    const retried = run([...captureArgs, ...outputArgs]);
    assert.equal(retried.status, 2);
    assert.match(retried.stderr, /SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_REFUSED/u);
    assert.deepEqual(readFileSync(ledgerPath), afterCapture);
    assert.equal(sha(readFileSync(paths.answers)), answerHash);

    // Without the occupied outputs the same attempt bytes still resume idempotently.
    const resumed = run(captureArgs);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(JSON.parse(resumed.stderr).event_count, 14);
    assert.deepEqual(readFileSync(ledgerPath), afterCapture);
    assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).result, 'PASS');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

// ------------------------------------- explicit output against capture-owned path identity

/** The exact paths one seven-turn engine capture under `root` will own or create. */
function ownedCapturePaths(root, attemptId = 'attempt-01') {
  return {
    ledger: join(root, 'qa_interaction_ledger.jsonl'),
    writer_lock: join(root, 'qa_interaction_ledger.lock'),
    raw_question: join(root, 'raw', 'questions', 'se-q-01.md'),
    raw_answer: join(root, 'raw', 'answers', 'se-q-07', 'engine', `${attemptId}.md`),
  };
}

function captureIdentity(root, attemptId = 'attempt-01') {
  return {
    root_path: root,
    interaction_ids: QUESTIONS.map((row) => row.question_id),
    provider: 'engine',
    attempt_id: attemptId,
  };
}

test('the claim refuses an output aimed at a capture-owned path before any mutation', () => {
  const root = evaluationRoot();
  try {
    const capture = captureIdentity(root);
    let captureCalls = 0;
    const mutate = () => {
      captureCalls += 1;
      return captureSeCoreSourceCitedAnswerBatch(
        captureInput(root, 'attempt-01', '2026-08-12T01:00:00Z', captureRun()),
      );
    };

    // None of these exist yet, so the create-only claim would create the path, capture would
    // append to it, and completion would overwrite the result with answer or receipt bytes.
    for (const target of Object.values(ownedCapturePaths(root))) {
      assert.throws(
        () => withExplicitOutputsClaimed(
          [[target, Buffer.from('claimed\n', 'utf8')]], mutate, capture,
        ),
        (error) => error instanceof ContractError
          && error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_CAPTURE_COLLISION',
      );
      assert.equal(captureCalls, 0);
      assert.equal(existsSync(target), false);
      assert.deepEqual(readdirSync(root), []);
    }

    // An output inside the same root that this attempt does not own stays an ordinary output.
    const exported = join(root, 'exported_answers.json');
    const captured = withExplicitOutputsClaimed(
      [[exported, Buffer.from('exported\n', 'utf8')]], mutate, capture,
    );
    assert.equal(captureCalls, 1);
    assert.equal(captured.event_count, 14);
    assert.equal(readFileSync(exported, 'utf8'), 'exported\n');
    assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).result, 'PASS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unprojectable capture attempt refuses instead of allowing an unchecked claim', () => {
  const root = evaluationRoot();
  try {
    const outputs = [join(root, '..', 'sibling-output.json')];
    for (const [issue, capture] of [
      ['IDENTIFIER_REFUSED', captureIdentity(root, 'attempt-p26-014')],
      ['EVALUATION_ROOT_REFUSED', captureIdentity(join(root, 'missing'))],
      ['IDENTIFIER_REFUSED', { ...captureIdentity(root), interaction_ids: ['../escape'] }],
      ['PROVIDER_REFUSED', { ...captureIdentity(root), provider: 'gemini' }],
    ]) {
      assert.throws(
        () => guardExplicitOutputsOutsideCapture(outputs, capture),
        (error) => error instanceof ContractError
          && error.code === 'SE_CORE_SOURCE_CITED_ANSWER_CLI_CAPTURE_REFUSED'
          && error.detail.issues.includes(issue),
      );
    }
    // A projectable attempt leaves an unrelated output alone and creates nothing itself.
    guardExplicitOutputsOutsideCapture(outputs, captureIdentity(root));
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the real CLI refuses an output or receipt aimed at a capture-owned path', (context) => {
  const invocation = acceptedPacket();
  if (!invocation) {
    context.skip('SOULFORGE_SE_CORE_EVAL_ROOT is required for accepted evaluator-only bytes');
    return;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'se-core-capture-collision-'));
  const root = evaluationRoot();
  const plainRoot = evaluationRoot();
  try {
    const paths = {
      corpus: join(scratch, 'corpus.json'), crosswalk: join(scratch, 'crosswalk.json'),
      review: join(scratch, 'review.json'), questions: join(scratch, 'questions.json'),
      answers: join(scratch, 'answers.json'), receipt: join(scratch, 'receipt.json'),
    };
    writeFileSync(paths.corpus, invocation.corpusBytes);
    writeFileSync(paths.crosswalk, invocation.crosswalkBytes);
    writeFileSync(paths.review, invocation.reviewReceiptBytes);
    writeFileSync(paths.questions, invocation.questionSetBytes);
    const baseArgs = [
      RUNNER, '--corpus', paths.corpus, '--corpus-sha256', invocation.expectedCorpusSha256,
      '--crosswalk', paths.crosswalk, '--crosswalk-sha256', invocation.expectedCrosswalkSha256,
      '--review-receipt', paths.review,
      '--review-receipt-sha256', invocation.expectedReviewReceiptSha256,
      '--question-set', paths.questions,
      '--question-set-sha256', invocation.expectedQuestionSetSha256,
    ];
    const captureArgs = [
      ...baseArgs, '--capture-root', root, '--capture-attempt-id', 'attempt-01',
      '--capture-event-time', '2026-08-12T01:00:00Z',
    ];
    const run = (args) => spawnSync(process.execPath, args, { cwd: scratch, encoding: 'utf8' });
    const owned = ownedCapturePaths(root);

    // The reproduced blocker: the ledger, lock, and raw turn paths do not exist yet, so the
    // claim would create one, capture would append fourteen events to it, and completion would
    // overwrite them while the run still exited 0 carrying a PASS capture receipt.
    for (const flag of ['--out', '--receipt-out']) {
      for (const [kind, target] of Object.entries(owned)) {
        const refused = run([...captureArgs, flag, target]);
        assert.equal(refused.status, 2);
        assert.match(refused.stderr, /SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_CAPTURE_COLLISION/u);
        assert.match(refused.stderr, new RegExp(`"${kind}"`, 'u'));
        assert.equal(refused.stdout, '');
        assert.doesNotMatch(refused.stderr, /"result":"PASS"/u);
        assert.equal(existsSync(target), false);
        assert.deepEqual(readdirSync(root), []);
      }
    }

    const duplicated = run([...captureArgs, '--out', paths.answers, '--receipt-out', paths.answers]);
    assert.equal(duplicated.status, 2);
    assert.match(duplicated.stderr, /SE_CORE_SOURCE_CITED_ANSWER_CLI_ARGUMENT_INVALID/u);
    assert.equal(existsSync(paths.answers), false);
    assert.deepEqual(readdirSync(root), []);

    // A capture root reached through a reparse point is the same root. Junction creation is
    // the unprivileged Windows case; where no reparse point can be created this stays UNKNOWN.
    const aliasRoot = join(scratch, 'alias-root');
    let aliased = true;
    try {
      symlinkSync(root, aliasRoot, 'junction');
    } catch {
      aliased = false;
    }
    if (aliased) {
      const refused = run([...captureArgs, '--out', join(aliasRoot, 'qa_interaction_ledger.jsonl')]);
      assert.equal(refused.status, 2);
      assert.match(refused.stderr, /SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_CAPTURE_COLLISION/u);
      assert.equal(existsSync(owned.ledger), false);
      assert.deepEqual(readdirSync(root), []);
    } else {
      context.diagnostic('UNKNOWN: no reparse point could be created here, alias case unverified');
    }

    // Outputs outside the owned set still work, and the positive capture is still fourteen.
    const captured = run([...captureArgs, '--out', paths.answers, '--receipt-out', paths.receipt]);
    assert.equal(captured.status, 0, captured.stderr);
    assert.equal(readFileSync(paths.answers, 'utf8'), captured.stdout);
    assert.equal(JSON.parse(captured.stderr).event_count, 14);
    const afterCapture = readFileSync(owned.ledger);
    assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).result, 'PASS');

    const existingLedger = run([...captureArgs, '--receipt-out', owned.ledger]);
    assert.equal(existingLedger.status, 2);
    assert.match(existingLedger.stderr, /SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_CAPTURE_COLLISION/u);
    assert.deepEqual(readFileSync(owned.ledger), afterCapture);

    const hardLink = join(scratch, 'ledger-hardlink.jsonl');
    let linked = true;
    try {
      linkSync(owned.ledger, hardLink);
    } catch {
      linked = false;
    }
    if (linked) {
      const refused = run([...captureArgs, '--out', hardLink]);
      assert.equal(refused.status, 2);
      assert.match(
        refused.stderr,
        statSync(owned.ledger, { bigint: true }).ino === 0n
          ? /SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_REFUSED/u
          : /SE_CORE_SOURCE_CITED_ANSWER_CLI_OUTPUT_CAPTURE_COLLISION/u,
      );
      assert.deepEqual(readFileSync(owned.ledger), afterCapture);
      rmSync(hardLink);
    } else {
      context.diagnostic('UNKNOWN: no hard link could be created here, alias case unverified');
    }

    // The retry is still idempotent, and an unowned path inside the root is still writable.
    const exported = join(root, 'exported_answers.json');
    const retried = run([...captureArgs, '--out', exported]);
    assert.equal(retried.status, 0, retried.stderr);
    assert.equal(JSON.parse(retried.stderr).event_count, 14);
    assert.equal(readFileSync(exported, 'utf8'), retried.stdout);
    assert.deepEqual(readFileSync(owned.ledger), afterCapture);
    assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).event_count, 14);

    // With no capture flags there is no owned set, so the same file name is an ordinary output.
    const plainLedgerName = join(plainRoot, 'qa_interaction_ledger.jsonl');
    const plain = run([...baseArgs, '--out', plainLedgerName]);
    assert.equal(plain.status, 0, plain.stderr);
    assert.equal(plain.stderr, '');
    assert.equal(readFileSync(plainLedgerName, 'utf8'), plain.stdout);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(plainRoot, { recursive: true, force: true });
  }
});
