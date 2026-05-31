# guild_hall/assistant_dashboard

`assistant_dashboard/` builds a local-only read-only rollup for the personal
assistant v0.

It reads project-local `_workmeta/<project_code>/reports/**` metadata ledgers
and writes `guild_hall/state/assistant_dashboard/latest.json`. The output is a
view, not source of truth.

Current inputs:

- `reports/deadline_watch/deadline_register.csv`
- `reports/deadline_watch/reminder_event_log.jsonl`
- `reports/open_actions/open_action_register.md`
- `reports/작업_장부/작업_장부.csv`
- local status timestamps under `guild_hall/state/**`

Boundaries:

- no raw mail body, HTML, attachment payload, provider payload, or secret value;
- no Telegram send;
- no Calendar mutation;
- no project assignment confirmation;
- project-local ledgers remain the truth source.
