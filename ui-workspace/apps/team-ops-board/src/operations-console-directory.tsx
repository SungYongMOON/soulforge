import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, RefreshCw, Search, X } from 'lucide-react';
import { directoryKey, flattenDirectory } from './core/operations-console-view.mjs';

type Row = Record<string, any>;
const stamp=(v:any)=>v ? new Date(v).toLocaleString('ko-KR') : '미확인';
const size=(v:any)=>typeof v!=='number'?'미집계':v<1024?`${v} B`:v<1048576?`${(v/1024).toFixed(1)} KB`:`${(v/1048576).toFixed(1)} MB`;

export function ConsoleDirectory({ active, context, onReturn }: { active:boolean; context?:Row; onReturn:()=>void }) {
  const [roots,setRoots]=useState<string[]>([]),[root,setRoot]=useState(''),[relative,setRelative]=useState('');
  const [cache,setCache]=useState<Row>({}),[expanded,setExpanded]=useState<Set<string>>(new Set());
  const [selected,setSelected]=useState<Row|null>(null),[query,setQuery]=useState(''),[loading,setLoading]=useState(0),[error,setError]=useState('');
  const [trail,setTrail]=useState<Row[]>([]),[showDetail,setShowDetail]=useState(false);
  const cacheRef=useRef<Row>({}),pending=useRef(new Map<string,Promise<any>>()),queue=useRef<Array<()=>void>>([]),workers=useRef(0);
  const initialized=useRef(false),scroll=useRef<HTMLDivElement>(null),token=useRef(0),requestVersion=useRef<Row>({});
  const runQueue=useCallback(()=>{ while(workers.current<2&&queue.current.length){workers.current++;queue.current.shift()!();} },[]);
  const read=useCallback((which:string,where='',force=false):Promise<any>=>{
    const key=directoryKey(which,where),old=cacheRef.current[key];
    if(!force&&old&&Date.now()-old.readAt<60_000)return Promise.resolve(old);
    if(pending.current.has(key))return pending.current.get(key)!;
    const version=(requestVersion.current[key]??0)+1;requestVersion.current[key]=version;
    const p=new Promise(resolve=>{queue.current.push(()=>{setLoading(n=>n+1);
      const params=new URLSearchParams({root:which,relative:where});
      void fetch(`/operations-directory.json?${params}`,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)})
        .then(async r=>{if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('read');return r.json();})
        .catch(()=>({state:'unavailable',reason:'폴더 목록을 읽지 못했습니다.',entries:[],scanned_at:null}))
        .then(value=>{const row={...value,readAt:Date.now()};
          if(requestVersion.current[key]===version){cacheRef.current={...cacheRef.current,[key]:row};setCache(cacheRef.current);}
          if(Array.isArray(value.roots))setRoots(value.roots);resolve(row);
        }).finally(()=>{pending.current.delete(key);workers.current--;setLoading(n=>n-1);runQueue();});
    });runQueue();});pending.current.set(key,p);return p;
  },[runQueue]);
  const chooseRoot=async(which:string)=>{
    const epoch=++token.current;setRoot(which);setRelative('');setTrail([]);setSelected(null);setQuery('');setError('');
    const first=await read(which);
    if(token.current!==epoch)return;
    if(first.state==='denied'||first.state==='unavailable'){setError(first.reason);return;}
    const children=(first.entries??[]).filter((r:Row)=>r.browsable).slice(0,8);
    setExpanded(old=>new Set([...old,...children.map((r:Row)=>directoryKey(which,r.name))]));
    for(let i=0;i<children.length;i+=2){if(token.current!==epoch)break;await Promise.all(children.slice(i,i+2).map((r:Row)=>read(which,r.name)));}
  };
  useEffect(()=>{if(!active||initialized.current)return;initialized.current=true;void read('').then(r=>{if(r.state==='unavailable')setError(r.reason);});},[active,read]);
  useEffect(()=>{if(!active)token.current++;},[active]);
  const current=cache[directoryKey(root,relative)];
  const allRows=useMemo(()=>flattenDirectory(root,relative,cache,expanded),[root,relative,cache,expanded]);
  const rows=query?allRows.filter((r:Row)=>r.name.toLowerCase().includes(query.toLowerCase())):allRows;
  const toggle=async(row:Row)=>{
    const key=directoryKey(root,row.relative);if(expanded.has(key)){setExpanded(old=>{const n=new Set(old);n.delete(key);return n;});return;}
    setExpanded(old=>new Set([...old,key]));await read(root,row.relative);
  };
  const enter=async(row:Row)=>{setTrail(old=>[...old,{root,relative,selected,query,scroll:scroll.current?.scrollTop??0}]);setRelative(row.relative);setSelected(null);setQuery('');if(scroll.current)scroll.current.scrollTop=0;await read(root,row.relative);};
  const back=()=>{const prev=trail.at(-1);if(!prev)return;setTrail(old=>old.slice(0,-1));setRoot(prev.root);setRelative(prev.relative);setSelected(prev.selected);setQuery(prev.query);requestAnimationFrame(()=>{if(scroll.current)scroll.current.scrollTop=prev.scroll;});};
  const select=(r:Row)=>{setSelected(r);setShowDetail(true);};
  return <div className="cx-directory">
    {context&&<div className="cx-context-note"><span>선택한 서비스 <strong>{context.label}</strong> · 폴더 참조가 제공되지 않아 자동 연결하지 않았습니다.</span><button onClick={onReturn}>진단으로 돌아가기</button></div>}
    <div className="cx-directory-layout"><aside className="cx-locations"><h2>저장 위치</h2>{roots.map(alias=><button key={alias} className={root===alias?'is-selected':''} onClick={()=>void chooseRoot(alias)}><FolderOpen size={17}/><span>{alias==='data_root'?'데이터':alias==='control_root'?'운영 상태':alias}<small>{alias}</small></span></button>)}<p>검증된 허용 위치만<br/>파일 내용은 열지 않습니다.</p></aside>
    <section className="cx-folder-main"><header className="cx-folder-toolbar"><button disabled={!trail.length} aria-label="이전 폴더 위치" onClick={back}><ArrowLeft size={18}/></button><div><h2>{relative.split('/').at(-1)|| (root==='data_root'?'데이터':root==='control_root'?'운영 상태':'저장 위치를 선택하세요')}</h2><p>{root?`${root} / ${relative||'최상위'}`:'폴더 아래의 구조를 함께 펼쳐 봅니다.'}</p></div><button disabled={!root||loading>0} onClick={()=>void read(root,relative,true)} aria-label="현재 폴더 다시 읽기"><RefreshCw size={16}/></button></header>
      <div className="cx-folder-tools"><label className="cx-search"><Search size={16}/><input aria-label="읽은 폴더 항목 검색" placeholder="읽은 범위에서 이름 찾기" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="폴더 검색 지우기" onClick={()=>setQuery('')}><X size={14}/></button>}</label><button disabled={!root||loading>0} onClick={()=>{const candidates=allRows.filter((r:Row)=>r.browsable&&!expanded.has(directoryKey(root,r.relative))).slice(0,8);void(async()=>{for(let i=0;i<candidates.length;i+=2)await Promise.all(candidates.slice(i,i+2).map((r:Row)=>toggle(r)));})();}}>한 단계 더</button><button onClick={()=>setExpanded(new Set())}>접기</button></div>
      <div className="cx-folder-scan" role="status">{loading?`${loading}개 폴더 읽는 중`:`${allRows.length}개 항목 표시`}{current&&<> · 스캔 {stamp(current.scanned_at)}{current.cached?' · 캐시':''}{current.excluded?` · 현재 폴더 보호 항목 ${current.excluded}개 제외`:''}</>}</div>
      {error&&<p className="cx-notice">{error}</p>}{current?.state==='partial'&&<p className="cx-notice">{current.reason} · 전체 목록이 아닙니다.</p>}
      <div ref={scroll} className="cx-tree-scroll"><table className="cx-file-table"><thead><tr><th>이름</th><th>크기</th><th>수정 시각</th></tr></thead><tbody>{rows.map((row:Row)=>{
        const child=cache[directoryKey(root,row.relative)],isOpen=expanded.has(directoryKey(root,row.relative));
        return <tr key={row.relative} className={selected?.relative===row.relative?'is-selected':''}><td><div className="cx-tree-name" style={{paddingLeft:Math.min(row.depth,8)*18}}>
          <button className="cx-disclosure" aria-label={`${row.name} ${isOpen?'접기':'펼치기'}`} aria-expanded={row.browsable?isOpen:undefined} disabled={!row.browsable} onClick={()=>void toggle(row)}>{row.browsable?(isOpen?<ChevronDown size={15}/>:<ChevronRight size={15}/>):null}</button>
          {row.kind==='directory'?<Folder size={17}/>:<FileText size={16}/>}<button className="cx-file-name" title={row.relative} onClick={()=>select(row)} onKeyDown={e=>{
            if(e.key==='Enter'&&row.browsable){e.preventDefault();void enter(row);return;}
            if(e.key==='ArrowRight'&&row.browsable&&!isOpen){e.preventDefault();void toggle(row);return;}
            if(e.key==='ArrowLeft'&&isOpen){e.preventDefault();void toggle(row);return;}
            if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const buttons=[...(e.currentTarget.closest('table')?.querySelectorAll<HTMLButtonElement>('.cx-file-name')??[])];const index=buttons.indexOf(e.currentTarget);buttons[Math.max(0,Math.min(buttons.length-1,index+(e.key==='ArrowDown'?1:-1)))]?.focus();}
          }}>{row.name}</button>{row.kind==='link'&&<small className="cx-link-state">링크 · 차단</small>}
          {row.browsable&&<button className="cx-enter-folder" aria-label={`${row.name} 여기부터 보기`} title="여기부터 보기" onClick={()=>void enter(row)}><ChevronRight size={14}/></button>}
        </div>{isOpen&&(!child||child.state!=='ready')&&<small className="cx-tree-state">{!child?'하위 목록 대기':child.state==='partial'?`${child.reason} · 읽은 일부만 표시`:child.reason||'하위 탐색 불가'}</small>}{isOpen&&child?.state==='ready'&&child.entries?.length===0&&<small className="cx-tree-state">허용된 직접 자식 없음{child.excluded?` · 보호 항목 ${child.excluded}개 제외`:''}</small>}</td><td>{size(row.size)}</td><td>{stamp(row.modified_at)}</td></tr>;
      })}</tbody></table>{!rows.length&&<div className="cx-empty"><FolderOpen size={30}/><h3>{root?loading?'폴더를 읽고 있습니다':query?'읽은 범위에서 일치하는 이름이 없습니다':current?.state==='denied'||current?.state==='unavailable'?'목록을 확인할 수 없습니다':'허용된 항목이 없습니다':'왼쪽에서 저장 위치를 선택하세요'}</h3><p>{current?.reason??'처음에는 보이는 폴더의 하위 목록을 제한적으로 펼칩니다.'}</p></div>}</div>
      <footer className="cx-folder-footer">{allRows.length>=500?'표시 한도 500행 · 일부만 표시. ':''}폴더당 최대 200개 검사 · 하위 크기 미집계 · 검색·정렬은 읽은 범위 기준</footer>
    </section></div>
    {selected&&showDetail&&<aside className="cx-inspector" aria-label="파일 메타데이터 상세"><header><span>선택 항목</span><button aria-label="파일 상세 닫기" onClick={()=>setShowDetail(false)}><X size={18}/></button></header><h2>{selected.name}</h2><p className="cx-muted">원문을 읽지 않은 메타데이터입니다.</p><dl><dt>위치</dt><dd>{root} / {selected.relative}</dd><dt>종류</dt><dd>{selected.kind==='directory'?'폴더':selected.kind==='link'?'링크 · 탐색 차단':'파일'}</dd><dt>크기</dt><dd>{size(selected.size)}</dd><dt>수정 시각</dt><dd>{stamp(selected.modified_at)}</dd><dt>이 목록을 읽은 시각</dt><dd>{stamp(cache[directoryKey(root,selected.parent)]?.scanned_at)}</dd><dt>역할·서비스 연결</dt><dd>항목별 Registry 참조 미제공</dd><dt>RAG 반영</dt><dd>항목·판본 연결 근거 미제공</dd></dl>{selected.browsable&&<button className="cx-primary" onClick={()=>{void enter(selected);setShowDetail(false);}}>이 폴더부터 보기 <ChevronRight size={16}/></button>}<p className="cx-footnote">파일이 존재한다는 것만으로 수집·색인·백업 완료를 뜻하지 않습니다.</p></aside>}
  </div>;
}
