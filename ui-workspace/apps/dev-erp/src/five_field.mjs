// src/five_field.mjs — 완료 시점 "자동화 자산 5필드" 캡처의 순수 로직(테스트 가능, I/O 없음).
// 계약: _workmeta/system/dev_worker_candidate_queue/request_to_automation_ladder_v0.yaml (S1/S2)
//   입력   = completion_log.log_ref         소스 포인터 JSON 배열(원문 미복사 — 경로/id 만)
//   판단   = completion_log.knowledge       분류/결정 기준(LLM 초안)
//   출력   = completion_log.summary         무엇을 했고 결과가 무엇인가(LLM 초안)
//   검증   = completion_log.verification    성공/실패를 무엇으로 확인했나(근거 없으면 null)
//   중단   = completion_log.stop_conditions 다음부터 자동으로 하면 안 되는 경우 JSON 배열
//   집계키 = completion_log.request_kind    반복 감지 슬러그(2회=packet 후보, 3회=helper 후보)
// 원칙: 결정적 필드는 코드가 완료 즉시 기록, LLM 초안은 data_label='ai_draft' 로 직접 착지
// (승인 대기 큐 금지 — packet stop_condition). LLM 미가용이어도 완료 흐름을 막지 않는다(needs_backfill=1).

function clampStr(value, max) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : "";
}

// 입력 포인터 수집: 할일에 결합된 출처만(원문 내용 미복사). kind:value 문자열 배열.
export function composeInputRefs(item = {}, { threadId = null } = {}) {
  const refs = [];
  const push = (kind, value) => {
    const v = String(value ?? "").trim();
    if (v) refs.push(`${kind}:${v}`);
  };
  push("origin_mail", item.origin_mail_id);
  push("source_mail", item.source_mail_ref);
  push("source_thread", item.source_thread_ref);
  const linkKind = String(item.link_kind ?? "").trim();
  if (item.link_ref) push(linkKind || "link", item.link_ref);
  push("guide_artifact", item.guide_artifact_id);
  push("codex_thread", threadId);
  return refs;
}

// 입력 필드 인코딩: 사람이 지정한 log_ref 가 있으면 존중(덮지 않음), 없으면 포인터 JSON 배열.
export function encodeInputRefs(item = {}, opts = {}) {
  const manual = String(item.log_ref ?? "").trim();
  if (manual) return manual;
  const refs = composeInputRefs(item, opts);
  return refs.length ? JSON.stringify(refs) : null;
}

// 결정적 request_kind 베이스: "<업무유형>/<출처>" — LLM 이 더 세분화한 유효 슬러그를 주면 교체.
export function baseRequestKind(item = {}) {
  const wt = String(item.work_type ?? "").trim().toLowerCase() || "unknown";
  const origin = (String(item.origin_mail_id ?? "").trim() || String(item.source_mail_ref ?? "").trim())
    ? "mail"
    : (String(item.link_kind ?? "").trim().toLowerCase() || "manual");
  return `${wt}/${origin}`;
}

const REQUEST_KIND_RE = /^[a-z0-9][a-z0-9_\-./]{1,79}$/;

// 슬러그 정규화: 소문자·허용문자 검증. 무효면 fallback(결정적 베이스) 유지.
export function normalizeRequestKind(candidate, fallback = null) {
  const s = String(candidate ?? "").trim().toLowerCase();
  return REQUEST_KIND_RE.test(s) ? s : (fallback ?? null);
}

// LLM 응답 클램프: 필드별 길이·형태 보정(없는 필드는 빈 값 — 지어내지 않는 쪽으로 소거).
export function clampFiveFieldDigest(parsed = {}) {
  return {
    summary: clampStr(parsed.summary, 1000),
    next_actions: (Array.isArray(parsed.next_actions) ? parsed.next_actions : [])
      .map((s) => clampStr(s, 200)).filter(Boolean).slice(0, 3),
    knowledge: clampStr(parsed.knowledge, 500),
    verification: clampStr(parsed.verification, 300),
    stop_conditions: (Array.isArray(parsed.stop_conditions) ? parsed.stop_conditions : [])
      .map((s) => clampStr(s, 200)).filter(Boolean).slice(0, 3),
    request_kind: normalizeRequestKind(parsed.request_kind, "") || "",
  };
}
