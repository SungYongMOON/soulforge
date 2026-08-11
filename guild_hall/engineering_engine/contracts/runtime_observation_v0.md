# Runtime observation — 하트비트와 간선별 전달 영수증

Status: `AUTHOR-WRITTEN FIXTURES / MUTATION-LOCKED / SEMANTIC INDEPENDENCE UNMET`

구현: `kernel/heartbeat.mjs`, `kernel/delivery_receipt.mjs`
도구: `tools/observe_hook.mjs`, `tools/observe_engine_run.mjs`
시험: `tests/runtime_observation_conformance.mjs` (83 통과 / 0 실패)

## 1. 문제

`emit_topology.mjs` 는 소스에서 간선을 뽑으므로 연결이 **선언됐다**는 것은 증명한다. 그 연결이 **쓰였다**는 것은 증명하지 못한다. 두 주장은 다르고, 그리기만 하면 구별되지 않는다.

## 2. 엔진을 엔진으로 검사한다

```
선언된 간선 (소스 파싱)   = Expected State
관측된 간선 (실행 중 통과) = Observed State
        차이             = gap, 매끄럽게 덮지 않고 보고
```

`D` 세 결과로 갈린다.

| 결과 | 의미 |
|---|---|
| `exercised` | 선언됐고 관측됐다 |
| `declared_not_exercised` | 선언됐으나 통과 관측 없음 — **보고한다** |
| `observed_not_declared` | 관측됐으나 선언 없음 — **결함** |

`D` 세 번째가 핵심이다. 실행이 정적 파싱이 못 찾은 연결을 지나갔다면, 파서가 놓쳤거나 코드가 동적으로 무언가 하고 있다. **둘 다 "코드와 1:1" 주장을 거짓으로 만든다.** `assertTopologyIsOneToOne()` 이 통과가 아니라 실패로 처리한다.

`P` 반대로 idle 간선은 정상이다. 한 번의 실행은 그래프의 부분집합만 지난다. 그래서 `declared_not_exercised` 는 **그 실행에 대한 사실**로 보고하고 결함으로 취급하지 않는다.

`D` observation summary 는 `edges.exercised_edge_keys` 로 **자기가 영수증을 만든 간선 key 집합을 그대로** 선언한다. 개수만 있으면 영수증 map 을 대조할 대상이 없고, 어떤 key 집합이든 그 실행이 만든 것처럼 보인다. subject adapter 는 이 선언과 정확히 일치하지 않는 map 을 증거로 달지 않는다. 상세는 `contracts/lane_1a_snapshot_and_pipeline_v0.md` 가 아니라 `subjects/engine_self_topology.mjs` 의 머리말이 소유한다.

현재: **76/76 간선 통과 관측 · `observed_not_declared` 0**

## 3. 관측 방법 — 이름이 한계를 말한다

`D` `module_load_observation`: 실행 중 Node 의 resolve 훅이 **어느 모듈이 어느 모듈을 실제로 요청했는지** 알려준다.

- **증명하는 것**: 그 간선을 실제 실행이 지나갔다
- **증명하지 않는 것**: 데이터가 처리됐다, 호출이 유의미했다

`P` 그래서 이름이 `module_load_observation` 이다. `explicit_delivery_receipt` 와 별개 값으로 두어, 약한 관측이 강한 관측으로 읽히지 않게 한다. `observation_method` 없는 영수증은 거부한다 — **표시 없는 관측은 무게를 달 수 없다.**

## 4. 하트비트 — 각 표면은 자기 증거로만 판정한다

`D` 표면 목록은 **닫힌 집합**이다. 선언 안 된 표면은 자기가 살아 있다고 보고할 수 없다. 열린 목록이면 오타가 항상 초록인 컴포넌트를 만든다.

`D` 상태 5종: `fresh` · `late` · `stale` · `failed` · `absent`

| 규칙 | 이유 |
|---|---|
| **신선함과 성공은 다른 질문** | 최근에 돌았지만 실패한 표면은 `failed` 다. 제때 돌면서 매번 실패하는 것은 건강하지 않다 |
| **`absent` ≠ `failed`** | 안 돌았다는 것과 돌고 실패했다는 것은 다르다 |
| **하트비트 없는 표면도 보고** | 빼면 요약이 완전해 보이면서 증거 없는 것을 숨긴다 |
| **미래 시각 거부** | 관측 시점보다 뒤인 기록은 시계나 기록이 틀렸다는 뜻 |
| `now` **필수 인자** | 이 커널은 시계를 읽지 않는다. 판정이 기록된 입력에서 재생 가능하다 |

`D` `forbidNeighbourInference()` 는 호출 자체를 오류로 만든다. 인접 표면 상태로 한 표면을 추정하는 것이 **토폴로지를 증거보다 건강하게 보이게 하는 지름길**이다.

## 5. period + grace — 두 단 윈도

`D` 하트비트와 영수증 **양쪽에** 같은 윈도를 적용한다.

```
age ≤ period                → fresh / delivering
age ≤ period + grace        → late   (여전히 통과 증명)
age > period + grace        → stale  (proves_traversal: false)
```

`D` 윈도 밖 영수증은 **과거의 통과만** 증명한다. 이 규칙이 없으면 **한 번 성공한 선이 영원히 초록으로 남는다.** 3주 전 영수증이 오늘을 증명하지 않는다.

`O` 이 의미론은 운영면 probe 와 같지만 **`guild_hall/watchtower/**` 를 import 하지 않고 독립 구현**했다. 커널은 의존성 0을 유지하고, 운영 계약은 다른 owner 소유이므로 import 로 fork 하지 않는다. 공통 규격 변경은 없었다.

## 6. 간선은 양 끝의 생존을 빌리지 않는다

`D` `judgeEdge()` 는 노드 상태를 **인자로 받지 않는다.** 규칙을 문서가 아니라 서명으로 강제한다 — 참조할 수 없으면 베낄 수 없다. 시험이 노드 상태를 옵션에 밀어넣어도 판정이 안 바뀌는 것을 확인한다.

**양 끝 모듈이 모두 살아 있어도 그 사이 연결은 한 번도 안 쓰일 수 있다.**

## 7. 자동 갱신

`D` 손으로 유지하는 목록이 없다.

- 모듈이 추가되면 `emit_topology.mjs` 의 소스 파싱이 새 간선을 잡는다
- 각 간선은 `receipt_channel: module_load_observation` 을 자동으로 갖는다
- 그 모듈을 부르는 시험이 돌면 관측이 영수증이 된다
- 통합검사 6번이 선언·관측을 대조한다

`O` 실증: 이 계약을 만들 때 새 모듈 2개의 간선 4개가 `declared_not_exercised` 로 먼저 나타났고(아직 어떤 시험도 부르지 않았으므로), conformance 를 작성하자 76/76 이 됐다. 목록을 손댄 곳은 없다.

## 8. 저장 위치

`D` 관측 결과는 `guild_hall/state/engineering_engine/runtime/` 에 쓴다. `.gitignore` 대상이며 추적하지 않는다.

이유: **한 호스트의 한 시점 관측**이다. commit 하면 측정이 주장으로 바뀐다. 반면 `topology/engine_topology.json` 은 코드에서 재생 가능한 파생물이므로 추적한다.

## 9. 검증 강도 — 정직한 한계

`O` 기대값을 구현과 같은 저자가 썼다. lane 1V 변이 lock 이 6개 변이로 이 두 모듈의 가드를 덮는다(전체 51/51 kill, 모듈 21개 커버). 의미론적 독립검증은 여전히 **미완 의무**다.

`O` 그리고 이 문서가 말하는 "실제 runtime" 은 **엔진의 검증 표면 실행**이다. 엔진에는 아직 생산 런타임이 없고, 실제 과제 자료를 처리한 적이 없다.
