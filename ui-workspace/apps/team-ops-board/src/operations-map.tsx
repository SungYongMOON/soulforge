import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, applyNodeChanges, type NodeProps } from '@xyflow/react';
import { Activity, ArrowRight, ArrowUpLeft, ChevronDown, ChevronRight, File, Folder, GitBranch, Layers, LockKeyhole, RefreshCw, Search, ShieldCheck, Unplug, X } from 'lucide-react';
import { buildOperationsMap, architectureScene, directConnections } from './core/operations-map-view.mjs';
import { describeTopologyReason } from './core/topology-view.mjs';
import '@xyflow/react/dist/style.css';
import './design/design-system.generated.css';
import './operations-map.css';
import './operations-map-reading.css';

type Row = Record<string, any>;
const healthLabel: Record<string,string> = { ok: '정상 관측', down: '실패 관측', degraded: '주의 관측', stale: '지연 관측', unmonitored: '미감시', unknown: '미확인' };
const at = (value: any) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미확인';
const bytes = (n: any) => n === null || n === undefined ? '미집계' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
async function readJson(url: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store', credentials: 'omit' });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('read_unavailable');
  return response.json();
}

function ArchitectureNode({ data }: NodeProps) {
  const d=data as Row, n=d.node;
  return <div className={`op-architecture-node op-architecture-${n.shape} ${d.selected?'is-selected':''}`}>
    <Handle type="target" id="left" position={Position.Left}/><Handle type="source" id="right" position={Position.Right}/>
    <Handle type="target" id="top" position={Position.Top}/><Handle type="source" id="bottom" position={Position.Bottom}/>
    <Handle type="target" id="right-in" position={Position.Right}/><Handle type="source" id="left-out" position={Position.Left}/>
    <Handle type="target" id="bottom-in" position={Position.Bottom}/><Handle type="source" id="top-out" position={Position.Top}/>
    {n.shape==='store'&&<svg viewBox="0 0 140 64" preserveAspectRatio="none" aria-hidden="true"><path d="M1 9v45c0 12 138 12 138 0V9"/><ellipse cx="70" cy="9" rx="69" ry="8"/></svg>}
    <button className="nodrag" title={n.label} aria-label={`${n.label} 상세`} onClick={()=>d.select(n.id)}><strong>{n.label}</strong></button>
  </div>;
}
function ArchitectureHeading({data}:NodeProps){return <div className="op-architecture-heading">{String(data.label)}</div>;}
const nodeTypes = { architecture: ArchitectureNode, heading: ArchitectureHeading };
function architectureHandles(height:number) {
  return [
    {id:'left',type:'target' as const,position:Position.Left,x:0,y:height/2},
    {id:'right',type:'source' as const,position:Position.Right,x:140,y:height/2},
    {id:'top',type:'target' as const,position:Position.Top,x:70,y:0},
    {id:'bottom',type:'source' as const,position:Position.Bottom,x:70,y:height},
    {id:'right-in',type:'target' as const,position:Position.Right,x:140,y:height/2},
    {id:'left-out',type:'source' as const,position:Position.Left,x:0,y:height/2},
    {id:'bottom-in',type:'target' as const,position:Position.Bottom,x:70,y:height},
    {id:'top-out',type:'source' as const,position:Position.Top,x:70,y:0},
  ];
}

function ConnectionFocus({ node, model, select }: { node: Row; model: Row; select: (id:string) => void }) {
  const connections = directConnections(model, node.id);
  const relations: Record<string,string> = { data: '자료', control: '제어', observes: '관측', projects: '투영', advises: '자문', contains: '포함', imports: '참조', validates: '검증' };
  const column = (rows: Row[], label: string) => <section className="op-neighbors"><h3>{label} <span>{rows.length}개</span></h3>{rows.length ? rows.map(({node: neighbor, edge}) => <button key={edge.id} onClick={() => select(neighbor.id)}><strong>{neighbor.label}</strong><small>{relations[edge.relation] ?? edge.relation} · {edge.label || '등록된 관계'}</small></button>) : <p>등록된 연결 없음</p>}</section>;
  return <section className="op-focus-connections" aria-label="선택 항목의 직접 연결"><header><GitBranch size={17}/><strong>이 항목과 직접 연결된 곳만</strong><span>전체 관계는 숨김</span></header><div className="op-neighbor-layout">{column(connections.incoming,'들어오는 곳')}<div className="op-focus-center"><ArrowRight size={18}/><strong>{node.label}</strong><ArrowRight size={18}/><small>구조 방향이며<br/>전달 성공을 뜻하지 않습니다.</small></div>{column(connections.outgoing,'나가는 곳')}</div></section>;
}

function Detail({ node, model, close }: { node: Row | undefined; model: Row; close: () => void }) {
  if (!node) return <aside className="op-detail op-detail-empty"><GitBranch size={32}/><h2>흐름의 한 지점을<br/>선택해 보세요</h2><p>역할과 입출력, 마지막 관측과<br/>진단 범위를 한곳에서 읽습니다.</p><div className="op-gap"><strong>아직 이어지지 않은 곳</strong>{model.gaps.map((gap: string) => <p key={gap}>{gap}</p>)}</div><small>선은 구조 또는 구현 계약입니다.<br/>실제 전송 중이라는 뜻이 아닙니다.</small></aside>;
  const incoming = model.edges.filter((e: Row) => e.to === node.id), outgoing = model.edges.filter((e: Row) => e.from === node.id);
  const name = (id: string) => model.nodes.find((n: Row) => n.id === id)?.label ?? id;
  return <aside className="op-detail" aria-label="선택 노드 상세"><header><small>NODE INSPECTOR</small><button aria-label="상세 닫기" onClick={close}><X size={18}/></button></header><h2>{node.label}</h2><code>{node.id}</code>
    <dl className="op-status-axes"><dt>구현·연결</dt><dd>{node.implementation}</dd><dt>건강 상태</dt><dd>{node.freshness === 'retained' ? '현재 미확인 · 마지막 ' : ''}{healthLabel[node.health] ?? '미확인'}</dd><dt>근거 신선도</dt><dd>{node.freshness === 'fresh' ? '현재 관측' : node.freshness === 'retained' ? '보존된 관측 · 최신 여부 확인 필요' : '관측 근거 없음'}</dd></dl>
    <section><h3>역할 / 실행 위치</h3><p>{node.role}</p><p className="op-muted">{node.location}</p></section>
    <section><h3>입력 → 출력</h3>{incoming.length + outgoing.length === 0 ? <p className="op-muted">연결 정의 미등록</p> : <><p><b>입력</b> {incoming.map((e: Row) => name(e.from)).join(' · ') || '등록 없음'}</p><p><b>출력</b> {outgoing.map((e: Row) => name(e.to)).join(' · ') || '등록 없음'}</p><small>구조 방향 · 전달 성공은 별도 영수증 필요</small></>}</section>
    <section><h3>마지막 관측 / 진단 범위</h3><p>{at(node.observedAt)}</p><p className="op-muted">{node.scope}</p><small>프로세스 생존은 업무 성공을 보장하지 않습니다.</small></section>
    <section><h3>오류 · 복구 · 재검사</h3><p>{node.healthReasons?.length ? node.healthReasons.map((reason: string) => describeTopologyReason(reason)).join(' · ') : '최근 오류 근거 미확인'}</p><p>{node.recovery?.outcomeLabel ?? '복구 결과 미확인'}</p><p className="op-muted">마지막 조치: {at(node.recovery?.lastAttemptAt)}<br/>사후 검증 통과: {at(node.recovery?.lastVerifiedRepairAt)}<br/>다음 재검사 예정: {at(node.nextCheck)}</p>{node.recovery?.history?.map((item: Row, i: number) => <p key={i} className="op-history">{at(item.at)} · {item.outcomeLabel}</p>)}</section>
    {node.graphReceipts && <section><h3>기존 DB 반영 영수증</h3><p>{node.graphReceipts.rows.length}/{node.graphReceipts.expected}개 과제 관측 · {node.graphReceipts.summary?.verified ? '각 세대 DB 되읽기 일치' : '검증 미확인 또는 부분 범위'}</p>{node.graphReceipts.rows.map((r: Row) => <p className="op-history" key={r.project}>{r.project} · {r.verified ? '세대 검증 통과' : '검증 미확인'}<br/><small>{at(r.observed_at)} · {r.freshness === 'fresh' ? '45분 이내' : '오래된 영수증'}</small></p>)}</section>}
    <section><h3>근거</h3><code>{node.sourceRef ?? '근거 등록 필요'}</code><small>등록·선언만으로 실행 정상 판정하지 않습니다.</small></section>
  </aside>;
}

function Directory() {
  const [listing, setListing] = useState<Row>({ roots: [], entries: [], state: 'loading' });
  const [location, setLocation] = useState({ root: '', relative: '' });
  const [refresh, setRefresh] = useState(0), [selected, setSelected] = useState<Row | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setSelected(null); setListing(old => ({ ...old, state: 'loading', entries: [] }));
    readJson(`/operations-directory.json?${new URLSearchParams(location)}`, controller.signal)
      .then(setListing).catch(error => { if (error.name !== 'AbortError') setListing({ state: 'unavailable', roots: [], entries: [], scanned_at: null, reason: '폴더 목록을 읽지 못했습니다' }); });
    return () => controller.abort();
  }, [location, refresh]);
  return <div className="op-directory"><aside className="op-roots"><small>PATH REGISTRY</small><h2>허용된 저장 위치</h2><p>이 PC의 검증된 root 표</p>{listing.roots?.map((root: string) => <button key={root} className={location.root === root ? 'active' : ''} onClick={() => setLocation({ root, relative: '' })}><Folder size={19}/>{root}<ChevronRight size={15}/></button>)}<div className="op-directory-policy"><LockKeyhole size={20}/><p>파일 내용은 열지 않습니다.<br/>비밀 항목과 링크는 탐색 제외.<br/>이 목록은 로컬 화면에만 머뭅니다.</p></div></aside>
    <section className="op-file-panel"><header><div><small>DIRECTORY EXPLORER</small><h2>{location.root || '저장 위치를 선택하세요'}</h2><p>{location.relative || (location.root ? '/ · root 바로 아래' : '왼쪽에서 허용 root를 선택하면 직접 자식만 읽습니다.')}</p></div><button className="op-button" onClick={() => setRefresh(n => n+1)} disabled={listing.state === 'loading'}><RefreshCw size={15}/>목록 다시 읽기</button></header>
      <div className="op-scan-state"><span>{listing.state === 'loading' ? '목록 읽는 중' : listing.state === 'partial' ? '부분 목록' : listing.state === 'ready' ? '제한된 범위 관측' : '읽기 불가'}</span><span>마지막 스캔 {at(listing.scanned_at)} {listing.cached ? '· 캐시' : ''}</span></div>
      <p className="op-directory-note">{listing.reason || '허용 root 외부는 탐색하지 않습니다.'}{listing.excluded > 0 ? ` · 보호 항목 ${listing.excluded}개 제외` : ''}</p>
      {location.relative && <button className="op-parent" onClick={() => setLocation(old => ({ ...old, relative: old.relative.split('/').slice(0,-1).join('/') }))}><ArrowUpLeft size={16}/>상위 폴더</button>}
      <div className="op-table-wrap"><table><thead><tr><th>이름</th><th>종류</th><th>크기</th><th>수정 시각</th></tr></thead><tbody>{listing.entries?.map((entry: Row) => <tr key={entry.name}><td><button onClick={() => entry.browsable ? setLocation(old => ({ ...old, relative: [old.relative, entry.name].filter(Boolean).join('/') })) : setSelected(entry)}>{entry.kind === 'directory' ? <Folder size={19}/> : entry.kind === 'link' ? <LockKeyhole size={17}/> : <File size={18}/>}<span>{entry.name}</span>{entry.browsable && <ChevronRight size={14}/>}</button></td><td>{entry.kind === 'directory' ? '폴더' : entry.kind === 'link' ? '링크 · 차단' : '파일'}</td><td>{bytes(entry.size)}</td><td>{at(entry.modified_at)}</td></tr>)}</tbody></table></div>
      {listing.state !== 'loading' && !listing.entries?.length && <div className="op-folder-empty"><Folder size={36}/><p>{location.root ? listing.state === 'ready' ? '표시할 허용 항목이 없습니다.' : '탐색 결과 미확인' : 'root 선택 대기'}</p></div>}
      {selected && <div className="op-file-inspector"><File size={20}/><strong>{selected.name}</strong><span>{bytes(selected.size)} · {at(selected.modified_at)}</span><span>메타데이터만 표시 · 원문 열람 기능 없음</span><button aria-label="파일 정보 닫기" onClick={() => setSelected(null)}><X size={16}/></button></div>}
      <footer>직접 자식 최대 200개 / 폴더별 60초 캐시 / 하위 폴더 크기는 미집계</footer>
    </section></div>;
}

function App() {
  const [tab, setTab] = useState(()=>new URLSearchParams(window.location.search).get('tab')==='directory'?'directory':'map'), [inputs, setInputs] = useState<Row>({}), [loading, setLoading] = useState(true);
  const embedded = new URLSearchParams(window.location.search).get('embedded')==='1';
  const [selected, setSelected] = useState<string | null>(null), [openStage, setOpenStage] = useState<string | null>(null), [query, setQuery] = useState('');
  const [positions, setPositions] = useState<Row>({});
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setLoading(true);
    const urls = ['/topology-federation.snapshot.json', '/operations-health.snapshot.json', '/topology-recovery.snapshot.json', '/ai-usage-meter.snapshot.json?read_only=1', '/operations-graph-receipts.json'];
    await Promise.allSettled(urls.map(async (url,i) => {
      const key = ['federation','health','recovery','usage','graph'][i];
      try { const value = await readJson(url); setInputs(old => ({ ...old,[key]:value })); }
      catch { setInputs(old => ({ ...old,[key]:null })); }
    }));
    setLoading(false); inFlight.current = false;
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 60_000); return () => clearInterval(timer); }, [load]);
  const model = useMemo(() => buildOperationsMap(inputs), [inputs]);
  const toggle = useCallback((id: string) => { setOpenStage(old => old === id ? null : id); setSelected(null); setQuery(''); }, []);
  const scene = architectureScene(model);
  const selectNode = (id:string) => {setSelected(id);setOpenStage(model.nodes.find((n:Row)=>n.id===id)?.stage??null);};
  const flowNodes = [...scene.nodes.map((node:Row)=>{const height=node.shape==='agent'?68:node.shape==='store'?64:58;return {id:node.id,type:'architecture',width:140,height,handles:architectureHandles(height),position:positions[node.id]??node.position,data:{node,select:selectNode,selected:selected===node.id}};}),
    ...['외부 원천','수집','원본 보관','전처리·검증','청킹·임베딩','Neo4j','검색·맥락','에이전트·응답'].map((label,index)=>({id:`heading:${index}`,type:'heading',width:140,height:34,position:{x:index*180,y:0},data:{label},draggable:false,selectable:false}))];
  const focusEdges = selected ? new Set([...directConnections(model,selected).incoming,...directConnections(model,selected).outgoing].map(r=>r.edge.id)) : null;
  const flowEdges = scene.edges.map((e: Row) => ({ id: e.id, source: e.from, target: e.to, type: 'default', animated: false, markerEnd: { type: MarkerType.ArrowClosed },
    sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, className: e.evidenceMode === 'implementation_contract' ? 'op-edge-implementation' : 'op-edge-declared', style: { strokeWidth: focusEdges?.has(e.id)?2:1.2, opacity:focusEdges&&!focusEdges.has(e.id)?.12:.75 } }));
  const selectedNode = model.nodes.find((n: Row) => n.id === selected);
  const opened = model.stages.find((s: Row) => s.id === openStage);
  const members = (query ? model.nodes : opened?.members ?? []).filter((n:Row) => !query || `${n.label} ${n.id}`.toLowerCase().includes(query.toLowerCase()));
  const support = model.stages.find((s: Row) => s.id === 'support');
  const usage = inputs.usage?.snapshot;
  const current = usage?.current;
  const measured = current?.coverage?.status && current.coverage.status !== 'unmeasured';
  const graphSummary = inputs.graph?.summary;
  const metric = (n: unknown) => typeof n === 'number' ? n.toLocaleString('ko-KR') : '미확인';
  return <main className={`op-app ${embedded?'op-embedded':''}`}><header className="op-topbar"><a className="op-brand" href="/"><GitBranch size={25}/><span>SOULFORGE<small>OPERATIONS ATLAS</small></span></a><nav aria-label="화면 선택"><a href="/">대시보드</a><button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}><GitBranch size={16}/>운영 지도</button><button className={tab === 'directory' ? 'active' : ''} onClick={() => setTab('directory')}><Folder size={16}/>디렉터리</button></nav><div className="op-mode"><LockKeyhole size={13}/>로컬 · 읽기 전용<a href="http://127.0.0.1:4192/" target="_blank" rel="noreferrer">운영 설치본 ↗</a></div></header>
    <div className="op-title"><div><small>VIGIL / FIRST PREVIEW</small><h1>{tab === 'map' ? '자료가 도착하고, 맥락이 되기까지.' : '실제 저장 위치를 따라가세요.'}</h1><p>{tab === 'map' ? '구조, 실행 관측, 근거의 시간을 함께 읽는 운영 지도' : '허용된 root 안에서 폴더와 파일의 메타데이터를 확인합니다.'}</p></div><button className="op-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? '근거 읽는 중' : '저장된 근거 다시 읽기'}</button></div>
    <section className="op-summary" aria-label="관측 요약"><div><small>세대 내 처리 / 대기 / 실패</small><strong>{graphSummary ? `${metric(graphSummary.completed)} / ${metric(graphSummary.pending)} / ${metric(graphSummary.failed)}` : '미확인'}</strong><span>{inputs.graph?.rows?.length ? `구성된 ${inputs.graph.rows.length}/${inputs.graph.expected}개 과제 영수증 · ${graphSummary?.fresh ? '45분 이내' : '현재 여부 미확인'}` : '업무 건수 집계 미연결'}</span></div><div><small>최근 DB 반영 / 상태 관측</small><strong>{at(graphSummary?.last_reflected_at)}</strong><span>상태 {at(model.observedAt)} · 보존 관측</span></div><div><small>관측 연결</small><strong>{model.sourceAvailable ? model.matchedCount : '미확인'}<em>개 노드</em></strong><span>전체 정상 또는 업무 성공을 뜻하지 않음</span></div><div><small>누적 토큰 · 등록 TASK 범위</small><strong>{measured && Number.isFinite(current?.totals?.total_tokens) ? new Intl.NumberFormat('ko-KR',{notation:'compact'}).format(current.totals.total_tokens) : '미확인'}</strong><span>{measured ? `${current.coverage.status === 'partial' ? '부분 측정' : '측정됨'} · ${at(usage.generated_at)}` : '측정 근거 미연결 · 0으로 대체하지 않음'}</span></div></section>
    {tab === 'directory' ? <Directory/> : <div className="op-reading-layout"><section className="op-map-main"><div className="op-map-toolbar"><div><Layers size={16}/><strong>자료가 지나가는 순서</strong><span>왼쪽 → 오른쪽</span></div><label><Search size={15}/><input aria-label="노드 필터" placeholder="세부 항목 찾기" value={query} onChange={e => {setQuery(e.target.value);setSelected(null);}}/></label><button onClick={() => { setOpenStage(null); setSelected(null); setPositions({}); setQuery(''); }}>전체 흐름으로</button></div>
      {!model.sourceAvailable && <div className="op-source-error">{loading ? '토폴로지 원천 읽는 중' : '토폴로지 원천 읽기 실패 · 구현 계약 노드만 표시합니다.'}</div>}
      <div className="op-flow op-overview-flow"><ReactFlow key={scene.nodes.length} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.05 }} minZoom={0.35} maxZoom={1.6} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} onNodeDragStop={(_,n) => setPositions(old => ({ ...old,[n.id]:n.position }))} onNodesChange={changes => {
        const changed = applyNodeChanges(changes, flowNodes);
        if (changes.some(c => c.type === 'position' && c.position)) setPositions(old => ({ ...old,...Object.fromEntries(changed.map(n => [n.id,n.position])) }));
      }} colorMode="dark"><Background gap={24} size={1}/><Controls showInteractive={false}/></ReactFlow></div>
      <div className="op-overview-gaps"><div><Unplug size={17}/><strong>02 → 03</strong><span>보관 → 맥락 엔진 준비<br/>전달 연결 미확인</span></div><div><Unplug size={17}/><strong>06 → 07</strong><span>맥락 → 에이전트 응답<br/>전달 연결 미등록</span></div><p>순서는 읽는 방향입니다.<br/>선이 없는 구간은 연결을 확인하지 못한 곳입니다.</p></div>
      <div className="op-map-legend"><span><i className="op-legend-line"/>등록된 자료 연결</span><span><i className="op-legend-line dashed"/>구현 계약 · 실행 미확인</span><span>원통: 저장소 · 원형: 에이전트 · 박스: 처리 / 노드 선택으로 진단</span></div>
    </section>
    <section className="op-support-shelf"><div><Activity size={18}/><strong>관측·백업·지원</strong><span>자료 처리 순서와 별도</span></div><button aria-expanded={openStage === 'support'} onClick={() => toggle('support')}>{support?.members.length ?? 0}개 항목 {openStage === 'support' ? '접기' : '보기'}<ChevronDown size={15}/></button></section>
    {(openStage || query) && <section className="op-stage-browser"><header><h2>{query ? '검색 결과' : opened?.title} <span>{members.length}개 항목</span></h2><button aria-label="항목 목록 접기" onClick={()=>{setOpenStage(null);setQuery('');setSelected(null);}}><X size={17}/></button></header><div className="op-stage-members">{members.map((n:Row)=><button key={n.id} className={selected===n.id?'selected':''} onClick={()=>setSelected(n.id)}><span className={`op-dot ${n.freshness==='fresh'?n.health:'unknown'}`}/><strong>{n.label}</strong><small>{n.observedAt?'관측 기록 있음':'실행 관측 미연결'}</small><ChevronRight size={14}/></button>)}</div>{members.length===0&&<p>일치하는 항목이 없습니다.</p>}</section>}
    {selectedNode ? <div className="op-selected-layout"><ConnectionFocus node={selectedNode} model={model} select={setSelected}/><Detail key={selected} node={selectedNode} model={model} close={() => setSelected(null)}/></div> : <p className="op-reading-help"><ShieldCheck size={16}/>노드를 고르면 직접 연결만 강조하고 오른쪽에 진단 근거를 엽니다. 모양과 선은 역할·구조이며 정상 판정이 아닙니다.</p>}
    </div>}
    <footer className="op-bottom">첫 버전 · 실관측 + 코드 기반 구조 · 시연값 없음<span>화면 조작은 서비스·DB·수집 주기를 바꾸지 않습니다.</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
