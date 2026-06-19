---
name: soulforge-knowledge-ingest-cell-launcher
description: "Use when Codex should route Soulforge knowledge ingest work through the existing Knowledge Ingest Cell party, including optional copy-only preprocessing, source audit, wiki/RAG preparation, owner decision gates, and closeout review."
---

# Soulforge Knowledge Ingest Cell Launcher

Use this skill to launch the existing `.party/knowledge_ingest_cell` route.

The skill is a thin bridge. It does not own the party, workflow chain, profile
policy, password handling, source truth, Drive or NotebookLM upload, RAG index
build, public canon promotion, review acceptance, project mutation, or local
runtime bindings.

## Operating Steps

1. Read `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`.
2. Read `.party/knowledge_ingest_cell/party.yaml` and `.party/knowledge_ingest_cell/allowed_workflows.yaml`.
3. Confirm the selected workflow ids exist in `.workflow/index.yaml`.
4. Read `.workflow/knowledge_ingest_pipeline_v0/workflow.yaml` and `profile_policy.yaml` first, then read any downstream workflow `workflow.yaml` and `profile_policy.yaml` needed for the request.
5. Treat workflow-owned profile policy as execution hints for model, reasoning effort, species, and class. Do not copy those values into a new runtime binding.
6. Use `project_password_unlock_copy_only_v0` only when the request supplies an existing unlocked output manifest or explicit owner approval for copy-only preprocessing.
7. Use `knowledge_source_audit_v0` for read-only source/storage audit and owner decision queues.
8. Use `knowledge_wiki_pipeline_v0` for wiki/RAG preparation below source truth, public promotion, and index-build authority.
9. Insert `source_packet_sufficiency_review_v0` when evidence coverage or allowed claim ceiling is unclear.
10. Insert `owner_decision_packet_v0` before Drive upload, NotebookLM placement, public canon promotion, source-text extraction, index build, replacement, migration, controlled/internal source handling, or default-route authority.
11. Prepare only a metadata-only `rag_metadata_refresh_v0` handoff when wiki/sourcebound metadata changes should refresh RAG metadata surfaces.
12. Insert `rag_source_text_quality_review_v0` or `rag_work_card_router_v0` only when approved source-text lane refs already exist and the request needs support-trace quality review or deterministic work-card routing.
13. Before closeout, write or update a metadata-only knowledge ingest receipt and missing-audit view through `guild_hall/knowledge_access` when the request created, advanced, blocked, or reviewed a knowledge candidate. The receipt belongs under `_workmeta/**/knowledge_ingest_receipts/**`; it must show candidate/source/wiki/RAG/canon layer status without copying raw payload.
14. Close bounded development, registration, promotion-candidate, or completed workflow work through `post_development_review_gate_v0`.

## Boundary Rules

- Do not create, rename, or default-route a party from this launcher alone.
- Do not treat the party as default-route-safe or unattended automation.
- Do not guess, generate, brute-force, print, store, summarize, or send password values to an LLM.
- Do not mutate original files, replace project source-of-record files, or migrate unlocked outputs without a separate owner-approved downstream route.
- Do not upload to Drive or NotebookLM, mutate external services, promote public canon, extract source text, build BM25/vector indexes, or claim answer authority from this launcher alone.
- Do not copy raw source text, private packets, NotebookLM answers, Drive payloads, password candidate values, secrets, credentials, runtime absolute paths, or project-local run truth into public tracked files.
- Keep source truth in source packets or owner-held files, unlocked output manifests as input pointers only, private derivative projections in private evidence, and public promotion behind owner decision plus review.
- Receipt and missing-audit rows are recovery metadata only. They do not grant Drive upload, NotebookLM placement, source-text extraction, index build, public canon promotion, ontology acceptance, owner approval, or answer authority.

## Load On Demand

Read [`references/mapping.md`](references/mapping.md) when you need the launcher mapping, allowed workflow set, profile resolve rule, output shape, or validation checklist.
