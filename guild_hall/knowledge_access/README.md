# guild_hall/knowledge_access

## Purpose

- `knowledge_access/` is a small public-safe command surface for proving that ordinary knowledge ref reads/uses can append metadata-only ledger rows.
- It supports `read` for repo-relative public knowledge files and `record` for use/citation events where the target payload is not read.
- The ledger target is always explicit: pass either `--ledger-root` or `--ledger-file`. Use `_workmeta/**`, `guild_hall/state/**`, `private-state/**`, or a temp path outside the repo for actual runtime rows.
- The combined operating model is documented at `docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md`.

## Commands

```bash
npm run guild-hall:knowledge-access -- read --ref docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md --ledger-root _workmeta/system/reports/knowledge_access --reason-used "checked activity contract"
npm run guild-hall:knowledge-access -- record --ref docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md --ledger-root _workmeta/system/reports/knowledge_access --access-type cite --reason-used "cited activity contract" --output-ref _workmeta/system/reports/example.md
npm run validate:knowledge-access
```

## Boundary

- Ledger rows include refs and metadata only: event id, timestamp, capture mode, ledger ref, actor, target knowledge ref, access type, reason, output ref, work context, outcome state, and redaction flags.
- Source file payloads are returned only by `read`; they are never copied into the JSONL row.
- Secret-like filenames, private/runtime roots, absolute paths, and path traversal refs are blocked before any read or append.
- Public tracked canon is not a runtime ledger owner. If the ledger target is inside the repo, it must be under `_workmeta/**`, `guild_hall/state/**`, or `private-state/**`.
