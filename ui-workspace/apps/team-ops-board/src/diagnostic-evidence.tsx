import {when} from './operations-workspace';
type Row=Record<string,any>;
export function DiagnosticEvidence({node}:{node:Row}){
  const c=node.diagnostic,m=node.mailHistory;
  if(m?.history_only)return <section className="ow-diagnostic-result" aria-label="메일 현재 처리와 과거 기록"><strong>현재 회차 · 실패 {m.failed} / 보류 {m.active_held}</strong><p>지금 필요한 사용자 조치 없음 · {when(m.observed_at)}</p><details><summary>과거 실패 기록 {m.tracked}건 · 조사 참고용</summary><p>현재 수집을 막는 항목은 아닙니다. 실제 누락된 메일이 있을 때 해당 시기의 원본과 Gmail 수신 결과를 대조하는 근거입니다.</p><p>마지막 실패 {when(m.last_attempt_at)} · 당시 전달 완료 여부는 미확인입니다. 중복 전송을 피하기 위해 자동 재전달하지 않습니다.</p></details></section>;
  if(!c)return null;
  return <section className="ow-diagnostic-result" aria-label="읽기 전용 검사 결과"><strong>{node.status.label}</strong><p>{node.scope}</p><p>검사 {c.checked??'—'}개{c.expected!=null?` / 대상 ${c.expected}개`:''}{typeof c.failed==='number'?` · 불일치 ${c.failed}개`:''}{typeof c.unreadable==='number'?` · 읽기 미완료 ${c.unreadable}개`:''}</p><small>검사 시각 {when(c.observed_at)}{c.collection_at?` · 수집 기록 ${when(c.collection_at)}`:''}</small>{c.scope==='bounded_sample'&&<p>표본 검사입니다. 표본 밖 파일의 상태는 아직 판단하지 않습니다.</p>}</section>;
}
