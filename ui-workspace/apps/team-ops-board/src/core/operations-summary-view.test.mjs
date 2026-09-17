import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOperationsSummaryView,projectQuotaSummary,projectTokenSummary,projectCollectionSummary,projectModelsSummary,projectIssuesSummary,projectRagSummary} from './operations-summary-view.mjs';

test('absent input never becomes a healthy zero in the first-screen summary',()=>{
  const v=buildOperationsSummaryView();
  assert.equal(v.tokens.label,'—');assert.equal(v.collection.label,'—');assert.equal(v.rag.matchedLabel,'—');assert.equal(v.models.label,'—');assert.equal(v.issues.label,'—');assert.equal(v.quotas.allUnknown,true);
});
test('quota summary selects the lowest known window without averaging or summing',()=>{
  const now=Date.now(),observed_at=new Date(now).toISOString(),resets_at_epoch_s=(now+86400000)/1000;
  const inputs={limits:{codex:{observed_at,primary:{used_percent:10,window_minutes:300,resets_at_epoch_s},secondary:{used_percent:70,window_minutes:10080,resets_at_epoch_s}}}};
  const row=projectQuotaSummary(inputs).providers.find(p=>p.provider==='Codex');assert.equal(row.remaining,30);assert.equal(row.window,'주간');
  assert.equal(projectQuotaSummary(inputs,['limits']).providers.find(p=>p.provider==='Codex').remaining,null);
});
test('seven-day token summary preserves incomplete coverage and never adds request counts',()=>{
  const model_daily=Array.from({length:8},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,models:[{total_tokens:i===0?999:10}]}));
  const input={usage:{history:{model_daily,unmeasured_request_daily:[{families:[{requests:700}]}]}}};
  assert.equal(projectTokenSummary(input).tokens,70);assert.equal(projectTokenSummary(input).hasPartial,true);
  assert.equal(projectTokenSummary(input,['usage']).state,'unavailable');
  assert.equal(projectTokenSummary({usage:{history:{model_daily:model_daily.slice(-1)}}}).hasPartial,true);
});
test('unknown and processing collectors are not diagnosed as failed',()=>{
  const node=key=>({id:'watchtower::synthetic',stage:'collect',status:{key}});
  assert.notEqual(projectCollectionSummary({healthAvailable:true,nodes:[node('unknown')]}).severity,'crit');
  assert.notEqual(projectCollectionSummary({healthAvailable:true,nodes:[node('processing')]}).severity,'crit');
  assert.notEqual(projectCollectionSummary({healthAvailable:true,nodes:[]}).severity,'ok');
});
test('empty host inventory and failed observations remain unknown',()=>{
  assert.notEqual(projectModelsSummary({models:{state:'ready',hosts:[]}}).severity,'ok');
  const model={healthAvailable:true,attention:[],counts:{unknown:0}};
  assert.equal(projectIssuesSummary(model,{models:{state:'ready',hosts:[]}},['health']).countsKnown,false);
});

test('mini token history preserves missing calendar days and matches the seven-day total',()=>{
  const history={model_daily:[{date:'2026-09-01',models:[{total_tokens:900}]},{date:'2026-09-11',models:[{total_tokens:10}]},{date:'2026-09-13',models:[{total_tokens:null}]},{date:'2026-09-17',models:[{total_tokens:20}]}]};
  const v=projectTokenSummary({usage:{history}});
  assert.equal(v.tokens,30);
  assert.deepEqual(v.sparkline.map(p=>p.value),[10,null,null,null,null,null,20]);
  assert.equal(v.hasPartial,true);
});

test('mini RAG history does not turn partial project observations into a total or carry a missing day',()=>{
  const run=(at,n)=>({at,verified:true,totals:{documents_in_generation:n},database:{chunks:n,embedded_chunks:n}});
  const rag={state:'ready',expected:2,observed_at:'2026-09-17T12:00:00+09:00',projects:[
    {project:'synthetic-a',runs:[run('2026-09-15T10:00:00+09:00',4),run('2026-09-17T10:00:00+09:00',5)]},
    {project:'synthetic-b',runs:[run('2026-09-17T10:00:00+09:00',6)]},
  ]};
  assert.deepEqual(projectRagSummary({rag}).sparkline.map(p=>p.value),[null,null,null,null,null,null,11]);
});
