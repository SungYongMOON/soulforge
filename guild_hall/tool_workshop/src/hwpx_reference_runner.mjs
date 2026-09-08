import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readdirSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {commitVerifiedCandidate} from './tool_workshop_durable.mjs';
import {runBoundedToolProcess} from './bounded_tool_process.mjs';
import {boundedRead, directPath, disjointRoots, exactKeys, reject, sha256} from './workshop_files.mjs';

export const HWPX_REFERENCE_PROFILE=Object.freeze({workshop_id:'workshop.hwpx',workshop_class:'hwpx',resource_id:'resource.hwpx_python',tool_versions:['tool.reference_hwpx:v1']});
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const CHILD='guild_hall/tool_workshop/src/hwpx_reference_child.py';
const SCRIPTS='.registry/skills/hwpx_document/codex/scripts';
const SOURCES=[CHILD,`${SCRIPTS}/validate.py`,`${SCRIPTS}/page_guard.py`,...['hwpx_reference_runner','tool_workshop_durable','tool_workshop_core','workshop_files','bounded_tool_process'].map(name=>`guild_hall/tool_workshop/src/${name}.mjs`)];
const REF=/^[a-z][a-z0-9_.:-]{1,120}$/,DIGEST=/^[a-f0-9]{64}$/,SECTION=/^Contents\/section(?:0|[1-9][0-9]*)\.xml$/;
const MAX=32*1024*1024,MAX_CODE=2*1024*1024;
const BINDING_KEYS=['tool_version','code_root','node_executable','node_version','node_sha256','python_executable','python_version','python_sha256','python_files','lxml_root','lxml_version','lxml_files','template_path','template_sha256','template_approval_ref','template_provenance','allowed_parts','sources'];
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!=='' && rel!=='..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);};
function allowlist(parts) {
  if(!Array.isArray(parts) || parts.length<1 || parts.length>64 || parts.some(p=>typeof p!=='string' || !SECTION.test(p)) || new Set(parts).size!==parts.length)reject('allowed_parts_invalid');
  return parts;
}
function workingRoot(root) {
  root=directPath(root,true);
  if(/(?:^|[\\/])(?:_workspaces|_workmeta|private-state|install|source-lanes)(?:[\\/]|$)/i.test(root))reject('working_root_required');
  return root;
}
function packageFiles(root,prefix='',skip=new Set(['__pycache__'])) {
  directPath(root,true);
  return readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    if(skip.has(entry.name))return [];
    const file=path.join(root,entry.name),relative_path=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.isSymbolicLink())reject('binding_drift');
    if(entry.isDirectory())return packageFiles(file,relative_path,skip);
    return /\.(?:py|pyc|pyd|dll|so|dylib)$/i.test(entry.name)?[{relative_path,sha256:sha256(boundedRead(file,128*1024*1024,true))}]:[];
  });
}
function pythonIdentity(executable) {
  directPath(executable);
  const code=`import sys,os,pathlib,json,importlib.util,runpy,pkgutil,encodings.cp437,encodings.utf_8_sig
root=pathlib.Path(sys.base_prefix).resolve()
package=root/'Lib'/'site-packages'/'lxml' if os.name=='nt' else root/'lib'/('python'+sys.version[:4])/'site-packages'/'lxml'
spec=importlib.util.spec_from_file_location('lxml',package/'__init__.py',submodule_search_locations=[str(package)])
lxml=importlib.util.module_from_spec(spec);sys.modules['lxml']=lxml;spec.loader.exec_module(lxml)
import lxml.etree
for index,file in enumerate(sys.argv[1:]):
 name='_reference_probe_'+str(index);item=importlib.util.spec_from_file_location(name,file);module=importlib.util.module_from_spec(item);sys.modules[name]=module;item.loader.exec_module(module)
files=set()
for module in list(sys.modules.values()):
 file=getattr(module,'__file__',None)
 if file and os.path.isfile(file):
  p=pathlib.Path(file).resolve()
  if p.is_relative_to(root) and 'site-packages' not in p.parts: files.add(str(p))
for folder in [root,root/'DLLs']:
 if folder.is_dir(): files.update(str(p) for p in folder.glob('*.dll'))
print(json.dumps({'version':sys.version.split()[0],'lxml_version':lxml.__version__,'lxml_root':str(package),'files':sorted(files)}))`;
  const probe=spawnSync(executable,['-I','-S','-B','-X',`pycache_prefix=${path.join(os.tmpdir(),`sf-reference-probe-${randomUUID()}`)}`,'-c',code,path.join(ROOT,CHILD),path.join(ROOT,SCRIPTS,'validate.py'),path.join(ROOT,SCRIPTS,'page_guard.py')],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:131072,env:{SystemRoot:process.env.SystemRoot??''}});
  if(probe.status!==0)reject('reference_python_unavailable');
  let info;try{info=JSON.parse(probe.stdout);}catch{reject('reference_python_unavailable');}
  if(!/^3\.12\.\d+$/.test(info.version) || !Array.isArray(info.files) || info.files.length>512 || !inside(path.dirname(executable),directPath(info.lxml_root,true)))reject('reference_python_unavailable');
  for(const file of info.files)if(!inside(path.dirname(executable),directPath(file)))reject('reference_python_unavailable');
  return info;
}
function captureBinding({pythonExecutable,templatePath,templateApprovalRef,templateProvenance,allowedParts}) {
  if(typeof templateApprovalRef!=='string' || !REF.test(templateApprovalRef) || !['synthetic_fixture','owner_approved'].includes(templateProvenance))reject('template_approval_required');
  allowlist(allowedParts);directPath(pythonExecutable);directPath(templatePath);
  const python=pythonIdentity(pythonExecutable);
  return {tool_version:HWPX_REFERENCE_PROFILE.tool_versions[0],code_root:ROOT,node_executable:process.execPath,node_version:process.version,node_sha256:sha256(boundedRead(process.execPath,128*1024*1024)),python_executable:pythonExecutable,python_version:python.version,python_sha256:sha256(boundedRead(pythonExecutable,128*1024*1024)),python_files:python.files.map(file=>({relative_path:path.relative(path.dirname(pythonExecutable),file).split(path.sep).join('/'),sha256:sha256(boundedRead(file,128*1024*1024,true))})),lxml_root:python.lxml_root,lxml_version:python.lxml_version,lxml_files:packageFiles(python.lxml_root),template_path:templatePath,template_sha256:sha256(boundedRead(templatePath,MAX)),template_approval_ref:templateApprovalRef,template_provenance:templateProvenance,allowed_parts:[...allowedParts],sources:SOURCES.map(relative_path=>({relative_path,sha256:sha256(boundedRead(path.join(ROOT,relative_path),MAX_CODE))}))};
}

// Trusted bootstrap only. Verification below measures against these pins and
// never writes a replacement binding, changes approval or expands allowed parts.
export function pinHwpxReferenceBinding(options) {return captureBinding(options);}
export function hwpxReferenceBindingDigest(binding) {return sha256(JSON.stringify(binding));}
export function verifyHwpxReferenceBinding(binding) {
  exactKeys(binding,BINDING_KEYS);
  if(binding.tool_version!==HWPX_REFERENCE_PROFILE.tool_versions[0] || binding.code_root!==ROOT || binding.node_executable!==process.execPath || binding.node_version!==process.version || !Array.isArray(binding.sources) || binding.sources.length!==SOURCES.length || !Array.isArray(binding.python_files) || !Array.isArray(binding.lxml_files))reject('binding_drift');
  // Pure-byte verification only. Never execute the live interpreter/package to
  // discover drift: even a subsequently rejected shadow import has side effects.
  for(const [file,hash] of [[process.execPath,binding.node_sha256],[binding.python_executable,binding.python_sha256],[binding.template_path,binding.template_sha256]])if(!DIGEST.test(hash??'') || sha256(boundedRead(file,128*1024*1024))!==hash)reject('binding_drift');
  for(let i=0;i<SOURCES.length;i++) {
    exactKeys(binding.sources[i],['relative_path','sha256']);
    if(binding.sources[i].relative_path!==SOURCES[i] || sha256(boundedRead(path.join(ROOT,SOURCES[i]),MAX_CODE))!==binding.sources[i].sha256)reject('binding_drift');
  }
  const pythonRoot=path.dirname(binding.python_executable);
  if(!inside(pythonRoot,directPath(binding.lxml_root,true)) || path.basename(binding.lxml_root)!=='lxml')reject('binding_drift');
  for(const [root,files] of [[path.dirname(binding.python_executable),binding.python_files],[binding.lxml_root,binding.lxml_files]])for(const entry of files) {
    exactKeys(entry,['relative_path','sha256']);
    if(typeof entry.relative_path!=='string' || !/(?:\.(?:exe|py|pyc|pyd|dll|so|dylib|zip|cfg)|\._pth)$/i.test(entry.relative_path))reject('binding_drift');
    const file=path.resolve(root,entry.relative_path);
    if(!inside(root,file) || !DIGEST.test(entry.sha256??'') || sha256(boundedRead(file,128*1024*1024,true))!==entry.sha256)reject('binding_drift');
  }
  if(!/^3\.12\.\d+$/.test(binding.python_version??'') || !/^\d+(?:\.\d+){1,3}$/.test(binding.lxml_version??'') || typeof binding.template_approval_ref!=='string' || !REF.test(binding.template_approval_ref) || !['synthetic_fixture','owner_approved'].includes(binding.template_provenance))reject('binding_drift');
  allowlist(binding.allowed_parts);
  // Interpreter startup and the measured stdlib closure are trusted bootstrap
  // pins; live site-packages is never part of execution's import search path.
  if(binding.python_files.length<1 || binding.python_files.length>512 || new Set(binding.python_files.map(file=>file.relative_path)).size!==binding.python_files.length || JSON.stringify(packageFiles(binding.lxml_root))!==JSON.stringify(binding.lxml_files))reject('binding_drift');
  return hwpxReferenceBindingDigest(binding);
}

export function validateHwpxReferencePacket(packet) {
  exactKeys(packet,['kind','project_ref','source_ref','revision','approval_ref','provenance','template_sha256','candidate_sha256','allowed_parts','expected_text']);
  if(packet.kind!=='hwpx_reference_packet' || !['synthetic_fixture','owner_approved'].includes(packet.provenance) || !['project_ref','source_ref','revision','approval_ref'].every(key=>typeof packet[key]==='string' && REF.test(packet[key])) || !DIGEST.test(packet.template_sha256??'') || !DIGEST.test(packet.candidate_sha256??''))reject('reference_packet_invalid');
  allowlist(packet.allowed_parts);
  if(!Array.isArray(packet.expected_text) || packet.expected_text.length>20000 || packet.expected_text.some(text=>typeof text!=='string' || text.length>65536) || packet.expected_text.reduce((sum,text)=>sum+text.length,0)>1024*1024)reject('expected_text_invalid');
  return packet;
}
function snapshot(root,sourceRoot,entries) {
  for(const entry of entries) {
    const bytes=boundedRead(path.join(sourceRoot,entry.relative_path),128*1024*1024,true);
    if(sha256(bytes)!==entry.sha256)reject('binding_drift');
    const target=path.join(root,entry.relative_path);
    mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});
  }
}
function verifySnapshot(root,entries) {
  for(const entry of entries)if(sha256(boundedRead(path.join(root,entry.relative_path),128*1024*1024,true))!==entry.sha256)reject('binding_drift');
}

export function createHwpxReferenceRunner({queue,binding,projectRef,inputRoot,workRoot,outputRoot}) {
  binding=structuredClone(binding);
  if(typeof projectRef!=='string' || !REF.test(projectRef))reject('project_binding_required');
  for(const root of [inputRoot,workRoot,outputRoot])workingRoot(root);
  disjointRoots([inputRoot,workRoot,outputRoot,queue.stateRoot,ROOT]);
  const bindingDigest=hwpxReferenceBindingDigest(binding),profile=queue.getWorkshop('workshop.hwpx');
  if(queue.getBinding('workshop.hwpx')!==bindingDigest)reject('binding_drift');
  verifyHwpxReferenceBinding(binding);
  if(!profile || profile.resource_id!=='resource.hwpx_python' || profile.workshop_class!=='hwpx' || profile.capacity!==1 || JSON.stringify(profile.tool_versions)!==JSON.stringify(HWPX_REFERENCE_PROFILE.tool_versions))reject('workshop_profile_drift');
  return Object.freeze({async runNext({expectedJobId,assertCurrent,signal}={}){
    if(expectedJobId!==undefined && !REF.test(expectedJobId))reject('job_binding_invalid');
    if(assertCurrent!==undefined && typeof assertCurrent!=='function')reject('current_guard_invalid');
    function current(){
      if(signal?.aborted)reject('job_cancel_requested');
      const value=assertCurrent?.();
      if(value===false || value && typeof value.then==='function')reject('binding_drift');
      if(signal?.aborted)reject('job_cancel_requested');
    }
    current();
    verifyHwpxReferenceBinding(binding);
    const lease=queue.acquireLease('workshop.hwpx',{lease_id:`lease.${randomUUID()}`,project_ref:projectRef,...(expectedJobId===undefined?{}:{expected_job_id:expectedJobId})});
    if(!lease)return null;
    const cancelOwned=()=>{
      try{const profile=queue.getWorkshop('workshop.hwpx');
        if(profile.active_lease_id===lease.lease_id && profile.fencing_counter===lease.fencing_token && queue.getJob(lease.job_id)?.state==='leased')queue.cancelJob(lease.job_id);
      }catch{/* Never cancel a replacement lease or conceal its own fence. */}
    };
    signal?.addEventListener('abort',cancelOwned,{once:true});if(signal?.aborted)cancelOwned();
    const job=queue.getJob(lease.job_id),deadline=performance.now()+job.timeout_seconds*1000;
    let stage='input_invalid';
    try {
      current();
      workingRoot(inputRoot);workingRoot(workRoot);workingRoot(outputRoot);
      const packetPath=path.join(inputRoot,`${job.input_bundle_manifest_digest}.json`),packetBytes=boundedRead(packetPath,2*1024*1024);
      if(sha256(packetBytes)!==job.input_bundle_manifest_digest)reject('input_invalid');
      const packet=validateHwpxReferencePacket(JSON.parse(packetBytes.toString('utf8')));
      if(packet.project_ref!==projectRef || packet.approval_ref!==job.approval_ref || packet.template_sha256!==binding.template_sha256 || packet.provenance!==binding.template_provenance || job.required_tool_version!==binding.tool_version || JSON.stringify(packet.allowed_parts)!==JSON.stringify(binding.allowed_parts))reject('input_invalid');
      const candidatePath=path.join(inputRoot,`${packet.candidate_sha256}.hwpx`),candidate=boundedRead(candidatePath,MAX),reference=boundedRead(binding.template_path,MAX);
      if(sha256(candidate)!==packet.candidate_sha256 || sha256(reference)!==binding.template_sha256)reject('input_invalid');
      stage='binding_drift';verifyHwpxReferenceBinding(binding);
      const runRoot=mkdtempSync(path.join(workRoot,'reference-'));
      snapshot(runRoot,ROOT,binding.sources);
      const runtime=path.join(runRoot,'python-runtime'),libraries=path.join(runRoot,'libraries');
      snapshot(runtime,path.dirname(binding.python_executable),binding.python_files);
      snapshot(path.join(libraries,'lxml'),binding.lxml_root,binding.lxml_files);
      const request=path.join(runRoot,'request.json');
      writeFileSync(path.join(runRoot,'reference.hwpx'),reference,{flag:'wx'});writeFileSync(path.join(runRoot,'candidate.hwpx'),candidate,{flag:'wx'});
      writeFileSync(request,JSON.stringify({reference_sha256:binding.template_sha256,candidate_sha256:packet.candidate_sha256,allowed_parts:packet.allowed_parts,expected_text:packet.expected_text}),{flag:'wx'});
      const bootstrap="import sys; runtime,libraries,child,*args=sys.argv[1:];sys.path[:]=[libraries,runtime+'/Lib',runtime+'/DLLs',runtime];import runpy;sys.argv=[child,*args];runpy.run_path(child,run_name='__main__')";
      stage='validator_failed';
      const guardedQueue={assertCurrentLease(...args){current();return queue.assertCurrentLease(...args);}};
      const result=await runBoundedToolProcess({executable:binding.python_executable,args:['-I','-S','-B','-X',`pycache_prefix=${path.join(runRoot,'cache')}`,'-c',bootstrap,runtime,libraries,path.join(runRoot,CHILD),'verify',request,path.join(runRoot,SCRIPTS),runRoot],runRoot,queue:guardedQueue,lease,deadline});
      exactKeys(result,['ok','reference_sha256','candidate_sha256','candidate_size_bytes','section_count','changed_section_count','text_node_count','canonical_validation','page_guard','page_count_verified','preview_status','render_required','validation_level']);
      if(result.ok!==true || result.reference_sha256!==binding.template_sha256 || result.candidate_sha256!==packet.candidate_sha256 || result.candidate_size_bytes!==candidate.length || !Number.isInteger(result.section_count) || result.section_count<1 || result.section_count>64 || !Number.isInteger(result.changed_section_count) || result.changed_section_count<0 || result.changed_section_count>result.section_count || result.text_node_count!==packet.expected_text.length || result.canonical_validation!=='passed' || result.page_guard!=='passed_all_sections' || result.page_count_verified!==false || !['preview_stale','present_unverified','absent'].includes(result.preview_status) || result.render_required!==true || result.validation_level!=='structural_reference_only')reject('validator_failed');
      stage='binding_drift';current();verifyHwpxReferenceBinding(binding);
      verifySnapshot(runRoot,binding.sources);verifySnapshot(runtime,binding.python_files);verifySnapshot(path.join(libraries,'lxml'),binding.lxml_files);
      stage='input_invalid';
      if(!boundedRead(packetPath,2*1024*1024).equals(packetBytes) || !boundedRead(candidatePath,MAX).equals(candidate) || !boundedRead(path.join(runRoot,'candidate.hwpx'),MAX).equals(candidate))reject('input_invalid');
      stage='output_invalid';
      const receipt=commitVerifiedCandidate(queue,{lease,now:()=>new Date().toISOString(),verifyAndPublish:()=>{
        current();
        if(performance.now()>=deadline)reject('runner_timeout');
        workingRoot(outputRoot);
        const target=path.join(outputRoot,`${packet.candidate_sha256}.hwpx`);
        writeFileSync(target,candidate,{flag:'wx'});
        if(sha256(boundedRead(target,MAX))!==packet.candidate_sha256)reject('output_invalid');
        current();
        return {sha256:packet.candidate_sha256,size_bytes:candidate.length,format:'hwpx',binding_digest:bindingDigest,validator_ref:'validator.hwpx_reference_readback:v1',artifact_ref:`artifact.sha256:${packet.candidate_sha256}`,template_sha256:binding.template_sha256,section_count:result.section_count,preview_status:result.preview_status,render_required:true,page_count_verified:false};
      }});
      return {state:'done_candidate',receipt};
    } catch(error) {
      if(signal?.aborted)cancelOwned();
      if(queue.getJob(job.job_id).state==='cancel_requested'){queue.finishCancellation(lease);return {state:'cancelled'};}
      if(error.code==='fence_stale')return {state:'fenced',code:error.code};
      try{return queue.failRun(lease,['runner_timeout','lease_expired'].includes(error.code)?'runner_timeout':stage);}catch(fenced){if(fenced.code==='fence_stale')return {state:'fenced',code:'fence_stale'};throw fenced;}
    } finally {signal?.removeEventListener('abort',cancelOwned);}
  }});
}
