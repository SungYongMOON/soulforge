# guild_hall/daily_ledger

## Purpose

`daily_ledger/` validates metadata-only daily work ledger files and renders a
ledger-only Markdown draft for daily or weekly worklog writers.

The command surface is intentionally explicit. It reads only `--ledger-file`
paths or repo-relative `--ledger-ref` values supplied by the caller. It does not
scan live `_workmeta`, mail bodies, attachments, git history, system logs,
Office/PDF/HWP payloads, `_workspaces` payloads, or secrets.

## Commands

```bash
npm run validate:daily-ledger
npm run guild-hall:daily-ledger -- validate --ledger-file <external-temp-ledger.json> --json
npm run guild-hall:daily-ledger -- render --ledger-ref _workmeta/P26-014/daily_ledger/2026/2026-06-06.yaml --expect-ledger P26-014
```

`--ledger-ref` must stay under one of the daily ledger roots:

- `_workmeta/<project_code>/daily_ledger/**`
- `_workmeta/P00-000_INBOX/daily_ledger/**`
- `_workmeta/system/daily_ledger/<subledger_id>/**`

`--ledger-file` may point at an external temp fixture for dry-run validation.

## Boundary

- Project codes must be `Pxx-xxx`, with `P00-000_INBOX` reserved for company
  general or unresolved work.
- Soulforge work must use a known sub-ledger from
  `docs/architecture/workspace/DAILY_WORK_LEDGER_TAXONOMY_V0.md`; unknown
  sub-ledgers are rejected instead of defaulting to `system`.
- Ledger refs and text are rejected when they contain raw payload extensions,
  raw payload fields, runtime absolute paths, UNC paths, or secret-like text.
- The renderer lists `source_refs` as metadata pointers only. It never opens
  them, and unsupported renderer flags such as source/mail/git refs are blocked.
- Missing expected ledgers and incomplete ledgers become explicit gap rows in
  the rendered draft.
