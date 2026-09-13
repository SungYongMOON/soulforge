// Dev harness and CLI: ask one project's selected graph index a question and get
// back the records that answer it, each with the locator that leads to the
// original. Read-only from end to end -- it writes nothing, calls no LLM (the
// embedder turns the question into a vector, nothing else), and takes no Cypher,
// no index name, no database address and no generation from its caller.
//
// What a caller may choose is the project code, the question, the mode and how
// many rows it wants. The project code is resolved through one fixed address
// form -- `control_root/project-bindings/<code>/<binding file>` -- after being
// checked against the shape of a project code, so a caller can name a project it
// is allowed to name and nothing else: no path, no alias, no traversal. The
// binding then fixes the generation, the database, the embedder and the access
// the search runs under, and the view's own manifest decides what may come back.
//
// A row is evidence only if this view's hash-verified manifest holds that exact
// (document, unit) pair; a row the database offers that the manifest does not
// hold is dropped and counted. Text is quoted at one line per row so a reader can
// tell what a hit is without the harness becoming a way to read a store out.
//
// usage:
//   node estate_graph_query.mjs --root-table <file> --project <code> --question "..."
//        [--mode lexical|exact|vector|hybrid|graph|all] [--top-k 8] [--item <id>]
//        [--binding graph_index_binding.unified.json] [--generation <id>] [--json] [--quote 160]
//
// `--generation` opens a named generation instead of the one the project's pointer
// selects. It is how a project whose pointer still selects an older generation (one
// another database is serving) is read out of this one; without it the pointer
// decides, and a generation this database does not hold answers `not_loaded`
// rather than something else.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { openGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { createGraphIndexRetriever } from '../src/runtime/graph_index_retrieval.mjs';

export const ESTATE_QUERY_SCHEMA = 'soulforge.context_estate_query_receipt.v1';
export const QUERY_MODES = Object.freeze(['lexical', 'exact', 'vector', 'hybrid', 'graph']);
// A project code, and nothing that could be a path: letters, digits and hyphens
// in the shape the project store uses. This is the whole of what a caller may
// name, and it is checked before it is put into an address.
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const BINDING_FILE = /^graph_index_binding(?:\.[a-z0-9]{1,32})?\.json$/u;
const GENERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const MAX_QUESTION = 4000;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export class EstateQueryError extends Error {
  constructor(code) { super(code); this.name = 'EstateQueryError'; this.code = code; }
}
const fail = code => { throw new EstateQueryError(code); };

/** The one address form a project code resolves to. Nothing else is accepted. */
export function bindingAddressFor(code, bindingFile = 'graph_index_binding.unified.json') {
  if (typeof code !== 'string' || !PROJECT_CODE.test(code)) fail('estate_query_project_invalid');
  if (typeof bindingFile !== 'string' || !BINDING_FILE.test(bindingFile)) fail('estate_query_binding_invalid');
  return `control_root/project-bindings/${code}/${bindingFile}`;
}

const line = (text, quote) => {
  const first = String(text ?? '').split('\n').map(row => row.trim()).find(row => row.length > 0) ?? '';
  return [...first].length > quote ? `${[...first].slice(0, quote).join('')}…` : first;
};

export async function askEstateGraph({ io, project, question, modes = ['hybrid'], topK = 8, itemId = null,
  bindingFile = 'graph_index_binding.unified.json', generationId = null,
  actorRef = 'actor:owner:context-reader',
  quote = 160, runWorker = undefined, now = new Date().toISOString() } = {}) {
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION) fail('estate_query_question_invalid');
  if (!Array.isArray(modes) || modes.length === 0 || !modes.every(mode => QUERY_MODES.includes(mode))) fail('estate_query_mode_invalid');
  if (!Number.isSafeInteger(topK) || topK < 1 || topK > 50) fail('estate_query_top_k_invalid');
  const bindingAddress = bindingAddressFor(project, bindingFile);
  let bindingBytes;
  try { bindingBytes = io.read(bindingAddress, 1024 * 1024); } catch { fail('estate_query_binding_unavailable'); }
  const binding = JSON.parse(bindingBytes);
  // A named generation is still read by hash: the digest comes from the bytes at
  // the address the store's own layout gives it, and the view re-checks it.
  let generationRef;
  if (generationId !== null) {
    if (!GENERATION_ID.test(generationId)) fail('estate_query_generation_invalid');
    const address = `data_root/20_PROJECTS/${binding.approved_fs_key}/20_문서검색/검색_색인/generations/`
      + `${generationId}/generation.json`;
    try { generationRef = { path: address, sha256: sha256(io.read(address, 64 * 1024 * 1024)) }; }
    catch { fail('estate_query_generation_unavailable'); }
  }
  const view = () => openGraphIndex({ io, bindingAddress, bindingSha256: sha256(bindingBytes),
    request: { actor_ref: actorRef, project_ref: binding.project_ref, purpose: 'context_query' },
    ...(generationRef ? { generationRef } : {}) });
  const opened = view();
  const retriever = createGraphIndexRetriever(opened, { ...(runWorker ? { runWorker } : {}) });

  const results = [];
  for (const mode of modes) {
    const answered = mode === 'exact' ? retriever.exact(itemId ?? question)
      : mode === 'lexical' ? retriever.lexical(question)
        : await retriever[mode](question, topK);
    results.push({ mode, status: answered.status, code: answered.code ?? null,
      receipt: answered.receipt ?? null,
      evidence: (answered.hits ?? []).slice(0, topK).map(hit => ({ rank: hit.rank, source_kind: hit.source_kind,
        item_id: hit.item_id, unit_id: hit.unit_id, title: line(hit.title, quote), locator: hit.locator,
        occurred_at: hit.occurred_at ?? null, revision_sha256: hit.revision_sha256 ?? null,
        score: hit.score ?? null, via: hit.via ?? null, text: line(hit.text, quote) })) });
  }
  return Object.freeze({ schema_version: ESTATE_QUERY_SCHEMA, asked_at: now, project_code: project,
    question_sha256: sha256(Buffer.from(question, 'utf8')), question_characters: [...question].length,
    binding: { address: bindingAddress, sha256: sha256(bindingBytes) },
    generation: { generation_id: opened.manifest.generation_id, selected: opened.selected,
      documents: opened.manifest.counts.documents, chunks: opened.manifest.counts.chunks,
      embedder: opened.manifest.model.embedder },
    results });
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

function render(answer) {
  const lines = [`project ${answer.project_code} generation ${answer.generation.generation_id} `
    + `(${answer.generation.selected ? 'selected' : 'named, not selected'}) documents ${answer.generation.documents} `
    + `chunks ${answer.generation.chunks} embedder ${answer.generation.embedder}`];
  for (const result of answer.results) {
    lines.push(`\n[${result.mode}] ${result.status}${result.code ? ` ${result.code}` : ''}`
      + (result.receipt?.retrieval ? ` filter=${result.receipt.retrieval.filter_stage}`
        + (result.receipt.retrieval.fulltext_starved ? ' fulltext_starved' : '') : ''));
    for (const row of result.evidence) {
      lines.push(`  #${row.rank} ${row.source_kind} ${row.item_id} ${row.unit_id}`
        + `${row.occurred_at ? ` ${row.occurred_at}` : ''}${row.via ? ` via=${row.via}` : ''}`
        + `${Number.isFinite(row.score) ? ` score=${row.score.toFixed(3)}` : ''}`);
      lines.push(`      ${row.text}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const flags = options(process.argv.slice(2));
  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  if (!tablePath) fail('estate_query_root_table_required');
  const expected = flags.get('root-table-sha256');
  const io = createAliasedStoreIo(readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) }));
  const mode = String(flags.get('mode') ?? 'hybrid');
  const answer = await askEstateGraph({ io, project: String(flags.get('project') ?? ''),
    question: String(flags.get('question') ?? ''),
    modes: mode === 'all' ? [...QUERY_MODES] : mode.split(',').map(value => value.trim()),
    topK: Number.parseInt(String(flags.get('top-k') ?? '8'), 10),
    itemId: flags.get('item') === undefined ? null : String(flags.get('item')),
    quote: Number.parseInt(String(flags.get('quote') ?? '160'), 10),
    generationId: flags.get('generation') === undefined ? null : String(flags.get('generation')),
    bindingFile: String(flags.get('binding') ?? 'graph_index_binding.unified.json') });
  process.stdout.write(flags.get('json') === true ? `${JSON.stringify(answer)}\n` : `${render(answer)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[estate-graph-query] ${error?.code ?? 'estate_query_failed'}\n`);
    process.exitCode = 2;
  });
}
