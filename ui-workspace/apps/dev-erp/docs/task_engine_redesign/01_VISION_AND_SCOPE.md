# 01. 비전과 범위

| 항목 | 내용 |
| --- | --- |
| owner | dev-ERP task engine design |
| authority | 목표 loop, 책임 분리, 구현 cut line |
| CURRENT | 입력별 자동화와 ENGINE-12 read model은 있으나 통합 TaskDriver/lifecycle은 없음 |
| TARGET | exact cause에서 승인된 task와 completion feedback까지 추적 가능한 closed loop |
| claim ceiling | `canon_candidate` |
| non-goals | runtime code, 실제 자료 분석, 운영 writer/alert activation |
| stop | source truth 재소유, raw/private 공개 필요, exact authority 불명확 |

## 해결할 질문

엔진은 매 할일과 중요한 전이에 대해 다음을 재생할 수 있어야 한다.

1. 무엇이 입력됐고 어느 exact revision인가?
2. 왜 할일/변경 후보가 생겼으며 왜 그 시점인가?
3. 누가 또는 어떤 explicit policy가 승인·적용했는가?
4. 실제 작업은 어떤 append-only 사건과 결과를 남겼는가?
5. 완료가 어떤 지식 후보와 후속 Driver 후보를 만들었는가?

현재의 강점인 source-local provenance, deterministic writes, read-only life tree를 유지하며
그 사이에 빠진 causal/authority contract만 추가한다.

## scope

- 메일·음성·SE 일정·사람/AI 지시·ERP·파일 사건을 source-local로 수용
- TaskDriver, 두 상태축, writer/approval/idempotency/replay
- project-local RAG/Wiki/ontology와 exact source revision 연결
- completion evidence, knowledge candidate, follow-up Driver candidate
- 네 PC packet/reconciler와 state-change alert target
- legacy path/status/ledger의 dry-run migration과 한 project 수직 pilot

## 하지 않는 것

- 모든 입력을 자동 할일로 변환
- LLM 판단을 owner decision이나 source truth로 취급
- source ledgers를 하나의 거대 timeline 파일로 병합
- RAG/Wiki/Neo4j/life tree를 task truth로 승격
- 실제 파일을 이 PC에서 찾거나 private 경로를 public docs에 기록
- 합성 검증만으로 production-ready 선언

## 성공 모습

같은 immutable 입력을 replay하면 같은 Driver candidate와 projection이 나오고, 승인·적용
receipt가 있는 task만 current truth에 반영된다. 완료 이후 생성되는 것은 우선 후속 Driver
후보이며, 별도 authority 없이 새 task가 열리지 않는다.

## canonical refs

- [`PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`](../../../../../docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md)
- [`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../../../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
- [`ENGINE_EXPANSION_MASTER_PLAN_20260702.md`](../slices/ENGINE_EXPANSION_MASTER_PLAN_20260702.md)
- [`ENGINE-12-CONTEXT-LIFE-TREE.md`](../slices/ENGINE-12-CONTEXT-LIFE-TREE.md)
