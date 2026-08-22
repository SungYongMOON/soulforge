# Agent Observation — provider-neutral agent/run/usage/receipt와 Tool Job Shop 계약

이 owner는 Soulforge가 여러 provider의 agent 실행을 하나의 provider-neutral 계약으로
관찰하기 위한 결정론 pure module을 소유한다. 현재 범위는 P0-S1 smallest vertical과
P0-S2 three-project job shop이며 public-safe synthetic fixture만 사용한다.

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
| `p0s2_job_shop.mjs` | P0-S2 three-project job shop: Context Capsule 계약, 3 project 동시 제출, crash/reclaim/replay 시나리오 |

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
- `soulforge.agent_observation.p0s2_job_shop_result.v1`
- `soulforge.agent_observation.context_capsule.v1`

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
  credential은 저장하지 않는다. 모든 **write** 진입점은 strict key allowlist → secret value scan →
  로컬 절대경로 scan 순서를 모두 통과해야 하며, 이 세 guard는 observation store와 job shop
  양쪽에 동일하게 적용된다. read-only projection 중 `projectUsageRollup`은 같은 세 guard를 쓰고
  `projectJobShop`은 key allowlist만 쓴다. 후자는 허용 key가 `now_ms` 하나뿐이고 `isClock`을
  통과해야 하므로 문자열 payload 자체가 들어올 수 없다.
- 입력의 prototype이 `Object.prototype`이나 `null`이 아니면 거부한다. prototype에 얹혀 온
  payload가 scan을 통째로 건너뛸 수 있었기 때문이다. 스캔 자체는 아래 스냅샷 위에서 돌므로
  enumerable 여부와 무관하게 own property를 전부 본다.
- 어떤 hold `detail`에도 caller가 정한 문자열을 넣지 않는다. 모든 detail은 고정 literal이다.
  P0-S2의 `holds[].step`은 예외로 project ID를 담는데, 이 값은 safe ID 문법과 entry guard의
  secret·경로 scan을 이미 통과한 값이다.
- `guardEntry`를 지나는 모든 진입점은 입력을 먼저 스냅샷한 뒤 그 스냅샷만 검증하고 그
  스냅샷에서만 record를 만든다. 스냅샷은 `Object.getOwnPropertyNames`로 own property를
  **한 번씩만** 읽으므로 비열거 속성이 숨을 수 없고, getter가 있으면 호출하지 않고
  `ACCESSOR_PROPERTY_FORBIDDEN`으로 거부하며, Proxy의 `get` trap은 애초에 발동하지 않는다.
  따라서 guard가 본 값과 record에 들어가는 값이 다를 수 없다. `snapshot_contract.test.mjs`가
  이 성질을 12개 진입점 각각에서 증명한다 — 거짓말하는 Proxy를 직접 넘기고 trap 발동 횟수가
  0인지와 저장된 값이 정직한 값인지를 함께 확인한다.
- 스냅샷을 거치지 않는 것은 `projectJobShop`, `auditRecordPrivacy`, `auditProjectionPrivacy`,
  `measureProjectIsolation` 네 개다. 모두 read-only이고 각자 자기 값을 한 번만 읽으므로
  두 번 읽어 달라지는 문제가 성립하지 않는다.
- 스냅샷은 own property 이름을 `Object.defineProperty`로 복사본에 심는다. `copy[name] = value`는
  `__proto__`에 대해 data property를 만들지 않고 상속된 setter를 부르며, 원시값이면 조용히
  버려진다. 그 경로로 own enumerable `__proto__` 키가 어떤 scan에도 걸리지 않고 사라져 HOLD가
  PASS가 된 적이 있다.
- 배열의 `length`는 실제 원소 수와 분리된 값이라 `[].length = 4294967294`가 공짜로 만들어진다.
  그래서 스냅샷 안에서 원소 수를 `MAX_SNAPSHOT_ITEMS`(4096)로 제한한다. 하위의 list 상한은
  스냅샷이 반환된 뒤에야 돌기 때문에 이 자리에서 막아야 한다. 초과는 `INPUT_TOO_LARGE`다.
- revoke된 Proxy나 `ownKeys`·`getOwnPropertyDescriptor`·`getPrototypeOf`에서 던지는 trap은
  스냅샷 밖으로 예외를 내보내지 않고 `HOSTILE_INPUT_REFUSED`로 거부한다. 거부가 crash로 바뀌면
  진입점의 "던지지 않는다" 계약이 깨진다.
- P0-S2의 capsule과 Board row는 observation store의 record family가 아니므로 이 module이
  `auditProjectionPrivacy`로 따로 감사하고 그 결과를 `privacy`에 합산한다. 두 성분은
  `privacy_sources`에 나눠 실린다. 현재 fixture 집합에서는 두 성분 모두 0이지만, 이는 guard가
  막고 있어서지 구조적으로 0이 될 수밖에 없어서가 아니다. 실제로 accessor guard가 열거 가능한
  속성만 보던 시절에는 이 감사가 credential 형태 값을 잡아냈다. 감사는 guard가 뚫렸을 때의
  backstop이고, 함수 자체는 일부러 나쁜 projection을 넣어 검증한다.
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
- read-only projection 중 `projectUsageRollup`과 `measureProjectIsolation`은 malformed 입력을
  HOLD로 닫고, `projectJobShop`은 key allowlist만 쓴다.
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
vertical의 `delivery_evidence.producer_evidence_kind`는 저장된 receipt에서 되읽은 값이다.
store가 structural delivery를 애초에 거부하므로 그 경로는 store의 test가 증명하고 vertical은
receipt가 없을 때 `none`이 되는 것만 증명한다.
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

- 보장: 같은 job에 대해 **기록된 완료(`jobs[].recorded_completions`)는 1회를 넘지 않는다**.
  `recorded_completion_count`는 shop 전체 합계라 이 job 단위 불변식의 근거가 아니다.
  timeout처럼 완료가 아예 기록되지 않는 경로도 있으므로 "정확히 1회"가 아니라 "1회 초과 없음"이
  실제 불변식이다. 같은 결과의
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
등록 자체가 첫 health 관찰이므로 `registerResource`도 `observed_at_ms`를 요구한다. 같은 설정을
다시 등록해도 더 오래된 clock이면 `HEALTH_OBSERVATION_NOT_NEWER`이고, 더 새로우면 health 관찰
clock만 전진한다. 이후 관찰도 strictly newer일 때만 반영된다(`HEALTH_OBSERVATION_NOT_NEWER`). 따라서 `down`으로 등록한
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

## Context Capsule

Agent는 장기맥락을 소유하지 않는다. 한 WorkUnit에 필요한 최소 project context만
Context Capsule로 들고 있으며, capsule은 다음을 모두 만족해야 바인딩된다.

- `authority_class`는 `cache_only`이고 `not_authority`는 `true`다. 둘 중 하나라도 다르면
  `CAPSULE_NOT_A_CACHE`다. capsule은 효율용 working cache이지 정본이 아니다.
- `expires_at`이 있어야 하고 이미 지났으면 `CAPSULE_EXPIRED`다.
- `project_id`가 바인딩 대상 project와 다르면 `CAPSULE_PROJECT_MISMATCH`,
  `work_unit_id`가 다르면 `CAPSULE_WORK_UNIT_MISMATCH`다.
- `source_refs`는 ref만 담는다. source body를 넣으면 key allowlist에서 걸린다.

capsule은 ERP 세계수를 대체하지 않는다. 장기 Project Context 정본은 여전히 ERP 세계수이고
이 module은 그 정본을 읽거나 쓰지 않는다.

## P0-S2 three-project job shop

`runP0S2JobShop(fixture)`는 서로 다른 3개 project가 capacity 1인 Spreadsheet resource 하나에
동시에 job을 넣는 상황을 결정론적으로 재현한다. 시계를 읽지 않으므로 같은 fixture는 항상 같은
결과를 낸다.

- 제출 순서는 alpha, beta, gamma이고 dispatch 순서는 beta(긴급), gamma(높음), alpha(일반)다.
  두 순서가 다르므로 제출 순서만으로는 dispatch를 설명할 수 없다. 다만 이 fixture는 tier마다
  job이 하나씩이라 dispatch는 strict priority만으로 완전히 결정된다. 같은 tier 안의 FIFO는
  이 slice가 아니라 `resource_job_shop.test.mjs`의 다섯 job dispatch 테스트가 증명한다.
- 일반 우선순위 job은 유한한 batch가 빠진 뒤 마지막으로 실행된다. 이는 starvation-free 주장이
  아니라 유한 batch에서의 동작이며, aging이 없다는 사실은 job shop 절에 그대로 적혀 있다.
- 첫 worker는 완료 없이 TTL을 넘겨 crash한다. 재획득은 더 높은 fencing epoch를 받고, 죽은
  worker의 완료 시도는 `LEASE_FENCED_OUT`으로 거부돼 `fenced_completion_attempt_count`에 잡힌다.
  같은 완료를 다시 보내면 `NO_OP`다. 그래서 crash·reclaim·replay·timeout을 모두 거쳐도 job당
  기록된 완료는 1회를 넘지 않는다.
- `isolation`은 저장된 record 위에서 계산한다. `measureProjectIsolation`은 store handle이 아니라
  평범한 record 배열을 받으므로 일부러 어긋난 입력으로 측정 자체를 검증할 수 있고, 실제로 그렇게
  검증한다. 측정 축은 capsule 바인딩, parent link, usage 귀속 세 가지뿐이고 receipt·job 축은
  없다. 다만 결과에 실리는 `result.isolation` 값 자체는 구조상 항상 0이다. capsule 바인딩,
  `observeRun`, `recordDirectUsage`가 각각 상류에서 불일치를 거부하므로 이 실행 경로에서는
  불일치한 record가 저장될 수 없다. 이 측정은 나중에 그 guard를 우회하는 producer가 생겼을 때를
  위한 것이지, 지금 무언가를 잡아내고 있다는 뜻이 아니다.
- `counts.leases_granted`는 실제로 발급된 lease 수다. crash 뒤 재획득이 있으면 dispatch 라운드
  수보다 크다.
- `per_project`의 `completion_count`와 `result_ref`는 job 원장에서 되읽는다. lease가 발급됐다는
  사실은 완료가 아니므로, dispatch됐지만 기록된 완료가 없는 job은 `per_project`에 들어가지 않고
  `counts.dispatched_without_completion`으로만 보인다.
- 두 project가 같은 `delivery_receipt_id`를 선언하면 fixture guard가
  `DUPLICATE_DELIVERY_RECEIPT_ID`로 거부하고, `artifact_ref`·`work_unit_id`·`capsule_id`를
  공유하면 `DUPLICATE_PROJECT_IDENTIFIER`로 거부한다. 셋 다 소비자 투영에서 project binding이
  넘어가는 경로다. 실제로 cross-project 통과를 막는 것은 이 guard다.
  delivery receipt 조회가 receipt ID뿐 아니라 craftsman run·agent·receipt kind까지 맞추는 것은
  그 위의 defence in depth이며, 현재 입력 범위에서는 ID만으로도 결과가 같다.

## 기존 owner 표면으로 나가는 두 투영

이 owner는 P0-S2까지 완전한 고립 섬이었다. 자기 디렉터리와 Node 내장 모듈 외에는 아무것도
import하지 않았고, 반대로 이 module set을 import하는 것도 validator 스크립트 하나뿐이었다.
아래 둘은 그 경계를 넘는 유일한 지점이며 둘 다 **읽기 전용 투영**이다. 계약을 새로 만드는 것이
아니라 이미 있는 계약에 맞추는 쪽을 택했다.

### `usage_meter_bridge.mjs` — Usage Ledger를 meter 계약으로

`guild_hall/ai_usage_meter`는 이미 `soulforge.ai_usage_event.v1`을 가지고 있고 거기에는
`actor.agent_id`, `thread_id`/`turn_id`/`parent_thread_id`/`root_thread_id`, project 바인딩,
token, credit, privacy가 **exact key set**으로 들어 있다. 이 module의 usage schema를 그 옆에
경쟁시키는 대신 한쪽을 다른 쪽의 투영으로 만든다.

- 검사는 meter 자신의 `validateUsageEvent`가 한다. 여기서 규칙을 다시 적어 두면 언젠가 원본과
  어긋나지만, 원본을 부르면 어긋날 수 없다. 이 호출은 파일도 상태도 건드리지 않는 순수 함수다.
- provider-side thread id는 `registerAgent`가 유지하는 crosswalk로 해석한다. run id에서 만들지
  않는다. crosswalk가 실제로 값을 하는 지점이 여기다 — meter는 provider thread id로 말하고 이
  module은 durable agent id로 말하는데, 어느 쪽도 상대의 어휘를 배울 필요가 없다.
- 관찰 모델이 소유하지 않는 값은 전부 명시 binding으로 받고 빠지면 거부한다. 기본값을 만들지
  않는다. `project_id`와 `work_id`는 binding allowlist에 아예 없어서 caller가 다른 값을 제시하는
  것 자체가 unknown field다.
- meter의 `source.kind`는 3값 닫힌 enum이라 그 밖의 provider는 가장 가까운 값으로 밀지 않고
  거부한다. Hermes가 없는 것은 의도다. 넣으려면 2.29 MB 영속 상태가 뒤에 있는 검증 스키마의
  마이그레이션이고, 그 결정은 투영 함수가 할 일이 아니다.
- `billed_cost`와 `subscription_credit_observation`은 투영하지 않는다. 관찰 record는 청구의
  evidence ref만 갖고 금액은 갖지 않으므로, `rate_unknown`으로 보내면 관측된 청구를 버리는 것이고
  `calculated`로 보내면 없는 총액을 지어내는 것이다.

`measureMeterProjectability`는 아무것도 투영하지 않고 몇 건이 meter에 닿을 수 있는지와 나머지가
왜 못 닿는지를 센다. `not_projectable`이 늘어나는 것이 두 계약이 벌어지고 있다는 신호다.

### `board_health_projection.mjs` — Board가 이미 게시하는 두 health

`live-thread-projection.mjs`의 `scope.result_gate_health`와 `scope.binding_coverage`는 이미
존재하고 닫힌 값 집합으로 검증되는데 agent observation 쪽에서 채우는 것이 없었다. 세 번째 health
신호를 만들지 않고 그 두 자리를 Board 자신의 어휘로 채운다.

- `disabled`은 **절대** 내보내지 않는다. 게이트를 끄는 것은 라이브 registry의 `disabled` 플래그와
  Board를 돌리는 프로세스의 `TEAM_OPS_BOARD_RESULT_GATES_DISABLED` 둘뿐이고, 인메모리 store는
  둘 다 관측할 수 없다. 여기서 `disabled`을 보고하면 추측을 관측인 척 내놓는 것이다. module이 그
  문자열을 대입하지 않는다는 것 자체를 test가 소스에서 확인한다.
- `binding_coverage`가 공허해지지 않게 조건을 하나 더 둔다. store는 미등록 agent와 project 불일치를
  이미 쓰기 시점에 거부하므로 그 둘만 보면 비어 있지 않은 store는 언제나 `exact`가 된다. 그래서
  **agent가 run이 실제로 쓴 provider의 crosswalk 신원을 갖고 있는가**를 함께 본다. 한 provider로
  등록된 agent가 다른 provider에서 도는 것은 합법이고, 그런 run은 어떤 provider thread로도
  추적되지 않는다.
- 두 값 모두 보수적인 쪽으로 떨어진다. 빈 store는 `missing`과 `hold`이며 공허한 전칭으로
  `available`과 `exact`가 되지 않는다. run이 여럿일 때 하나만 미바인딩이어도 전체가 `hold`다.
- 알 수 없는 handle은 `UNKNOWN_STORE`로 거부한다. list 접근자가 빈 배열이 아니라 `null`을
  돌려주므로 `undefined`만 확인하면 외부 handle이 빈 store로 통과해 건강한 scope로 보고된다.
- 판정만 내보내지 않고 그 판정을 만든 count를 `evidence`에 함께 싣는다. consumer가 판정을 믿는
  대신 이유를 볼 수 있어야 한다.

두 module 모두 write authority가 없다. 투영 결과를 meter나 Board에 실제로 넘기는 것은 이 owner의
동작이 아니라 별도의 gated action이다.

## 검증

```powershell
npm.cmd run validate:agent-observation
```

이 validator는 일곱 개 구현 module의 syntax check와 여덟 개 test 파일의 focused
deterministic test를 실행한다.
위 경계 문장은 각각 대응하는 test를 가지며, `guard_primitives.test.mjs`는 로컬 경로·secret·label
규칙의 개별 alternative를 하나씩 검증한다. 개발 중 guard 제거 probe로 테스트 강도를 확인했지만
그 harness는 저장소에 포함되지 않으므로 여기서 coverage 점수를 주장하지 않는다. 검증 가능한 것은
이 validator가 실행하는 test 자체다.

### 일부러 죽지 않는 변이

probe가 잡지 못하는 변이를 숨기지 않고 적는다. 아래는 모두 도달 가능한 입력이 없어서 살아남는
것이며, 테스트가 약해서가 아니다.

- tier 안 FIFO의 `submitted_seq` 비교(`resource_job_shop.mjs`). `submitJob`이 resource별로
  seq를 단조 증가시키고 `state.jobs`가 삽입 순서로 순회하므로 같은 tier의 첫 후보가 항상 최소
  seq다. 비교문은 FIFO가 Map 순회 순서에 조용히 기대지 않게 하려고 남겨 둔 명시적 중복이다.
- `per_project[].result_ref`를 원장 대신 spec의 `artifact_ref`에서 읽는 변이. 러너가 항상
  `result_ref: artifactRef`로 완료를 기록하므로 두 값이 모든 입력에서 같다. 원장을 읽는 것이
  실제로 작동하는 지점은 **값**이 아니라 **존재**다 — 기록된 완료가 없으면 행 자체가 없고,
  그 성질은 테스트가 증명한다.
- projection privacy 성분을 합계에서 빼는 변이. guard가 모두 버티는 한 그 성분은 항상 0이라
  `0 === 0 + 0`이 성립한다. 감사 함수 자체가 더러운 행을 잡는다는 것은 별도로 증명되어 있다.
- bridge의 `isSafeId(threadId)` 재확인. crosswalk의 `id_value`는 `registerAgent`에서 이미 safe
  id로 검증되므로 저장된 값이 이를 위반할 수 없다.

결과는 public deterministic candidate 수락이며 actual project, live runtime,
provider 연결, 운영 승격 수락이 아니다. `usage_meter_bridge.mjs`가
`guild_hall/ai_usage_meter/usage_meter.mjs`의 `validateUsageEvent`를 **순수 함수로만** 부르는
것이 이 owner의 유일한 외부 import이며, 그 호출은 파일도 상태도 건드리지 않는다. 이 module set을
import하는 다른 owner는 아직 없다.
