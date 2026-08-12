import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { captureQaInteraction } from './se_core_eval_qa_capture.mjs';

const REPORT_SCHEMA = 'soulforge.engineering_engine.se_core_eval_qa_human_report.v1';
const CLAIM_CEILING = 'derived_view_of_metadata_only_observation_ledger';
const GENESIS_HASH = '0'.repeat(64);
const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_REF = /^[A-Za-z0-9._/-]{1,512}$/;
const MAX_RAW_BYTES = 32 * 1024 * 1024;
const MAX_EVENTS = 100_000;
/** Everything below C0/C1 except tab and the two line-ending characters. */
const UNSAFE_CONTROL = /[\0-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
const LONE_CR = /\r(?!\n)/;
const CELL_UNSAFE = /[\0-\x08\x0A-\x1F\x7F-\x9F]/;
const BYTE_ORDER_MARK = String.fromCharCode(0xFEFF);
const REPLACEMENT = String.fromCharCode(0xFFFD);

const EVENT_KEYS = Object.freeze([
  'artifact',
  'capture_mode',
  'event_hash',
  'event_time',
  'event_type',
  'identity',
  'links',
  'previous_event_hash',
  'schema_version',
  'scope',
  'sequence',
]);
const ARTIFACT_KEYS = Object.freeze(['byte_length', 'kind', 'relative_ref', 'sha256']);
const IDENTITY_KEYS = Object.freeze(['attempt_id', 'interaction_id', 'provider']);
const LINK_KEYS = Object.freeze(['answer_event_hash', 'question_event_hash']);

const EVENT_TYPE_LABEL = Object.freeze({
  question_recorded: '질문',
  answer_received: '답변',
  review_recorded: '검토 상태 기록',
});
const SCOPE_LABEL = Object.freeze({
  exploratory: '탐색(exploratory)',
  fixed_benchmark: '고정 벤치마크(fixed_benchmark)',
});
const PROVIDER_LABEL = Object.freeze({
  engine: 'Engine(engine)',
  notebook: 'Notebook(notebook)',
});
const CAPTURE_MODE_LABEL = Object.freeze({
  live_capture: '실시간 기록(live_capture)',
  historical_import: '기존 자료 반입(historical_import)',
  existing_status_review: '기존 검토 상태 반입(existing_status_review)',
});
const ARTIFACT_KIND_LABEL = Object.freeze({
  question: '질문 원문',
  answer: '답변 원문',
  review_status: '검토 상태 파일',
});

/**
 * The exact prefix a refresh caller uses to recognise its own generated report.
 *
 * A refresh that only checked the hash would happily replace any file whose bytes the caller
 * happened to know. Recognition needs a second, content-owned signal, so the first two lines are
 * fixed and exported rather than restated by the CLI.
 */
export const SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER = [
  '# SE Core 질의응답 상호작용 기록 (파생 보기)',
  '',
  `> 생성기: ${REPORT_SCHEMA}`,
  '',
].join('\n');

class QaHumanReportHold extends Error {
  constructor(code) {
    super(code);
    this.name = 'QaHumanReportHold';
    this.code = code;
  }
}

function hold(code) {
  throw new QaHumanReportHold(code);
}

function guard(condition, code) {
  if (!condition) hold(code);
}

function isRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, code) {
  guard(isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)),
  code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function withinRoot(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function openRoot(rootPath) {
  guard(typeof rootPath === 'string' && rootPath.length > 0 && isAbsolute(rootPath),
    'EVALUATION_ROOT_REFUSED');
  try {
    const root = realpathSync(rootPath);
    guard(statSync(root).isDirectory(), 'EVALUATION_ROOT_REFUSED');
    return root;
  } catch (error) {
    if (error instanceof QaHumanReportHold) throw error;
    hold('EVALUATION_ROOT_REFUSED');
  }
}

/**
 * Resolves one recorded artifact ref to the exact bytes the ledger committed to.
 *
 * The capture contract already validated this ref when it validated the ledger, and it is
 * revalidated here because this module is the one that turns those bytes into readable text: a
 * projection that resolved a ref more loosely than the writer did would show text no ledger event
 * actually commits to. Traversal, a symlink or junction at the leaf, a non-regular file, and any
 * byte-length or digest disagreement all refuse rather than resolve.
 */
function readCommittedArtifact(root, artifact) {
  const ref = artifact.relative_ref;
  guard(typeof ref === 'string'
    && ref.normalize('NFC') === ref
    && SAFE_REF.test(ref)
    && !isAbsolute(ref)
    && !ref.includes('\\')
    && ref.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  'ARTIFACT_REF_REFUSED');
  try {
    const lexical = resolve(root, ...ref.split('/'));
    guard(withinRoot(root, lexical), 'ARTIFACT_REF_REFUSED');
    const links = lstatSync(lexical);
    guard(links.isFile() && !links.isSymbolicLink(), 'ARTIFACT_FILE_REFUSED');
    const real = realpathSync(lexical);
    guard(withinRoot(root, real), 'ARTIFACT_REF_REFUSED');
    const stats = statSync(real);
    guard(stats.isFile() && stats.size > 0 && stats.size <= MAX_RAW_BYTES, 'ARTIFACT_FILE_REFUSED');
    const bytes = readFileSync(real);
    guard(bytes.length === stats.size, 'ARTIFACT_FILE_REFUSED');
    guard(bytes.length === artifact.byte_length && sha256(bytes) === artifact.sha256,
      'ARTIFACT_COMMITMENT_MISMATCH');
    return bytes;
  } catch (error) {
    if (error instanceof QaHumanReportHold) throw error;
    hold('ARTIFACT_FILE_REFUSED');
  }
}

/**
 * Decodes committed bytes into text that can be shown without changing what was captured.
 *
 * Nothing here rewrites the source. A byte sequence that cannot be shown exactly — invalid UTF-8,
 * a replacement character that would silently stand in for bytes nobody recorded, a byte-order
 * mark, a lone carriage return, or any other control character — holds instead of being cleaned
 * up into something readable but different.
 */
function decodeExactText(bytes) {
  let text;
  try {
    // ignoreBOM keeps a leading U+FEFF in the decoded text instead of dropping it. Without it a
    // byte-order mark would vanish between the committed bytes and the rendered text.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    hold('RAW_TEXT_REFUSED');
  }
  guard(!text.startsWith(BYTE_ORDER_MARK)
    && !text.includes(REPLACEMENT)
    && !UNSAFE_CONTROL.test(text)
    && !LONE_CR.test(text),
  'RAW_TEXT_REFUSED');
  return text;
}

function cell(value) {
  const text = String(value);
  guard(!CELL_UNSAFE.test(text) && !text.includes('\r') && !text.includes(REPLACEMENT),
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

function code(value) {
  const text = String(value);
  guard(!CELL_UNSAFE.test(text)
    && !text.includes('\r')
    && !text.includes('`')
    && !text.includes(REPLACEMENT),
  'MARKDOWN_TEXT_REFUSED');
  return `\`${text}\``;
}

/**
 * Wraps captured text in a fence no line of that text can close.
 *
 * The fence is one backtick longer than the longest backtick run in the source, so no interior
 * line can be read as the closing fence and no heading, table row, or HTML in the source can be
 * read as document structure.
 */
function fencedBlock(text) {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(4, ...runs.map((run) => run.length + 1)));
  return `${fence}text\n${text.endsWith('\n') ? text : `${text}\n`}${fence}`;
}

function labelOf(table, value, code_) {
  guard(Object.hasOwn(table, value), code_);
  return table[value];
}

function validateEventShape(event) {
  exactKeys(event, EVENT_KEYS, 'LEDGER_EVENT_REFUSED');
  exactKeys(event.artifact, ARTIFACT_KEYS, 'LEDGER_EVENT_REFUSED');
  exactKeys(event.identity, IDENTITY_KEYS, 'LEDGER_EVENT_REFUSED');
  exactKeys(event.links, LINK_KEYS, 'LEDGER_EVENT_REFUSED');
  guard(Number.isSafeInteger(event.sequence) && event.sequence > 0, 'LEDGER_EVENT_REFUSED');
  guard(typeof event.event_time === 'string' && event.event_time.length <= 32,
    'LEDGER_EVENT_REFUSED');
  guard(typeof event.identity.interaction_id === 'string', 'LEDGER_EVENT_REFUSED');
  guard(event.identity.provider === null || typeof event.identity.provider === 'string',
    'LEDGER_EVENT_REFUSED');
  guard(event.identity.attempt_id === null || typeof event.identity.attempt_id === 'string',
    'LEDGER_EVENT_REFUSED');
  guard(Number.isSafeInteger(event.artifact.byte_length)
    && event.artifact.byte_length > 0
    && HEX64.test(event.artifact.sha256),
  'LEDGER_EVENT_REFUSED');
  labelOf(EVENT_TYPE_LABEL, event.event_type, 'LEDGER_EVENT_REFUSED');
  labelOf(SCOPE_LABEL, event.scope, 'LEDGER_EVENT_REFUSED');
  labelOf(CAPTURE_MODE_LABEL, event.capture_mode, 'LEDGER_EVENT_REFUSED');
  labelOf(ARTIFACT_KIND_LABEL, event.artifact.kind, 'LEDGER_EVENT_REFUSED');
}

function buildView(root) {
  const ledger = captureQaInteraction({ root_path: root, command: 'query' });
  guard(isRecord(ledger) && Array.isArray(ledger.issues), 'LEDGER_VALIDATION_REFUSED');
  if (ledger.result !== 'PASS') {
    hold(typeof ledger.issues[0] === 'string' && /^[A-Z][A-Z_]*$/.test(ledger.issues[0])
      ? ledger.issues[0]
      : 'LEDGER_VALIDATION_REFUSED');
  }
  const events = ledger.events;
  guard(Array.isArray(events) && events.length <= MAX_EVENTS, 'LEDGER_VALIDATION_REFUSED');
  guard(HEX64.test(ledger.ledger_sha256) && HEX64.test(ledger.head_event_hash),
    'LEDGER_VALIDATION_REFUSED');

  const sequenceByHash = new Map();
  const blocks = [];
  const answered = new Set();
  const questions = [];
  const counts = { question_recorded: 0, answer_received: 0, review_recorded: 0 };
  for (const [offset, event] of events.entries()) {
    validateEventShape(event);
    guard(event.sequence === offset + 1, 'LEDGER_VALIDATION_REFUSED');
    guard(HEX64.test(event.event_hash), 'LEDGER_EVENT_REFUSED');
    sequenceByHash.set(event.event_hash, event.sequence);
    counts[event.event_type] += 1;

    const bytes = readCommittedArtifact(root, event.artifact);
    const body = event.event_type === 'review_recorded' ? null : decodeExactText(bytes);
    if (event.event_type === 'question_recorded') {
      questions.push({
        sequence: event.sequence,
        interaction_id: event.identity.interaction_id,
      });
    } else {
      answered.add(event.identity.interaction_id);
    }
    blocks.push({
      sequence: event.sequence,
      event_type: event.event_type,
      event_time: event.event_time,
      capture_mode: event.capture_mode,
      scope: event.scope,
      interaction_id: event.identity.interaction_id,
      provider: event.identity.provider,
      attempt_id: event.identity.attempt_id,
      artifact_kind: event.artifact.kind,
      artifact_ref: event.artifact.relative_ref,
      byte_length: event.artifact.byte_length,
      artifact_sha256: event.artifact.sha256,
      question_sequence: event.links.question_event_hash === null
        ? null
        : sequenceByHash.get(event.links.question_event_hash) ?? null,
      answer_sequence: event.links.answer_event_hash === null
        ? null
        : sequenceByHash.get(event.links.answer_event_hash) ?? null,
      body,
      ends_with_newline: body === null ? null : body.endsWith('\n'),
    });
  }
  return {
    blocks,
    counts,
    pending: questions.filter((question) => !answered.has(question.interaction_id)),
    ledger_sha256: ledger.ledger_sha256,
    head_event_hash: events.length === 0 ? GENESIS_HASH : ledger.head_event_hash,
  };
}

/**
 * The status metadata a reader needs to orient one turn, and nothing else.
 *
 * Row labels and the closed vocabulary translations are this module's own constants, so they are
 * written as they are. Everything that came out of the ledger is escaped as a table cell or wrapped
 * as a code span first, so no recorded value can become table or heading structure.
 */
function metadataRows(block) {
  const rows = [
    ['순번', cell(block.sequence)],
    ['기록 종류', labelOf(EVENT_TYPE_LABEL, block.event_type, 'LEDGER_EVENT_REFUSED')],
    ['기록 시각(UTC)', cell(block.event_time)],
    ['기록 방식', labelOf(CAPTURE_MODE_LABEL, block.capture_mode, 'LEDGER_EVENT_REFUSED')],
    ['범위', labelOf(SCOPE_LABEL, block.scope, 'LEDGER_EVENT_REFUSED')],
    ['상호작용 ID', cell(block.interaction_id)],
    ['참가자 구분', block.provider === null
      ? '해당 없음'
      : labelOf(PROVIDER_LABEL, block.provider, 'LEDGER_EVENT_REFUSED')],
    ['시도 ID', block.attempt_id === null ? '해당 없음' : cell(block.attempt_id)],
    ['대응 질문 순번', block.question_sequence === null
      ? '해당 없음'
      : cell(block.question_sequence)],
  ];
  if (block.answer_sequence !== null) {
    rows.push(['대응 답변 순번', cell(block.answer_sequence)]);
  }
  rows.push(
    ['원문 종류', labelOf(ARTIFACT_KIND_LABEL, block.artifact_kind, 'LEDGER_EVENT_REFUSED')],
    ['원문 파일', code(block.artifact_ref)],
    ['원문 바이트', cell(block.byte_length)],
    ['원문 SHA-256', code(block.artifact_sha256)],
  );
  if (block.ends_with_newline !== null) {
    rows.push(['원문 개행 종료', block.ends_with_newline ? '예' : '아니오']);
  }
  return [
    '| 항목 | 값 |',
    '| --- | --- |',
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
  ];
}

function blockLines(block) {
  const heading = `### ${block.sequence}. `
    + `${labelOf(EVENT_TYPE_LABEL, block.event_type, 'LEDGER_EVENT_REFUSED')} — `
    + `${cell(block.interaction_id)}`;
  const lines = [heading, '', ...metadataRows(block), ''];
  if (block.event_type === 'review_recorded') {
    lines.push(
      '> 검토 상태 파일은 원장이 해시로 묶은 정본 증거로만 남기고, 그 판정 내용은 이 파생 보기에 옮기지 않는다.',
    );
    return lines;
  }
  lines.push(
    `#### ${labelOf(ARTIFACT_KIND_LABEL, block.artifact_kind, 'LEDGER_EVENT_REFUSED')}`,
    '',
    fencedBlock(block.body),
  );
  return lines;
}

function summaryLines(view) {
  const rows = [
    ['총 event 수', cell(view.blocks.length)],
    ['질문', cell(view.counts.question_recorded)],
    ['답변', cell(view.counts.answer_received)],
    ['검토 상태 기록', cell(view.counts.review_recorded)],
    ['답변 대기 질문', cell(view.pending.length)],
  ];
  return [
    '## 기록 요약',
    '',
    '| 항목 | 값 |',
    '| --- | --- |',
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
    `| 원장 SHA-256 | ${code(view.ledger_sha256)} |`,
    `| 마지막 event 해시 | ${code(view.head_event_hash)} |`,
    '',
    ...(view.pending.length === 0
      ? ['- 답변 대기 중인 질문 없음.']
      : view.pending.map((question) => `- 답변 대기: ${code(question.interaction_id)} `
        + `(질문 순번 ${question.sequence}) — 아직 답변 event가 기록되지 않은 대기 상태이며 실패가 아니다.`)),
  ];
}

function formatReport(view) {
  const lines = [
    ...SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER.split('\n').slice(0, -1),
    '> - 이 문서는 원장에서 결정론적으로 만든 **파생 보기**이며 권위가 아니다. 정본 증거는 append-only QA 상호작용 원장과 해시로 묶인 질문·답변 원문 파일이다.',
    '> - Notebook과 Engine은 **비교 참가자**이며 어느 쪽도 진실이나 정답지가 아니다.',
    '> - 동결된 70개·115개 event 벤치마크 원장과 그 보고서는 이 보기가 읽지도 수정하지 않는다.',
    '> - 현재 탐색 턴은 **채점하지 않는다**. 이 문서는 점수, 판정, 승자를 만들지 않는다.',
    '> - 원문은 코드 펜스 안에 바이트 그대로 넣는다. 번역, 요약, 교정하지 않는다. 원문이 개행으로 끝나지 않으면 닫는 펜스를 위한 개행 하나만 덧붙이며, 그 사실은 각 기록의 `원문 개행 종료` 값이 밝힌다.',
    '',
    ...summaryLines(view),
    '',
    '## 상호작용 기록',
  ];
  if (view.blocks.length === 0) {
    lines.push('', '- 아직 기록된 event가 없다.');
  }
  for (const block of view.blocks) lines.push('', ...blockLines(block));
  while (lines.at(-1) === '') lines.pop();
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

function passReport(view, bytes) {
  return {
    schema_version: REPORT_SCHEMA,
    result: 'PASS',
    output_format: 'markdown',
    claim_ceiling: CLAIM_CEILING,
    event_count: view.blocks.length,
    question_count: view.counts.question_recorded,
    answer_count: view.counts.answer_received,
    review_count: view.counts.review_recorded,
    pending_question_count: view.pending.length,
    ledger_sha256: view.ledger_sha256,
    head_event_hash: view.head_event_hash,
    markdown_byte_length: bytes.length,
    markdown_sha256: sha256(bytes),
    derived_view_only: true,
    notebook_is_gold: false,
    engine_is_gold: false,
    frozen_benchmark_reports_modified: false,
    current_turn_scored: false,
    final_comparison_allowed: false,
    issues: [],
  };
}

function failureReport(code_) {
  return {
    schema_version: REPORT_SCHEMA,
    result: 'HOLD',
    output_format: 'markdown',
    claim_ceiling: CLAIM_CEILING,
    event_count: 0,
    question_count: 0,
    answer_count: 0,
    review_count: 0,
    pending_question_count: 0,
    ledger_sha256: GENESIS_HASH,
    head_event_hash: GENESIS_HASH,
    markdown_byte_length: 0,
    markdown_sha256: GENESIS_HASH,
    derived_view_only: true,
    notebook_is_gold: false,
    engine_is_gold: false,
    frozen_benchmark_reports_modified: false,
    current_turn_scored: false,
    final_comparison_allowed: false,
    issues: [code_],
  };
}

/**
 * Renders the whole prospective QA interaction ledger as one readable Markdown projection.
 *
 * The ledger and the hash-bound raw files stay canonical. This returns bytes and safe counts only;
 * it writes nothing, scores nothing, and holds rather than showing anything it cannot bind to a
 * validated event.
 */
export function renderSeCoreEvalQaHumanReport(options = {}) {
  try {
    exactKeys(options, ['root_path'], 'REPORT_REQUEST_REFUSED');
    const root = openRoot(options.root_path);
    const view = buildView(root);
    const markdownBytes = formatReport(view);
    return {
      result: 'PASS',
      markdown_bytes: markdownBytes,
      report: passReport(view, markdownBytes),
    };
  } catch (error) {
    return {
      result: 'HOLD',
      markdown_bytes: Buffer.alloc(0),
      report: failureReport(error instanceof QaHumanReportHold
        ? error.code
        : 'QA_HUMAN_REPORT_OPERATION_REFUSED'),
    };
  }
}
