# body 메타 계약

## 목적

- `.agent/body.yaml` 과 `.agent/body_state.yaml` 의 기준 필드와 의미를 설명한다.
- active selection 과 catalog layer 가 body 메타에서 어떻게 드러나는지 고정한다.

## 범위

- body 정적 정의와 body 상태 스냅샷만 다룬다.
- canonical class asset 본문, generator 구현, runtime 임시 상태는 범위 밖이다.

## `body.yaml`

`body.yaml` 은 body 의 정적 정의다.

### 핵심 필드

| 필드 | 의미 |
| --- | --- |
| `identity_assets.*` | active identity 와 trait binding 정본 경로 |
| `active_selection.*` | active species / hero / class binding / profile ref |
| `catalog_layer.path` | `.agent/catalog` root |
| `catalog_layer.roots.identity` | identity selection catalog root |
| `catalog_layer.roots.class` | class selection catalog root |
| `operating_profiles.*` | sessions/memory/autonomic 와 profile semantics 요약 |
| `sections.*.path` | body section canonical path |
| `section_files.*` | section-owned YAML 정본 목록 |

### 규칙

1. `identity_assets` 는 active identity 파일을 가리킨다.
2. `active_selection` 은 현재 적용 중인 species/hero/class/profile ref 를 요약한다.
3. `catalog_layer` 는 UI selection layer 의 존재와 root 를 설명한다.
4. `section_files` 는 catalog index 를 포함한 section-owned YAML 정본 목록이다.
5. canonical class asset 본문은 `body.yaml` 에 직접 복제하지 않는다.

## `body_state.yaml`

`body_state.yaml` 은 `sync-body-state` 로 재생성 가능한 body 상태 스냅샷이다.

### 핵심 필드

| 필드 | 의미 |
| --- | --- |
| `sections.*.path` | 실제 section 경로 |
| `sections.*.present` | section 존재 여부 |
| `active_selection.*` | active species / hero / class / profile ref 요약 |
| `catalog_layer.path` | catalog root 경로 |
| `catalog_layer.present` | catalog root 존재 여부 |
| `catalog_layer.roots.*.present` | identity/class catalog root 존재 여부 |
| `operating_profiles.summary` | 현재 body operating profile 요약 |
| `status.summary` | `ready` 또는 `degraded` |
| `status.warnings` | missing section 경고 목록 |

### 규칙

1. `body_state.yaml` 은 저장소 추적 대상이지만 재생성 가능한 상태 파일이다.
2. 관측하지 않은 runtime 임시 상태를 넣지 않는다.
3. `active_selection` 은 선언된 ref 요약이지 live runtime fact 추측이 아니다.
4. `catalog_layer.present` 는 실제 폴더 존재 여부만 반영한다.
5. `body_state.yaml` 은 `.agent_class/**` canonical asset 세부 내용을 복제하지 않는다.

## 설계 규칙

1. body 메타는 `.agent` 가 소유한다.
2. profile 은 preferred semantics 이고 restrictive allowlist 가 아니다.
3. hero 는 identity overlay 이며 class profile 로 해석하지 않는다.
4. workflow required semantics 는 `.agent_class/workflows/` 와 `registry/active_class_binding.yaml` 에서 해석한다.
5. future generator 는 catalog population concern 이므로 `body_state.yaml` 에 runtime job 상태를 넣지 않는다.
