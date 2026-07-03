# B5-PROPOSAL-INBOX — 제안 수신함 v1 + 수신역할(to/cc) core_mail 배선

- status: done (2026-07-03, claude_fable-5 — ERP 표면 스레드)
- 근거 패킷: `_workmeta/system/reports/procedure_capture/20260703_erp_surface_landing_codex_followup_packet.yaml` 항목 05·06 (execution_owner: erp_surface_thread_claude)
- 설계 입력: 2026-07-02 표면 검토 verdict(4-1~4-4) + E8 이어받기 목록

## 목적 (1줄)

엔진(E1/E3/E8)이 만드는 제안·정리 산출물을 사람이 **보고, 이해하고(왜?), 1클릭으로 확정**하는
마지막 배선 — ai_proposal 신규 표면 없이 core_item(unclassified) 의미론 그대로.

## 구현 내용

### 항목 06 — 수신역할(to/cc)·메시지ID core_mail 배선
- `core_mail` ALTER 2종: `recipient_role`(to|cc|null), `provider_message_id`. 재스캔 시 COALESCE 백필(legacy 행은 원장에 값 생기면 자동 채움).
- `scan_mail_ledger.mjs` 가 원장 `수신역할`/`메일메시지ID` 컬럼 소비 → `ingestMail` 정규화(to|cc 만 유효) 후 저장.
- 메일 상세 패널: 받는사람/참조 배지(참조 메일 ≠ 직접 요청 구분 — 숙원).

### 항목 05 — 제안 수신함 (분류 필요 탭 승격)
- **id 공간 조인**: `promotedMailIds` 가 엔진 산출 `mailcsv:<이력키>` origin 을 core_mail id(`<코드>:<이력키>`)로
  이력키 suffix 조인 — 자동 인입 할일도 메일함에서 ✓ 승격 표시(100건 청크, 콜론 포함 이력키 안전).
- **근거 노출**: 분류 카드에 제안 출처 태그(규칙/메일함) + "왜 이 제안?" 접이식(route_reason/assignee_reason 첫 노출).
- **계정 resolve**: 추천담당을 스코프(이메일/표시명)와 대조 — 매칭 시 계정 표기로 pre-fill(승인 후 '내 할 일' 스코프 보장),
  미매칭 시 ⚠ 배지(그대로 확정 시 그 팀원 화면에 안 잡히는 함정 방지).
- **'내게 제안만' 렌즈**: 팀 공용 미분류함 위 개인 필터(#sugMineToggle, localStorage `dev_erp_sug_mine`).
- **1클릭 승인 = 검토 승인**: `confirmItem` 이 status=open 과 함께 `review_status='approved'` 기록 — needs_review 잔량이 소진 지표.
- **자동 정리 가시화**: `GET /api/mail/receipts`(read-only, 메타데이터만 — 사유 버킷/건수/최근시각) + 트리아지 상단
  "자동 정리됨: 스레드 귀속 N · 팀 사본 정리 M · 할일 아님 K" 노트 — "안 뜨는 메일 = 삭제 아님" 신뢰.
- **출처 인간화**: `mailcsv:`/코드 접두 숨김·이력키만 표시(클릭 → 통합검색 원 메일 점프), `thread-fallback:` 해시 → "추정 스레드".
- **이벤트 라벨**: mail_followup/auto_intake_run/followup_due/due_reminder/knowledge_feed_run/auth_login_failed 등록(원문 plumbing 노출 제거).

## 경계

- AI 쓰기=제안까지, 확정=사람 1클릭(P-4 키스톤) 불변. 영수증 API 는 read-only, 제목/본문/키 원문 미반환.
- ai_proposal public surface 신규 도입 없음(패킷 수용 기준). 자동 확정 없음.

## 검사 방법

- `node --test --test-concurrency=1 test/core.test.mjs` — "B-5 배선" 테스트(역할 정규화·백필 보존·mailcsv/콜론 이력키 조인).
- 전체 직렬 스위트 green.
- 실브라우저 검증(fixture, 2026-07-03): 트리아지 카드 렌더·내게제안만 토글 필터·메일 점프→통합검색·confirm→open+approved, 콘솔 에러 0, 영수증 API 빈 상태 안전.

## 남긴 것 (후속 후보)

- 콕핏 "받은일 제안 N건" 위젯(팀원 아침 진입점) — B-5 v2.
- store dedup(subject+at)의 Message-ID 우선 승격 → 👥 수신자 배지 정확화(provider_message_id 적재 후).
- E2 지식 후보 소비 표면(수신함 v2 탭), followup_due/due_reminder 아침 뷰(E4 후속과 결합).
