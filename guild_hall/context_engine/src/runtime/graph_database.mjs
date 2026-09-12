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
const MAX_QUERY_CHARACTERS = 8000;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+_-]{0,199}$/u;

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

// A search bound to one view: project, generation and endpoints are fixed here, so
// a caller can only choose the mode, the text and how many rows it wants back.
export function createGraphSearch({ view, binding, runWorker = runGraphragWorker } = {}) {
  const bound = validateGraphBinding(binding);
  const generationId = view.manifest.generation_id;
  if (!TOKEN.test(generationId ?? '')) fail('graph_search_generation_invalid');
  const ready = searchable(bound);

  async function search(mode, queryText, topK = 10) {
    if (!GRAPH_SEARCH_MODES.includes(mode)) fail('graph_search_mode_invalid');
    if (!ready.ok) return { status: 'not_connected', code: ready.code, mode, hits: [] };
    if (typeof queryText !== 'string' || !queryText.trim() || queryText.length > MAX_QUERY_CHARACTERS) {
      return { status: 'refused', code: 'query_invalid', mode, hits: [] };
    }
    if (!Number.isSafeInteger(topK) || topK < 1 || topK > GRAPH_SEARCH_MAX_TOP_K) fail('graph_search_top_k_invalid');
    view.assertCurrent();
    const output = await callWorker({ bound, runWorker, request: { operation: 'retrieve', neo4j: bound.neo4j,
      mode, query_text: queryText, top_k: topK, generation_id: generationId, embedder: bound.embedder } });
    if (output.status === 'not_loaded') {
      return { status: 'not_loaded', code: String(output.code ?? 'generation_not_materialized'), mode, hits: [] };
    }
    if (output.status !== 'ok') fail(String(output.code ?? 'graph_retrieve_failed'));
    const hits = (Array.isArray(output.hits) ? output.hits : [])
      .filter(row => typeof row?.sf_unit_id === 'string' && typeof row?.sf_doc_key === 'string')
      .map(row => ({ doc_key: row.sf_doc_key, unit_id: row.sf_unit_id,
        score: Number.isFinite(row.score) ? row.score : null, seed: row.seed === true }));
    return { status: 'ok', mode, hits, dropped_out_of_generation: Number.isSafeInteger(output.dropped_out_of_generation)
      ? output.dropped_out_of_generation : 0, embedder: output.embedder ?? null };
  }

  return Object.freeze({ generation_id: generationId, connected: ready.ok, code: ready.ok ? null : ready.code,
    vector: (query, topK) => search('vector', query, topK),
    hybrid: (query, topK) => search('hybrid', query, topK),
    graph: (query, topK) => search('graph', query, topK) });
}
