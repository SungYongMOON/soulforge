# .registry/skills/workflow_optimizer

- `workflow_optimizer/skill.yaml` is the canonical Soulforge skill entry for workflow execution profile calibration.
- The Codex-facing bridge lives in `codex/SKILL.md`.
- Other PCs can materialize the installed Codex skill mirror with:

```bash
npm run skills:sync -- workflow_optimizer
```

- Bootstrap flows can also pick it up with:

```bash
npm run skills:sync -- --all
```

- Runtime calibration artifacts belong under the target workflow, not under this skill package.
