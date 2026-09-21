// Deterministic answer evaluation for the local answering bot: the pure half.
//
// The problem this exists for: three golden questions were run by hand across
// two models over a whole day, the answers were compared in prose, and the
// numeric cells were never filled in. Every later change to what the bot can
// see (voice card reconciliation, mail digests, mail attribution) needs a way
// to say "better or worse than last time" in minutes. So: a hand-written
// answer key per question, and a machine that only ever asks "does this
// answer contain one of these strings". No model judges anything here --
// there is no LLM judge in v0, on purpose, because an LLM judge is itself a
// thing that drifts and would have to be evaluated.
//
// What this module is: `validateQuestionSet` compiles a question-set document
// into matchers, `scoreAnswer` scores one answer against one compiled
// question, `summarize` folds a run's results into totals, and `compareRuns`
// says what moved between two runs. No I/O, no clock, no model, no child
// process -- `harness/answer_eval.mjs` owns all of that. Same inputs, same
// output, every time.
//
// What it deliberately does NOT do (also in the README, because a number is
// dangerous when its limits are not written next to it):
//   - it cannot judge reasoning, phrasing, or whether an answer is *useful*;
//     it can only see whether a string the key names is present,
//   - the keys are exactly as good as the person who hand-wrote them,
//   - an answer that quotes half the corpus hits keys without answering
//     anything, which is why `answer_chars` is reported next to every score,
//   - there is no single blended score. `found`, `cited` and `errors` are
//     reported separately, so a change that raises `found` while adding a
//     wrong claim shows up as exactly that and not as a wash.
//
// Matching is on NFKC-normalised, case-folded, whitespace-collapsed text.
// Korean is matched by plain containment with no word-boundary assumption (a
// noun takes particles straight onto its tail: 납기 inside 납기일); an ASCII
// token like an issue id is matched with boundaries, so `EX-1` does not match
// `EX-15`. Regex items are compiled through the repo's existing draft-time
// regex safety scan (`guild_hall/workspace_ledgers/src/classifier.mjs`'s
// `compileTerm`) rather than a second, weaker copy of one: length cap, no
// nested quantifiers, no backreferences or lookbehind, bounded alternation,
// and a ReDoS timing canary.
import { createHash } from 'node:crypto';
import { compileTerm } from '../../../workspace_ledgers/src/classifier.mjs';

export const ANSWER_EVAL_QUESTIONS_SCHEMA = 'soulforge.context_answer_eval_questions.v1';
export const ANSWER_EVAL_RECEIPT_SCHEMA = 'soulforge.context_answer_eval_receipt.v1';
export const ANSWER_EVAL_ASK_COMMAND_SCHEMA = 'soulforge.context_answer_eval_ask_command.v1';
export const ANSWER_EVAL_TOOL_VERSION = 'answer_eval/v0';

// Bounds. A question set is hand-written by one person for one evaluation;
// every one of these is far past what that looks like, and exists so a
// malformed or pasted-together file fails loudly instead of turning into an
// hour of matching.
export const MAX_QUESTIONS = 200;
export const MAX_KEYS_PER_GROUP = 50;
export const MAX_ANY_OF = 32;
// Same cap the shared regex safety scan applies to a term value, restated
// here so a literal is bounded by the same number as a pattern.
export const MAX_PATTERN_CHARS = 200;
export const MAX_PROMPT_CHARS = 8000;
export const MAX_NOTE_CHARS = 400;
// An answer longer than this is read up to the cap and scored on that prefix,
// with `answer_truncated` set -- never silently scored on a partial read.
export const MAX_ANSWER_BYTES = 1024 * 1024;
// The conservative default for "the bot asked me a question back instead of
// answering". Both halves must hold: short, AND ending in a question mark.
export const DEFAULT_CLARIFICATION_MAX_CHARS = 400;

const ID = /^[A-Za-z0-9._-]{1,64}$/u;
const KEY = /^[A-Za-z0-9._:-]{1,64}$/u;
const LABEL = /^[A-Za-z0-9 ._-]{1,60}$/u;
// `/source/flags` -- the only way to write a pattern instead of a literal. A
// literal that both starts and ends with `/` therefore needs
// `match: "substring"`... no: it needs to not look like this, which in
// practice means it never comes up. Documented in the README.
const REGEX_ITEM = /^\/(.+)\/([a-z]*)$/su;
// A needle that is safe to match with ASCII token boundaries: pure ASCII
// word/id shape. Tested against the *normalised* (lower-cased) needle.
const ASCII_TOKEN = /^[a-z0-9][a-z0-9._-]*$/u;
// What may not sit directly against an ASCII-token match. Deliberately ASCII
// only: Korean text attaches straight onto an id (`EX-1건`) and that is still
// a mention of `EX-1`.
const TOKEN_BLOCKING = /[0-9a-z_]/u;
const MATCH_MODES = Object.freeze(['auto', 'substring', 'token']);

export class AnswerEvalError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AnswerEvalError';
    this.code = code;
    // A field, not just message text, so a caller can report which question
    // or key failed without parsing it back out of a string.
    this.detail = detail ?? null;
  }
}

const fail = (code, detail) => { throw new AnswerEvalError(code, detail); };

export const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * The one normalisation both sides of every comparison go through: NFKC (so a
 * full-width digit and its ASCII twin are one string), case-folded, every run
 * of whitespace collapsed to one space, trimmed. An answer that wrapped a
 * phrase across a line break still contains that phrase afterwards.
 */
export function normalizeText(raw) {
  return String(raw ?? '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** True when `needle` occurs in `text` with neither side touching an ASCII word character. */
function tokenIncludes(text, needle) {
  for (let from = 0; ; from += 1) {
    const at = text.indexOf(needle, from);
    if (at < 0) return false;
    const before = at > 0 ? text[at - 1] : '';
    const after = at + needle.length < text.length ? text[at + needle.length] : '';
    if (!TOKEN_BLOCKING.test(before) && !TOKEN_BLOCKING.test(after)) return true;
    from = at;
  }
}

/**
 * One `any_of` entry into a matcher over already-normalised text.
 *
 * `mode` is the owning key's `match`: `auto` (the default) uses token
 * boundaries for an ASCII-token needle and plain containment for everything
 * else -- which is what makes `EX-1` miss `EX-15` while 납기 still hits
 * 납기일. `substring` forces containment (needed for an ASCII needle that
 * legitimately sits against other word characters, e.g. a date inside an ISO
 * timestamp); `token` forces boundaries and refuses a needle that is not an
 * ASCII token, rather than quietly doing something else.
 */
export function compileItem(raw, { mode = 'auto', where = 'item' } = {}) {
  if (typeof raw !== 'string' || raw.trim() === '') fail('answer_eval_pattern_empty', where);
  if (raw.length > MAX_PATTERN_CHARS) fail('answer_eval_pattern_too_long', where);
  const asRegex = REGEX_ITEM.exec(raw);
  if (asRegex) {
    const [, source, rawFlags] = asRegex;
    // Text is already lower-cased by `normalizeText`, so an author's
    // upper-case pattern would silently never match; `i` is added rather than
    // left as a trap. `u` is added by the shared compiler itself.
    const flags = rawFlags.includes('u') ? 'iu' : 'i';
    if ([...rawFlags].some(flag => flag !== 'i' && flag !== 'u')) {
      fail('answer_eval_pattern_flags_not_allowed', `${where}:${rawFlags}`);
    }
    let term;
    try { term = compileTerm({ label: where, kind: 'regex', value: source, flags }); }
    catch (error) { fail('answer_eval_pattern_regex_unsafe', `${where}:${error?.code ?? 'unknown'}`); }
    return { kind: 'regex', test: text => term.test(text) };
  }
  const needle = normalizeText(raw);
  if (needle === '') fail('answer_eval_pattern_empty', where);
  const isToken = ASCII_TOKEN.test(needle);
  if (mode === 'token' && !isToken) fail('answer_eval_pattern_not_a_token', where);
  const useToken = mode === 'token' || (mode === 'auto' && isToken);
  return useToken
    ? { kind: 'token', test: text => tokenIncludes(text, needle) }
    : { kind: 'substring', test: text => text.includes(needle) };
}

const KEY_FIELDS = Object.freeze(['key', 'any_of', 'weight', 'note', 'match']);

function compileKeyGroup(raw, { group, questionId, required }) {
  const where = `${questionId}.${group}`;
  if (raw === undefined || raw === null) {
    if (required) fail('answer_eval_key_group_missing', where);
    return [];
  }
  if (!Array.isArray(raw)) fail('answer_eval_key_group_not_a_list', where);
  if (raw.length > MAX_KEYS_PER_GROUP) fail('answer_eval_key_group_too_large', where);
  const seen = new Set();
  return raw.map(entry => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) fail('answer_eval_key_not_an_object', where);
    for (const field of Object.keys(entry)) {
      if (!KEY_FIELDS.includes(field)) fail('answer_eval_key_field_unknown', `${where}:${field}`);
    }
    if (typeof entry.key !== 'string' || !KEY.test(entry.key)) fail('answer_eval_key_invalid', where);
    if (seen.has(entry.key)) fail('answer_eval_key_duplicate', `${where}:${entry.key}`);
    seen.add(entry.key);
    const at = `${where}:${entry.key}`;
    if (!Array.isArray(entry.any_of) || entry.any_of.length === 0) fail('answer_eval_any_of_empty', at);
    if (entry.any_of.length > MAX_ANY_OF) fail('answer_eval_any_of_too_large', at);
    const mode = entry.match ?? 'auto';
    if (!MATCH_MODES.includes(mode)) fail('answer_eval_match_mode_unknown', `${at}:${String(mode)}`);
    let weight = 1;
    if (entry.weight !== undefined) {
      if (typeof entry.weight !== 'number' || !Number.isFinite(entry.weight) || entry.weight <= 0 || entry.weight > 100) {
        fail('answer_eval_weight_invalid', at);
      }
      weight = entry.weight;
    }
    if (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.length > MAX_NOTE_CHARS)) {
      fail('answer_eval_note_invalid', at);
    }
    // `note` is read for validation and then dropped: it is the author's
    // reminder of what the key means, it can quote source material, and it
    // has no business in a receipt that is meant to be safe to paste in a
    // public log.
    return { key: entry.key, weight, matchers: entry.any_of.map((item, index) => compileItem(item, { mode, where: `${at}[${index}]` })) };
  });
}

const QUESTION_FIELDS = Object.freeze(['id', 'prompt', 'must_find', 'must_cite', 'must_not', 'max_minutes', 'expect_clarification', 'note']);
const SET_FIELDS = Object.freeze(['schema', 'set_id', 'created_at', 'questions', 'clarification', 'note']);

function compileClarification(raw) {
  if (raw === undefined || raw === null) return { max_chars: DEFAULT_CLARIFICATION_MAX_CHARS, patterns: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) fail('answer_eval_clarification_invalid');
  for (const field of Object.keys(raw)) {
    if (field !== 'max_chars' && field !== 'patterns') fail('answer_eval_clarification_field_unknown', field);
  }
  let maxChars = DEFAULT_CLARIFICATION_MAX_CHARS;
  if (raw.max_chars !== undefined) {
    if (!Number.isInteger(raw.max_chars) || raw.max_chars <= 0 || raw.max_chars > MAX_PROMPT_CHARS) fail('answer_eval_clarification_invalid', 'max_chars');
    maxChars = raw.max_chars;
  }
  const patterns = raw.patterns === undefined ? [] : raw.patterns;
  if (!Array.isArray(patterns)) fail('answer_eval_clarification_invalid', 'patterns');
  if (patterns.length > MAX_ANY_OF) fail('answer_eval_clarification_invalid', 'patterns');
  return { max_chars: maxChars, patterns: patterns.map((item, index) => compileItem(item, { where: `clarification.patterns[${index}]` })) };
}

/**
 * Compiles one question-set document. Every refusal is a code, never a
 * best-effort repair: a question set with a typo'd field name is a question
 * set whose author believes something is being measured that is not, and that
 * is exactly the failure this whole harness exists to stop.
 */
export function validateQuestionSet(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) fail('answer_eval_questions_not_an_object');
  for (const field of Object.keys(body)) {
    if (!SET_FIELDS.includes(field)) fail('answer_eval_questions_field_unknown', field);
  }
  if (body.schema !== ANSWER_EVAL_QUESTIONS_SCHEMA) fail('answer_eval_questions_schema_unknown', String(body.schema));
  if (typeof body.set_id !== 'string' || !ID.test(body.set_id)) fail('answer_eval_set_id_invalid');
  if (typeof body.created_at !== 'string' || !Number.isFinite(Date.parse(body.created_at))) fail('answer_eval_created_at_invalid');
  if (!Array.isArray(body.questions) || body.questions.length === 0) fail('answer_eval_questions_empty');
  if (body.questions.length > MAX_QUESTIONS) fail('answer_eval_questions_too_many');
  const clarification = compileClarification(body.clarification);
  const ids = new Set();
  const questions = body.questions.map(raw => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail('answer_eval_question_not_an_object');
    for (const field of Object.keys(raw)) {
      if (!QUESTION_FIELDS.includes(field)) fail('answer_eval_question_field_unknown', field);
    }
    if (typeof raw.id !== 'string' || !ID.test(raw.id)) fail('answer_eval_question_id_invalid', String(raw.id));
    if (ids.has(raw.id)) fail('answer_eval_question_id_duplicate', raw.id);
    ids.add(raw.id);
    if (typeof raw.prompt !== 'string' || raw.prompt.trim() === '') fail('answer_eval_question_prompt_empty', raw.id);
    if (raw.prompt.length > MAX_PROMPT_CHARS) fail('answer_eval_question_prompt_too_long', raw.id);
    const mustFind = compileKeyGroup(raw.must_find, { group: 'must_find', questionId: raw.id, required: false });
    const mustCite = compileKeyGroup(raw.must_cite, { group: 'must_cite', questionId: raw.id, required: false });
    const mustNot = compileKeyGroup(raw.must_not, { group: 'must_not', questionId: raw.id, required: false });
    // A question that asserts nothing measures nothing. Refused rather than
    // scored as a free 100%.
    if (mustFind.length === 0 && mustCite.length === 0) fail('answer_eval_question_has_no_keys', raw.id);
    let maxMinutes = null;
    if (raw.max_minutes !== undefined && raw.max_minutes !== null) {
      if (typeof raw.max_minutes !== 'number' || !Number.isFinite(raw.max_minutes) || raw.max_minutes <= 0) {
        fail('answer_eval_max_minutes_invalid', raw.id);
      }
      maxMinutes = raw.max_minutes;
    }
    if (raw.expect_clarification !== undefined && typeof raw.expect_clarification !== 'boolean') {
      fail('answer_eval_expect_clarification_invalid', raw.id);
    }
    if (raw.note !== undefined && (typeof raw.note !== 'string' || raw.note.length > MAX_NOTE_CHARS)) {
      fail('answer_eval_note_invalid', raw.id);
    }
    return { id: raw.id, prompt: raw.prompt, must_find: mustFind, must_cite: mustCite, must_not: mustNot,
      max_minutes: maxMinutes, expect_clarification: raw.expect_clarification === true };
  });
  return { schema: body.schema, set_id: body.set_id, created_at: body.created_at, clarification, questions };
}

// --------------------------------------------------------------- scoring
/**
 * One key group against one normalised answer. `share` is the weighted
 * fraction hit, or `null` for an empty group -- "not measured", which is not
 * the same thing as zero and never drags a mean down.
 */
function scoreGroup(entries, normalized) {
  let weightTotal = 0;
  let weightHit = 0;
  const hit = [];
  const missed = [];
  for (const entry of entries) {
    weightTotal += entry.weight;
    if (entry.matchers.some(matcher => matcher.test(normalized))) {
      weightHit += entry.weight;
      hit.push(entry.key);
    } else {
      missed.push(entry.key);
    }
  }
  return { share: weightTotal === 0 ? null : weightHit / weightTotal,
    weight_hit: weightHit, weight_total: weightTotal, hit, missed };
}

/**
 * Whether this answer reads as a counter-question rather than an answer.
 * Conservative on purpose, and reported as a flag next to the numbers rather
 * than folded into them: both the length bound and the shape have to hold, so
 * a long answer that happens to end on a rhetorical question is not flagged,
 * and a question the author marked `expect_clarification: true` is never
 * flagged at all.
 */
export function looksLikeClarification(normalized, clarification) {
  if (normalized.length === 0) return false;
  if (normalized.length > clarification.max_chars) return false;
  if (/[?？]$/u.test(normalized)) return true;
  return clarification.patterns.some(matcher => matcher.test(normalized));
}

/**
 * One answer against one compiled question. `answerText` of `null` means no
 * answer was produced at all (an absent file, a command that failed); it
 * scores as every key missed, which is the honest reading -- the bot did not
 * say any of it -- and the caller marks the outcome separately so the reason
 * is never mistaken for a merely bad answer.
 */
export function scoreAnswer({ question, clarification, answerText = null, answerSha256 = null,
  answerTruncated = false, elapsedSeconds = null, toolCalls = null, outcome = 'answered', reason = null } = {}) {
  const present = typeof answerText === 'string';
  const normalized = present ? normalizeText(answerText) : '';
  const found = scoreGroup(question.must_find, normalized);
  const cited = scoreGroup(question.must_cite, normalized);
  const wrong = scoreGroup(question.must_not, normalized);
  const overTime = question.max_minutes !== null && elapsedSeconds !== null
    && elapsedSeconds > question.max_minutes * 60;
  const clarified = present && !question.expect_clarification && looksLikeClarification(normalized, clarification);
  return {
    question_id: question.id,
    outcome,
    reason,
    found: { share: found.share, weight_hit: found.weight_hit, weight_total: found.weight_total,
      hit_keys: found.hit, missed_keys: found.missed },
    cited: { share: cited.share, weight_hit: cited.weight_hit, weight_total: cited.weight_total,
      hit_keys: cited.hit, missed_keys: cited.missed },
    errors: { count: wrong.hit.length, keys: wrong.hit },
    flags: {
      clarification_instead_of_answer: clarified,
      expect_clarification: question.expect_clarification,
      over_time: overTime,
      answer_truncated: answerTruncated === true,
      answer_absent: !present,
    },
    elapsed_seconds: elapsedSeconds,
    tool_calls: toolCalls,
    max_minutes: question.max_minutes,
    answer_chars: present ? answerText.length : 0,
    answer_sha256: answerSha256,
  };
}

const meanOf = values => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length);

/** A run's totals. No blended score: the components stay separate on purpose. */
export function summarize(results) {
  const shares = key => results.map(row => row[key].share).filter(share => share !== null);
  return {
    questions: results.length,
    mean_found: meanOf(shares('found')),
    mean_cited: meanOf(shares('cited')),
    errors_total: results.reduce((sum, row) => sum + row.errors.count, 0),
    minutes_total: results.reduce((sum, row) => sum + (row.elapsed_seconds ?? 0), 0) / 60,
    tool_calls_total: results.some(row => row.tool_calls !== null)
      ? results.reduce((sum, row) => sum + (row.tool_calls ?? 0), 0) : null,
    over_time: results.filter(row => row.flags.over_time).length,
    clarifications: results.filter(row => row.flags.clarification_instead_of_answer).length,
    answers_absent: results.filter(row => row.flags.answer_absent).length,
    failed: results.filter(row => row.outcome === 'failed').length,
  };
}

// ------------------------------------------------------------ comparison
// Shares are floating point sums of weights; a delta smaller than this is the
// same number, not a change.
const EPSILON = 1e-9;
const shareDelta = (now, before) => (now === null || before === null ? null : now - before);

/**
 * What moved between two runs, question by question. A question present in
 * only one of the two runs is reported as added/removed and is never a
 * regression -- the sets being different is a fact about the runs, not about
 * the bot. A regression is: `found` down, `cited` down, or `errors` up.
 */
export function compareRuns(previous, current) {
  const before = new Map((previous?.results ?? []).map(row => [row.question_id, row]));
  const now = new Map((current?.results ?? []).map(row => [row.question_id, row]));
  const questions = [];
  for (const [id, row] of now) {
    const was = before.get(id) ?? null;
    if (was === null) { questions.push({ question_id: id, state: 'added', found_delta: null, cited_delta: null, errors_delta: null, regressed: false, newly_missed: [], newly_found: [] }); continue; }
    const foundDelta = shareDelta(row.found.share, was.found.share);
    const citedDelta = shareDelta(row.cited.share, was.cited.share);
    const errorsDelta = row.errors.count - was.errors.count;
    const wasHit = new Set([...was.found.hit_keys, ...was.cited.hit_keys]);
    const nowHit = new Set([...row.found.hit_keys, ...row.cited.hit_keys]);
    const nowMissed = [...row.found.missed_keys, ...row.cited.missed_keys];
    const wasMissed = [...was.found.missed_keys, ...was.cited.missed_keys];
    questions.push({
      question_id: id,
      state: 'compared',
      found_delta: foundDelta,
      cited_delta: citedDelta,
      errors_delta: errorsDelta,
      regressed: (foundDelta !== null && foundDelta < -EPSILON)
        || (citedDelta !== null && citedDelta < -EPSILON)
        || errorsDelta > 0,
      newly_missed: nowMissed.filter(key => wasHit.has(key)).sort(),
      newly_found: [...nowHit].filter(key => wasMissed.includes(key)).sort(),
    });
  }
  for (const id of before.keys()) {
    if (!now.has(id)) questions.push({ question_id: id, state: 'removed', found_delta: null, cited_delta: null, errors_delta: null, regressed: false, newly_missed: [], newly_found: [] });
  }
  questions.sort((a, b) => (a.question_id < b.question_id ? -1 : a.question_id > b.question_id ? 1 : 0));
  const totals = {
    mean_found_delta: shareDelta(current?.totals?.mean_found ?? null, previous?.totals?.mean_found ?? null),
    mean_cited_delta: shareDelta(current?.totals?.mean_cited ?? null, previous?.totals?.mean_cited ?? null),
    errors_delta: (current?.totals?.errors_total ?? 0) - (previous?.totals?.errors_total ?? 0),
    minutes_delta: (current?.totals?.minutes_total ?? 0) - (previous?.totals?.minutes_total ?? 0),
  };
  return { questions, totals, regressed: questions.some(row => row.regressed),
    previous_label: previous?.label ?? null, previous_started_at: previous?.started_at ?? null };
}

// ------------------------------------------------------------- ask command
const ASK_FIELDS = Object.freeze(['schema', 'argv', 'timeout_seconds', 'env', 'note']);
export const PROMPT_PLACEHOLDER = '{prompt_file}';
export const ANSWER_PLACEHOLDER = '{answer_file}';
export const MAX_ASK_TIMEOUT_SECONDS = 3600;
export const MAX_ASK_ARGV = 64;

/**
 * Validates an ask-command template. The harness never builds a shell string
 * out of this: `argv[0]` is the executable and the rest are argument vector
 * entries handed to `execFile` as an array, so nothing a question prompt
 * contains can become a command. The prompt never reaches the argument vector
 * at all -- `{prompt_file}` is replaced by the path of a temp file the
 * harness wrote it to.
 *
 * `env` is an allowlist of variable *names*; the harness copies those from
 * its own environment and passes nothing else, so a credential that happens
 * to be exported does not reach the bot unless someone named it here. Values
 * are never read, logged, or written to a receipt.
 */
export function validateAskCommand(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) fail('answer_eval_ask_command_not_an_object');
  for (const field of Object.keys(body)) {
    if (!ASK_FIELDS.includes(field)) fail('answer_eval_ask_command_field_unknown', field);
  }
  if (body.schema !== ANSWER_EVAL_ASK_COMMAND_SCHEMA) fail('answer_eval_ask_command_schema_unknown', String(body.schema));
  if (!Array.isArray(body.argv) || body.argv.length === 0) fail('answer_eval_ask_command_argv_empty');
  if (body.argv.length > MAX_ASK_ARGV) fail('answer_eval_ask_command_argv_too_long');
  if (body.argv.some(item => typeof item !== 'string' || item === '')) fail('answer_eval_ask_command_argv_invalid');
  if (!body.argv.some(item => item.includes(ANSWER_PLACEHOLDER))) fail('answer_eval_ask_command_answer_placeholder_missing');
  if (!body.argv.some(item => item.includes(PROMPT_PLACEHOLDER))) fail('answer_eval_ask_command_prompt_placeholder_missing');
  if (typeof body.timeout_seconds !== 'number' || !Number.isFinite(body.timeout_seconds)
    || body.timeout_seconds <= 0 || body.timeout_seconds > MAX_ASK_TIMEOUT_SECONDS) {
    fail('answer_eval_ask_command_timeout_invalid');
  }
  const env = body.env === undefined ? [] : body.env;
  if (!Array.isArray(env) || env.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))) {
    fail('answer_eval_ask_command_env_invalid');
  }
  return { schema: body.schema, argv: [...body.argv], timeout_seconds: body.timeout_seconds, env: [...env] };
}

/** `{prompt_file}` / `{answer_file}` substituted into one argument vector. */
export function resolveArgv(argv, { promptFile, answerFile }) {
  return argv.map(item => item.split(PROMPT_PLACEHOLDER).join(promptFile).split(ANSWER_PLACEHOLDER).join(answerFile));
}

export function validateLabel(label) {
  if (typeof label !== 'string' || !LABEL.test(label)) fail('answer_eval_label_invalid');
  return label;
}
