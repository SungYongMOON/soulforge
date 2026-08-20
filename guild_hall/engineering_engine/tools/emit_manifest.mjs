#!/usr/bin/env node
// Emits a byte manifest of the tracked engine tree.
//
// The manifest declares its own path base in a header. That header exists because resolving
// manifest rows against the wrong root has already produced false verification failures twice,
// in opposite directions — once by assuming repository-relative and once by assuming
// bundle-relative. A verifier reads the declaration instead of guessing, and an absent or
// unrecognised value must fail rather than fall back.
//
// The rows hash the bytes Git will store, not the bytes that happen to be sitting in this
// checkout. Those two differ whenever a working copy carries CRLF for a file the clean filter
// stores as LF, and the difference is invisible: the manifest looks fine on the machine that
// wrote it and fails everywhere else, or worse, drifts from the committed content while still
// matching the checkout. So the canonical bytes are derived here, and then *checked against
// Git's own answer* — `git hash-object` is asked for the blob id of each file, and the id we
// compute over our canonical bytes has to equal it. If the two disagree this refuses to emit
// rather than publish a manifest the repository will not reproduce.
//
// Only tracked source is listed. Runtime observations are host-local measurements and are not
// part of what this manifest attests.
//
//   node tools/emit_manifest.mjs [--out <path>]
//   node tools/emit_manifest.mjs --verify <path>

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');

const INCLUDED_DIRS = [
  'kernel', 'assembly', 'subjects', 'evaluation', 'tools', 'tests', 'contracts', 'fixtures', 'topology',
  'mcp', 'stage_rules', 'observation', 'guidance',
];
const INCLUDED_ROOT_FILES = ['README.md'];

// The receipt records the result of a run, so it changes on every run and cannot be part of the
// manifest that a run verifies against. Listing it would make the manifest self-invalidating.
const EXCLUDED_PATHS = new Set([
  'topology/phase_1_integration_receipt.json',
  'topology/engine_manifest.sha256',
  'topology/engine_release.json',
]);

export const BYTE_BASIS = 'git-clean-filter-lf';

const inManifestScope = (file) => file === 'README.md'
  || INCLUDED_DIRS.some((dir) => file.startsWith(`${dir}/`));

/**
 * Parses the Git index's NUL-delimited path list. A filesystem walk is deliberately not used:
 * an untracked scratch file under an allowed directory is not source the manifest may attest.
 */
export function parseTrackedPathList(output) {
  if (!Buffer.isBuffer(output) || output.length === 0 || output.at(-1) !== 0) {
    throw new Error('Git index path list is not a complete NUL-delimited stream');
  }
  const seen = new Set();
  const files = [];
  for (const file of output.subarray(0, -1).toString('utf8').split('\0')) {
    const segments = file.split('/');
    if (!file || file.includes('\\') || file.startsWith('/')
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
      || !inManifestScope(file) || seen.has(file)) {
      throw new Error('Git index path list is ambiguous or outside the manifest scope');
    }
    seen.add(file);
    if (!EXCLUDED_PATHS.has(file)) files.push(file);
  }
  if (!files.includes('README.md')) throw new Error('Git index path list omitted engine README.md');
  for (const dir of ['mcp', 'stage_rules', 'observation', 'guidance']) {
    if (!files.some((file) => file.startsWith(`${dir}/`))) {
      throw new Error(`Git index path list omitted required source root ${dir}/`);
    }
  }
  return files.sort();
}

export function manifestFilesAt(engineRoot) {
  const listed = spawnSync('git', ['ls-files', '--cached', '-z', '--', ...INCLUDED_ROOT_FILES, ...INCLUDED_DIRS], {
    cwd: engineRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0 || listed.error || !Buffer.isBuffer(listed.stdout)) {
    throw new Error('could not read the Git index manifest allowlist');
  }
  return parseTrackedPathList(listed.stdout);
}

export const manifestFiles = () => manifestFilesAt(ENGINE);

/**
 * The bytes Git stores for this content.
 *
 * A file holding a NUL byte is binary to Git and passes through untouched. Everything else is
 * text under this repository's `* text=auto eol=lf`, and the clean filter normalises CRLF to
 * LF on the way in. Replicating that here is what makes the manifest independent of how a
 * given checkout happens to have written its line endings — and the replication is verified
 * against Git rather than assumed correct.
 */
export function canonicalBytes(buffer) {
  if (buffer.includes(0)) return buffer;
  const text = buffer.toString('binary');
  if (!text.includes('\r')) return buffer;
  return Buffer.from(text.split('\r\n').join('\n'), 'binary');
}

/** The Git blob id our canonical bytes would produce, computed without touching the object db. */
const blobIdOf = (bytes) => createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, 'binary'), bytes]))
  .digest('hex');

/**
 * Asks Git for the blob id of each working-tree file, with the repository's attributes applied.
 *
 * One process for the whole list. Returns null when Git is unavailable, which the caller
 * treats as "cannot verify" rather than "verified".
 */
function gitBlobIds(files) {
  const r = spawnSync('git', ['hash-object', '--filters', '--', ...files], {
    cwd: ENGINE,
    encoding: 'utf8',
  });
  if (r.status !== 0 || typeof r.stdout !== 'string') return null;
  const ids = r.stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  return ids.length === files.length ? ids : null;
}

export function buildManifest() {
  const files = manifestFiles();
  const canonical = files.map((rel) => canonicalBytes(readFileSync(join(ENGINE, rel))));
  const rows = files.map((rel, i) => `${createHash('sha256').update(canonical[i]).digest('hex')}  ${rel}`);

  // The self-check. If our canonicalisation and Git's clean filter ever disagree, the rows
  // below describe bytes that will never be committed, so emitting them would be worse than
  // failing.
  const gitIds = gitBlobIds(files);
  const drift = [];
  if (gitIds !== null) {
    for (const [i, rel] of files.entries()) {
      const mine = blobIdOf(canonical[i]);
      if (mine !== gitIds[i]) drift.push({ file: rel, git_blob: gitIds[i], derived_blob: mine });
    }
  }

  const header = [
    '# path_base: engine-relative',
    '# root: guild_hall/engineering_engine',
    '# contains: tracked engine source, contracts and derived topology',
    '# excludes: the integration receipt, which records a run and would make this self-invalidating',
    '# excludes: runtime observations, which are host-local measurements under guild_hall/state/**',
    '# excludes: the release manifest, which records this manifest sha and would otherwise be circular',
    `# byte_basis: ${BYTE_BASIS}`,
    `# blob_identity_verified: ${gitIds === null ? 'unavailable' : String(drift.length === 0)}`,
    `# file_count: ${rows.length}`,
  ];
  return { files, rows, text: `${[...header, ...rows].join('\n')}\n`, drift, blobIdentityChecked: gitIds !== null };
}

/** Parses a manifest into its declared header values and rows. */
export function parseManifest(text) {
  const rows = new Map();
  const duplicate_paths = [];
  for (const line of text.split('\n')) {
    const m = /^([0-9a-f]{64})\s+(.+)$/.exec(line.trim());
    if (m) {
      if (rows.has(m[2])) duplicate_paths.push(m[2]);
      else rows.set(m[2], m[1]);
    }
  }
  return {
    path_base: /^#\s*path_base:\s*(\S+)\s*$/m.exec(text)?.[1] ?? null,
    byte_basis: /^#\s*byte_basis:\s*(\S+)\s*$/m.exec(text)?.[1] ?? null,
    file_count: Number(/^#\s*file_count:\s*(\d+)\s*$/m.exec(text)?.[1] ?? NaN),
    rows,
    duplicate_paths,
  };
}

// ---------------------------------------------------------------- cli

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  const built = buildManifest();

  if (built.drift.length > 0) {
    console.error('refusing to emit: the derived canonical bytes disagree with git hash-object for:');
    for (const d of built.drift) console.error(`  ${d.file}  git ${d.git_blob.slice(0, 12)} vs derived ${d.derived_blob.slice(0, 12)}`);
    process.exit(1);
  }

  const verify = arg('--verify');
  if (verify) {
    const declared = parseManifest(readFileSync(verify, 'utf8'));
    const fresh = parseManifest(built.text);
    const mismatched = [...fresh.rows.entries()].filter(([f, h]) => declared.rows.get(f) !== h).map(([f]) => f);
    const extra = [...declared.rows.keys()].filter((f) => !fresh.rows.has(f));
    const ok = mismatched.length === 0 && extra.length === 0 && declared.file_count === fresh.rows.size
      && declared.duplicate_paths.length === 0;
    console.log(JSON.stringify({
      verified: verify, result: ok ? 'PASS' : 'FAIL',
      file_count: fresh.rows.size, declared_file_count: declared.file_count,
      mismatched, missing_from_manifest: mismatched.filter((f) => !declared.rows.has(f)), extra,
      duplicate_row_count: declared.duplicate_paths.length,
      byte_basis: fresh.byte_basis, blob_identity_verified: built.blobIdentityChecked,
    }, null, 2));
    process.exit(ok ? 0 : 1);
  }

  const out = arg('--out');
  if (out) {
    writeFileSync(out, built.text, 'utf8');
    console.log(JSON.stringify({
      emitted: relative(ENGINE, out).split(sep).join('/'),
      file_count: built.rows.length,
      manifest_sha256: createHash('sha256').update(built.text).digest('hex'),
      path_base: 'engine-relative',
      byte_basis: BYTE_BASIS,
      blob_identity_verified: built.blobIdentityChecked,
    }, null, 2));
  } else {
    process.stdout.write(built.text);
  }
}
