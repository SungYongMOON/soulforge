import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOwnerAttentionNotifyFixture } from './helpers/owner_attention_notify_fixture.mjs';

const REQUEST = {
  client_session_ref: 'oa1:review_document:1:none', request_kind: 'owner_attention/request',
  summary: '외부 제출 후보의 공개 범위를 확인해 주세요.',
  knowledge: '내부 작성과 검증을 마쳤습니다. 외부 반출만 검토를 기다립니다.',
  outputs: ['artifact:synthetic-document-r1'], verification: '합성 문서의 구조와 내용 검증을 통과했습니다.',
  next_actions: ['Buzz에서 외부 반출 승인 여부와 변경할 공개 범위를 알려 주세요.'],
  stop_conditions: ['외부 반출만 보류합니다. 독립적인 내부 개발과 수정은 계속합니다.'],
};

async function login(origin, username, password) {
  const response = await fetch(`${origin}/api/auth/login`, { method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ username, password }) });
  assert.equal(response.status, 200, `login ${username}`);
  return response.headers.get('set-cookie')?.split(';')[0];
}
async function mintToken(origin, cookie) {
  const response = await fetch(`${origin}/api/integrations/mcp/tokens`, { method: 'POST',
    headers: { cookie, origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ label: 'synthetic notify bot', expires_in_days: 30 }) });
  assert.equal(response.status, 201, 'mint MCP token');
  return (await response.json()).token;
}
async function publish(origin, token, body) {
  return fetch(`${origin}/api/mcp/work-sessions`, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body) });
}
async function settle(received, expected, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && received.length < expected) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  return received;
}

test('a bot publishing through the existing MCP route reaches the notifier without the Owner opening the inbox',
  { timeout: 60000 }, async t => {
    const f = await makeOwnerAttentionNotifyFixture(); t.after(f.close);
    const origin = f.server.origin;
    // The Owner signs in once and never opens /owner-attention.html in this test.
    const ownerCookie = await login(origin, 'notify-owner', f.ownerPassword);
    const botCookie = await login(origin, 'notify-bot', f.botPassword);
    const token = await mintToken(origin, botCookie);

    const published = await publish(origin, token, { ...REQUEST, item_id: f.item.id, idempotency_key: 'notify-r1' });
    assert.equal(published.status, 201, JSON.stringify(await published.text()));

    const received = await settle(f.received, 1);
    assert.equal(received.length, 1, `the notifier must be reached from the bot's publish: ${JSON.stringify(received)}`);
    const payload = received[0].payload;
    assert.equal(payload.purpose, 'owner_attention');
    assert.equal(payload.owner_account_id, f.ownerAccountId);
    assert.equal(payload.destination_ref, f.destinationRef);
    assert.equal(payload.binding_sha256, f.bindingSha256);
    assert.equal(payload.request_count, 1);
    assert.equal(Array.isArray(payload.events) && payload.events.length >= 1, true);
    // A fixed count and event identity only: no request prose crosses the adapter.
    const wire = JSON.stringify(payload);
    for (const prose of [REQUEST.summary, REQUEST.knowledge, REQUEST.verification, REQUEST.next_actions[0]]) {
      assert.equal(wire.includes(prose), false, `prose must not cross the adapter: ${prose}`);
    }

    // The replayed publish is the same ask, so it does not become a second ping.
    const replay = await publish(origin, token, { ...REQUEST, item_id: f.item.id, idempotency_key: 'notify-r1' });
    assert.equal(replay.status, 200);
    await settle(f.received, 2, 2000);
    assert.equal(f.received.length, 1, 'a replayed publish must not send again');

    // Verified from the Owner side afterwards; this read is not the trigger.
    const snapshot = await fetch(`${origin}/api/owner-attention`,
      { headers: { cookie: ownerCookie, 'sec-fetch-site': 'same-origin' } });
    assert.equal(snapshot.status, 200);
    const body = await snapshot.json();
    assert.equal(body.notification.capability, 'configured');
    assert.equal(body.notification.counts.delivered, 1);
    assert.equal(body.items.length, 1);
  });

test('registrations during a send and inside the interval limit are still delivered without another publish or the inbox being opened',
  { timeout: 240000 }, async t => {
    const f = await makeOwnerAttentionNotifyFixture({ firstResponseDelayMs: 1500 }); t.after(f.close);
    const origin = f.server.origin;
    const ownerCookie = await login(origin, 'notify-owner', f.ownerPassword);
    const token = await mintToken(origin, await login(origin, 'notify-bot', f.botPassword));
    const ask = (correlation, key) => publish(origin, token, { ...REQUEST, item_id: f.item.id,
      idempotency_key: key, client_session_ref: `oa1:${correlation}:1:none` });

    assert.equal((await ask('review_document', 'window-r1')).status, 201);
    await settle(f.received, 1, 4000);
    assert.equal(f.received.length, 1, 'the first registration sends immediately');
    assert.equal(f.received[0].payload.request_count, 1);

    // One registration lands while that send is still in flight, the next lands
    // inside the interval limit that follows it.
    const during = ask('second_topic', 'window-r2');
    await new Promise(r => setTimeout(r, 400));
    assert.equal((await during).status, 201);
    assert.equal((await ask('third_topic', 'window-r3')).status, 201);

    // From here the test publishes nothing more and never opens the inbox.
    const second = await settle(f.received, 2, 150000);
    assert.equal(second.length >= 2, true, `the parked requests must be delivered on their own: ${JSON.stringify(second.map(r => r.payload?.request_count))}`);
    const follow = second[1];
    assert.ok(follow.at - second[0].at >= 60000, 'the existing interval limit is preserved');
    assert.equal(follow.payload.purpose, 'owner_attention');
    assert.equal(follow.payload.destination_ref, f.destinationRef);
    assert.equal(follow.payload.request_count, 2, JSON.stringify(follow.payload));
    assert.equal(JSON.stringify(follow.payload).includes(REQUEST.summary), false);
    const keys = new Set(follow.payload.events.map(event => event.request_key));
    assert.equal(keys.size, 2, 'both parked requests are covered exactly once');

    // Read afterwards only to confirm; this is not what triggered the delivery.
    const body = await (await fetch(`${origin}/api/owner-attention`,
      { headers: { cookie: ownerCookie, 'sec-fetch-site': 'same-origin' } })).json();
    assert.equal(body.notification.capability, 'configured');
    assert.equal(body.notification.counts.delivered, 3);
    assert.equal(body.notification.counts.pending, undefined);
    assert.equal(body.items.length, 3);
  });

test('with no Owner-placed notifier configuration nothing is sent and the server behaves as before',
  { timeout: 60000 }, async t => {
    const f = await makeOwnerAttentionNotifyFixture({ configured: false }); t.after(f.close);
    const origin = f.server.origin;
    const ownerCookie = await login(origin, 'notify-owner', f.ownerPassword);
    const botCookie = await login(origin, 'notify-bot', f.botPassword);
    const token = await mintToken(origin, botCookie);
    assert.equal((await publish(origin, token, { ...REQUEST, item_id: f.item.id, idempotency_key: 'notify-off-r1' })).status, 201);
    await settle(f.received, 1, 2500);
    assert.equal(f.received.length, 0, 'default OFF must not reach any receiver');
    const body = await (await fetch(`${origin}/api/owner-attention`,
      { headers: { cookie: ownerCookie, 'sec-fetch-site': 'same-origin' } })).json();
    assert.equal(body.notification.capability, 'unavailable');
    assert.equal(body.items.length, 1);
  });
