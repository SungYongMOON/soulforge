// Every rule of `src/runtime/voice_morning_questions.mjs`. Pure function, no
// I/O, no model -- every case here is a plain object in, a plain object out.
// Each test names the CE-30..34 bullet (S4-4) it covers in its own title.
import assert from 'node:assert/strict';
import test from 'node:test';
import { selectQuestions, questionIdFor, todayInTz } from '../src/runtime/voice_morning_questions.mjs';

const NOW = '2026-09-20T18:00:00.000Z';
const row = (overrides = {}) => ({ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001',
  title: '구간', clock: '2026-09-19T09:00:00+09:00', candidates: ['P24-049'], risk_markers: [],
  why: 'important_and_unresolved', modality: null, receipt_ran_at: NOW, ...overrides });

// -------------------------------------------------------------------- purity
test('selectQuestions is pure: the same inputs, called twice, return identical presented ids in the same order', () => {
  const exceptions = Array.from({ length: 5 }, (_, index) => row({ session_id: `sess${index}` }));
  const a = selectQuestions({ exceptions, now: NOW, cap: 10 });
  const b = selectQuestions({ exceptions, now: NOW, cap: 10 });
  assert.deepEqual(a.presented.map(question => question.question_id), b.presented.map(question => question.question_id));
  assert.deepEqual(a.metrics, b.metrics);
});

test('selectQuestions never mutates its own exceptions/ledger arguments', () => {
  const exceptions = [row()];
  const ledger = { questions: [] };
  const before = JSON.stringify({ exceptions, ledger });
  selectQuestions({ exceptions, ledger, now: NOW, cap: 10 });
  assert.equal(JSON.stringify({ exceptions, ledger }), before);
});

// ----------------------------------------------------------------- grouping
test('questionIdFor is stable regardless of target order (sorted internally)', () => {
  const targets = [{ session_id: 's', run_id: 'r', segment_id: 'b' }, { session_id: 's', run_id: 'r', segment_id: 'a' }];
  assert.equal(questionIdFor('귀속', targets), questionIdFor('귀속', [...targets].reverse()));
});

test('grouping = one question only when session_id, reason family and candidate set all match; never merges by title/date alone', () => {
  const a = row({ session_id: 'sess1', segment_id: 'c001', title: '제목 A', clock: '2026-09-19T09:00:00+09:00' });
  const b = row({ session_id: 'sess1', segment_id: 'c002', title: '제목 A', clock: '2026-09-19T09:00:00+09:00' });
  // Same title and same clock, but a different session_id: never merged.
  const c = row({ session_id: 'sess2', segment_id: 'c001', title: '제목 A', clock: '2026-09-19T09:00:00+09:00' });
  const result = selectQuestions({ exceptions: [a, b, c], now: NOW, cap: 10 });
  assert.equal(result.presented.length, 2, 'sess1 (a+b merged) and sess2 (c) are two questions');
  const sess1Question = result.presented.find(question => question.targets[0].session_id === 'sess1');
  assert.equal(sess1Question.targets.length, 2);
});

test('CE-32: 20 exception rows from one session, same reason and candidates, become one question with 20 targets', () => {
  const exceptions = Array.from({ length: 20 }, (_, index) =>
    row({ segment_id: `c${String(index).padStart(3, '0')}` }));
  const result = selectQuestions({ exceptions, now: NOW, cap: 10 });
  assert.equal(result.presented.length, 1);
  assert.equal(result.presented[0].targets.length, 20);
});

test('a different candidate set on the same session and reason is a separate question', () => {
  const a = row({ segment_id: 'c001', candidates: ['P24-049'] });
  const b = row({ segment_id: 'c002', candidates: ['P26-014'] });
  const result = selectQuestions({ exceptions: [a, b], now: NOW, cap: 10 });
  assert.equal(result.presented.length, 2);
});

test('CE-32: different undecided fields on one segment (귀속 + 내용확인) are two questions, one per kind', () => {
  const attribution = row({ why: 'important_and_unresolved' });
  const content = row({ why: 'content_mismatch' });
  const result = selectQuestions({ exceptions: [attribution, content], now: NOW, cap: 10 });
  assert.equal(result.presented.length, 2);
  assert.deepEqual(result.presented.map(question => question.kind).sort(), ['귀속', '내용확인']);
});

test('the four attribution reasons (strong_conflict/important_and_unresolved/missing_context/new_project_candidate) group together as one 귀속 kind', () => {
  const reasons = ['strong_conflict', 'important_and_unresolved', 'missing_context', 'new_project_candidate'];
  const exceptions = reasons.map((why, index) => row({ segment_id: `c${index}`, why }));
  const result = selectQuestions({ exceptions, now: NOW, cap: 10 });
  assert.equal(result.presented.length, 1);
  assert.equal(result.presented[0].kind, '귀속');
  assert.equal(result.presented[0].targets.length, 4);
});

test('needs_split is its own 분할 kind and conditional_or_reported is its own 조건확인 kind', () => {
  const split = row({ segment_id: 'c001', why: 'needs_split' });
  const conditional = row({ segment_id: 'c002', why: 'conditional_or_reported' });
  const result = selectQuestions({ exceptions: [split, conditional], now: NOW, cap: 10 });
  assert.deepEqual(result.presented.map(question => question.kind).sort(), ['분할', '조건확인']);
});

test('a malformed exception row (missing ids, or an unrecognised reason) is dropped from grouping, not thrown on', () => {
  const bad1 = { session_id: 'sess1', title: 'x' }; // no run_id/segment_id/why
  const bad2 = row({ why: 'some_future_reason_this_module_does_not_know' });
  const good = row();
  const result = selectQuestions({ exceptions: [bad1, bad2, good], now: NOW, cap: 10 });
  assert.equal(result.presented.length, 1);
});

// --------------------------------------------------------------- cap/overflow
test('CE-31: 12 independent questions, cap 10, is 10 presented and 2 carried over', () => {
  const exceptions = Array.from({ length: 12 }, (_, index) => row({ session_id: `sess${index}` }));
  const result = selectQuestions({ exceptions, now: NOW, cap: 10 });
  assert.equal(result.presented.length, 10);
  assert.equal(result.carried_over.length, 2);
  assert.equal(result.urgent_overflow.length, 0);
  assert.equal(result.metrics.total_unresolved, 12);
});

test('CE-31: a same-day rerun of the same 12 candidates presents the exact same 10 ids, none new', () => {
  const exceptions = Array.from({ length: 12 }, (_, index) => row({ session_id: `sess${index}` }));
  const first = selectQuestions({ exceptions, now: NOW, cap: 10 });
  const ledgerAfter = { questions: [...first.presented, ...first.carried_over].map(question => ({
    question_id: question.question_id, kind: question.kind, targets: question.targets, options: question.options,
    representative: question.representative, status: 'presented', first_seen: question.first_seen,
    presented_on: question.presented_on, answered: null, reopened_from: question.reopened_from })) };
  const second = selectQuestions({ exceptions, ledger: ledgerAfter, now: '2026-09-20T19:00:00.000Z', cap: 10 });
  assert.deepEqual(second.presented.map(question => question.question_id).sort(),
    first.presented.map(question => question.question_id).sort());
  assert.equal(second.metrics.new_today, 0);
});

test('CE-31/33: 11 urgent questions, cap 10, is 10 presented (all urgent) and 1 listed in urgent_overflow, cap never silently raised', () => {
  const exceptions = Array.from({ length: 11 }, (_, index) => row({ session_id: `sess${index}`, risk_markers: ['마감'] }));
  const result = selectQuestions({ exceptions, now: NOW, cap: 10 });
  assert.equal(result.presented.length, 10);
  assert.equal(result.presented.every(question => question.urgent), true);
  assert.equal(result.urgent_overflow.length, 1);
  assert.equal(result.metrics.urgent_overflow, 1);
});

test('a deadline/decision marker (납기/마감/기한/계약/발주/금액), or content_mismatch, marks a question urgent and sorts it before non-urgent ones', () => {
  const urgent = row({ session_id: 'sess-urgent', risk_markers: ['계약'] });
  const contentMismatch = row({ session_id: 'sess-content', why: 'content_mismatch' });
  const ordinary = row({ session_id: 'sess-ordinary' });
  const result = selectQuestions({ exceptions: [ordinary, urgent, contentMismatch], now: NOW, cap: 2 });
  assert.equal(result.presented.length, 2);
  assert.equal(result.presented.every(question => question.urgent), true);
  assert.equal(result.carried_over.length, 1);
  assert.equal(result.carried_over[0].urgent, false);
});

test('within the same urgency, the oldest first_seen is presented first when the cap forces a choice', () => {
  const ledger = { questions: [
    { question_id: questionIdFor('귀속', [{ session_id: 'sess-old', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001' }], ['P24-049']),
      kind: '귀속', first_seen: '2026-09-01T00:00:00.000Z', status: 'presented', presented_on: ['2026-09-01'],
      targets: [{ session_id: 'sess-old', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001', receipt_ran_at: NOW }],
      options: [], representative: {}, answered: null, reopened_from: null },
  ] };
  const oldException = row({ session_id: 'sess-old' });
  const newException = row({ session_id: 'sess-new' });
  const result = selectQuestions({ exceptions: [newException, oldException], ledger, now: NOW, cap: 1 });
  assert.equal(result.presented[0].targets[0].session_id, 'sess-old');
});

// --------------------------------------------------------------- reuse/reopen
test('CE-30: an answered question whose targets are unchanged is resolved_by_reuse, not re-asked', () => {
  const targets = [{ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001', receipt_ran_at: NOW }];
  const questionId = questionIdFor('귀속', targets, ['P24-049']);
  const ledger = { questions: [{ question_id: questionId, kind: '귀속', targets, options: ['P24-049'],
    representative: { time: '09:00', title: '구간' }, status: 'answered', first_seen: '2026-09-19T00:00:00.000Z',
    presented_on: ['2026-09-19'], answered: { by: 'actor:owner:someone', at: '2026-09-19T21:00:00.000Z', choice: 'P24-049' },
    reopened_from: null }] };
  const result = selectQuestions({ exceptions: [row()], ledger, now: NOW, cap: 10 });
  assert.equal(result.presented.length, 0);
  assert.equal(result.resolved_by_reuse.length, 1);
  assert.equal(result.resolved_by_reuse[0].question_id, questionId);
  assert.equal(result.metrics.resolved_by_reuse, 1);
});

test('CE-30: unanswered persists across days with its original first_seen kept, not reset', () => {
  const targets = [{ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001', receipt_ran_at: NOW }];
  const questionId = questionIdFor('귀속', targets, ['P24-049']);
  const ledger = { questions: [{ question_id: questionId, kind: '귀속', targets, options: ['P24-049'],
    representative: { time: '09:00', title: '구간' }, status: 'presented', first_seen: '2026-09-10T00:00:00.000Z',
    presented_on: ['2026-09-10'], answered: null, reopened_from: null }] };
  const result = selectQuestions({ exceptions: [row()], ledger, now: '2026-09-20T18:00:00.000Z', cap: 10 });
  assert.equal(result.presented[0].first_seen, '2026-09-10T00:00:00.000Z');
  assert.ok(result.metrics.oldest_wait_days >= 10);
});

test('a run_id change on the same segment reopens as a new question id, linking back with reopened_from', () => {
  const oldTargets = [{ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001', receipt_ran_at: NOW }];
  const oldId = questionIdFor('귀속', oldTargets, ['P24-049']);
  const ledger = { questions: [{ question_id: oldId, kind: '귀속', targets: oldTargets, options: ['P24-049'],
    representative: { time: '09:00', title: '구간' }, status: 'answered', first_seen: '2026-09-19T00:00:00.000Z',
    presented_on: ['2026-09-19'], answered: { by: 'actor:owner:someone', at: '2026-09-19T21:00:00.000Z', choice: 'P24-049' },
    reopened_from: null }] };
  const reTranscribed = row({ run_id: 'vcl_bbbbbbbbbbbbbbbb' }); // same session_id/segment_id, new run_id
  const result = selectQuestions({ exceptions: [reTranscribed], ledger, now: NOW, cap: 10 });
  assert.equal(result.resolved_by_reuse.length, 0, 'the changed run_id means the old answer no longer covers it');
  assert.equal(result.presented.length, 1);
  assert.notEqual(result.presented[0].question_id, oldId);
  assert.equal(result.presented[0].reopened_from, oldId);
  assert.equal(result.metrics.reopened, 1);
});

test('a new contradiction (a new exception reason on the same segment) reopens as its own new-kind question, not folded into the answered one', () => {
  const targets = [{ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001', receipt_ran_at: NOW }];
  const answeredId = questionIdFor('귀속', targets, ['P24-049']);
  const ledger = { questions: [{ question_id: answeredId, kind: '귀속', targets, options: ['P24-049'],
    representative: { time: '09:00', title: '구간' }, status: 'answered', first_seen: '2026-09-19T00:00:00.000Z',
    presented_on: ['2026-09-19'], answered: { by: 'actor:owner:someone', at: '2026-09-19T21:00:00.000Z', choice: 'P24-049' },
    reopened_from: null }] };
  const newMismatch = row({ why: 'content_mismatch' }); // same session/run/segment, different reason family
  const result = selectQuestions({ exceptions: [newMismatch], ledger, now: NOW, cap: 10 });
  assert.equal(result.presented.length, 1);
  assert.equal(result.presented[0].kind, '내용확인');
});

// ------------------------------------------------------------------- metrics
test('metrics report every field the CLI receipt needs, consistently with the returned lists', () => {
  const exceptions = Array.from({ length: 3 }, (_, index) => row({ session_id: `sess${index}` }));
  const result = selectQuestions({ exceptions, now: NOW, cap: 2 });
  assert.deepEqual(Object.keys(result.metrics).sort(), ['carried_over', 'new_today', 'oldest_wait_days',
    'presented_today', 'reopened', 'resolved_by_reuse', 'total_unresolved', 'urgent_overflow'].sort());
  assert.equal(result.metrics.presented_today, result.presented.length);
  assert.equal(result.metrics.carried_over, result.carried_over.length);
  assert.equal(result.metrics.total_unresolved, exceptions.length);
});

test('nit: cap 0 is refused (voice_morning_questions_cap_invalid), not treated as "present nothing"', () => {
  const exceptions = [row({ session_id: 'a' }), row({ session_id: 'b', risk_markers: ['마감'] })];
  assert.throws(() => selectQuestions({ exceptions, now: NOW, cap: 0 }), /voice_morning_questions_cap_invalid/u);
});

test('nit: a negative cap is refused the same way', () => {
  assert.throws(() => selectQuestions({ exceptions: [row()], now: NOW, cap: -1 }), /voice_morning_questions_cap_invalid/u);
});

test('nit: `now` is required -- no clock default in this pure module', () => {
  assert.throws(() => selectQuestions({ exceptions: [row()], cap: 10 }), /voice_morning_questions_now_required/u);
  assert.throws(() => selectQuestions({ exceptions: [row()], now: 'not-a-date', cap: 10 }), /voice_morning_questions_now_required/u);
});

test('nit: "today" is computed in Asia/Seoul, not raw UTC -- 14:30Z is still 09-21 KST, 15:30Z is already 09-22 KST', () => {
  assert.equal(todayInTz('2026-09-21T14:30:00.000Z', 'Asia/Seoul'), '2026-09-21');
  assert.equal(todayInTz('2026-09-21T15:30:00.000Z', 'Asia/Seoul'), '2026-09-22');
});

test('nit: selectQuestions itself uses the tz-aware "today" for presented_on, not a UTC slice', () => {
  const result = selectQuestions({ exceptions: [row({ session_id: 'kst-boundary' })], now: '2026-09-21T15:30:00.000Z', cap: 10 });
  assert.deepEqual(result.presented[0].presented_on, ['2026-09-22']);
});

// ----------------------------------------------------------------------- R2
test('R2: the same segment under two different candidate sets is two questions with two different ids (candidates are part of the id)', () => {
  const a = row({ segment_id: 'c001', candidates: ['P24-049'] });
  const b = row({ segment_id: 'c001', candidates: ['P26-014'] });
  const idA = questionIdFor('귀속', [{ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001' }], ['P24-049']);
  const idB = questionIdFor('귀속', [{ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001' }], ['P26-014']);
  assert.notEqual(idA, idB, 'kind+targets alone used to collide; candidates in the hash now separate them');
  const result = selectQuestions({ exceptions: [a, b], now: NOW, cap: 10 });
  assert.equal(result.presented.length, 2, 'two ledger rows, one per candidate set');
  assert.deepEqual(result.presented.map(question => question.question_id).sort(), [idA, idB].sort());
});

test('an empty exception pool with an empty ledger presents nothing, cleanly', () => {
  const result = selectQuestions({ exceptions: [], ledger: { questions: [] }, now: NOW, cap: 10 });
  assert.deepEqual(result.presented, []);
  assert.deepEqual(result.carried_over, []);
  assert.deepEqual(result.urgent_overflow, []);
  assert.deepEqual(result.resolved_by_reuse, []);
  assert.equal(result.metrics.total_unresolved, 0);
});
