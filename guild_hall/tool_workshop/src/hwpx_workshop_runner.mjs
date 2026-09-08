import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitVerifiedCandidate } from './tool_workshop_durable.mjs';
import { runBoundedToolProcess } from './bounded_tool_process.mjs';
import { boundedRead, directPath, disjointRoots, exactKeys, reject, sha256 } from './workshop_files.mjs';

export const HWPX_WORKSHOP_PROFILE=Object.freeze({workshop_id:'workshop.hwpx',workshop_class:'hwpx',resource_id:'resource.hwpx_python',tool_versions:['tool.template_hwpx:v1']});
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const CHILD='guild_hall/tool_workshop/src/hwpx_tool_child.py';
const SOURCES=[CHILD,...['hwpx_workshop_runner','tool_workshop_durable','tool_workshop_core','workshop_files','bounded_tool_process'].map(name=>`guild_hall/tool_workshop/src/${name}.mjs`)];
const REF=/^[a-z][a-z0-9_.:-]{1,120}$/,DIGEST=/^[a-f0-9]{64}$/,MAX=2*1024*1024;

export function validateHwpxPacket(packet) {
  exactKeys(packet,['kind','project_ref','source_ref','revision','approval_ref','provenance','template_sha256','title','body']);
  if(packet.kind!=='hwpx_text_packet' || !['synthetic_fixture','owner_approved'].includes(packet.provenance) || !DIGEST.test(packet.template_sha256) || !['project_ref','source_ref','revision','approval_ref'].every(key=>typeof packet[key]==='string' && REF.test(packet[key])))reject('hwpx_packet_invalid');
  for(const [key,limit] of [['title',16],['body',20]])if(typeof packet[key]!=='string' || !packet[key].trim() || packet[key].length>limit || packet[key]!==packet[key].normalize('NFC') || !/^[\x20-\x7e\uac00-\ud7a3]+$/.test(packet[key]) || packet[key].includes('{{'))reject('hwpx_text_out_of_profile');
  return packet;
}

function pythonIdentity(executable) {
  const code="import hashlib,html,json,os,pathlib,re,stat,sys,unicodedata,xml.etree.ElementTree,zipfile,zlib,encodings.cp437; paths=set(); [(paths.add(os.path.abspath(p))) for m in list(sys.modules.values()) for p in [getattr(m,'__file__',None),getattr(m,'__cached__',None)] if p and os.path.isfile(p)]; root=pathlib.Path(sys.base_prefix); [paths.add(str(p)) for folder in [root,root/'DLLs'] if folder.exists() for p in folder.glob('*.dll')]; print(json.dumps({'version':sys.version.split()[0],'files':sorted(paths)}))";
  const probe=spawnSync(executable,['-I','-S','-B','-c',code],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:65536,env:{SystemRoot:process.env.SystemRoot??''}});
  if(probe.status!==0)reject('python_runtime_unsupported');
  const identity=JSON.parse(probe.stdout);
  if(!/^3\.12\.\d+$/.test(identity.version))reject('python_runtime_unsupported');
  return {version:identity.version,files:identity.files.map(file=>({path:directPath(file),sha256:sha256(boundedRead(file,128*1024*1024,true))}))};
}

// Trusted bootstrap only. Template approval is caller authority, not inferred by
// this adapter. Persist and reuse; source/runtime/template drift never auto-repins.
export function pinHwpxRunnerBinding({pythonExecutable,templatePath,templateApprovalRef,templateProvenance}) {
  if(!REF.test(templateApprovalRef) || !['synthetic_fixture','owner_approved'].includes(templateProvenance))reject('template_approval_required');
  directPath(pythonExecutable);directPath(templatePath);
  const python=pythonIdentity(pythonExecutable);
  return {tool_version:HWPX_WORKSHOP_PROFILE.tool_versions[0],code_root:ROOT,node_executable:process.execPath,node_version:process.version,node_sha256:sha256(boundedRead(process.execPath,128*1024*1024)),python_executable:pythonExecutable,python_version:python.version,python_sha256:sha256(boundedRead(pythonExecutable,128*1024*1024)),python_files:python.files,template_path:templatePath,template_sha256:sha256(boundedRead(templatePath,MAX)),template_approval_ref:templateApprovalRef,template_provenance:templateProvenance,template_family:'workshop.hwpx_two_text_table',template_revision:'template:v1',sources:SOURCES.map(relative_path=>({relative_path,sha256:sha256(boundedRead(path.join(ROOT,relative_path),MAX))}))};
}
export function hwpxBindingDigest(binding) {return sha256(JSON.stringify(binding));}
export function verifyHwpxRunnerBinding(binding) {
  exactKeys(binding,['tool_version','code_root','node_executable','node_version','node_sha256','python_executable','python_version','python_sha256','python_files','template_path','template_sha256','template_approval_ref','template_provenance','template_family','template_revision','sources']);
  if(binding.tool_version!==HWPX_WORKSHOP_PROFILE.tool_versions[0] || binding.code_root!==ROOT || binding.node_executable!==process.execPath || binding.node_version!==process.version || binding.template_family!=='workshop.hwpx_two_text_table' || binding.template_revision!=='template:v1' || !REF.test(binding.template_approval_ref) || !['synthetic_fixture','owner_approved'].includes(binding.template_provenance) || !Array.isArray(binding.python_files) || !Array.isArray(binding.sources) || binding.sources.length!==SOURCES.length)reject('binding_drift');
  for(const [file,hash] of [[binding.node_executable,binding.node_sha256],[binding.python_executable,binding.python_sha256],[binding.template_path,binding.template_sha256]])if(sha256(boundedRead(file,128*1024*1024))!==hash)reject('binding_drift');
  for(const file of binding.python_files) {
    exactKeys(file,['path','sha256']);
    const relative=path.relative(path.dirname(binding.python_executable),file.path);
    if(relative.startsWith('..') || path.isAbsolute(relative) || !/\.(py|pyc|pyd|dll)$/i.test(file.path) || sha256(boundedRead(file.path,128*1024*1024,true))!==file.sha256)reject('binding_drift');
  }
  const python=pythonIdentity(binding.python_executable);
  if(python.version!==binding.python_version || JSON.stringify(python.files)!==JSON.stringify(binding.python_files))reject('binding_drift');
  for(let index=0;index<SOURCES.length;index++) {
    exactKeys(binding.sources[index],['relative_path','sha256']);
    if(binding.sources[index].relative_path!==SOURCES[index] || binding.sources[index].sha256!==sha256(boundedRead(path.join(ROOT,SOURCES[index]),MAX)))reject('binding_drift');
  }
  return hwpxBindingDigest(binding);
}

export function createHwpxWorkshopRunner({queue,binding,projectRef,inputRoot,workRoot,outputRoot}) {
  binding=structuredClone(binding);
  if(!REF.test(projectRef))reject('project_binding_required');
  disjointRoots([inputRoot,workRoot,outputRoot,queue.stateRoot,ROOT]);
  const bindingDigest=verifyHwpxRunnerBinding(binding),profile=queue.getWorkshop(HWPX_WORKSHOP_PROFILE.workshop_id);
  if(queue.getBinding(HWPX_WORKSHOP_PROFILE.workshop_id)!==bindingDigest)reject('binding_drift');
  if(!profile || profile.resource_id!==HWPX_WORKSHOP_PROFILE.resource_id || profile.workshop_class!=='hwpx' || profile.capacity!==1 || JSON.stringify(profile.tool_versions)!==JSON.stringify(HWPX_WORKSHOP_PROFILE.tool_versions))reject('workshop_profile_drift');
  return Object.freeze({async runNext(){
    verifyHwpxRunnerBinding(binding);
    const lease=queue.acquireLease(HWPX_WORKSHOP_PROFILE.workshop_id,{lease_id:`lease.${randomUUID()}`,project_ref:projectRef});
    if(!lease)return null;
    const job=queue.getJob(lease.job_id),deadline=performance.now()+job.timeout_seconds*1000;
    let stage='input_invalid';
    try {
      const bytes=boundedRead(path.join(inputRoot,`${job.input_bundle_manifest_digest}.json`),16384);
      if(sha256(bytes)!==job.input_bundle_manifest_digest)reject('input_invalid');
      const packet=validateHwpxPacket(JSON.parse(bytes.toString('utf8')));
      if(packet.project_ref!==projectRef || packet.approval_ref!==job.approval_ref || packet.template_sha256!==binding.template_sha256 || job.required_tool_version!==binding.tool_version)reject('input_invalid');
      stage='binding_drift';verifyHwpxRunnerBinding(binding);
      const runRoot=mkdtempSync(path.join(directPath(workRoot,true),'attempt-'));
      for(const source of binding.sources) {
        const data=boundedRead(path.join(ROOT,source.relative_path),MAX);
        if(sha256(data)!==source.sha256)reject('binding_drift');
        const target=path.join(runRoot,source.relative_path);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,data,{flag:'wx'});
      }
      const input=path.join(runRoot,'input.json'),template=path.join(runRoot,'template.hwpx'),output=path.join(runRoot,'candidate.hwpx');
      writeFileSync(input,bytes,{flag:'wx'});writeFileSync(template,boundedRead(binding.template_path,MAX),{flag:'wx'});
      const child=mode=>runBoundedToolProcess({executable:binding.python_executable,args:['-I','-S','-B',path.join(runRoot,CHILD),mode,input,template,output],runRoot,lease,queue,deadline});
      stage='runner_failed';await child('author');
      stage='validator_failed';const native=await child('validate');
      const outputBytes=boundedRead(output,MAX);
      exactKeys(native,['sha256','size_bytes','template_sha256','section_count','table_shape','editable_text_count','preview_status','validation_level']);
      if(native.sha256!==sha256(outputBytes) || native.size_bytes!==outputBytes.length || native.template_sha256!==binding.template_sha256 || native.section_count!==1 || native.table_shape!=='2x2' || native.editable_text_count!==2 || native.preview_status!=='absent_by_profile' || native.validation_level!=='structural_only_no_render')reject('validator_failed');
      stage='binding_drift';verifyHwpxRunnerBinding(binding);
      stage='output_invalid';
      const receipt=commitVerifiedCandidate(queue,{lease,now:()=>new Date().toISOString(),verifyAndPublish:()=>{
        if(performance.now()>=deadline)reject('runner_timeout');
        directPath(outputRoot,true);
        const hash=sha256(outputBytes),target=path.join(outputRoot,`${hash}.hwpx`);
        if(existsSync(target)){if(!boundedRead(target,MAX).equals(outputBytes))reject('output_invalid');}
        else writeFileSync(target,outputBytes,{flag:'wx'});
        if(sha256(boundedRead(target,MAX))!==hash)reject('output_invalid');
        return {sha256:hash,size_bytes:outputBytes.length,format:'hwpx',binding_digest:bindingDigest,validator_ref:'validator.hwpx_structural_readback:v1',artifact_ref:`artifact.sha256:${hash}`};
      }});
      return {state:'done_candidate',receipt};
    } catch(error) {
      if(queue.getJob(job.job_id).state==='cancel_requested'){queue.finishCancellation(lease);return {state:'cancelled'};}
      if(error.code==='fence_stale')return {state:'fenced',code:error.code};
      try{return queue.failRun(lease,['runner_timeout','lease_expired'].includes(error.code)?'runner_timeout':stage);}catch(fenced){if(fenced.code==='fence_stale')return {state:'fenced',code:'fence_stale'};throw fenced;}
    }
  }});
}
