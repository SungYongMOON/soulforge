# ui-workspace

## 목적

- `ui-workspace/` 는 Soulforge UI consumer layer 를 root canonical 구조와 분리해 관리하는 전용 workspace 다.
- renderer, theme, fixture, schema, UI lint, optional legacy integration tool 을 한곳에 모아 이식 가능하게 유지한다.

## 구성

- `docs/`: renderer contract, selection, theme, migration 문서
- `schemas/`: UI state schema 정본
- `fixtures/`: fixture-first 개발용 sample state
- `tools/`: UI lint 와 optional legacy integration tool
- `packages/`: contract, core, react, theme package
- `apps/`: renderer web shell, skin lab placeholder

## 원칙

- renderer package 와 web shell 은 canonical `.agent`, `.agent_class`, `_workspaces` 를 직접 읽지 않는다.
- fixture mode 만으로 `npm run dev` 와 `npm run build` 가 가능해야 한다.
- future integration bridge 는 optional tool/provider concern 으로 분리한다.

## 실행

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run validate`
- `npm run lint:all`

## 관련 경로

- [docs/README.md](./docs/README.md)
- [packages/renderer-core/README.md](./packages/renderer-core/README.md)
- [packages/renderer-react/README.md](./packages/renderer-react/README.md)
- [apps/renderer-web/README.md](./apps/renderer-web/README.md)
