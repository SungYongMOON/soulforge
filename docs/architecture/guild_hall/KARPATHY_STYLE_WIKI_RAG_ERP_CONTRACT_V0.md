# Karpathy-Style Wiki/RAG ERP Contract v0

## Purpose

This contract fixes the owner decision for the dev-ERP knowledge layer:
Soulforge should not install or run a model inside the ERP knowledge surface.
The ERP consumes a Karpathy-style sourcebound wiki/RAG ledger as a metadata
shell. Model-backed answer generation is a separate RAG-session responsibility,
not an ERP responsibility.

In this document, "Karpathy-style" means a practical wiki discipline:
small stable pages, source-bound claims, provenance refs, explicit confidence
ceilings, and review before promotion. It does not mean `llm.c`, `nanoGPT`,
`minGPT`, `micrograd`, or `makemore` is installed or required.

## Layer Split

| Layer | Owner surface | Role |
| --- | --- | --- |
| Source warehouse | Google Drive, `_workspaces/knowledge/**`, or another owner-approved worksite | Holds original source files, HWPX exports, derived text, and source cards. |
| Private metadata and review | `_workmeta/<project_code>/**`, `_workmeta/system/**` | Holds source catalogs, blocker reports, review packets, and owner-decision evidence. No original source payloads. |
| Wiki and sourcebound projection | `.party/knowledge_wiki_cell`, `.workflow/knowledge_wiki_pipeline_v0`, `_workspaces/knowledge/**` | Builds private sourcebound wiki projections and source-card backed metadata. |
| RAG support | `guild_hall/rag/**`, `_workspaces/system/rag/**`, `_workspaces/knowledge/rag/**` | Metadata-only manifests by default; source-text lanes only after explicit source-card permission. |
| ERP shell | `ui-workspace/apps/dev-erp/**` | Reads metadata refs, ledgers, work cards, and route status. It does not own source truth. |
| Public canon | `.registry/knowledge/**`, `docs/architecture/**` | Public-safe abstractions only after owner decision and review. |

## ERP Contract

The dev-ERP knowledge shell may expose:

- knowledge spaces;
- wiki page refs;
- RAG route refs;
- RAG work-card refs;
- focused knowledge/RAG/access ledger refs;
- the current shell contract.

It must not expose:

- raw source bodies;
- chunks, excerpts, embeddings, BM25/vector payloads, or source-text answer
  bodies;
- NotebookLM answers or conversation payloads;
- secrets, credentials, cookies, sessions, account state, or local absolute
  runtime paths;
- broad `_workmeta/system/runs/**` dumps;
- unallowlisted workspace roots.

The shell endpoint for this contract is:

```text
GET /api/knowledge/shell/contract
```

The endpoint returns `dev_erp.knowledge_shell.v1`, `content_policy:
metadata_only`, `body_included: false`, and the same root-boundary posture used
by the other knowledge shell routes.

### Wiki Body Exception (2026-07-04 owner approved)

One approved exception to the metadata-only posture: ERP may serve **wiki
markdown page bodies** (the sanitized derivative pages, never source originals)
through the dedicated endpoint `GET /api/knowledge/wiki/page` with these
guards, all code-enforced in `src/knowledge_overview.mjs`:

- login required (team accounts only; anonymous gets 401);
- `.md` pages only, inside `_workspaces/knowledge/**/wiki/**` or
  `_workspaces/<project>/reference_payloads/knowledge_extract/**/wiki/**`;
- chunk/raw/body/secret name patterns and raw-body extensions stay blocked;
- size cap 512KB; scan/listing endpoints keep `body_included: false`.

Raw sources (HWP/PDF/DOCX/mail), chunks, indexes, and NotebookLM answer text
remain excluded from ERP responses.

## Runtime Decision

The owner decision effective 2026-07-23 is:

- `karpathy_llm_runtime_required: false`
- `karpathy_reference_role: wiki_operating_pattern_only`
- `erp_model_enabled: false`
- `erp_chat_provider: stub`
- `erp_intake_provider: none`
- `erp_may_trigger_rag_generation: false`
- `rag_generation_runtime: ollama_loopback_only`
- `rag_generation_model: qwen3.5:9b`
- `rag_model_load_policy: on_demand_session`
- `rag_model_keep_alive: 5m`
- `rag_session_close_unload: ollama_stop`
- `rag_background_preload: false`

The Ollama daemon may remain running on `127.0.0.1:11434` while no model is
resident. The first generation request in an authorized RAG session loads
`qwen3.5:9b` into GPU memory. Requests set `keep_alive: 5m`; closing the RAG
session runs `ollama stop qwen3.5:9b`, while the idle timeout is the fallback
unload path. No ERP launcher, endpoint, completion hook, split suggestion, or
mail-intake cycle may load the model.

The dormant ERP adapter code may remain for isolated compatibility tests, but
operational ERP provider selection is fail-closed in code. Re-enabling any ERP
model path requires a new owner decision, a scoped code change, and review; an
environment-variable override alone is insufficient.

## Source-To-ERP Flow

1. Put originals in an owner-approved source warehouse or `_workspaces/knowledge`
   worksite.
2. Normalize HWP to HWPX before reading; keep original payloads out of
   `_workmeta`.
3. Create source cards, derived text, source-sync-ready manifests, and indexes
   only when the source card grants the needed permission.
4. Run the Knowledge Wiki Cell route for sourcebound wiki projection:
   `.party/knowledge_wiki_cell` -> `.workflow/knowledge_wiki_pipeline_v0`.
5. Prepare metadata-only `rag_metadata_refresh_v0` handoffs when wiki or
   sourcebound metadata changes affect retrieval.
6. Run any model-backed answer generation only in the separate, authorized RAG
   session runtime. Keep evidence refs and the weakest applicable claim ceiling.
7. Let dev-ERP read only metadata shell endpoints and non-model search/fallback
   responses; it does not start or call the RAG generation runtime.
8. Promote to public canon only through explicit owner decision and
   post-development review.

## Non-Claims

This contract does not grant:

- source truth approval;
- source-text retrieval permission;
- index-build permission;
- NotebookLM packet membership;
- Google Drive upload authority;
- public canon promotion;
- ontology acceptance;
- default-route changes;
- answer authority.
- ERP model activation or ERP-to-RAG generation calls.

Each stronger permission needs its own source card, owner decision, workflow
packet, and review evidence.

## Validation

The current code guard is covered by dev-ERP tests:

```bash
npm.cmd --prefix ui-workspace/apps/dev-erp test
```

The relevant implementation surface is:

- `ui-workspace/apps/dev-erp/src/knowledge_shell.mjs`
- `ui-workspace/apps/dev-erp/server.mjs`
- `ui-workspace/apps/dev-erp/test/core.test.mjs`
- `ui-workspace/apps/dev-erp/docs/CHATBOT_LLM_SETUP.md`

For broader RAG boundary validation, use:

```bash
npm.cmd run validate:rag
npm.cmd run validate:knowledge-access
```
