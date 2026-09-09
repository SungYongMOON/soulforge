import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBuzzPilotCombinedAttentionFixture } from './helpers/buzz_pilot_combined_attention_fixture.mjs';

const call = async (origin, path, { cookie, body, csrf } = {}) => {
  const response = await fetch(`${origin}${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie } : {}),
      ...(body ? { origin, 'content-type': 'application/json' } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], body: await response.json() };
};

test('an unreadable native Buzz source never hides another bot\'s waiting request', { timeout: 40000 }, async t => {
  const f = await makeBuzzPilotCombinedAttentionFixture(); t.after(f.close);
  const origin = f.server.origin;
  const login = await call(origin, '/api/auth/login', { body: { username: 'combined-owner', password: 'synthetic-combined-only' } });
  assert.equal(login.status, 200); const cookie = login.cookie;

  // Both sources join in one inbox before anything breaks.
  const before = await call(origin, '/api/owner-attention', { cookie });
  assert.equal(before.status, 200, JSON.stringify(before.body));
  const legacyBefore = before.body.items.find(row => row.source_kind !== 'buzz_pilot');
  const nativeBefore = before.body.items.find(row => row.source_kind === 'buzz_pilot');
  assert.ok(legacyBefore, `expected the MCP request: ${JSON.stringify(before.body.items)}`);
  assert.ok(nativeBefore, `expected the native question: ${JSON.stringify(before.body.items)}`);
  assert.equal(legacyBefore.source_ref, `work-session:${f.published.work_session_id}`);
  assert.equal(legacyBefore.project_id, 'SYN-002');
  assert.equal(nativeBefore.project_id, 'SYN-001');
  assert.equal(before.body.native_source_state, 'waiting_owner');
  assert.equal(before.body.operations_attention, false);

  // The native lane re-issues its binding; the viewer's pinned digest no longer
  // matches, so the native question can no longer be read.
  await f.reissueBinding();

  const after = await call(origin, '/api/owner-attention', { cookie });
  assert.equal(after.status, 200, `native source failure must not blank the inbox: ${JSON.stringify(after.body)}`);
  assert.equal(after.body.items.some(row => row.source_kind === 'buzz_pilot'), false,
    'an unreadable native question must not be shown as a live request');
  const legacyAfter = after.body.items.find(row => row.request_key === legacyBefore.request_key);
  assert.ok(legacyAfter, `the other bot's request must stay visible: ${JSON.stringify(after.body.items)}`);
  assert.equal(legacyAfter.source_state, 'awaiting');
  assert.equal(after.body.native_source_state, 'unavailable');
  assert.equal(after.body.operations_attention, true);
  assert.equal(typeof after.body.native_source_error, 'string');

  // The Owner can still work the requests that are readable.
  const seen = await call(origin, '/api/owner-attention/actions', { cookie, csrf: after.body.csrf_token,
    body: { request_key: legacyAfter.request_key, source_sha256: legacyAfter.source_sha256,
      view_version: legacyAfter.view_version, action: 'seen' } });
  assert.equal(seen.status, 200, JSON.stringify(seen.body));
  assert.ok(seen.body.item.seen_at);

  // A native request key cannot be acted on while its source is unreadable.
  const blocked = await call(origin, '/api/owner-attention/actions', { cookie, csrf: after.body.csrf_token,
    body: { request_key: nativeBefore.request_key, source_sha256: nativeBefore.source_sha256,
      view_version: nativeBefore.view_version, action: 'seen' } });
  assert.equal(blocked.status, 404);
});
