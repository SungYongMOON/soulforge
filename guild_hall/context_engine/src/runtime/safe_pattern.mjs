// Compile-time safety scan for a hand-written regular expression, local to
// the context engine.
//
// Why a local copy rather than an import: `guild_hall/workspace_ledgers/src/
// classifier.mjs` has the same scan, and reusing it was the first shape of
// this module. But both built lanes that carry the context engine
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
// What it refuses, and why each one: a pattern here is typed by hand into a
// question set and then run against every answer, so a pathological pattern is
// a hang, not a wrong number.
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
// Shape scanning cannot enumerate every backtracking trap -- `^(a|a)+$` has no
// nested quantifier and two branches, and still explodes -- so a compiled
// pattern is additionally timed against canary inputs under a hard wall-clock
// budget, using `node:vm`'s `timeout`, which is backed by V8's execution
// interrupt and therefore *can* stop a runaway synchronous match (a plain JS
// timer cannot). That canary runs once, at compile time. Nothing on the
// measured path -- `matcher.test(text)` while scoring an answer -- ever enters
// `vm`.
import vm from 'node:vm';

export const MAX_PATTERN_SOURCE_CHARS = 200;
export const MAX_QUANTIFIERS = 20;
export const MAX_ALTERNATION_BRANCHES = 12;
export const ALLOWED_FLAGS = Object.freeze(['', 'i', 'u', 'iu', 'ui']);
export const CANARY_BUDGET_MS = 200;
export const CANARY_LENGTH = 40;
// A single-alphabet canary misses a pattern whose danger only appears in
// another script -- `^([가-힣]|[가-힣])+$` never enters an ASCII canary's
// character class, so it never backtracks against one. Canaries are built
// from a few baseline alphabets plus characters taken from the pattern's own
// literals, capped so compile time stays bounded.
export const MAX_CANARY_SEEDS = 8;

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

/** Literal characters the pattern itself mentions, so a canary can be built from its own alphabet. */
function patternChars(source) {
  const chars = new Set();
  for (let index = 0; index < source.length && chars.size < MAX_CANARY_SEEDS; index += 1) {
    const char = source[index];
    if (char === '\\') { index += 1; continue; }
    if (/[\p{L}\p{N}]/u.test(char)) chars.add(char);
  }
  return [...chars];
}

/**
 * Times the compiled pattern against canary inputs that are long, repetitive
 * and (usually) non-matching -- the shape that makes a backtracking pattern
 * explode. `vm.runInContext`'s `timeout` is the only thing in Node that can
 * actually interrupt a runaway synchronous match. Returns false when any
 * canary blew the budget.
 */
export function isTimingSafe(compiled, source) {
  const seeds = ['a', '0', ' ', '가', ...patternChars(source)].slice(0, MAX_CANARY_SEEDS);
  for (const seed of seeds) {
    // A tail no realistic key pattern matches, so the canary is a *non*-match
    // and the pattern has to do its worst backtracking to find that out. Built
    // at runtime rather than written as an escape: an editor or a tool that
    // resolves the escape would put a real NUL byte in this source file, which
    // makes it binary to git and invisible to the byte-scanning validators.
    const input = seed.repeat(CANARY_LENGTH) + String.fromCharCode(0);
    const sandbox = vm.createContext({ regex: new RegExp(compiled.source, compiled.flags), input });
    try { vm.runInContext('regex.test(input)', sandbox, { timeout: CANARY_BUDGET_MS }); }
    catch { return false; }
  }
  return true;
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
