import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentRepresentation } from '../algorithms/representation/derived_document_v1.mjs';
import { readFile,readdir } from 'node:fs/promises';
import { join,isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareDerivedGeneration } from '../src/runtime/generation_update.mjs';
import { createGenerationStoreFixture } from '../harness/fixtures/generation_store_fixture.mjs';
import { openPairStore } from '../src/runtime/pair_store.mjs';
import { createProjectAcceptedContextRuntime } from '../src/adapters/accepted_context_project_runtime.mjs';

const record = { id:'choice', statement:'Use 28V.', value:'28V', relations:[{kind:'depends_on',target:'limit'}] };
const extraction = { extraction:{pages:[{page_number:1,paragraphs:[
  {paragraph_number:1,text:'Use 28V.',bbox:[0,0,40,10]},
  {paragraph_number:2,text:'Additional untyped source text.',bbox:[0,20,90,30]}],
  tables:[{table_number:1,cells:[{row_number:1,column_number:3,text:'28V',bbox:[0,40,30,50]}]}]}]}};
const locations=[{record_id:'choice',page:1,paragraph:1,table:{page:1,table:1,row:1,column:3}}];

test('approved locations bind statements and arbitrary table columns without semantic inference',()=>{
  const one=buildDocumentRepresentation({extraction,records:[record],locations,profile:'decision-v1'});
  assert.equal(one.chunks.length,2);
  assert.equal(one.chunks[0].chunk_id,'choice');
  assert.deepEqual(one.locations,locations);
  assert.equal(one.chunks[1].text,'Additional untyped source text.');
});
test('relation representation retains actual table/member links and changes derived bytes',()=>{
  const one=buildDocumentRepresentation({extraction,records:[record],locations,profile:'decision-v1'});
  const two=buildDocumentRepresentation({extraction,records:[record],locations,profile:'relation-v2'});
  assert.equal(two.chunks.length,3);
  assert.deepEqual(two.member_links,[{record_id:'choice',relations:record.relations,table_chunk_id:'table:1:1:1:3'}]);
  assert.notEqual(JSON.stringify(one),JSON.stringify(two));
});
test('missing, duplicate, false paragraph/table proofs fail closed',()=>{
  for(const loc of [[],[...locations,...locations],[{...locations[0],paragraph:2}],
    [{...locations[0],table:{...locations[0].table,column:2}}]]) {
    assert.throws(()=>buildDocumentRepresentation({extraction,records:[record],locations:loc,profile:'decision-v1'}));
  }
});

const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
test('complete source snapshot creates new immutable generations; incomplete coverage never publishes',
  {skip:!process.env.SOULFORGE_TEST_PDF_PYTHON},async t=>{
    const one=await createGenerationStoreFixture();
    const source=one.sourceSnapshot;
    const fixture=(profile='decision-v1',transform=()=>{})=>createGenerationStoreFixture({seed:one.seed,profile,transform});
    const before=await Promise.all([...source.documents,...source.preserved_dependencies].map(async ref=>
      ({path:ref.path,sha256:digest(await readFile(ref.path))})));
    const first=await prepareDerivedGeneration(one.args);
    assert.equal(first.status,'PREPARED',JSON.stringify(first));
    assert.deepEqual(Object.fromEntries(['total','parsed','complete','failed','unsupported','review_pending'].map(k=>[k,first.counts[k]])),
      {total:4,parsed:4,complete:4,failed:0,unsupported:0,review_pending:0});
    assert.ok(first.counts.pages>0 && first.counts.tables>0 && first.counts.records>0);
    t.diagnostic('generation counts: '+JSON.stringify(first.counts));
    const m1=JSON.parse(await readFile(join(one.root,first.manifest_ref)));
    const acceptedAsset=m1.assets.find(a=>a.id===m1.query_current.accepted_asset);
    assert.equal(acceptedAsset.kind,'accepted');
    assert.deepEqual({path:acceptedAsset.path,sha256:acceptedAsset.sha256},one.binding.accepted_snapshot);
    for(const asset of m1.assets.filter(a=>a.id.startsWith('typed:'))) {
      const typed=JSON.parse(await readFile(join(one.root,asset.path)));
      assert.deepEqual(typed.accepted_snapshot_ref,one.binding.accepted_snapshot);
    }
    const store=openPairStore({...one.args,request:one.queryRequest,operation:'query'});
    const resolvedReadPaths=new Set();
    const runtime=createProjectAcceptedContextRuntime({root:one.root,bindingSha256:one.bindingSha256,
      generationView:{binding:m1.query_binding,pointer:m1.query_current,source:m1.source_revisions,
        acl:store.acl,preservedRefs:m1.preserved_refs,guard:store.assertUnchanged,
        resolveReadPath:name=>{resolvedReadPaths.add(name);return store.resolveReadPath(name);},metrics:()=>({})}});
    assert.ok(runtime,'new generation admitted to common query adapter');
    const pack=await runtime.contextPack(one.queryRequest);
    assert.notEqual(pack.status,'NOT_AVAILABLE',JSON.stringify(pack));
    assert.ok(pack.facts.some(f=>f.id==='D-CURRENT'),JSON.stringify(pack));
    t.diagnostic('generated query: '+JSON.stringify({status:pack.status,source_reads:pack.metrics.source_reads,
      facts:pack.facts.length,context_cache:'empty_cache'}));
    const commonPack=await runtime.contextPack({...one.queryRequest,scope:'common',requested_kinds:['preference']});
    assert.equal(commonPack.status,'OK',JSON.stringify(commonPack));
    assert.deepEqual(commonPack.facts.map(f=>f.kind),['preference']);
    assert.ok(resolvedReadPaths.has(one.binding.accepted_snapshot.path),'query consumes the external accepted snapshot');
    assert.equal(digest(await readFile(one.binding.accepted_snapshot.path)),one.binding.accepted_snapshot.sha256);
    for(const a of m1.assets)assert.equal(digest(await readFile(isAbsolute(a.path)?a.path:join(one.root,a.path))),a.sha256);
    const commonAssets=m1.assets.filter(a=>a.scope==='common' && a.kind!=='source');
    assert.ok(commonAssets.length>0);
    assert.ok(commonAssets.every(a=>a.path.startsWith('common-owner/') && !a.path.startsWith(one.projectPath+'/')));
    const commonStatements=one.acceptedSnapshot.records.filter(r=>r.scope==='common')
      .flatMap(row=>JSON.parse(row.records_json).records.map(r=>r.statement));
    async function checkProjectBodies(dir){
      for(const entry of await readdir(dir,{withFileTypes:true})){
        const path=join(dir,entry.name);
        if(entry.isDirectory())await checkProjectBodies(path);
        else {const text=await readFile(path,'utf8');for(const statement of commonStatements)
          assert.ok(!text.includes(statement),'project persistence must contain common refs only');}
      }
    }
    await checkProjectBodies(join(one.root,one.projectPath));
    const cache=m1.assets.find(a=>a.id===m1.context_cache_asset);
    assert.equal(JSON.parse(await readFile(join(one.root,cache.path))).status,'empty_cache');
    assert.ok(m1.assets.filter(a=>a.kind==='typed').every(a=>!a.path.includes('source-custody')));
    const two=await fixture('relation-v2'),second=await prepareDerivedGeneration(two.args);
    assert.equal(second.status,'PREPARED',JSON.stringify(second));
    const m2=JSON.parse(await readFile(join(two.root,second.manifest_ref)));
    assert.notEqual(m1.assets.find(a=>a.id==='index:project').sha256,m2.assets.find(a=>a.id==='index:project').sha256);
    assert.equal((await prepareDerivedGeneration(one.args)).status,'HOLD','create-only refuses generation reuse');
    const unsupported=await fixture('decision-v1',src=>{src.documents[0].media_type='application/unsupported';});
    const unsupportedResult=await prepareDerivedGeneration(unsupported.args);
    assert.equal(unsupportedResult.status,'HOLD');assert.equal(unsupportedResult.counts.unsupported,1);
    assert.equal(unsupportedResult.counts.parsed,3);assert.equal(unsupportedResult.manifest_ref,null);
    const pending=await fixture('decision-v1',(_src,acc)=>{acc.records.pop();});
    const pendingResult=await prepareDerivedGeneration(pending.args);
    assert.equal(pendingResult.status,'HOLD');assert.equal(pendingResult.counts.review_pending,1);
    assert.equal(pendingResult.counts.parsed,4);assert.equal(pendingResult.manifest_ref,null);
    const badLocation=await fixture('decision-v1',(_src,acc)=>{acc.records[0].locations[0].paragraph=9999;});
    const badResult=await prepareDerivedGeneration(badLocation.args);
    assert.equal(badResult.status,'HOLD');assert.equal(badResult.counts.failed,1);assert.equal(badResult.counts.parsed,4);
    for(const ref of before)assert.equal(digest(await readFile(ref.path)),ref.sha256,'source/SE/lineage preserved');
    for(const f of [one,two,unsupported,pending,badLocation])
      await assert.rejects(readFile(join(f.root,'data_root/20_PROJECTS',f.binding.approved_fs_key,'00_프로젝트_안내/current.json')),{code:'ENOENT'});
  });
