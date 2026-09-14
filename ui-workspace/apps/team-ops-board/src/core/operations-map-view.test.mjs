import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationsMap, stageConnections } from './operations-map-view.mjs';
test('missing observations never become healthy or zero work; unsupported links stay absent',()=>{
  const model=buildOperationsMap(); assert.equal(model.sourceAvailable,false);
  assert.ok(model.nodes.every(n=>n.health==='unknown' && n.observedAt===null));
  const links=stageConnections(model); assert.ok(links.some(e=>e.source==='extract' && e.target==='graph'));
  assert.ok(!links.some(e=>e.source==='custody' && e.target==='prepare'));
  assert.ok(!links.some(e=>e.source==='context' && e.target==='response'));
  assert.ok(links.every(e=>e.observed===false));
  assert.equal(new Set(model.nodes.map(n=>n.id)).size,model.nodes.length);
});
