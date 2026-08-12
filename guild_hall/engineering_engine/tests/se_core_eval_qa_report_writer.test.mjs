import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { afterEach } from 'node:test';

import { captureQaInteraction } from '../evaluation/se_core_eval_qa_capture.mjs';
import {
  SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER,
  renderSeCoreEvalQaHumanReport,
} from '../evaluation/se_core_eval_qa_human_report.mjs';
import {
  SE_CORE_EVAL_QA_REPORT_BASENAME,
  ensureSeCoreEvalQaReportFile,
  refreshSeCoreEvalQaReportFile,
} from '../evaluation/se_core_eval_qa_report_writer.mjs';
import { runCli } from '../tools/se_core_eval_qa_capture.mjs';

const ROOTS = new Set();
const RAW_CANARY = 'RAW_QA_TEXT_CANARY_MUST_NOT_LEAVE_THE_ROOT';

afterEach(() => {
  for (const root of ROOTS) rmSync(root, { recursive: true, force: true });
  ROOTS.clear();
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'se-core-eval-qa-report-writer-'));
  ROOTS.add(root);
  captureQaInteraction({ root_path: root, command: 'initialize' });
  return root;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function reportPath(root) {
  return join(root, SE_CORE_EVAL_QA_REPORT_BASENAME);
}

function recordQuestion(root, interactionId, text, options = {}) {
  return captureQaInteraction({
    root_path: root,
    command: 'record-question',
    interaction_id: interactionId,
    scope: options.scope ?? 'exploratory',
    event_time: options.event_time ?? '2026-08-12T10:00:00Z',
    question_bytes: Buffer.from(text, 'utf8'),
  });
}

function recordAnswer(root, interactionId, text, options = {}) {
  return captureQaInteraction({
    root_path: root,
    command: 'record-answer',
    interaction_id: interactionId,
    provider: options.provider ?? 'notebook',
    attempt_id: options.attempt_id ?? 'attempt-01',
    event_time: options.event_time ?? '2026-08-12T10:01:00Z',
    answer_bytes: Buffer.from(text, 'utf8'),
  });
}

/** Nothing this seam stages may survive a call, whether it passed or refused. */
function assertNoResidue(root) {
  assert.deepEqual(
    readdirSync(root).filter((name) => name.toLowerCase().includes('tmp')
      || name.endsWith('.refresh-tmp')),
    [],
  );
  assert.equal(existsSync(`${reportPath(root)}.refresh-tmp`), false);
}

test('the fixed-basename report is created once and then refreshed in place', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-auto-01', `첫 질문 ${RAW_CANARY}`);

  const created = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(created.result, 'PASS');
  assert.equal(created.operation, 'created');
  assert.equal(created.basename, SE_CORE_EVAL_QA_REPORT_BASENAME);
  assert.deepEqual(created.issues, []);
  const afterCreate = readFileSync(reportPath(root));
  assert.deepEqual(afterCreate, renderSeCoreEvalQaHumanReport({ root_path: root }).markdown_bytes);
  assert.ok(afterCreate.toString('utf8').startsWith(SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER));
  assert.equal(created.sha256, sha256(afterCreate));
  assert.equal(created.byte_length, afterCreate.length);
  assert.equal(created.report.event_count, 1);
  assert.equal(created.report.question_count, 1);
  assert.equal(created.report.answer_count, 0);
  assert.equal(created.report.pending_question_count, 1);
  assert.ok(afterCreate.toString('utf8').includes(`첫 질문 ${RAW_CANARY}`));
  assertNoResidue(root);

  recordAnswer(root, 'se-q-auto-01', '첫 답변');
  const refreshed = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(refreshed.result, 'PASS');
  assert.equal(refreshed.operation, 'refreshed');
  const afterRefresh = readFileSync(reportPath(root));
  assert.deepEqual(afterRefresh, renderSeCoreEvalQaHumanReport({ root_path: root }).markdown_bytes);
  assert.notDeepEqual(afterRefresh, afterCreate);
  assert.equal(refreshed.report.event_count, 2);
  assert.equal(refreshed.report.question_count, 1);
  assert.equal(refreshed.report.answer_count, 1);
  assert.equal(refreshed.report.pending_question_count, 0);
  assert.ok(afterRefresh.toString('utf8').includes('첫 답변'));
  assert.deepEqual(readdirSync(root).filter((name) => name.endsWith('.md')),
    [SE_CORE_EVAL_QA_REPORT_BASENAME]);
  assertNoResidue(root);
});

test('a question with no answer yet is visible in the report as an explicit pending turn', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-pending-auto', '답변을 기다리는 질문');
  const written = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(written.result, 'PASS');
  assert.equal(written.report.pending_question_count, 1);
  const text = readFileSync(reportPath(root), 'utf8');
  assert.match(text, /답변 대기: `se-q-pending-auto` \(질문 순번 1\)/);
  assert.match(text, /대기 상태이며 실패가 아니다/);
  assert.ok(text.includes('답변을 기다리는 질문'));
});

test('an arbitrary or foreign file at the fixed basename is never overwritten', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-foreign', '질문');
  const foreign = Buffer.from('# 사람이 직접 쓴 문서\n\n지워지면 안 된다.\n', 'utf8');
  writeFileSync(reportPath(root), foreign);

  const refused = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(refused.result, 'HOLD');
  assert.equal(refused.operation, 'none');
  assert.deepEqual(refused.issues, ['REPORT_REFRESH_REFUSED']);
  assert.deepEqual(readFileSync(reportPath(root)), foreign);
  assertNoResidue(root);

  // Removing the foreign file is the repair, and the next call creates the report normally.
  rmSync(reportPath(root));
  const repaired = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(repaired.result, 'PASS');
  assert.equal(repaired.operation, 'created');
});

test('a turn the renderer cannot show byte for byte stays readable and never kills the lane', () => {
  const root = makeRoot();
  const unshowable = Buffer.concat([
    Buffer.from(String.fromCharCode(0xFEFF), 'utf8'),
    Buffer.from('첫 줄\r둘째 줄', 'utf8'),
    Buffer.from([0x07, 0xff, 0xfe]),
  ]);
  const questionFile = join(root, 'staging_question.bin');
  writeFileSync(questionFile, unshowable);

  const recorded = runCli([
    'node', 'capture', 'record-question',
    '--root', root,
    '--interaction-id', 'se-q-unshowable',
    '--scope', 'exploratory',
    '--event-time', '2026-08-12T10:00:00Z',
    '--question-file', questionFile,
  ]);
  assert.equal(recorded.exit_code, 0);
  const receipt = JSON.parse(recorded.stdout);
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.report_operation, 'created');
  assert.equal(receipt.report_refresh_pending, false);

  const text = readFileSync(reportPath(root), 'utf8');
  assert.match(text, /\| 원문 표시 방식 \| 이스케이프 표기\(escaped_bytes\) \|/u);
  for (const escape of ['\\u{FEFF}', '\\u{000D}', '\\u{0007}', '\\xFF', '\\xFE']) {
    assert.ok(text.includes(escape), escape);
  }
  assert.doesNotMatch(text, /[\0-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/u);

  // The whole point: a later clean turn is not blocked forever by the first one.
  const answerFile = join(root, 'staging_answer.bin');
  writeFileSync(answerFile, Buffer.from('깨끗한 답변', 'utf8'));
  const answered = runCli([
    'node', 'capture', 'record-answer',
    '--root', root,
    '--interaction-id', 'se-q-unshowable',
    '--provider', 'engine',
    '--attempt-id', 'attempt-01',
    '--event-time', '2026-08-12T10:01:00Z',
    '--answer-file', answerFile,
  ]);
  assert.equal(answered.exit_code, 0);
  assert.equal(JSON.parse(answered.stdout).report_operation, 'refreshed');
  assert.ok(readFileSync(reportPath(root), 'utf8').includes('깨끗한 답변'));
  assertNoResidue(root);
});

test('a foreign staging sibling this call did not create is refused, never deleted', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-staging', '질문');
  assert.equal(ensureSeCoreEvalQaReportFile({ root_path: root }).operation, 'created');
  const generated = readFileSync(reportPath(root));

  const staging = `${reportPath(root)}.refresh-tmp`;
  const foreignStaging = Buffer.from('# 다른 도구가 쓰고 있는 파일\n', 'utf8');
  writeFileSync(staging, foreignStaging);

  recordAnswer(root, 'se-q-staging', '답변');
  const refused = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(refused.result, 'HOLD');
  assert.equal(refused.operation, 'none');
  assert.deepEqual(refused.issues, ['REPORT_REFRESH_REFUSED']);
  assert.equal(existsSync(staging), true);
  assert.deepEqual(readFileSync(staging), foreignStaging);
  assert.deepEqual(readFileSync(reportPath(root)), generated);

  // Removing the foreign file is the repair, and the next call refreshes normally.
  rmSync(staging);
  const repaired = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(repaired.result, 'PASS');
  assert.equal(repaired.operation, 'refreshed');
  assert.equal(repaired.report.answer_count, 1);
  assertNoResidue(root);
});

test('a hand-edited report that keeps the generated head is refused, not overwritten', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-edited', '원래 질문');
  assert.equal(ensureSeCoreEvalQaReportFile({ root_path: root }).operation, 'created');
  const generated = readFileSync(reportPath(root), 'utf8');
  assert.ok(generated.startsWith(SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER));

  // Only the body changes; every byte a marker check could look at is preserved.
  const edited = Buffer.from(`${generated}사람이 덧붙인 줄.\n`, 'utf8');
  writeFileSync(reportPath(root), edited);
  assert.ok(edited.toString('utf8').startsWith(SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER));

  recordAnswer(root, 'se-q-edited', '답변');
  const refused = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(refused.result, 'HOLD');
  assert.equal(refused.operation, 'none');
  assert.deepEqual(refused.issues, ['REPORT_REFRESH_REFUSED']);
  assert.deepEqual(readFileSync(reportPath(root)), edited);

  // The explicit path refuses it too, even handed the exact digest of the edited bytes.
  const explicit = refreshSeCoreEvalQaReportFile({
    root_path: root,
    output_path: reportPath(root),
    expected_sha256: sha256(edited),
  });
  assert.equal(explicit.result, 'HOLD');
  assert.deepEqual(explicit.issues, ['REPORT_REFRESH_REFUSED']);
  assert.deepEqual(readFileSync(reportPath(root)), edited);
  assertNoResidue(root);

  // Removing the hand-edited file is the repair, and a positive refresh still works after it.
  rmSync(reportPath(root));
  assert.equal(ensureSeCoreEvalQaReportFile({ root_path: root }).operation, 'created');
  recordAnswer(root, 'se-q-edited', '두 번째 답변', { provider: 'engine' });
  const positive = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(positive.result, 'PASS');
  assert.equal(positive.operation, 'refreshed');
  assert.equal(positive.report.answer_count, 2);
  assert.deepEqual(readFileSync(reportPath(root)),
    renderSeCoreEvalQaHumanReport({ root_path: root }).markdown_bytes);
  assertNoResidue(root);
});

test('a report in the older marker-only format holds for explicit repair, never a silent rewrite', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-legacy', '질문');
  const legacy = Buffer.from([
    '# SE Core 질의응답 상호작용 기록 (파생 보기)',
    '',
    '> 생성기: soulforge.engineering_engine.se_core_eval_qa_human_report.v1',
    '> - 이전 형식으로 만들어진 파생 보기.',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(reportPath(root), legacy);

  const refused = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(refused.result, 'HOLD');
  assert.deepEqual(refused.issues, ['REPORT_REFRESH_REFUSED']);
  assert.deepEqual(readFileSync(reportPath(root)), legacy);
  assertNoResidue(root);

  rmSync(reportPath(root));
  const repaired = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(repaired.result, 'PASS');
  assert.equal(repaired.operation, 'created');
});

test('a stale observed hash refuses the refresh and leaves the report byte-identical', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-drift', '질문');
  assert.equal(ensureSeCoreEvalQaReportFile({ root_path: root }).operation, 'created');
  const generated = readFileSync(reportPath(root));

  recordAnswer(root, 'se-q-drift', '답변');
  const drifted = refreshSeCoreEvalQaReportFile({
    root_path: root,
    output_path: reportPath(root),
    expected_sha256: '0'.repeat(64),
  });
  assert.equal(drifted.result, 'HOLD');
  assert.deepEqual(drifted.issues, ['REPORT_REFRESH_REFUSED']);
  assert.deepEqual(readFileSync(reportPath(root)), generated);
  assertNoResidue(root);

  const observed = refreshSeCoreEvalQaReportFile({
    root_path: root,
    output_path: reportPath(root),
    expected_sha256: sha256(generated),
  });
  assert.equal(observed.result, 'PASS');
  assert.equal(observed.operation, 'refreshed');
  assert.equal(observed.report.answer_count, 1);
  assertNoResidue(root);
});

test('a symlink, junction, or hard link at the report path is refused where the OS allows one', (t) => {
  const outside = mkdtempSync(join(tmpdir(), 'se-core-eval-qa-report-outside-'));
  ROOTS.add(outside);

  const symlinkRoot = makeRoot();
  recordQuestion(symlinkRoot, 'se-q-symlink', '질문');
  assert.equal(ensureSeCoreEvalQaReportFile({ root_path: symlinkRoot }).operation, 'created');
  const decoy = join(outside, 'decoy_report.md');
  writeFileSync(decoy, readFileSync(reportPath(symlinkRoot)));
  let symlinked = true;
  try {
    rmSync(reportPath(symlinkRoot));
    symlinkSync(decoy, reportPath(symlinkRoot), 'file');
  } catch {
    symlinked = false;
  }
  if (symlinked) {
    const decoyBefore = readFileSync(decoy);
    recordAnswer(symlinkRoot, 'se-q-symlink', '답변');
    const refused = ensureSeCoreEvalQaReportFile({ root_path: symlinkRoot });
    assert.equal(refused.result, 'HOLD');
    assert.deepEqual(refused.issues, ['REPORT_REFRESH_REFUSED']);
    assert.deepEqual(readFileSync(decoy), decoyBefore);
  } else {
    t.diagnostic('UNKNOWN: this environment cannot create a file symlink, alias case unverified');
  }

  const linkRoot = makeRoot();
  recordQuestion(linkRoot, 'se-q-hardlink', '질문');
  assert.equal(ensureSeCoreEvalQaReportFile({ root_path: linkRoot }).operation, 'created');
  // A hard link to a byte-identical twin carries this renderer's marker and hashes correctly,
  // so only the link count can refuse it.
  const twin = join(outside, 'hardlink_twin.md');
  writeFileSync(twin, readFileSync(reportPath(linkRoot)));
  let linked = true;
  try {
    rmSync(reportPath(linkRoot));
    linkSync(twin, reportPath(linkRoot));
  } catch {
    linked = false;
  }
  if (linked && lstatSync(reportPath(linkRoot)).nlink >= 2) {
    const twinBefore = readFileSync(twin);
    recordAnswer(linkRoot, 'se-q-hardlink', '답변');
    const refused = ensureSeCoreEvalQaReportFile({ root_path: linkRoot });
    assert.equal(refused.result, 'HOLD');
    assert.deepEqual(refused.issues, ['REPORT_REFRESH_REFUSED']);
    assert.deepEqual(readFileSync(twin), twinBefore);
  } else {
    t.diagnostic('UNKNOWN: no observable hard link could be created here, alias case unverified');
  }
});

test('the writer refuses an unusable root or request without echoing raw captured text', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-refused', `질문 ${RAW_CANARY}`);
  for (const request of [
    { root_path: join(root, 'missing') },
    { root_path: 'relative/root' },
    { root_path: root, extra_field: true },
    {},
  ]) {
    const written = ensureSeCoreEvalQaReportFile(request);
    assert.equal(written.result, 'HOLD');
    assert.equal(written.operation, 'none');
    assert.equal(written.issues.length, 1);
    assert.match(written.issues[0], /^[A-Z_]+$/);
    assert.equal(JSON.stringify(written).includes(RAW_CANARY), false);
  }
  const passed = ensureSeCoreEvalQaReportFile({ root_path: root });
  assert.equal(passed.result, 'PASS');
  assert.equal(JSON.stringify(passed).includes(RAW_CANARY), false);
});

test('a recorded raw artifact can never claim the derived report basename', () => {
  const root = makeRoot();
  const imported = captureQaInteraction({
    root_path: root,
    command: 'import-existing',
    interaction_id: 'historical-001',
    scope: 'fixed_benchmark',
    question_event_time: '2026-08-12T10:00:00Z',
    question_ref: SE_CORE_EVAL_QA_REPORT_BASENAME,
    provider: 'notebook',
    attempt_id: 'attempt-01',
    answer_event_time: '2026-08-12T10:01:00Z',
    answer_ref: 'history/answers/answer-001.md',
  });
  assert.equal(imported.result, 'HOLD');
  assert.deepEqual(imported.issues, ['ARTIFACT_REF_REFUSED']);
});

test('the manual capture CLI refreshes the same report on every recorded turn', () => {
  const root = makeRoot();
  const questionFile = join(root, 'staging_question.bin');
  const answerFile = join(root, 'staging_answer.bin');
  writeFileSync(questionFile, Buffer.from(`수동 질문 ${RAW_CANARY}`, 'utf8'));
  writeFileSync(answerFile, Buffer.from('수동 답변', 'utf8'));

  const recorded = runCli([
    'node', 'capture', 'record-question',
    '--root', root,
    '--interaction-id', 'se-q-manual',
    '--scope', 'exploratory',
    '--event-time', '2026-08-12T10:00:00Z',
    '--question-file', questionFile,
  ]);
  assert.equal(recorded.exit_code, 0);
  const recordedReceipt = JSON.parse(recorded.stdout);
  assert.equal(recordedReceipt.result, 'PASS');
  assert.equal(recordedReceipt.report_operation, 'created');
  assert.equal(recordedReceipt.report_refresh_pending, false);
  assert.equal(recorded.stdout.toString('utf8').includes(RAW_CANARY), false);
  assert.ok(readFileSync(reportPath(root), 'utf8').includes(`수동 질문 ${RAW_CANARY}`));

  const answered = runCli([
    'node', 'capture', 'record-answer',
    '--root', root,
    '--interaction-id', 'se-q-manual',
    '--provider', 'engine',
    '--attempt-id', 'attempt-01',
    '--event-time', '2026-08-12T10:01:00Z',
    '--answer-file', answerFile,
  ]);
  assert.equal(answered.exit_code, 0);
  const answeredReceipt = JSON.parse(answered.stdout);
  assert.equal(answeredReceipt.report_operation, 'refreshed');
  assert.equal(answeredReceipt.event_count, 2);
  assert.deepEqual(
    readFileSync(reportPath(root)),
    renderSeCoreEvalQaHumanReport({ root_path: root }).markdown_bytes,
  );
  assertNoResidue(root);
});

test('a refused report refresh reports the manual capture that did land, and never invents one', () => {
  const root = makeRoot();
  const questionFile = join(root, 'staging_question.bin');
  writeFileSync(questionFile, Buffer.from('수동 질문', 'utf8'));
  const foreign = Buffer.from('# 사람이 직접 쓴 문서\n', 'utf8');
  writeFileSync(reportPath(root), foreign);

  const recorded = runCli([
    'node', 'capture', 'record-question',
    '--root', root,
    '--interaction-id', 'se-q-manual-hold',
    '--scope', 'exploratory',
    '--event-time', '2026-08-12T10:00:00Z',
    '--question-file', questionFile,
  ]);
  assert.equal(recorded.exit_code, 2);
  const receipt = JSON.parse(recorded.stdout);
  assert.equal(receipt.result, 'HOLD');
  assert.equal(receipt.report_refresh_pending, true);
  assert.equal(receipt.report_operation, 'none');
  assert.deepEqual(receipt.issues, ['REPORT_REFRESH_REFUSED']);
  // The turn itself is real and stays reported: the derived view is what is pending.
  assert.equal(receipt.event_count, 1);
  assert.equal(receipt.appended_event_count, 1);
  assert.deepEqual(readFileSync(reportPath(root)), foreign);
  assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).event_count, 1);
  assertNoResidue(root);

  // A read-only command is not part of the automatic lane and stays byte-for-byte as before.
  const queried = runCli(['node', 'capture', 'query', '--root', root]);
  assert.equal(queried.exit_code, 0);
  const queryReceipt = JSON.parse(queried.stdout);
  assert.equal(Object.hasOwn(queryReceipt, 'report_operation'), false);
  assert.deepEqual(readFileSync(reportPath(root)), foreign);
});
