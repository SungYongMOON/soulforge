# apps/renderer-web

## 목적

- `renderer-web/` 는 portable renderer v1 의 web shell 을 둔다.
- fixture mode 를 기본으로 제공하고, future integration provider 와 분리된 host shell 만 담당한다.

## 포함 대상

- Vite dev server shell
- fixture request parsing
- renderer-react surface mount
- theme registry / swap wiring
- Adventurer's Desk Phase UI-1 theme wiring
- read-only Dungeon Map pane backed by `guild_hall/state/snapshot/soulforge_snapshot.json`

## 제외 대상

- canonical source resolver
- integration bridge 실행
- write-back editor
- selection persistence
- raw `_workspaces`, `_workmeta`, `private-state`, or gateway source display in Dungeon Map

## 관련 경로

- [apps/README.md](../README.md)
- [packages/renderer-react/README.md](../../packages/renderer-react/README.md)
- [packages/theme-adventurers-desk/README.md](../../packages/theme-adventurers-desk/README.md)
- [docs/UI_THEME_ADVENTURERS_DESK.md](../../docs/UI_THEME_ADVENTURERS_DESK.md)
- [fixtures/ui-state/README.md](../../fixtures/ui-state/README.md)
