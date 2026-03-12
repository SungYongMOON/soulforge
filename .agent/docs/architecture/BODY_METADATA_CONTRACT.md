# body 메타 계약

## 목적

- 이 문서는 `.agent/body.yaml` 과 `.agent/body_state.yaml` 의 기준 필드와 의미를 설명한다.
- body 메타가 private operating system 의 어떤 기관과 section-owned YAML 메타를 추적하는지, 무엇을 추적하지 않는지 고정한다.

## 범위

- body 정적 정의와 body 현재 상태 스냅샷만 다룬다.
- loadout 상태, mission 자료, host-local 임시 상태, raw transcript, actual runtime capability 관측값은 범위 밖이다.

## 포함 대상

- `body.yaml` 의 정적 기관 정의
- `operating_context`, `identity_assets`, `operating_profiles`, `sections`, `future_expansion`
- `body_state.yaml` 의 `path/present` 기반 동기화 스냅샷

## 제외 대상

- `.agent_class` installed/loadout 메타
- `_workspaces` 현장 상태와 `.project_agent/`
- `_teams/shared` 협업 상태
- 별도 `.agent/export/` 폴더 정의

## `body.yaml`

- `body.yaml` 은 body 의 정적 정의를 둔다.
- 어떤 본체 기관이 어떤 경로를 기준으로 배치되는지, 어떤 identity asset 과 operating profile 을 canonical 로 볼지 설명하는 기준 파일이다.

### `body.yaml` 필드

| 필드 | 의미 |
| --- | --- |
| `id` | body 식별자 |
| `name` | 사람이 읽는 body 이름 |
| `version` | body 메타 버전 |
| `description` | body 설명 |
| `operating_context` | body operating context. 현재값은 `ide` |
| `identity_assets.species_profile` | species profile 정본 경로 |
| `identity_assets.trait_bindings` | trait binding 정본 경로 |
| `operating_profiles.sessions` | sessions 운영 프로필. 현재값은 `continuity_first` |
| `operating_profiles.memory` | memory 운영 프로필. 현재값은 `private_first` |
| `operating_profiles.autonomic` | autonomic 운영 프로필. 현재값은 `low_noise` |
| `sections.<section>.path` | body section 의 canonical 경로 |
| `section_files.<section>` | section-owned YAML metadata file list |
| `future_expansion.team_ready` | team 확장 준비 여부 |
| `future_expansion.shared_memory_inside_body` | body 내부 shared memory 허용 여부. 현재값은 `false` |

## `body_state.yaml`

- `body_state.yaml` 은 body 의 현재 상태 스냅샷이다.
- 같은 body 정의를 유지하더라도 실제 `.agent/` 구조와 동기화한 결과는 이 파일에서 확인한다.

### `body_state.yaml` 필드

| 필드 | 의미 |
| --- | --- |
| `body_id` | 연결된 body 식별자 |
| `operating_context` | 현재 body operating context |
| `sections.<section>.path` | section 실제 경로 |
| `sections.<section>.present` | section 존재 여부 |
| `operating_profiles.summary` | 현재 body operating profile 요약 |
| `future_expansion` | team/shared 확장 요약 |
| `status.summary` | 현재 스냅샷 요약 상태 |
| `status.warnings` | 구조 불일치 경고 목록 |

## 설계 규칙

1. body 메타는 `.agent` 가 소유한다.
2. `body_state.yaml` 은 구조와 메타에서 재생성 가능한 저장소 추적 상태 파일이다.
3. host-local 상태와 실행 시점 임시 상태는 `body_state.yaml` 에 넣지 않는다.
4. runtime 상태를 관측 없이 추정해 `body.yaml` 이나 `body_state.yaml` 에 적지 않는다.
5. `section_files` 는 section-owned YAML 정본 파일 목록이지 runtime discovery 결과가 아니다.
6. collaboration shared state 는 body 메타가 아니라 루트 `_teams/shared/` 확장 경계에서 다룬다.

## 미래 확장 방향

- runtime, memory, autonomic, artifacts 의 YAML file set 이 늘어나면 먼저 `section_files` 와 해당 README 를 갱신한다.
- export 전달 포맷이 늘어나도 별도 `sections.export` 나 `.agent/export/` 폴더는 도입하지 않는다.
