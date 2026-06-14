# RAG Metadata Refresh v0

`rag_metadata_refresh_v0` is a metadata-only workflow for refreshing existing
generated RAG metadata surfaces after wiki or sourcebound metadata changes.

The workflow reconciles refs and state across the RAG manifest, source-slice
cards, triage/review/decision packets, owner decision record refs, metadata
index, retrieval trace/evaluation metadata, and optional graph lens export
candidates.

## Aggregate Runner

The current deterministic aggregate runner is:

```bash
npm run guild-hall:rag -- master-inventory-refresh --write --date YYYY-MM-DD
```

It regenerates the private master knowledge control surface under
`_workmeta/system/reports/knowledge_wiki/master_knowledge_inventory_reconcile_<date>/`.
The runner emits the inventory, CSV, summary, reconcile report, RAG refresh
handoff, candidate priority triage, first sourcebound-review selection, and
validation log.
It is a metadata-only execution surface for this workflow; it does not create
source truth, source-text indexes, owner approvals, ontology acceptance,
NotebookLM live queries, Drive mutations, public canon promotion, or
default-route safety.

## Outputs

- `refresh_scope_binding`
- `metadata_delta_inventory`
- `rag_surface_inventory`
- `rag_manifest_refresh_packet`
- `source_slice_card_refresh_set`
- `source_slice_triage_refresh_packet`
- `source_slice_review_refresh_packet`
- `source_slice_decision_packet_refresh`
- `owner_decision_record_refresh_candidate`
- `metadata_index_refresh_packet`
- `retrieval_trace_evaluation_refresh`
- `graph_lens_export_candidate`
- `boundary_review_note`

## Boundary

This workflow does not read source text, build BM25 or vector source-text
indexes, generate source-text embeddings, upload or query NotebookLM, mutate
Google Drive, grant owner approval, promote public canon, accept ontology,
switch default routes, or treat graph/RAG projections as source truth.

Owner decision records are refreshed only by mirroring external owner decision
refs and states. Graph lens exports are read-only navigation projections over
metadata refs and evidence event ids.

## Current Maturity

`output_state: pilot-executed`

The package is registered in `.workflow/index.yaml`, has controlled private
metadata-only pilot evidence, and has a public-safe synthetic optimizer
calibration under `calibrations/cal_20260527_quality_equiv_001/`.

The workflow is not promoted to canon, does not create source-text RAG or answer
authority, and is not declared default-route-safe.
