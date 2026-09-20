// Where the first draft of a recording's conversation segments comes from.
//
// The voice lane already does the hard part. `analysis/semantic_labels/<run>/
// semantic_label_run.json` holds semantic units the lane derived from the
// independent transcript -- each with the transcript segments behind it, its
// interval, the speech acts and action codes in it, the entity kinds it saw, and
// what it could and could not resolve -- plus review windows saying which of
// them a person should listen to. Splitting a recording again here, by a fixed
// number of seconds or characters or by who was speaking, would be a second
// worse answer to a question already answered. So this module reads that run and
// hands back drafts; it splits nothing.
//
// It is read-only and it copies no content. Titles and descriptions come back
// empty, because the label run deliberately copies no transcript text
// (`boundaries.transcript_body_copied_to_output: false`) and inventing one from
// an interval would be a summary of nothing. Entity *kinds* and counts travel as
// a hint for the person reading the draft; entity values do not, because those
// are the words that were said and this ledger never holds those.
//
// Nothing here decides a project, a nature or a status. Every draft comes back
// `unclassified` with `undetermined` nature, carrying whatever the label run
// itself resolved as candidates -- and the label run refuses to emit project
// candidates at all until a stronger transcript exists, which is a boundary this
// module passes through rather than works around.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { VOICE_ROUTE_LIMITS, VoiceRouteError, isSessionRef, isSourceSegmentIds } from './voice_routes.mjs';

// A semantic unit's boundary falls where a transcript row ends, which is rarely a
// whole second. A conversation's interval has to be whole seconds, because it
// becomes a grant scope and a grant is identified by its canonical bytes. Both
// sides of a shared boundary round the same way, so conversations that were
// adjacent stay adjacent: no gap opens between them, and nothing that was said
// falls outside every conversation. The cost is at the boundary itself, where one
// utterance can sit at the edge of both neighbours; that is the side to err on,
// since the sentence that opens a topic is also how the previous one ended.
const wholeSeconds = value => Math.round(value);

export const SEMANTIC_LABEL_RUN_SCHEMA = 'soulforge.voice_semantic_label_run.v1';
export const SEMANTIC_LABELS_DIR = ['analysis', 'semantic_labels'];
export const VOICE_SESSIONS_ADDRESS = 'data_root/ingress/plaud/sessions';
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_RUN_BYTES = 64 * 1024 * 1024;
const fail = code => { throw new VoiceRouteError(code); };

const dirEntries = (io, address) => {
  let where;
  try { where = io.path(address, true); } catch { return []; }
  if (!existsSync(where) || !statSync(where).isDirectory()) return [];
  return readdirSync(where).sort();
};

/**
 * The address of one session below the sessions root, found by its exact id. Two
 * folders with the same id are refused rather than picked between -- the same
 * rule the source adapter applies when it opens one.
 */
export function sessionAddress({ io, sessionId, sessionsAddress = VOICE_SESSIONS_ADDRESS } = {}) {
  const found = [];
  for (const date of dirEntries(io, sessionsAddress)) {
    if (!DATE_DIR.test(date)) continue;
    const address = `${sessionsAddress}/${date}/${sessionId}`;
    let where;
    try { where = io.path(address, true); } catch { continue; }
    if (existsSync(where) && statSync(where).isDirectory()) found.push(address);
  }
  if (found.length > 1) fail('voice_session_ambiguous');
  return found[0] ?? null;
}

/** The label runs a session holds, newest name last. */
export function semanticLabelRuns({ io, session }) {
  return dirEntries(io, `${session}/${SEMANTIC_LABELS_DIR.join('/')}`)
    .filter(name => { const where = io.path(`${session}/${SEMANTIC_LABELS_DIR.join('/')}/${name}`, true);
      return existsSync(where) && statSync(where).isDirectory(); });
}

// `recording_ref.transcript_ref` names the transcript the labelling actually ran
// on, as a ref from the data root. The part of it below the session folder, minus
// the file name, is the run this session's segments should be read against -- so
// the draft does not make a person retype a run id the lane already chose.
export function transcriptRunFrom(recordingRef, sessionId) {
  const ref = typeof recordingRef?.transcript_ref === 'string' ? recordingRef.transcript_ref
    : typeof recordingRef?.transcript_jsonl_ref === 'string' ? recordingRef.transcript_jsonl_ref : null;
  if (ref === null) return null;
  const parts = ref.split('/').filter(Boolean);
  const at = parts.lastIndexOf(sessionId);
  if (at < 0) return null;
  const below = parts.slice(at + 1);
  const run = below.at(-1)?.includes('.') ? below.slice(0, -1) : below;
  return run.length > 0 && isSessionRef(run) ? run : null;
}

const qualityOf = inputClass => {
  const value = String(inputClass ?? '').toLowerCase();
  if (value.includes('strong')) return 'independent_strong';
  if (value.includes('fast')) return 'independent_fast';
  if (value.includes('provider')) return 'provider_only';
  return 'unknown';
};

/**
 * Conversation segment drafts for one session, from its semantic label run.
 * Returns the drafts in recording order plus the run's own boundaries, so a
 * caller can see that the run refused to place anything before treating its
 * empty candidate list as "nothing to see". Intervals come back in whole seconds
 * for the reason given at `wholeSeconds` above.
 */
export function readSemanticSegmentDrafts({ io, session, sessionId, runId = null } = {}) {
  const runs = semanticLabelRuns({ io, session });
  if (runs.length === 0) return { run_id: null, drafts: [], run: null, code: 'semantic_label_run_absent' };
  const chosen = runId === null ? (runs.length === 1 ? runs[0] : fail('semantic_label_run_ambiguous')) : runId;
  if (!runs.includes(chosen)) fail('semantic_label_run_absent');
  const address = `${session}/${SEMANTIC_LABELS_DIR.join('/')}/${chosen}/semantic_label_run.json`;
  let body;
  try { body = JSON.parse(io.read(address, MAX_RUN_BYTES)); } catch { return fail('semantic_label_run_unreadable'); }
  if (body?.schema_version !== SEMANTIC_LABEL_RUN_SCHEMA || !Array.isArray(body.segment_labels)) {
    fail('semantic_label_run_invalid');
  }
  const windows = Array.isArray(body.review_windows) ? body.review_windows : [];
  const transcriptRun = transcriptRunFrom(body.recording_ref, sessionId);
  const quality = qualityOf(body.evidence_gate?.input_class);

  const drafts = body.segment_labels
    .filter(unit => typeof unit?.unit_id === 'string' && Number.isFinite(unit.start_seconds)
      && Number.isFinite(unit.end_seconds) && unit.end_seconds > unit.start_seconds
      // The run already says which utterances each unit is made of. A unit that
      // does not say is not a draft anybody can address exactly, and guessing the
      // ids back out of the interval is the guess this field exists to remove.
      && isSourceSegmentIds([...new Set(unit.source_segment_ids ?? [])].sort((a, b) => a - b)))
    .sort((a, b) => a.start_seconds - b.start_seconds || a.unit_id.localeCompare(b.unit_id))
    .slice(0, VOICE_ROUTE_LIMITS.segments)
    .map(unit => ({ ...unit, start_seconds: wholeSeconds(unit.start_seconds),
      end_seconds: wholeSeconds(unit.end_seconds) }))
    // A unit shorter than the rounding is not a conversation anyone can address.
    // It is counted below rather than emitted as an interval of no length.
    .filter(unit => unit.end_seconds > unit.start_seconds)
    .map(unit => {
      const mine = windows.filter(window => Array.isArray(window.source_unit_refs)
        && window.source_unit_refs.includes(unit.unit_id));
      return {
        segment: { segment_id: unit.unit_id,
          source_segment_ids: [...new Set(unit.source_segment_ids)].sort((a, b) => a - b),
          start_seconds: unit.start_seconds, end_seconds: unit.end_seconds,
          title: null, description: null, derived_summary: true, nature: 'undetermined',
          // Whatever the run itself resolved, with the run named as the basis. It
          // resolves none until a stronger transcript exists, and that is its
          // decision to make, not this module's to fill in.
          project_candidates: (unit.project_match?.candidates ?? [])
            .filter(row => typeof row?.project_code === 'string')
            .slice(0, VOICE_ROUTE_LIMITS.project_candidates)
            .map(row => ({ project_code: row.project_code, evidence_refs: [],
              basis: `semantic_label_run:${chosen}:${unit.unit_id}` })),
          status: 'unclassified', quality: { transcript: quality, correction_state: 'none' },
          transcript_ref: transcriptRun, audio_ref: null, related_segment_ids: [],
          draft_source: { kind: 'semantic_labels', run_id: chosen, unit_id: unit.unit_id },
          judged_by: null, judged_at: null, confirmed_by: null, confirmed_at: null, withdrawn: [] },
        // For the person reading the draft. None of it is content: kinds and
        // counts, the codes the lane assigned, and what it said about review.
        hints: { source_segment_count: Array.isArray(unit.source_segment_ids) ? unit.source_segment_ids.length : 0,
          speech_acts: [...(unit.speech_acts ?? [])], action_codes: [...(unit.action_codes ?? [])],
          disposition: unit.disposition ?? null, project_match_state: unit.project_match?.state ?? null,
          entity_kinds: [...new Set((unit.entities ?? []).map(row => row?.kind).filter(Boolean))],
          entity_count: (unit.entities ?? []).length,
          importance_states: [...new Set(mine.map(window => window.importance_state).filter(Boolean))],
          escalation_states: [...new Set(mine.map(window => window.escalation_state).filter(Boolean))],
          human_listen_required: mine.some(window => window.human_listen_required === true) },
      };
    });

  const tooShort = body.segment_labels.length - drafts.length;
  return { run_id: chosen, runs, drafts, code: null, units_shorter_than_a_second: tooShort,
    run: { schema_version: body.schema_version, transcript_run: transcriptRun, quality,
      evidence_gate: { input_class: body.evidence_gate?.input_class ?? null,
        state: body.evidence_gate?.state ?? null,
        project_candidate_emission_allowed: body.evidence_gate?.project_candidate_emission_allowed ?? null },
      project_resolution_state: body.project_resolution?.state ?? null,
      semantic_unit_count: body.coverage?.semantic_unit_count ?? null,
      review_window_count: windows.length,
      transcript_body_copied: body.boundaries?.transcript_body_copied_to_output ?? null } };
}
