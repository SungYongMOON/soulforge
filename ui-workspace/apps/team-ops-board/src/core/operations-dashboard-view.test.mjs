import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardQuotas,registrationTimeline,dashboardWork} from './operations-dashboard-view.mjs';
test('Codex windows use actual duration, deduplicate meter/live and do not invent a five-hour window',()=>{
  const now=Date.parse('2026-09-16T01:00:00Z');
  const w={used_percent:20,window_minutes:10080,resets_at_epoch_s:(now+86400000)/1000};
  const rows=dashboardQuotas({limits:{codex:{primary:w,secondary:null,observed_at:new Date(now).toISOString()}},usage:{history:{rate_limit:{...w,observed_at:new Date(now-1000).toISOString()}}}},[],now).filter(r=>r.provider==='Codex');
  assert.equal(rows.length,1);assert.equal(rows[0].window,'주간');assert.equal(rows[0].remaining,80);assert.equal(rows[0].current,true);
});
test('expired or failed quota cannot be current; retained numeric evidence remains inspectable',()=>{
  const now=Date.parse('2026-09-16T01:00:00Z'),input={limits:{codex:{primary:{used_percent:30,window_minutes:300,resets_at_epoch_s:now/1000-1},observed_at:new Date(now).toISOString()}}};
  const r=dashboardQuotas(input,[],now)[0];assert.equal(r.current,false);assert.equal(r.remaining,70);
  assert.equal(dashboardQuotas(input,['limits'],now)[0].current,false);assert.equal(dashboardQuotas({},[],now)[0].remaining,null);
});
test('registration series is KST and source-as-of based, never extends to an unobserved current day',()=>{
  const t=registrationTimeline({generated_at:'2026-09-15T08:00:00Z',recordings:[{recording_id:'a',registered_at_kst:'2026-09-14T16:00:00Z'},{recording_id:'b',registered_at_kst:'2026-09-14T11:00:00Z'}]},3);
  assert.deepEqual(t.daily.map(r=>[r.date,r.registrations]),[['2026-09-13',0],['2026-09-14',1],['2026-09-15',1]]);assert.equal(t.total,2);assert.equal(t.last_day_partial,true);
});
test('missing/duplicate/future registrations are partial and empty uncertain buckets are not zero',()=>{
  const t=registrationTimeline({generated_at:'2026-09-15T00:00:00Z',recordings:[{recording_id:'duplicate',registered_at_kst:'2026-09-14T00:00:00Z'},{recording_id:'duplicate',registered_at_kst:'2026-09-14T00:00:00Z'},{recording_id:'future',registered_at_kst:'2026-09-16T00:00:00Z'},{recording_id:'missing'}]},2);
  assert.equal(t.state,'partial');assert.equal(t.excluded_rows,4);assert.ok(t.daily.every(r=>r.registrations===null));assert.equal(t.total,null);assert.equal(registrationTimeline({recordings:[]}).state,'unavailable');
});
test('registered or disconnected bots and retained tasks never become active work',()=>{
  const t=dashboardWork({runtime:{refresh_state:'hold',bots:[{bot_id:'a',state:{kind:'observed',value:'working'}}]},threads:{adapter:{health:'error'},threads:[{thread_id:'b',observed:true,status:'running'}]}});
  assert.equal(t.rows.length,0);assert.equal(t.complete,false);
});
test('registration drill-down reconciles source days and never returns raw payload refs',()=>{
  const rows=Array.from({length:510},(_,i)=>({recording_id:`r${i}`,registered_at_kst:'2026-09-14T00:00:00Z',payload_refs:{private:'raw'},status_summary:{ok:true,transcript_segments:2}}));
  const t=registrationTimeline({generated_at:'2026-09-15T00:00:00Z',recordings:rows});assert.equal(t.total,510);assert.equal(t.records.length,500);assert.equal(t.records_total,510);assert.equal(t.records_limited,true);assert.equal(JSON.stringify(t).includes('payload_refs'),false);
});
test('fresh meter quota survives relay failure without adding an expired phantom window',()=>{
  const now=Date.parse('2026-09-16T01:00:00Z'),base={used_percent:25,window_minutes:10080,resets_at_epoch_s:(now+86400000)/1000,observed_at:new Date(now).toISOString()};
  assert.equal(dashboardQuotas({usage:{history:{rate_limit:base}}},['limits'],now)[0].current,true);
  const rows=dashboardQuotas({limits:{codex:{primary:base,observed_at:base.observed_at}},usage:{history:{rate_limit:{...base,window_minutes:300,observed_at:new Date(now-86400000).toISOString(),resets_at_epoch_s:now/1000-1}}}},[],now).filter(r=>r.provider==='Codex');assert.equal(rows.length,1);
});
