// Compile-time safety scan for a hand-written regular expression, plus a
// bounded way to run one, local to the context engine.
//
// Why a local copy rather than an import: `guild_hall/workspace_ledgers/src/
// classifier.mjs` has a scan of the same shape, and reusing it was the first
// version of this module. But both built lanes that carry the context engine
// (`guild_hall/deployment_pack/lanes/context_read_lane.spec.json` and
// `graph_sync_lane.spec.json`) take `guild_hall/context_engine/` wholesale and
// do NOT carry `guild_hall/workspace_ledgers/`, so a cross-module import makes
// the harness throw `ERR_MODULE_NOT_FOUND` inside a built lane while passing
// every test in the repo. The lane spec's own description promises the import
// closure stays inside `tracked_paths`; this module keeps that promise. The
// workspace_ledgers copy stays where it is -- it is that module's own contract
// and is not moved or changed by this file existing.
// `tests/answer_eval.test.mjs` builds a scratch tree from each lane spec's
// tracked paths and imports the harness there, so this class of break is
// caught rather than reasoned about.
//
// ---------------------------------------------------------------------------
// THE SCAN IS A FILTER, NOT A GUARANTEE. This is the important sentence in the
// file. Deciding whether an arbitrary regular expression backtracks
// catastrophically is not something a shape scan and a handful of probe
// strings can settle; every check below is a net with known holes. The first
// version of this module proved it: it accepted `(ab|a|b)+z`, which has no
// nested quantifier, three alternation branches and two quantifiers, and whose
// `test()` against `'ab'.repeat(30) + '!'` does not finish in 25 seconds. The
// canary missed it because every canary string was one character repeated, and
// that pattern only explodes on a *two*-character repeat.
//
// So there are two layers, and the second one is the one that actually holds:
//   1. compile time -- refuse the shapes we can name, and time the compiled
//      pattern against canaries built from its own alphabet. Cheap, catches
//      the common cases, provably incomplete.
//   2. run time -- `runBounded` runs every match under a hard wall-clock
//      timeout, so a pattern that got through layer 1 costs one budget and
//      then reports itself, instead of hanging the run.
// Never delete layer 2 because layer 1 got better.
// ---------------------------------------------------------------------------
//
// What the scan refuses, and why: a pattern here is typed by hand into a
// question set and then run against every answer, so a pathological one is a
// hang, not a wrong number.
//   - longer than MAX_PATTERN_SOURCE_CHARS (a pasted blob, not a key),
//   - more than MAX_QUANTIFIERS (the same),
//   - a nested quantifier -- `(a+)+`, `(.*)*`, `(\w+\s?)+` -- the textbook
//     catastrophic-backtracking shape,
//   - a backreference or a lookbehind (both can backtrack badly and neither
//     has a use in a containment key),
//   - more than MAX_ALTERNATION_BRANCHES top-level `|` branches,
//   - any flag other than `i`/`u`. `g` and `y` especially: a shared
//     `lastIndex` across calls would silently corrupt matching for a pattern
//     reused across many answers.
//
// `node:vm`'s `timeout` is what makes both layers possible: it is backed by
// V8's execution interrupt, so it can stop a runaway synchronous match. A
// plain JS timer cannot -- nothing else in the event loop runs while the regex
// engine is backtracking.
import vm from 'node:vm';

export const MAX_PATTERN_SOURCE_CHARS = 200;
export const MAX_QUANTIFIERS = 20;
export const MAX_ALTERNATION_BRANCHES = 12;
export const ALLOWED_FLAGS = Object.freeze(['', 'i', 'u', 'iu', 'ui']);
// One second, not the 200ms this started with: CI runs on a shared runner
// where a 200ms budget is a coin flip on a GC pause, and a validator that
// fails at random teaches people to re-run it rather than read it. A canary
// that blows the budget is also retried once before the pattern is refused,
// for the same reason -- a genuinely exponential pattern blows both.
export const CANARY_BUDGET_MS = 1000;
export const CANARY_RETRIES = 1;
// Canary strings are this many *seeds* long, not characters, so a two- or
// three-character seed still produces a long input. 120 repeats of `ab` is
// 240 characters, which is far past where an exponential pattern gives up.
export const CANARY_LENGTH = 120;
// The budget one `runBounded` match gets. Generous: a sane pattern against a
// one-megabyte answer is microseconds, and the only thing that reaches this
// number is a pattern that should not have compiled.
export const MATCH_BUDGET_MS = 1000;
export const MAX_CANARY_SEEDS = 16;
// How many distinct literal characters get combined into multi-character
// seeds. Combinations grow fast, and the seed list is capped anyway.
const MAX_COMBINATION_CHARS = 4;

const BACKREFERENCE = /\\[1-9]|\\k<[^>]*>/u;
const LOOKBEHIND = /\(\?<[=!]/u;

export class SafePatternError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SafePatternError';
    this.code = code;
    this.detail = detail ?? null;
  }
}

/** Thrown by `runBounded` when one match blew its wall-clock budget. */
export class PatternTimeoutError extends Error {
  constructor(detail) {
    super(detail ? `pattern_timeout: ${detail}` : 'pattern_timeout');
    this.name = 'PatternTimeoutError';
    this.code = 'pattern_timeout';
    this.detail = detail ?? null;
  }
}

const fail = (code, detail) => { throw new SafePatternError(code, detail); };

/**
 * A single left-to-right, escape-aware, character-class-aware pass -- good
 * enough to catch the shapes this module refuses, deliberately not a general
 * regex parser.
 */
function scan(source, onChar) {
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') { index += 1; continue; }
    if (inClass) { if (char === ']') inClass = false; continue; }
    if (char === '[') { inClass = true; continue; }
    onChar(char, index);
  }
}

/**
 * How many quantifiers the source contains. Deliberately crude: it also counts
 * the `?` inside a non-capturing group `(?:`, a lookahead `(?=`, and a lazy
 * `+?`, so the number runs a little high. That errs toward refusing a pattern
 * that is merely ornate, which for a hand-written containment key is the right
 * direction, and it keeps this a scan rather than a parser.
 */
export function quantifierCount(source) {
  const matches = source.match(/[*+?]|\{\d+(?:,\d*)?\}/gu);
  return matches ? matches.length : 0;
}

function quantifierAt(source, position) {
  const char = source[position];
  if (char === '*' || char === '+' || char === '?') return true;
  if (char === '{') return /^\{\d+(?:,\d*)?\}/u.test(source.slice(position));
  return false;
}

/** Index pairs of every `(...)` group, skipping escaped parens and character classes. */
function findGroups(source) {
  const groups = [];
  const stack = [];
  scan(source, (char, index) => {
    if (char === '(') stack.push(index);
    else if (char === ')') { const start = stack.pop(); if (start !== undefined) groups.push({ start, end: index }); }
  });
  return groups;
}

/** True when some group is itself quantified and its own body also contains a quantifier. */
export function hasNestedQuantifier(source) {
  return findGroups(source).some(group =>
    quantifierAt(source, group.end + 1) && quantifierCount(source.slice(group.start + 1, group.end)) > 0);
}

/** Count of unescaped, non-class `|` separators. */
export function alternationBranches(source) {
  let count = 0;
  scan(source, char => { if (char === '|') count += 1; });
  return count + 1;
}

const METACHARACTER = /[.*+?^$()[\]{}|\\/]/u;

/**
 * Runs of ordinary literal characters in the source, longest first. For
 * `(ab|a|b)+z` these are `ab`, `a`, `b`, `z` -- and `ab` is the one that
 * matters, because the pattern only explodes when the input repeats a *pair*.
 * Alternation branches are what produce multi-character runs, which is exactly
 * why they are read here and not just counted above.
 */
export function literalRuns(source) {
  const runs = [];
  let current = '';
  const flush = () => { if (current.length > 0) runs.push(current); current = ''; };
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') { index += 1; flush(); continue; }
    if (inClass) { if (char === ']') inClass = false; continue; }
    if (char === '[') { inClass = true; flush(); continue; }
    // A counted quantifier's own digits are not literal text -- without this,
    // `\d{4}-\d{2}` would seed canaries with "4" and "2", crowding out the
    // seeds that mean something out of the capped list.
    if (char === '{') {
      const counted = /^\{\d+(?:,\d*)?\}/u.exec(source.slice(index));
      flush();
      if (counted) index += counted[0].length - 1;
      continue;
    }
    if (METACHARACTER.test(char)) { flush(); continue; }
    current += char;
  }
  flush();
  return [...new Set(runs)].sort((a, b) => b.length - a.length);
}

/**
 * The strings one pattern is probed with. Three sources, in order of how often
 * they are the one that catches something:
 *   - the pattern's own literal runs (`ab` from `(ab|a|b)+z`),
 *   - short ordered combinations of its literal characters, for a pattern
 *     whose dangerous repeat is not spelled out as a run (`(a|b)(b|a)` style),
 *   - a few baseline alphabets, so a pattern made only of classes (`\w`,
 *     `[가-힣]`) still gets probed in the script it actually matches.
 */
export function canarySeeds(source) {
  const seeds = [];
  const add = value => { if (value && !seeds.includes(value)) seeds.push(value); };
  for (const run of literalRuns(source)) add(run.slice(0, 3));
  const chars = [...new Set(literalRuns(source).join(''))].slice(0, MAX_COMBINATION_CHARS);
  for (const first of chars) for (const second of chars) add(first + second);
  for (const first of chars) for (const second of chars) add(`${first}${second}${first}`);
  for (const baseline of ['a', '0', ' ', '가', 'ab', 'a0']) add(baseline);
  return seeds.slice(0, MAX_CANARY_SEEDS);
}

/**
 * Times the compiled pattern against canary inputs that are long, repetitive
 * and (usually) non-matching -- the shape that makes a backtracking pattern
 * explode. One `vm` context is reused across seeds; only `input` changes.
 * Returns false when some canary blew the budget twice.
 */
export function isTimingSafe(compiled, source) {
  const sandbox = vm.createContext({ regex: new RegExp(compiled.source, compiled.flags), input: '' });
  const script = new vm.Script('regex.test(input)');
  for (const seed of canarySeeds(source)) {
    // A tail no realistic key pattern matches, so the canary is a *non*-match
    // and the pattern has to do its worst backtracking to find that out. Built
    // at runtime rather than written as an escape: an editor or a tool that
    // resolves the escape would put a real NUL byte in this source file, which
    // makes it binary to git and invisible to the byte-scanning validators.
    sandbox.input = seed.repeat(CANARY_LENGTH) + String.fromCharCode(0);
    let blown = true;
    for (let attempt = 0; attempt <= CANARY_RETRIES && blown; attempt += 1) {
      try { script.runInContext(sandbox, { timeout: CANARY_BUDGET_MS }); blown = false; }
      catch { blown = true; }
    }
    if (blown) return false;
  }
  return true;
}

/**
 * One compiled pattern plus the bounded way to run it. `test(text)` returns a
 * boolean, or throws `PatternTimeoutError` when that single match blew
 * `MATCH_BUDGET_MS`. Layer 2 of the two layers in this file's header: the
 * compile-time scan is incomplete by nature, so no match ever runs
 * unbounded, whatever the scan concluded.
 *
 * The `vm` context is built once here, not per call, and only `input` moves
 * across it -- a context per answer per key would cost more than the matching.
 * Nothing in the answer text can affect the sandbox: it is assigned as a
 * string property, never compiled or interpolated.
 */
export function boundedMatcher(compiled, { label = 'pattern', budgetMs = MATCH_BUDGET_MS } = {}) {
  const sandbox = vm.createContext({ regex: new RegExp(compiled.source, compiled.flags), input: '' });
  const script = new vm.Script('regex.test(input)');
  return text => {
    sandbox.input = String(text);
    try { return script.runInContext(sandbox, { timeout: budgetMs }) === true; }
    catch (error) {
      if (error instanceof SafePatternError) throw error;
      throw new PatternTimeoutError(label);
    }
  };
}

/**
 * Compiles one pattern source, or throws a `SafePatternError` naming which
 * rule it broke. `u` is always compiled in. `timeSafety` (default on) runs the
 * canaries; it exists so a caller re-compiling something already accepted once
 * can skip a check that is, by nature, non-deterministic under a GC stall.
 */
export function compileSafePattern(source, flags = '', { timeSafety = true, label = 'pattern' } = {}) {
  if (typeof source !== 'string' || source === '') fail('safe_pattern_empty', label);
  if (source.length > MAX_PATTERN_SOURCE_CHARS) fail('safe_pattern_too_long', label);
  if (quantifierCount(source) > MAX_QUANTIFIERS) fail('safe_pattern_too_complex', label);
  if (hasNestedQuantifier(source)) fail('safe_pattern_nested_quantifier', label);
  if (BACKREFERENCE.test(source)) fail('safe_pattern_backreference', label);
  if (LOOKBEHIND.test(source)) fail('safe_pattern_lookbehind', label);
  if (alternationBranches(source) > MAX_ALTERNATION_BRANCHES) fail('safe_pattern_too_many_alternations', label);
  if (!ALLOWED_FLAGS.includes(flags)) fail('safe_pattern_flags_not_allowed', flags);
  const effective = flags.includes('u') ? flags : `${flags}u`;
  let compiled;
  try { compiled = new RegExp(source, effective); }
  catch (error) { fail('safe_pattern_invalid', error.message); }
  if (timeSafety && !isTimingSafe(compiled, source)) fail('safe_pattern_timing_unsafe', label);
  return compiled;
}
