// Explicit isolated fixture writer. Never imported by query/runtime modules.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, readdir, lstat, open, realpath, rename } from 'node:fs/promises';
import { join, dirname, resolve, relative, isAbsolute, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createT3Fixture, exampleRoot } from './context_memory_t3_fixture.mjs';
import { hash } from './accepted_context_fixture.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { preparePinnedPdfCandidate } from '../../algorithms/preparation/pinned_pdf_v1.mjs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE as TEMPLATE } from '../../../path_registry/src/target_materializer.mjs';
import { CONTEXT_PACK_POLICY } from '../../src/runtime/accepted_context_pack.mjs';

const clean = s=>s.replace(/\s/gu,'');
const bytes = v=>Buffer.from(JSON.stringify(v));
const prepared = new Map();
export async function documentInputs(interpreterPath=process.env.SOULFORGE_TEST_PDF_PYTHON) {
  if(!interpreterPath)throw new Error('explicit SOULFORGE_TEST_PDF_PYTHON is required');
  if(prepared.has(interpreterPath))return prepared.get(interpreterPath);
  const source=JSON.parse(await readFile(new URL('t4-sources.json',exampleRoot),'utf8')).sources;
  const docs={},extractions={};
  for(const key of Object.keys(source)){
    docs[key]=await readFile(new URL('t5-document-'+key+'.pdf',exampleRoot));
    extractions[key]=await preparePinnedPdfCandidate({pdfBytes:docs[key],expectedSha256:hash(docs[key]).slice(7)},
      {interpreterPath,extractionProfile:'pdfplumber-tables-v1'});
  }
  const result={source,docs,extractions};prepared.set(interpreterPath,result);return result;
}

export async function inventory(root) {
  const rows=[];
  async function walk(rel='') {
    for(const entry of await readdir(join(root,rel),{withFileTypes:true})){
      const name=rel?rel+'/'+entry.name:entry.name;
      if(entry.isSymbolicLink())throw new Error('fixture link');
      if(entry.isDirectory())await walk(name);
      else rows.push({path:name,sha256:hash(await readFile(join(root,name))),bytes:(await lstat(join(root,name))).size});
    }
  }
  await walk();return rows.sort((a,b)=>a.path.localeCompare(b.path));
}

// Synthetic canary pattern: exact inventory, create-only bytes, hash readback.
// Mirrors backup_controller/synthetic_recovery_canary_runner's bounded pattern;
// it never widens ingress recovery policy or takes a configured live target.
async function ownedPath(root,rel) {
  const canonical=await realpath(root),temp=await realpath(tmpdir());
  assert.ok(basename(canonical).startsWith('accepted-context-synthetic-'));
  assert.equal(dirname(canonical),temp);assert.equal((await lstat(root)).isSymbolicLink(),false);
  assert.ok(typeof rel==='string' && !rel.includes('\\') && !rel.includes(':') && rel.split('/').every(p=>p && p!=='.' && p!=='..'));
  const target=resolve(root,rel);assert.ok(!relative(canonical,target).startsWith('..')&&!isAbsolute(relative(canonical,target)));
  let current=canonical;
  for(const segment of rel.split('/')){
    current=join(current,segment);
    try {assert.equal((await lstat(current)).isSymbolicLink(),false);} catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return target;
}
export async function snapshotProject(x) {
  const dependencies=JSON.parse(await readFile(await ownedPath(x.root,x.info+'/dependencies.json'),'utf8')).dependencies;
  const rows=await inventory(x.root),files=[];
  const allowed=new Set(['binding.json',...x.assets.map(a=>a.path),...dependencies.map(d=>d.path),
    ...['current.json','source-revisions.json','acl.json','dependencies.json'].map(n=>x.info+'/'+n),
    x.project+'/50_업무맥락/업무별_맥락꾸러미·선택근거/last.json']);
  for(const row of rows){
    assert.ok(allowed.has(row.path),'unadmitted snapshot member');
    const data=await readFile(await ownedPath(x.root,row.path));
    files.push({...row,base64:data.toString('base64')});
  }
  return {project_ref:x.binding.project_ref,project:x.project,info:x.info,bindingSha256:x.bindingSha256,
    request:x.request,dependencies,files,manifest_digest:hash(bytes(rows))};
}
export async function restoreProject(snapshot,{includeDependencies=true,actor='actor:alpha',authorization}={}) {
  assert.equal(actor,snapshot.request.actor_ref,'restore actor not bound');
  const grant=authorization?.actors?.find(a=>a.actor_ref===actor)?.grant;
  assert.ok(grant && !authorization.revoked_actors.includes(actor)
    && grant.allowed_projects.includes(exactRefIdentityKey(snapshot.project_ref))
    && grant.allowed_purposes.includes(snapshot.request.purpose)
    && grant.allowed_data_classes.includes('public_synthetic'),'fresh restore authorization required');
  const rows=snapshot.files.map(({base64,...row})=>row);
  assert.equal(hash(bytes(rows)),snapshot.manifest_digest,'restore manifest drift');
  const bindingFile=snapshot.files.find(f=>f.path==='binding.json');assert.ok(bindingFile);
  assert.equal(hash(Buffer.from(bindingFile.base64,'base64')),snapshot.bindingSha256,'restore binding pin');
  const binding=JSON.parse(Buffer.from(bindingFile.base64,'base64').toString('utf8'));
  assert.equal(exactRefIdentityKey(binding.project_ref),exactRefIdentityKey(snapshot.project_ref));
  assert.ok(grant.allowed_projects.includes(exactRefIdentityKey(binding.project_ref)),'fresh restore authorization required');
  const project='data_root/20_PROJECTS/'+binding.approved_fs_key,info=project+'/00_프로젝트_안내';
  assert.equal(snapshot.project,project);assert.equal(snapshot.info,info);
  for(const asset of binding.assets){
    const file=snapshot.files.find(f=>f.path===asset.path);
    assert.ok(file && file.sha256===asset.sha256,'missing bound asset or mixed generation');
    assert.ok(grant.allowed_scopes.includes(asset.scope),'fresh restore authorization required');
    assert.ok(asset.data_class==='public_synthetic' && grant.allowed_data_classes.includes(asset.data_class) && asset.actors.includes(actor)
      && asset.purposes.includes(snapshot.request.purpose),'dependency classification denied');
  }
  for(const file of snapshot.files){
    assert.equal(hash(Buffer.from(file.base64,'base64')),file.sha256,'backup member drift');
  }
  const dependencyFile=snapshot.files.find(f=>f.path===info+'/dependencies.json');
  assert.ok(dependencyFile,'missing dependency closure inventory');
  const stored=JSON.parse(Buffer.from(dependencyFile.base64,'base64').toString('utf8'));
  assert.equal(exactRefIdentityKey(stored.project_ref),exactRefIdentityKey(binding.project_ref));
  const dependencies=stored.dependencies;
  for(const dep of dependencies){
    assert.ok(grant.allowed_scopes.includes(dep.scope),'fresh restore authorization required');
    assert.ok(snapshot.files.some(f=>f.path===dep.path&&f.sha256===dep.sha256),'unresolved dependency closure');
  }
  assert.deepEqual(snapshot.dependencies,dependencies,'snapshot dependency closure drift');
  for(const asset of binding.assets){
    if(asset.kind==='source')assert.ok(dependencies.some(d=>d.path===asset.path&&d.sha256===asset.sha256&&d.scope===asset.scope),'source dependency closure');
    if(asset.kind!=='episode')continue;
    const file=snapshot.files.find(f=>f.path===asset.path);
    const episode=JSON.parse(Buffer.from(file.base64,'base64').toString('utf8'));
    for(const receipt of episode.receipt_refs){
      assert.match(receipt.ref,/^receipt:[A-Za-z0-9_-]+$/u,'episode dependency closure');
      const path='source-custody/receipts/'+receipt.ref.slice('receipt:'.length)+'.json';
      assert.ok(dependencies.some(d=>d.owner==='receipt'&&d.path===path&&d.sha256===receipt.sha256)
        && snapshot.files.some(f=>f.path===path&&f.sha256===receipt.sha256),'episode dependency closure');
    }
  }
  const allowed=new Set(['binding.json',...binding.assets.map(a=>a.path),...dependencies.map(d=>d.path),
    ...['current.json','source-revisions.json','acl.json','dependencies.json'].map(n=>info+'/'+n),
    project+'/50_업무맥락/업무별_맥락꾸러미·선택근거/last.json']);
  for(const file of snapshot.files){
    assert.ok(allowed.has(file.path),'restore unadmitted dependency');
  }
  const root=await mkdtemp(join(tmpdir(),'accepted-context-synthetic-'));
  for(const dir of TEMPLATE)await mkdir(await ownedPath(root,project+'/'+dir),{recursive:true});
  for(const file of snapshot.files){
    if(!includeDependencies && dependencies.some(d=>d.path===file.path))continue;
    const target=await ownedPath(root,file.path);await mkdir(dirname(target),{recursive:true});
    const handle=await open(target,'wx');
    try {await handle.writeFile(Buffer.from(file.base64,'base64'));await handle.sync();}finally{await handle.close();}
    assert.equal(hash(await readFile(target)),file.sha256);
  }
  // A folder-only copy fails here even though all project-folder hashes match.
  for(const dep of dependencies){
    const target=await ownedPath(root,dep.path);assert.equal(hash(await readFile(target)),dep.sha256,'unresolved restore dependency');
  }
  const lineage=JSON.parse(await readFile(await ownedPath(root,'_workmeta/P-A/lineage/accepted.json'),'utf8'));
  assert.equal(hash(await readFile(await ownedPath(root,lineage.canonical_bytes_path))),lineage.accepted_revision);
  assert.equal(hash(bytes(await inventory(root))),snapshot.manifest_digest,'restored generation parity');
  return {root,bindingSha256:snapshot.bindingSha256,request:snapshot.request,dependencies_resolved:dependencies.length};
}

export async function persistT5Pack(x,pack) {
  assert.ok(pack.identity && exactRefIdentityKey(pack.identity.project_ref)===exactRefIdentityKey(x.binding.project_ref));
  assert.ok((pack.document_generations||[]).every(g=>x.binding.source_bindings
    .some(b=>b.source_span_ref===g.source_span_ref&&b.scope==='project')),'common chunks cannot be persisted into project pack store');
  const data={pack,selection:{excluded:pack.excluded||[],gaps:pack.gaps||[],coverage:pack.coverage},
    writer:'explicit-synthetic-fixture-writer',query_writes:0};
  const rel=x.project+'/50_업무맥락/업무별_맥락꾸러미·선택근거/last.json';
  await x.put(rel,data);
  const row={id:'pack:project',path:rel,kind:'pack',sha256:hash(bytes(data)),scope:'project',project_ref:x.binding.project_ref,
    data_class:'public_synthetic',actors:['actor:alpha'],purposes:['pilot_context_query']};
  const index=x.assets.findIndex(a=>a.id===row.id);if(index<0)x.assets.push(row);else x.assets[index]=row;
  x.pointer.pack_asset=row.id;x.pointer.pack_generation_ref=pack.accepted_generation_ref;
  await x.put(x.info+'/current.json',x.pointer);await x.put('binding.json',x.binding);x.bindingSha256=hash(bytes(x.binding));
  return {path:rel,sha256:row.sha256};
}

export async function relocateT5Source(x,id,next) {
  const asset=x.assets.find(a=>a.id===id);assert.equal(asset.kind,'source');
  assert.ok(next.startsWith('source-custody/'));
  const old=await ownedPath(x.root,asset.path),target=await ownedPath(x.root,next);
  assert.equal(hash(await readFile(old)),asset.sha256);
  await mkdir(dirname(target),{recursive:true});
  await rename(old,target);
  const dep=x.dependencies.find(d=>d.path===asset.path);assert.ok(dep);dep.path=next;asset.path=next;
  await x.put(x.info+'/dependencies.json',{project_ref:x.binding.project_ref,dependencies:x.dependencies});
  await x.put('binding.json',x.binding);x.bindingSha256=hash(bytes(x.binding));
}

export async function rebuildT5Document(x,{stopAfter=null,interpreterPath=process.env.SOULFORGE_TEST_PDF_PYTHON}={}) {
  assert.ok([null,'extraction','index','before-publish'].includes(stopAfter));
  const previous=structuredClone(x.pointer.accepted_pointer);
  x.pointer.pending_generation={phase:'extracting'};await x.put(x.info+'/current.json',x.pointer);
  const source=x.assets.find(a=>a.id==='source:current');
  const pdfBytes=await readFile(await ownedPath(x.root,source.path));
  const extracted=await preparePinnedPdfCandidate({pdfBytes,expectedSha256:source.sha256.slice(7)},
    {interpreterPath,extractionProfile:'pdfplumber-tables-v1'});
  const stagedExtraction=x.project+'/20_문서검색/본문·표_추출/pending/current.json';
  await x.put(stagedExtraction,extracted);
  const stop=async phase=>{x.pointer.pending_generation={phase};await x.put(x.info+'/current.json',x.pointer);
    return {status:'INTERRUPTED',phase,accepted_pointer:previous,preparation_source_reads:1};};
  if(stopAfter==='extraction')return stop('extraction');
  const typed=JSON.parse(await readFile(join(x.root,x.assets.find(a=>a.id==='typed:current').path),'utf8'));
  const index=JSON.parse(await readFile(join(x.root,x.assets.find(a=>a.id==='index:project').path),'utf8'));
  const sourceBinding=x.binding.source_bindings.find(b=>b.source_revision_ref.content_id===source.sha256);
  const rebuiltChunks=JSON.parse(typed.records_json).records.map(record=>{
    const hits=extracted.extraction.pages.flatMap(page=>page.paragraphs
      .filter(p=>clean(p.text).includes(clean(record.statement))).map(p=>({page,p})));
    assert.equal(hits.length,1);return {chunk_id:record.id,page_numbers:[hits[0].page.page_number],text:hits[0].p.text};
  });
  index.sources.find(s=>s.source_id===sourceBinding.source_span_ref).chunks=rebuiltChunks;
  const stagedIndex=x.project+'/20_문서검색/검색_색인/pending/current.json';await x.put(stagedIndex,index);
  if(stopAfter==='index')return stop('index');
  assert.equal(hash(bytes(extracted)),x.assets.find(a=>a.id==='extraction:current').sha256,'rebuild needs separately reviewed generation');
  assert.equal(hash(bytes(index)),x.assets.find(a=>a.id==='index:project').sha256,'rebuild index differs from accepted generation');
  for(const item of x.assets)assert.equal(hash(await readFile(await ownedPath(x.root,item.path))),item.sha256,'incomplete generation');
  if(stopAfter==='before-publish')return stop('before-publish');
  // An unchanged rebuild is a no-op accepted generation, not new acceptance.
  delete x.pointer.pending_generation;await x.put(x.info+'/current.json',x.pointer);
  assert.deepEqual(x.pointer.accepted_pointer,previous);
  return {status:'REPLAY_NO_OP',accepted_pointer:previous,preparation_source_reads:1};
}

export async function materializeT5({generation=2,interpreterPath,fsKey='P-A-synthetic'}={}) {
  assert.match(fsKey,/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u);
  const {source,docs,extractions}=await documentInputs(interpreterPath);
  const x=createT3Fixture({sources:docs,generation,sourceRefSeedOffset:20000});
  const root=await mkdtemp(join(tmpdir(),'accepted-context-synthetic-'));
  const project='data_root/20_PROJECTS/'+fsKey, info=project+'/00_프로젝트_안내';
  const put=async(rel,value,raw=false)=>{await mkdir(dirname(join(root,rel)),{recursive:true});await writeFile(join(root,rel),raw?value:bytes(value));};
  for(const dir of TEMPLATE)await mkdir(join(root,project,dir),{recursive:true});
  const assets=[], dependencies=[];
  async function asset(id,rel,kind,value,scope='project',raw=false){
    const data=raw?value:bytes(value);await put(rel,data,true);
    const row={id,path:rel,kind,sha256:hash(data),scope,project_ref:x.binding.project_ref,data_class:'public_synthetic',
      actors:['actor:alpha'],purposes:['pilot_context_query']};assets.push(row);return id;
  }
  const sourceBindings=x.sourceBindings.map(s=>({...s,locator:'document:1'}));
  const keyByHash=new Map(Object.entries(docs).map(([key,b])=>[hash(b),key]));
  const allDocuments=[];
  for(const sourceBinding of sourceBindings){
    const key=keyByHash.get(sourceBinding.source_revision_ref.content_id), scope=sourceBinding.scope;
    const owner=scope==='common'?'common-owner':project;
    const extraction=extractions[key], extractionId='extraction:'+key;
    const ext=await asset(extractionId,owner+'/20_문서검색/본문·표_추출/'+key+'.json','extraction',extraction,scope);
    const src=await asset('source:'+key,'source-custody/DOCUMENT/'+key+'.pdf','source',docs[key],scope,true);
    dependencies.push({path:'source-custody/DOCUMENT/'+key+'.pdf',sha256:hash(docs[key]),owner:'source_custody',scope,
      source_revision_ref:sourceBinding.source_revision_ref});
    const semantics=JSON.parse(source[key]), locations=[], chunks=[];
    for(const record of semantics.records){
      const matches=extraction.extraction.pages.flatMap(page=>page.paragraphs
        .filter(p=>clean(p.text).includes(clean(record.statement))).map(p=>({page,p})));
      assert.equal(matches.length,1,'exact paragraph for '+record.id);
      const {page,p}=matches[0];
      const loc={record_id:record.id,page:page.page_number,paragraph:p.paragraph_number};
      for(const tablePage of extraction.extraction.pages)for(const table of tablePage.tables){
        const idCell=table.cells.find(c=>c.text===record.id);
        const valueCell=idCell&&table.cells.find(c=>c.row_number===idCell.row_number && c.column_number===2);
        if(valueCell?.text===record.value)loc.table={page:tablePage.page_number,table:table.table_number,row:valueCell.row_number,column:2};
      }
      locations.push(loc);chunks.push({chunk_id:record.id,page_numbers:[page.page_number],text:p.text});
    }
    const typed=await asset('typed:'+key,owner+'/30_프로젝트맥락/결정·약속·제약/'+key+'.json','typed',{
      records_json:source[key],source_sha256:hash(docs[key]).slice(7),extraction_digest:assets.find(a=>a.id===ext).sha256,
      accepted_generation_ref:x.f.currentRef,upstream_json_digest:hash(source[key]),locations,
      review_ref:'synthetic-review:format-preservation-'+key},scope);
    allDocuments.push({source_span_ref:sourceBinding.source_span_ref,source_revision_ref:sourceBinding.source_revision_ref,
      source_asset:src,extraction_asset:ext,typed_asset:typed,quality_asset:'quality:'+key,key,scope,chunks});
  }
  // Actual synthetic result/review/failure/rework: a table equality check and its corrected rerun.
  const table=extractions.current.extraction.pages[1].tables[0];
  const actual=table.cells.find(c=>c.row_number===1 && c.column_number===2).text;
  let observedFailure=false;try{assert.equal(actual,'24V');}catch{observedFailure=true;}
  assert.equal(observedFailure,true);assert.equal(actual,'28V');
  const receipts={failure:{operation:'synthetic-table-check',expected:'24V',actual,status:'FAIL'},
    rework:{operation:'synthetic-table-check',expected:'28V',actual,status:'PASS',failure_ref:'receipt:failure'},
    result:{operation:'PDF-extraction',source_sha256:hash(docs.current),table_cells:table.cells.length,status:'PASS'},
    review:{operation:'assertion-readback',reviewer:'fixture-self-check',independent:false,result_ref:'receipt:result',status:'PASS'}};
  for(const [key,value] of Object.entries(receipts)){
    const rel='source-custody/receipts/'+key+'.json';await put(rel,value);
    dependencies.push({path:rel,sha256:hash(bytes(value)),owner:'receipt',scope:'project'});
  }
  // Accepted SE bytes and canonical byte lineage stay outside the project context store.
  const seKey=generation===1?'old':'current';
  const seSpecRef='.registry/skills/se_foldertree_generate/codex/assets/compiled/system_dev_common_no_grade.json';
  const seSpecBytes=await readFile(new URL('../../../../'+seSpecRef,import.meta.url));
  const seGate=JSON.parse(seSpecBytes).gates.find(g=>g.code===30),seArtifact=seGate.tasks.find(t=>t.artifact_type_id==='ssrs');
  const sePath='_workspaces/P-A/'+String(seGate.code).padStart(3,'0')+'_'+seGate.name+'/'
    +String(seArtifact.id).padStart(3,'0')+'_'+seArtifact.name+'/Rev_A/accepted.pdf';
  await put(sePath,docs[seKey],true);
  const lineage={project_ref:x.binding.project_ref,accepted_revision:hash(docs[seKey]),canonical_bytes_path:sePath,
    input_source_ref:allDocuments.find(d=>d.key===seKey).source_revision_ref,
    authority:'synthetic-fixture-acceptance',source_sha256:hash(docs[seKey]),backup_dependency_ref:'dependency:accepted-se',
    se_variant_ref:seSpecRef,se_variant_sha256:hash(seSpecBytes),se_artifact_type_id:seArtifact.artifact_type_id,
    scope:'fixture byte preservation only; not acceptance of an engineering requirements document'};
  await put('_workmeta/P-A/lineage/accepted.json',lineage);
  dependencies.push({path:sePath,sha256:hash(docs[seKey]),owner:'accepted_se',scope:'project'},
    {path:'_workmeta/P-A/lineage/accepted.json',sha256:hash(bytes(lineage)),owner:'canonical_lineage',scope:'project'});
  const accepted=await asset('accepted',project+'/30_프로젝트맥락/사건·관계/accepted.json','accepted',{
    manifest:x.store.getGeneration(x.f.currentRef),receipt:x.store.getReceipt(x.f.currentRef)});
  const acceptedHistory=[];
  for(const generationRef of x.store.listGenerations()){
    if(exactRefIdentityKey(generationRef)===exactRefIdentityKey(x.f.currentRef))continue;
    acceptedHistory.push(await asset('accepted-history:'+generationRef.revision_id,
      project+'/30_프로젝트맥락/사건·관계/generations/'+generationRef.revision_id+'.json','accepted',
      {manifest:x.store.getGeneration(generationRef),receipt:x.store.getReceipt(generationRef)}));
  }
  const manifestAssets={};
  for(const scope of ['project','common']){
    const owner=scope==='common'?'common-owner':project;
    const documents=allDocuments.filter(d=>d.scope===scope);
    const idx=await asset('index:'+scope,owner+'/20_문서검색/검색_색인/current.json','index',{
      sources:documents.map(d=>({source_id:d.source_span_ref,chunks:d.chunks})),
      source_revision_refs:x.state.source.source_revision_refs,accepted_generation_ref:x.f.currentRef},scope);
    const indexDigest=assets.find(a=>a.id===idx).sha256;
    for(const doc of documents)await asset(doc.quality_asset,owner+'/20_문서검색/원문위치·추출품질/'+doc.key+'.json','extraction',{
      source_revision_ref:doc.source_revision_ref,extraction_digest:assets.find(a=>a.id===doc.extraction_asset).sha256,index_digest:indexDigest,
      profile:'pdfplumber-tables-v1',warnings:['text-native ruled tables only; no OCR']},scope);
    const projection=await asset('projection:'+scope,owner+'/40_기억관리/회수용_기억/current.json','projection',
      {typed_refs:documents.map(d=>d.typed_asset),index_digest:indexDigest},scope);
    const policy=await asset('policy:'+scope,owner+'/40_기억관리/선택정책/current.json','policy',{policy_revision:CONTEXT_PACK_POLICY},scope);
    const summary=await asset('summary:'+scope,owner+'/30_프로젝트맥락/업무가지·프로젝트요약/current.json','summary',
      {accepted_generation_ref:x.f.currentRef,task_ref:'T-A1',coverage:'BOUNDED_SYNTHETIC'},scope);
    const evaluation=await asset('evaluation:'+scope,owner+'/40_기억관리/회수·활용_평가/t4-ref.json','evaluation',
      {file_ref:'docs/architecture/workspace/examples/context-memory/t4-author-review.json',
        sha256:hash(await readFile(new URL('t4-author-review.json',exampleRoot))),acceptance:'HOLD'},scope);
    const episode=await asset('episode:'+scope,owner+'/60_업무경험/결과·검토·실패·재작업의_연결/probe.json','episode',
      {receipt_refs:Object.keys(receipts).map(key=>({ref:'receipt:'+key,sha256:hash(bytes(receipts[key]))})),
        purpose:'synthetic-parser-rework-only',promoted_procedure:false},scope);
    const input=await asset('input:'+scope,owner+'/10_입력자료/DOCUMENT/source-refs.json','input',
      {sources:documents.map(d=>({source_revision_ref:d.source_revision_ref,source_asset:d.source_asset}))},scope);
    manifestAssets[scope]=await asset('generation:'+scope,owner+'/30_프로젝트맥락/generation.json','generation',{
      status:'complete',project_ref:x.binding.project_ref,accepted_generation_ref:x.f.currentRef,
      writer_epoch:x.f.builtCandidate.writer_anchor.writer_epoch,policy_revision:CONTEXT_PACK_POLICY,
      source_revision_refs:x.state.source.source_revision_refs,index_asset:idx,projection_asset:projection,policy_asset:policy,
      summary_asset:summary,evaluation_asset:evaluation,episode_asset:episode,input_asset:input,
      documents:documents.map(({chunks,key,scope,...doc})=>doc)},scope);
  }
  const grant=x.state.acl.actors.get('actor:alpha');
  const acl={actors:[{actor_ref:'actor:alpha',grant:{...grant,allowed_projects:[...grant.allowed_projects],
    allowed_scopes:[...grant.allowed_scopes],allowed_purposes:[...grant.allowed_purposes],allowed_data_classes:['public_synthetic']}}],
    revoked_actors:[],revoked_generations:[]};
  const pointer={status:'complete',project_ref:x.binding.project_ref,accepted_pointer:x.store.getCurrentPointer(),
    writer_epoch:x.f.builtCandidate.writer_anchor.writer_epoch,policy_revision:CONTEXT_PACK_POLICY,
    accepted_asset:accepted,accepted_history_assets:acceptedHistory,manifest_asset:manifestAssets};
  const binding={mode:'synthetic_project_context',...x.binding,approved_fs_key:fsKey,assets,source_bindings:sourceBindings};
  await put(info+'/acl.json',acl);await put(info+'/source-revisions.json',x.state.source);
  await put(info+'/dependencies.json',{project_ref:x.binding.project_ref,dependencies});
  // Publish last, only after exact-byte parity of every declared asset.
  for(const item of assets)assert.equal(hash(await readFile(join(root,item.path))),item.sha256);
  await put(info+'/current.json',pointer);await put('binding.json',binding);
  const request={...x.request,query_text:'T-A1 시험 전압 결정 제약 measurement result'};
  const files=await inventory(root);
  return {...x,root,project,info,binding,pointer,acl,dependencies,put,request,assets,
    bindingSha256:hash(bytes(binding)),preparation_effects:{files_written:files.length,accepted_generations:generation,
      source_originals:sourceBindings.length,operational_writes:0}};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const x=await materializeT5();process.stdout.write(JSON.stringify({root:x.root,bindingSha256:x.bindingSha256,
    request:x.request,preparation_effects:x.preparation_effects})+'\n');
}
