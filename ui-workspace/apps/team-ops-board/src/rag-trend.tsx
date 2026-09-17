import {useState} from 'react';
import {ragTrend} from './core/rag-trend.mjs';
import './rag-trend.css';
type Row=Record<string,any>;
const n=(v:any)=>typeof v==='number'?v.toLocaleString('ko-KR'):'—';
const time=(v:number)=>new Date(v).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
function TrendPlot({title,unit,series,points}:{title:string;unit:string;series:Row[];points:Row[]}){
  const [selected,setSelected]=useState<number|null>(null);
  const max=Math.max(1,...points.flatMap(p=>series.map(s=>p[s.key]??0))),w=320,h=90;
  const x=(i:number)=>34+(points.length===1?.5:i/(points.length-1))*270,y=(v:number)=>h-v/max*68;
  const latest=points.at(-1),first=points.find(p=>typeof p[series[0].key]==='number'),last=[...points].reverse().find(p=>typeof p[series[0].key]==='number');
  const delta=first&&last&&first.at!==last.at?last[series[0].key]-first[series[0].key]:null;
  const active=selected===null?latest:points[selected];
  return <figure className="rt-plot"><figcaption><strong>{title}</strong><span>{n(latest?.[series[0].key])}<small> {unit}</small></span></figcaption>
    <div className="rt-legend">{series.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.label}</span>)}<small>{delta===null?'변화 미확인':`기간 내 변화 ${delta>0?'+':''}${n(delta)}`}</small></div>
    <svg viewBox={`0 0 ${w} 112`} role="img" aria-label={`${title} 보유량 추세`}>
      {[0,max].map(v=><g key={v}><line x1="34" x2="304" y1={y(v)} y2={y(v)} className="rt-grid"/><text x="28" y={y(v)+3} textAnchor="end">{n(v)}</text></g>)}
      {series.map(s=>{let connected=false;const d=points.map((p,i)=>{if(typeof p[s.key]!=='number'){connected=false;return '';}const cmd=connected?'L':'M';connected=true;return `${cmd}${x(i)},${y(p[s.key])}`;}).join(' ');return <g key={s.key}><path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash}/>{points.map((p,i)=>typeof p[s.key]==='number'?<circle key={i} cx={x(i)} cy={y(p[s.key])} r="2.5" fill={s.color}/>:null)}</g>;})}
      {points.map((p,i)=><rect key={p.at} x={x(i)-Math.min(7,125/points.length)} y="16" width={Math.min(14,250/points.length)} height="77" fill="transparent" tabIndex={0} role="button" aria-label={`${p.label??time(p.at)} ${series.map(s=>`${s.label} ${n(p[s.key])}${unit}`).join(' · ')}`} onFocus={()=>setSelected(i)} onMouseEnter={()=>setSelected(i)} onBlur={()=>setSelected(null)} onMouseLeave={()=>setSelected(null)}><title>{p.label??time(p.at)} · {series.map(s=>`${s.label} ${n(p[s.key])}${unit}`).join(' · ')}</title></rect>)}
      <text x="34" y="108">{points.length?points[0].label??time(points[0].at):''}</text><text x="304" y="108" textAnchor="end">{points.length>1?points.at(-1)!.label??time(points.at(-1)!.at):''}</text>
    </svg><div className="rt-readout">{active?`${active.label??time(active.at)} · ${series.map(s=>`${s.label} ${n(active[s.key])}`).join(' · ')}`:'측정 기록 없음'}</div>
  </figure>;
}
export function RagTrend({projects,expected,asOf}:{projects:Row[];expected:number;asOf?:string}){
  const [days,setDays]=useState(7);
  const trend=ragTrend(projects,expected,days,asOf);
  return <section className="rt-trends" aria-label="RAG 축적과 처리 추세"><header><h3>검색 자료 보유량 추세</h3><div className="op-period" role="group" aria-label="RAG 조회 기간">{[1,7,30].map(d=><button key={d} aria-pressed={days===d} onClick={()=>setDays(d)}>{d}일</button>)}</div><small>{expected}개 과제 · KST</small></header>{trend.points.length?<div className="rt-grid-plots" key={days}>
    <TrendPlot key={`${days}-documents`} title="검색 목록의 문서" unit="개" points={trend.points} series={[{key:'documents',label:'문서',color:'var(--blue,#79afff)'}]}/>
    <TrendPlot title="검색 청크·벡터" unit="개" points={trend.points} series={[{key:'embedded',label:'벡터 포함',color:'#62c5b2'},{key:'chunks',label:'전체 청크',color:'#8392a5',dash:'4 4'}]}/>
    <TrendPlot title="실행 기록의 대기·실패" unit="건" points={trend.points} series={[{key:'pending',label:'대기',color:'#dbb663'},{key:'failed',label:'실패',color:'#ed857b'}]}/>
    </div>:<p>추세를 그릴 실행 기록이 아직 없습니다.</p>}<p className="rt-note">문서·청크는 시점별 보유량입니다. {days===1?'시간':'날짜'}별 마지막 측정 · 보존된 최근 30일 실행 기록 · 전 과제 근거가 없는 구간은 연결하지 않습니다.{trend.partial?' 이전 이력은 일부만 표시됩니다.':''}</p></section>;
}
