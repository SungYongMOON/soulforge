import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerAttentionLoader } from '../src/owner_attention_load.mjs';
function fixture() {
  const pending=[],events=[];
  const loader=createOwnerAttentionLoader({read:signal=>new Promise((resolve,reject)=>pending.push({resolve,reject,signal})),
    valid:d=>d?.status==='available',loading:()=>events.push('loading'),available:d=>events.push(d.id),unavailable:()=>events.push('unknown'),settled:()=>events.push('settled')});
  return {loader,pending,events};
}
test('a late old result or failure cannot overwrite a newer successful response',async()=>{
  for(const late of ['resolve','reject']){
    const f=fixture(),a=f.loader.refresh(),b=f.loader.refresh();
    assert.equal(f.pending[0].signal.aborted,true);
    f.pending[1].resolve({status:'available',id:'new'});await b;
    if(late==='resolve')f.pending[0].resolve({status:'available',id:'old'});else f.pending[0].reject(new Error('old failure'));
    await a;assert.deepEqual(f.events,['loading','loading','new','settled']);
  }
});
test('fresh failed or invalid refresh replaces a prior healthy snapshot with unknown',async()=>{
  for(const kind of ['reject','invalid']){
    const f=fixture();let run=f.loader.refresh();f.pending[0].resolve({status:'available',id:'first'});await run;
    run=f.loader.refresh();if(kind==='reject')f.pending[1].reject(new Error('HTTP failure'));else f.pending[1].resolve({status:'available-ish'});await run;
    assert.deepEqual(f.events,['loading','first','settled','loading','unknown','settled']);
  }
});
test('page disposal or mutation invalidates pending reads without late callbacks',async()=>{
  for(const stop of ['close','invalidate']){
    const f=fixture(),run=f.loader.refresh();f.loader[stop]();f.pending[0].resolve({status:'available',id:'stale'});await run;
    assert.deepEqual(f.events,['loading']);assert.equal(f.pending[0].signal.aborted,true);
    if(stop==='close'){await f.loader.refresh();assert.equal(f.pending.length,1);}
  }
});
