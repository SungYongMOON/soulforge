# Soulforge

Soulforge는 `.agent`, `.agent_class`, `_workspaces` 세 축을 중심으로 정본 구조를 관리하는 설계 저장소다.
`.agent` 는 active identity 와 selection catalog 를 소유하고, `.agent_class` 는 canonical loadout asset 을 소유한다.
UI consumer layer 는 이제 [`ui-workspace/`](ui-workspace/README.md) 아래에서 별도 workspace 로 관리한다.

## 목적

- 루트에서는 저장소 전체의 상위 지도와 owner 경계만 제공한다.
- 세부 운영 규칙과 계층별 메타 계약은 각 owner 문서에서 관리한다.

## 구조 개요도

```mermaid
flowchart TD
  S["Soulforge"] --> B[".agent<br/>private operating system"]
  S --> C[".agent_class<br/>loadout"]
  S --> W["_workspaces<br/>mission site"]
  S --> D["docs/architecture<br/>root-owned docs"]
  S --> U["ui-workspace<br/>portable UI workspace"]
  S --> V2["ui<br/>relocation / legacy pointer"]
  S --> V["dev<br/>plan / log"]
  W --> P[".project_agent<br/>project contract"]
```

## 상위 지도

- [`.agent/README.md`](.agent/README.md): `.agent` 상위 개요
- [`.agent_class/README.md`](.agent_class/README.md): `.agent_class` 상위 개요
- [`_workspaces/README.md`](_workspaces/README.md): `_workspaces` 상위 개요
- [`docs/architecture/README.md`](docs/architecture/README.md): root-owned architecture 문서 색인
- [`docs/architecture/foundation/TARGET_TREE.md`](docs/architecture/foundation/TARGET_TREE.md): 저장소 목표 트리와 최종 `.agent` target tree
- [`docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`](docs/architecture/foundation/DOCUMENT_OWNERSHIP.md): 폴더별 정본 문서 소유 기준
- [`ui-workspace/README.md`](ui-workspace/README.md): UI 전용 workspace 개요
- [`ui-workspace/DONE.md`](ui-workspace/DONE.md): UI workspace closeout 선언
- [`ui-workspace/docs/README.md`](ui-workspace/docs/README.md): renderer v1 문서군
- [`ui-workspace/docs/UI_NEXT_PHASE_BACKLOG.md`](ui-workspace/docs/UI_NEXT_PHASE_BACKLOG.md): 다음 단계 backlog
- [`ui-workspace/packages/renderer-core/README.md`](ui-workspace/packages/renderer-core/README.md): renderer-core 개요
- [`ui-workspace/apps/renderer-web/README.md`](ui-workspace/apps/renderer-web/README.md): renderer-web shell 개요
- [`ui-workspace/tools/ui-lint/README.md`](ui-workspace/tools/ui-lint/README.md): UI/catalog lint suite

## 정본 안내

- 루트 `README.md` 는 상위 지도만 유지한다.
- `.agent` 상세 운영과 구조 의미의 정본은 [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](.agent/docs/architecture/AGENT_BODY_MODEL.md), [`.agent/docs/architecture/BODY_METADATA_CONTRACT.md`](.agent/docs/architecture/BODY_METADATA_CONTRACT.md), 그리고 각 `.agent` 하위 로컬 `README.md` 에 둔다.
- `.agent_class` 상세 운영의 정본은 [`.agent_class/docs/architecture/`](.agent_class/docs/architecture) 문서와 각 로컬 `README.md` 에 둔다.
- `_workspaces` 상세 운영의 정본은 [`_workspaces/README.md`](_workspaces/README.md) 와 각 workspace/project 로컬 문서에 둔다.

## 루트 문서

- [`docs/architecture/foundation/REPOSITORY_PURPOSE.md`](docs/architecture/foundation/REPOSITORY_PURPOSE.md): 저장소 전체 목적
- [`docs/architecture/foundation/TARGET_TREE.md`](docs/architecture/foundation/TARGET_TREE.md): 목표 구조
- [`docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`](docs/architecture/foundation/DOCUMENT_OWNERSHIP.md): 문서 소유 기준
- [`docs/architecture/ui/UI_SOURCE_MAP.md`](docs/architecture/ui/UI_SOURCE_MAP.md): UI source 정본 지도
- [`docs/architecture/ui/UI_SYNC_CONTRACT.md`](docs/architecture/ui/UI_SYNC_CONTRACT.md): UI 동기화 계약
- [`docs/architecture/ui/UI_CONTROL_CENTER_MODEL.md`](docs/architecture/ui/UI_CONTROL_CENTER_MODEL.md): file-based control center 편집 모델
- [`ui-workspace/docs/UI_RENDERER_MODEL.md`](ui-workspace/docs/UI_RENDERER_MODEL.md): renderer v1 경계
- [`ui-workspace/docs/UI_STATE_CONTRACT.md`](ui-workspace/docs/UI_STATE_CONTRACT.md): normalized UI state contract

## UI lint

- `npm run ui:lint:catalog`
- `npm run ui:lint:ui-state`
- `npm run ui:lint:read-only`
- `npm run ui:lint:packages`
- `npm run ui:lint:fixtures`
- `npm run ui:lint:theme`
- `npm run ui:lint:all`
- `npm run ui:docs:check`
- `npm run ui:done:check`

## UI workspace 실행

- `npm run ui:workspace:install`
- `npm run ui:dev`
- `npm run ui:build`
- `npm run ui:skin-lab:dev`
- `npm run ui:skin-lab:build`
- `npm run ui:smoke:theme-pack`
