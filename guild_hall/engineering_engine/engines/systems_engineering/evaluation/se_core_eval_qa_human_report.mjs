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
 * The exact head every generated report starts with, ending at the body commitment value.
 *
 * A refresh that only checked a fixed marker would replace any file that copied those first bytes,
 * and one that checked a caller-supplied digest would replace whatever that caller pointed at. So
 * the head carries a commitment over the entire body that follows it, and recognition is decided
 * from the candidate file's own bytes. Editing the body without recomputing the commitment makes
 * the file unrecognized, which is a hold rather than a rewrite.
 */
export const SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER = [
  '# SE Core 질의응답 상호작용 기록 (파생 보기)',
  '',
  `> 생성기: ${REPORT_SCHEMA}`,
  '> 본문 커밋먼트(SHA-256): ',
].join('\n');
const REPORT_BODY_COMMITMENT_DOMAIN = 'soulforge.se_core_eval.qa_human_report_body.v1\n';

function bodyCommitment(bodyBytes) {
  return sha256(Buffer.concat([
    Buffer.from(REPORT_BODY_COMMITMENT_DOMAIN, 'utf8'),
    bodyBytes,
  ]));
}

/**
 * True only for bytes this renderer produced, proved from those bytes alone.
 *
 * This is what an automatic writer must consult before replacing a file it did not just create.
 * It trusts no caller-supplied digest and no marker alone: the head must be exactly this
 * renderer's, and the committed digest must still match the body it is supposed to commit to. A
 * report written in an older format that had no commitment is simply not recognized, so it is held
 * for an explicit human repair instead of being silently overwritten.
 */
export function verifySeCoreEvalQaHumanReportBytes(bytes) {
  if (!Buffer.isBuffer(bytes)) return false;
  const head = Buffer.from(SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER, 'utf8');
  if (bytes.length < head.length + 65
    || !bytes.subarray(0, head.length).equals(head)
    || bytes[head.length + 64] !== 0x0A) return false;
  const commitment = bytes.subarray(head.length, head.length + 64).toString('latin1');
  return HEX64.test(commitment)
    && bodyCommitment(bytes.subarray(head.length + 65)) === commitment;
}

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

/** One strictly decoded scalar, or a null scalar for the single byte that could not start one. */
function decodeScalar(bytes, index) {
  const first = bytes[index];
  if (first < 0x80) return { scalar: first, length: 1 };
  const length = first >= 0xF0 && first <= 0xF4
    ? 4
    : first >= 0xE0 && first <= 0xEF
      ? 3
      : first >= 0xC2 && first <= 0xDF ? 2 : 0;
  if (length === 0 || index + length > bytes.length) return { scalar: null, length: 1 };
  let scalar = first & (length === 2 ? 0x1F : length === 3 ? 0x0F : 0x07);
  for (let offset = 1; offset < length; offset += 1) {
    const next = bytes[index + offset];
    if ((next & 0xC0) !== 0x80) return { scalar: null, length: 1 };
    scalar = (scalar << 6) | (next & 0x3F);
  }
  const minimum = length === 2 ? 0x80 : length === 3 ? 0x800 : 0x10000;
  if (scalar < minimum || scalar > 0x10FFFF || (scalar >= 0xD800 && scalar <= 0xDFFF)) {
    return { scalar: null, length: 1 };
  }
  return { scalar, length };
}

function escapeScalar(scalar) {
  if (scalar === 0x0A || scalar === 0x09) return String.fromCharCode(scalar);
  if (scalar === 0x5C) return '\\\\';
  if (scalar < 0x20
    || scalar === 0x7F
    || (scalar >= 0x80 && scalar <= 0x9F)
    || scalar === 0xFEFF
    || scalar === 0xFFFD) {
    return `\\u{${scalar.toString(16).toUpperCase().padStart(4, '0')}}`;
  }
  return String.fromCodePoint(scalar);
}

/**
 * The one escaped notation, which is exact, reversible, and safe to show.
 *
 * A byte that starts no valid UTF-8 scalar becomes `\xNN`, and every scalar that cannot be shown
 * directly becomes `\u{XXXX}`. Backslash doubles so the two forms can never be confused with source
 * text that merely looks like them. Line feed and tab stay themselves, so an escaped block is still
 * laid out the way it was captured; everything else that would be a control character, a lone
 * carriage return, a byte-order mark, or a replacement character is written out instead.
 */
function escapedBytesText(bytes) {
  const parts = [];
  let index = 0;
  while (index < bytes.length) {
    const { scalar, length } = decodeScalar(bytes, index);
    parts.push(scalar === null
      ? `\\x${bytes[index].toString(16).toUpperCase().padStart(2, '0')}`
      : escapeScalar(scalar));
    index += length;
  }
  return parts.join('');
}

/**
 * Turns committed bytes into text that can be shown without changing what was captured.
 *
 * The capture contract accepts any non-empty byte sequence, so this projection has to be total for
 * every artifact that contract accepted: a shape refused here would let one recorded turn make the
 * report unbuildable, and with it every automatic capture lane, permanently. Bytes that are already
 * exactly showable are shown byte for byte as before. Anything else — invalid UTF-8, a byte-order
 * mark, a lone carriage return, a control character, or a replacement character standing in for
 * bytes nobody recorded — is written in the escaped notation instead. Nothing is cleaned up,
 * dropped, or normalised, and every block states which notation it used.
 */
function bodyRepresentation(bytes) {
  let text = null;
  try {
    // ignoreBOM keeps a leading U+FEFF in the decoded text instead of dropping it. Without it a
    // byte-order mark would vanish between the committed bytes and the rendered text.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { /* not exactly showable, so the escaped notation below carries it instead */ }
  if (text !== null
    && !text.startsWith(BYTE_ORDER_MARK)
    && !text.includes(REPLACEMENT)
    && !UNSAFE_CONTROL.test(text)
    && !LONE_CR.test(text)) {
    return { mode: 'exact_text', text };
  }
  return { mode: 'escaped_bytes', text: escapedBytesText(bytes) };
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
  let escapedBodyCount = 0;
  for (const [offset, event] of events.entries()) {
    validateEventShape(event);
    guard(event.sequence === offset + 1, 'LEDGER_VALIDATION_REFUSED');
    guard(HEX64.test(event.event_hash), 'LEDGER_EVENT_REFUSED');
    sequenceByHash.set(event.event_hash, event.sequence);
    counts[event.event_type] += 1;

    const bytes = readCommittedArtifact(root, event.artifact);
    const body = event.event_type === 'review_recorded' ? null : bodyRepresentation(bytes);
    if (body !== null && body.mode === 'escaped_bytes') escapedBodyCount += 1;
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
      body: body === null ? null : body.text,
      body_mode: body === null ? null : body.mode,
      ends_with_newline: body === null ? null : bytes.at(-1) === 0x0A,
    });
  }
  return {
    blocks,
    counts,
    escaped_body_count: escapedBodyCount,
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
  if (block.body_mode !== null) {
    rows.push(['원문 표시 방식', block.body_mode === 'exact_text'
      ? '바이트 그대로(exact_text)'
      : '이스케이프 표기(escaped_bytes)']);
  }
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
    '> - 이 문서는 원장에서 결정론적으로 만든 **파생 보기**이며 권위가 아니다. 정본 증거는 append-only QA 상호작용 원장과 해시로 묶인 질문·답변 원문 파일이다.',
    '> - Notebook과 Engine은 **비교 참가자**이며 어느 쪽도 진실이나 정답지가 아니다.',
    '> - 동결된 70개·115개 event 벤치마크 원장과 그 보고서는 이 보기가 읽지도 수정하지 않는다.',
    '> - 현재 탐색 턴은 **채점하지 않는다**. 이 문서는 점수, 판정, 승자를 만들지 않는다.',
    '> - 원문은 코드 펜스 안에 바이트 그대로 넣는다. 번역, 요약, 교정하지 않는다. 원문이 개행으로 끝나지 않으면 닫는 펜스를 위한 개행 하나만 덧붙이며, 그 사실은 각 기록의 `원문 개행 종료` 값이 밝힌다.',
    '> - 바이트 그대로 보일 수 없는 원문은 버리지 않고 `이스케이프 표기`로 넣는다. 유효한 UTF-8 scalar를 시작하지 못하는 바이트는 `\\xNN`, 제어문자·BOM·U+FFFD는 `\\u{XXXX}`, 역슬래시는 `\\\\`로 적고 줄바꿈과 탭은 그대로 둔다. 어느 표기를 썼는지는 각 기록의 `원문 표시 방식` 값이 밝힌다.',
    '> - 위 `본문 커밋먼트`는 이 줄부터 문서 끝까지의 SHA-256이다. 자동 갱신은 그 값이 본문과 실제로 맞는 파일만 교체한다. 사람이 본문을 고쳤거나 이 머리말이 없는 파일은 덮어쓰지 않고 보류하며, 복구는 그 파일을 사람이 직접 옮기거나 지우는 것이다.',
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
  const body = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  return Buffer.concat([
    Buffer.from(`${SE_CORE_EVAL_QA_HUMAN_REPORT_MARKER}${bodyCommitment(body)}\n`, 'utf8'),
    body,
  ]);
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
    escaped_body_count: view.escaped_body_count,
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
    escaped_body_count: 0,
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
