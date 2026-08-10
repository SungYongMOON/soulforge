// Conformance for the consumer-facing output contract.
//
// The consumer of these artifacts is a different codebase written by a different author, so the
// properties that matter are the ones that stop it from being wired to an accident:
//
//   the location comes from a pointer, never from where the engine happened to run
//   a malformed pointer resolves to nothing, never to a guess
//   absence is a value, so a fresh checkout renders "no evidence" instead of failing
//   each artifact states what it proves and what it does not

import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POINTER_SCHEMA, INDEX_SCHEMA, POINTER_RELATIVE_PATH, DEFAULT_OUTPUT_ROOT_RELATIVE,
  OUTPUT_ARTIFACTS, resolveOutputRoot, writePointer, pointerPath,
} from '../tools/output_binding.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');
const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const SCRATCH = arg('--scratch');

// ---------------------------------------------------------------- the declared contract

record('OUT/pointer_path_is_repository_relative',
  !POINTER_RELATIVE_PATH.includes(':') && !POINTER_RELATIVE_PATH.startsWith('/') && POINTER_RELATIVE_PATH.startsWith('guild_hall/'),
  'a consumer hardcodes this, so it must survive a merge and mean the same in any checkout');
record('OUT/pointer_schema_is_versioned', POINTER_SCHEMA.endsWith('.v1'));
record('OUT/index_schema_is_versioned', INDEX_SCHEMA.endsWith('.v1'));
record('OUT/default_root_declared', typeof DEFAULT_OUTPUT_ROOT_RELATIVE === 'string' && DEFAULT_OUTPUT_ROOT_RELATIVE.length > 0,
  'a fresh checkout with no pointer still has a defined answer');

record('OUT/every_artifact_states_its_worth',
  OUTPUT_ARTIFACTS.length >= 4 && OUTPUT_ARTIFACTS.every((a) => typeof a.proves === 'string' && typeof a.does_not_prove === 'string'),
  'a display must not be able to upgrade a weak observation by accident');
record('OUT/tracked_status_is_explicit',
  OUTPUT_ARTIFACTS.every((a) => typeof a.tracked_in_repo === 'boolean'),
  'the consumer has to know which artifacts survive a clone');
record('OUT/observations_are_not_tracked',
  OUTPUT_ARTIFACTS.filter((a) => !a.tracked_in_repo).length === 3,
  'measurements of one host stay host-local');
record('OUT/tracked_artifact_names_its_repo_path',
  OUTPUT_ARTIFACTS.filter((a) => a.tracked_in_repo).every((a) => typeof a.repo_relative_path === 'string'));

// ---------------------------------------------------------------- resolution is fail-closed

if (!SCRATCH) {
  record('OUT/scratch_required', false, 'pass --scratch <dir> so pointer resolution can be exercised on disk');
} else {
  const root = join(SCRATCH, 'output_contract_conformance');
  const stateDir = join(root, 'guild_hall', 'state', 'engineering_engine');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });
  const target = pointerPath(root);

  record('OUT/no_pointer_falls_back_to_the_declared_default',
    resolveOutputRoot({ repoRoot: root }).source === 'default_no_pointer');

  for (const [label, contents, expected] of [
    ['unparseable', '{ not json', 'pointer_unreadable'],
    ['wrong_schema', JSON.stringify({ schema_version: 'something_else', output_root: 'x' }), 'pointer_schema_invalid'],
    ['no_root', JSON.stringify({ schema_version: POINTER_SCHEMA }), 'pointer_root_missing'],
    ['empty_root', JSON.stringify({ schema_version: POINTER_SCHEMA, output_root: '' }), 'pointer_root_missing'],
  ]) {
    writeFileSync(target, contents, 'utf8');
    const r = resolveOutputRoot({ repoRoot: root });
    record(`OUT/fail_closed/${label}`, r.root === null && r.source === expected,
      `a guessed directory would render another run's evidence; got ${r.source}`);
  }

  writePointer({ outputRoot: 'guild_hall/state/engineering_engine', repoRoot: root });
  const good = resolveOutputRoot({ repoRoot: root });
  record('OUT/valid_pointer_resolves', good.root !== null && good.source === 'pointer', 'positive control');
  record('OUT/relative_root_resolves_against_the_repo',
    good.root.includes('output_contract_conformance'),
    'a consumer must get the same answer whatever directory it was launched from');

  writePointer({ outputRoot: join(root, 'elsewhere'), repoRoot: root });
  record('OUT/absolute_root_is_honoured', resolveOutputRoot({ repoRoot: root }).root.endsWith('elsewhere'));

  // ---------------------------------------------------------------- absence renders
  writePointer({ outputRoot: 'guild_hall/state/engineering_engine', repoRoot: root });
  const emitted = spawnSync(process.execPath,
    [join(ENGINE, 'tools', 'emit_output_index.mjs'), '--repo-root', root], { encoding: 'utf8' });
  let index = null;
  try { index = JSON.parse(emitted.stdout); } catch { /* asserted below */ }

  record('OUT/absence_does_not_fail_the_run', emitted.status === 0,
    'a fresh checkout has no observations, and that is not an error');
  record('OUT/absence_is_reported_as_a_value',
    index?.resolved === true && index.absent_count === OUTPUT_ARTIFACTS.length && index.present_count === 0);
  record('OUT/absent_reasons_are_distinguishable',
    new Set((index?.artifacts ?? []).map((a) => a.absent_reason)).size >= 2,
    'a missing tracked file is a different problem from a host that never observed');
  record('OUT/index_is_written_where_the_pointer_says',
    existsSync(join(root, 'guild_hall', 'state', 'engineering_engine', 'engine_outputs.index.json')));
  record('OUT/index_carries_consumer_notes',
    Array.isArray(index?.consumer_notes) && index.consumer_notes.length >= 3);

  // ---------------------------------------------------------------- presence reports evidence
  mkdirSync(join(stateDir, 'runtime'), { recursive: true });
  writeFileSync(join(stateDir, 'runtime', 'receipts.json'),
    JSON.stringify({ 'a>b': { edge_key: 'a>b', observed_at: '2026-08-10T12:00:00.000Z' } }), 'utf8');
  const second = spawnSync(process.execPath,
    [join(ENGINE, 'tools', 'emit_output_index.mjs'), '--repo-root', root], { encoding: 'utf8' });
  const index2 = JSON.parse(second.stdout);
  const receipts = index2.artifacts.find((a) => a.id === 'receipts');
  record('OUT/present_artifact_is_detected', receipts.present === true && receipts.readable === true);
  record('OUT/present_artifact_carries_a_digest', /^[0-9a-f]{64}$/.test(receipts.sha256 ?? ''));
  record('OUT/present_artifact_carries_produced_at', receipts.produced_at === '2026-08-10T12:00:00.000Z',
    'freshness is the consumer\'s judgement, so it needs the instant');
  record('OUT/record_count_reported', receipts.record_count === 1);

  writeFileSync(join(stateDir, 'runtime', 'receipts.json'), '{ broken', 'utf8');
  const third = JSON.parse(spawnSync(process.execPath,
    [join(ENGINE, 'tools', 'emit_output_index.mjs'), '--repo-root', root], { encoding: 'utf8' }).stdout);
  const broken = third.artifacts.find((a) => a.id === 'receipts');
  record('OUT/unparseable_artifact_is_flagged_not_hidden',
    broken.present === true && broken.readable === false && broken.absent_reason === 'artifact_unparseable',
    'a corrupt file must not read as an empty one');

  rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'engine_output_read_contract',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  verification_strength: 'author_written_fixtures',
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);
