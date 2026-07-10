```yaml
deliverable:
  workflow_id: rag_metadata_refresh_v0
  fixture_id: synthetic_rag_metadata_refresh_after_wiki_rename_and_sourcebound_projection_update
  readiness_label: pilot-executed
  authority: none
  output_state: pilot-executed
  public_safe: true

  refresh_scope_binding:
    scope_ref: synthetic:refresh-scope:20260710-001
    delta_refs:
      - synthetic:wiki-metadata-delta:rename-001
      - synthetic:sourcebound-projection-delta:update-001
    existing_surface_refs:
      - rag_manifest:20260525
      - source_slice_cards:20260525
      - source_slice_triage:20260525
      - source_slice_review_queue:20260525
      - source_slice_decision_packet:20260525
      - owner_decision_record:20260525
      - metadata_index:20260525
      - retrieval_trace:20260525
      - retrieval_evaluation:20260525
      - graph_lens_export:20260525
    refresh_policy: synthetic:metadata-only-refresh-policy-v0
    allowed_surfaces:
      - rag_manifest
      - source_slice_cards
      - source_slice_triage
      - source_slice_review
      - source_slice_decision_packet
      - owner_decision_record
      - metadata_index
      - retrieval_trace
      - retrieval_evaluation
      - graph_lens_export
    exclusions:
      - raw_source_text
      - source_text_indexing
      - embedding_generation
      - notebooklm_upload_or_query
      - drive_mutation
      - owner_approval
      - ontology_acceptance
      - canon_promotion
      - default_route_switch

  metadata_delta_inventory:
    inventory_ref: synthetic:metadata-delta-inventory:001
    entries:
      - delta_ref: synthetic:wiki-metadata-delta:rename-001
        change_kind: metadata_rename
        affected_refs:
          - synthetic:wiki-ref:renamed-001
        source_truth_status: not_assessed
        action: refresh_pointer_metadata_only
      - delta_ref: synthetic:sourcebound-projection-delta:update-001
        change_kind: projection_metadata_update
        affected_refs:
          - synthetic:source-slice-ref:updated-001
        source_truth_status: not_assessed
        action: refresh_pointer_metadata_only
    preserved_fields:
      - source_ref
      - source_slice_ref
      - packet_ref
      - claim_ceiling
      - lifecycle_state
      - owner_decision_ref
      - evidence_event_id
    forbidden_payloads_present: false

  rag_surface_inventory:
    inventory_ref: synthetic:rag-surface-inventory:001
    surfaces:
      - surface_ref: rag_manifest:20260525
        surface_kind: rag_manifest
        state: stale_by_metadata_delta
        refresh_action: prepare_refresh
      - surface_ref: source_slice_cards:20260525
        surface_kind: source_slice_cards
        state: stale_by_metadata_delta
        refresh_action: prepare_refresh
      - surface_ref: source_slice_triage:20260525
        surface_kind: source_slice_triage
        state: stale_by_metadata_delta
        refresh_action: prepare_refresh
      - surface_ref: source_slice_review_queue:20260525
        surface_kind: source_slice_review
        state: stale_by_metadata_delta
        refresh_action: prepare_refresh
      - surface_ref: source_slice_decision_packet:20260525
        surface_kind: source_slice_decision_packet
        state: stale_by_metadata_delta
        refresh_action: prepare_refresh
      - surface_ref: owner_decision_record:20260525
        surface_kind: owner_decision_record
        state: preserve_external_refs
        refresh_action: prepare_candidate
      - surface_ref: metadata_index:20260525
        surface_kind: metadata_index
        state: stale_by_metadata_delta
        refresh_action: prepare_refresh
      - surface_ref: retrieval_trace:20260525
        surface_kind: retrieval_trace
        state: stale_by_metadata_delta
        refresh_action: prepare_refresh
      - surface_ref: retrieval_evaluation:20260525
        surface_kind: retrieval_evaluation
        state: stale_by_metadata_delta
        refresh_action: prepare_refresh
      - surface_ref: graph_lens_export:20260525
        surface_kind: graph_lens_export
        state: optional_candidate
        refresh_action: prepare_metadata_only_candidate
    source_payloads_read: false

  rag_manifest_refresh_packet:
    packet_ref: synthetic:rag-manifest-refresh:001
    records:
      - stable_ref: synthetic:wiki-ref:renamed-001
        lifecycle_state: stale_or_refresh_pending
        refresh_action: update_pointer_and_state
      - stable_ref: synthetic:source-slice-ref:updated-001
        lifecycle_state: refreshed_metadata_pending_review
        refresh_action: update_pointer_and_state
      - stable_ref: synthetic:legacy-workflow-ref:001
        lifecycle_state: stale
        refresh_action: retain_ref_and_mark_stale
    owner_decision_refs: preserved_only
    source_truth_updated: false

  source_slice_card_refresh_set:
    set_ref: synthetic:source-slice-card-refresh-set:001
    cards:
      - card_ref: synthetic:source-slice-card:001
        source_slice_ref: synthetic:source-slice-ref:updated-001
        source_ref: synthetic:source-ref:001
        packet_ref: synthetic:packet-ref:001
        claim_ceiling: preserved_from_metadata
        lifecycle_state: refreshed_metadata_pending_review
        retrieval_key: synthetic:retrieval-key:001
        route_hint: review_required
        owner_decision_ref: synthetic:owner-decision-ref:001
        refresh_action: refresh_metadata_pointers_only
    snippets_or_excerpts: absent
    duplicate_slice_refs: not_detected_from_fixture

  source_slice_triage_refresh_packet:
    packet_ref: synthetic:source-slice-triage-refresh:001
    entries:
      - source_slice_ref: synthetic:source-slice-ref:updated-001
        triage_label: candidate_metadata_review
        label_authority: candidate_only
        lifecycle_state: review_required
    source_truth_assessed: false

  source_slice_review_refresh_packet:
    packet_ref: synthetic:source-slice-review-refresh:001
    entries:
      - source_slice_ref: synthetic:source-slice-ref:updated-001
        review_state: metadata_refresh_pending_review_gate
        review_outcome_authority: none
        next_route: post_development_review_gate_v0

  source_slice_decision_packet_refresh:
    packet_ref: synthetic:source-slice-decision-refresh:001
    entries:
      - source_slice_ref: synthetic:source-slice-ref:updated-001
        decision_state: owner_or_review_decision_needed
        decision_created_here: false
        route: owner_decision_packet_v0

  owner_decision_record_refresh_candidate:
    candidate_ref: synthetic:owner-decision-record-refresh-candidate:001
    records:
      - owner_decision_ref: synthetic:owner-decision-ref:001
        owner_decision_state: mirrored_metadata_state_only
        approval_status: not_created
        external_authority_preserved: true

  metadata_index_refresh_packet:
    packet_ref: synthetic:metadata-index-refresh:001
    updates:
      - retrieval_key: synthetic:retrieval-key:001
        stable_ref: synthetic:source-slice-ref:updated-001
        route_hint: review_required
        lifecycle_state: refreshed_metadata_pending_review
      - retrieval_key: synthetic:retrieval-key:legacy-001
        stable_ref: synthetic:legacy-workflow-ref:001
        lifecycle_state: stale
        refresh_action: mark_stale
    source_text_terms_added: false
    embeddings_added: false

  retrieval_trace_evaluation_refresh:
    packet_ref: synthetic:retrieval-trace-evaluation-refresh:001
    trace_ref: synthetic:retrieval-trace:refresh-001
    evaluation_ref: synthetic:retrieval-evaluation:refresh-001
    checks:
      metadata_coverage: metadata_only
      stale_ref_detection: included
      missing_slice_ref_detection: included
      duplicate_key_detection: included
      claim_ceiling_route_consistency: metadata_only
      source_text_relevance_scoring: excluded
      notebooklm_query_verification: excluded
      vector_similarity_evaluation: excluded
    result: metadata_refresh_pending_boundary_review
    source_truth_inferred: false

  graph_lens_export_candidate:
    candidate_ref: synthetic:graph-lens-export-candidate:001
    export_state: candidate_only
    nodes:
      - graph_node_ref: synthetic:graph-node:source-slice-001
        stable_ref: synthetic:source-slice-ref:updated-001
    edges:
      - graph_edge_ref: synthetic:graph-edge:metadata-lineage-001
        from_ref: synthetic:source-slice-ref:updated-001
        to_ref: synthetic:packet-ref:001
        evidence_event_id: synthetic:evidence-event:001
    projection_role: metadata_navigation_only
    source_truth: false
    ontology_acceptance: not_performed
    graph_store_mutation: not_performed

  boundary_review_note:
    note_ref: synthetic:boundary-review-note:001
    boundary_status: held_private_metadata
    checks:
      raw_source_text: not_present
      source_text_index_payload: not_present
      embedding_vector_payload: not_present
      notebooklm_upload_or_query: not_performed
      drive_mutation: not_performed
      owner_approval_inference: not_performed
      public_canon_promotion: not_performed
      ontology_acceptance: not_performed
      default_route_switch: not_performed
      graph_or_rag_projection_as_truth: not_claimed
    downstream_handoff:
      - route: knowledge_access_event_capture_v0
        handoff_ref: synthetic:metadata-only-rag-refresh-event:001
        purpose: optional_usage_lineage_capture
      - route: owner_decision_packet_v0
        handoff_ref: synthetic:owner-decision-handoff:001
        condition: owner authority needed
      - route: source_packet_sufficiency_review_v0
        handoff_ref: synthetic:source-gap-review-handoff:001
        condition: stale_or_missing_source_ref_signal
      - route: post_development_review_gate_v0
        handoff_ref: synthetic:post-development-review-handoff:001
        condition: public_or_canon_promotion_considered

  provenance:
    fixture_ref: synthetic:fixture:rag-metadata-refresh-001
    contract_ref: synthetic:public-canon:rag_metadata_refresh_v0
    source_inputs:
      - synthetic:wiki-metadata-delta:rename-001
      - synthetic:sourcebound-projection-delta:update-001
    provenance_mode: metadata_refs_only
    raw_source_material: not included

  gaps:
    - source truth was not assessed
    - owner approval is absent and cannot be created by this workflow
    - review-gate acceptance is pending
    - default-route safety is not established
    - canon promotion is not established
    - graph projection truth is not established

  no_claims:
    - no claim that source content is correct or current
    - no claim that retrieval answers are authoritative
    - no claim that an owner approved any change
    - no claim that ontology or canon promotion occurred
    - no claim that the default route is safe
    - no claim that runtime execution or external mutation occurred
```
