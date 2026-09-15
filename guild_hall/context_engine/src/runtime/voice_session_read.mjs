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
import { readFileSync } from 'node:fs';
import { classifyTerms, loadSharedTerms } from './shared_terms.mjs';

// The registry module reports absence as null and refuses a malformed file by
// throwing; a voice read must keep going without marks in both cases and say
// which case it was, so the two are folded into one status here.
function readSharedTermRegistry(path) {
  if (typeof path !== 'string' || !path) return { status: 'not_configured', detail: null, terms: [], path_sha256: null, registry: null };
  let registry;
  try { registry = loadSharedTerms(path); }
  catch (error) { return { status: 'unavailable', detail: String(error?.code ?? 'shared_terms_unreadable'), terms: [], path_sha256: null, registry: null }; }
  if (registry === null) return { status: 'unavailable', detail: 'absent', terms: [], path_sha256: null, registry: null };
  let sha = null;
  try { sha = `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`; } catch { sha = null; }
  return { status: 'ok', detail: null, terms: registry.terms, path_sha256: sha, registry };
}
// Marks a reader can act on: registry terms only (an unregistered acronym is
// not a mark), each saying whether the estate uses it in more than one place and
// on what grounds. `observed_project_count` is what the graph was seen holding,
// which is not the same as `declared_shared` -- a person's declaration makes a
// term shared without making it observed twice -- and `category` separates the
// task tracker's workflow wording from the estate's own subject vocabulary.
function markTerms(text, registry) {
  return classifyTerms(text, registry.registry).filter(entry => entry.kind !== 'unregistered')
    .map(entry => ({ term: entry.term, shared: entry.kind === 'shared', project_count: entry.projects.length,
      projects: [...entry.projects], observed_project_count: entry.observed_project_count,
      declared_shared: entry.declared_shared, category: entry.category }));
}

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
const LABEL_RUN_SCHEMA = 'soulforge.voice_semantic_label_run.v1';
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ALIAS_ADDRESS = /^[a-z][a-z0-9_]{0,31}(?:\/[^/\\:]{1,255}){1,16}$/u;
const OFFSET = /([+-])(\d{2}):(\d{2})$/u;
const MAX_ACCESS_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 32 * 1024 * 1024;
const MAX_LABEL_BYTES = 32 * 1024 * 1024;
const MAX_CONVERSATION_BYTES = 32 * 1024 * 1024;
const CONVERSATION_FILE = 'conversation_list.v0.json';
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
  // The run's own quality numbers travel with it: without them a reader is
  // asked to judge whether a stretch is inaudible or a repetition artefact with
  // nothing to judge it from.
  const metrics = runManifest.quality_metrics ?? {};
  return { status: 'ok', text: file.text,
    transcript: { kind: 'local', run_id: runId, state: runManifest.state,
      metrics: { mean_token_probability: metrics.mean_token_probability ?? null,
        low_probability_token_ratio: metrics.low_probability_token_ratio ?? null,
        suppressed_segment_count: metrics.suppressed_segment_count ?? null,
        retained_segment_count: metrics.retained_segment_count ?? null,
        flags: Array.isArray(metrics.flags) ? metrics.flags.map(String) : [],
        repetition_filter_enabled: runManifest.repetition_filter?.enabled === true,
        vad_enabled: runManifest.vad_enabled === true },
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
      metrics: null,
      evidence_role: declared.evidence_role ?? null, claim_ceiling: null, quality: declared.quality ?? null,
      engine: null, model_id: null,
      declared_segment_count: Number.isSafeInteger(declared.segment_count) ? declared.segment_count : null,
      sha256: file.sha256, declared_sha256: null, sha256_matches: null,
      canonical: manifest.canonicalization?.plaud_transcript_is_canonical === true,
      fallback_reason: detail } };
}

// ------------------------------------------------------- semantic units
// The labelling run already cut the recording where the talk changes, which is
// a better first draft of "one conversation" than a fixed number of seconds or
// a change of speaker. It is a draft and says so: the engine declares
// `claim_ceiling: machine_generated_reviewable`, and where it could not resolve
// a project it says `unresolved_needs_context` rather than guessing one.
//
// A run is bound to the exact transcript it labelled. The session manifest does
// not declare which run is current (checked: its top-level keys carry audio,
// transcript, summary, diarization, canonicalization, meeting_context,
// raw_payload_boundary, post_import_contract and independent_transcription --
// no semantic label block), so the run is found by the digest it names: the one
// whose `recording_ref.transcript_sha256` is the transcript being read. Two
// runs over the same transcript are a refusal rather than a pick, and a run
// over a different transcript is not used at all -- its unit boundaries are
// offsets into another chain's segments.
async function readSemanticLabelRun({ root, segments, transcriptSha256 }) {
  let entries;
  try { entries = await root.list([...segments, 'analysis', 'semantic_labels']); }
  catch { return { status: 'labels_absent', detail: 'no semantic label folder' }; }
  const runs = entries.filter(entry => entry.directory && isSafeSegment(entry.name));
  if (runs.length === 0) return { status: 'labels_absent', detail: 'no semantic label run' };
  const matched = [];
  let readable = 0;
  for (const entry of runs) {
    let run;
    try {
      run = JSON.parse((await root.readText([...segments, 'analysis', 'semantic_labels', entry.name,
        'semantic_label_run.json'], MAX_LABEL_BYTES)).text);
    } catch { continue; }
    if (run?.schema_version !== LABEL_RUN_SCHEMA || !Array.isArray(run.segment_labels)) continue;
    readable += 1;
    const declared = typeof run.recording_ref?.transcript_sha256 === 'string'
      ? `sha256:${run.recording_ref.transcript_sha256.replace(/^sha256:/u, '')}` : null;
    if (declared !== null && declared === transcriptSha256) matched.push({ run, run_id: entry.name });
  }
  if (matched.length > 1) return { status: 'labels_ambiguous', detail: 'two label runs name this transcript' };
  if (matched.length === 0) {
    return { status: readable === 0 ? 'labels_absent' : 'labels_other_revision',
      detail: readable === 0 ? 'no readable semantic label run'
        : 'the label run was made over a different transcript than the one read' };
  }
  return { status: 'ok', detail: null, ...matched[0] };
}

/**
 * The draft intervals, with each one's text taken verbatim from the transcript
 * that was read. `content_char_count` is the run's own count of that text, so a
 * mismatch says the unit no longer describes what the transcript holds -- it is
 * reported, never silently corrected.
 */
export function buildSemanticUnits({ run, rows, recordedAtLocal }) {
  const byId = new Map(rows.map(row => [row.segment_id, row]));
  const windows = new Map();
  for (const window of Array.isArray(run.review_windows) ? run.review_windows : []) {
    for (const ref of Array.isArray(window.source_unit_refs) ? window.source_unit_refs : []) {
      if (!windows.has(ref)) windows.set(ref, window);
    }
  }
  return run.segment_labels.map(unit => {
    const ids = Array.isArray(unit.source_segment_ids) ? unit.source_segment_ids : [];
    const found = ids.map(id => byId.get(id)).filter(row => row !== undefined);
    const text = found.map(row => row.content).join(' ');
    const characters = [...text].length;
    const window = windows.get(unit.unit_id) ?? null;
    return { unit_id: String(unit.unit_id), source_segment_ids: ids, segments_found: found.length,
      start_seconds: Number(unit.start_seconds), end_seconds: Number(unit.end_seconds),
      clock: clockAt(recordedAtLocal, Number(unit.start_seconds)).clock,
      clock_end: clockAt(recordedAtLocal, Number(unit.end_seconds)).clock,
      speaker: String(unit.speaker_label ?? 'UNKNOWN'),
      speech_acts: Array.isArray(unit.speech_acts) ? unit.speech_acts.map(String) : [],
      action_codes: Array.isArray(unit.action_codes) ? unit.action_codes.map(String) : [],
      // The entity value is raw transcript text, so it is a clue to search with
      // and never a name to attribute anything to.
      entities: (Array.isArray(unit.entities) ? unit.entities : [])
        .map(entity => ({ kind: String(entity.kind ?? '-'), value: String(entity.value ?? ''),
          role_label: entity.role_label === undefined ? null : String(entity.role_label) })),
      project_match: { state: String(unit.project_match?.state ?? 'unknown'),
        candidates: Array.isArray(unit.project_match?.candidates) ? unit.project_match.candidates : [] },
      disposition: String(unit.disposition ?? '-'), modality: String(unit.modality ?? '-'),
      polarity: String(unit.polarity ?? '-'),
      declared_characters: Number.isSafeInteger(unit.content_char_count) ? unit.content_char_count : null,
      characters, text,
      characters_match: Number.isSafeInteger(unit.content_char_count) ? unit.content_char_count === characters : null,
      window: window === null ? null : { window_id: String(window.window_id ?? '-'),
        importance_state: String(window.importance_state ?? '-'),
        importance_reason_codes: Array.isArray(window.importance_reason_codes)
          ? window.importance_reason_codes.map(String) : [],
        escalation_state: String(window.escalation_state ?? '-'),
        human_listen_required: window.human_listen_required === true },
    };
  }).sort((a, b) => a.start_seconds - b.start_seconds || a.unit_id.localeCompare(b.unit_id));
}

const labelHead = ({ run, run_id }) => ({
  run_id, engine_id: String(run.engine?.engine_id ?? '-'), engine_version: String(run.engine?.engine_version ?? '-'),
  engine_mode: String(run.engine?.mode ?? '-'), claim_ceiling: run.engine?.claim_ceiling ?? null,
  evidence_gate: { input_class: String(run.evidence_gate?.input_class ?? '-'),
    state: String(run.evidence_gate?.state ?? '-'),
    reason_codes: Array.isArray(run.evidence_gate?.reason_codes) ? run.evidence_gate.reason_codes.map(String) : [],
    project_candidate_emission_allowed: run.evidence_gate?.project_candidate_emission_allowed === true,
    next_step: run.evidence_gate?.next_step === undefined ? null : String(run.evidence_gate.next_step) },
  coverage: { semantic_units: run.coverage?.semantic_unit_count ?? null,
    source_segments: run.coverage?.source_segment_count ?? null,
    covered_source_segments: run.coverage?.covered_source_segment_count ?? null },
  recording_classification: String(run.recording_classification?.type_candidate ?? '-'),
  project_resolution: String(run.project_resolution?.state ?? '-'),
  missing_context_kinds: Array.isArray(run.context?.missing_context_kinds)
    ? run.context.missing_context_kinds.map(String) : [],
});

// ------------------------------------------------------- conversation list
// The list a pipeline made, not one this tool makes.
//
// Splitting a recording into conversations, naming what each one is, proposing
// which project it belongs to and correcting its terms are staged work with
// checks between the stages. A bot asked to do all of that from one prompt does
// it invisibly and differently every time. So this read does none of it: when a
// run has produced a list it shows that list, attributed to its run, and when
// none exists it says so and shows the utterances instead.
//
// Everything in a row is derived except the references. Titles and descriptions
// are summaries a model wrote; they are not what anybody said, and the rendering
// says so on every answer.
async function readConversationList({ derivedRoot, sessionId }) {
  if (typeof derivedRoot !== 'string' || !derivedRoot) {
    return { status: 'not_configured', detail: 'no derived root declared', rows: [] };
  }
  let root;
  try { root = openSourceRoot(derivedRoot); }
  catch { return { status: 'absent', detail: 'derived root unavailable', rows: [] }; }
  let runs;
  try { runs = await root.list(['voice', sessionId]); }
  catch { return { status: 'absent', detail: 'no conversation list for this session', rows: [] }; }
  const found = [];
  for (const entry of runs) {
    if (!entry.directory || !isSafeSegment(entry.name)) continue;
    let parsed;
    try { parsed = JSON.parse((await root.readText(['voice', sessionId, entry.name, CONVERSATION_FILE],
      MAX_CONVERSATION_BYTES)).text); } catch { continue; }
    const rows = Array.isArray(parsed) ? parsed
      : (Array.isArray(parsed?.segments) ? parsed.segments
        : (Array.isArray(parsed?.conversations) ? parsed.conversations : null));
    if (rows === null) continue;
    found.push({ run_id: entry.name, parsed, rows,
      generated_at: typeof parsed?.generated_at === 'string' ? parsed.generated_at
        : (typeof parsed?.created_at === 'string' ? parsed.created_at : null) });
  }
  if (found.length === 0) {
    return { status: runs.length === 0 ? 'absent' : 'unreadable',
      detail: runs.length === 0 ? 'no conversation list for this session'
        : 'no readable conversation list in the runs of this session', rows: [] };
  }
  // Newest by what the run declares; a run that declares no instant sorts under
  // one that does, and the tie-break is the run id. The answer says which run
  // answered and how many there were, so "the latest" is never a silent choice.
  found.sort((a, b) => String(b.generated_at ?? '').localeCompare(String(a.generated_at ?? ''))
    || b.run_id.localeCompare(a.run_id));
  const picked = found[0];
  return { status: 'ok', detail: null, run_id: picked.run_id, runs_found: found.length,
    generated_at: picked.generated_at,
    selected_by: picked.generated_at === null ? 'run_id' : 'declared_instant',
    verified: picked.parsed?.verified === true,
    checks: Array.isArray(picked.parsed?.checks) ? picked.parsed.checks
      : (picked.parsed?.checks === undefined ? [] : [picked.parsed.checks]),
    rows: picked.rows };
}

/** One row of that list, with the audio reference dropped: this tool never hands one out. */
export function conversationRow(row, recordedAtLocal) {
  const start = Number(row.start_seconds ?? row.start ?? 0);
  const end = Number(row.end_seconds ?? row.end ?? start);
  const computed = clockAt(recordedAtLocal, start);
  const refs = row.refs ?? {};
  const quality = row.quality ?? {};
  const description = String(row.description ?? '');
  return {
    conversation_id: String(row.segment_id ?? row.draft_id ?? row.id ?? '-'),
    start_seconds: start, end_seconds: end,
    clock: computed.clock, clock_end: clockAt(recordedAtLocal, end).clock,
    declared_clock: typeof row.clock === 'string' ? row.clock : null,
    clock_matches: typeof row.clock === 'string' ? row.clock.includes(computed.clock) : null,
    title: String(row.title ?? ''), description, nature: String(row.nature ?? '-'),
    status: typeof row.status === 'string' ? row.status : null,
    project_candidates: (Array.isArray(row.project_candidates) ? row.project_candidates : []).map(candidate => ({
      project_code: String(candidate.project_code ?? '-'), strength: String(candidate.strength ?? '-'),
      basis: Array.isArray(candidate.basis) ? candidate.basis.map(String) : [],
      evidence_rows: Array.isArray(candidate.evidence_row_ids) ? candidate.evidence_row_ids.length : 0 })),
    unclassified_reason: row.unclassified_reason === undefined || row.unclassified_reason === null
      ? null : String(row.unclassified_reason),
    quality: { transcript_kind: quality.transcript_kind === undefined ? null : String(quality.transcript_kind),
      marks: Array.isArray(quality.marks) ? quality.marks.map(String)
        : (quality.marks === undefined || quality.marks === null ? [] : [String(quality.marks)]),
      correction_state: quality.correction_state === undefined ? null : String(quality.correction_state) },
    // refs.audio_ref is deliberately not carried: the audio never leaves through here.
    refs: { transcript_run_id: refs.transcript_run_id === undefined ? null : String(refs.transcript_run_id),
      semantic_run_id: refs.semantic_run_id === undefined ? null : String(refs.semantic_run_id),
      source_segment_ids: Array.isArray(refs.source_segment_ids) ? refs.source_segment_ids : [] },
    related: Array.isArray(row.related_segment_ids) ? row.related_segment_ids.map(String) : [],
    derived_summary: true, characters: [...description].length, text: description,
  };
}

// -------------------------------------------------------------------- read
/**
 * One window of one session. `from`/`to` are seconds from the start of the
 * recording; the window is clamped to what the declaration allows and the answer
 * says where to continue. `maxChars` may lower the declared character bound and
 * never raises it. With `units`, the window is shown as the labelling run's
 * draft intervals instead of raw transcript segments; without a usable run it
 * falls back to the segments and says why.
 */
export async function readVoiceSession({ io, sessionId, from = null, to = null, transcriptKind = null,
  units = false, conversationList = false, derivedRoot = null, maxChars = null, sharedTermsPath = null,
  actorRef = VOICE_READER_ACTOR, accessAddress = VOICE_ACCESS_ADDRESS,
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
    units: { status: units ? 'not_read' : 'not_requested', detail: null, rows: [] },
    conversation_list: { status: conversationList ? 'not_read' : 'not_requested', detail: null, rows: [] },
    shared_terms: { status: 'not_read', detail: null, term_count: 0 },
    counts: { basis: 'transcript_segments', in_window: 0, shown: 0, characters_total: 0, characters_shown: 0 },
    next_window: null,
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
  const limit = Math.min(maxChars ?? access.max_characters_per_call, access.max_characters_per_call);
  const start = manifest.recorded_at_local;

  // The list a pipeline made comes first when it was asked for: a reader who has
  // one should be citing it, not re-deriving it from the utterances.
  let conversations = { status: conversationList ? 'not_read' : 'not_requested', detail: null, rows: [] };
  let conversationRows = null;
  if (conversationList) {
    const found = await readConversationList({ derivedRoot, sessionId });
    conversations = found.status === 'ok'
      ? { status: 'ok', detail: null, run_id: found.run_id, runs_found: found.runs_found,
        generated_at: found.generated_at, selected_by: found.selected_by, verified: found.verified,
        checks: found.checks, rows: [] }
      : { status: found.status, detail: found.detail, rows: [] };
    if (found.status === 'ok') {
      conversationRows = found.rows.map(row => conversationRow(row, start))
        .filter(row => row.end_seconds > requestedFrom && row.start_seconds < windowTo)
        .sort((a, b) => a.start_seconds - b.start_seconds || a.conversation_id.localeCompare(b.conversation_id));
    }
  }

  // The draft intervals, when they were made over the very transcript that was
  // read. Anything else falls back to the raw segments and says why, because a
  // unit boundary from another chain would point at the wrong words.
  let labels = { status: units ? 'not_read' : 'not_requested', detail: null, rows: [] };
  let unitRows = null;
  if (units && conversationRows === null) {
    const found = await readSemanticLabelRun({ root, segments, transcriptSha256: read.transcript.sha256 });
    labels = found.status === 'ok'
      ? { status: 'ok', detail: null, ...labelHead(found), rows: [] }
      : { status: found.status, detail: found.detail, rows: [] };
    if (found.status === 'ok') {
      unitRows = buildSemanticUnits({ run: found.run, rows, recordedAtLocal: start })
        .filter(unit => unit.end_seconds > requestedFrom && unit.start_seconds < windowTo);
    }
  }

  const basis = conversationRows !== null ? 'conversation_list'
    : (unitRows === null ? 'transcript_segments' : 'semantic_units');
  const inWindow = conversationRows ?? unitRows
    ?? rows.filter(row => row.end_seconds > requestedFrom && row.start_seconds < windowTo);
  const lengthOf = row => basis === 'transcript_segments' ? [...row.content].length : row.characters;
  const textOf = row => basis === 'transcript_segments' ? row.content : row.text;
  // Marks, not judgements: a term the registry says several projects carry is
  // one a reader must stop using to pick one.
  const registry = readSharedTermRegistry(sharedTermsPath);
  let budget = limit;
  const shown = inWindow.map(row => {
    const characters = lengthOf(row);
    const give = budget <= 0 ? 0 : Math.min(characters, budget);
    budget -= give;
    const text = textOf(row);
    const body = { start_seconds: row.start_seconds, end_seconds: row.end_seconds, characters, shown: give,
      truncated: give < characters, text: give === characters ? text : [...text].slice(0, give).join('') };
    // The whole interval's text is classified, not only the part shown, so a
    // character bound cannot hide the word that makes a clue ambiguous.
    const terms = registry.status === 'ok' ? markTerms(text, registry) : [];
    return basis === 'transcript_segments'
      ? { segment_id: row.segment_id, clock: clockAt(start, row.start_seconds).clock, speaker: row.speaker,
        ...body, terms }
      : { ...row, ...body, terms };
  });
  if (conversationRows !== null) conversations = { ...conversations, rows: shown };
  else if (unitRows !== null) labels = { ...labels, rows: shown };
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
    segments: basis === 'transcript_segments' ? shown : [], units: labels,
    conversation_list: conversations, next_window: nextWindow,
    shared_terms: { status: registry.status, detail: registry.detail, term_count: registry.terms.length,
      registry_sha256: registry.path_sha256 },
    counts: { basis, in_window: inWindow.length, shown: shown.filter(row => row.shown > 0).length,
      characters_total: inWindow.reduce((sum, row) => sum + lengthOf(row), 0),
      characters_shown: shown.reduce((sum, row) => sum + row.shown, 0) },
  internal: { parser_calls: 0, render_calls: 0, model_calls: 0 },
  });
}

export { SourceReadError };
