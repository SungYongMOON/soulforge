---
name: soulforge-knowledge-wiki-cell-launcher
description: "Use when Codex should route Soulforge knowledge wiki, LLM wiki, Karpathy-style sourcebound wikiization, NotebookLM bookshelf/source packet preparation, or knowledge_wiki_cell party work through the existing Knowledge Wiki Cell party."
---

# Soulforge Knowledge Wiki Cell Launcher

Use this skill to launch the existing `.party/knowledge_wiki_cell` route.

The skill is a thin bridge. It does not own the party, workflow chain, profile policy, source truth, archive authority, NotebookLM answers, Obsidian exports, review acceptance, or local runtime bindings.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.party/knowledge_wiki_cell/party.yaml` and `.party/knowledge_wiki_cell/allowed_workflows.yaml`.
3. Confirm the selected workflow ids exist in `.workflow/index.yaml`.
4. Read `.workflow/knowledge_wiki_pipeline_v0/workflow.yaml` and `profile_policy.yaml` first, then read any downstream workflow `workflow.yaml` and `profile_policy.yaml` needed for the request.
5. Treat workflow-owned profile policy as execution hints for model, reasoning effort, species, and class. Do not copy those values into a new runtime binding.
6. Insert `source_packet_sufficiency_review_v0` when source support or claim ceiling is unclear.
7. Insert `owner_decision_packet_v0` when approval, promotion, archive/retire, source approval, or default-route authority is needed.
8. Insert the optional LLM wiki stack routes (`workflow_knowledge_preflight_v0`, `monster_knowledge_preflight_v0`, `knowledge_candidate_triage_v0`, `wiki_curation_maintenance_v0`, or `llm_wiki_builder_v0`) when the request needs query-first project wiki use, candidate triage, curation, or bounded end-to-end LLM wiki orchestration.
9. Prepare a metadata-only `rag_metadata_refresh_v0` handoff when wiki/sourcebound metadata changes should refresh RAG manifests, graph lenses, metadata indexes, or retrieval smoke outputs.
10. Insert `rag_source_text_quality_review_v0` or `rag_work_card_router_v0` only when approved source-text lane refs already exist and the request needs support-trace quality review or deterministic work-card routing.
11. Close bounded work through `post_development_review_gate_v0` when the task changes Soulforge files, produces a promotion candidate, or reports a completed development result.

## Boundary Rules

- Do not create, rename, or default-route a party from this launcher alone.
- Do not treat Drive storage, NotebookLM notebooks, advisory tool output, Obsidian views, or generated wiki projections as source truth.
- Do not run RAG refresh steps inside this launcher or the wiki party. The launcher may point to `rag_metadata_refresh_v0`, but that workflow owns refresh execution and validation.
- Do not copy raw source text, private packets, NotebookLM answers, Drive payloads, secrets, credentials, runtime absolute paths, or project-local run truth into public tracked files.
- Do not treat a RAG refresh handoff as source-text retrieval approval, BM25/vector index-build approval, NotebookLM packet membership, public canon promotion, ontology acceptance, owner approval, default-route authority, or answer authority.
- Do not treat RAG quality review or work-card routing as source truth, answer authority, project execution authority, owner approval, default-route authority, or public canon promotion.
- Keep source truth in source packets or owner-held files, private derivative projections in private evidence, and public promotion behind owner decision plus review.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need the launcher mapping, allowed workflow set, profile resolve rule, output shape, or validation checklist.
