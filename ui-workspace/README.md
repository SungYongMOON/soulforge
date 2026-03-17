# ui-workspace

## 목적

- `ui-workspace/` 는 Soulforge UI consumer layer 를 root canonical 구조와 분리해 관리하는 전용 workspace 다.
- renderer, theme, fixture, schema, UI lint, fixture-backed preview shell 을 한곳에 모아 이식 가능하게 유지한다.

## 구성

- `docs/`: renderer contract, selection, theme, 운영 문서
- `schemas/`: UI state schema 정본
- `fixtures/`: fixture-first 개발용 sample state
- `tools/`: UI lint 와 workspace-local helper tools
- `packages/`: contract, core, react, theme package 들
- `apps/`: renderer web shell, skin lab preview app

## 원칙

- renderer package 와 web shell 은 canonical `.registry`, `.unit`, `.workflow`, `.party`, `_workspaces` 를 직접 읽지 않는다.
- fixture mode 만으로 `npm run dev` 와 `npm run build` 가 가능해야 한다.
- future integration bridge 는 optional tool/provider concern 으로 분리한다.

## 실행

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run skin-lab:dev`
- `npm run skin-lab:build`
- `npm run validate`
- `npm run lint:all`
- `npm run docs:check-links`
- `npm run smoke:theme-pack`
- `npm run done:check`

## workflow

1. 구조/contract 변경 시 `docs/`, `schemas/`, `fixtures/` 를 먼저 맞춘다.
2. skin/theme 변경은 `docs/SKIN_DEVELOPMENT_WORKFLOW.md` 기준으로 `skin-lab` preview 와 theme smoke test 를 먼저 통과시킨다.
3. renderer/theme 변경 후 `npm run lint:all` 과 `npm run build` 를 돌린다.
4. 마감 전에는 `npm run done:check` 로 acceptance 세트를 한 번에 확인한다.

## 핵심 문서

- [docs/SKIN_DEVELOPMENT_WORKFLOW.md](./docs/SKIN_DEVELOPMENT_WORKFLOW.md)
- [docs/UI_RENDERER_MODEL.md](./docs/UI_RENDERER_MODEL.md)
- [docs/UI_STATE_CONTRACT.md](./docs/UI_STATE_CONTRACT.md)

## 관련 경로

- [docs/README.md](./docs/README.md)
- [packages/renderer-core/README.md](./packages/renderer-core/README.md)
- [packages/renderer-react/README.md](./packages/renderer-react/README.md)
- [apps/renderer-web/README.md](./apps/renderer-web/README.md)
