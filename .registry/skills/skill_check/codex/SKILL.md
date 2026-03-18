---
name: soulforge-skill-check
description: Use when a Soulforge task needs to review or draft a skill package without crossing canon, executor bridge, and runtime binding boundaries.
---

# Soulforge Skill Check

Use this skill when the current task is validating or drafting a Soulforge skill package.

## Core rules

- Start the final answer with `Applied skill: soulforge-skill-check`.
- Inspect `skill.yaml` first, then the optional `codex/` bridge, and keep local runtime binding concerns out of tracked edits.
- If canon and bridge diverge, fix the smallest layer that owns the mismatch instead of duplicating the same rule in both places.
- If the missing data belongs to local `.project_agent/bindings/`, stop at the boundary and state that owner explicitly.

## Load on demand

- For Soulforge mapping, canon linkage, and output shape, read [`references/mapping.md`](references/mapping.md).
