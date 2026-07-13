# .registry/skills/long_thread_handoff

- `long_thread_handoff/skill.yaml` is the canonical Soulforge skill entry for long-thread contamination-free handoff requests.
- `codex/` is the Codex wrapper that materializes to `~/.codex/skills/soulforge-long-thread-handoff/` through the repository skill sync script.
- The skill is an explicit opt-in launcher for long-thread phase transitions, not a default route for every task.
- The current manager remains integration owner and uses fresh workers only for distinct substantive roles, in dependency order. In the current Codex collaboration runtime, fresh workers use `fork_turns="none"`; model/reasoning profiles are reported only when the runtime exposes them.
- Writer delegation requires a stable tree and non-overlapping ownership. `NIGHT_WORK_HANDOFF` requires an owner-approved exact path or reference, and Telegram is considered only when requested or covered by applicable standing authorization.

```powershell
npm.cmd run skills:sync -- long_thread_handoff
```
