import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDurableToolWorkshop, commitVerifiedCandidate } from '../src/tool_workshop_durable.mjs';
import { XLSX_WORKSHOP_PROFILE } from '../src/xlsx_workshop_runner.mjs';
import { sha256 } from '../src/workshop_files.mjs';
import { syntheticPresentationPacket } from '../../../docs/architecture/workspace/examples/tool_workshop/synthetic_pptx_packet.mjs';
import { PPTX_WORKSHOP_PROFILE, validatePresentationPacket, validateTextProfile, pinPptxRunnerBinding, pptxBindingDigest, verifyPptxRunnerBinding, createPptxWorkshopRunner } from '../src/pptx_workshop_runner.mjs';
test('PPTX packet binds two editable template slides and rejects injected command fields',()=>{
  const packet=syntheticPresentationPacket('a'.repeat(64));
  assert.equal(PPTX_WORKSHOP_PROFILE.workshop_class,'presentation');
  assert.deepEqual(validatePresentationPacket(packet),packet);
  assert.throws(()=>validatePresentationPacket({...packet,command:'arbitrary'}),{code:'unexpected_fields'});
  assert.throws(()=>validatePresentationPacket({...packet,provenance:undefined}),{code:'presentation_packet_invalid'});
  assert.throws(()=>validatePresentationPacket({...packet,slides:[{title:'W'.repeat(25),body:'too wide'},packet.slides[1]]}),{code:'presentation_text_out_of_profile'});
});

function textFixture(count=4) {
  const profile={family:'workshop.approved_text',revision:'template:ko1',slides:Array.from({length:count},(_,slide)=>({textboxes:Array.from({length:4},(_,box)=>({placeholder:`{{TEXT_${slide+1}_${box+1}}}`,geometry:box===0?[72,48,1136,88]:[72,180+(box-1)*145,1136,128],font_family:'Malgun Gothic',font_size:box===0?44:32}))}))};
  const packet={...syntheticPresentationPacket('a'.repeat(64)),slides:Array.from({length:count},()=>({texts:['한국어 합성 검토','전원: 24 V ± 5%\n측정: 25 ℃','승인 조건을 유지합니다.','검토자는 최종 수락을 결정합니다.']}))};
  return {profile,packet};
}

test('approved text mapping admits 2 through 20 slides and rejects unbound layouts',()=>{
  for(const count of [2,4,20]) {
    const {profile,packet}=textFixture(count);
    assert.equal(validateTextProfile(profile),profile);
    assert.equal(validatePresentationPacket(packet,profile),packet);
  }
  for(const count of [1,21])assert.throws(()=>validateTextProfile(textFixture(count).profile),{code:'template_profile_invalid'});
  const {profile,packet}=textFixture();
  assert.throws(()=>validatePresentationPacket(packet),{code:'presentation_packet_invalid'});
  for(const mutate of [
    p=>p.slides[0].textboxes.push(p.slides[0].textboxes[0]),
    p=>p.slides[0].textboxes[1].placeholder=p.slides[0].textboxes[0].placeholder,
    p=>p.slides[0].textboxes[1].geometry=[72,60,1136,128],
    p=>p.slides[0].textboxes[1].geometry=[72,600,1136,128],
    p=>p.slides[0].textboxes[1].font_family='Unknown font',
    p=>p.slides[0].textboxes[1].font_size=12,
    p=>p.slides[0].textboxes[1].command='arbitrary'
  ]) {
    const changed=structuredClone(profile);mutate(changed);assert.throws(()=>validateTextProfile(changed));
  }
  const missing=structuredClone(packet);missing.slides[0].texts.pop();
  assert.throws(()=>validatePresentationPacket(missing,profile),{code:'presentation_packet_invalid'});
});

test('Korean approved bytes require NFC and reject controls, bidi, invisible and residual combining characters',()=>{
  const {profile,packet}=textFixture();
  for(const text of ['한글'.normalize('NFD'),'Cafe\u0301','가\u0301','가\u202e나','가\u2066나','가\u200b나','가\u00ad나','가\u2028나','가\u2029나','가\t나','가\r나','가\0나','가\ud800나','가\ue000나','😀','{{OTHER}}','   ']) {
    const changed=structuredClone(packet);changed.slides[0].texts[1]=text;
    assert.throws(()=>validatePresentationPacket(changed,profile),{code:'presentation_text_out_of_profile'},JSON.stringify(text));
  }
  assert.equal(validatePresentationPacket(packet,profile),packet);
});

test('text fit rejects long CJK/ASCII lines and excessive lines without changing the packet',()=>{
  const {profile,packet}=textFixture();
  for(const text of ['한'.repeat(40),'W'.repeat(50),'가\n나\n다','가\n\n나']) {
    const changed=structuredClone(packet);changed.slides[0].texts[1]=text;
    const before=JSON.stringify(changed);
    assert.throws(()=>validatePresentationPacket(changed,profile),{code:'presentation_text_overflow'});
    assert.equal(JSON.stringify(changed),before);
  }
});

test('PPTX custody refuses missing or excessive render counts without releasing its lease',()=>{
  const stateRoot=mkdtempSync(path.join(tmpdir(),'workshop-pptx-custody-'));
  const queue=createDurableToolWorkshop({stateRoot});
  queue.registerWorkshop({...PPTX_WORKSHOP_PROFILE,binding_digest:'b'.repeat(64)});
  queue.submitJob({job_id:'job.custody',workshop_id:'workshop.pptx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:'tool.template_pptx:v1',input_bundle_manifest_digest:'a'.repeat(64),timeout_seconds:60,max_retries:0});
  const lease=queue.acquireLease('workshop.pptx',{lease_id:'lease.custody'});
  for(const count of [0,1,21,2.5,'4'])assert.throws(()=>commitVerifiedCandidate(queue,{lease,now:()=>new Date().toISOString(),verifyAndPublish:()=>({sha256:'a'.repeat(64),size_bytes:1,format:'pptx',binding_digest:'b'.repeat(64),validator_ref:'validator.pptx_native_render:v1',artifact_ref:`artifact.sha256:${'a'.repeat(64)}`,template_sha256:'c'.repeat(64),render_manifest_digest:'d'.repeat(64),render_count:count})}),{code:'render_evidence_required'});
  assert.equal(queue.getCustodyReceipt('job.custody'),null);
  assert.equal(queue.getJob('job.custody').state,'leased');
});

const configPath=process.env.SOULFORGE_PPTX_TEST_CONFIG;
test('four-slide Korean canary produces editable native bytes, every PNG and replayable custody',{skip:!configPath},()=>{
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  const root=mkdtempSync(path.join(tmpdir(),'workshop-pptx-korean-'));
  const canary=fileURLToPath(new URL('../src/synthetic_pptx_canary.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[canary,'--output-root',root,'--artifact-root',config.artifactRoot,'--python-executable',config.pythonExecutable,'--korean-text'],{encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8192});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  const candidate=JSON.parse(readFileSync(path.join(root,'candidate-receipt.json'),'utf8'));
  assert.equal(candidate.state,'done_candidate');
  const artifact=candidate.receipt.artifact;
  assert.equal(artifact.render_count,4);
  const bytes=readFileSync(path.join(root,'outputRoot',`${artifact.sha256}.pptx`));
  assert.equal(sha256(bytes),artifact.sha256);
  const renders=JSON.parse(readFileSync(path.join(root,'outputRoot',`${artifact.render_manifest_digest}.json`),'utf8'));
  assert.equal(renders.length,4);
  for(const png of renders)assert.equal(sha256(readFileSync(path.join(root,'outputRoot',`${png.sha256}.png`))),png.sha256);
  const queue=createDurableToolWorkshop({stateRoot:path.join(root,'stateRoot'),mode:'open_existing'});
  assert.deepEqual(queue.getCustodyReceipt('job.synthetic.pptx'),candidate.receipt);
  assert.equal(readFileSync(path.join(root,'stateRoot','workshop.sqlite')).includes(Buffer.from('합성 장비 검토 개요')),false);
});
test('20-slide upper bound authors and validates 80 Korean textboxes within the bounded lease',{skip:!configPath},async()=>{
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  const root=mkdtempSync(path.join(tmpdir(),'workshop-pptx-twenty-'));
  const roots=Object.fromEntries(['stateRoot','inputRoot','workRoot','outputRoot','templateRoot'].map(key=>{const value=path.join(root,key);mkdirSync(value);return[key,value];}));
  const {profile,packet}=textFixture(20),profilePath=path.join(root,'text-profile.json'),templatePath=path.join(roots.templateRoot,'template.pptx');
  writeFileSync(profilePath,JSON.stringify(profile));
  const render=fileURLToPath(new URL('../src/pptx_render_child.mjs',import.meta.url));
  const template=spawnSync(process.execPath,[render,'template-text',config.artifactRoot,templatePath,roots.templateRoot,profilePath],{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:8192,env:{SystemRoot:process.env.SystemRoot??'',TEMP:roots.templateRoot,TMP:roots.templateRoot,HOME:roots.templateRoot,USERPROFILE:roots.templateRoot}});
  assert.equal(template.status,0,template.stderr);
  const binding=pinPptxRunnerBinding({...config,templatePath,textProfile:profile});
  packet.template_sha256=binding.template_sha256;
  const input=Buffer.from(JSON.stringify(packet)),digest=sha256(input);
  writeFileSync(path.join(roots.inputRoot,`${digest}.json`),input);
  const queue=createDurableToolWorkshop({...roots,mode:'create_new'});
  queue.registerWorkshop({...PPTX_WORKSHOP_PROFILE,binding_digest:pptxBindingDigest(binding)});
  queue.submitJob({job_id:'job.twenty',workshop_id:'workshop.pptx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:'tool.template_pptx:v1',input_bundle_manifest_digest:digest,timeout_seconds:300,max_retries:0});
  const start=performance.now();
  const result=await createPptxWorkshopRunner({...roots,queue,binding,projectRef:'project.synthetic'}).runNext();
  assert.equal(result.state,'done_candidate');
  assert.equal(result.receipt.artifact.render_count,20);
  const renders=JSON.parse(readFileSync(path.join(roots.outputRoot,`${result.receipt.artifact.render_manifest_digest}.json`),'utf8'));
  assert.equal(renders.length,20);
  for(const render of renders)assert.equal(sha256(readFileSync(path.join(roots.outputRoot,`${render.sha256}.png`))),render.sha256);
  assert(performance.now()-start<300000);
  // A held input never registers custody and does not change the approved text.
  packet.slides[0].texts[1]='한'.repeat(100);
  const oversized=Buffer.from(JSON.stringify(packet)),oversizedDigest=sha256(oversized);
  writeFileSync(path.join(roots.inputRoot,`${oversizedDigest}.json`),oversized);
  queue.submitJob({job_id:'job.overflow',workshop_id:'workshop.pptx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:'tool.template_pptx:v1',input_bundle_manifest_digest:oversizedDigest,timeout_seconds:300,max_retries:0});
  assert.equal((await createPptxWorkshopRunner({...roots,queue,binding,projectRef:'project.synthetic'}).runNext()).state,'failed_terminal');
  assert.equal(queue.getCustodyReceipt('job.overflow'),null);
});
test('real template author, independent native validator, render QA, restart and drift gates',{skip:!configPath},async()=>{
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  const binding=pinPptxRunnerBinding(config);
  const root=mkdtempSync(path.join(tmpdir(),'workshop-pptx-'));
  const roots=Object.fromEntries(['stateRoot','inputRoot','workRoot','outputRoot'].map(key=>{const value=path.join(root,key);mkdirSync(value);return[key,value];}));
  const queue=createDurableToolWorkshop(roots);
  queue.registerWorkshop({...PPTX_WORKSHOP_PROFILE,binding_digest:pptxBindingDigest(binding)});
  const packet=Buffer.from(JSON.stringify(syntheticPresentationPacket(binding.template_sha256)));
  writeFileSync(path.join(roots.inputRoot,`${sha256(packet)}.json`),packet);
  const job={job_id:'job.pptx',workshop_id:'workshop.pptx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:'tool.template_pptx:v1',input_bundle_manifest_digest:sha256(packet),timeout_seconds:180,max_retries:1};
  queue.submitJob(job);
  queue.registerWorkshop(XLSX_WORKSHOP_PROFILE);
  queue.submitJob({...job,job_id:'job.xlsx.independent',workshop_id:'workshop.xlsx',required_tool_version:'tool.project_history_xlsx:v1'});
  queue.acquireLease('workshop.xlsx',{lease_id:'lease.xlsx.independent'});
  const env={...roots,queue,binding,projectRef:'project.synthetic'};
  const result=await createPptxWorkshopRunner(env).runNext();
  assert.equal(result.state,'done_candidate');
  assert.equal(queue.getJob('job.xlsx.independent').state,'leased','the different tool keeps its independent capacity-one lease');
  assert.deepEqual(createDurableToolWorkshop({...roots,mode:'open_existing'}).getCustodyReceipt(job.job_id),result.receipt);
  const artifact=result.receipt.artifact;
  const manifest=readFileSync(path.join(roots.outputRoot,`${artifact.render_manifest_digest}.json`));
  assert.equal(sha256(manifest),artifact.render_manifest_digest);
  assert.equal(JSON.parse(manifest).length,2);
  for(const render of JSON.parse(manifest))assert.equal(sha256(readFileSync(path.join(roots.outputRoot,`${render.sha256}.png`))),render.sha256);
  assert.equal(sha256(readFileSync(path.join(roots.outputRoot,`${artifact.sha256}.pptx`))),artifact.sha256);
  assert.equal(readFileSync(path.join(roots.stateRoot,'workshop.sqlite')).includes(Buffer.from('Two approved synthetic records')),false);
  for(const overrides of [{template_sha256:'0'.repeat(64)},{python_version:'3.12.999'},{artifact_version:'0.0.0'}])assert.throws(()=>verifyPptxRunnerBinding({...binding,...overrides}),{code:'binding_drift'});
  const altered=structuredClone(binding);altered.python_files[0].sha256='0'.repeat(64);
  assert.throws(()=>verifyPptxRunnerBinding(altered),{code:'binding_drift'});
  queue.submitJob({...job,job_id:'job.cancel'});
  const running=createPptxWorkshopRunner(env).runNext();queue.cancelJob('job.cancel');
  assert.equal((await running).state,'cancelled');
  assert.equal(queue.getCustodyReceipt('job.cancel'),null);
  assert.equal(readdirSync(roots.outputRoot).filter(file=>file.endsWith('.pptx')).length,1);
  queue.submitJob({...job,job_id:'job.invalid',input_bundle_manifest_digest:'f'.repeat(64),max_retries:0});
  assert.equal((await createPptxWorkshopRunner(env).runNext()).state,'failed_terminal');
  assert.equal(queue.getCustodyReceipt('job.invalid'),null);
});
