// Installed integration driver; this development harness is never packaged.
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createGenerationStoreFixture } from './fixtures/generation_store_fixture.mjs';
import { describeInstallation } from './generation_flow.mjs';
import { REPO_ROOT,APP_REF,ENTRY_REF } from '../release/closure.mjs';
import { verifyLane } from '../../deployment_pack/tools/build_source_lane.mjs';

const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
function inventory(root){
  const rows=[];const walk=(rel='')=>{for(const name of readdirSync(join(root,rel))){
    const path=rel?rel+'/'+name:name,full=join(root,path),stat=lstatSync(full);assert.equal(stat.isSymbolicLink(),false);
    if(stat.isDirectory())walk(path);else rows.push({path,sha256:hash(readFileSync(full))});}};
  walk();return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
export function call(state,install,operation,request,{write=false}={}){
  const allowedRoots=[state.storeRoot,state.sourceOwnerRoot,...state.binding.installs.map(i=>i.root),dirname(state.binding.preparation.interpreter_path)];
  const args=['--permission',...allowedRoots.map(p=>'--allow-fs-read='+p)];
  if(write)args.push('--allow-fs-write='+state.storeRoot,'--allow-fs-write='+state.cacheRoot);
  if(operation==='update')args.push('--allow-child-process');
  args.push(ENTRY_REF,'--root',state.storeRoot,'--binding-sha256',state.bindingSha256,
    '--request-json',JSON.stringify(request),'--synthetic-only');
  if(operation!=='query')args.push('--operation',operation);
  const result=spawnSync(process.execPath,args,{cwd:install.root,encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,
    env:{...process.env,NODE_OPTIONS:'',NODE_PATH:'',NODE_COMPILE_CACHE:'',NODE_V8_COVERAGE:'',
      TEMP:state.cacheRoot,TMP:state.cacheRoot,TMPDIR:state.cacheRoot}});
  assert.equal(result.status,0,result.stderr);
  const value=JSON.parse(result.stdout);return {value,exit:result.status,output_characters:[...result.stdout].length};
}
export const currentRef=state=>{
  const p=join(state.storeRoot,state.projectPath,'00_프로젝트_안내/current.json');
  try{return hash(readFileSync(p));}catch(e){if(e.code==='ENOENT')return null;throw e;}
};
export const selectRequest=(state,install,generated)=>({actor_ref:state.request.actor_ref,project_ref:state.request.project_ref,
  purpose:state.request.purpose,scope:'project',install_id:install.id,expected_prior:currentRef(state),
  generation_ref:{path:generated.manifest_ref,sha256:generated.manifest_sha256}});
const updateRequest=(state,install,id)=>({...state.request,install_id:install.id,composition:install.composition,
  generation_id:id,expected_prior:currentRef(state)});

export async function installIncumbent(laneRoot){
  assert.deepEqual(verifyLane(laneRoot).failures,[]);
  const scratch=mkdtempSync(join(tmpdir(),'context-engine-generations-')),cacheRoot=join(scratch,'cache');mkdirSync(cacheRoot);
  const install=describeInstallation(laneRoot,'decision-v1');
  const fixture=await createGenerationStoreFixture({installs:[install],generationId:'incumbent-data'});
  const state={scratch,cacheRoot,storeRoot:fixture.storeRoot,sourceOwnerRoot:fixture.sourceOwnerRoot,
    projectPath:fixture.projectPath,binding:fixture.binding,bindingSha256:fixture.bindingSha256,request:fixture.request,
    queryRequest:{...fixture.queryRequest,query_text:'Prepare bounded evidence for the bench review, including the unresolved supply issue and specimen traceability.',
      budget:{...fixture.queryRequest.budget,max_evidence:5}},installs:[install]};
  const sourceBefore=inventory(state.sourceOwnerRoot),codeBefore=inventory(laneRoot);
  writeFileSync(join(scratch,'flow-state.json'),JSON.stringify({...state,status:'PREPARING'},null,2)+'\n');
  const generated=call(state,install,'update',updateRequest(state,install,'incumbent-data'),{write:true});
  assert.equal(generated.value.status,'PREPARED');assert.equal(generated.value.counts.complete,4);
  const selection=call(state,install,'select',selectRequest(state,install,generated.value),{write:true});
  assert.equal(selection.value.status,'COMMITTED');
  writeFileSync(join(scratch,'flow-state.json'),JSON.stringify({...state,status:'SELECTED_QUERY_PENDING',generated:generated.value,selection:selection.value},null,2)+'\n');
  const storeBefore=inventory(state.storeRoot),query=call(state,install,'query',state.queryRequest);
  assert.equal(query.value.status,'PARTIAL');assert.equal(query.value.metrics.source_body_loads,2);assert.ok(query.output_characters<=12000);
  assert.deepEqual(inventory(state.storeRoot),storeBefore);assert.deepEqual(inventory(state.sourceOwnerRoot),sourceBefore);
  assert.deepEqual(inventory(laneRoot),codeBefore);
  const denied=spawnSync(process.execPath,['--permission','--allow-fs-read='+laneRoot,'-e',
    'require("node:fs").readFileSync('+JSON.stringify(join(REPO_ROOT,'package.json'))+')'],{cwd:laneRoot,encoding:'utf8',windowsHide:true});
  assert.notEqual(denied.status,0);assert.match(denied.stderr,/ERR_ACCESS_DENIED/u);
  state.incumbent={generated:generated.value,selection:selection.value,query:query.value,sourceBefore,codeBefore};
  writeFileSync(join(scratch,'flow-state.json'),JSON.stringify(state,null,2)+'\n');
  return {scratch,state_ref:join(scratch,'flow-state.json'),status:'INSTALLED_UPDATE_QUERY_PASS',version:install.version,
    counts:generated.value.counts,query_digest:query.value.digest,facts:query.value.facts.map(f=>f.id),checkout_denied:true};
}

export async function installCandidate(stateRef,laneRoot){
  const state=json(stateRef),incumbent=state.binding.installs[0],candidate=describeInstallation(laneRoot,'relation-v2');
  assert.deepEqual(verifyLane(laneRoot).failures,[]);
  const candidateBefore=inventory(laneRoot);
  state.binding.installs.push(candidate);state.installs.push(candidate);
  // Test-owner admission of this exact new immutable installation. This changes
  // the binding pin, never the stable caller or incumbent code/data bytes.
  writeFileSync(join(state.storeRoot,'binding.json'),JSON.stringify(state.binding));state.bindingSha256=hash(Buffer.from(JSON.stringify(state.binding)));
  const before=call(state,incumbent,'query',state.queryRequest);assert.equal(before.value.digest,state.incumbent.query.digest);
  const generated=call(state,candidate,'update',updateRequest(state,candidate,'candidate-data'),{write:true});
  assert.equal(generated.value.status,'PREPARED');assert.equal(generated.value.counts.complete,4);
  const selection=call(state,incumbent,'select',selectRequest(state,candidate,generated.value),{write:true});
  assert.equal(selection.value.status,'COMMITTED');
  const query=call(state,incumbent,'query',state.queryRequest);assert.equal(query.value.status,'PARTIAL');
  assert.notDeepEqual(query.value.facts.map(f=>f.id),state.incumbent.query.facts.map(f=>f.id));
  assert.deepEqual(query.value.conflicts,state.incumbent.query.conflicts);
  assert.ok(query.output_characters<=state.queryRequest.budget.max_characters);
  const rollback=call(state,incumbent,'select',selectRequest(state,incumbent,state.incumbent.generated),{write:true});
  assert.equal(rollback.value.status,'COMMITTED');
  const replay=call(state,incumbent,'query',state.queryRequest);assert.equal(replay.value.digest,state.incumbent.query.digest);
  assert.deepEqual(inventory(incumbent.root),state.incumbent.codeBefore);assert.deepEqual(inventory(laneRoot),candidateBefore);
  assert.deepEqual(inventory(state.sourceOwnerRoot),state.incumbent.sourceBefore);
  // Revocation is current policy, not restored from a historical installation.
  const aclPath=state.binding.acl_path,aclBytes=readFileSync(aclPath),acl=JSON.parse(aclBytes);
  acl.revoked_actors.push(state.request.actor_ref);writeFileSync(aclPath,JSON.stringify(acl));
  const deniedRollback=call(state,incumbent,'select',selectRequest(state,incumbent,state.incumbent.generated),{write:true});
  const deniedQuery=call(state,incumbent,'query',state.queryRequest);
  assert.equal(deniedRollback.value.status,'HOLD_PRECOMMIT');assert.equal(deniedQuery.value.status,'NOT_AVAILABLE');
  writeFileSync(aclPath,aclBytes);
  state.candidate={generated:generated.value,selection:selection.value,query:query.value,rollback:rollback.value,replay:replay.value,
    rollback_after_revocation:deniedRollback.value,query_after_revocation:deniedQuery.value};
  state.stable_caller_sha256=incumbent.code_sha256;state.process_reload='fresh CLI process per call';
  writeFileSync(stateRef,JSON.stringify(state,null,2)+'\n');
  return {status:'INSTALLED_V1_V2_V1_PASS',state_ref:stateRef,versions:[incumbent.version,candidate.version,incumbent.version],
    first_facts:state.incumbent.query.facts.map(f=>f.id),candidate_facts:query.value.facts.map(f=>f.id),
    rollback_digest:replay.value.digest,stable_caller_sha256:incumbent.code_sha256,revoked_rollback:'HOLD_PRECOMMIT'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  const result=value('--phase')==='incumbent'?await installIncumbent(value('--install')):
    await installCandidate(value('--state'),value('--install'));
  process.stdout.write(JSON.stringify(result)+'\n');
}
