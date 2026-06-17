# Karpathy-Style Wiki/RAG ERP Contract v0

## Purpose

This contract fixes the owner decision for the dev-ERP knowledge layer:
Soulforge should not install a Karpathy LLM runtime for the ERP knowledge/RAG
use case. The ERP should consume a Karpathy-style sourcebound wiki/RAG ledger as
a metadata shell, while the actual response model remains an approved local or
adapter-backed LLM runtime such as Ollama.

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

## Runtime Decision

The approved default decision is:

- `karpathy_llm_runtime_required: false`
- `karpathy_reference_role: wiki_operating_pattern_only`
- `preferred_runtime_surface: ollama_or_configured_llm_adapter`

The ERP may use Ollama, Codex CLI, or another approved adapter for expression
over retrieved evidence. That model layer must stay behind the existing
`src/llm.mjs` adapter and may not turn the wiki ledger into source truth.

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
6. Let dev-ERP read only metadata shell endpoints.
7. Promote to public canon only through explicit owner decision and
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
