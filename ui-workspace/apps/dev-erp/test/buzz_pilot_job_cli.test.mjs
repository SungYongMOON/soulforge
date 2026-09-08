import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,readdir,rm,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {BUZZ_PILOT_SOURCE_FILES,openBuzzPilotReader} from '../tools/buzz_pilot_job_cli.mjs';

const repositoryRoot=path.resolve(fileURLToPath(new URL('../../../..',import.meta.url)));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const nodeHash=digest(await readFile(process.execPath));
const instruction='Review this bounded public synthetic request.\n';
const owner='1'.repeat(64),bot='2'.repeat(64),chat='00000000-0000-4000-8000-000000000001';
const sealedEnv=process.platform==='win32'?{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}:{};

async function fixture(t,{copyNode=false}={}){
  const root=await mkdtemp(path.join(os.tmpdir(),'buzz-pilot-cli-'));
  const closers=[];
  t.after(async()=>{for(const close of closers)close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await rm(root,{recursive:true,force:true});});
  const codeRoot=path.join(root,'observer-code'),control=path.join(root,'control'),evidence=path.join(root,'working'),home=path.join(root,'synthetic-home');
  for(const dir of [codeRoot,control,evidence,home])await mkdir(dir);
  const pins={};
  for(const file of BUZZ_PILOT_SOURCE_FILES){const target=path.join(codeRoot,...file.split('/'));await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(repositoryRoot,...file.split('/')),target);pins[file]=digest(await readFile(target));}
  let node=process.execPath;
  if(copyNode){node=path.join(root,process.platform==='win32'?'observer-node.exe':'observer-node');await copyFile(process.execPath,node);}
  const entry=path.join(codeRoot,...BUZZ_PILOT_SOURCE_FILES[0].split('/'));
  const at=Date.now();const binding={version:1,job_id:'job.synthetic-cli',project_id:'project.synthetic',owner_account_id:'owner.synthetic',
    expected_owner_pubkey:owner,expected_bot_pubkey:bot,chat_id:chat,profile_ref:'default',instruction_sha256:`sha256:${digest(instruction)}`,
    issued_at:new Date(at-1000).toISOString(),expires_at:new Date(at+600_000).toISOString(),
    node_path:node,node_sha256:nodeHash,observer_entry_path:entry,observer_entry_sha256:pins[BUZZ_PILOT_SOURCE_FILES[0]],
    observer_code_root:codeRoot,observer_source_hashes:pins,control_db_path:path.join(control,'buzz-pilot.sqlite'),
    evidence_root:evidence,repository_root:repositoryRoot,storage_class:'owner_approved_shared_worksite',owner_approval_ref:'approval.synthetic-owner-pilot',expected_hermes_home:home};
  const bindingPath=path.join(root,'private-binding.json'),input=path.join(root,'instruction.utf8');await writeFile(input,instruction);
  const save=async()=>{const bytes=Buffer.from(JSON.stringify(binding));await writeFile(bindingPath,bytes);return digest(bytes);};
  let pin=await save();
  const invoke=(action,payload,extra=[])=>{
    const args=[entry,'--binding',bindingPath,'--binding-sha256',pin,action,...extra];
    const result=spawnSync(node,args,{env:sealedEnv,input:payload===undefined?undefined:JSON.stringify(payload),encoding:'utf8',windowsHide:true,timeout:15000});
    assert.equal(result.error,undefined);return{...result,value:JSON.parse(result.stdout.trim())};
  };
  return{root,codeRoot,control,evidence,binding,bindingPath,input,invoke,closers,save:async()=>{pin=await save();return pin;},pin:()=>pin};
}
const access={accountId:'owner.synthetic',checkSession:async()=>true,canAccessProject:async id=>id==='project.synthetic'};
async function authorize(action,context,viewer){return ['snapshot','readEvidence'].includes(action)&&viewer?.accountId===context.owner_account_id
  &&await viewer.checkSession()===true&&await viewer.canAccessProject(context.project_id)===true;}

test('installed-copy CLI issues and appends once, and restart replay returns no source text',async t=>{
  const f=await fixture(t);const issued=f.invoke('issue',undefined,['--instruction-file',f.input]);assert.equal(issued.status,0);assert.equal(issued.value.status,'issued');
  const event={version:1,observation_id:'observation.one',job_id:f.binding.job_id,event_type:'instruction_received',profile_ref:'default',chat_id:chat,
    bot_pubkey:bot,actor_pubkey:owner,session_key:'session.synthetic',session_id:null,observed_at:new Date().toISOString(),payload:{message_id:'a'.repeat(64),text:instruction.trim()}};
  const appended=f.invoke('append',event);assert.equal(appended.status,0);assert.equal(appended.value.state,'running');
  assert.equal(appended.value.seq,1);
  const replay=f.invoke('append',event);assert.equal(replay.status,0);assert.equal(replay.value.status,'replayed');
  assert.equal(replay.value.seq,appended.value.seq);assert.equal(JSON.stringify(replay.value).includes('Review this'),false);
  const status=f.invoke('status');assert.equal(status.status,0);assert.equal(status.value.sequence,1);assert.equal(status.value.canonical,false);
  assert.equal(status.value.recovery_metadata.instruction_trim_sha256,`sha256:${digest(instruction.trim())}`);
  assert.notEqual(status.value.recovery_metadata.instruction_trim_sha256,f.binding.instruction_sha256);
  assert.equal(JSON.stringify(status.value).includes(instruction.trim()),false);
  f.binding.instruction_sha256=`sha256:${digest('other instruction')}`;await f.save();
  const historical=f.invoke('status');assert.equal(historical.status,0);
  assert.equal(historical.value.recovery_metadata.instruction_trim_sha256,null);
});

test('authenticated reader opens a distinct observer code root and Node path without writes',async t=>{
  const f=await fixture(t,{copyNode:true});assert.equal(f.invoke('issue',undefined,['--instruction-file',f.input]).status,0);
  const reader=await openBuzzPilotReader({bindingPath:f.bindingPath,bindingSha256:f.pin(),authorize});f.closers.push(reader.close);
  assert.notEqual(f.binding.node_path,process.execPath);assert.notEqual(f.binding.observer_entry_path,fileURLToPath(new URL('../tools/buzz_pilot_job_cli.mjs',import.meta.url)));
  const before=await readFile(f.binding.control_db_path);const view=await reader.reader.snapshot(access);
  assert.equal(view.state,'issued');assert.equal(reader.reader.issue,undefined);assert.equal(reader.reader.append,undefined);
  const role=await reader.reader.readEvidence({role:'instruction'},access);assert.equal(role.bytes.toString(),instruction);
  assert.deepEqual(await readFile(f.binding.control_db_path),before);
  await assert.rejects(reader.reader.readEvidence({role:'instruction'},{...access,accountId:'unrelated'}));
});

test('installed-copy CLI enforces prepared v2 across processes and exposes exact effective bytes through read-only authority',async t=>{
  const f=await fixture(t);assert.equal(f.invoke('issue',undefined,['--instruction-file',f.input]).status,0);
  let counter=0;
  const event=(event_type,payload)=>({version:1,observation_id:`observation.${++counter}`,job_id:f.binding.job_id,event_type,
    profile_ref:'default',chat_id:chat,bot_pubkey:bot,actor_pubkey:event_type==='instruction_received'?owner:bot,
    session_key:'session.synthetic',session_id:'session.actual',observed_at:new Date().toISOString(),payload});
  assert.equal(f.invoke('append',event('instruction_received',{message_id:'a'.repeat(64),text:instruction.trim()})).status,0);
  const raw={question:'Who reads it?',choices:['Engineering (recommended)','Management']};
  const start=f.invoke('append',event('tool_started',{tool_call_id:'call.actual',tool_name:'clarify',input:raw,input_contract:'prepared_v2'}));
  assert.equal(start.status,0);
  const effective={question:raw.question,choices:['⭐ Engineering (recommended)','Management'],multi_select:false};
  const registration=()=>event('question_registered',{clarify_id:'clarify.actual',tool_call_id:'call.actual',...effective});
  assert.equal(f.invoke('append',registration()).value.code,'BUZZ_PILOT_PREPARED_INPUT_REQUIRED');
  const prepared=event('tool_input_prepared',{tool_call_id:'call.actual',tool_name:'clarify',tool_input_ref:start.value.evidence_refs[0].ref,input:effective});
  const ack=f.invoke('append',prepared);assert.equal(ack.status,0);assert.equal(ack.value.seq,3);
  assert.equal(f.invoke('append',prepared).value.status,'replayed');
  assert.equal(f.invoke('append',event('tool_input_prepared',prepared.payload)).value.code,'BUZZ_PILOT_PREPARED_INPUT_MISMATCH');
  assert.equal(f.invoke('append',registration()).status,0);
  const reader=await openBuzzPilotReader({bindingPath:f.bindingPath,bindingSha256:f.pin(),authorize});f.closers.push(reader.close);
  const before=await readFile(f.binding.control_db_path);
  const query={role:'tool_input_effective',observation_id:prepared.observation_id};
  const bytes=await reader.reader.readEvidence(query,access);assert.deepEqual(JSON.parse(bytes.bytes),effective);
  assert.equal(bytes.sha256,ack.value.evidence_refs[0].sha256);
  await assert.rejects(reader.reader.readEvidence(query,{...access,canAccessProject:async()=>false}));
  const status=f.invoke('status');assert.equal(status.status,0);assert.equal(status.value.sequence,4);
  assert.equal(status.value.failure_reason_code,null);assert.equal(JSON.stringify(status.value).includes('Engineering'),false);
  assert.deepEqual(await readFile(f.binding.control_db_path),before);
});

test('installed CLI rejection is not a failure receipt; a separate observed failure exposes only its reason code',async t=>{
  const f=await fixture(t);assert.equal(f.invoke('issue',undefined,['--instruction-file',f.input]).status,0);
  let counter=0;
  const event=(event_type,payload)=>({version:1,observation_id:`observation.${++counter}`,job_id:f.binding.job_id,event_type,
    profile_ref:'default',chat_id:chat,bot_pubkey:bot,actor_pubkey:event_type==='instruction_received'?owner:bot,
    session_key:'session.synthetic',session_id:'session.actual',observed_at:new Date().toISOString(),payload});
  assert.equal(f.invoke('append',event('instruction_received',{message_id:'a'.repeat(64),text:instruction.trim()})).status,0);
  assert.equal(f.invoke('append',event('tool_started',{tool_call_id:'call.actual',tool_name:'clarify',input:{question:'Who?'}})).status,0);
  const rejected=f.invoke('append',event('question_registered',{clarify_id:'clarify.actual',tool_call_id:'call.actual',question:'Changed?',choices:[],multi_select:false}));
  assert.equal(rejected.status,2);assert.equal(rejected.value.code,'BUZZ_PILOT_QUESTION_MISMATCH');
  let view=f.invoke('status').value;assert.equal(view.sequence,2);assert.equal(view.state,'tool_running');assert.equal(view.failure_reason_code,null);
  const failed=event('failed',{reason_code:'pilot_append_rejected'});assert.equal(f.invoke('append',failed).status,0);
  assert.equal(f.invoke('append',failed).value.status,'replayed');
  view=f.invoke('status').value;assert.equal(view.sequence,3);assert.equal(view.state,'failed');
  assert.equal(view.failure_reason_code,'pilot_append_rejected');assert.equal(view.operations_attention,true);
  assert.equal(view.owner_action_required,false);assert.equal(view.question_ref,null);assert.equal(view.answer_ref,null);
  assert.equal(JSON.stringify(view).includes('Changed?'),false);
});

test('missing DB is not created by append, status or reader startup',async t=>{
  const f=await fixture(t);for(const action of ['append','capture-health','status']){const result=f.invoke(action,action==='status'?undefined:{});assert.equal(result.status,2);assert.equal(result.value.code,'BUZZ_PILOT_DB_MISSING');}
  await assert.rejects(openBuzzPilotReader({bindingPath:f.bindingPath,bindingSha256:f.pin(),authorize}),{code:'BUZZ_PILOT_DB_MISSING'});
  assert.deepEqual(await readdir(f.control),[]);
});

test('pinned CLI capture-health is durable metadata only with explicit lifecycle and current binding fence',async t=>{
  const f=await fixture(t);assert.equal(f.invoke('issue',undefined,['--instruction-file',f.input]).status,0);
  const status=f.invoke('status');assert.equal(status.value.capture_health.state,'unknown');
  const packet={version:1,observer_instance_id:'00000000-0000-4000-8000-000000000010',phase:'started',
    observed_at:new Date().toISOString(),pending_operations:1,recorded_operations:0,gap_reason:null};
  const started=f.invoke('capture-health',packet);assert.equal(started.status,0);
  assert.equal(started.value.observer_instance_id,packet.observer_instance_id);assert.equal(started.value.phase,'started');
  assert.equal(f.invoke('capture-health',packet).value.status,'replayed');
  let view=f.invoke('status').value;assert.equal(view.sequence,0);assert.equal(view.recorded_state,'issued');
  assert.equal(view.state,'capture_syncing');assert.equal(view.operations_attention,true);
  const closed={...packet,phase:'closed',observed_at:new Date().toISOString(),pending_operations:0,recorded_operations:1};
  assert.equal(f.invoke('capture-health',closed).status,0);
  view=f.invoke('status').value;assert.equal(view.state,'capture_unconfirmed');assert.equal(view.failure_reason_code,null);
  assert.equal(view.event_refs.length,0);assert.equal(JSON.stringify(view.capture_health).includes(packet.observer_instance_id),false);
  const reader=await openBuzzPilotReader({bindingPath:f.bindingPath,bindingSha256:f.pin(),authorize});f.closers.push(reader.close);
  assert.equal(reader.reader.captureHealth,undefined);assert.equal((await reader.reader.snapshot(access)).capture_health.phase,'closed');
  f.binding.instruction_sha256=`sha256:${digest('other')}`;await f.save();
  assert.equal(f.invoke('capture-health',{...packet,observer_instance_id:'00000000-0000-4000-8000-000000000011'}).value.code,'BUZZ_PILOT_STALE_SOURCE');
});

test('changed source pins or wrong instruction reject before issuing a control database',async t=>{
  const f=await fixture(t);await writeFile(f.input,'Different unapproved instruction');
  assert.equal(f.invoke('issue',undefined,['--instruction-file',f.input]).value.code,'BUZZ_PILOT_INSTRUCTION_MISMATCH');
  assert.deepEqual(await readdir(f.control),[]);
  const marker=path.join(f.root,'must-not-evaluate');
  await writeFile(path.join(f.codeRoot,...BUZZ_PILOT_SOURCE_FILES[1].split('/')),
    `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)},'unsafe'); export const createBuzzPilotJob=null;`);
  assert.equal(f.invoke('doctor').value.code,'BUZZ_PILOT_PIN_MISMATCH');assert.deepEqual(await readdir(f.control),[]);
  await assert.rejects(stat(marker),{code:'ENOENT'});
});

test('reader refuses revoked session and changed binding without returning working bytes',async t=>{
  const f=await fixture(t);assert.equal(f.invoke('issue',undefined,['--instruction-file',f.input]).status,0);
  const reader=await openBuzzPilotReader({bindingPath:f.bindingPath,bindingSha256:f.pin(),authorize});f.closers.push(reader.close);
  await assert.rejects(reader.reader.snapshot({...access,checkSession:async()=>false}));
  f.binding.profile_ref='other-profile';await f.save();
  await assert.rejects(reader.reader.readEvidence({role:'instruction'},access),{code:'BUZZ_PILOT_PIN_MISMATCH'});
});
