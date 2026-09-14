// Read one voice session out of the unclassified inbox, one window at a time.
//
// The other read in this pair starts from a project: a code resolves to a
// binding, the binding fixes a generation, and the generation's manifest is the
// scope. A recording that nobody has classified yet has none of those. It sits
// in the inbox because no project owns it, and the whole point of reading it is
// to work out which project each stretch of it belongs to -- so asking for a
// project code first would be asking for the answer.
//
// What stands in for the binding is a declaration the Owner places outside this
// tree: `control_root/voice-routes/inbox_access.v0.json` says which actor may
// read the inbox, for what purpose, which root the inbox is, and how much of one
// recording a single call may return. Without that file there is no inbox read
// at all -- not a smaller one, not a slower one. A tool that widened its own
// reach when the declaration was missing would be the thing the declaration
// exists to prevent.
//
// What comes back is the session's head and a list of intervals. The head says
// which transcript answered (the independent local run when the session has one,
// the provider's otherwise) and carries that transcript's own evidence_role and
// claim_ceiling, because a machine transcript is not a record of what was said
// and a reader who forgets that will quote it as one. The audio is never opened
// and the provider's summary is never read: it is quarantined upstream, and a
// summary that arrived through this tool would launder that quarantine.
//
// Speaker labels are alignment hints. The provider's own manifest says so, and
// the label is carried through unchanged so that a reader can tell two voices
// apart -- not so that a name in that column becomes who owns the work.
import { createHash } from 'node:crypto';
import { openSourceRoot, isSafeSegment, SourceReadError } from '../adapters/sources/guarded_files.mjs';

export const VOICE_READ_SCHEMA = 'soulforge.context_voice_session_read.v1';
export const VOICE_ACCESS_SCHEMA = 'soulforge.voice_inbox_access.v0';
/** The one address the inbox declaration is read from. No caller names a place. */
export const VOICE_ACCESS_ADDRESS = 'control_root/voice-routes/inbox_access.v0.json';
export const VOICE_READER_ACTOR = 'actor:owner:context-reader';
export const VOICE_REVIEW_PURPOSE = 'voice_route_review';
/** Every status this read may report. A caller adds none and renames none. */
export const VOICE_READ_STATUSES = Object.freeze(['ok', 'revision_mismatch', 'access_denied', 'session_not_found',
  'session_ambiguous', 'transcript_unavailable', 'window_without_speech', 'investigation_budget_exhausted']);
export const VOICE_TRANSCRIPT_KINDS = Object.freeze(['local', 'provider']);
export const DEFAULT_MAX_CHARACTERS = 12000;
/** A window this tool will never exceed even when a declaration asks for more. */
export const MAX_WINDOW_SECONDS = 24 * 60 * 60;

const SESSION_SCHEMA = 'soulforge.voice_capture_session.v0';
const SEGMENT_SCHEMA = 'soulforge.voice_transcript_segment.v0';
const LOCAL_RUN_SCHEMA = 'soulforge.local_asr_run.v0';
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ALIAS_ADDRESS = /^[a-z][a-z0-9_]{0,31}(?:\/[^/\\:]{1,255}){1,16}$/u;
const OFFSET = /([+-])(\d{2}):(\d{2})$/u;
const MAX_ACCESS_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 32 * 1024 * 1024;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export class VoiceSessionReadError extends Error {
  constructor(code) { super(code); this.name = 'VoiceSessionReadError'; this.code = code; }
}
const fail = code => { throw new VoiceSessionReadError(code); };
const short = digest => typeof digest === 'string' ? digest.replace(/^sha256:/u, '').slice(0, 12) : null;

// ------------------------------------------------------------- declaration
/**
 * The inbox declaration, or why there is no read. Absence is an answer here, not
 * an error to route around: an inbox with no declaration is simply closed.
 */
export function readInboxAccess({ io, actorRef = VOICE_READER_ACTOR, address = VOICE_ACCESS_ADDRESS,
  now = new Date().toISOString() } = {}) {
  const denied = detail => Object.freeze({ granted: false, declared: false, detail, address });
  let bytes;
  try { bytes = io.read(address, MAX_ACCESS_BYTES); }
  catch { return denied('no inbox access declaration'); }
  let declared;
  try { declared = JSON.parse(bytes); } catch { return denied('access declaration unreadable'); }
  const refuse = detail => Object.freeze({ granted: false, declared: true, detail, address,
    sha256: sha256(bytes) });
  if (declared?.schema !== VOICE_ACCESS_SCHEMA) return refuse('access declaration schema unknown');
  if (declared.revoked === true) return refuse('access declaration revoked');
  if (declared.actor_ref !== actorRef) return refuse('access declaration names another actor');
  if (declared.purpose !== VOICE_REVIEW_PURPOSE) return refuse('access declaration names another purpose');
  if (typeof declared.root !== 'string' || !ALIAS_ADDRESS.test(declared.root)) return refuse('access declaration root invalid');
  if (typeof declared.expires_at === 'string' && declared.expires_at <= now) return refuse('access declaration expired');
  const seconds = declared.max_seconds_per_call;
  if (!Number.isSafeInteger(seconds) || seconds < 1) return refuse('access declaration window bound invalid');
  const characters = declared.max_characters_per_call ?? DEFAULT_MAX_CHARACTERS;
  if (!Number.isSafeInteger(characters) || characters < 100 || characters > 400000) {
    return refuse('access declaration character bound invalid');
  }
  return Object.freeze({ granted: true, declared: true, detail: null, address, sha256: sha256(bytes),
    actor_ref: declared.actor_ref, purpose: declared.purpose, root: declared.root,
    max_seconds_per_call: Math.min(seconds, MAX_WINDOW_SECONDS), max_characters_per_call: characters });
}

// ------------------------------------------------------------------ session
// The owner names a session, never a folder. Two folders with the same id are a
// refusal rather than a guess -- the same rule the voice adapter already keeps.
async function findSession(root, sessionId) {
  const found = [];
  for (const date of await root.list([])) {
    if (!date.directory || !DATE_DIR.test(date.name)) continue;
    for (const entry of await root.list([date.name])) {
      if (entry.directory && entry.name === sessionId) found.push(date.name);
    }
  }
  if (found.length > 1) fail('session_ambiguous');
  return found[0] ?? null;
}

/** The clock a listener would have read: the recording's own declared offset plus the segment's. */
export function clockAt(recordedAtLocal, seconds) {
  const match = OFFSET.exec(String(recordedAtLocal));
  const minutes = match === null ? 0 : (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
  const instant = Date.parse(recordedAtLocal);
  if (!Number.isFinite(instant)) fail('session_manifest_invalid');
  const shifted = new Date(instant + minutes * 60000 + Math.round(seconds * 1000));
  return { clock: shifted.toISOString().slice(11, 19), date: shifted.toISOString().slice(0, 10),
    offset_minutes: minutes, label: minutes === 540 ? 'KST' : `UTC${minutes < 0 ? '-' : '+'}`
      + `${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}` };
}

function parseSegments(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { fail('transcript_shape_invalid'); }
    if (row?.schema_version !== SEGMENT_SCHEMA || !Number.isSafeInteger(row.segment_id)
      || !Number.isFinite(row.start_seconds) || !Number.isFinite(row.end_seconds) || row.end_seconds < row.start_seconds
      || typeof row.speaker !== 'string' || typeof row.content !== 'string') fail('transcript_shape_invalid');
    rows.push(row);
  }
  return rows.sort((a, b) => a.start_seconds - b.start_seconds || a.segment_id - b.segment_id);
}

// The independent run is taken from what the session manifest declares, not from
// whatever folders happen to sit under analysis/: a half-written run directory is
// a symptom, and the manifest is the declaration that says a run completed.
function declaredLocalRun(manifest) {
  const run = manifest.independent_transcription ?? null;
  if (run === null || typeof run !== 'object') return null;
  if (run.status !== 'completed' || typeof run.run_id !== 'string' || !isSafeSegment(run.run_id)) return null;
  return run.run_id;
}

async function readLocalTranscript({ root, segments, runId }) {
  const runPath = [...segments, 'analysis', 'local_asr', runId];
  let runManifest;
  try { runManifest = JSON.parse((await root.readText([...runPath, 'analysis_manifest.json'], MAX_MANIFEST_BYTES)).text); }
  catch (error) {
    return { status: 'transcript_unavailable',
      detail: `local run manifest ${error?.code === 'source_missing' ? 'absent' : 'unreadable'}` };
  }
  if (runManifest?.schema_version !== LOCAL_RUN_SCHEMA || runManifest.run_id !== runId) {
    return { status: 'transcript_unavailable', detail: 'local run manifest shape unknown' };
  }
  if (runManifest.state !== 'completed') {
    return { status: 'transcript_unavailable', detail: `local run state ${String(runManifest.state)}` };
  }
  let file;
  try { file = await root.readText([...runPath, 'transcript.jsonl'], MAX_TRANSCRIPT_BYTES); }
  catch (error) { return { status: 'transcript_unavailable', detail: `local transcript ${String(error?.code ?? 'unreadable')}` }; }
  const declaredDigest = typeof runManifest.transcript_sha256 === 'string'
    ? `sha256:${runManifest.transcript_sha256.replace(/^sha256:/u, '')}` : null;
  return { status: 'ok', text: file.text,
    transcript: { kind: 'local', run_id: runId, state: runManifest.state,
      evidence_role: runManifest.evidence_role ?? null, claim_ceiling: runManifest.claim_ceiling ?? null,
      quality: runManifest.quality ?? null, engine: runManifest.engine ?? null,
      model_id: runManifest.model_id ?? null,
      declared_segment_count: Number.isSafeInteger(runManifest.segment_count) ? runManifest.segment_count : null,
      sha256: file.sha256, declared_sha256: declaredDigest,
      sha256_matches: declaredDigest === null ? null : declaredDigest === file.sha256 } };
}

async function readProviderTranscript({ root, segments, manifest, detail = null }) {
  let file;
  try { file = await root.readText([...segments, 'transcript.jsonl'], MAX_TRANSCRIPT_BYTES); }
  catch (error) { return { status: 'transcript_unavailable', detail: `provider transcript ${String(error?.code ?? 'unreadable')}` }; }
  const declared = manifest.transcript ?? {};
  return { status: 'ok', text: file.text,
    // The provider chain declares no claim ceiling of its own, and the manifest
    // says the provider transcript is not canonical. Both facts travel with it.
    transcript: { kind: 'provider', run_id: null, state: declared.status ?? null,
      evidence_role: declared.evidence_role ?? null, claim_ceiling: null, quality: declared.quality ?? null,
      engine: null, model_id: null,
      declared_segment_count: Number.isSafeInteger(declared.segment_count) ? declared.segment_count : null,
      sha256: file.sha256, declared_sha256: null, sha256_matches: null,
      canonical: manifest.canonicalization?.plaud_transcript_is_canonical === true,
      fallback_reason: detail } };
}

// -------------------------------------------------------------------- read
/**
 * One window of one session. `from`/`to` are seconds from the start of the
 * recording; the window is clamped to what the declaration allows and the answer
 * says where to continue. `maxChars` may lower the declared character bound and
 * never raises it.
 */
export async function readVoiceSession({ io, sessionId, from = null, to = null, transcriptKind = null,
  maxChars = null, actorRef = VOICE_READER_ACTOR, accessAddress = VOICE_ACCESS_ADDRESS,
  now = new Date().toISOString() } = {}) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId) || !isSafeSegment(sessionId)) {
    fail('voice_session_id_invalid');
  }
  if (transcriptKind !== null && !VOICE_TRANSCRIPT_KINDS.includes(transcriptKind)) fail('voice_transcript_kind_invalid');
  for (const bound of [from, to]) {
    if (bound !== null && (!Number.isFinite(bound) || bound < 0 || bound > MAX_WINDOW_SECONDS)) fail('voice_window_invalid');
  }
  if (from !== null && to !== null && to <= from) fail('voice_window_invalid');
  if (maxChars !== null && (!Number.isSafeInteger(maxChars) || maxChars < 100 || maxChars > 400000)) {
    fail('voice_max_chars_invalid');
  }
  const head = { schema_version: VOICE_READ_SCHEMA, read_at: now, session_id: sessionId };
  const access = readInboxAccess({ io, actorRef, address: accessAddress, now });
  const closed = (status, detail, extra = {}) => Object.freeze({ ...head, status,
    access: { declared: access.declared, granted: access.granted, detail: access.detail, address: accessAddress,
      sha256: access.sha256 ?? null, root: access.root ?? null, purpose: access.purpose ?? null,
      max_seconds_per_call: access.max_seconds_per_call ?? null },
    detail, session: null, transcript: null, window: null, segments: [],
    counts: { in_window: 0, shown: 0, characters_total: 0, characters_shown: 0 }, next_window: null,
    internal: { parser_calls: 0, render_calls: 0, model_calls: 0 }, ...extra });
  if (!access.granted) return closed('access_denied', access.detail);

  let root;
  try { root = openSourceRoot(io.path(access.root)); }
  catch (error) { return closed('access_denied', `inbox root unavailable (${String(error?.code ?? 'unknown')})`); }
  let date;
  try { date = await findSession(root, sessionId); }
  catch (error) {
    if (error?.code === 'session_ambiguous') return closed('session_ambiguous', 'two folders carry this session id');
    throw error;
  }
  if (date === null) return closed('session_not_found', 'no session with that id below the declared inbox root');
  const segments = [date, sessionId];
  let manifest;
  try { manifest = JSON.parse((await root.readText([...segments, 'session_manifest.json'], MAX_MANIFEST_BYTES)).text); }
  catch { return closed('session_not_found', 'session manifest absent or unreadable'); }
  if (manifest?.schema_version !== SESSION_SCHEMA || manifest.session_id !== sessionId
    || typeof manifest.recorded_at_local !== 'string') fail('session_manifest_invalid');

  const runId = declaredLocalRun(manifest);
  // The independent run answers unless the caller asked for the provider's: it
  // is the transcript this house made itself, and it is the one whose chain
  // declares a claim ceiling.
  let read = transcriptKind === 'provider' ? await readProviderTranscript({ root, segments, manifest })
    : (runId === null
      ? { status: 'transcript_unavailable', detail: 'this session declares no completed independent run' }
      : await readLocalTranscript({ root, segments, runId }));
  if (read.status !== 'ok') {
    // A caller who asked for `local` by name is refused rather than answered
    // from the other chain: a silent swap would put the wrong evidence_role on
    // the answer. A caller who asked for nothing gets the provider's, and is
    // told that is what happened and why.
    if (transcriptKind !== null) return closed('transcript_unavailable', read.detail);
    read = await readProviderTranscript({ root, segments, manifest, detail: read.detail });
    if (read.status !== 'ok') return closed('transcript_unavailable', read.detail);
  }

  const rows = parseSegments(read.text);
  const duration = Number.isFinite(manifest.duration_seconds) ? manifest.duration_seconds
    : (rows.at(-1)?.end_seconds ?? 0);
  const requestedFrom = from ?? 0;
  const requestedTo = to ?? Math.max(duration, rows.at(-1)?.end_seconds ?? 0, requestedFrom);
  const windowTo = Math.min(requestedTo, requestedFrom + access.max_seconds_per_call);
  const inWindow = rows.filter(row => row.end_seconds > requestedFrom && row.start_seconds < windowTo);
  const limit = Math.min(maxChars ?? access.max_characters_per_call, access.max_characters_per_call);
  const start = manifest.recorded_at_local;
  let budget = limit;
  const shown = inWindow.map(row => {
    const characters = [...row.content].length;
    const give = budget <= 0 ? 0 : Math.min(characters, budget);
    budget -= give;
    return { segment_id: row.segment_id, start_seconds: row.start_seconds, end_seconds: row.end_seconds,
      clock: clockAt(start, row.start_seconds).clock, speaker: row.speaker, characters, shown: give,
      truncated: give < characters, text: give === characters ? row.content : [...row.content].slice(0, give).join('') };
  });
  const firstUnshown = shown.find(row => row.shown < row.characters) ?? null;
  const nextWindow = firstUnshown !== null
    ? { from: Math.floor(firstUnshown.start_seconds), to: windowTo, reason: 'character_bound' }
    : (windowTo < requestedTo
      ? { from: windowTo, to: Math.min(requestedTo, windowTo + access.max_seconds_per_call), reason: 'window_bound' }
      : null);
  const clock = clockAt(start, 0);
  const status = read.transcript.sha256_matches === false ? 'revision_mismatch'
    : (inWindow.length === 0 ? 'window_without_speech' : 'ok');
  return Object.freeze({
    ...head, status, detail: null,
    access: { declared: true, granted: true, detail: null, address: accessAddress, sha256: access.sha256,
      root: access.root, purpose: access.purpose, max_seconds_per_call: access.max_seconds_per_call },
    session: { session_id: sessionId, date, title: String(manifest.source_page_title ?? sessionId),
      recorded_at_local: start, recorded_clock: `${clock.date} ${clock.clock} ${clock.label}`,
      clock_label: clock.label,
      offset_minutes: clock.offset_minutes, duration_seconds: duration,
      meeting_type: manifest.meeting_context?.meeting_type ?? null,
      canonicalization_state: manifest.canonicalization?.state ?? null,
      speaker_labels_are_identities: false,
      speaker_label_warning: String(manifest.speaker_diarization?.warning
        ?? 'Provider labels are alignment hints, not verified human identities.') },
    transcript: { ...read.transcript, segments_in_file: rows.length, sha256_short: short(read.transcript.sha256) },
    window: { from: requestedFrom, to: windowTo, requested_to: requestedTo,
      clamped: windowTo < requestedTo, max_seconds_per_call: access.max_seconds_per_call,
      max_characters: limit },
    segments: shown, next_window: nextWindow,
    counts: { in_window: inWindow.length, shown: shown.filter(row => row.shown > 0).length,
      characters_total: inWindow.reduce((sum, row) => sum + [...row.content].length, 0),
      characters_shown: shown.reduce((sum, row) => sum + row.shown, 0) },
    internal: { parser_calls: 0, render_calls: 0, model_calls: 0 },
  });
}

export { SourceReadError };
