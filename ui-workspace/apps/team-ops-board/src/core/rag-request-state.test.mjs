import test from 'node:test';import assert from 'node:assert/strict';
import {isRagOverview,startRagRequest,finishRagRequest,failRagRequest} from './rag-request-state.mjs';
test('RAG invalid envelopes never become a successful overview',()=>{
  assert.equal(isRagOverview({state:'ready',projects:[{project:'P00-001'}]}),true);
  for(const value of [null,{state:'unavailable'},{state:'ready'},{state:'ready',projects:[{id:'wrong'}]}])assert.equal(isRagOverview(value),false);
});
test('RAG loading and failed detail retain exact project data and last successful timestamp',()=>{
  const data={state:'ready',project:'P00-001',documents:[{id:'one'}]},before=finishRagRequest(null,data,'P00-001','2026-09-17T01:00:00Z');
  const loading=startRagRequest(before);assert.equal(loading.data,data);assert.equal(loading.status,'loading');
  const failed=failRagRequest(loading,'read_failed','2026-09-17T02:00:00Z');assert.equal(failed.data,data);assert.equal(failed.observed_at,before.observed_at);assert.equal(failed.failedAt,'2026-09-17T02:00:00Z');
  const wrong=finishRagRequest(before,{...data,project:'P00-002'},'P00-001','later');assert.equal(wrong.status,'error');assert.equal(wrong.data,data);
  assert.equal(startRagRequest(undefined).data,null);
});
