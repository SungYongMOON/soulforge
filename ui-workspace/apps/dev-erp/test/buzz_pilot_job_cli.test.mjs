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

test('missing DB is not created by append, status or reader startup',async t=>{
  const f=await fixture(t);for(const action of ['append','status']){const result=f.invoke(action,action==='append'?{}:undefined);assert.equal(result.status,2);assert.equal(result.value.code,'BUZZ_PILOT_DB_MISSING');}
  await assert.rejects(openBuzzPilotReader({bindingPath:f.bindingPath,bindingSha256:f.pin(),authorize}),{code:'BUZZ_PILOT_DB_MISSING'});
  assert.deepEqual(await readdir(f.control),[]);
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
