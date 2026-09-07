import test from 'node:test';
import assert from 'node:assert/strict';
import {startFeedbackPolling} from './feedback_polling.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function clock(){let next=1;const timers=new Map();return{timers,setTimer:fn=>{const id=next++;timers.set(id,fn);return id;},
  clearTimer:id=>timers.delete(id),advance:()=>{const entry=timers.entries().next().value;assert.ok(entry);timers.delete(entry[0]);entry[1]();}};}

test('serial fixed-delay polling never overlaps work and shuts down its timer',async()=>{
  const time=clock();let calls=0,release;const statuses=[];
  const poll=startFeedbackPolling({...time,runOnce:()=>{calls++;return new Promise(resolve=>{release=resolve;});},onStatus:s=>statuses.push(s)});
  assert.equal(calls,1);assert.equal(time.timers.size,0);
  release({status:'NO_CHANGE',private_body:'not emitted'});await flush();
  assert.equal(time.timers.size,1);time.advance();assert.equal(calls,2);assert.equal(time.timers.size,0);
  const stopped=poll.stop({stopActive:()=>release({status:'STOPPED'})});await stopped;
  assert.equal(time.timers.size,0);assert.equal(JSON.stringify(statuses).includes('not emitted'),false);
});

test('failed read and failed telemetry still schedule the next poll without model calls',async()=>{
  const time=clock();let polls=0;const poll=startFeedbackPolling({...time,runOnce:async()=>{
    polls++;if(polls===1)throw Error('private failure details');return{status:'NO_CHANGE'};
  },onStatus:()=>{throw Error('telemetry offline');}});
  await flush();assert.equal(poll.state().last_status,'SOURCE_UNAVAILABLE');
  for(let i=0;i<5;i++){time.advance();await flush();}
  assert.equal(polls,6);assert.equal(poll.state().last_status,'NO_CHANGE');await poll.stop();
  assert.equal(time.timers.size,0);
});
