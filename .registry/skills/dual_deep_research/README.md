# .registry/skills/dual_deep_research

- `dual_deep_research/skill.yaml` is the canonical active skill entry for launching `.workflow/dual_deep_research_v0`.
- `codex/` is the Codex wrapper that materializes to `~/.codex/skills/soulforge-dual-deep-research/` through the repository skill sync script.
- The workflow owns the NotebookLM CLI-first Deep Research, Codex independent research, comparison, and delta handoff sequence.
- The workflow `profile_policy.yaml` owns the calibrated execution profile; the launcher reads it at execution time instead of copying optimizer outputs.
- If this lane exposes a downstream or adjacent workflow creation/evolution need, the launcher routes that separate work through `$soulforge-workflow-generator` and requires `$soulforge-workflow-check` before any completion or readiness claim.
- The skill package does not own Drive upload, NotebookLM bookshelf registration, wiki promotion, source truth, owner approval, or canon promotion.

```powershell
npm.cmd run skills:sync -- dual_deep_research
```
