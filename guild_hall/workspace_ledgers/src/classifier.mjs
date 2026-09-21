// Pure mail-routing-rule classifier for the workspace ledgers module.
// Compiles `soulforge.project_mail_routing_rule.v0` rule JSON into matchers and
// classifies one mail record (subject/body_text/attachment_names) against a set of
// compiled rules. No filesystem access here -- `mail_events.mjs` and `rule_store.mjs`
// own I/O and call into this module.
import vm from 'node:vm';

export const RULE_SCHEMA_VERSION = 'soulforge.project_mail_routing_rule.v0';
// MATCH_FIELDS: every field NAME a rule's `match_fields` may legally name (schema
// validation only -- see `compileRule`'s `for (const field of matchFields)` check).
export const MATCH_FIELDS = Object.freeze(['subject', 'body_text', 'attachment_names']);
// K1 (coordinator, fresh review round 3 -- settles round 2's D-b/R1): step 1 (the
// project's own title/subject rule -- the one function's first classification step,
// shared by `refresh()` and the common pipeline, see `common_classifier.mjs`'s
// `classifyProjectHits`) matches the SUBJECT ONLY, full stop -- not merely "by
// default with an escape hatch". `DEFAULT_MATCH_FIELDS` is the one and only value
// `classifyProjectHits`'s, `refresh()`'s and `previewRule()`'s own `fields` param may
// ever hold; `assertSubjectOnlyFields` (below) throws
// `workspace_ledgers_fields_not_supported` for anything else, at each of those three
// entry points (and the CLI, which refuses `--fields all` before ever reaching the
// library). This is the behaviour that actually produced the real plane, and what
// the Owner approved: addresses, people and equipment names never decide a project on
// their own; body text is consulted only in step 4 (a supplier-type vendor mail whose
// body contains exactly one project's exact keyword -- a narrow, vendor-gated
// tie-break, never a general step-1 signal), and attachment names are not a step-1
// field at all.
//
// A rule document's own `match_fields` property (real, saved rules on the private
// plane still carry `["subject", "body_text", "attachment_names"]`) stays
// schema-valid -- `compileRule` still accepts and validates it, never rejects a rule
// for having one -- but it is NOT CONSULTED for ledger placement any more: since the
// caller-side `fields` restriction every match ultimately runs through is now always
// exactly `['subject']`, a rule's own broader `match_fields` can only ever intersect
// down to `['subject']` (or, in the pathological case of a rule that excludes
// 'subject' from its own `match_fields`, to nothing at all -- that rule's step 1 then
// never matches anything, which is the correct, honest consequence of declaring "this
// rule does not consider the subject", not a bug). No code path re-widens matching
// back out based on what a rule's own `match_fields` says.
export const DEFAULT_MATCH_FIELDS = Object.freeze(['subject']);

/**
 * `true` only when `fields` is, by VALUE (not reference -- a caller-constructed
 * literal array like `['subject']` must pass, not only the exported
 * `DEFAULT_MATCH_FIELDS` constant itself), exactly the one-element subject-only
 * array. Used by `classifyProjectHits`, `refresh()` and `previewRule()` (K1) to
 * refuse any other value outright, rather than silently widening or narrowing
 * matching to something the caller did not actually ask for.
 */
export function isSubjectOnlyFields(fields) {
  return Array.isArray(fields) && fields.length === 1 && fields[0] === 'subject';
}

export const FIELDS_NOT_SUPPORTED_CODE = 'workspace_ledgers_fields_not_supported';

/**
 * Throws `FIELDS_NOT_SUPPORTED_CODE` (an error carrying `.code`, no host-local data,
 * no rule content) when `fields` is not exactly `['subject']`. `fields` itself (an
 * array of short fixed field-name strings, never Owner-authored free text) is safe to
 * include in the thrown detail -- unlike a rule term's label, this is never real
 * project/company/person text.
 */
export function assertSubjectOnlyFields(fields) {
  if (isSubjectOnlyFields(fields)) return;
  const error = new Error(`${FIELDS_NOT_SUPPORTED_CODE}: ${JSON.stringify(fields)}`);
  error.name = 'FieldsNotSupportedError';
  error.code = FIELDS_NOT_SUPPORTED_CODE;
  throw error;
}
export const CONFLICT_POLICY = 'two_projects_exact_on_one_mail_means_hold_no_attribution';
export const SENDER_POLICY = 'hint_only';

// Bounds on a single term's regex, so a malformed or adversarial draft rule cannot
// compile into a pathologically expensive or unbounded matcher.
export const MAX_TERM_VALUE_LENGTH = 200;
export const MAX_REGEX_QUANTIFIERS = 20;
// A nested quantifier (`(a+)+`, `(.*)*`, `(\w+\s?)+`) and unbounded alternation are the
// classic ReDoS shapes; both are rejected outright rather than merely counted.
export const MAX_ALTERNATION_BRANCHES = 12;
// Only case-insensitivity is a meaningful knob for this module's matching; every other
// flag (`g`/`y` especially -- a stateful `lastIndex` shared across calls would silently
// corrupt matching for a term reused across many mails) is refused. `u` is always
// compiled in regardless of what the draft asked for.
export const ALLOWED_REGEX_FLAGS = Object.freeze(['', 'i', 'u', 'iu', 'ui']);
// `yields_to` may be one hand-over rule or several (e.g. a project that yields to
// different targets depending on which variant term shows up); a rule with more than
// this many hand-overs is almost certainly a mistake, not a real routing need.
export const MAX_YIELDS_TO_ENTRIES = 8;
// S11: a regex (and a literal `.includes`) still has to scan `body_text` in full
// otherwise; custody bodies can be arbitrarily large, so matching is bounded to a
// leading prefix. A mail whose routing keyword sits past this prefix is not matched on
// body text -- documented in README as a known limit, not silently unbounded.
export const MAX_BODY_TEXT_CHARS = 20000;
// Fresh-review-2 #2 / fresh-review-3 #3: the shape checks above (`hasNestedQuantifier`
// etc.) catch the textbook ReDoS shapes, but not every one -- `^(a|a)+$` has no nested
// quantifier and a tiny alternation, yet blows up catastrophically (an observed ~50s on
// a 31-char non-match). Shape-matching cannot enumerate every backtracking trap, so
// every regex term is additionally timed against canary inputs under a hard wall-clock
// budget at compile time (below). A plain JS loop cannot interrupt a runaway
// synchronous regex match; `node:vm`'s `timeout` option can, because it is backed by
// V8's own execution-interrupt mechanism.
export const REDOS_CANARY_BUDGET_MS = 200;
export const REDOS_CANARY_LENGTH = 40;
// fresh-review-3 #3: a single-alphabet ('a') canary misses a pattern whose danger only
// shows up in a different alphabet -- `^([가-힣]|[가-힣])+$` never even enters an ASCII
// canary's character class, so it never backtracks against one. Canaries are built from
// several baseline alphabets plus characters drawn from the pattern's own literals and
// character-class ranges (see `extractPatternChars`), capped so compile time stays
// bounded even for a term with many distinct characters.
export const MAX_CANARY_SEEDS = 8;

export class RuleCompileError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RuleCompileError';
    this.code = code;
    // S-8 (fresh-review-4): exposed as a field, not just folded into the message
    // string, so a caller compiling one rule at a time (to exclude only the failing
    // project rather than aborting every project's refresh) can report which term
    // failed without parsing it back out of `error.message`.
    this.detail = detail ?? null;
  }
}

const fail = (code, detail) => { throw new RuleCompileError(code, detail); };

function assertBoundedValue(value) {
  if (typeof value !== 'string' || value.length === 0) fail('workspace_ledgers_term_value_empty');
  if (value.length > MAX_TERM_VALUE_LENGTH) fail('workspace_ledgers_term_value_too_long');
}

function quantifierCount(source) {
  const matches = source.match(/[*+?]|\{\d+(?:,\d*)?\}/gu);
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------- regex safety scan
// These scans are deliberately simple (single left-to-right pass, escape-aware,
// character-class-aware) rather than a full regex parser: good enough to catch the
// shapes this module needs to reject, not a general regex analyser.

/** Index pairs of every `(...)` group in `source`, matching parens while skipping escaped parens and character classes. */
function findGroups(source) {
  const groups = [];
  const stack = [];
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') { index += 1; continue; }
    if (inClass) { if (char === ']') inClass = false; continue; }
    if (char === '[') { inClass = true; continue; }
    if (char === '(') { stack.push(index); continue; }
    if (char === ')') { const start = stack.pop(); if (start !== undefined) groups.push({ start, end: index }); }
  }
  return groups;
}

function quantifierAt(source, pos) {
  const char = source[pos];
  if (char === '*' || char === '+' || char === '?') return true;
  if (char === '{') return /^\{\d+(?:,\d*)?\}/u.test(source.slice(pos));
  return false;
}

/** True when some group is itself quantified (`(...)+` etc.) and its own body also contains a quantifier -- `(a+)+`, `(.*)*`, `(\w+\s?)+`. */
function hasNestedQuantifier(source) {
  return findGroups(source).some(group =>
    quantifierAt(source, group.end + 1) && quantifierCount(source.slice(group.start + 1, group.end)) > 0);
}

/** Count of top-level, non-class, unescaped `|` alternation separators. */
function unescapedPipeCount(source) {
  let count = 0;
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') { index += 1; continue; }
    if (inClass) { if (char === ']') inClass = false; continue; }
    if (char === '[') { inClass = true; continue; }
    if (char === '|') count += 1;
  }
  return count;
}

const BACKREFERENCE = /\\([1-9]\d*|k<)/u;
const LOOKBEHIND = /\(\?<[=!]/u;

// -------------------------------------------------------------- ReDoS timing canaries
const BASELINE_CANARY_SEEDS = Object.freeze(['a', '0', '가', ' ']);
const CANARY_MISMATCH_CANDIDATES = Object.freeze(['!', String.fromCharCode(0), String.fromCharCode(31), '☃']);

/**
 * Every "matchable-looking" character the pattern itself mentions: character-class
 * contents (ranges like `a-z`/`0-9`/`가-힣` expanded to their two endpoints, not every
 * codepoint between them -- endpoints alone are enough to enter the class in a canary),
 * plus plain literal characters outside any class or escape. Regex metacharacters are
 * excluded (they shape the pattern, they are not "content" a canary needs to contain).
 * Not a full regex parser -- a best-effort seed pool for canary construction.
 */
function extractPatternChars(source) {
  const chars = new Set();
  const classMatches = source.match(/\[[^\]]*\]/gu) ?? [];
  for (const cls of classMatches) {
    const inner = cls.startsWith('[^') ? cls.slice(2, -1) : cls.slice(1, -1);
    for (let index = 0; index < inner.length; index += 1) {
      if (inner[index] === '\\') { if (inner[index + 1] !== undefined) chars.add(inner[index + 1]); index += 1; continue; }
      if (inner[index + 1] === '-' && inner[index + 2] !== undefined && inner[index + 2] !== '\\') {
        chars.add(inner[index]); chars.add(inner[index + 2]); index += 2; continue;
      }
      chars.add(inner[index]);
    }
  }
  const withoutClasses = source.replace(/\[[^\]]*\]/gu, '');
  const METACHARACTERS = new Set(['\\', '^', '$', '.', '|', '?', '*', '+', '(', ')', '[', ']', '{', '}']);
  for (let index = 0; index < withoutClasses.length; index += 1) {
    const char = withoutClasses[index];
    if (char === '\\') { index += 1; continue; }
    if (!METACHARACTERS.has(char) && char.trim() !== '') chars.add(char);
  }
  return [...chars];
}

function pickMismatchChar(pool) {
  for (const candidate of CANARY_MISMATCH_CANDIDATES) if (!pool.has(candidate)) return candidate;
  return CANARY_MISMATCH_CANDIDATES[CANARY_MISMATCH_CANDIDATES.length - 1];
}

/**
 * Canary inputs designed to trigger catastrophic backtracking in a vulnerable pattern:
 * one uniform run per seed alphabet (baseline ASCII letter/digit/Hangul syllable/space,
 * plus up to `MAX_CANARY_SEEDS` characters drawn from the pattern's own literals/
 * classes), and one mixed-alphabet run (breaks a pattern keyed to a single repeated
 * character). Every canary ends in a character chosen not to be in the seed pool, so
 * none of them lets a well-formed routing-keyword regex match early.
 */
function redosCanaryInputs(source) {
  const seeds = new Set(BASELINE_CANARY_SEEDS);
  for (const char of extractPatternChars(source)) {
    if (seeds.size >= MAX_CANARY_SEEDS) break;
    seeds.add(char);
  }
  const mismatch = pickMismatchChar(seeds);
  const inputs = [...seeds].map(seed => `${seed.repeat(REDOS_CANARY_LENGTH)}${mismatch}`);
  const mixedSeeds = [...seeds].slice(0, 4);
  if (mixedSeeds.length > 1) {
    const mixed = Array.from({ length: REDOS_CANARY_LENGTH }, (unused, index) => mixedSeeds[index % mixedSeeds.length]).join('');
    inputs.push(`${mixed}${mismatch}`);
  }
  return inputs;
}

/**
 * Times `compiled.test(input)` for each canary input inside a fresh `vm` context with
 * a hard wall-clock `timeout` -- `vm`'s timeout is enforced by V8's execution-
 * interrupt mechanism, so (unlike a plain loop with a `Date.now()` check) it can
 * actually stop a runaway synchronous regex match mid-flight. Returns `true` only if
 * every canary finishes within budget; a timeout, or any other error, is treated as
 * unsafe.
 */
function isRegexTimingSafe(compiled, source) {
  for (const input of redosCanaryInputs(source)) {
    const sandbox = vm.createContext({ regex: compiled, input });
    try { vm.runInContext('regex.test(input)', sandbox, { timeout: REDOS_CANARY_BUDGET_MS }); }
    catch { return false; }
  }
  return true;
}

/**
 * Compiles one rule term ({label, kind:'literal'|'regex', value, flags?}) into a
 * matcher with a `test(text)` function. Literal terms match case-insensitively
 * (mirrors the `case_insensitive_literals: true` convention every rule declares) and
 * also carry `lowerValue` -- the classifier's hot path (`classifyMail`) matches
 * against a text already lowercased once per mail rather than calling `test` (which
 * lowercases its argument itself) once per term; `test` stays correct and self-
 * contained for direct/standalone callers such as this module's own tests.
 *
 * `timeSafety` (default `true`) runs the ReDoS timing canaries (fresh-review-3 #5):
 * left on for a *draft* being validated/previewed/saved, since that is exactly when a
 * bad pattern should be caught. `false` skips it -- used only when compiling an
 * already-saved, already-validated-at-save-time rule for `refresh()`, where a timing
 * check is *non-deterministic* validation of persisted state (a GC stall could turn a
 * genuinely safe saved rule into a spurious `timing_unsafe` failure).
 *
 * fresh-review-5 (design simplification): matching itself is no longer wrapped in a
 * per-mail `vm` timeout -- see `classifyMail`'s header comment for why. A saved rule
 * is trusted at `refresh()` time precisely because it already passed these canaries
 * (with `timeSafety: true`) the moment it was saved; nothing re-times it on the real
 * match path any more.
 */
export function compileTerm(term, { timeSafety = true } = {}) {
  if (!term || typeof term.label !== 'string' || term.label.trim() === '') {
    fail('workspace_ledgers_term_label_missing');
  }
  if (term.kind === 'literal') {
    assertBoundedValue(term.value);
    const needle = String(term.value).toLowerCase();
    return { label: term.label, kind: 'literal', value: term.value, lowerValue: needle, test: text => text.toLowerCase().includes(needle) };
  }
  if (term.kind === 'regex') {
    assertBoundedValue(term.value);
    const source = term.value;
    if (quantifierCount(source) > MAX_REGEX_QUANTIFIERS) fail('workspace_ledgers_term_regex_too_complex', term.label);
    if (hasNestedQuantifier(source)) fail('workspace_ledgers_term_regex_nested_quantifier', term.label);
    if (BACKREFERENCE.test(source)) fail('workspace_ledgers_term_regex_backreference', term.label);
    if (LOOKBEHIND.test(source)) fail('workspace_ledgers_term_regex_lookbehind', term.label);
    if (unescapedPipeCount(source) + 1 > MAX_ALTERNATION_BRANCHES) fail('workspace_ledgers_term_regex_too_many_alternations', term.label);
    const rawFlags = term.flags ?? '';
    if (!ALLOWED_REGEX_FLAGS.includes(rawFlags)) fail('workspace_ledgers_term_regex_flags_not_allowed', rawFlags);
    const flags = rawFlags.includes('u') ? rawFlags : `${rawFlags}u`;
    let compiled;
    try { compiled = new RegExp(source, flags); }
    catch (error) { fail('workspace_ledgers_term_regex_invalid', error.message); }
    if (timeSafety && !isRegexTimingSafe(compiled, source)) fail('workspace_ledgers_term_regex_timing_unsafe', term.label);
    return { label: term.label, kind: 'regex', value: source, flags, test: text => compiled.test(text) };
  }
  fail('workspace_ledgers_term_kind_unknown', String(term?.kind));
  return null; // unreachable, keeps linters happy about a missing return path
}

/** Compiles one rule JSON document (the shape saved by `rule_store.mjs`) into a matcher. `timeSafety` -- see `compileTerm`. */
export function compileRule(ruleJson, { timeSafety = true } = {}) {
  if (!ruleJson || ruleJson.schema_version !== RULE_SCHEMA_VERSION) fail('workspace_ledgers_rule_schema_mismatch');
  if (typeof ruleJson.project_code !== 'string' || ruleJson.project_code.trim() === '') {
    fail('workspace_ledgers_rule_project_code_missing');
  }
  // D-b: a rule document with no `match_fields` at all now defaults to subject-only
  // (`DEFAULT_MATCH_FIELDS`), not the full `MATCH_FIELDS` enum -- see that constant's
  // own doc. A rule that explicitly declares a broader `match_fields` still gets it
  // (still checked against the full `MATCH_FIELDS` enum below for a valid field name).
  const matchFields = Array.isArray(ruleJson.match_fields) && ruleJson.match_fields.length > 0
    ? ruleJson.match_fields : DEFAULT_MATCH_FIELDS;
  for (const field of matchFields) if (!MATCH_FIELDS.includes(field)) fail('workspace_ledgers_rule_match_field_unknown', field);
  const exact = Array.isArray(ruleJson.exact) ? ruleJson.exact.map(term => compileTerm(term, { timeSafety })) : [];
  if (exact.length === 0) fail('workspace_ledgers_rule_exact_empty');
  const hint = Array.isArray(ruleJson.hint) ? ruleJson.hint.map(term => compileTerm(term, { timeSafety })) : [];
  const labels = [...exact, ...hint].map(term => term.label);
  if (new Set(labels).size !== labels.length) fail('workspace_ledgers_rule_labels_not_unique');
  const yieldsTo = normalizeYieldsTo(ruleJson.yields_to).map(entry => {
    if (!entry || typeof entry.project_code !== 'string' || entry.project_code.trim() === '') {
      fail('workspace_ledgers_rule_yields_to_project_code_missing');
    }
    return { project_code: entry.project_code, when: compileTerm(entry.when, { timeSafety }) };
  });
  return {
    project_code: ruleJson.project_code,
    folder_name: ruleJson.folder_name ?? null,
    rule_version: ruleJson.rule_version ?? null,
    match_fields: matchFields,
    exact,
    hint,
    yields_to: yieldsTo,
  };
}

/**
 * `yields_to` accepts `null`/`undefined` (no hand-over), one hand-over object, or an
 * array of them -- older saved rules may still hold `null` or a single object, newer
 * ones always hold an array. Normalises any of those into an array (possibly empty),
 * capped at `MAX_YIELDS_TO_ENTRIES`. Entries are returned as-is (not compiled).
 */
export function normalizeYieldsTo(raw) {
  if (raw === null || raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length > MAX_YIELDS_TO_ENTRIES) fail('workspace_ledgers_rule_yields_to_too_many');
  return list;
}

/** `timeSafety` -- see `compileTerm`; propagated to every rule/term compiled. */
export function compileRules(ruleJsonList, { timeSafety = true } = {}) {
  return ruleJsonList.map(ruleJson => compileRule(ruleJson, { timeSafety }));
}

// N-2 (fresh-review-4): `subject` and the joined attachment-names text were unbounded
// -- a 100k-character subject (malformed custody, or an adversarial one) costs exactly
// the same matching time a body that long would, even though S11 already bounded
// body_text for this exact reason. All three fields now share the same bound; this is
// what actually keeps a single match cheap now that matching is a direct, untimed call.
function fieldText(mail, field) {
  if (field === 'subject') return String(mail.subject ?? '').slice(0, MAX_BODY_TEXT_CHARS);
  if (field === 'body_text') return String(mail.body_text ?? '').slice(0, MAX_BODY_TEXT_CHARS);
  if (field === 'attachment_names') {
    return (Array.isArray(mail.attachment_names) ? mail.attachment_names.join('\n') : '').slice(0, MAX_BODY_TEXT_CHARS);
  }
  return '';
}

/**
 * One mail's field text, computed and lowercased at most once per unique field
 * combination (almost always once total, since every rule in practice declares the
 * same three `match_fields`) rather than once per term (S11). `cache` is scoped to a
 * single `classifyMail`/`hintCodes` call -- never shared across mails.
 */
function textEntryFor(mail, rule, fields, cache) {
  const effective = rule.match_fields.filter(field => fields.includes(field));
  const key = effective.join('|');
  let entry = cache.get(key);
  if (!entry) {
    const raw = effective.map(field => fieldText(mail, field)).join('\n');
    entry = { raw, lower: raw.toLowerCase() };
    cache.set(key, entry);
  }
  return entry;
}

/** Matches one compiled term against a cached text entry without re-lowercasing a literal's needle text per call. */
function termMatchesEntry(term, entry) {
  return term.kind === 'literal' ? entry.lower.includes(term.lowerValue) : term.test(entry.raw);
}

/**
 * Classifies one mail ({subject, body_text, attachment_names}) against compiled rules.
 * `fields` restricts which of a rule's own `match_fields` are actually consulted --
 * `{fields: ['subject']}` reproduces subject-only routing numbers even for a rule
 * whose JSON declares body_text/attachment_names too.
 *
 * A rule with any `yields_to` entry whose `when` matches the same text is skipped
 * entirely for that mail (the mail belongs to that hand-over target instead, or to
 * nothing if the target's own rule does not also match). Exactly one matching exact
 * term per rule counts as a hit for that project, using the first term (in declaration
 * order) that matches -- mirrors the behavioural reference script's
 * `Array.prototype.find`. `held` is true when more than one project's rule produced a
 * hit: two projects' exact triggers on one mail means hold, never automatic
 * attribution.
 *
 * fresh-review-5 (design simplification, coordinator decision): matching is a direct
 * call, not wrapped in a per-mail `vm` timeout. Three review rounds (fresh-review-3/4/5)
 * of that machinery kept producing worse failure modes than the ReDoS risk it guarded
 * against on the real match path -- a wall-clock interruption on one project's term
 * could delete an unrelated project's ledger row (and any Owner cell on it), which is
 * a strictly worse outcome for this loopback, Owner-only tool than a slow refresh
 * would ever be. The defences that stay, and are deterministic rather than timing-
 * dependent: `compileTerm`'s static regex shape checks (nested quantifiers,
 * backreferences, lookbehind, alternation cap, flag whitelist) always apply; the
 * multi-alphabet canary timing (`isRegexTimingSafe`) still runs, but only when a draft
 * is being validated (`validateRule`, `previewRule`'s draft, `saveRuleVersion`) --
 * never against already-saved, already-trusted state, and never on the real per-mail
 * match path. `MAX_BODY_TEXT_CHARS` still bounds `subject`/`body_text`/
 * `attachment_names` at both read time (`mail_events.mjs`) and match time (`fieldText`
 * above), which is what actually keeps a single match cheap.
 */
export function classifyMail(mail, compiledRules, { fields = DEFAULT_MATCH_FIELDS } = {}) {
  const textCache = new Map();
  const hits = [];
  for (const rule of compiledRules) {
    const entry = textEntryFor(mail, rule, fields, textCache);
    if (rule.yields_to.some(handover => termMatchesEntry(handover.when, entry))) continue;
    const matchedTerm = rule.exact.find(term => termMatchesEntry(term, entry));
    if (matchedTerm) hits.push({ project_code: rule.project_code, folder_name: rule.folder_name, label: matchedTerm.label });
  }
  return { hits, held: hits.length > 1 };
}

/**
 * Project codes whose hint terms matched but whose exact terms did not (and which
 * are not already an exact hit) -- review-only signal, never used for attribution.
 */
export function hintCodes(mail, compiledRules, { fields = DEFAULT_MATCH_FIELDS } = {}) {
  const { hits } = classifyMail(mail, compiledRules, { fields });
  const exactCodes = new Set(hits.map(hit => hit.project_code));
  const textCache = new Map();
  const codes = [];
  for (const rule of compiledRules) {
    if (exactCodes.has(rule.project_code)) continue;
    const entry = textEntryFor(mail, rule, fields, textCache);
    if (rule.hint.some(term => termMatchesEntry(term, entry))) codes.push(rule.project_code);
  }
  return codes;
}
