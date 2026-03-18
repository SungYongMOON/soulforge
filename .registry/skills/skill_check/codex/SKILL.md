---
name: soulforge-skill-check
description: Use when a Soulforge task needs to review or draft a skill package while keeping canon, executor bridge, and runtime binding ownership separated.
---

# Soulforge Skill Check

Review the skill package in owner order: `skill.yaml`, optional `codex/` bridge, then runtime boundary.

## Core rules

- Treat `skill.yaml` as the canon source of behavior and keep executor-neutral rules there.
- Allow `execution_requirements` to carry capability-level and hint-level guidance, including preferred MCP/tool hints, as long as they are not final runtime-bound values.
- Keep `codex/SKILL.md` lean; read [`references/mapping.md`](references/mapping.md) for mapping, output shape, and executor-specific notes.
- Keep `agents/openai.yaml` limited to UI metadata and dependency hints.
- If a missing value belongs to local runtime bindings, stop at the boundary and name that owner instead of materializing it in tracked files.

## Load on demand

- Read [`references/mapping.md`](references/mapping.md) for Soulforge mapping, canon linkage, and expected output shape.
