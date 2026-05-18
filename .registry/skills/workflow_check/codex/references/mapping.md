# Workflow Check Mapping

## Soulforge Mapping

- Canon skill id: `workflow_check`
- Canon linkage: `.registry/skills/workflow_check/skill.yaml`
- Installed Codex skill: `soulforge-workflow-check`
- Typical operating lane: workflow, party, router, registration, and default-route closeout review

## Output Shape

- `Applied skill: soulforge-workflow-check`
- What was checked
- Validators run and any override used
- Registration/default-route result
- Strongest supported workflow status label
- `default-route-safe: yes|no|blocked`
- Remaining blockers or required next action

## Boundary Note

- Keep `skill.yaml` as the executor-neutral canon source.
- Keep `codex/SKILL.md` focused on runtime procedure and this file focused on mapping/output details.
- Registration, default-route changes, model choice, subagent availability, MCP/tool set, and local install paths remain outside this skill's authority unless an owner surface grants them separately.
