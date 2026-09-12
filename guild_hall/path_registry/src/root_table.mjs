// The alias-to-physical-root table — plan 17, the one place an absolute path
// enters a process.
//
// `data_root` and its siblings are root classes, not directory names: no declared
// layout contains a folder called `data_root`, and an address like
// `data_root/20_PROJECTS/<project-ref>` is a portable address whose first segment
// names the root class it lives under. Manifests and refs store that address, so
// the same bytes read the same on any host; the table is what turns it into a
// place on this one.
//
// Because the table locates the estate, it cannot live inside the estate. It is
// read from a path the caller supplies and pins by digest, and that path is the
// only absolute this contract accepts. The values it holds - the actual roots -
// are host-local private facts: they are never written into code, documents,
// manifests or receipts, which carry the alias and the table digest instead.
//
// Admission here is deliberately narrower than `resolveKnowledgeRoot`, which
// answers a different question (is this a knowledge root directly below its
// approved containment root). This one only has to answer: is this exactly the
// directory it claims to be, reached without a link.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

import { PHYSICAL_ROOT_CLASSES } from './path_registry_core.mjs';

export const ROOT_TABLE_SCHEMA = 'soulforge.physical_root_table.v0';
export const ROOT_TABLE_MAX_BYTES = 64 * 1024;

const SHA = /^sha256:[0-9a-f]{64}$/u;
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export class RootTableError extends Error {
  constructor(code) { super(code); this.name = 'RootTableError'; this.code = code; }
}
const fail = code => { throw new RootTableError(code); };

// Exactly the directory it names, reached without a link, at every level a
// caller could have redirected. A junction or symlink standing in for a root is
// refused rather than followed - that is the whole point of pinning a root.
function admitRoot(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) fail('root_table_value_not_absolute');
  const requested = resolve(value);
  let stat;
  try { stat = lstatSync(requested); } catch { return fail('root_table_root_unavailable'); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('root_table_root_not_a_plain_directory');
  let canonical;
  try { canonical = realpathSync(requested); } catch { return fail('root_table_root_unavailable'); }
  if (canonical !== requested) fail('root_table_root_not_canonical');
  return canonical;
}

const withSeparator = value => value.endsWith(sep) ? value : value + sep;

/**
 * Reads and admits the table. `expectedSha256` is required: a table that locates
 * the estate is exactly the kind of input that must not change under a running
 * caller without the caller saying so.
 */
export function readRootTable({ tablePath, expectedSha256 } = {}) {
  if (typeof tablePath !== 'string' || !isAbsolute(tablePath)) fail('root_table_path_not_absolute');
  if (!SHA.test(expectedSha256 ?? '')) fail('root_table_pin_required');
  let bytes;
  try { bytes = readFileSync(tablePath); } catch { return fail('root_table_unavailable'); }
  if (bytes.length > ROOT_TABLE_MAX_BYTES) fail('root_table_too_large');
  const table_sha256 = digest(bytes);
  if (table_sha256 !== expectedSha256) fail('root_table_pin_mismatch');
  let parsed;
  try { parsed = JSON.parse(bytes); } catch { return fail('root_table_unreadable'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
    || parsed.schema_version !== ROOT_TABLE_SCHEMA
    || parsed.roots === null || typeof parsed.roots !== 'object' || Array.isArray(parsed.roots)) {
    fail('root_table_invalid');
  }
  const entries = Object.entries(parsed.roots);
  if (entries.length === 0) fail('root_table_invalid');
  const roots = {};
  for (const [alias, value] of entries) {
    // The vocabulary is the registry's, not a second list kept here.
    if (!PHYSICAL_ROOT_CLASSES.includes(alias)) fail('root_table_alias_unknown');
    roots[alias] = admitRoot(value);
  }
  // Two aliases resolving to the same place, or one root inside another, would
  // make an address mean two things. An address has one meaning or none.
  const canonical = Object.values(roots);
  if (new Set(canonical).size !== canonical.length) fail('root_table_roots_not_distinct');
  for (const outer of canonical) {
    for (const inner of canonical) {
      if (inner !== outer && inner.startsWith(withSeparator(outer))) fail('root_table_roots_nested');
    }
  }
  return Object.freeze({ schema_version: ROOT_TABLE_SCHEMA, table_sha256,
    aliases: Object.freeze([...Object.keys(roots)].sort()), roots: Object.freeze(roots) });
}

/** The physical root for one alias, or a refusal naming the alias and nothing else. */
export function physicalRootFor(rootTable, alias) {
  if (rootTable?.schema_version !== ROOT_TABLE_SCHEMA) fail('root_table_invalid');
  if (!Object.hasOwn(rootTable.roots, alias)) fail('root_table_alias_not_bound');
  return rootTable.roots[alias];
}
