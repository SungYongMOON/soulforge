import {Children,createContext,isValidElement,useContext,type ReactNode} from 'react';
import {sourceGroupState} from './core/operations-source-state.mjs';
import './operations-source-ui.css';
type Row=Record<string,any>;
export const SOURCE_CATALOG:Record<string,{name:string;url:string;affects:string}>={
  federation:{name:'서비스 구조',url:'/topology-federation.snapshot.json',affects:'구조·진단, 수집기 수'},
  health:{name:'서비스 검사 결과',url:'/operations-health.snapshot.json',affects:'운영 상태, 조치할 항목'},
  recovery:{name:'복구 이력',url:'/topology-recovery.snapshot.json',affects:'진단 원인·복구 기록'},
  graph:{name:'자료 반영 기록',url:'/operations-graph-receipts.json',affects:'과제별 처리 근거'},
  host:{name:'PC 자원',url:'/host-stats.snapshot.json',affects:'CPU·메모리·디스크'},
  limits:{name:'제공자 한도',url:'/provider-limits.snapshot.json',affects:'Claude 등 남은 한도'},
  codexQuota:{name:'Codex 한도',url:'/codex-live-limits.json',affects:'Codex 남은 한도'},
  agQuota:{name:'Antigravity 한도',url:'/antigravity-quota.snapshot.json',affects:'Antigravity 남은 한도'},
  runtime:{name:'에이전트 실행',url:'/agent-runtime.snapshot.json',affects:'에이전트 활동'},
  threads:{name:'작업 목록',url:'/codex-threads.snapshot.json',affects:'에이전트 활동'},
  recent:{name:'최근 자료',url:'/operations-recent.json',affects:'원천별 최근 기록'},
  sources:{name:'원천별 수집',url:'/operations-sources.json',affects:'자료 수집·검색 포함'},
  models:{name:'모델 서버',url:'/local-model-status.json',affects:'모델 연결, 로컬 모델'},
  rag:{name:'검색 DB 처리',url:'/rag-operations.json?view=overview',affects:'검색 준비, RAG 처리 수량'},
  incidents:{name:'운영 진단',url:'/operations-incidents.json',affects:'조치할 항목, 수집 상태'},
  usage:{name:'AI 사용량',url:'/ai-usage-meter.snapshot.json?read_only=1',affects:'토큰·요청 추이, 사용 이력'},
};
export const DIAGNOSTIC_SOURCES=['federation','health','recovery','graph','sources','models','rag','incidents'];
export const SourceStateContext=createContext<{sources:Row;retry:(key:string)=>void}>({sources:{},retry:()=>{}});
const time=(at?:string)=>at?new Date(at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'없음';
export function SourceBoundary({keys,label,children,allowPartial=false}:{keys:string[];label:string;children:ReactNode;allowPartial?:boolean}){
  const {sources,retry}=useContext(SourceStateContext),group=sourceGroupState(sources,keys);
  if(!Object.keys(sources).length)return <>{children}</>;
  const firstPending=group.initialPending;
  const unavailable=!group.pending&&group.missing&&!allowPartial;
  const observed=group.lastSuccessAt;
  return <div className="os-source-shell" data-source-keys={keys.join(',')} aria-busy={group.pending}>
    {firstPending?<section className="os-placeholder" role="status" aria-label={`${label} 조회 중`}><strong>{label}</strong><span>{group.slow?'응답 지연 · 조회를 기다리는 중':'조회 중'}</span><i/><i/></section>:unavailable?<section className="os-placeholder" role="status"><strong>{label}</strong><span>새 상태를 읽지 못했습니다.</span>{keys.filter(key=>sources[key]?.status==='error').map(key=><button key={key} onClick={()=>retry(key)}>{SOURCE_CATALOG[key]?.name??key} 다시 시도</button>)}</section>:<>
      {(group.pending||group.errors.length>0)&&<div className="os-update" role="status">{group.pending?(group.slow?'응답 지연 · 업데이트 중':'업데이트 중'):group.missing?'일부 데이터 조회 실패':'갱신 실패 · 마지막 정상값 표시 중'}{observed&&` · 마지막 확인 ${time(observed)}`}</div>}
      {children}
    </>}
  </div>;
}
export function SummaryBoundaries({children}:{children:ReactNode}){
  const groups=[['limits','codexQuota','agQuota'],['usage'],DIAGNOSTIC_SOURCES,['rag'],['models'],DIAGNOSTIC_SOURCES];
  const names=['남은 한도','토큰 사용','자료 수집','검색 준비','모델 연결','확인할 항목'];
  return <>{Children.toArray(children).filter(isValidElement).map((child,i)=><SourceBoundary key={names[i]??i} keys={groups[i]??[]} label={names[i]??'운영 상태'} allowPartial={i===0||i===4}>{child}</SourceBoundary>)}</>;
}
export function SourceFailures(){
  const {sources,retry}=useContext(SourceStateContext);
  const errors=Object.entries(sources).filter(([,row])=>row.status==='error'||row.status==='loading'&&row.error);
  if(!errors.length)return null;
  const retained=errors.filter(([,row])=>row.value!==undefined).length;
  return <details className="os-failures"><summary>{errors.length}개 데이터 소스 갱신 실패 · {retained===errors.length?'마지막 정상값 표시 중':retained?`보존값 ${retained}개 · 나머지 확인 불가`:'정상값 없음 · 확인 불가'}</summary>
    {errors.map(([key,row])=><article key={key}><header><strong>{SOURCE_CATALOG[key]?.name??key}</strong><button disabled={row.status==='loading'} onClick={()=>retry(key)}>{row.status==='loading'?'재시도 중':'다시 시도'}</button></header><dl><dt>실패 시각</dt><dd>{time(row.failedAt)}</dd><dt>영향받는 화면</dt><dd>{SOURCE_CATALOG[key]?.affects}</dd><dt>마지막 성공</dt><dd>{time(row.lastSuccessAt)}</dd><dt>현재 표시</dt><dd>{row.value!==undefined?'마지막 정상값 유지':'확인할 수 없음 · 정상값 없음'}</dd></dl><p>새 상태를 읽지 못했습니다. 해당 항목만 다시 시도할 수 있습니다.</p><details><summary>기술 오류 상세</summary><code>{SOURCE_CATALOG[key]?.url}</code><p>{row.error?.code??'REQUEST_FAILED'}</p></details></article>)}
  </details>;
}
