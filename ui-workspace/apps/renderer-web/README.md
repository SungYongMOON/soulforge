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
- Team Operations Console draft backed by `guild_hall/state/assistant_dashboard/latest.json`
- Smartsheet-pending read-only operating board posture that still works from local Soulforge rollups
- read-only Dungeon Map pane backed by `guild_hall/state/snapshot/soulforge_snapshot.json`
- Operation Board display from the snapshot `operation_board` projection
- metadata-only Knowledge Lane display from `operation_board.sections.knowledge_lane`
- fresh-only Knowledge Lane rendering with sanitized state, claim, helper/bridge/workflow/fixture presence, and private/local evidence count keys
- gateway notification toggles aligned to the v0 `monster_created` and `mail_received` event set

## 제외 대상

- canonical source resolver
- integration bridge 실행
- write-back editor
- selection persistence
- raw `_workspaces`, `_workmeta`, `private-state`, gateway mail body/html/source quote/raw/attachment source display in Dungeon Map
- Team Operations Console write-back, Smartsheet mutation, automatic completion, automatic project assignment, Calendar mutation, or Telegram send
- unsupported gateway notification event expansion without the gateway/town_crier contract changing first
- knowledge validation, ontology acceptance, owner decision approval, or canon promotion authority

## 관련 경로

- [apps/README.md](../README.md)
- [packages/renderer-react/README.md](../../packages/renderer-react/README.md)
- [packages/theme-adventurers-desk/README.md](../../packages/theme-adventurers-desk/README.md)
- [docs/UI_THEME_ADVENTURERS_DESK.md](../../docs/UI_THEME_ADVENTURERS_DESK.md)
- [fixtures/ui-state/README.md](../../fixtures/ui-state/README.md)
