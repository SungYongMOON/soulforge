import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowUpRight,ArrowRight,ChevronRight,CircleHelp,Clock3,Database,Server,X} from 'lucide-react';
import {UsageTrendChart} from './App';
import {dashboardQuotas,dashboardWork} from './core/operations-dashboard-view.mjs';
import {selectedUsageDay} from './core/operations-console-view.mjs';
import {when} from './operations-workspace';
import './operations-dashboard.css';
import {sourceChoices,SourcesChart,SourceRecent} from './operations-source-panels';
import {OperationsJudgment,RagPipeline,LocalModels} from './operations-control';
import {OperationsSummary} from './operations-summary';
import {OperationsHostStrip} from './operations-host-strip';
import {MailRulePanel} from './operations-mail-rules';
type Row=Record<string,any>;
type Open=(title:string,body:ReactNode)=>void;
const number=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ko-KR'):'—';
const day=(s:string)=>s?.slice(5).replace('-','/');
const resetIn=(s:any)=>{const m=Math.ceil((Date.parse(s??'')-Date.now())/60000);if(!Number.isFinite(m)||m<=0)return null;const h=Math.floor(m/60);return h>=24?`${Math.floor(h/24)}일 ${h%24}시간`:h?`${h}시간 ${m%60}분`:`${m}분`;};
const quotaResetAt=(s:any)=>Number.isFinite(Date.parse(s??''))?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s)):'미확인';
const sourceNames:Row={federation:'구조',health:'상태',recovery:'조치 이력',graph:'자료 반영',host:'호스트',usage:'사용량',limits:'한도',agQuota:'AG 한도',runtime:'에이전트',threads:'작업',recent:'최근 자료',models:'모델 서버',codexQuota:'Codex 계정 한도',sources:'원천별 기록',rag:'RAG·후처리',incidents:'운영 판정'};

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
  return <details className="vd-source"><summary><span className="vd-dot amber"/>최신 상태 조회 실패 <strong>{failed.length}</strong><ChevronRight size={13}/></summary><p>{failed.map(k=>sourceNames[k]??k).join(' · ')}</p><p>위 항목의 새 상태을 읽지 못했습니다. 값이 남아 있다면 마지막 확인 시각의 자료입니다.</p></details>;
}
function QuotaFacts({r}:{r:Row}){return <><dl className="vd-facts"><dt>제공자</dt><dd>{r.provider}</dd><dt>한도 적용 기간</dt><dd>{r.window}</dd><dt>{r.current?'남은 한도':'마지막 확인 잔량'}</dt><dd>{r.remaining===null?'미제공':`${number(r.remaining)}%`}</dd><dt>확인 시각</dt><dd>{when(r.observed_at)}</dd><dt>초기화</dt><dd>{when(r.reset)}</dd></dl><p>{r.current?'해당 기간에 적용되는 남은 한도입니다.':'현재 잔량은 확인되지 않았습니다. 지난 초기화 시각이나 오래된 관측값을 현재 한도로 사용하지 않습니다.'}</p><p>{r.provider.startsWith('AG·')?`Antigravity ${r.provider.replace('AG·','')} 모델 묶음의 공유 한도입니다. 개별 모델의 잔량은 제공되지 않습니다. 모델별 요청 이력은 사용 추이에서 별도로 확인합니다.`:''}</p><p>기간과 계정마다 기준이 다르므로 서로 더하지 않습니다. 남은 토큰 개수는 제공되지 않습니다.</p></>;}
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
        <span className="vd-quota-deadline"><time>{r.current?quotaResetAt(r.reset):'최신 값 없음'}</time><small>{r.current&&resetIn(r.reset)?`${resetIn(r.reset)} 후 초기화`:`마지막 ${when(r.observed_at)}`}</small></span>
      </button>)}
    </section>)}</div>
  </section>{detail&&<Detail value={detail} close={close}/>}</>;
}

function HostFacts({host,retained=false}:{host:Row;retained?:boolean}){
  return <><dl className="vd-facts"><dt>서버 접속</dt><dd>{retained?'이전 확인 결과':host.connection==='responding'?'API 응답 확인':host.connection==='refused'?'접속 거부':'확인 불가'}</dd><dt>응답 시간</dt><dd>{number(host.elapsed_ms)} ms</dd><dt>토큰 사용량</dt><dd>서버별 사용량을 측정하지 않음</dd><dt>모델 등록</dt><dd>{number(host.registered_count)}</dd><dt>메모리에 올라온 모델</dt><dd>{number(host.resident_count)}</dd><dt>답변 생성 시험</dt><dd>실행 안 함</dd><dt>확인 시각</dt><dd>{when(host.observed_at)}</dd></dl>
    {host.connection==='refused'&&<p>설정된 주소가 접속을 받지 않습니다. 이 API 관측만으로 종료 원인이나 업무 영향을 확정하지 않습니다.</p>}
    <p>모델이 메모리에 없어도 요청이 오면 불러올 수 있습니다. 이 화면은 모델 목록만 읽고 답변 생성은 시험하지 않습니다.</p>
    {host.models?.length>0&&<><h3>제공된 모델 {host.models.length}개</h3><table className="vd-records"><thead><tr><th>모델</th><th>등록</th><th>메모리에 있음</th></tr></thead><tbody>{host.models.map((m:Row)=><tr key={m.model}><td>{m.model}<small>{m.roles?.join(' · ')}</small></td><td>{m.registered===true?'확인':m.registered===false?'없음':'—'}</td><td>{m.resident===true?'있음':m.resident===false?'메모리에 없음':'—'}</td></tr>)}</tbody></table></>}
  </>;
}
export function ServerStrip({data,failed=false}:{data?:Row;failed?:boolean}){
  const {detail,open,close}=useDetail();
  return <><div className="vd-servers" aria-label="모델 서버 상태"><span className="vd-strip-label"><Server size={14}/>모델 API</span>{data?.hosts?.map((h:Row)=><button key={h.id} onClick={()=>open(h.label,<HostFacts host={h} retained={failed}/>)}><span className={`vd-dot ${failed?'muted':h.connection==='responding'?'blue':h.connection==='refused'?'red':'amber'}`}/><strong>{h.id==='gpu-response'?'GPU PC':h.id==='local-ollama'?'PC Ollama':h.label.replace(' · RAG 모델','')}</strong><small>{failed?'보존값':h.connection==='responding'?`정상 · ${number(h.elapsed_ms)} ms · ${h.resident_count===0?'메모리에 없음':typeof h.resident_count==='number'?h.resident_count+'개 메모리 사용':'메모리 상태 모름'}`:h.connection==='refused'?'이상 · 접속 거부':h.connection==='timeout'?'이상 · 응답 지연':'미확인'}</small><ChevronRight size={12}/></button>)}{!data?.hosts?.length&&<span className="vd-muted">조회 대기</span>}</div>{detail&&<Detail value={detail} close={close}/>}</>;
}

export function OperationsDashboard({model,inputs,failed,go,project}:{model:Row;inputs:Row;failed:string[];go:(n:any)=>void;project?:string}){
  const {detail,open,close}=useDetail(),[selectedDay,setSelectedDay]=useState<string|null>(null),[sourceId,setSourceId]=useState('all');
  const sources=sourceChoices(inputs);
  const work=dashboardWork(inputs,failed);
  const chooseUsage=(selection:Row|null)=>{if(!selection?.date)return;const picked=selectedUsageDay(inputs.usage?.history,selection.date,selection.modelId,selection.excludedModelIds);if(!picked)return;
    const agCollector = model.nodes?.find((n: Row) => n.id === 'watchtower::usage_antigravity_collector');
    const collectorStatus = agCollector ? { key: agCollector.status?.key, observedAt: agCollector.observedAt } : undefined;
    open(`${picked.date} · 사용량`,<><table className="vd-records"><thead><tr><th>모델</th><th>토큰</th><th>회차</th></tr></thead><tbody>{picked.rows.map((r:Row)=><tr key={r.model_id}><td>{r.model_id}</td><td>{number(r.total_tokens)}</td><td>{number(r.turns)}</td></tr>)}</tbody></table><p>모델별 측정 이력입니다. 선택 날짜와 작업별 집계의 직접 귀속은 별도 근거가 필요합니다.</p><button className="cx-primary" onClick={()=>{close();go({screen:'usage',node:null});}}>사용 이력 <ArrowRight size={15}/></button></>);
  };
  const agCollector = model.nodes?.find((n: Row) => n.id === 'watchtower::usage_antigravity_collector');
  const agCollectorStatus = agCollector ? { key: agCollector.status?.key, observedAt: agCollector.observedAt } : undefined;
  return <div className="vd-dashboard">
    <OperationsHostStrip snapshot={inputs.host} failed={failed.includes('host')}/>
    <OperationsSummary model={model} inputs={inputs} failed={failed} />
    {project&&<MailRulePanel project={project}/>}
    <div className="oc-resource-layer"><QuotaStrip inputs={inputs} failed={failed}/><section className="vd-panel vd-usage"><header><h2>사용 추이</h2><Info label="사용량 기준" open={open}><p>기존 사용량 원장의 토큰 이력입니다. 모델/제공자와 7일/30일 전환을 유지합니다.</p><p>AG 요청은 같은 그래프 위의 선으로, 오른쪽 ‘회’ 축을 사용합니다. 왼쪽 토큰 합계에는 포함하지 않습니다. 날짜는 대화 관측일 기준이며, 토큰 미측정과 날짜 귀속 범위는 집계 범위에서 확인합니다.</p><p>관측 {when(inputs.usage?.history?.generated_at)}</p></Info><button className="vd-header-link" onClick={()=>go({screen:'usage',node:null})}>사용 이력<ArrowUpRight size={14}/></button></header>
      {failed.includes('usage')&&<span className="vd-small-state">보존 이력 · 새 조회 실패</span>}<UsageTrendChart usage={inputs.usage} onSelection={chooseUsage} compact collectorStatus={agCollectorStatus} />
    </section></div>
    <OperationsJudgment model={model} inputs={inputs} failed={failed} go={go} hostDetail={h=>open(h.label,<HostFacts host={h}/>)} />
    <div className="oc-data-layer"><div className="oc-intake"><SourcesChart rag={failed.includes('rag')?undefined:inputs.rag} processing={model.nodes.find((n:Row)=>n.status.key==='processing')} sources={sources} sourceId={sourceId} select={id=>{setSourceId(id);setSelectedDay(null);}} retained={failed.includes(sourceId==='plaud'?'recent':'sources')} open={open} onDay={setSelectedDay} selectedDay={selectedDay}/><SourceRecent sources={sources} sourceId={sourceId} selectedDay={selectedDay} open={open} go={go}/></div><RagPipeline data={inputs.rag} failed={failed.includes('rag')} go={go}/></div>
    <LocalModels data={inputs.models} rag={inputs.rag} ragFailed={failed.includes('rag')} failed={failed.includes('models')} onInspect={h=>open(h.label,<HostFacts host={h} retained={failed.includes('models')}/>)} />
    <section className="vd-panel vd-work"><header><h2>에이전트 활동</h2><span className="vd-count">{work.complete?work.rows.length:'—'}</span><Info label="에이전트 실행 상태" open={open}><p>실행이 관측된 작업만 표시합니다. 등록된 봇이나 프로세스 생존을 작업 중으로 계산하지 않습니다.</p><p>Hermes: {work.runtimeKnown?'상태 연결됨':'현재 상태 조회 불가'}<br/>Codex: {work.threadKnown?'상태 연결됨':'현재 상태 조회 불가'}</p>{inputs.runtime?.bots?.map((b:Row)=><p key={b.bot_id}>{b.display_label} · {b.hold_code??b.state?.value??'미확인'}</p>)}</Info></header>
      {work.rows.length?work.rows.slice(0,4).map((r:Row)=><button className="vd-task-row" key={r.id} onClick={()=>open(r.label,<dl className="vd-facts"><dt>실행 상태</dt><dd>{r.state}</dd><dt>모델</dt><dd>{r.model??'미확인'}</dd></dl>)}><span className="vd-dot blue"/><strong>{r.label}</strong><small>{['waiting','waiting_for_user','waiting_for_approval'].includes(r.state)?'대기':'작업 중'}</small></button>):<div className="vd-work-empty"><Clock3 size={20}/><span>{work.complete?'실행 중인 작업 없음':'실행 중인 작업을 조회할 수 없음'}</span><button onClick={()=>open('에이전트 활동 연결',<p>실행 상태 연결됨을 읽지 못했습니다. 활성 작업이 0개라는 뜻은 아닙니다.</p>)}>근거<ChevronRight size={13}/></button></div>}
      <div className="vd-chart-foot"><span>Hermes {work.runtimeKnown?'연결':'상태 조회 연결 안 됨'} · Codex {work.threadKnown?'연결':'상태 조회 연결 안 됨'} </span></div>
    </section>

    {detail&&<Detail value={detail} close={close}/>}
  </div>;
}
