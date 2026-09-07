import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createFeedbackCycle } from './feedback_cycle.mjs';
import { createFeedbackRequestProvider } from './feedback_request_provider.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const item = (key='one',revision='1') => ({source_ref:`linear.synthetic.${key}`,semantic_sha256:digest([key,revision]),
  source_revision:`revision.${revision}`,scope_ref:'product.soulforge',kind:'bug'});
function context(t, options={}) {
  const db = options.db ?? new DatabaseSync(':memory:');
  if (!options.db) t.after(()=>db.close());
  const state={items:[item()],calls:[],allowed:true};
  const source={snapshot:async()=>({status:'CURRENT',snapshot_ref:'snapshot.synthetic',items:state.items}),
    current:async(ref,sha)=>state.items.some(row=>row.source_ref===ref&&row.semantic_sha256===sha)};
  const packet={schema_version:'soulforge.dev_worker_request.v0',task_id:'synthetic_fix',status:'ready',
    summary:'A bounded public synthetic fix',allowed_write_paths:['guild_hall/dev_worker/README.md'],
    acceptance_checks:['npm run validate:dev-worker'],origin:{kind:'agent_generated'},
    owner_approval:{required:true,approved:true,approved_by:'auto_policy:dev_worker_auto_approval_policy_v0'}};
  const defaults={db,source,authorize:async()=>state.allowed,
    prepare:async()=>{state.calls.push('prepare');return{status:'READY',packet,packet_sha256:digest(packet)};},
    execute:async()=>{state.calls.push('execute');return{candidate_ref:'candidate.synthetic'};},
    validate:async()=>{state.calls.push('validate');return{status:'PASS',validation_ref:'validation.synthetic'};},
    review:async()=>{state.calls.push('review');return{status:'ACCEPT',review_ref:'review.synthetic'};},
    report:async()=>{state.calls.push('report');return{report_ref:'report.synthetic'};}};
  const cycle=createFeedbackCycle({...defaults,...options.ports});
  return {db,state,packet,source,defaults,cycle};
}

test('one explicit revision runs prepare, worker, checks, fresh review and result report once', async t=>{
  const f=context(t); const result=await f.cycle.runOnce();
  assert.equal(result.status,'CANDIDATE_REPORTED'); assert.equal(result.official_done,false);
  assert.deepEqual(f.state.calls,['prepare','execute','validate','review','report']);
  f.state.items[0].source_revision='new-poll-with-same-meaning';
  assert.equal((await f.cycle.runOnce()).status,'NO_CHANGE'); assert.equal(f.state.calls.length,5);
  const saved=f.cycle.state(); assert.equal(saved.runs.length,1); assert.equal(saved.canonical_accepted,false);
  assert.equal(JSON.stringify(saved).includes('A bounded public synthetic fix'),false);
});

test('closed/reopened control database preserves dedupe without rewriting project metadata', async t=>{
  const root=mkdtempSync(join(tmpdir(),'feedback-cycle-')); let first,second;
  t.after(()=>{ first?.close(); second?.close(); rmSync(root,{recursive:true,force:true}); });
  const path=join(root,'control.sqlite'); first=new DatabaseSync(path); const f=context(t,{db:first});
  assert.equal((await f.cycle.runOnce()).status,'CANDIDATE_REPORTED'); first.close(); first=null;
  second=new DatabaseSync(path); const resumed=context(t,{db:second});
  assert.equal((await resumed.cycle.runOnce()).status,'NO_CHANGE'); assert.deepEqual(resumed.state.calls,[]);
});

test('own exact application echo never becomes another development request', async t=>{
  const f=context(t);const echo=item('echo');f.state.items=[echo];
  f.cycle.recordEcho({...echo,report_ref:'report.own'});
  assert.equal((await f.cycle.runOnce()).status,'NO_CHANGE');assert.deepEqual(f.state.calls,[]);
  f.state.items=[item('echo','2')];assert.equal((await f.cycle.runOnce()).status,'CANDIDATE_REPORTED');
});

test('a new meaningful revision is separate; an unchanged failure is not retried', async t=>{
  const f=context(t,{ports:{validate:async()=>({status:'FAIL',validation_ref:'validation.failed'})}});
  assert.equal((await f.cycle.runOnce()).status,'HELD_INTERNAL');assert.deepEqual(f.state.calls,['prepare','execute']);
  assert.equal((await f.cycle.runOnce()).status,'NO_CHANGE');
  f.state.items=[item('one','2')];assert.equal((await f.cycle.runOnce()).status,'HELD_INTERNAL');
  assert.equal(f.cycle.state().revisions.length,2);assert.equal(f.cycle.state().revisions[0].current,0);
});

test('source/current authority changes stop later stages and cannot report a candidate', async t=>{
  const f=context(t);const changed=createFeedbackCycle({...f.defaults,execute:async()=>{
    f.state.items=[item('one','2')];return{candidate_ref:'candidate.old'};}});
  assert.equal((await changed.runOnce()).status,'HELD_INTERNAL');assert.deepEqual(f.state.calls,['prepare']);
  const denied=context(t);denied.state.allowed=false;
  await assert.rejects(denied.cycle.runOnce(),{feedbackCode:'FEEDBACK_AUTHORITY_OR_SOURCE_CHANGED'});
  assert.equal(denied.cycle.state().runs.length,0);
});

test('daily budget prevents additional worker calls and a blocked review cannot report', async t=>{
  const f=context(t,{ports:{maxRunsPerDay:1}});f.state.items=[item(),item('two')];
  assert.equal((await f.cycle.runOnce()).status,'CANDIDATE_REPORTED');
  assert.equal((await f.cycle.runOnce()).status,'BUDGET_EXHAUSTED');assert.equal(f.state.calls.length,5);
  const reviewHeld=context(t,{ports:{review:async()=>({status:'REVISE',review_ref:'review.needs-work'})}});
  assert.equal((await reviewHeld.cycle.runOnce()).status,'HELD_INTERNAL');assert.equal(reviewHeld.state.calls.includes('report'),false);
});

test('concurrent ticks share one in-process run and the DB claim blocks another controller', async t=>{
  let release;const wait=new Promise(resolve=>{release=resolve;});
  const f=context(t,{ports:{execute:async()=>{await wait;return{candidate_ref:'candidate.once'};}}});
  const a=f.cycle.runOnce(), b=f.cycle.runOnce();assert.equal(a,b);
  while(!f.cycle.state().runs.length)await new Promise(resolve=>setTimeout(resolve,2));
  const other=createFeedbackCycle(f.defaults);assert.equal((await other.runOnce()).status,'BUSY');
  release();assert.equal((await a).status,'CANDIDATE_REPORTED');assert.equal(f.cycle.state().runs.length,1);
});

test('stop during an uncertain worker prevents automatic retry and requires independent recovery proof', async t=>{
  let now=Date.now();const f=context(t,{ports:{now:()=>now,execute:async()=>new Promise(()=>{})}});
  const running=f.cycle.runOnce();while(!f.cycle.state().runs.length)await new Promise(resolve=>setTimeout(resolve,2));
  await new Promise(resolve=>setTimeout(resolve,2));
  await f.cycle.stop();assert.equal((await running).status,'EXECUTION_UNKNOWN');
  const resumed=createFeedbackCycle({...f.defaults,now:()=>now});
  assert.equal((await resumed.runOnce()).status,'RECOVERY_REQUIRED');
  const run=f.cycle.state().runs[0];now=Date.parse(run.deadline_at)+1;
  await assert.rejects(resumed.recover(run.run_ref),{feedbackCode:'FEEDBACK_RECOVERY_UNAVAILABLE'});
  const recovered=createFeedbackCycle({...f.defaults,now:()=>now,verifyRecovery:async value=>({run_ref:value.run_ref,stopped:true,receipt_ref:'recovery.inspected'})});
  assert.equal((await recovered.recover(run.run_ref)).status,'RECOVERED_FOR_INTERNAL_REVIEW');
  assert.equal((await recovered.runOnce()).status,'NO_CHANGE');
});

test('worker packets still pass the existing scope/approval gate before any execution', async t=>{
  const f=context(t);f.packet.allowed_write_paths=['guild_hall/dev_worker/**'];
  const result=await f.cycle.runOnce();assert.equal(result.reason,'FEEDBACK_PACKET_INELIGIBLE');
  assert.deepEqual(f.state.calls,['prepare']);
});

test('continuous repair cannot authorize changing its own supervisor or execution policy',async t=>{
  for(const name of ['feedback_cycle','feedback_linear_source','feedback_request_provider','feedback_worktree_runner','feedback_watchdog','feedback_polling']){
    const f=context(t);f.packet.allowed_write_paths=[`guild_hall/dev_worker/${name}.mjs`];
    assert.equal((await f.cycle.runOnce()).reason,'FEEDBACK_PACKET_INELIGIBLE');assert.deepEqual(f.state.calls,['prepare']);
  }
});

test('reappearing earlier meaning becomes current without duplicate execution and missing refs retire', async t=>{
  const f=context(t);await f.cycle.runOnce();f.state.items=[item('one','2')];await f.cycle.runOnce();
  f.state.items=[item()];assert.equal((await f.cycle.runOnce()).status,'NO_CHANGE');
  let rows=f.cycle.state().revisions;assert.equal(rows[0].current,1);assert.equal(rows[1].current,0);
  f.state.items=[];await f.cycle.runOnce();rows=f.cycle.state().revisions;
  assert.equal(rows.filter(row=>row.current).length,0);assert.equal(f.cycle.state().runs.length,2);
});

test('invalid worker outcome and uncertain report cannot become a safe retry', async t=>{
  const f=context(t,{ports:{execute:async()=>({})}});
  assert.equal((await f.cycle.runOnce()).status,'EXECUTION_UNKNOWN');
  const g=context(t,{ports:{report:async()=>({})}});
  assert.equal((await g.cycle.runOnce()).status,'EXECUTION_UNKNOWN');
});

test('packet returned by preparation cannot be changed behind later stages', async t=>{
  const f=context(t);const original=digest(f.packet);
  const cycle=createFeedbackCycle({...f.defaults,execute:async()=>{
    f.packet.allowed_write_paths=['.'];return{candidate_ref:'candidate.synthetic'};
  },validate:async(_candidate,packet)=>{
    assert.equal(digest(packet),original);assert.throws(()=>packet.allowed_write_paths.push('.'),TypeError);
    return{status:'PASS',validation_ref:'validation.synthetic'};
  }});
  assert.equal((await cycle.runOnce()).status,'CANDIDATE_REPORTED');
});

test('internal retry requires current independent cleanup proof and enforces revision attempts', async t=>{
  const f=context(t,{ports:{validate:async()=>({status:'FAIL'}),verifyRetry:async run=>({
    run_ref:run.run_ref,stopped:true,side_effects_resolved:true,receipt_ref:'retry.inspected'})}});
  const first=await f.cycle.runOnce();assert.equal(first.status,'HELD_INTERNAL');
  assert.equal((await f.cycle.retry(first.run_ref)).status,'REQUEUED');
  assert.equal((await f.cycle.runOnce()).status,'HELD_INTERNAL');
  const second=f.cycle.state().runs.find(row=>row.run_ref!==first.run_ref);
  await assert.rejects(f.cycle.retry(second.run_ref),{feedbackCode:'FEEDBACK_RETRY_NOT_ELIGIBLE'});
  assert.equal(f.cycle.state().runs.length,2);
});

test('retry proof loses authority while awaited and cannot reopen work', async t=>{
  const f=context(t,{ports:{validate:async()=>({status:'FAIL'})}});
  const first=await f.cycle.runOnce();const cycle=createFeedbackCycle({...f.defaults,verifyRetry:async run=>{
    f.state.allowed=false;return{run_ref:run.run_ref,stopped:true,side_effects_resolved:true,receipt_ref:'retry.inspected'};
  }});
  await assert.rejects(cycle.retry(first.run_ref),{feedbackCode:'FEEDBACK_AUTHORITY_OR_SOURCE_CHANGED'});
  assert.equal(cycle.state().revisions[0].status,'held_internal');
});

test('actual short child abort stays unknown until independently observed closed', async t=>{
  let child, closed=false, readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
  let time=Date.now();const f=context(t,{ports:{now:()=>time,execute:async(_packet,{signal})=>{
    child=spawn(process.execPath,['-e','process.stdout.write("ready");setInterval(()=>{},1000)'],{
      env:{},stdio:['ignore','pipe','ignore'],windowsHide:true});
    signal.addEventListener('abort',()=>child.kill(),{once:true});
    child.stdout.once('data',readyResolve);
    return new Promise((resolve,reject)=>{
      child.once('error',reject);child.once('close',()=>{closed=true;resolve({candidate_ref:'candidate.late'});});
    });
  }}});
  t.after(()=>{if(child&&!closed)child.kill();});
  const running=f.cycle.runOnce();await ready;await f.cycle.stop();
  const result=await running;assert.equal(result.status,'EXECUTION_UNKNOWN');
  if(!closed)await new Promise(resolve=>child.once('close',resolve));
  assert.equal(closed,true);assert.equal(f.cycle.state().runs[0].candidate_ref,null);
  time=Date.parse(f.cycle.state().runs[0].deadline_at)+1;
  const recovered=createFeedbackCycle({...f.defaults,now:()=>time,verifyRecovery:async run=>({
    run_ref:run.run_ref,stopped:closed,receipt_ref:'recovery.actual-child-closed'})});
  assert.equal((await recovered.recover(result.run_ref)).status,'RECOVERED_FOR_INTERNAL_REVIEW');
  assert.equal((await recovered.runOnce()).status,'NO_CHANGE');
});

test('every post-prepare stage receives exact packet hash for live authority comparison',async t=>{
  const seen=[];const f=context(t,{ports:{authorize:async(action,_item,context)=>{
    seen.push({action,...context});return true;
  }}});const result=await f.cycle.runOnce();
  assert.equal(result.status,'CANDIDATE_REPORTED');
  for(const stage of ['execute','validate','review','report','record_result']){
    const check=seen.find(row=>row.action===stage);assert.equal(check.packet_sha256,result.packet_sha256);assert.equal(check.run_ref,result.run_ref);
  }
});

test('unknown execution recovery composes with exact issued-request authority and preserves scope',async t=>{
  let time=Date.now();const f=context(t);const current=item();
  const issued={request_ref:'request.recovery',source_ref:current.source_ref,semantic_sha256:current.semantic_sha256,
    authority_ref:'authority.recovery',authority_revision:'revision.one',valid_from:new Date(time-1000).toISOString(),
    valid_until:new Date(time+3_600_000).toISOString(),packet:f.packet};
  const observed=[];const provider=createFeedbackRequestProvider({resolveRequest:async()=>issued,now:()=>time,
    currentAuthority:async assertion=>{observed.push(assertion);return assertion.scope_ref===current.scope_ref;}});
  const cycle=createFeedbackCycle({...f.defaults,now:()=>time,prepare:provider.prepare,authorize:provider.authorize,
    execute:async()=>{throw Error('synthetic unknown');},verifyRecovery:async run=>({
      run_ref:run.run_ref,stopped:true,receipt_ref:'recovery.verified-stopped'})});
  const first=await cycle.runOnce();assert.equal(first.status,'EXECUTION_UNKNOWN');
  time=Date.parse(cycle.state().runs[0].deadline_at)+1;
  assert.equal((await cycle.recover(first.run_ref)).status,'RECOVERED_FOR_INTERNAL_REVIEW');
  assert.ok(observed.every(assertion=>assertion.scope_ref===current.scope_ref));
  assert.equal((await cycle.runOnce()).status,'NO_CHANGE');
});
