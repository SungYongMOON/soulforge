# .registry/skills/post_development_review_gate

- `post_development_review_gate/skill.yaml` is the canonical Soulforge skill entry for invoking the registered post-development review gate workflow.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-post-development-review-gate/` through the repository skill sync script.

Sync command:

```powershell
npm run skills:sync -- post_development_review_gate
```
