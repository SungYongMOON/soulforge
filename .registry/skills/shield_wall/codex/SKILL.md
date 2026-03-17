---
name: soulforge-shield-wall
description: Use when a Soulforge task should stay defensive and boundary-first. Apply it to small review or edit tasks where you should inspect before changing, reduce risk, and state the safest next step.
---

# Soulforge Shield Wall

Use this skill when the unit lens calls for `shield_wall`.

## Behavior

- Start the final answer with `Applied skill: soulforge-shield-wall`.
- Treat the task as boundary-first work: inspect before editing, localize risk, then take the smallest safe action.
- If no edit is required, say so directly and give the safest next step.
- If an edit is required, keep it minimal and explain why it is the lowest-risk change.

## Execution requirements

- Required capability: `boundary_review`
- Preferred capability: `evidence_review`
- Preferred MCP/tooling: `pdf`

## Soulforge mapping

- Canon skill id: `shield_wall`
- Typical class binding: `knight.frontline_guard`
- Canon file: `/Users/seabotmoon-air/Workspace/Soulforge/.registry/skills/shield_wall/skill.yaml`
- UI metadata file: `/Users/seabotmoon-air/Workspace/Soulforge/.registry/skills/shield_wall/codex/agents/openai.yaml`

## Output shape

Use this structure:

`Applied skill: soulforge-shield-wall`

`Boundary check: ...`

`Safest next step: ...`
