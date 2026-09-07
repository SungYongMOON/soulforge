import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackRequestProvider} from './feedback_request_provider.mjs';

const item={source_ref:'linear.issue:synthetic',semantic_sha256:'a'.repeat(64),scope_ref:'project.synthetic'};
function fixture(){
  const value={request_ref:'request.synthetic',source_ref:item.source_ref,semantic_sha256:item.semantic_sha256,
    authority_ref:'authority.synthetic',authority_revision:'revision.one',valid_from:'2026-09-08T00:00:00.000Z',
    valid_until:'2026-09-08T01:00:00.000Z',packet:{schema_version:'soulforge.dev_worker_request.v0',task_id:'synthetic',
      status:'ready',summary:'Synthetic scoped repair',allowed_write_paths:['guild_hall/dev_worker/README.md'],
      acceptance_checks:['npm run validate:dev-worker'],origin:{kind:'agent_generated'},
      owner_approval:{required:true,approved:true,approved_by:'auto_policy:dev_worker_auto_approval_policy_v0'}}};
  const live={now:Date.parse('2026-09-08T00:30:00.000Z'),allowed:true,seen:[]};
  const options={resolveRequest:async()=>value,currentAuthority:async assertion=>{live.seen.push(assertion);return live.allowed;},now:()=>live.now};
  return{value,live,options,provider:createFeedbackRequestProvider(options)};
}

test('only exact currently issued packet gets prepared with independent source/scope/digest authority',async()=>{
  const f=fixture();const result=await f.provider.prepare(item);assert.equal(result.status,'READY');
  assert.match(result.packet_sha256,/^[a-f0-9]{64}$/u);assert.equal(f.live.seen[0].packet_sha256,result.packet_sha256);
  assert.equal(f.live.seen[0].scope_ref,item.scope_ref);assert.equal(f.live.seen[0].semantic_sha256,item.semantic_sha256);
  f.value.packet.summary='changed';assert.notEqual(result.packet.summary,f.value.packet.summary);
  assert.equal(await f.provider.authorize('execute',item,{packet_sha256:result.packet_sha256}),false);
});

test('packet self approval cannot replace revoked live authority or protected path checks',async()=>{
  const f=fixture();f.live.allowed=false;assert.equal(await f.provider.authorize('execute',item),false);
  f.live.allowed=true;f.value.packet.allowed_write_paths=['.'];
  await assert.rejects(f.provider.prepare(item),{feedbackCode:'FEEDBACK_PACKET_INELIGIBLE'});
});

test('expired, invalid date and changed-source requests fail closed',async()=>{
  for(const change of [f=>f.live.now=Date.parse(f.value.valid_until),f=>f.value.valid_until='not-a-date',
    f=>f.value.semantic_sha256='b'.repeat(64),f=>f.value.source_ref='linear.issue:other']){
    const f=fixture();change(f);assert.equal(await f.provider.authorize('prepare',item),false);
  }
});

test('expiry during authority IO is checked again before releasing a packet',async()=>{
  const f=fixture();const provider=createFeedbackRequestProvider({...f.options,currentAuthority:async()=>{
    f.live.now=Date.parse(f.value.valid_until);return true;}});
  await assert.rejects(provider.prepare(item),{feedbackCode:'FEEDBACK_REQUEST_AUTHORITY_CHANGED'});
});
