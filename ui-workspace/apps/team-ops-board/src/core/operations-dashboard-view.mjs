import {buildClaudeQuotaPresentation,selectCodexRateLimitObservation} from './provider-limits.mjs';
import {antigravityQuotaRows} from './antigravity-quota.mjs';
const validPercent=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
const iso=n=>Number.isFinite(n)&&Number.isFinite(new Date(n).getTime())?new Date(n).toISOString():null;
const fresh=(value,now)=>Number.isFinite(Date.parse(value??''))&&now-Date.parse(value)>=0&&now-Date.parse(value)<600000;
const windowLabel=minutes=>minutes===300?'5시간':minutes===10080?'주간':Number.isFinite(minutes)?`${minutes}분`:'기간 미확인';

export function dashboardQuotas(inputs={},failed=[],now=Date.now()){
  const direct=inputs.codexQuota?.state==='ready'&&!failed.includes('codexQuota');
  const codex=direct?inputs.codexQuota.codex:inputs.limits?.codex,slots=new Map(),meter=failed.includes('usage')?null:inputs.usage?.history?.rate_limit;
  for(const item of [codex?.primary,codex?.secondary]){
    if(!item||!validPercent(item.used_percent))continue;
    const live={...item,observed_at:codex.observed_at};
    slots.set(item.window_minutes,selectCodexRateLimitObservation({live,meter:meter?.window_minutes===item.window_minutes?meter:null,nowMs:now}));
  }
  if(meter&&validPercent(meter.used_percent)&&!slots.has(meter.window_minutes)&&(slots.size===0||fresh(meter.observed_at,now)&&meter.resets_at_epoch_s*1000>now))slots.set(meter.window_minutes,meter);
  const rows=[...slots.values()].map(w=>{const reset=iso(w.resets_at_epoch_s*1000);return {id:`codex-${w.window_minutes}`,provider:'Codex',window:windowLabel(w.window_minutes),remaining:100-w.used_percent,observed_at:w.observed_at,reset,current:(direct||!failed.includes('limits')||w===meter)&&fresh(w.observed_at,now)&&Date.parse(reset)>now};});
  if(!rows.length)rows.push({id:'codex-unavailable',provider:'Codex',window:'한도',remaining:null,observed_at:null,reset:null,current:false});
  const claude=buildClaudeQuotaPresentation(inputs.limits);
  for(const [key,window,provider] of [['five_hour','5시간','Claude'],['seven_day','주간','Claude'],['fable_weekly','주간','Claude Fable']]){
    const w=claude.claude[key];if(key==='fable_weekly'&&!w)continue;
    rows.push({id:`claude-${key}`,provider,window,remaining:validPercent(w?.utilization)?100-w.utilization:null,observed_at:claude.claude.observed_at,reset:w?.resets_at??null,
      current:!failed.includes('limits')&&claude.current&&fresh(claude.claude.observed_at,now)&&Date.parse(w?.resets_at??'')>now});
  }
  for(const [i,r] of antigravityQuotaRows(inputs.agQuota?.snapshot??inputs.agQuota).entries())rows.push({id:`ag-${i}`,provider:r.provider,window:r.window.replace(' 창',''),remaining:r.remaining_percent,reset:r.resets_at,observed_at:r.observed_at,
    current:!failed.includes('agQuota')&&r.freshness==='current'&&fresh(r.observed_at,now)&&Date.parse(r.resets_at??'')>now});
  return rows;
}

const kstDay=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
export function registrationTimeline(data,days=14){
  const asOf=Date.parse(data?.generated_at??'');
  if(!Number.isFinite(asOf)||!Array.isArray(data?.recordings)||!Number.isInteger(days)||days<1||days>30)return {state:'unavailable',daily:[],reason:'등록 원장 시각 미확인'};
  const end=kstDay(asOf),endMs=Date.parse(`${end}T00:00:00+09:00`),ids=new Map();
  for(const row of data.recordings){if(typeof row?.recording_id==='string'&&row.recording_id)ids.set(row.recording_id,(ids.get(row.recording_id)??0)+1);}
  let excluded=0;const dates=new Map(),accepted=[];
  for(const row of data.recordings){const ms=Date.parse(row?.registered_at_kst??'');
    if(typeof row?.recording_id!=='string'||!row.recording_id||ids.get(row.recording_id)!==1||!Number.isFinite(ms)||ms>asOf){excluded++;continue;}
    const day=kstDay(ms);dates.set(day,(dates.get(day)??0)+1);
    accepted.push({id:row.recording_id,source:'PLAUD',date:typeof row.recording_date==='string'?row.recording_date.slice(0,30):null,at:new Date(ms).toISOString(),
      status:row.status_summary?.ok===true?'자료 등록 · 처리 기록 있음':row.status_summary?.ok===false?'처리 기록에 오류':'처리 미확인',
      segments:Number.isSafeInteger(row.status_summary?.transcript_segments)&&row.status_summary.transcript_segments>=0?row.status_summary.transcript_segments:null,
      chunks:Number.isSafeInteger(row.status_summary?.audio_chunks)&&row.status_summary.audio_chunks>=0?row.status_summary.audio_chunks:null});
  }
  const daily=Array.from({length:days},(_,i)=>{const date=kstDay(endMs-(days-i-1)*86400000),n=dates.get(date)??0;return {date,registrations:excluded&&n===0?null:n,partial:excluded>0||date===end};});
  accepted.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const records=accepted.filter(r=>kstDay(Date.parse(r.at))>=daily[0].date&&kstDay(Date.parse(r.at))<=end);
  return {state:excluded?'partial':'ready',source:'PLAUD',measure:'현재 라이브러리의 등록일별 고유 녹음 수',time_zone:'Asia/Seoul',as_of:data.generated_at,start:daily[0].date,end,daily,excluded_rows:excluded,total:daily.some(r=>r.registrations!==null)?daily.reduce((s,r)=>s+(r.registrations??0),0):null,last_day_partial:true,
    recent:accepted.slice(0,8),records:records.slice(0,500),records_total:records.length,records_limited:records.length>500};
}

export function dashboardWork(inputs={},failed=[]){
  const runtime=inputs.runtime,threads=inputs.threads;
  const runtimeKnown=runtime?.refresh_state==='ready'&&!failed.includes('runtime');
  const threadKnown=threads?.adapter?.health==='ready'&&!failed.includes('threads');
  const bots=(runtime?.bots??[]).filter(b=>runtimeKnown&&b.state?.kind==='observed'&&['working','starting','waiting'].includes(b.state.value)).map(b=>({id:b.bot_id,label:b.display_label,state:b.state.value,model:b.model?.value??null}));
  const tasks=(threads?.threads??[]).filter(t=>threadKnown&&t.observed===true&&['running','working','waiting_for_user','waiting_for_approval'].includes(t.status)).map(t=>({id:t.thread_id,label:t.display_label,state:t.status,model:null}));
  return {rows:[...bots,...tasks],complete:runtimeKnown&&threadKnown,runtimeKnown,threadKnown};
}
