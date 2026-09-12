// Retrieval over the selected graph index generation of one project. Lexical
// search reuses the shared BM25 corpus search (bm25-v1, baseline A) over the
// prepared source units; exact lookup takes an item id from the manifest.
// Vector, hybrid and graph-expansion search belong to Neo4j GraphRAG: they run in
// the graph database when this view's binding names one, and report not_connected
// otherwise rather than falling back to a different search under the same name.
// Those three are async; lexical and exact stay synchronous.
//
// A database hit is a (document, unit) pair and a score, nothing more. It becomes
// a hit here only if that pair is in this view's hash-verified manifest, so a row
// the store no longer agrees with is dropped and counted instead of being served.
// Every hit carries its source kind, item, unit, locator, time and revision, and
// nothing outside the view's project is searched.
import { retrieveAdmittedDocuments, RETRIEVAL_PROFILE } from '../../algorithms/retrieval/bm25_v1.mjs';
import { createGraphSearch } from './graph_database.mjs';

const MAX_CHUNKS_PER_SOURCE = 20000;
const MAX_SOURCES = 16;
const MAX_QUERY_CHARACTERS = 8000;

export class GraphIndexRetrievalError extends Error {
  constructor(code) { super(code); this.name = 'GraphIndexRetrievalError'; this.code = code; }
}
const fail = code => { throw new GraphIndexRetrievalError(code); };

// graphSearch (optional): a createGraphSearch result, or built from the view's own
// binding when it names a graph database. Passing one explicitly is how tests and
// the installed runtime bind a worker; omitting it keeps the old behaviour.
export function createGraphIndexRetriever(view, { graphSearch = null, runWorker = undefined } = {}) {
  view.assertCurrent();
  const database = graphSearch ?? (view.graph_binding?.neo4j
    ? createGraphSearch({ view, binding: view.graph_binding, ...(runWorker ? { runWorker } : {}) })
    : null);
  const units = new Map(), catalog = [];
  for (const row of view.manifest.documents) {
    const document = view.readDocument(row.doc_key);
    catalog.push({ doc_key: row.doc_key, source_kind: row.source_kind, item_id: row.item_id, title: document.title,
      units: document.units.length, known_at: document.known_at, valid_at: document.valid_at });
    for (const unit of document.units) {
      units.set(`${row.doc_key.slice('sha256:'.length)}:${unit.unit_id}`, { doc_key: row.doc_key, source_kind: row.source_kind,
        item_id: row.item_id, title: document.title, revision_sha256: document.composite_revision_sha256, unit_id: unit.unit_id,
        unit_kind: unit.unit_kind, locator: unit.locator, occurred_at: unit.occurred_at, speaker_ref: unit.speaker_ref, text: unit.text });
    }
  }
  // One BM25 space over all units. Chunks are grouped by source kind to stay
  // within the shared search's 16-source limit and to report which kinds were
  // searched (bm25-v1 caps evidence and per-source hits alike at 12, so the
  // grouping does not spread hits). The shared contract requires a page list;
  // units carry their own locators, so page 1 is a placeholder no hit reads back.
  const groups = new Map();
  for (const [chunkId, unit] of units) {
    const list = groups.get(unit.source_kind) ?? [];
    list.push({ chunk_id: chunkId, page_numbers: [1], text: unit.text });
    groups.set(unit.source_kind, list);
  }
  const sources = [];
  for (const [kind, chunks] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    for (let offset = 0; offset < chunks.length; offset += MAX_CHUNKS_PER_SOURCE) {
      sources.push({ source_id: offset === 0 ? kind : `${kind}.${offset / MAX_CHUNKS_PER_SOURCE}`,
        chunks: chunks.slice(offset, offset + MAX_CHUNKS_PER_SOURCE) });
    }
  }
  if (sources.length > MAX_SOURCES) fail('graph_index_too_large_for_lexical');
  const hit = (chunkId, rank) => ({ rank, chunk_id: chunkId, ...units.get(chunkId) });

  function lexical(query) {
    if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_CHARACTERS) return { status: 'refused', code: 'query_invalid', hits: [] };
    if (sources.length === 0) return { status: 'ok', hits: [], searched_kinds: [] };
    const result = retrieveAdmittedDocuments(query, sources);
    return { status: 'ok', hits: result.hits.map((row, index) => hit(row.chunk_id, index + 1)),
      searched_kinds: [...groups.keys()].sort(), receipt: { profile: RETRIEVAL_PROFILE, searched_chunk_count: result.receipt.searched_chunk_count,
        hit_count: result.receipt.hit_count, selected_count: result.receipt.selected_count } };
  }
  function exact(itemId) {
    const rows = view.manifest.documents.filter(row => row.item_id === itemId);
    if (rows.length === 0) return { status: 'ok', hits: [], searched_kinds: [] };
    const hits = [];
    for (const row of rows) {
      const prefix = `${row.doc_key.slice('sha256:'.length)}:`;
      for (const chunkId of units.keys()) if (chunkId.startsWith(prefix)) hits.push(hit(chunkId, hits.length + 1));
    }
    return { status: 'ok', hits, searched_kinds: [...new Set(rows.map(row => row.source_kind))].sort() };
  }
  // A database row names a document and a unit; only the pair this view already
  // holds becomes a hit, and a pair it does not hold is dropped and counted.
  async function fromDatabase(mode, query, topK) {
    if (database === null) return { status: 'not_connected', code: 'graph_database_not_connected', hits: [], searched_kinds: [] };
    const result = await database[mode](query, topK);
    if (result.status !== 'ok') return { ...result, hits: [], searched_kinds: [] };
    const hits = [], kinds = new Set();
    let unknown = 0;
    for (const row of result.hits) {
      const chunkId = `${row.doc_key.slice('sha256:'.length)}:${row.unit_id}`;
      if (!units.has(chunkId)) { unknown++; continue; }
      const unit = units.get(chunkId);
      kinds.add(unit.source_kind);
      hits.push({ rank: hits.length + 1, chunk_id: chunkId, ...unit,
        score: row.score, seed: row.seed });
    }
    return { status: 'ok', hits, searched_kinds: [...kinds].sort(),
      receipt: { mode, requested_top_k: topK ?? null, returned: result.hits.length, admitted: hits.length,
        not_in_generation: unknown, dropped_out_of_generation: result.dropped_out_of_generation ?? 0 } };
  }
  const vector = (query, topK) => fromDatabase('vector', query, topK);
  const hybrid = (query, topK) => fromDatabase('hybrid', query, topK);
  const graph = (query, topK) => fromDatabase('graph', query, topK);

  return Object.freeze({ catalog: () => catalog.map(row => ({ ...row })), lexical, exact, vector, hybrid, graph,
    connected: database !== null, kinds: () => [...groups.keys()].sort(), profile: RETRIEVAL_PROFILE });
}
