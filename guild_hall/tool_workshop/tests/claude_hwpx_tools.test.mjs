import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {fixture} from './claude_acp_fixture.mjs';
import {loadBinding,launchSpec,HWPX_SOURCE_FILES,sha256} from '../src/claude_acp_policy.mjs';
import {callWorkspaceTool,workspaceTools} from '../src/claude_acp_workspace.mjs';
import {pinHwpxReferenceBinding} from '../src/hwpx_reference_runner.mjs';
import {createDurableToolWorkshop} from '../src/tool_workshop_durable.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const python=process.env.SOULFORGE_HWPX_TEST_PYTHON;
const options={skip:!python||!fs.existsSync(python)?'SOULFORGE_HWPX_TEST_PYTHON is required for actual canonical pack':false,timeout:90000};
const fixtureCode=fs.readFileSync(new URL('./hwpx_reference_child.test.mjs',import.meta.url),'utf8').match(/const fixtureCode=String\.raw`([\s\S]*?)`;/)?.[1];
const save=(file,value)=>{const bytes=Buffer.from(JSON.stringify(value));fs.writeFileSync(file,bytes);return {path:file,sha256:sha256(bytes)};};
function setup(t,{native=false,compact=false}={}){
  const f=fixture();
  t.after(()=>{const root=fs.realpathSync(f.root);assert.ok(path.basename(root).startsWith('soulforge-claude-scope-'));assert.equal(path.dirname(root),fs.realpathSync(path.dirname(f.root)));fs.rmSync(root,{recursive:true,force:true});});
  const dirs=Object.fromEntries(['authority','input','work','output','queue','fixture','native-work','native-output'].map(name=>{const dir=path.join(f.root,name);fs.mkdirSync(dir);return [name,dir];}));
  const code=fixtureCode+String.raw`
with zipfile.ZipFile(root/'candidate.hwpx') as z:
    (root/'draft.json').write_text(json.dumps({'sections':[{'part':p,'xml':z.read(p).decode('utf-8')} for p in request['allowed_parts']],'expected_text':request['expected_text']},ensure_ascii=False),encoding='utf-8')
edits=[]
with zipfile.ZipFile(root/'reference.hwpx') as before, zipfile.ZipFile(root/'candidate.hwpx') as after:
    for part in request['allowed_parts']:
        old=list(ET.fromstring(before.read(part)).iter('{'+HP+'}t'));new=list(ET.fromstring(after.read(part)).iter('{'+HP+'}t'))
        edits += [{'part':part,'text_index':i,'before':a.text or '', 'after':b.text or ''} for i,(a,b) in enumerate(zip(old,new)) if a.text!=b.text]
(root/'compact-draft.json').write_text(json.dumps({'text_edits':edits},ensure_ascii=False),encoding='utf-8')
`;
  const generated=spawnSync(python,['-I','-B','-c',code,dirs.fixture,path.join(ROOT,'.registry/skills/hwpx_document/codex/templates/base'),'pass'],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(generated.status,0,generated.stderr);
  const reference=path.join(dirs.authority,'reference.hwpx');fs.writeFileSync(reference,fs.readFileSync(path.join(dirs.fixture,'reference.hwpx')));
  const referenceBinding=pinHwpxReferenceBinding({pythonExecutable:python,templatePath:reference,templateApprovalRef:'approval.template',templateProvenance:'synthetic_fixture',allowedParts:['Contents/section0.xml','Contents/section1.xml']});
  const author={version:1,project_ref:f.raw.projectRef,job_ref:f.raw.jobRef,source_ref:'source.synthetic',revision:'revision.one',approval_ref:'approval.synthetic',provenance:'synthetic_fixture',
    input_root:dirs.input,work_root:dirs.work,output_root:dirs.output,queue_root:dirs.queue,
    reference_binding:save(path.join(dirs.authority,'reference.json'),referenceBinding),pack_sha256:sha256(fs.readFileSync(path.join(ROOT,'.registry/skills/hwpx_document/codex/scripts/office/pack.py')))};
  const hwpx={author:save(path.join(dirs.authority,'author.json'),author),native:null,pdf:null};
  if(native){
    // Deliberately unusable synthetic OS values. These branches run only in a
    // separate process with explicit renderer/verifier module mocks below.
    const nativeBinding={enabled:true,renderer_ref:'renderer.hancom_hwpx_pdf:v1',input_root:dirs.output,output_root:dirs['native-output'],work_root:dirs['native-work'],
      powershell_executable:'synthetic-not-executed',powershell_sha256:'0'.repeat(64),hwp_executable:'synthetic-not-executed',hwp_sha256:'0'.repeat(64),
      security_module_dll:'synthetic-not-read',security_module_sha256:'0'.repeat(64),script_path:'synthetic-not-executed',script_sha256:'0'.repeat(64),user_sid:'synthetic-not-used',existing_module_name:'FilePathCheckerModule'};
    hwpx.native=save(path.join(dirs.authority,'native.json'),nativeBinding);
    hwpx.pdf=save(path.join(dirs.authority,'pdf.json'),{code_root:ROOT,pdf_root:dirs['native-output'],python_executable:'synthetic-not-executed',python_sha256:'0'.repeat(64),
      python_version:'3.12.0',python_files:[],libraries:{},library_files:[],pypdf_version:'synthetic',pillow_version:'synthetic',poppler_executable:'synthetic-not-executed',poppler_files:[],sources:[]});
  }
  Object.assign(f.raw,{version:2,hwpx,sourceHashes:Object.fromEntries(HWPX_SOURCE_FILES.map(file=>[file,sha256(fs.readFileSync(path.join(ROOT,file)))]))});
  f.raw.tools.push('hwpx_build_candidate');f.pin();
  const expectedText=JSON.parse(fs.readFileSync(path.join(dirs.fixture,'draft.json'),'utf8')).expected_text;
  const draft=fs.readFileSync(path.join(dirs.fixture,compact?'compact-draft.json':'draft.json'),'utf8');
  return {...f,dirs,author,draft,expectedText,build:{draft_path:'draft.json',draft_sha256:sha256(Buffer.from(draft)),jobRef:f.raw.jobRef}};
}
function writeDraft(f,binding){return callWorkspaceTool(binding,'workspace_write_text',{path:'draft.json',text:f.draft,purpose:'work_draft',jobRef:f.raw.jobRef});}
function noCustody(f){assert.equal(createDurableToolWorkshop({stateRoot:f.dirs.queue}).getCustodyReceipt(f.raw.jobRef),null);assert.deepEqual(fs.readdirSync(f.dirs.output),[]);}
async function mcp(t,f){
  const child=spawn(process.execPath,[path.join(ROOT,'guild_hall/tool_workshop/src/claude_acp_cli.mjs'),'--workspace-mcp','--binding',f.bindingPath,'--binding-sha256',sha256(fs.readFileSync(f.bindingPath))],
    {windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot??'',TEMP:f.dirs.fixture,TMP:f.dirs.fixture}});
  let seq=0,buffer='',outputBytes=0;const pending=new Map();
  const exit=once(child,'close');
  child.stdout.on('data',bytes=>{outputBytes+=bytes.length;assert.ok(outputBytes<2*1024*1024);buffer+=bytes.toString('utf8');let end;
    while((end=buffer.indexOf('\n'))>=0){const row=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(row.id)?.(row);pending.delete(row.id);}});
  child.stderr.on('data',()=>{});
  t.after(async()=>{child.stdin.end();if(child.exitCode===null&&child.signalCode===null)child.kill();await exit;});
  const request=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(new Error('synthetic_mcp_timeout')),45000);pending.set(id,value=>{clearTimeout(timer);resolve(value);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  assert.equal((await request('initialize',{protocolVersion:'2025-03-26'})).result.protocolVersion,'2025-03-26');
  return {child,request,exit,tool:async(name,args)=>{const row=await request('tools/call',{name,arguments:args});return row.result;}};
}

test('legacy v1 retains its three text tools and cannot acquire the explicit HWPX tool',()=>{
  const f=fixture(),binding=f.load();assert.equal(workspaceTools(binding).length,3);
  assert.throws(()=>callWorkspaceTool(binding,'hwpx_build_candidate',{}),/TOOL_DENIED/);
  f.raw.tools.push('hwpx_build_candidate');f.pin();assert.throws(f.load,/TOOL_ALLOWLIST/);
});

test('v2 exact fixed source closure stays below 32 KiB and introduces no builtin/model escalation',options,t=>{
  const f=setup(t),binding=f.load();assert.ok(fs.statSync(f.bindingPath).size<32768);assert.equal(HWPX_SOURCE_FILES.length,20);
  assert.equal(workspaceTools(binding).length,4);const spec=launchSpec(binding),value=flag=>spec.args[spec.args.indexOf(flag)+1];
  assert.equal(value('--tools'),'');assert.equal(value('--model'),f.raw.model);assert.ok(JSON.parse(value('--settings')).permissions.deny.includes('Bash'));
  for(const mutate of [()=>f.raw.sourceHashes[HWPX_SOURCE_FILES[4]]='0'.repeat(64),()=>f.raw.hwpx.author={path:path.join(f.jobRoot,'author.json'),sha256:'0'.repeat(64)},()=>f.raw.hwpx.pdf={path:'unbound',sha256:'0'.repeat(64)}]){
    const before=structuredClone(f.raw);mutate();f.pin();assert.throws(f.load);Object.keys(f.raw).forEach(key=>delete f.raw[key]);Object.assign(f.raw,before);
  }
  f.author.job_ref='job.foreign';f.raw.hwpx.author=save(f.raw.hwpx.author.path,f.author);f.pin();assert.throws(f.load,/HWPX_JOB_BINDING/);
});

for(const compact of [false,true])test(`standalone real MCP ${compact?'compact edits':'full XML'} reaches canonical pack and custody; duplicate and restart cannot re-execute`,options,async t=>{
  const f=setup(t,{compact}),rpc=await mcp(t,f);
  assert.equal((await rpc.tool('workspace_write_text',{path:'draft.json',text:f.draft,purpose:'work_draft',jobRef:f.raw.jobRef})).isError,false);
  const response=await rpc.tool('hwpx_build_candidate',f.build);assert.equal(response.isError,false,JSON.stringify(response));
  const result=JSON.parse(response.content[0].text);assert.equal(result.state,'structural_candidate');assert.equal(result.render_required,true);
  assert.equal(result.accepted,false);assert.equal(result.official_done,false);assert.equal(sha256(fs.readFileSync(result.hwpx.path)),result.hwpx.sha256);
  const queue=createDurableToolWorkshop({stateRoot:f.dirs.queue}),events=queue.eventLog();
  assert.deepEqual(JSON.parse((await rpc.tool('hwpx_build_candidate',f.build)).content[0].text),result);
  rpc.child.stdin.end();await rpc.exit;
  const restarted=await mcp(t,f);
  assert.equal((await restarted.tool('workspace_read_text',{path:'draft.json'})).isError,true);
  assert.deepEqual(JSON.parse((await restarted.tool('hwpx_build_candidate',f.build)).content[0].text),result);
  assert.deepEqual(queue.eventLog(),events);
  fs.writeFileSync(result.hwpx.path,'synthetic changed bytes');
  assert.equal((await restarted.tool('hwpx_build_candidate',f.build)).isError,true);
  assert.deepEqual((await restarted.request('ping')).result,{});
});

test('unbound draft, foreign job, changed hash and current revocation are MCP tool errors without killing the protocol',options,async t=>{
  const f=setup(t),rpc=await mcp(t,f);
  fs.writeFileSync(path.join(f.jobRoot,'draft.json'),f.draft);
  for(const args of [f.build,{...f.build,jobRef:'job.foreign'},{...f.build,draft_path:'../outside.json'},{...f.build,draft_sha256:'0'.repeat(64)}]){
    assert.equal((await rpc.tool('hwpx_build_candidate',args)).isError,true);assert.deepEqual((await rpc.request('ping')).result,{});
  }
  fs.appendFileSync(f.bindingPath,' ');assert.equal((await rpc.tool('workspace_list',{})).isError,true);assert.deepEqual((await rpc.request('ping')).result,{});noCustody(f);
});

test('stdio lifecycle end cancels the pending HWPX operation before custody',options,async t=>{
  const f=setup(t),rpc=await mcp(t,f);
  await rpc.tool('workspace_write_text',{path:'draft.json',text:f.draft,purpose:'work_draft',jobRef:f.raw.jobRef});
  const pending=rpc.tool('hwpx_build_candidate',f.build);rpc.child.stdin.end();
  assert.equal((await pending).isError,true);await rpc.exit;noCustody(f);
});

const mockProgram=String.raw`
import fs from 'node:fs';import path from 'node:path';import {mock} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const [sourceRoot,bindingPath,bindingSha,mode,draft,expectedJson]=process.argv.slice(1);let nativeCalls=0,pdfCalls=0;const controller=new AbortController();
mock.module(new URL('hancom_hwpx_render.mjs',sourceRoot).href,{namedExports:{renderHwpxInExistingSession:async args=>{
  nativeCalls++;assert.equal(args.binding.existing_module_name,'FilePathCheckerModule');assert.ok(args.signal);assert.ok(args.deadline>performance.now());
  if(mode==='unknown')throw Object.assign(new Error('synthetic native unknown'),{code:'cleanup_unverified'});
  if(mode==='cancel'){controller.abort();throw Object.assign(new Error('synthetic cancellation'),{code:'cancelled'});}
  const file=path.join(args.outputRoot,args.runId+'.pdf'),bytes=Buffer.from('%PDF-SYNTHETIC\n%%EOF');fs.writeFileSync(file,bytes,{flag:'wx'});
  return {pdf_path:file,pdf_sha256:hash(bytes),pdf_size_bytes:bytes.length,input_sha256:args.expectedInputSha256,cleanup_verified:true};
}}});
mock.module(new URL('hwpx_pdf_verifier.mjs',sourceRoot).href,{namedExports:{verifyHwpxPdfVerifierBinding:()=>{if(mode==='pdf-drift')throw Error('synthetic_pdf_binding_drift');return true;},verifyRenderedHwpxPdf:async args=>{
  pdfCalls++;assert.deepEqual(args.expectedText,JSON.parse(expectedJson));assert.ok(args.lease.operation_ref.startsWith('mcp.hwpx:'));assert.equal(args.lease.lease_id,undefined);args.queue.assertCurrentLease(args.lease);
  const qa=path.join(args.runRoot,'mock-qa');fs.mkdirSync(qa);const file=path.join(qa,'rendered.pdf');fs.copyFileSync(args.pdfPath,file);
  const imagePaths=[],renders=[];for(let i=0;i<2;i++){const p=path.join(qa,'page-'+i+'.png'),bytes=Buffer.from('synthetic-raster-'+i);fs.writeFileSync(p,bytes);imagePaths.push(p);renders.push({sha256:hash(bytes),size_bytes:bytes.length,width:794,height:1123});}
  const manifest=path.join(qa,'manifest.json'),bytes=Buffer.from(JSON.stringify({page_count:2,renders}));fs.writeFileSync(manifest,bytes);
  return {pdf_path:file,pdf_sha256:args.pdfSha256,pdf_size_bytes:fs.statSync(file).size,hwpx_sha256:args.hwpxSha256,visual_review_required:true,page_count:2,page_count_basis:'observed',image_paths:imagePaths,renders,render_manifest_path:manifest,render_manifest_sha256:hash(bytes)};
}}});
const {loadBinding}=await import(new URL('claude_acp_policy.mjs',sourceRoot));const {callWorkspaceTool}=await import(new URL('claude_acp_workspace.mjs',sourceRoot));
const binding=loadBinding(bindingPath,bindingSha);callWorkspaceTool(binding,'workspace_write_text',{path:'draft.json',text:draft,purpose:'work_draft',jobRef:binding.jobRef});
const args={draft_path:'draft.json',draft_sha256:hash(Buffer.from(draft)),jobRef:binding.jobRef};
if(mode==='pdf-drift'){
  await assert.rejects(callWorkspaceTool(binding,'hwpx_build_candidate',args),/synthetic_pdf_binding_drift/);assert.equal(nativeCalls,0);assert.equal(pdfCalls,0);
  assert.deepEqual(fs.readdirSync(binding.hwpxConfiguration.author.work_root),[]);
}else if(mode==='success'){
  const result=await callWorkspaceTool(binding,'hwpx_build_candidate',args,{signal:controller.signal});assert.equal(result.state,'rendered_candidate');assert.equal(result.all_page_evidence.page_count,2);
  assert.deepEqual(await callWorkspaceTool(binding,'hwpx_build_candidate',args),result);assert.equal(nativeCalls,1);assert.equal(pdfCalls,1);
  fs.writeFileSync(result.all_page_evidence.images[1].path,'changed synthetic image');await assert.rejects(callWorkspaceTool(binding,'hwpx_build_candidate',args));
}else{
  await assert.rejects(callWorkspaceTool(binding,'hwpx_build_candidate',args,{signal:controller.signal}));
  await assert.rejects(callWorkspaceTool(binding,'hwpx_build_candidate',args),/HWPX_RECOVERY_REQUIRED/);assert.equal(nativeCalls,1);assert.equal(pdfCalls,0);
}
console.log(JSON.stringify({mode,native_calls:nativeCalls,pdf_calls:pdfCalls,claim:'mock_pipeline_only'}));
`;
for(const [mode,compact] of [['success',false],['success',true],['unknown',false],['cancel',false],['pdf-drift',false]])test(`explicit ${mode} ${compact?'compact':'full'} native/PDF mock wiring preserves idempotency and never invokes Hancom`,options,t=>{
  const f=setup(t,{native:true,compact});
  const run=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',mockProgram,new URL('../src/',import.meta.url).href,f.bindingPath,sha256(fs.readFileSync(f.bindingPath)),mode,f.draft,JSON.stringify(f.expectedText.filter(text=>text.trim().length>0))],
    {encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:65536,env:{SystemRoot:process.env.SystemRoot??'',TEMP:f.dirs.fixture,TMP:f.dirs.fixture}});
  assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),{mode,native_calls:mode==='pdf-drift'?0:1,pdf_calls:mode==='success'?1:0,claim:'mock_pipeline_only'});
});
