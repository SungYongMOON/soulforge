import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {exactRefIdentityKey} from '../../../../../guild_hall/engineering_engine/kernel/identity.mjs';
import {projectManifest,projectDocuments,projectSyncReceipt,compareGeneration,createRagOperationsPlugin,createRagOperationsReader} from './rag-operations-adapter.mjs';

const manifest=()=>({schema_version:'soulforge.context_graph_index_generation.v1',generation_id:'test-002',status:'complete',
  counts:{documents:1,chunks:2},model:{llm:'local-extractor',embedder:'local-embedder'},
  documents:[{doc_key:`sha256:${'a'.repeat(64)}`,source_kind:'voice',item_id:'sample-item',units:2,stats:{chunks:2,embedded_chunks:1},raw:'MUST_NOT_SURFACE'}],secret:'MUST_NOT_SURFACE'});
test('DB/store comparison distinguishes unloaded, wrong generation, missing vector and changed pointer',()=>{
  const m=manifest(),db={generation_id:'test-002',chunks:2,embedded_chunks:2};
  assert.equal(compareGeneration(m,db),'counts_match');
  assert.equal(compareGeneration(m,null),'not_in_database');
  assert.equal(compareGeneration(m,{...db,generation_id:'test-001'}),'different_generation');
  assert.equal(compareGeneration(m,{...db,chunks:1}),'chunk_count_mismatch');
  assert.equal(compareGeneration(m,{...db,embedded_chunks:1}),'embedding_missing');
  assert.equal(compareGeneration(m,db,false),'changed_during_read');
  assert.equal(compareGeneration(null,db),'store_unavailable');
  assert.equal(compareGeneration(m,{generation_id:'test-002'}),'unconfirmed');
});
test('manifest projection distinguishes stored reembedding from selected and DB loaded generation',()=>{
  const m={...manifest(),writer:{operation:'reembed'},derived_from:{generation_id:'test-001'},embedding:{model:'new-local-model',dimensions:4096,calls:2,elapsed_ms:800}};
  const r=projectManifest(m,{pointerGeneration:'test-001',dbGeneration:'test-001'});
  assert.equal(r.operation,'reembed');assert.equal(r.selected,false);assert.equal(r.in_database,false);
  assert.equal(r.model.dimensions,4096);assert.equal(r.embedding.elapsed_ms,800);assert.equal(r.llm.calls,null);
  assert.equal(JSON.stringify(r).includes('MUST_NOT_SURFACE'),false);
  assert.throws(()=>projectManifest({...m,status:'draft'}));
  assert.equal(projectManifest({...m,embedding:{model:'C:\\private\\model.bin'}}).model.embedder,null);
});
test('document stats preserve missing counts and require coverage evidence for prepared label',()=>{
  const m=manifest(),r=projectDocuments(m,null)[0];assert.equal(r.preparation,'unconfirmed');
  assert.equal(r.stats.embedded_chunks,1);assert.equal(r.stats.duplicate_ids,null);
  const q={coverage:{items:[{doc_key:m.documents[0].doc_key,status:'prepared'}]}};
  assert.equal(projectDocuments(m,q)[0].preparation,'prepared');
  assert.equal(JSON.stringify(r).includes('MUST_NOT_SURFACE'),false);
});

test('verified reflection count requires matching receipt counts and a successful execution status',()=>{
  const value={schema_version:'soulforge.context_graph_sync_receipt.v1',project_code:'P26-001',ran_at:'2026-09-15T00:00:00Z',dry:false,status:'SYNCED',database:{agrees_with_generation:true},completed:{verified_by:'database read-back of chunk and node counts',items:2},totals:{completed:2}};
  assert.equal(projectSyncReceipt(value,'P26-001').verified,true);
  assert.equal(projectSyncReceipt({...value,status:'HOLD'},'P26-001').verified,false);
  assert.equal(projectSyncReceipt({...value,totals:{completed:3}},'P26-001').verified,false);
});
test('sync receipt needs project and real-run binding and never mistakes a stored count for live DB',()=>{
  const sample={schema_version:'soulforge.context_graph_sync_receipt.v1',project_code:'P26-001',ran_at:'2026-09-15T00:00:00Z',dry:false,status:'HOLD',totals:{pending:3},raw:'MUST_NOT_SURFACE'};
  const r=projectSyncReceipt(sample,'P26-001');assert.equal(r.verified,false);assert.equal(r.totals.completed,null);assert.equal(r.totals.pending,3);
  assert.throws(()=>projectSyncReceipt(sample,'P26-002'));
  assert.throws(()=>projectSyncReceipt({...sample,dry:true},'P26-001'));
  assert.equal(JSON.stringify(r).includes('MUST_NOT_SURFACE'),false);
});
function harness(){let handler,calls=0;createRagOperationsPlugin({reader:{async read(project){calls++;return {state:'ready',project};}}}).configureServer({middlewares:{use(fn){handler=fn;}}});
  return {calls:()=>calls,request:(url,{method='GET',headers={host:'127.0.0.1:4194'},remoteAddress='127.0.0.1'}={})=>new Promise(resolve=>handler({url,method,headers,socket:{remoteAddress}},{statusCode:200,setHeader(){},end(body){resolve({status:this.statusCode,body});}},()=>resolve({next:true})))};
}
test('only loopback GET and exact project query can reach the reader; no arbitrary command or path',async()=>{
  const h=harness();
  for(const [url,options,status] of [
    ['/rag-operations.json',{method:'POST'},405],
    ['/rag-operations.json?refresh=1',{},400],
    ['/rag-operations.json?project=../../secret',{},400],
    ['/rag-operations.json?project=P26-001&project=P26-002',{},400],
    ['/rag-operations.json',{headers:{host:'external.test'}},403],
    ['/rag-operations.json',{headers:{host:'127.0.0.1:4194',origin:'http://evil.test'}},403],
    ['/rag-operations.json',{headers:{host:'127.0.0.1:4194','sec-fetch-site':'cross-site'}},403],
  ])assert.equal((await h.request(url,options)).status,status);
  assert.equal(h.calls(),0);assert.equal((await h.request('/rag-operations.json?project=P26-001')).status,200);assert.equal(h.calls(),1);
});
test('missing config and out-of-scope project never execute DB inspection',async()=>{
  let calls=0;const reader=createRagOperationsReader({projects:['P26-001'],inspect:async()=>{calls++;}});
  assert.equal((await reader.read()).state,'unavailable');assert.equal((await reader.read('P26-002')).state,'denied');assert.equal(calls,0);
});
test('Vite registration hook must not return the Connect app as a post-configuration callback',()=>{
  const connectApp=()=>assert.fail('must not run without a request');
  const plugin=createRagOperationsPlugin();
  assert.equal(plugin.configurePreviewServer({middlewares:{use(){return connectApp;}}}),undefined);
});

async function fixture(t){
  const base=await mkdtemp(path.join(tmpdir(),'rag-ops-test-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(base)),path.resolve(tmpdir()));assert.ok(path.basename(base).startsWith('rag-ops-test-'));await rm(base,{recursive:true,force:true});});
  const data=path.join(base,'data'),control=path.join(base,'control'),receiptsRoot=path.join(base,'receipts');
  for(const directory of [data,control,receiptsRoot])await mkdir(directory);
  const digest=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const project_ref={entity_id:'00000000-0000-4000-8000-000000000001',revision_id:'10000000-0000-4000-8000-000000000001',content_id:`sha256:${'a'.repeat(64)}`,content_hash_alg:'sha256'};
  const projectKey=exactRefIdentityKey(project_ref),project='P26-001',store=`data_root/20_PROJECTS/${project}`;
  const write=async(address,value)=>{const [alias,...parts]=address.split('/');const file=path.join(alias==='data_root'?data:control,...parts);await mkdir(path.dirname(file),{recursive:true});const bytes=JSON.stringify(value);await writeFile(file,bytes);return {path:address,sha256:digest(bytes)};};
  const q={schema_version:'soulforge.context_graph_index_quality.v1',generation_id:'test-002',coverage:{coverage_sha256:`sha256:${'c'.repeat(64)}`,counts:{prepared:1},items:[{doc_key:`sha256:${'a'.repeat(64)}`,status:'prepared'}]}};
  const coverage=await write(`${store}/20_문서검색/원문위치·추출품질/generations/test-002/coverage.json`,q);
  const m={...manifest(),project_ref,project_key:projectKey,coverage,coverage_sha256:q.coverage.coverage_sha256};
  const generation_ref=await write(`${store}/20_문서검색/검색_색인/generations/test-002/generation.json`,m);
  const pointerAddress=`${store}/00_프로젝트_안내/graph_index_current.json`;
  const pointer={schema_version:'soulforge.context_graph_index_pointer.v1',project_ref,generation_id:'test-002',generation_ref};await write(pointerAddress,pointer);
  await write(`control_root/project-bindings/${project}/graph_index_binding.unified.json`,{project_ref,approved_fs_key:project,graph:{worker:{},neo4j:{uri:'bolt://127.0.0.1:7687',user:'synthetic',password_file:'not-used-by-stub'}}});
  const tablePath=path.join(base,'roots.json'),bytes=JSON.stringify({schema_version:'soulforge.physical_root_table.v0',roots:{data_root:data,control_root:control}});await writeFile(tablePath,bytes);
  const db={status:'ok',projects:[{project_key:projectKey,generation_id:'test-002',chunks:2,embedded_chunks:2,nodes:3}],total_nodes:3};
  return {project,write,pointer,pointerAddress,tablePath,expectedSha256:digest(bytes),receiptsRoot,projects:[project],db};
}
test('real file boundary pins current manifest, reuses DB cache and rejects root-table drift',async t=>{
  const f=await fixture(t);let calls=0;const r=createRagOperationsReader({...f,inspect:async()=>{calls++;return f.db;}});
  assert.equal((await r.read()).projects[0].comparison,'counts_match');
  const d=await r.read(f.project);assert.equal(d.preparation.state,'ready');assert.equal(d.documents[0].preparation,'prepared');
  assert.equal(d.run_history.state,'unavailable');assert.equal(calls,1);
  const summary=await r.overview();assert.equal(summary.projects[0].preparation.counts.prepared,1);assert.equal(summary.projects[0].quality.duplicate_ids,null);assert.equal(summary.projects[0].pending.count,null);assert.equal('documents' in summary.projects[0],false);assert.equal(calls,1);
  await writeFile(f.tablePath,'{}');assert.equal((await r.read()).state,'unavailable');assert.equal(calls,1);
});
test('a pointer changed during DB read cannot be called a matched current generation',async t=>{
  const f=await fixture(t);const r=createRagOperationsReader({...f,inspect:async()=>{await f.write(f.pointerAddress,{...f.pointer,generation_id:'test-003'});return f.db;}});
  assert.equal((await r.read()).projects[0].comparison,'changed_during_read');
  assert.equal((await r.read(f.project)).reason,'changed_during_read');
});
test('a pointer cannot read an arbitrary file outside its exact project generation',async t=>{
  const f=await fixture(t);await f.write(f.pointerAddress,{...f.pointer,generation_ref:{...f.pointer.generation_ref,path:'control_root/private.json'}});
  const r=createRagOperationsReader({...f,inspect:async()=>f.db});const row=(await r.read()).projects[0];
  assert.equal(row.store,null);assert.equal(row.reason,'pointer_outside_scope');assert.notEqual(row.comparison,'counts_match');
});
test('a corrupt history record stays a counted read failure, not a full healthy history',async t=>{
  const f=await fixture(t),directory=path.join(f.receiptsRoot,f.project);await mkdir(directory);
  await writeFile(path.join(directory,'20260915T000000.json'),JSON.stringify({schema_version:'soulforge.context_graph_sync_receipt.v1',project_code:f.project,ran_at:'2026-09-15T00:00:00Z',dry:false,status:'HOLD',totals:{pending:2}}));
  await writeFile(path.join(directory,'20260915T010000.json'),'not-json');
  const r=createRagOperationsReader({...f,inspect:async()=>f.db}),d=await r.read(f.project);
  assert.equal(d.run_history.state,'partial');assert.equal(d.run_history.failed,1);assert.equal(d.run_history.observed_files,2);assert.equal(d.runs.length,1);
  assert.equal(d.runs[0].totals.pending,2);assert.equal(d.pending_state,'unavailable');
});
