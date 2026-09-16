import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,link} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {projectMailRun,aggregateMailRuns,createMailCollectionHistoryReader} from './mail-collection-history.mjs';
const observed='2026-09-16T07:00:00Z';
const receipt=(id,at,value,extra={})=>({schema_version:'soulforge.ingress.continuous_run_receipt.v3',run_id:id,started_at:at,completed_at:at,mail:{status:'ok',partial:false,write_count_known:true,total_new_events:value,total_events:value+4,total_duplicates:4,...extra},raw:'must-not-project'});
test('all measured run deltas sum across KST days, excluding duplicate runs and producer duplicates',()=>{
  const a=projectMailRun(receipt('a','2026-09-14T16:00:00Z',7),'a',observed),b=projectMailRun(receipt('b','2026-09-15T01:00:00Z',3),'b',observed),c=projectMailRun(receipt('c','2026-09-16T01:00:00Z',2),'c',observed);
  const value=aggregateMailRuns([a,b,c,a],observed);assert.equal(value.timeline.total,12);assert.equal(value.timeline.daily.find(d=>d.date==='2026-09-15').registrations,10);assert.equal(value.timeline.daily.at(-1).registrations,2);assert.equal(value.coverage.duplicate_runs,1);assert.equal(value.rows[0].value,2);assert.equal(value.timeline.records.length,2);
});

test('30-day view retains older observations and hourly drill-down reconciles without duplicate runs',()=>{
 const older=projectMailRun(receipt('older','2026-08-20T01:00:00Z',7),'older',observed),today=projectMailRun(receipt('today','2026-09-16T01:05:00Z',3),'today',observed);
 const r=aggregateMailRuns([older,today,today],observed,{},30);
 assert.equal(r.timeline.daily.length,30);assert.equal(r.timeline.total,10);assert.equal(r.timeline.hourly[0].registrations,3);assert.equal(r.timeline.hourly_records[0].value,3);assert.equal(r.timeline.hourly_records[0].at,'2026-09-16T01:00:00.000Z');
});
test('unmeasured/failed runs and missing days are not zero, but an observed zero remains zero',()=>{
  const missing=projectMailRun(receipt('a','2026-09-14T01:00:00Z',9,{write_count_known:false}),'a',observed),failed=projectMailRun(receipt('b','2026-09-15T01:00:00Z',8,{status:'failed'}),'b',observed),zero=projectMailRun(receipt('c','2026-09-16T01:00:00Z',0),'c',observed);
  const value=aggregateMailRuns([missing,failed,zero],observed);assert.equal(value.timeline.total,0);assert.equal(value.timeline.daily.at(-3).registrations,null);assert.equal(value.timeline.daily.at(-2).failed_runs,1);assert.equal(value.timeline.daily.at(-1).registrations,0);assert.equal(value.state,'partial');
  assert.equal(projectMailRun(receipt('x','2026-09-16T01:00:00Z',2),'different',observed),null);
  assert.equal(projectMailRun(receipt('x','2026-09-16T01:00:00Z',2,{total_events:1}),'x',observed).value,null);
});
test('bounded history reads older receipts, excludes payload and refreshes changed cached files',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'mail-history-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('mail-history-'));await rm(root,{recursive:true,force:true});});
  const folder=path.join(root,'state/receipts/continuous_ingress');await mkdir(folder,{recursive:true});
  const id1='20260915T010000000Z_node_00000001',id2='20260916T010000000Z_node_00000002';
  await writeFile(path.join(folder,id1+'.json'),JSON.stringify(receipt(id1,'2026-09-15T01:00:00Z',7)));
  await writeFile(path.join(folder,id2+'.json'),JSON.stringify(receipt(id2,'2026-09-16T01:00:00Z',2)));
  await writeFile(path.join(folder,'credentials.json'),'must-not-read');
  const reader=createMailCollectionHistoryReader(),first=await reader.read(root,observed);assert.equal(first.timeline.total,9);assert.equal(JSON.stringify(first).includes('must-not'),false);assert.equal(first.coverage.selected_files,2);
  assert.equal((await reader.read(root.replaceAll('\\','/'),observed)).timeline.total,9);
  await writeFile(path.join(folder,id2+'.json'),JSON.stringify(receipt(id2,'2026-09-16T01:00:00Z',12)));assert.equal((await reader.read(root,observed)).timeline.total,19);
  await writeFile(path.join(folder,id1+'.json'),'not-json');const partial=await reader.read(root,observed);assert.equal(partial.timeline.total,12);assert.equal(partial.coverage.unreadable_files,1);
  await link(path.join(folder,id2+'.json'),path.join(root,'outside-copy.json'));const linked=await reader.read(root,observed);assert.equal(linked.timeline.total,null);assert.equal(linked.coverage.unreadable_files,2);
});
