// Independently versioned evaluation, never imported by runtime/algorithms.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const examples=new URL('../../../docs/architecture/workspace/examples/context-memory/',import.meta.url);
const digest=value=>'sha256:'+createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const APPROVED_FREEZE='sha256:352417bdabaf794f7a56f0a1953f05da29cbfab8750c32b2774333337d6c3210';
export function freezeInstalledComparison(state){
  const t4=JSON.parse(readFileSync(new URL('t4-run.json',examples),'utf8'));
  const question=t4.question_mapping.find(q=>q.id==='Q21');
  const gold=t4.gold.find(q=>q.id==='Q21');
  assert.equal(state.queryRequest.query_text,question.question);
  const variants=[['A',state.incumbent,state.binding.installs[0]],['B',state.candidate,state.binding.installs[1]]]
    .map(([id,result,install])=>({id,profile:install.composition.profile_id,version:install.version,
      input:{question:question.question,pack:result.query},input_sha256:digest({question:question.question,pack:result.query})}));
  const material={question_id:'Q21',question:question.question,original_question:question.original_question,
    source_snapshot_sha256:state.binding.source_snapshot.sha256,accepted_snapshot_sha256:state.binding.accepted_snapshot.sha256,
    budget:state.queryRequest.budget,gold,variants,requested_consumer:{model:'gpt-6-astra',reasoning:'medium',tools:false,files:false,network:false},
    observed_consumer_profile:'UNKNOWN',harness_versions:['app-strategy-eval/1','app-strategy-eval/2'],
    limitations:['One bounded original Q21 comparison, not whole W7 or ten-observation stress.',
      'Gold/criteria are evaluation-only and are not included in consumer inputs.']};
  return {...material,freeze_sha256:digest(material)};
}
export function evaluateComparison(freeze,responses,version){
  assert.ok(freeze.harness_versions.includes(version));
  const {freeze_sha256,...material}=freeze;assert.equal(digest(material),freeze_sha256);
  assert.equal(freeze_sha256,APPROVED_FREEZE,'different campaign requires a separate frozen evaluation');
  assert.equal(responses.freeze_sha256,freeze_sha256);
  assert.equal(responses.responses.length,2);
  assert.deepEqual(responses.responses.map(r=>r.id).sort(),freeze.variants.map(v=>v.id).sort());
  return responses.responses.map(row=>{
    const variant=freeze.variants.find(v=>v.id===row.id);assert.ok(variant);
    assert.equal(digest(variant.input),variant.input_sha256);
    assert.equal(row.input_sha256,variant.input_sha256);assert.equal(digest(row.raw_response),row.response_sha256);
    let parsed;try{parsed=JSON.parse(row.raw_response);}catch{return {id:row.id,format:'FAIL',semantic_quality:'NOT_SCORED'};}
    const used=parsed.used_evidence_ids||[],available=variant.input.pack.evidence.map(e=>e.id);
    const result={id:row.id,format:'PASS',reported_refs_grounded:used.every(id=>available.includes(id)),
      required_ref_recall:freeze.gold.include.filter(id=>available.includes(id)).length,
      required_ref_count:freeze.gold.include.length,reported_required_refs:freeze.gold.include.filter(id=>used.includes(id)).length,
      frozen_status_match:freeze.gold.accepted_statuses.includes(parsed.status),
      semantic_quality:'REQUIRES_SEPARATE_MEANING_REVIEW',whole_question_pass:false};
    if(version==='app-strategy-eval/2')Object.assign(result,{omission_explanation_present:Array.isArray(parsed.omissions)&&parsed.omissions.length>0,
      limitation_explanation_present:Array.isArray(parsed.limitations)&&parsed.limitations.length>0,
      missing_required_refs:freeze.gold.include.filter(id=>!available.includes(id))});
    return result;
  });
}
export function compareRevisedInputs(freeze,state){
  const {freeze_sha256,...material}=freeze;
  assert.equal(digest(material),APPROVED_FREEZE);assert.equal(freeze_sha256,APPROVED_FREEZE);
  return freeze.variants.map((prior,index)=>{
    const result=index===0?state.incumbent:state.candidate,install=state.binding.installs[index];
    assert.equal(install.composition.profile_id,prior.profile);
    const input={question:state.queryRequest.query_text,pack:result.query};
    const semantic=value=>{const {metrics,...pack}=value.pack;return {question:value.question,pack};};
    const before=semantic(prior.input),after=semantic(input);
    return {id:prior.id,original_version:prior.version,revised_version:install.version,
      original_input_sha256:prior.input_sha256,revised_input_sha256:digest(input),
      original_non_metric_input_sha256:digest(before),revised_non_metric_input_sha256:digest(after),
      exact_non_metric_input_equal:digest(before)===digest(after),
      excluded_from_comparison:['pack.metrics'],new_model_calls:0};
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--revised-state'){
    const frozen=JSON.parse(readFileSync(new URL('app-strategy-freeze.json',examples),'utf8'));
    const comparisons=compareRevisedInputs(frozen,JSON.parse(readFileSync(process.argv[3],'utf8')));
    assert.ok(comparisons.every(row=>row.exact_non_metric_input_equal));
    const report={freeze_sha256:frozen.freeze_sha256,comparisons,
      claim:'Exact question and all non-metric pack fields match; prior model outputs remain bound to their original versions.',
      revised_model_execution:false,quality_adoption:'HOLD'};
    writeFileSync(new URL('app-strategy-revised-inputs.json',examples),JSON.stringify(report,null,2)+'\n');
    process.stdout.write(JSON.stringify(report)+'\n');
  }else if(process.argv[2]==='--freeze'){
    const frozen=freezeInstalledComparison(JSON.parse(readFileSync(process.argv[3],'utf8')));
    writeFileSync(new URL('app-strategy-freeze.json',examples),JSON.stringify(frozen,null,2)+'\n');
    process.stdout.write(JSON.stringify({freeze_sha256:frozen.freeze_sha256,variants:frozen.variants.map(v=>({id:v.id,input_sha256:v.input_sha256}))})+'\n');
  }else{
    const frozen=JSON.parse(readFileSync(new URL('app-strategy-freeze.json',examples),'utf8'));
    const responses=JSON.parse(readFileSync(new URL('app-strategy-responses.json',examples),'utf8'));
    const report={freeze_sha256:frozen.freeze_sha256,response_set_sha256:digest(responses),
      evaluations:Object.fromEntries(frozen.harness_versions.map(v=>[v,evaluateComparison(frozen,responses,v)])),
      independent_quality_review:false,adoption:'HOLD',whole_W7_complete:false};
    writeFileSync(new URL('app-strategy-evaluation.json',examples),JSON.stringify(report,null,2)+'\n');
    process.stdout.write(JSON.stringify(report)+'\n');
  }
}
