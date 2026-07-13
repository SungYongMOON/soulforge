# 05. TaskDriver와 lifecycle

| 항목 | 내용 |
| --- | --- |
| owner | [`PROJECT_TASK_ENGINE_LIFECYCLE_V0`](../../../../../docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md) |
| authority | 이 장은 owner contract의 dev-ERP 적용 설계만 소유 |
| CURRENT | `core_item.status` 단일 축, source/ledger/event에 causal refs 분산 |
| TARGET | `why/why-now` TaskDriver + 판단/적용 축 + 작업 상태 축 |
| non-goals | 현재 schema 지원 주장, runtime/table 구현, 자동 승인 확대 |
| stop | exact trigger/authority/idempotency 없음, 두 task truth writer 발생 |

## 적용 원칙

TaskDriver는 할일 자체가 아니라 할일 생성·변경의 인과 record다. 최소 필드, typed refs,
relation, 상태값은 owner contract §2~3을 그대로 사용하고 여기서 별도 enum을 만들지 않는다.

```text
exact event/source/rule/completion
  -> TaskDriver candidate
  -> owner approval OR explicit deterministic policy
  -> task candidate/transition applied
  -> append-only event + receipt
```

`why_code`와 redacted summary는 사람이 읽는 이유이고, `trigger_event_ref`, exact revision,
`valid_at/known_at`, policy/decision ref가 기계가 재생하는 근거다. `target_intent_ref`와
`intent_digest`는 승인할 생성/전이/patch를 고정하고 `driver_digest`와
`canonicalization_version`은 같은 Driver인지 검증한다. approval/application event는 이 네
ref/digest를 exact하게 참조한다. LLM chain-of-thought나 source body를 Driver에 넣지 않는다.

## 두 축과 현행 mapping

- `decision_application_state`: `candidate | review_required | approved | applied | rejected | superseded`
- `work_status`: `not_started | in_progress | waiting | blocked | done | cancelled | merged | archived`

현행 ERP는 다음처럼 **migration 후보**로만 읽는다.

| ERP | 판단/적용 | 작업 | 비고 |
| --- | --- | --- | --- |
| `unclassified` | `review_required` | `not_started` | 임시 row 의미 VERIFY_HP |
| `open` | `applied` | `not_started` | Driver 부재는 legacy gap |
| `doing` | `applied` | `in_progress` | start event crosswalk |
| `waiting` | `applied` | `waiting` | reason ref 별도 |
| `blocked` | `applied` | `blocked` | blocker ref 별도 |
| `done` | `applied` | `done` | completion event 별도 |
| `archived` | `unmapped (VERIFY_HP)` | `archived` | 이전 판단 상태 추정 금지 |

현행에 없는 `cancelled|merged`를 `archived`와 합치지 않는다. exact mapping과 UI 의미는
owner decision 전까지 migration hold다.

## authority

- LLM은 Driver/task/transition 후보만 낸다.
- deterministic auto-apply는 exact `policy_ref`, 허용 scope, writer, expiry/revocation,
  audit event가 모두 있을 때만 가능하다.
- 현행 `--auto-open`이 target gate를 충족한다고 가정하지 않고 고성능 PC에서 검증한다.
- completion은 `completion_followup` Driver **후보**만 만들 수 있다. 별도 승인 없이 새
  task를 열지 않는다.
- assignee, due, close, source acceptance는 각 owner authority를 유지한다.

## 멱등과 replay

- versioned canonical logical cause + target intent digest 기준 `idempotency_key`;
  ledger path/current clock는 key에서 제외
- same key/same digest=no-op, same key/different digest=conflict
- approval/apply 때 Driver/intent digest가 달라지면 stale/conflict
- Driver -> approval -> mutation -> terminal receipt 순서를 보존
- 중간 실패는 pending/recoverable로 남기고 approval을 재창조하지 않음
- 같은 immutable inputs와 cutoff에서 같은 Driver/projection을 재생

## acceptance hook

합성 fixture는 candidate/reject/approve/apply, duplicate, conflicting duplicate,
completion-followup candidate, replay parity를 포함한다. 실제 pilot은 한 project에만
적용하고 rollback이 증명되기 전 writer를 확장하지 않는다.

후보 수가 0인 정상 입력도 명시적 no-op receipt로 닫아 무한 재판단을 막는다.

## refs

- [`PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`](../../../../../docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md)
- [`PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../../../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
- [`03_INPUT_AND_TEMPORAL_MODEL.md`](03_INPUT_AND_TEMPORAL_MODEL.md)
- [`06_EXECUTION_FEEDBACK_AND_LIFE_TREE.md`](06_EXECUTION_FEEDBACK_AND_LIFE_TREE.md)
