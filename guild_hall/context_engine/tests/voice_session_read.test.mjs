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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRootTable, ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { clockAt, readInboxAccess, readVoiceSession, VOICE_ACCESS_SCHEMA,
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

/** One inbox: two roots, a sessions tree, and the declaration that opens it. */
async function makeInbox({ localRun = true, runState = 'completed', declaredDigest = null,
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
    const bytes = Buffer.from(LOCAL);
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
  return { io, dataRoot, controlRoot, tableDir,
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
