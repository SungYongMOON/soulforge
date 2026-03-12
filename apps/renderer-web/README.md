# apps/renderer-web

## 목적

- `renderer-web/` 는 portable renderer v1 의 web shell 을 둔다.
- fixture mode 와 derive integration mode 를 같은 surface 에서 제공한다.

## 포함 대상

- Vite dev server shell
- root layout shell
- tabs, left panel, right surface, info dock
- Adventurer's Desk Phase UI-1 theme
- host bridge endpoint

## 제외 대상

- canonical source resolver
- write-back editor
- selection persistence

## 관련 경로

- [apps/README.md](../README.md)
- [packages/renderer-core/README.md](../../packages/renderer-core/README.md)
- [docs/ui/UI_THEME_ADVENTURERS_DESK.md](../../docs/ui/UI_THEME_ADVENTURERS_DESK.md)
- [fixtures/ui-state/README.md](../../fixtures/ui-state/README.md)
