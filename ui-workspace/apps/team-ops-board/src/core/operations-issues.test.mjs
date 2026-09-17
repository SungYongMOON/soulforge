import test from 'node:test';
import assert from 'node:assert/strict';
import {operationIssue} from './operations-issues.mjs';

test('identity mismatch remains an actionable issue even when custody itself passed',()=>{
  const issue=operationIssue({healthReasons:['plaud_metadata_identity_mismatch'],collection:{recovering:false,custody_complete:true},status:{key:'problem'}});
  assert.equal(issue.kind,'problem');assert.match(issue.cause,/보관한 녹음과 같은지/);assert.match(issue.next,/파일 내용 확인값/);assert.equal(issue.collectionVerified,false);
});
test('current reasons take precedence over historical recovery failures',()=>{
  const issue=operationIssue({healthReasons:['plaud_catalog_malformed_row','plaud_custody_incomplete'],status:{key:'problem'},recovery:{available:true,stateKey:'not_targeted',history:[{diagnosticCode:'task_action_path_drift'}]}});
  assert.match(issue.cause,/PLAUD/);assert.doesNotMatch(issue.cause,/경로/);assert.match(issue.recovery,/자동 복구 없음/);assert.equal(issue.verifiedAt,null);
});
test('lease failure does not diagnose dead collector and held items do not become outages',()=>{
  assert.match(operationIssue({healthReasons:['lease_unavailable'],status:{key:'problem'}}).impact,/미확인/);
  const issue=operationIssue({status:{key:'pending',count:4},recovery:{available:false}});assert.equal(issue.cause,'4건 처리 보류');assert.match(issue.recovery,/미확인/);
});
