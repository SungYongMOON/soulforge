import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOwnerAttentionLoopbackAdapter } from '../src/owner_attention_service.mjs';
import { makeAttentionFixture } from './owner_attention_fixture.mjs';

function action(row, action, minutes) { return {request_key:row.request_key,source_sha256:row.source_sha256,view_version:row.view_version,action,...(minutes ? {minutes} : {})}; }
function route(f) { return {owner_account_id:f.owner.id,purpose:'owner_attention',active:true,binding_sha256:'a'.repeat(64),destination_ref:'buzz-owner:synthetic-exact',expires_at:new Date(f.now()+86400000).toISOString()}; }

test('seen is persistent view state, snooze expires, stale action conflicts and source response closes separately', t => {
  const f = makeAttentionFixture(t,{persistent:true}); f.publish();
  let row = f.service.snapshot(f.access).items[0]; const stale = action(row,'seen');
  f.service.act(f.access,stale);
  assert.throws(() => f.service.act(f.access,stale),/ATTENTION_VIEW_CHANGED/);
  f.reopen(); row = f.service.snapshot(f.access).items[0];
  assert.ok(row.seen_at); assert.equal(row.source_state,'awaiting');
  f.service.act(f.access,action(row,'snooze',30));
  f.reopen(); assert.equal(f.service.snapshot(f.access).items[0].snoozed,true);
  f.clock.value += 31*60000;
  const snap = f.service.snapshot(f.access); assert.equal(snap.items[0].snoozed,false);
  assert.equal(snap.notification.counts.pending,1);
  assert.equal(f.service.snapshot(f.access).notification.counts.pending,1);
});

test('repeated polling produces only one new event; due threshold adds one aggregate event', t => {
  const f = makeAttentionFixture(t), due = Math.floor((f.now()+7200000)/1000);
  f.publish({client_session_ref:`oa1:review_document:1:${due}`});
  for(let i=0;i<4;i++) assert.equal(f.service.snapshot(f.access).notification.counts.pending,1);
  f.clock.value += 3600001;
  for(let i=0;i<4;i++) assert.equal(f.service.snapshot(f.access).notification.counts.pending,2);
});

test('superseded and revoked sources cancel pending delivery without claiming a response', t => {
  const f = makeAttentionFixture(t); f.publish(); f.service.snapshot(f.access);
  f.publish({client_session_ref:'oa1:review_document:2:none',summary:'새 판본 요청'});
  let snap = f.service.snapshot(f.access); assert.equal(snap.notification.counts.cancelled,1); assert.equal(snap.notification.counts.pending,1);
  f.state.access = false; snap = f.service.snapshot(f.access);
  assert.equal(snap.items.length,0); assert.deepEqual(snap.notification.counts,{});
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM owner_attention_outbox WHERE status='cancelled'").get().n,2);
  f.state.access = true;
  // Re-granting access doesn't resurrect an already cancelled notification.
  assert.equal(f.service.snapshot(f.access).notification.counts.pending,undefined);
});

test('exact source revision, current session and current project scope fence all actions', t => {
  const f = makeAttentionFixture(t); f.publish(); const row = f.service.snapshot(f.access).items[0];
  assert.throws(() => f.service.act(f.access,{...action(row,'seen'),source_sha256:'f'.repeat(64)}),/ATTENTION_REQUEST_CHANGED/);
  f.state.access = false; assert.throws(() => f.service.act(f.access,action(row,'seen')),/ATTENTION_REQUEST_NOT_FOUND/);
  f.state.active = false; assert.throws(() => f.service.snapshot(f.access),/OWNER_ACCESS_REQUIRED/);
});

test('a bad source snapshot rolls back reconcile; no empty success is returned', t => {
  const f = makeAttentionFixture(t); f.publish(); f.service.snapshot(f.access);
  f.store.db.prepare("UPDATE erp_mcp_work_session SET summary='mutated'").run();
  assert.throws(() => f.service.snapshot(f.access),/ATTENTION_SOURCE_DIGEST_MISMATCH/);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM owner_attention_outbox WHERE status='pending'").get().n,1);
});

test('source text cannot supply a Buzz route; a trusted exact resolver can, unsafe protocols remain unavailable', t => {
  let link = null;
  const f = makeAttentionFixture(t,{serviceOptions:{resolveBuzzLink:row => link ? {...row,url:link,active:true,expires_at:'2030-01-01T00:00:00Z'} : null}}); f.publish();
  assert.equal(f.service.snapshot(f.access).items[0].buzz_url,null);
  link = 'javascript:alert(1)'; assert.equal(f.service.snapshot(f.access).items[0].buzz_url,null);
  link = 'https://buzz.example.invalid/conversations/exact-synthetic'; assert.equal(f.service.snapshot(f.access).items[0].buzz_url,link);
  link = 'buzz://channel/11111111-2222-3333-8444-555555555555'; assert.equal(f.service.snapshot(f.access).items[0].buzz_url,link);
  link += '?command=run'; assert.equal(f.service.snapshot(f.access).items[0].buzz_url,null);
});

test('missing notification route sends nothing; one exact Owner-only delivery aggregates and never repeats', async t => {
  const sends=[];
  const f = makeAttentionFixture(t,{serviceOptions:{adapter:{async send(payload,{authorize}) { authorize(); sends.push(payload); return {status:'delivered',attempt_id:payload.attempt_id,receipt_ref:'synthetic-receipt:one'}; }}}});
  f.publish(); f.service.snapshot(f.access);
  await assert.rejects(() => f.service.dispatch(f.access),/NOTIFICATION_ROUTE_UNAVAILABLE/); assert.equal(sends.length,0);
  f.state.route = route(f); const result = await f.service.dispatch(f.access);
  assert.equal(result.status,'delivered'); assert.equal(sends.length,1); assert.equal(sends[0].request_count,1);
  assert.equal(JSON.stringify(sends).includes('외부 제출'),false); assert.equal(Object.hasOwn(sends[0],'summary'),false);
  f.clock.value+=61000; assert.equal((await f.service.dispatch(f.access)).status,'idle');
});

test('lost delivery result persists as unknown across restart and is never automatically retransmitted', async t => {
  let calls=0;
  const f = makeAttentionFixture(t,{persistent:true,serviceOptions:{adapter:{async send(){calls++;throw new Error('after possible delivery');}}}});
  f.state.route=route(f); f.publish(); assert.equal((await f.service.dispatch(f.access)).status,'delivery_unknown');
  f.reopen(); f.clock.value+=61000;
  assert.equal((await f.service.dispatch(f.access)).status,'idle'); assert.equal(calls,1);
  assert.equal(f.service.snapshot(f.access).notification.counts.delivery_unknown,1);
});

test('concurrent dispatchers share a claim; route revocation at adapter boundary yields no trusted success', async t => {
  let release, entered; const began=new Promise(r=>{entered=r;});
  const f=makeAttentionFixture(t,{serviceOptions:{adapter:{async send(payload,{authorize}) {entered();await new Promise(r=>{release=r;});authorize();return {status:'delivered',attempt_id:payload.attempt_id,receipt_ref:'synthetic-receipt:x'};}}}});
  f.publish();f.state.route=route(f);
  const first=f.service.dispatch(f.access);await began;
  assert.equal((await f.service.dispatch(f.access)).status,'idle');
  f.state.route.active=false;release(); assert.equal((await first).status,'delivery_unknown');
});

test('explicit not-sent proof allows bounded retries, at most three attempts', async t => {
  let calls=0;
  const f=makeAttentionFixture(t,{serviceOptions:{adapter:{async send(p){calls++;return {status:'not_sent',attempt_id:p.attempt_id,receipt_ref:`synthetic-receipt:not-sent-${calls}`};}}}});
  f.publish();f.state.route=route(f);
  for(let i=0;i<3;i++){await f.service.dispatch(f.access);f.clock.value+=61000;}
  assert.equal((await f.service.dispatch(f.access)).status,'idle');assert.equal(calls,3);
  assert.equal(f.service.snapshot(f.access).notification.counts.held,1);
});

test('lease recovery fences a late delivered reply and leaves the durable outcome unknown', async t => {
  let entered, release; const began=new Promise(r=>{entered=r;});
  const f=makeAttentionFixture(t,{serviceOptions:{adapter:{async send(payload){entered();await new Promise(r=>{release=r;});return {status:'delivered',attempt_id:payload.attempt_id,receipt_ref:'synthetic-receipt:late'};}}}});
  f.publish();f.state.route=route(f);const running=f.service.dispatch(f.access);await began;
  f.clock.value+=61000;assert.equal(f.service.snapshot(f.access).notification.counts.delivery_unknown,1);
  release();assert.equal((await running).status,'delivery_unknown');assert.equal(f.service.snapshot(f.access).notification.counts.delivery_unknown,1);
});

test('real short loopback adapter uses exact JSON receipt; redirect/oversized replies are unknown and never retried', async t => {
  let calls=0, mode='ok';
  const server=createServer(async(req,res)=>{calls++;const chunks=[];for await(const c of req)chunks.push(c);const p=JSON.parse(Buffer.concat(chunks));
    if(mode==='redirect'){res.writeHead(302,{Location:'/other'});res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(mode==='large' ? 'x'.repeat(5000) : JSON.stringify({status:'delivered',attempt_id:p.attempt_id,receipt_ref:'synthetic-receipt:loopback'}));});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
  let adapter;
  const f=makeAttentionFixture(t,{serviceOptions:{adapter:{send:(...args)=>adapter.send(...args)}}});f.publish();f.state.route=route(f);
  const endpoint=`http://127.0.0.1:${server.address().port}/owner-notify`;
  assert.throws(()=>createOwnerAttentionLoopbackAdapter({endpoint}),/exact_owner_notification_binding_required/);
  adapter=createOwnerAttentionLoopbackAdapter({endpoint,binding:f.state.route});
  await assert.rejects(()=>adapter.send({owner_account_id:'foreign'},{authorize:()=>true}),/NOTIFICATION_ADAPTER_BINDING_CHANGED/);
  assert.equal(calls,0);
  assert.equal((await f.service.dispatch(f.access)).status,'delivered');assert.equal(calls,1);
  mode='redirect';f.clock.value+=61000;f.publish({client_session_ref:'oa1:second:1:none'});
  assert.equal((await f.service.dispatch(f.access)).status,'delivery_unknown');assert.equal(calls,2);
  mode='large';f.clock.value+=61000;f.publish({client_session_ref:'oa1:third:1:none'});
  assert.equal((await f.service.dispatch(f.access)).status,'delivery_unknown');assert.equal(calls,3);
});
