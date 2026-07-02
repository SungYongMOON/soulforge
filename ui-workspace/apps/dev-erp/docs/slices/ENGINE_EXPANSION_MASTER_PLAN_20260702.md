# 할일 엔진 확장 마스터 플랜 (2026-07-02, claude_fable-5 작성)

- 목적: "여러 입력(메일·완료·음성·SE)이 맥락과 근거를 아는 판단을 거쳐 할일이 되고,
  일과 완료에서 지식·후속 할일이 자동으로 태어나는" 순환을 완성한다.
- 실행 주체: **Codex(또는 어느 LLM이든)가 패킷 단위 cold-start 구현 가능**하도록 작성.
  각 패킷은 `docs/slices/ENGINE-*.md`. 이 문서는 순서·의존성·공통 가드·공통 검사만 소유.
- 정직성 원칙: 각 패킷의 "검증된 사실"은 2026-07-02 실측(파일 경로 포함).
  실측하지 않은 것은 "구현 전 확인" 절에 명시했다 — **확인 없이 사실로 취급 금지**.

## 완성형 루프 (북극성)

```
입력(메일 ✅자동 · 음성 E7 · 회의 E7후속 · SE일정 ✅기존)
   → 판단(메타분류 ✅ + 줄기맥락 ✅ + 근거조회 E5 + 역량제안 E3 + 스레드인지 E1)
   → 할일(ledger→core_item ✅자동)
   → 일함 → 완료
   → 지식후보 자동적재 E2 → 승인 1클릭 → 인덱스/위키 자동 E6
   → 후속할일 후보 (완료루프 — owner 결정 대기, KNOWLEDGE_ASSISTANT_ACTIVATION_PLAN_V0)
   → 팔로업/SLA E4
```

## 슬라이스 목록 · 순서 · 의존성

| id | 이름 | 가치 | 난도 | depends_on | parallel_group |
| --- | --- | --- | --- | --- | --- |
| E1 | ENGINE-1-THREAD-DEDUP | 중복 할일 방지(스레드 인지) | 하 | 없음 | G-intake-cycle |
| E2 | ENGINE-2-COMPLETION-KNOWLEDGE-FEED | 완료→지식 후보 자동 | 하 | 없음 | G-knowledge-feed |
| E3 | ENGINE-3-CAPABILITY-ASSIGN | 역량 기반 담당 제안 | 하 | 없음 | G-intake-cycle |
| E4 | ENGINE-4-FOLLOWUP-SLA | 무응답/기한 팔로업 자동 | 중 | E1(스레드 유틸 재사용) | G-intake-cycle |
| E5 | ENGINE-5-RAG-GROUNDED-JUDGE | 판단에 근거 조회 부착 | 중 | 없음(v1) | G-llm-adapter |
| E6 | ENGINE-6-KNOWLEDGE-PIPELINE-AUTOMATION | 승인 후 인덱스/위키 자동 + 주간 트리아지 | 중 | 없음 | G-guildhall-rag (Codex 소유 표면) |
| E7 | ENGINE-7-VOICE-INTAKE | 음성 보관함 → 할일 합류 | 상 | E1 권장 | G-voice |

- **권장 착수 순서**: E1 → E2 → E3 (전부 기존 필드 배선, 각 반나절 규모) → E5(v1) → E4 → E6 → E7.
- 같은 parallel_group 은 같은 파일(`tools/auto_intake_cycle.mjs`, `tools/mail_to_task_pending.mjs`)을
  만지므로 **한 작업자 직렬**. 다른 그룹은 병렬 가능.

## 공통 가드 (모든 패킷 필수 — SLICES_INDEX 공통 가드 블록 승계)

1. zero-dependency: `node:*` 표준 모듈만. 새 npm 0.
2. 코어 LLM 0%: LLM 산출은 후보/제안까지만. 도메인 확정 쓰기는 결정적 엔진(ledger/store)과
   사람 승인 정책(--auto-open, ai_proposal)만 한다.
3. metadata-only: 메일 본문·첨부·음성 원문·secret 을 읽지도 출력하지도 않는다.
   본문이 필요한 설계는 행보관 reading 레인(별도 private packet 경계)으로만.
4. dry-run 기본, `--apply` 게이트. 절대경로를 CSV/ref 에 쓰지 않는다.
5. 멱등: 재실행이 중복 행/중복 이벤트를 만들지 않아야 한다(멱등키 명시).
6. event_log 라벨링: 쓰기 이벤트는 used_refs[] + data_label 부착.
7. 운영 활성화(env/스케줄)는 Codex/owner 몫 — 코드 기본값은 전부 OFF/안전측.

## 공통 검사 총칙

모든 패킷 완료 보고 전:

```
cd ui-workspace/apps/dev-erp
node --test --test-concurrency=1 <기존 전체 테스트 목록 + 신규 테스트>   # 직렬 전건 green
node tools/verify_gate.mjs --level 1 --packet <workmeta packet 경로>
cd ../../.. ; npm.cmd run validate                                      # 루트 경계 검증
```

- 알려진 플레이크: 전체 스위트 **병렬** 실행 시 서버 스폰 통합테스트(core knowledge shell,
  AX hook, codex bridge cleanup)가 간헐 타임아웃. **직렬(--test-concurrency=1)이 판정 기준.**
- 커밋 메시지에 작업자·모델 표기, 슬라이스당 commit+push.

## 2026-07-02 기준 검증된 기반 사실 (패킷들이 공통 참조)

- 메일_이력.csv 21컬럼(헤더 실측): 이력키·스키마버전·발생시각·프로젝트코드·단계·몬스터ID·후보ID·
  **이벤트유형**·메일소스ID·메일수신시각·메일함·**스레드**·제목·발신자·첨부수·작업상태·
  게이트웨이몬스터참조·프로젝트몬스터참조·파일링패킷참조·미션참조·원문복사여부
- 할일_장부: 기본 21 + 자동화 24컬럼. candidates 가 `required_role`/`required_capability`/
  `suggested_assignee_ref`/`source_thread_ref` 를 주면 ledger 가 해당 컬럼에 기록
  (tools/mail_to_task_ledger.mjs toRow, 258~288행 실측).
- completion_log 테이블에 `summary`, `knowledge`(지식 후보 JSON), `item_id`, `project_id`,
  `done_at`, `work_type` 컬럼 존재 (src/store.mjs 466~480행 실측).
- 처분 영수증 공용 작성기: tools/mail_receipts.mjs (disposition reference_only|no_action 이
  pending 재판단에서 제외됨 — tools/mail_to_task_pending.mjs readHandledReceiptKeys).
- 자동 인입 사이클: tools/auto_intake_cycle.mjs (수집 훅 DEV_ERP_AUTO_INTAKE, 분류
  src/llm.mjs classifyMailForTasks, 줄기맥락 buildProjectContextLines, not_task 영수증).
- 프로젝트별 브랜치/역할 규칙: `_workmeta/<code>/rules/haengbogwan_context_hint_rules.json`
  (schema haengbogwan.context_hint_rules.v1; 필드: event_keywords, target_object, priority,
  work_types, required_role, required_capability, suggested_assignee_ref). 로더:
  tools/haengbogwan_run.mjs loadContextHintRules (branch/priority/keywords 만 반환 — E3 에서 확장).
- RAG 인덱스 메타: `_workspaces/knowledge/rag/indexes_local/source_text_indexes/<id>/source_text_index.json`
  상위 필드 실측: schema_version, kind, index_id, status, source_card_ref, source_id,
  derived_text_ref, docling_json_ref, source_card_summary, title, domains, sensitivity,
  approval_status, claim_ceiling, boundary. (P26-014 인덱스 3개 status=ready)
- 지식 후보 원장: `_workmeta/<code>/knowledge_rag_candidate_ledger/events/<YYYY-MM>.jsonl`
  (필드: schema_version, workflow_id, kind=knowledge_rag_candidate, created_at, project_code,
  candidate_kind, status(open|accepted_for_review), boundary, source_context_ref)
- 음성: guild_hall/voice_capture 가 세션마다 source_event_draft.yaml 을 쓰고
  `project_route_state: unclassified_needs_owner_confirmation`, 후속 단계로
  `draft_task_candidate_generation` 선언, `task_candidate_register.yaml` 경로 골격 존재
  (voice_capture.mjs 331·404·416·859·1124행 실측). 할일 생성 코드는 아직 없음.
- 완료 루프(fruit)는 no-op: store.mjs approveProposal completion_digest 빈 동작,
  활성화 계획 = docs/architecture/guild_hall/KNOWLEDGE_ASSISTANT_ACTIVATION_PLAN_V0.md
  (owner 결정 D-1~D-5 대기). **이 플랜은 그 결정을 대체하지 않는다.**

## owner 결정 대기 항목 (패킷 진행을 막지 않지만 명시)

| # | 결정 | 막히는 것 |
| --- | --- | --- |
| K-1 | 완료 루프(③b) 활성화 (ACTIVATION_PLAN D-1~D-5) | 완료→후속할일 자동 후보 (E2 는 지식 적재만이라 무관) |
| K-2 | E4 팔로업 기본 정책(무응답 판정 N일, 대상 메일함) | E4 의 기본값 — 패킷은 보수 기본값 제안 포함 |
| K-3 | E7 음성 할일 원장 표면(별도 장부 vs 할일_장부 합류) | E7 착수 |
| K-4 | P24-049 소스카드 3장 승인(요구사양서·작업기술서) | E5 의 LIG SAS 적용 범위 |
