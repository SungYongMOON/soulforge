# Foundation Schema Field Matrix

## `species.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `species_id` | yes | string | folder name와 일치 |
| `kind` | yes | string | `species` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `title` | yes | string | species 표시명 |
| `summary` | yes | string | 짧은 설명 |
| `heroes` | yes | list[object] | inline hero set |
| `heroes[].hero_id` | yes | string | species 안에서만 유일 |
| `heroes[].title` | yes | string | hero 표시명 |
| `heroes[].summary` | yes | string | hero 설명 |
| `heroes[].profile_ref` | yes | string | string id |
| `heroes[].biases` | no | map[string, number] | 추천 가중치, 정책 아님 |
| `notes` | no | list[string] | 설명 메모 |

## `class.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `class_id` | yes | string | folder name와 일치 |
| `kind` | yes | string | `class` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `title` | yes | string | class 표시명 |
| `summary` | yes | string | 짧은 설명 |
| `profile_ref` | yes | string | string id |
| `skill_refs` | yes | string | sibling file pointer |
| `tool_refs` | yes | string | sibling file pointer |
| `knowledge_refs` | yes | string | sibling file pointer |
| `notes` | no | list[string] | 설명 메모 |

## `unit.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `unit_id` | yes | string | active subject id |
| `kind` | yes | string | `unit` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `title` | yes | string | unit 표시명 |
| `summary` | yes | string | 짧은 설명 |
| `profile_ref` | yes | string | string id |
| `species_ref` | yes | string | `.registry/species/<species_id>/species.yaml` pointer |
| `hero_id` | yes | string | 선택한 species 내부에서만 resolve |
| `class_refs` | yes | list[string] | `.registry/classes/<class_id>/class.yaml` pointers |
| `notes` | no | list[string] | 설명 메모 |

## class-local `*_refs.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `class_id` | yes | string | parent class와 일치 |
| `kind` | yes | string | `skill_refs` 또는 `tool_refs` 또는 `knowledge_refs` |
| `status` | yes | enum | `draft | active | archived` |
| `assign` | yes | list[object] | assign/ref pair 목록 |
| `assign[].assign` | yes | string | class-local assignment key |
| `assign[].ref` | yes | string | canonical ref id |
| `assign[].summary` | no | string | 짧은 설명 |
| `notes` | no | list[string] | 설명 메모 |
