import {sourceLinkKey} from './rag-source-link.mjs';
import path from 'node:path';
import {readRootTable,physicalRootFor} from '../../../../../guild_hall/path_registry/src/root_table.mjs';
import {readBoundedFile} from '../../../../../guild_hall/context_engine/src/runtime/attachment_access.mjs';
import {createOperationsDirectoryReader} from './operations-directory-adapter.mjs';
import {createMailCollectionHistoryReader} from './mail-collection-history.mjs';

const dateOf=value=>Number.isFinite(Date.parse(value??''))?new Date(Date.parse(value)).toISOString():null;
const day=value=>new Date(Date.parse(value)+9*3600000).toISOString().slice(0,10);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export function observationSeries(id,label,basis,records,observedAt,scope,partial=true){
  const end=day(observedAt),days=Array.from({length:30},(_,i)=>day(new Date(Date.parse(`${end}T00:00:00+09:00`)-(29-i)*86400000).toISOString()));
  const accepted=records.filter(r=>dateOf(r.at)&&Date.parse(r.at)<=Date.parse(observedAt)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const window=accepted.filter(r=>day(r.at)>=days[0]),buckets=new Map();
  for(const r of window)if(count(r.value)!==null)buckets.set(day(r.at),(buckets.get(day(r.at))??0)+r.value);
  return {id,label,basis,scope,state:partial?'partial':'ready',observed_at:observedAt,rows:accepted.slice(0,12),timeline:{state:partial?'partial':'ready',as_of:observedAt,start:days[0],end,daily:days.map(date=>({date,registrations:buckets.get(date)??null,partial:true})),total:buckets.size?[...buckets.values()].reduce((a,b)=>a+b,0):null,records:window.slice(0,500),records_limited:window.length>500,records_total:window.length}};
}
export function createSourceObservationsReader(options={}){
  const mailHistory=createMailCollectionHistoryReader();
  const directory=createOperationsDirectoryReader(options),projects=(options.projects??[]).filter(p=>/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u.test(p));
  let cache,pending;
  async function read(){
    let table;try{table=readRootTable(options);}catch{return {state:'unavailable',sources:[],reason:'허용 경로 표 검증 실패'};}
    if(cache&&cache.digest===table.table_sha256&&Date.now()-cache.at<60000)return cache.value;
    if(pending)return pending;
    pending=(async()=>{
      const root=physicalRootFor(table,'data_root'),observedAt=new Date().toISOString();
      const json=async(relative,schema)=>{const data=JSON.parse(await readBoundedFile(path.join(root,...relative.split('/')),root,8*1024*1024));if(schema&&!schema.includes(data.schema_version))throw Error('shape');return data;};
      const source=async(id,label,readOne)=>{try{return await readOne();}catch{return {id,label,state:'unavailable',rows:[],basis:'근거 읽기 실패',scope:'미연결·읽기 실패를 0으로 집계하지 않음'};}};
      const sources=await Promise.all([
        source('slack','Slack',async()=>{
          const rows=[],seen=new Set();let missing=0;
          for(const project of projects){try{const state=await json(`ingress/slack/channels/${project}/state/slack-continuous.json`,['soulforge.slack_continuous.state.v1']);if(!Array.isArray(state.revisions))throw Error('shape');for(const r of [...state.revisions].sort((a,b)=>String(b.revision_ts??'').localeCompare(String(a.revision_ts??'')))){if(typeof r.message_ref!=='string'||!/^[0-9]{10,16}\.[0-9]{6}$/u.test(r.message_ts??''))continue;const key=`${r.channel_id}:${r.message_ref}`;if(seen.has(key))continue;seen.add(key);const ms=Number(r.message_ts)*1000;if(!Number.isFinite(ms)||!Number.isFinite(new Date(ms).getTime()))continue;rows.push({id:key,source:'Slack',title:`${project} · 메시지`,at:new Date(ms).toISOString(),value:1,status:'보관 원장에 기록',basis:'메시지 작성 시각',rag_key:sourceLinkKey('slack',`${r.channel_id}:${r.message_ts}`,r.revision_ref)});}}catch{missing++;}}
          if(missing===projects.length)throw Error('missing');
          return observationSeries('slack','Slack','메시지 작성일',rows,observedAt,`허용 채널 원장 ${projects.length-missing}/${projects.length}개 · 현재 보관 기록 · 수집 완료량 아님`);
        }),
        source('linear','Linear',async()=>{
          const state=await json('linear_history/state/state/linear-collect.json',['soulforge.linear_collect.state.v1']);if(!state.object_index||typeof state.object_index!=='object')throw Error('shape');
          const rows=Object.entries(state.object_index).filter(([key])=>/^issues:[a-f0-9-]{36}$/u.test(key)).map(([id,r])=>({id,source:'Linear',title:`이슈 · ${id.slice(7,15)}`,at:dateOf(r.updated_at),value:1,status:'보관 인덱스 기록',basis:'이슈 최종 수정 시각',rag_key:sourceLinkKey('linear',id.slice(7),r.content_sha256)}));
          return observationSeries('linear','Linear','이슈 수정일',rows,observedAt,'현재 이슈 인덱스의 최종 수정 분포 · 신규 수집·변경 이력 전체가 아님');
        }),
        source('mail','메일',async()=>{
          return mailHistory.read(root,observedAt);
        }),
        source('docs','DOC',async()=>{
          const queue=[{relative:'ingress/team_files',depth:0}],rows=[];let scanned=0,failed=0;
          while(queue.length&&scanned<32){const current=queue.shift();scanned++;const result=await directory.read({root:'data_root',relative:current.relative});if(!['ready','partial'].includes(result.state)){failed++;continue;}
            for(const entry of result.entries){if(entry.browsable&&current.depth<3)queue.push({relative:`${current.relative}/${entry.name}`,depth:current.depth+1});else if(entry.kind==='file'&&/\.(pdf|docx?|hwpx?|xlsx?|pptx?|md|txt|csv)$/iu.test(entry.name))rows.push({id:`${current.relative}/${entry.name}`,source:'DOC',title:entry.name,at:entry.modified_at,value:1,size:entry.size,status:'파일 메타데이터 확인',basis:'파일 수정 시각'});}
          }
          if(failed===scanned)throw Error('missing');
          return observationSeries('docs','DOC','파일 수정일',rows,observedAt,`팀 문서 ${scanned}개 폴더 · 최대 깊이 3 · 일부 목록 · 읽기 실패 ${failed}곳 · 수집 완료량 아님`);
        }),
      ]);
      const value={state:sources.every(s=>s.state==='unavailable')?'unavailable':'partial',observed_at:observedAt,sources};cache={value,at:Date.now(),digest:table.table_sha256};return value;
    })();try{return await pending;}finally{pending=null;}
  }
  return {read};
}
