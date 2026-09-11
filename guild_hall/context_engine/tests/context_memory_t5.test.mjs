import test from 'node:test';
import assert from 'node:assert/strict';
import fsp, { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
// APP CLI main; the dev-ERP haengbogwan delegation is deferred on main (CTX-S0-G2).
import { main } from '../src/app.mjs';
import { createSyntheticAcceptedContextRuntime } from '../src/adapters/accepted_context_synthetic_runtime.mjs';
import { materializeT5, inventory, snapshotProject, restoreProject, persistT5Pack, relocateT5Source, rebuildT5Document } from '../harness/fixtures/context_memory_t5_fixture.mjs';
import { hash } from '../harness/fixtures/accepted_context_fixture.mjs';

export async function cli(x, request=x.request) {
  let stdout='',stderr='';
  const code=await main(['--root',x.root,'--binding-sha256',x.bindingSha256,
    '--request-json',JSON.stringify(request),'--synthetic-only'],{stdout:{write:s=>stdout+=s},stderr:{write:s=>stderr+=s}});
  assert.equal(code,0,stderr);return JSON.parse(stdout);
}

test('T5 actual CLI retrieves PDF body/table through new project store without query writes',async()=>{
  const x=await materializeT5(), before=await inventory(x.root), result=await cli(x);
  assert.equal(result.status,'PARTIAL',JSON.stringify(result));
  assert.ok(result.facts.some(f=>f.id==='D-CURRENT'));
  assert.ok(result.facts.some(f=>f.id==='D-CONFLICT'));
  const evidence=result.evidence.find(e=>e.id==='D-CURRENT');
  assert.equal(evidence.page,1);assert.equal(evidence.table.page,2);
  assert.deepEqual(evidence.table.bbox,['300','182','545','242']);
  assert.equal(result.metrics.source_read_attempts,2);
  assert.equal(result.metrics.source_body_loads,2);
  assert.ok(result.metrics.derived_body_loads>0);
  assert.ok(result.metrics.output_characters<=12000);
  assert.deepEqual(await inventory(x.root),before);
  assert.equal(result.document_retrieval.ranking_basis,'global_bm25_lexical_single_space');
});

async function repin(x,id,change){
  const asset=x.assets.find(a=>a.id===id);
  const value=JSON.parse(await readFile(join(x.root,asset.path),'utf8'));
  change(value);const data=JSON.stringify(value);await writeFile(join(x.root,asset.path),data);
  asset.sha256=hash(data);await x.put('binding.json',x.binding);x.bindingSha256=hash(JSON.stringify(x.binding));
}

test('T5 actual child CLI replays exact source/extraction/index evidence; explicit pack writer is separate',async()=>{
  const x=await materializeT5(),first=await cli(x);
  const child=spawnSync(process.execPath,['guild_hall/context_engine/src/app.mjs',
    '--root',x.root,'--binding-sha256',x.bindingSha256,'--request-json',JSON.stringify(x.request),'--synthetic-only'],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);const replay=JSON.parse(child.stdout);
  assert.equal(first.digest,replay.digest);assert.equal([...child.stdout].length,replay.metrics.output_characters);
  assert.ok(replay.document_generations.every(g=>g.source_revision_ref.entity_id.endsWith('020901')||g.source_revision_ref.entity_id.endsWith('020101')));
  const saved=await persistT5Pack(x,first),before=await inventory(x.root);
  assert.equal(hash(await readFile(join(x.root,saved.path))),saved.sha256);
  assert.equal((await cli(x)).digest,first.digest);assert.deepEqual(await inventory(x.root),before);
  x.pointer.pack_generation_ref=x.g1.currentRef;await x.put(x.info+'/current.json',x.pointer);
  const mixed=await cli(x);assert.equal(mixed.status,'NOT_AVAILABLE');assert.equal(mixed.metrics.source_bytes_loaded,0);
});

for(const denial of ['actor','project','purpose','class','revoked'])test('T5 admission before any payload: '+denial,async()=>{
  const x=await materializeT5(),request=structuredClone(x.request);
  if(denial==='actor')request.actor_ref='actor:unknown';
  if(denial==='project')request.project_ref=null;
  if(denial==='purpose')request.purpose='external_send';
  if(denial==='class')x.acl.actors[0].grant.allowed_data_classes=[];
  if(denial==='revoked')x.acl.revoked_actors.push('actor:alpha');
  await x.put(x.info+'/acl.json',x.acl);
  const p=await cli(x,request);
  assert.equal(p.status,'NOT_AVAILABLE');assert.equal(p.metrics.source_bytes_loaded,0);
  assert.equal(p.metrics.derived_bytes_loaded,0);
});

for(const kind of ['index','extraction','typed','projection'])test('T5 derived class denial prevents that payload open: '+kind,async()=>{
  const x=await materializeT5();for(const a of x.assets)if(a.kind===kind)a.data_class='not_granted';
  x.acl.actors[0].grant.allowed_data_classes.push('not_granted');await x.put(x.info+'/acl.json',x.acl);
  await x.put('binding.json',x.binding);x.bindingSha256=hash(JSON.stringify(x.binding));
  const denied=new Set(x.assets.filter(a=>a.kind===kind).map(a=>join(x.root,a.path))),opened=[];
  const original=fsp.open;
  fsp.open=async function(path,...args){opened.push(String(path));return original.call(this,path,...args);};syncBuiltinESMExports();
  let p;try{p=await cli(x);}finally{fsp.open=original;syncBuiltinESMExports();}
  assert.ok(['NOT_AVAILABLE','PARTIAL'].includes(p.status));
  assert.equal(opened.some(path=>denied.has(path)),false);assert.equal(p.metrics.source_bytes_loaded,0);
});

for(const drift of ['index-generation','index-source','typed-source','extraction-hash'])test('T5 mixed generation rejects: '+drift,async()=>{
  const x=await materializeT5();
  if(drift==='index-generation')await repin(x,'index:project',v=>v.accepted_generation_ref=x.g1.currentRef);
  if(drift==='index-source')await repin(x,'index:project',v=>v.source_revision_refs=[]);
  if(drift==='typed-source')await repin(x,'typed:current',v=>v.source_sha256='0'.repeat(64));
  if(drift==='extraction-hash')await repin(x,'extraction:current',v=>v.extraction.extraction_sha256='0'.repeat(64));
  const p=await cli(x);
  assert.ok(!p.facts?.some(f=>f.id==='D-CURRENT'));assert.notEqual(p.status,'OK');
});

for(const phase of ['extraction','index','before-publish'])test('T5 interrupted rebuild '+phase+' preserves prior pointer; query HOLD',async()=>{
  const x=await materializeT5(),prior=structuredClone(x.pointer.accepted_pointer);
  const rebuild=await rebuildT5Document(x,{stopAfter:phase});assert.equal(rebuild.status,'INTERRUPTED');
  assert.equal(rebuild.preparation_source_reads,1);
  const p=await cli(x);assert.equal(p.status,'NOT_AVAILABLE');assert.equal(p.metrics.source_bytes_loaded,0);
  assert.deepEqual(JSON.parse(await readFile(join(x.root,x.info,'current.json'),'utf8')).accepted_pointer,prior);
  assert.equal((await rebuildT5Document(x)).status,'REPLAY_NO_OP');
  assert.equal((await cli(x)).status,'PARTIAL');
});

test('T5 missing and changed originals never become verified from retained extraction/index',async()=>{
  const x=await materializeT5(),asset=x.assets.find(a=>a.id==='source:current');
  // An explicit missing locator does not require deleting source bytes.
  const originalPath=asset.path;asset.path='source-custody/DOCUMENT/missing.pdf';
  await x.put('binding.json',x.binding);x.bindingSha256=hash(JSON.stringify(x.binding));
  let p=await cli(x);assert.ok(!p.facts.some(f=>f.id==='D-CURRENT'));assert.ok(p.gaps.includes('SOURCE_UNAVAILABLE'));
  assert.ok(p.metrics.source_read_attempts>0);
  asset.path=originalPath;await x.put('binding.json',x.binding);x.bindingSha256=hash(JSON.stringify(x.binding));
  const original=await readFile(join(x.root,originalPath));await writeFile(join(x.root,originalPath),Buffer.alloc(original.length,32));
  p=await cli(x);assert.ok(!p.facts.some(f=>f.id==='D-CURRENT'));assert.equal(p.metrics.source_bytes_loaded,108776);
});

test('T5 locator-only move changes binding only and replays same pack',async()=>{
  const x=await materializeT5(),p=await cli(x),asset=x.assets.find(a=>a.id==='source:current');
  await relocateT5Source(x,asset.id,'source-custody/DOCUMENT/relocated/current.pdf');
  const moved=await cli(x);assert.equal(moved.digest,p.digest);
  assert.deepEqual(moved.document_generations,p.document_generations);
  const restored=await restoreProject(await snapshotProject(x),{authorization:x.acl});assert.equal((await cli(restored)).digest,p.digest);
});

test('T5 G1/G2 physical correction and current-only history limit',async()=>{
  const g1=await materializeT5({generation:1}),g2=await materializeT5();
  const first=await cli(g1),second=await cli(g2);
  assert.ok(first.facts.some(f=>f.id==='D-OLD'));assert.ok(!second.facts.some(f=>f.id==='D-OLD'));
  assert.ok(second.retained_history.some(r=>r.source_span_ref==='timeline-span:1'));
  const archive=g2.assets.find(a=>a.id===g2.pointer.accepted_history_assets[0]);
  assert.deepEqual(JSON.parse(await readFile(join(g2.root,archive.path),'utf8')).receipt,g2.store.getReceipt(g2.g1.currentRef));
  const history=await cli(g2,{...g2.request,valid_at:'2026-08-01T00:00:00.000Z',known_at:'2026-08-02T00:00:00.000Z',as_of:'2026-08-02T00:00:00.000Z'});
  assert.equal(history.status,'HOLD');assert.ok(history.gaps.includes('HISTORICAL_ACCEPTED_QUERY_UNSUPPORTED'));
  assert.equal(history.metrics.source_read_attempts,0);
});

test('T5 whole-pack/read/evidence/path budgets keep exclusion and conflict proof truthful',async()=>{
  const x=await materializeT5();
  for(const budget of [{max_characters:1200},{max_source_reads:1},{max_evidence:1},{max_paths:0}]){
    const p=await cli(x,{...x.request,budget:{...x.request.budget,...budget}});
    assert.ok(p.metrics.output_characters<= (budget.max_characters||12000));
    assert.ok(p.metrics.source_read_attempts<=(budget.max_source_reads??2));
    if(budget.max_evidence===1)assert.equal(p.status,'HOLD');
    if(budget.max_characters===1200)assert.equal(p.reason,'OUTPUT_BUDGET_INSUFFICIENT');
    if(budget.max_paths===0)assert.ok(p.gaps.includes('PATH_BUDGET'));
  }
});

test('T5 dependency-inclusive restore resolves source/accepted-SE/lineage and actual CLI replay',async()=>{
  const x=await materializeT5(),pack=await cli(x);await persistT5Pack(x,pack);
  const snapshot=await snapshotProject(x);
  await assert.rejects(restoreProject(snapshot,{includeDependencies:false,authorization:x.acl}),/ENOENT/);
  await assert.rejects(restoreProject(snapshot,{actor:'actor:foreign'}));
  const revoked=structuredClone(x.acl);revoked.revoked_actors.push('actor:alpha');
  await assert.rejects(restoreProject(snapshot,{authorization:revoked}),/fresh restore authorization/);
  const corrupt=structuredClone(snapshot);corrupt.files.find(f=>f.path.endsWith('current.pdf')).base64=Buffer.from('corrupt').toString('base64');
  await assert.rejects(restoreProject(corrupt,{authorization:x.acl}),/backup member drift/);
  const omitted=structuredClone(snapshot);
  omitted.files=omitted.files.filter(f=>f.path!=='source-custody/DOCUMENT/current.pdf');
  omitted.dependencies=omitted.dependencies.filter(d=>d.path!=='source-custody/DOCUMENT/current.pdf');
  omitted.manifest_digest=hash(JSON.stringify(omitted.files.map(({base64,...row})=>row)));
  await assert.rejects(restoreProject(omitted,{authorization:x.acl}),/missing bound asset/);
  const restored=await restoreProject(snapshot,{authorization:x.acl});assert.ok(restored.dependencies_resolved>=6);
  assert.equal((await cli(restored)).digest,pack.digest);
});

test('T5 explicitly granted common recall cannot be persisted as a project pack',async()=>{
  const x=await materializeT5(),p=await cli(x,{...x.request,scope:'common',requested_kinds:['preference']});
  assert.equal(p.status,'OK');assert.deepEqual(p.facts.map(f=>f.kind),['preference']);
  await assert.rejects(persistT5Pack(x,p),/common chunks/);
});

test('T5 pinned fs-key, source custody and each derived owner reject wrong placement',async()=>{
  const x=await materializeT5();
  for(const mutate of [b=>b.approved_fs_key='../P-B',b=>b.assets.find(a=>a.id==='source:current').path=x.project+'/10_입력자료/DOCUMENT/current.pdf',
    b=>b.assets.find(a=>a.id==='index:project').path=x.project+'/30_프로젝트맥락/index.json']){
    const b=structuredClone(x.binding);mutate(b);await x.put('binding.json',b);
    assert.equal(createSyntheticAcceptedContextRuntime({root:x.root,bindingSha256:hash(JSON.stringify(b)),syntheticOnly:true}),null);
  }
});

test('T5 oversized original is refused before its body read',async()=>{
  const x=await materializeT5(),asset=x.assets.find(a=>a.id==='source:current');
  await writeFile(join(x.root,asset.path),Buffer.alloc(131073,32));
  const p=await cli(x);assert.ok(!p.facts.some(f=>f.id==='D-CURRENT'));
  assert.equal(p.metrics.source_body_loads,1);assert.equal(p.metrics.source_bytes_loaded,52141);
});

for(const boundary of ['source-stat-acl','source-read-acl','source-read-content','source-close-binding','derived-stat-acl'])
test('T5 actual FD timing: '+boundary,async()=>{
  const x=await materializeT5(),original=fsp.open,observed={fired:false,sourceBytes:0,sourceLoads:0};
  fsp.open=async function(path,...args){
    const fd=await original.call(this,path,...args);
    const source=String(path).includes('source-custody')&&String(path).endsWith('.pdf');
    const derived=String(path).includes('본문·표_추출');
    if(!source&&!derived)return fd;
    const stat=fd.stat.bind(fd),read=fd.read.bind(fd),close=fd.close.bind(fd);let loaded=false;
    const action=async()=>{
      if(observed.fired)return;observed.fired=true;
      if(boundary.includes('acl')){x.acl.revoked_actors.push('actor:alpha');await x.put(x.info+'/acl.json',x.acl);}
      if(boundary.includes('content'))await writeFile(path,Buffer.from('%PDF-changed'));
      if(boundary.includes('binding'))await fsp.appendFile(join(x.root,'binding.json'),' ');
    };
    fd.stat=async(...a)=>{const result=await stat(...a);
      if(source&&boundary==='source-stat-acl'||derived&&boundary==='derived-stat-acl')await action();return result;};
    fd.read=async(...a)=>{const result=await read(...a);
      if(source){observed.sourceBytes+=result.bytesRead;if(!loaded){loaded=true;observed.sourceLoads++;}
        if(boundary.startsWith('source-read'))await action();}return result;};
    fd.close=async()=>{await close();if(source&&boundary==='source-close-binding')await action();};
    return fd;
  };syncBuiltinESMExports();
  let p;try{p=await cli(x);}finally{fsp.open=original;syncBuiltinESMExports();}
  assert.equal(observed.fired,true);assert.equal(p.status,'NOT_AVAILABLE');assert.equal(p.digest,null);
  assert.equal(p.metrics.source_bytes_loaded,observed.sourceBytes);assert.equal(p.metrics.source_body_loads,observed.sourceLoads);
  assert.equal(p.facts.length,0);assert.equal(p.evidence.length,0);
  if(boundary.includes('stat'))assert.equal(observed.sourceBytes,0);
  else assert.ok(observed.sourceBytes>0);
  assert.ok(!JSON.stringify(p).includes('timeline-span:'));
});
