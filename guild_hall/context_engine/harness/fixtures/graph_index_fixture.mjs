// Synthetic project store for graph index and 맥락이 tests: the Plan 17 template,
// an exact document grant over two synthetic memos kept outside the store, an
// ACL with an indexer and a reader, and a sha-pinned graph index binding. The
// canned worker (named as such) answers probe and extraction without a model.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ref } from './accepted_context_fixture.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE as TEMPLATE } from '../../../path_registry/src/target_materializer.mjs';
import { SOURCE_GRANT_SCHEMA } from '../../src/runtime/source_documents.mjs';
import { GRAPH_INDEX_BINDING_FILE, GRAPH_INDEX_BINDING_MODE, graphProfilePin } from '../../src/runtime/graph_index_generation.mjs';

export const INDEX_NOW = '2026-09-12T00:00:00.000Z';
export const INDEX_FS_KEY = 'P-SYN-GRAPH';
export const INDEX_PROJECT = `data_root/20_PROJECTS/${INDEX_FS_KEY}`;
export const INDEX_MEMOS = Object.freeze({
  'memo-a.md': '# 시험 장비 A 설계 메모\n\n요청자가 응답기 장표를 다음 주 화요일까지 요청했다.\n',
  'memo-b.md': '# 전원 조건\n\n전원 조건은 28V로 바뀌었고 이전 24V 조건은 취소한다.\n',
});
export const CANNED_LLM_DIGEST = 'sha256:' + 'c'.repeat(64);
export const CANNED_EMBEDDER_DIGEST = 'sha256:' + 'e'.repeat(64);
// A fixed four-dimension vector: the canned database never measures distance, so
// the value only has to be a well-formed embedding the admission accepts.
export const CANNED_EMBEDDING = Object.freeze([0.1, 0.2, 0.3, 0.4]);
// A second embedder, for a re-embedding: a different digest and a different
// number of dimensions, so a vector that was not replaced is visible at a glance.
export const CANNED_REEMBED_DIGEST = 'sha256:' + '8'.repeat(64);
export const CANNED_REEMBEDDING = Object.freeze([0.5, 0.6, 0.7, 0.8, 0.9, 1]);
export const CANNED_WORKER_SHA256 = 'sha256:' + 'f'.repeat(64);
export const CANNED_PACKAGES = Object.freeze({ neo4j: '6.0.0', 'neo4j-graphrag': '1.19.0', ollama: '0.4.9', pydantic: '2.11.0' });
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
export const indexerRequest = extra => ({ actor_ref: 'actor:indexer', project_ref: ref(1), purpose: 'context_preparation', ...extra });
export const READER_REQUEST = Object.freeze({ actor_ref: 'actor:reader', project_ref: ref(1), purpose: 'context_query' });

// neo4j: false for no graph database (the default), true for a loopback binding
// with a synthetic one-line password file, or an object to override its fields.
// `writeOperations` is what the binding authorizes this actor to do. It defaults
// to the index operation alone so existing callers keep the binding they had.
export async function makeGraphIndexStore({ dataClass = 'public_synthetic', aclDataClasses = ['public_synthetic'], sourceInsideStore = false,
  memos = INDEX_MEMOS, neo4j = false, embedder = null, writeOperations = ['index'],
  // A second project for tests about a database that holds more than one. Both
  // default to the single synthetic project every existing caller already gets.
  projectRef = ref(1), fsKey = INDEX_FS_KEY } = {}) {
  const projectPath = `data_root/20_PROJECTS/${fsKey}`;
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-index-store-'));
  const sourceRoot = sourceInsideStore ? path.join(storeRoot, 'sources') : await mkdtemp(path.join(os.tmpdir(), 'ctx-index-src-'));
  await mkdir(sourceRoot, { recursive: true });
  for (const [name, body] of Object.entries(memos)) await writeFile(path.join(sourceRoot, name), body);
  for (const dir of TEMPLATE) await mkdir(path.join(storeRoot, projectPath, dir), { recursive: true });
  const put = async (rel, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await mkdir(path.dirname(path.join(storeRoot, rel)), { recursive: true });
    await writeFile(path.join(storeRoot, rel), bytes);
    return { path: rel, sha256: sha(bytes) };
  };
  const projectKey = exactRefIdentityKey(projectRef);
  const grant = await put(`${projectPath}/00_프로젝트_안내/grants/grant.synthetic.index.json`, { schema_version: SOURCE_GRANT_SCHEMA,
    grant_id: 'grant.synthetic.index', project_ref: projectRef, purposes: ['context_preparation'], allowed_data_classes: [dataClass],
    valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z', sources: [{ kind: 'document', root_ref: 'doc.synthetic',
      items: Object.keys(memos).map(name => ({ item_id: name.replace('.md', ''), revision_policy: 'latest_in_custody', revision_sha256: null,
        data_class: dataClass, path: [name] })) }] });
  const aclPath = `${projectPath}/00_프로젝트_안내/acl.json`;
  const acl = { actors: [
    { actor_ref: 'actor:indexer', grant: { allowed_projects: [projectKey], allowed_scopes: ['project'],
      allowed_purposes: ['context_preparation', 'context_query'], allowed_data_classes: aclDataClasses } },
    { actor_ref: 'actor:reader', grant: { allowed_projects: [projectKey], allowed_scopes: ['project'],
      allowed_purposes: ['context_query'], allowed_data_classes: aclDataClasses } }], revoked_actors: [] };
  await put(aclPath, acl);
  let neo4jBinding = null, passwordFile = null;
  if (neo4j) {
    // A real file: the binding refuses a password path that is absent, a symlink,
    // or one whose real path differs from the one it names.
    passwordFile = path.join(realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-index-secret-'))), 'neo4j_password.txt');
    await writeFile(passwordFile, 'synthetic-not-a-real-password\n');
    neo4jBinding = { uri: 'bolt://127.0.0.1:7687', user: 'neo4j', password_file: passwordFile, database: null,
      ...(neo4j === true ? {} : neo4j) };
  }
  const binding = { mode: GRAPH_INDEX_BINDING_MODE, project_ref: projectRef, approved_fs_key: fsKey, acl_path: aclPath,
    write_authority: { actors: ['actor:indexer'], operations: [...writeOperations] }, grant, source_roots: { 'doc.synthetic': sourceRoot },
    graph: { worker: { interpreter_path: path.join(os.tmpdir(), 'unused-python.exe') },
      llm: { host: 'http://127.0.0.1:11434', model: 'local-model:tag', max_calls: 50 }, embedder, neo4j: neo4jBinding },
    profile: graphProfilePin() };
  const { sha256: bindingSha256 } = await put(GRAPH_INDEX_BINDING_FILE, binding);
  return { storeRoot, sourceRoot, bindingSha256, binding, put, acl, aclPath, passwordFile, projectKey, fsKey, projectRef };
}

// Canned worker: answers the probe with one model revision and the extraction
// with one chunk and one equipment entity per unit. invalidOutputs marks that
// many calls as answers the extractor could not read (a degraded extraction).
// A bound embedder is echoed back with its own digest, and its chunk vectors are
// fixed values: the real worker reports both, and a revision missing one is refused.
export function cannedGraphWorker({ digest = CANNED_LLM_DIGEST, embedderDigest = CANNED_EMBEDDER_DIGEST,
  reembedDigest = CANNED_REEMBED_DIGEST, embedRefuses = [], budgetExhausted = false, invalidOutputs = 0,
  packages = CANNED_PACKAGES } = {}) {
  const calls = { probe: 0, extract: 0, embed: 0, extracted: [], embedded: [], batches: [] };
  const reported = spec => (spec ? { embedder: { model: spec.model, digest: embedderDigest } } : {});
  async function runWorker({ request }) {
    // A re-embedding: the same chunks, a second embedder, no model and no graph.
    // `embedRefuses` names the units this embedder will not take, which is how a
    // chunk too long for the model is answered.
    if (request.operation === 'embed') {
      calls.embed++;
      const refused = request.chunks.filter(chunk => embedRefuses.includes(chunk.unit_id));
      const taken = request.chunks.filter(chunk => !embedRefuses.includes(chunk.unit_id));
      calls.embedded.push(...taken.map(chunk => `${chunk.doc_key}:${chunk.unit_id}`));
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
        output: { status: refused.length ? 'incomplete' : 'ok', code: refused.length ? 'embed_input_refused' : null,
          packages, models: { embedder: { model: request.profile.embedder.model, digest: reembedDigest, pin_kind: 'model_digest' } },
          vectors: taken.map(chunk => ({ doc_key: chunk.doc_key, unit_id: chunk.unit_id,
            dimensions: CANNED_REEMBEDDING.length, embedding: [...CANNED_REEMBEDDING] })),
          refused: refused.map(chunk => ({ doc_key: chunk.doc_key, unit_id: chunk.unit_id,
            characters: chunk.text.length, error_type: 'ResponseError' })),
          dimensions: taken.length ? [CANNED_REEMBEDDING.length] : [],
          embedder_calls: taken.length, elapsed_ms: 7 } };
    }
    if (request.operation === 'probe') {
      calls.probe++;
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
        output: { status: 'ok', packages,
          models: { llm: { model: request.models.llm.model, digest }, ...reported(request.models.embedder) } } };
    }
    calls.batches.push(request.documents.length);
    calls.extract++;
    const fragments = request.documents.map(document => {
      calls.extracted.push(document.doc_key);
      const nodes = [{ id: document.doc_key, label: 'Document', properties: {}, embedding_properties: {} }], relationships = [];
      document.units.forEach((unit, index) => {
        const chunk = `${document.doc_key}:${unit.unit_id}`;
        nodes.push({ id: chunk, label: 'Chunk', properties: { text: unit.text, index, sf_unit_id: unit.unit_id },
          embedding_properties: request.profile.embedder ? { embedding: CANNED_EMBEDDING } : {} });
        nodes.push({ id: `${chunk}:0`, label: 'Equipment', properties: { name: `장비 ${index}` }, embedding_properties: {} });
        relationships.push({ start_node_id: chunk, end_node_id: document.doc_key, type: 'FROM_DOCUMENT', properties: {} });
        relationships.push({ start_node_id: `${chunk}:0`, end_node_id: chunk, type: 'FROM_CHUNK', properties: {} });
      });
      return { doc_key: document.doc_key, nodes, relationships, tool_pruning: { nodes: {}, relationships: {}, properties: {} } };
    });
    const units = request.documents.flatMap(document => document.units);
    return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256, output: { status: 'ok', packages,
      models: { llm: { model: request.profile.llm.model, digest }, ...reported(request.profile.embedder) },
      embedder_calls: request.profile.embedder ? units.length : 0, fragments, budget_exhausted: budgetExhausted,
      llm_calls: units.map((unit, index) => ({ call: index + 1,
        status: budgetExhausted && index > 0 ? 'budget_exhausted' : index < invalidOutputs ? 'invalid_output' : 'ok',
        input_sha256: 'sha256:' + 'd'.repeat(64), prompt_tokens: 10, output_tokens: 5, elapsed_ms: 3 })) } };
  }
  return { runWorker, calls };
}


// Canned graph database: answers materialize, retrieve and link without a server. It
// keeps the generation it was told to load so a repeat reports loaded=false, the
// way a real database reports a generation it already holds, and answers a search
// with the rows the caller hands it (a row outside the generation included, so the
// caller's own admission can be tested).
export function cannedGraphDatabaseWorker({ hits = [], loaded = null, edges = [], expansion = null } = {}) {
  const calls = { materialize: 0, retrieve: 0, link: 0, related: 0, modes: [], requests: [] };
  const held = new Set(loaded === null ? [] : [loaded]);
  async function runWorker({ request }) {
    calls.requests.push(request);
    // A judged relation between two chunks: the canned database reports back the
    // rows it was handed, and creates them only when the request says to apply.
    if (request.operation === 'link_related_evidence') {
      calls.related++;
      if (!held.has(request.generation_id)) {
        return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
          output: { status: 'not_loaded', code: 'generation_not_materialized', edges: [], applied: false,
            generations_present: [...held] } };
      }
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
        output: { status: 'ok', rule: request.rule, relationship: 'RELATED_EVIDENCE', applied: request.apply === true,
          project_key: request.project_key, generation_id: request.generation_id,
          counts: { requested: request.relations.length, created: request.apply === true ? request.relations.length : 0,
            existing: 0 },
          edges: request.relations.map(row => ({ a_doc_key: row.a_doc_key, a_unit_id: row.a_unit_id,
            b_doc_key: row.b_doc_key, b_unit_id: row.b_unit_id, judgement_id: row.judgement_id,
            relation_kind: row.relation_kind, direction: row.direction })) } };
    }
    // An explicit-reference link: the canned database reports the edges it was
    // handed, and creates them only when the request says to apply.
    if (request.operation === 'link_explicit_refs') {
      calls.link++;
      if (!held.has(request.generation_id)) {
        return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
          output: { status: 'not_loaded', code: 'generation_not_materialized', edges: [], applied: false,
            generations_present: [...held] } };
      }
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
        output: { status: 'ok', rule: request.rule, relationship: 'REFERS_TO', applied: request.apply === true,
          project_key: request.project_key, generation_id: request.generation_id,
          counts: { identifiers: Object.keys(request.identifiers ?? {}).length, scanned: edges.length,
            candidates: edges.length, created: request.apply === true ? edges.length : 0, existing: 0 },
          edges } };
    }
    if (request.operation === 'materialize') {
      calls.materialize++;
      if (held.has(request.generation_id)) {
        return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
          output: { status: 'ok', loaded: false, code: 'generation_already_loaded',
            counts: { nodes: 0 }, generations_present: [...held] } };
      }
      const superseded = [...held];
      held.clear();
      held.add(request.generation_id);
      const nodes = request.fragments.reduce((total, fragment) => total + fragment.nodes.length, 0);
      const relationships = request.fragments.reduce((total, fragment) => total + fragment.relationships.length, 0);
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
        output: { status: 'ok', loaded: true, counts: { fragments: request.fragments.length, nodes, relationships },
          superseded, removed_nodes: 0, indexes: { vector: 'sf_chunk_vector', fulltext: 'sf_chunk_fulltext', dimensions: 4 } } };
    }
    calls.retrieve++;
    calls.modes.push(request.mode);
    if (!held.has(request.generation_id)) {
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
        output: { status: 'not_loaded', code: 'generation_not_materialized', hits: [], generations_present: [...held] } };
    }
    return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256,
      output: { status: 'ok', mode: request.mode, generation_id: request.generation_id, hits,
        whole_generation: request.whole_generation === true,
        chunks_in_generation: request.whole_generation === true ? hits.length : null,
        expansion: request.mode === 'graph' ? { enabled_rules: request.expansion?.enabled_rules ?? ['L1', 'R1'],
          limits: request.expansion ?? null, seed_top_k: request.top_k, seeds: hits.filter(row => row.seed).length,
          inflow: hits.filter(row => !row.seed).length, candidates: hits.length, ...(expansion ?? {}) } : null,
        dropped_out_of_generation: 0, embedder: { model: request.embedder?.model ?? null, digest: CANNED_LLM_DIGEST } } };
  }
  return { runWorker, calls, held };
}

// A stand-in for the unified database: one store holding many projects, each with
// one loaded generation. Unlike the canned database above it keeps the nodes, so
// what a load removed and what it left alone are countable rather than asserted.
// It implements the same three rules the worker does -- a load replaces only
// (this project, its previous generation), a search sees only (this project, this
// generation), and a repeat of a loaded generation changes nothing -- and it can
// be told to leak a foreign row, which is how the caller's own admission is tested.
export function sharedGraphDatabase({ leak = null } = {}) {
  const nodes = [];          // { project, generation, doc_key, unit_id, text }
  const generations = new Map();   // project -> { generation_id, loaded_at }
  const calls = { materialize: 0, retrieve: 0, inspect: 0, requests: [] };
  let clock = 0;
  const chunksOf = fragments => fragments.flatMap(fragment => fragment.nodes
    .filter(node => typeof node.properties?.sf_unit_id === 'string')
    .map(node => ({ doc_key: fragment.doc_key, unit_id: node.properties.sf_unit_id, text: node.properties.text ?? '' })));

  async function runWorker({ request }) {
    calls.requests.push(request);
    const project = request.project_key;
    if (request.operation === 'inspect') {
      calls.inspect++;
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256, output: { status: 'ok',
        projects: [...generations].map(([key, row]) => ({ project_key: key, generation_id: row.generation_id,
          loaded_at: row.loaded_at, nodes: nodes.filter(node => node.project === key).length,
          chunks: nodes.filter(node => node.project === key).length, embedded_chunks: 0, rule_edges: {} })),
        total_nodes: nodes.length, unscoped_nodes: 0, residue_nodes: 0, materialize_lock: [],
        indexes: { vector: { name: 'sf_chunk_vector', dimensions: 4, filter_properties: ['sf_project', 'sf_generation'] },
          fulltext: 'sf_chunk_fulltext' } } };
    }
    if (request.operation === 'materialize') {
      calls.materialize++;
      const held = generations.get(project) ?? null;
      if (held?.generation_id === request.generation_id) {
        return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256, output: { status: 'ok', loaded: false,
          code: 'generation_already_loaded', generations_present: [held.generation_id],
          counts: { nodes: nodes.filter(node => node.project === project).length } } };
      }
      const before = nodes.length;
      for (let index = nodes.length - 1; index >= 0; index--) {
        if (nodes[index].project === project && nodes[index].generation === held?.generation_id) nodes.splice(index, 1);
      }
      const removed = before - nodes.length;
      for (const chunk of chunksOf(request.fragments)) {
        nodes.push({ project, generation: request.generation_id, ...chunk });
      }
      const loadedAt = `2026-09-14T00:00:${String(clock++).padStart(2, '0')}.000Z`;
      generations.set(project, { generation_id: request.generation_id, loaded_at: loadedAt });
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256, output: { status: 'ok', loaded: true,
        loaded_at: loadedAt, counts: { fragments: request.fragments.length, nodes: request.fragments.reduce((total, f) => total + f.nodes.length, 0),
          relationships: request.fragments.reduce((total, f) => total + f.relationships.length, 0),
          chunks: nodes.filter(node => node.project === project).length },
        superseded: held ? [held.generation_id] : [], removed_nodes: removed,
        indexes: { vector: 'sf_chunk_vector', fulltext: 'sf_chunk_fulltext', dimensions: 4,
          filter_properties: ['sf_project', 'sf_generation'] },
        other_projects: [...generations].filter(([key]) => key !== project)
          .map(([key, row]) => ({ project_key: key, generation_id: row.generation_id, loaded_at: row.loaded_at })) } };
    }
    calls.retrieve++;
    const held = generations.get(project) ?? null;
    if (held?.generation_id !== request.generation_id) {
      return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256, output: { status: 'not_loaded',
        code: 'generation_not_materialized', hits: [], generations_present: held ? [held.generation_id] : [] } };
    }
    const scoped = nodes.filter(node => node.project === project && node.generation === request.generation_id);
    const hits = scoped.slice(0, request.top_k).map((node, index) => ({ sf_doc_key: node.doc_key,
      sf_unit_id: node.unit_id, sf_generation: node.generation, text: node.text, score: 1 - index * 0.01, seed: index === 0 }));
    // A database that forgot the scope: the row is offered, and the caller decides.
    if (leak) hits.push({ ...leak, score: 0.5, seed: false });
    return { exit_code: 0, worker_sha256: CANNED_WORKER_SHA256, output: { status: 'ok', mode: request.mode,
      project_key: project, generation_id: request.generation_id, hits, dropped_out_of_generation: 0,
      retrieval: { filter_stage: 'in_index_filter', index_filter_properties: ['sf_project', 'sf_generation'],
        index_dimensions: 4, vector_requested: request.top_k, vector_in_scope: hits.length, vector_starved: false },
      whole_generation: request.whole_generation === true, expansion: null,
      embedder: { model: request.embedder?.model ?? null, digest: CANNED_LLM_DIGEST } } };
  }
  return { runWorker, calls,
    rows: () => nodes.map(node => ({ ...node })),
    loaded: () => Object.fromEntries([...generations].map(([key, row]) => [key, row.generation_id])) };
}
