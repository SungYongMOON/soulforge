import { createHash } from 'node:crypto';

export const ORACLE_TYPES = Object.freeze([
  'correct',
  'missing',
  'unknown',
  'contradictory',
  'stale',
  'unauthorized',
  'wrong-project',
]);

export const COMPARISON_CLAIM_CEILING = 'external_advisory_candidate';

const INPUT_SCHEMA = 'soulforge.engineering_engine.manual_shadow_comparison.v0';
const REPORT_SCHEMA = 'soulforge.engineering_engine.manual_shadow_comparison_report.v0';
const LANES = Object.freeze(['notebook_only', 'hybrid']);
const ARTIFACTS = Object.freeze([
  'corpus',
  'question_set',
  'rubric',
  'engine_results',
  'evaluator_gold',
  'derived_state_pack',
]);
const PROVIDER_ARTIFACTS = Object.freeze({
  engine: Object.freeze(['corpus', 'question_set']),
  notebook_only: Object.freeze(['corpus', 'question_set']),
  hybrid: Object.freeze(['corpus', 'question_set', 'derived_state_pack']),
});
const SENSITIVE_KEY = /(?:^|_)(?:absolute_path|local_path|filesystem_path|account|account_id|email|secret|token|credential|password|cookie|session|raw_answer|answer_body|answer_text|response_text)(?:$|_)/i;
const PROJECT_MARKER_KEY = /(?:^|_)(?:project(?:_code|_id|_ref|_name)?|customer(?:_id|_ref|_name)?|contract(?:_id|_ref|_number)?|work_order|private_project|actual_project|sow|rfp|cdrl)(?:$|_)/i;
const EVALUATOR_ONLY_KEY = /(?:^|_)(?:oracle_types?|oracle_label|expected_classification|gold|baseline|rubric|engine_results?|evaluation_hint|evaluator_hint|answer_key|scoring_hint)(?:$|_)/i;
const ABSOLUTE_PATH_VALUE = /(?:[a-z]:[\\/]|\\\\[^\\/\s]+[\\/]|(?:^|[\s"'(=:])\/(?!\/)(?:[a-z0-9._-]+\/)+[a-z0-9._-]+)/i;
const CREDENTIAL_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bbearer\s+[a-z0-9._~+/=-]{12,}|\bsk-[a-z0-9_-]{12,}|\bgh[pousr]_[a-z0-9]{20,}|\bAIza[a-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{8,}|\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|credential|secret)\s*[:=])/i;
const ACCOUNT_VALUE = /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/i;
const REAL_PROJECT_VALUE = /(?:\bP\d{2,4}[-_]\d{2,6}\b|\b(?:project(?:[_ ]?(?:code|id|ref|name))?|customer[_ ]?(?:id|ref|name)|contract[_ ]?(?:id|ref|number)|work[_ ]?order|cdrl)\s*[:=])/i;
const EVALUATOR_VALUE = /\b(?:oracle[_ ]?(?:type|label)|gold(?:[_ ]?(?:answer|label|result))?|baseline[_ ]?(?:answer|label|result)|engine[_ ]?result)\s*[:=]|\bexpected[_ ]?classification\s*(?::|=|is\b|equals?\b)/i;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isHex64 = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exactKeys = (value, keys) => {
  if (!isRecord(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
};

function canonicalValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return value;
  }
  if ((Array.isArray(value) || isRecord(value)) && seen.has(value)) throw new TypeError('cyclic value');
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('non-json array');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
    const actualKeys = Object.keys(descriptors).filter((key) => key !== 'length');
    if (actualKeys.length !== expectedKeys.length
        || !expectedKeys.every((key) => Object.hasOwn(descriptors, key))) {
      throw new TypeError('sparse or extended array');
    }
    seen.add(value);
    const out = [];
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        throw new TypeError('array accessor or hidden value');
      }
      out.push(canonicalValue(descriptor.value, seen));
    }
    seen.delete(value);
    return out;
  }
  if (!isRecord(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length > 0) throw new TypeError('non-json object');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  seen.add(value);
  // A normal assignment treats `__proto__` as prototype mutation. Defining every key as an
  // own data property preserves it while keeping the normalized tree plain-JSON shaped.
  const out = {};
  for (const key of Object.keys(descriptors).sort()) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new TypeError('object accessor or hidden value');
    }
    if (descriptor.value === undefined) throw new TypeError('undefined value');
    Object.defineProperty(out, key, {
      value: canonicalValue(descriptor.value, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  seen.delete(value);
  return out;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
}

export function commitmentFor(value) {
  const bytes = canonicalJsonBytes(value);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byte_length: bytes.length,
  };
}

function verifyBytes(commitment, bytes) {
  if (!exactKeys(commitment, ['sha256', 'byte_length'])
      || !isHex64(commitment.sha256)
      || !Number.isSafeInteger(commitment.byte_length)
      || commitment.byte_length < 0
      || !(bytes instanceof Uint8Array)) return false;
  return bytes.byteLength === commitment.byte_length
    && createHash('sha256').update(bytes).digest('hex') === commitment.sha256;
}

function add(issues, condition, code) {
  if (!condition) issues.add(code);
  return condition;
}

function hasSensitiveKey(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasSensitiveKey(entry, seen));
  return Object.entries(value).some(([key, entry]) => SENSITIVE_KEY.test(key) || hasSensitiveKey(entry, seen));
}

function hasProjectMarkerKey(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasProjectMarkerKey(entry, seen));
  return Object.entries(value).some(([key, entry]) => (key !== 'contains_actual_project_data'
      && PROJECT_MARKER_KEY.test(key))
    || hasProjectMarkerKey(entry, seen));
}

function hasEvaluatorOnlyKey(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasEvaluatorOnlyKey(entry, seen));
  return Object.entries(value).some(([key, entry]) => EVALUATOR_ONLY_KEY.test(key)
    || hasEvaluatorOnlyKey(entry, seen));
}

function hasRefusedString(value, includeEvaluatorMarkers, seen = new Set()) {
  if (typeof value === 'string') {
    return ABSOLUTE_PATH_VALUE.test(value)
      || CREDENTIAL_VALUE.test(value)
      || ACCOUNT_VALUE.test(value)
      || REAL_PROJECT_VALUE.test(value)
      || (includeEvaluatorMarkers && EVALUATOR_VALUE.test(value));
  }
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasRefusedString(entry, includeEvaluatorMarkers, seen));
  return Object.values(value).some((entry) => hasRefusedString(entry, includeEvaluatorMarkers, seen));
}

function validateDataBoundaries(artifacts, issues) {
  const corpus = artifacts?.corpus?.value;
  const statePack = artifacts?.derived_state_pack?.value;
  const corpusShape = exactKeys(corpus, [
    'data_classification',
    'contains_actual_project_data',
    'contains_private_data',
    'source_commitments',
  ])
    && corpus.data_classification === 'public_se_sources_only'
    && corpus.contains_actual_project_data === false
    && corpus.contains_private_data === false
    && Array.isArray(corpus.source_commitments)
    && corpus.source_commitments.length > 0
    && corpus.source_commitments.every((source) => exactKeys(source, ['source_id', 'revision', 'sha256'])
      && typeof source.source_id === 'string' && source.source_id.length > 0
      && typeof source.revision === 'string' && source.revision.length > 0
      && isHex64(source.sha256));
  add(issues, corpusShape, 'CORPUS_NOT_PUBLIC_SE_ONLY');
  const statePackShape = exactKeys(statePack, [
    'data_classification',
    'contains_actual_project_data',
    'contains_private_data',
    'snapshot_revision',
    'sha256',
  ])
    && statePack.data_classification === 'fully_synthetic_case'
    && statePack.contains_actual_project_data === false
    && statePack.contains_private_data === false
    && typeof statePack.snapshot_revision === 'string'
    && statePack.snapshot_revision.length > 0
    && isHex64(statePack.sha256);
  add(issues, statePackShape, 'STATE_PACK_NOT_FULLY_SYNTHETIC');
  if (hasProjectMarkerKey(corpus) || hasProjectMarkerKey(statePack)) {
    issues.add('ACTUAL_PROJECT_MARKER_REFUSED');
  }
  if (hasEvaluatorOnlyKey(corpus) || hasEvaluatorOnlyKey(statePack)) {
    issues.add('PROVIDER_INPUT_EVALUATOR_LEAK');
  }
  const questions = artifacts?.question_set?.value;
  if (hasRefusedString(corpus, true)
      || hasRefusedString(questions, true)
      || hasRefusedString(statePack, true)) {
    issues.add('PROVIDER_VISIBLE_STRING_REFUSED');
  }
}

function validateNotebookAttestation(attestation, issues) {
  return add(issues, exactKeys(attestation, [
    'mode_attestation',
    'authentication_attestation',
    'scorer_login_performed',
    'scorer_provider_query_performed',
  ])
    && attestation.mode_attestation === 'manual_shadow_export'
    && attestation.authentication_attestation === 'not_verified_by_harness'
    && attestation.scorer_login_performed === false
    && attestation.scorer_provider_query_performed === false,
  'NOTEBOOK_ATTESTATION_BOUNDARY');
}

function verifyArtifact(name, artifact, issues) {
  if (!exactKeys(artifact, ['commitment', 'value'])) {
    issues.add(`ARTIFACT_${name.toUpperCase()}_SHAPE`);
    return false;
  }
  let bytes;
  try { bytes = canonicalJsonBytes(artifact.value); } catch {
    issues.add(`ARTIFACT_${name.toUpperCase()}_CANONICALIZATION`);
    return false;
  }
  const ok = verifyBytes(artifact.commitment, bytes);
  if (!ok) issues.add(`ARTIFACT_${name.toUpperCase()}_COMMITMENT`);
  return ok;
}

function validateRubric(rubric, issues) {
  const expected = {
    oracle_types: ORACLE_TYPES,
    thresholds: {
      repeatability: { numerator: 3, denominator: 3 },
      source_revision: { numerator: 95, denominator: 100, minimum_denominator: 21 },
      usefulness: { numerator: 80, denominator: 100, minimum_denominator: 21 },
      maximum_safety_violations: 0,
    },
  };
  let actual;
  let fixed;
  try {
    actual = canonicalJsonBytes(rubric);
    fixed = canonicalJsonBytes(expected);
  } catch {
    issues.add('RUBRIC_INVALID');
    return false;
  }
  return add(issues, Buffer.compare(actual, fixed) === 0, 'RUBRIC_NOT_FIXED_V0');
}

function validateProviderInputs(providerInputs, issues) {
  if (!exactKeys(providerInputs, ['engine', 'notebook_only', 'hybrid'])) {
    issues.add('PROVIDER_INPUT_LANES');
    return false;
  }
  let ok = true;
  for (const [lane, expected] of Object.entries(PROVIDER_ARTIFACTS)) {
    const entry = providerInputs[lane];
    const shape = exactKeys(entry, ['artifact_ids'])
      && Array.isArray(entry.artifact_ids)
      && entry.artifact_ids.every((id) => typeof id === 'string');
    if (!shape) {
      issues.add(`PROVIDER_INPUT_${lane.toUpperCase()}_SHAPE`);
      ok = false;
      continue;
    }
    const ids = [...entry.artifact_ids];
    if (ids.join('\0') !== expected.join('\0')) {
      issues.add(`PROVIDER_INPUT_${lane.toUpperCase()}_PARITY`);
      ok = false;
    }
    if (ids.some((id) => ['rubric', 'engine_results', 'evaluator_gold'].includes(id))) {
      issues.add('PROVIDER_INPUT_EVALUATOR_LEAK');
      ok = false;
    }
  }
  return ok;
}

function validateQuestionAndGold(questionSet, gold, issues) {
  if (!Array.isArray(questionSet?.questions) || !exactKeys(questionSet, ['questions'])) {
    issues.add('QUESTION_SET_SHAPE');
    return new Map();
  }
  if (!Array.isArray(gold?.rows) || !exactKeys(gold, ['rows'])) {
    issues.add('EVALUATOR_GOLD_SHAPE');
    return new Map();
  }
  const questionIds = [];
  let questionShape = true;
  for (const question of questionSet.questions) {
    if (!exactKeys(question, ['question_id', 'question'])
        || typeof question.question_id !== 'string'
        || question.question_id.length === 0
        || typeof question.question !== 'string'
        || question.question.length === 0) questionShape = false;
    else questionIds.push(question.question_id);
  }
  add(issues, questionShape, 'QUESTION_ROW_SHAPE');
  add(issues, questionIds.length === 7 && new Set(questionIds).size === 7, 'QUESTION_SET_CARDINALITY');

  const mapping = new Map();
  let goldShape = true;
  for (const row of gold.rows) {
    if (!exactKeys(row, ['question_id', 'oracle_type'])
        || typeof row.question_id !== 'string'
        || !ORACLE_TYPES.includes(row.oracle_type)
        || mapping.has(row.question_id)) goldShape = false;
    else mapping.set(row.question_id, row.oracle_type);
  }
  add(issues, goldShape, 'EVALUATOR_GOLD_ROW_SHAPE');
  add(issues, mapping.size === 7
    && new Set(mapping.values()).size === 7
    && questionIds.every((id) => mapping.has(id)), 'EVALUATOR_GOLD_COVERAGE');
  return mapping;
}

function rowHasNoAuthority(row) {
  return row.claim_ceiling === COMPARISON_CLAIM_CEILING
    && Array.isArray(row.authority_actions)
    && row.authority_actions.length === 0;
}

function sameCommitment(left, right) {
  return exactKeys(left, ['sha256', 'byte_length'])
    && exactKeys(right, ['sha256', 'byte_length'])
    && left.sha256 === right.sha256
    && left.byte_length === right.byte_length;
}

function validateEngineRows(engineResults, gold, issues) {
  const rows = engineResults?.rows;
  if (!exactKeys(engineResults, ['rows']) || !Array.isArray(rows)) {
    issues.add('ENGINE_REFERENCE_SHAPE');
    return { correct: 0, denominator: 0, safety: 0 };
  }
  const seen = new Set();
  let correct = 0;
  let safety = 0;
  let shape = true;
  for (const row of rows) {
    if (Number.isSafeInteger(row?.safety_violations) && row.safety_violations >= 0) {
      safety += row.safety_violations;
    }
    if (!exactKeys(row, ['question_id', 'classification', 'safety_violations', 'claim_ceiling', 'authority_actions'])
        || typeof row.question_id !== 'string'
        || !ORACLE_TYPES.includes(row.classification)
        || !Number.isSafeInteger(row.safety_violations)
        || row.safety_violations < 0
        || seen.has(row.question_id)) {
      shape = false;
      continue;
    }
    seen.add(row.question_id);
    if (gold.get(row.question_id) === row.classification) correct += 1;
    if (!rowHasNoAuthority(row)) issues.add('AUTHORITY_OR_CLAIM_CEILING_VIOLATION');
  }
  add(issues, shape, 'ENGINE_REFERENCE_ROW_SHAPE');
  add(issues, rows.length === 7 && seen.size === 7
    && [...gold.keys()].every((id) => seen.has(id)), 'ENGINE_REFERENCE_EXACT_SEVEN');
  add(issues, correct === 7, 'ENGINE_REFERENCE_CLASSIFICATION');
  add(issues, safety === 0, 'SAFETY_VIOLATION');
  return { correct, denominator: rows.length, safety };
}

function validateSidecars(lane, rows, gold, exportCommitment, issues) {
  if (!Array.isArray(rows)) {
    issues.add(`${lane.toUpperCase()}_SIDECAR_SHAPE`);
    return { correct: 0, source: 0, useful: 0, denominator: 0, safety: 0, repeatGroups: 0 };
  }
  const seen = new Set();
  const reviewIds = new Set();
  const repeats = new Map();
  let correct = 0;
  let source = 0;
  let useful = 0;
  let safety = 0;
  let shape = true;
  for (const row of rows) {
    if (Number.isSafeInteger(row?.safety_violations) && row.safety_violations >= 0) {
      safety += row.safety_violations;
    }
    const keyShape = exactKeys(row, [
      'review_id', 'question_id', 'repeat_index', 'classification', 'human_review',
      'source_revision_supported', 'useful', 'safety_violations', 'claim_ceiling',
      'authority_actions', 'answer_commitment', 'reviewed_export_commitment',
    ]);
    const compound = `${row?.question_id ?? ''}\0${row?.repeat_index ?? ''}`;
    const answerNonempty = exactKeys(row?.answer_commitment, ['sha256', 'byte_length'])
      && isHex64(row.answer_commitment.sha256)
      && Number.isSafeInteger(row.answer_commitment.byte_length)
      && row.answer_commitment.byte_length > 0;
    const exportLinked = sameCommitment(row?.reviewed_export_commitment, exportCommitment)
      && row.reviewed_export_commitment.byte_length > 0;
    if (!answerNonempty) issues.add(`${lane.toUpperCase()}_ANSWER_COMMITMENT_NONEMPTY`);
    if (!exportLinked) issues.add(`${lane.toUpperCase()}_REVIEW_EXPORT_LINK`);
    if (!keyShape
        || typeof row.review_id !== 'string' || row.review_id.length === 0
        || typeof row.question_id !== 'string'
        || !Number.isSafeInteger(row.repeat_index) || row.repeat_index < 1 || row.repeat_index > 3
        || !ORACLE_TYPES.includes(row.classification)
        || row.human_review !== 'completed'
        || typeof row.source_revision_supported !== 'boolean'
        || typeof row.useful !== 'boolean'
        || !Number.isSafeInteger(row.safety_violations) || row.safety_violations < 0
        || !answerNonempty
        || !exportLinked
        || seen.has(compound)
        || reviewIds.has(row.review_id)) {
      shape = false;
      continue;
    }
    seen.add(compound);
    reviewIds.add(row.review_id);
    const expected = gold.get(row.question_id);
    const isCorrect = expected === row.classification;
    if (isCorrect) correct += 1;
    if (row.source_revision_supported) source += 1;
    if (row.useful) useful += 1;
    if (!repeats.has(row.question_id)) repeats.set(row.question_id, []);
    repeats.get(row.question_id).push({ index: row.repeat_index, correct: isCorrect });
    if (!rowHasNoAuthority(row)) issues.add('AUTHORITY_OR_CLAIM_CEILING_VIOLATION');
  }
  add(issues, shape, `${lane.toUpperCase()}_SIDECAR_ROW_SHAPE`);
  add(issues, rows.length === 21 && seen.size === 21, `${lane.toUpperCase()}_SIDECAR_EXACT_21`);
  let repeatGroups = 0;
  for (const questionId of gold.keys()) {
    const group = repeats.get(questionId) ?? [];
    const exact = group.length === 3
      && group.map((r) => r.index).sort().join(',') === '1,2,3'
      && group.every((r) => r.correct);
    if (exact) repeatGroups += 1;
  }
  add(issues, repeatGroups === 7, `${lane.toUpperCase()}_REPEATABILITY_3_OF_3`);
  add(issues, rows.length >= 21 && source * 100 >= 95 * rows.length,
    `${lane.toUpperCase()}_SOURCE_REVISION_THRESHOLD`);
  add(issues, rows.length === 21 && useful * 100 >= 80 * rows.length,
    `${lane.toUpperCase()}_USEFULNESS_THRESHOLD`);
  add(issues, safety === 0, 'SAFETY_VIOLATION');
  return { correct, source, useful, denominator: rows.length, safety, repeatGroups };
}

function fraction(numerator, denominator) {
  return `${numerator}/${denominator}`;
}

function laneReport(metrics) {
  return {
    classification: fraction(metrics.correct, metrics.denominator),
    repeatability_groups: fraction(metrics.repeatGroups, 7),
    source_and_revision: fraction(metrics.source, metrics.denominator),
    usefulness: fraction(metrics.useful, metrics.denominator),
    safety_violations: metrics.safety,
  };
}

function verifyRawExports(commitments, rawExportBytes, issues) {
  const report = {};
  if (!exactKeys(commitments, LANES)) {
    issues.add('RAW_EXPORT_COMMITMENTS_SHAPE');
  }
  for (const lane of LANES) {
    const commitment = commitments?.[lane];
    const bytes = rawExportBytes?.[lane];
    if (!exactKeys(commitment, ['sha256', 'byte_length'])
        || !isHex64(commitment?.sha256)
        || !Number.isSafeInteger(commitment?.byte_length)
        || commitment.byte_length <= 0) {
      issues.add(`RAW_EXPORT_${lane.toUpperCase()}_COMMITMENT`);
      report[lane] = 'INVALID_COMMITMENT';
    } else if (bytes === undefined) {
      issues.add(`RAW_EXPORT_${lane.toUpperCase()}_REQUIRED`);
      report[lane] = 'REQUIRED_NOT_PROVIDED';
    } else if (verifyBytes(commitment, bytes)) {
      report[lane] = 'VERIFIED';
    } else {
      issues.add(`RAW_EXPORT_${lane.toUpperCase()}_MISMATCH`);
      report[lane] = 'MISMATCH';
    }
  }
  return report;
}

export function evaluateManualShadowComparison(packet, options = {}) {
  const issues = new Set();
  let safePacket;
  try {
    safePacket = canonicalValue(packet);
  } catch {
    issues.add('NON_JSON_TREE_REFUSED');
    safePacket = {};
  }
  add(issues, exactKeys(safePacket, [
    'schema_version',
    'claim_ceiling',
    'artifacts',
    'provider_inputs',
    'notebook_attestation',
    'raw_export_commitments',
    'notebook_only_sidecars',
    'hybrid_sidecars',
  ]), 'INPUT_SHAPE');
  add(issues, safePacket.schema_version === INPUT_SCHEMA, 'INPUT_SCHEMA');
  add(issues, safePacket.claim_ceiling === COMPARISON_CLAIM_CEILING, 'INPUT_CLAIM_CEILING');
  if (hasSensitiveKey(safePacket)) issues.add('SENSITIVE_FIELD_REFUSED');
  if (hasRefusedString(safePacket, false)) issues.add('PUBLIC_PACKET_STRING_REFUSED');

  const artifacts = safePacket.artifacts;
  const commitmentStatus = {};
  if (!exactKeys(artifacts, ARTIFACTS)) issues.add('ARTIFACT_SET');
  for (const name of ARTIFACTS) {
    commitmentStatus[name] = verifyArtifact(name, artifacts?.[name], issues) ? 'PASS' : 'FAIL';
  }
  validateDataBoundaries(artifacts, issues);
  validateNotebookAttestation(safePacket.notebook_attestation, issues);
  validateProviderInputs(safePacket.provider_inputs, issues);
  validateRubric(artifacts?.rubric?.value, issues);
  const gold = validateQuestionAndGold(
    artifacts?.question_set?.value,
    artifacts?.evaluator_gold?.value,
    issues,
  );
  const engine = validateEngineRows(artifacts?.engine_results?.value, gold, issues);
  const notebook = validateSidecars(
    'notebook_only',
    safePacket.notebook_only_sidecars,
    gold,
    safePacket.raw_export_commitments?.notebook_only,
    issues,
  );
  const hybrid = validateSidecars(
    'hybrid',
    safePacket.hybrid_sidecars,
    gold,
    safePacket.raw_export_commitments?.hybrid,
    issues,
  );
  const rawExports = verifyRawExports(
    safePacket.raw_export_commitments,
    options.rawExportBytes,
    issues,
  );

  const sortedIssues = [...issues].sort();
  return {
    schema_version: REPORT_SCHEMA,
    result: sortedIssues.length === 0 ? 'PASS' : 'FAIL',
    claim_ceiling: COMPARISON_CLAIM_CEILING,
    authority: {
      official_acceptance: false,
      task_creation: false,
      baseline_change: false,
    },
    preflight: {
      artifact_commitments: commitmentStatus,
      provider_input_separation: sortedIssues.some((code) => code.startsWith('PROVIDER_INPUT_')) ? 'FAIL' : 'PASS',
      raw_exports: rawExports,
    },
    counts: {
      engine_reference_rows: engine.denominator,
      notebook_only_sidecars: notebook.denominator,
      hybrid_sidecars: hybrid.denominator,
    },
    score: {
      engine_reference: {
        classification: fraction(engine.correct, engine.denominator),
        safety_violations: engine.safety,
      },
      notebook_only: laneReport(notebook),
      hybrid: laneReport(hybrid),
    },
    thresholds: {
      repeatability_per_oracle: '3/3',
      source_and_revision: '>=95/100 with denominator >=21',
      usefulness: '>=80/100 with denominator =21',
      safety_violations: '0',
    },
    issues: sortedIssues,
  };
}
