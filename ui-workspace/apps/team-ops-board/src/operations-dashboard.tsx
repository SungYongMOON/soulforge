import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowUpRight,ArrowRight,ChevronRight,CircleHelp,Clock3,Database,FileAudio,Server,TriangleAlert,X} from 'lucide-react';
import {UsageTrendChart} from './App';
import {dashboardQuotas,dashboardWork} from './core/operations-dashboard-view.mjs';
import {selectedUsageDay} from './core/operations-console-view.mjs';
import {when} from './operations-workspace';
import './operations-dashboard.css';
type Row=Record<string,any>;
type Open=(title:string,body:ReactNode)=>void;
const number=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ko-KR'):'—';
const day=(s:string)=>s?.slice(5).replace('-','/');
const resetIn=(s:any)=>{const m=Date.parse(s??'')-Date.now();if(!Number.isFinite(m)||m<=0)return null;const h=Math.ceil(m/3600000);return h>=24?`${Math.floor(h/24)}일 ${h%24}시간`:`${h}시간`;};
const sourceNames:Row={federation:'구조',health:'상태',recovery:'조치 이력',graph:'자료 반영',host:'호스트',usage:'사용량',limits:'한도',agQuota:'AG 한도',runtime:'에이전트',threads:'작업',recent:'최근 자료',models:'모델 서버'};

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
function QuotaFacts({r}:{r:Row}){return <><dl className="vd-facts"><dt>제공자</dt><dd>{r.provider}</dd><dt>한도 창</dt><dd>{r.window}</dd><dt>{r.current?'남은 한도':'마지막 관측 잔량'}</dt><dd>{r.remaining===null?'미제공':`${number(r.remaining)}%`}</dd><dt>관측</dt><dd>{when(r.observed_at)}</dd><dt>초기화</dt><dd>{when(r.reset)}</dd></dl><p>{r.current?'제공된 창의 현재 관측입니다.':'현재 잔량은 확인되지 않았습니다. 지난 초기화 시각이나 오래된 관측값을 현재 한도로 사용하지 않습니다.'}</p><p>창과 계정마다 기준이 다르므로 서로 더하지 않습니다. 남은 토큰 개수는 제공되지 않습니다.</p></>;}
export function QuotaStrip({inputs,failed=[]}:{inputs:Row;failed?:string[]}){
  const {detail,open,close}=useDetail();const rows=dashboardQuotas(inputs,failed);
  return <><section className="vd-quota-strip" aria-label="남은 사용 한도">
    {rows.slice(0,4).map((r:Row)=><button className={`vd-quota ${r.current&&r.remaining<10?'low':''}`} key={r.id} onClick={()=>open(`${r.provider} · ${r.window}`,<QuotaFacts r={r}/>)}>
      <span className="vd-quota-label">{r.provider}<small>{r.window}</small></span>
      <span className="vd-quota-value">{r.current?`${Math.round(r.remaining)}%`:'—'}<small>{r.current?'남음':'조회 미확인'}</small></span>
      {r.current?<span className="vd-quota-track"><i style={{width:`${r.remaining}%`}}/></span>:<span className="vd-quota-unknown"/>}
      <small className="vd-reset">{r.current&&resetIn(r.reset)?`${resetIn(r.reset)} 후 초기화`:'관측·초기화 정보'}</small>
    </button>)}
    {rows.length>4&&<button className="vd-quota-more" onClick={()=>open('추가 한도',<div className="vd-more-quotas">{rows.slice(4).map((r:Row)=><section key={r.id}><h3>{r.provider} · {r.window}</h3><QuotaFacts r={r}/></section>)}</div>)}>AG 등<br/>{rows.length-4}개<ChevronRight size={14}/></button>}
  </section>{detail&&<Detail value={detail} close={close}/>}</>;
}

function HostFacts({host,retained=false}:{host:Row;retained?:boolean}){
  return <><dl className="vd-facts"><dt>서버 접속</dt><dd>{retained?'보존 관측':host.connection==='responding'?'API 응답 확인':host.connection==='refused'?'접속 거부':'확인 불가'}</dd><dt>모델 등록</dt><dd>{number(host.registered_count)}</dd><dt>메모리 적재</dt><dd>{number(host.resident_count)}</dd><dt>실제 추론</dt><dd>미검사</dd><dt>확인 시각</dt><dd>{when(host.observed_at)}</dd></dl>
    {host.connection==='refused'&&<p>설정된 주소가 접속을 받지 않습니다. 이 API 관측만으로 종료 원인이나 업무 영향을 확정하지 않습니다.</p>}
    <p>미적재는 서버 중단과 다릅니다. 조회는 모델을 적재하거나 추론을 실행하지 않습니다.</p>
    {host.models?.length>0&&<><h3>제공된 모델 {host.models.length}개</h3><table className="vd-records"><thead><tr><th>모델</th><th>등록</th><th>적재</th></tr></thead><tbody>{host.models.map((m:Row)=><tr key={m.model}><td>{m.model}<small>{m.roles?.join(' · ')}</small></td><td>{m.registered===true?'확인':m.registered===false?'없음':'—'}</td><td>{m.resident===true?'적재':m.resident===false?'미적재':'—'}</td></tr>)}</tbody></table></>}
  </>;
}
export function ServerStrip({data,failed=false}:{data?:Row;failed?:boolean}){
  const {detail,open,close}=useDetail();
  return <><div className="vd-servers" aria-label="모델 서버 상태"><span className="vd-strip-label"><Server size={14}/>모델</span>{data?.hosts?.map((h:Row)=><button key={h.id} onClick={()=>open(h.label,<HostFacts host={h} retained={failed}/>)}><span className={`vd-dot ${failed?'muted':h.connection==='responding'?'blue':h.connection==='refused'?'red':'amber'}`}/><strong>{h.id==='gpu-response'?'GPU PC':h.id==='local-ollama'?'PC Ollama':h.label.replace(' · RAG 모델','')}</strong><small>{failed?'보존값':h.connection==='responding'?'API 응답':h.connection==='refused'?'접속 거부':'미확인'}</small><ChevronRight size={12}/></button>)}{!data?.hosts?.length&&<span className="vd-muted">조회 대기</span>}</div>{detail&&<Detail value={detail} close={close}/>}</>;
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

function RegistrationChart({recent,failed,open,onDay,selected}:{recent?:Row;failed:boolean;open:Open;onDay:(d:string|null)=>void;selected:string|null}){
  const t=recent?.timeline,rows:Row[]=t?.daily??[],known=rows.filter(r=>typeof r.registrations==='number');
  const max=Math.max(1,...known.map(r=>r.registrations));
  return <section className="vd-panel vd-arrival-chart"><header><h2>자료 등록</h2><span className="vd-source-pill">PLAUD</span><Info label="자료 등록 기준" open={open}><p>기존 PLAUD 라이브러리의 등록일별 고유 녹음 수입니다. 모든 수집원의 전체 처리량이나 RAG 완료량이 아닙니다.</p><dl className="vd-facts"><dt>기준</dt><dd>{when(t?.as_of)}</dd><dt>기간</dt><dd>{t?.start} – {t?.end}</dd><dt>시간대</dt><dd>KST</dd><dt>제외된 행</dt><dd>{number(t?.excluded_rows)}</dd></dl><p>마지막 날짜는 관측 시각까지만 포함합니다. 중복·날짜 누락이 있으면 부분 집계로 표시하며 불확실한 빈 날짜는 0으로 그리지 않습니다. Slack·DOC 등록 시계열은 현재 연결되지 않았습니다.</p></Info></header>
    {known.length?<><div className="vd-chart-value"><strong>{t.state==='partial'?'≥ ':''}{number(t.total)}<small>건</small></strong><span>{day(t.start)}–{day(t.end)}{failed?' · 보존값':t.state==='partial'?' · 일부 기록':''}</span></div>
      <div className="vd-bars" role="group" aria-label="PLAUD 날짜별 등록 건수"><div className="vd-bar-axis"><span>{max}</span><span>{Math.floor(max/2)}</span><span>0</span></div><div className="vd-bar-plot">{rows.map((r:Row,i:number)=><button key={r.date} className={`${selected===r.date?'selected':''} ${r.registrations===null?'unknown':''}`} aria-label={`${r.date} 등록 ${r.registrations===null?'미확인':r.registrations+'건'}${r.partial?' · 부분 날짜':''}`} aria-pressed={selected===r.date} title={`${r.date} · ${r.registrations??'미확인'}건`} onClick={()=>onDay(selected===r.date?null:r.date)}><span className="vd-bar-value">{r.registrations??'—'}</span><i style={{height:r.registrations===null?'0%':`${r.registrations/max*100}%`}}/><small>{i===0||i===rows.length-1||i%3===0?day(r.date):''}</small></button>)}</div></div>
      <div className="vd-chart-foot"><span>등록일 기준 · 마지막 날짜 일부</span>{selected&&<button onClick={()=>onDay(null)}>날짜 해제</button>}</div></>:<div className="vd-chart-empty">등록 이력 미확인</div>}
  </section>;
}

function ArrivalFacts({row}:{row:Row}){return <dl className="vd-facts"><dt>원천</dt><dd>{row.source}</dd><dt>녹음일</dt><dd>{row.date??'미확인'}</dd><dt>등록 시각</dt><dd>{when(row.at)}</dd><dt>처리 기록</dt><dd>{row.status}</dd><dt>전사 단위</dt><dd>{number(row.segments)}</dd><dt>음성 조각</dt><dd>{number(row.chunks)}</dd><dt>식별자</dt><dd>{row.id}</dd><dt>RAG 반영</dt><dd>이 등록 기록만으로 확인 불가</dd></dl>;}

export function OperationsDashboard({model,inputs,failed,go}:{model:Row;inputs:Row;failed:string[];go:(n:any)=>void}){
  const {detail,open,close}=useDetail(),[selectedDay,setSelectedDay]=useState<string|null>(null);
  const work=dashboardWork(inputs,failed),all:Row[]=inputs.recent?.rows??[];
  const recent:Row[]=selectedDay?(inputs.recent?.timeline?.records??[]).filter((r:Row)=>Number.isFinite(Date.parse(r.at))&&new Date(Date.parse(r.at)+9*3600000).toISOString().slice(0,10)===selectedDay):all.slice(0,4);
  const chooseUsage=(selection:Row|null)=>{if(!selection?.date)return;const picked=selectedUsageDay(inputs.usage?.history,selection.date,selection.modelId,selection.excludedModelIds);if(!picked)return;
    open(`${picked.date} · 사용량`,<><table className="vd-records"><thead><tr><th>모델</th><th>토큰</th><th>회차</th></tr></thead><tbody>{picked.rows.map((r:Row)=><tr key={r.model_id}><td>{r.model_id}</td><td>{number(r.total_tokens)}</td><td>{number(r.turns)}</td></tr>)}</tbody></table><p>모델별 측정 이력입니다. 선택 날짜와 작업별 집계의 직접 귀속은 별도 근거가 필요합니다.</p><button className="cx-primary" onClick={()=>{close();go({screen:'usage',node:null});}}>사용 이력 <ArrowRight size={15}/></button></>);
  };
  return <div className="vd-dashboard">
    <QuotaStrip inputs={inputs} failed={failed}/>
    <Attention model={model} inputs={inputs} failed={failed} go={go} open={open}/>
    <div className="vd-charts"><section className="vd-panel vd-usage"><header><h2>사용 추이</h2><Info label="사용량 기준" open={open}><p>기존 사용량 원장의 토큰 이력입니다. 모델/제공자와 7일/30일 전환을 유지합니다.</p><p>AG 요청 수는 토큰 합계와 별도이며 차트 우측 축의 ‘회’ 단위로 표시됩니다. 토큰 미측정 회차와 날짜 귀속 범위는 차트 하단의 집계 범위에서 확인할 수 있습니다.</p><p>관측 {when(inputs.usage?.history?.generated_at)}</p></Info><button className="vd-header-link" onClick={()=>go({screen:'usage',node:null})}>사용 이력<ArrowUpRight size={14}/></button></header>
      {failed.includes('usage')&&<span className="vd-small-state">보존 이력 · 새 조회 실패</span>}<UsageTrendChart usage={inputs.usage} onSelection={chooseUsage} compact/>
    </section><RegistrationChart recent={inputs.recent} failed={failed.includes('recent')} open={open} onDay={setSelectedDay} selected={selectedDay}/></div>
    <ServerStrip data={inputs.models} failed={failed.includes('models')}/>
    <div className="vd-bottom"><section className="vd-panel vd-work"><header><h2>작업</h2><span className="vd-count">{work.complete?work.rows.length:'—'}</span><Info label="작업 관측" open={open}><p>실행이 관측된 작업만 표시합니다. 등록된 봇이나 프로세스 생존을 작업 중으로 계산하지 않습니다.</p><p>Hermes: {work.runtimeKnown?'관측 연결':'현재 관측 미확인'}<br/>Codex: {work.threadKnown?'관측 연결':'현재 관측 미확인'}</p>{inputs.runtime?.bots?.map((b:Row)=><p key={b.bot_id}>{b.display_label} · {b.hold_code??b.state?.value??'미확인'}</p>)}</Info></header>
      {work.rows.length?work.rows.slice(0,4).map((r:Row)=><button className="vd-task-row" key={r.id} onClick={()=>open(r.label,<dl className="vd-facts"><dt>실행 상태</dt><dd>{r.state}</dd><dt>모델</dt><dd>{r.model??'미확인'}</dd></dl>)}><span className="vd-dot blue"/><strong>{r.label}</strong><small>{['waiting','waiting_for_user','waiting_for_approval'].includes(r.state)?'대기':'작업 중'}</small></button>):<div className="vd-work-empty"><Clock3 size={20}/><span>{work.complete?'관측된 활성 작업 없음':'활동 관측 미확인'}</span><button onClick={()=>open('작업 연결',<p>실행 관측 연결을 읽지 못했습니다. 활성 작업이 0개라는 뜻은 아닙니다.</p>)}>근거<ChevronRight size={13}/></button></div>}
      <button className="vd-rag-link" onClick={()=>go({screen:'rag',node:null})}><Database size={15}/><span>RAG 반영 기록</span><strong>{failed.includes('graph')?'—':number(inputs.graph?.summary?.completed)}</strong><small>{when(inputs.graph?.summary?.last_reflected_at)}</small><ArrowUpRight size={14}/></button>
    </section><section className="vd-panel vd-recent"><header><h2>{selectedDay?`${day(selectedDay)} 등록`:'최근 자료'}</h2><span className="vd-source-pill">PLAUD</span><button className="vd-header-link" onClick={()=>go({screen:'directory',node:null})}>데이터 공간<ArrowUpRight size={14}/></button></header>
      {recent.slice(0,6).map((r:Row)=><button className="vd-arrival-row" key={r.id} onClick={()=>open(`${r.date??''} 녹음`,<><ArrivalFacts row={r}/><button className="cx-primary" onClick={()=>{close();go({screen:'directory',node:null});}}>데이터 공간<ArrowRight size={14}/></button></>)}><FileAudio size={18}/><strong>{r.date??'날짜 미확인'} 녹음</strong><span>전사 {number(r.segments)}</span><time>{when(r.at)}</time><ChevronRight size={14}/></button>)}
      {!recent.length&&<p className="vd-muted">{selectedDay?'제공된 날짜별 목록에 표시할 자료 없음':'등록 기록 미확인'}</p>}
      <div className="vd-chart-foot"><span>{selectedDay?`${Math.min(recent.length,6)} / ${recent.length}개 표시${inputs.recent?.timeline?.records_limited?' · 목록 일부':''}`:'최근 등록 기록'} · RAG 반영 별도</span>{selectedDay?<button onClick={()=>open(`${selectedDay} 등록 기록`,<><p>{recent.length}개 기록{inputs.recent?.timeline?.records_limited?' · 제공 목록 일부':''}</p><div className="vd-history-list">{recent.map((r:Row)=><button key={r.id} onClick={()=>open(`${r.date??''} 녹음`,<ArrivalFacts row={r}/>)}><span>{r.date??'날짜 미확인'} 녹음</span><small>{when(r.at)} · 전사 {number(r.segments)}</small></button>)}</div></>)}>날짜 기록<ArrowUpRight size={12}/></button>:<button onClick={()=>go({screen:'rag',node:null})}>전체 원천 처리<ArrowRight size={12}/></button>}</div>
    </section></div>
    {detail&&<Detail value={detail} close={close}/>}
  </div>;
}
