# .registry/skills/external_gpt

- `external_gpt/skill.yaml` is the canonical Soulforge skill entry for invoking the registered external GPT advisory workflow.
- `codex/` is the Codex wrapper that materializes to `~/.codex/skills/soulforge-external-gpt/` through the repository skill sync script.

Sync example:

```bash
npm run skills:sync -- external_gpt
```
