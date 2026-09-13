// Dev harness and lane entry point: bring one project's graph index up to what
// the collectors now hold, and put the result in the unified graph database.
//
// Five steps, in this order, for each project named:
//   1. grant    re-list the items custody holds for this project, by the same
//               three rules the inventory uses, bounded by what the binding's
//               admission admits. A new item, an item whose revision moved, an
//               item custody no longer holds and a source the admission stopped
//               admitting all show up here as a difference in the grant -- so
//               "what may be read" and "what is read" stay the same question.
//               A changed grant is written create-only and the binding is
//               re-pointed at it, keeping a copy of the binding it replaced.
//   2. index    updateGraphIndex: the preparer re-reads every granted item, only
//               added and changed documents go to the extraction model, the rest
//               are carried forward by reference, and the pointer moves under its
//               own lock. Nothing changed means UNCHANGED and the run stops here.
//   3. load     materialize the selected generation into the database, replacing
//               only this project's own previous generation.
//   4. link     re-apply the L1 explicit-reference rule to the loaded projection.
//   5. receipt  how many items were in scope, how many reached the database, what
//               is waiting or failed and why, and when the database last wrote it.
//
// The harness holds no address of its own: the root table is the one absolute
// path, the binding names the database and the sources, and where receipts go is
// an argument. It calls no model beyond the extraction and embedding the index
// generation already does, and it never deletes a store file.
//
// usage:
//   node estate_graph_sync.mjs --root-table <file> --projects P26-014,P23-043
//        --receipts <dir> [--binding graph_index_binding.unified.json] [--dry]
//        [--root-table-sha256 sha256:...] [--json]
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { openGraphIndex, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { EXPLICIT_LINK_RULES, inspectGraphDatabase, linkExplicitReferences,
  materializeGraphIndex } from '../src/runtime/graph_database.mjs';
import { validateSourceGrant, SOURCE_GRANT_SCHEMA } from '../src/runtime/source_documents.mjs';
import { grantCandidates } from './estate_inventory.mjs';

export const GRAPH_SYNC_SCHEMA = 'soulforge.context_graph_sync_receipt.v1';
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const BINDING_FILE = /^graph_index_binding(?:\.[a-z0-9]{1,32})?\.json$/u;
const PREPARER = 'actor:hpp-primary-01:context-preparer';
const READER = 'actor:owner:context-reader';
const LINEAR_IDENTIFIER_FACT = 'linear.identifier';
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

export class GraphSyncError extends Error {
  constructor(code) { super(code); this.name = 'GraphSyncError'; this.code = code; }
}
const fail = code => { throw new GraphSyncError(code); };

/** The alias address of an absolute path under one of the table's roots. */
export function aliasAddressFor(rootTable, absolute) {
  const separator = String.fromCharCode(92);
  const normalise = value => String(value).split(separator).join('/').replace(/\/+$/u, '');
  const target = normalise(absolute);
  for (const [alias, root] of Object.entries(rootTable.roots)) {
    const base = normalise(root);
    if (target === base) return alias;
    if (target.startsWith(`${base}/`)) return `${alias}/${target.slice(base.length + 1)}`;
  }
  return null;
}

/** Item ids per root, as a grant holds them. Order does not matter; membership does. */
const itemsOf = grant => new Map((grant.sources ?? []).map(source =>
  [source.root_ref, new Set(source.items.map(item => item.item_id))]));

/** What changed between the grant in force and the one custody now supports. */
export function grantDifference(previous, next) {
  const before = itemsOf(previous), after = itemsOf(next);
  const roots = [...new Set([...before.keys(), ...after.keys()])].sort();
  const added = [], removed = [];
  for (const root of roots) {
    for (const id of after.get(root) ?? []) if (!(before.get(root) ?? new Set()).has(id)) added.push({ root_ref: root, item_id: id });
    for (const id of before.get(root) ?? []) if (!(after.get(root) ?? new Set()).has(id)) removed.push({ root_ref: root, item_id: id });
  }
  return { added, removed, changed: added.length + removed.length > 0 };
}

/** The next `<prefix>-NNN` after the generations already in the store. */
export function nextGenerationId(prefix, existing) {
  const numbers = existing.map(name => {
    const match = new RegExp(`^${prefix}-(\\d{3})$`, 'u').exec(name);
    return match ? Number.parseInt(match[1], 10) : 0;
  });
  return `${prefix}-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

async function applyLink({ io, bindingAddress, bindingSha256, projectRef, graphBinding }) {
  const view = () => openGraphIndex({ io, bindingAddress, bindingSha256,
    request: { actor_ref: READER, project_ref: projectRef, purpose: 'context_query' } });
  const opened = view();
  const identifiers = {};
  for (const row of opened.manifest.documents) {
    const document = opened.readDocument(row.doc_key);
    const fact = (document.facts ?? []).find(entry => entry?.name === LINEAR_IDENTIFIER_FACT);
    const token = typeof fact?.value === 'string' ? fact.value.trim() : '';
    if (!token) continue;
    // A token two documents both claim is an ambiguity this harness reports
    // rather than resolving by order; the rest of the rule still applies.
    if (identifiers[token] && identifiers[token] !== row.doc_key) return { status: 'ambiguous', token, counts: null };
    identifiers[token] = row.doc_key;
  }
  if (Object.keys(identifiers).length === 0) return { status: 'no_identifiers', counts: null };
  const applied = await linkExplicitReferences({ view: view(), binding: graphBinding, identifiers,
    rule: EXPLICIT_LINK_RULES[0], apply: true });
  return { status: applied.status, rule: EXPLICIT_LINK_RULES[0], identifiers: Object.keys(identifiers).length,
    counts: applied.counts ?? null };
}

export async function syncProject({ io, rootTable, project, bindingFile = 'graph_index_binding.unified.json',
  receiptsDir, dry = false, now = new Date().toISOString(), runWorker = undefined } = {}) {
  if (!PROJECT_CODE.test(project ?? '')) fail('graph_sync_project_invalid');
  if (!BINDING_FILE.test(bindingFile)) fail('graph_sync_binding_invalid');
  const bindingAddress = `control_root/project-bindings/${project}/${bindingFile}`;
  let bindingBytes;
  try { bindingBytes = io.read(bindingAddress, 1024 * 1024); } catch { fail('graph_sync_binding_unavailable'); }
  const binding = JSON.parse(bindingBytes);
  const grantAddress = binding.grant.path;
  const grant = JSON.parse(io.read(grantAddress, MAX_JSON_BYTES));
  const admission = JSON.parse(io.read(binding.admission.path, MAX_JSON_BYTES));
  const storePath = `data_root/20_PROJECTS/${binding.approved_fs_key}`;

  // 1. What custody holds now, inside what the admission admits and the binding binds.
  const roots = {};
  for (const [ref, absolute] of Object.entries(binding.source_roots)) {
    if (!admission.source_refs.includes(ref)) continue;
    const address = aliasAddressFor(rootTable, absolute);
    if (address !== null) roots[ref] = address;
  }
  const sources = grantCandidates({ io, code: project, roots,
    dataClass: grant.allowed_data_classes.find(value => value !== 'public_synthetic') ?? grant.allowed_data_classes[0] });
  const next = { schema_version: SOURCE_GRANT_SCHEMA,
    grant_id: `grant.${project}.sync.${now.replace(/[-:.]/gu, '').slice(0, 15)}`,
    project_ref: grant.project_ref, purposes: [...grant.purposes], allowed_data_classes: [...grant.allowed_data_classes],
    valid_from: grant.valid_from, valid_to: grant.valid_to, sources };
  validateSourceGrant(next, { now });
  const difference = grantDifference(grant, next);
  const scope = { items: sources.reduce((total, source) => total + source.items.length, 0),
    by_root: Object.fromEntries(sources.map(source => [source.root_ref, source.items.length])) };

  const receipt = { schema_version: GRAPH_SYNC_SCHEMA, project_code: project, ran_at: now, dry,
    binding: { address: bindingAddress, sha256: sha256(bindingBytes) },
    grant: { in_force: grant.grant_id, proposed: next.grant_id, ...difference,
      added_count: difference.added.length, removed_count: difference.removed.length },
    scope, steps: {} };
  if (dry) return Object.freeze({ ...receipt, status: difference.changed ? 'WOULD_UPDATE' : 'UNCHANGED' });

  // 2. A changed grant is placed create-only and the binding is re-pointed at it.
  let inForceBytes = bindingBytes, inForceSha = sha256(bindingBytes);
  if (difference.changed) {
    const grantFile = io.path(`${storePath}/00_프로젝트_안내/grants/${next.grant_id}.json`, true);
    mkdirSync(path.dirname(grantFile), { recursive: true });
    const grantBytes = encode(next);
    writeFileSync(grantFile, grantBytes, { flag: 'wx' });
    mkdirSync(receiptsDir, { recursive: true });
    copyFileSync(io.path(bindingAddress), path.join(receiptsDir,
      `binding-before-${next.grant_id}.json`));
    const repointed = { ...binding, grant: { path: `${storePath}/00_프로젝트_안내/grants/${next.grant_id}.json`,
      sha256: sha256(grantBytes) } };
    inForceBytes = encode(repointed);
    writeFileSync(io.path(bindingAddress), inForceBytes);
    inForceSha = sha256(inForceBytes);
    receipt.steps.grant = { placed: next.grant_id, sha256: sha256(grantBytes), binding_sha256: inForceSha };
  } else {
    receipt.steps.grant = { placed: null, note: 'custody holds exactly what the grant in force names' };
  }

  // 3. The index: extraction only for what is added or changed.
  const pointerAddress = `${storePath}/00_프로젝트_안내/graph_index_current.json`;
  let expectedPrior = null;
  try { expectedPrior = sha256(io.read(pointerAddress, 65536)); } catch { expectedPrior = null; }
  let existing = [];
  try { existing = readdirSync(io.path(`${storePath}/20_문서검색/검색_색인/generations`, true)); }
  catch { existing = []; }
  const prefix = `${binding.approved_fs_key.toLowerCase().replace(/[^a-z0-9]/gu, '')}-graph`;
  const generationId = nextGenerationId(prefix, existing);
  const started = Date.now();
  const updated = await updateGraphIndex({ io, bindingAddress, bindingSha256: inForceSha, now,
    ...(runWorker ? { runWorker } : {}),
    request: { actor_ref: PREPARER, project_ref: binding.project_ref, purpose: 'context_preparation',
      generation_id: generationId, expected_prior: expectedPrior } });
  receipt.steps.index = { status: updated.status, code: updated.code ?? null, generation_id: updated.generation_id,
    counts: updated.counts ?? null, changes: updated.changes ?? null, llm: updated.llm ?? null,
    unavailable: (updated.unavailable ?? []).map(({ source_kind, root_ref, item_id, status, code }) =>
      ({ source_kind, root_ref, item_id, status, code })),
    elapsed_ms: Date.now() - started };
  if (updated.status === 'HOLD') {
    return Object.freeze({ ...receipt, status: 'HOLD', code: updated.code ?? null });
  }

  // 4. The database: load the selected generation and re-apply the rule edges.
  const view = openGraphIndex({ io, bindingAddress, bindingSha256: inForceSha,
    request: { actor_ref: READER, project_ref: binding.project_ref, purpose: 'context_query' } });
  const loaded = await materializeGraphIndex({ view, binding: view.graph_binding, ...(runWorker ? { runWorker } : {}) });
  receipt.steps.load = { status: loaded.status, loaded: loaded.loaded, code: loaded.code ?? null,
    generation_id: loaded.generation_id, loaded_at: loaded.loaded_at ?? null, counts: loaded.counts ?? null,
    superseded: loaded.superseded ?? [], removed_nodes: loaded.removed_nodes ?? 0,
    other_projects: (loaded.other_projects ?? []).length };
  receipt.steps.link = loaded.loaded
    ? await applyLink({ io, bindingAddress, bindingSha256: inForceSha, projectRef: binding.project_ref,
      graphBinding: view.graph_binding })
    : { status: 'skipped', note: 'the database already held this generation' };

  // 5. What the database actually holds for this project, read back from it.
  const seen = await inspectGraphDatabase({ binding: view.graph_binding, ...(runWorker ? { runWorker } : {}) });
  const mine = seen.projects.find(row => row.generation_id === view.manifest.generation_id) ?? null;
  receipt.database = { generation_id: mine?.generation_id ?? null, loaded_at: mine?.loaded_at ?? null,
    nodes: mine?.nodes ?? 0, chunks: mine?.chunks ?? 0, embedded_chunks: mine?.embedded_chunks ?? 0,
    rule_edges: mine?.rule_edges ?? {}, projects_in_database: seen.projects.length };
  receipt.totals = { in_scope: scope.items, documents_in_generation: view.manifest.counts.documents,
    chunks_in_database: mine?.chunks ?? 0,
    pending_or_failed: receipt.steps.index.unavailable.length,
    last_reflected_at: mine?.loaded_at ?? null };
  return Object.freeze({ ...receipt, status: updated.status === 'UNCHANGED' && !loaded.loaded ? 'UNCHANGED' : 'SYNCED' });
}

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    flags.set(token.slice(2), next === undefined || next.startsWith('--') ? true : (index++, next));
  }
  return flags;
}

async function main() {
  const flags = options(process.argv.slice(2));
  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  if (!tablePath) fail('graph_sync_root_table_required');
  const expected = flags.get('root-table-sha256');
  const rootTable = readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) });
  const io = createAliasedStoreIo(rootTable);
  const receiptsDir = String(flags.get('receipts') ?? process.env.SOULFORGE_GRAPH_SYNC_RECEIPTS ?? '');
  if (!receiptsDir) fail('graph_sync_receipts_required');
  const projects = String(flags.get('projects') ?? process.env.SOULFORGE_GRAPH_SYNC_PROJECTS ?? '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (projects.length === 0) fail('graph_sync_projects_required');
  const dry = flags.get('dry') === true;
  const bindingFile = String(flags.get('binding') ?? 'graph_index_binding.unified.json');

  let failures = 0;
  for (const project of projects) {
    const now = new Date().toISOString();
    const where = path.join(receiptsDir, project);
    let result;
    try {
      result = await syncProject({ io, rootTable, project, bindingFile, receiptsDir: where, dry, now });
    } catch (error) {
      // One project that cannot be synced does not stop the others: the reason is
      // written down and the run moves on, which is what a scheduled pass must do.
      failures++;
      result = { schema_version: GRAPH_SYNC_SCHEMA, project_code: project, ran_at: now, dry,
        status: 'FAILED', code: typeof error?.code === 'string' ? error.code : 'graph_sync_failed' };
    }
    if (!dry) {
      mkdirSync(where, { recursive: true });
      writeFileSync(path.join(where, `${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`), encode(result));
    }
    if (['HOLD', 'FAILED'].includes(result.status)) failures++;
    process.stdout.write(flags.get('json') === true ? `${JSON.stringify(result)}\n`
      : `${project} ${result.status}${result.code ? ` ${result.code}` : ''} `
        + `grant=${result.grant ? `${result.grant.added_count}+/${result.grant.removed_count}-` : '-'} `
        + `index=${result.steps?.index?.status ?? '-'} `
        + `load=${result.steps?.load?.loaded === true ? 'loaded' : (result.steps?.load?.code ?? '-')} `
        + `chunks=${result.database?.chunks ?? '-'} at=${result.database?.loaded_at ?? '-'}\n`);
  }
  return failures > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[estate-graph-sync] ${error?.code ?? 'graph_sync_failed'}\n`);
    process.exitCode = 2;
  });
}
