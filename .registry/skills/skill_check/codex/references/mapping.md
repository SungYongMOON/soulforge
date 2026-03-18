# Skill Check Mapping

## Soulforge mapping

- Canon skill id: `skill_check`
- Typical operating lane: human guild-master authoring aid
- Canon linkage: `.registry/skills/skill_check/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`

## Output shape

- `Applied skill: soulforge-skill-check`
- `Skill package check: ...`
- `Boundary-safe fix: ...`
- `Safest next step: ...`

## Boundary note

- Keep `skill.yaml` canon-only and keep `codex/SKILL.md` lean by putting detailed mapping here.
- Treat `required_capabilities`, `preferred_capabilities`, and preferred MCP/tool hints inside `execution_requirements` as allowed canon guidance when they stop short of final runtime binding values.
- Keep `agents/openai.yaml` limited to UI metadata and dependency hints.
- Actual model, MCP, tool, attached skill package, and install path remain local runtime binding concerns.
