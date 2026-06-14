# .registry/skills/knowledge_wiki_cell_launcher

- `knowledge_wiki_cell_launcher/skill.yaml` is the canonical Soulforge skill entry for invoking the existing Knowledge Wiki Cell party from Codex.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-knowledge-wiki-cell-launcher/` through the repository skill sync script.
- The launcher routes to `.party/knowledge_wiki_cell/` and workflow-owned `profile_policy.yaml` files instead of copying party chains, workflow bodies, optimizer results, source payloads, or runtime bindings into the skill.
- When wiki/sourcebound metadata changes should refresh RAG visibility, the launcher prepares only a metadata-only handoff to `rag_metadata_refresh_v0`; when approved source-text lane refs already exist, it may route to `rag_source_text_quality_review_v0` or `rag_work_card_router_v0` for support-trace review or work-card preparation. It does not own source-text indexing, NotebookLM mutation, public canon promotion, project execution authority, or answer authority.

```powershell
npm.cmd run skills:sync -- knowledge_wiki_cell_launcher
```
