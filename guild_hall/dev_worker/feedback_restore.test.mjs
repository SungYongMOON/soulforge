import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createReadboxFixture } from './feedback_readbox_fixture.mjs';
import { openFeedbackDispatch } from './feedback_dispatch.mjs';
import { createFeedbackCycle } from './feedback_cycle.mjs';
import { readRuntimeBytes, readRuntimeJson, writeRuntimeEvidence, runtimeHash as hash } from './feedback_runtime_io.mjs';
import { backupRuntimeDb } from '../../ui-workspace/apps/dev-erp/tools/runtime_ops.mjs';

// Test-only bounded generation assembly. The production exporter and pinned-byte
// reader are reused; this is not a new operational backup/restore service.
function inside(root, relative) {
  assert.ok(relative && !path.isAbsolute(relative));
  const target = path.resolve(root, relative), suffix = path.relative(path.resolve(root), target);
  assert.ok(suffix && !path.isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${path.sep}`));
  return target;
}
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(prefix ? inside(root, prefix) : root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isDirectory()) result.push(...await files(root, relative));
    else { assert.ok(entry.isFile()); result.push(relative); }
  }
  return result.sort();
}
async function treeHashes(root) {
  return Promise.all((await files(root)).map(async relative => ({ relative, sha256: hash(await fs.readFile(inside(root, relative))) })));
}
async function verifyGeneration(root, manifestSha256) {
  const manifest = await readRuntimeJson({ path: path.join(root, 'manifest.json'), sha256: manifestSha256 });
  assert.equal(manifest.generation, 'synthetic.feedback.restore.1');
  assert.equal(new Set(manifest.members.map(item => item.relative)).size, manifest.members.length);
  assert.deepEqual(await files(root), [...manifest.members.map(item => item.relative), 'manifest.json'].sort());
  for (const member of manifest.members) {
    const bytes = await readRuntimeBytes(inside(root, member.relative), member.sha256, 4_000_000);
    assert.equal(bytes.length, member.size);
  }
  return manifest;
}
function observeWal(db, file, baseline) {
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(db.prepare('PRAGMA wal_autocheckpoint').get().wal_autocheckpoint, 0);
  return fs.readFile(`${file}-wal`).then(async wal => {
    assert.equal(hash(await fs.readFile(file)), baseline, 'fresh committed rows remain outside the main DB');
    assert.ok(wal.length > 32);
    assert.ok([0x377f0682, 0x377f0683].includes(wal.readUInt32BE(0)));
    const frame = wal.readUInt32BE(8) + 24;
    assert.equal((wal.length - 32) % frame, 0);
    let commits = 0;
    for (let offset = 32; offset < wal.length; offset += frame) if (wal.readUInt32BE(offset + 4)) commits++;
    assert.ok(commits > 0);
    return hash(wal);
  });
}
function rows(db) {
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map(({ name }) => { assert.match(name, /^[a-z_]+$/u); return [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]; }));
}

test('feedback same-location synthetic protected restore gate', async t => {
  // ASSUMPTIONS: only this owned synthetic namespace is renamed/restored. No
  // production path rebinding, model process, native profile or real send runs.
  const namespace = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-feedback-restore-'));
  const f = await createReadboxFixture(namespace);
  const generation = path.join(namespace, 'generation'), preserved = `${f.root}-preserved`;
  let dispatch, service, complete = false, attempts = 0, passed = 0;
  const gate = (name, run) => t.test(name, async () => { await run(); passed++; });
  const handles = new Set();
  const closeDb = db => { if (handles.delete(db)) db.close(); };
  t.after(async () => {
    dispatch?.close();
    for (const db of handles) db.close();
    if (service) { service.closeAllConnections(); await new Promise(resolve => service.close(resolve)); }
    if (complete) {
      assert.equal(path.dirname(await fs.realpath(namespace)), await fs.realpath(os.tmpdir()));
      assert.ok(path.basename(namespace).startsWith('sf-feedback-restore-'));
      await fs.rm(namespace, { recursive: true, force: true });
    } else t.diagnostic(`Synthetic failure evidence retained: ${namespace}`);
  });
  const candidatePath = path.join(f.root, 'worktrees', `feedback-${hash(f.runRef).slice(0, 24)}`);
  await fs.mkdir(candidatePath, { recursive: true });
  const candidateBytes = Buffer.from('export const syntheticGeneration = 1;\n');
  await fs.writeFile(path.join(candidatePath, 'value.mjs'), candidateBytes, { flag: 'wx' });
  const candidate = { candidate_ref: 'candidate.synthetic', worktree_path: candidatePath,
    files: [{ path: 'value.mjs', sha256: hash(candidateBytes) }] };
  const candidatePin = await writeRuntimeEvidence(f.evidence, 'candidate', candidate.candidate_ref, { candidate });
  service = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    assert.equal(req.url, '/send'); attempts++;
    const read = new DatabaseSync(path.join(f.paths.delivery, 'feedback-dispatch.sqlite'), { readOnly: true });
    try { assert.equal(read.prepare('SELECT state FROM feedback_dispatch WHERE dispatch_ref=?').get(request.dispatch_ref).state, 'DELIVERY_UNKNOWN'); }
    finally { read.close(); }
    // An owned loopback stub loses the response after observing the committed
    // attempt. It has no native transport, external network or message effect.
    req.socket.destroy();
  });
  service.listen(0, '127.0.0.1'); await once(service, 'listening');
  f.config.delivery.native_origin = `http://127.0.0.1:${service.address().port}`;
  await f.reseal(); dispatch = await openFeedbackDispatch(f.options);
  const dbPaths = [f.paths.workerDb, f.paths.watchDb, path.join(f.paths.delivery, 'feedback-dispatch.sqlite')];
  const dbs = dbPaths.map(file => { const db = new DatabaseSync(file); handles.add(db); return db; });
  const baselines = [];
  for (let i = 0; i < dbs.length; i++) {
    dbs[i].exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=0;');
    assert.equal(dbs[i].prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy, 0);
    baselines.push(hash(await fs.readFile(dbPaths[i])));
  }
  dbs[0].prepare('UPDATE dev_feedback_revision SET attempts=2').run();
  dbs[0].prepare("UPDATE dev_feedback_run SET state='execution_unknown',reason='FEEDBACK_INTERRUPTED' WHERE run_ref=?").run(f.heldRunRef);
  dbs[1].prepare('UPDATE dev_feedback_watch_notice SET attempts=2').run();
  const sent = await dispatch.tick();
  assert.equal(sent.length, 3); assert.equal(attempts, 3);
  assert.ok(sent.every(row => row.state === 'DELIVERY_UNKNOWN'));
  const expectedView = await dispatch.snapshot({ limit: 100 }, f.access);
  const expectedRows = dbs.map(rows), logical = [];
  await gate('active WAL exports contain fresh committed runtime, watchdog and UNKNOWN ledger rows', async () => {
    for (let i = 0; i < dbs.length; i++) {
      const wal = await observeWal(dbs[i], dbPaths[i], baselines[i]);
      const backup = backupRuntimeDb({ dbPath: dbPaths[i], outDir: path.join(namespace, `logical-${i}`), tag: 'feedback_synthetic' });
      assert.equal(backup.ok, true); assert.equal(backup.quick_check, 'ok');
      assert.equal(hash(await fs.readFile(backup.backupPath)), backup.sha256);
      assert.equal(await observeWal(dbs[i], dbPaths[i], baselines[i]), wal, 'export leaves live WAL unchanged');
      const frozen = new DatabaseSync(backup.backupPath, { readOnly: true });
      try { assert.deepEqual(rows(frozen), expectedRows[i]); } finally { frozen.close(); }
      logical.push(backup.backupPath);
    }
  });
  assert.equal(logical.length, 3);
  let manifestSha256, manifest;
  await gate('one create-only generation pairs all ledger, protected evidence, authority and candidate bytes', async () => {
    await fs.mkdir(generation);
    const members = [];
    const capture = async (source, relative) => {
      const bytes = await readRuntimeBytes(source, null, 4_000_000), destination = inside(generation, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, bytes, { flag: 'wx' });
      members.push({ relative, sha256: hash(bytes), size: bytes.length });
    };
    for (let i = 0; i < dbPaths.length; i++) await capture(logical[i], path.relative(f.root, dbPaths[i]).replaceAll('\\', '/'));
    // Explicit bounded membership, never an arbitrary production-root walk.
    for (const pin of [...Object.values(f.pins), candidatePin]) await capture(path.join(f.evidence, `${pin.ref}.json`), `evidence/${pin.ref}.json`);
    for (const file of ['current', 'routeCurrent', 'policy', 'catalog', 'bindings', 'deployment', 'readbox'])
      await capture(f.paths[file], `config/${path.basename(f.paths[file])}`);
    await capture(path.join(candidatePath, 'value.mjs'), path.relative(f.root, path.join(candidatePath, 'value.mjs')).replaceAll('\\', '/'));
    members.sort((a, b) => a.relative.localeCompare(b.relative));
    const bytes = Buffer.from(JSON.stringify({ generation: 'synthetic.feedback.restore.1', members }));
    manifestSha256 = hash(bytes); await fs.writeFile(path.join(generation, 'manifest.json'), bytes, { flag: 'wx' });
    manifest = await verifyGeneration(generation, manifestSha256);
    assert.equal(members.length, 15);
    await assert.rejects(fs.copyFile(logical[0], inside(generation, 'control/feedback.sqlite'), constants.COPYFILE_EXCL), { code: 'EEXIST' });
  });
  assert.ok(manifest);
  await gate('missing or mixed-generation members fail full readback before any reader opens', async () => {
    // Cover each protected class, including a report the metadata reader may
    // skip when missing. No CURRENT status is used as backup completeness proof.
    const targets = ['control/feedback.sqlite', 'control/feedback-watchdog.sqlite', 'delivery/feedback-dispatch.sqlite',
      `evidence/${f.pins.report.ref}.json`, `evidence/${candidatePin.ref}.json`,
      path.relative(f.root, path.join(candidatePath, 'value.mjs')).replaceAll('\\', '/'), 'config/deployment.json'];
    for (const [index, relative] of targets.entries()) for (const fault of ['missing', 'mixed']) {
      const damaged = path.join(namespace, `damaged-${index}-${fault}`); await fs.mkdir(damaged);
      for (const file of ['manifest.json', ...manifest.members.map(item => item.relative)]) {
        if (file === relative && fault === 'missing') continue;
        const target = inside(damaged, file); await fs.mkdir(path.dirname(target), { recursive: true });
        if (file === relative) await fs.writeFile(target, 'SYNTHETIC_OTHER_GENERATION', { flag: 'wx' });
        else await fs.copyFile(inside(generation, file), target, constants.COPYFILE_EXCL);
      }
      await assert.rejects(verifyGeneration(damaged, manifestSha256));
    }
  });
  let originalHashes;
  await gate('only owned handles stop and complete original bytes remain in a verified sibling', async () => {
    dispatch.close(); dispatch = null; for (const db of dbs) closeDb(db);
    originalHashes = await treeHashes(f.root);
    const parent = await fs.realpath(namespace), original = await fs.realpath(f.root);
    assert.equal(path.dirname(original), parent); assert.equal(path.dirname(path.resolve(preserved)), parent);
    await assert.rejects(fs.lstat(preserved), { code: 'ENOENT' });
    await fs.rename(original, preserved);
    assert.deepEqual(await treeHashes(preserved), originalHashes);
    await assert.rejects(fs.lstat(f.root), { code: 'ENOENT' });
  });
  await gate('same-location create-only restoration reopens exact state and candidate references', async () => {
    // Source readback must finish before restoring or exposing any runtime view.
    await verifyGeneration(generation, manifestSha256);
    await fs.mkdir(f.root); await fs.mkdir(f.paths.repo);
    for (const file of ['manifest.json', ...manifest.members.map(item => item.relative)]) {
      const destination = inside(f.root, file); await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(inside(generation, file), destination, constants.COPYFILE_EXCL);
    }
    await verifyGeneration(f.root, manifestSha256);
    for (let i = 0; i < dbPaths.length; i++) {
      const restored = new DatabaseSync(dbPaths[i], { readOnly: true });
      try { assert.deepEqual(rows(restored), expectedRows[i]); } finally { restored.close(); }
    }
    const restoredCandidate = await readRuntimeJson({ path: path.join(f.evidence, `${candidatePin.ref}.json`), sha256: candidatePin.sha256 });
    assert.deepEqual(restoredCandidate.candidate, candidate);
    assert.equal(expectedRows[0].dev_feedback_run.find(run => run.run_ref === f.runRef).candidate_ref, candidate.candidate_ref);
    for (const file of restoredCandidate.candidate.files)
      assert.deepEqual(await readRuntimeBytes(inside(restoredCandidate.candidate.worktree_path, file.path), file.sha256), candidateBytes);
    dispatch = await openFeedbackDispatch(f.options);
    assert.deepEqual(await dispatch.snapshot({ limit: 100 }, f.access), expectedView);
    for (const item of expectedView.items) assert.deepEqual(await dispatch.detail(item, f.access), { project_id: 'SYN', ...item });
  });
  await gate('restored consumed UNKNOWN cannot be reset or retransmitted by prepare, send or tick', async () => {
    for (const saved of sent) {
      assert.deepEqual(await dispatch.prepare({ ref: saved.notice_ref, sha256: saved.notice_sha256 }), saved);
      assert.deepEqual(await dispatch.send(saved.dispatch_ref), saved);
    }
    assert.deepEqual(await dispatch.tick(), []); assert.equal(attempts, 3);
    const view = await dispatch.snapshot({ limit: 100 }, f.access);
    assert.ok(view.items.every(item => item.buzz_delivery === 'DELIVERY_UNKNOWN' && item.human_acceptance === 'UNKNOWN' && !item.official_done));
  });
  await gate('restored execution uncertainty blocks a newer revision without execute or model calls', async () => {
    const db = new DatabaseSync(f.paths.workerDb); handles.add(db); let calls = 0;
    const forbidden = async () => { calls++; throw new Error('synthetic execution must remain fenced'); };
    const cycle = createFeedbackCycle({ db, source: { snapshot: async () => ({ status: 'CURRENT', snapshot_ref: 'snapshot.synthetic.new',
      items: [{ source_ref: f.sourceRef, semantic_sha256: 'd'.repeat(64), source_revision: 'revision.synthetic.new', scope_ref: 'project:SYN', kind: 'improvement' }] }),
      current: async () => true }, authorize: async () => true, prepare: forbidden, execute: forbidden, validate: forbidden, review: forbidden, report: forbidden });
    assert.equal((await cycle.runOnce()).status, 'RECOVERY_REQUIRED'); assert.equal(calls, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM dev_feedback_run WHERE state='execution_unknown'").get().n, 1);
    closeDb(db);
  });
  await gate('revoked manager reads fail while immutable generation and preserved originals remain exact', async () => {
    await f.writeCurrent({ active: false });
    await assert.rejects(dispatch.snapshot({ limit: 100 }, f.access), /FEEDBACK_READBOX_ACCESS_REQUIRED/);
    await assert.rejects(dispatch.detail(f.pins.report, f.access), /FEEDBACK_READBOX_ACCESS_REQUIRED/);
    await verifyGeneration(generation, manifestSha256);
    assert.deepEqual(await treeHashes(preserved), originalHashes);
    assert.equal(attempts, 3);
  });
  complete = passed === 8;
});
