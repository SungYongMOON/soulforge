// Retrieval over the selected graph index generation of one project. Lexical
// search reuses the shared BM25 corpus search (bm25-v1, baseline A) over the
// prepared source units; exact lookup takes an item id from the manifest.
// Vector, hybrid and graph-expansion search belong to Neo4j GraphRAG and report
// not_connected until a graph database binding exists — they are not rebuilt
// here. Every hit carries its source kind, item, unit, locator, time and
// revision, and nothing outside the view's project is searched.
import { retrieveAdmittedDocuments, RETRIEVAL_PROFILE } from '../../algorithms/retrieval/bm25_v1.mjs';

const MAX_CHUNKS_PER_SOURCE = 20000;
const MAX_SOURCES = 16;
const MAX_QUERY_CHARACTERS = 8000;

export class GraphIndexRetrievalError extends Error {
  constructor(code) { super(code); this.name = 'GraphIndexRetrievalError'; this.code = code; }
}
const fail = code => { throw new GraphIndexRetrievalError(code); };

export function createGraphIndexRetriever(view) {
  view.assertCurrent();
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
  // One BM25 space over all units; chunks are grouped by source kind so the
  // shared search's per-source cap spreads hits across kinds. The shared
  // contract requires a page list; units carry their own locators, so page 1 is
  // a placeholder that no hit reads back.
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
  function graph() {
    return { status: 'not_connected', code: 'graph_database_not_connected', hits: [], searched_kinds: [] };
  }
  return Object.freeze({ catalog: () => catalog.map(row => ({ ...row })), lexical, exact, graph,
    kinds: () => [...groups.keys()].sort(), profile: RETRIEVAL_PROFILE });
}
