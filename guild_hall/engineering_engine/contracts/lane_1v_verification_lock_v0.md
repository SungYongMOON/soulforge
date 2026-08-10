# Lane 1V — mutation lock, and what it does not prove

Status: `SELF-AUTHORED MUTATION LOCK / SEMANTIC INDEPENDENCE UNMET`

구현: `tests/lane_1v_mutation_lock.mjs` · 통합: `tools/phase_1_integration_check.mjs`

현재: **변이 37개 중 37개 kill · 생존 0 · catalogue error 0 · 커널 모듈 16/16 커버**

## 1. 왜 필요했나

여섯 lane 이 수백 개 통과를 보고한다. 그 숫자는 **코드가 틀렸을 때 검사가 실패해야** 비로소 값을 갖는다. 그리고 구현자가 쓴 시험은 통과하면서 거의 아무것도 검사하지 않는 것이 가능한 종류다.

## 2. 하는 일

버려질 커널 사본에서 **가드를 하나씩 고의로 깨뜨리고**, 해당 suite 가 반드시 red 가 되는지 확인한다.

`D` 결과는 세 가지뿐이다.

| 결과 | 의미 |
|---|---|
| `killed` | suite 가 실패했다. 가드가 덮여 있다 |
| `survived` | suite 가 그래도 통과했다. **구멍이며 명시 보고한다** |
| `catalogue_error` | find 문자열이 없거나 모호하다. **이 파일의 버그** |

`D` `catalogue_error` 를 survivor 와 **똑같이 크게** 보고한다. 아무것도 매칭하지 않는 catalogue 는 그러지 않으면 "전부 kill" 이라고 보고하면서 아무것도 시험하지 않는다.

`D` 변이 전에 **pristine 사본이 통과해야** 한다. 통과하지 않으면 harness 가 변이가 아니라 자기 setup 을 재고 있는 것이고, 모든 `killed` 판정이 무의미해진다. 실제로 이 baseline gate 가 한 번 발동해 잘못된 판정을 막았다.

## 3. 실제로 찾은 것 — 구멍 3개

`O` 첫 실행에서 **34개 중 2개가 생존**했다. 세 번째는 ceilings 커버리지를 추가하자 드러났다.

| 생존 변이 | 무엇이 안 덮여 있었나 |
|---|---|
| `authority/false_component_treated_as_yes` | `resolveApplicability` 가 component 하나가 `false` 일 때 `NO` 를 반환하는지 **아무도 시험하지 않았다.** 동결 oracle 에도 해당 case 가 없다 |
| `execution_mode/baseline_mode_unenforced` | Phase 1–4 baseline 이 `deterministic_only` 를 강제하는지 시험되지 않았다 |
| `ceilings/canon_enum_unchecked` | `assertCanonCeiling` 이 잘못된 값을 거부하는지 시험되지 않았다 |

### 3.1 두 번째 것이 특히 교훈적이다

`O` **겹치는 가드가 서로를 가렸다.** 기존 `ai_assisted` 시험은 모두 owner 승인을 생략했기 때문에 **뒤에 있는 가드**가 먼저 잡았고, baseline 가드는 단독으로 한 번도 실행되지 않았다.

`D` 그래서 새 시험은 `owner_ai_authorisation: true` 를 **미리 준 상태**로 baseline 가드를 시험한다. 겹친 가드를 분리해서 재지 않으면 커버리지 착시가 남는다.

세 구멍 모두 커널 `kernel-side invariant` 로 시험을 추가해 닫았다. 동결 oracle 은 수정하지 않았다.

## 4. 하지 **않는** 것 — 이 lane 의 정직한 한계

`O` **이것은 독립 의미론 검증이 아니다.**

구현과 fixture 에서 **어떤 규칙이 똑같이 틀렸다면**, 그 규칙에 대한 모든 변이는 여전히 kill 되고 공유된 오해는 살아남는다. 변이시험은 "규칙이 작동하지 않는" 오류를 잡고 "규칙 자체가 틀린" 오류는 잡지 못한다.

`D` `semantic_independence: 'UNMET'` 이 매 실행 출력에 실린다. Owner 결정에 따라 이 lane 은 자체 작성 mutation lock 으로 진행하며, **의미론적 독립검증은 미완 의무로 남는다.**

| lane | 검증 강도 |
|---|---|
| `phase_1_0` substrate | 동결·독립검토된 oracle |
| 1A · 1B · 1C · 1D · 1E · D-P10-03 | **저자 작성 fixture** + 변이 lock |

`O` 여섯 중 다섯 lane 의 초록불은 substrate 의 초록불과 **같은 무게가 아니다.**

## 5. 통합 — `phase_1_serial_integration`

`tools/phase_1_integration_check.mjs` 가 여섯 검사를 한 번에 한다. 전부 통과해야 한다.

1. 모든 conformance suite 통과 — **688 검사**
2. 변이 lock 전멸 — **37/37**
3. 동결 Phase 1-0 bundle **13/13** sha256
4. 동결 field group 6개가 **각각 정확히 한 lane** 소유 (누락·중복·미지 없음)
5. commit 된 topology 가 코드에서 **새로 emit 한 것과 digest 일치**
6. 쓰기 **0**

### 5.1 manifest 는 자기 path base 를 선언한다

`O` 이 checker 는 bundle 경로 기준을 **두 번 틀렸다** — 서로 반대 방향으로, 각각 0/13 을 만들었다.

`D` 그래서 이제 manifest 의 `# path_base:` 헤더를 **읽는다.** 추정하지 않으며, 헤더가 없거나 미지 값이면 통과가 아니라 실패로 처리한다.

## 6. topology 는 코드에서 파생한다

`D` `tools/emit_topology.mjs` 는 engine 을 **서술하지 않고 읽는다.**

- module edge = `kernel/*.mjs` 의 **실제 `import` 문 파싱** (19 모듈, 70 edge)
- 경계 = lane 1D 의 `OPERATIONS` 표
- lineage chain · graph shape · fingerprint 입력 = 각자를 소유한 모듈

`P` 그림은 자기가 묘사하는 코드와 어긋날 수 있다. 이건 어긋날 수 없다 — 어떤 모듈이 다른 모듈을 더 이상 import 하지 않으면 다음 실행에서 edge 가 사라진다.

`D` 통합검사 5번이 commit 된 `topology/engine_topology.json` 을 **새 emit 과 대조**한다. 파생 산출물을 commit 하면 조용히 낡는데, 대조하면 낡음이 **실패**가 된다.

## 7. 열린 항목

| 항목 | 상태 |
|---|---|
| 1A · 1B · 1C · 1D · 1E 의 **의미론적 독립검증** | **미완.** 다른 저자가 계약문만 보고 기대값을 독립 생성해야 한다 |
| 동결 oracle 의 applicability `false` case 부재 | 관찰됨. oracle 은 동결이라 수정하지 않고 커널 invariant 로 보완 |
