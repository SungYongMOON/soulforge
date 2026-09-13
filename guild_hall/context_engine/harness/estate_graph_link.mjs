// Dev harness: add one rule's explicit-reference edges to the graph projection of
// a project's selected generation, and write a receipt.
//
// It reads the generation through the same view the APP's readers use, builds the
// rule's identifier map from each document's own facts (reading a fact is the
// APP's job, not the database's), and asks the worker for the candidates first.
// Nothing is written until `--apply`, and what is written is an edge in the
// derived projection: reloading the generation rebuilds the graph without it.
// The generation, its pointer, its files and the binding are never touched.
//
// Every host-local value -- the root table, the binding, where receipts go -- is
// an argument or an environment variable, so no address or path lives in this file.
//
// usage:
//   node estate_graph_link.mjs --root-table <file> --binding <file> --receipts <dir>
//                              [--binding-address <alias address>] [--project <code>]
//                              [--rule <rule id>] [--actor <ref>] [--apply]
// env fallbacks: SOULFORGE_GRAPH_LINK_ROOT_TABLE, SOULFORGE_GRAPH_LINK_BINDING,
//   SOULFORGE_GRAPH_LINK_BINDING_ADDRESS, SOULFORGE_GRAPH_LINK_RECEIPTS,
//   SOULFORGE_GRAPH_LINK_PROJECT, SOULFORGE_GRAPH_LINK_ACTOR
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { openGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { EXPLICIT_LINK_RULES, linkExplicitReferences } from '../src/runtime/graph_database.mjs';

const LINEAR_IDENTIFIER_FACT = 'linear.identifier';
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const out = line => process.stdout.write(`${line}\n`);

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) flags.set(name, true);
    else { flags.set(name, next); index++; }
  }
  return flags;
}

function required(flags, name, variable) {
  const value = flags.get(name) ?? process.env[variable];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`missing --${name} (or ${variable})`);
  }
  return value.trim();
}

// The rule's map: the identifier a document declares as its own, pointing at that
// document. A token two documents both claim is an ambiguity this harness refuses
// rather than resolving by order.
function identifierMap(view, factName) {
  const identifiers = new Map(), claimed = new Map();
  for (const row of view.manifest.documents) {
    const document = view.readDocument(row.doc_key);
    const facts = Array.isArray(document.facts) ? document.facts : [];
    const fact = facts.find(entry => entry?.name === factName);
    const token = typeof fact?.value === 'string' ? fact.value.trim() : '';
    if (!token) continue;
    if (identifiers.has(token) && identifiers.get(token) !== row.doc_key) {
      throw new Error(`identifier ${token} is claimed by more than one document`);
    }
    identifiers.set(token, row.doc_key);
    claimed.set(token, { source_kind: row.source_kind, item_id: row.item_id });
  }
  return { identifiers: Object.fromEntries([...identifiers].sort(([a], [b]) => a.localeCompare(b))), claimed };
}

const flags = options(process.argv.slice(2));
const apply = flags.get('apply') === true;
const rule = String(flags.get('rule') ?? process.env.SOULFORGE_GRAPH_LINK_RULE ?? EXPLICIT_LINK_RULES[0]);
const project = String(flags.get('project') ?? process.env.SOULFORGE_GRAPH_LINK_PROJECT ?? '');
const actorRef = String(flags.get('actor') ?? process.env.SOULFORGE_GRAPH_LINK_ACTOR ?? 'actor:owner:context-reader');
const tablePath = required(flags, 'root-table', 'SOULFORGE_GRAPH_LINK_ROOT_TABLE');
const bindingPath = required(flags, 'binding', 'SOULFORGE_GRAPH_LINK_BINDING');
const receiptsDir = required(flags, 'receipts', 'SOULFORGE_GRAPH_LINK_RECEIPTS');
const bindingAddress = flags.get('binding-address') ?? process.env.SOULFORGE_GRAPH_LINK_BINDING_ADDRESS
  ?? (project ? `control_root/project-bindings/${project}/graph_index_binding.json` : null);
if (typeof bindingAddress !== 'string' || !bindingAddress) throw new Error('missing --binding-address (or --project)');

const now = new Date().toISOString();
const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: sha256(readFileSync(tablePath)) }));
const bindingBytes = readFileSync(bindingPath);
const binding = JSON.parse(bindingBytes);
const request = { actor_ref: actorRef, project_ref: binding.project_ref, purpose: 'context_query' };
const view = () => openGraphIndex({ io, bindingAddress, bindingSha256: sha256(bindingBytes), request });

const opened = view();
const { identifiers, claimed } = identifierMap(opened, LINEAR_IDENTIFIER_FACT);
out(`generation ${opened.manifest.generation_id} documents ${opened.manifest.counts.documents} `
  + `chunks ${opened.manifest.counts.chunks} entities ${opened.manifest.counts.entities}`);
out(`rule ${rule} identifiers ${Object.keys(identifiers).length}: ${Object.keys(identifiers).join(', ')}`);

const receipt = { schema: 'context engine graph link receipt (dev, local-recovery)', at: now, rule,
  generation: opened.manifest.generation_id, generation_sha256: opened.generation_ref.sha256,
  identifiers: Object.fromEntries(Object.entries(identifiers).map(([token, key]) => [token,
    { doc_key: key, ...claimed.get(token) }])), steps: {} };

const describe = row => `${row.token} @${row.source_unit_id} ${row.source_doc_key.slice(7, 15)} -> ${row.target_doc_key.slice(7, 15)}`;

const dry = await linkExplicitReferences({ view: view(), binding: opened.graph_binding, identifiers, rule, apply: false });
receipt.steps.dry = dry;
out(`\n[dry] ${dry.status} candidates=${dry.counts?.candidates ?? 0} scanned=${dry.counts?.scanned ?? 0} `
  + `existing=${dry.counts?.existing ?? 0}`);
for (const row of dry.edges) out(`  ${describe(row)}`);

if (apply) {
  const applied = await linkExplicitReferences({ view: view(), binding: opened.graph_binding, identifiers, rule, apply: true });
  receipt.steps.apply = applied;
  out(`\n[apply] ${applied.status} relationship=${applied.relationship} created=${applied.counts?.created ?? 0} `
    + `existing=${applied.counts?.existing ?? 0} candidates=${applied.counts?.candidates ?? 0}`);
  for (const row of applied.edges) out(`  ${describe(row)}`);
}

mkdirSync(receiptsDir, { recursive: true });
const file = path.join(receiptsDir, `graph-link-${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`);
writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
out(`\nreceipt ${path.basename(file)}`);
