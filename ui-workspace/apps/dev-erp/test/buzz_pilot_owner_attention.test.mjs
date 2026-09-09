import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProtectedWorkingBytes } from '../../../../guild_hall/shared/protected_working_bytes.mjs';
import { BUZZ_PILOT_ROLES, createBuzzPilotJob } from '../src/buzz_pilot_job.mjs';
import { createBuzzPilotOwnerAttentionService } from '../src/buzz_pilot_owner_attention.mjs';
import { makeAttentionFixture } from './owner_attention_fixture.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const ownerKey = '1'.repeat(64), botKey = '2'.repeat(64);
const message = n => String(n).padStart(64, '0');
const question = '합성 보고서의 검토 대상은 누구인가요?';
const instruction = Buffer.from('합성 보고서의 검토 대상을 확인하세요.');
const input = { question, choices: ['개발팀', '검토팀'], multi_select: false };
const action = (row, action, minutes) => ({ request_key: row.request_key, source_sha256: row.source_sha256,
  view_version: row.view_version, action, ...(minutes ? { minutes } : {}) });

async function fixture(t, { legacy = false, capture = false } = {}) {
  const erp = makeAttentionFixture(null, { persistent: true });
  const root = path.join(erp.root, 'protected-native'); await mkdir(root);
  const nativePath = path.join(erp.root, 'native.sqlite');
  const db = new DatabaseSync(nativePath);
  const binding = { version: 1, job_id: 'job.synthetic', project_id: 'SYN-ATTENTION',
    owner_account_id: erp.owner.id, expected_owner_pubkey: ownerKey, expected_bot_pubkey: botKey,
    chat_id: '00000000-0000-4000-8000-000000000001', profile_ref: 'profile.synthetic',
    instruction_sha256: hash(instruction), issued_at: new Date(erp.now() - 1000).toISOString(),
    expires_at: new Date(erp.now() + 3600000).toISOString() };
  const workingBytes = createProtectedWorkingBytes({ root, repositoryRoot, storageClass: 'owner_approved_shared_worksite',
    ownerApprovalRef: 'approval.synthetic-buzz-attention', roles: BUZZ_PILOT_ROLES });
  const authorize = async (kind, context, actor) => kind === 'append' ? actor.job_id === context.job_id
    : actor.accountId === context.owner_account_id && await actor.checkSession() === true
      && await actor.canAccessProject(context.project_id) === true;
  const core = createBuzzPilotJob({ db, workingBytes, binding, authorize, now: erp.now });
  const readerDb = new DatabaseSync(nativePath, { readOnly: true });
  const reader = createBuzzPilotJob({ db: readerDb, workingBytes, binding, authorize, now: erp.now, readOnly: true });
  const f = { erp, db, reader, binding, access: erp.access, now: erp.now, core, reads: 0 };
  f.make = (overrides = {}) => createBuzzPilotOwnerAttentionService({ store: erp.store, binding,
    pilotReader: { snapshot: access => reader.snapshot(access), readEvidence: (...args) => { f.reads++; return reader.readEvidence(...args); } },
    legacyService: legacy ? erp.service : null, now: erp.now, ...overrides });
  f.service = f.make();
  let n = 0;
  f.append = (type, payload) => core.append({ version: 1, observation_id: `event.${++n}`,
    job_id: binding.job_id, event_type: type, profile_ref: binding.profile_ref, chat_id: binding.chat_id,
    bot_pubkey: botKey, actor_pubkey: ['instruction_received', 'answer_received', 'answer_accepted'].includes(type) ? ownerKey : botKey,
    session_key: 'session:synthetic', session_id: type === 'instruction_received' ? null : 'session.actual',
    observed_at: new Date(erp.now()).toISOString(), payload });
  await core.issue({ instructionBytes: instruction }, f.access);
  if (capture) await core.captureHealth({ version: 1, observer_instance_id: '00000000-0000-4000-8000-000000000010',
    phase: 'started', observed_at: new Date(erp.now()).toISOString(), pending_operations: 0,
    recorded_operations: 0, gap_reason: null }, f.access);
  await f.append('instruction_received', { message_id: message(1), text: instruction.toString() });
  await f.append('tool_started', { tool_call_id: 'call.synthetic', tool_name: 'clarify', input });
  await f.append('question_registered', { clarify_id: 'clarify.synthetic', tool_call_id: 'call.synthetic', ...input });
  f.deliver = (delivery_status = 'sent') => f.append('question_delivery', { clarify_id: 'clarify.synthetic', delivery_status,
    message_id: delivery_status === 'sent' ? message(2) : null });
  f.answer = () => f.append('answer_received', { clarify_id: 'clarify.synthetic', message_id: message(3), text: '개발팀' });
  f.sourceBytes = () => readFile(nativePath);
  t.after(() => { readerDb.close(); db.close(); erp.close(); });
  return f;
}

test('native question preferences persist, never mutate source DB or notify; actual answer closes the same identity', async t => {
  const f = await fixture(t); await f.deliver();
  const original = await f.sourceBytes();
  let snap = await f.service.snapshot(f.access), row = snap.items[0];
  assert.equal(row.question, question); assert.equal(row.source_state, 'awaiting');
  assert.equal(snap.notification.capability, 'unavailable');
  assert.deepEqual(snap.notification.native_delivery, { confirmed_request_count: 1, source: 'buzz_pilot_question_delivery' });
  assert.equal(row.buzz_url, `buzz://message?channel=${f.binding.chat_id}&id=${message(2)}`);
  const identity = [row.request_key, row.source_sha256], stale = action(row, 'seen');
  row = (await f.service.act(f.access, stale)).item;
  await assert.rejects(f.service.act(f.access, stale), /ATTENTION_VIEW_CHANGED/);
  row = (await f.service.act(f.access, action(row, 'snooze', 30))).item;
  assert.equal(row.snoozed, true);
  f.erp.reopen(); f.service = f.make();
  row = (await f.service.snapshot(f.access)).items[0];
  assert.ok(row.seen_at); assert.equal(row.snoozed, true);
  row = (await f.service.act(f.access, action(row, 'unsnooze'))).item;
  assert.equal(row.snoozed, false); assert.equal(row.source_state, 'awaiting');
  assert.deepEqual(await f.service.dispatch(f.access), { status: 'idle', sent: false });
  assert.deepEqual(await f.sourceBytes(), original);
  assert.equal(f.erp.store.db.prepare('SELECT count(*) n FROM owner_attention_outbox').get().n, 0);
  const persisted = JSON.stringify(f.erp.store.db.prepare('SELECT * FROM owner_attention_view').all());
  assert.equal(persisted.includes(question), false); assert.equal(persisted.includes('buzz://'), false);
  await f.answer();
  row = (await f.service.snapshot(f.access)).items[0];
  assert.equal(row.source_state, 'responded'); assert.ok(row.closure_ref);
  assert.deepEqual([row.request_key, row.source_sha256], identity);
  await assert.rejects(f.service.act(f.access, action(row, 'seen')), /ATTENTION_REQUEST_CHANGED/);
  await f.append('answer_accepted', { clarify_id: 'clarify.synthetic', message_id: message(3) });
  await f.append('resumed', { clarify_id: 'clarify.synthetic', tool_call_id: 'call.synthetic' });
  assert.deepEqual([(await f.service.snapshot(f.access)).items[0].request_key,
    (await f.service.snapshot(f.access)).items[0].source_sha256], identity);
  assert.equal((await f.reader.snapshot(f.access)).event_refs.filter(e => e.event_type === 'resumed').length, 1);
});

test('wrong Owner/project/session and mismatched binding are rejected before preference writes', async t => {
  const f = await fixture(t); await f.deliver();
  for (const access of [{ ...f.access, accountId: 'foreign' }, { ...f.access, checkSession: () => false },
    { ...f.access, canAccessProject: () => false }]) await assert.rejects(f.service.snapshot(access));
  const changed = f.make({ binding: { ...f.binding, project_id: 'OTHER' } });
  await assert.rejects(changed.snapshot(f.access), /BUZZ_ATTENTION_BINDING_CHANGED/);
  assert.equal(f.erp.store.db.prepare('SELECT count(*) n FROM owner_attention_view').get().n, 0);
});

test('terminal delivered answer preserves its identity and closure after expiry while current access stays required', async t => {
  const f = await fixture(t, { capture: true }); await f.deliver(); await f.answer();
  await f.append('answer_accepted', { clarify_id: 'clarify.synthetic', message_id: message(3) });
  await f.append('resumed', { clarify_id: 'clarify.synthetic', tool_call_id: 'call.synthetic' });
  await f.append('tool_completed', { tool_call_id: 'call.synthetic', tool_name: 'clarify', output: '개발팀', outcome: 'completed' });
  await f.append('final_response', { text: '합성 보고서의 검토 대상을 개발팀으로 확인했습니다.' });
  await f.append('final_delivery', { delivery_status: 'sent', message_id: message(4) });
  const before = (await f.service.snapshot(f.access)).items[0];
  assert.equal(before.source_state, 'responded'); assert.ok(before.closure_ref);
  f.erp.clock.value += 3600001;
  const source = await f.sourceBytes();
  const after = (await f.service.snapshot(f.access)).items[0];
  assert.equal(after.native_state, 'delivered'); assert.equal(after.source_state, 'responded');
  assert.deepEqual(after.next_actions, ['답변이 기록되었습니다. 추가 답변 요청은 없습니다.']);
  assert.deepEqual(after.blocked_work, ['이 질문에 대한 답변 대기는 종료되었습니다.']);
  assert.deepEqual([after.request_key, after.source_sha256, after.closure_ref],
    [before.request_key, before.source_sha256, before.closure_ref]);
  await assert.rejects(f.service.act(f.access, action(after, 'seen')), /ATTENTION_REQUEST_CHANGED/);
  await assert.rejects(f.service.snapshot({ ...f.access, checkSession: () => false }), /OWNER_ACCESS_REQUIRED/);
  assert.deepEqual(await f.sourceBytes(), source);
});

test('expiry and capture uncertainty remain unconfirmed, cannot become an answer or accept stale actions', async t => {
  for (const capture of [false, true]) {
    const f = await fixture(t, { capture }); await f.deliver();
    const row = (await f.service.snapshot(f.access)).items[0];
    f.erp.clock.value += capture ? 45001 : 3600001;
    const before = await f.sourceBytes();
    const snap = await f.service.snapshot(f.access);
    assert.equal(snap.items[0].source_state, 'unconfirmed');
    assert.deepEqual(snap.items[0].next_actions, ['운영담당이 Buzz 전달·관측 상태를 확인해야 합니다.']);
    assert.deepEqual(snap.items[0].blocked_work, ['업무의 답변 대기 여부는 아직 확인되지 않았습니다.']);
    assert.equal(snap.items[0].owner_action_required, false); assert.equal(snap.items[0].closure_ref, null);
    assert.equal(snap.items[0].source_sha256, row.source_sha256); assert.equal(snap.operations_attention, true);
    await assert.rejects(f.service.act(f.access, action(row, 'snooze', 30)), /ATTENTION_REQUEST_CHANGED/);
    assert.deepEqual(await f.sourceBytes(), before);
  }
});

test('unconfirmed delivery is not counted as Buzz delivery; explicit native cancellation closes without claiming answer', async t => {
  const f = await fixture(t); await f.deliver('unknown');
  let snap = await f.service.snapshot(f.access);
  assert.equal(snap.notification.native_delivery.confirmed_request_count, 0);
  assert.equal(snap.items[0].source_state, 'unconfirmed');
  await f.append('cancelled', { reason_code: 'owner_cancelled' });
  snap = await f.service.snapshot(f.access);
  assert.equal(snap.items[0].source_state, 'withdrawn'); assert.ok(snap.items[0].closure_ref);
  const closed = snap.items[0]; f.erp.clock.value += 3600001;
  snap = await f.service.snapshot(f.access);
  assert.deepEqual([snap.items[0].request_key, snap.items[0].source_sha256, snap.items[0].source_state, snap.items[0].closure_ref],
    [closed.request_key, closed.source_sha256, 'withdrawn', closed.closure_ref]);
});

test('current source/evidence failures and a changed source during read never return an empty healthy snapshot', async t => {
  const f = await fixture(t); await f.deliver();
  const broken = f.make({ pilotReader: { snapshot: () => { throw new Error('synthetic_db_unavailable'); }, readEvidence() {} } });
  await assert.rejects(broken.snapshot(f.access), /synthetic_db_unavailable/);
  for (const delta of [{ ref: 'foreign' }, { sha256: hash('other') }, { size: 1 }, { bytes: Buffer.from('wrong') }]) {
    const service = f.make({ pilotReader: { snapshot: access => f.reader.snapshot(access),
      readEvidence: async (...args) => ({ ...await f.reader.readEvidence(...args), ...delta }) } });
    await assert.rejects(service.snapshot(f.access), /BUZZ_ATTENTION_EVIDENCE_CONFLICT/);
  }
  const raced = f.make({ pilotReader: { snapshot: access => f.reader.snapshot(access),
    readEvidence: async (...args) => { const value = await f.reader.readEvidence(...args); await f.answer(); return value; } } });
  await assert.rejects(raced.snapshot(f.access), /ATTENTION_REQUEST_CHANGED/);
});

test('with another readable source an unreadable native source is reported, never removing the other requests', async t => {
  const f = await fixture(t, { legacy: true }); await f.deliver(); f.erp.publish();
  const unreadable = { snapshot: () => { throw new Error('synthetic_db_unavailable'); }, readEvidence() {} };
  const degraded = f.make({ pilotReader: unreadable });
  const snap = await degraded.snapshot(f.access);
  assert.equal(snap.status, 'available');
  assert.equal(snap.native_source_state, 'unavailable');
  assert.equal(snap.operations_attention, true);
  assert.equal(snap.native_source_error, 'BUZZ_ATTENTION_SOURCE_UNAVAILABLE');
  assert.equal(snap.items.filter(row => row.source_kind === 'buzz_pilot').length, 0);
  assert.deepEqual(snap.items.map(row => row.source_state), ['awaiting']);
  // Alone, the same failure still fails closed instead of looking healthy.
  await assert.rejects(f.make({ pilotReader: unreadable, legacyService: null }).snapshot(f.access), /synthetic_db_unavailable/);
  await assert.rejects(degraded.act(f.access, { request_key: 'a'.repeat(64), source_sha256: 'b'.repeat(64),
    view_version: 0, action: 'seen' }), /ATTENTION_REQUEST_NOT_FOUND/);
  assert.equal(f.erp.store.db.prepare('SELECT count(*) n FROM owner_attention_view').get().n, 0);
});

test('legacy and native sources merge under separate keys; only the selected source preference changes', async t => {
  const f = await fixture(t, { legacy: true }); await f.deliver(); f.erp.publish();
  const source = await f.sourceBytes();
  let snap = await f.service.snapshot(f.access);
  assert.equal(snap.items.length, 2); assert.equal(new Set(snap.items.map(i => i.request_key)).size, 2);
  const native = snap.items.find(i => i.source_kind === 'buzz_pilot'), legacy = snap.items.find(i => !i.source_kind);
  await f.service.act(f.access, action(native, 'seen'));
  snap = await f.service.snapshot(f.access);
  assert.equal(snap.items.find(i => i.request_key === legacy.request_key).seen_at, null);
  await f.service.act(f.access, action(legacy, 'snooze', 30));
  snap = await f.service.snapshot(f.access);
  assert.equal(snap.items.find(i => i.request_key === legacy.request_key).snoozed, true);
  assert.equal(snap.items.find(i => i.request_key === native.request_key).snoozed, false);
  await assert.rejects(f.service.act(f.access, { ...action(native, 'seen'), source_sha256: legacy.source_sha256 }), /ATTENTION_REQUEST_CHANGED/);
  assert.deepEqual(await f.sourceBytes(), source);
});
