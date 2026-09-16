import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConsoleView,consoleAssessment,focusScene,directoryKey,flattenDirectory,selectedUsageDay,needsIntervention} from './operations-console-view.mjs';
import {readFileSync} from 'node:fs';

test('only current problem, blocked processing and failed observation require intervention',()=>{
  for(const key of ['problem','pending','observation_error'])assert.equal(needsIntervention({status:{key}}),true);
  for(const key of ['ok','processing','history','unknown'])assert.equal(needsIntervention({status:{key}}),false);
});
test('fresh verified PLAUD progress and mail history remain inspectable but never alert',()=>{
  const federation=JSON.parse(readFileSync(new URL('../../../../../guild_hall/watchtower/topology/federated_topology.v1.json',import.meta.url),'utf8'));
  const observed_at=new Date().toISOString();
  const inputs={federation:{lens:'declared_structure',state:'ready',snapshot:federation},recent:{collection:{recovering:true,observed_at,imported:1,catalog:50}},incidents:{mail:{history_only:true,observed_at,tracked:4}}};
  const model=buildConsoleView(inputs);
  assert.equal(model.nodes.find(n=>n.id==='watchtower::ingress_supervisor').status.key,'processing');
  assert.equal(model.nodes.find(n=>n.id==='watchtower::mail_forwarder').status.key,'ok');
  assert.equal(model.nodes.find(n=>n.id==='watchtower::mail_forwarder').mailHistory.tracked,4);
  assert.equal(model.attention.length,0);
  assert.equal(model.counts.processing,1);assert.equal(model.counts.history,0);
  assert.notEqual(buildConsoleView(inputs,['recent']).nodes.find(n=>n.id==='watchtower::ingress_supervisor').status.key,'processing');
  inputs.recent.collection={...inputs.recent.collection,recovering:false,errors:['plaud_metadata_identity_mismatch','plaud_collection_degraded']};
  const failed=buildConsoleView(inputs);
  assert.equal(failed.attention[0].id,'watchtower::ingress_supervisor');
  assert.ok(failed.attention[0].healthReasons.includes('plaud_metadata_identity_mismatch'));
  inputs.recent.collection.observed_at=new Date(Date.now()-16*60000).toISOString();
  assert.notEqual(buildConsoleView(inputs).nodes.find(n=>n.id==='watchtower::ingress_supervisor').status.key,'processing');
});

test('preparer input is a grant artifact, never invented direct custody traffic',()=>{
  const m=buildConsoleView(); const scene=focusScene(m,'context_engine::prepare');
  assert.ok(scene.nodes.some(n=>n.id==='context_engine::source_grant'));
  assert.equal(scene.edges.find(e=>e.from==='context_engine::source_grant').receiptObserved,false);
  assert.ok(m.nodes.every(n=>n.status.key==='unknown'));
  assert.equal(m.edges.some(e=>e.from.startsWith('watchtower::store_')&&e.to==='context_engine::prepare'),false);
  assert.equal(new Set(scene.nodes.map(n=>n.id)).size,scene.nodes.length);
});

test('custody samples stay blue, corruption alerts and current DB failures join attention',()=>{
  const snapshot=JSON.parse(readFileSync(new URL('../../../../../guild_hall/watchtower/topology/federated_topology.v1.json',import.meta.url),'utf8'));
  const at=new Date().toISOString(),inputs={federation:{lens:'declared_structure',state:'ready',snapshot},incidents:{custody:[{lane:'linear',state:'passed',complete:true,expected:2,checked:2,failed:0,unreadable:0,codes:[],observed_at:at},{lane:'buzz',state:'sampled',checked:2,failed:0,unreadable:0,codes:[],observed_at:at}]},rag:{state:'ready',expected:1,observed_at:at,database:{vector_index:{state:'ONLINE'}},projects:[{database:{},comparison:'counts_match',preparation:{state:'ready',counts:{prepared:1,missing:0,refused:0,failed:0}}}]}};
  let m=buildConsoleView(inputs);assert.equal(m.nodes.find(n=>n.id==='watchtower::store_linear_custody').status.key,'ok');assert.equal(m.nodes.find(n=>n.id==='watchtower::store_buzz_custody').status.key,'sampled');assert.equal(m.nodes.find(n=>n.id==='context_engine::neo4j').status.key,'ok');assert.equal(m.attention.length,0);
  inputs.rag.projects[0].comparison='embedding_missing';m=buildConsoleView(inputs);assert.ok(m.attention.some(n=>n.id==='context_engine::neo4j'));
  assert.equal(buildConsoleView(inputs,['incidents']).nodes.find(n=>n.id==='watchtower::store_linear_custody').status.key,'unknown');
  inputs.incidents.custody[0].observed_at=new Date(Date.now()-16*60000).toISOString();assert.equal(buildConsoleView(inputs).nodes.find(n=>n.id==='watchtower::store_linear_custody').status.key,'unknown');
});
test('retained normal/held snapshot cannot be current when source read failed',()=>{
  const node={id:'watchtower::mail',assessment:{key:'pending',pendingCount:4}};
  assert.equal(consoleAssessment(node,true).key,'pending');
  assert.equal(consoleAssessment(node,false).key,'unknown');
  assert.equal(consoleAssessment({id:'other',health:'ok'},true).key,'unknown');
});
test('folder flattening only visits expanded exact root keys with a total bound',()=>{
  const root='data_root',cache={};
  cache[directoryKey(root,'')]={entries:[{name:'A',browsable:true},{name:'B',browsable:true}]};
  cache[directoryKey(root,'A')]={entries:[{name:'file',browsable:false}]};
  cache[directoryKey('other','A')]={entries:[{name:'must-not-read'}]};
  const expanded=new Set([directoryKey(root,'A')]);
  assert.deepEqual(flattenDirectory(root,'',cache,expanded).map(r=>r.relative),['A','A/file','B']);
  assert.equal(flattenDirectory(root,'',cache,expanded,2).length,2);
  assert.equal(flattenDirectory('missing','',cache,expanded).length,0);
});
test('model selection never attributes aggregate period work to that model/day',()=>{
  const result=selectedUsageDay({model_daily:[{date:'2026-09-15',models:[{model_id:'m1',total_tokens:100},{model_id:'m2',total_tokens:200}]}]},'2026-09-15','m1',undefined);
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].total_tokens,100);
  assert.equal(result.taskAttribution,'unavailable');
  assert.equal(selectedUsageDay({},'2026-09-15',null,undefined),null);
  const history={model_daily:[{date:'2026-09-15',models:[{model_id:'m1',total_tokens:100},{model_id:'m2',total_tokens:200}]}]};
  assert.deepEqual(selectedUsageDay(history,'2026-09-15','other',['m1']).rows.map(r=>r.model_id),['m2']);
  assert.equal(selectedUsageDay(history,'2026-09-15','other',undefined),null);
});
test('model API observations update source scope but never promote inference health',()=>{
  const inputs={models:{observed_at:'2026-09-16T00:00:00Z',hosts:[{id:'rag-model-synthetic',label:'Synthetic model server',connection:'responding'}]}};
  const model=buildConsoleView(inputs).nodes.find(n=>n.id==='context_engine::models');
  assert.equal(model.location,'Synthetic model server');assert.equal(model.status.key,'unknown');assert.match(model.scope,/실제 추론과 검색 성공은 미검사/u);
  const failed=buildConsoleView(inputs,['models']).nodes.find(n=>n.id==='context_engine::models');assert.equal(failed.observedAt,null);
});
