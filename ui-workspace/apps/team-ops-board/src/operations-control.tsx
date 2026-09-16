import {ProjectLabel} from './project-labels';
import {RagTrend} from './rag-trend';
import {type ReactNode} from 'react';
import {ArrowRight,ArrowUpRight,CheckCircle2,TriangleAlert,Clock3,Database,Server} from 'lucide-react';
import {operationIssue} from './core/operations-issues.mjs';
import {ragOverview} from './core/operations-overview-view.mjs';
import {when} from './operations-workspace';
import './operations-control.css';
type Row=Record<string,any>;
type Go=(nav:any)=>void;
const num=(n:any)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('ko-KR'):'—';
const amount=(metric:Row)=>metric.value===null?'—':`${metric.complete?'':'≥ '}${num(metric.value)}`;
const memory=(n:any)=>typeof n==='number'?`${(n/1024**3).toFixed(1)} GB`:'미확인';
export function OperationsJudgment({model,inputs,failed,go,hostDetail}:{model:Row;inputs:Row;failed:string[];go:Go;hostDetail:(host:Row)=>void}){
  const watched=model.attention,hosts=failed.includes('models')?[]:inputs.models?.hosts??[];
  const broken=hosts.filter((h:Row)=>['refused','timeout'].includes(h.connection));
  const attention=watched.filter((n:Row)=>['problem','observation_error'].includes(n.status.key));
  const countsKnown=model.healthAvailable&&inputs.models?.state==='ready'&&!failed.includes('models');
  const caseCount=(n:number)=>countsKnown?n:n?`≥ ${n}`:'—';
  const pending=watched.filter((n:Row)=>n.status.key==='pending');
  const collectors=model.nodes.filter((n:Row)=>n.stage==='collect'&&n.id.startsWith('watchtower::'));
  const rag=ragOverview(inputs.rag),ragKnown=!failed.includes('rag')&&inputs.rag?.state==='ready';
  const issueRow=(n:Row)=>{const r=operationIssue(n);return <div className={`oc-case is-${n.status.key}`} key={n.id}><span className="oc-case-mark">{n.status.key==='pending'?<Clock3 size={15}/>:<TriangleAlert size={15}/>}</span><div><strong>{n.id==='watchtower::ingress_supervisor'?'PLAUD 수집':n.label}</strong><p>{r.cause}</p><small>{r.impact} · {when(r.observedAt)}</small></div><button onClick={()=>go({screen:'system',node:n.id})}>진단 근거<ArrowUpRight size={14}/></button></div>;};
  return <section className="vd-panel oc-judgment" aria-label="운영 판단"><header><h2>운영 판단</h2><div className="oc-status-key"><span className="is-problem">조치 대상 {caseCount(watched.length+broken.length)}</span></div></header>
    <div className="oc-checks"><div><span>수집 검사 통과</span><b>{model.healthAvailable?`${collectors.filter((n:Row)=>n.status.key==='ok').length} / ${collectors.length}`:'—'}</b><small>보류 {collectors.filter((n:Row)=>n.status.key==='pending').length} · 미확인 {collectors.filter((n:Row)=>n.status.key==='unknown').length}</small></div><div><span>RAG 판본·수량 일치</span><b>{ragKnown?`${rag.matched} / ${rag.expected}`:'—'}</b><small>설정된 과제</small></div><div><span>모델 API 응답</span><b>{hosts.length?`${hosts.filter((h:Row)=>h.connection==='responding').length} / ${hosts.length}`:'—'}</b><small>추론 성공과 별도</small></div><div><span>관측 미확인</span><b>{model.healthAvailable?num(model.counts.unknown):'—'}</b><small>감시 대상 {model.watchedCount}개 중</small></div></div>
    <div className="oc-cases">{broken.map((h:Row)=><div className="oc-case is-problem" key={h.id}><TriangleAlert size={15}/><div><strong>{h.label}</strong><p>{h.connection==='refused'?'응답 모델 API가 연결을 받지 않습니다.':'모델 API 응답 시간이 초과됐습니다.'}</p><small>서버 프로세스·포트 확인 필요 · 장치 전체 중단 여부는 미확인</small></div><button onClick={()=>hostDetail(h)}>서버 근거<ArrowUpRight size={14}/></button></div>)}{attention.map(issueRow)}{pending.map(issueRow)}{!broken.length&&!watched.length&&<p className="vd-muted">{model.healthAvailable?'제공된 검사 범위에서 별도 확인할 항목 없음':'현재 판단 근거를 읽는 중입니다.'}</p>}</div>
    {model.healthAvailable&&<div className="oc-passed"><span>최근 검사 통과</span>{collectors.filter((n:Row)=>n.status.key==='ok').map((n:Row)=><button key={n.id} title={`검사 ${when(n.observedAt)}`} onClick={()=>go({screen:'system',node:n.id})}><CheckCircle2 size={12}/>{n.label}</button>)}</div>}
  </section>;
}
function Metric({label,value,note}:{label:string;value:ReactNode;note?:string}){return <div className="oc-metric"><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>;}
export function RagPipeline({data,failed,go}:{data?:Row;failed:boolean;go:Go}){
  const r=ragOverview(data),known=data?.state==='ready'&&!failed;
  return <section className="vd-panel oc-rag" aria-label="전처리와 RAG 처리"><header><h2>전처리 → RAG</h2><span className="vd-source-pill">실제 Neo4j · {r.expected?`${r.expected}개 과제`:'범위 미확인'}</span><button className="vd-header-link" onClick={()=>go({screen:'rag',node:null})}>처리 이력<ArrowUpRight size={14}/></button></header>
    <div className="oc-pipeline"><Metric label="준비된 문서" value={amount(r.prepared)} note={`저장 판본 ${amount(r.documents)}개 문서`}/><ArrowRight size={15}/><Metric label="DB 청크" value={amount(r.chunks)} note="현재 적재"/><ArrowRight size={15}/><Metric label="임베딩 포함" value={amount(r.embedded)} note={`미임베딩 ${amount(r.unembedded)}`}/><ArrowRight size={15}/><Metric label="판본 대조" value={known?`${r.matched}/${r.expected}`:'—'} note="과제별 수량 일치"/></div>
    <div className="oc-rag-state"><span><Database size={13}/> 벡터 색인 <b>{known?data?.database?.vector_index?.state??'미확인':'미확인'}</b></span><span>{known?num(data?.database?.vector_index?.dimensions):'—'}차원</span><span>적재 잠금 {known?num(data?.database?.active_load_locks):'—'}</span><span>조회 {when(data?.observed_at)}{failed?' · 보존값':''}</span></div>
    <RagTrend projects={r.rows} expected={r.expected}/>
    <div className="oc-quality" aria-label="반영·잔여·제외·정합성"><Metric label="검증된 반영 문서" value={amount(r.reflected)}/><Metric label="실행 범위 내 대기" value={amount(r.runPending)}/><Metric label="실행 범위 내 실패" value={amount(r.runFailed)}/><Metric label="범위 밖 관계" value={amount(r.outsideRelations)}/><Metric label="대기·재시도" value={amount(r.pending)}/><Metric label="준비 실패" value={amount(r.preparationFailed)}/><Metric label="준비 거부" value={amount(r.refused)}/><Metric label="DB 잔여 노드" value={known?num(data?.database?.residue_nodes):'—'}/><Metric label="미귀속 노드" value={known?num(data?.database?.unscoped_nodes):'—'}/><Metric label="중복 ID" value={amount(r.duplicates)}/><Metric label="원문 불일치" value={amount(r.sourceMismatch)}/><Metric label="출처 없는 개체" value={amount(r.sourceMissing)}/></div>
    <div className="oc-rag-table"><table><thead><tr><th>과제</th><th>준비</th><th>DB 청크</th><th>임베딩</th><th>대기</th><th>최근 실행</th><th>최근 반영</th></tr></thead><tbody>{r.rows.map((p:Row)=><tr key={p.project}><th><button onClick={()=>go({screen:'rag',node:null,project:p.project})}><ProjectLabel code={p.project}/><ArrowUpRight size={11}/></button></th><td>{num(p.preparation?.counts?.prepared)}</td><td>{num(p.database?.chunks)}</td><td>{num(p.database?.embedded_chunks)}</td><td className={p.pending?.count>0?'oc-warning':''}>{num(p.pending?.count)}</td><td>{p.history_scope?.failed?'이력 일부':({SYNCED:'반영됨',UNCHANGED:'변경 없음',HOLD:'보류',FAILED:'실패'} as Row)[p.last_run?.status]??'미확인'}</td><td>{when(p.database?.loaded_at)}</td></tr>)}</tbody></table></div>
    <p className="oc-footnote">수집 전체와 RAG 대상은 다릅니다. 정합성 수치는 저장 판본 검사 기록이며, 잔여·중복은 정크 삭제 판정이 아닙니다. 검색·답변 품질은 별도 검증입니다.</p>
  </section>;
}
export function LocalModels({data,rag,failed,ragFailed=false,onInspect}:{data?:Row;rag?:Row;failed:boolean;ragFailed?:boolean;onInspect:(host:Row)=>void}){
  const metrics=ragOverview(rag);
  return <section className="vd-panel oc-models" aria-label="로컬 모델 모니터"><header><h2>로컬 모델</h2><span className="vd-source-pill">서버 상태 · 적재 메모리 · 기록된 사용량</span></header><div className="oc-hosts">{data?.hosts?.map((h:Row)=><article key={h.id} className={h.connection==='refused'?'needs-attention':''}><header><Server size={15}/><strong>{h.label.replace(' · 응답 모델','').replace(' · RAG 모델','')}</strong><span className={`vd-dot ${failed?'muted':h.connection==='responding'?'blue':'red'}`}/><b>{failed?'조회 실패':h.connection==='responding'?'API 응답':h.connection==='refused'?'접속 불가':'미확인'}</b></header><div className="oc-host-stats"><Metric label={h.connection==='responding'?'API 응답':'확인 소요'} value={`${num(h.elapsed_ms)} ms`}/><Metric label="적재 모델" value={num(h.resident_count)}/><Metric label="모델 메모리" value={memory(h.resident_memory_bytes)}/></div><p>{h.connection==='refused'?'현재 주소가 연결을 받지 않음 · 모델 실행 상태 확인 필요':h.resident_count===0?'서버 연결됨 · 현재 적재 모델 없음':(h.models??[]).filter((m:Row)=>m.resident).map((m:Row)=>m.model).join(' · ')||'적재 목록 미확인'}</p><footer><small>{when(h.observed_at)}</small><button onClick={()=>onInspect(h)}>등록 모델·근거<ArrowUpRight size={12}/></button></footer></article>)}{!data?.hosts?.length&&<p className="vd-muted">모델 서버 관측 미확인</p>}</div>
    <div className="oc-model-usage"><div><h3>RAG 모델 사용 기록</h3><small>현재 선택 판본의 생성 기록 · 서버 전체 누적·실시간 처리율과 별도{ragFailed?' · 보존값, 새 조회 실패':''}</small></div><table><thead><tr><th>역할 · 모델</th><th>호출</th><th>입력 토큰</th><th>출력 토큰</th><th>오류</th></tr></thead><tbody>{metrics.models.map((m:Row)=><tr key={`${m.role}:${m.model}`}><th>{m.role} · {m.model}</th><td>{amount(m.calls)}</td><td>{amount(m.prompt)}</td><td>{amount(m.output)}</td><td>{amount(m.errors)}</td></tr>)}{!metrics.models.length&&<tr><td colSpan={5}>모델 사용 기록 미확인</td></tr>}</tbody></table></div><p className="oc-footnote">서버 API 응답은 추론 성공을 뜻하지 않습니다. 전체 서버 요청 수·토큰/초·다른 앱의 사용량은 아직 계측되지 않았습니다.</p>
  </section>;
}
