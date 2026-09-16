// One vocabulary for map, list, inspector and summary badges. Measurement
// scope is separate from state; a transport response is not task completion.
export const STATUS_LABELS=Object.freeze({ok:'정상',processing:'진행 중',pending:'보류',problem:'이상',sampled:'일부 확인',observation_error:'미확인',unknown:'미확인',history:'미확인'});
export function unifyStatus(node){
  const checkLabel=node.connection?'연결':node.diagnostic?.scope==='bounded_sample'?'보관 · 표본':node.diagnostic?.lane?'보관':node.diagnostic?.kind==='models'?'API':node.id==='context_engine::neo4j'?'DB':node.id==='context_engine::prepare'?'준비 기록':node.id.startsWith('watchtower::src_')?'연결':node.stage==='collect'?'수집':node.stage==='custody'?'보관':'관측';
  return {...node,checkLabel,status:{...node.status,evidenceLabel:node.status.evidenceLabel??node.status.label,label:STATUS_LABELS[node.status.key]??STATUS_LABELS.unknown}};
}
export function applySourceConnection(node,connection,definitions){
  const key=connection.state==='responding'?(connection.collection||connection.basis==='http_liveness'||connection.basis==='collection'?'ok':'sampled'):connection.state==='failed'?'problem':'unknown';
  const basis=connection.basis==='tls'?'TLS 접속':connection.basis==='http_liveness'?'서버 API 응답':'최근 수집의 API 응답';
  return {...node,connection,observedAt:connection.observed_at,freshness:'fresh',healthReasons:connection.state==='failed'?['source_connection_failed']:[],
    scope:`${basis} 확인 · 계정 권한과 자료 전달 완료는 별도`,status:{...definitions[key],key,count:null,label:definitions[key].label,next:key==='problem'?'최근 연결 시도가 실패했습니다. 연결 경로와 다음 관측을 확인하세요.':key==='sampled'?'서버 접속은 확인됐지만 계정 인증·자료 접근은 별도 확인이 필요합니다.':'표시된 시각의 연결 근거입니다. 수집·업무 성공과 구분합니다.'}};
}
