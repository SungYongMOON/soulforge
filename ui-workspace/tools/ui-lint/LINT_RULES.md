# UI Lint Rules

## 목적

- renderer v1 이 정본 파일을 직접 소비하지 않으면서도 fixture 와 shell 이 느슨하게 유지되도록 guardrail 을 고정한다.
- lint 는 예쁜 구현보다 contract 와 boundary 정합성을 먼저 검사한다.

## catalog lint

- fixture projection 이 실제 canonical catalog/module/profile/identity 파일을 올바르게 가리키는지 검사한다.
- canonical source tree 가 workspace 바깥에 있으면 `UI_LINT_CANONICAL_ROOT` 를 통해 optional overlay 검사로 붙인다.
- `source_ref` 존재 여부와 target file 존재 여부를 검사한다.
- catalog `item_id` 와 fixture row/catalog item `id` 중복을 검사한다.
- row `category` 와 tool `family` 가 허용된 값인지 검사한다.
- row item `catalog_ref` 와 fixture catalog item 이 실제 `.agent/catalog/**` 에서 resolve 되는지 검사한다.
- canonical target YAML 의 id 와 fixture/catalog id 가 일치하는지 검사한다.
- active species/profile 와 active catalog item 이 orphan reference 를 만들지 않는지 검사한다.

## ui-state contract lint

- `schemas/ui-state.schema.json` 으로 모든 `fixtures/ui-state/*.json` 을 validate 한다.
- fixture mode 에서는 `source.mode = fixture`, `source.fixture_name` 존재, `schema_version = ui-state.v1` 을 함께 검사한다.
- `ui_hints.default_tab` 이 renderer tab 집합 안에 있는지 검사한다.

## read-only boundary lint

- `packages/renderer-core/`, `packages/renderer-react/`, `packages/theme-*`, `apps/renderer-web/`, `apps/skin-lab-storybook/` 안에서 `.agent`, `.agent_class`, `_workspaces` 정본을 직접 읽거나 import 하지 못하게 한다.
- 허용 예외는 optional tool `tools/legacy-python-viewer/` 뿐이다.
- canonical 경로 문자열이 있어도 producer bridge 가 아니면 FAIL 로 본다.

## package boundary lint

- `apps/renderer-web` 는 `renderer-core`, `renderer-react`, `theme-*`, `ui-contract` package 경계만 사용해야 한다.
- `apps/skin-lab-storybook` 는 story/theme preview app 으로만 동작하고 다른 app shell internals 를 import 하지 않는다.
- web shell 이 `packages/renderer-core/src/*`, `fixtures/`, `schemas/`, canonical tree 를 직접 import 하면 FAIL 로 본다.
- `packages/renderer-core` 는 `apps/renderer-web` 를 import 하지 못한다.
- `packages/renderer-react` 는 concrete theme package, app shell, fixtures, schema 를 직접 import 하지 못한다.
- `packages/theme-contract`, `packages/theme-adventurers-desk` 는 renderer package, app shell, canonical tree 에 직접 의존하지 못한다.
- `packages/renderer-core/src/fixtures.ts` 의 repo fixture import 만 예외적으로 허용한다.

## fixture coverage lint

- fixture set 이 `integrated`, `overview`, `body`, `class`, `workspaces` 를 모두 포함하는지 검사한다.
- `packages/renderer-core/src/fixtures.ts` 의 export map 이 fixture 파일 세트와 맞는지 검사한다.
- fixture default tab 커버리지와 row/catalog coverage 를 검사한다.
- `installed`, `equipped`, `required`, `preferred`, `selectable_candidate` 상태가 fixture 집합에 최소 한 번 이상 나타나는지 검사한다.
- workspace `bound` 와 `unbound`, diagnostics warning/error summary presence 를 검사한다.

## theme isolation lint

- palette token 정의는 theme package CSS 에만 둔다.
- `packages/renderer-react/src/renderer.css`, `apps/renderer-web/src`, `apps/skin-lab-storybook/src` 는 raw color literal 을 직접 넣지 못하게 한다.
- concrete theme CSS import 는 각 app 의 `src/themes.ts` registry 에만 둔다.
- `apps/renderer-web/src/main.tsx`, `apps/skin-lab-storybook/src/main.tsx` 에서 theme registry import 를 renderer css 보다 먼저 가져오는지 검사한다.

## 예외 원칙

- lint 예외는 inline broad allowlist 로 늘리지 않는다.
- producer bridge, fixture import 같은 구조적 예외만 파일 단위로 명시한다.
- 새 예외가 필요하면 이 문서와 관련 README 를 같은 변경 안에서 갱신한다.
