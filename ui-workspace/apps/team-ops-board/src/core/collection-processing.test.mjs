import test from 'node:test';import assert from 'node:assert/strict';
import {collectionProcessing} from './collection-processing.mjs';
import {chartPeriod} from './chart-period.mjs';
import {ragTrend} from './rag-trend.mjs';
const at='2026-09-16T13:00:00Z';
const source=(id,records,daily)=>({id,state:'ready',timeline:{as_of:at,records,daily,records_limited:false}});
const rag=(keys,types={linear:1})=>({state:'ready',expected:2,projects:[1,2].map(project=>({project,comparison:'counts_match',detail_state:'ready',source_links:{keys,types,complete:true}}))});
test('cohort fill requires identical source revision and never duplicates shared projects',()=>{
 const s=source('linear',[{at,id:'a',rag_key:'current',value:1},{at,id:'b',rag_key:'new-revision',value:1}],[{date:'2026-09-16',registrations:2}]);
 const r=collectionProcessing([s],rag(['current','old-revision']),7).rows[0];assert.equal(r.total,2);assert.equal(r.processed,1);assert.equal(r.daily.at(-1).processed,1);
});
test('aggregate mail is not joined by date and unknown days do not become zero processed',()=>{
 const s=source('mail',[{at,id:'mail-day',value:12}],[{date:'2026-09-15',registrations:0},{date:'2026-09-16',registrations:12}]);
 const r=collectionProcessing([s],rag([], {mail:3}),7).rows[0];assert.equal(r.processed,null);assert.equal(r.daily.at(-1).processed,null);
 assert.equal(collectionProcessing([source('plaud',[{at,id:'recording'}],[{date:'2026-09-16',registrations:1}])],rag([]),7).rows[0].processed,0);
 const broken=rag([]);broken.projects[0].detail_state='unavailable';assert.equal(collectionProcessing([s],broken,7).rows[0].processed,null);
});
test('periods use KST hour/day boundaries; long-range stocks choose last observation, never a sum',()=>{
 assert.equal(chartPeriod(1,'2026-09-15T15:30:00Z').length,1);assert.equal(chartPeriod(7,at).length,7);assert.equal(chartPeriod(30,at).length,30);
 const runs=[{at:'2026-09-16T00:00:00Z',verified:true,totals:{documents_in_generation:10,pending:0,failed:0},database:{chunks:20,embedded_chunks:20}},{at:'2026-09-16T01:00:00Z',verified:true,totals:{documents_in_generation:12,pending:0,failed:0},database:{chunks:25,embedded_chunks:25}}];
 const result=ragTrend([{project:'one',runs}],1,30,at);assert.equal(result.points.length,30);assert.equal(result.points.at(-1).documents,12);assert.equal(result.points.at(-2).documents,null);
});
