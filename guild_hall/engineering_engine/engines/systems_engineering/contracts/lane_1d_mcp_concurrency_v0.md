# Lane 1D — MCP request admission, idempotency, CAS, and serialisation

Status: `LANE CONTRACT / AUTHOR-WRITTEN FIXTURES / INDEPENDENT LOCK OWED BY 1V`

동결 crosswalk 에서 `mcp_request_receipt_cas_idempotency` 를 소유한다. Phase 1-0 공통 계약을 consume-only 로 쓴다.

구현: `kernel/mcp_contract.mjs` · 시험: `tests/lane_1d_conformance.mjs`

## 1. 문제

여러 사람이 거의 동시에 engine 에 묻는다. 위험한 결과는 **거부된 요청이 아니라, stale 상태를 조용히 쓴 채 수락된 요청**이다. 따라서 모든 규칙은 fail-closed 다.

## 2. 요청 봉투

`D` 요청은 아래 12개를 pin 한다. 하나라도 없으면 거부한다.

```text
request_id · idempotency_key
caller_identity · caller_role · caller_authority_ceiling
project_binding_ref · accepted_context_generation
engine_binding_revision · module_binding_revision
operation · requested_ceiling
known_at_boundary
```

`D` 모든 비교는 **관찰된 서버 상태**에 대해 한다. 호출자가 자기에 대해 제출한 값을 근거로 통과시키지 않는다.

## 3. 권위 상한

`D` `read < candidate < write`. operation 은 자기 선언 ceiling 이상을 요구하고, 호출자는 자기 ceiling 을 초과 요청할 수 없다. 두 방향을 모두 검사한다.

## 4. 세 가지 핵심 결정

### 4.1 idempotency key 는 payload 에 대한 약속이다

`D` 같은 key + 같은 payload → **재실행 없이 기록된 응답을 replay**.
`D` 같은 key + 다른 payload → **거부.** 조용히 실행하면 key 가 무의미해진다.
`D` 같은 key + 다른 operation → **거부.**

payload digest 는 canonical 직렬화 기반이라 key 순서가 달라도 같은 digest 다. 순서 차이가 가짜 충돌을 만들지 않는다.

### 4.2 상태를 전진시키는 연산은 CAS 를 요구한다

`D` `p5_accept_context` · `advance_generation` · `promote_binding` · `p8_write_task` 는 호출자가 **현재라고 믿는 fingerprint** 를 함께 제출해야 한다.

- 미제출 → 거부
- 불일치 → **관찰된 값과 함께 거부.** 위에 덮어쓰지 않는다

읽기는 CAS 를 요구하지 않는다.

### 4.3 직렬 lane 은 거부하고, 큐에 담지 않는다

`D` 상태 전진 연산마다 **독립 lane** 을 둔다. 네 개의 별도 경계다.

| lane | operation |
|---|---|
| `p5_acceptance` | `p5_accept_context` |
| `generation_advance` | `advance_generation` |
| `binding_promotion` | `promote_binding` |
| `p8_writer` | `p8_write_task` |

같은 lane 의 두 번째 시도는 **거부**한다. 큐잉은 아직 열린 runtime 구현 선택이고, 계약은 거부다. "바쁘다"는 답을 받은 호출자는 다음 행동을 결정할 수 있지만, 조용히 대기열에 놓인 호출자는 못 한다.

서로 다른 lane 은 막지 않는다. P5 와 P8 은 동시에 진행할 수 있다.

## 5. 병렬 허용 범위

`P` immutable 입력에 대한 read 와 candidate 계산은 병렬이다.

```text
parallel   read_snapshot · read_finding_view · read_capsule
           compute_candidate_finding · compute_context_request_candidate · compute_taskintent_candidate
serialised p5_accept_context · advance_generation · promote_binding · p8_write_task
```

## 6. cache 격리는 구조적이다

`D` cache key 재료에 `project_binding_ref` · `accepted_context_generation` · engine/module binding revision · operation · query digest 를 넣는다.

따라서 **project A 의 조회가 project B 의 항목에 도달할 수 없다.** 사후 필터가 아니다 — 사후 필터는 이미 남의 자료를 읽은 뒤다.

`D` 추가로 `assertCacheEntryServesRequest()` 가 항목의 project·generation 을 요청과 대조해 이중으로 막는다.

## 7. `known_at` 경계

`D` 호출자가 선언한 `known_at_boundary` 는 답변이 쓸 수 있는 evidence 의 **상한**이다. 서버가 그보다 나중에 알게 된 evidence 를 쓰면 응답이 선언된 관찰 창이 아니라 타이밍에 의존하게 된다.

## 8. fail-closed 목록

`stale generation`(과거·미래 모두) · `project mismatch` · `binding changed` · `duplicate idempotency key with different payload` · `duplicate key with different operation` · `missing CAS fingerprint` · `CAS mismatch` · `serialised lane busy` · `insufficient authority` · `cross-project cache entry` · `evidence newer than known_at`

## 9. 열린 항목

`U` 이 lane 은 동시성 하에서 **정확성을 결정하는 부분**만 고정한다. 아래는 runtime 결정으로 남는다.

- `exact_request_response_wire_schema`
- `lock_or_queue_mechanism`
- `retry_and_timeout_policy`

## 10. 검증 강도 — 정직한 한계

`O` 동결 oracle 에 1D case 가 없다. 기대값을 구현과 같은 저자가 썼다. lane 1V 가 독립 locked fixture 를 만들 의무를 지며, 그때까지 independently verified 로 부르지 않는다. 시험 출력이 매 실행마다 이 사실을 함께 보고한다.
