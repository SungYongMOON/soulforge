// The agent-step harness: an outside agent answering the conversation-list
// pipeline's questions in place of the local model, under the Owner's
// recorded one-off backlog exception -- and nothing it does may quietly
// widen that exception. Every fixture here is synthetic and every root is a
// fresh temp directory; no path under this file's control ever touches a
// real host root.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { SEMANTIC_REASK_SENTENCES, runConversationList, runVoiceConversationCli }
  from '../harness/voice_conversation_list_cli.mjs';
import {
  AGENT_STEP_REPO_ROOT, findControlCharacter, readAgentStepPipelineConfig,
  runVoiceConversationAgentStepCli, validateAgainstSchema,
} from '../harness/voice_conversation_list_agent_step.mjs';

const NOW = '2026-09-22T02:00:00.000Z';
const RUN = 'whispercpp_test_v1';
const SESSION = '20260101_090000_plaud_agentstep_testfixture';
const PROMPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'voice_conversation_list');
const HARNESS_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'harness',
  'voice_conversation_list_agent_step.mjs');
const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const asyncCodeOf = async fn => { try { await fn(); return null; } catch (error) { return error.code; } };

// ------------------------------------------------------------- the recording
// The same small synthetic recording the ordinary CLI's own test suite uses:
// two conversations that meet at a question and its answer, then a third that
// starts a different subject -- small enough that the whole pass is exactly
// three model questions (boundary, nature, correction): the project step
// never fires because this fixture has no project-bindings area to search.
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

const unitOf = (id, ids, acts) => ({
  unit_id: id, source_segment_ids: [...ids],
  start_seconds: SPEECH.find(row => row[0] === ids[0])[1],
  end_seconds: SPEECH.find(row => row[0] === ids.at(-1))[2],
  speaker_label: 'UNKNOWN', content_sha256: 'a'.repeat(64), content_char_count: 10,
  speech_acts: [...acts], polarity: 'affirmed', modality: 'actual', action_codes: [], entities: [],
  project_match: { state: 'unresolved_needs_context', candidates: [] }, disposition: 'material_ambiguity_deferred' });
const UNITS = [unitOf('unit_1_3', [1, 2, 3], ['open_question']), unitOf('unit_4_4', [4], ['commitment']),
  unitOf('unit_5_6', [5, 6], ['status_update'])];

const EXCEPTION = Object.freeze({ allowed: true, decided_by: 'owner:test-fixture',
  decided_at: '2026-09-22', scope: 'backlog_test_fixture_sessions_only' });

/** One estate, built once per test: a data root holding the recording, a control root, a derived root. */
async function estate({ sessionId = SESSION, modelAlias = 'claude-opus-external-fixture', configOverrides = {} } = {}) {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-agent-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-agent-control-')));
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-agent-derived-')));
  const sessionDir = path.join(dataRoot, 'ingress', 'plaud', 'sessions', '2026-01-01', sessionId);
  const runDir = path.join(sessionDir, 'analysis', 'local_asr', RUN);
  await mkdir(runDir, { recursive: true });
  const rows = SPEECH.map(row => rowOf(row));
  const transcript = jsonl(rows);
  await writeFile(path.join(runDir, 'transcript.jsonl'), transcript);
  await writeFile(path.join(runDir, 'suppressed_segments.jsonl'), '');
  await writeFile(path.join(runDir, 'analysis_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.local_asr_run.v0', session_id: sessionId, run_id: RUN, state: 'completed',
    segment_count: rows.length, transcript_sha256: hex(transcript),
    evidence_role: 'independent_machine_transcript_unverified', quality: 'machine_transcript_unverified',
    claim_ceiling: 'observed' }));
  await writeFile(path.join(sessionDir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId, source: 'plaud_cli_import',
    source_page_title: '합성 녹음 (agent-step)', recorded_at_local: '2026-01-01T09:00:00+09:00', duration_seconds: 60,
    independent_transcription: { status: 'completed', run_id: RUN,
      evidence_role: 'independent_machine_transcript_unverified' } }));
  const labelDir = path.join(sessionDir, 'analysis', 'semantic_labels', 'vsl_agentstep0001');
  await mkdir(labelDir, { recursive: true });
  await writeFile(path.join(labelDir, 'semantic_label_run.json'), JSON.stringify({
    schema_version: 'soulforge.voice_semantic_label_run.v1', run_id: 'vsl_agentstep0001',
    recording_ref: { recording_id: sessionId, transcript_sha256: hex(transcript) },
    evidence_gate: { input_class: 'independent_asr_fast', state: 'stronger_local_asr_required',
      project_candidate_emission_allowed: false },
    segment_labels: UNITS, review_windows: [], coverage: { semantic_unit_count: UNITS.length },
    boundaries: { transcript_body_copied_to_output: false } }));

  const tablePath = path.join(controlRoot, 'root_table.json');
  const tableBytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  await writeFile(tablePath, tableBytes);
  const tableSha256 = `sha256:${hex(tableBytes)}`;
  const toolsPath = path.join(controlRoot, 'tools.v0.json');
  await writeFile(toolsPath, JSON.stringify({ schema: 'soulforge.context_read_tools.v0',
    interpreter_path: path.join(controlRoot, 'python.exe'), soffice_path: path.join(controlRoot, 'soffice.exe'),
    python_packages: {}, formats: {}, max_attachment_bytes: 1024 * 1024,
    receipts_root: path.join(controlRoot, 'receipts'), derived_root: derivedRoot }));
  const configPath = path.join(controlRoot, 'voice_pipeline_agent_step.v0.json');
  await writeFile(configPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { model: modelAlias, transport: 'agent_step' }, prompts_dir: PROMPTS,
    limits: { llm_calls: 60 }, offhost_transcripts: EXCEPTION, ...configOverrides }));
  return { dataRoot, controlRoot, derivedRoot, sessionDir, tablePath, tableSha256, toolsPath, configPath };
}

const baseArgs = dirs => ['--root-table', dirs.tablePath, '--root-table-sha256', dirs.tableSha256,
  '--tools-config', dirs.toolsPath, '--pipeline-config', dirs.configPath];

// The default (plain) scripted answer for each of the three steps this
// fixture ever asks -- the same shapes the ordinary CLI test suite's own
// `plainScript` uses, so a full pass here verifies cleanly.
const idsInUser = user => [...user.matchAll(/^(\d+): /gmu)].map(match => Number(match[1]));
const segmentIdsInUser = user => [...user.matchAll(/\[(c\d{3})\]/gu)].map(match => match[1]);
function scriptedAnswer(step, user) {
  if (step === 'boundary') {
    return { segments: [{ draft_id: 'd1', source_segment_ids: idsInUser(user), boundary_reason: 'topic_shift',
      related_draft_ids: [] }] };
  }
  if (step === 'nature') {
    return { segments: segmentIdsInUser(user).map(id => ({ segment_id: id, nature: 'project_work',
      title: '가대 도면 확인', description: '도면 수정본의 볼트 구멍 위치를 확인하기로 함.',
      key_terms: [], unclear: false })) };
  }
  return { proposals: [] };
}

function parseHeader(text) {
  const line = text.split('\n')[0];
  const fields = {};
  for (const match of line.matchAll(/([A-Z_]+)=(\S+)/gu)) fields[match[1]] = match[2];
  return fields;
}

/** Drives `step`/`answer` end to end with `scriptedAnswer`, returning the final `step` result. */
async function driveToCompletion(dirs, { script = scriptedAnswer, maxRounds = 10 } = {}) {
  const seen = [];
  for (let round = 0; round < maxRounds; round++) {
    const result = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
    if (result.exitCode !== 10) return { result, rounds: seen };
    const header = parseHeader(result.text);
    seen.push(header);
    const value = script(header.STEP, JSON.parse(readFileSync(header.REQUEST_FILE, 'utf8')).user);
    const answerPath = path.join(path.dirname(header.REQUEST_FILE), `${header.KEY}.answer.json`);
    writeFileSync(answerPath, JSON.stringify(value));
    const answered = await runVoiceConversationAgentStepCli(
      ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', header.KEY, '--file', answerPath], {});
    assert.equal(answered.exitCode, 0, `answer accepted for ${header.STEP}`);
  }
  throw new Error('driveToCompletion did not finish within maxRounds');
}

// ============================================================ happy path
test('a full pass, driven one answer at a time, reaches a verified run with honest provenance', async () => {
  const dirs = await estate();
  const { result, rounds } = await driveToCompletion(dirs);
  assert.deepEqual(rounds.map(row => row.STEP), ['boundary', 'nature', 'correction'],
    'exactly the three questions this fixture has anything to ask');
  assert.equal(result.exitCode, 0);
  assert.match(result.text, /^STATUS=done RUN_ID=vcl_[0-9a-f]{16} VERIFIED=true CONVERSATIONS=1 LLM_ANSWERS=3$/mu);

  const manifestPath = path.join(dirs.derivedRoot, 'voice', SESSION);
  const runId = result.text.match(/RUN_ID=(\S+)/u)[1];
  const manifest = JSON.parse(await readFile(path.join(manifestPath, runId, 'run_manifest.json'), 'utf8'));
  assert.deepEqual([manifest.model.digest, manifest.model.pin_kind, manifest.model.alias, manifest.model.transport],
    [null, 'external_agent_unpinned', 'claude-opus-external-fixture', 'agent_step'],
    'the manifest names the external agent honestly rather than claiming a weight digest it does not have');

  // Determinism: a `step` after everything is answered replays every cached
  // answer and reports the same finished run again, asking nothing new.
  const replay = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  assert.equal(replay.text, result.text);
});

test('re-running `step` before an answer lands replays to the same pending key', async () => {
  const dirs = await estate({ sessionId: 'idem_session_001' });
  const first = await runVoiceConversationAgentStepCli(
    ['step', ...baseArgs(dirs), '--session', 'idem_session_001'], { now: NOW });
  const second = await runVoiceConversationAgentStepCli(
    ['step', ...baseArgs(dirs), '--session', 'idem_session_001'], { now: NOW });
  assert.equal(first.exitCode, 10);
  assert.equal(second.text, first.text, 'the same first cache miss, asked the same way, is the same key');
});

// ==================================================== rejection / resume
test('a rejected answer leaves the pending request in place, and the correct answer then resumes', async () => {
  const dirs = await estate();
  const first = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  const header = parseHeader(first.text);
  assert.equal(header.STEP, 'boundary');
  const badPath = path.join(path.dirname(header.REQUEST_FILE), 'bad.json');
  writeFileSync(badPath, JSON.stringify({ segments: 'not-an-array' }));
  const rejected = await runVoiceConversationAgentStepCli(
    ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', header.KEY, '--file', badPath], {});
  assert.equal(rejected.exitCode, 5);
  assert.match(rejected.text, /^STATUS=rejected REASON=/u);
  assert.ok(existsSync(header.REQUEST_FILE), 'the pending request is not consumed by a rejection');

  const goodPath = path.join(path.dirname(header.REQUEST_FILE), 'good.json');
  writeFileSync(goodPath, JSON.stringify(scriptedAnswer('boundary',
    JSON.parse(readFileSync(header.REQUEST_FILE, 'utf8')).user)));
  const accepted = await runVoiceConversationAgentStepCli(
    ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', header.KEY, '--file', goodPath], {});
  assert.equal(accepted.text, 'STATUS=accepted\n');
  assert.ok(!existsSync(header.REQUEST_FILE), 'consumed on acceptance');

  const next = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  assert.equal(next.exitCode, 10);
  assert.equal(parseHeader(next.text).STEP, 'nature', 'the pass resumed past the answered question');
});

test('duplicate and unknown keys are refused rather than silently accepted', async () => {
  const dirs = await estate();
  const first = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  const header = parseHeader(first.text);
  const answerPath = path.join(path.dirname(header.REQUEST_FILE), 'answer.json');
  writeFileSync(answerPath, JSON.stringify(scriptedAnswer('boundary',
    JSON.parse(readFileSync(header.REQUEST_FILE, 'utf8')).user)));
  const accepted = await runVoiceConversationAgentStepCli(
    ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', header.KEY, '--file', answerPath], {});
  assert.equal(accepted.exitCode, 0);

  const again = await runVoiceConversationAgentStepCli(
    ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', header.KEY, '--file', answerPath], {});
  assert.equal(again.exitCode, 5);
  assert.equal(again.text, 'STATUS=rejected REASON=key_not_pending\n', 'already answered, not pending again');

  const unknownKey = '0'.repeat(64);
  const unknown = await runVoiceConversationAgentStepCli(
    ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', unknownKey, '--file', answerPath], {});
  assert.equal(unknown.text, 'STATUS=rejected REASON=key_not_pending\n');

  const malformed = await runVoiceConversationAgentStepCli(
    ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', 'not-a-hex-key', '--file', answerPath], {});
  assert.equal(malformed.text, 'STATUS=rejected REASON=key_unknown\n');
});

// ===================================================== schema validator
test('the schema validator enforces exactly the JSON Schema subset the five answer schemas use', () => {
  const objectSchema = { type: 'object', additionalProperties: false, required: ['a'],
    properties: { a: { type: 'string' }, b: { type: 'integer' } } };
  assert.equal(validateAgainstSchema({ a: 'x' }, objectSchema).ok, true);
  assert.equal(validateAgainstSchema({}, objectSchema).code, '$.a: required_missing');
  assert.equal(validateAgainstSchema({ a: 'x', c: 1 }, objectSchema).code, '$.c: additional_property');
  assert.equal(validateAgainstSchema({ a: 1 }, objectSchema).code, '$.a: type_mismatch');
  assert.equal(validateAgainstSchema('nope', objectSchema).code, '$: type_mismatch');

  const enumSchema = { type: 'string', enum: ['x', 'y'] };
  assert.equal(validateAgainstSchema('x', enumSchema).ok, true);
  assert.equal(validateAgainstSchema('z', enumSchema).code, '$: enum_mismatch');

  const arraySchema = { type: 'array', items: { type: 'integer' } };
  assert.equal(validateAgainstSchema([1, 2, 3], arraySchema).ok, true);
  assert.equal(validateAgainstSchema([1, 'x'], arraySchema).code, '$[1]: type_mismatch');

  const nullable = { type: ['string', 'null'] };
  assert.equal(validateAgainstSchema(null, nullable).ok, true);
  assert.equal(validateAgainstSchema('x', nullable).ok, true);
  assert.equal(validateAgainstSchema(1, nullable).code, '$: type_mismatch');

  const boolSchema = { type: 'boolean' };
  assert.equal(validateAgainstSchema(true, boolSchema).ok, true);
  assert.equal(validateAgainstSchema('true', boolSchema).code, '$: type_mismatch');
});

test('control characters other than newline and tab are refused, at any depth', () => {
  assert.equal(findControlCharacter('plain text'), null);
  assert.equal(findControlCharacter('line one\nline two\ttabbed'), null, 'newline and tab are allowed');
  assert.equal(findControlCharacter(String.fromCharCode(1)), 'string_value');
  assert.equal(findControlCharacter({ nested: ['ok', { deep: String.fromCharCode(7) }] }), 'string_value');
  const badKey = {};
  badKey[String.fromCharCode(2)] = 'x';
  assert.equal(findControlCharacter(badKey), 'object_key');
});

test('an answer over 200 KB is refused', async () => {
  const dirs = await estate();
  const first = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  const header = parseHeader(first.text);
  const hugePath = path.join(path.dirname(header.REQUEST_FILE), 'huge.json');
  writeFileSync(hugePath, JSON.stringify({ segments: [{ draft_id: 'd1', source_segment_ids: [1],
    boundary_reason: 'x'.repeat(210 * 1024) }] }));
  const rejected = await runVoiceConversationAgentStepCli(
    ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', header.KEY, '--file', hugePath], {});
  assert.equal(rejected.text, 'STATUS=rejected REASON=answer_too_large\n');
});

// ============================================================== locking
test('a second `step` on the same session while one is locked is refused, and a stale lock is reclaimed', async () => {
  const dirs = await estate({ sessionId: 'lock_session_001' });
  const lockFile = path.join(dirs.derivedRoot, 'voice', 'lock_session_001', 'agent_step.lock');
  mkdirSync(path.dirname(lockFile), { recursive: true });
  writeFileSync(lockFile, JSON.stringify({ pid: 999999, started_at: NOW }));
  const held = await runVoiceConversationAgentStepCli(
    ['step', ...baseArgs(dirs), '--session', 'lock_session_001'], { now: NOW });
  assert.equal(held.exitCode, 3);
  assert.match(held.text, /^STATUS=lock_held/u);

  // A lock older than the stale threshold is reclaimed rather than honoured.
  const oldStart = new Date(Date.parse(NOW) - 40 * 60 * 1000).toISOString();
  writeFileSync(lockFile, JSON.stringify({ pid: 999999, started_at: oldStart }));
  const reclaimed = await runVoiceConversationAgentStepCli(
    ['step', ...baseArgs(dirs), '--session', 'lock_session_001'], { now: NOW });
  assert.equal(reclaimed.exitCode, 10, 'the stale lock was reclaimed and the pass actually ran');
});

// =============================================================== config
test('a config not naming `transport: agent_step` is refused before anything is read', async () => {
  const dirs = await estate();
  await writeFile(dirs.configPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { model: 'claude-opus-external-fixture', transport: 'ollama' }, prompts_dir: PROMPTS,
    offhost_transcripts: EXCEPTION }));
  assert.equal(await asyncCodeOf(() => runVoiceConversationAgentStepCli(
    ['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW })), 'voice_agent_step_transport_required');
});

test('a config with no `offhost_transcripts` exception, or one that does not say `allowed: true`, is refused', async () => {
  const dirs = await estate();
  await writeFile(dirs.configPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { model: 'claude-opus-external-fixture', transport: 'agent_step' }, prompts_dir: PROMPTS }));
  assert.equal(await asyncCodeOf(() => runVoiceConversationAgentStepCli(
    ['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW })), 'voice_agent_step_offhost_exception_required');

  await writeFile(dirs.configPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { model: 'claude-opus-external-fixture', transport: 'agent_step' }, prompts_dir: PROMPTS,
    offhost_transcripts: { ...EXCEPTION, allowed: false } }));
  assert.equal(await asyncCodeOf(() => runVoiceConversationAgentStepCli(
    ['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW })), 'voice_agent_step_offhost_exception_required');
});

test('`readAgentStepPipelineConfig` resolves a relative `prompts_dir` against the repo/lane root', () => {
  const bytes = Buffer.from(JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { model: 'claude-opus-external-fixture', transport: 'agent_step' },
    prompts_dir: 'guild_hall/context_engine/prompts/voice_conversation_list', offhost_transcripts: EXCEPTION }));
  const config = readAgentStepPipelineConfig(bytes);
  assert.equal(config.prompts_dir, path.join(AGENT_STEP_REPO_ROOT,
    'guild_hall', 'context_engine', 'prompts', 'voice_conversation_list'));
  assert.ok(existsSync(path.join(config.prompts_dir, 'boundary.v1.md')),
    'resolves to this checkout’s own real prompts directory');
});

// ===================================================== existing CLI/nightly
test('the ordinary CLI refuses an `agent_step` transport rather than silently treating it as local', async () => {
  const dirs = await estate();
  await writeFile(dirs.configPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    // The ordinary reader requires a host; giving one and still failing shows
    // the refusal comes from the transport, not from a missing field.
    model: { host: 'http://127.0.0.1:18080', model: 'claude-opus-external-fixture', transport: 'agent_step' },
    prompts_dir: PROMPTS, limits: { llm_calls: 5 } }));
  const failure = await asyncCodeOf(() => runVoiceConversationCli(
    ['run', '--root-table', dirs.tablePath, '--root-table-sha256', dirs.tableSha256,
      '--tools-config', dirs.toolsPath, '--pipeline-config', dirs.configPath, '--session', SESSION]));
  assert.equal(failure, 'chat_binding_invalid', 'createLocalChat only knows ollama and openai_chat transports');
});

test('the nightly lane’s own per-session call path refuses an `agent_step` transport the same way', async () => {
  const dirs = await estate();
  const { readPrompts, readSessionInputs } = await import('../harness/voice_conversation_list_cli.mjs');
  const { prompts, digests } = readPrompts(PROMPTS);
  const { readRootTable } = await import('../../path_registry/src/root_table.mjs');
  const { createAliasedStoreIo } = await import('../src/adapters/aliased_store_io.mjs');
  const { readToolsConfig } = await import('../src/runtime/attachment_derivation.mjs');
  const io = createAliasedStoreIo(readRootTable({ tablePath: dirs.tablePath, expectedSha256: dirs.tableSha256 }));
  const tools = readToolsConfig(readFileSync(dirs.toolsPath));
  const config = { schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { host: 'http://127.0.0.1:18080', model: 'claude-opus-external-fixture', transport: 'agent_step' },
    prompts_dir: PROMPTS, limits: { llm_calls: 5 } };
  // This is exactly the call `voice_conversation_list_nightly.mjs`'s own
  // `defaultRunSession` makes -- no `chatFor`/`pinFor` override -- so proving
  // this rejects proves the nightly lane's real path rejects too.
  const failure = await asyncCodeOf(() => runConversationList({ io, tools, config, prompts, promptDigests: digests,
    configSha256: 'a'.repeat(64), sessionId: SESSION }));
  assert.equal(failure, 'chat_binding_invalid');
});

// ======================================================================= plan
test('`plan` classifies a day range, including `skipped_existing` for a run made under a different config', async () => {
  const dirs = await estate();
  await driveToCompletion(dirs);

  const otherConfigPath = path.join(dirs.controlRoot, 'voice_pipeline_agent_step_other.v0.json');
  await writeFile(otherConfigPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { model: 'a-completely-different-agent-alias', transport: 'agent_step' }, prompts_dir: PROMPTS,
    limits: { llm_calls: 60 }, offhost_transcripts: EXCEPTION }));
  const otherArgs = ['--root-table', dirs.tablePath, '--root-table-sha256', dirs.tableSha256,
    '--tools-config', dirs.toolsPath, '--pipeline-config', otherConfigPath];
  const plan = await runVoiceConversationAgentStepCli(
    ['plan', ...otherArgs, '--from', '2026-01-01', '--to', '2026-01-01', '--json'], {});
  const body = JSON.parse(plan.text);
  const row = body.sessions.find(item => item.session_id === SESSION);
  assert.ok(row, 'the session is in range');
  assert.equal(row.classification, 'skipped_existing', 'a verified run under any config counts, by design');
});

test('`plan` separates `transcript_absent` from `skipped_short`, and orders/limits candidates', async () => {
  const dirs = await estate();
  // A second session, same day, whose transcription never finished.
  const absentId = 'zzz_absent_session';
  const absentDir = path.join(dirs.dataRoot, 'ingress', 'plaud', 'sessions', '2026-01-01', absentId);
  await mkdir(absentDir, { recursive: true });
  await writeFile(path.join(absentDir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: absentId, source: 'plaud_cli_import',
    source_page_title: '미완 전사', recorded_at_local: '2026-01-01T10:00:00+09:00', duration_seconds: null,
    independent_transcription: { status: 'pending' } }));
  const plan = await runVoiceConversationAgentStepCli(
    ['plan', ...baseArgs(dirs), '--from', '2026-01-01', '--to', '2026-01-01', '--json'], {});
  const body = JSON.parse(plan.text);
  const bySession = Object.fromEntries(body.sessions.map(row => [row.session_id, row.classification]));
  assert.equal(bySession[SESSION], 'todo');
  assert.equal(bySession[absentId], 'transcript_absent');

  const limited = await runVoiceConversationAgentStepCli(
    ['plan', ...baseArgs(dirs), '--from', '2026-01-01', '--to', '2026-01-01', '--order', 'newest', '--limit', '1', '--json'],
    {});
  assert.equal(JSON.parse(limited.text).sessions.length, 1);
});

// ================================================= real CLI subprocess / stdin
test('the CLI can be driven as a real subprocess, and a Korean answer with quotes and a newline round-trips byte-exactly through `answer --stdin`', async () => {
  const dirs = await estate({ sessionId: 'stdin_session_001' });
  const args = ['--root-table', dirs.tablePath, '--root-table-sha256', dirs.tableSha256,
    '--tools-config', dirs.toolsPath, '--pipeline-config', dirs.configPath, '--session', 'stdin_session_001'];
  const stepOut = spawnSync(process.execPath, [HARNESS_ENTRY, 'step', ...args], { encoding: 'utf8' });
  assert.equal(stepOut.status, 10, stepOut.stderr);
  const header = parseHeader(stepOut.stdout);
  assert.equal(header.STEP, 'boundary');
  const request = JSON.parse(readFileSync(header.REQUEST_FILE, 'utf8'));

  const description = ['설명에 큰따옴표', String.fromCharCode(34), '와 줄바꿈'].join('') + String.fromCharCode(10)
    + '두 번째 줄입니다.';
  const answerValue = { segments: [{ draft_id: 'd1', source_segment_ids: idsInUser(request.user),
    boundary_reason: 'topic_shift', related_draft_ids: [description] }] };
  const answerJson = JSON.stringify(answerValue);

  const answerOut = spawnSync(process.execPath,
    [HARNESS_ENTRY, 'answer', ...args, '--key', header.KEY, '--stdin'],
    { encoding: 'utf8', input: answerJson });
  assert.equal(answerOut.status, 0, answerOut.stderr);
  assert.equal(answerOut.stdout, 'STATUS=accepted\n');

  const cacheDir = path.dirname(path.dirname(header.REQUEST_FILE));
  const cached = JSON.parse(readFileSync(path.join(cacheDir, 'cache', 'boundary', `${header.KEY}.json`), 'utf8'));
  assert.deepEqual(cached.value, answerValue, 'the cached answer is byte-identical, Korean text, quote and newline intact');
  assert.equal(cached.value.segments[0].related_draft_ids[0], description);
});

// ============================================= same re-ask fix, for free
test('a rejected agent answer produces a NEW pending request carrying the re-ask sentence, under a different key', async () => {
  // This harness has no rejection logic of its own -- it goes through
  // exactly the same `runConversationList` the ordinary CLI and the nightly
  // lane do, so a structurally valid but semantically rejected agent answer
  // gets the same bounded re-ask, with no code added here.
  const dirs = await estate();
  const answerPending = async (header, value) => {
    const answerPath = path.join(path.dirname(header.REQUEST_FILE), `${header.KEY}.answer.json`);
    writeFileSync(answerPath, JSON.stringify(value));
    const accepted = await runVoiceConversationAgentStepCli(
      ['answer', ...baseArgs(dirs), '--session', SESSION, '--key', header.KEY, '--file', answerPath], {});
    assert.equal(accepted.exitCode, 0, accepted.text);
  };

  const boundaryStep = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  assert.equal(boundaryStep.exitCode, 10);
  const boundaryHeader = parseHeader(boundaryStep.text);
  assert.equal(boundaryHeader.STEP, 'boundary');
  await answerPending(boundaryHeader, scriptedAnswer('boundary',
    JSON.parse(readFileSync(boundaryHeader.REQUEST_FILE, 'utf8')).user));

  const natureStep = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  assert.equal(natureStep.exitCode, 10);
  const natureHeader = parseHeader(natureStep.text);
  assert.equal(natureHeader.STEP, 'nature');
  // A structurally valid answer (matches the schema) that names a project in
  // the title -- accepted by `answer` (schema-only validation), then
  // rejected by the runtime's own semantic rule on the very next `step`.
  const natureRequest = JSON.parse(readFileSync(natureHeader.REQUEST_FILE, 'utf8'));
  const badTitleValue = { segments: segmentIdsInUser(natureRequest.user).map(id => ({ segment_id: id,
    nature: 'project_work', title: 'AB-123 가대 확인', description: '설명', key_terms: [], unclear: false })) };
  await answerPending(natureHeader, badTitleValue);

  const reaskStep = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  assert.equal(reaskStep.exitCode, 10, 'the rejected, cached answer produced a new pending question, not a done/verified pass');
  const reaskHeader = parseHeader(reaskStep.text);
  assert.equal(reaskHeader.STEP, 'nature');
  assert.notEqual(reaskHeader.KEY, natureHeader.KEY, 'different request bytes -- a different cache key');
  const reaskRequest = JSON.parse(readFileSync(reaskHeader.REQUEST_FILE, 'utf8'));
  assert.ok(reaskRequest.user.includes(SEMANTIC_REASK_SENTENCES.nature_title_names_a_project),
    'the new pending question states the rejection, in the same fixed sentence the local-model path uses');

  // And answering that re-ask with a clean title verifies the run, healing
  // in place under the same run id.
  const cleanValue = { segments: segmentIdsInUser(natureRequest.user).map(id => ({ segment_id: id,
    nature: 'project_work', title: '가대 도면 확인', description: '설명', key_terms: [], unclear: false })) };
  await answerPending(reaskHeader, cleanValue);
  const correctionStep = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  assert.equal(correctionStep.exitCode, 10);
  const correctionHeader = parseHeader(correctionStep.text);
  await answerPending(correctionHeader, { proposals: [] });
  const done = await runVoiceConversationAgentStepCli(['step', ...baseArgs(dirs), '--session', SESSION], { now: NOW });
  assert.match(done.text, /^STATUS=done .*VERIFIED=true/mu);
  assert.equal(done.exitCode, 0);
});
