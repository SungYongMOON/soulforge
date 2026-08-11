# guild_hall/engineering_engine

## 목적

- `engineering_engine/` 은 Soulforge 의 cross-project 증거기반 체계공학 판단 engine 을 소유한다.
- 적용 가능한 source authority 와 수락된 project context 로 `Expected State` 를 만들고, exact revision·authority·time·evidence lineage 가 붙은 `Observed State` 와 비교해 Snapshot·Finding·Missing/Unknown·Context Request 후보를 만든다.
- 이 root child 는 **결정론 kernel 과 계약** 을 소유한다. 프로젝트 원문, 계약서, source PDF, project RAG/Wiki 본문, snapshot payload, secret 은 두지 않는다.

## 왜 `guild_hall` 아래인가

engine 이 소비하는 knowledge-supply provider 가 이미 같은 root 에 있다. provider 코드를 복제하지 않고 adapter 계약으로만 연결한다.

- `guild_hall/rag/`: metadata-only RAG manifest 와 retrieval index
- `guild_hall/knowledge_graph/`: metadata-only graph view
- `guild_hall/knowledge_access/`: knowledge ref read/use ledger
- `guild_hall/knowledge_canon/`: ontology release inventory
- `guild_hall/snapshot/`: read-only sanitized 상태 projection

## 구성

- `kernel/`: 결정론 kernel. 학습모델을 호출하지 않고, 공급된 값에 대한 순수 함수만 노출한다
- 영수증은 4종을 구분해 쓴다: topology delivery(간선 통과) · MCP idempotency 응답(재시도) · Context Request 영수증 · Context Response 영수증. 서로 대신하지 못하며 소유 모듈이 다르다
- `contracts/`: Phase 1-0 공통 계약과 lane 계약
- `fixtures/`: 합성 fixture
- `tests/`: 동결 oracle 대조 conformance

## kernel 이 하지 않는 것

`kernel/index.mjs` 의 `NON_CAPABILITIES` 가 코드로 선언한다.

- local 또는 remote 학습모델 호출
- 등록된 사람 대신 context 수락
- `accepted_context_generation` 증가
- ERP task 장부 write
- 식별자 값 생성 (`D-P10-03` 종결 — 직렬 경계가 값을 공급하고 kernel 은 검증·등록만 한다)
- public engine 폴더 선택 (종결됨, 이 문서 위치가 그 결과)
- 실제 project 자료·source 본문·credential 읽기

## 실행 경계

- Phase 1–4 baseline 은 `deterministic_only` 다. Engine runtime 은 학습모델을 호출하지 않고 학습모델 출력을 truth 로 쓰지 않는다.
- embedding·semantic reranker 는 별도 승인 전까지 authoritative path 밖의 `shadow_only` 후보다.
- authoritative path 의 retrieval 은 lexical/BM25 와 결정론 filter 로 한정한다.

## Phase 1 구성

| lane | field group | 구현 | 계약문 |
|---|---|---|---|
| substrate | Phase 1-0 공통 계약 11항목 | `kernel/` 최초 9 모듈 (현재 커널 전체 21) | 동결 bundle |
| 1A | snapshot envelope · state axes · Finding · Context Request · P5–P8 | `snapshot.mjs`, `pipeline.mjs` | `contracts/lane_1a_snapshot_and_pipeline_v0.md` |
| 1B | inventory · custody · eligibility · lineage | `custody.mjs`, `lineage.mjs` | `contracts/lane_1b_custody_and_lineage_v0.md` |
| 1C | typed graph · bounded capsule | `graph.mjs`, `capsule.mjs` | `contracts/lane_1c_graph_and_capsule_v0.md` |
| 1D | MCP 요청·CAS·idempotency | `mcp_contract.mjs` | `contracts/lane_1d_mcp_concurrency_v0.md` |
| 1E | module ABI · binding · release · rollback | `module_binding.mjs` | `contracts/lane_1e_module_and_release_v0.md` |
| 1V | 변이 lock | `tests/lane_1v_mutation_lock.mjs` | `contracts/lane_1v_verification_lock_v0.md` |
| runtime | 하트비트 · 간선별 전달 영수증 | `heartbeat.mjs`, `delivery_receipt.mjs` | `contracts/runtime_observation_v0.md` |
| phase 3 | Context Request/Response 영수증 (합성) | `context_receipt.mjs` | `contracts/phase_3_context_receipts_v0.md` |
| assembly | 조립된 1 pass · subject adapter | `assembly/engine_pass.mjs`, `subjects/` | — |
| output | 소비자용 읽기 계약 | `tools/output_binding.mjs` | `contracts/engine_output_read_contract_v0.md` |

`D-P10-03` 발급 경계는 `kernel/minting.mjs` 가 소유한다.

## 검증

한 번에 전부 (여덟 검사 모두 통과해야 한다):

```
node guild_hall/engineering_engine/tools/phase_1_integration_check.mjs \
  --oracle <phase_1_0 bundle>/phase_1_0_synthetic_oracle.json \
  --bundle <phase_1_0 bundle> \
  --scratch <임시 디렉터리>
```

개별 suite 는 `tests/` 아래에 있다. kernel suite 만 동결 oracle 을 인자로 받는다.

byte manifest 는 추적 소스만 담으며 자기 path base 를 헤더로 선언한다. receipt 는 실행 결과라 매번 바뀌므로 제외한다 — 넣으면 manifest 가 스스로를 무효화한다.

```
node guild_hall/engineering_engine/tools/emit_manifest.mjs --out topology/engine_manifest.sha256
node guild_hall/engineering_engine/tools/emit_manifest.mjs --verify topology/engine_manifest.sha256
```

`P` manifest 행은 **Git 이 저장할 byte** 를 hash 한다. checkout 에 우연히 들어간 줄바꿈이 아니다. text 파일은 clean filter 와 같은 규칙(CRLF→LF)으로 정규화하고, 그 결과가 `git hash-object` 의 답과 일치하는지 매 emit 마다 대조한다. 어긋나면 emit 을 **거부한다** — 저장소가 재현하지 못할 manifest 를 내는 것이 실패보다 나쁘다.

`D` `tests/manifest_blob_integrity.mjs` 가 세 가지를 따로 확인한다: 파일이 최신 emit 과 같은가, 정규화가 Git 의 clean filter 와 같은가, 각 행이 **index 에 staged 된 blob byte** 의 sha256 과 같은가. 통합검사에 들어 있으므로 manifest 가 commit 될 내용과 어긋나면 초록불이 나오지 않는다.

`O` 이 시험은 Phase 2 종료 시점의 실제 결함을 재현한다. commit 된 manifest 가 네 파일에서 commit 된 내용과 달랐고, 통합검사가 manifest 를 **아무도 검증하지 않았기 때문에** 그대로 통과했다.

`P` kernel 은 Phase 1-0 동결 synthetic oracle 의 판정을 그대로 재현한다. 그 oracle 은 독립검증을 거쳤으므로 구현과 채점 기준의 저자가 분리된다.

`O` **초록불 자체가 충분하지 않을 수 있다.** 독립 검토가 지적한 다섯 계약 실패는 전부 "검사는 있었는데 약한 형태로 있었다"였고, 다섯 다 통과 상태에서 발견됐다. 지금 고정한 형태는 아래와 같으며 각각 positive control 과 공격 케이스를 함께 가진다.

| 항목 | 약했던 형태 | 지금 요구하는 형태 |
|---|---|---|
| receipt map | key 가 있으면 관측으로 읽음 | 실행이 선언한 **정확한 key 집합**과 일치, 영수증마다 자기 edge·run 이름 확인 |
| capsule 격리 | `graph.nodes` 선택적 | node 집합 **필수**, 모든 traversed·returned ref 가 binding 일치 |
| P8 gate | 모양과 `passed: true` 신뢰 | record 마다 불변 provenance **재계산**, 네 boundary **재실행** |
| Context 응답 | response id·binding·generation 만 대조 | 요청·영수증·source·artifact·hash·principal·시각까지 **내용으로** 결속 |
| O4 두 source | conflict 기록 존재 | 정확한 두 권위 쌍·다른 revision·실제 불일치·양쪽 applicability·baseline governing |

`O` **나머지 다섯 lane 의 fixture 는 구현과 같은 저자가 썼다.** 초록불이 substrate 의 초록불과 같은 무게가 아니다. 변이 lock 이 가드가 실제로 작동하는지는 확인하지만, 규칙 자체가 구현과 fixture 에서 똑같이 틀린 경우는 잡지 못한다. 의미론적 독립검증은 **미완 의무**다.

## topology — 코드에서 파생한다

```
node guild_hall/engineering_engine/tools/emit_topology.mjs --out topology/engine_topology.json
```

module edge 는 `kernel/*.mjs` 의 **실제 `import` 문을 파싱**해서 얻는다. 경계는 lane 1D 의 `OPERATIONS` 표에서, 나머지 어휘는 각자를 소유한 모듈에서 읽는다. 손으로 적는 것은 lane↔field group 대응 하나뿐이다.

`D` 통합검사가 commit 된 `topology/engine_topology.json` 을 새 emit 과 digest 대조하므로, 낡은 topology 는 실패로 드러난다. 그림은 자기가 묘사하는 코드와 어긋날 수 있지만 이건 어긋날 수 없다.

## 실제 실행 관측

```
node guild_hall/engineering_engine/tools/observe_engine_run.mjs --oracle <oracle>
```

검증 표면을 load observation 훅 아래에서 돌려 **표면별 하트비트**와 **간선별 통과 영수증**을 만든다. 선언(소스 파싱)과 관측(실제 통과)을 대조해 `exercised` · `declared_not_exercised` · `observed_not_declared` 로 분류한다.

`D` `observed_not_declared` 가 하나라도 있으면 통합검사가 실패한다 — 정적 파싱이 못 찾은 연결을 실행이 지났다면 "코드와 1:1" 주장이 거짓이다.

`P` 관측 결과는 `guild_hall/state/engineering_engine/runtime/` 에 쓰고 추적하지 않는다. 한 호스트의 한 시점 측정이므로 commit 하면 주장으로 바뀐다.

`O` `module_load_observation` 은 간선이 **통과됐음**을 증명하고 데이터가 처리됐음을 증명하지 않는다. 이름이 그 한계를 말한다. 상세는 `contracts/runtime_observation_v0.md`.

## 출력을 읽는 쪽으로 (Board 등)

소비자는 **경로가 아니라 pointer** 를 하드코딩한다. 엔진을 돌린 쪽이 worktree 였을 수 있으므로 경로를 물면 우연을 무는 것이다.

```
guild_hall/state/engineering_engine/output.pointer.json   ← 소비자가 하드코딩 (저장소 상대)
  → { schema_version, output_root }                       ← host-local 실제 위치
  → <output_root>/engine_outputs.index.json               ← 소비자가 먼저 읽는 index
```

`D` **부재는 값이다.** index 가 `present: false` + 구별되는 `absent_reason` 을 준다. 관측은 host-local 이라 fresh checkout 에 없는 것이 정상이며, 파일 읽기 실패로 나타나지 않는다.

`D` 깨진 pointer 는 추측하지 않고 `root: null` + 사유를 준다. 추측한 디렉터리를 읽으면 다른 실행의 증거를 이 실행의 것으로 띄운다.

`D` artifact 4종이 각각 **무엇을 증명하고 무엇을 증명하지 않는지**를 들고 다닌다. 추적되는 것은 `engine_topology` 하나뿐이고 나머지 셋은 한 호스트의 한 시점 측정이다.

`O` 신선도 윈도와 표시 색은 정하지 않는다. 소비자 판단이다. 상세는 `contracts/engine_output_read_contract_v0.md`.

## local state

engine 의 local runtime state 는 다른 owner 와 같은 규칙을 따라 `guild_hall/state/engineering_engine/` 아래에서만 materialize 하고 Git 으로 추적하지 않는다. 새 state surface 이므로 `guild_hall/backup_controller/README.md` 의 backup/restore 분류와 synthetic restore gate 를 적용한다. `topology/` 는 state 가 아니라 코드에서 재생 가능한 파생 산출물이므로 추적한다.

## Owner 결정 상태

닫힘: `D-P10-01` (snapshot claim_ceiling = evidence 축) · `D-P10-02` (engine 정본 폴더) · `D-P10-03` (**엔진 내부 단일 직렬 발급 경계, 불투명 UUID, 충돌 hard reject**) · `D-P10-04` (authority family key) · `D-P10-05` (evidence ceiling 7값) · `D-P10-07` (**시각 소수 3자리 확정**)

| 미결 ID | 내용 | 막는 것 |
|---|---|---|
| `D-P10-06` | Finding disposition 확인 권한자 등록 절차 | live disposition |
| `D-P10-08` | P5/P8 승인자 등록 절차 | live P5 |

lane 별 미결 항목은 각 lane 계약문과 `kernel/contract_config.mjs` 의 `OPEN_LANE_QUESTIONS` 에 있다. Phase 1 을 막는 것은 없다.

`O` **`P7` 은 TaskDriver 다.** 이전 판이 `UNKNOWN_pending_engine_owner` 로 적은 것은 읽기 오류였고 Owner 미결이 아니었다. `engine_plan_v1_2.md` §1.4, `engine_plan_v1_2_1.md` §6.2, `phase_1_0_work_lanes.yaml` 의 `p7_taskdriver` gate 가 모두 같은 정의를 준다. `pipeline.mjs` 가 `why`·`why-now`·`authority`·`idempotency` 내부 gate 뒤의 TaskDriver 단계로 구현하며, **활성화하지 않는다**(`activation_state: not_activated`, `driver_activated: false`, `erp_delta: 0`). 상세는 `contracts/lane_1a_snapshot_and_pipeline_v0.md` §8.
