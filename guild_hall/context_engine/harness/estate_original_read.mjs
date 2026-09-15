// Dev harness and CLI: read one item of one project's selected generation back
// to its original -- the whole of every unit, and the attachments the original
// carries -- and, when asked, the text inside one of those attachments.
//
// It is the second half of the pair the search CLI starts. Search says an item
// exists and quotes one line of it; this says what the item actually holds. The
// same rules apply: read-only apart from the derived cache and the call ledger,
// no Cypher, no index name, no database address, no path from the caller. A
// caller may name the project, the item, a unit, an attachment, a character
// bound and a page -- nothing that could be a place on this host.
//
// Every call is charged to the investigation it belongs to before the work
// starts, so a failure or a retry costs what it cost. A session that has spent
// its six calls is refused with a summary of what it already asked, which is
// what a bot needs to answer with the evidence it has instead of asking again.
//
// The same command also reads a voice session that belongs to no project yet
// (`--voice-session`). That read has no binding and no generation behind it --
// the recording is in the inbox precisely because nobody has classified it -- so
// it is gated by the Owner's inbox declaration instead, and it answers in
// windows of the recording rather than in units of a document.
//
// usage:
//   node estate_original_read.mjs --root-table <file> --tools-config <file>
//        --project <code> --item <item id>
//        [--unit <unit id>] [--max-chars 6000] [--attachments]
//        [--attachment <index|file_id|sha256 앞 12자>] [--slide <n>|--page <n>] [--render]
//        [--json] [--dev-run <label>] [--generation <id>] [--binding <file>]
//   node estate_original_read.mjs --root-table <file> --tools-config <file>
//        --voice-session <session id> [--from <sec>] [--to <sec>]
//        [--conversation-list] [--units] [--transcript local|provider]
//        [--max-chars 12000] [--json] [--dev-run <label>]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { chargeInvestigation, BUDGET_EXHAUSTED_CODE } from '../src/runtime/investigation_budget.mjs';
import { readOriginal, DEFAULT_MAX_CHARACTERS } from '../src/runtime/original_read.mjs';
import { readVoiceSession } from '../src/runtime/voice_session_read.mjs';

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
/** Said on every rendered image: the model that reads this output cannot see one. */
export const IMAGE_NOTICE = '이 봇은 이미지를 읽지 못합니다 — 그림은 사람이 열어 보거나 그림 읽기 도구가 연결되어야 합니다.';

export function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    flags.set(token.slice(2), next === undefined || next.startsWith('--') ? true : (index++, next));
  }
  return flags;
}

const line = (text, width = 200) => {
  const first = String(text ?? '').split('\n').map(row => row.trim()).find(row => row.length > 0) ?? '';
  return [...first].length > width ? `${[...first].slice(0, width).join('')}…` : first;
};

function renderAttachmentEntries(answer, lines) {
  const list = answer.attachments;
  lines.push(`\nattachments ${list.status}${list.detail ? ` (${list.detail})` : ''}${list.entries.length ? ` ${list.entries.length}개` : ''}`);
  for (const entry of list.entries) {
    lines.push(`  #${entry.index} ${entry.kind} ${entry.name ?? entry.file_id ?? '-'} ${entry.mime ?? '-'} `
      + `${entry.size_bytes ?? '-'} bytes ${entry.sha256 ? entry.sha256.replace('sha256:', '').slice(0, 12) : '-'} `
      + `${entry.status}${entry.format ? ` ${entry.format}` : ''}${entry.detail ? ` (${entry.detail})` : ''}`);
  }
}

function renderExtract(extract, lines, { slide = null }) {
  if (!extract || extract.status !== 'ok') {
    lines.push(`  extract ${extract?.code ?? 'unavailable'}`);
    return;
  }
  if (Array.isArray(extract.slides)) {
    const size = extract.slide_size?.inches ?? {};
    lines.push(`  slides ${extract.counts.slides} shapes ${extract.counts.shapes} slide ${size.width ?? '-'}x${size.height ?? '-'} inch`);
    for (const page of extract.slides) {
      if (slide !== null && page.slide !== slide) continue;
      lines.push(`  [slide ${page.slide}] shapes ${page.shapes.length}`);
      for (const shape of page.shapes) {
        const box = shape.box.percent_of_slide;
        lines.push(`    shape ${shape.shape_id} "${shape.name}" ${shape.shape_type ?? '-'}`
          + ` box left ${box.left ?? '-'}% top ${box.top ?? '-'}% width ${box.width ?? '-'}% height ${box.height ?? '-'}%`);
        for (const run of shape.runs) lines.push(`      run: ${line(run)}`);
        if (Array.isArray(shape.table)) for (const row of shape.table) lines.push(`      cell: ${row.map(cell => line(cell, 60)).join(' | ')}`);
      }
    }
    return;
  }
  if (Array.isArray(extract.pages)) {
    lines.push(`  pages ${extract.counts.pages_read} of ${extract.counts.pages_in_file}`);
    for (const page of extract.pages) {
      if (slide !== null && page.page !== slide) continue;
      lines.push(`  [page ${page.page}]`);
      for (const row of String(page.text ?? '').split('\n')) if (row.trim()) lines.push(`    ${row.trim()}`);
    }
    return;
  }
  if (Array.isArray(extract.sheets)) {
    for (const sheet of extract.sheets) {
      lines.push(`  [sheet ${sheet.sheet}] ${sheet.bounds.rows}행 ${sheet.bounds.columns}열${sheet.truncated ? ' (잘림)' : ''}`);
      for (const cell of sheet.cells) lines.push(`    ${cell.ref}: ${line(cell.value, 120)}`);
    }
    return;
  }
  if (typeof extract.text === 'string') {
    lines.push(`  characters ${extract.characters}${extract.truncated ? ' (잘림)' : ''}`);
    for (const row of extract.text.split('\n')) lines.push(`    ${row}`);
  }
}

export function render(answer, { budget, toolsSha256, slide = null }) {
  const lines = [`project ${answer.project_code} generation ${answer.generation.generation_id} `
    + `(${answer.generation.selected ? 'selected' : 'named, not selected'}) documents ${answer.generation.documents} `
    + `tools ${toolsSha256.replace('sha256:', '').slice(0, 12)} `
    + `budget ${budget.call}/${budget.call + budget.remaining} (${budget.bucket})`,
  `status ${answer.status}`];
  if (answer.status === 'not_in_scope') {
    lines.push(`\nitem ${answer.item.item_id} 은(는) 이 세대의 목록에 없습니다. 검색으로 항목 id를 다시 확인하세요.`);
    return lines.join('\n');
  }
  const item = answer.item;
  lines.push(`\nitem ${item.source_kind} ${item.item_id} root=${item.root_ref} class=${item.data_class}`,
    `  title ${line(item.title)}`,
    `  at ${item.occurred_at ?? '-'} revision ${item.primary_revision_sha256.replace('sha256:', '').slice(0, 12)}`,
    `  doc_key ${item.doc_key.replace('sha256:', '').slice(0, 12)} manifest ${item.manifest_doc_key.replace('sha256:', '').slice(0, 12)}`
    + ` ${item.doc_key_matches ? '(일치)' : '(불일치 — 원본이 바뀌었습니다)'}`,
    `  units ${item.units_total} characters ${item.characters_total} (${item.units_from}${item.reread_code ? `: ${item.reread_code}` : ''})`);
  if (!answer.requested_unit_found) lines.push('\n요청한 단위 id가 이 항목에 없습니다.');
  for (const unit of answer.units) {
    lines.push(`\n[${unit.unit_id}] ${unit.unit_kind} ${unit.occurred_at ?? '-'} ${unit.characters}자`);
    lines.push(unit.text);
    if (unit.truncated) {
      lines.push(`[잘림: ${unit.characters}자 중 ${unit.shown}자 — --unit ${unit.unit_id} --max-chars <더 큰 값>]`);
    }
  }
  if (answer.attachments.detail !== 'not requested') renderAttachmentEntries(answer, lines);
  const attachment = answer.attachment;
  if (attachment) {
    lines.push(`\nattachment ${attachment.selector} ${attachment.name ?? attachment.file_id ?? '-'} `
      + `${attachment.format ?? '-'} ${attachment.status}${attachment.detail ? ` (${attachment.detail})` : ''}`);
    renderExtract(attachment.extract, lines, { slide });
    if (attachment.cache) lines.push(`  extract locator ${attachment.cache.extract}`);
    if (attachment.pages?.length) {
      lines.push(`  render pages ${attachment.pages.length}`);
      for (const page of attachment.cache.pages) {
        lines.push(`    page ${page.page} -> ${page.locator} (${page.width}x${page.height})`);
      }
      lines.push(`  ${IMAGE_NOTICE}`);
    }
  }
  return lines.join('\n');
}

/** What the shared-term registry says about one interval: marks, never a verdict. */
const termMarks = row => {
  if (!row.terms?.length) return null;
  const marks = row.terms.slice(0, 10).map(term => term.shared
    ? `공통(과제 ${term.project_count}개) ${term.term}`
    : `구별(${term.projects[0] ?? '?'}) ${term.term}`);
  return `  terms ${marks.join(' · ')}${row.terms.length > 10 ? ` 외 ${row.terms.length - 10}` : ''}`;
};

const seconds = value => `${Number(value).toFixed(1)}s`;
const spoken = value => {
  const total = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(total / 60)}분 ${String(total % 60).padStart(2, '0')}초`;
};

/**
 * One window of a voice session. The head says which transcript answered and
 * what that chain allows a reader to claim; the rows are intervals, and the
 * clock beside each one is the recording's own declared offset applied to the
 * offset from its start -- not a time anybody wrote down.
 */
export function renderVoice(answer, { budget, toolsSha256 }) {
  const lines = [`voice session ${answer.session_id} tools ${toolsSha256.replace('sha256:', '').slice(0, 12)} `
    + `budget ${budget.call}/${budget.call + budget.remaining} (${budget.bucket})`, `status ${answer.status}`];
  if (!answer.access.granted) {
    lines.push('', `음성 인박스를 읽을 선언이 없습니다 — ${answer.detail}.`,
      `선언 자리는 \`${answer.access.address}\`이고 Owner가 둡니다. 선언 없이는 어떤 구간도 읽지 않습니다.`);
    return lines.join('\n');
  }
  if (answer.session === null) {
    lines.push('', `${answer.detail}`,
      answer.status === 'session_not_found'
        ? '세션 id를 다시 확인하세요. 이 도구는 폴더를 뒤져 비슷한 id를 고르지 않습니다.'
        : '이 상태에서는 구간을 읽지 않습니다.');
    return lines.join('\n');
  }
  const session = answer.session, transcript = answer.transcript, window = answer.window;
  lines.push(`\nsession ${session.date} · ${line(session.title)}`,
    `  recorded ${session.recorded_clock} · duration ${seconds(session.duration_seconds)} (${spoken(session.duration_seconds)})`,
    `  meeting_type ${session.meeting_type ?? '-'} · canonicalization ${session.canonicalization_state ?? '-'}`,
    `  transcript ${transcript.kind}${transcript.run_id ? ` run ${transcript.run_id}` : ''} `
      + `state ${transcript.state ?? '-'} segments ${transcript.segments_in_file}`
      + `${transcript.declared_segment_count !== null ? ` (선언 ${transcript.declared_segment_count})` : ''} `
      + `sha256 ${transcript.sha256_short}`,
    `    evidence_role ${transcript.evidence_role ?? '-'} · claim_ceiling ${transcript.claim_ceiling ?? '(선언 없음)'}`
      + ` · quality ${transcript.quality ?? '-'}`);
  if (transcript.metrics) {
    const metrics = transcript.metrics;
    lines.push(`    quality_metrics 평균 토큰 확률 ${metrics.mean_token_probability ?? '-'}`
      + ` · 낮은 확률 비율 ${metrics.low_probability_token_ratio ?? '-'}`
      + ` · 억제 구간 ${metrics.suppressed_segment_count ?? '-'} / 남은 구간 ${metrics.retained_segment_count ?? '-'}`
      + `${metrics.flags.length ? ` · flags ${metrics.flags.join(', ')}` : ''}`
      + ` · 반복 필터 ${metrics.repetition_filter_enabled ? '켬' : '끔'} · VAD ${metrics.vad_enabled ? '켬' : '끔'}`);
  }
  if (transcript.kind === 'provider') {
    lines.push('    공급자 전사는 정본이 아니며 claim_ceiling을 선언하지 않습니다 — 들은 말의 기록이 아니라 기계 전사입니다.');
    if (transcript.fallback_reason) lines.push(`    (로컬 ASR을 쓰지 못해 공급자 전사로 답했습니다: ${transcript.fallback_reason})`);
  }
  if (transcript.sha256_matches === false) {
    lines.push(`    (판본 불일치 — run이 선언한 ${transcript.declared_sha256?.replace('sha256:', '').slice(0, 12)}와 `
      + `읽은 ${transcript.sha256_short}가 다릅니다. 읽은 쪽을 그대로 보여 줍니다.)`);
  }
  const labels = answer.units;
  if (labels.status === 'ok') {
    const gate = labels.evidence_gate;
    lines.push(`  labels run ${labels.run_id} engine ${labels.engine_id} ${labels.engine_version} `
      + `mode ${labels.engine_mode} claim_ceiling ${labels.claim_ceiling ?? '(선언 없음)'}`,
      `    evidence_gate ${gate.input_class} · ${gate.state}`
        + ` · 과제 후보 방출 ${gate.project_candidate_emission_allowed ? '허용' : '차단'}`
        + `${gate.next_step ? ` · 다음 단계 ${gate.next_step}` : ''}`,
      `    coverage 의미단위 ${labels.coverage.semantic_units ?? '-'} / 전사구간 ${labels.coverage.source_segments ?? '-'}`
        + ` · recording_classification ${labels.recording_classification} · project_resolution ${labels.project_resolution}`
        + `${labels.missing_context_kinds.length ? ` · 빠진 맥락 ${labels.missing_context_kinds.join(', ')}` : ''}`,
      '    구간 초안은 기계가 나눈 초안입니다 — 경계도 판정도 그대로 믿지 말고 검토 대상으로 다루세요.');
  } else if (labels.status !== 'not_requested') {
    lines.push(`  labels ${labels.status}${labels.detail ? ` (${labels.detail})` : ''} — 원 전사 구간으로 답합니다.`);
  }
  const list = answer.conversation_list;
  if (list.status === 'ok') {
    lines.push(`  conversation_list run ${list.run_id}${list.generated_at ? ` generated ${list.generated_at}` : ''}`
      + ` (run ${list.runs_found}개 중 ${list.selected_by === 'run_id' ? 'run id' : '선언 시각'}으로 고름)`
      + ` verified ${list.verified ? 'true' : 'false'}${list.checks.length ? ` checks ${list.checks.length}건` : ''}`,
      '    제목·설명은 파이프라인이 만든 파생 요약입니다 — 실제 발언도 승인된 회의록도 아닙니다.');
  } else if (list.status !== 'not_requested') {
    lines.push(`  conversation_list 미생성 (${list.detail ?? list.status})`
      + ' — 아직 대화 목록이 만들어지지 않았습니다. 아래는 원 발화(또는 의미 단위)입니다.');
  }
  const registry = answer.shared_terms;
  if (registry.status === 'ok') {
    lines.push(`  shared_terms 등록 ${registry.term_count}개 (registry ${String(registry.registry_sha256 ?? '')
      .replace('sha256:', '').slice(0, 12)}) — 공통 표시가 붙은 용어로는 과제를 정하지 못합니다.`);
  } else if (registry.status !== 'not_configured') {
    lines.push(`  shared_terms ${registry.status}${registry.detail ? ` (${registry.detail})` : ''}`
      + ' — 용어 표시 없이 답합니다(등록부가 없어도 근거 두 가지 이상 규칙은 그대로입니다).');
  }
  lines.push(`  speaker 라벨은 정렬 힌트입니다 — 신원이 아니고 담당자도 아닙니다.`,
    `  window ${seconds(window.from)}–${seconds(window.to)} / 요청 ${seconds(window.from)}–${seconds(window.requested_to)}`
      + `${window.clamped ? ` (한 번에 ${window.max_seconds_per_call}초까지)` : ''}`
      + ` · ${answer.counts.basis === 'conversation_list' ? '대화 목록'
        : (answer.counts.basis === 'semantic_units' ? '구간 초안' : '전사 구간')} `
      + `${answer.counts.in_window}개 중 ${answer.counts.shown}개 · `
      + `${answer.counts.characters_shown}자 / ${answer.counts.characters_total}자`);
  if (answer.status === 'window_without_speech') {
    lines.push('\n이 구간에는 전사된 말이 없습니다. 다른 구간을 읽으세요.');
    return lines.join('\n');
  }
  for (const row of answer.segments) {
    lines.push(`\n[seg ${row.segment_id}] ${seconds(row.start_seconds)}–${seconds(row.end_seconds)} `
      + `${row.clock} ${session.clock_label} · ${row.speaker} · ${row.characters}자`);
    const marks = termMarks(row);
    if (marks !== null) lines.push(marks);
    if (row.shown > 0) lines.push(row.text);
    if (row.truncated) lines.push(`[잘림: ${row.characters}자 중 ${row.shown}자]`);
  }
  for (const unit of labels.rows) {
    const ids = unit.source_segment_ids;
    lines.push(`\n[unit ${unit.unit_id}] ${seconds(unit.start_seconds)}–${seconds(unit.end_seconds)} `
      + `${unit.clock}–${unit.clock_end} ${session.clock_label} · ${unit.speaker} · ${unit.characters}자`
      + `${unit.declared_characters !== null ? ` (선언 ${unit.declared_characters}${unit.characters_match === false ? ' — 불일치' : ''})` : ''}`
      + ` · segs ${ids.length ? `${ids[0]}..${ids.at(-1)} (${ids.length}개${unit.segments_found === ids.length ? '' : `, 찾은 것 ${unit.segments_found}개`})` : '없음'}`,
    `  speech_acts ${unit.speech_acts.join(', ') || '-'} · modality ${unit.modality} · disposition ${unit.disposition}`
      + `${unit.action_codes.length ? ` · action_codes ${unit.action_codes.join(', ')}` : ''}`,
    `  project_match ${unit.project_match.state} (후보 ${unit.project_match.candidates.length})`
      + (unit.window === null ? ''
        : ` · window ${unit.window.window_id} importance ${unit.window.importance_state}`
          + ` escalation ${unit.window.escalation_state}${unit.window.human_listen_required ? ' · 사람 청취 필요' : ''}`));
    if (unit.entities.length) {
      lines.push(`  entities ${unit.entities.slice(0, 8).map(entity =>
        `${entity.kind}:${line(entity.value, 24)}`).join(' · ')}${unit.entities.length > 8 ? ` 외 ${unit.entities.length - 8}` : ''}`);
    }
    const marks = termMarks(unit);
    if (marks !== null) lines.push(marks);
    if (unit.shown > 0) lines.push(unit.text);
    if (unit.truncated) lines.push(`[잘림: ${unit.characters}자 중 ${unit.shown}자]`);
  }
  for (const row of list.rows) {
    lines.push(`\n[conv ${row.conversation_id}] ${seconds(row.start_seconds)}–${seconds(row.end_seconds)} `
      + `${row.clock}–${row.clock_end} ${session.clock_label} · ${row.nature}`
      + `${row.status ? ` · ${row.status}` : ''}`
      + `${row.clock_matches === false ? ` (파일이 선언한 시각 ${row.declared_clock}과 다름)` : ''}`,
    `  제목(파생) ${line(row.title, 80)}`);
    if (row.shown > 0) lines.push(`  설명(파생) ${row.text}`);
    if (row.truncated) lines.push(`  [잘림: ${row.characters}자 중 ${row.shown}자]`);
    lines.push(row.project_candidates.length
      ? `  과제 후보 ${row.project_candidates.map(candidate => `${candidate.project_code}(${candidate.strength}`
        + `${candidate.basis.length ? `, ${candidate.basis.join('+')}` : ''}, 근거 ${candidate.evidence_rows}행)`).join(' · ')}`
      : `  과제 후보 없음${row.unclassified_reason ? ` — ${line(row.unclassified_reason, 80)}` : ''}`);
    lines.push(`  품질 ${row.quality.transcript_kind ?? '-'} · marks ${row.quality.marks.join(', ') || '-'}`
      + ` · 교정 ${row.quality.correction_state ?? '-'}`,
    `  참조 transcript ${row.refs.transcript_run_id ?? '-'}`
      + `${row.refs.source_segment_ids.length ? ` segs ${row.refs.source_segment_ids[0]}..${row.refs.source_segment_ids.at(-1)}`
        + ` (${row.refs.source_segment_ids.length}개)` : ''}`
      + `${row.refs.semantic_run_id ? ` · semantic ${row.refs.semantic_run_id}` : ''}`
      + `${row.related.length ? ` · 관련 ${row.related.join(', ')}` : ''}`);
    const marks = termMarks(row);
    if (marks !== null) lines.push(marks);
  }
  if (answer.next_window) {
    lines.push(`\n[이어 읽기] --from ${answer.next_window.from} --to ${answer.next_window.to}`
      + ` (${answer.next_window.reason === 'character_bound' ? '글자 상한' : '창 상한'}에 걸려 여기서 끊었습니다)`);
  } else {
    lines.push('\n[끝] 요청한 구간을 모두 보여 줬습니다.');
  }
  return lines.join('\n');
}

async function voiceMain({ flags, io, tools, toolsSha256 }) {
  const sessionId = String(flags.get('voice-session') ?? '');
  // One read is one thing. A call that names both a project item and a session
  // would charge one budget row for two different scopes.
  if (flags.get('project') !== undefined || flags.get('item') !== undefined) {
    process.stderr.write('[estate-original-read] voice_session_conflicting_arguments\n');
    return 2;
  }
  const number = name => {
    const raw = flags.get(name);
    if (raw === undefined || raw === true) return null;
    const value = Number.parseFloat(String(raw));
    return Number.isFinite(value) ? value : Number.NaN;
  };
  const from = number('from'), to = number('to');
  const kind = flags.get('transcript') === undefined || flags.get('transcript') === true
    ? null : String(flags.get('transcript'));
  const wantUnits = flags.get('units') === true;
  const wantList = flags.get('conversation-list') === true;
  const args = { voice_session: sessionId, from, to, transcript: kind, units: wantUnits,
    conversation_list: wantList,
    tools_config_sha256: toolsSha256.slice(0, 19), root_table_sha256: io.table_sha256.slice(0, 19) };
  let budget;
  try {
    budget = chargeInvestigation({ receiptsRoot: tools.receipts_root, cli: 'read', args,
      devRun: flags.get('dev-run') === undefined || flags.get('dev-run') === true ? null : String(flags.get('dev-run')) });
  } catch (error) {
    if (error?.code === BUDGET_EXHAUSTED_CODE) {
      process.stdout.write(`${['status investigation_budget_exhausted',
        `이 조사에서 이미 ${error.calls}번 호출했습니다. 확보한 근거로 답하고, 남은 일을 말해 주세요.`,
        ...error.summary].join('\n')}\n`);
      return 2;
    }
    throw error;
  }
  try {
    const answer = await readVoiceSession({ io, sessionId, from, to, transcriptKind: kind, units: wantUnits,
      conversationList: wantList, derivedRoot: tools.derived_root ?? null,
      sharedTermsPath: tools.shared_terms_path ?? null,
      maxChars: flags.get('max-chars') === undefined ? null : Number.parseInt(String(flags.get('max-chars')), 10) });
    budget.finish(answer.status, answer.internal);
    process.stdout.write(flags.get('json') === true
      ? `${JSON.stringify({ ...answer, tools_config: { sha256: toolsSha256 },
        budget: { bucket: budget.bucket, call: budget.call, remaining: budget.remaining } })}\n`
      : `${renderVoice(answer, { budget, toolsSha256 })}\n`);
    return 0;
  } catch (error) {
    budget.finish(String(error?.code ?? 'voice_session_read_failed'));
    throw error;
  }
}

async function main() {
  const flags = options(process.argv.slice(2));
  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  const toolsPath = String(flags.get('tools-config') ?? process.env.SOULFORGE_CONTEXT_TOOLS_CONFIG ?? '');
  if (!tablePath) { process.stderr.write('[estate-original-read] original_read_root_table_required\n'); return 2; }
  if (!toolsPath) { process.stderr.write('[estate-original-read] original_read_tools_config_required\n'); return 2; }
  const toolsBytes = readFileSync(toolsPath);
  const toolsSha256 = sha256(toolsBytes);
  const tools = readToolsConfig(toolsBytes);
  const expected = flags.get('root-table-sha256');
  const io = createAliasedStoreIo(readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) }));
  if (flags.get('voice-session') !== undefined) {
    if (flags.get('voice-session') === true) {
      process.stderr.write('[estate-original-read] voice_session_id_invalid\n');
      return 2;
    }
    return voiceMain({ flags, io, tools, toolsSha256 });
  }
  const project = String(flags.get('project') ?? '');
  const itemId = String(flags.get('item') ?? '');
  const slide = flags.get('slide') ?? flags.get('page');
  const attachmentSelector = flags.get('attachment') === undefined || flags.get('attachment') === true
    ? null : String(flags.get('attachment'));
  const args = { project, item: itemId, unit: flags.get('unit') === undefined ? null : String(flags.get('unit')),
    attachments: flags.get('attachments') === true, attachment: attachmentSelector, render: flags.get('render') === true,
    tools_config_sha256: toolsSha256.slice(0, 19), root_table_sha256: io.table_sha256.slice(0, 19) };
  let budget;
  try {
    budget = chargeInvestigation({ receiptsRoot: tools.receipts_root, cli: 'read', args,
      devRun: flags.get('dev-run') === undefined || flags.get('dev-run') === true ? null : String(flags.get('dev-run')) });
  } catch (error) {
    if (error?.code === BUDGET_EXHAUSTED_CODE) {
      process.stdout.write(`${['status investigation_budget_exhausted',
        `이 조사에서 이미 ${error.calls}번 호출했습니다. 확보한 근거로 답하고, 남은 일을 말해 주세요.`,
        ...error.summary].join('\n')}\n`);
      return 2;
    }
    throw error;
  }
  try {
    const answer = await readOriginal({ io, project, itemId, tools,
      unitId: flags.get('unit') === undefined || flags.get('unit') === true ? null : String(flags.get('unit')),
      maxChars: Number.parseInt(String(flags.get('max-chars') ?? DEFAULT_MAX_CHARACTERS), 10),
      wantAttachments: flags.get('attachments') === true,
      attachmentSelector, render: flags.get('render') === true,
      generationId: flags.get('generation') === undefined ? null : String(flags.get('generation')),
      bindingFile: String(flags.get('binding') ?? 'graph_index_binding.unified.json') });
    budget.finish(answer.attachment?.status ?? answer.status, answer.internal);
    process.stdout.write(flags.get('json') === true
      ? `${JSON.stringify({ ...answer, tools_config: { sha256: toolsSha256 }, budget: { bucket: budget.bucket, call: budget.call, remaining: budget.remaining } })}\n`
      : `${render(answer, { budget, toolsSha256, slide: slide === undefined || slide === true ? null : Number.parseInt(String(slide), 10) })}\n`);
    return 0;
  } catch (error) {
    budget.finish(String(error?.code ?? 'original_read_failed'));
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[estate-original-read] ${error?.code ?? 'original_read_failed'}\n`);
    process.exitCode = 2;
  });
}
