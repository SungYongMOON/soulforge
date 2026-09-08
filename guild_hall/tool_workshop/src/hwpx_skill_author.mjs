import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDurableToolWorkshop} from './tool_workshop_durable.mjs';
import {HWPX_REFERENCE_PROFILE,verifyHwpxReferenceBinding,createHwpxReferenceRunner,validateHwpxReferencePacket} from './hwpx_reference_runner.mjs';
import {boundedRead,directPath,disjointRoots,exactKeys,reject,sha256} from './workshop_files.mjs';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const CHILD='guild_hall/tool_workshop/src/hwpx_skill_author.py';
const REFERENCE_CHILD='guild_hall/tool_workshop/src/hwpx_reference_child.py';
const SCRIPTS='.registry/skills/hwpx_document/codex/scripts';
const PACK=`${SCRIPTS}/office/pack.py`;
// The trusted ACP profile must pin this port and helper in sourceHashes, in
// addition to the reference binding's existing transitive source pins. pack.py
// has a separate trusted config pin. No draft can nominate an executable.
export const HWPX_SKILL_AUTHOR_SOURCE_REFS=Object.freeze(['guild_hall/tool_workshop/src/hwpx_skill_author.mjs',CHILD,PACK]);
const CONFIG_KEYS=['version','project_ref','job_ref','source_ref','revision','approval_ref','provenance','input_root','work_root','output_root','queue_root','reference_binding','pack_sha256'];
const REF=/^[a-z][a-z0-9_.:-]{1,120}$/,DIGEST=/^[a-f0-9]{64}$/;
const inside=(root,file)=>{const r=path.relative(root,file);return !r || !path.isAbsolute(r) && r!=='..' && !r.startsWith(`..${path.sep}`);};
function exact(value,keys) {exactKeys(value,keys);if(Object.keys(value).length!==keys.length)reject('unexpected_fields');}
function pinned(file,digest,max=2*1024*1024,allowEmpty=false) {
  if(!DIGEST.test(digest??''))reject('author_pin_required');
  const bytes=boundedRead(file,max,allowEmpty);if(sha256(bytes)!==digest)reject('author_pin_changed');return bytes;
}
function createBytes(file,bytes) {
  try{writeFileSync(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;
    if(!boundedRead(file,32*1024*1024).equals(bytes))reject('author_existing_bytes_changed');}
  if(!boundedRead(file,32*1024*1024).equals(bytes))reject('author_existing_bytes_changed');
}
function snapshot(root,sourceRoot,entries) {
  for(const entry of entries) {
    const bytes=pinned(path.join(sourceRoot,entry.relative_path),entry.sha256,128*1024*1024,true);
    const target=path.resolve(root,entry.relative_path);if(!inside(root,target))reject('author_snapshot_invalid');
    mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});
  }
}
function checkSnapshot(root,entries) {for(const entry of entries)pinned(path.join(root,entry.relative_path),entry.sha256,128*1024*1024,true);}

function packCandidate({binding,runRoot,current,signal}) {
  const runtime=path.join(runRoot,'python-runtime'),libraries=path.join(runRoot,'libraries');
  const bootstrap="import sys;runtime,libraries,child,*args=sys.argv[1:];sys.path[:]=[libraries,runtime+'/Lib',runtime+'/DLLs',runtime];import runpy;sys.argv=[child,*args];runpy.run_path(child,run_name='__main__')";
  current();
  return new Promise((resolve,fail)=>{
    const env={TEMP:runRoot,TMP:runRoot,HOME:runRoot,USERPROFILE:runRoot};if(process.platform==='win32')env.SystemRoot=process.env.SystemRoot;
    const child=spawn(binding.python_executable,['-I','-S','-B','-X',`pycache_prefix=${path.join(runRoot,'cache')}`,'-c',bootstrap,runtime,libraries,path.join(runRoot,CHILD),runRoot,path.join(runRoot,SCRIPTS),path.join(runRoot,REFERENCE_CHILD)],
      {cwd:runRoot,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='',size=0,stopped=null;
    const stop=code=>{if(!stopped){stopped=code;child.kill();}};
    const aborted=()=>stop('author_cancelled');signal?.addEventListener('abort',aborted,{once:true});if(signal?.aborted)aborted();
    const timeout=setTimeout(()=>stop('author_timeout'),30000);
    const poll=setInterval(()=>{try{current();}catch{stop('author_binding_changed');}},50);
    child.stdout.on('data',bytes=>{size+=bytes.length;if(size>4096)stop('author_child_failed');else output+=bytes;});
    child.stderr.on('data',bytes=>{size+=bytes.length;if(size>4096)stop('author_child_failed');});
    child.on('error',()=>stop('author_child_failed'));
    child.on('close',code=>{clearTimeout(timeout);clearInterval(poll);signal?.removeEventListener('abort',aborted);
      if(stopped || code!==0)return fail(Object.assign(new Error(stopped??'author_child_failed'),{code:stopped??'author_child_failed'}));
      try{const result=JSON.parse(output);exact(result,['ok','sha256','size_bytes','render_required','expected_text_sha256']);
        if(result.ok!==true || !DIGEST.test(result.sha256??'') || !DIGEST.test(result.expected_text_sha256??'') || !Number.isSafeInteger(result.size_bytes) || result.size_bytes<1 || result.render_required!==true)reject('author_child_failed');
        resolve(result);}catch{fail(Object.assign(new Error('author_child_failed'),{code:'author_child_failed'}));}
    });
  });
}

export async function buildHwpxSkillCandidate({configPath,configSha256,draftPath,draftSha256,jobRef,assertCurrent,signal}) {
  if(typeof assertCurrent!=='function' || !REF.test(jobRef??''))reject('author_authority_required');
  const configBytes=pinned(configPath,configSha256),config=JSON.parse(configBytes.toString('utf8'));
  exact(config,CONFIG_KEYS);exact(config.reference_binding,['path','sha256']);
  if(config.version!==1 || config.job_ref!==jobRef || !['project_ref','job_ref','source_ref','revision','approval_ref'].every(key=>REF.test(config[key]??''))
    || !['synthetic_fixture','owner_approved'].includes(config.provenance))reject('author_config_invalid');
  const roots=['input_root','work_root','output_root','queue_root'].map(key=>directPath(config[key],true));
  for(const root of roots)if(/(?:^|[\\/])(?:_workspaces|_workmeta|private-state|install|source-lanes)(?:[\\/]|$)/i.test(root))reject('working_root_required');
  disjointRoots([...roots,ROOT]);
  for(const file of [configPath,config.reference_binding.path])if(roots.some(root=>inside(root,path.resolve(file))))reject('author_authority_writable');
  const bindingBytes=pinned(config.reference_binding.path,config.reference_binding.sha256),binding=JSON.parse(bindingBytes.toString('utf8'));
  const bindingDigest=verifyHwpxReferenceBinding(binding);
  if(config.provenance!==binding.template_provenance || roots.some(root=>inside(root,path.resolve(binding.template_path))))reject('author_template_authority_invalid');
  const draftBytes=pinned(draftPath,draftSha256,65536),draft=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(draftBytes));
  if(Object.hasOwn(draft,'text_edits')){
    exact(draft,['text_edits']);
    if(!Array.isArray(draft.text_edits)||draft.text_edits.length<1||draft.text_edits.length>20000)reject('author_text_edits_invalid');
    const targets=new Set();
    for(const edit of draft.text_edits){
      exact(edit,['part','text_index','before','after']);
      if(!binding.allowed_parts.includes(edit.part)||!Number.isSafeInteger(edit.text_index)||edit.text_index<0
        ||typeof edit.before!=='string'||typeof edit.after!=='string')reject('author_text_edits_invalid');
      const target=`${edit.part}:${edit.text_index}`;if(targets.has(target))reject('author_text_edit_duplicate');targets.add(target);
    }
  }else{
    exact(draft,['sections','expected_text']);
    if(!Array.isArray(draft.sections) || draft.sections.length!==binding.allowed_parts.length)reject('author_allowed_parts_invalid');
    for(const [index,section]of draft.sections.entries()){
      exact(section,['part','xml']);if(section.part!==binding.allowed_parts[index] || typeof section.xml!=='string')reject('author_allowed_parts_invalid');
    }
  }
  const sourcePins=HWPX_SKILL_AUTHOR_SOURCE_REFS.map(relative_path=>({relative_path,sha256:sha256(boundedRead(path.join(ROOT,relative_path),2*1024*1024))}));
  if(sourcePins.find(pin=>pin.relative_path===PACK).sha256!==config.pack_sha256)reject('author_pack_binding_changed');
  function current(){
    if(signal?.aborted)reject('author_cancelled');
    const value=assertCurrent();
    if(value===false || value && typeof value.then==='function')reject('author_binding_changed');
    if(signal?.aborted)reject('author_cancelled');
    pinned(configPath,configSha256);pinned(config.reference_binding.path,config.reference_binding.sha256);pinned(draftPath,draftSha256,65536);
    verifyHwpxReferenceBinding(binding);checkSnapshot(ROOT,sourcePins);
  }
  current();
  const queue=createDurableToolWorkshop({stateRoot:config.queue_root});
  const runRoot=path.join(config.work_root,`author-${sha256(jobRef).slice(0,32)}`),claim=Buffer.from(JSON.stringify({job_ref:jobRef,config_sha256:configSha256,draft_sha256:draftSha256}));
  const claimPath=path.join(runRoot,'claim.json'),completedPath=path.join(runRoot,'completed.json'),preparedPath=path.join(runRoot,'prepared.json');
  const existing=existsSync(runRoot);
  if(existing){
    directPath(runRoot,true);if(!boundedRead(claimPath,4096).equals(claim))reject('author_job_reuse_changed');
    const receipt=queue.getCustodyReceipt(jobRef);
    if(!receipt)reject('author_recovery_required');
    const prepared=JSON.parse(boundedRead(preparedPath,4096).toString('utf8'));
    exact(prepared,['candidate_sha256','size_bytes','packet_sha256']);
    const job=queue.getJob(jobRef);
    if(prepared.candidate_sha256!==receipt.artifact?.sha256 || prepared.size_bytes!==receipt.artifact?.size_bytes
      || prepared.packet_sha256!==job?.input_bundle_manifest_digest || job.approval_ref!==config.approval_ref
      || job.project_ref!==config.project_ref || job.required_tool_version!==binding.tool_version
      || receipt.artifact.binding_digest!==bindingDigest || receipt.artifact.template_sha256!==binding.template_sha256)reject('author_replay_changed');
    const stored={artifact_ref:receipt.artifact.artifact_ref,sha256:prepared.candidate_sha256,size_bytes:prepared.size_bytes,
      candidate_path:path.join(config.output_root,`${prepared.candidate_sha256}.hwpx`),receipt,render_required:true};
    if(existsSync(completedPath) && !boundedRead(completedPath,65536).equals(Buffer.from(JSON.stringify(stored))))reject('author_replay_changed');
    if(!receipt || JSON.stringify(stored.receipt)!==JSON.stringify(receipt) || stored.sha256!==receipt.artifact?.sha256
      || stored.candidate_path!==path.join(config.output_root,`${stored.sha256}.hwpx`) || stored.artifact_ref!==receipt.artifact.artifact_ref
      || stored.size_bytes!==receipt.artifact.size_bytes || stored.render_required!==true)reject('author_replay_changed');
    if(pinned(stored.candidate_path,stored.sha256,32*1024*1024).length!==stored.size_bytes)reject('author_replay_changed');
    // If the previous process committed custody but crashed before writing its
    // return metadata, reconstruct only from that exact durable receipt. Never
    // repack, reacquire a lease or invent a successful queue result.
    const packet=validateHwpxReferencePacket(JSON.parse(pinned(path.join(config.input_root,`${prepared.packet_sha256}.json`),prepared.packet_sha256)));
    current();createBytes(completedPath,Buffer.from(JSON.stringify(stored)));return {...stored,expected_text:packet.expected_text};
  }
  current();mkdirSync(runRoot);writeFileSync(claimPath,claim,{flag:'wx'});
  current();
  // A partial attempt is deliberately never deleted or silently rerun. Its
  // claim and snapshots remain evidence for an explicit recovery decision.
  snapshot(runRoot,ROOT,[...binding.sources,...sourcePins.filter(pin=>!binding.sources.some(saved=>saved.relative_path===pin.relative_path))]);
  snapshot(path.join(runRoot,'python-runtime'),path.dirname(binding.python_executable),binding.python_files);
  snapshot(path.join(runRoot,'libraries','lxml'),binding.lxml_root,binding.lxml_files);
  writeFileSync(path.join(runRoot,'reference.hwpx'),pinned(binding.template_path,binding.template_sha256,32*1024*1024),{flag:'wx'});
  writeFileSync(path.join(runRoot,'draft.json'),draftBytes,{flag:'wx'});
  writeFileSync(path.join(runRoot,'author-request.json'),JSON.stringify({reference_sha256:binding.template_sha256,draft_sha256:draftSha256,allowed_parts:binding.allowed_parts,pack_sha256:config.pack_sha256}),{flag:'wx'});
  const packed=await packCandidate({binding,runRoot,current,signal});
  current();checkSnapshot(runRoot,[...binding.sources,...sourcePins]);
  checkSnapshot(path.join(runRoot,'python-runtime'),binding.python_files);checkSnapshot(path.join(runRoot,'libraries','lxml'),binding.lxml_files);
  const candidate=pinned(path.join(runRoot,'candidate.hwpx'),packed.sha256,32*1024*1024);if(candidate.length!==packed.size_bytes)reject('author_candidate_changed');
  const expectedText=JSON.parse(pinned(path.join(runRoot,'expected-text.json'),packed.expected_text_sha256,8*1024*1024));
  const packet=validateHwpxReferencePacket({kind:'hwpx_reference_packet',project_ref:config.project_ref,source_ref:config.source_ref,revision:config.revision,
    approval_ref:config.approval_ref,provenance:config.provenance,template_sha256:binding.template_sha256,candidate_sha256:packed.sha256,
    allowed_parts:binding.allowed_parts,expected_text:expectedText});
  const packetBytes=Buffer.from(JSON.stringify(packet)),packetDigest=sha256(packetBytes);
  current();
  writeFileSync(preparedPath,JSON.stringify({candidate_sha256:packed.sha256,size_bytes:packed.size_bytes,packet_sha256:packetDigest}),{flag:'wx'});
  createBytes(path.join(config.input_root,`${packed.sha256}.hwpx`),candidate);createBytes(path.join(config.input_root,`${packetDigest}.json`),packetBytes);
  current();
  if(!queue.getWorkshop(HWPX_REFERENCE_PROFILE.workshop_id))queue.registerWorkshop({...HWPX_REFERENCE_PROFILE,binding_digest:bindingDigest});
  if(queue.getBinding(HWPX_REFERENCE_PROFILE.workshop_id)!==bindingDigest)reject('author_queue_binding_changed');
  if(queue.getJob(jobRef))reject('author_recovery_required');
  for(const event of queue.eventLog().filter(event=>event.kind==='job_submitted')){
    const job=queue.getJob(event.job_id);if(job?.workshop_id===HWPX_REFERENCE_PROFILE.workshop_id && job.project_ref===config.project_ref
      && ['queued','leased','cancel_requested'].includes(job.state))reject('author_queue_busy');
  }
  // The current durable API records standing approval on submission. There is
  // no separate approve() method and no inferred model/Task approval here.
  queue.submitJob({job_id:jobRef,workshop_id:HWPX_REFERENCE_PROFILE.workshop_id,task_ref:jobRef,work_brief_ref:config.source_ref,project_ref:config.project_ref,
    priority:2,required_tool_version:binding.tool_version,input_bundle_manifest_digest:packetDigest,timeout_seconds:60,max_retries:0,approval_ref:config.approval_ref});
  current();
  const runner=createHwpxReferenceRunner({queue,binding,projectRef:config.project_ref,inputRoot:config.input_root,workRoot:config.work_root,outputRoot:config.output_root});
  const result=await runner.runNext({expectedJobId:jobRef,assertCurrent:current,signal});
  current();
  if(result?.state!=='done_candidate')reject('author_reference_verification_failed');
  const receipt=queue.getCustodyReceipt(jobRef);if(!receipt || receipt.artifact?.sha256!==packed.sha256)reject('author_custody_missing');
  const stored={artifact_ref:receipt.artifact.artifact_ref,sha256:packed.sha256,size_bytes:packed.size_bytes,candidate_path:path.join(config.output_root,`${packed.sha256}.hwpx`),receipt,render_required:true};
  if(!pinned(stored.candidate_path,stored.sha256,32*1024*1024).equals(candidate))reject('author_candidate_changed');
  current();writeFileSync(completedPath,JSON.stringify(stored),{flag:'wx'});return {...stored,expected_text:packet.expected_text};
}
