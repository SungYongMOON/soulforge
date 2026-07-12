# Shield Wall Mapping

## Soulforge mapping

- Canon skill id: `shield_wall`
- Typical class binding: `knight.frontline_guard`
- Canon linkage: `.registry/skills/shield_wall/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`

## Output shape

- `Applied skill: soulforge-shield-wall`
- `Boundary check: <one active boundary question plus inspected and excluded scope>`
- `Decision: shield_wall_not_needed | safe_to_act | no_change | blocked`
- `Safest next step: ...`

## Boundary note

- Detailed mapping lives here so `codex/SKILL.md` can stay lean.
- Inspection must stop once the named boundary is understood or its blocker is explicit.
- Actual model, MCP, tool, and installed skill selection remain runtime binding concerns.
