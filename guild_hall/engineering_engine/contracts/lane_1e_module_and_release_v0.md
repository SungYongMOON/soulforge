# Lane 1E — module ABI, project binding, release artifact, rollback

Status: `LANE CONTRACT / AUTHOR-WRITTEN FIXTURES / INDEPENDENT LOCK OWED BY 1V`

동결 crosswalk 에서 `module_abi_binding_artifact_and_module_binding_revision` 을 소유한다. Phase 1-0 공통 계약을 consume-only 로 쓴다.

구현: `kernel/module_binding.mjs` · 시험: `tests/lane_1e_conformance.mjs` (104 통과 / 0 실패)

## 1. 문제

engine release 하나가 여러 과제를 동시에 섬긴다. 그게 성립하려면 **과제가 자기가 실제로 돌린 것을 정확히 지목할 수 있고, 실행 중에 그 밑이 바뀌지 않아야** 한다.

## 2. 네 가지 규칙

### 2.1 floating version 금지

`D` binding 은 **정확한 revision 과 artifact 해시**를 지목한다. `latest`·`^1.2.0`·`1.2.x` 는 거부한다.

의존성도 같다. **하나만 floating 이어도** 나머지가 전부 pin 돼 있어도 artifact 는 재현 불가다.

### 2.2 hot swap 금지

`D` 새 module binding 은 running binding 을 실행 중에 대체하지 않는다.

`planModuleTransition()` 은 `runInProgress === true` 면 거부한다. 이유: 한 run 의 출력이 서로 다른 두 module set 에 의존하게 되고, 그 run 은 어느 쪽으로도 재현되지 않는다.

승격은 항상 `next_accepted_context_generation` 부터 적용된다.

### 2.3 호환성은 선언하고 검사한다

`D` `engine_contract_abi_range` 는 `>=X.Y.Z <A.B.C` 형식만 받는다.

단일 버전을 쓰지 않는 이유: "호환"은 구간에 대한 주장인데 단일 버전은 최소인지 정확히인지 대략인지를 읽는 사람이 추측하게 만든다.

상한은 **배타적**이다. major 올림이 조용히 통과하지 않는다.

### 2.4 rollback 은 source revert 가 아니다

`D` rollback 은 binding 에 대해 **이미 검증된 artifact 를 다시 선택**하는 것이다.

돌던 것은 checkout 이 아니라 artifact 였다. checkout 을 되돌리면 배포된 것이 설명되지 않은 상태로 남는다. `revertSourceCheckout: true` 는 거부한다.

대상은 **verified release 집합에 있어야** 한다. 같은 버전 번호라도 바이트가 다르면 거부한다. 검증 안 된 곳으로 되돌리는 것은 미지 하나를 다른 미지로 바꾸는 것이다.

## 3. `module_binding_revision`

`D` Phase 1-0 이 `replay_relevant_provenance` 에 자리만 잡아둔 항목이다. 이 lane 이 정의한다.

binding 의 전 필드 + 각 module 의 `(module_id, module_version, artifact_sha256, configuration_hash)` 를 canonical 직렬화해 hash 한다.

| 성질 | 근거 |
|---|---|
| module 나열 **순서에 불변** | 모듈을 어떤 순서로 적었는지는 무엇이 bound 됐는지가 아니다 |
| artifact 해시가 바뀌면 **변한다** | 다른 artifact 는 다른 binding 이다 |
| `configuration_hash` 가 바뀌면 **변한다** | 같은 코드 + 다른 설정은 다른 binding 이다 |
| generation 이 바뀌면 **변한다** | 수락 세대는 binding 의 일부다 |

## 4. 승격 증거

`D` 승격에는 세 가지가 모두 필요하다. 하나라도 없으면 거부한다.

1. **side-by-side shadow 비교 수행** — 나란히 올려 동일 입력으로 비교
2. **fresh 독립 검토 통과**
3. `migration_requirement` 가 `none` 이 아니면 **그 migration 이 검토됨**

`D` shadow 가 **갈라졌으면** `divergence_accepted: true` 를 명시해야 통과한다. 의도된 차이일 수 있지만 **말로 해야** 한다.

## 5. release 는 immutable artifact 다

`D` release 는 `artifact_sha256` · `manifest_sha256` · `built_from_commit` · test/review receipt · canonical `built_at` 을 갖는다. `mutable: true` 나 `source_checkout_path` 를 실은 것은 release 가 아니다.

해시와 manifest 가 없으면 배포가 **무엇을 배포했는지 말할 수 없고**, 그러면 replay 와 rollback 이 둘 다 추측이 된다.

## 6. 과제별로 다른 버전을 pin 할 수 있다

`P` 두 과제가 서로 다른 승인 버전을 pin 하는 것은 정상이다. 그것이 "공유 release + 과제별 binding" 의 목적이다. `validateBinding()` 은 이를 막지 않는다.

## 7. 열린 항목 — Owner 결정

`U` 이 lane 은 release 와 rollback 이 **무엇을 만족해야 하는지**를 고정한다. **누가 명령할 수 있는지**는 고정하지 않는다.

| 항목 | 무엇을 막는가 |
|---|---|
| `release_artifact_store_location_and_owner` | 첫 실제 배포 |
| `binding_promotion_authority` | 첫 실제 승격 |
| `rollback_authority` | 첫 실제 rollback |
| `high_security_project_isolation_threshold` | 첫 제한 과제 |

Phase 1 은 계약을 합성 fixture 로만 고정하므로 위 항목은 Phase 1 을 막지 않는다.

## 8. 검증 강도 — 정직한 한계

`O` 동결 oracle 에 1E case 가 없다. 기대값을 구현과 같은 저자가 썼다. lane 1V 가 이 파일에 대한 **mutation 기반 lock** 을 지며, 그때까지 independently verified 로 부르지 않는다.

`D` 시험 자체가 vacuous 하지 않다는 것을 `1E/harness/self_test` 가 매 실행마다 확인한다 — reject·accept 보조함수가 실제로 no-throw, wrong-code, wrong-class 를 잡아내는지 검사한다. 104 개 전부 통과하므로 이 자기검사는 장식이 아니다.
