// Read-only source adapter over voice sessions kept by guild_hall/voice_capture
// (sessions/<date>/<session_id>/session_manifest.json + transcript.jsonl).
// Provider speaker labels are alignment hints, never identities. A grant scope
// limits a mixed recording to the interval that belongs to the project.
import { createHash } from 'node:crypto';
import { openSourceRoot, SourceReadError } from './guarded_files.mjs';
import { buildSourceDocument, isInstant, SourceDocumentError } from '../../runtime/source_documents.mjs';

export const VOICE_SOURCE_ADAPTER = 'voice-session-v1';
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
async function sessionSegments(root, item) {
  if (item.path) {
    if (item.path.at(-1) !== item.item_id) fail('session_path_mismatch');
    const parent = item.path.slice(0, -1);
    return (await root.list(parent)).some(entry => entry.directory && entry.name === item.item_id) ? [...item.path] : null;
  }
  const found = [];
  for (const date of await root.list(['sessions'])) {
    if (!date.directory || !DATE_DIR.test(date.name)) continue;
    for (const entry of await root.list(['sessions', date.name])) {
      if (entry.directory && entry.name === item.item_id) found.push(['sessions', date.name, entry.name]);
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

async function documentFor({ admitted, source, item, root, segments }) {
  const manifestFile = await root.readText([...segments, 'session_manifest.json'], MAX_MANIFEST_BYTES);
  let manifest;
  try { manifest = JSON.parse(manifestFile.text); } catch { fail('session_manifest_invalid'); }
  if (manifest?.schema_version !== SESSION_SCHEMA || manifest.session_id !== item.item_id
    || !isInstant(manifest.recorded_at_local)) fail('session_manifest_invalid');
  let transcript;
  try { transcript = await root.readText([...segments, 'transcript.jsonl'], MAX_TRANSCRIPT_BYTES); } catch (error) {
    if (error?.code === 'source_missing') return { status: 'missing', code: 'transcript_absent' };
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
    locator: { session_id: item.item_id, segment_id: row.segment_id, start_seconds: row.start_seconds,
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
  ];
  const document = buildSourceDocument({ admitted, sourceKind: 'voice', rootRef: source.root_ref, item,
    adapterProfile: VOICE_SOURCE_ADAPTER, primaryRevisionSha256: transcript.sha256,
    components: [{ kind: 'manifest', id: 'session', sha256: manifestFile.sha256 }],
    title: String(manifest.source_page_title ?? item.item_id), validAt: toUtc(manifest.recorded_at_local),
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
      const segments = await sessionSegments(root, item);
      if (!segments) { outcome(item, 'missing', { code: 'source_missing' }); continue; }
      const result = await documentFor({ admitted, source, item, root, segments });
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
