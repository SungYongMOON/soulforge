# RAG Source Text Quality Review v0

`rag_source_text_quality_review_v0` is a registered pilot-executed workflow for turning a
payload-free view of a source-text index, traceability sidecar, and answer-run
trace into page-level quality review packets.

The output uses `source_supported`, `manual_review`, or `blocked` for each page
or page-linked answer trace. It also records table, picture, OCR, and page
warnings using refs and labels only.

## Outputs

- `quality_review_scope_binding`
- `source_text_index_inventory`
- `traceability_sidecar_inventory`
- `answer_run_trace_inventory`
- `page_quality_review_packet`
- `boundary_review_note`

## Boundary

This workflow does not persist raw source text, source chunks, excerpts,
NotebookLM answers, answer payloads, secrets, credentials, or runtime absolute
paths. It does not construct the source-text index, grant owner approval,
promote canon, switch default routes, or make final answer-truth claims.

## Current Maturity

`output_state: pilot-executed`

The package is registered in `.workflow/index.yaml` for routing discovery and
remains not default-route-safe, canon-ready, production-ready, or
owner-approved.

A controlled DAPA fixture produced:

- `_workspaces/knowledge/rag/source_text_quality_reviews/dapa_test_eval_requirements_verification_quality_review_20260527/source_text_quality_review.json`

The `validate-source-text-quality-review` validator passed, and
`node --test guild_hall/rag/rag.test.mjs` passed after the CLI/test
implementation. The pilot status is `manual_review`: pages 39 and 120 are
source-supported, page 39 still carries a table warning, and pages 18, 19, and
121 remain manual-review pages because of picture warnings. The pilot recorded
0 weak-mapped chunks, 0 unmapped chunks, and 0 blocked pages.

History entry:

- `history/pilot_execution_20260527.yaml`
