---
name: soulforge-party-launcher-skill-author
description: "Use when the user asks to turn an existing Soulforge party into a Codex-callable thin launcher skill. Also use for Korean requests such as \"파티를 스킬로 만들어줘\", \"파티스킬로 만들어줘\", \"파티 제작 스킬\", or \"/로 호출하게 해줘\"."
---

# Soulforge Party Launcher Skill Author

Use this skill to create a thin Codex launcher skill for an existing Soulforge party.

The launcher is a bridge, not the owner of the party, workflow chain, profile policy, runtime paths, or project payloads.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Identify the target `party_id`. If it is unclear, inspect `.party/index.yaml` and ask only when the target still cannot be inferred.
3. Read `.party/<party_id>/party.yaml` and `allowed_workflows.yaml`.
4. Verify every referenced workflow exists in `.workflow/index.yaml`; read each target `workflow.yaml` and `profile_policy.yaml` before designing the launcher.
5. Choose the launcher skill id from the user's requested name, or default to `<party_id>_launcher`.
6. Create `.registry/skills/<launcher_skill_id>/skill.yaml` plus a Codex bridge under `codex/SKILL.md`, `codex/agents/openai.yaml`, and `codex/references/mapping.md`.
7. In the generated launcher, instruct future agents to resolve party chain and workflow-owned `profile_policy.yaml` at execution time. Do not copy optimizer profile values into the launcher.
8. Update `.registry/skills/README.md` and `CHANGELOG.md` when the launcher is added to the public tracked repo.
9. Run skill validation, `npm.cmd run skills:sync -- <launcher_skill_id>`, and the relevant Soulforge validators before claiming the launcher is ready.

## Boundary Rules

- Do not invent a party in this skill unless the user explicitly expands the task to party authoring.
- Do not switch a default route or grant unattended automation authority.
- Do not copy workflow step graphs, optimizer outputs, raw project files, runtime absolute paths, secrets, or private evidence into the launcher skill.
- Keep `codex/SKILL.md` lean; place mapping and output details in `codex/references/mapping.md`.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when generating the launcher package shape, Codex app metadata, output report, or validation checklist.
