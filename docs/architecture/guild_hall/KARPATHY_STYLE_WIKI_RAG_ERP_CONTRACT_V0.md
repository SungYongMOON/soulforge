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
| Source warehouse | `_workspaces/<project_code>/**` for project payload, `_workspaces/knowledge/**` for project-agnostic common payload, or another owner-approved worksite bound to the same view | Holds original source files, HWPX exports, derived text, and source cards without cross-project mixing. |
| Private metadata and review | `_workmeta/<project_code>/**`, `_workmeta/system/**` | Holds source catalogs, blocker reports, review packets, and owner-decision evidence. No original source payloads. |
| Wiki and sourcebound projection | `.party/knowledge_wiki_cell`, `.workflow/knowledge_wiki_pipeline_v0`, project-local Wiki roots, and the project-agnostic common owner | Builds thin sourcebound projections inside one exact project Knowledge View; common source bytes remain single-owner. |
| RAG support | `guild_hall/rag/**`, `_workspaces/system/rag/**`, project-local RAG roots, and common-only `_workspaces/knowledge/rag/**` | Metadata-only manifests by default; project-specific shared-root writes are HOLD until M2-1 enforces the project-root route. |
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

This endpoint is a legacy compatibility surface, not the M2 Knowledge View
authorization boundary. Common Wiki pages may continue under their existing
guards. Serving a project-specific Wiki body remains `HOLD` until the request is
bound to exactly one authorized project and foreign-project enumeration,
existence leakage, and link/root escape have deterministic negative tests.

## Runtime Decision

The 2026-07-23 local-RAG experiment recorded:

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

Those values are retained as historical compatibility data; they are not the
current M2 runtime. M2-0 through the frozen/manual M2-2 pilot are model-free,
and no generated-answer runner or model is selected or activated for M2. A
later advisory LLM requires a separate source-bound quality comparison,
data-egress decision, lifecycle contract, and Owner activation. The existence
of a Wiki, RAG index, or NotebookLM bookshelf does not trigger a model call.
No ERP launcher, endpoint, completion hook, split suggestion, or mail-intake
cycle may load a model.

The dormant ERP adapter code may remain for isolated compatibility tests, but
operational ERP provider selection is fail-closed in code. Re-enabling any ERP
model path requires a new owner decision, a scoped code change, and review; an
environment-variable override alone is insufficient.

## Source-To-ERP Flow

1. Put project originals in their owning project worksite and project-agnostic
   common originals in `_workspaces/knowledge`; never mix project payloads in
   the common owner.
2. Normalize HWP to HWPX before reading; keep original payloads out of
   `_workmeta`.
3. Create source cards, derived text, source-sync-ready manifests, and indexes
   only when the source card grants the needed permission.
4. Bind exactly one project plus an explicit allowlist of approved common
   revisions, then run the Knowledge Wiki Cell route for a thin sourcebound
   projection inside that Knowledge View:
   `.party/knowledge_wiki_cell` -> `.workflow/knowledge_wiki_pipeline_v0`.
5. Prepare metadata-only `rag_metadata_refresh_v0` handoffs when wiki or
   sourcebound metadata changes affect retrieval.
6. Keep M2 deterministic through the manual pilot. If a later Owner decision
   activates model-backed answer generation, run it only after the bounded
   Knowledge View and deterministic retrieval/Engine gates pass; keep evidence
   refs and the weakest applicable claim ceiling.
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
