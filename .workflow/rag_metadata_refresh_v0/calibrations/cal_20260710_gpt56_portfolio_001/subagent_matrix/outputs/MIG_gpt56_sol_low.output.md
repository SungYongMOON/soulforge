fixture_id: synthetic_rag_metadata_refresh_after_wiki_rename_and_sourcebound_projection_update
workflow_id: rag_metadata_refresh_v0
deliverable_state: stopped
workflow_readiness_label: pilot-executed
discovery_only: true
authority: none

refresh_scope_binding:
  status: blocked
  scenario: metadata-only refresh after a synthetic wiki rename and sourcebound projection update
  declared_existing_surfaces:
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
  allowed_operation: refresh_metadata_pointers_only
  missing_required_inputs:
    - rag_metadata_refresh_scope
    - wiki_or_sourcebound_metadata_delta_refs
    - refresh_policy
  stop_condition: existing_rag_surface_refs_missing_without_create_policy
  stop_reason: Required delta references and refresh policy were not supplied, so individual metadata changes and permitted create behavior cannot be bound.
  explicit_exclusions:
    - raw_source_text_reading
    - source_text_index_construction
    - embedding_generation
    - notebooklm_upload_or_query
    - drive_mutation
    - owner_approval
    - ontology_acceptance
    - canon_promotion
    - default_route_switch

metadata_delta_inventory:
  status: not_collected
  items: []
  unresolved_expected_delta_classes:
    - wiki_rename_pointer_change
    - sourcebound_projection_pointer_change
  reason: No stable wiki or sourcebound metadata-delta references were supplied.
  inference_prohibited: true

rag_surface_inventory:
  status: declared_refs_only
  surfaces:
    - surface_ref: rag_manifest:20260525
      surface_type: rag_manifest
      inspection_state: not_evaluated
    - surface_ref: source_slice_cards:20260525
      surface_type: source_slice_cards
      inspection_state: not_evaluated
    - surface_ref: source_slice_triage:20260525
      surface_type: source_slice_triage
      inspection_state: not_evaluated
    - surface_ref: source_slice_review_queue:20260525
      surface_type: source_slice_review
      inspection_state: not_evaluated
    - surface_ref: source_slice_decision_packet:20260525
      surface_type: source_slice_decision_packet
      inspection_state: not_evaluated
    - surface_ref: owner_decision_record:20260525
      surface_type: owner_decision_record
      inspection_state: not_evaluated
    - surface_ref: metadata_index:20260525
      surface_type: metadata_index
      inspection_state: not_evaluated
    - surface_ref: retrieval_trace:20260525
      surface_type: retrieval_trace
      inspection_state: not_evaluated
    - surface_ref: retrieval_evaluation:20260525
      surface_type: retrieval_evaluation
      inspection_state: not_evaluated
    - surface_ref: graph_lens_export:20260525
      surface_type: graph_lens_export
      inspection_state: not_evaluated
  stale_duplicate_missing_or_unsafe_findings: unknown

rag_manifest_refresh_packet:
  status: blocked
  target_ref: rag_manifest:20260525
  changes: []
  reason: Metadata deltas and refresh policy are unavailable.
  deletion_performed: false

source_slice_card_refresh_set:
  status: blocked
  target_ref: source_slice_cards:20260525
  cards: []
  stale_or_refreshed_or_blocked_assignments: []
  reason: No source-slice delta refs identify affected cards.

source_slice_triage_refresh_packet:
  status: blocked
  target_ref: source_slice_triage:20260525
  candidate_updates: []
  reason: No affected source-slice refs are available.
  labels_are_candidates_only: true

source_slice_review_refresh_packet:
  status: blocked
  target_ref: source_slice_review_queue:20260525
  candidate_updates: []
  reason: No affected source-slice refs or review metadata are available.
  review_acceptance_claimed: false

source_slice_decision_packet_refresh:
  status: blocked
  target_ref: source_slice_decision_packet:20260525
  candidate_updates: []
  reason: No affected decision-packet refs or external decisions are available.
  route_change_performed: false

owner_decision_record_refresh_candidate:
  status: blocked
  target_ref: owner_decision_record:20260525
  mirrored_owner_decisions: []
  reason: No owner_decision_refs or known external decision states were supplied.
  owner_approval_created: false
  owner_approval_inferred: false

metadata_index_refresh_packet:
  status: blocked
  target_ref: metadata_index:20260525
  retrieval_key_updates: []
  deprecated_refs: []
  reason: Renamed and replacement stable refs were not supplied.
  source_text_index_payload_present: false

retrieval_trace_evaluation_refresh:
  status: not_evaluated
  trace_target_ref: retrieval_trace:20260525
  evaluation_target_ref: retrieval_evaluation:20260525
  results:
    metadata_coverage: unknown
    stale_ref_detection: unknown
    missing_slice_ref_detection: unknown
    duplicate_key_detection: unknown
    claim_ceiling_route_consistency: unknown
  excluded_evaluations:
    - source_text_relevance_scoring
    - notebooklm_query_verification
    - vector_similarity_evaluation
  reason: No refresh packets were safely derivable.

graph_lens_export_candidate:
  status: skipped
  existing_ref: graph_lens_export:20260525
  nodes: []
  edges: []
  reason: No graph_lens_export_policy_refs requested a metadata-only export.
  navigation_projection_only: true
  graph_store_mutation_performed: false
  ontology_acceptance_performed: false

boundary_review_note:
  status: stopped_at_scope_binding
  boundary_posture: preserved
  checks:
    raw_source_text_present: false
    copied_source_excerpt_present: false
    source_text_index_payload_present: false
    embedding_vector_payload_present: false
    notebooklm_payload_or_operation_present: false
    drive_mutation_present: false
    host_absolute_path_present: false
    owner_approval_inferred: false
    public_canon_promotion_performed: false
    ontology_acceptance_performed: false
    default_route_switch_performed: false
    graph_or_rag_projection_treated_as_truth: false
  disposition: hold_private_metadata
  completion_claimed: false

provenance:
  supplied_fixture_ref: synthetic_rag_metadata_refresh_after_wiki_rename_and_sourcebound_projection_update
  supplied_workflow_ref: rag_metadata_refresh_v0
  supplied_surface_refs_only: true
  source_text_used: false
  external_runtime_evidence_used: false
  derived_facts:
    - Existing surface identifiers were declared by the fixture.
    - The scenario names wiki-rename and sourcebound-projection-update delta classes.
    - Exact old and replacement refs, affected slices, claim ceilings, lifecycle states, retrieval keys, and decision refs remain unknown.

gaps:
  blocking:
    - gap_id: synthetic-gap-refresh-scope
      missing: rag_metadata_refresh_scope
      required_resolution: Supply a metadata-only scope using stable, public-safe identifiers.
    - gap_id: synthetic-gap-delta-refs
      missing: wiki_or_sourcebound_metadata_delta_refs
      required_resolution: Supply stable refs identifying the old and replacement metadata pointers.
    - gap_id: synthetic-gap-refresh-policy
      missing: refresh_policy
      required_resolution: Specify handling for missing surfaces and whether create candidates are permitted.
  non_blocking_until_later_steps:
    - owner_decision_refs
    - graph_lens_export_policy_refs
    - prior_surface_detail_refs
  unknowns:
    - affected_source_slice_refs
    - old_workflow_id_refs
    - replacement_workflow_id_refs
    - changed_claim_ceilings
    - changed_lifecycle_states
    - changed_retrieval_keys
    - owner_decision_states

downstream_handoff:
  current_route: hold_private_metadata
  ready_routes: []
  conditional_routes:
    - workflow_id: owner_decision_packet_v0
      condition: A route or approval decision requiring owner authority is identified.
    - workflow_id: source_packet_sufficiency_review_v0
      condition: Stable metadata shows a stale or missing source ref.
    - workflow_id: knowledge_access_event_capture_v0
      condition: A completed metadata-only refresh yields a lineage event.
      candidate_event:
        event_type: metadata_only_rag_refresh_event
        status: not_prepared
        reason: The refresh did not pass scope binding.
    - workflow_id: post_development_review_gate_v0
      condition: A boundary or route change packet is prepared for promotion review.
  authority_upgrade: none

no_claims:
  - No metadata delta was identified beyond the scenario-level delta classes.
  - No existing surface was inspected, refreshed, overwritten, deleted, or validated.
  - No source-slice or workflow identifier was classified as stale or refreshed.
  - No retrieval quality, relevance, graph truth, source truth, or answer authority was established.
  - No owner decision was created, inferred, approved, or changed.
  - No source text, excerpt, chunk, embedding, BM25 payload, vector payload, or NotebookLM answer payload is included.
  - No Drive mutation, ontology promotion, canon promotion, or default-route switch occurred.
  - The pilot-executed label describes the supplied workflow package posture, not completion of this fixture.
