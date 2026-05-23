# .registry/skills/grill_me

- `grill_me/skill.yaml` is the canonical candidate skill entry for pressure-testing a plan through a focused decision interview.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-grill-me/` through the repository skill sync script.
- The skill asks one question at a time, records owner decisions, and keeps final design authority with the owner.
- The package does not copy Antigravity runtime content, local bindings, transcripts, private project payloads, or model/tool choices.

```bash
npm run skills:sync -- grill_me
```
