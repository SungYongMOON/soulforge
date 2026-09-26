import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { digest, hashText } from '../../src/knowledge_layer/data.mjs';
import { sameDayContext } from '../../src/knowledge_layer/history_voice_attribution.mjs';
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
  put(join(sessions,'2026-09-23',session,'session_manifest.json'),{session_id:session,recorded_at_local:'2026-09-23T09:00:00+09:00',
    source_page_title:'합성 녹음 원제목',audio:{status:'source_present',ref:`ingress/plaud/sessions/2026-09-23/${session}/audio/source.ogg`}});
  mkdirSync(join(sessions,'2026-09-23',session,'audio'));writeFileSync(join(sessions,'2026-09-23',session,'audio','source.ogg'),'synthetic audio placeholder');
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
  assert.equal(result.records[0].text,'원문 요청 문장');assert.equal(result.records[0].kind,'voice_utterance');
  assert.equal(result.records[0].evidence_mode,'source_id');
  assert.match(result.records[0].id,/^voice_utterance:[0-9a-f]{16}:00000000$/);
  assert.deepEqual(result.records[0].originrefs[0].source_segment_ids,[0]);
  assert.equal(result.records[0].originrefs[0].attribution,'candidate_only_not_accepted');
  assert.equal(result.records[0].date,'2026-09-23');
  const display=result.displayMetadata.voice_sources[result.records[0].id];
  assert.equal(display.title,'합성 녹음 원제목');
  assert.equal(display.recorded_at,'2026-09-23T09:00:00+09:00');
  assert.equal(display.transcript_path,v.trPath);
  assert.equal(display.audio_path,join(v.sessions,'2026-09-23',v.card.session_id,'audio','source.ogg'));
  assert.equal(result.records[0].originrefs[0].source_offsets[0][0],0);
  writeFileSync(v.trPath,'changed');await assert.rejects(readVoiceHistory({...args,config}),/digest_mismatch/);
});
test('one card produces separate numbered utterances, with each own time and evidence locator',async t=>{
  const root=temp(t),v=voiceFixture(root);
  v.card.segments=v.card.segments.slice(0,1);
  Object.assign(v.card.segments[0],{source_segment_ids:[0,1],end_seconds:4});
  put(v.cardPath,v.card);
  const config={project:'P-DEMO',sessions_root:v.sessions,cards_root:v.cards,project_policy:'first_candidate'};
  const result=await readVoiceHistory({...args,config});
  assert.equal(result.records.length,2);
  assert.deepEqual(result.records.map(row=>row.originrefs[0].source_segment_ids),[[0],[1]]);
  assert.deepEqual(result.records.map(row=>row.originrefs[0].source_offsets),[[[0,0,2]],[[1,2,4]]]);
  assert.ok(result.records.every(row=>row.evidence_mode==='source_id'&&!row.text.includes('AI inferred')));
  assert.equal(new Set(result.records.map(row=>row.id)).size,2);
  assert.equal(result.records[0].thread_ref,result.records[1].thread_ref);
  const manifestPath=join(v.sessions,'2026-09-23',v.card.session_id,'session_manifest.json');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  manifest.recorded_at_local='2026-09-23T23:59:59+09:00';put(manifestPath,manifest);
  const bounded=await readVoiceHistory({...args,config});
  assert.equal(bounded.records.length,1);
  assert.equal(bounded.records[0].id,result.records[0].id);
  manifest.recorded_at_local='2026-09-22T23:59:59+09:00';put(manifestPath,manifest);
  mkdirSync(join(v.sessions,'2026-09-22'));
  renameSync(join(v.sessions,'2026-09-23',v.card.session_id),join(v.sessions,'2026-09-22',v.card.session_id));
  const overnight=await readVoiceHistory({...args,config});
  assert.equal(overnight.records.length,1);
  assert.equal(overnight.records[0].id,result.records[1].id);
  assert.equal(overnight.records[0].date,'2026-09-23');
});
test('voice cards carry the transcript they read as display-only metadata; PLAUD cards read the session-root transcript',async t=>{
  const v=voiceFixture(temp(t));
  const config={project:'P-DEMO',sessions_root:v.sessions,cards_root:v.cards,project_policy:'first_candidate'};
  const legacy=await readVoiceHistory({...args,config});
  const legacyDisplay=legacy.displayMetadata.voice_sources[legacy.records[0].id];
  assert.ok(!('transcript_source' in legacyDisplay)&&!('transcript_fallback' in legacyDisplay));
  // A PLAUD-mode card that fell back to whisper reads the same whisper run: same records, label in display only.
  put(v.cardPath,{...v.card,transcript:{...v.card.transcript,source:'whisper',fallback:'plaud_transcript_absent'}});
  const fallback=await readVoiceHistory({...args,config});
  assert.deepEqual(fallback.records.map(row=>({...row,originrefs:row.originrefs.map(({card_sha256,...rest})=>rest)})),
    legacy.records.map(row=>({...row,originrefs:row.originrefs.map(({card_sha256,...rest})=>rest)})));
  assert.equal(fallback.displayMetadata.voice_sources[fallback.records[0].id].transcript_source,'whisper');
  assert.equal(fallback.displayMetadata.voice_sources[fallback.records[0].id].transcript_fallback,'plaud_transcript_absent');
  // PLAUD primary: provider rows at the session root, no analysis run id.
  const plaudRows=[{schema_version:'soulforge.voice_transcript_segment.v0',speaker:'Speaker 1',segment_id:0,start_seconds:0,end_seconds:2,content:'합성 제공자 문장',source:'plaud_provider'},
    {schema_version:'soulforge.voice_transcript_segment.v0',speaker:'Speaker 2',segment_id:1,start_seconds:2,end_seconds:4,content:'다른 과제 문장',source:'plaud_provider'}];
  const text=plaudRows.map(x=>JSON.stringify(x)).join('\n')+'\n';
  const plaudPath=join(v.sessions,'2026-09-23',v.card.session_id,'transcript.jsonl');writeFileSync(plaudPath,text);
  put(v.cardPath,{...v.card,transcript:{run_id:'plaud_provider_transcript',sha256:hashText(text),kind:'plaud_provider',source:'plaud',fallback:null}});
  const plaud=await readVoiceHistory({...args,config});
  assert.equal(plaud.records.length,1);assert.equal(plaud.records[0].text,'합성 제공자 문장');
  const display=plaud.displayMetadata.voice_sources[plaud.records[0].id];
  assert.equal(display.transcript_source,'plaud');assert.ok(!('transcript_fallback' in display));
  assert.equal(display.transcript_path,plaudPath);
  writeFileSync(plaudPath,'changed');await assert.rejects(readVoiceHistory({...args,config}),/digest_mismatch/);
});
test('overlapping or cross-range ASR IDs fail closed; a session without a card is skipped and counted',async t=>{
  const v=voiceFixture(temp(t));const config={project:'P-DEMO',sessions_root:v.sessions,cards_root:v.cards,project_policy:'first_candidate'};
  v.card.segments[1].source_segment_ids=[0];put(v.cardPath,v.card);
  await assert.rejects(readVoiceHistory({...args,config}),/overlap/);
  v.card.segments[1].source_segment_ids=[1];v.card.segments[0].end_seconds=1;put(v.cardPath,v.card);
  await assert.rejects(readVoiceHistory({...args,config}),/range_mismatch/);
  rmSync(v.cardPath);
  const uncarded=await readVoiceHistory({...args,config});
  assert.equal(uncarded.records.length,0);assert.equal(uncarded.receipt.sessions_without_card,1);
  // With no card folder naming any real session, the cards root itself is wrong: refuse.
  rmSync(join(v.cards,v.card.session_id),{recursive:true});
  await assert.rejects(readVoiceHistory({...args,config}),/history_voice_cards_root_unmatched/);
  // Another (out-of-window) carded session proves the root; the uncarded one is skipped and counted.
  sameDaySession(v.sessions,v.cards,{day:'2026-09-20',session:'20260920_090000_demo',rows:['다른 날'],segments:[{}]});
  assert.equal((await readVoiceHistory({...args,config})).receipt.sessions_without_card,1);
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

// Same-day weak attribution: synthetic names and terms only.
function sameDaySession(sessions,cards,{day,session,title,rows,segments,verified=true}){
  put(join(sessions,day,session,'session_manifest.json'),{session_id:session,recorded_at_local:`${day}T09:00:00+09:00`,
    ...(title?{source_page_title:title}:{})});
  const text=rows.map((content,index)=>JSON.stringify({schema_version:'soulforge.voice_transcript_segment.v0',speaker:'unknown',
    segment_id:index,analysis_run_id:'asr-run',start_seconds:index*2,end_seconds:index*2+2,content})).join('\n')+'\n';
  const trPath=join(sessions,day,session,'analysis','local_asr','asr-run','transcript.jsonl');
  mkdirSync(join(trPath,'..'),{recursive:true});writeFileSync(trPath,text);
  put(join(cards,session,'card-run','conversation_list.v0.json'),{schema:'soulforge.voice_conversation_list.v0',session_id:session,
    run_id:'card-run',generated_at:'2026-09-24T00:00:00Z',verified,transcript:{run_id:'asr-run',sha256:hashText(text),kind:'independent_fast'},
    segments:segments.map((segment,index)=>({segment_id:`seg-${index}`,source_segment_ids:[index],start_seconds:index*2,end_seconds:index*2+2,
      title:'Derived navigation',description:'derived',project_candidates:[],other_project_mentions:[],status:'unclassified',...segment}))});
  return trPath;
}
function sameDayFixture(t){
  const root=temp(t),sessions=join(root,'sessions'),cards=join(root,'cards'),linear=join(root,'linear');
  mkdirSync(sessions);mkdirSync(cards);for(const kind of ['issues','comments','issue_history'])mkdirSync(join(linear,kind),{recursive:true});
  // Written Linear sources on both days.
  const issue={id:'issue-one',project_id:'project-one',title:'Synthetic task',description:'Body',created_at:'2026-09-20T00:00:00Z',updated_at:'2026-09-23T01:00:00Z',creator_id:'human-one'};
  custody(linear,'issues',issue);
  custody(linear,'comments',{id:'comment-one',issue_id:issue.id,user_id:'human-one',body:'Written note',created_at:'2026-09-22T01:00:00Z'});
  // 09-22: a first-candidate segment and an other-project mention (the day whose fingerprint must not move).
  sameDaySession(sessions,cards,{day:'2026-09-22',session:'20260922_090000_demo',rows:['후보 발화','용어 합성체계 언급'],
    segments:[{project_candidates:[{project_code:'P-DEMO',strength:'weak'}],status:'candidate'},{other_project_mentions:[{project_code:'P-OTHER'}]}]});
  // 09-23: segment 0 names the project term, 1 matches nothing, 2 has a candidate for another project.
  sameDaySession(sessions,cards,{day:'2026-09-23',session:'20260923_090000_demo',rows:['합성체계 시험 일정 이야기','날씨 이야기','다른 과제 이야기'],
    segments:[{},{},{project_candidates:[{project_code:'P-OTHER',strength:'weak'}],status:'candidate'}]});
  const peerLinear=join(root,'peer-linear');for(const kind of ['issues','comments','issue_history'])mkdirSync(join(peerLinear,kind),{recursive:true});
  custody(peerLinear,'issues',{...issue,id:'peer-issue',project_id:'project-peer'});
  const peer={project:'P-PEER',linear:{project:'P-PEER',root:peerLinear,project_ids:['project-peer']}};
  const sourceConfig=(same,peerTerms=[])=>({project:'P-DEMO',linear:{project:'P-DEMO',root:linear,project_ids:['project-one']},
    voice:{project:'P-DEMO',sessions_root:sessions,cards_root:cards,project_policy:'first_candidate',
      same_day_context:same===false?false:{project_terms:['합성체계'],peers:[{...peer,same_day_context:{project_terms:peerTerms}}]}}});
  return {root,sessions,cards,sourceConfig};
}
const window2={project:'P-DEMO',fromDate:'2026-09-22',throughDate:'2026-09-23'};
const dayDigests=records=>{const days={};for(const row of records)(days[row.date]??=[]).push(digest(row));
  return Object.fromEntries(Object.entries(days).map(([day,rows])=>[day,digest(rows)]));};
test('same-day rule attributes a no-candidate segment weakly, with its reason, only on a day with written sources',async t=>{
  const f=sameDayFixture(t);
  const on=await collectHistorySources({...window2,sourceConfig:f.sourceConfig(true)});
  const weak=on.records.filter(row=>row.originrefs[0]?.attribution==='weak_same_day_context');
  assert.deepEqual(weak.map(row=>[row.date,row.text]),[['2026-09-23','합성체계 시험 일정 이야기']]);
  assert.deepEqual(weak[0].originrefs[0].attribution_reason,{rule:'same_day_context.v1',written_sources_that_day:1,
    matches:[{kind:'project_term',term:'합성체계',field:'transcript'}]});
  // Unmatched, other-project and other-mention segments stay out and are counted.
  assert.ok(!on.records.some(row=>['날씨 이야기','다른 과제 이야기','용어 합성체계 언급'].includes(row.text)));
  assert.deepEqual(on.coverage.lanes.voice.same_day,{attributed_segments:1,attributed_utterances:1,unattributed_segments:1,
    no_written_source_day:0,no_match:1,ambiguous:0,peer_unverified:0,transcript_unverified:0});
  // A day with no newly attributed voice keeps its exact record fingerprint.
  const off=await collectHistorySources({...window2,sourceConfig:f.sourceConfig(false)});
  assert.equal(off.coverage.lanes.voice.same_day,undefined);
  const a=dayDigests(on.records),b=dayDigests(off.records);
  assert.equal(a['2026-09-22'],b['2026-09-22']);assert.notEqual(a['2026-09-23'],b['2026-09-23']);
  assert.deepEqual(on.records.filter(row=>!weak.includes(row)),off.records);
});
test('same-day rule is conservative: no written day, participant names, unverified cards, rule off without context',async t=>{
  const f=sameDayFixture(t);
  const written=[{kind:'mail',date:'2026-09-23',sender:'a@example.invalid',recipient:'b@example.invalid, c@example.invalid'},
    {kind:'slack',date:'2026-09-23',sender:'U1'}];
  const displayMetadata={person_names:{'a@example.invalid':'가나다 책임','b@example.invalid':'라마 (합성)','c@example.invalid':'Synthetic Self'},
    slack_names:{U1:'사아자/합성팀'}};
  const context=sameDayContext({project:'P-DEMO',records:written,displayMetadata,config:{exclude_participants:['사아자']}});
  assert.deepEqual(context.get('2026-09-23').participants,['가나다']);
  assert.equal(sameDayContext({project:'P-DEMO',records:written,config:false}),null);
  sameDaySession(f.sessions,f.cards,{day:'2026-09-23',session:'20260923_100000_demo',title:'합성 원제목',rows:['가나다 님이 말함','사아자 님이 말함'],segments:[{},{}]});
  const config={project:'P-DEMO',sessions_root:f.sessions,cards_root:f.cards,project_policy:'first_candidate'};
  const only=own=>({own,peers:new Map(),peersComplete:true});
  const result=await readVoiceHistory({...args,config,sameDay:only(context)});
  const weak=result.records.filter(row=>row.originrefs[0].attribution==='weak_same_day_context');
  assert.deepEqual(weak.map(row=>row.text),['가나다 님이 말함']);
  assert.deepEqual(weak[0].originrefs[0].attribution_reason.matches,[{kind:'participant',term:'가나다',field:'transcript'}]);
  // Without written sources that day nothing is attributed.
  const empty=await readVoiceHistory({...args,config,sameDay:only(new Map())});
  assert.equal(empty.records.filter(row=>row.originrefs[0].attribution==='weak_same_day_context').length,0);
  assert.ok(empty.receipt.same_day.no_written_source_day>0);
  assert.equal(empty.receipt.same_day.no_written_source_day,empty.receipt.same_day.unattributed_segments);
  // Called without context the rule is off.
  assert.equal((await readVoiceHistory({...args,config})).receipt.same_day,undefined);
  // Unverified cards are never eligible.
  sameDaySession(f.sessions,f.cards,{day:'2026-09-23',session:'20260923_100000_demo',rows:['가나다 님이 말함','사아자 님이 말함'],segments:[{},{}],verified:false});
  assert.equal((await readVoiceHistory({...args,config,sameDay:only(context)})).records.filter(row=>row.text==='가나다 님이 말함').length,0);
});
test('a transcript read only for the same-day rule never fails the lane',async t=>{
  const f=sameDayFixture(t);
  const trPath=sameDaySession(f.sessions,f.cards,{day:'2026-09-23',session:'20260923_110000_demo',rows:['합성체계 이야기'],segments:[{}]});
  writeFileSync(trPath,'changed');
  const r=await collectHistorySources({...window2,sourceConfig:f.sourceConfig(true)});
  assert.equal(r.coverage.lanes.voice.status,'ok');
  assert.equal(r.coverage.lanes.voice.same_day.transcript_unverified,1);
});
test('a PLAUD card whose session-root transcript is missing fails closed, never falling back to whisper',async t=>{
  const v=voiceFixture(temp(t));
  put(v.cardPath,{...v.card,transcript:{run_id:'plaud_provider_transcript',sha256:v.card.transcript.sha256,kind:'plaud_provider',source:'plaud',fallback:null}});
  const config={project:'P-DEMO',sessions_root:v.sessions,cards_root:v.cards,project_policy:'first_candidate'};
  await assert.rejects(readVoiceHistory({...args,config}));
  const r=await collectHistorySources({...args,sourceConfig:{project:'P-DEMO',voice:config}});
  assert.equal(r.coverage.lanes.voice.status,'error');assert.equal(r.records.length,0);
});
test('a same-day match that a peer project also has is ambiguous and not attributed',async t=>{
  const f=sameDayFixture(t);
  const r=await collectHistorySources({...window2,sourceConfig:f.sourceConfig(true,['합성체계'])});
  assert.equal(r.records.filter(row=>row.originrefs[0]?.attribution==='weak_same_day_context').length,0);
  assert.equal(r.coverage.lanes.voice.same_day.ambiguous,1);assert.equal(r.coverage.lanes.voice.same_day.attributed_segments,0);
  // A peer lane that cannot be read makes the match unverifiable, never attributed.
  const broken=f.sourceConfig(true);broken.voice.same_day_context.peers[0].linear.root=join(f.root,'absent');
  const held=await collectHistorySources({...window2,sourceConfig:broken});
  assert.equal(held.coverage.lanes.voice.status,'ok');
  assert.equal(held.coverage.lanes.voice.same_day.peer_unverified,1);
  // A same_day_context without a peers list is refused, never run unchecked.
  const off=f.sourceConfig(true);delete off.voice.same_day_context.peers;
  assert.equal((await collectHistorySources({...window2,sourceConfig:off})).coverage.lanes.voice.status,'error');
});
