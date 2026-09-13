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
// The same three searches a question gets are asked here -- lexical, vector and
// hybrid -- and the starting record is put into words three ways (§ QUERY FORMS),
// because "the retriever did not find it" and "this way of asking did not find it"
// are also different results. Every form is built by code from the starting record
// alone; nothing about a document the search is meant to reach goes into it.
//
// Rows are ranked among the other sources only. A starting record with many units
// of its own fills a small top_k by itself, so the search asks for the whole
// generation (--whole-generation) and the ranking is taken over what is left after
// its own document and the unwanted kinds are dropped. The rank the search gave is
// kept beside the rank among other sources.
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
//                                [--modes lexical,vector,hybrid] [--query-form all|q1|q2|q3]
//                                [--whole-generation] [--search-only]
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
import { createGraphIndexRetriever, otherSourceRows } from '../src/runtime/graph_index_retrieval.mjs';
import { linkRelatedEvidence } from '../src/runtime/graph_database.mjs';
import { judgeRelatedEvidence, unitContext } from '../src/runtime/relation_judgement.mjs';

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const out = line => process.stdout.write(`${line}\n`);

// § QUERY FORMS -- three ways to put one record into words, all built by code from
// that record alone.
//   q1  the unit's text as it stands, clipped. What the first run asked.
//   q2  the record's title and the unit's first sentence.
//   q3  the tokens a fixed rule takes out of the title and the text: the dates it
//       names, written out in each of the forms a person writes them in; the
//       condition and equipment tokens (capitals, or capitals followed by digits);
//       and the words of the title.
// The record's own issue identifier is struck out before any token is taken, so no
// form leans on a number -- and nothing here reads any document but this one.
const QUERY_CHARACTERS = 500;
const IDENTIFIER = /\b[A-Z]{2,6}-\d{1,6}\b/gu;
// A capitals-and-digits token, or a run of capitals. Not one that follows a `%`:
// those are the bytes of a percent-encoded filename, not a piece of equipment.
const CODE = /(?<!%)\b[A-Z]{1,6}[0-9]{1,4}\b|(?<!%)\b[A-Z]{2,8}\b/gu;
const WORD = /[^\p{L}\p{N}]+/gu;

// Every date the text names, as (year|null, month, day), in the order found.
function datesIn(text) {
  const found = [];
  const push = (year, month, day) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return;
    found.push({ year, month, day });
  };
  for (const [, y, m, d] of text.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/gu)) push(Number(y), Number(m), Number(d));
  for (const [, y, m, d] of text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu)) push(Number(y), Number(m), Number(d));
  for (const [, m, d] of text.matchAll(/(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu)) push(null, Number(m), Number(d));
  for (const [, m, d] of text.matchAll(/(?<![\d/-])(\d{1,2})\/(\d{1,2})(?![\d/-])/gu)) push(null, Number(m), Number(d));
  return found;
}

function tokenQuery(title, text) {
  const plainTitle = title.replace(IDENTIFIER, ' ');
  const plainText = text.replace(IDENTIFIER, ' ');
  const tokens = [];
  const add = value => { if (value && !tokens.includes(value)) tokens.push(value); };
  const years = new Map();
  for (const { year, month, day } of datesIn(`${plainTitle}\n${plainText}`)) {
    const key = `${month}-${day}`;
    if (year !== null) years.set(key, year);
    if (years.has(key)) add(`${years.get(key)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    add(`${month}/${day}`);
    add(`${month}월 ${day}일`);
  }
  for (const token of `${plainTitle} ${plainText}`.match(CODE) ?? []) add(token);
  for (const token of plainTitle.split(WORD)) if (token.length >= 2 && !/^\d+$/u.test(token)) add(token);
  return tokens.join(' ').slice(0, QUERY_CHARACTERS);
}

function firstSentence(text) {
  const body = text.replace(/^[#*\s]+/u, '');
  const stop = body.search(/[.。!?\n]/u);
  return (stop < 0 ? body : body.slice(0, stop)).trim();
}

// The unit's own first sentence, skipping the headings a brief starts with.
function leadSentence(text) {
  for (const line of text.split('\n')) {
    const sentence = firstSentence(line);
    if (sentence.replace(WORD, '').length >= 10) return sentence;
  }
  return firstSentence(text);
}

function queryFormsFor(context, wanted) {
  const forms = [
    { form: 'q1', why: 'the unit text as it stands', text: context.text.slice(0, QUERY_CHARACTERS) },
    { form: 'q2', why: 'title and first sentence',
      text: `${context.title.replace(IDENTIFIER, ' ').trim()} ${leadSentence(context.text)}`.trim().slice(0, QUERY_CHARACTERS) },
    { form: 'q3', why: 'dates, codes and title words by rule', text: tokenQuery(context.title, context.text) }];
  return forms.filter(row => row.text && (wanted === 'all' || wanted === row.form));
}

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
// Which searches are asked, how the record is put into words, and whether the
// database ranks the whole generation instead of the first rows.
const modes = String(flags.get('modes') ?? 'lexical,vector,hybrid').split(',').map(mode => mode.trim()).filter(Boolean);
const queryForm = String(flags.get('query-form') ?? 'all');
const wholeGeneration = flags.get('whole-generation') === true;
// Stop after the candidate search. Where the search put a row is a result of its
// own, and reading it back should not spend a model call on judging it.
const searchOnly = flags.get('search-only') === true;
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
const given = typeof flags.get('query') === 'string' ? String(flags.get('query')).slice(0, QUERY_CHARACTERS) : null;
const forms = given === null ? queryFormsFor(startContext, queryForm)
  : [{ form: 'given', why: 'passed on the command line', text: given }];
if (forms.length === 0) throw new Error(`no query form for --query-form ${queryForm}`);
// The whole generation, so a row that is nowhere near the top is told apart from a
// row that is not in the generation at all. lexical ranks its own corpus and takes
// no top_k.
const searchTopK = wholeGeneration ? opened.manifest.counts.chunks : topK;
const retriever = createGraphIndexRetriever(view());
const candidates = new Map(), searches = [];
for (const { form, why, text: queryText } of forms) {
  out(`\n--- ${form} (${why}) ${queryText.length} characters ---`);
  out(`    ${queryText.replace(/\s+/gu, ' ').slice(0, 160)}`);
  for (const mode of modes) {
    if (typeof retriever[mode] !== 'function') throw new Error(`unknown search mode ${mode}`);
    const result = mode === 'lexical' ? retriever.lexical(queryText)
      : await retriever[mode](queryText, searchTopK, wholeGeneration ? { wholeGeneration: true } : undefined);
    const rows = otherSourceRows(result.hits, { excludeDocKey: start.doc_key, kinds: wantedKinds });
    const shown = rows.slice(0, maxCandidates);
    searches.push({ form, query_characters: queryText.length, query_sha256: sha256(Buffer.from(queryText, 'utf8')),
      mode, top_k: mode === 'lexical' ? null : searchTopK,
      whole_generation: mode !== 'lexical' && wholeGeneration,
      status: result.status, code: result.code ?? null, hits: result.hits.length,
      other_source_hits: rows.length, first_other_source_search_rank: rows[0]?.search_rank ?? null,
      ranking: shown.map(row => ({ rank: row.rank, search_rank: row.search_rank, source_kind: row.source_kind,
        item_id: row.item_id, unit_id: row.unit_id, score: row.score ?? null, title: row.title.slice(0, 60) })),
      receipt: result.receipt ?? null });
    out(`  [${form}/${mode}] ${result.status} ${result.code ?? ''} hits=${result.hits.length} `
      + `other-source=${rows.length} (first at search rank ${rows[0]?.search_rank ?? '-'})`);
    for (const row of shown) {
      out(`    #${String(row.rank).padStart(2)} (search #${String(row.search_rank).padStart(3)}) ${row.source_kind} `
        + `${row.item_id}/${row.unit_id} `
        + `score=${row.score === null || row.score === undefined ? '-' : Number(row.score).toFixed(3)}`
        + ` | ${row.text.replace(/\s+/gu, ' ').slice(0, 64)}`);
      const key = `${row.doc_key}${row.unit_id}`;
      const found = { form, mode, rank: row.rank, search_rank: row.search_rank, score: row.score ?? null };
      if (candidates.has(key)) candidates.get(key).discovery.found_in.push(found);
      else {
        candidates.set(key, { b: { doc_key: row.doc_key, unit_id: row.unit_id }, source_kind: row.source_kind,
          item_id: row.item_id, discovery: { by: 'search', found_in: [found] } });
      }
    }
  }
}
// Where each candidate came in highest, so the order below is the best any way of
// asking reached rather than the order the loops happened to run in.
for (const row of candidates.values()) {
  if (row.discovery.by !== 'search') continue;
  row.discovery.best = [...row.discovery.found_in].sort((a, b) => a.rank - b.rank)[0];
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
const bestRank = row => row.discovery.best?.rank ?? Number.MAX_SAFE_INTEGER;
const chosen = [...candidates.values()].filter(row => !exclude.includes(row.item_id))
  .sort((a, b) => Number(named(b)) - Number(named(a)) || bestRank(a) - bestRank(b)).slice(0, maxCandidates);
out(`\ncandidates ${chosen.length} (found by search ${chosen.filter(row => row.discovery.by === 'search').length}, `
  + `named by reviewer ${chosen.filter(row => row.discovery.by === 'reviewer').length}, `
  + `both ${chosen.filter(row => row.discovery.by === 'search' && row.discovery.also_named_by_reviewer).length}`
  + `${exclude.length ? `, excluded ${exclude.length}` : ''})`);
for (const row of chosen) {
  const best = row.discovery.best;
  out(`  ${row.discovery.by.padEnd(8)}${row.discovery.also_named_by_reviewer ? '+named' : '      '} `
    + `${row.source_kind} ${row.item_id}/${row.b.unit_id}`
    + `${best ? ` best ${best.form}/${best.mode} #${best.rank} (search #${best.search_rank})` : ''}`);
}

if (chosen.length === 0 || searchOnly) {
  out(chosen.length === 0
    ? '\nno candidate from another source: the search reached none and none was named. Nothing is judged.'
    : '\n--search-only: the candidates stand as they are and no model call is made.');
  mkdirSync(receiptsDir, { recursive: true });
  const emptyFile = path.join(receiptsDir, `graph-relate-${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`);
  writeFileSync(emptyFile, `${JSON.stringify({ schema: 'context engine related-evidence receipt (dev, local-recovery)',
    at: now, binding_address: bindingAddress, generation: opened.manifest.generation_id, top_k: searchTopK,
    whole_generation: wholeGeneration, modes, query_form: queryForm, wanted_kinds: wantedKinds,
    search_only: searchOnly, chunks_in_generation: opened.manifest.counts.chunks,
    query_forms: forms.map(row => ({ form: row.form, why: row.why, characters: row.text.length,
      query_sha256: sha256(Buffer.from(row.text, 'utf8')) })),
    start: { item_id: fromItem, unit_id: fromUnit }, searches,
    candidates: chosen.map(row => ({ item_id: row.item_id, source_kind: row.source_kind, unit_id: row.b.unit_id,
      doc_key: row.b.doc_key, discovery: row.discovery })), judgements: [] }, null, 2)}\n`);
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
  query_forms: forms.map(row => ({ form: row.form, why: row.why, characters: row.text.length,
    query_sha256: sha256(Buffer.from(row.text, 'utf8')) })),
  modes, query_form: queryForm, top_k: searchTopK, whole_generation: wholeGeneration,
  chunks_in_generation: opened.manifest.counts.chunks, wanted_kinds: wantedKinds,
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
