# .registry/skills/quick_explain

- `quick_explain/skill.yaml` is the canonical Soulforge candidate for status explanations bounded to 10 logical lines.
- `codex/` is the Codex bridge that materializes to the local `soulforge-quick-explain` installed mirror.
- The skill explains existing evidence only and does not inherit investigation or mutation authority.

```bash
npm run skills:sync -- quick_explain
```
