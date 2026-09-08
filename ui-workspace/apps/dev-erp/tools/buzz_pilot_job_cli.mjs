// Local, reviewed-launcher entry for the existing Buzz gateway observer.
// No network, model, tool dispatch, credential reading, or inferred user authority.
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

export const BUZZ_PILOT_SOURCE_FILES=Object.freeze([
  'ui-workspace/apps/dev-erp/tools/buzz_pilot_job_cli.mjs',
  'ui-workspace/apps/dev-erp/src/buzz_pilot_job.mjs',
  'guild_hall/shared/protected_working_bytes.mjs',
  'guild_hall/agent_observation/guard_primitives.mjs',
]);
const CORE=Object.freeze(['version','job_id','project_id','owner_account_id','expected_owner_pubkey',
  'expected_bot_pubkey','chat_id','profile_ref','instruction_sha256','issued_at','expires_at']);
const EXTRA=Object.freeze(['node_path','node_sha256','observer_entry_path','observer_entry_sha256',
  'observer_code_root','observer_source_hashes','control_db_path','evidence_root','repository_root',
  'storage_class','owner_approval_ref','expected_hermes_home']);
const HASH=/^[a-f0-9]{64}$/u;
const MAX_INPUT=512*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const inside=(a,b)=>{const r=path.relative(a,b);return!r||(r!=='..'&&!r.startsWith(`..${path.sep}`)&&!path.isAbsolute(r));};
const identity=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.nlink}`;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

async function directory(value){
  if(typeof value!=='string'||!path.isAbsolute(value)||path.normalize(value)!==value)fail('BUZZ_PILOT_PATH_INVALID');
  for(let cursor=value;;cursor=path.dirname(cursor)){
    const stat=await lstat(cursor);
    if(!stat.isDirectory()||stat.isSymbolicLink())fail('BUZZ_PILOT_PATH_UNSAFE');
    if(path.dirname(cursor)===cursor)break;
  }
  if(!same(await realpath(value),value))fail('BUZZ_PILOT_PATH_UNSAFE');
}

async function pinnedFile(file,maxBytes,expected,{executable=false,hashOnly=false}={}){
  if(typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file)fail('BUZZ_PILOT_PATH_INVALID');
  await directory(path.dirname(file));
  const before=await lstat(file);
  if(!before.isFile()||before.isSymbolicLink()||before.size>maxBytes||before.nlink<1
    ||(!executable&&before.nlink!==1))fail('BUZZ_PILOT_FILE_UNSAFE');
  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  const h=createHash('sha256'),parts=[];let size=0;
  try{
    if(identity(await handle.stat())!==identity(before))fail('BUZZ_PILOT_FILE_CHANGED');
    const buffer=Buffer.alloc(64*1024);
    for(;;){
      const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,maxBytes-size+1),null);
      if(!bytesRead)break;size+=bytesRead;
      if(size>maxBytes)fail('BUZZ_PILOT_FILE_LIMIT');
      const chunk=buffer.subarray(0,bytesRead);h.update(chunk);if(!hashOnly)parts.push(Buffer.from(chunk));
    }
    if(identity(await handle.stat())!==identity(before)||identity(await lstat(file))!==identity(before))fail('BUZZ_PILOT_FILE_CHANGED');
    await directory(path.dirname(file));
    if(!same(await realpath(file),file))fail('BUZZ_PILOT_FILE_CHANGED');
  }finally{await handle.close();}
  const sha256=h.digest('hex');
  if(expected!==undefined&&(!HASH.test(expected)||sha256!==expected))fail('BUZZ_PILOT_PIN_MISMATCH');
  return{bytes:hashOnly?undefined:Buffer.concat(parts),sha256,size};
}

export async function loadBuzzPilotBinding(bindingPath,bindingSha256,{consumer='observer'}={}){
  if(!['observer','reader'].includes(consumer))fail('BUZZ_PILOT_CONSUMER_INVALID');
  if(!HASH.test(bindingSha256??''))fail('BUZZ_PILOT_BINDING_PIN_REQUIRED');
  const read=await pinnedFile(bindingPath,128*1024,bindingSha256);
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read.bytes));}catch{fail('BUZZ_PILOT_BINDING_INVALID');}
  if(!exact(value,[...CORE,...EXTRA])||value.version!==1||value.storage_class!=='owner_approved_shared_worksite'
    ||!exact(value.observer_source_hashes,BUZZ_PILOT_SOURCE_FILES))fail('BUZZ_PILOT_BINDING_INVALID');
  for(const key of ['observer_code_root','evidence_root','repository_root','expected_hermes_home'])await directory(value[key]);
  await directory(path.dirname(value.control_db_path));
  if(!path.isAbsolute(value.control_db_path)||path.normalize(value.control_db_path)!==value.control_db_path
    ||path.basename(value.control_db_path)!=='buzz-pilot.sqlite')fail('BUZZ_PILOT_DB_PATH_INVALID');
  const controlRoot=path.dirname(value.control_db_path);
  for(const root of [value.evidence_root,controlRoot]){
    if(path.parse(root).root===root||inside(value.repository_root,root)||inside(root,value.repository_root)
      ||inside(value.observer_code_root,root)||inside(root,value.observer_code_root)
      ||root.split(path.sep).some(s=>['_workspaces','_workmeta','.git','.registry','.workflow'].includes(s.toLowerCase())))fail('BUZZ_PILOT_STORAGE_BOUNDARY');
  }
  if(inside(value.evidence_root,controlRoot)||inside(controlRoot,value.evidence_root)
    ||inside(value.evidence_root,bindingPath)||inside(value.observer_code_root,bindingPath))fail('BUZZ_PILOT_STORAGE_BOUNDARY');
  const expectedEntry=path.join(value.observer_code_root,...BUZZ_PILOT_SOURCE_FILES[0].split('/'));
  if(!same(value.observer_entry_path,expectedEntry)||(consumer==='observer'
    &&(!same(fileURLToPath(import.meta.url),expectedEntry)||!same(value.node_path,process.execPath))))fail('BUZZ_PILOT_RUNTIME_MISMATCH');
  if(value.observer_entry_sha256!==value.observer_source_hashes[BUZZ_PILOT_SOURCE_FILES[0]])fail('BUZZ_PILOT_PIN_MISMATCH');
  await pinnedFile(value.node_path,256*1024*1024,value.node_sha256,{executable:true,hashOnly:true});
  for(const relative of BUZZ_PILOT_SOURCE_FILES){
    await pinnedFile(path.join(value.observer_code_root,...relative.split('/')),4*1024*1024,value.observer_source_hashes[relative],{hashOnly:true});
  }
  if(consumer==='reader'){
    // The HPP reader may be a separate installed copy on a different Node.
    // Match its reviewed source bytes; do not pretend it is the observer process.
    const readerRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
    for(const relative of BUZZ_PILOT_SOURCE_FILES)await pinnedFile(path.join(readerRoot,...relative.split('/')),
      4*1024*1024,value.observer_source_hashes[relative],{hashOnly:true});
  }
  // Recheck the descriptor after all awaited code/runtime reads.
  await pinnedFile(bindingPath,128*1024,bindingSha256);
  // Non-bootstrap modules are evaluated only after their exact source pins pass.
  const {validateBuzzPilotBinding}=await import('../src/buzz_pilot_job.mjs');
  validateBuzzPilotBinding(Object.fromEntries(CORE.map(key=>[key,value[key]])));
  return Object.freeze({...value,observer_source_hashes:Object.freeze({...value.observer_source_hashes})});
}

async function assertDatabase(pathname,{required=false}={}){
  for(const suffix of ['', '-wal', '-shm']){
    const target=pathname+suffix;
    try{const stat=await lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)fail('BUZZ_PILOT_DB_UNSAFE');}
    catch(error){if(error.code!=='ENOENT')throw error;if(required&&suffix==='')fail('BUZZ_PILOT_DB_MISSING');}
  }
}

/** Startup-only assembly for authenticated server reads of an already issued job.
 * The server supplies the existing current-account/session/project authorizer.
 * This opens no model, creates no database or schema, and exposes no mutations.
 */
export async function openBuzzPilotReader({bindingPath,bindingSha256,authorize,now=Date.now}={}){
  if(typeof authorize!=='function')fail('BUZZ_PILOT_AUTHORIZER_REQUIRED');
  const binding=await loadBuzzPilotBinding(bindingPath,bindingSha256,{consumer:'reader'});
  await assertDatabase(binding.control_db_path,{required:true});
  const db=new DatabaseSync(binding.control_db_path,{readOnly:true});
  try{
    const {createBuzzPilotJob,BUZZ_PILOT_ROLES}=await import('../src/buzz_pilot_job.mjs');
    const {createProtectedWorkingBytes}=await import('../../../../guild_hall/shared/protected_working_bytes.mjs');
    db.exec('PRAGMA busy_timeout=5000; PRAGMA query_only=ON;');
    const workingBytes=createProtectedWorkingBytes({root:binding.evidence_root,repositoryRoot:binding.repository_root,
      storageClass:binding.storage_class,ownerApprovalRef:binding.owner_approval_ref,roles:BUZZ_PILOT_ROLES});
    const core=createBuzzPilotJob({db,workingBytes,binding:Object.fromEntries(CORE.map(key=>[key,binding[key]])),now,readOnly:true,
      authorize:async(action,context,access)=>{
        if(!['snapshot','readEvidence'].includes(action))return false;
        await pinnedFile(bindingPath,128*1024,bindingSha256);
        return await authorize(action,context,access)===true;
      }});
    return Object.freeze({binding,reader:Object.freeze({snapshot:core.snapshot,readEvidence:core.readEvidence}),close:()=>db.close()});
  }catch(error){db.close();throw error;}
}

async function stdinBytes(input){
  const parts=[];let size=0;
  for await(const chunk of input){size+=chunk.length;if(size>MAX_INPUT)fail('BUZZ_PILOT_INPUT_LIMIT');parts.push(Buffer.from(chunk));}
  return Buffer.concat(parts);
}

/** This CLI is an installed, trusted-local observer/issuer entry, not a public
 * authentication endpoint. OS access to the private binding/control/evidence
 * and the reviewed gateway hook is required. A SHA/ref alone is not a grant.
 * Browser readers must instead supply their current authenticated authorize
 * port to createBuzzPilotJob; no CLI flag grants a different viewer access.
 */
export async function runBuzzPilotCli(args,{input=process.stdin,output=process.stdout}={}){
  if(args.length===1&&args[0]==='--help'){
    output.write('Buzz pilot observer: --binding ABSOLUTE_JSON --binding-sha256 SHA256 issue --instruction-file ABSOLUTE_UTF8 | append | capture-health | status | doctor\n');return;
  }
  if(args[0]!=='--binding'||args[2]!=='--binding-sha256'||!['issue','append','capture-health','status','doctor'].includes(args[4])
    ||(args[4]==='issue'?(args.length!==7||args[5]!=='--instruction-file'):args.length!==5))fail('BUZZ_PILOT_ARGUMENTS');
  const [,_bindingPath,,bindingSha256,action]=args;
  const bindingPath=path.resolve(_bindingPath);
  const binding=await loadBuzzPilotBinding(bindingPath,bindingSha256);
  const core=Object.fromEntries(CORE.map(key=>[key,binding[key]]));
  if(action==='doctor'){
    output.write(JSON.stringify({ok:true,status:'CONFIGURATION_VERIFIED',job_id:binding.job_id,model_launched:false,
      gateway_runtime_observed:false,source_files:BUZZ_PILOT_SOURCE_FILES.length,binding_sha256:bindingSha256})+'\n');return;
  }
  let instruction,event;
  if(action==='issue'){
    instruction=(await pinnedFile(path.resolve(args[6]),64*1024)).bytes;
    if(`sha256:${hash(instruction)}`!==binding.instruction_sha256)fail('BUZZ_PILOT_INSTRUCTION_MISMATCH');
  }
  if(action==='append'||action==='capture-health'){
    try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await stdinBytes(input)));}catch(error){if(error.code)throw error;fail('BUZZ_PILOT_EVENT_INVALID');}
  }
  await assertDatabase(binding.control_db_path,{required:action!=='issue'});
  const db=new DatabaseSync(binding.control_db_path,{readOnly:action==='status'});
  try{
    const {createBuzzPilotJob,BUZZ_PILOT_ROLES}=await import('../src/buzz_pilot_job.mjs');
    const {createProtectedWorkingBytes}=await import('../../../../guild_hall/shared/protected_working_bytes.mjs');
    db.exec(action==='status'?'PRAGMA busy_timeout=5000; PRAGMA query_only=ON;'
      :'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const workingBytes=createProtectedWorkingBytes({root:binding.evidence_root,repositoryRoot:binding.repository_root,
      storageClass:binding.storage_class,ownerApprovalRef:binding.owner_approval_ref,roles:BUZZ_PILOT_ROLES});
    const job=createBuzzPilotJob({db,workingBytes,binding:core,readOnly:action==='status',authorize:async()=>{
      // This local entry can only service its exact reviewed binding. Current
      // web-account authorization is deliberately not inferred here.
      const current=await pinnedFile(bindingPath,128*1024,bindingSha256);
      return current.sha256===bindingSha256;
    }});
    const access={accountId:binding.owner_account_id};
    const result=action==='issue'?await job.issue({instructionBytes:instruction},access)
      :action==='append'?await job.append(event):action==='capture-health'?await job.captureHealth(event,access):await job.snapshot(access);
    output.write(JSON.stringify({ok:true,...result})+'\n');
  }finally{db.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runBuzzPilotCli(process.argv.slice(2)).catch(error=>{
    const candidate=String(error.code??'').toUpperCase();
    const code=/^BUZZ_PILOT_[A-Z0-9_]{1,80}$/u.test(candidate)?candidate:'BUZZ_PILOT_RUNTIME_UNAVAILABLE';
    process.stdout.write(JSON.stringify({ok:false,code,retryable:false})+'\n');process.exitCode=2;
  });
}
