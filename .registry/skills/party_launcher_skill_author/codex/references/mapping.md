# Party Launcher Skill Author Mapping

## Soulforge Mapping

- Canon skill id: `party_launcher_skill_author`
- Installed Codex skill name after sync: `soulforge-party-launcher-skill-author`
- Canon linkage: `.registry/skills/party_launcher_skill_author/skill.yaml`
- UI metadata: `codex/agents/openai.yaml`
- Source owner for party chains: `.party/<party_id>/`
- Source owner for workflow procedures and optimized execution profiles: `.workflow/<workflow_id>/`
- Source owner for local runtime bindings: `_workmeta/<project_code>/bindings/**`

## Codex App Rules

- The installed global skill mirror is generated from `.registry/skills/party_launcher_skill_author/codex/`.
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

Use the default generated launcher id `<party_id>_launcher` unless the user provides a better explicit name. Keep ids lowercase snake_case in `.registry/skills`; the installed mirror becomes `soulforge-<launcher-skill-id-with-hyphens>`.

## Generated Launcher Behavior

The launcher skill should:

1. Read the Soulforge execution contract.
2. Read `.party/<party_id>/party.yaml` and `allowed_workflows.yaml`.
3. Resolve the selected workflow chain, default workflow, and optional workflows.
4. Read each target workflow's `workflow.yaml` and `profile_policy.yaml`.
5. Use workflow-owned profile recommendations as execution hints when available.
6. Report any missing profile, unsupported runtime capability, or unresolved party/workflow reference as a blocker or fallback.
7. Keep owner decisions, default-route switches, project mutation authority, and review acceptance outside the launcher.

## Generated Launcher Non-Claims

The launcher does not claim:

- The party is newly authorized or default-routed.
- A workflow is production-ready unless the workflow package and review evidence already support that label.
- Optimizer outputs are copied into the skill.
- Species, class, model, or reasoning choices are enforced by Codex runtime beyond the available execution bindings and explicit run setup.
- Project-local payloads or private evidence are safe to store in public tracked skill files.

## Output Shape

Report:

- `Target party: <party_id>`
- `Launcher skill: <launcher_skill_id>`
- `Workflow chain checked: <workflow ids>`
- `Profile resolve rule: workflow-owned profile_policy.yaml at execution time`
- `Installed mirror: soulforge-<launcher-skill-id-with-hyphens>` when sync ran
- `Validators: ...`
- `Remaining blockers: ...`
