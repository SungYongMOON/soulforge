import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openHwpxWorkshopJobs} from '../src/hwpx_workshop_jobs.mjs';
import {pinHwpxReferenceBinding} from '../src/hwpx_reference_runner.mjs';
import {HWPX_SOURCE_FILES,REQUIRED_FLAGS,loadBinding,sha256} from '../src/claude_acp_policy.mjs';
import {callWorkspaceTool} from '../src/claude_acp_workspace.mjs';
import {readJsonLines} from '../src/claude_acp_server.mjs';
import {DatabaseSync} from 'node:sqlite';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),BROKER=path.join(ROOT,'guild_hall/tool_workshop/src/hwpx_workshop_acp.mjs');
const python=process.env.SOULFORGE_HWPX_TEST_PYTHON;
const available=process.platform==='win32'&&Boolean(python)&&fs.existsSync(python);
const put=(file,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));fs.writeFileSync(file,bytes,{flag:'wx'});return {path:file,sha256:sha256(bytes)};};
function setup({issuanceMs=240000}={}){
  // Reuse the existing report/minutes authority and reference fixture without
  // changing its source or introducing a second general fixture framework.
  const source=fs.readFileSync(new URL('./hwpx_workshop_jobs.test.mjs',import.meta.url),'utf8');
  const body=source.match(/function setup\(\)\{([\s\S]*?)\n\}/)?.[1];assert.ok(body);
  const f=Function('fs','path','os','spawnSync','ROOT','python','put','pinHwpxReferenceBinding','HWPX_SOURCE_FILES','sha256','assert',body)(fs,path,os,spawnSync,ROOT,python,put,pinHwpxReferenceBinding,HWPX_SOURCE_FILES,sha256,assert);
  const fakeSource=path.join(f.root,'SyntheticProvider.cs'),fake=path.join(f.root,'synthetic-provider.exe');
  fs.writeFileSync(fakeSource,`using System;using System.IO;using System.Text;using System.Threading;using System.Collections.Generic;using System.Web.Script.Serialization;
class SyntheticProvider {
static JavaScriptSerializer json=new JavaScriptSerializer();
static void Emit(object v){Console.WriteLine(json.Serialize(v));Console.Out.Flush();}
static string Get(string[] a,string k){int i=Array.IndexOf(a,k);return i<0?"":a[i+1];}
static void Main(string[] a){Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
if(Array.IndexOf(a,"--help")>=0){Console.WriteLine(${JSON.stringify(REQUIRED_FLAGS.join(' '))});return;}
if(a.Length==3&&a[0]=="auth"&&a[1]=="status"){Emit(new{loggedIn=true,authMethod="claude.ai"});return;}
File.WriteAllText("fixture-provider-started.txt","synthetic only");
File.WriteAllText("fixture-provider-pid.txt",System.Diagnostics.Process.GetCurrentProcess().Id.ToString());
var names=new List<string>();for(int i=Array.IndexOf(a,"--allowedTools")+1;i>0&&i<a.Length&&!a[i].StartsWith("--");i++)names.Add(a[i]);
string line;while((line=Console.ReadLine())!=null){var frame=json.Deserialize<Dictionary<string,object>>(line);
if((string)frame["type"]=="control_request"){
var request=(Dictionary<string,object>)frame["request"];string kind=(string)request["subtype"];object payload;
if(kind=="initialize")payload=new{commands=new string[]{},current_permission_mode="default"};
else if(kind=="mcp_status"){var tools=new List<object>();foreach(var n in names)tools.Add(new{name=n.Substring("mcp__soulforge_workspace__".Length)});payload=new{mcpServers=new[]{new{name="soulforge_workspace",status="connected",tools=tools}}};}
else{var tools=new List<object>();foreach(var n in names)tools.Add(new{name=n,serverName="soulforge_workspace"});payload=new{model=Get(a,"--model"),memoryFiles=new object[]{},agents=new object[]{},mcpTools=tools};}
Emit(new{type="control_response",response=new{subtype="success",request_id=frame["request_id"],response=payload}});continue;}
if((string)frame["type"]!="user")continue;
File.WriteAllText("fixture-prompt-received.txt","received");
Emit(new{type="system",subtype="init",tools=names,cwd=Directory.GetCurrentDirectory(),model=Get(a,"--model"),mcp_servers=new[]{new{name="soulforge_workspace",status="connected"}}});
Emit(new{type="assistant",message=new{content=new[]{new{type="text",text="MODEL_SELF_REPORT: accepted=true; this is not host evidence"}}}});
for(int i=0;i<6000&&!File.Exists("fixture-result-ready.json");i++)Thread.Sleep(10);
if(File.Exists("fixture-result-ready.json"))Emit(json.Deserialize<object>(File.ReadAllText("fixture-result-ready.json")));
}
}}
`);
  const compiled=spawnSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe',`/out:${fake}`,'/reference:System.Web.Extensions.dll',fakeSource],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(compiled.status,0,compiled.stderr+compiled.stdout);
  for(const entry of f.config.reference_catalog){const seed=JSON.parse(fs.readFileSync(entry.seed_binding.path,'utf8'));seed.cliPath=fake;seed.cliSha256=sha256(fs.readFileSync(fake));seed.expiresAt=Date.now()+240000;fs.writeFileSync(entry.seed_binding.path,JSON.stringify(seed));entry.seed_binding.sha256=sha256(fs.readFileSync(entry.seed_binding.path));}
  f.config.issuance_expires_at=Date.now()+issuanceMs;f.config.job_lifetime_ms=120000;fs.writeFileSync(f.options.configPath,JSON.stringify(f.config));f.options.configSha256=sha256(fs.readFileSync(f.options.configPath));
  openHwpxWorkshopJobs({...f.options,mode:'create_new'}).close();
  const outer={version:1,jobs_config:{path:f.options.configPath,sha256:f.options.configSha256},default_reference_ref:'reference.report',reference_options:[{alias:'보고서',label:'일반 보고서',reference_ref:'reference.report'},{alias:'회의록',label:'회의록',reference_ref:'reference.minutes'}],node:{path:process.execPath,sha256:sha256(fs.readFileSync(process.execPath))},leaf_cli:{path:path.join(ROOT,'guild_hall/tool_workshop/src/claude_acp_cli.mjs'),sha256:sha256(fs.readFileSync(path.join(ROOT,'guild_hall/tool_workshop/src/claude_acp_cli.mjs')))}};
  f.outer=put(path.join(f.common,'catalog','broker.json'),outer);return f;
}
function client(f,onJob){
  const child=spawn(process.execPath,[BROKER,'--config',f.outer.path,'--config-sha256',f.outer.sha256],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot??'',WINDIR:process.env.WINDIR??'',PATH:process.env.PATH??'',TEMP:f.root,TMP:f.root}});
  let id=0;const pending=new Map(),messages=[];let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  const ended=new Promise(resolve=>child.on('close',code=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error(`broker closed ${code}: ${stderr}`));}pending.clear();resolve(code);}));
  readJsonLines(child.stdout,frame=>{messages.push(frame);if(frame.method==='session/update'&&frame.params._meta?.origin==='host'&&frame.params._meta?.event==='job_started')onJob?.(frame.params._meta.job_ref);
    const entry=pending.get(frame.id);if(entry){clearTimeout(entry.timer);pending.delete(frame.id);frame.error?entry.reject(Object.assign(new Error(frame.error.message),{code:frame.error.message})):entry.resolve(frame.result);}},()=>child.kill());
  return {child,messages,request(method,params={}){const key=++id;return new Promise((resolve,reject)=>{pending.set(key,{resolve,reject,timer:setTimeout(()=>reject(new Error('fixture request timeout')),70000)});child.stdin.write(`${JSON.stringify({jsonrpc:'2.0',id:key,method,params})}\n`);});},async close(){child.stdin.end();const timer=setTimeout(()=>child.kill(),10000);try{return await ended;}finally{clearTimeout(timer);}}};
}
const prompt=(sessionId,text,extra={})=>({sessionId,prompt:[{type:'text',text}],...extra});

test('fixed broker uses real v2 ACP and tools serially, preserves revision basis and retrieves completed bytes without a model',{
  skip:available?false:'Windows and SOULFORGE_HWPX_TEST_PYTHON are required for the synthetic v2 provider fixture',timeout:180000,
},async t=>{
  const f=setup();let rpc,complete=false,mode='write',variant='A';const contexts=[],writers=[],writerErrors=[];
  const jobRoot=ref=>path.join(f.work,'JOBS',ref),bindingPath=ref=>path.join(f.common,'jobs',ref,'control','binding.json');
  async function writer(jobRef){
    const file=bindingPath(jobRef),binding=loadBinding(file,sha256(fs.readFileSync(file))),context=JSON.parse(fs.readFileSync(path.join(binding.jobRoot,'input-2.json'),'utf8'));
    contexts.push(context);
    if(mode==='wait')return;
    if(mode==='partial'){
      const root=path.join(binding.hwpxConfiguration.author.work_root,`claude-hwpx-${sha256(jobRef).slice(0,32)}`);fs.mkdirSync(root);put(path.join(root,'intent.json'),{fixture:'interrupted protected tool intent'});
      put(path.join(binding.jobRoot,'fixture-result-ready.json'),{type:'result',subtype:'error_during_execution',is_error:true});return;
    }
    // The provider is synthetic. This host fixture drives the actual v2 tool
    // contract once, rather than mocking author, queue or result validation.
    const first=context.reference_text_nodes.find(node=>node.text.length>0),key=node=>`${node.part}:${node.text_index}`;
    const edits=new Map(context.carry_forward_edits.map(edit=>[key(edit),edit]));
    edits.set(key(first),{part:first.part,text_index:first.text_index,before:first.text,after:first.text.length>=8?`합성 보고서 ${variant}`:`합성회의 ${variant}`});
    const draft=JSON.stringify({text_edits:[...edits.values()]});assert.ok(draft.length<2000);assert.equal(Object.hasOwn(context,'sections'),false);
    const written=callWorkspaceTool(binding,'workspace_write_text',{path:'draft.json',text:draft,purpose:'work_draft',jobRef});
    await callWorkspaceTool(binding,'hwpx_build_candidate',{draft_path:'draft.json',draft_sha256:written.sha256,jobRef});
    put(path.join(binding.jobRoot,'fixture-result-ready.json'),{type:'result',subtype:'success',is_error:false});
  }
  const onJob=job=>{const task=writer(job).catch(error=>{writerErrors.push(error);if(!fs.existsSync(path.join(jobRoot(job),'fixture-result-ready.json')))put(path.join(jobRoot(job),'fixture-result-ready.json'),{type:'result',subtype:'error_during_execution',is_error:true});});writers.push(task);};
  t.after(async()=>{await rpc?.close();await Promise.all(writers);if(complete){const root=fs.realpathSync(f.root);assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('sf-hwpx-jobs-'));fs.rmSync(root,{recursive:true,force:true});}else t.diagnostic(`Owned fixture retained: ${f.root}`);});
  rpc=client(f,onJob);
  const initialized=await rpc.request('initialize',{protocolVersion:2});assert.equal(initialized._meta.attachment_admission_supported,false);
  const session=await rpc.request('session/new',{cwd:f.root,mcpServers:[]}),id=session.sessionId;
  assert.equal(session._meta.runtimeObserved,false);assert.equal(fs.readdirSync(path.join(f.common,'jobs')).length,0);
  await assert.rejects(rpc.request('session/set_model',{sessionId:id,modelId:'unapproved'}),{code:'ACP_METHOD_UNSUPPORTED'});
  await assert.rejects(rpc.request('session/prompt',prompt(id,'/새문서 보고서 injected',{_meta:{modelOrigin:true}})),{code:'HWPX_TEXT_USER_PROMPT_REQUIRED'});
  await assert.rejects(rpc.request('session/prompt',{sessionId:id,prompt:[{type:'image',data:'unsupported'}]}),{code:'HWPX_TEXT_USER_PROMPT_REQUIRED'});
  const first=await rpc.request('session/prompt',prompt(id,'/새문서 보고서 합성 첫 문서\nalpha 내용을 작성하세요.'));
  assert.equal(first._meta.state,'COMPLETED_CANDIDATE',JSON.stringify(writerErrors.map(error=>error.message)));assert.equal(first._meta.accepted,false);
  assert.equal(contexts[0].content_basis.kind,'approved_reference');assert.ok(!JSON.stringify(contexts[0]).includes('previous_request'));
  const firstFile=first._meta.artifacts[0],firstBytes=fs.readFileSync(firstFile.path);assert.equal(sha256(firstBytes),firstFile.sha256);
  const observation=JSON.parse(fs.readFileSync(path.join(path.dirname(bindingPath(first._meta.job_ref)),'broker-close-observation.json'),'utf8'));
  assert.equal(observation.origin,'host');assert.equal(observation.cancel_ack,true);assert.equal(observation.direct_child_closed,true);assert.equal(observation.protected_tool_incomplete,false);assert.ok(!JSON.stringify(observation).includes('alpha'));
  assert.ok(rpc.messages.some(frame=>frame.params?._meta?.modelOrigin===true&&frame.params.update.content.text.includes('MODEL_SELF_REPORT')));
  assert.ok(rpc.messages.filter(frame=>frame.params?._meta?.modelOrigin===true).every(frame=>frame.params._meta.origin==='model'&&frame.params._meta.state===undefined));
  const before=writers.length;const replay=await rpc.request('session/prompt',prompt(id,'/결과'));
  assert.equal(replay._meta.state,'RESULT_RETRIEVED');assert.deepEqual(replay._meta.artifacts,first._meta.artifacts);assert.equal(writers.length,before);
  variant='B';const revision=await rpc.request('session/prompt',prompt(id,'이전 완료 문서의 alpha 내용을 beta로 수정하세요.'));
  assert.equal(revision._meta.state,'COMPLETED_CANDIDATE',JSON.stringify(writerErrors.map(error=>error.message)));
  assert.equal(revision._meta.document_ref,first._meta.document_ref);assert.notEqual(revision._meta.job_ref,first._meta.job_ref);
  assert.equal(contexts[1].content_basis.kind,'previous_completed_document');assert.equal(contexts[1].content_basis.job_ref,first._meta.job_ref);
  assert.match(contexts[1].content_basis.previous_request,/alpha/);assert.ok(contexts[1].current_text_nodes.some(node=>node.text==='합성 보고서 A'));assert.ok(contexts[1].carry_forward_edits.some(edit=>edit.after==='합성 보고서 A'));
  assert.deepEqual(fs.readFileSync(firstFile.path),firstBytes);
  variant='C';const second=await rpc.request('session/prompt',prompt(id,'/새문서 회의록 합성 새 회의\n별개 문서를 작성하세요.'));
  assert.equal(second._meta.state,'COMPLETED_CANDIDATE',JSON.stringify(writerErrors.map(error=>error.message)));assert.notEqual(second._meta.document_ref,first._meta.document_ref);
  assert.equal(contexts[2].content_basis.kind,'approved_reference');assert.ok(!JSON.stringify(contexts[2]).includes('alpha'));assert.ok(!JSON.stringify(contexts[2]).includes('합성 보고서 B'));
  await rpc.close();rpc=client(f,onJob);await rpc.request('initialize',{protocolVersion:1});const reopened=await rpc.request('session/new',{}),reopenedId=reopened.sessionId;
  const afterRestart=await rpc.request('session/prompt',prompt(reopenedId,`/결과 ${first._meta.job_ref}`));assert.equal(afterRestart._meta.state,'RESULT_RETRIEVED');assert.deepEqual(afterRestart._meta.artifacts,first._meta.artifacts);assert.equal(writers.length,3);
  const history=await rpc.request('session/prompt',prompt(reopenedId,'/문서'));assert.equal(history._meta.documents.length,2);
  mode='wait';const pending=rpc.request('session/prompt',prompt(reopenedId,`/수정 ${second._meta.document_ref}\n취소할 요구입니다.`));
  for(let tries=0;tries<200&&writers.length<4;tries++)await new Promise(resolve=>setTimeout(resolve,20));
  await rpc.request('session/cancel',{sessionId:reopenedId});assert.equal((await pending)._meta.state,'CANCELLED');
  mode='partial';const unknown=await rpc.request('session/prompt',prompt(reopenedId,'중간 처리의 불명 상태를 합성합니다.'));assert.equal(unknown._meta.state,'EXECUTION_UNKNOWN');
  const unknownJob=unknown._meta.job_ref;await rpc.close();rpc=client(f,onJob);await rpc.request('initialize',{protocolVersion:1});const finalSession=await rpc.request('session/new',{});
  const denied=await rpc.request('session/prompt',prompt(finalSession.sessionId,`/수정 ${second._meta.document_ref}\n자동 재시도하면 안 됩니다.`));assert.equal(denied._meta.state,'HELD');
  const manager=openHwpxWorkshopJobs(f.options);try{assert.equal(manager.getJob(unknownJob).recovery_required,true);}finally{manager.close();}
  assert.equal(writers.length,5);assert.deepEqual(writerErrors,[]);complete=true;
});

for(const scenario of ['broker-config-cancel','jobs-config-cancel','jobs-config-close','expired-close'])test(`owned cleanup survives ${scenario} and leaves uncertain state durable`,{
  skip:available?false:'Windows and SOULFORGE_HWPX_TEST_PYTHON are required for the owned synthetic provider',timeout:40000,
},async t=>{
  const f=setup({issuanceMs:scenario==='expired-close'?15000:240000});let jobRef=null,complete=false;
  const rpc=client(f,job=>{jobRef=job;});
  t.after(async()=>{await rpc.close();if(complete){const root=fs.realpathSync(f.root);assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('sf-hwpx-jobs-'));fs.rmSync(root,{recursive:true,force:true});}else t.diagnostic(`Owned cleanup failure fixture retained: ${f.root}`);});
  await rpc.request('initialize',{protocolVersion:1});const {sessionId}=await rpc.request('session/new',{});
  await assert.rejects(rpc.request('session/cancel',{}),{code:'SESSION_UNKNOWN'});
  // No writer fixture: the real v2 leaf's owned synthetic provider remains in
  // its prompt wait until the broker cancels/closes it. No model or HWP runs.
  const pending=rpc.request('session/prompt',prompt(sessionId,'취소 경계만 검사하는 합성 요구입니다.')).then(result=>({result}),error=>({error}));
  const until=Date.now()+12000;
  while(Date.now()<until&&(!jobRef||!fs.existsSync(path.join(f.work,'JOBS',jobRef,'fixture-prompt-received.txt'))))await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(jobRef);const jobRoot=path.join(f.work,'JOBS',jobRef);assert.ok(fs.existsSync(path.join(jobRoot,'fixture-prompt-received.txt')));
  const providerPid=Number(fs.readFileSync(path.join(jobRoot,'fixture-provider-pid.txt'),'utf8'));assert.ok(Number.isSafeInteger(providerPid));assert.equal(process.kill(providerPid,0),true);
  const bindingPath=path.join(f.common,'jobs',jobRef,'control','binding.json'),binding=JSON.parse(fs.readFileSync(bindingPath,'utf8'));
  if(scenario==='expired-close')await new Promise(resolve=>setTimeout(resolve,Math.max(0,binding.expiresAt-Date.now()+30)));
  else fs.appendFileSync(scenario==='broker-config-cancel'?f.outer.path:f.options.configPath,' ');
  const started=Date.now();
  if(scenario.endsWith('-cancel'))assert.deepEqual(await rpc.request('session/cancel',{sessionId}),{});
  else assert.equal(await rpc.close(),0,'broker.close must reach manager.close and natural exit');
  const completion=await pending;assert.equal(completion.result?._meta.state,'EXECUTION_UNKNOWN',completion.error?.message);
  assert.ok(Date.now()-started<9000,'cleanup must not wait for the original 120-second turn timeout');
  assert.throws(()=>process.kill(providerPid,0),{code:'ESRCH'},'the exact owned provider actually terminated');
  const db=new DatabaseSync(path.join(f.common,'manager','jobs.sqlite'),{readOnly:true});
  try{const row=db.prepare('SELECT state,result_sha256 FROM jobs WHERE job_ref=?').get(jobRef);assert.ok(['EXECUTION_UNKNOWN','CANCEL_REQUESTED'].includes(row.state));assert.equal(row.result_sha256,null);}finally{db.close();}
  const observation=JSON.parse(fs.readFileSync(path.join(path.dirname(bindingPath),'broker-close-observation.json'),'utf8'));
  assert.equal(observation.state_recording_failed,scenario!=='expired-close');
  if(scenario==='expired-close'){
    // Expiry can make a late prompt reply trigger forced leaf teardown. The
    // actual owned PID is gone above, but do not upgrade that to verified close.
    assert.equal(observation.cancel_ack,false);assert.equal(typeof observation.direct_child_closed,'boolean');
  }else assert.equal(observation.direct_child_closed,true);
  complete=true;
});
