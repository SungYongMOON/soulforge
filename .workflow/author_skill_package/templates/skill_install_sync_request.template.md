# Skill Install Sync Request

## Target

- `skill_id`:
- Installed mirror name:
- Source bridge path:

## Pre-Sync Checklist

- Boundary review passed:
- Resource bundle review passed:
- `codex/SKILL.md` present:
- `codex/references/` present if needed:
- `codex/agents/openai.yaml` present:

## Sync Command

```bash
ruby .registry/docs/operations/scripts/sync_codex_skill.rb <skill_id>
```

## Notes

- This request prepares local installed mirror sync only.
- Actual install path and local runtime state remain host-local.
- Runtime inputs that must stay local:
- Post-sync smoke check to run:
- Resource bundle expected in installed mirror:
