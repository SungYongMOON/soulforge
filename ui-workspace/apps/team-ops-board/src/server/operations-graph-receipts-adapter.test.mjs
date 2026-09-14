import test from 'node:test';
import assert from 'node:assert/strict';
import { projectGraphReceipt } from './operations-graph-receipts-adapter.mjs';
const now=Date.parse('2026-09-14T09:00:00Z');
const receipt={schema_version:'soulforge.context_graph_sync_receipt.v1',project_code:'P00-001',ran_at:'2026-09-14T08:59:00Z',dry:false,status:'SYNCED',
  database:{agrees_with_generation:true},completed:{items:12,verified_by:'database read-back of chunk and node counts'},
  totals:{completed:12,pending:0,failed:1,last_reflected_at:'2026-09-14T08:58:00Z'},binding:{raw:'must not escape'},pending:[{body:'must not escape'}]};
test('only metadata fields are projected and action success alone never verifies database',()=>{
  const good=projectGraphReceipt(receipt,'P00-001',now); assert.equal(good.completed,12);assert.equal(good.verified,true);
  assert.equal(JSON.stringify(good).includes('must not escape'),false);
  const bad=projectGraphReceipt({...receipt,database:{agrees_with_generation:false}},'P00-001',now);
  assert.equal(bad.verified,false);assert.equal(bad.completed,null);
  assert.equal(projectGraphReceipt({...receipt,dry:true},'P00-001',now),null);
  assert.equal(projectGraphReceipt(receipt,'P00-002',now),null);
  assert.equal(projectGraphReceipt(receipt,'P00-001',now+46*60_000).freshness,'stale');
});
