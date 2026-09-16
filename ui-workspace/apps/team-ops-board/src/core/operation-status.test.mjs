import test from 'node:test';import assert from 'node:assert/strict';
import {STATUS_LABELS,unifyStatus,applySourceConnection} from './operation-status.mjs';
import {CONSOLE_ASSESSMENTS} from './operations-console-view.mjs';
test('every badge uses one vocabulary while preserving detailed scope separately',()=>{
 const examples=[['ok','현행 703개 검사 통과'],['sampled','표본 50개 검사 통과'],['ok','최근 수집 완료'],['processing','수집 순차 처리 중']];
 for(const [key,label] of examples){const n=unifyStatus({id:'watchtower::collector',stage:'collect',status:{key,label}});assert.equal(n.status.label,STATUS_LABELS[key]);assert.equal(n.status.evidenceLabel,label);assert.equal(n.checkLabel,'수집');}
 assert.equal(new Set(Object.values(STATUS_LABELS)).size,6);
});
test('TLS alone is partial, authenticated collection or live local API is scoped normal',()=>{
 const node={id:'watchtower::src_linear',status:{key:'unknown'}};
 const map=c=>unifyStatus(applySourceConnection(node,c,CONSOLE_ASSESSMENTS));
 assert.equal(map({basis:'tls',state:'responding'}).status.label,'일부 확인');
 assert.equal(map({basis:'tls',state:'responding',collection:{observed_at:'2026-09-16T00:00:00Z'}}).status.label,'정상');
 assert.equal(map({basis:'http_liveness',state:'responding'}).checkLabel,'연결');
 assert.equal(map({basis:'tls',state:'failed'}).status.label,'이상');
 assert.equal(map({basis:'tls',state:'unavailable'}).status.label,'미확인');
});
