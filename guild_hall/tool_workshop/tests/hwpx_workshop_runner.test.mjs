import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createDurableToolWorkshop, commitVerifiedCandidate } from '../src/tool_workshop_durable.mjs';
import { HWPX_WORKSHOP_PROFILE, pinHwpxRunnerBinding, verifyHwpxRunnerBinding, hwpxBindingDigest, createHwpxWorkshopRunner, validateHwpxPacket } from '../src/hwpx_workshop_runner.mjs';
import { sha256 } from '../src/workshop_files.mjs';
import { syntheticHwpxPacket } from '../../../docs/architecture/workspace/examples/tool_workshop/synthetic_hwpx_packet.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const python=process.env.SOULFORGE_HWPX_TEST_PYTHON;
const fixture=path.join(ROOT,'docs/architecture/workspace/examples/tool_workshop/synthetic_hwpx_fixture.py');
const job=(digest,id='job.hwpx')=>({job_id:id,workshop_id:'workshop.hwpx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:'tool.template_hwpx:v1',input_bundle_manifest_digest:digest,timeout_seconds:60,max_retries:0});
function setup({entryMetadata}={}){
  const root=mkdtempSync(path.join(tmpdir(),'workshop-hwpx-'));
  const roots=Object.fromEntries(['stateRoot','inputRoot','workRoot','outputRoot','templateRoot'].map(key=>{const value=path.join(root,key);mkdirSync(value);return [key,value];}));
  const templatePath=path.join(roots.templateRoot,'template.hwpx');
  const generated=spawnSync(python,['-I','-S','-B',fixture,templatePath],{encoding:'utf8',windowsHide:true});
  assert.equal(generated.status,0,generated.stderr);
  if(entryMetadata) {
    const mutate=[
      'import sys,zipfile',
      'file,mode=sys.argv[1:]',
      'with zipfile.ZipFile(file) as archive: entries=[(entry,archive.read(entry.filename)) for entry in archive.infolist()]',
      'with zipfile.ZipFile(file,"w") as archive:',
      ' for entry,data in entries:',
      '  if entry.filename=="settings.xml" and mode=="extra": entry.extra=bytes.fromhex("feca060048494444454e")',
      '  if entry.filename=="settings.xml" and mode=="comment": entry.comment=b"HIDDEN"',
      '  archive.writestr(entry,data)',
      ' if mode=="archive-comment": archive.comment=b"HIDDEN"',
      'with zipfile.ZipFile(file) as archive:',
      ' value=archive.comment if mode=="archive-comment" else getattr(archive.getinfo("settings.xml"),mode)',
      ' assert len(value)==(10 if mode=="extra" else 6)',
    ].join('\n');
    const changed=spawnSync(python,['-I','-S','-B','-c',mutate,templatePath,entryMetadata],{encoding:'utf8',windowsHide:true});
    assert.equal(changed.status,0,changed.stderr);
  }
  const binding=pinHwpxRunnerBinding({pythonExecutable:python,templatePath,templateApprovalRef:'approval.synthetic_template',templateProvenance:'synthetic_fixture'});
  const queue=createDurableToolWorkshop({...roots,mode:'create_new'});
  queue.registerWorkshop({...HWPX_WORKSHOP_PROFILE,binding_digest:hwpxBindingDigest(binding)});
  const packet=syntheticHwpxPacket(binding.template_sha256),bytes=Buffer.from(JSON.stringify(packet)),digest=sha256(bytes);
  writeFileSync(path.join(roots.inputRoot,`${digest}.json`),bytes);
  return {root,roots,queue,binding,packet,digest,env:{...roots,queue,binding,projectRef:'project.synthetic'}};
}

test('fixed HWPX packet rejects rewriting, extra command fields and unsupported Unicode',()=>{
  const packet=syntheticHwpxPacket('a'.repeat(64));
  assert.equal(validateHwpxPacket(packet),packet);
  for(const body of ['가'.repeat(21),'가\n나','가\u202e나','가\u0301','가\u2028나','{{BODY}}','   ','한'.normalize('NFD')])assert.throws(()=>validateHwpxPacket({...packet,body}),{code:'hwpx_text_out_of_profile'});
  assert.throws(()=>validateHwpxPacket({...packet,command:'arbitrary'}),{code:'unexpected_fields'});
  assert.throws(()=>validateHwpxPacket({...packet,approval_ref:undefined}),{code:'hwpx_packet_invalid'});
});

test('HWPX submit, exclusive lease, actual structural candidate and restart preserve one receipt',{skip:!python},async()=>{
  const f=setup();f.queue.submitJob(job(f.digest));
  const pending=createHwpxWorkshopRunner(f.env).runNext();
  assert.equal(f.queue.getJob('job.hwpx').state,'leased');
  assert.equal(await createHwpxWorkshopRunner(f.env).runNext(),null);
  const result=await pending;assert.equal(result.state,'done_candidate');
  const artifact=result.receipt.artifact;
  assert.equal(artifact.format,'hwpx');assert.equal(artifact.validator_ref,'validator.hwpx_structural_readback:v1');
  assert.equal(sha256(readFileSync(path.join(f.roots.outputRoot,`${artifact.sha256}.hwpx`))),artifact.sha256);
  assert.deepEqual(createDurableToolWorkshop({...f.roots,mode:'open_existing'}).getCustodyReceipt('job.hwpx'),result.receipt);
  assert.equal(readFileSync(path.join(f.roots.stateRoot,'workshop.sqlite')).includes(Buffer.from(f.packet.body)),false);
  const attempt=path.join(f.roots.workRoot,readdirSync(f.roots.workRoot)[0]);
  const native=spawnSync(python,['-I','-S','-B',path.join(ROOT,'guild_hall/tool_workshop/src/hwpx_tool_child.py'),'validate',path.join(attempt,'input.json'),path.join(attempt,'template.hwpx'),path.join(attempt,'candidate.hwpx')],{encoding:'utf8',windowsHide:true});
  assert.equal(native.status,0,native.stderr);assert.equal(JSON.parse(native.stdout).validation_level,'structural_only_no_render');
  if(process.env.SOULFORGE_HWPX_EVIDENCE_DIR)writeFileSync(path.join(process.env.SOULFORGE_HWPX_EVIDENCE_DIR,'hwpx-canary.json'),JSON.stringify({root:f.root,receipt:result.receipt,native:JSON.parse(native.stdout),runner_binding:f.binding},null,2),{flag:'wx'});
});

test('HWPX binding, project and cancellation failures never register candidates',{skip:!python},async()=>{
  const f=setup();
  for(const overrides of [{template_sha256:'0'.repeat(64)},{python_version:'3.12.999'},{tool_version:'tool.unknown:v1'}])assert.throws(()=>verifyHwpxRunnerBinding({...f.binding,...overrides}),{code:'binding_drift'});
  f.queue.submitJob({...job(f.digest,'job.foreign'),project_ref:'project.foreign'});
  assert.equal(await createHwpxWorkshopRunner(f.env).runNext(),null);
  f.queue.submitJob(job(f.digest,'job.cancel'));
  const pending=createHwpxWorkshopRunner(f.env).runNext();f.queue.cancelJob('job.cancel');
  assert.equal((await pending).state,'cancelled');assert.equal(f.queue.getCustodyReceipt('job.cancel'),null);
  const packet={...f.packet,body:'가'.repeat(21)},bytes=Buffer.from(JSON.stringify(packet)),digest=sha256(bytes);
  writeFileSync(path.join(f.roots.inputRoot,`${digest}.json`),bytes);
  f.queue.submitJob(job(digest,'job.overflow'));
  assert.equal((await createHwpxWorkshopRunner(f.env).runNext()).state,'failed_terminal');assert.equal(f.queue.getCustodyReceipt('job.overflow'),null);
  assert.equal(readdirSync(f.roots.outputRoot).length,0);
});

test('expired HWPX lease and stale takeover never enter candidate publication',()=>{
  const stateRoot=mkdtempSync(path.join(tmpdir(),'workshop-hwpx-expiry-')),queue=createDurableToolWorkshop({stateRoot});
  queue.registerWorkshop({...HWPX_WORKSHOP_PROFILE,binding_digest:'b'.repeat(64)});queue.submitJob(job('a'.repeat(64)));
  const lease=queue.acquireLease('workshop.hwpx',{lease_id:'lease.old',now:'2026-01-01T00:00:00Z'});let published=false;
  const candidate=()=>commitVerifiedCandidate(queue,{lease,now:()=>new Date().toISOString(),verifyAndPublish:()=>{published=true;throw Error('must not publish');}});
  assert.throws(candidate,{code:'lease_expired'});assert.equal(published,false);
  queue.submitJob(job('a'.repeat(64),'job.new'));queue.acquireLease('workshop.hwpx',{lease_id:'lease.new'});
  assert.throws(candidate,{code:'fence_stale'});assert.equal(queue.getCustodyReceipt('job.hwpx'),null);
});

for(const entryMetadata of ['extra','comment','archive-comment'])test(`HWPX ZIP ${entryMetadata} metadata never creates candidate bytes or custody`,{skip:!python},async()=>{
  // Deliberately pin this malformed fixture: the profile gate must reject the
  // metadata itself, rather than merely noticing post-binding hash drift.
  const f=setup({entryMetadata});f.queue.submitJob(job(f.digest));
  assert.equal((await createHwpxWorkshopRunner(f.env).runNext()).state,'failed_terminal');
  assert.equal(f.queue.getCustodyReceipt('job.hwpx'),null);
  assert.equal(readdirSync(f.roots.outputRoot).length,0);
  for(const attempt of readdirSync(f.roots.workRoot))assert.equal(readdirSync(path.join(f.roots.workRoot,attempt)).includes('candidate.hwpx'),false);
  assert.equal(createDurableToolWorkshop({...f.roots,mode:'open_existing'}).getCustodyReceipt('job.hwpx'),null);
});
