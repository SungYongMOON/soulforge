// What a recording's conversation list is made of, and every rule that decides
// whether one is admissible. No file is opened here and no model is called: a
// caller hands in the transcript rows, the semantic units and whatever a model
// answered, and gets back either a checked result or the code that refused it.
//
// The pipeline this serves is deliberately staged. "Read the recording and work
// out where the conversations are, what they are about, which project they
// belong to and which words were misheard" is one prompt, and a model asked it
// answers invisibly and differently every time. Split into steps with a check
// between each, every claim has a place it can be refused: a boundary proposal
// that loses an utterance is rejected before it becomes a conversation, a project
// candidate whose only evidence is a word four projects share is downgraded
// before it becomes an attribution, and a correction whose text is not where the
// model said it was is discarded before it becomes a reading of the transcript.
//
// Three things this module will not do, because each of them is a way of quietly
// inventing evidence:
//   - it never derives an utterance id from an interval. The transcript's ids are
//     the only thing that says which words a conversation holds;
//   - it never rewrites a sentence. A correction is one word at one position, and
//     a proposal that would restring the sentence is refused by length;
//   - it never lets a term several projects use decide which project a
//     conversation belongs to, and it never reads a word the registry has not
//     seen as though it were a word only one project uses.
import { createHash } from 'node:crypto';
import { classifyTerms, normaliseTerm } from './shared_terms.mjs';

export const CONVERSATION_LIST_SCHEMA = 'soulforge.voice_conversation_list.v0';
export const CORRECTIONS_SCHEMA = 'soulforge.voice_corrections.v0';
export const PIPELINE_CONFIG_SCHEMA = 'soulforge.voice_conversation_pipeline.v0';
export const RUN_MANIFEST_SCHEMA = 'soulforge.voice_conversation_run.v0';
export const QUALITY_SCHEMA = 'soulforge.voice_conversation_quality.v0';
/**
 * Which transcript a run reads as its primary input. `whisper` is the local
 * ASR transcript (`analysis/local_asr/<run>/transcript.jsonl`) and is what a
 * config that says nothing means; `plaud` is the provider transcript at the
 * session root (`transcript.jsonl`, speaker- and time-segmented), with the
 * local transcript kept as the secondary/fallback (Owner decision 2026-09-26).
 */
export const VOICE_TRANSCRIPT_SOURCES = Object.freeze(['whisper', 'plaud']);

/** What kind of conversation it is. Not how well it was heard, and not who it is for. */
export const NATURES = Object.freeze(['project_work', 'team_operations', 'idea', 'personal', 'unreadable', 'mixed']);
/** The speech acts that make a stretch material enough that `personal` is the wrong word for it. */
export const MATERIAL_ACTS = Object.freeze(['cancellation', 'assignment', 'request', 'commitment', 'decision',
  'risk_or_issue', 'deadline_mention']);
/** A question or a request at the end of one conversation ... */
export const QUESTION_ACTS = Object.freeze(['open_question', 'request']);
/** ... and its answer at the start of the next one. Together: a boundary to look at again. */
export const ANSWER_ACTS = Object.freeze(['acknowledgement', 'decision', 'result_report', 'commitment']);
export const BOUNDARY_REASONS = Object.freeze(['topic_shift', 'speaker_turn_cluster', 'qa_closure',
  'return_to_topic', 'unreadable_block', 'rules_uncovered']);
/** Reasons a code, rather than the model, put on a boundary. */
export const CODE_BOUNDARY_REASONS = Object.freeze(['overlap_conflict', 'attached_by_code',
  'single_segment_window', 'related_by_key_terms']);
export const BASIS_KINDS = Object.freeze(['equipment', 'board', 'purpose', 'test_condition', 'deliverable',
  'follow_up_record']);
/**
 * A basis only a code can state, and the model's schema does not carry.
 *
 * `context_continuity` says: nothing in this conversation names a project, and
 * the conversations either side of it -- close in time, both project work, both
 * placed on the same project with strong evidence -- do. That is a fact about
 * where the conversation sits, not about what was said in it, so a model asked
 * "which project is this about" could only answer it by guessing.
 */
export const CODE_BASIS_KINDS = Object.freeze(['context_continuity']);
/** How far away a neighbour may be and still be the same stretch of work. */
export const CONTINUITY_GAP_SECONDS = 60;
export const CORRECTION_REASONS = Object.freeze(['term_glossary', 'person_name', 'number_unit', 'date_deadline',
  'part_number', 'negation', 'completion_state', 'cancellation', 'homophone', 'other']);
// A wrong name, number, date, part number, negation or completion state changes
// what the record says happened, and no amount of context tells you which of two
// similar-sounding readings was spoken. Those always go back to the audio, and
// the flag is set by the reason rather than by the model's own opinion of itself.
export const AUDIO_RECHECK_REASONS = Object.freeze(['person_name', 'number_unit', 'date_deadline', 'part_number',
  'negation', 'completion_state', 'cancellation']);
// This pipeline does not listen to anything. `audio_verified` exists so that a
// step which does listen has a value to write, and nothing here ever writes it.
export const CORRECTION_EVIDENCE = Object.freeze(['context_inference', 'audio_verified']);
export const CORRECTION_DISCARD_CODES = Object.freeze(['position_ambiguous', 'position_mismatch', 'no_change',
  'rewrite_refused', 'reason_unknown', 'too_many_for_utterance', 'too_many_for_segment', 'utterance_not_in_segment']);
export const QUALITY_MARKS = Object.freeze(['hallucination_loop', 'low_confidence', 'low_density', 'suppressed',
  'provider_divergent']);
/**
 * What a key term names. The kind is what makes a clue worth searching with: a
 * device, a board, a named test, a document, a place or an organisation narrows
 * a record set; a person's name and an unclassified word rarely do, and are
 * searched last rather than first.
 */
export const KEY_TERM_KINDS = Object.freeze(['equipment', 'board', 'test', 'document', 'place', 'organization',
  'person', 'other']);
const NARROWING_KINDS = Object.freeze(['equipment', 'board', 'test', 'document', 'place', 'organization']);
/**
 * Entity kinds a labelling run may contribute as clues: the ones that name a
 * thing. A date, a measured value and a person's mention are the three this
 * estate's rule labeller actually emits, and none of them says which project a
 * conversation belongs to -- searching with "next week" returns every project
 * that ever wrote the words. An entity with no kind is not shown to name a
 * thing, so it does not become a clue either.
 */
export const CLUE_ENTITY_KINDS = Object.freeze(['equipment', 'board', 'component', 'part', 'device', 'system',
  'document', 'deliverable', 'place', 'site', 'organization', 'domain_term']);
/**
 * Words that are never searched with, whatever else is true of them.
 *
 * Two groups, and both are about a word that cannot narrow anything: relative
 * time, which is said in every conversation and written in every record, and the
 * generic nouns of doing work. They are not wrong, they are not misheard, and a
 * search that uses them returns whichever project wrote most. Nothing in this
 * list is particular to any recording or project -- it is the vocabulary of
 * having a job.
 */
export const CLUE_STOPLIST = Object.freeze([
  '오늘', '어제', '내일', '모레', '이번', '지난', '다음', '이번 주', '다음 주', '지난주', '이번주', '다음주',
  '주말', '평일', '오전', '오후', '아침', '점심', '저녁', '내주', '금주', '당일', '시간', '요일',
  '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
  '테스트', '시험', '일정', '회의', '자료', '문서', '프로그램', '품질', '형상', '배치', '작동', '모듈',
  '확인', '내용', '부분', '상황', '문제', '이야기', '얘기', '생각', '정리', '진행', '작업', '업무',
  '사람', '경우', '정도', '관련', '필요', '가능', '사용', '설명', '요청', '답변', '질문', '방식',
  '준비', '결과', '상태', '기준', '계획', '방법', '조건', '수정', '추가', '변경', '완료', '시작',
  // Bare only. A count of something is a property of every device that has any;
  // `32채널 모듈` is a different word and is not on this list.
  '채널',
]);
const STOPLIST = new Set(CLUE_STOPLIST.map(term => term.replace(/\s+/gu, ' ').trim().toLowerCase()));
/** Whether a word is one a search may not use. */
export const isStoplisted = term => STOPLIST.has(String(term ?? '').replace(/\s+/gu, ' ').trim().toLowerCase());
/**
 * A stoplisted word may still be searched with when the nature step says it names
 * a thing. The list is about generic nouns used generically; a model that looked
 * at the sentence and called the word a board or a device has said something the
 * list cannot know, and refusing it would throw that away.
 */
const TYPED_PAST_STOPLIST = Object.freeze(['board', 'equipment', 'test']);
export const searchableDespiteStoplist = clue => TYPED_PAST_STOPLIST.includes(clue?.term_kind);
/** How long the clue query handed to a search may be. */
export const MAX_CLUE_QUERY_CHARACTERS = 200;

export const DEFAULT_LIMITS = Object.freeze({
  boundary_units: 8, boundary_characters: 6000, boundary_overlap_units: 1,
  qa_gap_seconds: 30, qa_rechecks: 8,
  nature_characters: 2000, nature_segments_per_call: 4,
  project_characters: 2000, project_evidence_rows: 12, project_clues: 8, project_candidates: 3,
  correction_characters: 1500, correction_per_utterance: 5, correction_per_segment: 20,
  window_seconds: 600, evidence_quote_characters: 160, evidence_title_characters: 120,
  llm_calls: 60, retries: 2,
  single_segment_reasks: 3,
});

/**
 * When one segment for a whole window is worth asking about again.
 *
 * A window that really does hold one subject exists, so this is a question and
 * not a refusal. But eight units and a hundred utterances answered as a single
 * conversation is a model declining to read rather than a recording with one
 * agenda item, and the cost of asking once more is one call.
 */
export const SINGLE_SEGMENT_UNITS = 4;
export const SINGLE_SEGMENT_UTTERANCES = 40;
export const singleSegmentSuspect = (window, segments) => segments.length === 1
  && window.units.length >= SINGLE_SEGMENT_UNITS && window.segment_ids.length >= SINGLE_SEGMENT_UTTERANCES;

const PROJECT_CODE_ANYWHERE = /\b[A-Z][0-9A-Z]*-[0-9A-Z]+\b/u;
const TITLE_CHARACTERS = 40, DESCRIPTION_CHARACTERS = 200;
/** How many agenda items one conversation may be said to hold, and how long a label may be. */
export const AGENDA_ITEMS = 6, AGENDA_LABEL_CHARACTERS = 40;
/** A conversation long enough that one title cannot say what it was about. */
export const AGENDA_UTTERANCES = 40;
/** How much of a conversation one agenda item may cover before it is just the title. */
export const AGENDA_WHOLE_SEGMENT = 0.8;
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? Buffer.from(value, 'utf8') : value).digest('hex');

export class ConversationListError extends Error {
  constructor(code) { super(code); this.name = 'ConversationListError'; this.code = code; }
}
const fail = code => { throw new ConversationListError(code); };
const codePoints = value => [...String(value ?? '')];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// ----------------------------------------------------------------- time
// An utterance's own offsets are what the ASR wrote: fractional, and never
// rounded here. Milliseconds ride alongside for anything that needs an integer
// (a table, a comparison, a serialisation that holds only safe integers), and
// they are a second representation of the same number rather than a replacement
// for it -- which is why the conversion back has to be exact.
export const wholeMilliseconds = seconds => {
  if (!Number.isFinite(seconds) || seconds < 0) fail('voice_conversation_time_invalid');
  return Math.round(seconds * 1000);
};
export const secondsFromMilliseconds = milliseconds => {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) fail('voice_conversation_time_invalid');
  return milliseconds / 1000;
};

/** The wall clock of an offset into a recording that declared its own UTC offset. */
export function clockAt(recordedAtLocal, offsetSeconds) {
  const match = /([+-])(\d{2}):(\d{2})$/u.exec(String(recordedAtLocal ?? ''));
  const base = Date.parse(recordedAtLocal);
  if (!Number.isFinite(base)) fail('voice_conversation_recorded_at_invalid');
  const minutes = match === null ? 0
    : (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
  const shifted = new Date(base + Math.round(offsetSeconds * 1000) + minutes * 60000);
  const iso = shifted.toISOString();
  return { clock: iso.slice(11, 19), date: iso.slice(0, 10), offset_minutes: minutes,
    stamp: `${iso.slice(0, 19)}${match === null ? 'Z' : `${match[1]}${match[2]}:${match[3]}`}` };
}

// ------------------------------------------------------------ configuration
/**
 * The host facts this pipeline runs against: which model, how many calls, how
 * big an input may be, where the prompts are. It lives outside the repository
 * because every value in it is about this machine, and it is validated here
 * because a pipeline that silently takes a default for a bound is a pipeline
 * whose receipts do not say what it actually did.
 */
export function readPipelineConfig(bytes) {
  let value;
  try { value = JSON.parse(bytes); } catch { fail('voice_pipeline_config_unreadable'); }
  if (value?.schema !== PIPELINE_CONFIG_SCHEMA) fail('voice_pipeline_config_schema_unknown');
  const model = value.model;
  if (!plain(model) || typeof model.host !== 'string' || !model.host
    || typeof model.model !== 'string' || !model.model) fail('voice_pipeline_config_invalid');
  if (typeof value.prompts_dir !== 'string' || !value.prompts_dir) fail('voice_pipeline_config_invalid');
  const limits = { ...DEFAULT_LIMITS };
  for (const [key, given] of Object.entries(value.limits ?? {})) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) fail('voice_pipeline_config_limit_unknown');
    if (!Number.isSafeInteger(given) || given < 1) fail('voice_pipeline_config_invalid');
    limits[key] = given;
  }
  if (limits.llm_calls > 100) fail('voice_pipeline_config_budget_too_large');
  // Absent stays `null` (read as `whisper`), so a config that never named a
  // source keeps producing exactly what it produced before -- its bytes, and so
  // every run id derived from them, are untouched.
  const transcriptSource = value.transcript_source ?? null;
  if (transcriptSource !== null && !VOICE_TRANSCRIPT_SOURCES.includes(transcriptSource)) {
    fail('voice_pipeline_config_transcript_source_unknown');
  }
  return Object.freeze({ schema: value.schema, model: Object.freeze({ ...model }), prompts_dir: value.prompts_dir,
    limits: Object.freeze(limits), note: typeof value.note === 'string' ? value.note : null,
    transcript_source: transcriptSource });
}

// ------------------------------------------------------------------ step 1
const words = text => String(text ?? '').split(/\s+/u).filter(Boolean);
const ngrams = (list, size) => list.length < size ? []
  : list.slice(0, list.length - size + 1).map((_, index) => list.slice(index, index + size).join(' '));

/** How much of an utterance is the same few words said over again. */
export function repetitionRatio(text, { size = 3 } = {}) {
  const tokens = words(text);
  const grams = ngrams(tokens, size);
  if (grams.length === 0) return 0;
  return 1 - (new Set(grams).size / grams.length);
}

/** How long an utterance may be before a repeating character unit means anything. */
export const LOOP_MINIMUM_CHARACTERS = 24;
/** The longest repeating unit this looks for. Beyond a few characters it is a phrase, not a stutter. */
export const LOOP_MAXIMUM_UNIT = 6;
export const LOOP_COVERAGE = 0.6;
/** How alike consecutive utterances have to be before the run of them is a loop. */
export const REPEAT_RUN_SIMILARITY = 0.8;
export const REPEAT_RUN_LENGTH = 3;
export const REPEAT_RUN_WORDS = 12;

/**
 * How much of an utterance is one short unit repeated.
 *
 * The word-level measure cannot see a decoder that got stuck on a token with no
 * space after it: two hundred characters of the same two characters joined by
 * commas is one "word", and its 3-gram repetition is zero. This looks at the
 * characters instead, spaces removed, for the shortest unit up to six characters
 * that covers most of what was said. Every phase of every size is tried, because
 * a loop that starts mid-unit is the same loop.
 */
export function loopUnitRatio(text) {
  const raw = codePoints(text);
  if (raw.length < LOOP_MINIMUM_CHARACTERS) return 0;
  const glyphs = raw.filter(glyph => !/\s/u.test(glyph));
  if (glyphs.length === 0) return 0;
  let best = 0;
  for (let size = 1; size <= LOOP_MAXIMUM_UNIT; size++) {
    for (let phase = 0; phase < size; phase++) {
      const counts = new Map();
      for (let at = phase; at + size <= glyphs.length; at += size) {
        const unit = glyphs.slice(at, at + size).join('');
        counts.set(unit, (counts.get(unit) ?? 0) + 1);
      }
      for (const count of counts.values()) best = Math.max(best, (count * size) / glyphs.length);
    }
    // The shortest unit that reaches the bound is the answer; a longer one that
    // also reaches it is the same loop counted in bigger pieces.
    if (best >= LOOP_COVERAGE) break;
  }
  return Number(best.toFixed(4));
}

/**
 * Runs of short utterances that all say the same thing.
 *
 * A decoder looping across utterance boundaries produces several rows in a row
 * that no single row's repetition measure can catch -- each one on its own is a
 * plausible short sentence. Three or more consecutive short rows whose word sets
 * all but coincide are that, and marking only one of them would leave a reader
 * quoting the others.
 */
export function repeatRuns(rows, { similarity = REPEAT_RUN_SIMILARITY, length = REPEAT_RUN_LENGTH,
  maxWords = REPEAT_RUN_WORDS } = {}) {
  const runs = [];
  let held = [];
  const alike = (row, others) => others.every(other => jaccard(words(other.content), words(row.content)) >= similarity);
  for (const row of rows) {
    const short = words(row.content).length > 0 && words(row.content).length <= maxWords;
    if (short && (held.length === 0 || alike(row, held))) { held.push(row); continue; }
    if (held.length >= length) runs.push(held.map(item => item.segment_id));
    held = short ? [row] : [];
  }
  if (held.length >= length) runs.push(held.map(item => item.segment_id));
  return runs;
}

const jaccard = (left, right) => {
  const a = new Set(left), b = new Set(right);
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/**
 * What the transcript itself says about how well it heard, per utterance and for
 * the recording. No model is asked: every mark is a number the ASR lane already
 * wrote, or a comparison between the two transcripts of the same minute.
 *
 * `provider_divergent` is the one mark that is about disagreement rather than
 * confidence. Two machine transcripts of the same audio that share almost no
 * words in the same window are not both right, and a reader who quotes either of
 * them without knowing that is quoting a guess.
 */
export function qualityReport({ rows, suppressed = [], providerRows = [], alignmentSeconds = 2 } = {}) {
  if (!Array.isArray(rows)) fail('voice_conversation_rows_invalid');
  const inRun = new Map();
  for (const run of repeatRuns(rows)) for (const id of run) inRun.set(id, run.length);
  const marksFor = row => {
    const marks = [], reasons = [];
    const mark = (name, reason, value) => { if (!marks.includes(name)) marks.push(name); reasons.push({ mark: name, reason, value }); };
    const characters = codePoints(row.content).length;
    const seconds = Math.max(0, Number(row.end_seconds) - Number(row.start_seconds));
    const probability = row.asr_confidence?.mean_token_probability;
    const ngramRatio = repetitionRatio(row.content);
    if (words(row.content).length >= 8 && ngramRatio >= 0.6) mark('hallucination_loop', 'ngram_repeat', ngramRatio);
    const unitRatio = loopUnitRatio(row.content);
    if (unitRatio >= LOOP_COVERAGE) mark('hallucination_loop', 'char_unit_repeat', unitRatio);
    if (inRun.has(row.segment_id)) mark('hallucination_loop', 'repeat_run', inRun.get(row.segment_id));
    if (Number.isFinite(probability) && probability < 0.5) mark('low_confidence', 'mean_token_probability', probability);
    const density = seconds > 0 ? Number((characters / seconds).toFixed(3)) : null;
    if (density !== null && density < 1.5) mark('low_density', 'characters_per_second', density);
    const near = providerRows.filter(other => other.end_seconds > row.start_seconds - alignmentSeconds
      && other.start_seconds < row.end_seconds + alignmentSeconds);
    const overlap = providerRows.length === 0 ? null
      : Number(jaccard(words(row.content), near.flatMap(other => words(other.content))).toFixed(4));
    if (overlap !== null && overlap < 0.2) mark('provider_divergent', 'window_jaccard', overlap);
    return { segment_id: row.segment_id, mean_token_probability: Number.isFinite(probability) ? probability : null,
      characters, marks, mark_reasons: reasons };
  };
  const segments = rows.map(marksFor);
  const suppressedRows = suppressed.map(row => ({ segment_id: row.segment_id,
    mean_token_probability: row.asr_confidence?.mean_token_probability ?? null,
    characters: codePoints(row.content).length, marks: ['suppressed'],
    mark_reasons: [{ mark: 'suppressed', reason: String(row.suppression_reason ?? 'suppressed_by_asr_lane'), value: null }],
    suppression_reason: row.suppression_reason ?? null }));
  const counts = Object.fromEntries(QUALITY_MARKS.map(mark =>
    [mark, [...segments, ...suppressedRows].filter(row => row.marks.includes(mark)).length]));
  const probabilities = segments.map(row => row.mean_token_probability).filter(Number.isFinite);
  return Object.freeze({ schema: QUALITY_SCHEMA,
    transcript_kind: providerRows.length > 0 ? 'independent_fast' : 'provider_only',
    provider_local_token_overlap: providerRows.length === 0 ? null
      : Number(jaccard(rows.flatMap(row => words(row.content)),
        providerRows.flatMap(row => words(row.content))).toFixed(4)),
    mean_token_probability: probabilities.length === 0 ? null
      : Number((probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length).toFixed(4)),
    counts, segments: Object.freeze(segments), suppressed: Object.freeze(suppressedRows) });
}

/**
 * The rule-based draft against the transcript it was drawn from, counted rather
 * than assumed. A semantic run says it accounted for every utterance; this is the
 * check that says so independently, and it is what turns "the boundaries came
 * from the labels" into a claim with a number behind it.
 */
export function rulesCoverage({ rows, suppressed = [], units } = {}) {
  if (!Array.isArray(rows) || !Array.isArray(units)) fail('voice_conversation_rows_invalid');
  const present = rows.map(row => row.segment_id);
  const seen = new Map();
  for (const unit of units) for (const id of unit.source_segment_ids ?? []) seen.set(id, (seen.get(id) ?? 0) + 1);
  const covered = present.filter(id => seen.has(id));
  const notCovered = present.filter(id => !seen.has(id));
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort((a, b) => a - b);
  const outside = [...seen.keys()].filter(id => !present.includes(id)).sort((a, b) => a - b);
  return Object.freeze({ source_segment_count: present.length, covered_count: covered.length,
    not_covered: Object.freeze(notCovered), duplicated: Object.freeze(duplicated),
    outside_transcript: Object.freeze(outside),
    suppressed_segment_ids: Object.freeze([...new Set(suppressed.map(row => row.segment_id))].sort((a, b) => a - b)),
    suppressed_count: suppressed.length, every_source_segment_accounted_for: notCovered.length === 0
      && duplicated.length === 0 && outside.length === 0 });
}

// ------------------------------------------------------------------ step 2
/**
 * The windows a boundary step asks about: at most `maxUnits` semantic units and
 * at most `maxCharacters` of speech, each window overlapping the one before it by
 * one unit so that a boundary never falls in the blind spot between two calls.
 */
export function boundaryWindows(units, { maxUnits = DEFAULT_LIMITS.boundary_units,
  maxCharacters = DEFAULT_LIMITS.boundary_characters, overlap = DEFAULT_LIMITS.boundary_overlap_units,
  textOf } = {}) {
  if (!Array.isArray(units) || units.length === 0) return [];
  if (typeof textOf !== 'function') fail('voice_conversation_text_reader_required');
  const windows = [];
  let at = 0;
  while (at < units.length) {
    const held = [];
    let characters = 0;
    for (let index = at; index < units.length; index++) {
      const length = codePoints(textOf(units[index])).length;
      if (held.length >= maxUnits || (held.length > 0 && characters + length > maxCharacters)) break;
      held.push(units[index]);
      characters += length;
    }
    if (held.length === 0) held.push(units[at]);
    windows.push({ index: windows.length, units: held, characters,
      segment_ids: held.flatMap(unit => [...unit.source_segment_ids]).sort((a, b) => a - b) });
    if (at + held.length >= units.length) break;
    at += Math.max(1, held.length - overlap);
  }
  return windows;
}

/**
 * Every `code` `checkBoundaryProposal` can return for `ok: false`, kept here
 * so a caller that needs to know the whole rejection vocabulary (a re-ask
 * sentence table, a coverage test) does not have to keep its own copy in
 * step with this function's own `return { ok: false, code: '...' }` sites.
 */
export const BOUNDARY_PROPOSAL_REJECTION_CODES = Object.freeze(['boundary_shape_invalid',
  'boundary_segment_outside_window', 'boundary_segment_repeated', 'boundary_not_monotonic',
  'boundary_reason_unknown', 'boundary_segment_missing']);

/**
 * Whether a boundary proposal is about the window it was asked about. An
 * utterance the model dropped would fall out of every conversation; one it
 * repeated would be in two; one it invented is not in this recording; and a
 * proposal that runs backwards cannot be laid on a timeline. Each is refused by
 * name rather than repaired, because the repair would be this module deciding
 * where a boundary is.
 */
export function checkBoundaryProposal(proposal, { windowSegmentIds } = {}) {
  const wanted = new Set(windowSegmentIds ?? []);
  if (!plain(proposal) || !Array.isArray(proposal.segments) || proposal.segments.length === 0) {
    return { ok: false, code: 'boundary_shape_invalid' };
  }
  const seen = new Set();
  let previousMax = -Infinity;
  for (const segment of proposal.segments) {
    const ids = segment?.source_segment_ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(Number.isSafeInteger)) {
      return { ok: false, code: 'boundary_shape_invalid' };
    }
    for (const id of ids) {
      if (!wanted.has(id)) return { ok: false, code: 'boundary_segment_outside_window' };
      if (seen.has(id)) return { ok: false, code: 'boundary_segment_repeated' };
      seen.add(id);
    }
    const sorted = [...ids].sort((a, b) => a - b);
    if (sorted[0] <= previousMax) return { ok: false, code: 'boundary_not_monotonic' };
    previousMax = sorted.at(-1);
    if (segment.boundary_reason !== undefined && !BOUNDARY_REASONS.includes(segment.boundary_reason)) {
      return { ok: false, code: 'boundary_reason_unknown' };
    }
  }
  if (seen.size !== wanted.size) return { ok: false, code: 'boundary_segment_missing' };
  return { ok: true, code: null };
}

/** One draft conversation: the utterances it holds and why it ends where it does. */
const draftOf = (ids, reason, extra = {}) => ({ source_segment_ids: [...ids].sort((a, b) => a - b),
  boundary_reasons: [reason], qa_boundary: 'none', processed_in_windows: 1,
  draft_key: null, related_draft_keys: [], ...extra });

/**
 * The windows' proposals laid end to end. The overlapping unit belongs to
 * whichever window was asked first: two windows that disagree about it are a
 * disagreement about one boundary, and taking the earlier answer keeps the seam
 * where the first reading put it instead of letting the later call silently
 * re-cut what the earlier one already decided. The disagreement is recorded.
 */
export function stitchBoundaries(windowResults) {
  const placed = new Set();
  const drafts = [];
  for (const result of windowResults) {
    for (const segment of result.segments) {
      const fresh = segment.source_segment_ids.filter(id => !placed.has(id));
      const dropped = segment.source_segment_ids.length - fresh.length;
      if (fresh.length === 0) continue;
      for (const id of fresh) placed.add(id);
      // A draft id is only unique inside the window that proposed it, so the key
      // carries the window. A link to a draft that another window had already
      // placed resolves to nothing and is dropped rather than pointed anywhere.
      const key = `w${result.window_index ?? 0}:${segment.draft_id ?? fresh[0]}`;
      const reasons = [segment.boundary_reason ?? 'topic_shift', ...(result.extra_reasons ?? []),
        ...(dropped > 0 ? ['overlap_conflict'] : [])];
      drafts.push(draftOf(fresh, segment.boundary_reason ?? 'topic_shift',
        { draft_key: key,
          related_draft_keys: (segment.related_draft_ids ?? []).map(id => `w${result.window_index ?? 0}:${id}`),
          boundary_reasons: [...new Set(reasons)] }));
    }
  }
  return drafts.sort((a, b) => a.source_segment_ids[0] - b.source_segment_ids[0]);
}

/**
 * Utterances no rule reached. They are not dropped: each one joins the nearest
 * conversation before it and says that a code put it there, and any left with
 * nothing before them become a conversation of their own. Silently discarding
 * them would make the final count come out right while the words were gone.
 */
export function attachUncovered(drafts, notCovered) {
  if (notCovered.length === 0) return { drafts, attached: 0, uncovered_draft: null };
  const sorted = drafts.map(draft => ({ ...draft, source_segment_ids: [...draft.source_segment_ids],
    boundary_reasons: [...draft.boundary_reasons] })).sort((a, b) => a.source_segment_ids[0] - b.source_segment_ids[0]);
  const orphans = [];
  let attached = 0;
  for (const id of [...notCovered].sort((a, b) => a - b)) {
    const before = [...sorted].reverse().find(draft => draft.source_segment_ids[0] < id);
    if (before === undefined) { orphans.push(id); continue; }
    before.source_segment_ids = [...before.source_segment_ids, id].sort((a, b) => a - b);
    if (!before.boundary_reasons.includes('attached_by_code')) before.boundary_reasons.push('attached_by_code');
    attached += 1;
  }
  const uncovered = orphans.length === 0 ? null : draftOf(orphans, 'rules_uncovered');
  return { drafts: (uncovered === null ? sorted : [uncovered, ...sorted])
    .sort((a, b) => a.source_segment_ids[0] - b.source_segment_ids[0]), attached, uncovered_draft: uncovered };
}

// A question, as it is actually written down. Korean marks one by how the verb
// ends rather than by a question mark, and a machine transcript often has no
// punctuation at all, so both are looked for.
const QUESTION_MARK = /[?？]\s*$/u;
const QUESTION_TAIL = /(?:까요|나요|가요|을까|ㄹ까|어요|에요|까|나|죠)$/u;
const TRAILING = /[\s.!…·,~"'”’)\]]+$/u;
// An answer, as it actually starts. The one-syllable openers have to be the whole
// word: `어제` begins with `어` and is not an answer to anything.
const SHORT_ANSWER = /^(?:네|예|응|어)(?![가-힣])/u;
const LONG_ANSWER = /^(?:아니|그렇|맞|그죠|그쵸|그니까|그러니까|일단|그럼|아\s)/u;

/** Whether an utterance reads as a question. */
export function looksLikeQuestion(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  if (QUESTION_MARK.test(trimmed)) return true;
  return QUESTION_TAIL.test(trimmed.replace(TRAILING, ''));
}
/** Whether an utterance reads as the start of an answer. */
export function looksLikeAnswer(text) {
  const trimmed = String(text ?? '').trim();
  return trimmed !== '' && (SHORT_ANSWER.test(trimmed) || LONG_ANSWER.test(trimmed));
}

/**
 * Boundaries where a question and its answer may have been cut apart.
 *
 * Two triggers, because the first one alone does not fire on real recordings.
 * The speech-act trigger asks whether the labelling run called the closing unit a
 * question or a request and the opening one an acknowledgement, decision, report
 * or commitment -- true in principle, and on this estate's rule labeller the
 * answer-side acts are almost never emitted, so the whole path stayed dark. The
 * text trigger reads the utterances instead: the last one ends like a question
 * and the next one starts like an answer.
 *
 * Either way this is a reason to look again, not a reason to merge -- a topic
 * really can change right after an answer -- so it returns the pairs, says which
 * trigger fired, and leaves the decision to whoever can ask.
 */
export function qaBoundarySuspects(drafts, { unitFor, rowFor, gapSeconds = DEFAULT_LIMITS.qa_gap_seconds } = {}) {
  const suspects = [];
  for (let index = 0; index + 1 < drafts.length; index++) {
    const before = drafts[index], after = drafts[index + 1];
    const lastId = before.source_segment_ids.at(-1), firstId = after.source_segment_ids[0];
    const closing = unitFor(lastId), opening = unitFor(firstId);
    const lastRow = rowFor(lastId), firstRow = rowFor(firstId);
    const triggers = [];
    if (closing && opening
      && (closing.speech_acts ?? []).some(act => QUESTION_ACTS.includes(act))
      && (opening.speech_acts ?? []).some(act => ANSWER_ACTS.includes(act))) triggers.push('speech_acts');
    if (looksLikeQuestion(lastRow?.content) && looksLikeAnswer(firstRow?.content)) triggers.push('text');
    if (triggers.length === 0) continue;
    const endOf = lastRow?.end_seconds, startOf = firstRow?.start_seconds;
    if (!Number.isFinite(endOf) || !Number.isFinite(startOf) || startOf - endOf > gapSeconds) continue;
    suspects.push({ index, gap_seconds: Number((startOf - endOf).toFixed(3)), triggers });
  }
  return suspects;
}

/** Two conversations read again and found to be one. */
export function mergeDrafts(drafts, index) {
  const before = drafts[index], after = drafts[index + 1];
  const merged = { ...before,
    source_segment_ids: [...before.source_segment_ids, ...after.source_segment_ids].sort((a, b) => a - b),
    boundary_reasons: [...new Set([...before.boundary_reasons, ...after.boundary_reasons, 'qa_closure'])],
    qa_boundary: 'merged',
    related_draft_keys: [...new Set([...before.related_draft_keys, ...after.related_draft_keys])] };
  return [...drafts.slice(0, index), merged, ...drafts.slice(index + 2)];
}

/**
 * Conversations that are about the same things without being next to each other.
 *
 * A recording returns to an agenda item, and the boundary step is asked to link
 * the two with `related_draft_ids` -- but it only sees one window at a time, so a
 * return that crosses a window is invisible to it. Two segments that share more
 * than one word that can actually narrow something are that return, found by a
 * code over the whole recording. A shared word or a stoplisted one is not
 * evidence of anything: every conversation in the estate says 일정.
 */
export function relatedByKeyTerms(segments, { registry = null, minimum = 2 } = {}) {
  const shared = new Set((registry?.terms ?? []).filter(row => row.declared_shared
    || (row.observed_projects ?? row.projects ?? []).length >= 2).map(row => row.normalized));
  const narrowing = segment => new Set((segment.key_terms ?? [])
    .map(term => String(term).replace(/\s+/gu, ' ').trim().toLowerCase())
    .filter(term => term && !isStoplisted(term) && !shared.has(term)));
  const terms = segments.map(narrowing);
  const links = [];
  for (let left = 0; left < segments.length; left++) {
    for (let right = left + 2; right < segments.length; right++) {
      const common = [...terms[left]].filter(term => terms[right].has(term));
      if (common.length >= minimum) {
        links.push({ from: segments[left].segment_id, to: segments[right].segment_id, terms: common.sort() });
      }
    }
  }
  return links;
}

// ------------------------------------------------------------------ step 3/5
/**
 * A conversation too long for one call, cut into windows at utterance
 * boundaries. The cut is a processing bound and never a boundary between
 * conversations: the windows are answered separately and the answers are put
 * back together, so nothing in the output says the conversation ended here.
 */
export function partialWindows(ids, { textOf, rowFor, maxCharacters, maxSeconds = DEFAULT_LIMITS.window_seconds } = {}) {
  const windows = [];
  let held = [], characters = 0, startedAt = null;
  for (const id of ids) {
    const row = rowFor(id);
    const length = codePoints(textOf(id)).length;
    const seconds = row === undefined ? 0 : row.end_seconds - (startedAt ?? row.start_seconds);
    const full = held.length > 0 && (characters + length > maxCharacters || seconds > maxSeconds);
    if (full) { windows.push(held); held = []; characters = 0; startedAt = null; }
    if (held.length === 0) startedAt = row?.start_seconds ?? null;
    held.push(id);
    characters += length;
  }
  if (held.length > 0) windows.push(held);
  return windows;
}

/** Groups short consecutive conversations into one call, which is cheaper and no less checked. */
export function batchSegments(segments, { charactersOf, maxCharacters, maxSegments }) {
  const batches = [];
  let held = [], characters = 0;
  for (const segment of segments) {
    const length = charactersOf(segment);
    if (held.length > 0 && (held.length >= maxSegments || characters + length > maxCharacters)) {
      batches.push(held); held = []; characters = 0;
    }
    held.push(segment);
    characters += length;
    if (length > maxCharacters) { batches.push(held); held = []; characters = 0; }
  }
  if (held.length > 0) batches.push(held);
  return batches;
}

/**
 * Every `code` `checkNature` can return for `ok: false` -- see
 * `BOUNDARY_PROPOSAL_REJECTION_CODES`'s own doc for why this is kept next to
 * the function rather than duplicated by each caller.
 */
export const NATURE_REJECTION_CODES = Object.freeze(['nature_shape_invalid', 'nature_unknown',
  'nature_title_too_long', 'nature_description_too_long', 'nature_title_names_a_project']);

/**
 * What a nature answer has to be before it is one. The title may not carry a
 * project code (naming a project is step 4's job and it has evidence rules this
 * step does not), the key terms have to be words that were actually said, and
 * two promotions are forced rather than suggested: a conversation nobody could
 * make out is `unreadable` whatever it looked like, and one that assigns work or
 * names a deadline is not `personal` however chatty it sounded.
 */
export function checkNature(answer, { text, unreadableRatio = 0, speechActs = [], segmentIds = [] } = {}) {
  if (!plain(answer)) return { ok: false, code: 'nature_shape_invalid' };
  const marks = [];
  let nature = answer.nature;
  if (!NATURES.includes(nature)) return { ok: false, code: 'nature_unknown' };
  const title = String(answer.title ?? '').trim();
  const description = String(answer.description ?? '').trim();
  if (codePoints(title).length > TITLE_CHARACTERS) return { ok: false, code: 'nature_title_too_long' };
  if (codePoints(description).length > DESCRIPTION_CHARACTERS) return { ok: false, code: 'nature_description_too_long' };
  if (PROJECT_CODE_ANYWHERE.test(title)) return { ok: false, code: 'nature_title_names_a_project' };
  // A key term arrives typed: what it names is what decides whether a search may
  // use it. An untyped or unknown kind is `other`, which is searched last rather
  // than refused -- the model not knowing what a word names is not a reason to
  // pretend the word was not said.
  const keyTerms = (Array.isArray(answer.key_terms) ? answer.key_terms : [])
    .map(entry => (typeof entry === 'string'
      ? { term: entry.trim(), kind: 'other' }
      : { term: String(entry?.term ?? '').trim(),
        kind: KEY_TERM_KINDS.includes(entry?.kind) ? entry.kind : 'other' }))
    .filter(entry => entry.term);
  const typed = keyTerms.filter(entry => text.includes(entry.term));
  const kept = typed.map(entry => entry.term);
  if (unreadableRatio >= 0.7 && nature !== 'unreadable') { nature = 'unreadable'; marks.push('unreadable_ratio'); }
  if (nature === 'personal' && speechActs.some(act => MATERIAL_ACTS.includes(act))) {
    nature = 'mixed';
    marks.push('personal_with_material_acts');
  }
  const agenda = checkAgenda(answer.agenda, { segmentIds });
  if (agenda.dropped.length > 0) marks.push('agenda_items_dropped');
  // One item covering the whole conversation is the title written twice. It is
  // not refused -- a conversation really can hold one subject -- but a reader
  // should see that the agenda did not tell them anything the title did not.
  if (agenda.items.length === 1 && segmentIds.length > 0
    && agenda.items[0].source_segment_ids.length >= segmentIds.length * AGENDA_WHOLE_SEGMENT) {
    marks.push('agenda_covers_whole_segment');
  }
  if (agenda.items.length === 0 && segmentIds.length >= AGENDA_UTTERANCES) marks.push('agenda_absent');
  return { ok: true, code: null, nature, title, description, key_terms: kept, key_terms_typed: typed,
    agenda: agenda.items, agenda_dropped: agenda.dropped.length,
    dropped_key_terms: keyTerms.length - kept.length, unclear: answer.unclear === true, marks };
}

/**
 * The agenda items inside one long conversation.
 *
 * A conversation of a hundred utterances has a title and a description, and both
 * of them are one sentence about an hour. What is lost is not the boundary -- the
 * boundary may well be right -- but the fact that the hour had six subjects in it,
 * none of which a reader can now find. An agenda item is a label and the
 * utterances it covers: enough to find the part you wanted, and not a second
 * conversation list competing with the first.
 *
 * An item that names utterances outside the conversation, runs backwards, overlaps
 * another item or carries a project code is dropped rather than repaired: a
 * repaired agenda is this module deciding what the conversation was about.
 */
export function checkAgenda(items, { segmentIds = [], limit = AGENDA_ITEMS } = {}) {
  const allowed = new Set(segmentIds);
  const kept = [], dropped = [];
  for (const item of Array.isArray(items) ? items : []) {
    const label = String(item?.label ?? '').trim();
    const ids = Array.isArray(item?.source_segment_ids) ? [...item.source_segment_ids] : [];
    const bad = !label || codePoints(label).length > AGENDA_LABEL_CHARACTERS || PROJECT_CODE_ANYWHERE.test(label)
      || ids.length === 0 || !ids.every(id => Number.isSafeInteger(id) && allowed.has(id))
      || !ids.every((id, index) => index === 0 || id > ids[index - 1]);
    if (bad) { dropped.push({ label, code: 'agenda_item_invalid' }); continue; }
    kept.push({ label, source_segment_ids: ids });
  }
  const ordered = kept.sort((a, b) => a.source_segment_ids[0] - b.source_segment_ids[0]);
  const held = [], seen = new Set();
  for (const item of ordered) {
    if (item.source_segment_ids.some(id => seen.has(id))) {
      dropped.push({ label: item.label, code: 'agenda_item_overlaps' });
      continue;
    }
    if (held.length >= limit) { dropped.push({ label: item.label, code: 'agenda_too_many' }); continue; }
    for (const id of item.source_segment_ids) seen.add(id);
    held.push(item);
  }
  return { items: held, dropped };
}

/**
 * Several windows of one long conversation, put back together as one answer.
 *
 * The descriptions are not glued together and cut to length: joining two
 * summaries and trimming to two hundred characters ends the sentence wherever the
 * count lands, which reads as a summary that trails off rather than as one that
 * was bounded. The first window's description is kept whole and the answer says
 * how many windows there were, so a reader knows the rest exists and was not
 * silently blended in.
 */
export function mergeNatureWindows(answers) {
  const natures = [...new Set(answers.map(answer => answer.nature))];
  const marks = [...new Set(answers.flatMap(answer => answer.marks))];
  if (natures.length > 1) marks.push('windows_disagree');
  const described = answers.filter(answer => answer.description);
  const first = described[0]?.description ?? '';
  const dropped = Math.max(0, described.length - 1);
  return { nature: natures.length === 1 ? natures[0] : 'mixed',
    title: answers.find(answer => answer.title)?.title ?? '',
    description: dropped === 0 ? first : `${first} (창 ${answers.length}개 중 1)`,
    description_windows_dropped: dropped,
    key_terms: [...new Set(answers.flatMap(answer => answer.key_terms))],
    key_terms_typed: [...new Map(answers.flatMap(answer => answer.key_terms_typed ?? [])
      .map(entry => [entry.term, entry])).values()],
    // Each window answered for its own part of the conversation, so the agendas
    // join end to end rather than competing.
    agenda: answers.flatMap(answer => answer.agenda ?? [])
      .sort((a, b) => a.source_segment_ids[0] - b.source_segment_ids[0]),
    agenda_dropped: answers.reduce((sum, answer) => sum + (answer.agenda_dropped ?? 0), 0),
    agenda_windows_without: answers.filter(answer => (answer.agenda ?? []).length === 0).length,
    unclear: answers.some(answer => answer.unclear), marks: [...new Set(marks)],
    processed_in_windows: answers.length };
}

// ------------------------------------------------------------------ step 4
/**
 * The clues a conversation offers, sorted by what each one can settle.
 *
 * A term the registry says several projects use, or one it marks as the task
 * tracker's own workflow wording, is evidence about the subject and none at all
 * about the project -- searching with it returns every project that ever wrote
 * the word. A term the registry has never seen is not thereby a term only one
 * project uses: it is a term nobody has checked, and the difference is the whole
 * reason `unregistered` is its own answer.
 */
export function classifyClues(text, registry, { keyTerms = [], entities = [] } = {}) {
  const marks = new Map(classifyTerms(text, registry).map(entry => [normaliseTerm(entry.term), entry]));
  const clues = new Map();
  const add = (value, origin, termKind) => {
    const term = String(value ?? '').trim();
    if (!term) return;
    // Exact equality, and nothing else. A compound that happens to contain a
    // shared word -- `32채널 보드`, `센서 커넥터` -- is not itself a word several
    // projects use; it is a word the registry has never seen, which is exactly
    // what makes it worth searching with. Reading the compound as shared because
    // one of its parts is was dropping every specific term the recording had.
    const normalized = normaliseTerm(term);
    const mark = marks.get(normalized);
    const containsShared = mark !== undefined ? [] : [...marks.values()]
      .filter(entry => entry.kind === 'shared' && normalized.includes(normaliseTerm(entry.term)))
      .map(entry => entry.term).sort();
    const kind = mark === undefined ? 'unregistered' : mark.kind;
    const held = clues.get(normalized);
    if (held === undefined) {
      clues.set(normalized, { term, kind, category: mark?.category ?? 'content',
        term_kind: KEY_TERM_KINDS.includes(termKind) ? termKind : 'other',
        stoplisted: isStoplisted(term), contains_shared: containsShared,
        declared_shared: mark?.declared_shared ?? null,
        observed_project_count: mark?.observed_project_count ?? null,
        projects: [...(mark?.projects ?? [])], origins: [origin] });
      return;
    }
    if (!held.origins.includes(origin)) held.origins.push(origin);
    // A word that arrived typed keeps its type: the registry knows what a term
    // is registered as, not what it names.
    if (held.term_kind === 'other' && KEY_TERM_KINDS.includes(termKind)) held.term_kind = termKind;
  };
  for (const entry of keyTerms) {
    if (typeof entry === 'string') add(entry, 'key_term', 'other');
    else add(entry?.term, 'key_term', entry?.kind);
  }
  for (const entity of entities) {
    // Only the kinds that name a thing, and only when the kind was declared.
    if (!plain(entity) || !CLUE_ENTITY_KINDS.includes(entity.kind)) continue;
    add(entity.value, 'entity', entity.kind);
  }
  for (const mark of marks.values()) add(mark.term, 'registry', 'other');
  return [...clues.values()];
}

const kindRank = clue => (NARROWING_KINDS.includes(clue.term_kind) ? 0 : (clue.term_kind === 'person' ? 1 : 2));

/**
 * The clues worth searching with, in the order they are worth it.
 *
 * Four things are excluded outright: a term several projects share, the task
 * tracker's own workflow wording, and any word on the stoplist -- relative time
 * and the generic nouns of doing work. What is left is ranked by what it names
 * before anything else: a device, a board, a named test, a document, a place or
 * an organisation first, a person's name after those, and an untyped word last.
 * Length is only the tie-break, because sorting by length alone is how "다음 주"
 * ends up being the thing a project is searched by.
 */
export function searchableClues(clues, { limit = DEFAULT_LIMITS.project_clues } = {}) {
  return clues.filter(clue => clue.kind !== 'shared' && clue.category !== 'workflow'
    && (!isStoplisted(clue.term) || searchableDespiteStoplist(clue)))
    .sort((a, b) => kindRank(a) - kindRank(b)
      || (a.kind === b.kind ? 0 : (a.kind === 'distinctive' ? -1 : 1))
      || codePoints(b.term).length - codePoints(a.term).length)
    .slice(0, limit);
}

/**
 * Which of a project's search hits become evidence.
 *
 * Taking the top three and then asking which of them carry a clue is how a
 * project ends up represented by three rows that match nothing: BM25 ranks by the
 * whole query, so a project's best three rows can all be about the one ubiquitous
 * word in it while the row that actually holds the specific term sits at rank
 * eight. Filter first, then take: scan the top `scan` hits, keep the ones that
 * match at least one clue, and prefer the ones that match more distinct clues
 * before falling back to the search's own order.
 */
export function selectEvidenceHits(hits, clues, { scan = 12, keep = 3 } = {}) {
  return (hits ?? []).slice(0, scan)
    .map(hit => ({ hit, matched: [...new Set(clues
      .filter(clue => `${hit.title ?? ''} ${hit.text ?? ''}`.toLowerCase().includes(clue.term.toLowerCase()))
      .map(clue => clue.term))] }))
    .filter(row => row.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length || (a.hit.rank ?? 0) - (b.hit.rank ?? 0))
    .slice(0, keep);
}

/** The searched clues as one bounded query. A longer query is a wider net, not a better one. */
export function clueQuery(clues, { maxCharacters = MAX_CLUE_QUERY_CHARACTERS } = {}) {
  const held = [];
  let length = 0;
  for (const clue of clues) {
    const size = codePoints(clue.term).length + (held.length === 0 ? 0 : 1);
    if (held.length > 0 && length + size > maxCharacters) break;
    held.push(clue.term);
    length += size;
  }
  return { query: held.join(' '), used: held };
}

/**
 * What a project candidate is allowed to be, given the evidence actually
 * gathered. Three rules, each of which exists because a real record broke it:
 *
 *   - a candidate needs an evidence row. A project code with nothing behind it is
 *     the model remembering a project, not this recording naming one;
 *   - a candidate whose rows matched only shared or workflow words is not weak
 *     evidence, it is no evidence, and it becomes `unclassified`;
 *   - `strong` needs a term one project uses, or two different kinds of basis.
 *     A word nobody has registered cannot make a candidate strong, however
 *     specific it sounds.
 */
/** Key-term kinds that name somebody or somewhere rather than something. */
const BORROWED_KINDS = Object.freeze(['person', 'place', 'organization']);
/** How many other projects a word has to reach before it decides nothing. */
const UBIQUITOUS_PROJECTS = 3;

export function checkCandidates(answer, { evidenceRows, clues, limit = DEFAULT_LIMITS.project_candidates } = {}) {
  if (!plain(answer)) return { ok: false, code: 'project_shape_invalid' };
  const rows = new Map(evidenceRows.map(row => [row.row_id, row]));
  const kindOf = new Map(clues.map(clue => [clue.term.toLowerCase(), clue]));
  // Which projects each matched word reaches across everything this segment's
  // search returned. A word that turns up in four projects' records is a word
  // about the estate, not about a project, whatever the registry has seen of it.
  const mentions = [];
  let singleClue = 0;
  const reach = new Map();
  for (const row of evidenceRows) {
    for (const term of row.matched_terms ?? []) {
      const key = term.toLowerCase();
      reach.set(key, new Set([...(reach.get(key) ?? []), row.project_code]));
    }
  }
  const kept = [], downgraded = [];
  for (const candidate of Array.isArray(answer.candidates) ? answer.candidates : []) {
    const code = String(candidate?.project_code ?? '');
    const ids = (Array.isArray(candidate?.evidence_row_ids) ? candidate.evidence_row_ids : [])
      .filter(id => rows.has(id) && rows.get(id).project_code === code);
    if (ids.length === 0) { downgraded.push({ project_code: code, code: 'no_evidence_row' }); continue; }
    const basis = [...new Set((Array.isArray(candidate?.basis) ? candidate.basis : [])
      .filter(kind => BASIS_KINDS.includes(kind)))];
    const matched = [...new Set(ids.flatMap(id => rows.get(id).matched_terms ?? []))];
    const grounds = matched.map(term => kindOf.get(term.toLowerCase())?.kind ?? 'unregistered');
    const categories = matched.map(term => kindOf.get(term.toLowerCase())?.category ?? 'content');
    // Everything this project was found by is a word the estate shares, or the
    // tracker's own wording. That is what every project would have matched on.
    if (matched.length === 0 || grounds.every((kind, index) => kind === 'shared' || categories[index] === 'workflow')) {
      downgraded.push({ project_code: code, code: 'shared_terms_only' });
      continue;
    }
    // Two kinds of basis stated over one matched word is one piece of evidence
    // described twice. Three rows all found by the same place name are three
    // copies of the same fact, and calling that `strong` is how a candidate gets
    // a confidence its evidence never had.
    //
    // But two different records of the same project, each found by a word that is
    // not somebody's name, are two facts -- the second one is not a copy of the
    // first just because the same term found both. So there are two ways past the
    // one-word problem, and the answer says which one it took.
    const distinctTerms = new Set(matched.map(term => term.toLowerCase())).size;
    const borrowedOnly = row => (row.matched_terms ?? []).length > 0
      && (row.matched_terms ?? []).every(term => BORROWED_KINDS.includes(kindOf.get(term.toLowerCase())?.term_kind ?? 'other'));
    const distinctItems = new Set(ids.map(id => rows.get(id))
      .filter(row => row !== undefined && !borrowedOnly(row)).map(row => row.item_id)).size;
    const strongBy = grounds.includes('distinctive') ? 'distinctive'
      : (basis.length >= 2 && distinctTerms >= 2 ? 'terms'
        : (basis.length >= 2 && distinctItems >= 2 ? 'items' : null));
    const strong = strongBy !== null;
    const askedStrong = candidate?.strength === 'strong';
    if (askedStrong && !strong && basis.length >= 2) singleClue += 1;
    // Everything that found this project is a person, a place or an organisation.
    // A customer, a site or a colleague is shared between projects exactly the way
    // a part name is, so it may say a project was mentioned and not that the
    // conversation belongs to it.
    const kinds = matched.map(term => kindOf.get(term.toLowerCase())?.term_kind ?? 'other');
    const borrowed = kinds.length > 0 && kinds.every(kind => BORROWED_KINDS.includes(kind));
    const ubiquitous = matched.length > 0 && matched.every(term =>
      (reach.get(term.toLowerCase())?.size ?? 0) > UBIQUITOUS_PROJECTS);
    if (borrowed || ubiquitous) {
      mentions.push({ project_code: code, evidence_row_ids: [...ids].sort((a, b) => a - b),
        code: borrowed ? 'borrowed_name_only' : 'ubiquitous_term_only' });
      continue;
    }
    kept.push({ project_code: code, strength: askedStrong && strong ? 'strong' : 'weak',
      strong_by: askedStrong && strong ? strongBy : null,
      basis, evidence_row_ids: [...ids].sort((a, b) => a - b), matched_terms: matched,
      distinctive: grounds.includes('distinctive') });
  }
  const ranked = kept.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'strong' ? -1 : 1)
    || b.evidence_row_ids.length - a.evidence_row_ids.length);
  // Mentions gathered above keep their place; the loop below adds the ones that
  // are mentions only because something else was placed properly.

  // A conversation placed on one project with real evidence, plus a second
  // project found by a single row matched on a single word nobody has registered,
  // is not a conversation about two projects. The second one is a mention: it
  // stays visible, and it stops being an attribution.
  const candidates = [];
  const anyStrong = ranked.some(row => row.strength === 'strong');
  for (const row of ranked) {
    if (anyStrong && row.strength === 'weak' && row.evidence_row_ids.length === 1 && !row.distinctive) {
      mentions.push({ project_code: row.project_code, evidence_row_ids: [...row.evidence_row_ids],
        code: 'single_row_beside_a_placement' });
      continue;
    }
    candidates.push(row);
  }
  const reason = candidates.length > 0 ? null
    : (downgraded.find(row => row.code === 'shared_terms_only') ? 'shared_terms_only'
      : (mentions.length > 0 ? 'mentions_only'
        : (typeof answer.unclassified_reason === 'string' && answer.unclassified_reason
          ? answer.unclassified_reason : 'no_evidence')));
  return { ok: true, code: null, candidates: candidates.slice(0, limit), downgraded,
    other_project_mentions: mentions, strong_downgraded_single_clue: singleClue,
    unclassified_reason: reason };
}

/**
 * The project a conversation sits inside, when nothing in the conversation says.
 *
 * A recording of one afternoon's work does not change project between one
 * sentence and the next, and a stretch that named nothing is lost if it is left
 * unplaced. The unit is therefore a *stretch*: consecutive conversations that are
 * project work (or mixed), with no real silence between them. A stretch that
 * holds a strong placement for exactly one project and for no other places every
 * unplaced conversation inside it, weakly, with the placed conversations named.
 *
 * Everything about it is deliberately narrow, and each restriction is a way the
 * earlier version of this rule was wrong or could have been:
 *   - a stretch ends at anything that is not project work: a personal aside, an
 *     idea, team logistics. Those are where a subject actually changes;
 *   - an `unreadable` conversation does not end a stretch. Nobody could hear it,
 *     which is not evidence that the subject changed;
 *   - a weak placement lends nothing. Only a strong one speaks for its stretch;
 *   - two projects placed strongly in one stretch place nothing: the stretch is
 *     then exactly the ambiguity this rule must not resolve;
 *   - a conversation that already has a candidate keeps it, however weak.
 */
export function contextStretches(segments, { gapSeconds = CONTINUITY_GAP_SECONDS } = {}) {
  const stretches = [];
  let held = [];
  const close = () => { if (held.length > 0) stretches.push(held); held = []; };
  for (const segment of segments) {
    if (segment.nature === 'unreadable') { if (held.length > 0) held.push(segment); continue; }
    if (!['project_work', 'mixed'].includes(segment.nature)) { close(); continue; }
    const previous = held.at(-1);
    if (previous !== undefined && segment.start_seconds - previous.end_seconds > gapSeconds) close();
    held.push(segment);
  }
  close();
  // A stretch that trails off into unreadable conversations ends at the last one
  // anybody could hear; the silence after that is not part of the work.
  return stretches.map(stretch => {
    let last = stretch.length - 1;
    while (last > 0 && stretch[last].nature === 'unreadable') last -= 1;
    return stretch.slice(0, last + 1);
  }).filter(stretch => stretch.length > 0);
}

export function applyContextContinuity(segments, { gapSeconds = CONTINUITY_GAP_SECONDS } = {}) {
  const strongCodes = segment => new Set((segment.project_candidates ?? [])
    .filter(row => row.strength === 'strong').map(row => row.project_code));
  const decisions = new Map();
  const applied = [], spans = [];
  for (const stretch of contextStretches(segments, { gapSeconds })) {
    const placed = stretch.filter(segment => strongCodes(segment).size > 0);
    const codes = new Set(placed.flatMap(segment => [...strongCodes(segment)]));
    const span = { from: stretch[0].segment_id, to: stretch.at(-1).segment_id, segments: stretch.length,
      project_code: codes.size === 1 ? [...codes][0] : null, strong_segments: placed.map(row => row.segment_id),
      placed: 0 };
    if (codes.size === 1) {
      const code = [...codes][0];
      for (const segment of stretch) {
        if (segment.status !== 'unclassified' || (segment.project_candidates ?? []).length > 0) continue;
        decisions.set(segment.segment_id, { project_code: code,
          context_segment_ids: placed.map(row => row.segment_id) });
        applied.push({ segment_id: segment.segment_id, project_code: code,
          context_segment_ids: placed.map(row => row.segment_id) });
        span.placed += 1;
      }
    }
    spans.push(span);
  }
  return { segments: segments.map(segment => {
    const decision = decisions.get(segment.segment_id);
    if (decision === undefined) return segment;
    return { ...segment, status: 'candidate', unclassified_reason: null,
      project_candidates: [{ project_code: decision.project_code, strength: 'weak',
        basis: ['context_continuity'], evidence_row_ids: [],
        context_segment_ids: [...decision.context_segment_ids] }] };
  }), applied, stretches: spans };
}

// ------------------------------------------------------------------ step 5
const TOKEN_RUN = /[\p{L}\p{N}]+/gu;
/** How often a recurring word has to recur before the recording is said to use it. */
export const RECURRING_MINIMUM = 3;
export const RECURRING_LIMIT = 40;
/** How much longer than a word one of its particled forms may be. */
const MAX_PARTICLE_LENGTH = 3;

/**
 * The words this recording keeps saying.
 *
 * A machine transcript's mishearings are one-offs; the words a meeting is about
 * come back. Handing the correction step the recurring words gives it the
 * recording's own vocabulary to compare a suspect spelling against -- and the
 * same list is what tells a code that a word said thirty times is not a typo.
 * Stoplisted words are left out: every recording says 일정.
 */
export function recurringTokens(rows, { minimum = RECURRING_MINIMUM, limit = RECURRING_LIMIT } = {}) {
  const counts = new Map();
  for (const row of rows) {
    for (const [token] of String(row?.content ?? '').matchAll(TOKEN_RUN)) {
      if (codePoints(token).length < 2 || isStoplisted(token)) continue;
      const key = token.toLowerCase();
      counts.set(key, { term: counts.get(key)?.term ?? token, count: (counts.get(key)?.count ?? 0) + 1 });
    }
  }
  // Korean writes the particle onto the word, so `아트웍` and `아트웍은` are two
  // whitespace tokens and one word. Without morphology the rule has to be stated
  // rather than clever: a token counts the tokens that start with it and are at
  // most a particle longer. It can over-merge two words that share a beginning;
  // this is a frequency hint for a prompt and for a demotion, not a lexicon.
  const keys = [...counts.keys()];
  const merged = keys.map(key => ({ term: counts.get(key).term,
    count: keys.filter(other => other === key
      || (other.startsWith(key) && other.length - key.length <= MAX_PARTICLE_LENGTH))
      .reduce((sum, other) => sum + counts.get(other).count, 0) }));
  // A token that is only ever seen with its particle would otherwise be dropped,
  // and the shorter form is the one worth showing, so both are kept and the
  // longer one loses to the shorter at the same count.
  return merged.filter(row => row.count >= minimum)
    .sort((a, b) => b.count - a.count || codePoints(a.term).length - codePoints(b.term).length
      || a.term.localeCompare(b.term))
    .filter((row, index, all) => all.findIndex(other => other.term.toLowerCase().startsWith(row.term.toLowerCase())
      || row.term.toLowerCase().startsWith(other.term.toLowerCase())) === index)
    .slice(0, limit);
}

/** How often a piece of text occurs across a whole transcript. */
export function occurrenceCounter(rows) {
  const body = rows.map(row => String(row?.content ?? '')).join('\n').toLowerCase();
  return needle => {
    const target = String(needle ?? '').trim().toLowerCase();
    if (!target) return 0;
    let count = 0;
    for (let at = body.indexOf(target); at !== -1; at = body.indexOf(target, at + target.length)) count += 1;
    return count;
  };
}

/**
 * What the correction step is told about the words before it is asked about them.
 *
 * Three things, and each answers a different way of getting a correction wrong.
 * The glossary says what the estate calls things, so a misheard term can be
 * recognised. The recurring words say what this recording calls things, so a word
 * said thirty times is not offered up as a typo. The evidence rows say what the
 * records of the projects it may belong to call the same things, which is where
 * the right spelling of a part or a place actually lives.
 */
const firstLine = (value, max) => {
  const held = String(value ?? '').split(String.fromCharCode(10)).map(row => row.trim()).find(Boolean) ?? '';
  return codePoints(held).slice(0, max).join('');
};
export function correctionGlossary({ terms = [], recurring = [], evidenceRows = [], maxRows = 12,
  // One line, bounded: a quote in a prompt is a hint about wording, never the record.
  quote = firstLine } = {}) {
  // The record's own title, because the first line of a unit is often a heading
  // (`## Work Brief`) that says nothing about what the record is: a reader given
  // only that quote is right to refuse the row, and so is a model.
  const rows = evidenceRows.slice(0, maxRows)
    .map(row => `${quote(String(row.item_id ?? ''), 40)} \u00b7 ${quote(String(row.title ?? ''), 80)}`
      + ` \u2014 ${quote(String(row.quote ?? ''), 90)}`);
  // The recurring words are shown as protected, not as targets. Offered as a
  // vocabulary to correct towards they became a mapping table: the step replaced
  // whatever it half-heard with whichever recurring word was nearest, and
  // normalised the synonyms the speakers themselves were using.
  return [`용어표 \u2014 이 과제들의 기록이 쓰는 표기다\n${terms.join(' \u00b7 ') || '(없음)'}`,
    `보호 낱말 \u2014 이 녹음에서 반복되는 낱말(괄호는 나온 횟수). 실제 발화일 가능성이 높다.\n`
      + `**그대로 두고, 다른 낱말을 이 낱말로 바꾸지도 않는다.**\n`
      + `${recurring.map(row => `${row.term}(${row.count})`).join(' \u00b7 ') || '(없음)'}`,
    `관련 자료 \u2014 이 구간의 후보 과제 기록에서 온 줄이며, 같은 것을 부르는 올바른 표기의 참고다\n`
      + `${rows.join('\n') || '(없음)'}`].join('\n\n');
}

/**
 * Whether a correction is a correction: one word, at a place in the transcript
 * that actually holds the text the model said it holds.
 *
 * Three things have to agree -- the utterance, the offset and the original text
 * -- because any two of them can agree by accident. A model that gives no offset
 * gets one filled in only when the text occurs exactly once in that utterance;
 * twice is ambiguous and this module will not pick. Length is the guard against
 * the other failure: a proposal three times the original, or a long phrase with
 * spaces in it, is a rewrite of the sentence wearing a correction's shape.
 */
export function checkCorrection(proposal, { text, knownTerms = [], keyTerms = [], occurrences = null,
  protectedWords = [] } = {}) {
  if (!plain(proposal)) return { status: 'discarded', code: 'position_mismatch' };
  const original = String(proposal.original ?? '');
  const proposed = String(proposal.proposed ?? '');
  if (!original || !proposed) return { status: 'discarded', code: 'position_mismatch' };
  if (original === proposed) return { status: 'discarded', code: 'no_change' };
  if (!CORRECTION_REASONS.includes(proposal.reason)) return { status: 'discarded', code: 'reason_unknown' };
  if (codePoints(proposed).length >= 3 * codePoints(original).length
    || (/\s/u.test(proposed) && codePoints(proposed).length > 40)) {
    return { status: 'discarded', code: 'rewrite_refused' };
  }
  const glyphs = codePoints(text);
  const originalGlyphs = codePoints(original);
  const at = [];
  for (let index = 0; index + originalGlyphs.length <= glyphs.length; index++) {
    if (glyphs.slice(index, index + originalGlyphs.length).join('') === original) at.push(index);
  }
  if (at.length === 0) return { status: 'discarded', code: 'position_mismatch' };
  let offset = proposal.char_offset;
  // The three-way rule is satisfied by the utterance, the text and the one place
  // that text occurs; an offset the model miscounted adds nothing to that and
  // takes nothing away. So a wrong offset is corrected -- and said to have been
  // -- when the text occurs exactly once, and refused when it occurs more than
  // once, because then the offset was the only thing that could have chosen.
  let offsetCorrected = false;
  if (Number.isSafeInteger(offset)) {
    if (!at.includes(offset)) {
      if (at.length !== 1) return { status: 'discarded', code: 'position_mismatch' };
      offset = at[0];
      offsetCorrected = true;
    }
  } else if (at.length === 1) {
    offset = at[0];
  } else {
    return { status: 'discarded', code: 'position_ambiguous' };
  }
  const normalised = original.trim().toLowerCase();
  const known = knownTerms.some(term => String(term).trim().toLowerCase() === normalised)
    || keyTerms.some(term => String(term).trim().toLowerCase() === normalised);
  // Three ways a proposal is about the recording's vocabulary rather than about a
  // mishearing. None of them discards it -- each might still be right, and a
  // reader has to be able to see that the machine wanted to make the change --
  // but none of them is a confident correction either.
  const counted = typeof occurrences === 'function';
  // A word this recording says again and again. A decoder does not make the same
  // mistake thirty times and no other.
  const recurs = counted && occurrences(original) >= RECURRING_MINIMUM;
  // Both words are in the transcript: the speakers used both, and choosing one is
  // normalising a synonym rather than correcting a mistake.
  const synonym = counted && occurrences(original) >= 2 && occurrences(proposed) >= 2;
  // The replacement is a protected word and the original is not: this is the
  // recurring-word list being read as a list of things to map onto.
  const guarded = new Set(protectedWords.map(term => String(term).trim().toLowerCase()));
  const mapped = guarded.size > 0 && guarded.has(proposed.trim().toLowerCase())
    && !guarded.has(original.trim().toLowerCase());
  const confidence = ['high', 'medium', 'low'].includes(proposal.confidence) ? proposal.confidence : 'low';
  return { status: 'proposed', code: null, char_offset: offset, original, proposed,
    reason: proposal.reason,
    confidence: known || recurs || synonym || mapped ? 'low' : confidence,
    original_recurs_in_transcript: recurs, synonym_normalization: synonym,
    mapped_onto_protected_word: mapped, offset_corrected_by_code: offsetCorrected,
    // A correction with `needs_audio_recheck` is not a weaker correction; it is
    // one whose truth is not in the transcript at all.
    needs_audio_recheck: AUDIO_RECHECK_REASONS.includes(proposal.reason),
    evidence: 'context_inference', original_is_known_term: known };
}

/** The utterance text as it reads with a set of accepted corrections applied, in memory only. */
export function applyCorrections(text, proposals) {
  let glyphs = codePoints(text);
  for (const proposal of [...proposals].sort((a, b) => b.char_offset - a.char_offset)) {
    const before = glyphs.slice(0, proposal.char_offset).join('');
    const after = glyphs.slice(proposal.char_offset + codePoints(proposal.original).length).join('');
    glyphs = codePoints(`${before}${proposal.proposed}${after}`);
  }
  return glyphs.join('');
}

/**
 * Which conversations have to be judged again: those where a confident
 * correction moved one of the words the judgement was made on. A key term that
 * is no longer in the corrected text is a key term the project step was reading
 * when it was reading something else.
 */
export function segmentsNeedingRejudgement(segments, { correctedTextOf }) {
  return segments.filter(segment => {
    const accepted = (segment.corrections ?? []).filter(row => row.confidence === 'high');
    if (accepted.length === 0) return false;
    const corrected = correctedTextOf(segment);
    return (segment.key_terms ?? []).some(term => !corrected.includes(term));
  });
}

// ------------------------------------------------------------------ step 7
/**
 * Everything the list claims about itself, checked against the transcript it came
 * from. A failure does not hide the result -- the run is written either way -- it
 * sets `verified: false` and says which check failed, because a list nobody can
 * see is not safer than one that says what is wrong with it.
 */
export function finalChecks({ segments, rows, suppressedSegmentIds = [], coverage = null } = {}) {
  const checks = [];
  const record = (check, ok, detail) => checks.push({ check, status: ok ? 'ok' : 'failed', detail });
  const present = new Set(rows.map(row => row.segment_id));
  const held = segments.flatMap(segment => segment.source_segment_ids);
  const heldSet = new Set(held);
  const missing = [...present].filter(id => !heldSet.has(id) && !suppressedSegmentIds.includes(id));
  const repeated = held.length !== heldSet.size;
  const unknown = held.filter(id => !present.has(id));
  record('every_utterance_in_one_conversation', missing.length === 0 && !repeated && unknown.length === 0,
    `누락 ${missing.length} · 중복 ${held.length - heldSet.size} · 전사 밖 ${unknown.length}`);
  const monotonic = segments.every((segment, index) => index === 0 || segment.start_ms >= segments[index - 1].start_ms);
  record('clock_monotonic', monotonic, monotonic ? '시작 시각이 순서대로' : '시작 시각이 뒤로 감');
  const judged = segments.every(segment => NATURES.includes(segment.nature)
    && ['candidate', 'unclassified'].includes(segment.status));
  record('every_conversation_has_a_nature_and_a_status', judged, `구간 ${segments.length}`);
  const naming = segments.filter(segment => PROJECT_CODE_ANYWHERE.test(String(segment.title ?? '')));
  record('no_project_code_in_a_title', naming.length === 0, `제목에 과제 코드 ${naming.length}건`);
  const confirmed = segments.filter(segment => segment.status === 'confirmed');
  record('nothing_confirmed_by_a_pipeline', confirmed.length === 0, `confirmed ${confirmed.length}건`);
  if (coverage !== null) {
    record('rules_draft_accounted_for_every_utterance', coverage.every_source_segment_accounted_for,
      `규칙 초안 covered ${coverage.covered_count}/${coverage.source_segment_count}`
      + ` · not_covered ${coverage.not_covered.length} · duplicated ${coverage.duplicated.length}`);
  }
  return checks;
}

// -------------------------------------------------------------------- run id
/**
 * The name of a run, from everything that could change its answer: the recording,
 * the two transcripts behind it, the prompts, the model the server is actually
 * serving and the configuration. The same inputs name the same run, which is what
 * lets a second pass find the first pass's cached answers instead of paying for
 * them again -- and different inputs name a different run rather than quietly
 * overwriting one.
 */
export function runIdFor({ sessionId, transcript, semanticRun, prompts, model, configSha256 }) {
  const canonical = JSON.stringify({ session_id: sessionId,
    transcript: { run_id: transcript?.run_id ?? null, sha256: transcript?.sha256 ?? null },
    semantic_run: { run_id: semanticRun?.run_id ?? null, sha256: semanticRun?.sha256 ?? null },
    prompts: Object.fromEntries(Object.entries(prompts ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))),
    model: { digest: model?.digest ?? null, pin_kind: model?.pin_kind ?? null, alias: model?.alias ?? null },
    config_sha256: configSha256 ?? null });
  return `vcl_${sha256(canonical).slice(0, 16)}`;
}

/** The address of one step's cached answer, from the exact input that produced it. */
export const cacheKeyFor = ({ step, model, system, user, schema }) =>
  sha256(JSON.stringify({ step, model, system, user, schema }));

// ------------------------------------------------------------------ rendering
const pad = value => String(value).padStart(2, '0');
export const spokenClock = seconds => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};
const cell = value => String(value ?? '').replaceAll('|', '/').replaceAll('\n', ' ').trim();
const trim = (value, max) => {
  const glyphs = codePoints(value);
  return glyphs.length <= max ? glyphs.join('') : `${glyphs.slice(0, max).join('')}…`;
};

/** The Owner's table: one row per conversation, in the order they were said. */
export function renderConversationTable(list) {
  const lines = [`# ${list.session_id} 대화 목록`, '',
    `run ${list.run_id} · 생성 ${list.generated_at} · verified ${list.verified}`
    + ` · 구간 ${list.segments.length} · 전사 ${list.transcript.run_id} (${list.transcript.kind})`,
    '',
    '제목과 설명은 기계가 만든 파생 요약입니다 — 실제 발언도 승인된 회의록도 아닙니다.',
    '과제 후보는 후보이며 확정이 아닙니다. 확정은 사람이 합니다.', '',
    '| 시작–종료 (KST) | 제목 | 설명 | 성격 | 과제 후보·근거 | 품질·교정 | 참조 |',
    '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const segment of list.segments) {
    const candidates = segment.project_candidates.length === 0
      ? `미분류${segment.unclassified_reason ? ` (${cell(segment.unclassified_reason)})` : ''}`
      : segment.project_candidates.map(row => `${row.project_code} ${row.strength}`
        + `${row.strong_by ? `(${row.strong_by})` : ''}`
        + `${row.basis.length ? ` [${row.basis.join('+')}]` : ''}`
        + `${row.context_segment_ids?.length ? ` 이웃 ${row.context_segment_ids.join('·')}`
          : ` 근거 ${row.evidence_row_ids.length}행`}`).join('<br>');
    const mentions = (segment.other_project_mentions ?? [])
      .map(row => `언급: ${row.project_code} 근거 ${row.evidence_row_ids.length}행`).join('<br>');
    const marks = segment.quality.marks.length ? segment.quality.marks.join(',') : '-';
    lines.push(`| ${segment.clock.slice(11, 19)}–${segment.clock_end.slice(11, 19)}`
      + `<br>${spokenClock(segment.start_seconds)}–${spokenClock(segment.end_seconds)}`
      + ` | ${cell(trim(segment.title, 40))} | ${cell(trim(segment.description, 200))}`
      + `${(segment.agenda_items ?? []).length ? `<br>안건: ${segment.agenda_items
        .map(item => `${cell(trim(item.label, 40))} (발화 ${item.source_segment_ids[0]}\u2013${item.source_segment_ids.at(-1)})`)
        .join(' \u00b7 ')}` : ''}`
      + ` | ${cell(segment.nature)}${segment.nature_unclear ? ' (미정)' : ''}`
      + ` | ${candidates}${mentions ? `<br>${mentions}` : ''} | ${marks} · 교정 ${segment.quality.correction_state}`
      + ` | ${segment.segment_id} · 발화 ${segment.source_segment_ids.length}개`
      + ` (${segment.source_segment_ids[0]}–${segment.source_segment_ids.at(-1)})`
      + `${segment.boundary.qa_boundary === 'none' ? '' : ` · Q/A ${segment.boundary.qa_boundary}`}`
      + `${segment.boundary.processed_in_windows > 1 ? ` · 창 ${segment.boundary.processed_in_windows}` : ''} |`);
  }
  if (list.evidence_rows.length > 0) {
    lines.push('', '## 근거 행', '',
      '| # | 과제 | 항목 | 제목 | 단위 | 종류 | 맞은 용어 | 인용 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const row of list.evidence_rows) {
      lines.push(`| ${row.row_id} | ${row.project_code} | ${cell(trim(row.item_id, 40))}`
        + ` | ${cell(trim(row.title ?? '', 60))} | ${cell(row.unit_id)}`
        + ` | ${cell(row.source_kind)} | ${cell(row.matched_terms.join(', '))} | ${cell(trim(row.quote, 80))} |`);
    }
  }
  lines.push('', '## 검사', '', '| 검사 | 결과 | 내용 |', '| --- | --- | --- |');
  for (const check of list.checks) lines.push(`| ${check.check} | ${check.status} | ${cell(check.detail)} |`);
  return `${lines.join('\n')}\n`;
}

/** Before and after, one word at a time, with what the change rests on. */
export function renderCorrectionsTable(corrections, { textOf, clockOf }) {
  const lines = [`# ${corrections.session_id} 교정 전후`, '',
    `run ${corrections.run_id} · 생성 ${corrections.generated_at}`
    + ` · 제안 ${corrections.proposals.length} · 폐기 ${corrections.discarded.length}`, '',
    '교정안은 제안입니다. 전사 파일은 바뀌지 않았고, 아래 "교정 후"는 제안을 적용해 본 모습입니다.',
    '이 파이프라인은 오디오를 듣지 않습니다 — 근거는 모두 문맥 추정이며, 재확인이 필요한 줄은 사람이 원음을 들어야 합니다.', '',
    '| 발화 ID | 시각 | 교정 전 | 교정 후 | 이유 | 확신 | 문맥 추정/음성 확인 | 재확인 필요 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const proposal of corrections.proposals) {
    const text = textOf(proposal.source_segment_id);
    lines.push(`| ${proposal.source_segment_id} | ${clockOf(proposal.source_segment_id)}`
      + ` | ${cell(trim(text, 60))} | ${cell(trim(applyCorrections(text, [proposal]), 60))}`
      + ` | ${proposal.reason} | ${proposal.confidence}`
      + `${proposal.original_is_known_term ? ' (등록 용어)' : ''}`
      + `${proposal.offset_corrected_by_code ? ' (위치 보정)' : ''}`
      + ` | ${proposal.evidence === 'context_inference' ? '문맥 추정' : '음성 확인'}`
      + ` | ${proposal.needs_audio_recheck ? '예' : '아니오'} |`);
  }
  if (corrections.discarded.length > 0) {
    lines.push('', '## 폐기된 제안', '', '| 발화 ID | 교정 전 | 제안 | 폐기 이유 |', '| --- | --- | --- | --- |');
    for (const row of corrections.discarded) {
      lines.push(`| ${row.source_segment_id ?? '-'} | ${cell(trim(row.original, 40))}`
        + ` | ${cell(trim(row.proposed, 40))} | ${row.code} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export { sha256 as conversationSha256 };
