# .registry/skills/long_thread_handoff

- `long_thread_handoff/skill.yaml` is the canonical Soulforge skill entry for long-thread contamination-free handoff requests.
- `codex/` is the Codex wrapper that materializes to `~/.codex/skills/soulforge-long-thread-handoff/` through the repository skill sync script.
- The skill is an explicit launcher, not a default route for every task.

```powershell
npm.cmd run skills:sync -- long_thread_handoff
```
