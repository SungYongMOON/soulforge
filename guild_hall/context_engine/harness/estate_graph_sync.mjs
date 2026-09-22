// Dev harness and lane entry point: bring one project's graph index up to what
// the collectors now hold, and put the result in the unified graph database.
//
// One pass, for each project named:
//   1. scope     re-read the admission and the ACL, then re-list the items custody
//                holds for this project by the inventory's own three rules,
//                bounded by what the admission still admits. A new item, an item
//                whose revision moved, an item custody no longer holds, and a
//                source the admission stopped naming all appear here as one thing:
//                a difference in the grant. "What may be read" and "what is read"
//                stay the same question.
//   2. offer     take out the items an earlier pass could not get in and has
//                stopped trying (the ledger), leave every other pending item in --
//                a pass retries what failed last time.
//   3. prepare   run the preparer over that grant without writing a generation.
//                Anything it cannot prepare is taken out of THIS pass, written
//                down with the code that stopped it, and the pass tries again, so
//                one unreadable record does not hold the other sixty.
//   4. index     updateGraphIndex: only added and changed documents reach the
//                extraction model, the rest are carried by reference, and the
//                pointer moves under its own lock. An extraction the model held
//                is traced back to the records behind the refused calls, which
//                are taken out the same way and retried next pass.
//   5. load      materialize the selected generation, replacing only this
//                project's own previous generation, and re-apply L1.
//   6. candidates related evidence (R1) is refreshed as candidates and never
//                applied: a pass marks a candidate stale when the unit it quoted
//                is no longer the document it was judged on, and leaves the
//                `approved` list exactly as it found it.
//   7. verify    read the database back. Only what it agrees with is completed;
//                everything else stays in the ledger for the next pass.
//
// The harness holds no address of its own: the root table is the one absolute
// path, the binding names the database and the sources, and where receipts go is
// an argument. It calls no model beyond the extraction and embedding the index
// generation already does, and it never deletes a store file.
//
// Who decides which mail is a project's: the workspace ledgers, when
// `--mail-attribution` names their published index, and the inventory's older
// narrow text rule otherwise. See `mail_routes.mjs` for why that is read as data.
//
// usage:
//   node estate_graph_sync.mjs --root-table <file> --projects P26-014,P23-043
//        --receipts <dir> [--binding graph_index_binding.unified.json] [--dry]
//        [--mail-attribution [<alias address>]] [--mail-attribution-sha256 sha256:...]
//        [--mail-attribution-max-age <hours>] [--mail-attribution-org-config <alias address>]
//        [--mail-attribution-owner-tables <alias address of the folder holding them>]
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
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { validateSourceGrant, SOURCE_GRANT_SCHEMA } from '../src/runtime/source_documents.mjs';
import { validateDocumentTools } from '../src/runtime/document_tools.mjs';
import { grantCandidates } from './estate_inventory.mjs';
import { MAIL_ATTRIBUTION_INDEX_ADDRESS, mailAttributionCounts, readMailAttributionIndex } from './mail_routes.mjs';

export const GRAPH_SYNC_SCHEMA = 'soulforge.context_graph_sync_receipt.v1';
export const GRAPH_SYNC_PENDING_SCHEMA = 'soulforge.context_graph_sync_pending.v1';
export const GRAPH_SYNC_CANDIDATE_SCHEMA = 'soulforge.context_graph_related_candidates.v1';
// A pass that never reached the project loop has no project to write a receipt
// for, and until now left nothing behind but one stderr line -- which a
// scheduled run throws away. Everything downstream of this harness (the night
// chain's own `success_rule`, any watcher) reads RECEIPTS, so a run that
// refused to start for a good reason -- a stale mail attribution index, an
// unreadable binding, a root table that no longer hashes to its pin -- looked
// exactly like a run that never happened. This is that missing receipt: a
// distinct schema, because it is not a project's receipt and must never be
// mistaken for one.
export const GRAPH_SYNC_PREFLIGHT_RECEIPT_SCHEMA = 'soulforge.context_graph_sync_preflight_receipt.v1';
// It goes in its own subdirectory of `--receipts`. `PROJECT_CODE` below forbids
// a leading underscore, so this name can never collide with a project's own
// directory; and being one segment deep means a two-segment receipt glob (the
// night chain example's `*/*.json` for this lane) FINDS it, so the failure
// reads as `status: "FAILED"` in a receipt rather than as "no receipt at all".
export const GRAPH_SYNC_PREFLIGHT_DIR = '_preflight';
// How many passes an item may fail before a pass stops offering it, and how many
// times one pass may narrow its own grant and try again. Both are small on
// purpose: a pass that keeps narrowing is one that should be read, not one that
// should keep going.
export const SYNC_LIMITS = Object.freeze({ item_attempts: 3, isolations_per_pass: 4 });
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const BINDING_FILE = /^graph_index_binding(?:\.[a-z0-9]{1,32})?\.json$/u;
const PREPARER = 'actor:hpp-primary-01:context-preparer';
const READER = 'actor:owner:context-reader';
const LINEAR_IDENTIFIER_FACT = 'linear.identifier';
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const at = (rootRef, itemId) => `${rootRef}|${itemId}`;

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

const readJsonFile = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };

/** The items an earlier pass could not get into the database, and how often it tried. */
export function readLedger(receiptsDir, project) {
  const held = readJsonFile(path.join(receiptsDir, 'pending.json'), null);
  return held?.schema_version === GRAPH_SYNC_PENDING_SCHEMA && held.project_code === project
    && held.items !== null && typeof held.items === 'object'
    ? { schema_version: GRAPH_SYNC_PENDING_SCHEMA, project_code: project, updated_at: held.updated_at ?? null,
      items: { ...held.items } }
    : { schema_version: GRAPH_SYNC_PENDING_SCHEMA, project_code: project, updated_at: null, items: {} };
}

/** Records one item as held back, with the code that held it and the count so far. */
export function holdBack(ledger, { root_ref: rootRef, item_id: itemId, code, by = null, now }) {
  const held = ledger.items[at(rootRef, itemId)]
    ?? { root_ref: rootRef, item_id: itemId, attempts: 0, first_seen: now };
  const attempts = held.attempts + 1;
  // A pass stops offering an item once it has failed this often. It stays in the
  // ledger: "we stopped trying, and this is why" is a state a reader can see.
  ledger.items[at(rootRef, itemId)] = { ...held, code: String(code ?? 'unknown'), by, attempts, last_seen: now,
    state: attempts >= SYNC_LIMITS.item_attempts ? 'failed' : 'pending' };
  return ledger.items[at(rootRef, itemId)];
}

/** Clears every item this pass actually got into a generation the database agreed with. */
export function clearCompleted(ledger, completed) {
  for (const row of completed) delete ledger.items[at(row.root_ref, row.item_id)];
  return ledger;
}

const ledgerRows = ledger => Object.values(ledger.items);
const stoppedSet = ledger => new Set(ledgerRows(ledger).filter(row => row.state === 'failed')
  .map(row => at(row.root_ref, row.item_id)));

/** The same sources with the named items left out, empty sources dropped. */
function without(sources, drop) {
  return sources.map(source => ({ ...source,
    items: source.items.filter(item => !drop.has(at(source.root_ref, item.item_id))) }))
    .filter(source => source.items.length > 0);
}

function writeLedger(receiptsDir, ledger, now) {
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(path.join(receiptsDir, 'pending.json'), encode({ ...ledger, updated_at: now }));
}

/**
 * Related-evidence candidates: kept, never applied by a pass, and marked stale
 * when the unit a quote came from is no longer the document it was judged on.
 * `approved` is where a reviewed relation would be named; a pass reads it and
 * writes it back untouched, so nothing here can approve itself.
 */
export function refreshCandidates({ held, project, manifest, now }) {
  const base = held?.schema_version === GRAPH_SYNC_CANDIDATE_SCHEMA ? held
    : { schema_version: GRAPH_SYNC_CANDIDATE_SCHEMA, project_code: project, approved: [], candidates: [] };
  const byItem = new Map(manifest.documents.map(row => [row.item_id, row]));
  const candidates = (Array.isArray(base.candidates) ? base.candidates : []).map(row => {
    const ends = ['a', 'b'].map(side => ({ side, held: byItem.get(row[side]?.item_id) ?? null, was: row[side] }));
    const broken = ends.filter(({ held: document, was }) => document === null || document.doc_key !== was?.doc_key);
    if (broken.length === 0) return { ...row, review_state: 'candidate', stale_reason: null };
    return { ...row, review_state: 'stale', marked_stale_at: row.marked_stale_at ?? now,
      stale_reason: broken.map(({ side, held: document }) =>
        `${side}:${document === null ? 'not_in_generation' : 'revision_changed'}`).join(',') };
  });
  const body = { ...base, schema_version: GRAPH_SYNC_CANDIDATE_SCHEMA, project_code: project,
    generation_id: manifest.generation_id, updated_at: now,
    approved: Array.isArray(base.approved) ? base.approved : [], candidates };
  return { body, counts: { candidates: candidates.filter(row => row.review_state === 'candidate').length,
    stale: candidates.filter(row => row.review_state === 'stale').length,
    approved: body.approved.length, applied_by_this_pass: 0 } };
}

/** The sync preflight uses the exact host-only parser binding the update path uses. */
export async function prepareSyncSources({ binding, grant, roots, now, admission }) {
  let documentTools;
  try { documentTools = validateDocumentTools(binding?.document_tools); }
  catch { fail('graph_sync_binding_invalid'); }
  return prepareSourceDocuments({ grant, roots, now, admission, documentTools });
}

async function applyLink({ io, bindingAddress, bindingSha256, projectRef, graphBinding, runWorker }) {
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
    rule: EXPLICIT_LINK_RULES[0], apply: true, ...(runWorker ? { runWorker } : {}) });
  return { status: applied.status, rule: EXPLICIT_LINK_RULES[0], identifiers: Object.keys(identifiers).length,
    counts: applied.counts ?? null };
}

/** Per-source-kind add/retire/unchanged, from one grant difference. Counts only. */
export function scopeChangeByKind(previous, next) {
  const kindOf = new Map([...(previous.sources ?? []), ...(next.sources ?? [])]
    .map(source => [source.root_ref, source.kind ?? 'unknown']));
  const before = itemsOf(previous), after = itemsOf(next);
  const rows = {};
  for (const root of new Set([...before.keys(), ...after.keys()])) {
    const kind = kindOf.get(root) ?? 'unknown';
    const row = rows[kind] ?? (rows[kind] = { add: 0, retire: 0, unchanged: 0 });
    const had = before.get(root) ?? new Set(), has = after.get(root) ?? new Set();
    for (const id of has) { if (had.has(id)) row.unchanged += 1; else row.add += 1; }
    for (const id of had) if (!has.has(id)) row.retire += 1;
  }
  return Object.fromEntries(Object.entries(rows).sort((a, b) => a[0].localeCompare(b[0])));
}

export async function syncProject({ io, rootTable, project, bindingFile = 'graph_index_binding.unified.json',
  receiptsDir, dry = false, now = new Date().toISOString(), runWorker = undefined,
  // Who decides which mail is this project's. Supplied (by `main()` from the
  // workspace ledgers' published index), the ledgers decide; omitted, the
  // inventory's own narrow text rule still does. There is deliberately no third
  // state: a pass that was told to use the ledgers and could not read them fails in
  // `main()` before it reaches any project, because falling back to the narrow rule
  // would silently retire every mail the ledgers place by a rule the mail body does
  // not repeat -- a correction nobody made, applied to every project at once.
  mailAttribution = null } = {}) {
  if (!PROJECT_CODE.test(project ?? '')) fail('graph_sync_project_invalid');
  if (!BINDING_FILE.test(bindingFile)) fail('graph_sync_binding_invalid');
  const bindingAddress = `control_root/project-bindings/${project}/${bindingFile}`;
  let bindingBytes;
  try { bindingBytes = io.read(bindingAddress, 1024 * 1024); } catch { fail('graph_sync_binding_unavailable'); }
  const binding = JSON.parse(bindingBytes);
  try { validateDocumentTools(binding.document_tools); } catch { fail('graph_sync_binding_invalid'); }
  const grant = JSON.parse(io.read(binding.grant.path, MAX_JSON_BYTES));
  // Read every pass: an admission or an ACL the Owner narrowed since last time is
  // a change in what may be read, and it has to reach this pass's grant.
  const admissionBytes = io.read(binding.admission.path, MAX_JSON_BYTES);
  const admission = JSON.parse(admissionBytes);
  const aclBytes = io.read(binding.acl_path, MAX_JSON_BYTES);
  const storePath = `data_root/20_PROJECTS/${binding.approved_fs_key}`;
  const ledger = readLedger(receiptsDir, project);

  // 1. What custody holds now, inside what the admission admits and the binding binds.
  const roots = {}, notAdmitted = [];
  for (const [ref, absolute] of Object.entries(binding.source_roots)) {
    if (!admission.source_refs.includes(ref)) { notAdmitted.push({ root_ref: ref, code: 'not_admitted' }); continue; }
    const address = aliasAddressFor(rootTable, absolute);
    if (address === null) notAdmitted.push({ root_ref: ref, code: 'outside_root_table' });
    else roots[ref] = address;
  }
  const dataClass = grant.allowed_data_classes.find(value => value !== 'public_synthetic') ?? grant.allowed_data_classes[0];
  // Every project code this estate holds, so the same pass over the mail can also
  // count what no rule attributes anywhere. Those stay pending: the next pass
  // applies the rules again rather than treating them as absent.
  let everyCode = null;
  try {
    everyCode = readdirSync(io.path('data_root/20_PROJECTS', true)).filter(name => PROJECT_CODE.test(name));
  } catch { everyCode = null; }
  const candidates = grantCandidates({ io, code: project, roots, dataClass, everyCode, mailAttribution });
  const stopped = stoppedSet(ledger);
  const scope = { items: candidates.reduce((total, source) => total + source.items.length, 0),
    by_root: Object.fromEntries(candidates.map(source => [source.root_ref, source.items.length])),
    held_back_from_this_pass: stopped.size, sources_not_admitted: notAdmitted,
    // Items the attribution rules place with no project at all. They are not this
    // project's to load, and they are not lost either: the next pass re-applies
    // the rules to the same custody.
    unattributed: candidates.unattributed ?? null,
    // What the workspace ledgers' attribution index said for this project, when one
    // was supplied: which index (built when, which bytes), how many mails it gives
    // this project, and how many of those nobody has confirmed yet. Null when the
    // narrow text rule decided instead, so a receipt always says which rule ran.
    mail_attribution: candidates.mail ?? null,
    // What the voice route ledger said, when a voice root is bound: how many
    // confirmations were read, which ledgers could not be read, and which
    // sessions this pass refused to place. Null when no voice root is bound.
    voice: candidates.voice ?? null };

  const receipt = { schema_version: GRAPH_SYNC_SCHEMA, project_code: project, ran_at: now, dry,
    binding: { address: bindingAddress, sha256: sha256(bindingBytes) },
    access: { admission_id: admission.admission_id, admission_sha256: sha256(admissionBytes),
      acl_sha256: sha256(aclBytes), source_refs_admitted: admission.source_refs.length,
      source_refs_bound: Object.keys(binding.source_roots).length },
    scope, steps: {}, isolated: [] };

  if (dry) {
    const proposed = { ...grant, sources: without(candidates, stopped) };
    const difference = grantDifference(grant, proposed);
    // A grant that already matches custody is not the same as a project already
    // in the database: a project with no generation yet has work to do either way.
    let selected = null;
    try { selected = JSON.parse(io.read(`${storePath}/00_프로젝트_안내/graph_index_current.json`, 65536)).generation_id; }
    catch { selected = null; }
    return Object.freeze({ ...receipt, selected_generation: selected,
      grant: { in_force: grant.grant_id, proposed: null, ...difference,
        added_count: difference.added.length, removed_count: difference.removed.length,
        // The same difference said per source kind, which is what a person reads
        // when they want to know what re-attributing the mail would actually do:
        // how many mails would join this project, how many would leave it, and how
        // many would stay exactly where they are. A retire here is not a deletion --
        // it is the item leaving the next generation, which is how this store has
        // always corrected itself.
        by_kind: scopeChangeByKind(grant, proposed) },
      status: difference.changed ? 'WOULD_UPDATE' : selected === null ? 'WOULD_CREATE' : 'UNCHANGED' });
  }

  mkdirSync(receiptsDir, { recursive: true });
  const pointerAddress = `${storePath}/00_프로젝트_안내/graph_index_current.json`;
  const prefix = `${binding.approved_fs_key.toLowerCase().replace(/[^a-z0-9]/gu, '')}-graph`;
  let inForceSha = sha256(bindingBytes);
  let attempt = 0, offered = without(candidates, stopped), updated = null, placed = null, difference = null;
  const started = Date.now();

  // 2-4. Offer what this pass can support, prepare it, index it, and -- when
  // either step is held by particular records -- take exactly those records out
  // of THIS pass and try again. Every removal is written down with the code that
  // caused it, and the item stays in the ledger so the next pass offers it again.
  while (attempt < SYNC_LIMITS.isolations_per_pass) {
    attempt += 1;
    const proposed = { schema_version: SOURCE_GRANT_SCHEMA,
      grant_id: `grant.${project}.sync.${now.replace(/[-:.]/gu, '').slice(0, 15)}${attempt > 1 ? `-${attempt}` : ''}`,
      project_ref: grant.project_ref, purposes: [...grant.purposes], allowed_data_classes: [...grant.allowed_data_classes],
      valid_from: grant.valid_from, valid_to: grant.valid_to, sources: offered };
    validateSourceGrant(proposed, { now });
    difference = grantDifference(grant, proposed);

    // The preparer first, with nothing written: a record it cannot read is taken
    // out before any model is asked about anything.
    const prepared = await prepareSyncSources({ binding, grant: proposed, roots: binding.source_roots, now, admission });
    const owners = new Map(prepared.documents.map(document =>
      [document.doc_key, { root_ref: document.root_ref, item_id: document.item_id }]));
    const unreadable = prepared.coverage.items.filter(row => row.status !== 'prepared')
      .map(row => ({ root_ref: row.root_ref, item_id: row.item_id, code: row.code ?? row.status, by: 'preparer' }));
    if (unreadable.length > 0) {
      for (const row of unreadable) {
        const state = holdBack(ledger, { ...row, now });
        receipt.isolated.push({ ...row, attempts: state.attempts, state: state.state });
      }
      offered = without(offered, new Set(unreadable.map(row => at(row.root_ref, row.item_id))));
      if (offered.length === 0) break;
      continue;
    }

    if (!difference.changed && attempt === 1 && placed === null) {
      // Custody holds exactly what the grant in force names: keep that grant.
      placed = null;
    } else {
      const grantAddress = `${storePath}/00_프로젝트_안내/grants/${proposed.grant_id}.json`;
      const grantFile = io.path(grantAddress, true);
      mkdirSync(path.dirname(grantFile), { recursive: true });
      const grantBytes = encode(proposed);
      writeFileSync(grantFile, grantBytes, { flag: 'wx' });
      if (placed === null) {
        copyFileSync(io.path(bindingAddress), path.join(receiptsDir, `binding-before-${proposed.grant_id}.json`));
      }
      const repointed = { ...binding, grant: { path: grantAddress, sha256: sha256(grantBytes) } };
      const bytes = encode(repointed);
      writeFileSync(io.path(bindingAddress), bytes);
      inForceSha = sha256(bytes);
      placed = proposed.grant_id;
    }
    receipt.steps.grant = { placed, attempt, binding_sha256: inForceSha,
      ...(placed === null ? { note: 'custody holds exactly what the grant in force names' } : {}) };

    let expectedPrior = null;
    try { expectedPrior = sha256(io.read(pointerAddress, 65536)); } catch { expectedPrior = null; }
    let existing = [];
    try { existing = readdirSync(io.path(`${storePath}/20_문서검색/검색_색인/generations`, true)); } catch { existing = []; }
    updated = await updateGraphIndex({ io, bindingAddress, bindingSha256: inForceSha, now,
      ...(runWorker ? { runWorker } : {}),
      request: { actor_ref: PREPARER, project_ref: binding.project_ref, purpose: 'context_preparation',
        generation_id: nextGenerationId(prefix, existing), expected_prior: expectedPrior } });
    if (updated.status !== 'HOLD') break;

    // Which records held it. The preparer names its own; an extraction the model
    // held names the calls, and each call's position gives the record it was about.
    const holding = [...(updated.unavailable ?? []).map(row =>
      ({ root_ref: row.root_ref, item_id: row.item_id, code: row.code ?? row.status, by: 'preparer' }))];
    for (const row of updated.degraded?.refused_units ?? []) {
      const owner = owners.get(row.doc_key);
      if (!owner) continue;
      holding.push({ ...owner, by: `${row.by}:${row.call}`,
        code: row.status === 'error' ? 'extraction_error'
          : row.done_reason === 'length' ? 'extraction_truncated' : 'extraction_refused' });
    }
    const unique = [...new Map(holding.map(row => [at(row.root_ref, row.item_id), row])).values()];
    if (unique.length === 0) break;   // held by something no record explains: reported as it is
    for (const row of unique) {
      const state = holdBack(ledger, { ...row, now });
      receipt.isolated.push({ ...row, attempts: state.attempts, state: state.state });
    }
    offered = without(offered, new Set(unique.map(row => at(row.root_ref, row.item_id))));
    if (offered.length === 0) break;
  }

  receipt.steps.index = { status: updated?.status ?? 'not_run', code: updated?.code ?? null,
    generation_id: updated?.generation_id ?? null, attempts: attempt,
    counts: updated?.counts ?? null, changes: updated?.changes ?? null,
    llm: updated?.llm ? { calls: updated.llm.calls, errors: updated.llm.errors,
      invalid_outputs: updated.llm.invalid_outputs, truncated: updated.llm.truncated } : null,
    unavailable: (updated?.unavailable ?? []).map(({ source_kind, root_ref, item_id, status, code }) =>
      ({ source_kind, root_ref, item_id, status, code })),
    elapsed_ms: Date.now() - started };
  receipt.grant = { in_force: grant.grant_id, proposed: placed,
    ...(difference ?? { added: [], removed: [], changed: false }),
    added_count: difference?.added.length ?? 0, removed_count: difference?.removed.length ?? 0,
    // The same per-kind add/retire/unchanged the dry pass reports, against the grant
    // this pass actually offered, so a real run and its preview read alike.
    by_kind: scopeChangeByKind(grant, { ...grant, sources: offered }) };

  const withLedger = body => {
    writeLedger(receiptsDir, ledger, now);
    return Object.freeze({ ...receipt, ...body,
      pending: ledgerRows(ledger).filter(row => row.state === 'pending'),
      failed: ledgerRows(ledger).filter(row => row.state === 'failed') });
  };
  if (updated === null || updated.status === 'HOLD') {
    return withLedger({ status: 'HOLD', code: updated?.code ?? 'graph_sync_no_progress' });
  }

  // 5. The database: load the selected generation and re-apply the rule edges. A
  // grant or an ACL that changed under this pass makes the view refuse; that is a
  // scope change, and the pass says so rather than treating it as a fault.
  let view;
  try {
    view = openGraphIndex({ io, bindingAddress, bindingSha256: inForceSha,
      request: { actor_ref: READER, project_ref: binding.project_ref, purpose: 'context_query' } });
  } catch (error) {
    return withLedger({ status: 'HOLD', code: 'scope_changed_under_pass',
      detail: typeof error?.code === 'string' ? error.code : 'unknown' });
  }
  const loaded = await materializeGraphIndex({ view, binding: view.graph_binding, ...(runWorker ? { runWorker } : {}) });
  receipt.steps.load = { status: loaded.status, loaded: loaded.loaded, code: loaded.code ?? null,
    generation_id: loaded.generation_id, loaded_at: loaded.loaded_at ?? null, counts: loaded.counts ?? null,
    superseded: loaded.superseded ?? [], removed_nodes: loaded.removed_nodes ?? 0,
    other_projects: (loaded.other_projects ?? []).length, other_project_nodes: loaded.other_project_nodes ?? null };
  receipt.steps.link = loaded.loaded
    ? await applyLink({ io, bindingAddress, bindingSha256: inForceSha, projectRef: binding.project_ref,
      graphBinding: view.graph_binding, runWorker })
    : { status: 'skipped', note: 'the database already held this generation' };

  // 6. Related evidence stays a candidate. A pass never applies one; it marks the
  // ones whose quoted unit is no longer the document they were judged on.
  const candidateFile = path.join(receiptsDir, 'related_candidates.json');
  const related = refreshCandidates({ held: readJsonFile(candidateFile, null), project, manifest: view.manifest, now });
  writeFileSync(candidateFile, encode(related.body));
  receipt.steps.related_evidence = { ...related.counts,
    note: 'a judged relation is applied by a person, never by a pass' };

  // 7. Completed means the database was read back and agreed. Anything else stays
  // in the ledger for the next pass.
  const seen = await inspectGraphDatabase({ binding: view.graph_binding, ...(runWorker ? { runWorker } : {}) });
  const mine = seen.projects.find(row => row.generation_id === view.manifest.generation_id) ?? null;
  const agreed = mine !== null && mine.chunks === view.manifest.counts.chunks && mine.nodes > 0;
  const completed = agreed ? view.manifest.documents.map(row => ({ root_ref: row.root_ref, item_id: row.item_id })) : [];
  if (agreed) clearCompleted(ledger, completed);

  receipt.database = { generation_id: mine?.generation_id ?? null, loaded_at: mine?.loaded_at ?? null,
    nodes: mine?.nodes ?? 0, chunks: mine?.chunks ?? 0, embedded_chunks: mine?.embedded_chunks ?? 0,
    rule_edges: mine?.rule_edges ?? {}, projects_in_database: seen.projects.length,
    agrees_with_generation: agreed };
  receipt.completed = { items: completed.length, verified_by: 'database read-back of chunk and node counts' };
  receipt.totals = { in_scope: scope.items, documents_in_generation: view.manifest.counts.documents,
    chunks_in_database: mine?.chunks ?? 0, completed: completed.length,
    pending: ledgerRows(ledger).filter(row => row.state === 'pending').length,
    failed: ledgerRows(ledger).filter(row => row.state === 'failed').length,
    removed_from_scope: receipt.grant.removed_count, added_to_scope: receipt.grant.added_count,
    last_reflected_at: mine?.loaded_at ?? null };
  return withLedger({ status: !agreed ? 'HOLD'
    : updated.status === 'UNCHANGED' && !loaded.loaded ? 'UNCHANGED' : 'SYNCED',
  ...(agreed ? {} : { code: 'database_does_not_agree_with_generation' }) });
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

/**
 * The one receipt a pass that never reached the project loop can still leave
 * behind, mirroring how `voice_conversation_list_nightly.mjs` records a failed
 * chain: `status: 'FAILED'` with the `stage` it died at and the `reason` code
 * that stopped it. `projects: []` because none were attempted -- a reader must
 * not have to infer "nothing ran" from an absence.
 *
 * It NEVER throws. A `--receipts` this process cannot write is reported on its
 * own stderr line and nothing else changes: losing the receipt must not also
 * lose the exit code the caller was going to get anyway. Returns whether it
 * was written, for the caller's own tests.
 */
export function writeGraphSyncPreflightReceipt({ receiptsDir, stage = 'preflight', reason,
  now = new Date().toISOString(), startedAt = null } = {}) {
  const receipt = { schema_version: GRAPH_SYNC_PREFLIGHT_RECEIPT_SCHEMA, ran_at: now,
    started_at: startedAt ?? now, ended_at: now, dry: false,
    status: 'FAILED', stage, reason, projects: [] };
  try {
    const where = path.join(receiptsDir, GRAPH_SYNC_PREFLIGHT_DIR);
    mkdirSync(where, { recursive: true });
    writeFileSync(path.join(where, `${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`), encode(receipt));
    return true;
  } catch (error) {
    // Deliberately not `fail()`: this is the last-resort recorder, and a
    // recorder that throws would replace a precise reason with its own.
    process.stderr.write('[estate-graph-sync] graph_sync_preflight_receipt_unwritable '
      + `${typeof error?.code === 'string' ? error.code : 'unknown'}\n`);
    return false;
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const flags = options(process.argv.slice(2));
  // Read FIRST, before anything that can throw. Every abort below this line has
  // somewhere to write its reason down; `--receipts` missing is the one that
  // does not, and stays exactly what it always was (stderr line, exit 2).
  const receiptsDir = String(flags.get('receipts') ?? process.env.SOULFORGE_GRAPH_SYNC_RECEIPTS ?? '');
  if (!receiptsDir) fail('graph_sync_receipts_required');
  const dry = flags.get('dry') === true;

  let rootTable; let io; let projects; let bindingFile; let mailAttribution = null;
  try {
    const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
    if (!tablePath) fail('graph_sync_root_table_required');
    const expected = flags.get('root-table-sha256');
    rootTable = readRootTable({ tablePath,
      expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) });
    io = createAliasedStoreIo(rootTable);
    projects = String(flags.get('projects') ?? process.env.SOULFORGE_GRAPH_SYNC_PROJECTS ?? '')
      .split(',').map(value => value.trim()).filter(Boolean);
    if (projects.length === 0) fail('graph_sync_projects_required');
    bindingFile = String(flags.get('binding') ?? 'graph_index_binding.unified.json');

    // Who decides a mail's project, read once for the whole pass. `--mail-attribution`
    // with no value takes the default address; a value names another. Read here and
    // not per project, both because the index is one file and because a failure has to
    // stop every project at once: one project syncing under the ledgers while the next
    // falls back to the narrow text rule would split the same mail two ways.
    const attributionFlag = flags.get('mail-attribution');
    if (attributionFlag !== undefined) {
      const address = attributionFlag === true ? MAIL_ATTRIBUTION_INDEX_ADDRESS : String(attributionFlag);
      const expected = flags.get('mail-attribution-sha256');
      const maxAge = flags.get('mail-attribution-max-age');
      const orgConfig = flags.get('mail-attribution-org-config');
      const ownerTables = flags.get('mail-attribution-owner-tables');
      mailAttribution = readMailAttributionIndex({ io, address,
        expectedSha256: typeof expected === 'string' ? expected : null,
        // An index older than this is refused outright: a file that still parses is not
        // a current set of decisions, and re-applying yesterday's silently is worse
        // than not running.
        ...(typeof maxAge === 'string' ? { maxAgeHours: Number(maxAge) } : {}),
        // Given, the index must have been built from the org config that is there now.
        orgConfigAddress: typeof orgConfig === 'string' ? orgConfig : null,
        // Given, every Owner table the index names must still hash to what it recorded.
        // The org config only says where the tables are; the tables hold the decisions.
        ownerTablesDir: typeof ownerTables === 'string' ? ownerTables : null });
      process.stdout.write(`mail-attribution built_at=${mailAttribution.built_at} `
        + `age_h=${mailAttribution.age_hours} `
        + `attributed=${mailAttribution.counts.attributed} confirmed=${mailAttribution.counts.confirmed} `
        + `unconfirmed=${mailAttribution.counts.unconfirmed}`
        + `${mailAttribution.owner_tables_missing.length ? ` owner_tables_missing=${mailAttribution.owner_tables_missing.join(',')}` : ''}\n`);
    }
  } catch (error) {
    const reason = typeof error?.code === 'string' ? error.code : 'graph_sync_failed';
    // `--dry` still writes nothing at all (the registrar's own preflight runs in
    // that mode against the REAL receipts directory; a dry refusal must not put
    // a FAILED receipt there for a run that was never scheduled).
    if (!dry) writeGraphSyncPreflightReceipt({ receiptsDir, stage: 'preflight', reason, startedAt });
    // The same one line the top-level handler below would have written, so the
    // console output of an abort is byte-identical to what it was before.
    process.stderr.write(`[estate-graph-sync] ${reason}\n`);
    return 2;
  }

  let failures = 0;
  for (const project of projects) {
    const now = new Date().toISOString();
    const where = path.join(receiptsDir, project);
    let result;
    try {
      result = await syncProject({ io, rootTable, project, bindingFile, receiptsDir: where, dry, now, mailAttribution });
    } catch (error) {
      // One project that cannot be synced does not stop the others: the reason is
      // written down and the pass moves on, which is what a scheduled run must do.
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
        + `grant=+${result.grant?.added_count ?? '-'}/-${result.grant?.removed_count ?? '-'} `
        + (result.grant?.by_kind?.mail
          ? `mail=+${result.grant.by_kind.mail.add}/-${result.grant.by_kind.mail.retire}`
            + `/=${result.grant.by_kind.mail.unchanged}`
            + `${result.scope?.mail_attribution ? ` (미확인 ${result.scope.mail_attribution.unconfirmed})` : ''} `
          : '')
        + `index=${result.steps?.index?.status ?? '-'} `
        + `isolated=${result.isolated?.length ?? 0} `
        + `load=${result.steps?.load?.loaded === true ? 'loaded' : (result.steps?.load?.code ?? '-')} `
        + `completed=${result.totals?.completed ?? '-'} pending=${result.totals?.pending ?? '-'} `
        + `failed=${result.totals?.failed ?? '-'} at=${result.database?.loaded_at ?? '-'}\n`);
  }
  return failures > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[estate-graph-sync] ${error?.code ?? 'graph_sync_failed'}\n`);
    process.exitCode = 2;
  });
}
