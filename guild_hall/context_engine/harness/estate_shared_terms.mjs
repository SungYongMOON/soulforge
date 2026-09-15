// Dev harness and CLI: generate the shared-term registry -- the list of terms
// several of this estate's projects use, so that a reader knows a term alone
// cannot decide which project a record belongs to.
//
// The registry is derived and rebuildable, never a source. It has two inputs and
// no third: the entities the graph database already holds for each project's
// served generation (a name two projects' generations both carry is shared by
// observation), and an Owner-placed seed of terms declared shared without waiting
// for the graph to show them (a name that has only reached one project's index so
// far can still be a word the whole estate uses). Every row says which of the two
// it came from and which projects back it, so nothing in it has to be believed on
// its own -- regenerate it and the same database answers the same way.
//
// Read-only from end to end: bindings are opened the way a reader opens them (so
// a project whose ACL does not admit the reader contributes nothing), the
// database is asked one MATCH/RETURN question per distinct database, no model is
// called, and the only thing written is the registry file itself. The previous
// registry is kept beside it as `.prev`, because the file is a derived artefact
// that is meant to be overwritten and one step back is enough.
//
// usage:
//   node estate_shared_terms.mjs --root-table <file> --tools-config <file>
//        [--seed <file>] [--min-projects 2] [--max-term-characters 24] [--json] [--out <file>]
//        [--binding graph_index_binding.unified.json] [--root-table-sha256 <sha>]
//
// `--out` overrides where the registry is written; without it the path comes from
// the tools configuration's `shared_terms_path`, which is also where the read CLI
// and the skill look for it. The registry holds terms, project codes and counts;
// it never holds chunk text, a document, a locator or a path.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { openGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { listEntityProjects } from '../src/runtime/graph_database.mjs';
import { SHARED_TERMS_SCHEMA, normaliseTerm } from '../src/runtime/shared_terms.mjs';

export const SHARED_TERMS_SEED_SCHEMA = 'soulforge.context_shared_terms_seed.v0';
export { SHARED_TERMS_SCHEMA };
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const BINDING_FILE = /^graph_index_binding(?:\.[a-z0-9]{1,32})?\.json$/u;
// An identifier is the opposite of a shared term: `P24-049` and `SON-1421` are
// the strongest thing a record can say about which project it belongs to, and
// registering one as a term would make the reader treat that evidence as noise.
// The shape is a hyphen-joined token carrying a digit, which is what every
// identifier in this estate looks like and what no word in it does.
const IDENTIFIER = /^(?=.*\d)[A-Za-z][0-9A-Za-z]*(?:-[0-9A-Za-z]+)+$/u;
// How long a graph-derived term may be. A name longer than this is a record's
// title -- a mail subject, a task name -- which several projects can share
// without it being a word the estate uses; those are counted, not registered.
// The seed is an Owner declaration and is not bounded this way.
export const DEFAULT_MAX_TERM_CHARACTERS = 24;
// The other half of the same rule, and the half that separates a term from a
// sentence: a title is a phrase ("모델 관련 내용 검토 및 회신"), a term is a word or
// a short compound ("수중 음향 센서"). Three words is where this estate’s own
// records put that line, and it is a constant rather than a flag because it is
// what the word "term" means here, not a tuning knob.
export const MAX_TERM_WORDS = 3;
const BINDINGS_AREA = 'control_root/project-bindings';
const READER = 'actor:owner:context-reader';
const MAX_SEED_BYTES = 1024 * 1024;
const MAX_SEED_TERMS = 500;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export class SharedTermsBuildError extends Error {
  constructor(code) { super(code); this.name = 'SharedTermsBuildError'; this.code = code; }
}
const fail = code => { throw new SharedTermsBuildError(code); };

/**
 * The Owner-placed seed: terms declared shared, each with the projects it was
 * actually seen in. The projects are the evidence, so a seed row without them is
 * refused rather than admitted as an assertion about nothing.
 */
export function readSeed(bytes) {
  let value;
  try { value = JSON.parse(bytes); } catch { fail('shared_terms_seed_unreadable'); }
  if (value?.schema !== SHARED_TERMS_SEED_SCHEMA) fail('shared_terms_seed_schema_unknown');
  if (!Array.isArray(value.terms) || value.terms.length > MAX_SEED_TERMS) fail('shared_terms_seed_invalid');
  const seen = new Set();
  return value.terms.map(row => {
    const term = typeof row?.term === 'string' ? row.term.trim() : '';
    if (!term || !Array.isArray(row.projects) || row.projects.length === 0
      || !row.projects.every(code => typeof code === 'string' && PROJECT_CODE.test(code))) fail('shared_terms_seed_invalid');
    const normalized = normaliseTerm(term);
    if (!normalized || seen.has(normalized)) fail('shared_terms_seed_invalid');
    seen.add(normalized);
    return { term, normalized, projects: [...new Set(row.projects)].sort() };
  });
}

/**
 * The registry, from what the database answered and what the seed declared.
 *
 * Pure, so the aggregation can be checked against a synthesised worker answer:
 * `terms` is what `listEntityProjects` returned, `codeForKey` is the project key
 * to project code map the bindings gave, and nothing else enters. A term row
 * whose project key no binding named is dropped and counted -- a database this
 * caller can only partly account for must not quietly widen the registry.
 */
export function buildSharedTerms({ terms = [], generations = [], codeForKey = new Map(), seed = [],
  minProjects = 2, maxTermCharacters = DEFAULT_MAX_TERM_CHARACTERS, now } = {}) {
  if (!Number.isSafeInteger(minProjects) || minProjects < 1 || minProjects > 64) fail('shared_terms_min_projects_invalid');
  if (!Number.isSafeInteger(maxTermCharacters) || maxTermCharacters < 2 || maxTermCharacters > 400) fail('shared_terms_max_characters_invalid');
  if (typeof now !== 'string' || !now) fail('shared_terms_generated_at_invalid');
  const known = codeForKey instanceof Map ? codeForKey : new Map(Object.entries(codeForKey ?? {}));
  const rows = new Map();
  let unknownRows = 0, names = 0, identifiers = 0, tooLong = 0, tooManyWords = 0;
  for (const entry of terms) {
    const normalized = typeof entry?.normalized === 'string' ? entry.normalized : normaliseTerm(entry?.term);
    if (!normalized) continue;
    const projects = new Set();
    let mentions = 0;
    for (const held of entry.projects ?? []) {
      const code = known.get(held?.project_key);
      if (code === undefined) { unknownRows += 1; continue; }
      projects.add(code);
      mentions += Number.isSafeInteger(held.mentions) && held.mentions > 0 ? held.mentions : 0;
    }
    if (projects.size === 0) continue;
    names += 1;
    // Two databases could both hold a name; the registry is one row per term.
    const surface = Array.isArray(entry.names) && typeof entry.names[0] === 'string' && entry.names[0]
      ? entry.names[0] : normalized;
    // Both shape rules are about what a term is, not about how often it appears.
    if (IDENTIFIER.test(surface)) { identifiers += 1; continue; }
    if ([...normalized].length > maxTermCharacters) { tooLong += 1; continue; }
    if (normalized.split(' ').length > MAX_TERM_WORDS) { tooManyWords += 1; continue; }
    const row = rows.get(normalized);
    if (row) {
      for (const code of projects) row.projects.add(code);
      row.mention_count += mentions;
    } else {
      rows.set(normalized, { term: surface, normalized, projects, mention_count: mentions, source: 'graph' });
    }
  }
  const graphTerms = rows.size;
  for (const entry of seed) {
    const normalized = entry.normalized ?? normaliseTerm(entry.term);
    if (!normalized) continue;
    const row = rows.get(normalized);
    if (row) {
      for (const code of entry.projects) row.projects.add(code);
      row.source = 'both';
    } else {
      rows.set(normalized, { term: entry.term, normalized, projects: new Set(entry.projects),
        mention_count: 0, source: 'seed' });
    }
  }
  // The min-projects bound is applied after the seed is merged, so a term the
  // graph has only reached in one project is still kept when the seed declares it
  // -- and kept as `both`, saying that the graph has it too.
  const kept = [...rows.values()]
    .filter(row => row.source !== 'graph' || row.projects.size >= minProjects)
    .map(row => ({ term: row.term, normalized: row.normalized, projects: [...row.projects].sort(),
      mention_count: row.mention_count, source: row.source }))
    .sort((a, b) => b.projects.length - a.projects.length || b.mention_count - a.mention_count
      || (a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0));
  const refs = generations
    .filter(row => known.has(row?.project_key) && typeof row?.generation_id === 'string')
    .map(row => ({ project: known.get(row.project_key), generation_id: row.generation_id }))
    .sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : 0));
  return { schema: SHARED_TERMS_SCHEMA, generated_at: now, generation_refs: refs, terms: kept,
    counts: { projects: refs.length, min_projects: minProjects, max_term_characters: maxTermCharacters,
      graph_names: names, identifier_dropped: identifiers, too_long_dropped: tooLong,
      too_many_words_dropped: tooManyWords, max_term_words: MAX_TERM_WORDS, graph_terms: graphTerms,
      seed_terms: seed.length, terms: kept.length,
      shared_terms: kept.filter(row => row.projects.length >= 2).length,
      graph_below_min: graphTerms - kept.filter(row => row.source !== 'seed').length,
      unknown_project_rows: unknownRows } };
}

/** The projects this caller may open, as the project key the database uses. */
export function readProjectKeys({ io, bindingFile = 'graph_index_binding.unified.json' } = {}) {
  if (!BINDING_FILE.test(bindingFile)) fail('shared_terms_binding_invalid');
  const codes = readdirSync(io.path(BINDINGS_AREA, true), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && PROJECT_CODE.test(entry.name))
    .map(entry => entry.name).sort();
  const opened = [], refused = [];
  for (const code of codes) {
    const address = `${BINDINGS_AREA}/${code}/${bindingFile}`;
    let bytes;
    try { bytes = io.read(address, 1024 * 1024); } catch { refused.push({ code, code_reason: 'binding_unavailable' }); continue; }
    const binding = JSON.parse(bytes);
    try {
      const view = openGraphIndex({ io, bindingAddress: address, bindingSha256: sha256(bytes),
        request: { actor_ref: READER, project_ref: binding.project_ref, purpose: 'context_query' } });
      opened.push({ code, project_key: view.manifest.project_key, graph: view.graph_binding,
        pointer_generation: view.manifest.generation_id });
    } catch (error) { refused.push({ code, code_reason: error?.code ?? 'graph_index_unavailable' }); }
  }
  return { opened, refused };
}

/**
 * One pass: open every binding, ask each distinct database once, and merge the
 * answer with the seed. The database is grouped by its endpoint, so eleven
 * projects on one database are one question and not eleven.
 */
export async function collectSharedTerms({ io, bindingFile = 'graph_index_binding.unified.json', minProjects = 2,
  maxTermCharacters = DEFAULT_MAX_TERM_CHARACTERS, seed = [], runWorker = undefined,
  now = new Date().toISOString() } = {}) {
  const { opened, refused } = readProjectKeys({ io, bindingFile });
  const databases = new Map();
  for (const entry of opened) {
    if (!entry.graph?.neo4j) continue;
    const key = JSON.stringify(entry.graph.neo4j);
    if (!databases.has(key)) databases.set(key, entry.graph);
  }
  if (databases.size === 0) fail('graph_database_not_connected');
  const terms = [], generations = [];
  for (const graph of databases.values()) {
    const seen = await listEntityProjects({ binding: graph, ...(runWorker ? { runWorker } : {}) });
    if (seen.status !== 'ok') fail(seen.code ?? 'graph_database_not_connected');
    terms.push(...seen.terms);
    generations.push(...seen.generations);
  }
  const codeForKey = new Map(opened.map(entry => [entry.project_key, entry.code]));
  const registry = buildSharedTerms({ terms, generations, codeForKey, seed, minProjects, maxTermCharacters, now });
  // Diagnostics for the operator, not part of the file: the registry schema is
  // the same whether or not a binding was refused this time.
  Object.defineProperty(registry, 'refused', { value: refused, enumerable: false });
  Object.defineProperty(registry, 'databases', { value: databases.size, enumerable: false });
  return registry;
}

/** Writes the registry, keeping one step back beside it. */
export function writeRegistry(target, registry) {
  const bytes = Buffer.from(`${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  mkdirSync(path.dirname(target), { recursive: true });
  const existed = existsSync(target);
  if (existed) copyFileSync(target, `${target}.prev`);
  writeFileSync(target, bytes);
  return { previous_kept: existed, sha256: sha256(bytes), bytes: bytes.length };
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

// The head is counts; the rows are the most-crossing terms. A registry is a list
// of words, so printing all of it is a way to read an estate's vocabulary out at
// a terminal -- the operator gets the top of it and the file holds the rest.
const RENDERED_ROWS = 20;

export function render(registry, wrote) {
  const lines = [`용어 ${registry.counts.terms} (2과제 이상 ${registry.counts.shared_terms})`
    + ` · 과제 ${registry.counts.projects} · 그래프 용어 ${registry.counts.graph_terms}`
    + ` · seed ${registry.counts.seed_terms} · 최소 과제 수 ${registry.counts.min_projects}`,
  `그래프 이름 ${registry.counts.graph_names} 중 식별자 ${registry.counts.identifier_dropped}개,`
    + ` ${registry.counts.max_term_characters}자를 넘는 이름 ${registry.counts.too_long_dropped}개,`
    + ` ${registry.counts.max_term_words}낱말을 넘는 제목 ${registry.counts.too_many_words_dropped}개는 용어로 보지 않았고,`
    + ` 과제 수가 모자란 ${registry.counts.graph_below_min}개는 등록하지 않았습니다.`];
  if (registry.counts.unknown_project_rows) {
    lines.push(`바인딩으로 열지 못한 과제의 행 ${registry.counts.unknown_project_rows}개는 세지 않았습니다.`);
  }
  for (const entry of registry.refused ?? []) lines.push(`열지 못한 바인딩 ${entry.code} ${entry.code_reason}`);
  if (wrote) lines.push(`wrote ${wrote.path} ${wrote.sha256.slice(0, 19)} `
    + `(${wrote.previous_kept ? '.prev kept' : 'first write'})`);
  for (const [index, row] of registry.terms.slice(0, RENDERED_ROWS).entries()) {
    lines.push(`  #${index + 1} ${row.term} · ${row.projects.length}과제 `
      + `${row.projects.join(',')} · 언급 ${row.mention_count} · ${row.source}`);
  }
  if (registry.terms.length > RENDERED_ROWS) lines.push(`  … 나머지 ${registry.terms.length - RENDERED_ROWS}개는 파일에 있습니다.`);
  return lines.join('\n');
}

async function main() {
  const flags = options(process.argv.slice(2));
  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  if (!tablePath) fail('shared_terms_root_table_required');
  const toolsPath = String(flags.get('tools-config') ?? process.env.SOULFORGE_CONTEXT_TOOLS_CONFIG ?? '');
  if (!toolsPath) fail('shared_terms_tools_config_required');
  const tools = readToolsConfig(readFileSync(toolsPath));
  const expected = flags.get('root-table-sha256');
  const io = createAliasedStoreIo(readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) }));
  const seedPath = flags.get('seed');
  let seed = [];
  if (typeof seedPath === 'string' && existsSync(seedPath)) {
    const bytes = readFileSync(seedPath);
    if (bytes.length > MAX_SEED_BYTES) fail('shared_terms_seed_too_large');
    seed = readSeed(bytes);
  }
  const registry = await collectSharedTerms({ io, minProjects: Number.parseInt(String(flags.get('min-projects') ?? '2'), 10),
    maxTermCharacters: Number.parseInt(String(flags.get('max-term-characters') ?? String(DEFAULT_MAX_TERM_CHARACTERS)), 10),
    seed, bindingFile: String(flags.get('binding') ?? 'graph_index_binding.unified.json') });
  const out = typeof flags.get('out') === 'string' ? String(flags.get('out')) : tools.shared_terms_path;
  if (!out) fail('shared_terms_out_required');
  const wrote = { path: out, ...writeRegistry(out, registry) };
  process.stdout.write(flags.get('json') === true
    ? `${JSON.stringify({ ...registry, wrote })}\n` : `${render(registry, wrote)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[estate-shared-terms] ${error?.code ?? 'shared_terms_failed'}\n`);
    process.exitCode = 2;
  });
}
