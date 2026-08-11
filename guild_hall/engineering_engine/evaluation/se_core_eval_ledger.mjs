import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const EVENT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_ledger_event.v1';
const REPORT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_ledger_report.v1';
const QUERY_SCHEMA = 'soulforge.engineering_engine.se_core_eval_ledger_query.v1';
const CLAIM_CEILING = 'metadata_only_observation_ledger';
const EVENT_TYPES = Object.freeze([
  'notebook_answer',
  'review',
  'round_summary',
  'engine_row',
  'engine_run',
  'comparison_candidate',
]);
const ROUND_IDS = Object.freeze(['round_01', 'round_02', 'round_03']);
const ENGINE_ATTEMPTS = Object.freeze(['reference_01', 'reference_02', 'reference_03']);
const EXPECTED_COUNTS = Object.freeze({
  notebook_answer: 21,
  review: 21,
  round_summary: 3,
  engine_row: 21,
  engine_run: 3,
  comparison_candidate: 0,
});
const GENESIS_HASH = '0'.repeat(64);
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_OPAQUE_BYTES = 4 * 1024 * 1024;
const MAX_LEDGER_BYTES = 4 * 1024 * 1024;
const MAX_LEDGER_LINES = 512;
const MAX_STRING_LENGTH = 512;
const MAX_ARRAY_LENGTH = 128;
const MAX_DEPTH = 16;
const HEX64 = /^[0-9a-f]{64}$/;
const TOKEN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const QUESTION_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const RELATIVE_LOCATOR = /^[A-Za-z0-9._/-]{1,240}$/;
const JSON_POINTER = /^(?:|\/(?:[A-Za-z0-9._~-]+|[0-9]+)(?:\/(?:[A-Za-z0-9._~-]+|[0-9]+))*)$/;
const ABSOLUTE_PATH_VALUE = /(?:[a-z]:[\\/]|\\\\[^\\/\s]+[\\/]|(?:^|[\s"'(=:])\/(?!\/)(?:[a-z0-9._-]+\/)+[a-z0-9._-]+)/i;
const CREDENTIAL_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bbearer\s+[a-z0-9._~+/=-]{12,}|\bsk-[a-z0-9_-]{12,}|\bgh[pousr]_[a-z0-9]{20,}|\bAIza[a-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{8,}|(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|credential|secret)\s*[:=])/i;
const ACCOUNT_VALUE = /(?:\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b|\baccount(?:[_ -]?id)?\s*[:=])/i;
const PROJECT_VALUE = /(?:\bP\d{2,4}[-_]\d{2,6}\b|\b(?:project(?:[_ ]?(?:code|id|ref|name))?\b|customer[_ ]?(?:id|ref|name)\b|contract[_ ]?(?:id|ref|number)\b|work[_ ]?order\b|cdrl\b)\s*[:=])/i;
const SENSITIVE_LOCATOR_SEGMENT = /(?:^|\/)(?:(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|credentials?|secrets?)(?:[._/-]|$)|(?:account|notebook)[_-]?id(?:[._/-]|$))/i;
const RESERVED_IDENTIFIER_NAMESPACE = /^(?:(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|credentials?|secrets?|tokens?)(?:[_-]|$)|(?:project|customer|contract|account|notebook)(?:[_-]?(?:code|id|ref|name))?(?:[_-]|$)|work[_-]?order(?:[_-]|$)|cdrl(?:[_-]|$))/i;
const QUERY_RUN_ID = /^(?:(?:notebook_round|engine_reference)_0[1-3])$/;
const QUERY_ROUND_ID = /^round_0[1-3]$/;
const QUERY_QUESTION_ID = /^se-q-0[1-7]$/;

function expectedNotebookRunId(roundId) {
  return `notebook_${roundId}`;
}

function expectedEngineRunId(attemptIndex) {
  return `engine_reference_${String(attemptIndex).padStart(2, '0')}`;
}

class LedgerHold extends Error {
  constructor(code) {
    super(code);
    this.name = 'LedgerHold';
    this.code = code;
  }
}

function hold(code) {
  throw new LedgerHold(code);
}

function guard(condition, code) {
  if (!condition) hold(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalValue(value, depth = 0, seen = new Set()) {
  guard(depth <= MAX_DEPTH, 'NON_CANONICAL_JSON_REFUSED');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    guard(value.length <= MAX_STRING_LENGTH && value.normalize('NFC') === value,
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
    const out = [];
    for (const key of expected) {
      const descriptor = descriptors[key];
      guard(Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true,
        'NON_CANONICAL_JSON_REFUSED');
      out.push(canonicalValue(descriptor.value, depth + 1, seen));
    }
    seen.delete(value);
    return out;
  }
  guard(isRecord(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.getOwnPropertySymbols(value).length === 0,
  'NON_CANONICAL_JSON_REFUSED');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  guard(Object.keys(descriptors).length <= MAX_ARRAY_LENGTH, 'NON_CANONICAL_JSON_REFUSED');
  seen.add(value);
  const out = {};
  for (const key of Object.keys(descriptors).sort()) {
    const descriptor = descriptors[key];
    guard(key.length <= 128
      && key.normalize('NFC') === key
      && Object.hasOwn(descriptor, 'value')
      && descriptor.enumerable === true
      && descriptor.value !== undefined,
    'NON_CANONICAL_JSON_REFUSED');
    Object.defineProperty(out, key, {
      value: canonicalValue(descriptor.value, depth + 1, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  seen.delete(value);
  return out;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalSha256(value) {
  return sha256(canonicalJsonBytes(value));
}

function domainSha256(domain, value) {
  return sha256(Buffer.concat([
    Buffer.from(`${domain}\n`, 'utf8'),
    canonicalJsonBytes(value),
  ]));
}

function safeString(value, pattern = TOKEN, maximum = 128) {
  guard(typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && value.normalize('NFC') === value
    && pattern.test(value)
    && !ABSOLUTE_PATH_VALUE.test(value)
    && !CREDENTIAL_VALUE.test(value)
    && !ACCOUNT_VALUE.test(value)
    && !PROJECT_VALUE.test(value),
  'PUBLIC_METADATA_REFUSED');
  return value;
}

function safeQueryIdentifier(value, pattern, { allow_exact_reserved_namespace = false } = {}) {
  guard(typeof value === 'string'
    && value.length > 0
    && value.length <= 64
    && value.normalize('NFC') === value
    && pattern.test(value)
    && (allow_exact_reserved_namespace || !RESERVED_IDENTIFIER_NAMESPACE.test(value))
    && !ABSOLUTE_PATH_VALUE.test(value)
    && !CREDENTIAL_VALUE.test(value)
    && !ACCOUNT_VALUE.test(value)
    && !PROJECT_VALUE.test(value),
  'QUERY_REFUSED');
}

function safeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  guard(Number.isSafeInteger(value) && value >= 0 && value <= maximum,
    'PUBLIC_METADATA_REFUSED');
  return value;
}

function hex64(value) {
  guard(typeof value === 'string' && HEX64.test(value), 'PUBLIC_METADATA_REFUSED');
  return value;
}

function safeBoolean(value) {
  guard(typeof value === 'boolean', 'PUBLIC_METADATA_REFUSED');
  return value;
}

function sourceRevisionStatus(value) {
  if (value === true) return 'supported';
  if (value === false) return 'unsupported';
  if (value === null) return 'not_applicable';
  hold('PUBLIC_METADATA_REFUSED');
}

function canonicalExactStatus(value) {
  guard(['pass', 'fail', 'fail_internal_contradiction'].includes(value),
    'PUBLIC_METADATA_REFUSED');
  return value === 'fail_internal_contradiction' ? 'fail' : value;
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
  let root;
  try {
    root = realpathSync(rootPath);
    guard(statSync(root).isDirectory(), 'SOURCE_TREE_UNREADABLE');
  } catch (error) {
    if (error instanceof LedgerHold) throw error;
    hold('SOURCE_TREE_UNREADABLE');
  }
  return root;
}

function readConfined(root, locator, maximum) {
  validateLocator(locator);
  let real;
  let stats;
  try {
    real = realpathSync(resolve(root, ...locator.split('/')));
    guard(withinRoot(root, real), 'SOURCE_PATH_REFUSED');
    stats = statSync(real);
    guard(stats.isFile() && stats.size >= 0 && stats.size <= maximum, 'SOURCE_FILE_REFUSED');
    const bytes = readFileSync(real);
    guard(bytes.length === stats.size, 'SOURCE_FILE_REFUSED');
    return bytes;
  } catch (error) {
    if (error instanceof LedgerHold) throw error;
    hold('SOURCE_FILE_REFUSED');
  }
}

function parseJson(bytes) {
  guard(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_JSON_BYTES,
    'SOURCE_JSON_REFUSED');
  let text;
  let value;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    guard(!text.startsWith('\uFEFF'), 'SOURCE_JSON_REFUSED');
    value = JSON.parse(text);
    guard(isRecord(value) && Object.getPrototypeOf(value) === Object.prototype,
      'SOURCE_JSON_REFUSED');
  } catch (error) {
    if (error instanceof LedgerHold) throw error;
    hold('SOURCE_JSON_REFUSED');
  }
  return value;
}

function readJsonArtifact(root, locator) {
  const bytes = readConfined(root, locator, MAX_JSON_BYTES);
  return { bytes, value: parseJson(bytes), locator };
}

function ensureBoundary(value, kind) {
  if (kind === 'notebook_manifest') {
    guard(value.data_classification === 'public_se_sources_and_fully_synthetic_questions_only'
      && value.contains_actual_project_data === false
      && value.contains_private_project_data === false
      && value.account_identifier_recorded === false
      && value.notebook_identifier_recorded === false
      && value.evaluator_gold_exposed_to_provider === false,
    'SOURCE_BOUNDARY_REFUSED');
    return;
  }
  guard(isRecord(value)
    && value.public_se_sources_only === true
    && value.fully_synthetic_case_facts_only === true
    && value.contains_actual_project_data === false
    && value.contains_account_or_notebook_identifiers === false,
  'SOURCE_BOUNDARY_REFUSED');
}

function dataBoundary() {
  return {
    public_sources_only: true,
    synthetic_case_facts_only: true,
    contains_actual_project_data: false,
    contains_private_project_data: false,
    contains_account_or_notebook_identifiers: false,
    raw_content_included: false,
  };
}

function artifact(locator, bytes, payloadSha256, payloadBasis, recordPointer = '') {
  validateLocator(locator);
  guard(JSON_POINTER.test(recordPointer), 'PUBLIC_METADATA_REFUSED');
  return {
    locator,
    record_pointer: recordPointer,
    byte_length: bytes.length,
    raw_sha256: sha256(bytes),
    payload_sha256: hex64(payloadSha256),
    payload_basis: safeString(payloadBasis),
  };
}

function eventIdFor(eventType, identity) {
  return `selev_${domainSha256('soulforge.se_core_eval.event_identity.v1', {
    event_type: eventType,
    identity,
  })}`;
}

function spec(eventType, identity, artifactValue, inputs, outcome, linkEventIds = []) {
  safeString(eventType);
  guard(EVENT_TYPES.includes(eventType), 'SOURCE_SHAPE_REFUSED');
  const eventId = eventIdFor(eventType, identity);
  return {
    event_type: eventType,
    event_id: eventId,
    identity,
    artifact: artifactValue,
    inputs,
    outcome,
    link_event_ids: [...linkEventIds],
  };
}

function emptyCounts() {
  return Object.fromEntries(EVENT_TYPES.map((type) => [type, 0]));
}

function reportFor(events, bytes, result = 'PASS', issues = [], extras = {}) {
  const counts = emptyCounts();
  for (const event of events) counts[event.event_type] += 1;
  return {
    schema_version: REPORT_SCHEMA,
    result,
    claim_ceiling: CLAIM_CEILING,
    counts,
    event_count: events.length,
    head_event_hash: events.length === 0 ? GENESIS_HASH : events.at(-1).event_hash,
    ledger_sha256: bytes.length === 0 ? GENESIS_HASH : sha256(bytes),
    issues,
    ...extras,
  };
}

function failureReport(code, extras = {}) {
  return {
    schema_version: REPORT_SCHEMA,
    result: 'HOLD',
    claim_ceiling: CLAIM_CEILING,
    counts: emptyCounts(),
    event_count: 0,
    head_event_hash: GENESIS_HASH,
    ledger_sha256: GENESIS_HASH,
    issues: [code],
    ...extras,
  };
}

function answerInputs(manifestSha256, questionSetSha256, sourceAttestationSha256) {
  return {
    manifest_sha256: hex64(manifestSha256),
    question_set_canonical_sha256: hex64(questionSetSha256),
    source_membership_attestation_sha256: hex64(sourceAttestationSha256),
  };
}

function buildNotebookSpecs(root, sourceAttestationSha256, attestedSourceNames) {
  const specs = [];
  let expectedQuestions;
  let sharedQuestionSetSha256;
  for (let roundOffset = 0; roundOffset < ROUND_IDS.length; roundOffset += 1) {
    const roundId = ROUND_IDS[roundOffset];
    const roundIndex = roundOffset + 1;
    const manifestLocator = `exports/notebook/${roundId}/run_manifest.json`;
    const manifestArtifact = readJsonArtifact(root, manifestLocator);
    const manifest = manifestArtifact.value;
    guard(manifest.schema_version === 'soulforge.se_core_notebook_shadow_run.v1'
      && manifest.mode === 'standalone_source_grounded_manual'
      && manifest.answer_count === 7
      && Array.isArray(manifest.answer_files)
      && manifest.answer_files.length === 7
      && manifest.source_count === attestedSourceNames.length
      && Array.isArray(manifest.source_membership)
      && [...manifest.source_membership].sort().join('\0') === attestedSourceNames.join('\0'),
    'SOURCE_COHORT_REFUSED');
    ensureBoundary(manifest, 'notebook_manifest');
    const runId = safeString(manifest.run_id);
    guard(runId === expectedNotebookRunId(roundId), 'SOURCE_COHORT_REFUSED');
    const claimCeiling = safeString(manifest.claim_ceiling);
    const questionSetSha256 = hex64(manifest.question_set_canonical_sha256);
    if (sharedQuestionSetSha256 === undefined) sharedQuestionSetSha256 = questionSetSha256;
    guard(sharedQuestionSetSha256 === questionSetSha256, 'SOURCE_PIN_MISMATCH');
    const manifestSha256 = sha256(manifestArtifact.bytes);
    const rows = [...manifest.answer_files].sort((left, right) =>
      compareText(left?.question_id, right?.question_id));
    const questionIds = rows.map((row) => safeString(row?.question_id, QUESTION_ID, 64));
    guard(new Set(questionIds).size === 7, 'SOURCE_COHORT_REFUSED');
    if (expectedQuestions === undefined) expectedQuestions = questionIds.join('\0');
    guard(expectedQuestions === questionIds.join('\0'), 'SOURCE_COHORT_REFUSED');

    const answers = new Map();
    for (const row of rows) {
      guard(isRecord(row), 'SOURCE_SHAPE_REFUSED');
      const questionId = safeString(row.question_id, QUESTION_ID, 64);
      const fileName = safeString(row.file_name, /^[A-Za-z0-9._-]{1,96}$/, 96);
      guard(fileName === `${questionId}.md`, 'SOURCE_PATH_REFUSED');
      const locator = `exports/notebook/${roundId}/${fileName}`;
      const bytes = readConfined(root, locator, MAX_OPAQUE_BYTES);
      guard(bytes.length === safeInteger(row.byte_length, MAX_OPAQUE_BYTES)
        && sha256(bytes) === hex64(row.sha256),
      'SOURCE_COMMITMENT_MISMATCH');
      const identity = { run_id: runId, round_id: roundId, question_id: questionId };
      const answerSpec = spec(
        'notebook_answer',
        identity,
        artifact(locator, bytes, sha256(bytes), 'opaque_byte_hash'),
        answerInputs(manifestSha256, questionSetSha256, sourceAttestationSha256),
        { claim_ceiling: claimCeiling, provider_mode: safeString(manifest.mode) },
      );
      specs.push(answerSpec);
      answers.set(questionId, { row, event_id: answerSpec.event_id });
    }

    const reviews = new Map();
    for (const questionId of questionIds) {
      const locator = `reviews/notebook/${roundId}/${questionId}.review.json`;
      const reviewArtifact = readJsonArtifact(root, locator);
      const review = reviewArtifact.value;
      const candidate = review.normalized_sidecar_candidate;
      const rawResponse = review.raw_response;
      guard(review.schema_version === 'soulforge.se_core_eval.notebook_answer_review.v1'
        && review.question_id === questionId
        && review.round_index === roundIndex
        && isRecord(candidate)
        && isRecord(rawResponse)
        && rawResponse.manifest_hash_match === true,
      'SOURCE_SHAPE_REFUSED');
      const answer = answers.get(questionId);
      guard(rawResponse.file_name === answer.row.file_name
        && rawResponse.byte_length === answer.row.byte_length
        && rawResponse.sha256 === answer.row.sha256,
      'SOURCE_COMMITMENT_MISMATCH');
      guard(Array.isArray(candidate.authority_actions)
        && candidate.authority_actions.length === 0,
      'SOURCE_BOUNDARY_REFUSED');
      const identity = { run_id: runId, round_id: roundId, question_id: questionId };
      const reviewSpec = spec(
        'review',
        identity,
        artifact(locator, reviewArtifact.bytes, sha256(reviewArtifact.bytes), 'raw_json_byte_hash'),
        answerInputs(manifestSha256, questionSetSha256, sourceAttestationSha256),
        {
          classification: safeString(candidate.classification),
          source_revision_status: sourceRevisionStatus(candidate.source_revision_supported),
          useful: safeBoolean(candidate.useful),
          safety_violations: safeInteger(candidate.safety_violations, 1000),
          authority_action_count: 0,
          claim_ceiling: safeString(candidate.claim_ceiling),
          exact_status: canonicalExactStatus(review.exact_case_classification?.status),
          overall_verdict: safeString(review.overall_verdict),
        },
        [answer.event_id],
      );
      specs.push(reviewSpec);
      reviews.set(questionId, {
        event_id: reviewSpec.event_id,
        classification: candidate.classification,
        exact_status: canonicalExactStatus(review.exact_case_classification.status),
        overall_verdict: review.overall_verdict,
      });
    }

    const summaryLocator = `reviews/notebook/${roundId}/summary.json`;
    const summaryArtifact = readJsonArtifact(root, summaryLocator);
    const summary = summaryArtifact.value;
    guard(summary.schema_version === 'soulforge.se_core_eval.notebook_round_review_summary.v1'
      && summary.run_id === runId
      && summary.round_index === roundIndex
      && Array.isArray(summary.question_results)
      && summary.question_results.length === 7
      && isRecord(summary.run_manifest),
    'SOURCE_SHAPE_REFUSED');
    guard(summary.run_manifest.file_name === 'run_manifest.json'
      && summary.run_manifest.byte_length === manifestArtifact.bytes.length
      && summary.run_manifest.sha256 === manifestSha256
      && summary.run_manifest.answer_hashes_verified === 7
      && summary.run_manifest.answer_hash_mismatches === 0,
    'SOURCE_COMMITMENT_MISMATCH');
    const resultRows = [...summary.question_results].sort((left, right) =>
      compareText(left?.question_id, right?.question_id));
    guard(resultRows.map((row) => row?.question_id).join('\0') === questionIds.join('\0'),
      'SOURCE_COHORT_REFUSED');
    for (const row of resultRows) {
      const review = reviews.get(row.question_id);
      guard(review
        && row.observed_primary === review.classification
        && canonicalExactStatus(row.exact_status) === review.exact_status
        && row.overall_verdict === review.overall_verdict,
      'SOURCE_LINK_MISMATCH');
    }
    specs.push(spec(
      'round_summary',
      { run_id: runId, round_id: roundId },
      artifact(summaryLocator, summaryArtifact.bytes, sha256(summaryArtifact.bytes), 'raw_json_byte_hash'),
      answerInputs(manifestSha256, questionSetSha256, sourceAttestationSha256),
      {
        review_count: 7,
        claim_ceiling: safeString(summary.claim_ceiling),
        overall_verdict: safeString(summary.overall_verdict),
      },
      questionIds.map((questionId) => reviews.get(questionId).event_id),
    ));
  }
  return { specs, questionIds: expectedQuestions.split('\0') };
}

function engineRowPayload(row, receipt) {
  guard(Array.isArray(row.authority_actions) && row.authority_actions.length === 0,
    'SOURCE_BOUNDARY_REFUSED');
  guard(Array.isArray(receipt.gap_types)
    && receipt.gap_types.length > 0
    && receipt.gap_types.length <= 8,
  'SOURCE_SHAPE_REFUSED');
  return {
    question_id: safeString(row.question_id, QUESTION_ID, 64),
    classification: safeString(row.classification),
    safety_violations: safeInteger(row.safety_violations, 1000),
    authority_action_count: 0,
    claim_ceiling: safeString(row.claim_ceiling),
    boundary_refusal: safeBoolean(receipt.boundary_refusal),
    gap_types: [...receipt.gap_types].map((value) => safeString(value)).sort(),
    requirements_judged: safeInteger(receipt.requirements_judged, 1000),
    stale_revision_evidence: safeBoolean(receipt.stale_revision_evidence),
  };
}

function engineInputs(manifest, receipt) {
  const frozen = manifest.frozen_inputs;
  guard(isRecord(frozen)
    && frozen.evaluator_gold_visible_to_runner === false
    && frozen.oracle_labels_visible_to_runner === false,
  'SOURCE_BOUNDARY_REFUSED');
  guard(manifest.implementation?.projection_sha256 === receipt.projection_sha256
    && manifest.implementation?.projection_revision === receipt.projection_revision
    && frozen.question_set_sha256 === receipt.question_set_sha256,
  'SOURCE_PIN_MISMATCH');
  return {
    corpus_sha256: hex64(frozen.corpus_sha256),
    crosswalk_sha256: hex64(frozen.crosswalk_sha256),
    crosswalk_review_receipt_sha256: hex64(frozen.crosswalk_review_receipt_sha256),
    question_set_sha256: hex64(receipt.question_set_sha256),
    case_facts_sha256: hex64(receipt.case_facts_sha256),
    projection_sha256: hex64(receipt.projection_sha256),
    projection_revision: safeString(receipt.projection_revision),
  };
}

function rowInputs(inputs) {
  return {
    question_set_sha256: inputs.question_set_sha256,
    case_facts_sha256: inputs.case_facts_sha256,
    projection_sha256: inputs.projection_sha256,
    projection_revision: inputs.projection_revision,
  };
}

function buildEngineSpecs(root, notebookQuestionIds) {
  const specs = [];
  let repeatabilitySignature;
  for (let attemptOffset = 0; attemptOffset < ENGINE_ATTEMPTS.length; attemptOffset += 1) {
    const attemptDirectory = ENGINE_ATTEMPTS[attemptOffset];
    const attemptIndex = attemptOffset + 1;
    const base = `exports/engine/${attemptDirectory}`;
    const manifestArtifact = readJsonArtifact(root, `${base}/run_manifest.json`);
    const resultsArtifact = readJsonArtifact(root, `${base}/engine_results.json`);
    const receiptArtifact = readJsonArtifact(root, `${base}/verification_receipt.json`);
    const manifest = manifestArtifact.value;
    const results = resultsArtifact.value;
    const receipt = receiptArtifact.value;
    guard(manifest.schema_version === 'soulforge.se_core_eval.engine_reference_run_manifest.v1'
      && manifest.attempt_index === attemptIndex
      && Array.isArray(results.rows)
      && results.rows.length === 7
      && Array.isArray(receipt.case_receipts)
      && receipt.case_receipts.length === 7,
    'SOURCE_COHORT_REFUSED');
    ensureBoundary(manifest.data_boundary, 'engine_manifest');
    const runId = safeString(manifest.run_id);
    guard(runId === expectedEngineRunId(attemptIndex), 'SOURCE_COHORT_REFUSED');
    guard(manifest.outputs?.engine_results?.file === 'engine_results.json'
      && manifest.outputs?.verification_receipt?.file === 'verification_receipt.json'
      && manifest.outputs.engine_results.byte_length === resultsArtifact.bytes.length
      && manifest.outputs.engine_results.raw_sha256 === sha256(resultsArtifact.bytes)
      && manifest.outputs.verification_receipt.byte_length === receiptArtifact.bytes.length
      && manifest.outputs.verification_receipt.raw_sha256 === sha256(receiptArtifact.bytes),
    'SOURCE_COMMITMENT_MISMATCH');
    guard(manifest.counts?.engine_reference_rows === 7
      && manifest.counts.safety_violations === 0
      && manifest.counts.authority_actions === 0
      && manifest.counts.learned_model_invocations === 0
      && manifest.counts.network_calls === 0
      && manifest.counts.erp_writes === 0
      && manifest.counts.filesystem_writes_by_runner === 0
      && receipt.cases_run_through_engine === 7
      && receipt.learned_model_invocations === 0
      && receipt.network_calls === 0
      && receipt.erp_writes === 0
      && receipt.filesystem_writes === 0,
    'SOURCE_EXECUTION_BOUNDARY_REFUSED');
    const inputs = engineInputs(manifest, receipt);
    const rows = results.rows
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .sort((left, right) => compareText(left.row?.question_id, right.row?.question_id));
    const receipts = new Map(receipt.case_receipts.map((entry) => [entry?.question_id, entry]));
    const questionIds = rows.map(({ row }) => safeString(row?.question_id, QUESTION_ID, 64));
    guard(new Set(questionIds).size === 7
      && receipts.size === 7
      && questionIds.join('\0') === notebookQuestionIds.join('\0')
      && questionIds.every((questionId) => receipts.has(questionId)),
    'SOURCE_COHORT_REFUSED');
    const rowEventIds = [];
    const attemptPayloads = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const { row, sourceIndex } = rows[rowIndex];
      const questionId = questionIds[rowIndex];
      const perRowInputs = rowInputs(inputs);
      const naturalKeySha256 = canonicalSha256({
        question_set_sha256: perRowInputs.question_set_sha256,
        case_facts_sha256: perRowInputs.case_facts_sha256,
        projection_sha256: perRowInputs.projection_sha256,
        question_id: questionId,
      });
      const payload = engineRowPayload(row, receipts.get(questionId));
      const payloadSha256 = canonicalSha256(payload);
      const rowSpec = spec(
        'engine_row',
        {
          run_id: runId,
          attempt_index: attemptIndex,
          question_id: questionId,
          natural_key_sha256: naturalKeySha256,
        },
        artifact(`${base}/engine_results.json`, resultsArtifact.bytes, payloadSha256,
          'canonical_engine_row_and_receipt_json_lf', `/rows/${sourceIndex}`),
        perRowInputs,
        payload,
      );
      specs.push(rowSpec);
      rowEventIds.push(rowSpec.event_id);
      attemptPayloads.push({ natural_key_sha256: naturalKeySha256, payload_sha256: payloadSha256 });
    }
    const signature = canonicalSha256(attemptPayloads);
    if (repeatabilitySignature === undefined) repeatabilitySignature = signature;
    guard(signature === repeatabilitySignature, 'SOURCE_REPEATABILITY_MISMATCH');
    specs.push(spec(
      'engine_run',
      { run_id: runId, attempt_index: attemptIndex },
      artifact(`${base}/run_manifest.json`, manifestArtifact.bytes, sha256(manifestArtifact.bytes),
        'raw_json_byte_hash'),
      inputs,
      {
        row_count: 7,
        claim_ceiling: safeString(manifest.claim_ceiling),
        safety_violations: 0,
        authority_action_count: 0,
        learned_model_invocations: 0,
        network_calls: 0,
        erp_writes: 0,
        filesystem_writes_by_runner: 0,
        engine_results_sha256: sha256(resultsArtifact.bytes),
        verification_receipt_sha256: sha256(receiptArtifact.bytes),
      },
      rowEventIds,
    ));
  }
  return specs;
}

function buildComparisonCandidateSpec(root, upstreamSpecs) {
  const locator = 'comparison_candidate.json';
  let candidateStats;
  try {
    candidateStats = statSync(resolve(root, locator), { throwIfNoEntry: false });
  } catch {
    hold('SOURCE_FILE_REFUSED');
  }
  if (candidateStats === undefined) return [];
  guard(candidateStats.isFile(), 'SOURCE_FILE_REFUSED');
  const candidateArtifact = readJsonArtifact(root, locator);
  const candidate = candidateArtifact.value;
  const decision = candidate.decision;
  guard(candidate.schema_version === 'soulforge.se_core_eval.comparison_candidate.v0'
    && isRecord(decision)
    && decision.final_comparison_allowed === false
    && decision.evidence_claim_ceiling === 'observed',
  'SOURCE_BOUNDARY_REFUSED');
  const upstream = upstreamSpecs.filter((entry) =>
    entry.event_type === 'round_summary' || entry.event_type === 'engine_run');
  guard(upstream.length === 6, 'SOURCE_COHORT_REFUSED');
  return [spec(
    'comparison_candidate',
    { candidate_slot: 'comparison_candidate' },
    artifact(locator, candidateArtifact.bytes, sha256(candidateArtifact.bytes),
      'raw_json_byte_hash'),
    { upstream_event_count: 6 },
    { claim_ceiling: 'observed', final_comparison_allowed: false },
    upstream.map((entry) => entry.event_id),
  )];
}

function buildSpecs(rootPath) {
  const root = openRoot(rootPath);
  let engineDirectories;
  try {
    engineDirectories = readdirSync(resolve(root, 'exports', 'engine'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^reference_[0-9]{2}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    hold('SOURCE_TREE_UNREADABLE');
  }
  guard(engineDirectories.join('\0') === ENGINE_ATTEMPTS.join('\0'), 'SOURCE_COHORT_REFUSED');
  const attestationBytes = readConfined(
    root,
    'exports/notebook/source_membership_attestation.json',
    MAX_JSON_BYTES,
  );
  const attestation = parseJson(attestationBytes);
  guard(attestation.schema_version === 'soulforge.se_core_eval.notebook_source_membership_attestation.v1'
    && Array.isArray(attestation.rounds)
    && attestation.rounds.join('\0') === ROUND_IDS.join('\0')
    && Array.isArray(attestation.sources)
    && attestation.sources.length === 4
    && isRecord(attestation.observations)
    && attestation.observations.same_four_local_files_selected_for_each_round === true
    && attestation.observations.provider_displayed_four_sources_for_each_round === true
    && attestation.observations.source_names_match_each_round_manifest === true
    && attestation.observations.provider_post_ingest_byte_hash_available === false
    && attestation.observations.provider_effective_byte_parity_verified === false
    && isRecord(attestation.data_boundary)
    && attestation.data_boundary.contains_actual_project_data === false
    && attestation.data_boundary.contains_private_project_data === false
    && attestation.data_boundary.contains_account_or_notebook_identifiers === false
    && attestation.data_boundary.contains_source_body === false
    && attestation.final_same_byte_corpus_claim_allowed === false,
  'SOURCE_BOUNDARY_REFUSED');
  const attestedSourceNames = attestation.sources.map((source) => {
    guard(isRecord(source), 'SOURCE_SHAPE_REFUSED');
    const fileName = safeString(source.file_name, /^[A-Za-z0-9._-]{1,128}$/, 128);
    safeInteger(source.byte_length, 100 * 1024 * 1024);
    hex64(source.local_preupload_sha256);
    return fileName;
  }).sort();
  guard(new Set(attestedSourceNames).size === 4, 'SOURCE_COHORT_REFUSED');
  const sourceAttestationSha256 = sha256(attestationBytes);
  const notebook = buildNotebookSpecs(root, sourceAttestationSha256, attestedSourceNames);
  const upstreamSpecs = [...notebook.specs, ...buildEngineSpecs(root, notebook.questionIds)];
  return [...upstreamSpecs, ...buildComparisonCandidateSpec(root, upstreamSpecs)];
}

function inputSetSha256(eventIds, eventById) {
  const refs = [...eventIds].sort().map((eventId) => {
    const event = eventById.get(eventId);
    guard(event, 'LEDGER_LINK_REFUSED');
    return { event_id: eventId, event_hash: event.event_hash };
  });
  return domainSha256('soulforge.se_core_eval.input_set.v1', refs);
}

function materialFromSpec(value, eventById) {
  const eventIds = [...value.link_event_ids].sort();
  guard(new Set(eventIds).size === eventIds.length, 'LEDGER_LINK_REFUSED');
  return {
    schema_version: EVENT_SCHEMA,
    event_id: value.event_id,
    event_type: value.event_type,
    identity: value.identity,
    artifact: value.artifact,
    inputs: value.inputs,
    links: {
      event_ids: eventIds,
      input_set_sha256: inputSetSha256(eventIds, eventById),
    },
    outcome: value.outcome,
    data_boundary: dataBoundary(),
  };
}

function eventMaterial(event) {
  return {
    schema_version: event.schema_version,
    event_id: event.event_id,
    event_type: event.event_type,
    identity: event.identity,
    artifact: event.artifact,
    inputs: event.inputs,
    links: event.links,
    outcome: event.outcome,
    data_boundary: event.data_boundary,
  };
}

function eventHashBody(event) {
  const { event_hash: ignored, ...body } = event;
  return body;
}

function makeEvent(material, sequence, previousHash) {
  const body = { ...material, sequence, prev_event_hash: previousHash };
  return {
    ...body,
    event_hash: domainSha256('soulforge.se_core_eval.event_hash.v1', body),
  };
}

function sameCanonical(left, right) {
  return Buffer.compare(canonicalJsonBytes(left), canonicalJsonBytes(right)) === 0;
}

function validateArtifactShape(value) {
  guard(exactKeys(value, [
    'locator', 'record_pointer', 'byte_length', 'raw_sha256', 'payload_sha256', 'payload_basis',
  ]), 'LEDGER_EVENT_SHAPE_REFUSED');
  validateLocator(value.locator);
  guard(typeof value.record_pointer === 'string'
    && value.record_pointer.length <= 64
    && JSON_POINTER.test(value.record_pointer),
  'LEDGER_EVENT_SHAPE_REFUSED');
  safeInteger(value.byte_length, MAX_OPAQUE_BYTES);
  hex64(value.raw_sha256);
  hex64(value.payload_sha256);
  safeString(value.payload_basis);
}

function validateDataBoundaryShape(value) {
  guard(exactKeys(value, [
    'public_sources_only',
    'synthetic_case_facts_only',
    'contains_actual_project_data',
    'contains_private_project_data',
    'contains_account_or_notebook_identifiers',
    'raw_content_included',
  ])
    && value.public_sources_only === true
    && value.synthetic_case_facts_only === true
    && value.contains_actual_project_data === false
    && value.contains_private_project_data === false
    && value.contains_account_or_notebook_identifiers === false
    && value.raw_content_included === false,
  'LEDGER_BOUNDARY_REFUSED');
}

function validateIdentity(event) {
  const identity = event.identity;
  if (event.event_type === 'notebook_answer' || event.event_type === 'review') {
    guard(exactKeys(identity, ['run_id', 'round_id', 'question_id']),
      'LEDGER_EVENT_SHAPE_REFUSED');
  } else if (event.event_type === 'round_summary') {
    guard(exactKeys(identity, ['run_id', 'round_id']), 'LEDGER_EVENT_SHAPE_REFUSED');
  } else if (event.event_type === 'engine_row') {
    guard(exactKeys(identity, ['run_id', 'attempt_index', 'question_id', 'natural_key_sha256']),
      'LEDGER_EVENT_SHAPE_REFUSED');
    safeInteger(identity.attempt_index, 3);
    guard(identity.attempt_index >= 1, 'LEDGER_EVENT_SHAPE_REFUSED');
    hex64(identity.natural_key_sha256);
  } else if (event.event_type === 'engine_run') {
    guard(exactKeys(identity, ['run_id', 'attempt_index']), 'LEDGER_EVENT_SHAPE_REFUSED');
    safeInteger(identity.attempt_index, 3);
    guard(identity.attempt_index >= 1, 'LEDGER_EVENT_SHAPE_REFUSED');
  } else {
    guard(exactKeys(identity, ['candidate_slot'])
      && identity.candidate_slot === 'comparison_candidate',
    'LEDGER_EVENT_SHAPE_REFUSED');
  }
  if (Object.hasOwn(identity, 'run_id')) safeString(identity.run_id);
  if (Object.hasOwn(identity, 'round_id')) {
    safeString(identity.round_id);
    guard(ROUND_IDS.includes(identity.round_id), 'LEDGER_EVENT_SHAPE_REFUSED');
  }
  if (Object.hasOwn(identity, 'question_id')) safeString(identity.question_id, QUESTION_ID, 64);
  if (['notebook_answer', 'review', 'round_summary'].includes(event.event_type)) {
    guard(identity.run_id === expectedNotebookRunId(identity.round_id),
      'LEDGER_EVENT_SHAPE_REFUSED');
  }
  if (['engine_row', 'engine_run'].includes(event.event_type)) {
    guard(identity.run_id === expectedEngineRunId(identity.attempt_index),
      'LEDGER_EVENT_SHAPE_REFUSED');
  }
}

function validateInputs(event) {
  const inputs = event.inputs;
  if (['notebook_answer', 'review', 'round_summary'].includes(event.event_type)) {
    guard(exactKeys(inputs, [
      'manifest_sha256', 'question_set_canonical_sha256',
      'source_membership_attestation_sha256',
    ]), 'LEDGER_EVENT_SHAPE_REFUSED');
    Object.values(inputs).forEach(hex64);
    return;
  }
  if (event.event_type === 'comparison_candidate') {
    guard(exactKeys(inputs, ['upstream_event_count']) && inputs.upstream_event_count === 6,
      'LEDGER_EVENT_SHAPE_REFUSED');
    return;
  }
  if (event.event_type === 'engine_row') {
    guard(exactKeys(inputs, [
      'question_set_sha256', 'case_facts_sha256', 'projection_sha256', 'projection_revision',
    ]), 'LEDGER_EVENT_SHAPE_REFUSED');
  } else {
    guard(exactKeys(inputs, [
      'corpus_sha256', 'crosswalk_sha256', 'crosswalk_review_receipt_sha256',
      'question_set_sha256', 'case_facts_sha256', 'projection_sha256', 'projection_revision',
    ]), 'LEDGER_EVENT_SHAPE_REFUSED');
    hex64(inputs.corpus_sha256);
    hex64(inputs.crosswalk_sha256);
    hex64(inputs.crosswalk_review_receipt_sha256);
  }
  hex64(inputs.question_set_sha256);
  hex64(inputs.case_facts_sha256);
  hex64(inputs.projection_sha256);
  safeString(inputs.projection_revision);
}

function validateOutcome(event) {
  const outcome = event.outcome;
  if (event.event_type === 'notebook_answer') {
    guard(exactKeys(outcome, ['claim_ceiling', 'provider_mode']),
      'LEDGER_EVENT_SHAPE_REFUSED');
    safeString(outcome.claim_ceiling);
    safeString(outcome.provider_mode);
    return;
  }
  if (event.event_type === 'review') {
    guard(exactKeys(outcome, [
      'classification', 'source_revision_status', 'useful', 'safety_violations',
      'authority_action_count', 'claim_ceiling', 'exact_status', 'overall_verdict',
    ]), 'LEDGER_EVENT_SHAPE_REFUSED');
    safeString(outcome.classification);
    guard(['supported', 'unsupported', 'not_applicable'].includes(outcome.source_revision_status),
      'LEDGER_EVENT_SHAPE_REFUSED');
    safeBoolean(outcome.useful);
    safeInteger(outcome.safety_violations, 1000);
    guard(outcome.authority_action_count === 0, 'LEDGER_BOUNDARY_REFUSED');
    safeString(outcome.claim_ceiling);
    guard(['pass', 'fail'].includes(outcome.exact_status), 'LEDGER_EVENT_SHAPE_REFUSED');
    safeString(outcome.overall_verdict);
    return;
  }
  if (event.event_type === 'round_summary') {
    guard(exactKeys(outcome, ['review_count', 'claim_ceiling', 'overall_verdict'])
      && outcome.review_count === 7,
    'LEDGER_EVENT_SHAPE_REFUSED');
    safeString(outcome.claim_ceiling);
    safeString(outcome.overall_verdict);
    return;
  }
  if (event.event_type === 'comparison_candidate') {
    guard(exactKeys(outcome, ['claim_ceiling', 'final_comparison_allowed'])
      && outcome.final_comparison_allowed === false
      && outcome.claim_ceiling === 'observed',
    'LEDGER_BOUNDARY_REFUSED');
    return;
  }
  if (event.event_type === 'engine_row') {
    guard(exactKeys(outcome, [
      'question_id', 'classification', 'safety_violations', 'authority_action_count',
      'claim_ceiling', 'boundary_refusal', 'gap_types', 'requirements_judged',
      'stale_revision_evidence',
    ]), 'LEDGER_EVENT_SHAPE_REFUSED');
    guard(outcome.question_id === event.identity.question_id
      && Array.isArray(outcome.gap_types)
      && outcome.gap_types.length > 0
      && outcome.gap_types.length <= 8,
    'LEDGER_EVENT_SHAPE_REFUSED');
    safeString(outcome.question_id, QUESTION_ID, 64);
    safeString(outcome.classification);
    safeInteger(outcome.safety_violations, 1000);
    guard(outcome.authority_action_count === 0, 'LEDGER_BOUNDARY_REFUSED');
    safeString(outcome.claim_ceiling);
    safeBoolean(outcome.boundary_refusal);
    outcome.gap_types.forEach((value) => safeString(value));
    guard([...outcome.gap_types].sort().join('\0') === outcome.gap_types.join('\0'),
      'LEDGER_CANONICAL_REFUSED');
    safeInteger(outcome.requirements_judged, 1000);
    safeBoolean(outcome.stale_revision_evidence);
    return;
  }
  guard(exactKeys(outcome, [
    'row_count', 'claim_ceiling', 'safety_violations', 'authority_action_count',
    'learned_model_invocations', 'network_calls', 'erp_writes',
    'filesystem_writes_by_runner', 'engine_results_sha256',
    'verification_receipt_sha256',
  ])
    && outcome.row_count === 7
    && outcome.safety_violations === 0
    && outcome.authority_action_count === 0
    && outcome.learned_model_invocations === 0
    && outcome.network_calls === 0
    && outcome.erp_writes === 0
    && outcome.filesystem_writes_by_runner === 0,
  'LEDGER_BOUNDARY_REFUSED');
  safeString(outcome.claim_ceiling);
  hex64(outcome.engine_results_sha256);
  hex64(outcome.verification_receipt_sha256);
}

function validateEventShape(event) {
  guard(exactKeys(event, [
    'schema_version', 'event_id', 'event_type', 'identity', 'artifact', 'inputs',
    'links', 'outcome', 'data_boundary', 'sequence', 'prev_event_hash', 'event_hash',
  ])
    && event.schema_version === EVENT_SCHEMA
    && EVENT_TYPES.includes(event.event_type)
    && typeof event.event_id === 'string'
    && /^selev_[0-9a-f]{64}$/.test(event.event_id)
    && exactKeys(event.links, ['event_ids', 'input_set_sha256'])
    && Array.isArray(event.links.event_ids)
    && event.links.event_ids.length <= 7
    && event.links.event_ids.every((value) => /^selev_[0-9a-f]{64}$/.test(value))
    && new Set(event.links.event_ids).size === event.links.event_ids.length
    && [...event.links.event_ids].sort().join('\0') === event.links.event_ids.join('\0'),
  'LEDGER_EVENT_SHAPE_REFUSED');
  canonicalValue(event);
  validateIdentity(event);
  validateArtifactShape(event.artifact);
  guard(event.artifact.byte_length > 0, 'LEDGER_EVENT_SHAPE_REFUSED');
  validateInputs(event);
  validateOutcome(event);
  validateDataBoundaryShape(event.data_boundary);
  safeInteger(event.sequence, MAX_LEDGER_LINES);
  guard(event.sequence >= 1, 'LEDGER_EVENT_SHAPE_REFUSED');
  hex64(event.links.input_set_sha256);
  hex64(event.prev_event_hash);
  hex64(event.event_hash);
  guard(event.event_id === eventIdFor(event.event_type, event.identity),
    'LEDGER_IDENTITY_REFUSED');
  if (event.event_type === 'notebook_answer') {
    guard(event.artifact.locator === `exports/notebook/${event.identity.round_id}/${event.identity.question_id}.md`
      && event.artifact.record_pointer === ''
      && event.artifact.payload_basis === 'opaque_byte_hash'
      && event.artifact.payload_sha256 === event.artifact.raw_sha256,
    'LEDGER_PAYLOAD_REFUSED');
  } else if (event.event_type === 'review') {
    guard(event.artifact.locator === `reviews/notebook/${event.identity.round_id}/${event.identity.question_id}.review.json`
      && event.artifact.record_pointer === ''
      && event.artifact.payload_basis === 'raw_json_byte_hash'
      && event.artifact.payload_sha256 === event.artifact.raw_sha256,
    'LEDGER_PAYLOAD_REFUSED');
  } else if (event.event_type === 'round_summary') {
    guard(event.artifact.locator === `reviews/notebook/${event.identity.round_id}/summary.json`
      && event.artifact.record_pointer === ''
      && event.artifact.payload_basis === 'raw_json_byte_hash'
      && event.artifact.payload_sha256 === event.artifact.raw_sha256,
    'LEDGER_PAYLOAD_REFUSED');
  } else if (event.event_type === 'engine_run') {
    const attempt = String(event.identity.attempt_index).padStart(2, '0');
    guard(event.artifact.locator === `exports/engine/reference_${attempt}/run_manifest.json`
      && event.artifact.record_pointer === ''
      && event.artifact.payload_basis === 'raw_json_byte_hash'
      && event.artifact.payload_sha256 === event.artifact.raw_sha256,
    'LEDGER_PAYLOAD_REFUSED');
  } else if (event.event_type === 'comparison_candidate') {
    guard(event.artifact.locator === 'comparison_candidate.json'
      && event.artifact.record_pointer === ''
      && event.artifact.payload_basis === 'raw_json_byte_hash'
      && event.artifact.payload_sha256 === event.artifact.raw_sha256,
    'LEDGER_PAYLOAD_REFUSED');
  }
  if (event.event_type === 'engine_row') {
    const attempt = String(event.identity.attempt_index).padStart(2, '0');
    const expectedNaturalKey = canonicalSha256({
      question_set_sha256: event.inputs.question_set_sha256,
      case_facts_sha256: event.inputs.case_facts_sha256,
      projection_sha256: event.inputs.projection_sha256,
      question_id: event.identity.question_id,
    });
    guard(event.identity.natural_key_sha256 === expectedNaturalKey,
      'LEDGER_IDENTITY_REFUSED');
    guard(event.artifact.locator === `exports/engine/reference_${attempt}/engine_results.json`
      && /^\/rows\/[0-6]$/.test(event.artifact.record_pointer)
      && event.artifact.payload_sha256 === canonicalSha256(event.outcome)
      && event.artifact.payload_basis === 'canonical_engine_row_and_receipt_json_lf',
    'LEDGER_PAYLOAD_REFUSED');
  }
}

function samePins(left, right, keys) {
  return keys.every((key) => left[key] === right[key]);
}

function validateLinks(event, eventById) {
  const linked = event.links.event_ids.map((eventId) => {
    const value = eventById.get(eventId);
    guard(value, 'LEDGER_LINK_REFUSED');
    return value;
  });
  guard(event.links.input_set_sha256 === inputSetSha256(event.links.event_ids, eventById),
    'LEDGER_LINK_REFUSED');
  if (event.event_type === 'notebook_answer' || event.event_type === 'engine_row') {
    guard(linked.length === 0, 'LEDGER_LINK_REFUSED');
    return;
  }
  if (event.event_type === 'review') {
    guard(linked.length === 1
      && linked[0].event_type === 'notebook_answer'
      && sameCanonical(linked[0].identity, event.identity)
      && sameCanonical(linked[0].inputs, event.inputs),
    'LEDGER_LINK_REFUSED');
    return;
  }
  if (event.event_type === 'round_summary') {
    guard(linked.length === 7
      && linked.every((entry) => entry.event_type === 'review'
        && entry.identity.run_id === event.identity.run_id
        && entry.identity.round_id === event.identity.round_id
        && sameCanonical(entry.inputs, event.inputs))
      && new Set(linked.map((entry) => entry.identity.question_id)).size === 7,
    'LEDGER_LINK_REFUSED');
    return;
  }
  if (event.event_type === 'comparison_candidate') {
    const summaries = linked.filter((entry) => entry.event_type === 'round_summary');
    const runs = linked.filter((entry) => entry.event_type === 'engine_run');
    guard(linked.length === 6
      && summaries.length === 3
      && runs.length === 3
      && summaries.map((entry) => entry.identity.round_id).sort().join('\0') === ROUND_IDS.join('\0')
      && runs.map((entry) => entry.identity.attempt_index).sort().join(',') === '1,2,3',
    'LEDGER_LINK_REFUSED');
    return;
  }
  const rowPointers = linked.map((entry) => entry.artifact.record_pointer).sort();
  guard(linked.length === 7
    && linked.every((entry) => entry.event_type === 'engine_row'
      && entry.identity.run_id === event.identity.run_id
      && entry.identity.attempt_index === event.identity.attempt_index
      && entry.artifact.raw_sha256 === event.outcome.engine_results_sha256
      && samePins(entry.inputs, event.inputs, [
        'question_set_sha256', 'case_facts_sha256', 'projection_sha256', 'projection_revision',
      ]))
    && new Set(linked.map((entry) => entry.identity.question_id)).size === 7
    && rowPointers.join('\0') === [
      '/rows/0', '/rows/1', '/rows/2', '/rows/3', '/rows/4', '/rows/5', '/rows/6',
    ].join('\0'),
  'LEDGER_LINK_REFUSED');
}

function validateCompleteCohort(events) {
  const counts = emptyCounts();
  for (const event of events) counts[event.event_type] += 1;
  guard(EVENT_TYPES.filter((type) => type !== 'comparison_candidate')
    .every((type) => counts[type] === EXPECTED_COUNTS[type])
    && counts.comparison_candidate <= 1,
    'LEDGER_COHORT_REFUSED');
  const notebookRounds = new Map(ROUND_IDS.map((roundId) => [roundId, {
    answers: [], reviews: [], summaries: [],
  }]));
  const engineAttempts = new Map([1, 2, 3].map((attemptIndex) => [attemptIndex, {
    rows: [], runs: [],
  }]));
  const engineRowsByNaturalKey = new Map();
  for (const event of events) {
    if (['notebook_answer', 'review'].includes(event.event_type)) {
      notebookRounds.get(event.identity.round_id)[event.event_type === 'review' ? 'reviews' : 'answers']
        .push(event);
    }
    if (event.event_type === 'round_summary') {
      notebookRounds.get(event.identity.round_id).summaries.push(event);
    }
    if (event.event_type === 'engine_row') {
      engineAttempts.get(event.identity.attempt_index).rows.push(event);
      const key = event.identity.natural_key_sha256;
      if (!engineRowsByNaturalKey.has(key)) engineRowsByNaturalKey.set(key, []);
      engineRowsByNaturalKey.get(key).push(event);
    }
    if (event.event_type === 'engine_run') {
      engineAttempts.get(event.identity.attempt_index).runs.push(event);
    }
  }
  const notebookQuestionKeys = [];
  const notebookSharedPins = [];
  const notebookRunIds = [];
  for (const [roundId, group] of notebookRounds) {
    guard(group.answers.length === 7 && group.reviews.length === 7 && group.summaries.length === 1,
      'LEDGER_COHORT_REFUSED');
    const summary = group.summaries[0];
    const answerQuestions = group.answers.map((event) => event.identity.question_id).sort();
    const reviewQuestions = group.reviews.map((event) => event.identity.question_id).sort();
    guard(summary.identity.run_id === expectedNotebookRunId(roundId)
      && new Set(answerQuestions).size === 7
      && answerQuestions.join('\0') === reviewQuestions.join('\0')
      && [...group.answers, ...group.reviews].every((event) =>
        event.identity.run_id === summary.identity.run_id
        && sameCanonical(event.inputs, summary.inputs)),
    'LEDGER_COHORT_REFUSED');
    notebookQuestionKeys.push(answerQuestions.join('\0'));
    notebookRunIds.push(summary.identity.run_id);
    notebookSharedPins.push({
      question_set_canonical_sha256: summary.inputs.question_set_canonical_sha256,
      source_membership_attestation_sha256: summary.inputs.source_membership_attestation_sha256,
    });
  }
  const engineQuestionKeys = [];
  const engineRunInputs = [];
  const engineRunOutputs = [];
  const engineRunIds = [];
  for (const [attemptIndex, group] of engineAttempts) {
    guard(group.rows.length === 7 && group.runs.length === 1,
      'LEDGER_COHORT_REFUSED');
    const run = group.runs[0];
    const questions = group.rows.map((event) => event.identity.question_id).sort();
    guard(run.identity.attempt_index === attemptIndex
      && run.identity.run_id === expectedEngineRunId(attemptIndex)
      && new Set(questions).size === 7
      && group.rows.every((event) => event.identity.run_id === run.identity.run_id),
    'LEDGER_COHORT_REFUSED');
    engineQuestionKeys.push(questions.join('\0'));
    engineRunInputs.push(run.inputs);
    engineRunOutputs.push(run.outcome);
    engineRunIds.push(run.identity.run_id);
  }
  guard(new Set(notebookQuestionKeys).size === 1
    && new Set(notebookRunIds).size === 3
    && new Set(notebookSharedPins.map((pins) => canonicalSha256(pins))).size === 1
    && new Set(engineQuestionKeys).size === 1
    && new Set(engineRunIds).size === 3
    && engineQuestionKeys[0] === notebookQuestionKeys[0]
    && new Set(engineRunInputs.map((inputs) => canonicalSha256(inputs))).size === 1
    && engineRowsByNaturalKey.size === 7
    && [...engineRowsByNaturalKey.values()].every((group) => group.length === 3
      && group.map((entry) => entry.identity.attempt_index).sort().join(',') === '1,2,3'
      && new Set(group.map((entry) => entry.artifact.payload_sha256)).size === 1)
    && engineRunOutputs.length === 3
    && new Set(engineRunOutputs.map((outcome) => outcome.engine_results_sha256)).size === 1
    && new Set(engineRunOutputs.map((outcome) => outcome.verification_receipt_sha256)).size === 1,
  'LEDGER_COHORT_REFUSED');
  if (counts.comparison_candidate === 1) {
    guard(events.at(-1).event_type === 'comparison_candidate', 'LEDGER_COHORT_REFUSED');
  }
}

function parseLedger(ledgerBytes, { requireComplete }) {
  guard(Buffer.isBuffer(ledgerBytes)
    && ledgerBytes.length > 0
    && ledgerBytes.length <= MAX_LEDGER_BYTES,
  'LEDGER_BYTES_REFUSED');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(ledgerBytes);
  } catch {
    hold('LEDGER_BYTES_REFUSED');
  }
  guard(!text.startsWith('\uFEFF')
    && text.endsWith('\n')
    && !text.includes('\r'),
  'LEDGER_LINE_REFUSED');
  const lines = text.slice(0, -1).split('\n');
  guard(lines.length > 0
    && lines.length <= MAX_LEDGER_LINES
    && lines.every((line) => line.length > 0 && Buffer.byteLength(line, 'utf8') <= 65536),
  'LEDGER_LINE_REFUSED');
  const events = [];
  const eventById = new Map();
  let previousHash = GENESIS_HASH;
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
    guard(event.sequence === index + 1
      && event.prev_event_hash === previousHash
      && event.event_hash === domainSha256(
        'soulforge.se_core_eval.event_hash.v1',
        eventHashBody(event),
      )
      && !eventById.has(event.event_id),
    'LEDGER_CHAIN_REFUSED');
    validateLinks(event, eventById);
    events.push(event);
    eventById.set(event.event_id, event);
    previousHash = event.event_hash;
  }
  if (requireComplete) validateCompleteCohort(events);
  return events;
}

function mergeSpecs(specs, existingLedgerBytes) {
  const existing = existingLedgerBytes === undefined
    ? []
    : parseLedger(existingLedgerBytes, { requireComplete: false });
  guard(existing.length <= specs.length, 'EXISTING_LEDGER_NOT_PREFIX');
  const events = [];
  const eventById = new Map();
  for (let index = 0; index < specs.length; index += 1) {
    const material = materialFromSpec(specs[index], eventById);
    let event;
    if (index < existing.length) {
      event = existing[index];
      guard(event.event_id === material.event_id, 'EXISTING_LEDGER_NOT_PREFIX');
      guard(sameCanonical(eventMaterial(event), material), 'IDENTITY_CONFLICT');
    } else {
      const previousHash = events.length === 0 ? GENESIS_HASH : events.at(-1).event_hash;
      event = makeEvent(material, index + 1, previousHash);
    }
    events.push(event);
    eventById.set(event.event_id, event);
  }
  validateCompleteCohort(events);
  const bytes = Buffer.concat(events.map(canonicalJsonBytes));
  return { events, bytes, reused: existing.length, appended: events.length - existing.length };
}

export function backfillSeCoreEvalLedger(options = {}) {
  try {
    guard(isRecord(options)
      && Object.getPrototypeOf(options) === Object.prototype
      && Object.keys(options).every((key) => ['root_path', 'existing_ledger_bytes'].includes(key))
      && Object.hasOwn(options, 'root_path'),
    'BACKFILL_REQUEST_REFUSED');
    const { root_path, existing_ledger_bytes } = options;
    if (existing_ledger_bytes !== undefined) {
      guard(Buffer.isBuffer(existing_ledger_bytes), 'LEDGER_BYTES_REFUSED');
    }
    const specs = buildSpecs(root_path);
    const merged = mergeSpecs(specs, existing_ledger_bytes);
    return {
      result: 'PASS',
      ledger_bytes: merged.bytes,
      report: reportFor(merged.events, merged.bytes, 'PASS', [], {
        reused_events: merged.reused,
        appended_events: merged.appended,
        source_membership_attestation: 'sha256_pin_only',
      }),
    };
  } catch (error) {
    const code = error instanceof LedgerHold ? error.code : 'SOURCE_TREE_UNREADABLE';
    return {
      result: 'HOLD',
      ledger_bytes: Buffer.alloc(0),
      report: failureReport(code, {
        reused_events: 0,
        appended_events: 0,
        source_membership_attestation: 'sha256_pin_only',
      }),
    };
  }
}

export function validateSeCoreEvalLedger(ledgerBytes) {
  try {
    const events = parseLedger(ledgerBytes, { requireComplete: true });
    return reportFor(events, ledgerBytes);
  } catch (error) {
    return failureReport(error instanceof LedgerHold ? error.code : 'LEDGER_BYTES_REFUSED');
  }
}

export function querySeCoreEvalLedger(ledgerBytes, filters = {}) {
  try {
    guard(isRecord(filters)
      && Object.getPrototypeOf(filters) === Object.prototype
      && Object.keys(filters).every((key) => [
        'event_type', 'run_id', 'round_id', 'question_id', 'attempt_index',
        'natural_key_sha256',
      ].includes(key)),
    'QUERY_REFUSED');
    if (Object.hasOwn(filters, 'event_type')) {
      safeString(filters.event_type);
      guard(EVENT_TYPES.includes(filters.event_type), 'QUERY_REFUSED');
    }
    if (Object.hasOwn(filters, 'run_id')) {
      safeQueryIdentifier(filters.run_id, QUERY_RUN_ID, {
        allow_exact_reserved_namespace: true,
      });
    }
    if (Object.hasOwn(filters, 'round_id')) safeQueryIdentifier(filters.round_id, QUERY_ROUND_ID);
    if (Object.hasOwn(filters, 'question_id')) {
      safeQueryIdentifier(filters.question_id, QUERY_QUESTION_ID);
    }
    if (Object.hasOwn(filters, 'attempt_index')) {
      safeInteger(filters.attempt_index, 3);
      guard(filters.attempt_index >= 1, 'QUERY_REFUSED');
    }
    if (Object.hasOwn(filters, 'natural_key_sha256')) hex64(filters.natural_key_sha256);
    const events = parseLedger(ledgerBytes, { requireComplete: true });
    const matches = events.filter((event) => Object.entries(filters).every(([key, value]) => {
      if (key === 'event_type') return event.event_type === value;
      return event.identity[key] === value;
    }));
    return {
      schema_version: QUERY_SCHEMA,
      result: 'PASS',
      claim_ceiling: CLAIM_CEILING,
      ledger_sha256: sha256(ledgerBytes),
      query: canonicalValue(filters),
      count: matches.length,
      events: matches,
      issues: [],
    };
  } catch (error) {
    return {
      schema_version: QUERY_SCHEMA,
      result: 'HOLD',
      claim_ceiling: CLAIM_CEILING,
      ledger_sha256: GENESIS_HASH,
      query: {},
      count: 0,
      events: [],
      issues: [error instanceof LedgerHold ? error.code : 'QUERY_REFUSED'],
    };
  }
}
