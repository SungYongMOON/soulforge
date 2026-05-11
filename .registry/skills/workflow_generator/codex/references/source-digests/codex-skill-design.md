# Digest: Codex Skill Design

Sources:

- https://developers.openai.com/codex/skills
- https://developers.openai.com/api/docs/guides/tools-skills
- `$CODEX_HOME/skills/.system/skill-creator/SKILL.md`

## Constraint Summary

- A skill is a directory centered on `SKILL.md`; scripts, references, assets, and `agents/openai.yaml` are optional support surfaces.
- `name` and `description` are required and are the first matching surface. The description must state scope, triggers, and boundaries clearly.
- Codex can invoke a skill explicitly with `$skill-name` or implicitly when the task matches the description.
- Use the built-in `skill-creator` workflow first for new or revised Codex skills.
- Keep `SKILL.md` lean. Move detailed guidance to `references/`; use `scripts/` for repeated deterministic work; use `assets/` for templates/resources.
- Validate the skill folder after edits.
- Direct local skill folders are appropriate for local authoring; wider distribution should use the repo/plugin path chosen by the project.

## Scale-Up Rules for B

- Improve B first through `description`, workflow clarity, and validation before adding files.
- Add a reference only when it reduces `SKILL.md` weight or makes optional context discoverable.
- Add a script only when repeated manual code would be fragile or inconsistent.
- Do not mix local-only runtime paths into general reusable skill instructions.
