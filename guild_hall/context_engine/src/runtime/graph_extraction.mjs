// Graph extraction for prepared source documents. neo4j-graphrag does the work
// in the worker (chunk embeddings, LLM entity/relation extraction, lexical graph,
// schema pruning); this module owns the fixed contract around it: bounded
// requests, loopback-only endpoints from a trusted binding, and fragment
// admission — chunk text must equal the source unit, every entity must point at
// an admitted chunk of its own document and carry a profile type, relationships
// stay inside the fragment, and every row carries project, document, profile and
// model provenance (installed model digest, not only the tag) with claim_state
// observed. The revision covers the worker file and tool versions too, and an
// extraction that lost answers, truncated them or dropped a chunk is degraded,
// never ok. Fragments are proposals; nothing here writes a graph or accepts meaning.
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
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
const MAX_ALLOWED_MODEL_HOSTS = 8;
const LEXICAL_LABELS = new Set(['Document', 'Chunk']);
const LEXICAL_RELATIONSHIPS = new Set(['FROM_DOCUMENT', 'NEXT_CHUNK', 'FROM_CHUNK']);
// false/true/level: the thinking switch sent to the local model; null leaves the model default.
const THINK_VALUES = new Set([false, true, 'low', 'medium', 'high', null]);
// How the worker speaks to the model server. `ollama` reports a weight digest;
// `openai_chat` (llama.cpp, vLLM and friends) cannot, and is pinned by what the
// server says about itself instead — weaker, and labelled as such in the revision.
const TRANSPORTS = new Set(['ollama', 'openai_chat']);
const PIN_KINDS = new Set(['model_digest', 'server_props', 'served_id']);
const TRACE_FIELDS = ['call', 'status', 'input_sha256', 'output_sha256', 'output_characters', 'thinking_characters',
  'done_reason', 'prompt_tokens', 'output_tokens', 'elapsed_ms', 'error_type', 'http_status'];

export class GraphExtractionError extends Error {
  constructor(code) { super(code); this.name = 'GraphExtractionError'; this.code = code; }
}
const fail = code => { throw new GraphExtractionError(code); };

function loopback(url, protocols = ['http:', 'https:']) {
  try { const parsed = new URL(url); return protocols.includes(parsed.protocol) && LOCAL_HOSTS.has(parsed.hostname); }
  catch { return false; }
}

// A model endpoint that is not on this host. The binding must name it exactly —
// an origin, not a range — so the address text is answerable from the binding and
// its hash alone. Plaintext is refused off-host: on loopback nothing leaves the
// machine, but over a network http would put document text on the wire in clear.
export function validateAllowedModelHosts(hosts) {
  if (hosts === undefined || hosts === null) return Object.freeze([]);
  if (!Array.isArray(hosts) || hosts.length > MAX_ALLOWED_MODEL_HOSTS) fail('graph_model_hosts_invalid');
  const origins = hosts.map(value => {
    let parsed;
    try { parsed = new URL(value); } catch { return fail('graph_model_hosts_invalid'); }
    if (parsed.protocol !== 'https:') fail('graph_model_host_not_https');
    if (LOCAL_HOSTS.has(parsed.hostname)) fail('graph_model_host_redundant');
    if (parsed.pathname !== '/' || parsed.search || parsed.username || parsed.password) fail('graph_model_hosts_invalid');
    return parsed.origin;
  });
  if (new Set(origins).size !== origins.length) fail('graph_model_hosts_invalid');
  return Object.freeze(origins);
}

// Where a model may be called: this host always, plus exactly the named origins.
function modelHostAdmitted(url, allowedOrigins) {
  if (loopback(url)) return true;
  try { return allowedOrigins.includes(new URL(url).origin); } catch { return false; }
}

// binding.neo4j: { uri, user, password_file, database? } | null — the graph database
// this project's index is loaded into and searched from. The address must be a
// loopback bolt endpoint, and the password is a file the trusted configuration
// names: this process never holds the value, and no request may supply either.
export function validateNeo4jBinding(neo4j) {
  if (neo4j === null || neo4j === undefined) return null;
  if (!loopback(neo4j.uri, ['bolt:', 'neo4j:'])) fail('graph_neo4j_endpoint_not_loopback');
  if (!TOKEN.test(neo4j.user ?? '') || (neo4j.database !== undefined && neo4j.database !== null
    && !TOKEN.test(neo4j.database))) fail('graph_neo4j_binding_invalid');
  const passwordFile = neo4j.password_file;
  if (typeof passwordFile !== 'string' || !isAbsolute(passwordFile)) fail('graph_neo4j_binding_invalid');
  const resolved = resolve(passwordFile);
  let stat;
  // A symlink or a path that resolves elsewhere would let the file the binding
  // names and the file that is read come apart.
  try { stat = lstatSync(resolved); } catch { fail('graph_neo4j_password_file_missing'); }
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(resolved) !== resolved) fail('graph_neo4j_password_file_refused');
  return Object.freeze({ uri: neo4j.uri, user: neo4j.user, password_file: resolved,
    database: neo4j.database ?? null });
}

// binding: { worker: { interpreter_path, timeout_ms? }, llm: { host, model, max_calls, options?, keep_alive?, think? },
//            embedder: { host, model } | null, neo4j?: { uri, user, password_file, database? } | null,
//            allowed_model_hosts?: string[] }
//            — owned by the trusted configuration, not by the request. `neo4j` is
//            optional: without it, extraction still runs and the graph database
//            operations report that they are not connected. `allowed_model_hosts`
//            is likewise optional: empty means models may only be called on this
//            host, which is the default.
export function validateGraphBinding(binding) {
  const llm = binding?.llm, embedder = binding?.embedder ?? null;
  const allowedModelHosts = validateAllowedModelHosts(binding?.allowed_model_hosts);
  if (!llm || !modelHostAdmitted(llm.host, allowedModelHosts) || !TOKEN.test(llm.model ?? '')
    || !Number.isSafeInteger(llm.max_calls) || llm.max_calls < 1
    || llm.max_calls > GRAPH_EXTRACTION_LIMITS.llm_calls) fail('graph_llm_binding_invalid');
  if (embedder !== null && (!modelHostAdmitted(embedder.host, allowedModelHosts)
    || !TOKEN.test(embedder.model ?? ''))) fail('graph_embedder_binding_invalid');
  // A -cloud model runs on the vendor service behind the local server: loopback alone keeps nothing on this host.
  if (llm.model.endsWith('-cloud') || embedder?.model?.endsWith('-cloud')) fail('graph_model_not_local');
  const options = llm.options === undefined ? { temperature: 0, seed: 7, num_predict: 2048 } : llm.options;
  const think = llm.think === undefined ? false : llm.think;
  const transport = llm.transport === undefined ? 'ollama' : llm.transport;
  if (typeof options !== 'object' || options === null || Array.isArray(options) || !THINK_VALUES.has(think)
    || !TRANSPORTS.has(transport)
    || !Object.values(options).every(value => ['string', 'boolean'].includes(typeof value) || Number.isFinite(value))) {
    fail('graph_llm_binding_invalid');
  }
  return Object.freeze({ worker: binding.worker, llm: { host: llm.host, model: llm.model, max_calls: llm.max_calls,
    options, keep_alive: llm.keep_alive ?? '0s', think, transport }, embedder: embedder && { host: embedder.host, model: embedder.model },
  neo4j: validateNeo4jBinding(binding?.neo4j ?? null), allowed_model_hosts: allowedModelHosts });
}

// The worker reports the installed digest of each bound model; a missing or
// foreign model is a contract failure, not a softer label.
function workerModels(output, bound, workerSha256) {
  const llm = output?.models?.llm, embedder = output?.models?.embedder, packages = output?.packages;
  if (llm?.model !== bound.llm.model || !DIGEST.test(llm?.digest ?? '')) fail('graph_worker_models_invalid');
  // An Ollama server reports a weight digest; an OpenAI-compatible one can only be
  // pinned by what it says about itself. Both are recorded, never conflated.
  const llmPin = llm.pin_kind ?? 'model_digest';
  if (!PIN_KINDS.has(llmPin)) fail('graph_worker_models_invalid');
  if (bound.embedder ? embedder?.model !== bound.embedder.model || !DIGEST.test(embedder?.digest ?? '') : embedder !== undefined) {
    fail('graph_worker_models_invalid');
  }
  // The tool prompt and pruning change with its version and with our worker file.
  if (!DIGEST.test(workerSha256 ?? '') || !packages || typeof packages !== 'object' || typeof packages['neo4j-graphrag'] !== 'string') {
    fail('graph_worker_models_invalid');
  }
  const tool = { worker_sha256: workerSha256, packages: Object.fromEntries(Object.entries(packages)
    .filter(([name, version]) => /^[A-Za-z0-9._-]{1,64}$/u.test(name) && (version === null || (typeof version === 'string' && version.length <= 64)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
  return Object.freeze({ llm: llm.model, llm_digest: llm.digest, llm_pin_kind: llmPin, transport: bound.llm.transport,
    think: bound.llm.think, options: hashableOptions(bound.llm.options),
    embedder: bound.embedder?.model ?? null, embedder_digest: embedder?.digest ?? null, tool });
}

// Model options are part of the revision and enter a canonical hash that takes
// only safe integers: other numbers (temperature 0.2) become decimal strings.
export function hashableOptions(options) {
  return Object.fromEntries(Object.entries(options).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => [key, typeof value === 'number' && !Number.isSafeInteger(value) ? String(value) : value]));
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
    sf_model_digest: models.llm_digest, sf_embedder: models.embedder, sf_embedder_digest: models.embedder_digest,
    sf_revision_sha256: sha256Canonical(models) };
  const nodes = new Map(), seen = new Set(), dropped = { chunks_mismatched: 0, entities_without_chunk: 0,
    entities_reserved_label: 0, entities_outside_schema: 0, relationships_outside_fragment: 0, duplicate_ids: 0 };
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
    if (typeof node?.id !== 'string' || !TYPE.test(node.label ?? '')) fail('graph_fragment_shape_invalid');
    // A repeated id (the model reusing one inside a chunk) is dropped and counted, not fatal: seeded runs would repeat it.
    if (seen.has(node.id)) { dropped.duplicate_ids++; continue; }
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
    source_text_sha256: document.text_sha256,
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
  const { exit_code: exitCode, output, worker_sha256: workerSha256 } = await runWorker({ binding: bound.worker,
    request: { operation: 'probe', allowed_hosts: bound.allowed_model_hosts,
      models: { llm: { host: bound.llm.host, model: bound.llm.model, transport: bound.llm.transport },
        embedder: bound.embedder } } });
  if (exitCode !== 0 || output?.status !== 'ok') fail(String(output?.code ?? 'graph_worker_failed'));
  return workerModels(output, bound, workerSha256);
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
    allowed_hosts: bound.allowed_model_hosts, max_concurrency: profile.max_concurrency ?? 1 },
    documents: documents.map(doc => ({ doc_key: doc.doc_key, title: doc.title, units: doc.units.map(({ unit_id, text }) => ({ unit_id, text })) })) };
  const { exit_code: exitCode, output, worker_sha256: workerSha256 } = await runWorker({ binding: bound.worker, request });
  if (exitCode !== 0 || output?.status !== 'ok' || !Array.isArray(output.fragments)) {
    return Object.freeze({ status: 'failed', code: String(output?.code ?? 'graph_worker_failed'), fragments: [], llm: null, degraded: null });
  }
  const models = workerModels(output, bound, workerSha256);
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
  const llm = { calls: calls.filter(row => row.status !== 'budget_exhausted').length,
    errors: calls.filter(row => row.status === 'error').length, invalid_outputs: calls.filter(row => row.status === 'invalid_output').length,
    budget_exhausted: output.budget_exhausted === true, truncated: calls.filter(row => row.done_reason === 'length').length,
    prompt_tokens: sum('prompt_tokens'), output_tokens: sum('output_tokens'), thinking_characters: sum('thinking_characters'),
    elapsed_ms: sum('elapsed_ms'), embedder_calls: Number.isSafeInteger(output.embedder_calls) ? output.embedder_calls : 0, trace: calls };
  // A failed, unreadable or cut-off answer and a chunk that no longer equals its
  // unit each leave a hole that the fragment stats alone would hide.
  const documentsDegraded = fragments.map(f => ({ doc_key: f.doc_key, chunks_mismatched: f.stats.chunks_mismatched,
    missing_chunks: byKey.get(f.doc_key).units.length - f.stats.chunks })).filter(row => row.chunks_mismatched > 0 || row.missing_chunks > 0);
  const degraded = llm.budget_exhausted || llm.errors > 0 || llm.invalid_outputs > 0 || llm.truncated > 0 || documentsDegraded.length > 0
    ? { budget_exhausted: llm.budget_exhausted, errors: llm.errors, invalid_outputs: llm.invalid_outputs, truncated: llm.truncated,
      documents: documentsDegraded } : null;
  return Object.freeze({ status: llm.budget_exhausted ? 'partial' : degraded ? 'degraded' : 'ok', fragments, model: models, llm, degraded });
}
