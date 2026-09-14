import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, applyNodeChanges, type NodeProps } from '@xyflow/react';
import { Activity, Archive, ArrowUpLeft, Boxes, ChevronDown, ChevronRight, Database, File, Filter, Folder, GitBranch, Inbox, Layers, LockKeyhole, MessageSquare, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { buildOperationsMap, stageConnections } from './core/operations-map-view.mjs';
import { describeTopologyReason } from './core/topology-view.mjs';
import '@xyflow/react/dist/style.css';
import './design/design-system.generated.css';
import './operations-map.css';

type Row = Record<string, any>;
const icons: Record<string, any> = { inbox: Inbox, archive: Archive, filter: Filter, boxes: Boxes, database: Database, search: Search, message: MessageSquare, activity: Activity };
const healthLabel: Record<string,string> = { ok: '정상 관측', down: '실패 관측', degraded: '주의 관측', stale: '지연 관측', unmonitored: '미감시', unknown: '미확인' };
const at = (value: any) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미확인';
const bytes = (n: any) => n === null || n === undefined ? '미집계' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
async function readJson(url: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store', credentials: 'omit' });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('read_unavailable');
  return response.json();
}

function StageNode({ data }: NodeProps) {
  const d = data as Row, stage = d.stage, Icon = icons[stage.icon];
  const members = stage.members as Row[];
  const previewCount = ['response', 'prepare'].includes(stage.id) ? 3 : 2;
  const visible = d.expanded ? members : members.slice(0, previewCount);
  const observations = members.filter(n => n.observedAt).length;
  return <article className={`op-stage op-stage-${stage.id}`}>
    <Handle type="target" id="left" position={Position.Left}/><Handle type="source" id="right" position={Position.Right}/>
    <Handle type="target" id="top" position={Position.Top}/><Handle type="source" id="bottom" position={Position.Bottom}/>
    <Handle type="target" id="right-in" position={Position.Right}/><Handle type="source" id="left-out" position={Position.Left}/>
    <div className="op-stage-heading"><span className="op-stage-icon"><Icon size={20}/></span><div><small>{d.number === 8 ? 'SUPPORT' : `STAGE 0${d.number}`}</small><h2>{stage.title}</h2></div>
      <button className="nodrag op-disclosure" aria-label={`${stage.title} ${d.expanded ? '접기' : '펼치기'}`} aria-expanded={d.expanded} onClick={() => d.toggle(stage.id)}>{d.expanded ? <ChevronDown size={17}/> : <ChevronRight size={17}/>}</button></div>
    <p>{stage.subtitle}</p>
    <div className="op-members nodrag nowheel">{visible.map(n => <button key={n.id} className={`op-member ${d.selected === n.id ? 'is-selected' : ''}`} onClick={() => d.select(n.id)}><span className={`op-dot ${n.freshness === 'fresh' ? n.health : 'unknown'}`}/><span>{n.label}</span><ChevronRight size={12}/></button>)}</div>
    {!d.expanded && members.length > previewCount && <button className="op-more nodrag" onClick={() => d.toggle(stage.id)}>+ {members.length - previewCount}개 항목 펼치기</button>}
    <footer>{members.length}개 항목 <span>{observations ? `${observations}개 관측 기록` : '실행 관측 미연결'}</span></footer>
  </article>;
}
const nodeTypes = { stage: StageNode };

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
  const [tab, setTab] = useState('map'), [inputs, setInputs] = useState<Row>({}), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null), [expanded, setExpanded] = useState<string[]>([]), [query, setQuery] = useState('');
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
  const toggle = useCallback((id: string) => setExpanded(old => old.includes(id) ? old.filter(x => x !== id) : [...old,id]), []);
  const flowNodes = model.stages.map((stage: Row, index: number) => ({ id: stage.id, type: 'stage', position: positions[stage.id] ?? { x: stage.x, y: stage.y },
    data: { stage: { ...stage, members: query ? stage.members.filter((n: Row) => `${n.label} ${n.id}`.toLowerCase().includes(query.toLowerCase())) : stage.members },
      number: index+1, expanded: expanded.includes(stage.id), toggle, select: setSelected, selected } }));
  const flowEdges = stageConnections(model).map((e: Row) => ({ id: e.id, source: e.source, target: e.target, type: 'default', animated: false, markerEnd: { type: MarkerType.ArrowClosed },
    sourceHandle: e.source === 'extract' && e.target === 'graph' ? 'bottom' : ['graph','context'].includes(e.source) ? 'left-out' : 'right',
    targetHandle: e.source === 'extract' && e.target === 'graph' ? 'top' : ['graph','context'].includes(e.source) ? 'right-in' : 'left',
    label: e.label, className: e.id.endsWith('implementation') ? 'op-edge-implementation' : 'op-edge-declared',
    style: { strokeWidth: 1.6 }, labelStyle: { fontSize: 11 }, labelShowBg: true }));
  const usage = inputs.usage?.snapshot;
  const current = usage?.current;
  const measured = current?.coverage?.status && current.coverage.status !== 'unmeasured';
  const graphSummary = inputs.graph?.summary;
  const metric = (n: unknown) => typeof n === 'number' ? n.toLocaleString('ko-KR') : '미확인';
  return <main className="op-app"><header className="op-topbar"><a className="op-brand" href="/operations-map.html"><GitBranch size={25}/><span>SOULFORGE<small>OPERATIONS ATLAS</small></span></a><nav aria-label="화면 선택"><button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}><GitBranch size={16}/>운영 지도</button><button className={tab === 'directory' ? 'active' : ''} onClick={() => setTab('directory')}><Folder size={16}/>디렉터리</button></nav><div className="op-mode"><LockKeyhole size={13}/>로컬 · 읽기 전용<a href="http://127.0.0.1:4192/" target="_blank" rel="noreferrer">기존 화면 ↗</a></div></header>
    <div className="op-title"><div><small>VIGIL / FIRST PREVIEW</small><h1>{tab === 'map' ? '자료가 도착하고, 맥락이 되기까지.' : '실제 저장 위치를 따라가세요.'}</h1><p>{tab === 'map' ? '구조, 실행 관측, 근거의 시간을 함께 읽는 운영 지도' : '허용된 root 안에서 폴더와 파일의 메타데이터를 확인합니다.'}</p></div><button className="op-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? '근거 읽는 중' : '저장된 근거 다시 읽기'}</button></div>
    <section className="op-summary" aria-label="관측 요약"><div><small>세대 내 처리 / 대기 / 실패</small><strong>{graphSummary ? `${metric(graphSummary.completed)} / ${metric(graphSummary.pending)} / ${metric(graphSummary.failed)}` : '미확인'}</strong><span>{inputs.graph?.rows?.length ? `구성된 ${inputs.graph.rows.length}/${inputs.graph.expected}개 과제 영수증 · ${graphSummary?.fresh ? '45분 이내' : '현재 여부 미확인'}` : '업무 건수 집계 미연결'}</span></div><div><small>최근 DB 반영 / 상태 관측</small><strong>{at(graphSummary?.last_reflected_at)}</strong><span>상태 {at(model.observedAt)} · 보존 관측</span></div><div><small>관측 연결</small><strong>{model.sourceAvailable ? model.matchedCount : '미확인'}<em>개 노드</em></strong><span>전체 정상 또는 업무 성공을 뜻하지 않음</span></div><div><small>누적 토큰 · 등록 TASK 범위</small><strong>{measured && Number.isFinite(current?.totals?.total_tokens) ? new Intl.NumberFormat('ko-KR',{notation:'compact'}).format(current.totals.total_tokens) : '미확인'}</strong><span>{measured ? `${current.coverage.status === 'partial' ? '부분 측정' : '측정됨'} · ${at(usage.generated_at)}` : '측정 근거 미연결 · 0으로 대체하지 않음'}</span></div></section>
    {tab === 'directory' ? <Directory/> : <div className="op-map-shell"><section className="op-map-main"><div className="op-map-toolbar"><div><Layers size={16}/><strong>운영 흐름</strong><span>01 — 07</span></div><label><Search size={15}/><input aria-label="노드 필터" placeholder="노드 이름으로 찾기" value={query} onChange={e => setQuery(e.target.value)}/></label><button onClick={() => { setExpanded([]); setPositions({}); setQuery(''); }}>배치 초기화</button></div>
      {!model.sourceAvailable && <div className="op-source-error">{loading ? '토폴로지 원천 읽는 중' : '토폴로지 원천 읽기 실패 · 구현 계약 노드만 표시합니다.'}</div>}
      <div className="op-flow"><ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.09 }} minZoom={0.35} maxZoom={1.6} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} onNodeDragStop={(_,n) => setPositions(old => ({ ...old,[n.id]:n.position }))} onNodesChange={changes => {
        const changed = applyNodeChanges(changes, flowNodes);
        if (changes.some(c => c.type === 'position' && c.position)) setPositions(old => ({ ...old,...Object.fromEntries(changed.map(n => [n.id,n.position])) }));
      }} colorMode="dark"><Background gap={24} size={1}/><Controls showInteractive={false}/></ReactFlow></div>
      <div className="op-map-legend"><span><i className="op-legend-line"/>등록 구조</span><span><i className="op-legend-line dashed"/>구현 계약 · 실행 미확인</span><span><i className="op-dot unknown"/>현재 근거 미확인</span><span>드래그 이동 · 휠 확대 · 그룹 펼치기</span></div><div className="op-gap-strip"><ShieldCheck size={16}/><span>{model.gaps.join(' / ')}</span></div>
    </section><Detail key={selected ?? 'empty'} node={model.nodes.find((n: Row) => n.id === selected)} model={model} close={() => setSelected(null)}/></div>}
    <footer className="op-bottom">첫 버전 · 실관측 + 코드 기반 구조 · 시연값 없음<span>화면 조작은 서비스·DB·수집 주기를 바꾸지 않습니다.</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
