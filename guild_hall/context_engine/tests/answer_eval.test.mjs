// Deterministic answer evaluation: what the question set refuses, how it
// matches Korean and ASCII ids differently, both answer modes, the comparison
// and its exit code, and what the receipt is not allowed to contain.
//
// Hermetic and cross-platform: no host path is written down anywhere, every
// root is a fresh `os.tmpdir()` directory, and the only process this file ever
// starts is `process.execPath` running a tiny script it wrote itself. Nothing
// here calls a model or a bot.
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANSWER_EVAL_QUESTIONS_SCHEMA, ANSWER_EVAL_ASK_COMMAND_SCHEMA, ANSWER_EVAL_RECEIPT_SCHEMA,
  AnswerEvalError, MAX_ANSWER_BYTES, compareRuns, compileItem, normalizeText, scoreAnswer, summarize,
  validateAskCommand, validateQuestionSet,
} from '../src/runtime/answer_eval.mjs';
import { compileSafePattern } from '../src/runtime/safe_pattern.mjs';
import { killProcessTree, latestReceipt, renderComparison, renderTable, runAnswerEval, runAnswerEvalCli, writeReceipt } from '../harness/answer_eval.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const NOW = '2026-02-01T00:00:00.000Z';
const tmp = prefix => realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));

const keys = (...entries) => entries.map(([key, ...anyOf]) => ({ key, any_of: anyOf }));

function questionSet(questions, extra = {}) {
  return { schema: ANSWER_EVAL_QUESTIONS_SCHEMA, set_id: 'test-set', created_at: '2026-01-01T00:00:00.000Z',
    questions, ...extra };
}

const simpleSet = () => questionSet([
  { id: 'q1', prompt: '납기가 언제인가?', must_find: keys(['deadline', '2026-02-13'], ['owner', '김예시']),
    must_cite: keys(['mail', '1월 9일']), must_not: keys(['wrong', 'P00-002']), max_minutes: 2 },
  { id: 'q2', prompt: '열린 항목은?', must_find: keys(['ex1', 'EX-1'], ['ex15', 'EX-15']),
    must_cite: keys(['tracker', '추적기']) },
]);

function estate({ set = simpleSet() } = {}) {
  const root = tmp('answer-eval-');
  const questionsFile = path.join(root, 'questions.json');
  writeFileSync(questionsFile, `${JSON.stringify(set, null, 2)}\n`);
  const answersDir = path.join(root, 'answers');
  mkdirSync(answersDir, { recursive: true });
  const receiptsDir = path.join(root, 'receipts');
  return { root, questionsFile, answersDir, receiptsDir };
}

const writeAnswer = (dir, id, text) => writeFileSync(path.join(dir, `${id}.md`), text);

// A bot that is not a bot: writes whatever it was told to write, or misbehaves
// in one named way. Started only through `process.execPath`. `spawn-grandchild`
// starts an ordinary (non-detached) child of its own that would outlive it and
// write a marker file -- the orphan a timeout has to kill too.
function fakeBot(root) {
  const file = path.join(root, 'fake_bot.mjs');
  writeFileSync(file, `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const at = name => argv[argv.indexOf(name) + 1];
const mode = at('--mode');
const answerFile = at('--answer-file');
if (mode === 'exit-nonzero') process.exit(7);
if (mode === 'no-output') process.exit(0);
if (mode === 'exit-with-answer') {
  writeFileSync(answerFile, '2026-02-13 김예시 1월 9일 EX-1 EX-15 추적기');
  process.exit(9);
}
if (mode === 'spawn-grandchild') {
  spawn(process.execPath, [at('--grandchild'), at('--marker')], { stdio: 'ignore' });
  setInterval(() => {}, 1000);
} else if (mode === 'hang') { setInterval(() => {}, 1000); }
else if (mode === 'huge') { writeFileSync(answerFile, 'EX-1 ' + 'x'.repeat(${MAX_ANSWER_BYTES} + 4096)); }
else { writeFileSync(answerFile, '2026-02-13 김예시 1월 9일 EX-1 EX-15 추적기'); }
`);
  return file;
}

/** A stand-in child process, for the outcomes a real one cannot be made to produce on cue. */
function stubSpawner({ code = 0, signal = null, delayMs = 5, writeAnswer = null } = {}) {
  return (executable, args) => {
    const child = new EventEmitter();
    child.pid = 424242;
    child.kill = () => true;
    setTimeout(() => {
      // Every template in this file puts the answer file last.
      if (writeAnswer !== null) writeFileSync(args[args.length - 1], writeAnswer);
      child.emit('close', code, signal);
    }, delayMs);
    return child;
  };
}

function askCommandFile(root, botFile, mode, timeoutSeconds = 20) {
  const file = path.join(root, `ask-${mode}.json`);
  writeFileSync(file, JSON.stringify({ schema: ANSWER_EVAL_ASK_COMMAND_SCHEMA,
    argv: [process.execPath, botFile, '--mode', mode, '--prompt-file', '{prompt_file}', '--answer-file', '{answer_file}'],
    timeout_seconds: timeoutSeconds, env: [] }));
  return file;
}

const rowOf = (receipt, id) => receipt.results.find(row => row.question_id === id);
const refusal = (fn, code) => {
  assert.throws(fn, error => {
    assert.ok(error instanceof AnswerEvalError, `not an AnswerEvalError: ${error?.message}`);
    assert.equal(error.code, code, `expected ${code}, got ${error.code} (${error.detail ?? ''})`);
    return true;
  });
};

// ------------------------------------------------------- question set validation
test('a question set with an unknown schema, a typo\'d field, or a duplicate id is refused', () => {
  refusal(() => validateQuestionSet({ ...simpleSet(), schema: 'soulforge.something_else.v1' }), 'answer_eval_questions_schema_unknown');
  refusal(() => validateQuestionSet({ ...simpleSet(), extra: 1 }), 'answer_eval_questions_field_unknown');
  refusal(() => validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x', must_find: keys(['a', 'b']), mustnot: [] }])),
    'answer_eval_question_field_unknown');
  refusal(() => validateQuestionSet(questionSet([
    { id: 'q1', prompt: 'x', must_find: keys(['a', 'b']) },
    { id: 'q1', prompt: 'y', must_find: keys(['c', 'd']) }])), 'answer_eval_question_id_duplicate');
  refusal(() => validateQuestionSet(questionSet([])), 'answer_eval_questions_empty');
  refusal(() => validateQuestionSet({ ...simpleSet(), set_id: 'has spaces' }), 'answer_eval_set_id_invalid');
  refusal(() => validateQuestionSet({ ...simpleSet(), created_at: 'sometime' }), 'answer_eval_created_at_invalid');
});

test('a question that asserts nothing is refused rather than scored as a free 100%', () => {
  refusal(() => validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x' }])), 'answer_eval_question_has_no_keys');
  refusal(() => validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x', must_find: [], must_cite: [] }])),
    'answer_eval_question_has_no_keys');
});

test('key-level shape is checked: duplicate key, empty any_of, bad weight, unknown match mode, unknown field', () => {
  const withKeys = group => questionSet([{ id: 'q1', prompt: 'x', must_find: group }]);
  refusal(() => validateQuestionSet(withKeys([{ key: 'a', any_of: ['x'] }, { key: 'a', any_of: ['y'] }])), 'answer_eval_key_duplicate');
  refusal(() => validateQuestionSet(withKeys([{ key: 'a', any_of: [] }])), 'answer_eval_any_of_empty');
  refusal(() => validateQuestionSet(withKeys([{ key: 'a', any_of: ['x'], weight: 0 }])), 'answer_eval_weight_invalid');
  refusal(() => validateQuestionSet(withKeys([{ key: 'a', any_of: ['x'], weight: -1 }])), 'answer_eval_weight_invalid');
  refusal(() => validateQuestionSet(withKeys([{ key: 'a', any_of: ['x'], match: 'fuzzy' }])), 'answer_eval_match_mode_unknown');
  refusal(() => validateQuestionSet(withKeys([{ key: 'a', any_of: ['x'], wieght: 2 }])), 'answer_eval_key_field_unknown');
  refusal(() => validateQuestionSet(withKeys([{ key: 'a', any_of: ['   '] }])), 'answer_eval_pattern_empty');
  refusal(() => validateQuestionSet(withKeys([{ key: 'a', any_of: ['x'.repeat(201)] }])), 'answer_eval_pattern_too_long');
});

test('a regex item that is a ReDoS shape is refused, a safe one compiles', () => {
  const withPattern = pattern => questionSet([{ id: 'q1', prompt: 'x', must_find: [{ key: 'a', any_of: [pattern] }] }]);
  refusal(() => validateQuestionSet(withPattern('/(a+)+$/')), 'answer_eval_pattern_regex_unsafe');
  refusal(() => validateQuestionSet(withPattern('/(\\w+\\s?)+x/')), 'answer_eval_pattern_regex_unsafe');
  refusal(() => validateQuestionSet(withPattern('/(a)\\1/')), 'answer_eval_pattern_regex_unsafe');
  refusal(() => validateQuestionSet(withPattern('/ex-[/')), 'answer_eval_pattern_regex_unsafe');
  refusal(() => validateQuestionSet(withPattern('/ex-\\d/g')), 'answer_eval_pattern_flags_not_allowed');
  const compiled = validateQuestionSet(withPattern('/ex-\\d{1,4}/'));
  assert.equal(compiled.questions[0].must_find[0].matchers[0].kind, 'regex');
  // Matched against normalised (lower-cased) text, and an upper-case pattern
  // is not left as a silent never-match.
  const upper = validateQuestionSet(withPattern('/EX-\\d{1,4}/'));
  assert.equal(upper.questions[0].must_find[0].matchers[0].test(normalizeText('see EX-12 today')), true);
});

test('match: "token" refuses a needle that is not an ASCII token instead of quietly doing something else', () => {
  refusal(() => validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x',
    must_find: [{ key: 'a', any_of: ['납기일'], match: 'token' }] }])), 'answer_eval_pattern_not_a_token');
});

// ------------------------------------------------------------------- matching
test('normalisation folds case, NFKC and whitespace, including across a line break', () => {
  assert.equal(normalizeText('  Hello\n\tWorld  '), 'hello world');
  assert.equal(normalizeText('ＥＸ－１２３'), 'ex-123');
  assert.equal(normalizeText('２０２６-０２-１３'), '2026-02-13');
});

const scoreOne = (question, answer, extra = {}) => scoreAnswer({ question,
  clarification: { max_chars: 400, patterns: [] }, answerText: answer, ...extra });
const scoreIn = (set, index, answer, extra = {}) => scoreAnswer({ question: set.questions[index],
  clarification: set.clarification, answerText: answer, ...extra });

test('Korean matches by containment with no word boundary, and mixed script works', () => {
  const set = validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x',
    must_find: keys(['deadline', '납기'], ['code', 'P00-001'], ['mixed', 'P00-001 킥오프']) }]));
  const row = scoreOne(set.questions[0], '납기일은 P00-001 킥오프 메일에 적힌 대로입니다.');
  assert.deepEqual(row.found.missed_keys, []);
  assert.equal(row.found.share, 1);
  // 납기 inside 납기일 is a hit; a different word is not.
  const miss = scoreOne(set.questions[0], '마감은 P00-002 문서에 있습니다.');
  assert.deepEqual(miss.found.hit_keys, []);
});

test('an ASCII id is matched with boundaries: EX-1 does not match EX-15', () => {
  const set = validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x', must_find: keys(['ex1', 'EX-1']) }]));
  assert.deepEqual(scoreOne(set.questions[0], '열린 것은 EX-15 하나뿐입니다.').found.missed_keys, ['ex1']);
  assert.deepEqual(scoreOne(set.questions[0], '열린 것은 EX-15 와 EX-1 입니다.').found.hit_keys, ['ex1']);
  // A Korean particle straight onto the id is still a mention of it.
  assert.deepEqual(scoreOne(set.questions[0], 'EX-1의 상태는 열림입니다.').found.hit_keys, ['ex1']);
  assert.deepEqual(scoreOne(set.questions[0], '(EX-1) 열림').found.hit_keys, ['ex1']);
});

test('match: "substring" turns the boundary off for an ASCII needle that sits inside a longer token', () => {
  const tokenSet = validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x', must_find: keys(['v', 'rev-3']) }]));
  assert.deepEqual(scoreOne(tokenSet.questions[0], '문서는 rev-3b 입니다.').found.missed_keys, ['v']);
  const subSet = validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x',
    must_find: [{ key: 'v', any_of: ['rev-3'], match: 'substring' }] }]));
  assert.deepEqual(scoreOne(subSet.questions[0], '문서는 rev-3b 입니다.').found.hit_keys, ['v']);
  // A date-shaped needle is the one ASCII token that matches by containment
  // under `auto`, because a date normally sits against other characters.
  const dateSet = validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x', must_find: keys(['d', '2026-02-13']) }]));
  assert.deepEqual(scoreOne(dateSet.questions[0], '마감 2026-02-13T09:00 입니다.').found.hit_keys, ['d']);
});

test('weights decide the share, and an empty group is null rather than a free 100%', () => {
  const set = validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x',
    must_find: [{ key: 'heavy', any_of: ['가'], weight: 3 }, { key: 'light', any_of: ['나'] }] }]));
  assert.equal(scoreOne(set.questions[0], '가').found.share, 0.75);
  assert.equal(scoreOne(set.questions[0], '나').found.share, 0.25);
  assert.equal(scoreOne(set.questions[0], '나').cited.share, null);
  assert.equal(summarize([scoreOne(set.questions[0], '나')]).mean_cited, null);
});

test('must_not hits are counted as errors and never touch the found/cited shares', () => {
  const set = validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x', must_find: keys(['a', '가']),
    must_not: keys(['wrong', 'P00-002'], ['also', '취소']) }]));
  const row = scoreOne(set.questions[0], '가. 다만 P00-002 이야기이고 취소되었습니다.');
  assert.equal(row.found.share, 1);
  assert.equal(row.errors.count, 2);
  assert.deepEqual(row.errors.keys, ['wrong', 'also']);
});

test('a complete answer that ends with a courtesy question is not a clarification; a pure counter-question is', () => {
  const set = validateQuestionSet(questionSet([
    { id: 'q1', prompt: 'x', must_find: keys(['deadline', '2026-02-13'], ['owner', '김예시']) },
    { id: 'q2', prompt: 'y', must_find: keys(['deadline', '2026-02-13']), expect_clarification: true },
  ], { clarification: { max_chars: 200, patterns: ['어느 과제'] } }));
  // The three sentences the fresh review used. The first two answer the
  // question and then ask a courtesy question; only the third asks instead of
  // answering.
  const courteous = scoreIn(set, 0, '납기는 2026-02-13이고 담당은 김예시입니다. 더 필요하신 것 있으실까요?');
  assert.equal(courteous.flags.clarification_instead_of_answer, false);
  assert.equal(courteous.found.share, 1);
  const shortCourteous = scoreIn(set, 0, '2026-02-13까지입니다. 추가로 확인해 드릴까요?');
  assert.equal(shortCourteous.flags.clarification_instead_of_answer, false);
  assert.equal(shortCourteous.found.hit_keys.includes('deadline'), true);
  const counterQuestion = scoreIn(set, 0, '어느 과제를 말씀하시는 건가요?');
  assert.equal(counterQuestion.flags.clarification_instead_of_answer, true);
  assert.deepEqual(counterQuestion.found.hit_keys, []);

  // A short answer that hits nothing, is not a question and matches no
  // pattern is still not flagged.
  assert.equal(scoreIn(set, 0, '해당 기록을 찾지 못했습니다.').flags.clarification_instead_of_answer, false);
  // Long answers are never flagged, even ending in a question mark.
  assert.equal(scoreIn(set, 0, `${'나'.repeat(300)} 그렇지 않을까요?`).flags.clarification_instead_of_answer, false);
  // The pattern branch is length-gated too.
  assert.equal(scoreIn(set, 0, `어느 과제인지 ${'나'.repeat(300)}.`).flags.clarification_instead_of_answer, false);
  // A question that expects one is never flagged.
  assert.equal(scoreIn(set, 1, '어느 과제를 말씀하시는 건가요?').flags.clarification_instead_of_answer, false);
});

test('ASCII token boundaries: the full 16-case table, favourable and unfavourable', () => {
  // [needle, answer text, should match, why]
  const cases = [
    ['EX-1', '열린 것은 EX-15 하나뿐입니다.', false, 'a longer id is a different id'],
    ['EX-1', 'EX-1은 열림입니다.', true, 'a Korean particle is not a token continuation'],
    ['EX-1', 'EX-1(마감) 확인', true, 'punctuation is not a token continuation'],
    ['EX-1', 'EX-1-2 를 보라', false, 'a hyphen followed by a digit continues the id'],
    ['EX-1', 'EX-1.5 참조', false, 'a dot followed by a digit continues the id'],
    ['EX-1', '마지막은 EX-1.', true, 'a sentence-final dot does not continue the id'],
    ['EX-1', 'EX-1_2 참조', false, 'an underscore always continues the id'],
    ['EX-1', '항목 ex-1 확인', true, 'case is folded'],
    ['EX-1', 'ＥＸ－１ 확인', true, 'full width folds to ASCII through NFKC'],
    ['P00-014', 'P00-014A 는 다른 것', false, 'a trailing letter is a different code'],
    ['2026-02-13', '마감 2026-02-13T09:00 입니다.', true, 'a date sits inside an ISO timestamp'],
    ['2026-02-13', '마감 2026-02-13(금) 입니다.', true, 'a date takes a Korean day marker'],
    ['홍길동', '홍길동이 맡습니다.', true, 'Korean takes particles with no boundary'],
    ['홍길동', '홍길동과 상의했습니다.', true, 'the same for a different particle'],
    ['납기', '납기일은 다음 주입니다.', true, 'a Korean noun inside a longer noun'],
    ['P00-001 킥오프', 'P00-001\n킥오프 메일', true, 'a phrase wrapped across a line break'],
  ];
  assert.equal(cases.length, 16);
  for (const [needle, text, expected, why] of cases) {
    const matcher = compileItem(needle, { where: 'case' });
    assert.equal(matcher.test(normalizeText(text)), expected, `${needle} in ${JSON.stringify(text)}: ${why}`);
  }
  // The overrides still work in both directions.
  assert.equal(compileItem('EX-1', { mode: 'substring' }).test(normalizeText('EX-1-2')), true);
  assert.equal(compileItem('2026-02-13', { mode: 'token' }).test(normalizeText('2026-02-13T09:00')), false);
});

test('over_time uses max_minutes and elapsed seconds, and is a flag not a score', () => {
  const set = validateQuestionSet(questionSet([{ id: 'q1', prompt: 'x', must_find: keys(['a', '가']), max_minutes: 2 }]));
  assert.equal(scoreOne(set.questions[0], '가', { elapsedSeconds: 119 }).flags.over_time, false);
  const over = scoreOne(set.questions[0], '가', { elapsedSeconds: 121 });
  assert.equal(over.flags.over_time, true);
  assert.equal(over.found.share, 1);
  // Unknown elapsed is never over time.
  assert.equal(scoreOne(set.questions[0], '가').flags.over_time, false);
});

// --------------------------------------------------------------- answers dir
test('answers-dir mode scores <id>.md files and needs no model at all', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일 메일 참조.');
  writeAnswer(est.answersDir, 'q2', '열린 것은 EX-1 과 EX-15 입니다. 추적기 확인.');
  const { status, receipt } = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, label: 'baseline', now: NOW });
  assert.equal(status, 'OK');
  assert.equal(receipt.mode, 'answers_dir');
  assert.equal(receipt.totals.mean_found, 1);
  assert.equal(receipt.totals.mean_cited, 1);
  assert.equal(receipt.totals.errors_total, 0);
  assert.equal(rowOf(receipt, 'q1').answer_chars > 0, true);
  assert.match(rowOf(receipt, 'q1').answer_sha256, /^sha256:[0-9a-f]{64}$/u);
});

test('answers.json maps ids to files and carries the elapsed seconds a previous run measured', async () => {
  const est = estate();
  const nested = path.join(est.answersDir, 'run-5b');
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, 'first.txt'), '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  writeFileSync(path.join(nested, 'second.txt'), 'EX-1 과 EX-15, 추적기.');
  writeFileSync(path.join(est.answersDir, 'answers.json'), JSON.stringify({
    q1: { path: 'run-5b/first.txt', elapsed_seconds: 200, tool_calls: 4 },
    q2: 'run-5b/second.txt' }));
  const { receipt } = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, label: '5b', now: NOW });
  assert.equal(rowOf(receipt, 'q1').elapsed_seconds, 200);
  assert.equal(rowOf(receipt, 'q1').tool_calls, 4);
  // 200s against max_minutes 2 is over time.
  assert.equal(rowOf(receipt, 'q1').flags.over_time, true);
  assert.equal(receipt.totals.tool_calls_total, 4);
  assert.equal(rowOf(receipt, 'q2').elapsed_seconds, null);
});

test('an answers.json path that leaves the answers directory is refused', async () => {
  const est = estate();
  writeFileSync(path.join(est.answersDir, 'answers.json'), JSON.stringify({ q1: '../outside.md' }));
  await assert.rejects(runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, now: NOW }), error => error.code === 'answer_eval_answer_path_escapes');
});

test('one absent answer scores as all-missed and is flagged; every answer absent is a refusal, not a run of zeroes', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  const { receipt } = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, now: NOW });
  assert.equal(rowOf(receipt, 'q2').flags.answer_absent, true);
  assert.equal(rowOf(receipt, 'q2').outcome, 'absent');
  assert.equal(rowOf(receipt, 'q2').found.share, 0);
  assert.equal(receipt.totals.answers_absent, 1);

  const empty = estate();
  await assert.rejects(runAnswerEval({ questionsFile: empty.questionsFile, answersDir: empty.answersDir,
    receiptsDir: empty.receiptsDir, now: NOW }), error => error.code === 'answer_eval_answers_all_absent');
});

test('an answer larger than the cap is scored on the capped prefix and says so', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  writeAnswer(est.answersDir, 'q2', `EX-1 EX-15 추적기 ${'x'.repeat(MAX_ANSWER_BYTES)}`);
  const { receipt } = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, now: NOW });
  const row = rowOf(receipt, 'q2');
  assert.equal(row.flags.answer_truncated, true);
  assert.equal(row.answer_chars <= MAX_ANSWER_BYTES, true);
  assert.equal(row.found.share, 1);
});

test('--only runs a subset and refuses an id the set does not have', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  const { result } = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--only', 'q1'], { now: NOW });
  assert.equal(result.receipt.results.length, 1);
  assert.deepEqual(result.receipt.selection.only, ['q1']);
  assert.equal(result.receipt.selection.set_questions, 2);
  await assert.rejects(runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--only', 'q9'], { now: NOW }), error => error.code === 'answer_eval_only_unknown');
});

test('--dry validates and prints the plan without writing anything', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13.');
  const { result, lines, exitCode } = await runAnswerEvalCli(['--questions', est.questionsFile,
    '--answers-dir', est.answersDir, '--receipts', est.receiptsDir, '--dry'], { now: NOW });
  assert.equal(result.status, 'DRY');
  assert.equal(exitCode, 0);
  assert.equal(existsSync(est.receiptsDir), false);
  assert.ok(lines.some(line => line.includes('q1') && line.includes('answer present')));
  assert.ok(lines.some(line => line.includes('q2') && line.includes('answer file absent')));
});

// --------------------------------------------------------------- ask command
test('an ask-command template is checked before anything runs', () => {
  const base = { schema: ANSWER_EVAL_ASK_COMMAND_SCHEMA, argv: ['node', '{prompt_file}', '{answer_file}'],
    timeout_seconds: 10, env: [] };
  assert.equal(validateAskCommand(base).timeout_seconds, 10);
  refusal(() => validateAskCommand({ ...base, schema: 'other' }), 'answer_eval_ask_command_schema_unknown');
  refusal(() => validateAskCommand({ ...base, argv: [] }), 'answer_eval_ask_command_argv_empty');
  refusal(() => validateAskCommand({ ...base, argv: ['node', '{prompt_file}'] }), 'answer_eval_ask_command_answer_placeholder_missing');
  refusal(() => validateAskCommand({ ...base, argv: ['node', '{answer_file}'] }), 'answer_eval_ask_command_prompt_placeholder_missing');
  refusal(() => validateAskCommand({ ...base, timeout_seconds: 0 }), 'answer_eval_ask_command_timeout_invalid');
  refusal(() => validateAskCommand({ ...base, timeout_seconds: 99999 }), 'answer_eval_ask_command_timeout_invalid');
  refusal(() => validateAskCommand({ ...base, env: ['not a name'] }), 'answer_eval_ask_command_env_invalid');
  refusal(() => validateAskCommand({ ...base, shell: true }), 'answer_eval_ask_command_field_unknown');
});

test('ask-command mode runs one command per question and scores what it wrote', async () => {
  const est = estate();
  const ask = askCommandFile(est.root, fakeBot(est.root), 'ok');
  const { status, receipt } = await runAnswerEval({ questionsFile: est.questionsFile, askCommandFile: ask,
    receiptsDir: est.receiptsDir, label: 'fake-bot', now: NOW });
  assert.equal(status, 'OK');
  assert.equal(receipt.mode, 'ask_command');
  assert.equal(receipt.totals.mean_found, 1);
  assert.equal(receipt.results.every(row => row.elapsed_seconds > 0), true);
  assert.equal(receipt.ask_command.argv_length, 8);
  assert.match(receipt.ask_command.argv_sha256, /^sha256:[0-9a-f]{64}$/u);
});

test('a non-zero exit, a timeout and a missing answer file are each a named failure and exit 4', async () => {
  for (const [mode, reason, timeout] of [['exit-nonzero', 'ask_command_exit:7', 20],
    ['hang', 'ask_command_timeout', 0.5], ['no-output', 'ask_command_answer_absent', 20]]) {
    const est = estate();
    const ask = askCommandFile(est.root, fakeBot(est.root), mode, timeout);
    const { result, exitCode } = await runAnswerEvalCli(['--questions', est.questionsFile,
      '--ask-command', ask, '--receipts', est.receiptsDir], { now: NOW });
    assert.equal(exitCode, 4, `${mode} should exit 4`);
    assert.equal(result.receipt.status, 'ASK_FAILED');
    assert.equal(rowOf(result.receipt, 'q1').outcome, 'failed');
    assert.equal(rowOf(result.receipt, 'q1').reason, reason, `${mode} reason`);
    assert.equal(rowOf(result.receipt, 'q1').found.share, 0);
  }
});

test('an ask-command answer larger than the cap is capped, not refused', async () => {
  const est = estate();
  const ask = askCommandFile(est.root, fakeBot(est.root), 'huge');
  const { receipt } = await runAnswerEval({ questionsFile: est.questionsFile, askCommandFile: ask,
    receiptsDir: est.receiptsDir, now: NOW });
  const row = rowOf(receipt, 'q2');
  assert.equal(row.flags.answer_truncated, true);
  assert.equal(row.answer_chars <= MAX_ANSWER_BYTES, true);
  assert.deepEqual(row.found.hit_keys, ['ex1']);
});

test('naming both modes, or neither, is a usage refusal', async () => {
  const est = estate();
  await assert.rejects(runAnswerEval({ questionsFile: est.questionsFile, receiptsDir: est.receiptsDir, now: NOW }),
    error => error.code === 'answer_eval_mode_required');
  await assert.rejects(runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    askCommandFile: path.join(est.root, 'ask.json'), receiptsDir: est.receiptsDir, now: NOW }),
    error => error.code === 'answer_eval_mode_required');
  await assert.rejects(runAnswerEvalCli(['--answers-dir', est.answersDir], {}),
    error => error.code === 'answer_eval_questions_required');
  await assert.rejects(runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, label: 'bad/label', now: NOW }), error => error.code === 'answer_eval_label_invalid');
});

// ----------------------------------------------------------------- compare
test('compare reports per-question deltas, newly missed and newly found keys', () => {
  const before = { label: 'a', started_at: NOW, totals: { mean_found: 1, mean_cited: 1, errors_total: 0, minutes_total: 2 },
    results: [{ question_id: 'q1', found: { share: 1, hit_keys: ['deadline', 'owner'], missed_keys: [] },
      cited: { share: 1, hit_keys: ['mail'], missed_keys: [] }, errors: { count: 0, keys: [] } }] };
  const after = { totals: { mean_found: 0.5, mean_cited: 1, errors_total: 1, minutes_total: 3 },
    results: [{ question_id: 'q1', found: { share: 0.5, hit_keys: ['deadline'], missed_keys: ['owner'] },
      cited: { share: 1, hit_keys: ['mail'], missed_keys: [] }, errors: { count: 1, keys: ['wrong'] } }] };
  const comparison = compareRuns(before, after);
  assert.equal(comparison.regressed, true);
  assert.equal(comparison.questions[0].found_delta, -0.5);
  assert.equal(comparison.questions[0].errors_delta, 1);
  assert.deepEqual(comparison.questions[0].newly_missed, ['owner']);
  assert.deepEqual(comparison.questions[0].newly_found, []);
  assert.equal(comparison.totals.errors_delta, 1);

  const back = compareRuns(after, before);
  assert.equal(back.regressed, false);
  assert.deepEqual(back.questions[0].newly_found, ['owner']);
});

test('a question present in only one run is added/removed and is never a regression', () => {
  const one = { totals: {}, results: [{ question_id: 'q1', found: { share: 1, hit_keys: [], missed_keys: [] },
    cited: { share: null, hit_keys: [], missed_keys: [] }, errors: { count: 0, keys: [] } }] };
  const two = { totals: {}, results: [{ question_id: 'q2', found: { share: 0, hit_keys: [], missed_keys: [] },
    cited: { share: null, hit_keys: [], missed_keys: [] }, errors: { count: 0, keys: [] } }] };
  const comparison = compareRuns(one, two);
  assert.equal(comparison.regressed, false);
  assert.deepEqual(comparison.questions.map(row => [row.question_id, row.state]), [['q1', 'removed'], ['q2', 'added']]);
});

test('--compare latest picks the previous receipt, and --fail-on-regression exits 3 only when something dropped', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  writeAnswer(est.answersDir, 'q2', 'EX-1 과 EX-15, 추적기.');
  const first = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--label', 'baseline'], { now: '2026-02-01T00:00:00.000Z' });
  assert.equal(first.exitCode, 0);

  // Same answers again: no regression, even with the gate on.
  const same = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--label', 'same', '--compare', 'latest', '--fail-on-regression'],
  { now: '2026-02-02T00:00:00.000Z' });
  assert.equal(same.exitCode, 0);
  assert.equal(same.comparison.regressed, false);

  // A worse answer: q1 loses its owner key and gains a known-wrong claim.
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13 입니다. 1월 9일. 다만 P00-002 이야기입니다.');
  const worse = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--label', 'worse', '--compare', 'latest', '--fail-on-regression'],
  { now: '2026-02-03T00:00:00.000Z' });
  assert.equal(worse.exitCode, 3);
  assert.equal(worse.comparison.regressed, true);
  assert.ok(worse.lines.some(line => line.includes('newly missed:') && line.includes('q1/owner')));

  // Without the gate the same run still prints the table but exits 0. Compared
  // against an explicit receipt path this time, not `latest` -- `latest` would
  // now be the equally-bad `worse` run, which is not a regression against
  // itself.
  const ungated = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--label', 'ungated', '--compare', same.result.receiptFile],
  { now: '2026-02-04T00:00:00.000Z' });
  assert.equal(ungated.exitCode, 0);
  assert.equal(ungated.comparison.regressed, true);
});

test('an ask-command failure outranks a regression: exit 4, not 3', async () => {
  const est = estate();
  const bot = fakeBot(est.root);
  const ok = await runAnswerEvalCli(['--questions', est.questionsFile, '--ask-command', askCommandFile(est.root, bot, 'ok'),
    '--receipts', est.receiptsDir, '--label', 'good'], { now: '2026-02-01T00:00:00.000Z' });
  assert.equal(ok.exitCode, 0);
  const broken = await runAnswerEvalCli(['--questions', est.questionsFile,
    '--ask-command', askCommandFile(est.root, bot, 'exit-nonzero'), '--receipts', est.receiptsDir,
    '--label', 'broken', '--compare', 'latest', '--fail-on-regression'], { now: '2026-02-02T00:00:00.000Z' });
  assert.equal(broken.comparison.regressed, true);
  assert.equal(broken.exitCode, 4);
});

test('--compare against a file that is not one of these receipts is refused', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  const other = path.join(est.root, 'not-a-receipt.json');
  writeFileSync(other, JSON.stringify({ schema_version: 'soulforge.something_else.v1' }));
  await assert.rejects(runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--compare', other], { now: NOW }),
  error => error.code === 'answer_eval_compare_schema_unknown');
});

// ----------------------------------------------------------------- receipt
test('the receipt carries keys and numbers only: no prompt, no answer, no matched substring, no host path', async () => {
  const PROMPT_NEEDLE = 'ZZQPROMPTNEEDLE';
  const ANSWER_NEEDLE = 'ZZQANSWERNEEDLE';
  const PATTERN_NEEDLE = 'ZZQPATTERNNEEDLE';
  const NOTE_NEEDLE = 'ZZQNOTENEEDLE';
  const est = estate({ set: questionSet([{ id: 'q1', prompt: `무엇인가? ${PROMPT_NEEDLE}`,
    must_find: [{ key: 'thing', any_of: [PATTERN_NEEDLE], note: NOTE_NEEDLE }],
    must_cite: [{ key: 'where', any_of: ['1월 9일'] }] }]) });
  writeAnswer(est.answersDir, 'q1', `${ANSWER_NEEDLE} ${PATTERN_NEEDLE} 1월 9일 입니다.`);
  const { receipt, receiptFile } = await runAnswerEval({ questionsFile: est.questionsFile,
    answersDir: est.answersDir, receiptsDir: est.receiptsDir, label: 'safety', now: NOW });
  assert.equal(receipt.totals.mean_found, 1);
  const serialised = readFileSync(receiptFile, 'utf8');
  for (const needle of [PROMPT_NEEDLE, ANSWER_NEEDLE, PATTERN_NEEDLE, NOTE_NEEDLE, est.answersDir, est.root]) {
    assert.equal(serialised.includes(needle), false, `receipt leaked ${needle.slice(0, 24)}`);
  }
  assert.equal(JSON.stringify(receipt).includes(PATTERN_NEEDLE), false);
  assert.ok(serialised.includes('"thing"'), 'key names are the point of the receipt');
  assert.equal(receipt.schema_version, ANSWER_EVAL_RECEIPT_SCHEMA);
});

test('the ask-command receipt names env variable names and a digest, never the argument vector or a value', async () => {
  const est = estate();
  const bot = fakeBot(est.root);
  const ask = path.join(est.root, 'ask.json');
  writeFileSync(ask, JSON.stringify({ schema: ANSWER_EVAL_ASK_COMMAND_SCHEMA,
    argv: [process.execPath, bot, '--mode', 'ok', '--prompt-file', '{prompt_file}', '--answer-file', '{answer_file}'],
    timeout_seconds: 20, env: ['ANSWER_BOT_PROFILE'] }));
  const { receipt, receiptFile } = await runAnswerEval({ questionsFile: est.questionsFile, askCommandFile: ask,
    receiptsDir: est.receiptsDir, now: NOW });
  assert.deepEqual(receipt.ask_command.env_names, ['ANSWER_BOT_PROFILE']);
  const serialised = readFileSync(receiptFile, 'utf8');
  assert.equal(serialised.includes(bot), false);
  assert.equal(serialised.includes(process.execPath), false);
});

test('the receipt is written through a neighbour and a rename, and two runs in the same second do not collide', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  const one = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, label: 'one', now: NOW });
  const two = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, label: 'two', now: NOW });
  assert.notEqual(one.receiptFile, two.receiptFile);
  const names = readdirSync(est.receiptsDir);
  assert.equal(names.length, 2);
  assert.equal(names.some(name => name.endsWith('.writing')), false);
  assert.equal(JSON.parse(readFileSync(one.receiptFile, 'utf8')).label, 'one');
  assert.equal(latestReceipt(est.receiptsDir).file, path.join(est.receiptsDir, names.sort()[names.length - 1]));
});

test('the example question set this repo ships validates and scores, and its EX-1 key is not satisfied by EX-15', async () => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'harness', 'fixtures', 'answer_eval_questions.example.json');
  const set = validateQuestionSet(JSON.parse(readFileSync(file, 'utf8')));
  assert.equal(set.questions.length, 3);
  const openItems = set.questions.find(question => question.id === 'q3-open-items');
  const onlyFifteen = scoreAnswer({ question: openItems, clarification: set.clarification,
    answerText: '추적기에 EX-15 "치구 도면 검토" 하나만 열려 있습니다.' });
  assert.ok(onlyFifteen.found.missed_keys.includes('item_ex_1'));
  assert.ok(onlyFifteen.found.hit_keys.includes('item_ex_15'));
  assert.ok(onlyFifteen.found.hit_keys.includes('any_tracker_id'));
  assert.equal(onlyFifteen.errors.count, 0);
  const withClosed = scoreAnswer({ question: openItems, clarification: set.clarification,
    answerText: '추적기: EX-1 치구 도면 검토, EX-15, EX-7.' });
  assert.deepEqual(withClosed.errors.keys, ['closed_item']);

  // And the shipped ask-command example is a template this harness accepts.
  const askFile = path.join(path.dirname(file), 'answer_eval_ask_command.example.json');
  assert.equal(validateAskCommand(JSON.parse(readFileSync(askFile, 'utf8'))).argv[0], 'node');
});

test('the printed tables carry the components separately, including answer length', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  writeAnswer(est.answersDir, 'q2', '추적기에 EX-15 하나 있습니다.');
  const { receipt } = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, now: NOW });
  const table = renderTable(receipt).join('\n');
  assert.ok(table.includes('found  cited  errors  minutes  chars'));
  assert.ok(table.includes('missed q2: found/ex1'));
  const comparison = renderComparison(compareRuns(receipt, receipt)).join('\n');
  assert.ok(comparison.includes('newly missed: none'));
  assert.ok(comparison.includes('newly found:  none'));
});

// ------------------------------------------------------------ lane closure
/**
 * Copies exactly what one deployment-pack lane spec says it carries into a
 * scratch tree. `tracked_paths` entries ending in `/` are directory prefixes;
 * `tracked_excludes` are prefixes removed from those.
 */
function buildLaneTree(specRef, destRoot) {
  const spec = JSON.parse(readFileSync(path.join(REPO_ROOT, specRef), 'utf8'));
  const excludes = spec.tracked_excludes ?? [];
  const posixRel = from => path.relative(REPO_ROOT, from).split(path.sep).join('/');
  const excluded = rel => excludes.some(prefix => rel === prefix.replace(/\/$/u, '') || rel.startsWith(prefix));
  for (const tracked of spec.tracked_paths) {
    const source = path.join(REPO_ROOT, tracked);
    if (!existsSync(source)) continue;
    const destination = path.join(destRoot, tracked);
    if (tracked.endsWith('/')) {
      cpSync(source, destination, { recursive: true,
        filter: from => !excluded(posixRel(from) + (statSync(from).isDirectory() ? '/' : '')) });
    } else {
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(source, destination);
    }
  }
  return spec;
}

test('the harness imports inside a tree built from only what each lane spec carries', () => {
  // A cross-module import that every test in the repo can resolve, and a built
  // lane cannot, is invisible until the lane runs. So: build the lane, import
  // the harness there, and let the import resolver be the judge.
  for (const specRef of ['guild_hall/deployment_pack/lanes/context_read_lane.spec.json',
    'guild_hall/deployment_pack/lanes/graph_sync_lane.spec.json']) {
    const root = tmp('ae-lane-');
    const spec = buildLaneTree(specRef, root);
    assert.ok(spec.tracked_paths.includes('guild_hall/context_engine/'), `${specRef} should carry the context engine`);
    const harness = path.join(root, 'guild_hall', 'context_engine', 'harness', 'answer_eval.mjs');
    assert.equal(existsSync(harness), true, `${specRef} did not carry the harness`);
    // Not carried by either lane -- so an import of it must not exist.
    assert.equal(existsSync(path.join(root, 'guild_hall', 'workspace_ledgers')), false,
      `${specRef} unexpectedly carries workspace_ledgers`);
    execFileSync(process.execPath, ['--check', harness], { stdio: 'ignore' });
    const probe = path.join(root, 'lane_probe.mjs');
    writeFileSync(probe, `import { runAnswerEval } from './guild_hall/context_engine/harness/answer_eval.mjs';
import { validateQuestionSet } from './guild_hall/context_engine/src/runtime/answer_eval.mjs';
if (typeof runAnswerEval !== 'function' || typeof validateQuestionSet !== 'function') process.exit(3);
validateQuestionSet(JSON.parse(process.argv[2]));
process.stdout.write('LANE_IMPORT_OK');
`);
    const probeSet = JSON.stringify(questionSet([{ id: 'q1', prompt: 'x',
      must_find: [{ key: 'a', any_of: ['/ex-\\d{1,3}/'] }] }]));
    const out = execFileSync(process.execPath, [probe, probeSet], { cwd: root, encoding: 'utf8' });
    assert.equal(out.trim(), 'LANE_IMPORT_OK', `${specRef} could not import or compile a pattern`);
  }
});

test('the regex safety scan lives inside the context engine and still refuses the same shapes', () => {
  assert.ok(compileSafePattern('ex-\\d{1,4}', 'i') instanceof RegExp);
  for (const [source, code] of [['(a+)+', 'safe_pattern_nested_quantifier'], ['(a)\\1', 'safe_pattern_backreference'],
    ['(?<=a)b', 'safe_pattern_lookbehind'], ['x'.repeat(201), 'safe_pattern_too_long'],
    ['a|b|c|d|e|f|g|h|i|j|k|l|m', 'safe_pattern_too_many_alternations'], ['[', 'safe_pattern_invalid']]) {
    assert.throws(() => compileSafePattern(source, ''), error => error.code === code, `${source} -> ${code}`);
  }
  assert.throws(() => compileSafePattern('a', 'g'), error => error.code === 'safe_pattern_flags_not_allowed');
  // The canary catches a shape no static scan does.
  assert.throws(() => compileSafePattern('^(a|a)+$', ''), error => error.code === 'safe_pattern_timing_unsafe');
});

// -------------------------------------------------- compare: question set
const withKeyDigest = (sha, questionId, digest, found) => ({
  label: 'x', started_at: NOW, questions_sha256: sha,
  totals: { mean_found: found, mean_cited: null, errors_total: 0, minutes_total: 1 },
  results: [{ question_id: questionId, key_digest: digest,
    found: { share: found, hit_keys: found === 1 ? ['k'] : [], missed_keys: found === 1 ? [] : ['k'] },
    cited: { share: null, hit_keys: [], missed_keys: [] }, errors: { count: 0, keys: [] } }] });

test('comparing two runs that scored different question sets is refused, not reported as a regression', () => {
  const before = withKeyDigest('sha256:aaa', 'q1', 'sha256:k1', 1);
  const after = withKeyDigest('sha256:bbb', 'q1', 'sha256:k2', 0);
  refusal(() => compareRuns(before, after), 'answer_eval_compare_question_set_differs');
  // Same set sha: ordinary comparison, and this one really is a regression.
  const same = compareRuns(before, { ...after, questions_sha256: 'sha256:aaa' });
  assert.equal(same.regressed, true);
  assert.equal(same.set_changed, false);
});

test('--allow-set-change compares only byte-identical keys, says so loudly, and can never report a regression', () => {
  const before = withKeyDigest('sha256:aaa', 'q1', 'sha256:k1', 1);
  before.results.push({ question_id: 'q2', key_digest: 'sha256:stable',
    found: { share: 1, hit_keys: ['s'], missed_keys: [] },
    cited: { share: null, hit_keys: [], missed_keys: [] }, errors: { count: 0, keys: [] } });
  const after = withKeyDigest('sha256:bbb', 'q1', 'sha256:k2-rewritten', 0);
  after.results.push({ question_id: 'q2', key_digest: 'sha256:stable',
    found: { share: 0, hit_keys: [], missed_keys: ['s'] },
    cited: { share: null, hit_keys: [], missed_keys: [] }, errors: { count: 0, keys: [] } });
  const comparison = compareRuns(before, after, { allowSetChange: true });
  assert.equal(comparison.set_changed, true);
  assert.equal(comparison.key_changed, 1);
  assert.equal(comparison.regressed, false, 'a partial view never gates');
  const byId = Object.fromEntries(comparison.questions.map(row => [row.question_id, row]));
  assert.equal(byId.q1.state, 'key_changed');
  assert.equal(byId.q1.found_delta, null);
  // q2's keys did not move, so its real drop is still reported as a delta.
  assert.equal(byId.q2.state, 'compared');
  assert.equal(byId.q2.found_delta, -1);
  assert.deepEqual(byId.q2.newly_missed, ['s']);
  assert.equal(comparison.totals.mean_found_delta, null, 'totals are not comparable across sets');
  const rendered = renderComparison(comparison).join('\n');
  assert.ok(rendered.includes('!! QUESTION SET CHANGED'));
  assert.ok(rendered.includes('never report a regression'));
});

test('a receipt written before key_digest existed is never silently compared across a set change', () => {
  const before = withKeyDigest('sha256:aaa', 'q1', 'sha256:k1', 1);
  delete before.results[0].key_digest;
  const after = withKeyDigest('sha256:bbb', 'q1', 'sha256:k1', 0);
  const comparison = compareRuns(before, after, { allowSetChange: true });
  assert.equal(comparison.questions[0].state, 'key_changed');
});

test('end to end: editing a key refuses the comparison until --allow-set-change is given', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  writeAnswer(est.answersDir, 'q2', 'EX-1 과 EX-15, 추적기.');
  const before = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--label', 'before'], { now: '2026-02-01T00:00:00.000Z' });
  // The author adds a spelling to one key. Nothing about the bot changed.
  const edited = simpleSet();
  edited.questions[0].must_find[1].any_of.push('김 예시');
  writeFileSync(est.questionsFile, `${JSON.stringify(edited, null, 2)}\n`);
  await assert.rejects(runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--label', 'after', '--compare', 'latest'], { now: '2026-02-02T00:00:00.000Z' }),
  error => error.code === 'answer_eval_compare_question_set_differs');
  // The refused run still wrote its own receipt -- the run happened, only the
  // comparison was refused -- so `latest` is now that run, scored by the new
  // keys. The next run therefore names the old receipt outright.
  const allowed = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--label', 'after2', '--compare', before.result.receiptFile,
    '--allow-set-change', '--fail-on-regression'], { now: '2026-02-03T00:00:00.000Z' });
  assert.equal(allowed.exitCode, 0);
  assert.equal(allowed.comparison.set_changed, true);
  const byId = Object.fromEntries(allowed.comparison.questions.map(row => [row.question_id, row]));
  assert.equal(byId.q1.state, 'key_changed');
  assert.equal(byId.q2.state, 'compared', 'the untouched question is still comparable');
});

// ------------------------------------------------------ latest: order, status
test('every receipt name carries a suffix, so a same-second collision cannot sort before the first one', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  const one = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, label: 'one', now: NOW });
  const two = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, label: 'two', now: NOW });
  const names = readdirSync(est.receiptsDir).sort();
  assert.deepEqual(names, ['20260201T000000-000.json', '20260201T000000-001.json']);
  assert.equal(names.some(name => name.includes('.writing')), false);
  // Lexicographic name order and real order agree, and `latest` picks the second.
  assert.equal(latestReceipt(est.receiptsDir).file, two.receiptFile);
  assert.equal(latestReceipt(est.receiptsDir, { exclude: two.receiptFile }).file, one.receiptFile);
  assert.equal(JSON.parse(readFileSync(one.receiptFile, 'utf8')).label, 'one');
});

test('latest orders by started_at, not by the filename stamp, when the two disagree', () => {
  const dir = path.join(tmp('ae-order-'), 'receipts');
  const base = { schema_version: ANSWER_EVAL_RECEIPT_SCHEMA, status: 'OK', results: [], totals: {} };
  // Same second in the name, sub-second apart in the receipt, written in the
  // order that makes filename-only sorting get it wrong.
  writeReceipt(dir, { ...base, label: 'later', started_at: '2026-02-01T00:00:00.900Z' });
  writeReceipt(dir, { ...base, label: 'earlier', started_at: '2026-02-01T00:00:00.100Z' });
  assert.equal(latestReceipt(dir).receipt.label, 'later');
});

test('latest skips a receipt that is not OK, and says which it skipped and which it chose', async () => {
  const est = estate();
  const bot = fakeBot(est.root);
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  writeAnswer(est.answersDir, 'q2', 'EX-1 과 EX-15, 추적기.');
  const good = await runAnswerEval({ questionsFile: est.questionsFile, answersDir: est.answersDir,
    receiptsDir: est.receiptsDir, label: 'good', now: '2026-02-01T00:00:00.000Z' });
  // A run where the bot failed everything: a receipt full of zeroes.
  const broken = await runAnswerEval({ questionsFile: est.questionsFile,
    askCommandFile: askCommandFile(est.root, bot, 'exit-nonzero'), receiptsDir: est.receiptsDir,
    label: 'broken', now: '2026-02-02T00:00:00.000Z' });
  assert.equal(broken.receipt.status, 'ASK_FAILED');
  const found = latestReceipt(est.receiptsDir);
  assert.equal(found.file, good.receiptFile, 'an ASK_FAILED run must never become the baseline');
  assert.deepEqual(found.skipped.map(row => row.why), ['status_ask_failed']);

  // And through the CLI, both facts are printed.
  const next = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--label', 'next', '--compare', 'latest', '--fail-on-regression'],
  { now: '2026-02-03T00:00:00.000Z' });
  assert.equal(next.exitCode, 0, 'comparing against the good run is not a regression');
  assert.ok(next.lines.some(line => line.startsWith('compare: skipped') && line.includes('status_ask_failed')));
  assert.ok(next.lines.some(line => line.startsWith('compare: baseline') && line.includes('label good')));
});

test('a directory with nothing usable in it reports that rather than comparing against noise', async () => {
  const est = estate();
  writeAnswer(est.answersDir, 'q1', '납기는 2026-02-13, 담당은 김예시. 1월 9일.');
  mkdirSync(est.receiptsDir, { recursive: true });
  writeFileSync(path.join(est.receiptsDir, '20260101T000000-000.json'), '{ not json');
  const run = await runAnswerEvalCli(['--questions', est.questionsFile, '--answers-dir', est.answersDir,
    '--receipts', est.receiptsDir, '--compare', 'latest'], { now: NOW });
  assert.equal(run.exitCode, 0);
  assert.equal(run.comparison, null);
  assert.ok(run.lines.some(line => line.includes('(unreadable)')));
  assert.ok(run.lines.includes('compare: no usable earlier receipt in this directory'));
});

// ------------------------------------------------------------- child tree
test('a non-zero exit that still wrote an answer keeps the answer and records the exit code', async () => {
  const est = estate();
  const ask = askCommandFile(est.root, fakeBot(est.root), 'exit-with-answer');
  const { result, exitCode } = await runAnswerEvalCli(['--questions', est.questionsFile,
    '--ask-command', ask, '--receipts', est.receiptsDir], { now: NOW });
  const row = rowOf(result.receipt, 'q1');
  assert.equal(row.outcome, 'answered', 'a valid answer is not thrown away over an exit code');
  assert.equal(row.found.share, 1);
  assert.equal(row.exit_code, 9);
  assert.equal(row.flags.ask_command_nonzero_exit, true);
  assert.equal(result.receipt.totals.nonzero_exit, 2);
  assert.equal(exitCode, 0);
  assert.ok(renderTable(result.receipt).join('\n').includes('exit:9'));
});

test('a child killed by something other than this harness is a signal, not a timeout', async () => {
  const est = estate();
  const ask = askCommandFile(est.root, fakeBot(est.root), 'ok', 60);
  const { result, exitCode } = await runAnswerEvalCli(['--questions', est.questionsFile,
    '--ask-command', ask, '--receipts', est.receiptsDir],
  { now: NOW, spawner: stubSpawner({ code: null, signal: 'SIGTERM' }) });
  assert.equal(rowOf(result.receipt, 'q1').reason, 'ask_command_signal');
  assert.equal(rowOf(result.receipt, 'q1').outcome, 'failed');
  assert.equal(exitCode, 4);
});

test('killProcessTree names the mechanism it used and degrades instead of throwing', () => {
  assert.equal(killProcessTree(null), 'no_pid');
  assert.equal(killProcessTree({ pid: 0 }), 'no_pid');
  // A pid far outside any real range: every tree mechanism fails, and the
  // direct kill is the fallback -- reported as `direct`, never thrown.
  let directCalls = 0;
  const stub = { pid: 2 ** 30, kill: () => { directCalls += 1; return true; } };
  assert.equal(killProcessTree(stub, { platform: 'win32', env: { SystemRoot: tmp('ae-nosys-') } }), 'direct');
  assert.equal(killProcessTree(stub, { platform: 'linux', env: {} }), 'direct');
  assert.equal(directCalls, 2);
});

test('a timeout kills the grandchild too, so an orphan cannot hold the one model slot', async () => {
  const est = estate();
  const bot = fakeBot(est.root);
  const grandchild = path.join(est.root, 'grandchild.mjs');
  const marker = path.join(est.root, 'grandchild-ran.txt');
  // Sleeps well past the timeout, then leaves a marker. If the tree kill
  // works, this file never appears.
  //
  // What this proves depends on the host, and that is worth writing down.
  // On POSIX -- where CI runs -- a killed parent leaves its children alone, so
  // the marker is a real control: without the process-group kill it appears.
  // On Windows it is weaker: libuv already places a non-detached child in a
  // job object that closes with it, so the grandchild dies either way
  // (measured on the Windows host this was written on: with no kill at all
  // the marker appears; with a direct-child-only kill it does not). `taskkill
  // /T` still earns its place there for a bot that is a launcher script
  // rather than a Node child -- but this assertion is not what proves that,
  // and the mechanism test above is.
  writeFileSync(grandchild, `import { writeFileSync } from 'node:fs';
setTimeout(() => writeFileSync(process.argv[2], 'orphan survived'), 2500);
`);
  const ask = path.join(est.root, 'ask-tree.json');
  writeFileSync(ask, JSON.stringify({ schema: ANSWER_EVAL_ASK_COMMAND_SCHEMA,
    argv: [process.execPath, bot, '--mode', 'spawn-grandchild', '--grandchild', grandchild, '--marker', marker,
      '--prompt-file', '{prompt_file}', '--answer-file', '{answer_file}'],
    timeout_seconds: 0.5, env: [] }));
  const { result } = await runAnswerEvalCli(['--questions', est.questionsFile, '--ask-command', ask,
    '--receipts', est.receiptsDir, '--only', 'q1'], { now: NOW });
  assert.equal(rowOf(result.receipt, 'q1').reason, 'ask_command_timeout');
  await new Promise(resolve => setTimeout(resolve, 4000));
  assert.equal(existsSync(marker), false, 'the grandchild outlived the tree kill');
});

test('a spawn that cannot start at all is a named failure, not a crash', async () => {
  const est = estate();
  const ask = path.join(est.root, 'ask-missing.json');
  writeFileSync(ask, JSON.stringify({ schema: ANSWER_EVAL_ASK_COMMAND_SCHEMA,
    argv: [path.join(est.root, 'no-such-executable'), '--prompt-file', '{prompt_file}', '--answer-file', '{answer_file}'],
    timeout_seconds: 10, env: [] }));
  const { result, exitCode } = await runAnswerEvalCli(['--questions', est.questionsFile,
    '--ask-command', ask, '--receipts', est.receiptsDir, '--only', 'q1'], { now: NOW });
  assert.equal(rowOf(result.receipt, 'q1').reason, 'ask_command_spawn_failed');
  assert.equal(exitCode, 4);
});
