# ENGINE-5-RAG-GROUNDED-JUDGE — 판단에 근거(RAG) 연결

- status: done 2026-07-02 / parallel_group: G-llm-adapter / depends_on: 없음(v1)
- 규모 추정: v1 코드 ~120줄 + 테스트 ~70줄 (1일) / v2 는 별도 패킷으로 분리 권장

## 목적 (1줄)

할일 판단·완료기준 작성이 프로젝트의 승인된 지식(소스카드/인덱스)을 참조하게 하고,
어떤 근거를 썼는지 used_refs 로 남긴다 — "지식이 쓰이기 시작해야 쌓인다".

## 검증된 사실 (2026-07-02 실측)

1. 인덱스 메타 실측 필드: schema_version, kind, index_id, status(=ready), source_card_ref,
   source_id, source_ref, derived_text_ref, docling_json_ref, source_card_summary, title,
   domains, sensitivity, approval_status, claim_ceiling, boundary.
   경로: `_workspaces/knowledge/rag/indexes_local/source_text_indexes/<id>/source_text_index.json`
   — P26-014 용 3개 ready (req_spec OCR / sw_internal_rollup / work_statement OCR).
2. 소스카드 3장 실측: `_workspaces/knowledge/projects/P26-014/source_cards/*.source_card.json`,
   approval_status 승인됨, rag_permissions(source_text_retrieval/index_build/answer_synthesis)=true,
   scope="project:P26-014:this_source_only".
3. dev-erp 는 현재 어느 코드도 이 인덱스를 읽지 않는다 (src/llm.mjs·chat_pipeline.mjs·
   knowledge_registry.mjs grep 무결과 — 2026-07-02 조사).
4. guild_hall/rag CLI 에 source-text-answer-run 등 retrieval/answer 명령 존재(README) —
   본문 접근 authority 는 그쪽 레인.
5. dev-erp 경계: 코어는 본문 미저장·메일 본문 예외 1곳뿐(DESIGN 6절). **인덱스 청크 본문을
   dev-erp 판단 프롬프트에 넣는 것은 새로운 본문 접근 표면**이므로 v1 에서 하지 않는다.
6. 분류 어댑터는 projectContext(문자열 라인) 주입을 이미 지원(classifyMailForTasks).

## 단계 분리 (경계 때문에 2단계 — 정직한 범위)

### v1 (이 패킷): 메타 수준 근거 연결 — 본문 0

```
새 순수 모듈 tools/knowledge_grounding.mjs:
1. listProjectKnowledgeRefs(projectCode, { includeCommon = false }):
   _workspaces/knowledge/rag/indexes_local/source_text_indexes/*/source_text_index.json 을 스캔.
   ⚠️ 정정(검증 반영): source_card_ref 경로 형식이 **두 종류** 실존한다 —
   프로젝트 스코프 `_workspaces/knowledge/projects/<code>/source_cards/...`(P26-014 3종)와
   공용 표준 `_workspaces/knowledge/source_cards/...`(AQAP/방사청 등 다수, projects/ 미포함).
   판정: 경로에 `projects/<code>/` 포함 = 프로젝트 전용 / 미포함 = 공용 표준.
   v1 기본은 프로젝트 전용만, includeCommon=true(env DEV_ERP_INTAKE_KNOWLEDGE_COMMON=1)면
   공용 표준도 포함 — 포함 범위는 owner 정책(공용 표준까지 넣으면 라인 수 급증 주의).
   status=ready + approval_status 승인 계열만
   → [{ index_id, title, domains, source_card_ref, source_card_summary(200자 캡), scope: project|common }]
   ⚠️ _workspaces 접근: 정확한 이 경로만. 광역 재귀 금지(깨진 정션 방어).
   파일 없음/정션 미가용 → 빈 배열(standalone PC 안전).
2. 분류 주입: auto_intake_cycle 의 projectContext 라인에
   "승인된 지식: <title> (<domains>)" 라인 추가(기존 900자 캡 안에서).
3. 후보 부착: 제목 키워드 ∩ (title+domains+summary) 토큰 매칭되는 인덱스가 있으면
   candidates.next_action 에 "근거 확인: <index_id>" 를 제안하고
   산출물참조가 아닌 **비고/다음액션 텍스트로만** (컬럼 계약 불변).
4. 사용 기록: 매칭 발생 시 event_log used_refs 에 `knowledge:<index_id>` 추가
   (auto_intake_run 이벤트의 used_refs 확장) → 지식 사용 빈도 데이터의 시작.
```

### v2 (별도 패킷으로 작성할 것 — 여기선 범위만 고정)

- 청크 본문 기반 완료기준 초안: 행보관 **reading 레인**(haengbogwan_reading_*)의
  private packet 경계 안에서만. derived_text_ref 를 읽고 출력은 redact.
- guild_hall/rag source-text-answer-run 를 자식 프로세스로 위임하는 방안 우선 검토
  (본문 접근 authority 를 dev-erp 로 새로 만들지 않기 위해). Codex(guild_hall 소유)와 조율.

## 구현 전 확인

- [x] 인덱스 JSON 에 프로젝트 코드가 source_card_ref 외 다른 필드로도 있는지(더 안정적 키가
      있으면 그걸 사용). 확인: 인덱스 JSON 상위 40줄.
      - 2026-07-02 Codex 실측 정정: `project_code`/`project_id` 필드는 인덱스 root 또는
        `source_card_summary` 에 없다. 안정 키는 `source_refs.source_card_ref` 의
        `_workspaces/knowledge/projects/P26-014/source_cards/...` 경로다.
      - 2026-07-02 Codex 실측 정정: 인덱스 필드는 root flat 이 아니라
        `source_refs.source_card_ref`, `source_card_summary.title/domains/approval_status`
        형태다.
      - 2026-07-02 Codex 설계 반영: P26-014 3종의 approval token 은
        `owner_requested_p26_014_project_scoped_rag_20260617` 이며
        `rag_permissions.*=true` 다. v1 은 이 token 을 해당 프로젝트 전용 eligible ref 로만
        인정하고, 공용 ref 는 `approved`/`owner_approved`/`승인` 계열만 인정한다.
- [x] knowledge_access ledger(guild_hall) 사용 이벤트 계약 — 검증 결과 guild_hall/knowledge_access
      README 의 candidate-ledger/ingest-receipt 명령은 metadata-only 기록만 다루고 used_refs
      양식은 문서에 미명시. 확인 경로: guild_hall/knowledge_access/README.md 전문 +
      guild_hall/rag 의 answer-run 이 남기는 기록 형식. 중복 장부 회피 정책 택1을 Codex 와 조율:
      (a) dev-erp event_log 만 쓰고 guild_hall 은 롤업만 / (b) guild_hall ledger 로 통일하고
      dev-erp 는 그 경로만 읽음.
      - 2026-07-02 Codex + fresh explorer 실측: guild_hall knowledge_access 는 명시 ledger
        target(`--ledger-root`/`--ledger-file`)이 필요한 별도 metadata-only 장부이고,
        guild_hall/rag answer-run shape 은 dev-erp 식 `used_refs`/`event_log` 가 아니라
        `source_refs`/fingerprint/boundary/citation metadata 를 남긴다.
      - v1 정책 선택: (a) dev-erp `auto_intake_run.used_refs` 만 쓴다. guild_hall 롤업/브리지는
        stable idempotency 와 `knowledge:<index_id>` mapping 이 있는 별도 slice 로 둔다.

## 경계 가드

- v1 은 인덱스 **메타 JSON 필드만** 읽는다. derived_text/docling/청크 본문 접근 금지
  (테스트로 고정: 모듈이 여는 파일명 allowlist).
- sensitivity/claim_ceiling 필드를 라인에 함께 표기하지 않아도 되나, approval_status 가
  승인 계열이 아닌 인덱스는 제외한다.
- _workspaces 미마운트 PC 에서 조용히 빈 결과(에러로 사이클 중단 금지).

## 검사 방법

### node:test (신규 test/knowledge_grounding.test.mjs)

1. `refs: fixture 인덱스 3개 중 해당 프로젝트+ready 만 반환` (임시 디렉토리 fixture)
2. `refs: 미승인/비ready/타 프로젝트 제외`
3. `refs: 경로 미존재 → 빈 배열(예외 0)`
4. `grounding: 제목 토큰 매칭 시 next_action 제안 + used_refs 에 knowledge:<id>`
5. `boundary: 모듈이 source_text_index.json 외 파일을 열지 않음` (fs 스파이/주입)
6. cycle 통합: projectContext 에 "승인된 지식:" 라인 포함(주입 generate 스파이로 프롬프트 확인)

### 수동 verify

```
node tools/auto_intake_cycle.mjs --project P26-014 --json    # dry-run: knowledge refs 카운트 표시
# 프롬프트 확인은 테스트의 generate 스파이로 대체(운영 LLM 불요)
```

### 공통 검사 총칙 수행

## 완료 기준

- P26-014 fixture 에서 "요구사양" 포함 제목 메일의 후보에 근거 제안(next_action)과
  used_refs(knowledge:...)가 붙는다.
- 본문 파일을 여는 코드 경로가 없음이 테스트로 고정된다.
- 직렬 전체 테스트 green + verify_gate L1 PASS.

## 완료 기록 (2026-07-02 Codex)

- 구현:
  - `tools/knowledge_grounding.mjs` 추가: nested `source_text_index.json` 메타만 읽고
    project/common ref 를 분리한다.
  - `auto_intake_cycle` projectContext 에 승인된 지식 라인을 주입하고, 후보 `next_action` 및
    후보/`auto_intake_run.used_refs` 에 `knowledge:<index_id>` 를 붙인다.
  - `DEV_ERP_INTAKE_KNOWLEDGE_COMMON=1` 이 켜진 경우에만 공용 표준 ref 를 포함한다.
- 검증:
  - `node --test --test-concurrency=1 test/knowledge_grounding.test.mjs test/auto_intake_cycle.test.mjs`
    PASS (35/35).
  - `node tools/auto_intake_cycle.mjs --project P26-014 --json` PASS, dry-run,
    `knowledge_grounding.refs=3`.
  - 전체 직렬 테스트 PASS (384/384).
  - `node tools/verify_gate.mjs --level 1 --packet C:\Soulforge\_workmeta\P26-014\reports\post_development_review\20260702_dev_erp_engine_5_rag_grounded_judge_review.yaml`
    PASS.
  - 루트 `npm.cmd run validate` PASS.
