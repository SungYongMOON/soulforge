# Workflow Launcher Skill Author Mapping

## Soulforge Mapping

- Canon skill id: `workflow_launcher_skill_author`
- Installed Codex skill name after sync: `soulforge-workflow-launcher-skill-author`
- Canon linkage: `.registry/skills/workflow_launcher_skill_author/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`
- Source owner for workflow procedures and optimized execution profiles: `.workflow/<workflow_id>/`
- Source owner for local runtime bindings: `_workmeta/<project_code>/bindings/**`

## Codex App Rules

- The installed global skill mirror is generated from `.registry/skills/workflow_launcher_skill_author/codex/`.
- The installed mirror must contain `SKILL.md` and may contain `agents/openai.yaml` plus `references/`.
- `SKILL.md` frontmatter must keep the trigger surface clear with `name` and `description`.
- `agents/openai.yaml` may include `display_name`, `short_description`, `default_prompt`, and dependency hints only.
- Do not place host-local absolute paths, secrets, project payloads, actual local install paths, or transient run truth in the tracked skill package.

## Generated Launcher Package Shape

Create a launcher package like this:

```text
.registry/skills/<launcher_skill_id>/
  skill.yaml
  README.md
  codex/
    SKILL.md
    agents/openai.yaml
    references/mapping.md
```

Choose the default generated launcher id by stripping a trailing version suffix from the workflow id:

- `outlook_mail_reconcile_v0` -> `outlook_mail_reconcile`
- `outbound_mail_authoring_v0` -> `outbound_mail_authoring`

If the default id collides or is too broad, append `_launcher` or use the explicit user-provided id. Keep ids lowercase snake_case in `.registry/skills`; the installed mirror becomes `soulforge-<launcher-skill-id-with-hyphens>`.

## Generated Launcher Behavior

The launcher skill should:

1. Read the Soulforge execution contract.
2. Resolve the human alias or skill invocation to the target `workflow_id`.
3. Read `.workflow/<workflow_id>/workflow.yaml`.
4. Read `step_graph.yaml` and `profile_policy.yaml` when present.
5. Read additional workflow-owned files only when the workflow or current request requires them, such as `handoff_rules.yaml`, `role_slots.yaml`, `monster_rules.yaml`, templates, or calibration notes.
6. Use workflow-owned profile recommendations as execution hints when available.
7. Report any missing profile, unsupported runtime capability, unresolved workflow reference, or missing owner approval as a blocker or fallback.
8. Keep owner decisions, default-route switches, project mutation authority, and review acceptance outside the launcher.

## Generated Launcher Non-Claims

The launcher does not claim:

- The workflow is newly authorized, registered, or default-routed.
- A workflow is production-ready unless the workflow package and review evidence already support that label.
- Optimizer outputs are copied into the skill.
- Species, class, model, reasoning effort, MCP, or tool choices are enforced by Codex runtime beyond the available execution bindings and explicit run setup.
- Project-local payloads or private evidence are safe to store in public tracked skill files.

## Output Shape

Report:

- `Target workflow: <workflow_id>`
- `Launcher skill: <launcher_skill_id>`
- `Workflow files checked: <file list>`
- `Profile resolve rule: workflow-owned profile_policy.yaml at execution time`
- `Installed mirror: soulforge-<launcher-skill-id-with-hyphens>` when sync ran
- `Validators: ...`
- `Remaining blockers: ...`

## Validation Checklist

- Target workflow exists in `.workflow/index.yaml`.
- Required workflow files were read before designing the launcher.
- Generated `skill.yaml` is executor-neutral and does not name local install paths or runtime truth.
- Generated `codex/SKILL.md` is lean and points to `codex/references/mapping.md` for details.
- Generated `codex/agents/openai.yaml` contains only UI metadata and dependency hints.
- The launcher does not copy workflow step graphs, optimizer outputs, project payloads, secrets, private evidence, or runtime absolute paths.
- `.registry/skills/README.md` and `CHANGELOG.md` are updated when the launcher is added to the public tracked repo.
- `npm.cmd run skills:sync -- <launcher_skill_id>` materializes the installed mirror before claiming it can be invoked by Codex.
