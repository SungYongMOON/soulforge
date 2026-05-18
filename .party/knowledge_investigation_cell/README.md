# Knowledge Investigation Cell

`knowledge_investigation_cell` is the reusable party for query-first,
knowledge-heavy investigation work.

The default entry is `llm_wiki_builder_v0`. That workflow can delegate into:

1. `monster_knowledge_preflight_v0`
2. `knowledge_candidate_triage_v0`
3. optional `sourcebound_knowledge_packet_operating_loop_v0`
4. `wiki_curation_maintenance_v0`
5. `knowledge_access_event_capture_v0`
6. `post_development_review_gate_v0`

In plain language: ask the existing wiki and known packet surfaces first, triage
what kind of knowledge work this is, deepen with approved sources only when
needed, then route the reusable result into curation and closeout.

This party does not own workflow internals, source truth, owner approvals, or
NotebookLM authority. It owns the reusable investigation entry surface only.
