# 할일 엔진 맥락 기반 선행구조 교차검증 packet V0

| 항목 | 내용 |
| --- | --- |
| 목적 | 고성능 PC가 맥미니에서 정의한 저장·시간·RAG/Wiki·맥락 선행구조와 구현 순서를 독립 검증 |
| 상태 | `owner_requested_cross_validation_packet` |
| 검토 기준선 | public `main` commit `2b79ce513f89bf353200a36326fe1a7d3402c579` |
| 주장 한계 | `source_supported`; 실제 고성능 PC DB·private payload·live collector 검증 전 |
| 비권한 | 코드·DB·migration·writer·scanner·scheduler·network·alert 활성화 |

이 문서는 기존 계획을 새 정본으로 대체하지 않는다. 고성능 PC는 각 판정을 그대로 믿지 말고
public 계약과 허용된 metadata-only runtime evidence로 `CONFIRMED`,
`REJECTED_WITH_EVIDENCE`, `UNKNOWN_BLOCKED` 중 하나를 기록한다. 근거가 없는 반박이나 동의는
교차검증 완료가 아니다.

## ASSUMPTIONS

- 여기서 `오염`은 실제 payload 혼입과 owner/path/authority 계약 drift를 구분한다.
- 통합 시간축은 여러 source-local 원장을 읽는 projection이지 하나의 giant ledger가 아니다.
- `task discovery`는 검증된 맥락에서 할일 후보를 만드는 단계이며 입력 수집과 다르다.
- 개인 Codex 전체 대화 수집은 현재 기본 계약이 아니다. 승인된 구조화 결과와 실행 receipt를
  먼저 다루고, 원문 capture는 별도 owner 결정으로 남긴다.

## owner가 고정한 선행 불변식

```text
P0 read-only baseline / source-owner inventory
  -> P1 입력별 append-only 이력과 coverage/gap
  -> P2 ID·typed ref·여러 clock·valid_at/known_at
  -> P3 immutable source/file revision·content·locator lineage
  -> P4 exact revision-bound project/common RAG·Wiki
  -> P5 시간축+관계+RAG+Wiki+gap의 context assembly와 deterministic validation
  -> P6 task discovery: candidate-only, ERP write 없음
  -> P7 TaskDriver: why/why-now·authority·idempotency
  -> P8 sole ERP writer·task ID·두 상태축·application receipt
  -> P9 one-project pilot·feedback·read-only life tree
  -> P10 별도 승인된 multi-PC/alert/AX/AgentRun/ML activation
```

각 phase는 이전 phase의 acceptance evidence를 입력으로 가져야 한다. P5 완료 receipt가
`context_acceptance_gate`다. 이 gate 전에는 task discovery를, P6 acceptance 전에는
TaskDriver를, P7 acceptance 전에는 ERP schema/writer를 시작하지 않는다. PC별 packet·identity·
reconciler 계약은 P1~P2에 정의하되 live scanner/watchdog/Telegram 활성화는 P10으로 분리한다.

## 보존됐다고 판단한 구조 — 독립 재확인 필요

```text
🟨 _workspaces/<project_code>/**
   원본·첨부·추출본문·project RAG·project Wiki payload

🟦 _workmeta/<project_code>/**
   source event·ID·clock·revision pointer·relation·receipt·context metadata

🟩 _workspaces/knowledge/**
   특정 project에 속하지 않는 cross-project common knowledge payload

⬜ read-only projection
   분리된 원장을 exact ref로 읽는 시간축·context graph·생명수·Neo4j/UI
```

근거:

- [owner 경계와 저장 위치](task_engine_redesign/02_OWNER_BOUNDARIES_AND_STORAGE.md)
- [입력과 시간 모델](task_engine_redesign/03_INPUT_AND_TEMPORAL_MODEL.md)
- [RAG/Wiki exact lineage](task_engine_redesign/04_KNOWLEDGE_ONTOLOGY_RAG_WIKI.md)
- [project knowledge storage](../../../../docs/architecture/workspace/PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md)
- [temporal knowledge ontology](../../../../docs/architecture/foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)

## 교차검증 finding matrix

| ID | 맥미니 검토 판정 | 고성능 PC에서 확인할 증거 | 합격 기준 |
| --- | --- | --- | --- |
| CV-01 | public tracked project payload 오염은 관찰되지 않음 | `git ls-files '_workspaces/**'`, tracked diff와 path validator | 실제 payload/body/chunk가 public tracked tree에 0건 |
| CV-02 | project/common payload·metadata 분리는 보존됨 | `02`, knowledge storage 계약, current writer/default root | project RAG 신규 target이 project-local이고 common만 common root 사용 |
| CV-03 | `02`의 “전체 physical owner map”은 context/file-activity owner를 누락 | context graph의 `project_context/**`, `reports/context_graph/**`; file activity의 cache/outbox/ledger 경로 | 전체 지도와 실제 owner path가 일대일로 열거됨 |
| CV-04 | context graph 최소 schema가 최신 exact revision/time 계약보다 오래됨 | `sources.csv`, `edges.csv` 필드와 temporal/03/04 typed-ref 요구 비교 | `source_revision_id`, `content_id`, `valid_at/known_at` 또는 동등 exact ref가 loss 없이 연결됨 |
| CV-05 | 실행 순서가 TaskDriver-first로 기울어짐 | `08` phase와 ENGINE-13 required slices의 dependency DAG | 위 P0~P10 방향이 강제되고 foundation acceptance 전 Driver/ERP가 시작 불가 |
| CV-06 | Codex 작업 이력은 one-shot bounded record 수준이며 dev-ERP 밖 capture owner와 personal lifecycle이 미정 | ENGINE-12 lane, ERP MCP WorkSession schema/API/DB, start/bind/assignment epoch/sequence/closeout/outbox/ack/thread-node capability, task-chat payload owner | H03의 current one-shot source lineage와 AX personal lifecycle을 분리하고, closeout≠official completion·전체 대화 비수집·local pending≠server missing gap이 표시됨 |
| CV-07 | 외부 SE master schedule 변경 이력 owner/path가 미정 | schedule event/table/writer, external schedule import/version history | current row와 append-only revision/event가 분리되고 exact schedule revision이 context/RAG와 연결됨 |
| CV-08 | “같은 원장” 표현은 source-local owner 분리와 충돌 가능 | prompt 문구와 ENGINE-12/03의 source-local contract | “분리된 원장과 task event를 exact ref로 함께 읽는 projection”으로 해석·표현 |
| CV-09 | `ui-workspace`를 canon/orchestration root로 묶은 문구가 root 정본과 충돌 | root `AGENTS.md`와 prompt owner map | `ui-workspace`는 derived UI consumer로, canon owner와 분리 |

Owner가 2026-07-15에 추가한 세 기본안은 CV-01~CV-09를 재번호화하거나 선행순서를 바꾸지 않는다.
아래 `CV-F`는 후속 보정 finding이며 implementation acceptance가 아니다.

| ID | 후속 판정 | 고성능 PC에서 확인할 증거 | 합격 기준 |
| --- | --- | --- | --- |
| CV-F10 ingress | source owner와 service inbox는 있으나 공통 custody/promotion contract가 없음 | source-kind staging/quarantine/promoter/destination, mail raw tension, retention/ACL/scan/backup/delete authority | pointer 기본과 central upload custody를 구분하고 unauthorized copy/move/delete 및 promoter/projector/task-writer 권한 혼합 `0` |
| CV-F11 personal session | current MCP record는 start/bind/ordered closeout/durable client ack가 없음 | exact assignment epoch/account cardinality, node/thread binding, crash/reboot outbox replay, completion authority | one active primary+multiple checkpoint, closeout/proposal task delta `0`, verified ack 전 compact `0`; exact local binding은 `VERIFY_HP` |
| CV-F12 query/knowledge | current personal MCP에 accepted history/RAG/Wiki query가 없음 | explicit ACL/scope/generation/cursor, API↔CSV/XLSX parity, exact revision/locator/claim, candidate writer trace | ERP UI/MCP primary query, files audit snapshot, project/common implicit fallback `0`, team direct Wiki/RAG/canon/ontology/task write `0` |

직접 비교할 계약:

- [project context graph](../../../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
- [project file activity revision](../../../../docs/architecture/workspace/PROJECT_FILE_ACTIVITY_REVISION_V0.md)
- [ENGINE-12 context/life-tree](slices/ENGINE-12-CONTEXT-LIFE-TREE.md)
- [ENGINE-13 TaskDriver](slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md)
- [ERP MCP WorkSession](slices/ERP-MCP-V0.md)
- [migration/implementation phases](task_engine_redesign/08_MIGRATION_AND_IMPLEMENTATION_PLAN.md)
- [root owner boundary](../../../../AGENTS.md)

## 고성능 PC 실행 절차

1. [`HIGH_PERFORMANCE_PC_TASK_ENGINE_BUILD_MASTER_PLAN_PROMPT_V0.md`](HIGH_PERFORMANCE_PC_TASK_ENGINE_BUILD_MASTER_PLAN_PROMPT_V0.md)의
   sync·role·secret·read-only 경계를 먼저 따른다.
2. public 계약만으로 CV-01~CV-09와 owner가 추가한 CV-F10~F12의 1차 결과와 exact `file:line` 근거를 작성한다.
3. 유효한 owner-with-state profile과 이번 inventory authority가 확인된 경우에만 DB schema,
   aggregate count, opaque ID/digest, source lane coverage를 metadata-only로 대조한다.
4. 실제 title/body/transcript/chunk/filename/path/account를 public 결과에 쓰지 않는다.
5. 각 finding에 `CONFIRMED`, `REJECTED_WITH_EVIDENCE`, `UNKNOWN_BLOCKED`와 `next_proof`를 붙인다.
6. corrected dependency DAG를 작성하고 foundation phase별 input/output/validator/rollback/stop을
   표시한다.
7. 불일치가 남으면 새 master plan을 `READY_FOR_OWNER_REVIEW`로 올리지 않고 exact blocker를
   남긴다. 이 교차검증 중 runtime 구현이나 migration apply를 시작하지 않는다.

## 최소 검증 명령

```text
git status --short --branch
git diff --check
git ls-files '_workspaces/**'
npm run ui:docs:check
npm run validate:path-policy
```

실제 실행한 명령과 exit만 기록한다. private/runtime 검증 명령은 안전한 query-only 도구가
확인되지 않으면 만들거나 추측하지 않고 `UNKNOWN_BLOCKED`로 둔다.

## 필수 결과 형식

```text
baseline commit / observed role-profile / authority
CV-01..CV-09 verdict + exact evidence + next_proof
corrected P0..P10 dependency DAG
foundation acceptance matrix
Codex work-history and SE-schedule owner/path/schema decision gaps
public/private/raw boundary verdict
commands actually run + exit
final state: READY_FOR_OWNER_REVIEW | BLOCKED
```

교차검증은 기존 계약을 조용히 수정하거나 owner 결정을 대신하지 않는다. 확인된 보정은 owner가
승인한 뒤 roadmap, redesign phase, ENGINE-13 slice, owner map, context schema를 같은 변경에서
동기화한다.
