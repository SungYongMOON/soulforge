import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createDurableToolWorkshop, commitVerifiedCandidate } from '../src/tool_workshop_durable.mjs';
import { XLSX_WORKSHOP_PROFILE, pinXlsxRunnerBinding, xlsxBindingDigest, verifyXlsxRunnerBinding, createXlsxWorkshopRunner } from '../src/xlsx_workshop_runner.mjs';
import { sha256 } from '../src/workshop_files.mjs';
import { syntheticXlsxPacket } from '../../../docs/architecture/workspace/examples/tool_workshop/synthetic_xlsx_packet.mjs';
import { authorProjectHistoryCopyXlsx, readProjectHistoryCopyXlsx } from '../../../ui-workspace/apps/dev-erp/tools/project_history_copy_xlsx.mjs';

function setup(profileOverrides={},jobOverrides={}) {
  const root=mkdtempSync(path.join(tmpdir(),'workshop-xlsx-'));
  const roots=Object.fromEntries(['stateRoot','inputRoot','workRoot','outputRoot'].map(key=>{const dir=path.join(root,key);mkdirSync(dir);return [key,dir];}));
  const queue=createDurableToolWorkshop(roots);
  const binding=pinXlsxRunnerBinding();
  queue.registerWorkshop({...XLSX_WORKSHOP_PROFILE,...profileOverrides,binding_digest:xlsxBindingDigest(binding)});
  const bytes=Buffer.from(JSON.stringify(syntheticXlsxPacket())),digest=sha256(bytes);
  writeFileSync(path.join(roots.inputRoot,`${digest}.json`),bytes);
  const job={job_id:'job.xlsx',workshop_id:'workshop.xlsx',project_ref:'project.synthetic',task_ref:'task.synthetic',work_brief_ref:'brief.synthetic',approval_ref:'approval.synthetic',priority:2,required_tool_version:binding.tool_version,input_bundle_manifest_digest:digest,timeout_seconds:30,max_retries:1,...jobOverrides};
  queue.submitJob(job);
  return {...roots,root,queue,binding,job,bytes,projectRef:'project.synthetic'};
}

test('real XLSX child author + separate readback produce hashed candidate; restart preserves exact receipt',async()=>{
  const env=setup();
  const result=await createXlsxWorkshopRunner(env).runNext();
  assert.equal(result.state,'done_candidate');
  const receipt=result.receipt;
  const bytes=readFileSync(path.join(env.outputRoot,`${receipt.artifact.sha256}.xlsx`));
  assert.equal(sha256(bytes),receipt.artifact.sha256);
  assert.equal(bytes.length,receipt.artifact.size_bytes);
  assert.deepEqual(readProjectHistoryCopyXlsx(bytes).rows,syntheticXlsxPacket().rows);
  assert.equal(receipt.claim,'workshop_output_candidate_only');
  assert.deepEqual(createDurableToolWorkshop(env).getCustodyReceipt(env.job.job_id),receipt);
  assert.equal(typeof env.queue.completeRun,'undefined');
  const stateBytes=readFileSync(path.join(env.stateRoot,'workshop.sqlite'));
  assert.equal(stateBytes.includes(Buffer.from('occurrence.synthetic.0')),false);
});

test('trusted admission rejects executable, root, source hash, version and arbitrary job command drift',()=>{
  const env=setup();
  for(const change of [{executable:'untrusted.exe'},{code_root:env.root},{node_version:'v0.0.0'},{executable_sha256:'0'.repeat(64)}]) assert.throws(()=>verifyXlsxRunnerBinding({...env.binding,...change}),{code:'binding_drift'});
  const drift=structuredClone(env.binding);drift.sources[0].sha256='0'.repeat(64);
  assert.throws(()=>createXlsxWorkshopRunner({...env,binding:drift}),{code:'binding_drift'});
  assert.throws(()=>env.queue.submitJob({...env.job,job_id:'job.arbitrary',command:'echo secret'}),{code:'unexpected_fields'});
  assert.throws(()=>createXlsxWorkshopRunner({...env,outputRoot:env.workRoot}),{code:'roots_overlap'});
  assert.equal(env.queue.getJob(env.job.job_id).state,'queued');
});

test('changed input cannot run; bounded retry ends truthfully with zero custody',async()=>{
  const env=setup();
  writeFileSync(path.join(env.inputRoot,`${env.job.input_bundle_manifest_digest}.json`),'{}');
  const runner=createXlsxWorkshopRunner(env);
  assert.equal((await runner.runNext()).state,'queued');
  assert.equal((await runner.runNext()).state,'failed_terminal');
  assert.equal(env.queue.getJob(env.job.job_id).failure_code,'input_invalid_retries_exhausted');
  assert.equal(env.queue.getCustodyReceipt(env.job.job_id),null);
  assert.equal(readdirSync(env.outputRoot).length,0);
});

test('running cancellation retains lease until observed close; stale zombie cannot enter publication callback',()=>{
  const env=setup();
  const now=new Date().toISOString();
  const lease=env.queue.acquireLease('workshop.xlsx',{lease_id:'lease.cancel',now});
  env.queue.cancelJob(env.job.job_id);
  assert.equal(env.queue.getJob(env.job.job_id).state,'cancel_requested');
  assert.equal(env.queue.acquireLease('workshop.xlsx',{lease_id:'lease.other',now}),null);
  let published=false;
  assert.throws(()=>commitVerifiedCandidate(env.queue,{lease,now:()=>now,verifyAndPublish:()=>{published=true;}}),{code:'job_cancel_requested'});
  assert.equal(published,false);
  env.queue.finishCancellation(lease);
  assert.equal(env.queue.getJob(env.job.job_id).state,'cancelled');
  assert.throws(()=>commitVerifiedCandidate(env.queue,{lease,now:()=>now,verifyAndPublish:()=>{published=true;}}),{code:'fence_stale'});
  assert.equal(published,false);
});

test('cancel a real running child, observe closure, then retain no candidate',async()=>{
  const env=setup();
  const running=createXlsxWorkshopRunner(env).runNext();
  env.queue.cancelJob(env.job.job_id);
  assert.equal(env.queue.getJob(env.job.job_id).state,'cancel_requested');
  const result=await running;
  assert.equal(result.state,'cancelled');
  assert.equal(env.queue.getJob(env.job.job_id).state,'cancelled');
  assert.equal(env.queue.getCustodyReceipt(env.job.job_id),null);
  assert.equal(readdirSync(env.outputRoot).length,0);
});

test('process crash inside candidate transaction rolls back, preserves lease, and zombie is fenced after restart',async()=>{
  const env=setup();
  const source=new URL('../src/tool_workshop_durable.mjs',import.meta.url).href;
  const code=`import {createDurableToolWorkshop,commitVerifiedCandidate} from ${JSON.stringify(source)};const q=createDurableToolWorkshop({stateRoot:process.argv[1]});const lease=q.acquireLease('workshop.xlsx',{now:'2026-09-07T00:00:00Z',lease_id:'lease.crashed'});commitVerifiedCandidate(q,{lease,now:()=> '2026-09-07T00:00:01Z',verifyAndPublish:()=>{process.exit(77);}});`;
  const exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,env.stateRoot],{windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('close',resolve);});
  assert.equal(exitCode,77);
  const queue=createDurableToolWorkshop(env);
  assert.equal(queue.getJob(env.job.job_id).state,'leased');
  assert.equal(queue.getCustodyReceipt(env.job.job_id),null);
  queue.submitJob({...env.job,job_id:'job.next'});
  const next=queue.acquireLease('workshop.xlsx',{now:'2026-09-07T00:01:00Z',lease_id:'lease.next'});
  assert.equal(next.fencing_token,2);
  let published=false;
  assert.throws(()=>commitVerifiedCandidate(queue,{lease:{lease_id:'lease.crashed',fencing_token:1,job_id:env.job.job_id},now:()=> '2026-09-07T00:01:00Z',verifyAndPublish:()=>{published=true;}}),{code:'fence_stale'});
  assert.equal(published,false);
});

test('an existing corrupt content-addressed destination cannot gain a custody receipt',async()=>{
  const env=setup();
  const expected=authorProjectHistoryCopyXlsx(syntheticXlsxPacket());
  writeFileSync(path.join(env.outputRoot,`${sha256(expected)}.xlsx`),'invalid workbook');
  const result=await createXlsxWorkshopRunner(env).runNext();
  assert.equal(result.state,'queued');
  assert.equal(env.queue.getCustodyReceipt(env.job.job_id),null);
  assert.equal(env.queue.getJob(env.job.job_id).retries_remaining,0);
});

test('input hardlinks and root junctions cannot cross an execution boundary',async()=>{
  const env=setup();
  linkSync(path.join(env.inputRoot,`${env.job.input_bundle_manifest_digest}.json`),path.join(env.root,'linked-input.json'));
  const result=await createXlsxWorkshopRunner(env).runNext();
  assert.equal(result.state,'queued');
  assert.equal(env.queue.getCustodyReceipt(env.job.job_id),null);
  const alias=path.join(env.root,'alias');
  symlinkSync(env.outputRoot,alias,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>createXlsxWorkshopRunner({...env,outputRoot:alias}),{code:'path_link_forbidden'});
});

test('native validator rejects corrupt actual workbook bytes even when extension remains xlsx',()=>{
  const bytes=authorProjectHistoryCopyXlsx(syntheticXlsxPacket());
  const tampered=Buffer.from(bytes);
  const offset=tampered.indexOf(Buffer.from('>mail<'));
  assert(offset>0);tampered[offset+1]=110;
  assert.throws(()=>readProjectHistoryCopyXlsx(tampered),{code:'xlsx_zip_crc_mismatch'});
});

test('a project-bound worker cannot lease a different project or consume its retry',async()=>{
  const env=setup();
  const result=await createXlsxWorkshopRunner({...env,projectRef:'project.other'}).runNext();
  assert.equal(result,null);
  assert.equal(env.queue.getJob(env.job.job_id).state,'queued');
  assert.equal(env.queue.getJob(env.job.job_id).retries_remaining,1);
  assert.equal(readdirSync(env.workRoot).length,0);
  assert.equal(readdirSync(env.outputRoot).length,0);
  assert.equal(env.queue.getCustodyReceipt(env.job.job_id),null);
});

test('matching code binding cannot substitute an unrelated resource/class/tool profile',()=>{
  for(const override of [{resource_id:'resource.unrelated'}, {workshop_class:'archive'}, {tool_versions:['tool.project_history_xlsx:v1','tool.extra:v1']}]) {
    const env=setup(override);
    if(override.resource_id) {
      env.queue.registerWorkshop({...XLSX_WORKSHOP_PROFILE,workshop_id:'workshop.other'});
      env.queue.submitJob({...env.job,job_id:'job.other',workshop_id:'workshop.other'});
      env.queue.acquireLease('workshop.other',{now:new Date().toISOString(),lease_id:'lease.actual_resource'});
    }
    assert.throws(()=>createXlsxWorkshopRunner(env),{code:'workshop_profile_drift'});
    assert.equal(env.queue.getJob(env.job.job_id).state,'queued');
    assert.equal(env.queue.getCustodyReceipt(env.job.job_id),null);
  }
});

test('SQLite lock waiting does not spend the newly acquired lease timeout',async()=>{
  const env=setup({}, {timeout_seconds:1});
  const runner=createXlsxWorkshopRunner(env);
  const code="import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN IMMEDIATE');console.log('locked');setTimeout(()=>{db.exec('COMMIT');db.close();},1500);";
  const child=spawn(process.execPath,['--input-type=module','-e',code,path.join(env.stateRoot,'workshop.sqlite')],{windowsHide:true,stdio:['ignore','pipe','ignore']});
  const closed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
  const started=Date.now();
  const result=await runner.runNext();
  assert.equal(await closed,0);
  assert(Date.now()-started>=1000,'the child really held the database lock');
  assert.notEqual(result.state,'fenced');
  assert.notEqual(env.queue.getJob(env.job.job_id).state,'leased');
  // A slow host may genuinely time out after acquiring: that consumes a retry.
  if(result.state!=='done_candidate') assert.equal(env.queue.getJob(env.job.job_id).retries_remaining,0);
});
