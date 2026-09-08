import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeBuzzPilotWorkbenchFixture } from './helpers/buzz_pilot_workbench_fixture.mjs';
import { createBuzzPilotJob, BUZZ_PILOT_ROLES } from '../src/buzz_pilot_job.mjs';
import { createBuzzPilotWorkbenchHttpController } from '../src/buzz_pilot_workbench_http.mjs';
import { openBuzzPilotReader } from '../tools/buzz_pilot_job_cli.mjs';
import { backupRuntimeDb } from '../tools/runtime_ops.mjs';
import { createProtectedWorkingBytes } from '../../../../guild_hall/shared/protected_working_bytes.mjs';
import { bindSourceBackupGeneration } from '../../../../guild_hall/backup_controller/source_backup_generation_contract.mjs';
import { digestOf } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = bytes => `sha256:${hash(bytes)}`;
const CORE = ['version', 'job_id', 'project_id', 'owner_account_id', 'expected_owner_pubkey',
  'expected_bot_pubkey', 'chat_id', 'profile_ref', 'instruction_sha256', 'issued_at', 'expires_at'];
const base = 'http://127.0.0.1:47821';
const route = '/api/workbench/buzz-pilot';

// Header/frame inspection is read-only: unlike wal_checkpoint(PASSIVE), it does
// not itself checkpoint the evidence that this test is trying to demonstrate.
async function walObservation(db, dbPath, baseline) {
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(db.prepare('PRAGMA wal_autocheckpoint').get().wal_autocheckpoint, 0);
  assert.equal(hash(await readFile(dbPath)), baseline, 'main DB still contains only the checkpointed empty ledger');
  const wal = await readFile(`${dbPath}-wal`);
  assert.ok(wal.length > 32);
  assert.ok([0x377f0682, 0x377f0683].includes(wal.readUInt32BE(0)));
  const pageSize = wal.readUInt32BE(8), frameSize = pageSize + 24;
  assert.equal((wal.length - 32) % frameSize, 0);
  let commits = 0;
  for (let offset = 32; offset < wal.length; offset += frameSize) {
    assert.equal(wal.readUInt32BE(offset + 8), wal.readUInt32BE(16));
    assert.equal(wal.readUInt32BE(offset + 12), wal.readUInt32BE(20));
    if (wal.readUInt32BE(offset + 4) !== 0) commits++;
  }
  assert.ok(commits > 0, 'committed frames exist beyond the empty checkpointed ledger');
  return { wal_bytes: wal.length, frame_count: (wal.length - 32) / frameSize,
    commit_frames: commits, main_db_unchanged: true, journal_mode: 'wal' };
}

function technicalReceipt(manifest, state, times) {
  const digest = digestOf(manifest), source = 'source.buzz_pilot', scope = 'project.synthetic-buzz-pilot';
  const common = { source_ref: source, project_scope_ref: scope, generation_seq: state === 'issued' ? 1 : 2 };
  const capture = `capture.buzz-pilot.${state}`, captureManifest = `manifest.buzz-pilot.${state}.capture`;
  const backup = `backup.buzz-pilot.${state}`, backupManifest = `manifest.buzz-pilot.${state}.backup`;
  const result = bindSourceBackupGeneration({
    capture_record: { record_kind: 'capture_generation', source_ref: source, generation_seq: common.generation_seq,
      capture_ref: capture, manifest_ref: captureManifest, item_count: manifest.length, content_digest: digest,
      captured_at: times.captured, immutable: true },
    byte_owner_manifest: { schema_version: 'soulforge.source_backup.byte_owner_manifest.v0', ...common,
      capture_ref: capture, capture_manifest_ref: captureManifest, content_digest: digest, item_count: manifest.length,
      byte_length: manifest.reduce((sum, item) => sum + item.size, 0), byte_owner_ref: 'owner.synthetic-bytes',
      backup_manifest_ref: backupManifest, immutable: true },
    backup_evidence: { schema_version: 'soulforge.source_backup.generation_evidence.v0', ...common,
      capture_ref: capture, capture_content_digest: digest, backup_generation_ref: backup, backup_manifest_ref: backupManifest,
      backup_content_digest: digest, backed_up_at: times.backedUp, create_only: true, overwrite_allowed: false,
      exact_byte_readback: true, readback_digest: digest, byte_owner_ref: 'owner.synthetic-bytes' },
    restore_evidence: { schema_version: 'soulforge.source_backup.restore_evidence.v0', source_ref: source,
      project_scope_ref: scope, backup_generation_ref: backup, backup_manifest_ref: backupManifest,
      restore_test_ref: `restore.buzz-pilot.${state}`, isolated_root_ref: `restore-root.buzz-pilot.${state}`,
      restored_at: times.restored, exact_byte_readback: true, readback_digest: digest },
    owners: { logical_owner_ref: 'owner.synthetic-pilot', byte_owner_ref: 'owner.synthetic-bytes',
      revision_owner_ref: 'owner.synthetic-pilot', acceptance_owner_ref: 'owner.human',
      backup_restore_owner_ref: 'owner.synthetic-backup' },
    retention_policy_ref: 'policy.synthetic-test-only', rpo_policy_ref: 'policy.rpo-unmeasured',
  });
  assert.equal(result.status, 'BOUND', JSON.stringify(result));
  assert.equal(result.receipt.technical_restore_state, 'technical_restore_candidate');
  assert.equal(result.receipt.human_acceptance_state, 'pending');
  assert.equal(result.receipt.restore_test, null);
  return result.receipt;
}

test('active-WAL Buzz issued and pending-question snapshots restore exact protected roles, queries and replay fences', async t => {
  // ASSUMPTIONS: synthetic authoring may rebind local storage paths, never grant
  // real Owner approval. The fixture supplies reviewed code/Node pins; the real
  // producer below creates a NEW ledger with its writer held open throughout.
  const f = await makeBuzzPilotWorkbenchFixture();
  const parent = process.env.BUZZ_PILOT_WAL_EVIDENCE_ROOT || tmpdir();
  assert.ok(path.isAbsolute(parent));
  const root = await mkdtemp(path.join(parent, 'sf-buzz-wal-'));
  const closers = [];
  t.after(async () => {
    for (const close of closers.reverse()) close();
    assert.equal(path.dirname(f.root), path.resolve(tmpdir()));
    await rm(f.root, { recursive: true, force: true });
    if (!process.env.BUZZ_PILOT_WAL_EVIDENCE_ROOT) {
      assert.equal(path.dirname(root), path.resolve(tmpdir()));
      await rm(root, { recursive: true, force: true });
    }
  });
  const now = Date.now(), coreBinding = Object.fromEntries(CORE.map(key => [key, f.binding[key]]));
  const authorize = async (action, context, actor) => action === 'append'
    ? actor?.job_id === context.job_id
    : actor?.accountId === context.owner_account_id && await actor.checkSession() === true
      && await actor.canAccessProject(context.project_id) === true;
  const access = { accountId: coreBinding.owner_account_id, checkSession: async () => true,
    canAccessProject: async project => project === coreBinding.project_id };
  const port = evidenceRoot => createProtectedWorkingBytes({ root: evidenceRoot, repositoryRoot: f.binding.repository_root,
    storageClass: f.binding.storage_class, ownerApprovalRef: 'approval.synthetic-test-only', roles: BUZZ_PILOT_ROLES });
  const live = path.join(root, 'live'), liveBytes = path.join(live, 'working'), dbPath = path.join(live, 'control', 'buzz-pilot.sqlite');
  const syntheticHome = path.join(root, 'synthetic-home');
  await mkdir(path.dirname(dbPath), { recursive: true }); await mkdir(liveBytes); await mkdir(syntheticHome);
  const writer = new DatabaseSync(dbPath); closers.push(() => writer.close());
  writer.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=0;');
  const livePort = port(liveBytes);
  const producer = createBuzzPilotJob({ db: writer, workingBytes: livePort, binding: coreBinding, authorize, now: () => now });
  assert.equal(writer.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy, 0);
  assert.equal(writer.prepare('SELECT count(*) AS n FROM buzz_pilot_jobs').get().n, 0);
  const baseline = hash(await readFile(dbPath));
  const oldReader = new DatabaseSync(dbPath, { readOnly: true }); closers.push(() => { oldReader.exec('ROLLBACK'); oldReader.close(); });
  oldReader.exec('BEGIN');
  assert.equal(oldReader.prepare('SELECT count(*) AS n FROM buzz_pilot_jobs').get().n, 0);
  let sequence = 0;
  const events = [];
  const append = async (type, payload) => {
    const event = { version: 1, observation_id: `synthetic.wal.${++sequence}`, job_id: coreBinding.job_id,
      event_type: type, profile_ref: coreBinding.profile_ref, chat_id: coreBinding.chat_id,
      bot_pubkey: coreBinding.expected_bot_pubkey,
      actor_pubkey: ['instruction_received', 'answer_received'].includes(type) ? coreBinding.expected_owner_pubkey : coreBinding.expected_bot_pubkey,
      session_key: 'session:synthetic-wal', session_id: 'session.synthetic-wal', observed_at: new Date(now).toISOString(), payload };
    events.push(event); return producer.append(event);
  };
  const message = number => number.toString(16).padStart(64, '0');
  const issueAck = await producer.issue({ instructionBytes: f.instruction }, access);
  const reports = [];
  for (const state of ['issued', 'waiting_owner']) {
    const walBefore = await walObservation(writer, dbPath, baseline);
    assert.equal(writer.prepare('SELECT issued FROM buzz_pilot_jobs').get().issued, 1);
    assert.equal(oldReader.prepare('SELECT count(*) AS n FROM buzz_pilot_jobs').get().n, 0);
    const expected = await producer.snapshot(access);
    assert.equal(expected.state, state);
    const capturedEvents = structuredClone(events);
    const times = { captured: new Date().toISOString() };
    // Only the existing logical exporter reads the LIVE SQLite database.
    const logical = backupRuntimeDb({ dbPath, outDir: path.join(root, `logical-${state}`), tag: 'synthetic_buzz_wal' });
    assert.equal(logical.ok, true); assert.equal(logical.quick_check, 'ok');
    assert.equal(logical.sha256, hash(await readFile(logical.backupPath)));
    const walAfter = await walObservation(writer, dbPath, baseline);
    assert.deepEqual(walAfter, walBefore, 'logical export did not checkpoint or close the live writer');
    const snapshotDb = new DatabaseSync(logical.backupPath, { readOnly: true }); closers.push(() => snapshotDb.close());
    assert.equal(snapshotDb.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    const frozenSource = createBuzzPilotJob({ db: snapshotDb, workingBytes: livePort, binding: coreBinding,
      authorize, now: () => now, readOnly: true });
    assert.deepEqual(await frozenSource.snapshot(access), expected);
    const pins = [JSON.parse(snapshotDb.prepare('SELECT instruction_json FROM buzz_pilot_jobs').get().instruction_json),
      ...snapshotDb.prepare('SELECT evidence_json FROM buzz_pilot_events WHERE committed = 1 ORDER BY sequence').all()
        .flatMap(row => JSON.parse(row.evidence_json))];
    assert.equal(pins.length, state === 'issued' ? 1 : 4);
    // Advance the still-open source AFTER export. Membership must come from the
    // exported ledger, never from an enumeration of the now-newer evidence root.
    if (state === 'issued') {
      const question = { question: 'Who reads this synthetic note?', choices: ['Engineering', 'Management'], multi_select: false };
      await append('instruction_received', { message_id: message(1), text: f.instruction.toString().trim() });
      await append('tool_started', { tool_call_id: 'call.synthetic-wal', tool_name: 'clarify', input: question });
      await append('question_registered', { clarify_id: 'clarify.synthetic-wal', tool_call_id: 'call.synthetic-wal', ...question });
      await append('question_delivery', { clarify_id: 'clarify.synthetic-wal', delivery_status: 'sent', message_id: message(2) });
    } else await append('answer_received', { clarify_id: 'clarify.synthetic-wal', message_id: message(3), text: 'Engineering' });
    assert.ok((await producer.snapshot(access)).sequence > expected.sequence);

    const generation = path.join(root, `generation-${state}`), restored = path.join(root, `restore-${state}`);
    for (const dir of [generation, restored]) {
      await mkdir(path.join(dir, 'control'), { recursive: true }); await mkdir(path.join(dir, 'working'));
    }
    const manifest = [], expectedBytes = new Map();
    const remember = (relative, bytes) => { manifest.push({ relative_path: relative, content_sha256: sha(bytes), size: bytes.length });
      expectedBytes.set(relative, Buffer.from(bytes)); };
    const ledgerRelative = 'control/buzz-pilot.sqlite';
    await copyFile(logical.backupPath, path.join(generation, ledgerRelative), constants.COPYFILE_EXCL);
    remember(ledgerRelative, await readFile(logical.backupPath));
    const backupPort = port(path.join(generation, 'working'));
    for (const pin of pins) {
      const read = await livePort.readRole({ groupId: pin.groupId, role: pin.role, expectedSha256: pin.sha256, expectedSize: pin.size });
      await backupPort.createGroup(pin.groupId);
      assert.deepEqual(await backupPort.writeRole({ groupId: pin.groupId, role: pin.role, bytes: read.bytes }),
        { sha256: pin.sha256, size: pin.size, mediaType: pin.mediaType });
      await assert.rejects(backupPort.writeRole({ groupId: pin.groupId, role: pin.role, bytes: read.bytes }), { code: 'EEXIST' });
      remember(`working/${pin.groupId}/${BUZZ_PILOT_ROLES[pin.role].filename}`, read.bytes);
    }
    manifest.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    await writeFile(path.join(generation, 'manifest.json'), manifestBytes, { flag: 'wx' });
    await assert.rejects(copyFile(logical.backupPath, path.join(generation, ledgerRelative), constants.COPYFILE_EXCL), { code: 'EEXIST' });
    assert.deepEqual((await readdir(generation)).sort(), ['control', 'manifest.json', 'working']);
    assert.deepEqual(await readdir(path.join(generation, 'control')), ['buzz-pilot.sqlite']);
    assert.deepEqual((await readdir(path.join(generation, 'working'))).sort(), pins.map(pin => pin.groupId).sort());
    for (const pin of pins) assert.deepEqual(await readdir(path.join(generation, 'working', pin.groupId)), [BUZZ_PILOT_ROLES[pin.role].filename]);
    for (const item of manifest) {
      const bytes = await readFile(path.join(generation, item.relative_path));
      assert.deepEqual(bytes, expectedBytes.get(item.relative_path)); assert.equal(sha(bytes), item.content_sha256);
      const target = path.join(restored, item.relative_path); await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(generation, item.relative_path), target, constants.COPYFILE_EXCL);
    }
    times.backedUp = new Date().toISOString();
    await copyFile(path.join(generation, 'manifest.json'), path.join(restored, 'manifest.json'), constants.COPYFILE_EXCL);
    assert.deepEqual(await readFile(path.join(restored, 'manifest.json')), manifestBytes);
    for (const item of JSON.parse(await readFile(path.join(restored, 'manifest.json'), 'utf8'))) {
      const bytes = await readFile(path.join(restored, item.relative_path));
      assert.equal(sha(bytes), item.content_sha256); assert.equal(bytes.length, item.size);
    }
    times.restored = new Date().toISOString();
    const receipt = technicalReceipt(manifest, state, times);
    // Only this trusted synthetic test author rebinds the distinct storage path.
    // No copied production binding or human-acceptance envelope is fabricated.
    const binding = { ...f.binding, control_db_path: path.join(restored, ledgerRelative), evidence_root: path.join(restored, 'working'),
      owner_approval_ref: 'approval.synthetic-test-only', expected_hermes_home: syntheticHome };
    const bindingPath = path.join(restored, 'synthetic-binding.json'), bindingBytes = Buffer.from(JSON.stringify(binding));
    await writeFile(bindingPath, bindingBytes, { flag: 'wx' });
    assert.notEqual(binding.control_db_path, dbPath); assert.notEqual(binding.evidence_root, liveBytes);
    const opened = await openBuzzPilotReader({ bindingPath, bindingSha256: hash(bindingBytes), authorize, now: () => now });
    closers.push(opened.close);
    assert.deepEqual(await opened.reader.snapshot(access), expected);
    const auth = { account: { id: access.accountId }, session: 'synthetic-session', projectAllowed: true };
    const controller = createBuzzPilotWorkbenchHttpController({ service: opened.reader, allowedOrigin: base,
      currentAccount: () => auth.account, sessionKey: () => auth.session,
      canAccessProject: (_req, project) => auth.projectAllowed && project === coreBinding.project_id });
    const request = async url => {
      const req = { method: 'GET', url, socket: { remoteAddress: '127.0.0.1' },
        headers: { host: new URL(base).host, 'sec-fetch-site': 'same-origin' } };
      const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
      assert.equal(await controller(req, res, new URL(url, base)), true); return res;
    };
    const { recovery_metadata: observerRecovery, ...ownerView } = expected;
    const restoredView = JSON.parse((await request(route)).body);
    assert.deepEqual(restoredView, ownerView);
    assert.equal(Object.hasOwn(restoredView, 'recovery_metadata'), false);
    const queries = [{ role: 'instruction' }, ...expected.event_refs.flatMap(event => event.evidence_refs
      .map(ref => ({ role: ref.role, observation_id: event.observation_id })))];
    const queryLinks = [];
    for (const query of queries) {
      const original = await frozenSource.readEvidence(query, access), result = await opened.reader.readEvidence(query, access);
      assert.deepEqual(result, original); assert.equal(sha(result.bytes), result.sha256);
      const url = `${route}/evidence?${new URLSearchParams(query)}`; queryLinks.push(url);
      const response = await request(url); assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body, original.bytes); assert.equal(response.headers['Cache-Control'], 'no-store');
    }
    for (const denied of ['logged-out', 'other-owner', 'revoked-project']) {
      auth.account = denied === 'logged-out' ? null : { id: denied === 'other-owner' ? 'account.other' : access.accountId };
      auth.projectAllowed = denied !== 'revoked-project';
      for (const url of [route, ...queryLinks]) assert.equal((await request(url)).statusCode, denied === 'logged-out' ? 401 : 403);
    }
    auth.account = { id: access.accountId }; auth.projectAllowed = true;
    const restoredDb = new DatabaseSync(binding.control_db_path); closers.push(() => restoredDb.close());
    const replay = createBuzzPilotJob({ db: restoredDb, workingBytes: port(binding.evidence_root), binding: coreBinding, authorize, now: () => now });
    const before = await replay.snapshot(access);
    assert.deepEqual(await replay.issue({ instructionBytes: f.instruction }, access), issueAck);
    for (const event of capturedEvents) assert.equal((await replay.append(event)).status, 'replayed');
    assert.deepEqual(await replay.snapshot(access), before);
    assert.equal(restoredDb.prepare('SELECT count(*) AS n FROM buzz_pilot_events').get().n, capturedEvents.length);
    if (capturedEvents.length) {
      await assert.rejects(replay.append({ ...capturedEvents[0], payload: { ...capturedEvents[0].payload, text: 'conflicting replay' } }),
        { code: 'buzz_pilot_conflicting_replay' });
      await assert.rejects(replay.append({ ...capturedEvents.at(-1), observation_id: 'synthetic.duplicate-delivery' }), { code: 'buzz_pilot_event_order' });
      assert.deepEqual(await replay.snapshot(access), before);
    }
    assert.equal(before.human_accepted, false); assert.equal(before.official_done, false);
    // Damage only the isolated restore. The original closed generation stays exact.
    const instructionPin = pins[0], damaged = path.join(binding.evidence_root, instructionPin.groupId, BUZZ_PILOT_ROLES.instruction.filename);
    await chmod(damaged, 0o600); await writeFile(damaged, 'tampered synthetic instruction');
    await assert.rejects(opened.reader.readEvidence({ role: 'instruction' }, access), { code: 'protected_bytes_digest_mismatch' });
    assert.equal((await request(queryLinks[0])).statusCode, 503);
    await rm(damaged);
    await assert.rejects(opened.reader.readEvidence({ role: 'instruction' }, access), { code: 'ENOENT' });
    assert.equal((await request(queryLinks[0])).statusCode, 503);
    for (const item of manifest) assert.equal(sha(await readFile(path.join(generation, item.relative_path))), item.content_sha256);
    reports.push({ state, wal: walBefore, sequence: expected.sequence, protected_roles: pins.length, item_count: manifest.length,
      query_links: queryLinks, buzz_url: expected.buzz_url, manifest_digest: digestOf(manifest), receipt,
      restored_current_auth_checked: true, replay_progress_unchanged: true, tamper_and_missing_refused: true,
      retained_generation_unchanged: true, retained_restore_state: 'instruction_removed_by_negative_test' });
  }
  await writeFile(path.join(root, 'verification.json'), `${JSON.stringify({ synthetic_only: true, reports,
    claim: 'active-WAL logical ledger export and isolated protected-byte restore',
    not_proven: ['gateway memory pending state', 'LLM execution deduplication', 'power loss', 'NAS', 'operational recovery', 'human acceptance'] }, null, 2)}\n`, { flag: 'wx' });
  t.diagnostic(JSON.stringify({ synthetic_only: true, states: reports.map(({ state, wal, sequence, protected_roles }) => ({ state, wal, sequence, protected_roles })) }));
});
