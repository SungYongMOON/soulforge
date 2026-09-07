import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAttentionFixture } from './owner_attention_fixture.mjs';

test('only explicit response requests are projected; ordinary completion, idle and technical HOLD stay out', t => {
  const f = makeAttentionFixture(t);
  for (const request_kind of ['review/mail','completion','technical_hold','idle']) f.publish({request_kind});
  assert.deepEqual(f.source.read(f.owner.id), []);
  const request = f.publish(); const rows = f.source.read(f.owner.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].source_ref, `work-session:${request.work_session_id}`);
  assert.equal(rows[0].source_state,'awaiting'); assert.equal(rows[0].due_at,null);
});

test('new request requires a stable correlation, contiguous revision and explicit next action / blocked work', t => {
  for (const override of [{client_session_ref:'guess'}, {client_session_ref:'oa1:test:2:none'}, {next_actions:[]}, {stop_conditions:[]}, {outputs:['raw conversation body']}]) {
    const f = makeAttentionFixture(t); f.publish(override);
    assert.throws(() => f.source.read(f.owner.id), /ATTENTION_/);
  }
});

test('repeat immutable payload deduplicates; changed same revision fails closed; successor preserves superseded history', t => {
  const f = makeAttentionFixture(t); f.publish(); f.publish();
  assert.equal(f.source.read(f.owner.id).length,1);
  f.publish({client_session_ref:'oa1:review_document:2:none',summary:'새 제목안을 확인해 주세요.'});
  const rows = f.source.read(f.owner.id);
  assert.deepEqual(rows.map(r => r.source_state),['superseded','awaiting']);
  assert.notEqual(rows[0].request_key,rows[1].request_key);
  f.publish({client_session_ref:'oa1:review_document:2:none',summary:'다른 질문으로 위장'});
  assert.throws(() => f.source.read(f.owner.id),/ATTENTION_REVISION_CONFLICT/);
});

test('bot response self-report stays open; exact current Owner-authored work-session closes without changing task status', t => {
  const f = makeAttentionFixture(t), request = f.publish();
  f.publish({request_kind:'owner_attention/responded',outputs:[`owner-request:${request.work_session_id}`,'owner-response:unresolved']});
  assert.equal(f.source.read(f.owner.id)[0].source_state,'response_unverified');
  const ownerResponse = f.publish({request_kind:'owner_attention/response',summary:'합성 제목 A로 진행해 주세요.',outputs:[`owner-request:${request.work_session_id}`]},f.owner);
  const row = f.source.read(f.owner.id)[0];
  assert.equal(row.source_state,'responded'); assert.equal(row.closure_ref,`work-session:${ownerResponse.work_session_id}`);
  assert.notEqual(f.store.db.prepare('SELECT status FROM core_item WHERE id=?').get(f.item.id).status,'done');
});

test('wrong actor, task, revision or backlink cannot turn a reported response into an Owner answer', t => {
  const f = makeAttentionFixture(t), request = f.publish();
  f.publish({request_kind:'owner_attention/response',outputs:[`owner-request:${request.work_session_id}`]});
  f.publish({request_kind:'owner_attention/response',client_session_ref:'oa1:other:1:none',outputs:[`owner-request:${request.work_session_id}`]},f.owner);
  f.publish({request_kind:'owner_attention/response',outputs:['owner-request:wrong']},f.owner);
  const other = f.store.createItem({project_id:'SYN-ATTENTION',title:'다른 합성 업무',assignee_ref:f.bot.email}).item;
  f.publish({item_id:other.id,request_kind:'owner_attention/response',outputs:[`owner-request:${request.work_session_id}`]},f.owner);
  assert.equal(f.source.read(f.owner.id)[0].source_state,'awaiting');
});

test('trusted Buzz evidence must bind current Owner, exact source digest and reported response', t => {
  let proof = null;
  const f = makeAttentionFixture(t,{sourceOptions:{verifyBuzzResponse:() => proof}}), request = f.publish();
  f.publish({request_kind:'owner_attention/responded',outputs:[`owner-request:${request.work_session_id}`,'owner-response:buzz-current']});
  const row = f.source.read(f.owner.id)[0];
  proof = {verified:true,active:true,expires_at:'2030-01-01T00:00:00Z',owner_account_id:'foreign',source_ref:row.source_ref,source_sha256:row.source_sha256,response_ref:'owner-response:buzz-current',receipt_ref:'buzz-receipt:verified'};
  assert.equal(f.source.read(f.owner.id)[0].source_state,'response_unverified');
  proof.owner_account_id = f.owner.id;
  assert.equal(f.source.read(f.owner.id)[0].source_state,'responded');
  proof.active = false; assert.equal(f.source.read(f.owner.id)[0].source_state,'response_unverified');
  proof.active = true; proof.expires_at = '2020-01-01T00:00:00Z'; assert.equal(f.source.read(f.owner.id)[0].source_state,'response_unverified');
});

test('withdrawal needs original source and current revision; prior actor cannot close another actor request', t => {
  const f = makeAttentionFixture(t), request = f.publish();
  f.publish({request_kind:'owner_attention/withdrawn',outputs:[`owner-request:${request.work_session_id}`]});
  assert.equal(f.source.read(f.owner.id)[0].source_state,'withdrawn');
  const bad = makeAttentionFixture(t); bad.publish(); bad.publish({request_kind:'owner_attention/withdrawn',outputs:['owner-request:wrong']});
  assert.throws(() => bad.source.read(bad.owner.id),/ATTENTION_CLOSURE_CONFLICT/);
});

test('current sender assignment/account and exact Owner identity are checked on every read', t => {
  const f = makeAttentionFixture(t); f.publish();
  assert.throws(() => f.source.read(f.bot.id),/OWNER_ACCESS_REQUIRED/);
  f.store.db.prepare("UPDATE core_account SET status='disabled' WHERE id=?").run(f.bot.id);
  assert.deepEqual(f.source.read(f.owner.id),[]);
  f.store.db.prepare("UPDATE core_account SET status='active' WHERE id=?").run(f.bot.id);
  f.store.db.prepare("UPDATE core_item SET assignee_ref='other@example.invalid' WHERE id=?").run(f.item.id);
  assert.deepEqual(f.source.read(f.owner.id),[]);
  f.store.db.prepare("UPDATE core_account SET status='disabled' WHERE id=?").run(f.owner.id);
  assert.throws(() => f.source.read(f.owner.id),/OWNER_ACCESS_REQUIRED/);
});

test('modified source bytes without an updated published digest and unsupported namespace refuse a false healthy snapshot', t => {
  const f = makeAttentionFixture(t); f.publish();
  f.store.db.prepare("UPDATE erp_mcp_work_session SET summary='tampered'").run();
  assert.throws(() => f.source.read(f.owner.id),/ATTENTION_SOURCE_DIGEST_MISMATCH/);
  const g = makeAttentionFixture(t); g.publish({request_kind:'owner_attention/unknown'});
  assert.throws(() => g.source.read(g.owner.id),/ATTENTION_EVENT_UNSUPPORTED/);
});
