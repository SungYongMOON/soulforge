// The conversation-list pipeline's transcript source (Owner decision
// 2026-09-26): the PLAUD transcript is the primary input when a pipeline config
// says `transcript_source: "plaud"`, the local whisper transcript stays the
// secondary/fallback, and a config that names no source keeps producing
// exactly the run id it always did -- so no already-verified card goes stale.
//
// Every recording here is synthetic and every root is a fresh temp directory.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_TABLE_SCHEMA, readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { readPipelineConfig } from '../src/runtime/voice_conversation_list.mjs';
import { PLAUD_TRANSCRIPT_RUN_ID, readPrompts, runVoiceConversationCli }
  from '../harness/voice_conversation_list_cli.mjs';
import { classifySession, parseSessionsFile, runNightly } from '../harness/voice_conversation_list_nightly.mjs';

const NOW = '2026-09-26T02:00:00.000Z';
const RUN = 'whispercpp_test_v1';
const SESSION = '20260101_090000_plaud_cli_testfixture';
const OTHER = '20260102_090000_plaud_cli_otherfixture';
const PROMPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'voice_conversation_list');
const SESSIONS_ADDRESS = 'data_root/ingress/plaud/sessions';
const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonl = rows => `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;
const codeOf = async fn => { try { await fn(); return null; } catch (error) { return error.code; } };

// The run id the whisper fixture below produced *before* `transcript_source`
// existed (computed against origin/main bb0e2943 with this same fixture). A
// config that names no source must keep landing on exactly this id.
const PINNED_WHISPER_RUN_ID = 'vcl_a775e9522f70f5cd';

const SPEECH = [
  [1, 0, 7.4, '오늘은 가대 도면 수정본부터 보겠습니다.'],
  [2, 7.4, 15.82, '볼트 구멍 위치가 지난번 도면과 다릅니다.'],
  [3, 15.82, 24.1, '그러면 구멍 위치는 언제까지 확인해 주실 수 있나요?'],
  [4, 25.0, 33.5, '내일 오전까지 확인해서 회신드리겠습니다.'],
];
const whisperRow = ([id, start, end, content]) => ({
  schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: id, start_seconds: start,
  end_seconds: end, speaker: 'UNKNOWN', content, source: 'whisper_cpp_independent_local',
  analysis_run_id: RUN, chunk_index: 1,
  asr_confidence: { state: 'available_uncalibrated', token_probability_count: 20,
    mean_token_probability: 0.8, minimum_token_probability: 0.2, low_probability_token_count: 2 } });
// The provider cuts the same minute differently and names who spoke.
const PLAUD = [
  [1, 0, 15.8, 'Speaker 1', '오늘은 가대 도면 수정본부터 보겠습니다. 볼트 구멍 위치가 지난번 도면과 다릅니다.'],
  [2, 15.8, 24.1, 'Speaker 2', '그러면 구멍 위치는 언제까지 확인해 주실 수 있나요?'],
  [3, 25.0, 33.5, 'Speaker 1', '내일 오전까지 확인해서 회신드리겠습니다.'],
];
const plaudRow = ([id, start, end, speaker, content]) => ({
  schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: id, start_seconds: start,
  end_seconds: end, speaker, content, source: 'plaud_provider' });
const unitOf = (id, ids) => ({ unit_id: id, source_segment_ids: [...ids],
  start_seconds: SPEECH.find(row => row[0] === ids[0])[1], end_seconds: SPEECH.find(row => row[0] === ids.at(-1))[2],
  speaker_label: 'UNKNOWN', content_sha256: 'a'.repeat(64), content_char_count: 10, speech_acts: [],
  polarity: 'affirmed', modality: 'actual', action_codes: [], entities: [],
  project_match: { state: 'unresolved_needs_context', candidates: [] }, disposition: 'context_only' });

async function writeSession(dataRoot, date, sessionId, { plaud = true } = {}) {
  const sessionDir = path.join(dataRoot, 'ingress', 'plaud', 'sessions', date, sessionId);
  const runDir = path.join(sessionDir, 'analysis', 'local_asr', RUN);
  await mkdir(runDir, { recursive: true });
  const transcript = jsonl(SPEECH.map(whisperRow));
  await writeFile(path.join(runDir, 'transcript.jsonl'), transcript);
  await writeFile(path.join(runDir, 'suppressed_segments.jsonl'), '');
  await writeFile(path.join(runDir, 'analysis_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.local_asr_run.v0', session_id: sessionId, run_id: RUN, state: 'completed',
    segment_count: SPEECH.length, transcript_sha256: hex(transcript),
    evidence_role: 'independent_machine_transcript_unverified', claim_ceiling: 'observed' }));
  if (plaud) await writeFile(path.join(sessionDir, 'transcript.jsonl'), jsonl(PLAUD.map(plaudRow)));
  await writeFile(path.join(sessionDir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId, source: 'plaud_cli_import',
    source_page_title: '합성 녹음', recorded_at_local: '2026-01-01T09:00:00+09:00', duration_seconds: 60,
    transcript: { evidence_role: 'auxiliary_unverified', quality: 'provider_machine_transcript_unverified' },
    independent_transcription: { status: 'completed', run_id: RUN } }));
  const labelDir = path.join(sessionDir, 'analysis', 'semantic_labels', 'vsl_testfixture0001');
  await mkdir(labelDir, { recursive: true });
  await writeFile(path.join(labelDir, 'semantic_label_run.json'), JSON.stringify({
    schema_version: 'soulforge.voice_semantic_label_run.v1', run_id: 'vsl_testfixture0001',
    recording_ref: { recording_id: sessionId, transcript_sha256: hex(transcript) },
    evidence_gate: { input_class: 'independent_asr_fast', state: 'stronger_local_asr_required' },
    segment_labels: [unitOf('unit_1_2', [1, 2]), unitOf('unit_3_4', [3, 4])], review_windows: [],
    coverage: { semantic_unit_count: 2 }, boundaries: { transcript_body_copied_to_output: false } }));
  return sessionDir;
}

async function estate({ plaud = true } = {}) {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vclp-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vclp-control-')));
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vclp-derived-')));
  const sessionDir = await writeSession(dataRoot, '2026-01-01', SESSION, { plaud });
  const tablePath = path.join(controlRoot, 'root_table.json');
  await writeFile(tablePath, `${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  const toolsPath = path.join(controlRoot, 'tools.v0.json');
  await writeFile(toolsPath, JSON.stringify({ schema: 'soulforge.context_read_tools.v0',
    interpreter_path: path.join(controlRoot, 'python.exe'), soffice_path: path.join(controlRoot, 'soffice.exe'),
    python_packages: {}, formats: {}, max_attachment_bytes: 1024 * 1024,
    receipts_root: path.join(controlRoot, 'receipts'), derived_root: derivedRoot }));
  const base = { schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { host: 'http://127.0.0.1:18080', model: 'test-model', transport: 'openai_chat', think: false,
      options: { temperature: 0, seed: 7, num_predict: 512 }, timeout_ms: 120000 },
    prompts_dir: PROMPTS, limits: { llm_calls: 60 } };
  // Byte-for-byte the shape a config had before this option existed.
  const configPath = path.join(controlRoot, 'voice_pipeline.v0.json');
  await writeFile(configPath, JSON.stringify(base));
  const plaudConfigPath = path.join(controlRoot, 'voice_pipeline.plaud.v0.json');
  await writeFile(plaudConfigPath, JSON.stringify({ ...base, transcript_source: 'plaud' }));
  return { dataRoot, controlRoot, derivedRoot, sessionDir, tablePath, toolsPath, configPath, plaudConfigPath };
}

function scriptedChat(answer) {
  const rows = [];
  return () => ({
    chat: async ({ step, user, schema }) => {
      rows.push({ call: rows.length + 1, step, user, status: 'ok', elapsed_ms: 1 });
      return { status: 'ok', value: answer({ step, user, schema }) };
    },
    trace: () => rows.map(({ user, ...row }) => ({ ...row })),
    users: () => rows.map(row => ({ step: row.step, user: row.user })),
    model: { model: 'test-model' },
  });
}
const pin = async () => ({ digest: `sha256:${'b'.repeat(64)}`, pin_kind: 'server_props' });
// An id line is `<id>: text` from a whisper transcript, `<id> <speaker>: text` from a PLAUD one.
const idsInUser = user => [...user.matchAll(/^(\d+)(?: [^:\n]+)?: /gmu)].map(match => Number(match[1]));
const segmentIdsInUser = user => [...user.matchAll(/\[(c\d{3})\]/gu)].map(match => match[1]);
const plainScript = ({ step, user }) => {
  if (step === 'boundary') {
    return { segments: [{ draft_id: 'd1', source_segment_ids: idsInUser(user), boundary_reason: 'topic_shift',
      related_draft_ids: [] }] };
  }
  if (step === 'boundary_recheck') return { verdict: 'separate', reason: '다른 안건' };
  if (step === 'nature') {
    return { segments: segmentIdsInUser(user).map(id => ({ segment_id: id, nature: 'project_work',
      title: '가대 도면 확인', description: '도면 수정본의 볼트 구멍 위치를 확인하기로 함.',
      key_terms: [{ term: '가대', kind: 'equipment' }], unclear: false })) };
  }
  if (step === 'project') return { candidates: [], unclassified_reason: '근거가 없다' };
  return { proposals: [] };
};

const run = (dirs, configPath, chat = scriptedChat(plainScript)) => runVoiceConversationCli(
  ['run', '--root-table', dirs.tablePath, '--tools-config', dirs.toolsPath,
    '--pipeline-config', configPath, '--session', SESSION],
  { chatFor: chat, pinFor: pin, now: NOW });
const readCard = async (dirs, runId, name) =>
  JSON.parse(await readFile(path.join(dirs.derivedRoot, 'voice', SESSION, runId, name), 'utf8'));

test('transcript_source is optional, whisper or plaud, and anything else is refused', () => {
  const base = { schema: 'soulforge.voice_conversation_pipeline.v0', model: { host: 'h', model: 'm' },
    prompts_dir: 'p' };
  assert.equal(readPipelineConfig(JSON.stringify(base)).transcript_source, null,
    'a config that never named a source reads as the whisper default');
  assert.equal(readPipelineConfig(JSON.stringify({ ...base, transcript_source: 'plaud' })).transcript_source, 'plaud');
  assert.equal(readPipelineConfig(JSON.stringify({ ...base, transcript_source: 'whisper' })).transcript_source,
    'whisper');
  let code = null;
  try { readPipelineConfig(JSON.stringify({ ...base, transcript_source: 'provider' })); }
  catch (error) { code = error.code; }
  assert.equal(code, 'voice_pipeline_config_transcript_source_unknown');
});

test('a config that names no source keeps the exact run id and card shape it had before', async () => {
  const dirs = await estate();
  const answer = await run(dirs, dirs.configPath);
  assert.equal(answer.run_id, PINNED_WHISPER_RUN_ID, 'the run id every existing verified card is keyed by');
  const list = await readCard(dirs, answer.run_id, 'conversation_list.v0.json');
  assert.deepEqual(Object.keys(list.transcript).sort(), ['kind', 'run_id', 'sha256'],
    'no source field is written for an undeclared config, so its output bytes do not move');
  assert.equal(list.transcript.run_id, RUN);
  assert.equal(list.segments.every(segment => !('transcript_source' in segment.refs)), true);
});

test('a plaud config reads the PLAUD transcript, names it, keeps whisper as secondary, and lands on its own run id',
  async () => {
    const dirs = await estate();
    const chat = scriptedChat(plainScript);
    let handle = null;
    const answer = await run(dirs, dirs.plaudConfigPath, options => (handle = chat(options)));
    assert.notEqual(answer.run_id, PINNED_WHISPER_RUN_ID);
    assert.equal(answer.verified, true);
    const list = await readCard(dirs, answer.run_id, 'conversation_list.v0.json');
    assert.equal(list.transcript.source, 'plaud');
    assert.equal(list.transcript.fallback, null);
    assert.equal(list.transcript.run_id, PLAUD_TRANSCRIPT_RUN_ID);
    assert.equal(list.transcript.sha256, `sha256:${hex(jsonl(PLAUD.map(plaudRow)))}`);
    assert.ok(list.segments.length > 0);
    assert.ok(list.segments.every(segment => segment.refs.transcript_source === 'plaud'
      && segment.refs.transcript_run_id === PLAUD_TRANSCRIPT_RUN_ID));
    // Every PLAUD utterance, and none of the whisper ids beyond them, is placed.
    assert.deepEqual([...new Set(list.segments.flatMap(segment => segment.refs.source_segment_ids))].sort(),
      [1, 2, 3]);
    const manifest = await readCard(dirs, answer.run_id, 'run_manifest.json');
    assert.equal(manifest.transcript.source, 'plaud');
    assert.equal(manifest.transcript.rows, PLAUD.length);
    assert.deepEqual(manifest.transcript.secondary, { source: 'whisper', run_id: RUN,
      sha256: `sha256:${hex(jsonl(SPEECH.map(whisperRow)))}`, rows: SPEECH.length });
    assert.equal(manifest.quality.transcript_kind, 'provider_only');
    assert.equal(manifest.semantic_run.evidence_gate.input_class, 'provider_locator_only',
      'the in-memory rule units say plainly they were cut from the provider transcript');
    const boundaryText = handle.users().find(row => row.step === 'boundary').user;
    assert.match(boundaryText, /^1 Speaker 1: /mu, 'the speaker label reaches the boundary step');
    // Nothing was written back into custody.
    assert.equal((await codeOf(() => readFile(path.join(dirs.sessionDir, 'analysis', 'semantic_labels',
      manifest.semantic_run.run_id, 'semantic_label_run.json')))), 'ENOENT');
    // And a second pass is the same run (the in-memory label run is deterministic).
    const again = await run(dirs, dirs.plaudConfigPath);
    assert.equal(again.run_id, answer.run_id);
  });

test('a plaud config falls back to the whisper transcript when the PLAUD one is missing, and says so', async () => {
  const dirs = await estate({ plaud: false });
  const answer = await run(dirs, dirs.plaudConfigPath);
  const list = await readCard(dirs, answer.run_id, 'conversation_list.v0.json');
  assert.equal(list.transcript.source, 'whisper');
  assert.equal(list.transcript.fallback, 'plaud_transcript_absent');
  assert.equal(list.transcript.run_id, RUN);
  assert.notEqual(answer.run_id, PINNED_WHISPER_RUN_ID, 'a different config is a different run, never an overwrite');
  assert.equal(answer.verified, true);
});

async function nightlyContext(dirs) {
  const rootTable = readRootTable({ tablePath: dirs.tablePath, expectedSha256: `sha256:${hex(await readFile(dirs.tablePath))}` });
  const io = createAliasedStoreIo(rootTable);
  const tools = readToolsConfig(await readFile(dirs.toolsPath));
  const configBytes = await readFile(dirs.plaudConfigPath);
  const config = readPipelineConfig(configBytes);
  const { prompts, digests } = readPrompts(config.prompts_dir);
  return { io, tools, config, prompts, promptDigests: digests, configSha256: hex(configBytes) };
}

test('a sessions file restricts the night to exactly the sessions it names', async () => {
  const dirs = await estate();
  await writeSession(dirs.dataRoot, '2026-01-02', OTHER);
  assert.deepEqual(parseSessionsFile(`"session_id","date","current_status"\n"${OTHER}","2026-01-02","x"\n\n`),
    [OTHER], 'a quoted CSV header and blank lines are skipped');
  const ctx = await nightlyContext(dirs);
  const attempted = [];
  const result = await runNightly({ ...ctx, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: path.join(dirs.controlRoot, 'receipts'), targetDate: '2026-01-02', now: NOW,
    sessionList: [OTHER], runSession: async ({ sessionId }) => {
      attempted.push(sessionId);
      return { verified: true, llm_calls: 0, elapsed_ms: 0, run_id: 'vcl_0000000000000000' };
    } });
  assert.deepEqual(attempted, [OTHER], 'the other session on disk is never offered');
  assert.deepEqual(result.sessions.map(row => [row.session_id, row.date]), [[OTHER, '2026-01-02']]);
  assert.equal(result.receipt.plan.source, 'sessions_file');
  assert.equal(result.receipt.transcript_source, 'plaud');
  assert.equal(result.receipt.backlog, null);
});

test('a verified card made from the other transcript is skipped, never regenerated', async () => {
  const dirs = await estate();
  const whisper = await run(dirs, dirs.configPath);
  assert.equal(whisper.verified, true);
  const ctx = await nightlyContext(dirs);
  const described = classifySession({ io: ctx.io, tools: ctx.tools, sessionsAddress: SESSIONS_ADDRESS,
    date: '2026-01-01', sessionId: SESSION, configSha256: ctx.configSha256, promptDigests: ctx.promptDigests,
    transcriptSource: 'plaud' });
  assert.equal(described.classification, 'skipped_existing');
  assert.equal(described.reason, 'verified_other_source');
  assert.equal(described.existing_run_id, whisper.run_id);
  // With no declared source the original comparison is unchanged: a different
  // config still reads as stale, exactly as before.
  const undeclared = classifySession({ io: ctx.io, tools: ctx.tools, sessionsAddress: SESSIONS_ADDRESS,
    date: '2026-01-01', sessionId: SESSION, configSha256: ctx.configSha256, promptDigests: ctx.promptDigests });
  assert.equal(undeclared.reason, 'existing_run_stale:config');

  // And a verified PLAUD card is not redone by a plaud night either.
  await rm(path.join(dirs.derivedRoot, 'voice', SESSION), { recursive: true, force: true });
  const plaud = await run(dirs, dirs.plaudConfigPath);
  assert.equal(plaud.verified, true);
  const same = classifySession({ io: ctx.io, tools: ctx.tools, sessionsAddress: SESSIONS_ADDRESS,
    date: '2026-01-01', sessionId: SESSION, configSha256: ctx.configSha256, promptDigests: ctx.promptDigests,
    transcriptSource: 'plaud' });
  assert.equal(same.classification, 'skipped_existing');
  assert.equal(same.reason, null);
});
