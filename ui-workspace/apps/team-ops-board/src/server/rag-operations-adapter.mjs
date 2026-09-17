import {projectRagSourceLink} from './rag-source-link.mjs';
import {readProjectLabel} from './operations-project-label.mjs';
import { createHash } from 'node:crypto';
import { lstat, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readRootTable } from '../../../../../guild_hall/path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../../../../../guild_hall/context_engine/src/adapters/aliased_store_io.mjs';
import { exactRefIdentityKey } from '../../../../../guild_hall/engineering_engine/kernel/identity.mjs';
import { inspectGraphDatabase, inspectGraphSubgraph } from '../../../../../guild_hall/context_engine/src/runtime/graph_database.mjs';
import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';
import { readStableFile } from './receipt-expiry-adapter.mjs';

export const RAG_PATH = '/rag-operations.json';
export const RAG_LIMITS = Object.freeze({ cacheMs: 60000, projects: 32, generations: 12, receipts: 1500, directoryEntries: 2048, documents: 500, metadataBytes: 8*1024*1024 });
const CODE=/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u;
const NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u;
const SHA=/^sha256:[a-f0-9]{64}$/u;
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
const text=v=>typeof v==='string'&&!/(?:^|\s)(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|mnt|etc|var|tmp)\/)/u.test(v)
  ?v.replace(/[\u0000-\u001f\u007f]/gu,'').slice(0,200):null;
const hash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const counters=(o,keys)=>Object.fromEntries(keys.map(k=>[k,count(o?.[k])]));
const COUNT_KEYS=['documents','units','chunks','entities','entity_relationships','extracted','carried','reembedded'];
const STAT_KEYS=['chunks','embedded_chunks','chunks_mismatched','entities_without_chunk','entities_reserved_label','entities_outside_schema','relationships_outside_fragment','duplicate_ids'];
const LLM_KEYS=['calls','errors','invalid_outputs','truncated','prompt_tokens','output_tokens','elapsed_ms','embedder_calls'];
const codeOf=error=>/^([a-z][a-z0-9_]{0,100})$/u.test(error?.code??'')?error.code:'read_unavailable';

export function projectManifest(manifest, {pointerGeneration=null,dbGeneration=null,modifiedAt=null}={}) {
  if(manifest?.schema_version!=='soulforge.context_graph_index_generation.v1'||manifest.status!=='complete'||!NAME.test(manifest.generation_id??'')||!Array.isArray(manifest.documents))fail('manifest_invalid');
  return {
    generation:manifest.generation_id,recorded_state:text(manifest.status),selected:manifest.generation_id===pointerGeneration,
    in_database:manifest.generation_id===dbGeneration,file_modified_at:stamp(modifiedAt),
    operation:manifest.writer?.operation==='reembed'?'reembed':'extract_or_carry',
    derived_from:text(manifest.derived_from?.generation_id),supersedes:text(manifest.supersedes?.generation_id??manifest.supersedes),
    counts:counters(manifest.counts,COUNT_KEYS),
    model:{extractor:text(manifest.model?.llm),embedder:text(manifest.embedding?.model??manifest.model?.embedder),
      embedder_digest:SHA.test(manifest.embedding?.digest??manifest.model?.embedder_digest??'')?(manifest.embedding?.digest??manifest.model.embedder_digest):null,
      pin_kind:text(manifest.embedding?.pin_kind),dimensions:count(manifest.embedding?.dimensions)},
    embedding:counters(manifest.embedding,['chunks','calls','elapsed_ms']),llm:counters(manifest.llm,LLM_KEYS),
    document_count:manifest.documents.length,
  };
}

export function projectDocuments(manifest,quality) {
  const items=Array.isArray(quality?.coverage?.items)?quality.coverage.items:[];
  return (manifest.documents??[]).slice(0,RAG_LIMITS.documents).map(row=>{
    const prepared=items.find(item=>item.doc_key===row.doc_key);
    return {id:SHA.test(row.doc_key??'')?row.doc_key:null,source:text(row.source_kind),item:text(row.item_id),
      origin:text(row.origin),units:count(row.units),preparation:prepared?.status==='prepared'?'prepared':prepared?text(prepared.status):'unconfirmed',
      preparation_code:text(prepared?.code),stats:counters(row.stats,STAT_KEYS)};
  });
}

export function projectSyncReceipt(receipt,project) {
  if(receipt?.schema_version!=='soulforge.context_graph_sync_receipt.v1'||receipt.project_code!==project||!stamp(receipt.ran_at)||receipt.dry!==false||!['SYNCED','UNCHANGED','HOLD','FAILED'].includes(receipt.status))fail('receipt_invalid');
  return {at:receipt.ran_at,status:receipt.status,code:text(receipt.code),generation:text(receipt.database?.generation_id??receipt.steps?.index?.generation_id),
    verified:['SYNCED','UNCHANGED'].includes(receipt.status)&&receipt.database?.agrees_with_generation===true&&receipt.completed?.verified_by==='database read-back of chunk and node counts'
      &&count(receipt.completed?.items)!==null&&receipt.completed.items===receipt.totals?.completed,
    totals:counters(receipt.totals,['in_scope','documents_in_generation','chunks_in_database','completed','pending','failed','added_to_scope','removed_from_scope']),
    index:{status:text(receipt.steps?.index?.status),code:text(receipt.steps?.index?.code),elapsed_ms:count(receipt.steps?.index?.elapsed_ms)},
    database:{loaded_at:stamp(receipt.database?.loaded_at),chunks:count(receipt.database?.chunks),embedded_chunks:count(receipt.database?.embedded_chunks)},
    llm:counters(receipt.steps?.index?.llm,LLM_KEYS),
    isolated:(receipt.isolated??[]).slice(0,50).map(row=>({source_ref:text(row.root_ref),item:text(row.item_id),code:text(row.code),attempts:count(row.attempts),state:text(row.state)}))};
}

export function compareGeneration(manifest,db,pointerStable=true) {
  if(!pointerStable)return 'changed_during_read';
  if(!manifest)return 'store_unavailable';
  if(!db)return 'not_in_database';
  if(manifest.generation_id!==db.generation_id)return 'different_generation';
  if(count(manifest.counts?.chunks)===null||count(db.chunks)===null||count(db.embedded_chunks)===null)return 'unconfirmed';
  if(manifest.counts.chunks!==db.chunks)return 'chunk_count_mismatch';
  if(db.chunks!==db.embedded_chunks)return 'embedding_missing';
  return 'counts_match';
}

async function boundedNames(directory,predicate) {
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(directory)!==directory)fail('directory_refused');
  const names=[];let examined=0;
  for await(const entry of await opendir(directory)){
    if(++examined>RAG_LIMITS.directoryEntries)fail('directory_limit');
    if(predicate(entry.name))names.push(entry.name);
  }
  return names.sort().reverse();
}

export function createRagOperationsReader({tablePath,expectedSha256,projects=[],receiptsRoot,inspect=inspectGraphDatabase,inspectGraph=inspectGraphSubgraph,now=Date.now}={}) {
  let baseCache=null,basePending=null;
  const detailCache=new Map(),detailPending=new Map(),receiptCache=new Map(),graphCache=new Map(),graphPending=new Map();
  const configured=path.isAbsolute(tablePath??'')&&SHA.test(expectedSha256??'')&&projects.length>0&&projects.length<=RAG_LIMITS.projects&&new Set(projects).size===projects.length&&projects.every(p=>CODE.test(p))&&path.isAbsolute(receiptsRoot??'');
  function readJson(io,address,max=RAG_LIMITS.metadataBytes){const bytes=io.read(address,max);return {value:JSON.parse(bytes.toString('utf8')),digest:hash(bytes)};}
  function refRead(io,ref,prefix){
    if(!ref||typeof ref.path!=='string'||!ref.path.startsWith(prefix)||!SHA.test(ref.sha256??''))fail('reference_outside_scope');
    const read=readJson(io,ref.path);if(read.digest!==ref.sha256)fail('reference_digest_mismatch');return read.value;
  }
  function loadProject(io,project){
    const bindingAddress=`control_root/project-bindings/${project}/graph_index_binding.unified.json`;
    const binding=readJson(io,bindingAddress,1048576);
    const projectKey=exactRefIdentityKey(binding.value.project_ref);
    if(!projectKey||!NAME.test(binding.value.approved_fs_key??''))fail('project_binding_invalid');
    const store=`data_root/20_PROJECTS/${binding.value.approved_fs_key}`;
    const pointerAddress=`${store}/00_프로젝트_안내/graph_index_current.json`;
    let pointer=null,manifest=null,storeError=null;
    try{
      pointer=readJson(io,pointerAddress,1048576);
      if(pointer.value.schema_version!=='soulforge.context_graph_index_pointer.v1'||exactRefIdentityKey(pointer.value.project_ref)!==projectKey||!NAME.test(pointer.value.generation_id??''))fail('pointer_invalid');
      const expected=`${store}/20_문서검색/검색_색인/generations/${pointer.value.generation_id}/generation.json`;
      if(pointer.value.generation_ref?.path!==expected)fail('pointer_outside_scope');
      manifest=refRead(io,pointer.value.generation_ref,`${store}/20_문서검색/검색_색인/generations/`);
      if(manifest.project_key!==projectKey||exactRefIdentityKey(manifest.project_ref)!==projectKey||manifest.generation_id!==pointer.value.generation_id)fail('manifest_project_mismatch');
      projectManifest(manifest);
    }catch(error){manifest=null;storeError=codeOf(error);}
    return {project,projectKey,binding,bindingAddress,store,pointer,pointerAddress,manifest,storeError};
  }
  async function base(){
    if(!configured)return {public:{state:'unavailable',reason:'configuration_unavailable',projects:[],observed_at:null}};
    let table;
    try{table=readRootTable({tablePath,expectedSha256});}
    catch(error){baseCache=null;detailCache.clear();return {public:{state:'unavailable',reason:codeOf(error),projects:[],observed_at:null}};}
    if(baseCache&&now()-baseCache.at<RAG_LIMITS.cacheMs)return baseCache.value;
    if(basePending)return basePending;
    basePending=(async()=>{
      const io=createAliasedStoreIo(table),held=[];
      for(const project of projects){try{held.push(loadProject(io,project));}catch(error){held.push({project,storeError:codeOf(error)});}}
      const first=held.find(row=>row.binding?.value.graph?.neo4j);
      let db=null,dbError=null;
      try{
        if(!first)fail('database_binding_unavailable');
        const graph=first.binding.value.graph;
        db=await inspect({binding:{...graph,worker:{...graph.worker,timeout_ms:20000}}});
        if(db.status!=='ok')fail('database_unavailable');
      }catch(error){db=null;dbError=codeOf(error);}
      const sameDatabase=row=>row.binding&&JSON.stringify(row.binding.value.graph?.neo4j)===JSON.stringify(first?.binding?.value.graph?.neo4j);
      const publicRows=[];
      for(const row of held){
        let stable=true;
        if(row.binding){try{stable=readJson(io,row.bindingAddress,1048576).digest===row.binding.digest&&(!row.pointer||readJson(io,row.pointerAddress,1048576).digest===row.pointer.digest);}catch{stable=false;}}
        row.stable=stable;
        const match=sameDatabase(row)?db?.projects?.find(p=>p.project_key===row.projectKey):null;
        row.db=match??null;
        const database=match?{generation:text(match.generation_id),loaded_at:stamp(match.loaded_at),nodes:count(match.nodes),chunks:count(match.chunks),embedded_chunks:count(match.embedded_chunks),
          unembedded_chunks:count(match.chunks)!==null&&count(match.embedded_chunks)!==null&&match.chunks>=match.embedded_chunks?match.chunks-match.embedded_chunks:null,
          relationships:Object.fromEntries(Object.entries(match.rule_edges??{}).filter(([k,v])=>/^[A-Z][A-Z0-9_]{0,80}$/u.test(k)&&count(v)!==null))}:null;
        publicRows.push({project:row.project,project_name:readProjectLabel(io,row.project,row.binding?.value.approved_fs_key??row.project),database,store:row.manifest?projectManifest(row.manifest,{pointerGeneration:row.pointer?.value.generation_id,dbGeneration:match?.generation_id}):null,
          comparison:db===null?'database_unavailable':!sameDatabase(row)?'database_binding_mismatch':compareGeneration(row.manifest,match,stable),
          reason:row.storeError??null});
      }
      const value={io,held,public:{state:db?'ready':'unavailable',reason:dbError,observed_at:new Date(now()).toISOString(),scope:'configured_projects',
        non_atomic_read:true,projects:publicRows,expected:projects.length,
        database:db?{total_nodes:count(db.total_nodes),unscoped_nodes:count(db.unscoped_nodes),residue_nodes:count(db.residue_nodes),active_load_locks:Array.isArray(db.materialize_lock)?db.materialize_lock.length:null,
          vector_index:{state:text(db.indexes?.vector?.state),name:text(db.indexes?.vector?.name),dimensions:count(db.indexes?.vector?.dimensions)},fulltext_index:text(db.indexes?.fulltext)}:null}};
      readRootTable({tablePath,expectedSha256});
      baseCache={at:now(),value};return value;
    })();
    try{return await basePending;}catch(error){return {public:{state:'unavailable',reason:codeOf(error),projects:[],observed_at:null}};}finally{basePending=null;}
  }
  async function details(current,project){
    const row=current.held?.find(r=>r.project===project);
    if(!row?.binding)return {state:'unavailable',reason:row?.storeError??'project_unavailable',project};
    const {io}=current;
    const answer={state:'ready',project,observed_at:current.public.observed_at,documents:[],documents_total:null,preparation:{state:'unavailable'},generations:[],generation_history:{state:'unavailable'},runs:[],run_history:{state:'unavailable'},pending:[],pending_state:'unavailable'};
    if(row.manifest&&row.stable){
      try{
        const quality=refRead(io,row.manifest.coverage,`${row.store}/20_문서검색/원문위치·추출품질/generations/${row.manifest.generation_id}/`);
        if(quality.schema_version!=='soulforge.context_graph_index_quality.v1'||quality.generation_id!==row.manifest.generation_id||!Array.isArray(quality.coverage?.items)||quality.coverage.coverage_sha256!==row.manifest.coverage_sha256)fail('quality_invalid');
        answer.documents=projectDocuments(row.manifest,quality);answer.documents_total=row.manifest.documents.length;
        answer.preparation={state:'ready',generation:row.manifest.generation_id,counts:counters(quality.coverage.counts,['prepared','missing','refused','failed']),
          recorded_items:quality.coverage.items?.length??null,limited:answer.documents.length<answer.documents_total};
      }catch(error){answer.preparation={state:'unavailable',reason:codeOf(error)};answer.documents=projectDocuments(row.manifest,null);answer.documents_total=row.manifest.documents.length;}
    }
    answer.source_links={keys:[],types:{},complete:answer.preparation.state==='ready'&&!answer.preparation.limited};
    if(row.manifest&&row.stable){
      let budget=0;
      for(const doc of row.manifest.documents.slice(0,RAG_LIMITS.documents)){
        answer.source_links.types[doc.source_kind]=(answer.source_links.types[doc.source_kind]??0)+1;
        if(!['linear','slack'].includes(doc.source_kind))continue;
        try{
          const prefix=`${row.store}/20_문서검색/본문·표_추출/generations/`,expected=doc.document?.path;
          const parts=typeof expected==='string'&&expected.startsWith(prefix)?expected.slice(prefix.length).split('/'):[];
          if(parts.length!==2||!NAME.test(parts[0])||parts[1]!==`${doc.doc_key?.slice(7)}.json`||!SHA.test(doc.document.sha256??'')||budget>=16*1024*1024)fail('source_link_scope');
          const bytes=io.read(expected,Math.min(1048576,16*1024*1024-budget));budget+=bytes.length;
          if(hash(bytes)!==doc.document.sha256)fail('source_link_digest');
          const prepared=JSON.parse(bytes);if(prepared.doc_key!==doc.doc_key||prepared.project_key!==row.projectKey||prepared.source_kind!==doc.source_kind||prepared.item_id!==doc.item_id||prepared.root_ref!==doc.root_ref||prepared.composite_revision_sha256!==doc.composite_revision_sha256)fail('source_link_identity');
          const key=projectRagSourceLink(prepared);if(!key)fail('source_link_unavailable');
          const check=answer.documents.find(d=>d.id===doc.doc_key);
          if(check?.preparation==='prepared'&&count(doc.stats?.chunks)>0&&doc.stats.embedded_chunks===doc.stats.chunks)answer.source_links.keys.push(key);
          else answer.source_links.complete=false;
        }catch{answer.source_links.complete=false;}
      }
    }
    const prefix=`${row.store}/20_문서검색/검색_색인/generations`;
    try{
      const names=await boundedNames(io.path(prefix),n=>NAME.test(n));let failed=0;
      for(const name of names.slice(0,RAG_LIMITS.generations)){
        try{const address=`${prefix}/${name}/generation.json`;const m=readJson(io,address).value;
          if(m.project_key!==row.projectKey||exactRefIdentityKey(m.project_ref)!==row.projectKey||m.generation_id!==name)fail('manifest_project_mismatch');
          const stat=await lstat(io.path(address));answer.generations.push(projectManifest(m,{pointerGeneration:row.pointer?.value.generation_id,dbGeneration:row.db?.generation_id,modifiedAt:stat.mtime.toISOString()}));
        }catch{failed++;}
      }
      answer.generation_history={state:failed||names.length>RAG_LIMITS.generations?'partial':'ready',observed_folders:names.length,failed,limit:RAG_LIMITS.generations,order:'generation_id_desc',time_basis:'file_mtime_not_execution_time'};
    }catch(error){answer.generation_history={state:'unavailable',reason:codeOf(error)};}
    const directory=path.join(receiptsRoot,project);
    try{
      const cutoff=new Date(now()-31*86400000).toISOString().slice(0,10).replaceAll('-','');
      const names=await boundedNames(directory,n=>/^\d{8}T\d{6}\.json$/u.test(n)&&n.slice(0,8)>=cutoff);let failed=0,readBytes=0;
      for(const name of names.slice(0,RAG_LIMITS.receipts)){
        try{const filePath=path.join(directory,name),stat=await lstat(filePath,{bigint:true});
          if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||await realpath(filePath)!==filePath||stat.size>262144n)fail('receipt_limit');
          const stamp=[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');let projected;
          if(receiptCache.get(filePath)?.stamp===stamp)projected=receiptCache.get(filePath).value;
          else{readBytes+=Number(stat.size);if(readBytes>8*1024*1024)fail('history_read_limit');const file=await readStableFile(filePath);const bytes=file.bytes??file;projected=projectSyncReceipt(JSON.parse(bytes.toString('utf8')),project);receiptCache.set(filePath,{stamp,value:projected});if(receiptCache.size>48000)receiptCache.clear();}
          answer.runs.push(projected);
        }catch{failed++;}
      }
      answer.run_history={state:failed||names.length>RAG_LIMITS.receipts?'partial':'ready',observed_files:names.length,failed,limit:RAG_LIMITS.receipts};
      try{const file=await readStableFile(path.join(directory,'pending.json'));const bytes=file.bytes??file;
        if(bytes.length>RAG_LIMITS.metadataBytes)fail('pending_limit');const ledger=JSON.parse(bytes.toString('utf8'));
        if(ledger.schema_version!=='soulforge.context_graph_sync_pending.v1'||ledger.project_code!==project||!ledger.items||typeof ledger.items!=='object')fail('pending_invalid');
        const items=Object.values(ledger.items);answer.pending_total=items.length;answer.pending=items.slice(0,100).map(p=>({source_ref:text(p.root_ref),item:text(p.item_id),code:text(p.code),attempts:count(p.attempts),state:text(p.state),last_seen:stamp(p.last_seen)}));
        answer.pending_state=items.length>100?'partial':'ready';
      }catch(error){answer.pending_reason=codeOf(error);}
    }catch(error){answer.run_history={state:'unavailable',reason:codeOf(error)};}
    try{if(readJson(io,row.bindingAddress,1048576).digest!==row.binding.digest||(row.pointer&&readJson(io,row.pointerAddress,1048576).digest!==row.pointer.digest))fail('changed_during_read');}
    catch{return {state:'unavailable',reason:'changed_during_read',project};}
    return answer;
  }
  return {async graph(project,document=null){
    if(!projects.includes(project)||(document!==null&&!SHA.test(document)))return {state:'denied',reason:'project_outside_scope'};
    const current=await base(),row=current.held?.find(r=>r.project===project),publicRow=current.public.projects?.find(r=>r.project===project);
    if(!row?.stable||!row.db||publicRow?.comparison!=='counts_match')return {state:'unavailable',reason:'graph_scope_not_verified',nodes:[],edges:[]};
    if(document!==null&&!row.manifest.documents.some(d=>d.doc_key===document))return {state:'denied',reason:'document_outside_scope'};
    const key=[project,row.db.generation_id,document,current.public.observed_at].join(':');
    if(graphCache.has(key))return graphCache.get(key);
    if(graphPending.has(key))return graphPending.get(key);
    if(graphPending.size>=2)return {state:'unavailable',reason:'graph_busy',nodes:[],edges:[]};
    const pending=(async()=>{
      try{
        const result=await inspectGraph({binding:{...row.binding.value.graph,worker:{...row.binding.value.graph.worker,timeout_ms:20000}},projectKey:row.projectKey,generation:row.db.generation_id,document});
        if(result.status!=='ok'||result.project_key!==row.projectKey||result.generation_id!==row.db.generation_id)fail('graph_scope_not_verified');
        readRootTable({tablePath,expectedSha256});
        if(readJson(current.io,row.bindingAddress,1048576).digest!==row.binding.digest||readJson(current.io,row.pointerAddress,1048576).digest!==row.pointer.digest)fail('changed_during_read');
        const docs=new Set(row.manifest.documents.map(d=>d.doc_key));
        const nodes=(result.nodes??[]).slice(0,80).filter(n=>typeof n.id==='string'&&docs.has(n.document)&&(document===null||n.document===document)).map(n=>({id:text(n.id),labels:(n.labels??[]).filter(l=>/^[A-Za-z][A-Za-z0-9_]{0,80}$/u.test(l)).slice(0,8),name:text(n.name),document:n.document,unit:text(n.unit),source:text(n.source)})).filter(n=>n.id);
        const ids=new Set(nodes.map(n=>n.id));
        const edges=(result.edges??[]).slice(0,160).filter(e=>ids.has(e.source)&&ids.has(e.target)&&/^[A-Za-z][A-Za-z0-9_]{0,80}$/u.test(e.type??'')).map(e=>({id:text(e.id),source:e.source,target:e.target,type:e.type})).filter(e=>e.id);
        const documents=(result.documents??[]).slice(0,500).filter(d=>docs.has(d.id)).map(d=>({id:d.id,title:text(d.title)}));
        const answer={state:'ready',project,generation:result.generation_id,observed_at:new Date(now()).toISOString(),basis:'neo4j_live_metadata',document,nodes,edges,documents,node_limit:80,edge_limit:160,limited:result.limited===true||nodes.length!==(result.nodes??[]).length||edges.length!==(result.edges??[]).length};
        if(graphCache.size>=32)graphCache.clear();graphCache.set(key,answer);return answer;
      }catch(error){return {state:'unavailable',reason:codeOf(error),nodes:[],edges:[]};}
    })();graphPending.set(key,pending);try{return await pending;}finally{graphPending.delete(key);}
  },async overview(){
    const current=await this.read();if(current.state==='unavailable')return current;
    const rows=[];
    for(let i=0;i<current.projects.length;i+=3){const batch=await Promise.all(current.projects.slice(i,i+3).map(async row=>{
      const d=await this.read(row.project);
      if(d.observed_at!==current.observed_at||(d.preparation?.state==='ready'&&d.preparation.generation!==row.store?.generation))return {...row,preparation:{state:'unavailable',reason:'changed_during_read'},quality:Object.fromEntries(STAT_KEYS.map(key=>[key,null])),pending:{state:'unavailable',count:null},last_run:null,detail_state:'unavailable'};
      const whole=d.preparation?.state==='ready'&&!d.preparation?.limited&&d.documents?.length===d.documents_total;
      const quality=Object.fromEntries(STAT_KEYS.map(key=>[key,whole&&d.documents.every(doc=>count(doc.stats?.[key])!==null)?d.documents.reduce((sum,doc)=>sum+doc.stats[key],0):null]));
      return {...row,preparation:d.preparation,quality,pending:{state:d.pending_state,count:count(d.pending_total)},last_run:d.runs?.[0]??null,
        detail_state:d.state,history_scope:d.run_history,runs:d.runs??[],source_links:d.source_links};
    }));rows.push(...batch);}
    return {...current,projects:rows,overview:true};
  },async read(project=null){
    if(project!==null&&!projects.includes(project))return {state:'denied',reason:'project_outside_scope'};
    const current=await base();if(project===null)return current.public;
    if(!current.io)return {state:'unavailable',reason:current.public.reason,project};
    const key=`${project}:${current.public.observed_at}`;
    if(detailCache.has(key))return detailCache.get(key);
    if(detailPending.has(key))return detailPending.get(key);
    const pending=details(current,project);detailPending.set(key,pending);
    try{const result=await pending;if(detailCache.size>=32)detailCache.clear();detailCache.set(key,result);return result;}finally{detailPending.delete(key);}
  }};
}

export function createRagOperationsPlugin(options={}) {
  const reader=options.reader??createRagOperationsReader(options);
  const configure=server=>{server.middlewares.use((req,res,next)=>{
    let url;try{url=new URL(req.url??'/','http://127.0.0.1');}catch{res.statusCode=400;res.end();return;}
    if(url.pathname!==RAG_PATH)return next();
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'){res.statusCode=405;res.end();return;}
    if(!isDirectLoopbackRequest(req)||!/^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/u.test(req.headers.host??'')){res.statusCode=403;res.end();return;}
    if(req.headers['sec-fetch-site']==='cross-site'){res.statusCode=403;res.end('{}');return;}
    if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}catch{res.statusCode=403;res.end('{}');return;}}
    if([...url.searchParams.keys()].some(k=>!['project','view','document'].includes(k))||['project','view','document'].some(k=>url.searchParams.getAll(k).length>1)){res.statusCode=400;res.end('{}');return;}
    const project=url.searchParams.get('project');
    const view=url.searchParams.get('view'),document=url.searchParams.get('document');
    if(view!==null&&(!['overview','graph'].includes(view)||(view==='overview'&&project!==null)||(view==='graph'&&project===null))||document!==null&&(view!=='graph'||!SHA.test(document))){res.statusCode=400;res.end('{}');return;}
    if(project!==null&&!CODE.test(project)){res.statusCode=400;res.end('{}');return;}
    void (view==='overview'?reader.overview():view==='graph'?reader.graph(project,document):reader.read(project)).then(result=>{if(result.state==='denied')res.statusCode=403;res.end(JSON.stringify(result));},()=>{res.statusCode=503;res.end('{"state":"unavailable","reason":"read_failed"}');});
  });};
  return {name:'rag-operations-read-only',configureServer:configure,configurePreviewServer:configure};
}
