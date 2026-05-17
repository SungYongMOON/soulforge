# Battle Log

Reusable writer and renderer for project-local battle logs.

## Outputs

- `_workmeta/<project_code>/log/events/YYYY/MM/battle_events.jsonl`
- `_workmeta/<project_code>/log/battle_log/daily/YYYY-MM-DD.md`
- `_workmeta/<project_code>/log/battle_log/latest.md`

The public repo owns the writer and renderer only. Event streams and rendered battle logs are private/project-local runtime outputs under `_workmeta/**`.

## CLI

```sh
node guild_hall/battle_log/cli.mjs append --project-code demo_project --event-file event.json
node guild_hall/battle_log/cli.mjs render --project-code demo_project --date 2026-03-19
```

The event input follows `docs/architecture/workspace/schema/battle_event.schema.yaml`. The writer persists only schema fields, rejects unsafe project path segments, and rejects raw/sensitive-looking payload keys such as mail bodies, headers, attachments, tokens, cookies, and credentials.
