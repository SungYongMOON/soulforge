import test from 'node:test';import assert from 'node:assert/strict';
import {observedTotal,ragOverview} from './operations-overview-view.mjs';
test('partial project counts stay lower bounds; unknown is never a successful zero',()=>{
  assert.deepEqual(observedTotal([{n:0},{n:null}],r=>r.n),{value:0,known:1,expected:2,complete:false});
  assert.equal(observedTotal([],r=>r.n,11).value,null);
  const r=ragOverview({expected:2,projects:[{comparison:'counts_match',database:{chunks:3,embedded_chunks:2,unembedded_chunks:1},preparation:{state:'unavailable',counts:{prepared:9}}}]});
  assert.equal(r.chunks.value,3);assert.equal(r.chunks.complete,false);assert.equal(r.prepared.value,null);assert.equal(r.pending.value,null);
});
test('local model metrics describe recorded generation work, not host/global usage',()=>{
  const r=ragOverview({expected:1,projects:[{store:{model:{extractor:'extract:1',embedder:'embed:1'},llm:{calls:3,prompt_tokens:100,output_tokens:20,errors:0,embedder_calls:2},embedding:{calls:null}}}]});
  assert.equal(r.models[0].prompt.value,100);assert.equal(r.models[1].calls.value,2);assert.equal(r.models[1].prompt.value,null);assert.equal('host' in r.models[0],false);
});
