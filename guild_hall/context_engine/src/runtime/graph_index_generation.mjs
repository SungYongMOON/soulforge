// Per-project graph index generations. D41 makes the GraphRAG index a
// per-project proposal layer that can be rebuilt from sources but not
// reproduced deterministically (it is model output), so admitted fragments live
// in the Plan 17 project store and a graph database is loaded from there. These
// fragments are search assets only; reviewed or observed candidate records for
// 30_프로젝트맥락 are a separate writer. One update prepares the granted sources,
// extracts only added or changed documents in bounded batches, carries unchanged
// ones forward by exact (path, sha256) reference when the profile, the model and
// tool revision and the document text are unchanged, writes everything
// create-only under 20_문서검색/{본문·표_추출,검색_색인,원문위치·추출품질}/
// generations/<id>/, and advances 00_프로젝트_안내/graph_index_current.json under
// a lock and an expected prior. A run with an unprepared source or a degraded or
// partial extraction advances nothing. Reads are verified by hash and served only
// under the grant the generation was built from.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative } from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { sameExactRef, exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE } from '../../../path_registry/src/target_materializer.mjs';
import { rootedStore, safeStoreRel, storeToken } from './pair_store.mjs';
import { prepareSourceDocuments } from './source_preparation.mjs';
import { SOURCE_PREPARATION_PURPOSE, validateSourceDocument } from './source_documents.mjs';
import { extractGraphFragments, probeGraphModels, validateGraphBinding } from './graph_extraction.mjs';
import { GRAPH_EXTRACTION_PROFILE } from '../../profiles/graph_extraction_v1.mjs';

export const GRAPH_INDEX_BINDING_FILE = 'graph_index_binding.json';
export const GRAPH_INDEX_BINDING_MODE = 'context_engine_graph_index';
export const GRAPH_INDEX_MANIFEST_SCHEMA = 'soulforge.context_graph_index_generation.v1';
export const GRAPH_INDEX_POINTER_SCHEMA = 'soulforge.context_graph_index_pointer.v1';
export const GRAPH_INDEX_QUALITY_SCHEMA = 'soulforge.context_graph_index_quality.v1';
export const GRAPH_INDEX_AREAS = Object.freeze({ documents: '20_문서검색/본문·표_추출', index: '20_문서검색/검색_색인',
  quality: '20_문서검색/원문위치·추출품질' });
// One worker call takes at most this much: inside the extraction limits and far
// under the worker's 64 MiB request cap (Korean text is 3 bytes per character).
export const GRAPH_EXTRACTION_BATCH = Object.freeze({ documents: 50, units: 2000, characters: 8_000_000 });
const POINTER = '00_프로젝트_안내/graph_index_current.json';
const LOCK = '00_프로젝트_안내/graph_index.lock';
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const ROOT_REF = /^[A-Za-z0-9][A-Za-z0-9._:@+_-]{0,199}$/u;
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const encode = value => Buffer.from(JSON.stringify(value), 'utf8');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class GraphIndexError extends Error {
  constructor(code) { super(code); this.name = 'GraphIndexError'; this.code = code; }
}
const fail = code => { throw new GraphIndexError(code); };

export function graphProfilePin(profile = GRAPH_EXTRACTION_PROFILE) {
  return { profile_id: profile.profile_id, profile_version: profile.profile_version, schema_sha256: sha256Canonical(profile.schema) };
}

function validateIndexBinding(binding) {
  if (!plain(binding) || binding.mode !== GRAPH_INDEX_BINDING_MODE || !storeToken(binding.approved_fs_key)
    || exactRefIdentityKey(binding.project_ref) === null || !safeStoreRel(binding.acl_path)
    || !safeStoreRel(binding.grant?.path) || !SHA.test(binding.grant?.sha256 ?? '')
    || !Array.isArray(binding.write_authority?.actors) || !Array.isArray(binding.write_authority?.operations)
    || !plain(binding.source_roots) || !Object.entries(binding.source_roots).every(([key, value]) => ROOT_REF.test(key)
      && typeof value === 'string' && isAbsolute(value))
    || !equal(binding.profile, graphProfilePin())) fail('graph_index_binding_invalid');
  return validateGraphBinding(binding.graph);
}

// Documents in order, grouped so no worker call exceeds the batch bounds.
export function planExtractionBatches(documents, limits = GRAPH_EXTRACTION_BATCH) {
  const batches = [];
  let current = [], units = 0, characters = 0;
  for (const document of documents) {
    const size = document.units.reduce((total, unit) => total + unit.text.length, 0);
    if (document.units.length > limits.units || size > limits.characters) fail('graph_index_document_too_large');
    if (current.length && (current.length + 1 > limits.documents || units + document.units.length > limits.units
      || characters + size > limits.characters)) {
      batches.push(current); current = []; units = 0; characters = 0;
    }
    current.push(document); units += document.units.length; characters += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

// Whether an earlier fragment may stand for this document in a new generation.
// Identity breaks are integrity failures; a changed text or a degraded fragment
// is simply extracted again.
export function carryDecision({ row, fragment, document, projectKey, models }) {
  if (row?.doc_key !== document.doc_key || fragment?.doc_key !== document.doc_key || fragment.project_key !== projectKey
    || fragment.fragment_sha256 !== row.fragment?.fragment_sha256 || !equal(fragment.model, models)) fail('graph_index_carry_invalid');
  if (fragment.source_text_sha256 !== document.text_sha256 || fragment.stats?.chunks_mismatched !== 0
    || fragment.stats?.chunks !== document.units.length) return 'extract';
  return 'carry';
}

// Opens the store for one actor and operation ('index' writes and selects,
// 'read' only reads). Binding, ACL, template, pointer and lock are re-checked by
// assertUnchanged before and after every write.
function openIndexStore({ storeRoot, bindingSha256, request, operation }) {
  let io;
  try { io = rootedStore(storeRoot); } catch { fail('graph_index_store_invalid'); }
  const readRaw = (name, max = MAX_FILE_BYTES) => { try { return io.read(name, max); } catch { return fail('graph_index_file_unavailable'); } };
  const bindingBytes = readRaw(GRAPH_INDEX_BINDING_FILE, 1024 * 1024);
  if (!SHA.test(bindingSha256 ?? '') || digest(bindingBytes) !== bindingSha256) fail('graph_index_binding_mismatch');
  const binding = JSON.parse(bindingBytes);
  const graphBinding = validateIndexBinding(binding);
  // Sources are external custody: a root inside the store could be rewritten by the store's own writers.
  for (const root of Object.values(binding.source_roots)) {
    let canonical = root;
    try { canonical = realpathSync(root); } catch { /* an absent root is reported by its adapter */ }
    const inside = relative(io.root, canonical);
    if (inside === '' || (!isAbsolute(inside) && inside.split(/[\\/]/u)[0] !== '..')) fail('graph_index_binding_invalid');
  }
  const projectKey = exactRefIdentityKey(binding.project_ref), projectPath = `data_root/20_PROJECTS/${binding.approved_fs_key}`;
  if (!request || typeof request.actor_ref !== 'string' || !sameExactRef(request.project_ref, binding.project_ref)
    || typeof request.purpose !== 'string') fail('graph_index_request_refused');
  const aclBytes = readRaw(binding.acl_path, 1024 * 1024);
  const admit = bytes => {
    const acl = JSON.parse(bytes), grant = acl.actors?.find(row => row.actor_ref === request.actor_ref)?.grant;
    if (!grant || acl.revoked_actors?.includes(request.actor_ref) || !grant.allowed_projects?.includes(projectKey)
      || !grant.allowed_purposes?.includes(request.purpose) || !grant.allowed_scopes?.includes('project')
      || !Array.isArray(grant.allowed_data_classes)) fail('graph_index_access_refused');
    if (operation === 'index' && (request.purpose !== SOURCE_PREPARATION_PURPOSE
      || !binding.write_authority.actors.includes(request.actor_ref) || !binding.write_authority.operations.includes('index'))) {
      fail('graph_index_access_refused');
    }
    return grant;
  };
  const aclGrant = admit(aclBytes);
  for (const dir of PROJECT_CONTEXT_DIRECTORY_TEMPLATE) {
    let stat;
    try { stat = lstatSync(io.path(`${projectPath}/${dir}`)); } catch { fail('graph_index_template_invalid'); }
    if (!stat.isDirectory()) fail('graph_index_template_invalid');
  }
  const areaOf = path => Object.values(GRAPH_INDEX_AREAS).find(area => path.startsWith(`${projectPath}/${area}/generations/`));
  function readArea(ref) {
    if (!plain(ref) || !safeStoreRel(ref.path) || !SHA.test(ref.sha256 ?? '') || !areaOf(ref.path)) fail('graph_index_ref_invalid');
    const bytes = readRaw(ref.path);
    if (digest(bytes) !== ref.sha256) fail('graph_index_file_mismatch');
    return bytes;
  }
  function readPointer() {
    let bytes;
    try { bytes = io.read(`${projectPath}/${POINTER}`, 64 * 1024); }
    catch (error) { if (error?.code === 'ENOENT') return null; return fail('graph_index_pointer_invalid'); }
    const value = JSON.parse(bytes);
    if (value.schema_version !== GRAPH_INDEX_POINTER_SCHEMA || !sameExactRef(value.project_ref, binding.project_ref)
      || !Number.isSafeInteger(value.selection_epoch) || value.selection_epoch < 1 || !storeToken(value.generation_id)
      || !value.generation_ref?.path?.startsWith(`${projectPath}/${GRAPH_INDEX_AREAS.index}/generations/${value.generation_id}/`)) {
      fail('graph_index_pointer_invalid');
    }
    return { value, sha256: digest(bytes) };
  }
  const opened = readPointer();
  let lockContent = null;
  const lockPath = () => io.path(`${projectPath}/${LOCK}`, true);
  function readLock() {
    try { return readFileSync(io.path(`${projectPath}/${LOCK}`), 'utf8'); } catch { return null; }
  }
  function assertUnchanged() {
    if (digest(readRaw(GRAPH_INDEX_BINDING_FILE, 1024 * 1024)) !== bindingSha256) fail('graph_index_binding_changed');
    const freshAcl = readRaw(binding.acl_path, 1024 * 1024);
    if (!freshAcl.equals(aclBytes)) fail('graph_index_acl_changed');
    admit(freshAcl);
    if ((readPointer()?.sha256 ?? null) !== (opened?.sha256 ?? null)) fail('graph_index_pointer_changed');
    if (lockContent !== null && readLock() !== lockContent) fail('graph_index_lock_lost');
  }
  // The lock names its holder (process and start time) so an operator can tell a
  // stale lock from a live writer before removing it by hand.
  async function lock() {
    let handle;
    try { handle = await open(lockPath(), 'wx'); } catch { fail('graph_index_locked'); }
    const content = JSON.stringify({ lock_id: randomUUID(), pid: process.pid, started_at: new Date().toISOString(),
      operation, actor_ref: request.actor_ref });
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    lockContent = content;
    assertUnchanged();
  }
  async function unlock() {
    if (lockContent === null) return;
    if (readLock() !== lockContent) fail('graph_index_lock_lost');
    await unlink(io.path(`${projectPath}/${LOCK}`));
    lockContent = null;
  }
  async function writeCreateOnly(generationId, rel, bytes) {
    const name = `${projectPath}/${rel}`;
    if (!storeToken(generationId) || !safeStoreRel(name)
      || !Object.values(GRAPH_INDEX_AREAS).some(area => name.startsWith(`${projectPath}/${area}/generations/${generationId}/`))) {
      fail('graph_index_write_refused');
    }
    assertUnchanged();
    const target = io.path(name, true);
    await mkdir(dirname(target), { recursive: true });
    io.path(name, true);
    let handle;
    try { handle = await open(target, 'wx'); } catch { fail('graph_index_generation_exists'); }
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    assertUnchanged();
    return { path: name, sha256: digest(bytes) };
  }
  // The new pointer is written and synced beside the old one, then renamed over it.
  async function commitPointer(value) {
    assertUnchanged();
    const text = `${JSON.stringify(value)}\n`, target = io.path(`${projectPath}/${POINTER}`, true);
    const temp = `${target}.tmp-${randomUUID()}`;
    const handle = await open(temp, 'wx');
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    try { assertUnchanged(); await rename(temp, target); }
    catch (error) { await unlink(temp).catch(() => {}); throw error; }
    return digest(Buffer.from(text, 'utf8'));
  }
  return { io, binding, graphBinding, projectKey, projectPath, aclGrant, aclSha256: digest(aclBytes), opened, readRaw, readArea,
    readPointer, assertUnchanged, lock, unlock, writeCreateOnly, commitPointer };
}

// A complete manifest whose every file still has its recorded bytes.
function verifyManifest(store, ref) {
  if (!ref?.path?.startsWith(`${store.projectPath}/${GRAPH_INDEX_AREAS.index}/generations/`)) fail('graph_index_ref_invalid');
  const manifest = JSON.parse(store.readArea(ref));
  if (manifest.schema_version !== GRAPH_INDEX_MANIFEST_SCHEMA || manifest.status !== 'complete' || !storeToken(manifest.generation_id)
    || !ref.path.startsWith(`${store.projectPath}/${GRAPH_INDEX_AREAS.index}/generations/${manifest.generation_id}/`)
    || !sameExactRef(manifest.project_ref, store.binding.project_ref) || manifest.project_key !== store.projectKey
    || !Array.isArray(manifest.documents) || !plain(manifest.coverage) || !plain(manifest.model) || !plain(manifest.profile)
    || !plain(manifest.grant?.ref)) {
    fail('graph_index_manifest_invalid');
  }
  store.readArea(manifest.coverage);
  const keys = new Set();
  for (const row of manifest.documents) {
    if (!SHA.test(row?.doc_key ?? '') || keys.has(row.doc_key)) fail('graph_index_manifest_invalid');
    keys.add(row.doc_key);
    store.readArea(row.document);
    store.readArea(row.fragment);
  }
  return manifest;
}

// A generation is served or re-selected only under the grant it was built from,
// and only for an actor whose ACL admits every data class in it: a narrowed or
// withdrawn grant never leaves the broader earlier generation readable.
function assertServable(store, manifest) {
  if (manifest.grant.ref.path !== store.binding.grant.path || manifest.grant.ref.sha256 !== store.binding.grant.sha256) {
    fail('graph_index_grant_changed');
  }
  if (!manifest.documents.every(row => store.aclGrant.allowed_data_classes.includes(row.data_class))) fail('graph_index_access_refused');
}

function priorState(store) {
  const pointer = store.opened;
  if (!pointer) return null;
  const manifest = verifyManifest(store, pointer.value.generation_ref);
  const quality = JSON.parse(store.readArea(manifest.coverage));
  if (quality.schema_version !== GRAPH_INDEX_QUALITY_SCHEMA || quality.coverage?.coverage_sha256 !== manifest.coverage_sha256) {
    fail('graph_index_manifest_invalid');
  }
  return { pointer, manifest, coverage: quality.coverage };
}

const changeCounts = changes => Object.fromEntries(['added', 'changed', 'removed', 'unchanged', 'unavailable']
  .map(key => [key, changes[key].length]));

// Writers run inside one lock; the lock is released exactly once, and a release
// failure is reported as a lost lock (after the pointer moved, as a committed
// run whose cleanup failed) rather than hidden behind an earlier code.
async function withIndexLock(openStore, run) {
  const state = { store: null, committed: false };
  let result;
  try {
    state.store = openStore();
    await state.store.lock();
    result = await run(state.store, () => { state.committed = true; });
  } catch (error) {
    result = { status: state.committed ? 'COMMITTED_CLEANUP_FAILED' : 'HOLD', code: String(error?.code ?? 'graph_index_failed') };
  }
  try { await state.store?.unlock(); }
  catch {
    result = { ...result, status: state.committed ? 'COMMITTED_CLEANUP_FAILED' : 'HOLD', code: 'graph_index_lock_lost',
      prior_code: result?.code ?? null };
  }
  return Object.freeze(result);
}

// request: { actor_ref, project_ref, purpose: 'context_preparation', generation_id, expected_prior }.
// Sources, roots, grant, graph endpoints and profile all come from the pinned binding.
// hooks (tests): beforeCommit / afterCommit around the pointer swap.
export async function updateGraphIndex({ storeRoot, bindingSha256, request, now = new Date().toISOString(), runWorker, hooks = {} } = {}) {
  request = structuredClone(request);
  const result = await withIndexLock(() => {
    if (!storeToken(request?.generation_id) || !Object.hasOwn(request, 'expected_prior')) fail('graph_index_request_refused');
    return openIndexStore({ storeRoot, bindingSha256, request, operation: 'index' });
  }, (store, markCommitted) => runUpdate({ store, bindingSha256, request, now, runWorker, hooks, markCommitted }));
  return Object.freeze({ generation_id: request?.generation_id ?? null, ...result });
}

async function runUpdate({ store, bindingSha256, request, now, runWorker, hooks, markCommitted }) {
  if ((store.opened?.sha256 ?? null) !== request.expected_prior) fail('graph_index_prior_mismatch');
  const prior = priorState(store);
  const grantBytes = store.readRaw(store.binding.grant.path, 4 * 1024 * 1024);
  if (digest(grantBytes) !== store.binding.grant.sha256) fail('graph_index_grant_mismatch');
  const grant = JSON.parse(grantBytes);
  if (!sameExactRef(grant.project_ref, store.binding.project_ref)
    || !grant.allowed_data_classes?.every(dataClass => store.aclGrant.allowed_data_classes.includes(dataClass))) {
    fail('graph_index_grant_mismatch');
  }
  const prepared = await prepareSourceDocuments({ grant, roots: store.binding.source_roots, now, previousCoverage: prior?.coverage ?? null });
  if (prepared.grant.project_key !== store.projectKey) fail('graph_index_grant_mismatch');
  const changes = changeCounts(prepared.changes);
  if (prepared.changes.unavailable.length) {
    return { status: 'HOLD', code: 'source_incomplete', changes, unavailable: prepared.changes.unavailable
      .map(({ source_kind, root_ref, item_id, status, code }) => ({ source_kind, root_ref, item_id, status, code })) };
  }
  const profile = graphProfilePin();
  const models = await probeGraphModels({ binding: store.binding.graph, runWorker });
  const reusable = prior !== null && equal(prior.manifest.profile, profile) && equal(prior.manifest.model, models);
  const priorRows = new Map((prior?.manifest.documents ?? []).map(row => [row.doc_key, row]));
  const carried = new Map(), toExtract = [];
  for (const document of prepared.documents) {
    const row = reusable ? priorRows.get(document.doc_key) : undefined;
    if (row && carryDecision({ row, fragment: JSON.parse(store.readArea(row.fragment)), document, projectKey: store.projectKey,
      models }) === 'carry') carried.set(document.doc_key, row);
    else toExtract.push(document);
  }
  if (reusable && toExtract.length === 0 && prepared.documents.length === priorRows.size
    && prepared.coverage.coverage_sha256 === prior.manifest.coverage_sha256) {
    return { status: 'UNCHANGED', generation_id: prior.manifest.generation_id, pointer_sha256: prior.pointer.sha256,
      selection_epoch: prior.pointer.value.selection_epoch, changes };
  }
  // Bounded batches under one call budget for the whole update; any batch that is
  // partial or degraded holds the update, so a hole never becomes a complete generation.
  const fresh = new Map(), batches = [];
  const llm = { calls: 0, errors: 0, invalid_outputs: 0, truncated: 0, prompt_tokens: 0, output_tokens: 0, elapsed_ms: 0, embedder_calls: 0 };
  for (const batch of planExtractionBatches(toExtract)) {
    const remaining = store.binding.graph.llm.max_calls - llm.calls;
    if (remaining < 1) return { status: 'HOLD', code: 'graph_budget_exhausted', changes };
    const result = await extractGraphFragments({ documents: batch, projectKey: store.projectKey, profile: GRAPH_EXTRACTION_PROFILE,
      binding: { ...store.binding.graph, llm: { ...store.binding.graph.llm, max_calls: remaining } }, runWorker, expectedModels: models });
    if (result.status !== 'ok') {
      return { status: 'HOLD', code: result.status === 'partial' ? 'graph_budget_exhausted'
        : result.status === 'degraded' ? 'graph_extraction_degraded' : result.code, changes, degraded: result.degraded ?? null };
    }
    for (const key of Object.keys(llm)) llm[key] += Number.isSafeInteger(result.llm[key]) ? result.llm[key] : 0;
    for (const fragment of result.fragments) fresh.set(fragment.doc_key, fragment);
    batches.push({ documents: batch.length, llm: result.llm,
      fragments: result.fragments.map(f => ({ doc_key: f.doc_key, stats: f.stats, tool_pruning: f.tool_pruning })) });
  }
  const generationId = request.generation_id;
  const rows = [];
  for (const document of prepared.documents) {
    const hex = document.doc_key.slice('sha256:'.length), documentBytes = encode(document), previous = priorRows.get(document.doc_key);
    const documentRef = previous && previous.document.sha256 === digest(documentBytes) ? previous.document
      : await store.writeCreateOnly(generationId, `${GRAPH_INDEX_AREAS.documents}/generations/${generationId}/${hex}.json`, documentBytes);
    let fragmentRef, origin, stats;
    if (carried.has(document.doc_key)) {
      ({ fragment: fragmentRef, stats } = carried.get(document.doc_key)); origin = 'carried';
    } else {
      const fragment = fresh.get(document.doc_key);
      if (!fragment) fail('graph_index_fragment_missing');
      const written = await store.writeCreateOnly(generationId, `${GRAPH_INDEX_AREAS.index}/generations/${generationId}/fragments/${hex}.json`,
        encode(fragment));
      fragmentRef = { ...written, fragment_sha256: fragment.fragment_sha256 }; origin = 'extracted'; stats = fragment.stats;
    }
    rows.push({ doc_key: document.doc_key, source_kind: document.source_kind, root_ref: document.root_ref, item_id: document.item_id,
      composite_revision_sha256: document.composite_revision_sha256, text_sha256: document.text_sha256, data_class: document.data_class,
      units: document.units.length, document: documentRef, fragment: fragmentRef, origin, stats });
  }
  const quality = { schema_version: GRAPH_INDEX_QUALITY_SCHEMA, generation_id: generationId, coverage: prepared.coverage,
    changes: prepared.changes, extraction: batches.length === 0 ? null : { llm, batches } };
  const coverageRef = await store.writeCreateOnly(generationId, `${GRAPH_INDEX_AREAS.quality}/generations/${generationId}/coverage.json`,
    encode(quality));
  const sum = key => rows.reduce((total, row) => total + (Number.isSafeInteger(row.stats?.[key]) ? row.stats[key] : 0), 0);
  const epoch = (prior?.pointer.value.selection_epoch ?? 0) + 1;
  const manifest = { schema_version: GRAPH_INDEX_MANIFEST_SCHEMA, generation_id: generationId, status: 'complete',
    project_ref: store.binding.project_ref, project_key: store.projectKey, approved_fs_key: store.binding.approved_fs_key,
    writer: { actor_ref: request.actor_ref, operation: 'index', binding_sha256: bindingSha256, acl_sha256: store.aclSha256, epoch },
    supersedes: prior === null ? null : { generation_id: prior.manifest.generation_id, manifest: prior.pointer.value.generation_ref,
      selection_epoch: prior.pointer.value.selection_epoch },
    grant: { grant_id: prepared.grant.grant_id, grant_sha256: prepared.grant.grant_sha256, ref: { ...store.binding.grant } },
    profile, model: models, coverage: coverageRef, coverage_sha256: prepared.coverage.coverage_sha256, changes, documents: rows,
    counts: { documents: rows.length, extracted: rows.filter(r => r.origin === 'extracted').length,
      carried: rows.filter(r => r.origin === 'carried').length, units: rows.reduce((total, row) => total + row.units, 0),
      chunks: sum('chunks'), entities: sum('entities'), entity_relationships: sum('entity_relationships') },
    llm };
  const manifestRef = await store.writeCreateOnly(generationId, `${GRAPH_INDEX_AREAS.index}/generations/${generationId}/generation.json`,
    encode(manifest));
  verifyManifest(store, manifestRef);
  const pointer = { schema_version: GRAPH_INDEX_POINTER_SCHEMA, project_ref: store.binding.project_ref,
    selection_epoch: epoch, generation_id: generationId, generation_ref: manifestRef };
  await hooks.beforeCommit?.();
  const pointerSha256 = await store.commitPointer(pointer);
  markCommitted();
  await hooks.afterCommit?.();
  return { status: 'COMMITTED', generation_id: generationId, manifest_ref: manifestRef, pointer_sha256: pointerSha256,
    selection_epoch: epoch, changes, counts: manifest.counts, llm };
}

// Re-selects an earlier complete generation (rollback) under the same lock,
// authority, grant and expected-prior rules. request: { ..., generation_ref, expected_prior }.
export async function selectGraphIndexGeneration({ storeRoot, bindingSha256, request, hooks = {} } = {}) {
  request = structuredClone(request);
  return withIndexLock(() => {
    if (!Object.hasOwn(request ?? {}, 'expected_prior')) fail('graph_index_request_refused');
    return openIndexStore({ storeRoot, bindingSha256, request, operation: 'index' });
  }, async (store, markCommitted) => {
    if ((store.opened?.sha256 ?? null) !== request.expected_prior) fail('graph_index_prior_mismatch');
    const manifest = verifyManifest(store, request.generation_ref);
    assertServable(store, manifest);
    if (store.opened && equal(store.opened.value.generation_ref, request.generation_ref)) {
      return { status: 'UNCHANGED', generation_id: manifest.generation_id, pointer_sha256: store.opened.sha256,
        selection_epoch: store.opened.value.selection_epoch };
    }
    const pointer = { schema_version: GRAPH_INDEX_POINTER_SCHEMA, project_ref: store.binding.project_ref,
      selection_epoch: (store.opened?.value.selection_epoch ?? 0) + 1, generation_id: manifest.generation_id,
      generation_ref: { path: request.generation_ref.path, sha256: request.generation_ref.sha256 } };
    await hooks.beforeCommit?.();
    const pointerSha256 = await store.commitPointer(pointer);
    markCommitted();
    await hooks.afterCommit?.();
    return { status: 'COMMITTED', generation_id: manifest.generation_id, pointer_sha256: pointerSha256, selection_epoch: pointer.selection_epoch };
  });
}

// Read view of the selected generation for retrieval or a graph load. Every
// document and fragment is re-read by hash; assertCurrent refuses a view whose
// pointer, binding or access changed since it was opened. `graph_binding` is the
// validated graph binding this view was opened under, including the graph
// database endpoint when one is bound.
export function openGraphIndex({ storeRoot, bindingSha256, request } = {}) {
  const store = openIndexStore({ storeRoot, bindingSha256, request: structuredClone(request), operation: 'read' });
  if (!store.opened) fail('graph_index_not_selected');
  const manifest = verifyManifest(store, store.opened.value.generation_ref);
  assertServable(store, manifest);
  const row = docKey => manifest.documents.find(item => item.doc_key === docKey) ?? fail('graph_index_document_unknown');
  function readDocument(docKey) {
    const document = JSON.parse(store.readArea(row(docKey).document));
    if (!validateSourceDocument(document) || document.doc_key !== docKey || document.project_key !== store.projectKey) {
      fail('graph_index_document_invalid');
    }
    return document;
  }
  function readFragment(docKey) {
    const fragment = JSON.parse(store.readArea(row(docKey).fragment));
    if (fragment.doc_key !== docKey || fragment.project_key !== store.projectKey
      || fragment.fragment_sha256 !== row(docKey).fragment.fragment_sha256) fail('graph_index_fragment_invalid');
    return fragment;
  }
  function readQuality() {
    const quality = JSON.parse(store.readArea(manifest.coverage));
    if (quality.schema_version !== GRAPH_INDEX_QUALITY_SCHEMA || quality.coverage?.coverage_sha256 !== manifest.coverage_sha256) {
      fail('graph_index_manifest_invalid');
    }
    return quality;
  }
  return Object.freeze({ manifest, generation_ref: { ...store.opened.value.generation_ref }, pointer_sha256: store.opened.sha256,
    selection_epoch: store.opened.value.selection_epoch, graph_binding: store.graphBinding, readDocument, readFragment,
    readQuality, assertCurrent: store.assertUnchanged });
}
