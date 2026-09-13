// Rule R1: what connects two records that share no identifier and no link.
//
// A local model reads one pair of units at a time and answers in the profile's
// shape. Nothing it says becomes an edge on its own. This module does three
// separate things and reports them separately, because they are three different
// claims: it asks (the model's answer), it checks (does this view hold both units,
// and is each quote actually in the unit it names), and it decides what may be
// offered to the graph (only the two linkable kinds, only when both checks pass).
//
// The judgement is an inference and is recorded as one: the edge it leads to
// carries the rule, this profile's prompt digest, the model and its pin, the two
// units the quotes came from, claim_state `inferred` and review_state `unreviewed`.
// A model's own confidence is never read, and a relation is never upgraded into
// something a source said.
//
// Nothing here writes to a database, builds Cypher, or lets the model choose what
// to write: the caller passes the result to graph_database.linkRelatedEvidence,
// which checks the pairs again against the manifest before the worker sees them.
import { createHash } from 'node:crypto';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { createLocalChat, installedModelDigest, loopbackFetch, validateChatBinding } from '../adapters/local_model/ollama_chat.mjs';
import { LINKABLE_RELATION_KINDS, RELATION_JUDGEMENT_PROFILE } from '../../profiles/relation_judgement_v1.mjs';

export const RELATED_EVIDENCE_RULE = 'R1-local-judgement';
// How much of a unit the model is shown, and how many units either side of it come
// with it. A neighbour is context for reading "that test" or "the previous
// condition"; it is never a place a quote may come from.
const MAX_UNIT_CHARACTERS = 6000;
const NEIGHBOUR_CHARACTERS = 600;
const MAX_PAIRS = 24;
const sha = text => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

export class RelationJudgementError extends Error {
  constructor(code) { super(code); this.name = 'RelationJudgementError'; this.code = code; }
}
const fail = code => { throw new RelationJudgementError(code); };

// The prompt and the answer shape together: an edge names this, so a relation made
// under one wording is never read as one made under another.
export function relationPromptSha256(profile = RELATION_JUDGEMENT_PROFILE) {
  return sha256Canonical({ profile_id: profile.profile_id, profile_version: profile.profile_version,
    prompt: profile.prompt, schema: profile.schema });
}

// Whitespace is the one difference a quote is allowed to have: a model that
// re-wraps a line has still quoted the text, while one that paraphrases has not.
const collapsed = text => text.replace(/\s+/gu, ' ').trim();

export function quoteMatch(quote, text) {
  if (typeof quote !== 'string' || !quote.trim() || typeof text !== 'string') return 'not_found';
  if (text.includes(quote)) return 'exact';
  if (collapsed(text).includes(collapsed(quote))) return 'whitespace_normalised';
  return 'not_found';
}

// One unit as the model sees it: what it is, when, and just enough of what sits
// around it to read a pronoun. Neighbours are labelled and clipped so they cannot
// be mistaken for the unit itself.
export function unitContext(view, docKey, unitId) {
  const row = view.manifest.documents.find(item => item.doc_key === docKey) ?? fail('relation_unit_unknown');
  const document = view.readDocument(docKey);
  const index = document.units.findIndex(unit => unit.unit_id === unitId);
  if (index < 0) fail('relation_unit_unknown');
  const unit = document.units[index];
  const neighbour = offset => {
    const other = document.units[index + offset];
    return other ? { unit_id: other.unit_id, unit_kind: other.unit_kind, occurred_at: other.occurred_at,
      text: [...other.text].slice(0, NEIGHBOUR_CHARACTERS).join('') } : null;
  };
  return { source_kind: row.source_kind, item_id: row.item_id, title: document.title, project_key: document.project_key,
    unit_id: unit.unit_id, unit_kind: unit.unit_kind, occurred_at: unit.occurred_at, locator: unit.locator,
    known_at: document.known_at, valid_at: document.valid_at,
    text: [...unit.text].slice(0, MAX_UNIT_CHARACTERS).join(''),
    context_before: neighbour(-1), context_after: neighbour(1), doc_key: docKey };
}

// What the model said, checked against what this view holds. Every check is
// reported whether it passed or not; `linkable` is true only when the kind is one
// of the two that may be written and both quotes were found where they were said
// to be.
export function checkJudgement({ view, pair, answer, profile = RELATION_JUDGEMENT_PROFILE }) {
  const kind = profile.relation_kinds.includes(answer?.relation_kind) ? answer.relation_kind : null;
  const direction = profile.directions.includes(answer?.direction) ? answer.direction : null;
  const side = (docKey, evidence) => {
    const unitId = typeof evidence?.unit_id === 'string' ? evidence.unit_id : null;
    let text = null;
    try { text = unitId === null ? null : unitContext(view, docKey, unitId).text; } catch { text = null; }
    return { unit_id: unitId, unit_known: text !== null, quote: typeof evidence?.quote === 'string' ? evidence.quote : null,
      quote_match: text === null ? 'not_found' : quoteMatch(evidence?.quote, text) };
  };
  const a = side(pair.a.doc_key, answer?.evidence_a), b = side(pair.b.doc_key, answer?.evidence_b);
  const checks = { relation_kind_known: kind !== null, direction_known: direction !== null,
    evidence_a: a, evidence_b: b };
  const quotesFound = a.quote_match !== 'not_found' && b.quote_match !== 'not_found';
  const linkable = kind !== null && direction !== null && LINKABLE_RELATION_KINDS.includes(kind)
    && a.unit_known && b.unit_known && quotesFound;
  const reasons = [];
  if (kind === null) reasons.push('relation_kind_unknown');
  else if (!LINKABLE_RELATION_KINDS.includes(kind)) reasons.push(`kind_not_linked:${kind}`);
  if (direction === null) reasons.push('direction_unknown');
  for (const [name, row] of [['a', a], ['b', b]]) {
    if (!row.unit_known) reasons.push(`evidence_${name}_unit_unknown`);
    else if (row.quote_match === 'not_found') reasons.push(`evidence_${name}_quote_not_in_unit`);
  }
  return { relation_kind: kind, direction, checks, linkable, reasons };
}

// A relation the graph may be offered, addressed by what it is rather than when it
// was made: the same pair judged the same way twice is the same edge, so a repeat
// merges onto it instead of adding another.
export function relationFromJudgement({ pair, judgement, promptSha256, model, modelPin }) {
  const forward = judgement.direction !== 'b_to_a';
  const [from, to] = forward ? [pair.a, pair.b] : [pair.b, pair.a];
  const [fromEvidence, toEvidence] = forward ? [judgement.checks.evidence_a, judgement.checks.evidence_b]
    : [judgement.checks.evidence_b, judgement.checks.evidence_a];
  const body = { rule: RELATED_EVIDENCE_RULE, prompt_sha256: promptSha256, model, model_pin: modelPin,
    a_doc_key: from.doc_key, a_unit_id: from.unit_id, b_doc_key: to.doc_key, b_unit_id: to.unit_id,
    relation_kind: judgement.relation_kind, direction: judgement.direction === 'symmetric' ? 'symmetric' : 'a_to_b',
    evidence_a_unit: fromEvidence.unit_id, evidence_b_unit: toEvidence.unit_id };
  return { ...body, judgement_id: sha256Canonical(body) };
}

// pairs: [{ a: { doc_key, unit_id }, b: { doc_key, unit_id }, discovery }] — one call
// each, in order, until the budget runs out. `discovery` is carried through
// untouched so a candidate a search found and one a reviewer named by hand stay
// told apart in the result.
export async function judgeRelatedEvidence({ view, binding, pairs, profile = RELATION_JUDGEMENT_PROFILE,
  fetchImpl = loopbackFetch, maxCalls = profile.budget.max_model_calls } = {}) {
  if (!Array.isArray(pairs) || pairs.length === 0 || pairs.length > MAX_PAIRS) fail('relation_pairs_invalid');
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > profile.budget.max_model_calls) fail('relation_budget_invalid');
  view.assertCurrent();
  const llm = validateChatBinding(binding?.llm);
  const { digest, pin_kind: pinKind } = await installedModelDigest(llm, { fetchImpl });
  const local = createLocalChat({ binding: llm, maxCalls, fetchImpl });
  const promptSha256 = relationPromptSha256(profile);
  const judgements = [];
  for (const pair of pairs) {
    const a = unitContext(view, pair.a.doc_key, pair.a.unit_id);
    const b = unitContext(view, pair.b.doc_key, pair.b.unit_id);
    if (a.doc_key === b.doc_key) fail('relation_pair_same_document');
    const answer = await local.chat({ step: 'relate', system: profile.prompt, schema: profile.schema,
      user: JSON.stringify({ record_a: a, record_b: b }) });
    if (answer.status !== 'ok') {
      judgements.push({ pair, status: answer.status, code: answer.code ?? null, linkable: false,
        relation_kind: null, direction: null, checks: null, reasons: [`model_${answer.status}`] });
      if (answer.status === 'budget_exhausted') break;
      continue;
    }
    const checked = checkJudgement({ view, pair, answer: answer.value, profile });
    judgements.push({ pair, status: 'ok', code: null, ...checked,
      subject_a: typeof answer.value.subject_a === 'string' ? answer.value.subject_a : null,
      subject_b: typeof answer.value.subject_b === 'string' ? answer.value.subject_b : null,
      counter_conditions: Array.isArray(answer.value.counter_conditions) ? answer.value.counter_conditions.map(String) : [],
      unresolved: Array.isArray(answer.value.unresolved) ? answer.value.unresolved.map(String) : [],
      relation: checked.linkable ? relationFromJudgement({ pair, judgement: checked, promptSha256,
        model: llm.model, modelPin: `${pinKind}:${digest}` }) : null });
  }
  view.assertCurrent();
  return Object.freeze({ rule: RELATED_EVIDENCE_RULE, profile_id: profile.profile_id, profile_version: profile.profile_version,
    prompt_sha256: promptSha256, model: { model: llm.model, digest, pin_kind: pinKind, think: llm.think,
      transport: llm.transport }, generation_id: view.manifest.generation_id,
    judgements, relations: judgements.filter(row => row.relation !== null).map(row => row.relation),
    trace: local.trace() });
}
