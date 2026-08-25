// Deterministic source-cited Korean answers for the fixed seven-case SE-core evaluation.
//
// This module is pure. It receives exact-pinned bytes, compiles the accepted projection plus
// its separately bounded safe-grounding view, runs the existing Engine cases, and renders the
// observed typed classifications. It does not call a model, network, filesystem, ERP writer,
// Notebook surface, evaluator gold, or candidate-application field.

import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import {
  ACCEPTED_QUESTION_SET_SHA256,
  RESULT_CLAIM_CEILING,
  runSeCoreCrosswalkCases,
} from './se_core_crosswalk_case_run.mjs';
import {
  compileSeCoreCrosswalkProjectionWithSafeGrounding,
} from './se_core_crosswalk_projection.mjs';

export const ANSWER_POLICY_REVISION = 'soulforge.se_core_source_cited_answer_run.v0';
export const ACCEPTED_COHORT_PINS = Object.freeze({
  corpus_sha256: '82a15d355c61ebac4924b2192c8311eb568fe241ffe367e0acda090aee206356',
  crosswalk_sha256: 'b340e21ae2fcf79904361fe0adca8d21e5ce476d3639f2b4158600c1bde28011',
  review_receipt_sha256: '1404da5a7be14e5e0afa9082a7fdfc678709c05fe569c9b3f2f496c7d58e9acb',
});
export const STRUCTURAL_LIMIT = 'fixed_case_structured_renderer_not_general_qa';

export const CODES = Object.freeze({
  INPUT_INVALID: 'SE_CORE_SOURCE_CITED_ANSWER_INPUT_INVALID',
  COHORT_PIN_INVALID: 'SE_CORE_SOURCE_CITED_ANSWER_COHORT_PIN_INVALID',
  GROUNDING_INVALID: 'SE_CORE_SOURCE_CITED_ANSWER_GROUNDING_INVALID',
  ENGINE_RUN_INVALID: 'SE_CORE_SOURCE_CITED_ANSWER_ENGINE_RUN_INVALID',
  OUTPUT_SAFETY_FAILED: 'SE_CORE_SOURCE_CITED_ANSWER_OUTPUT_SAFETY_FAILED',
});

const INPUT_FIELDS = Object.freeze([
  'corpusBytes', 'crosswalkBytes', 'reviewReceiptBytes', 'questionSetBytes',
  'expectedCorpusSha256', 'expectedCrosswalkSha256', 'expectedReviewReceiptSha256',
  'expectedQuestionSetSha256',
]);
const RUN_FIELDS = Object.freeze(['answers', 'verification']);
const ANSWER_FIELDS = Object.freeze([
  'question_id', 'classification', 'answer_text', 'citations', 'safety_violations',
  'claim_ceiling', 'authority_actions',
]);
const SOURCE_CASE_FIELDS = Object.freeze(['question_id', 'public_sources']);
const SOURCE_CITATION_FIELDS = Object.freeze([
  'source_id', 'title', 'revision', 'original_pdf_sha256', 'derived_text_sha256',
  'page_numbers', 'reviewed_paraphrase', 'candidate_claim_ceiling',
]);
const ENGINE_CASE_FIELDS = Object.freeze([
  'question_id', 'engine_contracts', 'policy_candidate_claim_ceiling',
]);
const ENGINE_CITATION_FIELDS = Object.freeze(['repo_relative_path', 'sha256', 'sections']);
const ENGINE_OUTPUT_CITATION_FIELDS = Object.freeze([
  ...ENGINE_CITATION_FIELDS, 'policy_candidate_claim_ceiling',
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_CLASSIFICATIONS = new Set(['correct', 'missing', 'unknown', 'contradictory', 'stale']);
const ENGINE_CLASSIFICATIONS = new Set(['unauthorized', 'wrong-project']);
const FORBIDDEN_OUTPUT = Object.freeze([
  /(?:^|[\\/])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[\\/])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[\\/])private-state(?:[\\/]|$)/iu,
  /[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /\bP\d{2,4}[-_]\d{2,6}\b/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
  /\b(?:cedar|quartz)\b/iu,
  /"(?:oracle_type|synthetic_case_kind|candidate_application|evaluator_gold|rubric)"\s*:/u,
]);

const exactKeys = (value, expected) => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort(compareCodePoints))
    === JSON.stringify([...expected].sort(compareCodePoints));

function fail(code, message) {
  throw new ContractError(code, message);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validateAcceptedCohortPins(input) {
  if (input.expectedCorpusSha256 !== ACCEPTED_COHORT_PINS.corpus_sha256
      || input.expectedCrosswalkSha256 !== ACCEPTED_COHORT_PINS.crosswalk_sha256
      || input.expectedReviewReceiptSha256 !== ACCEPTED_COHORT_PINS.review_receipt_sha256) {
    fail(CODES.COHORT_PIN_INVALID,
      'the fixed answer surface accepts only the independently reviewed cohort byte pins');
  }
}

function validateSourceGrounding(entry) {
  if (!exactKeys(entry, SOURCE_CASE_FIELDS) || !Array.isArray(entry.public_sources)
      || entry.public_sources.length < 1) {
    fail(CODES.GROUNDING_INVALID, 'a source-backed case must use one closed non-empty citation set');
  }
  for (const citation of entry.public_sources) {
    if (!exactKeys(citation, SOURCE_CITATION_FIELDS)
        || !SHA256.test(citation.original_pdf_sha256 ?? '')
        || !SHA256.test(citation.derived_text_sha256 ?? '')
        || citation.candidate_claim_ceiling !== 'source_supported'
        || !Array.isArray(citation.page_numbers) || citation.page_numbers.length < 1
        || citation.page_numbers.some((page) => !Number.isSafeInteger(page) || page < 1)
        || ['source_id', 'title', 'revision', 'reviewed_paraphrase']
          .some((field) => typeof citation[field] !== 'string' || citation[field].length < 1)) {
      fail(CODES.GROUNDING_INVALID,
        'a public-source citation must retain only the reviewed source, page, hash, and claim fields');
    }
  }
}

function validateEngineGrounding(entry) {
  if (!exactKeys(entry, ENGINE_CASE_FIELDS) || !Array.isArray(entry.engine_contracts)
      || entry.engine_contracts.length < 1 || entry.policy_candidate_claim_ceiling !== 'observed') {
    fail(CODES.GROUNDING_INVALID,
      'an Engine-boundary case must use one closed non-empty policy-candidate citation set');
  }
  for (const citation of entry.engine_contracts) {
    if (!exactKeys(citation, ENGINE_CITATION_FIELDS)
        || typeof citation.repo_relative_path !== 'string' || citation.repo_relative_path.length < 1
        || !SHA256.test(citation.sha256 ?? '') || !Array.isArray(citation.sections)
        || citation.sections.length < 1
        || citation.sections.some((section) => typeof section !== 'string' || section.length < 1)) {
      fail(CODES.GROUNDING_INVALID,
        'an Engine citation must retain only its relative path, exact hash, and reviewed sections');
    }
  }
}

function validateGrounding(safeGrounding) {
  if (!Array.isArray(safeGrounding) || safeGrounding.length !== 7) {
    fail(CODES.GROUNDING_INVALID, 'the safe grounding view must contain seven cases exactly');
  }
  const byQuestion = new Map();
  for (const entry of safeGrounding) {
    if (typeof entry?.question_id !== 'string' || byQuestion.has(entry.question_id)) {
      fail(CODES.GROUNDING_INVALID, 'safe grounding question ids must be non-empty and unique');
    }
    if (Object.hasOwn(entry, 'public_sources')) validateSourceGrounding(entry);
    else validateEngineGrounding(entry);
    byQuestion.set(entry.question_id, entry);
  }
  return byQuestion;
}

const SOURCE_CONCLUSIONS = Object.freeze({
  correct: '제공된 합성 관측 범위에서는 체계공학 격차가 확인되지 않았습니다. 세 요구사항의 검증 방법, 성공 기준, 책임, 현행 근거, 양방향 추적이 모두 확인되었다는 관측에 한정된 판정입니다.',
  missing: '완전한 점검에서 측정 가능한 합격·불합격 기준과 검증 활동에서 요구사항으로 이어지는 추적 근거의 부재가 명시적으로 확인되었으므로 누락입니다. 두 항목을 보완한 개정 근거와 연결 상태를 다음 점검에서 확인해야 합니다.',
  unknown: '선언된 세 점검 면 중 한 면만 확인되고 나머지는 실패 또는 미실행 상태이므로, 미관측 인터페이스 설명의 존재나 부재를 결론낼 수 없습니다. 실패한 면을 재실행하고 미실행 면까지 포함한 완전한 점검 근거를 요청해야 합니다.',
  contradictory: '두 현행 기록의 성능 기준이 서로 충돌합니다. 해소 전에는 더 높은 권위의 통제 요구사항 R7에 적힌 4초 이하가 적용되며, W12의 6초 이하 주장도 삭제하지 말고 양쪽의 revision, 권위, 적용성, 계보와 함께 보존해야 합니다.',
  stale: 'D3에서 통과한 시험은 D3에 대한 결과만 뒷받침하며 현재 D5의 준수 여부를 입증하지 못합니다. D3에서 D5로의 영향 분석과 D5에 적용되는 회귀 또는 재검증 근거를 다음 증거로 요청해야 합니다.',
});

const ENGINE_CONCLUSIONS = Object.freeze({
  unauthorized: '권한이 없는 두 증거 항목은 최초 후보 집합과 후속 탐색 단계에서 각각 제외해야 하며, 이름·해시·위치·내용을 결과에 드러내면 안 됩니다. 남은 허가 증거만으로 제한된 자문 결과를 만들 수 있지만 거부 사실과 증거 범위는 명시해야 합니다.',
  'wrong-project': '요청과 다른 프로젝트 binding에만 묶인 캐시와 증거 사슬은 승인된 교차 binding이 없으므로 사용할 수도, 결과에 노출할 수도 없습니다. 해당 항목을 재현하지 않은 채 binding 불일치로 거부하고 요청 프로젝트에 맞는 근거를 새로 확인해야 합니다.',
});

function sourceAnswerText(classification, citations) {
  const evidence = citations.map((citation) => {
    const pages = citation.page_numbers.length === 1
      ? `${citation.page_numbers[0]}쪽`
      : `${citation.page_numbers.join(', ')}쪽`;
    return `- ${citation.reviewed_paraphrase} (${citation.title}, ${citation.revision}, ${pages})`;
  }).join('\n');
  return [
    `판정: ${SOURCE_CONCLUSIONS[classification]}`,
    `출처 기반 근거:\n${evidence}`,
    '증거 한계: 이 답변은 고정된 공개 SE 자료와 합성 관측에 대한 외부 자문 후보입니다. 실제 프로젝트 적합성, 정본 등록, 승인 또는 작업 생성을 의미하지 않습니다.',
  ].join('\n\n');
}

function engineAnswerText(classification, citations) {
  const evidence = citations.map((citation) => (
    `- ${citation.repo_relative_path} §${citation.sections.join(', §')}`
  )).join('\n');
  return [
    `판정: ${ENGINE_CONCLUSIONS[classification]}`,
    `Engine 경계 계약 근거:\n${evidence}`,
    '근거 성격: 위 인용은 공개 체계공학 자료의 교리가 아니라 Engine의 접근·binding 경계 계약입니다.',
    '증거 한계: 이 답변은 합성 경계 시험에 대한 외부 자문 후보이며, 승인·정본 등록·작업 생성 권한을 갖지 않습니다.',
  ].join('\n\n');
}

function sourceCitations(entry) {
  return entry.public_sources.map((citation) => structuredClone(citation));
}

function engineCitations(entry) {
  return entry.engine_contracts.map((citation) => ({
    ...structuredClone(citation),
    policy_candidate_claim_ceiling: entry.policy_candidate_claim_ceiling,
  }));
}

function validateRenderedAnswer(answer) {
  if (!exactKeys(answer, ANSWER_FIELDS) || typeof answer.question_id !== 'string'
      || typeof answer.answer_text !== 'string' || answer.answer_text.length < 1
      || answer.answer_text.normalize('NFC') !== answer.answer_text
      || answer.safety_violations !== 0 || answer.claim_ceiling !== RESULT_CLAIM_CEILING
      || !Array.isArray(answer.authority_actions) || answer.authority_actions.length !== 0
      || !Array.isArray(answer.citations) || answer.citations.length < 1) {
    fail(CODES.OUTPUT_SAFETY_FAILED, 'one rendered answer differs from the closed batch schema');
  }
  if (SOURCE_CLASSIFICATIONS.has(answer.classification)) {
    validateSourceGrounding({ question_id: answer.question_id, public_sources: answer.citations });
    return;
  }
  if (!ENGINE_CLASSIFICATIONS.has(answer.classification)
      || answer.citations.some((citation) => !exactKeys(citation, ENGINE_OUTPUT_CITATION_FIELDS))) {
    fail(CODES.OUTPUT_SAFETY_FAILED,
      'one rendered answer has an unsupported classification or citation family');
  }
  const engineContracts = answer.citations.map((citation) => {
    const { policy_candidate_claim_ceiling: _ceiling, ...contract } = citation;
    return contract;
  });
  if (answer.citations.some((citation) => citation.policy_candidate_claim_ceiling !== 'observed')) {
    fail(CODES.OUTPUT_SAFETY_FAILED, 'an Engine answer exceeds the policy-candidate ceiling');
  }
  validateEngineGrounding({
    question_id: answer.question_id,
    engine_contracts: engineContracts,
    policy_candidate_claim_ceiling: 'observed',
  });
}

function renderAnswer(row, grounding) {
  if (!exactKeys(row, [
    'question_id', 'classification', 'safety_violations', 'claim_ceiling', 'authority_actions',
  ]) || row.safety_violations !== 0 || row.claim_ceiling !== RESULT_CLAIM_CEILING
      || !Array.isArray(row.authority_actions) || row.authority_actions.length !== 0) {
    fail(CODES.ENGINE_RUN_INVALID, 'the Engine result row is not one safe candidate-only decision');
  }
  let citations;
  let answerText;
  if (Object.hasOwn(grounding, 'public_sources')) {
    if (!SOURCE_CLASSIFICATIONS.has(row.classification)) {
      fail(CODES.ENGINE_RUN_INVALID,
        'an observed Engine-boundary classification cannot consume public-source doctrine');
    }
    citations = sourceCitations(grounding);
    answerText = sourceAnswerText(row.classification, citations);
  } else {
    if (!ENGINE_CLASSIFICATIONS.has(row.classification)) {
      fail(CODES.ENGINE_RUN_INVALID,
        'an observed source classification cannot consume an Engine boundary contract');
    }
    citations = engineCitations(grounding);
    answerText = engineAnswerText(row.classification, citations);
  }
  const answer = {
    question_id: row.question_id,
    classification: row.classification,
    answer_text: answerText,
    citations,
    safety_violations: 0,
    claim_ceiling: RESULT_CLAIM_CEILING,
    authority_actions: [],
  };
  validateRenderedAnswer(answer);
  return answer;
}

function assertOutputSafe(value) {
  const serialised = canonicalise(value, {
    answers: 'insertion_ordered',
    'answers[].citations': 'insertion_ordered',
    'answers[].citations[].page_numbers': 'insertion_ordered',
    'answers[].citations[].sections': 'insertion_ordered',
    'answers[].authority_actions': 'insertion_ordered',
    'verification.authority_actions': 'insertion_ordered',
  });
  if (FORBIDDEN_OUTPUT.some((pattern) => pattern.test(serialised))) {
    fail(CODES.OUTPUT_SAFETY_FAILED,
      'the answer batch contains evaluator-only, private, credential, or denied-binding material');
  }
}

/** Run the exact-pinned seven cases and render source-cited Korean advisory answers. */
export function runSeCoreSourceCitedAnswerBatch(input) {
  if (!exactKeys(input, INPUT_FIELDS)) {
    fail(CODES.INPUT_INVALID, 'the source-cited answer runner uses one closed input field set');
  }
  validateAcceptedCohortPins(input);
  const compiled = compileSeCoreCrosswalkProjectionWithSafeGrounding({
    corpusBytes: input.corpusBytes,
    crosswalkBytes: input.crosswalkBytes,
    reviewReceiptBytes: input.reviewReceiptBytes,
    expectedCorpusSha256: input.expectedCorpusSha256,
    expectedCrosswalkSha256: input.expectedCrosswalkSha256,
    expectedReviewReceiptSha256: input.expectedReviewReceiptSha256,
  });
  const engineRun = runSeCoreCrosswalkCases({
    projection: compiled.projection,
    questionSetBytes: input.questionSetBytes,
    expectedQuestionSetSha256: input.expectedQuestionSetSha256,
  });
  if (engineRun.verification.learned_model_invocations !== 0
      || engineRun.verification.network_calls !== 0
      || engineRun.verification.filesystem_writes !== 0
      || engineRun.verification.erp_writes !== 0) {
    fail(CODES.ENGINE_RUN_INVALID,
      'the fixed answer path must remain model-free, network-free, write-free, and ERP-free');
  }
  const groundingByQuestion = validateGrounding(compiled.safeGrounding);
  const answers = engineRun.engine_results.rows.map((row) => {
    const grounding = groundingByQuestion.get(row.question_id);
    if (!grounding) fail(CODES.GROUNDING_INVALID, 'one Engine result lacks exact safe grounding');
    return renderAnswer(row, grounding);
  });
  if (answers.length !== 7 || answers.some((answer, index) => (
    index > 0 && compareCodePoints(answers[index - 1].question_id, answer.question_id) >= 0
  ))) {
    fail(CODES.ENGINE_RUN_INVALID, 'the answer batch must contain seven uniquely ordered questions');
  }
  const result = {
    answers,
    verification: {
      schema_version: 'soulforge.se_core_source_cited_answer_verification.v0',
      artifact_state: 'candidate_only',
      answer_policy_revision: ANSWER_POLICY_REVISION,
      question_set_sha256: ACCEPTED_QUESTION_SET_SHA256,
      projection_revision: compiled.projection.projection_revision,
      projection_sha256: compiled.projection.projection_sha256,
      answers_rendered: answers.length,
      learned_model_invocations: 0,
      network_calls: 0,
      filesystem_writes: 0,
      erp_writes: 0,
      structural_limit: STRUCTURAL_LIMIT,
      claim_ceiling: RESULT_CLAIM_CEILING,
      authority_actions: [],
    },
  };
  assertOutputSafe({ answers: result.answers });
  assertOutputSafe({ answers: [], verification: result.verification });
  return deepFreeze(result);
}

/** Canonical closed answer batch; the verification receipt is deliberately separate. */
export function canonicalSeCoreSourceCitedAnswerBatchJson(run) {
  if (!exactKeys(run, RUN_FIELDS) || !Array.isArray(run.answers)) {
    fail(CODES.INPUT_INVALID, 'one completed source-cited answer run is required');
  }
  if (run.answers.length !== 7) {
    fail(CODES.INPUT_INVALID, 'the canonical answer batch requires seven rows exactly');
  }
  run.answers.forEach(validateRenderedAnswer);
  if (run.answers.some((answer, index) => (
    index > 0 && compareCodePoints(run.answers[index - 1].question_id, answer.question_id) >= 0
  ))) {
    fail(CODES.INPUT_INVALID, 'the canonical answer rows must use one unique deterministic order');
  }
  const batch = { answers: run.answers };
  assertOutputSafe(batch);
  return `${canonicalise(batch, {
    answers: 'insertion_ordered',
    'answers[].citations': 'insertion_ordered',
    'answers[].citations[].page_numbers': 'insertion_ordered',
    'answers[].citations[].sections': 'insertion_ordered',
    'answers[].authority_actions': 'insertion_ordered',
  })}\n`;
}

/** Canonical payload-free verification receipt for the same run. */
export function canonicalSeCoreSourceCitedAnswerReceiptJson(run) {
  if (!exactKeys(run, RUN_FIELDS) || !exactKeys(run.verification, [
    'schema_version', 'artifact_state', 'answer_policy_revision', 'question_set_sha256',
    'projection_revision', 'projection_sha256', 'answers_rendered', 'learned_model_invocations',
    'network_calls', 'filesystem_writes', 'erp_writes', 'structural_limit', 'claim_ceiling',
    'authority_actions',
  ])) {
    fail(CODES.INPUT_INVALID, 'one completed source-cited answer receipt is required');
  }
  if (run.verification.structural_limit !== STRUCTURAL_LIMIT
      || run.verification.learned_model_invocations !== 0
      || run.verification.network_calls !== 0 || run.verification.filesystem_writes !== 0
      || run.verification.erp_writes !== 0 || run.verification.answers_rendered !== 7
      || run.verification.claim_ceiling !== RESULT_CLAIM_CEILING
      || !Array.isArray(run.verification.authority_actions)
      || run.verification.authority_actions.length !== 0) {
    fail(CODES.INPUT_INVALID, 'the verification receipt exceeds the fixed renderer boundary');
  }
  return `${canonicalise(run.verification, { authority_actions: 'insertion_ordered' })}\n`;
}
