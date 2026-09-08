#!/usr/bin/env node
// Fixed host broker. Chat text is document data; only the installer-pinned
// catalog/jobs configuration can select paths, models, tools or approval scope.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openHwpxWorkshopJobs} from './hwpx_workshop_jobs.mjs';
import {readPinnedFile,regularPath,childEnvironment,sha256} from './claude_acp_policy.mjs';
import {readJsonLines} from './claude_acp_server.mjs';
import {verifyHwpxReferenceBinding} from './hwpx_reference_runner.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const REF=/^[a-z][a-z0-9_.:-]{1,120}$/;
const fail=code=>{throw Object.assign(new Error(code),{code});};
function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('HWPX_BROKER_SHAPE');}
function pinned(pin,limit=2*1024*1024){exact(pin,['path','sha256']);return readPinnedFile(pin.path,pin.sha256,limit);}
const json=pin=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pinned(pin)));
function create(file,bytes){fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});return sha256(bytes);}
function relative(root,file){const part=path.relative(root,path.resolve(file));return part&&part!=='..'&&!part.startsWith(`..${path.sep}`)&&!path.isAbsolute(part);}

function inspectReference(reference,file,digest,workingRoot,signal){
  verifyHwpxReferenceBinding(reference);readPinnedFile(file,digest,32*1024*1024);
  const helper=path.join(reference.code_root,'guild_hall/tool_workshop/src/hwpx_reference_child.py');
  // The approved package only is imported explicitly, never live site-packages.
  // No extraction, renderer, model, writer or draft construction occurs here.
  const program=`import sys,pathlib,importlib.util,json,hashlib
library,helper,file,expected=sys.argv[1:]
spec=importlib.util.spec_from_file_location('lxml',pathlib.Path(library)/'__init__.py',submodule_search_locations=[library]);module=importlib.util.module_from_spec(spec);sys.modules['lxml']=module;spec.loader.exec_module(module)
from lxml import etree
spec=importlib.util.spec_from_file_location('_reference_context',helper);reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
raw=reader.bounded_read(pathlib.Path(file),reader.MAX_ZIP);reader.check(hashlib.sha256(raw).hexdigest()==expected,'hash_mismatch')
parts,roots,sections=reader.admission(raw,etree)
print(json.dumps({'text_nodes':[{'part':part,'text_index':index,'text':''.join(node.itertext())} for part in sections for index,node in enumerate(roots[part].iter('{'+reader.HP+'}t'))]},ensure_ascii=True,separators=(',',':')))`;
  return new Promise((resolve,reject)=>{
    const child=spawn(reference.python_executable,['-I','-S','-B','-X',`pycache_prefix=${path.join(workingRoot,`unused-cache-${randomUUID()}`)}`,'-c',program,reference.lxml_root,helper,file,digest],{cwd:workingRoot,env:{SystemRoot:process.env.SystemRoot??'',TEMP:workingRoot,TMP:workingRoot},windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    let output='',bytes=0,stopped=false;
    const stop=()=>{stopped=true;child.kill();};const timer=setTimeout(stop,10000);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536)stop();else output+=chunk;});child.stderr.on('data',()=>{});child.on('error',()=>{stopped=true;});
    child.on('close',code=>{clearTimeout(timer);signal.removeEventListener('abort',stop);if(stopped||code!==0)return reject(Object.assign(new Error('HWPX_REFERENCE_CONTEXT_FAILED'),{code:'HWPX_REFERENCE_CONTEXT_FAILED'}));
      try{verifyHwpxReferenceBinding(reference);readPinnedFile(file,digest,32*1024*1024);resolve(JSON.parse(output));}catch(error){reject(error);}});
  });
}

function leafClient(config,binding,notify){
  pinned(config.node,256*1024*1024);pinned(config.leaf_cli);
  const raw=json(binding),child=spawn(config.node.path,[config.leaf_cli.path,'--binding',binding.path,'--binding-sha256',binding.sha256],{cwd:raw.jobRoot,env:childEnvironment(),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  let sequence=0,forced=false,sessionId=null,initialization=null,stopPromise=null,total=0;
  const pending=new Map();
  const refusePending=()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Object.assign(new Error('HWPX_LEAF_CLOSED'),{code:'HWPX_LEAF_CLOSED'}));}pending.clear();};
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>{refusePending();resolve({code,signal});}));
  child.on('error',refusePending);child.stdin.on('error',refusePending);child.stderr.on('data',()=>{});
  readJsonLines(child.stdout,frame=>{
    total+=Buffer.byteLength(JSON.stringify(frame));if(total>2*1024*1024){forced=true;child.kill();return;}
    if(frame.jsonrpc!=='2.0'){forced=true;child.kill();return;}
    if(Object.hasOwn(frame,'id')){const item=pending.get(frame.id);if(!item){forced=true;child.kill();return;}pending.delete(frame.id);clearTimeout(item.timer);if(frame.error)item.reject(Object.assign(new Error('HWPX_LEAF_REFUSED'),{code:'HWPX_LEAF_REFUSED'}));else item.resolve(frame.result);return;}
    if(frame.method==='session/update'&&frame.params?.sessionId===sessionId&&frame.params.update?.sessionUpdate==='agent_message_chunk'&&frame.params.update.content?.type==='text'&&typeof frame.params.update.content.text==='string')notify(frame.params.update.content.text);
  },()=>{forced=true;child.kill();});
  function request(method,params,timeout=10000){return new Promise((resolve,reject)=>{
    const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(new Error('HWPX_LEAF_TIMEOUT'),{code:'HWPX_LEAF_TIMEOUT'}));},Math.max(1,timeout));
    pending.set(id,{resolve,reject,timer});child.stdin.write(`${JSON.stringify({jsonrpc:'2.0',id,method,params})}\n`);
  });}
  return {
    initialize(){return initialization??=(async()=>{await request('initialize',{protocolVersion:1,clientInfo:{name:'hwpx-workshop-host',version:'1'}});const session=await request('session/new',{cwd:raw.jobRoot,mcpServers:[]});if(typeof session?.sessionId!=='string')fail('HWPX_LEAF_SESSION');sessionId=session.sessionId;return sessionId;})();},
    prompt(text,timeout){return request('session/prompt',{sessionId,prompt:[{type:'text',text}]},timeout);},
    stop(){return stopPromise??=(async()=>{
      // Initialize/session-new are metadata-only. Finish that handshake before
      // asking it to cancel, so an early Escape can receive a real cancel ACK.
      try{if(initialization)await initialization;}catch{}
      let ack=false;try{if(sessionId){const reply=await request('session/cancel',{sessionId},4000);ack=reply&&typeof reply==='object'&&!Array.isArray(reply);}}catch{}
      child.stdin.end();let timer;
      const result=await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000);})]);clearTimeout(timer);
      if(!result){forced=true;child.kill();}
      return {cancel_ack:ack,direct_child_closed:Boolean(result&&result.code===0&&result.signal===null&&!forced)};
    })();},
  };
}

export function openHwpxWorkshopAcp({configPath,configSha256,send}){
  const configPin={path:configPath,sha256:configSha256},config=json(configPin);
  exact(config,['version','jobs_config','default_reference_ref','reference_options','node','leaf_cli']);
  if(config.version!==1||typeof send!=='function'||config.node.path!==process.execPath||config.leaf_cli.path!==path.join(HERE,'claude_acp_cli.mjs'))fail('HWPX_BROKER_CONFIG');
  const jobsConfig=json(config.jobs_config);pinned(config.node,256*1024*1024);pinned(config.leaf_cli);
  const labels=new Map(),allowed=new Set();
  if(!Array.isArray(config.reference_options)||config.reference_options.length<1||config.reference_options.length>32)fail('HWPX_BROKER_CATALOG');
  for(const option of config.reference_options){exact(option,['alias','label','reference_ref']);if(!/^[A-Za-z0-9가-힣_-]{1,32}$/.test(option.alias)||typeof option.label!=='string'||option.label.length>80||labels.has(option.alias)||!jobsConfig.reference_catalog.some(entry=>entry.reference_ref===option.reference_ref))fail('HWPX_BROKER_CATALOG');labels.set(option.alias,option);allowed.add(option.reference_ref);}
  if(!allowed.has(config.default_reference_ref))fail('HWPX_BROKER_CATALOG');
  const manager=openHwpxWorkshopJobs({configPath:config.jobs_config.path,configSha256:config.jobs_config.sha256});
  const sessions=new Map();let initialized=false,closing=false,active=null;
  const current=()=>{pinned(configPin);pinned(config.jobs_config);pinned(config.node,256*1024*1024);pinned(config.leaf_cli);};
  const model=()=>({models:{currentModelId:jobsConfig.model,availableModels:[{modelId:jobsConfig.model,name:jobsConfig.model}]},configOptions:[{id:'model',name:'Model',category:'model',type:'select',currentValue:jobsConfig.model,options:[{value:jobsConfig.model,name:jobsConfig.model}]}]});
  function message(session,text,origin='host',extra={}){if(!closing)send({jsonrpc:'2.0',method:'session/update',params:{sessionId:session.id,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}},_meta:{origin,modelOrigin:origin==='model',...extra}}});}
  function doc(ref){const value=manager.getDocument(ref);if(!allowed.has(value.reference_ref))fail('HWPX_REFERENCE_NOT_ALLOWED');return value;}
  function terminal(session,text,state,extra={}){message(session,text,'host',{state,...extra});return {stopReason:'end_turn',_meta:{origin:'host',modelOrigin:false,state,accepted:false,official_done:false,...extra}};}
  function stopOwned(state){
    state.cancelled=true;state.abort.abort();
    // Stop already-owned children before any potentially revoked bookkeeping.
    const stopped=state.leaf?state.leaf.stop():Promise.resolve(null);
    try{current();if(state.job)manager.cancelJob(state.job.job_ref);}catch{state.recordingFailed=true;}
    return stopped.catch(()=>{state.recordingFailed=true;});
  }
  function recordClose(state,outcome){
    try{current();manager.closeJob(state.token,{directChildClosed:true,outcome});}
    catch(error){state.recordingFailed=true;throw error;}
  }
  function delivered(jobRef){
    const job=manager.getJob(jobRef);doc(job.document_ref);if(job.state!=='COMPLETED_CANDIDATE')fail('HWPX_RESULT_NOT_COMPLETED');
    const result=manager.getResult(jobRef);if(!result)fail('HWPX_RESULT_MISSING');const root=path.join(jobsConfig.work_root,'JOBS',jobRef),delivery=path.join(root,'delivery');regularPath(root,'directory');
    if(!fs.existsSync(delivery))fs.mkdirSync(delivery);regularPath(delivery,'directory');
    const artifacts=result.artifacts.map(item=>{const bytes=readPinnedFile(item.path,item.sha256,64*1024*1024),target=path.join(delivery,item.name);if(fs.existsSync(target)){if(!readPinnedFile(target,item.sha256,64*1024*1024).equals(bytes))fail('HWPX_DELIVERY_CHANGED');}else create(target,bytes);return {name:item.name,path:target,sha256:item.sha256,size_bytes:item.size_bytes};});
    return {document_ref:job.document_ref,job_ref:jobRef,revision:job.revision,artifact_state:result.state,artifacts,accepted:false,official_done:false,visual_review_required:true};
  }
  async function contextFor(documentRef,signal){
    const document=doc(documentRef),entry=jobsConfig.reference_catalog.find(entry=>entry.reference_ref===document.reference_ref),seed=json(entry.seed_binding),author=json(seed.hwpx.author),reference=json(author.reference_binding);
    const previous=document.jobs.filter(job=>job.state==='COMPLETED_CANDIDATE').at(-1);
    let file=reference.template_path,digest=reference.template_sha256,previousRequest=null;
    if(previous){const result=manager.getResult(previous.job_ref),artifact=result.artifacts.find(item=>item.name==='document.hwpx');file=artifact.path;digest=artifact.sha256;
      const old=json(previous.binding),input=old.inputFiles.find(item=>item.path==='input-1.txt');if(input)previousRequest=new TextDecoder('utf-8',{fatal:true}).decode(readPinnedFile(path.join(old.jobRoot,input.path),input.sha256,65536));}
    const original=await inspectReference(reference,reference.template_path,reference.template_sha256,jobsConfig.observed_input_root,signal);
    const content=previous?await inspectReference(reference,file,digest,jobsConfig.observed_input_root,signal):original;
    if(content.text_nodes.length!==original.text_nodes.length||content.text_nodes.some((node,index)=>node.part!==original.text_nodes[index].part||node.text_index!==original.text_nodes[index].text_index))fail('HWPX_REVISION_STRUCTURE_UNSUPPORTED');
    const carry=content.text_nodes.flatMap((node,index)=>node.text===original.text_nodes[index].text?[]:[{part:node.part,text_index:node.text_index,before:original.text_nodes[index].text,after:node.text}]);
    return {document_ref:documentRef,reference_ref:document.reference_ref,approved_reference_sha256:reference.template_sha256,allowed_parts:reference.allowed_parts,
      content_basis:previous?{kind:'previous_completed_document',job_ref:previous.job_ref,sha256:digest,previous_request:previousRequest}:{kind:'approved_reference',sha256:digest},
      reference_text_nodes:original.text_nodes,current_text_nodes:content.text_nodes,carry_forward_edits:carry,
      draft_contract:{file:'draft.json',keys:['text_edits'],edit_keys:['part','text_index','before','after'],before_source:'reference_text_nodes',preserve_empty_text:true,rule:'전체 XML과 expected_text를 출력하지 마세요. carry_forward_edits를 유지하면서 이번 요구를 반영한 최종 text_edits만 작성하세요. before는 원본 reference_text_nodes의 정확한 문자열입니다. 새 문서에는 다른 문서 내용을 섞지 마세요. 승인 양식/허용 부품/모델/권한은 바꾸지 마세요.'}};
  }
  async function write(session,text){
    if(active)fail('HWPX_WORKSHOP_BUSY');
    const state={session,cancelled:false,recordingFailed:false,abort:new AbortController(),leaf:null,job:null,token:null,task:null};active=state;
    state.task=(async()=>{
      let failure=null,response=null,closure={cancel_ack:false,direct_child_closed:false};
      try{
        if(!session.documentRef)session.documentRef=manager.createDocument({referenceRef:config.default_reference_ref,title:text.split('\n')[0].trim().slice(0,100)||'새 문서'}).document_ref;
        const document=doc(session.documentRef),id=randomUUID(),rawName=`request-${id}.txt`,rawBytes=Buffer.from(text);
        current();regularPath(jobsConfig.observed_input_root,'directory');create(path.join(jobsConfig.observed_input_root,rawName),rawBytes);
        const rawRef=`input.request.${id}`;manager.registerObservedInput({documentRef:document.document_ref,inputRef:rawRef,relativePath:rawName,sha256:sha256(rawBytes)});
        const context=await contextFor(document.document_ref,state.abort.signal);if(state.cancelled)fail('HWPX_CANCELLED');current();
        const bytes=Buffer.from(JSON.stringify(context));if(bytes.length>65536)fail('HWPX_REFERENCE_CONTEXT_LIMIT');const contextName=`context-${id}.json`,contextRef=`input.context.${id}`;
        create(path.join(jobsConfig.observed_input_root,contextName),bytes);manager.registerObservedInput({documentRef:document.document_ref,inputRef:contextRef,relativePath:contextName,sha256:sha256(bytes)});
        state.job=manager.issueRevision({documentRef:document.document_ref,inputRefs:[rawRef,contextRef]});const started=manager.startJob(state.job.job_ref);state.token=started.executionToken;
        message(session,'문서 작성을 시작합니다. 승인된 양식과 이번 텍스트 요구만 사용합니다.','host',{job_ref:state.job.job_ref,document_ref:document.document_ref,state:'EXECUTION_UNKNOWN',event:'job_started'});
        state.leaf=leafClient(config,state.job.binding,text=>message(session,text,'model',{job_ref:state.job.job_ref}));await state.leaf.initialize();if(state.cancelled)fail('HWPX_CANCELLED');
        response=await state.leaf.prompt(`현재 작업은 ${state.job.job_ref}입니다. workspace_read_text로 input-1.txt(이번 요구)와 input-2.json(승인 양식/이전 완료 문서의 텍스트)을 읽으세요. current_text_nodes를 바탕으로 이번 요구를 반영하세요. 수정본은 carry_forward_edits의 기존 변경을 유지하고 원본 대비 최종 변경 목록을 만드세요. draft.json은 {"text_edits":[{"part":"Contents/section0.xml","text_index":0,"before":"원본의 정확한 문자열","after":"최종 문자열"}]} 형태만 사용하세요. before는 reference_text_nodes에서 가져옵니다. 실제 바꾼 노드만 넣고 빈 노드는 보존하세요. 전체 XML이나 expected_text를 출력하지 마세요. workspace_write_text(path=draft.json,purpose=work_draft,jobRef=${state.job.job_ref}) 후 반환 sha256으로 hwpx_build_candidate를 한 번 호출하세요. 코드가 pinned XML 치환과 expected_text 생성을 담당합니다. 근거 없이 완료·수락을 주장하지 마세요.`,Math.min(180000,state.job.expires_at-Date.now()));
      }catch(error){failure=error;}finally{if(state.leaf)try{closure=await state.leaf.stop();}catch{state.recordingFailed=true;}}
      try{
        if(state.token){
          const binding=json(state.job.binding),author=json(binding.hwpx.author),operation=path.join(author.work_root,`claude-hwpx-${sha256(state.job.job_ref).slice(0,32)}`);
          const partial=fs.existsSync(path.join(operation,'intent.json'))&&!fs.existsSync(path.join(operation,'result.json'));
          // Host observations only; no prompt, model prose or auth payload is
          // copied into the control log. A log failure cannot imply completion.
          try{create(path.join(path.dirname(state.job.binding.path),'broker-close-observation.json'),Buffer.from(JSON.stringify({version:1,origin:'host',job_ref:state.job.job_ref,binding_sha256:state.job.binding.sha256,node_sha256:config.node.sha256,leaf_cli_sha256:config.leaf_cli.sha256,cancel_requested:state.cancelled,cancel_ack:closure.cancel_ack,direct_child_closed:closure.direct_child_closed,protected_tool_incomplete:partial,state_recording_failed:state.recordingFailed,observed_at:new Date().toISOString()})));}
          catch{return terminal(session,'종료 관측 기록을 보존하지 못했습니다. 자동 재실행하지 않습니다.','EXECUTION_UNKNOWN',{job_ref:state.job.job_ref,recovery_required:true});}
          if(!closure.cancel_ack||!closure.direct_child_closed||partial||state.recordingFailed)return terminal(session,'자식 또는 문서 처리의 종료 기록을 확인하지 못했습니다. 자동 재실행하지 않고 확인을 기다립니다.','EXECUTION_UNKNOWN',{job_ref:state.job.job_ref,recovery_required:true});
          if(state.cancelled){recordClose(state,'cancelled');return terminal(session,'취소했고 자식 종료를 확인했습니다.','CANCELLED',{job_ref:state.job.job_ref});}
          if(failure||response?.stopReason!=='end_turn'||response?._meta?.failure_meta){recordClose(state,'failed');return terminal(session,'이번 문서 작성은 실패했습니다. 같은 job을 자동 재시도하지 않습니다.','FAILED',{job_ref:state.job.job_ref});}
          try{current();manager.collectResult(state.token);recordClose(state,'completed');}catch{recordClose(state,'failed');return terminal(session,'검증된 문서 결과를 확인하지 못했습니다.','FAILED',{job_ref:state.job.job_ref});}
          const result=delivered(state.job.job_ref);return terminal(session,`검토할 문서 후보를 준비했습니다: ${result.artifacts.map(item=>item.name).join(', ')}. 실제 쪽수·시각 검토와 사람 수락은 구분합니다.`,'COMPLETED_CANDIDATE',result);
        }
        return terminal(session,state.cancelled?'작성을 시작하기 전에 취소했습니다.':'문서 입력이나 승인 범위를 확인하지 못해 시작하지 않았습니다.',state.cancelled?'CANCELLED':'HELD',{code:/^[A-Za-z_]+$/.test(failure?.code??'')?failure.code:'HWPX_PREPARATION_FAILED'});
      }catch(error){if(state.recordingFailed)return terminal(session,'자식 종료 후 상태 기록을 확정하지 못했습니다. 자동 재실행하지 않습니다.','EXECUTION_UNKNOWN',{job_ref:state.job?.job_ref,recovery_required:true});throw error;}
      finally{if(active===state)active=null;}
    })();
    return state.task;
  }
  async function dispatch(method,params={}){
    if(closing)fail('HWPX_BROKER_CLOSED');
    // Revocation denies new work, not termination of this session's owned child.
    if(method==='session/cancel'&&active&&active.session.id===params.sessionId){const state=active;await stopOwned(state);await state.task;return {};}
    current();
    if(method==='initialize'){if(initialized||!Number.isSafeInteger(params.protocolVersion)||params.protocolVersion<1)fail('ACP_VERSION');initialized=true;return {protocolVersion:1,agentInfo:{name:'soulforge-hwpx-workshop',version:'1'},agentCapabilities:{loadSession:false,promptCapabilities:{image:false,audio:false,embeddedContext:false},mcpCapabilities:{http:false,sse:false}},authMethods:[],_meta:{origin:'host',modelOrigin:false,text_only:true,attachment_admission_supported:false,reference_options:config.reference_options,runtimeObserved:false}};}
    if(!initialized)fail('ACP_NOT_INITIALIZED');
    if(method==='session/new'){if(sessions.size>=8||['mcpServers','additionalDirectories'].some(key=>params[key]!==undefined&&(!Array.isArray(params[key])||params[key].length))||params._meta?.claudeCode||params._meta?.additionalRoots)fail('CLIENT_SCOPE_OVERRIDE');const id=randomUUID();sessions.set(id,{id,documentRef:null});return {sessionId:id,...model(),_meta:{origin:'host',modelOrigin:false,runtimeObserved:false}};}
    const session=sessions.get(params.sessionId);if(!session)fail('SESSION_UNKNOWN');
    if(method==='session/cancel'){if(session.documentRef){const last=doc(session.documentRef).jobs.at(-1);if(last&&['READY','EXECUTION_UNKNOWN','CANCEL_REQUESTED'].includes(last.state))manager.cancelJob(last.job_ref);}return {};}
    if(method==='session/set_model'){if(params.modelId!==jobsConfig.model||Object.keys(params).some(key=>!['sessionId','modelId'].includes(key)))fail('ACP_METHOD_UNSUPPORTED');return model();}
    if(method==='session/set_config_option'){if(params.configId!=='model'||params.value!==jobsConfig.model||Object.keys(params).some(key=>!['sessionId','configId','value'].includes(key)))fail('ACP_METHOD_UNSUPPORTED');return model();}
    if(method!=='session/prompt')fail('ACP_METHOD_UNSUPPORTED');if(active)fail('HWPX_WORKSHOP_BUSY');
    if(params.modelOrigin===true||params._meta?.modelOrigin===true||!Array.isArray(params.prompt)||params.prompt.length<1||params.prompt.length>16||params.prompt.some(block=>block.type!=='text'||typeof block.text!=='string'||block.modelOrigin===true||Object.keys(block).some(key=>!['type','text','annotations'].includes(key))))fail('HWPX_TEXT_USER_PROMPT_REQUIRED');
    const text=params.prompt.map(block=>block.text).join('\n').trim();if(!text||Buffer.byteLength(text)>16384)fail('HWPX_PROMPT_LIMIT');
    if(!text.startsWith('/'))return write(session,text);
    const [line,...body]=text.split('\n'),[command,...words]=line.split(/\s+/),rest=words.join(' '),request=body.join('\n').trim();
    if(command==='/새문서'||command==='/new'){
      const selected=labels.get(words[0]),referenceRef=selected?.reference_ref??config.default_reference_ref,title=(selected?words.slice(1).join(' '):rest)||'새 문서';
      session.documentRef=manager.createDocument({referenceRef,title}).document_ref;
      return request?write(session,request):terminal(session,'새 문서를 선택했습니다. 작성할 내용을 텍스트로 보내 주세요.','DOCUMENT_SELECTED',{document_ref:session.documentRef});
    }
    if(command==='/수정'||command==='/revise'||command==='/use'){
      if(rest){if(!REF.test(rest))fail('HWPX_DOCUMENT_REF');session.documentRef=doc(rest).document_ref;}if(!session.documentRef)fail('HWPX_DOCUMENT_REQUIRED');
      return request?write(session,request):terminal(session,'이 문서의 다음 수정 내용을 보내 주세요. 이전 완료본을 바탕으로 새 revision을 만듭니다.','DOCUMENT_SELECTED',{document_ref:session.documentRef});
    }
    if(command==='/결과'||command==='/result'){
      const ref=rest||(session.documentRef?doc(session.documentRef).jobs.filter(job=>job.state==='COMPLETED_CANDIDATE').at(-1)?.job_ref:null);if(!ref)fail('HWPX_RESULT_MISSING');const result=delivered(ref);return terminal(session,'이전에 검증된 결과를 그대로 다시 제공합니다. 모델을 호출하지 않았습니다.','RESULT_RETRIEVED',result);
    }
    if(command==='/문서'||command==='/history'){
      const documents=manager.listDocuments().filter(item=>allowed.has(item.reference_ref)).slice(-100).map(item=>({document_ref:item.document_ref,title:item.title,reference_ref:item.reference_ref,jobs:manager.getDocument(item.document_ref).jobs.map(job=>({job_ref:job.job_ref,revision:job.revision,state:job.state}))}));
      return terminal(session,documents.length?documents.map(item=>`${item.title}: ${item.document_ref}`).join('\n'):'아직 작성한 문서가 없습니다.','DOCUMENT_LIST',{documents});
    }
    if(command==='/도움'||command==='/help')return terminal(session,`양식: ${config.reference_options.map(item=>`${item.alias}(${item.label})`).join(', ')}\n/새문서 양식별칭 제목 → 작성 요구\n/수정 문서ref → 수정 요구\n/결과 [jobref], /문서\n텍스트와 승인 양식만 지원하며 바이너리 첨부 admission은 아직 지원하지 않습니다.`,'HELP');
    fail('HWPX_COMMAND_UNSUPPORTED');
  }
  return Object.freeze({dispatch,async close(){if(closing)return;closing=true;const state=active;try{if(state){try{await stopOwned(state);}finally{await state.task;}}}finally{manager.close();}}});
}

export function runHwpxWorkshopProtocol(options,{input=process.stdin,output=process.stdout}={}){
  const broker=openHwpxWorkshopAcp({...options,send:frame=>output.write(`${JSON.stringify(frame)}\n`)});
  const stop=()=>{void broker.close();};
  readJsonLines(input,frame=>{
    if(frame?.jsonrpc!=='2.0'||typeof frame.method!=='string'){stop();return;}
    const hasId=Object.hasOwn(frame,'id');if(hasId&&typeof frame.id!=='string'&&!Number.isSafeInteger(frame.id)){stop();return;}
    if(!hasId){if(frame.method==='session/cancel')void broker.dispatch(frame.method,frame.params).catch(()=>{});return;}
    broker.dispatch(frame.method,frame.params).then(result=>output.write(`${JSON.stringify({jsonrpc:'2.0',id:frame.id,result})}\n`),error=>output.write(`${JSON.stringify({jsonrpc:'2.0',id:frame.id,error:{code:-32000,message:/^[A-Za-z_]+$/.test(error.code??'')?error.code:'HWPX_BROKER_REFUSED'}})}\n`));
  },stop);input.on('end',stop);input.on('close',stop);return broker;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  try{if(args.length!==4||args[0]!=='--config'||args[2]!=='--config-sha256')fail('HWPX_BROKER_ARGUMENTS');runHwpxWorkshopProtocol({configPath:args[1],configSha256:args[3]});}catch(error){process.stderr.write(`${/^[A-Za-z_]+$/.test(error.code??'')?error.code:'HWPX_BROKER_REFUSED'}\n`);process.exitCode=2;}
}
