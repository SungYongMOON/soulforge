import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import vm from 'node:vm';
import { createWorkIntakeHttpController, renderWorkIntakeView, workIntakeViewScript } from '../src/work_intake_http.mjs';
import { createCompanyIntakeFixture } from './helpers/work_intake_runtime_fixture.mjs';
import { openWorkIntakeRuntime } from '../src/work_intake_runtime.mjs';

test('actual runtime HTTP exposes current permitted review metadata with exact result pins', async t => {
  const f = await createCompanyIntakeFixture(); const runtime = await openWorkIntakeRuntime(f.options);
  let controller, account = true, project = true;
  const server = createServer((req, res) => controller(req, res, new URL(req.url, 'http://127.0.0.1')).catch(() => res.end()));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); runtime.close(); await f.close(); });
  const run = await runtime.runOnce(); assert.equal(run.status, 'COMPLETED');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  controller = createWorkIntakeHttpController({ service: runtime, allowedOrigin: origin,
    currentAccount: () => account ? { id: 'reviewer.synthetic' } : null, sessionKey: () => 'synthetic-session', canAccessProject: () => project });
  const get = (url, options = {}) => fetch(origin + url, { ...options, headers: { 'sec-fetch-site': 'same-origin', ...options.headers } });
  assert.equal((await get('/workbench/work-intake')).status, 200);
  const list = await get('/api/workbench/work-intake?limit=1'); assert.equal(list.status, 200);
  assert.equal((await list.json()).items[0].run_id, run.run_id);
  const query = new URLSearchParams({ run_id: run.run_id, ref: run.result_ref, sha256: run.result_sha256 });
  const result = await get('/api/workbench/work-intake/result?' + query); assert.equal(result.status, 200);
  const text = await result.text(); assert.equal(text.includes(f.facts[0].segments[0].text), false);
  assert.equal((await get('/api/workbench/work-intake', { method: 'POST' })).status, 405);
  assert.equal((await get('/api/workbench/work-intake', { headers: { origin: 'http://example.invalid' } })).status, 403);
  assert.equal((await get('/api/workbench/work-intake?after=-1')).status, 400);
  account = false; assert.equal((await get('/workbench/work-intake')).status, 401);
  account = true; project = false; assert.equal((await get('/api/workbench/work-intake/result?' + query)).status, 403);
});

test('review screen explains candidates and keeps references in optional safe text detail without GUI access', async () => {
  const handlers = [], nodes = [];
  function node() { const value = { textContent: '', children: [], append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; }, addEventListener(name, callback) { handlers.push({ owner: this, name, callback }); } };
    Object.defineProperty(value, 'innerHTML', { set() { throw new Error('unsafe HTML'); } }); nodes.push(value); return value; }
  const elements = Object.fromEntries(['items', 'detail', 'status', 'next', 'refresh'].map(id => [id, node()]));
  const calls = [];
  const response = { project_ref: 'SYN', data_provenance: 'synthetic', candidates: [{ classification: 'NEW', reason_codes: ['NEW_REQUEST'],
    matched_task_ref: '<script>malicious()</script>', engineering: { findings: [{ gap_type: 'gap_missing' }] } }] };
  vm.runInNewContext(workIntakeViewScript, { document: { getElementById: id => elements[id], createElement: node }, URLSearchParams,
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => calls.length === 1
      ? { project_ref: 'SYN', next: null, items: [{ state: 'COMMITTED', started_at: 'synthetic', run_id: 'run.synthetic', result_ref: 'intake.result.synthetic', result_sha256: 'a'.repeat(64) }] }
      : response }; } });
  await new Promise(resolve => setImmediate(resolve));
  await handlers.find(handler => handler.owner.textContent === '업무 후보·근거 보기').callback();
  assert.ok(nodes.some(value => value.textContent === '새 업무 후보'));
  assert.ok(nodes.some(value => value.textContent === '참조·판본·검증 기록 보기'));
  assert.ok(nodes.some(value => value.textContent.includes('<script>malicious()</script>')));
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.options.credentials === 'same-origin' && call.options.redirect === 'error'));
  const html = renderWorkIntakeView(); assert.ok(html.includes(workIntakeViewScript)); assert.equal(html.includes('onclick='), false);
});
