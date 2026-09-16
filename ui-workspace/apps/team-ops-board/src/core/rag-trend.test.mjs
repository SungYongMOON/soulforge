import test from 'node:test';
import assert from 'node:assert/strict';
import {ragTrend} from './rag-trend.mjs';
import {projectLabel,namedProjectText} from './project-label.mjs';
const run=(hour,documents=10,extra={})=>({at:`2026-09-16T${hour}:00Z`,verified:true,totals:{documents_in_generation:documents,pending:0,failed:0},database:{chunks:20,embedded_chunks:20},...extra});
test('repeated syncs are stock observations, latest per project and hour wins',()=>{
 const rows=[{project:'P26-001',runs:[run('01:10'),run('01:30',12),run('02:10',12)]},{project:'P26-002',runs:[run('01:05',3),run('02:05',4)]}];
 const t=ragTrend(rows,2);assert.deepEqual(t.points.map(p=>p.documents),[15,16]);assert.deepEqual(t.points.map(p=>p.chunks),[40,40]);
});
test('missing projects, absent hours and unverified stock never become zero or stale carry-forward',()=>{
 const t=ragTrend([{project:'P26-001',runs:[run('01:10'),run('03:10',10,{verified:false})]}],2);
 assert.deepEqual(t.points.map(p=>p.documents),[null,null,null]);assert.equal(t.points[1].pending,null);
 const failed=ragTrend([{project:'P26-001',runs:[run('01:10',10,{verified:false,totals:{pending:2,failed:1}})]}],1);
 assert.equal(failed.points[0].embedded,null);assert.equal(failed.points[0].failed,1);
});
test('names are presentation labels and preserve exact identifiers with honest missing labels',()=>{
 const names={'P26-001':'합성 과제'};
 assert.equal(projectLabel('P26-001',names),'P26-001 · 합성 과제');
 assert.equal(namedProjectText('P26-001 · 메시지',names),'P26-001 · 합성 과제 · 메시지');
 assert.equal(projectLabel('P26-002',names),'P26-002 · 명칭 미확인');
});
