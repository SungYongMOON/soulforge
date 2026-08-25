import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  backfillSeCoreEvalQaContinuation,
  querySeCoreEvalQaContinuation,
  SE_CORE_EVAL_QA_PRIOR_LEDGER_ANCHOR,
  validateSeCoreEvalQaContinuation,
} from '../evaluation/se_core_eval_qa_continuation.mjs';
import { runCli } from '../tools/se_core_eval_qa_continuation.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMP_ROOTS = new Set();
const PRIOR = { ...SE_CORE_EVAL_QA_PRIOR_LEDGER_ANCHOR };
const QUESTION_IDS = Object.freeze(Array.from(
  { length: 7 },
  (_, index) => `se-q-${String(index + 1).padStart(2, '0')}`,
));
const CLASSIFICATIONS = Object.freeze([
  'correct', 'missing', 'unknown', 'contradictory', 'stale', 'unauthorized', 'wrong-project',
]);
const HASHES = Object.freeze({
  questionSet: '1'.repeat(64),
  corpus: '2'.repeat(64),
  crosswalk: '3'.repeat(64),
  projection: '4'.repeat(64),
  answerPolicy: '5'.repeat(64),
  evaluatorGold: '6'.repeat(64),
  crosswalkReviewReceipt: '7'.repeat(64),
});
const PROPOSITION_CATALOG = Object.freeze(Object.fromEntries(QUESTION_IDS.map(
  (questionId, index) => [questionId, Array.from(
    { length: index === 0 ? 3 : 4 },
    (_, offset) => `M-Q${String(index + 1).padStart(2, '0')}-${String(offset + 1).padStart(2, '0')}`,
  )],
)));
const FORBIDDEN_CATALOG = Object.freeze(Object.fromEntries(QUESTION_IDS.map(
  (questionId, index) => [questionId, [
    'F-COM-01', 'F-COM-02', 'F-COM-03', 'F-COM-04',
    `F-Q${String(index + 1).padStart(2, '0')}-01`,
  ]],
)));
const RAW_ANSWER = [
  'This is opaque answer text and must never enter the ledger.',
  'owner@example.invalid',
  'api_key=do-not-echo-this-secret',
  'project_code=P00-000',
].join('\n');

afterEach(() => {
  for (const root of TEMP_ROOTS) {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
  TEMP_ROOTS.clear();
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(stableValue(value))}\n`, 'utf8');
}

function canonicalSha256(value) {
  return sha256(canonicalBytes(value));
}

function domainSha256(domain, value) {
  return sha256(Buffer.concat([Buffer.from(`${domain}\n`, 'utf8'), canonicalBytes(value)]));
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'se-core-eval-qa-continuation-'));
  TEMP_ROOTS.add(root);
  return root;
}

function writeBytes(root, locator, bytes) {
  const target = join(root, ...locator.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { byte_length: bytes.length, sha256: sha256(bytes) };
}

function writeJson(root, locator, value) {
  return writeBytes(root, locator, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

function readJson(root, locator) {
  return JSON.parse(readFileSync(join(root, ...locator.split('/')), 'utf8'));
}

function pins() {
  return {
    question_set_sha256: HASHES.questionSet,
    corpus_sha256: HASHES.corpus,
    crosswalk_sha256: HASHES.crosswalk,
    projection_sha256: HASHES.projection,
    answer_policy_sha256: HASHES.answerPolicy,
  };
}

function buildFixture() {
  const root = makeRoot();
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const attempt = String(attemptIndex).padStart(2, '0');
    const folder = `attempt_${attempt}`;
    const runId = `engine_qa_attempt_${attempt}`;
    const answers = {
      answers: QUESTION_IDS.map((questionId, index) => ({
        question_id: questionId,
        classification: CLASSIFICATIONS[index],
        claim_ceiling: 'external_advisory_candidate',
        safety_violations: 0,
        authority_actions: [],
        answer_text: `${RAW_ANSWER}\nattempt=${attempt}\nquestion=${questionId}`,
        citations: [{ source_id: 'public-source-a', page: index + 1 }],
      })),
    };
    const answersWritten = writeJson(root, `exports/engine_qa/${folder}/answers.json`, answers);
    const receipt = {
      schema_version: 'soulforge.se_core_source_cited_answer_verification.v0',
      artifact_state: 'candidate_only',
      answer_policy_revision: 'soulforge.se_core_source_cited_answer_run.v0',
      question_set_sha256: HASHES.questionSet,
      projection_revision: 'se-core-crosswalk-projection-synthetic',
      projection_sha256: HASHES.projection,
      answers_rendered: 7,
      learned_model_invocations: 0,
      network_calls: 0,
      filesystem_writes: 0,
      erp_writes: 0,
      structural_limit: 'fixed_case_structured_renderer_not_general_qa',
      claim_ceiling: 'external_advisory_candidate',
      authority_actions: [],
    };
    const receiptWritten = writeJson(
      root,
      `exports/engine_qa/${folder}/verification_receipt.json`,
      receipt,
    );
    const manifest = {
      schema_version: 'soulforge.engineering_engine.se_core_natural_qa_run_manifest.v1',
      run_id: runId,
      attempt_index: attemptIndex,
      data_boundary: {
        public_se_sources_only: true,
        fully_synthetic_case_facts_only: true,
        contains_actual_project_data: false,
        contains_private_project_data: false,
        contains_account_or_notebook_identifiers: false,
        evaluator_gold_exposed_to_runner: false,
        notebook_outputs_exposed_to_runner: false,
      },
      frozen_inputs: pins(),
      outputs: {
        answers: {
          file: 'answers.json',
          byte_length: answersWritten.byte_length,
          raw_sha256: answersWritten.sha256,
        },
        verification_receipt: {
          file: 'verification_receipt.json',
          byte_length: receiptWritten.byte_length,
          raw_sha256: receiptWritten.sha256,
        },
      },
      answer_rows: answers.answers.map((answer, index) => ({
        question_id: answer.question_id,
        record_pointer: `/answers/${index}`,
        row_payload_sha256: canonicalSha256(answer),
        classification: answer.classification,
        claim_ceiling: answer.claim_ceiling,
        safety_violations: answer.safety_violations,
        authority_action_count: answer.authority_actions.length,
      })),
      counts: { answer_count: 7, safety_violations: 0, authority_actions: 0 },
      claim_ceiling: 'observed_public_synthetic_candidate',
    };
    const manifestWritten = writeJson(root, `exports/engine_qa/${folder}/run_manifest.json`, manifest);

    const reviewFiles = [];
    const reviewerRefs = [];
    const questionResults = [];
    const oracleBasis = {
      ...pins(),
      evaluator_gold_raw_sha256: HASHES.evaluatorGold,
      crosswalk_review_receipt: {
        raw_sha256: HASHES.crosswalkReviewReceipt,
        scope: 'accepted_source_rule_crosswalk_review',
      },
      notebook_output_is_gold: false,
      engine_output_is_gold: false,
    };
    for (let index = 0; index < QUESTION_IDS.length; index += 1) {
      const questionId = QUESTION_IDS[index];
      const reviewId = `review_${runId}_${questionId}`;
      const reviewer = {
        pseudonymous_ref: `reviewer_attempt_${attempt}`,
        kind: 'independent_agent',
        role: 'fresh_independent_scorer',
        author_is_reviewer: false,
        notebook_outputs_visible: false,
        other_engine_attempts_visible: false,
        prior_engine_reviews_visible: false,
      };
      const review = {
        schema_version: 'soulforge.engineering_engine.se_core_natural_qa_answer_review.v1',
        run_id: runId,
        attempt_index: attemptIndex,
        question_id: questionId,
        review_id: reviewId,
        review_state: 'completed',
        provider_role: 'comparison_contestant_not_gold',
        reviewer,
        oracle_basis: oracleBasis,
        artifact_refs: {
          answer_manifest_raw_sha256: manifestWritten.sha256,
          verification_receipt_raw_sha256: receiptWritten.sha256,
          answer_batch_raw_sha256: answersWritten.sha256,
          answer_row_payload_sha256: manifest.answer_rows[index].row_payload_sha256,
        },
        exact_case_classification: {
          declared: CLASSIFICATIONS[index],
          expected: CLASSIFICATIONS[index],
          observed_primary: CLASSIFICATIONS[index],
          status: 'pass',
        },
        mandatory_propositions: {
          status: 'pass',
          items: PROPOSITION_CATALOG[questionId].map((propositionId) => ({
            proposition_id: propositionId,
            status: 'satisfied',
          })),
        },
        forbidden_claims: {
          status: 'pass',
          items: FORBIDDEN_CATALOG[questionId].map((claimId) => ({
            claim_id: claimId,
            status: 'absent',
          })),
        },
        evidence_limit_and_action_boundary: {
          status: 'pass',
          evidence_limit_respected: true,
          authority_action_count: 0,
        },
        citation_fidelity: index < 5
          ? { applicable: true, status: 'pass' }
          : { applicable: false, status: 'not_applicable' },
        engine_boundary_fidelity: index >= 5
          ? { applicable: true, status: 'pass' }
          : { applicable: false, status: 'not_applicable' },
        usefulness: { status: 'useful' },
        normalized_sidecar_candidate: {
          classification: CLASSIFICATIONS[index],
          useful: true,
          safety_violations: 0,
          claim_ceiling: 'external_advisory_candidate',
          authority_actions: [],
        },
        overall_verdict: 'pass',
        review_issue_codes: [],
        claim_ceiling: 'observed_human_review',
      };
      const written = writeJson(
        root,
        `reviews/engine_qa/${folder}/${questionId}.review.json`,
        review,
      );
      reviewFiles.push({
        byte_length: written.byte_length,
        file_name: `${questionId}.review.json`,
        question_id: questionId,
        review_id: reviewId,
        sha256: written.sha256,
      });
      reviewerRefs.push({
        question_id: questionId,
        reviewer_ref: reviewer.pseudonymous_ref,
        reviewer_kind: reviewer.kind,
      });
      questionResults.push({
        question_id: questionId,
        review_id: reviewId,
        review_raw_sha256: written.sha256,
        exact_case_status: 'pass',
        mandatory_propositions_status: 'pass',
        forbidden_claims_status: 'pass',
        citation_fidelity_status: index < 5 ? 'pass' : 'not_applicable',
        engine_boundary_fidelity_status: index >= 5 ? 'pass' : 'not_applicable',
        usefulness_status: 'useful',
        overall_verdict: 'pass',
        review_issue_codes: [],
      });
    }
    writeJson(root, `reviews/engine_qa/${folder}/summary.json`, {
      schema_version: 'soulforge.engineering_engine.se_core_natural_qa_round_summary.v1',
      run_id: runId,
      attempt_index: attemptIndex,
      reviewer_refs: reviewerRefs,
      artifact_refs: {
        answer_manifest_raw_sha256: manifestWritten.sha256,
        verification_receipt_raw_sha256: receiptWritten.sha256,
        answer_batch_raw_sha256: answersWritten.sha256,
      },
      oracle_basis: oracleBasis,
      review_files: reviewFiles,
      question_results: questionResults,
      counts: {
        reviews: 7,
        pass: 7,
        revise: 0,
        hold: 0,
        mandatory_propositions_total: 27,
        mandatory_propositions_satisfied: 27,
        mandatory_propositions_missing: 0,
        mandatory_propositions_contradicted: 0,
        forbidden_claims_total: 35,
        forbidden_claims_absent: 35,
        forbidden_claims_present: 0,
        citation_fidelity_denominator: 5,
        citation_fidelity_pass: 5,
        citation_fidelity_fail: 0,
        engine_boundary_fidelity_denominator: 2,
        engine_boundary_fidelity_pass: 2,
        engine_boundary_fidelity_fail: 0,
        useful: 7,
        not_useful: 0,
        safety_violations: 0,
        authority_actions: 0,
      },
      comparison_limits: {
        provider_byte_parity: 'not_verified',
        notebook_output_is_gold: false,
        engine_output_is_gold: false,
        notebook_is_truth: false,
        engine_is_truth: false,
        winner_declared: false,
        final_comparison_allowed: false,
      },
      claim_ceiling: 'observed_independent_round_review',
      overall_verdict: 'pass',
    });
  }
  return root;
}

function build(root = buildFixture(), existing) {
  const options = {
    root_path: root,
    prior_ledger_anchor: { ...PRIOR },
  };
  if (existing !== undefined) options.existing_continuation_bytes = existing;
  const result = backfillSeCoreEvalQaContinuation(options);
  assert.equal(result.result, 'PASS', JSON.stringify(result.report));
  return result;
}

function events(bytes) {
  return bytes.toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
}

function rewriteJson(root, locator, mutate) {
  const value = readJson(root, locator);
  mutate(value);
  return writeJson(root, locator, value);
}

function rebindSummaryReview(root, attemptIndex, questionId, mutateSummary) {
  const attempt = String(attemptIndex).padStart(2, '0');
  const folder = `attempt_${attempt}`;
  const reviewLocator = `reviews/engine_qa/${folder}/${questionId}.review.json`;
  const reviewBytes = readFileSync(join(root, ...reviewLocator.split('/')));
  const review = JSON.parse(reviewBytes.toString('utf8'));
  rewriteJson(root, `reviews/engine_qa/${folder}/summary.json`, (summary) => {
    const fileRef = summary.review_files.find((entry) => entry.question_id === questionId);
    fileRef.byte_length = reviewBytes.length;
    fileRef.sha256 = sha256(reviewBytes);
    const result = summary.question_results.find((entry) => entry.question_id === questionId);
    Object.assign(result, {
      review_raw_sha256: sha256(reviewBytes),
      exact_case_status: review.exact_case_classification.status,
      mandatory_propositions_status: review.mandatory_propositions.status,
      forbidden_claims_status: review.forbidden_claims.status,
      citation_fidelity_status: review.citation_fidelity.status,
      engine_boundary_fidelity_status: review.engine_boundary_fidelity.status,
      usefulness_status: review.usefulness.status,
      overall_verdict: review.overall_verdict,
      review_issue_codes: [...review.review_issue_codes],
    });
    mutateSummary(summary);
  });
}

function recomputeContinuation(sourceEvents) {
  const rewritten = structuredClone(sourceEvents);
  const byId = new Map();
  let previousHash = PRIOR.head_event_hash;
  for (let index = 0; index < rewritten.length; index += 1) {
    const event = rewritten[index];
    event.links.event_refs = event.links.event_refs.map((ref) => ({
      event_hash: byId.get(ref.event_id).event_hash,
      event_id: ref.event_id,
    })).sort((left, right) => left.event_id.localeCompare(right.event_id));
    event.links.input_set_sha256 = domainSha256(
      'soulforge.se_core_eval.qa_continuation.input_set.v1',
      event.links.event_refs,
    );
    event.sequence = PRIOR.event_count + index + 1;
    event.prev_event_hash = previousHash;
    delete event.event_hash;
    event.event_hash = domainSha256(
      'soulforge.se_core_eval.qa_continuation.event_hash.v1',
      event,
    );
    byId.set(event.event_id, event);
    previousHash = event.event_hash;
  }
  return Buffer.concat(rewritten.map(canonicalBytes));
}

test('backfill continues the exact frozen v1 anchor with a 45-event closed cohort', () => {
  const built = build();
  assert.equal(built.report.prior_ledger_verification, 'exact_anchor_receipt');
  assert.equal(built.report.continuation_event_count, 45);
  assert.equal(built.report.total_anchored_event_count, 115);
  assert.equal(built.ledger_bytes.length, 178699);
  assert.equal(
    built.report.continuation_ledger_sha256,
    'c7704a89832d4906d1a1ea6f5703fdc42a5dec95516fcb55414cd8e2412836ad',
  );
  assert.equal(
    built.report.head_event_hash,
    'c3359c8c2439e785074dd69135e6f0a9fa69e0181c776b7dd67d0fe8a426b884',
  );
  assert.equal(built.report.final_comparison_allowed, false);
  assert.equal(built.report.engine_is_truth, false);
  assert.equal(built.report.notebook_is_truth, false);
  assert.equal(built.report.winner_declared, false);
  assert.deepEqual(built.report.counts, {
    engine_qa_answer: 21,
    engine_qa_review: 21,
    engine_qa_round_summary: 3,
    qa_comparison_candidate: 0,
  });
  const rows = events(built.ledger_bytes);
  assert.equal(rows[0].sequence, 71);
  assert.equal(rows[0].prev_event_hash, PRIOR.head_event_hash);
  assert.equal(rows.at(-1).sequence, 115);
  assert(rows.every((row) => JSON.stringify(row.prior_ledger_anchor) === JSON.stringify(PRIOR)));
  assert.equal(validateSeCoreEvalQaContinuation(built.ledger_bytes, PRIOR).result, 'PASS');
});

test('opaque answer, citation, account, project, and secret content never enters reports or ledger', () => {
  const built = build();
  const text = built.ledger_bytes.toString('utf8');
  for (const refused of [
    'opaque answer text', 'owner@example.invalid', 'do-not-echo-this-secret',
    'P00-000', 'answer_text', 'citations',
  ]) assert.equal(text.includes(refused), false);
  assert.equal(JSON.stringify(built.report).includes('owner@example.invalid'), false);
});

test('answers bind all five frozen input pins and reviews bind exact answer bytes and row payload', () => {
  const rows = events(build().ledger_bytes);
  const answers = rows.filter((row) => row.event_type === 'engine_qa_answer');
  const reviews = rows.filter((row) => row.event_type === 'engine_qa_review');
  assert.equal(answers.length, 21);
  assert(answers.every((row) => Object.entries(pins()).every(([key, value]) =>
    row.inputs[key] === value)));
  for (const review of reviews) {
    const answer = answers.find((row) => row.event_id === review.links.event_refs[0].event_id);
    assert(answer);
    assert.equal(review.inputs.answer_batch_raw_sha256, answer.artifact.raw_sha256);
    assert.equal(review.inputs.answer_row_payload_sha256, answer.artifact.payload_sha256);
    assert.equal(review.links.event_refs[0].event_hash, answer.event_hash);
  }
});

test('every summary binds exactly seven review event ids and hashes', () => {
  const rows = events(build().ledger_bytes);
  const summaries = rows.filter((row) => row.event_type === 'engine_qa_round_summary');
  assert.equal(summaries.length, 3);
  for (const summary of summaries) {
    assert.equal(summary.links.event_refs.length, 7);
    assert.equal(new Set(summary.links.event_refs.map((ref) => ref.event_id)).size, 7);
    for (const ref of summary.links.event_refs) {
      const linked = rows.find((row) => row.event_id === ref.event_id);
      assert.equal(linked.event_type, 'engine_qa_review');
      assert.equal(linked.event_hash, ref.event_hash);
    }
  }
});

test('summary verdict is derived at source build and after a fully recomputed ledger mutation', () => {
  const sourceRoot = buildFixture();
  rewriteJson(sourceRoot, 'reviews/engine_qa/attempt_01/summary.json', (summary) => {
    summary.overall_verdict = 'revise';
  });
  let result = backfillSeCoreEvalQaContinuation({
    root_path: sourceRoot,
    prior_ledger_anchor: PRIOR,
  });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('SOURCE_COMMITMENT_MISMATCH'));

  const original = events(build().ledger_bytes);
  const verdictOnly = structuredClone(original);
  verdictOnly.find((event) => event.event_type === 'engine_qa_round_summary'
    && event.identity.run_id === 'engine_qa_attempt_01').outcome.overall_verdict = 'revise';
  result = validateSeCoreEvalQaContinuation(recomputeContinuation(verdictOnly), PRIOR);
  assert.equal(result.result, 'HOLD');
  assert(result.issues.includes('LEDGER_LINK_REFUSED'));

  const countsAndVerdict = structuredClone(original);
  const summary = countsAndVerdict.find((event) => event.event_type === 'engine_qa_round_summary'
    && event.identity.run_id === 'engine_qa_attempt_01');
  summary.outcome.counts.pass = 6;
  summary.outcome.counts.revise = 1;
  summary.outcome.overall_verdict = 'revise';
  result = validateSeCoreEvalQaContinuation(recomputeContinuation(countsAndVerdict), PRIOR);
  assert.equal(result.result, 'HOLD');
  assert(result.issues.includes('LEDGER_LINK_REFUSED'));
});

test('retry is byte-identical and a changed payload under the same identity HOLDs', () => {
  const root = buildFixture();
  const first = build(root);
  const retry = build(root, first.ledger_bytes);
  assert.equal(retry.report.reused_events, 45);
  assert.equal(retry.report.appended_events, 0);
  assert.deepEqual(retry.ledger_bytes, first.ledger_bytes);

  const prefix = Buffer.from(`${first.ledger_bytes.toString('utf8').trimEnd().split('\n')
    .slice(0, 15).join('\n')}\n`, 'utf8');
  const resumed = build(root, prefix);
  assert.equal(resumed.report.reused_events, 15);
  assert.equal(resumed.report.appended_events, 30);
  assert.deepEqual(resumed.ledger_bytes, first.ledger_bytes);

  rewriteJson(root, 'reviews/engine_qa/attempt_01/summary.json', (summary) => {
    summary.claim_ceiling = 'observed_independent_round_review_v2';
  });
  const conflict = backfillSeCoreEvalQaContinuation({
    root_path: root,
    prior_ledger_anchor: PRIOR,
    existing_continuation_bytes: first.ledger_bytes,
  });
  assert.equal(conflict.result, 'HOLD');
  assert.deepEqual(conflict.report.issues, ['IDENTITY_CONFLICT']);
});

test('chain mutation, suffix, truncation, and incomplete line HOLD', () => {
  const ledger = build().ledger_bytes;
  const lines = ledger.toString('utf8').trimEnd().split('\n');
  const changed = JSON.parse(lines[0]);
  changed.outcome.classification = 'tampered';
  lines[0] = JSON.stringify(changed);
  assert.equal(validateSeCoreEvalQaContinuation(
    Buffer.from(`${lines.join('\n')}\n`, 'utf8'), PRIOR,
  ).result, 'HOLD');
  assert.equal(validateSeCoreEvalQaContinuation(
    Buffer.concat([ledger, ledger.subarray(0, ledger.indexOf(10) + 1)]), PRIOR,
  ).result, 'HOLD');
  assert.equal(validateSeCoreEvalQaContinuation(ledger.subarray(0, -1), PRIOR).result, 'HOLD');
  const last = ledger.lastIndexOf(10, ledger.length - 2);
  assert.equal(validateSeCoreEvalQaContinuation(ledger.subarray(0, last + 1), PRIOR).result, 'HOLD');
});

test('duplicate answer pointer in the run manifest HOLDs before ledger emission', () => {
  const root = buildFixture();
  rewriteJson(root, 'exports/engine_qa/attempt_01/run_manifest.json', (manifest) => {
    manifest.answer_rows[1].record_pointer = '/answers/0';
  });
  const result = backfillSeCoreEvalQaContinuation({ root_path: root, prior_ledger_anchor: PRIOR });
  assert.equal(result.result, 'HOLD');
  assert.equal(result.ledger_bytes.length, 0);
});

test('detached review sidecar and mismatched run ids HOLD', () => {
  const detachedRoot = buildFixture();
  rewriteJson(detachedRoot, 'reviews/engine_qa/attempt_02/se-q-04.review.json', (review) => {
    review.artifact_refs.answer_batch_raw_sha256 = 'f'.repeat(64);
  });
  let result = backfillSeCoreEvalQaContinuation({
    root_path: detachedRoot,
    prior_ledger_anchor: PRIOR,
  });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('SOURCE_LINK_MISMATCH'));

  const aliasRoot = buildFixture();
  rewriteJson(aliasRoot, 'exports/engine_qa/attempt_03/run_manifest.json', (manifest) => {
    manifest.run_id = 'engine_qa_attempt_02';
  });
  result = backfillSeCoreEvalQaContinuation({ root_path: aliasRoot, prior_ledger_anchor: PRIOR });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('SOURCE_COHORT_REFUSED'));
});

test('reviewer independence is mandatory and unsafe reviewer metadata is never echoed', () => {
  for (const mutate of [
    (reviewer) => { reviewer.author_is_reviewer = true; },
    (reviewer) => { reviewer.notebook_outputs_visible = true; },
    (reviewer) => { reviewer.other_engine_attempts_visible = true; },
    (reviewer) => { reviewer.prior_engine_reviews_visible = true; },
    (reviewer) => { reviewer.pseudonymous_ref = 'owner@example.invalid'; },
  ]) {
    const root = buildFixture();
    rewriteJson(root, 'reviews/engine_qa/attempt_01/se-q-01.review.json', (review) => {
      mutate(review.reviewer);
    });
    const result = backfillSeCoreEvalQaContinuation({ root_path: root, prior_ledger_anchor: PRIOR });
    assert.equal(result.result, 'HOLD');
    assert(result.report.issues.includes('SOURCE_BOUNDARY_REFUSED'));
    assert.equal(JSON.stringify(result.report).includes('owner@example.invalid'), false);
  }
});

test('derived non-pass review aggregates and round summaries remain fully auditable', () => {
  const root = buildFixture();

  rewriteJson(root, 'reviews/engine_qa/attempt_01/se-q-01.review.json', (review) => {
    review.mandatory_propositions.items[0].status = 'missing';
    review.mandatory_propositions.status = 'revise';
    review.review_issue_codes = ['mandatory_proposition_missing'];
    review.overall_verdict = 'revise';
  });
  rebindSummaryReview(root, 1, 'se-q-01', (summary) => {
    Object.assign(summary.counts, {
      pass: 6,
      revise: 1,
      mandatory_propositions_satisfied: 26,
      mandatory_propositions_missing: 1,
    });
    summary.overall_verdict = 'revise';
  });

  rewriteJson(root, 'reviews/engine_qa/attempt_02/se-q-02.review.json', (review) => {
    review.mandatory_propositions.items[0].status = 'contradicted';
    review.mandatory_propositions.status = 'hold';
    review.review_issue_codes = ['mandatory_proposition_contradicted'];
    review.overall_verdict = 'hold';
  });
  rebindSummaryReview(root, 2, 'se-q-02', (summary) => {
    Object.assign(summary.counts, {
      pass: 6,
      hold: 1,
      mandatory_propositions_satisfied: 26,
      mandatory_propositions_contradicted: 1,
    });
    summary.overall_verdict = 'hold';
  });

  rewriteJson(root, 'reviews/engine_qa/attempt_03/se-q-03.review.json', (review) => {
    review.forbidden_claims.items[0].status = 'present';
    review.forbidden_claims.status = 'hold';
    review.review_issue_codes = ['forbidden_claim_present'];
    review.overall_verdict = 'hold';
  });
  rebindSummaryReview(root, 3, 'se-q-03', (summary) => {
    Object.assign(summary.counts, {
      pass: 6,
      hold: 1,
      forbidden_claims_absent: 34,
      forbidden_claims_present: 1,
    });
    summary.overall_verdict = 'hold';
  });

  const built = build(root);
  const rows = events(built.ledger_bytes);
  assert.equal(rows.find((event) => event.event_type === 'engine_qa_round_summary'
    && event.identity.run_id === 'engine_qa_attempt_01').outcome.overall_verdict, 'revise');
  assert.equal(rows.find((event) => event.event_type === 'engine_qa_round_summary'
    && event.identity.run_id === 'engine_qa_attempt_02').outcome.overall_verdict, 'hold');
  assert.equal(rows.find((event) => event.event_type === 'engine_qa_round_summary'
    && event.identity.run_id === 'engine_qa_attempt_03').outcome.counts.forbidden_claims_present, 1);
});

test('review proposition, forbidden-claim, and summary denominator contradictions HOLD', () => {
  for (const status of ['missing', 'contradicted']) {
    const root = buildFixture();
    rewriteJson(root, 'reviews/engine_qa/attempt_01/se-q-01.review.json', (review) => {
      review.mandatory_propositions.items[0].status = status;
    });
    const result = backfillSeCoreEvalQaContinuation({ root_path: root, prior_ledger_anchor: PRIOR });
    assert.equal(result.result, 'HOLD');
    assert(result.report.issues.includes('SOURCE_COMMITMENT_MISMATCH'));
  }

  const forbiddenRoot = buildFixture();
  rewriteJson(forbiddenRoot, 'reviews/engine_qa/attempt_01/se-q-01.review.json', (review) => {
    review.forbidden_claims.items[0].status = 'present';
  });
  let result = backfillSeCoreEvalQaContinuation({
    root_path: forbiddenRoot,
    prior_ledger_anchor: PRIOR,
  });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('SOURCE_COMMITMENT_MISMATCH'));

  const denominatorRoot = buildFixture();
  rewriteJson(denominatorRoot, 'reviews/engine_qa/attempt_01/summary.json', (summary) => {
    summary.counts.citation_fidelity_denominator = 4;
    summary.counts.engine_boundary_fidelity_denominator = 3;
  });
  result = backfillSeCoreEvalQaContinuation({
    root_path: denominatorRoot,
    prior_ledger_anchor: PRIOR,
  });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('SOURCE_COMMITMENT_MISMATCH'));

  const sourceEvents = events(build().ledger_bytes);
  const summary = sourceEvents.find((event) => event.event_type === 'engine_qa_round_summary'
    && event.identity.run_id === 'engine_qa_attempt_01');
  summary.outcome.counts.citation_fidelity_denominator = 4;
  summary.outcome.counts.engine_boundary_fidelity_denominator = 3;
  result = validateSeCoreEvalQaContinuation(recomputeContinuation(sourceEvents), PRIOR);
  assert.equal(result.result, 'HOLD');
  assert(result.issues.includes('LEDGER_LINK_REFUSED'));
});

test('q6 and q7 use the engine-boundary denominator and reject citation applicability', () => {
  for (const questionId of ['se-q-06', 'se-q-07']) {
    const root = buildFixture();
    rewriteJson(root, `reviews/engine_qa/attempt_01/${questionId}.review.json`, (review) => {
      review.citation_fidelity = { applicable: true, status: 'pass' };
      review.engine_boundary_fidelity = { applicable: false, status: 'not_applicable' };
    });
    const result = backfillSeCoreEvalQaContinuation({ root_path: root, prior_ledger_anchor: PRIOR });
    assert.equal(result.result, 'HOLD');
    assert(result.report.issues.includes('SOURCE_SHAPE_REFUSED'));
  }
});

test('review prose and raw answer fields are rejected without echo', () => {
  const root = buildFixture();
  rewriteJson(root, 'reviews/engine_qa/attempt_01/se-q-01.review.json', (review) => {
    review.raw_answer = 'do-not-echo-review-answer';
    review.reviewer_notes = 'ENGINE_WINS_DO_NOT_ECHO';
  });
  const result = backfillSeCoreEvalQaContinuation({ root_path: root, prior_ledger_anchor: PRIOR });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('SOURCE_SHAPE_REFUSED'));
  assert.equal(JSON.stringify(result.report).includes('do-not-echo-review-answer'), false);
  assert.equal(JSON.stringify(result.report).includes('ENGINE_WINS_DO_NOT_ECHO'), false);
});

test('a consistently summarized authority-action payload is still refused without echo', () => {
  const root = buildFixture();
  rewriteJson(root, 'reviews/engine_qa/attempt_01/se-q-01.review.json', (review) => {
    review.normalized_sidecar_candidate.authority_actions = [
      'api_key=do-not-echo-authority-action',
    ];
    review.review_issue_codes = ['safety_or_authority_violation'];
    review.overall_verdict = 'hold';
  });
  rebindSummaryReview(root, 1, 'se-q-01', (summary) => {
    Object.assign(summary.counts, {
      pass: 6,
      hold: 1,
      authority_actions: 1,
    });
    summary.overall_verdict = 'hold';
  });
  const result = backfillSeCoreEvalQaContinuation({ root_path: root, prior_ledger_anchor: PRIOR });
  assert.equal(result.result, 'HOLD');
  assert.equal(JSON.stringify(result.report).includes('do-not-echo-authority-action'), false);
});

test('standalone validation binds every review input pin to its linked answer', () => {
  const sourceEvents = events(build().ledger_bytes);
  const runId = 'engine_qa_attempt_01';
  const replacements = {
    question_set_sha256: '8'.repeat(64),
    corpus_sha256: '9'.repeat(64),
    crosswalk_sha256: 'a'.repeat(64),
    projection_sha256: 'b'.repeat(64),
    answer_policy_sha256: 'c'.repeat(64),
    answer_manifest_sha256: 'd'.repeat(64),
    verification_receipt_sha256: 'e'.repeat(64),
  };
  for (const review of sourceEvents.filter((event) => event.event_type === 'engine_qa_review'
    && event.identity.run_id === runId)) {
    Object.assign(review.inputs, replacements);
    for (const key of Object.keys(pins())) {
      review.outcome.oracle_basis[key] = replacements[key];
    }
    review.outcome.artifact_refs.answer_manifest_raw_sha256 =
      replacements.answer_manifest_sha256;
    review.outcome.artifact_refs.verification_receipt_raw_sha256 =
      replacements.verification_receipt_sha256;
  }
  const summary = sourceEvents.find((event) => event.event_type === 'engine_qa_round_summary'
    && event.identity.run_id === runId);
  Object.assign(summary.inputs, replacements);
  for (const key of Object.keys(pins())) {
    summary.outcome.oracle_basis[key] = replacements[key];
  }
  summary.outcome.artifact_refs.answer_manifest_raw_sha256 =
    replacements.answer_manifest_sha256;
  summary.outcome.artifact_refs.verification_receipt_raw_sha256 =
    replacements.verification_receipt_sha256;

  const result = validateSeCoreEvalQaContinuation(recomputeContinuation(sourceEvents), PRIOR);
  assert.equal(result.result, 'HOLD');
  assert(result.issues.includes('LEDGER_LINK_REFUSED'));
});

test('standalone validation requires one oracle basis across all three attempts', () => {
  const sourceEvents = events(build().ledger_bytes);
  const runId = 'engine_qa_attempt_01';
  const evaluatorGold = '8'.repeat(64);
  const crosswalkReceipt = '9'.repeat(64);
  for (const review of sourceEvents.filter((event) => event.event_type === 'engine_qa_review'
    && event.identity.run_id === runId)) {
    review.inputs.evaluator_gold_raw_sha256 = evaluatorGold;
    review.inputs.crosswalk_review_receipt_raw_sha256 = crosswalkReceipt;
    review.outcome.oracle_basis.evaluator_gold_raw_sha256 = evaluatorGold;
    review.outcome.oracle_basis.crosswalk_review_receipt.raw_sha256 = crosswalkReceipt;
  }
  const summary = sourceEvents.find((event) => event.event_type === 'engine_qa_round_summary'
    && event.identity.run_id === runId);
  summary.inputs.evaluator_gold_raw_sha256 = evaluatorGold;
  summary.inputs.crosswalk_review_receipt_raw_sha256 = crosswalkReceipt;
  summary.outcome.oracle_basis.evaluator_gold_raw_sha256 = evaluatorGold;
  summary.outcome.oracle_basis.crosswalk_review_receipt.raw_sha256 = crosswalkReceipt;

  const result = validateSeCoreEvalQaContinuation(recomputeContinuation(sourceEvents), PRIOR);
  assert.equal(result.result, 'HOLD');
  assert(result.issues.includes('LEDGER_COHORT_REFUSED'));
});

test('closed ledger shape refuses raw answer insertion without echoing it', () => {
  const ledger = build().ledger_bytes;
  const lines = ledger.toString('utf8').trimEnd().split('\n');
  const first = JSON.parse(lines[0]);
  first.raw_answer = 'do-not-echo-injected-answer';
  lines[0] = JSON.stringify(first);
  const report = validateSeCoreEvalQaContinuation(
    Buffer.from(`${lines.join('\n')}\n`, 'utf8'),
    PRIOR,
  );
  assert.equal(report.result, 'HOLD');
  assert(report.issues.includes('LEDGER_EVENT_SHAPE_REFUSED'));
  assert.equal(JSON.stringify(report).includes('do-not-echo-injected-answer'), false);
});

test('unsafe path and secret-bearing metadata HOLD without echo', () => {
  const pathRoot = buildFixture();
  rewriteJson(pathRoot, 'exports/engine_qa/attempt_01/run_manifest.json', (manifest) => {
    manifest.outputs.answers.file = '../escape.json';
  });
  let result = backfillSeCoreEvalQaContinuation({ root_path: pathRoot, prior_ledger_anchor: PRIOR });
  assert.equal(result.result, 'HOLD');
  assert.equal(JSON.stringify(result.report).includes('../escape.json'), false);

  const secretRoot = buildFixture();
  rewriteJson(secretRoot, 'exports/engine_qa/attempt_01/verification_receipt.json', (receipt) => {
    receipt.claim_ceiling = 'api_key=do-not-echo-source-secret';
  });
  result = backfillSeCoreEvalQaContinuation({ root_path: secretRoot, prior_ledger_anchor: PRIOR });
  assert.equal(result.result, 'HOLD');
  assert.equal(JSON.stringify(result.report).includes('do-not-echo-source-secret'), false);
});

test('wrong prior anchors and non-plain, accessor, or sparse public inputs fail closed', () => {
  const root = buildFixture();
  const wrong = { ...PRIOR, ledger_sha256: 'f'.repeat(64) };
  let result = backfillSeCoreEvalQaContinuation({ root_path: root, prior_ledger_anchor: wrong });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('PRIOR_LEDGER_ANCHOR_REFUSED'));

  const inherited = Object.assign(Object.create({ secret: 'do-not-echo-inherited' }), {
    root_path: root,
    prior_ledger_anchor: PRIOR,
  });
  result = backfillSeCoreEvalQaContinuation(inherited);
  assert.equal(result.result, 'HOLD');
  assert.equal(JSON.stringify(result.report).includes('do-not-echo-inherited'), false);

  const accessor = {};
  Object.defineProperty(accessor, 'root_path', { enumerable: true, get() { return root; } });
  Object.defineProperty(accessor, 'prior_ledger_anchor', { enumerable: true, value: PRIOR });
  result = backfillSeCoreEvalQaContinuation(accessor);
  assert.equal(result.result, 'HOLD');

  const ledger = build(root).ledger_bytes;
  const sparse = [];
  sparse.length = 2;
  assert.equal(querySeCoreEvalQaContinuation(ledger, PRIOR, { run_id: sparse }).result, 'HOLD');
});

test('an explicitly supplied frozen v1 ledger is verified byte-for-byte and remains unchanged', (context) => {
  const priorPath = process.env.SOULFORGE_SE_CORE_EVAL_PRIOR_LEDGER;
  if (!priorPath) {
    context.skip('SOULFORGE_SE_CORE_EVAL_PRIOR_LEDGER is required for the exact-byte anchor check');
    return;
  }
  const before = readFileSync(priorPath);
  assert.equal(before.length, PRIOR.byte_length);
  assert.equal(sha256(before), PRIOR.ledger_sha256);
  const report = validateSeCoreEvalQaContinuation(build().ledger_bytes, before);
  assert.equal(report.result, 'PASS');
  assert.equal(report.prior_ledger_verification, 'exact_bytes');
  assert.deepEqual(readFileSync(priorPath), before);
});

test('query accepts only canonical run ids and never echoes rejected identifiers', () => {
  const ledger = build().ledger_bytes;
  const result = querySeCoreEvalQaContinuation(ledger, PRIOR, {
    event_type: 'engine_qa_answer',
    run_id: 'engine_qa_attempt_02',
  });
  assert.equal(result.result, 'PASS');
  assert.equal(result.count, 7);
  assert.equal(result.engine_is_truth, false);
  assert.equal(result.notebook_is_truth, false);
  assert.equal(result.winner_declared, false);
  assert(result.events.every((row) => row.identity.run_id === 'engine_qa_attempt_02'));
  for (const value of [
    'engine_qa_attempt_04',
    'project_id_probe',
    'notebook_id_probe',
    'api_key=do-not-echo-query-secret',
  ]) {
    const refused = querySeCoreEvalQaContinuation(ledger, PRIOR, { run_id: value });
    assert.equal(refused.result, 'HOLD');
    assert.equal(JSON.stringify(refused).includes(value), false);
    assert.deepEqual(refused.query, {});
  }
});

test('comparison candidate is optional, hash-only, and never declares a winner or truth', () => {
  const root = buildFixture();
  const base = build(root);
  const summaryRefs = events(base.ledger_bytes)
    .filter((row) => row.event_type === 'engine_qa_round_summary')
    .map((row) => ({ event_id: row.event_id, run_id: row.identity.run_id }));
  writeJson(root, 'qa_comparison_candidate.json', {
    schema_version: 'soulforge.engineering_engine.se_core_natural_qa_comparison_candidate.v1',
    comparison_limits: {
      provider_byte_parity: 'not_verified',
      notebook_output_is_gold: false,
      engine_output_is_gold: false,
      final_comparison_allowed: false,
      notebook_is_truth: false,
      engine_is_truth: false,
      winner_declared: false,
    },
    summary_refs: summaryRefs,
    notes: `${RAW_ANSWER}\nENGINE_WINS_DO_NOT_ECHO`,
  });
  const appended = build(root, base.ledger_bytes);
  assert.equal(appended.report.continuation_event_count, 46);
  assert.equal(appended.report.counts.qa_comparison_candidate, 1);
  assert.equal(appended.report.final_comparison_allowed, false);
  assert.equal(appended.report.engine_is_truth, false);
  assert.equal(appended.report.notebook_is_truth, false);
  assert.equal(appended.report.winner_declared, false);
  assert.equal(appended.ledger_bytes.toString('utf8').includes(RAW_ANSWER), false);
  assert.equal(appended.ledger_bytes.toString('utf8').includes('ENGINE_WINS_DO_NOT_ECHO'), false);
  const candidate = events(appended.ledger_bytes).at(-1);
  assert.deepEqual(candidate.outcome, {
    comparison_limits: {
      provider_byte_parity: 'not_verified',
      notebook_output_is_gold: false,
      engine_output_is_gold: false,
      final_comparison_allowed: false,
      notebook_is_truth: false,
      engine_is_truth: false,
      winner_declared: false,
    },
    evidence_claim_ceiling: 'observed',
  });

  for (const mutate of [
    (limits) => { limits.final_comparison_allowed = true; },
    (limits) => { limits.notebook_is_truth = true; },
    (limits) => { limits.engine_is_truth = true; },
    (limits) => { limits.winner_declared = true; },
    (limits) => { limits.notebook_output_is_gold = true; },
    (limits) => { limits.engine_output_is_gold = true; },
    (limits) => { limits.provider_byte_parity = 'verified'; },
    (limits) => { delete limits.engine_is_truth; },
    (limits) => { delete limits.winner_declared; },
  ]) {
    const refusedRoot = buildFixture();
    const limits = {
      provider_byte_parity: 'not_verified',
      notebook_output_is_gold: false,
      engine_output_is_gold: false,
      final_comparison_allowed: false,
      notebook_is_truth: false,
      engine_is_truth: false,
      winner_declared: false,
    };
    mutate(limits);
    writeJson(refusedRoot, 'qa_comparison_candidate.json', {
      schema_version: 'soulforge.engineering_engine.se_core_natural_qa_comparison_candidate.v1',
      comparison_limits: limits,
      summary_refs: summaryRefs,
      notes: 'ENGINE_WINS_DO_NOT_ECHO',
    });
    const refused = backfillSeCoreEvalQaContinuation({
      root_path: refusedRoot,
      prior_ledger_anchor: PRIOR,
    });
    assert.equal(refused.result, 'HOLD');
    assert(['SOURCE_BOUNDARY_REFUSED', 'SOURCE_SHAPE_REFUSED']
      .some((issue) => refused.report.issues.includes(issue)));
    assert.equal(JSON.stringify(refused.report).includes('ENGINE_WINS_DO_NOT_ECHO'), false);
  }
});

test('CLI backfill defaults to stdout, --out is create-only, and validate/query are read-only', () => {
  const root = buildFixture();
  const anchorPath = join(root, 'prior_anchor.json');
  writeFileSync(anchorPath, `${JSON.stringify(PRIOR)}\n`, 'utf8');
  const direct = build(root);
  const dry = runCli([
    'node', 'continuation', 'backfill', '--root', root, '--prior-anchor', anchorPath,
  ]);
  assert.equal(dry.exit_code, 0);
  assert.deepEqual(dry.stdout, direct.ledger_bytes);

  const out = join(root, 'continuation.jsonl');
  const created = runCli([
    'node', 'continuation', 'backfill', '--root', root, '--prior-anchor', anchorPath,
    '--out', out,
  ]);
  assert.equal(created.exit_code, 0);
  const before = readFileSync(out);
  const refused = runCli([
    'node', 'continuation', 'backfill', '--root', root, '--prior-anchor', anchorPath,
    '--out', out,
  ]);
  assert.equal(refused.exit_code, 2);
  assert.deepEqual(readFileSync(out), before);
  assert.deepEqual({
    engine_is_truth: JSON.parse(refused.stdout).engine_is_truth,
    notebook_is_truth: JSON.parse(refused.stdout).notebook_is_truth,
    winner_declared: JSON.parse(refused.stdout).winner_declared,
  }, {
    engine_is_truth: false,
    notebook_is_truth: false,
    winner_declared: false,
  });

  const validated = runCli([
    'node', 'continuation', 'validate', '--ledger', out, '--prior-anchor', anchorPath,
  ]);
  assert.equal(validated.exit_code, 0);
  assert.deepEqual(readFileSync(out), before);
  const queried = runCli([
    'node', 'continuation', 'query', '--ledger', out, '--prior-anchor', anchorPath,
    '--event-type', 'engine_qa_review', '--attempt-index', '3',
  ]);
  assert.equal(queried.exit_code, 0);
  assert.equal(JSON.parse(queried.stdout).count, 7);
  assert.deepEqual(readFileSync(out), before);
});

test('module is writer/network/model free and the thin CLI has one explicit wx writer', () => {
  const moduleSource = readFileSync(
    join(HERE, '..', 'evaluation', 'se_core_eval_qa_continuation.mjs'),
    'utf8',
  );
  const cliSource = readFileSync(
    join(HERE, '..', 'tools', 'se_core_eval_qa_continuation.mjs'),
    'utf8',
  );
  assert.doesNotMatch(moduleSource, /node:(?:net|http|https|tls|child_process)/);
  assert.doesNotMatch(moduleSource, /(?:writeFile|appendFile|mkdir|rmSync|unlink|fetch\s*\()/);
  assert.doesNotMatch(cliSource, /node:(?:net|http|https|tls|child_process)/);
  assert.doesNotMatch(cliSource, /(?:appendFile|mkdir|rmSync|unlink|fetch\s*\()/);
  assert.match(cliSource, /writeFileSync\(options\['--out'\], result\.ledger_bytes, \{ flag: 'wx' \}\)/);
  assert.doesNotMatch(`${moduleSource}\n${cliSource}`, /(?:openai|anthropic|gemini|erp[_-]?write|create[_-]?task)\s*\(/i);
});
