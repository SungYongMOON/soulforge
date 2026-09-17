import {useEffect,useMemo,useState,useRef} from 'react';
import {ReactFlow,Background,Controls,Handle,Position,MarkerType,type NodeProps,type ReactFlowInstance} from '@xyflow/react';
import {ArrowRight,Database,FileText,GitBranch,RotateCcw,Search,SlidersHorizontal,X} from 'lucide-react';
import {ProjectNamesContext,ProjectLabel} from './project-labels';
import {RagTrend} from './rag-trend';
import {ragGraphScene,RAG_SOURCES,ENTITY_TYPE_NAMES} from './core/rag-explorer-view.mjs';
import '@xyflow/react/dist/style.css';
import './rag-explorer.css';

type Row=Record<string,any>;
const number=(v:any)=>typeof v==='number'?v.toLocaleString('ko-KR'):'—';
const when=(v:any)=>v?new Date(v).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const entityName=(type:string)=>(ENTITY_TYPE_NAMES as Row)[type]??type;

function GraphNode({data}:NodeProps){
  const row=data.row as Row;
  const isSemantic=row.mode==='semantic';

  if(isSemantic){
    return (
      <button
        className={`rg-circle-node type-${row.colorKey||'default'} ${data.selected?'selected':''}`}
        onClick={()=>(data.select as (row:Row)=>void)(row)}
        aria-label={`${row.label} (${entityName(row.entityType)})`}
      >
        <Handle type="target" position={Position.Top} id="t-top"/>
        <Handle type="source" position={Position.Top} id="s-top"/>
        <Handle type="target" position={Position.Bottom} id="t-bottom"/>
        <Handle type="source" position={Position.Bottom} id="s-bottom"/>
        <Handle type="target" position={Position.Left} id="t-left"/>
        <Handle type="source" position={Position.Left} id="s-left"/>
        <Handle type="target" position={Position.Right} id="t-right"/>
        <Handle type="source" position={Position.Right} id="s-right"/>
        <div className="rg-circle-disc" title={`${row.label} · ${row.entityType}`}>
          <span className="rg-circle-type-tag">{entityName(row.entityType)}</span>
        </div>
        <span className="rg-circle-label" title={row.label}>{row.label}</span>
      </button>
    );
  }

  return (
    <button
      className={`rg-node kind-${row.kind} ${data.selected?'selected':''}`}
      onClick={()=>(data.select as (row:Row)=>void)(row)}
      aria-label={`${row.label} 연결 보기`}
    >
      <Handle type="target" position={Position.Left} id="t-left"/>
      <Handle type="source" position={Position.Left} id="s-left"/>
      {row.kind==='project'?<Database size={16}/>:row.kind==='document'?<FileText size={16}/>:row.kind==='chunk'?<FileText size={16}/>:<GitBranch size={16}/>}
      <span className="rg-node-text">
        <strong title={row.label}>{row.label}</strong>
        <small>{row.count!=null?`${number(row.count)} 문서`:row.kind==='chunk'?'검색용 본문 조각':row.kind==='entity'?'본문에서 추출한 개체':row.kind==='project'?'자료 수 확인 불가':row.kind==='document'?'문서':'자료 원천'}</small>
      </span>
      <Handle type="target" position={Position.Right} id="t-right"/>
      <Handle type="source" position={Position.Right} id="s-right"/>
    </button>
  );
}

const nodeTypes={rag:GraphNode};

function GraphCanvas({scene,select,selected,theme}:{scene:Row;select:(r:Row)=>void;selected?:string;theme:string}){
  const isSemantic=scene.mode==='semantic';
  const [flow,setFlow]=useState<ReactFlowInstance<any,any>|null>(null);
  const canvasRef=useRef<HTMLDivElement>(null);
  const nodePos=useMemo<Map<string,Row>>(()=>new Map<string,Row>((scene.nodes??[]).map((n:Row)=>[n.id as string,n]) as [string,Row][]),[scene.nodes]);
  useEffect(()=>{
    if(!flow||!isSemantic||!canvasRef.current)return;
    const row=selected?nodePos.get(selected):scene.nodes?.[0];if(!row)return;
    const center=()=>{const el=canvasRef.current;if(!el?.clientWidth||!el.clientHeight)return;const zoom=selected?Math.max(.75,flow.getZoom()):.85;void flow.setViewport({x:el.clientWidth/2-(row.x+60)*zoom,y:el.clientHeight/2-(row.y+45)*zoom,zoom},{duration:0});};
    const observer=new ResizeObserver(center);observer.observe(canvasRef.current);
    const frame=requestAnimationFrame(center);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();};
  },[flow,selected,isSemantic,nodePos]);
  const nodes=useMemo(()=>(scene.nodes??[]).map((n:Row)=>({
    id:n.id,
    type:'rag',
    position:{x:n.x,y:n.y},
    data:{row:n,select,selected:n.id===selected},
    width:isSemantic?120:280,
    height:isSemantic?90:70
  })),[scene.nodes,selected,select,isSemantic]);

  const edges=useMemo(()=>(scene.edges??[]).map((e:Row)=>{
    const s=nodePos.get(e.source),t=nodePos.get(e.target);
    let sourceHandle='s-right',targetHandle='t-left';
    if(s&&t){
      if(isSemantic){
        const dx=t.x-s.x;
        const dy=t.y-s.y;
        if(Math.abs(dx)>=Math.abs(dy)){
          sourceHandle=dx>=0?'s-right':'s-left';
          targetHandle=dx>=0?'t-left':'t-right';
        }else{
          sourceHandle=dy>=0?'s-bottom':'s-top';
          targetHandle=dy>=0?'t-top':'t-bottom';
        }
      }else{
        if(s.x>t.x){sourceHandle='s-left';targetHandle='t-right';}
      }
    }
    const isAdjacent=selected?(e.source===selected||e.target===selected):false;
    const showLabel=scene.edges.length<35?(selected?isAdjacent:true):isAdjacent;
    return {
      ...e,
      sourceHandle,
      targetHandle,
      type:'default',
      markerEnd:{type:MarkerType.ArrowClosed},
      style:{
        stroke:theme==='dark'?'#758294':'#8898aa',
        strokeWidth:1.6,
        opacity:selected?(isAdjacent?1:0.12):0.72
      },
      label:showLabel?e.label:undefined,
      labelStyle:{fontSize:11,fill:theme==='dark'?'#e7ecf2':'#202733',fontWeight:500},
      labelBgStyle:{fill:theme==='dark'?'#1a2027':'#ffffff',fillOpacity:0.94}
    };
  }),[scene.edges,isSemantic,nodePos,selected,theme]);

  return <div ref={canvasRef} className={`rg-canvas ${isSemantic?'is-semantic':'is-storage'}`} aria-label={isSemantic?'개체 지식 그래프':'실제 DB 저장 구조 그래프'}>
    <div className="rg-canvas-hint" aria-hidden="true">
      <span>드래그: 화면 이동 · 휠: 확대/축소 · 컨트롤: 전체 맞춤</span>
    </div>
    <ReactFlow
      key={(scene.mode||'sem')+'|'+nodes.map((n:Row)=>n.id).join('|')}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={setFlow}
      defaultViewport={{x:isSemantic?100:28,y:isSemantic?60:36,zoom:0.85}}
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
      <p className="rag-footnote">이 표는 자료 원천과 과제의 구성 집계입니다. 같은 문서가 여러 과제에 있으면 각각 집계합니다. 개별 DB 관계(Neo4j)와 별도입니다.{unknownCount>0?` 전체 ${projects.length}개 과제 중 ${unknownCount}개는 DB 대조·대기·실행 기록 미확인으로 원천별 수량을 0이 아닌 '— (확인 불가)'로 표시합니다.`:''}</p>
    </section>
    <section className="rag-panel rg-coverage"><header><h2>연결 범위와 확인할 항목</h2></header>
      <div className="rg-scope"><strong>과제별 RAG</strong><span>{isReady?`${projects.filter(p=>p.database).length} / ${data?.expected??'—'} 연결`:'조회 미확인'}</span></div>
      <div className="rg-scope"><strong>공통 RAG</strong><span>별도 조회 연결 정보 없음</span></div>
      <p className="rag-footnote">설정된 과제 범위를 집계한 전체 요약입니다. 공통 RAG를 위한 별도 연결 메타데이터는 제공되지 않으며, 별도의 공통 저장소를 임의로 생성하지 않습니다.</p>
      <h3>조치 대상 {isReady?attention.length:'—'}</h3>
      {!isReady?<p>과제별 상태를 아직 확인하지 못했습니다. 정상 상태로 판단하지 않습니다.</p>:attention.length?attention.map(p=><button className="rg-project-action" key={p.project} onClick={()=>choose(p.project)}><ProjectLabel code={p.project}/><small>{p.comparison!=='counts_match'&&p.comparison!=='unconfirmed'?'DB 저장 불일치':p.last_run?.totals?.failed>0?`최근 처리 실패 ${p.last_run.totals.failed}건`:p.pending?.count>0?`재처리 대기 ${p.pending.count}건`:'확인 필요'}</small><ArrowRight size={14}/></button>):unknownCount>0?<p className="rg-coverage-unknown-notice">조치 대상 확인 불가 {unknownCount}개 과제 (상세·대기·실행 기록 미확인으로 정상으로 단정하지 않음).</p>:<p>확인된 전체 과제에서 저장 불일치·실패·재처리 대기 없음.</p>}
      <h3>연결된 처리 모델</h3>{[...new Set(projects.flatMap(p=>[p.store?.model?.extractor,p.store?.model?.embedder]).filter(Boolean))].map((m:any)=><div className="rg-model" key={m}>{m}</div>)}
      <p className="rag-footnote">현재 처리 버전의 모델 기록 · 서버 가동 여부는 운영 현황에서 확인</p>
    </section>
    <section className="rag-panel rg-project-table"><header className="rag-section-title"><h2>과제별 검색 데이터</h2><span className="rag-muted">비교 후 과제를 선택해 연결 탐색</span></header><div className="rag-table-scroll"><table><thead><tr><th>과제</th><th>문서</th><th>검색 청크</th><th>벡터 포함</th><th>DB 관계</th><th>재처리</th><th>마지막 저장</th><th>상태</th></tr></thead><tbody>{projects.map(p=><tr key={p.project}><td><button className="rag-item-button" onClick={()=>choose(p.project)}><ProjectLabel code={p.project}/></button></td><td>{number(p.store?.counts?.documents)}</td><td>{number(p.database?.chunks)}</td><td>{number(p.database?.embedded_chunks)}</td><td>{p.database?number(Object.values(p.database.relationships??{}).reduce((sum:any,n:any)=>sum+n,0)):'—'}</td><td>{number(p.pending?.count)}</td><td>{when(p.database?.loaded_at)}</td><td><span className={`rag-badge ${p.comparison==='counts_match'?'ok':'warn'}`}>{p.comparison==='counts_match'?'저장 일치':p.comparison==='unconfirmed'?'확인 불가':'확인 필요'}</span></td></tr>)}</tbody></table></div></section>
    <RagTrend projects={projects} expected={data?.expected??0} asOf={data?.observed_at}/>
  </div></ProjectNamesContext.Provider>;
}

export function RagGraph({project,documents,theme,version}:{project:string;documents:Row[];theme:string;version?:string}){
  const [mode,setMode]=useState<'semantic'|'storage'>('semantic');
  const [selectedDoc,setSelectedDoc]=useState<string|null>(null);
  const [data,setData]=useState<Row|null>(null);
  const [selected,setSelected]=useState<Row|null>(null);
  const [filterQuery,setFilterQuery]=useState('');
  const [filterType,setFilterType]=useState('');
  const [retry,setRetry]=useState(0);

  useEffect(()=>{
    setSelectedDoc(null);
    setSelected(null);
    setFilterQuery('');
    setFilterType('');
  },[project]);

  // Merge documents prop with backend graph documents
  const mergedDocs=useMemo(()=>{
    const map=new Map<string,{id:string;source?:string;item?:string;title?:string}>();

    for(const d of documents??[]){
      if(!d.id)continue;
      map.set(d.id,{id:d.id,source:d.source,item:d.item,title:d.title});
    }

    const backendDocs:Array<{id:string;title?:string|null}>=data?.documents??[];
    for(const bd of backendDocs){
      if(!bd.id)continue;
      const existing=map.get(bd.id);
      if(existing){
        if(bd.title&&!existing.title)existing.title=bd.title;
      }else{
        map.set(bd.id,{id:bd.id,title:bd.title||undefined});
      }
    }

    return Array.from(map.values()).map(d=>{
      const srcLabel=d.source?((RAG_SOURCES as Row)[d.source]??d.source):'';
      const mainTitle=d.title||d.item||(d.id.length>22?`${d.id.slice(0,18)}…`:d.id);
      const displayLabel=srcLabel?`${srcLabel} · ${mainTitle}`:mainTitle;
      return {...d,displayLabel,mainTitle,sourceLabel:srcLabel};
    });
  },[documents,data?.documents]);

  const effectiveDoc=useMemo(()=>{
    if(selectedDoc!==null)return selectedDoc;
    if(mergedDocs.length>0)return mergedDocs[0].id;
    return '';
  },[selectedDoc,mergedDocs]);

  useEffect(()=>{
    let alive=true;
    setData(null);
    setSelected(null);
    const params=new URLSearchParams({view:'graph',project});
    if(effectiveDoc)params.set('document',effectiveDoc);
    fetch(`/rag-operations.json?${params}`,{
      cache:'no-store',
      credentials:'omit',
      redirect:'error',
      signal:AbortSignal.timeout(30000)
    }).then(async r=>{
      if(!r.ok)throw Error();
      return r.json();
    }).then(r=>{
      if(alive)setData(r);
    },()=>{
      if(alive)setData({state:'unavailable'});
    });
    return()=>{alive=false;};
  },[project,effectiveDoc,version,retry]);

  const rawScene=useMemo(()=>ragGraphScene(data,mode),[data,mode]);

  const entityTypes=useMemo(()=>{
    const set=new Set<string>();
    (rawScene.nodes??[]).forEach((n:Row)=>{
      if(n.entityType)set.add(n.entityType);
    });
    return Array.from(set);
  },[rawScene.nodes]);

  // Client-side search & type filter in semantic mode
  const scene=useMemo(()=>{
    if(mode!=='semantic'||(!filterQuery.trim()&&!filterType)){
      return rawScene;
    }
    const q=filterQuery.trim().toLowerCase();
    const matching=rawScene.nodes.filter((n:Row)=>{
      const matchesQ=!q||n.label.toLowerCase().includes(q);
      const matchesT=!filterType||n.entityType===filterType;
      return matchesQ&&matchesT;
    });

    const matchIds=new Set(matching.map((n:Row)=>n.id));
    const visibleIds=new Set(matchIds);
    (rawScene.edges??[]).forEach((e:Row)=>{
      if(matchIds.has(e.source))visibleIds.add(e.target);
      if(matchIds.has(e.target))visibleIds.add(e.source);
    });

    return {
      ...rawScene,
      nodes:rawScene.nodes.filter((n:Row)=>visibleIds.has(n.id)),
      edges:rawScene.edges.filter((e:Row)=>visibleIds.has(e.source)&&visibleIds.has(e.target))
    };
  },[rawScene,mode,filterQuery,filterType]);

  const adjacent=selected?scene.edges.filter((e:Row)=>e.source===selected.id||e.target===selected.id):[];
  const label=(id:string)=>scene.nodes.find((n:Row)=>n.id===id)?.label??id;

  // Selected item's source document info
  const sourceDocInfo=useMemo(()=>{
    if(!selected?.document)return null;
    const doc=mergedDocs.find(d=>d.id===selected.document);
    if(doc){
      return {
        id:doc.id,
        title:doc.mainTitle,
        sourceLabel:doc.sourceLabel
      };
    }
    return {
      id:selected.document,
      title:selected.document.length>24?`${selected.document.slice(0,20)}…`:selected.document,
      sourceLabel:''
    };
  },[selected?.document,mergedDocs]);

  const hasFilterActive=Boolean(filterQuery.trim()||filterType);

  return <section className="rag-panel rg-live">
    <header className="rag-section-title">
      <div>
        <h2>실제 DB 연결 탐색</h2>
        <p>{mode==='semantic'?'추출된 개체(인물·장비·사건·결정 등)와 실제 DB 관계 탐색 · 출처 문서 추적':'문서 → 청크 → 개체 저장 구조 및 DB 관계 디버그'}</p>
      </div>
      <div className="rg-mode-toggle" role="group" aria-label="그래프 보기 모드">
        <button
          type="button"
          className={`rg-mode-btn ${mode==='semantic'?'is-active':''}`}
          onClick={()=>{setMode('semantic');setSelected(null);}}
          aria-pressed={mode==='semantic'}
        >
          <GitBranch size={14}/>
          <span>내용 연결</span>
        </button>
        <button
          type="button"
          className={`rg-mode-btn ${mode==='storage'?'is-active':''}`}
          onClick={()=>{setMode('storage');setSelected(null);}}
          aria-pressed={mode==='storage'}
        >
          <Database size={14}/>
          <span>저장 구조</span>
        </button>
      </div>
    </header>

    {/* Toolbar controls above graph */}
    <div className="rg-graph-toolbar">
      <label className="rg-doc-scope-field">
        <span>자료 범위</span>
        <select aria-label="그래프 문서 선택" value={effectiveDoc} onChange={e=>setSelectedDoc(e.target.value)}>
          <option value="">과제 전체 중 표본</option>
          {mergedDocs.map(d=><option key={d.id} value={d.id}>{d.displayLabel}</option>)}
        </select>
      </label>

      {mode==='semantic'&&(
        <>
          <label className="rg-search-field">
            <span className="rg-field-label">현재 표시 범위에서 찾기</span>
            <div className="rg-search-input-wrap">
              <Search size={13}/>
              <input
                type="text"
                placeholder="항목 이름 (장비, 사람, 일정...)"
                value={filterQuery}
                onChange={e=>{setFilterQuery(e.target.value);setSelected(null);}}
              />
              {filterQuery&&<button onClick={()=>setFilterQuery('')} aria-label="검색어 지우기"><X size={12}/></button>}
            </div>
          </label>

          {entityTypes.length>0&&(
            <label className="rg-type-filter-field">
              <span className="rg-field-label">종류 필터</span>
              <select
                aria-label="개체 종류 필터"
                value={filterType}
                onChange={e=>{setFilterType(e.target.value);setSelected(null);}}
              >
                <option value="">모든 종류 ({entityTypes.length})</option>
                {entityTypes.map(t=><option key={t} value={t}>{entityName(t)}</option>)}
              </select>
            </label>
          )}

          {hasFilterActive&&(
            <button
              className="rg-filter-reset-btn"
              onClick={()=>{setFilterQuery('');setFilterType('');}}
              title="필터 초기화"
            >
              <RotateCcw size={12}/>
              <span>초기화</span>
            </button>
          )}
        </>
      )}
    </div>

    {/* Legend & Count banner */}
    <div className="rg-legend">
      {mode==='semantic'?(
        <div className="rg-legend-types">
          <span className="rg-lg-dot type-person">인물</span>
          <span className="rg-lg-dot type-equipment">장비·설비</span>
          <span className="rg-lg-dot type-event">사건·이슈</span>
          <span className="rg-lg-dot type-decision">결정·방침</span>
          <span className="rg-lg-dot type-request">요청·티켓</span>
          <span className="rg-lg-dot type-default">기타 개체</span>
        </div>
      ):(
        <div className="rg-legend-types">
          <span className="is-document">문서</span>
          <span className="is-chunk">검색 청크</span>
          <span className="is-entity">추출 개체</span>
        </div>
      )}
      <small>
        {data?.state==='ready'
          ? `${scene.nodes.length} 노드 · ${scene.edges.length} 연결${hasFilterActive?' (필터 적용)':''} · 드래그로 화면 이동`
          : '조회 중 또는 확인 불가'}
      </small>
    </div>

    {/* Live Canvas & Inspector */}
    <div className={`rg-live-body ${selected?'has-selection':''}`}>
      {data===null?(
        <div className="rag-empty">실제 DB의 연결을 읽는 중…</div>
      ):data.state!=='ready'?(
        <div className="rag-empty">
          <p>현재 DB 연결 그래프를 읽지 못했습니다. 과제·처리 버전이 바뀌었거나 조회에 실패했을 수 있습니다.</p>
          <button onClick={()=>setRetry(v=>v+1)}>그래프 다시 조회</button>
        </div>
      ):rawScene.nodes.length===0?(
        <div className="rag-empty">
          <p>선택한 범위에서 표시할 DB 노드가 없습니다. 데이터 전체가 비어 있다는 뜻은 아닙니다.</p>
        </div>
      ):scene.nodes.length===0?(
        <div className="rag-empty">
          <p>현재 표시 범위 안에 검색어/종류와 일치하는 개체가 없습니다. DB 전체에 없다는 뜻은 아닙니다.</p>
          <button onClick={()=>{setFilterQuery('');setFilterType('');}}>필터 초기화</button>
        </div>
      ):scene.nodes.length>0&&scene.edges.length===0&&mode==='semantic'?(
        <div className="rg-canvas-with-notice">
          <GraphCanvas scene={scene} theme={theme} select={setSelected} selected={selected?.id}/>
          <div className="rg-canvas-empty-edge-notice">
            현재 표시된 표본에서 개체 간 직접 연결선이 없습니다. DB 전체에서 고립됐다는 뜻은 아닙니다.
          </div>
        </div>
      ):(
        <GraphCanvas scene={scene} theme={theme} select={setSelected} selected={selected?.id}/>
      )}

      {selected&&(
        <aside className="rg-inspection" aria-label="선택 개체 세부 정보">
          <header>
            <div className="rg-inspect-head-text">
              <span className={`rg-inspect-type-badge type-${selected.colorKey||'default'}`}>
                {entityName(selected.entityType||selected.kind)}
              </span>
              <h3>{selected.label}</h3>
            </div>
            <button aria-label="그래프 선택 해제" onClick={()=>setSelected(null)}>
              <X size={14}/>
            </button>
          </header>

          {/* Source Document Section */}
          <section className="rg-inspect-section rg-inspect-source">
            <h4>출처 문서</h4>
            {sourceDocInfo?(
              <div className="rg-source-card">
                <div className="rg-source-header">
                  {sourceDocInfo.sourceLabel&&<span className="rg-source-tag">{sourceDocInfo.sourceLabel}</span>}
                  <strong>{sourceDocInfo.title}</strong>
                </div>
                {selected.document&&effectiveDoc!==selected.document&&(
                  <button
                    className="rg-switch-doc-btn"
                    onClick={()=>setSelectedDoc(selected.document)}
                    title="이 출처 문서 범위로 그래프 전환"
                  >
                    <FileText size={13}/>
                    <span>이 문서 범위로 전환</span>
                  </button>
                )}
                <details className="rg-doc-identity">
                  <summary>문서 식별 정보</summary>
                  <code>{selected.document}</code>
                </details>
              </div>
            ):selected.document?(
              <div className="rg-source-card">
                <strong>{selected.document}</strong>
                {effectiveDoc!==selected.document&&(
                  <button
                    className="rg-switch-doc-btn"
                    onClick={()=>setSelectedDoc(selected.document)}
                  >
                    <FileText size={13}/>
                    <span>이 문서 범위로 전환</span>
                  </button>
                )}
              </div>
            ):(
              <p className="rag-muted">출처 문서 정보가 노드에 없습니다.</p>
            )}
          </section>

          {/* Relations Section */}
          <section className="rg-inspect-section rg-inspect-relations">
            <h4>연결된 관계 ({adjacent.length})</h4>
            {adjacent.length>0?(
              <div className="rg-relations-list">
                {adjacent.map((e:Row)=>{
                  const isOutgoing=e.source===selected.id;
                  const otherId=isOutgoing?e.target:e.source;
                  const otherNode=scene.nodes.find((n:Row)=>n.id===otherId);
                  const otherLabel=otherNode?.label||label(otherId);
                  return (
                    <button
                      key={e.id}
                      className="rg-relation-btn"
                      onClick={()=>{
                        if(otherNode)setSelected(otherNode);
                      }}
                      title={`${otherLabel} 선택`}
                    >
                      <div className="rg-relation-dir">
                        <span className="rg-relation-name">{e.label}</span>
                        <small>{isOutgoing?'나가는 연결 →':'← 들어오는 연결'}</small>
                      </div>
                      <strong>{otherLabel}</strong>
                    </button>
                  );
                })}
              </div>
            ):(
              <p className="rag-muted">이 표본 안에 표시된 연결이 없습니다. DB 전체에서 고립됐다는 뜻은 아닙니다.</p>
            )}
          </section>

          <p className="rg-disclaimer">
            그래프 연결은 본문에서 자동 추출·저장된 관계이며, 독립적으로 검증된 사실이 아닙니다.
          </p>

          <details className="rg-technical-details">
            <summary>노드 기술 식별자</summary>
            <p>ID: <code>{selected.id}</code></p>
            {selected.unit&&<p>Unit: <code>{selected.unit}</code></p>}
          </details>
        </aside>
      )}
    </div>

    <p className="rag-footnote">
      {data?.limited?'표시 한도(최대 80 노드 / 160 연결)에 도달했습니다. 문서를 선택해 범위를 좁히세요. ':'현재 선택 범위의 제한된 표본 보기. '}
      본문·벡터 값은 가져오지 않으며, 전체 DB가 아닌 표본 범위입니다. 실제 질문 검색 경로와는 별도입니다. {when(data?.observed_at)}
    </p>
  </section>;
}
