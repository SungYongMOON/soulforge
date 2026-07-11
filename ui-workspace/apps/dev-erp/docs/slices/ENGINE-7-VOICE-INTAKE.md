# ENGINE-7-VOICE-INTAKE — 음성 보관함 → 할일 합류

- status: accepted-manifest consumer implemented (2026-07-11, K-3=(a) owner 승인); automatic project matcher and owner-acceptance mutator pending / parallel_group: G-voice / depends_on: E1 권장
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

## owner 결정 K-3 (2026-07-11 승인)

음성 할일의 원장 표면 택1:
- (a) 할일_장부.csv 에 합류하되 할일키 네임스페이스 `voicetask:<세션ID>` 신설
  — 장점: ERP autosync 재사용. 단점: 원장 스키마 정본(Codex 소유) 조율 필요.
- (b) 별도 `음성_할일_장부.csv` — 장점: 기존 계약 불변. 단점: autosync/화면 배선 추가.
- 결정: **(a)**. 기존 `할일_장부.csv`에 `voicetask:<recording_id>`로 합류한다.
  recording-library manifest의 `accepted_project_route`만 route authority로 인정하며,
  책임자·확정시각·확정 프로젝트와 상대 `source_event_draft_ref`가 모두 있어야 한다.

## 구현 전 확인

- [x] (확인완료 2026-07-02) source_event_draft 메타 필드: `source_title`(세션명, 402행)·
      `captured_at`(403행)이 있고 **요약 필드는 없다**. transcript 는 본문이 아니라 참조만
      (`transcript_ref`/`transcript_txt_ref`, 408행 부근) — 분류 입력의 subject 는 source_title 을
      사상하고, 요약이 필요하면 별도 메타 생성 단계를 이 패킷 범위에서 설계할 것(본문 접근 금지).
- [x] (확인완료 2026-07-02) autosync importTaskLedgerFile(src/autosync.mjs 133~177행)에 할일키
      접두 검증 로직 없음 — 할일키를 core_item id 로 그대로 사용하므로 `voicetask:` 접두 자동
      지원. 별도 변경 불필요. → K-3 제안 (a)의 기술 전제 충족.
- [ ] 프로젝트 라우팅: draft 의 project_route_state 가 unclassified 일 때 후보를 어느 과제
      원장에 쓸지 — 라우터 바인딩(mail_project_router.yaml) 키워드 재사용 가능성.

## 설계 (K-3=(a) 가정)

```
새 도구 `tools/voice_to_task_candidates.mjs` (dry-run 기본):
1. 호출자가 지정한 `--recording-manifest` 1개와 `--task-ledger` 1개만 읽는다. 디렉터리 스캔과 재귀는 없다.
2. manifest의 `route_state.route_status=accepted_project_route`와
   `accepted_project_code`/`accepted_by`/`accepted_at`를 모두 요구한다.
3. `payload_refs.source_event_draft_ref`는 안전한 상대 ref인지 확인만 하고 파일을 열지 않는다.
   audio/transcript/session ref는 읽지도 복사하지도 않는다.
4. 미확정·후보 route는 `review_required`, 기록 0건으로 보고한다. 프로젝트 후보는 안전한
   코드일 때 기존 manifest metadata를 `route_suggestion`으로 반영할 뿐 새 후보를 계산하거나 자동 수락하지 않는다.
5. 수락 route는 `voicetask:<recording_id>` 1행을 `unclassified` + `needs_review`로 원자 추가한다.
   기존 알 수 없는 헤더와 다른 행을 보존하고, 같은 행 재실행은 0건, 내용 충돌은 덮어쓰지 않는다.
6. 출처는 `voice`, 소스계보는 `voicedraft:<상대 source_event_draft_ref>`다. semantic block splitting은 하지 않는다.

이 slice가 구현한 것은 이미 책임자가 수락한 recording manifest의 소비 단계뿐이다.
자동 프로젝트 matcher와 `accepted_project_route`/수락자/수락시각을 기록하는 owner-acceptance mutator는 후속 범위다.
```

## 경계 가드

- raw audio/transcript 본문 미접근 — draft 의 메타 필드만. 위반 시 이 패킷 전체 무효.
- 음성 draft 의 owner 확인 대기 상태를 자동으로 승격하지 않는다(3항).
- 세션 파일 수정 금지(읽기 전용) — 커서는 dev-erp data/ 에만.

## 검사 방법

### node:test (신규 test/voice_to_task_candidates.test.mjs)

1. 미확정·후보 route는 기록 0건 + metadata-only 제안만 반환
2. 불완전한 수락 메타데이터·절대 source event ref는 기록 0건
3. dry-run은 수락 route 1행을 계획하되 파일을 만들지 않음
4. apply는 기존 알 수 없는 헤더·다른 행을 보존하고 `voice`/`needs_review` 1행만 추가
5. 같은 recording 재실행은 신규 0건, unsafe header는 쓰기 전 중단
6. audio/transcript ref는 원장에 복사되지 않음
7. dev-ERP가 `voice` 출처를 보존하고 anchor 없는 음성 인입을 `unclassified`로 격리

### 수동 verify

```
node tools/voice_to_task_candidates.mjs \
  --recording-manifest <recording_manifest.json> \
  --task-ledger <할일_장부.csv> --json
node tools/voice_to_task_candidates.mjs \
  --recording-manifest <recording_manifest.json> \
  --task-ledger <할일_장부.csv> --apply --json
npm run validate:voice-intake
# ERP 화면: 할일 목록에 voice 출처 행 표시 확인 (브라우저 QA 절차 문서 절차대로)
```

### 공통 검사 총칙 수행

## 완료 기준

- 합성 draft 1건이 "음성 → 할일(needs_review)" 로 ERP 에 뜨고, 원본 세션 파일은 불변.
- 라우트 미확정 세션이 자동 승격되지 않음이 테스트로 고정.
- 직렬 전체 테스트 green + verify_gate L1 PASS (+ K-3 결정 기록이 이 파일에 갱신됨).
