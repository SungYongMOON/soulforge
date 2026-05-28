```json
{
  "workflow_id": "rag_metadata_refresh_v0",
  "baseline_profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
    "species": "dwarf",
    "class": "archivist"
  },
  "outputs": {
    "refresh_scope_binding": "Binds the synthetic generated-surface-only refresh scope, wiki/sourcebound metadata deltas, and explicit exclusions.",
    "metadata_delta_inventory": "Records workflow rename, old workflow-id stale ref, sourcebound projection update, and one blocked orphan old-slice ref with observed or rejected_or_blocked claim ceilings.",
    "rag_surface_inventory": "Inventories manifest, cards, triage, review, decision, owner-decision, metadata-index, trace/evaluation, and graph-lens refs as generated metadata surfaces.",
    "rag_manifest_refresh_packet": "Updates current workflow and projection metadata refs, deprecates stale old workflow refs, blocks orphan refs, and preserves owner decision refs without approval.",
    "source_slice_card_refresh_set": "Marks cards as refreshed, stale, review-required, or blocked by ref without source text or retrieval payloads.",
    "source_slice_triage_refresh_packet": "Routes stale, refreshed, and blocked ref classes without inferring source truth or owner approval.",
    "source_slice_review_refresh_packet": "Keeps review states metadata-only and routes blocked refs to source_packet_sufficiency_review_v0.",
    "source_slice_decision_packet_refresh": "Preserves decision refs and requires owner_decision_packet_v0 before authority changes.",
    "owner_decision_record_refresh_candidate": "Mirrors existing owner decision refs and states only; no approval is created here.",
    "metadata_index_refresh_packet": "Refreshes retrieval keys and lifecycle states as metadata, with no source-text terms or embeddings.",
    "retrieval_trace_evaluation_refresh": "Refreshes trace/evaluation metadata for stale-ref, missing-slice, duplicate-key, and route-consistency checks only.",
    "graph_lens_export_candidate": "Builds a read-only navigation candidate over metadata refs; graph edges are not ontology acceptance.",
    "boundary_review_note": "Passes metadata-only boundary with one blocked-ref handoff and no source, answer, owner, canon, ontology, Drive, NotebookLM, or default-route authority.",
    "provenance": "Public-safe synthetic fixture and workflow contract only.",
    "gaps": "Blocked orphan old workflow ref, no owner authority, no source truth evaluation, and no golden telemetry claim.",
    "downstream_handoff": "Optional knowledge_access_event_capture_v0 lineage event, source_packet_sufficiency_review_v0 for blocked refs, owner_decision_packet_v0 before authority changes, and post_development_review_gate_v0 before public/canon promotion.",
    "no_claims": "No source text, NotebookLM answer payload, Drive mutation, embedding/BM25/vector payload, host absolute path, source truth, answer authority, owner approval, ontology/canon promotion, or default-route switch."
  }
}
```
