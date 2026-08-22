# Agent Observation — provider-neutral agent/run/usage/receipt와 Tool Job Shop 계약

이 owner는 Soulforge가 여러 provider의 agent 실행을 하나의 provider-neutral 계약으로
관찰하기 위한 결정론 pure module을 소유한다. 현재 범위는 P0-S1 smallest vertical이며
public-safe synthetic fixture만 사용한다.

이 owner는 usage token 수집기가 아니다. Codex/Claude/Antigravity token 수집과 rate card는
계속 [`../ai_usage_meter/`](../ai_usage_meter/)가 소유한다. 여기서는 provider가 무엇이든
같은 shape로 남기는 durable identity, run 관찰, direct usage 귀속, result receipt,
그리고 tool resource의 queue/lease/capacity 계약만 다룬다.

## Module

| 파일 | 역할 |
| --- | --- |
| `guard_primitives.mjs` | 나머지 module이 공유하는 strict input 규칙: safe ID/ref/label 문법, secret 탐지, 로컬 절대경로 탐지, 깊이 한계 scan, deep freeze, canonical digest |
| `agent_observation.mjs` | Agent Registry, Run Observation, Usage Ledger, Result/Delivery Receipt와 usage rollup projection |
| `resource_job_shop.mjs` | Host/Resource Registry, 3단계 priority queue, lease/fencing, capacity |
| `p0s1_vertical.mjs` | P0-S1 smallest vertical 합성 fixture와 결정론 실행 결과 |

guard는 한쪽 module에만 존재할 수 없도록 `guard_primitives.mjs` 하나에서만 정의한다.

## Schema

- `soulforge.agent_observation.agent_record.v1`
- `soulforge.agent_observation.run_record.v1`
- `soulforge.agent_observation.usage_event.v1`
- `soulforge.agent_observation.result_receipt.v1`
- `soulforge.agent_observation.host_record.v1`
- `soulforge.agent_observation.resource_record.v1`
- `soulforge.agent_observation.job_record.v1`
- `soulforge.agent_observation.lease_record.v1`
- `soulforge.agent_observation.p0s1_vertical_result.v1`

## 경계

- 모든 module은 pure in-memory 함수다. `node:fs`, `node:net`, `node:http`, `node:https`,
  `node:child_process`, `node:dgram`, `node:worker_threads`, `node:cluster`, `node:v8`,
  `node:vm`을 import하지 않고 `require(`, dynamic `import(`, `fetch(`, `eval(`,
  `new Function(`, `process.`, `globalThis.`도 쓰지 않는다. validator가 module source에서
  이 부재를 직접 검사하고, vertical test는 network global을 counter로 교체한 채 전체 흐름을
  실행해 호출 수가 `0`임을 실제로 측정한다.
- ERP 세계수 writer, Board enrollment writer, result gate writer, 파일 쓰기, 외부 호출은
  모두 없다. `declared_effect_boundary`의 `0`들은 **선언**이며 측정값이 아니다. 실제 근거는
  위의 source scan과 runtime probe다.
- observation store의 저장 record는 deep freeze한다. `authority_scope.allowed_projects`,
  `provider_identities`, `side_effect_evidence_refs`, `refs`를 나중에 밀어 넣어 권한이나
  delivery 증거를 넓히려는 시도는 `TypeError`로 실패하고 저장값은 바뀌지 않는다.
  job shop의 job·lease record는 의도적으로 가변 state machine object다. 외부로는 frozen copy와
  새로 만든 projection만 나가므로 내부 참조가 새지 않지만, deep freeze 주장은 observation store에만
  적용한다.
- 원장 Map은 store handle에서 도달할 수 없다. 따라서 append-only는 규약이 아니라 구조로
  강제되며 consumer가 `clear`, `delete`, `splice`로 evidence를 지울 수 없다.
- raw transcript, message, reasoning content, chain-of-thought, tool input/output,
  credential은 저장하지 않는다. 각 진입점은 strict key allowlist → secret value scan →
  로컬 절대경로 scan 순서를 모두 통과해야 하며, 이 세 guard는 observation store와 job shop
  양쪽에 동일하게 적용된다.
- 알 수 없는 key 이름은 hold detail로 되돌려 주지 않는다. key 이름은 producer가 정하므로
  `sk-`로 시작하는 credential처럼 safe ID 문법을 통과하는 값도 있다. hold code가 이미 unknown
  field임을 알려주므로 이름 자체는 `unknown_key_name_withheld`로 가린다.
- guard scan에는 깊이 한계가 있다. 그보다 깊게 중첩된 값은 통과가 아니라 `INPUT_TOO_DEEP`으로
  닫힌다. stack overflow로 guard를 우회할 수 없다.
- 로컬 절대경로 탐지는 값의 시작만 보지 않는다. URI scheme 뒤에 숨은 Windows 드라이브
  문자, UNC prefix, 잘 알려진 POSIX home/system root, 그리고 Soulforge private plane
  marker(`_workspaces`, `_workmeta`, `private-state`, `guild_hall` 로컬 state)를 값
  어디에서든 거부한다. POSIX root 목록은 정확히
  `Users`, `home`, `mnt`, `opt`, `srv`, `var`, `etc`, `tmp`, `root`, `Volumes`, `Applications`이며
  repo의 기존 path-policy validator 범위와 맞춘 것이다. 그 밖의 root(`usr`, `proc` 등)는 잡지
  않는다. 실제 패턴은 `guard_primitives.mjs`의 `LOCAL_PATH_VALUE`가 소유하고,
  테스트는 문자열을 조각에서 조립해 검증하므로 저장소에는 literal 절대경로가 남지 않는다.
- privacy counter는 write guard와 같은 predicate를 공유한다. 따라서 guard가 놓치는 모양은
  counter도 놓친다. counter는 guard가 실제로 걸러냈음을 확인하는 값이지 독립 측정이 아니다.
- title, cwd, prefix, similarity, age로 identity·parent·project를 추정하지 않는다. observation
  store는 그런 필드를 애초에 받지 않는다. vertical은 Board 행에 쓸 `display_label` 하나만 받는데,
  이는 표시용이며 identity·parent·project 결정에 전혀 쓰이지 않고 Board label 규칙을 통과해야만
  한다. 모르는 값은 `HOLD`다.
- Agent local memory는 `cache_only`만 허용한다. 장기 Project Context 정본은 ERP 세계수이며
  이 module이 소유하지 않는다.
- AgentRun success는 Official Task Done이 아니다. `result_observed`는 side-effect evidence
  ref가 있을 때만 받아들인다.
- source 파일에는 NUL byte를 넣지 않는다. grep 기반 validator가 module을 binary로 보고
  건너뛰면 안 되므로 composite key separator도 `\u0000` escape로만 쓴다.

## Agent Registry

durable Soulforge `agent_id` 하나가 정본이며 provider-native ID는 crosswalk로 모두
보존한다. crosswalk 항목은 `(provider, id_kind, id_value)`이고 같은 `(provider, id_kind)`
slot을 두 번 채우면 `PROVIDER_IDENTITY_SLOT_CONFLICT`다. 따라서 Codex thread/session ID,
Hermes session/delegation/subagent ID, Claude/AGY ID가 같은 필드를 덮어쓰지 않는다.
같은 provider identity가 다른 Soulforge agent에 이미 묶여 있으면
`PROVIDER_IDENTITY_CROSSWALK_CONFLICT`다.

같은 `agent_id`의 동일 payload 재등록은 `NO_OP`이고, 다른 payload는
`AGENT_RECORD_CONFLICT`다. 알려진 한계: 이 규칙 때문에 나중에 관찰된 provider identity를
기존 agent record에 **추가**할 수 없다. identity 추가 경로는 P0에서 별도 monotonic
merge 계약으로 다룬다.

`authority_scope.allowed_actions`와 run의 `authority`는 저장만 하고 이 module이 집행하지
않는다. job의 action 허용 여부는 job shop이 resource의 `allowed_actions`로 판정한다. 이 두
필드는 downstream policy가 읽을 선언값이며, 여기 저장돼 있다는 사실을 집행 증거로 읽지 않는다.

## Run Observation

`run_id`, `parent_run_id`, `agent_id`, task/project/work-unit, lifecycle,
provider/model/effort, authority, heartbeat, start/end, result state를 분리된 필드로
남긴다. parent가 아직 등록되지 않았으면 `UNKNOWN_PARENT_RUN`이며 직전 run으로 추정하지
않는다. run의 project가 agent의 project와 다르면 `PROJECT_BINDING_MISMATCH`로
context firewall을 닫는다. parent run의 project와 다르면 `PARENT_PROJECT_MISMATCH`이므로 다른
프로젝트의 작업이 이 parent의 subtree 사용량으로 딸려 들어오지 않는다. `heartbeat_at < started_at`이나 `ended_at < started_at`은
`TEMPORAL_ORDER_INVALID`다.

알려진 한계: run record는 한 번 쓰이면 전진하지 않는다. 나중의 `heartbeat_at`,
`started → running` 전이, `ended_at` 설정은 모두 `RUN_RECORD_CONFLICT`다. 이번 slice는 append와
conflict 계약만 고정하며, lifecycle 전진은 provider identity 추가와 같이 P0의 별도 monotonic
update 계약에서 다룬다.

## Usage Ledger

direct usage event만 exact run/agent/model에 1회 저장한다. `attribution_kind`가
`direct`가 아니면 `CHILD_USAGE_MERGE_FORBIDDEN`이므로 child usage가 manager의 direct
usage로 합산되지 않는다. usage의 `provider`/`model_id`가 run 기록과 다르면
`RUN_MODEL_MISMATCH`다.

중복은 두 층위로 막는다.

- 같은 `event_id`의 동일 payload는 `NO_OP`, 다른 payload는 `USAGE_EVENT_CONFLICT`.
- 같은 run/agent/model/시각/token vector가 **새 correlation ID**로 다시 들어오면
  `USAGE_CONTENT_DUPLICATE`. provider restart/disconnect 뒤 재전송이 원장을 두 배로
  만들지 않게 하는 natural key다. `cost_basis`와 `cost_evidence_refs`는 이 key에서 의도적으로
  제외한다. 같은 측정을 나중에 `token_proxy`에서 `billed_cost`로 다시 올리는 것은 새 측정이
  아니므로, 포함했다면 같은 token이 두 번 세어졌을 것이다.
  비용도 함께 적는다. run/agent/model/`observed_at`(ms 해상도)과 token vector가 모두 같은 서로
  다른 두 측정은 구분되지 않고 거부된다. 손실은 아니고 fail-closed HOLD로 드러나지만, 같은 ms 안에
  동일 token vector가 두 번 나오는 producer는 더 정밀한 `observed_at`이나 안정적인 `event_id`를
  제공해야 한다. 같은 이유로 이미 기록된 event의 cost basis를 올리는 경로는 이번 slice에 없다.

`self_usage`, `child_direct_usage`, `subtree_usage`는 원본 event를 바꾸지 않고
`projectUsageRollup`이 계산한다. 존재하지 않는 `run_id`에 대한 rollup은 `0`이 아니라
`UNKNOWN_RUN` HOLD다. `total_tokens`는 `input + output`이다. `input`은 cached와
cache-write를 포함하는 provider total이고 `reasoning_output`은 `output`의 부분집합이므로
다시 더하지 않는다. 이 partition 규칙은
[`../../docs/architecture/guild_hall/AI_USAGE_METER_V1.md`](../../docs/architecture/guild_hall/AI_USAGE_METER_V1.md)의
측정 의미와 같고, 위반은 `TOKEN_PARTITION_INVALID`다.

`cost_basis`는 `token_proxy`, `list_price_estimate`, `billed_cost`,
`subscription_credit_observation`을 구분한다. 실제 돈이나 credit을 주장하는
`billed_cost`와 `subscription_credit_observation`은 자체 `cost_evidence_refs` 없이는
`COST_EVIDENCE_REQUIRED`로 막힌다. 이 module은 금액 자체를 저장하지 않으므로 비용 주장의
상한은 여전히 근거 label과 그 evidence pointer까지다.

## Result / Delivery Receipt

result, delivery, artifact, approval, validation, recovery ref만 저장한다.
`receipt_kind: delivery`인데 `producer_evidence_kind: structural_only`이면
`STRUCTURAL_EDGE_NOT_DELIVERY`다. 구조 topology 간선은 delivery receipt가 아니다.
run이 시작되기 전 시각으로 관찰된 receipt는 `TEMPORAL_ORDER_INVALID`다.

## Tool Job Shop

Resource Controller는 queue·lease·capacity만 담당하고 실제 결과물은 Craftsman이
만든다. queue는 `긴급(urgent) / 높음(high) / 일반(normal)` 3단계이고 같은 우선순위는
`submitted_seq` FIFO다. FIFO를 실제로 보장하는 것은 dispatch 시점의 비교가 아니라 submit 시점의
규칙이다. `submitted_seq`는 resource별로 strictly monotonic해야 하므로
(`SUBMISSION_SEQUENCE_NOT_MONOTONIC`) client가 낮은 번호를 재사용하거나 재생해 앞줄을 가로챌 수
없고, 그 결과 큐 삽입 순서와 seq 순서가 항상 일치한다.

### starvation 경계

strict priority에는 aging이 없다. 긴급 job이 계속 들어오면 일반 job은 계속 대기한다.
이는 사고가 아니라 이번 단계의 명시적 trade-off이며, 실제 처리시간 데이터 전에는
복잡한 optimizer를 만들지 않는다는 계약을 따른다. 이 동작은 테스트로 고정해 두었으므로
"starvation-free"라고 주장하지 않는다.

### 중복 실행 경계

lease는 resource별 `fencing_epoch`를 증가시킨다. lease가 만료되면 job은 queue로
돌아가고 새 lease가 더 높은 epoch를 받는다. TTL은 완료 시점에도 검사하므로, 아무도 다시
acquire하지 않아 resource가 놀고 있어도 만료된 lease는 완료를 기록할 수 없다. 만료되었거나
fencing epoch가 어긋난 lease의 완료 시도는 `LEASE_FENCED_OUT`이고 그 시도는
`fenced_completion_attempt_count`로 센다.

정확히 무엇이 보장되는지 구분한다.

- 보장: 같은 job에 대해 **기록된 완료(`recorded_completion_count`)는 1회**다. 같은 결과의
  재완료는 `NO_OP`, 다른 결과는 `JOB_RESULT_CONFLICT`이며 후자는
  `duplicate_completion_hold_count`로 센다.
- 미보장: craftsman의 **실제 부수효과가 물리적으로 1회 실행됐다**는 것. 느린 worker가 죽지
  않은 채 lease만 만료됐다면 두 worker가 같은 job body를 동시에 수행할 수 있다. fencing은
  그 두 번째 결과가 원장에 들어오는 것을 막을 뿐이다. 실제 1회 실행 보장은 craftsman
  adapter 쪽 idempotency 계약이 필요하며 이번 slice의 범위가 아니다.
- 같은 이유로 `capacity`도 **논리적 상한**이다. 동시에 유효한 lease 수는 capacity를 넘지 않지만,
  위의 zombie worker 경우에는 물리 자원 하나를 두 실행이 만질 수 있다. 물리 상한이 필요한
  resource는 adapter 쪽 상호배제가 따로 있어야 한다.
- `projectJobShop`은 TTL이 지난 lease의 job을 `queue_depth`에 되돌려 센다. 따라서 clock을 넘긴
  읽기에서도 미완료 작업이 사라지지 않는다. `leased_count`는 현재 유효 lease를 쥔 job 수다.

Host/Resource는 처음부터 N-host 계약으로 분리한다. resource 설정은 등록 뒤 immutable이고
(`RESOURCE_RECORD_CONFLICT`), health는 별도 `observeResourceHealth`로만 움직인다.
등록 자체가 첫 health 관찰이므로 `registerResource`도 `observed_at_ms`를 요구한다. 이후 관찰은
strictly newer일 때만 반영된다(`HEALTH_OBSERVATION_NOT_NEWER`). 따라서 `down`으로 등록한
resource를 오래된 collector 보고가 `ok`로 되돌려 dispatch를 다시 열 수 없고, null baseline을
노리는 첫 stale 보고도 통하지 않는다.
resource나 host의 health가 `ok`가 아니면 lease를 주지 않는다
(`RESOURCE_UNHEALTHY`, `HOST_UNHEALTHY`). host health는 strictly newer collector timestamp
에서만 전진하므로 같은 시각을 보고하는 두 collector가 last-writer-wins로 경합하지 않는다.
현재 등록 대상은 합성 `PC-01` 하나뿐이며 실제 Mac mini, 회사 고성능 PC, 업무 PC는
등록하거나 연결하지 않는다.

이미 완료된 `job_id`를 동일 payload로 다시 submit하면 `NO_OP`이며 다시 queue에 들어가지 않는다.
`reasoning_effort`는 열거형이 아니라 safe ID 문자열이므로 provider별 값을 그대로 보존한다.

`projectJobShop(shop)`의 `active_leases`는 lease state 기준이다. wall-clock 만료까지
반영하려면 `projectJobShop(shop, { now_ms })`처럼 명시 clock을 넘긴다. 이 module은
자체 clock을 읽지 않는다.

## 검증

```powershell
npm.cmd run validate:agent-observation
```

이 validator는 네 개 구현 module의 syntax check와 다섯 test 파일의 focused deterministic
test를 실행한다.
위 경계 문장은 각각 대응하는 test를 가지며, `guard_primitives.test.mjs`는 로컬 경로·secret·label
규칙의 개별 alternative를 하나씩 검증한다. 개발 중 guard 제거 probe로 테스트 강도를 확인했지만
그 harness는 저장소에 포함되지 않으므로 여기서 coverage 점수를 주장하지 않는다. 검증 가능한 것은
이 validator가 실행하는 test 자체다.

결과는 public deterministic candidate 수락이며 actual project, live runtime,
provider 연결, 운영 승격 수락이 아니다. 이 module set을 import하는 다른 owner는 아직 없다.
