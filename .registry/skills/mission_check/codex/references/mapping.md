# Mission Check Mapping

## Soulforge mapping

- Canon skill id: `mission_check`
- Typical operating lane: guild-master or administrator readiness review
- Canon linkage: `.registry/skills/mission_check/skill.yaml`
- Typical tracked owner surfaces: `.mission/<mission_id>/mission.yaml`, `.mission/<mission_id>/readiness.yaml`, `.mission/<mission_id>/resolved_plan.yaml`
- UI metadata: `codex/agents/openai.yaml`

## Output shape

- `Applied skill: soulforge-mission-check`
- `Mission readiness: pass|blocked|revise`
- `Blocking owner: ...`
- `Safest next step: ...`

## Boundary note

- Keep `skill.yaml` canon-only and keep `codex/SKILL.md` lean by putting detailed mapping here.
- Treat readiness review as a mission-surface check, not a place to materialize actual runtime binding payloads.
- Actual model choice, attached skill package, MCP/tool set, install path, and raw run truth remain local runtime concerns.
