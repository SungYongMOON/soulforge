# .registry/skills/github_down

- `github_down/skill.yaml` is the canonical Soulforge skill entry for routing GitHub download/update requests to the registered latest-update workflow.
- `codex/` is the Codex wrapper that materializes to `~/.codex/skills/soulforge-github-down/` through the repository skill sync script.
- The canonical procedure remains `.workflow/latest_update_sync_and_followup_v0/`.

```powershell
npm.cmd run skills:sync -- github_down
```

