# Engine output read contract — 소비자용

Status: `CONSUMER-FACING CONTRACT / AUTHOR-WRITTEN FIXTURES`

이 문서의 대상은 **엔진 출력을 읽는 다른 코드베이스**다. 엔진 내부 구현이 아니라 읽는 쪽이 의존해도 되는 것만 정의한다.

구현: `tools/output_binding.mjs`, `tools/emit_output_index.mjs`
시험: `tests/output_contract_conformance.mjs` (28 통과 / 0 실패)

## 1. 문제 — 경로를 물면 우연을 문다

엔진을 돌린 쪽이 worktree였을 수도, 다른 드라이브였을 수도, 다른 checkout이었을 수도 있다. **그 경로에 배선된 소비자는 우연에 배선된 것**이고, 브랜치가 합쳐지면 끊어진다.

## 2. 해결 — pointer 관용구

운영면이 이미 쓰는 방식을 그대로 따른다. 소비자가 새 규약을 배울 필요가 없다.

```
소비자가 하드코딩하는 것 (저장소 상대, merge 후에도 동일)
  guild_hall/state/engineering_engine/output.pointer.json

pointer 가 가리키는 것 (host-local, git-ignored)
  { "schema_version": "soulforge.engineering_engine.output_pointer.v1",
    "output_root": "<절대 또는 저장소 상대 경로>" }
```

`D` 상대 경로는 **저장소 기준**으로 해석한다. 소비자가 어느 디렉터리에서 실행됐든 같은 답을 얻어야 한다.

`D` pointer가 없으면 선언된 기본값(`guild_hall/state/engineering_engine`)으로 답한다. fresh checkout에도 정의된 답이 있다.

## 3. 해석은 fail-closed

`D` pointer가 깨졌으면 **추측하지 않고 `root: null`** 을 반환한다. 반환값에 `source`가 함께 온다.

| `source` | 의미 |
|---|---|
| `pointer` | 설정된 위치를 읽는 중 |
| `default_no_pointer` | pointer 없음, 기본값 사용 |
| `pointer_unreadable` | 파싱 불가 → `root: null` |
| `pointer_schema_invalid` | schema_version 불일치 → `root: null` |
| `pointer_root_missing` | `output_root` 없음/빈 문자열 → `root: null` |

`P` 추측한 디렉터리를 읽으면 **다른 실행의 증거를 이 실행의 것으로 화면에 띄운다.** 그래서 거부한다.

`P` `source`를 함께 주는 이유: 설정된 위치를 읽는지 기본값을 읽는지 구별 못 하는 소비자는 **빈 화면을 설명할 수 없다.**

## 4. index 를 먼저 읽는다

`tools/emit_output_index.mjs` 가 `<output_root>/engine_outputs.index.json` 을 쓴다. 소비자는 파일을 더듬지 않고 이것부터 읽는다.

`D` **부재는 값이다.** 키가 없는 게 아니라 `present: false` + `absent_reason` 으로 온다. 관측은 host-local이므로 **fresh checkout에 없는 것이 정상**이고, 파일 읽기 실패로 나타나면 안 된다.

`D` 부재 이유를 구별한다.

| `absent_reason` | 의미 |
|---|---|
| `tracked_artifact_missing_from_checkout` | 추적 파일이 체크아웃에 없다 — 문제 상황 |
| `no_observation_recorded_on_this_host` | 이 호스트가 아직 관측을 안 했다 — 정상 |
| `artifact_unparseable` | 파일은 있으나 깨졌다 — **빈 파일로 읽히면 안 된다** |

## 5. artifact 4종과 그 무게

`D` 각 artifact가 **무엇을 증명하고 무엇을 증명하지 않는지**를 스스로 들고 있다. 화면이 약한 관측을 강한 것으로 승격시킬 수 없게 하려는 것이다.

| id | 추적 | 증명하는 것 | 증명하지 **않는** 것 |
|---|---|---|---|
| `engine_topology` | **예** | 소스가 선언한 연결 | 그 연결이 쓰였다는 것 |
| `heartbeats` | 아니오 | 어떤 표면이 언제 돌았고 통과했는지 | 하트비트 **없는** 표면에 대한 어떤 것도 — 반드시 absent로 표시 |
| `receipts` | 아니오 | 그 간선을 실제 실행이 지나갔다 | 그 위에서 데이터가 처리됐다 |
| `observation_summary` | 아니오 | 그 실행이 그래프의 얼마를 말할 수 있는지 | 미통과 간선이 고장났다는 것 |

`P` **추적되는 것은 `engine_topology` 하나뿐이다.** 나머지 셋은 한 호스트의 한 시점 측정이라 commit하지 않는다 — commit하면 측정이 주장으로 바뀐다. Board가 watchtower 스냅샷을 런타임에 읽는 것과 같은 구조다.

## 6. 신선도는 소비자 판단

`D` 엔진은 `produced_at` 과 `sha256` 을 준다. **윈도는 주지 않는다.** 무엇이 너무 오래된 것인지는 화면의 판단이고, 엔진이 대신 정할 일이 아니다.

`P` `record_count` 도 함께 준다. 영수증 0건과 영수증 파일 부재는 다른 상태다.

## 7. 이 계약이 하지 않는 것

- Board가 쓸 데이터 모양을 정하지 않는다. 변환은 소비자 몫이다
- 신선도 임계값을 정하지 않는다
- 표시 색을 정하지 않는다 — 다만 각 artifact가 자기 한계를 들고 가므로, 근거 없는 것을 초록으로 칠하려면 계약을 **무시**해야 한다

## 8. 갱신 방법

```
node tools/emit_output_index.mjs --init <output_root>   # pointer 최초 작성
node tools/observe_engine_run.mjs --oracle <oracle>     # 하트비트·영수증 갱신
node tools/run_engine.mjs                               # snapshot·finding 갱신
node tools/emit_output_index.mjs                        # index 갱신
```

`D` `observe_engine_run` 과 `run_engine` 은 출력 위치를 **pointer로 해석**한다. 해석 실패 시 흩뿌리지 않고 거부한다.
