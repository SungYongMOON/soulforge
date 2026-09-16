import {describeTopologyReason} from './topology-view.mjs';
export function operationIssue(node){
  const reasons=node.healthReasons??[],has=code=>reasons.includes(code);
  let cause=reasons.length?reasons.map(describeTopologyReason).join(' · '):'검사에서 상세 사유를 제공하지 않았습니다.';
  let impact='이 검사만으로 업무 전체의 중단 여부는 확인할 수 없습니다.',next='검사 근거와 담당 서비스의 기록을 확인합니다.';
  if(has('plaud_catalog_malformed_row')){cause='수집기가 PLAUD 목록 형식을 해석하지 못했습니다.';impact='목록 해석 단계에서 수집이 중단됩니다. 기존 보관 자료의 손상을 뜻하지 않습니다.';next='CLI의 녹음 ID·출력 형식과 수집기 판독 규칙을 대조해야 합니다. 같은 코드를 재시작해도 형식 오류는 해결되지 않습니다.';}
  else if(has('lease_unavailable')){cause='Linear 수집기가 실행 잠금을 확보하지 못했습니다.';impact='해당 실행은 진행하지 못했습니다. 다른 실행의 점유인지 잔여 잠금인지는 미확인입니다.';next='잠금 소유자와 실행 이력을 확인해야 합니다. 잠금을 임의 삭제하면 중복 수집이 생길 수 있습니다.';}
  else if(node.status?.key==='pending'){cause=`${node.status.count??'건수 미확인'}${node.status.count===null?'':'건'} 처리 보류`;impact='대기 항목의 전달 완료가 확인되지 않았습니다. 수집기 전체 중단을 뜻하지 않습니다.';next='개별 항목의 보류 사유를 확인해야 합니다. 이 상태 요약에는 항목별 사유가 없습니다.';}
  const r=node.recovery;
  const recovery=!r?.available?'자동 조치 정책 조회 미확인':r.stateKey==='not_targeted'?'기존 자동 복구 대상 아님':r.stateLabel??'자동 조치 상태 미확인';
  return {id:node.id,label:node.label,kind:node.status?.key,cause,impact,next,recovery,attemptedAt:r?.lastAttemptAt??null,verifiedAt:r?.lastVerifiedRepairAt??null,observedAt:node.observedAt};
}
