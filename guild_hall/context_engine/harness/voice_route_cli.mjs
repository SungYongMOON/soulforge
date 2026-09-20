// The one writer of the voice route ledger: a person, or the runner a person
// starts. Nothing else writes here -- an investigating bot answers with a
// proposal and a person runs `confirm`, which is why `confirmed` carries a name
// and a time and why this file is a CLI rather than a library a caller can drive.
//
// It writes only the ledger. The recording, its transcripts, its semantic labels,
// the library index and the project bindings are opened read-only or not at all,
// and no transcript text is read or printed here: the conversation is read
// elsewhere, and what lands here is the decision about it.
//
// usage:
//   node voice_route_cli.mjs list    [--routes-dir <dir> | --root-table <file>] [--json]
//   node voice_route_cli.mjs show    --session <id> [...] [--json]
//   node voice_route_cli.mjs draft   --session <id> [--run <run_id>] [--write --by <actor>]
//                                    [--sessions-address <alias address>] [--now <iso>] [--json]
//   node voice_route_cli.mjs set     --session <id> --segment <id> [--from <s> --to <s>]
//                                    [--source-segments 1,2,3] --status candidate|unclassified --by <actor>
//                                    [--title <text>] [--description <text>] [--nature <nature>]
//                                    [--project <code> --basis <text> [--evidence <ref>]...]
//                                    [--drop-project <code>] [--quality <q>] [--correction <state>]
//                                    [--transcript-run <a/b/c>] [--audio-ref <a/b>] [--related <id>]...
//                                    [--now <iso>] [--dry] [--json]
//   node voice_route_cli.mjs confirm --session <id> --segment <id> --project <code> --basis <text>
//                                    --by <actor> [--title …] [--nature …] [--quality …] [...] [--dry]
//   node voice_route_cli.mjs import  --session <id> --run <run id> --by <actor>
//                                    --tools-config <file> [--now <iso>] [--dry] [--json]
//   node voice_route_cli.mjs withdraw --session <id> --segment <id> --by <actor> [--now <iso>] [--dry]
//   node voice_route_cli.mjs remove   --session <id> --segment <id> [--now <iso>] [--dry]
//
// `--routes-dir` is for a fixture or a rehearsal; on an estate the folder is
// `control_root/voice-routes`, which the root table locates.
//
// segment identity after a regeneration (S2-2): `import` refuses to let a
// regenerated run reuse a segment_id whose existing (non-confirmed) row
// covers a different interval or a different `source_segment_ids` list
// (`mergeConversationList`'s `sameScope` compares both; either one alone
// disagreeing is enough), and reports it in `identity_changed` rather than
// silently keeping the old row or silently overwriting it. The reconcile
// harness (`estate_voice_card_reconcile.mjs`) then skips that segment every
// night (`skipped_segment_identity_changed`) until a person resolves it by
// hand -- there is no command that does this automatically. Either:
//   `set --session <id> --segment <segment_id> --source-segments <ids>
//        --from <s> --to <s> --by <actor> --status candidate`
//   to re-address the same segment_id at the new run's scope (both
//   `--source-segments` and `--from`/`--to` have to move together, or the
//   next `import` will flag it again), or
//   `remove --session <id> --segment <segment_id>`
//   to drop the stale row and let the next `import` add it back fresh.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { VOICE_CORRECTION_STATES, VOICE_ROUTES_ADDRESS, VOICE_ROUTE_LEDGER_SCHEMA, VOICE_ROUTE_LIMITS,
  VOICE_SEGMENT_NATURES, VOICE_TRANSCRIPT_QUALITIES, VoiceRouteError, isSessionRef, isSourceSegmentIds,
  validateVoiceRouteLedger } from './voice_routes.mjs';
import { VOICE_SESSIONS_ADDRESS, readSemanticSegmentDrafts, sessionAddress } from './voice_segment_drafts.mjs';

export const VOICE_ROUTE_COMMANDS = Object.freeze(['list', 'show', 'draft', 'import', 'set', 'confirm',
  'withdraw', 'remove']);
const CONVERSATION_LIST_FILE = 'conversation_list.v0.json';
const MAX_LIST_BYTES = 32 * 1024 * 1024;
/**
 * The pipeline's vocabulary in the ledger's own words.
 *
 * `personal` and `daily` are the same thing said twice. `mixed` is not: the
 * ledger has no word for "several kinds at once", and the nearest true statement
 * is that nobody has settled what kind of conversation it is -- so it arrives
 * `undetermined`, which is exactly what blocks a confirmation until a person
 * looks. Nothing here is promoted; a confirmation still needs a person.
 */
const NATURE_FROM_PIPELINE = Object.freeze({ project_work: 'project_work', team_operations: 'team_operations',
  idea: 'idea', personal: 'daily', unreadable: 'unreadable', mixed: 'undetermined' });
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const SEGMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fail = code => { throw new VoiceRouteError(code); };
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

// Duplicated from `estate_voice_card_reconcile.mjs`'s own copy rather than
// imported -- that harness already imports this file, and the other
// direction would be circular. A basis starting with one of these was
// written by a machine (this pass's own `import`, or the reconcile harness),
// not a person naming a project with their own words.
const MACHINE_BASIS_PREFIXES = Object.freeze(['reconcile:', 'voice_conversation_list:']);
const isMachineWrittenBasis = basis => basis === null || MACHINE_BASIS_PREFIXES.some(prefix => basis.startsWith(prefix));

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index++, next);
    if (flags.has(name)) flags.set(name, [...[flags.get(name)].flat(), value]);
    else flags.set(name, value);
  }
  return flags;
}
const listOf = value => (value === undefined || value === true ? [] : [value].flat().map(String));
const oneOf = (flags, name) => { const value = flags.get(name); return value === undefined || value === true ? null : String(value); };
const seconds = (value, what) => {
  if (value === undefined || value === true) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(what);
  return number;
};

/** An empty ledger for one recording: what `set` and `draft` start from. */
export function emptyLedger(sessionId) {
  return { schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: sessionId, segments: [], updated_at: null };
}

const blankSegment = segmentId => ({ segment_id: segmentId, source_segment_ids: [], start_seconds: 0, end_seconds: 0,
  title: null, description: null, derived_summary: true, nature: 'undetermined', project_candidates: [],
  status: 'unclassified', quality: { transcript: 'unknown', correction_state: 'none' },
  transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
  judged_by: null, judged_at: null, confirmed_by: null, confirmed_at: null, withdrawn: [] });

const order = (a, b) => a.start_seconds - b.start_seconds || a.segment_id.localeCompare(b.segment_id);

/**
 * `existing` plus `additions` -- an append-only record of withdrawal events,
 * not a deduplicated set, so a project withdrawn twice keeps both entries.
 * Bounded, but not by silently evicting the oldest: a fresh review found that
 * dropping the oldest entry once the log passed
 * `VOICE_ROUTE_LIMITS.withdrawn_entries` would silently un-block whichever
 * project that dropped entry was the only record of withdrawing, exactly the
 * thing this field exists to prevent. Past the limit, a further withdrawal is
 * refused outright (`voice_route_withdrawn_limit_reached`) rather than
 * accepted and quietly losing history -- sixteen withdrawal *events* on one
 * segment (not sixteen distinct projects still withdrawn; re-confirming a
 * project removes its entries, see `applySegmentDecision`) is not a limit any
 * real session is expected to reach.
 */
function appendWithdrawn(existing, additions) {
  const combined = [...(existing ?? []), ...additions];
  if (combined.length > VOICE_ROUTE_LIMITS.withdrawn_entries) fail('voice_route_withdrawn_limit_reached');
  return combined;
}

/**
 * Applies one decision to one ledger body and returns the next body. Pure: the
 * caller decides whether it reaches a file, so `--dry` shows exactly what would
 * be written rather than a description of it.
 *
 * `confirm` may place a segment nobody proposed -- a person who heard the
 * recording does not need a bot's row first -- and keeps whatever `judged_by`
 * was already there, so promoting a proposal does not overwrite who proposed it.
 * It also insists on the three things that must not stand in for each other: a
 * title somebody wrote, a nature somebody chose, and a stated transcript quality.
 */
export function applySegmentDecision(ledger, { command, segmentId, from = null, to = null, status = null,
  by = null, title, description, nature, project = null, basis = null, evidenceRefs = [], dropProject = null,
  quality, correctionState, transcriptRef, audioRef, relatedSegmentIds, sourceSegmentIds, now } = {}) {
  if (!SEGMENT_ID.test(segmentId ?? '')) fail('voice_route_segment_id_invalid');
  const held = ledger.segments.find(segment => segment.segment_id === segmentId) ?? null;
  const rest = ledger.segments.filter(segment => segment.segment_id !== segmentId);

  if (command === 'remove') {
    if (held === null) fail('voice_route_segment_absent');
    // A link to a segment that is gone would be a dangling link, so the links go
    // with it rather than being left for the validator to refuse.
    const cleaned = rest.map(segment => ({ ...segment,
      related_segment_ids: segment.related_segment_ids.filter(id => id !== segmentId) }));
    return validateVoiceRouteLedger({ ...ledger, segments: cleaned.sort(order), updated_at: now },
      { sessionId: ledger.session_id });
  }
  if (command === 'withdraw') {
    if (held === null) fail('voice_route_segment_absent');
    if (held.status !== 'confirmed') fail('voice_route_segment_not_confirmed');
    if (!ACTOR.test(by ?? '')) fail('voice_route_actor_required');
    // Back to a proposal, not to nothing: the investigation that led here
    // stays. The project a person is taking back is recorded immediately --
    // this is the block itself, not a projection of one: a caller (the
    // reconcile harness) reads this same field to refuse re-proposing it,
    // and the read path marks it 철회 so nothing downstream cites it. Index
    // or grant removal for material already admitted under the withdrawn
    // decision is a separate, async step (L2, not this one).
    const withdrawnProject = held.project_candidates[0]?.project_code ?? null;
    const next = { ...held, status: 'candidate', confirmed_by: null, confirmed_at: null,
      withdrawn: appendWithdrawn(held.withdrawn, withdrawnProject === null ? []
        : [{ project_code: withdrawnProject, withdrawn_by: by, withdrawn_at: now }]) };
    return validateVoiceRouteLedger({ ...ledger, segments: [...rest, next].sort(order), updated_at: now },
      { sessionId: ledger.session_id });
  }

  if (!ACTOR.test(by ?? '')) fail('voice_route_actor_required');
  const confirming = command === 'confirm';
  // A confirmed segment is a person's word. `set` (and, by the same call,
  // anything that reaches this function through it) may not silently demote
  // it back to a proposal or rewrite its content -- only `confirm` (a person
  // confirming again, e.g. to refresh it) and the explicit `withdraw` command
  // above may change a confirmed row.
  if (held !== null && held.status === 'confirmed' && !confirming) fail('voice_route_segment_confirmed_locked');
  const base = held ?? blankSegment(segmentId);
  const start = from === null ? base.start_seconds : from;
  const end = to === null ? base.end_seconds : to;
  if (!(end > start)) fail('voice_route_interval_invalid');
  // Which utterances the conversation is made of. A segment that names none is
  // one nobody can read back exactly, so it is refused where it is written
  // rather than read back as its neighbours' words.
  const sourceIds = sourceSegmentIds === undefined ? base.source_segment_ids : sourceSegmentIds;
  if (!isSourceSegmentIds(sourceIds)) fail('voice_route_source_segments_required');

  let candidates = base.project_candidates.filter(row => row.project_code !== dropProject);
  if (project !== null) {
    if (!PROJECT_CODE.test(project)) fail('voice_route_project_invalid');
    if (typeof basis !== 'string' || basis.trim() !== basis || basis.length === 0
      || [...basis].length > VOICE_ROUTE_LIMITS.basis_characters) fail('voice_route_basis_required');
    candidates = [...candidates.filter(row => row.project_code !== project),
      { project_code: project, evidence_refs: [...evidenceRefs], basis }];
  }
  // An explicit A -> B correction: confirming a different project than the
  // one already confirmed here takes A back the same way `withdraw` does,
  // recorded in the same instant as the correction itself rather than left
  // for a separate call. Confirming the *same* project again is a refresh,
  // not a correction, and withdraws nothing.
  const previousProject = base.status === 'confirmed' ? (base.project_candidates[0]?.project_code ?? null) : null;
  const withdrawnByThisConfirm = confirming && previousProject !== null && previousProject !== project
    ? [{ project_code: previousProject, withdrawn_by: by, withdrawn_at: now }] : [];
  // N8: a person naming a project through plain `set` -- a basis that is not
  // one of the machine prefixes above -- is a considered act at the same
  // weight as confirming it, so it un-blocks that project the same way
  // re-confirming does. A machine-written `set` (`import`, or the reconcile
  // harness) never un-blocks a withdrawn project on its own; only a person's
  // confirm or a person's own `set` does. Documented in
  // VOICE_RECORDING_LIBRARY_V0.md item 3 and this file's README section.
  const humanUnblock = project !== null && !confirming && !isMachineWrittenBasis(basis) ? project : null;
  const unblockCodes = new Set([...(confirming ? [project] : []), ...(humanUnblock === null ? [] : [humanUnblock])]);
  if (confirming) {
    if (project === null) fail('voice_route_project_required');
    candidates = candidates.filter(row => row.project_code === project);
  }

  const next = { ...base, source_segment_ids: [...sourceIds], start_seconds: start, end_seconds: end,
    title: title === undefined ? base.title : title,
    description: description === undefined ? base.description : description,
    derived_summary: true,
    nature: nature === undefined ? base.nature : nature,
    project_candidates: candidates.sort((a, b) => a.project_code.localeCompare(b.project_code)),
    status: confirming ? 'confirmed' : status,
    // Confirming a project, or a person's own `set` naming one, un-withdraws
    // it (a person's most recent decision wins), on top of whatever this
    // same confirm just withdrew above.
    withdrawn: appendWithdrawn(
      (base.withdrawn ?? []).filter(entry => !unblockCodes.has(entry.project_code)),
      withdrawnByThisConfirm),
    quality: { transcript: quality === undefined ? base.quality.transcript : quality,
      correction_state: correctionState === undefined ? base.quality.correction_state : correctionState },
    transcript_ref: transcriptRef === undefined ? base.transcript_ref : transcriptRef,
    audio_ref: audioRef === undefined ? base.audio_ref : audioRef,
    related_segment_ids: relatedSegmentIds === undefined ? base.related_segment_ids : [...relatedSegmentIds],
    judged_by: base.judged_by ?? by, judged_at: base.judged_at ?? now,
    confirmed_by: confirming ? by : null, confirmed_at: confirming ? now : null };

  if (confirming) {
    // What a segment is about, what kind of conversation it is, and how well it
    // was heard are three separate answers, and a confirmation is the moment all
    // three stop being optional. None of them may be filled in from another.
    if (next.title === null) fail('voice_route_title_required');
    if (next.nature === 'undetermined') fail('voice_route_nature_required');
    if (next.quality.transcript === 'unknown') fail('voice_route_quality_required');
  }
  return validateVoiceRouteLedger({ ...ledger, segments: [...rest, next].sort(order), updated_at: now },
    { sessionId: ledger.session_id });
}

/**
 * One conversation-list row as a ledger segment.
 *
 * The pipeline's own status travels as it is: `candidate` when it found evidence,
 * `unclassified` when it did not. `confirmed` is not reachable from here at all,
 * and neither is a project the row did not name.
 *
 * The interval is widened to the whole seconds either side rather than rounded to
 * the nearest, so that the conversation is certainly inside the interval it is
 * addressed by -- the ids are what actually select the utterances, and a rounded
 * boundary that fell inside the first or last utterance would make the display
 * interval say less than the truth.
 */
export function ledgerSegmentFrom(row, { runId, by, now }) {
  const status = row?.status === 'candidate' ? 'candidate' : 'unclassified';
  const nature = NATURE_FROM_PIPELINE[row?.nature] ?? 'undetermined';
  const ids = Array.isArray(row?.source_segment_ids) ? [...row.source_segment_ids].sort((a, b) => a - b) : [];
  if (!isSourceSegmentIds(ids)) fail('voice_route_source_segments_invalid');
  const start = Math.floor(Number(row.start_seconds ?? 0));
  const end = Math.ceil(Number(row.end_seconds ?? 0));
  const runRef = typeof row?.refs?.transcript_run_id === 'string' && row.refs.transcript_run_id
    ? ['analysis', 'local_asr', row.refs.transcript_run_id] : null;
  const text = (value, max) => {
    const held = typeof value === 'string' ? value.trim() : '';
    return held === '' ? null : [...held].slice(0, max).join('');
  };
  return { segment_id: String(row.segment_id), source_segment_ids: ids,
    start_seconds: start, end_seconds: end > start ? end : start + 1,
    title: text(row.title, VOICE_ROUTE_LIMITS.title_characters),
    description: text(row.description, VOICE_ROUTE_LIMITS.description_characters),
    derived_summary: true, nature,
    project_candidates: status === 'candidate'
      ? (row.project_candidates ?? []).map(candidate => ({ project_code: String(candidate.project_code),
        evidence_refs: (candidate.evidence_row_ids ?? []).map(id => `evidence_row:${id}`)
          .slice(0, VOICE_ROUTE_LIMITS.evidence_refs),
        basis: `voice_conversation_list:${runId}:${row.segment_id}`
          + ` strength=${candidate.strength ?? 'weak'}`
          + ` basis=${(candidate.basis ?? []).join('+') || 'none'}` })) : [],
    status, quality: { transcript: row?.quality?.transcript_kind === 'provider_only' ? 'provider_only'
      : 'independent_fast',
    // The pipeline proposed corrections; it corrected nothing. `machine_corrected`
    // would say the transcript had been changed, and it has not been.
    correction_state: 'none' },
    transcript_ref: runRef, audio_ref: null,
    related_segment_ids: Array.isArray(row.related_segment_ids) ? row.related_segment_ids.map(String) : [],
    draft_source: { kind: 'conversation_list', run_id: runId, unit_id: String(row.segment_id) },
    judged_by: by, judged_at: now, confirmed_by: null, confirmed_at: null, withdrawn: [] };
}

/** Merges drafts into a ledger as unplaced segments, never touching one already there. */
export function mergeDrafts(ledger, drafts, { by, now }) {
  if (!ACTOR.test(by ?? '')) fail('voice_route_actor_required');
  const known = new Set(ledger.segments.map(segment => segment.segment_id));
  const added = drafts.filter(draft => !known.has(draft.segment.segment_id))
    .map(draft => ({ ...draft.segment, judged_by: by, judged_at: now }));
  const next = validateVoiceRouteLedger({ ...ledger, segments: [...ledger.segments, ...added].sort(order),
    updated_at: now }, { sessionId: ledger.session_id });
  return { ledger: next, added: added.length, kept: ledger.segments.length };
}

// Whether two ledger segment shapes address the same stretch of the
// recording: the same source utterance ids, in the same order, over the same
// whole-second interval. Ids are the real identity (interval is derived from
// them); both are compared because a transcript re-run can in principle shift
// timing even when boundary ids happened to land the same, and either
// disagreeing is enough to call it a different conversation.
function sameScope(a, b) {
  return a.start_seconds === b.start_seconds && a.end_seconds === b.end_seconds
    && a.source_segment_ids.length === b.source_segment_ids.length
    && a.source_segment_ids.every((id, index) => id === b.source_segment_ids[index]);
}

/**
 * The pipeline's list for one run, as ledger segments a person can then decide on.
 *
 * Like `draft`, it never reopens what is already in the ledger: a segment id
 * that is already there is kept exactly as it is, so importing the same run
 * twice changes nothing and importing a second run does not overwrite the
 * first run's rows -- confirmed or not.
 *
 * A regenerated run can reuse a `segment_id` (`c001`, ...) for a *different*
 * stretch of the recording than the row already holding that id -- the
 * boundary step redrew where conversations start and end. Silently keeping
 * the old row would be fine on its own (nothing here ever overwrites it), but
 * a caller that goes on to `set --project X` against that same segment_id,
 * believing it addresses the *new* run's conversation, would attach a fresh
 * judgement to the *old* scope instead. So a machine-drafted row (`status`
 * anything but `confirmed`) whose incoming counterpart names a different
 * scope is named in the returned `identity_changed` list rather than
 * silently accepted or silently ignored -- the caller (the reconcile harness)
 * is the one with a duty not to write to it until a person resolves which
 * conversation the id now means. A confirmed row is a person's word and is
 * never flagged here at all: reconcile already leaves it alone entirely, and
 * a scope disagreement under a person's own decision is not this function's
 * conflict to name.
 */
export function mergeConversationList(ledger, list, { runId, by, now }) {
  if (!ACTOR.test(by ?? '')) fail('voice_route_actor_required');
  if (list?.schema !== 'soulforge.voice_conversation_list.v0' || !Array.isArray(list.segments)) {
    fail('voice_conversation_list_invalid');
  }
  if (list.session_id !== ledger.session_id) fail('voice_route_session_mismatch');
  const known = new Map(ledger.segments.map(segment => [segment.segment_id, segment]));
  const incoming = list.segments.map(row => ledgerSegmentFrom(row, { runId, by, now }));
  const added = [], identityChanged = [];
  for (const segment of incoming) {
    const existing = known.get(segment.segment_id);
    if (existing === undefined) { added.push(segment); continue; }
    if (existing.status === 'confirmed') continue;
    if (!sameScope(existing, segment)) identityChanged.push(segment.segment_id);
  }
  const names = new Set([...known.keys(), ...added.map(segment => segment.segment_id)]);
  const next = validateVoiceRouteLedger({ ...ledger,
    // A link to a conversation that was not imported would dangle, so it is
    // dropped here rather than refused at the validator.
    segments: [...ledger.segments, ...added.map(segment => ({ ...segment,
      related_segment_ids: segment.related_segment_ids.filter(id => names.has(id) && id !== segment.segment_id) }))]
      .sort(order), updated_at: now }, { sessionId: ledger.session_id });
  return { ledger: next, added: added.length, kept: ledger.segments.length,
    candidate: added.filter(segment => segment.status === 'candidate').length,
    unclassified: added.filter(segment => segment.status === 'unclassified').length,
    identity_changed: identityChanged.sort() };
}

/** Where the ledgers live: an explicit folder, or `control_root/voice-routes`. */
function estateIo(flags) {
  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  if (!tablePath) return null;
  const expected = flags.get('root-table-sha256');
  return createAliasedStoreIo(readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) }));
}

function routesDirectory(flags, io) {
  const explicit = flags.get('routes-dir');
  if (typeof explicit === 'string') {
    if (!path.isAbsolute(explicit)) fail('voice_route_routes_dir_not_absolute');
    return explicit;
  }
  if (io === null) fail('voice_route_routes_dir_required');
  return io.path(VOICE_ROUTES_ADDRESS, true);
}

const ledgerFile = (dir, sessionId) => path.join(dir, `${sessionId}.json`);

export function readLedgerFile(dir, sessionId) {
  const file = ledgerFile(dir, sessionId);
  if (!existsSync(file)) return { ledger: validateVoiceRouteLedger(emptyLedger(sessionId)), existed: false };
  const bytes = readFileSync(file);
  if (bytes.length > VOICE_ROUTE_LIMITS.ledger_bytes) fail('voice_route_ledger_too_large');
  let body;
  try { body = JSON.parse(bytes); } catch { return fail('voice_route_ledger_unreadable'); }
  return { ledger: validateVoiceRouteLedger(body, { sessionId }), existed: true, sha256: sha256(bytes) };
}

function writeLedgerFile(dir, ledger) {
  mkdirSync(dir, { recursive: true });
  const file = ledgerFile(dir, ledger.session_id);
  const bytes = encode(ledger);
  // Through a neighbour and a rename, so a reader never sees half a decision.
  const staging = `${file}.writing`;
  writeFileSync(staging, bytes);
  renameSync(staging, file);
  return { file, sha256: sha256(bytes) };
}

const summarize = ledger => ({ session_id: ledger.session_id, updated_at: ledger.updated_at,
  segments: ledger.segments.length,
  confirmed: ledger.segments.filter(segment => segment.status === 'confirmed').length,
  candidate: ledger.segments.filter(segment => segment.status === 'candidate').length,
  unclassified: ledger.segments.filter(segment => segment.status === 'unclassified').length });

const NATURE_KO = { project_work: '과제 업무', team_operations: '팀 운영', idea: '아이디어',
  daily: '일상', unreadable: '판독 불가', undetermined: '미판정' };

const segmentLine = segment => `${segment.segment_id} | ${segment.start_seconds}-${segment.end_seconds}s`
  + ` | 발화 ${segment.source_segment_ids.length}개`
  + ` | ${NATURE_KO[segment.nature] ?? segment.nature} | ${segment.status}`
  + ` | ${segment.project_candidates.map(row => row.project_code).join(',') || '과제 미정'}`
  + ` | 전사 ${segment.quality.transcript}/${segment.quality.correction_state}`
  + ` | ${segment.title === null ? '제목 없음' : `${segment.title} (파생 요약)`}`
  + (segment.status === 'confirmed' ? ` | 확정 ${segment.confirmed_by} ${segment.confirmed_at}` : '')
  + (segment.related_segment_ids.length ? ` | 이어짐 ${segment.related_segment_ids.join(',')}` : '');

function listCommand(dir, json) {
  // The folder is shared with the voice inbox access declaration, so a file that
  // declares another schema is another owner's record, not a bad ledger.
  const rows = [], others = [];
  for (const name of (existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir) : [])
    .filter(entry => entry.endsWith('.json')).sort()) {
    const sessionId = name.slice(0, -'.json'.length);
    let declared = null;
    try { const body = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
      declared = body?.schema_version ?? body?.schema ?? null; } catch { declared = null; }
    if (typeof declared === 'string' && declared !== VOICE_ROUTE_LEDGER_SCHEMA) { others.push({ file: name, schema: declared }); continue; }
    try { rows.push(summarize(readLedgerFile(dir, sessionId).ledger)); }
    catch (error) { rows.push({ session_id: sessionId, unreadable: error?.code ?? 'voice_route_ledger_unreadable' }); }
  }
  return { command: 'list', ledgers: rows, other_schemas: others, ...(json ? {} : { text: [
    ...rows.map(row => row.unreadable ? `${row.session_id} | 읽을 수 없음: ${row.unreadable}`
      : `${row.session_id} | 구간 ${row.segments} · 확정 ${row.confirmed} · 후보 ${row.candidate} · 미분류 ${row.unclassified}`),
    ...others.map(row => `${row.file} | 다른 기록(${row.schema})`)].join('\n') }) };
}

export function runVoiceRouteCli(argv) {
  const command = argv[0];
  if (!VOICE_ROUTE_COMMANDS.includes(command)) fail('voice_route_command_unknown');
  const flags = options(argv.slice(1));
  const io = estateIo(flags);
  const dir = routesDirectory(flags, io);
  const json = flags.get('json') === true;
  const dry = flags.get('dry') === true;
  const now = String(flags.get('now') ?? new Date().toISOString());

  if (command === 'list') return listCommand(dir, json);

  const sessionId = String(flags.get('session') ?? '');
  if (!SESSION_ID.test(sessionId)) fail('voice_route_session_invalid');
  const held = readLedgerFile(dir, sessionId);

  if (command === 'show') {
    return { command, existed: held.existed, ...summarize(held.ledger),
      segment_rows: held.ledger.segments.map(segment => ({ ...segment })),
      ...(json ? {} : { text: [`${sessionId} | 구간 ${held.ledger.segments.length}`,
        ...held.ledger.segments.map(segmentLine)].join('\n') }) };
  }

  if (command === 'draft') {
    if (io === null) fail('voice_route_root_table_required');
    const sessionsAddress = String(flags.get('sessions-address') ?? VOICE_SESSIONS_ADDRESS);
    const session = sessionAddress({ io, sessionId, sessionsAddress });
    if (session === null) fail('voice_session_absent');
    const found = readSemanticSegmentDrafts({ io, session, sessionId, runId: oneOf(flags, 'run') });
    const write = flags.get('write') === true;
    let merged = null, written = null;
    if (write) {
      merged = mergeDrafts(held.ledger, found.drafts, { by: oneOf(flags, 'by'), now });
      written = dry ? null : writeLedgerFile(dir, merged.ledger);
    }
    return { command, dry, ...(merged === null ? {} : summarize(merged.ledger)),
      run_id: found.run_id, code: found.code, run: found.run,
      drafts: found.drafts.length, added: merged?.added ?? 0, kept: merged?.kept ?? held.ledger.segments.length,
      file_sha256: written?.sha256 ?? null,
      segment_rows: (merged?.ledger.segments ?? found.drafts.map(draft => draft.segment)).map(row => ({ ...row })),
      hints: found.drafts.map(draft => ({ segment_id: draft.segment.segment_id, ...draft.hints })),
      ...(json ? {} : { text: [
        `${sessionId} | 의미 라벨 run ${found.run_id ?? '없음'} | 구간 초안 ${found.drafts.length}`
        + (write ? ` | 더함 ${merged.added}${dry ? ' (미기록)' : ''}` : ' (읽기만)'),
        `전사 판본 ${found.run?.transcript_run?.join('/') ?? '미상'} | 품질 ${found.run?.quality ?? '미상'}`
        + ` | 과제 후보 방출 허용 ${found.run?.evidence_gate?.project_candidate_emission_allowed}`,
        ...found.drafts.map(draft => `${draft.segment.segment_id} | ${draft.segment.start_seconds}-${draft.segment.end_seconds}s`
          + ` | 화행 ${draft.hints.speech_acts.join(',') || '-'} | 행위 ${draft.hints.action_codes.join(',') || '-'}`
          + ` | 개체 ${draft.hints.entity_kinds.join(',') || '-'}(${draft.hints.entity_count})`
          + ` | ${draft.hints.disposition ?? '-'} | 중요도 ${draft.hints.importance_states.join(',') || '-'}`)].join('\n') }) };
  }

  if (command === 'import') {
    const runId = oneOf(flags, 'run');
    if (runId === null || !/^vcl_[0-9a-f]{16}$/u.test(runId)) fail('voice_route_run_invalid');
    const toolsPath = String(flags.get('tools-config') ?? process.env.SOULFORGE_CONTEXT_TOOLS_CONFIG ?? '');
    if (!toolsPath) fail('voice_route_tools_config_required');
    const tools = readToolsConfig(readFileSync(toolsPath));
    if (!tools.derived_root) fail('voice_route_derived_root_required');
    const file = path.join(tools.derived_root, 'voice', sessionId, runId, CONVERSATION_LIST_FILE);
    if (!existsSync(file)) fail('voice_conversation_list_absent');
    const bytes = readFileSync(file);
    if (bytes.length > MAX_LIST_BYTES) fail('voice_conversation_list_too_large');
    let list;
    try { list = JSON.parse(bytes); } catch { return fail('voice_conversation_list_unreadable'); }
    const merged = mergeConversationList(held.ledger, list, { runId,
      by: flags.get('by') === undefined ? null : String(flags.get('by')), now });
    const written = dry ? null : writeLedgerFile(dir, merged.ledger);
    return { command, dry, ...summarize(merged.ledger), run_id: runId,
      list_verified: list.verified === true, added: merged.added, kept: merged.kept,
      added_candidate: merged.candidate, added_unclassified: merged.unclassified,
      identity_changed: merged.identity_changed,
      file_sha256: written?.sha256 ?? null,
      segment_rows: merged.ledger.segments.map(segment => ({ ...segment })),
      ...(json ? {} : { text: [
        `${dry ? '[미기록] ' : ''}${sessionId} | 대화 목록 run ${runId}`
        + ` | verified ${list.verified === true} | 더함 ${merged.added}`
        + ` (후보 ${merged.candidate} · 미분류 ${merged.unclassified}) | 이미 있던 구간 ${merged.kept}`,
        '확정(confirmed)은 이 명령이 쓰지 않습니다 — 사람이 confirm으로만 씁니다.',
        ...(merged.identity_changed.length ? [`구간 정체 바뀜(재기록 전까지 건너뜀): ${merged.identity_changed.join(', ')}`] : []),
        ...merged.ledger.segments.map(segmentLine)].join('\n') }) };
  }

  const nature = oneOf(flags, 'nature');
  if (nature !== null && !VOICE_SEGMENT_NATURES.includes(nature)) fail('voice_route_nature_invalid');
  const quality = oneOf(flags, 'quality');
  if (quality !== null && !VOICE_TRANSCRIPT_QUALITIES.includes(quality)) fail('voice_route_quality_invalid');
  const correction = oneOf(flags, 'correction');
  if (correction !== null && !VOICE_CORRECTION_STATES.includes(correction)) fail('voice_route_correction_invalid');
  // A ref flag left off keeps what is there; given bare or empty it clears it.
  const refFlag = name => { if (!flags.has(name)) return undefined;
    const value = flags.get(name);
    return value === true || value === '' ? null : String(value).split('/').filter(Boolean); };
  const transcriptRef = refFlag('transcript-run');
  const audioRef = refFlag('audio-ref');
  for (const ref of [transcriptRef, audioRef]) if (ref !== undefined && !isSessionRef(ref)) fail('voice_route_ref_invalid');
  const related = flags.has('related') ? listOf(flags.get('related')) : undefined;
  const sourceSegments = flags.has('source-segments')
    ? String(flags.get('source-segments')).split(',').map(value => Number.parseInt(value.trim(), 10)) : undefined;
  if (sourceSegments !== undefined && !isSourceSegmentIds(sourceSegments)) fail('voice_route_source_segments_invalid');
  const status = command === 'set' ? String(flags.get('status') ?? '') : null;
  if (command === 'set' && !['candidate', 'unclassified'].includes(status)) fail('voice_route_status_invalid');

  const next = applySegmentDecision(held.ledger, { command, segmentId: String(flags.get('segment') ?? ''),
    from: seconds(flags.get('from'), 'voice_route_interval_invalid'),
    to: seconds(flags.get('to'), 'voice_route_interval_invalid'), status,
    by: flags.get('by') === undefined ? null : String(flags.get('by')),
    title: flags.has('title') ? oneOf(flags, 'title') : undefined,
    description: flags.has('description') ? oneOf(flags, 'description') : undefined,
    nature: nature === null ? undefined : nature,
    project: oneOf(flags, 'project'), basis: oneOf(flags, 'basis'),
    evidenceRefs: listOf(flags.get('evidence')), dropProject: oneOf(flags, 'drop-project'),
    quality: quality === null ? undefined : quality,
    correctionState: correction === null ? undefined : correction,
    transcriptRef, audioRef, relatedSegmentIds: related, sourceSegmentIds: sourceSegments, now });
  const written = dry ? null : writeLedgerFile(dir, next);
  return { command, dry, ...summarize(next), segment_rows: next.segments.map(segment => ({ ...segment })),
    file_sha256: written?.sha256 ?? null,
    ...(json ? {} : { text: [`${dry ? '[미기록] ' : ''}${sessionId} | ${command}`,
      ...next.segments.map(segmentLine)].join('\n') }) };
}

function main() {
  const argv = process.argv.slice(2);
  const result = runVoiceRouteCli(argv);
  const { text, ...body } = result;
  process.stdout.write(argv.includes('--json') ? `${JSON.stringify(body)}\n` : `${text}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = main(); }
  catch (error) {
    process.stderr.write(`[voice-route] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  }
}
