import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateExperiment, evaluateAnswer, digest, t4Sources } from '../harness/context_memory_t4_experiment.mjs';
import { materializeT3 } from '../harness/fixtures/context_memory_t3_fixture.mjs';
const experiment = await generateExperiment();
const root = new URL('../../../docs/architecture/workspace/examples/context-memory/',import.meta.url);
test('T4 freeze precedes queries, matches reviewed public fixture, preserves24 original questions',()=>{
 const frozen=JSON.parse(readFileSync(new URL('t4-freeze.json',root)));
 assert.deepEqual(experiment.freeze,frozen);
 const t0=JSON.parse(readFileSync(new URL('runtime.json',root)));
 assert.deepEqual(experiment.question_mapping.map(q=>q.original_question),t0.questions.map(q=>q.question));
 assert.equal(experiment.gold.length,24);
 assert.equal(experiment.freeze.gold_digest,digest(experiment.gold));
 const inputs=JSON.parse(readFileSync(new URL('t4-input-digests.json',root)));
 assert.deepEqual(experiment.batches.map(({batch_id,input_digest})=>({batch_id,input_digest})),inputs.inputs);
 assert.ok(inputs.canonical_intent_boundaries.Q09.canonical_intent.includes('locator'));
 assert.ok(inputs.canonical_intent_boundaries.Q21.canonical_intent.includes('omission'));
});
test('T4 off contains only current request; hidden rubric and source facts absent',()=>{
 const a=experiment.batches[0].consumer_payload;
 assert.deepEqual(Object.values(a.memories),[{items:[]}]);
 for(const q of a.questions.filter(q=>q.id!=='Q20'))assert.ok(!a.contexts[q.context_id].join(' ').includes('28V'));
 assert.ok(!Object.hasOwn(a,'gold'));assert.ok(!Object.hasOwn(a,'rubric'));
 assert.ok(a.instructions.includes('ONLY the memory addressed by its memory_digest'));
 assert.ok(experiment.batches[3].consumer_payload.memory_condition.includes('oracle'));
});
test('T4 matrix retains vector gap and deduplicates model-input identity',()=>{
 assert.equal(experiment.matrix.length,16);
 assert.equal(experiment.matrix.filter(x=>x.mechanical==='NOT_RUN').length,2);
 assert.ok(experiment.batches.length<=14);
 assert.equal(new Set(experiment.batches.map(b=>b.input_digest)).size,experiment.batches.length);
 for(const row of experiment.conditions){assert.equal(row.semantic,'NOT_RUN');if(row.batch_id)assert.ok(experiment.batches.some(b=>b.batch_id===row.batch_id));}
 const off=experiment.matrix.filter(c=>c.mode==='off');assert.equal(new Set(off.map(c=>c.input_digest)).size,1);
});
test('T4 filters and budgets precede body reads across all mechanical conditions',()=>{
 for(const c of experiment.conditions.filter(c=>c.questions))for(const q of c.questions){
  assert.ok(q.io.source_reads<=2);assert.ok(q.io.source_read_attempts<=2);
  if(['Q03','Q04','Q06','Q20'].includes(q.id)||c.mode==='off')assert.equal(q.io.source_reads,0);
  assert.equal(q.tokens,'UNKNOWN');assert.equal(q.utilization,'NOT_RUN');
 }
});
test('T4 accepted pack actually carries Q13/Q14 source relations; missing coverage stays explicit',()=>{
 const b=experiment.batches[1].consumer_payload;
 const mem=id=>b.memories[b.questions.find(q=>q.id===id).memory_digest];
 assert.ok(mem('Q13').paths.some(p=>p.kind==='depends_on'&&p.from==='F-PRE'&&p.target==='C-LIMIT'));
 assert.ok(mem('Q14').paths.some(p=>p.kind==='same_result'&&p.from==='F-RESULT'&&p.target==='F-TASK'));
 assert.ok(mem('Q06').gaps.includes('HISTORICAL_ACCEPTED_QUERY_UNSUPPORTED'));
 assert.equal(experiment.conditions[1].questions.find(q=>q.id==='Q21').fixture_gap,'TEN_TRACEABILITY_OBSERVATIONS_NOT_IMPLEMENTED');
});
test('T4 Q23 correct reference with wrong prose fails semantic utilization, never compensated by cost',()=>{
 const g=experiment.gold.find(q=>q.id==='Q23');
 const wrong={status:'HOLD',judgment:'32V is authorized; go ahead.',used_refs:g.include};
 const r=evaluateAnswer(wrong,g,'FAIL');assert.equal(r.reference_use,'PASS');assert.equal(r.outcome,'FAIL');
 assert.equal(evaluateAnswer(wrong,g).semantic_utilization,'NOT_RUN');
 assert.equal(evaluateAnswer({...wrong,used_refs:['invented']},g,'PASS').outcome,'FAIL');
 assert.equal(evaluateAnswer({...wrong,status:'NOT_AVAILABLE'},g,'PASS').outcome,'FAIL');
});

test('T4 relation sources traverse actual existing CLI input, synthetic runtime and accepted reader',async()=>{
 const x=await materializeT3({sources:t4Sources()});
 // APP CLI; the dev-ERP haengbogwan delegation is deferred on main (CTX-S0-G2).
 const output=execFileSync(process.execPath,[fileURLToPath(new URL('../src/app.mjs',import.meta.url)),
   '--root',x.root,'--binding-sha256',x.bindingSha256,'--request-json',JSON.stringify(x.request),'--synthetic-only'],
   {encoding:'utf8',windowsHide:true});
 const pack=JSON.parse(output);
 assert.ok([...output].length<=12000);
 assert.ok(pack.paths.some(p=>p.from==='F-PRE'&&p.kind==='depends_on'&&p.target==='C-LIMIT'&&p.target_status==='IN_PACK'));
 assert.ok(pack.paths.some(p=>p.from==='F-RESULT'&&p.kind==='same_result'&&p.target==='F-TASK'&&p.target_status==='IN_PACK'));
 assert.equal(pack.metrics.source_read_attempts,2);
 assert.ok(Object.values(pack.effects).every(n=>n===0));
});
