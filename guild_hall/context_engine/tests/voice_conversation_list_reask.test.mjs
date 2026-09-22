// A structurally valid model answer -- it parsed, it matched the step's JSON
// Schema, `makeAsk` cached it -- can still be rejected by a semantic rule
// (`checkBoundaryProposal`/`checkNature`). Because the cache key is the exact
// request bytes and the model runs at temperature 0, replaying a session with
// a cached-but-rejected answer used to reject it again forever: all six
// structural checks pass, `remaining_work` keeps the same entry, and the
// night's receipt reports the session FAILED every night. This file proves
// the bounded re-ask fix for that: a rejected answer gets asked again with
// the rejection stated (different request bytes, different cache key, a real
// new call), up to twice, and only falls back to the old behaviour if the
// re-ask is rejected too. It also proves the three production-observed
// stuck reasons heal (`nature_title_names_a_project`, `boundary_not_monotonic`,
// and a `nature` batch answer that silently omitted one segment), that a
// genuine call failure is retried fresh on a later pass rather than replayed
// at zero calls, and that a session which never hits a rejection is
// byte-identical to before this file grew a re-ask path.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { BOUNDARY_PROPOSAL_REJECTION_CODES, NATURE_REJECTION_CODES }
  from '../src/runtime/voice_conversation_list.mjs';
import {
  MAX_SEMANTIC_REASKS, SEMANTIC_REASK_SENTENCES, readRun, runVoiceConversationCli,
} from '../harness/voice_conversation_list_cli.mjs';

const NOW = '2026-09-22T02:00:00.000Z';
const RUN = 'whispercpp_test_v1';
const SESSION = '20260101_090000_plaud_reask_testfixture';
const PROMPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'voice_conversation_list');
const hex = bytes => createHash('sha256').update(bytes).digest('hex');

// ------------------------------------------------------------- the recording
// Same small synthetic recording the ordinary CLI's own test suite uses.
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

async function estate({ limits = { llm_calls: 60 } } = {}) {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-reask-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-reask-control-')));
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcl-reask-derived-')));
  const sessionDir = path.join(dataRoot, 'ingress', 'plaud', 'sessions', '2026-01-01', SESSION);
  const runDir = path.join(sessionDir, 'analysis', 'local_asr', RUN);
  await mkdir(runDir, { recursive: true });
  const rows = SPEECH.map(row => rowOf(row));
  const transcript = jsonl(rows);
  await writeFile(path.join(runDir, 'transcript.jsonl'), transcript);
  await writeFile(path.join(runDir, 'suppressed_segments.jsonl'), '');
  await writeFile(path.join(runDir, 'analysis_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.local_asr_run.v0', session_id: SESSION, run_id: RUN, state: 'completed',
    segment_count: rows.length, transcript_sha256: hex(transcript),
    evidence_role: 'independent_machine_transcript_unverified', quality: 'machine_transcript_unverified',
    claim_ceiling: 'observed' }));
  await writeFile(path.join(sessionDir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: SESSION, source: 'plaud_cli_import',
    source_page_title: '합성 녹음 (reask)', recorded_at_local: '2026-01-01T09:00:00+09:00', duration_seconds: 60,
    independent_transcription: { status: 'completed', run_id: RUN,
      evidence_role: 'independent_machine_transcript_unverified' } }));
  const labelDir = path.join(sessionDir, 'analysis', 'semantic_labels', 'vsl_reask0001');
  await mkdir(labelDir, { recursive: true });
  await writeFile(path.join(labelDir, 'semantic_label_run.json'), JSON.stringify({
    schema_version: 'soulforge.voice_semantic_label_run.v1', run_id: 'vsl_reask0001',
    recording_ref: { recording_id: SESSION, transcript_sha256: hex(transcript) },
    evidence_gate: { input_class: 'independent_asr_fast', state: 'stronger_local_asr_required',
      project_candidate_emission_allowed: false },
    segment_labels: UNITS, review_windows: [], coverage: { semantic_unit_count: UNITS.length },
    boundaries: { transcript_body_copied_to_output: false } }));

  const tablePath = path.join(controlRoot, 'root_table.json');
  const tableBytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  await writeFile(tablePath, tableBytes);
  const toolsPath = path.join(controlRoot, 'tools.v0.json');
  await writeFile(toolsPath, JSON.stringify({ schema: 'soulforge.context_read_tools.v0',
    interpreter_path: path.join(controlRoot, 'python.exe'), soffice_path: path.join(controlRoot, 'soffice.exe'),
    python_packages: {}, formats: {}, max_attachment_bytes: 1024 * 1024,
    receipts_root: path.join(controlRoot, 'receipts'), derived_root: derivedRoot }));
  const configPath = path.join(controlRoot, 'voice_pipeline.v0.json');
  await writeFile(configPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { host: 'http://127.0.0.1:18080', model: 'test-model', transport: 'openai_chat', think: false,
      options: { temperature: 0, seed: 7, num_predict: 512 }, timeout_ms: 120000 },
    prompts_dir: PROMPTS, limits }));
  return { dataRoot, controlRoot, derivedRoot, sessionDir, tablePath, toolsPath, configPath };
}

/** A model that answers from a script, counted and bounded exactly as the real client is. */
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
// `runVoiceConversationCli`'s own return value surfaces `calls`/`remaining_work`
// (the two `run_manifest.json` fields the CLI test suite already reads) but
// not `reasks`, which this file needs directly -- read the manifest file
// itself for that rather than widening the CLI's return shape for one field.
const manifestOf = async answer => JSON.parse(await readFile(path.join(answer.directory, 'run_manifest.json'), 'utf8'));
const reasksOf = async answer => (await manifestOf(answer)).reasks;
const splitsOf = async answer => (await manifestOf(answer)).splits;

// ============================================================= byte-identical
test('a session that never hits a rejection asks exactly what it always asked, byte for byte', async () => {
  const dirs = await estate();
  const seenBoundaryUsers = [], seenNatureUsers = [];
  const answer = await run(dirs, ({ step, user }) => {
    if (step === 'boundary') seenBoundaryUsers.push(user);
    if (step === 'nature') seenNatureUsers.push(user);
    return plainScript({ step, user });
  });
  assert.equal(answer.verified, true);
  assert.equal((await reasksOf(answer)).total, 0, 'nothing here was ever rejected, so nothing was re-asked');
  assert.equal(seenBoundaryUsers.length, 1, 'one window, asked once');
  assert.equal(seenNatureUsers.length, 1, 'one short-batch call, asked once');
  // Neither `user` text carries any of the fixed re-ask sentences: a
  // non-rejected call's request bytes are exactly what they always were,
  // with no re-ask suffix silently appended.
  for (const sentence of Object.values(SEMANTIC_REASK_SENTENCES)) {
    assert.ok(!seenBoundaryUsers[0].includes(sentence));
    assert.ok(!seenNatureUsers[0].includes(sentence));
  }
  // Exactly one cache file per step -- a second, reask-mutated key was never
  // created for a call that was never rejected.
  assert.equal((await readdir(path.join(answer.directory, 'cache', 'boundary'))).length, 1);
  assert.equal((await readdir(path.join(answer.directory, 'cache', 'nature'))).length, 1);
});

// ================================================================= boundary
test('a structurally valid but non-monotonic boundary answer is re-asked, and the corrected answer heals the run', async () => {
  const dirs = await estate();
  let boundaryCalls = 0;
  const answer = await run(dirs, ({ step, user }) => {
    if (step === 'boundary') {
      boundaryCalls += 1;
      if (boundaryCalls === 1) {
        // Two segments given back to front -- a structurally valid answer
        // (schema-passing) that `checkBoundaryProposal` rejects as
        // `boundary_not_monotonic`.
        const ids = idsInUser(user);
        const mid = Math.ceil(ids.length / 2);
        return { segments: [{ draft_id: 'd2', source_segment_ids: ids.slice(mid), boundary_reason: 'topic_shift',
          related_draft_ids: [] }, { draft_id: 'd1', source_segment_ids: ids.slice(0, mid),
          boundary_reason: 'topic_shift', related_draft_ids: [] }] };
      }
      // The re-ask: this time in order.
      assert.match(user, new RegExp(SEMANTIC_REASK_SENTENCES.boundary_not_monotonic.slice(0, 20).replace(
        /[.*+?^${}()|[\]\\]/gu, '\\$&')), 'the re-ask states the rejection');
      return plainScript({ step, user });
    }
    return plainScript({ step, user });
  });
  assert.equal(answer.verified, true, 'the second, corrected answer verifies the run');
  assert.equal(boundaryCalls, 2, 'exactly one re-ask, not an open-ended retry');
  const reasks = await reasksOf(answer);
  assert.equal(reasks.total, 1);
  assert.deepEqual([reasks.entries[0].reason, reasks.entries[0].attempt, reasks.entries[0].accepted],
    ['boundary_not_monotonic', 1, true]);
  assert.equal(answer.remaining_work.length, 0, 'nothing left over once the re-ask was accepted');
});

test('a boundary answer whose fresh re-ask repeats the exact same rejection stops early -- old behaviour otherwise: remaining_work, unverified', async () => {
  const dirs = await estate();
  const answer = await run(dirs, ({ step, user }) => {
    if (step === 'boundary') {
      // Always missing a segment -- a deterministic rejection that never heals.
      const ids = idsInUser(user);
      return { segments: [{ draft_id: 'd1', source_segment_ids: ids.slice(1), boundary_reason: 'topic_shift',
        related_draft_ids: [] }] };
    }
    return plainScript({ step, user });
  });
  assert.equal(answer.verified, false);
  const reasks = await reasksOf(answer);
  // Only 1, not MAX_SEMANTIC_REASKS: the first re-ask was a genuinely fresh
  // call (distinct bytes, per-attempt line) that came back with the exact
  // same rejection reason, so the loop gives up on the second attempt this
  // pass rather than spending it on a model that has just shown it will
  // repeat the mistake -- see SEMANTIC_REASK_SENTENCES's own doc.
  assert.equal(reasks.total, 1, 'the fresh re-ask repeated the same mistake, so the loop broke early');
  assert.equal(reasks.entries[0].accepted, false);
  assert.ok(reasks.entries.every(row => row.reason === 'boundary_segment_missing'));
  assert.ok(answer.remaining_work.some(row => row.step === 'boundary'
    && row.reason === 'boundary_segment_missing'), 'the final rejection reason is unchanged from before this fix');
});

test('a boundary answer that repeats its mistake once heals on the very next pass, with exactly one fresh call', async () => {
  // Pass 1: the original call and its one fresh re-ask both get the same
  // deterministic mistake (a reversed pair of segments) -- the loop breaks
  // early after the first re-ask, per the test just above.
  const dirs = await estate();
  const wrong = ids => { const mid = Math.ceil(ids.length / 2);
    return { segments: [{ draft_id: 'd2', source_segment_ids: ids.slice(mid), boundary_reason: 'topic_shift',
      related_draft_ids: [] }, { draft_id: 'd1', source_segment_ids: ids.slice(0, mid),
      boundary_reason: 'topic_shift', related_draft_ids: [] }] };
  };
  const stuck = await run(dirs, ({ step, user }) => {
    if (step === 'boundary') return wrong(idsInUser(user));
    return plainScript({ step, user });
  });
  assert.equal(stuck.verified, false);
  assert.equal((await reasksOf(stuck)).total, 1, 'broke early after the fresh re-ask repeated the mistake');

  // Pass 2: the original call and the first re-ask both replay from cache
  // (0 fresh calls, same wrong answer both times); the loop reaches the
  // still-untried second attempt for the first time, asks it fresh, and this
  // model answers correctly.
  let boundaryCalls = 0;
  const healed = await run(dirs, ({ step, user }) => {
    if (step === 'boundary') { boundaryCalls += 1; return plainScript({ step, user }); }
    return plainScript({ step, user });
  });
  assert.equal(healed.run_id, stuck.run_id);
  assert.equal(healed.verified, true);
  assert.equal(boundaryCalls, 1, 'exactly one fresh boundary call this pass -- the second attempt');
  const healedReasks = await reasksOf(healed);
  assert.equal(healedReasks.total, 1, 'only the second attempt was fresh; the first attempt replayed from cache');
  assert.deepEqual([healedReasks.entries[0].attempt, healedReasks.entries[0].accepted], [2, true]);
});

// ==================================================================== nature
test('a title naming a project is re-asked, and a run stuck by production’s old behaviour heals on the next pass', async () => {
  // Pass 1's scripted model is capped (`maxCalls: 2`, the test double's own
  // budget -- the pipeline config's `limits.llm_calls` is a separate, real
  // value this mock does not consult) to just the boundary call and the
  // nature call that gets the project-naming title cached: not enough left
  // for the re-ask this fix would otherwise make immediately. This is
  // deliberately the shape a run made *before* this fix would be in: one
  // structurally valid, cached, rejected answer, and nothing else ever
  // tried against it.
  const dirs = await estate();
  const stuckAnswer = await run(dirs, ({ step, user }) => {
    if (step === 'nature') return { segments: segmentIdsInUser(user).map(id => ({ segment_id: id,
      nature: 'project_work', title: 'AB-123 가대 확인', description: '설명', key_terms: [], unclear: false })) };
    return plainScript({ step, user });
  }, { maxCalls: 2 });
  assert.equal(stuckAnswer.verified, false);
  assert.ok(stuckAnswer.remaining_work.some(row => row.step === 'nature'), 'old-style: stuck, nothing re-asked yet');
  assert.equal((await reasksOf(stuckAnswer)).entries.filter(row => row.accepted).length, 0);

  // Pass 2, same session, same run id, ordinary budget: a fresh CLI call
  // replays the cached (rejected) answer, and this fix now re-asks it --
  // for the first time ever against this run directory -- with a model that
  // this time answers cleanly.
  let freshNatureCalls = 0;
  const healed = await run(dirs, ({ step, user }) => {
    if (step === 'nature') { freshNatureCalls += 1; return natureFor(segmentIdsInUser(user)); }
    return plainScript({ step, user });
  });
  assert.equal(healed.run_id, stuckAnswer.run_id, 'the same run, healed in place -- not a new one');
  assert.equal(healed.verified, true);
  assert.ok(freshNatureCalls > 0, 'a genuinely fresh model call happened -- not a replay at 0 calls');
  const healedReasks = await reasksOf(healed);
  const accepted = healedReasks.entries.filter(row => row.reason === 'nature_title_names_a_project' && row.accepted);
  assert.equal(accepted.length, 1, 'exactly one re-ask, accepted');
  assert.equal(accepted[0].attempt, 1);
});

// Two short conversations (rather than the default fixture's one merged
// segment) so a `nature` batch call actually covers more than one segment,
// and so has something to omit.
const twoSegmentBoundary = { segments: [
  { draft_id: 'd1', source_segment_ids: [1, 2, 3], boundary_reason: 'topic_shift', related_draft_ids: [] },
  { draft_id: 'd2', source_segment_ids: [4, 5, 6], boundary_reason: 'topic_shift', related_draft_ids: [] } ] };
const twoSegmentScript = natureScript => ({ step, user }) => {
  if (step === 'boundary') return twoSegmentBoundary;
  if (step === 'nature') return natureScript(user);
  return plainScript({ step, user });
};

test('a nature answer that silently omits one segment from an otherwise valid batch is re-asked for that segment alone', async () => {
  const dirs = await estate();
  let natureCalls = 0;
  const answer = await run(dirs, twoSegmentScript(user => {
    natureCalls += 1;
    const ids = segmentIdsInUser(user);
    if (ids.length > 1) {
      // The batch call answers for every segment except the first --
      // structurally valid JSON (it still matches NATURE_ANSWER), so
      // `makeAsk` caches it as a success.
      return natureFor(ids.slice(1));
    }
    return natureFor(ids);
  }));
  assert.equal(answer.verified, true, 'the single-segment re-ask supplied what the batch omitted');
  assert.ok(natureCalls >= 2, 'the omission cost a real extra call, not a silent 0-call replay');
  assert.ok((await reasksOf(answer)).entries.some(row => row.reason === 'nature_missing_from_batch_answer' && row.accepted));
});

test('a nature answer omitted forever (never healed) is reported by its real cause, not a generic llm_failed', async () => {
  const dirs = await estate();
  const answer = await run(dirs, twoSegmentScript(user => {
    const ids = segmentIdsInUser(user);
    if (ids.length > 1) return natureFor(ids.slice(1));
    return null; // the single-segment re-ask also fails to mention it
  }));
  assert.equal(answer.verified, false);
  assert.ok(answer.remaining_work.some(row => row.reason === 'nature_missing_from_batch_answer'
    || row.reason === 'nature_llm_failed'));
  // Only one re-ask, not the full MAX_SEMANTIC_REASKS: the single-segment
  // re-ask itself came back a genuine call failure (`nature_llm_failed`,
  // not a semantic-rule code), and that code has no re-ask sentence -- a
  // second re-ask with nothing new to say would not help.
  assert.equal((await reasksOf(answer)).total, 1);
});

// A plain `new Map(rows.map(r => [String(r.segment_id), r]))` would silently
// drop an id the batch never had and resolve a repeated id to whichever
// occurrence came last -- now that "absent from this map" is load-bearing
// (`nature_missing_from_batch_answer`, above), a duplicated id or an extra
// id alongside a still-missing one needs its own name and its own re-ask.
// A *bare* extra id -- every wanted id answered exactly once, plus one the
// batch was never asked about -- is accepted instead (R2-1, fresh-eyes
// review round 2): hard-rejecting the whole batch over a single stray row
// would cost one re-ask call per wanted segment for something that was
// never actually missing.
test('a nature batch answer with one extra id but every wanted id present exactly once is accepted, marked, in a single call', async () => {
  const dirs = await estate();
  let natureCalls = 0;
  const answer = await run(dirs, twoSegmentScript(user => {
    natureCalls += 1;
    const ids = segmentIdsInUser(user);
    if (ids.length > 1) {
      // A structurally valid batch answer that names a segment id ('c999')
      // this batch never asked about, alongside both wanted ids intact.
      return natureFor([...ids, 'c999']);
    }
    return natureFor(ids);
  }));
  assert.equal(answer.verified, true);
  assert.equal(natureCalls, 1, 'accepted from the one batch call -- no re-ask needed for a bare extra row');
  const reasks = await reasksOf(answer);
  assert.equal(reasks.total, 0, 'a bare extra id is a mark, not a rejection');
  const list = JSON.parse(await readFile(path.join(answer.directory, 'conversation_list.v0.json'), 'utf8'));
  const marked = list.segments.filter(row => row.nature_marks.includes('nature_batch_answer_extra_ids'));
  assert.equal(marked.length, 2, 'both segments came from the same batch call, so both carry the mark');
});

test('a nature batch answer repeating the same id twice is rejected and re-asked, not silently resolved to the last one', async () => {
  const dirs = await estate();
  const answer = await run(dirs, twoSegmentScript(user => {
    const ids = segmentIdsInUser(user);
    if (ids.length > 1) {
      // Answers for the first segment twice, never mentions the second --
      // duplicated id, not merely a missing one.
      return natureFor([ids[0], ids[0]]);
    }
    return natureFor(ids);
  }));
  assert.equal(answer.verified, true);
  const reasks = await reasksOf(answer);
  assert.ok(reasks.entries.some(row => row.reason === 'nature_batch_answer_ids_invalid' && row.accepted));
});

test('a nature batch answer that is both missing a segment and naming an unknown one is rejected by the id-invalid rule, not the missing rule', async () => {
  const dirs = await estate();
  const answer = await run(dirs, twoSegmentScript(user => {
    const ids = segmentIdsInUser(user);
    // Neither requested id is answered; an unrelated one is, instead --
    // simultaneously "missing" and "extra". The id check runs first and
    // catches it before the per-entry "missing" check would ever fire.
    if (ids.length > 1) return natureFor(['c999']);
    return natureFor(ids);
  }));
  assert.equal(answer.verified, true, 'both segments still got a clean answer via their own re-ask');
  const reasks = await reasksOf(answer);
  assert.ok(reasks.entries.every(row => row.reason !== 'nature_missing_from_batch_answer'),
    'the id-invalid rule caught it first, so the missing-segment code never appears for this batch');
  assert.ok(reasks.entries.filter(row => row.reason === 'nature_batch_answer_ids_invalid').length >= 2);
});

test('a genuine nature call failure is retried fresh on the next pass, never replayed at 0 calls', async () => {
  const dirs = await estate();
  const failedAnswer = await run(dirs, ({ step, user }) => {
    if (step === 'nature') return null; // invalid_json every attempt this pass
    return plainScript({ step, user });
  });
  assert.equal(failedAnswer.verified, false);
  assert.ok(failedAnswer.remaining_work.some(row => row.reason === 'nature_llm_failed'));
  assert.ok(failedAnswer.calls.total > 0, 'the failing attempts still cost real calls this pass');

  let natureCalls = 0;
  const healed = await run(dirs, ({ step, user }) => {
    if (step === 'nature') { natureCalls += 1; return natureFor(segmentIdsInUser(user)); }
    return plainScript({ step, user });
  });
  assert.equal(healed.run_id, failedAnswer.run_id);
  assert.equal(healed.verified, true);
  assert.ok(natureCalls > 0, 'a fresh call was made -- nothing about the failure was cached');
});

test('an oversized long-segment window that fails outright is halved and retried, bounded to one split', async () => {
  // nature_characters low enough that the boundary step's one merged
  // conversation (all six utterances) is both "long" and split by
  // partialWindows into three two-utterance windows.
  const dirs = await estate({ limits: { llm_calls: 60, nature_characters: 60 } });
  const rangeOf = user => { const match = /발화 (\d+)[–-](\d+)/u.exec(user);
    return match ? [Number(match[1]), Number(match[2])] : null; };
  let multiIdCalls = 0, singleIdCalls = 0;
  const answer = await run(dirs, ({ step, user }) => {
    if (step === 'nature') {
      const range = rangeOf(user);
      const count = range ? range[1] - range[0] + 1 : 1;
      if (count > 1) { multiIdCalls += 1; return null; } // simulated truncation on the bigger window
      singleIdCalls += 1;
      return natureFor(segmentIdsInUser(user));
    }
    return plainScript({ step, user });
  });
  assert.equal(answer.verified, true, 'every half-window answered cleanly once split');
  // Each two-utterance window is tried whole first -- and `ask()`'s own
  // retry budget (`limits.retries`, default 2) retries a failed/invalid_json
  // call up to twice more *before* this file's window-split logic ever sees
  // it, so three windows costs 3 x 3 = 9 attempts, not 3.
  assert.equal(multiIdCalls, 9, 'three windows, each retried to the ask() budget before this file splits it');
  assert.equal(singleIdCalls, 6, 'each failed window was halved into two one-utterance windows, all answered');
  // Splits are their own manifest field, not folded into `reasks` (a split
  // is a retry of a call that never produced an answer, not a semantic
  // rejection of one the model gave).
  const splits = await splitsOf(answer);
  assert.equal(splits.total, 3);
  assert.equal(splits.entries.length, 3);
  assert.ok(splits.entries.every(row => row.accepted === true && row.depth === 1));
  assert.equal((await reasksOf(answer)).entries.some(row => row.reason.includes('window_split')), false);
});

// ================================================== nightly re-offering note
test('an unverified run is planned `run` again by classifySession -- not silently skipped', async () => {
  const { classifySession } = await import('../harness/voice_conversation_list_nightly.mjs');
  const { createAliasedStoreIo } = await import('../src/adapters/aliased_store_io.mjs');
  const { readRootTable } = await import('../../path_registry/src/root_table.mjs');
  const { readToolsConfig } = await import('../src/runtime/attachment_derivation.mjs');
  const { VOICE_SESSIONS_ADDRESS } = await import('../harness/voice_segment_drafts.mjs');
  const dirs = await estate();
  await run(dirs, ({ step, user }) => {
    if (step === 'nature') return { segments: segmentIdsInUser(user).map(id => ({ segment_id: id,
      nature: 'project_work', title: 'AB-123 가대 확인', description: '설명', key_terms: [], unclear: false })) };
    return plainScript({ step, user });
  });
  const tableBytes = await readFile(dirs.tablePath);
  const io = createAliasedStoreIo(readRootTable({ tablePath: dirs.tablePath, expectedSha256: `sha256:${hex(tableBytes)}` }));
  const tools = readToolsConfig(await readFile(dirs.toolsPath));
  const described = classifySession({ io, tools, sessionsAddress: VOICE_SESSIONS_ADDRESS,
    date: '2026-01-01', sessionId: SESSION });
  // An unverified run is not `skipped_existing` -- the nightly lane's own
  // classifier already re-offers it every night without any change here.
  // What this fix adds is that a later attempt at it can actually succeed
  // instead of replaying the same rejection (or, for the omitted-segment
  // case, the same silent no-op) forever.
  assert.equal(described.classification, 'run');
  assert.equal(described.existing_run_id, (await readRun({ derivedRoot: dirs.derivedRoot, sessionId: SESSION })).run_id);
});

// ============================================================ coverage
test('SEMANTIC_REASK_SENTENCES has a fixed sentence for every rejection code checkBoundaryProposal or checkNature can return', () => {
  for (const code of BOUNDARY_PROPOSAL_REJECTION_CODES) {
    assert.ok(typeof SEMANTIC_REASK_SENTENCES[code] === 'string' && SEMANTIC_REASK_SENTENCES[code].length > 0,
      `no re-ask sentence for boundary rejection code ${code}`);
  }
  for (const code of NATURE_REJECTION_CODES) {
    assert.ok(typeof SEMANTIC_REASK_SENTENCES[code] === 'string' && SEMANTIC_REASK_SENTENCES[code].length > 0,
      `no re-ask sentence for nature rejection code ${code}`);
  }
  // The two CLI-level codes this file also re-asks (raised here, not by
  // checkNature itself -- see SEMANTIC_REASK_SENTENCES's own doc) are not in
  // either runtime list, so they are asserted by name directly.
  for (const code of ['nature_missing_from_batch_answer', 'nature_batch_answer_ids_invalid']) {
    assert.ok(typeof SEMANTIC_REASK_SENTENCES[code] === 'string' && SEMANTIC_REASK_SENTENCES[code].length > 0, code);
  }
});

// ============================================================ budget guard
test('a nature window split never fires once this run has already spent its budget', async () => {
  // `nature_characters` low enough to force three two-utterance windows (see
  // the window-split test above), and a scripted budget of exactly 2 -- the
  // boundary call and the first (whole, two-utterance, failing) nature
  // window call, with nothing left for a split.
  const dirs = await estate({ limits: { llm_calls: 60, nature_characters: 60 } });
  let natureCalls = 0;
  const answer = await run(dirs, ({ step, user }) => {
    if (step === 'nature') { natureCalls += 1; return null; } // always fails: never produces an answer
    return plainScript({ step, user });
  }, { maxCalls: 2 });
  assert.equal(answer.verified, false);
  // Only the one nature call the budget actually allowed -- `ask()`'s own
  // retry loop never got a chance either, since the mock's budget check runs
  // before it, and no split call was ever attempted after that.
  assert.equal(natureCalls, 1, 'no further calls once budget_exhausted, in ask() retries or in a split');
  const splits = await splitsOf(answer);
  assert.equal(splits.total, 0, 'the split guard held: budget_exhausted stopped it before it could try');
  assert.ok(answer.remaining_work.some(row => row.step === 'nature'));
});

// ============================================================ run_passes.jsonl
test('run_passes.jsonl records reasks/reasks_accepted/splits for this pass, since run_manifest.json is overwritten every pass', async () => {
  const dirs = await estate();
  let boundaryCalls = 0;
  const answer = await run(dirs, ({ step, user }) => {
    if (step === 'boundary') {
      boundaryCalls += 1;
      if (boundaryCalls === 1) {
        const ids = idsInUser(user);
        const mid = Math.ceil(ids.length / 2);
        return { segments: [{ draft_id: 'd2', source_segment_ids: ids.slice(mid), boundary_reason: 'topic_shift',
          related_draft_ids: [] }, { draft_id: 'd1', source_segment_ids: ids.slice(0, mid),
          boundary_reason: 'topic_shift', related_draft_ids: [] }] };
      }
      return plainScript({ step, user });
    }
    return plainScript({ step, user });
  });
  assert.equal(answer.verified, true);
  const passes = (await readFile(path.join(answer.directory, 'run_passes.jsonl'), 'utf8'))
    .split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(passes.length, 1);
  assert.deepEqual([passes[0].reasks, passes[0].reasks_accepted, passes[0].splits], [1, 1, 0],
    'the one accepted re-ask is visible in the append-only pass log, not only in the overwritten manifest');
});

// ============================================================ outcome vs reason
test('a re-ask whose fresh call fails outright records its own outcome, not the semantic reason that triggered it', async () => {
  const dirs = await estate();
  const answer = await run(dirs, ({ step, user }) => {
    if (step === 'boundary') {
      const ids = idsInUser(user);
      // The original answer is missing a segment (a semantic rejection);
      // the one re-ask attempt then fails outright (invalid_json, every
      // attempt within ask()'s own retry budget) rather than repeating that
      // same rejection.
      if (!user.includes('재요청')) {
        return { segments: [{ draft_id: 'd1', source_segment_ids: ids.slice(1), boundary_reason: 'topic_shift',
          related_draft_ids: [] }] };
      }
      return null;
    }
    return plainScript({ step, user });
  });
  assert.equal(answer.verified, false);
  const reasks = await reasksOf(answer);
  assert.equal(reasks.total, 1);
  assert.deepEqual([reasks.entries[0].reason, reasks.entries[0].outcome, reasks.entries[0].accepted],
    ['boundary_segment_missing', 'boundary_llm_failed', false],
    'outcome is the fresh call’s own result, not a repeat of the reason that triggered the attempt');
});
