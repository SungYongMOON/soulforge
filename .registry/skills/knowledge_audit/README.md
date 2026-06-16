# .registry/skills/knowledge_audit

- `knowledge_audit/skill.yaml` is the canonical Soulforge skill entry for
  invoking `.workflow/knowledge_source_audit_v0` from Codex.
- `codex/` is the Codex bridge that materializes to
  `~/.codex/skills/soulforge-knowledge-audit/` through the repository skill
  sync script.
- The launcher reads the workflow package and workflow-owned profile policy at
  execution time. It does not copy workflow bodies, optimizer results, private
  reports, source payloads, or runtime bindings into the skill.

```powershell
npm.cmd run skills:sync -- knowledge_audit
```
