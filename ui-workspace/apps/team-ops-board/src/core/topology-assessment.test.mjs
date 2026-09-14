import test from 'node:test';
import assert from 'node:assert/strict';
import {assessTopologyObservation,summariseTopologyAssessments} from './topology-view.mjs';
test('read failure, actual problem signal, pending work and no evidence are distinct',()=>{
  const health=[{state:'down',reasons:['source_too_large']},{state:'down',reasons:['task_disabled']},{state:'ok',activity_state:'held',activity_count:4},{state:'unmonitored'},{state:'ok'}];
  assert.deepEqual(health.map(h=>assessTopologyObservation(h).key),['observation_error','problem','pending','unknown','ok']);
  assert.doesNotMatch(assessTopologyObservation(health[0]).label,/정지|중단/);
  assert.deepEqual(summariseTopologyAssessments(health.map(health=>({health}))),{ok:1,problem:1,pending:1,observation_error:1,unknown:1,pendingItems:4,pendingItemsUnknown:false});
});
