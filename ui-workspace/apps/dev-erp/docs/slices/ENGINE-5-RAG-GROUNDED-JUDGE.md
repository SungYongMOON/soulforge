# ENGINE-5-RAG-GROUNDED-JUDGE — 판단에 근거(RAG) 연결

- status: proposed / parallel_group: G-llm-adapter / depends_on: 없음(v1)
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
1. listProjectKnowledgeRefs(projectCode):
   _workspaces/knowledge/rag/indexes_local/source_text_indexes/*/source_text_index.json 을 스캔해
   해당 프로젝트(source_card_ref 경로에 projects/<code>/ 포함) + status=ready 만
   → [{ index_id, title, domains, source_card_ref, source_card_summary(200자 캡) }]
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

- [ ] 인덱스 JSON 에 프로젝트 코드가 source_card_ref 외 다른 필드로도 있는지(더 안정적 키가
      있으면 그걸 사용). 확인: 인덱스 JSON 상위 40줄.
- [ ] knowledge_access ledger(guild_hall) 에 사용 이벤트를 남기는 기존 계약이 있는지 —
      있으면 event_log 대신/병행으로 그 표면 사용 (docs/architecture/guild_hall 의
      knowledge_access 문서 확인). 중복 장부 발명 금지.

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
