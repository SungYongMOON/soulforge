# Phase 3 — Context Request / Response 영수증 (합성 전용)

Status: `SYNTHETIC ONLY / CANDIDATE / NO TRANSPORT / NO LIVE P5`

구현: `kernel/context_receipt.mjs` · 시험: `tests/phase_3_context_receipts.mjs` (92 통과 / 0 실패)

## 1. 왜 필요했나

동결 `runtime_lifecycle_sequence` 는 gap 과 사람의 수락 사이에 네 gate 를 둔다.

```text
context_request_candidate
→ context_request_receipt      (immutable_transmission_receipt_not_acceptance)
→ context_response_receipt     (immutable_transmission_receipt_not_acceptance)
→ response_remains_context_candidate
→ p5_registered_human_acceptance
```

`O` 이 중 **가운데 셋이 코드에 없었다.** 엔진에 있던 영수증은 두 종류였고 둘 다 다른 것을 증명한다.

## 2. 영수증 4종 — 서로 대신하지 못한다

| 종류 | 무엇을 증명하나 | 소유 |
|---|---|---|
| `topology_delivery_receipt` | 이 엔진의 간선 하나가 어떤 run 에서 통과됐다 | `kernel/delivery_receipt.mjs` |
| `mcp_idempotency_response` | 같은 key 로 이미 물었고 그때 이렇게 답했다 | `kernel/mcp_contract.mjs` |
| `context_request_receipt` | 지목된 principal 에게 지목된 질문을 보냈다 | `kernel/context_receipt.mjs` |
| `context_response_receipt` | 그 principal 이 답했고 답의 exact revision·hash 는 이것이다 | `kernel/context_receipt.mjs` |

`D` idempotency 응답은 **재시도 장치**다. "누가 답했다"의 증거가 아니며 principal·authority·source ref 를 아예 나르지 않는다. delivery 영수증은 **이 엔진 자신에 대한 관측**이다. 어느 쪽도 사람에게 물어본 사실을 대신하지 못한다. 시험이 두 shape 을 서로에게 넣어 거부를 확인한다.

## 3. 두 영수증이 지는 계약

`P` **영수증은 수락이 아니다.** `is_acceptance` 는 반드시 `false` 다. 수락은 등록된 사람이 P5 에서 한다.

`P` **영수증은 대상과 별개 기록이다.** `context_request_receipt_id ≠ context_request_id`, `context_response_receipt_id ≠ context_response_id`. 하나로 합치면 "물었다"와 "물은 것으로 기록됐다"가 같은 사실이 된다.

`P` **불변이다.** 고쳐 쓸 수 있는 영수증은 무엇이 오갔는지 증명하지 않는다.

두 영수증이 함께 나르는 것:

```text
exact request/response id       (minted, 서로 구별)
project_binding_ref
accepted_context_generation
accepted_context_cas_fingerprint     ← 어느 accepted context 를 상대로 찍혔는가
principal_ref · authority_ref
valid_at · known_at
context_request_content_hash / context_response_content_hash
source_revision_refs · artifact_revision_refs   (응답 측, exact revision ref)
```

`D` 응답 영수증은 요청 영수증과 **연결을 증명**한다. `in_response_to_context_request_id` 와 `in_response_to_receipt_id` 가 맞아야 하고, binding·generation·CAS 가 같아야 하며, 답이 질문보다 먼저 알려질 수 없다.

## 4. 응답은 아직 candidate 다

`P` 권위 있는 곳에서 온 답이라도 **accepted context 가 아니다.** `candidate_only === true` · `accepted === false` · `erp_delta === 0`.

`D` `assessResponseSufficiency()` 가 두 축을 **따로** 낸다.

- evidence 충분성: 해석 가능한 source revision ref 가 있고 `evidence_claim_ceiling === 'source_sufficient'`. `source_referenced` 는 "ref 가 있다"이지 "주장을 덮는다"가 아니다
- authority 적용성: 등록된 family 이고 다섯 구성요소 applicability 가 모두 참이며, 질문이 구한 family 보다 낮지 않다

둘을 합치지 않는다. 적용성 완벽한 권위가 인용 없이 답할 수 있고, 빈틈없이 인용한 답이 이 과제를 지배하지 않는 source 에서 올 수 있다.

## 5. P5 orchestration 경계

`D` `assertP5OrchestrationBoundaryEvaluable()` 가 답하는 질문은 **"수락할까"가 아니라 "수락 판단을 올릴 수 있는 상태인가"** 다. 통과 조건은 전부 필요조건이다.

```text
두 영수증이 모두 있고 서로 다른 기록이며 각자 유효
응답 candidate 가 그 영수증의 것이고 아직 candidate
셋 다 요청 binding·generation 과 일치
두 영수증의 CAS 가 관측 fingerprint 와 일치
선언된 freshness window 안
evidence 충분 + authority 적용
```

`P` 하나라도 없거나·어긋나거나·오래됐거나·다른 과제면 **멈춘다.** 약해진 상태로 계속 가지 않는다. finding 은 열린 채 남는다.

`D` `freshnessWindow` 와 `now` 는 주입한다. 이 모듈은 시계를 읽지 않으므로 replay 가 같은 판정을 낸다.

`P` 통과 결과도 `p5_acceptance_performed: false` · `generation_advanced: false` · `erp_delta: 0` 을 명시한다. 경계에 도달한 것은 등록된 사람에게 물어도 된다는 뜻이고 그 이상이 아니다.

## 6. 하지 않는 것

`NON_CAPABILITIES` 가 코드로 선언한다.

- transport 또는 외부 서비스 호출 (`assertNoTransport()` 가 거부)
- live P5 수락
- `accepted_context_generation` 증가
- ERP write
- 학습모델 호출

## 7. 정직한 한계

`O` 모든 영수증을 모듈에 **건네준다.** 아무것도 전송하지 않았으므로 실제 교신에 대해 말하는 바가 없다.

`O` 기대값과 규칙의 저자가 같다. 규칙이 구현과 fixture 에서 똑같이 틀리면 이 시험은 통과한다. lane 1V mutation lock 이 6개 변이로 이 모듈의 guard 가 실제로 작동하는지만 확인한다.
