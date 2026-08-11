// The manifest has to describe the bytes Git will commit.
//
// This exists because the committed manifest was found disagreeing with the committed content
// for four files, and nothing in the suite noticed: the integration check never verified the
// manifest at all, so it recorded whatever it recorded and was believed. A manifest nobody
// checks is a comment with a hash in it.
//
// Three separate claims are checked, because they can fail independently:
//
//   1. the committed manifest equals a fresh emit  — the file on disk is not stale
//   2. our canonicalisation equals git's clean filter — the rows are not a local line-ending
//      accident that happens to agree with this checkout
//   3. every row equals the sha256 of the *staged* blob bytes — what will actually be
//      committed, read back out of the index rather than inferred from the working tree
//
// Claim 3 is the one that would have caught the original defect at commit time. It needs a git
// checkout; without one the result is a failure with a stated reason, not a quiet pass.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildManifest, parseManifest, canonicalBytes, BYTE_BASIS } from '../tools/emit_manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');
const MANIFEST_PATH = join(ENGINE, 'topology', 'engine_manifest.sha256');

const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });

const git = (args, opts = {}) => spawnSync('git', args, { cwd: ENGINE, encoding: 'utf8', ...opts });

{
  // Harness self test: the comparison used below has to be able to fail.
  const a = createHash('sha256').update('a').digest('hex');
  const b = createHash('sha256').update('b').digest('hex');
  record('MANIFEST/harness/self_test', a !== b && a === createHash('sha256').update('a').digest('hex'));
}

const built = buildManifest();
const declaredText = readFileSync(MANIFEST_PATH, 'utf8');
const declared = parseManifest(declaredText);
const fresh = parseManifest(built.text);

// ---------------------------------------------------------------- 1. not stale

record('MANIFEST/header/path_base', declared.path_base === 'engine-relative', `declared ${declared.path_base}`);
record('MANIFEST/header/byte_basis', declared.byte_basis === BYTE_BASIS,
  `declared ${declared.byte_basis}, expected ${BYTE_BASIS}`);
record('MANIFEST/header/file_count_matches_rows', declared.file_count === declared.rows.size,
  `header says ${declared.file_count}, ${declared.rows.size} rows present`);

const staleRows = [...fresh.rows.entries()].filter(([f, h]) => declared.rows.get(f) !== h).map(([f]) => f);
const removedRows = [...declared.rows.keys()].filter((f) => !fresh.rows.has(f));
record('MANIFEST/matches_a_fresh_emit', staleRows.length === 0 && removedRows.length === 0,
  `stale: ${staleRows.join(', ') || 'none'}; removed: ${removedRows.join(', ') || 'none'}`);

// ---------------------------------------------------------------- 2. canonicalisation is git's

record('MANIFEST/blob_identity_verified_against_git', built.blobIdentityChecked && built.drift.length === 0,
  built.blobIdentityChecked
    ? built.drift.map((d) => d.file).join(', ')
    : 'git hash-object was unavailable, so the derivation is unverified');

// ---------------------------------------------------------------- 3. staged blob bytes

const toplevel = git(['rev-parse', '--show-toplevel']);
if (toplevel.status !== 0) {
  record('MANIFEST/staged_blob_bytes', false, 'not a git checkout, so the committed bytes cannot be read');
} else {
  const root = toplevel.stdout.trim();
  const prefix = relative(root, ENGINE).split(sep).join('/');
  const files = built.files;

  // One batch read of the index. `:<path>` is the staged entry, which is exactly what a commit
  // would write — not HEAD (which is the past) and not the working tree (which may be ahead).
  const batch = git(['cat-file', '--batch'], {
    input: Buffer.from(`${files.map((f) => `:${prefix}/${f}`).join('\n')}\n`, 'utf8'),
    maxBuffer: 64 * 1024 * 1024,
    // Buffers, not strings: a blob is bytes, and decoding one as utf8 would change its hash.
    encoding: null,
  });
  const stdout = batch.stdout ?? Buffer.alloc(0);

  const staged = new Map();
  const unstaged = [];
  let cursor = 0;
  for (const file of files) {
    const nl = stdout.indexOf(0x0a, cursor);
    if (nl < 0) { unstaged.push(file); break; }
    const headerLine = stdout.subarray(cursor, nl).toString('utf8');
    const m = /^([0-9a-f]{40})\s+blob\s+(\d+)$/.exec(headerLine);
    if (!m) { unstaged.push(file); cursor = nl + 1; continue; }
    const size = Number(m[2]);
    const body = stdout.subarray(nl + 1, nl + 1 + size);
    staged.set(file, createHash('sha256').update(body).digest('hex'));
    cursor = nl + 1 + size + 1;
  }

  record('MANIFEST/every_row_is_staged', unstaged.length === 0,
    unstaged.length ? `not in the index (run git add): ${unstaged.join(', ')}` : '');

  const stagedMismatch = [...staged.entries()]
    .filter(([file, hash]) => declared.rows.get(file) !== hash)
    .map(([file]) => file);
  record('MANIFEST/staged_blob_bytes_match_the_manifest', stagedMismatch.length === 0,
    stagedMismatch.length ? `staged content differs from the manifest row for: ${stagedMismatch.join(', ')}` : '');

  // And the working tree, canonicalised, has to be the same content as the index. If it is
  // not, the manifest above describes an emit of content that is not the content being
  // committed, and the two checks would agree with each other while both being wrong.
  const worktreeMismatch = files.filter((file) => {
    const staged1 = staged.get(file);
    if (!staged1) return false;
    return createHash('sha256').update(canonicalBytes(readFileSync(join(ENGINE, file)))).digest('hex') !== staged1;
  });
  record('MANIFEST/index_matches_the_working_tree', worktreeMismatch.length === 0,
    worktreeMismatch.length ? `unstaged edits in: ${worktreeMismatch.join(', ')}` : '');
}

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'manifest_blob_integrity',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  file_count: built.rows.length,
  byte_basis: BYTE_BASIS,
  blob_identity_verified: built.blobIdentityChecked && built.drift.length === 0,
  verification_strength: 'deterministic_against_git_object_bytes',
  honest_limits: [
    'this proves the manifest describes the staged bytes; it says nothing about whether those bytes are correct',
    'a manifest and a checkout that are wrong in the same way are not distinguishable here',
  ],
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
