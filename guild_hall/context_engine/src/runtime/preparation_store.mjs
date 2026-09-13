// Where a preparation and its validation come to rest in a project store.
//
// Three places, each the one Plan 17 already names. Source references go to
// `10_입력자료/<KIND>`, which holds "exact source/revision/locator references by
// source kind": revisions, digests and locators, and never a copy of a collected
// original, which stays with its collection owner. Prepared body text lives in
// the generation, not here - though a locator can legitimately carry a fragment
// of text when that is how it locates, as a heading does for a document. Prepared documents
// go to `20_문서검색/본문·표_추출` as a create-only generation, inactive: nothing
// here writes a current-generation pointer, so landing a preparation never
// switches what anyone reads. Validation reports go to
// `20_문서검색/원문위치·추출품질`, which holds quality records - beside the
// generation rather than inside it, so adding a report cannot move the digest of
// the generation it reports on.
//
// This is where the preparation record gets narrower, and it is worth saying
// exactly how far. The write path refuses an actor the binding does not authorize
// for `prepare`, refuses a purpose that is not preparation, and records which
// actor under which binding and ACL digests admission used. What it does not do
// is make a record *found* in the store proof of any of that: this module is not
// the only thing that can write to a filesystem, and the manifest's digest is a
// self-consistency checksum, not a signature. A generation copied in from
// elsewhere reads back clean. Narrowing that would take a signature or a store
// only one writer can reach, and neither is here.
import { createHash } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { lstatSync, readdirSync } from 'node:fs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE_VERSIONS,
  resolveProjectTemplateVersion } from '../../../path_registry/src/target_materializer.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { rootedStore, safeStoreRel, storeToken } from './pair_store.mjs';
import { SOURCE_PREPARATION_PURPOSE, validateSourceDocument } from './source_documents.mjs';
import { PREPARATION_RUN_SCHEMA, documentsDigest, totalDigest } from './preparation_run.mjs';
import { VALIDATION_REPORT_SCHEMA, reportCovers } from './preparation_validation.mjs';
import { SOURCE_CHECK_SCHEMA } from './source_original_check.mjs';
import { GRAPH_INDEX_BINDING_FILE, GRAPH_INDEX_BINDING_MODE } from './graph_index_generation.mjs';

export const PREPARATION_GENERATION_SCHEMA = 'soulforge.context_preparation_generation.v1';
export const SOURCE_REFERENCE_SCHEMA = 'soulforge.context_source_reference.v1';
// The same binding file and mode the graph index store opens, imported rather
// than restated: one project store has one binding, and a second copy of its name
// would be a second thing to keep in step.
export const PREPARATION_STORE_BINDING_FILE = GRAPH_INDEX_BINDING_FILE;
export const PREPARATION_STORE_BINDING_MODE = GRAPH_INDEX_BINDING_MODE;
export const PREPARATION_WRITE_OPERATION = 'prepare';
export const PREPARATION_STORE_AREAS = Object.freeze({ documents: '20_문서검색/본문·표_추출',
  quality: '20_문서검색/원문위치·추출품질', references: '10_입력자료' });
// Which input directory each source kind's references belong in. The template
// declares the directories and `source_documents.mjs` declares the kinds; this is
// the one place they meet, and a test pins that neither side moves without it.
export const SOURCE_KIND_DIRECTORIES = Object.freeze({ document: 'DOCUMENT', linear: 'LINEAR', slack: 'SLACK',
  mail: 'MAIL', voice: 'VOICE' });

const SHA = /^sha256:[0-9a-f]{64}$/u;
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const encode = value => Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// A document key names its own file, minus the algorithm prefix: a store path
// segment may not contain ':'. The hex is the whole of the identity.
const docFile = key => SHA.test(key ?? '') ? `${key.slice('sha256:'.length)}.json` : fail('preparation_store_doc_key_invalid');

export class PreparationStoreError extends Error {
  constructor(code) { super(code); this.name = 'PreparationStoreError'; this.code = code; }
}
const fail = code => { throw new PreparationStoreError(code); };

/**
 * Opens the store for one actor and operation. This mirrors the graph index
 * store's admission on purpose - same binding file, same ACL, same template
 * resolution - rather than importing it, because that opener also owns an index
 * pointer and lock lifecycle this has no business touching. A test asserts both
 * admit and refuse the same actors; keep them in step.
 */
// `io` is how a real estate gets in: an aliased io resolves `data_root/…` through
// the root table, while `storeRoot` keeps meaning one absolute root holding the
// same relative tree, which is what a synthetic store is. Addresses are identical
// either way, so nothing stored changes with the host.
// `bindingAddress` is where the binding is, said in the same address language as
// everything else. A synthetic store keeps it beside the project tree, which is
// the default; a real estate keeps the per-project binding under `control_root`,
// because it carries absolute source roots and those are a private fact that does
// not belong in the data plane the project tree lives in.
function openPreparationStore({ storeRoot, io: suppliedIo = null, bindingSha256, request, operation,
  bindingAddress = PREPARATION_STORE_BINDING_FILE } = {}) {
  let io = suppliedIo;
  if (io === null) { try { io = rootedStore(storeRoot); } catch { fail('preparation_store_invalid'); } }
  const read = (name, max = 64 * 1024 * 1024) => { try { return io.read(name, max); } catch { fail('preparation_store_file_unavailable'); } };
  if (!safeStoreRel(bindingAddress)) fail('preparation_store_binding_address_invalid');
  const bindingBytes = read(bindingAddress);
  if (digest(bindingBytes) !== bindingSha256) fail('preparation_store_binding_mismatch');
  const binding = JSON.parse(bindingBytes);
  if (!plain(binding) || binding.mode !== PREPARATION_STORE_BINDING_MODE
    || !storeToken(binding.approved_fs_key) || exactRefIdentityKey(binding.project_ref) === null
    || !safeStoreRel(binding.acl_path) || !Array.isArray(binding.write_authority?.actors)
    || !Array.isArray(binding.write_authority?.operations)) fail('preparation_store_binding_invalid');
  const projectKey = exactRefIdentityKey(binding.project_ref);
  const projectPath = `data_root/20_PROJECTS/${binding.approved_fs_key}`;
  if (!plain(request) || typeof request.actor_ref !== 'string' || typeof request.purpose !== 'string'
    || exactRefIdentityKey(request.project_ref) !== projectKey) fail('preparation_store_request_refused');
  const aclBytes = read(binding.acl_path, 1024 * 1024);
  const acl = JSON.parse(aclBytes);
  const grant = acl.actors?.find(row => row.actor_ref === request.actor_ref)?.grant;
  if (!grant || acl.revoked_actors?.includes(request.actor_ref) || !grant.allowed_projects?.includes(projectKey)
    || !grant.allowed_purposes?.includes(request.purpose) || !grant.allowed_scopes?.includes('project')
    || !Array.isArray(grant.allowed_data_classes)) fail('preparation_store_access_refused');
  // Writing is a narrower thing than reading: the binding has to name this actor
  // and this operation. That is what makes a record in this store attributable.
  if (operation === PREPARATION_WRITE_OPERATION
    && (request.purpose !== SOURCE_PREPARATION_PURPOSE
      || !binding.write_authority.actors.includes(request.actor_ref)
      || !binding.write_authority.operations.includes(PREPARATION_WRITE_OPERATION))) fail('preparation_store_access_refused');
  const templateVersion = resolveProjectTemplateVersion((dir) => {
    try { return lstatSync(io.path(`${projectPath}/${dir}`)).isDirectory(); } catch { return false; }
  });
  if (templateVersion === null) fail('preparation_store_template_invalid');
  return { io, binding, projectKey, projectPath, templateVersion, aclGrant: grant, aclSha256: digest(aclBytes),
    bindingSha256, read };
}

// Create-only, but replay-tolerant: a file already holding exactly these bytes is
// the same fact written again, not a conflict. Different bytes under a name that
// exists is always a conflict, whatever wrote it.
async function writeOnce(io, name, bytes, allowed) {
  // Landing must not be able to reach outside the areas this store's own layout
  // declares. Creating a directory the layout does not have would change what
  // layout the store is, as a side effect of a write.
  if (!safeStoreRel(name) || !allowed.some(prefix => name.startsWith(prefix))) fail('preparation_store_write_refused');
  const target = io.path(name, true);
  await mkdir(dirname(target), { recursive: true });
  let handle;
  try { handle = await open(target, 'wx'); }
  catch {
    const existing = io.read(name);
    if (digest(existing) !== digest(bytes)) fail('preparation_store_conflict');
    return { path: name, sha256: digest(existing), written: false };
  }
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  return { path: name, sha256: digest(bytes), written: true };
}

// Names an adapter assigns to a person as the provider wrote them. They locate
// nothing on their own and the adapter that has one already publishes its hashed
// form, so the reference does not restate them.
const PROVIDER_LABEL_KEYS = Object.freeze(['speaker_label']);
function withoutProviderLabels(locator) {
  return Object.fromEntries(Object.entries(locator).filter(([key]) => !PROVIDER_LABEL_KEYS.includes(key)));
}

function referenceFor(document, projectKey) {
  const directory = SOURCE_KIND_DIRECTORIES[document.source_kind];
  if (directory === undefined) fail('preparation_store_source_kind_unknown');
  // Locators as the adapter wrote them, minus anything an adapter deliberately
  // kept out of its own durable identity. A summarized locator locates nothing, so
  // a document heading does travel here - that is how that adapter points at a
  // section. A provider speaker label does not: the voice adapter hashes it into
  // speaker_ref precisely so the raw label is not carried, and copying the locator
  // wholesale would put it back. Unit body text is not here - it is in the generation.
  const body = { schema_version: SOURCE_REFERENCE_SCHEMA, project_key: projectKey, doc_key: document.doc_key,
    source_kind: document.source_kind, root_ref: document.root_ref, item_id: document.item_id,
    revision_policy: document.revision_policy, primary_revision_sha256: document.primary_revision_sha256,
    composite_revision_sha256: document.composite_revision_sha256, components: document.components,
    scope: document.scope ?? null, adapter_profile: document.adapter_profile, text_sha256: document.text_sha256,
    valid_at: document.valid_at, known_at: document.known_at, time_basis: document.time_basis,
    locators: document.units.map(unit => ({ unit_id: unit.unit_id, unit_kind: unit.unit_kind,
      locator: withoutProviderLabels(unit.locator) })) };
  return { directory, path: `${PREPARATION_STORE_AREAS.references}/${directory}/references/${docFile(document.doc_key)}`, body };
}

/**
 * Lands one preparation: its source references, then its documents and manifest
 * as an inactive generation named by the preparation run id. Replaying the same
 * preparation writes the same bytes and reports that it wrote nothing new.
 */
export async function writePreparationGeneration({ storeRoot, io = null, bindingSha256, bindingAddress, request, preparation } = {}) {
  const store = openPreparationStore({ storeRoot, io, bindingSha256, bindingAddress, request, operation: PREPARATION_WRITE_OPERATION });
  const run = preparation?.run ?? null;
  // Only a record the preparer emitted is landed. A result without one says why,
  // and that reason travels instead of being flattened into a generic refusal.
  if (run === null) fail(preparation?.run_unavailable === 'record_not_requested'
    ? 'preparation_store_run_not_requested' : 'preparation_store_run_unavailable');
  if (run.schema_version !== PREPARATION_RUN_SCHEMA || !storeToken(run.preparation_run_id)
    || run.project_key !== store.projectKey) fail('preparation_store_run_invalid');
  // The record's own digest is recomputed at the entrance, not trusted from its
  // field: a run whose claims changed after its hash was minted is not a record
  // of anything, and landing it would file that claim as if the preparer made it.
  const { run_sha256: statedRun, ...runBody } = run;
  if (!SHA.test(statedRun ?? '') || totalDigest(runBody) !== statedRun) fail('preparation_store_run_digest_mismatch');
  const documents = preparation.documents ?? [];
  if (!Array.isArray(documents) || !documents.every(document => plain(document) && validateSourceDocument(document))) {
    fail('preparation_store_documents_invalid');
  }
  // What the ACL admits is checked against each document, not merely present:
  // a writer whose grant admits no data class lands nothing, and a document of
  // another project never becomes this project's material.
  assertDocumentsAdmitted(store, documents);
  // The record has to describe the material filed beside it. Without this the
  // four versions the manifest records would attest a different preparation's
  // documents, and nothing downstream would notice.
  if (documentsDigest(documents) !== run.documents_sha256
    || preparation.coverage?.coverage_sha256 !== run.coverage_sha256
    || preparation.grant?.grant_sha256 !== run.grant_sha256
    || totalDigest(preparation.changes ?? null) !== run.changes_sha256) fail('preparation_store_run_does_not_describe_result');
  const layout = PROJECT_CONTEXT_DIRECTORY_TEMPLATE_VERSIONS[store.templateVersion];
  const generation = `${store.projectPath}/${PREPARATION_STORE_AREAS.documents}/generations/${run.preparation_run_id}`;
  // Checked before a byte is written. A conflict found halfway would leave files
  // belonging to no landed generation, and the generation id is the one thing a
  // second preparation can collide on.
  try {
    const held = JSON.parse(store.io.read(`${generation}/manifest.json`));
    if (held?.run?.run_sha256 !== run.run_sha256) fail('preparation_store_conflict');
  } catch (error) { if (error instanceof PreparationStoreError) throw error; }
  const allowed = [`${generation}/`, `${store.projectPath}/${PREPARATION_STORE_AREAS.references}/`];
  const references = [];
  for (const document of documents) {
    const reference = referenceFor(document, store.projectKey);
    // A kind this store's layout has no input directory for is refused, not
    // filed by creating the directory: a store keeps the layout it was formed under.
    if (!layout.includes(`${PREPARATION_STORE_AREAS.references}/${reference.directory}`)) {
      fail('preparation_store_kind_not_in_layout');
    }
    references.push(await writeOnce(store.io, `${store.projectPath}/${reference.path}`, encode(reference.body), allowed));
  }
  const files = [];
  for (const document of documents) {
    files.push(await writeOnce(store.io, `${generation}/documents/${docFile(document.doc_key)}`, encode(document), allowed));
  }
  const body = { schema_version: PREPARATION_GENERATION_SCHEMA, preparation_run_id: run.preparation_run_id,
    project_ref: store.binding.project_ref, project_key: store.projectKey,
    approved_fs_key: store.binding.approved_fs_key,
    // Four versions, kept apart on purpose: who prepared, under which rules, in
    // which folder layout, and - once a report exists - which validator judged it.
    template_version: store.templateVersion, preparer: { id: run.preparer_id, version: run.preparer_version,
      code_digest: run.preparer_code_digest, rules_digest: run.preparation_rules_digest },
    writer: { actor_ref: request.actor_ref, operation: PREPARATION_WRITE_OPERATION,
      binding_sha256: store.bindingSha256, acl_sha256: store.aclSha256 },
    run, grant: preparation.grant, coverage: preparation.coverage, changes: preparation.changes,
    references: references.map(({ path, sha256 }) => ({ path, sha256 })),
    documents: files.map(({ path, sha256 }) => ({ path, sha256 })) };
  const manifest = { ...body, generation_sha256: totalDigest(body) };
  const written = await writeOnce(store.io, `${generation}/manifest.json`, encode(manifest), allowed);
  return Object.freeze({ status: written.written ? 'WRITTEN' : 'REPLAYED',
    generation_id: run.preparation_run_id, manifest: { path: written.path, sha256: written.sha256 },
    generation_sha256: manifest.generation_sha256, template_version: store.templateVersion,
    references: references.length, documents: files.length, store_root: storeRoot });
}

/**
 * Adds one validation report beside the generation it examined. Append-only and
 * outside the generation, so an old PASS and a new FAIL both stay and neither
 * moves the generation's digest.
 */
export async function appendValidationReport({ storeRoot, io = null, bindingSha256, bindingAddress, request, report } = {}) {
  const store = openPreparationStore({ storeRoot, io, bindingSha256, bindingAddress, request, operation: PREPARATION_WRITE_OPERATION });
  if (!plain(report) || report.schema_version !== VALIDATION_REPORT_SCHEMA
    || !storeToken(report.validation_run_id) || !SHA.test(report.validated_run_sha256 ?? '')
    || typeof report.outcome !== 'string' || !Array.isArray(report.checks)) {
    fail('preparation_store_report_invalid');
  }
  // The report's own digest is recomputed from its body. A report whose outcome
  // was edited after the validator signed off on it is not a validation receipt,
  // and filing it under a fresh file hash would only preserve the edit.
  const { report_sha256: statedReport, ...reportBody } = report;
  if (!SHA.test(statedReport ?? '') || totalDigest(reportBody) !== statedReport) fail('preparation_store_report_digest_mismatch');
  const generation = await readPreparationGeneration({ storeRoot, io, bindingSha256, bindingAddress, request,
    generationId: findGenerationFor(store, report) });
  // The report has to be about a generation this store actually holds, and
  // reportCovers recomputes that record's digest rather than trusting its field.
  if (!reportCovers(report, generation.manifest.run)) fail('preparation_store_report_unrelated');
  const path = `${store.projectPath}/${PREPARATION_STORE_AREAS.quality}/validations/`
    + `${generation.manifest.preparation_run_id}/${report.validation_run_id}.json`;
  const written = await writeOnce(store.io, path, encode(report),
    [`${store.projectPath}/${PREPARATION_STORE_AREAS.quality}/validations/`]);
  return Object.freeze({ status: written.written ? 'APPENDED' : 'REPLAYED', report: { path: written.path, sha256: written.sha256 },
    generation_id: generation.manifest.preparation_run_id, outcome: report.outcome,
    validator: { id: report.validator_id, version: report.validator_version, code_digest: report.validator_code_digest },
    // Stated, not assumed: adding a report leaves the generation's digest alone.
    generation_sha256: generation.manifest.generation_sha256, store_root: storeRoot });
}

/**
 * Adds one original-comparison report beside the generation whose documents it
 * examined. Same rules as a validation report: append-only, outside the
 * generation, its own digest recomputed, and it must name the documents this
 * store actually holds (by their digest), not merely a run id.
 */
export async function appendSourceCheckReport({ storeRoot, io = null, bindingSha256, bindingAddress, request, generationId, report } = {}) {
  const store = openPreparationStore({ storeRoot, io, bindingSha256, bindingAddress, request, operation: PREPARATION_WRITE_OPERATION });
  if (!plain(report) || report.schema_version !== SOURCE_CHECK_SCHEMA || !storeToken(report.check_run_id)
    || typeof report.outcome !== 'string' || !Array.isArray(report.documents) || !SHA.test(report.documents_sha256 ?? '')) {
    fail('preparation_store_report_invalid');
  }
  const { report_sha256: stated, ...body } = report;
  if (!SHA.test(stated ?? '') || totalDigest(body) !== stated) fail('preparation_store_report_digest_mismatch');
  const generation = await readPreparationGeneration({ storeRoot, io, bindingSha256, bindingAddress, request, generationId });
  if (documentsDigest(generation.documents) !== report.documents_sha256 || report.project_key !== store.projectKey) {
    fail('preparation_store_report_unrelated');
  }
  const path = `${store.projectPath}/${PREPARATION_STORE_AREAS.quality}/source_checks/${generationId}/${report.check_run_id}.json`;
  const written = await writeOnce(store.io, path, encode(report), [`${store.projectPath}/${PREPARATION_STORE_AREAS.quality}/source_checks/`]);
  return Object.freeze({ status: written.written ? 'APPENDED' : 'REPLAYED', report: { path: written.path, sha256: written.sha256 },
    generation_id: generationId, outcome: report.outcome, counts: report.counts,
    checker: { id: report.checker_id, version: report.checker_version, code_digest: report.checker_code_digest },
    generation_sha256: generation.manifest.generation_sha256, store_root: storeRoot });
}

// Every document must belong to this project and be of a data class the actor's
// current grant admits. Presence of the allowlist is not permission; membership is.
function assertDocumentsAdmitted(store, documents) {
  const classes = store.aclGrant.allowed_data_classes;
  for (const document of documents) {
    if (document.project_key !== store.projectKey) fail('preparation_store_document_project_mismatch');
    if (typeof document.data_class !== 'string' || !classes.includes(document.data_class)) fail('preparation_store_data_class_refused');
  }
}

// A directory that merely looks like a generation must not be able to answer for
// one: an unverifiable manifest is passed over rather than returned, so one bad
// directory cannot block every honest append.
function findGenerationFor(store, report) {
  for (const id of listGenerationIds(store)) {
    let manifest;
    try { manifest = JSON.parse(store.read(`${store.projectPath}/${PREPARATION_STORE_AREAS.documents}/generations/${id}/manifest.json`)); }
    catch { continue; }
    if (manifest?.run?.run_sha256 !== report.validated_run_sha256) continue;
    const { generation_sha256: stated, ...body } = manifest;
    if (manifest.schema_version !== PREPARATION_GENERATION_SCHEMA || manifest.preparation_run_id !== id
      || manifest.project_key !== store.projectKey || totalDigest(body) !== stated) continue;
    return id;
  }
  return fail('preparation_store_generation_absent');
}

function listGenerationIds(store) {
  try { return readdirSync(store.io.path(`${store.projectPath}/${PREPARATION_STORE_AREAS.documents}/generations`)).sort(); }
  catch { return []; }
}

/** Reads one generation back and re-verifies every file against its manifest. */
export async function readPreparationGeneration({ storeRoot, io = null, bindingSha256, bindingAddress, request, generationId } = {}) {
  const store = openPreparationStore({ storeRoot, io, bindingSha256, bindingAddress, request, operation: 'read' });
  if (!storeToken(generationId)) fail('preparation_store_generation_invalid');
  const base = `${store.projectPath}/${PREPARATION_STORE_AREAS.documents}/generations/${generationId}`;
  const manifestBytes = store.read(`${base}/manifest.json`);
  const manifest = JSON.parse(manifestBytes);
  if (manifest?.schema_version !== PREPARATION_GENERATION_SCHEMA || manifest.preparation_run_id !== generationId
    || manifest.project_key !== store.projectKey) fail('preparation_store_generation_invalid');
  const { generation_sha256: stated, ...body } = manifest;
  if (totalDigest(body) !== stated) fail('preparation_store_generation_mismatch');
  // A manifest is only trusted to name files inside its own generation and this
  // project's reference area. A self-consistent manifest pointing elsewhere is
  // refused before a byte of the foreign file is read: the io's path safety says
  // the file is inside the store, not that this project's request may read it.
  const inScope = (row, prefix) => plain(row) && safeStoreRel(row.path) && row.path.startsWith(prefix);
  if (!Array.isArray(manifest.documents) || !Array.isArray(manifest.references)
    || !manifest.documents.every(row => inScope(row, `${base}/documents/`))
    || !manifest.references.every(row => inScope(row, `${store.projectPath}/${PREPARATION_STORE_AREAS.references}/`))) {
    fail('preparation_store_generation_scope_refused');
  }
  const documents = [];
  for (const row of manifest.documents) {
    const bytes = store.read(row.path);
    if (digest(bytes) !== row.sha256) fail('preparation_store_generation_mismatch');
    documents.push(JSON.parse(bytes));
  }
  for (const row of manifest.references) {
    if (digest(store.read(row.path)) !== row.sha256) fail('preparation_store_generation_mismatch');
  }
  // Read under the ACL as it is now. Narrowing an actor's data classes stops the
  // body reaching them at once; the generation itself stays where it is.
  assertDocumentsAdmitted(store, documents);
  return Object.freeze({ manifest, documents: Object.freeze(documents),
    preparation: Object.freeze({ grant: manifest.grant, documents: Object.freeze(documents),
      coverage: manifest.coverage, changes: manifest.changes }),
    validations: listValidationIds(store, generationId), store_root: storeRoot });
}

function listValidationIds(store, generationId) {
  try {
    return readdirSync(store.io.path(`${store.projectPath}/${PREPARATION_STORE_AREAS.quality}/validations/${generationId}`))
      .sort().filter(name => name.endsWith('.json')).map(name => name.slice(0, -'.json'.length));
  } catch { return []; }
}
