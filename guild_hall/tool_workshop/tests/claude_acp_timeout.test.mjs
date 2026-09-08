import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from './claude_acp_fixture.mjs';
import {HWPX_SOURCE_FILES,sha256} from '../src/claude_acp_policy.mjs';
import {createClaudeAcp} from '../src/claude_acp_server.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const realSetTimeout=globalThis.setTimeout;
const realDelay=ms=>new Promise(resolve=>realSetTimeout(resolve,ms));
const prompt=sessionId=>({sessionId,prompt:[{type:'text',text:'synthetic bounded document turn'}]});
function setup(version=2){
  const f=fixture({mode:'WAIT'});f.raw.expiresAt=Date.now()+3*3600000;
  if(version===2){
    const authority=path.join(f.root,'timeout-authority');fs.mkdirSync(authority);
    const put=(file,value)=>{const bytes=Buffer.from(JSON.stringify(value));fs.writeFileSync(file,bytes);return {path:file,sha256:sha256(bytes)};};
    const roots=Object.fromEntries(['input','work','output','queue'].map(name=>{const dir=path.join(authority,name);fs.mkdirSync(dir);return [name,dir];}));
    // This fixture tests loaded authority and ACP timers only. No HWPX builder,
    // native exporter or real model is invoked; the template bytes are inert.
    const template=path.join(authority,'synthetic.hwpx');fs.writeFileSync(template,'synthetic timer-only template');
    const reference=put(path.join(authority,'reference.json'),{template_path:template,template_sha256:sha256(fs.readFileSync(template))});
    const author=put(path.join(authority,'author.json'),{version:1,project_ref:f.raw.projectRef,job_ref:f.raw.jobRef,source_ref:'source.timer',revision:'revision.one',approval_ref:'approval.synthetic',provenance:'synthetic_fixture',input_root:roots.input,work_root:roots.work,output_root:roots.output,queue_root:roots.queue,reference_binding:reference,pack_sha256:'0'.repeat(64)});
    Object.assign(f.raw,{version:2,hwpx:{author,native:null,pdf:null},sourceHashes:Object.fromEntries(HWPX_SOURCE_FILES.map(file=>[file,sha256(fs.readFileSync(path.join(ROOT,file)))]))});
    f.raw.tools.push('hwpx_build_candidate');
  }
  f.pin();return f;
}
async function waitForWork(f){
  const file=path.join(f.jobRoot,'received-user-count.txt');
  for(let i=0;i<250&&!fs.existsSync(file);i++)await realDelay(20);
  assert.equal(fs.readFileSync(file,'utf8'),'1');
}

test('v1 remains 120 seconds; v2 defaults to 30 minutes and admits only bounded installer values',()=>{
  const legacy=setup(1);assert.equal(legacy.load().turnTimeoutMs,120000);
  legacy.raw.turnTimeoutMs=120000;legacy.pin();assert.throws(legacy.load,/BINDING_SHAPE/);
  const document=setup();assert.equal(document.load().turnTimeoutMs,1800000);
  for(const value of [60000,7200000]){document.raw.turnTimeoutMs=value;document.pin();assert.equal(document.load().turnTimeoutMs,value);}
  for(const value of [0,-1,59999,7200001,60000.5,'1800000',null,false,{},Infinity]){
    document.raw.turnTimeoutMs=value;document.pin();assert.throws(document.load,/TURN_TIMEOUT_BINDING/);
  }
  assert.equal(fs.existsSync(path.join(document.jobRoot,'child-start-count.txt')),false);
});

test('loaded document budget is capped by remaining authority and expired bindings are refused',t=>{
  const f=setup();t.mock.timers.enable({apis:['Date'],now:Date.now()});
  try{
    f.raw.turnTimeoutMs=7200000;f.raw.expiresAt=Date.now()+45000;f.pin();
    const binding=f.load();assert.equal(binding.turnTimeoutMs,45000);assert.equal(Object.isFrozen(binding),true);
    t.mock.timers.tick(45000);assert.throws(f.load,/BINDING_EXPIRED/);
  }finally{t.mock.timers.reset();}
});

for(const {name,version,configured,lifetime,advance,expected} of [
  {name:'legacy v1',version:1,lifetime:3600000,advance:0,expected:120000},
  {name:'default document',version:2,lifetime:3600000,advance:0,expected:1800000},
  {name:'explicit document',version:2,configured:60000,lifetime:3600000,advance:0,expected:60000},
  {name:'authority shortened before prompt',version:2,configured:600000,lifetime:90000,advance:5000,expected:85000},
])test(`actual ${name} work timer fires at its exact bound and confirms child closure`,async t=>{
  const f=setup(version);t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
  f.raw.expiresAt=Date.now()+lifetime;if(configured!==undefined)f.raw.turnTimeoutMs=configured;f.pin();
  const binding=f.load(),timers=[],mockSetTimeout=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{timers.push(delay);return mockSetTimeout(callback,delay,...args);});
  const agent=createClaudeAcp(binding,()=>{});let settled=false;
  try{
    t.mock.timers.tick(advance);
    await agent.dispatch('initialize',{protocolVersion:1});const {sessionId}=await agent.dispatch('session/new',{});
    const pending=agent.dispatch('session/prompt',prompt(sessionId)).then(value=>{settled=true;return value;});
    await waitForWork(f);
    assert.equal(timers.at(-1),expected,'the running work timer must use the trusted capped budget');
    assert.equal(timers.filter(delay=>delay===15000).length,2,'help and authentication retain 15-second probes');
    assert.equal(timers.filter(delay=>delay===5000).length,3,'initialize and metadata retain 5-second controls');
    t.mock.timers.tick(expected-1);await realDelay(20);assert.equal(settled,false);
    t.mock.timers.tick(1);const result=await pending;
    assert.equal(result._meta.failure_meta.code,'TURN_TIMEOUT');assert.equal(result._meta.failure_meta.directChildClosed,true);
    assert.equal(result._meta.failure_meta.retryable,false);assert.equal(fs.readFileSync(path.join(f.jobRoot,'child-start-count.txt'),'utf8'),'1');
    if(Date.now()<binding.expiresAt)assert.deepEqual(await agent.dispatch('session/prompt',prompt(sessionId)),result);
  }finally{agent.close();t.mock.restoreAll();t.mock.timers.reset();}
});

test('a 30-minute document turn still cancels promptly without waiting for its budget',async()=>{
  const f=setup(),agent=createClaudeAcp(f.load(),()=>{});
  try{
    await agent.dispatch('initialize',{protocolVersion:1});const {sessionId}=await agent.dispatch('session/new',{});
    const pending=agent.dispatch('session/prompt',prompt(sessionId));await waitForWork(f);
    const started=performance.now();await agent.dispatch('session/cancel',{sessionId});const result=await pending;
    assert.ok(performance.now()-started<3000);assert.equal(result.stopReason,'cancelled');
    assert.equal(result._meta.failure_meta.code,'TURN_CANCELLED');assert.equal(result._meta.failure_meta.directChildClosed,true);
    assert.deepEqual(await agent.dispatch('session/prompt',prompt(sessionId)),result);
  }finally{agent.close();}
});

test('client session and prompt parameters cannot select a turn budget or add a timeout config option',async()=>{
  const f=setup(),agent=createClaudeAcp(f.load(),()=>{});
  try{
    await agent.dispatch('initialize',{protocolVersion:1});
    for(const value of [{turnTimeoutMs:7200000},{_meta:{turnTimeoutMs:7200000}}])await assert.rejects(agent.dispatch('session/new',value),/CLIENT_SCOPE_OVERRIDE/);
    const {sessionId}=await agent.dispatch('session/new',{});
    for(const value of [{turnTimeoutMs:7200000},{_meta:{turnTimeoutMs:7200000}}])await assert.rejects(agent.dispatch('session/prompt',{...prompt(sessionId),...value}),/CLIENT_SCOPE_OVERRIDE/);
    await assert.rejects(agent.dispatch('session/set_config_option',{sessionId,configId:'turnTimeoutMs',value:7200000}),/ACP_METHOD_UNSUPPORTED/);
    assert.equal(fs.existsSync(path.join(f.jobRoot,'child-start-count.txt')),false);
  }finally{agent.close();}
});
