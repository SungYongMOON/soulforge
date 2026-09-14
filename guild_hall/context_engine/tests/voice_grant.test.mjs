// What a confirmed voice route admits, and what it does not.
//
// A recording is not attributable the way a Slack channel or a Linear project is:
// one session crosses projects, so the only thing that places any of it is a
// person's confirmed interval. These tests hold that boundary from both ends --
// nothing but `confirmed` reaches a grant, and a grant reaches nothing but the
// interval it names -- and then follow one confirmed session through preparation
// twice, so "a new transcript is picked up" and "the same input is not done
// again" are two observed results rather than one hopeful sentence.
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
import { VOICE_ROUTE_LEDGER_SCHEMA, confirmedWindows, validateVoiceRouteLedger } from '../harness/voice_routes.mjs';
import { applyRouteDecision, emptyLedger, readLedgerFile, runVoiceRouteCli } from '../harness/voice_route_cli.mjs';
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
  // The adapter finds a session below `sessions/<date>/`, so the root a binding
  // declares is the folder that holds `sessions`, not the sessions folder itself.
  const plaudRoot = path.join(dataRoot, 'ingress', 'plaud');
  const sessionsRoot = path.join(plaudRoot, 'sessions');
  await mkdir(sessionsRoot, { recursive: true });
  const routesDir = path.join(controlRoot, 'voice-routes');
  await mkdir(routesDir, { recursive: true });
  return { dataRoot, controlRoot, io, plaudRoot, sessionsRoot, routesDir };
}

/** One synthetic session with a provider transcript and one independent run. */
async function session(estateDirs, { seed, date = '2026-09-11', runs = { [RUN_ONE.at(-1)]: INDEPENDENT } } = {}) {
  const sessionId = buildPlaudSessionId(new Date('2026-09-11T01:00:00.000Z'), seed);
  const dir = path.join(estateDirs.sessionsRoot, date, sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'transcript.jsonl'), transcriptLines(PROVIDER));
  await writeFile(path.join(dir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId, source: 'plaud_cli_import',
    provider_recording_id: seed, source_page_title: '합성 회의 녹음', recorded_at_local: '2026-09-11T10:00:00+09:00',
    imported_at_local: '2026-09-11T11:30:00+09:00', duration_seconds: 80,
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

const route = (code, from, to, status, extra = {}) => ({ project_code: code, start_seconds: from, end_seconds: to,
  status, evidence_refs: [], judged_by: 'actor:owner:context-reader', judged_at: NOW,
  confirmed_by: status === 'confirmed' ? 'actor:owner' : null, confirmed_at: status === 'confirmed' ? NOW : null,
  ...extra });

const ledgerFor = (sessionId, routes, transcriptRun = null) => ({ schema_version: VOICE_ROUTE_LEDGER_SCHEMA,
  session_id: sessionId, transcript_run: transcriptRun, routes, updated_at: NOW });

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

test('only a confirmed interval reaches a grant; a proposal and an unplaced interval reach nothing', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  const proposed = await session(dirs, { seed: 's0002abcdef' });
  const theirs = await session(dirs, { seed: 's0003abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [route(MINE, 0, 40, 'confirmed')]));
  // A session an investigator looked at: a proposal for my project and an
  // interval they could not place. Neither is a decision.
  await writeLedger(dirs, ledgerFor(proposed.sessionId,
    [route(MINE, 0, 30, 'candidate'), route(MINE, 30, 60, 'unclassified')]));
  // And a session confirmed for somebody else entirely.
  await writeLedger(dirs, ledgerFor(theirs.sessionId, [route(OTHER, 0, 60, 'confirmed')]));

  const candidates = candidatesFor(dirs, MINE);
  assert.deepEqual(candidates.map(source => source.kind), ['voice']);
  assert.deepEqual(candidates[0].items.map(item => item.item_id), [mine.sessionId],
    'a candidate, an unclassified interval and another project’s confirmation are all absent');
  assert.deepEqual(candidates[0].items[0].scope, { start_seconds: 0, end_seconds: 40 });
  assert.equal(candidates[0].items[0].revision_policy, 'latest_in_custody');
  assert.deepEqual(candidates.voice.confirmed_from_ledger, 1);
  assert.deepEqual(candidates.voice.ledgers_refused, []);

  // The other project sees its own confirmation and nothing of mine.
  assert.deepEqual(candidatesFor(dirs, OTHER)[0].items.map(item => item.item_id), [theirs.sessionId]);
});

test('a project whose binding names no voice root gets no voice items, however many confirmations exist', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [route(MINE, 0, 40, 'confirmed')]));
  // The same estate, the same ledger, a binding that binds Slack instead.
  const candidates = candidatesFor(dirs, MINE, { 'slack.channel': 'data_root/ingress/slack/channels/P26-000' });
  assert.deepEqual([...candidates], [], 'the ledger does not reach a project the binding never opened this root for');
  assert.equal(candidates.voice, undefined, 'and nothing is reported about a root that was not looked at');
});

test('a confirmation without a person on it is not a confirmation, and a broken ledger is named rather than skipped', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  assert.throws(() => validateVoiceRouteLedger(ledgerFor(mine.sessionId,
    [{ ...route(MINE, 0, 40, 'confirmed'), confirmed_by: null }])), /voice_route_invalid/u);
  assert.throws(() => validateVoiceRouteLedger(ledgerFor(mine.sessionId,
    [{ ...route(MINE, 0, 40, 'confirmed'), confirmed_at: 'yesterday' }])), /voice_route_invalid/u);
  assert.throws(() => validateVoiceRouteLedger(ledgerFor(mine.sessionId,
    [{ ...route(MINE, 0, 40, 'candidate'), confirmed_by: 'actor:owner' }])), /voice_route_invalid/u,
  'a proposal cannot carry an acceptance');

  await writeFile(path.join(dirs.routesDir, `${mine.sessionId}.json`), '{ not a ledger');
  const candidates = candidatesFor(dirs, MINE);
  assert.deepEqual([...candidates], []);
  assert.deepEqual(candidates.voice.ledgers_refused,
    [{ session_id: mine.sessionId, code: 'voice_route_ledger_unreadable' }]);
});

test('another owner’s record in the same folder is left alone, not read as a broken ledger', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [route(MINE, 0, 40, 'confirmed')]));
  // The voice inbox access declaration the reading CLI looks for lives here too.
  await writeFile(path.join(dirs.routesDir, 'inbox_access.v0.json'),
    `${JSON.stringify({ schema: 'soulforge.voice_inbox_access.v0', actor_ref: 'actor:owner:context-reader',
      purpose: 'voice_route_review', revoked: false }, null, 2)}\n`);

  const candidates = candidatesFor(dirs, MINE);
  assert.deepEqual(candidates[0].items.map(item => item.item_id), [mine.sessionId]);
  assert.deepEqual(candidates.voice.ledgers_refused, [], 'it is not a ledger, so it is not a broken one');
  assert.deepEqual(candidates.voice.other_schemas_in_folder,
    [{ file: 'inbox_access.v0.json', schema: 'soulforge.voice_inbox_access.v0' }]);
  const listed = runVoiceRouteCli(['list', '--routes-dir', dirs.routesDir]);
  assert.deepEqual(listed.ledgers.map(row => row.session_id), [mine.sessionId]);
  assert.deepEqual(listed.other_schemas.map(row => row.file), ['inbox_access.v0.json']);
});

test('intervals that touch are one interval; intervals with a gap between them are refused, not joined', async () => {
  const dirs = await estate();
  const joined = await session(dirs, { seed: 's0001abcdef' });
  const split = await session(dirs, { seed: 's0002abcdef' });
  await writeLedger(dirs, ledgerFor(joined.sessionId,
    [route(MINE, 0, 25, 'confirmed'), route(MINE, 25, 40, 'confirmed')]));
  await writeLedger(dirs, ledgerFor(split.sessionId,
    [route(MINE, 0, 25, 'confirmed'), route(MINE, 45, 60, 'confirmed')]));

  const candidates = candidatesFor(dirs, MINE);
  assert.deepEqual(candidates[0].items.map(item => [item.item_id, item.scope]),
    [[joined.sessionId, { start_seconds: 0, end_seconds: 40 }]],
    'joining two touching intervals admits exactly what was confirmed; joining across a gap would admit the gap');
  assert.deepEqual(candidates.voice.skipped,
    [{ session_id: split.sessionId, code: 'multiple_confirmed_windows', windows: 2 }]);
  assert.deepEqual(confirmedWindows(validateVoiceRouteLedger(ledgerFor(split.sessionId,
    [route(MINE, 0, 25, 'confirmed'), route(MINE, 45, 60, 'confirmed')])), MINE).length, 2);
});

test('the recording library’s accepted route is the same decision about the whole recording', async () => {
  const dirs = await estate();
  const accepted = await session(dirs, { seed: 's0001abcdef' });
  const halfAccepted = await session(dirs, { seed: 's0002abcdef' });
  await writeIndex(dirs, [
    indexRow(accepted.sessionId, { route_status: 'accepted_project_route', accepted_project_code: MINE,
      accepted_by: 'actor:owner', accepted_at: NOW }),
    // An acceptance with no acceptor is not one, by the same rule the ledger uses.
    indexRow(halfAccepted.sessionId, { route_status: 'accepted_project_route', accepted_project_code: MINE,
      accepted_by: null, accepted_at: NOW })]);

  const candidates = candidatesFor(dirs, MINE);
  assert.deepEqual(candidates[0].items.map(item => item.item_id), [accepted.sessionId]);
  assert.equal(Object.hasOwn(candidates[0].items[0], 'scope'), false, 'the whole recording is not an interval of it');
  assert.deepEqual([candidates.voice.confirmed_from_index, candidates.voice.library_index_read], [1, true]);

  // A session both records decide about is left out rather than resolved by order.
  await writeLedger(dirs, ledgerFor(accepted.sessionId, [route(MINE, 0, 25, 'confirmed')]));
  const both = candidatesFor(dirs, MINE);
  assert.deepEqual([...both], []);
  assert.deepEqual(both.voice.skipped, [{ session_id: accepted.sessionId, code: 'ledger_and_index_disagree' }]);
});

// ------------------------------------------------------------- preparation

test('a granted interval prepares that interval only, from the transcript run the ledger names', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [route(MINE, 0, 40, 'confirmed')], RUN_ONE));
  const items = candidatesFor(dirs, MINE)[0].items;
  assert.deepEqual(items[0].transcript_ref, RUN_ONE);

  const prepared = await prepareSourceDocuments({ grant: grantOf(items),
    roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  const document = prepared.documents[0];
  assert.ok(validateSourceDocument(document));
  assert.deepEqual(document.scope, { start_seconds: 0, end_seconds: 40 });
  assert.ok(document.units.every(unit => unit.locator.start_seconds < 40),
    'the part of the recording that belongs to another project is not in the document');
  assert.equal(document.units.some(unit => unit.text.includes('예산')), false);
  // Which transcript it is comes from the transcript, and it is the independent one.
  assert.equal(document.facts.find(fact => fact.name === 'voice.transcript_ref').value, RUN_ONE.join('/'));
  assert.equal(document.facts.find(fact => fact.name === 'voice.transcript_evidence_role').value,
    'independent_machine_transcript_unverified');
  assert.equal(document.units[0].text.includes('먼저'), true, 'the run’s wording, not the provider’s');

  // Without a named run the session transcript is what a grant means, and the
  // document carries no run facts at all.
  const { transcript_ref: _named, ...withoutRun } = items[0];
  const session_ = await prepareSourceDocuments({ grant: grantOf([withoutRun]),
    roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  const plain = session_.documents[0];
  assert.equal(plain.facts.some(fact => fact.name.startsWith('voice.transcript_ref')), false);
  assert.notEqual(plain.primary_revision_sha256, document.primary_revision_sha256);
  assert.notEqual(plain.doc_key, document.doc_key);
});

test('a run the ledger names but the session does not hold is reported as that, not as a missing session', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  await writeLedger(dirs, ledgerFor(mine.sessionId, [route(MINE, 0, 40, 'confirmed')], RUN_TWO));
  const prepared = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items),
    roots: { [VOICE_ROOT]: dirs.plaudRoot }, now: NOW });
  assert.deepEqual(prepared.coverage.items.map(row => [row.status, row.code]), [['missing', 'transcript_run_absent']]);
});

test('a new transcript is picked up as a change to that one document, and the same input again is no work at all', async () => {
  const dirs = await estate();
  const changing = await session(dirs, { seed: 's0001abcdef' });
  const still = await session(dirs, { seed: 's0002abcdef' });
  await writeLedger(dirs, ledgerFor(changing.sessionId, [route(MINE, 0, 40, 'confirmed')], RUN_ONE));
  await writeLedger(dirs, ledgerFor(still.sessionId, [route(MINE, 0, 40, 'confirmed')], RUN_ONE));
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

  // The ASR lane rewrites one session's run in place.
  await writeFile(path.join(changing.dir, 'analysis', 'local_asr', RUN_ONE.at(-1), 'transcript.jsonl'),
    transcriptLines(REVISED, RUN_ONE.at(-1)));
  const rewritten = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items), roots, now: NOW,
    previousCoverage: first.coverage });
  assert.deepEqual(rewritten.changes.changed.map(row => row.item_id), [changing.sessionId]);
  assert.deepEqual(rewritten.changes.unchanged.map(row => row.item_id), [still.sessionId]);
  assert.deepEqual([rewritten.changes.added.length, rewritten.changes.removed.length], [0, 0]);

  // And a ledger re-pointed at a second run is the same kind of change: one
  // document moved, the other did not.
  await mkdir(path.join(still.dir, 'analysis', 'local_asr', RUN_TWO.at(-1)), { recursive: true });
  await writeFile(path.join(still.dir, 'analysis', 'local_asr', RUN_TWO.at(-1), 'transcript.jsonl'),
    transcriptLines(REVISED, RUN_TWO.at(-1)));
  await writeLedger(dirs, ledgerFor(still.sessionId, [route(MINE, 0, 40, 'confirmed')], RUN_TWO));
  const repointed = await prepareSourceDocuments({ grant: grantOf(candidatesFor(dirs, MINE)[0].items), roots, now: NOW,
    previousCoverage: rewritten.coverage });
  assert.deepEqual(repointed.changes.changed.map(row => row.item_id), [still.sessionId]);
  assert.deepEqual(repointed.changes.unchanged.map(row => row.item_id), [changing.sessionId]);
});

// --------------------------------------------------------------------- CLI

test('the CLI is the writer: a proposal, a person’s confirmation, a withdrawal, and a rehearsal that writes nothing', async () => {
  const dirs = await estate();
  const mine = await session(dirs, { seed: 's0001abcdef' });
  const base = ['--session', mine.sessionId, '--project', MINE, '--from', '0', '--to', '40',
    '--routes-dir', dirs.routesDir, '--now', NOW];

  // A rehearsal shows the exact body and leaves the folder as it was.
  const dry = runVoiceRouteCli(['set', ...base, '--status', 'candidate', '--by', 'actor:bot:context-planner', '--dry']);
  assert.deepEqual([dry.dry, dry.candidate, dry.file_sha256], [true, 1, null]);
  assert.deepEqual(await readdir(dirs.routesDir), []);

  runVoiceRouteCli(['set', ...base, '--status', 'candidate', '--by', 'actor:bot:context-planner',
    '--evidence', 'linear:SON-1', '--transcript-run', RUN_ONE.join('/')]);
  assert.deepEqual(candidatesFor(dirs, MINE)[0]?.items ?? [], [], 'a proposal admits nothing');

  const confirmed = runVoiceRouteCli(['confirm', ...base, '--by', 'actor:owner']);
  assert.deepEqual([confirmed.confirmed, confirmed.candidate], [1, 0]);
  const row = confirmed.routes[0];
  assert.deepEqual([row.judged_by, row.confirmed_by], ['actor:bot:context-planner', 'actor:owner'],
    'promoting a proposal keeps who proposed it and adds who confirmed it');
  assert.deepEqual(row.evidence_refs, ['linear:SON-1']);
  const items = candidatesFor(dirs, MINE)[0].items;
  assert.deepEqual([items.length, items[0].scope, items[0].transcript_ref],
    [1, { start_seconds: 0, end_seconds: 40 }, RUN_ONE]);

  // Withdrawing is a command, so undoing a confirmation is not a hand edit.
  runVoiceRouteCli(['withdraw', ...base]);
  assert.deepEqual([...candidatesFor(dirs, MINE)], []);
  assert.equal(readLedgerFile(dirs.routesDir, mine.sessionId).ledger.routes.length, 0);
  assert.throws(() => runVoiceRouteCli(['withdraw', ...base]), /voice_route_window_absent/u);
  assert.throws(() => runVoiceRouteCli(['confirm', ...base]), /voice_route_actor_required/u,
    'a confirmation with nobody on it is refused before it is written');
});

test('one decision applied to one ledger changes that window and nothing around it', () => {
  const ledger = validateVoiceRouteLedger(emptyLedger('20260911T010000_plaud_cli_synth0001'));
  const withOther = applyRouteDecision(ledger, { command: 'set', code: OTHER, from: 50, to: 90,
    status: 'candidate', by: 'actor:bot:context-planner', now: NOW });
  const both = applyRouteDecision(withOther, { command: 'confirm', code: MINE, from: 0, to: 40,
    by: 'actor:owner', now: NOW });
  assert.deepEqual(both.routes.map(route_ => [route_.project_code, route_.status]),
    [[MINE, 'confirmed'], [OTHER, 'candidate']]);
  assert.equal(both.transcript_run, null, 'a decision about an interval does not repoint the transcript');
  assert.throws(() => applyRouteDecision(ledger, { command: 'confirm', code: MINE, from: 40, to: 40,
    by: 'actor:owner', now: NOW }), /voice_route_interval_invalid/u);
  assert.throws(() => applyRouteDecision(ledger, { command: 'confirm', code: 'not a code', from: 0, to: 40,
    by: 'actor:owner', now: NOW }), /voice_route_project_invalid/u);
});
