# .registry/skills/workflow_generator

- `workflow_generator/skill.yaml` is the canonical skill entry for source-bound workflow generation and evolution.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-workflow-generator/` through the repository skill sync script.
- The bridge preserves fresh executor/verifier separation, Codex goal declaration, run evidence logging, source-packet provenance, and oracle-boundary rules.
- Runtime outputs such as run roots, candidates, verdicts, source packets, and local artifact paths do not belong in this tracked package.
- Follow `.registry/docs/architecture/SKILL_CANON_BOUNDARY.md` and `.registry/docs/operations/SKILL_INSTALL_SYNC.md` when updating or installing this skill.
