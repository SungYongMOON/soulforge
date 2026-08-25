# Lane 1B — inventory, byte custody, eligibility, lineage

Status: `LANE CONTRACT / AUTHOR-WRITTEN FIXTURES / INDEPENDENT LOCK OWED BY 1V`

동결 crosswalk 에서 `inventory_custody_eligibility_and_lineage` 를 소유한다. Phase 1-0 공통 계약을 consume-only 로 쓴다.

구현: `kernel/custody.mjs`, `kernel/lineage.mjs` · 시험: `tests/lane_1b_conformance.mjs` (119 통과 / 0 실패)

## 1. 문제

snapshot 은 불변인데 **원본 파일은 계속 산다.** 공유 드라이브는 살아 있고, 어떤 finding 이 인용한 문서가 그 뒤에 수정되거나 이동한다. custody 는 그래도 snapshot 이 의미를 유지하게 하는 방법이다.

## 2. Owner 결정 — 단일 custody 모드

`D` `custody_mode = hash_pinned_with_cited_span_retention` **하나만** 허용한다.

- 원본은 owner 가 두는 자리에 그대로 있고, **채택 시점 바이트 해시만 pin** 한다
- **실제로 인용된 span 만** 불변 보존한다

`D` 다른 값·모드 열거·per-source 선택은 거부한다. 한 snapshot 안에서 자료마다 재생 보장 수준이 다르면 **"이 결론을 재현할 수 있는가"에 단일한 답이 없어진다.**

`P` 이 설계가 수락하는 대가: 인용된 부분은 원본이 바뀌어도 살아남고, **인용 밖을 다시 읽으려면 원본이 있어야 한다.** 이건 감추지 않고 명시한다 — 한계를 말하지 않는 custody 는 실제보다 강한 보장으로 읽힌다.

## 3. missing 과 unknown 은 끝까지 분리한다

`D` `presence_state` 는 세 값이다.

| 값 | 의미 |
|---|---|
| `present` | 지금 그 자리에 있다 |
| `unknown` | **볼 수 없었다** |
| `absence_confirmed` | 보았고, 없다 |

"봤는데 없다"는 결론을 지지한다. "볼 수 없었다"는 지지하지 않는다. 둘째를 첫째로 접으면 **부재의 증거를 제조**하는 것이다. `license_state` · `sensitivity_state` 에도 `unknown` 이 실재 값으로 있다 — 값의 부재가 아니다.

## 4. 재생 가능성 3단계

`D` 원본이 바뀐 것은 snapshot 의 결함이 아니다. snapshot 은 채택 당시 사실을 기록했다. 문제는 **인용 근거가 아직 해소되는지**다.

| 상태 | 조건 |
|---|---|
| `fully_replayable` | pin 해시 일치 |
| `cited_evidence_replayable` | 원본이 변경·소실됐으나 **인용 span 전부 보존됨** |
| `not_replayable` | **인용 span 중 하나라도 미보존** |

`D` `not_replayable` 은 `loud: true` 를 달고 나온다. **unknown 으로 부드럽게 만들지 않는다.**

`P` `cited_evidence_replayable` 은 자기 한계를 필드로 말한다 — `rereading_outside_the_citation_requires_the_original: true`.

## 5. 보존 실패는 fail-closed

`D` span 은 pin 된 revision 에 대한 바이트 offset 이므로 **pin 길이를 넘으면 거부**한다. pin 밖 span 은 pin 된 바이트를 서술하지 않는다.

`D` 보존 span 은 **자기 해시**를 가져야 한다. 없으면 나중에 검증할 수 없고, 그러면 보존 사본이 원본과 똑같이 못 믿을 것이 된다.

`D` retention store 를 못 주면 **보존을 확인 불가**로 보고 거부한다. 미확인 보존을 "아마 됐을 것"으로 통과시키지 않는다.

`D` 보존 바이트 해시가 인용 시점 값과 다르면 거부한다.

## 6. 적격성 — 전 blocker 동시 보고

`D` `evaluateEligibility()` 는 첫 실패에서 반환하지 않고 **모든 이유를 모아** 돌려준다. 하나 고치고 재시도하는 호출자가 나머지를 왕복 한 번에 하나씩 발견하게 만들지 않는다.

blocker: `license_unknown` · `license_restricted` · `sensitivity_unknown` · `applicability_unknown` · `not_applicable` · `presence_unknown` · `cited_span_not_retained` · `llm_proposal_without_source_bound_review`

`P` 적격성과 관찰 기록은 분리한다 — `observation_still_recordable: true`. **authoritative path 부적격이 미관찰과 같은 뜻이 아니다.**

## 7. 파기 의무 — 계획만, 실행 없음

`U` 라이선스·민감도 재분류로 파기 의무가 생기는 경우, `planRetentionWithdrawal()` 은 무엇을 철회하고 **어느 finding 이 재생 불가가 되는지 명시**해야 통과한다.

`D` `consequenceStated: true` 없이는 계획이 성립하지 않는다. 조용히 실행된 철회는 **더 이상 존재하지 않는 근거 위에 결론을 세워둔 채** 기록에 아무 말도 남기지 않는다.

`D` `executed: false` — 커널은 계획하고 삭제하지 않는다. 철회 권한은 Owner 결정으로 남는다.

## 8. lineage — 다섯 단계 고정

```text
source → source_revision → extraction_run → evidence_locator → claim
```

`D` 두 성질이 핵심이다. 둘 다 **파생이 원본의 지위를 개선할 수 없다**는 말의 다른 표현이다.

### 8.1 claim 은 출처보다 높은 권위를 못 가진다

선언된 8 family 순서에서 **위치를 직접 비교**한다. rank 에 산술을 하지 않는다 — 두 rank 의 차이는 의미 있는 수량이 아니다.

### 8.2 결정론 처리가 AI 유래를 세탁하지 않는다

`D` AI 산출을 입력으로 받은 결정론 처리의 결과는 **입력이 여전히 AI 산출인** 결정론 결과다. 여기서 flag 를 떨어뜨리는 것이 모델 출력을 사람이 쓴 것처럼 인용하게 되는 가장 쉬운 경로다.

`D` 근거 없는 AI flag 도 거부한다. 양방향 모두 false provenance claim 이다.

### 8.3 나머지 chain 규칙

`D` 순서 고정 · 각 단계가 부모를 **exact ref 로 지목**(위치로 추정 금지) · 노드 중복은 cycle · `known_at` 단조 비감소(파생이 입력보다 먼저 알려질 수 없음) · `extraction_run` 은 `method`·`method_revision`·`execution_mode`·`ai_derived` 전부 선언 · locator 없는 claim 은 orphan 으로 거부.

`P` 불완전한 prefix chain 은 통과한다. **불완전한 것과 틀린 것은 다르다.**

## 9. 이 lane 이 하지 않는 것

- 파일명·유사도·근접성으로 부모 추정
- 해소되지 않는 locator 를 가진 claim 수락
- 결정론 처리로 `ai_derived` 해제
- authority family rank 산술
- 실제 자료 접근. 이 lane 은 합성 fixture 로만 계약을 고정한다

## 10. 열린 항목 — Owner 결정

| 항목 | 무엇을 막는가 | 비고 |
|---|---|---|
| `which_source_surfaces_are_in_scope_for_inventory` | Phase 2 실제 자료 | **Owner 만 아는 것.** 엔진이 추천할 수 없다 |
| `retention_withdrawal_authority` | 첫 실제 파기 | |
| `span_retention_store_location_and_owner` | 첫 실제 보존 | |

Phase 1 은 계약을 합성 fixture 로만 고정하므로 위 항목은 Phase 1 을 막지 않는다.

## 11. 검증 강도 — 정직한 한계

`O` 동결 oracle 에 1B case 가 없다. 기대값을 구현과 같은 저자가 썼다. lane 1V 가 mutation 기반 lock 을 지며, 그때까지 independently verified 로 부르지 않는다.

`D` `1B/harness/self_test` 가 매 실행마다 시험 하네스가 no-throw·wrong-code·wrong-class 를 실제로 잡는지 확인한다.
