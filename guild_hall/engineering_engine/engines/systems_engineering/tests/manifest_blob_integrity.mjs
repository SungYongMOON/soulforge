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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as manifestTool from '../../../tools/emit_manifest.mjs';

const { buildManifest, parseManifest, canonicalBytes, BYTE_BASIS, manifestFilesAt } = manifestTool;

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..', '..', '..');
const MANIFEST_PATH = join(ENGINE, 'topology', 'engine_manifest.sha256');
const RELEASE_EMITTER = join(ENGINE, 'tools', 'emit_release_manifest.mjs');

const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });

const git = (args, opts = {}) => spawnSync('git', args, { cwd: ENGINE, encoding: 'utf8', ...opts });
const gitBytes = (args, opts = {}) => spawnSync('git', args, { cwd: ENGINE, encoding: null, ...opts });

// This allowlist deliberately does not import the emitter's constants or output. It proves the
// committed rows cover the Git index's exact tracked set rather than merely agreeing with the
// emitter's own walk.
const EXPECTED_ROOT_FILES = ['README.md'];
const EXPECTED_DIRS = [
  'core', 'engines', 'kernel', 'assembly', 'subjects', 'evaluation', 'tools', 'tests', 'contracts', 'fixtures', 'topology',
  'mcp', 'stage_rules', 'observation', 'guidance',
];
const EXPECTED_EXCLUDED = new Set([
  'topology/phase_1_integration_receipt.json',
  'topology/engine_manifest.sha256',
  'topology/engine_release.json',
]);
const expectedPath = (file) => file === 'README.md'
  || EXPECTED_DIRS.some((dir) => file.startsWith(`${dir}/`));

const readExpectedIndex = () => {
  const listed = gitBytes(['ls-files', '--cached', '--stage', '-z', '--', ...EXPECTED_ROOT_FILES, ...EXPECTED_DIRS], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0 || listed.error || !Buffer.isBuffer(listed.stdout)
    || listed.stdout.length === 0 || listed.stdout.at(-1) !== 0) {
    throw new Error('could not read a complete NUL-delimited Git index allowlist');
  }
  const entries = new Map();
  for (const row of listed.stdout.subarray(0, -1).toString('utf8').split('\0')) {
    const tab = row.indexOf('\t');
    const match = /^\d+ ([0-9a-f]{40,64}) ([0-3])$/.exec(row.slice(0, tab));
    const file = row.slice(tab + 1);
    if (tab <= 0 || !match || match[2] !== '0' || !expectedPath(file) || entries.has(file)) {
      throw new Error('Git index allowlist is ambiguous or outside the engine manifest scope');
    }
    if (!EXPECTED_EXCLUDED.has(file)) entries.set(file, match[1]);
  }
  if (!entries.has('README.md')) throw new Error('Git index allowlist omitted README.md');
  for (const dir of ['mcp', 'stage_rules', 'observation', 'guidance']) {
    if (![...entries.keys()].some((file) => file.startsWith(`${dir}/`))) {
      throw new Error(`Git index allowlist omitted required root ${dir}/`);
    }
  }
  return entries;
};

const compareRowSet = (rows, expectedFiles) => ({
  missing: expectedFiles.filter((file) => !rows.has(file)),
  extra: [...rows.keys()].filter((file) => !expectedFiles.includes(file)),
});

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
let expectedIndex = new Map();
try {
  expectedIndex = readExpectedIndex();
  record('MANIFEST/index_allowlist_is_nul_delimited_and_unambiguous', true);
} catch (error) {
  record('MANIFEST/index_allowlist_is_nul_delimited_and_unambiguous', false, error.message);
}
const expectedFiles = [...expectedIndex.keys()].sort();

for (const root of ['mcp', 'stage_rules', 'observation', 'guidance']) {
  record(`MANIFEST/required_source_root/${root}`,
    expectedFiles.some((file) => file.startsWith(`${root}/`)),
    `required tracked source root is absent: ${root}/`);
}

const declaredSet = compareRowSet(declared.rows, expectedFiles);
record('MANIFEST/declared_rows_exactly_match_the_index_allowlist',
  declaredSet.missing.length === 0 && declaredSet.extra.length === 0,
  `missing: ${declaredSet.missing.join(', ') || 'none'}; extra: ${declaredSet.extra.join(', ') || 'none'}`);
const freshSet = compareRowSet(fresh.rows, expectedFiles);
record('MANIFEST/fresh_rows_exactly_match_the_index_allowlist',
  freshSet.missing.length === 0 && freshSet.extra.length === 0,
  `missing: ${freshSet.missing.join(', ') || 'none'}; extra: ${freshSet.extra.join(', ') || 'none'}`);

const omittedProbe = new Map(declared.rows);
const omittedTracked = expectedFiles.find((file) => omittedProbe.has(file)) ?? null;
if (omittedTracked !== null) omittedProbe.delete(omittedTracked);
const omittedSet = compareRowSet(omittedProbe, expectedFiles);
record('MANIFEST/harness/tracked_allowed_omission_is_detected',
  omittedTracked !== null && omittedSet.missing.includes(omittedTracked),
  omittedTracked === null ? 'no tracked manifest row was available for the omission control' : omittedTracked);

const firstManifestRow = declaredText.split('\n').find((line) => /^[0-9a-f]{64}\s+/.test(line)) ?? null;
const duplicatedProbe = firstManifestRow === null ? null : parseManifest(`${declaredText}${firstManifestRow}\n`);
record('MANIFEST/harness/duplicate_manifest_row_is_detected',
  duplicatedProbe !== null && Array.isArray(duplicatedProbe.duplicate_paths)
    && duplicatedProbe.duplicate_paths.includes(firstManifestRow.replace(/^[0-9a-f]{64}\s+/, '')),
  firstManifestRow === null ? 'manifest had no data row for duplicate control' : 'duplicate row was not rejected');

let malformedListRefused = false;
if (typeof manifestTool.parseTrackedPathList === 'function') {
  try { manifestTool.parseTrackedPathList(Buffer.from('mcp/unterminated', 'utf8')); } catch { malformedListRefused = true; }
}
record('MANIFEST/truncated_index_list_is_refused', malformedListRefused);

{
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'engine_manifest_index_'));
  try {
    const initialized = spawnSync('git', ['init', '--quiet'], { cwd: fixtureRoot, encoding: 'utf8' });
    for (const dir of ['mcp', 'stage_rules', 'observation', 'guidance']) {
      mkdirSync(join(fixtureRoot, dir), { recursive: true });
      writeFileSync(join(fixtureRoot, dir, 'tracked.mjs'), `// ${dir}\n`, 'utf8');
    }
    writeFileSync(join(fixtureRoot, 'README.md'), '# synthetic engine\n', 'utf8');
    const added = initialized.status === 0
      ? spawnSync('git', ['add', '--', 'README.md', 'mcp', 'stage_rules', 'observation', 'guidance'], { cwd: fixtureRoot, encoding: 'utf8' })
      : null;
    const transientPath = join(fixtureRoot, 'mcp', 'transient', 'not-indexed.txt');
    mkdirSync(dirname(transientPath), { recursive: true });
    writeFileSync(transientPath, 'untracked transient fixture\n', 'utf8');
    const files = typeof manifestFilesAt === 'function' ? manifestFilesAt(fixtureRoot) : null;
    record('MANIFEST/untracked_transient_file_is_excluded',
      added?.status === 0 && Array.isArray(files) && !files.includes('mcp/transient/not-indexed.txt'));
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

{
  const releaseDir = mkdtempSync(join(tmpdir(), 'engine_release_manifest_'));
  const releasePath = join(releaseDir, 'release.json');
  try {
    const emitted = spawnSync(process.execPath, [RELEASE_EMITTER, '--out', releasePath], { cwd: ENGINE, encoding: 'utf8' });
    const release = emitted.status === 0 ? JSON.parse(readFileSync(releasePath, 'utf8')) : null;
    const commit = release?.generated_from_commit ?? null;
    record('RELEASE/generated_from_commit_is_explicit_and_aliases_legacy_git_commit',
      /^[0-9a-f]{40}$/.test(commit ?? '') && release?.git_commit === commit,
      emitted.status === 0 ? '' : 'release emitter did not produce a readable synthetic manifest');

    if (release !== null) {
      const mismatched = { ...release, git_commit: '0'.repeat(40) };
      writeFileSync(releasePath, JSON.stringify(mismatched), 'utf8');
      const mismatchCheck = spawnSync(process.execPath, [RELEASE_EMITTER, '--check', releasePath], { cwd: ENGINE, encoding: 'utf8' });
      record('RELEASE/mismatched_legacy_git_commit_alias_is_refused', mismatchCheck.status !== 0);

      const legacy = { ...release };
      delete legacy.generated_from_commit;
      writeFileSync(releasePath, JSON.stringify(legacy), 'utf8');
      const legacyCheck = spawnSync(process.execPath, [RELEASE_EMITTER, '--check', releasePath], { cwd: ENGINE, encoding: 'utf8' });
      record('RELEASE/legacy_git_commit_only_manifest_remains_checkable', legacyCheck.status === 0);
    }
  } finally {
    rmSync(releaseDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 1. not stale

record('MANIFEST/header/path_base', declared.path_base === 'engine-relative', `declared ${declared.path_base}`);
record('MANIFEST/header/byte_basis', declared.byte_basis === BYTE_BASIS,
  `declared ${declared.byte_basis}, expected ${BYTE_BASIS}`);
record('MANIFEST/header/file_count_matches_rows', declared.file_count === declared.rows.size,
  `header says ${declared.file_count}, ${declared.rows.size} rows present`);
record('MANIFEST/no_duplicate_rows', declared.duplicate_paths.length === 0,
  `${declared.duplicate_paths.length} duplicate manifest row(s)`);

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

// ---------------------------------------------------------------- 4. the topology is not stale
//
// The manifest keeps a committed artifact honest about its own bytes. It cannot say whether
// those bytes are what the code currently produces, and for a *derived* artifact that is the
// question that matters. The topology drifted from its source while the integration check's
// digest comparison still passed, because the emitter hashed a filtered projection in which
// every module and edge entry serialised as `{}` — the drifted field was outside the digest.
//
// So both halves are asserted here, in the suite that owns generated-artifact integrity: the
// committed document has to be byte-equal to a fresh emit, and the digest has to actually cover
// the document rather than a skeleton of it.

{
  const TOPOLOGY_PATH = join(ENGINE, 'topology', 'engine_topology.json');
  const emitted = spawnSync(process.execPath, [join(ENGINE, 'tools', 'emit_topology.mjs')], { cwd: ENGINE, encoding: 'utf8' });
  const committedText = readFileSync(TOPOLOGY_PATH, 'utf8');
  record('TOPOLOGY/fresh_emit_is_byte_equal_to_the_committed_file',
    emitted.status === 0 && emitted.stdout === committedText,
    emitted.status !== 0
      ? `emit failed: ${(emitted.stderr ?? '').slice(0, 200)}`
      : `${emitted.stdout.length} emitted bytes vs ${committedText.length} committed`);

  const topologyBoundary = JSON.parse(committedText);
  const testModules = topologyBoundary.modules
    .map((entry) => entry.module)
    .filter((moduleName) => moduleName.endsWith('.test'));
  record('TOPOLOGY/test_modules_are_excluded_from_engine_code_areas', testModules.length === 0,
    `test modules found in engine topology: ${testModules.join(', ') || 'none'}`);

  // The digest has to move when any part of the document moves. Checked on a field that is
  // nested two levels deep and was provably outside the old digest, because a digest that only
  // covers the top level looks identical to a correct one from the outside.
  let coversNestedFields = false;
  let coversModuleNames = false;
  try {
    const committedTopology = JSON.parse(committedText);
    const digestOf = (doc) => {
      const stable = (v) => {
        if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
        if (v !== null && typeof v === 'object') {
          return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
        }
        return JSON.stringify(v);
      };
      const { topology_digest: _omitted, ...rest } = doc;
      return createHash('sha256').update(stable({ ...rest })).digest('hex');
    };
    const baseline = digestOf(committedTopology);
    const lineCountMoved = JSON.parse(committedText);
    lineCountMoved.modules[0].line_count += 1;
    coversNestedFields = digestOf(lineCountMoved) !== baseline;
    const nameMoved = JSON.parse(committedText);
    nameMoved.modules[0].module = `${nameMoved.modules[0].module}_renamed`;
    coversModuleNames = digestOf(nameMoved) !== baseline;
    record('TOPOLOGY/committed_digest_is_the_whole_document_digest',
      baseline === committedTopology.topology_digest,
      `committed ${String(committedTopology.topology_digest).slice(0, 12)}, recomputed ${baseline.slice(0, 12)}`);
  } catch (e) {
    record('TOPOLOGY/committed_digest_is_the_whole_document_digest', false, `could not recompute: ${e.message}`);
  }
  record('TOPOLOGY/digest_covers_nested_line_counts', coversNestedFields,
    'a line_count change must change the digest; under the old replacer-array form it did not');
  record('TOPOLOGY/digest_covers_module_names', coversModuleNames,
    'renaming a module must change the digest; under the old form every module entry hashed as {}');
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
