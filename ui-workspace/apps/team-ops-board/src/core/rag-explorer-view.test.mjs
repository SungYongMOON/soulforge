import test from 'node:test';
import assert from 'node:assert/strict';
import {ragConnections,ragGraphScene} from './rag-explorer-view.mjs';

test('source composition uses matched project generations and preserves unknown scope',()=>{
  const view=ragConnections({state:'ready',expected:2,projects:[
    {project:'P-SYN-A',project_name:'합성 과제',comparison:'counts_match',detail_state:'ready',store:{counts:{documents:3}},source_links:{types:{mail:2,slack:1}}},
    {project:'P-SYN-B',comparison:'different_generation',detail_state:'ready',store:{counts:{documents:99}},source_links:{types:{mail:99}}},
  ]});
  assert.equal(view.complete,false);assert.equal(view.nodes.find(n=>n.id==='P-SYN-B').count,null);
  assert.deepEqual(view.sources.map(s=>[s.id,s.count]),[['mail',2],['slack',1]]);
  assert.equal(view.edges.length,2);assert.ok(view.nodes.find(n=>n.id==='P-SYN-A').label.includes('합성 과제'));
  assert.equal(ragConnections(null).complete,false);
});
test('graph scene only displays supplied DB relationships, without inventing missing edges',()=>{
  const graph=ragGraphScene({nodes:[{id:'d',labels:['Document'],name:'합성 문서'},{id:'c',labels:['Chunk'],unit:'u1'}],edges:[{id:'r',source:'c',target:'d',type:'FROM_DOCUMENT'},{id:'outside',source:'other',target:'c',type:'NEXT_CHUNK'}]},'storage');
  assert.equal(graph.nodes.length,2);assert.equal(graph.nodes[1].kind,'chunk');
  assert.equal(graph.edges.length,1);assert.equal(graph.edges[0].id,'r');
  assert.equal(graph.edges[0].source,'c');assert.equal(graph.edges[0].target,'d');
});

test('default knowledge graph hides storage nodes and never invents a shortcut between entities',()=>{
  const data={nodes:[{id:'d',labels:['Document']},{id:'c',labels:['Chunk']},{id:'a',name:'장비 A',labels:['Equipment'],document:'doc'},{id:'b',name:'결정 B',labels:['Decision'],document:'doc'}],edges:[{id:'source',source:'a',target:'c',type:'FROM_CHUNK'},{id:'doc',source:'c',target:'d',type:'FROM_DOCUMENT'},{id:'relation',source:'b',target:'a',type:'CONCERNS'}]};
  const graph=ragGraphScene(data);
  assert.deepEqual(new Set(graph.nodes.map(n=>n.id)),new Set(['a','b']));
  assert.deepEqual(graph.edges.map(e=>e.id),['relation']);
  assert.ok(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
  const again=ragGraphScene(data);assert.deepEqual(again,graph);
});
