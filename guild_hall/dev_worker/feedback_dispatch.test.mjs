import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { openFeedbackDispatch } from './feedback_dispatch.mjs';
import { createReadboxFixture } from './feedback_readbox_fixture.mjs';
import { readboxHash } from './feedback_readbox.mjs';

async function fixture(t, handler = null) {
  const f = await createReadboxFixture(); let service;
  if (handler) {
    service = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk;
      await handler(JSON.parse(body), req, res); });
    service.listen(0, '127.0.0.1'); await once(service, 'listening');
    f.config.delivery.native_origin = `http://127.0.0.1:${service.address().port}`; await f.reseal();
  }
  let dispatch = await openFeedbackDispatch(f.options);
  t.after(async () => { dispatch.close(); if (service) { service.closeAllConnections(); await new Promise(r => service.close(r)); } await f.close(); });
  return { f, get dispatch() { return dispatch; }, async reopen(readOnly = false) { dispatch.close(); dispatch = await openFeedbackDispatch({ ...f.options, readOnly }); return dispatch; } };
}
test('approved exact manager route prepares only fixed metadata, deduplicates and survives restart', async t => {
  const x = await fixture(t), a = await x.dispatch.prepare(x.f.pins.report), b = await x.dispatch.prepare(x.f.pins.report);
  assert.deepEqual(a, b); assert.equal(a.state, 'PREPARED');
  const authorized = await x.dispatch.authorize(a.dispatch_ref, a.envelope_sha256);
  assert.equal(readboxHash(authorized.envelope), a.envelope_sha256);
  assert.equal(authorized.envelope.bot_chat_id, x.f.policy.bot_chat_id);
  assert.equal(JSON.stringify(authorized).includes(x.f.rawSentinel), false);
  assert.equal(authorized.envelope.text.includes('official_done=false'), true);
  await x.reopen(); assert.deepEqual(await x.dispatch.prepare(x.f.pins.report), a);
});
test('current manager route revocation, stale observation and project permission fail closed', async t => {
  const x = await fixture(t), p = await x.dispatch.prepare(x.f.pins.notice);
  await x.f.writeCurrent({ dispatch_enabled: false });
  await assert.rejects(x.dispatch.authorize(p.dispatch_ref, p.envelope_sha256), /ACCESS_REQUIRED/);
  await x.f.writeCurrent({ dispatch_enabled: true });
  await x.f.writeRouteCurrent({ observed_at: new Date(Date.now() - 600000).toISOString() });
  await assert.rejects(x.dispatch.prepare(x.f.pins.report), /CURRENT_REQUIRED/);
});
test('directory EXACT identity cannot substitute for separate approved purpose', async t => {
  const f = await createReadboxFixture();
  f.policy.approved = false; await f.reseal();
  const d = await openFeedbackDispatch(f.options); t.after(async () => { d.close(); await f.close(); });
  await assert.rejects(d.prepare(f.pins.report), /AUTHORITY_REQUIRED/);
});
for (const [name, mutate] of [
  ['unknown route', f => { f.policy.manager_route_id = 'UNKNOWN'; }],
  ['retired route', f => { f.catalog.routes.find(r => r.route_id === f.policy.manager_route_id).lifecycle.state = 'retired'; }],
  ['different canonical chat', f => { f.bindings.bindings[0].durable_coordination_binding.resource_identifier = 'chat.other'; }],
  ['different native profile', f => { f.bindings.bindings[0].runtime_agent.resource_identifier = 'profile.other'; }],
  ['expired permission', f => { f.policy.expires_at = new Date(Date.now() - 1000).toISOString(); }],
  ['wrong purpose', f => { f.policy.purpose = 'owner_attention'; }],
]) test(`preparation rejects ${name}`, async t => {
  const f = await createReadboxFixture(); mutate(f); await f.reseal();
  const d = await openFeedbackDispatch(f.options); t.after(async () => { d.close(); await f.close(); });
  await assert.rejects(d.prepare(f.pins.notice));
});
test('exact native acknowledgement is separate from human acceptance and read-only view', async t => {
  let attempts = 0;
  const x = await fixture(t, (body, req, res) => { attempts++; res.end(JSON.stringify({ ...body, status: 'ACKNOWLEDGED', message_id: 'synthetic.message.1' })); });
  const p = await x.dispatch.prepare(x.f.pins.report);
  const sent = await x.dispatch.send(p.dispatch_ref);
  assert.equal(sent.state, 'ACKNOWLEDGED'); assert.equal(sent.human_acceptance, 'UNKNOWN'); assert.equal(sent.official_done, false);
  await x.dispatch.send(p.dispatch_ref); assert.equal(attempts, 1);
  await x.reopen(true);
  const detail = await x.dispatch.detail(x.f.pins.report, x.f.access);
  assert.equal(detail.buzz_delivery, 'ACKNOWLEDGED');
  await assert.rejects(x.dispatch.send(p.dispatch_ref), /READ_ONLY/);
});
test('unknown is committed before request; lost response and restart never resend; exact receipt may reconcile', async t => {
  let attempts = 0, f;
  const x = await fixture(t, (body, req, res) => {
    const db = new DatabaseSync(path.join(f.paths.delivery, 'feedback-dispatch.sqlite'), { readOnly: true });
    assert.equal(db.prepare('SELECT state FROM feedback_dispatch WHERE dispatch_ref=?').get(body.dispatch_ref).state, 'DELIVERY_UNKNOWN'); db.close();
    if (req.url === '/send') { attempts++; req.socket.destroy(); }
    else res.end(JSON.stringify({ ...body, status: 'ACKNOWLEDGED', message_id: 'synthetic.late.ack' }));
  }); f = x.f;
  const p = await x.dispatch.prepare(f.pins.notice);
  assert.equal((await x.dispatch.send(p.dispatch_ref)).state, 'DELIVERY_UNKNOWN');
  await x.reopen(); assert.equal((await x.dispatch.send(p.dispatch_ref)).state, 'DELIVERY_UNKNOWN'); assert.equal(attempts, 1);
  assert.equal((await x.dispatch.reconcile(p.dispatch_ref)).state, 'ACKNOWLEDGED'); assert.equal(attempts, 1);
});
test('wrong envelope receipt and native failure remain unknown', async t => {
  const x = await fixture(t, (body, req, res) => res.end(JSON.stringify({ ...body, envelope_sha256: 'f'.repeat(64), status: 'ACKNOWLEDGED', message_id: 'wrong' })));
  const p = await x.dispatch.prepare(x.f.pins.report);
  assert.equal((await x.dispatch.send(p.dispatch_ref)).state, 'DELIVERY_UNKNOWN');
  assert.equal((await x.dispatch.reconcile(p.dispatch_ref)).state, 'DELIVERY_UNKNOWN');
});
test('recovery has a new event, while its repeated observation has one prepared row', async t => {
  const x = await fixture(t), first = await x.dispatch.prepare(x.f.pins.notice);
  const { writeRuntimeEvidence } = await import('./feedback_runtime_io.mjs');
  const noticeRef = 'feedback.notice.recovered';
  const pin = await writeRuntimeEvidence(x.f.paths.evidence, 'manager-notice', noticeRef, { target: 'local_manager_readbox', transport: 'local_file',
    notice: { notice_ref: noticeRef, status: 'HEALTHY', run_refs: [], owner_decision_required: false } });
  const db = new DatabaseSync(x.f.paths.watchDb);
  db.prepare('INSERT INTO dev_feedback_watch_notice VALUES(?,?,?,?,?,?)').run(2, noticeRef, 'delivered', 1, Date.now(), pin.ref); db.close();
  const recovered = await x.dispatch.prepare(pin);
  assert.notEqual(recovered.dispatch_ref, first.dispatch_ref);
  assert.deepEqual(await x.dispatch.prepare(pin), recovered);
});
test('PREPARED can refresh current route pins, while native authorization requires a consumed attempt', async t => {
  const x = await fixture(t), original = await x.dispatch.prepare(x.f.pins.report);
  await assert.rejects(x.dispatch.authorizeNative(original.dispatch_ref, original.envelope_sha256), /ATTEMPT_NOT_CONSUMED/);
  x.f.bindings.bindings[0].observed_status = 'SYNTHETIC_REFRESH';
  const pin = await x.f.save(x.f.paths.bindings, x.f.bindings); await x.f.writeRouteCurrent({ bindings: pin });
  const refreshed = await x.dispatch.prepare(x.f.pins.report);
  assert.equal(refreshed.dispatch_ref, original.dispatch_ref); assert.notEqual(refreshed.envelope_sha256, original.envelope_sha256);
  await assert.rejects(x.dispatch.authorize(original.dispatch_ref, original.envelope_sha256), /NOT_FOUND/);
});
test('late ACK readback uses current read authority despite renewed route pins', async t => {
  const x = await fixture(t, (body, req, res) => res.end(JSON.stringify({ ...body,
    status: req.url === '/send' ? 'UNKNOWN' : 'ACKNOWLEDGED', message_id: 'late.synthetic' })));
  const p = await x.dispatch.prepare(x.f.pins.notice); await x.dispatch.send(p.dispatch_ref);
  x.f.bindings.bindings[0].observed_status = 'SYNTHETIC_REFRESH';
  await x.f.writeRouteCurrent({ bindings: await x.f.save(x.f.paths.bindings, x.f.bindings) });
  await assert.rejects(x.dispatch.authorize(p.dispatch_ref, p.envelope_sha256), /ENVELOPE_STALE/);
  assert.equal((await x.dispatch.reconcile(p.dispatch_ref)).state, 'ACKNOWLEDGED');
});
test('expired unattempted envelope refreshes after current route renewal', async t => {
  const x = await fixture(t);
  const expires = new Date(Date.now() + 1000).toISOString();
  await x.f.writeRouteCurrent({ expires_at: expires });
  const old = await x.dispatch.prepare(x.f.pins.report);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(expires) - Date.now() + 20)));
  await x.f.writeRouteCurrent({ expires_at: new Date(Date.now() + 60000).toISOString() });
  const refreshed = await x.dispatch.prepare(x.f.pins.report);
  assert.equal(refreshed.state, 'PREPARED'); assert.notEqual(refreshed.envelope_sha256, old.envelope_sha256);
  assert.equal((await x.dispatch.authorize(refreshed.dispatch_ref, refreshed.envelope_sha256)).status, 'AUTHORIZED');
});
test('bounded tick reaches older unseen events beyond the first hundred without resending recorded ones', async t => {
  let attempts = 0;
  const x = await fixture(t, (body, req, res) => { attempts++; res.end(JSON.stringify({ ...body, status: 'ACKNOWLEDGED', message_id: 'synthetic.backlog' })); });
  const { writeRuntimeEvidence } = await import('./feedback_runtime_io.mjs');
  const watch = new DatabaseSync(x.f.paths.watchDb), ledger = new DatabaseSync(path.join(x.f.paths.delivery, 'feedback-dispatch.sqlite'));
  for (let n = 2; n <= 105; n++) {
    const notice = `feedback.notice.synthetic.${n}`;
    const pin = await writeRuntimeEvidence(x.f.paths.evidence, 'manager-notice', notice, { target: 'local_manager_readbox', transport: 'local_file',
      notice: { notice_ref: notice, status: 'HEALTHY', run_refs: [], owner_decision_required: false } });
    watch.prepare('INSERT INTO dev_feedback_watch_notice VALUES(?,?,?,?,?,?)').run(n, notice, 'delivered', 1, Date.now() + n, pin.ref);
    ledger.prepare("INSERT INTO feedback_dispatch VALUES(?,?,?,?,?,?,'ACKNOWLEDGED',?,?,?)")
      .run(`feedback.dispatch.synthetic.${n}`, notice, pin.ref, pin.sha256, 'a'.repeat(64), '{}', 'already.synthetic', new Date().toISOString(), new Date().toISOString());
  }
  watch.close(); ledger.close();
  assert.equal((await x.dispatch.snapshot({ limit: 100 }, x.f.access)).has_more, true);
  const results = await x.dispatch.tick();
  assert.equal(results.length, 3); assert.equal(attempts, 3); assert.ok(results.every(x => x.state === 'ACKNOWLEDGED'));
  assert.deepEqual(await x.dispatch.tick(), []); assert.equal(attempts, 3);
});
