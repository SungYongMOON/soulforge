# .registry/skills/github_down

- `github_down/skill.yaml` is the canonical Soulforge skill entry for routing GitHub download/update requests to the registered latest-update workflow.
- `codex/` is the Codex wrapper that materializes to `~/.codex/skills/soulforge-github-down/` through the repository skill sync script.
- The canonical procedure remains `.workflow/latest_update_sync_and_followup_v0/`.
- Natural-language requests such as `Soulforge 최신화하고 이 PC에서 할 수 있게 준비해줘` route here. Codex performs safe sync and read-only capability checks itself, then reports role-appropriate work and owner-only blockers.
- The default is `public-only`; companion folders do not imply an owner profile. Mutating work/tool/always-on/dev-worker bootstrap requires the explicit profile and role authority named by the tracked role prompt.

```powershell
npm.cmd run skills:sync -- github_down
```
