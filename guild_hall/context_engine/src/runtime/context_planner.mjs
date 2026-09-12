// 맥락이 working context over one project's selected graph index (v0.9 §4 B).
// The program fixes project, authority, generation and budget, runs every
// search itself (the model only asks; search and read are the only tools),
// takes evidence from the hash-verified index, enforces citations (a fact or a
// claim without a valid evidence id becomes an interpretation), and reports
// coverage per source kind, the searches, failures and open questions. The
// model reads the request, writes check questions, picks a search per
// question, judges sufficiency and writes the sections. Running out of budget
// returns a partial pack with the unanswered questions. Nothing is written.
import { createHash } from 'node:crypto';
import { SOURCE_KINDS } from './source_documents.mjs';
import { createGraphIndexRetriever } from './graph_index_retrieval.mjs';
import { hashableOptions } from './graph_extraction.mjs';
import { createLocalChat, installedModelDigest, loopbackFetch, validateChatBinding } from '../adapters/local_model/ollama_chat.mjs';
import { CONTEXT_PLANNER_PROFILE } from '../../profiles/context_planner_v1.mjs';

export const CONTEXT_PACK_V2_SCHEMA = 'soulforge.context_pack.v2';
export const STATEMENT_KIND_LABELS = Object.freeze({ fact: '확인 사실', claim: '자료의 주장', interpretation: '해석', unknown: '미확인' });
// Plan 17 input kinds without an adapter yet: listed so absence is not silent.
const NOT_CONNECTED_KINDS = Object.freeze(['buzz', 'slack']);
// Program ceiling: no profile, binding or request can go above it. A profile
// budget is a default under this ceiling; binding and request only lower it.
export const PLANNER_BUDGET_CEILING = Object.freeze({ max_model_calls: 8, max_search_rounds: 3, max_searches_per_round: 8,
  max_evidence: 24, max_evidence_characters: 24000, max_questions: 12, max_statements_per_section: 12, max_statement_characters: 800 });
// Model-written fields outside citation enforcement: planning text, not claims.
const UNCITED_MODEL_TEXT = Object.freeze(['deliverables', 'questions', 'missing', 'open_questions']);
// lexical and exact answer from the store; vector, hybrid and graph answer from
// the graph database and report not_connected when none is bound. A search the
// model asks for that cannot run is recorded with its code, never silently
// answered by a different mode.
const MODES = new Set(['lexical', 'exact', 'vector', 'hybrid', 'graph']);
const DATABASE_MODES = new Set(['vector', 'hybrid', 'graph']);
const MAX_REQUEST_CHARACTERS = 8000, MAX_PURPOSE_CHARACTERS = 2000, MAX_QUERY_CHARACTERS = 500;
const sha = text => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

export class ContextPlannerError extends Error {
  constructor(code) { super(code); this.name = 'ContextPlannerError'; this.code = code; }
}
const fail = code => { throw new ContextPlannerError(code); };

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// The profile default is capped by the program ceiling; a binding or a request can only lower it.
function narrowBudget(base, ...limits) {
  if (Object.keys(base).some(key => !Object.hasOwn(PLANNER_BUDGET_CEILING, key))) fail('planner_budget_invalid');
  const budget = Object.fromEntries(Object.keys(PLANNER_BUDGET_CEILING).map(key =>
    [key, Math.min(PLANNER_BUDGET_CEILING[key], Number.isSafeInteger(base[key]) && base[key] >= 0 ? base[key] : PLANNER_BUDGET_CEILING[key])]));
  for (const limit of limits) {
    for (const [key, value] of Object.entries(limit ?? {})) {
      if (!Object.hasOwn(budget, key) || !Number.isSafeInteger(value) || value < 0) fail('planner_budget_invalid');
      budget[key] = Math.min(budget[key], value);
    }
  }
  return Object.freeze(budget);
}

const text = (value, max) => (typeof value === 'string' ? [...value.trim()].slice(0, max).join('') : '');

function cleanSearches(list, questionIds) {
  return (Array.isArray(list) ? list : []).map(row => ({ question_id: questionIds.has(row?.question_id) ? row.question_id : null,
    mode: MODES.has(row?.mode) ? row.mode : null, query: text(row?.query, MAX_QUERY_CHARACTERS) }))
    .filter(row => row.mode !== null && row.query);
}

function enforceStatements(list, validIds, budget, stats) {
  const statements = [];
  for (const row of (Array.isArray(list) ? list : []).slice(0, budget.max_statements_per_section)) {
    const statementText = text(row?.text, budget.max_statement_characters);
    if (!statementText) { stats.empty_dropped++; continue; }
    const cited = [...new Set((Array.isArray(row.evidence) ? row.evidence : []).filter(id => typeof id === 'string'))];
    const evidence = cited.filter(id => validIds.has(id));
    stats.unknown_evidence_ids += cited.length - evidence.length;
    let kind = Object.hasOwn(STATEMENT_KIND_LABELS, row.kind) ? row.kind : 'interpretation';
    const downgraded = (kind === 'fact' || kind === 'claim') && evidence.length === 0;
    if (downgraded) { stats.downgraded++; kind = 'interpretation'; }
    statements.push({ text: statementText, kind, evidence, ...(downgraded ? { downgraded_from: row.kind } : {}) });
  }
  return statements;
}

// request: { request_text, task_purpose, budget? }. The view is an openGraphIndex
// result, so actor, project and purpose were admitted when it was opened.
// binding: { llm: { host, model, think?, options?, keep_alive?, timeout_ms? }, budget? } from trusted configuration.
// graphSearch (optional): a createGraphSearch result for the database modes; by
// default the view's own graph binding decides whether they are connected.
export async function composeWorkingContext({ view, request, binding, profile = CONTEXT_PLANNER_PROFILE,
  fetchImpl = loopbackFetch, graphSearch = null, runWorker = undefined } = {}) {
  const requestText = text(request?.request_text, MAX_REQUEST_CHARACTERS), purpose = text(request?.task_purpose, MAX_PURPOSE_CHARACTERS);
  if (!requestText || typeof request?.request_text !== 'string' || request.request_text.length > MAX_REQUEST_CHARACTERS) fail('planner_request_invalid');
  if (request.as_of !== undefined) fail('as_of_not_supported_by_graph_index');
  const budget = narrowBudget(profile.budget, binding?.budget, request.budget);
  const llm = validateChatBinding(binding?.llm);
  const digest = await installedModelDigest(llm, { fetchImpl });
  const local = createLocalChat({ binding: llm, maxCalls: budget.max_model_calls, fetchImpl });
  const retriever = createGraphIndexRetriever(view, { graphSearch: graphSearch ?? null, runWorker });
  const catalog = retriever.catalog().map(({ source_kind, item_id, title, units }) => ({ source_kind, item_id, title, units }));

  const evidence = [], evidenceByChunk = new Map(), searches = [], searchedKinds = new Set(), hitsByKind = new Map();
  let evidenceCharacters = 0, evidenceTruncated = false, rounds = 0;
  const callsMade = () => local.trace().filter(row => row.status !== 'budget_exhausted').length;
  const modelEvidence = () => evidence.map(({ id, source_kind, item_id, title, unit_kind, locator, occurred_at, speaker_ref, text: body }) =>
    ({ id, source_kind, item_id, title, unit_kind, locator, occurred_at, speaker_ref, text: body }));
  async function runSearches(list, round) {
    rounds = round;
    for (const [index, search] of list.entries()) {
      if (index >= budget.max_searches_per_round) {
        searches.push({ round, ...search, status: 'skipped', code: 'search_budget_exhausted', hits: 0 });
        continue;
      }
      // The database modes are async; awaiting the synchronous ones costs nothing
      // and keeps one path for every mode.
      const result = await (DATABASE_MODES.has(search.mode) ? retriever[search.mode](search.query)
        : search.mode === 'exact' ? retriever.exact(search.query) : retriever.lexical(search.query));
      searches.push({ round, ...search, status: result.status, code: result.code ?? null, hits: result.hits.length });
      for (const kind of result.searched_kinds ?? []) searchedKinds.add(kind);
      for (const hit of result.hits) {
        hitsByKind.set(hit.source_kind, (hitsByKind.get(hit.source_kind) ?? 0) + 1);
        if (evidenceByChunk.has(hit.chunk_id)) continue;
        if (evidence.length >= budget.max_evidence || evidenceCharacters + hit.text.length > budget.max_evidence_characters) {
          evidenceTruncated = true; continue;
        }
        const id = `E${evidence.length + 1}`;
        evidenceByChunk.set(hit.chunk_id, id);
        evidenceCharacters += hit.text.length;
        evidence.push({ id, doc_key: hit.doc_key, source_kind: hit.source_kind, item_id: hit.item_id, title: hit.title,
          revision_sha256: hit.revision_sha256, unit_id: hit.unit_id, unit_kind: hit.unit_kind, locator: hit.locator,
          occurred_at: hit.occurred_at, speaker_ref: hit.speaker_ref, text: hit.text, text_sha256: sha(hit.text) });
      }
    }
  }

  let status = 'complete', code = null, deliverables = [], questions = [], answered = [], missing = [];
  // The review outcome is reported so an empty answered/missing list is never read as "all answered".
  let review = { status: 'not_run', rounds: 0, code: null };
  let sections = Object.fromEntries(profile.sections.map(name => [name, []])), openQuestions = [];
  const stats = { empty_dropped: 0, downgraded: 0, unknown_evidence_ids: 0 };
  const plan = await local.chat({ step: 'plan', system: profile.prompts.plan, schema: profile.schemas.plan,
    user: JSON.stringify({ request_text: requestText, task_purpose: purpose, catalog }) });
  if (plan.status !== 'ok') {
    status = 'partial'; code = plan.status === 'budget_exhausted' ? 'model_budget_exhausted' : `plan_${plan.status}`;
  } else {
    deliverables = (Array.isArray(plan.value.deliverables) ? plan.value.deliverables : []).map(item => text(item, 300)).filter(Boolean).slice(0, 8);
    const seen = new Set();
    questions = (Array.isArray(plan.value.questions) ? plan.value.questions : []).map(row => ({ id: text(row?.id, 16), text: text(row?.text, 400) }))
      .filter(row => row.id && row.text && !seen.has(row.id) && seen.add(row.id)).slice(0, budget.max_questions);
    const questionIds = new Set(questions.map(row => row.id));
    await runSearches(cleanSearches(plan.value.searches, questionIds), 1);
    // Additional searches while a compose call is still left in the budget.
    if (budget.max_search_rounds >= 2 && budget.max_model_calls - callsMade() <= 1) review = { status: 'skipped', rounds: 0, code: 'model_budget_reserved_for_compose' };
    for (let round = 2; round <= budget.max_search_rounds && budget.max_model_calls - callsMade() > 1; round++) {
      const reviewed = await local.chat({ step: 'review', system: profile.prompts.review, schema: profile.schemas.review,
        user: JSON.stringify({ questions, evidence: modelEvidence() }) });
      if (reviewed.status !== 'ok') { review = { status: 'failed', rounds: review.rounds, code: `review_${reviewed.status}` }; break; }
      review = { status: 'ok', rounds: review.rounds + 1, code: null };
      answered = (Array.isArray(reviewed.value.answered) ? reviewed.value.answered : []).filter(id => questionIds.has(id));
      missing = (Array.isArray(reviewed.value.missing) ? reviewed.value.missing : []).filter(row => questionIds.has(row?.question_id))
        .map(row => ({ question_id: row.question_id, reason: text(row.reason, 300) }));
      const followUp = cleanSearches(reviewed.value.searches, questionIds);
      if (followUp.length === 0) break;
      await runSearches(followUp, round);
    }
    const composed = await local.chat({ step: 'compose', system: profile.prompts.compose, schema: profile.schemas.compose,
      user: JSON.stringify({ request_text: requestText, task_purpose: purpose, questions, evidence: modelEvidence() }) });
    if (composed.status === 'ok') {
      const validIds = new Set(evidence.map(row => row.id));
      sections = Object.fromEntries(profile.sections.map(name => [name,
        enforceStatements(composed.value.sections?.[name], validIds, budget, stats)]));
      openQuestions = (Array.isArray(composed.value.open_questions) ? composed.value.open_questions : [])
        .map(item => text(item, 400)).filter(Boolean).slice(0, 16);
    } else {
      status = 'partial'; code = composed.status === 'budget_exhausted' ? 'model_budget_exhausted' : `compose_${composed.status}`;
    }
  }
  if (status === 'partial' && openQuestions.length === 0) openQuestions = questions.map(row => row.text);

  const quality = view.readQuality();
  const coverage = [...SOURCE_KINDS, ...NOT_CONNECTED_KINDS].sort().map(kind => {
    if (NOT_CONNECTED_KINDS.includes(kind)) return { source_kind: kind, state: 'not_connected', items: 0, prepared: 0, failed: 0,
      searched: false, hits: 0, body_read: 0 };
    const items = quality.coverage.items.filter(row => row.source_kind === kind);
    return { source_kind: kind, state: items.length === 0 ? 'none_in_scope' : 'connected', items: items.length,
      prepared: items.filter(row => row.status === 'prepared').length, failed: items.filter(row => row.status !== 'prepared').length,
      searched: searchedKinds.has(kind), hits: hitsByKind.get(kind) ?? 0, body_read: evidence.filter(row => row.source_kind === kind).length };
  });
  view.assertCurrent();
  const trace = local.trace();
  const body = { schema_version: CONTEXT_PACK_V2_SCHEMA, status, code, claim_ceiling: 'observed', project_key: view.manifest.project_key,
    request: { request_sha256: sha(request.request_text), task_purpose_sha256: sha(purpose) },
    index: { generation_id: view.manifest.generation_id, manifest_sha256: view.generation_ref.sha256, pointer_sha256: view.pointer_sha256,
      selection_epoch: view.selection_epoch, extraction_model: view.manifest.model, extraction_profile: view.manifest.profile },
    planner: { profile_id: profile.profile_id, profile_version: profile.profile_version, retrieval: retriever.profile,
      model: { llm: llm.model, llm_digest: digest, think: llm.think, options: hashableOptions(llm.options) } },
    deliverables, questions, answered, missing, review, sections, open_questions: openQuestions, statement_kinds: STATEMENT_KIND_LABELS,
    uncited_model_text: UNCITED_MODEL_TEXT,
    evidence, searches, coverage,
    search_modes: [{ mode: 'lexical', state: 'connected', profile: retriever.profile }, { mode: 'exact', state: 'connected' },
      { mode: 'graph', state: 'not_connected', code: 'graph_database_not_connected' }],
    rune: { status: 'not_run', reason: 'rune_not_connected' },
    enforcement: stats,
    budget: { limits: budget, used: { model_calls: callsMade(), search_rounds: rounds, searches: searches.filter(row => row.status !== 'skipped').length,
      evidence: evidence.length, evidence_characters: evidenceCharacters }, evidence_truncated: evidenceTruncated },
    trace };
  // content_sha256 leaves out timings and trace so the same input can be compared run to run.
  const content = { status, code, index: body.index, planner: body.planner, deliverables, questions, answered, missing, review, sections,
    open_questions: openQuestions, evidence: evidence.map(({ text: omitted, ...row }) => row), searches, coverage };
  return Object.freeze({ ...body, content_sha256: sha(stableStringify(content)), pack_sha256: sha(stableStringify(body)) });
}
