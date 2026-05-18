# .registry/skills/workflow_check

- `workflow_check/skill.yaml` is the canonical Soulforge skill entry for reviewing workflow, party, router, registration, and default-route posture.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-workflow-check/` through the repository skill sync script.
- The skill is a checker and closeout wrapper. It does not authorize workflow registration or default-route switches by itself.

Sync this skill on another PC with:

```powershell
npm run skills:sync -- workflow_check
```

Bootstrap flows can also pick it up with:

```powershell
npm run skills:sync -- --all
```
