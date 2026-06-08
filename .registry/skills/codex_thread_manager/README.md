# .registry/skills/codex_thread_manager

- `codex_thread_manager/skill.yaml` is the canonical Soulforge skill entry for
  actual Codex manager, worker, and worktree thread orchestration requests.
- `codex/` is the Codex wrapper that materializes to
  `~/.codex/skills/soulforge-codex-thread-manager/` through the repository skill
  sync script.
- The skill is an explicit launcher for `.workflow/codex_thread_manager_v0/`,
  not a `.party` binding or default route.

```bash
npm run skills:sync -- codex_thread_manager
```
