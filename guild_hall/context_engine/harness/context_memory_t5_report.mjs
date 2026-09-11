// Explicit synthetic execution report; frozen T4 inputs/results are read only.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// APP CLI main; the dev-ERP haengbogwan delegation is deferred on main (CTX-S0-G2).
import { main } from '../src/app.mjs';
import { materializeT5, inventory } from './fixtures/context_memory_t5_fixture.mjs';
import { exampleRoot } from './fixtures/context_memory_t3_fixture.mjs';
import { hash, ref } from './fixtures/accepted_context_fixture.mjs';

const upstreamUrl=new URL('t4-run.json',exampleRoot),upstreamBytes=await readFile(upstreamUrl);
const upstream=JSON.parse(upstreamBytes),x=await materializeT5(),results=[];
const frozenNames=['t4-sources.json','t4-freeze.json','t4-evaluation.json','t4-consumer-responses.json','t4-author-review.json'];
const frozen=Object.fromEntries(await Promise.all(frozenNames.map(async name=>[name,hash(await readFile(new URL(name,exampleRoot)))])));
const limitations={
  Q01:'T4 power-unit mapping preserved; original Sensor-review fixture is not rerun.',
  Q02:'Exact foreign-project denial exercised. Frozen oracle insufficiency is unchanged.',
  Q05:'T5 uses conflict-preserving document variant. T4 conflict-free Q05 variant NOT_RUN here.',
  Q06:'Current-only historical reader HOLD; historical answer NOT_RUN.',
  Q07:'24V supersession readback; original isolation-bypass scenario NOT_RUN.',
  Q08:'Future cutoff is unconfirmed; live collected mail freshness NOT_RUN.',
  Q09:'New PDF body/table locators and existing attachment assertion verified. Numeric measurement/minute6/paragraph7 NOT_RUN.',
  Q12:'Coverage is not historical absence. Frozen T4 safe 6/6 explanation and envelope issue unchanged.',
  Q15:'person:A is not actor-a. Exact actor mapping and fulfilled-promise exclusion remain HOLD.',
  Q17:'T4 polarity-failure applicability preserved; original isolation-specific setup equivalence not established.',
  Q19:'Common preference only; actor-a identity and acceptance authority cannot be inferred.',
  Q21:'Four-evidence pressure returns actual exclusions and conflict proofs. Original ten-observation stress NOT_RUN.',
  Q23:'T4 32V mapping preserved; original 75C scenario NOT_RUN. No new authorization.',
  Q24:'T4 reviewed source assertions retained. Parser-probe episode is separate and grants no procedure acceptance.',
};
for(const q of upstream.question_mapping){
  const request=structuredClone(x.request);request.query_text=q.question;
  if(q.id==='Q02')request.project_ref=ref(999);
  if(q.id==='Q03')request.actor_ref='actor:unknown';
  if(q.id==='Q04')request.project_ref=null;
  if(q.id==='Q06')Object.assign(request,{valid_at:'2026-08-01T00:00:00.000Z',known_at:'2026-08-02T00:00:00.000Z',as_of:'2026-08-02T00:00:00.000Z'});
  if(q.id==='Q08')Object.assign(request,{valid_at:'2026-08-08T00:00:00.000Z',known_at:'2026-08-08T00:00:00.000Z',as_of:'2026-08-08T00:00:00.000Z'});
  if(q.id==='Q15')request.requested_kinds=['commitment'];
  if(q.id==='Q16')request.requested_kinds=['procedure'];
  if(q.id==='Q19')Object.assign(request,{scope:'common',requested_kinds:['preference']});
  if(q.id==='Q20')request.memory_mode='off';
  if(q.id==='Q21')request.budget.max_evidence=4;
  if(q.id==='Q24')Object.assign(request,{memory_purpose:'procedure_review',requested_kinds:['failure','success','fact']});
  const bindingBytes=JSON.stringify(x.binding),savedHash=x.bindingSha256;
  if(q.id==='Q10'){
    const changed=structuredClone(x.binding);changed.assets.find(a=>a.id==='source:current').path='source-custody/DOCUMENT/missing.pdf';
    await x.put('binding.json',changed);x.bindingSha256=hash(JSON.stringify(changed));
  }
  const before=await inventory(x.root);let stdout='',stderr='';
  const exit=await main(['--root',x.root,'--binding-sha256',x.bindingSha256,'--request-json',JSON.stringify(request),'--synthetic-only'],
    {stdout:{write:s=>stdout+=s},stderr:{write:s=>stderr+=s}});
  assert.equal(exit,0,stderr);const pack=JSON.parse(stdout);
  assert.deepEqual(await inventory(x.root),before,'query performed writes');
  assert.ok([...stdout].length<=request.budget.max_characters);assert.ok(pack.metrics.source_read_attempts<=request.budget.max_source_reads);
  assert.ok((pack.evidence?.length||0)+(pack.retained_history?.length||0)<=request.budget.max_evidence);
  assert.ok((pack.paths?.length||0)<=request.budget.max_paths);
  assert.ok(Object.values(pack.effects).every(n=>n===0));
  if(q.id==='Q10'){await x.put('binding.json',JSON.parse(bindingBytes));x.bindingSha256=savedHash;}
  results.push({id:q.id,original_question:q.original_question,question:q.question,request_context:q.request_context,
    request,exit,pack,physical_execution:'OBSERVED_CLI',retrieved_fact_ids:(pack.facts||[]).map(f=>f.id),
    utilization:'NOT_RUN_T5_CONSUMER',semantic_acceptance:'NOT_CLAIMED',
    limitation:limitations[q.id]||'Physical retrieval proof only; frozen T4 meaning/score unchanged.'});
  process.stdout.write(q.id+' '+pack.status+' reads='+pack.metrics.source_read_attempts+' chars='+[...stdout].length+'\n');
}
assert.equal(results.length,24);assert.equal(hash(await readFile(upstreamUrl)),hash(upstreamBytes));
for(const name of frozenNames)assert.equal(hash(await readFile(new URL(name,exampleRoot))),frozen[name]);
const report={version:'T5-synthetic-physical/1',upstream_t4_run_sha256:hash(upstreamBytes),frozen_t4_files:frozen,
  requested_profile:{implementation:'gpt-6-astra/high'},observed_profile:'UNKNOWN',whole_W7_complete:false,
  production:false,live_canary:'HOLD_UNBOUND',results};
try {
  const consumers=JSON.parse(await readFile(new URL('t5-consumer-responses.json',exampleRoot)));
  for(const consumer of consumers.responses){
    const row=results.find(r=>r.id===consumer.question_id);
    assert.equal(row.pack.digest,consumer.pack_digest,'consumer belongs to a different pack');
    row.utilization='OBSERVED_FRESH_CONSUMER_BOUNDED';row.consumer_receipt_ref='t5-consumer-responses.json#'+row.id;
    row.semantic_acceptance='PARTIAL_NOT_WHOLE_QUESTION_PASS';
  }
} catch(error) {if(error.code!=='ENOENT')throw error;}
await writeFile(new URL('t5-query-run.json',exampleRoot),JSON.stringify(report,null,2)+'\n');
process.stdout.write('T5_REPORT_24_OBSERVED\n');
