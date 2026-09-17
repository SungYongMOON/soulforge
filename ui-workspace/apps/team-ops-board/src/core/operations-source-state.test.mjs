import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceStore,sourceGroupState} from './operations-source-state.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('independent slow first loads stay loading until the required group is complete',async()=>{
  const a=deferred(),b=deferred(),store=createSourceStore({a:()=>a.promise,b:()=>b.promise},{delayMs:10000});
  const run=store.refresh();a.resolve({count:4});await store.retry('a');
  assert.equal(store.snapshot().sources.a.status,'success');
  assert.equal(sourceGroupState(store.snapshot().sources,['a','b']).initialPending,true);
  assert.equal(store.snapshot().progress.completed,1);b.resolve({count:5});await run;
  assert.equal(sourceGroupState(store.snapshot().sources,['a','b']).initialPending,false);
  assert.equal(store.snapshot().progress.completed,2);store.dispose();
});
test('refresh failure retains successful bytes and time; individual retry never reloads peers',async()=>{
  let time=1000,fail=false,aCalls=0,bCalls=0;
  const store=createSourceStore({a:async()=>{aCalls++;if(fail)throw Object.assign(new Error(),{code:'HTTP_503'});return {count:8};},b:async()=>{bCalls++;return {count:3};}},{now:()=>time});
  await store.refresh();const before=store.snapshot().sources.a;fail=true;time=2000;await store.retry('a');
  const error=store.snapshot().sources.a;assert.equal(error.status,'error');assert.deepEqual(error.value,before.value);assert.equal(error.lastSuccessAt,before.lastSuccessAt);assert.equal(error.failedAt,new Date(time).toISOString());assert.equal(bCalls,1);
  fail=false;time=3000;await store.retry('a');assert.equal(store.snapshot().sources.a.error,null);assert.equal(store.snapshot().sources.a.status,'success');assert.equal(aCalls,3);assert.equal(bCalls,1);store.dispose();
});
test('concurrent refresh requests share each source and delayed state is observable',async()=>{
  const a=deferred();let count=0;const store=createSourceStore({a:()=>{count++;return a.promise;}},{delayMs:1});
  const one=store.refresh(),two=store.retry('a');await new Promise(r=>setTimeout(r,5));
  assert.equal(count,1);assert.equal(store.snapshot().sources.a.slow,true);a.resolve({count:0});await Promise.all([one,two]);assert.equal(store.snapshot().sources.a.value.count,0);assert.equal(store.snapshot().sources.a.slow,false);store.dispose();
});
