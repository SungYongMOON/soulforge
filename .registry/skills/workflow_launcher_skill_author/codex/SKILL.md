---
name: soulforge-workflow-launcher-skill-author
description: Use when the user asks to turn an existing Soulforge workflow into a Codex-callable thin launcher skill. Also use for Korean requests such as "워크플로우를 스킬로 만들어줘", "워크플로우를 /스킬처럼 호출하게 해줘", "workflow launcher skill author", or requests to make a workflow callable like `$soulforge-...` while preserving workflow/profile/runtime boundaries.
---

# Soulforge Workflow Launcher Skill Author

Use this skill to create a thin Codex launcher skill for an existing Soulforge workflow.

The launcher is a bridge, not the owner of the workflow body, step graph, profile policy, runtime paths, owner approvals, or project payloads.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Identify the target `workflow_id`. If it is unclear, inspect `.workflow/index.yaml` and ask only when the target still cannot be inferred.
3. Verify the workflow exists in `.workflow/index.yaml`.
4. Read `.workflow/<workflow_id>/workflow.yaml`, `step_graph.yaml` when present, and `profile_policy.yaml` before designing the launcher.
5. Choose the launcher skill id from the user's requested name. If absent, default to the workflow id without a trailing `_vN` version suffix, and append `_launcher` only if needed to avoid ambiguity or collision.
6. Create `.registry/skills/<launcher_skill_id>/skill.yaml` plus a Codex bridge under `codex/SKILL.md`, `codex/agents/openai.yaml`, and `codex/references/mapping.md`.
7. In the generated launcher, instruct future agents to resolve the workflow package and workflow-owned `profile_policy.yaml` at execution time. Do not copy optimizer profile values into the launcher.
8. Update `.registry/skills/README.md` and `CHANGELOG.md` when the launcher is added to the public tracked repo.
9. Run skill validation, `npm.cmd run skills:sync -- <launcher_skill_id>`, and relevant Soulforge validators before claiming the launcher is ready.

## Boundary Rules

- Do not invent a workflow in this skill unless the user explicitly expands the task to workflow authoring.
- Do not register a workflow, switch a default route, or grant unattended automation authority from the launcher task alone.
- Do not copy workflow step graphs, optimizer outputs, raw project files, runtime absolute paths, secrets, private evidence, or run truth into the launcher skill.
- Keep `codex/SKILL.md` lean; place mapping and output details in `codex/references/mapping.md`.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when generating the launcher package shape, Codex app metadata, output report, or validation checklist.
