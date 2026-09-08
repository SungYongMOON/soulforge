import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {openHwpxWorkshopJobs} from '../src/hwpx_workshop_jobs.mjs';
import {pinHwpxReferenceBinding} from '../src/hwpx_reference_runner.mjs';
import {loadBinding,HWPX_SOURCE_FILES,sha256} from '../src/claude_acp_policy.mjs';
import {callWorkspaceTool} from '../src/claude_acp_workspace.mjs';
import {createDurableToolWorkshop} from '../src/tool_workshop_durable.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const python=process.env.SOULFORGE_HWPX_TEST_PYTHON;
const available=Boolean(python)&&fs.existsSync(python);
const put=(file,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));fs.writeFileSync(file,bytes,{flag:'wx'});return {path:file,sha256:sha256(bytes)};};
function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sf-hwpx-jobs-'));
  const work=path.join(root,'work'),common=path.join(root,'common'),incoming=path.join(common,'incoming'),catalog=path.join(common,'catalog');
  for(const folder of [path.join(work,'JOBS'),incoming,catalog])fs.mkdirSync(folder,{recursive:true});
  const instruction=put(path.join(catalog,'instructions.md'),Buffer.from('Synthetic fixture only. No model is called. Use the current job binding.'));
  const entries=[];
  for(const form of ['report','minutes']) {
    const base=path.join(catalog,form);fs.mkdirSync(base);
    const reference=path.join(base,'reference.hwpx');
    const built=spawnSync(python,['-I','-B',path.join(ROOT,'.registry/skills/hwpx_document/codex/scripts/build_hwpx.py'),'--template',form,'--output',reference],{encoding:'utf8',windowsHide:true,timeout:10000});
    assert.equal(built.status,0,built.stderr);
    const referenceBinding=pinHwpxReferenceBinding({pythonExecutable:python,templatePath:reference,templateApprovalRef:'approval.synthetic_template',templateProvenance:'synthetic_fixture',allowedParts:['Contents/section0.xml']});
    const directories=Object.fromEntries(['input','work','output','queue'].map(name=>{const value=path.join(base,name);fs.mkdirSync(value);return [name,value];}));
    const jobRef=`job.seed.${form}`,jobRoot=path.join(work,'JOBS',jobRef);fs.mkdirSync(jobRoot);
    const author={version:1,project_ref:'project.synthetic',job_ref:jobRef,source_ref:'source.synthetic',revision:'revision.seed',approval_ref:'approval.synthetic_seed',provenance:'synthetic_fixture',input_root:directories.input,work_root:directories.work,output_root:directories.output,queue_root:directories.queue,
      reference_binding:put(path.join(base,'reference.json'),referenceBinding),pack_sha256:sha256(fs.readFileSync(path.join(ROOT,'.registry/skills/hwpx_document/codex/scripts/office/pack.py')))};
    const seed={version:2,botRef:'bot.synthetic',roleRef:'role.hwpx',projectRef:'project.synthetic',jobRef,inputFiles:[],workRoot:work,jobRoot,model:'claude-synthetic',cliPath:process.execPath,cliSha256:sha256(fs.readFileSync(process.execPath)),nodeSha256:sha256(fs.readFileSync(process.execPath)),
      instructions:{ref:'instructions.synthetic',...instruction},skills:[],tools:['workspace_list','workspace_read_text','workspace_write_text','hwpx_build_candidate'],sourceHashes:Object.fromEntries(HWPX_SOURCE_FILES.map(file=>[file,sha256(fs.readFileSync(path.join(ROOT,file)))])),expiresAt:Date.now()+180000,
      hwpx:{author:put(path.join(base,'author.json'),author),native:null,pdf:null}};
    entries.push({reference_ref:`reference.${form}`,seed_binding:put(path.join(base,'seed.json'),seed)});
  }
  const config={version:1,work_root:work,common_root:common,observed_input_root:incoming,model:'claude-synthetic',bot_ref:'bot.synthetic',role_ref:'role.hwpx',allow_new_jobs:true,issuance_approval_ref:'approval.synthetic_standing',issuance_expires_at:Date.now()+120000,job_lifetime_ms:90000,reference_catalog:entries};
  const pin=put(path.join(catalog,'manager.json'),config);
  return {root,work,common,incoming,config,options:{configPath:pin.path,configSha256:pin.sha256}};
}
function observe(manager,f,documentRef,name='brief') {
  const bytes=Buffer.from(`Synthetic ${name}: prepare a document; no real model or external facts.`),relative=`${name}.txt`;
  fs.writeFileSync(path.join(f.incoming,relative),bytes,{flag:'wx'});
  const inputRef=`input.${name}`;
  const recorded=manager.registerObservedInput({documentRef,inputRef,relativePath:relative,sha256:sha256(bytes)});
  assert.equal(recorded.admission,'observed_local_bytes_only');assert.equal(recorded.attachment_admission_verified,false);
  return inputRef;
}
async function actualCandidate(manager,job,variant) {
  const started=manager.startJob(job.job_ref),binding=loadBinding(job.binding.path,job.binding.sha256);
  const reference=JSON.parse(fs.readFileSync(binding.hwpxConfiguration.author.reference_binding.path,'utf8'));
  const program=String.raw`import sys,json,zipfile
from lxml import etree
with zipfile.ZipFile(sys.argv[1]) as z: xml=z.read('Contents/section0.xml')
root=etree.fromstring(xml);ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
nodes=list(root.iter(ns+'t'));first=next(n for n in nodes if n.text)
first.text=('합성 보고서 '+sys.argv[2]) if len(first.text)>=9 else ('합성회의'+sys.argv[2])
print(json.dumps({'sections':[{'part':'Contents/section0.xml','xml':etree.tostring(root,encoding='unicode')}],'expected_text':[''.join(n.itertext()) for n in nodes]},ensure_ascii=True))`;
  const drafted=spawnSync(python,['-I','-B','-c',program,reference.template_path,variant],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(drafted.status,0,drafted.stderr);
  const draft=drafted.stdout.trim();
  const written=callWorkspaceTool(binding,'workspace_write_text',{path:'draft.json',text:draft,purpose:'work_draft',jobRef:job.job_ref});
  const built=await callWorkspaceTool(binding,'hwpx_build_candidate',{draft_path:'draft.json',draft_sha256:written.sha256,jobRef:job.job_ref});
  assert.equal(built.state,'structural_candidate');
  return {...started,binding,built};
}

test('document revisions, approved template queues and exact result recovery persist without restarting a builder',{
  skip:available?false:'SOULFORGE_HWPX_TEST_PYTHON is required for the actual v2 structural fixture',timeout:90000,
},async t=>{
  const f=setup();let manager=openHwpxWorkshopJobs({...f.options,mode:'create_new'}),complete=false;
  t.after(()=>{manager?.close();if(complete){const root=fs.realpathSync(f.root);assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('sf-hwpx-jobs-'));fs.rmSync(root,{recursive:true,force:true});}else t.diagnostic(`Owned failure fixture retained: ${f.root}`);});
  const doc1=manager.createDocument({referenceRef:'reference.report',title:'합성 문서 하나'}),input1=observe(manager,f,doc1.document_ref,'one');
  const first=manager.issueRevision({documentRef:doc1.document_ref,inputRefs:[input1]});
  assert.equal(first.revision,1);assert.equal(first.state,'READY');
  const firstRaw=JSON.parse(fs.readFileSync(first.binding.path,'utf8'));
  assert.equal(firstRaw.model,f.config.model);assert.ok(firstRaw.expiresAt<=f.config.issuance_expires_at);
  const seed=JSON.parse(fs.readFileSync(f.config.reference_catalog[0].seed_binding.path,'utf8'));assert.ok(firstRaw.expiresAt<=seed.expiresAt);
  const firstRun=await actualCandidate(manager,first,'A');
  const queue=createDurableToolWorkshop({stateRoot:firstRun.binding.hwpxConfiguration.author.queue_root,mode:'open_existing'}),events=queue.eventLog();
  const original=fs.readFileSync(firstRun.built.hwpx.path),queueBytes=fs.readFileSync(path.join(firstRun.binding.hwpxConfiguration.author.queue_root,'workshop.sqlite'));
  const marker=path.join(firstRun.binding.hwpxConfiguration.author.queue_root,'workshop.initialized'),preservedMarker=marker+'.preserved';
  for(const target of [marker,preservedMarker])assert.ok(path.relative(f.root,target)&&!path.relative(f.root,target).startsWith('..'));
  fs.renameSync(marker,preservedMarker);
  assert.throws(()=>manager.collectResult(firstRun.executionToken),{code:'jobs_custody_required'});assert.equal(fs.existsSync(marker),false,'result lookup must not repair a queue marker');
  fs.renameSync(preservedMarker,marker);
  const recovered=manager.collectResult(firstRun.executionToken);
  assert.equal(recovered.accepted,false);assert.equal(recovered.official_done,false);assert.equal(recovered.render_required,true);
  assert.deepEqual(fs.readFileSync(recovered.artifacts[0].path),original);assert.deepEqual(queue.eventLog(),events);assert.deepEqual(fs.readFileSync(path.join(firstRun.binding.hwpxConfiguration.author.queue_root,'workshop.sqlite')),queueBytes);
  assert.throws(()=>manager.closeJob(JSON.parse(JSON.stringify(firstRun.executionToken)),{directChildClosed:true,outcome:'completed'}),{code:'jobs_observer_token_required'});
  assert.throws(()=>manager.closeJob(firstRun.executionToken,{directChildClosed:false,outcome:'completed'}),{code:'jobs_child_closure_required'});
  manager.closeJob(firstRun.executionToken,{directChildClosed:true,outcome:'completed'});
  const revision=manager.issueRevision({documentRef:doc1.document_ref,inputRefs:[input1]});assert.equal(revision.revision,2);assert.notEqual(revision.job_ref,first.job_ref);assert.notEqual(revision.binding.path,first.binding.path);
  const revisionRun=await actualCandidate(manager,revision,'B');manager.collectResult(revisionRun.executionToken);manager.closeJob(revisionRun.executionToken,{directChildClosed:true,outcome:'completed'});
  assert.equal(firstRun.binding.hwpxConfiguration.author.queue_root,revisionRun.binding.hwpxConfiguration.author.queue_root);
  assert.deepEqual(fs.readFileSync(firstRun.built.hwpx.path),original,'a later revision never overwrites the prior document');
  const doc2=manager.createDocument({referenceRef:'reference.minutes',title:'다른 양식 문서 둘'}),input2=observe(manager,f,doc2.document_ref,'two');
  const second=manager.issueRevision({documentRef:doc2.document_ref,inputRefs:[input2]}),secondRun=await actualCandidate(manager,second,'C');
  assert.notEqual(secondRun.binding.hwpxConfiguration.author.queue_root,firstRun.binding.hwpxConfiguration.author.queue_root,'different reference bindings use isolated queues');
  manager.collectResult(secondRun.executionToken);manager.closeJob(secondRun.executionToken,{directChildClosed:true,outcome:'completed'});
  manager.close();manager=openHwpxWorkshopJobs(f.options);
  assert.equal(manager.listDocuments().length,2);assert.equal(manager.getDocument(doc1.document_ref).jobs.length,2);
  assert.deepEqual(manager.getResult(first.job_ref),recovered);

  const cancelled=manager.issueRevision({documentRef:doc2.document_ref,inputRefs:[input2]});manager.cancelJob(cancelled.job_ref);assert.equal(manager.getJob(cancelled.job_ref).state,'CANCELLED');assert.throws(()=>manager.startJob(cancelled.job_ref),{code:'jobs_start_forbidden'});
  const unknown=manager.issueRevision({documentRef:doc2.document_ref,inputRefs:[input2]}),live=manager.startJob(unknown.job_ref);manager.cancelJob(unknown.job_ref);
  assert.equal(manager.getJob(unknown.job_ref).state,'CANCEL_REQUESTED');assert.throws(()=>manager.issueRevision({documentRef:doc2.document_ref,inputRefs:[input2]}),{code:'jobs_previous_unclosed'});
  manager.close();manager=openHwpxWorkshopJobs(f.options);
  assert.throws(()=>manager.startJob(unknown.job_ref),{code:'jobs_start_forbidden'});assert.throws(()=>manager.closeJob(live.executionToken,{directChildClosed:true,outcome:'cancelled'}),{code:'jobs_observer_token_required'});
  assert.equal(manager.getJob(unknown.job_ref).recovery_required,true);

  assert.throws(()=>manager.createDocument({referenceRef:'reference.unapproved',title:'no'}),{code:'jobs_reference_unapproved'});
  assert.throws(()=>manager.issueRevision({documentRef:doc1.document_ref,inputRefs:[input1],model:'unapproved'}));
  assert.throws(()=>manager.registerObservedInput({documentRef:doc1.document_ref,inputRef:'input.escape',relativePath:'../outside.txt',sha256:'0'.repeat(64)}),{code:'jobs_observation_invalid'});
  const binary=Buffer.from('synthetic observed binary, not admitted');fs.writeFileSync(path.join(f.incoming,'attachment.hwpx'),binary,{flag:'wx'});
  const observed=manager.registerObservedInput({documentRef:doc1.document_ref,inputRef:'input.binary',relativePath:'attachment.hwpx',sha256:sha256(binary)});
  assert.equal(observed.model_text_eligible,false);assert.equal(observed.attachment_admission_verified,false);assert.throws(()=>manager.issueRevision({documentRef:doc1.document_ref,inputRefs:['input.binary']}),{code:'jobs_input_not_admitted'});
  assert.throws(()=>manager.issueRevision({documentRef:doc1.document_ref,inputRefs:[input2]}),{code:'jobs_input_not_admitted'});
  fs.writeFileSync(recovered.artifacts[0].path,'synthetic corrupted sealed copy');assert.throws(()=>manager.getResult(first.job_ref),{code:'jobs_pin_changed'});
  assert.deepEqual(fs.readFileSync(firstRun.built.hwpx.path),original);
  complete=true;
});
