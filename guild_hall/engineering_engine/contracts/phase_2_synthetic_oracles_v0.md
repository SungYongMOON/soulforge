# Phase 2 — 합성 oracle 7종

Status: `SPEC FROZEN BEFORE IMPLEMENTATION / PUBLIC SYNTHETIC ONLY`

명세: `fixtures/phase_2_oracle_spec.json` (동결 `fixtures/phase_2_oracle_spec.sha256`)
시험: `tests/phase_2_oracle_conformance.mjs` (107 통과 / 0 실패 / 금지출력 위반 0)

## 1. 왜 먼저 동결했나

기대값을 구현 뒤에 쓰면 **코드가 하는 대로 기대값을 맞추게 된다.** 그래서 7종의 exact input · expected verdict · forbidden output · metric · threshold 를 먼저 쓰고 sha256 으로 동결한 뒤 구현했다.

`D` 시험은 매 실행마다 그 digest 를 **재검증**한다. 명세를 코드에 맞춰 조용히 고칠 수 없다.

`O` 이것은 저자가 한 명일 때 만들 수 있는 유일한 독립성이며, **두 번째 저자를 대신하지 못한다.** 명세와 코드에서 규칙이 똑같이 틀렸다면 그대로 통과한다.

## 2. 금지 출력은 절대적이다

`D` `forbidden_output` 위반은 **다른 단정이 전부 통과해도 그 케이스를 실패**시킨다.

"정답도 같이 냈다"는 것은 요청자가 볼 수 없는 참조를 흘린 데 대한 변명이 되지 않는다.

## 3. 7종과 판정

| id | 무엇을 지키나 | metric / threshold |
|---|---|---|
| `O1_correct` | 충족된 요구는 finding 을 만들지 않는다 | 충족쌍 finding 수 `== 0` |
| `O2_missing` | 확인된 부재는 **답**이다 — unknown 으로 낮추지 않고 사람에게 되묻지 않는다 | 확인부재를 unknown 으로 보고 `== 0` |
| `O3_unknown` | 관측을 못 믿으면 **missing 이 아니라 unknown** | **false missing `== 0`** |
| `O4_contradictory` | 어긋난 두 주장 중 어느 쪽도 조용히 버리지 않는다 | 충돌 기록 `== 1` |
| `O5_stale` | 윈도 밖 근거는 과거만 증명한다 | stale 을 현재 근거로 채택 `== 0` |
| `O6_unauthorized` | 권한 없는 근거는 출력에 **도달하지 않는다** | 무권한 ref 출력 포함 `== 0` |
| `O7_wrong_project` | 과제 A 요청에 과제 B 자료가 섞이지 않는다 | cross-project ref `== 0` |

`P` `O6` 는 "결과에 안 나오면 됨"이 아니다. 동결 금지 출력은 **capsule payload · hash · pointer set 어디에도** 거부된 ref 가 없을 것을 요구하고, `excluded[]` 도 capsule payload 다.

`O` 이전 판의 이 문단은 "exclusion 에 이름이 오르는 것은 정당한 거부 표시"라고 적었다. **그 해석은 동결 명세와 어긋났다.** 정정: exclusion 은 `{ reason, hop, count }` 만 나르고 식별자는 나르지 않는다. 거부한 사실과 개수는 말하되 대상은 말하지 않는다. 조용한 빈 capsule 도 여전히 금지 — 거부는 말로 해야 한다. 시험은 반환 객체 전체를 key 까지 **재귀적으로** 검사한다.

`P` `O4` 는 **두 source** 의 불일치다. Expected 와 Observed 둘 다 보존됐다는 것은 다른 주장이며 이 항목을 대신하지 못한다. 동결 입력이 지정한 `project_contract_baseline` 대 `reviewed_wiki` 를 그대로 만들고, **상위 권위가 이기면서 두 주장·source revision·lineage 가 모두 남는지**를 확인한다. 사슬을 못 남기는 conflict 는 finding 단계에서 거부된다.

`P` `O7` 은 cache 격리가 **구조적**임을 확인한다. `pb-alpha` 와 `pb-bravo` 의 cache key 가 애초에 다르므로, 사후 필터가 아니라 도달 자체가 불가능하다. capsule 쪽도 같은 규칙을 지며 multi-hop 과 edge/node binding 혼재 케이스를 함께 본다.

`P` `O5` 는 **조립된 엔진 경로**에서 확인한다. 시험 안에서 `proves_traversal ? present : unknown` 을 손으로 계산하면 시험이 시험을 검사할 뿐이다. 실제 결함은 subject adapter 가 "receipt key 가 있다"를 "present"로 읽은 것이었고, 그 경로를 지나야만 보인다.

## 4. 동결 명세가 실제로 잡은 결함

`O` **`gap_conflict` 가 조립된 엔진에서 도달 불가였다.**

커널은 지원하고 `compareStates` 는 신호를 받는데, assembly 가 그 신호를 **한 번도 넘기지 않았다.** 판정 한 종류가 통째로 사용 불가였고, lane 1C·1V·end-to-end 어느 시험도 이걸 잡지 못했다 — 전부 커널 함수를 직접 부르거나 conflict 없는 경로만 지났기 때문이다.

동결 명세가 `O4` 의 expected verdict 를 **pass 수준**으로 요구했기 때문에 드러났다. 첫 구현에서 제 시험이 커널 함수만 확인하고 통과한 것도 같은 함정이었고, 그것까지 고쳤다.

`D` 수정: `states.conflicting_element_ids` 로 subject 가 충돌을 신고할 수 있다. 변이 `assembly/conflict_signal_ignored` 가 이 경로를 덮는다.

`D` 이어서 `states.source_claims` 로 각 충돌의 **두 주장**을 함께 넘긴다. `recordSourceConflict()` 가 권위 판정과 보존 기록을 함께 내고, 주장 없이 신고된 충돌은 거부된다. 권위 판정만 남기면 하위 source 가 조용히 사라지는데, 그것이 O4 가 막으려는 실패다.

## 5. 범위 — 하지 않은 것

실제 과제 자료 · private RAG/Wiki payload · live runtime · P5 수락 · P8 쓰기 · 학습모델 호출. 전부 없다.

`O` 전부 합성이므로 **통과가 실제 자료에서의 동작을 말해주지 않는다.**
