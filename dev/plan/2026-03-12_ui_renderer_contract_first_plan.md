# 2026-03-12 UI renderer contract-first plan

## 목표

- Soulforge 저장소에 portable read-only UI renderer v1 기반을 도입한다.
- renderer 는 정본 파일을 직접 읽지 않고 `derive-ui-state --json` 출력 또는 fixture JSON 만 소비한다.
- contract/schema/fixture/renderer-core/web-shell 분리를 먼저 고정하고, Adventurer's Desk 톤의 Phase UI-1 wireframe shell 까지 구현한다.

## 범위

- `docs/ui/` 신설과 renderer 계약 문서 작성
- `schemas/ui-state.schema.json` 추가
- `fixtures/ui-state/*.json` 추가
- `packages/renderer-core/` 추가
- `apps/renderer-web/` 추가
- 루트 README, target tree, document ownership, docs README 계열 최소 최신화

## 이번 차수의 고정 결정

- renderer v1 은 read-only viewer 로만 구현한다.
- local selection state 는 탭 전환, item selection, catalog browsing, active candidate preview 까지만 허용한다.
- selection persistence, patch, save, canonical write 는 구현하지 않는다.
- 현재 `derive-ui-state` 출력은 legacy contract 로 유지하고, `renderer-core` 에서 v1 UI state contract 로 normalize 하는 adapter 를 둔다.
- fixture mode 는 full v1 contract 를 기준으로 개발한다.
- host integration mode 는 `derive-ui-state --json` 만 읽는 thin bridge 로 유지한다.
- Phase UI-1 은 shape-first neutral wireframe + Adventurer's Desk token 적용까지만 포함한다.

## 변경 파일 묶음

### 1. 문서

- `docs/ui/README.md`
- `docs/ui/UI_RENDERER_MODEL.md`
- `docs/ui/UI_STATE_CONTRACT.md`
- `docs/ui/UI_THEME_ADVENTURERS_DESK.md`
- `docs/ui/UI_IMPLEMENTATION_PLAN.md`
- `docs/ui/UI_SELECTION_MODEL.md`

### 2. 계약 / 샘플

- `schemas/ui-state.schema.json`
- `fixtures/ui-state/overview.sample.json`
- `fixtures/ui-state/body.sample.json`
- `fixtures/ui-state/class.sample.json`
- `fixtures/ui-state/workspaces.sample.json`
- `fixtures/ui-state/integrated.sample.json`

### 3. 구현

- `packages/renderer-core/**`
- `apps/renderer-web/**`
- 필요 시 루트 `package.json`, `tsconfig.base.json`, `.gitignore`

### 4. 루트 동기화

- `README.md`
- `docs/README.md`
- `docs/architecture/README.md`
- `docs/architecture/TARGET_TREE.md`
- `docs/architecture/DOCUMENT_OWNERSHIP.md`

## done 기준

1. `docs/ui/*` 에 renderer boundary, portability, state semantics, selection model, theme phase 구분이 고정된다.
2. `schemas/ui-state.schema.json` 이 fixture 세트를 validate 한다.
3. `packages/renderer-core` 가 v1 state types, legacy derive adapter, loader, selection store, icon/material mapping 을 제공한다.
4. `apps/renderer-web` 가 fixture mode 와 derive integration mode 로 실행 가능하다.
5. web shell 에 root tabs, left panel, right surface, info dock, diagnostics summary area 가 있다.
6. UI 에서 `installed / equipped / required / preferred` legend 와 표현이 보인다.
7. read-only boundary 가 문서와 코드에서 유지된다.

## 검증 계획

1. `npm run ui:validate`
2. `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json`
3. `npm run renderer:web:build`
4. `npm run renderer:web:dev -- --host 127.0.0.1`
5. fixture mode 와 integration mode 에서 body/class/workspaces/diagnostics 탭 표시 점검
6. README 링크와 상대 경로 점검

## 리스크

- 현재 `derive-ui-state` 가 active species/hero 와 full catalog projection 을 직접 싣지 않으므로 integration mode 는 일부 필드를 `null` 또는 partial catalog 로 정규화해야 한다.
- 기존 `ui/viewer/` legacy prototype 과 새 `apps/renderer-web` shell 이 병존하므로 문서에서 역할을 분명히 나눠야 한다.
- 저장소에 JS toolchain 이 없으므로 root workspace 설정과 ignore 정책을 같이 정리해야 한다.

## TODO

- derive producer 가 v1 contract 를 직접 내보내도록 승격할지 결정
- selection persistence/control-plane 분리 문서화
- Adventurer's Desk Phase UI-2 material skin 확장
- renderer-core 외부 저장소 추출 절차 정리

## ASSUMPTIONS

- 기존 `ui/viewer/` 는 legacy read-only prototype 으로 유지하고 이번 차수에서는 제거하지 않는다.
- 현재 dirty worktree 에 있는 catalog/identity/sample 정리 변경은 별도 라운드 산출물로 간주하고, 이번 작업은 새 renderer layer 와 root-owned 문서/도구 추가에 집중한다.
