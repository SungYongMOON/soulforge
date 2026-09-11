// Create-only derived producer. Acceptance, source custody and current selection
// are outside this module. No fixture, frozen evaluation or semantic generator.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { openPairStore } from './pair_store.mjs';
import { preparePinnedPdfCandidate } from '../../algorithms/preparation/pinned_pdf_v1.mjs';
import { buildDocumentRepresentation, DOCUMENT_REPRESENTATIONS } from '../../algorithms/representation/derived_document_v1.mjs';
import { createAcceptedContextReader } from './accepted_context_reader.mjs';
import { readTypedMemory } from '../guards/accepted_context_typed_memory.mjs';
import { CONTEXT_PACK_POLICY } from './accepted_context_pack.mjs';
import { sameExactRef, exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { inspectRuntimeManifest } from './preparation_runtime_manifest.mjs';

export const GENERATION_PRODUCER = 'accepted-snapshot-generation-v1';
const hash = bytes => 'sha256:'+createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value));
const fail = () => { throw new Error('derived generation unavailable'); };
const workerPath=fileURLToPath(new URL('../../../rag/project_document_extract.py',import.meta.url));
// Fixed bounded distributions for this parser, not environment discovery. The
// RECORD digest is supplemented with hashes of the actual installed files.
const runtimeProbe=String.raw`import sys,json,hashlib,importlib.metadata as m
from pathlib import Path
sys.path.append(str(Path(sys.executable).parent/'Lib'/'site-packages'))
names=['pdfplumber','pdfminer.six','pypdfium2','Pillow','charset-normalizer','cryptography','cffi','pycparser']
def h(b):return 'sha256:'+hashlib.sha256(b).hexdigest()
rows=[]
for name in names:
 d=m.distribution(name); base=Path(d.locate_file('')).resolve(); files=[]; excluded=0; total=0
 for f in sorted(d.files or [],key=str):
  p=Path(d.locate_file(f))
  if '..' in f.parts or p.suffix=='.pyc' or '__pycache__' in f.parts:
   excluded+=1;continue
  if p.is_symlink() or not p.resolve().is_relative_to(base):raise ValueError('unsafe distribution file')
  b=p.read_bytes();total+=len(b)
  if len(files)>20000 or total>256*1024*1024:raise ValueError('distribution cap')
  files.append({'path':str(f).replace('\\','/'),'sha256':h(b)})
 if not files:raise ValueError('missing distribution files')
 rows.append({'name':name,'version':d.version,'metadata_sha256':h(d.read_text('METADATA').encode()),'record_sha256':h(d.read_text('RECORD').encode()),'files_sha256':h(json.dumps(files,separators=(',',':'),ensure_ascii=False).encode()),'file_count':len(files),'excluded_files':excluded})
print(json.dumps({'python_version':sys.version,'distributions':rows},separators=(',',':')))
`;

export async function inspectPreparationRuntime(interpreterPath,expectedPins) {
  if(!isAbsolute(interpreterPath||'') || lstatSync(interpreterPath).isSymbolicLink()
    || realpathSync(interpreterPath)!==resolve(interpreterPath))fail();
  const interpreterHash=hash(readFileSync(interpreterPath)), workerHash=hash(readFileSync(workerPath));
  if(expectedPins && (interpreterHash!==expectedPins.interpreter_sha256 || workerHash!==expectedPins.worker_sha256))fail();
  const manifest=inspectRuntimeManifest(interpreterPath);
  if(expectedPins && !isDeepStrictEqual(manifest,expectedPins.expected_runtime?.manifest))fail();
  const runtime=await new Promise((resolveProbe,reject)=>{
    const process=spawn(interpreterPath,['-I','-B','-S','-c',runtimeProbe],{stdio:['ignore','pipe','ignore'],windowsHide:true});
    let chunks=[],size=0;
    const timer=setTimeout(()=>{process.kill();reject(new Error('runtime probe timeout'));},30000);
    process.on('error',()=>{clearTimeout(timer);reject(new Error('runtime probe unavailable'));});
    process.stdout.on('data',bytes=>{size+=bytes.length;if(size>65536){process.kill();return;}chunks.push(bytes);});
    process.on('close',code=>{clearTimeout(timer);try{
      if(code!==0 || size>65536)fail();resolveProbe(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }catch{reject(new Error('runtime probe unavailable'));}});
  });
  if(hash(readFileSync(interpreterPath))!==interpreterHash || hash(readFileSync(workerPath))!==workerHash)fail();
  if(!isDeepStrictEqual(inspectRuntimeManifest(interpreterPath),manifest))fail();
  return {interpreter_sha256:interpreterHash,worker_sha256:workerHash,runtime:{...runtime,manifest}};
}
const areas={extraction:'20_문서검색/본문·표_추출',quality:'20_문서검색/원문위치·추출품질',
  index:'20_문서검색/검색_색인',typed:'30_프로젝트맥락/결정·약속·제약',
  summary:'30_프로젝트맥락/업무가지·프로젝트요약',projection:'40_기억관리/회수용_기억',
  policy:'40_기억관리/선택정책',generation:'50_업무맥락/업무별_맥락꾸러미·선택근거',
  episode:'60_업무경험/결과·검토·실패·재작업의_연결'};

function aclPolicy(value) {
  return {actors:new Map(value.actors.map(({actor_ref,grant})=>{
    const {allowed_data_classes,...rest}=grant;
    return [actor_ref,{...rest,allowed_projects:new Set(rest.allowed_projects),
      allowed_scopes:new Set(rest.allowed_scopes),allowed_purposes:new Set(rest.allowed_purposes)}];
  })),revoked_actors:new Set(value.revoked_actors),revoked_generations:new Set(value.revoked_generations)};
}

async function validateAcceptance(store,snapshot,request) {
  const manifest=snapshot.accepted_bundle?.manifest;
  const cutoff=manifest?.bitemporal_cutoff;
  if(!sameExactRef(snapshot.project_ref,store.binding.project_ref) || !manifest || !cutoff)fail();
  const reader=createAcceptedContextReader({enabled:true,binding:{project_ref:store.binding.project_ref,
    producer_binding_ref:store.binding.producer_binding_ref},providers:{
    currentPointer:()=>snapshot.accepted_pointer,currentSourceRevisions:()=>snapshot.source_revisions,
    currentAclPolicy:()=>{store.assertUnchanged();return aclPolicy(store.acl());},
    readAcceptedGeneration:async()=>snapshot.accepted_bundle,
  }});
  for(const scope of new Set(manifest.project_context.memberships.map(m=>m.scope))){
    const checked=await reader.query({actor_ref:request.actor_ref,project_ref:snapshot.project_ref,
      accepted_generation_ref:manifest.accepted_generation_ref,scope,
      as_of:cutoff.known_at,valid_at:cutoff.valid_at,known_at:cutoff.known_at,
      purpose:request.purpose,budget:{max_units:100},cursor:null});
    if(checked.status!=='ok')fail();
  }
  return manifest;
}

export async function prepareDerivedGeneration({storeRoot,bindingSha256,request}={}) {
  const counts={total:0,parsed:0,complete:0,unsupported:0,failed:0,review_pending:0,
    pages:0,paragraphs:0,tables:0,table_cells:0,records:0};
  const outcomes=[];
  try {
    request=structuredClone(request);
    const store=openPairStore({storeRoot,bindingSha256,request,operation:'prepare'});
    const {binding}=store, profile=request.composition?.profile_id;
    if(!DOCUMENT_REPRESENTATIONS[profile] || typeof binding.preparation?.interpreter_path!=='string')fail();
    if(request.composition.producer_id!==GENERATION_PRODUCER || request.composition.parser!=='pdfplumber-tables-v1'
      || Object.entries(DOCUMENT_REPRESENTATIONS[profile]).some(([key,value])=>request.composition[key]!==value))fail();
    const runtimeObservation=await inspectPreparationRuntime(binding.preparation.interpreter_path,binding.preparation);
    if(runtimeObservation.interpreter_sha256!==binding.preparation.interpreter_sha256
      || runtimeObservation.worker_sha256!==binding.preparation.worker_sha256
      || !isDeepStrictEqual(runtimeObservation.runtime,binding.preparation.expected_runtime))fail();
    store.assertUnchanged();
    const source=store.readJson(binding.source_snapshot),accepted=store.readJson(binding.accepted_snapshot);
    if(!sameExactRef(source.project_ref,binding.project_ref) || !Array.isArray(source.documents)
      || source.documents.length===0 || source.documents.length>100 || !Array.isArray(accepted.records)
      || accepted.records.length>100 || !Array.isArray(source.preserved_dependencies))fail();
    counts.total=source.documents.length;
    const acceptedManifest=await validateAcceptance(store,accepted,request);
    const memberships=acceptedManifest.project_context.memberships;
    const acceptedRef=acceptedManifest.accepted_generation_ref;
    const preserved=new Map();
    const preserve=ref=>{
      if(!ref || typeof ref.path!=='string' || !/^sha256:[0-9a-f]{64}$/u.test(ref.sha256))fail();
      if(preserved.has(ref.path) && preserved.get(ref.path).sha256!==ref.sha256)fail();
      preserved.set(ref.path,{...ref});
    };
    preserve(binding.source_snapshot);preserve(binding.accepted_snapshot);
    if(accepted.accepted_bundle_ref){
      const bundle=JSON.parse(store.readPinned(accepted.accepted_bundle_ref,accepted.accepted_bundle_ref));
      if(!isDeepStrictEqual(bundle,accepted.accepted_bundle))fail();
      preserve(accepted.accepted_bundle_ref);
    }
    for(const dependency of [...source.preserved_dependencies,...(accepted.receipt_refs||[])]){
      store.readPinned(dependency,dependency);preserve(dependency);
    }
    const sources=new Set(),recordKeys=new Set();
    for(const row of accepted.records){
      const key=row.source_span_ref+'\0'+exactRefIdentityKey(row.source_revision_ref);
      if(recordKeys.has(key))fail();recordKeys.add(key);
    }
    const prepared=[];
    for(let i=0;i<source.documents.length;i++){
      const doc=source.documents[i], outcome={source_span_ref:doc.source_span_ref,
        source_revision_ref:doc.source_revision_ref,sha256:doc.sha256,path:doc.path,status:'failed'};
      outcomes.push(outcome);
      try {
        if(typeof doc.source_span_ref!=='string' || sources.has(doc.source_span_ref)
          || !['project','common'].includes(doc.scope) || doc.sha256!==doc.source_revision_ref?.content_id
          || doc.data_class!=='public_synthetic' || !Array.isArray(doc.actors) || !doc.actors.includes(request.actor_ref)
          || !Array.isArray(doc.purposes) || !doc.purposes.includes(request.purpose))fail();
        sources.add(doc.source_span_ref);
        const raw=store.readPinned(doc,doc);preserve(doc);outcome.source_bytes=raw.length;
        if(doc.media_type!=='application/pdf'){outcome.status='unsupported';counts.unsupported++;continue;}
        store.assertUnchanged();
        if(!isDeepStrictEqual(inspectRuntimeManifest(binding.preparation.interpreter_path),runtimeObservation.runtime.manifest))fail();
        const extraction=await preparePinnedPdfCandidate({pdfBytes:raw,expectedSha256:doc.sha256.slice(7)},
          {interpreterPath:binding.preparation.interpreter_path,extractionProfile:'pdfplumber-tables-v1',disableSiteStartup:true});
        store.assertUnchanged();counts.parsed++;
        if(extraction.extraction.engine_version!==runtimeObservation.runtime.distributions.find(d=>d.name==='pdfplumber').version)fail();
        counts.pages+=extraction.extraction.page_count;
        for(const page of extraction.extraction.pages){
          counts.paragraphs+=page.paragraphs.length;counts.tables+=page.tables.length;
          counts.table_cells+=page.tables.reduce((n,t)=>n+t.cells.length,0);
        }
        outcome.extraction_sha256=extraction.extraction.extraction_sha256;
        outcome.parser={profile:extraction.extraction.profile,engine:extraction.extraction.engine,
          engine_version:extraction.extraction.engine_version};
        const matches=memberships.filter(m=>m.source_span_ref===doc.source_span_ref && m.scope===doc.scope
          && sameExactRef(m.source_revision_ref,doc.source_revision_ref));
        const recordIndex=accepted.records.findIndex(r=>r.source_span_ref===doc.source_span_ref && r.scope===doc.scope
          && sameExactRef(r.source_revision_ref,doc.source_revision_ref));
        if(matches.length!==1 || recordIndex<0){outcome.status='review_pending';counts.review_pending++;continue;}
        const row=accepted.records[recordIndex];
        const memory=readTypedMemory(row.records_json,binding.project_ref,matches[0],doc.scope);
        if(memory.status!=='VERIFIED')fail();
        const representation=buildDocumentRepresentation({extraction,records:memory.records,locations:row.locations,profile});
        counts.records+=memory.records.length;counts.complete++;outcome.status='complete';
        outcome.accepted_records_sha256=hash(Buffer.from(row.records_json));
        prepared.push({doc,index:i,recordIndex,extraction,representation,records:memory.records});
      } catch {counts.failed++;outcome.status='failed';}
    }
    // Retained predecessors/corrections must be present too; a current-only
    // snapshot cannot silently drop accepted historical source dependencies.
    if(accepted.records.some(r=>!source.documents.some(d=>d.source_span_ref===r.source_span_ref
      && sameExactRef(d.source_revision_ref,r.source_revision_ref) && d.scope===r.scope)))fail();
    // The accepted revision set can also contain non-document metadata lanes.
    // Preserve that complete set verbatim; PDF coverage is the explicit input
    // snapshot, not an inferred attempt to discover bodies for every lane ref.
    if(counts.complete!==counts.total)return {status:'HOLD',generation_id:request.generation_id,
      manifest_ref:null,manifest_sha256:null,counts,source_outcomes:outcomes};
    if(!isDeepStrictEqual(inspectRuntimeManifest(binding.preparation.interpreter_path),runtimeObservation.runtime.manifest))fail();
    store.assertUnchanged();
    const assets=[];
    const assetMeta=(id,kind,scope,ref)=>({id,kind,scope,project_ref:binding.project_ref,
      actors:[request.actor_ref],purposes:[request.purpose],data_class:'public_synthetic',...ref});
    async function asset(id,kind,scope,value,area=kind){
      const owner=scope==='common'?store.commonPath:store.projectPath;
      if(typeof owner!=='string' || !owner)fail();
      const rel=owner+'/'+areas[area]+'/generations/'+request.generation_id+'/'+id.replace(/:/gu,'-')+'.json';
      const written=await store.writeDerived(rel,encode(value),{scope});
      assets.push(assetMeta(id,kind,scope,written));return id;
    }
    assets.push(assetMeta('accepted','accepted','project',binding.accepted_snapshot));
    const documents=[];
    for(const row of prepared){
      const {doc,index,recordIndex,extraction}=row;
      const sourceId='source:'+index,extractionId='extraction:'+index;
      assets.push(assetMeta(sourceId,'source',doc.scope,{path:doc.path,sha256:doc.sha256,
        actors:doc.actors,purposes:doc.purposes,data_class:doc.data_class}));
      await asset(extractionId,'extraction',doc.scope,extraction);
      documents.push({source_span_ref:doc.source_span_ref,source_revision_ref:doc.source_revision_ref,
        source_asset:sourceId,extraction_asset:extractionId,typed_asset:'typed:'+index,
        locations_asset:'locations:'+index,quality_asset:'quality:'+index,scope:doc.scope,
        accepted_record_index:recordIndex});
    }
    const manifests={};
    for(const scope of new Set(documents.map(d=>d.scope))){
      const selected=prepared.filter(r=>r.doc.scope===scope),docs=documents.filter(d=>d.scope===scope);
      const indexId=await asset('index:'+scope,'index',scope,{sources:selected.map(r=>({source_id:r.doc.source_span_ref,
        chunks:r.representation.chunks})),source_revision_refs:accepted.source_revisions.source_revision_refs,
        accepted_generation_ref:acceptedRef});
      const indexDigest=assets.find(a=>a.id===indexId).sha256;
      for(const row of selected){
        const extractionDigest=assets.find(a=>a.id==='extraction:'+row.index).sha256;
        await asset('locations:'+row.index,'typed',scope,{locations:row.representation.locations,
          source_sha256:row.doc.sha256.slice(7),extraction_digest:extractionDigest,index_digest:indexDigest,
          accepted_generation_ref:acceptedRef});
        await asset('typed:'+row.index,'typed',scope,{accepted_snapshot_ref:binding.accepted_snapshot,
          record_index:row.recordIndex,locations_asset:'locations:'+row.index});
        await asset('quality:'+row.index,'extraction',scope,{source_revision_ref:row.doc.source_revision_ref,
          extraction_digest:extractionDigest,index_digest:indexDigest,profile:'pdfplumber-tables-v1',
          warnings:['text-native tables only; no OCR']},'quality');
      }
      const projectionId=await asset('projection:'+scope,'projection',scope,{typed_refs:docs.map(d=>d.typed_asset),
        index_digest:indexDigest,representation:DOCUMENT_REPRESENTATIONS[profile],
        ...(profile==='relation-v2'?{member_links:selected.flatMap(r=>r.representation.member_links.map(link=>({
          source_span_ref:r.doc.source_span_ref,...link})))}:{})});
      const policyId=await asset('policy:'+scope,'policy',scope,{policy_revision:CONTEXT_PACK_POLICY,
        profile_id:profile,composition:request.composition});
      const summaryId=await asset('summary:'+scope,'summary',scope,{accepted_generation_ref:acceptedRef,
        source_refs:docs.map(d=>d.source_revision_ref),accepted_records_ref:binding.accepted_snapshot,
        records:selected.reduce((n,r)=>n+r.records.length,0),coverage:'accepted-record-locations',
        semantic_generation:false});
      const receipts=(accepted.receipt_refs||[]).filter(r=>r.scope===scope);
      const episodeId=receipts.length?await asset('episode:'+scope,'episode',scope,{receipt_refs:receipts,
        promoted_procedure:false}):null;
      manifests[scope]=await asset('generation:'+scope,'generation',scope,{status:'complete',project_ref:binding.project_ref,
        accepted_generation_ref:acceptedRef,writer_epoch:accepted.accepted_pointer.writer_epoch,
        policy_revision:CONTEXT_PACK_POLICY,source_revision_refs:accepted.source_revisions.source_revision_refs,
        index_asset:indexId,projection_asset:projectionId,policy_asset:policyId,summary_asset:summaryId,
        episode_asset:episodeId,documents:docs});
    }
    const cacheId=await asset('context-cache','pack','project',{generation_id:request.generation_id,
      accepted_generation_ref:acceptedRef,status:'empty_cache',invalidation:'new-derived-generation',
      context_packs:[],query_writes:0},'generation');
    if(!Array.isArray(accepted.source_bindings))fail();
    const grant=store.acl().actors.find(a=>a.actor_ref===request.actor_ref)?.grant;
    for(const doc of documents){
      const match=accepted.source_bindings.filter(s=>s.source_span_ref===doc.source_span_ref);
      const member=memberships.find(m=>m.source_span_ref===doc.source_span_ref);
      const expected={actor_ref:request.actor_ref,purpose:request.purpose,scope:member.scope,source_lane:member.source_lane,
        project_ref:binding.project_ref,accepted_generation_ref:acceptedRef,grant_revision_ref:grant.grant_revision_ref,
        ...Object.fromEntries(['source_revision_ref','source_span_ref','context_unit_ref','context_event_ref',
          'context_branch_ref','valid_at','known_at'].map(k=>[k,member[k]])),locator:'document:1'};
      if(match.length!==1 || !isDeepStrictEqual(match[0],expected))fail();
    }
    if(accepted.source_bindings.length!==documents.length)fail();
    // Keep producer completeness within the common reader's admitted asset cap.
    if(assets.length>160)fail();
    for(const ref of preserved.values())store.readPinned(ref,ref);
    for(const item of assets)store.readPinned(item,item);
    store.assertUnchanged();
    const manifest={generation_id:request.generation_id,project_ref:binding.project_ref,accepted_generation_ref:acceptedRef,
      composition:request.composition,status:'complete',counts,source_outcomes:outcomes,
      producer:{producer_id:GENERATION_PRODUCER,parser:'pdfplumber-tables-v1',
        ...DOCUMENT_REPRESENTATIONS[profile],runtime_observation:runtimeObservation,
        extraction_observations:outcomes.map(o=>o.parser)},
      preserved_refs:[...preserved.values()],assets,context_cache_asset:cacheId,
      query_binding:{mode:'context_engine_generation_view',project_ref:binding.project_ref,
        producer_binding_ref:binding.producer_binding_ref,approved_fs_key:binding.approved_fs_key,assets,
        common_derived_path:binding.common_derived_path,source_bindings:accepted.source_bindings},
      query_current:{status:'complete',project_ref:binding.project_ref,accepted_pointer:accepted.accepted_pointer,
        writer_epoch:accepted.accepted_pointer.writer_epoch,policy_revision:CONTEXT_PACK_POLICY,
        accepted_asset:'accepted',accepted_history_assets:[],manifest_asset:manifests},source_revisions:accepted.source_revisions};
    const manifestRef=await store.writeDerived(store.projectPath+'/'+areas.generation+'/generations/'+request.generation_id+'/generation.json',encode(manifest));
    store.assertUnchanged();
    return {status:'PREPARED',generation_id:request.generation_id,manifest_ref:manifestRef.path,
      manifest_sha256:manifestRef.sha256,counts,source_outcomes:outcomes};
  } catch {return {status:'HOLD',generation_id:request?.generation_id??null,manifest_ref:null,
    manifest_sha256:null,counts,source_outcomes:outcomes};}
}
