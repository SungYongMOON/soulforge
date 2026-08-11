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
  backfillSeCoreEvalLedger,
  querySeCoreEvalLedger,
  validateSeCoreEvalLedger,
} from '../evaluation/se_core_eval_ledger.mjs';
import { runCli } from '../tools/se_core_eval_ledger.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMP_ROOTS = new Set();
const SYNTHETIC_PROJECT_MARKER = ['P', '00', '-', '000'].join('');
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
  'correct',
  'missing',
  'unknown',
  'contradictory',
  'stale',
  'unauthorized',
  'wrong-project',
]);
const QUESTION_IDS = Object.freeze(CLASSIFICATIONS.map((_, index) =>
  `se-q-${String(index + 1).padStart(2, '0')}`));
const SOURCE_NAMES = Object.freeze([
  'public_source_a.pdf',
  'public_source_b.pdf',
  'public_source_c.pdf',
  'public_source_d.pdf',
]);
const RAW_BODY = [
  'opaque notebook answer body',
  'owner@example.invalid',
  `project_code=${SYNTHETIC_PROJECT_MARKER}`,
  'api_key=do-not-echo-this-value',
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

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'se-core-eval-ledger-'));
  TEMP_ROOTS.add(root);
  return root;
}

function writeBytes(root, locator, bytes) {
  const target = join(root, ...locator.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return { bytes, byte_length: bytes.length, sha256: sha256(bytes) };
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
    gap_types: [
      ['satisfied', 'gap_missing', 'gap_unknown', 'gap_conflict', 'gap_unknown', 'satisfied', 'satisfied'][index],
    ],
    question_id: questionId,
    requirements_judged: 1,
    stale_revision_evidence: index === 4,
  };
}

function buildFixture() {
  const root = makeRoot();
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
    const roundId = `round_${String(roundIndex).padStart(2, '0')}`;
    const runId = `notebook_round_${String(roundIndex).padStart(2, '0')}`;
    const answerFiles = QUESTION_IDS.map((questionId) => {
      const locator = `exports/notebook/${roundId}/${questionId}.md`;
      const written = writeBytes(root, locator,
        Buffer.from(`${RAW_BODY}\nround=${roundIndex}\nquestion=${questionId}\n`, 'utf8'));
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
      question_set_canonical_sha256: HASHES.notebookQuestionSet,
      answer_files: answerFiles,
      answer_count: 7,
      claim_ceiling: 'observed_single_chat_pilot',
    };
    const writtenManifest = writeJson(root, `exports/notebook/${roundId}/run_manifest.json`, manifest);
    const questionResults = [];
    for (let index = 0; index < QUESTION_IDS.length; index += 1) {
      const questionId = QUESTION_IDS[index];
      const classification = CLASSIFICATIONS[index];
      const raw = answerFiles[index];
      const reviewExactStatus = index === 2 ? 'fail' : 'pass';
      const summaryExactStatus = index === 2 ? 'fail_internal_contradiction' : 'pass';
      const overallVerdict = index === 2 ? 'revise' : 'pass';
      writeJson(root, `reviews/notebook/${roundId}/${questionId}.review.json`, {
        schema_version: 'soulforge.se_core_eval.notebook_answer_review.v1',
        question_id: questionId,
        round_index: roundIndex,
        raw_response: {
          file_name: raw.file_name,
          byte_length: raw.byte_length,
          sha256: raw.sha256,
          manifest_hash_match: true,
        },
        normalized_sidecar_candidate: reviewCandidate(classification, index),
        exact_case_classification: { status: reviewExactStatus },
        overall_verdict: overallVerdict,
        minimal_snippets: [RAW_BODY],
      });
      questionResults.push({
        question_id: questionId,
        expected: classification,
        observed_primary: classification,
        exact_status: summaryExactStatus,
        overall_verdict: overallVerdict,
      });
    }
    writeJson(root, `reviews/notebook/${roundId}/summary.json`, {
      schema_version: 'soulforge.se_core_eval.notebook_round_review_summary.v1',
      run_id: runId,
      round_index: roundIndex,
      run_manifest: {
        file_name: 'run_manifest.json',
        byte_length: writtenManifest.byte_length,
        sha256: writtenManifest.sha256,
        answer_hashes_verified: 7,
        answer_hash_mismatches: 0,
      },
      question_results: questionResults,
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
    const attempt = `reference_${String(attemptIndex).padStart(2, '0')}`;
    const resultArtifact = writeJson(root, `exports/engine/${attempt}/engine_results.json`, { rows });
    const receiptArtifact = writeJson(root, `exports/engine/${attempt}/verification_receipt.json`, receipt);
    writeJson(root, `exports/engine/${attempt}/run_manifest.json`, {
      schema_version: 'soulforge.se_core_eval.engine_reference_run_manifest.v1',
      run_id: `engine_reference_${String(attemptIndex).padStart(2, '0')}`,
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
  return root;
}

function build(root) {
  const result = backfillSeCoreEvalLedger({ root_path: root });
  assert.equal(result.result, 'PASS', JSON.stringify(result.report));
  return result;
}

function ledgerEvents(bytes) {
  return bytes.toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
}

function replaceLine(bytes, index, mutate) {
  const lines = bytes.toString('utf8').trimEnd().split('\n');
  const event = JSON.parse(lines[index]);
  mutate(event);
  lines[index] = JSON.stringify(event);
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
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

function domainSha256(domain, value) {
  return sha256(Buffer.concat([Buffer.from(`${domain}\n`, 'utf8'), canonicalBytes(value)]));
}

function recomputeLedger(events) {
  const prior = new Map();
  let previousHash = '0'.repeat(64);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const refs = [...event.links.event_ids].sort().map((eventId) => ({
      event_id: eventId,
      event_hash: prior.get(eventId).event_hash,
    }));
    event.links.input_set_sha256 = domainSha256('soulforge.se_core_eval.input_set.v1', refs);
    event.sequence = index + 1;
    event.prev_event_hash = previousHash;
    delete event.event_hash;
    event.event_hash = domainSha256('soulforge.se_core_eval.event_hash.v1', event);
    prior.set(event.event_id, event);
    previousHash = event.event_hash;
  }
  return Buffer.concat(events.map(canonicalBytes));
}

function reidentifyAndRecomputeLedger(events, predicate, runId) {
  const changed = structuredClone(events);
  const remappedIds = new Map();
  for (const event of changed) {
    if (!predicate(event)) continue;
    const priorId = event.event_id;
    event.identity.run_id = runId;
    event.event_id = `selev_${domainSha256('soulforge.se_core_eval.event_identity.v1', {
      event_type: event.event_type,
      identity: event.identity,
    })}`;
    remappedIds.set(priorId, event.event_id);
  }
  for (const event of changed) {
    event.links.event_ids = event.links.event_ids.map((eventId) => remappedIds.get(eventId) ?? eventId);
  }
  return recomputeLedger(changed);
}

function rewriteRoundOneAfterAnswerChange(root) {
  const answerLocator = 'exports/notebook/round_01/se-q-01.md';
  const answer = writeBytes(root, answerLocator, Buffer.from(`${RAW_BODY}\nchanged\n`, 'utf8'));
  const manifestLocator = 'exports/notebook/round_01/run_manifest.json';
  const manifest = readJson(root, manifestLocator);
  manifest.answer_files[0].byte_length = answer.byte_length;
  manifest.answer_files[0].sha256 = answer.sha256;
  const manifestArtifact = writeJson(root, manifestLocator, manifest);
  const reviewLocator = 'reviews/notebook/round_01/se-q-01.review.json';
  const review = readJson(root, reviewLocator);
  review.raw_response.byte_length = answer.byte_length;
  review.raw_response.sha256 = answer.sha256;
  writeJson(root, reviewLocator, review);
  const summaryLocator = 'reviews/notebook/round_01/summary.json';
  const summary = readJson(root, summaryLocator);
  summary.run_manifest.byte_length = manifestArtifact.byte_length;
  summary.run_manifest.sha256 = manifestArtifact.sha256;
  writeJson(root, summaryLocator, summary);
}

test('backfill emits a canonical, gapless 69-event metadata-only cohort', () => {
  const root = buildFixture();
  const built = build(root);
  assert.deepEqual(built.report.counts, {
    notebook_answer: 21,
    review: 21,
    round_summary: 3,
    engine_row: 21,
    engine_run: 3,
    comparison_candidate: 0,
  });
  assert.equal(built.report.event_count, 69);
  assert.equal(built.report.appended_events, 69);
  assert.equal(built.report.source_membership_attestation, 'sha256_pin_only');
  assert.equal(built.ledger_bytes.at(-1), 10);
  assert.equal(built.ledger_bytes.includes(Buffer.from('\r')), false);
  const validation = validateSeCoreEvalLedger(built.ledger_bytes);
  assert.equal(validation.result, 'PASS');
  assert.equal(validation.ledger_sha256, sha256(built.ledger_bytes));
  const events = ledgerEvents(built.ledger_bytes);
  assert.deepEqual(events.map((event) => event.sequence),
    Array.from({ length: 69 }, (_, index) => index + 1));
  assert.equal(events[0].prev_event_hash, '0'.repeat(64));
  for (let index = 1; index < events.length; index += 1) {
    assert.equal(events[index].prev_event_hash, events[index - 1].event_hash);
  }
});

test('opaque answers and review snippets are byte-hashed and never echoed', () => {
  const built = build(buildFixture());
  const text = built.ledger_bytes.toString('utf8');
  for (const refused of [
    'opaque notebook answer body',
    'owner@example.invalid',
    SYNTHETIC_PROJECT_MARKER,
    'do-not-echo-this-value',
    'minimal_snippets',
  ]) assert.equal(text.includes(refused), false);
  const answers = ledgerEvents(built.ledger_bytes)
    .filter((event) => event.event_type === 'notebook_answer');
  assert.equal(answers.length, 21);
  assert(answers.every((event) => event.artifact.payload_basis === 'opaque_byte_hash'));
});

test('review and summary links are direct, exact, and set-hash committed', () => {
  const root = buildFixture();
  const events = ledgerEvents(build(root).ledger_bytes);
  assert(events.filter((event) => event.event_type === 'review')
    .every((event) => event.links.event_ids.length === 1));
  assert(events.filter((event) => event.event_type === 'round_summary')
    .every((event) => event.links.event_ids.length === 7));
  assert(events.filter((event) => event.event_type === 'engine_run')
    .every((event) => event.links.event_ids.length === 7));
  assert(events.every((event) => /^[0-9a-f]{64}$/.test(event.links.input_set_sha256)));
  const review = events.find((event) => event.event_type === 'review'
    && event.identity.round_id === 'round_01'
    && event.identity.question_id === 'se-q-01');
  const answer = events.find((event) => event.event_type === 'notebook_answer'
    && event.identity.round_id === 'round_01'
    && event.identity.question_id === 'se-q-01');
  assert.deepEqual(review.links.event_ids, [answer.event_id]);
  assert.equal(review.artifact.raw_sha256,
    sha256(readFileSync(join(root, 'reviews', 'notebook', 'round_01', 'se-q-01.review.json'))));
  const attestationSha256 = sha256(readFileSync(join(
    root, 'exports', 'notebook', 'source_membership_attestation.json',
  )));
  assert(events.filter((event) => ['notebook_answer', 'review', 'round_summary']
    .includes(event.event_type)).every((event) =>
    event.inputs.source_membership_attestation_sha256 === attestationSha256));
});

test('engine attempts retain one source-natural key and one canonical payload per question', () => {
  const rows = ledgerEvents(build(buildFixture()).ledger_bytes)
    .filter((event) => event.event_type === 'engine_row');
  const byQuestion = new Map();
  for (const row of rows) {
    if (!byQuestion.has(row.identity.question_id)) byQuestion.set(row.identity.question_id, []);
    byQuestion.get(row.identity.question_id).push(row);
  }
  assert.equal(byQuestion.size, 7);
  for (const group of byQuestion.values()) {
    assert.deepEqual(group.map((row) => row.identity.attempt_index), [1, 2, 3]);
    assert.equal(new Set(group.map((row) => row.identity.natural_key_sha256)).size, 1);
    assert.equal(new Set(group.map((row) => row.artifact.payload_sha256)).size, 1);
  }
});

test('recomputed chains cannot duplicate row pointers or detach rows from run result bytes', () => {
  const ledger = build(buildFixture()).ledger_bytes;
  const original = ledgerEvents(ledger);
  for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex += 1) {
    const rows = original.filter((event) => event.event_type === 'engine_row'
      && event.identity.attempt_index === attemptIndex);
    const run = original.find((event) => event.event_type === 'engine_run'
      && event.identity.attempt_index === attemptIndex);
    assert.deepEqual(rows.map((event) => event.artifact.record_pointer).sort(), [
      '/rows/0', '/rows/1', '/rows/2', '/rows/3', '/rows/4', '/rows/5', '/rows/6',
    ]);
    assert(rows.every((event) =>
      event.artifact.raw_sha256 === run.outcome.engine_results_sha256));
  }

  const duplicatePointer = structuredClone(original);
  const attemptOneRows = duplicatePointer.filter((event) => event.event_type === 'engine_row'
    && event.identity.attempt_index === 1);
  attemptOneRows[1].artifact.record_pointer = attemptOneRows[0].artifact.record_pointer;
  let report = validateSeCoreEvalLedger(recomputeLedger(duplicatePointer));
  assert.equal(report.result, 'HOLD');
  assert(report.issues.includes('LEDGER_LINK_REFUSED'));

  const detachedBytes = structuredClone(original);
  detachedBytes.find((event) => event.event_type === 'engine_row'
    && event.identity.attempt_index === 2).artifact.raw_sha256 = 'f'.repeat(64);
  report = validateSeCoreEvalLedger(recomputeLedger(detachedBytes));
  assert.equal(report.result, 'HOLD');
  assert(report.issues.includes('LEDGER_LINK_REFUSED'));
});

test('summary exact-status must canonically equal every linked review exact-status', () => {
  const positiveRoot = buildFixture();
  const positive = build(positiveRoot);
  const q3Review = ledgerEvents(positive.ledger_bytes).find((event) =>
    event.event_type === 'review'
    && event.identity.round_id === 'round_01'
    && event.identity.question_id === 'se-q-03');
  assert.equal(q3Review.outcome.exact_status, 'fail');
  assert.equal(readJson(positiveRoot, 'reviews/notebook/round_01/summary.json')
    .question_results[2].exact_status, 'fail_internal_contradiction');

  const refusedRoot = buildFixture();
  const locator = 'reviews/notebook/round_01/summary.json';
  const summary = readJson(refusedRoot, locator);
  summary.question_results[0].exact_status = 'fail';
  writeJson(refusedRoot, locator, summary);
  const refused = backfillSeCoreEvalLedger({ root_path: refusedRoot });
  assert.equal(refused.result, 'HOLD');
  assert(refused.report.issues.includes('SOURCE_LINK_MISMATCH'));
});

test('source-tree run ids are fixed to their round or attempt and remain queryable', () => {
  const notebookRoot = buildFixture();
  const manifestLocator = 'exports/notebook/round_01/run_manifest.json';
  const manifest = readJson(notebookRoot, manifestLocator);
  manifest.run_id = 'harmless_alias_01';
  const manifestArtifact = writeJson(notebookRoot, manifestLocator, manifest);
  const summaryLocator = 'reviews/notebook/round_01/summary.json';
  const summary = readJson(notebookRoot, summaryLocator);
  summary.run_id = manifest.run_id;
  summary.run_manifest.byte_length = manifestArtifact.byte_length;
  summary.run_manifest.sha256 = manifestArtifact.sha256;
  writeJson(notebookRoot, summaryLocator, summary);
  let refused = backfillSeCoreEvalLedger({ root_path: notebookRoot });
  assert.equal(refused.result, 'HOLD');
  assert(refused.report.issues.includes('SOURCE_COHORT_REFUSED'));

  const engineRoot = buildFixture();
  const engineManifestLocator = 'exports/engine/reference_01/run_manifest.json';
  const engineManifest = readJson(engineRoot, engineManifestLocator);
  engineManifest.run_id = 'harmless_alias_01';
  writeJson(engineRoot, engineManifestLocator, engineManifest);
  refused = backfillSeCoreEvalLedger({ root_path: engineRoot });
  assert.equal(refused.result, 'HOLD');
  assert(refused.report.issues.includes('SOURCE_COHORT_REFUSED'));
});

test('fully reidentified and rehashed ledger aliases are refused', () => {
  const events = ledgerEvents(build(buildFixture()).ledger_bytes);
  let refused = validateSeCoreEvalLedger(reidentifyAndRecomputeLedger(
    events,
    (event) => event.identity.round_id === 'round_01',
    'harmless_alias_01',
  ));
  assert.equal(refused.result, 'HOLD');
  assert(refused.issues.includes('LEDGER_EVENT_SHAPE_REFUSED'));

  refused = validateSeCoreEvalLedger(reidentifyAndRecomputeLedger(
    events,
    (event) => event.identity.attempt_index === 1,
    'harmless_alias_01',
  ));
  assert.equal(refused.result, 'HOLD');
  assert(refused.issues.includes('LEDGER_EVENT_SHAPE_REFUSED'));
});

test('an optional comparison candidate appends one hash-only event over six terminal inputs', () => {
  const root = buildFixture();
  const base = build(root);
  const candidate = {
    schema_version: 'soulforge.se_core_eval.comparison_candidate.v0',
    decision: {
      evidence_claim_ceiling: 'observed',
      final_comparison_allowed: false,
    },
    notes: RAW_BODY,
  };
  const written = writeJson(root, 'comparison_candidate.json', candidate);
  const appended = backfillSeCoreEvalLedger({
    root_path: root,
    existing_ledger_bytes: base.ledger_bytes,
  });
  assert.equal(appended.result, 'PASS', JSON.stringify(appended.report));
  assert.equal(appended.report.event_count, 70);
  assert.equal(appended.report.counts.comparison_candidate, 1);
  assert.equal(appended.report.reused_events, 69);
  assert.equal(appended.report.appended_events, 1);
  assert.equal(validateSeCoreEvalLedger(appended.ledger_bytes).result, 'PASS');
  const event = ledgerEvents(appended.ledger_bytes).at(-1);
  assert.equal(event.event_type, 'comparison_candidate');
  assert.equal(event.artifact.byte_length, written.byte_length);
  assert.equal(event.artifact.raw_sha256, written.sha256);
  assert.equal(event.links.event_ids.length, 6);
  assert.deepEqual(event.outcome, {
    claim_ceiling: 'observed',
    final_comparison_allowed: false,
  });
  assert.equal(appended.ledger_bytes.toString('utf8').includes(RAW_BODY), false);

  candidate.decision.final_comparison_allowed = true;
  writeJson(root, 'comparison_candidate.json', candidate);
  const refused = backfillSeCoreEvalLedger({ root_path: root });
  assert.equal(refused.result, 'HOLD');
  assert(refused.report.issues.includes('SOURCE_BOUNDARY_REFUSED'));
  assert.equal(JSON.stringify(refused.report).includes(RAW_BODY), false);
});

test('the same source tree is byte-deterministic across absolute locations', () => {
  const first = build(buildFixture()).ledger_bytes;
  const second = build(buildFixture()).ledger_bytes;
  assert.deepEqual(second, first);
  assert.equal(sha256(second), sha256(first));
  assert.equal(second.toString('utf8').includes(tmpdir()), false);
});

test('tampering, appended suffixes, removed heads or tails, and incomplete lines HOLD', () => {
  const ledger = build(buildFixture()).ledger_bytes;
  const tampered = replaceLine(ledger, 10, (event) => {
    event.outcome.claim_ceiling = 'tampered';
  });
  assert.equal(validateSeCoreEvalLedger(tampered).result, 'HOLD');
  assert.equal(validateSeCoreEvalLedger(Buffer.concat([ledger, ledger.subarray(0, ledger.indexOf(10) + 1)])).result,
    'HOLD');
  const firstNewline = ledger.indexOf(10);
  assert.equal(validateSeCoreEvalLedger(ledger.subarray(firstNewline + 1)).result, 'HOLD');
  const lastNewlineBeforeTail = ledger.lastIndexOf(10, ledger.length - 2);
  assert.equal(validateSeCoreEvalLedger(ledger.subarray(0, lastNewlineBeforeTail + 1)).result, 'HOLD');
  assert.equal(validateSeCoreEvalLedger(ledger.subarray(0, -1)).result, 'HOLD');
});

test('closed event shapes reject injected path, secret, project, and account metadata without echo', () => {
  const ledger = build(buildFixture()).ledger_bytes;
  for (const [key, value] of [
    ['local_path', '../escape.json'],
    ['secret', 'api_key=do-not-echo-ledger-secret'],
    ['project_ref', SYNTHETIC_PROJECT_MARKER],
    ['account_id', 'owner@example.invalid'],
  ]) {
    const changed = replaceLine(ledger, 0, (event) => { event[key] = value; });
    const report = validateSeCoreEvalLedger(changed);
    assert.equal(report.result, 'HOLD');
    assert.equal(JSON.stringify(report).includes(value), false);
    assert.equal(JSON.stringify(report).includes(key), false);
  }
  for (const value of ['../escape.json', 'secret.json', `${SYNTHETIC_PROJECT_MARKER}.json`, 'account_id.json']) {
    const changed = replaceLine(ledger, 0, (event) => { event.artifact.locator = value; });
    const report = validateSeCoreEvalLedger(changed);
    assert.equal(report.result, 'HOLD');
    assert(report.issues.includes('SOURCE_PATH_REFUSED'));
    assert.equal(JSON.stringify(report).includes(value), false);
  }
});

test('NFC and byte/string bounds fail closed', () => {
  const ledger = build(buildFixture()).ledger_bytes;
  const nonNfc = replaceLine(ledger, 0, (event) => {
    event.outcome.claim_ceiling = 'observe\u0301d';
  });
  let report = validateSeCoreEvalLedger(nonNfc);
  assert.equal(report.result, 'HOLD');
  assert.equal(JSON.stringify(report).includes('observe\u0301d'), false);
  report = validateSeCoreEvalLedger(Buffer.alloc((4 * 1024 * 1024) + 1, 0x61));
  assert.equal(report.result, 'HOLD');
  const query = querySeCoreEvalLedger(ledger, { run_id: 'a'.repeat(129) });
  assert.equal(query.result, 'HOLD');
  assert.equal(JSON.stringify(query).includes('a'.repeat(129)), false);
});

test('public operations reject non-plain or open request shapes without echo', () => {
  const root = buildFixture();
  for (const input of [
    null,
    { root_path: root, secret_value: 'do-not-echo-request-secret' },
    Object.assign(Object.create({ inherited: 'owner@example.invalid' }), { root_path: root }),
  ]) {
    const result = backfillSeCoreEvalLedger(input);
    assert.equal(result.result, 'HOLD');
    assert.equal(JSON.stringify(result.report).includes('do-not-echo'), false);
    assert.equal(JSON.stringify(result.report).includes('owner@example.invalid'), false);
  }
  const ledger = build(root).ledger_bytes;
  const inheritedFilters = Object.assign(Object.create({ run_id: 'engine_reference_01' }), {
    event_type: 'engine_run',
  });
  assert.equal(querySeCoreEvalLedger(ledger, inheritedFilters).result, 'HOLD');
});

test('source locators and sensitive public metadata fail closed without echo', () => {
  for (const [kind, offending, mutate] of [
    ['path', '../escape.md', (manifest) => { manifest.answer_files[0].file_name = '../escape.md'; }],
    ['secret', 'api_key=do-not-echo-source-secret', (manifest) => { manifest.run_id = 'api_key=do-not-echo-source-secret'; }],
    ['project', SYNTHETIC_PROJECT_MARKER, (manifest) => { manifest.run_id = SYNTHETIC_PROJECT_MARKER; }],
    ['account', 'owner@example.invalid', (manifest) => { manifest.run_id = 'owner@example.invalid'; }],
  ]) {
    const root = buildFixture();
    const locator = 'exports/notebook/round_01/run_manifest.json';
    const manifest = readJson(root, locator);
    mutate(manifest);
    writeJson(root, locator, manifest);
    const result = backfillSeCoreEvalLedger({ root_path: root });
    assert.equal(result.result, 'HOLD', kind);
    assert.equal(JSON.stringify(result.report).includes(offending), false);
  }
});

test('answer and Engine pins are verified before any event is emitted', () => {
  const answerRoot = buildFixture();
  const notebookLocator = 'exports/notebook/round_01/run_manifest.json';
  const notebook = readJson(answerRoot, notebookLocator);
  notebook.answer_files[0].sha256 = 'f'.repeat(64);
  writeJson(answerRoot, notebookLocator, notebook);
  let result = backfillSeCoreEvalLedger({ root_path: answerRoot });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('SOURCE_COMMITMENT_MISMATCH'));

  const engineRoot = buildFixture();
  const engineLocator = 'exports/engine/reference_01/run_manifest.json';
  const engine = readJson(engineRoot, engineLocator);
  engine.frozen_inputs.question_set_sha256 = 'e'.repeat(64);
  writeJson(engineRoot, engineLocator, engine);
  result = backfillSeCoreEvalLedger({ root_path: engineRoot });
  assert.equal(result.result, 'HOLD');
  assert(result.report.issues.includes('SOURCE_PIN_MISMATCH'));
});

test('retry is a byte-identical no-op and same identity with changed payload HOLDs', () => {
  const root = buildFixture();
  const first = build(root);
  const prefixLines = first.ledger_bytes.toString('utf8').trimEnd().split('\n').slice(0, 7);
  const prefix = Buffer.from(`${prefixLines.join('\n')}\n`, 'utf8');
  const resumed = backfillSeCoreEvalLedger({
    root_path: root,
    existing_ledger_bytes: prefix,
  });
  assert.equal(resumed.result, 'PASS');
  assert.equal(resumed.report.reused_events, 7);
  assert.equal(resumed.report.appended_events, 62);
  assert.deepEqual(resumed.ledger_bytes, first.ledger_bytes);

  const retry = backfillSeCoreEvalLedger({
    root_path: root,
    existing_ledger_bytes: first.ledger_bytes,
  });
  assert.equal(retry.result, 'PASS');
  assert.equal(retry.report.reused_events, 69);
  assert.equal(retry.report.appended_events, 0);
  assert.deepEqual(retry.ledger_bytes, first.ledger_bytes);

  rewriteRoundOneAfterAnswerChange(root);
  const conflict = backfillSeCoreEvalLedger({
    root_path: root,
    existing_ledger_bytes: first.ledger_bytes,
  });
  assert.equal(conflict.result, 'HOLD');
  assert.deepEqual(conflict.report.issues, ['IDENTITY_CONFLICT']);
});

test('query returns only validated metadata and rejects unsafe filters', () => {
  const ledger = build(buildFixture()).ledger_bytes;
  const result = querySeCoreEvalLedger(ledger, {
    event_type: 'review',
    round_id: 'round_02',
    question_id: 'se-q-03',
  });
  assert.equal(result.result, 'PASS');
  assert.equal(result.count, 1);
  assert.equal(result.events[0].event_type, 'review');
  assert.equal(JSON.stringify(result).includes(RAW_BODY), false);
  const refused = querySeCoreEvalLedger(ledger, { run_id: 'api_key=do-not-echo-query-secret' });
  assert.equal(refused.result, 'HOLD');
  assert.equal(JSON.stringify(refused).includes('do-not-echo-query-secret'), false);

  for (const [key, value] of [
    ['run_id', 'secret_namespace_probe'],
    ['run_id', 'project_code_probe'],
    ['round_id', 'account_id_probe'],
    ['question_id', 'notebook_id_probe'],
  ]) {
    const rejected = querySeCoreEvalLedger(ledger, { [key]: value });
    assert.equal(rejected.result, 'HOLD');
    assert.equal(JSON.stringify(rejected).includes(value), false);
    assert.deepEqual(rejected.query, {});
  }

  const run = querySeCoreEvalLedger(ledger, {
    event_type: 'engine_run',
    run_id: 'engine_reference_01',
  });
  assert.equal(run.result, 'PASS');
  assert.equal(run.count, 1);
  const notebookRun = querySeCoreEvalLedger(ledger, {
    run_id: 'notebook_round_01',
  });
  assert.equal(notebookRun.result, 'PASS');
  assert.equal(notebookRun.count, 15);
  const notebookSummary = querySeCoreEvalLedger(ledger, {
    event_type: 'round_summary',
    run_id: 'notebook_round_01',
  });
  assert.equal(notebookSummary.result, 'PASS');
  assert.equal(notebookSummary.count, 1);
  const round = querySeCoreEvalLedger(ledger, {
    event_type: 'round_summary',
    round_id: 'round_03',
  });
  assert.equal(round.result, 'PASS');
  assert.equal(round.count, 1);
  const question = querySeCoreEvalLedger(ledger, {
    event_type: 'engine_row',
    question_id: 'se-q-07',
  });
  assert.equal(question.result, 'PASS');
  assert.equal(question.count, 3);
});

test('CLI is stdout-only by default and --out is create-only', () => {
  const root = buildFixture();
  const direct = build(root);
  const dry = runCli(['node', 'ledger', 'backfill', '--root', root]);
  assert.equal(dry.exit_code, 0);
  assert.deepEqual(dry.stdout, direct.ledger_bytes);

  const out = join(root, 'ledger.jsonl');
  const created = runCli(['node', 'ledger', 'backfill', '--root', root, '--out', out]);
  assert.equal(created.exit_code, 0);
  assert.deepEqual(readFileSync(out), direct.ledger_bytes);
  const before = readFileSync(out);
  const refused = runCli(['node', 'ledger', 'backfill', '--root', root, '--out', out]);
  assert.equal(refused.exit_code, 2);
  assert.deepEqual(readFileSync(out), before);
  assert.match(refused.stdout.toString('utf8'), /CLI_CREATE_ONLY_WRITE_REFUSED/);

  const validated = runCli(['node', 'ledger', 'validate', '--ledger', out]);
  assert.equal(validated.exit_code, 0);
  const queried = runCli([
    'node', 'ledger', 'query', '--ledger', out, '--event-type', 'engine_row',
    '--attempt-index', '3',
  ]);
  assert.equal(queried.exit_code, 0);
  assert.equal(JSON.parse(queried.stdout).count, 7);
  const notebookQueried = runCli([
    'node', 'ledger', 'query', '--ledger', out, '--event-type', 'round_summary',
    '--run-id', 'notebook_round_01',
  ]);
  assert.equal(notebookQueried.exit_code, 0);
  assert.equal(JSON.parse(notebookQueried.stdout).count, 1);
  const probe = 'project_code_cli_probe';
  const rejectedQuery = runCli([
    'node', 'ledger', 'query', '--ledger', out, '--run-id', probe,
  ]);
  assert.equal(rejectedQuery.exit_code, 2);
  assert.equal(rejectedQuery.stdout.toString('utf8').includes(probe), false);
});

test('module has no writer/network/model/ERP adapter and CLI writer is explicit wx only', () => {
  const moduleSource = readFileSync(join(HERE, '..', 'evaluation', 'se_core_eval_ledger.mjs'), 'utf8');
  const cliSource = readFileSync(join(HERE, '..', 'tools', 'se_core_eval_ledger.mjs'), 'utf8');
  assert.doesNotMatch(moduleSource, /node:(?:net|http|https|tls|child_process)/);
  assert.doesNotMatch(moduleSource, /(?:writeFile|appendFile|mkdir|rmSync|unlink|fetch\s*\()/);
  assert.doesNotMatch(cliSource, /node:(?:net|http|https|tls|child_process)/);
  assert.doesNotMatch(cliSource, /(?:appendFile|mkdir|rmSync|unlink|fetch\s*\()/);
  assert.match(cliSource, /writeFileSync\(options\['--out'\], result\.ledger_bytes, \{ flag: 'wx' \}\)/);
  assert.doesNotMatch(`${moduleSource}\n${cliSource}`, /(?:openai|anthropic|gemini|erp[_-]?write|create[_-]?task)\s*\(/i);
});
