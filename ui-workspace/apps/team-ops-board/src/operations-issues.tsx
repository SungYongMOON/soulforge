import {STATUS_LABELS} from './core/operation-status.mjs';
import {operationIssue} from './core/operations-issues.mjs';
import {when} from './operations-workspace';
type Row=Record<string,any>;
export function OperationsIssues({model,select}:{model:Row;select:(id:string)=>void}){
  const rows=model.attention.map(operationIssue);
  if(!rows.length)return <div className="oc-diagnostic-summary" aria-label="진단 원인과 복구 상태"><strong>{model.healthAvailable?'수집·서비스 검사 · 조치 대상 없음':'수집·서비스 검사 · 조회 미확인'}</strong><small>{model.healthAvailable?`검사 ${when(model.observedAt)} · 모델 서버 상태는 위에 별도 표시`:'검사 결과를 읽지 못해 판단할 수 없습니다.'}</small></div>;
  return <section className={`vd-issues count-${Math.min(rows.length,3)}`} aria-label="진단 원인과 복구 상태">
    <header><h2>조치할 항목</h2><span>{rows.length}개</span><small>검사 {when(model.observedAt)}</small></header>
    {rows.map((r:Row)=><article key={r.id} className={`vd-issue ${r.kind==='problem'?'red':'amber'}`}>
      <div className="vd-issue-heading"><span className={`vd-dot ${r.kind==='problem'?'red':'amber'}`}/><strong>{r.label}</strong><span className="vd-source-pill">{STATUS_LABELS[r.kind as keyof typeof STATUS_LABELS]??'미확인'}</span><button onClick={()=>select(r.id)}>근거·이력 ↗</button></div>
      <h3>{r.cause}</h3><p>{r.impact}</p><div className="oc-next-step"><strong>다음 조치</strong><p>{r.next}</p></div>
      <div className="vd-issue-repair"><span>{r.recovery}</span>{(r.verifiedAt||r.attemptedAt)&&<small>{r.verifiedAt?`복구 검증 ${when(r.verifiedAt)}`:`조치 ${when(r.attemptedAt)} · 복구 미검증`}</small>}</div>
    </article>)}
  </section>;
}
