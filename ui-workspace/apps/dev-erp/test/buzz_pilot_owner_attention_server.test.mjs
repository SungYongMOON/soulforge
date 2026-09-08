import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { makeBuzzPilotAuthHttpFixture } from './helpers/buzz_pilot_auth_http_fixture.mjs';

test('source Owner manages native question preferences through the real separate viewer without changing native or source records', {timeout:20000}, async t=>{
  const f=await makeBuzzPilotAuthHttpFixture();t.after(f.close);
  const request=async(origin,path,{cookie,body,csrf,site='same-origin'}={})=>{
    const response=await fetch(`${origin}${path}`,{method:body?'POST':'GET',
      headers:{'sec-fetch-site':site,...(cookie?{cookie}:{}),...(body?{origin,'content-type':'application/json'}:{}),
        ...(csrf?{'x-csrf-token':csrf}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,headers:response.headers,body:await response.json()};
  };
  const login=await request(f.sourceServer.origin,'/api/auth/login',{body:{username:'source-owner',password:'synthetic-source-only'}});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')?.split(';')[0];
  const sourceBefore=await readFile(f.sourceDb), nativeBefore=await readFile(f.binding.control_db_path);
  const origin=f.candidateServer.origin;
  const shell=await fetch(`${origin}/owner-attention.html`);
  assert.equal(shell.status,200);
  assert.equal((await shell.text()).split(`data-world-home href="${f.sourceServer.origin}/"`).length-1,2);
  assert.equal((await request(origin,'/api/owner-attention')).status,401);
  const first=await request(origin,'/api/owner-attention',{cookie});
  assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.items.length,1);
  const row=first.body.items[0];
  assert.equal(row.source_state,'awaiting');assert.equal(row.question,'이 합성 검토문의 독자는 누구인가요?');
  assert.equal(row.owner_account_id,'account.a');assert.ok(row.buzz_url.startsWith('buzz://message?'));
  assert.equal(first.body.notification.native_delivery.confirmed_request_count,1);
  assert.equal(first.body.notification.capability,'unavailable'); // Native delivery is not a new notifier route.
  const input={request_key:row.request_key,source_sha256:row.source_sha256,view_version:row.view_version,action:'seen'};
  assert.equal((await request(origin,'/api/owner-attention/actions',{cookie,body:input})).status,403);
  const seen=await request(origin,'/api/owner-attention/actions',{cookie,body:input,csrf:first.body.csrf_token});
  assert.equal(seen.status,200,JSON.stringify(seen.body));assert.ok(seen.body.item.seen_at);
  assert.equal(seen.body.item.source_state,'awaiting');
  assert.equal((await request(origin,'/api/owner-attention/actions',{cookie,body:input,csrf:first.body.csrf_token})).status,409);
  const snoozed=await request(origin,'/api/owner-attention/actions',{cookie,csrf:first.body.csrf_token,
    body:{...input,view_version:seen.body.item.view_version,action:'snooze',minutes:30}});
  assert.equal(snoozed.status,200);assert.equal(snoozed.body.item.snoozed,true);
  const state=await request(origin,'/api/workbench/buzz-pilot',{cookie});
  assert.equal(state.body.state,'waiting_owner');assert.equal(state.body.answer_ref,null);
  for(const path of ['/api/projects','/api/workbench/requests']) {
    assert.equal((await request(origin,path,{cookie,body:{}})).status,401);
  }
  assert.equal((await request(origin,'/api/owner-attention',{cookie,site:'cross-site'})).status,403);
  assert.deepEqual(await readFile(f.sourceDb),sourceBefore);
  assert.deepEqual(await readFile(f.binding.control_db_path),nativeBefore);
  assert.equal((await readFile(f.candidateDb)).includes(Buffer.from(row.question)),false);
  const source=new DatabaseSync(f.sourceDb);
  source.prepare('DELETE FROM auth_session WHERE account_id=?').run('account.a');source.close();
  assert.equal((await request(origin,'/api/owner-attention',{cookie})).status,401);
  const local=new DatabaseSync(f.candidateDb,{readOnly:true});
  assert.equal(local.prepare('SELECT COUNT(*) AS n FROM auth_session').get().n,0);
  assert.equal(local.prepare('SELECT COUNT(*) AS n FROM owner_attention_view').get().n,1);local.close();
});

test('a broken bound source never falls back to the viewer local administrator for native attention', {timeout:20000}, async t=>{
  const f=await makeBuzzPilotAuthHttpFixture({brokenSource:true});t.after(f.close);
  const origin=f.candidateServer.origin;
  const login=await fetch(`${origin}/api/auth/login`,{method:'POST',headers:{origin,'content-type':'application/json'},
    body:JSON.stringify({username:'candidate-local',password:'synthetic-candidate-only'})});
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  assert.equal(login.status,200);
  const response=await fetch(`${origin}/api/owner-attention`,{headers:{cookie,'sec-fetch-site':'same-origin'}});
  assert.equal(response.status,503);assert.equal((await response.json()).items,undefined);
});
