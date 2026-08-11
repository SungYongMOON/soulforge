#!/usr/bin/env node
// Emits a byte manifest of the tracked engine tree.
//
// The manifest declares its own path base in a header. That header exists because resolving
// manifest rows against the wrong root has already produced false verification failures twice,
// in opposite directions — once by assuming repository-relative and once by assuming
// bundle-relative. A verifier reads the declaration instead of guessing, and an absent or
// unrecognised value must fail rather than fall back.
//
// Only tracked source is listed. Runtime observations are host-local measurements and are not
// part of what this manifest attests.
//
//   node tools/emit_manifest.mjs [--out <path>]

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');

const INCLUDED_DIRS = ['kernel', 'assembly', 'subjects', 'tools', 'tests', 'contracts', 'fixtures', 'topology'];
const INCLUDED_ROOT_FILES = ['README.md'];

// The receipt records the result of a run, so it changes on every run and cannot be part of the
// manifest that a run verifies against. Listing it would make the manifest self-invalidating.
const EXCLUDED = new Set(['phase_1_integration_receipt.json', 'engine_manifest.sha256']);

const walk = (dir) => {
  const out = [];
  let entries = [];
  try { entries = readdirSync(join(ENGINE, dir)); } catch { return out; }
  for (const name of entries.sort()) {
    const rel = `${dir}/${name}`;
    const abs = join(ENGINE, rel);
    if (statSync(abs).isDirectory()) out.push(...walk(rel));
    else if (!EXCLUDED.has(name)) out.push(rel);
  }
  return out;
};

const files = [...INCLUDED_ROOT_FILES, ...INCLUDED_DIRS.flatMap((d) => walk(d))]
  .map((p) => p.split(sep).join('/'))
  .sort();

const rows = files.map((rel) => {
  const digest = createHash('sha256').update(readFileSync(join(ENGINE, rel))).digest('hex');
  return `${digest}  ${rel}`;
});

const header = [
  '# path_base: engine-relative',
  '# root: guild_hall/engineering_engine',
  '# contains: tracked engine source, contracts and derived topology',
  '# excludes: the integration receipt, which records a run and would make this self-invalidating',
  '# excludes: runtime observations, which are host-local measurements under guild_hall/state/**',
  `# file_count: ${rows.length}`,
];

const text = `${[...header, ...rows].join('\n')}\n`;
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (out) {
  writeFileSync(out, text, 'utf8');
  console.log(JSON.stringify({
    emitted: relative(ENGINE, out).split(sep).join('/'),
    file_count: rows.length,
    manifest_sha256: createHash('sha256').update(text).digest('hex'),
    path_base: 'engine-relative',
  }, null, 2));
} else {
  process.stdout.write(text);
}
