import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationsMap, stageConnections, directConnections, architectureScene } from './operations-map-view.mjs';
test('missing observations never become healthy or zero work; unsupported links stay absent',()=>{
  const model=buildOperationsMap(); assert.equal(model.sourceAvailable,false);
  assert.ok(model.nodes.every(n=>n.health==='unknown' && n.observedAt===null));
  const links=stageConnections(model); assert.ok(links.some(e=>e.source==='extract' && e.target==='graph'));
  assert.ok(!links.some(e=>e.source==='custody' && e.target==='prepare'));
  assert.ok(!links.some(e=>e.source==='context' && e.target==='response'));
  assert.ok(links.every(e=>e.observed===false));
  assert.equal(new Set(model.nodes.map(n=>n.id)).size,model.nodes.length);
});
test('selection reveals exact incoming and outgoing edges only', () => {
  const model=buildOperationsMap();
  const focus=directConnections(model,'context_engine::neo4j');
  assert.deepEqual(focus.incoming.map(r=>r.node.id),['context_engine::extract']);
  assert.deepEqual(focus.outgoing.map(r=>r.node.id),['context_engine::search']);
  assert.deepEqual(directConnections(model,'not-registered'),{incoming:[],outgoing:[]});
});
test('architecture scene has actual nodes and source edges, not inferred stage bridges',()=>{
  const model=buildOperationsMap();const scene=architectureScene(model);
  assert.equal(scene.nodes.find(n=>n.id==='context_engine::neo4j').shape,'store');
  assert.equal(scene.nodes.find(n=>n.id==='context_engine::compose').shape,'agent');
  assert.ok(scene.edges.every(e=>model.edges.some(source=>source.id===e.id&&source.from===e.from&&source.to===e.to)));
  assert.equal(scene.edges.some(e=>e.to==='operations::response_agent'),false);
  assert.equal(new Set(scene.nodes.map(n=>`${n.position.x}:${n.position.y}`)).size,scene.nodes.length);
});
