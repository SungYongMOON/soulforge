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
  memos = INDEX_MEMOS, neo4j = false, embedder = null, writeOperations = ['index'] } = {}) {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-index-store-'));
  const sourceRoot = sourceInsideStore ? path.join(storeRoot, 'sources') : await mkdtemp(path.join(os.tmpdir(), 'ctx-index-src-'));
  await mkdir(sourceRoot, { recursive: true });
  for (const [name, body] of Object.entries(memos)) await writeFile(path.join(sourceRoot, name), body);
  for (const dir of TEMPLATE) await mkdir(path.join(storeRoot, INDEX_PROJECT, dir), { recursive: true });
  const put = async (rel, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await mkdir(path.dirname(path.join(storeRoot, rel)), { recursive: true });
    await writeFile(path.join(storeRoot, rel), bytes);
    return { path: rel, sha256: sha(bytes) };
  };
  const projectKey = exactRefIdentityKey(ref(1));
  const grant = await put(`${INDEX_PROJECT}/00_프로젝트_안내/grants/grant.synthetic.index.json`, { schema_version: SOURCE_GRANT_SCHEMA,
    grant_id: 'grant.synthetic.index', project_ref: ref(1), purposes: ['context_preparation'], allowed_data_classes: [dataClass],
    valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z', sources: [{ kind: 'document', root_ref: 'doc.synthetic',
      items: Object.keys(memos).map(name => ({ item_id: name.replace('.md', ''), revision_policy: 'latest_in_custody', revision_sha256: null,
        data_class: dataClass, path: [name] })) }] });
  const aclPath = `${INDEX_PROJECT}/00_프로젝트_안내/acl.json`;
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
  const binding = { mode: GRAPH_INDEX_BINDING_MODE, project_ref: ref(1), approved_fs_key: INDEX_FS_KEY, acl_path: aclPath,
    write_authority: { actors: ['actor:indexer'], operations: [...writeOperations] }, grant, source_roots: { 'doc.synthetic': sourceRoot },
    graph: { worker: { interpreter_path: path.join(os.tmpdir(), 'unused-python.exe') },
      llm: { host: 'http://127.0.0.1:11434', model: 'local-model:tag', max_calls: 50 }, embedder, neo4j: neo4jBinding },
    profile: graphProfilePin() };
  const { sha256: bindingSha256 } = await put(GRAPH_INDEX_BINDING_FILE, binding);
  return { storeRoot, sourceRoot, bindingSha256, binding, put, acl, aclPath, passwordFile };
}

// Canned worker: answers the probe with one model revision and the extraction
// with one chunk and one equipment entity per unit. invalidOutputs marks that
// many calls as answers the extractor could not read (a degraded extraction).
// A bound embedder is echoed back with its own digest, and its chunk vectors are
// fixed values: the real worker reports both, and a revision missing one is refused.
export function cannedGraphWorker({ digest = CANNED_LLM_DIGEST, embedderDigest = CANNED_EMBEDDER_DIGEST,
  budgetExhausted = false, invalidOutputs = 0, packages = CANNED_PACKAGES } = {}) {
  const calls = { probe: 0, extract: 0, extracted: [], batches: [] };
  const reported = spec => (spec ? { embedder: { model: spec.model, digest: embedderDigest } } : {});
  async function runWorker({ request }) {
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


// Canned graph database: answers materialize and retrieve without a server. It
// keeps the generation it was told to load so a repeat reports loaded=false, the
// way a real database reports a generation it already holds, and answers a search
// with the rows the caller hands it (a row outside the generation included, so the
// caller's own admission can be tested).
export function cannedGraphDatabaseWorker({ hits = [], loaded = null } = {}) {
  const calls = { materialize: 0, retrieve: 0, modes: [], requests: [] };
  const held = new Set(loaded === null ? [] : [loaded]);
  async function runWorker({ request }) {
    calls.requests.push(request);
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
        dropped_out_of_generation: 0, embedder: { model: request.embedder?.model ?? null, digest: CANNED_LLM_DIGEST } } };
  }
  return { runWorker, calls, held };
}
