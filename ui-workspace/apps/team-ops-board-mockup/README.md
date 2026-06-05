# Team Ops Board Mockup

## Purpose

`team-ops-board-mockup/` is a standalone React/Vite clickable mockup for a daily team operations board.

It uses local sample data only. It does not read private project files, Smartsheet data, mail payloads, `_workspaces`, `_workmeta`, or canonical Soulforge source trees.

## Surfaces

- Board: daily lanes, counts, Today/This week filters, project filter, item detail panel
- Projects: project workload and status preview
- Schedule: due-date grouped work list
- People: workload by sample team member
- Settings: v0 board options placeholder

## Interactions

- Add a work item
- Select an item and edit owner or status
- Require a note before moving an item to Blocked or Waiting
- Add comments to the selected item
- Export a weekly summary as text or CSV

## Run

- `npm run team-ops:dev`
- `npm run team-ops:build`
- `npm run team-ops:preview`

From the repository root:

- `npm run ui:team-ops:dev`
- `npm run ui:team-ops:build`
- `npm run ui:team-ops:preview`
