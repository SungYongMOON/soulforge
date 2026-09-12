// Opt-in, synthetic-only Plan 17 adapter behind the existing accepted CLI.
// No writer, recovery, parser process, discovery or default private binding.
import { createHash } from 'node:crypto';
import { openSync, closeSync, readFileSync, lstatSync, fstatSync, realpathSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, relative, isAbsolute, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { sameExactRef, exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { retrieveAdmittedDocuments } from '../../algorithms/retrieval/bm25_v1.mjs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE_VERSIONS,
  resolveProjectTemplateVersion } from '../../../path_registry/src/target_materializer.mjs';
import { createAcceptedContextPack, CONTEXT_PACK_POLICY, finalizeContextPackObservation } from '../runtime/accepted_context_pack.mjs';

const hash = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
const equal = isDeepStrictEqual;
const clean = s => String(s).replace(/\s/gu, '');
const stamp = s => Object.fromEntries(['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'].map(k => [k,s[k]]));
const fail = () => { throw new Error('project context unavailable'); };
const fsKey = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(x)
  && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(x);
const safeRel = x => typeof x === 'string' && x.length < 1024 && !x.includes('\\')
  && !x.includes(':') && !isAbsolute(x) && x.split('/').every(p => p && p !== '.' && p !== '..' && !/[. ]$/u.test(p));
const AREAS={extraction:['20_문서검색/본문·표_추출/','20_문서검색/원문위치·추출품질/'],
  index:['20_문서검색/검색_색인/'],typed:['30_프로젝트맥락/결정·약속·제약/'],
  projection:['40_기억관리/회수용_기억/'],generation:['30_프로젝트맥락/'],
  policy:['40_기억관리/선택정책/'],evaluation:['40_기억관리/회수·활용_평가/'],
  episode:['60_업무경험/결과·검토·실패·재작업의_연결/'],accepted:['30_프로젝트맥락/사건·관계/'],
  summary:['30_프로젝트맥락/업무가지·프로젝트요약/'],input:['10_입력자료/DOCUMENT/']};
AREAS.pack=['50_업무맥락/업무별_맥락꾸러미·선택근거/'];

export function createProjectAcceptedContextRuntime({ root, bindingSha256, generationView, memoryProfile } = {}) {
  try {
    const canonical = realpathSync(root), temp = realpathSync(tmpdir());
    const rel = relative(temp, canonical);
    if ((!generationView && (!rel || rel.includes(sep) || rel.startsWith('..') || isAbsolute(rel)
      || !basename(canonical).startsWith('accepted-context-synthetic-'))) || lstatSync(root).isSymbolicLink()) return null;
    function path(name, directory = false) {
      if(generationView && isAbsolute(name)) {
        generationView.guard();
        const target=generationView.resolveReadPath(name), s=lstatSync(target);
        if(directory ? !s.isDirectory() : !s.isFile() || s.nlink!==1 || s.size>8*1024*1024)fail();
        return target;
      }
      if (!safeRel(name) || realpathSync(root) !== canonical || lstatSync(root).isSymbolicLink()) fail();
      let target = canonical;
      for (const part of name.split('/')) {
        target = join(target, part);
        const s = lstatSync(target);
        if (s.isSymbolicLink() || realpathSync(target) !== target) fail();
      }
      const s = lstatSync(target);
      if (directory ? !s.isDirectory() : !s.isFile() || s.nlink !== 1 || s.size > 8*1024*1024) fail();
      return target;
    }
    function control(name) {
      const target = path(name), before = stamp(lstatSync(target,{bigint:true}));
      const fd = openSync(target,'r');
      try {
        if (!equal(before,stamp(fstatSync(fd,{bigint:true})))) fail();
        const bytes = readFileSync(fd);
        if (!equal(before,stamp(lstatSync(target,{bigint:true})))) fail();
        return bytes;
      } finally { closeSync(fd); }
    }
    const initialBytes = control('binding.json');
    if (hash(initialBytes) !== bindingSha256) return null;
    const externalBinding = JSON.parse(initialBytes);
    const acceptedSnapshot = generationView ? externalBinding.accepted_snapshot : null;
    if(generationView && (externalBinding.mode!=='context_engine_store'
      || typeof acceptedSnapshot?.path!=='string' || !acceptedSnapshot.path
      || !/^sha256:[0-9a-f]{64}$/u.test(acceptedSnapshot.sha256)))return null;
    const bound = generationView?.binding || externalBinding;
    if ((!generationView && bound.mode !== 'synthetic_project_context') || !fsKey(bound.approved_fs_key)
      || !exactRefIdentityKey(bound.project_ref) || !exactRefIdentityKey(bound.producer_binding_ref)
      || !Array.isArray(bound.assets) || bound.assets.length > 160 || !Array.isArray(bound.source_bindings)) return null;
    const projectPath = 'data_root/20_PROJECTS/' + bound.approved_fs_key;
    const commonPath=generationView?(bound.common_derived_path ?? null):'common-owner';
    const projectNamespace='data_root/20_PROJECTS';
    if(commonPath!==null && (!safeRel(commonPath) || commonPath===projectNamespace
      || commonPath.startsWith(projectNamespace+'/') || projectNamespace.startsWith(commonPath+'/')))return null;
    const info = projectPath + '/00_프로젝트_안내';
    // Registers the layout this store actually holds. Registering today's layout
    // against a store formed under an earlier one would refuse a directory that
    // store was never supposed to have.
    if(!generationView){
      const version=resolveProjectTemplateVersion(dir=>{
        try{ path(projectPath+'/'+dir,true); return true; }catch{ return false; }
      });
      if(version===null)return null;
      for (const dir of PROJECT_CONTEXT_DIRECTORY_TEMPLATE_VERSIONS[version]) path(projectPath+'/'+dir,true);
    }
    const assets = new Map(); const paths = new Set();
    for (const asset of bound.assets) {
      if (!asset || typeof asset.id !== 'string' || assets.has(asset.id) || (!safeRel(asset.path) && !(generationView && isAbsolute(asset.path)))
        || !generationView && paths.has(asset.path.toLowerCase()) || !/^sha256:[0-9a-f]{64}$/u.test(asset.sha256)
        || !sameExactRef(asset.project_ref,bound.project_ref) || !['project','common'].includes(asset.scope)
        || !['source',...Object.keys(AREAS)].includes(asset.kind)
        || !Array.isArray(asset.actors) || !Array.isArray(asset.purposes) || typeof asset.data_class !== 'string') return null;
      // Derived assets may locate accepted records, never replace their owner.
      if(generationView && asset.kind==='accepted' && (asset.path!==acceptedSnapshot.path
        || asset.sha256!==acceptedSnapshot.sha256))return null;
      // Common payloads retain their separate owner. Source custody is never a project body.
      const owner=asset.scope==='common'?commonPath:projectPath;
      const prefix = asset.kind === 'source' ? 'source-custody/' : owner+'/';
      const preserved = generationView?.preservedRefs.some(ref => ref.path === asset.path && ref.sha256 === asset.sha256);
      if(!preserved && !owner)return null;
      if (!preserved && !asset.path.startsWith(prefix)) return null;
      if(!preserved && asset.kind!=='source' && !AREAS[asset.kind].some(area=>asset.path.startsWith(prefix+area))
        && !(generationView && asset.kind==='generation' && asset.path.startsWith(prefix+AREAS.pack[0])))return null;
      assets.set(asset.id,asset); paths.add(asset.path.toLowerCase());
    }
    const current = () => {
      if (hash(control('binding.json')) !== bindingSha256) fail();
      if (generationView) { generationView.guard(); return {pointer:generationView.pointer,source:generationView.source,acl:generationView.acl()}; }
      return {
        pointer:JSON.parse(control(info+'/current.json')),
        source:JSON.parse(control(info+'/source-revisions.json')),
        acl:JSON.parse(control(info+'/acl.json')),
      };
    };
    const initial = current();
    if (initial.pointer.policy_revision !== CONTEXT_PACK_POLICY
      || !sameExactRef(initial.pointer.project_ref,bound.project_ref)) return null;
    if(!Array.isArray(initial.pointer.accepted_history_assets)
      || initial.pointer.accepted_history_assets.some(id=>assets.get(id)?.kind!=='accepted'))return null;
    if(generationView && assets.get(initial.pointer.accepted_asset)?.kind!=='accepted')return null;
    return Object.freeze({ async contextPack(request) {
      const metrics = {source_read_attempts:0,source_body_loads:0,source_bytes_loaded:0,
        derived_read_attempts:0,derived_body_loads:0,derived_bytes_loaded:0};
      const unavailable = () => {
        const result={status:'NOT_AVAILABLE',identity:null,accepted_generation_ref:null,facts:[],evidence:[],paths:[],
          gaps:['CONTEXT_UNAVAILABLE'],digest:null,effects:{task_mutations:0,writer_calls:0,persistent_writes:0,external_sends:0,model_calls:0},
          metrics:{...metrics,source_reads:metrics.source_read_attempts,tokens:'UNKNOWN',output_characters:0}};
        for(let i=0;i<4;i++)result.metrics.output_characters=[...JSON.stringify(result)].length+1;
        return generationView?finalizeContextPackObservation(result,{...result.metrics,...generationView.metrics()},request,{suppress:true}):result;
      };
      try {
        const before = current(), witnesses = new Map(), cache = new Map();
        if (before.pointer.status !== 'complete' || before.pointer.pending_generation) return unavailable();
        if(before.pointer.pack_asset && !sameExactRef(before.pointer.pack_generation_ref,before.pointer.accepted_pointer.generation_ref))return unavailable();
        const grant = before.acl.actors.find(a => a.actor_ref === request?.actor_ref)?.grant;
        const projectKey = exactRefIdentityKey(bound.project_ref);
        if (!grant || !sameExactRef(request?.project_ref,bound.project_ref)
          || !grant.allowed_projects.includes(projectKey) || !grant.allowed_purposes.includes(request.purpose)
          || !grant.allowed_scopes.includes(request.scope) || before.acl.revoked_actors.includes(request.actor_ref)
          || !Array.isArray(grant.allowed_data_classes)) return unavailable();
        function guard() {
          if (!equal(before,current())) fail();
          for (const [name,s] of witnesses) if (!equal(s,stamp(lstatSync(path(name),{bigint:true})))) fail();
        }
        function admit(id) {
          const asset=assets.get(id);
          if (!asset || asset.scope !== request.scope && asset.kind !== 'accepted'
            || !asset.actors.includes(request.actor_ref) || !asset.purposes.includes(request.purpose)
            || asset.data_class!=='public_synthetic'
            || !grant.allowed_data_classes.includes(asset.data_class) || !sameExactRef(asset.project_ref,request.project_ref)) fail();
          return asset;
        }
        async function read(id) {
          guard(); const asset=admit(id);
          if(cache.has(id))return cache.get(id);
          const source=asset.kind==='source', prefix=source?'source':'derived';
          if(source && metrics.source_read_attempts >= Math.min(request.budget?.max_source_reads ?? 0,2))fail();
          metrics[prefix+'_read_attempts']++;
          const target=path(asset.path), beforeStat=stamp(lstatSync(target,{bigint:true}));
          const fd=await open(target,'r');
          let raw;
          try {
            const stat=await fd.stat({bigint:true}); guard();
            if(!equal(beforeStat,stamp(stat)))fail();
            if(source && stat.size>131072n)fail();
            witnesses.set(asset.path,beforeStat);
            raw=Buffer.alloc(Number(stat.size)); let length=0;
            metrics[prefix+'_body_loads']++;
            while(length<raw.length){
              guard(); const {bytesRead}=await fd.read(raw,length,raw.length-length,length);
              metrics[prefix+'_bytes_loaded']+=bytesRead; length+=bytesRead; guard();
              if(!equal(beforeStat,stamp(await fd.stat({bigint:true}))))fail();
              guard(); if(!bytesRead)break;
            }
            if(length!==raw.length || hash(raw)!==asset.sha256)fail();
          } finally {await fd.close();}
          guard(); cache.set(id,raw); return raw;
        }
        const json = async id => JSON.parse((await read(id)).toString('utf8'));
        const acl = () => {
          guard();return {actors:new Map(before.acl.actors.map(a=>{
            const {allowed_data_classes,...g}=a.grant;
            return [a.actor_ref,{...g,allowed_projects:new Set(g.allowed_projects),allowed_scopes:new Set(g.allowed_scopes),allowed_purposes:new Set(g.allowed_purposes)}];
          })),revoked_actors:new Set(before.acl.revoked_actors),revoked_generations:new Set(before.acl.revoked_generations)};
        };
        let index=null, manifest=null;
        const generation = before.pointer;
        function acceptedAsset(id) {
          const asset=admit(id);
          if(asset.kind!=='accepted' || asset.path!==acceptedSnapshot.path
            || asset.sha256!==acceptedSnapshot.sha256)fail();
          return asset;
        }
        const providers={
          currentPointer:()=>{guard();return generation.accepted_pointer;},
          currentSourceRevisions:()=>{guard();return before.source;}, currentAclPolicy:acl,
          async readAcceptedGeneration(){
            if(generationView)acceptedAsset(generation.accepted_asset);
            const raw=await json(generation.accepted_asset), bundle=generationView ? raw.accepted_bundle : raw;
            if(bundle.manifest.writer_witness.writer_epoch!==generation.writer_epoch)fail();
            return bundle;
          },
          async retrieveDocuments(query) {
            // Every derived payload is admitted independently before opening it.
            manifest=await json(generation.manifest_asset[request.scope]);
            if(manifest.status!=='complete' || !sameExactRef(manifest.project_ref,bound.project_ref)
              || !sameExactRef(manifest.accepted_generation_ref,request.accepted_generation_ref)
              || manifest.writer_epoch!==generation.writer_epoch || manifest.policy_revision!==CONTEXT_PACK_POLICY
              || !equal(manifest.source_revision_refs,before.source.source_revision_refs))fail();
            const ids=[manifest.index_asset,manifest.projection_asset,manifest.policy_asset,manifest.summary_asset,
              manifest.evaluation_asset,manifest.episode_asset,manifest.input_asset].filter(Boolean);
            ids.forEach(admit);
            // A rejection must not leave sibling payload IO running after the
            // response. read() settles only after its finally-awaited FD close.
            const loaded=await Promise.allSettled(ids.map(json));
            if(loaded.some(result=>result.status==='rejected'))fail();
            const byId=new Map(ids.map((id,i)=>[id,loaded[i].value]));
            const [searchIndex,projection,policy,summary,evaluation,episode,input]=[manifest.index_asset,
              manifest.projection_asset,manifest.policy_asset,manifest.summary_asset,manifest.evaluation_asset,
              manifest.episode_asset,manifest.input_asset].map(id=>byId.get(id));
            index=searchIndex;
            if(!sameExactRef(index.accepted_generation_ref,request.accepted_generation_ref)
              || !equal(index.source_revision_refs,before.source.source_revision_refs)
              || policy.policy_revision!==CONTEXT_PACK_POLICY || projection.index_digest!==assets.get(manifest.index_asset).sha256
              || !sameExactRef(summary.accepted_generation_ref,request.accepted_generation_ref)
              || !equal(projection.typed_refs,manifest.documents.map(d=>d.typed_asset)))fail();
            if(!generationView && (evaluation.acceptance!=='HOLD' || !/^sha256:[0-9a-f]{64}$/u.test(evaluation.sha256)
              || episode.promoted_procedure!==false || !Array.isArray(episode.receipt_refs) || episode.receipt_refs.length!==4
              || !['receipt:result','receipt:review','receipt:failure','receipt:rework'].every(ref=>episode.receipt_refs.some(r=>r.ref===ref))
              || !equal(input.sources,manifest.documents.map(d=>({source_revision_ref:d.source_revision_ref,source_asset:d.source_asset})))))fail();
            if(request.scope==='project' && generation.pack_asset){
              const saved=await json(generation.pack_asset);
              if(!sameExactRef(saved.pack.accepted_generation_ref,request.accepted_generation_ref)
                || saved.query_writes!==0 || saved.pack.policy_revision!==CONTEXT_PACK_POLICY
                || saved.pack.document_generations.some(d=>d.index_digest!==assets.get(manifest.index_asset).sha256))fail();
            }
            const search=retrieveAdmittedDocuments(query || request.task_ref, index.sources);
            const available=new Set(index.sources.map(s=>s.source_id));
            if(manifest.documents.some(d=>!available.has(d.source_span_ref)))fail();
            return {source_span_order:search.hits.map(h=>h.source_id),receipt:{...search.receipt,
                evaluation_state:evaluation?.acceptance || 'NOT_EVALUATED',episode_receipt_refs:episode?.receipt_refs.map(r=>r.ref) || [],
                ...(summary.task_ref?{summary_task_ref:summary.task_ref}:{})},
              index_digest:assets.get(manifest.index_asset).sha256};
          },
          async readSourceRevision(binding) {
            guard();
            const doc=manifest?.documents.find(d=>d.source_span_ref===binding.source_span_ref);
            if(!doc || !sameExactRef(doc.source_revision_ref,binding.source_revision_ref))fail();
            [doc.source_asset,doc.extraction_asset,doc.typed_asset,doc.quality_asset].forEach(admit);
            const extracted=await json(doc.extraction_asset), typedRef=await json(doc.typed_asset), quality=await json(doc.quality_asset);
            let typed=typedRef;
            if(generationView){
              const authority=acceptedAsset(generation.accepted_asset);
              if(typedRef.accepted_snapshot_ref?.path!==acceptedSnapshot.path
                || typedRef.accepted_snapshot_ref?.sha256!==acceptedSnapshot.sha256
                || typedRef.locations_asset!==doc.locations_asset)fail();
              const accepted=await json(authority.id), locations=await json(doc.locations_asset);
              const records=accepted.records?.[typedRef.record_index];
              if(!records || records.source_span_ref!==doc.source_span_ref || !sameExactRef(records.source_revision_ref,doc.source_revision_ref))fail();
              typed={...locations,records_json:records.records_json};
            }
            if(extracted.source.sha256!==binding.source_revision_ref.content_id.slice(7)
              || typed.source_sha256!==extracted.source.sha256 || quality.extraction_digest!==assets.get(doc.extraction_asset).sha256
              || typed.extraction_digest!==quality.extraction_digest || quality.index_digest!==assets.get(manifest.index_asset).sha256
              || !sameExactRef(typed.accepted_generation_ref,request.accepted_generation_ref))fail();
            if(extracted.extraction.profile!=='pdfplumber-tables-v1'
              || extracted.extraction.engine!=='pdfplumber'
              || extracted.extraction.extraction_sha256!==hash(Buffer.from(JSON.stringify({source_sha256:extracted.source.sha256,
                profile:extracted.extraction.profile,engine:extracted.extraction.engine,engine_version:extracted.extraction.engine_version,
                pages:extracted.extraction.pages}))).slice(7))fail();
            const records=JSON.parse(typed.records_json).records, proofs=[];
            for(const record of records){
              const loc=typed.locations.find(l=>l.record_id===record.id);
              const page=extracted.extraction.pages.find(p=>p.page_number===loc?.page);
              const paragraph=page?.paragraphs.find(p=>p.paragraph_number===loc.paragraph);
              if(!paragraph || !clean(paragraph.text).includes(clean(record.statement)))fail();
              const chunk=index.sources.find(s=>s.source_id===doc.source_span_ref)?.chunks.find(c=>c.chunk_id===record.id);
              if(!chunk || clean(chunk.text)!==clean(paragraph.text))fail();
              const proof={record_id:record.id,locator:'page:'+loc.page+'/paragraph:'+loc.paragraph,
                page:loc.page,bbox:paragraph.bbox.map(String),extraction_digest:quality.extraction_digest,index_digest:quality.index_digest};
              if(loc.table){
                const table=extracted.extraction.pages.find(p=>p.page_number===loc.table.page)?.tables.find(t=>t.table_number===loc.table.table);
                const cell=table?.cells.find(c=>c.row_number===loc.table.row && c.column_number===loc.table.column);
                if(!cell || cell.text!==record.value)fail();
                proof.table={...loc.table,bbox:cell.bbox.map(String)};
              }
              proofs.push(proof);
            }
            const raw=await read(doc.source_asset);guard();
            return {binding,body_base64:raw.toString('base64'),records_json:typed.records_json,document_proofs:proofs};
          },
        };
        const pack=await createAcceptedContextPack({enabled:true,binding:{project_ref:bound.project_ref,producer_binding_ref:bound.producer_binding_ref},
          providers,sourceReadback:{enabled:true,max_reads:2,bindings:bound.source_bindings},
          measureSourceReads:()=>({...metrics,...(generationView?generationView.metrics():{})}),memoryProfile}).query(request);
        guard();return pack.status==='NOT_AVAILABLE'?unavailable():pack;
      } catch {return unavailable();}
    }});
  } catch {return null;}
}
