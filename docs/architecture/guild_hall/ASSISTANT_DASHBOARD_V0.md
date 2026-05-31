# Assistant Dashboard v0

## Purpose

`assistant_dashboard` is the local read-only manager view for the personal
assistant v0.

It lets UI and operators see deadlines, open work, waiting items, recent done
work, and AI/data health in one small JSON without turning the dashboard into a
new source of truth.

## Owner Boundary

Implementation:

```text
guild_hall/assistant_dashboard/
```

Local output:

```text
guild_hall/state/assistant_dashboard/latest.json
```

Project truth remains in project-local ledgers:

```text
_workmeta/<project_code>/reports/deadline_watch/
_workmeta/<project_code>/reports/open_actions/
_workmeta/<project_code>/reports/작업_장부/
```

## Current Sections

- `today_risk`
- `p00_unresolved_deadlines`
- `projects`
- `waiting_on_people`
- `done_recent`
- `ai_data_health`

## Commands

```bash
npm run guild-hall:assistant-dashboard:write
npm run guild-hall:assistant-dashboard:json
npm run guild-hall:assistant-dashboard:validate
```

## UI Consumer

`renderer-web` exposes an Assistant Home pane backed by the local dashboard
JSON through the control-center API:

```text
/__control_center_api/assistant-dashboard
```

The UI may display the dashboard status, summary counts, project rows,
waiting buckets, recent done rows, data-health rows, and validation refs. It
must not write project ledgers or treat the dashboard as source truth.

## Boundaries

The dashboard must not read or copy raw mail bodies, raw HTML, attachment
payloads, provider payloads, secrets, tokens, cookies, or credential values.

The dashboard must not send Telegram messages, mutate Google Calendar, confirm
project assignment, or write project truth. It is a local-only read-only rollup.
