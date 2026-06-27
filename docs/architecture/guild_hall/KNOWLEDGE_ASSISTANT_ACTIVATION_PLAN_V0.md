# Knowledge Assistant Activation Plan v0 (검토용 제안 — 미승인)

> 상태: **owner 검토 대기 초안.** 코드 변경 없음. 이 문서는 "지식비서를 카파시 LLM Wiki처럼
> 동작시키기 위해 켜야 할 3개 스위치"의 구현 설계와 **적대검증 결과**를 담은 결정용 자료다.
> 실제 코드 착수는 아래 **Phase 0 owner 결정**이 끝난 뒤에만 한다.

## 0. 한눈에 (비전문가용)

지금 저장소는 자료 수집→정리→위키→검색→소비(S1~S6) 골격이 실데이터로 돌아간다. 영상(카파시
LLM Wiki)의 "말 걸면 출처 읽고 답하는" 체감을 켜려면 다음 3개를 켜면 된다. **새로 짓는 게 아니라
대부분 이미 있는 부품을 잇는 일**이다.

| 스위치 | 쉬운 설명 | 난이도 | 검증 평결 |
| --- | --- | --- | --- |
| **② 읽고-답하기** | FAQ뿐 아니라 진짜 출처 본문을 읽어 인용 붙은 문장으로 답 | M | ⚠️ **owner 경계 결정 필요** (가장 원하지만 가장 민감) |
| **③a 위키 자동컴파일** | LLM이 원문 읽고 요약·개념·링크 있는 위키 .md를 스스로 작성 | M | ✅ go-with-fixes (출력 위치 owner 확정) |
| **③b 완료 루프** | 과제 끝나면 '지식/다음할일' 제안을 승인 시 실제 적재(지금은 빈 동작) | S~M | ✅ go-with-fixes (3개 픽스 후, 가장 작음) |
| **① 뜻으로 찾기(벡터)** | 비슷한 의미로도 검색(로컬 임베딩) | M | ⛔ 보류 권고 (카파시 규모상 후순위 + firewall 폭발반경 큼) |

**핵심 반전:** 당신이 제일 원하는 ②가, 당신 저장소의 핵심 보안원칙
(`reads_source_bodies:false`, metadata_only, "ERP는 정답 권위가 아니라 길안내 신호")과 **정면으로
긴장한다.** 즉 ②는 "코드 난이도" 문제가 아니라 **"ERP 챗을 출처-인용 응답기로 만들어도 되는가"라는
owner의 경계 결정** 문제다. 그래서 즉시 착수 가능한 건 ③b(픽스 후)뿐이고, ②는 결정이 선행돼야 한다.

## 1. 모든 스위치의 공통 안전 원칙

검증 결과 4개 기능이 하나의 원칙으로 수렴한다:

> **확장(합성·생성·임베딩 등 "본문성" 산출)은 내 PC 영역(`_workspaces`, `public_repo_safe:false`,
> claim_ceiling 캡)에서만. 공개 표면(`answer_engine_run` metadata_only · `graph_export` canon-backed
> · `rag_answer` `no_vector_search` · `.registry/knowledge`)의 게이트는 그대로 둔다.**

그래서 **기존 firewall 테스트를 그대로 "넘으면 실패하는" negative-guard로 재사용**하면, 거버넌스를
깨지 않고 배선만 잇는다. 추가 규칙:

- **claim-ceiling 캡:** LLM/사용량 산출물은 정본 권위가 아니다. ②는 가장 약한 청크 등급으로 상한,
  ③a는 `observed` 고정, ③b는 `source_supported`보다 낮은 값, ①은 `observed` 이하 강등.
- **config 게이트:** 신규 lane은 전부 env/플래그 뒤(기본 OFF). PUBLIC/미승인 환경에서 자동 비활성.
- **`karpathy_llm_runtime_required:false` 유지:** 모든 LLM 의존은 로컬 Ollama(127.0.0.1) 또는 어댑터로만.
  Ollama 없으면 메타/lexical/extractive로 **graceful degrade**(끊김 없음). 외부 인터넷 egress 0.

## 2. 스위치별 설계

### ② 읽고-답하기 (sourcebound 합성 답변) — ⚠️ needs-owner-decision

**지금:** ERP 챗은 미리 등록된 FAQ(`core_faq`)에서만 답을 찾는다
(`chat_pipeline.mjs:322` `promptHits`가 FAQ만). 출처 본문 파이프(`source_text_index.mjs`의
`retrieveChunks`+citations)는 완성돼 있으나, 답 생성부 `renderExtractiveAnswerText`(`:1371`)가
LLM 합성이 아니라 "청크 N개 찾음"+본문 나열이다. 공개표면 `answer_engine_run.mjs`는 설계상 "길안내
신호만"(`:290` `metadata_index_answer`, `:384` `answer_is_navigation_signal_not_source_truth:true`).

**다 되면:** ERP 챗에서 FAQ 강매칭이 없어도, 승인된 출처 문서의 실제 본문을 근거로
`...이다[출처1]. ...한다[출처2].`처럼 인용이 달린 한국어 답변 + 출처/페이지/신뢰등급 표시.
Ollama 꺼지면 기존 조각 나열/FAQ 검색으로 끊김 없이 폴백.

**바뀌는 파일:**
- `guild_hall/rag/source_text_index.mjs` — `renderExtractiveAnswerText`(:1371) 보존 + 옆에
  `buildSynthesizedAnswerText({index,retrievedChunks,question,runLlm})` 신설.
  `buildSourceTextAnswerRun`(:638)에 `options.synthesize`(기본 false)·`runLlm` 추가. 합성문은
  `response.answer_text`(이미 허용된 유일 payload trail `SOURCE_TEXT_ANSWER_RUN_PAYLOAD_TRAILS`:50)에만.
- `ui-workspace/apps/dev-erp/src/chat_pipeline.mjs` — `runManualAnswerPipeline`(:303)에 약매칭일 때
  source-text lane 분기(`mode='grounded_source_text'`), `ERP_CHAT_SOURCE_TEXT_LANE` 플래그 뒤.
- `ui-workspace/apps/dev-erp/src/llm.mjs` — `buildSourceTextPrompt(question, chunks, history)` 신설
  (청크 본문+source_ref+page_span을 `[출처 i]`로, "출처 안에서만·문장끝 출처번호 강제·없으면 모른다고").
  `runLlm`(:273, 로컬 ollama) 재사용.
- `guild_hall/rag/answer_engine_run.mjs` — **변경 안 함**(또는 metadata 포인터만). 본문 절대 금지.

**새 파일:** `chat_source_text_lane.test.mjs`, `source_text_answer_synthesis.test.mjs`,
(선택) `src/source_text_lane.mjs`(권한 게이트 어댑터).

**검증에서 나온 필수 픽스(코드 불일치):**
- `retrieveChunks`/`renderExtractiveAnswerText`는 **export 안 됨** → chat_pipeline에서 쓰려면 export 추가 필요.
- `weakestClaimCeiling`이 `answer_engine_run.mjs:551`·`rag.mjs:4294`·`source_text_index` 내부에 **3중 중복** → 합성 lane이 쓰려면 정본 export 1개로 정리(임의 4번째 복제 금지).
- `answer_synthesis_allowed`는 `source_card`가 아니라 **`source_text_index`의 permissions**에 있음(설계가 필드 위치를 오지목). 게이트 개념은 유효하나 경로 정정 필요.
- **인용 환각 위험:** 프롬프트 규칙만으로 인용 강제하면 LLM이 없는 출처번호를 만들 수 있음 → "인용 번호↔실제 청크" 매핑 검증 로직 최소 1개 필요(claim_ceiling로는 못 막음).

**거버넌스 주의:** `knowledge_shell`은 `reads_source_bodies:false`를 ERP 경계로 선언. 합성 시 청크
본문이 ERP 프로세스 메모리에 실제로 올라가므로 "index 경유라 충족"이라는 논리는 **owner 해석이 필요**.
`SOURCE_TEXT_ARTIFACT_FORBIDDEN_KEYS`에 `question`/`raw_query` 포함 → 질문 원문이 run에 새지 않게
유지(현재 fingerprint만).

**effort: M · 평결: needs-owner-decision** (아래 Phase 0 D-1, D-2)

### ③a 위키 자동컴파일 (LLM이 원문→위키 .md) — ✅ go-with-fixes

**지금:** 위키 view(`graph_export`→obsidian_export)는 canon만 복사하는 기계 투영이라 LLM이 자유
생성하는 자리가 아니다. 카파시식 "LLM이 자료 읽고 요약+개념+backlink 페이지를 씀"이 비어 있다.

**다 되면:** `wiki-page write --source-text <추출텍스트> --out _workspaces/.../wiki/<slug>.md` 한 번에
`## 요약 / ## 개념 후보 / ## Backlinks` + frontmatter(`generated:true, read_only:true,
claim_ceiling: observed`)가 있는 위키 .md 생성/갱신. Ollama 없으면 메타만(외부 호출 0).

**바뀌는 파일:** `guild_hall/rag/cli.mjs`(서브커맨드 추가), `KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md`
(Source-To-ERP Flow에 1줄), `graph_export.mjs`(변경 없음 — canon-backed view 유지).

**새 파일:** `guild_hall/rag/wiki_page_writer_v0.mjs`(러너; `_workspaces` 강제·`.registry/` write throw·
`observed` 고정), `wiki_page_writer_v0.test.mjs`, (선택) 공유 `llm_adapter.mjs`.

**거버넌스 주의:** 출력은 `_workspaces`(LOCAL, observed)에만. `.registry/knowledge`(공개 canon) 직접
쓰기 금지(가드+테스트). canon 승급은 `owner_decision_packet_v0`+`post_development_review_gate_v0` 경유로
별도 소유. 원문 본문이 .md에 박히지 않게 요약만 직렬화(마커 테스트로 차단).

**검증 risk:** observed 산출물이 `_workspaces`에 쌓이기만 하고 워크플로로 이관 안 되면 "사실상-canon
오용" 우려 → 승급 경로를 문서/UX로 분명히 묶을 것.

**effort: M · 평결: go-with-fixes** (Phase 0 D-3)

### ③b 완료 루프 (승인 시 실제 적재) — ✅ go-with-fixes (가장 작음)

**지금:** 과제 done 시 로컬 LLM이 `completion_digest`(요약·다음할일·지식) 제안을 만들지만,
승인을 눌러도 **아무것도 안 들어간다**(`store.mjs:2509` `approveProposal`의
`case "completion_digest": result={ok:true}` no-op). `core_knowledge`/`core_deliverable`/`ai_proposal`
테이블은 이미 스키마로 존재(0행).

**다 되면:** done으로 옮기면 제안이 pending으로 뜨고, 승인 시 다음할일→`core_item`,
지식→`core_knowledge`로 실제 적재 + "N건·M건 적재됨" toast. 중복 승인은 dedup으로 차단.

**바뀌는 파일:** `store.mjs`(`approveProposal:2509` 분기를 화이트리스트 메서드
`createItem`/`upsertKnowledge`(:2708) 호출로 교체, 약등급 claim_ceiling 명시, dedup),
`static/app.js`(toast 문구), `test/core.test.mjs`(승인 테스트).

**검증에서 나온 필수 픽스:**
- **트랜잭션 충돌:** `createItem`은 `project_id` null이면 `{error:'project_required'}`(:1806) →
  기존 패턴은 error 시 전체 ROLLBACK. "skip"하려면 부분성공 분기를 직접 구현해야 하는데 이는 원자성
  불변식과 충돌 → owner가 "부분성공 허용 vs 전부-또는-전무" 결정 필요.
- **project_id null 빈번:** `completion_digest.payload.project_id`는 자주 null(`server.mjs:858`) →
  "승인했는데 0건 적재"가 흔할 수 있음. UX에서 미리 경고.
- **dedup 미설계:** `upsertKnowledge`는 id 기준 ON CONFLICT만(:2715), source_ref+title 유일성 없음 →
  코드 레벨 pre-check + 재승인 레이스 멱등 보장 필요.
- **PUBLIC 노출:** `core_knowledge`가 공개 sync 대상이면 LLM 산출분 제외 플래그 필요.
  **AGENTS.md "불분명하면 private" 규칙상, owner 확정 전엔 LLM digest 지식을 공개 카탈로그에 넣지 말 것.**

**effort: M · 평결: go-with-fixes** (Phase 0 D-4)

### ① 뜻으로 찾기 (로컬 임베딩 hybrid) — ⛔ 보류 권고

**요지:** 로컬 임베딩(Ollama `nomic-embed-text`)+cosine으로 "비슷한 뜻" 후보를 끌어오고(recall),
최종 정렬은 검증된 lexical로(rerank). 벡터는 `_workspaces` private index에만, 공개 표면엔 절대 비노출.

**왜 보류:** ① 카파시 본인이 "수백 개 규모엔 임베딩 RAG 불필요"라고 명시. ② `no_vector_search`/
`FORBIDDEN_RAG_PROJECTION_KEYS`가 광범위 차단이라, 벡터 키가 manifest/projection/source_slice에
한 곳이라도 새면 전 firewall 테스트가 동시 실패 — **"후순위"가 아니라 "고위험"**. ②③ 안정화 +
실측 불편이 쌓인 뒤에만 opt-in.

**effort: M(+운영부담) · 평결: 보류**

## 3. Phase 0 — 코드 전에 필요한 owner 결정

| # | 결정 | 무엇을 정해야 하나 | 막는 것 |
| --- | --- | --- | --- |
| **D-1** | ②의 정당성 | "ERP 챗을 출처-본문 인용 응답기로 만드는 것"이 `reads_source_bodies:false`/metadata_only 의도와 충돌 — 허용할 것인가? | ② 전체 |
| **D-2** | ② 노출 방식 | 합성 답변을 dev-erp 챗에서만 노출 / `answer_engine_run`엔 포인터만. dev-erp가 `retrieveChunks`를 직접 import할지(메모리 본문 접근) vs 미리 쓰여진 run만 읽을지 | ② 구현 형태 |
| **D-3** | ③a 출력면 | LLM 위키 생성물을 `_workspaces/knowledge/<project>/wiki/`에 둘지(obsidian_export 예약어 회피). 승급 경로를 어떻게 강제할지 | ③a |
| **D-4** | ③b 등급·경계 | LLM 산출 지식의 claim_ceiling 약등급(정본 6-state에서 `source_supported`보다 낮은 값) + `core_knowledge` PUBLIC sync 제외 여부 + 부분성공 허용 여부 | ③b |
| **D-5** | 런타임 | Ollama 로컬 설치 + 모델 pull(`gemma3:4b` 생성, `nomic-embed-text` 임베딩) + env(`ERP_CHAT_PROVIDER=ollama`, `ERP_CHAT_SOURCE_TEXT_LANE`) | 전부 |

## 4. 권장 단계(Phasing)

- **Phase 1 — ③b** (가장 작고 firewall 위험 낮음, 픽스 3건 후). 단독 릴리스 가능.
- **Phase 2 — ②** (핵심 가치, **단 D-1/D-2 결정 후**). 플래그 게이트로 점진 활성.
- **Phase 3 — ③a** (신규 `_workspaces`-only 러너; D-3 후).
- **Phase 4 — ①** (보류; ②③ 안정화·실측 효용 확인 후 opt-in).

## 5. 연속성/검증 주의 (AGENTS.md)

- 주 개발환경은 Codex. 산출물은 Codex가 이어받아 유지보수 가능해야 함 → 신규 lane은 Ollama 미가용
  시 graceful degrade로 "죽은 코드"처럼 보일 위험. 각 lane은 stub 기본 + 결정성 테스트로 검증 가능해야 함.
- 매 슬라이스 후 `node:test` 전건 + verify_gate Level≥1 + 작업자·모델 표기 commit. 단 dev-erp 테스트
  (`core.test.mjs`)와 `guild_hall/rag/rag.test.mjs`는 **별도 test 명령** → "전건" 정의를 슬라이스별로 명시.

---

근거: 6-에이전트 워크플로(실제 코드 정밀조사 4 + 통합설계 + 적대검증). 교차확인된 코드 앵커 —
`approveProposal` no-op `store.mjs:2509`, `retrieveChunks`/`renderExtractiveAnswerText`
`source_text_index.mjs:1325/1371`, `promptHits`가 FAQ만 `chat_pipeline.mjs:322`,
`upsertKnowledge` 기본 `source_supported` `store.mjs:2708`, 합성 금지 표면 `answer_engine_run.mjs:290/384`.
