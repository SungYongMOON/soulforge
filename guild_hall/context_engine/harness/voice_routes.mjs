// Which conversation in which recording a person has decided belongs to which
// project.
//
// A PLAUD session arrives unclassified: one recording holds several separate
// conversations -- a project's test schedule, then team logistics, then an idea
// somebody had on the way out -- and nothing in the file says where one ends.
// The unit that gets decided, carried and read back is therefore a *conversation
// segment*, not a time window that happens to be a convenient length. The
// interval is how a segment is addressed; it is not what a segment is.
//
// The ledger keeps four things about a segment apart, because they answer four
// different questions and one of them is never an answer to another:
//   nature              what kind of conversation it is (project work, team
//                       operations, an idea, everyday talk, or not made out)
//   project_candidates  which project it is about, with the refs that say so
//   quality             how good the recording and the transcript are, and
//                       whether anyone has corrected them
//   status              whether a person has decided (confirmed), an
//                       investigator has proposed (candidate), or it is still
//                       unplaced (unclassified)
// A hard-to-hear work conversation is `unreadable` quality, not `daily` nature.
// A segment that mentions a part number shared by two projects is not thereby
// that project's: `basis` has to say what placed it.
//
// Title and description are derived summaries written for a person scanning the
// ledger. They are never speech and never minutes, which is what `derived_summary`
// marks. The ledger holds no transcript text, no provider summary and no audio:
// second offsets, refs, decisions, and who decided when. The recording itself is
// never moved, rewritten, re-transcribed or deleted by anything here.
//
// The recording library index carries the older, coarser form of the same
// decision -- a whole recording accepted for one project (`route_status:
// accepted_project_route` with an accepted code, acceptor and time). Both are
// read, and a recording accepted there counts as one confirmed whole-recording
// segment.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { isSafeSegment } from '../src/adapters/sources/guarded_files.mjs';
import { SEGMENT_ITEM_SEPARATOR, segmentItemId } from '../src/adapters/sources/voice_session_source.mjs';

export { SEGMENT_ITEM_SEPARATOR, segmentItemId, splitSegmentItemId } from '../src/adapters/sources/voice_session_source.mjs';

export const VOICE_ROUTE_LEDGER_SCHEMA = 'soulforge.voice_route_ledger.v0';
export const VOICE_ROUTE_STATUSES = Object.freeze(['confirmed', 'candidate', 'unclassified']);
// Fixed vocabulary. `unreadable` is about being able to make the conversation
// out at all and `undetermined` is about nobody having judged yet; neither is a
// kind of conversation, and neither may stand in for `daily`.
export const VOICE_SEGMENT_NATURES = Object.freeze(['project_work', 'team_operations', 'idea', 'daily',
  'unreadable', 'undetermined']);
export const VOICE_TRANSCRIPT_QUALITIES = Object.freeze(['provider_only', 'independent_fast',
  'independent_strong', 'unknown']);
export const VOICE_CORRECTION_STATES = Object.freeze(['none', 'machine_corrected', 'human_corrected']);
export const VOICE_ROUTES_ADDRESS = 'control_root/voice-routes';
export const VOICE_LIBRARY_INDEX_ADDRESS = 'data_root/ingress/plaud/library/index/recordings.current.json';
export const LIBRARY_INDEX_SCHEMA = 'soulforge.voice_recording_library_index.v0';
export const LIBRARY_ACCEPTED_STATUS = 'accepted_project_route';
export const VOICE_ROUTE_LIMITS = Object.freeze({ segments: 200, project_candidates: 8, evidence_refs: 32,
  related_segment_ids: 16, ref_characters: 512, title_characters: 200, description_characters: 1000,
  basis_characters: 500, ledger_bytes: 4 * 1024 * 1024, index_bytes: 64 * 1024 * 1024, ref_segments: 8 });

const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const SEGMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

export class VoiceRouteError extends Error {
  constructor(code) { super(code); this.name = 'VoiceRouteError'; this.code = code; }
}
const fail = code => { throw new VoiceRouteError(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exactKeys = (value, fields) => plain(value) && Object.keys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));
const isInstant = value => typeof value === 'string' && INSTANT.test(value) && Number.isFinite(Date.parse(value));
const text = (value, max) => value === null || (typeof value === 'string' && value.trim() === value
  && value.length > 0 && [...value].length <= max);

const LEDGER_FIELDS = ['schema_version', 'session_id', 'segments', 'updated_at'];
export const SEGMENT_FIELDS = Object.freeze(['segment_id', 'start_seconds', 'end_seconds', 'title', 'description',
  'derived_summary', 'nature', 'project_candidates', 'status', 'quality', 'transcript_ref', 'audio_ref',
  'related_segment_ids', 'draft_source', 'judged_by', 'judged_at', 'confirmed_by', 'confirmed_at']);
const CANDIDATE_FIELDS = ['project_code', 'evidence_refs', 'basis'];

// A ref below the session folder, with the source root's own segment rule, so a
// ledger can never name something the adapter would have to refuse when it reads.
export function isSessionRef(value) {
  return value === null || (Array.isArray(value) && value.length > 0
    && value.length <= VOICE_ROUTE_LIMITS.ref_segments && value.every(isSafeSegment));
}

function validCandidate(candidate) {
  return exactKeys(candidate, CANDIDATE_FIELDS) && PROJECT_CODE.test(candidate.project_code ?? '')
    && Array.isArray(candidate.evidence_refs) && candidate.evidence_refs.length <= VOICE_ROUTE_LIMITS.evidence_refs
    && candidate.evidence_refs.every(ref => typeof ref === 'string' && ref.length > 0
      && ref.length <= VOICE_ROUTE_LIMITS.ref_characters)
    // What placed it. A candidate with no stated basis is a guess wearing a
    // project code, and this ledger is exactly where that must not pass.
    && text(candidate.basis, VOICE_ROUTE_LIMITS.basis_characters) && candidate.basis !== null;
}

function validQuality(quality) {
  return exactKeys(quality, ['transcript', 'correction_state'])
    && VOICE_TRANSCRIPT_QUALITIES.includes(quality.transcript)
    && VOICE_CORRECTION_STATES.includes(quality.correction_state);
}

function validSegment(segment) {
  // Whole seconds: the interval becomes a grant scope, and a grant is identified
  // by its canonical bytes, which hold only safe integers. Rounding therefore
  // happens once, where a boundary is first derived, rather than being discovered
  // later as an unhashable grant.
  if (!exactKeys(segment, SEGMENT_FIELDS) || !SEGMENT_ID.test(segment.segment_id ?? '')
    || !Number.isSafeInteger(segment.start_seconds) || !Number.isSafeInteger(segment.end_seconds)
    || segment.start_seconds < 0 || segment.end_seconds <= segment.start_seconds
    || !text(segment.title, VOICE_ROUTE_LIMITS.title_characters)
    || !text(segment.description, VOICE_ROUTE_LIMITS.description_characters)
    // Never `false`: a title here is always somebody's or something's summary of
    // the conversation, never the words that were said and never minutes anyone
    // approved. The marker travels with the summary into the graph.
    || segment.derived_summary !== true
    || !VOICE_SEGMENT_NATURES.includes(segment.nature)
    || !Array.isArray(segment.project_candidates)
    || segment.project_candidates.length > VOICE_ROUTE_LIMITS.project_candidates
    || !segment.project_candidates.every(validCandidate)
    || new Set(segment.project_candidates.map(row => row.project_code)).size !== segment.project_candidates.length
    || !VOICE_ROUTE_STATUSES.includes(segment.status) || !validQuality(segment.quality)
    || !isSessionRef(segment.transcript_ref) || !isSessionRef(segment.audio_ref)
    || !Array.isArray(segment.related_segment_ids)
    || segment.related_segment_ids.length > VOICE_ROUTE_LIMITS.related_segment_ids
    || !segment.related_segment_ids.every(id => SEGMENT_ID.test(id) && id !== segment.segment_id)
    || new Set(segment.related_segment_ids).size !== segment.related_segment_ids.length
    || (segment.draft_source !== null && !(exactKeys(segment.draft_source, ['kind', 'run_id', 'unit_id'])
      && typeof segment.draft_source.kind === 'string' && isSafeSegment(segment.draft_source.run_id ?? '')
      && SEGMENT_ID.test(segment.draft_source.unit_id ?? '')))
    || !ACTOR.test(segment.judged_by ?? '') || !isInstant(segment.judged_at)) return false;
  // Confirmation is a person's act, so it is a person's fields, and it places the
  // segment with exactly one project. Two candidates is not a decision and none
  // is not either.
  if (segment.status === 'confirmed') {
    return ACTOR.test(segment.confirmed_by ?? '') && isInstant(segment.confirmed_at)
      && segment.project_candidates.length === 1;
  }
  return segment.confirmed_by === null && segment.confirmed_at === null;
}

/** Admits one ledger body exactly as written, or refuses it naming what was wrong. */
export function validateVoiceRouteLedger(body, { sessionId = null } = {}) {
  if (!exactKeys(body, LEDGER_FIELDS) || body.schema_version !== VOICE_ROUTE_LEDGER_SCHEMA
    || !SESSION_ID.test(body.session_id ?? '') || body.session_id.includes(SEGMENT_ITEM_SEPARATOR)
    || !Array.isArray(body.segments) || body.segments.length > VOICE_ROUTE_LIMITS.segments
    || (body.updated_at !== null && !isInstant(body.updated_at))) fail('voice_route_ledger_invalid');
  if (sessionId !== null && body.session_id !== sessionId) fail('voice_route_session_mismatch');
  if (!body.segments.every(validSegment)) fail('voice_route_segment_invalid');
  const ids = body.segments.map(segment => segment.segment_id);
  if (new Set(ids).size !== ids.length) fail('voice_route_segment_id_repeated');
  // A related id that names nothing in this recording is a dangling link, and a
  // reader would have to guess what it meant.
  const known = new Set(ids);
  for (const segment of body.segments) {
    if (!segment.related_segment_ids.every(id => known.has(id))) fail('voice_route_related_segment_unknown');
  }
  return Object.freeze({ ...structuredClone(body),
    segments: Object.freeze(body.segments.map(segment => Object.freeze({ ...structuredClone(segment) }))) });
}

/** The segments of one ledger a person confirmed for one project, in recording order. */
export function confirmedSegments(ledger, code) {
  return ledger.segments.filter(segment => segment.status === 'confirmed'
    && segment.project_candidates[0]?.project_code === code)
    .sort((a, b) => a.start_seconds - b.start_seconds || a.segment_id.localeCompare(b.segment_id));
}

const dirFiles = (io, address) => {
  let where;
  try { where = io.path(address, true); } catch { return []; }
  if (!existsSync(where) || !statSync(where).isDirectory()) return [];
  return readdirSync(where).filter(name => name.endsWith('.json')).sort();
};

/**
 * Every ledger below one folder, keyed by session. A ledger whose body is broken,
 * or names another session than its own file does, is reported with the code that
 * refused it: a decision record that cannot be read is a thing the Owner has to
 * see, not a thing to skip quietly.
 *
 * The folder is shared -- the voice inbox access declaration lives beside the
 * ledgers -- so a file that declares some other schema is not a broken ledger,
 * it is somebody else's record. Those are counted and named apart, and not read.
 */
export function readVoiceRouteLedgers({ io, address = VOICE_ROUTES_ADDRESS } = {}) {
  const ledgers = new Map(), refused = [], otherSchemas = [];
  for (const name of dirFiles(io, address)) {
    const sessionId = name.slice(0, -'.json'.length);
    try {
      const body = JSON.parse(io.read(`${address}/${name}`, VOICE_ROUTE_LIMITS.ledger_bytes));
      const declared = plain(body) ? (body.schema_version ?? body.schema) : null;
      if (typeof declared === 'string' && declared !== VOICE_ROUTE_LEDGER_SCHEMA) {
        otherSchemas.push({ file: name, schema: declared });
        continue;
      }
      ledgers.set(sessionId, validateVoiceRouteLedger(body, { sessionId }));
    } catch (error) {
      refused.push({ session_id: sessionId, code: error instanceof VoiceRouteError ? error.code : 'voice_route_ledger_unreadable' });
    }
  }
  return { ledgers, refused: refused.sort((a, b) => a.session_id.localeCompare(b.session_id)),
    other_schemas: otherSchemas.sort((a, b) => a.file.localeCompare(b.file)) };
}

/**
 * The recordings the library index records as accepted for one project. That is
 * the older shape of the same decision and it carries no segment, so it means the
 * whole recording. A row missing an acceptor or an acceptance time is not an
 * acceptance, by the same rule a segment follows.
 */
export function acceptedSessionsInIndex({ io, address = VOICE_LIBRARY_INDEX_ADDRESS, code } = {}) {
  let index;
  try { index = JSON.parse(io.read(address, VOICE_ROUTE_LIMITS.index_bytes)); }
  catch { return { sessions: [], read: false }; }
  if (index?.schema_version !== LIBRARY_INDEX_SCHEMA || !Array.isArray(index.recordings)) return { sessions: [], read: false };
  const sessions = index.recordings.filter(row => row?.route_state?.route_status === LIBRARY_ACCEPTED_STATUS
    && row.route_state.accepted_project_code === code && ACTOR.test(row.route_state.accepted_by ?? '')
    && isInstant(row.route_state.accepted_at) && SESSION_ID.test(row.session_id ?? '')
    && !row.session_id.includes(SEGMENT_ITEM_SEPARATOR))
    .map(row => row.session_id);
  return { sessions: [...new Set(sessions)].sort(), read: true };
}

/**
 * The voice items one project's grant may carry, from the two records above and
 * nothing else. One confirmed conversation segment is one grant item and one
 * document: its id carries both the recording and the segment, its interval is
 * the scope, and the derived title and nature travel with it so a piece answered
 * out of the graph can say which conversation it came from.
 *
 * `item` is the caller's item shape (revision policy, data class) so this module
 * decides admission only, never the grant's other terms.
 */
export function voiceGrantItems({ io, code, item, routesAddress = VOICE_ROUTES_ADDRESS,
  libraryIndexAddress = VOICE_LIBRARY_INDEX_ADDRESS } = {}) {
  const { ledgers, refused, other_schemas: otherSchemas } = readVoiceRouteLedgers({ io, address: routesAddress });
  const accepted = acceptedSessionsInIndex({ io, address: libraryIndexAddress, code });
  const items = [], skipped = [];
  let fromLedger = 0, fromIndex = 0;

  for (const [sessionId, ledger] of [...ledgers.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const segments = confirmedSegments(ledger, code);
    if (segments.length === 0) continue;
    // A recording the index also accepted whole is a second decision about the
    // same material. "This segment" and "the whole recording" are not the same
    // claim, so they are not merged: the recording waits until one is withdrawn.
    if (accepted.sessions.includes(sessionId)) {
      skipped.push({ session_id: sessionId, code: 'ledger_and_index_disagree', segments: segments.length });
      continue;
    }
    for (const segment of segments) {
      fromLedger += 1;
      items.push({ ...item, item_id: segmentItemId(sessionId, segment.segment_id),
        scope: { start_seconds: segment.start_seconds, end_seconds: segment.end_seconds },
        conversation_segment: { segment_id: segment.segment_id, title: segment.title,
          nature: segment.nature, related_segment_ids: [...segment.related_segment_ids] },
        ...(segment.transcript_ref === null ? {} : { transcript_ref: [...segment.transcript_ref] }) });
    }
  }
  for (const sessionId of accepted.sessions) {
    if (ledgers.has(sessionId)) continue;   // already decided above, either as items or as a skip
    fromIndex += 1;
    items.push({ ...item, item_id: sessionId });
  }
  return { items: items.sort((a, b) => a.item_id.localeCompare(b.item_id)),
    diagnostics: Object.freeze({ ledgers_read: ledgers.size, ledgers_refused: refused,
      other_schemas_in_folder: otherSchemas, library_index_read: accepted.read,
      confirmed_from_ledger: fromLedger, confirmed_from_index: fromIndex,
      skipped: skipped.sort((a, b) => a.session_id.localeCompare(b.session_id)) }) };
}
