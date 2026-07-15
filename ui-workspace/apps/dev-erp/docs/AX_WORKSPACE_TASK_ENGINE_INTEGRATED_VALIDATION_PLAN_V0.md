# AX Workspace × 할일 엔진 통합 비교·검증 계획 V0

- 상태: `comparison_candidate`
- 작성 기준일: `2026-07-14`
- 목적: 최초 dev-ERP 설계, 맥미니에서 만든 할일 엔진 계획, 현재 `main`, 고성능 PC 구현 branch를 **수정하지 않고** 대조한다.
- authority: 이 문서는 비교 지도와 검증 계획이다. 기존 계획을 대체하거나 runtime·DB·운영 권한을 만들지 않는다.
- 중단선: 구현, 데이터 변경, branch 통합, live DB pilot, writer/scanner/scheduler/network 활성화는 별도 owner 승인 전 수행하지 않는다.

## 0. 가장 중요한 결론

1. 최초 설계의 중심인 **진실 1개, 파생 view, 사건 이력, 파일 포인터, AI 제안과 사람 승인**은 큰 방향에서 유지됐다.
2. 기능이 늘며 `core_item`, `store.mjs`, `server.mjs`에 인입·판단·근거·동기화 책임이 몰렸다. 현재 `main`의 `event_log`만으로는 원자적 적용과 완전 replay를 보장하지 못한다.
3. 맥미니 계획의 TaskDriver 재설계는 최초 설계를 버리는 새 방향이 아니라, 비대해진 할일 엔진을 **얇은 현재 상태 + 명시적 인과·승인·사건 기록**으로 복구·확장하는 방향이다.
4. 할일 ID는 source나 Driver hash로 대체하지 않는다. 기존 `project_code`와 `core_item.id`는 owner ID로 유지하고, source revision·TaskIntent·TaskDriver는 별도 immutable ID와 typed ref로 연결한다.
5. 같은 과제의 생명수는 **장기 B9 지도**와 **ENGINE-12 일일 렌즈** 두 projection이다. 둘 다 task/source truth가 아니며, PDR/CDR은 가지가 아니라 2~5년 시간 기둥 위의 관문이다.
6. 저장 구조는 새로 설계하지 않는다. 원안에서 잠근 대로 **project payload는 `_workspaces/<project_code>`**, project metadata는 `_workmeta/<project_code>`, cross-project common payload는 `_workspaces/knowledge`, common metadata는 `_workmeta/system`이 소유한다.
7. 고성능 PC branch에는 exact ID, project-local RAG, TaskDriver, 두 상태축, replay, opt-in SQLite adapter의 합성 구현이 있다. 그러나 최신 `main`과 아직 합쳐지지 않았고 live TaskDriver DB·생명수 adapter·멀티 PC 운영은 검증되지 않았다.
8. 이 문서는 AX Workspace를 ERP 대체물이 아니라 **사람과 각자의 Codex가 같은 근거로 일하는 proposed target**으로 둔다. ERP의 공식 상태·통제된 쓰기와 Soulforge의 계약·관계·오케스트레이션 경계를 유지하는 설계 가설이며, owner 승인 전 canon 명칭이나 확정 구조가 아니다.

### 0.1 한 문장으로 무엇을 만들려는가

> 메일·음성·일정·파일에서 일이 생기면, 근거를 잃지 않은 할일 후보로 만들고, 사람 또는
> 사전 승인된 매우 제한적인 deterministic policy가 허용한 일만 ERP에 등록하며, 사람이나
> 각자의 Codex가 수행한 결과를 검증해 같은 과제의 이력·지식·다음 할일 후보로 되돌리는
> **팀 업무 운영 시스템**을 만들려는 것이다.

새 ERP 하나를 더 만들려는 것이 아니다. 기존 ERP를 공식 할일 장부로 유지하고, Soulforge가
파일·지식·관계·실행 계약을 연결하며, 각자의 Codex가 그 위에서 일하는 작업 자리를 만드는 것이다.

### 0.2 쉬운 비유: 책상·서랍·장부·이유표·지도

| 쉬운 비유 | 실제 이름 | 하는 일 | 하지 않는 일 |
| --- | --- | --- | --- |
| 내 작업 책상 | AX Workspace candidate / personal Codex seat | 내 과제·근거·할일·도구·검증을 한 자리에서 사용 | 공식 할일 truth를 따로 만들지 않음 |
| 원천 기록처 | 메일·음성·일정·파일 source-local owner | 원천 current record와 append-only event/revision을 먼저 보존 | workspace·통합 view가 원천을 대체하지 않음 |
| 과제 파일 서랍 | `_workspaces/<project_code>` | owner가 승인해 materialize한 원문·첨부·추출본문·RAG·Wiki·산출물 body 보관 | 모든 source를 강제 복사하거나 metadata 장부가 되지 않음 |
| 과제 색인 카드 | `_workmeta/<project_code>` | ID·revision·pointer·hash·relation·receipt 보관 | 원문·본문·chunk 보관 금지 |
| 회사 공용 서고 | `_workspaces/knowledge` + `_workmeta/system` | 특정 과제가 아닌 공용 자료와 그 metadata 보관 | project 자료를 섞지 않음 |
| 시스템 안내 색인 | `_workspaces/system/rag` | metadata-only RAG manifest·navigation output 보관 | project/common source-text body 보관 금지 |
| 공식 할일 장부 | dev-ERP `core_item` + task events | 승인된 할일과 현재 상태·사건 근거 소유 | RAG·Wiki·생명수 view가 대신하지 않음 |
| 할일 이유표 | TaskIntent + TaskDriver | 왜 이 일인지, 왜 지금인지, 어느 근거·권한인지 기록 | 모든 파일·지식을 복제하지 않음 |
| 실행 영수증 | WorkSession / AgentRun candidate | 누가 어떤 도구로 무엇을 했고 무엇을 검증했는지 기록 | TaskDriver나 task truth를 대신하지 않음 |
| 과제 생명 지도 | B9 장기 지도 + ENGINE-12 일일 렌즈 | 관문·가지·사건·결과를 시간축으로 보여 줌 | 원장에 직접 쓰지 않는 read-only projection |

### 0.3 전체 시스템을 한눈에 보기

아래 화살표는 업무가 진행되는 순서다. 원문을 다른 저장면으로 복사한다는 뜻은 아니다.

```mermaid
flowchart LR
  SRC["🟦 CURRENT: source-local owner<br/>메일·음성·SE 일정·파일<br/>current + append ledger"]
  BODY["🟧 VERIFY_HP: 승인된 파일 몸체<br/>project/common materialization<br/>_workspaces"]
  META["🟧 VERIFY_HP: 색인·이력<br/>ID·revision·relation<br/>_workmeta"]
  KNOW["🟨 OBSERVED: 찾는 지식층<br/>RAG·Wiki·ontology<br/>exact revision"]
  DRIVER["🟨 OBSERVED branch / 🟥 GATE live<br/>TaskDriver writer<br/>후보·근거·권한"]
  APPROVE["🟥 GATE: 승인 관문<br/>사람 또는 bounded policy"]
  ERP["🟦 CURRENT: 공식 할일 장부<br/>core_item + task events"]
  WORK["🟦 CURRENT 수행 / 🟪 TARGET AgentRun<br/>사람·Codex·workflow"]
  CHECK["🟨 OBSERVED partial / 🟪 TARGET exact<br/>산출물·결정·verification<br/>expected ↔ actual"]
  ROUTE["🟪 TARGET: feedback handoff/router<br/>exact refs를 분배할 뿐<br/>어느 원장도 쓰지 않음"]
  KCAND["🟪 TARGET: knowledge candidate owner<br/>후보·교정 review queue"]
  VIEW["⬜ PROJECTION: 읽기 지도<br/>사건축·B9·일일 생명수<br/>graph·dashboard·alert"]

  SRC -->|owner-approved body만| BODY
  SRC -->|bounded event·revision ref| META
  BODY --> KNOW
  META --> KNOW
  META --> DRIVER
  KNOW --> DRIVER
  DRIVER --> APPROVE --> ERP --> WORK --> CHECK --> ROUTE
  ROUTE -->|지식 후보 handoff| KCAND
  KCAND -->|reviewed candidate metadata| META
  ROUTE -. "후속 인과 ref handoff" .-> DRIVER
  KNOW --> VIEW
  META --> VIEW
  ERP --> VIEW
  ROUTE -. "exact result refs" .-> VIEW

  classDef current fill:#d7ebff,stroke:#2468a2,color:#222
  classDef observed fill:#fff3bf,stroke:#8a6d00,color:#222
  classDef verify fill:#ffe0b2,stroke:#a85b00,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef gate fill:#ffd9dd,stroke:#a23b49,color:#222
  classDef view fill:#eeeeee,stroke:#666,color:#222
  class SRC,ERP,WORK current
  class KNOW,DRIVER,CHECK observed
  class BODY,META verify
  class ROUTE,KCAND target
  class APPROVE gate
  class VIEW view
```

### 0.4 실제 한 건의 일이 처리되는 순서

예를 들어 시험 일정 변경 메일이 들어온 경우다.

```mermaid
sequenceDiagram
  autonumber
  participant S as 메일·음성·일정·파일 owner
  participant M as 승인된 workspace + metadata
  participant K as RAG·Wiki·ontology
  participant D as TaskDriver 후보
  actor O as 사람 책임자 / 승인된 policy
  participant E as ERP task writer
  participant W as 사람·Codex·workflow
  participant R as feedback handoff/router (writer 아님)
  participant Q as knowledge candidate owner
  participant V as read-only 생명수 view

  S->>S: 원천 current record와 append-only event/revision 보존
  S->>M: 승인된 body materialization + bounded event/revision ref
  M->>M: source_revision_id·content_id·시간·project 관계 기록
  M->>K: exact revision 기준 검색·설명 projection 준비
  K-->>D: 필요한 page/chunk·rule·knowledge revision ref
  M-->>D: 왜 지금인지 설명하는 exact event ref
  D-->>O: 할일 후보·영향·근거·중단조건 제시
  O-->>D: 승인 또는 기각 결정
  alt 승인
    D->>E: 승인된 Driver + authority ref
    E->>E: 같은 Driver 재시도는 같은 task 또는 no-op
    E->>W: core_item.id와 완료 기준 전달
    W-->>E: 진행·대기·완료 task 사건
    W-->>R: 산출물·결정·검증 receipt exact ref
    E-->>R: completion task event exact ref
    R-->>Q: 지식 후보·교정 handoff
    Q->>Q: 별도 candidate ledger와 review queue 기록
    R-->>D: 후속 인과 ref handoff
    D->>D: 별도 TaskDriver writer가 후보 기록
    V->>E: task event·result read-only 조회
    V->>Q: reviewed candidate ref read-only 조회
    V-->>O: 사건축·생명수·gap을 읽기 전용 표시
  else 기각
    D->>D: 기각 이유와 authority state 보존
  end
```

이 흐름에서 AI가 임의로 공식 일을 만들어 버리는 것이 목표가 아니다. 먼저 정확한 근거와
중단조건이 붙은 후보를 만들고, 사람 또는 사전 승인된 bounded deterministic policy가 허용한
한 경로만 ERP를 쓰게 하는 것이 핵심이다. feedback router는 exact ref를 각 owner에게 넘길 뿐
어떤 원장도 쓰지 않는다. TaskDriver writer, task transition writer, knowledge candidate owner,
life-tree projection builder는 서로 권한을 빌리지 않으며, 생명수 view는 결과를 보여 줄 뿐 후보를
생성하지 않는다.

### 0.5 개발할 항목 전체 지도

아래 표는 원안 01~10, ENGINE-12/13, 현재 구현과 AX·Engineering IQ 확장 후보를 한 번에
빠짐없이 읽기 위한 개발 목록이다. `CURRENT`는 완료라는 뜻이 아니라 현재 일부 코드·계약이
있다는 뜻이며, `GATE`는 승인 전 구현·활성화를 멈춘다는 뜻이다.

범위를 섞지 않는다. M의 AX/WorkSession, N의 AgentRun, V의 Engineering IQ는 **원안 누락 복원
항목이 아니라 이 대화에서 요청된 후속 확장축**이다. 나머지 행도 CURRENT·TARGET·GATE 표기를
따라 구현 완료와 계획을 구분한다.

| 묶음 | 개발 항목 | 실제로 만드는 것 | 완료 판단 | 현재 위치 |
| --- | --- | --- | --- | --- |
| A. 저장 기반 | project/common 파일·metadata owner | `_workspaces/<project>`, `_workmeta/<project>`, `_workspaces/knowledge`, `_workmeta/system`, metadata-only `_workspaces/system/rag`의 분리와 binding | foreign-project 혼합 0, `_workmeta`와 system RAG의 body 0 | 🟩 원안 `LOCKED`; 실물은 🟧 `VERIFY_HP` |
| B. 입력 수집 | 메일·음성·SE 일정·ERP·파일·사람/Codex 지시 adapter | source-local event와 mail/item/event/Codex instruction/artifact/file activity/upload·gap lane을 보존하는 인입 | source/lane별 누락·중복·부분 관측 표시 | 🟨 일부 `CURRENT` |
| C. 파일 이력 | logical file·immutable revision·node observation | 여러 PC의 같은 파일을 덮어쓰지 않는 revision/관측 packet | hash·revision·observer crosswalk, sole reconciler | 🟨 일부 `CURRENT`; live 수집 🟥 `GATE` |
| D. ID·시간 | typed ref·owner ID·projection ID·`valid_at/known_at` | project/task/source/file/Driver를 분리하고 장기 이력을 월별 append ledger·revision/checkpoint로 나눔 | bare/fuzzy join 0, replay clock·물리 분할 보존 | 🟦 계약 + 🟨 HP branch |
| E. 프로젝트 맥락 | gate·skeleton/work/history branch·event | 한 과제의 2~5년 맥락 graph와 exact anchor | orphan/multi-parent conflict 표시 | 🟦 B9/STEM 일부 `CURRENT` |
| F. 생명수 | B9 장기 지도와 ENGINE-12 일일 렌즈 | 관문→가지→사건→할일→결과와 mail/item/event/Codex instruction/artifact/file activity/upload·gap lane을 읽기 전용으로 표시 | 조회 전후 owner row 불변, lane coverage·gap과 replay parity | 🟦/🟨 부분 `CURRENT` |
| G. 지식 추출 | source ledger·binding·HWPX 전처리·derived text·manifest | project/common 자료를 섞지 않고 HWP는 HWPX로 먼저 정규화한 뒤 본문을 추출·등록 | ledger↔manifest↔revision exact match, direct HWP parse 0 | 🟦 저장 계약; 실제 coverage 🟧 |
| H. RAG·Wiki | project/common 검색·설명 projection | exact page/chunk를 찾고 sourcebound 설명을 제공 | 최신 revision 혼입 0, 출처 없는 답변 차단 | 🟨 migration 중 |
| I. ontology·지식 승격 | relation candidate·rule·reviewed knowledge | 요구·기능·위험·결정·검증 관계와 재사용 지식 후보 | candidate/confirmed 분리, owner/review evidence | 🟪 `TARGET` |
| J. TaskIntent·TaskDriver | why·why-now·authority·idempotency | 근거가 붙은 할일/전이 후보와 승인 상태 원장 | same canonical intent/Driver payload + same idempotency key는 same ID/no-op; 같은 source의 다른 intent는 별도 ID | 🟨 HP branch; live 🟥 |
| K. ERP 적용 | 단일 task ID allocator·authoritative writer | 승인된 Driver를 task mutation+event로 원자 적용 | writer 1, duplicate retry no-op, event parity | 🟥 `GATE` |
| L. 작업 상태 | decision/application 축과 work-status 축 | 후보 승인 상태와 실제 업무 진행 상태를 분리 | 상태 손실 없는 mapping·replay | 🟨 HP branch |
| M. 후속 확장: 개인 Codex 작업면 | WorkSession·project scope·선택 첨부 | 팀원마다 자기 Codex로 계획·실행·검증하는 자리 | 다른 project 접근 0, 직접 task write 0 | 🟦 MCP pilot + 🟪 AX candidate |
| N. 후속 확장: 실행 계약·관제 | `.mission`·`.workflow`·`.party`와 AgentRun·capability·lease·budget·receipt | held plan, 재사용 orchestration, 실제 실행 시도와 도구/모델/검증 기록을 분리 | mission/workflow/party/AgentRun이 TaskDriver와 ID·authority를 공유하지 않음 | 🟦 canon 존재 + 🟪 AgentRun candidate |
| O. 완료·검증 | artifact revision·decision·verification·outcome | 무엇이 끝났고 예상과 실제가 어땠는지 exact ref로 기록 | reopen이 과거 완료를 삭제하지 않음 | 🟨 분산 `CURRENT`; owner ID `UNKNOWN` |
| P. 피드백 | knowledge candidate·follow-up Driver·correction | 완료 결과를 지식/다음 일 후보로 돌려보냄 | 조용한 auto-open 0, 기각·교정 보존 | 🟪 `TARGET` |
| Q. PC 운영 | work/tool/portable/always-on 역할·packet | PC별 책임, source collector, reconciler, task writer 분리 | hostname 추정 0, logical primary와 failover 증거 | 🟧 `VERIFY_HP`/🟥 `GATE` |
| R. 알림·복구 | alert·watchdog·checkpoint·tail replay | gap·stale·writer 충돌·migration 실패를 알리고 복구 | cooldown·recovery sequence·receipt 검증 | 🟪 기본 설계; 운영 🟥 |
| S. migration | legacy RAG·schema·consumer crosswalk | read-only inventory→dry-run→copy/rebuild pilot→rollback | collision/unresolved 0, original 보존 | 🟨 RAG pilot; task 통합 전 |
| T. UI·읽기 view | ERP·지식·graph·생명수·운영 화면 | 같은 원장을 역할별로 쉽게 보여 주는 화면 | view가 source/task owner를 쓰지 않음 | 🟦 일부 `CURRENT`; AX는 🟪 |
| U. 보안·검증 | ACL·public/private·secret·deterministic test | raw 유출, path escape, 권한 확대, 회귀를 막는 gate | V-01~V-16·전체 regression·독립 review | 🟦 계약/검증 존재; HP 재실행 |
| V. 후속 확장: Engineering IQ | 요구→기능→인터페이스→위험→결정→검증→교정 trace | 조직의 판단 근거와 결과를 재사용 가능한 관계로 연결 | exact source·authority·outcome·correction loop | 🟪 후속 후보 |
| W. 원안 future ML readiness | project routing·task actionability·retrieval ranking·due/block risk·branch link·이상 탐지의 labeled outcome | owner가 별도로 채택할 때 모델 학습·랭킹 실험을 준비 | 후보/사람 확정 label 분리, `known_at` train/test 분리, raw·개인평가·미확정 actor 기본 학습 금지 | ⬜ 먼 향후 후보; 기본 전제 아님 |

### 0.6 구조 도식 찾아보기

| 궁금한 것 | 먼저 볼 절 | 그 절에서 보는 구조 |
| --- | --- | --- |
| ERP·AX Workspace·Soulforge가 어떻게 나뉘나 | §3 | 시스템 경계와 쓰기 관문 |
| ID가 어떻게 이어지나 | §5.3~§5.6 | owner ID·projection ID·TaskDriver ref |
| 한 과제의 긴 역사는 어떻게 보이나 | §6.4~§6.7 | 기둥·관문·가지·잎·열매와 일일 렌즈 |
| 실제 파일과 지식은 어디에 저장하나 | §7.1~§7.7 | LOCKED 표·전체 physical folder tree·지식→할일 연결 |
| 각 PC와 Codex는 무슨 역할인가 | §8 | seat·worker·reconciler·task writer 운영도 |
| 고성능 PC에서 무엇을 확인하나 | §10 | ID·storage·tree·writer·rollback 검증표 |
| 어떤 순서로 개발하나 | §11 | G0~G8 단계와 승인 관문 |
| 내가 무엇을 결정해야 하나 | §12 | owner 결정 10가지 |

### 0.7 Ingress·personal WorkSession·team query 후속 보정 (2026-07-15)

이 문서의 기존 비교 구조와 G0~G8 순서는 유지한다. Authoritative 상세는
[`TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`](TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md)의
§3.5, §6.2A/6.5A, §7.1, §8~10, §12 side-card, HP-INGRESS/SESSION/QUERY, D27~D29다.

| 영역 | `CURRENT` | `TARGET` | `VERIFY_HP` |
| --- | --- | --- | --- |
| payload ingress | source-local owner 계약과 chat/MCP service inbox는 있으나 exact mail raw/attachment physical custody는 `UNKNOWN`이고 공통 promoter/receipt 없음 | pointer 기본, central upload custody 또는 explicit promotion만; source writer/promoter/projector/task writer 분리 | mail raw tension, exact path/role, retention/ACL/scan/backup/delete |
| personal WorkSession | `erp_mcp_work_session`은 idempotent one-shot structured result record; start/bind/sequence/closeout/outbox ack 없음 | `{assignment epoch,account}` active primary 하나, multiple checkpoint, terminal closeout, completion proposal; 공식 완료는 별도 | opaque thread-ref/node capability, local outbox path/fsync/encryption/retention, missing SLA |
| team query/knowledge | personal MCP 8개 tool에 accepted project-history/RAG/Wiki query 없음 | ERP UI/MCP primary read, files audit snapshot, explicit `project|common` scope/no fallback, candidate-only team write | ACL/existence leak, generation pointer/cursor, API-file parity, one-project/team binding |

이 보정은 P0→P10/G0→G8 edge를 바꾸지 않는다. P0~P9 ingress/query side-card는 해당 core `Pn`
acceptance 뒤와 `P(n+1)` 전에만 독립 실행하며 core acceptance에 포함되거나 다음 phase를 unlock하지
않는다. P10 capability는 accepted P9 뒤 각각 별도 owner approval·Level 3 gate로 실행하고 aggregate P10
receipt를 만들지 않는다. Personal lifecycle은 H03/P1 또는 core P8 acceptance가 아니며 core C10 뒤
AX-G1 design→feature-OFF→one-seat→team rollout 순서를 따른다.

## 1. 불변 비교 기준선

이 문서가 잘 만들어졌는지는 아래 기존 자료와 비교해 판단한다. 이 자료들은 이 문서 작성 과정에서 편집하지 않는다.

| 기준선 | exact ref | 이 문서에서의 용도 |
| --- | --- | --- |
| 최초 dev-ERP 설계 | commit `2ab4a28149ee03c5f889923581c7c6eebe2fbd37`; [`DESIGN.md`](DESIGN.md) 최초판 | 최초 철학과 데이터 최소형 |
| 현재 dev-ERP 설계 | 현재 [`DESIGN.md`](DESIGN.md) | 이후 확장과 현재 owner 경계 |
| root lifecycle | [`PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`](../../../../docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md) | 상위 task lifecycle authority |
| 시간·ID ontology | [`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../../../../docs/architecture/foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md) | typed ref, source revision, 시간·관계 authority |
| project context tree | [`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md) | trunk·branch·leaf·fruit 의미 기준 |
| 저장 owner 원안 | [`02_OWNER_BOUNDARIES_AND_STORAGE.md`](task_engine_redesign/02_OWNER_BOUNDARIES_AND_STORAGE.md), [`PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md`](../../../../docs/architecture/workspace/PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md) | LOCKED project/common, payload/metadata 저장 경계와 physical owner map |
| 장기 과제 생명수 | [`B9-STEM-RIVER-VIEW.md`](slices/B9-STEM-RIVER-VIEW.md), [`STEM-V2-ONTOLOGY.md`](slices/STEM-V2-ONTOLOGY.md), [`06_EXECUTION_FEEDBACK_AND_LIFE_TREE.md`](task_engine_redesign/06_EXECUTION_FEEDBACK_AND_LIFE_TREE.md) | 2~5년 시간 기둥·관문·세 종류 가지 기준 |
| 일일 과제 생명수 | [`ENGINE-12`](slices/ENGINE-12-CONTEXT-LIFE-TREE.md) | 날짜별 read-only 사건 projection 기준 |
| 맥미니 할일 엔진 계획 | commit `6eb2409d5a543bf06b2f544bfa72c3ba5bf28e49`; [`task_engine_redesign/README.md`](task_engine_redesign/README.md)와 `01`~`10` | 불변 계획 oracle |
| 실행 packet | [`ENGINE-13`](slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md) | 구현·검증 acceptance |
| 기존 개인/중앙 Codex 작업면 | [`CODEX_TEAM_WORKSPACE.md`](CODEX_TEAM_WORKSPACE.md), [`ERP-MCP-V0`](slices/ERP-MCP-V0.md), [`dev-erp-mcp README`](../../dev-erp-mcp/README.md) | AX target이 대체하지 말아야 할 현행 surface |
| 개발 예정 저장 authority | [`DEVELOPMENT_ROADMAP_V0.md`](../../../../docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md) | owner 승인 전 candidate의 위치·우선순위 |
| public code 분석 기준선 | commit `27ea53198fd01a283558c8b809184b82d3f002a2` | 문서 commit이 main을 전진시키기 전 현행 구현 비교점 |
| 고성능 PC 구현 snapshot | `origin/codex/task-engine-rag-v1` commit `927b3fb045ebf749077951417463c47f12a549bd` | 합성 구현 및 pilot 보고 비교점 |

고성능 PC branch의 `ID_CONTRACT_V1.md`, `temporal_identity.mjs`, `task_driver.mjs`,
`task_driver_persistence.mjs`는 이 구현 분석 기준선의 `main`에는 없다. 따라서 아래에서 🟨로 표시한
ID 형식은 **확인된 branch 구현**이지 현재 live runtime이나 정본 승격 완료를 뜻하지 않는다.

기준선 무변경 확인 명령은 다음과 같다. 현재 `main`에서는 exit `0`을 확인했다. 고성능 PC
구현 branch는 기존 `README`, `08`, `ENGINE-13`을 수정하고 `11`을 추가했으므로 현재는 이
관문을 통과하지 않는다. 이는 구현 실패가 아니라 **새 owner 지시 기준의 문서 drift**다. branch
통합 결과에서는 구현 상태를 이 문서 같은 별도 후속 문서로 옮기고 아래 명령이 다시 exit `0`이
되어야 한다.

```bash
git diff --exit-code 6eb2409d5a543bf06b2f544bfa72c3ba5bf28e49..HEAD -- \
  docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md \
  ui-workspace/apps/dev-erp/docs/slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md \
  ui-workspace/apps/dev-erp/docs/task_engine_redesign
```

기준선에 보완이 필요해도 원문을 고치지 않는다. 별도 후속 문서와 새 commit으로 차이를 기록한다.

최초판 자체는 다음처럼 exact commit에서 읽는다. 현재 working tree의 `DESIGN.md` 링크를 최초판으로 오해하지 않는다.

```bash
git show 2ab4a28149ee03c5f889923581c7c6eebe2fbd37:ui-workspace/apps/dev-erp/docs/DESIGN.md
```

고성능 PC에서는 먼저 drift를 숨기지 말고 다음 명령으로 이름만 기록한다.

```bash
git diff --name-status 6eb2409d5a543bf06b2f544bfa72c3ba5bf28e49..origin/codex/task-engine-rag-v1 -- \
  docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md \
  ui-workspace/apps/dev-erp/docs/slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md \
  ui-workspace/apps/dev-erp/docs/task_engine_redesign
```

## 2. 색과 판정 언어

| 표식 | 판정 | 의미 |
| --- | --- | --- |
| 🟦 `CURRENT` | 확인된 현행 | tracked 문서·코드에서 직접 확인 |
| 🟪 `TARGET` | 목표 | 승인 후 도달하려는 계약·구조 |
| 🟨 `OBSERVED/BRANCH` | 제한된 관찰 | 구현 branch나 부분 증거에서 확인됐지만 current/live 완료가 아님 |
| 🟧 `VERIFY_HP` | 현장 확인 | 고성능 PC의 실제 checkout·DB·binding·운영 상태 필요 |
| 🟥 `GATE` | 중단 | owner 승인이나 선행 검증 전 쓰기·활성화 금지 |
| 🟩 `PRESERVED` | 최초 의도 보존 | 최초 설계가 현재 구조에도 살아 있음 |
| ⬜ `PROJECTION` | 읽기 전용 view | 원장을 소유하지 않는 검색·표시·분석층 |

색은 보조 수단이다. 모든 표와 노드에 상태 글자도 함께 적는다.

### ASSUMPTIONS

- `AX Workspace`는 두 영상에서 얻은 문제의식을 설명하기 위한 **작업명**이다. 현재 public canon 명칭이 아니다.
- 현행 source-supported surface는 `CODEX_TEAM_WORKSPACE`, `ERP-MCP-V0`, `dev-erp-mcp`, 중앙 worker와 workflow job이다. AX target은 이를 폐기하지 않고 관계를 명확히 하는 후속 후보로 본다.
- `AgentRun`, `Agent Control Plane`, Engineering IQ loop는 owner-approved public contract가 아직 없는 TARGET candidate다. 이 문서는 구현 승인이나 roadmap 승격을 만들지 않는다.
- 생명수의 `뿌리`는 exact source·계약·결정 근거를 쉽게 보여주기 위한 TARGET 시각 용어다. 현재 context graph의 canonical node type이나 새 source truth라고 가정하지 않는다.
- 새 task ID를 apply 직전 ERP authoritative writer가 예약하는 방식은 HP branch의 미해결 gap을 닫기 위한 설계 후보이며 owner 승인 전 확정 계약이 아니다.
- Enterprise IQ 영상은 formal schema나 인과 검증이 아니고, AI-native-company 영상도 self-reported case study다. 두 영상은 pressure test와 후보 아이디어로만 사용한다.

## 3. ERP, proposed AX Workspace, Soulforge의 배치 가설

```mermaid
flowchart LR
  P["🟩 PRESERVED: 사람·팀<br/>판단과 최종 책임"]
  AX["🟪 TARGET candidate: AX Workspace<br/>각자 Codex + WorkSession<br/>근거·할일·도구·검증을 한 자리에서 사용"]
  ERP["🟦 CURRENT: dev-ERP<br/>project·core_item·gate·권한<br/>공식 현재 상태와 통제된 쓰기"]
  SF["🟦 CURRENT→TARGET: Soulforge<br/>canon·ontology·workflow·party<br/>workspace·evidence·PC 경계"]
  ACP["🟪 TARGET candidate: Agent Control Plane<br/>AgentRun·capability·budget·lease<br/>실행 시도와 receipt"]
  TAP["🟥 GATE: ERP task authoritative applier<br/>승인된 TaskDriver만 적용"]
  VIEW["⬜ PROJECTION<br/>시간축·life tree·RAG·Wiki·graph·dashboard"]
  GATE["🟥 GATE<br/>승인·정책·검증·rollback"]

  P <--> AX
  AX -->|후보·작업 요청| TAP
  ERP -->|승인된 task·상태| AX
  SF -->|계약·exact refs·workflow| AX
  SF -->|owner boundary| ERP
  AX -->|승인된 실행 요청| ACP
  ACP -->|결과·검증 receipt| TAP
  TAP --> ERP
  ERP --> VIEW
  SF --> VIEW
  GATE --> TAP
  GATE --> ACP

  classDef current fill:#d7ebff,stroke:#2468a2,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef gate fill:#ffd9dd,stroke:#a23b49,color:#222
  classDef kept fill:#dff4df,stroke:#397a3b,color:#222
  classDef view fill:#eeeeee,stroke:#666,color:#222
  class P kept
  class AX,ACP target
  class ERP,SF current
  class GATE,TAP gate
  class VIEW view
```

### 3.1 한 줄 책임

- **ERP**: 공식 project/task/gate/current state를 소유하고 승인된 mutation만 적용한다.
- **AX Workspace candidate**: 팀원이 자기 자리의 Codex와 함께 맥락을 찾고, 계획하고, 실행하고, 검증 결과를 제출하게 하려는 후속 업무면 가설이다.
- **Soulforge**: source truth 경계, stable ID·relation, ontology, workflow, evidence, PC 역할을 공통 계약으로 묶는다.
- **TaskDriver**: 어떤 task나 전이를 **왜, 왜 지금, 어떤 근거와 권한으로** 적용하는지 남기는 얇은 인과 backbone이다.
- **AgentRun candidate**: 누가 어떤 도구·모델·권한·예산으로 실제 실행을 시도했고 무엇을 검증했는지 남기려는 별도 실행 record다. public contract 승인 전 TaskDriver에 합치지 않는다.

이 자료들을 대조한 본 문서의 working hypothesis는 다음이다. owner가 확정한 doctrine이 아니다.

> 의미·지식·판단 기준은 별도 Engineering IQ 층에 있고, TaskDriver와 task/event loop는 그 판단을 업무로 적용하고 결과를 되돌려 주는 인과·실행·피드백 backbone이다.

### 3.2 영상의 문제의식과 현재 Soulforge의 대응

| 영상에서 얻은 가설 | source-supported CURRENT | 이 문서의 TARGET candidate | claim ceiling |
| --- | --- | --- | --- |
| 팀원마다 자기 AI 작업 자리가 필요 | 개인 Codex ERP MCP와 중앙 Codex worker가 이미 분리돼 있음 | 두 surface를 AX Workspace라는 사용자 경험으로 연결 | 설계 가설 |
| 조직 공통 맥락을 AI가 찾아야 함 | project workspace, RAG, Wiki, ontology, ERP current state | exact revision·relation·authority를 함께 전달 | 일부 target |
| agent 실행을 중앙에서 통제해야 함 | workflow job, worker permission probe, WorkSession receipt가 domain별로 존재 | 별도 Agent Control Plane과 AgentRun 계약 | future candidate |
| 실행 결과가 다음 판단으로 돌아와야 함 | completion/event/review surface가 분산돼 있음 | TaskDriver→task→verification→outcome→correction loop | ENGINE-13 이후 |
| 영상의 생산성·보안 주장이 사실임 | 독립 검증 자료 없음 | Soulforge pilot에서 자체 측정 | `UNKNOWN` |

## 4. 최초 설계 보존 감사

| 최초 의도 | `main`에서 관찰한 현재 | 고성능 PC branch | 판정 | VERIFY_HP |
| --- | --- | --- | --- | --- |
| 진실 1개, 업무/게임은 다른 view | `core_item.id`가 안정된 task identity이고 game 상태는 파생 | 기존 `core_item.id`를 projection target으로 유지 | 🟩 `PRESERVED` | 실제 중복 task truth·별도 장부 ID 충돌 |
| 모든 변화의 사건 이력 | `event_log`, `completion_log`, work event가 있음 | append-only Driver ledger와 replay 구현 | 🟨 부분 보존 | event 없는 writer·reopen 표본·replay parity |
| mutation과 event의 일관성 | status update와 event append가 별도 호출인 경로가 있음 | adapter는 transaction 적용을 합성 검증 | 🟪 보완 구현 | live DB에서 원자성·rollback·restore |
| 파일은 본문이 아니라 pointer/hash | `_workspaces` body, DB·metadata pointer 중심 | project-local RAG owner root와 path guard | 🟩 대체로 보존 | runtime DB의 본문 예외·raw 경계 |
| AI는 제안, 사람 승인 후 반영 | `ai_proposal`이 있으나 mail `--auto-open` 경로도 존재 | explicit authority/policy/idempotency 구현 | 🟨 계약 충돌 가능 | 실제 auto-open 활성값과 owner decision ref |
| project가 산출물 container | `project_id`, project hub, `_workspaces/<project>` | project-bound RAG와 typed ref | 🟩 `PRESERVED` | 실제 project/common 혼합·orphan |
| SE 절차와 gate가 작업 순서를 만듦 | stage/gate/deliverable/schedule surface 확장 | exact rule/event revision을 Driver 근거로 받을 수 있음 | 🟩 확장 | 실제 schedule adapter와 rule revision coverage |
| owner 단독→팀 read-only→쓰기 개방 | 문서상 단계적 활성화와 별도 gate 유지 | live writer는 의도적으로 미활성 | 🟩 정책 보존 | 실제 서비스·환경·계정 권한 |
| 고성능 PC는 검증 뒤 사용 | 별도 Plan-mode runbook 존재 | 합성 구현과 단일 RAG pilot 보고 | 🟨 진행 중 | 최신 main 통합·live TaskDriver·운영 primary |

### 4.1 구조가 커지며 생긴 부채

폴더 owner 배치는 대체로 맞다. 문제는 app 내부 책임 집중이다.

```text
🟦 CURRENT
core_item
  = 현재 작업 상태
  + SE 단계·완료 기준
  + 인입 출처·검토·라우팅 후보
  + 담당/역량 제안
  + lineage·generation·CSV sync·schedule anchor·parent

store.mjs
  = schema + migration + 여러 domain store

server.mjs
  = HTTP routing + 여러 domain application flow
```

파일 수가 많아서가 아니라, **현재 상태·판단 과정·근거·동기화 상태가 같은 행과 큰 모듈에 섞인 것**이 핵심 부채다.

TARGET 구현 시 새 top-level을 임의로 만들기보다 app 안에서 아래 책임을 분리하는 방향을 검토한다.

```text
task/        current store · transition · event · completion
intake/      mail · voice · schedule · file adapters · apply policy
agent/       WorkSession · AgentRun · managed worker · workflow job
projection/  life tree · calendar · graph · dashboard
```

이 폴더안은 구현 승인이 아니라 구조 검토안이다.

## 5. 할일 엔진 데이터 구조: CURRENT → 구현 branch → TARGET

| 책임 | 🟦 현재 `main` | 🟨 고성능 PC branch | 🟪 최종 TARGET |
| --- | --- | --- | --- |
| task current row | `core_item` 단일 상태축 | `core_item` compatibility projection | 얇은 current row + revision guard |
| task 이력 | `event_log`, `completion_log` | Driver/event append ledger + replay | 삭제 없는 `TaskEvent`와 결정적 replay |
| 후보 | `ai_proposal` 및 domain별 candidate | `TaskIntent` | 모든 input adapter가 `TaskIntent` 후보만 생성 |
| 인과·왜 지금 | 필드와 여러 이력에 분산 | `TaskDriver` 구현 | exact source/revision/relation/decision ref를 갖는 얇은 Driver |
| 판단/적용 상태 | task status와 섞이거나 domain별 | 별도 decision/application state | `candidate/review_required/approved/applied/rejected/superseded` |
| 실제 작업 상태 | `unclassified/open/doing/waiting/blocked/done/archived` | 별도 work-state validator와 legacy projection | `not_started/in_progress/waiting/blocked/done/cancelled/merged/archived`; legacy 의미는 owner 결정 |
| 적용 증거 | domain별 event/receipt | policy·digest·idempotency·SQLite adapter | `ApplicationReceipt` + atomic task mutation/event |
| 실행 시도 | workflow job, MCP WorkSession 등 분리 | TaskDriver와 아직 미통합 | owner 승인 뒤 별도 `AgentRun`, `CapabilityGrantRevision`, `VerificationReceipt` 후보 |
| 산출물 revision | `core_artifact`, deliverable, MCP artifact 등 분산 | RAG source/content revision 강화 | logical artifact와 immutable `ArtifactRevision` |
| 결과 학습 | 완료·event·review surface 분산 | follow-up candidate contract 합성 | expected→run→verify→actual→review→correction loop |

### 5.1 TaskDriver는 무엇을 담고, 무엇을 담지 않는가

```mermaid
flowchart LR
  SRC["🟨 OBSERVED partial: exact source/event/revision refs"] --> D["🟨 OBSERVED branch / 🟥 GATE live<br/>TaskDriver writer<br/>why · why-now<br/>target_intent_ref<br/>authority/policy ref<br/>valid_at · known_at<br/>digest · idempotency"]
  REL["🟨 OBSERVED partial: exact relation/decision refs"] --> D
  D --> REC["🟪 TARGET / 🟥 GATE live: ApplicationReceipt"]
  REC --> TASK["🟦 CURRENT: core_item current row"]
  REC --> EVT["🟨 OBSERVED partial / 🟪 TARGET: append-only TaskEvent"]

  RAW["🟥 GATE: 넣지 않음<br/>메일 본문·음성 transcript·RAG chunk<br/>전체 project context·실행 log"] -. pointer only .-> SRC

  classDef current fill:#d7ebff,stroke:#2468a2,color:#222
  classDef observed fill:#fff3bf,stroke:#8a6d00,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef gate fill:#ffd9dd,stroke:#a23b49,color:#222
  class TASK current
  class SRC,REL,D,EVT observed
  class REC target
  class RAW gate
```

TaskDriver가 모든 지식과 맥락을 복제하는 거대한 객체가 되면 revision drift, private payload 복제, 중복 truth가 생긴다. Driver는 immutable exact ref와 적용 근거만 보존하고 본문은 원 owner에서 읽는다.

### 5.2 두 상태축은 합치지 않는다

```text
TARGET 판단·적용 축:
candidate → review_required → approved → applied
    ├──────────────────────────────→ rejected
    └──────────────────────────────→ superseded

TARGET 실제 작업 축:
active = not_started | in_progress | waiting | blocked
active → done | cancelled | merged
done | cancelled | merged → archived

별도 policy/authority 유효성:
valid_from · expires_at · revocation event
  # expired/revoked는 decision_application_state 값이 아니다.

CURRENT ERP compatibility enum:
unclassified | open | doing | waiting | blocked | done | archived
  # target 두 축으로 옮길 때 정본 crosswalk와 owner 결정을 적용한다.
```

`approved`는 `doing`이 아니고, `applied`는 `done`이 아니다. 재오픈은 과거 completion occurrence를 지우지 않고 reversal/reopen event로 남기는 것이 TARGET이다.

### 5.3 ID 설계 원칙: 기존 ID는 지키고 새 인과 ID만 덧붙인다

ID는 사람이 읽는 긴 이름을 조합하는 방식이 아니다. 기본 규칙은 다음 다섯 가지다.

1. `project_code`, 기존 `core_item.id`, 기존 source/task/event ID처럼 owner가 이미 발급한 ID는 다시 hash ID로 바꾸지 않는다.
2. source revision, RAG projection, TaskIntent, TaskDriver처럼 새로 필요한 immutable record만 정해진 canonical basis에서 결정적으로 만든다.
3. 한 record는 **자기 ID 하나**를 갖고, 다른 개체는 typed ref로 가리킨다.
4. 제목, 파일명, 경로, 메일 subject, `mtime`, 현재 PC 이름은 identity에 넣지 않는다.
5. 짧은 표시 ID가 같아도 full basis나 full digest가 다르면 자동 병합하지 않고 collision으로 중단한다.

전역 관계키는 bare 문자열이 아니라 아래 세 필드 전체다.

```yaml
entity_type: task
owner_surface: dev_erp
entity_id: <existing-core-item-id>
```

따라서 같은 문자열이 source와 task에 각각 있어도 `{entity_type, owner_surface,
entity_id}`가 다르면 다른 개체다. consumer는 hash 의미를 다시 해석하지 않고 owner가 발급한
opaque ID처럼 다룬다.

### 5.4 실제 ID 구성표

| 개체 | 자기 ID와 구성 | 새 ID가 생기는 때 | 현재 판정 |
| --- | --- | --- | --- |
| Project | cross-system `project_code`; DB 정수나 다른 값은 owner-local alias | 새 과제 owner 등록 | 🟦 `CURRENT`, 기존 유지 |
| Gate | 현재 `core_stage.id`, stage code, `gate:<stage>` 계열을 project-qualified `gate_id`로 exact mapping | 새 관문 occurrence가 아니라 새 논리 gate일 때 | 🟧 crosswalk `VERIFY_HP` |
| Branch | `branch:<project_code>:<branch_key>` | 목적·시작·종결 조건이 다른 새 맥락 | 🟦 `CURRENT` |
| Task | 기존 `core_item.id`; 현재 `createItem()`은 `itm_<base36 clock><random hex>`를 발급하고 import ID는 보존 | 승인된 새 할일을 ERP writer가 한 번 발급 | 🟦 `CURRENT`; rekey 금지 |
| ERP event | 현재 `event_log.id`는 owner-local 정수 | application event append | 🟦 `CURRENT local` |
| B9 context projection nodes | `project:<project>`; source=`project+kind+sourceRef`, event=`project+sourceId`, task-candidate=`project+sourceId+task`, milestone=`project+label`의 SHA-1 앞 16hex를 각각 `source:<kind>:`, `event:`, `task:`, `milestone:` 뒤에 사용 | 같은 source metadata에서 재생성 | ⬜ `CURRENT projection`; `task:*`는 `core_item.id`가 아닌 candidate node |
| 일일 생명수 event | `life:<lane>:<sha256(lane, kind, sourceRef) 앞 24hex>` | projection 재생 시 결정적으로 계산 | ⬜ `CURRENT projection` |
| File lineage | `logical_file_id → revision_id → content_id` | 같은 논리 파일의 새 내용 occurrence | 🟦 `CURRENT` |
| Content | `content_basis=raw_bytes`이면 실제 byte, `canonical_record`이면 versioned canonicalization profile로 만든 결정적 byte의 `sha256:<64 lowercase hex>` | 해당 content basis의 byte가 바뀔 때 | 🟦 의미 확정; raw payload hash와 canonical record hash를 혼동 금지 |
| Source | `source_kind + owner_ref + owner-issued source_key + issuer_namespace`의 canonical digest → `src_<32hex>` | 새 논리 source | 🟨 HP branch 구현 |
| Source revision | `source_id + occurrence_key + content_id + canonicalization/published/effective/applicability` → `sr_<32hex>` | 내용·공식 판·효력·별도 발행 occurrence 변경 | 🟨 HP branch 구현 |
| Extraction run | source revision·extractor profile·run key·start·input refs → `exr_<32hex>` | 별도 추출 실행 | 🟨 HP branch 구현 |
| Evidence locator | source revision·locator kind·canonical coordinate → `loc_<32hex>` | exact page/section/table/record 위치 | 🟨 HP branch 구현 |
| RAG index | scope·정렬된 source revisions·parser/chunk/ACL/embedding profile → `ridx_<32hex>` | revision 집합이나 profile 변경 | 🟨 HP branch 구현 |
| RAG chunk | source revision·chunk profile·locator·chunk content·context refs → `rch_<32hex>` | source/chunk/locator/content 변경 | 🟨 HP branch 구현 |
| Task candidate | `dev_erp_task_engine`의 typed `task_candidate_ref` | 하나의 적용 후보 | 🟧 ID 발급 주체 `VERIFY_HP` |
| TaskIntent | kind·project·task/candidate·expected/proposed payload digest → `intent-<64hex>` | 서로 다른 생성·전이·patch 의도 | 🟨 HP branch 구현 |
| TaskDriver | immutable causal payload digest → `driver-<64hex>` | 서로 다른 원인·근거·의도 | 🟨 HP branch 구현 |
| Driver idempotency | project·Driver kind·exact trigger·target intent·intent digest → `task-driver:v1:<64hex>` | 같은 logical cause면 새로 만들지 않음 | 🟨 HP branch 구현 |
| Driver event | decision/application event payload digest → `driver-event-<64hex>` | candidate/review/approve/apply/reject/supersede occurrence | 🟨 HP branch 구현 |
| Apply receipt | apply event의 `event_id`를 primary key로 사용하고 별도 receipt digest 보존 | 같은 apply event에는 하나 | 🟨 HP branch 구현 |
| Artifact revision | 기존 logical `artifact_id` + immutable `artifact_revision_id`; file `revision_id`와는 relation으로 연결 | 산출물 내용·승인 판 변경 occurrence | 🟪 계약, allocator `UNKNOWN` |
| Verification/Outcome/AgentRun | 별도 owner와 ID가 필요하나 이번 branch에는 canonical builder 없음 | 승인된 후속 계약 뒤 | 🟧 `UNKNOWN` |

B9의 16hex SHA-1 값은 기존 context projection node를 결정적으로 다시 만들기 위한 local key다.
byte identity proof인 `content_id`나 HP branch의 새 SHA-256 identity profile을 대신하지 않는다.

`src_`, `sr_`, `exr_`, `loc_`, `ridx_`, `rch_`의 32hex는 표시·조인용이다. 실제
충돌 판정에는 `identity_basis`, canonical JSON, full `sha256:<64hex>`를 모두 보존한다.
TaskIntent·TaskDriver·Driver event는 branch 코드상 full 64hex digest를 ID에 사용한다.

### 5.5 같은 과제에서 ID가 이어지는 모습

```mermaid
flowchart LR
  P["🟦 CURRENT Project<br/>project_code"]
  B["🟦 CURRENT Branch<br/>branch:project:key"]
  G["🟧 VERIFY_HP Gate<br/>exact crosswalk 필요"]
  SR["🟨 OBSERVED/BRANCH<br/>HP SourceRevision · sr_…"]
  EV["🟪 TARGET<br/>source-bearing Event"]
  I["🟨 OBSERVED/BRANCH<br/>HP TaskIntent · intent-…"]
  D["🟨 OBSERVED/BRANCH<br/>HP TaskDriver · driver-…"]
  DE["🟨 OBSERVED/BRANCH<br/>HP apply DriverEvent"]
  T["🟦 CURRENT ERP Task<br/>기존 core_item.id"]
  TE["🟪 TARGET TaskEvent<br/>start · block · done · reopen"]
  AR["🟪 TARGET ArtifactRevision"]
  DEC["🟪 TARGET Decision ref"]
  VER["🟧 VERIFY_HP / UNKNOWN<br/>VerificationReceipt owner·ID"]
  OUT["🟧 VERIFY_HP / UNKNOWN<br/>Outcome owner·ID"]
  VIEW["⬜ PROJECTION<br/>B9 / 일일 생명수"]

  B -. belongs_to .-> P
  G -. belongs_to .-> P
  I -. project_ref .-> P
  EV -. sourced_from .-> SR
  D -. triggered_by .-> EV
  D -. target_intent_ref .-> I
  D -. justified_by .-> SR
  DE -. driver_ref .-> D
  DE -. result_task_ref .-> T
  TE -. task_ref .-> T
  EV -. on_branch .-> B
  T -. on_branch .-> B
  T -. at_gate .-> G
  EV -. projected .-> VIEW
  T -. projected .-> VIEW
  TE -. projected .-> VIEW
  AR -. projected .-> VIEW
  DEC -. projected .-> VIEW
  VER -. projected .-> VIEW
  OUT -. projected .-> VIEW

  classDef current fill:#d7ebff,stroke:#2468a2,color:#222
  classDef branch fill:#fff0b8,stroke:#9a7200,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef verify fill:#ffe0b2,stroke:#a85b00,color:#222
  classDef view fill:#eeeeee,stroke:#666,color:#222
  class P,B,T current
  class SR,I,D,DE branch
  class EV,TE,AR,DEC target
  class G,VER,OUT verify
  class VIEW view
```

화살표는 `relation source → target` 방향이다. 예를 들어 source revision이 Event나 Driver를
가리키는 것이 아니라, Event가 `sourced_from`으로 source revision을 가리키고 Driver가
`triggered_by`·`justified_by`·`target_intent_ref`로 exact 근거와 의도를 가리킨다.

여기서 가장 중요한 분리는 `source_revision_id ≠ task_id ≠ driver_id`다. 같은 메일 한 판에서
서로 다른 할일 두 개가 나올 수 있다.

```text
sr_<same-source-revision>
├─ candidate-A → intent-A → driver-A → core_item.id A
└─ candidate-B → intent-B → driver-B → core_item.id B
```

source ref는 재사용하지만 candidate·intent·Driver·task는 각각 다른 개체다. 새 task ID는
LLM, source adapter, RAG, life tree가 발급하지 않는다. 승인/apply 경계에서 ERP authoritative
writer가 한 번 예약·발급하고, 같은 Driver/idempotency key의 재시도는 새 task ID를 만들지
않아야 한다. HP branch는 apply event가 제공한 task ref를 그대로 삽입하므로 **그 예약·발급
authority는 아직 구현 밖의 gap**이다.

### 5.6 ID 설계 CURRENT / TARGET / VERIFY_HP

| 질문 | 🟦 CURRENT | 🟪 TARGET | 🟧 VERIFY_HP |
| --- | --- | --- | --- |
| 과제·할일 ID | `project_code`, `core_item.id`가 owner identity | 기존 ID 그대로 typed ref로 사용 | import·CSV·auto-open 포함 allocator와 collision |
| source/RAG ID | main에는 공통 6종 builder 없음 | exact revision lineage와 deterministic builder | HP branch golden fixture를 최신 main에서 재실행 |
| candidate→task | domain별 후보와 `createItem()`가 분리 | candidate에는 task ID가 없어도 되고 apply 직전 ERP writer가 한 번 예약 | branch가 task ref를 외부에서 받는 gap과 retry 경합 |
| 사건·context node ID | `event_log.id`, B9 `project:/source:/event:/task:/milestone:`, `life:*`가 owner/projection별로 분리 | owner event/task를 유지하고 typed crosswalk; Driver event 별도 | projection node를 owner entity로 오인한 join, orphan·ambiguous·fuzzy count |
| gate·branch | branch exact 형식은 존재, gate 표면은 여러 ID가 혼재 | project-qualified `gate_id`, exact `on_branch/at_gate` | stale branch, gate collision, legacy mapping |
| 산출물·검증·실행 | artifact·completion·WorkSession surface가 분산 | immutable artifact revision, verification/outcome, AgentRun 별도 ID | canonical owner·allocator·relation은 `UNKNOWN` |

## 6. 입력·시간·지식·실행의 전체 폐쇄루프

```mermaid
flowchart LR
  IN["🟦 CURRENT / 🟧 VERIFY_HP coverage<br/>메일·음성·SE 일정·지시·파일 관측"]
  REV["🟨 OBSERVED branch / 🟪 TARGET<br/>source occurrence/revision<br/>stable ID · valid_at · known_at"]
  KW["🟨 OBSERVED partial / 🟪 TARGET<br/>Ontology · project/common RAG · Wiki"]
  INT["🟨 OBSERVED branch / 🟥 GATE live<br/>TaskIntent 후보"]
  DRV["🟨 OBSERVED branch / 🟥 GATE live<br/>TaskDriver 인과·권한"]
  APP["🟥 GATE<br/>사람 승인 또는 bounded policy"]
  TASK["🟦 CURRENT: ERP task current + append event"]
  RUN["🟪 TARGET candidate: AgentRun/사람 실행"]
  OUT["🟨 OBSERVED partial / 🟪 TARGET exact<br/>artifact revision + verification receipt"]
  FB["🟪 TARGET: actual outcome + review + correction candidate"]
  VIEW["⬜ PROJECTION: 시간축·life tree·graph·dashboard"]

  IN --> REV
  REV --> KW
  REV --> INT
  KW --> INT
  INT --> DRV
  DRV --> APP
  APP --> TASK
  TASK --> RUN
  RUN --> OUT
  OUT --> FB
  FB --> INT
  REV --> VIEW
  TASK --> VIEW
  OUT --> VIEW

  classDef current fill:#d7ebff,stroke:#2468a2,color:#222
  classDef observed fill:#fff3bf,stroke:#8a6d00,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef verify fill:#ffe0b2,stroke:#a85b00,color:#222
  classDef gate fill:#ffd9dd,stroke:#a23b49,color:#222
  classDef view fill:#eeeeee,stroke:#666,color:#222
  class IN current
  class REV,KW,INT,DRV,OUT observed
  class RUN,FB target
  class APP gate
  class TASK current
  class VIEW view
```

### 6.1 각 지식 도구가 맡을 일

| 도구 | 맡을 일 | 맡으면 안 되는 일 |
| --- | --- | --- |
| RAG | exact source revision의 관련 구간 검색과 locator 반환 | source truth, 승인, task state 대체 |
| Wiki | 사람이 읽는 개념·결정·절차의 source-bound 설명 | 근거 없는 공통 상식으로 canon 덮기 |
| Ontology | 요구사항·기능·인터페이스·위험·검증·결정 관계 | 원문이나 업무 current row 복제 |
| Workflow | gate·적용 조건·stop condition·반복 절차 | owner authority 없이 자동 적용 |
| TaskDriver | 근거·판단·권한과 task mutation의 인과 연결 | 본문·전체 context·AgentRun log 저장 |
| ERP | 승인된 current state와 task mutation | 모든 지식·모델 학습 저장소가 되기 |
| Agent Control Plane candidate | owner 승인 뒤 모델·도구·권한·budget·execution receipt | task의 왜와 task truth 소유 |

RAG만으로 “체계공학을 학습했다”고 말할 수 없다. RAG는 검색 가능한 기억이다. Engineering IQ에 가까워지려면 의미 관계, authority, 적용 조건, 대안과 기각 사유, expected→actual→correction loop가 함께 있어야 한다.

### 6.2 머신러닝은 첫 관문이 아니다

1. **지금 필요한 핵심**: stable ID, exact revision, relation, rule/gate, TaskDriver, receipt, replay, review candidate.
2. **그 다음 운영 학습**: 사람이 승인한 판단과 outcome으로 rule·workflow·Wiki·ontology 후보를 개선한다.
3. **나중의 모델 학습 후보**: 충분한 품질의 outcome label과 명확한 예측 목표가 있을 때 ranking/classification/fine-tuning을 검토한다.

즉 Engineering IQ의 초기 형태는 “큰 모델을 새로 학습”하는 것이 아니라, 조직의 판단을 근거와 결과까지 재생 가능한 harness로 만드는 것이다. 모델 학습은 이 데이터가 쌓인 뒤 특정 성능 문제가 확인될 때만 채택한다.

### 6.3 아홉 영역을 한눈에 보는 CURRENT / TARGET / VERIFY_HP

| 영역 | 🟦 CURRENT | 🟪 TARGET | 🟧 VERIFY_HP |
| --- | --- | --- | --- |
| 메일 | `core_mail`, 수집 이력, review/auto-intake surface가 있으나 causal ref가 분산됨 | exact message occurrence와 revision에서 TaskIntent 후보 생성 | mailbox coverage, 누락 구간, 실제 auto-open caller·policy |
| 음성 | capture/transcript provenance와 후보 surface가 별도 흐름으로 존재 | recording→transcript revision→발화 locator를 잇고 후보만 전달 | Mac mini primary, speaker/project binding, 중복·누락·시간 정렬 |
| SE 일정 | stage/gate/schedule/rule 계약은 있으나 통합 causal loop가 없음 | exact rule/event revision을 `why-now` 근거로 사용 | 실제 일정 owner, rule revision, gate가 만든 task와 event parity |
| 파일 이력 | workspace file, artifact, deliverable, MCP artifact가 여러 surface에 나뉨 | logical file/artifact와 immutable revision, content ID, observation 분리 | PC별 관측 중복, 삭제 authority, sole reconciler, orphan revision |
| 시간축 | ENGINE-12와 여러 source-local timestamp가 read model 기반을 가짐 | `valid_at`/`known_at` cut으로 source·Driver·task·outcome 재생 | ledger gap, clock regression, timezone·source capability |
| RAG·Wiki | common-root legacy와 project별 자료가 혼재하며 main에는 V1 branch가 없음 | project/common owner 분리, exact revision locator, source-bound Wiki | legacy consumer map, derived-text V1, query/ref parity, ACL |
| ID·관계 | `core_*` ID와 domain ref는 있으나 source/RAG/task exact chain이 분산됨 | typed stable ID로 source→revision→relation→Driver→task→outcome 연결 | legacy occurrence·ERP ID crosswalk, collision·fuzzy join 비율 |
| TaskDriver | 현재 `main`에는 통합 Driver/two-axis runtime이 없음 | 얇은 causal record, authority, atomic apply, event, replay | branch 통합, live schema, 상태 의미, writer identity, 1~3 task pilot |
| PC 역할 | 문서상 역할과 personal MCP가 있으나 실제 primary/binding은 local state | 사람·seat·node·worker·reconciler ID를 분리하고 writer 하나만 허용 | `tool_pc`, `always_on_node`, operational-primary, sole reconciler 증거 |

### 6.4 같은 과제의 생명수는 두 개의 렌즈다

최초 설계에는 이미 장기 나무와 일일 나무가 있다. 둘을 하나의 새 원장으로 합치는 것이 아니라,
source-local 여러 owner record와 task/project metadata를 서로 다른 질문으로 읽는다.

| 렌즈 | 답하는 질문 | 모양 | 현재 상태 |
| --- | --- | --- | --- |
| 장기 B9 지도 | 이 과제에서 한 목적의 일이 어디서 시작해 어떻게 끝났는가 | `Project → Gate → Branch → 사건 → 종결/열매` | 🟦 B9a·B9b·B9c 구현, 지식 역링크 B9d 대기 |
| ENGINE-12 일일 생명수 | 특정 날짜에 무슨 사건이 있었는가 | `Project → Day → confirmed context → Event` | 🟦 read-only API/UI 구현; 4-PC 일반 파일 live 수집은 보류 |
| 내부 context graph | 가지 간 dependency·reference·merge·move는 무엇인가 | 한 primary tree parent + 별도 cross-link | 🟦/🟪 owner metadata와 target relation 혼합 |

장기 B9는 2~5년의 프로젝트 생애를, 일일 렌즈는 30~90일의 사건 창을 읽는다. 일일 `day`
node는 API 응답에서만 만들고 `branches.csv`나 `nodes.csv`에 쓰지 않는다. 어느 쪽도
**조회 projection을 만드는 것만으로** `core_item`, source ledger, project context를 변경하지
않는다. B9의 drag/reattach는 조회가 아니라 사람이 확정하는 별도 mutation command이며,
같은 task ID를 유지한 `item_reanchor` event와 owner write 경계를 거쳐야 한다.

### 6.5 나무의 정확한 문법

| 나무 표현 | 실제 개체와 의미 | ID·관계 | 상태 |
| --- | --- | --- | --- |
| 뿌리 | 계약·요구·owner decision·exact source revision처럼 과제가 왜 생겼는지 보여주는 근거 | `triggered_by`, `justified_by`, `sourced_from` | 🟪 **TARGET 시각 계층**; 현행 canonical node 아님 |
| 기둥 | Project identity, scope, mission, 2~5년 SE 시간축 | `project_code` | 🟦 `CURRENT` |
| 큰 마디 | SRR·PDR·CDR·milestone | `gate_id`, `at_gate` | 🟦 개념 존재; ID crosswalk 🟧 |
| 골격줄기 | gate·산출물 그룹·계약·일정·구매·품질 뼈대 | `branch_kind=skeleton` | 🟦 `CURRENT` |
| 작업줄기 | 승인된 한 건의 할일처럼 시작과 끝이 있는 일 | `branch_kind=work`, task exact ref | 🟦 `CURRENT` |
| 이력줄기 | 회의·정기보고처럼 회차가 계속 붙는 흐름 | `branch_kind=history`, occurrence refs | 🟦 `CURRENT` |
| 점·잎 | 메일 수신/발신, 음성, 일정, 파일 관측, task 전이, 산출물 등록 사건 | exact event/source/task refs | 🟦 부분 `CURRENT` |
| 열매 | 완료 task, accepted result, decision, 제출 산출물, 종결·검증 근거 | completion event, `artifact_revision_id`, outcome refs | 🟨 일부 CURRENT; exact 묶음은 TARGET |

`PDR/CDR`은 기본 가지가 아니라 시간 기둥 위의 관문이다. 실제 일이 끝나는 단위는 bounded
`branch_id`다. 한 task/event는 primary 가지 하나에 두고, 다른 가지와의 dependency/reference는
점선 cross-link로 보존한다. graph에 여러 관계가 있다고 tree parent를 여러 개로 만들지 않는다.

```mermaid
flowchart LR
  ROOT["🟪 TARGET 뿌리 보기<br/>계약·요구·결정·exact source revision"]
  TRUNK["🟦 CURRENT Project 기둥<br/>2~5년 시간축"]
  G1["🟦 CURRENT SRR 개념<br/>🟧 exact ID VERIFY_HP"]
  G2["🟦 CURRENT PDR 개념<br/>🟧 exact ID VERIFY_HP"]
  G3["🟦 CURRENT CDR 개념<br/>🟧 exact ID VERIFY_HP"]
  B1["🟦 CURRENT 작업줄기 A<br/>born_at → closed_at"]
  B2["🟦 CURRENT 이력줄기 B<br/>회차가 계속 추가"]
  L1["🟦 CURRENT 사건 잎<br/>메일·음성·일정·파일·task event"]
  F1["🟪 TARGET 열매 view<br/>exact result refs"]
  N1["🟪 TARGET follow-up Driver 후보"]

  ROOT --> TRUNK --> G1 --> G2 --> G3
  B1 -. belongs_to .-> TRUNK
  B2 -. belongs_to .-> TRUNK
  B1 -. "anchor_ref · CURRENT field" .-> G1
  B2 -. "anchor_ref · CURRENT field" .-> G2
  L1 -. on_branch .-> B1
  L1 -. at_gate .-> G1
  F1 -. "projects exact result refs" .-> L1
  N1 -. "triggered_by completion event" .-> L1
  B1 -. exact cross-link .-> B2

  classDef current fill:#d7ebff,stroke:#2468a2,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef verify fill:#ffe0b2,stroke:#a85b00,color:#222
  class ROOT,F1,N1 target
  class TRUNK,B1,B2,L1 current
  class G1,G2,G3 verify
```

실선 `TRUNK→Gate`는 화면의 시간축 진행을 뜻하고 persisted relation 방향이 아니다. 점선은
record의 source→target ref 방향이다. Branch는 Project에 `belongs_to`, Event/Task/ArtifactRevision은
필요할 때 Branch에 `on_branch`, Gate에 `at_gate`로 연결한다.

열매가 생겼다는 사실만으로 task를 자동 완료하지 않는다. completion authority와 exact evidence가
있는 task event가 먼저고, 열매는 그 결과를 보여주는 node다. 반대로 완료는 지식 후보나
`completion_followup` Driver 후보를 만들 수 있지만 새 task를 조용히 열지 않는다.

### 6.6 장기 지도와 일일 렌즈가 같은 ID를 읽는 법

```text
Project project_code
├─ Gate gate_id                            # 시간 기둥의 마디
├─ Branch branch:<project_code>:<key>      # bounded 맥락
│  ├─ Event owner ref                      # 실제 발생/관측/전이
│  │  └─ source_revision_ref 0..N          # source-bearing일 때만
│  ├─ Task item:<core_item.id>
│  │  └─ TaskDriver/TaskEvent refs          # TARGET 인과·전이
│  └─ Fruit refs                           # completion/artifact/decision/outcome
└─ Daily projection
   └─ Day                                  # response-local, canonical ID 없음
      └─ confirmed Branch 또는 확인 필요
         └─ life:<lane>:<digest> Event      # projection-local ID
```

`branch_key`만 있거나 저장된 `branch_id`가 `branch:<project_code>:<branch_key>`와 다르면
confirmed relation으로 올리지 않는다. task link도 `item:<core_item.id>` exact link만 확정한다.
제목 유사도, 가까운 시각, LLM 추측은 candidate/review 상태까지만 허용한다.

projection-local `life:*` ID, SQLite `event_log.id`, source owner event ID, `driver-event-*`는
서로 다른 namespace다. TARGET adapter는 이들을 하나로 덮어쓰지 않고 typed crosswalk와 exact
relation으로 연결해야 한다.

B9의 `source:*`, `event:*`, `task:*`, `milestone:*`도 projection-local node ID다. 특히
`task:<sha1…>`는 action-required metadata에서 만든 `task_candidate` node이지 ERP
`core_item.id`가 아니다. 이름이 비슷하다는 이유로 실제 task/event ID와 join하지 않는다.

### 6.7 수정·재개·개정·재생 규칙

| 동작 | 🟦 CURRENT | 🟪 TARGET | 🟧 VERIFY_HP |
| --- | --- | --- | --- |
| reanchor | 같은 `core_item.id`의 anchor 필드를 바꾸고 `item_reanchor` from/to event append | task ID 유지, 옛 `on_branch/at_gate` relation의 유효구간도 replay 가능하게 보존 | 변경 전후 branch/gate exact ref와 B9 재생 |
| reopen | `done_at`을 null로 만들고 최신 `completion_log` 한 행 삭제 | completion occurrence·열매를 삭제하지 않고 reopen/reversal event append | 실제 삭제 표본 수, 재완료·두 번째 reopen parity |
| revision | 파일은 logical ID 아래 새 revision; source/artifact exact revision은 부분 계약 | 이전 판을 덮지 않고 새 immutable occurrence + `supersedes`; `A→B→A`도 세 번째 revision | file/source/artifact allocator와 crosswalk |
| branch move/merge/close | 사람 reattach event와 mutable current link가 존재 | 과거 관계를 지우지 않고 move/merge/close event로 replay | primary parent 하나, cross-link 별도 유지 |
| replay | source별 부분 이력과 mutable current row가 섞임 | source event + Driver + task event를 두 cutoff로 재생해 task·B9·일일 렌즈가 같은 결과 | 두 번 replay digest parity, gap/quarantine |

같은 task와 같은 목적을 단순 재개하면 같은 `task_id`/`branch_id`에 새 reopen interval을 붙이는
쪽이 자연스럽다. 목표·산출물·종결 조건이 달라진 후속 일이라면 새 task/branch와
`completion_followup` Driver 후보로 분리한다. 이 경계는 owner가 사례로 확정해야 하며 구현자가
제목 유사도로 결정하면 안 된다.

시간도 ID에 섞어 한 `created_at`으로 만들지 않는다.

```text
valid_at = 현실·업무상 그때 무엇이 발생하거나 유효했는가
known_at = 그 시점까지 시스템이 무엇을 알고 기록했는가

저장 clock = occurred_at · observed_at · recorded_at · ingested_at
             received_at · planned_for · published/effective · project_applied_at
```

CURRENT ENGINE-12는 여러 clock, date-only, 날짜 미상, skew, gap을 보존하지만 완전한
`valid_at + known_at` query/replay는 아직 TARGET이다. 늦게 들어온 사건을 과거에 알고 있던 것처럼
표시하거나 최신 source/rule/task state를 과거 판단에 끼워 넣지 않는다.

## 7. 파일·저장소 구조

이 절은 새 폴더 제안이 아니다. 최초 할일 엔진 계획의
[`02_OWNER_BOUNDARIES_AND_STORAGE.md`](task_engine_redesign/02_OWNER_BOUNDARIES_AND_STORAGE.md)에
이미 `LOCKED`된 저장 경계와 그 문서가 참조한 project knowledge storage contract를 빠짐없이
펼쳐 보인 것이다. 실제 폴더 생성·이동·junction 변경은 이 문서 범위가 아니다.

### 7.1 원안 누락 감사

| 원안의 잠긴 항목 | 이전 이 문서 §7 상태 | 이번 반영 | 판정 |
| --- | --- | --- | --- |
| project extraction의 `derived_text`·manifest·Wiki | 상위 `reference_payloads/rag`만 표시 | exact project 하위 경로 복원 | 🟩 `PRESERVED` |
| project RAG의 index·trace·answer·review·work card | RAG root만 표시 | 다섯 asset owner 복원 | 🟩 `PRESERVED` |
| project source ledger·binding·revision event·ontology event·receipt | `_workmeta`를 일반 설명으로만 표시 | metadata-only 하위 owner 복원 | 🟩 `PRESERVED` |
| cross-project common source·Wiki·RAG payload | 표시 없음 | `_workspaces/knowledge/**` owner 복원 | 🟩 `PRESERVED` |
| common ledger·receipt·access metadata | system run만 표시 | `_workmeta/system/**` owner 복원 | 🟩 `PRESERVED` |
| `_workspaces/system/rag` | 표시 없음 | metadata-only manifest/navigation output로 복원 | 🟩 `PRESERVED` |
| legacy project RAG migration | 검증표에만 축약 | 모든 asset·consumer·rollback 경계 복원 | 🟩 `PRESERVED` |
| TaskDriver physical store | 구현 파일만 표시 | **아직 열린 결정이며 임의 경로 생성 금지**를 복원 | 🟧 `VERIFY_HP` |

### 7.2 원안의 LOCKED 저장 표

| 대상 | 잠긴 target owner |
| --- | --- |
| project 원본·첨부·추출본문 | `_workspaces/<project_code>/**` |
| project extraction | `_workspaces/<project_code>/reference_payloads/knowledge_extract/**` |
| **project RAG payload 전체** | `_workspaces/<project_code>/reference_payloads/rag/**` |
| project Wiki/private canon payload | `_workspaces/<project_code>/reference_payloads/knowledge_extract/**/wiki/**` |
| project metadata·ontology·receipt | `_workmeta/<project_code>/**` |
| cross-project common source·Wiki·source-text RAG payload | `_workspaces/knowledge/**` |
| system metadata-only RAG manifest·navigation output | `_workspaces/system/rag/**` |
| common metadata·ledger·receipt·access history | `_workmeta/system/**` |

`_workspaces/knowledge/rag/**`에 project code prefix를 붙였다는 이유만으로 project owner가
되는 것은 아니다. 그 경로는 TARGET에서 common-only이고, 그 안의 현행 project asset은
`CURRENT legacy migration input`이다.

### 7.3 전체 physical owner map

```text
🟦 public Git: Soulforge/
├─ AGENTS.md                                  # 현재 최상위 agent 지침
├─ docs/architecture/foundation/              # ID·ontology·roadmap·실행 계약
├─ docs/architecture/workspace/               # workspace·task lifecycle authority
├─ .registry/knowledge/<knowledge_id>/
│  └─ knowledge.yaml                          # review된 public-safe reusable canon만
├─ .registry/ · .unit/                        # species/class와 active subject canon
├─ .workflow/ · .party/ · .mission/           # 실행 계약·재사용 orchestration·held plan
├─ guild_hall/                                # cross-project public contract·runner·RAG 도구
└─ ui-workspace/apps/
   ├─ dev-erp/                                # ERP current state·task plane·UI
   │  ├─ src/ · server.mjs · tools/ · test/
   │  └─ docs/
   │     ├─ task_engine_redesign/             # 🔒 맥미니 불변 계획 기준선
   │     ├─ slices/ENGINE-13...                # 🔒 실행 acceptance 기준선
   │     └─ AX_WORKSPACE...V0.md               # 이 별도 비교·검증 계획
   └─ dev-erp-mcp/                            # 개인 Codex WorkSession pilot

🟨 local/private payload: _workspaces/
├─ <project_code>/                            # 한 과제의 실제 파일·지식 payload
│  ├─ <owner-approved source folders>/        # 실제 이름은 VERIFY_HP
│  └─ reference_payloads/
│     ├─ knowledge_extract/<batch_id>/
│     │  ├─ derived_text/
│     │  ├─ extract_manifest.json
│     │  └─ wiki/                             # project Wiki/private-canon body
│     └─ rag/
│        ├─ indexes_local/source_text_indexes/
│        ├─ traceability_sidecars/
│        ├─ answer_runs/
│        ├─ source_text_quality_reviews/
│        └─ source_text_work_cards/
├─ knowledge/                                 # 특정 과제가 아닌 cross-project common
│  ├─ common/company/<source_set_id>/derived_text/
│  └─ rag/                                    # common-only RAG target
└─ system/rag/                                # metadata-only manifest/navigation output

🟦 companion private metadata: _workmeta/
├─ <project_code>/
│  ├─ bindings/<set_id>_source_roots.yaml
│  ├─ reports/source_research/<set_id>_metadata_source_ledger.yaml
│  ├─ knowledge/source_revision_records/
│  ├─ knowledge/source_revision_events/<YYYY-MM>.jsonl
│  ├─ ontology/knowledge_bindings/events/<YYYY-MM>.jsonl
│  ├─ knowledge_ingest_receipts/events/<YYYY-MM>.jsonl
│  ├─ runs/<run_id>/                          # 판단·검증 metadata
│  └─ reports/<source-owner ledgers>/         # exact CURRENT path는 VERIFY_HP
└─ system/
   ├─ reports/source_research/<set_id>_metadata_source_ledger.yaml
   ├─ knowledge_ingest_receipts/events/<YYYY-MM>.jsonl
   ├─ reports/knowledge_access/**
   └─ runs/<run_id>/                          # Git/schema/writer/review evidence

🟥 dev-ERP runtime DB
├─ core_item                                  # task current state
└─ event_log · completion evidence            # task 사건 근거

🟥 local-only cross-project runtime: guild_hall/state/**
└─ active ingress·operations·local binding; public Git 금지

🟥 cross-PC protected mirror: private-state/
└─ 승인된 continuity subset만 mirror·sync; active runtime truth로 임의 사용 금지
```

### 7.4 지식과 할일의 exact 연결

폴더 경로만 TaskDriver 근거로 쓰지 않는다. 원안의 저장 owner와 §5의 ID 계약은 다음처럼
revision ref로 연결된다.

```text
project payload bodies
  _workspaces/<project_code>/**
    ├─ source original / derived_text
    ├─ RAG index / chunk / trace / answer / review / work card
    └─ Wiki body
         │ exact ID·revision·locator·pointer·receipt만
         ▼
project metadata
  _workmeta/<project_code>/**                 # body/chunk 금지
    └─ source_revision / Wiki·knowledge revision refs
         │ justified_by / uses
         ▼
       TaskDriver → core_item.id → task event/result

common source body
  _workspaces/knowledge/**
        └─ common metadata: _workmeta/system/**
             └─ review 통과 시에만 .registry/knowledge/** public-safe canon
```

project private Wiki가 owner-declared canon이어도 body는 project workspace에 남고, TaskDriver는
bare path가 아니라 exact `wiki_revision_id + content_id + owner_decision_ref`를 가리킨다.
`.registry/knowledge`는 별도 public-safe reusable canon이며 private project body를 흡수하지 않는다.

### 7.5 legacy migration과 금지선

현행 project RAG 중 `_workspaces/knowledge/rag/**`를 쓰는 것은 TARGET이 아니라 legacy input이다.
index만 옮기는 것이 아니라 `traceability_sidecars`, `answer_runs`, quality review, work card와 모든
consumer를 함께 분류한다.

```text
read-only inventory
  → project | common | unresolved | conflict 분류
  → old ref → target ref dry-run + collision + consumer + rollback source
  → ERP/RAG/Wiki/source-card consumer 합성 crosswalk
  → owner 승인된 one-project copy/rebuild pilot
  → hash·lineage·query parity와 rollback
  → activation 결정 뒤에만 legacy project write 금지
```

gate 전 writer를 조용히 redirect하지 않는다. gate 뒤 legacy write가 생겨도 자동 복사하지 않고
fail closed + migration alert로 보낸다. TaskDriver의 최종 table/ledger 위치 역시 열린 migration
결정이므로, 현재 지도 아래에 새 임의 폴더를 만들지 않는다. one-project pilot에서도 source
original과 legacy index를 삭제하지 않고 copy/rebuild·readback·rollback 증거가 닫힌 뒤에만
별도 activation 결정을 한다.

### 7.6 저장 규칙

- public Git: 안정된 계약, 구현 코드, 합성 fixture/test, 식별정보를 제거한 상태 문서만 저장한다.
- `_workspaces`: 실제 업무 본문과 파일 body를 저장한다.
- `_workmeta`: metadata-only contract, pointer, digest, count, relation, decision, receipt와 redacted validator/review/worklog evidence를 저장한다. raw/source body는 저장하지 않는다.
- `_workspaces/<project_code>`와 `_workmeta/<project_code>`는 한 project owner pair이고, common 자료를 섞지 않는다.
- `_workspaces/knowledge`와 `_workmeta/system`은 특정 project가 아닌 common owner pair다.
- `_workspaces/system/rag`는 common source body 창고가 아니라 metadata-only system output이다.
- HWP 원문은 직접 본문 분석하지 않는다. owner-approved worksite에서 먼저 HWPX 파생본으로 저장/export하고, 그 HWPX를 derived-text extraction에 넣는다.
- `_workmeta`에는 raw question, source body, chunk, answer body를 넣지 않고 query/source fingerprint와 exact pointer·receipt만 둔다.
- `guild_hall/state`: 이 PC의 local-only cross-project runtime state를 저장한다.
- `private-state`: 다른 PC로 넘길 승인된 protected continuity subset을 mirror한다.
- RAG index/chunk도 project payload이면 `_workspaces/<project_code>` owner 아래 둔다.
- 실제 project code/name, 메일 제목·주소·본문, transcript, 파일명·절대경로, hostname/IP/account, credential은 이 public 문서나 public 검증 로그에 쓰지 않는다.

### 7.7 ID·할일·생명수를 실제로 소유하는 파일

| 파일 | 소유 내용 | 판정 |
| --- | --- | --- |
| `src/store.mjs` | CURRENT `core_item`, `event_log`, `completion_log`, task ID 발급·상태·reanchor/reopen | 🟦 실행 코드; 책임 집중 부채 포함 |
| `tools/haengbogwan_project_context.mjs` | CURRENT B9 project/source/event/task-candidate/milestone projection ID builder | 🟦 실행 코드; owner entity ID와 구분 |
| `src/context_life_tree.mjs` | CURRENT 일일 생명수 event ID, exact task/branch binding, read-only projection | 🟦 실행 코드 |
| `src/file_activity_life_tree_projection.mjs` | reconciler-owned file event projection의 strict reader | 🟦 실행 코드; live 4-PC 수집 보류 |
| `task_engine_redesign/02_OWNER_BOUNDARIES_AND_STORAGE.md` | project/common, payload/metadata의 LOCKED owner map과 migration gate | 🔒 맥미니 불변 계획 |
| `docs/slices/B9-STEM-RIVER-VIEW.md` | 장기 과제 기둥·관문·가지·잎·열매의 owner 비전 | 🔒 기존 기준선, 수정 금지 |
| `docs/slices/STEM-V2-ONTOLOGY.md` | skeleton/work/history 세 가지 줄기와 exact link 등급 | 🔒 기존 기준선, 수정 금지 |
| `docs/slices/ENGINE-12-CONTEXT-LIFE-TREE.md` | 일일 생명수 시간·lane·API·read-only 계약 | 🔒 기존 기준선, 수정 금지 |
| `task_engine_redesign/03`~`06` | ID·시간·RAG·Driver·feedback·생명수 목표 설계 | 🔒 맥미니 불변 계획 |
| root `TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md` | 공통 ID, typed ref, source revision, `valid_at/known_at`, 관계 authority | 🟦 public contract |
| root `PROJECT_TASK_ENGINE_LIFECYCLE_V0.md` | `core_item.id` 유지, TaskDriver, 두 상태축, replay target | 🟦 `canon_candidate` |
| HP branch `ID_CONTRACT_V1.md`·`temporal_identity.mjs` | source/RAG deterministic ID 실행 profile | 🟨 branch-only, 통합 전 |
| HP branch `task_driver*.mjs` | TaskIntent·Driver·Driver event·SQLite adapter | 🟨 branch-only, live 미검증 |

즉 기존 계획과 owner 비전은 그대로 비교 기준으로 두고, 구현 통합 시에는 branch의 code/test만
검토한다. branch가 수정한 기존 계획 파일은 가져오지 않는다.

## 8. PC와 개인 Codex 자리

물리 PC, 사람, Codex 계정, runtime role은 같은 ID가 아니다.

```mermaid
flowchart TB
  PERSON["🟩 PRESERVED: employee identity<br/>책임·승인 범위"]
  SEAT["🟪 TARGET candidate: personal Codex seat<br/>account + WorkSession + project scope"]
  WORK["🟦 CURRENT role: work_pc<br/>업무 원문·project body"]
  PORT["🟦 CURRENT role: portable_dev_pc<br/>public-safe 설계·개발"]
  TOOL["🟧 VERIFY_HP: tool_pc<br/>고성능 build·RAG·합성 검증"]
  NODE["🟧 VERIFY_HP: always_on_node<br/>voice/watchdog/gateway"]
  WORKER["🟪 TARGET candidate: dev_worker_pc<br/>승인된 managed AgentRun"]
  FPKT["🟧 VERIFY_HP: immutable file observation packet"]
  FREC["🟥 GATE: sole file-activity reconciler<br/>logical file/revision projection만 씀"]
  FVIEW["⬜ PROJECTION: file/revision view + receipt"]
  CAND["🟨 OBSERVED branch / 🟥 GATE live<br/>TaskIntent·Driver 후보·AgentRun receipt"]
  TWR["🟥 GATE: ERP task authoritative writer<br/>승인된 TaskDriver만 적용"]
  ERP["🟦 CURRENT: dev-ERP task truth"]

  PERSON --> SEAT
  SEAT --> WORK
  SEAT --> PORT
  SEAT --> TOOL
  WORK --> FPKT
  TOOL --> FPKT
  NODE --> FPKT
  FPKT --> FREC
  FREC --> FVIEW
  FVIEW -. exact file ref .-> CAND
  SEAT -->|proposal only| CAND
  NODE -->|voice candidate only| CAND
  WORKER -->|execution receipt only| CAND
  CAND --> TWR
  TWR --> ERP

  classDef current fill:#d7ebff,stroke:#2468a2,color:#222
  classDef observed fill:#fff3bf,stroke:#8a6d00,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef verify fill:#ffe0b2,stroke:#a85b00,color:#222
  classDef gate fill:#ffd9dd,stroke:#a23b49,color:#222
  classDef kept fill:#dff4df,stroke:#397a3b,color:#222
  classDef view fill:#eeeeee,stroke:#666,color:#222
  class PERSON kept
  class WORK,PORT,ERP current
  class CAND observed
  class SEAT,WORKER target
  class TOOL,NODE,FPKT verify
  class FREC,TWR gate
  class FVIEW view
```

### 8.1 권장 역할

| 역할 | 권장 책임 | 금지 또는 gate |
| --- | --- | --- |
| 직원 자리의 Codex | 검색, 계획, draft, candidate, 선택된 task 실행, verification 제출 | owner authority 없는 task apply·공식 산출물 승격 |
| work_pc | 업무 원문과 project body의 사람 작업 | 다른 project/private body 무단 수집 |
| portable_dev_pc | public-safe 문서·합성 코드·리뷰 | private binding 추정, live writer 활성화 |
| 고성능 `tool_pc` | 최신 main 통합 검증, RAG build, 합성 replay, bounded pilot 준비 | operational-primary를 hostname으로 추정 |
| Mac mini `always_on_node` 후보 | voice capture/watchdog/gateway, source-local event | 직접 ERP task 생성, file reconciler나 task writer 자임 |
| managed worker | 승인된 AgentRun candidate와 receipt | TaskDriver/ERP와 별도 task truth 생성, direct task write |
| sole file-activity reconciler | node observation에서 logical-file/revision current state, projection, receipt만 씀 | `core_item`, TaskDriver, mail/source truth write |
| ERP task authoritative writer/TaskDriver applier | 승인된 Driver를 atomic task mutation+event로 적용 | file reconciler 권한을 빌리거나 둘 이상의 task writer 허용 |

한 물리 고성능 PC가 `tool_pc`와 `always_on_node`를 겸할 수는 있지만 clone, identity, writer authority를 논리적으로 분리하고 실제 primary는 VERIFY_HP에서 증명해야 한다. file-activity reconciler가 같은 PC에 있어도 ERP task write 권한이 자동으로 생기지 않는다.

### 8.2 PC packet과 두 writer의 운영 구조

각 PC는 공용 mutable 원장을 함께 쓰지 않고 자기 immutable partition에 observation packet을
쓴다. transport는 packet을 옮길 뿐 authority가 아니다.

```mermaid
flowchart LR
  W["🟦 CURRENT: work_pc<br/>업무 관측"]
  T["🟧 VERIFY_HP: tool_pc<br/>고성능 관측·build"]
  P["🟦 CURRENT role: portable_dev_pc<br/>간헐 positive 관측"]
  A["🟧 VERIFY_HP: always_on_node<br/>ingress·watchdog"]
  PKT["🟧 VERIFY_HP: node별 immutable packet<br/>sequence·prior·digest<br/>time·coverage"]
  TRANS["🟪 TARGET candidate: authenticated transport<br/>권한 아님"]
  VERIFY["🟥 GATE: chain·duplicate·conflict 검사<br/>same ID/different digest 격리"]
  FREC["🟥 GATE: sole file reconciler<br/>logical file·revision view만 write"]
  FVIEW["⬜ PROJECTION: file view·receipt"]
  CAND["🟨 OBSERVED branch / 🟥 GATE live<br/>TaskDriver 후보·exact file/event ref"]
  TWR["🟥 GATE: ERP task writer<br/>승인된 Driver만 atomic apply"]
  ERP["🟦 CURRENT: core_item + task events"]

  W --> PKT
  T --> PKT
  P --> PKT
  A --> PKT
  PKT --> TRANS --> VERIFY --> FREC --> FVIEW
  FVIEW -. "근거 ref만" .-> CAND --> TWR --> ERP

  classDef current fill:#d7ebff,stroke:#2468a2,color:#222
  classDef observed fill:#fff3bf,stroke:#8a6d00,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef verify fill:#ffe0b2,stroke:#a85b00,color:#222
  classDef gate fill:#ffd9dd,stroke:#a23b49,color:#222
  classDef view fill:#eeeeee,stroke:#666,color:#222
  class W,P,ERP current
  class CAND observed
  class TRANS target
  class T,A,PKT verify
  class VERIFY,FREC,TWR gate
  class FVIEW view
```

- same packet ID + same digest는 `no-op`, same ID + different digest는 `quarantine`이다.
- file reconciler는 file projection만 쓰며 `core_item`, TaskDriver, mail/source truth를 쓰지 않는다.
- ERP task writer는 승인된 Driver를 적용하며 file reconciler 권한을 빌리지 않는다.
- 한 PC가 두 role을 겸해도 clone/worktree, node ID, outbox/lock, process owner를 분리한다.

### 8.3 watchdog과 alert의 DEFAULT 운영 개념

아래 값은 원안의 `DEFAULT` 후보이며 운영 승인 전 확정값이 아니다. ping 성공은 네트워크 도달만
뜻하고 ERP/service 정상으로 간주하지 않는다. Telegram 실패도 runtime state를 바꾸지 않는다.

```mermaid
flowchart LR
  H["DEFAULT candidate: healthy"]
  PROBE["DEFAULT candidate: reachability probe<br/>+ service probe 분리"]
  DEB["DEFAULT candidate: 연속 상태 확인<br/>2회 실패 + 10분 debounce"]
  BAD["DEFAULT candidate: degraded / offline<br/>transition alert 후보"]
  REC["DEFAULT candidate: recovering<br/>projection freshness 확인"]
  OK["DEFAULT candidate: healthy<br/>recovery alert 1회"]

  H --> PROBE
  PROBE -->|실패 후보| DEB
  DEB -->|조건 충족| BAD
  DEB -->|일시 오류| H
  BAD -->|service 복귀| REC -->|검증 통과| OK
  OK --> H

  classDef defaultState fill:#f5f5f5,stroke:#666,color:#222
  class H,PROBE,DEB,BAD,REC,OK defaultState
```

이 alert 도식의 회색은 §2의 상태 판정색이 아니다. 모든 노드는 원안의 **미승인 DEFAULT
candidate**이며, live 운영은 전체가 🟥 `GATE`다.

| alert 규칙 | 원안 DEFAULT 후보 |
| --- | --- |
| unhealthy debounce | 2회 연속 실패 + 10분 |
| severity escalation | cooldown과 무관하게 즉시 |
| 평일 동일 원인 reminder | 6시간에 최대 1회 |
| 주말 또는 12시간 초과 outage | Asia/Seoul 기준 하루 1회 10:00 요약 |
| recovery | outage 시작·지속·복구시각과 generic cause code로 즉시 1회 |
| heartbeat | 보내지 않음 |
| dedupe | node role + service + outage episode + transition + state + severity + cause |

### 8.4 장애 복구 시퀀스

1. 새 packet 적용을 멈추되 immutable inbox는 지우지 않는다.
2. 마지막 reviewed checkpoint와 packet sequence/digest를 확인한다.
3. competing primary 또는 clock/chain conflict를 격리한다.
4. dry-run replay로 canonical state와 projection digest를 비교한다.
5. owner가 exact primary/binding을 재확인한 뒤 writer 하나만 재개한다.
6. `recovering`을 기록하고 projection freshness를 확인한다.
7. 정상 전환 뒤 recovery alert를 한 번 보내고 이전 cooldown key를 닫는다.

오래된 PC가 다시 연결돼도 최신 head나 삭제를 자동 확정하지 않고 positive observation만 낸다.

## 9. 고성능 PC 구현 snapshot 평가

초기 구현 분석 기준선 `27ea5319`와 branch `927b3fb0`의 2026-07-14 읽기 전용 대조에서는
branch가 `17` commits 뒤, `2` commits 앞이었다. 이 비교 문서 자체의 commit이 이후 `main`을
전진시키므로 `17 2`를 현재 topology의 고정 기대값으로 쓰지 않는다. `CHANGELOG.md`에는 통합
충돌 가능성이 관찰됐으며, 실제 HP 검증 때 §10의 exact 명령으로 새 HEAD·merge-base·count를
다시 기록한 뒤 판단한다. 따라서 branch를 곧바로 live checkout에 합치지 않는다.

### 9.1 확인된 public 구현

- `ID_CONTRACT_V1`과 canonical JSON·typed ref·deterministic ID helper
- project-local RAG path guard, legacy migration dry-run, pilot bundle, exclusive writer, readback, rollback
- TaskIntent, TaskDriver, authority/policy, 두 상태축, idempotency, deterministic replay
- 명시적으로 설치해야 하는 SQLite persistence adapter
- append-only Driver table과 `core_item` projection의 transaction 적용
- source cutoff와 current-row drift 검증

### 9.2 보고됐지만 live TaskDriver 완료 증거는 아닌 것

- focused validator `91 passed, 0 failed`는 private review packet의 보고값이다.
- 단일 승인 project의 RAG apply→rollback→reapply→no-op 통과는 RAG pilot claim이다.
- 실제 dev-ERP live TaskDriver DB write, scheduler, scanner, multi-PC transport, alert는 수행·활성화되지 않았다.

### 9.3 통합 전 반드시 해결할 차이

| 차이 | 현재 관찰 | 필요한 결정·검증 |
| --- | --- | --- |
| 불변 계획 drift | branch가 기존 `README`, `08`, `ENGINE-13`을 수정하고 `11` 상태 문서를 같은 계획 폴더에 추가 | 구현 code와 상태 보고를 분리하고, integration 결과의 기존 계획 tree는 `6eb2409d`와 byte-identical하게 유지 |
| legacy terminal state | branch projection은 `cancelled`, `merged`, `archived`를 모두 `core_item.status=archived`로 접음 | UI에서 Driver state를 따로 보일지, 적용을 막을지, enum을 확장할지 owner 결정 |
| `unclassified` | persistence mapping에서 fail-closed | 기존 row migration/적용 의미 결정 |
| `field_patch` | intent는 있으나 apply 미지원 | V0 제외 또는 bounded patch 계약 |
| task ID authority | branch apply는 외부에서 받은 `result_task_ref.entity_id`를 `core_item.id`로 사용 | candidate→reservation→apply의 단일 allocator와 retry 계약 |
| gate/event namespace | gate와 owner/source/projection event ID가 여러 namespace에 존재 | project-qualified typed crosswalk, bare/fuzzy join 0 |
| RAG reader switch | derived-text V1 target이 없어 hold | query/ref parity와 rollback 뒤 별도 승인 |
| 최신 main 기능 | 개인 ERP MCP와 report workflow가 branch 이후 main에 추가 | WorkSession/workflow job과 Driver/AgentRun 통합 회귀 |
| event 원자성 | main status mutation과 event append가 분리된 경로 | adapter 경유 단일 transaction·fail closed |
| reopen evidence | 최신 completion occurrence를 삭제하는 경로 | immutable completion + reopen/reversal event |
| 생명수 adapter | HP TaskDriver ledger가 B9/ENGINE-12 reader와 아직 연결되지 않음 | 같은 owner event의 exact projection, 중복 0, read-only invariant |
| fruit/outcome | completion·artifact·decision·verification surface가 분산되고 canonical outcome owner 미정 | fruit relation minimum과 Verification/Outcome ID owner 결정 |
| AI candidate-only | 문서 불변 가드와 mail `--auto-open` 경로가 병존 | 실제 policy authority·expiry·revocation·활성값 확인 |
| PC 개발 규칙 | 일부 이전 문서와 현재 root `AGENTS.md`의 branch/main 규칙이 다름 | 현재 최상위 authority 기준으로 별도 문서 drift 정리 |

## 10. 고성능 PC 검증 matrix

결과는 public 문서에 실제 업무값을 복사하지 말고 private metadata evidence에 기록한다.

```text
claim_id | claim | baseline_ref | command_or_query | exit
observed_count_or_shape | expected | PASS/FAIL/BLOCKED/UNKNOWN
claim_ceiling | rollback_point | evidence_ref | owner_decision_ref
```

Git topology와 validator는 command-family가 아니라 다음 exact command로 기록한다.

```bash
git rev-parse main origin/main origin/codex/task-engine-rag-v1
git merge-base origin/main origin/codex/task-engine-rag-v1
git rev-list --left-right --count origin/main...origin/codex/task-engine-rag-v1

# integration 후보에서만 존재해야 하며 모두 exit 0이 acceptance다.
npm run validate:task-engine-rag-v1
npm run ui:docs:check
npm run ui:done:check
npm run done:check
```

구현 분석 기준선의 historical 값은 main `27ea53198fd01a283558c8b809184b82d3f002a2`,
branch `927b3fb045ebf749077951417463c47f12a549bd`, merge-base
`15e988b4cdbd5db7a34eb580f754db7c3aa508cc`, count `17 2`였다. 이것은 재현 출발점이지
현재 기대값이 아니다. HP 실행에서는 local `main`, `origin/main`, branch, merge-base, count를
그때 다시 관측해 모두 기록한다. `validate:task-engine-rag-v1`은 branch 통합 전 main에서
`MISSING`일 수 있고, integration 후보에서는 command 존재와 exit `0`이 필수다.

| ID | 질문 | acceptance/기대 | read-only 또는 synthetic evidence | 현재 판정 |
| --- | --- | --- | --- | --- |
| HP-01 | exact main/branch/merge-base가 무엇인가 | baseline ref와 observed ref를 모두 고정 | 위 세 exact Git 명령과 exit·stdout hash/count | 🟧 `VERIFY_HP` |
| HP-02 | 기존 맥미니 계획이 한 byte도 바뀌지 않았나 | integration 결과에서 기준선 diff exit `0` | §1 두 명령 | 🟩 현재 `main` PASS; 🟥 HP branch drift 확인 |
| HP-03 | isolated clean worktree와 index lock가 안전한가 | dirty·overlap·lock 없음 | status/worktree/lock inventory | 🟧 `VERIFY_HP` |
| HP-04 | 실제 checkout·service·DB path가 같은 revision인가 | runtime identity exact match | process/config pointer만, secret 금지 | 🟧 `VERIFY_HP` |
| HP-05 | 실제 `core_item`/event/completion schema는 무엇인가 | public schema와 crosswalk 가능 | SQLite read-only/query-only schema; `openStore()` 금지 | 🟧 `VERIFY_HP` |
| HP-06 | task truth writer가 정확히 하나인가 | sole writer | 모든 `setItemStatus`, insert, `--auto-open`, ledger writer caller | 🟥 `GATE` |
| HP-07 | status 의미와 count가 유효한가 | unknown/invalid 없음 | status별 count만; title/body 출력 금지 | 🟧 `VERIFY_HP` |
| HP-08 | event 없이 바뀐 task가 있는가 | mutation/event parity | done/reopen/re-done와 writer별 aggregate | 🟧 `VERIFY_HP` |
| HP-09 | LLM/규칙 auto-open이 실제 켜졌나 | candidate-only 또는 exact bounded policy | env는 값 노출 없이 on/off, authority ref·expiry·revocation | 🟥 `GATE` |
| HP-10 | 메일·음성·SE 일정·파일 occurrence가 exact revision을 갖나 | source별 stable typed ref | coverage·누락·중복 count | 🟧 `VERIFY_HP` |
| HP-STORAGE-01 | LOCKED project/common owner map이 실제 materialization과 일치하나 | project payload는 project workspace, common payload만 knowledge workspace | source/body/index/Wiki asset-kind별 owner-root count와 foreign-project count | 🟧 `VERIFY_HP` |
| HP-STORAGE-02 | `_workmeta/<project>`와 `_workmeta/system`이 metadata-only이고 서로의 owner를 침범하지 않나 | raw question·source body·chunk·answer body·원문 파일·project/common metadata 오배치 0 | 확장자·schema·payload sentinel·owner-route 검사와 pointer/hash/receipt count | 🟥 acceptance |
| HP-STORAGE-03 | project extraction·RAG·Wiki의 모든 하위 asset과 consumer가 target owner를 읽나 | index뿐 아니라 trace·answer·review·work card까지 orphan 0 | asset/consumer crosswalk와 unresolved/conflict count | 🟧 `VERIFY_HP` |
| HP-STORAGE-04 | TaskDriver physical store를 원안 밖 임의 폴더나 두 번째 task truth로 만들었나 | 임의 경로 0, 선택한 table/ledger owner와 replay/write authority 하나 | schema/path/writer inventory와 migration rationale | 🟥 `GATE` |
| HP-STORAGE-05 | `_workspaces/system/rag/**`가 metadata-only system output인가 | project/common source-text·chunk·answer body 0 | asset-kind·content-type count와 project/source ref payload sentinel | 🟥 acceptance |
| HP-STORAGE-06 | HWP가 HWPX 전처리 없이 직접 본문 입력으로 들어가나 | direct HWP parse 0, HWPX derivative·status·pointer 존재 | normalization receipt와 `needs_hwpx_normalization`/derived-text crosswalk | 🟧 `VERIFY_HP` |
| HP-STORAGE-07 | one-project migration이 source original이나 legacy index를 삭제하나 | 삭제 0, old reader·legacy ref와 rollback source 보존 | before/after inventory·hash pointer·rollback dry-run | 🟥 `GATE` |
| HP-ID-01 | 새 task ID를 누가 발급하고 apply 재시도에 무엇을 재사용하나 | ERP authoritative writer 한 곳, same Driver/key면 same task 또는 no-op | candidate→task reservation caller와 duplicate apply trace | 🟥 `GATE` |
| HP-ID-02 | 기존 project/task/source ID를 hash ID로 rekey하는 경로가 있나 | 0건; verified alias와 typed ref만 추가 | migration dry-run과 changed-primary-ID count | 🟧 `VERIFY_HP` |
| HP-ID-03 | source/RAG 6종 ID가 같은 basis에서 항상 같나 | golden fixture 일치, full basis·canonical JSON·64hex digest 보존 | branch test 재실행과 collision fixture | 🟧 `VERIFY_HP` |
| HP-ID-04 | 같은 짧은 ID의 다른 full digest와 다중 alias가 격리되나 | write 0, collision/quarantine | synthetic conflicting basis·alias fixture | 🟥 acceptance |
| HP-ID-05 | ERP/source/B9/daily/Driver namespace가 exact crosswalk되나 | `project:/source:/event:/task:/milestone:/life:` projection ID를 owner entity로 오인하지 않고 bare ID join 0 | orphan·ambiguous·fuzzy join count | 🟧 `VERIFY_HP` |
| HP-ID-06 | gate·branch·task link가 project-qualified exact ref인가 | `branch:<project>:<key>`와 gate crosswalk 일치 | stale branch ID, `gate:<stage>` collision, review-needed count | 🟧 `VERIFY_HP` |
| HP-11 | `valid_at`/`known_at`이 분리되고 clock regression이 없나 | 재생 가능한 time cut | null/regression/ordering count | 🟧 `VERIFY_HP` |
| HP-12 | legacy RAG가 project/common으로 분류되나 | unresolved/collision 없음 | migration dry-run·consumer map | 🟧 `VERIFY_HP` |
| HP-13 | RAG apply/readback/rollback/reapply가 안전한가 | 동일 bundle no-op | approved synthetic + one-project evidence | 🟨 RAG pilot reported |
| HP-14 | 최신 main에서 TaskDriver validator가 통과하나 | `npm run validate:task-engine-rag-v1` exit `0` | integration 전 script 부재, 후보에서 command/exit 고정 | 🟧 `VERIFY_HP` |
| HP-15 | live DB 설치 전 backup/restore가 검증됐나 | hash pointer·restore drill pass | metadata-only receipt | 🟥 `GATE` |
| HP-16 | 1~3개 task가 closed loop를 통과하나 | candidate→approve→apply→start→done→follow-up candidate | owner-approved bounded pilot | 🟥 별도 승인 |
| HP-17 | replay 결과와 current row가 같은가 | deterministic parity | ledger replay vs aggregate/digest | 🟥 pilot acceptance |
| HP-TREE-01 | 한 project의 `gate→branch→event→task→fruit`가 exact하게 이어지나 | source별 coverage와 gap이 보이고 fuzzy confirmed 0 | metadata-only join coverage·orphan count | 🟧 `VERIFY_HP` |
| HP-TREE-02 | 한 node의 primary tree parent가 하나이고 다른 관계는 cross-link인가 | multi-parent 0, exact cross-link 별도 | branch/edge aggregate와 conflict sample pointer | 🟧 `VERIFY_HP` |
| HP-TREE-03 | Driver apply/task event가 B9와 일일 렌즈에 중복 없이 보이나 | owner event 하나에 projection relation만 추가 | adapter trace·projection ID/source event crosswalk | 🟧 `VERIFY_HP` |
| HP-TREE-04 | reanchor와 reopen이 과거를 지우지 않고 재생되나 | task ID 유지, old relation/completion 보존, reversal append | reanchor/reopen/re-done 합성 fixture와 live aggregate | 🟥 current reopen 충돌 |
| HP-TREE-05 | 같은 `valid_at/known_at` replay가 task·B9·일일 렌즈에서 같은가 | 두 번 실행한 digest 동일 | task projection/B9/daily digest와 gap report | 🟥 pilot acceptance |
| HP-TREE-06 | 생명수 조회가 owner row를 바꾸나 | 전후 DB·ledger·context count/digest 동일 | query 전후 read-only invariant | 🟥 acceptance |
| HP-TREE-07 | fruit가 exact completion·artifact·decision·verification/outcome ref를 가지나 | 자동 close 없음; 미정 owner는 `UNKNOWN` | relation coverage와 free-text-only count | 🟧 `VERIFY_HP`/`UNKNOWN` |
| HP-18 | 개인 MCP WorkSession이 직접 task를 쓰나 | candidate/receipt only | API/DB writer trace | 🟧 `VERIFY_HP` |
| HP-19 | AgentRun과 TaskDriver가 분리됐나 | owner 승인 뒤 separate IDs/authority/receipts | schema/API relation crosswalk | 🟪 `TARGET candidate` |
| HP-20 | `tool_pc`/`always_on_node`/sole file-activity reconciler가 명시됐나 | logical identity와 file projection writer 하나 | node profile·binding pointer; task write 권한 없음 확인 | 🟥 `GATE` |
| HP-20B | ERP task authoritative writer/TaskDriver applier가 별도로 하나인가 | atomic task writer 하나, file reconciler와 권한 분리 | process/API/DB writer inventory와 authority ref | 🟥 `GATE` |
| HP-21 | full dev-ERP/root/docs 검증이 통과하나 | 위 네 npm command exit `0` | exact stdout/exit·timeout·skipped reason 포함 | 🟧 `VERIFY_HP` |
| HP-22 | rollback 후 owner state가 원상 복구되나 | DB·RAG·writer state 불변 | restore/readback·fresh review | 🟥 activation gate |

후속 correction은 추가로 master plan의 `HP-INGRESS-01..10`, `HP-SESSION-01..12`,
`HP-QUERY-01..11`을 그대로 acceptance로 사용한다. 핵심 claim ceiling은 다음과 같다.

- Upload/classification/history receipt가 project promotion·ArtifactRevision·knowledge acceptance·task 완료를
  자동 의미하지 않고, promoter와 projector/TaskEngine writer가 분리된다.
- Accepted server ack 전 client outbox compact `0`, accepted start 없는 missing-closeout `0`, checkpoint/
  closeout/completion proposal의 ERP task row delta `0`이다.
- Query는 explicit scope·ACL·generation에 고정되고 API/CSV/XLSX parity, exact revision/locator/claim ceiling,
  UI/MCP digest parity를 만족한다. Team write는 candidate ledger 한 곳뿐이다.

## 11. 연속 개발 순서

```mermaid
flowchart LR
  G0["G0 🟩 PRESERVED: 기준선 동결<br/>기존 계획 무변경"] --> G1["G1 🟧 VERIFY_HP: 최신 main 위<br/>isolated branch 통합 계획"]
  G1 --> G2["G2 🟪 TARGET 검증: synthetic<br/>ID·RAG·Driver·replay"]
  G2 --> G3["G3 🟧 VERIFY_HP: read-only 현장 inventory<br/>schema·writer·PC·RAG"]
  G3 --> G4["G4 🟥 GATE: owner 의미 결정<br/>status·policy·task writer"]
  G4 --> G5["G5 🟥 GATE: 1~3 task pilot<br/>backup·apply·replay·restore"]
  G5 --> G6["G6 🟪 TARGET candidate: AX Workspace pilot<br/>개인 Codex·WorkSession·AgentRun 후보"]
  G6 --> G7["G7 🟪 TARGET candidate: Engineering IQ loop<br/>SE trace·outcome·correction"]
  G7 --> G8["G8 🟥 GATE: 팀 운영 활성화<br/>별도 승인"]

  classDef kept fill:#dff4df,stroke:#397a3b,color:#222
  classDef target fill:#eadcff,stroke:#67459a,color:#222
  classDef verify fill:#ffe0b2,stroke:#a85b00,color:#222
  classDef gate fill:#ffd9dd,stroke:#a23b49,color:#222
  class G0 kept
  class G1,G3 verify
  class G2,G6,G7 target
  class G4,G5,G8 gate
```

### G0 — 기준선 동결

- 이 문서와 기존 계획의 commit/blob ref를 기록한다.
- 기존 계획 경로에는 통합 결과나 HP 실측값을 덮어쓰지 않는다.

### G1 — branch 통합 계획

- 최신 `main` 기준 isolated worktree에서 merge/rebase 후보를 만든다.
- `CHANGELOG`, 개인 MCP, report workflow, root docs의 충돌을 수동 crosswalk한다.
- branch의 구현 code/test는 검토하되 기존 계획 파일 수정은 가져오지 않는다. 구현 상태·resume 정보는 이 문서 또는 별도 신규 상태 문서로 분리한다.
- 통합 후보에서 §1 기준선 diff가 exit `0`인지 다시 확인한다.
- 이 단계는 코드 통합 승인 뒤에만 수행한다.

### G2 — public synthetic 재검증

- 원안 V-01~V-16 전체를 기준으로 schema, authority, idempotency, replay, storage, packet, alert clock, zero-mutation, rollback을 검증한다.
- 기존 ID 보존, typed ref, source/RAG 6종 golden ID, full-basis collision, task ID reservation/retry를 검증한다.
- Driver state·authority·idempotency·stale revision과 reanchor→reopen→re-done의 task/B9/daily replay parity를 검증한다.
- path traversal/project isolation과 모든 projection의 read-only invariant를 검증한다.
- 전체 dev-ERP/root/docs regression과 fresh non-implementer review를 함께 닫는다.

### G3 — private read-only inventory

- 실제 DB는 read-only/query-only로 열고 table/column/index/count만 본다.
- 모든 task ID allocator/writer, auto-open caller, event namespace, source revision coverage, RAG consumer, PC role을 inventory한다.
- LOCKED owner map대로 project/common payload root와 project/system metadata root가 분리됐는지, `_workmeta`와 `_workspaces/system/rag` raw payload가 0인지 asset-kind별 count로 확인한다.
- HWP가 HWPX 정규화 없이 직접 추출되지 않는지와 legacy project RAG/source original이 pilot에서 삭제되지 않는지 확인한다.
- 한 project의 gate·branch·event·task·fruit exact join과 reanchor/reopen 이력 gap을 count로 확인한다.

### G4 — owner 결정

- `cancelled/merged/archived`, `unclassified`, auto-apply scope, policy expiry/revocation, sole file-activity reconciler와 별도 ERP task authoritative writer를 결정한다.
- 새 task ID 예약·재시도 authority, project-qualified gate ID, 같은 task reopen과 새 follow-up의 경계, fruit/verification/outcome owner를 결정한다.
- project/raw/hash/path ACL과 pilot 범위를 승인한다.

### G5 — 한 project의 작은 live pilot

- backup→schema install dry-run→1~3 task→replay→restore를 한 묶음으로 검증한다.
- scanner, scheduler, external upload, broad migration은 포함하지 않는다.

### G6 — AX Workspace candidate pilot

- owner가 public contract와 명칭, D28/D29를 승인한 뒤 먼저 feature-OFF start/bind/sequence/outbox/ack/
  closeout/query adapter를 검증하고, 그 다음 한 seat·한 project만 bounded pilot한다.
- 계획 기본 cardinality는 `{assignment epoch,account}` active primary 하나다. Checkpoint는 여러 개지만
  closeout/completion proposal은 task current/event/status를 쓰지 않고 official completion은 승인된 task
  authoritative writer 한 경로만 사용한다.
- Personal MCP query는 accepted generation과 explicit `project|common` scope에 고정하고 implicit fallback,
  snapshot reverse import, Wiki/RAG/canon/ontology/task direct write를 허용하지 않는다.

### G7 — Engineering IQ candidate 확장

- requirement→function→interface→risk→decision→baseline→verification→outcome→correction exact trace를 추가한다.
- 대안과 기각 사유, expected/actual 차이, review correction을 procedure learning candidate로 남긴다.
- 충분한 labeled outcome이 쌓이기 전 model fine-tuning을 기본 전제로 두지 않는다.

### G8 — 운영 활성화

- multi-PC transport, always-on writer, scheduler, notification, 팀 쓰기 권한은 별도 운영 승인으로 연다.

## 12. owner가 이해하고 결정할 열 가지

1. **AX Workspace candidate 채택 여부**: 이 작업명을 canon으로 채택할지, 기존 ERP Codex 팀 작업실의 확장명으로만 둘지, ERP 화면과 personal Codex sidecar 중 어느 쪽을 주 작업면으로 둘지.
2. **상태 의미**: `cancelled`, `merged`, `archived`, `unclassified`를 UI와 DB에서 어떻게 구분할지.
3. **쓰기 권한**: 사람 승인만 허용할지, 어느 bounded deterministic policy까지 auto-apply할지.
4. **PC 역할**: Mac mini voice primary, 고성능 tool engine, always-on operational primary, sole file-activity reconciler와 별도 ERP task authoritative writer를 어떤 logical identity로 둘지.
5. **ID authority**: ERP task ID를 어느 단일 writer가 언제 예약하고, 재시도에 같은 ID를 어떻게 보존하며, gate/event legacy namespace를 어떤 typed crosswalk로 연결할지.
6. **생명수 의미**: 같은 목적의 reopen과 새 follow-up을 어디서 나누고, 열매에 completion·artifact·decision·verification/outcome 중 무엇을 필수로 연결할지.
7. **첫 pilot**: 어떤 한 project와 1~3개 합성 또는 owner-approved task로 closed loop와 B9/일일 projection을 함께 증명할지.
8. **Ingress·promoter**: source kind별 custody/staging/quarantine/destination, reference/copy/move/derive 권한,
   mail raw/attachment owner tension, retention/legal hold·ACL·malware scan·backup/rollback/delete authority를
   누가 어떤 exact binding으로 소유할지.
9. **Personal WorkSession**: plan default인 one-active-primary/multiple-checkpoint/closeout≠completion 위에서
   assignment epoch owner, opaque thread-ref/node binding, client outbox path/fsync/encryption/retention,
   missing SLA와 official completion approver를 무엇으로 정할지.
10. **Primary query·team knowledge**: ERP UI/MCP primary read와 file audit snapshot을 채택한 상태에서
    project/common grant·existence-leak policy, accepted generation/current pointer/cursor owner, candidate
    submitter/reviewer/approver/writer와 project ID crosswalk를 어떻게 고정할지.

이 열 결정 전에도 G0~G3의 읽기 전용·합성 조사는 가능하다. G4 이후 mutation과 운영 활성화는 별도 승인이 필요하다.

## 13. 증거 강도와 UNKNOWN

### source-supported

- 최초 설계의 one truth/view/event/pointer/proposal 원칙
- 현재 `main`의 core task/event/proposal/MCP/workflow surface
- 원안의 project/common, payload/metadata LOCKED owner map과 project knowledge extraction 저장 계약
- B9의 장기 기둥·관문·세 종류 가지와 ENGINE-12 일일 read-only 생명수
- 현재 `project_code`, `core_item.id`, exact branch ID, daily projection event ID의 코드상 구성
- 고성능 PC branch의 ID/RAG/TaskDriver source code와 commit topology
- 맥미니 계획의 cold-start, dry-run, pilot, approval stop 순서

### reported, not independently re-run here

- focused validator `91 passed, 0 failed`
- 한 project RAG apply→rollback→reapply→no-op pilot 통과

### contradicted or drifted

- AI candidate-only 불변 문구와 `--auto-open` 적용 경로
- completion 이력 내구성 문구와 reopen 시 latest completion 삭제 경로
- TARGET의 immutable completion/replay와 CURRENT reopen의 completion row 삭제
- 일부 이전 PC 개발 규칙과 현재 root `AGENTS.md`의 main 작업 규칙

### UNKNOWN / VERIFY_HP

- 실제 high-performance checkout·service·DB와 branch의 일치
- 실제 task writer 수, auto-open 활성값, source coverage, live status 의미
- task candidate/task ID 발급 authority, project-qualified gate ID, event namespace crosswalk
- 실제 PC의 project/common workspace materialization, legacy project RAG 잔존량, `_workmeta` payload 오염 여부
- HP TaskDriver event와 B9/ENGINE-12 adapter, fruit/verification/outcome의 canonical owner·ID
- operational-primary, sole file-activity reconciler, ERP task authoritative writer, actual private binding
- live TaskDriver atomicity/replay/restore와 personal MCP 통합

가장 약한 핵심 증거가 live runtime에서 `UNKNOWN`이므로, 전체 claim ceiling은 `comparison_candidate`다. 이 문서만으로 production-ready, Engineering IQ 완성, 팀 AX 활성화를 주장하지 않는다.

## 14. 승인 전 멈춤 조건

다음 중 하나라도 해당하면 조사·계획까지만 하고 멈춘다.

- 기존 계획 파일을 수정해야 한다.
- dirty/divergent worktree, overlapping edit, index lock, unknown runtime revision이 있다.
- private binding·raw payload·secret을 읽거나 public 위치로 복사해야 한다.
- task truth writer가 둘 이상이거나 ERP task authoritative writer가 불명확하다.
- task candidate와 실제 task ID의 발급·예약·재시도 authority가 불명확하다.
- sole file-activity reconciler가 둘 이상이거나 task/source truth write 권한과 섞여 있다.
- source custody/promoter/projector/task writer가 섞이거나 승인 없이 payload copy/move/delete가 필요하다.
- personal closeout/proposal을 공식 완료로 간주하거나 durable ack 전 outbox를 지워야 한다.
- query scope/ACL/accepted generation이 없거나 implicit project/common fallback·team direct truth write가 필요하다.
- backup/rollback/replay가 없는데 DB schema나 row를 변경해야 한다.
- exact source revision, Driver authority, policy expiry/revocation, idempotency가 없다.
- owner가 정하지 않은 상태 의미를 migration에서 임의로 합쳐야 한다.
- gate/branch/event namespace를 제목·시간 근접·bare ID로 fuzzy join해야 한다.
- 생명수 projection이 owner row를 쓰거나 reopen 이력을 삭제해야만 동작한다.
- RAG collision/unresolved consumer/path escape가 남아 있다.
- scanner, scheduler, network, alert, broad corpus migration을 켜야 한다.
- 합성 또는 한 project acceptance가 실패한다.

이 문서의 다음 행동은 고성능 PC에서 §1과 §10을 읽기 전용으로 채우는 것이다. 구현·데이터 변경·운영 활성화는 그 결과를 owner가 검토하고 승인한 뒤 별도 slice로 시작한다.
