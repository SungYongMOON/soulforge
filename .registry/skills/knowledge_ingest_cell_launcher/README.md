# .registry/skills/knowledge_ingest_cell_launcher

- `knowledge_ingest_cell_launcher/skill.yaml` is the canonical Soulforge skill entry for invoking the existing Knowledge Ingest Cell party from Codex.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-knowledge-ingest-cell-launcher/` through the repository skill sync script.
- The launcher routes to `.party/knowledge_ingest_cell/` and workflow-owned `profile_policy.yaml` files instead of copying party chains, workflow bodies, optimizer results, source payloads, password values, owner decisions, or runtime bindings into the skill.
- It keeps copy-only preprocessing, source audit, wiki/RAG preparation, owner decision gates, and closeout review connected while preserving `default_route_safe: false`.

```powershell
npm.cmd run skills:sync -- knowledge_ingest_cell_launcher
```
