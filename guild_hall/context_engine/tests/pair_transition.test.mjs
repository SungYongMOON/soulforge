import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {openPairStore,selectGeneration,querySelectedContext,queryPinnedGeneration,computeInstallClosureSha256} from '../src/runtime/pair_store.mjs';
import {createAcceptedContextPack,finalizeContextPackObservation} from '../src/runtime/accepted_context_pack.mjs';
import {createT3Fixture,semanticSources} from '../harness/fixtures/context_memory_t3_fixture.mjs';
import {INSTALLED_UPDATE_PROFILE} from '../profiles/selected_update.mjs';

const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const encode=value=>JSON.stringify(value)+'\n';
async function fixture(t) {
  const home=await mkdtemp(join(tmpdir(),'context-pair-test-'));
  t.after(()=>rm(home,{recursive:true,force:true}));
  const root=join(home,'store'),owner=join(home,'owner');await mkdir(root);await mkdir(owner);
  const x=createT3Fixture(), projectPath='data_root/20_PROJECTS/SYNTHETIC';
  const info=projectPath+'/00_프로젝트_안내';await mkdir(join(root,info),{recursive:true});
  async function put(base,path,value) {const bytes=Buffer.isBuffer(value)?value:Buffer.from(encode(value));
    await mkdir(dirname(join(base,path)),{recursive:true});await writeFile(join(base,path),bytes);return {path,sha256:hash(bytes)};}
  const source=await put(owner,'source.json',{project_ref:x.binding.project_ref,documents:[]});source.path=join(owner,source.path);
  const accepted=await put(owner,'accepted.json',{accepted_bundle:await x.providers.readAcceptedGeneration(),records:[],
    accepted_pointer:x.store.getCurrentPointer(),source_revisions:x.state.source,source_bindings:x.sourceBindings});accepted.path=join(owner,accepted.path);
  const grant=x.state.acl.actors.get(x.request.actor_ref);
  const acl={actors:[{actor_ref:x.request.actor_ref,grant:{...grant,allowed_projects:[...grant.allowed_projects],
    allowed_scopes:[...grant.allowed_scopes],allowed_purposes:[...grant.allowed_purposes],allowed_data_classes:['public_synthetic']}}],
    revoked_actors:[],revoked_generations:[]};
  await put(owner,'acl.json',acl);
  const composition={profile_id:'decision-v1',memory:'ranked-decision-v1'};
  const installs=[];
  for(const [id,version] of [['first','0.2.0'],['second','0.3.0']]) {
    const installRoot=join(home,id);await mkdir(installRoot);
    const files=[];
    files.push(await put(installRoot,'guild_hall/context_engine/src/app.mjs',Buffer.from('export const queryPinnedGeneration=async()=>({status:"TEST_ONLY"});\n')));
    files.push(await put(installRoot,'guild_hall/context_engine/profiles/profile.mjs',Buffer.from('export const profile="'+id+'";\n')));
    files.push(await put(installRoot,'guild_hall/context_engine/module.manifest.json',{module_version:version}));
    installs.push({id,version,root:installRoot,entry_path:files[0].path,config_path:files[1].path,files,
      code_sha256:files[0].sha256,config_sha256:files[1].sha256,closure_sha256:computeInstallClosureSha256(files),composition});
  }
  const binding={mode:'context_engine_store',approved_fs_key:'SYNTHETIC',...x.binding,actor_ref:x.request.actor_ref,
    read_roots:[owner],required_scopes:['project','common'],source_snapshot:source,accepted_snapshot:accepted,acl_path:join(owner,'acl.json'),
    write_authority:{actors:[x.request.actor_ref],operations:['prepare','select']},installs};
  const pinned=await put(root,'binding.json',binding);
  const base={actor_ref:x.request.actor_ref,project_ref:x.request.project_ref,scope:'project',purpose:x.request.purpose};
  async function generation(id) {
    const assets=[];
    for(const kind of ['source','extraction','index','typed','projection','policy','summary','generation','pack','accepted']) {
      const ref=kind==='source'?source:kind==='accepted'?accepted:await put(root,
        projectPath+'/50_업무맥락/업무별_맥락꾸러미·선택근거/generations/'+id+'/asset-'+kind+'.json',{});
      assets.push({id:kind,kind,...ref,project_ref:x.request.project_ref,actors:[x.request.actor_ref],purposes:[x.request.purpose],scope:'project',data_class:'public_synthetic'});
    }
    return put(root,projectPath+'/50_업무맥락/업무별_맥락꾸러미·선택근거/generations/'+id+'/generation.json',{
      generation_id:id,status:'complete',project_ref:x.request.project_ref,accepted_generation_ref:x.f.currentRef,composition,
      counts:{total:1,complete:1,failed:0,unsupported:0,review_pending:0},assets,preserved_refs:[source,accepted],
      query_binding:{...x.binding,assets,approved_fs_key:'SYNTHETIC',source_bindings:x.sourceBindings},
      query_current:{accepted_pointer:x.store.getCurrentPointer(),accepted_asset:'accepted'},source_revisions:x.state.source});
  }
  const g1=await generation('g1'),g2=await generation('g2');
  const options={storeRoot:root,bindingSha256:pinned.sha256};
  const select=(delta={},hooks={})=>selectGeneration({...options,request:{...base,install_id:'first',generation_ref:g1,expected_prior:null,...delta},hooks});
  return {root,owner,info,x,base,binding,options,select,g1,g2,acl,put,installs};
}

test('one pointer commits code/data together, stale CAS holds, rollback increments epoch',async t=>{
  const x=await fixture(t), source=await readFile(x.binding.source_snapshot.path),accepted=await readFile(x.binding.accepted_snapshot.path);
  const a=await x.select();assert.equal(a.status,'COMMITTED');assert.equal(a.current.selection_epoch,1);
  assert.equal((await x.select()).status,'HOLD_PRECOMMIT');
  const b=await x.select({install_id:'second',generation_ref:x.g2,expected_prior:a.current_sha256});
  assert.equal(b.status,'COMMITTED');assert.equal(b.current.install_id,'second');assert.deepEqual(b.current.generation_ref,x.g2);
  const rollback=await x.select({expected_prior:b.current_sha256});
  assert.equal(rollback.status,'COMMITTED');assert.equal(rollback.current.selection_epoch,3);
  assert.equal((await x.select({expected_prior:rollback.current_sha256})).status,'UNCHANGED');
  assert.deepEqual(await readFile(x.binding.source_snapshot.path),source);assert.deepEqual(await readFile(x.binding.accepted_snapshot.path),accepted);
});

test('exclusive lock serializes simultaneous selectors and precommit faults preserve old bytes',async t=>{
  const x=await fixture(t), a=await x.select(), before=await readFile(join(x.root,x.info,'current.json'));
  let entered,release;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{entered=r;});
  const first=x.select({install_id:'second',generation_ref:x.g2,expected_prior:a.current_sha256},{beforeCommit:async()=>{entered();await gate;}});
  await ready;
  assert.equal((await x.select({expected_prior:a.current_sha256})).status,'HOLD_PRECOMMIT');
  release();assert.equal((await first).status,'COMMITTED');
  const current=await readFile(join(x.root,x.info,'current.json'));
  assert.notDeepEqual(current,before);
  assert.equal((await x.select({expected_prior:hash(current)},{beforeCommit:()=>{throw Error('fault');}})).status,'HOLD_PRECOMMIT');
  assert.deepEqual(await readFile(join(x.root,x.info,'current.json')),current);
});

test('postcommit failure is explicit, and ACL/source revocation blocks rollback before commit',async t=>{
  const x=await fixture(t), a=await x.select();
  const b=await x.select({install_id:'second',generation_ref:x.g2,expected_prior:a.current_sha256},{afterCommit:()=>{throw Error('fault');}});
  assert.equal(b.status,'COMMITTED_CLEANUP_FAILED');
  const before=await readFile(join(x.root,x.info,'current.json'));
  await x.put(x.owner,'acl.json',{...x.acl,revoked_actors:[x.base.actor_ref]});
  assert.equal((await x.select({expected_prior:hash(before)})).status,'HOLD_PRECOMMIT');
  assert.deepEqual(await readFile(join(x.root,x.info,'current.json')),before);
  await x.put(x.owner,'acl.json',x.acl);await x.put(x.owner,'source.json',{changed:true});
  assert.equal((await x.select({expected_prior:hash(before)})).status,'HOLD_PRECOMMIT');
  assert.deepEqual(await readFile(join(x.root,x.info,'current.json')),before);
});

test('midflight ACL/pair changes suppress queries and changed installed code cannot select',async t=>{
  const x=await fixture(t),a=await x.select();
  const response=await querySelectedContext({...x.options,request:x.x.request,hooks:{beforeImport:async()=>{
    const b=await x.select({install_id:'second',generation_ref:x.g2,expected_prior:a.current_sha256});assert.equal(b.status,'COMMITTED');}}});
  assert.equal(response.status,'NOT_AVAILABLE');
  const before=await readFile(join(x.root,x.info,'current.json'));
  const revoked=await x.select({expected_prior:hash(before)},{beforeCommit:()=>x.put(x.owner,'acl.json',{...x.acl,revoked_actors:[x.base.actor_ref]})});
  assert.equal(revoked.status,'HOLD_PRECOMMIT');assert.deepEqual(await readFile(join(x.root,x.info,'current.json')),before);
  await x.put(x.owner,'acl.json',x.acl);
  await writeFile(join(x.installs[0].root,x.installs[0].entry_path),'tampered');
  assert.equal((await x.select({expected_prior:hash(before)})).status,'HOLD_PRECOMMIT');
});

test('derived writes are create-only and cannot overwrite source, acceptance or control',async t=>{
  const x=await fixture(t),store=openPairStore({...x.options,operation:'prepare',request:{...x.base,
    install_id:'first',composition:x.installs[0].composition,generation_id:'new',expected_prior:null}});
  const path=store.projectPath+'/30_프로젝트맥락/결정·약속·제약/generations/new/item.json';
  await store.writeDerived(path,Buffer.from('one'));
  await assert.rejects(store.writeDerived(path,Buffer.from('two')));
  for(const invalid of [x.binding.source_snapshot.path,x.binding.accepted_snapshot.path,store.infoPath+'/current.json',
    store.projectPath+'/30_프로젝트맥락/결정·약속·제약/generations/other/item.json']) {
    await assert.rejects(store.writeDerived(invalid,Buffer.from('bad')));
  }
  assert.equal((await readFile(join(x.root,path))).toString(),'one');
  assert.throws(()=>store.readPinned({path:join(x.installs[0].root,x.installs[0].entry_path),sha256:x.installs[0].code_sha256}));
});

test('common derived writes require a separate explicit root and matching scope authority',async t=>{
  const x=await fixture(t),request={...x.base,install_id:'first',composition:x.installs[0].composition,
    generation_id:'scoped',expected_prior:null};
  const bind=async delta=>{
    const ref=await x.put(x.root,'binding.json',{...x.binding,...delta});
    return ()=>openPairStore({storeRoot:x.root,bindingSha256:ref.sha256,request,operation:'prepare'});
  };
  const authority={...x.binding.write_authority,scopes:['project','common']};
  const store=(await bind({common_derived_path:'common-owner',write_authority:authority}))();
  assert.equal(store.commonPath,'common-owner');
  const suffix='/20_문서검색/본문·표_추출/generations/scoped/common.json';
  await store.writeDerived(store.commonPath+suffix,Buffer.from('common source projection'),{scope:'common'});
  assert.equal((await readFile(join(x.root,store.commonPath+suffix))).toString(),'common source projection');
  await assert.rejects(store.writeDerived(store.projectPath+suffix,Buffer.from('wrong owner'),{scope:'common'}));
  await assert.rejects(store.writeDerived(store.commonPath+suffix+'-project',Buffer.from('wrong scope'),{scope:'project'}));
  const denied=(await bind({common_derived_path:'common-owner'}))();
  await assert.rejects(denied.writeDerived(denied.commonPath+suffix+'-denied',Buffer.from('no common writer grant'),{scope:'common'}));
  for(const invalid of ['../outside',x.owner,store.projectPath,'data_root',store.projectPath+'/common',
    'data_root/20_PROJECTS/FOREIGN/common']) {
    assert.throws(await bind({common_derived_path:invalid,write_authority:authority}));
  }
  const relativeSource=await x.put(x.root,'custody/source.json',{documents:[]});
  assert.throws(await bind({source_snapshot:relativeSource,common_derived_path:'custody/common',write_authority:authority}));
});

test('incomplete, mixed and tampered generations cannot replace an incumbent pair',async t=>{
  const x=await fixture(t),first=await x.select(),before=await readFile(join(x.root,x.info,'current.json'));
  const original=JSON.parse(await readFile(join(x.root,x.g2.path),'utf8'));
  for(const change of [m=>{m.counts.failed=1;},m=>{m.query_current.accepted_pointer.generation_ref=x.x.g1.currentRef;},
    m=>{m.assets=m.assets.filter(a=>a.kind!=='pack');m.query_binding.assets=m.assets;},
    m=>{m.composition.memory='related-evidence-v2';}]) {
    const candidate=structuredClone(original);change(candidate);
    const ref=await x.put(x.root,x.g2.path,candidate);
    assert.equal((await x.select({install_id:'second',generation_ref:ref,expected_prior:first.current_sha256})).status,'HOLD_PRECOMMIT');
    assert.deepEqual(await readFile(join(x.root,x.info,'current.json')),before);
  }
  await x.put(x.root,x.g2.path,original);
  const result=await x.select({install_id:'second',generation_ref:x.g2,expected_prior:first.current_sha256},
    {beforeCommit:()=>writeFile(join(x.root,x.g2.path),'tampered')});
  assert.equal(result.status,'HOLD_PRECOMMIT');assert.deepEqual(await readFile(join(x.root,x.info,'current.json')),before);
});

test('lock cleanup failure preserves committed state and reports the commit explicitly',async t=>{
  const x=await fixture(t),result=await x.select({}, {beforeCleanup:()=>{throw Error('cleanup fault');}});
  assert.equal(result.status,'COMMITTED_CLEANUP_FAILED');
  const current=JSON.parse(await readFile(join(x.root,x.info,'current.json'),'utf8'));
  assert.deepEqual(current,result.current);assert.equal(current.selection_epoch,1);
  assert.equal((await x.select({expected_prior:hash(await readFile(join(x.root,x.info,'current.json')))})).status,'HOLD_PRECOMMIT');
  await unlink(join(x.root,x.info,'selection.lock'));
});

test('two real memory strategies choose different authorized facts at same budget and preserve conflicts',async()=>{
  const sources=semanticSources(),current=JSON.parse(sources.current);
  current.records.find(r=>r.id==='F-TASK').relations.push({kind:'depends_on',target:'P-OPEN'});
  sources.current=JSON.stringify(current);
  const x=createT3Fixture({sources});
  const run=memoryProfile=>createAcceptedContextPack({enabled:true,binding:x.binding,providers:x.providers,
    sourceReadback:x.sourceReadback,memoryProfile}).query({...x.request,budget:{...x.request.budget,max_evidence:5}});
  const first=await run('ranked-decision-v1'),second=await run('related-evidence-v2');
  assert.notEqual(first.status,'NOT_AVAILABLE');assert.notEqual(second.status,'NOT_AVAILABLE');
  assert.notDeepEqual(first.facts.map(f=>f.id),second.facts.map(f=>f.id));
  assert.deepEqual(first.conflicts,second.conflicts);
  for(const response of [first,second]) {
    assert.equal(response.effects.writer_calls,0);
    assert.ok(response.facts.length<=5);
    assert.ok(!response.facts.some(f=>['D-OLD','D-WITHDRAWN'].includes(f.id)));
    assert.ok(response.facts.some(f=>f.id==='D-CURRENT'));assert.ok(response.facts.some(f=>f.id==='D-CONFLICT'));
  }
  assert.ok(second.facts.some(f=>['F-TASK','P-OPEN'].includes(f.id)));
});

test('actual generation query counts both stores exactly once and preserves IO after ACL revocation',
  {skip:!process.env.SOULFORGE_TEST_PDF_PYTHON},async t=>{
    const {describeInstallation}=await import('../harness/generation_flow.mjs');
    const {REPO_ROOT}=await import('../release/closure.mjs');
    const {createGenerationStoreFixture}=await import('../harness/fixtures/generation_store_fixture.mjs');
    const {updatePinnedGeneration}=await import('../src/app.mjs');
    const profile=INSTALLED_UPDATE_PROFILE.profile_id;
    const install=describeInstallation(REPO_ROOT,profile,{development:true});
    const x=await createGenerationStoreFixture({installs:[install],profile});
    const generated=await updatePinnedGeneration(x.args);assert.equal(generated.status,'PREPARED');
    const args={storeRoot:x.storeRoot,bindingSha256:x.bindingSha256,request:x.queryRequest};
    const selected=await selectGeneration({...args,request:{...x.request,expected_prior:null,
      generation_ref:{path:generated.manifest_ref,sha256:generated.manifest_sha256}}});
    assert.equal(selected.status,'COMMITTED');
    let inner;
    const baseline=await querySelectedContext({...args,hooks:{afterQuery:result=>{inner=structuredClone(result);}}});
    assert.ok(['OK','PARTIAL'].includes(baseline.status),JSON.stringify(baseline));
    assert.equal(inner.metrics.snapshot_hash_reads,2);
    assert.equal(baseline.metrics.snapshot_hash_reads,4);
    assert.equal(baseline.metrics.snapshot_hash_bytes,inner.metrics.snapshot_hash_bytes*2);
    assert.equal(baseline.metrics.source_body_loads,inner.metrics.source_body_loads);
    // Three dispatcher selectedView calls each read manifest and two snapshots.
    const manifestBytes=(await readFile(join(x.storeRoot,generated.manifest_ref))).length;
    const snapshotBytes=inner.metrics.snapshot_hash_bytes;
    assert.equal(baseline.metrics.pinned_read_attempts,inner.metrics.pinned_read_attempts+9);
    assert.equal(baseline.metrics.pinned_bytes_loaded,inner.metrics.pinned_bytes_loaded+3*(manifestBytes+snapshotBytes));
    const aclBytes=await readFile(x.binding.acl_path),acl=JSON.parse(aclBytes);
    const revoke=()=>writeFile(x.binding.acl_path,encode({...acl,revoked_actors:[x.request.actor_ref]}));
    let beforeOuterFailure;
    const outerFailure=await querySelectedContext({...args,hooks:{afterQuery:async result=>{
      beforeOuterFailure=structuredClone(result);assert.ok(result.metrics.source_body_loads>0);await revoke();}}});
    assert.equal(outerFailure.status,'NOT_AVAILABLE');assert.equal(outerFailure.digest,null);
    assert.deepEqual(outerFailure.facts,[]);
    assert.equal(outerFailure.metrics.source_bytes_loaded,beforeOuterFailure.metrics.source_bytes_loaded);
    assert.equal(outerFailure.metrics.derived_bytes_loaded,beforeOuterFailure.metrics.derived_bytes_loaded);
    assert.equal(outerFailure.metrics.snapshot_hash_reads,4);
    assert.equal(outerFailure.metrics.pinned_read_attempts,beforeOuterFailure.metrics.pinned_read_attempts+6);
    await writeFile(x.binding.acl_path,aclBytes);
    let beforeInnerFailure;
    const innerFailure=await queryPinnedGeneration({...args,pair:selected.current,hooks:{afterQuery:async result=>{
      beforeInnerFailure=structuredClone(result);assert.ok(result.metrics.source_body_loads>0);await revoke();}}});
    assert.equal(innerFailure.status,'NOT_AVAILABLE');assert.equal(innerFailure.digest,null);
    assert.deepEqual(innerFailure.facts,[]);
    assert.equal(innerFailure.metrics.source_bytes_loaded,beforeInnerFailure.metrics.source_bytes_loaded);
    assert.equal(innerFailure.metrics.derived_bytes_loaded,beforeInnerFailure.metrics.derived_bytes_loaded);
    assert.equal(innerFailure.metrics.snapshot_hash_reads,2);
    assert.ok(innerFailure.metrics.pinned_read_attempts>=beforeInnerFailure.metrics.pinned_read_attempts);
    await writeFile(x.binding.acl_path,aclBytes);
    for(const result of [baseline,outerFailure,innerFailure]) {
      assert.equal(result.metrics.output_characters,[...JSON.stringify(result)].length+1);
      assert.ok(result.metrics.output_characters<=x.queryRequest.budget.max_characters);
    }
    const bounded=finalizeContextPackObservation(baseline,baseline.metrics,
      {...x.queryRequest,budget:{...x.queryRequest.budget,max_characters:1200}});
    assert.equal(bounded.reason,'OUTPUT_BUDGET_INSUFFICIENT');assert.equal(bounded.digest,null);
    assert.equal(bounded.metrics.source_bytes_loaded,baseline.metrics.source_bytes_loaded);
    assert.ok(bounded.metrics.output_characters<=1200);
    t.diagnostic('actual IO after revocation: '+JSON.stringify({snapshot_hash_reads:baseline.metrics.snapshot_hash_reads,
      source_bytes_loaded:outerFailure.metrics.source_bytes_loaded,derived_bytes_loaded:outerFailure.metrics.derived_bytes_loaded}));
  });

test('self-entry CLI completes its top-level query without importing its own unfinished module',
  {skip:!process.env.SOULFORGE_TEST_PDF_PYTHON},async()=>{
    const {describeInstallation}=await import('../harness/generation_flow.mjs');
    const {REPO_ROOT,ENTRY_REF}=await import('../release/closure.mjs');
    const {createGenerationStoreFixture}=await import('../harness/fixtures/generation_store_fixture.mjs');
    const {updatePinnedGeneration}=await import('../src/app.mjs');
    const {execFile}=await import('node:child_process');
    const {promisify}=await import('node:util');
    const profile=INSTALLED_UPDATE_PROFILE.profile_id;
    const install=describeInstallation(REPO_ROOT,profile,{development:true});
    const x=await createGenerationStoreFixture({installs:[install],profile});
    const generated=await updatePinnedGeneration(x.args);assert.equal(generated.status,'PREPARED');
    const selected=await selectGeneration({...x.args,request:{...x.request,
      generation_ref:{path:generated.manifest_ref,sha256:generated.manifest_sha256}}});
    assert.equal(selected.status,'COMMITTED');
    const {stdout,stderr}=await promisify(execFile)(process.execPath,[join(REPO_ROOT,ENTRY_REF),
      '--root',x.storeRoot,'--binding-sha256',x.bindingSha256,'--request-json',JSON.stringify(x.queryRequest),'--synthetic-only'],
      {cwd:REPO_ROOT,timeout:90000,maxBuffer:1024*1024});
    assert.equal(stderr,'');const pack=JSON.parse(stdout);
    assert.ok(['OK','PARTIAL'].includes(pack.status),stdout);
    assert.ok(pack.facts.some(f=>f.id==='D-CURRENT'));assert.equal(pack.metrics.snapshot_hash_reads,4);
  });
