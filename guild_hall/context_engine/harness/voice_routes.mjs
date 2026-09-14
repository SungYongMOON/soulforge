// Which part of which recording a person has decided belongs to which project.
//
// A PLAUD session arrives unclassified: one recording can cross several projects,
// and nothing in it says where one ends. The collectors do not decide that, and
// neither does a model -- `analysis/semantic_labels/**` proposes, it does not
// route. The decision lives here, in a metadata-only ledger one file per session,
// written by a person or by the CLI they run, and read by the grant builder.
//
// Three states, and only one of them widens what may be read:
//   confirmed     a person judged this interval to be this project's, and said so
//                 with their own name and the time they said it. Only these reach
//                 a grant.
//   candidate     an investigator's proposal. It is kept so the next reviewer can
//                 see what was already looked at; it admits nothing.
//   unclassified  looked at, still not placed. Also admits nothing.
//
// The ledger holds no transcript text, no summary, and no audio: session ids,
// second offsets, the refs the judgement leaned on, and who judged when. The
// recording itself is never moved, rewritten or re-transcribed by anything here.
//
// The recording library index carries the older form of the same decision -- a
// whole session accepted for one project (`route_status: accepted_project_route`
// with an accepted code, acceptor and time). Both are read, and a session
// accepted there counts as one confirmed window covering the whole recording.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { isSafeSegment } from '../src/adapters/sources/guarded_files.mjs';

export const VOICE_ROUTE_LEDGER_SCHEMA = 'soulforge.voice_route_ledger.v0';
export const VOICE_ROUTE_STATUSES = Object.freeze(['confirmed', 'candidate', 'unclassified']);
export const VOICE_ROUTES_ADDRESS = 'control_root/voice-routes';
export const VOICE_LIBRARY_INDEX_ADDRESS = 'data_root/ingress/plaud/library/index/recordings.current.json';
export const LIBRARY_INDEX_SCHEMA = 'soulforge.voice_recording_library_index.v0';
export const LIBRARY_ACCEPTED_STATUS = 'accepted_project_route';
export const VOICE_ROUTE_LIMITS = Object.freeze({ routes: 200, evidence_refs: 32, ref_characters: 512,
  ledger_bytes: 1024 * 1024, index_bytes: 64 * 1024 * 1024, transcript_ref_segments: 8 });

const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
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
const isInstant = value => typeof value === 'string' && INSTANT.test(value)
  && Number.isFinite(Date.parse(value));

const LEDGER_FIELDS = ['schema_version', 'session_id', 'transcript_run', 'routes', 'updated_at'];
const ROUTE_FIELDS = ['project_code', 'start_seconds', 'end_seconds', 'status', 'evidence_refs',
  'judged_by', 'judged_at', 'confirmed_by', 'confirmed_at'];

// A transcript run ref: segments below the session folder, or null for the
// session transcript. The segment rule is the source root's own, so a ledger can
// never name something the adapter would have to refuse when it reads it.
export function isTranscriptRun(value) {
  return value === null || (Array.isArray(value) && value.length > 0
    && value.length <= VOICE_ROUTE_LIMITS.transcript_ref_segments && value.every(isSafeSegment));
}

function validRoute(route) {
  if (!exactKeys(route, ROUTE_FIELDS) || !PROJECT_CODE.test(route.project_code ?? '')
    || !Number.isFinite(route.start_seconds) || !Number.isFinite(route.end_seconds)
    || route.start_seconds < 0 || route.end_seconds <= route.start_seconds
    || !VOICE_ROUTE_STATUSES.includes(route.status)
    || !Array.isArray(route.evidence_refs) || route.evidence_refs.length > VOICE_ROUTE_LIMITS.evidence_refs
    || !route.evidence_refs.every(ref => typeof ref === 'string' && ref.length > 0
      && ref.length <= VOICE_ROUTE_LIMITS.ref_characters)
    || !ACTOR.test(route.judged_by ?? '') || !isInstant(route.judged_at)) return false;
  // Confirmation is a person's act, so it is a person's fields: a row that says
  // `confirmed` without a name and a time is not a confirmation, and this is the
  // one place that can be checked before anything reads more than it may.
  if (route.status === 'confirmed') return ACTOR.test(route.confirmed_by ?? '') && isInstant(route.confirmed_at);
  return route.confirmed_by === null && route.confirmed_at === null;
}

/** Admits one ledger body exactly as written, or refuses it naming what was wrong. */
export function validateVoiceRouteLedger(body, { sessionId = null } = {}) {
  if (!exactKeys(body, LEDGER_FIELDS) || body.schema_version !== VOICE_ROUTE_LEDGER_SCHEMA
    || !SESSION_ID.test(body.session_id ?? '') || !isTranscriptRun(body.transcript_run)
    || !Array.isArray(body.routes) || body.routes.length > VOICE_ROUTE_LIMITS.routes
    || (body.updated_at !== null && !isInstant(body.updated_at))) fail('voice_route_ledger_invalid');
  if (sessionId !== null && body.session_id !== sessionId) fail('voice_route_session_mismatch');
  if (!body.routes.every(validRoute)) fail('voice_route_invalid');
  return Object.freeze({ ...structuredClone(body), routes: Object.freeze(body.routes.map(route => Object.freeze({ ...route }))) });
}

/**
 * The confirmed intervals one ledger holds for one project, in seconds from the
 * recording start. Intervals that touch or overlap are one interval: their union
 * is exactly the material a person confirmed, so joining them widens nothing.
 * Intervals with a gap between them are left as they are -- the gap is material
 * nobody confirmed, and this module does not close it.
 */
export function confirmedWindows(ledger, code) {
  const windows = ledger.routes.filter(route => route.status === 'confirmed' && route.project_code === code)
    .map(route => ({ start_seconds: route.start_seconds, end_seconds: route.end_seconds }))
    .sort((a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds);
  const merged = [];
  for (const window of windows) {
    const held = merged.at(-1);
    if (held && window.start_seconds <= held.end_seconds) held.end_seconds = Math.max(held.end_seconds, window.end_seconds);
    else merged.push({ ...window });
  }
  return merged;
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
 * The sessions the recording library index records as accepted for one project.
 * That is the older shape of the same decision and it carries no interval, so it
 * means the whole recording. A row missing an acceptor or an acceptance time is
 * not an acceptance, by the same rule the ledger applies.
 */
export function acceptedSessionsInIndex({ io, address = VOICE_LIBRARY_INDEX_ADDRESS, code } = {}) {
  let index;
  try { index = JSON.parse(io.read(address, VOICE_ROUTE_LIMITS.index_bytes)); }
  catch { return { sessions: [], read: false }; }
  if (index?.schema_version !== LIBRARY_INDEX_SCHEMA || !Array.isArray(index.recordings)) return { sessions: [], read: false };
  const sessions = index.recordings.filter(row => row?.route_state?.route_status === LIBRARY_ACCEPTED_STATUS
    && row.route_state.accepted_project_code === code && ACTOR.test(row.route_state.accepted_by ?? '')
    && isInstant(row.route_state.accepted_at) && SESSION_ID.test(row.session_id ?? ''))
    .map(row => row.session_id);
  return { sessions: [...new Set(sessions)].sort(), read: true };
}

/**
 * The voice items one project's grant may carry, from the two records above and
 * nothing else. One session is one grant item, because a grant names an item once
 * and the adapter finds a session by its id; so a project with one confirmed
 * interval in a session gets that interval as the item's scope, and a project
 * with two intervals a gap apart in the same session gets neither. That is
 * refused rather than joined: joining them would admit the material between, and
 * nobody confirmed that material. The pair is named in `skipped` so it can be
 * seen and decided on.
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
    const windows = confirmedWindows(ledger, code);
    if (windows.length === 0) continue;
    if (windows.length > 1) { skipped.push({ session_id: sessionId, code: 'multiple_confirmed_windows', windows: windows.length }); continue; }
    // A session the index also accepted whole is a second decision about the same
    // recording. The ledger's interval and the whole recording are not the same
    // claim, so the two are not merged and the session is left out until one of
    // them is withdrawn.
    if (accepted.sessions.includes(sessionId)) { skipped.push({ session_id: sessionId, code: 'ledger_and_index_disagree' }); continue; }
    fromLedger += 1;
    items.push({ ...item, item_id: sessionId, scope: { ...windows[0] },
      ...(ledger.transcript_run === null ? {} : { transcript_ref: [...ledger.transcript_run] }) });
  }
  for (const sessionId of accepted.sessions) {
    if (ledgers.has(sessionId)) continue;   // already decided above, either as an item or as a skip
    fromIndex += 1;
    items.push({ ...item, item_id: sessionId });
  }
  return { items: items.sort((a, b) => a.item_id.localeCompare(b.item_id)),
    diagnostics: Object.freeze({ ledgers_read: ledgers.size, ledgers_refused: refused,
      other_schemas_in_folder: otherSchemas, library_index_read: accepted.read,
      confirmed_from_ledger: fromLedger, confirmed_from_index: fromIndex,
      skipped: skipped.sort((a, b) => a.session_id.localeCompare(b.session_id)) }) };
}
