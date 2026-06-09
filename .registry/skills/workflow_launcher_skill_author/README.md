# .registry/skills/workflow_launcher_skill_author

- `workflow_launcher_skill_author/skill.yaml` is the canonical Soulforge skill entry for creating thin Codex launcher skills from existing `.workflow/<workflow_id>/` packages.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-workflow-launcher-skill-author/` through the repository skill sync script.
- The authoring aid keeps workflow bodies, step graphs, profile policies, optimizer outputs, project payloads, and runtime bindings under their original owners.

Install or refresh the local Codex mirror with:

```bash
npm.cmd run skills:sync -- workflow_launcher_skill_author
```
