import {ProjectNamesContext,ProjectLabel} from './project-labels';
import {projectLabel} from './core/project-label.mjs';
import {formatAmount,formatExact} from './core/operations-format.mjs';
import {cleanHumanText} from './core/operations-workspace-helpers.mjs';
import {isRagOverview,startRagRequest,finishRagRequest,failRagRequest} from './core/rag-request-state.mjs';
import {RagTrend} from './rag-trend';
import {RagOverview,RagGraph} from './rag-explorer';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowLeft,ArrowRight,ArrowUpDown,Check,ChevronLeft,ChevronRight,CircleHelp,Clock3,Database,FileText,History,Layers,Moon,RefreshCw,Search,ShieldCheck,Sun,X} from 'lucide-react';
import './rag-operations.css';

type Row=Record<string,any>;
const n=(value:any)=>formatAmount(value);
const docLabel=(row:Row)=>cleanHumanText(row.title||((row.item&&!/^(?:sha256:|[0-9a-f]{8}-[0-9a-f-]{27})/i.test(row.item))?row.item:'제목이 제공되지 않은 자료'));
const at=(value:any)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR'):'미확인';
const seconds=(value:any)=>typeof value==='number'?`${(value/1000).toLocaleString('ko-KR',{maximumFractionDigits:1})}초`:'미확인';
const sourceName:Record<string,string>={voice:'PLAUD·음성',slack:'Slack',linear:'Linear',mail:'메일',document:'문서',buzz:'Buzz'};
const comparison:Record<string,string>={counts_match:'처리 버전·청크 수 일치',changed_during_read:'조회 중 변경 · 재조회 필요',store_unavailable:'저장 처리 버전 확인 불가',not_in_database:'현재 DB에 없음',different_generation:'저장·DB 처리 버전 다름',chunk_count_mismatch:'청크 수 불일치',embedding_missing:'임베딩 없는 청크 있음',database_unavailable:'DB 조회 불가',database_binding_mismatch:'DB 연결 범위 다름',unconfirmed:'저장 일치 여부를 확인할 기록 부족'};
const statusName:Record<string,string>={SYNCED:'반영됨',UNCHANGED:'변경 없음',HOLD:'보류',FAILED:'실패',COMMITTED:'처리 버전 생성',WRITTEN:'파생 처리 버전 생성',complete:'기록상 완료',prepared:'전처리 기록상 완료',extracted:'새로 추출',carried:'이전 결과 재사용',reembedded:'재임베딩'};

async function read(project?:string){
  const url=project?`/rag-operations.json?project=${encodeURIComponent(project)}`:'/rag-operations.json?view=overview';
  const response=await fetch(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('read_failed');
  return response.json();
}
function Badge({children,tone='neutral'}:{children:React.ReactNode;tone?:string}){return <span className={`rag-badge ${tone}`}>{tone==='ok'?<Check size={13}/>:tone==='warn'?<CircleHelp size={13}/>:null}{children}</span>;}
function Empty({children}:{children:React.ReactNode}){return <div className="rag-empty"><CircleHelp size={26}/><p>{children}</p></div>;}
function Stat({title,value,note}:{title:string;value:any;note?:string}){return <div className="rag-stat"><span>{title}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>;}

function App(){
  const embedded=useMemo(()=>new URLSearchParams(location.search).get('embedded')==='1'||window.self!==window.top,[]);
  const [snapshot,setSnapshot]=useState<Row|null>(null);
  const [snapshotLoading,setSnapshotLoading]=useState(false);
  const [snapshotError,setSnapshotError]=useState<string|null>(null);
  const [snapshotSuccessAt,setSnapshotSuccessAt]=useState<string|null>(null);
  const [snapshotFailedAt,setSnapshotFailedAt]=useState<string|null>(null);

  const [project,setProject]=useState(()=>new URLSearchParams(location.search).get('project')??'');
  const projectRef=useRef(project);projectRef.current=project;
  const [projectDetails,setProjectDetails]=useState<Record<string,{
    data:Row|null;
    status:'idle'|'loading'|'success'|'error';
    error?:string;
    source?:string;
    observed_at?:string;
    failedAt?:string;
  }>>({});

  const [theme,setTheme]=useState(()=>{
    const urlTheme=new URLSearchParams(location.search).get('theme');
    if(urlTheme==='light'||urlTheme==='dark')return urlTheme;
    try{return localStorage.getItem('soulforge.operations.theme')==='light'?'light':'dark';}catch{return 'dark';}
  });

  useEffect(()=>{
    document.documentElement.setAttribute('data-theme',theme);
    try{localStorage.setItem('soulforge.operations.theme',theme);}catch{}
    const url=new URL(window.location.href);
    if(url.searchParams.get('theme')!==theme){
      url.searchParams.set('theme',theme);
      window.history.replaceState(null,'',url.toString());
    }
  },[theme]);

  // Project selection & history
  const selectProject=useCallback((p:string,fromParent=false)=>{
    if(p===projectRef.current)return;
    setSelected(null);
    setGeneration(null);
    setSource('all');
    setQuery('');
    setDocPage(1);
    setGenPage(1);
    setRunPage(1);
    setProject(p);

    const url=new URL(window.location.href);
    if(p)url.searchParams.set('project',p);
    else url.searchParams.delete('project');

    if(fromParent){window.history.replaceState({project:p},'',url.toString());}
    else{
      if(embedded){
        window.history.replaceState({project:p},'',url.toString());
      }else{
        window.history.pushState({project:p},'',url.toString());
      }
      try{
        if(window.parent&&window.parent!==window){
          window.parent.postMessage({type:'rag-project',project:p},window.location.origin);
        }
      }catch{}
    }
  },[embedded]);

  useEffect(()=>{
    const onMsg=(e:MessageEvent)=>{
      if(e.origin!==window.location.origin||e.source!==window.parent)return;
      if(e.data?.type==='theme'&&(e.data.theme==='light'||e.data.theme==='dark')){
        setTheme(e.data.theme);
      }
      if(e.data?.type==='rag-select-project'&&typeof e.data.project==='string'){
        selectProject(e.data.project,true);
      }
    };
    const onStorage=(e:StorageEvent)=>{
      if(e.key==='soulforge.operations.theme'&&(e.newValue==='light'||e.newValue==='dark')){
        setTheme(e.newValue);
      }
    };
    window.addEventListener('message',onMsg);
    window.addEventListener('storage',onStorage);
    return()=>{
      window.removeEventListener('message',onMsg);
      window.removeEventListener('storage',onStorage);
    };
  },[selectProject]);

  useEffect(()=>{
    const onPop=(e:PopStateEvent)=>{
      const p=e.state?.project??new URLSearchParams(window.location.search).get('project')??'';
      setSelected(null);
      setGeneration(null);
      setProject(p);
      try{
        if(window.parent&&window.parent!==window){
          window.parent.postMessage({type:'rag-project',project:p},window.location.origin);
        }
      }catch{}
    };
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[]);

  // Overview loader
  const inFlight=useRef(false);
  const loadOverview=useCallback(async()=>{
    if(inFlight.current)return;
    inFlight.current=true;
    setSnapshotLoading(true);
    setSnapshotError(null);
    setSnapshotFailedAt(null);
    try{
      const value=await read();
      if(isRagOverview(value)){
        setSnapshot(value);
        setSnapshotSuccessAt(new Date().toISOString());
      }else{
        setSnapshotError(value?.reason||'검색 DB 응답을 확인할 수 없습니다.');
        setSnapshotFailedAt(new Date().toISOString());
      }
    }catch(err:any){
      setSnapshotError(err?.message||'최신 조회를 완료하지 못했습니다. 이전 조회 결과를 유지합니다.');
      setSnapshotFailedAt(new Date().toISOString());
    }finally{
      inFlight.current=false;
      setSnapshotLoading(false);
    }
  },[]);

  useEffect(()=>{void loadOverview();},[loadOverview]);

  // Per-project detail loader with requestId guard
  const detailPending=useRef(new Set<string>());
  const loadProjectDetail=useCallback(async(projCode:string)=>{
    if(!projCode||detailPending.current.has(projCode))return;
    detailPending.current.add(projCode);
    setProjectDetails(prev=>({...prev,[projCode]:startRagRequest(prev[projCode])}));
    try{
      const value=await read(projCode);
      setProjectDetails(prev=>({...prev,[projCode]:finishRagRequest(prev[projCode],value,projCode,new Date().toISOString())}));
    }catch(err:any){
      setProjectDetails(prev=>({...prev,[projCode]:failRagRequest(prev[projCode],'과제 상세 기록을 읽지 못했습니다.',new Date().toISOString())}));
    }finally{detailPending.current.delete(projCode);}
  },[]);

  useEffect(()=>{
    if(project){
      void loadProjectDetail(project);
    }
  },[project,snapshot?.observed_at,loadProjectDetail]);

  const [tab,setTab]=useState('documents');
  const [source,setSource]=useState('all');
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<Row|null>(null);
  const [generation,setGeneration]=useState<Row|null>(null);

  // Table pagination, sort & search
  const [docPage,setDocPage]=useState(1);
  const [docSortKey,setDocSortKey]=useState<'title'|'chunks'|'source'>('title');
  const [docSortAsc,setDocSortAsc]=useState(true);

  const [genPage,setGenPage]=useState(1);
  const [genSearch,setGenSearch]=useState('');
  const [genSort,setGenSort]=useState('recent');

  const [runPage,setRunPage]=useState(1);
  const [runSearch,setRunSearch]=useState('');
  const [runSort,setRunSort]=useState('recent');

  const names=useMemo(()=>Object.fromEntries((snapshot?.projects??[]).map((p:Row)=>[p.project,p.project_name])),[snapshot?.projects]);
  const row=useMemo(()=>snapshot?.projects?.find((p:Row)=>p.project===project),[snapshot?.projects,project]);
  const db=row?.database;
  const store=row?.store;

  const currentDetailRecord=project?projectDetails[project]:undefined;
  const detail=currentDetailRecord?.data;
  const detailStatus=currentDetailRecord?.status||'idle';
  const detailLoading=detailStatus==='loading';
  const detailError=currentDetailRecord?.error;
  const detailRetained=Boolean(detail&&detailStatus==='loading');

  const documents:Row[]=useMemo(()=>detail?.documents??[],[detail?.documents]);
  const sources=useMemo(()=>[...new Set(documents.map(r=>r.source).filter(Boolean))],[documents]);

  const filteredDocs=useMemo(()=>{
    return documents.filter(r=>{
      const matchSource=source==='all'||r.source===source;
      const q=query.toLowerCase().trim();
      const matchQ=!q||`${r.item||''} ${r.id||''} ${r.title||''}`.toLowerCase().includes(q);
      return matchSource&&matchQ;
    });
  },[documents,source,query]);

  const sortedDocs=useMemo(()=>{
    const list=[...filteredDocs];
    list.sort((a,b)=>{
      let va='',vb='';
      if(docSortKey==='title'){
        va=a.item||a.title||a.id||'';
        vb=b.item||b.title||b.id||'';
      }else if(docSortKey==='chunks'){
        return docSortAsc?(a.stats?.chunks||0)-(b.stats?.chunks||0):(b.stats?.chunks||0)-(a.stats?.chunks||0);
      }else{
        va=a.source||'';
        vb=b.source||'';
      }
      const comp=va.localeCompare(vb,'ko-KR');
      return docSortAsc?comp:-comp;
    });
    return list;
  },[filteredDocs,docSortKey,docSortAsc]);

  const docPageSize=20;
  const docTotalPages=Math.max(1,Math.ceil(sortedDocs.length/docPageSize));
  const pagedDocs=useMemo(()=>sortedDocs.slice((docPage-1)*docPageSize,docPage*docPageSize),[sortedDocs,docPage]);

  // Generations filtered & paged
  const generationsList:Row[]=useMemo(()=>detail?.generations??[],[detail?.generations]);
  const filteredGenerations=useMemo(()=>{
    const q=genSearch.toLowerCase().trim();
    return generationsList.filter(g=>!q||`${g.generation||''} ${g.model?.embedder||''}`.toLowerCase().includes(q)).sort((a,b)=>genSort==='model'?String(a.model?.embedder??'').localeCompare(String(b.model?.embedder??'')):genSort==='chunks'?(b.counts?.chunks??-1)-(a.counts?.chunks??-1):(Date.parse(b.file_modified_at)||0)-(Date.parse(a.file_modified_at)||0));
  },[generationsList,genSearch,genSort]);
  const genPageSize=10;
  const genTotalPages=Math.max(1,Math.ceil(filteredGenerations.length/genPageSize));
  const pagedGenerations=useMemo(()=>filteredGenerations.slice((genPage-1)*genPageSize,genPage*genPageSize),[filteredGenerations,genPage]);

  // Runs filtered & paged
  const runsList:Row[]=useMemo(()=>detail?.runs??[],[detail?.runs]);
  const filteredRuns=useMemo(()=>{
    const q=runSearch.toLowerCase().trim();
    return runsList.filter(r=>!q||`${r.generation||''} ${r.status||''} ${r.code||''}`.toLowerCase().includes(q)).sort((a,b)=>runSort==='failed'?Number(b.status==='FAILED')-Number(a.status==='FAILED'):(runSort==='oldest'?1:-1)*((Date.parse(a.at)||0)-(Date.parse(b.at)||0)));
  },[runsList,runSearch,runSort]);
  const runPageSize=10;
  const runTotalPages=Math.max(1,Math.ceil(filteredRuns.length/runPageSize));
  const pagedRuns=useMemo(()=>filteredRuns.slice((runPage-1)*runPageSize,runPage*runPageSize),[filteredRuns,runPage]);

  const total=(key:string)=>{
    if(snapshot?.state!=='ready'||!snapshot.projects?.length)return null;
    return snapshot.projects.every((r:Row)=>typeof r.database?.[key]==='number')?snapshot.projects.reduce((sum:number,r:Row)=>sum+r.database[key],0):null;
  };

  const metadataStatus=detail?.preparation?.state;
  const overviewStatus=snapshotLoading?'loading':snapshotError?'error':snapshot?'success':'idle';
  const overviewInitial=!snapshot&&['idle','loading'].includes(overviewStatus);

  return (
    <ProjectNamesContext.Provider value={names}>
      <div className={`rag-app ${embedded?'rag-embedded':''}`} data-theme={theme}>
        <header className="rag-topbar">
          <a href="/operations-console.html"><ArrowLeft size={17}/>운영 미리보기</a>
          <strong>Soulforge <span>RAG</span></strong>
          <span>실제 로컬 DB · 읽기 전용</span>
          <div className="rag-topbar-actions">
            <button aria-label="테마 전환" onClick={()=>setTheme(t=>t==='light'?'dark':'light')}>
              {theme==='light'?<Moon size={14}/>:<Sun size={14}/>} {theme==='light'?'어둡게':'밝게'}
            </button>
            <a href="/operations-manual.html#rag" target="_blank" rel="noreferrer">사용 설명서</a>
          </div>
        </header>

        <main>
          <div className="rag-title">
            <div>
              <small>검색 준비부터 실제 반영까지</small>
              {embedded ? <h2>RAG 처리 상태</h2> : <h1>RAG 처리 상태</h1>}
              <p>Neo4j의 현재 데이터와 저장된 전처리·임베딩 이력을 함께 확인합니다.</p>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              {snapshotLoading&&snapshotSuccessAt&&(
                <span className="rag-updating-badge">
                  <RefreshCw size={12} className="rag-spin"/> 갱신 중…
                </span>
              )}
              <button className="rag-primary" disabled={snapshotLoading||detailLoading} onClick={()=>{void loadOverview();if(project)void loadProjectDetail(project);}}>
                <RefreshCw size={16}/>
                {snapshotLoading?'읽는 중':'DB·기록 다시 조회'}
              </button>
            </div>
          </div>

          <div className="rag-connection">
            <Database size={18}/>
            <strong>
              {snapshotError
                ? '최신 DB 상태 조회 실패'
                : snapshot?.state==='ready'
                ? '검색 DB 연결됨'
                : 'DB 읽는 중'}
            </strong>
            <span>조회 {snapshotSuccessAt?at(snapshotSuccessAt):at(snapshot?.observed_at)}</span>
            <small>60초 캐시 · 재임베딩·색인 갱신은 실행하지 않음</small>
          </div>

          {snapshotError&&(
            <div className="rag-notice" role="status">
              <div>
                <strong>검색 DB 개요 갱신 실패</strong><p>실패 {at(snapshotFailedAt)} · 마지막 성공 {at(snapshotSuccessAt)} · {snapshot?'마지막 정상값 표시 중':'이전 정상값 없음'}</p><button onClick={()=>void loadOverview()} disabled={snapshotLoading}>개요 다시 시도</button>
                <details className="rag-tech-details">
                  <summary>기술 식별 정보 및 원인</summary>
                  <pre>{JSON.stringify({source:'overview-fetch',error:snapshotError,observed_at:snapshotSuccessAt},null,2)}</pre>
                </details>
              </div>
            </div>
          )}

          <section className="rag-global">
            <Stat
              title="조회 과제의 검색 청크"
              value={overviewInitial?'조회 중…':n(total('chunks'))}
            />
            <Stat
              title="벡터 포함 청크"
              value={overviewInitial?'조회 중…':n(total('embedded_chunks'))}
              note="벡터의 존재 확인 · 검색 품질과 별도"
            />
            <Stat
              title="벡터 검색 인덱스"
              value={overviewInitial?'조회 중…':(snapshot?.database?.vector_index?.state??'확인할 수 없음')}
              note={overviewInitial?undefined:`${n(snapshot?.database?.vector_index?.dimensions)}차원`}
            />
            <Stat
              title="저장 미완료 표시 노드"
              value={overviewInitial?'조회 중…':n(snapshot?.database?.residue_nodes)}
              note="진행 중 작업·중단 뒤 잔여 여부 확인 필요"
            />
          </section>

          <div className="rag-layout">
            <aside className="rag-projects">
              <h2>과제 선택</h2>
              <p>{overviewInitial?'과제 목록 조회 중…':snapshot?`${snapshot.projects.length} / ${snapshot.expected??'—'} · 설정된 범위`:'과제 목록 확인 불가'}</p>
              <button
                onClick={()=>selectProject('')}
                className={!project?'selected':''}
                aria-pressed={!project}
              >
                <strong>전체 과제 개요</strong>
                <span>{snapshot?`${snapshot.projects.length}개 과제 집계`:overviewInitial?'조회 중…':'확인할 수 없음'}</span>
                <small>원천 연결 및 현황 비교</small>
              </button>
              {snapshot?.projects?.map((r:Row)=>(
                <button
                  key={r.project}
                  onClick={()=>selectProject(r.project)}
                  className={project===r.project?'selected':''}
                  aria-pressed={project===r.project}
                >
                  <strong><ProjectLabel code={r.project}/></strong>
                  <span>{r.database?n(r.database.chunks)+' 청크':'DB 근거 없음'}</span>
                  <small>{comparison[r.comparison]??r.comparison}</small>
                </button>
              ))}
              {!snapshot?.projects?.length&&!snapshotLoading&&(
                <p>등록된 조회 범위를 확인하지 못했습니다.</p>
              )}
            </aside>

            <div className="rag-project-content">
              {!project ? (
                snapshot?<RagOverview data={snapshot} choose={selectProject} theme={theme}/>:<Empty>{overviewInitial?'과제별 검색 준비 상태 조회 중…':'검색 준비 상태를 확인할 수 없습니다.'}</Empty>
              ) : (
                <>
                  <button className="rag-back-all" onClick={()=>selectProject('')}>
                    <ArrowLeft size={14}/> 전체 과제 개요로 돌아가기
                  </button>

                  <section className="rag-panel">
                    <header className="rag-section-title">
                      <div>
                        <h2>{row?projectLabel(project,names):`${project} · ${overviewInitial?'과제 정보 조회 중':'과제 정보 확인 불가'}`}</h2>
                        <p>
                          {store?.model?.embedder??(overviewInitial?'모델 정보 조회 중':'임베딩 모델 확인 불가')}{' '}
                          <span className="rag-muted">· 저장 처리 버전의 모델 기록</span>
                        </p>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {detailRetained&&(
                          <span className="rag-updating-badge">
                            <RefreshCw size={12} className="rag-spin"/> 갱신 중…
                          </span>
                        )}
                        <Badge tone={row?.comparison==='counts_match'?'ok':'warn'}>
                          {comparison[row?.comparison]??'저장 일치 여부 조회 중'}
                        </Badge>
                      </div>
                    </header>

                    <details className="rag-tech-details"><summary>처리 버전 기술 정보</summary><div className="rag-generation-pair">
                      <div>
                        <small>저장소에서 선택한 처리 버전</small>
                        <strong>{store?.generation??'미확인'}</strong>
                      </div>
                      <ArrowRight size={19}/>
                      <div>
                        <small>현재 Neo4j 적재 처리 버전</small>
                        <strong>{db?.generation??'미확인'}</strong>
                        <span>적재 시각 {at(db?.loaded_at)}</span>
                      </div>
                    </div></details>

                    <div className="rag-inline-stats">
                      <span>DB 청크 <b>{n(db?.chunks)}</b></span>
                      <span>DB 임베딩 <b>{n(db?.embedded_chunks)}</b></span>
                      <span>임베딩 없음 <b>{n(db?.unembedded_chunks)}</b></span>
                      <span>저장 문서 <b>{n(store?.counts?.documents)}</b></span>
                    </div>

                    <p className="rag-footnote">
                      처리 버전·청크 수 대조입니다. 전처리 품질·검색 성공·답변 품질을 보증하지 않습니다. 다른 작업이 갱신 중이면 조회값 사이에 시차가 있을 수 있습니다.
                    </p>
                  </section>

                  {detailError&&(
                    <div className="rag-notice" role="status">
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                        <div>
                          <strong>과제 기록 오류: </strong>{detailError}
                          <span> · 실패 {at(currentDetailRecord?.failedAt)} · 마지막 성공 {at(currentDetailRecord?.observed_at)}{detail?' · 마지막 정상값 표시 중':''}</span>
                        </div>
                        <button
                          type="button"
                          className="rag-page-btn"
                          onClick={()=>void loadProjectDetail(project)}
                        >
                          다시 조회
                        </button>
                      </div>
                      <details className="rag-tech-details">
                        <summary>기술 세부 정보</summary>
                        <pre>{JSON.stringify({project,source:currentDetailRecord?.source,error:detailError,observed_at:currentDetailRecord?.observed_at},null,2)}</pre>
                      </details>
                    </div>
                  )}

                  {(detailLoading||detailStatus==='idle')&&!detail?<Empty>선택한 과제의 상세 자료 조회 중…</Empty>:detail?<RagGraph key={project} project={project} documents={documents} theme={theme} version={db?.generation}/>:null}

                  {detail&&(
                    <RagTrend
                      projects={[{project,runs:detail.runs,history_scope:detail.run_history}]}
                      expected={1}
                      asOf={snapshot?.observed_at}
                    />
                  )}

                  <nav className="rag-tabs" aria-label="RAG 기록 보기">
                    {[
                      ['documents','자료·청크 상태',FileText],
                      ['generations','임베딩·처리 버전 이력',Layers],
                      ['runs','처리 실행 이력',History]
                    ].map(([id,label,Icon]:any)=>(
                      <button
                        key={id}
                        className={tab===id?'selected':''}
                        aria-pressed={tab===id}
                        onClick={()=>{
                          setTab(id);
                          setSelected(null);
                          setGeneration(null);
                        }}
                      >
                        <Icon size={16}/>{label}
                      </button>
                    ))}
                  </nav>

                  {detailLoading&&!detail ? (
                    <Empty>과제의 실제 기록을 읽고 있습니다.</Empty>
                  ) : !detail ? (
                    <Empty>과제 기록을 확인하지 못했습니다. {detailError??''}</Empty>
                  ) : (
                    <>
                      {tab==='documents'&&(
                        <section className="rag-panel">
                          <header className="rag-section-title">
                            <div>
                              <h2>문서별 준비·청크 기록</h2>
                              <p>현재 선택 처리 버전의 메타데이터 · {typeof detail.documents_total==='number'?`${n(detail.documents_total)}개 중 ${filteredDocs.length}개 표시`:'문서 목록을 확인할 수 없음'}</p>
                            </div>
                            <Badge tone={metadataStatus==='ready'?'ok':'warn'}>
                              {metadataStatus==='ready'?'전처리 기록 조회됨':'전처리 기록 조회 불가'}
                            </Badge>
                          </header>

                          <div className="rag-filters">
                            <select
                              aria-label="자료 원천"
                              value={source}
                              onChange={e=>{setSource(e.target.value);setDocPage(1);}}
                            >
                              <option value="all">모든 원천</option>
                              {sources.map(s=><option key={s} value={s}>{sourceName[s]??s}</option>)}
                            </select>
                            <label>
                              <Search size={15}/>
                              <input
                                aria-label="자료 식별자 검색"
                                placeholder="자료 식별자나 제목으로 찾기"
                                value={query}
                                onChange={e=>{setQuery(e.target.value);setDocPage(1);}}
                              />
                            </label>
                          </div>

                          {detail?.preparation?.limited&&(
                            <p className="rag-notice">표시 한도 500개 · 전체 자료 목록이 아닙니다.</p>
                          )}
                          {metadataStatus!=='ready'&&(
                            <p className="rag-notice">전처리 검증 근거를 읽지 못했습니다. {detail?.preparation?.reason??''}</p>
                          )}

                          <div className="rag-table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>
                                    <button
                                      type="button"
                                      className="rag-sort-btn"
                                      onClick={()=>{
                                        if(docSortKey==='title')setDocSortAsc(a=>!a);
                                        else{setDocSortKey('title');setDocSortAsc(true);}
                                      }}
                                    >
                                      원천·자료 <ArrowUpDown size={12}/>
                                    </button>
                                  </th>
                                  <th>전처리 기록</th>
                                  <th>
                                    <button
                                      type="button"
                                      className="rag-sort-btn"
                                      onClick={()=>{
                                        if(docSortKey==='chunks')setDocSortAsc(a=>!a);
                                        else{setDocSortKey('chunks');setDocSortAsc(false);}
                                      }}
                                    >
                                      청크 기록 <ArrowUpDown size={12}/>
                                    </button>
                                  </th>
                                  <th>임베딩 기록</th>
                                  <th>이번 처리 버전</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pagedDocs.map((r:Row,i:number)=>(
                                  <tr key={r.id??i} className={selected?.id===r.id?'selected':''}>
                                    <td>
                                      <button className="rag-item-button" onClick={()=>setSelected(r)}>
                                        <strong>{sourceName[r.source]??r.source}</strong>
                                        <span>{docLabel(r)}</span>
                                      </button>
                                      <details className="rag-technical-id" onClick={e=>e.stopPropagation()}>
                                        <summary>기술 식별자</summary>
                                        <code>{r.id}</code><p>{r.item}</p>
                                      </details>
                                    </td>
                                    <td>
                                      <Badge tone={r.preparation==='prepared'?'ok':'neutral'}>
                                        {r.preparation==='prepared'?'전처리 기록상 완료':'미확인'}
                                      </Badge>
                                    </td>
                                    <td title={formatExact(r.stats?.chunks)}>{n(r.stats?.chunks)}</td>
                                    <td title={formatExact(r.stats?.embedded_chunks)}>{n(r.stats?.embedded_chunks)}</td>
                                    <td>{statusName[r.origin]??r.origin??'미확인'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {!pagedDocs.length&&(
                              <Empty>{typeof detail.documents_total==='number'?'이 범위에서 표시할 자료 기록이 없습니다.':'문서 목록 조회가 완료되지 않았습니다. 자료가 0개라는 뜻은 아닙니다.'}</Empty>
                            )}
                          </div>

                          {docTotalPages>1&&(
                            <div className="rag-pagination">
                              <span>
                                전체 {filteredDocs.length}개 문서 중 {docPage} / {docTotalPages} 페이지
                              </span>
                              <div className="rag-page-actions">
                                <button
                                  type="button"
                                  className="rag-page-btn"
                                  disabled={docPage<=1}
                                  onClick={()=>setDocPage(p=>p-1)}
                                  aria-label="이전 페이지"
                                >
                                  <ChevronLeft size={13}/> 이전
                                </button>
                                <button
                                  type="button"
                                  className="rag-page-btn"
                                  disabled={docPage>=docTotalPages}
                                  onClick={()=>setDocPage(p=>p+1)}
                                  aria-label="다음 페이지"
                                >
                                  다음 <ChevronRight size={13}/>
                                </button>
                              </div>
                            </div>
                          )}

                          <p className="rag-footnote">
                            행의 청크·임베딩 수는 저장된 추출 기록입니다. 위쪽 DB 집계와 구분합니다. 항목별 DB 존재·검색 인용은 별도 근거가 필요합니다.
                          </p>

                          <details className="rag-pending">
                            <summary>
                              실패·제외·재시도 항목 ({detail?.pending_state==='ready'?detail.pending?.length:'범위 미확인'})
                            </summary>
                            <p className="rag-footnote">재시도 장부의 기록이며 정크 삭제 목록이 아닙니다. 상태 {detail?.pending_state}</p>
                            {detail.pending?.map((r:Row,i:number)=>(
                              <div key={i}>
                                <strong>{r.item??r.source_ref}</strong>
                                <span>{r.code} · 시도 {n(r.attempts)} · {r.state??'미확인'}</span>
                                <small>{at(r.last_seen)}</small>
                              </div>
                            ))}
                            {detail?.pending_state!=='ready'&&<p>장부 근거 {detail?.pending_reason??'미확인'}</p>}
                          </details>
                        </section>
                      )}

                      {tab==='generations'&&(
                        <section className="rag-panel">
                          <header className="rag-section-title">
                            <div>
                              <h2>임베딩과 처리 버전 기록</h2>
                              <p>처리 버전 ID 역순 · 수정 시각은 실행 시각이 아닙니다.</p>
                            </div>
                            <Badge>
                              {detail.generation_history?.state==='ready'
                                ? '범위 내 읽기 완료'
                                : detail.generation_history?.state==='partial'
                                ? '제한된 처리 버전 범위 표시'
                                : '기록 읽기 불가'}
                            </Badge>
                          </header>

                          <div className="rag-filters">
                            <label>
                              <Search size={15}/>
                              <input
                                aria-label="처리 버전 검색"
                                placeholder="버전 ID 또는 모델명 검색"
                                value={genSearch}
                                onChange={e=>{setGenSearch(e.target.value);setGenPage(1);}}
                              />
                            </label>
                            <select aria-label="처리 버전 정렬" value={genSort} onChange={e=>{setGenSort(e.target.value);setGenPage(1);}}><option value="recent">파일 수정 최근순</option><option value="model">임베딩 모델순</option><option value="chunks">청크 많은 순</option></select>
                          </div>

                          <div className="rag-table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>처리 버전</th>
                                  <th>임베딩 모델</th>
                                  <th>청크</th>
                                  <th>변경 종류</th>
                                  <th>기록 파일 수정</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pagedGenerations.map((r:Row)=>(
                                  <tr key={r.generation}>
                                    <td>
                                      <button className="rag-item-button" onClick={()=>setGeneration(r)}>
                                        <strong>{r.in_database?'현재 검색에 쓰는 버전':r.selected?'현재 선택한 버전':'이전 저장 버전'}</strong>
                                        <span>{r.in_database?'현재 DB 적재':r.selected?'저장소 선택':'저장된 구판·파생판'}</span>
                                      </button>
                                      <details className="rag-technical-id" onClick={e=>e.stopPropagation()}>
                                        <summary>기술 식별자</summary>
                                        <code>{r.generation}</code>
                                      </details>
                                    </td>
                                    <td>
                                      {r.model?.embedder??'미확인'}
                                      <small className="rag-block">
                                        {r.model?.dimensions?`${n(r.model.dimensions)}차원`:'개별 차원 기록 없음'}
                                      </small>
                                    </td>
                                    <td>{n(r.counts?.chunks)}</td>
                                    <td>
                                      {r.operation==='reembed'?'재임베딩':'추출·재사용'}
                                      <small className="rag-block">
                                        {r.operation==='reembed'
                                          ? `재임베딩 문서 ${n(r.counts?.reembedded)}`
                                          : `새 추출 ${n(r.counts?.extracted)} · 재사용 ${n(r.counts?.carried)}`}
                                      </small>
                                    </td>
                                    <td>{at(r.file_modified_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {genTotalPages>1&&(
                            <div className="rag-pagination">
                              <span>
                                전체 {filteredGenerations.length}개 버전 중 {genPage} / {genTotalPages} 페이지
                              </span>
                              <div className="rag-page-actions">
                                <button
                                  type="button"
                                  className="rag-page-btn"
                                  disabled={genPage<=1}
                                  onClick={()=>setGenPage(p=>p-1)}
                                >
                                  <ChevronLeft size={13}/> 이전
                                </button>
                                <button
                                  type="button"
                                  className="rag-page-btn"
                                  disabled={genPage>=genTotalPages}
                                  onClick={()=>setGenPage(p=>p+1)}
                                >
                                  다음 <ChevronRight size={13}/>
                                </button>
                              </div>
                            </div>
                          )}

                          {!filteredGenerations.length&&(
                            <Empty>처리 버전 기록을 읽지 못했습니다. {detail.generation_history?.reason}</Empty>
                          )}

                          <p className="rag-footnote">
                            발견 폴더 {n(detail.generation_history?.observed_folders)} · 읽기 실패 {n(detail.generation_history?.failed)}. 구판이 존재한다는 것과 지금 DB가 사용한다는 것은 다릅니다.
                          </p>
                        </section>
                      )}

                      {tab==='runs'&&(
                        <section className="rag-panel">
                          <header className="rag-section-title">
                            <div>
                              <h2>최근 처리 실행 기록</h2>
                              <p>검색 DB 동기화 기록 · 최근 30일, 조회 한도 내</p>
                            </div>
                            <Badge>
                              {detail.run_history?.state==='ready'
                                ? '범위 내 읽기 완료'
                                : detail.run_history?.state==='partial'
                                ? '일부 실행 기록만 표시'
                                : '기록 읽기 불가'}
                            </Badge>
                          </header>

                          <div className="rag-filters">
                            <label>
                              <Search size={15}/>
                              <input
                                aria-label="실행 기록 검색"
                                placeholder="처리 버전, 상태 또는 오류 코드로 검색"
                                value={runSearch}
                                onChange={e=>{setRunSearch(e.target.value);setRunPage(1);}}
                              />
                            </label>
                            <select aria-label="실행 기록 정렬" value={runSort} onChange={e=>{setRunSort(e.target.value);setRunPage(1);}}><option value="recent">최근 실행순</option><option value="oldest">오래된 실행순</option><option value="failed">실패 먼저</option></select>
                          </div>

                          <div className="rag-run-list">
                            {pagedRuns.map((r:Row,i:number)=>(
                              <details key={`${r.at}:${i}`}>
                                <summary>
                                  <Clock3 size={16}/>
                                  <strong>{at(r.at)}</strong>
                                  <Badge tone={r.status==='HOLD'||r.status==='FAILED'?'warn':'neutral'}>
                                    {statusName[r.status]??r.status}
                                  </Badge>
                                  <span>
                                    반영 {n(r.totals?.completed)} · 대기 {n(r.totals?.pending)} · 실패 {n(r.totals?.failed)}
                                  </span>
                                </summary>
                                <div>
                                  <p>
                                    처리 버전 <b>{r.generation??'미확인'}</b> ·{' '}
                                    {r.verified?'이 실행에서 저장 후 DB 수량 확인':'저장 후 확인 기록 없음'}
                                  </p>
                                  <p>
                                    색인 단계: {statusName[r.index?.status]??r.index?.status??'미확인'} · 소요 {seconds(r.index?.elapsed_ms)}
                                  </p>
                                  <p>
                                    추출 모델 호출 {n(r.llm?.calls)} · 임베딩 호출 {n(r.llm?.embedder_calls)} · 오류 {n(r.llm?.errors)}
                                  </p>
                                  {r.code&&<p>{r.code}</p>}
                                  {r.isolated?.map((item:Row,j:number)=>(
                                    <p key={j}>{item.item} · {item.code} · {item.state}</p>
                                  ))}
                                  <details className="rag-tech-details">
                                    <summary>실행 기술 세부 ID</summary>
                                    <pre>{JSON.stringify({generation:r.generation,verified:r.verified,llm:r.llm,index:r.index},null,2)}</pre>
                                  </details>
                                </div>
                              </details>
                            ))}
                          </div>

                          {runTotalPages>1&&(
                            <div className="rag-pagination">
                              <span>
                                전체 {filteredRuns.length}개 실행 기록 중 {runPage} / {runTotalPages} 페이지
                              </span>
                              <div className="rag-page-actions">
                                <button
                                  type="button"
                                  className="rag-page-btn"
                                  disabled={runPage<=1}
                                  onClick={()=>setRunPage(p=>p-1)}
                                >
                                  <ChevronLeft size={13}/> 이전
                                </button>
                                <button
                                  type="button"
                                  className="rag-page-btn"
                                  disabled={runPage>=runTotalPages}
                                  onClick={()=>setRunPage(p=>p+1)}
                                >
                                  다음 <ChevronRight size={13}/>
                                </button>
                              </div>
                            </div>
                          )}

                          {!filteredRuns.length&&(
                            <Empty>실행 이력을 읽지 못했습니다. {detail.run_history?.reason}</Empty>
                          )}

                          <p className="rag-footnote">
                            발견 파일 {n(detail.run_history?.observed_files)} · 읽기 실패 {n(detail.run_history?.failed)}. 과거 영수증이며 현재 DB 상태는 위의 실조회 값을 확인하세요.
                          </p>
                        </section>
                      )}
                    </>
                  )}

                  <div className="rag-scope-note">
                    <ShieldCheck size={17}/>
                    <p>
                      질문별 노드·엣지 선택과 단기·장기 기억은 이 집계에서 추정하지 않습니다. 실제 질문 실행·기억 기록이 연결된 뒤 별도로 표시합니다.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>

        {(selected||generation)&&(
          <aside className="rag-inspector" aria-label="선택 기록 상세">
            <header>
              <strong>{selected?'자료·청크 근거':'처리 버전·임베딩 근거'}</strong>
              <button aria-label="기록 상세 닫기" onClick={()=>{setSelected(null);setGeneration(null);}}>
                <X size={18}/>
              </button>
            </header>
            {selected ? (
              <>
                <h2>{sourceName[selected.source]??selected.source}</h2>
                <p className="rag-identifier">{docLabel(selected)}</p>
                <dl>
                  <dt>자료 ID</dt>
                  <dd>
                    <details className="rag-technical-id">
                      <summary>식별자 표시</summary>
                      <code>{selected.id}</code>
                    </details>
                  </dd>
                  <dt>전처리</dt>
                  <dd>{selected.preparation==='prepared'?'선택 처리 버전의 준비 근거 확인':'전처리 기록 조회 불가'}</dd>
                  <dt>본문 단위</dt>
                  <dd>{n(selected.units)}</dd>
                  <dt>기록된 청크</dt>
                  <dd>{n(selected.stats?.chunks)}</dd>
                  <dt>기록된 임베딩</dt>
                  <dd>{n(selected.stats?.embedded_chunks)}</dd>
                </dl>
                <h3>처리 당시의 데이터 점검</h3>
                {[
                  ['chunks_mismatched','본문·청크 불일치'],
                  ['duplicate_ids','중복 ID'],
                  ['entities_without_chunk','출처 청크 없는 개체'],
                  ['relationships_outside_fragment','제외된 관계']
                ].map(([key,lbl])=>(
                  <p className="rag-check" key={key}>
                    <span>{lbl}</span>
                    <b>{n(selected.stats?.[key])}</b>
                  </p>
                ))}
                <p className="rag-footnote">
                  수치가 없으면 미확인입니다. 원문을 새로 읽거나 전체 청크를 재검사한 결과는 아닙니다.
                </p>
              </>
            ) : (
              <>
                <h2>선택한 처리 버전</h2><details className="rag-tech-details"><summary>처리 버전 식별자</summary><code>{generation?.generation}</code></details>
                <Badge tone={generation?.in_database?'ok':'neutral'}>
                  {generation?.in_database?'현재 DB 처리 버전':'저장된 처리 버전'}
                </Badge>
                <dl>
                  <dt>임베딩 모델</dt>
                  <dd>{generation?.model?.embedder??'미확인'}</dd>
                  <dt>임베딩 모델 digest</dt>
                  <dd>{generation?.model?.embedder_digest??'미확인'}</dd>
                  <dt>개별 처리 버전 차원 기록</dt>
                  <dd>{n(generation?.model?.dimensions)}</dd>
                  <dt>추출 모델</dt>
                  <dd>{generation?.model?.extractor??'미확인'}</dd>
                  <dt>파생 원본 처리 버전</dt>
                  <dd>{generation?.derived_from??'기록 없음'}</dd>
                  <dt>재임베딩 청크</dt>
                  <dd>{n(generation?.embedding?.chunks)}</dd>
                  <dt>재임베딩 호출·소요</dt>
                  <dd>{n(generation?.embedding?.calls)}회 · {seconds(generation?.embedding?.elapsed_ms)}</dd>
                  <dt>추출 호출·소요</dt>
                  <dd>{n(generation?.llm?.calls)}회 · {seconds(generation?.llm?.elapsed_ms)}</dd>
                  <dt>기록 파일 수정 시각</dt>
                  <dd>{at(generation?.file_modified_at)}</dd>
                </dl>
                <p className="rag-footnote">
                  재임베딩 기록이 없는 일반 추출 처리 버전은 그 값을 0으로 대체하지 않습니다. 현재 DB 벡터 검색 인덱스 차원은 상단에서 따로 확인합니다.
                </p>
              </>
            )}
          </aside>
        )}
      </div>
    </ProjectNamesContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<App/>);
