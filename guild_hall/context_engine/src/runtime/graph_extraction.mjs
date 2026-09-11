// Graph extraction for prepared source documents. neo4j-graphrag does the work
// in the worker (chunk embeddings, LLM entity/relation extraction, lexical graph,
// schema pruning); this module owns the fixed contract around it: bounded
// requests, loopback-only endpoints from a trusted binding, and fragment
// admission — chunk text must equal the source unit, every entity must point at
// an admitted chunk of its own document and carry a profile type, relationships
// stay inside the fragment, and every row carries project, document, profile and
// model provenance (installed model digest, not only the tag) with claim_state
// observed. Fragments are proposals; nothing here writes a graph or accepts meaning.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { runGraphragWorker } from '../adapters/graphrag/worker_client.mjs';
import { validateSourceDocument } from './source_documents.mjs';

export const GRAPH_FRAGMENT_SCHEMA = 'soulforge.context_graph_fragment.v1';
export const GRAPH_EXTRACTION_LIMITS = Object.freeze({ documents: 200, units: 5000, llm_calls: 5000,
  node_properties: 32, property_characters: 2000 });
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+_-]{0,199}$/u;
const TYPE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const LEXICAL_LABELS = new Set(['Document', 'Chunk']);
const LEXICAL_RELATIONSHIPS = new Set(['FROM_DOCUMENT', 'NEXT_CHUNK', 'FROM_CHUNK']);
// false/true/level: the thinking switch sent to the local model; null leaves the model default.
const THINK_VALUES = new Set([false, true, 'low', 'medium', 'high', null]);
const TRACE_FIELDS = ['call', 'status', 'input_sha256', 'output_sha256', 'output_characters', 'thinking_characters',
  'done_reason', 'prompt_tokens', 'output_tokens', 'elapsed_ms', 'error_type', 'http_status'];

export class GraphExtractionError extends Error {
  constructor(code) { super(code); this.name = 'GraphExtractionError'; this.code = code; }
}
const fail = code => { throw new GraphExtractionError(code); };

function loopback(url) {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && LOCAL_HOSTS.has(parsed.hostname); }
  catch { return false; }
}

// binding: { worker: { interpreter_path, timeout_ms? }, llm: { host, model, max_calls, options?, keep_alive?, think? },
//            embedder: { host, model } | null } — owned by the trusted configuration, not by the request.
export function validateGraphBinding(binding) {
  const llm = binding?.llm, embedder = binding?.embedder ?? null;
  if (!llm || !loopback(llm.host) || !TOKEN.test(llm.model ?? '') || !Number.isSafeInteger(llm.max_calls)
    || llm.max_calls < 1 || llm.max_calls > GRAPH_EXTRACTION_LIMITS.llm_calls) fail('graph_llm_binding_invalid');
  if (embedder !== null && (!loopback(embedder.host) || !TOKEN.test(embedder.model ?? ''))) fail('graph_embedder_binding_invalid');
  const options = llm.options === undefined ? { temperature: 0, seed: 7, num_predict: 2048 } : llm.options;
  const think = llm.think === undefined ? false : llm.think;
  if (typeof options !== 'object' || options === null || Array.isArray(options) || !THINK_VALUES.has(think)) {
    fail('graph_llm_binding_invalid');
  }
  return Object.freeze({ worker: binding.worker, llm: { host: llm.host, model: llm.model, max_calls: llm.max_calls,
    options, keep_alive: llm.keep_alive ?? '0s', think }, embedder: embedder && { host: embedder.host, model: embedder.model } });
}

// The worker reports the installed digest of each bound model; a missing or
// foreign model is a contract failure, not a softer label.
function workerModels(output, bound) {
  const llm = output?.models?.llm, embedder = output?.models?.embedder;
  if (llm?.model !== bound.llm.model || !DIGEST.test(llm?.digest ?? '')) fail('graph_worker_models_invalid');
  if (bound.embedder ? embedder?.model !== bound.embedder.model || !DIGEST.test(embedder?.digest ?? '') : embedder !== undefined) {
    fail('graph_worker_models_invalid');
  }
  return Object.freeze({ llm: llm.model, llm_digest: llm.digest, think: bound.llm.think, options: bound.llm.options,
    embedder: bound.embedder?.model ?? null, embedder_digest: embedder?.digest ?? null });
}

function toolPruning(summary) {
  const counts = value => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {})
    .filter(([reason, count]) => /^[A-Z_]{1,40}$/u.test(reason) && Number.isSafeInteger(count) && count >= 0).sort());
  return { nodes: counts(summary?.nodes), relationships: counts(summary?.relationships), properties: counts(summary?.properties) };
}

// Property values end up in a canonical hash that admits only strings, safe
// integers, booleans and null: other numbers become their decimal string and
// nested structures are dropped.
function cleanValue(value) {
  if (typeof value === 'string') return [...value].slice(0, GRAPH_EXTRACTION_LIMITS.property_characters).join('');
  if (value === null || typeof value === 'boolean' || Number.isSafeInteger(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function cleanProperties(properties) {
  const entries = Object.entries(properties ?? {}).filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u.test(key));
  if (entries.length > GRAPH_EXTRACTION_LIMITS.node_properties) fail('graph_fragment_bounds');
  return Object.fromEntries(entries.map(([key, value]) => {
    const clean = Array.isArray(value) ? value.map(cleanValue) : cleanValue(value);
    return [key, Array.isArray(clean) && clean.includes(undefined) ? undefined : clean];
  }).filter(([, value]) => value !== undefined));
}

// Embeddings are floats: the fragment keeps the vector, the hash covers its
// float64 bytes through a reference (dimensions + sha256).
function embeddingRef(embedding) {
  const bytes = Buffer.alloc(embedding.length * 8);
  embedding.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  return { dimensions: embedding.length, sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
}

// models: the worker-reported model revision from workerModels. Lexical nodes take
// their properties from the prepared document, not from the worker (the tool
// stamps a wall-clock createdAt, and chunk text must stay whole and exact).
export function admitGraphFragment({ fragment, document, projectKey, profile, models }) {
  if (fragment?.doc_key !== document.doc_key || !Array.isArray(fragment.nodes) || !Array.isArray(fragment.relationships)) {
    fail('graph_fragment_shape_invalid');
  }
  const unitOf = new Map(document.units.map((unit, index) => [`${document.doc_key}:${unit.unit_id}`, { unit, index }]));
  const entityLabels = new Set(profile.schema.node_types.map(type => type.label));
  const provenance = { sf_project: projectKey, sf_doc_key: document.doc_key, sf_profile: profile.profile_id,
    sf_profile_version: profile.profile_version, sf_claim_state: 'observed', sf_model: models.llm,
    sf_model_digest: models.llm_digest, sf_embedder: models.embedder, sf_embedder_digest: models.embedder_digest };
  const nodes = new Map(), seen = new Set(), dropped = { chunks_mismatched: 0, entities_without_chunk: 0,
    entities_reserved_label: 0, entities_outside_schema: 0, relationships_outside_fragment: 0 };
  const chunkOf = new Map();
  for (const rel of fragment.relationships) if (rel?.type === 'FROM_CHUNK') chunkOf.set(rel.start_node_id, rel.end_node_id);
  const admit = (node, unitId, properties) => {
    const embedding = node.embedding_properties?.embedding;
    if (embedding !== undefined && (!Array.isArray(embedding) || embedding.length === 0 || !embedding.every(Number.isFinite))) {
      fail('graph_fragment_shape_invalid');
    }
    nodes.set(node.id, { id: node.id, label: node.label, properties: { ...properties, ...provenance, sf_unit_id: unitId },
      embedding_ref: embedding ? embeddingRef(embedding) : null, embedding: embedding ?? null });
  };
  // Pass 1: the lexical graph (the document and chunks equal to their units).
  const entities = [];
  for (const node of fragment.nodes) {
    if (typeof node?.id !== 'string' || !TYPE.test(node.label ?? '') || seen.has(node.id)) fail('graph_fragment_shape_invalid');
    seen.add(node.id);
    if (node.id === document.doc_key) {
      if (node.label !== 'Document') fail('graph_fragment_document_mismatch');
      admit(node, null, cleanProperties({ path: document.doc_key, title: document.title }));
    } else if (unitOf.has(node.id)) {
      const { unit, index } = unitOf.get(node.id);
      if (node.label !== 'Chunk' || node.properties?.text !== unit.text || node.properties?.sf_unit_id !== unit.unit_id) {
        dropped.chunks_mismatched++;
      } else admit(node, unit.unit_id, { text: unit.text, index });
    } else entities.push(node);
  }
  if (!nodes.has(document.doc_key)) fail('graph_fragment_document_mismatch');
  // Pass 2: entities — a profile type, anchored to an admitted chunk.
  for (const node of entities) {
    if (LEXICAL_LABELS.has(node.label)) dropped.entities_reserved_label++;
    else if (!entityLabels.has(node.label)) dropped.entities_outside_schema++;
    else if (nodes.get(chunkOf.get(node.id))?.label !== 'Chunk') dropped.entities_without_chunk++;
    else admit(node, nodes.get(chunkOf.get(node.id)).properties.sf_unit_id, cleanProperties(node.properties));
  }
  const relationships = [];
  for (const rel of fragment.relationships) {
    if (!TYPE.test(rel?.type ?? '') || !nodes.has(rel.start_node_id) || !nodes.has(rel.end_node_id)) {
      dropped.relationships_outside_fragment++; continue;
    }
    relationships.push({ start_node_id: rel.start_node_id, end_node_id: rel.end_node_id, type: rel.type,
      properties: { ...cleanProperties(rel.properties), ...provenance } });
  }
  const orderedNodes = [...nodes.values()].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  relationships.sort((a, b) => a.type.localeCompare(b.type) || a.start_node_id.localeCompare(b.start_node_id)
    || a.end_node_id.localeCompare(b.end_node_id));
  const body = { schema_version: GRAPH_FRAGMENT_SCHEMA, doc_key: document.doc_key, project_key: projectKey,
    profile_id: profile.profile_id, profile_version: profile.profile_version, claim_state: 'observed',
    model: { ...models }, nodes: orderedNodes, relationships, tool_pruning: toolPruning(fragment.tool_pruning),
    stats: { chunks: orderedNodes.filter(node => node.label === 'Chunk').length,
      entities: orderedNodes.filter(node => !LEXICAL_LABELS.has(node.label)).length,
      entity_relationships: relationships.filter(rel => !LEXICAL_RELATIONSHIPS.has(rel.type)).length,
      embedded_chunks: orderedNodes.filter(node => node.label === 'Chunk' && node.embedding).length, ...dropped } };
  const hashed = { ...body, nodes: orderedNodes.map(({ embedding, ...node }) => node) };
  return Object.freeze({ ...body, fragment_sha256: sha256Canonical(hashed) });
}

// Installed model revisions for a binding, read before any extraction so a
// caller can decide whether earlier fragments still share this model revision.
export async function probeGraphModels({ binding, runWorker = runGraphragWorker }) {
  const bound = validateGraphBinding(binding);
  const { exit_code: exitCode, output } = await runWorker({ binding: bound.worker, request: { operation: 'probe',
    models: { llm: { host: bound.llm.host, model: bound.llm.model }, embedder: bound.embedder } } });
  if (exitCode !== 0 || output?.status !== 'ok') fail(String(output?.code ?? 'graph_worker_failed'));
  return workerModels(output, bound);
}

// expectedModels (optional): the probed revision; a different model answering
// the extraction is refused rather than mixed into one index.
export async function extractGraphFragments({ documents, projectKey, profile, binding, runWorker = runGraphragWorker,
  expectedModels = null }) {
  const bound = validateGraphBinding(binding);
  if (!Array.isArray(documents) || documents.length === 0 || documents.length > GRAPH_EXTRACTION_LIMITS.documents
    || !documents.every(validateSourceDocument) || !documents.every(doc => doc.project_key === projectKey)) fail('graph_documents_invalid');
  const unitCount = documents.reduce((sum, doc) => sum + doc.units.length, 0);
  if (unitCount > GRAPH_EXTRACTION_LIMITS.units) fail('graph_documents_invalid');
  if (!profile?.schema || !TOKEN.test(profile.profile_id?.replaceAll('/', '.') ?? '')) fail('graph_profile_invalid');
  const request = { operation: 'extract', profile: { schema: profile.schema, llm: bound.llm, embedder: bound.embedder,
    max_concurrency: profile.max_concurrency ?? 1 },
    documents: documents.map(doc => ({ doc_key: doc.doc_key, title: doc.title, units: doc.units.map(({ unit_id, text }) => ({ unit_id, text })) })) };
  const { exit_code: exitCode, output } = await runWorker({ binding: bound.worker, request });
  if (exitCode !== 0 || output?.status !== 'ok' || !Array.isArray(output.fragments)) {
    return Object.freeze({ status: 'failed', code: String(output?.code ?? 'graph_worker_failed'), fragments: [], llm: null });
  }
  const models = workerModels(output, bound);
  if (expectedModels !== null && !isDeepStrictEqual(models, expectedModels)) fail('graph_model_changed');
  const byKey = new Map(documents.map(doc => [doc.doc_key, doc]));
  const fragments = output.fragments.map(fragment => {
    const document = byKey.get(fragment?.doc_key);
    if (!document) fail('graph_fragment_document_mismatch');
    return admitGraphFragment({ fragment, document, projectKey, profile, models });
  });
  if (fragments.length !== documents.length || new Set(fragments.map(f => f.doc_key)).size !== documents.length) {
    fail('graph_fragment_count_mismatch');
  }
  // Only named metadata fields leave the worker trace: hashes, sizes, stop reason, time, tokens.
  const calls = (Array.isArray(output.llm_calls) ? output.llm_calls : []).map(row => Object.fromEntries(TRACE_FIELDS
    .filter(key => ['string', 'number'].includes(typeof row?.[key]) || row?.[key] === null).map(key => [key, row[key]])));
  const sum = key => calls.reduce((total, row) => total + (Number.isFinite(row[key]) ? row[key] : 0), 0);
  return Object.freeze({ status: output.budget_exhausted ? 'partial' : 'ok', fragments, model: models,
    llm: { calls: calls.filter(row => row.status !== 'budget_exhausted').length,
      errors: calls.filter(row => row.status === 'error').length, budget_exhausted: output.budget_exhausted === true,
      truncated: calls.filter(row => row.done_reason === 'length').length, prompt_tokens: sum('prompt_tokens'),
      output_tokens: sum('output_tokens'), thinking_characters: sum('thinking_characters'), elapsed_ms: sum('elapsed_ms'),
      trace: calls } });
}
