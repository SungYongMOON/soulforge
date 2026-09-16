import {DiagnosticEvidence} from './diagnostic-evidence';
import {ProjectNamesContext,ProjectLabel} from './project-labels';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, type NodeProps } from '@xyflow/react';
import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Database, FileCheck2, FolderOpen, GitBranch, LayoutDashboard, List, LockKeyhole, Moon, RefreshCw, Search, Sun, TriangleAlert, X } from 'lucide-react';
import { buildConsoleView, CONSOLE_ASSESSMENTS as assessmentDefinitions, focusScene, selectedUsageDay } from './core/operations-console-view.mjs';
import { directConnections } from './core/operations-map-view.mjs';
import { describeTopologyReason } from './core/topology-view.mjs';
import { aiUsageProjectionRequest } from './core/ai-usage-projection-request.mjs';
import { UsageTrendChart, LedgerActivity, LedgerDistribution, AiUsageHistoryPanel } from './App';
import { DataSpaces, EvidenceSearch, StandalonePreview } from './operations-workspace';
import { OperationsSystem } from './operations-system';
import { OperationsDashboard, QuotaStrip, ServerStrip, SourceNotice } from './operations-dashboard';
import './team-ops.css';
import './team-ops-responsive.css';
import '@xyflow/react/dist/style.css';
import './operations-console.css';

type Row=Record<string,any>;
const CONSOLE_ASSESSMENTS: Record<string, Row> = assessmentDefinitions;
type Screen='overview'|'system'|'directory'|'usage'|'rag'|'evidence'|'memory';
type Navigation={screen:Screen;node:string|null;project?:string};
const screens=[['overview','운영 현황',LayoutDashboard],['system','구조·진단',GitBranch],['directory','데이터 공간',FolderOpen],['usage','사용 이력',Activity],['rag','RAG 처리',Database],['evidence','질문·근거',Search],['memory','기억·맥락',FileCheck2]] as const;
const at=(v:any)=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'미확인';
const number=(n:any)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('ko-KR'):'미확인';
const shortName=(label:string)=>label.replaceAll('custody','보관').replace('event 원장','원장');
function Status({status}:{status:Row}){const Icon=status.key==='ok'?Check:['pending','processing','history'].includes(status.key)?Clock3:status.key==='unknown'?CircleHelp:TriangleAlert;return <span className={`cx-status is-${status.tone}`}><Icon size={13}/>{status.label}</span>;}
async function readJson(url:string){const r=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(url.startsWith('/rag-operations')?45000:20000)});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('unavailable');return r.json();}
function useSources(){
  const [inputs,setInputs]=useState<Row>({}),[failed,setFailed]=useState<string[]>([]),[loading,setLoading]=useState(false),[readAt,setReadAt]=useState<string|null>(null);
  const inFlight=useRef(false),mounted=useRef(true);
  const load=useCallback(async()=>{if(inFlight.current)return;inFlight.current=true;setLoading(true);
    const entries=[['federation','/topology-federation.snapshot.json'],['health','/operations-health.snapshot.json'],['recovery','/topology-recovery.snapshot.json'],['graph','/operations-graph-receipts.json'],['host','/host-stats.snapshot.json'],['limits','/provider-limits.snapshot.json'],['codexQuota','/codex-live-limits.json'],['agQuota','/antigravity-quota.snapshot.json'],['runtime','/agent-runtime.snapshot.json'],['threads','/codex-threads.snapshot.json'],['recent','/operations-recent.json'],['sources','/operations-sources.json'],['models','/local-model-status.json'],['rag','/rag-operations.json?view=overview'],['incidents','/operations-incidents.json']];
    await Promise.allSettled([...entries.map(async([key,url])=>{
      try{const value=await readJson(url);if(value.state==='unavailable'||value.status==='unavailable')throw Error('unavailable');if(mounted.current){setInputs(old=>({...old,[key]:value}));setFailed(old=>old.filter(k=>k!==key));}}
      catch{if(mounted.current)setFailed(old=>[...new Set([...old,key])]);}
    }),aiUsageProjectionRequest.load().then((value:any)=>{if(mounted.current){if(value.state!=='ready'){setFailed(old=>[...new Set([...old,'usage'])]);return;}setInputs(old=>({...old,usage:value}));setFailed(old=>old.filter(k=>k!=='usage'));}})]);
    if(mounted.current){setLoading(false);setReadAt(new Date().toISOString());}inFlight.current=false;
  },[]);
  useEffect(()=>{mounted.current=true;void load();const timer=setInterval(()=>{if(!document.hidden)void load();},60000);return()=>{mounted.current=false;clearInterval(timer);};},[load]);
  return {inputs,failed,loading,readAt,load};
}

function DiagramNode({data}:NodeProps){const node=data.node as Row;const Icon=node.role?.startsWith('store')||node.id.endsWith('neo4j')?Database:node.id.endsWith('source_grant')?FileCheck2:GitBranch;
  return <button className={`cx-diagram-node ${data.selected?'is-selected':''}`} onClick={()=> (data.select as (id:string)=>void)(node.id)} aria-label={`${node.label} 경로 선택`}><Handle type="target" position={Position.Left}/><span className="cx-node-title"><Icon size={16}/><strong>{shortName(node.label)}</strong></span><Status status={node.status}/><Handle type="source" position={Position.Right}/></button>;
}
const types={console:DiagramNode};
function FocusMap({model,selected,onSelect}:{model:Row;selected:string;onSelect:(id:string)=>void}){
  const scene=focusScene(model,selected);
  const nodes=scene.nodes.map((n:Row)=>({id:n.id,type:'console',position:n.position,width:202,height:76,handles:[{type:'target' as const,position:Position.Left,x:0,y:38},{type:'source' as const,position:Position.Right,x:202,y:38}],data:{node:n,selected:n.id===selected,select:onSelect}}));
  const edges=scene.edges.map((e:Row)=>({id:e.id,source:e.from,target:e.to,animated:false,type:'default',label:e.evidenceMode==='implementation_contract'?'구현 경로':e.relation==='data'?'등록된 자료 경로':e.relation==='control'?'제어 관계':e.label||'등록 관계',markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:e.evidenceMode==='implementation_contract'?'#8895a5':'#6683a8',strokeWidth:1.5,strokeDasharray:e.evidenceMode==='implementation_contract'?'5 5':undefined},labelStyle:{fontSize:11,fill:'#667383'},labelBgStyle:{fill:'#fbfcfd',fillOpacity:.96}}));
  return <div className="cx-focus-map" aria-label="선택 서비스의 직접 연결 지도"><ReactFlow key={selected} nodes={nodes} edges={edges} nodeTypes={types} fitView fitViewOptions={{padding:.13}} minZoom={.85} maxZoom={1.4} nodesDraggable={false} nodesConnectable={false} panOnScroll={false} zoomOnScroll={false} onNodeClick={(_,node)=>onSelect(node.id)}><Background color="#d9e0e8" gap={24} size={1}/><Controls showInteractive={false}/></ReactFlow></div>;
}
function Neighbors({model,node,onSelect}:{model:Row;node:Row;onSelect:(id:string)=>void}){const edges=directConnections(model,node.id);return <div className="cx-neighbors">{[['들어오는 경로',edges.incoming],['나가는 경로',edges.outgoing]].map(([title,rows]:any)=><section key={title}><h3>{title}<span>{rows.length}</span></h3>{rows.length?rows.map(({node:n,edge}:Row)=><button key={edge.id} onClick={()=>onSelect(n.id)}><span>{shortName(n.label)}<small>{edge.evidenceMode==='implementation_contract'?'구현 계약 · 설치 연결 미확인':edge.relation==='data'?'등록된 자료 관계 · 전달 성공 미확인':`등록 관계 · ${edge.relation}`}</small></span><ChevronRight size={16}/></button>):<p>이 범위의 연결 정의가 없습니다.<br/>실제 연결 부재나 고장으로 단정하지 않습니다.</p>}</section>)}</div>;}


function SystemView({model,nav,go,inspect}:{model:Row;nav:Navigation;go:(n:Navigation)=>void;inspect:()=>void}){
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('attention'),[stage,setStage]=useState('all'),[listOpen,setListOpen]=useState(false);
  const selected=model.nodes.find((n:Row)=>n.id===nav.node)??model.attention[0]??model.nodes[0];
  const select=(id:string)=>go({screen:'system',node:id});
  const candidates=model.nodes.filter((n:Row)=>(stage==='all'||n.stage===stage)&&(filter==='all'||filter==='attention'?filter==='all'||n.status.key!=='ok':n.status.key===filter)&&(!query||`${n.label} ${n.id}`.toLowerCase().includes(query.toLowerCase())));
  const rows=(filter==='all'||query||stage!=='all'?candidates:candidates.filter((n:Row)=>n.id.startsWith('watchtower::'))).sort((a:Row,b:Row)=>({problem:0,pending:1,observation_error:2,unknown:3,ok:4} as Row)[a.status.key]-({problem:0,pending:1,observation_error:2,unknown:3,ok:4} as Row)[b.status.key]||a.label.localeCompare(b.label,'ko'));
  return <div className={`cx-system-layout ${listOpen?"is-list-open":""}`}><button className="cx-list-toggle" aria-expanded={listOpen} onClick={()=>setListOpen(v=>!v)}><List size={16}/>{listOpen?"서비스 목록 접기":"다른 서비스 찾기"}</button><aside className="cx-service-list"><label className="cx-search"><Search size={16}/><input aria-label="서비스 찾기" placeholder="서비스 찾기" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="서비스 검색 지우기" onClick={()=>setQuery('')}><X size={14}/></button>}</label><div className="cx-list-filters"><select aria-label="서비스 상태 필터" value={filter} onChange={e=>setFilter(e.target.value)}><option value="attention">확인할 항목</option><option value="all">전체 구조</option>{Object.entries(CONSOLE_ASSESSMENTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select><select aria-label="처리 단계 필터" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">모든 단계</option>{model.stages.map((s:Row)=><option key={s.id} value={s.id}>{s.title}</option>)}</select></div><p className="cx-list-count">{rows.length}개 항목 · 선택한 경로는 유지됩니다.</p><div className="cx-service-scroll">{selected&&!rows.some((n:Row)=>n.id===selected.id)&&<div className="cx-pinned-selection"><small>현재 선택 · 필터 범위 밖</small><strong>{shortName(selected.label)}</strong><button onClick={()=>{setQuery('');setFilter('all');setStage('all');}}>목록 필터 해제</button></div>}{rows.map((n:Row)=><button key={n.id} aria-pressed={selected?.id===n.id} className={selected?.id===n.id?'is-selected':''} onClick={()=>select(n.id)}><strong>{shortName(n.label)}</strong><Status status={n.status}/></button>)}{!rows.length&&<p className="cx-empty-inline">이 필터에 맞는 항목이 없습니다.<button onClick={()=>{setFilter('all');setStage('all');setQuery('');}}>필터 해제</button></p>}</div></aside>
    <section className="cx-path-workspace">{selected?<><header className="cx-path-heading"><div><span className="cx-eyebrow">선택한 경로</span><h2>{shortName(selected.label)}</h2><p>{selected.status.next}</p></div><button className="cx-primary" onClick={inspect}>근거 보기 <ArrowUpRight size={15}/></button></header><div className="cx-path-meta"><Status status={selected.status}/><span><Clock3 size={14}/>검사 {at(selected.observedAt)}</span><span>입출력 직접 관계</span></div><FocusMap model={model} selected={selected.id} onSelect={select}/><div className="cx-map-legend"><span>실선: 등록 구조</span><span>┄ 점선: 구현 계약</span><span>전달 성공·현재 흐름과는 별도</span></div><Neighbors model={model} node={selected} onSelect={select}/><div className="cx-path-next"><FolderOpen size={21}/><div><strong>관련 자료를 확인할까요?</strong><p>허용된 폴더에서 찾아봅니다. 서비스별 폴더 자동 연결은 아직 미등록입니다.</p></div><button onClick={()=>go({screen:'directory',node:selected.id})}>폴더 보기 <ArrowRight size={15}/></button></div></>:<div className="cx-empty">구조 자료를 아직 읽지 못했습니다.</div>}</section>
  </div>;
}

function Inspector({node,close,folder}:{node:Row;close:()=>void;folder:()=>void}){
  const ref=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{ref.current?.focus();const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[close]);
  return <aside className="cx-inspector" aria-label="진단 근거 상세"><header><span>진단 근거</span><button aria-label="진단 근거 닫기" onClick={close}><X size={18}/></button></header><h2 ref={ref} tabIndex={-1}>{node.label}</h2><Status status={node.status}/><p>{node.checkLabel} · {node.status.next}</p><DiagnosticEvidence node={node}/><section><h3>무엇을 확인했나요?</h3><p>{node.scope}</p><p className="cx-muted">업무 영향: 이 근거만으로 종단 결과는 확인할 수 없습니다.</p></section><dl><dt>구현·연결</dt><dd>{node.implementation}</dd><dt>마지막 관측</dt><dd>{at(node.observedAt)} · {node.freshness==='unknown'?'관측 근거 없음':'저장된 검사 기준'}</dd><dt>실행 위치</dt><dd>{node.location}</dd><dt>역할</dt><dd>{node.role}</dd></dl><section><h3>오류·보류 근거</h3>{node.healthReasons?.length?node.healthReasons.map((r:string)=><p key={r}>{describeTopologyReason(r)}<small className="cx-code">{r}</small></p>):<p className="cx-muted">이 항목에 제공된 오류 사유가 없습니다. 정상 판정과는 별도입니다.</p>}</section>{(!node.diagnostic&&!node.mailHistory&&!node.connection||node.recovery?.lastAttemptAt)&&<section><h3>조치와 재검사</h3><p>{node.recovery?.outcomeLabel??'조치 결과 기록 없음'}</p><dl><dt>마지막 조치</dt><dd>{at(node.recovery?.lastAttemptAt)}</dd><dt>사후 검사 통과</dt><dd>{at(node.recovery?.lastVerifiedRepairAt)}</dd><dt>다음 검사 예정</dt><dd>{at(node.nextCheck)}</dd></dl>{node.recovery?.history?.map((r:Row,i:number)=><div className="cx-recovery-row" key={i}><small>{at(r.at)}</small><p>{r.outcomeLabel}</p></div>)}</section>}{node.graphReceipts&&<section><h3>과제별 반영 근거</h3>{node.graphReceipts.rows.map((r:Row)=><p key={r.project}><strong><ProjectLabel code={r.project}/></strong><br/>{r.verified?'DB 수량 되읽기 검증':'반영 검증 미확인'} · {at(r.observed_at)}<br/>반영 {number(r.completed)} · 대기 {number(r.pending)} · 실패 {number(r.failed)}</p>)}</section>}<button className="cx-primary" onClick={folder}><FolderOpen size={16}/>데이터 폴더 확인</button><details className="cx-technical"><summary>기술 정보와 출처</summary><code>{node.id}</code><p>{node.sourceRef??'출처 참조 미제공'}</p></details></aside>;
}

function UsageView({usage,failed}:{usage:Row|undefined;failed:boolean}){
  const [selection,setSelection]=useState<Row|null>(null),[period,setPeriod]=useState('calendar_day');
  const onSelection=(next:Row|null)=>setSelection(old=>next?{...next,date:next.date??old?.date??usage?.history?.model_daily?.at(-1)?.date}:null);
  const chosen=selectedUsageDay(usage?.history,selection?.date,selection?.modelId,selection?.excludedModelIds);
  return <div className="cx-usage">{failed&&<p className="cx-notice">최신 사용량을 읽지 못했습니다. 아래에 값이 있다면 이전 관측입니다.</p>}
    <section className="cx-card"><header className="cx-section-heading"><div><h2>사용 추이</h2><p>기존 측정 원장 · 날짜 또는 모델을 선택해 세부 값을 확인하세요.</p></div></header><UsageTrendChart usage={usage} onSelection={onSelection}/></section>
    {chosen&&<section className="cx-card cx-selection-detail" aria-label="선택 날짜 모델 상세"><header className="cx-section-heading"><div><h2>{chosen.date} · {selection?.modelId??'모든 모델'}</h2><p>선택 날짜의 모델별 측정 · 작업별 귀속은 이 자료에 없습니다.</p></div><button onClick={()=>setSelection(null)} aria-label="사용량 선택 해제"><X size={17}/></button></header><div className="cx-table-wrap"><table><thead><tr><th>모델</th><th>토큰</th><th>회차</th><th>토큰 미측정 회차</th></tr></thead><tbody>{chosen.rows.map((r:Row)=><tr key={r.model_id}><td>{r.model_id}</td><td>{number(r.total_tokens)}</td><td>{number(r.turns)}</td><td>{number(r.token_unknown_turns)}</td></tr>)}</tbody></table></div></section>}
    <section className="cx-card cx-reused-usage"><header className="cx-section-heading"><div><h2>기간별 작업 이력</h2><p>위의 모델 선택과 별개인 기간 집계입니다. 정확한 ID로 기록된 사용량을 유지합니다.</p></div></header>{usage?.history?<AiUsageHistoryPanel history={usage.history} selectedWindow={period} onSelectWindow={setPeriod} exactTaskLabels={new Map()} exactTaskAttribution={new Map()} exactTaskAttributionState="unavailable"/>:<p className="cx-empty-inline">사용 이력 근거를 아직 읽지 못했습니다.</p>}</section>
    <details className="cx-card cx-existing-charts"><summary>기존 시간대별·누적 분포 그래프 <ChevronDown size={16}/></summary><div className="cx-reused-usage"><LedgerActivity usage={usage}/><LedgerDistribution usage={usage} exactTaskLabels={null}/></div></details>
  </div>;
}

function ConsoleApp(){
  const {inputs,failed,loading,readAt,load}=useSources();
  const [nav,setNav]=useState<Navigation>(()=>({screen:(screens.some(s=>s[0]===location.hash.slice(1))?location.hash.slice(1):'overview') as Screen,node:null})),[inspector,setInspector]=useState(false),[theme,setTheme]=useState(()=>{try{return localStorage.getItem('soulforge.operations.theme')==='light'?'light':'dark';}catch{return 'dark';}});
  useEffect(()=>{try{localStorage.setItem('soulforge.operations.theme',theme);}catch{}},[theme]);
  const [past,setPast]=useState<Navigation[]>([]),scrollPositions=useRef<Row>({}),main=useRef<HTMLElement>(null),lastTrigger=useRef<HTMLElement|null>(null);
  const model=useMemo(()=>buildConsoleView(inputs,failed),[inputs,failed]);
  const selected=model.nodes.find((n:Row)=>n.id===nav.node)??model.attention[0]??model.nodes[0];
  const go=useCallback((next:Navigation)=>{scrollPositions.current[nav.screen]=main.current?.scrollTop??0;setPast(old=>[...old,nav]);setNav(next);setInspector(false);window.history.pushState({consoleNavigation:next},'',`#${next.screen}`);requestAnimationFrame(()=>{if(main.current)main.current.scrollTop=scrollPositions.current[next.screen]??0;});},[nav]);
  const closeInspector=useCallback(()=>{setInspector(false);lastTrigger.current?.focus();},[]);
  useEffect(()=>{window.history.replaceState({consoleNavigation:nav},'',`#${nav.screen}`);const pop=(event:PopStateEvent)=>{if(event.state?.consoleNavigation){setNav(event.state.consoleNavigation);setInspector(false);setPast(old=>old.slice(0,-1));}};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const title=screens.find(s=>s[0]===nav.screen)?.[1];
  const projectNames=Object.fromEntries((inputs.rag?.projects??[]).map((p:Row)=>[p.project,p.project_name]));
  return <ProjectNamesContext.Provider value={projectNames}><div className="cx-app" data-theme={theme}><a className="cx-skip" href="#console-content">본문으로 건너뛰기</a><aside className="cx-sidebar"><a className="cx-brand" href="#overview" onClick={e=>{e.preventDefault();go({screen:'overview',node:null});}}><span><GitBranch size={22}/></span><strong>Soulforge<small>Operations</small></strong></a><nav aria-label="운영 화면">{screens.map(([id,label,Icon])=><button key={id} aria-current={nav.screen===id?'page':undefined} className={nav.screen===id?'is-selected':''} onClick={()=>go({screen:id,node:nav.node})}><Icon size={18}/><span>{label}</span>{id==='system'&&model.healthAvailable&&model.attention.length>0&&<small>{model.attention.length}</small>}</button>)}<a className="cx-rag-link" href="/rag-operations.html"><Database size={18}/><span>RAG 처리 상태</span></a></nav><div className="cx-sidebar-bottom"><span className="cx-preview-label">UX 미리보기</span><p>기존 관측을 읽습니다.<br/>서비스는 변경하지 않습니다.</p><a href="http://127.0.0.1:4192/" target="_blank" rel="noreferrer">기존 업무·조직·대시보드 <ArrowUpRight size={14}/></a><button onClick={()=>setTheme(t=>t==='light'?'dark':'light')}>{theme==='light'?<Moon size={15}/>:<Sun size={15}/>} {theme==='light'?'어둡게 보기':'밝게 보기'}</button><span className="cx-local"><LockKeyhole size={12}/>이 PC · 읽기 전용</span></div></aside>
    <div className="cx-shell"><header className="cx-topbar"><div><button className="cx-back" aria-label="이전 화면" disabled={!past.length} onClick={()=>window.history.back()}><ArrowLeft size={17}/></button><h1>{title}</h1></div><div className="cx-topbar-actions"><span>{loading?'저장된 근거 읽는 중':`조회 ${at(readAt)}`}</span><button aria-label="저장된 관측 다시 읽기" disabled={loading} onClick={()=>void load()}><RefreshCw size={16} className={loading?'cx-spin':''}/><span>다시 읽기</span></button></div></header>
    <main ref={main} id="console-content" className="cx-main"><SourceNotice failed={failed}/>
      <div hidden={nav.screen!=='overview'}><OperationsDashboard model={model} inputs={inputs} failed={failed} go={go}/></div>
      <div hidden={nav.screen!=='system'}><div className="vd-system-models"><ServerStrip data={inputs.models} failed={failed.includes('models')}/></div>{nav.screen==='system'&&<OperationsSystem model={model} inputs={inputs} selected={selected} onSelect={id=>go({screen:'system',node:id})} go={go} inspect={()=>{lastTrigger.current=document.activeElement as HTMLElement;setInspector(true);}}/>}</div>
      <div hidden={nav.screen!=='directory'}><DataSpaces active={nav.screen==='directory'}/></div>
      <div hidden={nav.screen!=='usage'}><QuotaStrip inputs={inputs} failed={failed}/><UsageView usage={inputs.usage} failed={failed.includes('usage')}/></div>
      <div hidden={nav.screen!=='rag'}>{nav.screen==='rag'&&<iframe className="ow-embedded-rag" title="RAG 실제 처리 상태" src={`/rag-operations.html?embedded=1${nav.project?`&project=${encodeURIComponent(nav.project)}`:''}`}/>}</div>
      <div hidden={nav.screen!=='evidence'}><EvidenceSearch active={nav.screen==='evidence'}/></div>
      <div hidden={nav.screen!=='memory'}><DataSpaces active={nav.screen==='memory'} memory/></div>
    </main></div>{inspector&&nav.screen==='system'&&selected&&<Inspector node={selected} close={closeInspector} folder={()=>go({screen:'directory',node:selected.id})}/>}</div></ProjectNamesContext.Provider>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('preview')==='1'?<StandalonePreview/>:<ConsoleApp/>);
