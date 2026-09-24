import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { hashText } from '../../src/knowledge_layer/data.mjs';
import { readLinearHistory, readVoiceHistory, collectHistorySources } from '../../src/knowledge_layer/history_sources.mjs';

function temp(t) { const root=mkdtempSync(join(tmpdir(),'history-sources-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root; }
function put(path,value) { mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify(value)); }
function custody(root,kind,object){
  const sha=sha256Canonical(object), path=join(root,kind,object.id,sha.slice(7)+'.json');
  put(path,{schema_version:'soulforge.linear_collect.custody_object.v1',kind,object_id:object.id,content_sha256:sha,object});
  return path;
}
const args={project:'P-DEMO',fromDate:'2026-09-23',throughDate:'2026-09-23'};
test('Linear uses exact project membership and native dates; AI work notes do not become source records',async t=>{
  const root=temp(t); for(const kind of ['issues','comments','issue_history'])mkdirSync(join(root,kind));
  const issue={id:'issue-one',project_id:'project-one',title:'Synthetic task',description:'Source paragraph',
    created_at:'2026-09-20T00:00:00Z',updated_at:'2026-09-23T00:00:00Z',creator_id:'human-one'};
  custody(root,'issues',issue);
  custody(root,'issues',{...issue,id:'issue-ai',description:'AI Business Notes: synthetic judgment'});
  custody(root,'issues',{...issue,id:'foreign',project_id:'other-project',description:'Never returned'});
  custody(root,'comments',{id:'comment-one',issue_id:issue.id,user_id:'human-one',body:'A human asked for a drawing.',created_at:'2026-09-22T16:00:00Z',updated_at:'2026-09-23T01:00:00Z'});
  custody(root,'comments',{id:'comment-old',issue_id:issue.id,user_id:'human-one',body:'Old comment',created_at:'2026-09-21T16:00:00Z',updated_at:'2026-09-23T01:00:00Z'});
  custody(root,'comments',{id:'comment-ai',issue_id:issue.id,user_id:'memo-bot',body:'Unaccepted inference',created_at:'2026-09-23T01:00:00Z'});
  custody(root,'comments',{id:'comment-foreign',issue_id:'foreign',user_id:'human-one',body:'Out of project',created_at:'2026-09-23T01:00:00Z'});
  custody(root,'issue_history',{id:'change-one',issue_id:issue.id,actor_id:'human-one',created_at:'2026-09-23T02:00:00Z',from_state_id:'open',to_state_id:'done'});
  const result=await readLinearHistory({...args,config:{project:'P-DEMO',root,project_ids:['project-one'],ai_note_markers:['AI Business Notes'],ai_note_user_ids:['memo-bot']}});
  assert.equal(result.records.length,3);assert.equal(result.excluded.filter(x=>x.reason==='ai_work_note').length,2);
  assert.ok(result.records.every(x=>x.date==='2026-09-23'));
  assert.ok(result.records.some(x=>x.text.includes('A human asked')));
  assert.ok(result.records.some(x=>x.text.includes('open → done')));
  assert.ok(result.records.every(x=>!x.text.includes('Out of project')&&!x.text.includes('Old comment')));
  const bad=join(root,'issues',issue.id,'0'.repeat(64)+'.json');put(bad,{schema_version:'soulforge.linear_collect.custody_object.v1',kind:'issues',object_id:issue.id,object:issue,content_sha256:'sha256:'+'0'.repeat(64)});
  await assert.rejects(readLinearHistory({...args,config:{project:'P-DEMO',root,project_ids:['project-one']}}),/custody_mismatch/);
});

function voiceFixture(root){
  const sessions=join(root,'sessions'),cards=join(root,'cards');mkdirSync(sessions);mkdirSync(cards);
  const session='20260923_090000_demo',run='card-run',transcriptRun='asr-run';
  put(join(sessions,'2026-09-23',session,'session_manifest.json'),{session_id:session,recorded_at_local:'2026-09-23T09:00:00+09:00'});
  const rows=[{schema_version:'soulforge.voice_transcript_segment.v0',speaker:'unknown',segment_id:0,analysis_run_id:transcriptRun,start_seconds:0,end_seconds:2,content:'원문 요청 문장'},
    {schema_version:'soulforge.voice_transcript_segment.v0',speaker:'unknown',segment_id:1,analysis_run_id:transcriptRun,start_seconds:2,end_seconds:4,content:'다른 과제의 발언'}];
  const text=rows.map(x=>JSON.stringify(x)).join('\n')+'\n';
  const trPath=join(sessions,'2026-09-23',session,'analysis','local_asr',transcriptRun,'transcript.jsonl');mkdirSync(join(trPath,'..'),{recursive:true});writeFileSync(trPath,text);
  const card={schema:'soulforge.voice_conversation_list.v0',session_id:session,run_id:run,generated_at:'2026-09-24T00:00:00Z',
    transcript:{run_id:transcriptRun,sha256:hashText(text),kind:'independent_fast'},segments:[
      {segment_id:'seg-one',source_segment_ids:[0],start_seconds:0,end_seconds:2,title:'Derived navigation',description:'AI inferred remaining work, must not be sent',project_candidates:[{project_code:'P-DEMO'}],status:'candidate'},
      {segment_id:'seg-two',source_segment_ids:[1],start_seconds:2,end_seconds:4,title:'Other project',description:'Other summary',project_candidates:[{project_code:'P-OTHER'}],status:'candidate'}]};
  const cardPath=join(cards,session,run,'conversation_list.v0.json');put(cardPath,card);
  return{sessions,cards,cardPath,card,trPath};
}
test('voice cards select attributed native ASR spans, never their AI descriptions',async t=>{
  const v=voiceFixture(temp(t));
  const config={project:'P-DEMO',sessions_root:v.sessions,cards_root:v.cards,project_policy:'first_candidate'};
  const result=await readVoiceHistory({...args,config});assert.equal(result.records.length,1);
  assert.equal(result.records[0].text,'원문 요청 문장');assert.equal(result.records[0].kind,'voice_card_unverified_ASR');
  assert.equal(result.records[0].originrefs[0].attribution,'candidate_only_not_accepted');
  assert.equal(result.records[0].date,'2026-09-23');
  writeFileSync(v.trPath,'changed');await assert.rejects(readVoiceHistory({...args,config}),/digest_mismatch/);
});
test('missing cards and overlapping or cross-range ASR IDs fail closed',async t=>{
  const v=voiceFixture(temp(t));const config={project:'P-DEMO',sessions_root:v.sessions,cards_root:v.cards,project_policy:'first_candidate'};
  v.card.segments[1].source_segment_ids=[0];put(v.cardPath,v.card);
  await assert.rejects(readVoiceHistory({...args,config}),/overlap/);
  v.card.segments[1].source_segment_ids=[1];v.card.segments[0].end_seconds=1;put(v.cardPath,v.card);
  await assert.rejects(readVoiceHistory({...args,config}),/range_mismatch/);
  rmSync(v.cardPath);await assert.rejects(readVoiceHistory({...args,config}),/card_missing/);
});
test('a human route withdrawal vetoes a later candidate without reactivating its source',async t=>{
  const root=temp(t),v=voiceFixture(root),routes=join(root,'routes');mkdirSync(routes);
  const id=v.card.session_id, at='2026-09-23T10:00:00+09:00';
  put(join(routes,id+'.json'),{schema_version:'soulforge.voice_route_ledger.v0',session_id:id,updated_at:at,segments:[{
    segment_id:'seg-one',source_segment_ids:[0],start_seconds:0,end_seconds:2,title:'Synthetic',description:null,
    derived_summary:true,nature:'project_work',project_candidates:[{project_code:'P-DEMO',evidence_refs:['fixture'],basis:'fixture'}],
    status:'candidate',quality:{transcript:'independent_fast',correction_state:'none'},
    transcript_ref:['analysis','local_asr','asr-run','transcript.jsonl'],audio_ref:['audio','source.mp3'],
    related_segment_ids:[],draft_source:null,judged_by:'actor:fixture',judged_at:at,confirmed_by:null,confirmed_at:null,
    withdrawn:[{project_code:'P-DEMO',withdrawn_by:'actor:owner',withdrawn_at:at}]
  }]});
  const r=await readVoiceHistory({...args,config:{project:'P-DEMO',sessions_root:v.sessions,cards_root:v.cards,
    routes_root:routes,project_policy:'first_candidate'}});
  assert.equal(r.records.length,0);
});
test('collector reports missing lanes explicitly, never as trusted empty',async()=>{
  const r=await collectHistorySources({...args,sourceConfig:{project:'P-DEMO'}});
  assert.equal(r.records.length,0);assert.ok(Object.values(r.coverage.lanes).every(x=>x.status==='missing'));
});
