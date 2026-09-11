// Public synthetic evaluator. Never imported by application/runtime code.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createT3Fixture, semanticSources, exampleRoot } from './fixtures/context_memory_t3_fixture.mjs';
import { createAcceptedContextPack, CONTEXT_PACK_LIMITS } from '../src/runtime/accepted_context_pack.mjs';
import { searchSourceTextCorpus } from '../../rag/source_text_index.mjs';

export const digest = x => 'sha256:' + createHash('sha256').update(JSON.stringify(x)).digest('hex');
const byteDigest = x => 'sha256:' + createHash('sha256').update(x).digest('hex');
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const priority = {correction:0,decision:1,constraint:2,commitment:3,failure:4,fact:5,success:6,preference:7};
export function t4Sources() {
  const sources = semanticSources(); const body = JSON.parse(sources.current);
  const base = body.records[0];
  body.records.push({...base,id:'F-PRE',key:'qualification-prerequisite',value:'current-limit-setup',
    statement:'T-A1 bench qualification depends on completing C-LIMIT setup: set the current limit to 2 A before the run.',
    relations:[{kind:'depends_on',target:'C-LIMIT'}]});
  body.records.push({...base,id:'F-RESULT',key:'existing-result',value:'specimen-A-attached',
    statement:'The specimen A measurement result R-A is already attached to the exact P-A task T-A1; do not create a duplicate task.',
    relations:[{kind:'same_result',target:'F-TASK'}]});
  sources.current = JSON.stringify(body); return sources;
}
const specs = [
 ['F-TASK','Identify exact P-A / T-A1; matching title is insufficient.'],
 ['F-TASK,D-CURRENT,C-REVISION','Do not use another project; corrected decision is28V, not old24V; unresolved30V means no settled operating voltage.'],
 ['', 'Unauthorized actor receives no source body.'], ['', 'Missing project requires clarification.'],
 ['D-CURRENT,C-REVISION','For Q05 separate conflict-free source variant: accepted28V correction supersedes24V.'],
 ['', 'Historical answer unsupported: HOLD; never pretend current28V answers the past.'],
 ['C-REVISION,C-LIMIT','Do not apply superseded24V or withdrawn36V; current limit2A required.'],
 ['D-CURRENT,D-CONFLICT','Currentness is unconfirmed beyond accepted cutoff; do not call it latest.'],
 ['F-RESULT','Give exact verified source revision and paragraph:1 for specimen A attachment; numeric measurement is not provided.'],
 ['', 'Missing original source cannot be verified; HOLD.'],
 ['D-CURRENT,D-CONFLICT','28V versus30V is unresolved: HOLD operating choice.'],
 ['', 'Missing retrieved evidence is not proof of no past failure.'],
 ['F-PRE,C-LIMIT','State reviewed prerequisite and2A limit; cite depends_on proof.'],
 ['F-RESULT,F-TASK','R-A already belongs to exact P-A T-A1; avoid duplicate.'],
 ['P-OPEN','Person A promised to submit test record; pending.'],
 ['', 'No approved procedure source: HOLD execution, do not invent procedure.'],
 ['F-PRECEDENT,F-TASK','Polarity omission failed previously; same connector applicability.'],
 ['D-CURRENT,D-CONFLICT,C-LIMIT,F-PRE','Use decision/constraint/prerequisite; conflict holds voltage choice.'],
 ['P-COMMON','Preference is presentation only, never project acceptance fact.'],
 ['', 'Summarize supplied60C/calibration instructions without source lookup.'],
 ['D-CURRENT,D-CONFLICT,F-RESULT','Bounded proof includes both conflict sides and traceability; original ten traceability observations absent: coverage gap, not full Q21 evidence equivalence.'],
 ['D-CURRENT,D-CONFLICT,F-PRE,C-LIMIT','Stable refs; conflict remains unresolved.'],
 ['D-CURRENT,D-CONFLICT,C-REVISION','Do not approve32V: exceeds both disputed28V and30V and no authorization; correct refs with contrary prose fails.'],
 ['F-PRECEDENT,F-REVIEW,S-REVIEW','Compare failure and success for candidate improvement only; do not promote into approved procedure.'],
];
function questions() {
 const t0 = JSON.parse(readFileSync(new URL('runtime.json',exampleRoot),'utf8'));
 return t0.questions.map(q => ({id:q.id,original_question:q.question,question:q.id==='Q20'?q.question:
   q.question.replaceAll('75 C','32 V').replaceAll('90 C','24 V').replaceAll('temperature','test-voltage').replaceAll('January 4','August 2').replaceAll('Sensor review','Power-unit review'),
   request_context:q.id==='Q20'?q.request_context:[
     'This synthetic request concerns power-unit task T-A1. A source not supplied for this question is unavailable; do not borrow evidence from other questions.',
     'actor='+ (q.id==='Q03'?'unauthorized':'alpha')+'; project='+ (q.id==='Q04'?'unspecified':'P-A')+'; task=T-A1; purpose='+(q.id==='Q24'?'procedure_review':'work')+'; valid_at='+(q.id==='Q06'?'2026-08-01':q.id==='Q08'?'2026-08-08':'2026-08-05')+'; known_at='+(q.id==='Q06'?'2026-08-02':q.id==='Q08'?'2026-08-08':'2026-08-06')],
   original_question_digest:digest(q.question)}));
}
function delta(q) {
 let d={};
 if(q.id==='Q03')d.actor_ref='actor:unknown';
 if(q.id==='Q04')d.project_ref=null;
 if(q.id==='Q06')Object.assign(d,{valid_at:'2026-08-01T00:00:00.000Z',known_at:'2026-08-02T00:00:00.000Z',as_of:'2026-08-02T00:00:00.000Z'});
 if(q.id==='Q08')Object.assign(d,{valid_at:'2026-08-08T00:00:00.000Z',known_at:'2026-08-08T00:00:00.000Z',as_of:'2026-08-08T00:00:00.000Z'});
 if(q.id==='Q16')d.requested_kinds=['procedure'];
 if(q.id==='Q19')Object.assign(d,{scope:'common',requested_kinds:['preference']});
 if(q.id==='Q24')Object.assign(d,{memory_purpose:'procedure_review',requested_kinds:['failure','success','fact']});
 return d;
}
// This function cannot access evaluator gold. Every row has already traversed
// the accepted reader's project/ACL/revision/time checks before ranking.
export function selectNormal(pack, question, retrieval, mode) {
 const facts = pack.facts || [];
 if(mode==='off'||!facts.length)return [];
 let ranked = [...facts];
 if(retrieval==='lexical_bm25'||retrieval==='hybrid_exact_source') {
   const hits=searchSourceTextCorpus({queryText:question.question+' '+question.request_context.join(' '),advisoryTerms:[],
     sources:facts.map(f=>({source_id:f.id,chunks:[{chunk_id:f.id,page_numbers:[1],text:f.statement}]})),maxEvidence:12,maxPerSource:1}).hits;
   const scores=new Map(hits.map((h,i)=>[h.source_id,i]));
   ranked.sort((a,b)=>(scores.get(a.id)??999)-(scores.get(b.id)??999)||cmp(a.id,b.id));
 }
 if(retrieval==='typed_graph') {
   const connected=new Set((pack.paths||[]).filter(p=>p.target_status==='IN_PACK').flatMap(p=>[p.from,p.target]));
   ranked.sort((a,b)=>Number(connected.has(b.id))-Number(connected.has(a.id))||cmp(a.id,b.id));
 }
 if(mode==='recent')ranked.sort((a,b)=>cmp(b.known_at,a.known_at));
 if(mode==='ranked-decision')ranked.sort((a,b)=>(priority[a.kind]??9)-(priority[b.kind]??9));
 return ranked.slice(0,6);
}
function selectedMemory(pack, selected) {
 const ids=new Set(selected.map(f=>f.id));
 const omitted=(pack.facts||[]).filter(f=>!ids.has(f.id)).length;
 const conflictProofMissing=(pack.conflicts||[]).some(c=>!ids.has(c.left)||!ids.has(c.right));
 return {items:selected.map(f=>{const e=pack.evidence.find(e=>e.id===f.id);return {id:f.id,kind:f.kind,statement:f.statement,use_state:f.use_state,
   source:{source_revision_ref:e.source_revision_ref,locator:e.locator,source_span_ref:e.source_span_ref}};}),
   paths:(pack.paths||[]).filter(p=>ids.has(p.from)&&ids.has(p.target)).slice(0,6),
   conflicts:(pack.conflicts||[]).filter(c=>ids.has(c.left)||ids.has(c.right)),
   pack_status:pack.status,coverage:pack.coverage,freshness:pack.freshness,
   excluded:[...(pack.excluded||[]),...(omitted?[{reason:'SELECTOR_LIMIT',count:omitted}]:[])],
   gaps:[...(pack.gaps||[]),...(conflictProofMissing?['CONFLICT_PROOF_NOT_SELECTED']:[])]};
}
export async function generateExperiment() {
 const sources=t4Sources(), qs=questions();
 const q05Sources=structuredClone(sources); const q05Conflict=JSON.parse(q05Sources.conflict);
 q05Conflict.records=q05Conflict.records.filter(r=>r.id!=='D-CONFLICT');q05Sources.conflict=JSON.stringify(q05Conflict);
 const sourceRecords=Object.entries(sources).flatMap(([name,body])=>JSON.parse(body).records.map(r=>({...r,source_name:name,source_digest:byteDigest(body)})));
 const gold=qs.map((q,i)=>({id:q.id,include:specs[i][0].split(',').filter(Boolean),rubric:specs[i][1],
   accepted_statuses:q.id==='Q23'?['OK','HOLD']:['Q03','Q04','Q06','Q08','Q10','Q11','Q12','Q16','Q21'].includes(q.id)?['HOLD','NOT_AVAILABLE']:['OK'],
   source_variant:q.id==='Q05'?'Q05':'default',
   source_bindings:specs[i][0].split(',').filter(Boolean).map(id=>({id,source_digest:sourceRecords.find(r=>r.id===id).source_digest})),
   historical_answer_status:q.id==='Q06'?'NOT_RUN':undefined}));
 // Frozen before any accepted queries or selectors run; unchanged T0 bytes pinned.
 const freeze={version:'context-memory-t4-v1',questions_digest:digest(qs),source_digest:digest(sources),gold_digest:digest(gold),
   source_variants_digest:digest({default:sources,Q05:q05Sources}),
   t0_runtime_digest:digest(JSON.parse(readFileSync(new URL('runtime.json',exampleRoot),'utf8'))),
   budget:{...CONTEXT_PACK_LIMITS},requested_profile:{model:'gpt-6-astra',reasoning:'medium'},observed_profile:'UNKNOWN'};
 freeze.digest=digest(freeze);
 const conditions=[],batches=[],byInput=new Map();
 const definitions=[['A','lexical_bm25','off'],['B','lexical_bm25','lexical'],['C','hybrid_exact_source','ranked-decision'],['D','lexical_bm25','oracle']];
 for(const r of ['lexical_bm25','vector','typed_graph','hybrid_exact_source'])for(const m of ['off','recent','ranked-decision','oracle'])definitions.push([r+'/'+m,r,m]);
 for(const [id,retrieval,mode] of definitions) {
   if(retrieval==='vector'&& !['off','oracle'].includes(mode)) {conditions.push({id,retrieval,mode,mechanical:'NOT_RUN',semantic:'NOT_RUN',reason:'NO_VECTOR_BACKEND'});continue;}
   const memories={},rows=[],measures=[];
   for(const q of qs) {
     const x=createT3Fixture({sources:q.id==='Q05'?q05Sources:sources});
     // A fixture missing-source probe is a preparation effect, not query IO.
     if(q.id==='Q10')x.bodies.clear();
     const request={...x.request,...delta(q),memory_mode:mode==='off'||q.id==='Q20'?'off':'recall'};
     const started=performance.now();
     const pack=await createAcceptedContextPack({enabled:true,binding:x.binding,providers:x.providers,sourceReadback:x.sourceReadback}).query(request);
     const selected=mode==='oracle'? (pack.facts||[]).filter(f=>gold.find(g=>g.id===q.id).include.includes(f.id)) :selectNormal(pack,q,retrieval,mode);
     const memory=mode==='off'||q.id==='Q20'?{items:[]}:selectedMemory(pack,selected); const md=digest(memory);memories[md]=memory;
     const row={id:q.id,question:q.question,request_context:q.request_context,memory_digest:md};
     if([...JSON.stringify({...row,memory})].length>12000)throw Error('per-question input budget exceeded');
     rows.push(row);measures.push({id:q.id,request_digest:digest(request),pack_digest:pack.digest,input_digest:digest({...row,memory}),
       retrieval:{status:'RUN',selected_refs:selected.map(f=>f.id),pack_status:pack.status},
       ingestion:{accepted_generations_prepared:2,persistent_writes:0},
       fixture_gap:q.id==='Q21'?'TEN_TRACEABILITY_OBSERVATIONS_NOT_IMPLEMENTED':q.id==='Q09'?'NUMERIC_MEASUREMENT_NOT_PROVIDED':null,
       io:{source_reads:pack.metrics.source_reads,source_read_attempts:x.readLog.length,reader_calls:pack.metrics.reader_calls},
       freshness:pack.freshness,coverage:pack.coverage,elapsed_ms:performance.now()-started,
       utilization:'NOT_RUN',outcome:'NOT_RUN',tokens:'UNKNOWN',billed_cost:'UNKNOWN',tier:'UNKNOWN'});
   }
   const consumer_payload={instructions:'Use only this synthetic packet. For each question use ONLY the memory addressed by its memory_digest and its own request_context; never borrow evidence or answers from any other question. No tools, files, network or external actions. Return only JSON {"answers":[{"id":"Q01","status":"OK|HOLD|NOT_AVAILABLE","judgment":"short answer","used_refs":[],"limitations":[]}]}. Answer all24 questions. Distinguish incomplete pack coverage from final judgment. Never infer missing source facts. Each response under12000 characters. Memory IDs are citations, not conclusions.',memories,questions:rows};
   // Lossless transport dictionaries; no cross-question authorization is added.
   const contexts={},sourceDictionary={},items={}, contextKeys=new Map(),sourceKeys=new Map(),itemKeys=new Map();
   const intern=(table,keys,prefix,value)=>{const key=digest(value);if(!keys.has(key)){const id=prefix+(keys.size+1);keys.set(key,id);table[id]=value;}return keys.get(key);};
   for(const row of consumer_payload.questions){row.context_id=intern(contexts,contextKeys,'K',row.request_context);delete row.request_context;}
   for(const memory of Object.values(memories))memory.items=memory.items.map(item=>{
     const copy={...item,source_id:intern(sourceDictionary,sourceKeys,'S',item.source)};delete copy.source;
     return intern(items,itemKeys,'M',copy);
   });
   Object.assign(consumer_payload,{contexts,sources:sourceDictionary,items});
   consumer_payload.instructions+=' Decode context_id from contexts, memory.items IDs from items, and item.source_id from sources. Dictionary entries are usable only when reached through this question\'s own memory_digest; other dictionary records do not authorize access.';
   if(mode==='oracle')consumer_payload.memory_condition='Explicit evaluator-selected oracle memory; authority filters remain in force. This is diagnostic memory, not a permission exception.';
   const input_digest=digest(consumer_payload);let batch_id=byInput.get(input_digest);
   const reuse=!!batch_id;
   if(!batch_id){batch_id='batch-'+(batches.length+1);byInput.set(input_digest,batch_id);batches.push({batch_id,input_digest,consumer_payload,requested_profile:freeze.requested_profile,observed_profile:'UNKNOWN',actual_model_calls:0,semantic:'NOT_RUN'});}
   conditions.push({id,retrieval,mode,mechanical:'RUN',semantic:'NOT_RUN',batch_id,input_digest,reused_model_input:reuse,
     implementation:retrieval==='vector'?'retrieval bypass; no vector implementation':retrieval==='hybrid_exact_source'?'BM25 plus typed priority on exact-source verified pack':retrieval==='typed_graph'?'bounded one-hop typed relation ranking on accepted pack':retrieval,questions:measures});
 }
 return {freeze,gold,batches,conditions,matrix:conditions.filter(c=>c.id.includes('/')),sources,source_variants:{Q05:q05Sources},question_mapping:qs,
   limits:{unique_consumer_batches:batches.length,max_unique_consumer_batches:14,independent_semantic_review:'NOT_RUN'}};
}
// A supplied human/model semantic verdict is required; references alone never pass.
export function evaluateAnswer(answer,gold,semanticVerdict='NOT_RUN',selectedRefs=gold.include) {
 const refs=Array.isArray(answer?.used_refs)?answer.used_refs:[];
 const reference_use=gold.include.every(id=>refs.includes(id))&&refs.every(id=>selectedRefs.includes(id))?'PASS':'FAIL';
 const status_match=!gold.accepted_statuses||gold.accepted_statuses.includes(answer?.status);
 return {reference_use,status_match,semantic_utilization:semanticVerdict,outcome:semanticVerdict==='NOT_RUN'?'NOT_RUN':semanticVerdict==='PASS'&&reference_use==='PASS'&&status_match?'PASS':'FAIL',
   independent_review:'NOT_RUN'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(await generateExperiment())+'\n');
