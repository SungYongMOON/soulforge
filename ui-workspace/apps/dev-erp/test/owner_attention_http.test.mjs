import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnerAttentionHttpController } from '../src/owner_attention_http.mjs';
import { makeAttentionFixture } from './owner_attention_fixture.mjs';

const origin='http://127.0.0.1:18776';
function request(path='/api/owner-attention',value,headers={}) {
  return Object.assign(Readable.from(value===undefined ? [] : [Buffer.from(JSON.stringify(value))]), {
    url:path,method:value===undefined?'GET':'POST',socket:{remoteAddress:'127.0.0.1'},
    headers:{host:'127.0.0.1:18776',origin,'sec-fetch-site':'same-origin','content-type':'application/json',...headers}});
}
async function call(http,req) {
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(b){this.body=b;}};
  await http(req,res,new URL(req.url,origin));
  if(res.headers['Content-Type']?.startsWith('application/json'))res.body=JSON.parse(res.body);
  return res;
}
function fixture(t,override={}) {
  const f=makeAttentionFixture(t),session={account:f.owner,key:'synthetic-session'};
  const http=createOwnerAttentionHttpController({service:f.service,allowedOrigin:origin,ownerAccountId:f.owner.id,
    currentAccount:()=>session.account,sessionKey:()=>session.key,canAccessProject:()=>f.state.access,...override});
  f.publish();return {...f,http,session};
}
const action=row=>({request_key:row.request_key,source_sha256:row.source_sha256,view_version:row.view_version,action:'seen'});

test('empty public shell contains no request data; API has no anonymous or non-Owner fallback',async t=>{
  const f=fixture(t);f.session.account=null;
  assert.equal((await call(f.http,request('/owner-attention.html'))).statusCode,200);
  assert.equal((await call(f.http,request())).statusCode,401);
  f.session.account=f.bot;assert.equal((await call(f.http,request())).statusCode,403);
  f.session.account=f.owner;const snap=await call(f.http,request());assert.equal(snap.statusCode,200);assert.equal(snap.body.items.length,1);
});

test('host/origin/fetch metadata/CSRF and rotated session reject before view mutation',async t=>{
  const f=fixture(t),snap=(await call(f.http,request())).body;
  for(const headers of [{host:'foreign.invalid'},{origin:'http://foreign.invalid'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':undefined}]){
    assert.equal((await call(f.http,request('/api/owner-attention',undefined,headers))).statusCode,403);
  }
  assert.equal((await call(f.http,request('/api/owner-attention/actions',action(snap.items[0])))).statusCode,403);
  f.session.key='rotated';assert.equal((await call(f.http,request('/api/owner-attention/actions',action(snap.items[0]),{'x-csrf-token':snap.csrf_token}))).statusCode,403);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM owner_attention_view').get().n,0);
});

test('actual action requires current request/version/access, and GET rejects failed sources rather than zero',async t=>{
  const f=fixture(t),snap=(await call(f.http,request())).body;
  const post=()=>request('/api/owner-attention/actions',action(snap.items[0]),{'x-csrf-token':snap.csrf_token});
  assert.equal((await call(f.http,post())).statusCode,200);assert.equal((await call(f.http,post())).statusCode,409);
  f.state.access=false;assert.equal((await call(f.http,post())).statusCode,404);
  f.state.access=true;f.store.db.prepare("UPDATE erp_mcp_work_session SET summary='altered'").run();
  const bad=await call(f.http,request());assert.equal(bad.statusCode,503);assert.equal(bad.body.status,'unavailable');assert.equal(bad.body.items,undefined);
});

test('logout while receiving a POST body prevents mutation; closed or oversized bodies reject',async t=>{
  const f=fixture(t),snap=(await call(f.http,request())).body;
  const req=request('/api/owner-attention/actions',action(snap.items[0]),{'x-csrf-token':snap.csrf_token});
  const original=req[Symbol.asyncIterator].bind(req);
  req[Symbol.asyncIterator]=async function*(){for await(const bytes of {[Symbol.asyncIterator]:original}){f.session.account=null;yield bytes;}};
  assert.equal((await call(f.http,req)).statusCode,401);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM owner_attention_view').get().n,0);
  f.session.account=f.owner;
  assert.equal((await call(f.http,request('/api/owner-attention/actions',{junk:'x'.repeat(3000)},{'x-csrf-token':snap.csrf_token}))).statusCode,413);
});

test('async native projection is awaited and session revocation hides late reads and actions',async t=>{
  const f=fixture(t);let revoke=false;
  const http=createOwnerAttentionHttpController({allowedOrigin:origin,ownerAccountId:f.owner.id,
    currentAccount:()=>f.session.account,sessionKey:()=>f.session.key,canAccessProject:()=>true,
    service:{async snapshot(access){await Promise.resolve();const result=f.service.snapshot(access);if(revoke)f.session.account=null;return result;},
      async act(access,input){await Promise.resolve();const result=f.service.act(access,input);if(revoke)f.session.account=null;return result;}}});
  const snap=await call(http,request());assert.equal(snap.statusCode,200);assert.equal(snap.body.items.length,1);
  revoke=true;
  assert.equal((await call(http,request())).statusCode,401);
  f.session.account=f.owner;
  assert.equal((await call(http,request('/api/owner-attention/actions',action(snap.body.items[0]),{'x-csrf-token':snap.body.csrf_token}))).statusCode,401);
});

test('real ERP server cookie login → explicitly published request → seen → restart persists; false Owner and default route reject',async t=>{
  const f=makeAttentionFixture(t,{persistent:true});const published=f.publish();
  const portServer=createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');
  const port=portServer.address().port;await new Promise(r=>portServer.close(r));assert.ok(![4192,4300].includes(port));
  const base=`http://127.0.0.1:${port}`,app=fileURLToPath(new URL('..',import.meta.url));
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,TMP:process.env.TMP,
    DEV_ERP_NO_TLS:'1',DEV_ERP_NO_REAL_META:'1',DEV_ERP_NO_FIXTURE:'1',DEV_ERP_BACKEND_ROOT:f.root,
    DEV_ERP_MCP_ENABLED:'1',DEV_ERP_MCP_ARTIFACT_ROOT:join(f.root,'artifacts'),
    DEV_ERP_OWNER_ATTENTION:'1',DEV_ERP_OWNER_ATTENTION_ACCOUNT_ID:f.owner.id};
  let child,output='';
  async function stop(){if(child?.exitCode===null&&child.signalCode===null){child.kill();await once(child,'exit');}}
  t.after(stop);
  async function start(){child=spawn(process.execPath,['server.mjs','--port',String(port),'--db',join(f.root,'erp.db'),'--no-fixture','--no-real-meta','--no-tls','--knowledge_shell_root',f.root,'--knowledge_dir',f.root],{cwd:app,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
    const started=Date.now();while(true){if(child.exitCode!==null)assert.fail(output);try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}
      if(Date.now()-started>15000)assert.fail(output);await new Promise(r=>setTimeout(r,30));}}
  async function http(path,body,cookie,csrf){const res=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{'sec-fetch-site':'same-origin',...(cookie?{cookie}:{}),...(body?{origin:base,'content-type':'application/json'}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body?JSON.stringify(body):undefined});
    return {status:res.status,cookie:res.headers.get('set-cookie')?.split(';')[0],body:await res.json()};}
  await start();assert.equal((await http('/api/owner-attention')).status,401);
  const login=()=>http('/api/auth/login',{username:'syntheticowner',password:'Synthetic-password-123!'});
  let owner=await login();assert.equal(owner.status,200);
  const snap=await http('/api/owner-attention',undefined,owner.cookie);assert.equal(snap.status,200);assert.equal(snap.body.items[0].source_ref,`work-session:${published.work_session_id}`);
  const secondWindow=await login();
  const secondSnapshot=await http('/api/owner-attention',undefined,secondWindow.cookie);
  assert.equal((await http('/api/owner-attention/actions',action(snap.body.items[0]),owner.cookie,snap.body.csrf_token)).status,200);
  assert.equal((await http('/api/owner-attention/actions',{...action(secondSnapshot.body.items[0]),action:'snooze',minutes:30},secondWindow.cookie,secondSnapshot.body.csrf_token)).status,409);
  await stop();await start();owner=await login();const after=await http('/api/owner-attention',undefined,owner.cookie);
  assert.ok(after.body.items[0].seen_at);assert.equal(after.body.items[0].source_state,'awaiting');
  assert.equal(after.body.notification.capability,'unavailable');
  const bot=await http('/api/auth/login',{username:'syntheticbot',password:'Synthetic-password-123!'});
  assert.equal((await http('/api/owner-attention',undefined,bot.cookie)).status,403);
  assert.equal(output.includes('autosync ON'),false);
  await stop();
});
