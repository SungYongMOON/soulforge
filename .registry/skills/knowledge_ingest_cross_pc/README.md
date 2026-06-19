# .registry/skills/knowledge_ingest_cross_pc

- `knowledge_ingest_cross_pc/skill.yaml` is the canonical Soulforge skill entry
  for running cross-PC knowledge ingest side sessions.
- `codex/` is the Codex bridge that materializes to
  `~/.codex/skills/soulforge-knowledge-ingest-cross-pc/` through the repository
  skill sync script.
- The skill is a wrapper around the registered Knowledge Ingest Cell and
  `knowledge_ingest_pipeline_v0`; it adds start/end Git sync, receipt capture,
  missing-audit generation, and `_workmeta` push discipline.
- It does not grant source truth, upload, NotebookLM, RAG index-build, public
  canon promotion, default-route, or owner approval authority.

```powershell
npm.cmd run skills:sync -- knowledge_ingest_cross_pc
```
