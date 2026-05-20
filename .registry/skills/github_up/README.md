# .registry/skills/github_up

- `github_up/skill.yaml` is the canonical Soulforge skill entry for routing GitHub upload/publish requests to the registered upload workflow.
- `codex/` is the Codex wrapper that materializes to `~/.codex/skills/soulforge-github-up/` through the repository skill sync script.
- The canonical procedure remains `.workflow/github_upload_publish_v0/`.

```powershell
npm.cmd run skills:sync -- github_up
```

