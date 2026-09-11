// Fault injection in copies/owned synthetic state; never modifies a valid install.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,cpSync,mkdirSync,renameSync } from 'node:fs';
import { join,dirname,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { call,currentRef,selectRequest } from './installed_generation_flow.mjs';
import { exactRefIdentityKey } from '../../engineering_engine/kernel/identity.mjs';

const stateRef=process.argv[2],state=JSON.parse(readFileSync(stateRef,'utf8'));
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const incumbent=state.binding.installs[0],candidate=state.binding.installs[1],observations=[];
const bindingPath=join(state.storeRoot,'binding.json'),originalBinding=readFileSync(bindingPath),originalPin=state.bindingSha256;
const currentPath=join(state.storeRoot,state.projectPath,'00_프로젝트_안내/current.json');
const originalCurrent=readFileSync(currentPath);
function record(name,result){observations.push({name,status:result.status});}
for(const fault of ['code','dependency','profile']){
  const copy=mkdtempSync(join(state.scratch,'fault-'+fault+'-'));cpSync(candidate.root,copy,{recursive:true,errorOnExist:false});
  const descriptor={...candidate,root:copy};
  const target=join(copy,fault==='code'?candidate.entry_path:fault==='profile'?candidate.config_path:'guild_hall/shared/project_history_envelope.mjs');
  assert.ok(resolve(target).startsWith(resolve(copy)+'\\')||resolve(target).startsWith(resolve(copy)+'/'));
  if(fault==='dependency')renameSync(target,target+'.held');else writeFileSync(target,Buffer.concat([readFileSync(target),Buffer.from('\n// fault\n')]));
  const binding=structuredClone(state.binding);binding.installs[1]=descriptor;
  const bytes=Buffer.from(JSON.stringify(binding));writeFileSync(bindingPath,bytes);
  const attempt={...state,binding,bindingSha256:hash(bytes)};
  const response=call(attempt,incumbent,'select',selectRequest(attempt,descriptor,state.candidate.generated),{write:true}).value;
  assert.equal(response.status,'HOLD_PRECOMMIT');assert.deepEqual(readFileSync(currentPath),originalCurrent);record('installation-'+fault,response);
  writeFileSync(bindingPath,originalBinding);
}
state.bindingSha256=originalPin;
const mismatch=call(state,incumbent,'select',selectRequest(state,candidate,state.incumbent.generated),{write:true}).value;
assert.equal(mismatch.status,'HOLD_PRECOMMIT');assert.deepEqual(readFileSync(currentPath),originalCurrent);record('valid-v2-code-with-valid-v1-index-schema',mismatch);
const foreign=structuredClone(state.queryRequest);foreign.project_ref.entity_id='00000000-0000-4000-8000-999999999999';
const denied=call(state,incumbent,'query',foreign).value;assert.equal(denied.status,'NOT_AVAILABLE');record('foreign-project-reader',denied);
for(const budget of [{max_characters:1200},{max_source_reads:0}]){
  const response=call(state,incumbent,'query',{...state.queryRequest,budget:{...state.queryRequest.budget,...budget}});
  assert.ok(response.output_characters<=(budget.max_characters||12000));
  assert.equal(response.value.metrics.source_body_loads,budget.max_source_reads===0?0:2);record('budget-'+Object.keys(budget)[0],response.value);
}
const manifest=JSON.parse(readFileSync(join(state.storeRoot,state.incumbent.generated.manifest_ref),'utf8'));
const index=manifest.assets.find(a=>a.id==='index:project'),indexPath=join(state.storeRoot,index.path),indexBytes=readFileSync(indexPath);
try{
  writeFileSync(indexPath,Buffer.from('{"partial":'));
  const response=call(state,incumbent,'query',state.queryRequest).value;assert.equal(response.status,'NOT_AVAILABLE');record('partial-current-index-damage',response);
}finally{writeFileSync(indexPath,indexBytes);}
const aclPath=state.binding.acl_path,aclBytes=readFileSync(aclPath),acl=JSON.parse(aclBytes);
try{
  const accepted=JSON.parse(readFileSync(state.binding.accepted_snapshot.path,'utf8'));
  acl.revoked_generations.push(exactRefIdentityKey(accepted.accepted_bundle.manifest.accepted_generation_ref));writeFileSync(aclPath,JSON.stringify(acl));
  const response=call(state,incumbent,'query',state.queryRequest).value;assert.equal(response.status,'NOT_AVAILABLE');record('accepted-generation-revocation',response);
}finally{writeFileSync(aclPath,aclBytes);}
assert.deepEqual(readFileSync(currentPath),originalCurrent);
const final=call(state,incumbent,'query',state.queryRequest).value;assert.equal(final.digest,state.incumbent.query.digest);
const receipt={status:'PASS',checks:observations.length,observations,restored_incumbent_digest:final.digest,
  immutable_installs_modified:false,source_or_acceptance_bytes_modified:false,
  test_faults:'Copies of installs; temporary owned index/ACL injection restored byte-for-byte.'};
writeFileSync(join(state.scratch,'installed-negative.receipt.json'),JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify(receipt)+'\n');
