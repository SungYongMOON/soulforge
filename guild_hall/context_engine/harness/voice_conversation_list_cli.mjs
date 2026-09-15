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
  ConversationListError, NATURES, RUN_MANIFEST_SCHEMA, applyCorrections, attachUncovered, batchSegments,
  boundaryWindows, cacheKeyFor, checkBoundaryProposal, checkCandidates, checkCorrection, checkNature,
  classifyClues, clockAt, finalChecks, mergeDrafts, mergeNatureWindows, partialWindows, qaBoundarySuspects,
  qualityReport, readPipelineConfig, renderConversationTable, renderCorrectionsTable, rulesCoverage,
  runIdFor, searchableClues, segmentsNeedingRejudgement, stitchBoundaries, wholeMilliseconds,
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
      description: { type: 'string' }, key_terms: array({ type: 'string' }), unclear: { type: 'boolean' } } }) } };
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

  // --------------------------------------------------------------- step 2
  const unitText = unit => unit.source_segment_ids.map(textOfId).join(' ');
  const windows = boundaryWindows(units, { maxUnits: limits.boundary_units,
    maxCharacters: limits.boundary_characters, overlap: limits.boundary_overlap_units, textOf: unitText });
  const windowResults = [];
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
    const answer = await ask({ step: 'boundary', system: prompts.boundary, user, schema: BOUNDARY_ANSWER });
    const checked = answer.status === 'ok'
      ? checkBoundaryProposal(answer.value, { windowSegmentIds: window.segment_ids })
      : { ok: false, code: answer.status === 'budget_exhausted' ? 'llm_budget_exhausted' : 'boundary_llm_failed' };
    if (checked.ok) {
      windowResults.push({ window_index: window.index, segments: answer.value.segments });
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
  for (const suspect of [...suspects].sort((a, b) => b.index - a.index)) {
    const before = drafts[suspect.index], after = drafts[suspect.index + 1];
    if (before === undefined || after === undefined) continue;
    drafts = drafts.map((draft, index) => index === suspect.index ? { ...draft, qa_boundary: 'suspect' } : draft);
    if (rechecks >= limits.qa_rechecks) { note('boundary_recheck', `pair_${suspect.index}`, 'qa_recheck_budget'); stillSuspect += 1; continue; }
    const tail = before.source_segment_ids.slice(-12).map(id => `${id}: ${textOfId(id)}`).join('\n');
    const head = after.source_segment_ids.slice(0, 12).map(id => `${id}: ${textOfId(id)}`).join('\n');
    const user = `앞 구간 끝 (발화 ${before.source_segment_ids.at(-1)}까지)\n${trim(tail, UNIT_TEXT_CHARACTERS)}\n\n`
      + `뒤 구간 처음 (발화 ${after.source_segment_ids[0]}부터, 간격 ${suspect.gap_seconds}초)\n`
      + `${trim(head, UNIT_TEXT_CHARACTERS)}`;
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
  const askNature = async (batch) => {
    const body = batch.map(entry => `[${entry.segment_id}] 발화 ${entry.ids[0]}–${entry.ids.at(-1)}`
      + ` · 화행 ${entry.acts.join(',') || '-'} · 품질 ${entry.marks.join(',') || '-'}\n${entry.text}`).join('\n\n');
    const answer = await ask({ step: 'nature', system: prompts.nature,
      user: `구간 ${batch.length}개\n\n${body}`, schema: NATURE_ANSWER });
    if (answer.status !== 'ok') return null;
    return new Map((answer.value.segments ?? []).map(row => [String(row.segment_id), row]));
  };
  const entryFor = (segment, ids) => ({ segment_id: segment.segment_id, ids,
    acts: [...new Set(ids.map(id => unitFor.get(id)).filter(Boolean).flatMap(unit => unit.speech_acts ?? []))],
    marks: [...new Set(ids.flatMap(id => marksFor.get(id) ?? []))],
    text: ids.map(textOfId).join(' ') });
  const unreadableRatioOf = ids => ids.length === 0 ? 0
    : ids.filter(id => (marksFor.get(id) ?? []).some(mark => UNREADABLE_MARKS.includes(mark))).length / ids.length;

  for (const segment of segments.filter(long)) {
    const windowsOf = partialWindows(segment.source_segment_ids, { textOf: textOfId, rowFor: id => rowFor.get(id),
      maxCharacters: limits.nature_characters, maxSeconds: limits.window_seconds });
    const answers = [];
    for (const ids of windowsOf) {
      const entry = entryFor(segment, ids);
      const found = await askNature([entry]);
      const row = found?.get(segment.segment_id) ?? null;
      const checked = row === null ? { ok: false } : checkNature(row, { text: entry.text,
        unreadableRatio: unreadableRatioOf(ids), speechActs: entry.acts });
      if (checked.ok) answers.push(checked);
      else note('nature', segment.segment_id, checked.code ?? 'nature_llm_failed');
    }
    natureOf.set(segment.segment_id, answers.length === 0
      ? { nature: 'mixed', title: `구간 ${segment.segment_id} (미정)`, description: '', key_terms: [],
        unclear: true, marks: ['nature_llm_failed'], processed_in_windows: windowsOf.length }
      : mergeNatureWindows(answers));
  }
  const short = segments.filter(segment => !long(segment));
  for (const batch of batchSegments(short, { charactersOf: segment => glyphs(textOfSegment(segment)).length,
    maxCharacters: limits.nature_characters, maxSegments: limits.nature_segments_per_call })) {
    const entries = batch.map(segment => entryFor(segment, segment.source_segment_ids));
    const found = await askNature(entries);
    for (const entry of entries) {
      const row = found?.get(entry.segment_id) ?? null;
      const checked = row === null ? { ok: false } : checkNature(row, { text: entry.text,
        unreadableRatio: unreadableRatioOf(entry.ids), speechActs: entry.acts });
      if (checked.ok) natureOf.set(entry.segment_id, { ...checked, processed_in_windows: 1 });
      else {
        note('nature', entry.segment_id, checked.code ?? 'nature_llm_failed');
        natureOf.set(entry.segment_id, { nature: 'mixed', title: `구간 ${entry.segment_id} (미정)`,
          description: '', key_terms: [], unclear: true, marks: ['nature_llm_failed'], processed_in_windows: 1 });
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
    const entities = [...new Set(ids.map(id => unitFor.get(id)).filter(Boolean)
      .flatMap(unit => (unit.entities ?? []).map(entity => entity?.value).filter(Boolean)))];
    const clues = classifyClues(text, registry, { keyTerms: natureOf.get(segment.segment_id)?.key_terms ?? [], entities });
    const searchable = searchableClues(clues, { limit: limits.project_clues });
    if (searchable.length === 0) {
      return { candidates: [], unclassified_reason: 'no_distinctive_clue', clues, rows: [], revised };
    }
    const query = searchable.map(clue => clue.term).join(' ');
    const rows = [];
    for (const [code, retriever] of retrievers.opened) {
      const answered = retriever.lexical(query);
      if (answered.status !== 'ok') continue;
      for (const hit of answered.hits.slice(0, 3)) {
        const quote = String(hit.text ?? '').split('\n').map(line => line.trim()).find(Boolean) ?? '';
        const matched = searchable.filter(clue => `${hit.title ?? ''} ${hit.text ?? ''}`.toLowerCase()
          .includes(clue.term.toLowerCase())).map(clue => clue.term);
        if (matched.length === 0) continue;
        rows.push({ row_id: evidenceRows.length + rows.length + 1, project_code: code, item_id: String(hit.item_id ?? ''),
          unit_id: String(hit.unit_id ?? ''), source_kind: String(hit.source_kind ?? ''),
          quote: glyphs(quote).slice(0, limits.evidence_quote_characters).join(''),
          score: Number.isFinite(hit.score) ? hit.score : null, rank: hit.rank, matched_terms: matched });
      }
    }
    const kept = rows.sort((a, b) => b.matched_terms.length - a.matched_terms.length || a.rank - b.rank)
      .slice(0, limits.project_evidence_rows);
    if (kept.length === 0) return { candidates: [], unclassified_reason: 'no_evidence', clues, rows: [], revised };
    const table = clues.map(clue => `${clue.term} · ${clue.kind}${clue.category === 'workflow' ? ' · workflow' : ''}`).join('\n');
    const body = kept.map(row => `row ${row.row_id} · 과제 ${row.project_code} · 항목 ${row.item_id}`
      + ` · 단위 ${row.unit_id} · ${row.source_kind}\n  ${row.quote}`).join('\n');
    const user = `구간 본문\n${headTail(text, limits.project_characters)}\n\n단서 분류표\n${table}\n\n근거 행\n${body}`;
    const answer = await ask({ step: 'project', system: prompts.project, user, schema: PROJECT_ANSWER });
    if (answer.status !== 'ok') {
      note('project', segment.segment_id, answer.status === 'budget_exhausted' ? 'llm_budget_exhausted' : 'project_llm_failed');
      return { candidates: [], unclassified_reason: 'project_llm_failed', clues, rows: kept, revised };
    }
    const checked = checkCandidates(answer.value, { evidenceRows: kept, clues, limit: limits.project_candidates });
    return { candidates: checked.candidates, unclassified_reason: checked.unclassified_reason,
      downgraded: checked.downgraded, clues, rows: kept, revised };
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
      const body = ids.map(id => `${id}: ${textOfId(id)}`).join('\n');
      const user = `용어표\n${terms.join(' · ') || '(없음)'}\n\n발화\n${body}`;
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
          keyTerms: natureOf.get(segment.segment_id)?.key_terms ?? [] });
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
  const recordedAt = input.manifest.recorded_at_local;
  const rows = segments.map(segment => {
    const ids = segment.source_segment_ids;
    const start = Math.min(...ids.map(id => rowFor.get(id)?.start_seconds ?? 0));
    const end = Math.max(...ids.map(id => rowFor.get(id)?.end_seconds ?? 0));
    const nature = natureOf.get(segment.segment_id) ?? { nature: 'mixed', title: '', description: '', key_terms: [], unclear: true, marks: [], processed_in_windows: 1 };
    const judged = judgements.get(segment.segment_id) ?? { candidates: [], unclassified_reason: 'no_evidence', clues: [] };
    const marks = [...new Set(ids.flatMap(id => marksFor.get(id) ?? []))].sort();
    const probabilities = ids.map(id => rowFor.get(id)?.asr_confidence?.mean_token_probability).filter(Number.isFinite);
    const mine = proposals.filter(row => row.segment_id === segment.segment_id);
    return { segment_id: segment.segment_id, source_segment_ids: [...ids],
      start_seconds: start, end_seconds: end, start_ms: wholeMilliseconds(start), end_ms: wholeMilliseconds(end),
      clock: clockAt(recordedAt, start).stamp, clock_end: clockAt(recordedAt, end).stamp,
      title: nature.title, description: nature.description, derived_summary: true,
      nature: nature.nature, nature_unclear: nature.unclear === true,
      key_terms: [...nature.key_terms],
      // The registry's verdict on the words actually in this conversation. Clues
      // include what the labelling run saw and what step 3 picked out; these are
      // only the ones the registry can speak for.
      term_marks: classifyTerms(textOfSegment(segment), registry)
        .filter(mark => mark.kind !== 'unregistered')
        .map(mark => ({ term: mark.term, kind: mark.kind, category: mark.category,
          declared_shared: mark.declared_shared, observed_project_count: mark.observed_project_count })),
      project_candidates: judged.candidates.map(row => ({ project_code: row.project_code, strength: row.strength,
        basis: [...row.basis], evidence_row_ids: [...row.evidence_row_ids] })),
      unclassified_reason: judged.candidates.length === 0 ? judged.unclassified_reason : null,
      status: judged.candidates.length === 0 ? 'unclassified' : 'candidate',
      quality: { transcript_kind: quality.transcript_kind, marks,
        correction_state: mine.length === 0 ? 'none' : 'machine_proposed',
        unreadable_ratio: Number(unreadableRatioOf(ids).toFixed(4)),
        mean_token_probability: probabilities.length === 0 ? null
          : Number((probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length).toFixed(4)) },
      refs: { session_id: sessionId, transcript_run_id: input.transcript.run_id,
        semantic_run_id: input.semantic.run_id, source_segment_ids: [...ids], audio_ref: 'audio/source.mp3' },
      related_segment_ids: [...new Set((segment.related_draft_keys ?? []).map(key => keyToId.get(key))
        .filter(id => id !== undefined && id !== segment.segment_id))],
      boundary: { reasons: [...segment.boundary_reasons], qa_boundary: segment.qa_boundary,
        processed_in_windows: nature.processed_in_windows ?? 1 },
      revised_after_correction: judged.revised === true };
  });
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
      item_id: row.item_id, unit_id: row.unit_id, source_kind: row.source_kind, quote: row.quote,
      score: row.score, matched_terms: [...row.matched_terms] })) };
  const corrections = { schema: CORRECTIONS_SCHEMA, session_id: sessionId, run_id: runId, generated_at: generatedAt,
    proposals, discarded,
    counts: { proposed: proposals.length, discarded: discarded.length,
      needs_audio_recheck: proposals.filter(row => row.needs_audio_recheck).length,
      known_term_overrides: proposals.filter(row => row.original_is_known_term).length,
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
      qa_suspects: suspects.length, qa_rechecks: rechecks, qa_merged: merged, qa_still_suspect: stillSuspect,
      uncovered_attached: attached.attached, uncovered_segment: attached.uncovered_draft !== null },
    projects: { opened: [...retrievers.opened.keys()], refused: retrievers.refused,
      evidence_rows: evidenceRows.length, rejudged },
    counts: { segments: rows.length,
      nature: Object.fromEntries(NATURES.map(nature => [nature, rows.filter(row => row.nature === nature).length])),
      candidate: rows.filter(row => row.status === 'candidate').length,
      unclassified: rows.filter(row => row.status === 'unclassified').length,
      unclassified_reasons: rows.filter(row => row.status === 'unclassified')
        .reduce((held, row) => ({ ...held, [row.unclassified_reason ?? 'unknown']: (held[row.unclassified_reason ?? 'unknown'] ?? 0) + 1 }), {}),
      project_mixed: rows.filter(row => row.project_candidates.length >= 2).length,
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
      : segment.project_candidates.map(row => `${row.project_code}(${row.strength}, 근거 ${row.evidence_row_ids.length}행)`).join(' · ')}`,
    `  품질 marks ${segment.quality.marks.join(',') || '-'} · 교정 ${segment.quality.correction_state}`
      + ` · 판독불가 비율 ${segment.quality.unreadable_ratio}`);
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
