import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createFeedbackWatchdog, inspectFeedbackHealth, readFeedbackWatchState } from './feedback_watchdog.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';

function fixture(t, notify) {
  const db = new DatabaseSync(':memory:');t.after(()=>db.close());
  const state = {now:Date.parse('2026-09-08T00:00:00Z'),data:{last_tick:'2026-09-08T00:00:00Z',runs:[]},sent:[]};
  const options = {db,readState:async()=>state.data,now:()=>state.now,notifyManager:async packet=>{
    state.sent.push(packet);return notify ? notify(packet) : {status:'delivered',receipt_ref:'receipt.synthetic'};
  }};
  return{db,state,options,watchdog:createFeedbackWatchdog(options)};
}

test('initial health is quiet; stalled worker is reported once and recovery once',async t=>{
  const f=fixture(t);await f.watchdog.watchOnce();assert.equal(f.state.sent.length,0);
  f.state.now+=180_001;assert.equal((await f.watchdog.watchOnce()).status,'TICK_STALE');
  await f.watchdog.watchOnce();assert.equal(f.state.sent.length,1);
  const restarted=createFeedbackWatchdog(f.options);await restarted.watchOnce();assert.equal(f.state.sent.length,1);
  f.state.data.last_tick=new Date(f.state.now).toISOString();await restarted.watchOnce();
  assert.equal(f.state.sent.length,2);assert.equal(f.state.sent[1].status,'HEALTHY');
  assert.equal(f.state.sent[0].owner_decision_required,false);
});

test('unknown or expired execution overrides a fresh cycle poll',async t=>{
  const f=fixture(t);f.state.data.runs=[{run_ref:'run.one',state:'running',deadline_at:'2026-09-07T23:59:59Z'}];
  assert.equal((await f.watchdog.watchOnce()).status,'EXECUTION_OVERDUE');
  f.state.data.runs[0].state='execution_unknown';assert.equal((await f.watchdog.watchOnce()).status,'EXECUTION_UNKNOWN');
  assert.deepEqual(f.state.sent.map(x=>x.run_refs),[['run.one'],['run.one']]);
});

test('concurrent and restarted watchers do not resend an uncertain notice',async t=>{
  let finish;const f=fixture(t,()=>new Promise(resolve=>{finish=resolve;}));f.state.data.last_tick=null;
  const pending=f.watchdog.watchOnce();while(!finish)await new Promise(resolve=>setTimeout(resolve,1));
  const other=createFeedbackWatchdog(f.options);await other.watchOnce();assert.equal(f.state.sent.length,1);
  finish({});assert.equal((await pending).notification,'DELIVERY_UNKNOWN');
  f.state.now+=600_000;await other.watchOnce();assert.equal(f.state.sent.length,1);
});

test('confirmed not-sent gets bounded delayed retries with one stable notice reference',async t=>{
  const f=fixture(t,()=>({status:'not_sent'}));f.state.data.last_tick=null;
  await f.watchdog.watchOnce();await f.watchdog.watchOnce();assert.equal(f.state.sent.length,1);
  for(let i=0;i<4;i++){f.state.now+=60_001;await f.watchdog.watchOnce();}
  assert.equal(f.state.sent.length,3);assert.equal(new Set(f.state.sent.map(x=>x.notice_ref)).size,1);
});

test('invalid or unavailable state cannot look healthy and does not leak arbitrary text',async t=>{
  const f=fixture(t);f.state.data={last_tick:'bad private body',runs:[]};
  const result=await f.watchdog.watchOnce();assert.equal(result.status,'SOURCE_UNAVAILABLE');
  assert.equal(JSON.stringify(f.state.sent).includes('bad private body'),false);
  assert.equal(inspectFeedbackHealth({last_tick:null,runs:[]}).status,'NEVER_STARTED');
  assert.equal(inspectFeedbackHealth({last_tick:'2026-09-08T00:00:00Z',runs:[{state:'pretend_done'}]}).status,'SOURCE_UNAVAILABLE');
});

test('stalled reader or notification cannot hang the independent watcher or trigger resend',async t=>{
  const f=fixture(t);const reader=createFeedbackWatchdog({...f.options,portTimeoutMs:20,readState:async()=>new Promise(()=>{})});
  assert.equal((await reader.watchOnce()).status,'SOURCE_UNAVAILABLE');
  f.state.data.last_tick=null;
  const sender=createFeedbackWatchdog({...f.options,portTimeoutMs:20,notifyManager:async()=>new Promise(()=>{})});
  assert.equal((await sender.watchOnce()).notification,'DELIVERY_UNKNOWN');
  assert.equal((await sender.watchOnce()).notification,'UNCHANGED_OR_HELD');
});

test('independent read-only DB observes a stopped worker without constructing or renewing it',async t=>{
  const root=mkdtempSync(join(tmpdir(),'feedback-watch-read-'));let writer,reader;
  t.after(()=>{reader?.close();writer?.close();assert.equal(dirname(resolve(root)),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});
  const file=join(root,'worker.sqlite');writer=new DatabaseSync(file);
  writer.exec("CREATE TABLE dev_feedback_clock(id INTEGER,last_tick TEXT);CREATE TABLE dev_feedback_run(run_ref TEXT,state TEXT,deadline_at TEXT,started_at TEXT);");
  writer.prepare('INSERT INTO dev_feedback_clock VALUES(1,?)').run('2026-09-08T00:00:00Z');
  writer.prepare('INSERT INTO dev_feedback_run VALUES(?,?,?,?)').run('run.independent','execution_unknown','2026-09-08T00:01:00Z','2026-09-08T00:00:00Z');
  writer.close();writer=null;reader=new DatabaseSync(file,{readOnly:true});
  const state=readFeedbackWatchState(reader);assert.equal(state.last_tick,'2026-09-08T00:00:00Z');
  assert.equal(inspectFeedbackHealth(state,{now:Date.parse('2026-09-08T00:02:00Z')}).status,'EXECUTION_UNKNOWN');
  assert.equal(reader.prepare('SELECT last_tick FROM dev_feedback_clock').get().last_tick,state.last_tick);
});
