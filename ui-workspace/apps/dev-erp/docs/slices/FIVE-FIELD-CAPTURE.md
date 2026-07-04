# FIVE-FIELD-CAPTURE — 완료 시점 자동화 자산 5필드 자동 캡처 v1

- 계약 출처: `_workmeta/system/dev_worker_candidate_queue/request_to_automation_ladder_v0.yaml` (S1/S2)
- 배경: owner의 request-to-automation ladder(2026-07-04 확정) — "모든 요청을 1회성으로 처리하되,
  끝날 때 입력/판단/출력/검증/중단조건 5개를 남긴다. 이 5개가 안 남으면 자동화로 자라지 않는다."
  기록 주체는 사람이 아니라 AI/훅(수동 기록면은 채워지지 않는다는 assignee_memory 0행 교훈).

## 필드 매핑 (completion_log)

| 5필드 | 컬럼 | 작성자 | 시점 |
|---|---|---|---|
| 입력 | `log_ref` (소스 포인터 JSON 배열) | 코드(결정적) | 완료 즉시 |
| 판단 | `knowledge` | LLM 초안 | 완료 훅(비동기) |
| 출력 | `summary` | LLM 초안 | 완료 훅(비동기) |
| 검증 | `verification` (신규) | LLM 초안(로그 근거 있을 때만) | 완료 훅(비동기) |
| 중단조건 | `stop_conditions` (신규, JSON 배열) | LLM 초안 | 완료 훅(비동기) |
| 집계키 | `request_kind` (신규, 예: `review/mail`) | 코드 베이스 → LLM 세분화 | 완료 즉시 → 훅 |

보조 컬럼: `data_label`('ai_draft'=LLM 초안 착지), `needs_backfill`(1=LLM 절반 미기록 — 소급 대상).

## 흐름

1. 완료(status→done) 시 `logCompletion`이 결정적 절반을 즉시 기록: 입력 포인터(origin_mail/source_mail/link/guide/codex_thread — 원문 미복사, id/경로만. 수동 `log_ref` 있으면 존중), `request_kind` 베이스(`업무유형/출처`), `needs_backfill=1`.
2. 완료 훅(서버 비동기)이 Codex 스레드가 있으면 `summarizeCompletion`(ollama)으로 5필드 초안 생성 → `updateCompletionLog`로 `data_label='ai_draft'` 직접 착지, `needs_backfill=0`. **승인 대기 큐 금지**(packet stop_condition) — ai_proposal(completion_digest)은 기존대로 B-5 표시용으로만 병행 생성(payload에 3필드 동봉).
3. 스레드 없음 → `five_field_partial` 이벤트(to=no_thread), LLM 미가용 → 기존 `completion_hook_skipped`. 어느 쪽도 완료를 막지 않는다.
4. `backfillCompletionLog`(과거 done 소급)도 결정적 절반을 채운다. 검증·중단조건은 소급 불가(완료 시점 캡처만 가능) — `needs_backfill=1`로 표시.

## 소비자 (후속 슬라이스)

- 반복 감지: `request_kind` GROUP BY → "2회=packet 후보, 3회=helper 후보" 주간 리포트(packet S4, `dev_erp_ax_work_event_analyzer_loop_v0` 첫 소비자).
- 지식 되먹임: 승인 no-op 해제(store approveProposal completion_digest 분기 → assignee_memory/core_knowledge 실기록) 슬라이스 B.

## 검증

- `test/five_field_capture.test.mjs` (FIVE-FIELD-001, 8건): 포인터 수집·수동 log_ref 존중·빈 입력 null, 결정적 베이스 슬러그, 무효 슬러그 거부, LLM 클램프(근거 없는 필드 소거), 완료 즉시 착지, ai_draft 착지+베이스 보존, 소급 결정적 절반, 마이그레이션 멱등.
- 전체 직렬 스위트 + 커밋 전 적대 리뷰(3렌즈) 통과 후 병합.
