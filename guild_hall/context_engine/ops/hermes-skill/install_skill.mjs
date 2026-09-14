// Installs `SKILL.md` (this folder) into one or more Hermes skill directories.
//
// The repository copy is the template: it names `<lane>` and `<root table>` as
// placeholders and leaves the project table empty, because both are host-local
// facts that must not live in the public tree. This installer fills them in at
// install time and writes a receipt saying what it filled them with.
//
// Three substitutions, and nothing else:
//   1. `<lane>`       -> the lane root the skill's command should run out of.
//   2. `<root table>` -> the physical root table the CLI resolves aliases with.
//   3. the project table -> the projects the graph database actually serves,
//      read from the database rather than typed, with the extra `--generation`
//      argument added for a project whose store pointer selects a generation
//      this database is not serving.
//
// Both paths are written with forward slashes and inside single quotes, because
// the Hermes `terminal` tool runs its command through Git Bash on Windows: a
// backslash there is an escape character, so a Windows-style path reaches node
// with its separators eaten and fails as `Cannot find module`.
//
// usage:
//   node install_skill.mjs --source <SKILL.md> --lane <lane root> --root-table <file>
//        --target <installed SKILL.md> [--target <another>] [--receipt <file>]
//        [--binding graph_index_binding.unified.json] [--dry-run]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../../src/adapters/aliased_store_io.mjs';
import { openGraphIndex } from '../../src/runtime/graph_index_generation.mjs';
import { inspectGraphDatabase } from '../../src/runtime/graph_database.mjs';

export const SKILL_INSTALL_SCHEMA = 'soulforge.context_skill_install_receipt.v1';
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const BINDINGS_AREA = 'control_root/project-bindings';
const TABLE_PLACEHOLDER = '| (설치된 사본에서 실제로 적재된 과제 목록으로 채운다) | |';
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export class SkillInstallError extends Error {
  constructor(code) { super(code); this.name = 'SkillInstallError'; this.code = code; }
}
const fail = code => { throw new SkillInstallError(code); };

/** Git Bash reads the command line: a Windows path survives only quoted, with forward slashes. */
export const shellPath = value => String(value).replaceAll('\\', '/').replace(/\/+$/u, '');

/**
 * The projects the database serves, joined to what each project's store pointer
 * selects. `chunks` is the database's own count, so the table says what a search
 * would actually find rather than what the store holds.
 */
export async function readProjectTable({ io, bindingFile = 'graph_index_binding.unified.json',
  runWorker = undefined } = {}) {
  const codes = readdirSync(io.path(BINDINGS_AREA, true), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && PROJECT_CODE.test(entry.name))
    .map(entry => entry.name).sort();
  const opened = [];
  for (const code of codes) {
    const bindingAddress = `${BINDINGS_AREA}/${code}/${bindingFile}`;
    let bindingBytes;
    try { bindingBytes = io.read(bindingAddress, 1024 * 1024); } catch { continue; }
    const binding = JSON.parse(bindingBytes);
    try {
      const view = openGraphIndex({ io, bindingAddress, bindingSha256: sha256(bindingBytes),
        request: { actor_ref: 'actor:owner:context-reader', project_ref: binding.project_ref,
          purpose: 'context_query' } });
      opened.push({ code, project_key: view.manifest.project_key, graph: view.graph_binding,
        pointer_generation: view.manifest.generation_id });
    } catch (error) {
      opened.push({ code, project_key: null, graph: binding.graph ?? null,
        pointer_generation: null, pointer_code: error?.code ?? 'graph_index_unavailable' });
    }
  }
  // One inspect call per distinct database, not one per project.
  const served = new Map();
  const groups = new Map();
  for (const entry of opened) {
    if (entry.graph === null) continue;
    const key = JSON.stringify(entry.graph.neo4j ?? null);
    if (!groups.has(key)) groups.set(key, entry.graph);
  }
  for (const graph of groups.values()) {
    const seen = await inspectGraphDatabase({ binding: graph, ...(runWorker ? { runWorker } : {}) });
    if (seen.status !== 'ok') fail(seen.code ?? 'graph_database_not_connected');
    for (const row of seen.projects) served.set(row.project_key, row);
  }
  return opened.map(entry => {
    const row = entry.project_key === null ? undefined : served.get(entry.project_key);
    return { code: entry.code, generation: row?.generation_id ?? null, chunks: row?.chunks ?? null,
      pointer_generation: entry.pointer_generation,
      served: row !== undefined && (row.generation_id === entry.pointer_generation
        ? 'pointer' : 'named') };
  }).filter(entry => entry.generation !== null);
}

/** The rows the skill's project table is made of, in the shape that table uses. */
export function renderProjectRows(projects) {
  return projects.map(project => {
    const extra = project.served === 'pointer' ? '—' : `\`--generation ${project.generation}\``;
    const note = project.served === 'pointer' ? `청크 ${project.chunks}`
      : `청크 ${project.chunks} · 포인터는 ${project.pointer_generation ?? '없음'}를 가리킨다`;
    return `| \`${project.code}\` | ${extra} | ${note} |`;
  }).join('\n');
}

// Only the command line is rewritten. The prose above it explains that the
// installed copy carries real paths, and it says so by naming the placeholders --
// substituting there would turn that sentence into nonsense.
const LANE_NEEDLE = "'<lane>/";
const TABLE_NEEDLE = "--root-table '<root table>'";
const once = (text, needle) => { if (text.split(needle).length !== 2) fail('skill_template_placeholder_missing'); };

export function renderInstalledSkill({ source, lane, rootTable, projects, sourceRef, at }) {
  once(source, LANE_NEEDLE);
  once(source, TABLE_NEEDLE);
  once(source, TABLE_PLACEHOLDER);
  const body = source
    .replace(LANE_NEEDLE, `'${shellPath(lane)}/`)
    .replace(TABLE_NEEDLE, `--root-table '${shellPath(rootTable)}'`)
    .replace(TABLE_PLACEHOLDER, renderProjectRows(projects));
  if (body.includes(LANE_NEEDLE) || body.includes(TABLE_NEEDLE)) fail('skill_template_placeholder_left');
  return `${body.replace(/\n+$/u, '\n')}\n<!-- installed ${at} from ${sourceRef}; `
    + 'projects read from the database -->\n';
}

function options(argv) {
  const flags = new Map();
  const targets = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index++, next);
    if (token === '--target') targets.push(String(value));
    else flags.set(token.slice(2), value);
  }
  return { flags, targets };
}

async function main() {
  const { flags, targets } = options(process.argv.slice(2));
  const sourcePath = String(flags.get('source') ?? '');
  const lane = String(flags.get('lane') ?? '');
  const tablePath = String(flags.get('root-table') ?? '');
  if (!sourcePath || !lane || !tablePath || targets.length === 0) fail('skill_install_arguments_required');
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: sha256(readFileSync(tablePath)) }));
  const projects = await readProjectTable({ io,
    bindingFile: String(flags.get('binding') ?? 'graph_index_binding.unified.json') });
  const at = new Date().toISOString();
  const installed = renderInstalledSkill({ source: readFileSync(sourcePath, 'utf8'), lane, rootTable: tablePath,
    projects, sourceRef: shellPath(path.resolve(sourcePath)), at });
  const bytes = Buffer.from(installed, 'utf8');
  const wrote = targets.map(target => {
    const before = existsSync(target) ? sha256(readFileSync(target)) : null;
    if (flags.get('dry-run') !== true) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    return { path: shellPath(target), existed: before !== null, sha256_before: before, sha256_after: sha256(bytes) };
  });
  const receipt = { schema_version: SKILL_INSTALL_SCHEMA, at, lane: shellPath(lane),
    root_table: shellPath(tablePath), source: shellPath(path.resolve(sourcePath)),
    source_sha256: sha256(readFileSync(sourcePath)), dry_run: flags.get('dry-run') === true,
    projects: projects.map(({ code, generation, chunks, served }) => ({ code, generation, chunks, served })),
    installed_sha256: sha256(bytes), targets: wrote };
  const receiptPath = flags.get('receipt');
  if (typeof receiptPath === 'string' && flags.get('dry-run') !== true) {
    mkdirSync(path.dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[install-skill] ${error?.code ?? 'skill_install_failed'}\n`);
    process.exitCode = 2;
  });
}
