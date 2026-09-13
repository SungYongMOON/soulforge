// Dev harness for rule R1: find candidates for one starting unit in the other
// sources of a generation, ask the local model what connects each pair, check both
// quotes against both texts, and (only with --apply) add the checked relations to
// the graph projection as RELATED_EVIDENCE edges.
//
// The search is the ordinary one: the starting unit's own words, no identifier and
// no link. A candidate a search found and one a reviewer named by hand are kept
// apart in the receipt, because "the retriever found it" and "we pointed at it"
// are different results.
//
// Nothing is written without --apply, and what is written lives only in the derived
// projection: reloading the generation rebuilds the graph without it. The
// generation, its pointer, its files and the binding are never touched.
//
// Every host-local value -- the root table, the binding, the chat endpoint, where
// receipts go -- is an argument or an environment variable.
//
// usage:
//   node estate_graph_relate.mjs --root-table <file> --binding <file> --receipts <dir>
//                                --from <item_id> --unit <unit_id>
//                                [--binding-address <alias address>] [--project <code>]
//                                [--generation <id>] [--chat-host <url>] [--chat-model <name>]
//                                [--kinds slack,mail] [--top-k 8] [--candidates 8] [--calls 6]
//                                [--also <item_id>:<unit_id>] [--exclude <item_id>]
//                                [--query <text>] [--apply]
// env fallbacks: SOULFORGE_GRAPH_LINK_ROOT_TABLE, SOULFORGE_GRAPH_LINK_BINDING,
//   SOULFORGE_GRAPH_LINK_BINDING_ADDRESS, SOULFORGE_GRAPH_LINK_RECEIPTS,
//   SOULFORGE_GRAPH_LINK_PROJECT, SOULFORGE_GRAPH_LINK_ACTOR,
//   SOULFORGE_GRAPH_RELATE_CHAT_HOST, SOULFORGE_GRAPH_RELATE_CHAT_MODEL
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { openGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { createGraphIndexRetriever } from '../src/runtime/graph_index_retrieval.mjs';
import { linkRelatedEvidence } from '../src/runtime/graph_database.mjs';
import { judgeRelatedEvidence, unitContext } from '../src/runtime/relation_judgement.mjs';

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const out = line => process.stdout.write(`${line}\n`);

function options(argv) {
  const flags = new Map(), also = [], exclude = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2), next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) flags.set(name, true);
    else {
      if (name === 'also') also.push(next);
      if (name === 'exclude') exclude.push(next);
      flags.set(name, next); index++;
    }
  }
  return { flags, also, exclude };
}

function required(flags, name, variable) {
  const value = flags.get(name) ?? (variable ? process.env[variable] : undefined);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing --${name}${variable ? ` (or ${variable})` : ''}`);
  return value.trim();
}

const { flags, also, exclude } = options(process.argv.slice(2));
const apply = flags.get('apply') === true;
const project = String(flags.get('project') ?? process.env.SOULFORGE_GRAPH_LINK_PROJECT ?? '');
const actorRef = String(flags.get('actor') ?? process.env.SOULFORGE_GRAPH_LINK_ACTOR ?? 'actor:owner:context-reader');
const tablePath = required(flags, 'root-table', 'SOULFORGE_GRAPH_LINK_ROOT_TABLE');
const bindingPath = required(flags, 'binding', 'SOULFORGE_GRAPH_LINK_BINDING');
const receiptsDir = required(flags, 'receipts', 'SOULFORGE_GRAPH_LINK_RECEIPTS');
const chatHost = required(flags, 'chat-host', 'SOULFORGE_GRAPH_RELATE_CHAT_HOST');
const chatModel = required(flags, 'chat-model', 'SOULFORGE_GRAPH_RELATE_CHAT_MODEL');
const fromItem = required(flags, 'from');
const fromUnit = required(flags, 'unit');
const generationId = flags.get('generation') ?? process.env.SOULFORGE_GRAPH_LINK_GENERATION ?? null;
const wantedKinds = String(flags.get('kinds') ?? '').split(',').map(kind => kind.trim()).filter(Boolean);
// How deep the search goes, and how many of its other-source rows become
// candidates. They are different numbers: a starting record with many units of its
// own can fill a small top_k by itself, and a search that never reached another
// source is a result worth reporting rather than a number to quietly raise.
const topK = Number(flags.get('top-k') ?? 8);
const maxCandidates = Number(flags.get('candidates') ?? 8);
const maxCalls = Number(flags.get('calls') ?? 6);
const bindingAddress = flags.get('binding-address') ?? process.env.SOULFORGE_GRAPH_LINK_BINDING_ADDRESS
  ?? (project ? `control_root/project-bindings/${project}/graph_index_binding.json` : null);
if (typeof bindingAddress !== 'string' || !bindingAddress) throw new Error('missing --binding-address (or --project)');

const now = new Date().toISOString();
const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: sha256(readFileSync(tablePath)) }));
const bindingBytes = readFileSync(bindingPath);
const binding = JSON.parse(bindingBytes);
const request = { actor_ref: actorRef, project_ref: binding.project_ref, purpose: 'context_query' };
let generationRef = null;
if (typeof generationId === 'string' && generationId) {
  const address = `data_root/20_PROJECTS/${binding.approved_fs_key}/20_문서검색/검색_색인/generations/${generationId}/generation.json`;
  generationRef = { path: address, sha256: sha256(io.read(address, 64 * 1024 * 1024)) };
}
const view = () => openGraphIndex({ io, bindingAddress, bindingSha256: sha256(bindingBytes), request, generationRef });

const opened = view();
const docOf = itemId => opened.manifest.documents.find(row => row.item_id === itemId)?.doc_key
  ?? (() => { throw new Error(`no document with item_id ${itemId} in ${opened.manifest.generation_id}`); })();
const start = { doc_key: docOf(fromItem), unit_id: fromUnit };
const startContext = unitContext(opened, start.doc_key, start.unit_id);
out(`generation ${opened.manifest.generation_id} (${opened.selected ? 'selected' : 'named, not selected'}) `
  + `embedder ${opened.manifest.model.embedder} chunks ${opened.manifest.counts.chunks}`);
out(`start ${startContext.source_kind} ${fromItem}/${fromUnit} "${startContext.title.slice(0, 60)}"`);

// The candidate search: the starting unit's own words, never its identifier.
const query = String(flags.get('query') ?? startContext.text).slice(0, 500);
const retriever = createGraphIndexRetriever(view());
const candidates = new Map(), searches = [];
for (const mode of ['vector', 'hybrid']) {
  const result = await retriever[mode](query, topK);
  const otherSource = result.hits.filter(hit => hit.doc_key !== start.doc_key
    && (wantedKinds.length === 0 || wantedKinds.includes(hit.source_kind)));
  searches.push({ mode, top_k: topK, status: result.status, code: result.code ?? null, hits: result.hits.length,
    other_source_hits: otherSource.length, first_other_source_rank: otherSource[0]?.rank ?? null,
    receipt: result.receipt ?? null });
  out(`\n[${mode}] top_k=${topK} ${result.status} ${result.code ?? ''} hits=${result.hits.length} `
    + `other-source=${otherSource.length} first at rank ${otherSource[0]?.rank ?? '-'}`);
  for (const hit of result.hits) {
    const other = hit.doc_key !== start.doc_key && (wantedKinds.length === 0 || wantedKinds.includes(hit.source_kind));
    out(`  ${other ? '*' : ' '} #${String(hit.rank).padStart(2)} ${hit.source_kind} ${hit.item_id}/${hit.unit_id} `
      + `score=${hit.score === null ? '-' : Number(hit.score).toFixed(3)} | ${hit.text.replace(/\s+/gu, ' ').slice(0, 70)}`);
    if (!other) continue;
    const key = `${hit.doc_key}${hit.unit_id}`;
    if (!candidates.has(key)) {
      candidates.set(key, { b: { doc_key: hit.doc_key, unit_id: hit.unit_id }, source_kind: hit.source_kind,
        item_id: hit.item_id, discovery: { by: 'search', mode, rank: hit.rank, score: hit.score } });
    }
  }
}
// A candidate a reviewer names by hand is admitted too, and is never reported as
// something the search found.
for (const token of also) {
  const [itemId, unitId] = token.split(':');
  const docKey = docOf(itemId);
  const key = `${docKey}${unitId}`;
  const context = unitContext(opened, docKey, unitId);
  if (candidates.has(key)) candidates.get(key).discovery.also_named_by_reviewer = true;
  else candidates.set(key, { b: { doc_key: docKey, unit_id: unitId }, source_kind: context.source_kind,
    item_id: itemId, discovery: { by: 'reviewer' } });
}

// Judged in this order: what a reviewer asked about first, then what the search
// found, each keeping the label it came with. The order is who asked, never who
// found -- `discovery` is what the receipt reports, and a named candidate is never
// written down as one the search reached.
const named = row => row.discovery.by === 'reviewer' || row.discovery.also_named_by_reviewer === true;
const chosen = [...candidates.values()].filter(row => !exclude.includes(row.item_id))
  .sort((a, b) => Number(named(b)) - Number(named(a))).slice(0, maxCandidates);
out(`\ncandidates ${chosen.length} (found by search ${chosen.filter(row => row.discovery.by === 'search').length}, `
  + `named by reviewer ${chosen.filter(row => row.discovery.by === 'reviewer').length}, `
  + `both ${chosen.filter(row => row.discovery.by === 'search' && row.discovery.also_named_by_reviewer).length}`
  + `${exclude.length ? `, excluded ${exclude.length}` : ''})`);
for (const row of chosen) {
  out(`  ${row.discovery.by.padEnd(8)}${row.discovery.also_named_by_reviewer ? '+named' : '      '} `
    + `${row.source_kind} ${row.item_id}/${row.b.unit_id}`);
}

if (chosen.length === 0) {
  out('\nno candidate from another source: the search reached none and none was named. Nothing is judged.');
  mkdirSync(receiptsDir, { recursive: true });
  const emptyFile = path.join(receiptsDir, `graph-relate-${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`);
  writeFileSync(emptyFile, `${JSON.stringify({ schema: 'context engine related-evidence receipt (dev, local-recovery)',
    at: now, binding_address: bindingAddress, generation: opened.manifest.generation_id, top_k: topK,
    start: { item_id: fromItem, unit_id: fromUnit }, searches, candidates: [], judgements: [] }, null, 2)}\n`);
  out(`receipt ${path.basename(emptyFile)}`);
  process.exit(0);
}

const judged = await judgeRelatedEvidence({ view: view(),
  binding: { llm: { host: chatHost, model: chatModel, transport: 'openai_chat', keep_alive: '10m' } },
  pairs: chosen.slice(0, maxCalls).map(row => ({ a: start, b: row.b, discovery: row.discovery })),
  maxCalls });

out(`\njudgements ${judged.judgements.length} (model calls ${judged.trace.filter(row => row.status !== 'budget_exhausted').length})`);
for (const row of judged.judgements) {
  out(`  ${row.status === 'ok' ? (row.relation_kind ?? '-') : row.status} ${row.linkable ? '[link]' : '[hold]'} `
    + `${row.pair.b.doc_key.slice(7, 15)}/${row.pair.b.unit_id} ${row.reasons.length ? `(${row.reasons.join(', ')})` : ''}`);
  if (row.status !== 'ok') continue;
  out(`      A: ${row.subject_a ?? '-'}`);
  out(`      B: ${row.subject_b ?? '-'}`);
  for (const [name, side] of [['a', row.checks.evidence_a], ['b', row.checks.evidence_b]]) {
    out(`      evidence_${name} ${side.unit_id ?? '-'} [${side.quote_match}] ${String(side.quote ?? '').replace(/\s+/gu, ' ').slice(0, 90)}`);
  }
  for (const item of row.counter_conditions) out(`      counter: ${item}`);
  for (const item of row.unresolved) out(`      unresolved: ${item}`);
}

const receipt = { schema: 'context engine related-evidence receipt (dev, local-recovery)', at: now,
  rule: judged.rule, binding_address: bindingAddress, generation: opened.manifest.generation_id,
  generation_sha256: opened.generation_ref.sha256, generation_selected: opened.selected,
  embedder: opened.manifest.model.embedder, start: { item_id: fromItem, unit_id: fromUnit, doc_key: start.doc_key },
  query_sha256: sha256(Buffer.from(query, 'utf8')), top_k: topK, wanted_kinds: wantedKinds,
  excluded_items: exclude, searches,
  candidates: chosen.map(row => ({ item_id: row.item_id, source_kind: row.source_kind, unit_id: row.b.unit_id,
    doc_key: row.b.doc_key, discovery: row.discovery })),
  profile: { id: judged.profile_id, version: judged.profile_version, prompt_sha256: judged.prompt_sha256 },
  model: judged.model, trace: judged.trace,
  judgements: judged.judgements.map(row => ({ b: row.pair.b, discovery: row.pair.discovery, status: row.status,
    code: row.code, relation_kind: row.relation_kind, direction: row.direction, linkable: row.linkable,
    reasons: row.reasons, subject_a: row.subject_a ?? null, subject_b: row.subject_b ?? null,
    checks: row.checks, counter_conditions: row.counter_conditions ?? [], unresolved: row.unresolved ?? [],
    relation: row.relation ?? null })),
  steps: {} };

if (judged.relations.length === 0) out('\nno relation passed the checks: nothing to link');
else {
  const dry = await linkRelatedEvidence({ view: view(), binding: opened.graph_binding, relations: judged.relations, apply: false });
  receipt.steps.dry = dry;
  out(`\n[dry] ${dry.status} requested=${dry.counts?.requested ?? 0} existing=${dry.counts?.existing ?? 0}`);
  if (apply) {
    const applied = await linkRelatedEvidence({ view: view(), binding: opened.graph_binding, relations: judged.relations, apply: true });
    receipt.steps.apply = applied;
    out(`[apply] ${applied.status} relationship=${applied.relationship} created=${applied.counts?.created ?? 0} `
      + `existing=${applied.counts?.existing ?? 0}`);
    for (const edge of applied.edges) {
      out(`  ${edge.relation_kind} ${edge.direction} ${edge.a_doc_key.slice(7, 15)}/${edge.a_unit_id} -> ${edge.b_doc_key.slice(7, 15)}/${edge.b_unit_id}`);
    }
  }
}

mkdirSync(receiptsDir, { recursive: true });
const file = path.join(receiptsDir, `graph-relate-${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`);
writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
out(`\nreceipt ${path.basename(file)}`);
