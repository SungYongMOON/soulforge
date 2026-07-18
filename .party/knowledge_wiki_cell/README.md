# Knowledge Wiki Cell

`knowledge_wiki_cell` is the reusable party for the Karpathy-style wikiization path.

The party default entry is `knowledge_wiki_pipeline_v0`. That composite links
these downstream workflows:

1. `official_source_packet_collect_v0`
2. `sourcebound_knowledge_packet_operating_loop_v0`
3. `knowledge_access_event_capture_v0`
4. optional `rag_metadata_refresh_v0` handoff when metadata refresh is needed
5. `post_development_review_gate_v0`

In plain language: first gather and approve source refs, then make a private
sourcebound wiki projection, then record metadata-only usage signals, optionally
prepare a RAG metadata refresh handoff, then close the work through the review
gate.

Optional pre-handoff or review routes include `dual_deep_research_v0`,
`workflow_knowledge_preflight_v0`, `monster_knowledge_preflight_v0`,
`knowledge_candidate_triage_v0`, `wiki_curation_maintenance_v0`,
`llm_wiki_builder_v0`, `source_packet_sufficiency_review_v0`,
`owner_decision_packet_v0`, `rag_metadata_refresh_v0`,
`rag_source_text_quality_review_v0`, and `rag_work_card_router_v0`.
`dual_deep_research_v0` owns only the NotebookLM CLI plus Codex direct
research comparison slice before sourcebound or wiki registration.
`rag_metadata_refresh_v0` is a downstream metadata refresh route after wiki or
sourcebound metadata changes; it owns RAG artifact refresh, while this party only
prepares the handoff.
The LLM wiki stack routes handle query-first project wiki use, candidate
triage, curation, and bounded end-to-end orchestration. The RAG source-text
routes handle support-trace quality review and deterministic work-card routing
after approved source-text lane artifacts already exist.

Google Drive or another owner-held archive can sit around that chain as the file
archive: incoming candidate files go to an inbox/candidate manifest and working
packets get archive refs later. An approved Google Drive ontology release is a
narrow package-level canon exception only when it passes
`ONTOLOGY_CANON_OPERATING_POLICY_V0.md`; ordinary storage still is not approval.

Drive and NotebookLM placement follows
`docs/architecture/guild_hall/KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md`:
Google Drive is the source warehouse and qualified ontology package canon,
NotebookLM notebooks are advisory query bookshelves, and `_workmeta` is the
metadata-only catalog. Drive manifests or shortcuts do not replace original
source truth.

This party does not own the inner steps of those workflows and does not choose the best model, reasoning effort, species, class, or unit. Those choices stay with each workflow's profile and calibration files.

When the wiki/sourcebound chain changes metadata that should affect RAG
discoverability, the safe handoff is a `rag_refresh_handoff_decision` with
metadata refs and stronger permissions set to false. The party does not read
source text, build BM25/vector indexes, add NotebookLM packets, promote public
canon, or claim answer authority.

Each workflow stage in a real run should be executed by a fresh subagent and should write private evidence under `_workmeta/<project_code>/runs/<run_id>/` or `_workmeta/system/runs/<run_id>/`.

ZIP files are not retained as source truth. Use extracted files, inventories, source packet refs, and gap reports instead.

When archive policy declares `codex_skill_auto_sync`, approved Codex skills or
the Google Drive connector may upload/sync bounded archive files without
per-file owner confirmation. The party must still preserve the distinction
between `inbox`, `candidate_source`, `working_packet`, `reviewed_private`,
`canon_package`, and `obsolete_or_blocked`, and sync authority must not become
canon or source authority.

Obsidian is not part of the authority chain. If an Obsidian view is requested,
the safe route is a generated read-only export over canon-backed
`.registry/knowledge` entries or approved canon packages only. `_workmeta`
projection payloads, NotebookLM answers, Drive candidate files, and owner
decision notes that were not promoted must stay out of the vault body.

## Draft Routing Surface

The current routable default is now `knowledge_wiki_pipeline_v0`.

That composite workflow still routes through the registered stage lane:

1. `official_source_packet_collect_v0`
2. `sourcebound_knowledge_packet_operating_loop_v0`
3. `knowledge_access_event_capture_v0`
4. optional `rag_metadata_refresh_v0` handoff when metadata refresh is needed
5. `post_development_review_gate_v0`

A request-classification note now lives at `routing_rules.yaml`. It keeps:

- `knowledge_wiki_cell` as the current registered route,
- `knowledge_wiki_pipeline_v0` as the registered composite entry,
- the older stage-first description preserved as the downstream chain the composite still owns,
- the registered LLM wiki stack as optional query-first support routes,
- and the registered RAG source-text review/work-card workflows as optional support routes that remain below source truth, answer authority, and default-route safety.
