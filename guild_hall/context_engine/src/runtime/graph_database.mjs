// The graph database side of one project's index: loading a selected generation
// into Neo4j, and searching it. neo4j-graphrag owns the writer and the retrievers
// inside the worker; this module owns the contract around them.
//
// One container holds one project and exactly one generation. Loading is therefore
// idempotent by generation — the same generation twice is a no-op that says so —
// and a different generation of the same project replaces the previous one rather
// than adding to it. The graph is a derived, rebuildable projection: the durable
// asset is the generation in the project store, and "restore" means loading that
// generation again and getting the same graph.
//
// Search returns unit and document ids, never meaning. The caller joins them back
// to its own hash-verified manifest, so a row the database no longer agrees with
// simply does not become evidence.
import { runGraphragWorker } from '../adapters/graphrag/worker_client.mjs';
import { validateGraphBinding } from './graph_extraction.mjs';

export const GRAPH_SEARCH_MODES = Object.freeze(['vector', 'hybrid', 'graph']);
export const GRAPH_SEARCH_MAX_TOP_K = 50;
// The explicit-reference rules this APP will ask the database to add. A rule is
// named here and implemented in the worker; nothing else may be linked.
export const EXPLICIT_LINK_RULES = Object.freeze(['L1-linear-identifier']);
// The one rule under which a judged relation may be written, and the two relation
// kinds it writes. Everything else a judgement can say is reported, not linked.
export const RELATED_EVIDENCE_RULE = 'R1-local-judgement';
export const RELATED_EVIDENCE_KINDS = Object.freeze(['same_test_context', 'condition_material_for']);
export const RELATED_EVIDENCE_DIRECTIONS = Object.freeze(['a_to_b', 'symmetric']);
// Which expansion rules a search may follow, and this APP's ceiling for how much
// one search may bring back over them. A request may lower a bound, never raise it.
export const GRAPH_EXPANSION_RULES = Object.freeze(['L1', 'R1']);
export const GRAPH_EXPANSION_LIMITS = Object.freeze({ per_document_limit: 3, expansion_limit: 8, final_limit: 16 });
const MAX_LINK_IDENTIFIERS = 1000;
const MAX_RELATED_RELATIONS = 100;
const MAX_QUERY_CHARACTERS = 8000;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+_-]{0,199}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;

export class GraphDatabaseError extends Error {
  constructor(code) { super(code); this.name = 'GraphDatabaseError'; this.code = code; }
}
const fail = code => { throw new GraphDatabaseError(code); };

// The worker needs an embedder to turn a query into a vector; an index built
// without one cannot be searched by vector, hybrid or graph expansion.
function searchable(bound) {
  if (bound.neo4j === null) return { ok: false, code: 'graph_database_not_connected' };
  if (!bound.embedder) return { ok: false, code: 'graph_embedder_not_bound' };
  return { ok: true };
}

async function callWorker({ bound, request, runWorker }) {
  const { exit_code: exitCode, output } = await runWorker({ binding: bound.worker, request });
  if (exitCode !== 0 || !output || typeof output !== 'object') fail(String(output?.code ?? 'graph_worker_failed'));
  if (output.status === 'error') fail(String(output.code ?? 'graph_worker_failed'));
  return output;
}

// Loads the view's selected generation. Every fragment is re-read from the store
// by hash on the way out, so what reaches the database is what the manifest
// records and not whatever happens to be on disk.
export async function materializeGraphIndex({ view, binding, runWorker = runGraphragWorker } = {}) {
  const bound = validateGraphBinding(binding);
  if (bound.neo4j === null) return Object.freeze({ status: 'not_connected', code: 'graph_database_not_connected' });
  view.assertCurrent();
  const { manifest } = view;
  const fragments = manifest.documents.map(row => {
    const fragment = view.readFragment(row.doc_key);
    return { doc_key: fragment.doc_key, nodes: fragment.nodes, relationships: fragment.relationships };
  });
  const output = await callWorker({ bound, runWorker, request: { operation: 'materialize', neo4j: bound.neo4j,
    project_key: manifest.project_key, generation_id: manifest.generation_id, fragments } });
  // Re-checked after the load as well: a generation that moved underneath the load
  // would have been written into a database the APP no longer points at.
  view.assertCurrent();
  if (output.status !== 'ok') fail(String(output.code ?? 'graph_materialize_failed'));
  return Object.freeze({ status: 'ok', loaded: output.loaded === true, code: output.code ?? null,
    generation_id: manifest.generation_id, project_key: manifest.project_key,
    counts: output.counts ?? null, superseded: output.superseded ?? [], removed_nodes: output.removed_nodes ?? 0,
    indexes: output.indexes ?? null });
}

// Adds one rule's explicit-reference edges to the loaded generation: a node that
// names an identifier verbatim is joined to the document that identifier belongs
// to. The edge lives only in the derived projection — reloading the generation
// rebuilds the graph without it — so this adds no meaning to the store and nothing
// here merges, relabels or rewrites a node. The caller supplies the identifier map
// because reading a document's facts is the APP's job, not the database's; every
// target must be a document this view's own manifest holds, so the database is
// never asked to point at something the generation does not contain.
//
// `apply: false` is a read: the worker returns the candidates and writes nothing.
export async function linkExplicitReferences({ view, binding, identifiers, rule = EXPLICIT_LINK_RULES[0],
  apply = false, runWorker = runGraphragWorker } = {}) {
  const bound = validateGraphBinding(binding);
  if (bound.neo4j === null) return Object.freeze({ status: 'not_connected', code: 'graph_database_not_connected' });
  if (!EXPLICIT_LINK_RULES.includes(rule)) fail('graph_link_rule_unknown');
  if (typeof apply !== 'boolean') fail('graph_link_request_invalid');
  if (identifiers === null || typeof identifiers !== 'object' || Array.isArray(identifiers)) fail('graph_link_identifiers_invalid');
  const entries = Object.entries(identifiers);
  if (entries.length === 0 || entries.length > MAX_LINK_IDENTIFIERS) fail('graph_link_identifiers_invalid');
  view.assertCurrent();
  const { manifest } = view;
  const held = new Set(manifest.documents.map(row => row.doc_key));
  for (const [token, docKey] of entries) {
    if (typeof token !== 'string' || !token || typeof docKey !== 'string' || !held.has(docKey)) {
      fail('graph_link_identifiers_invalid');
    }
  }
  const output = await callWorker({ bound, runWorker, request: { operation: 'link_explicit_refs', neo4j: bound.neo4j,
    project_key: manifest.project_key, generation_id: manifest.generation_id, rule,
    identifiers: Object.fromEntries(entries), apply } });
  view.assertCurrent();
  if (output.status === 'not_loaded') {
    return Object.freeze({ status: 'not_loaded', code: String(output.code ?? 'generation_not_materialized'),
      rule, generation_id: manifest.generation_id, applied: false, edges: [] });
  }
  if (output.status !== 'ok') fail(String(output.code ?? 'graph_link_failed'));
  const edges = (Array.isArray(output.edges) ? output.edges : []).map(row => ({ token: row.token,
    source_unit_id: row.source_unit_id, source_doc_key: row.source_doc_key, target_doc_key: row.target_doc_key }));
  return Object.freeze({ status: 'ok', rule, applied: output.applied === true,
    relationship: output.relationship ?? null, generation_id: manifest.generation_id,
    project_key: manifest.project_key, counts: output.counts ?? null, edges });
}

// Adds the related-evidence edges a judgement proposed and a caller has already
// checked. The edge is an inference: it says two chunks belong to one piece of
// work, it carries the rule, the prompt and model behind it and the two units the
// quotes came from, and it is written with claim_state `inferred` and review_state
// `unreviewed` so nothing downstream can read it as something a source said. Like
// the explicit reference it lives only in the derived projection, so reloading the
// generation rebuilds the graph without it.
//
// Both ends must be a (document, unit) pair this view's own manifest holds; the
// APP checks the quotes against the unit texts before it gets here, and this side
// checks that the units exist at all. `apply: false` writes nothing.
export async function linkRelatedEvidence({ view, binding, relations, apply = false, runWorker = runGraphragWorker } = {}) {
  const bound = validateGraphBinding(binding);
  if (bound.neo4j === null) return Object.freeze({ status: 'not_connected', code: 'graph_database_not_connected' });
  if (typeof apply !== 'boolean') fail('graph_related_request_invalid');
  if (!Array.isArray(relations) || relations.length === 0 || relations.length > MAX_RELATED_RELATIONS) fail('graph_related_relations_invalid');
  view.assertCurrent();
  const { manifest } = view;
  const units = new Map(manifest.documents.map(row => [row.doc_key, null]));
  const holds = (docKey, unitId) => {
    if (!units.has(docKey)) return false;
    if (units.get(docKey) === null) units.set(docKey, new Set(view.readDocument(docKey).units.map(unit => unit.unit_id)));
    return units.get(docKey).has(unitId);
  };
  const rows = relations.map(row => {
    if (row === null || typeof row !== 'object') fail('graph_related_relations_invalid');
    const { a_doc_key: aDoc, a_unit_id: aUnit, b_doc_key: bDoc, b_unit_id: bUnit } = row;
    if (!holds(aDoc, aUnit) || !holds(bDoc, bUnit) || (aDoc === bDoc && aUnit === bUnit)) fail('graph_related_relations_invalid');
    if (!RELATED_EVIDENCE_KINDS.includes(row.relation_kind) || !RELATED_EVIDENCE_DIRECTIONS.includes(row.direction)) {
      fail('graph_related_kind_unknown');
    }
    if (!SHA.test(row.judgement_id ?? '') || !SHA.test(row.prompt_sha256 ?? '')) fail('graph_related_relations_invalid');
    // A quote is evidence only if it came from one of the two units being joined.
    if (!holds(aDoc, row.evidence_a_unit) || !holds(bDoc, row.evidence_b_unit)) fail('graph_related_evidence_invalid');
    if (typeof row.model !== 'string' || !row.model || typeof row.model_pin !== 'string' || !row.model_pin) fail('graph_related_relations_invalid');
    return { a_doc_key: aDoc, a_unit_id: aUnit, b_doc_key: bDoc, b_unit_id: bUnit, judgement_id: row.judgement_id,
      relation_kind: row.relation_kind, direction: row.direction, evidence_a_unit: row.evidence_a_unit,
      evidence_b_unit: row.evidence_b_unit, prompt_sha256: row.prompt_sha256, model: row.model, model_pin: row.model_pin };
  });
  const output = await callWorker({ bound, runWorker, request: { operation: 'link_related_evidence', neo4j: bound.neo4j,
    project_key: manifest.project_key, generation_id: manifest.generation_id, rule: RELATED_EVIDENCE_RULE,
    relations: rows, apply } });
  view.assertCurrent();
  if (output.status === 'not_loaded') {
    return Object.freeze({ status: 'not_loaded', code: String(output.code ?? 'generation_not_materialized'),
      rule: RELATED_EVIDENCE_RULE, generation_id: manifest.generation_id, applied: false, edges: [] });
  }
  if (output.status !== 'ok') fail(String(output.code ?? 'graph_related_failed'));
  return Object.freeze({ status: 'ok', rule: RELATED_EVIDENCE_RULE, applied: output.applied === true,
    relationship: output.relationship ?? null, generation_id: manifest.generation_id, project_key: manifest.project_key,
    counts: output.counts ?? null, edges: Array.isArray(output.edges) ? output.edges : [] });
}

// This search's expansion budget: the rules it may follow and how much it may
// bring back over them. A request may switch a rule off or lower a bound, which is
// how the same question is asked with and without a rule; it can never raise one.
export function narrowExpansion(expansion) {
  if (expansion === undefined || expansion === null) return null;
  if (typeof expansion !== 'object' || Array.isArray(expansion)) fail('graph_search_expansion_invalid');
  const rules = expansion.enabled_rules ?? GRAPH_EXPANSION_RULES;
  if (!Array.isArray(rules) || new Set(rules).size !== rules.length
    || !rules.every(rule => GRAPH_EXPANSION_RULES.includes(rule))) fail('graph_search_expansion_invalid');
  const narrowed = { enabled_rules: [...rules].sort() };
  for (const [key, ceiling] of Object.entries(GRAPH_EXPANSION_LIMITS)) {
    const value = expansion[key];
    if (value === undefined || value === null) continue;
    if (!Number.isSafeInteger(value) || value < 0) fail('graph_search_expansion_invalid');
    narrowed[key] = Math.min(ceiling, value);
  }
  if (Object.keys(expansion).some(key => key !== 'enabled_rules' && !Object.hasOwn(GRAPH_EXPANSION_LIMITS, key))) {
    fail('graph_search_expansion_invalid');
  }
  return narrowed;
}

// A search bound to one view: project, generation and endpoints are fixed here, so
// a caller can only choose the mode, the text and how many rows it wants back.
export function createGraphSearch({ view, binding, runWorker = runGraphragWorker } = {}) {
  const bound = validateGraphBinding(binding);
  const generationId = view.manifest.generation_id;
  if (!TOKEN.test(generationId ?? '')) fail('graph_search_generation_invalid');
  const ready = searchable(bound);

  async function search(mode, queryText, topK = 10, { expansion = null } = {}) {
    if (!GRAPH_SEARCH_MODES.includes(mode)) fail('graph_search_mode_invalid');
    if (!ready.ok) return { status: 'not_connected', code: ready.code, mode, hits: [] };
    if (typeof queryText !== 'string' || !queryText.trim() || queryText.length > MAX_QUERY_CHARACTERS) {
      return { status: 'refused', code: 'query_invalid', mode, hits: [] };
    }
    if (!Number.isSafeInteger(topK) || topK < 1 || topK > GRAPH_SEARCH_MAX_TOP_K) fail('graph_search_top_k_invalid');
    const narrowed = narrowExpansion(expansion);
    view.assertCurrent();
    const output = await callWorker({ bound, runWorker, request: { operation: 'retrieve', neo4j: bound.neo4j,
      mode, query_text: queryText, top_k: topK, generation_id: generationId, embedder: bound.embedder,
      allowed_hosts: bound.allowed_model_hosts, ...(narrowed ? { expansion: narrowed } : {}) } });
    if (output.status === 'not_loaded') {
      return { status: 'not_loaded', code: String(output.code ?? 'generation_not_materialized'), mode, hits: [] };
    }
    if (output.status !== 'ok') fail(String(output.code ?? 'graph_retrieve_failed'));
    const hits = (Array.isArray(output.hits) ? output.hits : [])
      .filter(row => typeof row?.sf_unit_id === 'string' && typeof row?.sf_doc_key === 'string')
      .map(row => ({ doc_key: row.sf_doc_key, unit_id: row.sf_unit_id,
        score: Number.isFinite(row.score) ? row.score : null, seed: row.seed === true,
        // Which rule brought a row in, and how close it is to the question. Both
        // are the database's account of the expansion, not a second score.
        via: typeof row.via === 'string' ? row.via : null,
        relevance: Number.isFinite(row.relevance) ? row.relevance : null }));
    return { status: 'ok', mode, hits, dropped_out_of_generation: Number.isSafeInteger(output.dropped_out_of_generation)
      ? output.dropped_out_of_generation : 0, embedder: output.embedder ?? null,
    expansion: output.expansion ?? null };
  }

  return Object.freeze({ generation_id: generationId, connected: ready.ok, code: ready.ok ? null : ready.code,
    vector: (query, topK, options) => search('vector', query, topK, options ?? {}),
    hybrid: (query, topK, options) => search('hybrid', query, topK, options ?? {}),
    graph: (query, topK, options) => search('graph', query, topK, options ?? {}) });
}
