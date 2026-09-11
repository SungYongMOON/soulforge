import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildAuthorReport, writeAuthorReport } from '../harness/context_memory_t4_report.mjs';
import { digest } from '../harness/context_memory_t4_experiment.mjs';
const root = new URL('../../../docs/architecture/workspace/examples/context-memory/',import.meta.url);
const read = n => JSON.parse(readFileSync(new URL(n,root),'utf8'));
const experiment = read('t4-run.json'), consumers = read('t4-consumer-responses.json');

test('reviewed assessment rejects a changed Q23 answer even with a matching new raw SHA',()=>{
  const changed=structuredClone(consumers), b=changed.batches[3];
  b.response.answers[22].judgment='32 V is authorized; go ahead.';
  b.raw_response=JSON.stringify(b.response);
  b.response_digest='sha256:'+createHash('sha256').update(b.raw_response).digest('hex');
  assert.throws(()=>buildAuthorReport(experiment,changed));
});
test('malformed C cannot be promoted by changing the caller-supplied format flag',()=>{
  const changed=structuredClone(consumers);
  changed.batches[2].format='PASS';
  assert.throws(()=>buildAuthorReport(experiment,changed));
});
test('report entry checks raw SHA, parsed/raw agreement and exact reviewed experiment',()=>{
  const badSha=structuredClone(consumers);badSha.batches[0].response_digest='sha256:wrong';
  assert.throws(()=>buildAuthorReport(experiment,badSha),/Raw response SHA mismatch/);
  const parsedOnly=structuredClone(consumers);parsedOnly.batches[3].response.answers[22].judgment='32 V is authorized; go ahead.';
  assert.throws(()=>buildAuthorReport(experiment,parsedOnly),/Parsed response differs/);
  const gold=structuredClone(experiment);gold.gold[22].rubric='Allow 32 V';
  gold.freeze.gold_digest=digest(gold.gold);
  assert.throws(()=>buildAuthorReport(gold,consumers),/manually reviewed input/);
  const payload=structuredClone(experiment);payload.batches[0].consumer_payload.questions[0].question='Different request';
  payload.batches[0].input_digest=digest(payload.batches[0].consumer_payload);
  assert.throws(()=>buildAuthorReport(payload,consumers),/manually reviewed input/);
});
test('rejected format or reassessed raw answer cannot overwrite an existing report',()=>{
  const directory=mkdtempSync(join(tmpdir(),'t4-report-guard-')), target=join(directory,'report.json');
  const previous=JSON.stringify(buildAuthorReport(experiment,consumers));
  writeFileSync(target,previous);
  try {
    const flag=structuredClone(consumers);flag.batches[2].format='PASS';
    assert.throws(()=>writeAuthorReport(experiment,flag,target));
    assert.equal(readFileSync(target,'utf8'),previous);
    const rewritten=structuredClone(consumers), b=rewritten.batches[3];
    b.response.answers[22].judgment='32 V is authorized; go ahead.';
    b.raw_response=JSON.stringify(b.response);
    b.response_digest='sha256:'+createHash('sha256').update(b.raw_response).digest('hex');
    assert.throws(()=>writeAuthorReport(experiment,rewritten,target));
    assert.equal(readFileSync(target,'utf8'),previous);
  } finally { unlinkSync(target); rmdirSync(directory); }
});

test('delivered responses preserve exact body digest and malformed C failure without a retry',()=>{
  for (const c of consumers.batches) {
    assert.equal(c.response_digest,'sha256:'+createHash('sha256').update(c.raw_response).digest('hex'));
    assert.equal(c.actual_consumer_calls,1);
    if(c.batch_id==='batch-3') {
      assert.throws(()=>JSON.parse(c.raw_response));
      assert.equal(c.format,'FAIL');
      assert.deepEqual(JSON.parse(c.raw_response+']}'),c.response);
    } else assert.deepEqual(JSON.parse(c.raw_response),c.response);
  }
});
test('author report binds all six inputs and rejects a foreign or relabelled response batch',()=>{
  const report=buildAuthorReport(experiment,consumers);
  assert.deepEqual(experiment.freeze,read('t4-freeze.json'));
  assert.equal(digest(experiment.gold),experiment.freeze.gold_digest);
  assert.equal(digest(experiment.sources),experiment.freeze.source_digest);
  assert.deepEqual(experiment.batches.map(b=>({batch_id:b.batch_id,input_digest:digest(b.consumer_payload)})),read('t4-input-digests.json').inputs);
  assert.equal(report.actual_consumer_calls,6);
  assert.equal(report.delivered_question_answers,144);
  assert.equal(report.whole_W7_complete,false);
  assert.equal(report.independent_review,'NOT_RUN');
  assert.equal(report.matrix.filter(c=>c.semantic==='NOT_RUN').length,2);
  assert.ok(report.batches[2].rows.every(r=>r.outcome==='FAIL'));
  const wrong=structuredClone(consumers);wrong.batches[1].input_digest=wrong.batches[0].input_digest;
  assert.throws(()=>buildAuthorReport(experiment,wrong));
  const unfrozen=structuredClone(consumers);unfrozen.freeze_digest='changed';
  assert.throws(()=>buildAuthorReport(experiment,unfrozen));
});
test('history, no-memory question, budget and reference versus meaning remain separate',()=>{
  const report=buildAuthorReport(experiment,consumers);
  for(const b of report.batches) {
    assert.equal(b.rows[5].semantic_utilization,'NOT_RUN');
    assert.equal(b.rows[19].semantic_utilization,'PASS');
    assert.equal(b.rows[19].budget.source_reads,0);
    for(const r of b.rows) {
      assert.ok(r.budget.input_characters<=12000&&r.budget.answer_characters<=12000);
      assert.ok(r.budget.source_reads<=2&&r.budget.source_read_attempts<=2);
    }
  }
  assert.equal(report.batches[3].rows[1].retrieval,'PASS');
  assert.equal(report.batches[3].rows[1].semantic_utilization,'FAIL');
  assert.equal(report.batches[3].rows[8].semantic_utilization,'PASS');
  assert.equal(report.batches[3].rows[8].reference_use,'FAIL');
});
