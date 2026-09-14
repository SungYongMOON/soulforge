// Read-only source adapter over voice sessions kept by guild_hall/voice_capture
// (sessions/<date>/<session_id>/session_manifest.json + transcript.jsonl).
// Provider speaker labels are alignment hints, never identities. One recording
// holds several separate conversations, so a grant item names one of them: its
// `scope` is where that conversation runs, its `conversation_segment` says which
// conversation it is and what somebody called it, and its `transcript_ref` says
// which transcript of the recording was granted.
import { createHash } from 'node:crypto';
import { openSourceRoot, SourceReadError } from './guarded_files.mjs';
import { buildSourceDocument, isInstant, SourceDocumentError } from '../../runtime/source_documents.mjs';

export const VOICE_SOURCE_ADAPTER = 'voice-session-v1';
// A grant item names one conversation of one recording: `<session id>:<segment
// id>`. The separator is a character neither id holds and a grant item id
// accepts, so the pair survives as one token through the grant and back. An id
// with no separator is the whole recording, which is what a grant written before
// conversations were separated meant and still means.
export const SEGMENT_ITEM_SEPARATOR = ':';
export const splitSegmentItemId = itemId => {
  const at = String(itemId ?? '').indexOf(SEGMENT_ITEM_SEPARATOR);
  return at < 0 ? { session_id: String(itemId ?? ''), segment_id: null }
    : { session_id: String(itemId).slice(0, at), segment_id: String(itemId).slice(at + 1) };
};
export const segmentItemId = (sessionId, segmentId) => segmentId === null || segmentId === undefined
  ? sessionId : sessionId + SEGMENT_ITEM_SEPARATOR + segmentId;
const SESSION_SCHEMA = 'soulforge.voice_capture_session.v0';
const SEGMENT_SCHEMA = 'soulforge.voice_transcript_segment.v0';
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 32 * 1024 * 1024;
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;

class VoiceSourceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new VoiceSourceError(code); };
const toUtc = value => new Date(Date.parse(value)).toISOString();
const label = value => `voice.label:${createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
const codeOf = error => (error instanceof VoiceSourceError || error instanceof SourceReadError
  || error instanceof SourceDocumentError) ? error.code : 'adapter_failed';

// The owner may name the session folder; otherwise it is found by exact id below
// sessions/<date>/. Two folders with the same id are refused, never guessed.
async function sessionSegments(root, item, sessionId) {
  if (item.path) {
    if (item.path.at(-1) !== sessionId) fail('session_path_mismatch');
    const parent = item.path.slice(0, -1);
    return (await root.list(parent)).some(entry => entry.directory && entry.name === sessionId) ? [...item.path] : null;
  }
  const found = [];
  for (const date of await root.list(['sessions'])) {
    if (!date.directory || !DATE_DIR.test(date.name)) continue;
    for (const entry of await root.list(['sessions', date.name])) {
      if (entry.directory && entry.name === sessionId) found.push(['sessions', date.name, entry.name]);
    }
  }
  if (found.length > 1) fail('session_ambiguous');
  return found[0] ?? null;
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

async function documentFor({ admitted, source, item, root, segments, sessionId, conversation }) {
  const manifestFile = await root.readText([...segments, 'session_manifest.json'], MAX_MANIFEST_BYTES);
  let manifest;
  try { manifest = JSON.parse(manifestFile.text); } catch { fail('session_manifest_invalid'); }
  if (manifest?.schema_version !== SESSION_SCHEMA || manifest.session_id !== sessionId
    || !isInstant(manifest.recorded_at_local)) fail('session_manifest_invalid');
  // Which transcript of this recording the grant means. A session keeps the
  // provider's transcript where it is even after an independent machine
  // transcription is made -- the canonical pointer is never replaced under a
  // reader -- so a grant that wants the independent one has to name its run.
  // Naming a run names a folder, never a file: the adapter still opens only
  // `transcript.jsonl` below it, so audio and the quarantined provider summary
  // stay unreachable through this grant however the ref is written.
  const run = item.transcript_ref ?? null;
  let transcript;
  try { transcript = await root.readText([...segments, ...(run ?? []), 'transcript.jsonl'], MAX_TRANSCRIPT_BYTES); } catch (error) {
    if (error?.code === 'source_missing') {
      return { status: 'missing', code: run === null ? 'transcript_absent' : 'transcript_run_absent' };
    }
    throw error;
  }
  if (item.revision_policy === 'exact' && transcript.sha256 !== item.revision_sha256) {
    return { status: 'stale_grant', code: 'granted_revision_absent' };
  }
  const scope = item.scope ?? null;
  const rows = parseSegments(transcript.text).filter(row => !scope
    || (row.end_seconds > scope.start_seconds && row.start_seconds < scope.end_seconds));
  if (rows.length === 0) return { status: 'missing', code: scope ? 'scope_without_speech' : 'transcript_empty' };
  const start = Date.parse(manifest.recorded_at_local);
  const units = rows.map(row => ({ unit_kind: 'utterance',
    locator: { session_id: sessionId, segment_id: row.segment_id, start_seconds: row.start_seconds,
      end_seconds: row.end_seconds, speaker_label: row.speaker, transcript_sha256: transcript.sha256 },
    text: row.content, occurred_at: new Date(start + row.start_seconds * 1000).toISOString(),
    speaker_ref: row.speaker === 'UNKNOWN' ? null : label(row.speaker) }));
  const labels = [...new Set(rows.map(row => row.speaker).filter(value => value !== 'UNKNOWN'))];
  const facts = [
    { name: 'voice.provider_recording_id', value: String(manifest.provider_recording_id ?? ''), at: null },
    { name: 'voice.duration_seconds', value: Number(manifest.duration_seconds ?? 0), at: null },
    { name: 'voice.transcript_quality', value: String(manifest.transcript?.quality ?? 'unknown'), at: null },
    { name: 'voice.speaker_label_count', value: labels.length, at: null },
    { name: 'voice.canonicalization_state', value: String(manifest.canonicalization?.state ?? 'unknown'), at: null },
    // Only when a run was named, so a document prepared without one keeps exactly
    // the facts it had. `voice.transcript_quality` above stays the session
    // manifest's statement about the session's own transcript; these two say
    // which transcript the text below actually came from, and what the lane
    // claims that transcript is worth.
    ...(run === null ? [] : [
      { name: 'voice.transcript_ref', value: run.join('/'), at: null },
      { name: 'voice.transcript_evidence_role',
        value: String(manifest.independent_transcription?.evidence_role ?? 'unknown'), at: null },
    ]),
    // Which conversation of the recording this is. The title is a summary
    // somebody wrote so the conversation can be found again -- never speech, never
    // approved minutes -- and the marker beside it says so wherever it is read.
    ...(conversation === null ? [] : [
      { name: 'voice.conversation_segment_id', value: conversation.segment_id, at: null },
      { name: 'voice.conversation_segment_title', value: String(conversation.title ?? ''), at: null },
      { name: 'voice.conversation_segment_title_is_derived', value: true, at: null },
      { name: 'voice.conversation_nature', value: String(conversation.nature ?? 'undetermined'), at: null },
      ...(conversation.related_segment_ids.length === 0 ? []
        : [{ name: 'voice.related_segment_ids', value: conversation.related_segment_ids.join(','), at: null }]),
    ]),
  ];
  const document = buildSourceDocument({ admitted, sourceKind: 'voice', rootRef: source.root_ref, item,
    adapterProfile: VOICE_SOURCE_ADAPTER, primaryRevisionSha256: transcript.sha256,
    components: [{ kind: 'manifest', id: 'session', sha256: manifestFile.sha256 }],
    // The conversation's own title when the grant carries one: a piece answered
    // out of this document should say which conversation it came from, not only
    // which recording it happened to sit in.
    title: String(conversation?.title ?? manifest.source_page_title ?? sessionId),
    validAt: toUtc(manifest.recorded_at_local),
    knownAt: isInstant(manifest.imported_at_local) ? toUtc(manifest.imported_at_local) : null,
    timeBasis: 'recording_start_plus_offset', facts, units });
  return { status: 'prepared', document };
}

export async function readVoiceSourceDocuments({ admitted, source, rootPath }) {
  const results = [], documents = [];
  const outcome = (item, status, extra = {}) => results.push({ source_kind: 'voice', root_ref: source.root_ref,
    item_id: item.item_id, status, ...extra });
  let root;
  try { root = openSourceRoot(rootPath); } catch (error) {
    for (const item of source.items) outcome(item, 'failed', { code: codeOf(error) });
    return { documents, results };
  }
  for (const item of source.items) {
    try {
      const { session_id: sessionId, segment_id: segmentId } = splitSegmentItemId(item.item_id);
      const conversation = item.conversation_segment ?? null;
      // The item id and the conversation the grant describes have to be the same
      // one, or the document would be keyed to one and titled by another.
      if (conversation !== null && conversation.segment_id !== segmentId) fail('conversation_segment_mismatch');
      if (conversation === null && segmentId !== null) fail('conversation_segment_absent');
      const segments = await sessionSegments(root, item, sessionId);
      if (!segments) { outcome(item, 'missing', { code: 'source_missing' }); continue; }
      const result = await documentFor({ admitted, source, item, root, segments, sessionId, conversation });
      if (result.status !== 'prepared') { outcome(item, result.status, { code: result.code }); continue; }
      documents.push(result.document);
      outcome(item, 'prepared', { composite_revision_sha256: result.document.composite_revision_sha256,
        doc_key: result.document.doc_key });
    } catch (error) {
      outcome(item, 'failed', { code: codeOf(error) });
    }
  }
  return { documents, results };
}
