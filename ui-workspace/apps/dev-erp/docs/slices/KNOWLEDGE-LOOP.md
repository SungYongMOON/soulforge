# KNOWLEDGE-LOOP — 지식 유통 루프 완성 (슬라이스 B+C)

- 계기: owner 2026-07-04 "지식부분부터 마무리하자, 소나설계도 결국 지식에 포함이니까"
- 배경 진단(Ghodsi 페르소나 감사): 지식 축적은 진짜인데 유통이 0 — 승인 버튼 no-op(store 2872),
  assignee_memory 0행(파이프 완성·물 0), Codex 스레드 주입 = 메타데이터 10필드뿐.

## 루프 전체 (이 슬라이스 이후)

```
일 완료 ─→ 5필드 자동 기록(FIVE-FIELD-CAPTURE, 훅 강제)
        ─→ 다이제스트 제안(B-5 수신함) ─ 승인 ─→ ① 담당자 메모리(Mem0 게이트·과제 격리)   [B]
                                              ② core_knowledge 검색 표면(ai_draft)      [B]
        ─→ RAG 후보 원장 증분 적재(COMPLETION_FEED env, 15분 사이클)                     [상주]
다음 일 시작 ─→ Codex 스레드에 자동 주입: 담당자 메모리 + 출처 포인터 + 과제 지식 top-N    [C]
반복 감지 ─→ request_kind 승격 스캔(주간, Codex packet S2) ─→ 아침 브리핑 1줄            [발주됨]
```

소나 설계 지식도 같은 길: 설계 결정을 과제 스레드에서 내리면 판단·중단조건이 5필드로 잡히고,
승인 시 메모리·지식으로 유통되며, 도메인 정본(위키·인덱스 1,298종)은 knowledge_refs 로 주입된다.

## 변경 내용

- `src/store.mjs` — `applyCompletionDigest(payload, {proposal_id})` 신설, approve 분기 교체.
  지식 없으면 `{ok, skipped:'no_knowledge_text'}`(구 의미 유지). 트랜잭션 내 실행.
- `src/codex_bridge.mjs` — `buildTaskDeveloperInstructions` 에 `input_refs`(출처 포인터 8개 상한)·
  `knowledge_refs`(지식 참조 3개 상한, 제목+source_card_ref 경로만) 섹션. 없으면 기존 출력과 동일.
- `server.mjs` — `enrichItemForCodex` (composeInputRefs + listProjectKnowledgeRefsFast/matching,
  캐시: 성공 10분·빈 결과 60초), 스레드 개설(createCodexTaskThread)·매 턴(메시지 핸들러) 두 곳 호출.
- `tools/knowledge_grounding.mjs` — 적대 리뷰 must_fix 반영: ① 서버 경로용
  `listProjectKnowledgeRefsFast` 신설(이름 프리필터 — 인덱스 파일이 추출 전문 포함이라 전수
  스캔은 실측 5,231ms 동기 블록, Fast 는 실측 14.5ms·P26-014 3종 정확) + 크기 상한(8MB)
  + 손상 파일 개별 skip ② 기존 전수 스캔도 파일 단위 try/catch(부분쓰기 레이스 1건이 전체
  [] 반환하던 결함 수리).

## 경계

- 원문 미복사: instructions 에는 id/경로만, source_card_summary 미주입. "Do not claim raw ..." 유지.
- 승인 게이트 유지: 메모리/지식 기록은 owner 승인 시에만(코어 LLM 0% 원칙). 5필드 레저와 역할 분리 —
  레저=자동화 자산(무게이트), 메모리·지식=행동 규칙(게이트).
- 구세대 payload(verification/request_kind 없음) 하위호환 — 필드 부재 시 생략 동작.

## 검증

- `test/knowledge_loop.test.mjs` (KNOWLEDGE-LOOP-001, 5건) + 전체 직렬 스위트 + 커밋 전 적대 리뷰.
