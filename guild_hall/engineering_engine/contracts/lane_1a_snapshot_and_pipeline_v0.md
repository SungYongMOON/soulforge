# Lane 1A — Snapshot envelope, state axes, Finding, Context Request, P5–P8

Status: `LANE CONTRACT / AUTHOR-WRITTEN FIXTURES / INDEPENDENT LOCK OWED BY 1V`

동결 crosswalk 에서 `snapshot_envelope_state_axes_finding_and_pipeline_contract_fields` 를 소유한다.

구현: `kernel/snapshot.mjs`, `kernel/pipeline.mjs` · 시험: `tests/lane_1a_conformance.mjs` (150 통과 / 0 실패)

## 1. 엔진의 일은 하나의 비교다

계약·규칙이 요구하는 것(**Expected**) 대 과제 산출물이 보여주는 것(**Observed**). Snapshot 은 그 비교 한 번의 동결 기록이고, Finding 은 둘이 어긋난 한 지점이다.

## 2. 세 가지 핵심 규칙

### 2.1 element 는 정확히 한 축에 속한다

`D` `requirement_ref` 와 `artifact_revision_ref` 를 **둘 다 가진 element 는 거부**한다. 승자를 정해주지 않는다.

이유: 하류의 비교는 **독립적인 두 주장** 사이에서 일어난다. 한 객체가 둘 다일 수 있으면 그것은 자기 자신과 어긋날 수 없고, 그 순간 모든 gap 이 조용히 사라진다.

### 2.2 missing 은 확인된 부재만 도달한다

`D` gap 5종: `satisfied` · `gap_missing` · `gap_unknown` · `gap_conflict` · `unexpected_observed`

| 관찰 상태 | gap |
|---|---|
| `absence_confirmed` | `gap_missing` |
| `unknown` | **`gap_unknown`** |
| 관찰 시도 자체가 없음 | **`gap_unknown`** |

`D` `conflicts: true` 를 줘도 `unknown` 은 승격되지 않는다. `assertMissingIsConfirmed()` 가 직접 조립하는 호출자에게도 같은 규칙을 강제한다.

이 규칙이 편의에 의해 가장 침식되기 쉽다 — **unknown gap 은 보고하기에 만족스럽지 않기 때문이다.** "문서가 없습니다"라고 보고했는데 진실이 "공유 폴더에 접근할 수 없었습니다"인 상황이 이 함수가 막는 실패다.

`P` `unexpected_observed` 는 결함이 아니다(`is_defect: false`). 요구사항 집합이 불완전할 수도 있고, 어느 쪽인지 판정은 사람 몫이다.

### 2.3 Snapshot 은 수정하지 않는다

`D` `edit` · `patch` · `update_in_place` 는 거부한다. 정정은 **기존을 supersede 하는 새 Snapshot** 이다.

수정하면 어떤 결정이 내려진 시점에 **무엇을 믿고 있었는지의 기록**이 파괴된다. 그 기록이 Snapshot 의 존재 이유 대부분이다.

## 3. fingerprint 는 신뢰하지 않고 재계산한다

`D` `validateSnapshotEnvelope()` 는 저장된 `deterministic_replay_fingerprint` 를 선언된 projection 으로 **다시 계산해 대조**한다. 아무도 재계산하지 않는 저장 fingerprint 는 주석이지 검사가 아니다.

`D` 두 provenance 층은 분리를 유지해야 한다. `assertProvenanceLayersSeparate()` 는 `run_observational_provenance` 의 key 가 `replay_relevant_provenance` 에도 있으면 거부한다 — 그것이 **모든 replay 가 새 fingerprint 를 만들게 하는** 정확한 원인이다.

`P` 검증됨: `engine_run_id` 를 바꿔도 envelope 검증은 통과하고, `accepted_context_generation` 을 바꾸면 실패한다.

## 4. Finding 은 확인 가능한 것에 기대야 한다

`D` `finding_id` · `snapshot_id` 는 **발급된 식별자**여야 한다(D-P10-03). candidate handle 은 거부한다 — 병렬 단계 산출은 citable 하지 않다.

`D` `evidence_claim_ceiling` 은 **evidence 축**만 받는다(D-P10-01). canon 축 값은 거부한다.

`D` finding 은 **보존된 인용 span** 또는 **관찰 시도 기록** 중 하나는 있어야 한다.

- conflict·satisfied → 인용 span
- missing·unknown → citable 한 것은 요구사항 + 관찰 시도가 무엇을 반환했는지의 기록

거부되는 것은 **아무것도 인용하지 않는 finding** 이다. 그건 확인할 방법이 없는 주장이다.

## 5. 네 개의 직렬 경계는 서로 다르다

`D` lane 이름은 lane 1D 의 `OPERATIONS` 에서 **파생**한다. 같은 네 경계를 두 곳에 적으면 결국 어긋나고, 그 어긋남은 **경쟁하지 않는 lock** 으로 나타난다.

| lane | 바꾸는 것 | **바꾸지 않는 것** |
|---|---|---|
| `p5_acceptance` | accepted context set | generation · binding · ERP |
| `generation_advance` | accepted generation | context 수락 · binding · ERP |
| `binding_promotion` | project binding | context 수락 · generation · ERP |
| `p8_writer` | ERP task ledger | context 수락 · generation · binding |

`D` `does_not` 절이 하중을 받는 절반이다. 그게 없으면 읽는 사람이 한계를 추론해야 하고, **추론이 곧 한 번의 수락이 generation 을 전진시키는 경로**다.

`D` `assertBoundarySeparation()` 은 한 경계를 통과한 것이 다른 경계도 통과했다는 주장을 거부한다. **한 승인이 두 번째 효과를 사면 안 된다.**

## 6. P5 · generation · P8

`D` **P5**: 엔진은 사람을 대신해 수락하지 않는다. `kind: 'engine'` 또는 `'agent'` 는 거부한다. 검사는 **관찰된 principal kind** 에 대해 하며 호출자가 자기 권한에 대해 주장한 값을 근거로 하지 않는다. CAS 필수 — 읽은 뒤 움직인 context set 위에 덮어쓰지 않고 거부한다. 결과는 `generation_advanced: false` 를 **명시**한다.

`D` **generation advance**: 정확히 +1. 건너뛰기·되돌리기·정지 모두 거부한다. 되돌릴 수 있으면 **한 번호가 서로 다른 두 context set 을 뜻하게** 되고, 그 번호를 인용한 모든 Snapshot 이 모호해진다.

`D` **P8**: 명시적 승인 + 승인자 지목 필수. **자기 승인은 기본 거부** — `self_approval_permitted: true` 가 있어야 통과하고, 그것이 애초에 허용되는지는 Owner 결정이다. `candidate_only: true` 인 task intent 는 거부한다: 엔진이 제안했고 아무도 승인하지 않았는데 ledger 에 나타나는 것이 이 검사가 막는 실패다.

`P` P8 이후 **Snapshot 을 재작성하지 않는다**(`snapshot_rewritten: false`). task 쪽이 불변 Snapshot 을 역방향 참조한다.

## 7. P6 는 candidate 전용

`D` `candidate_only === true` 이고 `erp_delta === 0` 이어야 한다. Context Request 는 엔진이 "이건 사람이 알려줘야 한다"고 말하는 것이며, task 도 ledger 항목도 만들지 않는다.

`D` `body` · `payload` · `raw_span` · `text` · `file_bytes` 를 실은 request 는 거부한다. request 는 **finding 포인터를 나르고 근거 본문을 나르지 않는다.**

## 8. P7 은 정의하지 않았다 — 발견 사항

`U` **동결 Phase 1-0 계약은 P5 · P6 · P8 을 지목하지만 P7 을 정의하지 않는다.**

동결 본문이 서술하는 경로는 `context candidate → request/response receipt → P5 → 새 generation → 새 Snapshot` 이다. 여기에 P7 자리가 없다.

`D` 이 lane 은 번호를 채우기 위해 단계를 **발명하지 않는다.** `P7.state = 'UNKNOWN_pending_engine_owner'` 로 기록하고 `assertStageDefined('P7')` 은 거부한다. 아무도 명세하지 않은 단계에 여기서 계약을 부여할 수 없다.

Phase 1 을 막지는 않는다. P5 · P6 · P8 은 완전히 고정됐다.

## 9. 열린 항목 — Owner 결정

| 항목 | 무엇을 막는가 |
|---|---|
| `p5_and_p8_registered_human_approver_registration_policy` (D-P10-08) | 실제 P5 수락 |
| `whether_self_approval_is_ever_permitted_and_for_whom` | 1인 운영 시 P8 |
| `p7_stage_definition_or_removal_from_the_numbering` | 문서 일관성 |

## 10. 검증 강도 — 정직한 한계

`O` 동결 oracle 에 1A case 가 없다. 기대값을 구현과 같은 저자가 썼다. lane 1V 가 mutation 기반 lock 을 진다.

`D` `1A/harness/self_test` 가 매 실행마다 시험 하네스의 유효성을 확인한다.
