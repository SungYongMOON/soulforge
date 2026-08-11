# Lane 1A — Snapshot envelope, state axes, Finding, Context Request, P5–P8

Status: `LANE CONTRACT / AUTHOR-WRITTEN FIXTURES / INDEPENDENT LOCK OWED BY 1V`

동결 crosswalk 에서 `snapshot_envelope_state_axes_finding_and_pipeline_contract_fields` 를 소유한다.

구현: `kernel/snapshot.mjs`, `kernel/pipeline.mjs` · 시험: `tests/lane_1a_conformance.mjs` (151 통과 / 0 실패)

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

`D` **P5**: 엔진은 사람을 대신해 수락하지 않는다. `kind: 'engine'` 또는 `'agent'` 는 거부한다. CAS 필수 — 읽은 뒤 움직인 context set 위에 덮어쓰지 않고 거부한다. 결과는 `generation_advanced: false` 를 **명시**한다.

`O` 이전 판은 "검사는 관찰된 principal kind 에 대해 한다"고 적었다. **그 kind 자체가 호출자가 쓰는 필드였다.** `kind: 'registered_human'` 이라고 적은 principal 은, 아무도 등록한 적 없는 식별자를 달고도 P5·generation advance·P8 writer 세 경계를 전부 통과했다. 계약이 "등록된 사람만"이라고 가장 강하게 말하는 자리에서 실제로 확인한 것은 그 주장뿐이었다.

`D` **등록은 증거로 확인한다.** 세 경계는 `registrationRegistry` 를 요구한다. registry 는 content-addressed 이고 자기 revision 에 고정된다 — `registry_content_address` 가 `registry_revision_ref.content_id` 와 같아야 하고, entry 주소 집합과 registry 주소를 kernel 이 다시 계산한다. entry 하나를 붙이거나 고치면 registry 가 선언한 주소가 깨진다. 확인은 project binding 과 시각(`known_at`)까지 범위를 맞춘다. 판정에는 사용한 `registry_revision_id` 와 `entry_content_address` 가 함께 남는다.

`P` 이것은 **D-P10-08 을 닫지 않는다.** 누가 등록될 수 있는지는 여전히 Owner 결정이다. 닫힌 것은 "그렇다고 말하는 것만으로 충분하다"는 상태다. kernel 은 live registry 를 조회하지 않고 공급된 증거만 검증한다 — `kernel/registration.mjs` 가 그 경계를 코드로 선언한다.

`D` **generation advance**: 정확히 +1. 건너뛰기·되돌리기·정지 모두 거부한다. 되돌릴 수 있으면 **한 번호가 서로 다른 두 context set 을 뜻하게** 되고, 그 번호를 인용한 모든 Snapshot 이 모호해진다. P5 와 같은 등록 증거를 요구하며, 등록은 시각에서만 성립하므로 canonical `known_at` 도 함께 요구한다.

`D` **P8**: 명시적 승인 + 승인자 지목 필수. writer principal 과 승인자 모두 이 gate 에 공급된 **하나의** registry 로 확인하며, 확인 시각은 `approved_at` 이다. **자기 승인은 기본 거부** — `self_approval_permitted: true` 가 있어야 통과하고, 그것이 애초에 허용되는지는 Owner 결정이다. `candidate_only: true` 인 task intent 는 거부한다: 엔진이 제안했고 아무도 승인하지 않았는데 ledger 에 나타나는 것이 이 검사가 막는 실패다.

`P` P8 이후 **Snapshot 을 재작성하지 않는다**(`snapshot_rewritten: false`). task 쪽이 불변 Snapshot 을 역방향 참조한다.

## 7. P6 는 candidate 전용

`D` `candidate_only === true` 이고 `erp_delta === 0` 이어야 한다. Context Request 는 엔진이 "이건 사람이 알려줘야 한다"고 말하는 것이며, task 도 ledger 항목도 만들지 않는다.

`D` `body` · `payload` · `raw_span` · `text` · `file_bytes` 를 실은 request 는 거부한다. request 는 **finding 포인터를 나르고 근거 본문을 나르지 않는다.**

## 8. P7 은 TaskDriver 다 — 정정

`O` 이전 판은 P7 을 `UNKNOWN_pending_engine_owner` 로 기록했다. **그것은 이 lane 의 읽기 오류였고 Owner 미결 항목이 아니었다.** 동결 입력 세 곳이 P7 을 이미 정의한다.

- `engine_plan_v1_2.md` §1.4 lifecycle: `… → P6 TaskIntent candidate → P7 TaskDriver → P8 sole ERP writer`
- `engine_plan_v1_2_1.md` §6.2: `… → why / why-now / authority / idempotency internal policy gate → P7 TaskDriver → separately authorized external P8 sole writer`
- `phase_1_0_work_lanes.yaml` `runtime_lifecycle_sequence`: `gate_id: p7_taskdriver`, `requires: [why_why_now_authority_and_idempotency]`

`D` 채택: `P7` 은 **TaskDriver** 이고, 그 앞에 우회 불가능한 `why` · `why-now` · `authority` · `idempotency` 내부 정책 gate 가 선다. V1.2 는 네 검사를 P7 내부 동작으로 서술했고 V1.2.1 은 같은 검사를 별도 gate 로 승격했다. 두 판을 모두 지키기 위해 gate 를 독립 함수로 두고 P7 이 그 결과를 **입력으로 요구**한다. P7 을 직접 호출해도 gate 를 건너뛸 수 없다.

| 표면 | 소유 |
|---|---|
| `POLICY_GATE_ID` · `TASK_DRIVER_POLICY_CHECKS` | `pipeline.mjs` |
| `evaluateTaskDriverPolicyGate()` | 네 검사, 실패한 검사 이름을 그대로 보고 |
| `evaluateP7TaskDriver()` | gate 결과를 요구하고 candidate 판정만 낸다 |
| `assertTaskDriverNotActivated()` | 판정을 활성화로 읽는 것을 거부 |

`P` **활성화는 하지 않는다.** `P7.activation_state === 'not_activated'`, 판정은 `candidate_only === true` · `driver_activated === false` · `erp_delta === 0` 이다. 단계를 정의한 것이 live driver 를 켜는 권한을 만들지 않는다.

### 8.0.1 `authority` 검사는 호출자가 답하지 않는다

`O` 이전 판의 `authority` 검사는 `authority.registered === true && authority.applicability === true` 였다. **둘 다 write 를 요청하는 쪽이 적는 필드다.** 존재하지 않는 `authority_ref` 에 `registered: true` 를 붙이면 gate 를 통과했고, 따라서 P7 과 그 위에 선 모든 P8 write 를 통과했다. P8 write 에 대한 가장 강한 전제조건이 사슬에서 가장 약한 값이었다.

`D` 입력은 `{ authority_ref, authority_family }` 두 필드다. `registered` 또는 `applicability` 가 들어오면 **무시하지 않고 거부한다** — 그것을 주장하는 것은 이 gate 가 판단하려는 대상을 주장하는 것이고, 무시하면 호출자가 자기 입력이 아무 효과도 없다는 사실을 모른 채 지나간다. 실패 사유는 `detail.authority_failure` 로 그대로 나온다.

`D` 등록과 적용 가능성은 **같은 등록 증거**에서 나온다. entry 가 이 project binding 과 이 authority family 를 덮고 `known_at` 이 그 유효 구간 안에 있으면 통과하고, 아니면 통과하지 않는다. 판정에는 `authority_registration { authority_ref, authority_family, registry_revision_id, entry_content_address }` 가 남는다.

`D` `assertStageDefined()` 는 이제 `P5` · `P6` · `P7` · `P8` 을 받고 그 밖의 단계를 거부한다.

## 8.1 P8 은 사슬 전체를 요구한다

`P` `candidate_only === false` 는 **필요조건이고 충분조건이 아니다.** candidate 를 벗어났다고 선언한 TaskIntent 하나로 write 가 열리면 앞의 모든 gate 가 장식이 된다.

`D` `evaluateP8Write()` 는 아래 12 요소를 모두 요구하고, 서로 같은 사슬의 고리인지까지 대조한다.

```text
project_binding_ref · accepted_context_generation
p5_acceptance · generation_advance
snapshot · finding · disposition_event
context_authority_gate
task_intent · policy_gate · task_driver
evidence (immutable receipt + CAS)
```

- generation: `generation_advance.to` = 인용 generation = `snapshot.accepted_context_generation`. 어긋나면 stale 로 거부
- lineage: finding 은 그 snapshot 의 것, disposition event 는 그 finding 의 것, TaskIntent 는 그 snapshot·finding 의 것
- authority: disposition 은 append-only 이고 등록된 사람이 확인한 것, context/authority gate 4검사(`context_sufficiency` · `evidence_sufficiency` · `registered_authority` · `applicability`) 통과, 등록된 authority family 지목, 그리고 **이 snapshot** 에 대해 평가된 것
- gate 순서: `policy_gate.passed === true` 이고 그 gate 가 **이 TaskIntent** 의 것, `task_driver` 가 그 gate 뒤에서 평가된 것
- project binding: 12요소 중 record 10종과 **승인까지 모두 같은 binding**. 다르면 cross-project 로 거부
- evidence: `immutable === true`, content address 보유, `cas_fingerprint` 가 관측 fingerprint 와 일치
- 승인: `approver_kind === 'registered_human'`, 시각 보유, **이 TaskIntent 를 지목**. agent · engine · 모델 승인은 승인이 아니다
- disposition: `confirmed_by_registered_human` 뿐 아니라 `confirmed_by_principal_kind === 'registered_human'` 과 지목된 principal id. 플래그만으로는 AI 확인과 구분되지 않는다

### 8.1.1 모양과 `passed: true` 는 증거가 아니다

`O` 이전 판은 각 고리를 **모양으로** 읽었다. `boundary: 'p5_acceptance'` 는 누구나 적을 수 있는 문자열이고 `passed: true` 는 이 사슬에서 가장 위조하기 쉬운 값이다. 고리 하나하나가 옳아 보이는데 아무도 그것이 실제로 평가된 결과인지 다시 계산하지 않았다.

`D` **불변 provenance 를 record 마다 요구하고 다시 계산한다.** record 10종과 승인은 각각 `provenance { immutable, content_address, project_binding_ref, recorded_at }` 를 나른다. `content_address` 는 그 record 의 내용(자기 provenance 제외)에서 `chainElementContentAddress(name, element)` 로 다시 계산해 대조한다. 기록된 뒤 편집된 고리는 모든 필드가 그대로여도 실패한다. 이름이 재료에 들어가므로 같은 내용이라도 다른 위치의 고리는 같은 주소를 갖지 않는다.

`D` **네 boundary 는 다시 실행한다.** `p5_acceptance` · `generation_advance` · `policy_gate` · `task_driver` 는 record 가 나르는 `recompute_inputs` 로 각 boundary 함수를 다시 돌리고, 기록된 판정이 정확히 재현되는지 canonical form 으로 대조한다. 재현하지 못하는 판정은 결과가 아니라 주장이다. `task_driver` 는 자기 입력이 같은 사슬의 다른 두 고리이므로 별도 입력을 요구하지 않는다.

`D` **registration registry 만은 record 에서 읽지 않는다.** P8 에 공급된 registry 를 재실행에 주입하고, 사슬이 `recompute_inputs` 에 실어 온 registry 는 무시한다. 사슬이 자기 acceptor 를 보증하는 증거를 스스로 들고 오면 재계산은 자기 자신과 일치할 뿐 아무것도 증명하지 못한다. 이는 lane 1C 에서 node 집합이 edge 의 자기증명을 막는 것과 같은 형태다.

`D` **evidence 의 CAS 사슬을 계산한다.** `receipt_material` 이 실제로 있어야 하고, 그 내용이 `evidence.content_address` 로 해시되어야 하며, `receipt_ref` 가 서로 일치해야 한다. 뒤에 아무것도 없는 content address 는 아무것도 지시하지 않는다.

`P` 이 함수는 **ERP 를 쓰지 않는다.** 결과는 `gate_evaluation_only: true` · `erp_write_performed: false` · `erp_writes: 0` 이다. 외부 sole writer 권한은 이 엔진에 없다. 위 검사를 전부 통과하는 유일하게 고정된 positive control 도 write 수는 0이다.

## 9. 열린 항목 — Owner 결정

| 항목 | 무엇을 막는가 |
|---|---|
| `p5_and_p8_registered_human_approver_registration_policy` (D-P10-08) | 실제 P5 수락 |
| `whether_self_approval_is_ever_permitted_and_for_whom` | 1인 운영 시 P8 |

`O` 이전 판의 `p7_stage_definition_or_removal_from_the_numbering` 은 **제거했다.** 동결 계획이 이미 정의한 것을 Owner 결정 대기로 올려둔 것이 오류였다.

## 10. 검증 강도 — 정직한 한계

`O` 동결 oracle 에 1A case 가 없다. 기대값을 구현과 같은 저자가 썼다. lane 1V 가 mutation 기반 lock 을 진다.

`D` `1A/harness/self_test` 가 매 실행마다 시험 하네스의 유효성을 확인한다.
