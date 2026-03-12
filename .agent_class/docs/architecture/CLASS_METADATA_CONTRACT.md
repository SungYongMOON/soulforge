# class 메타 계약

## 목적

- `.agent_class/class.yaml` 과 `.agent_class/loadout.yaml` 의 기준 필드를 설명한다.
- `soulforge.base` 는 최종 직업이 아니라 reusable bootstrap template 로 유지한다.

## `class.yaml`

`class.yaml` 은 class 의 정적 정의다.

### 핵심 필드

| 필드 | 의미 |
| --- | --- |
| `id`, `name`, `version`, `description` | class 식별과 설명 |
| `body_root` | 연결할 body 루트 |
| `workspace_roots` | 연결할 workspace root 목록 |
| `selection_layer_ref` | `.agent/catalog/class` selection index root |
| `modules.skills/tools/workflows/knowledge` | installed module root |
| `modules.profiles` | canonical profile root |
| `modules.manifests` | canonical manifest root |
| `semantics.*` | workflow/profile/install semantics |

## `loadout.yaml`

`loadout.yaml` 은 현재 장착 상태표다.

### 핵심 필드

| 필드 | 의미 |
| --- | --- |
| `class_id` | 연결된 class id |
| `active_profile` | 현재 active profile id |
| `equipped.*` | 현재 장착된 module id 목록 |
| `bindings.*` | body 와 workspace binding |
| `semantics.*` | installed assets, profile, workflow 의 우선순위 해석 |

## 해석 규칙

- `active_profile` 은 default preference mode 의 id 다.
- profile 은 installed asset allowlist 가 아니다.
- workflow 가 명시되면 workflow 의 `required` 가 profile 선호보다 앞선다.
- `equipped.*` 는 canonical module id 문자열만 사용한다.
