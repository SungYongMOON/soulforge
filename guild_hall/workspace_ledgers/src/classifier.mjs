// Pure mail-routing-rule classifier for the workspace ledgers module.
// Compiles `soulforge.project_mail_routing_rule.v0` rule JSON into matchers and
// classifies one mail record (subject/body_text/attachment_names) against a set of
// compiled rules. No filesystem access here -- `mail_events.mjs` and `rule_store.mjs`
// own I/O and call into this module.

export const RULE_SCHEMA_VERSION = 'soulforge.project_mail_routing_rule.v0';
export const MATCH_FIELDS = Object.freeze(['subject', 'body_text', 'attachment_names']);
export const CONFLICT_POLICY = 'two_projects_exact_on_one_mail_means_hold_no_attribution';
export const SENDER_POLICY = 'hint_only';

// Bounds on a single term's regex, so a malformed or adversarial draft rule cannot
// compile into a pathologically expensive or unbounded matcher.
export const MAX_TERM_VALUE_LENGTH = 200;
export const MAX_REGEX_QUANTIFIERS = 20;
// `yields_to` may be one hand-over rule or several (e.g. a project that yields to
// different targets depending on which variant term shows up); a rule with more than
// this many hand-overs is almost certainly a mistake, not a real routing need.
export const MAX_YIELDS_TO_ENTRIES = 8;

export class RuleCompileError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RuleCompileError';
    this.code = code;
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

/**
 * Compiles one rule term ({label, kind:'literal'|'regex', value, flags?}) into a
 * matcher with a `test(text)` function. Literal terms match case-insensitively
 * (mirrors the `case_insensitive_literals: true` convention every rule declares).
 */
export function compileTerm(term) {
  if (!term || typeof term.label !== 'string' || term.label.trim() === '') {
    fail('workspace_ledgers_term_label_missing');
  }
  if (term.kind === 'literal') {
    assertBoundedValue(term.value);
    const needle = String(term.value).toLowerCase();
    return { label: term.label, kind: 'literal', value: term.value, test: text => text.toLowerCase().includes(needle) };
  }
  if (term.kind === 'regex') {
    assertBoundedValue(term.value);
    if (quantifierCount(term.value) > MAX_REGEX_QUANTIFIERS) fail('workspace_ledgers_term_regex_too_complex', term.label);
    let compiled;
    try { compiled = new RegExp(term.value, term.flags ?? 'u'); }
    catch (error) { fail('workspace_ledgers_term_regex_invalid', error.message); }
    return { label: term.label, kind: 'regex', value: term.value, flags: term.flags ?? 'u', test: text => compiled.test(text) };
  }
  fail('workspace_ledgers_term_kind_unknown', String(term?.kind));
  return null; // unreachable, keeps linters happy about a missing return path
}

/** Compiles one rule JSON document (the shape saved by `rule_store.mjs`) into a matcher. */
export function compileRule(ruleJson) {
  if (!ruleJson || ruleJson.schema_version !== RULE_SCHEMA_VERSION) fail('workspace_ledgers_rule_schema_mismatch');
  if (typeof ruleJson.project_code !== 'string' || ruleJson.project_code.trim() === '') {
    fail('workspace_ledgers_rule_project_code_missing');
  }
  const matchFields = Array.isArray(ruleJson.match_fields) && ruleJson.match_fields.length > 0
    ? ruleJson.match_fields : MATCH_FIELDS;
  for (const field of matchFields) if (!MATCH_FIELDS.includes(field)) fail('workspace_ledgers_rule_match_field_unknown', field);
  const exact = Array.isArray(ruleJson.exact) ? ruleJson.exact.map(compileTerm) : [];
  if (exact.length === 0) fail('workspace_ledgers_rule_exact_empty');
  const hint = Array.isArray(ruleJson.hint) ? ruleJson.hint.map(compileTerm) : [];
  const labels = [...exact, ...hint].map(term => term.label);
  if (new Set(labels).size !== labels.length) fail('workspace_ledgers_rule_labels_not_unique');
  const yieldsTo = normalizeYieldsTo(ruleJson.yields_to).map(entry => {
    if (!entry || typeof entry.project_code !== 'string' || entry.project_code.trim() === '') {
      fail('workspace_ledgers_rule_yields_to_project_code_missing');
    }
    return { project_code: entry.project_code, when: compileTerm(entry.when) };
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

export function compileRules(ruleJsonList) {
  return ruleJsonList.map(compileRule);
}

function fieldText(mail, field) {
  if (field === 'subject') return String(mail.subject ?? '');
  if (field === 'body_text') return String(mail.body_text ?? '');
  if (field === 'attachment_names') return Array.isArray(mail.attachment_names) ? mail.attachment_names.join('\n') : '';
  return '';
}

function ruleText(mail, rule, fields) {
  const effective = rule.match_fields.filter(field => fields.includes(field));
  return effective.map(field => fieldText(mail, field)).join('\n');
}

/**
 * Classifies one mail ({subject, body_text, attachment_names}) against compiled rules.
 * `fields` restricts which of a rule's own `match_fields` are actually consulted --
 * `{fields: ['subject']}` reproduces subject-only routing numbers even for a rule
 * whose JSON declares body_text/attachment_names too.
 *
 * A rule with any `yields_to` entry whose `when` matches the same text is skipped
 * entirely for that mail (the mail belongs to that hand-over target instead, or to
 * nothing if the target's own rule does not also match). Exactly one matching exact term per rule
 * counts as a hit for that project, using the first term (in declaration order) that
 * matches -- mirrors the behavioural reference script's `Array.prototype.find`.
 * `held` is true when more than one project's rule produced a hit: two projects'
 * exact triggers on one mail means hold, never automatic attribution.
 */
export function classifyMail(mail, compiledRules, { fields = MATCH_FIELDS } = {}) {
  const hits = [];
  for (const rule of compiledRules) {
    const text = ruleText(mail, rule, fields);
    if (rule.yields_to.some(entry => entry.when.test(text))) continue;
    const matchedTerm = rule.exact.find(term => term.test(text));
    if (matchedTerm) hits.push({ project_code: rule.project_code, folder_name: rule.folder_name, label: matchedTerm.label });
  }
  return { hits, held: hits.length > 1 };
}

/**
 * Project codes whose hint terms matched but whose exact terms did not (and which
 * are not already an exact hit) -- review-only signal, never used for attribution.
 */
export function hintCodes(mail, compiledRules, { fields = MATCH_FIELDS } = {}) {
  const { hits } = classifyMail(mail, compiledRules, { fields });
  const exactCodes = new Set(hits.map(hit => hit.project_code));
  const codes = [];
  for (const rule of compiledRules) {
    if (exactCodes.has(rule.project_code)) continue;
    const text = ruleText(mail, rule, fields);
    if (rule.hint.some(term => term.test(text))) codes.push(rule.project_code);
  }
  return codes;
}
