import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateComparison,compareRevisedInputs } from '../harness/strategy_comparison.mjs';
const examples=new URL('../../../docs/architecture/workspace/examples/context-memory/',import.meta.url);
const freeze=JSON.parse(readFileSync(new URL('app-strategy-freeze.json',examples),'utf8'));
const responses=JSON.parse(readFileSync(new URL('app-strategy-responses.json',examples),'utf8'));
const digest=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');

test('both exact installed responses are rescored by both fixed harness revisions',()=>{
  const input=JSON.stringify({freeze,responses});
  const old=evaluateComparison(freeze,responses,'app-strategy-eval/1');
  const revised=evaluateComparison(freeze,responses,'app-strategy-eval/2');
  for(let i=0;i<2;i++){
    assert.equal(old[i].reported_refs_grounded,true);assert.equal(old[i].required_ref_recall,2);
    const {omission_explanation_present,limitation_explanation_present,missing_required_refs,...unchanged}=revised[i];
    assert.deepEqual(unchanged,old[i]);assert.equal(omission_explanation_present,true);
    assert.equal(limitation_explanation_present,true);assert.deepEqual(missing_required_refs,['F-RESULT']);
  }
  const reversed={...responses,responses:[...responses.responses].reverse()};
  assert.deepEqual(evaluateComparison(freeze,reversed,'app-strategy-eval/2').reverse(),revised);
  assert.equal(JSON.stringify({freeze,responses}),input);
});
test('changed input/gold campaign, swapped input pins and raw response drift cannot reuse the frozen run',()=>{
  const changed=structuredClone(freeze);changed.gold.include=[];const {freeze_sha256,...material}=changed;
  changed.freeze_sha256=digest(material);
  assert.throws(()=>evaluateComparison(changed,{...responses,freeze_sha256:changed.freeze_sha256},'app-strategy-eval/2'));
  const raw=structuredClone(responses);raw.responses[0].raw_response+=' ';
  assert.throws(()=>evaluateComparison(freeze,raw,'app-strategy-eval/2'));
  const swapped=structuredClone(responses);swapped.responses[0].input_sha256=swapped.responses[1].input_sha256;
  assert.throws(()=>evaluateComparison(freeze,swapped,'app-strategy-eval/2'));
  const duplicate=structuredClone(responses);duplicate.responses[1]=duplicate.responses[0];
  assert.throws(()=>evaluateComparison(freeze,duplicate,'app-strategy-eval/2'));
});

test('revised input comparison excludes only metrics and detects changed evidence',()=>{
  const state={queryRequest:{query_text:freeze.question},binding:{installs:freeze.variants.map(v=>({
    version:'test-revision',composition:{profile_id:v.profile}}))},
    incumbent:{query:structuredClone(freeze.variants[0].input.pack)},
    candidate:{query:structuredClone(freeze.variants[1].input.pack)}};
  state.incumbent.query.metrics.elapsed_ms+=1;
  assert.ok(compareRevisedInputs(freeze,state).every(r=>r.exact_non_metric_input_equal));
  state.candidate.query.evidence[0].id='changed-test-evidence';
  assert.equal(compareRevisedInputs(freeze,state)[1].exact_non_metric_input_equal,false);
});
