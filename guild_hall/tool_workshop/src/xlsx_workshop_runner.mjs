import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitVerifiedCandidate } from './tool_workshop_durable.mjs';
import { boundedRead, directPath, disjointRoots, exactKeys, reject, sha256 } from './workshop_files.mjs';
import { readProjectHistoryCopyXlsx, validateProjectHistoryCopyXlsxInput, verifyProjectHistoryCopyXlsxReadback } from '../../../ui-workspace/apps/dev-erp/tools/project_history_copy_xlsx.mjs';

export const XLSX_WORKSHOP_PROFILE = Object.freeze({workshop_id:'workshop.xlsx',workshop_class:'data_excel',resource_id:'resource.xlsx_node',tool_versions:['tool.project_history_xlsx:v1']});
const CODE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const CHILD='guild_hall/tool_workshop/src/xlsx_tool_child.mjs';
const SOURCES=Object.freeze([CHILD,'ui-workspace/apps/dev-erp/tools/project_history_copy_xlsx.mjs','guild_hall/shared/project_history_envelope.mjs','guild_hall/tool_workshop/src/xlsx_workshop_runner.mjs','guild_hall/tool_workshop/src/tool_workshop_durable.mjs','guild_hall/tool_workshop/src/tool_workshop_core.mjs','guild_hall/tool_workshop/src/workshop_files.mjs']);
const INPUT_MAX=1024*1024, OUTPUT_MAX=8*1024*1024;

// Bootstrap is a trusted operator action. Persist its returned object in local
// configuration and reuse it; never re-pin automatically when admission fails.
export function pinXlsxRunnerBinding() {
  const binding={tool_version:XLSX_WORKSHOP_PROFILE.tool_versions[0],code_root:directPath(CODE_ROOT,true),executable:directPath(process.execPath),node_version:process.version,executable_sha256:sha256(readFileSync(process.execPath)),sources:SOURCES.map(relative_path=>({relative_path,sha256:sha256(boundedRead(path.join(CODE_ROOT,relative_path),4*1024*1024))}))};
  return structuredClone(binding);
}
export function xlsxBindingDigest(binding) { return sha256(JSON.stringify(binding)); }
export function verifyXlsxRunnerBinding(binding) {
  exactKeys(binding,['tool_version','code_root','executable','node_version','executable_sha256','sources']);
  if (binding.code_root!==CODE_ROOT || binding.executable!==process.execPath || binding.node_version!==process.version || binding.tool_version!==XLSX_WORKSHOP_PROFILE.tool_versions[0] || !Array.isArray(binding.sources) || binding.sources.length!==SOURCES.length) reject('binding_drift');
  directPath(binding.executable);directPath(binding.code_root,true);
  if (sha256(readFileSync(binding.executable))!==binding.executable_sha256) reject('binding_drift');
  for(let index=0;index<SOURCES.length;index++) {
    const entry=binding.sources[index];exactKeys(entry,['relative_path','sha256']);
    if(entry.relative_path!==SOURCES[index] || sha256(boundedRead(path.join(binding.code_root,entry.relative_path),4*1024*1024))!==entry.sha256) reject('binding_drift');
  }
  return xlsxBindingDigest(binding);
}

function childRun({binding,runRoot,mode,input,output,lease,queue,deadline}) {
  return new Promise((resolve,rejectPromise)=>{
    const remaining=Math.min(Date.parse(lease.expires_at)-Date.now(),deadline-performance.now());
    if(remaining<=0) return rejectPromise(Object.assign(new Error('runner_timeout'),{code:'runner_timeout'}));
    const env={TEMP:runRoot,TMP:runRoot,HOME:runRoot,USERPROFILE:runRoot};
    if(process.platform==='win32') env.SystemRoot=process.env.SystemRoot;
    const child=spawn(binding.executable,['--disable-warning=ExperimentalWarning',path.join(runRoot,CHILD),mode,input,output],{cwd:runRoot,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',count=0,stopCode=null;
    const stop=code=>{if(!stopCode){stopCode=code;child.kill();}};
    const timeout=setTimeout(()=>stop('runner_timeout'),remaining);
    const poll=setInterval(()=>{
      try {queue.assertCurrentLease(lease,new Date().toISOString());}
      catch(error){stop(error.code==='job_cancel_requested'?'cancelled':error.code==='lease_expired'?'runner_timeout':'fence_stale');}
    },50);
    child.stdout.on('data',chunk=>{count+=chunk.length;if(count>4096)stop('runner_failed');else stdout+=chunk;});
    child.stderr.on('data',chunk=>{count+=chunk.length;if(count>4096)stop('runner_failed');});
    child.on('error',()=>{stopCode='runner_failed';});
    // 'close' means our exact child and its pipe handles are observed closed.
    child.on('close',code=>{
      clearTimeout(timeout);clearInterval(poll);
      if(stopCode || code!==0) return rejectPromise(Object.assign(new Error(stopCode??'runner_failed'),{code:stopCode??'runner_failed'}));
      try {resolve(JSON.parse(stdout));} catch {rejectPromise(Object.assign(new Error('validator_failed'),{code:'validator_failed'}));}
    });
  });
}

export function createXlsxWorkshopRunner({queue,binding,projectRef,inputRoot,workRoot,outputRoot}) {
  // Capture a private immutable copy: caller mutation cannot repin live jobs.
  binding=structuredClone(binding);
  if(typeof projectRef!=='string' || !/^[a-z][a-z0-9_.:-]{1,120}$/.test(projectRef)) reject('project_binding_required');
  disjointRoots([inputRoot,workRoot,outputRoot,queue.stateRoot,CODE_ROOT]);
  const digest=verifyXlsxRunnerBinding(binding);
  if(queue.getBinding(XLSX_WORKSHOP_PROFILE.workshop_id)!==digest) reject('binding_drift');
  const workshop=queue.getWorkshop(XLSX_WORKSHOP_PROFILE.workshop_id);
  if(!workshop || workshop.workshop_class!==XLSX_WORKSHOP_PROFILE.workshop_class || workshop.resource_id!==XLSX_WORKSHOP_PROFILE.resource_id || workshop.capacity!==1 || JSON.stringify(workshop.tool_versions)!==JSON.stringify(XLSX_WORKSHOP_PROFILE.tool_versions)) reject('workshop_profile_drift');
  return Object.freeze({
    async runNext() {
      verifyXlsxRunnerBinding(binding);
      const lease=queue.acquireLease(XLSX_WORKSHOP_PROFILE.workshop_id,{lease_id:`lease.${randomUUID()}`,project_ref:projectRef});
      if(!lease) return null;
      const job=queue.getJob(lease.job_id);
      const deadline=performance.now()+job.timeout_seconds*1000;
      let stage='input_invalid';
      try {
        if(!job.approval_ref || job.required_tool_version!==binding.tool_version || job.project_ref!==projectRef) reject('input_invalid');
        const inputBytes=boundedRead(path.join(inputRoot,`${job.input_bundle_manifest_digest}.json`),INPUT_MAX);
        if(sha256(inputBytes)!==job.input_bundle_manifest_digest) reject('input_invalid');
        const model=JSON.parse(inputBytes.toString('utf8'));
        validateProjectHistoryCopyXlsxInput(model);
        if(model.project_id!==job.project_ref) reject('input_invalid');
        stage='binding_drift';verifyXlsxRunnerBinding(binding);
        directPath(workRoot,true);
        const runRoot=mkdtempSync(path.join(workRoot,'attempt-'));
        // Copy the exact admitted dependency closure; later source edits cannot
        // change this attempt's imports. No arbitrary job module is accepted.
        for(const source of binding.sources) {
          const bytes=boundedRead(path.join(CODE_ROOT,source.relative_path),4*1024*1024);
          if(sha256(bytes)!==source.sha256) reject('binding_drift');
          const target=path.join(runRoot,source.relative_path);
          mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});
        }
        const input=path.join(runRoot,'input.json'),output=path.join(runRoot,'candidate.xlsx');
        writeFileSync(input,inputBytes,{flag:'wx'});
        queue.assertCurrentLease(lease,new Date().toISOString());
        stage='runner_failed';
        await childRun({binding,runRoot,mode:'render',input,output,lease,queue,deadline});
        stage='output_invalid';
        const outputBytes=boundedRead(output,OUTPUT_MAX);
        stage='validator_failed';
        const verdict=await childRun({binding,runRoot,mode:'validate',input,output,lease,queue,deadline});
        exactKeys(verdict,['sha256','size_bytes','row_count','ordered_row_digest']);
        if(verdict.sha256!==sha256(outputBytes) || verdict.size_bytes!==outputBytes.length || verdict.row_count!==model.rows.length || verdict.ordered_row_digest!==model.ordered_row_digest) reject('validator_failed');
        stage='binding_drift';verifyXlsxRunnerBinding(binding);
        stage='output_invalid';
        if(performance.now()>=deadline)reject('runner_timeout');
        const receipt=commitVerifiedCandidate(queue,{lease,now:()=>new Date().toISOString(),verifyAndPublish:()=>{
          // Validation uses the held bytes again, never a caller-supplied pass.
          verifyProjectHistoryCopyXlsxReadback(readProjectHistoryCopyXlsx(outputBytes),model);
          directPath(outputRoot,true);
          const outputDigest=sha256(outputBytes),target=path.join(outputRoot,`${outputDigest}.xlsx`);
          if(existsSync(target)) {if(!boundedRead(target,OUTPUT_MAX).equals(outputBytes))reject('output_invalid');}
          else writeFileSync(target,outputBytes,{flag:'wx'});
          if(sha256(boundedRead(target,OUTPUT_MAX))!==outputDigest) reject('output_invalid');
          return {sha256:outputDigest,size_bytes:outputBytes.length,format:'xlsx',binding_digest:digest,validator_ref:'validator.xlsx_native_readback:v1',artifact_ref:`artifact.sha256:${outputDigest}`};
        }});
        return {state:'done_candidate',receipt};
      } catch(error) {
        const current=queue.getJob(job.job_id);
        if(current.state==='cancel_requested') {queue.finishCancellation(lease);return {state:'cancelled'};}
        if(error.code==='fence_stale') return {state:'fenced',code:error.code};
        const failure=['runner_timeout','lease_expired'].includes(error.code)?'runner_timeout':stage;
        try {return queue.failRun(lease,failure);} catch(fenced) {if(fenced.code==='fence_stale')return {state:'fenced',code:'fence_stale'};throw fenced;}
      }
    },
  });
}
