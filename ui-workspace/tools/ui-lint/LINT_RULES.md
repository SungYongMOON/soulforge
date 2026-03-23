# UI Lint Rules

## 목적

- renderer v1 이 정본 파일을 직접 소비하지 않으면서도 fixture 와 shell 이 느슨하게 유지되도록 guardrail 을 고정한다.
- lint 는 contract 와 boundary 정합성을 예쁜 구현보다 먼저 검사하며 canonical 경계를 지금 상태 그대로 유지한다.

## read-only boundary lint

- `packages/renderer-core/`, `packages/renderer-react/`, `packages/theme-*`, `apps/renderer-web/`, `apps/skin-lab-storybook/` 안에서는 `.registry`, `.unit`, `.workflow`, `.party`, `_workspaces` 정본을 직접 읽거나 import 하지 못하게 한다.
- canonical 경로 문자열이 있어도 producer bridge 상황이 아니면 FAIL 처리하여 read-only boundary 를 유지한다.

## package boundary lint

- `apps/renderer-web` 은 `renderer-core`, `renderer-react`, `theme-*`, `ui-contract` package 경계만 사용한다.
- `apps/skin-lab-storybook` 은 story/theme preview app 으로만 동작하고 다른 app shell internals 를 import 하지 않는다.
- web shell 이 `packages/renderer-core/src/*`, `fixtures/`, `schemas/`, canonical tree 를 직접 import 하면 FAIL 처리를 받는다.
- `packages/renderer-core` 는 `apps/renderer-web` 을 import 하지 않는다.
- `packages/renderer-react` 는 concrete theme package, app shell, fixtures, schema 를 직접 import 하지 않는다.
- `packages/theme-contract`, `packages/theme-*` 는 renderer package, app shell, canonical tree 에 직접 의존하지 않는다.
- `packages/renderer-core/src/fixtures.ts` 의 repo fixture import 만 예외적으로 허용한다.

## catalog lint

- fixture projection 이 새 owner roots (`.registry`, `.unit`, `.workflow`, `.party`) 의 실제 template 파일을 올바르게 가리키는지 검사한다.
- axis item `source_ref` 존재 여부와 target file 존재 여부를 검사한다.
- unit refs 가 species/class/workflow/party axis 안에서 resolve 되는지 검사한다.
- workflow `history_policy`, party `stats_policy` 가 curated summary only 인지 검사한다.

## ui-state contract lint

- `schemas/ui-state.schema.json` 으로 모든 `fixtures/ui-state/*.json` 을 validate 한다.
- fixture mode 에서는 `source.mode = fixture`, `source.fixture_name` 존재, `schema_version = ui-state.v1` 을 함께 검사한다.
- `species`, `units`, `classes`, `workflows`, `parties`, `workspaces` axis 존재와 `workspaces.mode = local_only_mount` 를 함께 검사한다.

## fixture coverage lint

- fixture set 이 `integrated`, `overview`, `body`, `class`, `workspaces` 를 모두 포함하는지 검사한다.
- `packages/renderer-core/src/fixtures.ts` 의 export map 이 fixture 파일 세트와 맞는지 검사한다.
- fixture default tab 커버리지와 새 6축 axis coverage 를 검사한다.
- public fixture 가 `workspaces.local_scan_enabled = false`, `projects = []` 를 유지하는지 검사한다.
- `.agent/`, `.agent_class/`, `company/personal`, `_workmeta/<project_code>/runs` 같은 stale/private 흔적이 fixture payload 에 남지 않았는지 검사한다.
- synthetic workspace policy 경고가 diagnostics 에 드러나는지 검사한다.

## theme isolation lint

- palette token 정의는 theme package CSS 에만 둔다.
- `packages/renderer-react/src/renderer.css`, `apps/renderer-web/src`, `apps/skin-lab-storybook/src` 는 raw color literal 을 직접 넣지 못하게 한다.
- concrete theme CSS import 는 각 app 의 `src/themes.ts` registry 에만 둔다.
- `apps/renderer-web/src/main.tsx`, `apps/skin-lab-storybook/src/main.tsx` 에서 theme registry import 를 renderer css 보다 먼저 가져오는지 검사한다.

## workspace tracking lint

- canonical root 에서 `git ls-files _workspaces` 결과가 `_workspaces/README.md` 만 남는지 검사한다.
- `.gitignore` 에 `_workspaces/**` 와 `!_workspaces/README.md` 규칙이 함께 있는지 검사한다.
- `_workspaces/company/**`, `_workspaces/personal/**`, `_workspaces/<project_code>/**` 가 public tracking 으로 다시 올라오면 FAIL 처리한다.

## 예외 원칙

- lint 예외는 inline broad allowlist 로 늘리지 않는다.
- producer bridge, fixture import 같은 구조적 예외만 파일 단위로 명시한다.
- 새 예외가 필요하면 이 문서와 관련 README 를 같은 변경 안에서 갱신한다.
