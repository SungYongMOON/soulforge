// Dev harness and CLI: turn one unclassified recording into a conversation list
// -- where each conversation starts and ends, what kind of conversation it is,
// which project it might belong to, and which words the machine transcript
// probably misheard -- in seven checked steps rather than one prompt.
//
// Everything it reads is read-only: the recording's own transcripts, the ASR
// run's manifest, the semantic label run, the shared-term registry and the
// project bindings. Everything it writes goes to one place, `<derived_root>/
// voice/<session_id>/<run_id>/`, and none of it is a decision: every conversation
// comes out `candidate` or `unclassified`, because `confirmed` is a person's word
// and this pipeline is not a person. The transcript files are never touched --
// the corrected text exists only while a table is being drawn.
//
// The model is the local server named in the pipeline configuration, which must
// be a loopback address; the transcript of an unclassified recording belongs to
// no project's admission and therefore may not leave this host. Calls are
// budgeted, and every answer is cached under the run by the exact bytes that
// produced it, so running the same session twice costs nothing and continues
// where an exhausted budget stopped.
//
// usage:
//   node voice_conversation_list_cli.mjs run   --root-table <file> --tools-config <file>
//        --pipeline-config <file> --session <session id> [--json]
//   node voice_conversation_list_cli.mjs show  --tools-config <file> --session <id> [--run <run id>] [--json]
//   node voice_conversation_list_cli.mjs table --tools-config <file> --session <id> [--run <run id>]
//        [--corrections]
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { createLocalChat, installedModelDigest } from '../src/adapters/local_model/ollama_chat.mjs';
import { openGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { createGraphIndexRetriever } from '../src/runtime/graph_index_retrieval.mjs';
import { classifyTerms, loadSharedTerms } from '../src/runtime/shared_terms.mjs';
import { sessionAddress } from './voice_segment_drafts.mjs';
import {
  BASIS_KINDS, BOUNDARY_REASONS, CONVERSATION_LIST_SCHEMA, CORRECTIONS_SCHEMA, CORRECTION_REASONS,
  ConversationListError, KEY_TERM_KINDS, NATURES, RUN_MANIFEST_SCHEMA, applyCorrections, attachUncovered,
  batchSegments, boundaryWindows, cacheKeyFor, checkBoundaryProposal, checkCandidates, checkCorrection,
  applyContextContinuity, checkNature, classifyClues, clockAt, clueQuery, correctionGlossary, finalChecks,
  mergeDrafts, mergeNatureWindows, partialWindows,
  AGENDA_UTTERANCES, occurrenceCounter, qaBoundarySuspects, qualityReport, readPipelineConfig,
  recurringTokens, relatedByKeyTerms, renderConversationTable, renderCorrectionsTable, rulesCoverage,
  runIdFor, searchableClues, segmentsNeedingRejudgement, selectEvidenceHits, singleSegmentSuspect,
  stitchBoundaries, wholeMilliseconds,
} from '../src/runtime/voice_conversation_list.mjs';

export const VOICE_CONVERSATION_COMMANDS = Object.freeze(['run', 'show', 'table']);
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const RUN_ID = /^vcl_[0-9a-f]{16}$/u;
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const BINDINGS_AREA = 'control_root/project-bindings';
const BINDING_FILE = 'graph_index_binding.unified.json';
const READER = 'actor:owner:context-reader';
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
const MAX_CONFIG_BYTES = 1024 * 1024;
const UNIT_TEXT_CHARACTERS = 1200;
const SEGMENT_SCHEMA = 'soulforge.voice_transcript_segment.v0';
const LOCAL_RUN_SCHEMA = 'soulforge.local_asr_run.v0';
const LABEL_RUN_SCHEMA = 'soulforge.voice_semantic_label_run.v1';
// What counts against "this stretch could not be made out". Both are the ASR
// lane's own numbers: a repeated phrase it decoded out of silence, and a stretch
// it decoded with less than even odds per token.
const UNREADABLE_MARKS = Object.freeze(['hallucination_loop', 'low_confidence']);

const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new ConversationListError(code); };
const glyphs = value => [...String(value ?? '')];
const trim = (value, max) => {
  const held = glyphs(value);
  return held.length <= max ? held.join('') : `${held.slice(0, max).join('')}…[중략 ${held.length - max}자]`;
};
// A conversation longer than one call's input, kept from both ends. The middle is
// what a long stretch repeats; the opening says what it is about and the close
// says what came of it, and the marker says how much is missing rather than
// leaving the model to read a sentence that stops.
/** One line of a record, bounded: a quote in a prompt is a hint, not the record. */
const oneLine = (value, max) => {
  const first = String(value ?? '').split(String.fromCharCode(10)).map(row => row.trim()).find(Boolean) ?? '';
  return trim(first, max);
};
const headTail = (value, max, head = Math.round(max * 0.7)) => {
  const held = glyphs(value);
  if (held.length <= max) return held.join('');
  const tail = max - head;
  return `${held.slice(0, head).join('')}\n[중략 ${held.length - max}자]\n${held.slice(held.length - tail).join('')}`;
};

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    flags.set(token.slice(2), next === undefined || next.startsWith('--') ? true : (index++, next));
  }
  return flags;
}
const one = (flags, name) => { const value = flags.get(name); return value === undefined || value === true ? null : String(value); };

// ------------------------------------------------------------------ reading
function readJsonl(bytes, { schema }) {
  const rows = [];
  for (const line of String(bytes).split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { fail('voice_transcript_shape_invalid'); }
    if (row?.schema_version !== schema || !Number.isSafeInteger(row.segment_id)
      || !Number.isFinite(row.start_seconds) || !Number.isFinite(row.end_seconds)
      || typeof row.content !== 'string') fail('voice_transcript_shape_invalid');
    rows.push(row);
  }
  return rows.sort((a, b) => a.start_seconds - b.start_seconds || a.segment_id - b.segment_id);
}

const maybeRead = (io, address, max) => { try { return io.read(address, max); } catch { return null; } };

/**
 * Everything one run reads, gathered once and never re-opened.
 *
 * The semantic run is found by the digest of the transcript it says it labelled,
 * not by being the only folder there: a run made over a different revision names
 * utterance ids that mean something else, and using it would move every boundary
 * by however much the two transcripts differ.
 */
export function readSessionInputs({ io, sessionId }) {
  const session = sessionAddress({ io, sessionId });
  if (session === null) fail('voice_session_absent');
  const manifestBytes = io.read(`${session}/session_manifest.json`, MAX_MANIFEST_BYTES);
  const manifest = JSON.parse(manifestBytes);
  if (manifest?.session_id !== sessionId || typeof manifest.recorded_at_local !== 'string') {
    fail('voice_session_manifest_invalid');
  }
  const declared = manifest.independent_transcription ?? {};
  if (declared.status !== 'completed' || typeof declared.run_id !== 'string') fail('voice_local_asr_run_absent');
  const runDir = `${session}/analysis/local_asr/${declared.run_id}`;
  const analysis = JSON.parse(io.read(`${runDir}/analysis_manifest.json`, MAX_MANIFEST_BYTES));
  if (analysis?.schema_version !== LOCAL_RUN_SCHEMA || analysis.state !== 'completed') fail('voice_local_asr_run_absent');
  const transcriptBytes = io.read(`${runDir}/transcript.jsonl`, MAX_TRANSCRIPT_BYTES);
  const transcriptSha256 = hex(transcriptBytes);
  const rows = readJsonl(transcriptBytes, { schema: SEGMENT_SCHEMA });
  const suppressedBytes = maybeRead(io, `${runDir}/suppressed_segments.jsonl`, MAX_TRANSCRIPT_BYTES);
  const suppressed = suppressedBytes === null ? [] : readJsonl(suppressedBytes, { schema: SEGMENT_SCHEMA });
  const providerBytes = maybeRead(io, `${session}/transcript.jsonl`, MAX_TRANSCRIPT_BYTES);
  const providerRows = providerBytes === null ? [] : readJsonl(providerBytes, { schema: SEGMENT_SCHEMA });

  const labelsArea = `${session}/analysis/semantic_labels`;
  let names = [];
  try { names = readdirSync(io.path(labelsArea, true)).sort(); } catch { names = []; }
  const matching = [];
  for (const name of names) {
    const bytes = maybeRead(io, `${labelsArea}/${name}/semantic_label_run.json`, MAX_TRANSCRIPT_BYTES);
    if (bytes === null) continue;
    let body;
    try { body = JSON.parse(bytes); } catch { continue; }
    if (body?.schema_version !== LABEL_RUN_SCHEMA) continue;
    if (String(body.recording_ref?.transcript_sha256 ?? '') !== transcriptSha256) continue;
    matching.push({ run_id: name, sha256: hex(bytes), body });
  }
  if (matching.length === 0) fail('voice_semantic_label_run_absent');
  if (matching.length > 1) fail('voice_semantic_label_run_ambiguous');
  return { session, manifest, rows, suppressed, providerRows,
    transcript: { run_id: declared.run_id, sha256: transcriptSha256,
      kind: 'independent_fast', evidence_role: analysis.evidence_role ?? null,
      claim_ceiling: analysis.claim_ceiling ?? null },
    semantic: matching[0] };
}

// ------------------------------------------------------------------ prompts
const PROMPT_NAMES = Object.freeze(['boundary', 'boundary_recheck', 'nature', 'project', 'correction']);

export function readPrompts(directory) {
  const prompts = {}, digests = {};
  for (const name of PROMPT_NAMES) {
    const file = path.join(directory, `${name}.v1.md`);
    if (!existsSync(file)) fail('voice_pipeline_prompt_absent');
    const bytes = readFileSync(file);
    prompts[name] = bytes.toString('utf8');
    digests[name] = hex(bytes);
  }
  return { prompts, digests };
}

// ------------------------------------------------------------- model schemas
const array = items => ({ type: 'array', items });
const enumOf = values => ({ type: 'string', enum: [...values] });
const BOUNDARY_ANSWER = { type: 'object', additionalProperties: false, required: ['segments'], properties: {
  segments: array({ type: 'object', additionalProperties: false,
    required: ['draft_id', 'source_segment_ids', 'boundary_reason'], properties: {
      draft_id: { type: 'string' }, source_segment_ids: array({ type: 'integer' }),
      boundary_reason: enumOf(BOUNDARY_REASONS.filter(reason => reason !== 'rules_uncovered')),
      related_draft_ids: array({ type: 'string' }) } }) } };
const RECHECK_ANSWER = { type: 'object', additionalProperties: false, required: ['verdict', 'reason'], properties: {
  verdict: enumOf(['same_conversation', 'separate', 'unclear']), reason: { type: 'string' } } };
const NATURE_ANSWER = { type: 'object', additionalProperties: false, required: ['segments'], properties: {
  segments: array({ type: 'object', additionalProperties: false,
    required: ['segment_id', 'nature', 'title', 'description', 'key_terms', 'unclear'], properties: {
      segment_id: { type: 'string' }, nature: enumOf(NATURES), title: { type: 'string' },
      description: { type: 'string' },
      // Typed, because what a word names is what decides whether a project may
      // be searched by it. An untyped list makes "next week" and a board name
      // look like the same kind of clue.
      key_terms: array({ type: 'object', additionalProperties: false, required: ['term', 'kind'], properties: {
        term: { type: 'string' }, kind: enumOf(KEY_TERM_KINDS) } }),
      // What a long conversation held, so a reader can find the part they wanted.
      // A short one answers with an empty list.
      agenda: array({ type: 'object', additionalProperties: false,
        required: ['label', 'source_segment_ids'], properties: {
          label: { type: 'string' }, source_segment_ids: array({ type: 'integer' }) } }),
      unclear: { type: 'boolean' } } }) } };
const PROJECT_ANSWER = { type: 'object', additionalProperties: false, required: ['candidates'], properties: {
  candidates: array({ type: 'object', additionalProperties: false,
    required: ['project_code', 'evidence_row_ids', 'basis', 'strength'], properties: {
      project_code: { type: 'string' }, evidence_row_ids: array({ type: 'integer' }),
      basis: array(enumOf(BASIS_KINDS)), strength: enumOf(['strong', 'weak']) } }),
  unclassified_reason: { type: ['string', 'null'] } } };
const CORRECTION_ANSWER = { type: 'object', additionalProperties: false, required: ['proposals'], properties: {
  proposals: array({ type: 'object', additionalProperties: false,
    required: ['source_segment_id', 'original', 'proposed', 'reason', 'confidence'], properties: {
      source_segment_id: { type: 'integer' }, char_offset: { type: 'integer' },
      original: { type: 'string' }, proposed: { type: 'string' },
      reason: enumOf(CORRECTION_REASONS), confidence: enumOf(['high', 'medium', 'low']) } }) } };

// ------------------------------------------------------------------ re-ask
/**
 * A structurally valid answer -- it parsed, it matched the step's JSON
 * Schema, `makeAsk` cached it -- can still be rejected by a semantic rule
 * this file's `checkBoundaryProposal`/`checkNature` apply afterwards. A
 * rejection like that is not a transient failure: the model is asked at
 * temperature 0 from a trusted-loopback or agent-step binding, the cache key
 * is the exact request bytes, and a cached-but-rejected answer replays
 * identically forever, so a session stuck this way never becomes verified on
 * its own. Each of these strings is appended to the *next* attempt's `user`
 * text (never the cached one) together with `reaskAttemptLine`'s own fixed
 * "재요청 N/M" line, so the request bytes -- and so the cache key -- differ
 * between attempt 1 and attempt 2 too, not only between the original call and
 * the first re-ask (a fresh-eyes review measured that without the attempt
 * number, a model that repeats the same mistake makes attempt 2 build byte-
 * identical text to attempt 1, so attempt 2 silently replayed attempt 1's own
 * cached rejection instead of asking anything new -- the same "stuck
 * forever" bug this file exists to fix, one level deeper). Each sentence is
 * fixed and short and does not depend on anything about this particular
 * transcript. None of the five prompt files are edited for this: their
 * digests are bound into every existing card, and editing them would make
 * every one of those stale.
 *
 * `nature_missing_from_batch_answer` and `nature_batch_answer_ids_invalid`
 * are not `checkNature` rejection codes -- both are raised in this file when
 * a `nature` batch call returned a structurally valid answer (schema-
 * passing, cached) whose per-segment rows do not actually match the batch it
 * was asked about: an id this segment never had, an id repeated (in which
 * case `Map` construction would otherwise silently resolve to whichever
 * occurrence came last), or this segment's own id simply absent from the
 * response. Tagging any of those the generic `nature_llm_failed` (as earlier
 * code did, for the omitted case) hid a second reason a session got stuck at
 * 0 calls on replay: the batch call was cached as a *successful* call, so
 * nothing ever asked again. Re-asking with only this one segment (see
 * `checkedNature`) both names the real cause and is the fix: a request this
 * small is far less likely to be dropped, duplicated or misattributed than
 * one sharing a call with several other segments.
 *
 * A re-ask that fails twice, in both cases with a *fresh* (non-cached) call
 * that came back with the same rejection reason, is given up on for this
 * pass and every pass after it: the item stays in `remaining_work` and the
 * run stays unverified until the model, the pipeline config or the prompts
 * themselves change (any of which changes `runIdFor`'s inputs and so starts
 * a new run with an empty cache). Nothing here retries beyond that on its
 * own -- see `checkedNature`'s and the boundary loop's own "break early" doc.
 */
export const SEMANTIC_REASK_SENTENCES = Object.freeze({
  boundary_shape_invalid: '방금 답의 형식이 올바르지 않았습니다(구간이 비어 있거나 값이 없음). 이번 창의'
    + ' 발화 ID 전부를 하나 이상의 구간으로 나누어 다시 답하세요.',
  boundary_segment_outside_window: '방금 답이 이번 창에 없는 발화 ID를 담았습니다. 이번에 보여준 발화 ID만'
    + ' 사용해 다시 답하세요.',
  boundary_segment_repeated: '방금 답이 같은 발화 ID를 두 구간에 나눠 넣었습니다. 각 발화 ID는 정확히 한'
    + ' 구간에만 속하도록 다시 답하세요.',
  boundary_not_monotonic: '방금 답의 구간이 시간 순서를 벗어났습니다. 발화 ID가 커지는 순서 그대로 구간을'
    + ' 나누어 다시 답하세요.',
  boundary_reason_unknown: '방금 답의 boundary_reason 값이 허용된 값이 아니었습니다. 안내된 값 중 하나로'
    + ' 다시 답하세요.',
  boundary_segment_missing: '방금 답이 이번 창의 발화 ID를 전부 담지 않았습니다. 이번에 보여준 발화 ID'
    + ' 전부를 빠짐없이 하나의 구간에 넣어 다시 답하세요.',
  nature_shape_invalid: '방금 답의 형식이 올바르지 않았습니다. 안내된 형식 그대로 이 구간 하나만 다시'
    + ' 답하세요.',
  nature_unknown: '방금 답의 nature 값이 허용된 값이 아니었습니다. 안내된 값 중 하나로 이 구간을 다시'
    + ' 답하세요.',
  nature_title_too_long: '방금 답의 제목이 너무 길었습니다(40자 초과). 더 짧은 제목으로 이 구간을 다시'
    + ' 답하세요.',
  nature_description_too_long: '방금 답의 설명이 너무 길었습니다(200자 초과). 더 짧은 설명으로 이 구간을'
    + ' 다시 답하세요.',
  nature_title_names_a_project: '방금 답의 제목이 과제 코드나 과제 전용 산출물 이름을 담고 있어 거부되었'
    + '습니다. 제목은 어느 과제인지 밝히지 말고 이 대화 내용만으로 다시 쓰세요.',
  nature_missing_from_batch_answer: '방금 답에 이 구간의 항목이 빠졌습니다. 이 구간 하나만 다시 답하세요.',
  nature_batch_answer_ids_invalid: '방금 답의 구간 id가 이번에 물은 것과 맞지 않습니다(모르는 id이거나 같은'
    + ' id가 중복됨). 이 구간 하나에 대해서만, 정확히 이 구간의 id로 다시 답하세요.',
});
/** How many re-asks one (step, window) item may cost before this pass gives up on it. */
export const MAX_SEMANTIC_REASKS = 2;
/**
 * The fixed line appended after a re-ask's rejection sentence, naming the
 * attempt so attempt 1 and attempt 2 never build identical request bytes
 * even when the model repeats the exact same mistake both times -- see this
 * file's own `SEMANTIC_REASK_SENTENCES` doc for why that distinction matters.
 */
const reaskAttemptLine = (attempt, max) => `재요청 ${attempt}/${max}`;

// ---------------------------------------------------------------- the caller
/**
 * One step's call, with its answer kept beside the run.
 *
 * The cache is keyed by the exact bytes that went to the model, so a second pass
 * over the same recording asks nothing and a pass that ran out of budget resumes
 * with whatever it had already paid for. Cached answers are not charged: the
 * budget is about what this run asks the model, not about what it knows.
 */
function makeAsk({ chat, model, cacheDir, retries, counters }) {
  return async function ask({ step, system, user, schema }) {
    const key = cacheKeyFor({ step, model, system, user, schema });
    const file = path.join(cacheDir, step, `${key}.json`);
    if (existsSync(file)) {
      try {
        const held = JSON.parse(readFileSync(file, 'utf8'));
        counters.cache_hits += 1;
        return { status: 'ok', value: held.value, cached: true };
      } catch { /* an unreadable cache entry is simply asked again */ }
    }
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const answer = await chat({ step, system, user, schema });
      counters.calls += 1;
      counters.by_step[step] = (counters.by_step[step] ?? 0) + 1;
      if (answer.status === 'ok') {
        if (attempt > 1) counters.retries += attempt - 1;
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify({ step, value: answer.value }, null, 2)}\n`);
        return { status: 'ok', value: answer.value, cached: false };
      }
      if (answer.status === 'budget_exhausted') { counters.budget_exhausted = true; return answer; }
    }
    counters.retries += retries;
    return { status: 'failed' };
  };
}

// ------------------------------------------------------------------ the run
export async function runConversationList({ io, tools, config, prompts, promptDigests, configSha256,
  sessionId, chatFor = createLocalChat, pinFor = installedModelDigest, now = new Date().toISOString(),
  bindingsArea = BINDINGS_AREA } = {}) {
  const started = Date.now();
  const limits = config.limits;
  const input = readSessionInputs({ io, sessionId });
  const rowFor = new Map(input.rows.map(row => [row.segment_id, row]));
  const textOfId = id => rowFor.get(id)?.content ?? '';
  const quality = qualityReport({ rows: input.rows, suppressed: input.suppressed,
    providerRows: input.providerRows });
  const marksFor = new Map(quality.segments.map(row => [row.segment_id, row.marks]));

  const units = (input.semantic.body.segment_labels ?? [])
    .filter(unit => Array.isArray(unit.source_segment_ids) && unit.source_segment_ids.length > 0)
    .sort((a, b) => a.start_seconds - b.start_seconds);
  const unitFor = new Map();
  for (const unit of units) for (const id of unit.source_segment_ids) unitFor.set(id, unit);
  const coverage = rulesCoverage({ rows: input.rows, suppressed: input.suppressed, units });

  const model = await pinFor(config.model);
  const runId = runIdFor({ sessionId, transcript: input.transcript,
    semanticRun: { run_id: input.semantic.run_id, sha256: input.semantic.sha256 },
    prompts: promptDigests, model: { ...model, alias: config.model.model }, configSha256 });
  const outDir = path.join(tools.derived_root, 'voice', sessionId, runId);
  mkdirSync(path.join(outDir, 'cache'), { recursive: true });
  // The same inputs are the same run, so a second pass writes the same list --
  // including when it was first made. A fresh timestamp on an unchanged answer
  // would make two identical results look like two results.
  const generatedAt = (() => {
    try {
      const held = JSON.parse(readFileSync(path.join(outDir, 'conversation_list.v0.json'), 'utf8'));
      return held.run_id === runId && typeof held.generated_at === 'string' ? held.generated_at : now;
    } catch { return now; }
  })();

  const counters = { calls: 0, retries: 0, cache_hits: 0, by_step: {}, budget_exhausted: false };
  const session = chatFor({ binding: config.model, maxCalls: limits.llm_calls });
  const ask = makeAsk({ chat: session.chat, model: config.model.model, cacheDir: path.join(outDir, 'cache'),
    retries: limits.retries, counters });
  const remainingWork = [];
  const note = (step, segmentId, reason) => remainingWork.push({ step, segment_id: segmentId, reason });
  // Every re-ask this pass made because a *structurally valid, schema-passing*
  // answer was rejected by a semantic rule -- reason, ids and whether the
  // re-ask was accepted, never the transcript text or the model's own words.
  // Kept for the run manifest only (`manifest.reasks`); never affects run id.
  const reaskTrace = [];

  // --------------------------------------------------------------- step 2
  const unitText = unit => unit.source_segment_ids.map(textOfId).join(' ');
  const windows = boundaryWindows(units, { maxUnits: limits.boundary_units,
    maxCharacters: limits.boundary_characters, overlap: limits.boundary_overlap_units, textOf: unitText });
  const windowResults = [];
  // One window answered as one conversation is sometimes true and usually a
  // model declining to read. Asking again costs one call and is bounded per
  // session; a second single-segment answer is taken as the truth and said so.
  const REASK = '\n\n이 창을 통째로 한 구간이라고 답했습니다. 정말 처음부터 끝까지 한 가지 안건만'
    + ' 다룬 창이 아니라면, **안건이 바뀌는 자리에서 나눠** 다시 답하세요. 장소·시험·장비·산출물·담당·기한'
    + ' 중 하나가 바뀌면 안건이 바뀐 것입니다. 정말 한 안건뿐이면 같은 답을 그대로 내세요.';
  let reasks = 0;
  for (const window of windows) {
    const body = window.units.map(unit => {
      const marks = [...new Set(unit.source_segment_ids.flatMap(id => marksFor.get(id) ?? []))];
      const lines = unit.source_segment_ids.map(id => `${id}: ${textOfId(id)}`).join('\n');
      return `[${unit.unit_id}] segment_ids ${unit.source_segment_ids.join(',')}`
        + ` · acts ${(unit.speech_acts ?? []).join(',') || '-'} · marks ${marks.join(',') || '-'}\n`
        + trim(lines, UNIT_TEXT_CHARACTERS);
    }).join('\n\n');
    const user = `창 ${window.index + 1}/${windows.length} · 단위 ${window.units.length}개`
      + ` · 발화 ID ${window.segment_ids[0]}–${window.segment_ids.at(-1)}\n\n${body}`;
    let answer = await ask({ step: 'boundary', system: prompts.boundary, user, schema: BOUNDARY_ANSWER });
    let checked = answer.status === 'ok'
      ? checkBoundaryProposal(answer.value, { windowSegmentIds: window.segment_ids })
      : { ok: false, code: answer.status === 'budget_exhausted' ? 'llm_budget_exhausted' : 'boundary_llm_failed' };
    // A structurally valid proposal a semantic rule rejected -- not a call
    // failure -- gets a bounded re-ask with the rejection stated, so the next
    // request's bytes (and cache key) differ and a fresh call actually
    // happens. `answer.status === 'ok'` gates this: a genuine call failure
    // was never cached, so it already retries fresh on the next pass without
    // help from this loop. Two things keep the loop honest about what it
    // actually did: a reask is logged only when `ask()` says this attempt's
    // call was not a cache hit (`cached !== true`) -- a replayed rejection is
    // not a new re-ask, whatever the loop counter says -- and a *fresh* call
    // that comes back with the exact same rejection reason as the attempt
    // before it ends the loop early this pass rather than spending the
    // second attempt on a model that has just shown, for real, that it will
    // make the same mistake again; a later pass still gets the untried
    // attempt (see this constant's own doc for why the two attempts never
    // share request bytes).
    for (let attempt = 1; answer.status === 'ok' && !checked.ok
      && SEMANTIC_REASK_SENTENCES[checked.code] && attempt <= MAX_SEMANTIC_REASKS; attempt++) {
      const reason = checked.code;
      answer = await ask({ step: 'boundary', system: prompts.boundary,
        user: `${user}\n\n${SEMANTIC_REASK_SENTENCES[reason]}\n\n${reaskAttemptLine(attempt, MAX_SEMANTIC_REASKS)}`,
        schema: BOUNDARY_ANSWER });
      checked = answer.status === 'ok'
        ? checkBoundaryProposal(answer.value, { windowSegmentIds: window.segment_ids })
        : { ok: false, code: answer.status === 'budget_exhausted' ? 'llm_budget_exhausted' : 'boundary_llm_failed' };
      if (answer.cached !== true) {
        // `outcome` is what the fresh call actually came back as -- `null`
        // when accepted, otherwise its own code, which is not always
        // `reason` (a call that fails outright reports
        // `boundary_llm_failed`/`llm_budget_exhausted`, not a repeat of the
        // semantic reason that triggered this attempt).
        reaskTrace.push({ step: 'boundary', item: `window_${window.index + 1}`, reason, attempt,
          accepted: checked.ok, outcome: checked.code });
        if (!checked.ok && checked.code === reason) break;
      }
    }
    if (checked.ok) {
      let segments = answer.value.segments, extra = [];
      if (singleSegmentSuspect(window, segments) && reasks < limits.single_segment_reasks) {
        reasks += 1;
        const again = await ask({ step: 'boundary', system: prompts.boundary, user: `${user}${REASK}`,
          schema: BOUNDARY_ANSWER });
        const rechecked = again.status === 'ok'
          ? checkBoundaryProposal(again.value, { windowSegmentIds: window.segment_ids }) : { ok: false };
        if (rechecked.ok && again.value.segments.length > 1) segments = again.value.segments;
        else extra = ['single_segment_window'];
      } else if (singleSegmentSuspect(window, segments)) {
        extra = ['single_segment_window'];
        note('boundary', `window_${window.index + 1}`, 'single_segment_reask_budget');
      }
      windowResults.push({ window_index: window.index, segments, extra_reasons: extra });
      continue;
    }
    // The rules already drew a boundary at every unit. Falling back to those is
    // the one answer here that adds nothing of its own.
    note('boundary', `window_${window.index + 1}`, checked.code);
    windowResults.push({ window_index: window.index,
      segments: window.units.map(unit => ({ draft_id: unit.unit_id,
        source_segment_ids: [...unit.source_segment_ids], boundary_reason: 'topic_shift' })) });
  }
  let drafts = stitchBoundaries(windowResults);

  // Q/A boundaries, looked at again rather than merged on sight.
  const suspects = qaBoundarySuspects(drafts, { unitFor: id => unitFor.get(id),
    rowFor: id => rowFor.get(id), gapSeconds: limits.qa_gap_seconds });
  let rechecks = 0, merged = 0, stillSuspect = 0;
  const byTrigger = {};
  for (const suspect of suspects) for (const trigger of suspect.triggers) byTrigger[trigger] = (byTrigger[trigger] ?? 0) + 1;
  for (const suspect of [...suspects].sort((a, b) => b.index - a.index)) {
    const before = drafts[suspect.index], after = drafts[suspect.index + 1];
    if (before === undefined || after === undefined) continue;
    drafts = drafts.map((draft, index) => index === suspect.index ? { ...draft, qa_boundary: 'suspect' } : draft);
    if (rechecks >= limits.qa_rechecks) { note('boundary_recheck', `pair_${suspect.index}`, 'qa_recheck_budget'); stillSuspect += 1; continue; }
    const tail = before.source_segment_ids.slice(-12).map(id => `${id}: ${textOfId(id)}`).join('\n');
    const head = after.source_segment_ids.slice(0, 12).map(id => `${id}: ${textOfId(id)}`).join('\n');
    const user = `앞 구간 끝 (발화 ${before.source_segment_ids.at(-1)}까지)\n${trim(tail, UNIT_TEXT_CHARACTERS)}\n\n`
      + `뒤 구간 처음 (발화 ${after.source_segment_ids[0]}부터, 간격 ${suspect.gap_seconds}초)\n`
      + `${trim(head, UNIT_TEXT_CHARACTERS)}\n\n(의심 근거: ${suspect.triggers.join('+')})`;
    const answer = await ask({ step: 'boundary_recheck', system: prompts.boundary_recheck, user, schema: RECHECK_ANSWER });
    rechecks += 1;
    if (answer.status !== 'ok') { note('boundary_recheck', `pair_${suspect.index}`, 'recheck_llm_failed'); stillSuspect += 1; continue; }
    if (answer.value.verdict === 'same_conversation') { drafts = mergeDrafts(drafts, suspect.index); merged += 1; }
    else stillSuspect += 1;
  }

  const attached = attachUncovered(drafts, [...coverage.not_covered]);
  drafts = attached.drafts;
  const segments = drafts.map((draft, index) => ({ ...draft,
    segment_id: `c${String(index + 1).padStart(3, '0')}` }));
  const keyToId = new Map(segments.filter(segment => segment.draft_key !== null)
    .map(segment => [segment.draft_key, segment.segment_id]));
  const textOfSegment = segment => segment.source_segment_ids.map(textOfId).join(' ');

  // --------------------------------------------------------------- step 3
  const durationOf = segment => {
    const ids = segment.source_segment_ids;
    return (rowFor.get(ids.at(-1))?.end_seconds ?? 0) - (rowFor.get(ids[0])?.start_seconds ?? 0);
  };
  const long = segment => glyphs(textOfSegment(segment)).length > limits.nature_characters
    || durationOf(segment) > limits.window_seconds;
  const natureOf = new Map();
  // `extra`, appended to the user text, is only ever non-empty on a re-ask
  // (see `checkedNature` below) -- the ordinary call this function makes on
  // a first attempt is byte-identical to before this file grew a re-ask
  // path. The answer is validated against the batch it was actually asked
  // about, not just against the JSON Schema: a plain `new Map(rows.map(...))`
  // would silently drop an id the batch never had and resolve a repeated id
  // to whichever occurrence came last, and now that "absent from this map"
  // is load-bearing (`nature_missing_from_batch_answer`, below) those shapes
  // need their own name and their own re-ask rather than quietly becoming a
  // different segment's wrong answer or a whole batch's needless rejection.
  //
  // A stray extra row (an id the batch never asked about, alongside every
  // wanted id answered exactly once) is common enough on its own -- a model
  // padding its answer, or restating an id from an earlier turn -- that
  // hard-rejecting the *whole batch* over it would cost one re-ask call per
  // wanted segment for something that was never actually missing: at
  // `nature_segments_per_call` segments per call, one habitual extra row
  // could turn one call into `nature_segments_per_call + 1`. That shape is
  // accepted (the extra row is simply not in the map any wanted id is read
  // from) and recorded as a mark, counts only, on the segments it produced.
  // Only a genuinely ambiguous batch -- a duplicated id (which id is the
  // wanted one is no longer knowable), or an extra id *alongside* a still-
  // missing wanted id (the batch's shape does not match the request at all)
  // -- is rejected outright.
  const askNature = async (batch, extra = '') => {
    const body = batch.map(entry => `[${entry.segment_id}] 발화 ${entry.ids[0]}–${entry.ids.at(-1)}`
      + ` · 화행 ${entry.acts.join(',') || '-'} · 품질 ${entry.marks.join(',') || '-'}`
      + `${entry.ids.length >= AGENDA_UTTERANCES ? ' · (긴 구간 — agenda를 낼 것)' : ''}`
      + `\n${entry.text}`).join('\n\n');
    const answer = await ask({ step: 'nature', system: prompts.nature,
      user: `구간 ${batch.length}개\n\n${body}${extra ? `\n\n${extra}` : ''}`, schema: NATURE_ANSWER });
    const cached = answer.cached === true;
    if (answer.status !== 'ok') return { map: null, idsValid: null, extraIds: [], cached };
    const wanted = new Set(batch.map(entry => entry.segment_id));
    const rows = answer.value.segments ?? [];
    const seen = new Set(), extraIds = [];
    let duplicated = false;
    for (const row of rows) {
      const id = String(row.segment_id);
      if (seen.has(id)) { duplicated = true; break; }
      seen.add(id);
      if (!wanted.has(id)) extraIds.push(id);
    }
    const missing = [...wanted].some(id => !seen.has(id));
    const idsValid = !duplicated && !(extraIds.length > 0 && missing);
    const kept = idsValid ? rows.filter(row => wanted.has(String(row.segment_id))) : rows;
    return { map: new Map(kept.map(row => [String(row.segment_id), row])),
      idsValid, extraIds: idsValid ? extraIds : [], cached };
  };
  const entryFor = (segment, ids) => ({ segment_id: segment.segment_id, ids,
    acts: [...new Set(ids.map(id => unitFor.get(id)).filter(Boolean).flatMap(unit => unit.speech_acts ?? []))],
    marks: [...new Set(ids.flatMap(id => marksFor.get(id) ?? []))],
    text: ids.map(textOfId).join(' ') });
  const unreadableRatioOf = ids => ids.length === 0 ? 0
    : ids.filter(id => (marksFor.get(id) ?? []).some(mark => UNREADABLE_MARKS.includes(mark))).length / ids.length;
  const natureCheckFor = (entry, row) => checkNature(row, { text: entry.text,
    unreadableRatio: unreadableRatioOf(entry.ids), speechActs: entry.acts, segmentIds: entry.ids });
  // A window identifier for `reaskTrace`/`splitTrace`, not just the segment
  // id: a long segment's several windows share one segment id, and the
  // bound (`MAX_SEMANTIC_REASKS`/`MAX_WINDOW_SPLITS`) is per (step, window),
  // not per (step, segment) -- see this file's README note.
  const windowItem = entry => `${entry.segment_id}:${entry.ids[0]}-${entry.ids.at(-1)}`;
  const checkedFrom = (entry, found) => {
    if (found.map === null) return { ok: false, code: 'nature_llm_failed' };
    if (found.idsValid === false) return { ok: false, code: 'nature_batch_answer_ids_invalid' };
    const row = found.map.get(entry.segment_id) ?? null;
    if (row === null) return { ok: false, code: 'nature_missing_from_batch_answer' };
    const checked = natureCheckFor(entry, row);
    return checked.ok && found.extraIds.length > 0
      ? { ...checked, marks: [...(checked.marks ?? []), 'nature_batch_answer_extra_ids'] } : checked;
  };

  /**
   * One segment's nature answer, from an already-made call (`found`, the
   * `{map, idsValid, cached}` `askNature` returned for the batch this entry
   * was asked in), re-asked up to `MAX_SEMANTIC_REASKS` times for any of
   * three reasons: rejected by `checkNature`'s own rules, absent from an
   * otherwise valid batch answer (`nature_missing_from_batch_answer`), or
   * the batch answer's own ids do not match what was asked
   * (`nature_batch_answer_ids_invalid`). None of the three is a
   * `checkNature` rejection code proper -- all three are raised here because
   * the batch call itself *succeeded* (schema-valid, cached) while still not
   * being a usable answer for this one segment. Tagging any of them the
   * generic `nature_llm_failed` (as earlier code did) hid the reason a
   * session could replay at 0 calls forever: the omission or mismatch was
   * cached as success, so nothing ever asked again. A re-ask here is scoped
   * to this one segment alone, never the rest of its original batch, which
   * both names the cause and is smaller than the batch that produced it.
   *
   * A re-ask is only logged, and only counted toward "the model repeated the
   * same mistake" (which ends the loop early this pass), when `askNature`
   * itself reports the attempt was not a cache hit -- see
   * `SEMANTIC_REASK_SENTENCES`'s own doc for why attempt 2 never shares
   * request bytes with attempt 1, and the boundary loop's matching comment
   * for what "break early" buys and does not buy.
   */
  const checkedNature = async (entry, found) => {
    let checked = checkedFrom(entry, found);
    for (let attempt = 1; !checked.ok && SEMANTIC_REASK_SENTENCES[checked.code]
      && attempt <= MAX_SEMANTIC_REASKS; attempt++) {
      const reason = checked.code;
      const sentence = `${SEMANTIC_REASK_SENTENCES[reason]}\n\n${reaskAttemptLine(attempt, MAX_SEMANTIC_REASKS)}`;
      const reasked = await askNature([entry], sentence);
      checked = checkedFrom(entry, reasked);
      if (reasked.cached !== true) {
        // `outcome`: see the boundary loop's matching comment -- a fresh
        // call's own code, not always a repeat of `reason`.
        reaskTrace.push({ step: 'nature', item: windowItem(entry), reason, attempt,
          accepted: checked.ok, outcome: checked.code });
        if (!checked.ok && checked.code === reason) break;
      }
    }
    return checked;
  };
  /**
   * How many times one long segment's window may be halved and retried after
   * a genuine call failure (`checkedNature` already covers a semantic
   * rejection; this is for the case the call itself never produced a usable
   * answer -- most often output truncation on an oversized window) before
   * this pass gives up on that piece of it. Bounded to one split: a window
   * still broken after being halved is broken for a reason splitting further
   * is unlikely to fix. Guarded on `!counters.budget_exhausted` so a run that
   * has already spent its budget does not spend two more calls (and note()
   * two more failures) it was never going to be able to use.
   */
  const MAX_WINDOW_SPLITS = 1;
  const splitTrace = [];
  const natureWindowAnswers = async (segment, ids, depth = 0) => {
    const entry = entryFor(segment, ids);
    const found = await askNature([entry]);
    const checked = await checkedNature(entry, found);
    if (checked.ok) return [checked];
    if (found.map === null && ids.length > 1 && depth < MAX_WINDOW_SPLITS && !counters.budget_exhausted) {
      const mid = Math.ceil(ids.length / 2);
      const left = await natureWindowAnswers(segment, ids.slice(0, mid), depth + 1);
      const right = await natureWindowAnswers(segment, ids.slice(mid), depth + 1);
      splitTrace.push({ step: 'nature', item: windowItem(entry), depth: depth + 1,
        accepted: left.length > 0 || right.length > 0 });
      return [...left, ...right];
    }
    note('nature', segment.segment_id, checked.code);
    return [];
  };

  for (const segment of segments.filter(long)) {
    const windowsOf = partialWindows(segment.source_segment_ids, { textOf: textOfId, rowFor: id => rowFor.get(id),
      maxCharacters: limits.nature_characters, maxSeconds: limits.window_seconds });
    const answers = [];
    for (const ids of windowsOf) {
      answers.push(...await natureWindowAnswers(segment, ids));
    }
    natureOf.set(segment.segment_id, answers.length === 0
      ? { nature: 'mixed', title: `구간 ${segment.segment_id} (미정)`, description: '', key_terms: [],
        key_terms_typed: [], agenda: [], unclear: true, marks: ['nature_llm_failed'],
        processed_in_windows: windowsOf.length }
      // `processed_in_windows` is the number of windows this segment was
      // *planned* into, not how many pieces a failed window's own split
      // happened to produce -- a split is a retry of one planned window, not
      // a second one.
      : { ...mergeNatureWindows(answers), processed_in_windows: windowsOf.length });
  }
  const short = segments.filter(segment => !long(segment));
  for (const batch of batchSegments(short, { charactersOf: segment => glyphs(textOfSegment(segment)).length,
    maxCharacters: limits.nature_characters, maxSegments: limits.nature_segments_per_call })) {
    const entries = batch.map(segment => entryFor(segment, segment.source_segment_ids));
    const found = await askNature(entries);
    for (const entry of entries) {
      const checked = await checkedNature(entry, found);
      if (checked.ok) natureOf.set(entry.segment_id, { ...checked, processed_in_windows: 1 });
      else {
        note('nature', entry.segment_id, checked.code);
        natureOf.set(entry.segment_id, { nature: 'mixed', title: `구간 ${entry.segment_id} (미정)`,
          description: '', key_terms: [], key_terms_typed: [], agenda: [], unclear: true,
          marks: ['nature_llm_failed'], processed_in_windows: 1 });
      }
    }
  }

  // --------------------------------------------------------------- step 4
  const registry = tools.shared_terms_path ? loadSharedTerms(tools.shared_terms_path) : null;
  const retrievers = openProjectRetrievers({ io, bindingsArea });
  const evidenceRows = [];
  const judgements = new Map();
  const judge = async (segment, text, { revised = false } = {}) => {
    const ids = segment.source_segment_ids;
    // The labelling run's entities, with their kinds intact so that only the ones
    // naming a thing become clues. This lane's rule labeller emits dates,
    // measured values and person mentions, none of which narrows a project, so in
    // practice it contributes nothing here -- and says so rather than searching.
    const entities = ids.map(id => unitFor.get(id)).filter(Boolean).flatMap(unit => unit.entities ?? []);
    const clues = classifyClues(text, registry,
      { keyTerms: natureOf.get(segment.segment_id)?.key_terms_typed ?? [], entities });
    const searchable = searchableClues(clues, { limit: limits.project_clues });
    const table = clueTableFor(clues, searchable);
    if (searchable.length === 0) {
      return { candidates: [], unclassified_reason: 'no_distinctive_clue', clues, table, rows: [], revised };
    }
    const { query, used } = clueQuery(searchable);
    const rows = [];
    for (const [code, retriever] of retrievers.opened) {
      const answered = retriever.lexical(query);
      if (answered.status !== 'ok') continue;
      // Filter, then take. The search ranks by the whole query, so a project's top
      // rows can all be about its most ordinary word while the row that holds the
      // specific term sits further down.
      for (const { hit, matched } of selectEvidenceHits(answered.hits, searchable,
        { scan: limits.project_evidence_rows, keep: 3 })) {
        const quote = String(hit.text ?? '').split('\n').map(part => part.trim()).find(Boolean) ?? '';
        rows.push({ row_id: evidenceRows.length + rows.length + 1, project_code: code, item_id: String(hit.item_id ?? ''),
          // The record's title is what the matcher already reads; not carrying it
          // through left the model judging rows whose quoted line was a heading.
          title: oneLine(hit.title, limits.evidence_title_characters),
          unit_id: String(hit.unit_id ?? ''), source_kind: String(hit.source_kind ?? ''),
          quote: glyphs(quote).slice(0, limits.evidence_quote_characters).join(''),
          score: Number.isFinite(hit.score) ? hit.score : null, rank: hit.rank, matched_terms: matched });
      }
    }
    const kept = rows.sort((a, b) => b.matched_terms.length - a.matched_terms.length || a.rank - b.rank)
      .slice(0, limits.project_evidence_rows);
    if (kept.length === 0) return { candidates: [], unclassified_reason: 'no_evidence', clues, table, rows: [], revised };
    const shown = table.map(row => `${row.term} · ${row.kind} · ${row.term_kind}`
      + `${row.category === 'workflow' ? ' · workflow' : ''}${row.searched ? ' · 검색함' : ''}`).join('\n');
    const body = kept.map(row => `row ${row.row_id} · 과제 ${row.project_code} · 항목 ${row.item_id}`
      + ` · 제목 ${row.title || '(제목 없음)'} · ${row.source_kind} · 단위 ${row.unit_id}`
      + `\n  인용 ${row.quote}`).join('\n');
    const user = `구간 본문\n${headTail(text, limits.project_characters)}\n\n단서 분류표\n${shown}\n\n근거 행\n${body}`;
    const answer = await ask({ step: 'project', system: prompts.project, user, schema: PROJECT_ANSWER });
    if (answer.status !== 'ok') {
      note('project', segment.segment_id, answer.status === 'budget_exhausted' ? 'llm_budget_exhausted' : 'project_llm_failed');
      return { candidates: [], unclassified_reason: 'project_llm_failed', clues, table, rows: kept, revised };
    }
    const checked = checkCandidates(answer.value, { evidenceRows: kept, clues, limit: limits.project_candidates });
    return { candidates: checked.candidates, unclassified_reason: checked.unclassified_reason,
      downgraded: checked.downgraded, other_project_mentions: checked.other_project_mentions,
      strong_downgraded_single_clue: checked.strong_downgraded_single_clue ?? 0,
      clues, table, rows: kept, revised };
  };
  for (const segment of segments) {
    const judged = await judge(segment, textOfSegment(segment));
    evidenceRows.push(...judged.rows);
    judgements.set(segment.segment_id, judged);
  }

  // --------------------------------------------------------------- step 5
  const proposals = [], discarded = [];
  const knownTermsFor = text => (registry === null ? []
    : registry.terms.filter(row => text.toLowerCase().includes(row.normalized)).map(row => row.term));
  // Two more things the correction step needs to tell a mishearing from the
  // recording's own words: what this recording keeps saying, and what the records
  // of the projects it might belong to call the same things.
  const recurring = recurringTokens(input.rows);
  const occurrences = occurrenceCounter(input.rows);
  const evidenceFor = batch => {
    const rows = batch.flatMap(segment => judgements.get(segment.segment_id)?.rows ?? []);
    return [...new Map(rows.map(row => [`${row.item_id}\u0000${row.unit_id}`, row])).values()]
      .slice(0, limits.project_evidence_rows);
  };
  for (const batch of batchSegments(segments, {
    charactersOf: segment => glyphs(textOfSegment(segment)).length,
    maxCharacters: limits.correction_characters, maxSegments: limits.nature_segments_per_call })) {
    const idsInBatch = new Set(batch.flatMap(segment => segment.source_segment_ids));
    const windowsOf = batch.length === 1
      ? partialWindows(batch[0].source_segment_ids, { textOf: textOfId, rowFor: id => rowFor.get(id),
        maxCharacters: limits.correction_characters, maxSeconds: limits.window_seconds })
      : [batch.flatMap(segment => segment.source_segment_ids)];
    for (const ids of windowsOf) {
      const text = ids.map(textOfId).join(' ');
      const terms = [...new Set([...knownTermsFor(text),
        ...batch.flatMap(segment => natureOf.get(segment.segment_id)?.key_terms ?? [])])];
      const glossary = correctionGlossary({ terms, recurring, evidenceRows: evidenceFor(batch),
        maxRows: limits.project_evidence_rows, quote: oneLine });
      const body = ids.map(id => `${id}: ${textOfId(id)}`).join('\n');
      const user = `${glossary}\n\n발화\n${body}`;
      const answer = await ask({ step: 'correction', system: prompts.correction, user, schema: CORRECTION_ANSWER });
      if (answer.status !== 'ok') {
        for (const segment of batch) note('correction', segment.segment_id,
          answer.status === 'budget_exhausted' ? 'llm_budget_exhausted' : 'correction_llm_failed');
        continue;
      }
      const perUtterance = new Map(), perSegment = new Map();
      for (const raw of answer.value.proposals ?? []) {
        const id = raw?.source_segment_id;
        const segment = segments.find(row => row.source_segment_ids.includes(id));
        if (!idsInBatch.has(id) || segment === undefined) {
          discarded.push({ source_segment_id: id ?? null, original: String(raw?.original ?? ''),
            proposed: String(raw?.proposed ?? ''), code: 'utterance_not_in_segment' });
          continue;
        }
        const checked = checkCorrection(raw, { text: textOfId(id), knownTerms: knownTermsFor(textOfId(id)),
          keyTerms: natureOf.get(segment.segment_id)?.key_terms ?? [], occurrences,
          protectedWords: recurring.map(row => row.term) });
        if (checked.status !== 'proposed') {
          discarded.push({ source_segment_id: id, original: String(raw?.original ?? ''),
            proposed: String(raw?.proposed ?? ''), code: checked.code });
          continue;
        }
        const forUtterance = (perUtterance.get(id) ?? 0) + 1;
        const forSegment = (perSegment.get(segment.segment_id) ?? 0) + 1;
        if (forUtterance > limits.correction_per_utterance || forSegment > limits.correction_per_segment) {
          discarded.push({ source_segment_id: id, original: checked.original, proposed: checked.proposed,
            code: forUtterance > limits.correction_per_utterance ? 'too_many_for_utterance' : 'too_many_for_segment' });
          continue;
        }
        perUtterance.set(id, forUtterance);
        perSegment.set(segment.segment_id, forSegment);
        proposals.push({ proposal_id: `p${String(proposals.length + 1).padStart(3, '0')}`,
          segment_id: segment.segment_id, source_segment_id: id, ...checked, status: 'proposed' });
      }
    }
  }

  // --------------------------------------------------------------- step 6
  const withCorrections = segments.map(segment => ({ ...segment,
    key_terms: natureOf.get(segment.segment_id)?.key_terms ?? [],
    corrections: proposals.filter(row => row.segment_id === segment.segment_id) }));
  const correctedTextOf = segment => segment.source_segment_ids.map(id => applyCorrections(textOfId(id),
    segment.corrections.filter(row => row.source_segment_id === id && row.confidence === 'high'))).join(' ');
  let rejudged = 0;
  for (const segment of segmentsNeedingRejudgement(withCorrections, { correctedTextOf })) {
    const judged = await judge(segment, correctedTextOf(segment), { revised: true });
    evidenceRows.push(...judged.rows);
    judgements.set(segment.segment_id, judged);
    rejudged += 1;
  }

  // --------------------------------------------------------------- step 7
  // A recording returns to an agenda item across a window the boundary step could
  // not see past. Two conversations that share more than one word able to narrow
  // anything are that return, and the link is the model's own `related_draft_ids`
  // plus this.
  const keyTermLinks = relatedByKeyTerms(
    segments.map(segment => ({ segment_id: segment.segment_id,
      key_terms: natureOf.get(segment.segment_id)?.key_terms ?? [] })), { registry });
  const relatedLinks = new Map();
  for (const link of keyTermLinks) {
    for (const [from, to] of [[link.from, link.to], [link.to, link.from]]) {
      relatedLinks.set(from, [...new Set([...(relatedLinks.get(from) ?? []), to])]);
    }
  }
  const recordedAt = input.manifest.recorded_at_local;
  const unplaced = segments.map(segment => {
    const ids = segment.source_segment_ids;
    const start = Math.min(...ids.map(id => rowFor.get(id)?.start_seconds ?? 0));
    const end = Math.max(...ids.map(id => rowFor.get(id)?.end_seconds ?? 0));
    const nature = natureOf.get(segment.segment_id) ?? { nature: 'mixed', title: '', description: '',
      key_terms: [], key_terms_typed: [], agenda: [], unclear: true, marks: [], processed_in_windows: 1 };
    const judged = judgements.get(segment.segment_id) ?? { candidates: [], unclassified_reason: 'no_evidence', clues: [], table: [] };
    const marks = [...new Set(ids.flatMap(id => marksFor.get(id) ?? []))].sort();
    const probabilities = ids.map(id => rowFor.get(id)?.asr_confidence?.mean_token_probability).filter(Number.isFinite);
    const mine = proposals.filter(row => row.segment_id === segment.segment_id);
    return { segment_id: segment.segment_id, source_segment_ids: [...ids],
      start_seconds: start, end_seconds: end, start_ms: wholeMilliseconds(start), end_ms: wholeMilliseconds(end),
      clock: clockAt(recordedAt, start).stamp, clock_end: clockAt(recordedAt, end).stamp,
      title: nature.title, description: nature.description, derived_summary: true,
      nature: nature.nature, nature_unclear: nature.unclear === true,
      key_terms: [...nature.key_terms],
      key_terms_typed: [...(nature.key_terms_typed ?? [])],
      agenda_items: [...(nature.agenda ?? [])],
      // What the nature step said about its own answer, so a thin agenda is
      // visible as a thin agenda rather than as an absent one.
      nature_marks: [...(nature.marks ?? [])],
      clue_table: judged.table ?? [],
      // The registry's verdict on the words actually in this conversation. Clues
      // include what the labelling run saw and what step 3 picked out; these are
      // only the ones the registry can speak for.
      term_marks: classifyTerms(textOfSegment(segment), registry)
        .filter(mark => mark.kind !== 'unregistered')
        .map(mark => ({ term: mark.term, kind: mark.kind, category: mark.category,
          declared_shared: mark.declared_shared, observed_project_count: mark.observed_project_count })),
      project_candidates: judged.candidates.map(row => ({ project_code: row.project_code, strength: row.strength,
        strong_by: row.strong_by ?? null, basis: [...row.basis], evidence_row_ids: [...row.evidence_row_ids] })),
      other_project_mentions: [...(judged.other_project_mentions ?? [])],
      unclassified_reason: judged.candidates.length === 0 ? judged.unclassified_reason : null,
      status: judged.candidates.length === 0 ? 'unclassified' : 'candidate',
      quality: { transcript_kind: quality.transcript_kind, marks,
        correction_state: mine.length === 0 ? 'none' : 'machine_proposed',
        unreadable_ratio: Number(unreadableRatioOf(ids).toFixed(4)),
        mean_token_probability: probabilities.length === 0 ? null
          : Number((probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length).toFixed(4)) },
      refs: { session_id: sessionId, transcript_run_id: input.transcript.run_id,
        semantic_run_id: input.semantic.run_id, source_segment_ids: [...ids], audio_ref: 'audio/source.mp3' },
      related_segment_ids: [...new Set([...(segment.related_draft_keys ?? []).map(key => keyToId.get(key))
        .filter(id => id !== undefined && id !== segment.segment_id),
      ...(relatedLinks.get(segment.segment_id) ?? [])])].sort(),
      boundary: { reasons: [...new Set([...segment.boundary_reasons,
        ...(relatedLinks.has(segment.segment_id) ? ['related_by_key_terms'] : [])])],
      qa_boundary: segment.qa_boundary, processed_in_windows: nature.processed_in_windows ?? 1 },
      revised_after_correction: judged.revised === true };
  });
  // A stretch that named nothing, sitting inside work that did.
  const continuity = applyContextContinuity(unplaced);
  const rows = continuity.segments;
  const checks = finalChecks({ segments: rows, rows: input.rows,
    suppressedSegmentIds: [...coverage.suppressed_segment_ids], coverage });
  const list = { schema: CONVERSATION_LIST_SCHEMA, session_id: sessionId, run_id: runId, generated_at: generatedAt,
    verified: checks.every(check => check.status === 'ok') && remainingWork.length === 0,
    checks, transcript: { run_id: input.transcript.run_id, sha256: `sha256:${input.transcript.sha256}`,
      kind: input.transcript.kind },
    semantic_run: { run_id: input.semantic.run_id, sha256: `sha256:${input.semantic.sha256}` },
    model: { pin_kind: model.pin_kind, digest: model.digest, alias: config.model.model },
    prompts: promptDigests, suppressed_segment_ids: [...coverage.suppressed_segment_ids],
    remaining_work: remainingWork, segments: rows,
    evidence_rows: evidenceRows.map(row => ({ row_id: row.row_id, project_code: row.project_code,
      item_id: row.item_id, title: row.title ?? '', unit_id: row.unit_id, source_kind: row.source_kind,
      quote: row.quote, score: row.score, matched_terms: [...row.matched_terms] })) };
  const corrections = { schema: CORRECTIONS_SCHEMA, session_id: sessionId, run_id: runId, generated_at: generatedAt,
    proposals, discarded,
    counts: { proposed: proposals.length, discarded: discarded.length,
      needs_audio_recheck: proposals.filter(row => row.needs_audio_recheck).length,
      known_term_overrides: proposals.filter(row => row.original_is_known_term).length,
      recurring_original_overrides: proposals.filter(row => row.original_recurs_in_transcript).length,
      synonym_normalizations: proposals.filter(row => row.synonym_normalization).length,
      mapped_onto_protected_word: proposals.filter(row => row.mapped_onto_protected_word).length,
      offset_corrected_by_code: proposals.filter(row => row.offset_corrected_by_code).length,
      by_discard_code: discarded.reduce((held, row) => ({ ...held, [row.code]: (held[row.code] ?? 0) + 1 }), {}) } };

  const before = (() => {
    try {
      return readFileSync(path.join(outDir, 'run_passes.jsonl'), 'utf8').split('\n').filter(Boolean)
        .map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  })();
  // How long the model took, kept with the pass rather than only in the trace:
  // a later pass overwrites the manifest, and "how slow was it" is a fact about
  // the pass that paid for it.
  const latencies = session.trace().map(row => row.elapsed_ms).filter(Number.isFinite).sort((a, b) => a - b);
  const thisPass = { pass: before.length + 1, at: now, elapsed_ms: Date.now() - started,
    calls: counters.calls, retries: counters.retries, cache_hits: counters.cache_hits,
    budget_exhausted: counters.budget_exhausted, remaining_work: remainingWork.length,
    verified: list.verified,
    // `run_manifest.json` (below) is overwritten every pass, so its own
    // `reasks`/`splits` only ever show the *last* pass; `run_passes.jsonl`
    // is append-only, so a count here is the only place a later reader can
    // see whether an already-terminal (unverified, no more calls) run ever
    // actually tried a re-ask or a split at all.
    reasks: reaskTrace.length, reasks_accepted: reaskTrace.filter(row => row.accepted).length,
    splits: splitTrace.length,
    latency_ms: latencies.length === 0 ? null : { min: latencies[0], median: latencies[Math.floor(latencies.length / 2)],
      max: latencies.at(-1), mean: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) } };
  const passes = [...before, thisPass];
  const manifest = { schema: RUN_MANIFEST_SCHEMA, session_id: sessionId, run_id: runId, generated_at: now,
    elapsed_ms: Date.now() - started,
    model: { host: config.model.host, alias: config.model.model, transport: config.model.transport ?? null,
      pin_kind: model.pin_kind, digest: model.digest, think: config.model.think ?? null,
      options: { ...(config.model.options ?? {}) } },
    prompts: promptDigests, limits, config_sha256: `sha256:${configSha256}`,
    calls: { total: counters.calls, by_step: counters.by_step, retries: counters.retries,
      cache_hits: counters.cache_hits, budget: limits.llm_calls, budget_exhausted: counters.budget_exhausted },
    // Every re-ask this pass made because a structurally valid answer was
    // rejected by a semantic rule (or, for `nature`, was silently absent from
    // or mismatched against an otherwise valid batch answer) -- reason, item
    // id (a window, `<segment_id>:<first utterance>-<last utterance>`, not
    // just a segment: the bound is per window), attempt number and whether
    // it was accepted, and nothing about what was actually said. Only a
    // genuinely fresh (non-cached) attempt is counted here -- a re-ask that
    // merely replayed an already-cached rejection is not a re-ask.
    reasks: { total: reaskTrace.length,
      by_reason: reaskTrace.reduce((held, row) => ({ ...held, [row.reason]: (held[row.reason] ?? 0) + 1 }), {}),
      accepted: reaskTrace.filter(row => row.accepted).length, entries: reaskTrace },
    // Every time a `nature` window was halved and retried after a genuine
    // call failure (distinct from `reasks`, which is about semantic
    // rejections of an answer the model actually gave -- a split is about a
    // call that never produced one). `additive`: both `reasks` and `splits`
    // are new fields on the unchanged `soulforge.voice_conversation_run.v0`
    // schema (`RUN_MANIFEST_SCHEMA`, deliberately not bumped for either).
    splits: { total: splitTrace.length, accepted: splitTrace.filter(row => row.accepted).length, entries: splitTrace },
    // What this pass did, and what every pass before it did. A pass that finds a
    // full cache asks nothing, which is the point -- but it would also overwrite
    // the only record of what the first pass cost, and "the run took no calls"
    // read off a second pass is not true of the run.
    passes,
    trace: session.trace().map(row => ({ call: row.call, step: row.step, status: row.status,
      elapsed_ms: row.elapsed_ms, http_status: row.http_status ?? null, done_reason: row.done_reason ?? null,
      prompt_tokens: row.prompt_tokens ?? null, output_tokens: row.output_tokens ?? null })),
    transcript: { run_id: input.transcript.run_id, sha256: `sha256:${input.transcript.sha256}`,
      rows: input.rows.length, suppressed: input.suppressed.length, provider_rows: input.providerRows.length,
      evidence_role: input.transcript.evidence_role, claim_ceiling: input.transcript.claim_ceiling },
    semantic_run: { run_id: input.semantic.run_id, sha256: `sha256:${input.semantic.sha256}`,
      units: units.length, evidence_gate: input.semantic.body.evidence_gate ?? null },
    quality: { transcript_kind: quality.transcript_kind, counts: quality.counts,
      mean_token_probability: quality.mean_token_probability,
      provider_local_token_overlap: quality.provider_local_token_overlap },
    coverage, boundary: { windows: windows.length, drafts_after_stitch: drafts.length,
      qa_suspects: suspects.length, qa_suspects_by_trigger: byTrigger,
      qa_rechecks: rechecks, qa_merged: merged, qa_still_suspect: stillSuspect,
      uncovered_attached: attached.attached, uncovered_segment: attached.uncovered_draft !== null,
      single_segment_reasks: reasks,
      single_segment_windows: segments.filter(row => row.boundary_reasons.includes('single_segment_window')).length,
      related_by_key_terms: keyTermLinks.length },
    projects: { opened: [...retrievers.opened.keys()], refused: retrievers.refused,
      evidence_rows: evidenceRows.length, rejudged,
      other_project_mentions: rows.reduce((sum, row) => sum + row.other_project_mentions.length, 0),
      mention_reasons: rows.flatMap(row => row.other_project_mentions.map(item => item.code ?? 'unknown'))
        .reduce((held, code) => ({ ...held, [code]: (held[code] ?? 0) + 1 }), {}),
      strong_downgraded_single_clue: [...judgements.values()]
        .reduce((sum, row) => sum + (row.strong_downgraded_single_clue ?? 0), 0),
      context_continuity_candidates: continuity.applied.length,
      context_continuity: continuity.applied, context_stretches: continuity.stretches },
    counts: { segments: rows.length,
      nature: Object.fromEntries(NATURES.map(nature => [nature, rows.filter(row => row.nature === nature).length])),
      candidate: rows.filter(row => row.status === 'candidate').length,
      unclassified: rows.filter(row => row.status === 'unclassified').length,
      unclassified_reasons: rows.filter(row => row.status === 'unclassified')
        .reduce((held, row) => ({ ...held, [row.unclassified_reason ?? 'unknown']: (held[row.unclassified_reason ?? 'unknown'] ?? 0) + 1 }), {}),
      project_mixed: rows.filter(row => row.project_candidates.length >= 2).length,
      strong_by: rows.flatMap(row => row.project_candidates.map(item => item.strong_by))
        .filter(Boolean).reduce((held, kind) => ({ ...held, [kind]: (held[kind] ?? 0) + 1 }), {}),
      agenda_items: rows.reduce((sum, row) => sum + row.agenda_items.length, 0),
      segments_with_agenda: rows.filter(row => row.agenda_items.length > 0).length,
      agenda_absent: rows.filter(row => row.nature_marks.includes('agenda_absent')).length,
      agenda_covers_whole_segment: rows.filter(row => row.nature_marks.includes('agenda_covers_whole_segment')).length,
      agenda_items_dropped: rows.filter(row => row.nature_marks.includes('agenda_items_dropped')).length,
      corrections: corrections.counts },
    checks, remaining_work: remainingWork, verified: list.verified };

  writeFileSync(path.join(outDir, 'conversation_list.v0.json'), `${JSON.stringify(list, null, 2)}\n`);
  appendFileSync(path.join(outDir, 'run_passes.jsonl'), `${JSON.stringify(thisPass)}\n`);
  writeFileSync(path.join(outDir, 'corrections.v0.json'), `${JSON.stringify(corrections, null, 2)}\n`);
  writeFileSync(path.join(outDir, 'run_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(outDir, 'quality.v0.json'), `${JSON.stringify({ ...quality, session_id: sessionId,
    run_id: runId, coverage }, null, 2)}\n`);
  writeFileSync(path.join(outDir, 'conversation_list.md'), renderConversationTable(list));
  writeFileSync(path.join(outDir, 'corrections_before_after.md'),
    renderCorrectionsTable(corrections, { textOf: textOfId,
      clockOf: id => clockAt(recordedAt, rowFor.get(id)?.start_seconds ?? 0).clock }));
  return { run_id: runId, directory: outDir, list, corrections, manifest };
}

/**
 * What the project step had to work with, and what it actually used.
 *
 * Without this a reader sees the evidence rows and cannot tell whether they came
 * from a board's name or from the words "next week" -- which is the difference
 * between a candidate and noise.
 */
function clueTableFor(clues, searched) {
  const used = new Set(searched.map(clue => clue.term.toLowerCase()));
  return clues.map(clue => ({ term: clue.term, kind: clue.kind, term_kind: clue.term_kind,
    category: clue.category, origin: [...clue.origins].sort().join('+'),
    stoplisted: clue.stoplisted === true, searched: used.has(clue.term.toLowerCase()) }))
    .sort((a, b) => Number(b.searched) - Number(a.searched) || a.term.localeCompare(b.term));
}

/**
 * Every project this caller may open, opened once. The retriever reads that
 * project's whole generation to build its in-process search, so opening one per
 * conversation would read the same documents again for every conversation in the
 * recording. A binding that refuses is named and contributes nothing.
 */
export function openProjectRetrievers({ io, bindingsArea = BINDINGS_AREA }) {
  const opened = new Map(), refused = [];
  let codes = [];
  try {
    codes = readdirSync(io.path(bindingsArea, true), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && PROJECT_CODE.test(entry.name)).map(entry => entry.name).sort();
  } catch { return { opened, refused: [{ code: '*', code_reason: 'bindings_area_unavailable' }] }; }
  for (const code of codes) {
    const address = `${bindingsArea}/${code}/${BINDING_FILE}`;
    try {
      const bytes = io.read(address, 1024 * 1024);
      const binding = JSON.parse(bytes);
      const view = openGraphIndex({ io, bindingAddress: address, bindingSha256: `sha256:${hex(bytes)}`,
        request: { actor_ref: READER, project_ref: binding.project_ref, purpose: 'context_query' } });
      // No graph search: the lexical pass is in-process BM25 over the generation
      // this view already holds, so no database is opened and no question about an
      // unclassified recording reaches one.
      opened.set(code, createGraphIndexRetriever(view, { graphSearch: null }));
    } catch (error) { refused.push({ code, code_reason: error?.code ?? 'graph_index_unavailable' }); }
  }
  return { opened, refused };
}

// ------------------------------------------------------------------ reading
const runDirectories = (derivedRoot, sessionId) => {
  const where = path.join(derivedRoot, 'voice', sessionId);
  if (!existsSync(where) || !statSync(where).isDirectory()) return [];
  return readdirSync(where).filter(name => RUN_ID.test(name)).sort();
};

export function readRun({ derivedRoot, sessionId, runId = null }) {
  const runs = runDirectories(derivedRoot, sessionId);
  if (runs.length === 0) fail('voice_conversation_run_absent');
  const chosen = runId ?? runs.map(name => ({ name,
    generated_at: (() => { try { return JSON.parse(readFileSync(path.join(derivedRoot, 'voice', sessionId, name,
      'conversation_list.v0.json'), 'utf8')).generated_at ?? ''; } catch { return ''; } })() }))
    .sort((a, b) => b.generated_at.localeCompare(a.generated_at) || b.name.localeCompare(a.name))[0].name;
  const where = path.join(derivedRoot, 'voice', sessionId, chosen);
  const read = name => { try { return JSON.parse(readFileSync(path.join(where, name), 'utf8')); } catch { return null; } };
  return { run_id: chosen, directory: where, runs: runs.length, list: read('conversation_list.v0.json'),
    corrections: read('corrections.v0.json'), manifest: read('run_manifest.json') };
}

function renderRun(found) {
  const list = found.list, manifest = found.manifest;
  if (list === null) return `run ${found.run_id} · 대화 목록을 읽을 수 없습니다.`;
  const lines = [`${list.session_id} · run ${list.run_id} (${found.runs}개 중) · verified ${list.verified}`
    + ` · 구간 ${list.segments.length} · 생성 ${list.generated_at}`,
  `전사 ${list.transcript.run_id} ${list.transcript.kind} · 의미 run ${list.semantic_run.run_id}`
    + ` · 모델 ${list.model.alias} (${list.model.pin_kind})`];
  if (manifest !== null) {
    lines.push(`호출 ${manifest.calls.total}/${manifest.calls.budget} · 재시도 ${manifest.calls.retries}`
      + ` · 캐시 적중 ${manifest.calls.cache_hits} · ${Math.round(manifest.elapsed_ms / 1000)}초`
      + ` · 남은 일 ${manifest.remaining_work.length}건`);
  }
  for (const check of list.checks) lines.push(`  [${check.status}] ${check.check} — ${check.detail}`);
  for (const segment of list.segments) {
    lines.push(`\n[${segment.segment_id}] ${segment.clock.slice(11, 19)}–${segment.clock_end.slice(11, 19)}`
      + ` · 발화 ${segment.source_segment_ids.length}개 · ${segment.nature}`
      + `${segment.nature_unclear ? '(미정)' : ''} · ${segment.status}`,
    `  제목(파생) ${segment.title}`,
    `  설명(파생) ${segment.description}`,
    `  과제 ${segment.project_candidates.length === 0
      ? `미분류 — ${segment.unclassified_reason ?? '-'}`
      : segment.project_candidates.map(row => `${row.project_code}(${row.strength}`
        + `${row.strong_by ? `/${row.strong_by}` : ''}`
        + `${row.context_segment_ids?.length ? `, 이웃 ${row.context_segment_ids.join('·')}`
          : `, 근거 ${row.evidence_row_ids.length}행`})`).join(' · ')}`
      + `${(segment.other_project_mentions ?? []).length
        ? ` · 언급 ${segment.other_project_mentions.map(row => row.project_code).join(',')}` : ''}`,
    `  품질 marks ${segment.quality.marks.join(',') || '-'} · 교정 ${segment.quality.correction_state}`
      + ` · 판독불가 비율 ${segment.quality.unreadable_ratio}`);
    if ((segment.agenda_items ?? []).length > 0) {
      lines.push(`  안건 ${segment.agenda_items.map(item => `${item.label}`
        + `(${item.source_segment_ids[0]}–${item.source_segment_ids.at(-1)})`).join(' · ')}`);
    }
  }
  if (found.corrections !== null) {
    lines.push(`\n교정안 ${found.corrections.counts.proposed}건 · 폐기 ${found.corrections.counts.discarded}건`
      + ` · 재확인 필요 ${found.corrections.counts.needs_audio_recheck}건`
      + ` · 등록 용어를 고치려 한 제안 ${found.corrections.counts.known_term_overrides}건`);
  }
  return lines.join('\n');
}

// -------------------------------------------------------------------- main
export async function runVoiceConversationCli(argv, { chatFor, pinFor, now } = {}) {
  const command = argv[0];
  if (!VOICE_CONVERSATION_COMMANDS.includes(command)) fail('voice_conversation_command_unknown');
  const flags = options(argv.slice(1));
  const sessionId = String(flags.get('session') ?? '');
  if (!SESSION_ID.test(sessionId)) fail('voice_conversation_session_invalid');
  const toolsPath = String(flags.get('tools-config') ?? process.env.SOULFORGE_CONTEXT_TOOLS_CONFIG ?? '');
  if (!toolsPath) fail('voice_conversation_tools_config_required');
  const tools = readToolsConfig(readFileSync(toolsPath));
  if (!tools.derived_root) fail('voice_conversation_derived_root_required');

  if (command === 'show' || command === 'table') {
    const found = readRun({ derivedRoot: tools.derived_root, sessionId, runId: one(flags, 'run') });
    if (command === 'show') return { command, ...found, text: renderRun(found) };
    const file = flags.get('corrections') === true ? 'corrections_before_after.md' : 'conversation_list.md';
    return { command, run_id: found.run_id, directory: found.directory,
      text: readFileSync(path.join(found.directory, file), 'utf8') };
  }

  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  if (!tablePath) fail('voice_conversation_root_table_required');
  const expected = flags.get('root-table-sha256');
  const io = createAliasedStoreIo(readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : `sha256:${hex(readFileSync(tablePath))}` }));
  const configPath = String(flags.get('pipeline-config') ?? '');
  if (!configPath) fail('voice_conversation_pipeline_config_required');
  const configBytes = readFileSync(configPath);
  if (configBytes.length > MAX_CONFIG_BYTES) fail('voice_pipeline_config_too_large');
  const config = readPipelineConfig(configBytes);
  const { prompts, digests } = readPrompts(config.prompts_dir);
  const answer = await runConversationList({ io, tools, config, prompts, promptDigests: digests,
    configSha256: hex(configBytes), sessionId,
    ...(chatFor ? { chatFor } : {}), ...(pinFor ? { pinFor } : {}), ...(now ? { now } : {}) });
  return { command, run_id: answer.run_id, directory: answer.directory,
    verified: answer.list.verified, segments: answer.list.segments.length,
    calls: answer.manifest.calls, remaining_work: answer.manifest.remaining_work,
    text: renderRun({ run_id: answer.run_id, runs: 1, list: answer.list, corrections: answer.corrections,
      manifest: answer.manifest }) };
}

async function main() {
  const argv = process.argv.slice(2);
  const result = await runVoiceConversationCli(argv);
  const { text, ...body } = result;
  process.stdout.write(argv.includes('--json') ? `${JSON.stringify(body)}\n` : `${text}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[voice-conversation-list] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  });
}
