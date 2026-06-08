# Dual Deep Research v0

`dual_deep_research_v0` owns the research comparison slice:

1. declare the goal, success conditions, stop conditions, allowed inputs, and downstream limits before material work starts;
2. freeze a bounded research brief;
3. prepare fresh subagent stages with bounded visible inputs;
4. run NotebookLM Deep Research through the repo-defined CLI-first `nlm` path in a fresh NotebookLM operator stage;
5. run Codex direct source research independently in a separate fresh researcher stage;
6. optionally run Gemini or GPT web Deep Research from the same frozen brief as external advisory lanes, without showing them NotebookLM or Codex findings first;
7. compare all completed outputs in a fresh comparison stage into common, one-sided, conflict, and gap buckets;
8. hand off only the useful delta and unresolved gaps to `knowledge_wiki_cell` through `knowledge_wiki_pipeline_v0`.

The workflow records the existing NotebookLM CLI operating contract directly so future agents do not re-investigate basic CLI availability or command names every time. The public setup reference is `docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md`; private operating evidence remains in `_workmeta/system/reports/procedure_capture/`.

If the research lane exposes a need to create or evolve a downstream or adjacent workflow, this workflow records that need and routes it out through `$soulforge-workflow-generator`. Any created or evolved workflow must then be reviewed through `$soulforge-workflow-check` before completion, readiness, registration, or promotion claims.

This workflow does not own Google Drive upload, NotebookLM packet-map mutation, Gemini or GPT account authentication, source truth, owner approval, ontology acceptance, wiki registration, or canon promotion. The downstream wiki party/workflow judges whether registration, source sufficiency review, owner decision, or no action is appropriate.
