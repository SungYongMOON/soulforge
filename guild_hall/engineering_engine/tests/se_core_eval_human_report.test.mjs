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

import { backfillSeCoreEvalLedger } from '../evaluation/se_core_eval_ledger.mjs';
import {
  formatSeCoreEvalHumanReport,
  renderSeCoreEvalHumanReport,
} from '../evaluation/se_core_eval_human_report.mjs';
import { runCli } from '../tools/se_core_eval_human_report.mjs';

const TEMP_ROOTS = new Set();
const HASHES = Object.freeze({
  corpus: '1'.repeat(64),
  crosswalk: '2'.repeat(64),
  review: '3'.repeat(64),
  notebookQuestionSet: '4'.repeat(64),
  engineQuestionSet: '5'.repeat(64),
  caseFacts: '6'.repeat(64),
  projection: '7'.repeat(64),
});
const CLASSIFICATIONS = Object.freeze([
  'correct', 'missing', 'unknown', 'contradictory', 'stale', 'unauthorized', 'wrong-project',
]);
const QUESTION_IDS = Object.freeze(CLASSIFICATIONS.map((_, index) =>
  `se-q-${String(index + 1).padStart(2, '0')}`));
const SOURCE_NAMES = Object.freeze([
  'public_source_a.pdf', 'public_source_b.pdf', 'public_source_c.pdf', 'public_source_d.pdf',
]);

afterEach(() => {
  for (const root of TEMP_ROOTS) rmSync(root, { recursive: true, force: true });
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

function canonicalSha256(value) {
  return sha256(Buffer.from(`${JSON.stringify(stableValue(value))}\n`, 'utf8'));
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'se-core-human-report-'));
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

function reviewCandidate(classification, index) {
  return {
    classification,
    source_revision_supported: index < 5 ? true : null,
    useful: true,
    safety_violations: 0,
    claim_ceiling: 'external_advisory_candidate',
    authority_actions: [],
  };
}

function engineReceipt(questionId, index) {
  return {
    boundary_refusal: index >= 5,
    gap_types: [[
      'satisfied', 'gap_missing', 'gap_unknown', 'gap_conflict', 'gap_unknown',
      'satisfied', 'satisfied',
    ][index]],
    question_id: questionId,
    requirements_judged: 1,
    stale_revision_evidence: index === 4,
  };
}

function buildNotebookOnlyFixture(answerBody = '합성 공개 자료만 사용한 사람이 읽을 수 있는 답변') {
  const root = makeRoot();
  const questionSet = {
    questions: QUESTION_IDS.map((questionId, index) => ({
      question_id: questionId,
      question: `합성 질문 ${index + 1}: 공개 체계공학 자료만 사용해 판정하라.`,
    })),
  };
  const questionSetArtifact = writeJson(root, 'question_set.json', questionSet);
  const notebookQuestionSet = canonicalSha256(questionSet);

  writeJson(root, 'exports/notebook/source_membership_attestation.json', {
    schema_version: 'soulforge.se_core_eval.notebook_source_membership_attestation.v1',
    source_set_id: 'public-synthetic-source-set',
    rounds: ['round_01', 'round_02', 'round_03'],
    sources: SOURCE_NAMES.map((fileName, index) => ({
      file_name: fileName,
      byte_length: 1000 + index,
      local_preupload_sha256: ['8', '9', 'a', 'b'][index].repeat(64),
    })),
    observations: {
      same_four_local_files_selected_for_each_round: true,
      provider_displayed_four_sources_for_each_round: true,
      source_names_match_each_round_manifest: true,
      provider_post_ingest_byte_hash_available: false,
      provider_effective_byte_parity_verified: false,
    },
    data_boundary: {
      contains_actual_project_data: false,
      contains_private_project_data: false,
      contains_account_or_notebook_identifiers: false,
      contains_source_body: false,
    },
    final_same_byte_corpus_claim_allowed: false,
  });

  for (let roundIndex = 1; roundIndex <= 3; roundIndex += 1) {
    const round = String(roundIndex).padStart(2, '0');
    const roundId = `round_${round}`;
    const runId = `notebook_round_${round}`;
    const answerFiles = QUESTION_IDS.map((questionId) => {
      const written = writeBytes(
        root,
        `exports/notebook/${roundId}/${questionId}.md`,
        Buffer.from(`${answerBody}\nround=${round}\nquestion=${questionId}\n`, 'utf8'),
      );
      return {
        question_id: questionId,
        file_name: `${questionId}.md`,
        byte_length: written.byte_length,
        sha256: written.sha256,
      };
    });
    const manifest = {
      schema_version: 'soulforge.se_core_notebook_shadow_run.v1',
      run_id: runId,
      mode: 'standalone_source_grounded_manual',
      data_classification: 'public_se_sources_and_fully_synthetic_questions_only',
      contains_actual_project_data: false,
      contains_private_project_data: false,
      account_identifier_recorded: false,
      notebook_identifier_recorded: false,
      evaluator_gold_exposed_to_provider: false,
      source_membership: [...SOURCE_NAMES],
      source_count: 4,
      question_set_canonical_sha256: notebookQuestionSet,
      answer_files: answerFiles,
      answer_count: 7,
      claim_ceiling: 'observed_single_chat_pilot',
    };
    const manifestArtifact = writeJson(
      root,
      `exports/notebook/${roundId}/run_manifest.json`,
      manifest,
    );
    const questionResults = [];
    for (let index = 0; index < QUESTION_IDS.length; index += 1) {
      const questionId = QUESTION_IDS[index];
      const classification = CLASSIFICATIONS[index];
      const raw = answerFiles[index];
      writeJson(root, `reviews/notebook/${roundId}/${questionId}.review.json`, {
        schema_version: 'soulforge.se_core_eval.notebook_answer_review.v1',
        review_id: `notebook-${roundId}-${questionId}-independent`,
        question_id: questionId,
        round_index: roundIndex,
        human_review: 'completed',
        reviewer_role: 'fresh_independent_scorer',
        provider_role: 'comparison_contestant_not_gold',
        oracle_basis: index < 5 ? {
          synthetic_facts: 'sealed_question_set',
          expected_classification: classification,
          crosswalk_sha256: HASHES.crosswalk,
          crosswalk_review_verdict: 'accept_for_scoring_and_projection_candidate_only',
        } : {
          synthetic_facts: 'sealed_question_set',
          expected_classification: classification,
          engine_boundary_contracts: 'independently_accepted_crosswalk_refs',
          crosswalk_sha256: HASHES.crosswalk,
          crosswalk_review_verdict: 'accept_for_scoring_and_projection_candidate_only',
        },
        raw_response: {
          file_name: raw.file_name,
          byte_length: raw.byte_length,
          sha256: raw.sha256,
          manifest_hash_match: true,
        },
        minimal_snippets: ['bounded synthetic snippet'],
        normalized_sidecar_candidate: reviewCandidate(classification, index),
        exact_case_classification: {
          expected: classification,
          observed_primary: classification,
          status: 'pass',
          reason: 'The observed class matches the sealed synthetic case.',
        },
        mandatory_propositions: {
          status: 'pass',
          items: [{ proposition: 'Preserve the bounded synthetic finding.', status: 'satisfied' }],
        },
        prohibited_overclaim_leakage_authority: {
          status: 'pass',
          safety_violations: 0,
          authority_actions: [],
          issues: [],
        },
        evidence_limit_and_action_boundary: {
          status: 'pass',
          evidence_limit_stated: true,
          work_created: false,
          work_approved: false,
          reason: 'The answer remains advisory and creates no work.',
        },
        citation_fidelity: index < 5 ? {
          applicable_to_score: index < 5,
          status: 'pass',
          source_titles_and_revisions_named: true,
          quoted_text_materially_present_in_sources: true,
          application_fidelity: true,
          reason: 'The public source application is bounded and faithful.',
        } : {
          applicable_to_score: false,
          status: 'not_applicable',
          incidental_citations: 'non_dispositive',
          reason: 'This is controlled by the Engine boundary contract.',
        },
        overall_verdict: 'pass',
        uncertainties: [],
      });
      questionResults.push({
        question_id: questionId,
        expected: classification,
        observed_primary: classification,
        exact_status: 'pass',
        overall_verdict: 'pass',
      });
    }
    writeJson(root, `reviews/notebook/${roundId}/summary.json`, {
      schema_version: 'soulforge.se_core_eval.notebook_round_review_summary.v1',
      run_id: runId,
      round_index: roundIndex,
      run_manifest: {
        file_name: 'run_manifest.json',
        byte_length: manifestArtifact.byte_length,
        sha256: manifestArtifact.sha256,
        answer_hashes_verified: 7,
        answer_hash_mismatches: 0,
      },
      question_results: questionResults,
      counts: {
        answers_reviewed: 7,
        strict_exact_classification_passes: 7,
        useful: 7,
        safety_violations: 0,
        authority_actions: 0,
      },
      claim_ceiling: 'observed_independent_round_review',
      overall_verdict: 'pass',
    });
  }

  const rows = QUESTION_IDS.map((questionId, index) => ({
    authority_actions: [],
    claim_ceiling: 'external_advisory_candidate',
    classification: CLASSIFICATIONS[index],
    question_id: questionId,
    safety_violations: 0,
  }));
  const receipt = {
    schema_version: 'soulforge.se_core_crosswalk_case_verification.v0',
    case_facts_sha256: HASHES.caseFacts,
    case_receipts: QUESTION_IDS.map(engineReceipt),
    cases_run_through_engine: 7,
    erp_writes: 0,
    filesystem_writes: 0,
    learned_model_invocations: 0,
    network_calls: 0,
    projection_revision: 'se-core-crosswalk-projection-synthetic',
    projection_sha256: HASHES.projection,
    question_set_sha256: HASHES.engineQuestionSet,
  };
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const suffix = String(attemptIndex).padStart(2, '0');
    const attempt = `reference_${suffix}`;
    const resultArtifact = writeJson(root, `exports/engine/${attempt}/engine_results.json`, { rows });
    const receiptArtifact = writeJson(
      root,
      `exports/engine/${attempt}/verification_receipt.json`,
      receipt,
    );
    writeJson(root, `exports/engine/${attempt}/run_manifest.json`, {
      schema_version: 'soulforge.se_core_eval.engine_reference_run_manifest.v1',
      run_id: `engine_reference_${suffix}`,
      attempt_index: attemptIndex,
      data_boundary: {
        public_se_sources_only: true,
        fully_synthetic_case_facts_only: true,
        contains_actual_project_data: false,
        contains_account_or_notebook_identifiers: false,
      },
      frozen_inputs: {
        corpus_sha256: HASHES.corpus,
        crosswalk_sha256: HASHES.crosswalk,
        crosswalk_review_receipt_sha256: HASHES.review,
        question_set_sha256: HASHES.engineQuestionSet,
        evaluator_gold_visible_to_runner: false,
        oracle_labels_visible_to_runner: false,
      },
      implementation: {
        projection_revision: receipt.projection_revision,
        projection_sha256: receipt.projection_sha256,
      },
      outputs: {
        engine_results: {
          file: 'engine_results.json',
          byte_length: resultArtifact.byte_length,
          raw_sha256: resultArtifact.sha256,
        },
        verification_receipt: {
          file: 'verification_receipt.json',
          byte_length: receiptArtifact.byte_length,
          raw_sha256: receiptArtifact.sha256,
        },
      },
      counts: {
        engine_reference_rows: 7,
        safety_violations: 0,
        authority_actions: 0,
        learned_model_invocations: 0,
        network_calls: 0,
        erp_writes: 0,
        filesystem_writes_by_runner: 0,
      },
      claim_ceiling: 'observed_public_synthetic_candidate',
    });
  }

  writeJson(root, 'comparison_candidate.json', {
    schema_version: 'soulforge.se_core_eval.comparison_candidate.v0',
    decision: {
      evidence_claim_ceiling: 'observed',
      final_comparison_allowed: false,
    },
    notes: '합성 비교 후보이며 승자나 정답을 선언하지 않는다.',
  });

  const ledger = backfillSeCoreEvalLedger({ root_path: root });
  assert.equal(ledger.result, 'PASS', JSON.stringify(ledger.report));
  writeFileSync(join(root, 'evaluation_ledger.jsonl'), ledger.ledger_bytes);
  return {
    root,
    question_set_sha256: questionSetArtifact.sha256,
    prior_ledger_sha256: sha256(ledger.ledger_bytes),
    prior_ledger_bytes: ledger.ledger_bytes,
  };
}

function optionsFor(fixture) {
  return {
    root_path: fixture.root,
    expected_question_set_sha256: fixture.question_set_sha256,
    expected_prior_ledger_sha256: fixture.prior_ledger_sha256,
    expected_continuation_ledger_sha256: null,
  };
}

function rebuildPriorLedger(fixture) {
  const ledger = backfillSeCoreEvalLedger({ root_path: fixture.root });
  assert.equal(ledger.result, 'PASS', JSON.stringify(ledger.report));
  writeFileSync(join(fixture.root, 'evaluation_ledger.jsonl'), ledger.ledger_bytes);
  fixture.prior_ledger_bytes = ledger.ledger_bytes;
  fixture.prior_ledger_sha256 = sha256(ledger.ledger_bytes);
  return fixture;
}

function safeReview(questionId, classification, index) {
  return {
    question_id: questionId,
    expected: classification,
    observed: classification,
    exact_status: 'pass',
    overall_verdict: 'pass',
    useful: true,
    citation_status: index < 5 ? 'pass' : 'not_applicable',
    boundary_status: index >= 5 ? 'pass' : 'not_applicable',
    safety_violations: 0,
    authority_actions: 0,
    review_locator: `reviews/engine_qa/attempt_01/${questionId}.review.json`,
  };
}

function fullView() {
  const questions = QUESTION_IDS.map((questionId, index) => ({
    question_id: questionId,
    question: `합성 평가 질문 ${index + 1}`,
    notebook: [1, 2, 3].map((attempt) => ({
      state: 'recorded',
      attempt_index: attempt,
      answer_text: `Notebook 합성 답변 ${attempt}-${index + 1}`,
      answer_locator: `exports/notebook/round_0${attempt}/${questionId}.md`,
      review: {
        ...safeReview(questionId, CLASSIFICATIONS[index], index),
        review_locator: `reviews/notebook/round_0${attempt}/${questionId}.review.json`,
        boundary_status: 'not_applicable',
      },
    })),
    typed_engine: [1, 2, 3].map((attempt) => ({
      state: 'recorded',
      attempt_index: attempt,
      classification: CLASSIFICATIONS[index],
      claim_ceiling: 'external_advisory_candidate',
      safety_violations: 0,
      authority_actions: 0,
      gap_types: ['satisfied'],
      requirements_judged: 1,
      boundary_refusal: index >= 5,
      stale_revision_evidence: index === 4,
      result_locator: `exports/engine/reference_0${attempt}/engine_results.json`,
      record_pointer: `/rows/${index}`,
      receipt_locator: `exports/engine/reference_0${attempt}/verification_receipt.json`,
      receipt_pointer: `/case_receipts/${index}`,
    })),
    engine: [1, 2, 3].map((attempt) => ({
      state: 'recorded',
      attempt_index: attempt,
      answer_text: `Engine 합성 답변 ${attempt}-${index + 1}`,
      answer_locator: `exports/engine_qa/attempt_0${attempt}/answers.json`,
      record_pointer: `/answers/${index}`,
      citations: index < 5 ? [{
        kind: 'public_source',
        title: 'Public SE Guide',
        revision: 'R1',
        page_numbers: [index + 1],
        reviewed_paraphrase: '검토된 공개 출처 요지',
      }] : [{
        kind: 'engine_boundary',
        repo_relative_path: 'guild_hall/engineering_engine/contracts/boundary.md',
        sha256: 'a'.repeat(64),
        sections: ['4.4'],
      }],
      review: safeReview(questionId, CLASSIFICATIONS[index], index),
    })),
  }));
  return {
    question_set_locator: 'question_set.json',
    question_set_sha256: 'a'.repeat(64),
    prior_ledger_locator: 'evaluation_ledger.jsonl',
    prior_ledger_sha256: 'b'.repeat(64),
    continuation_ledger_locator: 'evaluation_qa_continuation.jsonl',
    continuation_ledger_sha256: 'c'.repeat(64),
    questions,
    notebook_summaries: [1, 2, 3].map((attempt) => ({
      state: 'recorded', attempt_index: attempt, answer_count: 7, exact_pass: 7,
      useful: 7, safety_violations: 0, authority_actions: 0, overall_verdict: 'pass',
      summary_locator: `reviews/notebook/round_0${attempt}/summary.json`,
    })),
    typed_engine_summaries: [1, 2, 3].map((attempt) => ({
      state: 'recorded',
      attempt_index: attempt,
      row_count: 7,
      learned_model_invocations: 0,
      network_calls: 0,
      filesystem_writes: 0,
      erp_writes: 0,
      claim_ceiling: 'observed_public_synthetic_candidate',
      manifest_locator: `exports/engine/reference_0${attempt}/run_manifest.json`,
      receipt_locator: `exports/engine/reference_0${attempt}/verification_receipt.json`,
    })),
    engine_summaries: [1, 2, 3].map((attempt) => ({
      state: 'recorded', attempt_index: attempt, answer_count: 7, exact_pass: 7,
      useful: 7, safety_violations: 0, authority_actions: 0, overall_verdict: 'pass',
      summary_locator: `reviews/engine_qa/attempt_0${attempt}/summary.json`,
    })),
    prior_inventory: Array.from({ length: 70 }, (_, index) => ({
      sequence: index + 1,
      event_type: index === 69 ? 'comparison_candidate' : 'notebook_answer',
      run_id: index === 69 ? 'comparison_candidate' : 'notebook_round_01',
      question_id: index === 69 ? '—' : 'se-q-01',
      artifact_locator: index === 69
        ? 'comparison_candidate.json'
        : 'exports/notebook/round_01/se-q-01.md',
      artifact_sha256: 'd'.repeat(64),
      status: index === 69 ? 'observed' : 'observed_single_chat_pilot',
      reference_state: 'verified',
    })),
    continuation_inventory: [],
    completeness: {
      prior_event_count: 70,
      continuation_event_count: 0,
      missing_artifact_references: 0,
      prior_event_counts: {
        notebook_answer: 21,
        review: 21,
        round_summary: 3,
        engine_row: 21,
        engine_run: 3,
        comparison_candidate: 1,
      },
      continuation_event_counts: {},
    },
  };
}

test('validated Notebook-only data renders one readable Markdown report with honest Engine gaps', () => {
  const fixture = buildNotebookOnlyFixture();
  const before = readFileSync(join(fixture.root, 'evaluation_ledger.jsonl'));
  const result = renderSeCoreEvalHumanReport(optionsFor(fixture));
  assert.equal(result.result, 'PASS', JSON.stringify(result.report));
  const markdown = result.markdown_bytes.toString('utf8');
  assert.match(markdown, /^# SE Core 질의응답 평가 보고서/m);
  assert.equal((markdown.match(/^## \d+\. se-q-0[1-7]$/gm) ?? []).length, 7);
  assert.match(markdown, /Notebook과 Engine은 모두 비교 참가자이며 정답지가 아닙니다/);
  assert.match(markdown, /공급자 내부 유효 바이트 동일성은 검증되지 않았습니다/);
  assert.match(markdown, /최종 비교 결론: 내리지 않음/);
  assert.match(markdown, /Engine 시도 1: 아직 기록되지 않음/);
  assert.match(markdown, /기존 typed Engine 시도 1/);
  assert.match(markdown, /\/rows\/0/);
  assert.match(markdown, /기존 원장 이벤트: 70/);
  assert.match(markdown, /\| 70 \| comparison\\_candidate \|/);
  assert.match(markdown, /\[답변 원문\]\(exports\/notebook\/round_01\/se-q-01\.md\)/);
  assert.equal(markdown.includes('<html'), false);
  assert.deepEqual(readFileSync(join(fixture.root, 'evaluation_ledger.jsonl')), before);
});

test('the pure formatter shows public citations for q1-q5 and Engine boundary refs for q6-q7', () => {
  const markdown = formatSeCoreEvalHumanReport(fullView()).toString('utf8');
  assert.match(markdown, /공개 출처 인용/);
  assert.match(markdown, /Public SE Guide · R1 · 1쪽/);
  assert.match(markdown, /엔진 경계 근거/);
  assert.match(markdown, /guild_hall\/engineering_engine\/contracts\/boundary\.md/);
  assert.match(markdown, /섹션 4\.4/);
  assert.match(markdown, /`\/answers\/5`/);
  assert.match(markdown, /기존 typed Engine 시도 1/);
  assert.match(markdown, /## 전체 이벤트 목록/);
});

test('exact question and prior-ledger pins fail closed without echoing rejected content', () => {
  const fixture = buildNotebookOnlyFixture();
  let result = renderSeCoreEvalHumanReport({
    ...optionsFor(fixture),
    expected_question_set_sha256: 'f'.repeat(64),
  });
  assert.equal(result.result, 'HOLD');
  assert.equal(JSON.stringify(result.report).includes(fixture.root), false);

  result = renderSeCoreEvalHumanReport({
    ...optionsFor(fixture),
    expected_prior_ledger_sha256: 'e'.repeat(64),
  });
  assert.equal(result.result, 'HOLD');
  assert.equal(result.markdown_bytes.length, 0);
});

test('secret-bearing answer content and unsafe manifest paths HOLD without echo', () => {
  const secret = ['api', '_key=do-not-echo-human-report-secret'].join('');
  const secretFixture = buildNotebookOnlyFixture(secret);
  let result = renderSeCoreEvalHumanReport(optionsFor(secretFixture));
  assert.equal(result.result, 'HOLD');
  assert.equal(JSON.stringify(result.report).includes('do-not-echo-human-report-secret'), false);

  const pathFixture = buildNotebookOnlyFixture();
  const manifestPath = join(
    pathFixture.root, 'exports', 'notebook', 'round_01', 'run_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.answer_files[0].file_name = '../escape.md';
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  result = renderSeCoreEvalHumanReport(optionsFor(pathFixture));
  assert.equal(result.result, 'HOLD');
  assert.equal(JSON.stringify(result.report).includes('../escape.md'), false);
});

test('CR heading forgery is refused and raw HTML in inline citations is escaped', () => {
  for (const attack of ['safe\r# CR_FORGED', '<h1>HTML_FORGED</h1>']) {
    const fixture = buildNotebookOnlyFixture(attack);
    const result = renderSeCoreEvalHumanReport(optionsFor(fixture));
    assert.equal(result.result, 'HOLD');
    assert.equal(result.markdown_bytes.length, 0);
    assert.equal(JSON.stringify(result.report).includes('FORGED'), false);
  }

  const view = fullView();
  view.questions[0].engine[0].citations[0].title = '<h1>HTML_FORGED</h1>';
  const markdown = formatSeCoreEvalHumanReport(view).toString('utf8');
  assert.equal(markdown.includes('<h1>'), false);
  assert.match(markdown, /&lt;h1&gt;/);
  assert.match(markdown, /&lt;\/h1&gt;/);

  const crView = fullView();
  crView.questions[0].engine[0].citations[0].reviewed_paraphrase = 'safe\r# CR_FORGED';
  assert.throws(() => formatSeCoreEvalHumanReport(crView), /MARKDOWN_TEXT_REFUSED/);
});

test('unknown Notebook review keys HOLD after the exact ledger and hash are rebuilt', () => {
  for (const mutate of [
    (review) => { review.unknown_top_level = 'safe'; },
    (review) => { review.normalized_sidecar_candidate.unknown_nested = 'safe'; },
    (review) => { review.citation_fidelity.unknown_nested = 'safe'; },
  ]) {
    const fixture = buildNotebookOnlyFixture();
    const locator = 'reviews/notebook/round_01/se-q-01.review.json';
    const review = readJson(fixture.root, locator);
    mutate(review);
    writeJson(fixture.root, locator, review);
    rebuildPriorLedger(fixture);
    const result = renderSeCoreEvalHumanReport(optionsFor(fixture));
    assert.equal(result.result, 'HOLD');
    assert.equal(result.markdown_bytes.length, 0);
    assert(result.report.issues.includes('NOTEBOOK_REVIEW_SCHEMA_REFUSED'));
  }
});

test('CLI defaults to Markdown stdout and creates only one new file inside the evaluation root', () => {
  const fixture = buildNotebookOnlyFixture();
  const args = [
    'node', 'human-report',
    '--root', fixture.root,
    '--question-set-sha256', fixture.question_set_sha256,
    '--prior-ledger-sha256', fixture.prior_ledger_sha256,
    '--continuation-ledger-sha256', 'not-recorded',
  ];
  const dry = runCli(args);
  assert.equal(dry.exit_code, 0);
  assert.match(dry.stdout.toString('utf8'), /^# SE Core 질의응답 평가 보고서/);

  const ledgerBefore = readFileSync(join(fixture.root, 'evaluation_ledger.jsonl'));
  const out = join(fixture.root, 'SE_CORE_EVAL_HUMAN_REPORT.md');
  const created = runCli([...args, '--out', out]);
  assert.equal(created.exit_code, 0);
  assert.equal(existsSync(out), true);
  const before = readFileSync(out);
  const refused = runCli([...args, '--out', out]);
  assert.equal(refused.exit_code, 2);
  assert.deepEqual(readFileSync(out), before);
  assert.deepEqual(readFileSync(join(fixture.root, 'evaluation_ledger.jsonl')), ledgerBefore);

  const outside = join(dirname(fixture.root), 'outside-report.md');
  const escaped = runCli([...args, '--out', outside]);
  assert.equal(escaped.exit_code, 2);
  assert.equal(existsSync(outside), false);

  const html = join(fixture.root, 'report.html');
  const wrongFormat = runCli([...args, '--out', html]);
  assert.equal(wrongFormat.exit_code, 2);
  assert.equal(existsSync(html), false);
});
