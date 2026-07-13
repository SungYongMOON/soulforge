# Project Task Engine Lifecycle v0

- 상태: `canon_candidate`; public-safe owner contract, runtime migration 미적용
- owner: dev-ERP task engine (현재 `core_item.id`/current state + application-level
  append event surface; exact Driver event extension은 target)
- authority: task identity/state transition and the exact causal record that authorized it
- consumers: intake adapters, project context, ENGINE-12 life tree, notification/read models

## 1. 목적과 authority

TaskDriver를 "왜 이 할일 또는 상태 전이가 존재하는가, 왜 지금인가"를 설명하는
인과 record로 고정한다. source-local ledger는 입력 사실을, dev-ERP task plane은 할일
정체성과 상태를, TaskDriver는 둘 사이의 근거와 승인 경로를 소유한다.

목표 task truth는 기존 원칙을 유지하되 CURRENT와 TARGET을 섞지 않는다.

- CURRENT: `core_item.id`가 dev-ERP 할일의 stable identity이고 같은 row가 현재 상태를
  가진다. 별도 `task_id` 컬럼이 이미 있다는 뜻이 아니다.
- CURRENT: `event_log`는 application append surface다. DB가 update/delete를 구조적으로
  금지한다는 주장이나 exact Driver 필드가 이미 있다는 주장이 아니다.
- TARGET: 상태 전이, actor, exact Driver ref와 결과는 append-only task event evidence로
  남기며 `core_item` current row는 그 재생 가능한 현재 projection이 된다.
- 메일/음성/일정 ledger, `project_context`, life tree, Neo4j, RAG/Wiki는 할일 truth를
  대신하지 않는다.
- portability용 CSV/JSON이 필요해도 authoritative writer의 재생성 가능한 export여야 하며
  두 번째 task writer가 되어서는 안 된다.

현재 runtime에는 이 통합 TaskDriver contract가 구현되어 있지 않다. 현행 schema와
writer drift, 실제 task/ledger crosswalk는 고성능 PC에서 read-only inventory로 확인한다.

## 2. TaskDriver 최소 계약

TaskDriver는 source body나 LLM reasoning 원문이 아니라 metadata-only causal record다.

| 필드 | 요구 | 의미 |
| --- | --- | --- |
| `schema_version` | 필수 | Driver/intent canonicalization 계약 version |
| `driver_id` | 필수 | 불변 자기 ID |
| `driver_kind` | 필수 | owner request, source event, due rule, dependency, follow-up, completion follow-up 등 통제값 |
| `project_ref` | 필수 | typed canonical project ref |
| `task_ref` / `task_candidate_ref` | 하나 필수 | 기존 task 또는 아직 적용되지 않은 후보 |
| `target_intent_ref` | 필수 | 생성·전이·field patch 중 승인할 immutable intent record |
| `intent_digest` | 필수 | expected from/revision + proposed to/patch의 canonical digest |
| `trigger_event_ref` | 필수 | 왜 지금인지 설명하는 exact event/decision occurrence |
| `source_revision_refs[]` | 조건부 | source-bearing 입력의 exact revision |
| `rule_revision_refs[]` | 조건부 | 일정·준수·정책 근거 exact revision |
| `knowledge_revision_refs[]` | 조건부 | 실제 사용한 exact canon revision |
| `parent_task_refs[]` / `completion_event_refs[]` | 조건부 | 후속·재개·분할 causal chain |
| `why_code` | 필수 | 통제된 이유 코드 |
| `why_summary_redacted` | 필수 | payload 없는 짧은 사람용 설명 |
| `valid_at` / `known_at` | 필수 | 현실 유효 시점과 당시 인지 cutoff |
| `recorded_at` | 필수 | Driver record append 시각 |
| `policy_ref` / `owner_decision_ref` | 조건부 | 자동 적용 또는 사람 승인의 exact authority |
| `decision_application_state` | 필수(read model) | append-only decision/application event에서 파생한 현재 축 |
| `idempotency_key` | 필수 | logical cause 재처리 중복 방지 키 |
| `canonicalization_version` | 필수 | key/digest를 만든 canonical serialization version |
| `driver_digest` | 필수 | 자기 자신·파생 상태·receipt를 제외한 immutable causal fields의 canonical digest |
| `supersedes_driver_ref` | 선택 | 기존 Driver를 지우지 않는 교체 관계 |

`target_intent_ref`가 가리키는 record는 최소 `intent_kind`, target task/candidate,
`expected_from_state_or_revision`, `proposed_to_state_or_patch`, `intent_digest`를 가진다. 한
Driver는 한 target intent를 승인한다. 같은 source가 여러 할일이나 변경을 만들면 intent와
Driver를 각각 만든다. approval/application event는 `driver_id + driver_digest +
target_intent_ref + intent_digest`를 exact하게 참조하며 제목·현재 row를 다시 읽어 intent를
재구성하지 않는다.

Driver causal payload는 immutable이고, 승인·적용·거절·supersede는 별도 event다.
`decision_application_state`를 같은 physical row에 캐시하더라도 digest 입력이나 과거 evidence로
쓰지 않고 event replay로 검증한다. `owner_decision_ref`/`policy_ref`가 후보 생성 뒤 생기면
Driver payload를 수정하지 않고 authority event에 기록한다.

canonical endpoint는
[`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)의
`{entity_type, owner_surface, entity_id}`를 사용한다. 새 관계 후보는 다음으로 제한한다.

- `task_driver triggered_by event_or_owner_decision`
- `task_driver justified_by source_revision_or_rule_revision_or_knowledge_revision`
- `task_driver justifies task_candidate_or_task_transition`
- `task_driver supersedes task_driver`

## 3. 두 상태축

판단/적용과 실제 작업 진행을 한 status에 합치지 않는다.

| 축 | target 값 | 규칙 |
| --- | --- | --- |
| `decision_application_state` | `candidate | review_required | approved | applied | rejected | superseded` | 후보가 task truth에 적용될 권한과 결과 |
| `work_status` | `not_started | in_progress | waiting | blocked | done | cancelled | merged | archived` | 적용된 task의 실제 작업 상태 |

`candidate`는 작업 상태가 아니며 `done`은 근거 승인 상태가 아니다. `approved`와 `applied`도
구분한다. 승인 뒤 write 실패가 날 수 있고, replay는 그 gap을 복구해야 한다.

### 현행 ERP status 보수적 crosswalk

아래 표는 migration 설계이며 현재 코드가 두 축을 저장한다는 주장이 아니다.

| 현행 `core_item.status` | target 판단/적용 | target 작업 | 주의 |
| --- | --- | --- | --- |
| `unclassified` | `review_required` | `not_started` | task 후보/임시 행 성격을 실제 inventory에서 확인 |
| `open` | `applied` | `not_started` | 적용 근거 Driver가 없으면 legacy gap |
| `doing` | `applied` | `in_progress` | start event와 exact crosswalk 필요 |
| `waiting` | `applied` | `waiting` | waiting reason은 별도 event/ref |
| `blocked` | `applied` | `blocked` | blocker ref 없는 행은 gap |
| `done` | `applied` | `done` | completion evidence와 follow-up은 별도 |
| `archived` | `unmapped (VERIFY_HP)` | `archived` | 이전 판단 상태를 추정하지 말고 event replay로 복구 |

`cancelled`와 `merged`는 context graph target에는 있지만 현행 ERP status enum에는 없다.
owner가 mapping과 UI semantics를 승인하기 전에는 `archived`로 조용히 접지 않는다.

## 4. writer와 승인

- LLM은 TaskDriver와 task/transition **후보만** 만든다.
- deterministic policy가 자동 적용하려면 exact `policy_ref`, 허용 driver/source 범위,
  writer identity, 유효 기간, revocation 조건이 모두 닫혀야 한다.
- current `--auto-open`이나 다른 writer가 이 target authority를 이미 충족한다고 간주하지
  않는다. high-performance PC crosswalk에서 실제 gate를 검증한다.
- 사람 승인, 결정적 정책 적용, reject, supersede는 모두 append-only 사건을 남긴다.
- 완료는 지식 후보와 `completion_followup` TaskDriver 후보를 만들 수 있지만 후속 할일을
  조용히 auto-open하지 않는다.
- due/assignee/source truth/final close 변경은 각 owner 계약의 승인 경계를 유지한다.

## 5. 멱등, replay, projection

- `idempotency_key`는 project + driver kind + exact trigger occurrence + `target_intent_ref`와
  `intent_digest`를 versioned canonical serialization한 값에서 결정하며 물리 ledger path나
  현재 clock을 넣지 않는다.
- same key/same digest는 no-op, same key/different digest는 conflict다.
- approval/apply 시 저장된 Driver/intent digest가 다르면 stale/conflict로 중단한다.
- Driver append, approval event, task mutation, receipt 순으로 원자적 publish 또는
  recoverable pending receipt를 사용한다. receipt를 state보다 먼저 terminal로 쓰지 않는다.
- replay는 source-local immutable events + TaskDriver + task events에서 같은 현재 상태를
  재구성해야 한다. current row를 과거 사실처럼 사용하지 않는다.
- ENGINE-12, `project_context`, dashboard, Neo4j, Telegram은 projection/notification이며
  task/Driver/approval owner를 변경하지 않는다.

## 6. 현재와 target

| 구분 | 현재 관찰 | target |
| --- | --- | --- |
| task state | `core_item.status` 단일 enum | 판단/적용 축과 작업 축 분리 |
| causal reason | source refs와 여러 ledger/event에 분산 | exact TaskDriver record |
| auto-open | 기존 개별 gate 존재 | explicit authority contract로 통합 |
| completion follow-up | owner 결정/경로 불완전 | Driver candidate만 emission |
| replay | source별 부분 이력 | deterministic cross-owner replay |

## 7. 비목표와 stop conditions

비목표: runtime schema 구현, legacy bulk rewrite, 실제 project payload 읽기, LLM reasoning
원문 저장, Neo4j writer, scheduler/notification 활성화, source truth 재소유.

다음이면 중단한다.

- `core_item`과 다른 task truth writer를 동시에 두어야 하는 설계
- exact trigger/authority/idempotency 없이 자동 적용해야 하는 상황
- private/raw/secret을 public 문서나 `_workmeta`에 복사해야 하는 상황
- `archived`, `cancelled`, `merged`를 근거 없이 합쳐야 하는 migration
- live writer 전에 replay/rollback/one-project pilot gate가 닫히지 않은 경우

## 8. 관련 문서

- [`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
- [`PROJECT_FILE_ACTIVITY_REVISION_V0.md`](PROJECT_FILE_ACTIVITY_REVISION_V0.md)
- [`../foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)
- [`../../../ui-workspace/apps/dev-erp/docs/task_engine_redesign/README.md`](../../../ui-workspace/apps/dev-erp/docs/task_engine_redesign/README.md)
- [`../../../ui-workspace/apps/dev-erp/docs/slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md`](../../../ui-workspace/apps/dev-erp/docs/slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md)
