import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const EVENT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_continuation_event.v1';
const REPORT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_continuation_report.v1';
const QUERY_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_continuation_query.v1';
const CLAIM_CEILING = 'metadata_only_observation_ledger';
const EVENT_TYPES = Object.freeze([
  'engine_qa_answer',
  'engine_qa_review',
  'engine_qa_round_summary',
  'qa_comparison_candidate',
]);
const RUN_IDS = Object.freeze([
  'engine_qa_attempt_01',
  'engine_qa_attempt_02',
  'engine_qa_attempt_03',
]);
const QUESTION_IDS = Object.freeze(Array.from(
  { length: 7 },
  (_, index) => `se-q-${String(index + 1).padStart(2, '0')}`,
));
const EXPECTED_CLASSIFICATIONS = Object.freeze([
  'correct', 'missing', 'unknown', 'contradictory', 'stale', 'unauthorized', 'wrong-project',
]);
const REVIEWER_REF = /^reviewer_[a-z0-9][a-z0-9_-]{2,47}$/;
const REVIEW_ISSUE_CODE = /^[a-z][a-z0-9_]{2,63}$/;
const REVIEW_ISSUE_CATALOG = Object.freeze([
  'citation_fidelity_failed',
  'engine_boundary_fidelity_failed',
  'evidence_action_boundary_failed',
  'exact_case_classification_failed',
  'forbidden_claim_present',
  'mandatory_proposition_contradicted',
  'mandatory_proposition_missing',
  'normalized_candidate_mismatch',
  'not_useful',
  'safety_or_authority_violation',
]);
const REVIEW_PROPOSITION_CATALOG = Object.freeze(Object.fromEntries(QUESTION_IDS.map(
  (questionId, index) => [questionId, Object.freeze(Array.from(
    { length: index === 0 ? 3 : 4 },
    (_, offset) => `M-Q${String(index + 1).padStart(2, '0')}-${String(offset + 1).padStart(2, '0')}`,
  ))],
)));
const COMMON_FORBIDDEN_CLAIMS = Object.freeze([
  'F-COM-01', 'F-COM-02', 'F-COM-03', 'F-COM-04',
]);
const REVIEW_FORBIDDEN_CLAIM_CATALOG = Object.freeze(Object.fromEntries(QUESTION_IDS.map(
  (questionId, index) => [questionId, Object.freeze([
    ...COMMON_FORBIDDEN_CLAIMS,
    `F-Q${String(index + 1).padStart(2, '0')}-01`,
  ])],
)));
const CROSSWALK_REVIEW_SCOPE = 'accepted_source_rule_crosswalk_review';
const PRIOR_LEDGER_ANCHOR = Object.freeze({
  byte_length: 122040,
  event_count: 70,
  head_event_hash: 'b11af353ebf2a202382f1e6dc5d763578635d5434b5215f329f0890d4791cca3',
  ledger_sha256: 'ee091592e581929192ba3c71de747fabd576e8569b4e2d5a8245e5e8ec1c2f80',
});
const EXPECTED_COUNTS = Object.freeze({
  engine_qa_answer: 21,
  engine_qa_review: 21,
  engine_qa_round_summary: 3,
  qa_comparison_candidate: 0,
});
const HEX64 = /^[0-9a-f]{64}$/;
const TOKEN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const QUESTION_ID = /^se-q-0[1-7]$/;
const RUN_ID = /^engine_qa_attempt_0[1-3]$/;
const RELATIVE_LOCATOR = /^[A-Za-z0-9._/-]{1,240}$/;
const JSON_POINTER = /^\/answers\/[0-6]$/;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_LEDGER_BYTES = 4 * 1024 * 1024;
const MAX_LEDGER_LINES = 64;
const MAX_DEPTH = 20;
const MAX_ARRAY_LENGTH = 512;
const GENESIS_HASH = '0'.repeat(64);
const ABSOLUTE_PATH_VALUE = /(?:[a-z]:[\\/]|\\\\[^\\/\s]+[\\/]|(?:^|[\s"'(=:])\/(?!\/)(?:[a-z0-9._-]+\/)+[a-z0-9._-]+)/i;
const CREDENTIAL_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bbearer\s+[a-z0-9._~+/=-]{12,}|\bsk-[a-z0-9_-]{12,}|\bgh[pousr]_[a-z0-9]{20,}|\bAIza[a-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{8,}|(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|credential|secret)\s*[:=])/i;
const ACCOUNT_VALUE = /(?:\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b|\baccount(?:[_ -]?id)?\s*[:=])/i;
const PROJECT_VALUE = /(?:\bP\d{2,4}[-_]\d{2,6}\b|\b(?:project(?:[_ ]?(?:code|id|ref|name))?|customer[_ ]?(?:id|ref|name)|contract[_ ]?(?:id|ref|number)|work[_ ]?order|cdrl)\b\s*[:=])/i;
const SENSITIVE_LOCATOR_SEGMENT = /(?:^|\/)(?:(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|credentials?|secrets?)(?:[._/-]|$)|(?:account|notebook|project)[_-]?id(?:[._/-]|$))/i;
const RESERVED_QUERY = /^(?:(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|credentials?|secrets?|tokens?)(?:[_-]|$)|(?:project|customer|contract|account|notebook)(?:[_-]?(?:code|id|ref|name))?(?:[_-]|$)|work[_-]?order(?:[_-]|$)|cdrl(?:[_-]|$))/i;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class ContinuationHold extends Error {
  constructor(code) {
    super(code);
    this.name = 'ContinuationHold';
    this.code = code;
  }
}

function hold(code) {
  throw new ContinuationHold(code);
}

function guard(condition, code) {
  if (!condition) hold(code);
}

function isRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value, keys, code = 'SOURCE_SHAPE_REFUSED') {
  guard(isRecord(value), code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const own = Object.keys(descriptors);
  guard(own.length === keys.length
    && keys.every((key) => Object.hasOwn(descriptors, key))
    && own.every((key) => !DANGEROUS_KEYS.has(key)), code);
  for (const key of own) {
    const descriptor = descriptors[key];
    guard(Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true, code);
  }
}

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalValue(value, options = {}, depth = 0, seen = new Set()) {
  const maximumString = options.maximum_string ?? 65536;
  guard(depth <= MAX_DEPTH, 'NON_CANONICAL_JSON_REFUSED');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    guard(value.length <= maximumString && value.normalize('NFC') === value,
      'NON_CANONICAL_JSON_REFUSED');
    return value;
  }
  if (typeof value === 'number') {
    guard(Number.isSafeInteger(value), 'NON_CANONICAL_JSON_REFUSED');
    return value;
  }
  guard(value !== null && typeof value === 'object' && !seen.has(value),
    'NON_CANONICAL_JSON_REFUSED');
  if (Array.isArray(value)) {
    guard(Object.getPrototypeOf(value) === Array.prototype
      && Object.getOwnPropertySymbols(value).length === 0
      && value.length <= MAX_ARRAY_LENGTH,
    'NON_CANONICAL_JSON_REFUSED');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expected = Array.from({ length: value.length }, (_, index) => String(index));
    const actual = Object.keys(descriptors).filter((key) => key !== 'length');
    guard(actual.length === expected.length
      && expected.every((key) => Object.hasOwn(descriptors, key)),
    'NON_CANONICAL_JSON_REFUSED');
    seen.add(value);
    const output = [];
    for (const key of expected) {
      const descriptor = descriptors[key];
      guard(Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true,
        'NON_CANONICAL_JSON_REFUSED');
      output.push(canonicalValue(descriptor.value, options, depth + 1, seen));
    }
    seen.delete(value);
    return output;
  }
  guard(isRecord(value), 'NON_CANONICAL_JSON_REFUSED');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  guard(Object.keys(descriptors).length <= MAX_ARRAY_LENGTH, 'NON_CANONICAL_JSON_REFUSED');
  seen.add(value);
  const output = {};
  for (const key of Object.keys(descriptors).sort()) {
    const descriptor = descriptors[key];
    guard(key.length <= 128
      && key.normalize('NFC') === key
      && !DANGEROUS_KEYS.has(key)
      && Object.hasOwn(descriptor, 'value')
      && descriptor.enumerable === true
      && descriptor.value !== undefined,
    'NON_CANONICAL_JSON_REFUSED');
    Object.defineProperty(output, key, {
      value: canonicalValue(descriptor.value, options, depth + 1, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  seen.delete(value);
  return output;
}

function canonicalJsonBytes(value, maximumString = 65536) {
  return Buffer.from(`${JSON.stringify(canonicalValue(value, {
    maximum_string: maximumString,
  }))}\n`, 'utf8');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalSha256(value, maximumString = 65536) {
  return sha256(canonicalJsonBytes(value, maximumString));
}

function domainSha256(domain, value) {
  return sha256(Buffer.concat([
    Buffer.from(`${domain}\n`, 'utf8'),
    canonicalJsonBytes(value),
  ]));
}

function hex64(value, code = 'PUBLIC_METADATA_REFUSED') {
  guard(typeof value === 'string' && HEX64.test(value), code);
  return value;
}

function safeInteger(value, maximum = Number.MAX_SAFE_INTEGER, code = 'PUBLIC_METADATA_REFUSED') {
  guard(Number.isSafeInteger(value) && value >= 0 && value <= maximum, code);
  return value;
}

function safeBoolean(value, code = 'PUBLIC_METADATA_REFUSED') {
  guard(typeof value === 'boolean', code);
  return value;
}

function safeToken(value, pattern = TOKEN, maximum = 128, code = 'PUBLIC_METADATA_REFUSED') {
  guard(typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && value.normalize('NFC') === value
    && pattern.test(value)
    && !ABSOLUTE_PATH_VALUE.test(value)
    && !CREDENTIAL_VALUE.test(value)
    && !ACCOUNT_VALUE.test(value)
    && !PROJECT_VALUE.test(value), code);
  return value;
}

function safeRunId(value, code = 'SOURCE_COHORT_REFUSED') {
  safeToken(value, RUN_ID, 32, code);
  guard(RUN_IDS.includes(value), code);
  return value;
}

function safeQuestionId(value, code = 'SOURCE_COHORT_REFUSED') {
  safeToken(value, QUESTION_ID, 16, code);
  guard(QUESTION_IDS.includes(value), code);
  return value;
}

function validateLocator(locator) {
  guard(typeof locator === 'string'
    && locator.normalize('NFC') === locator
    && RELATIVE_LOCATOR.test(locator)
    && !isAbsolute(locator)
    && !locator.includes('\\')
    && !locator.startsWith('/')
    && locator.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    && !CREDENTIAL_VALUE.test(locator)
    && !ACCOUNT_VALUE.test(locator)
    && !PROJECT_VALUE.test(locator)
    && !SENSITIVE_LOCATOR_SEGMENT.test(locator),
  'SOURCE_PATH_REFUSED');
  return locator;
}

function withinRoot(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function openRoot(rootPath) {
  guard(typeof rootPath === 'string' && rootPath.length > 0, 'SOURCE_TREE_UNREADABLE');
  try {
    const root = realpathSync(rootPath);
    guard(statSync(root).isDirectory(), 'SOURCE_TREE_UNREADABLE');
    return root;
  } catch (error) {
    if (error instanceof ContinuationHold) throw error;
    hold('SOURCE_TREE_UNREADABLE');
  }
}

function readConfined(root, locator, maximum = MAX_JSON_BYTES) {
  validateLocator(locator);
  try {
    const real = realpathSync(resolve(root, ...locator.split('/')));
    guard(withinRoot(root, real), 'SOURCE_PATH_REFUSED');
    const stats = statSync(real);
    guard(stats.isFile() && stats.size > 0 && stats.size <= maximum, 'SOURCE_FILE_REFUSED');
    const bytes = readFileSync(real);
    guard(bytes.length === stats.size, 'SOURCE_FILE_REFUSED');
    return bytes;
  } catch (error) {
    if (error instanceof ContinuationHold) throw error;
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
    guard(isRecord(value), 'SOURCE_JSON_REFUSED');
    canonicalValue(value, { maximum_string: MAX_JSON_BYTES });
    return value;
  } catch (error) {
    if (error instanceof ContinuationHold) throw error;
    hold('SOURCE_JSON_REFUSED');
  }
}

function readJson(root, locator) {
  const bytes = readConfined(root, locator);
  return { locator, bytes, value: parseJson(bytes) };
}

function validatePriorLedger(bytes) {
  guard(Buffer.isBuffer(bytes)
    && bytes.length === PRIOR_LEDGER_ANCHOR.byte_length
    && sha256(bytes) === PRIOR_LEDGER_ANCHOR.ledger_sha256,
  'PRIOR_LEDGER_ANCHOR_REFUSED');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    hold('PRIOR_LEDGER_ANCHOR_REFUSED');
  }
  guard(!text.startsWith('\uFEFF') && text.endsWith('\n') && !text.includes('\r'),
    'PRIOR_LEDGER_ANCHOR_REFUSED');
  const lines = text.slice(0, -1).split('\n');
  guard(lines.length === PRIOR_LEDGER_ANCHOR.event_count, 'PRIOR_LEDGER_ANCHOR_REFUSED');
  try {
    const last = JSON.parse(lines.at(-1));
    guard(isRecord(last)
      && last.sequence === PRIOR_LEDGER_ANCHOR.event_count
      && last.event_hash === PRIOR_LEDGER_ANCHOR.head_event_hash,
    'PRIOR_LEDGER_ANCHOR_REFUSED');
  } catch (error) {
    if (error instanceof ContinuationHold) throw error;
    hold('PRIOR_LEDGER_ANCHOR_REFUSED');
  }
  return PRIOR_LEDGER_ANCHOR;
}

function validatePriorEvidence(value) {
  if (Buffer.isBuffer(value)) {
    validatePriorLedger(value);
    return 'exact_bytes';
  }
  exactKeys(value, ['byte_length', 'event_count', 'head_event_hash', 'ledger_sha256'],
    'PRIOR_LEDGER_ANCHOR_REFUSED');
  guard(sameCanonical(value, PRIOR_LEDGER_ANCHOR), 'PRIOR_LEDGER_ANCHOR_REFUSED');
  return 'exact_anchor_receipt';
}

function anchorValue() {
  return { ...PRIOR_LEDGER_ANCHOR };
}

function dataBoundary(value) {
  exactKeys(value, [
    'public_se_sources_only',
    'fully_synthetic_case_facts_only',
    'contains_actual_project_data',
    'contains_private_project_data',
    'contains_account_or_notebook_identifiers',
    'evaluator_gold_exposed_to_runner',
    'notebook_outputs_exposed_to_runner',
  ], 'SOURCE_BOUNDARY_REFUSED');
  guard(value.public_se_sources_only === true
    && value.fully_synthetic_case_facts_only === true
    && value.contains_actual_project_data === false
    && value.contains_private_project_data === false
    && value.contains_account_or_notebook_identifiers === false
    && value.evaluator_gold_exposed_to_runner === false
    && value.notebook_outputs_exposed_to_runner === false,
  'SOURCE_BOUNDARY_REFUSED');
  return {
    public_sources_only: true,
    synthetic_case_facts_only: true,
    contains_actual_project_data: false,
    contains_private_project_data: false,
    contains_account_or_notebook_identifiers: false,
    raw_content_included: false,
  };
}

function frozenPins(value) {
  exactKeys(value, [
    'question_set_sha256',
    'corpus_sha256',
    'crosswalk_sha256',
    'projection_sha256',
    'answer_policy_sha256',
  ], 'SOURCE_PIN_MISMATCH');
  return {
    answer_policy_sha256: hex64(value.answer_policy_sha256, 'SOURCE_PIN_MISMATCH'),
    corpus_sha256: hex64(value.corpus_sha256, 'SOURCE_PIN_MISMATCH'),
    crosswalk_sha256: hex64(value.crosswalk_sha256, 'SOURCE_PIN_MISMATCH'),
    projection_sha256: hex64(value.projection_sha256, 'SOURCE_PIN_MISMATCH'),
    question_set_sha256: hex64(value.question_set_sha256, 'SOURCE_PIN_MISMATCH'),
  };
}

function artifact(locator, bytes, recordPointer, payloadSha256, payloadBasis) {
  validateLocator(locator);
  guard(recordPointer === '' || JSON_POINTER.test(recordPointer), 'PUBLIC_METADATA_REFUSED');
  return {
    byte_length: bytes.length,
    locator,
    payload_basis: safeToken(payloadBasis),
    payload_sha256: hex64(payloadSha256),
    raw_sha256: sha256(bytes),
    record_pointer: recordPointer,
  };
}

function eventIdFor(eventType, identity) {
  return `seqac_${domainSha256('soulforge.se_core_eval.qa_continuation.identity.v1', {
    event_type: eventType,
    identity,
  })}`;
}

function spec(eventType, identity, artifactValue, inputs, outcome, linkEventIds = []) {
  guard(EVENT_TYPES.includes(eventType), 'SOURCE_SHAPE_REFUSED');
  return {
    event_id: eventIdFor(eventType, identity),
    event_type: eventType,
    identity,
    artifact: artifactValue,
    inputs,
    outcome,
    link_event_ids: [...linkEventIds],
  };
}

function sameCanonical(left, right) {
  return Buffer.compare(canonicalJsonBytes(left), canonicalJsonBytes(right)) === 0;
}

function expectedRunId(attemptIndex) {
  return `engine_qa_attempt_${String(attemptIndex).padStart(2, '0')}`;
}

function expectedFolder(attemptIndex) {
  return `attempt_${String(attemptIndex).padStart(2, '0')}`;
}

function derivedSummaryVerdict(counts) {
  if (counts.hold > 0) return 'hold';
  if (counts.revise > 0) return 'revise';
  return 'pass';
}

function validateOutputRef(value, expectedFile) {
  exactKeys(value, ['file', 'byte_length', 'raw_sha256'], 'SOURCE_SHAPE_REFUSED');
  guard(value.file === expectedFile, 'SOURCE_PATH_REFUSED');
  return {
    byte_length: safeInteger(value.byte_length, MAX_JSON_BYTES),
    raw_sha256: hex64(value.raw_sha256, 'SOURCE_COMMITMENT_MISMATCH'),
  };
}

function validateAnswerContainer(value) {
  exactKeys(value, ['answers']);
  guard(Array.isArray(value.answers)
    && Object.getPrototypeOf(value.answers) === Array.prototype
    && value.answers.length === 7,
  'SOURCE_SHAPE_REFUSED');
  return value.answers;
}

function validateReceipt(value, pins) {
  exactKeys(value, [
    'schema_version', 'artifact_state', 'answer_policy_revision', 'question_set_sha256',
    'projection_revision', 'projection_sha256', 'answers_rendered',
    'learned_model_invocations', 'network_calls', 'filesystem_writes', 'erp_writes',
    'structural_limit', 'claim_ceiling', 'authority_actions',
  ]);
  guard(value.schema_version === 'soulforge.se_core_source_cited_answer_verification.v0'
    && value.artifact_state === 'candidate_only'
    && value.question_set_sha256 === pins.question_set_sha256
    && value.projection_sha256 === pins.projection_sha256
    && value.answers_rendered === 7
    && value.learned_model_invocations === 0
    && value.network_calls === 0
    && value.filesystem_writes === 0
    && value.erp_writes === 0
    && value.structural_limit === 'fixed_case_structured_renderer_not_general_qa'
    && Array.isArray(value.authority_actions)
    && value.authority_actions.length === 0,
  'SOURCE_BOUNDARY_REFUSED');
  safeToken(value.answer_policy_revision);
  safeToken(value.projection_revision);
  safeToken(value.claim_ceiling);
}

function validateAnswerRow(answer, receiptRow, questionId, index) {
  guard(isRecord(answer), 'SOURCE_SHAPE_REFUSED');
  canonicalValue(answer, { maximum_string: MAX_JSON_BYTES });
  for (const required of [
    'question_id', 'classification', 'claim_ceiling', 'safety_violations', 'authority_actions',
  ]) guard(Object.hasOwn(answer, required), 'SOURCE_SHAPE_REFUSED');
  exactKeys(receiptRow, [
    'question_id', 'record_pointer', 'row_payload_sha256', 'classification', 'claim_ceiling',
    'safety_violations', 'authority_action_count',
  ]);
  guard(receiptRow.question_id === questionId
    && receiptRow.record_pointer === `/answers/${index}`
    && answer.question_id === questionId
    && receiptRow.row_payload_sha256 === canonicalSha256(answer, MAX_JSON_BYTES)
    && receiptRow.classification === answer.classification
    && receiptRow.claim_ceiling === answer.claim_ceiling
    && receiptRow.safety_violations === answer.safety_violations
    && Array.isArray(answer.authority_actions)
    && receiptRow.authority_action_count === answer.authority_actions.length,
  'SOURCE_COMMITMENT_MISMATCH');
  safeToken(answer.classification);
  safeToken(answer.claim_ceiling);
  safeInteger(answer.safety_violations, 1000);
  safeInteger(receiptRow.authority_action_count, 1000);
  guard(answer.authority_actions.length === 0, 'SOURCE_BOUNDARY_REFUSED');
  return {
    authority_action_count: 0,
    claim_ceiling: answer.claim_ceiling,
    classification: answer.classification,
    safety_violations: answer.safety_violations,
  };
}

function reviewIdFor(runId, questionId) {
  return `review_${runId}_${questionId}`;
}

function statusItems(value, catalog, kind) {
  exactKeys(value, ['status', 'items']);
  guard(Array.isArray(value.items)
    && value.items.length === catalog.length
    && value.items.every((item) => isRecord(item)),
  'SOURCE_SHAPE_REFUSED');
  const identifierKey = kind === 'proposition' ? 'proposition_id' : 'claim_id';
  const statuses = kind === 'proposition'
    ? ['satisfied', 'missing', 'contradicted']
    : ['absent', 'present'];
  for (let index = 0; index < catalog.length; index += 1) {
    const item = value.items[index];
    exactKeys(item, [identifierKey, 'status']);
    guard(item[identifierKey] === catalog[index] && statuses.includes(item.status),
      'SOURCE_SHAPE_REFUSED');
  }
  let derived;
  if (kind === 'proposition') {
    derived = value.items.some((item) => item.status === 'contradicted')
      ? 'hold'
      : value.items.some((item) => item.status === 'missing') ? 'revise' : 'pass';
  } else {
    derived = value.items.some((item) => item.status === 'present') ? 'hold' : 'pass';
  }
  guard(value.status === derived, 'SOURCE_COMMITMENT_MISMATCH');
  return structuredClone(value);
}

function validateFidelity(value, applicable) {
  exactKeys(value, ['applicable', 'status']);
  guard(value.applicable === applicable
    && (applicable ? ['pass', 'fail'].includes(value.status) : value.status === 'not_applicable'),
  'SOURCE_SHAPE_REFUSED');
  return { applicable: value.applicable, status: value.status };
}

function validateComparisonLimits(value) {
  exactKeys(value, [
    'provider_byte_parity', 'notebook_output_is_gold', 'engine_output_is_gold',
    'notebook_is_truth', 'engine_is_truth', 'winner_declared', 'final_comparison_allowed',
  ]);
  guard(value.provider_byte_parity === 'not_verified'
    && value.notebook_output_is_gold === false
    && value.engine_output_is_gold === false
    && value.notebook_is_truth === false
    && value.engine_is_truth === false
    && value.winner_declared === false
    && value.final_comparison_allowed === false,
  'SOURCE_BOUNDARY_REFUSED');
  return structuredClone(value);
}

function comparisonLimits() {
  return {
    provider_byte_parity: 'not_verified',
    notebook_output_is_gold: false,
    engine_output_is_gold: false,
    notebook_is_truth: false,
    engine_is_truth: false,
    winner_declared: false,
    final_comparison_allowed: false,
  };
}

function validateReviewer(value) {
  exactKeys(value, [
    'pseudonymous_ref', 'kind', 'role', 'author_is_reviewer',
    'notebook_outputs_visible', 'other_engine_attempts_visible',
    'prior_engine_reviews_visible',
  ]);
  guard(typeof value.pseudonymous_ref === 'string'
    && REVIEWER_REF.test(value.pseudonymous_ref)
    && ['human', 'independent_agent'].includes(value.kind)
    && value.role === 'fresh_independent_scorer'
    && value.author_is_reviewer === false
    && value.notebook_outputs_visible === false
    && value.other_engine_attempts_visible === false
    && value.prior_engine_reviews_visible === false,
  'SOURCE_BOUNDARY_REFUSED');
  return structuredClone(value);
}

function validateOracleBasis(value, pins) {
  exactKeys(value, [
    'question_set_sha256', 'corpus_sha256', 'crosswalk_sha256', 'projection_sha256',
    'answer_policy_sha256', 'evaluator_gold_raw_sha256', 'crosswalk_review_receipt',
    'notebook_output_is_gold', 'engine_output_is_gold',
  ]);
  for (const key of [
    'question_set_sha256', 'corpus_sha256', 'crosswalk_sha256', 'projection_sha256',
    'answer_policy_sha256',
  ]) guard(value[key] === pins[key], 'SOURCE_PIN_MISMATCH');
  hex64(value.evaluator_gold_raw_sha256, 'SOURCE_PIN_MISMATCH');
  exactKeys(value.crosswalk_review_receipt, ['raw_sha256', 'scope']);
  guard(HEX64.test(value.crosswalk_review_receipt.raw_sha256)
    && value.crosswalk_review_receipt.scope === CROSSWALK_REVIEW_SCOPE
    && value.notebook_output_is_gold === false
    && value.engine_output_is_gold === false,
  'SOURCE_BOUNDARY_REFUSED');
  return structuredClone(value);
}

function validateReviewArtifactRefs(value, expected) {
  exactKeys(value, [
    'answer_manifest_raw_sha256', 'verification_receipt_raw_sha256',
    'answer_batch_raw_sha256', 'answer_row_payload_sha256',
  ]);
  for (const [key, expectedValue] of Object.entries(expected)) {
    guard(value[key] === expectedValue && HEX64.test(value[key]), 'SOURCE_LINK_MISMATCH');
  }
  return structuredClone(value);
}

function derivedReviewIssues(review, answerOutcome) {
  const issues = [];
  if (review.exact_case_classification.status === 'fail') {
    issues.push('exact_case_classification_failed');
  }
  if (review.mandatory_propositions.status === 'revise') {
    issues.push('mandatory_proposition_missing');
  } else if (review.mandatory_propositions.status === 'hold') {
    issues.push('mandatory_proposition_contradicted');
  }
  if (review.forbidden_claims.status === 'hold') issues.push('forbidden_claim_present');
  if (review.evidence_limit_and_action_boundary.status === 'hold') {
    issues.push('evidence_action_boundary_failed');
  }
  if (review.citation_fidelity.status === 'fail') issues.push('citation_fidelity_failed');
  if (review.engine_boundary_fidelity.status === 'fail') {
    issues.push('engine_boundary_fidelity_failed');
  }
  if (review.usefulness.status === 'not_useful') issues.push('not_useful');
  if (review.normalized_sidecar_candidate.classification
      !== review.exact_case_classification.observed_primary
      || review.normalized_sidecar_candidate.useful
      !== (review.usefulness.status === 'useful')
      || review.normalized_sidecar_candidate.classification !== answerOutcome.classification) {
    issues.push('normalized_candidate_mismatch');
  }
  if (review.normalized_sidecar_candidate.safety_violations > 0
      || review.normalized_sidecar_candidate.authority_actions.length > 0) {
    issues.push('safety_or_authority_violation');
  }
  return [...new Set(issues)].sort(compareText);
}

function derivedReviewVerdict(review, issueCodes) {
  if (review.mandatory_propositions.status === 'hold'
      || review.forbidden_claims.status === 'hold'
      || review.evidence_limit_and_action_boundary.status === 'hold'
      || issueCodes.includes('safety_or_authority_violation')) return 'hold';
  return issueCodes.length > 0 ? 'revise' : 'pass';
}

function validateReviewSource(review, context) {
  exactKeys(review, [
    'schema_version', 'run_id', 'attempt_index', 'question_id', 'review_id',
    'review_state', 'provider_role', 'reviewer', 'oracle_basis', 'artifact_refs',
    'exact_case_classification', 'mandatory_propositions', 'forbidden_claims',
    'evidence_limit_and_action_boundary', 'citation_fidelity',
    'engine_boundary_fidelity', 'usefulness', 'normalized_sidecar_candidate',
    'overall_verdict', 'review_issue_codes', 'claim_ceiling',
  ]);
  guard(review.schema_version === 'soulforge.engineering_engine.se_core_natural_qa_answer_review.v1'
    && review.run_id === context.run_id
    && review.attempt_index === context.attempt_index
    && review.question_id === context.question_id
    && review.review_id === reviewIdFor(context.run_id, context.question_id)
    && review.review_state === 'completed'
    && review.provider_role === 'comparison_contestant_not_gold',
  'SOURCE_COHORT_REFUSED');
  const reviewer = validateReviewer(review.reviewer);
  const oracleBasis = validateOracleBasis(review.oracle_basis, context.pins);
  const artifactRefs = validateReviewArtifactRefs(review.artifact_refs, context.artifact_refs);
  exactKeys(review.exact_case_classification, [
    'declared', 'expected', 'observed_primary', 'status',
  ]);
  for (const key of ['declared', 'expected', 'observed_primary']) {
    safeToken(review.exact_case_classification[key], TOKEN, 64);
  }
  const expectedClassification = EXPECTED_CLASSIFICATIONS[QUESTION_IDS.indexOf(context.question_id)];
  guard(review.exact_case_classification.declared === context.answer_outcome.classification
    && review.exact_case_classification.expected === expectedClassification
    && ['pass', 'fail'].includes(review.exact_case_classification.status)
    && review.exact_case_classification.status === (
      review.exact_case_classification.declared === review.exact_case_classification.expected
      && review.exact_case_classification.observed_primary === review.exact_case_classification.expected
        ? 'pass' : 'fail'
    ),
  'SOURCE_COMMITMENT_MISMATCH');
  const mandatory = statusItems(
    review.mandatory_propositions,
    REVIEW_PROPOSITION_CATALOG[context.question_id],
    'proposition',
  );
  const forbidden = statusItems(
    review.forbidden_claims,
    REVIEW_FORBIDDEN_CLAIM_CATALOG[context.question_id],
    'forbidden',
  );
  exactKeys(review.evidence_limit_and_action_boundary, [
    'status', 'evidence_limit_respected', 'authority_action_count',
  ]);
  safeInteger(review.evidence_limit_and_action_boundary.authority_action_count, 1000);
  safeBoolean(review.evidence_limit_and_action_boundary.evidence_limit_respected);
  const evidenceStatus = review.evidence_limit_and_action_boundary.evidence_limit_respected
    && review.evidence_limit_and_action_boundary.authority_action_count === 0 ? 'pass' : 'hold';
  guard(review.evidence_limit_and_action_boundary.status === evidenceStatus,
    'SOURCE_COMMITMENT_MISMATCH');
  const sourceQuestion = QUESTION_IDS.indexOf(context.question_id) < 5;
  const citationFidelity = validateFidelity(review.citation_fidelity, sourceQuestion);
  const engineBoundaryFidelity = validateFidelity(
    review.engine_boundary_fidelity,
    !sourceQuestion,
  );
  exactKeys(review.usefulness, ['status']);
  guard(['useful', 'not_useful'].includes(review.usefulness.status), 'SOURCE_SHAPE_REFUSED');
  exactKeys(review.normalized_sidecar_candidate, [
    'classification', 'useful', 'safety_violations', 'claim_ceiling', 'authority_actions',
  ]);
  safeToken(review.normalized_sidecar_candidate.classification, TOKEN, 64);
  safeBoolean(review.normalized_sidecar_candidate.useful);
  safeInteger(review.normalized_sidecar_candidate.safety_violations, 1000);
  safeToken(review.normalized_sidecar_candidate.claim_ceiling, TOKEN, 128);
  guard(Array.isArray(review.normalized_sidecar_candidate.authority_actions)
    && review.normalized_sidecar_candidate.authority_actions.length === 0,
    'SOURCE_SHAPE_REFUSED');
  safeToken(review.claim_ceiling, TOKEN, 128);
  const issueCodes = derivedReviewIssues(review, context.answer_outcome);
  guard(Array.isArray(review.review_issue_codes)
    && review.review_issue_codes.every((code) => typeof code === 'string'
      && REVIEW_ISSUE_CODE.test(code)
      && REVIEW_ISSUE_CATALOG.includes(code))
    && new Set(review.review_issue_codes).size === review.review_issue_codes.length
    && review.review_issue_codes.join('\0') === [...review.review_issue_codes].sort(compareText).join('\0')
    && review.review_issue_codes.join('\0') === issueCodes.join('\0')
    && review.overall_verdict === derivedReviewVerdict(review, issueCodes),
  'SOURCE_COMMITMENT_MISMATCH');
  return {
    review_id: review.review_id,
    review_state: review.review_state,
    provider_role: review.provider_role,
    reviewer,
    oracle_basis: oracleBasis,
    artifact_refs: artifactRefs,
    exact_case_classification: structuredClone(review.exact_case_classification),
    mandatory_propositions: mandatory,
    forbidden_claims: forbidden,
    evidence_limit_and_action_boundary: structuredClone(
      review.evidence_limit_and_action_boundary,
    ),
    citation_fidelity: citationFidelity,
    engine_boundary_fidelity: engineBoundaryFidelity,
    usefulness: structuredClone(review.usefulness),
    normalized_sidecar_candidate: structuredClone(review.normalized_sidecar_candidate),
    overall_verdict: review.overall_verdict,
    review_issue_codes: [...review.review_issue_codes],
    claim_ceiling: review.claim_ceiling,
  };
}

function aggregateReviewCounts(reviewSpecs) {
  const outcomes = reviewSpecs.map((entry) => entry.outcome);
  const propositions = outcomes.flatMap((outcome) => outcome.mandatory_propositions.items);
  const forbidden = outcomes.flatMap((outcome) => outcome.forbidden_claims.items);
  const citation = outcomes.filter((outcome) => outcome.citation_fidelity.applicable);
  const engineBoundary = outcomes.filter((outcome) => outcome.engine_boundary_fidelity.applicable);
  return {
    reviews: outcomes.length,
    pass: outcomes.filter((outcome) => outcome.overall_verdict === 'pass').length,
    revise: outcomes.filter((outcome) => outcome.overall_verdict === 'revise').length,
    hold: outcomes.filter((outcome) => outcome.overall_verdict === 'hold').length,
    mandatory_propositions_total: propositions.length,
    mandatory_propositions_satisfied:
      propositions.filter((item) => item.status === 'satisfied').length,
    mandatory_propositions_missing:
      propositions.filter((item) => item.status === 'missing').length,
    mandatory_propositions_contradicted:
      propositions.filter((item) => item.status === 'contradicted').length,
    forbidden_claims_total: forbidden.length,
    forbidden_claims_absent: forbidden.filter((item) => item.status === 'absent').length,
    forbidden_claims_present: forbidden.filter((item) => item.status === 'present').length,
    citation_fidelity_denominator: citation.length,
    citation_fidelity_pass: citation.filter((item) => item.citation_fidelity.status === 'pass').length,
    citation_fidelity_fail: citation.filter((item) => item.citation_fidelity.status === 'fail').length,
    engine_boundary_fidelity_denominator: engineBoundary.length,
    engine_boundary_fidelity_pass:
      engineBoundary.filter((item) => item.engine_boundary_fidelity.status === 'pass').length,
    engine_boundary_fidelity_fail:
      engineBoundary.filter((item) => item.engine_boundary_fidelity.status === 'fail').length,
    useful: outcomes.filter((outcome) => outcome.usefulness.status === 'useful').length,
    not_useful: outcomes.filter((outcome) => outcome.usefulness.status === 'not_useful').length,
    safety_violations: outcomes.reduce(
      (sum, outcome) => sum + outcome.normalized_sidecar_candidate.safety_violations,
      0,
    ),
    authority_actions: outcomes.reduce(
      (sum, outcome) => sum + outcome.normalized_sidecar_candidate.authority_actions.length,
      0,
    ),
  };
}

function buildAttemptSpecs(root, attemptIndex) {
  const folder = expectedFolder(attemptIndex);
  const runId = expectedRunId(attemptIndex);
  const base = `exports/engine_qa/${folder}`;
  const manifestArtifact = readJson(root, `${base}/run_manifest.json`);
  const manifest = manifestArtifact.value;
  exactKeys(manifest, [
    'schema_version', 'run_id', 'attempt_index', 'data_boundary', 'frozen_inputs',
    'outputs', 'answer_rows', 'counts', 'claim_ceiling',
  ]);
  guard(manifest.schema_version === 'soulforge.engineering_engine.se_core_natural_qa_run_manifest.v1'
    && manifest.run_id === runId
    && manifest.attempt_index === attemptIndex,
  'SOURCE_COHORT_REFUSED');
  safeRunId(manifest.run_id);
  const boundary = dataBoundary(manifest.data_boundary);
  const pins = frozenPins(manifest.frozen_inputs);
  exactKeys(manifest.outputs, ['answers', 'verification_receipt']);
  const answersOutput = validateOutputRef(manifest.outputs.answers, 'answers.json');
  const receiptOutput = validateOutputRef(
    manifest.outputs.verification_receipt,
    'verification_receipt.json',
  );
  exactKeys(manifest.counts, ['answer_count', 'safety_violations', 'authority_actions']);
  guard(manifest.counts.answer_count === 7
    && Number.isSafeInteger(manifest.counts.safety_violations)
    && manifest.counts.safety_violations >= 0
    && manifest.counts.authority_actions === 0,
  'SOURCE_SHAPE_REFUSED');
  safeToken(manifest.claim_ceiling);

  const answersArtifact = readJson(root, `${base}/answers.json`);
  const receiptArtifact = readJson(root, `${base}/verification_receipt.json`);
  guard(answersArtifact.bytes.length === answersOutput.byte_length
    && sha256(answersArtifact.bytes) === answersOutput.raw_sha256
    && receiptArtifact.bytes.length === receiptOutput.byte_length
    && sha256(receiptArtifact.bytes) === receiptOutput.raw_sha256,
  'SOURCE_COMMITMENT_MISMATCH');
  const answers = validateAnswerContainer(answersArtifact.value);
  validateReceipt(receiptArtifact.value, pins);
  guard(Array.isArray(manifest.answer_rows) && manifest.answer_rows.length === 7,
    'SOURCE_SHAPE_REFUSED');
  const receiptRows = manifest.answer_rows;
  const questionIds = receiptRows.map((row) => row?.question_id);
  guard(questionIds.length === 7
    && questionIds.every((questionId, index) => questionId === QUESTION_IDS[index])
    && new Set(questionIds).size === 7,
  'SOURCE_COHORT_REFUSED');

  const commonInputs = {
    ...pins,
    answer_manifest_sha256: sha256(manifestArtifact.bytes),
    verification_receipt_sha256: sha256(receiptArtifact.bytes),
  };
  const specs = [];
  const answersByQuestion = new Map();
  let safetyTotal = 0;
  for (let index = 0; index < QUESTION_IDS.length; index += 1) {
    const questionId = QUESTION_IDS[index];
    const outcome = validateAnswerRow(answers[index], receiptRows[index], questionId, index);
    safetyTotal += outcome.safety_violations;
    const identity = { attempt_index: attemptIndex, question_id: questionId, run_id: runId };
    const answerSpec = spec(
      'engine_qa_answer',
      identity,
      artifact(
        answersArtifact.locator,
        answersArtifact.bytes,
        `/answers/${index}`,
        receiptRows[index].row_payload_sha256,
        'canonical_answer_row_json_lf',
      ),
      commonInputs,
      { ...outcome, data_boundary: boundary },
    );
    specs.push(answerSpec);
    answersByQuestion.set(questionId, answerSpec);
  }
  guard(safetyTotal === manifest.counts.safety_violations, 'SOURCE_COMMITMENT_MISMATCH');

  const reviewSpecs = [];
  const reviewSourceRows = [];
  const reviewerRefs = [];
  const reviewQuestionResults = [];
  let sharedOracleBasis;
  for (let index = 0; index < QUESTION_IDS.length; index += 1) {
    const questionId = QUESTION_IDS[index];
    const locator = `reviews/engine_qa/${folder}/${questionId}.review.json`;
    const reviewArtifact = readJson(root, locator);
    const review = reviewArtifact.value;
    const answerSpec = answersByQuestion.get(questionId);
    const projectedReview = validateReviewSource(review, {
      run_id: runId,
      attempt_index: attemptIndex,
      question_id: questionId,
      pins,
      answer_outcome: answerSpec.outcome,
      artifact_refs: {
        answer_manifest_raw_sha256: commonInputs.answer_manifest_sha256,
        verification_receipt_raw_sha256: commonInputs.verification_receipt_sha256,
        answer_batch_raw_sha256: answerSpec.artifact.raw_sha256,
        answer_row_payload_sha256: answerSpec.artifact.payload_sha256,
      },
    });
    if (sharedOracleBasis === undefined) sharedOracleBasis = projectedReview.oracle_basis;
    guard(sameCanonical(sharedOracleBasis, projectedReview.oracle_basis), 'SOURCE_PIN_MISMATCH');
    const reviewInputs = {
      ...commonInputs,
      answer_batch_raw_sha256: answerSpec.artifact.raw_sha256,
      answer_row_payload_sha256: answerSpec.artifact.payload_sha256,
      evaluator_gold_raw_sha256: projectedReview.oracle_basis.evaluator_gold_raw_sha256,
      crosswalk_review_receipt_raw_sha256:
        projectedReview.oracle_basis.crosswalk_review_receipt.raw_sha256,
      crosswalk_review_receipt_scope:
        projectedReview.oracle_basis.crosswalk_review_receipt.scope,
    };
    const reviewSpec = spec(
      'engine_qa_review',
      { attempt_index: attemptIndex, question_id: questionId, run_id: runId },
      artifact(locator, reviewArtifact.bytes, '', sha256(reviewArtifact.bytes), 'raw_json_byte_hash'),
      reviewInputs,
      projectedReview,
      [answerSpec.event_id],
    );
    specs.push(reviewSpec);
    reviewSpecs.push(reviewSpec);
    reviewSourceRows.push({
      byte_length: reviewArtifact.bytes.length,
      file_name: `${questionId}.review.json`,
      question_id: questionId,
      review_id: projectedReview.review_id,
      sha256: sha256(reviewArtifact.bytes),
    });
    reviewerRefs.push({
      question_id: questionId,
      reviewer_ref: projectedReview.reviewer.pseudonymous_ref,
      reviewer_kind: projectedReview.reviewer.kind,
    });
    reviewQuestionResults.push({
      question_id: questionId,
      review_id: projectedReview.review_id,
      review_raw_sha256: sha256(reviewArtifact.bytes),
      exact_case_status: projectedReview.exact_case_classification.status,
      mandatory_propositions_status: projectedReview.mandatory_propositions.status,
      forbidden_claims_status: projectedReview.forbidden_claims.status,
      citation_fidelity_status: projectedReview.citation_fidelity.status,
      engine_boundary_fidelity_status: projectedReview.engine_boundary_fidelity.status,
      usefulness_status: projectedReview.usefulness.status,
      overall_verdict: projectedReview.overall_verdict,
      review_issue_codes: [...projectedReview.review_issue_codes],
    });
  }

  const summaryLocator = `reviews/engine_qa/${folder}/summary.json`;
  const summaryArtifact = readJson(root, summaryLocator);
  const summary = summaryArtifact.value;
  exactKeys(summary, [
    'schema_version', 'run_id', 'attempt_index', 'reviewer_refs', 'artifact_refs',
    'oracle_basis', 'review_files', 'question_results', 'counts', 'comparison_limits',
    'claim_ceiling', 'overall_verdict',
  ]);
  guard(summary.schema_version === 'soulforge.engineering_engine.se_core_natural_qa_round_summary.v1'
    && summary.run_id === runId
    && summary.attempt_index === attemptIndex,
  'SOURCE_COHORT_REFUSED');
  exactKeys(summary.artifact_refs, [
    'answer_manifest_raw_sha256', 'verification_receipt_raw_sha256',
    'answer_batch_raw_sha256',
  ]);
  guard(summary.artifact_refs.answer_manifest_raw_sha256 === sha256(manifestArtifact.bytes)
    && summary.artifact_refs.verification_receipt_raw_sha256 === sha256(receiptArtifact.bytes)
    && summary.artifact_refs.answer_batch_raw_sha256 === sha256(answersArtifact.bytes)
    && sameCanonical(summary.oracle_basis, sharedOracleBasis)
    && Array.isArray(summary.reviewer_refs)
    && sameCanonical(summary.reviewer_refs, reviewerRefs)
    && Array.isArray(summary.review_files)
    && summary.review_files.length === 7
    && sameCanonical(summary.review_files, reviewSourceRows)
    && Array.isArray(summary.question_results)
    && summary.question_results.length === 7
    && sameCanonical(summary.question_results, reviewQuestionResults),
  'SOURCE_COMMITMENT_MISMATCH');
  validateOracleBasis(summary.oracle_basis, pins);
  const computedCounts = aggregateReviewCounts(reviewSpecs);
  exactKeys(summary.counts, Object.keys(computedCounts));
  guard(sameCanonical(summary.counts, computedCounts)
    && computedCounts.citation_fidelity_denominator === 5
    && computedCounts.engine_boundary_fidelity_denominator === 2,
  'SOURCE_COMMITMENT_MISMATCH');
  const limits = validateComparisonLimits(summary.comparison_limits);
  safeToken(summary.claim_ceiling);
  guard(summary.overall_verdict === derivedSummaryVerdict(computedCounts),
    'SOURCE_COMMITMENT_MISMATCH');
  const summaryInputs = {
    ...commonInputs,
    evaluator_gold_raw_sha256: sharedOracleBasis.evaluator_gold_raw_sha256,
    crosswalk_review_receipt_raw_sha256:
      sharedOracleBasis.crosswalk_review_receipt.raw_sha256,
    crosswalk_review_receipt_scope: sharedOracleBasis.crosswalk_review_receipt.scope,
  };
  specs.push(spec(
    'engine_qa_round_summary',
    { attempt_index: attemptIndex, run_id: runId },
    artifact(summaryLocator, summaryArtifact.bytes, '', sha256(summaryArtifact.bytes), 'raw_json_byte_hash'),
    summaryInputs,
    {
      reviewer_refs: reviewerRefs,
      artifact_refs: structuredClone(summary.artifact_refs),
      oracle_basis: sharedOracleBasis,
      question_results: reviewQuestionResults,
      counts: computedCounts,
      comparison_limits: limits,
      claim_ceiling: summary.claim_ceiling,
      overall_verdict: derivedSummaryVerdict(computedCounts),
    },
    reviewSpecs.map((entry) => entry.event_id),
  ));
  return { specs, pins, common_inputs: commonInputs, oracle_basis: sharedOracleBasis };
}

function buildCandidateSpec(root, terminalSpecs, sharedPins) {
  const locator = 'qa_comparison_candidate.json';
  if (!existsSync(resolve(root, locator))) return undefined;
  const candidateArtifact = readJson(root, locator);
  const candidate = candidateArtifact.value;
  exactKeys(candidate, ['schema_version', 'comparison_limits', 'summary_refs', 'notes']);
  guard(candidate.schema_version === 'soulforge.engineering_engine.se_core_natural_qa_comparison_candidate.v1',
    'SOURCE_SHAPE_REFUSED');
  const limits = validateComparisonLimits(candidate.comparison_limits);
  const expectedRefs = terminalSpecs.map((entry) => ({
    event_id: entry.event_id,
    run_id: entry.identity.run_id,
  }));
  guard(Array.isArray(candidate.summary_refs)
    && sameCanonical(candidate.summary_refs, expectedRefs),
  'SOURCE_LINK_MISMATCH');
  guard(typeof candidate.notes === 'string' && candidate.notes.length <= MAX_JSON_BYTES,
    'SOURCE_SHAPE_REFUSED');
  return spec(
    'qa_comparison_candidate',
    { candidate_id: 'qa_comparison_candidate_v1' },
    artifact(locator, candidateArtifact.bytes, '', sha256(candidateArtifact.bytes), 'raw_json_byte_hash'),
    sharedPins,
    {
      comparison_limits: limits,
      evidence_claim_ceiling: 'observed',
    },
    terminalSpecs.map((entry) => entry.event_id),
  );
}

function buildSpecs(rootPath) {
  const root = openRoot(rootPath);
  const specs = [];
  const attempts = [];
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const attempt = buildAttemptSpecs(root, attemptIndex);
    specs.push(...attempt.specs);
    attempts.push(attempt);
  }
  const sharedPinHashes = attempts.map((attempt) => canonicalSha256(attempt.pins));
  guard(new Set(sharedPinHashes).size === 1, 'SOURCE_PIN_MISMATCH');
  guard(new Set(attempts.map((attempt) => canonicalSha256(attempt.oracle_basis))).size === 1,
    'SOURCE_PIN_MISMATCH');
  const summaries = specs.filter((entry) => entry.event_type === 'engine_qa_round_summary');
  const candidate = buildCandidateSpec(root, summaries, attempts[0].pins);
  if (candidate) specs.push(candidate);
  return specs;
}

function eventHashBody(event) {
  const body = { ...event };
  delete body.event_hash;
  return body;
}

function inputSetSha256(eventRefs) {
  return domainSha256('soulforge.se_core_eval.qa_continuation.input_set.v1', eventRefs);
}

function makeEvent(specValue, sequence, previousHash, eventById) {
  const eventRefs = [...specValue.link_event_ids].sort().map((eventId) => {
    const linked = eventById.get(eventId);
    guard(linked, 'LEDGER_LINK_REFUSED');
    return { event_hash: linked.event_hash, event_id: linked.event_id };
  });
  const event = {
    schema_version: EVENT_SCHEMA,
    sequence,
    event_type: specValue.event_type,
    event_id: specValue.event_id,
    prior_ledger_anchor: anchorValue(),
    identity: specValue.identity,
    artifact: specValue.artifact,
    inputs: specValue.inputs,
    outcome: specValue.outcome,
    links: {
      event_refs: eventRefs,
      input_set_sha256: inputSetSha256(eventRefs),
    },
    prev_event_hash: previousHash,
  };
  event.event_hash = domainSha256(
    'soulforge.se_core_eval.qa_continuation.event_hash.v1',
    eventHashBody(event),
  );
  return event;
}

function eventMaterial(event) {
  return {
    event_id: event.event_id,
    event_type: event.event_type,
    identity: event.identity,
    artifact: event.artifact,
    inputs: event.inputs,
    outcome: event.outcome,
    link_event_ids: event.links.event_refs.map((entry) => entry.event_id),
  };
}

function specMaterial(specValue) {
  return {
    event_id: specValue.event_id,
    event_type: specValue.event_type,
    identity: specValue.identity,
    artifact: specValue.artifact,
    inputs: specValue.inputs,
    outcome: specValue.outcome,
    link_event_ids: [...specValue.link_event_ids].sort(),
  };
}

function validateEventShape(event) {
  exactKeys(event, [
    'schema_version', 'sequence', 'event_type', 'event_id', 'prior_ledger_anchor',
    'identity', 'artifact', 'inputs', 'outcome', 'links', 'prev_event_hash', 'event_hash',
  ], 'LEDGER_EVENT_SHAPE_REFUSED');
  guard(event.schema_version === EVENT_SCHEMA
    && EVENT_TYPES.includes(event.event_type)
    && typeof event.event_id === 'string'
    && /^seqac_[0-9a-f]{64}$/.test(event.event_id)
    && sameCanonical(event.prior_ledger_anchor, PRIOR_LEDGER_ANCHOR),
  'LEDGER_EVENT_SHAPE_REFUSED');
  canonicalValue(event, { maximum_string: 65536 });
  exactKeys(event.artifact, [
    'byte_length', 'locator', 'payload_basis', 'payload_sha256', 'raw_sha256', 'record_pointer',
  ], 'LEDGER_EVENT_SHAPE_REFUSED');
  validateLocator(event.artifact.locator);
  safeInteger(event.artifact.byte_length, MAX_JSON_BYTES, 'LEDGER_EVENT_SHAPE_REFUSED');
  hex64(event.artifact.payload_sha256, 'LEDGER_EVENT_SHAPE_REFUSED');
  hex64(event.artifact.raw_sha256, 'LEDGER_EVENT_SHAPE_REFUSED');
  safeToken(event.artifact.payload_basis, TOKEN, 64, 'LEDGER_EVENT_SHAPE_REFUSED');
  guard(event.artifact.record_pointer === '' || JSON_POINTER.test(event.artifact.record_pointer),
    'LEDGER_EVENT_SHAPE_REFUSED');
  exactKeys(event.links, ['event_refs', 'input_set_sha256'], 'LEDGER_EVENT_SHAPE_REFUSED');
  guard(Array.isArray(event.links.event_refs), 'LEDGER_EVENT_SHAPE_REFUSED');
  for (const ref of event.links.event_refs) {
    exactKeys(ref, ['event_hash', 'event_id'], 'LEDGER_EVENT_SHAPE_REFUSED');
    guard(/^seqac_[0-9a-f]{64}$/.test(ref.event_id), 'LEDGER_EVENT_SHAPE_REFUSED');
    hex64(ref.event_hash, 'LEDGER_EVENT_SHAPE_REFUSED');
  }
  hex64(event.links.input_set_sha256, 'LEDGER_EVENT_SHAPE_REFUSED');
  hex64(event.prev_event_hash, 'LEDGER_EVENT_SHAPE_REFUSED');
  hex64(event.event_hash, 'LEDGER_EVENT_SHAPE_REFUSED');

  if (event.event_type === 'qa_comparison_candidate') {
    exactKeys(event.identity, ['candidate_id'], 'LEDGER_EVENT_SHAPE_REFUSED');
    guard(event.identity.candidate_id === 'qa_comparison_candidate_v1',
      'LEDGER_EVENT_SHAPE_REFUSED');
    exactKeys(event.outcome, ['comparison_limits', 'evidence_claim_ceiling'],
      'LEDGER_EVENT_SHAPE_REFUSED');
    guard(event.outcome.evidence_claim_ceiling === 'observed', 'LEDGER_EVENT_SHAPE_REFUSED');
    validateComparisonLimits(event.outcome.comparison_limits);
    return;
  }
  const isSummary = event.event_type === 'engine_qa_round_summary';
  exactKeys(event.identity, isSummary
    ? ['attempt_index', 'run_id']
    : ['attempt_index', 'question_id', 'run_id'], 'LEDGER_EVENT_SHAPE_REFUSED');
  safeInteger(event.identity.attempt_index, 3, 'LEDGER_EVENT_SHAPE_REFUSED');
  guard(event.identity.attempt_index >= 1
    && event.identity.run_id === expectedRunId(event.identity.attempt_index),
  'LEDGER_EVENT_SHAPE_REFUSED');
  safeRunId(event.identity.run_id, 'LEDGER_EVENT_SHAPE_REFUSED');
  if (!isSummary) safeQuestionId(event.identity.question_id, 'LEDGER_EVENT_SHAPE_REFUSED');
}

function validatePinnedInputs(inputs, { includeRunArtifacts }) {
  exactKeys(inputs, includeRunArtifacts
    ? [
      'answer_policy_sha256', 'corpus_sha256', 'crosswalk_sha256', 'projection_sha256',
      'question_set_sha256', 'answer_manifest_sha256', 'verification_receipt_sha256',
    ]
    : [
      'answer_policy_sha256', 'corpus_sha256', 'crosswalk_sha256', 'projection_sha256',
      'question_set_sha256',
    ], 'LEDGER_EVENT_SHAPE_REFUSED');
  for (const value of Object.values(inputs)) hex64(value, 'LEDGER_EVENT_SHAPE_REFUSED');
}

function validateLedgerBoundary(value) {
  exactKeys(value, [
    'public_sources_only', 'synthetic_case_facts_only', 'contains_actual_project_data',
    'contains_private_project_data', 'contains_account_or_notebook_identifiers',
    'raw_content_included',
  ], 'LEDGER_EVENT_SHAPE_REFUSED');
  guard(value.public_sources_only === true
    && value.synthetic_case_facts_only === true
    && value.contains_actual_project_data === false
    && value.contains_private_project_data === false
    && value.contains_account_or_notebook_identifiers === false
    && value.raw_content_included === false,
  'LEDGER_EVENT_SHAPE_REFUSED');
}

function validateEventSemantics(event, eventById) {
  const expectedId = eventIdFor(event.event_type, event.identity);
  guard(event.event_id === expectedId, 'LEDGER_IDENTITY_REFUSED');
  const refs = event.links.event_refs;
  guard(refs.map((ref) => ref.event_id).join('\0')
    === [...refs].map((ref) => ref.event_id).sort().join('\0'),
  'LEDGER_LINK_REFUSED');
  guard(event.links.input_set_sha256 === inputSetSha256(refs), 'LEDGER_LINK_REFUSED');
  const linked = refs.map((ref) => {
    const found = eventById.get(ref.event_id);
    guard(found && found.event_hash === ref.event_hash, 'LEDGER_LINK_REFUSED');
    return found;
  });
  if (event.event_type === 'engine_qa_answer') {
    validatePinnedInputs(event.inputs, { includeRunArtifacts: true });
    exactKeys(event.outcome, [
      'authority_action_count', 'claim_ceiling', 'classification', 'data_boundary',
      'safety_violations',
    ], 'LEDGER_EVENT_SHAPE_REFUSED');
    validateLedgerBoundary(event.outcome.data_boundary);
    safeToken(event.outcome.classification, TOKEN, 64, 'LEDGER_EVENT_SHAPE_REFUSED');
    safeToken(event.outcome.claim_ceiling, TOKEN, 128, 'LEDGER_EVENT_SHAPE_REFUSED');
    safeInteger(event.outcome.safety_violations, 1000, 'LEDGER_EVENT_SHAPE_REFUSED');
    guard(linked.length === 0
      && event.artifact.locator === `exports/engine_qa/${expectedFolder(event.identity.attempt_index)}/answers.json`
      && event.artifact.record_pointer === `/answers/${QUESTION_IDS.indexOf(event.identity.question_id)}`
      && event.artifact.payload_basis === 'canonical_answer_row_json_lf'
      && event.outcome.authority_action_count === 0,
    'LEDGER_LINK_REFUSED');
    return;
  }
  if (event.event_type === 'engine_qa_review') {
    guard(linked.length === 1 && linked[0].event_type === 'engine_qa_answer',
      'LEDGER_LINK_REFUSED');
    exactKeys(event.inputs, [
      'answer_policy_sha256', 'corpus_sha256', 'crosswalk_sha256', 'projection_sha256',
      'question_set_sha256', 'answer_manifest_sha256', 'verification_receipt_sha256',
      'answer_batch_raw_sha256', 'answer_row_payload_sha256',
      'evaluator_gold_raw_sha256', 'crosswalk_review_receipt_raw_sha256',
      'crosswalk_review_receipt_scope',
    ], 'LEDGER_EVENT_SHAPE_REFUSED');
    for (const [key, value] of Object.entries(event.inputs)) {
      if (key === 'crosswalk_review_receipt_scope') {
        guard(value === CROSSWALK_REVIEW_SCOPE, 'LEDGER_EVENT_SHAPE_REFUSED');
      } else hex64(value, 'LEDGER_EVENT_SHAPE_REFUSED');
    }
    const pins = Object.fromEntries([
      'question_set_sha256', 'corpus_sha256', 'crosswalk_sha256', 'projection_sha256',
      'answer_policy_sha256',
    ].map((key) => [key, event.inputs[key]]));
    const projected = validateReviewSource({
      schema_version: 'soulforge.engineering_engine.se_core_natural_qa_answer_review.v1',
      run_id: event.identity.run_id,
      attempt_index: event.identity.attempt_index,
      question_id: event.identity.question_id,
      ...event.outcome,
    }, {
      run_id: event.identity.run_id,
      attempt_index: event.identity.attempt_index,
      question_id: event.identity.question_id,
      pins,
      answer_outcome: linked[0]?.outcome,
      artifact_refs: {
        answer_manifest_raw_sha256: event.inputs.answer_manifest_sha256,
        verification_receipt_raw_sha256: event.inputs.verification_receipt_sha256,
        answer_batch_raw_sha256: event.inputs.answer_batch_raw_sha256,
        answer_row_payload_sha256: event.inputs.answer_row_payload_sha256,
      },
    });
    guard(linked.length === 1
      && linked[0].event_type === 'engine_qa_answer'
      && sameCanonical(linked[0].identity, event.identity)
      && [
        'question_set_sha256', 'corpus_sha256', 'crosswalk_sha256', 'projection_sha256',
        'answer_policy_sha256', 'answer_manifest_sha256', 'verification_receipt_sha256',
      ].every((key) => event.inputs[key] === linked[0].inputs[key])
      && sameCanonical(projected, event.outcome)
      && event.inputs.answer_batch_raw_sha256 === linked[0].artifact.raw_sha256
      && event.inputs.answer_row_payload_sha256 === linked[0].artifact.payload_sha256
      && event.inputs.evaluator_gold_raw_sha256 === event.outcome.oracle_basis.evaluator_gold_raw_sha256
      && event.inputs.crosswalk_review_receipt_raw_sha256
        === event.outcome.oracle_basis.crosswalk_review_receipt.raw_sha256
      && event.artifact.locator === `reviews/engine_qa/${expectedFolder(event.identity.attempt_index)}/${event.identity.question_id}.review.json`
      && event.artifact.record_pointer === ''
      && event.artifact.payload_basis === 'raw_json_byte_hash'
      && event.artifact.payload_sha256 === event.artifact.raw_sha256,
    'LEDGER_LINK_REFUSED');
    return;
  }
  if (event.event_type === 'engine_qa_round_summary') {
    exactKeys(event.inputs, [
      'answer_policy_sha256', 'corpus_sha256', 'crosswalk_sha256', 'projection_sha256',
      'question_set_sha256', 'answer_manifest_sha256', 'verification_receipt_sha256',
      'evaluator_gold_raw_sha256', 'crosswalk_review_receipt_raw_sha256',
      'crosswalk_review_receipt_scope',
    ], 'LEDGER_EVENT_SHAPE_REFUSED');
    for (const [key, value] of Object.entries(event.inputs)) {
      if (key === 'crosswalk_review_receipt_scope') {
        guard(value === CROSSWALK_REVIEW_SCOPE, 'LEDGER_EVENT_SHAPE_REFUSED');
      } else hex64(value, 'LEDGER_EVENT_SHAPE_REFUSED');
    }
    exactKeys(event.outcome, [
      'reviewer_refs', 'artifact_refs', 'oracle_basis', 'question_results', 'counts',
      'comparison_limits', 'claim_ceiling', 'overall_verdict',
    ], 'LEDGER_EVENT_SHAPE_REFUSED');
    safeToken(event.outcome.claim_ceiling, TOKEN, 128, 'LEDGER_EVENT_SHAPE_REFUSED');
    safeToken(event.outcome.overall_verdict, TOKEN, 64, 'LEDGER_EVENT_SHAPE_REFUSED');
    const linkedCounts = aggregateReviewCounts(linked);
    const reviewerRefs = linked.map((entry) => ({
      question_id: entry.identity.question_id,
      reviewer_ref: entry.outcome.reviewer.pseudonymous_ref,
      reviewer_kind: entry.outcome.reviewer.kind,
    })).sort((left, right) => compareText(left.question_id, right.question_id));
    const questionResults = linked.map((entry) => ({
      question_id: entry.identity.question_id,
      review_id: entry.outcome.review_id,
      review_raw_sha256: entry.artifact.raw_sha256,
      exact_case_status: entry.outcome.exact_case_classification.status,
      mandatory_propositions_status: entry.outcome.mandatory_propositions.status,
      forbidden_claims_status: entry.outcome.forbidden_claims.status,
      citation_fidelity_status: entry.outcome.citation_fidelity.status,
      engine_boundary_fidelity_status: entry.outcome.engine_boundary_fidelity.status,
      usefulness_status: entry.outcome.usefulness.status,
      overall_verdict: entry.outcome.overall_verdict,
      review_issue_codes: [...entry.outcome.review_issue_codes],
    })).sort((left, right) => compareText(left.question_id, right.question_id));
    const oracleHashes = new Set(linked.map((entry) => canonicalSha256(entry.outcome.oracle_basis)));
    const manifestHashes = new Set(linked.map((entry) => entry.inputs.answer_manifest_sha256));
    const receiptHashes = new Set(linked.map((entry) => entry.inputs.verification_receipt_sha256));
    const answerHashes = new Set(linked.map((entry) => entry.inputs.answer_batch_raw_sha256));
    const expectedArtifacts = {
      answer_manifest_raw_sha256: [...manifestHashes][0],
      verification_receipt_raw_sha256: [...receiptHashes][0],
      answer_batch_raw_sha256: [...answerHashes][0],
    };
    validateComparisonLimits(event.outcome.comparison_limits);
    guard(linked.length === 7
      && linked.every((entry) => entry.event_type === 'engine_qa_review'
        && entry.identity.run_id === event.identity.run_id
        && entry.identity.attempt_index === event.identity.attempt_index)
      && linked.map((entry) => entry.identity.question_id).sort().join('\0') === QUESTION_IDS.join('\0')
      && event.artifact.locator === `reviews/engine_qa/${expectedFolder(event.identity.attempt_index)}/summary.json`
      && event.artifact.record_pointer === ''
      && event.artifact.payload_basis === 'raw_json_byte_hash'
      && event.artifact.payload_sha256 === event.artifact.raw_sha256
      && linkedCounts.citation_fidelity_denominator === 5
      && linkedCounts.engine_boundary_fidelity_denominator === 2
      && oracleHashes.size === 1
      && manifestHashes.size === 1
      && receiptHashes.size === 1
      && answerHashes.size === 1
      && sameCanonical(event.outcome.reviewer_refs, reviewerRefs)
      && sameCanonical(event.outcome.artifact_refs, expectedArtifacts)
      && sameCanonical(event.outcome.oracle_basis, linked[0].outcome.oracle_basis)
      && sameCanonical(event.outcome.question_results, questionResults)
      && sameCanonical(event.outcome.counts, linkedCounts)
      && event.outcome.overall_verdict === derivedSummaryVerdict(linkedCounts)
      && event.inputs.evaluator_gold_raw_sha256
        === event.outcome.oracle_basis.evaluator_gold_raw_sha256
      && event.inputs.crosswalk_review_receipt_raw_sha256
        === event.outcome.oracle_basis.crosswalk_review_receipt.raw_sha256,
    'LEDGER_LINK_REFUSED');
    return;
  }
  validatePinnedInputs(event.inputs, { includeRunArtifacts: false });
  guard(linked.length === 3
    && linked.every((entry) => entry.event_type === 'engine_qa_round_summary')
    && linked.map((entry) => entry.identity.run_id).sort().join('\0') === RUN_IDS.join('\0')
    && event.artifact.locator === 'qa_comparison_candidate.json'
    && event.artifact.record_pointer === ''
    && event.artifact.payload_basis === 'raw_json_byte_hash'
    && event.artifact.payload_sha256 === event.artifact.raw_sha256,
  'LEDGER_LINK_REFUSED');
}

function emptyCounts() {
  return Object.fromEntries(EVENT_TYPES.map((type) => [type, 0]));
}

function validateComplete(events) {
  const counts = emptyCounts();
  for (const event of events) counts[event.event_type] += 1;
  guard(counts.engine_qa_answer === 21
    && counts.engine_qa_review === 21
    && counts.engine_qa_round_summary === 3
    && counts.qa_comparison_candidate <= 1,
  'LEDGER_COHORT_REFUSED');
  if (counts.qa_comparison_candidate === 1) {
    guard(events.at(-1).event_type === 'qa_comparison_candidate', 'LEDGER_COHORT_REFUSED');
  }
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const runId = expectedRunId(attemptIndex);
    const answers = events.filter((entry) => entry.event_type === 'engine_qa_answer'
      && entry.identity.run_id === runId);
    const reviews = events.filter((entry) => entry.event_type === 'engine_qa_review'
      && entry.identity.run_id === runId);
    const summaries = events.filter((entry) => entry.event_type === 'engine_qa_round_summary'
      && entry.identity.run_id === runId);
    guard(answers.length === 7 && reviews.length === 7 && summaries.length === 1
      && answers.map((entry) => entry.identity.question_id).sort().join('\0') === QUESTION_IDS.join('\0')
      && reviews.map((entry) => entry.identity.question_id).sort().join('\0') === QUESTION_IDS.join('\0')
      && new Set(answers.map((entry) => entry.artifact.record_pointer)).size === 7
      && new Set(answers.map((entry) => entry.artifact.raw_sha256)).size === 1,
    'LEDGER_COHORT_REFUSED');
  }
  const answerInputs = events.filter((entry) => entry.event_type === 'engine_qa_answer')
    .map((entry) => ({
      answer_policy_sha256: entry.inputs.answer_policy_sha256,
      corpus_sha256: entry.inputs.corpus_sha256,
      crosswalk_sha256: entry.inputs.crosswalk_sha256,
      projection_sha256: entry.inputs.projection_sha256,
      question_set_sha256: entry.inputs.question_set_sha256,
    }));
  guard(new Set(answerInputs.map((pins) => canonicalSha256(pins))).size === 1,
    'LEDGER_COHORT_REFUSED');
  const reviewOracleBases = events
    .filter((entry) => entry.event_type === 'engine_qa_review')
    .map((entry) => entry.outcome.oracle_basis);
  guard(new Set(reviewOracleBases.map((basis) => canonicalSha256(basis))).size === 1,
    'LEDGER_COHORT_REFUSED');
}

function parseContinuation(bytes, { requireComplete }) {
  guard(Buffer.isBuffer(bytes)
    && bytes.length > 0
    && bytes.length <= MAX_LEDGER_BYTES,
  'LEDGER_BYTES_REFUSED');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    hold('LEDGER_BYTES_REFUSED');
  }
  guard(!text.startsWith('\uFEFF') && text.endsWith('\n') && !text.includes('\r'),
    'LEDGER_LINE_REFUSED');
  const lines = text.slice(0, -1).split('\n');
  guard(lines.length > 0
    && lines.length <= MAX_LEDGER_LINES
    && lines.every((line) => line.length > 0 && Buffer.byteLength(line, 'utf8') <= 131072),
  'LEDGER_LINE_REFUSED');
  const events = [];
  const eventById = new Map();
  let previousHash = PRIOR_LEDGER_ANCHOR.head_event_hash;
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch {
      hold('LEDGER_LINE_REFUSED');
    }
    validateEventShape(event);
    guard(Buffer.compare(canonicalJsonBytes(event), Buffer.from(`${lines[index]}\n`, 'utf8')) === 0,
      'LEDGER_CANONICAL_REFUSED');
    guard(event.sequence === PRIOR_LEDGER_ANCHOR.event_count + index + 1
      && event.prev_event_hash === previousHash
      && event.event_hash === domainSha256(
        'soulforge.se_core_eval.qa_continuation.event_hash.v1',
        eventHashBody(event),
      )
      && !eventById.has(event.event_id),
    'LEDGER_CHAIN_REFUSED');
    validateEventSemantics(event, eventById);
    events.push(event);
    eventById.set(event.event_id, event);
    previousHash = event.event_hash;
  }
  if (requireComplete) validateComplete(events);
  return events;
}

function mergeSpecs(specs, existingBytes) {
  const existing = existingBytes === undefined
    ? []
    : parseContinuation(existingBytes, { requireComplete: false });
  guard(existing.length <= specs.length, 'EXISTING_LEDGER_NOT_PREFIX');
  const events = [];
  const eventById = new Map();
  let previousHash = PRIOR_LEDGER_ANCHOR.head_event_hash;
  for (let index = 0; index < specs.length; index += 1) {
    let event;
    if (index < existing.length) {
      event = existing[index];
      guard(event.event_id === specs[index].event_id, 'EXISTING_LEDGER_NOT_PREFIX');
      guard(sameCanonical(eventMaterial(event), specMaterial(specs[index])), 'IDENTITY_CONFLICT');
    } else {
      event = makeEvent(
        specs[index],
        PRIOR_LEDGER_ANCHOR.event_count + index + 1,
        previousHash,
        eventById,
      );
    }
    events.push(event);
    eventById.set(event.event_id, event);
    previousHash = event.event_hash;
  }
  validateComplete(events);
  return {
    events,
    bytes: Buffer.concat(events.map((event) => canonicalJsonBytes(event))),
    reused: existing.length,
    appended: events.length - existing.length,
  };
}

function reportFor(events, bytes, extras = {}) {
  const counts = emptyCounts();
  for (const event of events) counts[event.event_type] += 1;
  return {
    schema_version: REPORT_SCHEMA,
    result: 'PASS',
    claim_ceiling: CLAIM_CEILING,
    prior_ledger_anchor: anchorValue(),
    counts,
    continuation_event_count: events.length,
    total_anchored_event_count: PRIOR_LEDGER_ANCHOR.event_count + events.length,
    head_event_hash: events.length === 0
      ? PRIOR_LEDGER_ANCHOR.head_event_hash
      : events.at(-1).event_hash,
    continuation_ledger_sha256: bytes.length === 0 ? GENESIS_HASH : sha256(bytes),
    provider_byte_parity: 'not_verified',
    notebook_output_is_gold: false,
    engine_output_is_gold: false,
    final_comparison_allowed: false,
    engine_is_truth: false,
    notebook_is_truth: false,
    winner_declared: false,
    issues: [],
    ...extras,
  };
}

function failureReport(code, extras = {}) {
  return {
    schema_version: REPORT_SCHEMA,
    result: 'HOLD',
    claim_ceiling: CLAIM_CEILING,
    prior_ledger_anchor: anchorValue(),
    counts: emptyCounts(),
    continuation_event_count: 0,
    total_anchored_event_count: PRIOR_LEDGER_ANCHOR.event_count,
    head_event_hash: PRIOR_LEDGER_ANCHOR.head_event_hash,
    continuation_ledger_sha256: GENESIS_HASH,
    provider_byte_parity: 'not_verified',
    notebook_output_is_gold: false,
    engine_output_is_gold: false,
    final_comparison_allowed: false,
    engine_is_truth: false,
    notebook_is_truth: false,
    winner_declared: false,
    issues: [code],
    ...extras,
  };
}

function validateRequest(options, keys, required, code) {
  exactKeys(options, Object.keys(options), code);
  guard(Object.keys(options).every((key) => keys.includes(key))
    && required.every((key) => Object.hasOwn(options, key)), code);
}

export function backfillSeCoreEvalQaContinuation(options = {}) {
  try {
    validateRequest(
      options,
      ['root_path', 'prior_ledger_bytes', 'prior_ledger_anchor', 'existing_continuation_bytes'],
      ['root_path'],
      'BACKFILL_REQUEST_REFUSED',
    );
    guard(Object.hasOwn(options, 'prior_ledger_bytes')
      !== Object.hasOwn(options, 'prior_ledger_anchor'),
    'PRIOR_LEDGER_ANCHOR_REFUSED');
    if (Object.hasOwn(options, 'existing_continuation_bytes')) {
      guard(Buffer.isBuffer(options.existing_continuation_bytes), 'LEDGER_BYTES_REFUSED');
    }
    const priorVerification = validatePriorEvidence(
      options.prior_ledger_bytes ?? options.prior_ledger_anchor,
    );
    const specs = buildSpecs(options.root_path);
    const merged = mergeSpecs(specs, options.existing_continuation_bytes);
    return {
      result: 'PASS',
      ledger_bytes: merged.bytes,
      report: reportFor(merged.events, merged.bytes, {
        reused_events: merged.reused,
        appended_events: merged.appended,
        prior_ledger_verification: priorVerification,
      }),
    };
  } catch (error) {
    return {
      result: 'HOLD',
      ledger_bytes: Buffer.alloc(0),
      report: failureReport(
        error instanceof ContinuationHold ? error.code : 'SOURCE_TREE_UNREADABLE',
        { reused_events: 0, appended_events: 0 },
      ),
    };
  }
}

export function validateSeCoreEvalQaContinuation(ledgerBytes, priorLedgerBytes) {
  try {
    const priorVerification = validatePriorEvidence(priorLedgerBytes);
    const events = parseContinuation(ledgerBytes, { requireComplete: true });
    return reportFor(events, ledgerBytes, { prior_ledger_verification: priorVerification });
  } catch (error) {
    return failureReport(error instanceof ContinuationHold ? error.code : 'LEDGER_BYTES_REFUSED');
  }
}

export function querySeCoreEvalQaContinuation(ledgerBytes, priorLedgerBytes, filters = {}) {
  try {
    validateRequest(
      filters,
      ['event_type', 'run_id', 'question_id', 'attempt_index'],
      [],
      'QUERY_REFUSED',
    );
    if (Object.hasOwn(filters, 'event_type')) {
      safeToken(filters.event_type, TOKEN, 64, 'QUERY_REFUSED');
      guard(EVENT_TYPES.includes(filters.event_type), 'QUERY_REFUSED');
    }
    if (Object.hasOwn(filters, 'run_id')) {
      guard(typeof filters.run_id === 'string'
        && !RESERVED_QUERY.test(filters.run_id)
        && RUN_IDS.includes(filters.run_id),
      'QUERY_REFUSED');
    }
    if (Object.hasOwn(filters, 'question_id')) {
      safeQuestionId(filters.question_id, 'QUERY_REFUSED');
    }
    if (Object.hasOwn(filters, 'attempt_index')) {
      safeInteger(filters.attempt_index, 3, 'QUERY_REFUSED');
      guard(filters.attempt_index >= 1, 'QUERY_REFUSED');
    }
    validatePriorEvidence(priorLedgerBytes);
    const events = parseContinuation(ledgerBytes, { requireComplete: true });
    const matches = events.filter((event) => Object.entries(filters).every(([key, value]) => {
      if (key === 'event_type') return event.event_type === value;
      return event.identity[key] === value;
    }));
    return {
      schema_version: QUERY_SCHEMA,
      result: 'PASS',
      claim_ceiling: CLAIM_CEILING,
      prior_ledger_anchor: anchorValue(),
      continuation_ledger_sha256: sha256(ledgerBytes),
      query: canonicalValue(filters),
      count: matches.length,
      events: matches,
      provider_byte_parity: 'not_verified',
      notebook_output_is_gold: false,
      engine_output_is_gold: false,
      final_comparison_allowed: false,
      engine_is_truth: false,
      notebook_is_truth: false,
      winner_declared: false,
      issues: [],
    };
  } catch (error) {
    return {
      schema_version: QUERY_SCHEMA,
      result: 'HOLD',
      claim_ceiling: CLAIM_CEILING,
      prior_ledger_anchor: anchorValue(),
      continuation_ledger_sha256: GENESIS_HASH,
      query: {},
      count: 0,
      events: [],
      provider_byte_parity: 'not_verified',
      notebook_output_is_gold: false,
      engine_output_is_gold: false,
      final_comparison_allowed: false,
      engine_is_truth: false,
      notebook_is_truth: false,
      winner_declared: false,
      issues: [error instanceof ContinuationHold ? error.code : 'QUERY_REFUSED'],
    };
  }
}

export const SE_CORE_EVAL_QA_PRIOR_LEDGER_ANCHOR = PRIOR_LEDGER_ANCHOR;
