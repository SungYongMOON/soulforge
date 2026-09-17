import {useEffect,useMemo,useState} from 'react';
import {ReactFlow,Background,Controls,Handle,Position,MarkerType,type NodeProps} from '@xyflow/react';
import {ArrowRight,Database,FileText,GitBranch,X} from 'lucide-react';
import {ProjectNamesContext,ProjectLabel} from './project-labels';
import {RagTrend} from './rag-trend';
import {ragGraphScene,RAG_SOURCES} from './core/rag-explorer-view.mjs';
import '@xyflow/react/dist/style.css';
import './rag-explorer.css';

type Row=Record<string,any>;
const number=(v:any)=>typeof v==='number'?v.toLocaleString('ko-KR'):'—';
const when=(v:any)=>v?new Date(v).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';

function GraphNode({data}:NodeProps){
  const row=data.row as Row;
  return <button className={`rg-node kind-${row.kind} ${data.selected?'selected':''}`} onClick={()=> (data.select as (row:Row)=>void)(row)} aria-label={`${row.label} 연결 보기`}>
    <Handle type="target" position={Position.Left} id="t-left"/>
    <Handle type="source" position={Position.Left} id="s-left"/>
    {row.kind==='project'?<Database size={16}/>:row.kind==='document'?<FileText size={16}/>:row.kind==='chunk'?<FileText size={16}/>:<GitBranch size={16}/>}
    <span className="rg-node-text">
      <strong title={row.label}>{row.label}</strong>
      <small>{row.count!=null?`${number(row.count)} 문서`:row.kind==='chunk'?'검색용 본문 조각':row.kind==='entity'?'본문에서 추출한 개체':row.kind==='project'?'자료 수 확인 불가':row.kind==='document'?'문서':'자료 원천'}</small>
    </span>
    <Handle type="target" position={Position.Right} id="t-right"/>
    <Handle type="source" position={Position.Right} id="s-right"/>
  </button>;
}

const nodeTypes={rag:GraphNode};

function GraphCanvas({scene,select,selected,theme}:{scene:Row;select:(r:Row)=>void;selected?:string;theme:string}){
  const nodePos=useMemo<Map<string,Row>>(()=>new Map<string,Row>((scene.nodes??[]).map((n:Row)=>[n.id as string,n]) as [string,Row][]),[scene.nodes]);
  const nodes=useMemo(()=>(scene.nodes??[]).map((n:Row)=>({id:n.id,type:'rag',position:{x:n.x,y:n.y},data:{row:n,select,selected:n.id===selected},width:280,height:70})),[scene.nodes,selected,select]);
  const edges=useMemo(()=>(scene.edges??[]).map((e:Row)=>{
    const s=nodePos.get(e.source),t=nodePos.get(e.target);
    let sourceHandle='s-right',targetHandle='t-left';
    if(s&&t&&s.x>t.x){sourceHandle='s-left';targetHandle='t-right';}
    const isAdjacent=selected?(e.source===selected||e.target===selected):false;
    const showLabel=scene.edges.length<30?(selected?isAdjacent:true):isAdjacent;
    return {
      ...e,
      sourceHandle,
      targetHandle,
      type:'default',
      markerEnd:{type:MarkerType.ArrowClosed},
      style:{stroke:theme==='dark'?'#758294':'#8898aa',strokeWidth:1.5,opacity:selected?(isAdjacent?1:.15):.65},
      label:showLabel?e.label:undefined,
      labelStyle:{fontSize:11,fill:theme==='dark'?'#e7ecf2':'#202733',fontWeight:500},
      labelBgStyle:{fill:theme==='dark'?'#1a2027':'#ffffff',fillOpacity:.94}
    };
  }),[scene.edges,nodePos,selected,theme]);

  return <div className="rg-canvas" aria-label="실제 DB 문서·청크·개체 그래프">
    <div className="rg-canvas-hint" aria-hidden="true">
      <span>드래그: 화면 이동 · 휠: 확대/축소 · 컨트롤: 전체 맞춤</span>
    </div>
    <ReactFlow
      key={nodes.map((n:Row)=>n.id).join('|')}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      defaultViewport={{x:28,y:36,zoom:0.82}}
      minZoom={0.2}
      maxZoom={1.6}
      colorMode={theme==='dark'?'dark':'light'}
      nodesDraggable={false}
      nodesConnectable={false}
      panOnDrag={true}
      zoomOnScroll={true}
      onNodeClick={(_,n)=>select(n.data.row as Row)}
    >
      <Background gap={24} color={theme==='dark'?'#303a46':'#dce3ec'}/>
      <Controls showInteractive={false}/>
    </ReactFlow>
  </div>;
}

function isCompositionKnown(p:Row):boolean{
  if(p.comparison!=='counts_match'||p.detail_state!=='ready')return false;
  const docs=p.store?.counts?.documents;
  if(typeof docs!=='number'||docs<0)return false;
  const types=p.source_links?.types;
  if(!types||typeof types!=='object')return false;
  let sum=0;
  for(const count of Object.values(types)){
    if(typeof count!=='number'||count<0)return false;
    sum+=count;
  }
  return sum===docs;
}

function isProjectUnknown(p:Row):boolean{
  if(!p.database)return true;
  if(p.detail_state!=='ready')return true;
  if(!p.comparison||p.comparison==='unconfirmed')return true;
  if(!p.pending||p.pending.state!=='ready'||typeof p.pending.count!=='number')return true;
  if(!p.last_run||typeof p.last_run.totals?.failed!=='number')return true;
  return false;
}

export function RagOverview({data,choose,theme}:{data?:Row|null;choose:(p:string)=>void;theme?:string}){
  const projects:Row[]=data?.projects??[];
  const isReady=data?.state==='ready'&&Array.isArray(data?.projects);
  const sourceKeys=useMemo(()=>Object.keys(RAG_SOURCES),[RAG_SOURCES]);

  const knownProjects=useMemo(()=>projects.filter(isCompositionKnown),[projects]);
  const allKnown=Boolean(isReady&&data?.expected&&projects.length===data.expected&&knownProjects.length===projects.length);

  const sourceTotals=useMemo(()=>{
    const map=new Map<string,number>();
    for(const key of sourceKeys)map.set(key,0);
    for(const p of knownProjects){
      for(const [s,c] of Object.entries((p.source_links?.types??{}) as Record<string,number>)){
        if(typeof c==='number'&&c>0)map.set(s,(map.get(s)??0)+c);
      }
    }
    return sourceKeys.map(id=>{
      const count=map.get(id)??0;
      return {
        id,
        label:(RAG_SOURCES as Row)[id]??id,
        count,
        display:count>0?(allKnown?number(count):`${number(count)} 이상`):(allKnown?'0':'—')
      };
    });
  },[sourceKeys,knownProjects,allKnown]);

  const maxCount=useMemo(()=>{
    let m=1;
    for(const p of knownProjects){
      for(const c of Object.values((p.source_links?.types??{}) as Record<string,number>)){
        if(typeof c==='number'&&c>m)m=c;
      }
    }
    return m;
  },[knownProjects]);

  const attention=useMemo(()=>projects.filter(p=>
    (p.comparison!=='counts_match'&&p.comparison!=='unconfirmed'&&p.comparison!=null)||
    (typeof p.pending?.count==='number'&&p.pending.count>0)||
    (typeof p.last_run?.totals?.failed==='number'&&p.last_run.totals.failed>0)
  ),[projects]);

  const unknownProjects=useMemo(()=>projects.filter(isProjectUnknown),[projects]);
  const unknownCount=unknownProjects.length;

  const names=useMemo(()=>Object.fromEntries(projects.map((p:Row)=>[p.project,p.project_name])),[projects]);

  return <ProjectNamesContext.Provider value={names}><div className="rg-overview">
    <section className="rag-panel rg-connections">
      <header className="rag-section-title">
        <div>
          <h2>과제별 자료 구성</h2>
          <p>현재 검색 DB와 처리 버전이 일치하는 문서의 원천별 구성 집계 (개별 DB 관계와 별도) · 과제 행을 누르면 실제 DB 그래프 탐색</p>
        </div>
        <span className="rag-badge">{projects.length}개 과제</span>
      </header>
      <div className="rg-source-totals">
        {sourceTotals.map(s=><span key={s.id} title={s.display==='—'?'확인 불가':undefined}><b>{s.label}</b> {s.display}<small> 과제별 문서 합계</small></span>)}
        <small className="rg-coverage-note">
          {allKnown?`전체 ${projects.length}개 과제 확인 완료`:isReady?`확인된 ${knownProjects.length}/${projects.length}개 과제 집계 (일부 미확인 과제가 있어 확인된 하한값 표시, 미확인은 0이 아닌 '—'로 표기)`:'과제별 상세 자료 조회 중 (미확인은 0이 아닌 — 표기)'}
        </small>
      </div>
      <div className="rg-matrix-wrap">
        <table className="rg-matrix-table">
          <thead>
            <tr>
              <th>과제</th>
              {sourceKeys.map(k=><th key={k}>{(RAG_SOURCES as Row)[k]??k}</th>)}
              <th>문서 합계</th>
              <th>상태</th>
              <th>탐색</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p=>{
              const complete=isCompositionKnown(p);
              const links=(p.source_links?.types??{}) as Record<string,number>;
              return <tr key={p.project} className="rg-matrix-row" onClick={()=>choose(p.project)}>
                <td className="rg-matrix-proj-cell">
                  <button className="rag-item-button" onClick={(e)=>{e.stopPropagation();choose(p.project);}}>
                    <ProjectLabel code={p.project}/>
                  </button>
                </td>
                {sourceKeys.map(k=>{
                  if(!complete)return <td key={k} className="rg-cell-muted"><span className="rg-matrix-unknown" title="확인 불가">—</span></td>;
                  const count=links[k]??0;
                  if(count===0)return <td key={k} className="rg-cell-muted"><span className="rg-matrix-zero">0</span></td>;
                  const pct=Math.min(100,Math.max(8,Math.round((count/maxCount)*100)));
                  return <td key={k}>
                    <div className="rg-matrix-cell">
                      <span className="rg-matrix-num">{number(count)}</span>
                      <div className="rg-matrix-bar" aria-hidden="true"><div className="rg-matrix-fill" style={{width:`${pct}%`}}/></div>
                    </div>
                  </td>;
                })}
                <td className="rg-matrix-total">
                  {complete?<strong>{number(p.store?.counts?.documents)}</strong>:typeof p.store?.counts?.documents==='number'?<span title="DB 대조 또는 세부 미확인">{number(p.store.counts.documents)} (미대조)</span>:<span className="rg-matrix-unknown" title="확인 불가">—</span>}
                </td>
                <td>
                  <span className={`rag-badge ${p.comparison==='counts_match'?'ok':'warn'}`}>{p.comparison==='counts_match'?'저장 일치':p.comparison==='unconfirmed'?'확인 불가':'확인 필요'}</span>
                </td>
                <td>
                  <button className="rg-enter-btn" aria-label={`${p.project} 실제 그래프 탐색`} onClick={(e)=>{e.stopPropagation();choose(p.project);}}>
                    <span>그래프</span><ArrowRight size={13}/>
                  </button>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="rag-footnote">이 표는 자료 원천과 과제의 구성 집계입니다. 같은 문서가 여러 과제에 있으면 각각 집계합니다. 개별 DB 관계(Neo4j)와 별도입니다.{!allKnown?' 원천별 수량을 확인하지 못한 과제는 —로 표시합니다.':''}</p>
    </section>
    <section className="rag-panel rg-coverage"><header><h2>연결 범위와 확인할 항목</h2></header>
      <div className="rg-scope"><strong>과제별 RAG</strong><span>{isReady?`${projects.filter(p=>p.database).length} / ${data?.expected??'—'} 연결`:'조회 미확인'}</span></div>
      <div className="rg-scope"><strong>공통 RAG</strong><span>별도 조회 연결 정보 없음</span></div>
      <p className="rag-footnote">설정된 과제 범위를 집계한 전체 요약입니다. 공통 RAG를 위한 별도 연결 메타데이터는 제공되지 않으며, 별도의 공통 저장소를 임의로 생성하지 않습니다.</p>
      <h3>확인할 항목 {isReady&&(attention.length>0||unknownCount===0)?attention.length:'—'}</h3>
      {!isReady?<p>과제별 상태를 아직 확인하지 못했습니다. 정상 상태로 판단하지 않습니다.</p>:attention.length?attention.map(p=><button className="rg-project-action" key={p.project} onClick={()=>choose(p.project)}><ProjectLabel code={p.project}/><small>{p.comparison!=='counts_match'&&p.comparison!=='unconfirmed'?'DB 저장 상태 확인':p.last_run?.totals?.failed>0?`최근 처리 실패 ${p.last_run.totals.failed}건`:p.pending?.count>0?`재처리 대기 ${p.pending.count}건`:'확인 필요'}</small><ArrowRight size={14}/></button>):unknownCount>0?<p className="rg-coverage-unknown-notice">조치 대상 확인 불가 {unknownCount}개 과제 (상세·대기·실행 기록 미확인으로 정상으로 단정하지 않음).</p>:<p>확인된 전체 과제에서 저장 불일치·실패·재처리 대기 없음.</p>}
      <h3>연결된 처리 모델</h3>{[...new Set(projects.flatMap(p=>[p.store?.model?.extractor,p.store?.model?.embedder]).filter(Boolean))].map((m:any)=><div className="rg-model" key={m}>{m}</div>)}
      <p className="rag-footnote">현재 처리 버전의 모델 기록 · 서버 가동 여부는 운영 현황에서 확인</p>
    </section>
    <section className="rag-panel rg-project-table"><header className="rag-section-title"><h2>과제별 검색 데이터</h2><span className="rag-muted">비교 후 과제를 선택해 연결 탐색</span></header><div className="rag-table-scroll"><table><thead><tr><th>과제</th><th>문서</th><th>검색 청크</th><th>벡터 포함</th><th>DB 관계</th><th>재처리</th><th>마지막 저장</th><th>상태</th></tr></thead><tbody>{projects.map(p=><tr key={p.project}><td><button className="rag-item-button" onClick={()=>choose(p.project)}><ProjectLabel code={p.project}/></button></td><td>{number(p.store?.counts?.documents)}</td><td>{number(p.database?.chunks)}</td><td>{number(p.database?.embedded_chunks)}</td><td>{p.database?number(Object.values(p.database.relationships??{}).reduce((sum:any,n:any)=>sum+n,0)):'—'}</td><td>{number(p.pending?.count)}</td><td>{when(p.database?.loaded_at)}</td><td><span className={`rag-badge ${p.comparison==='counts_match'?'ok':'warn'}`}>{p.comparison==='counts_match'?'저장 일치':p.comparison==='unconfirmed'?'확인 불가':'확인 필요'}</span></td></tr>)}</tbody></table></div></section>
    <RagTrend projects={projects} expected={data?.expected??0} asOf={data?.observed_at}/>
  </div></ProjectNamesContext.Provider>;
}

export function RagGraph({project,documents,theme,version}:{project:string;documents:Row[];theme:string;version?:string}){
  const [selectedDoc,setSelectedDoc]=useState<string|null>(null);
  const [data,setData]=useState<Row|null>(null),[selected,setSelected]=useState<Row|null>(null),[retry,setRetry]=useState(0);

  useEffect(()=>{
    setSelectedDoc(null);
  },[project]);

  const availableDocs=useMemo(()=>documents.filter(d=>d.id),[documents]);
  const effectiveDoc=useMemo(()=>{
    if(selectedDoc!==null)return selectedDoc;
    if(availableDocs.length>0)return availableDocs[0].id;
    return '';
  },[selectedDoc,availableDocs]);

  useEffect(()=>{
    let alive=true;setData(null);setSelected(null);
    const params=new URLSearchParams({view:'graph',project});
    if(effectiveDoc)params.set('document',effectiveDoc);
    fetch(`/rag-operations.json?${params}`,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000)}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(r=>{if(alive)setData(r);},()=>{if(alive)setData({state:'unavailable'});});
    return()=>{alive=false;};
  },[project,effectiveDoc,version,retry]);

  const scene=useMemo(()=>ragGraphScene(data),[data]);
  const adjacent=selected?scene.edges.filter((e:Row)=>e.source===selected.id||e.target===selected.id):[];
  const label=(id:string)=>scene.nodes.find((n:Row)=>n.id===id)?.label??id;

  return <section className="rag-panel rg-live"><header className="rag-section-title"><div><h2>실제 DB 연결 그래프</h2><p>문서 → 청크 → 개체 · 연결선은 Neo4j에 저장된 관계</p></div><label>자료 범위 <select aria-label="그래프 문서 선택" value={effectiveDoc} onChange={e=>setSelectedDoc(e.target.value)}><option value="">과제 전체 중 표본</option>{availableDocs.map(d=><option key={d.id} value={d.id}>{(RAG_SOURCES as Row)[d.source]??d.source} · {d.item??d.id}</option>)}</select></label></header>
    <div className="rg-legend"><span className="is-document">문서</span><span className="is-chunk">검색 청크</span><span className="is-entity">추출 개체</span><small>{data?.state==='ready'?`${(data.nodes??[]).length} 노드 · ${(data.edges??[]).length} 연결 · 마우스 드래그로 화면 이동`:'조회 중 또는 확인 불가'}</small></div>
    <div className={`rg-live-body ${selected?'has-selection':''}`}>{data===null?<div className="rag-empty">실제 DB의 연결을 읽는 중…</div>:data.state!=='ready'?<div className="rag-empty"><p>현재 DB 연결 그래프를 읽지 못했습니다. 과제·처리 버전이 바뀌었거나 조회에 실패했을 수 있습니다.</p><button onClick={()=>setRetry(v=>v+1)}>그래프 다시 조회</button></div>:scene.nodes.length?<GraphCanvas scene={scene} theme={theme} select={setSelected} selected={selected?.id}/>:<div className="rag-empty">선택한 범위에서 표시할 DB 노드가 없습니다.</div>}
      {selected&&<aside className="rg-inspection"><header><h3>{selected.label}</h3><button aria-label="그래프 선택 해제" onClick={()=>setSelected(null)}><X size={14}/></button></header><p>{selected.kind==='document'?'문서':selected.kind==='chunk'?'검색용 본문 조각':'본문에서 추출한 개체'}</p><small>선택 노드의 표시 범위 내 연결 {adjacent.length}</small>{adjacent.map((e:Row)=><button key={e.id} onClick={()=>setSelected(scene.nodes.find((n:Row)=>n.id===(e.source===selected.id?e.target:e.source)))}><span>{e.label}</span><strong>{label(e.source===selected.id?e.target:e.source)}</strong><small>{e.source===selected.id?'나가는 연결':'들어오는 연결'}</small></button>)}{!adjacent.length&&<p>이 표본 안에 표시된 연결 없음. DB 전체에서 고립됐다는 뜻은 아닙니다.</p>}<details><summary>노드 식별 정보</summary><p>{selected.document}</p><p>{selected.unit??selected.id}</p></details></aside>}
    </div><p className="rag-footnote">{data?.limited?'표시 한도에 도달했습니다. 문서를 선택해 범위를 좁히세요. ':'현재 선택 범위의 제한된 연결 보기. '}본문·벡터 값은 가져오지 않습니다. 질문에서 실제로 따라간 경로·검색 성공과는 별도입니다. {when(data?.observed_at)}</p>
  </section>;
}
