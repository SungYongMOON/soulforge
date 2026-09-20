// What a confirmed conversation admits, and what it does not.
//
// A recording is not attributable the way a Slack channel or a Linear project
// is: one recording holds several separate conversations, so the only thing that
// places any of it is a person's decision about one conversation. These tests
// hold that boundary from both ends -- nothing but `confirmed` reaches a grant,
// and a grant reaches nothing but the conversation it names -- and then follow
// confirmed conversations through preparation twice, so "a new transcript is
// picked up" and "the same input is not done again" are observed results rather
// than one hopeful sentence.
//
// The mixed-recording fixture near the end is the case the whole design exists
// for: the same part name said in two different projects' conversations, a
// correction that belongs to its own moment, a work conversation nobody could
// hear properly, and an idea that belongs to no project at all.
//
// Every root here is a fresh temp directory and every recording is synthetic.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readRootTable, ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { buildPlaudSessionId, parsePlaudTranscript } from '../../voice_capture/plaud_ingest.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { grantCandidates } from '../harness/estate_inventory.mjs';
import { VOICE_ROUTE_LEDGER_SCHEMA, confirmedSegments, segmentItemId, splitSegmentItemId,
  validateVoiceRouteLedger } from '../harness/voice_routes.mjs';
import { readSemanticSegmentDrafts, sessionAddress, transcriptRunFrom } from '../harness/voice_segment_drafts.mjs';
import { applySegmentDecision, emptyLedger, mergeConversationList, readLedgerFile,
  runVoiceRouteCli } from '../harness/voice_route_cli.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA, validateSourceDocument } from '../src/runtime/source_documents.mjs';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';

const NOW = '2026-09-15T00:00:00.000Z';
const MINE = 'P26-000', OTHER = 'P24-000';
const VOICE_ROOT = 'voice.inbox';
const RUN_ONE = ['analysis', 'local_asr', 'whispercpp_large-v3-turbo-q5_0_ko_v1'];
const RUN_TWO = ['analysis', 'local_asr', 'whispercpp_large-v3-turbo-q5_0_ko_v2_vad'];
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const PROVIDER = [
  '[0:00 - 0:10] 화자 1: 첫 번째 과제의 시험 일정부터 보겠습니다.',
  '[0:10 - 0:25] 화자 2: 장비 반입은 다음 주 화요일로 잡겠습니다.',
  '[0:45 - 0:55] 화자 1: 이제 다른 과제 예산 이야기로 넘어가겠습니다.',
  '[0:55 - 1:10] 화자 3: 예산 항목은 따로 정리해서 올리겠습니다.',
].join('\n');
// The independent run says the same interval differently and carries the extra
// fields the ASR lane writes; the adapter must take it as a transcript all the same.
const INDEPENDENT = [
  '[0:00 - 0:12] 화자 1: 첫 번째 과제 시험 일정을 먼저 보겠습니다.',
  '[0:12 - 0:26] 화자 2: 장비 반입일은 다음 주 화요일로 하겠습니다.',
  '[0:45 - 0:56] 화자 1: 다음은 다른 과제 예산입니다.',
].join('\n');
const REVISED = `${INDEPENDENT}\n[1:10 - 1:20] 화자 2: 반입 시간은 오전으로 정정합니다.`;

const transcriptLines = (text, runId = null) => parsePlaudTranscript(text)
  .map((row, index) => JSON.stringify(runId === null ? row
    : { ...row, analysis_run_id: runId, chunk_index: 0, asr_confidence: 0.7 + index / 100 }))
  .join('\n') + '\n';

/** One estate: a data root holding the voice inbox, a control root holding the ledgers. */
async function estate() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-voice-data-'));
  const controlRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-voice-control-'));
  const tableDir = await mkdtemp(path.join(os.tmpdir(), 'ctx-voice-table-'));
  const tablePath = path.join(tableDir, 'estate_roots.json');
  const bytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  await writeFile(tablePath, bytes);
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: sha(bytes) }));
  // The adapter finds a recording below `sessions/<date>/`, so the root a binding
  // declares is the folder that holds `sessions`, not the sessions folder itself.
  const plaudRoot = path.join(dataRoot, 'ingress', 'plaud');
  const sessionsRoot = path.join(plaudRoot, 'sessions');
  await mkdir(sessionsRoot, { recursive: true });
  const routesDir = path.join(controlRoot, 'voice-routes');
  await mkdir(routesDir, { recursive: true });
  return { dataRoot, controlRoot, io, plaudRoot, sessionsRoot, routesDir, tablePath,
    tableSha256: sha(bytes) };
}

/** One synthetic recording with a provider transcript and one independent run. */
async function session(estateDirs, { seed, date = '2026-09-11', provider = PROVIDER,
  runs = { [RUN_ONE.at(-1)]: INDEPENDENT }, duration = 80 } = {}) {
  const sessionId = buildPlaudSessionId(new Date('2026-09-11T01:00:00.000Z'), seed);
  const dir = path.join(estateDirs.sessionsRoot, date, sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'transcript.jsonl'), transcriptLines(provider));
  await writeFile(path.join(dir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId, source: 'plaud_cli_import',
    provider_recording_id: seed, source_page_title: '합성 회의 녹음', recorded_at_local: '2026-09-11T10:00:00+09:00',
    imported_at_local: '2026-09-11T11:30:00+09:00', duration_seconds: duration,
    transcript: { status: 'provider_transcript_present_unverified', quality: 'provider_machine_transcript_unverified' },
    independent_transcription: { status: 'completed', evidence_role: 'independent_machine_transcript_unverified' },
    canonicalization: { state: 'independent_transcript_ready_project_match_and_review_required' } }));
  for (const [runId, text] of Object.entries(runs)) {
    const runDir = path.join(dir, 'analysis', 'local_asr', runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, 'transcript.jsonl'), transcriptLines(text, runId));
  }
  return { sessionId, dir };
}

const candidate = (code, basis = '회신 메일과 과제 코드가 같은 시험을 가리킴', evidenceRefs = []) =>
  ({ project_code: code, evidence_refs: [...evidenceRefs], basis });

/**
 * The utterances an interval overlaps -- what a scope of seconds used to select
 * on its own. Fixtures written before conversations named their utterances go on
 * meaning exactly what they meant, and the one test that is about the difference
 * names its ids itself.
 */
const idsIn = (text, from, to) => parsePlaudTranscript(text)
  .filter(row => row.end_seconds > from && row.start_seconds < to).map(row => row.segment_id);

/** One conversation segment row, with everything a ledger needs and nothing more. */
const segment = (segmentId, from, to, extra = {}) => ({ segment_id: segmentId,
  source_segment_ids: idsIn(extra.transcript ?? INDEPENDENT, from, to),
  start_seconds: from, end_seconds: to, title: '합성 구간 요약', description: null, derived_summary: true,
  nature: 'project_work', project_candidates: [], status: 'unclassified',
  quality: { transcript: 'independent_fast', correction_state: 'none' },
  transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
  judged_by: 'actor:bot:context-planner', judged_at: NOW, confirmed_by: null, confirmed_at: null,
  ...(({ transcript, ...rest }) => rest)(extra) });

const confirmed = (segmentId, from, to, code, extra = {}) => segment(segmentId, from, to,
  { status: 'confirmed', project_candidates: [candidate(code)], confirmed_by: 'actor:owner',
    confirmed_at: NOW, ...extra });

const ledgerFor = (sessionId, segments) => ({ schema_version: VOICE_ROUTE_LEDGER_SCHEMA,
  session_id: sessionId, segments, updated_at: NOW });

const writeLedger = (estateDirs, ledger) =>
  writeFile(path.join(estateDirs.routesDir, `${ledger.session_id}.json`), `${JSON.stringify(ledger, null, 2)}\n`);

const writeIndex = (estateDirs, recordings) => mkdir(path.join(estateDirs.dataRoot, 'ingress', 'plaud', 'library', 'index'),
  { recursive: true }).then(() => writeFile(
  path.join(estateDirs.dataRoot, 'ingress', 'plaud', 'library', 'index', 'recordings.current.json'),
  `${JSON.stringify({ schema_version: 'soulforge.voice_recording_library_index.v0',
    generated_at: NOW, recording_count: recordings.length, recordings }, null, 2)}\n`));

const indexRow = (sessionId, routeState) => ({ schema_version: 'soulforge.voice_recording_library_entry.v0',
  recording_id: `rec-${sessionId}`, session_id: sessionId, recording_date: '2026-09-11',
  route_state: { project_code_candidate: 'P00-000_INBOX', route_status: 'unclassified_needs_owner_confirmation',
    accepted_project_code: null, accepted_by: null, accepted_at: null, ...routeState } });

const candidatesFor = (estateDirs, code, roots = { [VOICE_ROOT]: 'data_root/ingress/plaud' }) =>
  grantCandidates({ io: estateDirs.io, code, roots, dataClass: 'public_synthetic' });

const grantOf = items => ({ schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.voice',
  project_ref: ref(1), purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
  valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
  sources: [{ kind: 'voice', root_ref: VOICE_ROOT, items }] });

// --------------------------------------------------------------- admission

test('only a confirmed conversation reaches a grant; a proposal and an unplaced one reach nothing', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  const proposed = await session(dirs, { seed: 's0002abcdef' });
  const theirs = await session(dirs, { seed: 's0003abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [confirmed('seg-a', 0, 40, MINE)]));
  // A recording an investigator looked at: a proposal for my project and a
  // conversation they could not place. Neither is a decision.
  await writeLedger(dirs, ledgerFor(proposed.sessionId, [
    segment('seg-a', 0, 30, { status: 'candidate', project_candidates: [candidate(MINE)] }),
    segment('seg-b', 30, 60, { status: 'unclassified', nature: 'undetermined' })]));
  await writeLedger(dirs, ledgerFor(theirs.sessionId, [confirmed('seg-a', 0, 60, OTHER)]));

  const candidates = candidatesFor(dirs, MINE);
  assert.deepEqual(candidates.map(source => source.kind), ['voice']);
  assert.deepEqual(candidates[0].items.map(item => item.item_id), [segmentItemId(mine.sessionId, 'seg-a')],
    'a proposal, an unplaced conversation and another project’s decision are all absent');
  const item = candidates[0].items[0];
  assert.deepEqual(item.scope, { start_seconds: 0, end_seconds: 40, segment_ids: [1, 2] },
    'the interval says where the conversation is; the ids say what it is made of');
  assert.deepEqual(item.conversation_segment,
    { segment_id: 'seg-a', title: '합성 구간 요약', nature: 'project_work', related_segment_ids: [] });
  assert.equal(item.revision_policy, 'latest_in_custody');
  assert.deepEqual(splitSegmentItemId(item.item_id), { session_id: mine.sessionId, segment_id: 'seg-a' });
  assert.equal(candidates.voice.confirmed_from_ledger, 1);
  assert.deepEqual(candidates.voice.ledgers_refused, []);
  assert.deepEqual(candidatesFor(dirs, OTHER)[0].items.map(item_ => splitSegmentItemId(item_.item_id).session_id),
    [theirs.sessionId]);
});

test('every confirmed conversation in one recording is its own item, and its own document', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [
    confirmed('seg-a', 0, 20, MINE), confirmed('seg-b', 45, 60, MINE),
    segment('seg-c', 20, 45, { status: 'candidate', project_candidates: [candidate(MINE)] })]));
  const items = candidatesFor(dirs, MINE)[0].items;
  assert.deepEqual(items.map(row => row.conversation_segment.segment_id), ['seg-a', 'seg-b'],
    'two conversations a gap apart are two decisions, and the gap between them is admitted by neither');
  const prepared = await prepareSourceDocuments({ grant: grantOf(items),
    roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  assert.equal(prepared.documents.length, 2);
  assert.equal(new Set(prepared.documents.map(row => row.doc_key)).size, 2);
});

test('a project whose binding names no voice root gets no voice items, however many confirmations exist', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [confirmed('seg-a', 0, 40, MINE)]));
  const candidates = candidatesFor(dirs, MINE, { 'slack.channel': 'data_root/ingress/slack/channels/P26-000' });
  assert.deepEqual([...candidates], [], 'the ledger does not reach a project the binding never opened this root for');
  assert.equal(candidates.voice, undefined, 'and nothing is reported about a root that was not looked at');
});

test('a decision without a person, or about two projects at once, is not a decision', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  const ledger = segments => ledgerFor(mine.sessionId, segments);
  assert.throws(() => validateVoiceRouteLedger(ledger([confirmed('seg-a', 0, 40, MINE, { confirmed_by: null })])),
    /voice_route_segment_invalid/u);
  assert.throws(() => validateVoiceRouteLedger(ledger([confirmed('seg-a', 0, 40, MINE, { confirmed_at: 'yesterday' })])),
    /voice_route_segment_invalid/u);
  assert.throws(() => validateVoiceRouteLedger(ledger([confirmed('seg-a', 0, 40, MINE,
    { project_candidates: [candidate(MINE), candidate(OTHER)] })])), /voice_route_segment_invalid/u,
  'two projects is not a placement, it is the question still being open');
  assert.throws(() => validateVoiceRouteLedger(ledger([confirmed('seg-a', 0, 40, MINE, { project_candidates: [] })])),
    /voice_route_segment_invalid/u);
  assert.throws(() => validateVoiceRouteLedger(ledger([segment('seg-a', 0, 40,
    { project_candidates: [{ project_code: MINE, evidence_refs: [], basis: null }] })])), /voice_route_segment_invalid/u,
  'a project code with no stated basis is a guess, not a candidate');
  assert.throws(() => validateVoiceRouteLedger(ledger([segment('seg-a', 0, 40, { derived_summary: false })])),
    /voice_route_segment_invalid/u, 'nothing in this ledger is ever the words that were said');
  assert.throws(() => validateVoiceRouteLedger(ledger([segment('seg-a', 0, 40), segment('seg-a', 40, 60)])),
    /voice_route_segment_id_repeated/u);
  assert.throws(() => validateVoiceRouteLedger(ledger([segment('seg-a', 0, 40, { related_segment_ids: ['seg-z'] })])),
    /voice_route_related_segment_unknown/u);

  await writeFile(path.join(dirs.routesDir, `${mine.sessionId}.json`), '{ not a ledger');
  const candidates = candidatesFor(dirs, MINE);
  assert.deepEqual([...candidates], []);
  assert.deepEqual(candidates.voice.ledgers_refused,
    [{ session_id: mine.sessionId, code: 'voice_route_ledger_unreadable' }]);
});

test('another owner’s record in the same folder is left alone, not read as a broken ledger', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [confirmed('seg-a', 0, 40, MINE)]));
  // The voice inbox access declaration the reading CLI looks for lives here too.
  await writeFile(path.join(dirs.routesDir, 'inbox_access.v0.json'),
    `${JSON.stringify({ schema: 'soulforge.voice_inbox_access.v0', actor_ref: 'actor:owner:context-reader',
      purpose: 'voice_route_review', revoked: false }, null, 2)}\n`);

  const candidates = candidatesFor(dirs, MINE);
  assert.equal(candidates[0].items.length, 1);
  assert.deepEqual(candidates.voice.ledgers_refused, [], 'it is not a ledger, so it is not a broken one');
  assert.deepEqual(candidates.voice.other_schemas_in_folder,
    [{ file: 'inbox_access.v0.json', schema: 'soulforge.voice_inbox_access.v0' }]);
  const listed = runVoiceRouteCli(['list', '--routes-dir', dirs.routesDir]);
  assert.deepEqual(listed.ledgers.map(row => row.session_id), [mine.sessionId]);
  assert.deepEqual(listed.other_schemas.map(row => row.file), ['inbox_access.v0.json']);
});

test('the recording library’s accepted route is the same decision about the whole recording', async () => {
  const dirs = await estate();
  const accepted = await session(dirs, { seed: 's0001abcdef' });
  const halfAccepted = await session(dirs, { seed: 's0002abcdef' });
  await writeIndex(dirs, [
    indexRow(accepted.sessionId, { route_status: 'accepted_project_route', accepted_project_code: MINE,
      accepted_by: 'actor:owner', accepted_at: NOW }),
    // An acceptance with no acceptor is not one, by the same rule a segment follows.
    indexRow(halfAccepted.sessionId, { route_status: 'accepted_project_route', accepted_project_code: MINE,
      accepted_by: null, accepted_at: NOW })]);

  const candidates = candidatesFor(dirs, MINE);
  assert.deepEqual(candidates[0].items.map(item => item.item_id), [accepted.sessionId]);
  assert.equal(Object.hasOwn(candidates[0].items[0], 'scope'), false, 'the whole recording is not a part of it');
  assert.equal(Object.hasOwn(candidates[0].items[0], 'conversation_segment'), false);
  assert.deepEqual([candidates.voice.confirmed_from_index, candidates.voice.library_index_read], [1, true]);

  // A recording both records decide about is left out rather than resolved by order.
  await writeLedger(dirs, ledgerFor(accepted.sessionId, [confirmed('seg-a', 0, 25, MINE)]));
  const both = candidatesFor(dirs, MINE);
  assert.deepEqual([...both], []);
  assert.deepEqual(both.voice.skipped,
    [{ session_id: accepted.sessionId, code: 'ledger_and_index_disagree', segments: 1 }]);
});

// ------------------------------------------------------------- preparation

test('a confirmed conversation prepares that conversation only, from the transcript run the ledger names', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [confirmed('seg-a', 0, 40, MINE,
    { transcript_ref: RUN_ONE, title: '시험 일정 합의', related_segment_ids: [] })]));
  const items = candidatesFor(dirs, MINE)[0].items;
  assert.deepEqual(items[0].transcript_ref, RUN_ONE);

  const prepared = await prepareSourceDocuments({ grant: grantOf(items),
    roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  const document = prepared.documents[0];
  assert.ok(validateSourceDocument(document));
  assert.deepEqual(document.scope, { start_seconds: 0, end_seconds: 40, segment_ids: [1, 2] });
  assert.ok(document.units.every(unit => unit.locator.start_seconds < 40),
    'the part of the recording that belongs to another conversation is not in the document');
  assert.equal(document.units.some(unit => unit.text.includes('예산')), false);
  assert.equal(document.units[0].locator.session_id, mine.sessionId,
    'a unit is located in the recording, and the conversation is what the document is');
  // Which conversation, what somebody called it, and that the name is a summary.
  const fact = name => document.facts.find(row => row.name === name)?.value;
  assert.equal(fact('voice.conversation_segment_id'), 'seg-a');
  assert.equal(fact('voice.conversation_segment_title'), '시험 일정 합의');
  assert.equal(fact('voice.conversation_segment_title_is_derived'), true);
  assert.equal(fact('voice.conversation_nature'), 'project_work');
  assert.equal(document.title, '시험 일정 합의', 'the document is named for the conversation, not the recording');
  assert.equal(fact('voice.transcript_ref'), RUN_ONE.join('/'));
  assert.equal(fact('voice.transcript_evidence_role'), 'independent_machine_transcript_unverified');
  assert.equal(document.units[0].text.includes('먼저'), true, 'the run’s wording, not the provider’s');
});

test('a whole-recording item still prepares exactly as it did, with no conversation facts', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  const whole = { item_id: mine.sessionId, revision_policy: 'latest_in_custody', revision_sha256: null,
    data_class: 'public_synthetic' };
  const prepared = await prepareSourceDocuments({ grant: grantOf([whole]),
    roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  const document = prepared.documents[0];
  assert.deepEqual(document.facts.map(row => row.name), ['voice.provider_recording_id', 'voice.duration_seconds',
    'voice.transcript_quality', 'voice.speaker_label_count', 'voice.canonicalization_state']);
  assert.equal(document.title, '합성 회의 녹음');
  assert.equal(document.scope, null);
});

test('a run the ledger names but the recording does not hold is reported as that, not as a missing recording', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [confirmed('seg-a', 0, 40, MINE, { transcript_ref: RUN_TWO })]));
  const prepared = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items),
    roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  assert.deepEqual(prepared.coverage.items.map(row => [row.status, row.code]), [['missing', 'transcript_run_absent']]);
});

test('a new transcript is picked up as a change to that one document, and the same input again is no work at all', async () => {
  const dirs = await estate();
  const changing = await session(dirs, { seed: 's0001abcdef' });
  const still = await session(dirs, { seed: 's0002abcdef' });
  await writeLedger(dirs, ledgerFor(changing.sessionId, [confirmed('seg-a', 0, 40, MINE, { transcript_ref: RUN_ONE })]));
  await writeLedger(dirs, ledgerFor(still.sessionId, [confirmed('seg-a', 0, 40, MINE, { transcript_ref: RUN_ONE })]));
  const roots = { [VOICE_ROOT]: dirs.plaudRoot };

  const first = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items), roots, now: NOW });
  assert.equal(first.documents.length, 2);

  // Nothing happened in between: the same two recordings, the same two runs.
  const again = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items), roots, now: NOW,
    previousCoverage: first.coverage });
  assert.deepEqual([again.changes.added.length, again.changes.changed.length, again.changes.removed.length], [0, 0, 0]);
  assert.equal(again.changes.unchanged.length, 2);
  assert.deepEqual(again.documents.map(row => row.doc_key).sort(), first.documents.map(row => row.doc_key).sort(),
    'the same input is the same document, so a pass has nothing to extract or embed again');

  // The ASR lane rewrites one recording's run in place.
  await writeFile(path.join(changing.dir, 'analysis', 'local_asr', RUN_ONE.at(-1), 'transcript.jsonl'),
    transcriptLines(REVISED, RUN_ONE.at(-1)));
  const rewritten = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items), roots, now: NOW,
    previousCoverage: first.coverage });
  assert.deepEqual(rewritten.changes.changed.map(row => splitSegmentItemId(row.item_id).session_id), [changing.sessionId]);
  assert.deepEqual(rewritten.changes.unchanged.map(row => splitSegmentItemId(row.item_id).session_id), [still.sessionId]);
  assert.deepEqual([rewritten.changes.added.length, rewritten.changes.removed.length], [0, 0]);

  // And a ledger re-pointed at a second run is the same kind of change.
  await mkdir(path.join(still.dir, 'analysis', 'local_asr', RUN_TWO.at(-1)), { recursive: true });
  await writeFile(path.join(still.dir, 'analysis', 'local_asr', RUN_TWO.at(-1), 'transcript.jsonl'),
    transcriptLines(REVISED, RUN_TWO.at(-1)));
  await writeLedger(dirs, ledgerFor(still.sessionId, [confirmed('seg-a', 0, 40, MINE, { transcript_ref: RUN_TWO })]));
  const repointed = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items), roots, now: NOW,
    previousCoverage: rewritten.coverage });
  assert.deepEqual(repointed.changes.changed.map(row => splitSegmentItemId(row.item_id).session_id), [still.sessionId]);
  assert.deepEqual(repointed.changes.unchanged.map(row => splitSegmentItemId(row.item_id).session_id), [changing.sessionId]);
});

// ------------------------------------------------- the mixed recording case

// The same part name is said in two different projects' conversations; a date is
// corrected later in its own moment; one work conversation was barely audible;
// and one stretch is an idea belonging to no project. Built long enough that the
// conversations really do sit at different places in the recording.
const MIXED = [
  '[0:00 - 0:20] 화자 1: 수신부 CDR 준비 상태부터 확인하겠습니다.',
  '[0:20 - 0:50] 화자 2: 수신부 조립은 다음 주 수요일에 끝납니다.',
  '[1:05 - 1:30] 화자 1: 여기서는 다른 과제의 수신부 CDR 일정을 보겠습니다.',
  '[1:30 - 1:55] 화자 3: 그쪽 수신부는 외주 일정이 아직 안 잡혔습니다.',
  '[2:05 - 2:20] 화자 2: 아까 말한 수요일은 목요일로 정정합니다.',
  '[2:30 - 2:50] 화자 1: (잡음) 시험 장비 반입 관련해서 잘 안 들리는 부분입니다.',
  '[3:05 - 3:25] 화자 3: 이건 과제하고 상관없는 생각인데 측정 자동화를 해보면 좋겠습니다.',
].join('\n');

async function mixedEstate() {
  const dirs = await estate();
  const mixed = await session(dirs, { seed: 's0009abcdef', provider: MIXED, duration: 240,
    runs: { [RUN_ONE.at(-1)]: MIXED } });
  await writeLedger(dirs, ledgerFor(mixed.sessionId, [
    confirmed('seg-a', 0, 60, MINE, { transcript: MIXED, title: '수신부 CDR 준비 상태 확인', transcript_ref: RUN_ONE,
      project_candidates: [candidate(MINE, '조립 완료일이 이 과제 회신 메일과 같은 주차', ['mail:m-1'])] }),
    // The same words in a conversation nobody has placed. A shared part name is
    // not a project, and a row whose only basis is the shared name stays a proposal.
    segment('seg-b', 60, 90, { transcript: MIXED, status: 'candidate', title: '수신부 CDR 언급 구간',
      transcript_ref: RUN_ONE,
      project_candidates: [candidate(MINE, '같은 부품 이름이 나옴'), candidate(OTHER, '같은 부품 이름이 나옴')] }),
    confirmed('seg-c', 90, 120, OTHER, { transcript: MIXED, title: '다른 과제 수신부 외주 일정', transcript_ref: RUN_ONE,
      project_candidates: [candidate(OTHER, '외주 업체명이 이 과제 발주 건과 일치', ['linear:X-1'])] }),
    confirmed('seg-d', 120, 145, MINE, { transcript: MIXED, title: '조립 완료일 정정', transcript_ref: RUN_ONE,
      related_segment_ids: ['seg-a'],
      project_candidates: [candidate(MINE, '정정 대상이 seg-a의 같은 일정', ['mail:m-1'])] }),
    // Barely audible, and still work: the quality is what was poor, not the kind
    // of conversation it was.
    confirmed('seg-e', 145, 175, MINE, { transcript: MIXED, title: '시험 장비 반입 논의(일부 판독 불가)', nature: 'unreadable',
      transcript_ref: RUN_ONE, quality: { transcript: 'independent_fast', correction_state: 'none' },
      project_candidates: [candidate(MINE, '반입 대상이 이 과제 시험 장비', ['linear:Y-1'])] }),
    segment('seg-f', 175, 230, { transcript: MIXED, status: 'unclassified', nature: 'idea', title: '측정 자동화 아이디어',
      transcript_ref: RUN_ONE })]));
  return { dirs, mixed };
}

test('a shared part name does not place a conversation, and every placed work conversation still arrives', async () => {
  const { dirs, mixed } = await mixedEstate();
  const items = candidatesFor(dirs, MINE)[0].items;
  assert.deepEqual(items.map(item => item.conversation_segment.segment_id), ['seg-a', 'seg-d', 'seg-e'],
    'the two conversations that share the part name are not both mine, and none of my work conversations is dropped');
  assert.deepEqual(candidatesFor(dirs, OTHER)[0].items.map(item => item.conversation_segment.segment_id), ['seg-c']);

  // The unplaced one stays exactly where it is, with both proposals intact: an
  // early classification removes nothing.
  const held = readLedgerFile(dirs.routesDir, mixed.sessionId).ledger;
  const kept = held.segments.find(row => row.segment_id === 'seg-b');
  assert.deepEqual([kept.status, kept.project_candidates.map(row => row.project_code)], ['candidate', [MINE, OTHER]]);
  assert.equal(held.segments.length, 6, 'nothing is deleted by being classified, or by not being classified');

  // A barely audible work conversation is poor quality, never everyday talk.
  const hard = items.find(item => item.conversation_segment.segment_id === 'seg-e');
  assert.equal(hard.conversation_segment.nature, 'unreadable');
  assert.notEqual(hard.conversation_segment.nature, 'daily');

  // The correction is its own moment, linked to what it corrects rather than
  // folded into it.
  const correction = items.find(item => item.conversation_segment.segment_id === 'seg-d');
  assert.deepEqual(correction.conversation_segment.related_segment_ids, ['seg-a']);
  assert.deepEqual(correction.scope, { start_seconds: 120, end_seconds: 145, segment_ids: [5] });
  assert.equal(items.find(item => item.conversation_segment.segment_id === 'seg-a').scope.end_seconds, 60,
    'the corrected conversation keeps its own interval; the correction is not merged into it');

  // An idea belongs to no project, so it is in no project's grant, and it is
  // still in the ledger for whoever wants it later.
  assert.equal(items.some(item => item.conversation_segment.segment_id === 'seg-f'), false);
  assert.equal(held.segments.find(row => row.segment_id === 'seg-f').nature, 'idea');
});

test('the mixed recording prepares as separate documents, each holding only its own conversation', async () => {
  const { dirs } = await mixedEstate();
  const roots = { [VOICE_ROOT]: dirs.plaudRoot };
  const mineDocs = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items), roots, now: NOW });
  const theirDocs = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, OTHER)[0].items), roots, now: NOW });
  assert.equal(mineDocs.documents.length, 3);
  assert.equal(theirDocs.documents.length, 1);
  const byId = new Map(mineDocs.documents.map(row => [row.facts.find(f => f.name === 'voice.conversation_segment_id').value, row]));
  // The other project's conversation says the same part name; it is in that
  // project's document and in none of mine.
  assert.equal([...byId.values()].some(document => document.units.some(unit => unit.text.includes('외주'))), false);
  assert.equal(theirDocs.documents[0].units.some(unit => unit.text.includes('외주')), true);
  assert.equal(byId.get('seg-d').units.some(unit => unit.text.includes('정정')), true);
  assert.equal(byId.get('seg-a').units.some(unit => unit.text.includes('정정')), false);
  assert.equal(byId.get('seg-e').title, '시험 장비 반입 논의(일부 판독 불가)');
  assert.equal(new Set([...byId.values(), theirDocs.documents[0]].map(row => row.doc_key)).size, 4);
});

// ------------------------------------------------------- drafts from labels

test('the first draft of a recording’s conversations comes from the semantic labels, not from a new splitter', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  const runId = 'vsl_synthetic0001';
  const labelDir = path.join(mine.dir, 'analysis', 'semantic_labels', runId);
  await mkdir(labelDir, { recursive: true });
  await writeFile(path.join(labelDir, 'semantic_label_run.json'), JSON.stringify({
    schema_version: 'soulforge.voice_semantic_label_run.v1', run_id: runId,
    recording_ref: { recording_id: mine.sessionId,
      transcript_ref: `ingress/plaud/sessions/2026-09-11/${mine.sessionId}/${RUN_ONE.join('/')}/transcript.jsonl` },
    evidence_gate: { input_class: 'independent_asr_fast', state: 'stronger_local_asr_required',
      project_candidate_emission_allowed: false },
    segment_labels: [
      { unit_id: 'unit_1_14', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 26,
        speech_acts: ['deadline_mention'], action_codes: ['test_or_measure'], disposition: 'material_ambiguity_deferred',
        entities: [{ kind: 'date_or_period', value: '화요일', value_sha256: 'a'.repeat(64) }],
        project_match: { state: 'unresolved_needs_context', candidates: [] } },
      { unit_id: 'unit_15_22', source_segment_ids: [3], start_seconds: 45, end_seconds: 56,
        speech_acts: ['topic_shift'], action_codes: [], disposition: 'context_only', entities: [],
        project_match: { state: 'unresolved_needs_context', candidates: [] } }],
    review_windows: [{ window_id: 'vrw_1', start_seconds: 0, duration_seconds: 30, source_unit_refs: ['unit_1_14'],
      importance_state: 'material_ambiguity_candidate', escalation_state: 'stronger_local_asr_required',
      human_listen_required: true }],
    coverage: { semantic_unit_count: 2 }, project_resolution: { state: 'stronger_local_asr_required' },
    boundaries: { transcript_body_copied_to_output: false } }));

  const session_ = sessionAddress({ io: dirs.io, sessionId: mine.sessionId });
  assert.equal(session_, `data_root/ingress/plaud/sessions/2026-09-11/${mine.sessionId}`);
  const found = readSemanticSegmentDrafts({ io: dirs.io, session: session_, sessionId: mine.sessionId });
  assert.deepEqual(found.drafts.map(draft => draft.segment.segment_id), ['unit_1_14', 'unit_15_22']);
  const first = found.drafts[0];
  assert.deepEqual([first.segment.start_seconds, first.segment.end_seconds], [0, 26],
    'the boundary is the lane’s semantic unit, not a fixed number of seconds or a change of speaker');
  assert.deepEqual([first.segment.status, first.segment.nature, first.segment.title], ['unclassified', 'undetermined', null]);
  assert.deepEqual(first.segment.transcript_ref, RUN_ONE, 'the run the labelling actually read is the run to read');
  assert.equal(first.segment.quality.transcript, 'independent_fast');
  assert.deepEqual(first.segment.project_candidates, [], 'the label run may not emit project candidates yet, and none are invented');
  // Hints carry kinds and codes, never the words behind them.
  assert.deepEqual(first.hints.entity_kinds, ['date_or_period']);
  assert.equal(JSON.stringify(found.drafts).includes('화요일'), false, 'no entity value leaves the label run');
  assert.deepEqual([first.hints.human_listen_required, first.hints.importance_states],
    [true, ['material_ambiguity_candidate']]);
  assert.equal(found.run.evidence_gate.project_candidate_emission_allowed, false);
  assert.equal(transcriptRunFrom({ transcript_ref: 'a/b' }, mine.sessionId), null, 'a ref that names no session is nothing');

  // Written in, the drafts become unplaced segments a person can then decide on,
  // and a second pass adds nothing and overwrites nothing.
  const written = runVoiceRouteCli(['draft', '--session', mine.sessionId, '--routes-dir', dirs.routesDir,
    '--root-table', dirs.tablePath, '--root-table-sha256', dirs.tableSha256, '--write', '--by', 'actor:owner',
    '--now', NOW]);
  assert.deepEqual([written.added, written.unclassified, written.confirmed], [2, 2, 0]);
  runVoiceRouteCli(['confirm', '--session', mine.sessionId, '--segment', 'unit_1_14', '--project', MINE,
    '--basis', '반입일이 이 과제 회신과 같음', '--title', '시험 일정 합의', '--nature', 'project_work',
    '--by', 'actor:owner', '--routes-dir', dirs.routesDir, '--now', NOW]);
  const second = runVoiceRouteCli(['draft', '--session', mine.sessionId, '--routes-dir', dirs.routesDir,
    '--root-table', dirs.tablePath, '--root-table-sha256', dirs.tableSha256, '--write', '--by', 'actor:owner',
    '--now', NOW]);
  assert.deepEqual([second.added, second.confirmed], [0, 1], 'a draft pass never reopens a decision');
});

test('a conversation is addressed in whole seconds, because a fraction cannot be part of a grant’s identity', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  // A semantic unit ends where a transcript row ends, which is rarely a whole
  // second. The rows below are written as the ASR lane writes them.
  const rows = [
    { schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: 1, start_seconds: 0, end_seconds: 57.82,
      speaker: '화자 1', content: '첫 번째 대화입니다.', source: 'whisper_cpp_independent_local' },
    { schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: 2, start_seconds: 57.82, end_seconds: 121.48,
      speaker: '화자 2', content: '두 번째 대화입니다.', source: 'whisper_cpp_independent_local' }];
  const runDir = path.join(mine.dir, 'analysis', 'local_asr', RUN_ONE.at(-1));
  await writeFile(path.join(runDir, 'transcript.jsonl'), rows.map(row => JSON.stringify(row) + String.fromCharCode(10)).join(''));
  const labelDir = path.join(mine.dir, 'analysis', 'semantic_labels', 'vsl_fractional');
  await mkdir(labelDir, { recursive: true });
  await writeFile(path.join(labelDir, 'semantic_label_run.json'), JSON.stringify({
    schema_version: 'soulforge.voice_semantic_label_run.v1', run_id: 'vsl_fractional',
    recording_ref: { recording_id: mine.sessionId,
      transcript_ref: `ingress/plaud/sessions/2026-09-11/${mine.sessionId}/${RUN_ONE.join('/')}/transcript.jsonl` },
    evidence_gate: { input_class: 'independent_asr_fast' },
    segment_labels: [
      { unit_id: 'unit_1', source_segment_ids: [1], start_seconds: 0, end_seconds: 57.82, entities: [],
        project_match: { state: 'x', candidates: [] } },
      { unit_id: 'unit_2', source_segment_ids: [2], start_seconds: 57.82, end_seconds: 121.48, entities: [],
        project_match: { state: 'x', candidates: [] } },
      // Shorter than the rounding: not an interval anybody can address.
      { unit_id: 'unit_3', source_segment_ids: [3], start_seconds: 130.1, end_seconds: 130.3, entities: [],
        project_match: { state: 'x', candidates: [] } }],
    review_windows: [], boundaries: { transcript_body_copied_to_output: false } }));

  const found = readSemanticSegmentDrafts({ io: dirs.io,
    session: sessionAddress({ io: dirs.io, sessionId: mine.sessionId }), sessionId: mine.sessionId });
  assert.deepEqual(found.drafts.map(draft => [draft.segment.start_seconds, draft.segment.end_seconds]),
    [[0, 58], [58, 121]], 'both sides of a shared boundary round the same way, so no gap opens between them');
  assert.deepEqual(found.drafts.map(draft => draft.segment.source_segment_ids), [[1], [2]],
    'and the draft says which utterances it is made of, which the rounded interval cannot');
  assert.equal(found.units_shorter_than_a_second, 1);
  assert.ok(found.drafts.every(draft => Number.isSafeInteger(draft.segment.start_seconds)));

  // The two utterances are two different conversations. Addressed by whole
  // seconds alone, the second one arrives inside the first one's document --
  // 57.82 and 58 both round to 58 and the overlap test keeps anything that
  // starts before the end. That is the cost the rounding was chosen to pay.
  const byInterval = await prepareSourceDocuments({ grant: grantOf([{ item_id: mine.sessionId,
    revision_policy: 'latest_in_custody', revision_sha256: null, data_class: 'public_synthetic',
    transcript_ref: RUN_ONE, scope: { start_seconds: 0, end_seconds: 58 } }]),
  roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  assert.deepEqual(byInterval.documents[0].units.map(unit => unit.locator.segment_id), [1, 2],
    'the interval alone cannot tell the utterance at the seam from the one before it');

  // Naming the utterances answers exactly that question, and the whole path --
  // grant identity, document key, run record -- still holds for a recording whose
  // own offsets are fractional.
  await writeLedger(dirs, ledgerFor(mine.sessionId, [
    confirmed('unit_1', 0, 58, MINE, { transcript_ref: RUN_ONE, title: '첫 대화', source_segment_ids: [1] })]));
  const items = candidatesFor(dirs, MINE)[0].items;
  assert.deepEqual(items[0].scope, { start_seconds: 0, end_seconds: 58, segment_ids: [1] });
  const prepared = await prepareSourceDocuments({ grant: grantOf(items),
    roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW, runId: 'prep-voice-fractional',
    clock: () => new Date(NOW) });
  assert.equal(prepared.run_unavailable, null, 'a fractional offset inside the document is not part of any digest');
  assert.ok(validateSourceDocument(prepared.documents[0]));
  assert.deepEqual(prepared.documents[0].units.map(unit => unit.locator.segment_id), [1],
    'the utterance that opens the next conversation stays in the next conversation');
  assert.deepEqual(prepared.documents[0].units.map(unit => unit.locator.end_seconds), [57.82],
    'and the fractional offset the ASR wrote is carried through the document unrounded');
  assert.notEqual(prepared.documents[0].doc_key, byInterval.documents[0].doc_key,
    'the ids are part of what the document is, so the two readings are two documents');

  // An id the granted revision does not hold is a stale grant. There is no wider
  // or narrower interval that would be the same conversation, so nothing is
  // widened to make the ids fit.
  const missing = await prepareSourceDocuments({ grant: grantOf([{ ...items[0],
    scope: { start_seconds: 0, end_seconds: 58, segment_ids: [1, 9] } }]),
  roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  assert.deepEqual(missing.coverage.items.map(row => [row.status, row.code]),
    [['stale_grant', 'scope_segments_absent']]);

  // A fraction in a scope is refused where it is written, not where it is hashed,
  // and so is a conversation that names no utterances at all.
  assert.throws(() => validateVoiceRouteLedger(ledgerFor(mine.sessionId,
    [confirmed('unit_1', 0, 57.82, MINE, { source_segment_ids: [1] })])), /voice_route_segment_invalid/u);
  for (const ids of [[], [2, 1], [1, 1], [1.5], [-1]]) {
    assert.throws(() => validateVoiceRouteLedger(ledgerFor(mine.sessionId,
      [confirmed('unit_1', 0, 58, MINE, { source_segment_ids: ids })])), /voice_route_segment_invalid/u,
    `source_segment_ids ${JSON.stringify(ids)} is not a list of utterances`);
  }
});

// --------------------------------------------------------------------- CLI

test('the CLI is the writer: a proposal, a person’s decision, a withdrawal, and a rehearsal that writes nothing', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  const where = ['--routes-dir', dirs.routesDir, '--now', NOW];
  const base = ['--session', mine.sessionId, '--segment', 'seg-a', ...where];

  // A conversation that names no utterances cannot be read back exactly, so it is
  // refused at the moment somebody tries to write one.
  assert.throws(() => runVoiceRouteCli(['set', ...base, '--from', '0', '--to', '40', '--status', 'candidate',
    '--by', 'actor:bot:context-planner']), /voice_route_source_segments_required/u);
  const dry = runVoiceRouteCli(['set', ...base, '--from', '0', '--to', '40', '--source-segments', '1,2',
    '--status', 'candidate', '--by', 'actor:bot:context-planner', '--dry']);
  assert.deepEqual([dry.dry, dry.candidate, dry.file_sha256], [true, 1, null]);
  assert.deepEqual(await readdir(dirs.routesDir), [], 'a rehearsal leaves the folder as it was');

  runVoiceRouteCli(['set', ...base, '--from', '0', '--to', '40', '--source-segments', '1,2', '--status', 'candidate',
    '--by', 'actor:bot:context-planner', '--project', MINE, '--basis', '회신 메일과 같은 시험',
    '--evidence', 'mail:m-1', '--transcript-run', RUN_ONE.join('/'), '--audio-ref', 'audio/source.mp3']);
  assert.deepEqual(candidatesFor(dirs, MINE)[0]?.items ?? [], [], 'a proposal admits nothing');
  // What it is about, what kind of conversation it is, and how well it was heard
  // are three separate answers, and a decision may not do without any of them.
  assert.throws(() => runVoiceRouteCli(['confirm', ...base, '--project', MINE, '--basis', 'x', '--by', 'actor:owner']),
    /voice_route_title_required/u);
  assert.throws(() => runVoiceRouteCli(['confirm', ...base, '--project', MINE, '--basis', 'x', '--by', 'actor:owner',
    '--title', '시험 일정 합의']), /voice_route_nature_required/u);
  assert.throws(() => runVoiceRouteCli(['confirm', ...base, '--project', MINE, '--basis', 'x', '--by', 'actor:owner',
    '--title', '시험 일정 합의', '--nature', 'project_work']), /voice_route_quality_required/u);
  assert.throws(() => runVoiceRouteCli(['confirm', ...base, '--basis', 'x', '--by', 'actor:owner',
    '--title', 't', '--nature', 'project_work', '--quality', 'independent_fast']), /voice_route_project_required/u);
  assert.throws(() => runVoiceRouteCli(['confirm', ...base, '--project', MINE, '--basis', 'x',
    '--title', 't', '--nature', 'project_work', '--quality', 'independent_fast']), /voice_route_actor_required/u);

  const done = runVoiceRouteCli(['confirm', ...base, '--project', MINE, '--basis', '회신 메일과 같은 시험',
    '--title', '시험 일정 합의', '--nature', 'project_work', '--quality', 'independent_fast', '--by', 'actor:owner']);
  const row = done.segment_rows[0];
  assert.deepEqual([row.status, row.judged_by, row.confirmed_by], ['confirmed', 'actor:bot:context-planner', 'actor:owner'],
    'a decision keeps who proposed it and adds who made it');
  assert.deepEqual([row.quality.transcript, row.audio_ref], ['independent_fast', ['audio', 'source.mp3']]);
  const items = candidatesFor(dirs, MINE)[0].items;
  assert.deepEqual([items.length, items[0].scope],
    [1, { start_seconds: 0, end_seconds: 40, segment_ids: [1, 2] }]);

  // Withdrawing returns it to a proposal rather than erasing the investigation.
  const back = runVoiceRouteCli(['withdraw', ...base]);
  assert.deepEqual([back.confirmed, back.candidate, back.segment_rows[0].judged_by],
    [0, 1, 'actor:bot:context-planner']);
  assert.deepEqual([...candidatesFor(dirs, MINE)], []);
  assert.throws(() => runVoiceRouteCli(['withdraw', ...base]), /voice_route_segment_not_confirmed/u);
  runVoiceRouteCli(['remove', ...base]);
  assert.equal(readLedgerFile(dirs.routesDir, mine.sessionId).ledger.segments.length, 0);
});

test('one decision applied to one ledger changes that conversation and nothing around it', () => {
  const ledger = validateVoiceRouteLedger(emptyLedger('20260911T010000_plaud_cli_synth0001'));
  const withOther = applySegmentDecision(ledger, { command: 'set', segmentId: 'seg-b', from: 50, to: 90,
    sourceSegmentIds: [3], status: 'candidate', by: 'actor:bot:context-planner', project: OTHER,
    basis: '외주 업체명 일치', now: NOW });
  const both = applySegmentDecision(withOther, { command: 'confirm', segmentId: 'seg-a', from: 0, to: 40,
    sourceSegmentIds: [1, 2], by: 'actor:owner', project: MINE, basis: '회신 메일과 같은 시험',
    title: '시험 일정 합의', nature: 'project_work', quality: 'independent_strong', now: NOW });
  assert.deepEqual(both.segments.map(row => [row.segment_id, row.status]), [['seg-a', 'confirmed'], ['seg-b', 'candidate']]);
  assert.deepEqual(confirmedSegments(both, MINE).map(row => row.segment_id), ['seg-a']);
  assert.deepEqual(confirmedSegments(both, OTHER), []);
  assert.throws(() => applySegmentDecision(ledger, { command: 'confirm', segmentId: 'seg-a', from: 40, to: 40,
    sourceSegmentIds: [1], by: 'actor:owner', project: MINE, basis: 'x', title: 't', nature: 'project_work',
    quality: 'independent_fast', now: NOW }), /voice_route_interval_invalid/u);
  assert.throws(() => applySegmentDecision(ledger, { command: 'set', segmentId: 'seg-a', from: 0, to: 40,
    sourceSegmentIds: [1], status: 'candidate', by: 'actor:owner', project: MINE, basis: null, now: NOW }),
  /voice_route_basis_required/u);
  assert.throws(() => applySegmentDecision(ledger, { command: 'set', segmentId: 'seg-a', from: 0, to: 40,
    status: 'candidate', by: 'actor:owner', now: NOW }), /voice_route_source_segments_required/u);
  // The ids stay when a later decision does not mention them.
  assert.deepEqual(both.segments.find(row => row.segment_id === 'seg-a').source_segment_ids, [1, 2]);
});

test('a confirmed segment cannot be rewritten by set: the row stays exactly as the person left it', () => {
  const confirmed = applySegmentDecision(emptyLedger('sess-lock'), { command: 'confirm', segmentId: 'seg-a',
    from: 0, to: 40, sourceSegmentIds: [1, 2], by: 'actor:owner', project: MINE, basis: '회신 메일과 같은 시험',
    title: '시험 일정 합의', nature: 'project_work', quality: 'independent_strong', now: NOW });
  const before = confirmed.segments.find(row => row.segment_id === 'seg-a');
  assert.equal(before.status, 'confirmed');

  // A machine (or anyone) trying to `set` over it is refused outright, not
  // silently downgraded to candidate with confirmed_by dropped.
  assert.throws(() => applySegmentDecision(confirmed, { command: 'set', segmentId: 'seg-a', status: 'candidate',
    by: 'actor:bot:context-planner', project: MINE, basis: 'reconcile:v0 overwrite attempt', now: NOW }),
  /voice_route_segment_confirmed_locked/u);
  const untouched = confirmed.segments.find(row => row.segment_id === 'seg-a');
  assert.deepEqual(untouched, before, 'the ledger is unchanged after the refused write');
  assert.equal(untouched.status, 'confirmed');

  // A person confirming it again (e.g. to refresh it) is still allowed --
  // only `set` (and `import`, which never reaches an already-known segment at
  // all) is locked out, not `confirm` itself.
  const reconfirmed = applySegmentDecision(confirmed, { command: 'confirm', segmentId: 'seg-a', by: 'actor:owner',
    project: MINE, basis: '회신 메일과 같은 시험', title: '시험 일정 합의', nature: 'project_work',
    quality: 'independent_strong', now: '2026-09-16T00:00:00.000Z' });
  const reconfirmedRow = reconfirmed.segments.find(row => row.segment_id === 'seg-a');
  assert.equal(reconfirmedRow.status, 'confirmed');
  assert.equal(reconfirmedRow.confirmed_at, '2026-09-16T00:00:00.000Z');
});

test('mergeConversationList (import) never reaches a segment already in the ledger, confirmed or not', () => {
  const confirmed = applySegmentDecision(emptyLedger('sess-lock2'), { command: 'confirm', segmentId: 'seg-a',
    from: 0, to: 40, sourceSegmentIds: [1, 2], by: 'actor:owner', project: MINE, basis: '회신 메일과 같은 시험',
    title: '시험 일정 합의', nature: 'project_work', quality: 'independent_strong', now: NOW });
  const before = confirmed.segments.find(row => row.segment_id === 'seg-a');
  const list = { schema: 'soulforge.voice_conversation_list.v0', session_id: 'sess-lock2', segments: [
    { segment_id: 'seg-a', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 40, title: '다른 제목',
      description: '', nature: 'project_work', status: 'candidate',
      project_candidates: [{ project_code: MINE, strength: 'strong', basis: ['key_terms'], evidence_row_ids: [9] }],
      related_segment_ids: [], refs: { transcript_run_id: null }, quality: { transcript_kind: 'independent_fast' } }] };
  const merged = mergeConversationList(confirmed, list, { runId: 'vcl_1111111111111111', by: 'actor:machine', now: NOW });
  assert.equal(merged.added, 0, 'a segment_id already in the ledger is never re-imported');
  const after = merged.ledger.segments.find(row => row.segment_id === 'seg-a');
  assert.deepEqual(after, before);
});
