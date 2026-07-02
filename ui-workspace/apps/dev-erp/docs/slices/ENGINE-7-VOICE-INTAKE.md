# ENGINE-7-VOICE-INTAKE — 음성 보관함 → 할일 합류

- status: proposed (owner 결정 K-3 선행) / parallel_group: G-voice / depends_on: E1 권장
- 규모 추정: 1~2일 (경계 설계 포함)

## 목적 (1줄)

음성 메모가 보관함 등록에서 멈추지 않고, 메일과 같은 판단 파이프라인을 거쳐
할일 후보가 되게 한다 — "여러 입력" 확장의 첫 비-메일 레인.

## 검증된 사실 (2026-07-02 실측)

1. guild_hall/voice_capture 는 세션마다 `source_event_draft.yaml` 을 쓰고
   (voice_capture.mjs 331·385행), `project_route_state: unclassified_needs_owner_confirmation`
   (404·1073행), 후속 단계로 `draft_task_candidate_generation` 을 선언(416행),
   `task_candidate_register.yaml` 경로 골격 존재(859행, `task_candidates: []` 1124행).
   **즉 설계 의도는 파일에 이미 있고 생성 코드만 없다.**
2. raw audio/transcript 는 metadata-only 정책으로 draft 에 미포함(모듈 헤더 정책).
3. 메일 레인의 분류 어댑터(classifyMailForTasks)는 항목 형태
   {history_key, subject, from, received_at, mailbox, due_hint} 를 받는다 — 음성 항목을
   이 형태로 사상(mapping)하면 재사용 가능.
4. mail_to_task_ledger 는 메일_이력.csv 존재를 전제(120행 exit 2)하고 mailtask: 키공간을
   사용 — **음성 후보를 이 도구로 흘릴 수 없다**(별도 표면 필요, K-3).

## owner 결정 K-3 (착수 게이트)

음성 할일의 원장 표면 택1:
- (a) 할일_장부.csv 에 합류하되 할일키 네임스페이스 `voicetask:<세션ID>` 신설
  — 장점: ERP autosync 재사용. 단점: 원장 스키마 정본(Codex 소유) 조율 필요.
- (b) 별도 `음성_할일_장부.csv` — 장점: 기존 계약 불변. 단점: autosync/화면 배선 추가.
- 제안 기본: **(a)**, autosync 의 신규 행 import 가 할일키 접두에 무관한지 확인 후.

## 구현 전 확인

- [ ] source_event_draft.yaml 의 실제 필드 전체(제목 유사 필드, 발화 요약이 메타로 존재하는지 —
      transcript 본문이면 사용 금지, 메타 요약 필드만).
      확인: guild_hall/voice_capture/voice_capture.mjs renderSourceEventDraft().
- [ ] autosync importTaskLedgerFile 이 할일키 접두(mailtask 외)에 의존하는 로직이 있는지
      (src/autosync.mjs — 이력키 파싱이 아니라 행 단위 import 면 무관).
- [ ] 프로젝트 라우팅: draft 의 project_route_state 가 unclassified 일 때 후보를 어느 과제
      원장에 쓸지 — 라우터 바인딩(mail_project_router.yaml) 키워드 재사용 가능성.

## 설계 (K-3=(a) 가정)

```
새 도구 tools/voice_to_task_candidates.mjs (dry-run 기본):
1. _workspaces/system/voice_capture/library/ 의 세션 draft 스캔
   (⚠️ 이 정확한 경로만, 광역 재귀 금지)
2. 미처리 세션(커서 파일 data/voice_intake_cursor.json) 중 project_route 확정된 것만:
   - 항목 사상: { history_key: `voice:<세션ID>`, subject: <draft 제목/요약 메타>,
     from: <화자/기록자 메타>, received_at: <세션 시각>, mailbox: "", due_hint: <있으면> }
   - classifyMailForTasks 재사용(provider 정책 동일) 또는 provider none 시 skeleton-review 후보
3. project_route 미확정 세션은 후보 생성 대신 트리아지 라인으로 보고(owner 확인 대기 유지 —
   기존 unclassified_needs_owner_confirmation 계약 존중)
4. 후보 → 할일_장부 기록: 전용 라이터(voicetask: 키, 멱등 머지 규칙은 mail_to_task_ledger 와
   동일 패턴 — 원자 쓰기/헤더 보존/충돌 보호 재사용을 위해 공용 함수 추출 검토)
5. 출처 컬럼: 출처="voice", 관련메일이력키 대신 소스계보에 `voicedraft:<세션경로 상대ref>`
```

## 경계 가드

- raw audio/transcript 본문 미접근 — draft 의 메타 필드만. 위반 시 이 패킷 전체 무효.
- 음성 draft 의 owner 확인 대기 상태를 자동으로 승격하지 않는다(3항).
- 세션 파일 수정 금지(읽기 전용) — 커서는 dev-erp data/ 에만.

## 검사 방법

### node:test (신규 test/voice_to_task_candidates.test.mjs)

1. `사상: draft 메타 → 분류 입력 형태` (fixture draft yaml)
2. `라우트 미확정 세션은 후보 0 + 보고 라인`
3. `voicetask: 멱등 — 같은 세션 재실행 신규 0`
4. `원장 행: 출처=voice, 소스계보=voicedraft:..., 본문 필드 부재`
5. `autosync 가 voicetask 행을 core_item 으로 import` (:memory: store 통합)

### 수동 verify

```
node tools/voice_to_task_candidates.mjs --json           # dry-run
node tools/voice_to_task_candidates.mjs --apply --json
# ERP 화면: 할일 목록에 voice 출처 행 표시 확인 (브라우저 QA 절차 문서 절차대로)
```

### 공통 검사 총칙 수행

## 완료 기준

- 합성 draft 1건이 "음성 → 할일(needs_review)" 로 ERP 에 뜨고, 원본 세션 파일은 불변.
- 라우트 미확정 세션이 자동 승격되지 않음이 테스트로 고정.
- 직렬 전체 테스트 green + verify_gate L1 PASS (+ K-3 결정 기록이 이 파일에 갱신됨).
