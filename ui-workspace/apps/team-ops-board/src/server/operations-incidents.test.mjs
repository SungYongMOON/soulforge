import test from 'node:test';import assert from 'node:assert/strict';
import {projectForwarderCycle} from './operations-incidents.mjs';
const now=Date.parse('2026-09-16T08:00:00Z'),cycle={action:'cycle',observed_at:'2026-09-16T07:59:00Z',collector_status:'ok',held_count:0,failed_count:0,deferred_count:0,tracked_failure_count:1};
const failures=[{failure_class:'error_proto',failure_count:4,last_attempt_at:'2026-09-04T06:15:00Z',secret:'must-not-surface'}];
test('historical failures are distinguished from current-cycle held messages without declaring delivery success',()=>{
  const r=projectForwarderCycle(cycle,failures,now);assert.equal(r.history_only,true);assert.equal(r.active_held,0);assert.equal(r.tracked,1);assert.equal(JSON.stringify(r).includes('must-not'),false);assert.equal('delivered' in r,false);
});
test('active, stale, inconsistent or malformed evidence cannot clear an active hold',()=>{
  for(const delta of [{held_count:1},{failed_count:1},{deferred_count:1},{tracked_failure_count:2},{collector_status:'failed'}])assert.equal(projectForwarderCycle({...cycle,...delta},failures,now).history_only,false);
  assert.equal(projectForwarderCycle(cycle,failures,now+900000),null);assert.equal(projectForwarderCycle(cycle,[{}],now).history_only,false);
});
