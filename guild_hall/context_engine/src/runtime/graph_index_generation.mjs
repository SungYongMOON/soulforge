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
// a lock and an expected prior. A run with an unprepared source, a failed worker
// call or an exhausted budget advances nothing; a document whose extraction the
// model's answers left incomplete is left out of the generation, listed with its
// reason, and the rest is committed. Accepted per-document extractions are
// checkpointed so a stopped run does not repeat them. Reads are verified by hash and served only
// under the grant the generation was built from.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative } from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { sameExactRef, exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { resolveProjectTemplateVersion } from '../../../path_registry/src/target_materializer.mjs';
import { rootedStore, safeStoreRel, storeToken } from './pair_store.mjs';
import { prepareSourceDocuments } from './source_preparation.mjs';
import { assertModelHostsAdmitted } from './real_data_admission.mjs';
import { SOURCE_PREPARATION_PURPOSE, validateSourceDocument } from './source_documents.mjs';
import { embeddingRef, extractGraphFragments, probeGraphModels, validateGraphBinding } from './graph_extraction.mjs';
import { GRAPH_EXTRACTION_PROFILE } from '../../profiles/graph_extraction_v1.mjs';
import { runGraphragWorker } from '../adapters/graphrag/worker_client.mjs';
import { validateDocumentTools } from './document_tools.mjs';

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
// One embed call takes at most this much. The vectors come back in the answer, so
// the bound is the size of that answer rather than a model call budget.
export const GRAPH_EMBED_BATCH = Object.freeze({ chunks: 50, characters: 400_000 });
// Accepted per-document extraction results, kept beside the generations so a run
// that stops (a held batch, a lost lock, a timeout) does not cost the next run the
// documents it had already extracted. Content-addressed by the document's text and
// units, the extraction profile and the exact model revision; create-only; never
// selected or served — a checkpoint is only ever read back into a new generation
// after it re-verifies against the document it stands for.
export const GRAPH_EXTRACTION_CHECKPOINT_AREA = '20_문서검색/검색_색인/extraction_checkpoints';
export const GRAPH_EXTRACTION_CHECKPOINT_SCHEMA = 'soulforge.context_graph_extraction_checkpoint.v1';
// How much of a refusal travels with a document left out of a generation: enough
// to say why, bounded so a pathological batch cannot swell the quality record.
export const GRAPH_EXCLUSION_DIAGNOSTIC = Object.freeze({ calls: 8, shapes: 4 });
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
  // Real material needs the admission record the preparer judges; the binding
  // names it by address and digest the same way it names the grant. Absent, the
  // preparer's own gate still refuses every class but public_synthetic.
  if (binding.admission !== undefined && binding.admission !== null
    && (!plain(binding.admission) || !safeStoreRel(binding.admission.path) || !SHA.test(binding.admission.sha256 ?? ''))) {
    fail('graph_index_binding_invalid');
  }
  try { validateDocumentTools(binding.document_tools); } catch { fail('graph_index_binding_invalid'); }
  extractionBatchLimits(binding.graph?.extraction_batch);
  return validateGraphBinding(binding.graph);
}

// How much one worker call may take, from the binding: each bound may only be
// lowered below the program constant. One call carries one timeout, so a slow
// model host is given smaller calls rather than a longer wait — a call that
// overruns its timeout loses every chunk it had extracted.
export function extractionBatchLimits(batch) {
  if (batch === undefined || batch === null) return GRAPH_EXTRACTION_BATCH;
  if (!plain(batch) || !Object.keys(batch).every(key => Object.hasOwn(GRAPH_EXTRACTION_BATCH, key))
    || !Object.entries(batch).every(([key, value]) => Number.isSafeInteger(value) && value >= 1 && value <= GRAPH_EXTRACTION_BATCH[key])) {
    fail('graph_index_binding_invalid');
  }
  return Object.freeze({ ...GRAPH_EXTRACTION_BATCH, ...batch });
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

// Worker builds written before the worker named its own extraction rules, and the
// rules each of them actually had. A pre-`extraction_rules_v1` record carries only
// a whole-file hash, which cannot be compared with a rules hash — so the rules of
// that exact build were measured by running this worker's own
// `extraction_rules_sha256(source)` over that file's bytes, and the answer is
// pinned here. Nothing else is admitted: a build that is not in this table and
// carries no rules hash is re-extracted.
//
// sha256:3dd7cc28… is the build that wrote the eleven generations of 2026-09-14.
// Its rule functions are byte-identical to the current ones (measured: the change
// that added the rules hash touched no function it hashes), so those generations
// carry instead of being extracted again for nothing.
export const KNOWN_RULE_EQUIVALENT_WORKERS = Object.freeze({
  'sha256:3dd7cc289eb66d13bdad3f9677986e01d5ac8fc21f87f2dfaaaef5371c5404b3':
    'sha256:ede7d2eb706cb189b3586f2048def221061417ed07747e794c46d87341e428ac',
});

// Whether the worker that made a stored fragment ran the rules this worker runs.
//
// The whole-file hash used to stand for this, and it does not: editing a search
// query, a log field or a diagnostic changed it, and every stored fragment became
// unreusable. The rules hash covers exactly the code that decides what an
// extraction produces. A record written before that field existed is accepted only
// when its build is in the table above and that build's measured rules are these
// rules; a record with a rules hash is compared on it and on nothing else.
export function sameToolRevision(stored, probed) {
  if (!plain(stored) || !plain(probed) || !SHA.test(probed.rules_sha256 ?? '')) return false;
  if (!equal(stored.packages, probed.packages)) return false;
  if (typeof stored.rules_sha256 === 'string') return stored.rules_sha256 === probed.rules_sha256;
  const measured = KNOWN_RULE_EQUIVALENT_WORKERS[stored.worker_sha256 ?? ''];
  return measured !== undefined && measured === probed.rules_sha256;
}

// Whether a stored model record is the model revision a probe just reported.
//
// Every field the probe produced must match: the LLM and its digest, the
// transport, the thinking switch, the options, and the embedder and its digest.
// `tool` is compared by the rule above rather than whole, because only part of it
// decides what an extraction produces. What is NOT compared is anything the stored
// record carries beyond that set. A derived generation records how its vectors
// came to be (`embedding_source: "reembed"`), and that note is not part of the
// revision — the embedder and its digest already are. Comparing the records whole
// made a re-embedded generation unreusable, so the next update extracted all of it
// again with the same model that had already read it.
//
// Outside `tool`, the comparison follows the probe rather than a list kept here:
// if the probe ever reports a new field, that field is compared from then on
// without this having to be edited.
export function sameModelRevision(stored, probed) {
  if (!plain(stored) || !plain(probed)) return false;
  for (const key of Object.keys(probed)) {
    if (key === 'tool') continue;
    if (!equal(stored[key], probed[key])) return false;
  }
  return sameToolRevision(stored.tool, probed.tool);
}

// Whether an earlier fragment may stand for this document in a new generation.
// Identity breaks are integrity failures; a changed text or a degraded fragment
// is simply extracted again.
export function carryDecision({ row, fragment, document, projectKey, models }) {
  if (row?.doc_key !== document.doc_key || fragment?.doc_key !== document.doc_key || fragment.project_key !== projectKey
    || fragment.fragment_sha256 !== row.fragment?.fragment_sha256
    || !sameModelRevision(fragment.model, models)) fail('graph_index_carry_invalid');
  if (fragment.source_text_sha256 !== document.text_sha256 || fragment.stats?.chunks_mismatched !== 0
    || fragment.stats?.chunks !== document.units.length) return 'extract';
  return 'carry';
}

// Opens the store for one actor and operation ('index' writes and selects,
// 'read' only reads). Binding, ACL, template, pointer and lock are re-checked by
// assertUnchanged before and after every write.
// The store is one absolute `storeRoot` (a synthetic store) or an already
// admitted `io` (an aliased estate, where `data_root/…` and `control_root/…`
// are answered by a root table); `bindingAddress` is the binding's address in
// that io. Either way the binding, the grant and every store file are addressed
// the same way and pinned by digest before they are read.
function openIndexStore({ io = null, storeRoot, bindingAddress = GRAPH_INDEX_BINDING_FILE, bindingSha256, request, operation }) {
  if (io === null) { try { io = rootedStore(storeRoot); } catch { fail('graph_index_store_invalid'); } }
  if (!safeStoreRel(bindingAddress)) fail('graph_index_binding_invalid');
  const readRaw = (name, max = MAX_FILE_BYTES) => { try { return io.read(name, max); } catch { return fail('graph_index_file_unavailable'); } };
  const bindingBytes = readRaw(bindingAddress, 1024 * 1024);
  if (!SHA.test(bindingSha256 ?? '') || digest(bindingBytes) !== bindingSha256) fail('graph_index_binding_mismatch');
  const binding = JSON.parse(bindingBytes);
  const graphBinding = validateIndexBinding(binding);
  const projectKey = exactRefIdentityKey(binding.project_ref), projectPath = `data_root/20_PROJECTS/${binding.approved_fs_key}`;
  // Sources are external custody: a root inside what this writer writes could be
  // rewritten by it. A synthetic store is one root and all of it is the store; on
  // an estate the store is this project's tree, and collection custody lives
  // beside it under the same data root, so the tree is the boundary there.
  const storeTree = io.root ?? io.path(projectPath);
  for (const root of Object.values(binding.source_roots)) {
    let canonical = root;
    try { canonical = realpathSync(root); } catch { /* an absent root is reported by its adapter */ }
    const inside = relative(storeTree, canonical);
    if (inside === '' || (!isAbsolute(inside) && inside.split(/[\\/]/u)[0] !== '..')) fail('graph_index_binding_invalid');
  }
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
  // Which declared layout this store holds, not whether it holds today's. A
  // store formed before a source kind existed is complete without it; a store
  // matching no declared version is still refused.
  const templateVersion = resolveProjectTemplateVersion((dir) => {
    try { return lstatSync(io.path(`${projectPath}/${dir}`)).isDirectory(); } catch { return false; }
  });
  if (templateVersion === null) fail('graph_index_template_invalid');
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
    if (digest(readRaw(bindingAddress, 1024 * 1024)) !== bindingSha256) fail('graph_index_binding_changed');
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
  // Checkpoints: written only by the lock holder, create-only (an existing file
  // with the same address is the same content by construction and is left alone),
  // and read back as untrusted bytes the caller re-verifies.
  const checkpointName = key => `${projectPath}/${GRAPH_EXTRACTION_CHECKPOINT_AREA}/${key.slice('sha256:'.length)}.json`;
  function readCheckpoint(key) {
    if (!SHA.test(key ?? '')) return null;
    try { return io.read(checkpointName(key), MAX_FILE_BYTES); } catch { return null; }
  }
  async function writeCheckpoint(key, bytes) {
    if (!SHA.test(key ?? '') || lockContent === null || readLock() !== lockContent) fail('graph_index_lock_lost');
    const target = io.path(checkpointName(key), true);
    await mkdir(dirname(target), { recursive: true });
    io.path(checkpointName(key), true);
    let handle;
    try { handle = await open(target, 'wx'); } catch (error) { if (error?.code === 'EEXIST') return false; throw error; }
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    return true;
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
  return { io, binding, graphBinding, projectKey, projectPath, templateVersion, aclGrant, aclSha256: digest(aclBytes),
    opened, readRaw, readArea, readPointer, assertUnchanged, lock, unlock, writeCreateOnly, commitPointer,
    readCheckpoint, writeCheckpoint };
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
  return { pointer, manifest, coverage: quality.coverage,
    excluded: new Set((Array.isArray(quality.excluded) ? quality.excluded : []).map(row => row?.doc_key)) };
}

// The key a document's extraction is checkpointed under: everything that decides
// what the model is asked (the unit texts and boundaries, the profile's schema)
// and who answers (the exact model revision, options and extraction rules).
export function extractionCheckpointKey({ document, projectKey, models }) {
  return sha256Canonical({ schema_version: GRAPH_EXTRACTION_CHECKPOINT_SCHEMA, project_key: projectKey,
    doc_key: document.doc_key, text_sha256: document.text_sha256,
    units: document.units.map(unit => ({ unit_id: unit.unit_id, text_sha256: digest(Buffer.from(unit.text, 'utf8')) })),
    profile: graphProfilePin(), models });
}

// A checkpoint is untrusted until it proves it is this document's complete
// extraction by this model revision: its key, its identity, its text, a whole
// chunk count, its own fragment hash and every vector's reference are re-derived.
// Anything short of that is a miss, and the document is extracted again.
export function admitCheckpoint({ bytes, key, document, projectKey, models }) {
  let value;
  try { value = JSON.parse(bytes); } catch { return null; }
  const fragment = value?.fragment;
  if (value?.schema_version !== GRAPH_EXTRACTION_CHECKPOINT_SCHEMA || value.key !== key || !plain(fragment)
    || fragment.doc_key !== document.doc_key || fragment.project_key !== projectKey
    || fragment.source_text_sha256 !== document.text_sha256 || fragment.stats?.chunks !== document.units.length
    || fragment.stats?.chunks_mismatched !== 0 || !equal(fragment.model, models)
    || !Array.isArray(fragment.nodes) || !Array.isArray(fragment.relationships)) return null;
  try {
    for (const node of fragment.nodes) {
      if (node.embedding === null || node.embedding === undefined) { if (node.embedding_ref !== null) return null; continue; }
      if (!Array.isArray(node.embedding) || !equal(embeddingRef(node.embedding), node.embedding_ref)) return null;
    }
    const { fragment_sha256: claimed, ...body } = fragment;
    if (sha256Canonical({ ...body, nodes: body.nodes.map(({ embedding, ...node }) => node) }) !== claimed) return null;
  } catch { return null; }
  return fragment;
}

// Which documents of a held-back batch the refusals belong to. The extraction
// attributes each refused call to a record by its position, which is sound only
// when the trace has exactly one call per unit in request order; when it does not,
// or a refusal names no record, every document in the batch is treated as refused
// rather than guessing which ones were whole.
function refusedDocuments(batch, result) {
  const units = batch.reduce((total, document) => total + document.units.length, 0);
  const trace = Array.isArray(result.llm?.trace) ? result.llm.trace : [];
  const positional = trace.length === units && trace.every((row, index) => row.call === index + 1);
  const degraded = result.degraded ?? {};
  const refusals = Array.isArray(degraded.refused_units) ? degraded.refused_units : [];
  const reasons = new Map();
  const mark = (docKey, reason, call) => {
    const row = reasons.get(docKey) ?? { reasons: new Set(), calls: [] };
    row.reasons.add(reason);
    if (call !== null) row.calls.push(call);
    reasons.set(docKey, row);
  };
  if (!positional || refusals.some(row => !SHA.test(row?.doc_key ?? ''))) {
    for (const document of batch) mark(document.doc_key, 'extraction_unattributed', null);
  } else {
    for (const row of refusals) {
      mark(row.doc_key, row.status === 'error' ? 'extraction_error' : row.done_reason === 'length' ? 'extraction_truncated'
        : 'extraction_refused', row.call);
    }
  }
  for (const row of Array.isArray(degraded.documents) ? degraded.documents : []) {
    if (SHA.test(row?.doc_key ?? '')) mark(row.doc_key, 'chunk_mismatch', null);
  }
  const traceOf = new Map(trace.map(row => [row.call, row]));
  return new Map([...reasons].map(([docKey, { reasons: why, calls }]) => [docKey, {
    reason: [...why].sort().join('+'),
    calls: calls.slice(0, GRAPH_EXCLUSION_DIAGNOSTIC.calls).map(call => {
      const row = traceOf.get(call) ?? {};
      return { call, status: row.status ?? null, done_reason: row.done_reason ?? null, error_type: row.error_type ?? null,
        http_status: row.http_status ?? null, output_characters: row.output_characters ?? null };
    }),
    // The shapes are what the extraction admitted field by field (no text).
    rejected_shapes: calls.map(call => traceOf.get(call)?.rejected_shape).filter(plain)
      .slice(0, GRAPH_EXCLUSION_DIAGNOSTIC.shapes) }]));
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
export async function updateGraphIndex({ io = null, storeRoot, bindingAddress = GRAPH_INDEX_BINDING_FILE, bindingSha256, request,
  now = new Date().toISOString(), runWorker, hooks = {} } = {}) {
  request = structuredClone(request);
  const result = await withIndexLock(() => {
    if (!storeToken(request?.generation_id) || !Object.hasOwn(request, 'expected_prior')) fail('graph_index_request_refused');
    return openIndexStore({ io, storeRoot, bindingAddress, bindingSha256, request, operation: 'index' });
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
  // The admission the binding names, pinned by digest; the preparer judges it
  // against this exact grant and refuses real material without one.
  let admission = null;
  if (store.binding.admission) {
    const admissionBytes = store.readRaw(store.binding.admission.path, 1024 * 1024);
    if (digest(admissionBytes) !== store.binding.admission.sha256) fail('graph_index_admission_mismatch');
    admission = JSON.parse(admissionBytes);
  }
  const prepared = await prepareSourceDocuments({ grant, roots: store.binding.source_roots, now, previousCoverage: prior?.coverage ?? null,
    admission, documentTools: store.binding.document_tools ?? null });
  if (prepared.grant.project_key !== store.projectKey) fail('graph_index_grant_mismatch');
  // Extraction calls a model with this material: under a real-data admission the
  // binding's model origins must be ones the admission names (loopback needs none).
  if (prepared.admission !== null) assertModelHostsAdmitted(prepared.admission, store.graphBinding.allowed_model_hosts);
  const changes = changeCounts(prepared.changes);
  if (prepared.changes.unavailable.length) {
    return { status: 'HOLD', code: 'source_incomplete', changes, unavailable: prepared.changes.unavailable
      .map(({ source_kind, root_ref, item_id, status, code }) => ({ source_kind, root_ref, item_id, status, code })) };
  }
  const profile = graphProfilePin();
  const models = await probeGraphModels({ binding: store.binding.graph, runWorker });
  const reusable = prior !== null && equal(prior.manifest.profile, profile)
    && sameModelRevision(prior.manifest.model, models);
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
  // A document whose accepted extraction by this exact model revision is already
  // checkpointed is not sent to the model again.
  const fresh = new Map(), batches = [], fromCheckpoint = new Set(), checkpointKeys = new Map();
  const checkpoints = { reused: 0, written: 0, invalid: 0 };
  const pending = [];
  for (const document of toExtract) {
    const key = extractionCheckpointKey({ document, projectKey: store.projectKey, models });
    checkpointKeys.set(document.doc_key, key);
    const bytes = store.readCheckpoint(key);
    const fragment = bytes === null ? null : admitCheckpoint({ bytes, key, document, projectKey: store.projectKey, models });
    if (fragment) { fresh.set(document.doc_key, fragment); fromCheckpoint.add(document.doc_key); checkpoints.reused++; }
    else { if (bytes !== null) checkpoints.invalid++; pending.push(document); }
  }
  const keep = async fragment => {
    fresh.set(fragment.doc_key, fragment);
    const key = checkpointKeys.get(fragment.doc_key);
    if (await store.writeCheckpoint(key, encode({ schema_version: GRAPH_EXTRACTION_CHECKPOINT_SCHEMA, key, fragment }))) {
      checkpoints.written++;
    }
  };
  // Bounded batches under one call budget for the whole update. A batch the model
  // refused part of no longer holds the whole update: the documents the refusals
  // belong to are left out of this generation and listed with the reason, the rest
  // are kept (and checkpointed). A document with a hole is still never written as
  // complete. A worker failure or an exhausted budget still holds the update — the
  // batches already accepted stay checkpointed for the next run.
  const excluded = new Map();
  const llm = { calls: 0, errors: 0, invalid_outputs: 0, truncated: 0, prompt_tokens: 0, output_tokens: 0, elapsed_ms: 0, embedder_calls: 0 };
  const excludedRows = () => [...excluded.values()];
  const held = (code, extra = {}) => ({ status: 'HOLD', code, changes, llm, checkpoints, excluded: excludedRows(), ...extra });
  for (const batch of planExtractionBatches(pending, extractionBatchLimits(store.binding.graph.extraction_batch))) {
    const remaining = store.binding.graph.llm.max_calls - llm.calls;
    if (remaining < 1) return held('graph_budget_exhausted');
    const result = await extractGraphFragments({ documents: batch, projectKey: store.projectKey, profile: GRAPH_EXTRACTION_PROFILE,
      binding: { ...store.binding.graph, llm: { ...store.binding.graph.llm, max_calls: remaining } }, runWorker, expectedModels: models });
    if (result.status === 'partial' || result.status === 'failed') {
      return held(result.status === 'partial' ? 'graph_budget_exhausted' : result.code, { degraded: result.degraded ?? null });
    }
    for (const key of Object.keys(llm)) llm[key] += Number.isSafeInteger(result.llm[key]) ? result.llm[key] : 0;
    let refused = new Map();
    if (result.status === 'degraded') {
      refused = refusedDocuments(batch, result);
      // Degraded with nothing to attribute it to: the whole batch is left out.
      if (refused.size === 0) refused = refusedDocuments(batch, { ...result, llm: { trace: [] } });
    }
    for (const fragment of result.fragments) if (!refused.has(fragment.doc_key)) await keep(fragment);
    const ownerOf = new Map(batch.map(document => [document.doc_key, document]));
    for (const [docKey, why] of refused) {
      const document = ownerOf.get(docKey);
      if (!document) continue;
      excluded.set(docKey, { doc_key: docKey, source_kind: document.source_kind, root_ref: document.root_ref,
        item_id: document.item_id, text_sha256: document.text_sha256, batch: batches.length + 1,
        previously_excluded: prior?.excluded.has(docKey) === true, ...why });
    }
    batches.push({ documents: batch.length, status: result.status, excluded: refused.size, llm: result.llm,
      fragments: result.fragments.filter(f => !refused.has(f.doc_key))
        .map(f => ({ doc_key: f.doc_key, stats: f.stats, tool_pruning: f.tool_pruning })) });
  }
  const included = prepared.documents.filter(document => !excluded.has(document.doc_key));
  // Nothing could be kept at all: there is no generation to write, and the reason
  // for every document is in the answer rather than in a generation.
  if (included.length === 0) return held('graph_extraction_degraded');
  // Every document the model could read is carried, and the ones it could not are
  // the same ones the selected generation already left out: writing another
  // generation would only repeat the selected one.
  if (reusable && fresh.size === 0 && carried.size === priorRows.size && included.length === carried.size
    && prepared.coverage.coverage_sha256 === prior.manifest.coverage_sha256
    && excluded.size === prior.excluded.size && [...excluded.keys()].every(key => prior.excluded.has(key))) {
    return { status: 'UNCHANGED', generation_id: prior.manifest.generation_id, pointer_sha256: prior.pointer.sha256,
      selection_epoch: prior.pointer.value.selection_epoch, changes, llm, checkpoints, excluded: excludedRows() };
  }
  const generationId = request.generation_id;
  const rows = [];
  for (const document of included) {
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
      units: document.units.length, document: documentRef, fragment: fragmentRef, origin,
      ...(fromCheckpoint.has(document.doc_key) ? { from_checkpoint: true } : {}), stats });
  }
  // `excluded` is every prepared document this generation leaves out because the
  // model's answer for it was refused, with the reason and the (text-free) shape of
  // the refusal. The coverage above still lists it as prepared: it was, and the
  // exclusion is the index's own statement about it, counted in the manifest.
  const quality = { schema_version: GRAPH_INDEX_QUALITY_SCHEMA, generation_id: generationId, coverage: prepared.coverage,
    changes: prepared.changes, extraction: batches.length === 0 && checkpoints.reused === 0 ? null : { llm, batches, checkpoints },
    excluded: excludedRows() };
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
    // Who admitted real material (id, canonical digest, classes, authority), by
    // the preparer's own judgement; null when the grant was synthetic only.
    admission: prepared.admission === null ? null : { ...prepared.admission, ref: { ...store.binding.admission } },
    profile, model: models, template_version: store.templateVersion,
    coverage: coverageRef, coverage_sha256: prepared.coverage.coverage_sha256, changes, documents: rows,
    excluded: excludedRows().map(({ doc_key, source_kind, root_ref, item_id, reason }) => ({ doc_key, source_kind, root_ref, item_id, reason })),
    counts: { documents: rows.length, extracted: rows.filter(r => r.origin === 'extracted').length,
      carried: rows.filter(r => r.origin === 'carried').length, units: rows.reduce((total, row) => total + row.units, 0),
      chunks: sum('chunks'), entities: sum('entities'), entity_relationships: sum('entity_relationships'),
      excluded: excluded.size, from_checkpoint: rows.filter(r => r.from_checkpoint === true).length },
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
    selection_epoch: epoch, changes, counts: manifest.counts, llm, checkpoints, excluded: excludedRows() };
}

// Chunks in order, grouped so no worker call exceeds the embed bounds.
export function planEmbedBatches(chunks, limits = GRAPH_EMBED_BATCH) {
  const batches = [];
  let current = [], characters = 0;
  for (const chunk of chunks) {
    if (chunk.text.length > limits.characters) fail('graph_index_chunk_too_large');
    if (current.length && (current.length + 1 > limits.chunks || characters + chunk.text.length > limits.characters)) {
      batches.push(current); current = []; characters = 0;
    }
    current.push(chunk); characters += chunk.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

// Replaces `sf_embedder`, `sf_embedder_digest` and the model revision on a row
// that carries them, and leaves every other property, including `sf_model` and
// `sf_model_digest`, exactly as the extraction wrote it.
function restamp(properties, model, revision) {
  if (!plain(properties) || !Object.hasOwn(properties, 'sf_revision_sha256')) return properties;
  return { ...properties, sf_embedder: model.embedder, sf_embedder_digest: model.embedder_digest,
    sf_revision_sha256: revision };
}

// A derived generation that keeps one generation's extraction and replaces only
// its search vectors. Changing the embedder through updateGraphIndex would make
// every fragment unreusable and re-run the model over every chunk; the relations
// in those fragments are not a function of the embedder, so this path re-reads the
// source generation by hash, asks the worker for new vectors over the same chunk
// texts, and writes a new create-only generation whose fragments say which
// extraction they reused and which embedder produced their vectors. No LLM is
// called, the pointer is not moved (selecting the result is a separate,
// authorized act) and the source generation's files are never opened for writing.
//
// request: { actor_ref, project_ref, purpose: 'context_preparation', generation_id, source_generation_id }.
export async function reembedGraphIndex({ io = null, storeRoot, bindingAddress = GRAPH_INDEX_BINDING_FILE, bindingSha256,
  request, now = new Date().toISOString(), runWorker = runGraphragWorker } = {}) {
  request = structuredClone(request);
  const result = await withIndexLock(() => {
    if (!storeToken(request?.generation_id) || !storeToken(request?.source_generation_id)
      || request.generation_id === request.source_generation_id) fail('graph_index_request_refused');
    return openIndexStore({ io, storeRoot, bindingAddress, bindingSha256, request, operation: 'index' });
  }, (store, markCommitted) => runReembed({ store, bindingSha256, request, now, runWorker, markCommitted }));
  return Object.freeze({ generation_id: request?.generation_id ?? null, ...result });
}

async function runReembed({ store, bindingSha256, request, now, runWorker, markCommitted }) {
  // The source is the generation this project has selected: a hash-verified,
  // servable manifest rather than a path a caller chose.
  if (!store.opened || store.opened.value.generation_id !== request.source_generation_id) fail('graph_index_source_not_selected');
  const sourceRef = store.opened.value.generation_ref;
  const source = verifyManifest(store, sourceRef);
  assertServable(store, source);
  const bound = validateGraphBinding(store.binding.graph);
  if (!bound.embedder) fail('graph_embedder_not_bound');

  // Every fragment, checked against its own document: a reused extraction has to
  // still be the extraction of the text whose vector is being replaced.
  const fragments = new Map(), chunks = [];
  for (const row of source.documents) {
    const fragment = JSON.parse(store.readArea(row.fragment));
    if (fragment.doc_key !== row.doc_key || fragment.project_key !== store.projectKey
      || fragment.fragment_sha256 !== row.fragment.fragment_sha256) fail('graph_index_fragment_invalid');
    const document = JSON.parse(store.readArea(row.document));
    if (!validateSourceDocument(document) || document.doc_key !== row.doc_key
      || document.project_key !== store.projectKey || document.text_sha256 !== row.text_sha256) fail('graph_index_document_invalid');
    const textOf = new Map(document.units.map(unit => [unit.unit_id, unit.text]));
    fragments.set(row.doc_key, fragment);
    for (const node of fragment.nodes) {
      if (node.label !== 'Chunk' || !node.embedding) continue;
      const unitId = node.properties?.sf_unit_id;
      if (!textOf.has(unitId) || textOf.get(unitId) !== node.properties?.text) fail('graph_index_chunk_text_changed');
      chunks.push({ doc_key: row.doc_key, unit_id: unitId, text: node.properties.text });
    }
  }
  if (chunks.length === 0) fail('graph_index_nothing_to_embed');

  const vectors = new Map();
  let embedder = null, tool = null, calls = 0, elapsed = 0;
  for (const batch of planEmbedBatches(chunks)) {
    const { exit_code: exitCode, output, worker_sha256: workerSha256 } = await runWorker({ binding: bound.worker,
      request: { operation: 'embed', profile: { embedder: bound.embedder, allowed_hosts: bound.allowed_model_hosts },
        chunks: batch.map(({ doc_key, unit_id, text }) => ({ doc_key, unit_id, text })) } });
    if (exitCode !== 0 || !plain(output)) fail(String(output?.code ?? 'graph_worker_failed'));
    if (output.status !== 'ok') {
      return { status: 'HOLD', code: String(output.code ?? 'graph_embed_failed'),
        refused: (Array.isArray(output.refused) ? output.refused : []).map(({ doc_key, unit_id, characters, error_type }) =>
          ({ doc_key, unit_id, characters, error_type })), dimensions: output.dimensions ?? null };
    }
    const reported = output.models?.embedder;
    if (reported?.model !== bound.embedder.model || !SHA.test(reported?.digest ?? '')) fail('graph_worker_models_invalid');
    const pin = { model: reported.model, digest: reported.digest, pin_kind: reported.pin_kind ?? 'model_digest' };
    if (embedder !== null && !equal(embedder, pin)) fail('graph_embedder_changed');
    embedder = pin;
    if (!SHA.test(workerSha256 ?? '') || typeof output.packages?.['neo4j-graphrag'] !== 'string') fail('graph_worker_models_invalid');
    const batchTool = { worker_sha256: workerSha256, packages: output.packages };
    if (tool !== null && !equal(tool, batchTool)) fail('graph_worker_models_invalid');
    tool = batchTool;
    calls += Number.isSafeInteger(output.embedder_calls) ? output.embedder_calls : 0;
    elapsed += Number.isSafeInteger(output.elapsed_ms) ? output.elapsed_ms : 0;
    for (const row of Array.isArray(output.vectors) ? output.vectors : []) {
      if (!Array.isArray(row?.embedding) || row.embedding.length === 0 || !row.embedding.every(Number.isFinite)) fail('graph_embedding_invalid');
      vectors.set(`${row.doc_key}${row.unit_id}`, row.embedding);
    }
  }
  const dimensions = [...new Set([...vectors.values()].map(vector => vector.length))];
  if (vectors.size !== chunks.length || dimensions.length !== 1) fail('graph_embedding_incomplete');

  // The extraction's model revision with only its embedder half replaced, so a
  // reader can see that the entities and relations came from the earlier run.
  const model = { ...source.model, embedder: embedder.model, embedder_digest: embedder.digest, embedding_source: 'reembed' };
  const revision = sha256Canonical(model);
  const generationId = request.generation_id, rows = [];
  for (const row of source.documents) {
    const { fragment_sha256: priorSha256, ...body } = fragments.get(row.doc_key);
    const nodes = body.nodes.map(node => {
      const properties = restamp(node.properties, model, revision);
      if (node.label !== 'Chunk' || !node.embedding) return { ...node, properties };
      const embedding = vectors.get(`${row.doc_key}${node.properties.sf_unit_id}`);
      if (!embedding) fail('graph_embedding_incomplete');
      return { ...node, properties, embedding_ref: embeddingRef(embedding), embedding };
    });
    const rebuilt = { ...body, model, nodes,
      relationships: body.relationships.map(rel => ({ ...rel, properties: restamp(rel.properties, model, revision) })),
      extraction_reused_from: { generation_id: source.generation_id, fragment_sha256: priorSha256 } };
    const fragment = { ...rebuilt, fragment_sha256: sha256Canonical({ ...rebuilt,
      nodes: nodes.map(({ embedding, ...node }) => node) }) };
    const hex = row.doc_key.slice('sha256:'.length);
    const written = await store.writeCreateOnly(generationId,
      `${GRAPH_INDEX_AREAS.index}/generations/${generationId}/fragments/${hex}.json`, encode(fragment));
    // The document itself is unchanged, so the new generation points at the bytes
    // the source generation already holds rather than writing a second copy.
    rows.push({ ...row, document: { ...row.document }, fragment: { ...written, fragment_sha256: fragment.fragment_sha256 },
      origin: 'reembedded' });
  }
  const sourceQuality = JSON.parse(store.readArea(source.coverage));
  const unchanged = rows.map(({ source_kind, root_ref, item_id, doc_key }) => ({ source_kind, root_ref, item_id, doc_key }));
  const embedding = { model: embedder.model, digest: embedder.digest, pin_kind: embedder.pin_kind,
    dimensions: dimensions[0], chunks: chunks.length, calls, elapsed_ms: elapsed, tool };
  const quality = { schema_version: GRAPH_INDEX_QUALITY_SCHEMA, generation_id: generationId, coverage: sourceQuality.coverage,
    changes: { added: [], changed: [], removed: [], unchanged, unavailable: [] }, extraction: null,
    derived_from: { generation_id: source.generation_id, coverage: { ...source.coverage }, reused: 'extraction' },
    embedding, reembedded_at: now };
  const coverageRef = await store.writeCreateOnly(generationId,
    `${GRAPH_INDEX_AREAS.quality}/generations/${generationId}/coverage.json`, encode(quality));
  const manifest = { schema_version: GRAPH_INDEX_MANIFEST_SCHEMA, generation_id: generationId, status: 'complete',
    project_ref: store.binding.project_ref, project_key: store.projectKey, approved_fs_key: store.binding.approved_fs_key,
    // No selection epoch: this run writes a generation and selects nothing.
    writer: { actor_ref: request.actor_ref, operation: 'reembed', binding_sha256: bindingSha256, acl_sha256: store.aclSha256, epoch: null },
    supersedes: null,
    derived_from: { generation_id: source.generation_id, manifest_ref: { ...sourceRef }, reused: 'extraction' },
    grant: source.grant, admission: source.admission, profile: source.profile, model, template_version: store.templateVersion,
    coverage: coverageRef, coverage_sha256: source.coverage_sha256,
    changes: { added: 0, changed: 0, removed: 0, unchanged: rows.length, unavailable: 0 }, documents: rows,
    counts: { ...source.counts, extracted: 0, carried: 0, reembedded: rows.length },
    // Nothing asked a language model anything on this path.
    llm: { calls: 0, errors: 0, invalid_outputs: 0, truncated: 0, prompt_tokens: 0, output_tokens: 0, elapsed_ms: 0, embedder_calls: 0 },
    embedding };
  const manifestRef = await store.writeCreateOnly(generationId,
    `${GRAPH_INDEX_AREAS.index}/generations/${generationId}/generation.json`, encode(manifest));
  verifyManifest(store, manifestRef);
  markCommitted();
  return { status: 'WRITTEN', generation_id: generationId, manifest_ref: manifestRef, pointer_moved: false,
    source_generation_id: source.generation_id, source_manifest_ref: { ...sourceRef },
    counts: manifest.counts, changes: manifest.changes, embedding, llm: manifest.llm };
}

// Re-selects an earlier complete generation (rollback) under the same lock,
// authority, grant and expected-prior rules. request: { ..., generation_ref, expected_prior }.
export async function selectGraphIndexGeneration({ io = null, storeRoot, bindingAddress = GRAPH_INDEX_BINDING_FILE, bindingSha256, request,
  hooks = {} } = {}) {
  request = structuredClone(request);
  return withIndexLock(() => {
    if (!Object.hasOwn(request ?? {}, 'expected_prior')) fail('graph_index_request_refused');
    return openIndexStore({ io, storeRoot, bindingAddress, bindingSha256, request, operation: 'index' });
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

// Read view of a generation for retrieval or a graph load. The selected one by
// default; `generationRef` opens a named one instead, which is how a derived
// generation is read without moving the pointer. A named generation is held to
// exactly the same rules: the ref must address this project's index area, every
// file is re-read by hash, and the grant and data classes it was built under must
// still admit this actor. `selected` says which of the two a view is, so nothing
// reads a derived generation as the project's current answer. assertCurrent
// refuses a view whose pointer, binding or access changed since it was opened.
// `graph_binding` is the validated graph binding this view was opened under,
// including the graph database endpoint when one is bound.
export function openGraphIndex({ io = null, storeRoot, bindingAddress = GRAPH_INDEX_BINDING_FILE, bindingSha256, request,
  generationRef = null } = {}) {
  const store = openIndexStore({ io, storeRoot, bindingAddress, bindingSha256, request: structuredClone(request), operation: 'read' });
  if (generationRef === null && !store.opened) fail('graph_index_not_selected');
  const openedRef = generationRef ?? store.opened.value.generation_ref;
  const manifest = verifyManifest(store, openedRef);
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
  return Object.freeze({ manifest, generation_ref: { ...openedRef }, pointer_sha256: store.opened?.sha256 ?? null,
    selection_epoch: store.opened?.value.selection_epoch ?? null,
    selected: store.opened !== null && store.opened.value.generation_id === manifest.generation_id,
    graph_binding: store.graphBinding, readDocument, readFragment, readQuality, assertCurrent: store.assertUnchanged });
}
