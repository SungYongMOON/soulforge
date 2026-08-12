import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
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
  verifySeCoreEvalQaHumanReportBytes,
} from '../evaluation/se_core_eval_qa_human_report.mjs';
import { runCli } from '../tools/se_core_eval_qa_human_report.mjs';

const ROOTS = new Set();

afterEach(() => {
  for (const root of ROOTS) rmSync(root, { recursive: true, force: true });
  ROOTS.clear();
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'se-core-eval-qa-human-report-'));
  ROOTS.add(root);
  captureQaInteraction({ root_path: root, command: 'initialize' });
  return root;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function recordQuestion(root, interactionId, text, options = {}) {
  return captureQaInteraction({
    root_path: root,
    command: 'record-question',
    interaction_id: interactionId,
    scope: options.scope ?? 'exploratory',
    event_time: options.event_time ?? '2026-08-12T10:00:00Z',
    question_bytes: Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8'),
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
    answer_bytes: Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8'),
  });
}

function render(root) {
  return renderSeCoreEvalQaHumanReport({ root_path: root });
}

function markdown(rendered) {
  return rendered.markdown_bytes.toString('utf8');
}

/** Every fenced region of the document, so a test can prove content stayed inside one. */
function fencedRegions(text) {
  const regions = [];
  const lines = text.split('\n');
  let fence = null;
  let buffer = [];
  for (const line of lines) {
    if (fence === null) {
      const opening = /^(`{3,})text$/.exec(line);
      if (opening) {
        fence = opening[1];
        buffer = [];
      }
      continue;
    }
    if (line === fence) {
      regions.push(buffer.join('\n'));
      fence = null;
      continue;
    }
    buffer.push(line);
  }
  assert.equal(fence, null, 'every opened fence must close');
  return regions;
}

function outsideFences(text) {
  const lines = text.split('\n');
  const kept = [];
  let fence = null;
  for (const line of lines) {
    if (fence === null) {
      const opening = /^(`{3,})text$/.exec(line);
      if (opening) {
        fence = opening[1];
        continue;
      }
      kept.push(line);
      continue;
    }
    if (line === fence) fence = null;
  }
  return kept.join('\n');
}

function interactionSection(text) {
  const parts = text.split('## 상호작용 기록\n');
  assert.equal(parts.length, 2);
  return parts[1];
}

test('every captured question and answer is readable in chronological order with Korean labels', () => {
  const root = makeRoot();
  const question = '이 슬라이스의 관측 경계는 무엇인가?\n\t들여쓴 줄도 그대로 남아야 한다.';
  const answer = '관측만 하고 채점하지 않는다.\n두 번째 줄.';
  recordQuestion(root, 'se-q-kr-01', question);
  recordAnswer(root, 'se-q-kr-01', answer, { provider: 'notebook', attempt_id: 'attempt-01' });

  const rendered = render(root);
  assert.equal(rendered.result, 'PASS');
  assert.deepEqual(rendered.report.issues, []);
  const text = markdown(rendered);

  assert.ok(text.startsWith(SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER));
  assert.match(text, /## 기록 요약/);
  assert.match(text, /## 상호작용 기록/);
  assert.match(text, /### 1\. 질문/);
  assert.match(text, /### 2\. 답변/);
  assert.ok(text.indexOf('### 1. 질문') < text.indexOf('### 2. 답변'));
  assert.match(text, /#### 질문 원문/);
  assert.match(text, /#### 답변 원문/);
  assert.match(text, /\| 기록 시각\(UTC\) \| 2026-08-12T10:00:00Z \|/);
  assert.match(text, /\| 시도 ID \| attempt-01 \|/);
  assert.ok(text.includes(`| 원문 바이트 | ${Buffer.byteLength(question, 'utf8')} |`));
  assert.ok(text.includes(`| 원문 바이트 | ${Buffer.byteLength(answer, 'utf8')} |`));
  assert.ok(text.includes(`| 원문 SHA-256 | \`${sha256(Buffer.from(answer, 'utf8'))}\` |`));

  const regions = fencedRegions(text);
  assert.deepEqual(regions, [question, answer]);
  assert.equal(rendered.report.event_count, 2);
  assert.equal(rendered.report.question_count, 1);
  assert.equal(rendered.report.answer_count, 1);
  assert.equal(rendered.report.review_count, 0);
  assert.equal(rendered.report.pending_question_count, 0);
  assert.equal(rendered.report.markdown_byte_length, rendered.markdown_bytes.length);
  assert.equal(rendered.report.markdown_sha256, sha256(rendered.markdown_bytes));
});

test('the banner states the derived, contestant, frozen-benchmark, and unscored boundaries', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-banner', '질문');
  const text = markdown(render(root));
  const banner = text.slice(0, text.indexOf('## 기록 요약'));
  assert.match(banner, /파생 보기/);
  assert.match(banner, /권위가 아니다/);
  assert.match(banner, /Notebook/);
  assert.match(banner, /Engine/);
  assert.match(banner, /정답지가 아니다/);
  assert.match(banner, /70/);
  assert.match(banner, /115/);
  assert.match(banner, /수정하지 않는다/);
  assert.match(banner, /채점하지 않는다/);
});

test('identical ledger and raw bytes render identical bytes, and an append never rewrites prior blocks', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-stable', '고정 질문');
  recordAnswer(root, 'se-q-stable', '고정 답변', { provider: 'notebook' });

  const first = render(root);
  const second = render(root);
  assert.deepEqual(first.markdown_bytes, second.markdown_bytes);
  assert.equal(first.report.markdown_sha256, second.report.markdown_sha256);

  const priorSection = interactionSection(markdown(first));
  assert.equal(recordAnswer(root, 'se-q-stable', '두 번째 참가자 답변', {
    provider: 'engine',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T10:02:00Z',
  }).result, 'PASS');

  const third = render(root);
  const grownText = markdown(third);
  assert.ok(interactionSection(grownText).startsWith(priorSection));
  assert.notEqual(third.report.markdown_sha256, first.report.markdown_sha256);
  assert.equal(third.report.answer_count, 2);
  assert.match(grownText, /### 3\. 답변/);
});

test('a question with no answer yet renders explicitly as waiting rather than as a failure', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-pending', '아직 답이 없는 질문');
  const rendered = render(root);
  assert.equal(rendered.result, 'PASS');
  assert.equal(rendered.report.pending_question_count, 1);
  assert.deepEqual(rendered.report.issues, []);
  const text = markdown(rendered);
  assert.match(text, /답변 대기: `se-q-pending` \(질문 순번 1\)/);
  assert.match(text, /대기 상태이며 실패가 아니다/);
  assert.doesNotMatch(text, /HOLD/);
  assert.doesNotMatch(text, /오류/);
});

test('backtick-heavy and HTML-shaped raw text cannot break out of its fence', () => {
  const root = makeRoot();
  const hostile = [
    '```',
    '````text',
    '## 위조된 제목',
    '| 위조 | 표 |',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '`````',
  ].join('\n');
  recordQuestion(root, 'se-q-fence', hostile);
  const text = markdown(render(root));

  assert.deepEqual(fencedRegions(text), [hostile]);
  const outside = outsideFences(text);
  assert.equal(outside.includes('<script>'), false);
  assert.equal(outside.includes('위조된 제목'), false);
  assert.equal(outside.includes('| 위조 | 표 |'), false);
  assert.doesNotMatch(outside, /^#+ 위조/m);
});

test('CRLF raw bytes are preserved and unshowable bytes render in one explicit escaped notation', () => {
  const crlfRoot = makeRoot();
  const crlf = '첫 줄\r\n둘째 줄\r\n';
  recordQuestion(crlfRoot, 'se-q-crlf', crlf);
  const crlfRendered = render(crlfRoot);
  assert.equal(crlfRendered.result, 'PASS');
  assert.ok(markdown(crlfRendered).includes(crlf));
  assert.equal(crlfRendered.report.escaped_body_count, 0);
  assert.match(markdown(crlfRendered), /\| 원문 표시 방식 \| 바이트 그대로\(exact_text\) \|/u);

  // The capture contract accepts any non-empty bytes, so the projection has to be total for all of
  // them: one unshowable turn must not be able to poison the whole lane.
  for (const [label, payload, expected] of [
    ['lone-cr', Buffer.from('첫 줄\r둘째 줄', 'utf8'), '첫 줄\\u{000D}둘째 줄'],
    ['bom', Buffer.from(String.fromCharCode(0xFEFF) + '본문', 'utf8'), '\\u{FEFF}본문'],
    ['replacement', Buffer.from('본문' + String.fromCharCode(0xFFFD), 'utf8'), '본문\\u{FFFD}'],
    ['control', Buffer.from('본문' + String.fromCharCode(0x07), 'utf8'), '본문\\u{0007}'],
    ['invalid-utf8', Buffer.from([0xed, 0x95, 0x9c, 0xff, 0xfe]), '한\\xFF\\xFE'],
    ['truncated-utf8', Buffer.from([0xed, 0x95]), '\\xED\\x95'],
    ['backslash-and-nul',
      Buffer.concat([Buffer.from('역슬래시\\뒤', 'utf8'), Buffer.from([0x00])]),
      '역슬래시\\\\뒤\\u{0000}'],
  ]) {
    const root = makeRoot();
    assert.equal(recordQuestion(root, 'se-q-raw-shape', payload).result, 'PASS', label);
    const rendered = render(root);
    assert.equal(rendered.result, 'PASS', label);
    assert.deepEqual(rendered.report.issues, [], label);
    assert.equal(rendered.report.escaped_body_count, 1, label);
    const text = markdown(rendered);
    assert.deepEqual(fencedRegions(text), [expected], label);
    assert.match(text, /\| 원문 표시 방식 \| 이스케이프 표기\(escaped_bytes\) \|/u, label);
    // Nothing unshowable survives into the projection itself.
    assert.doesNotMatch(text, /[\0-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/u, label);
    assert.equal(text.includes(String.fromCharCode(0xFFFD)), false, label);
    assert.doesNotMatch(text, /\r(?!\n)/u, label);
    assert.deepEqual(render(root).markdown_bytes, rendered.markdown_bytes, label);
  }
});

test('the generated report proves its own bytes and a hand-edited body no longer verifies', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-commitment', '질문 본문');
  const rendered = render(root);
  assert.equal(verifySeCoreEvalQaHumanReportBytes(rendered.markdown_bytes), true);
  assert.match(markdown(rendered), /^> 본문 커밋먼트\(SHA-256\): [0-9a-f]{64}$/mu);

  // The head, including everything a marker check could look at, is preserved byte for byte.
  const edited = Buffer.from(`${markdown(rendered)}사람이 덧붙인 줄.\n`, 'utf8');
  assert.ok(edited.toString('utf8').startsWith(SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER));
  assert.equal(verifySeCoreEvalQaHumanReportBytes(edited), false);
  assert.equal(verifySeCoreEvalQaHumanReportBytes(Buffer.from('# 다른 문서\n', 'utf8')), false);
  assert.equal(verifySeCoreEvalQaHumanReportBytes(Buffer.alloc(0)), false);
});

test('a tampered ledger row holds and never echoes raw captured text', () => {
  const root = makeRoot();
  const canary = 'RAW_QA_CANARY_MUST_NOT_APPEAR';
  recordQuestion(root, 'se-q-tampered', canary);
  const ledgerPath = join(root, 'qa_interaction_ledger.jsonl');
  const event = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  event.unexpected_key = canary;
  writeFileSync(ledgerPath, `${JSON.stringify(event)}\n`);

  const rendered = render(root);
  assert.equal(rendered.result, 'HOLD');
  assert.equal(rendered.markdown_bytes.length, 0);
  assert.equal(JSON.stringify(rendered.report).includes(canary), false);
  assert.equal(rendered.report.issues.length, 1);
});

test('a mutated or escaping raw artifact holds instead of rendering unbound text', (t) => {
  const mutatedRoot = makeRoot();
  recordQuestion(mutatedRoot, 'se-q-mutated', '원래 바이트');
  writeFileSync(
    join(mutatedRoot, 'raw', 'questions', 'se-q-mutated.md'),
    Buffer.from('바뀐 바이트', 'utf8'),
  );
  const mutated = render(mutatedRoot);
  assert.equal(mutated.result, 'HOLD');
  assert.equal(mutated.markdown_bytes.length, 0);

  const escapeRoot = makeRoot();
  const bytes = Buffer.from('경계를 벗어난 원문', 'utf8');
  recordQuestion(escapeRoot, 'se-q-escape', bytes);
  const outside = mkdtempSync(join(tmpdir(), 'se-core-eval-qa-outside-'));
  ROOTS.add(outside);
  const decoy = join(outside, 'decoy.md');
  writeFileSync(decoy, bytes);
  const target = join(escapeRoot, 'raw', 'questions', 'se-q-escape.md');
  let linked = false;
  try {
    rmSync(target);
    symlinkSync(decoy, target, 'file');
    linked = true;
  } catch {
    writeFileSync(target, bytes);
  }
  const junctionRoot = makeRoot();
  recordQuestion(junctionRoot, 'se-q-junction', bytes);
  const junctionOutside = mkdtempSync(join(tmpdir(), 'se-core-eval-qa-junction-'));
  ROOTS.add(junctionOutside);
  // Byte-identical decoys, so only containment can refuse this.
  writeFileSync(join(junctionOutside, 'se-q-junction.md'), bytes);
  const questionLane = join(junctionRoot, 'raw', 'questions');
  let junctioned = false;
  try {
    rmSync(questionLane, { recursive: true });
    symlinkSync(junctionOutside, questionLane, 'junction');
    junctioned = true;
  } catch { /* probed below as an unavailable environment capability */ }
  if (junctioned) {
    const escaped = render(junctionRoot);
    assert.equal(escaped.result, 'HOLD');
    assert.deepEqual(escaped.report.issues, ['ARTIFACT_REF_REFUSED']);
    assert.equal(escaped.markdown_bytes.length, 0);
  } else {
    t.diagnostic('junction escape probe skipped: this environment cannot create a junction');
  }

  if (linked) {
    const escaped = render(escapeRoot);
    assert.equal(escaped.result, 'HOLD');
    assert.equal(escaped.markdown_bytes.length, 0);
    assert.equal(markdown(escaped).includes('경계를 벗어난 원문'), false);
  } else {
    t.diagnostic('symlink escape probe skipped: this environment cannot create a file symlink');
  }
});

test('an unusable root or uninitialized ledger holds with a closed issue code', () => {
  const root = makeRoot();
  for (const request of [
    { root_path: join(root, 'missing') },
    { root_path: 'relative/root' },
    { root_path: root, extra_field: true },
    {},
  ]) {
    const rendered = renderSeCoreEvalQaHumanReport(request);
    assert.equal(rendered.result, 'HOLD');
    assert.equal(rendered.markdown_bytes.length, 0);
    assert.equal(rendered.report.issues.length, 1);
    assert.match(rendered.report.issues[0], /^[A-Z_]+$/);
  }

  const bare = mkdtempSync(join(tmpdir(), 'se-core-eval-qa-bare-'));
  ROOTS.add(bare);
  const uninitialized = renderSeCoreEvalQaHumanReport({ root_path: bare });
  assert.equal(uninitialized.result, 'HOLD');
  assert.deepEqual(uninitialized.report.issues, ['LEDGER_NOT_INITIALIZED']);
});

test('recorded review turns render as status metadata only, never as a review verdict', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-review', '질문');
  recordAnswer(root, 'se-q-review', '답변', { provider: 'engine', attempt_id: 'attempt-01' });
  const reviewRef = 'reviews/status/se-q-review.json';
  const reviewTarget = join(root, 'reviews', 'status', 'se-q-review.json');
  mkdirSync(join(root, 'reviews', 'status'), { recursive: true });
  writeFileSync(reviewTarget, Buffer.from(JSON.stringify({
    schema_version: 'soulforge.engineering_engine.se_core_eval_qa_status_review.v1',
    review_state: 'closed',
    interaction_id: 'se-q-review',
    provider: 'engine',
    attempt_id: 'attempt-01',
    verdict: 'fail',
    issue_codes: ['ORACLE_CANARY_CODE'],
  }), 'utf8'));
  assert.equal(captureQaInteraction({
    root_path: root,
    command: 'record-review',
    interaction_id: 'se-q-review',
    provider: 'engine',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T10:03:00Z',
    review_ref: reviewRef,
  }).result, 'PASS');

  const rendered = render(root);
  assert.equal(rendered.result, 'PASS');
  assert.equal(rendered.report.review_count, 1);
  const text = markdown(rendered);
  assert.match(text, /### 3\. 검토 상태 기록/);
  assert.equal(text.includes('ORACLE_CANARY_CODE'), false);
  assert.equal(text.includes('"verdict"'), false);
  assert.doesNotMatch(text, /\| 판정 \|/);
  assert.deepEqual(fencedRegions(text), ['질문', '답변']);
});

test('the CLI renders to stdout by default and writes nothing', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-cli', '질문 본문');
  recordAnswer(root, 'se-q-cli', '답변 본문');
  const before = readdirSync(root).sort();

  const result = runCli(['node', 'qa-human-report', '--root', root]);
  assert.equal(result.exit_code, 0);
  assert.deepEqual(result.stdout, render(root).markdown_bytes);
  assert.deepEqual(readdirSync(root).sort(), before);

  const refused = runCli(['node', 'qa-human-report', '--root', root, '--unknown', 'x']);
  assert.equal(refused.exit_code, 2);
  assert.match(JSON.parse(refused.stdout).issues[0], /^CLI_[A-Z_]+$/);
});

test('the CLI --out option is create-only and refuses an occupied path', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-out', '질문 본문');
  const target = join(root, 'SE_CORE_EVAL_QA_INTERACTIONS_KO.md');

  const created = runCli(['node', 'qa-human-report', '--root', root, '--out', target]);
  assert.equal(created.exit_code, 0);
  const receipt = JSON.parse(created.stdout);
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.operation, 'create');
  assert.equal(receipt.output_basename, 'SE_CORE_EVAL_QA_INTERACTIONS_KO.md');
  assert.equal(created.stdout.toString('utf8').includes('질문 본문'), false);
  const written = readFileSync(target);
  assert.deepEqual(written, render(root).markdown_bytes);
  assert.equal(receipt.output_sha256, sha256(written));

  const again = runCli(['node', 'qa-human-report', '--root', root, '--out', target]);
  assert.equal(again.exit_code, 2);
  assert.deepEqual(JSON.parse(again.stdout).issues, ['CLI_OUTPUT_REFUSED']);
  assert.deepEqual(readFileSync(target), written);

  const outside = runCli([
    'node', 'qa-human-report', '--root', root, '--out', join(root, '..', 'escaped.md'),
  ]);
  assert.equal(outside.exit_code, 2);
  assert.match(JSON.parse(outside.stdout).issues[0], /^CLI_[A-Z_]+$/);
});

test('the CLI refresh replaces only a recognized report whose current bytes match the guard', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-refresh', '질문 본문');
  const target = join(root, 'SE_CORE_EVAL_QA_INTERACTIONS_KO.md');
  assert.equal(runCli(['node', 'qa-human-report', '--root', root, '--out', target]).exit_code, 0);
  const generated = readFileSync(target);

  const stale = runCli([
    'node', 'qa-human-report', '--root', root,
    '--refresh', target, '--expected-sha256', '0'.repeat(64),
  ]);
  assert.equal(stale.exit_code, 2);
  assert.deepEqual(JSON.parse(stale.stdout).issues, ['CLI_REFRESH_REFUSED']);
  assert.deepEqual(readFileSync(target), generated);

  const unguarded = runCli(['node', 'qa-human-report', '--root', root, '--refresh', target]);
  assert.equal(unguarded.exit_code, 2);
  assert.match(JSON.parse(unguarded.stdout).issues[0], /^CLI_[A-Z_]+$/);
  assert.deepEqual(readFileSync(target), generated);

  const foreign = join(root, 'NOT_A_GENERATED_REPORT.md');
  const foreignBytes = Buffer.from('# 사람이 직접 쓴 문서\n', 'utf8');
  writeFileSync(foreign, foreignBytes);
  const refusedForeign = runCli([
    'node', 'qa-human-report', '--root', root,
    '--refresh', foreign, '--expected-sha256', sha256(foreignBytes),
  ]);
  assert.equal(refusedForeign.exit_code, 2);
  assert.deepEqual(JSON.parse(refusedForeign.stdout).issues, ['CLI_REFRESH_REFUSED']);
  assert.deepEqual(readFileSync(foreign), foreignBytes);

  recordAnswer(root, 'se-q-refresh', '나중에 도착한 답변');
  const refreshed = runCli([
    'node', 'qa-human-report', '--root', root,
    '--refresh', target, '--expected-sha256', sha256(generated),
  ]);
  assert.equal(refreshed.exit_code, 0);
  const receipt = JSON.parse(refreshed.stdout);
  assert.equal(receipt.operation, 'refresh');
  assert.equal(receipt.answer_count, 1);
  assert.equal(refreshed.stdout.toString('utf8').includes('나중에 도착한 답변'), false);
  const after = readFileSync(target);
  assert.deepEqual(after, render(root).markdown_bytes);
  assert.equal(receipt.output_sha256, sha256(after));
  assert.deepEqual(
    readdirSync(root).filter((name) => name.toLowerCase().includes('tmp')),
    [],
  );
  assert.equal(existsSync(`${target}.refresh-tmp`), false);
});

test('the CLI refuses both output modes at once and leaves the ledger untouched', () => {
  const root = makeRoot();
  recordQuestion(root, 'se-q-modes', '질문 본문');
  const ledgerBefore = readFileSync(join(root, 'qa_interaction_ledger.jsonl'));
  const target = join(root, 'SE_CORE_EVAL_QA_INTERACTIONS_KO.md');
  const both = runCli([
    'node', 'qa-human-report', '--root', root,
    '--out', target, '--refresh', target, '--expected-sha256', '0'.repeat(64),
  ]);
  assert.equal(both.exit_code, 2);
  assert.match(JSON.parse(both.stdout).issues[0], /^CLI_[A-Z_]+$/);
  assert.equal(existsSync(target), false);
  assert.deepEqual(readFileSync(join(root, 'qa_interaction_ledger.jsonl')), ledgerBefore);
});
