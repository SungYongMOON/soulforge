# packages

## 목적

- `packages/` 는 renderer 와 같은 reusable implementation core 를 둔다.
- app shell 바깥에서도 다시 쓸 수 있는 contract, core, react, theme package 를 보관한다.

## 포함 대상

- `ui-contract/`
- `renderer-core/`
- `renderer-react/`
- `theme-contract/`
- `theme-adventurers-desk/`

## 제외 대상

- 브라우저 host shell
- canonical source scan/resolve/validate 구현

## 관련 경로

- [ui-workspace README](../README.md)
- [apps/README.md](../apps/README.md)
- [docs/UI_RENDERER_MODEL.md](../docs/UI_RENDERER_MODEL.md)
