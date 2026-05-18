# Party Name Mapping Table v0

Status: `draft`
Owner: `.party`
Claim ceiling: `canon_candidate`

이 문서는 2026-05-18 기준 `.party/index.yaml` 에 등록된 party 3개의 이름 매핑 초안이다. 여기의 `global_name_ko` 와 `display_name_ko` 는 alias 후보이며, 실제 rename, folder 변경, `party_id` 변경, validator enforcement 를 의미하지 않는다.

## 해석 규칙

- `party_id` 는 `.party/index.yaml` 의 현재 내부 안정 키다.
- `권장 global_name_ko` 는 slash 없는 한글 호출 alias 후보이며 아직 catalog 에 등록되지 않았다.
- `권장 display_name_ko` 는 설명용 이름이며 호출 key 가 아니다.
- `기본 workflow` 는 각 `.party/<party_id>/party.yaml` 의 현재 `default_workflow_id` 관찰값이다.
- `비고` 는 rename 판단이 아니라 후속 owner 검토를 위한 낮은 claim 메모다.

## 전체 매핑표

| party_id | 권장 global_name_ko | 권장 display_name_ko | 기본 workflow | 비고 |
| --- | --- | --- | --- | --- |
| `vanguard_strike` | `파티_전방타격` | `파티/전방/타격조합` | `frontline_assault` | current party id 를 유지하고 전방 작업 조율용 alias 후보만 둔다. |
| `lineage_strike` | `파티_계보타격` | `파티/계보/생산조합` | `build_lineage_map` | lineage-map production party 관찰값이며 rename 근거가 아니다. |
| `guild_master_cell` | `파티_길드마스터셀` | `파티/길드마스터/작성검토셀` | `author_skill_package` | current default authoring lane 이지만 universal party standard 로 고정하지 않는다. |

## workflow resolve 연결

party 선택이 workflow resolve 와 연결될 때의 문서상 흐름은 다음과 같다.

```text
workflow global_name_ko 후보 -> workflow_id -> party_id -> .party/<party_id>/party.yaml
```

예시:

| workflow alias 후보 | workflow_id | party_id | path |
| --- | --- | --- | --- |
| `운영_전방작업조율` | `frontline_assault` | `vanguard_strike` | `.party/vanguard_strike/party.yaml` |
| `작성_계보지도작성` | `build_lineage_map` | `lineage_strike` | `.party/lineage_strike/party.yaml` |
| `작성_스킬패키지생성` | `author_skill_package` | `guild_master_cell` | `.party/guild_master_cell/party.yaml` |

이 예시는 현재 party 의 `default_workflow_id` 를 기준으로 한 관찰표다. `allowed_workflows.yaml`, request context, owner policy 에 따라 다른 party 선택이 가능할 수 있으므로 실행 규칙으로 확정하지 않는다.

## 후속 owner 판단 필요

- 이 표는 alias 후보 목록이며 `.party/index.yaml` 에 필드를 추가하지 않는다.
- 실제 alias catalog 를 둘 위치는 `.party/index.yaml`, 각 `party.yaml`, derived UI layer 중 별도 결정이 필요하다.
- workflow alias catalog 와 party alias catalog 의 namespace 충돌 방지 방식은 후속 설계가 필요하다.
- rename 이 필요하면 downstream refs, mission refs, workflow compatibility, private evidence, README, changelog 를 포함한 migration packet 이 먼저 필요하다.
