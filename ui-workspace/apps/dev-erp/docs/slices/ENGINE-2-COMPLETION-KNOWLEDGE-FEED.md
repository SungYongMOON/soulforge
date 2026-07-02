# ENGINE-2-COMPLETION-KNOWLEDGE-FEED — 완료 지식 자동 적재

- status: proposed / parallel_group: G-knowledge-feed / depends_on: 없음
- 규모 추정: 새 도구 ~150줄 + 테스트 ~90줄 (반나절)

## 목적 (1줄)

할일 완료 시 이미 생성되는 지식 힌트(completion_log.knowledge)를 사람이 옮기지 않아도
프로젝트 지식 후보 원장(knowledge_rag_candidate_ledger)에 **자동으로 흘려보낸다**
— "일을 할수록 지식 후보가 쌓이는" 유일한 자동 원천을 연결.

## 검증된 사실 (2026-07-02 실측)

1. completion_log 테이블 컬럼: id, item_id, title, assignee_ref, work_type, project_id,
   done_at, completed_by, completion_criteria, result, log_ref, **summary**(완료 요약, 원문 아님),
   **knowledge**(지식 후보 JSON), tokens (src/store.mjs 466~480행).
2. 지식 후보 원장 이벤트(JSONL) 필드 실측: schema_version, workflow_id,
   kind=knowledge_rag_candidate, created_at, project_code, candidate_kind
   (owner_decision_gap|manual_candidate|knowledge_trigger 관측), status(open|accepted_for_review),
   boundary(메타만/ payload·prompt·secret false), source_context_ref(_workmeta 내부 상대 경로).
   경로: `_workmeta/<code>/knowledge_rag_candidate_ledger/events/<YYYY-MM>.jsonl`
3. 원장 append 구현이 이미 존재: tools/haengbogwan_knowledge_candidates.mjs
   (runProjectContextKnowledgeCandidateUpdate — 중복 skip 카운트 반환). **새 포맷을 발명하지
   말고 이 모듈의 append/중복 규칙을 재사용하거나 동일 스키마로 맞출 것.**
4. 완료 루프(fruit→후속할일)는 no-op 이며 owner 결정 대기 — 이 패킷은 **지식 적재만** 하고
   할일을 만들지 않으므로 그 결정에 종속되지 않는다.

## 구현 전 확인

- [ ] haengbogwan_knowledge_candidates.mjs 의 이벤트 append 함수 시그니처와 중복 판정 키
      (파일 직접 읽기). 재사용 가능하면 import, 불가하면 같은 스키마로 로컬 구현.
- [ ] completion_log.knowledge 의 실제 JSON 형태 샘플 1건
      (`SELECT knowledge FROM completion_log WHERE knowledge IS NOT NULL LIMIT 1` —
      runtime DB 는 회사 PC 에 있으므로 합성 fixture 로 대체 가능. CHANGELOG 근거:
      "structured JSON candidate notes").
- [ ] 이미 내보낸 행 추적 방식: completion_log 에 export 표시 컬럼을 추가(ALTER try/catch 멱등,
      SLICES 공통 가드 ⑤)할지, 별도 커서 파일(data/ 하위)로 할지 — **권장: 커서 파일**
      (`data/completion_knowledge_cursor.json` = 마지막 처리 id). DB 스키마 불변이 더 안전.

## 설계

### 새 도구: tools/completion_knowledge_feed.mjs

```
입력: --db data/dev-erp.db, --workmeta <root>, --apply(기본 dry-run), --json, --limit N(기본 50)
알고리즘 (결정적, LLM 0%):
1. cursor = data/completion_knowledge_cursor.json 의 last_id (없으면 0)
2. SELECT id, item_id, project_id, done_at, work_type, summary, knowledge
   FROM completion_log WHERE id > ? AND knowledge IS NOT NULL AND knowledge != '' ORDER BY id LIMIT N
3. 행마다 지식 후보 이벤트 생성:
   { schema_version: (기존 원장과 동일 버전 사용 — 구현 전 확인 절),
     workflow_id: "completion_knowledge_feed_v0",
     kind: "knowledge_rag_candidate",
     created_at: now ISO,
     project_code: row.project_id,
     candidate_kind: "completion_knowledge",
     status: "open",
     boundary: { payload:false, prompt:false, secret:false },   // 기존 이벤트와 동일 형태로
     source_context_ref: `completion_log:${row.id}`,            // + item ref: core_item id
     item_ref: row.item_id,
     knowledge_hint: <knowledge JSON 을 요약 필드로 — 300자 캡, 원문 아님(이미 S6 산출 메타)> }
4. project_code 별로 _workmeta/<code>/knowledge_rag_candidate_ledger/events/<YYYY-MM>.jsonl append
   (프로젝트 폴더 없으면 skip + 사유 보고. project_id 없는 행은 _workmeta/system/... 로 보내지 말고
   skip + 보고 — 임의 라우팅 금지)
5. --apply 일 때만 append + cursor 갱신(원자적: temp+rename). dry-run 은 계획 출력.
6. event_log 기록: kind="knowledge_feed_run", data_label="meta", used_refs=["completion_log"]
```

### 트리거 배선 (선택 2안 — owner/Codex 가 택1, 기본 A)

- A(권장): tools/auto_intake_cycle.mjs 마지막 단계에 자식 실행 추가
  (env `DEV_ERP_INTAKE_COMPLETION_FEED=1` opt-in, 기본 off) — 기존 사이클에 편승.
- B: 서버 완료 훅(store.afterItemWrite 계열)에서 직접 — 서버 코드 수정 최소화 원칙상 비권장.

## 경계 가드

- knowledge/summary 는 S6 가 이미 만든 메타 텍스트다. **메일 본문·Codex 대화 원문을
  이 도구가 다시 읽지 않는다** (completion_log 만 읽음).
- _workmeta 에는 JSONL append 만. 기존 이벤트 파일 수정 금지.
- 멱등키: source_context_ref(completion_log:<id>) — 같은 id 재적재 금지(커서+append 전 중복검사).

## 검사 방법

### node:test (신규 test/completion_knowledge_feed.test.mjs)

1. `feed: knowledge 있는 완료행만 후보 이벤트로 변환` — :memory: store 에 completion_log 3행
   (knowledge 있음 2, 없음 1) 시드 → dry-run 계획 2건
2. `feed: apply 는 JSONL append + 커서 전진` — 임시 workmeta fixture, 파일 내용에
   candidate_kind=completion_knowledge, source_context_ref=completion_log:<id> 확인
3. `feed: 재실행 멱등` — 같은 상태에서 2회 apply → 두 번째 written 0
4. `feed: project 폴더 없으면 skip + 사유 보고` (원장 오염 0)
5. `feed: knowledge_hint 300자 캡, 원문 필드 부재` (boundary 필드 검사)

### 수동 verify

```
cd ui-workspace/apps/dev-erp
node --test test/completion_knowledge_feed.test.mjs
node tools/completion_knowledge_feed.mjs --db :memory:불가시 fixture DB --json     # dry-run
# 합성 DB 로: node server.mjs --db :memory: --fixture 기동 후 할일 완료 → feed 실행 → JSONL 확인
```

### 공통 검사 총칙 수행

## 완료 기준

- 합성 fixture 로 "완료(지식 힌트 포함) → 후보 원장 JSONL 1행" 이 재현되고 재실행 멱등.
- 기존 knowledge_rag_candidate 이벤트와 스키마 호환(같은 필드 셋) — 기존 소비 도구가 깨지지 않음.
- 직렬 전체 테스트 green + verify_gate L1 PASS.
