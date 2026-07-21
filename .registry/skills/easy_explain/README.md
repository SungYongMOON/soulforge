# .registry/skills/easy_explain

- `easy_explain/skill.yaml` is the canonical Soulforge candidate for turning long or complex work into an easy, visual, structurally complete explanation.
- `codex/` is the Codex bridge that materializes to the local `soulforge-easy-explain` installed mirror through the repository skill sync script.
- The skill explains current evidence without inheriting authority to rerun or mutate the underlying task.
- Detailed visual selection, completeness, color, and boundary rules live in `codex/references/mapping.md`.

```bash
npm run skills:sync -- easy_explain
```
