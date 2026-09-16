import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowUpRight,ArrowRight,ChevronRight,CircleHelp,Clock3,Database,Server,TriangleAlert,X} from 'lucide-react';
import {UsageTrendChart} from './App';
import {dashboardQuotas,dashboardWork} from './core/operations-dashboard-view.mjs';
import {selectedUsageDay} from './core/operations-console-view.mjs';
import {when} from './operations-workspace';
import './operations-dashboard.css';
import {sourceChoices,SourcesChart,SourceRecent} from './operations-source-panels';
type Row=Record<string,any>;
type Open=(title:string,body:ReactNode)=>void;
const number=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ko-KR'):'—';
const day=(s:string)=>s?.slice(5).replace('-','/');
const resetIn=(s:any)=>{const m=Math.ceil((Date.parse(s??'')-Date.now())/60000);if(!Number.isFinite(m)||m<=0)return null;const h=Math.floor(m/60);return h>=24?`${Math.floor(h/24)}일 ${h%24}시간`:h?`${h}시간 ${m%60}분`:`${m}분`;};
const quotaResetAt=(s:any)=>Number.isFinite(Date.parse(s??''))?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s)):'미확인';
const sourceNames:Row={federation:'구조',health:'상태',recovery:'조치 이력',graph:'자료 반영',host:'호스트',usage:'사용량',limits:'한도',agQuota:'AG 한도',runtime:'에이전트',threads:'작업',recent:'최근 자료',models:'모델 서버',codexQuota:'Codex 계정 한도',sources:'원천별 기록'};

function useDetail(){
  const [detail,setDetail]=useState<{title:string;body:ReactNode}|null>(null);
  const trigger=useRef<HTMLElement|null>(null);
  const open=useCallback<Open>((title,body)=>{trigger.current=document.activeElement as HTMLElement;setDetail({title,body});},[]);
  const close=useCallback(()=>{setDetail(null);trigger.current?.focus();},[]);
  return {detail,open,close};
}
function Detail({value,close}:{value:{title:string;body:ReactNode};close:()=>void}){
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[close,value.title]);
  return <aside className="vd-detail" role="dialog" aria-modal="false" aria-label={value.title}>
    <header><h2 tabIndex={-1} ref={heading}>{value.title}</h2><button aria-label="상세 닫기" onClick={close}><X size={19}/></button></header>
    <div className="vd-detail-body">{value.body}</div>
  </aside>;
}
function Info({label,children,open}:{label:string;children:ReactNode;open:Open}){return <button className="vd-info" aria-label={`${label} 근거`} onClick={()=>open(label,children)}><CircleHelp size={15}/></button>;}
export function SourceNotice({failed}:{failed:string[]}){
  if(!failed.length)return null;
  return <details className="vd-source"><summary><span className="vd-dot amber"/>관측 조회 실패 <strong>{failed.length}</strong><ChevronRight size={13}/></summary><p>{failed.map(k=>sourceNames[k]??k).join(' · ')}</p><p>위 항목의 새 관측을 읽지 못했습니다. 값이 남아 있다면 관측 시각의 보존 자료입니다.</p></details>;
}
function QuotaFacts({r}:{r:Row}){return <><dl className="vd-facts"><dt>제공자</dt><dd>{r.provider}</dd><dt>한도 창</dt><dd>{r.window}</dd><dt>{r.current?'남은 한도':'마지막 관측 잔량'}</dt><dd>{r.remaining===null?'미제공':`${number(r.remaining)}%`}</dd><dt>관측</dt><dd>{when(r.observed_at)}</dd><dt>초기화</dt><dd>{when(r.reset)}</dd></dl><p>{r.current?'제공된 창의 현재 관측입니다.':'현재 잔량은 확인되지 않았습니다. 지난 초기화 시각이나 오래된 관측값을 현재 한도로 사용하지 않습니다.'}</p><p>{r.provider.startsWith('AG·')?`Antigravity ${r.provider.replace('AG·','')} 모델 묶음의 공유 한도입니다. 개별 모델의 잔량은 제공되지 않습니다. 모델별 요청 이력은 사용 추이에서 별도로 확인합니다.`:''}</p><p>창과 계정마다 기준이 다르므로 서로 더하지 않습니다. 남은 토큰 개수는 제공되지 않습니다.</p></>;}
export function QuotaStrip({inputs,failed=[]}:{inputs:Row;failed?:string[]}){
  const {detail,open,close}=useDetail();const rows:Row[]=dashboardQuotas(inputs,failed);
  const rank=(window:string)=>window==='5시간'?0:window==='주간'?1:2;
  const windows=[...new Set(rows.map(r=>r.window))].sort((a,b)=>rank(a)-rank(b));
  return <><section className="vd-quota-overview" aria-label="남은 사용 한도">
    <header><h2>남은 한도</h2><span>막대는 남은 비율 · 초기화 시각 KST</span></header>
    <div className="vd-quota-groups">{windows.map(window=><section className="vd-quota-group" key={window} aria-label={`${window} 한도`}><h3>{window}</h3>
      {rows.filter(r=>r.window===window).map(r=><button className={`vd-quota-line ${!r.current?'unknown':r.remaining<10?'low':r.remaining<25?'warning':''}`} key={r.id} onClick={()=>open(`${r.provider} · ${r.window}`,<QuotaFacts r={r}/>)} aria-label={`${r.provider} ${r.window} ${r.current?Math.round(r.remaining)+'% 남음':'현재 잔량 미확인'} · 초기화 ${quotaResetAt(r.reset)}`}>
        <span className="vd-quota-provider">{r.provider.startsWith('AG·')?<><strong>Antigravity</strong><small>{r.provider.replace('AG·','')} 공유</small></>:<strong>{r.provider}</strong>}</span>
        <span className="vd-quota-meter" aria-hidden="true">{r.current&&<i style={{width:`${r.remaining}%`}}/>}</span>
        <span className="vd-quota-balance"><strong>{r.current?`${Math.round(r.remaining)}%`:'—'}</strong><small>{r.current?'남음':'미확인'}</small></span>
        <span className="vd-quota-deadline"><time>{r.current?quotaResetAt(r.reset):'현재 관측 없음'}</time><small>{r.current&&resetIn(r.reset)?`${resetIn(r.reset)} 후 초기화`:`마지막 ${when(r.observed_at)}`}</small></span>
      </button>)}
    </section>)}</div>
  </section>{detail&&<Detail value={detail} close={close}/>}</>;
}

function HostFacts({host,retained=false}:{host:Row;retained?:boolean}){
  return <><dl className="vd-facts"><dt>서버 접속</dt><dd>{retained?'보존 관측':host.connection==='responding'?'API 응답 확인':host.connection==='refused'?'접속 거부':'확인 불가'}</dd><dt>응답 시간</dt><dd>{number(host.elapsed_ms)} ms</dd><dt>토큰 사용량</dt><dd>서버별 계측 미연결</dd><dt>모델 등록</dt><dd>{number(host.registered_count)}</dd><dt>메모리 적재</dt><dd>{number(host.resident_count)}</dd><dt>실제 추론</dt><dd>미검사</dd><dt>확인 시각</dt><dd>{when(host.observed_at)}</dd></dl>
    {host.connection==='refused'&&<p>설정된 주소가 접속을 받지 않습니다. 이 API 관측만으로 종료 원인이나 업무 영향을 확정하지 않습니다.</p>}
    <p>미적재는 서버 중단과 다릅니다. 조회는 모델을 적재하거나 추론을 실행하지 않습니다.</p>
    {host.models?.length>0&&<><h3>제공된 모델 {host.models.length}개</h3><table className="vd-records"><thead><tr><th>모델</th><th>등록</th><th>적재</th></tr></thead><tbody>{host.models.map((m:Row)=><tr key={m.model}><td>{m.model}<small>{m.roles?.join(' · ')}</small></td><td>{m.registered===true?'확인':m.registered===false?'없음':'—'}</td><td>{m.resident===true?'적재':m.resident===false?'미적재':'—'}</td></tr>)}</tbody></table></>}
  </>;
}
export function ServerStrip({data,failed=false}:{data?:Row;failed?:boolean}){
  const {detail,open,close}=useDetail();
  return <><div className="vd-servers" aria-label="모델 서버 상태"><span className="vd-strip-label"><Server size={14}/>모델</span>{data?.hosts?.map((h:Row)=><button key={h.id} onClick={()=>open(h.label,<HostFacts host={h} retained={failed}/>)}><span className={`vd-dot ${failed?'muted':h.connection==='responding'?'blue':h.connection==='refused'?'red':'amber'}`}/><strong>{h.id==='gpu-response'?'GPU PC':h.id==='local-ollama'?'PC Ollama':h.label.replace(' · RAG 모델','')}</strong><small>{failed?'보존값':h.connection==='responding'?`접속됨 · ${number(h.elapsed_ms)} ms · ${h.resident_count===0?'미적재':typeof h.resident_count==='number'?h.resident_count+'개 적재':'적재 미확인'}`:h.connection==='refused'?'접속 불가':h.connection==='timeout'?'응답 시간 초과':'미확인'}</small><ChevronRight size={12}/></button>)}{!data?.hosts?.length&&<span className="vd-muted">조회 대기</span>}</div>{detail&&<Detail value={detail} close={close}/>}</>;
}

function Attention({model,inputs,failed,go,open}:{model:Row;inputs:Row;failed:string[];go:(n:any)=>void;open:Open}){
  const hosts=failed.includes('models')?[]:(inputs.models?.hosts??[]).filter((h:Row)=>h.connection==='refused'||h.connection==='timeout');
  const watched=model.healthAvailable?model.attention.filter((n:Row)=>n.status.key!=='unknown'):[];
  const length=hosts.length+watched.length;
  const observed=model.healthAvailable&&Boolean(inputs.models?.hosts?.length)&&!failed.includes('models');
  return <section className="vd-attention" aria-label="주의 항목"><div className="vd-attention-title"><TriangleAlert size={16}/><strong>주의</strong><span>{observed?length:length?`≥ ${length}`:'—'}</span></div><div className="vd-attention-items">
    {hosts.slice(0,1).map((h:Row)=><button key={h.id} onClick={()=>open(h.label,<HostFacts host={h}/>)}><span className="vd-dot red"/><strong>{h.label.replace(' · 응답 모델','')}</strong><span>{h.connection==='refused'?'연결 거부':'응답 지연'}</span><ChevronRight size={14}/></button>)}
    {watched.slice(0,2).map((n:Row)=><button key={n.id} onClick={()=>go({screen:'system',node:n.id})}><span className={`vd-dot ${n.status.key==='problem'?'red':'amber'}`}/><strong>{n.id==='watchtower::ingress_supervisor'?'수집 점검':n.label}</strong><span>{n.status.label}{n.status.count!==null?` ${n.status.count}건`:''}</span><small>{model.healthCurrent?'':'보존 검사'}</small><ChevronRight size={14}/></button>)}
    {!length&&<span className="vd-muted">{model.healthAvailable?'검사 범위 내 별도 주의 없음':'상태 관측 미확인'}</span>}
  </div><button className="vd-attention-all" onClick={()=>open('관측 상태',<><p>검사 {when(model.observedAt)} · {model.healthCurrent?'최근 관측':'보존 검사'}</p><p>주의 {observed?length:'전체 미확인'} · 미확인 {model.sourceAvailable?number(model.counts?.unknown):'—'}</p><div className="vd-history-list">{hosts.map((h:Row)=><button key={h.id} onClick={()=>open(h.label,<HostFacts host={h}/>)}>{h.label}<small>접속 확인 필요</small></button>)}{watched.map((n:Row)=><button key={n.id} onClick={()=>go({screen:'system',node:n.id})}>{n.label}<small>{n.status.label}</small></button>)}</div><button onClick={()=>go({screen:'system',node:null})}>시스템 지도<ArrowRight size={14}/></button></>)}>전체<ArrowUpRight size={14}/></button></section>;
}

export function OperationsDashboard({model,inputs,failed,go}:{model:Row;inputs:Row;failed:string[];go:(n:any)=>void}){
  const {detail,open,close}=useDetail(),[selectedDay,setSelectedDay]=useState<string|null>(null),[sourceId,setSourceId]=useState('all');
  const sources=sourceChoices(inputs);
  const work=dashboardWork(inputs,failed);
  const chooseUsage=(selection:Row|null)=>{if(!selection?.date)return;const picked=selectedUsageDay(inputs.usage?.history,selection.date,selection.modelId,selection.excludedModelIds);if(!picked)return;
    open(`${picked.date} · 사용량`,<><table className="vd-records"><thead><tr><th>모델</th><th>토큰</th><th>회차</th></tr></thead><tbody>{picked.rows.map((r:Row)=><tr key={r.model_id}><td>{r.model_id}</td><td>{number(r.total_tokens)}</td><td>{number(r.turns)}</td></tr>)}</tbody></table><p>모델별 측정 이력입니다. 선택 날짜와 작업별 집계의 직접 귀속은 별도 근거가 필요합니다.</p><button className="cx-primary" onClick={()=>{close();go({screen:'usage',node:null});}}>사용 이력 <ArrowRight size={15}/></button></>);
  };
  return <div className="vd-dashboard">
    <QuotaStrip inputs={inputs} failed={failed}/>
    <Attention model={model} inputs={inputs} failed={failed} go={go} open={open}/>
    <div className="vd-charts"><section className="vd-panel vd-usage"><header><h2>사용 추이</h2><Info label="사용량 기준" open={open}><p>기존 사용량 원장의 토큰 이력입니다. 모델/제공자와 7일/30일 전환을 유지합니다.</p><p>AG 요청 수는 토큰 합계와 별도이며 차트 우측 축의 ‘회’ 단위로 표시됩니다. 토큰 미측정 회차와 날짜 귀속 범위는 차트 하단의 집계 범위에서 확인할 수 있습니다.</p><p>관측 {when(inputs.usage?.history?.generated_at)}</p></Info><button className="vd-header-link" onClick={()=>go({screen:'usage',node:null})}>사용 이력<ArrowUpRight size={14}/></button></header>
      {failed.includes('usage')&&<span className="vd-small-state">보존 이력 · 새 조회 실패</span>}<UsageTrendChart usage={inputs.usage} onSelection={chooseUsage} compact/>
    </section><SourcesChart sources={sources} sourceId={sourceId} select={id=>{setSourceId(id);setSelectedDay(null);}} retained={failed.includes(sourceId==='plaud'?'recent':'sources')} open={open} onDay={setSelectedDay} selectedDay={selectedDay}/></div>
    <ServerStrip data={inputs.models} failed={failed.includes('models')}/>
    <div className="vd-bottom"><section className="vd-panel vd-work"><header><h2>에이전트 활동</h2><span className="vd-count">{work.complete?work.rows.length:'—'}</span><Info label="에이전트 활동 관측" open={open}><p>실행이 관측된 작업만 표시합니다. 등록된 봇이나 프로세스 생존을 작업 중으로 계산하지 않습니다.</p><p>Hermes: {work.runtimeKnown?'관측 연결':'현재 관측 미확인'}<br/>Codex: {work.threadKnown?'관측 연결':'현재 관측 미확인'}</p>{inputs.runtime?.bots?.map((b:Row)=><p key={b.bot_id}>{b.display_label} · {b.hold_code??b.state?.value??'미확인'}</p>)}</Info></header>
      {work.rows.length?work.rows.slice(0,4).map((r:Row)=><button className="vd-task-row" key={r.id} onClick={()=>open(r.label,<dl className="vd-facts"><dt>실행 상태</dt><dd>{r.state}</dd><dt>모델</dt><dd>{r.model??'미확인'}</dd></dl>)}><span className="vd-dot blue"/><strong>{r.label}</strong><small>{['waiting','waiting_for_user','waiting_for_approval'].includes(r.state)?'대기':'작업 중'}</small></button>):<div className="vd-work-empty"><Clock3 size={20}/><span>{work.complete?'관측된 활성 작업 없음':'활성 세션 조회 미확인'}</span><button onClick={()=>open('에이전트 활동 연결',<p>실행 관측 연결을 읽지 못했습니다. 활성 작업이 0개라는 뜻은 아닙니다.</p>)}>근거<ChevronRight size={13}/></button></div>}
      <div className="vd-chart-foot"><span>Hermes {work.runtimeKnown?'연결':'관측 미연결'} · Codex {work.threadKnown?'연결':'관측 미연결'} </span></div>
    </section><SourceRecent sources={sources} sourceId={sourceId} selectedDay={selectedDay} open={open} go={go}/></div>
    <button className="vd-rag-summary" onClick={()=>go({screen:'rag',node:null})}><Database size={15}/><span>RAG 반영 이력</span><strong>{failed.includes('graph')?'—':number(inputs.graph?.summary?.completed)}건</strong><small>최근 {when(inputs.graph?.summary?.last_reflected_at)} · 활성 세션과 별도</small><ArrowUpRight size={14}/></button>
    {detail&&<Detail value={detail} close={close}/>}
  </div>;
}
