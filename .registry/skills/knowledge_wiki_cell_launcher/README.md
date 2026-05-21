# .registry/skills/knowledge_wiki_cell_launcher

- `knowledge_wiki_cell_launcher/skill.yaml` is the canonical Soulforge skill entry for invoking the existing Knowledge Wiki Cell party from Codex.
- `codex/` is the Codex bridge that materializes to `~/.codex/skills/soulforge-knowledge-wiki-cell-launcher/` through the repository skill sync script.
- The launcher routes to `.party/knowledge_wiki_cell/` and workflow-owned `profile_policy.yaml` files instead of copying party chains, workflow bodies, optimizer results, source payloads, or runtime bindings into the skill.

```powershell
npm.cmd run skills:sync -- knowledge_wiki_cell_launcher
```
