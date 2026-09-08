import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createReadboxFixture } from './feedback_readbox_fixture.mjs';
import { openFeedbackDispatch } from './feedback_dispatch.mjs';
import { runtimeHash as hash } from './feedback_runtime_io.mjs';
import { createFeedbackReadboxHttpController } from '../../ui-workspace/apps/dev-erp/src/feedback_readbox_http.mjs';

test('tick deadline cancels in-flight synthetic HTTP without advancing its durable pending item or sending later', async t => {
  const f = await createReadboxFixture(); let seen, requestRef;
  const received = new Promise(resolve => { seen = resolve; });
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requestRef = JSON.parse(body).dispatch_ref; seen();
    // A stalled fixed synthetic native response; no external transport.
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  f.config.delivery.native_origin = `http://127.0.0.1:${server.address().port}`; await f.reseal();
  const dispatch = await openFeedbackDispatch(f.options);
  t.after(async () => { t.mock.timers.reset(); dispatch.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await f.close(); });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ticking = dispatch.tick();
  const rejected = assert.rejects(ticking, /TICK_BUDGET/);
  await received;
  const db = new DatabaseSync(path.join(f.paths.delivery, 'feedback-dispatch.sqlite'), { readOnly: true });
  const before = db.prepare('SELECT * FROM feedback_dispatch_scan').get();
  assert.equal(db.prepare('SELECT state FROM feedback_dispatch WHERE dispatch_ref=?').get(requestRef).state, 'DELIVERY_UNKNOWN');
  t.mock.timers.tick(60000); await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(db.prepare('SELECT * FROM feedback_dispatch_scan').get(), before);
  assert.equal(db.prepare('SELECT count(*) n FROM feedback_dispatch').get().n, 1);
  db.close();
});

test('1100+ cumulative rows use bounded real HTTP pages and cyclic durable dispatch, including old changes and restart', { timeout: 180000 }, async t => {
  const f = await createReadboxFixture(), calls = [];
  let dispatch, readServer;
  const sender = createServer(async (req, res) => {
    let text = ''; for await (const bytes of req) text += bytes;
    const request = JSON.parse(text); calls.push(request.dispatch_ref);
    res.end(JSON.stringify({ ...request, status: calls.length === 1 ? 'UNKNOWN' : 'ACKNOWLEDGED', message_id: 'synthetic.history.ack' }));
  });
  sender.listen(0, '127.0.0.1'); await once(sender, 'listening');
  t.after(async () => {
    dispatch?.close();
    for (const server of [sender, readServer].filter(Boolean)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await f.close();
  });
  f.config.delivery.native_origin = `http://127.0.0.1:${sender.address().port}`; await f.reseal();
  dispatch = await openFeedbackDispatch(f.options);
  const worker = new DatabaseSync(f.paths.workerDb), watch = new DatabaseSync(f.paths.watchDb);
  const ledgerPath = path.join(f.paths.delivery, 'feedback-dispatch.sqlite'), ledger = new DatabaseSync(ledgerPath);
  const reader = await f.open(), old = await reader.snapshot({ limit: 100 }, f.access);
  const consumed = (event, pin) => ledger.prepare("INSERT INTO feedback_dispatch VALUES(?,?,?,?,?,?,'ACKNOWLEDGED',?,?,?)")
    .run(`history.consumed.${hash(event).slice(0, 32)}`, event, pin.ref, pin.sha256, 'a'.repeat(64), '{}', 'historical.synthetic', new Date().toISOString(), new Date().toISOString());
  for (const item of old.items) consumed(item.event_key, item);
  const selected = [], records = [], pendingWrites = [];
  worker.exec('BEGIN'); watch.exec('BEGIN'); ledger.exec('BEGIN');
  for (let n = 0; n < 1105; n++) {
    const run = `feedback.run.history.${n}`, notice = `feedback.notice.history.${n}`;
    const resultRef = `feedback.run-result.${hash(run).slice(0, 32)}`, noticeRef = `feedback.manager-notice.${hash(notice).slice(0, 32)}`;
    const result = JSON.stringify({ result: { run_ref: run, status: 'HELD_INTERNAL' } });
    const note = JSON.stringify({ target: 'local_manager_readbox', transport: 'local_file',
      notice: { notice_ref: notice, status: 'HEALTHY', run_refs: n === 1104 ? [f.runRef] : [], owner_decision_required: false } });
    const runPin = { ref: resultRef, sha256: hash(result), locator: `r:${n + 3}` };
    const noticePin = { ref: noticeRef, sha256: hash(note), locator: `n:${n + 2}` };
    pendingWrites.push([resultRef, result], [noticeRef, note]);
    worker.prepare('INSERT INTO dev_feedback_run VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(run, f.sourceRef, f.semanticSha256,
      'instance.synthetic', 1, n === 1 ? 'running' : 'held_internal', new Date().toISOString(), new Date(Date.now() + 60000).toISOString(),
      null, null, null, null, null, null, 'FEEDBACK_REVIEW_REQUIRED');
    watch.prepare('INSERT INTO dev_feedback_watch_notice VALUES(?,?,?,?,?,?)').run(n + 2, notice, 'delivered', 1, Date.now(), noticeRef);
    const event = `run.${hash([run, 'held_internal']).slice(0, 32)}`;
    if (![0, 1, 1104].includes(n)) consumed(event, runPin);
    if (![0, 1, 2, 3, 1104].includes(n)) consumed(notice, noticePin);
    if ([0, 1104].includes(n)) selected.push(event, notice);
    records.push(runPin, noticePin);
  }
  worker.exec('COMMIT'); watch.exec('COMMIT'); ledger.exec('COMMIT');
  worker.close(); watch.close(); ledger.close();
  for (let n = 0; n < pendingWrites.length; n += 50) await Promise.all(pendingWrites.slice(n, n + 50).map(([ref, bytes]) => fs.writeFile(path.join(f.evidence, `${ref}.json`), bytes)));
  const before = await Promise.all([f.paths.workerDb, f.paths.watchDb].map(file => fs.readFile(file).then(hash)));
  let controller;
  readServer = createServer((req, res) => controller(req, res, new URL(req.url, 'http://127.0.0.1')).catch(() => res.end()));
  readServer.listen(0, '127.0.0.1'); await once(readServer, 'listening');
  const origin = `http://127.0.0.1:${readServer.address().port}`;
  controller = createFeedbackReadboxHttpController({ service: reader, allowedOrigin: origin,
    currentAccount: () => ({ id: f.access.accountId }), sessionKey: () => 'synthetic-session', canAccessProject: () => true });
  const http = url => fetch(origin + url, { headers: { 'sec-fetch-site': 'same-origin' } });
  const seen = new Set(); let cursor = null, pages = 0, firstCursor;
  do {
    const query = new URLSearchParams({ limit: '40' }); if (cursor) query.set('cursor', cursor);
    const response = await http('/api/workbench/feedback-readbox?' + query);
    assert.equal(response.status, 200); const page = await response.json(); pages++;
    assert.ok(page.items.length <= 40); assert.equal(JSON.stringify(page).includes(f.rawSentinel), false);
    for (const item of page.items) { assert.equal(seen.has(item.ref), false); seen.add(item.ref); }
    cursor = page.next_cursor; firstCursor ??= cursor;
  } while (cursor);
  assert.equal(seen.size, 2213); assert.ok(pages >= 56 && pages <= 58);
  const exact = records.at(-1), detail = await http('/api/workbench/feedback-readbox/evidence?' + new URLSearchParams(exact));
  assert.equal(detail.status, 200); assert.equal((await detail.json()).sha256, exact.sha256);
  const mismatched = await http('/api/workbench/feedback-readbox/evidence?' + new URLSearchParams({ ...exact, locator: 'n:1' }));
  assert.equal(mismatched.status, 404);
  const forged = JSON.parse(Buffer.from(firstCursor, 'base64url')); forged.scope = 'f'.repeat(64);
  assert.equal((await http('/api/workbench/feedback-readbox?cursor=' + Buffer.from(JSON.stringify(forged)).toString('base64url'))).status, 400);
  assert.deepEqual(await Promise.all([f.paths.workerDb, f.paths.watchDb].map(file => fs.readFile(file).then(hash))), before);

  const unattempted = await dispatch.prepare(records[1]);
  assert.equal(unattempted.state, 'PREPARED');
  dispatch.close(); dispatch = await openFeedbackDispatch(f.options);
  assert.deepEqual(await dispatch.prepare(records[1]), unattempted);

  // First bounded page has more than three new events: unattempted remainder
  // and the cursor must persist across both process-object and DB reopen.
  assert.equal((await dispatch.tick()).length, 3);
  const scanBefore = new DatabaseSync(ledgerPath, { readOnly: true });
  const saved = scanBefore.prepare('SELECT * FROM feedback_dispatch_scan').get(); scanBefore.close();
  assert.ok(JSON.parse(saved.pending_json).length > 0); assert.ok(saved.cursor);
  const callsBefore = calls.length;
  dispatch.close(); dispatch = await openFeedbackDispatch(f.options);
  await f.writeCurrent({ active: false });
  await assert.rejects(dispatch.tick(), /ACCESS_REQUIRED/); assert.equal(calls.length, callsBefore);
  assert.equal((await http('/api/workbench/feedback-readbox?cursor=' + firstCursor)).status, 403);
  const scanRevoked = new DatabaseSync(ledgerPath, { readOnly: true });
  assert.deepEqual(scanRevoked.prepare('SELECT * FROM feedback_dispatch_scan').get(), saved); scanRevoked.close();
  await f.writeCurrent({ active: true });
  // Change an old row behind the durable cursor after the first page was read.
  const mutation = new DatabaseSync(f.paths.workerDb);
  mutation.prepare("UPDATE dev_feedback_run SET state='held_internal' WHERE run_ref=?").run('feedback.run.history.1'); mutation.close();
  let wrapped = false, ticks = 0, maxPending = JSON.parse(saved.pending_json).length;
  for (let n = 0; n < 130; n++) {
    const result = await dispatch.tick(); assert.ok(result.length <= 3);
    ticks++;
    const db = new DatabaseSync(ledgerPath, { readOnly: true }), state = db.prepare('SELECT * FROM feedback_dispatch_scan').get(); db.close();
    assert.ok(JSON.parse(state.pending_json).length <= 20);
    maxPending = Math.max(maxPending, JSON.parse(state.pending_json).length);
    if (state.cursor === null && JSON.parse(state.pending_json).length === 0) { wrapped = true; break; }
  }
  assert.equal(wrapped, true);
  const changedEvent = `run.${hash(['feedback.run.history.1', 'held_internal']).slice(0, 32)}`;
  for (let n = 0; n < 4; n++) await dispatch.tick();
  const inspected = new DatabaseSync(ledgerPath, { readOnly: true });
  for (const event of [...selected, changedEvent]) assert.ok(['ACKNOWLEDGED', 'DELIVERY_UNKNOWN'].includes(
    inspected.prepare('SELECT state FROM feedback_dispatch WHERE event_key=?').get(event)?.state), event);
  const unknown = inspected.prepare("SELECT * FROM feedback_dispatch WHERE state='DELIVERY_UNKNOWN'").all();
  assert.equal(unknown.length, 1); assert.equal(calls.filter(ref => ref === unknown[0].dispatch_ref).length, 1);
  assert.equal(new Set(calls).size, calls.length);
  inspected.close();
  // Producer counts/history are untouched by reader/dispatcher, including after
  // rollover. Only the explicit synthetic old-row mutation above was made.
  const finalWorker = new DatabaseSync(f.paths.workerDb, { readOnly: true }), finalWatch = new DatabaseSync(f.paths.watchDb, { readOnly: true });
  assert.equal(finalWorker.prepare('SELECT count(*) n FROM dev_feedback_run').get().n, 1107);
  assert.equal(finalWatch.prepare('SELECT count(*) n FROM dev_feedback_watch_notice').get().n, 1106);
  finalWorker.close(); finalWatch.close();
  t.diagnostic(JSON.stringify({ producer_runs: 1107, producer_notices: 1106, http_pages: pages, unique_visible_records: seen.size,
    first_sweep_ticks: ticks, max_pending: maxPending, native_attempts: calls.length, duplicate_attempts: calls.length - new Set(calls).size,
    unknown_attempts: 1, old_state_change_seen: true, revoked_cursor_preserved: true, original_history_deleted: 0 }));
});
