# operation-board fixtures

## Purpose

- This folder contains synthetic public-safe Operation Board snapshot fixtures.
- These fixtures are not copies of `guild_hall/state/snapshot/soulforge_snapshot.json` and are not source truth.
- Fixture values are intentionally small, invented, and suitable only for UI and lint regression checks.

## Boundary

- Do not place live `guild_hall/state/**`, `_workspaces/**`, `_workmeta/**`, `private-state/**`, raw mail, attachment, provider payload, source text, or NotebookLM answer/question payload here.
- The only allowed `_workmeta`-shaped value is the aggregate wildcard in `operation_board.sections.battle_log.source_ref`.
- `fixtures/ui-state/*.json` remains the separate 6-axis renderer schema fixture set.

## Lint

- Workspace: `npm run lint:operation-board-fixture`
- Root proxy: `npm run ui:lint:operation-board-fixture`
