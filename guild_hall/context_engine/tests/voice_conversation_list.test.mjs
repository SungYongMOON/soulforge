// The conversation-list pipeline: what it refuses, what it falls back to, and
// what it will not claim.
//
// Every model answer here is scripted, because what is being tested is not
// whether a model is any good -- it is whether a bad answer can get through. So
// the scripts are deliberately wrong in the ways a model is wrong: a boundary
// that loses an utterance, a nature that names a project, a candidate whose only
// evidence is a word four projects share, a correction whose text is not where it
// said it was, and a rewrite of a sentence wearing a correction's shape.
//
// The recording is synthetic and every root is a fresh temp directory.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { conversationRow } from '../src/runtime/voice_session_read.mjs';
import {
  applyCorrections, attachUncovered, batchSegments, boundaryWindows, checkBoundaryProposal, checkCandidates,
  checkCorrection, checkNature, classifyClues, finalChecks, mergeDrafts, mergeNatureWindows, partialWindows,
  clueQuery, isStoplisted, looksLikeAnswer, looksLikeQuestion, loopUnitRatio, qaBoundarySuspects,
  qualityReport, readPipelineConfig,
  renderConversationTable, repeatRuns, repetitionRatio,
  rulesCoverage, runIdFor, searchableClues, secondsFromMilliseconds, segmentsNeedingRejudgement,
  stitchBoundaries, wholeMilliseconds,
} from '../src/runtime/voice_conversation_list.mjs';
import { runVoiceConversationCli } from '../harness/voice_conversation_list_cli.mjs';
import { readLedgerFile, runVoiceRouteCli } from '../harness/voice_route_cli.mjs';

const NOW = '2026-09-15T02:00:00.000Z';
const RUN = 'whispercpp_test_v1';
const SESSION = '20260101_090000_plaud_cli_testfixture';
const PROMPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'voice_conversation_list');
const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const code = fn => { try { fn(); return null; } catch (error) { return error.code; } };

// ------------------------------------------------------------- the recording
// Two conversations that meet at a question and its answer, then a third that
// starts a different subject. Written as the ASR lane writes them: fractional
// offsets, one row per utterance.
const SPEECH = [
  [1, 0, 7.4, '오늘은 가대 도면 수정본부터 보겠습니다.'],
  [2, 7.4, 15.82, '볼트 구멍 위치가 지난번 도면과 다릅니다.'],
  [3, 15.82, 24.1, '그러면 구멍 위치는 언제까지 확인해 주실 수 있나요?'],
  [4, 25.0, 33.5, '내일 오전까지 확인해서 회신드리겠습니다.'],
  [5, 40.0, 48.25, '다음은 케이블 포설 순서 이야기입니다.'],
  [6, 48.25, 57.82, '포설은 하부부터 올라오는 순서로 하겠습니다.'],
];
const rowOf = ([id, start, end, content], probability = 0.8) => ({
  schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: id, start_seconds: start,
  end_seconds: end, speaker: 'UNKNOWN', content, source: 'whisper_cpp_independent_local',
  analysis_run_id: RUN, chunk_index: 1,
  asr_confidence: { state: 'available_uncalibrated', token_probability_count: 20,
    mean_token_probability: probability, minimum_token_probability: 0.2, low_probability_token_count: 2 } });
const jsonl = rows => `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;

const unitOf = (id, ids, acts, disposition = 'material_ambiguity_deferred') => ({
  unit_id: id, source_segment_ids: [...ids],
  start_seconds: SPEECH.find(row => row[0] === ids[0])[1],
  end_seconds: SPEECH.find(row => row[0] === ids.at(-1))[2],
  speaker_label: 'UNKNOWN', content_sha256: 'a'.repeat(64), content_char_count: 10,
  speech_acts: [...acts], polarity: 'affirmed', modality: 'actual', action_codes: [], entities: [],
  project_match: { state: 'unresolved_needs_context', candidates: [] }, disposition });

const UNITS = [
  unitOf('unit_1_3', [1, 2, 3], ['open_question']),
  unitOf('unit_4_4', [4], ['commitment']),
  unitOf('unit_5_6', [5, 6], ['status_update'], 'context_only'),
];

/** One estate: a data root holding the recording, a control root, a derived root. */
async function estate({ rows = SPEECH.map(row => rowOf(row)), units = UNITS, suppressed = [],
  registry = null } = {}) {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-control-')));
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-derived-')));
  const sessionDir = path.join(dataRoot, 'ingress', 'plaud', 'sessions', '2026-01-01', SESSION);
  const runDir = path.join(sessionDir, 'analysis', 'local_asr', RUN);
  await mkdir(runDir, { recursive: true });
  const transcript = jsonl(rows);
  await writeFile(path.join(runDir, 'transcript.jsonl'), transcript);
  await writeFile(path.join(runDir, 'suppressed_segments.jsonl'), suppressed.length === 0 ? '' : jsonl(suppressed));
  await writeFile(path.join(runDir, 'analysis_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.local_asr_run.v0', session_id: SESSION, run_id: RUN, state: 'completed',
    segment_count: rows.length, transcript_sha256: hex(transcript),
    evidence_role: 'independent_machine_transcript_unverified', quality: 'machine_transcript_unverified',
    claim_ceiling: 'observed' }));
  await writeFile(path.join(sessionDir, 'transcript.jsonl'), jsonl(rows.map(row => ({ ...row,
    source: 'provider', analysis_run_id: undefined }))));
  await writeFile(path.join(sessionDir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: SESSION, source: 'plaud_cli_import',
    source_page_title: '합성 녹음', recorded_at_local: '2026-01-01T09:00:00+09:00', duration_seconds: 60,
    independent_transcription: { status: 'completed', run_id: RUN,
      evidence_role: 'independent_machine_transcript_unverified' } }));
  const labelDir = path.join(sessionDir, 'analysis', 'semantic_labels', 'vsl_testfixture0001');
  await mkdir(labelDir, { recursive: true });
  await writeFile(path.join(labelDir, 'semantic_label_run.json'), JSON.stringify({
    schema_version: 'soulforge.voice_semantic_label_run.v1', run_id: 'vsl_testfixture0001',
    recording_ref: { recording_id: SESSION, transcript_sha256: hex(transcript) },
    evidence_gate: { input_class: 'independent_asr_fast', state: 'stronger_local_asr_required',
      project_candidate_emission_allowed: false },
    segment_labels: units, review_windows: [], coverage: { semantic_unit_count: units.length },
    boundaries: { transcript_body_copied_to_output: false } }));

  const tablePath = path.join(controlRoot, 'root_table.json');
  const tableBytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  await writeFile(tablePath, tableBytes);
  const registryPath = path.join(controlRoot, 'shared_terms.v0.json');
  if (registry !== null) await writeFile(registryPath, JSON.stringify(registry));
  const toolsPath = path.join(controlRoot, 'tools.v0.json');
  await writeFile(toolsPath, JSON.stringify({ schema: 'soulforge.context_read_tools.v0',
    interpreter_path: path.join(controlRoot, 'python.exe'), soffice_path: path.join(controlRoot, 'soffice.exe'),
    python_packages: {}, formats: {}, max_attachment_bytes: 1024 * 1024,
    receipts_root: path.join(controlRoot, 'receipts'), derived_root: derivedRoot,
    ...(registry === null ? {} : { shared_terms_path: registryPath }) }));
  const configPath = path.join(controlRoot, 'voice_pipeline.v0.json');
  await writeFile(configPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { host: 'http://127.0.0.1:18080', model: 'test-model', transport: 'openai_chat', think: false,
      options: { temperature: 0, seed: 7, num_predict: 512 }, timeout_ms: 120000 },
    prompts_dir: PROMPTS, limits: { llm_calls: 60 } }));
  return { dataRoot, controlRoot, derivedRoot, sessionDir, tablePath, toolsPath, configPath, registryPath };
}

/**
 * A model that answers from a script. Every call is counted and bounded exactly
 * as the real client bounds it, so "the budget ran out" is a real event here.
 */
function scriptedChat(answer, { maxCalls = 60 } = {}) {
  const rows = [];
  return () => ({
    chat: async ({ step, user, schema }) => {
      const call = rows.length + 1;
      if (rows.filter(row => row.status !== 'budget_exhausted').length >= maxCalls) {
        rows.push({ call, step, status: 'budget_exhausted' });
        return { status: 'budget_exhausted' };
      }
      const value = answer({ step, user, call, schema });
      rows.push({ call, step, status: value === null ? 'invalid_json' : 'ok', elapsed_ms: 1 });
      return value === null ? { status: 'invalid_json' } : { status: 'ok', value };
    },
    trace: () => rows.map(row => ({ ...row })),
    model: { model: 'test-model' },
  });
}
const pin = async () => ({ digest: `sha256:${'b'.repeat(64)}`, pin_kind: 'server_props' });

const natureFor = ids => ({ segments: ids.map(id => ({ segment_id: id, nature: 'project_work',
  title: '가대 도면 확인', description: '도면 수정본의 볼트 구멍 위치를 확인하기로 함.',
  key_terms: [{ term: '가대', kind: 'equipment' }], unclear: false })) });
const idsInUser = user => [...user.matchAll(/^(\d+): /gmu)].map(match => Number(match[1]));
const segmentIdsInUser = user => [...user.matchAll(/\[(c\d{3})\]/gu)].map(match => match[1]);

/** The default script: the rules' own units as conversations, nothing corrected. */
const plainScript = ({ step, user }) => {
  if (step === 'boundary') {
    return { segments: [{ draft_id: 'd1', source_segment_ids: idsInUser(user), boundary_reason: 'topic_shift',
      related_draft_ids: [] }] };
  }
  if (step === 'boundary_recheck') return { verdict: 'separate', reason: '다른 안건이 시작된다' };
  if (step === 'nature') return natureFor(segmentIdsInUser(user));
  if (step === 'project') return { candidates: [], unclassified_reason: '근거가 없다' };
  return { proposals: [] };
};

const run = (dirs, script, options = {}) => runVoiceConversationCli(
  ['run', '--root-table', dirs.tablePath, '--tools-config', dirs.toolsPath,
    '--pipeline-config', dirs.configPath, '--session', SESSION],
  { chatFor: scriptedChat(script, options), pinFor: pin, now: NOW });

// =============================================================== step 1 rules

test('the rule-based draft is counted against the transcript rather than believed', () => {
  const rows = SPEECH.map(row => rowOf(row));
  const full = rulesCoverage({ rows, units: UNITS });
  assert.deepEqual([full.source_segment_count, full.covered_count, full.not_covered.length,
    full.duplicated.length, full.every_source_segment_accounted_for], [6, 6, 0, 0, true]);

  const partial = rulesCoverage({ rows, units: [unitOf('unit_1_3', [1, 2, 3], []), unitOf('unit_5_6', [5, 6], [])],
    suppressed: [rowOf([0, 12, 13, '반복된 말'])] });
  assert.deepEqual(partial.not_covered, [4], 'the utterance no rule reached is named, not counted as covered');
  assert.equal(partial.every_source_segment_accounted_for, false);
  assert.deepEqual(partial.suppressed_segment_ids, [0]);

  const twice = rulesCoverage({ rows, units: [unitOf('unit_1_3', [1, 2, 3], []), unitOf('unit_3_6', [3, 4, 5, 6], [])] });
  assert.deepEqual(twice.duplicated, [3], 'an utterance two units both claim is a duplicate, not a merge');
});

test('quality marks are the transcript’s own numbers, and disagreement between transcripts is one of them', () => {
  const rows = [rowOf(SPEECH[0]), rowOf([2, 7.4, 15.82, '같은 말 같은 말 같은 말 같은 말 같은 말'], 0.3),
    rowOf([3, 15.82, 40.1, '짧다'])];
  const report = qualityReport({ rows, providerRows: [rowOf(SPEECH[0])] });
  const marks = new Map(report.segments.map(row => [row.segment_id, row.marks]));
  assert.ok(marks.get(2).includes('hallucination_loop'), 'the same phrase over and over');
  assert.ok(marks.get(2).includes('low_confidence'), 'and decoded at worse than even odds');
  assert.ok(marks.get(3).includes('low_density'), '24 seconds of audio and two characters of text');
  assert.ok(marks.get(2).includes('provider_divergent'), 'the provider heard nothing like this here');
  assert.equal(marks.get(1).includes('provider_divergent'), false, 'and agreed here');
  assert.equal(report.transcript_kind, 'independent_fast');
  assert.ok(report.provider_local_token_overlap > 0 && report.provider_local_token_overlap < 1);
  assert.ok(repetitionRatio('가 나 다 가 나 다 가 나 다 가 나 다') > 0.6);
  assert.equal(repetitionRatio('가 나 다 라 마 바'), 0);
  // Every mark says why it is there, so a reader is not left to re-derive it.
  assert.deepEqual(report.segments[1].mark_reasons.map(row => row.reason).sort(),
    ['char_unit_repeat', 'mean_token_probability', 'ngram_repeat', 'window_jaccard'],
    'a phrase repeated with spaces is both a word loop and a character loop, and both are said');
});

test('a decoder stuck on one token with no spaces is a loop the word measure cannot see', () => {
  // One "word" as far as whitespace is concerned, and 3-gram repetition of zero.
  const stuck = '4,'.repeat(110);
  assert.equal(repetitionRatio(stuck), 0, 'the word-level measure sees nothing here');
  assert.ok(loopUnitRatio(stuck) >= 0.6, 'the character-level measure sees the two-character unit');
  assert.equal(loopUnitRatio('4,4,'), 0, 'too short to mean anything');
  assert.ok(loopUnitRatio('오늘은 가대 도면 수정본부터 보겠습니다 그리고 볼트 구멍 위치를 확인합니다') < 0.6,
    'an ordinary sentence is not a loop');
  // A loop that starts mid-unit is the same loop.
  assert.ok(loopUnitRatio(`x${'가나'.repeat(40)}`) >= 0.6);
  const report = qualityReport({ rows: [rowOf([1, 0, 30, stuck])] });
  assert.ok(report.segments[0].marks.includes('hallucination_loop'));
  assert.deepEqual(report.segments[0].mark_reasons.filter(row => row.mark === 'hallucination_loop')
    .map(row => row.reason), ['char_unit_repeat']);
});

test('three short utterances in a row that all say the same thing are all marked', () => {
  const rows = [rowOf([1, 0, 2, '네 알겠습니다']), rowOf([2, 2, 4, '네 알겠습니다']),
    rowOf([3, 4, 6, '알겠습니다 네']), rowOf([4, 6, 20, '이제 다른 안건으로 넘어가서 일정을 정하겠습니다'])];
  assert.deepEqual(repeatRuns(rows), [[1, 2, 3]]);
  const report = qualityReport({ rows });
  assert.deepEqual(report.segments.map(row => row.marks.includes('hallucination_loop')),
    [true, true, true, false], 'marking only one of them would leave a reader quoting the others');
  assert.equal(report.segments[0].mark_reasons.find(row => row.mark === 'hallucination_loop').reason, 'repeat_run');
  assert.deepEqual(repeatRuns([rows[0], rows[1], rows[3]]), [], 'two is not a run');
  assert.deepEqual(repeatRuns([rowOf([1, 0, 2, '가 나 다 라 마 바 사 아 자 차 카 타 파 하']),
    rowOf([2, 2, 4, '가 나 다 라 마 바 사 아 자 차 카 타 파 하']),
    rowOf([3, 4, 6, '가 나 다 라 마 바 사 아 자 차 카 타 파 하'])]), [],
  'a long utterance is a sentence somebody said, however often it recurs');
});

// =============================================================== step 2 rules

test('a boundary proposal that loses, repeats, invents or reverses an utterance is refused', () => {
  const window = { windowSegmentIds: [1, 2, 3, 4] };
  assert.equal(checkBoundaryProposal({ segments: [{ source_segment_ids: [1, 2] },
    { source_segment_ids: [3, 4] }] }, window).ok, true);
  assert.equal(checkBoundaryProposal({ segments: [{ source_segment_ids: [1, 2] }] }, window).code,
    'boundary_segment_missing', 'an utterance in no conversation is an utterance nobody can find again');
  assert.equal(checkBoundaryProposal({ segments: [{ source_segment_ids: [1, 2, 3] },
    { source_segment_ids: [3, 4] }] }, window).code, 'boundary_segment_repeated');
  assert.equal(checkBoundaryProposal({ segments: [{ source_segment_ids: [1, 2, 3, 4, 9] }] }, window).code,
    'boundary_segment_outside_window');
  assert.equal(checkBoundaryProposal({ segments: [{ source_segment_ids: [3, 4] },
    { source_segment_ids: [1, 2] }] }, window).code, 'boundary_not_monotonic');
  assert.equal(checkBoundaryProposal({ segments: [] }, window).code, 'boundary_shape_invalid');
});

test('the window that was asked first keeps the utterance the two windows disagree about', () => {
  const stitched = stitchBoundaries([
    { window_index: 0, segments: [{ draft_id: 'd1', source_segment_ids: [1, 2, 3] }] },
    { window_index: 1, segments: [{ draft_id: 'd1', source_segment_ids: [3, 4] },
      { draft_id: 'd2', source_segment_ids: [5, 6] }] }]);
  assert.deepEqual(stitched.map(draft => draft.source_segment_ids), [[1, 2, 3], [4], [5, 6]]);
  assert.ok(stitched[1].boundary_reasons.includes('overlap_conflict'), 'and says the two windows disagreed');
  assert.deepEqual(stitched.map(draft => draft.draft_key), ['w0:d1', 'w1:d1', 'w1:d2']);
});

test('an utterance no rule reached joins the conversation before it, and says a code put it there', () => {
  const drafts = [{ source_segment_ids: [1, 2], boundary_reasons: ['topic_shift'], qa_boundary: 'none',
    processed_in_windows: 1, draft_key: 'w0:d1', related_draft_keys: [] }];
  const attached = attachUncovered(drafts, [3]);
  assert.deepEqual(attached.drafts[0].source_segment_ids, [1, 2, 3]);
  assert.ok(attached.drafts[0].boundary_reasons.includes('attached_by_code'));
  assert.deepEqual([attached.attached, attached.uncovered_draft], [1, null]);
  assert.deepEqual(drafts[0].source_segment_ids, [1, 2], 'the drafts handed in are not modified');

  const orphaned = attachUncovered(drafts, [0]);
  assert.deepEqual(orphaned.drafts[0].source_segment_ids, [0]);
  assert.deepEqual(orphaned.drafts[0].boundary_reasons, ['rules_uncovered'],
    'an utterance with nothing before it becomes its own conversation rather than being dropped');
});

test('a question cut from its answer is a boundary to look at again, not one to merge on sight', () => {
  const rows = new Map(SPEECH.map(row => [row[0], rowOf(row)]));
  const units = new Map();
  for (const unit of UNITS) for (const id of unit.source_segment_ids) units.set(id, unit);
  const drafts = [{ source_segment_ids: [1, 2, 3], boundary_reasons: ['topic_shift'], qa_boundary: 'none',
    processed_in_windows: 1, draft_key: 'w0:d1', related_draft_keys: [] },
  { source_segment_ids: [4], boundary_reasons: ['topic_shift'], qa_boundary: 'none', processed_in_windows: 1,
    draft_key: 'w0:d2', related_draft_keys: [] },
  { source_segment_ids: [5, 6], boundary_reasons: ['topic_shift'], qa_boundary: 'none', processed_in_windows: 1,
    draft_key: 'w0:d3', related_draft_keys: [] }];
  const found = qaBoundarySuspects(drafts, { unitFor: id => units.get(id), rowFor: id => rows.get(id) });
  assert.deepEqual(found.map(row => row.index), [0], 'a question then a commitment 0.9s later');
  assert.ok(found[0].triggers.includes('speech_acts'));
  assert.ok(found[0].gap_seconds < 1);
  const merged = mergeDrafts(drafts, 0);
  assert.deepEqual(merged.map(draft => draft.source_segment_ids), [[1, 2, 3, 4], [5, 6]]);
  assert.equal(merged[0].qa_boundary, 'merged');

  // The same pair with a long silence between them is not a suspect at all.
  const far = new Map(rows);
  far.set(4, { ...rows.get(4), start_seconds: 300, end_seconds: 310 });
  assert.deepEqual(qaBoundarySuspects(drafts, { unitFor: id => units.get(id), rowFor: id => far.get(id) }), []);
});

test('a question and an answer are recognised by how they are written, not only by what the labeller called them', () => {
  for (const question of ['언제까지 될까요?', '언제까지 되나요', '그거 확인했죠', '어디에 있나']) {
    assert.equal(looksLikeQuestion(question), true, question);
  }
  for (const statement of ['내일 갑니다', '확인했습니다', '수요일입니다', '']) {
    assert.equal(looksLikeQuestion(statement), false, statement);
  }
  for (const answer of ['네 알겠습니다', '어, 그건요', '아니요 안 됩니다', '그럼 그렇게 하죠', '일단 정리하겠습니다',
    '아 그거요', '맞습니다', '그렇게 하겠습니다']) assert.equal(looksLikeAnswer(answer), true, answer);
  for (const other of ['어제 갔습니다', '수요일에 갑니다', '어디에 있나']) {
    assert.equal(looksLikeAnswer(other), false, `${other} — a one-syllable opener has to be the whole word`);
  }

  // The labeller here emits no answer-side speech act at all, which is why the
  // speech-act trigger alone never fires on a real recording.
  const rows = new Map([[1, { segment_id: 1, content: '그 일정은 언제까지 될까요', start_seconds: 0, end_seconds: 5 }],
    [2, { segment_id: 2, content: '네 내일까지 하겠습니다', start_seconds: 6, end_seconds: 10 }],
    [3, { segment_id: 3, content: '다음 안건으로 넘어가겠습니다', start_seconds: 60, end_seconds: 66 }]]);
  const units = new Map([[1, { speech_acts: ['status_update'] }], [2, { speech_acts: ['status_update'] }],
    [3, { speech_acts: ['status_update'] }]]);
  const draft = ids => ({ source_segment_ids: ids, boundary_reasons: ['topic_shift'], qa_boundary: 'none',
    processed_in_windows: 1, draft_key: `w0:d${ids[0]}`, related_draft_keys: [] });
  const found = qaBoundarySuspects([draft([1]), draft([2]), draft([3])],
    { unitFor: id => units.get(id), rowFor: id => rows.get(id) });
  assert.deepEqual(found.map(row => [row.index, row.triggers]), [[0, ['text']]],
    'the text trigger sees what the speech acts did not say');
  // The same pair with a long silence between them is not a suspect.
  const far = new Map(rows);
  far.set(2, { ...rows.get(2), start_seconds: 300, end_seconds: 310 });
  assert.deepEqual(qaBoundarySuspects([draft([1]), draft([2])],
    { unitFor: id => units.get(id), rowFor: id => far.get(id) }), []);
});

test('a window is bounded by units and by characters, and it overlaps the one before it', () => {
  const units = Array.from({ length: 20 }, (_, index) => ({ unit_id: `u${index}`, source_segment_ids: [index + 1] }));
  const windows = boundaryWindows(units, { maxUnits: 8, maxCharacters: 6000, overlap: 1, textOf: () => '가'.repeat(10) });
  assert.deepEqual(windows.map(window => window.units.length), [8, 8, 6]);
  assert.deepEqual([windows[0].segment_ids.at(-1), windows[1].segment_ids[0]], [8, 8],
    'the last unit of one window is the first unit of the next, so no boundary falls between two calls');
  const narrow = boundaryWindows(units, { maxUnits: 8, maxCharacters: 25, overlap: 1, textOf: () => '가'.repeat(10) });
  assert.ok(narrow[0].units.length <= 3, 'the character bound binds before the unit bound does');
});

// =============================================================== step 3 rules

test('a nature answer is checked against the text it claims to summarise', () => {
  const text = '가대 도면 수정본을 확인했습니다';
  const ok = checkNature({ nature: 'project_work', title: '가대 도면 확인', description: '확인하기로 함',
    key_terms: [{ term: '가대', kind: 'equipment' }, { term: '없는말', kind: 'board' }], unclear: false },
  { text });
  assert.deepEqual([ok.ok, ok.key_terms, ok.dropped_key_terms], [true, ['가대'], 1],
    'a key term that is not in the text is not a key term of the text');
  assert.deepEqual(ok.key_terms_typed, [{ term: '가대', kind: 'equipment' }],
    'what a term names travels with it, because that is what decides whether a project may be searched by it');
  const untyped = checkNature({ nature: 'project_work', title: 't', description: '',
    key_terms: ['가대', { term: '도면', kind: 'nonsense' }] }, { text: '가대 도면' });
  assert.deepEqual(untyped.key_terms_typed, [{ term: '가대', kind: 'other' }, { term: '도면', kind: 'other' }],
    'an untyped or unknown kind is `other`, not a refusal: the word was still said');
  assert.equal(checkNature({ nature: 'project_work', title: 'AB-123 도면 확인', description: '', key_terms: [] },
    { text }).code, 'nature_title_names_a_project',
  'naming a project is step 4, which has evidence rules this step does not');
  assert.equal(checkNature({ nature: 'meeting', title: 't', description: '', key_terms: [] }, { text }).code,
    'nature_unknown');
  assert.equal(checkNature({ nature: 'project_work', title: '가'.repeat(41), description: '', key_terms: [] },
    { text }).code, 'nature_title_too_long');

  // Two promotions that are not suggestions.
  const hard = checkNature({ nature: 'project_work', title: 't', description: '', key_terms: [] },
    { text, unreadableRatio: 0.8 });
  assert.deepEqual([hard.nature, hard.marks], ['unreadable', ['unreadable_ratio']],
    'a conversation nobody could make out is unreadable whatever it looked like');
  const chatty = checkNature({ nature: 'personal', title: 't', description: '', key_terms: [] },
    { text, speechActs: ['deadline_mention'] });
  assert.deepEqual([chatty.nature, chatty.marks], ['mixed', ['personal_with_material_acts']],
    'a deadline in it means it is not only small talk');
});

test('a long conversation is answered in windows and the windows are put back together', () => {
  const rows = new Map(SPEECH.map(row => [row[0], rowOf(row)]));
  const windows = partialWindows([1, 2, 3, 4, 5, 6], { textOf: id => rows.get(id).content,
    rowFor: id => rows.get(id), maxCharacters: 45, maxSeconds: 600 });
  assert.ok(windows.length > 1, 'a conversation over the input bound is cut for processing');
  assert.deepEqual(windows.flat(), [1, 2, 3, 4, 5, 6], 'and nothing is lost between the windows');

  const byTime = partialWindows([1, 2, 3, 4, 5, 6], { textOf: id => rows.get(id).content,
    rowFor: id => rows.get(id), maxCharacters: 100000, maxSeconds: 20 });
  assert.ok(byTime.length > 1, 'ten minutes is a processing bound too, not only a character count');

  const merged = mergeNatureWindows([
    { nature: 'project_work', title: '앞', description: '앞부분', key_terms: ['가대'], unclear: false, marks: [] },
    { nature: 'team_operations', title: '뒤', description: '뒷부분', key_terms: ['케이블'], unclear: false, marks: [] }]);
  assert.deepEqual([merged.nature, merged.key_terms, merged.processed_in_windows],
    ['mixed', ['가대', '케이블'], 2]);
  assert.ok(merged.marks.includes('windows_disagree'), 'two windows that disagree is a fact about the answer');
  const agreed = mergeNatureWindows([
    { nature: 'project_work', title: '앞', description: 'a', key_terms: [], unclear: false, marks: [] },
    { nature: 'project_work', title: '뒤', description: 'b', key_terms: [], unclear: false, marks: [] }]);
  assert.deepEqual([agreed.nature, agreed.marks], ['project_work', []]);
});

test('short conversations share a call and a long one gets its own', () => {
  const held = [{ id: 'a', n: 400 }, { id: 'b', n: 400 }, { id: 'c', n: 400 }, { id: 'd', n: 400 },
    { id: 'e', n: 400 }, { id: 'f', n: 5000 }];
  const batches = batchSegments(held, { charactersOf: row => row.n, maxCharacters: 2000, maxSegments: 4 });
  assert.deepEqual(batches.map(batch => batch.map(row => row.id)), [['a', 'b', 'c', 'd'], ['e'], ['f']],
    'four conversations at most per call, and one over the bound never travels with another');
});

// =============================================================== step 4 rules

const REGISTRY = { schema: 'soulforge.context_shared_terms.v0', generated_at: NOW, generation_refs: [], terms: [
  { term: '케이블', normalized: '케이블', projects: ['S00-001', 'S00-002'], observed_projects: ['S00-001', 'S00-002'],
    declared_projects: [], mention_count: 9, source: 'graph', declared_shared: false, category: 'content' },
  { term: '가대', normalized: '가대', projects: ['S00-001'], observed_projects: ['S00-001'],
    declared_projects: [], mention_count: 4, source: 'graph', declared_shared: false, category: 'content' },
  { term: 'Status Change', normalized: 'status change', projects: ['S00-001', 'S00-002'],
    observed_projects: ['S00-001', 'S00-002'], declared_projects: [], mention_count: 30, source: 'graph',
    declared_shared: false, category: 'workflow' }] };

test('a shared word and the tracker’s own wording are never what a project is searched by', () => {
  const clues = classifyClues('케이블 포설과 가대 도면, Status Change 알림, 그리고 XG보정판 확인',
    REGISTRY, { keyTerms: [{ term: 'XG보정판', kind: 'board' }], entities: [] });
  const byTerm = new Map(clues.map(clue => [clue.term, clue]));
  assert.deepEqual([byTerm.get('케이블').kind, byTerm.get('가대').kind], ['shared', 'distinctive']);
  assert.equal(byTerm.get('Status Change').category, 'workflow');
  assert.equal(byTerm.get('XG보정판').kind, 'unregistered');
  const searchable = searchableClues(clues, { limit: 5 }).map(clue => clue.term);
  assert.deepEqual(searchable, ['XG보정판', '가대'],
    'the shared word and the workflow word are dropped; what a word names ranks it above what the registry knows');
});

test('relative time and the generic nouns of doing work are never searched with', () => {
  // What the labelling run offers here is what it actually emits on this estate:
  // dates and a person, neither of which says which project anything belongs to.
  const clues = classifyClues('다음 주 시험 일정을 확인하고 XG보정판 작업을 합니다', REGISTRY, {
    keyTerms: [{ term: '다음 주', kind: 'other' }, { term: '시험', kind: 'test' },
      { term: '일정', kind: 'other' }, { term: 'XG보정판', kind: 'board' }],
    entities: [{ kind: 'date_or_period', value: '다음 주' }, { kind: 'person_mention', value: '아무개' },
      { kind: 'measured_value', value: '12개' }] });
  const byTerm = new Map(clues.map(clue => [clue.term, clue]));
  assert.equal(byTerm.has('아무개'), false, 'a person mention does not name a thing, so it is not a clue');
  assert.equal(byTerm.has('12개'), false, 'and neither does a measured value');
  assert.equal(byTerm.get('다음 주').stoplisted, true);
  assert.deepEqual(searchableClues(clues, { limit: 8 }).map(clue => clue.term), ['XG보정판'],
    'the only word left that can narrow anything');
  assert.deepEqual([isStoplisted('다음 주'), isStoplisted('  다음   주 '), isStoplisted('화요일'),
    isStoplisted('XG보정판')], [true, true, true, false]);

  // An entity kind that does name a thing is a clue, when a labeller emits one.
  const named = classifyClues('보정판 확인', REGISTRY,
    { entities: [{ kind: 'equipment', value: '보정판' }] });
  assert.deepEqual(named.map(clue => [clue.term, clue.term_kind, clue.origins]), [['보정판', 'equipment', ['entity']]]);
  assert.deepEqual(classifyClues('보정판 확인', REGISTRY, { entities: ['보정판'] }), [],
    'an entity with no declared kind is not shown to name a thing');
});

test('a person’s name is searched after a thing’s name, and the query is bounded', () => {
  const clues = classifyClues('가나다 담당자와 XG보정판, 구미현장 이야기', REGISTRY, {
    keyTerms: [{ term: '가나다', kind: 'person' }, { term: 'XG보정판', kind: 'board' },
      { term: '구미현장', kind: 'place' }, { term: '담당자', kind: 'other' }] });
  assert.deepEqual(searchableClues(clues, { limit: 8 }).map(clue => clue.term),
    ['XG보정판', '구미현장', '가나다', '담당자'],
    'things first, then a person, then a word nobody typed');
  const long = Array.from({ length: 40 }, (_, index) => ({ term: `용어${String(index).padStart(3, '0')}` }));
  const bounded = clueQuery(long, { maxCharacters: 30 });
  assert.ok([...bounded.query].length <= 30, 'a longer query is a wider net, not a better one');
  assert.ok(bounded.used.length < long.length);
  assert.equal(clueQuery([{ term: '가'.repeat(80) }], { maxCharacters: 30 }).used.length, 1,
    'one clue longer than the bound is still the query, because dropping it would search with nothing');
});

test('a candidate whose only evidence is a word several projects use is not weak, it is unclassified', () => {
  const clues = [{ term: '케이블', kind: 'shared', category: 'content' },
    { term: '가대', kind: 'distinctive', category: 'content' },
    { term: 'XG보정판', kind: 'unregistered', category: 'content' }];
  const rows = [
    { row_id: 1, project_code: 'S00-002', matched_terms: ['케이블'] },
    { row_id: 2, project_code: 'S00-001', matched_terms: ['가대'] },
    { row_id: 3, project_code: 'S00-003', matched_terms: ['XG보정판'] }];
  const answer = checkCandidates({ candidates: [
    { project_code: 'S00-002', evidence_row_ids: [1], basis: ['board'], strength: 'strong' },
    { project_code: 'S00-001', evidence_row_ids: [2], basis: ['equipment'], strength: 'strong' },
    { project_code: 'S00-003', evidence_row_ids: [3], basis: ['equipment'], strength: 'strong' },
    { project_code: 'S00-009', evidence_row_ids: [], basis: ['purpose'], strength: 'weak' }],
  unclassified_reason: null }, { evidenceRows: rows, clues });
  const byCode = new Map(answer.candidates.map(row => [row.project_code, row]));
  assert.equal(byCode.has('S00-002'), false, 'found only by a word two projects share');
  assert.equal(byCode.has('S00-009'), false, 'and one with no evidence row at all is not a candidate');
  assert.equal(byCode.get('S00-001').strength, 'strong', 'a term one project uses, with a stated basis');
  assert.equal(byCode.get('S00-003').strength, 'weak',
    'a word the registry has never seen cannot make a candidate strong, however specific it sounds');
  assert.deepEqual(answer.downgraded.map(row => row.code), ['shared_terms_only', 'no_evidence_row']);

  const twoBasis = checkCandidates({ candidates: [{ project_code: 'S00-003', evidence_row_ids: [3],
    basis: ['equipment', 'follow_up_record'], strength: 'strong' }] }, { evidenceRows: rows, clues });
  assert.equal(twoBasis.candidates[0].strength, 'strong', 'two kinds of basis is the other way to be strong');

  const none = checkCandidates({ candidates: [{ project_code: 'S00-002', evidence_row_ids: [1],
    basis: [], strength: 'weak' }] }, { evidenceRows: rows, clues });
  assert.deepEqual([none.candidates, none.unclassified_reason], [[], 'shared_terms_only']);
});

// =============================================================== step 5 rules

test('a correction has to be where the model said it was, and may not restring the sentence', () => {
  const text = '그 부품은 수요일에 반님됩니다';
  const ok = checkCorrection({ source_segment_id: 1, char_offset: 11, original: '반님', proposed: '반입',
    reason: 'term_glossary', confidence: 'medium' }, { text });
  assert.deepEqual([ok.status, ok.char_offset, ok.needs_audio_recheck, ok.evidence],
    ['proposed', 11, false, 'context_inference']);

  assert.equal(checkCorrection({ original: '반님', proposed: '반입', char_offset: 3, reason: 'term_glossary' },
    { text }).code, 'position_mismatch', 'the offset does not hold that text');
  assert.equal(checkCorrection({ original: '없는말', proposed: 'x', reason: 'other' }, { text }).code,
    'position_mismatch');
  assert.equal(checkCorrection({ original: '수', proposed: '주', reason: 'homophone' },
    { text: '수요일 수정본 수신' }).code, 'position_ambiguous',
  'three places it could be, and this module does not pick one');
  assert.equal(checkCorrection({ original: '반님', proposed: '반님', reason: 'other' }, { text }).code, 'no_change');
  assert.equal(checkCorrection({ original: '반님', proposed: '반입', reason: '오타' }, { text }).code, 'reason_unknown');
  assert.equal(checkCorrection({ original: '반님', proposed: '반입 예정입니다', reason: 'other' }, { text }).code,
    'rewrite_refused', 'three times the length is a rewrite, not a correction');
  assert.equal(checkCorrection({ original: '반님', proposed: '그 부품은 수요일 오전에 반입될 예정으로 확인되었습니다',
    reason: 'other' }, { text }).code, 'rewrite_refused');

  // A wrong name or number is not more doubtful, it is not settleable from text.
  for (const reason of ['person_name', 'number_unit', 'date_deadline', 'part_number', 'negation',
    'completion_state', 'cancellation']) {
    assert.equal(checkCorrection({ original: '반님', proposed: '반입', char_offset: 11, reason,
      confidence: 'high' }, { text }).needs_audio_recheck, true, `${reason} always goes back to the audio`);
  }

  // Correcting a word that is already right is reported and demoted, not discarded:
  // a reader has to be able to see that the model wanted to change a known term.
  const known = checkCorrection({ original: '반님', proposed: '반입', char_offset: 11, reason: 'term_glossary',
    confidence: 'high' }, { text, knownTerms: ['반님'] });
  assert.deepEqual([known.status, known.confidence, known.original_is_known_term], ['proposed', 'low', true]);
  assert.equal(applyCorrections(text, [ok]), '그 부품은 수요일에 반입됩니다');
});

test('a conversation is judged again only when a confident correction moved a word it was judged on', () => {
  const segment = { segment_id: 'c001', source_segment_ids: [1], key_terms: ['반님'],
    corrections: [{ source_segment_id: 1, char_offset: 12, original: '반님', proposed: '반입', confidence: 'high' }] };
  assert.deepEqual(segmentsNeedingRejudgement([segment],
    { correctedTextOf: () => '그 부품은 수요일에 반입됩니다' }).map(row => row.segment_id), ['c001']);
  assert.deepEqual(segmentsNeedingRejudgement([{ ...segment, key_terms: ['부품'] }],
    { correctedTextOf: () => '그 부품은 수요일에 반입됩니다' }), [], 'the words it was judged on are still there');
  assert.deepEqual(segmentsNeedingRejudgement([{ ...segment,
    corrections: [{ ...segment.corrections[0], confidence: 'low' }] }],
  { correctedTextOf: () => '그 부품은 수요일에 반입됩니다' }), [], 'a guess does not reopen a judgement');
});

// =============================================================== step 7 rules

test('the checks say what is wrong instead of hiding it', () => {
  const rows = SPEECH.map(row => rowOf(row));
  const good = [{ segment_id: 'c001', source_segment_ids: [1, 2, 3], start_ms: 0, nature: 'project_work',
    status: 'candidate', title: '가대 도면' },
  { segment_id: 'c002', source_segment_ids: [4, 5, 6], start_ms: 25000, nature: 'idea', status: 'unclassified',
    title: '케이블 순서' }];
  assert.ok(finalChecks({ segments: good, rows }).every(check => check.status === 'ok'));

  const lost = finalChecks({ segments: [good[0]], rows });
  assert.equal(lost.find(check => check.check === 'every_utterance_in_one_conversation').status, 'failed');
  const named = finalChecks({ segments: [good[0], { ...good[1], title: 'AB-123 케이블' }], rows });
  assert.equal(named.find(check => check.check === 'no_project_code_in_a_title').status, 'failed');
  const decided = finalChecks({ segments: [good[0], { ...good[1], status: 'confirmed' }], rows });
  assert.equal(decided.find(check => check.check === 'nothing_confirmed_by_a_pipeline').status, 'failed');
  assert.equal(decided.find(check => check.check === 'every_conversation_has_a_nature_and_a_status').status, 'failed');
});

test('a fractional offset survives the trip through milliseconds', () => {
  for (const seconds of [0, 57.82, 121.48, 1238.72, 0.001]) {
    assert.equal(secondsFromMilliseconds(wholeMilliseconds(seconds)), seconds);
  }
  assert.equal(wholeMilliseconds(57.8249), 57825);
  assert.equal(code(() => wholeMilliseconds(-1)), 'voice_conversation_time_invalid');
  assert.equal(code(() => secondsFromMilliseconds(1.5)), 'voice_conversation_time_invalid');
});

test('the same inputs name the same run, and a different anything names a different one', () => {
  const parts = { sessionId: SESSION, transcript: { run_id: RUN, sha256: 'a'.repeat(64) },
    semanticRun: { run_id: 'vsl_1', sha256: 'b'.repeat(64) }, prompts: { boundary: 'c'.repeat(64) },
    model: { digest: 'sha256:d', pin_kind: 'server_props', alias: 'test-model' }, configSha256: 'e'.repeat(64) };
  const first = runIdFor(parts);
  assert.match(first, /^vcl_[0-9a-f]{16}$/u);
  assert.equal(runIdFor({ ...parts }), first);
  for (const changed of [{ sessionId: 'other' }, { transcript: { run_id: RUN, sha256: 'f'.repeat(64) } },
    { prompts: { boundary: '0'.repeat(64) } }, { configSha256: '1'.repeat(64) },
    { model: { ...parts.model, digest: 'sha256:x' } }]) {
    assert.notEqual(runIdFor({ ...parts, ...changed }), first, `${Object.keys(changed)[0]} changes the run`);
  }
});

test('the configuration is read rather than assumed, and an unknown bound is a typo', () => {
  const config = readPipelineConfig(Buffer.from(JSON.stringify({
    schema: 'soulforge.voice_conversation_pipeline.v0', model: { host: 'http://127.0.0.1:1', model: 'm' },
    prompts_dir: '/x', limits: { llm_calls: 12 } })));
  assert.deepEqual([config.limits.llm_calls, config.limits.boundary_units], [12, 8]);
  const bad = body => code(() => readPipelineConfig(Buffer.from(JSON.stringify(body))));
  assert.equal(bad({ schema: 'other' }), 'voice_pipeline_config_schema_unknown');
  assert.equal(bad({ schema: 'soulforge.voice_conversation_pipeline.v0', model: {}, prompts_dir: '/x' }),
    'voice_pipeline_config_invalid');
  assert.equal(bad({ schema: 'soulforge.voice_conversation_pipeline.v0', model: { host: 'h', model: 'm' },
    prompts_dir: '/x', limits: { llm_call: 5 } }), 'voice_pipeline_config_limit_unknown');
  assert.equal(bad({ schema: 'soulforge.voice_conversation_pipeline.v0', model: { host: 'h', model: 'm' },
    prompts_dir: '/x', limits: { llm_calls: 200 } }), 'voice_pipeline_config_budget_too_large');
});

// ================================================================ end to end

test('a recording becomes a conversation list, and every utterance is in exactly one conversation', async () => {
  const dirs = await estate({ registry: REGISTRY });
  const answer = await run(dirs, plainScript);
  assert.match(answer.run_id, /^vcl_[0-9a-f]{16}$/u);
  const list = JSON.parse(await readFile(path.join(answer.directory, 'conversation_list.v0.json'), 'utf8'));
  assert.equal(list.schema, 'soulforge.voice_conversation_list.v0');
  assert.deepEqual(list.segments.flatMap(row => row.source_segment_ids).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.ok(list.segments.every(row => row.status === 'unclassified'),
    'no binding was opened, so no conversation has evidence and none is a candidate');
  assert.ok(list.segments.every(row => row.derived_summary === true));
  assert.equal(list.verified, true);
  // The interval is carried both ways and the fractional value is the one the ASR wrote.
  const last = list.segments.at(-1);
  assert.deepEqual([last.end_seconds, last.end_ms], [57.82, 57820]);
  assert.match(last.clock, /^2026-01-01T09:0/u);
  assert.ok(list.checks.every(check => check.status === 'ok'));
  // And the files a person reads.
  const files = await readdir(answer.directory);
  for (const name of ['conversation_list.md', 'corrections_before_after.md', 'run_manifest.json',
    'quality.v0.json', 'corrections.v0.json']) assert.ok(files.includes(name), name);
  const table = await readFile(path.join(answer.directory, 'conversation_list.md'), 'utf8');
  assert.match(table, /파생 요약/u, 'the table says the titles are derived on the page itself');
  // A reviewer can see what was searched with, not only what came back.
  const clueTable = list.segments[0].clue_table;
  assert.ok(Array.isArray(clueTable) && clueTable.length > 0);
  assert.deepEqual(Object.keys(clueTable[0]).sort(),
    ['category', 'kind', 'origin', 'searched', 'stoplisted', 'term', 'term_kind']);
  assert.deepEqual(list.segments[0].key_terms_typed, [{ term: '가대', kind: 'equipment' }]);
});

test('the output row is the row the read CLI already knows how to show', async () => {
  const dirs = await estate();
  const answer = await run(dirs, plainScript);
  const list = JSON.parse(await readFile(path.join(answer.directory, 'conversation_list.v0.json'), 'utf8'));
  const shown = conversationRow(list.segments[0], '2026-01-01T09:00:00+09:00');
  assert.equal(shown.conversation_id, 'c001');
  assert.equal(shown.clock_matches, true, 'the clock the file declares is the clock the reader computes');
  assert.deepEqual([shown.derived_summary, shown.status], [true, 'unclassified']);
  assert.deepEqual(shown.refs.source_segment_ids, list.segments[0].source_segment_ids);
  assert.equal(shown.title, list.segments[0].title);
});

test('a boundary answer that cannot be checked falls back to the rules and says so', async () => {
  const dirs = await estate();
  const answer = await run(dirs, ({ step, user }) => step === 'boundary'
    ? { segments: [{ draft_id: 'd1', source_segment_ids: idsInUser(user).slice(0, 1), boundary_reason: 'topic_shift' }] }
    : plainScript({ step, user }));
  const list = JSON.parse(await readFile(path.join(answer.directory, 'conversation_list.v0.json'), 'utf8'));
  assert.deepEqual(list.segments.map(row => row.source_segment_ids), [[1, 2, 3], [4], [5, 6]],
    'the semantic units the rules already drew');
  assert.ok(list.remaining_work.some(row => row.step === 'boundary' && row.reason === 'boundary_segment_missing'));
  assert.equal(list.verified, false, 'a fallback is written, and it is not called verified');
  assert.deepEqual(list.segments.flatMap(row => row.source_segment_ids).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6],
    'and the fallback still holds every utterance');
});

test('a suspect Q/A boundary is merged, kept or left suspect by what the recheck answered', async () => {
  const split = user => {
    const ids = idsInUser(user);
    return { segments: [{ draft_id: 'd1', source_segment_ids: ids.filter(id => id <= 3), boundary_reason: 'topic_shift' },
      { draft_id: 'd2', source_segment_ids: ids.filter(id => id === 4), boundary_reason: 'qa_closure' },
      { draft_id: 'd3', source_segment_ids: ids.filter(id => id >= 5), boundary_reason: 'topic_shift' }]
      .filter(segment => segment.source_segment_ids.length > 0) };
  };
  const verdicts = { same_conversation: [[1, 2, 3, 4], [5, 6]], separate: [[1, 2, 3], [4], [5, 6]],
    unclear: [[1, 2, 3], [4], [5, 6]] };
  for (const [verdict, expected] of Object.entries(verdicts)) {
    const dirs = await estate();
    const answer = await run(dirs, ({ step, user }) => step === 'boundary' ? split(user)
      : (step === 'boundary_recheck' ? { verdict, reason: 'r' } : plainScript({ step, user })));
    const list = JSON.parse(await readFile(path.join(answer.directory, 'conversation_list.v0.json'), 'utf8'));
    assert.deepEqual(list.segments.map(row => row.source_segment_ids), expected, verdict);
    const boundary = JSON.parse(await readFile(path.join(answer.directory, 'run_manifest.json'), 'utf8')).boundary;
    assert.equal(boundary.qa_suspects, 1);
    assert.deepEqual([boundary.qa_merged, boundary.qa_still_suspect],
      verdict === 'same_conversation' ? [1, 0] : [0, 1]);
    assert.equal(list.segments[0].boundary.qa_boundary, verdict === 'same_conversation' ? 'merged' : 'suspect',
      'an unresolved suspicion stays on the record rather than being resolved by merging');
  }
});

test('an utterance the rules never reached is attached and counted, and the list still adds up', async () => {
  const dirs = await estate({ units: [unitOf('unit_1_3', [1, 2, 3], ['open_question']),
    unitOf('unit_5_6', [5, 6], ['status_update'])] });
  const answer = await run(dirs, plainScript);
  const list = JSON.parse(await readFile(path.join(answer.directory, 'conversation_list.v0.json'), 'utf8'));
  assert.deepEqual(list.segments.flatMap(row => row.source_segment_ids).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6],
    'utterance 4 is in the list even though no rule reached it');
  const holder = list.segments.find(row => row.source_segment_ids.includes(4));
  assert.ok(holder.boundary.reasons.includes('attached_by_code'), 'and the list says a code put it there');
  const manifest = JSON.parse(await readFile(path.join(answer.directory, 'run_manifest.json'), 'utf8'));
  assert.deepEqual([manifest.coverage.not_covered, manifest.boundary.uncovered_attached], [[4], 1]);
  assert.equal(manifest.coverage.every_source_segment_accounted_for, false,
    'the rules did not account for everything, and the run says so rather than smoothing it over');
});

test('a corrected word is checked against the utterance, and a rewrite never reaches the file', async () => {
  const dirs = await estate({ registry: REGISTRY });
  const answer = await run(dirs, ({ step, user }) => step === 'correction'
    ? { proposals: [
      { source_segment_id: 2, char_offset: 0, original: '볼트', proposed: '볼드', reason: 'term_glossary', confidence: 'medium' },
      { source_segment_id: 2, original: '없는낱말', proposed: 'x', reason: 'other', confidence: 'high' },
      { source_segment_id: 1, original: '가대', proposed: '가대 구조물 전체를 다시 확인해야 합니다', reason: 'other', confidence: 'low' },
      { source_segment_id: 99, original: '가대', proposed: '거치대', reason: 'other', confidence: 'low' }] }
    : plainScript({ step, user }));
  const corrections = JSON.parse(await readFile(path.join(answer.directory, 'corrections.v0.json'), 'utf8'));
  assert.deepEqual(corrections.proposals.map(row => [row.source_segment_id, row.original, row.proposed]),
    [[2, '볼트', '볼드']]);
  assert.deepEqual(corrections.discarded.map(row => row.code).sort(),
    ['position_mismatch', 'rewrite_refused', 'utterance_not_in_segment']);
  assert.equal(corrections.proposals[0].evidence, 'context_inference',
    'this pipeline does not listen to anything, so nothing in it is audio-verified');
  const list = JSON.parse(await readFile(path.join(answer.directory, 'conversation_list.v0.json'), 'utf8'));
  assert.equal(list.segments.find(row => row.source_segment_ids.includes(2)).quality.correction_state,
    'machine_proposed');
  // The transcript on disk is untouched; the corrected reading exists in the table only.
  const transcript = await readFile(path.join(dirs.sessionDir, 'analysis', 'local_asr', RUN, 'transcript.jsonl'), 'utf8');
  assert.ok(transcript.includes('볼트 구멍'), 'and the transcript still says what it said');
  const table = await readFile(path.join(answer.directory, 'corrections_before_after.md'), 'utf8');
  assert.match(table, /문맥 추정/u);
});

test('correcting a word the registry knows is reported and demoted rather than accepted', async () => {
  const dirs = await estate({ registry: REGISTRY });
  const answer = await run(dirs, ({ step, user }) => step === 'correction'
    ? { proposals: [{ source_segment_id: 5, original: '케이블', proposed: '케이불', reason: 'term_glossary',
      confidence: 'high' }] }
    : plainScript({ step, user }));
  const corrections = JSON.parse(await readFile(path.join(answer.directory, 'corrections.v0.json'), 'utf8'));
  assert.deepEqual([corrections.proposals[0].confidence, corrections.proposals[0].original_is_known_term],
    ['low', true]);
  assert.equal(corrections.counts.known_term_overrides, 1, 'and how often that happened is counted');
});

test('a run that spends its budget writes what it has, says what is left, and is not verified', async () => {
  const dirs = await estate();
  const answer = await run(dirs, plainScript, { maxCalls: 1 });
  const list = JSON.parse(await readFile(path.join(answer.directory, 'conversation_list.v0.json'), 'utf8'));
  assert.equal(list.verified, false);
  assert.ok(list.remaining_work.length > 0, 'what did not get done is named rather than left as a gap');
  assert.ok(list.remaining_work.some(row => row.reason === 'llm_budget_exhausted'));
  assert.deepEqual(list.segments.flatMap(row => row.source_segment_ids).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6],
    'a run that ran out of calls still accounts for every utterance');
  const manifest = JSON.parse(await readFile(path.join(answer.directory, 'run_manifest.json'), 'utf8'));
  assert.equal(manifest.calls.budget_exhausted, true);
});

test('the same recording run twice asks the model nothing the second time', async () => {
  const dirs = await estate({ registry: REGISTRY });
  const first = await run(dirs, plainScript);
  const before = await readFile(path.join(first.directory, 'conversation_list.v0.json'), 'utf8');
  assert.ok(first.calls.total > 0);

  const again = await run(dirs, () => { throw new Error('the model must not be asked again'); });
  assert.equal(again.run_id, first.run_id, 'the same inputs are the same run');
  assert.deepEqual([again.calls.total, again.calls.cache_hits], [0, first.calls.total]);
  // A pass that asks nothing must not overwrite the record of what the first
  // pass cost: "the run took no calls" is not true of the run.
  const manifest = JSON.parse(await readFile(path.join(again.directory, 'run_manifest.json'), 'utf8'));
  assert.deepEqual(manifest.passes.map(row => [row.pass, row.calls, row.cache_hits]),
    [[1, first.calls.total, 0], [2, 0, first.calls.total]]);
  const jsonl = await readFile(path.join(again.directory, 'run_passes.jsonl'), 'utf8');
  assert.equal(jsonl.trim().split(String.fromCharCode(10)).length, 2,
    'one line per pass, appended and never rewritten');
  const after = await readFile(path.join(again.directory, 'conversation_list.v0.json'), 'utf8');
  assert.equal(hex(Buffer.from(after)), hex(Buffer.from(before)),
    'and the same answer, byte for byte, including when it was first made');
});

test('a second pass finishes what an exhausted budget left, without paying for it twice', async () => {
  const dirs = await estate();
  const short = await run(dirs, plainScript, { maxCalls: 2 });
  assert.ok(short.remaining_work.length > 0);
  const finished = await run(dirs, plainScript);
  assert.equal(finished.run_id, short.run_id);
  assert.equal(finished.calls.cache_hits, 2, 'the two answers already paid for are not asked again');
  assert.deepEqual(finished.remaining_work, [], 'and the rest is done');
  assert.equal(finished.verified, true);
});

test('the run manifest says what the run actually did, in numbers a reader can check', async () => {
  const dirs = await estate({ registry: REGISTRY });
  const answer = await run(dirs, plainScript);
  const manifest = JSON.parse(await readFile(path.join(answer.directory, 'run_manifest.json'), 'utf8'));
  assert.deepEqual([manifest.calls.budget, manifest.limits.llm_calls], [60, 60]);
  assert.equal(manifest.calls.total, manifest.trace.filter(row => row.status === 'ok').length);
  assert.equal(manifest.model.pin_kind, 'server_props');
  assert.equal(manifest.model.alias, 'test-model');
  assert.equal(Object.keys(manifest.prompts).length, 5, 'every prompt that could change the answer is pinned');
  assert.deepEqual([manifest.counts.segments, manifest.counts.unclassified], [1, 1],
    'the script answered one conversation for the whole window, and the manifest counts what happened');
  assert.equal(manifest.counts.project_mixed, 0);
  assert.equal(manifest.projects.opened.length, 0, 'this estate has no bindings, and the manifest says so');
  assert.ok(Object.hasOwn(manifest.quality.counts, 'hallucination_loop'));
  assert.equal(manifest.transcript.rows, 6);
});

test('the list reaches the ledger as proposals a person can decide on, and never as a decision', async () => {
  const dirs = await estate({ registry: REGISTRY });
  const answer = await run(dirs, ({ step, user }) => step === 'boundary'
    ? { segments: [{ draft_id: 'd1', source_segment_ids: idsInUser(user).filter(id => id <= 4),
      boundary_reason: 'topic_shift' },
    { draft_id: 'd2', source_segment_ids: idsInUser(user).filter(id => id > 4), boundary_reason: 'topic_shift' }] }
    : plainScript({ step, user }));
  const routesDir = path.join(dirs.controlRoot, 'voice-routes');
  await mkdir(routesDir, { recursive: true });
  const where = ['--session', SESSION, '--run', answer.run_id, '--routes-dir', routesDir,
    '--tools-config', dirs.toolsPath, '--by', 'actor:owner', '--now', NOW];

  // A rehearsal writes nothing at all.
  const dry = runVoiceRouteCli(['import', ...where, '--dry']);
  assert.deepEqual([dry.dry, dry.added, dry.file_sha256], [true, 2, null]);
  assert.deepEqual(await readdir(routesDir), [], 'a rehearsal leaves the folder as it was');

  const first = runVoiceRouteCli(['import', ...where]);
  assert.deepEqual([first.added, first.confirmed], [2, 0]);
  assert.deepEqual([first.candidate, first.unclassified], [0, 2],
    'no binding was opened, so every conversation arrives unplaced');
  const ledger = readLedgerFile(routesDir, SESSION).ledger;
  assert.deepEqual(ledger.segments.map(row => row.segment_id), ['c001', 'c002']);
  assert.deepEqual(ledger.segments.map(row => row.source_segment_ids), [[1, 2, 3, 4], [5, 6]],
    'the utterances travel with the conversation, which is what makes it addressable');
  assert.ok(ledger.segments.every(row => row.status !== 'confirmed'));
  assert.ok(ledger.segments.every(row => row.derived_summary === true));
  assert.deepEqual(ledger.segments[0].draft_source, { kind: 'conversation_list', run_id: answer.run_id,
    unit_id: 'c001' }, 'the ledger says which run proposed this');
  assert.deepEqual(ledger.segments[0].transcript_ref, ['analysis', 'local_asr', RUN]);
  assert.equal(ledger.segments[0].quality.correction_state, 'none',
    'the pipeline proposed corrections; it corrected nothing, and the ledger says what is true');
  assert.equal(ledger.segments[0].end_seconds >= 33.5, true, 'the interval covers the whole conversation');

  // The same run twice changes nothing, and a person's decision in between is
  // not reopened by a later import.
  const second = runVoiceRouteCli(['import', ...where]);
  assert.deepEqual([second.added, second.kept], [0, 2]);
  runVoiceRouteCli(['confirm', '--session', SESSION, '--segment', 'c001', '--routes-dir', routesDir,
    '--project', 'S00-001', '--basis', '사람이 들어 보고 판단함', '--title', '가대 도면 확인',
    '--nature', 'project_work', '--quality', 'independent_fast', '--by', 'actor:owner', '--now', NOW]);
  const third = runVoiceRouteCli(['import', ...where]);
  assert.deepEqual([third.added, third.confirmed], [0, 1], 'an import never reopens a decision');
});

test('a conversation list from another recording, or a run that is not there, is refused', async () => {
  const dirs = await estate();
  const answer = await run(dirs, plainScript);
  const routesDir = path.join(dirs.controlRoot, 'voice-routes');
  await mkdir(routesDir, { recursive: true });
  const base = ['--routes-dir', routesDir, '--tools-config', dirs.toolsPath, '--by', 'actor:owner', '--now', NOW];
  assert.throws(() => runVoiceRouteCli(['import', '--session', SESSION, '--run', 'vcl_0000000000000000', ...base]),
    /voice_conversation_list_absent/u);
  assert.throws(() => runVoiceRouteCli(['import', '--session', SESSION, '--run', 'not-a-run', ...base]),
    /voice_route_run_invalid/u);
  assert.throws(() => runVoiceRouteCli(['import', '--session', SESSION, '--run', answer.run_id,
    '--routes-dir', routesDir, '--tools-config', dirs.toolsPath, '--now', NOW]), /voice_route_actor_required/u);
});

test('a table renders without a model and says on its face what it is', () => {
  const list = { session_id: SESSION, run_id: 'vcl_0000000000000000', generated_at: NOW, verified: false,
    transcript: { run_id: RUN, kind: 'independent_fast' }, checks: [{ check: 'x', status: 'failed', detail: 'd' }],
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 15.82,
      clock: '2026-01-01T09:00:00+09:00', clock_end: '2026-01-01T09:00:16+09:00', title: '가대 도면',
      description: '설명', nature: 'project_work', nature_unclear: false,
      project_candidates: [{ project_code: 'S00-001', strength: 'weak', basis: ['equipment'], evidence_row_ids: [1] }],
      unclassified_reason: null, quality: { marks: ['low_confidence'], correction_state: 'none' },
      boundary: { qa_boundary: 'suspect', processed_in_windows: 2 } }],
    evidence_rows: [{ row_id: 1, project_code: 'S00-001', item_id: 'i', unit_id: 'u', source_kind: 'mail',
      quote: '인용', matched_terms: ['가대'] }] };
  const table = renderConversationTable(list);
  assert.match(table, /확정은 사람이 합니다/u);
  assert.match(table, /S00-001 weak \[equipment\] 근거 1행/u);
  assert.match(table, /Q\/A suspect/u);
  assert.match(table, /\| x \| failed \| d \|/u);
});
