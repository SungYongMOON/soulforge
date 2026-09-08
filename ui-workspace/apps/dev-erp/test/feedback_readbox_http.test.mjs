import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createFeedbackReadboxHttpController } from '../src/feedback_readbox_http.mjs';
import { feedbackReadboxScript } from '../src/feedback_readbox_view.mjs';

const BASE = '/api/workbench/feedback-readbox';
const PAGE = '/workbench/feedback-readbox';
const REF = 'feedback.report.0123456789abcdef0123456789abcdef';
const HASH = 'a'.repeat(64);
const pinQuery = `${BASE}/evidence?ref=${REF}&sha256=${HASH}`;
const record = () => ({ ref: REF, sha256: HASH, kind: 'result', event_key: 'event.synthetic',
  observed_at: '2026-09-08T01:02:03.000Z', state: 'CANDIDATE_REPORTED', run_ref: 'run.synthetic', reason: null,
  review: { status: 'ACCEPT', ref: 'review.synthetic' }, evidence_refs: [{ ref: 'validation.synthetic', sha256: HASH }],
  local_recorded: true, buzz_delivery: 'NOT_OBSERVED', human_acceptance: 'UNKNOWN', official_done: false, owner_decision_required: false });

async function fixture(t, options = {}) {
  const state = { account: { id: 'manager.synthetic' }, session: 'session.synthetic', allowed: true, calls: 0, afterRead: null, afterProject: null };
  const authorize = async access => {
    state.calls += 1;
    if (!await access.checkSession()) throw { feedbackCode: 'FEEDBACK_READBOX_AUTH_REQUIRED' };
    if (access.accountId !== 'manager.synthetic' || !await access.canAccessProject('SYN-001')) throw { feedbackCode: 'FEEDBACK_READBOX_ACCESS_REQUIRED' };
  };
  const service = {
    snapshot: async (query, access) => {
      await authorize(access); state.query = query;
      const result = { state: 'CURRENT', project_id: 'SYN-001', items: [record()], has_more: false };
      await state.afterRead?.(result); return result;
    },
    detail: async (query, access) => {
      await authorize(access); state.query = query;
      if (query.ref !== REF) throw { feedbackCode: 'FEEDBACK_READBOX_RECORD_NOT_FOUND' };
      if (query.sha256 !== HASH) throw { feedbackCode: 'FEEDBACK_READBOX_PIN_CHANGED' };
      const result = { project_id: 'SYN-001', ...record() };
      await state.afterRead?.(result); return result;
    },
  };
  let controller;
  const server = createServer(async (req, res) => {
    if (!await controller(req, res, new URL(req.url, origin))) { res.statusCode = 404; res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  assert.ok(![4300, 4192].includes(port));
  const origin = `http://127.0.0.1:${port}`;
  controller = createFeedbackReadboxHttpController({ service, allowedOrigin: origin,
    currentAccount: () => state.account, sessionKey: () => state.session,
    canAccessProject: async () => { await state.afterProject?.(); return state.allowed; }, ...options });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (path = BASE, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(origin, { path, method, headers: { 'sec-fetch-site': 'same-origin', ...headers } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        resolve({ status: response.statusCode, headers: response.headers, body, json: () => JSON.parse(body) });
      });
    });
    req.on('error', reject); req.end();
  });
  return { state, service, request, origin };
}

test('real loopback HTTP returns only current manager metadata and immutable detail pins', async t => {
  const f = await fixture(t);
  const result = await f.request(`${BASE}?limit=1`);
  assert.equal(result.status, 200); assert.deepEqual(f.state.query, { limit: 1 });
  assert.deepEqual(result.json(), { state: 'CURRENT', project_id: 'SYN-001', items: [record()], has_more: false, next_cursor: null });
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  assert.match(result.headers['content-security-policy'], /sandbox/u);
  const detail = await f.request(pinQuery);
  assert.equal(detail.status, 200); assert.deepEqual(detail.json(), { project_id: 'SYN-001', ...record() });
  assert.deepEqual(f.state.query, { ref: REF, sha256: HASH });
  assert.equal((await f.request(pinQuery.replace(HASH, 'b'.repeat(64)))).status, 409);
  assert.equal((await f.request(pinQuery.replace(REF, 'feedback.report.other'))).status, 404);
});

test('GET-only queries reject mutation, replay selectors, ambiguous pins and path escapes before service I/O', async t => {
  const f = await fixture(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
    const response = await f.request(BASE, { method });
    assert.equal(response.status, 405); assert.equal(response.headers.allow, 'GET');
  }
  for (const path of [`${BASE}?limit=0`, `${BASE}?limit=101`, `${BASE}?limit=01`, `${BASE}?limit=-1`, `${BASE}?limit=1.5`,
    `${BASE}?limit=1&limit=2`, `${BASE}?project_id=other`, `${BASE}?account_id=other`, `${BASE}?cursor=stale`, `${PAGE}?limit=1`,
    `${PAGE}?ref=${REF}`, `${pinQuery}&sha256=${HASH}`, `${pinQuery}&path=other.json`, `${BASE}/evidence?ref=${REF}`,
    `${BASE}/evidence?sha256=${HASH}`, `${pinQuery.replace(REF, '..%2Fother')}`, `${pinQuery.replace(HASH, 'SHA256:bad')}`]) {
    assert.equal((await f.request(path)).status, 400, path);
  }
  assert.equal((await f.request(`${BASE}/send`)).status, 404);
  assert.equal((await f.request(`${BASE}/evidence/../evidence?ref=${REF}&sha256=${HASH}`)).status, 404);
  assert.equal(f.state.calls, 0);
});

test('current login, manager identity and project access guard both API and HTML', async t => {
  const f = await fixture(t);
  for (const path of [BASE, pinQuery, PAGE]) {
    f.state.account = null; assert.equal((await f.request(path)).status, 401);
    f.state.account = { id: 'other.synthetic' }; assert.equal((await f.request(path)).status, 403);
    f.state.account = { id: 'manager.synthetic' }; f.state.allowed = false;
    assert.equal((await f.request(path)).status, 403); f.state.allowed = true;
  }
});

test('exact Host/Origin/fetch-site binding excludes cross-origin and rebinding reads', async t => {
  const f = await fixture(t);
  for (const headers of [{ host: 'attacker.example' }, { host: new URL(f.origin).host.replace('127.0.0.1', 'localhost') },
    { origin: 'https://attacker.example' }, { origin: `${f.origin}/` }, { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': '' }, { 'sec-fetch-site': 'none' }]) {
    assert.equal((await f.request(BASE, { headers })).status, 403);
  }
  assert.equal(f.state.calls, 0);
  assert.equal((await f.request(BASE, { headers: { origin: f.origin } })).status, 200);
  assert.equal((await f.request(PAGE, { headers: { 'sec-fetch-site': 'none' } })).status, 200);
  assert.equal((await f.request(PAGE, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  const unbound = await fixture(t, { allowedOrigin: 'https://attacker.example' });
  assert.equal((await unbound.request()).status, 403);
});

test('session rotation and project revocation after awaited I/O discard every result', async t => {
  for (const path of [BASE, pinQuery, PAGE]) {
    for (const revoke of ['session', 'account', 'project']) {
      const f = await fixture(t);
      f.state.afterRead = async () => {
        await Promise.resolve();
        if (revoke === 'session') f.state.session = 'rotated.synthetic';
        else if (revoke === 'account') f.state.account = { id: 'other.synthetic' };
        else f.state.allowed = false;
      };
      const result = await f.request(path);
      assert.equal(result.status, revoke === 'project' ? 403 : 401);
      assert.equal(result.body.includes(REF), false);
      assert.equal(result.body.includes('<html'), false);
    }
  }
  const f = await fixture(t);
  f.state.afterRead = async () => { f.state.afterProject = async () => { f.state.session = 'rotated.synthetic'; }; };
  assert.equal((await f.request()).status, 401, 'session is checked after awaited final project authorization');
});

test('controller checks the returned project even when service omits its project callback', async t => {
  const f = await fixture(t);
  f.service.snapshot = async () => ({ project_id: 'SYN-001', items: [record()], has_more: false });
  f.state.allowed = false;
  assert.equal((await f.request()).status, 403);
});

test('controller refuses a detail service result that differs from the requested exact pin', async t => {
  const f = await fixture(t);
  f.state.afterRead = result => { result.sha256 = 'b'.repeat(64); };
  const result = await f.request(pinQuery);
  assert.equal(result.status, 409); assert.equal(result.body.includes(REF), false);
});

test('allowlisted metadata excludes raw model data, text and spoofed acceptance even in nested objects', async t => {
  const f = await fixture(t);
  const privateText = 'synthetic private body <script>never render</script>';
  f.state.afterRead = result => {
    const item = result.items?.[0] ?? result;
    result.raw_stdout = privateText; item.model_input = privateText; item.text = privateText;
    item.review.text = privateText; item.evidence_refs[0].body = privateText;
    item.human_acceptance = 'ACCEPTED'; item.official_done = true; item.owner_decision_required = true;
  };
  for (const path of [BASE, pinQuery]) {
    const response = await f.request(path); assert.equal(response.status, 200);
    assert.equal(response.body.includes(privateText), false);
    assert.equal(response.body.includes('model_input'), false);
    const item = response.json().items?.[0] ?? response.json();
    assert.equal(item.human_acceptance, 'UNKNOWN'); assert.equal(item.official_done, false);
    assert.equal(item.owner_decision_required, false);
  }
  f.state.afterRead = result => { result.items[0].reason = privateText; };
  assert.equal((await f.request()).status, 503);
  f.service.snapshot = async () => { throw Object.assign(new Error(privateText), { status: 400, code: privateText }); };
  const error = await f.request(); assert.equal(error.status, 503);
  assert.deepEqual(error.json(), { hold_code: 'FEEDBACK_READBOX_UNAVAILABLE' });
});

test('disabled and unavailable readers fail closed without exposing a shell', async t => {
  for (const enabled of [true, false]) {
    const f = await fixture(t, { service: null, enabled });
    for (const path of [BASE, PAGE]) assert.equal((await f.request(path)).status, enabled ? 503 : 404);
  }
});

test('HTML contains no evidence and permits only the exact static fetch script', async t => {
  const f = await fixture(t), response = await f.request(PAGE);
  assert.equal(response.status, 200); assert.match(response.headers['content-type'], /^text\/html/u);
  assert.equal(response.body.includes(REF), false);
  assert.equal(response.body.includes('SYN-001'), false);
  const script = response.body.match(/<script>([\s\S]*?)<\/script>/u)[1];
  assert.equal(script, feedbackReadboxScript);
  const digest = createHash('sha256').update(script).digest('base64');
  assert.ok(response.headers['content-security-policy'].includes(`'sha256-${digest}'`));
  assert.match(response.headers['content-security-policy'], /connect-src 'self'/u);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/u);
});

function browserFixture(fetch) {
  const nodes = [];
  const scrollEvents = [];
  let focused = null, scrolled = null;
  const node = tagName => {
    const value = { tagName, children: [], listeners: {}, attributes: {}, textContent: '', append(child) { this.children.push(child); },
      replaceChildren() { this.children = []; }, addEventListener(event, fn) { this.listeners[event] = fn; },
      setAttribute(name, content) { this.attributes[name] = content; },
      focus() { focused = this; }, scrollIntoView() {
        scrolled = this; scrollEvents.push({ text: textOf(this), busy: this.attributes['aria-busy'] });
      } };
    Object.defineProperty(value, 'innerHTML', { set() { assert.fail('No HTML interpolation is permitted'); } });
    nodes.push(value); return value;
  };
  const elements = Object.fromEntries(['status', 'items', 'detail', 'refresh', 'next'].map(id => [id, node()]));
  runInNewContext(feedbackReadboxScript, {
    document: { getElementById: id => elements[id], createElement: node }, URLSearchParams, fetch,
  });
  return { nodes, elements, scrollEvents, focus: () => focused, scroll: () => scrolled };
}
const settled = () => new Promise(resolve => setImmediate(resolve));
const textOf = node => [node.textContent, ...node.children.map(textOf)].join('\n');

test('browser script uses safe text nodes, accessible detail and exact same-origin metadata fetches', async () => {
  const malicious = '<img src=x onerror=alert(1)>', item = { ...record(), reason: malicious };
  const calls = [];
  const browser = browserFixture(async (path, options) => {
    calls.push({ path, options }); return { ok: true, json: async () =>
      calls.length === 1 ? { project_id: 'SYN-001', items: [item], has_more: false } : { project_id: 'SYN-001', ...item } };
  });
  const { nodes, elements } = browser;
  await settled();
  assert.equal(elements.detail.hidden, true);
  assert.match(textOf(elements.items), /결과 후보 보고됨/u);
  assert.match(textOf(elements.items), /검토 결과: 검토 통과/u);
  assert.equal(textOf(elements.items).includes(malicious), false);
  const detailButton = nodes.find(value => value.textContent === '상세 근거 보기');
  await detailButton.listeners.click();
  assert.equal(detailButton.attributes['aria-controls'], 'detail');
  assert.equal(detailButton.attributes['aria-expanded'], 'true');
  assert.equal(elements.detail.hidden, false);
  assert.equal(elements.detail.attributes['aria-busy'], 'false');
  assert.equal(browser.focus(), elements.detail); assert.equal(browser.scroll(), elements.detail);
  assert.equal(browser.scrollEvents.length, 2);
  assert.match(browser.scrollEvents[0].text, /불러오는 중/u);
  assert.ok(browser.scrollEvents[1].text.includes(HASH), 'final scroll runs after the full detail is rendered');
  assert.equal(browser.scrollEvents[1].busy, 'false');
  assert.equal(calls[0].path, `${BASE}?limit=50`); assert.equal(calls[1].path, pinQuery);
  for (const call of calls) {
    assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.redirect, 'error'); assert.equal(call.options.method, undefined);
  }
  const technical = elements.detail.children.find(value => value.tagName === 'details');
  assert.ok(technical); assert.notEqual(technical.open, true);
  assert.ok(textOf(technical).includes(malicious), 'API metadata remains text inside a collapsed disclosure');
  assert.ok(textOf(elements.detail.children.find(value => value.tagName === 'dl')).includes(HASH));
  assert.match(textOf(elements.detail), /실제 사람 수락: 확인 안 됨 · 공식 완료: 확인하지 않음/u);
});

test('browser labels execution uncertainty and Buzz ACK separately without promoting acceptance', async () => {
  const item = { ...record(), state: 'execution_unknown', buzz_delivery: 'ACKNOWLEDGED', review: { status: 'HOLD' } };
  const browser = browserFixture(async () => ({ ok: true, json: async () => ({ project_id: 'SYN-001', items: [item], has_more: false }) }));
  await settled();
  const text = textOf(browser.elements.items);
  assert.match(text, /실행 상태 확인 안 됨/u); assert.match(text, /검토 결과: 검토 보류/u);
  assert.match(text, /로컬 기록: 저장됨 · Buzz 전달: 전달 확인됨\(ACK\)/u);
  assert.match(text, /실제 사람 수락: 확인 안 됨 · 공식 완료: 확인하지 않음/u);
  assert.doesNotMatch(text, /책임자 판단 필요|EXECUTION_UNKNOWN|ACKNOWLEDGED|HOLD|UNKNOWN/u);
});

test('browser paging clears detail and refresh rejection cannot be replaced by stale evidence', async () => {
  let respondDetail, rejected = false;
  const calls = [], cursor = 'a'.repeat(40), item = { ...record(), locator: 'r:1' };
  const browser = browserFixture(async path => {
    calls.push(path);
    if (path.includes('/evidence?')) return new Promise(resolve => { respondDetail = resolve; });
    if (rejected) return { ok: false, status: 403 };
    return { ok: true, json: async () => ({ project_id: 'SYN-001', items: path.includes('cursor=') ? [] : [item],
      has_more: !path.includes('cursor='), next_cursor: path.includes('cursor=') ? null : cursor }) };
  });
  const { elements } = browser;
  await settled();
  assert.equal(elements.next.disabled, false);
  const click = browser.nodes.find(value => value.textContent === '상세 근거 보기').listeners.click();
  assert.equal(elements.detail.hidden, false); assert.match(textOf(elements.detail), /불러오는 중/u);
  assert.equal(elements.detail.attributes['aria-busy'], 'true');
  assert.equal(calls[1], `${pinQuery}&locator=r%3A1`);
  rejected = true;
  await elements.refresh.listeners.click();
  assert.equal(elements.status.textContent, '현재 과제 접근 권한이 없습니다.');
  assert.equal(elements.items.children.length, 0); assert.equal(elements.detail.children.length, 0);
  assert.equal(elements.detail.hidden, true); assert.equal(elements.next.disabled, true);
  respondDetail({ ok: true, json: async () => ({ project_id: 'SYN-001', ...item }) });
  await click;
  assert.equal(elements.detail.children.length, 0, 'obsolete evidence cannot reappear after refresh');
  assert.equal(browser.scrollEvents.length, 1, 'obsolete evidence must not move the refreshed page');
  rejected = false;
  await elements.refresh.listeners.click();
  await elements.next.listeners.click();
  assert.equal(calls.at(-1), `${BASE}?limit=50&cursor=${cursor}`);
  assert.match(textOf(elements.items), /현재 표시할 기록이 없습니다/u);
  assert.equal(elements.next.disabled, true); assert.equal(elements.detail.hidden, true);
});

test('browser aligns a current detail error once after rendering without scrolling for stale errors', async () => {
  let respondDetail;
  const browser = browserFixture(async path => path.includes('/evidence?')
    ? new Promise(resolve => { respondDetail = resolve; })
    : { ok: true, json: async () => ({ project_id: 'SYN-001', items: [record()], has_more: false }) });
  await settled();
  const button = browser.nodes.find(value => value.textContent === '상세 근거 보기');
  const first = button.listeners.click();
  assert.equal(browser.scrollEvents.length, 1);
  respondDetail({ ok: false, status: 403 });
  await first;
  assert.equal(browser.scrollEvents.length, 2);
  assert.match(browser.scrollEvents[1].text, /현재 과제 접근 권한이 없습니다/u);
  assert.equal(browser.scrollEvents[1].busy, 'false');
  const stale = button.listeners.click();
  await browser.elements.refresh.listeners.click();
  respondDetail({ ok: false, status: 401 });
  await stale;
  assert.equal(browser.scrollEvents.length, 3, 'only the stale request loading state may scroll');
  assert.equal(browser.elements.detail.hidden, true);
});
