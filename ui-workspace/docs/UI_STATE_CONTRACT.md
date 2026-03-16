# UI State Contract

## 목적

- renderer v1 이 소비하는 normalized JSON contract 를 고정한다.
- raw `derive-ui-state --json` 이 legacy shape 여도 renderer-core 가 이 contract 로 normalize 한 뒤 소비하게 한다.

## top-level schema

renderer v1 은 아래 top-level 키를 기대한다.

- `schema_version`
- `generated_at`
- `source`
- `overview`
- `body`
- `class_view`
- `workspaces`
- `diagnostics`
- `catalogs`
- `ui_hints`

`class_view` 는 renderer contract 이름이다.
현재 legacy producer 의 `class` payload 는 adapter 에서 `class_view` 로 승격한다.

## top-level 의미

| 필드 | 의미 |
| --- | --- |
| `schema_version` | renderer contract 버전 |
| `generated_at` | payload 생성 시각 |
| `source` | fixture / integration / adapter 메타 |
| `overview` | 상단 종합 탭과 상단 summary strip 입력 |
| `body` | 왼쪽 panel 과 body 탭 입력 |
| `class_view` | right rows 와 class 탭 입력 |
| `workspaces` | workspace group surface 입력 |
| `diagnostics` | warnings/errors 와 summary 입력 |
| `catalogs` | read-only candidate projection |
| `ui_hints` | theme/layout/icon 같은 display hint |

## `source`

최소 필드:

- `producer`
- `mode`
- `adapter`
- `notes[]`

예시:

- `producer = fixture`
- `producer = derive-ui-state`
- `mode = fixture`
- `mode = integration`
- `adapter = normalized-v1`

## `overview`

최소 필드:

- `body_id`
- `class_id`
- `active_profile`
- `active_species`
- `active_hero`
- `sections_present.present`
- `sections_present.total`
- `installed_counts.skills|tools|knowledge|workflows`
- `equipped_counts.skills|tools|knowledge|workflows`
- `workspace_counts.total|bound|unbound|invalid`
- `warnings`
- `errors`
- `overall_status`

`active_species` 와 `active_hero` 는 object 또는 `null` 이다.
legacy integration mode 에서 producer 가 노출하지 않으면 `null` 을 허용한다.

## `body`

최소 필드:

- `meta.body_id`
- `meta.display_name`
- `meta.operating_context`
- `meta.status`
- `active_species`
- `active_hero`
- `section_presence[]`
- `section_summaries[]`
- `current_bindings`

`section_presence[*]` 최소 필드:

- `id`
- `path`
- `present`
- `status`

`current_bindings` 최소 필드:

- `class_binding.status`
- `class_binding.class_id`
- `class_binding.active_profile`
- `workspace_binding.status`

## `class_view`

최소 필드:

- `class_id`
- `class_name`
- `class_version`
- `active_profile`
- `rows.skills[]`
- `rows.tools[]`
- `rows.knowledge[]`
- `rows.workflows[]`

각 row item 최소 필드:

- `id`
- `display_name`
- `summary`
- `installed`
- `equipped`
- `active`
- `required`
- `preferred`
- `dependency_status`
- `family`
- `category`
- `source_ref`
- `source_hint`
- `catalog_ref`
- `selectable_candidate`

`preferred`, `required`, `dependency_status` 는 producer 정보가 부족하면 `null` 을 허용한다.

## `workspaces`

최소 필드:

- `summary.total`
- `summary.bound`
- `summary.unbound`
- `summary.invalid`
- `summary.binding_status`
- `grouped_projects.company[]`
- `grouped_projects.personal[]`

각 project 최소 필드:

- `project_id`
- `project_name`
- `project_path`
- `workspace_kind`
- `state`
- `project_agent_present`
- `default_loadout`
- `binding_status`
- `capsule_binding_count`
- `workflow_binding_count`
- `local_state_entry_count`

## `diagnostics`

최소 필드:

- `summary.warnings`
- `summary.errors`
- `summary.highest_severity`
- `warnings[]`
- `errors[]`

각 diagnostics item 최소 필드:

- `code`
- `message`
- `severity`
- `location_hint`

## `catalogs`

catalog 는 selectable candidates 를 보여주기 위한 read-only projection 이다.
canonical source 는 `.agent/species/**`, `.unit/**`, `.agent_class/**`, `.workflow/**`, `.party/**` 에 있다.

### identity

- `species_candidates[]`
- `hero_candidates[]`

### class

- `profiles_catalog[]`
- `skills_catalog[]`
- `tools_catalog[]`
- `knowledge_catalog[]`
- `workflows_catalog[]`

legacy integration mode 에서는 producer 가 catalog projection 을 충분히 싣지 않으면 partial catalog 를 허용한다.

## `ui_hints`

`ui_hints` 는 data truth 가 아니라 renderer display hint 다.

최소 필드:

- `theme`
- `phase`
- `layout.left_ratio`
- `layout.right_ratio`
- `layout.gutter_ratio`
- `material_hints`
- `icon_hints`

## 상태 semantics

- `installed` = 현재 body/class 맥락에서 사용 가능한 자산
- `equipped` = 현재 loadout 에 올린 자산
- `active` = 현재 화면 컨텍스트에서 더 강하게 작동 중인 자산
- `required` = workflow 가 명시적으로 요구한 상태
- `preferred` = active profile 이 기본 선호로 밀어주는 상태
- `hero_bias` = 애매할 때 ordering/preview/tone 에 간접 영향
- `species_default` = durable default baseline

precedence:

1. `workflow.required`
2. `profile.preferred`
3. `hero.bias`
4. `species.default`

renderer legend 와 문서 설명은 이 우선순위를 그대로 따라야 한다.

## active vs candidate 구분

- active state 는 `overview`, `body`, `class_view`, `workspaces` 에 들어간다.
- candidate projection 은 `catalogs` 에 들어간다.
- clicked item, hovered row, opened card, preview target 같은 UI local state 는 JSON 에 저장하지 않는다.

## future extension 포인트

- `team_view`
- `timeline`
- richer diagnostics categories
- selection persistence metadata
- producer-native v1 contract flag

새 필드를 추가할 때는 기존 top-level 키와 핵심 semantics 를 깨지 않는다.
