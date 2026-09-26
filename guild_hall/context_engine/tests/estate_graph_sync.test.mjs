// The pass that keeps the unified database level with custody, tested where it
// decides things: what changed in the grant, which items a pass stops offering,
// what "completed" is allowed to mean, and what happens to a judged relation
// whose evidence moved. The parts that talk to a store, a model or a database are
// exercised by the harness's own runs; these are the rules underneath them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAPH_SYNC_CANDIDATE_SCHEMA, GRAPH_SYNC_PENDING_SCHEMA, GRAPH_SYNC_PREFLIGHT_DIR,
  GRAPH_SYNC_PREFLIGHT_RECEIPT_SCHEMA, SYNC_LIMITS, aliasAddressFor, clearCompleted,
  SYNC_LOCK_MAX_AGE_HOURS, acquireSyncPassLock, grantDifference, holdBack, nextGenerationId, readLedger, recordIndexOutcome,
  refreshCandidates, reofferFailed, reofferFailedItems, rejectionDiagnostic, syncProject } from '../harness/estate_graph_sync.mjs';
import { INDEX_FS_KEY, INDEX_PROJECT, makeGraphIndexStore } from '../harness/fixtures/graph_index_fixture.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readRootTable, ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';

const NOW = '2026-09-14T00:00:00.000Z';
const sha256Of = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const grant = sources => ({ sources });
const items = (root, ids) => ({ root_ref: root, items: ids.map(id => ({ item_id: id })) });

test('a grant difference says what arrived, what custody no longer holds, and what a narrowed admission took away', () => {
  const before = grant([items('linear.custody', ['a', 'b']), items('slack.channel', ['1.1', '2.2']),
    items('mail.hiworks.company', ['m1'])]);
  // custody gained a Linear issue, lost a Slack message, and the admission stopped
  // naming the mail root at all -- which reaches this side as an absent source.
  const after = grant([items('linear.custody', ['a', 'b', 'c']), items('slack.channel', ['1.1'])]);
  const difference = grantDifference(before, after);
  assert.deepEqual(difference.added, [{ root_ref: 'linear.custody', item_id: 'c' }]);
  assert.deepEqual(difference.removed, [{ root_ref: 'mail.hiworks.company', item_id: 'm1' },
    { root_ref: 'slack.channel', item_id: '2.2' }]);
  assert.equal(difference.changed, true);
  assert.equal(grantDifference(before, before).changed, false, 'nothing new is not a change');
});

test('the next generation id follows this project\u2019s own numbering and ignores everything else', () => {
  assert.equal(nextGenerationId('p26014-graph', []), 'p26014-graph-001');
  assert.equal(nextGenerationId('p26014-graph', ['p26014-graph-001', 'p26014-graph-002']), 'p26014-graph-003');
  assert.equal(nextGenerationId('p26014-graph', ['p26014-graph-007', 'p24049-graph-099', 'other']), 'p26014-graph-008',
    'another project\u2019s generations in the same store do not move this one\u2019s number');
  assert.equal(nextGenerationId('p26014-graph', ['p26014-graph-1']), 'p26014-graph-001', 'only the three-digit form counts');
});

test('an item a pass could not get in is offered again next time, and stops being offered after a bound', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ctx-sync-ledger-'));
  let ledger = readLedger(dir, 'P26-014');
  assert.deepEqual([ledger.schema_version, Object.keys(ledger.items).length], [GRAPH_SYNC_PENDING_SCHEMA, 0],
    'no ledger is an empty ledger, not a failure');

  const row = { root_ref: 'mail.hiworks.company', item_id: 'm1', code: 'extraction_refused', now: NOW };
  for (let pass = 1; pass < SYNC_LIMITS.item_attempts; pass++) {
    const state = holdBack(ledger, row);
    assert.deepEqual([state.attempts, state.state], [pass, 'pending'],
      'while it is still being retried the item is pending, with the code that held it');
  }
  const last = holdBack(ledger, row);
  assert.deepEqual([last.attempts, last.state, last.code], [SYNC_LIMITS.item_attempts, 'failed', 'extraction_refused']);
  assert.equal(last.first_seen, NOW, 'when it first failed is kept');

  // Getting in clears it. Nothing else is touched.
  ledger = holdBack(ledger, { ...row, item_id: 'm2' }) && ledger;
  clearCompleted(ledger, [{ root_ref: 'mail.hiworks.company', item_id: 'm1' }]);
  assert.deepEqual(Object.keys(ledger.items), ['mail.hiworks.company|m2']);

  // A ledger written by this pass reads back as the same ledger.
  await writeFile(path.join(dir, 'pending.json'), `${JSON.stringify({ ...ledger, updated_at: NOW }, null, 2)}\n`);
  assert.deepEqual(readLedger(dir, 'P26-014').items, ledger.items);
  assert.deepEqual(readLedger(dir, 'P24-049').items, {}, 'a ledger belongs to the project it names');
  // A file that is not a ledger is not read as one.
  await writeFile(path.join(dir, 'pending.json'), '{"items": {"x|y": {}}}');
  assert.deepEqual(readLedger(dir, 'P26-014').items, {});
});

test('a judged relation is never applied by a pass, and goes stale when the unit it quoted moved', () => {
  const candidate = { judgement_id: 'sha256:' + 'd'.repeat(64), relation_kind: 'condition_material_for',
    direction: 'a_to_b', a: { item_id: 'SON-41', unit_id: 'u0001', doc_key: 'sha256:' + '1'.repeat(64) },
    b: { item_id: '1785902897.750169', unit_id: 'u0000', doc_key: 'sha256:' + '2'.repeat(64) } };
  const manifest = { generation_id: 'p26014-graph-002', documents: [
    { item_id: 'SON-41', doc_key: 'sha256:' + '1'.repeat(64) },
    { item_id: '1785902897.750169', doc_key: 'sha256:' + '2'.repeat(64) }] };
  const held = { schema_version: GRAPH_SYNC_CANDIDATE_SCHEMA, project_code: 'P26-014', approved: [], candidates: [candidate] };

  const same = refreshCandidates({ held, project: 'P26-014', manifest, now: NOW });
  assert.deepEqual(same.counts, { candidates: 1, stale: 0, approved: 0, applied_by_this_pass: 0 });
  assert.equal(same.body.candidates[0].review_state, 'candidate');

  // The Slack message was edited: its document key moved, so the judgement was
  // made about text this generation no longer holds.
  const moved = { ...manifest, documents: [manifest.documents[0], { item_id: '1785902897.750169', doc_key: 'sha256:' + '9'.repeat(64) }] };
  const stale = refreshCandidates({ held, project: 'P26-014', manifest: moved, now: NOW });
  assert.deepEqual([stale.counts.candidates, stale.counts.stale], [0, 1]);
  assert.deepEqual([stale.body.candidates[0].review_state, stale.body.candidates[0].stale_reason,
    stale.body.candidates[0].marked_stale_at], ['stale', 'b:revision_changed', NOW]);

  // The item left the grant entirely: also stale, and said differently.
  const gone = { ...manifest, documents: [manifest.documents[0]] };
  assert.equal(refreshCandidates({ held, project: 'P26-014', manifest: gone, now: NOW })
    .body.candidates[0].stale_reason, 'b:not_in_generation');

  // Approval is a person's field: a pass reads it and writes it back untouched.
  const approved = { ...held, approved: [{ judgement_id: candidate.judgement_id, approved_by: 'actor:owner' }] };
  const kept = refreshCandidates({ held: approved, project: 'P26-014', manifest, now: NOW });
  assert.deepEqual(kept.body.approved, approved.approved);
  assert.equal(kept.counts.applied_by_this_pass, 0, 'a pass applies none of them, approved or not');
  // A file that is not a candidate file starts an empty one rather than being read.
  assert.deepEqual(refreshCandidates({ held: { candidates: 'not a list' }, project: 'P26-014', manifest, now: NOW })
    .body.candidates, []);
});

test('an absolute source root becomes the alias address of the root table that holds it, or nothing', () => {
  // The path shapes are built rather than written: a Windows absolute path in a
  // tracked file is a host address, and this test is about the rule, not a host.
  const sep = String.fromCharCode(92);
  const win = (...parts) => parts.join(sep);
  const drive = `${String.fromCharCode(68)}:`;
  const data = win(drive, 'Soulforge-data'), control = win(drive, 'Soulforge-control');
  const table = { roots: { data_root: data, control_root: control } };
  assert.equal(aliasAddressFor(table, win(data, 'ingress', 'slack', 'channels', 'P26-014')),
    'data_root/ingress/slack/channels/P26-014');
  assert.equal(aliasAddressFor(table, data), 'data_root');
  assert.equal(aliasAddressFor(table, `${data}${sep}`), 'data_root');
  assert.equal(aliasAddressFor(table, win(drive, 'Elsewhere', 'ingress')), null,
    'a root the table does not hold has no address, and is reported rather than guessed at');
  assert.equal(aliasAddressFor(table, win(`${data}-other`, 'x')), null, 'a prefix is not a parent');
});

// --------------------------------------------------------------------------
// A pass that refuses to start still says why, in a receipt.
//
// Before this, every abort BEFORE the project loop -- a stale mail attribution
// index, an index the lane cannot read, a root table that no longer hashes to
// its pin -- printed one line to stderr and exited 2, writing nothing. The
// night chain and every watcher read RECEIPTS, so the reason was lost the
// moment the scheduled run's console went away. These tests run the real
// harness as a real child process (the abort lives in `main()`, which only
// exists there) over synthetic roots under `os.tmpdir()`; none of them reach a
// store, a model or a database.
const HARNESS = fileURLToPath(new URL('../harness/estate_graph_sync.mjs', import.meta.url));
const digestOf = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** A synthetic root table over empty tmp roots, plus its own pin. */
async function syntheticRoots(label) {
  const base = await mkdtemp(path.join(os.tmpdir(), `ctx-sync-preflight-${label}-`));
  const roots = {};
  for (const alias of ['source_checkout', 'runtime_root', 'data_root', 'control_root', 'project_work_root']) {
    roots[alias] = path.join(base, alias);
    await mkdir(roots[alias], { recursive: true });
  }
  const tablePath = path.join(base, 'root_table.json');
  const bytes = Buffer.from(`${JSON.stringify({ schema_version: 'soulforge.physical_root_table.v0', roots }, null, 2)}\n`);
  await writeFile(tablePath, bytes);
  return { base, roots, tablePath, tableSha256: digestOf(bytes) };
}

/** A well-formed mail attribution index whose only fault is its age. */
async function writeStaleAttributionIndex(controlRoot, builtAt) {
  const withoutTime = {
    schema_version: 'soulforge.mail_attribution_index.v1',
    inputs: { org_config_sha256: `sha256:${'0'.repeat(64)}`, owner_tables: [], owner_tables_missing: [] },
    counts: { records: 0, attributed: 0, confirmed: 0, unconfirmed: 0, held_two_projects: 0,
      not_attributed: 0, by_project: {} },
    attributions: [],
  };
  const body = { ...withoutTime, built_at: builtAt,
    content_sha256: digestOf(Buffer.from(JSON.stringify(withoutTime), 'utf8')) };
  const dir = path.join(controlRoot, 'mail-routes');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'mail_attribution_index.json'), `${JSON.stringify(body, null, 2)}\n`);
}

function runHarness(args) {
  const result = spawnSync(process.execPath, [HARNESS, ...args], { encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** The one preflight receipt, read back from `<receipts>/_preflight/`. */
async function readPreflightReceipt(receiptsDir) {
  const names = (await readdir(path.join(receiptsDir, GRAPH_SYNC_PREFLIGHT_DIR)))
    .filter(name => name.endsWith('.json'));
  assert.equal(names.length, 1, 'a refused pass writes exactly one preflight receipt');
  return JSON.parse(await readFile(path.join(receiptsDir, GRAPH_SYNC_PREFLIGHT_DIR, names[0]), 'utf8'));
}

test('a mail attribution index too old to use leaves a receipt saying so, not just a dead exit code', async () => {
  const { base, roots, tablePath, tableSha256 } = await syntheticRoots('stale');
  await writeStaleAttributionIndex(roots.control_root, '2020-01-01T00:00:00.000Z');
  const receipts = path.join(base, 'receipts');
  const run = runHarness(['--root-table', tablePath, '--root-table-sha256', tableSha256,
    '--receipts', receipts, '--projects', 'P00-001', '--mail-attribution', '--mail-attribution-max-age', '36']);
  assert.equal(run.code, 2, 'the exit code the caller already relied on is unchanged');
  assert.match(run.stderr, /mail_attribution_index_stale/);
  const receipt = await readPreflightReceipt(receipts);
  assert.equal(receipt.schema_version, GRAPH_SYNC_PREFLIGHT_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'FAILED');
  assert.equal(receipt.stage, 'preflight');
  assert.equal(receipt.reason, 'mail_attribution_index_stale',
    'what a watcher needs is the code, not a prose line nobody kept');
  assert.deepEqual(receipt.projects, [], 'no project was attempted, and the receipt says so rather than omitting it');
  assert.ok(Date.parse(receipt.started_at) <= Date.parse(receipt.ended_at));
});

test('an index the lane cannot read at all leaves the same receipt', async () => {
  const { base, tablePath, tableSha256 } = await syntheticRoots('unavailable');
  // No index file was ever written under control_root/mail-routes/.
  const receipts = path.join(base, 'receipts');
  const run = runHarness(['--root-table', tablePath, '--root-table-sha256', tableSha256,
    '--receipts', receipts, '--projects', 'P00-001', '--mail-attribution']);
  assert.equal(run.code, 2);
  const receipt = await readPreflightReceipt(receipts);
  assert.equal(receipt.status, 'FAILED');
  assert.equal(receipt.reason, 'mail_attribution_index_unavailable');
  assert.deepEqual(receipt.projects, []);
});

test('a root table that no longer hashes to its pin leaves a receipt before anything else is read', async () => {
  const { base, tablePath } = await syntheticRoots('pin');
  const receipts = path.join(base, 'receipts');
  const run = runHarness(['--root-table', tablePath, '--root-table-sha256', `sha256:${'0'.repeat(64)}`,
    '--receipts', receipts, '--projects', 'P00-001']);
  assert.equal(run.code, 2);
  assert.match(run.stderr, /root_table_pin_mismatch/);
  assert.equal((await readPreflightReceipt(receipts)).reason, 'root_table_pin_mismatch');
});

test('--dry still writes nothing: a dry refusal must not drop a FAILED receipt on a real receipts directory', async () => {
  const { base, roots, tablePath, tableSha256 } = await syntheticRoots('dry');
  await writeStaleAttributionIndex(roots.control_root, '2020-01-01T00:00:00.000Z');
  const receipts = path.join(base, 'receipts');
  const run = runHarness(['--root-table', tablePath, '--root-table-sha256', tableSha256,
    '--receipts', receipts, '--projects', 'P00-001', '--mail-attribution',
    '--mail-attribution-max-age', '36', '--dry']);
  assert.equal(run.code, 2);
  assert.equal(existsSync(receipts), false,
    'the registrar preflights with --dry against the REAL receipts directory; it must stay untouched');
});

test('a receipts directory that cannot be written loses the receipt, never the exit code', async () => {
  const { base, roots, tablePath, tableSha256 } = await syntheticRoots('unwritable');
  await writeStaleAttributionIndex(roots.control_root, '2020-01-01T00:00:00.000Z');
  // `--receipts` pointing at a FILE: `mkdir <file>/_preflight` fails the same
  // way on every platform this runs on, with no ACL games.
  const receipts = path.join(base, 'receipts-is-a-file');
  await writeFile(receipts, 'not a directory\n');
  const run = runHarness(['--root-table', tablePath, '--root-table-sha256', tableSha256,
    '--receipts', receipts, '--projects', 'P00-001', '--mail-attribution', '--mail-attribution-max-age', '36']);
  assert.equal(run.code, 2, 'the real reason still reaches the caller as exit 2');
  assert.match(run.stderr, /graph_sync_preflight_receipt_unwritable/,
    'the recorder says it could not record, on its own line');
  assert.match(run.stderr, /mail_attribution_index_stale/,
    'and the original reason is still printed, never replaced by the recorder’s own failure');
  assert.equal(readFileSync(receipts, 'utf8'), 'not a directory\n', 'and nothing clobbered the path it was given');
});

test('a preflight receipt can never be mistaken for, or collide with, a project’s own', () => {
  // `_preflight` is one segment deep, so a two-segment receipt glob (the night
  // chain example's `*/*.json` for this lane) FINDS it and reads `FAILED`
  // rather than finding nothing at all -- and this harness's own PROJECT_CODE
  // forbids a leading underscore, so no project directory can be named this.
  assert.equal(GRAPH_SYNC_PREFLIGHT_DIR, '_preflight');
  assert.equal(/^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u.test(GRAPH_SYNC_PREFLIGHT_DIR), false);
  assert.notEqual(GRAPH_SYNC_PREFLIGHT_RECEIPT_SCHEMA, GRAPH_SYNC_PENDING_SCHEMA);
});

// A pass that finds the project locked must leave the run configuration exactly as
// it found it: the grant files, the binding the running pass pinned by digest, and
// the ledger. Synthetic estate: the graph index fixture's store under a root table.
test('a pass that finds either lock held writes no grant, no binding and no ledger, and names the holder', async () => {
  const store = await makeGraphIndexStore();
  const dataRoot = realpathSync(path.join(store.storeRoot, 'data_root'));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-sync-lock-control-')));
  const tablePath = path.join(controlRoot, 'root_table.json');
  await writeFile(tablePath, `${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  const rootTable = readRootTable({ tablePath, expectedSha256: sha256Of(await readFile(tablePath)) });
  const io = createAliasedStoreIo(rootTable);
  const project = INDEX_FS_KEY;
  const admission = await store.put(`${INDEX_PROJECT}/00_프로젝트_안내/admission.synthetic.json`,
    { admission_id: 'admission.synthetic', source_refs: [] });
  const bindingFile = path.join(controlRoot, 'project-bindings', project, 'graph_index_binding.unified.json');
  await mkdir(path.dirname(bindingFile), { recursive: true });
  await writeFile(bindingFile, JSON.stringify({ ...store.binding, admission }));
  const before = await readFile(bindingFile);
  const grantsDir = path.join(store.storeRoot, INDEX_PROJECT, '00_프로젝트_안내', 'grants');
  const grantsBefore = (await readdir(grantsDir)).sort();
  const receiptsDir = path.join(controlRoot, 'receipts', project);
  const indexLock = path.join(store.storeRoot, INDEX_PROJECT, '00_프로젝트_안내', 'graph_index.lock');
  const passLock = path.join(store.storeRoot, INDEX_PROJECT, '00_프로젝트_안내', 'graph_sync.lock');

  for (const [file, heldBy] of [[indexLock, 'graph_index'], [passLock, 'graph_sync']]) {
    await writeFile(file, JSON.stringify({ lock_id: 'another', pid: process.pid, started_at: NOW }));
    const result = await syncProject({ io, rootTable, project, receiptsDir, now: NOW });
    assert.deepEqual({ status: result.status, code: result.code, lock: result.lock },
      { status: 'HOLD', code: 'graph_index_locked', lock: { held_by: heldBy, holder: { pid: process.pid, started_at: NOW }, reclaimed: [] } });
    assert.ok((await readFile(bindingFile)).equals(before), 'the binding the running pass pinned is untouched');
    assert.deepEqual((await readdir(grantsDir)).sort(), grantsBefore, 'no grant was placed');
    assert.equal(existsSync(receiptsDir), false, 'no ledger, candidate file or binding copy was written');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).lock_id, 'another', 'a foreign lock is never removed');
    assert.equal(existsSync(passLock) && file !== passLock, false, 'a refused pass leaves no lock of its own');
    await rm(file);
  }

  // Free: the pass lock is taken create-only and released only by its own holder.
  const taken = acquireSyncPassLock({ io, storePath: INDEX_PROJECT, now: NOW });
  assert.equal(taken.held, false);
  assert.equal(acquireSyncPassLock({ io, storePath: INDEX_PROJECT, now: NOW }).held_by, 'graph_sync');
  taken.release();
  assert.equal(existsSync(passLock), false);
  const again = acquireSyncPassLock({ io, storePath: INDEX_PROJECT, now: NOW });
  await writeFile(passLock, 'replaced by hand');
  again.release();
  assert.equal(await readFile(passLock, 'utf8'), 'replaced by hand', 'a lock that is no longer ours is left alone');
});

test('a receipt says why documents were left out, counted by the shape of the refusal, bounded and without text', () => {
  const shape = { parsed: false, error_type: 'ValidationError', parse_error_type: 'JSONDecodeError', skeleton: '_ ```_ {"nodes": [' };
  const excluded = Array.from({ length: 30 }, (_, index) => ({ doc_key: 'sha256:' + String(index % 10).repeat(64),
    source_kind: 'mail', root_ref: 'mail.synthetic', item_id: `m${index}`, reason: index % 3 ? 'extraction_refused' : 'extraction_truncated',
    calls: [{ call: 1, status: 'invalid_output', done_reason: 'stop', error_type: null, http_status: null, output_characters: 42 }],
    rejected_shapes: index % 3 ? [shape] : [] }));
  const diagnostic = rejectionDiagnostic({ status: 'COMMITTED', excluded });
  assert.deepEqual({ excluded: diagnostic.excluded, reasons: diagnostic.reasons, listed: diagnostic.documents.length,
    documents_listed: diagnostic.documents_listed },
  { excluded: 30, reasons: { extraction_truncated: 10, extraction_refused: 20 }, listed: 20, documents_listed: 20 });
  assert.deepEqual(diagnostic.shape_kinds, [{ parsed: false, error_type: 'ValidationError', parse_error_type: 'JSONDecodeError',
    top_level_type: null, unknown_top_level_key_names: [], count: 20, example_skeleton: shape.skeleton }]);
  assert.equal(rejectionDiagnostic({ status: 'COMMITTED', excluded: [] }), null, 'nothing left out, nothing to say');
  assert.equal(rejectionDiagnostic(null), null);
});

// The same synthetic estate as above, for the tests below.
async function syncEstate() {
  const store = await makeGraphIndexStore();
  const dataRoot = realpathSync(path.join(store.storeRoot, 'data_root'));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-sync-estate-control-')));
  const tablePath = path.join(controlRoot, 'root_table.json');
  await writeFile(tablePath, `${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  const rootTable = readRootTable({ tablePath, expectedSha256: sha256Of(await readFile(tablePath)) });
  const io = createAliasedStoreIo(rootTable);
  const admission = await store.put(`${INDEX_PROJECT}/00_프로젝트_안내/admission.synthetic.json`,
    { admission_id: 'admission.synthetic', source_refs: [] });
  const bindingFile = path.join(controlRoot, 'project-bindings', INDEX_FS_KEY, 'graph_index_binding.unified.json');
  await mkdir(path.dirname(bindingFile), { recursive: true });
  await writeFile(bindingFile, JSON.stringify({ ...store.binding, admission }));
  const guide = path.join(store.storeRoot, INDEX_PROJECT, '00_프로젝트_안내');
  return { store, io, rootTable, bindingFile, controlRoot, guide, receiptsDir: path.join(controlRoot, 'receipts', INDEX_FS_KEY),
    passLock: path.join(guide, 'graph_sync.lock'), indexLock: path.join(guide, 'graph_index.lock') };
}
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

test('a stale lock -- its process gone, or older than the age bound -- is renamed aside and taken; a live one is not', async () => {
  const estate = await syncEstate();
  const take = now => acquireSyncPassLock({ io: estate.io, storePath: INDEX_PROJECT, now });
  const later = new Date(Date.parse(NOW) + (SYNC_LOCK_MAX_AGE_HOURS + 1) * 3600 * 1000).toISOString();

  await writeFile(estate.passLock, JSON.stringify({ lock_id: 'crashed', pid: deadPid(), started_at: NOW }));
  const afterCrash = take(NOW);
  assert.equal(afterCrash.held, false);
  assert.deepEqual(afterCrash.reclaimed.map(row => [row.lock, row.reason]), [['graph_sync.lock', 'owner_process_gone']]);
  const aside = path.join(estate.guide, afterCrash.reclaimed[0].kept_as);
  assert.equal(JSON.parse(await readFile(aside, 'utf8')).lock_id, 'crashed', 'the stale lock is kept aside, not deleted');
  assert.notEqual(JSON.parse(await readFile(estate.passLock, 'utf8')).lock_id, 'crashed', 'the new lock is this pass’s');
  afterCrash.release();

  // A live process younger than the bound keeps its lock; past the bound it is stuck.
  await writeFile(estate.passLock, JSON.stringify({ lock_id: 'live', pid: process.pid, started_at: NOW }));
  assert.deepEqual({ held: take(NOW).held, by: take(NOW).held_by }, { held: true, by: 'graph_sync' });
  const stuck = take(later);
  assert.deepEqual(stuck.reclaimed.map(row => row.reason), ['older_than_max_age']);
  stuck.release();

  // The index writer's lock is reclaimed by the same rule, only under the pass lock.
  await writeFile(estate.indexLock, JSON.stringify({ lock_id: 'index-crashed', pid: deadPid(), started_at: NOW }));
  const index = take(NOW);
  assert.deepEqual({ held: index.held, reclaimed: index.reclaimed.map(row => row.lock) }, { held: false, reclaimed: ['graph_index.lock'] });
  assert.equal(existsSync(estate.indexLock), false);
  index.release();
  await writeFile(estate.indexLock, JSON.stringify({ lock_id: 'index-live', pid: process.pid, started_at: NOW }));
  const blocked = take(NOW);
  assert.deepEqual({ held: blocked.held, by: blocked.held_by }, { held: true, by: 'graph_index' });
  assert.equal(existsSync(estate.passLock), false, 'a refused pass leaves no lock of its own');
  await rm(estate.indexLock);
});

test('a binding that moved while the pass read its scope is not overwritten by the stale copy', async () => {
  const estate = await syncEstate();
  const newer = Buffer.from(JSON.stringify({ ...JSON.parse(await readFile(estate.bindingFile, 'utf8')), note: 'newer' }));
  const result = await syncProject({ io: estate.io, rootTable: estate.rootTable, project: INDEX_FS_KEY, receiptsDir: estate.receiptsDir,
    now: NOW, hooks: { beforeLock: () => writeFile(estate.bindingFile, newer) } });
  assert.deepEqual({ status: result.status, code: result.code }, { status: 'HOLD', code: 'graph_sync_binding_changed' });
  assert.ok((await readFile(estate.bindingFile)).equals(newer), 'the newer binding stands');
  assert.equal(existsSync(estate.receiptsDir), false, 'nothing else was written');
  assert.equal(existsSync(estate.passLock), false, 'the pass lock was released');
});

test('a document left out three passes running stops being offered, and is offered again on request or on a new model revision', async () => {
  const ledger = readLedger(await mkdtemp(path.join(os.tmpdir(), 'ctx-sync-exclude-')), 'P26-014');
  const excluded = [{ root_ref: 'mail.synthetic', item_id: 'm1', reason: 'extraction_refused' }];
  const pass = revision => recordIndexOutcome(ledger, { now: NOW,
    updated: { status: 'COMMITTED', excluded, model_revision_sha256: revision } });
  const states = [];
  for (let run = 0; run < SYNC_LIMITS.item_attempts; run++) states.push(pass('sha256:' + 'a'.repeat(64)).rows[0].state);
  assert.deepEqual(states, ['pending', 'pending', 'failed']);
  assert.equal(ledger.items['mail.synthetic|m1'].code, 'extraction_refused');
  // A HOLD pass does not count an attempt; an unchanged revision re-offers nothing.
  assert.deepEqual(recordIndexOutcome(ledger, { now: NOW, updated: { status: 'HOLD', excluded, model_revision_sha256: 'sha256:' + 'a'.repeat(64) } }),
    { rows: [], reoffered: 0 });
  assert.equal(ledger.items['mail.synthetic|m1'].attempts, SYNC_LIMITS.item_attempts);
  // An unreadable source is not something a new model can cure.
  holdBack(ledger, { root_ref: 'mail.synthetic', item_id: 'm2', code: 'unreadable', now: NOW });
  ledger.items['mail.synthetic|m2'].state = 'failed';
  const moved = recordIndexOutcome(ledger, { now: NOW, updated: { status: 'HOLD', model_revision_sha256: 'sha256:' + 'b'.repeat(64) } });
  assert.equal(moved.reoffered, 1);
  assert.deepEqual([ledger.items['mail.synthetic|m1'].state, ledger.items['mail.synthetic|m1'].attempts,
    ledger.items['mail.synthetic|m1'].reoffer_reason, ledger.items['mail.synthetic|m2'].state],
  ['pending', 0, 'extraction_revision_changed', 'failed']);
  assert.equal(reofferFailed(ledger, { selector: ['m2'], now: NOW, reason: 'owner_retry_failed' }), 1);
  assert.equal(reofferFailed(ledger, { selector: 'all', now: NOW, reason: 'owner_retry_failed' }), 0, 'nothing is failed any more');
});

test('--retry-failed re-offers in the ledger only, under the pass lock', async () => {
  const estate = await syncEstate();
  const ledger = readLedger(estate.receiptsDir, INDEX_FS_KEY);
  for (let run = 0; run < SYNC_LIMITS.item_attempts; run++) {
    holdBack(ledger, { root_ref: 'mail.synthetic', item_id: 'm1', code: 'extraction_refused', now: NOW });
  }
  await mkdir(estate.receiptsDir, { recursive: true });
  await writeFile(path.join(estate.receiptsDir, 'pending.json'), JSON.stringify({ ...ledger, updated_at: NOW }));
  const before = await readFile(path.join(estate.receiptsDir, 'pending.json'));
  await writeFile(estate.passLock, JSON.stringify({ lock_id: 'live', pid: process.pid, started_at: NOW }));
  const held = reofferFailedItems({ io: estate.io, project: INDEX_FS_KEY, receiptsDir: estate.receiptsDir, selector: 'all', now: NOW });
  assert.deepEqual({ status: held.status, code: held.code }, { status: 'HOLD', code: 'graph_index_locked' });
  assert.ok((await readFile(path.join(estate.receiptsDir, 'pending.json'))).equals(before), 'a running pass’s ledger is not raced');
  await rm(estate.passLock);
  const done = reofferFailedItems({ io: estate.io, project: INDEX_FS_KEY, receiptsDir: estate.receiptsDir,
    selector: ['mail.synthetic|m1'], now: NOW });
  assert.deepEqual(done, { project_code: INDEX_FS_KEY, status: 'REOFFERED', count: 1 });
  assert.equal(readLedger(estate.receiptsDir, INDEX_FS_KEY).items['mail.synthetic|m1'].state, 'pending');
  assert.equal(existsSync(estate.passLock), false);
});
