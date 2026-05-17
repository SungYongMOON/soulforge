# Mission Close

`mission_close` is the bridge from project-local battle evidence to owner-facing
mission terminal state.

## Boundary

- Reads battle events from `_workmeta/<project_code>/log/events/YYYY/MM/battle_events.jsonl`.
- Requires the referenced run evidence directory at `_workmeta/<project_code>/runs/<run_id>/`.
- Writes only terminal pointers and status fields under `.mission/<mission_id>/`.
- With `--mission-surface private`, writes the same terminal pointers and status fields under
  `_workmeta/<project_code>/missions/<mission_id>/` instead.
- Does not copy raw run truth, mail payloads, attachments, source bodies, or secrets into either mission surface.

## CLI

```sh
node guild_hall/mission_close/cli.mjs close \
  --mission-id play_loop_mail_intake_demo_project_001 \
  --run-id demo_project_run_2026_03_19_001 \
  --battle-event-id battle-2026-03-19-0001
```

Optional flags:

- `--mission-surface public|private` selects `.mission/<mission_id>/` or
  `_workmeta/<project_code>/missions/<mission_id>/`; default is `public`.
- `--project-code <code>` when the mission project should be checked explicitly.
  Required when `--mission-surface private` is used.
- `--workmeta-root <path>` for tests or a non-default local metadata root.
- `--closed-at <iso>` for deterministic replay.
- `--json` for machine-readable output.

The command is idempotent for the same `run_id` and `battle_event_id`. It
preserves the original `terminal_provenance.closed_at` on repeated runs and
refuses conflicting terminal provenance.
