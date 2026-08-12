import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  backfillSeCoreEvalLedger,
  validateSeCoreEvalLedger,
} from './se_core_eval_ledger.mjs';
import {
  backfillSeCoreEvalQaContinuation,
  validateSeCoreEvalQaContinuation,
} from './se_core_eval_qa_continuation.mjs';

const REPORT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_human_report.v1';
const QUESTION_IDS = Object.freeze(Array.from(
  { length: 7 },
  (_, index) => `se-q-${String(index + 1).padStart(2, '0')}`,
));
const CLASSIFICATIONS = Object.freeze([
  'correct', 'missing', 'unknown', 'contradictory', 'stale', 'unauthorized', 'wrong-project',
]);
const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SAFE_SECTION = /^[A-Za-z0-9][A-Za-z0-9._-]*(?: [A-Za-z0-9][A-Za-z0-9._-]*){0,7}$/;
const SAFE_LOCATOR = /^[A-Za-z0-9._/-]{1,240}$/;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_LEDGER_BYTES = 4 * 1024 * 1024;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CREDENTIAL_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bbearer\s+[a-z0-9._~+/=-]{12,}|\bsk-[a-z0-9_-]{12,}|\bgh[pousr]_[a-z0-9]{20,}|\bAIza[a-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{8,}|(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|credential|secret)\s*[:=])/i;
const ACCOUNT_VALUE = /(?:\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b|\baccount(?:[_ -]?id)?\s*[:=])/i;
const NOTEBOOK_IDENTIFIER = /(?:\bnotebook(?:[_ -]?(?:id|identifier))\s*[:=]|notebook\.google\.com\/(?:notebook|u\/\d+\/notebook)\/[^\s)]+)/i;
const ACTUAL_PROJECT_CODE = /\bP\d{2,4}[-_]\d{2,6}\b/i;
const CONTROL_VALUE = /[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const QUESTION_SET_LOCATOR = 'question_set.json';
const PRIOR_LEDGER_LOCATOR = 'evaluation_ledger.jsonl';
const CONTINUATION_LEDGER_LOCATOR = 'evaluation_qa_continuation.jsonl';
const EXPECTED_PRIOR_COUNTS = Object.freeze({
  notebook_answer: 21,
  review: 21,
  round_summary: 3,
  engine_row: 21,
  engine_run: 3,
  comparison_candidate: 1,
});
const NOTEBOOK_REVIEW_KEYS = Object.freeze([
  'schema_version',
  'review_id',
  'question_id',
  'round_index',
  'human_review',
  'reviewer_role',
  'provider_role',
  'oracle_basis',
  'raw_response',
  'minimal_snippets',
  'exact_case_classification',
  'mandatory_propositions',
  'prohibited_overclaim_leakage_authority',
  'evidence_limit_and_action_boundary',
  'citation_fidelity',
  'normalized_sidecar_candidate',
  'overall_verdict',
  'uncertainties',
]);
const NOTEBOOK_SUMMARY_ROW_KEYS = Object.freeze([
  'question_id', 'expected', 'observed_primary', 'exact_status', 'overall_verdict',
]);

class HumanReportHold extends Error {
  constructor(code) {
    super(code);
    this.name = 'HumanReportHold';
    this.code = code;
  }
}

function hold(code) {
  throw new HumanReportHold(code);
}

function guard(condition, code) {
  if (!condition) hold(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, code = 'SOURCE_SHAPE_REFUSED') {
  guard(isRecord(value) && Object.getPrototypeOf(value) === Object.prototype, code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  guard(Object.getOwnPropertySymbols(value).length === 0
    && Object.keys(descriptors).length === keys.length
    && keys.every((key) => Object.hasOwn(descriptors, key)
      && Object.hasOwn(descriptors[key], 'value')
      && descriptors[key].enumerable === true), code);
}

function plainJson(value, depth = 0) {
  guard(depth <= 32, 'SOURCE_JSON_REFUSED');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') {
    guard(value.length <= MAX_TEXT_BYTES && value.normalize('NFC') === value,
      'SOURCE_JSON_REFUSED');
    return;
  }
  if (Array.isArray(value)) {
    guard(Object.getPrototypeOf(value) === Array.prototype && value.length <= 4096,
      'SOURCE_JSON_REFUSED');
    for (const item of value) plainJson(item, depth + 1);
    return;
  }
  guard(isRecord(value) && Object.getPrototypeOf(value) === Object.prototype,
    'SOURCE_JSON_REFUSED');
  for (const [key, item] of Object.entries(value)) {
    guard(!DANGEROUS_KEYS.has(key) && key.normalize('NFC') === key, 'SOURCE_JSON_REFUSED');
    plainJson(item, depth + 1);
  }
}

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

function hex64(value, code = 'EXPECTED_HASH_REFUSED') {
  guard(typeof value === 'string' && HEX64.test(value), code);
  return value;
}

function safeText(value, code = 'SENSITIVE_CONTENT_REFUSED', maximum = MAX_TEXT_BYTES) {
  guard(typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && value.normalize('NFC') === value
    && !CONTROL_VALUE.test(value)
    && !value.includes('\r')
    && !value.includes('<')
    && !value.includes('>')
    && !CREDENTIAL_VALUE.test(value)
    && !ACCOUNT_VALUE.test(value)
    && !NOTEBOOK_IDENTIFIER.test(value)
    && !ACTUAL_PROJECT_CODE.test(value), code);
  return value;
}

function safeToken(value, code = 'SOURCE_SHAPE_REFUSED') {
  guard(typeof value === 'string' && SAFE_TOKEN.test(value), code);
  return value;
}

function safeSection(value, code = 'SOURCE_SHAPE_REFUSED') {
  guard(typeof value === 'string' && value.length <= 160 && SAFE_SECTION.test(value), code);
  return value;
}

function validateLocator(locator) {
  guard(typeof locator === 'string'
    && SAFE_LOCATOR.test(locator)
    && !isAbsolute(locator)
    && !locator.includes('\\')
    && locator.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    && !CREDENTIAL_VALUE.test(locator)
    && !ACCOUNT_VALUE.test(locator)
    && !NOTEBOOK_IDENTIFIER.test(locator),
  'SOURCE_PATH_REFUSED');
  return locator;
}

function withinRoot(root, candidate) {
  const locator = relative(root, candidate);
  return locator === ''
    || (locator !== '..' && !locator.startsWith(`..${sep}`) && !isAbsolute(locator));
}

function openRoot(rootPath) {
  guard(typeof rootPath === 'string' && rootPath.length > 0, 'SOURCE_TREE_UNREADABLE');
  try {
    const root = realpathSync(rootPath);
    guard(statSync(root).isDirectory(), 'SOURCE_TREE_UNREADABLE');
    return root;
  } catch (error) {
    if (error instanceof HumanReportHold) throw error;
    hold('SOURCE_TREE_UNREADABLE');
  }
}

function pathExists(root, locator) {
  validateLocator(locator);
  const target = resolve(root, ...locator.split('/'));
  guard(withinRoot(root, target), 'SOURCE_PATH_REFUSED');
  try {
    lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function readConfined(root, locator, maximum) {
  validateLocator(locator);
  try {
    const target = realpathSync(resolve(root, ...locator.split('/')));
    guard(withinRoot(root, target), 'SOURCE_PATH_REFUSED');
    const stats = statSync(target);
    guard(stats.isFile() && stats.size > 0 && stats.size <= maximum, 'SOURCE_FILE_REFUSED');
    const bytes = readFileSync(target);
    guard(bytes.length === stats.size, 'SOURCE_FILE_REFUSED');
    return bytes;
  } catch (error) {
    if (error instanceof HumanReportHold) throw error;
    hold('SOURCE_FILE_REFUSED');
  }
}

function parseJson(bytes) {
  guard(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_JSON_BYTES,
    'SOURCE_JSON_REFUSED');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    guard(!text.startsWith('\uFEFF'), 'SOURCE_JSON_REFUSED');
    const value = JSON.parse(text);
    plainJson(value);
    return value;
  } catch (error) {
    if (error instanceof HumanReportHold) throw error;
    hold('SOURCE_JSON_REFUSED');
  }
}

function decodeAnswer(bytes) {
  guard(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_TEXT_BYTES,
    'SOURCE_TEXT_REFUSED');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    guard(!text.startsWith('\uFEFF'), 'SOURCE_TEXT_REFUSED');
    return safeText(text, 'SENSITIVE_CONTENT_REFUSED');
  } catch (error) {
    if (error instanceof HumanReportHold) throw error;
    hold('SOURCE_TEXT_REFUSED');
  }
}

function summarizeReview(review, summaryRow, locator, provider) {
  guard(isRecord(review) && isRecord(summaryRow), 'SOURCE_SHAPE_REFUSED');
  const candidate = review.normalized_sidecar_candidate;
  const exact = review.exact_case_classification;
  guard(isRecord(candidate) && isRecord(exact), 'SOURCE_SHAPE_REFUSED');
  const expected = exact.expected ?? summaryRow.expected;
  const observed = exact.observed_primary ?? summaryRow.observed_primary;
  const exactStatus = exact.status ?? summaryRow.exact_status;
  const citation = review.citation_fidelity;
  const boundary = review.engine_boundary_fidelity;
  return {
    question_id: safeToken(review.question_id),
    expected: safeToken(expected),
    observed: safeToken(observed),
    exact_status: safeToken(exactStatus),
    overall_verdict: safeToken(review.overall_verdict),
    useful: candidate.useful === true,
    citation_status: isRecord(citation)
      ? safeToken(citation.status)
      : (provider === 'engine' ? 'not_applicable' : 'not_recorded'),
    boundary_status: isRecord(boundary) ? safeToken(boundary.status) : 'not_applicable',
    safety_violations: safeNonnegative(candidate.safety_violations),
    authority_actions: Array.isArray(candidate.authority_actions)
      ? safeNonnegative(candidate.authority_actions.length)
      : hold('SOURCE_SHAPE_REFUSED'),
    review_locator: validateLocator(locator),
  };
}

function safeNonnegative(value) {
  guard(Number.isSafeInteger(value) && value >= 0 && value <= 100000,
    'SOURCE_SHAPE_REFUSED');
  return value;
}

function safeBoolean(value, code = 'NOTEBOOK_REVIEW_SCHEMA_REFUSED') {
  guard(typeof value === 'boolean', code);
  return value;
}

function safeReviewText(value, maximum = 64 * 1024) {
  return safeText(value, 'NOTEBOOK_REVIEW_SCHEMA_REFUSED', maximum);
}

function safeReviewToken(value) {
  return safeToken(value, 'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
}

function safeReviewStrings(value, maximum = 4096) {
  guard(Array.isArray(value)
    && Object.getPrototypeOf(value) === Array.prototype
    && value.length <= 128,
  'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  for (const item of value) safeReviewText(item, maximum);
}

function validateNotebookReviewShape(review, summaryRow, questionId, roundIndex) {
  exactKeys(review, NOTEBOOK_REVIEW_KEYS, 'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  exactKeys(summaryRow, NOTEBOOK_SUMMARY_ROW_KEYS, 'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  guard(review.schema_version === 'soulforge.se_core_eval.notebook_answer_review.v1'
    && review.question_id === questionId
    && review.round_index === roundIndex
    && summaryRow.question_id === questionId,
  'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  safeReviewToken(review.review_id);
  safeReviewToken(review.human_review);
  safeReviewToken(review.reviewer_role);
  safeReviewToken(review.provider_role);
  safeReviewToken(review.overall_verdict);

  const sourceCase = QUESTION_IDS.indexOf(questionId) < 5;
  exactKeys(
    review.oracle_basis,
    sourceCase
      ? [
        'synthetic_facts', 'expected_classification', 'crosswalk_sha256',
        'crosswalk_review_verdict',
      ]
      : [
        'synthetic_facts', 'expected_classification', 'engine_boundary_contracts',
        'crosswalk_sha256', 'crosswalk_review_verdict',
      ],
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED',
  );
  safeReviewToken(review.oracle_basis.synthetic_facts);
  safeReviewToken(review.oracle_basis.expected_classification);
  hex64(review.oracle_basis.crosswalk_sha256, 'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  safeReviewToken(review.oracle_basis.crosswalk_review_verdict);
  if (!sourceCase) safeReviewToken(review.oracle_basis.engine_boundary_contracts);

  exactKeys(
    review.raw_response,
    ['file_name', 'byte_length', 'sha256', 'manifest_hash_match'],
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED',
  );
  guard(review.raw_response.file_name === `${questionId}.md`
    && review.raw_response.manifest_hash_match === true,
  'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  safeNonnegative(review.raw_response.byte_length);
  hex64(review.raw_response.sha256, 'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  safeReviewStrings(review.minimal_snippets);

  exactKeys(
    review.exact_case_classification,
    ['expected', 'observed_primary', 'status', 'reason'],
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED',
  );
  safeReviewToken(review.exact_case_classification.expected);
  safeReviewToken(review.exact_case_classification.observed_primary);
  safeReviewToken(review.exact_case_classification.status);
  safeReviewText(review.exact_case_classification.reason);

  exactKeys(
    review.mandatory_propositions,
    ['status', 'items'],
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED',
  );
  safeReviewToken(review.mandatory_propositions.status);
  guard(Array.isArray(review.mandatory_propositions.items)
    && review.mandatory_propositions.items.length > 0
    && review.mandatory_propositions.items.length <= 16,
  'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  for (const item of review.mandatory_propositions.items) {
    exactKeys(item, ['proposition', 'status'], 'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
    safeReviewText(item.proposition);
    safeReviewToken(item.status);
  }

  exactKeys(
    review.prohibited_overclaim_leakage_authority,
    ['status', 'safety_violations', 'authority_actions', 'issues'],
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED',
  );
  safeReviewToken(review.prohibited_overclaim_leakage_authority.status);
  safeNonnegative(review.prohibited_overclaim_leakage_authority.safety_violations);
  guard(Array.isArray(review.prohibited_overclaim_leakage_authority.authority_actions)
    && review.prohibited_overclaim_leakage_authority.authority_actions.length === 0,
  'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  safeReviewStrings(review.prohibited_overclaim_leakage_authority.issues);

  exactKeys(
    review.evidence_limit_and_action_boundary,
    ['status', 'evidence_limit_stated', 'work_created', 'work_approved', 'reason'],
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED',
  );
  safeReviewToken(review.evidence_limit_and_action_boundary.status);
  safeBoolean(review.evidence_limit_and_action_boundary.evidence_limit_stated);
  safeBoolean(review.evidence_limit_and_action_boundary.work_created);
  safeBoolean(review.evidence_limit_and_action_boundary.work_approved);
  safeReviewText(review.evidence_limit_and_action_boundary.reason);

  exactKeys(
    review.citation_fidelity,
    sourceCase
      ? [
        'applicable_to_score', 'status', 'source_titles_and_revisions_named',
        'quoted_text_materially_present_in_sources', 'application_fidelity', 'reason',
      ]
      : ['applicable_to_score', 'status', 'incidental_citations', 'reason'],
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED',
  );
  guard(review.citation_fidelity.applicable_to_score === sourceCase,
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  safeReviewToken(review.citation_fidelity.status);
  safeReviewText(review.citation_fidelity.reason);
  if (sourceCase) {
    safeBoolean(review.citation_fidelity.source_titles_and_revisions_named);
    safeBoolean(review.citation_fidelity.quoted_text_materially_present_in_sources);
    if (typeof review.citation_fidelity.application_fidelity === 'boolean') {
      safeBoolean(review.citation_fidelity.application_fidelity);
    } else {
      safeReviewToken(review.citation_fidelity.application_fidelity);
    }
  } else {
    safeReviewToken(review.citation_fidelity.incidental_citations);
  }

  exactKeys(
    review.normalized_sidecar_candidate,
    [
      'classification', 'source_revision_supported', 'useful', 'safety_violations',
      'claim_ceiling', 'authority_actions',
    ],
    'NOTEBOOK_REVIEW_SCHEMA_REFUSED',
  );
  safeReviewToken(review.normalized_sidecar_candidate.classification);
  guard(review.normalized_sidecar_candidate.source_revision_supported === null
    || typeof review.normalized_sidecar_candidate.source_revision_supported === 'boolean',
  'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  safeBoolean(review.normalized_sidecar_candidate.useful);
  safeNonnegative(review.normalized_sidecar_candidate.safety_violations);
  safeReviewToken(review.normalized_sidecar_candidate.claim_ceiling);
  guard(Array.isArray(review.normalized_sidecar_candidate.authority_actions)
    && review.normalized_sidecar_candidate.authority_actions.length === 0,
  'NOTEBOOK_REVIEW_SCHEMA_REFUSED');
  safeReviewStrings(review.uncertainties);

  safeReviewToken(summaryRow.expected);
  safeReviewToken(summaryRow.observed_primary);
  safeReviewToken(summaryRow.exact_status);
  safeReviewToken(summaryRow.overall_verdict);
}

function loadQuestionSet(root, expectedSha256) {
  const bytes = readConfined(root, QUESTION_SET_LOCATOR, MAX_JSON_BYTES);
  guard(sha256(bytes) === expectedSha256, 'QUESTION_SET_PIN_MISMATCH');
  const value = parseJson(bytes);
  exactKeys(value, ['questions']);
  guard(Array.isArray(value.questions) && value.questions.length === 7, 'SOURCE_SHAPE_REFUSED');
  const questions = value.questions.map((row, index) => {
    exactKeys(row, ['question_id', 'question']);
    guard(row.question_id === QUESTION_IDS[index], 'SOURCE_COHORT_REFUSED');
    return {
      question_id: row.question_id,
      question: safeText(row.question, 'SENSITIVE_CONTENT_REFUSED', 64 * 1024),
    };
  });
  return { questions, canonical_sha256: canonicalSha256(value) };
}

function loadNotebook(root, questions, questionSetCanonicalSha256) {
  const byQuestion = new Map(questions.map((row) => [row.question_id, []]));
  const summaries = [];
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const suffix = String(attemptIndex).padStart(2, '0');
    const roundId = `round_${suffix}`;
    const base = `exports/notebook/${roundId}`;
    const manifestLocator = `${base}/run_manifest.json`;
    const manifest = parseJson(readConfined(root, manifestLocator, MAX_JSON_BYTES));
    guard(manifest.schema_version === 'soulforge.se_core_notebook_shadow_run.v1'
      && manifest.run_id === `notebook_round_${suffix}`
      && manifest.question_set_canonical_sha256 === questionSetCanonicalSha256
      && Array.isArray(manifest.answer_files)
      && manifest.answer_files.length === 7,
    'SOURCE_COHORT_REFUSED');
    const summaryLocator = `reviews/notebook/${roundId}/summary.json`;
    const summary = parseJson(readConfined(root, summaryLocator, MAX_JSON_BYTES));
    guard(summary.schema_version === 'soulforge.se_core_eval.notebook_round_review_summary.v1'
      && summary.run_id === manifest.run_id
      && Array.isArray(summary.question_results)
      && summary.question_results.length === 7,
    'SOURCE_COHORT_REFUSED');
    const summaryRows = new Map(summary.question_results.map((row) => [row.question_id, row]));
    let exactPass = 0;
    let useful = 0;
    let safety = 0;
    let authority = 0;
    for (let index = 0; index < questions.length; index += 1) {
      const questionId = questions[index].question_id;
      const fileRow = manifest.answer_files[index];
      guard(isRecord(fileRow)
        && fileRow.question_id === questionId
        && fileRow.file_name === `${questionId}.md`,
      'SOURCE_COHORT_REFUSED');
      const answerLocator = `${base}/${questionId}.md`;
      const answerBytes = readConfined(root, answerLocator, MAX_TEXT_BYTES);
      guard(answerBytes.length === fileRow.byte_length
        && sha256(answerBytes) === fileRow.sha256,
      'SOURCE_COMMITMENT_MISMATCH');
      const reviewLocator = `reviews/notebook/${roundId}/${questionId}.review.json`;
      const reviewValue = parseJson(readConfined(root, reviewLocator, MAX_JSON_BYTES));
      validateNotebookReviewShape(
        reviewValue,
        summaryRows.get(questionId),
        questionId,
        attemptIndex,
      );
      const review = summarizeReview(
        reviewValue,
        summaryRows.get(questionId),
        reviewLocator,
        'notebook',
      );
      guard(review.question_id === questionId, 'SOURCE_COHORT_REFUSED');
      if (review.exact_status === 'pass') exactPass += 1;
      if (review.useful) useful += 1;
      safety += review.safety_violations;
      authority += review.authority_actions;
      byQuestion.get(questionId).push({
        state: 'recorded',
        attempt_index: attemptIndex,
        answer_text: decodeAnswer(answerBytes),
        answer_locator: answerLocator,
        review,
      });
    }
    summaries.push({
      state: 'recorded',
      attempt_index: attemptIndex,
      answer_count: 7,
      exact_pass: exactPass,
      useful,
      safety_violations: safety,
      authority_actions: authority,
      overall_verdict: safeToken(summary.overall_verdict),
      summary_locator: summaryLocator,
    });
  }
  return { byQuestion, summaries };
}

function loadTypedEngine(root, questions) {
  const byQuestion = new Map(questions.map((row) => [row.question_id, []]));
  const summaries = [];
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const suffix = String(attemptIndex).padStart(2, '0');
    const folder = `reference_${suffix}`;
    const base = `exports/engine/${folder}`;
    const manifestLocator = `${base}/run_manifest.json`;
    const manifest = parseJson(readConfined(root, manifestLocator, MAX_JSON_BYTES));
    guard(manifest.schema_version === 'soulforge.se_core_eval.engine_reference_run_manifest.v1'
      && manifest.run_id === `engine_reference_${suffix}`
      && manifest.attempt_index === attemptIndex
      && isRecord(manifest.outputs)
      && isRecord(manifest.outputs.engine_results)
      && isRecord(manifest.outputs.verification_receipt)
      && manifest.outputs.engine_results.file === 'engine_results.json'
      && manifest.outputs.verification_receipt.file === 'verification_receipt.json',
    'SOURCE_COHORT_REFUSED');
    const resultLocator = `${base}/engine_results.json`;
    const resultBytes = readConfined(root, resultLocator, MAX_JSON_BYTES);
    guard(resultBytes.length === manifest.outputs.engine_results.byte_length
      && sha256(resultBytes) === manifest.outputs.engine_results.raw_sha256,
    'SOURCE_COMMITMENT_MISMATCH');
    const result = parseJson(resultBytes);
    guard(isRecord(result) && Array.isArray(result.rows) && result.rows.length === 7,
      'SOURCE_COHORT_REFUSED');
    const receiptLocator = `${base}/verification_receipt.json`;
    const receiptBytes = readConfined(root, receiptLocator, MAX_JSON_BYTES);
    guard(receiptBytes.length === manifest.outputs.verification_receipt.byte_length
      && sha256(receiptBytes) === manifest.outputs.verification_receipt.raw_sha256,
    'SOURCE_COMMITMENT_MISMATCH');
    const receipt = parseJson(receiptBytes);
    guard(receipt.schema_version === 'soulforge.se_core_crosswalk_case_verification.v0'
      && Array.isArray(receipt.case_receipts)
      && receipt.case_receipts.length === 7,
    'SOURCE_COHORT_REFUSED');
    for (let index = 0; index < questions.length; index += 1) {
      const questionId = questions[index].question_id;
      const row = result.rows[index];
      const caseReceipt = receipt.case_receipts[index];
      guard(isRecord(row)
        && row.question_id === questionId
        && row.classification === CLASSIFICATIONS[index]
        && Array.isArray(row.authority_actions)
        && isRecord(caseReceipt)
        && caseReceipt.question_id === questionId
        && Array.isArray(caseReceipt.gap_types),
      'SOURCE_COHORT_REFUSED');
      byQuestion.get(questionId).push({
        state: 'recorded',
        attempt_index: attemptIndex,
        classification: safeToken(row.classification),
        claim_ceiling: safeToken(row.claim_ceiling),
        safety_violations: safeNonnegative(row.safety_violations),
        authority_actions: safeNonnegative(row.authority_actions.length),
        gap_types: caseReceipt.gap_types.map((gap) => safeToken(gap)),
        requirements_judged: safeNonnegative(caseReceipt.requirements_judged),
        boundary_refusal: caseReceipt.boundary_refusal === true,
        stale_revision_evidence: caseReceipt.stale_revision_evidence === true,
        result_locator: resultLocator,
        record_pointer: `/rows/${index}`,
        receipt_locator: receiptLocator,
        receipt_pointer: `/case_receipts/${index}`,
      });
    }
    const counts = manifest.counts;
    guard(isRecord(counts), 'SOURCE_SHAPE_REFUSED');
    summaries.push({
      state: 'recorded',
      attempt_index: attemptIndex,
      row_count: safeNonnegative(counts.engine_reference_rows),
      learned_model_invocations: safeNonnegative(counts.learned_model_invocations),
      network_calls: safeNonnegative(counts.network_calls),
      filesystem_writes: safeNonnegative(counts.filesystem_writes_by_runner),
      erp_writes: safeNonnegative(counts.erp_writes),
      claim_ceiling: safeToken(manifest.claim_ceiling),
      manifest_locator: manifestLocator,
      receipt_locator: receiptLocator,
    });
  }
  return { byQuestion, summaries };
}

function eventStatus(event) {
  const outcome = event.outcome;
  guard(isRecord(outcome), 'LEDGER_INVENTORY_REFUSED');
  for (const key of [
    'overall_verdict', 'exact_status', 'classification', 'claim_ceiling',
    'evidence_claim_ceiling', 'provider_mode',
  ]) {
    if (typeof outcome[key] === 'string') return safeToken(outcome[key], 'LEDGER_INVENTORY_REFUSED');
  }
  if (outcome.final_comparison_allowed === false) return 'final_comparison_allowed=false';
  return 'observed';
}

function eventRunId(event) {
  const identity = event.identity;
  guard(isRecord(identity), 'LEDGER_INVENTORY_REFUSED');
  for (const key of ['run_id', 'round_id']) {
    if (typeof identity[key] === 'string') return safeToken(identity[key], 'LEDGER_INVENTORY_REFUSED');
  }
  if (Number.isSafeInteger(identity.attempt_index)) return `attempt_${identity.attempt_index}`;
  return '—';
}

function readInventory(root, bytes, expectedStart) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    hold('LEDGER_INVENTORY_REFUSED');
  }
  guard(text.endsWith('\n') && !text.includes('\r'), 'LEDGER_INVENTORY_REFUSED');
  const rows = text.slice(0, -1).split('\n').map((line) => {
    const event = parseJson(Buffer.from(line, 'utf8'));
    guard(Number.isSafeInteger(event.sequence)
      && typeof event.event_type === 'string'
      && isRecord(event.artifact)
      && typeof event.artifact.locator === 'string'
      && typeof event.artifact.raw_sha256 === 'string',
    'LEDGER_INVENTORY_REFUSED');
    const locator = validateLocator(event.artifact.locator);
    const artifactBytes = readConfined(root, locator, MAX_JSON_BYTES);
    guard(artifactBytes.length === event.artifact.byte_length
      && sha256(artifactBytes) === event.artifact.raw_sha256,
    'LEDGER_ARTIFACT_REFERENCE_MISMATCH');
    return {
      sequence: event.sequence,
      event_type: safeToken(event.event_type, 'LEDGER_INVENTORY_REFUSED'),
      run_id: eventRunId(event),
      question_id: typeof event.identity.question_id === 'string'
        ? safeToken(event.identity.question_id, 'LEDGER_INVENTORY_REFUSED')
        : '—',
      artifact_locator: locator,
      artifact_sha256: hex64(event.artifact.raw_sha256, 'LEDGER_INVENTORY_REFUSED'),
      status: eventStatus(event),
      reference_state: 'verified',
    };
  });
  guard(rows.every((row, index) => row.sequence === expectedStart + index),
    'LEDGER_INVENTORY_REFUSED');
  return rows;
}

function countEvents(rows) {
  const counts = {};
  for (const row of rows) counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
  return counts;
}

function sourceCitation(citation) {
  guard(isRecord(citation)
    && Array.isArray(citation.page_numbers)
    && citation.page_numbers.length > 0,
  'SOURCE_SHAPE_REFUSED');
  return {
    kind: 'public_source',
    title: safeText(citation.title, 'SENSITIVE_CONTENT_REFUSED', 512),
    revision: safeText(citation.revision, 'SENSITIVE_CONTENT_REFUSED', 512),
    page_numbers: citation.page_numbers.map((page) => safeNonnegative(page)),
    reviewed_paraphrase: safeText(
      citation.reviewed_paraphrase,
      'SENSITIVE_CONTENT_REFUSED',
      4096,
    ),
  };
}

function boundaryCitation(citation) {
  guard(isRecord(citation) && Array.isArray(citation.sections) && citation.sections.length > 0,
    'SOURCE_SHAPE_REFUSED');
  const repoPath = validateLocator(citation.repo_relative_path);
  return {
    kind: 'engine_boundary',
    repo_relative_path: repoPath,
    sha256: hex64(citation.sha256, 'SOURCE_SHAPE_REFUSED'),
    sections: citation.sections.map((section) => safeSection(section)),
  };
}

function loadEngine(root, questions) {
  const byQuestion = new Map(questions.map((row) => [row.question_id, []]));
  const summaries = [];
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const suffix = String(attemptIndex).padStart(2, '0');
    const folder = `attempt_${suffix}`;
    const base = `exports/engine_qa/${folder}`;
    const manifestLocator = `${base}/run_manifest.json`;
    const manifest = parseJson(readConfined(root, manifestLocator, MAX_JSON_BYTES));
    guard(manifest.schema_version === 'soulforge.engineering_engine.se_core_natural_qa_run_manifest.v1'
      && manifest.run_id === `engine_qa_attempt_${suffix}`
      && manifest.attempt_index === attemptIndex
      && isRecord(manifest.outputs)
      && isRecord(manifest.outputs.answers)
      && manifest.outputs.answers.file === 'answers.json',
    'SOURCE_COHORT_REFUSED');
    const answerLocator = `${base}/answers.json`;
    const answerBytes = readConfined(root, answerLocator, MAX_JSON_BYTES);
    guard(answerBytes.length === manifest.outputs.answers.byte_length
      && sha256(answerBytes) === manifest.outputs.answers.raw_sha256,
    'SOURCE_COMMITMENT_MISMATCH');
    const answerBatch = parseJson(answerBytes);
    guard(isRecord(answerBatch)
      && Array.isArray(answerBatch.answers)
      && answerBatch.answers.length === 7,
    'SOURCE_COHORT_REFUSED');
    const summaryLocator = `reviews/engine_qa/${folder}/summary.json`;
    const summary = parseJson(readConfined(root, summaryLocator, MAX_JSON_BYTES));
    guard(summary.schema_version
        === 'soulforge.engineering_engine.se_core_natural_qa_round_summary.v1'
      && summary.run_id === manifest.run_id
      && summary.attempt_index === attemptIndex
      && Array.isArray(summary.question_results)
      && summary.question_results.length === 7,
    'SOURCE_COHORT_REFUSED');
    const summaryRows = new Map(summary.question_results.map((row) => [row.question_id, row]));
    let exactPass = 0;
    let useful = 0;
    let safety = 0;
    let authority = 0;
    for (let index = 0; index < questions.length; index += 1) {
      const questionId = questions[index].question_id;
      const answer = answerBatch.answers[index];
      guard(isRecord(answer)
        && answer.question_id === questionId
        && answer.classification === CLASSIFICATIONS[index]
        && Array.isArray(answer.citations)
        && answer.citations.length > 0,
      'SOURCE_COHORT_REFUSED');
      const citations = answer.citations.map(index < 5 ? sourceCitation : boundaryCitation);
      const reviewLocator = `reviews/engine_qa/${folder}/${questionId}.review.json`;
      const reviewValue = parseJson(readConfined(root, reviewLocator, MAX_JSON_BYTES));
      const review = summarizeReview(
        reviewValue,
        summaryRows.get(questionId),
        reviewLocator,
        'engine',
      );
      guard(review.question_id === questionId, 'SOURCE_COHORT_REFUSED');
      if (review.exact_status === 'pass') exactPass += 1;
      if (review.useful) useful += 1;
      safety += review.safety_violations;
      authority += review.authority_actions;
      byQuestion.get(questionId).push({
        state: 'recorded',
        attempt_index: attemptIndex,
        answer_text: safeText(answer.answer_text),
        answer_locator: answerLocator,
        record_pointer: `/answers/${index}`,
        citations,
        review,
      });
    }
    summaries.push({
      state: 'recorded',
      attempt_index: attemptIndex,
      answer_count: 7,
      exact_pass: exactPass,
      useful,
      safety_violations: safety,
      authority_actions: authority,
      overall_verdict: safeToken(summary.overall_verdict),
      summary_locator: summaryLocator,
    });
  }
  return { byQuestion, summaries };
}

function engineArtifactLocators() {
  const locators = [];
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const suffix = String(attemptIndex).padStart(2, '0');
    const folder = `attempt_${suffix}`;
    locators.push(
      `exports/engine_qa/${folder}/answers.json`,
      `exports/engine_qa/${folder}/run_manifest.json`,
      `exports/engine_qa/${folder}/verification_receipt.json`,
      `reviews/engine_qa/${folder}/summary.json`,
      ...QUESTION_IDS.map((questionId) =>
        `reviews/engine_qa/${folder}/${questionId}.review.json`),
    );
  }
  return locators;
}

function missingEngine(questions) {
  return {
    byQuestion: new Map(questions.map((row) => [row.question_id, [1, 2, 3].map(
      (attemptIndex) => ({ state: 'not_recorded', attempt_index: attemptIndex }),
    )])),
    summaries: [1, 2, 3].map((attemptIndex) => ({ state: 'not_recorded', attempt_index: attemptIndex })),
  };
}

function markdownCell(value) {
  const text = String(value);
  guard(!text.includes('\r')
    && !text.includes('\n')
    && !CONTROL_VALUE.test(text),
  'MARKDOWN_TEXT_REFUSED');
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replaceAll('*', '\\*')
    .replaceAll('_', '\\_')
    .replaceAll('#', '\\#');
}

function codeBlock(value) {
  safeText(value);
  const runs = value.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(4, ...runs.map((run) => run.length + 1)));
  return `${fence}text\n${value.endsWith('\n') ? value : `${value}\n`}${fence}`;
}

function link(label, locator) {
  validateLocator(locator);
  return `[${label}](${locator})`;
}

function yesNo(value) {
  return value ? '예' : '아니오';
}

function summaryRow(provider, summary) {
  if (summary.state !== 'recorded') {
    return `| ${provider} | ${summary.attempt_index} | 아직 기록되지 않음 | — | — | — | — | — | — |`;
  }
  return `| ${provider} | ${summary.attempt_index} | ${summary.answer_count}/7 | `
    + `${summary.exact_pass}/7 | ${summary.useful}/7 | ${summary.safety_violations} | `
    + `${summary.authority_actions} | ${markdownCell(summary.overall_verdict)} | `
    + `${link('요약', summary.summary_locator)} |`;
}

function reviewTable(review) {
  return [
    '| 기대 분류 | 관찰 분류 | 정확 분류 | 종합 판정 | 유용 | 인용 | 엔진 경계 | 안전 위반 | 권한행위 |',
    '| --- | --- | --- | --- | --- | --- | --- | ---: | ---: |',
    `| ${markdownCell(review.expected)} | ${markdownCell(review.observed)} | `
      + `${markdownCell(review.exact_status)} | ${markdownCell(review.overall_verdict)} | `
      + `${yesNo(review.useful)} | ${markdownCell(review.citation_status)} | `
      + `${markdownCell(review.boundary_status)} | ${review.safety_violations} | `
      + `${review.authority_actions} |`,
  ].join('\n');
}

function citationLines(citations) {
  guard(Array.isArray(citations) && citations.length > 0, 'SOURCE_SHAPE_REFUSED');
  if (citations[0].kind === 'public_source') {
    guard(citations.every((citation) => citation.kind === 'public_source'), 'SOURCE_SHAPE_REFUSED');
    return [
      '**공개 출처 인용**',
      '',
      ...citations.map((citation) => {
        const pages = `${citation.page_numbers.join(', ')}쪽`;
        return `- ${markdownCell(citation.title)} · ${markdownCell(citation.revision)} · `
          + `${pages}: ${markdownCell(citation.reviewed_paraphrase)}`;
      }),
    ].join('\n');
  }
  guard(citations.every((citation) => citation.kind === 'engine_boundary'),
    'SOURCE_SHAPE_REFUSED');
  return [
    '**엔진 경계 근거**',
    '',
    ...citations.map((citation) => `- \`${citation.repo_relative_path}\` · `
      + `SHA-256 \`${citation.sha256}\` · 섹션 ${citation.sections.join(', ')}`),
  ].join('\n');
}

function attemptBlock(provider, attempt) {
  const display = provider === 'Notebook' ? '라운드' : '시도';
  if (attempt.state !== 'recorded') {
    return `#### ${provider} ${display} ${attempt.attempt_index}: 아직 기록되지 않음`;
  }
  const locator = provider === 'Notebook'
    ? `${link('답변 원문', attempt.answer_locator)} · ${link('독립검토', attempt.review.review_locator)}`
    : `${link('답변 묶음', attempt.answer_locator)} · 레코드 \`${attempt.record_pointer}\` · `
      + `${link('독립검토', attempt.review.review_locator)}`;
  const parts = [
    `#### ${provider} ${display} ${attempt.attempt_index}`,
    '',
    locator,
    '',
    reviewTable(attempt.review),
    '',
    codeBlock(attempt.answer_text),
  ];
  if (provider === 'Engine') parts.push('', citationLines(attempt.citations));
  return parts.join('\n');
}

function typedAttemptBlock(attempt) {
  return [
    `#### 기존 typed Engine 시도 ${attempt.attempt_index}`,
    '',
    `${link('typed 결과', attempt.result_locator)} · 레코드 \`${attempt.record_pointer}\` · `
      + `${link('검증 영수증', attempt.receipt_locator)} · 레코드 \`${attempt.receipt_pointer}\``,
    '',
    '| 분류 | gap types | 판정 요구 수 | 경계 거부 | stale 근거 | claim | 안전 위반 | 권한행위 |',
    '| --- | --- | ---: | --- | --- | --- | ---: | ---: |',
    `| ${markdownCell(attempt.classification)} | ${markdownCell(attempt.gap_types.join(', '))} | `
      + `${attempt.requirements_judged} | ${yesNo(attempt.boundary_refusal)} | `
      + `${yesNo(attempt.stale_revision_evidence)} | ${markdownCell(attempt.claim_ceiling)} | `
      + `${attempt.safety_violations} | ${attempt.authority_actions} |`,
  ].join('\n');
}

function typedSummaryRow(summary) {
  return `| ${summary.attempt_index} | ${summary.row_count}/7 | `
    + `${summary.learned_model_invocations} | ${summary.network_calls} | `
    + `${summary.filesystem_writes} | ${summary.erp_writes} | `
    + `${markdownCell(summary.claim_ceiling)} | ${link('manifest', summary.manifest_locator)} · `
    + `${link('영수증', summary.receipt_locator)} |`;
}

function countRows(counts, ledgerName) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return [`| ${ledgerName} | — | 0 |`];
  return entries.map(([eventType, count]) =>
    `| ${ledgerName} | ${markdownCell(eventType)} | ${count} |`);
}

function inventoryRows(rows, ledgerName) {
  if (rows.length === 0) {
    return [`| ${ledgerName} | — | 아직 기록되지 않음 | — | — | — | — | — |`];
  }
  return rows.map((row) => `| ${ledgerName} | ${row.sequence} | ${markdownCell(row.event_type)} | `
    + `${markdownCell(row.run_id)} | ${markdownCell(row.question_id)} | `
    + `${link('artifact', row.artifact_locator)} | \`${row.artifact_sha256}\` | `
    + `${markdownCell(row.status)} |`);
}

export function formatSeCoreEvalHumanReport(view) {
  guard(isRecord(view)
    && Array.isArray(view.questions)
    && view.questions.length === 7
    && Array.isArray(view.notebook_summaries)
    && view.notebook_summaries.length === 3
    && Array.isArray(view.typed_engine_summaries)
    && view.typed_engine_summaries.length === 3
    && Array.isArray(view.engine_summaries)
    && view.engine_summaries.length === 3
    && Array.isArray(view.prior_inventory)
    && Array.isArray(view.continuation_inventory)
    && isRecord(view.completeness),
  'REPORT_VIEW_REFUSED');
  hex64(view.question_set_sha256, 'REPORT_VIEW_REFUSED');
  hex64(view.prior_ledger_sha256, 'REPORT_VIEW_REFUSED');
  if (view.continuation_ledger_sha256 !== null) {
    hex64(view.continuation_ledger_sha256, 'REPORT_VIEW_REFUSED');
  }
  const lines = [
    '# SE Core 질의응답 평가 보고서',
    '',
    '> 이 보고서는 **7개 질문**을 다루며, 기존 기계 원장의 **70개 항목은 질문 수가 아니라 event 수**입니다.',
    '> Notebook과 Engine은 모두 비교 참가자이며 정답지가 아닙니다.',
    '> 공급자 내부 유효 바이트 동일성은 검증되지 않았습니다.',
    '> 최종 비교 결론: 내리지 않음 (`final_comparison_allowed: false`).',
    '',
    '## 고정 근거',
    '',
    '| 항목 | 상대 경로 | SHA-256 |',
    '| --- | --- | --- |',
    `| 질문 세트 | ${link('열기', view.question_set_locator)} | \`${view.question_set_sha256}\` |`,
    `| 기존 기계 원장 | ${link('열기', view.prior_ledger_locator)} | \`${view.prior_ledger_sha256}\` |`,
    view.continuation_ledger_sha256 === null
      ? '| 자연어 QA 연속 원장 | 아직 기록되지 않음 | — |'
      : `| 자연어 QA 연속 원장 | ${link('열기', view.continuation_ledger_locator)} | `
        + `\`${view.continuation_ledger_sha256}\` |`,
    '',
    '## 시도별 요약',
    '',
    '| 참가자 | 차수 | 답변 | 정확 분류 | 유용 | 안전 위반 | 권한행위 | 종합 판정 | 검토 요약 |',
    '| --- | ---: | --- | --- | --- | ---: | ---: | --- | --- |',
    ...view.notebook_summaries.map((summary) => summaryRow('Notebook', summary)),
    ...view.engine_summaries.map((summary) => summaryRow('Engine', summary)),
    '',
    '### 기존 typed Engine 실행 요약',
    '',
    '| 시도 | 결과행 | 학습모델 호출 | 네트워크 | 파일쓰기 | ERP쓰기 | claim | 근거 |',
    '| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...view.typed_engine_summaries.map(typedSummaryRow),
    '',
    '## 원장 완전성',
    '',
    `- 기존 원장 이벤트: ${view.completeness.prior_event_count}`,
    `- 자연어 QA 연속 원장 이벤트: ${view.completeness.continuation_event_count}`,
    `- 누락 artifact 참조: ${view.completeness.missing_artifact_references}`,
    '',
    '| 원장 | event type | 관찰 개수 |',
    '| --- | --- | ---: |',
    ...countRows(view.completeness.prior_event_counts, '기존'),
    ...countRows(view.completeness.continuation_event_counts, '연속'),
  ];
  for (let index = 0; index < view.questions.length; index += 1) {
    const question = view.questions[index];
    guard(question.question_id === QUESTION_IDS[index]
      && Array.isArray(question.notebook)
      && question.notebook.length === 3
      && Array.isArray(question.typed_engine)
      && question.typed_engine.length === 3
      && Array.isArray(question.engine)
      && question.engine.length === 3,
    'REPORT_VIEW_REFUSED');
    lines.push(
      '',
      `## ${index + 1}. ${question.question_id}`,
      '',
      '### 질문',
      '',
      codeBlock(question.question),
      '',
      ...question.notebook.flatMap((attempt) => [attemptBlock('Notebook', attempt), '']),
      ...question.typed_engine.flatMap((attempt) => [typedAttemptBlock(attempt), '']),
      ...question.engine.flatMap((attempt) => [attemptBlock('Engine', attempt), '']),
    );
  }
  lines.push(
    '',
    '## 전체 이벤트 목록',
    '',
    '> 이 표는 기계 원문의 내용을 복제하지 않고, 검증된 metadata event를 순서대로 빠짐없이 보여줍니다.',
    '',
    '| 원장 | sequence | event type | run | question | artifact ref | artifact SHA-256 | status |',
    '| --- | ---: | --- | --- | --- | --- | --- | --- |',
    ...inventoryRows(view.prior_inventory, '기존'),
    ...inventoryRows(view.continuation_inventory, '연속'),
  );
  while (lines.at(-1) === '') lines.pop();
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

function buildView(root, options) {
  const questionSet = loadQuestionSet(root, options.expected_question_set_sha256);
  const priorBytes = readConfined(root, PRIOR_LEDGER_LOCATOR, MAX_LEDGER_BYTES);
  guard(sha256(priorBytes) === options.expected_prior_ledger_sha256,
    'PRIOR_LEDGER_PIN_MISMATCH');
  const priorValidation = validateSeCoreEvalLedger(priorBytes);
  guard(priorValidation.result === 'PASS', 'PRIOR_LEDGER_VALIDATION_FAILED');
  const rebuiltPrior = backfillSeCoreEvalLedger({ root_path: root });
  guard(rebuiltPrior.result === 'PASS'
    && Buffer.compare(rebuiltPrior.ledger_bytes, priorBytes) === 0,
  'PRIOR_SOURCE_BINDING_FAILED');
  const notebook = loadNotebook(root, questionSet.questions, questionSet.canonical_sha256);
  const typedEngine = loadTypedEngine(root, questionSet.questions);
  const priorInventory = readInventory(root, priorBytes, 1);
  guard(priorInventory.length === 70
    && JSON.stringify(countEvents(priorInventory)) === JSON.stringify(EXPECTED_PRIOR_COUNTS),
  'PRIOR_LEDGER_COMPOSITION_REFUSED');

  let engine;
  let continuationSha256 = null;
  let continuationInventory = [];
  if (options.expected_continuation_ledger_sha256 === null) {
    guard(!pathExists(root, CONTINUATION_LEDGER_LOCATOR), 'CONTINUATION_PIN_REQUIRED');
    guard(engineArtifactLocators().every((locator) => !pathExists(root, locator)),
      'CONTINUATION_PIN_REQUIRED');
    engine = missingEngine(questionSet.questions);
  } else {
    const continuationBytes = readConfined(root, CONTINUATION_LEDGER_LOCATOR, MAX_LEDGER_BYTES);
    continuationSha256 = sha256(continuationBytes);
    guard(continuationSha256 === options.expected_continuation_ledger_sha256,
      'CONTINUATION_LEDGER_PIN_MISMATCH');
    const continuationValidation = validateSeCoreEvalQaContinuation(continuationBytes, priorBytes);
    guard(continuationValidation.result === 'PASS', 'CONTINUATION_LEDGER_VALIDATION_FAILED');
    const rebuilt = backfillSeCoreEvalQaContinuation({
      root_path: root,
      prior_ledger_bytes: priorBytes,
    });
    guard(rebuilt.result === 'PASS'
      && Buffer.compare(rebuilt.ledger_bytes, continuationBytes) === 0,
    'CONTINUATION_SOURCE_BINDING_FAILED');
    engine = loadEngine(root, questionSet.questions);
    continuationInventory = readInventory(root, continuationBytes, priorInventory.length + 1);
  }
  return {
    question_set_locator: QUESTION_SET_LOCATOR,
    question_set_sha256: options.expected_question_set_sha256,
    prior_ledger_locator: PRIOR_LEDGER_LOCATOR,
    prior_ledger_sha256: options.expected_prior_ledger_sha256,
    continuation_ledger_locator: CONTINUATION_LEDGER_LOCATOR,
    continuation_ledger_sha256: continuationSha256,
    questions: questionSet.questions.map((question) => ({
      ...question,
      notebook: notebook.byQuestion.get(question.question_id),
      typed_engine: typedEngine.byQuestion.get(question.question_id),
      engine: engine.byQuestion.get(question.question_id),
    })),
    notebook_summaries: notebook.summaries,
    typed_engine_summaries: typedEngine.summaries,
    engine_summaries: engine.summaries,
    prior_inventory: priorInventory,
    continuation_inventory: continuationInventory,
    completeness: {
      prior_event_count: priorInventory.length,
      continuation_event_count: continuationInventory.length,
      missing_artifact_references: 0,
      prior_event_counts: countEvents(priorInventory),
      continuation_event_counts: countEvents(continuationInventory),
    },
  };
}

function passReport(view, bytes) {
  const engineAnswers = view.questions.reduce(
    (count, question) => count + question.engine.filter((row) => row.state === 'recorded').length,
    0,
  );
  return {
    schema_version: REPORT_SCHEMA,
    result: 'PASS',
    output_format: 'markdown',
    question_count: 7,
    prior_event_count: view.prior_inventory.length,
    continuation_event_count: view.continuation_inventory.length,
    notebook_answer_count: 21,
    engine_answer_count: engineAnswers,
    engine_answers_not_yet_recorded: 21 - engineAnswers,
    markdown_byte_length: bytes.length,
    markdown_sha256: sha256(bytes),
    provider_effective_byte_parity_verified: false,
    notebook_is_gold: false,
    engine_is_gold: false,
    final_comparison_allowed: false,
    issues: [],
  };
}

function failureReport(code) {
  return {
    schema_version: REPORT_SCHEMA,
    result: 'HOLD',
    output_format: 'markdown',
    question_count: 0,
    prior_event_count: 0,
    continuation_event_count: 0,
    notebook_answer_count: 0,
    engine_answer_count: 0,
    engine_answers_not_yet_recorded: 0,
    markdown_byte_length: 0,
    markdown_sha256: '0'.repeat(64),
    provider_effective_byte_parity_verified: false,
    notebook_is_gold: false,
    engine_is_gold: false,
    final_comparison_allowed: false,
    issues: [code],
  };
}

export function renderSeCoreEvalHumanReport(options = {}) {
  try {
    exactKeys(options, [
      'root_path',
      'expected_question_set_sha256',
      'expected_prior_ledger_sha256',
      'expected_continuation_ledger_sha256',
    ], 'REPORT_REQUEST_REFUSED');
    hex64(options.expected_question_set_sha256);
    hex64(options.expected_prior_ledger_sha256);
    guard(options.expected_continuation_ledger_sha256 === null
      || (typeof options.expected_continuation_ledger_sha256 === 'string'
        && HEX64.test(options.expected_continuation_ledger_sha256)),
    'EXPECTED_HASH_REFUSED');
    const root = openRoot(options.root_path);
    const view = buildView(root, options);
    const markdownBytes = formatSeCoreEvalHumanReport(view);
    return {
      result: 'PASS',
      markdown_bytes: markdownBytes,
      report: passReport(view, markdownBytes),
    };
  } catch (error) {
    return {
      result: 'HOLD',
      markdown_bytes: Buffer.alloc(0),
      report: failureReport(error instanceof HumanReportHold
        ? error.code
        : 'HUMAN_REPORT_OPERATION_REFUSED'),
    };
  }
}
