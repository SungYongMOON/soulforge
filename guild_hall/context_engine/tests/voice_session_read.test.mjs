// Reading an unclassified voice session back, window by window, over a synthetic
// inbox.
//
// The fixture is a small inbox rather than a stub: two root classes, a sessions
// tree with a date folder, a session manifest, a provider transcript, an
// independent local run beside it, and the two things this tool must never
// return -- an audio file and the provider's quarantined summary -- sitting in
// the folder where a careless read would pick them up. Nothing here touches
// collected material: every root is a fresh temp directory and no host path
// appears in this file.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRootTable, ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { buildSemanticUnits, clockAt, readInboxAccess, readVoiceSession, VOICE_ACCESS_SCHEMA,
  VOICE_READ_STATUSES } from '../src/runtime/voice_session_read.mjs';
import { renderVoice } from '../harness/estate_original_read.mjs';

const SESSION = '20260102_090000_synthetic_aaaa1111';
const DATE = '2026-01-02';
const RECORDED = '2026-01-02T09:00:00+09:00';
const RUN = 'whispercpp_synthetic_run';
const SECRET_SUMMARY = '요약본에만 있는 문장입니다-절대-나오면-안-됨';
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

const segment = (id, start, end, speaker, content) => JSON.stringify({
  schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: id, start_seconds: start,
  end_seconds: end, speaker, content, source: 'synthetic' });

// Two chains over the same recording: the provider's, with speaker labels, and
// the independent local run, which has none. Both carry the same intervals so a
// test can tell which one answered by what the rows say.
const PROVIDER = [segment(1, 0, 30, '발언자A', '첫 번째 공급자 구간입니다.'),
  segment(2, 30, 70, '발언자B', '두 번째 공급자 구간입니다.'),
  segment(3, 700, 760, '발언자A', '창 밖에 있는 공급자 구간입니다.')].join('\n') + '\n';
const LOCAL = [segment(11, 0.4, 29.8, 'UNKNOWN', `로컬 첫 구간. ${'가'.repeat(120)}`),
  segment(12, 30.2, 69.6, 'UNKNOWN', `로컬 둘째 구간. ${'나'.repeat(120)}`),
  segment(13, 700.1, 759.9, 'UNKNOWN', '로컬 셋째 구간은 창 밖입니다.')].join('\n') + '\n';

const sessionManifest = ({ localRun = true, duration = 900 } = {}) => ({
  schema_version: 'soulforge.voice_capture_session.v0', session_id: SESSION, source: 'synthetic_import',
  source_page_title: '합성 세션 — 과제 미분류', recorded_at_local: RECORDED, duration_seconds: duration,
  audio: { status: 'source_present', ref: 'sessions/x/audio/source.mp3' },
  transcript: { status: 'provider_transcript_present_unverified', evidence_role: 'auxiliary_unverified',
    quality: 'provider_machine_transcript_unverified', segment_count: 3,
    time_basis: 'seconds_from_recording_start_rounded_by_provider_cli' },
  provider_summary: { status: 'provider_output_present_untrusted', evidence_role: 'quarantined_untrusted' },
  speaker_diarization: { status: 'provider_labels_present_unverified', labels: ['발언자A', '발언자B'],
    warning: 'Provider labels are alignment hints, not verified human identities.' },
  canonicalization: { state: 'independent_transcript_ready_project_match_and_review_required',
    plaud_transcript_is_canonical: false },
  meeting_context: { meeting_type: 'unclassified_voice_recording' },
  ...(localRun ? { independent_transcription: { status: 'completed', run_id: RUN,
    evidence_role: 'independent_machine_transcript_unverified', segment_count: 3 } } : {}),
});

const runManifest = ({ state = 'completed', digest } = {}) => ({
  schema_version: 'soulforge.local_asr_run.v0', session_id: SESSION, run_id: RUN, engine: 'whisper.cpp',
  model_id: 'synthetic-model', state, segment_count: 3,
  transcript_sha256: digest.replace('sha256:', ''),
  evidence_role: 'independent_machine_transcript_unverified',
  quality: 'machine_transcript_unverified_attention_required', claim_ceiling: 'observed' });

// A labelling run in the shape the real engine writes: units over the
// transcript it names, review windows that point at those units, and an
// evidence gate that says whether it may put a project on anything.
const labelRun = ({ runId = 'vsl_synthetic_run', transcriptDigest, units, windows = null,
  projectEmission = false } = {}) => ({
  schema_version: 'soulforge.voice_semantic_label_run.v1', run_id: runId,
  recording_ref: { recording_id: SESSION, transcript_sha256: transcriptDigest.replace('sha256:', ''),
    evidence_role: 'independent_machine_transcript_unverified' },
  engine: { engine_id: 'soulforge_voice_semantic_baseline', engine_version: '1.10.9',
    mode: 'transcript_only_rules', claim_ceiling: 'machine_generated_reviewable' },
  evidence_gate: { input_class: 'independent_asr_fast', state: 'stronger_local_asr_required',
    reason_codes: ['independent_fast_asr_quality_requires_attention'],
    action_candidate_emission_allowed: false, project_candidate_emission_allowed: projectEmission,
    next_step: 'run_stronger_local_asr_on_material_windows' },
  recording_classification: { type_candidate: 'unknown' },
  context: { missing_context_kinds: ['project_context_cards'] },
  segment_labels: units, action_candidates: [],
  review_windows: windows ?? units.map((unit, index) => ({ window_id: `vrw_${index}`,
    start_seconds: unit.start_seconds, duration_seconds: unit.end_seconds - unit.start_seconds,
    source_unit_refs: [unit.unit_id], importance_state: 'material_ambiguity_candidate',
    importance_reason_codes: ['speech_act_conditional_statement'],
    escalation_state: 'stronger_local_asr_required', human_listen_required: false })),
  project_resolution: { state: 'stronger_local_asr_required', candidates: [] },
  coverage: { source_segment_count: 3, covered_source_segment_count: 3,
    semantic_unit_count: units.length, labeled_semantic_unit_count: units.length },
});

const unitLabel = ({ id, segmentIds, start, end, characters, entities = [] }) => ({
  unit_id: id, source_segment_ids: segmentIds, start_seconds: start, end_seconds: end,
  speaker_label: 'UNKNOWN', content_char_count: characters, speech_acts: ['conditional_statement'],
  polarity: 'affirmed', modality: 'conditional', action_codes: [], entities,
  project_match: { state: 'unresolved_needs_context', candidates: [] },
  disposition: 'material_ambiguity_deferred' });

/** One inbox: two roots, a sessions tree, and the declaration that opens it. */
async function makeInbox({ localRun = true, runState = 'completed', declaredDigest = null, localRows = LOCAL,
  access = { max_seconds_per_call: 600, max_characters_per_call: 12000 }, duplicate = false } = {}) {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-voice-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-voice-control-')));
  const roots = { data_root: dataRoot, control_root: controlRoot };
  const put = async (address, bytes) => {
    const alias = address.slice(0, address.indexOf('/'));
    const target = path.join(roots[alias], address.slice(alias.length + 1));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  };
  const folder = `data_root/ingress/plaud/sessions/${DATE}/${SESSION}`;
  await put(`${folder}/session_manifest.json`, json(sessionManifest({ localRun, duration: 900 })));
  await put(`${folder}/transcript.jsonl`, Buffer.from(PROVIDER));
  await put(`${folder}/transcript.txt`, Buffer.from('공급자 평문 전사'));
  // The two things a read must never return, in the place a careless read would find them.
  await put(`${folder}/audio/source.mp3`, Buffer.from('not audio, but in the audio place'));
  await put(`${folder}/provider_export/summary.md`, Buffer.from(SECRET_SUMMARY));
  if (localRun) {
    const bytes = Buffer.from(localRows);
    await put(`${folder}/analysis/local_asr/${RUN}/transcript.jsonl`, bytes);
    await put(`${folder}/analysis/local_asr/${RUN}/analysis_manifest.json`,
      json(runManifest({ state: runState, digest: declaredDigest ?? sha(bytes) })));
  }
  if (duplicate) {
    await put(`data_root/ingress/plaud/sessions/2026-01-03/${SESSION}/session_manifest.json`,
      json(sessionManifest({ localRun: false })));
  }
  if (access !== null) {
    await put('control_root/voice-routes/inbox_access.v0.json', json({ schema: VOICE_ACCESS_SCHEMA,
      actor_ref: 'actor:owner:context-reader', purpose: 'voice_route_review',
      root: 'data_root/ingress/plaud/sessions', granted_by: 'synthetic', ...access }));
  }
  const tableDir = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-voice-table-')));
  const tablePath = path.join(tableDir, 'roots.json');
  const tableBytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA, roots })}\n`);
  await writeFile(tablePath, tableBytes);
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: sha(tableBytes) }));
  return { io, dataRoot, controlRoot, tableDir, put, folder,
    localDigest: sha(Buffer.from(localRows)), providerDigest: sha(Buffer.from(PROVIDER)),
    cleanup: () => Promise.all([dataRoot, controlRoot, tableDir].map(dir => rm(dir, { recursive: true, force: true }))) };
}

const read = (io, extra = {}) => readVoiceSession({ io, sessionId: SESSION, now: '2026-02-01T00:00:00.000Z', ...extra });

test('무선언 인박스는 읽히지 않는다 — access_denied이고 구간이 0개다', async () => {
  const inbox = await makeInbox({ access: null });
  try {
    const answer = await read(inbox.io);
    assert.equal(answer.status, 'access_denied');
    assert.equal(answer.access.declared, false);
    assert.equal(answer.access.granted, false);
    assert.equal(answer.session, null);
    assert.equal(answer.transcript, null);
    assert.deepEqual(answer.segments, []);
    assert.equal(answer.counts.characters_shown, 0);
  } finally { await inbox.cleanup(); }
});

test('선언이 다른 actor·purpose를 가리키면 선언이 있어도 거부한다', async () => {
  for (const [field, value] of [['actor_ref', 'actor:someone:else'], ['purpose', 'other_purpose'],
    ['revoked', true], ['expires_at', '2026-01-01T00:00:00.000Z']]) {
    const inbox = await makeInbox({ access: { max_seconds_per_call: 600, [field]: value } });
    try {
      const answer = await read(inbox.io);
      assert.equal(answer.status, 'access_denied', `${field} should close the inbox`);
      assert.equal(answer.access.declared, true);
      assert.match(answer.detail, /access declaration/u);
    } finally { await inbox.cleanup(); }
  }
});

test('선언의 창·글자 상한이 모양을 못 갖추면 거부한다', async () => {
  for (const access of [{ max_seconds_per_call: 0 }, { max_seconds_per_call: 600, max_characters_per_call: 4 }]) {
    const inbox = await makeInbox({ access });
    try { assert.equal((await read(inbox.io)).status, 'access_denied'); } finally { await inbox.cleanup(); }
  }
});

test('기본은 독립 로컬 ASR run이고, 머리에 evidence_role과 claim_ceiling이 붙는다', async () => {
  const inbox = await makeInbox();
  try {
    const answer = await read(inbox.io);
    assert.equal(answer.status, 'ok');
    assert.equal(answer.transcript.kind, 'local');
    assert.equal(answer.transcript.run_id, RUN);
    assert.equal(answer.transcript.evidence_role, 'independent_machine_transcript_unverified');
    assert.equal(answer.transcript.claim_ceiling, 'observed');
    assert.equal(answer.transcript.sha256_matches, true);
    assert.equal(answer.session.title, '합성 세션 — 과제 미분류');
    assert.equal(answer.session.meeting_type, 'unclassified_voice_recording');
    assert.equal(answer.session.speaker_labels_are_identities, false);
    // The clock is the recording's own offset applied to the segment's offset.
    assert.equal(answer.segments[0].clock, '09:00:00');
    assert.equal(answer.segments[1].clock, '09:00:30');
    assert.equal(answer.session.recorded_clock, '2026-01-02 09:00:00 KST');
    assert.ok(VOICE_READ_STATUSES.includes(answer.status));
  } finally { await inbox.cleanup(); }
});

test('--transcript provider는 공급자 전사를 고르고 speaker 라벨을 그대로 전한다', async () => {
  const inbox = await makeInbox();
  try {
    const answer = await read(inbox.io, { transcriptKind: 'provider' });
    assert.equal(answer.transcript.kind, 'provider');
    assert.equal(answer.transcript.run_id, null);
    assert.equal(answer.transcript.evidence_role, 'auxiliary_unverified');
    assert.equal(answer.transcript.claim_ceiling, null, 'provider chain declares no ceiling');
    assert.equal(answer.transcript.canonical, false);
    assert.equal(answer.segments[0].speaker, '발언자A');
    assert.equal(answer.segments[0].segment_id, 1);
  } finally { await inbox.cleanup(); }
});

test('--from/--to는 겹치는 구간만 남기고 나머지는 세지도 않는다', async () => {
  const inbox = await makeInbox();
  try {
    const answer = await read(inbox.io, { from: 40, to: 200 });
    assert.equal(answer.counts.in_window, 1);
    assert.deepEqual(answer.segments.map(row => row.segment_id), [12]);
    assert.equal(answer.window.from, 40);
    assert.equal(answer.window.to, 200);
    assert.equal(answer.window.clamped, false);
    assert.equal(answer.next_window, null);
    const empty = await read(inbox.io, { from: 200, to: 400 });
    assert.equal(empty.status, 'window_without_speech');
    assert.equal(empty.counts.in_window, 0);
  } finally { await inbox.cleanup(); }
});

test('선언 상한보다 넓은 창은 잘리고, 답이 이어 읽을 자리를 말한다', async () => {
  const inbox = await makeInbox({ access: { max_seconds_per_call: 60, max_characters_per_call: 12000 } });
  try {
    const answer = await read(inbox.io);
    assert.equal(answer.window.to, 60);
    assert.equal(answer.window.requested_to, 900);
    assert.equal(answer.window.clamped, true);
    assert.deepEqual(answer.next_window, { from: 60, to: 120, reason: 'window_bound' });
    assert.deepEqual(answer.segments.map(row => row.segment_id), [11, 12]);
  } finally { await inbox.cleanup(); }
});

test('글자 상한에 걸리면 그 구간이 잘렸다고 말하고 그 자리에서 이어 읽게 한다', async () => {
  const inbox = await makeInbox();
  try {
    const answer = await read(inbox.io, { maxChars: 140 });
    assert.equal(answer.window.max_characters, 140);
    assert.equal(answer.segments[0].truncated, false);
    assert.equal(answer.segments[1].truncated, true);
    assert.ok(answer.segments[1].shown < answer.segments[1].characters);
    assert.equal(answer.counts.characters_shown, 140);
    assert.equal(answer.next_window.reason, 'character_bound');
    assert.equal(answer.next_window.from, 30);
    // A caller may lower the declared bound and never raise it.
    const raised = await read(inbox.io, { maxChars: 200000 });
    assert.equal(raised.window.max_characters, 12000);
  } finally { await inbox.cleanup(); }
});

test('로컬 run이 없으면 기본은 공급자로 내려오고 왜인지 말한다 — 그러나 local을 명시하면 거부한다', async () => {
  const inbox = await makeInbox({ localRun: false });
  try {
    const fallback = await read(inbox.io);
    assert.equal(fallback.status, 'ok');
    assert.equal(fallback.transcript.kind, 'provider');
    assert.match(fallback.transcript.fallback_reason, /independent run/u);
    const asked = await read(inbox.io, { transcriptKind: 'local' });
    assert.equal(asked.status, 'transcript_unavailable');
    assert.equal(asked.transcript, null);
  } finally { await inbox.cleanup(); }
});

test('끝나지 않은 로컬 run은 완료된 것처럼 읽지 않는다', async () => {
  const inbox = await makeInbox({ runState: 'running' });
  try {
    assert.equal((await read(inbox.io, { transcriptKind: 'local' })).status, 'transcript_unavailable');
  } finally { await inbox.cleanup(); }
});

test('run이 선언한 판본과 파일이 다르면 revision_mismatch로 두 값을 다 보여 준다', async () => {
  const inbox = await makeInbox({ declaredDigest: sha(Buffer.from('another transcript entirely')) });
  try {
    const answer = await read(inbox.io);
    assert.equal(answer.status, 'revision_mismatch');
    assert.equal(answer.transcript.sha256_matches, false);
    assert.notEqual(answer.transcript.declared_sha256, answer.transcript.sha256);
    assert.ok(answer.segments.length > 0, 'the read continues with what is actually there');
  } finally { await inbox.cleanup(); }
});

test('없는 세션은 비슷한 것으로 바꿔 답하지 않고, 같은 id가 둘이면 고르지 않는다', async () => {
  const inbox = await makeInbox();
  try {
    const missing = await readVoiceSession({ io: inbox.io, sessionId: '20260102_090000_synthetic_zzzz9999',
      now: '2026-02-01T00:00:00.000Z' });
    assert.equal(missing.status, 'session_not_found');
    assert.equal(missing.session, null);
  } finally { await inbox.cleanup(); }
  const twice = await makeInbox({ duplicate: true });
  try {
    assert.equal((await read(twice.io)).status, 'session_ambiguous');
  } finally { await twice.cleanup(); }
});

test('세션 id·창·전사 종류의 모양이 아니면 그 자리에서 멈춘다', async () => {
  const inbox = await makeInbox();
  try {
    const cases = [[{ sessionId: '../escape' }, 'voice_session_id_invalid'],
      [{ sessionId: 'a/b' }, 'voice_session_id_invalid'],
      [{ transcriptKind: 'strong' }, 'voice_transcript_kind_invalid'],
      [{ from: 90, to: 30 }, 'voice_window_invalid'], [{ from: -1 }, 'voice_window_invalid'],
      [{ maxChars: 4 }, 'voice_max_chars_invalid']];
    for (const [extra, code] of cases) {
      await assert.rejects(() => read(inbox.io, extra), error => error.code === code, JSON.stringify(extra));
    }
  } finally { await inbox.cleanup(); }
});

test('오디오도 공급자 요약도 어떤 출력에도 실리지 않는다', async () => {
  const inbox = await makeInbox();
  try {
    const answer = await read(inbox.io);
    const text = renderVoice(answer, { budget: { call: 1, remaining: 5, bucket: 'dev' },
      toolsSha256: sha(Buffer.from('tools')) });
    for (const carrier of [JSON.stringify(answer), text]) {
      assert.ok(!carrier.includes(SECRET_SUMMARY), 'the quarantined summary never travels');
      assert.ok(!carrier.includes('source.mp3'), 'the audio is never named');
      assert.ok(!carrier.includes(inbox.dataRoot), 'no host path leaves the tool');
      assert.ok(!carrier.includes(inbox.controlRoot), 'no host path leaves the tool');
    }
    assert.match(text, /status ok/u);
    assert.match(text, /claim_ceiling observed/u);
    assert.match(text, /정렬 힌트/u);
    assert.match(text, /\[이어 읽기\] --from 600 --to 900/u);
  } finally { await inbox.cleanup(); }
});

test('선언 읽기는 그 자체로 답이다 — 무엇이 막았는지 한 줄로 돌려준다', async () => {
  const inbox = await makeInbox({ access: null });
  try {
    const denial = readInboxAccess({ io: inbox.io });
    assert.equal(denial.granted, false);
    assert.equal(denial.declared, false);
    assert.equal(denial.detail, 'no inbox access declaration');
  } finally { await inbox.cleanup(); }
});

test('시계는 녹음의 선언된 offset을 쓴다 — +09:00이 아니면 KST라고 적지 않는다', () => {
  assert.deepEqual(clockAt('2026-01-02T09:00:00+09:00', 3661).clock, '10:01:01');
  assert.equal(clockAt('2026-01-02T09:00:00+09:00', 0).label, 'KST');
  assert.equal(clockAt('2026-01-02T09:00:00+00:00', 0).label, 'UTC+00:00');
  assert.equal(clockAt('2026-01-02T09:00:00-05:00', 0).label, 'UTC-05:00');
});

// ---------------------------------------------------------------- 구간 초안
// The labelling run's draft intervals: read when they were made over the very
// transcript that answered, and never borrowed from another chain.

const contentOf = (rows, id) => JSON.parse(rows.trim().split('\n')
  .find(row => JSON.parse(row).segment_id === id)).content;

const LOCAL_UNITS = [
  unitLabel({ id: 'unit_11_11', segmentIds: [11], start: 0.4, end: 29.8,
    characters: [...contentOf(LOCAL, 11)].length,
    entities: [{ kind: 'artifact_mention', value: '설계문서', role_label: null }] }),
  unitLabel({ id: 'unit_12_12', segmentIds: [12], start: 30.2, end: 69.6,
    characters: [...contentOf(LOCAL, 12)].length }),
  unitLabel({ id: 'unit_13_13', segmentIds: [13], start: 700.1, end: 759.9,
    characters: [...contentOf(LOCAL, 13)].length }),
];

const hostPath = (inbox, address) => path.join(inbox.dataRoot, address.slice('data_root/'.length));

async function withLabels(options = {}, run = null) {
  const inbox = await makeInbox(options);
  const built = run ?? labelRun({ transcriptDigest: inbox.localDigest, units: LOCAL_UNITS });
  await inbox.put(`${inbox.folder}/analysis/semantic_labels/${built.run_id}/semantic_label_run.json`, json(built));
  return inbox;
}

test('--units는 라벨 run의 구간 초안으로 답하고, 그 초안이 초안임을 머리가 말한다', async () => {
  const inbox = await withLabels();
  try {
    const answer = await read(inbox.io, { units: true });
    assert.equal(answer.status, 'ok');
    assert.equal(answer.units.status, 'ok');
    assert.equal(answer.counts.basis, 'semantic_units');
    assert.equal(answer.segments.length, 0, 'units replace raw segments rather than doubling them');
    assert.equal(answer.units.claim_ceiling, 'machine_generated_reviewable');
    assert.equal(answer.units.evidence_gate.input_class, 'independent_asr_fast');
    assert.equal(answer.units.evidence_gate.state, 'stronger_local_asr_required');
    assert.equal(answer.units.evidence_gate.project_candidate_emission_allowed, false);
    const first = answer.units.rows[0];
    assert.equal(first.unit_id, 'unit_11_11');
    assert.equal(first.characters_match, true, 'the run counted the same text this read assembled');
    assert.equal(first.project_match.state, 'unresolved_needs_context');
    assert.equal(first.disposition, 'material_ambiguity_deferred');
    assert.equal(first.window.importance_state, 'material_ambiguity_candidate');
    assert.equal(first.window.escalation_state, 'stronger_local_asr_required');
    assert.equal(first.clock, '09:00:00');
    assert.equal(first.clock_end, '09:00:29');
    assert.deepEqual(first.entities.map(entity => entity.kind), ['artifact_mention']);
  } finally { await inbox.cleanup(); }
});

test('창에 걸친 구간 초안은 잘라 보여 주지 않고 통째로 보여 준다', async () => {
  const inbox = await withLabels();
  try {
    // The window opens at 40s; unit_12 starts at 30.2s and is shown whole.
    const answer = await read(inbox.io, { units: true, from: 40, to: 200 });
    assert.deepEqual(answer.units.rows.map(row => row.unit_id), ['unit_12_12']);
    assert.equal(answer.units.rows[0].start_seconds, 30.2);
    assert.equal(answer.units.rows[0].truncated, false);
  } finally { await inbox.cleanup(); }
});

test('다른 전사로 만든 라벨 run은 쓰지 않고 원 전사 구간으로 내려온다', async () => {
  const inbox = await withLabels();
  try {
    const answer = await read(inbox.io, { units: true, transcriptKind: 'provider' });
    assert.equal(answer.units.status, 'labels_other_revision');
    assert.equal(answer.counts.basis, 'transcript_segments');
    assert.ok(answer.segments.length > 0, 'the read still answers, with the segments it did read');
    assert.equal(answer.units.rows.length, 0);
  } finally { await inbox.cleanup(); }
});

test('라벨 run이 없으면 원 전사 구간으로 답하고 왜인지 말한다', async () => {
  const inbox = await makeInbox();
  try {
    const answer = await read(inbox.io, { units: true });
    assert.equal(answer.units.status, 'labels_absent');
    assert.equal(answer.counts.basis, 'transcript_segments');
    assert.ok(answer.segments.length > 0);
  } finally { await inbox.cleanup(); }
});

test('같은 전사를 가리키는 라벨 run이 둘이면 고르지 않는다', async () => {
  const inbox = await withLabels();
  try {
    const second = labelRun({ runId: 'vsl_synthetic_other', transcriptDigest: inbox.localDigest, units: LOCAL_UNITS });
    await inbox.put(`${inbox.folder}/analysis/semantic_labels/${second.run_id}/semantic_label_run.json`, json(second));
    const answer = await read(inbox.io, { units: true });
    assert.equal(answer.units.status, 'labels_ambiguous');
    assert.equal(answer.counts.basis, 'transcript_segments');
  } finally { await inbox.cleanup(); }
});

// ------------------------------------------------------------- 공통 용어
// A mixed recording: the same words carry across two projects' stretches, and
// what differs is the equipment, the purpose and the outcome.

const SHARED_A = 'CDR 준비 회의에서 수신부 앰프 이득을 다시 봤고 시험수조 표적 배치를 확인했습니다.';
const SHARED_B = '이건 그냥 점심 얘기입니다.';
const SHARED_C = 'CDR 일정에 맞춰 수신부 보드와 앰프 교체는 구미 현장 디버깅 때 같이 합니다.';
const MIXED_ROWS = [segment(21, 0, 60, 'UNKNOWN', SHARED_A), segment(22, 60, 120, 'UNKNOWN', SHARED_B),
  segment(23, 120, 180, 'UNKNOWN', SHARED_C)].join('\n') + '\n';
const MIXED_UNITS = [
  unitLabel({ id: 'unit_21', segmentIds: [21], start: 0, end: 60, characters: [...SHARED_A].length }),
  unitLabel({ id: 'unit_22', segmentIds: [22], start: 60, end: 120, characters: [...SHARED_B].length }),
  unitLabel({ id: 'unit_23', segmentIds: [23], start: 120, end: 180, characters: [...SHARED_C].length }),
];
// A registry row says two different things and keeps them apart: which projects
// the graph was observed holding the term in, and whether a person declared it
// shared. A term seen in one project that nobody declared is distinctive; one a
// person declared is shared however few projects have shown it yet.
const term = (name, observed, extra = {}) => ({ term: name, normalized: name.toLowerCase(),
  projects: [...observed], observed_projects: [...observed], declared_projects: [], mention_count: 0,
  source: 'graph', declared_shared: false, category: 'content', ...extra });
const REGISTRY = {
  schema: 'soulforge.context_shared_terms.v0', generated_at: '2026-09-15T00:00:00.000Z', generation_refs: [],
  terms: [
    term('CDR', ['S00-001', 'S00-002', 'S00-003'], { mention_count: 31 }),
    term('수신부', ['S00-001', 'S00-002'], { mention_count: 18 }),
    term('앰프', ['S00-001', 'S00-002', 'S00-004'], { mention_count: 12, source: 'both', declared_shared: true,
      declared_projects: ['S00-001', 'S00-002'] }),
    term('시험수조', ['S00-001'], { mention_count: 5 }),
    term('구미 현장', ['S00-002'], { mention_count: 4 }),
    // Workflow wording: shared, and a different kind of word from the estate's own.
    term('Status Change', ['S00-001', 'S00-002'], { mention_count: 40, category: 'workflow' }),
  ],
};

async function mixedInbox(registry = REGISTRY) {
  const inbox = await makeInbox({ localRows: MIXED_ROWS });
  const run = labelRun({ transcriptDigest: inbox.localDigest, units: MIXED_UNITS });
  await inbox.put(`${inbox.folder}/analysis/semantic_labels/${run.run_id}/semantic_label_run.json`, json(run));
  const address = `${inbox.folder}/shared_terms.v0.json`;
  if (registry !== null) await inbox.put(address, json(registry));
  return { ...inbox, registryPath: hostPath(inbox, address) };
}

test('같은 용어가 두 과제 구간에 걸쳐 나오면 공통으로 표시되고, 도구는 과제를 고르지 않는다', async () => {
  const inbox = await mixedInbox();
  try {
    const answer = await read(inbox.io, { units: true, sharedTermsPath: inbox.registryPath });
    assert.equal(answer.shared_terms.status, 'ok');
    assert.equal(answer.shared_terms.term_count, 6);
    const [first, , third] = answer.units.rows;
    const sharedOf = row => row.terms.filter(mark => mark.shared).map(mark => mark.term).sort();
    // Three registry terms carry across both stretches: none of them picks a project.
    assert.deepEqual(sharedOf(first), ['CDR', '수신부', '앰프']);
    assert.deepEqual(sharedOf(third), ['CDR', '수신부', '앰프']);
    assert.ok(first.terms.every(mark => !mark.shared || mark.project_count >= 2));
    // 앰프 is shared because somebody declared it, and the mark says which of the
    // two grounds it stands on rather than merging them into one number.
    const amp = first.terms.find(mark => mark.term === '앰프');
    assert.deepEqual([amp.declared_shared, amp.observed_project_count, amp.category], [true, 3, 'content']);
    // What differs is the distinguishing term, and each names exactly one project.
    const only = row => row.terms.filter(mark => !mark.shared).map(mark => `${mark.term}=${mark.projects.join(',')}`);
    assert.deepEqual(only(first), ['시험수조=S00-001']);
    assert.deepEqual(only(third), ['구미 현장=S00-002']);
    // The tool marks and does not decide: every unit stays unresolved and the
    // gate still refuses to emit project candidates.
    assert.ok(answer.units.rows.every(row => row.project_match.state === 'unresolved_needs_context'));
    assert.ok(answer.units.rows.every(row => row.project_match.candidates.length === 0));
    assert.equal(answer.units.evidence_gate.project_candidate_emission_allowed, false);
    const text = renderVoice(answer, { budget: { call: 1, remaining: 5, bucket: 'dev' },
      toolsSha256: sha(Buffer.from('tools')) });
    assert.match(text, /공통\(관측 3과제\) CDR/u);
    assert.match(text, /구별\(S00-001\) 시험수조/u);
    assert.match(text, /공통 표시가 붙은 용어로는 과제를 정하지 못합니다/u);
  } finally { await inbox.cleanup(); }
});

test('글자 상한에 잘린 구간도 용어 표시는 구간 전체에서 뽑는다', async () => {
  const inbox = await mixedInbox();
  try {
    const answer = await read(inbox.io, { units: true, sharedTermsPath: inbox.registryPath, maxChars: 100 });
    const third = answer.units.rows[2];
    assert.ok(third.shown < third.characters, 'the third unit is cut by the character bound');
    assert.deepEqual(third.terms.filter(mark => mark.shared).map(mark => mark.term).sort(),
      ['CDR', '수신부', '앰프'], 'marks come from the whole interval, not the shown part');
  } finally { await inbox.cleanup(); }
});

test('등록부가 없거나 설정되지 않았으면 표시만 빠지고 답은 그대로 나온다', async () => {
  const inbox = await mixedInbox(null);
  try {
    const none = await read(inbox.io, { units: true });
    assert.equal(none.shared_terms.status, 'not_configured');
    assert.ok(none.units.rows.every(row => row.terms.length === 0));
    assert.equal(none.status, 'ok');
    const missing = await read(inbox.io, { units: true, sharedTermsPath: inbox.registryPath });
    assert.equal(missing.shared_terms.status, 'unavailable');
    assert.equal(missing.status, 'ok');
  } finally { await inbox.cleanup(); }
});

test('공통 용어 표시는 원 전사 구간 모드에서도 붙는다', async () => {
  const inbox = await mixedInbox();
  try {
    const answer = await read(inbox.io, { sharedTermsPath: inbox.registryPath });
    assert.equal(answer.counts.basis, 'transcript_segments');
    assert.deepEqual(answer.segments[0].terms.filter(term => term.shared).map(term => term.term).sort(),
      ['CDR', '수신부', '앰프']);
  } finally { await inbox.cleanup(); }
});

test('구간 초안 조립은 라벨 run이 센 글자 수와 맞는지 스스로 밝힌다', () => {
  const rows = [{ segment_id: 1, content: '가나다', start_seconds: 0, end_seconds: 1 },
    { segment_id: 2, content: '라마바', start_seconds: 1, end_seconds: 2 }];
  const run = { segment_labels: [{ unit_id: 'u', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 2,
    content_char_count: 7 }], review_windows: [] };
  const [built] = buildSemanticUnits({ run, rows, recordedAtLocal: RECORDED });
  assert.equal(built.text, '가나다 라마바');
  assert.equal(built.characters, 7);
  assert.equal(built.characters_match, true);
  const [drifted] = buildSemanticUnits({ run: { ...run,
    segment_labels: [{ ...run.segment_labels[0], content_char_count: 99 }] }, rows, recordedAtLocal: RECORDED });
  assert.equal(drifted.characters_match, false, 'a drifted count is reported, never corrected');
});

test('스킬 문서가 공통 용어 규칙과 대화 목록 형식을 실제로 담고 있다', async () => {
  const skill = await readFile(new URL('../ops/hermes-skill/SKILL.md', import.meta.url), 'utf8');
  for (const rule of ['공통 용어', '근거 두 가지 이상', '대화 목록', '판독 불가', 'candidate', 'unclassified',
    // The narrowed shape: cite the list, or say there is none -- never derive one.
    '아직 대화 목록이 만들어지지 않았', '대신 나눠 주지 않는다', '제안', '파생 요약']) {
    assert.ok(skill.includes(rule), `SKILL.md should state: ${rule}`);
  }
  assert.ok(!skill.includes('① 녹음·전사 품질부터 본다'),
    'the long bot-performed procedure is gone');
});

// ------------------------------------------------------------ 대화 목록
// The list a separate pipeline writes. This read cites it or says there is
// none; it never derives one.

const conversationRowFixture = ({ id, start, end, nature = 'project_work', title = '중립 제목',
  description = '파생 설명입니다.', candidates = [], quality = {}, related = [] } = {}) => ({
  segment_id: id, start_seconds: start, end_seconds: end,
  clock: `09:${String(Math.floor(start / 60)).padStart(2, '0')}:${String(Math.floor(start % 60)).padStart(2, '0')}`,
  title, description, nature, status: candidates.length ? 'candidate' : 'unclassified',
  project_candidates: candidates, unclassified_reason: candidates.length ? null : '단서가 공통 용어뿐입니다',
  quality: { transcript_kind: 'independent_fast', marks: ['low_confidence'], correction_state: 'proposed', ...quality },
  refs: { session_id: SESSION, transcript_run_id: RUN, source_segment_ids: [11, 12],
    // The pipeline records where the audio is; this read must never pass it on.
    audio_ref: `sessions/${DATE}/${SESSION}/audio/source.mp3`, semantic_run_id: 'vsl_synthetic_run' },
  related_segment_ids: related,
});

const conversationFile = ({ generatedAt = '2026-09-15T01:00:00.000Z', verified = false, rows } = {}) => ({
  schema: 'soulforge.voice_conversation_list.v0', generated_at: generatedAt, verified,
  checks: ['segment_ids_complete'], segments: rows });

async function withConversationList({ runs = null } = {}) {
  // A 900s window so the fixture's two conversations are both reachable in one call.
  const inbox = await makeInbox({ access: { max_seconds_per_call: 900, max_characters_per_call: 12000 } });
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-voice-derived-')));
  for (const [runId, file] of runs ?? [['clr_0001', conversationFile({ rows: [
    conversationRowFixture({ id: 'conv_1', start: 0.4, end: 69.6,
      candidates: [{ project_code: 'S00-001', evidence_row_ids: [1, 2], basis: ['equipment', 'purpose'],
        strength: 'strong' }], related: ['conv_2'] }),
    conversationRowFixture({ id: 'conv_2', start: 700.1, end: 759.9, nature: 'idea', candidates: [] }),
  ] })]]) {
    const dir = path.join(derivedRoot, 'voice', SESSION, runId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'conversation_list.v0.json'), json(file));
  }
  return { ...inbox, derivedRoot,
    cleanup: () => Promise.all([inbox.cleanup(), rm(derivedRoot, { recursive: true, force: true })]) };
}

test('대화 목록이 있으면 그것으로 답하고, 원 발화 자리는 비운다', async () => {
  const inbox = await withConversationList();
  try {
    const answer = await read(inbox.io, { conversationList: true, derivedRoot: inbox.derivedRoot });
    assert.equal(answer.status, 'ok');
    assert.equal(answer.conversation_list.status, 'ok');
    assert.equal(answer.counts.basis, 'conversation_list');
    assert.equal(answer.segments.length, 0);
    assert.equal(answer.units.rows.length, 0);
    assert.equal(answer.conversation_list.run_id, 'clr_0001');
    assert.equal(answer.conversation_list.verified, false, 'an unverified list says so');
    assert.deepEqual(answer.conversation_list.checks, ['segment_ids_complete']);
    const [first, second] = answer.conversation_list.rows;
    assert.equal(first.conversation_id, 'conv_1');
    assert.equal(first.nature, 'project_work');
    assert.equal(first.status, 'candidate');
    assert.equal(first.derived_summary, true);
    assert.deepEqual(first.project_candidates, [{ project_code: 'S00-001', strength: 'strong',
      basis: ['equipment', 'purpose'], evidence_rows: 2 }]);
    assert.equal(first.quality.correction_state, 'proposed');
    assert.deepEqual(first.refs.source_segment_ids, [11, 12]);
    assert.deepEqual(first.related, ['conv_2']);
    assert.equal(second.unclassified_reason, '단서가 공통 용어뿐입니다');
    assert.equal(second.project_candidates.length, 0);
  } finally { await inbox.cleanup(); }
});

test('대화 목록의 오디오 참조는 어떤 출력에도 실리지 않는다', async () => {
  const inbox = await withConversationList();
  try {
    const answer = await read(inbox.io, { conversationList: true, derivedRoot: inbox.derivedRoot });
    const text = renderVoice(answer, { budget: { call: 1, remaining: 5, bucket: 'dev' },
      toolsSha256: sha(Buffer.from('tools')) });
    for (const carrier of [JSON.stringify(answer), text]) {
      assert.ok(!carrier.includes('source.mp3'), 'the audio reference is dropped, not forwarded');
      assert.ok(!carrier.includes('audio_ref'));
    }
    assert.match(text, /파생 요약입니다/u);
    assert.match(text, /conversation_list run clr_0001/u);
    assert.match(text, /verified false/u);
  } finally { await inbox.cleanup(); }
});

test('run이 여럿이면 선언된 시각으로 최신을 고르고, 무엇으로 골랐는지 말한다', async () => {
  const rows = [conversationRowFixture({ id: 'conv_1', start: 0.4, end: 69.6 })];
  const inbox = await withConversationList({ runs: [
    ['clr_0001', conversationFile({ generatedAt: '2026-09-15T01:00:00.000Z', rows })],
    ['clr_0002', conversationFile({ generatedAt: '2026-09-15T05:00:00.000Z', rows, verified: true })],
  ] });
  try {
    const answer = await read(inbox.io, { conversationList: true, derivedRoot: inbox.derivedRoot });
    assert.equal(answer.conversation_list.run_id, 'clr_0002');
    assert.equal(answer.conversation_list.runs_found, 2);
    assert.equal(answer.conversation_list.selected_by, 'declared_instant');
    assert.equal(answer.conversation_list.verified, true);
  } finally { await inbox.cleanup(); }
});

test('대화 목록이 없으면 "미생성"이라 말하고 원 발화로 답한다', async () => {
  const inbox = await makeInbox();
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-voice-derived-')));
  try {
    const answer = await read(inbox.io, { conversationList: true, derivedRoot });
    assert.equal(answer.conversation_list.status, 'absent');
    assert.equal(answer.counts.basis, 'transcript_segments');
    assert.ok(answer.segments.length > 0, 'the utterances still answer');
    const text = renderVoice(answer, { budget: { call: 1, remaining: 5, bucket: 'dev' },
      toolsSha256: sha(Buffer.from('tools')) });
    assert.match(text, /conversation_list 미생성/u);
    assert.match(text, /아직 대화 목록이 만들어지지 않았습니다/u);
  } finally {
    await inbox.cleanup();
    await rm(derivedRoot, { recursive: true, force: true });
  }
});

test('파생 루트가 아예 없거나 설정되지 않아도 읽기는 그대로 답한다', async () => {
  const inbox = await makeInbox();
  try {
    const none = await read(inbox.io, { conversationList: true });
    assert.equal(none.conversation_list.status, 'not_configured');
    assert.equal(none.status, 'ok');
    assert.ok(none.segments.length > 0);
    const gone = await read(inbox.io, { conversationList: true,
      derivedRoot: path.join(inbox.dataRoot, 'no-such-derived-root') });
    assert.equal(gone.conversation_list.status, 'absent');
    assert.equal(gone.status, 'ok');
  } finally { await inbox.cleanup(); }
});

test('대화 목록도 창으로 자른다 — 창 밖 구간은 나오지 않는다', async () => {
  const inbox = await withConversationList();
  try {
    const answer = await read(inbox.io, { conversationList: true, derivedRoot: inbox.derivedRoot,
      from: 600, to: 900 });
    assert.deepEqual(answer.conversation_list.rows.map(row => row.conversation_id), ['conv_2']);
    assert.equal(answer.counts.in_window, 1);
  } finally { await inbox.cleanup(); }
});

test('대화 목록을 달라고 하면 의미 단위 초안은 읽지 않는다', async () => {
  const inbox = await withConversationList();
  try {
    const answer = await read(inbox.io, { conversationList: true, units: true, derivedRoot: inbox.derivedRoot });
    assert.equal(answer.counts.basis, 'conversation_list');
    assert.equal(answer.units.status, 'not_read', 'one answer has one basis');
  } finally { await inbox.cleanup(); }
});
