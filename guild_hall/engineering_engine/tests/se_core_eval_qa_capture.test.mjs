import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { afterEach } from 'node:test';
import { captureQaInteraction } from '../evaluation/se_core_eval_qa_capture.mjs';
import { runCli } from '../tools/se_core_eval_qa_capture.mjs';

const ROOTS = new Set();

afterEach(() => {
  for (const root of ROOTS) rmSync(root, { recursive: true, force: true });
  ROOTS.clear();
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'se-core-eval-qa-capture-'));
  ROOTS.add(root);
  return root;
}

function invoke(root, command, options = {}) {
  return captureQaInteraction({ root_path: root, command, ...options });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeRootFile(root, relativeRef, bytes) {
  const target = join(root, ...relativeRef.split('/'));
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, bytes);
  return target;
}

test('every evaluation turn accumulates one question and both provider answers with exact raw bytes', () => {
  const root = makeRoot();
  const question = Buffer.from('# Question\nWhat is the disposition?\n', 'utf8');
  const engineAnswer = Buffer.from('# Answer\nEngine response.\n', 'utf8');
  const notebookAnswer = Buffer.from('# Answer\nNotebook response.\n', 'utf8');

  assert.equal(invoke(root, 'initialize').result, 'PASS');
  assert.equal(invoke(root, 'record-question', {
    interaction_id: 'se-q-001',
    scope: 'fixed_benchmark',
    event_time: '2026-08-12T01:00:00Z',
    question_bytes: question,
  }).result, 'PASS');
  assert.equal(invoke(root, 'record-answer', {
    interaction_id: 'se-q-001',
    provider: 'engine',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T01:01:00Z',
    answer_bytes: engineAnswer,
  }).result, 'PASS');
  assert.equal(invoke(root, 'record-answer', {
    interaction_id: 'se-q-001',
    provider: 'notebook',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T01:02:00Z',
    answer_bytes: notebookAnswer,
  }).result, 'PASS');

  const query = invoke(root, 'query');
  assert.equal(query.result, 'PASS');
  assert.equal(query.event_count, 3);
  assert.deepEqual(query.counts, {
    answer_received: 2,
    question_recorded: 1,
    review_recorded: 0,
  });
  assert.deepEqual(query.events.map((event) => event.event_type), [
    'question_recorded',
    'answer_received',
    'answer_received',
  ]);
  assert.deepEqual(readFileSync(join(root, 'raw', 'questions', 'se-q-001.md')), question);
  assert.deepEqual(
    readFileSync(join(root, 'raw', 'answers', 'se-q-001', 'engine', 'attempt-01.md')),
    engineAnswer,
  );
  assert.deepEqual(
    readFileSync(join(root, 'raw', 'answers', 'se-q-001', 'notebook', 'attempt-01.md')),
    notebookAnswer,
  );
  assert.equal(existsSync(join(root, 'qa_interaction_ledger.lock')), false);
});

test('same identity and bytes retry idempotently while different bytes hold without overwrite', () => {
  const root = makeRoot();
  const original = Buffer.from('immutable question bytes', 'utf8');
  invoke(root, 'initialize');
  const request = {
    interaction_id: 'se-q-retry',
    scope: 'exploratory',
    event_time: '2026-08-12T02:00:00Z',
    question_bytes: original,
  };

  assert.equal(invoke(root, 'record-question', request).disposition, 'appended');
  const before = readFileSync(join(root, 'qa_interaction_ledger.jsonl'));
  assert.equal(invoke(root, 'record-question', {
    ...request,
    event_time: '2026-08-12T02:00:01Z',
  }).disposition, 'idempotent');
  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), before);

  const conflict = invoke(root, 'record-question', {
    ...request,
    question_bytes: Buffer.from('different question bytes', 'utf8'),
  });
  assert.equal(conflict.result, 'HOLD');
  assert.deepEqual(conflict.issues, ['IDENTITY_CONFLICT']);
  assert.deepEqual(readFileSync(join(root, 'raw', 'questions', 'se-q-retry.md')), original);
  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), before);
});

test('answer retries are idempotent and conflicting answer bytes never overwrite', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  invoke(root, 'record-question', {
    interaction_id: 'se-q-answer-retry',
    scope: 'exploratory',
    event_time: '2026-08-12T02:10:00Z',
    question_bytes: Buffer.from('question', 'utf8'),
  });
  const original = Buffer.from('first immutable answer', 'utf8');
  const request = {
    interaction_id: 'se-q-answer-retry',
    provider: 'engine',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T02:11:00Z',
    answer_bytes: original,
  };
  assert.equal(invoke(root, 'record-answer', request).disposition, 'appended');
  const before = readFileSync(join(root, 'qa_interaction_ledger.jsonl'));
  assert.equal(invoke(root, 'record-answer', request).disposition, 'idempotent');
  const conflict = invoke(root, 'record-answer', {
    ...request,
    answer_bytes: Buffer.from('different answer', 'utf8'),
  });
  assert.deepEqual(conflict.issues, ['IDENTITY_CONFLICT']);
  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), before);
  assert.deepEqual(
    readFileSync(join(root, 'raw', 'answers', 'se-q-answer-retry', 'engine', 'attempt-01.md')),
    original,
  );
});

test('initialize validates an existing ledger and never truncates invalid bytes', () => {
  const root = makeRoot();
  const invalid = Buffer.from('{"not":"a ledger event"}\n', 'utf8');
  writeRootFile(root, 'qa_interaction_ledger.jsonl', invalid);
  const result = invoke(root, 'initialize');
  assert.equal(result.result, 'HOLD');
  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), invalid);
});

test('question must precede answer and answer must precede a closed status-only review', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  const answerRequest = {
    interaction_id: 'se-q-order',
    provider: 'engine',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T03:01:00Z',
    answer_bytes: Buffer.from('answer', 'utf8'),
  };
  assert.deepEqual(invoke(root, 'record-answer', answerRequest).issues, [
    'QUESTION_MUST_PRECEDE_ANSWER',
  ]);

  invoke(root, 'record-question', {
    interaction_id: 'se-q-order',
    scope: 'fixed_benchmark',
    event_time: '2026-08-12T03:00:00Z',
    question_bytes: Buffer.from('question', 'utf8'),
  });
  const reviewRef = 'reviews/status/se-q-order.engine.attempt-01.json';
  const reviewBytes = Buffer.from(JSON.stringify({
    schema_version: 'soulforge.engineering_engine.se_core_eval_qa_status_review.v1',
    review_state: 'closed',
    interaction_id: 'se-q-order',
    provider: 'engine',
    attempt_id: 'attempt-01',
    evidence_status: 'pass',
    citation_status: 'pass',
    verdict: 'pass',
    safety_violations: 0,
  }), 'utf8');
  writeRootFile(root, reviewRef, reviewBytes);
  assert.deepEqual(invoke(root, 'record-review', {
    interaction_id: 'se-q-order',
    provider: 'engine',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T03:02:00Z',
    review_ref: reviewRef,
  }).issues, ['ANSWER_MUST_PRECEDE_REVIEW']);

  assert.equal(invoke(root, 'record-answer', answerRequest).result, 'PASS');
  const review = invoke(root, 'record-review', {
    interaction_id: 'se-q-order',
    provider: 'engine',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T03:02:00Z',
    review_ref: reviewRef,
  });
  assert.equal(review.result, 'PASS');
  const row = invoke(root, 'query', {
    filters: { event_type: 'review_recorded' },
  }).events[0];
  assert.equal(row.artifact.relative_ref, reviewRef);
  assert.equal(row.artifact.byte_length, reviewBytes.length);
  assert.equal(row.artifact.sha256, sha256(reviewBytes));
  assert.equal(row.links.answer_event_hash.length, 64);
  assert.equal(row.links.question_event_hash.length, 64);
});

test('caller-provided event time must be a real UTC instant', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  const result = invoke(root, 'record-question', {
    interaction_id: 'se-q-invalid-time',
    scope: 'exploratory',
    event_time: '2026-02-31T00:00:00Z',
    question_bytes: Buffer.from('question', 'utf8'),
  });
  assert.equal(result.result, 'HOLD');
  assert.deepEqual(result.issues, ['EVENT_TIME_REFUSED']);
  assert.equal(invoke(root, 'query').event_count, 0);
});

test('historical import links existing immutable files atomically and leaves the prior ledger untouched', () => {
  const root = makeRoot();
  const priorLedger = Buffer.from('existing 70-event ledger bytes\n', 'utf8');
  const question = Buffer.from('historical question bytes', 'utf8');
  const answer = Buffer.from('historical notebook answer bytes', 'utf8');
  writeRootFile(root, 'evaluation_ledger.jsonl', priorLedger);
  writeRootFile(root, 'exports/history/question-01.md', question);
  writeRootFile(root, 'exports/history/notebook-answer-01.md', answer);
  invoke(root, 'initialize');

  const imported = invoke(root, 'import-existing', {
    interaction_id: 'historical-001',
    scope: 'fixed_benchmark',
    question_event_time: '2026-07-01T00:00:00Z',
    question_ref: 'exports/history/question-01.md',
    provider: 'notebook',
    attempt_id: 'round-01',
    answer_event_time: '2026-07-01T00:01:00Z',
    answer_ref: 'exports/history/notebook-answer-01.md',
  });

  assert.equal(imported.result, 'PASS');
  assert.equal(imported.appended_event_count, 2);
  assert.deepEqual(readFileSync(join(root, 'evaluation_ledger.jsonl')), priorLedger);
  assert.deepEqual(readFileSync(join(root, 'exports', 'history', 'question-01.md')), question);
  assert.deepEqual(
    readFileSync(join(root, 'exports', 'history', 'notebook-answer-01.md')),
    answer,
  );
  assert.equal(existsSync(join(root, 'raw', 'questions', 'historical-001.md')), false);
  const rows = invoke(root, 'query').events;
  assert.deepEqual(rows.map((row) => row.capture_mode), [
    'historical_import',
    'historical_import',
  ]);
  assert.deepEqual(rows.map((row) => row.artifact.relative_ref), [
    'exports/history/question-01.md',
    'exports/history/notebook-answer-01.md',
  ]);
});

test('historical import appends nothing unless both existing refs validate', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  writeRootFile(root, 'history/question.md', Buffer.from('question', 'utf8'));
  const before = readFileSync(join(root, 'qa_interaction_ledger.jsonl'));
  const result = invoke(root, 'import-existing', {
    interaction_id: 'historical-atomic',
    scope: 'fixed_benchmark',
    question_event_time: '2026-07-01T00:00:00Z',
    question_ref: 'history/question.md',
    provider: 'notebook',
    attempt_id: 'round-01',
    answer_event_time: '2026-07-01T00:01:00Z',
    answer_ref: 'history/missing-answer.md',
  });
  assert.equal(result.result, 'HOLD');
  assert.deepEqual(result.issues, ['ARTIFACT_FILE_REFUSED']);
  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), before);
  assert.equal(invoke(root, 'query').event_count, 0);
});

test('a pre-existing writer lock holds before creating raw files or appending metadata', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  const before = readFileSync(join(root, 'qa_interaction_ledger.jsonl'));
  writeRootFile(root, 'qa_interaction_ledger.lock', Buffer.from('other writer\n', 'utf8'));

  const result = invoke(root, 'record-question', {
    interaction_id: 'se-q-locked',
    scope: 'exploratory',
    event_time: '2026-08-12T04:00:00Z',
    question_bytes: Buffer.from('must not be written', 'utf8'),
  });

  assert.equal(result.result, 'HOLD');
  assert.deepEqual(result.issues, ['WRITER_LOCKED']);
  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), before);
  assert.equal(existsSync(join(root, 'raw', 'questions', 'se-q-locked.md')), false);
});

test('retry recovers after exact raw creation but refuses a different pre-existing raw file', () => {
  const recoveredRoot = makeRoot();
  const bytes = Buffer.from('question survived interruption', 'utf8');
  invoke(recoveredRoot, 'initialize');
  writeRootFile(recoveredRoot, 'raw/questions/se-q-interrupted.md', bytes);
  const recovered = invoke(recoveredRoot, 'record-question', {
    interaction_id: 'se-q-interrupted',
    scope: 'exploratory',
    event_time: '2026-08-12T05:00:00Z',
    question_bytes: bytes,
  });
  assert.equal(recovered.result, 'PASS');
  assert.equal(recovered.event_count, 1);
  assert.deepEqual(
    readFileSync(join(recoveredRoot, 'raw', 'questions', 'se-q-interrupted.md')),
    bytes,
  );

  const conflictRoot = makeRoot();
  invoke(conflictRoot, 'initialize');
  const occupied = Buffer.from('occupied by different immutable bytes', 'utf8');
  writeRootFile(conflictRoot, 'raw/questions/se-q-interrupted.md', occupied);
  const conflict = invoke(conflictRoot, 'record-question', {
    interaction_id: 'se-q-interrupted',
    scope: 'exploratory',
    event_time: '2026-08-12T05:00:00Z',
    question_bytes: bytes,
  });
  assert.equal(conflict.result, 'HOLD');
  assert.deepEqual(conflict.issues, ['RAW_FILE_CONFLICT']);
  assert.deepEqual(
    readFileSync(join(conflictRoot, 'raw', 'questions', 'se-q-interrupted.md')),
    occupied,
  );
  assert.equal(invoke(conflictRoot, 'query').event_count, 0);
});

test('validation holds a ledger interrupted before a complete newline-delimited event', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  writeFileSync(join(root, 'qa_interaction_ledger.jsonl'), '{"partial":true');
  const result = invoke(root, 'validate');
  assert.equal(result.result, 'HOLD');
  assert.deepEqual(result.issues, ['LEDGER_APPEND_INTERRUPTED']);
});

test('raw payload never appears in ledger, query, or reports and unsafe metadata paths hold', () => {
  const root = makeRoot();
  const canaries = [
    'RAW_SECRET_CANARY_api_key=never-echo',
    'ACCOUNT_CANARY_owner@example.invalid',
    'PROJECT_CANARY_P00-000',
  ];
  const raw = Buffer.from(canaries.join('\n'), 'utf8');
  invoke(root, 'initialize');
  const report = invoke(root, 'record-question', {
    interaction_id: 'se-q-private-payload',
    scope: 'exploratory',
    event_time: '2026-08-12T06:00:00Z',
    question_bytes: raw,
  });
  const query = invoke(root, 'query');
  const visible = [
    JSON.stringify(report),
    JSON.stringify(query),
    readFileSync(join(root, 'qa_interaction_ledger.jsonl'), 'utf8'),
  ].join('\n');
  for (const canary of canaries) assert.equal(visible.includes(canary), false);
  assert.deepEqual(readFileSync(join(root, 'raw', 'questions', 'se-q-private-payload.md')), raw);

  assert.deepEqual(invoke(root, 'record-question', {
    interaction_id: 'p00-000',
    scope: 'exploratory',
    event_time: '2026-08-12T06:01:00Z',
    question_bytes: Buffer.from('unsafe identity', 'utf8'),
  }).issues, ['IDENTIFIER_REFUSED']);
  assert.deepEqual(invoke(root, 'import-existing', {
    interaction_id: 'historical-safe',
    scope: 'fixed_benchmark',
    question_event_time: '2026-08-12T06:02:00Z',
    question_ref: '../escape.md',
    provider: 'engine',
    attempt_id: 'attempt-01',
    answer_event_time: '2026-08-12T06:03:00Z',
    answer_ref: 'exports/safe.md',
  }).issues, ['ARTIFACT_REF_REFUSED']);
  assert.deepEqual(invoke(root, 'import-existing', {
    interaction_id: 'historical-safe',
    scope: 'fixed_benchmark',
    question_event_time: '2026-08-12T06:02:00Z',
    question_ref: 'exports/P00-000/question.md',
    provider: 'engine',
    attempt_id: 'attempt-01',
    answer_event_time: '2026-08-12T06:03:00Z',
    answer_ref: 'exports/safe.md',
  }).issues, ['ARTIFACT_REF_REFUSED']);
  const unknownCommand = captureQaInteraction({
    root_path: root,
    command: 'secret-canary-command',
  });
  assert.equal(JSON.stringify(unknownCommand).includes('secret-canary-command'), false);
  assert.deepEqual(invoke(root, 'import-existing', {
    interaction_id: 'historical-self-ref',
    scope: 'fixed_benchmark',
    question_event_time: '2026-08-12T06:02:00Z',
    question_ref: 'QA_INTERACTION_LEDGER.JSONL',
    provider: 'engine',
    attempt_id: 'attempt-01',
    answer_event_time: '2026-08-12T06:03:00Z',
    answer_ref: 'exports/safe.md',
  }).issues, ['ARTIFACT_REF_REFUSED']);
  linkSync(
    join(root, 'qa_interaction_ledger.jsonl'),
    join(root, 'ledger-hardlink.md'),
  );
  assert.deepEqual(invoke(root, 'import-existing', {
    interaction_id: 'historical-hardlink-ref',
    scope: 'fixed_benchmark',
    question_event_time: '2026-08-12T06:02:00Z',
    question_ref: 'ledger-hardlink.md',
    provider: 'engine',
    attempt_id: 'attempt-01',
    answer_event_time: '2026-08-12T06:03:00Z',
    answer_ref: 'exports/safe.md',
  }).issues, ['ARTIFACT_REF_REFUSED']);
});

test('validation detects event-chain tampering', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  invoke(root, 'record-question', {
    interaction_id: 'se-q-chain',
    scope: 'fixed_benchmark',
    event_time: '2026-08-12T07:00:00Z',
    question_bytes: Buffer.from('chain protected question', 'utf8'),
  });
  const ledgerPath = join(root, 'qa_interaction_ledger.jsonl');
  const event = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  event.scope = 'exploratory';
  writeFileSync(ledgerPath, `${JSON.stringify(event)}\n`);

  const report = invoke(root, 'validate');
  assert.equal(report.result, 'HOLD');
  assert.deepEqual(report.issues, ['LEDGER_CHAIN_INVALID']);
});

test('validation detects mutation of an artifact committed by the ledger', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  invoke(root, 'record-question', {
    interaction_id: 'se-q-artifact-chain',
    scope: 'fixed_benchmark',
    event_time: '2026-08-12T07:10:00Z',
    question_bytes: Buffer.from('original artifact bytes', 'utf8'),
  });
  writeFileSync(
    join(root, 'raw', 'questions', 'se-q-artifact-chain.md'),
    Buffer.from('mutated artifact bytes!', 'utf8'),
  );
  const report = invoke(root, 'validate');
  assert.equal(report.result, 'HOLD');
  assert.deepEqual(report.issues, ['ARTIFACT_COMMITMENT_MISMATCH']);
});

test('review capture refuses closed JSON containing review prose', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  invoke(root, 'record-question', {
    interaction_id: 'se-q-review-prose',
    scope: 'exploratory',
    event_time: '2026-08-12T08:00:00Z',
    question_bytes: Buffer.from('question', 'utf8'),
  });
  invoke(root, 'record-answer', {
    interaction_id: 'se-q-review-prose',
    provider: 'notebook',
    attempt_id: 'round-01',
    event_time: '2026-08-12T08:01:00Z',
    answer_bytes: Buffer.from('answer', 'utf8'),
  });
  const canary = 'RAW_REVIEW_PROSE_MUST_NOT_ENTER_LEDGER';
  const reviewRef = 'reviews/status/prose-refused.json';
  writeRootFile(root, reviewRef, Buffer.from(JSON.stringify({
    schema_version: 'soulforge.engineering_engine.se_core_eval_qa_status_review.v1',
    review_state: 'closed',
    interaction_id: 'se-q-review-prose',
    provider: 'notebook',
    attempt_id: 'round-01',
    verdict: 'fail',
    review_prose: canary,
  }), 'utf8'));
  const result = invoke(root, 'record-review', {
    interaction_id: 'se-q-review-prose',
    provider: 'notebook',
    attempt_id: 'round-01',
    event_time: '2026-08-12T08:02:00Z',
    review_ref: reviewRef,
  });
  assert.deepEqual(result.issues, ['REVIEW_STATUS_REFUSED']);
  assert.equal(JSON.stringify(result).includes(canary), false);
  assert.equal(invoke(root, 'query').counts.review_recorded, 0);
});

test('review capture uses an exact status-only schema and binds its identity', () => {
  for (const mutation of [
    { payload: 'RAW_PROSE_CANARY' },
    { message: 'MORE_RAW_PROSE' },
    { provider: 'notebook' },
  ]) {
    const root = makeRoot();
    invoke(root, 'initialize');
    invoke(root, 'record-question', {
      interaction_id: 'se-q-review-schema',
      scope: 'exploratory',
      event_time: '2026-08-12T08:10:00Z',
      question_bytes: Buffer.from('question', 'utf8'),
    });
    invoke(root, 'record-answer', {
      interaction_id: 'se-q-review-schema',
      provider: 'engine',
      attempt_id: 'attempt-01',
      event_time: '2026-08-12T08:11:00Z',
      answer_bytes: Buffer.from('answer', 'utf8'),
    });
    const reviewRef = 'reviews/status/exact-schema.json';
    writeRootFile(root, reviewRef, Buffer.from(JSON.stringify({
      schema_version: 'soulforge.engineering_engine.se_core_eval_qa_status_review.v1',
      review_state: 'closed',
      interaction_id: 'se-q-review-schema',
      provider: 'engine',
      attempt_id: 'attempt-01',
      verdict: 'pass',
      ...mutation,
    }), 'utf8'));
    const result = invoke(root, 'record-review', {
      interaction_id: 'se-q-review-schema',
      provider: 'engine',
      attempt_id: 'attempt-01',
      event_time: '2026-08-12T08:12:00Z',
      review_ref: reviewRef,
    });
    assert.equal(result.result, 'HOLD');
    assert.equal(JSON.stringify(result).includes('RAW_PROSE_CANARY'), false);
    assert.equal(JSON.stringify(result).includes('MORE_RAW_PROSE'), false);
  }
});

test('interaction and attempt ids use allocated non-account namespaces', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  assert.deepEqual(invoke(root, 'record-question', {
    interaction_id: 'client-847293',
    scope: 'exploratory',
    event_time: '2026-08-12T08:20:00Z',
    question_bytes: Buffer.from('question', 'utf8'),
  }).issues, ['IDENTIFIER_REFUSED']);
  invoke(root, 'record-question', {
    interaction_id: 'se-q-safe-id',
    scope: 'exploratory',
    event_time: '2026-08-12T08:20:00Z',
    question_bytes: Buffer.from('question', 'utf8'),
  });
  assert.deepEqual(invoke(root, 'record-answer', {
    interaction_id: 'se-q-safe-id',
    provider: 'engine',
    attempt_id: 'client-847293',
    event_time: '2026-08-12T08:21:00Z',
    answer_bytes: Buffer.from('answer', 'utf8'),
  }).issues, ['IDENTIFIER_REFUSED']);
});

test('reserved account-style tokens are refused anywhere in the identifier body', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  for (const interactionId of [
    'se-q-account-owner',
    'se-q-client-847293',
    'se-q-customer.42',
    'historical-tenant-9',
    'se-q-project-alpha',
    'historical-credential-note',
    'se-q-p26-014',
  ]) {
    const refused = invoke(root, 'record-question', {
      interaction_id: interactionId,
      scope: 'exploratory',
      event_time: '2026-08-12T10:00:00Z',
      question_bytes: Buffer.from('question', 'utf8'),
    });
    assert.deepEqual(refused.issues, ['IDENTIFIER_REFUSED']);
    assert.equal(JSON.stringify(refused).includes(interactionId), false);
  }

  assert.equal(invoke(root, 'record-question', {
    interaction_id: 'se-q-accountability-002',
    scope: 'fixed_benchmark',
    event_time: '2026-08-12T10:10:00Z',
    question_bytes: Buffer.from('ordinary question', 'utf8'),
  }).result, 'PASS');
  for (const attemptId of [
    'attempt-account-owner',
    'round-client-1',
    'retry-secret.2',
    'attempt-p26-014',
  ]) {
    const refused = invoke(root, 'record-answer', {
      interaction_id: 'se-q-accountability-002',
      provider: 'engine',
      attempt_id: attemptId,
      event_time: '2026-08-12T10:11:00Z',
      answer_bytes: Buffer.from('answer', 'utf8'),
    });
    assert.deepEqual(refused.issues, ['IDENTIFIER_REFUSED']);
    assert.equal(JSON.stringify(refused).includes(attemptId), false);
  }

  assert.equal(invoke(root, 'record-answer', {
    interaction_id: 'se-q-accountability-002',
    provider: 'engine',
    attempt_id: 'retry-02',
    event_time: '2026-08-12T10:11:00Z',
    answer_bytes: Buffer.from('ordinary answer', 'utf8'),
  }).result, 'PASS');
  assert.equal(invoke(root, 'record-answer', {
    interaction_id: 'se-q-accountability-002',
    provider: 'notebook',
    attempt_id: 'round-2',
    event_time: '2026-08-12T10:12:00Z',
    answer_bytes: Buffer.from('ordinary notebook answer', 'utf8'),
  }).result, 'PASS');
  const validated = invoke(root, 'validate');
  assert.equal(validated.result, 'PASS');
  assert.equal(validated.event_count, 3);
});

test('historical import refuses a question and answer that are one physical file', (t) => {
  const root = makeRoot();
  invoke(root, 'initialize');
  const turn = writeRootFile(root, 'exports/history/turn-01.md', Buffer.from('one turn', 'utf8'));
  const before = readFileSync(join(root, 'qa_interaction_ledger.jsonl'));
  const request = {
    interaction_id: 'historical-same-file',
    scope: 'fixed_benchmark',
    question_event_time: '2026-07-02T00:00:00Z',
    question_ref: 'exports/history/turn-01.md',
    provider: 'notebook',
    attempt_id: 'round-01',
    answer_event_time: '2026-07-02T00:01:00Z',
    answer_ref: 'exports/history/turn-01.md',
  };
  const sameRef = invoke(root, 'import-existing', request);
  assert.equal(sameRef.result, 'HOLD');
  assert.deepEqual(sameRef.issues, ['ARTIFACT_IDENTITY_COLLISION']);

  let hardlinked = false;
  if (statSync(turn, { bigint: true }).ino !== 0n) {
    try {
      linkSync(turn, join(root, 'exports', 'history', 'turn-01-alias.md'));
      hardlinked = true;
    } catch { /* probed below as an unavailable environment capability */ }
  }
  if (hardlinked) {
    const aliased = invoke(root, 'import-existing', {
      ...request,
      interaction_id: 'historical-hardlink-pair',
      answer_ref: 'exports/history/turn-01-alias.md',
    });
    assert.equal(aliased.result, 'HOLD');
    assert.deepEqual(aliased.issues, ['ARTIFACT_IDENTITY_COLLISION']);
  } else {
    t.diagnostic('hardlink identity probe skipped: no usable hardlink or inode on this filesystem');
  }

  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), before);
  assert.equal(invoke(root, 'query').event_count, 0);
  assert.equal(existsSync(join(root, 'raw')), false);
});

test('historical import refuses multi-record container files and accepts single-turn text', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  const rowCanary = 'MULTI_ROW_CANARY';
  const questions = Buffer.from(JSON.stringify([
    { id: 'row-01', question: `first ${rowCanary}` },
    { id: 'row-02', question: `second ${rowCanary}` },
  ]), 'utf8');
  const answers = Buffer.from(JSON.stringify([
    { id: 'row-01', answer: `first ${rowCanary}` },
    { id: 'row-02', answer: `second ${rowCanary}` },
  ]), 'utf8');
  writeRootFile(root, 'exports/history/questions.json', questions);
  writeRootFile(root, 'exports/history/answers.json', answers);
  writeRootFile(root, 'exports/history/questions-renamed.md', questions);
  writeRootFile(root, 'exports/history/answers-renamed.md', answers);
  const before = readFileSync(join(root, 'qa_interaction_ledger.jsonl'));

  for (const [questionRef, answerRef] of [
    ['exports/history/questions.json', 'exports/history/answers.json'],
    ['exports/history/questions-renamed.md', 'exports/history/answers-renamed.md'],
  ]) {
    const refused = invoke(root, 'import-existing', {
      interaction_id: 'historical-multi-row',
      scope: 'fixed_benchmark',
      question_event_time: '2026-07-03T00:00:00Z',
      question_ref: questionRef,
      provider: 'notebook',
      attempt_id: 'round-01',
      answer_event_time: '2026-07-03T00:01:00Z',
      answer_ref: answerRef,
    });
    assert.equal(refused.result, 'HOLD');
    assert.deepEqual(refused.issues, ['HISTORICAL_IMPORT_FORMAT_REFUSED']);
    assert.equal(JSON.stringify(refused).includes(rowCanary), false);
  }
  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), before);
  assert.equal(invoke(root, 'query').event_count, 0);
  assert.equal(existsSync(join(root, 'raw')), false);

  writeRootFile(root, 'exports/history/turn-02-question.txt', Buffer.from('plain question', 'utf8'));
  writeRootFile(root, 'exports/history/turn-02-answer.txt', Buffer.from('plain answer', 'utf8'));
  const accepted = invoke(root, 'import-existing', {
    interaction_id: 'historical-plain-text',
    scope: 'fixed_benchmark',
    question_event_time: '2026-07-03T01:00:00Z',
    question_ref: 'exports/history/turn-02-question.txt',
    provider: 'notebook',
    attempt_id: 'round-01',
    answer_event_time: '2026-07-03T01:01:00Z',
    answer_ref: 'exports/history/turn-02-answer.txt',
  });
  assert.equal(accepted.result, 'PASS');
  assert.equal(accepted.appended_event_count, 2);
  assert.equal(invoke(root, 'validate').result, 'PASS');
});

test('thin CLI records explicit file bytes and emits metadata only', () => {
  const root = makeRoot();
  const canary = 'CLI_RAW_CANARY_MUST_NOT_BE_ECHOED';
  const input = writeRootFile(root, 'staging/question.bin', Buffer.from(canary, 'utf8'));
  const answerInput = writeRootFile(
    root,
    'staging/answer.bin',
    Buffer.from(`${canary}_ANSWER`, 'utf8'),
  );
  assert.equal(runCli(['node', 'capture', 'initialize', '--root', root]).exit_code, 0);
  const recorded = runCli([
    'node',
    'capture',
    'record-question',
    '--root', root,
    '--interaction-id', 'se-q-cli',
    '--scope', 'exploratory',
    '--event-time', '2026-08-12T09:00:00Z',
    '--question-file', input,
  ]);
  assert.equal(recorded.exit_code, 0);
  assert.equal(recorded.stdout.toString('utf8').includes(canary), false);
  const answered = runCli([
    'node',
    'capture',
    'record-answer',
    '--root', root,
    '--interaction-id', 'se-q-cli',
    '--provider', 'engine',
    '--attempt-id', 'attempt-01',
    '--event-time', '2026-08-12T09:01:00Z',
    '--answer-file', answerInput,
  ]);
  assert.equal(answered.exit_code, 0);
  assert.equal(answered.stdout.toString('utf8').includes(canary), false);
  const reviewRef = 'reviews/status/se-q-cli.json';
  writeRootFile(root, reviewRef, Buffer.from(JSON.stringify({
    schema_version: 'soulforge.engineering_engine.se_core_eval_qa_status_review.v1',
    review_state: 'closed',
    interaction_id: 'se-q-cli',
    provider: 'engine',
    attempt_id: 'attempt-01',
    verdict: 'pass',
  }), 'utf8'));
  assert.equal(runCli([
    'node',
    'capture',
    'record-review',
    '--root', root,
    '--interaction-id', 'se-q-cli',
    '--provider', 'engine',
    '--attempt-id', 'attempt-01',
    '--event-time', '2026-08-12T09:02:00Z',
    '--review-ref', reviewRef,
  ]).exit_code, 0);
  const query = runCli(['node', 'capture', 'query', '--root', root]);
  assert.equal(query.exit_code, 0);
  assert.equal(JSON.parse(query.stdout).event_count, 3);
  assert.equal(query.stdout.toString('utf8').includes(canary), false);
});

test('historical import accumulates all seventy question and answer pairs', () => {
  const root = makeRoot();
  invoke(root, 'initialize');
  for (let index = 1; index <= 70; index += 1) {
    const id = String(index).padStart(3, '0');
    const questionRef = `history/questions/question-${id}.md`;
    const answerRef = `history/answers/answer-${id}.md`;
    const questionTime = new Date(Date.UTC(2026, 6, 1) + ((index - 1) * 60_000)).toISOString();
    const answerTime = new Date(Date.parse(questionTime) + 30_000).toISOString();
    writeRootFile(root, questionRef, Buffer.from(`historical question ${id}`, 'utf8'));
    writeRootFile(root, answerRef, Buffer.from(`historical answer ${id}`, 'utf8'));
    const imported = invoke(root, 'import-existing', {
      interaction_id: `historical-${id}`,
      scope: 'fixed_benchmark',
      question_event_time: questionTime,
      question_ref: questionRef,
      provider: index % 2 === 0 ? 'engine' : 'notebook',
      attempt_id: 'attempt-01',
      answer_event_time: answerTime,
      answer_ref: answerRef,
    });
    assert.equal(imported.result, 'PASS');
  }
  const report = invoke(root, 'validate');
  assert.equal(report.result, 'PASS');
  assert.equal(report.event_count, 140);
  assert.deepEqual(report.counts, {
    answer_received: 70,
    question_recorded: 70,
    review_recorded: 0,
  });
});
