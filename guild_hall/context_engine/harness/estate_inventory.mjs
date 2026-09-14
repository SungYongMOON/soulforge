// Dev harness: what every project on this estate has to work with, and how far
// it has got. Read-only from end to end -- it opens no model, writes nothing into
// a project store, and the one thing it may write is its own receipt where the
// caller asked for it.
//
// It answers four questions per project, each from the thing that owns the answer:
//   material   how many items the collectors hold for it (Slack root messages,
//              Linear issues, mail events whose text names the project code)
//   admission  whether the project has an identity, an ACL, a grant, an admission
//              and a graph binding -- the five files a preparation needs
//   store      which preparation and graph generations exist, and which one the
//              pointer selects
//   database   which generation the graph database is actually serving, and when
//              it last wrote it. "The store has a generation" and "the database
//              holds it" are different claims, so they are asked separately.
//
// Nothing here infers project attribution beyond two stated rules: a Linear issue
// belongs to the Linear project whose name starts with the project code, and a
// mail event belongs to a project when the project code appears verbatim in its
// subject or body. Anything else is counted as unattributed and reported as such.
//
// Every host-local value is an argument: the one absolute path is the root table,
// and everything after it is an alias address.
//
// usage:
//   node estate_inventory.mjs --root-table <file> [--root-table-sha256 <sha256:...>]
//        [--projects P26-014,P24-049] [--mail-root <alias address>]... [--out <file>]
//        [--slack-root <alias address>] [--linear-root <alias address>] [--json]
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { validateGraphBinding } from '../src/runtime/graph_extraction.mjs';
import { inspectGraphDatabase } from '../src/runtime/graph_database.mjs';
import { VOICE_LIBRARY_INDEX_ADDRESS, VOICE_ROUTES_ADDRESS, voiceGrantItems } from './voice_routes.mjs';

export const ESTATE_INVENTORY_SCHEMA = 'soulforge.context_estate_inventory.v1';
// A project folder is a code: upper-case letters and digits in hyphen-joined
// parts (P24-049, D1-26-001). Anything else in that root is not a project.
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index++, next);
    if (flags.has(name)) flags.set(name, [...[flags.get(name)].flat(), value]);
    else flags.set(name, value);
  }
  return flags;
}

const listOf = value => (value === undefined || value === true ? [] : [value].flat().map(String));
const readJson = (io, address) => JSON.parse(io.read(address, MAX_JSON_BYTES));
const dirEntries = (io, address) => {
  const where = io.path(address, true);
  if (!existsSync(where) || !statSync(where).isDirectory()) return [];
  return readdirSync(where).sort();
};
const fileExists = (io, address) => {
  const where = io.path(address, true);
  return existsSync(where) && statSync(where).isFile();
};

// Every .json file under one custody folder, read as the collector wrote it.
function custodyRecords(io, address) {
  const rows = [];
  const walk = rel => {
    for (const entry of dirEntries(io, rel)) {
      const child = `${rel}/${entry}`;
      const where = io.path(child, true);
      if (!existsSync(where)) continue;
      if (statSync(where).isDirectory()) walk(child);
      else if (entry.endsWith('.json')) rows.push({ address: child, record: readJson(io, child) });
    }
  };
  walk(address);
  return rows;
}

// Custody keeps every revision of an object it has seen, each in its own file
// under the object's folder. The inventory counts objects, not revisions, so the
// latest revision of each stands for it: the one the collector last updated, and
// its file order only when the records carry no update time.
export function latestPerObject(rows) {
  const byId = new Map();
  for (const { record } of rows) {
    const id = record?.object_id;
    if (typeof id !== 'string' || !id) continue;
    const held = byId.get(id);
    const when = String(record.object?.updated_at ?? '');
    if (!held || when >= String(held.object?.updated_at ?? '')) byId.set(id, record);
  }
  return [...byId.values()];
}

// A Slack channel's root messages: a revision whose thread_ts is absent or is its
// own ts. Replies are part of their root's document, not separate items, and a
// held event has no body at all, so it is counted rather than turned into one.
export function slackChannelRoots(state) {
  const roots = new Set(), replies = new Set();
  for (const revision of state?.revisions ?? []) {
    if (revision.thread_ts === null || revision.thread_ts === revision.message_ts) roots.add(revision.message_ts);
    else replies.add(revision.message_ts);
  }
  return { roots: [...roots].sort(), reply_revisions: replies.size,
    held: Array.isArray(state?.hold_receipts) ? state.hold_receipts.length : 0 };
}

// The Linear project ids whose name begins with this project code, from the
// collector's own project index. A code that names no Linear project has none;
// nothing is matched by similarity.
export function linearProjectsFor(code, projects) {
  return projects.filter(row => typeof row.name === 'string' && row.name.trim().startsWith(code)).map(row => row.id);
}

// The project codes a mail event names verbatim in its subject or body. The token
// has to stand alone: `P24-049` in `P24-0491` is not this project.
export function mailCodesIn(text, codes) {
  // The code is matched literally rather than compiled into a pattern: a project
  // code is a fixed token, and no part of it should ever become a regular
  // expression. A match counts only where neither neighbour continues the token.
  const boundary = value => value === '' || !/[0-9A-Za-z-]/u.test(value);
  const found = [];
  for (const code of codes) {
    const pieces = String(text).split(code);
    const standalone = pieces.length > 1 && pieces.slice(0, -1)
      .some((piece, index) => boundary(piece.slice(-1)) && boundary(pieces[index + 1].slice(0, 1)));
    if (standalone) found.push(code);
  }
  return found;
}

async function mailCandidates(io, roots, codes) {
  const perCode = new Map(codes.map(code => [code, []]));
  let scanned = 0, unattributed = 0;
  for (const root of roots) {
    for (const year of dirEntries(io, root)) {
      for (const file of dirEntries(io, `${root}/${year}`)) {
        if (!file.endsWith('.jsonl')) continue;
        const address = `${root}/${year}/${file}`;
        const reader = createInterface({ input: createReadStream(io.path(address)), crlfDelay: Infinity });
        for await (const line of reader) {
          if (!line.trim()) continue;
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          scanned++;
          const text = `${event.subject ?? ''}\n${event.body_text ?? ''}`;
          const named = mailCodesIn(text, codes);
          if (named.length === 0) { unattributed++; continue; }
          for (const code of named) {
            perCode.get(code).push({ item_id: event.event_id, root_ref: root, path: [year, file] });
          }
        }
      }
    }
  }
  return { perCode, scanned, unattributed };
}

// The grant items custody holds for one project, by the rules above and nothing
// else. `roots` maps a binding's source refs to alias addresses, so what is
// listed is exactly what that binding binds and its admission admits: a source
// the admission stopped naming is simply not in `roots` and its items disappear
// from the next grant. Items are deduplicated by id -- custody can hold one mail
// event in two files -- and every item takes the latest revision custody has,
// which is what makes a new comment on an issue a changed document rather than a
// new one.
//
// Voice is the one kind whose items do not come from what a folder holds. A
// recording crosses projects, so "this recording is in the inbox" attributes
// nothing; only a person's confirmed interval does, and that is read from the
// route ledger rather than from the sessions folder. A project whose binding does
// not name a voice root gets no voice items at all, however many confirmations
// exist -- the binding is still what decides which roots are looked at.
export function grantCandidates({ io, code, roots, dataClass = 'company_internal', everyCode = null,
  voiceRoutesAddress = VOICE_ROUTES_ADDRESS, voiceLibraryIndexAddress = VOICE_LIBRARY_INDEX_ADDRESS } = {}) {
  const item = extra => ({ revision_policy: 'latest_in_custody', revision_sha256: null, data_class: dataClass, ...extra });
  // `everyCode`: the codes the estate knows. Given it, the same pass over the mail
  // files also counts the events that name none of them -- items no rule attributes
  // anywhere, which a caller keeps as pending rather than as absent.
  const known = Array.isArray(everyCode) && everyCode.length ? everyCode : null;
  const unattributed = { mail_events: 0, mail_events_scanned: 0,
    reason: 'no project code appears as a standalone token in the subject or the body' };
  const sources = [];
  let voice = null;
  const add = (kind, rootRef, items) => {
    const once = [...new Map(items.map(row => [row.item_id, row])).values()]
      .sort((a, b) => String(a.item_id).localeCompare(String(b.item_id)));
    if (once.length) sources.push({ kind, root_ref: rootRef, items: once });
  };

  for (const [rootRef, address] of Object.entries(roots ?? {})) {
    if (rootRef.startsWith('slack.')) {
      const state = `${address}/state/slack-continuous.json`;
      if (!fileExists(io, state)) continue;
      add('slack', rootRef, slackChannelRoots(readJson(io, state)).roots.map(ts => item({ item_id: ts })));
    } else if (rootRef.startsWith('linear.')) {
      const projects = latestPerObject(custodyRecords(io, `${address}/projects`))
        .map(record => ({ id: record.object_id, name: record.object?.name ?? null }));
      const wanted = linearProjectsFor(code, projects);
      add('linear', rootRef, latestPerObject(custodyRecords(io, `${address}/issues`))
        .filter(record => wanted.includes(record.object?.project_id))
        .map(record => item({ item_id: record.object_id })));
    } else if (rootRef.startsWith('mail.')) {
      const rows = [];
      for (const year of dirEntries(io, address)) {
        for (const file of dirEntries(io, `${address}/${year}`)) {
          if (!file.endsWith('.jsonl')) continue;
          const text = io.read(`${address}/${year}/${file}`, 512 * 1024 * 1024).toString('utf8');
          for (const raw of text.split(String.fromCharCode(10))) {
            if (!raw.trim()) continue;
            let event;
            try { event = JSON.parse(raw); } catch { continue; }
            const text = [event.subject ?? '', event.body_text ?? ''].join(String.fromCharCode(10));
            if (known !== null) {
              unattributed.mail_events_scanned += 1;
              if (mailCodesIn(text, known).length === 0) unattributed.mail_events += 1;
            }
            if (mailCodesIn(text, [code]).length === 0) continue;
            rows.push(item({ item_id: event.event_id, path: [year, file] }));
          }
        }
      }
      add('mail', rootRef, rows);
    } else if (rootRef.startsWith('voice.')) {
      // The address is not read here at all: the ledger says which sessions were
      // confirmed for this project, and the adapter opens them below this root.
      const found = voiceGrantItems({ io, code, item: item({}),
        routesAddress: voiceRoutesAddress, libraryIndexAddress: voiceLibraryIndexAddress });
      voice = { ...found.diagnostics, root_ref: rootRef, items: found.items.length };
      add('voice', rootRef, found.items);
    }
  }
  const ordered = sources.sort((a, b) => a.root_ref.localeCompare(b.root_ref));
  // The array is what every caller already uses; the count rides along for the
  // one caller that asked for it, so neither has to scan the mail twice.
  if (known !== null) Object.defineProperty(ordered, 'unattributed', { value: Object.freeze(unattributed), enumerable: false });
  // Which confirmations were read, which the pass could not read, and which
  // sessions it refused to place. A voice root that is bound but holds nothing
  // for this project still reports zero rather than nothing at all.
  if (voice !== null) Object.defineProperty(ordered, 'voice', { value: Object.freeze(voice), enumerable: false });
  return ordered;
}

export async function takeEstateInventory({ io, codes = null, slackRoot, linearRoot, mailRoots = [],
  bindingName = 'graph_index_binding.json', runWorker = undefined, now = new Date().toISOString() } = {}) {
  const projectsRoot = 'data_root/20_PROJECTS';
  const found = dirEntries(io, projectsRoot).filter(name => PROJECT_CODE.test(name));
  const wanted = codes === null ? found : codes.filter(code => found.includes(code));

  // Slack: one channel folder per project code.
  const slack = new Map();
  for (const channel of dirEntries(io, slackRoot)) {
    const address = `${slackRoot}/${channel}/state/slack-continuous.json`;
    if (!fileExists(io, address)) continue;
    slack.set(channel, slackChannelRoots(readJson(io, address)));
  }

  // Linear: one team custody folder, projects index then issues.
  const linearTeams = dirEntries(io, linearRoot);
  const linearProjects = [], linearIssues = [];
  for (const team of linearTeams) {
    for (const row of latestPerObject(custodyRecords(io, `${linearRoot}/${team}/projects`))) {
      linearProjects.push({ id: row.object_id ?? null, name: row.object?.name ?? null, team });
    }
    for (const row of latestPerObject(custodyRecords(io, `${linearRoot}/${team}/issues`))) {
      linearIssues.push({ id: row.object_id ?? null, project_id: row.object?.project_id ?? null,
        identifier: row.object?.identifier ?? null, team, root_ref: `${linearRoot}/${team}` });
    }
  }

  const mail = await mailCandidates(io, mailRoots, wanted);

  const rows = [];
  for (const code of wanted) {
    const storePath = `${projectsRoot}/${code}`;
    const info = `${storePath}/00_프로젝트_안내`;
    const bindingAddress = `control_root/project-bindings/${code}/${bindingName}`;
    const grants = dirEntries(io, `${info}/grants`).filter(name => name.endsWith('.json'));
    const admissions = dirEntries(io, `control_root/project-bindings/${code}`)
      .filter(name => name.startsWith('admission.') && name.endsWith('.json'));
    const preparation = dirEntries(io, `${storePath}/20_문서검색/본문·표_추출/generations`);
    const graph = dirEntries(io, `${storePath}/20_문서검색/검색_색인/generations`);
    const pointerAddress = `${info}/graph_index_current.json`;
    const pointer = fileExists(io, pointerAddress) ? readJson(io, pointerAddress) : null;

    const linearIds = linearProjectsFor(code, linearProjects);
    const issues = linearIssues.filter(row => linearIds.includes(row.project_id));
    const channel = slack.get(code) ?? null;
    const mailRows = mail.perCode.get(code) ?? [];

    let database = null;
    if (fileExists(io, bindingAddress)) {
      const binding = readJson(io, bindingAddress);
      try {
        const bound = validateGraphBinding(binding.graph);
        if (bound.neo4j !== null) {
          const seen = await inspectGraphDatabase({ binding: binding.graph, ...(runWorker ? { runWorker } : {}) });
          database = { status: seen.status, projects_in_database: seen.projects.length,
            // The rows for this project, matched by the generation ids its own
            // store holds: the project key is an identity string and stays out.
            mine: seen.projects.filter(row => graph.includes(row.generation_id))
              .map(({ generation_id, loaded_at, nodes, chunks, embedded_chunks, rule_edges }) =>
                ({ generation_id, loaded_at, nodes, chunks, embedded_chunks, rule_edges })),
            indexes: seen.indexes ?? null };
        }
      } catch (error) { database = { status: 'binding_refused', code: error?.code ?? 'unknown' }; }
    }

    rows.push({
      project_code: code,
      material: {
        slack_roots: channel?.roots.length ?? 0, slack_held: channel?.held ?? 0,
        slack_reply_revisions: channel?.reply_revisions ?? 0, slack_channel: channel !== null,
        linear_projects: linearIds.length, linear_issues: issues.length,
        mail_events_naming_code: mailRows.length,
      },
      admission: {
        identity: fileExists(io, `${info}/project_identity.json`), acl: fileExists(io, `${info}/acl.json`),
        grants: grants.length, admissions: admissions.length, binding: fileExists(io, bindingAddress),
      },
      store: {
        preparation_generations: preparation, graph_generations: graph,
        selected_generation: pointer?.generation_id ?? null, selection_epoch: pointer?.selection_epoch ?? null,
      },
      database,
    });
  }

  return Object.freeze({
    schema_version: ESTATE_INVENTORY_SCHEMA, taken_at: now, inventory_id: randomUUID(),
    io: { table_sha256: io.table_sha256, aliases: io.aliases },
    sources: { slack_root: slackRoot, linear_root: linearRoot, mail_roots: [...mailRoots] },
    rules: {
      linear: 'an issue belongs to the Linear project whose name starts with the project code',
      mail: 'an event belongs to a project when the project code appears as a standalone token in its subject or body',
      slack: 'one root message (thread_ts absent or its own ts) is one item; a held event has no body and is only counted',
    },
    totals: {
      projects: rows.length, projects_on_estate: found.length,
      linear_projects_in_custody: linearProjects.length, linear_issues_in_custody: linearIssues.length,
      linear_issues_without_project: linearIssues.filter(row => row.project_id === null).length,
      mail_events_scanned: mail.scanned, mail_events_naming_no_code: mail.unattributed,
      slack_channels: slack.size,
    },
    projects: rows,
  });
}

function table(inventory) {
  const lines = ['| 과제 | Slack 루트(보류) | Linear 이슈 | 메일 후보 | 등록(identity/acl/grant/admission/binding) | 준비 세대 | 그래프 세대 | 선택 | DB 반영 | 마지막 반영 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of inventory.projects) {
    const a = row.admission;
    const mine = row.database?.mine?.[0] ?? null;
    lines.push(`| ${row.project_code} | ${row.material.slack_roots}(${row.material.slack_held}) | `
      + `${row.material.linear_issues} | ${row.material.mail_events_naming_code} | `
      + `${[a.identity, a.acl, a.grants > 0, a.admissions > 0, a.binding].map(v => (v ? 'O' : '-')).join('')} | `
      + `${row.store.preparation_generations.length} | ${row.store.graph_generations.length} | `
      + `${row.store.selected_generation ?? '-'} | ${mine ? `${mine.generation_id} (청크 ${mine.chunks})` : '-'} | `
      + `${mine?.loaded_at ?? '-'} |`);
  }
  return lines.join('\n');
}

async function main() {
  const flags = options(process.argv.slice(2));
  const tablePath = String(flags.get('root-table') ?? process.env.SOULFORGE_CONTEXT_ROOT_TABLE ?? '');
  if (!tablePath) throw new Error('missing --root-table');
  const expected = flags.get('root-table-sha256');
  const io = createAliasedStoreIo(readRootTable({ tablePath,
    expectedSha256: typeof expected === 'string' ? expected : sha256(readFileSync(tablePath)) }));
  const inventory = await takeEstateInventory({ io,
    codes: flags.get('projects') === undefined ? null : String(flags.get('projects')).split(',').map(value => value.trim()),
    slackRoot: String(flags.get('slack-root') ?? 'data_root/ingress/slack/channels'),
    linearRoot: String(flags.get('linear-root') ?? 'data_root/ingress/linear'),
    mailRoots: listOf(flags.get('mail-root')),
    bindingName: String(flags.get('binding') ?? 'graph_index_binding.json') });
  const out = flags.get('out');
  if (typeof out === 'string') {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`);
  }
  process.stdout.write(flags.get('json') === true ? `${JSON.stringify(inventory)}\n`
    : `${table(inventory)}\n\n${JSON.stringify(inventory.totals)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[estate-inventory] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  });
}
