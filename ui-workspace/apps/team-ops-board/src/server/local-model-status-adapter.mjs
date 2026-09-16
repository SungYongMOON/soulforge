import {createHash} from 'node:crypto';
import {readRootTable} from '../../../../../guild_hall/path_registry/src/root_table.mjs';
import {createAliasedStoreIo} from '../../../../../guild_hall/context_engine/src/adapters/aliased_store_io.mjs';
import {createModelFetch,validateAllowedChatHosts} from '../../../../../guild_hall/context_engine/src/adapters/local_model/ollama_chat.mjs';
import {isDirectLoopbackRequest} from './loopback-request-guard.mjs';

export const LOCAL_MODEL_STATUS_PATH='/local-model-status.json';
const code=/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u;
const text=v=>typeof v==='string'?v.slice(0,200):null;
const count=v=>Number.isFinite(v)&&v>=0?v:null;
const digest=v=>createHash('sha256').update(v).digest('hex');
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function admittedModelOrigin(value,allowed=[]){
  try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return null;
    if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))return u.origin;
    return validateAllowedChatHosts(allowed).includes(u.origin)?u.origin:null;
  }catch{return null;}
}

// Existing model HTTP transport: no proxy, redirect or inference request.
export async function inspectModelTarget(target,{fetchImpl=createModelFetch(target.allowed??[]),now=Date.now}={}){
  const checked=new Date(now()).toISOString();
  const origin=admittedModelOrigin(target.origin,target.allowed);
  if(!origin)return {id:target.id,label:target.label,connection:'unknown',code:'target_not_admitted',models:[],observed_at:checked,inference:'not_tested'};
  const get=async suffix=>{
    const started=now();try{const r=await fetchImpl(origin+suffix,{method:'GET',signal:AbortSignal.timeout(5000)});
      if(!r.ok)return {ok:false,code:`http_${r.status}`,http:r.status,elapsed_ms:now()-started};
      const value=await r.json();if(!value||typeof value!=='object')throw Error('invalid');
      return {ok:true,value,http:r.status,elapsed_ms:now()-started};
    }catch(e){return {ok:false,code:['ECONNREFUSED','ENOTFOUND','ETIMEDOUT','ECONNRESET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(e.code)?e.code:e.name==='TimeoutError'||e.name==='AbortError'?'timeout':'read_failed',elapsed_ms:now()-started};}
  };
  const ollama=target.transport==='ollama';
  const [health,listing,resident]=await Promise.all([get(ollama?'/api/version':'/health'),get(ollama?'/api/tags':'/v1/models'),ollama?get('/api/ps'):Promise.resolve(null)]);
  const raw=ollama?listing.value?.models:listing.value?.data;
  const hasName=r=>typeof (r?.name??r?.model??r?.id)==='string'&&Boolean((r.name??r.model??r.id).trim());
  const listValid=listing.ok&&Array.isArray(raw)&&raw.slice(0,100).every(hasName);
  const residentValid=resident?.ok&&Array.isArray(resident.value?.models)&&resident.value.models.slice(0,100).every(hasName);
  const names=rows=>rows.slice(0,100).map(r=>text(r?.name??r?.model??r?.id)).filter(Boolean);
  const available=listValid?names(raw):[];
  const loaded=residentValid?resident.value.models.slice(0,100):[];
  const expected=target.expected??[];
  const rows=expected.length?expected:available.map(model=>({model,roles:[]}));
  const protocolObserved=listValid||health.ok&&(ollama?typeof health.value?.version==='string':['ok','loading model'].includes(health.value?.status));
  const failures=[health,listing,resident].filter(Boolean).filter(r=>!r.ok).map(r=>r.code);
  return {id:target.id,label:target.label,location:target.location,transport:target.transport,
    connection:protocolObserved?'responding':failures.length>0&&failures.every(c=>c==='ECONNREFUSED')?'refused':failures.some(c=>c==='timeout')?'timeout':'unknown',
    code:failures[0]??null,version:text(health.value?.version),server_readiness:!ollama&&health.ok?text(health.value?.status):null,
    observed_at:checked,elapsed_ms:Math.max(...[health,listing,resident].filter(Boolean).map(r=>r.elapsed_ms)),
    registration_state:listValid?'observed':'unknown',resident_state:residentValid?'observed':'unknown',
    registered_count:listValid?raw.length:null,resident_count:residentValid?resident.value.models.length:null,
    limited:listValid&&raw.length>100||residentValid&&resident.value.models.length>100,
    models:rows.slice(0,100).map(r=>{const active=loaded.find(m=>m.name===r.model||m.model===r.model);return {model:r.model,roles:r.roles,
      registered:listValid?(available.includes(r.model)?true:raw.length<=100?false:null):null,
      resident:residentValid?(active?true:resident.value.models.length<=100?false:null):null,
      memory_bytes:count(active?.size),accelerator_bytes:count(active?.size_vram),context_length:count(active?.context_length),expires_at:stamp(active?.expires_at)};}),
    inference:'not_tested',claim:'API response and model metadata only; inference and application success not tested'};
}

export function createLocalModelStatusReader({tablePath,expectedSha256,projects=[],localTargets=[],remoteLabel='등록된 RAG 모델 서버',fetchImpl,now=Date.now}={}){
  let cache=null,pending=null;
  function targets(){
    const rows=[],issues=[];
    for(const t of localTargets.slice(0,2)){
      const origin=admittedModelOrigin(t.origin);
      if(!origin||!['ollama','openai_chat'].includes(t.transport)){issues.push('local_target_invalid');continue;}
      rows.push({...t,origin,allowed:[],expected:[],location:'이 PC'});
    }
    let io;
    try{io=createAliasedStoreIo(readRootTable({tablePath,expectedSha256}));}catch{issues.push('path_registry_unavailable');return {rows,issues};}
    const shared=new Map();
    for(const project of projects.slice(0,32)){
      if(!code.test(project)){issues.push('project_invalid');continue;}
      try{
        const b=JSON.parse(io.read(`control_root/project-bindings/${project}/graph_index_binding.unified.json`,1024*1024));
        for(const [role,label] of [['llm','추출 LLM'],['embedder','임베딩']]){
          const model=b.graph?.[role],origin=admittedModelOrigin(model?.host,b.graph?.allowed_model_hosts);
          const transport=model?.transport??'ollama';
          if(!origin||!text(model?.model)||!['ollama','openai_chat'].includes(transport)){issues.push(`${project}:model_binding_invalid`);continue;}
          const key=`${origin}:${transport}`;
          if(!shared.has(key))shared.set(key,{id:`rag-model-${digest(key).slice(0,12)}`,label:remoteLabel,location:'과제 binding에 등록된 모델 호스트',origin,transport,allowed:b.graph.allowed_model_hosts??[],expected:[]});
          const target=shared.get(key),row=target.expected.find(r=>r.model===model.model);
          if(row){if(!row.roles.includes(label))row.roles.push(label);}else target.expected.push({model:model.model,roles:[label]});
        }
      }catch{issues.push(`${project}:binding_unavailable`);}
    }
    if(shared.size>8){issues.push('model_host_limit');return {rows,issues};}
    return {rows:[...rows,...shared.values()],issues};
  }
  return {async read(){
    // Re-resolve trusted bindings before using cache. No client-selected URLs.
    const configuration=targets(),key=digest(JSON.stringify(configuration));
    if(cache?.key===key&&now()-cache.at<60000)return {...cache.value,cached:true};
    if(pending?.key===key)return pending.promise;
    const operation=(async()=>{const hosts=await Promise.all(configuration.rows.map(t=>inspectModelTarget(t,{fetchImpl:fetchImpl??createModelFetch(t.allowed),now})));
      const value={state:configuration.issues.length?'partial':'ready',observed_at:new Date(now()).toISOString(),hosts,issues:configuration.issues,cached:false,cache_seconds:60,inference_calls:0};
      cache={key,at:now(),value};return value;
    })();pending={key,promise:operation};try{return await operation;}finally{if(pending?.promise===operation)pending=null;}
  }};
}

export function createLocalModelStatusPlugin(options={}){
  const reader=createLocalModelStatusReader(options);
  const configure=server=>{server.middlewares.use((req,res,next)=>{
    const url=new URL(req.url||'/','http://127.0.0.1');if(url.pathname!==LOCAL_MODEL_STATUS_PATH)return next();
    if(req.method!=='GET'){res.statusCode=405;res.end();return;}
    let origin=true;try{if(req.headers.origin)origin=new URL(req.headers.origin).host===req.headers.host;}catch{origin=false;}
    if(!isDirectLoopbackRequest(req)||!origin||req.headers['sec-fetch-site']==='cross-site'||!/^(127\.0\.0\.1|localhost)(:\d+)?$/u.test(req.headers.host||'')){res.statusCode=403;res.end();return;}
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(url.search){res.statusCode=400;res.end('{}');return;}
    void reader.read().then(v=>res.end(JSON.stringify(v)),()=>{res.statusCode=503;res.end('{"state":"unavailable","hosts":[]}');});
  });};return {name:'local-model-status-read-only',configureServer:configure,configurePreviewServer:configure};
}
