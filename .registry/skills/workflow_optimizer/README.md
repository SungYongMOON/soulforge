# .registry/skills/workflow_optimizer

- `workflow_optimizer/skill.yaml` is the canonical Soulforge skill entry for incumbent-controlled model migration validation and staged workflow execution profile search.
- The Codex-facing bridge lives in `codex/SKILL.md`, with detailed run contracts under `codex/references/`.
- Model availability or pricing changes default to runner-verified `migration_validation`; broader or exhaustive search is not implied by a visible model catalog.
- Other PCs can materialize the installed Codex skill mirror with:

```bash
npm run skills:sync -- workflow_optimizer
```

- Bootstrap flows can also pick it up with:

```bash
npm run skills:sync -- --all
```

- Runtime calibration artifacts belong under the target workflow, not under this skill package.
- Existing calibration archives are historical evidence and remain immutable; later validations create a new archive entry.
