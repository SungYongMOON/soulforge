import path from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';
import {opendir} from 'node:fs/promises';
import {readBoundedFile} from '../../../../../guild_hall/context_engine/src/runtime/attachment_access.mjs';

const NAME=/^(\d{8})T\d{9}Z_[A-Za-z0-9_-]{1,130}\.json$/u;
const count=n=>Number.isSafeInteger(n)&&n>=0;
const kst=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
export function projectMailRun(receipt,id,observedAt){
  const at=Date.parse(receipt?.completed_at??''),started=Date.parse(receipt?.started_at??'');
  if(!['soulforge.ingress.continuous_run_receipt.v1','soulforge.ingress.continuous_run_receipt.v2','soulforge.ingress.continuous_run_receipt.v3'].includes(receipt?.schema_version)
    ||receipt.run_id!==id||!Number.isFinite(at)||!Number.isFinite(started)||started>at||at>Date.parse(observedAt))return null;
  const m=receipt.mail;
  const measured=m?.write_count_known===true&&['ok','partial'].includes(m.status)
    &&count(m.total_new_events)&&count(m.total_events)&&count(m.total_duplicates)
    &&m.total_new_events+m.total_duplicates===m.total_events;
  return {id,at:new Date(at).toISOString(),value:measured?m.total_new_events:null,
    failed:m?.status==='failed',partial:m?.partial===true||m?.status==='partial',measured};
}
export function aggregateMailRuns(runs,observedAt,diagnostics={},days=14){
  const end=kst(Date.parse(observedAt)),startMs=Date.parse(`${end}T00:00:00+09:00`)-(days-1)*86400000;
  const dates=Array.from({length:days},(_,i)=>kst(startMs+i*86400000));
  const buckets=new Map(dates.map(date=>[date,{date,known:0,unknown:0,failed:0,partialRuns:0,total:0,last:null}]));
  const seen=new Set();let duplicateRuns=0;
  for(const run of runs){if(!run)continue;if(seen.has(run.id)){duplicateRuns++;continue;}seen.add(run.id);
    const b=buckets.get(kst(Date.parse(run.at)));if(!b)continue;
    if(!b.last||run.at>b.last)b.last=run.at;
    if(run.value===null)b.unknown++;else{b.known++;b.total+=run.value;}
    if(run.failed)b.failed++;
    if(run.partial)b.partialRuns++;
  }
  const daily=[...buckets.values()].map(b=>({date:b.date,registrations:b.known?b.total:null,partial:true,runs:b.known+b.unknown,unmeasured_runs:b.unknown,failed_runs:b.failed,partial_runs:b.partialRuns}));
  const total=daily.some(d=>d.registrations!==null)?daily.reduce((sum,d)=>sum+(d.registrations??0),0):null;
  const records=[...buckets.values()].filter(b=>b.last).reverse().map(b=>({id:`mail-day-${b.date}`,source:'메일',title:`${b.date.slice(5).replace('-','/')} 신규 수집 ${b.known?b.total.toLocaleString('ko-KR')+'건':'미확인'}`,at:b.last,value:b.known?b.total:null,
    basis:'수집일 · 실행 영수증 일별 집계',status:`확인 ${b.known}회 · 부분 실행 ${b.partialRuns}회 · 건수 미확인 ${b.unknown}회 · 실패 ${b.failed}회`,runs:b.known+b.unknown}));
  const unmeasuredDays=daily.filter(d=>d.registrations===null||d.unmeasured_runs>0||d.partial_runs>0).length;
  const measuredRuns=daily.reduce((sum,d)=>sum+d.runs-d.unmeasured_runs,0),unmeasuredRuns=daily.reduce((sum,d)=>sum+d.unmeasured_runs,0);
  const hours=new Map(),hourSeen=new Set();for(const run of runs){if(!run?.at||hourSeen.has(run.id))continue;hourSeen.add(run.id);const ms=Date.parse(run.at),today=Date.parse(`${end}T00:00:00+09:00`);if(ms<today)continue;const at=Math.floor(ms/3600000)*3600000,key=new Date(at).toISOString();const row=hours.get(key)??{date:key,registrations:null,partial:true};if(count(run.value))row.registrations=(row.registrations??0)+run.value;hours.set(key,row);}
  const hourly=[...hours.values()];
  return {id:'mail',label:'메일',basis:'수집일',state:measuredRuns?'partial':'unavailable',observed_at:observedAt,
    scope:`최근 ${days}일 기존 수집 영수증 · 확인 ${measuredRuns}회 / 건수 미확인 ${unmeasuredRuns}회 · 신규 등록 항목 합계 · 메일 수신일·보관 전체 건수·RAG 완료와 별도`,
    coverage:{...diagnostics,measured_runs:measuredRuns,unmeasured_runs:unmeasuredRuns,unmeasured_days:unmeasuredDays,duplicate_runs:duplicateRuns},rows:records.slice(0,12),
    timeline:{hourly:hourly,hourly_records:hourly.map(r=>({id:`mail-hour-${r.date}`,source:'메일',at:r.date,value:r.registrations,title:`신규 수집 ${r.registrations??'미확인'}건`,basis:'수집 실행 시각 · 시간별 합계',status:'기존 실행 영수증 합산 · RAG 개별 연결 미확인'})),state:'partial',as_of:observedAt,start:dates[0],end,daily,total,records,records_total:records.length,records_limited:false}};
}
function admit(root){
  let current=path.resolve(root);const stamps=[];
  for(const part of ['','state','receipts','continuous_ingress']){if(part)current=path.join(current,part);const s=lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(current)!==current)throw Error('unsafe history directory');stamps.push(`${s.dev}:${s.ino}`);}
  return {directory:current,identity:stamps.join('/')};
}
export function createMailCollectionHistoryReader(){
  let cachedIdentity='',cache=new Map();
  return {async read(root,observedAt){
    const days=30;
    if(!path.isAbsolute(root))throw Error('absolute history root required');root=path.resolve(root);
    const admitted=admit(root),identity=`${root}:${admitted.identity}`;
    if(identity!==cachedIdentity){cache.clear();cachedIdentity=identity;}
    const end=kst(Date.parse(observedAt)),startMs=Date.parse(`${end}T00:00:00+09:00`)-(days-1)*86400000;
    // Include two days of start-time overlap; aggregate by actual completion day.
    const cutoff=new Date(startMs-2*86400000).toISOString().slice(0,10).replaceAll('-','');
    const names=[];let examined=0,truncated=false;
    for await(const entry of await opendir(admitted.directory)){if(examined++>=10000){truncated=true;break;}const match=NAME.exec(entry.name);if(match&&match[1]>=cutoff)names.push(entry.name);}
    names.sort().reverse();if(names.length>6000)truncated=true;const selected=names.slice(0,6000);
    const wanted=new Set(selected);for(const name of cache.keys())if(!wanted.has(name))cache.delete(name);
    const results=new Array(selected.length);let cursor=0,bytesRead=0,unreadable=0,invalid=0;
    await Promise.all(Array.from({length:8},async()=>{while(cursor<selected.length){const index=cursor++,name=selected[index],target=path.join(admitted.directory,name);try{
      const stat=lstatSync(target,{bigint:true});if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size>262144n)throw Error('unsafe receipt');
      const stamp=[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');let value;
      if(cache.get(name)?.stamp===stamp)value=cache.get(name).value;
      else{bytesRead+=Number(stat.size);if(bytesRead>32*1024*1024){truncated=true;throw Error('read budget');}
        const raw=await readBoundedFile(target,root,262144);value=projectMailRun(JSON.parse(raw),name.slice(0,-5),observedAt);if(value)cache.set(name,{stamp,value});}
      if(!value||Date.parse(value.at)>Date.parse(observedAt))invalid++;else results[index]=value;
    }catch{unreadable++;}}}));
    if(admit(root).identity!==admitted.identity)throw Error('history directory changed');
    return aggregateMailRuns(results.filter(Boolean),observedAt,{examined_files:examined,selected_files:selected.length,unreadable_files:unreadable,invalid_receipts:invalid,limited:truncated},days);
  }};
}
