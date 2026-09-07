import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitVerifiedCandidate } from './tool_workshop_durable.mjs';
import { runBoundedToolProcess } from './bounded_tool_process.mjs';
import { boundedRead, directPath, disjointRoots, exactKeys, reject, sha256 } from './workshop_files.mjs';

export const PPTX_WORKSHOP_PROFILE=Object.freeze({workshop_id:'workshop.pptx',workshop_class:'presentation',resource_id:'resource.pptx_node_python',tool_versions:['tool.template_pptx:v1']});
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const PY='guild_hall/tool_workshop/src/pptx_tool_child.py', RENDER='guild_hall/tool_workshop/src/pptx_render_child.mjs';
const SOURCES=[PY,RENDER,'.registry/skills/pptx_autofill_conversion/codex/scripts/replace_text_runs.py',...['pptx_workshop_runner','bounded_tool_process','tool_workshop_core','tool_workshop_durable','workshop_files'].map(name=>`guild_hall/tool_workshop/src/${name}.mjs`)];
const REF=/^[a-z][a-z0-9_.:-]{1,120}$/,DIGEST=/^[a-f0-9]{64}$/;

// This is a trusted template mapping, never a job-selected layout or executable.
export function validateTextProfile(profile) {
  exactKeys(profile,['family','revision','slides']);
  if(profile.family!=='workshop.approved_text' || !REF.test(profile.revision) || !Array.isArray(profile.slides) || profile.slides.length<2 || profile.slides.length>20)reject('template_profile_invalid');
  const placeholders=new Set();
  for(const slide of profile.slides) {
    exactKeys(slide,['textboxes']);
    if(!Array.isArray(slide.textboxes) || slide.textboxes.length<1 || slide.textboxes.length>4)reject('template_profile_invalid');
    for(const box of slide.textboxes) {
      exactKeys(box,['placeholder','geometry','font_family','font_size']);
      if(typeof box.placeholder!=='string' || !/^\{\{[A-Z][A-Z0-9_]{0,39}\}\}$/.test(box.placeholder) || placeholders.has(box.placeholder) || box.font_family!=='Malgun Gothic' || !Number.isInteger(box.font_size) || box.font_size<24 || box.font_size>64)reject('template_profile_invalid');
      placeholders.add(box.placeholder);
      const g=box.geometry;
      if(!Array.isArray(g) || g.length!==4 || !g.every(Number.isInteger))reject('template_profile_invalid');
      const [x,y,w,h]=g;
      if(x<60 || y<35 || w<100 || h<box.font_size*1.6 || x+w>1220 || y+h>655)reject('template_profile_invalid');
    }
    for(let i=0;i<slide.textboxes.length;i++)for(let j=0;j<i;j++) {
      const [x,y,w,h]=slide.textboxes[i].geometry,[a,b,c,d]=slide.textboxes[j].geometry;
      if(x<a+c+8 && x+w+8>a && y<b+d+8 && y+h+8>b)reject('template_profile_invalid');
    }
  }
  return profile;
}

function validateProfileText(text,box) {
  // Preserve approved bytes: require NFC instead of silently normalizing, and
  // reject invisible controls, bidi, residual combining marks and untested scripts.
  if(typeof text!=='string' || !text.trim() || text.length>800 || text!==text.normalize('NFC') || text.includes('{{') || /[\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{M}\p{Zl}\p{Zp}]/u.test(text) || !/^[\x20-\x7e\n\u00a1-\u024f\u2000-\u206f\u2100-\u214f\u2190-\u22ff\u3000-\u303f\uac00-\ud7a3]+$/u.test(text))reject('presentation_text_out_of_profile');
  const lines=text.split('\n'),[, ,width,height]=box.geometry;
  // Deliberately conservative no-wrap budget with inset/line-height reserves.
  // It can reject text that a typesetter could fit; it never truncates or shrinks.
  if(lines.length>8 || lines.some(line=>!line.trim()) || lines.length*box.font_size*1.6>height-12 || lines.some(line=>Array.from(line).reduce((sum,char)=>sum+(char.charCodeAt(0)<128?1.1:1.2),0)*box.font_size>width-32))reject('presentation_text_overflow');
}

export function validatePresentationPacket(packet,textProfile) {
  exactKeys(packet,['kind','project_ref','source_ref','provenance','revision','approval_ref','template_sha256','slides']);
  if(textProfile)validateTextProfile(textProfile);
  if(packet.kind!=='presentation_packet' || !REF.test(packet.project_ref) || !REF.test(packet.source_ref) || !['synthetic_fixture','owner_approved'].includes(packet.provenance) || !REF.test(packet.revision) || !REF.test(packet.approval_ref) || !DIGEST.test(packet.template_sha256) || !Array.isArray(packet.slides) || packet.slides.length!==(textProfile?.slides.length??2))reject('presentation_packet_invalid');
  for(const [index,slide] of packet.slides.entries()) {
    if(textProfile) {
      exactKeys(slide,['texts']);
      if(!Array.isArray(slide.texts) || slide.texts.length!==textProfile.slides[index].textboxes.length)reject('presentation_packet_invalid');
      slide.texts.forEach((text,boxIndex)=>validateProfileText(text,textProfile.slides[index].textboxes[boxIndex]));
      continue;
    }
    exactKeys(slide,['title','body']);
    for(const key of ['title','body']) {
      const limit=key==='title'?24:35;
      if(typeof slide[key]!=='string' || !slide[key].length || slide[key].length>limit || !/^[\x20-\x7e]+$/.test(slide[key]) || slide[key].includes('{{'))reject('presentation_text_out_of_profile');
    }
  }
  return packet;
}

function treeFiles(root,prefix='') {
  directPath(root,true);
  const result=[];
  for(const entry of readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    if(entry.isSymbolicLink())reject('path_link_forbidden');
    const relative=prefix+entry.name,full=path.join(root,entry.name);
    if(entry.isDirectory())result.push(...treeFiles(full,relative+'/'));
    else {directPath(full);result.push({relative_path:relative,sha256:sha256(boundedRead(full,128*1024*1024))});}
  }
  return result;
}

export function pptxBindingDigest(binding) { return sha256(JSON.stringify(binding)); }
function pythonIdentity(executable) {
  const code="import argparse,hashlib,importlib.util,json,os,pathlib,posixpath,re,shutil,struct,sys,tempfile,unicodedata,xml.etree.ElementTree,zipfile,zlib,encodings.cp437; paths=set(); [(paths.add(os.path.abspath(p))) for m in list(sys.modules.values()) for p in [getattr(m,'__file__',None),getattr(m,'__cached__',None)] if p and os.path.isfile(p)]; root=pathlib.Path(sys.base_prefix); [paths.add(str(p)) for folder in [root,root/'DLLs'] if folder.exists() for p in folder.glob('*.dll')]; print(json.dumps({'version':sys.version.split()[0],'files':sorted(paths)}))";
  const probe=spawnSync(executable,['-I','-S','-B','-c',code],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:65536,env:{SystemRoot:process.env.SystemRoot??''}});
  if(probe.status!==0)reject('python_runtime_unsupported');
  const identity=JSON.parse(probe.stdout);
  if(!/^3\.12\.\d+$/.test(identity.version))reject('python_runtime_unsupported');
  return {version:identity.version,files:identity.files.map(file=>({path:directPath(file),sha256:sha256(boundedRead(file,128*1024*1024,true))}))};
}
export function pinPptxRunnerBinding({artifactRoot,pythonExecutable,templatePath,templateApprovalRef,templateProvenance,textProfile}) {
  if(!REF.test(templateApprovalRef) || !['synthetic_fixture','owner_approved'].includes(templateProvenance))reject('template_approval_required');
  directPath(artifactRoot,true);directPath(pythonExecutable);directPath(templatePath);
  const info=JSON.parse(readFileSync(path.join(artifactRoot,'package.json'),'utf8'));
  if(info.name!=='@oai/artifact-tool' || info.version!=='2.8.59')reject('artifact_runtime_unsupported');
  const python=pythonIdentity(pythonExecutable);
  if(textProfile)validateTextProfile(textProfile);
  return {code_root:ROOT,node_executable:directPath(process.execPath),node_version:process.version,node_sha256:sha256(readFileSync(process.execPath)),python_executable:pythonExecutable,python_version:python.version,python_files:python.files,python_sha256:sha256(readFileSync(pythonExecutable)),artifact_root:artifactRoot,artifact_version:info.version,artifact_files:treeFiles(artifactRoot),template_path:templatePath,template_sha256:sha256(boundedRead(templatePath,8*1024*1024)),template_approval_ref:templateApprovalRef,template_provenance:templateProvenance,template_family:textProfile?.family??'workshop.two_slide_text',template_revision:textProfile?.revision??'template:v1',...(textProfile?{text_profile:structuredClone(textProfile)}:{}),sources:SOURCES.map(relative_path=>({relative_path,sha256:sha256(boundedRead(path.join(ROOT,relative_path),4*1024*1024))}))};
}

export function verifyPptxRunnerBinding(binding) {
  exactKeys(binding,['code_root','node_executable','node_version','node_sha256','python_executable','python_version','python_files','python_sha256','artifact_root','artifact_version','artifact_files','template_path','template_sha256','template_approval_ref','template_provenance','template_family','template_revision','sources',...(Object.hasOwn(binding,'text_profile')?['text_profile']:[])]);
  if(Object.hasOwn(binding,'text_profile'))validateTextProfile(binding.text_profile);
  if(!REF.test(binding.template_approval_ref) || !['synthetic_fixture','owner_approved'].includes(binding.template_provenance))reject('template_approval_required');
  if(binding.code_root!==ROOT || binding.node_executable!==process.execPath || binding.node_version!==process.version || binding.template_family!==(binding.text_profile?.family??'workshop.two_slide_text') || binding.template_revision!==(binding.text_profile?.revision??'template:v1') || !/^3\.12\.\d+$/.test(binding.python_version))reject('binding_drift');
  for(const [file,digest] of [[binding.node_executable,binding.node_sha256],[binding.python_executable,binding.python_sha256],[binding.template_path,binding.template_sha256]])if(sha256(boundedRead(file,128*1024*1024))!==digest)reject('binding_drift');
  for(const file of binding.python_files) {
    const relative=path.relative(path.dirname(binding.python_executable),file.path);
    if(relative.startsWith('..') || path.isAbsolute(relative) || !/\.(py|pyc|pyd|dll)$/i.test(file.path) || sha256(boundedRead(file.path,128*1024*1024,true))!==file.sha256)reject('binding_drift');
  }
  const python=pythonIdentity(binding.python_executable);
  if(python.version!==binding.python_version || JSON.stringify(python.files)!==JSON.stringify(binding.python_files))reject('binding_drift');
  const info=JSON.parse(readFileSync(path.join(binding.artifact_root,'package.json'),'utf8'));
  if(info.name!=='@oai/artifact-tool' || info.version!==binding.artifact_version || JSON.stringify(treeFiles(binding.artifact_root))!==JSON.stringify(binding.artifact_files) || binding.sources.length!==SOURCES.length)reject('binding_drift');
  for(let index=0;index<SOURCES.length;index++)if(binding.sources[index].relative_path!==SOURCES[index] || binding.sources[index].sha256!==sha256(boundedRead(path.join(ROOT,SOURCES[index]),4*1024*1024)))reject('binding_drift');
  return pptxBindingDigest(binding);
}

export function createPptxWorkshopRunner({queue,binding,projectRef,inputRoot,workRoot,outputRoot}) {
  binding=structuredClone(binding);
  if(!REF.test(projectRef))reject('project_binding_required');
  disjointRoots([inputRoot,workRoot,outputRoot,queue.stateRoot,ROOT]);
  const bindingDigest=verifyPptxRunnerBinding(binding),profile=queue.getWorkshop(PPTX_WORKSHOP_PROFILE.workshop_id);
  if(queue.getBinding(PPTX_WORKSHOP_PROFILE.workshop_id)!==bindingDigest)reject('binding_drift');
  if(!profile || profile.resource_id!==PPTX_WORKSHOP_PROFILE.resource_id || profile.workshop_class!=='presentation' || profile.capacity!==1 || JSON.stringify(profile.tool_versions)!==JSON.stringify(PPTX_WORKSHOP_PROFILE.tool_versions))reject('workshop_profile_drift');
  return Object.freeze({async runNext(){
    verifyPptxRunnerBinding(binding);
    const lease=queue.acquireLease(PPTX_WORKSHOP_PROFILE.workshop_id,{lease_id:`lease.${randomUUID()}`,project_ref:projectRef});
    if(!lease)return null;
    const job=queue.getJob(lease.job_id),deadline=performance.now()+job.timeout_seconds*1000;
    let stage='input_invalid';
    try {
      const bytes=boundedRead(path.join(inputRoot,`${job.input_bundle_manifest_digest}.json`),binding.text_profile?128*1024:16384);
      if(sha256(bytes)!==job.input_bundle_manifest_digest)reject('input_invalid');
      const packet=validatePresentationPacket(JSON.parse(bytes.toString('utf8')),binding.text_profile),slideCount=packet.slides.length;
      if(packet.project_ref!==projectRef || packet.approval_ref!==job.approval_ref || packet.template_sha256!==binding.template_sha256)reject('input_invalid');
      stage='binding_drift';verifyPptxRunnerBinding(binding);
      const runRoot=mkdtempSync(path.join(directPath(workRoot,true),'attempt-'));
      const snapshot=(base,entries,destination)=>{for(const entry of entries){const data=boundedRead(path.join(base,entry.relative_path),128*1024*1024);if(sha256(data)!==entry.sha256)reject('binding_drift');const target=path.join(destination,entry.relative_path);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,data,{flag:'wx'});}};
      snapshot(ROOT,binding.sources,runRoot);
      const runtimeRoot=path.join(runRoot,'artifact-runtime');snapshot(binding.artifact_root,binding.artifact_files,runtimeRoot);
      const input=path.join(runRoot,'input.json'),template=path.join(runRoot,'template.pptx'),output=path.join(runRoot,'candidate.pptx');
      writeFileSync(input,bytes,{flag:'wx'});writeFileSync(template,boundedRead(binding.template_path,8*1024*1024),{flag:'wx'});
      const profilePath=path.join(runRoot,'text-profile.json');
      if(binding.text_profile)writeFileSync(profilePath,JSON.stringify(binding.text_profile),{flag:'wx'});
      const python=mode=>runBoundedToolProcess({executable:binding.python_executable,args:['-I','-S','-B',path.join(runRoot,PY),mode,input,template,output,...(binding.text_profile?[profilePath]:[])],runRoot,lease,queue,deadline});
      stage='runner_failed';await python('author');
      stage='validator_failed';const native=await python('validate');
      await runBoundedToolProcess({executable:binding.node_executable,args:[path.join(runRoot,RENDER),'render',runtimeRoot,output,runRoot],runRoot,lease,queue,deadline});
      const checked=await python('render-qa');
      const outputBytes=boundedRead(output,8*1024*1024),renders=Array.from({length:slideCount},(_,index)=>boundedRead(path.join(runRoot,`slide-${index+1}.png`),4*1024*1024));
      if(native.sha256!==sha256(outputBytes) || checked.sha256!==native.sha256 || checked.size_bytes!==outputBytes.length || checked.slide_count!==slideCount || checked.template_sha256!==binding.template_sha256 || !Array.isArray(checked.renders) || checked.renders.length!==slideCount)reject('validator_failed');
      for(let index=0;index<slideCount;index++)if(checked.renders[index].sha256!==sha256(renders[index]) || checked.renders[index].size_bytes!==renders[index].length || checked.renders[index].width!==1280 || checked.renders[index].height!==720)reject('validator_failed');
      stage='binding_drift';verifyPptxRunnerBinding(binding);
      stage='output_invalid';
      const receipt=commitVerifiedCandidate(queue,{lease,now:()=>new Date().toISOString(),verifyAndPublish:()=>{
        if(performance.now()>=deadline)reject('runner_timeout');
        directPath(outputRoot,true);
        const write=(data,extension)=>{const target=path.join(outputRoot,`${sha256(data)}.${extension}`);if(existsSync(target)){if(!boundedRead(target,8*1024*1024).equals(data))reject('output_invalid');}else writeFileSync(target,data,{flag:'wx'});if(sha256(boundedRead(target,8*1024*1024))!==sha256(data))reject('output_invalid');};
        write(outputBytes,'pptx');for(const png of renders)write(png,'png');write(Buffer.from(JSON.stringify(checked.renders)),'json');
        return {sha256:sha256(outputBytes),size_bytes:outputBytes.length,format:'pptx',binding_digest:bindingDigest,validator_ref:'validator.pptx_native_render:v1',artifact_ref:`artifact.sha256:${sha256(outputBytes)}`,template_sha256:binding.template_sha256,render_manifest_digest:sha256(JSON.stringify(checked.renders)),render_count:slideCount};
      }});
      return {state:'done_candidate',receipt};
    } catch(error) {
      if(queue.getJob(job.job_id).state==='cancel_requested'){queue.finishCancellation(lease);return{state:'cancelled'};}
      if(error.code==='fence_stale')return{state:'fenced',code:error.code};
      try{return queue.failRun(lease,['runner_timeout','lease_expired'].includes(error.code)?'runner_timeout':stage);}catch(fenced){if(fenced.code==='fence_stale')return{state:'fenced',code:'fence_stale'};throw fenced;}
    }
  }});
}
