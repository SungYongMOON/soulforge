fixture_id: synthetic_rag_metadata_refresh_after_wiki_rename_and_sourcebound_projection_update
workflow_id: rag_metadata_refresh_v0
deliverable_state: candidate_only
workflow_readiness_label: pilot-executed

refresh_scope_binding:
  scope: metadata_only_refresh
  existing_generated_surfaces_only: true
  existing_rag_surface_refs:
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
  requested_delta_classes:
    - wiki_rename
    - sourcebound_projection_update
  refresh_policy:
    update_metadata_pointers_only: true
    preserve_external_owner_decision_refs: true
    stale_refs_are_flagged_not_silently_overwritten: true
    deprecated_refs_are_not_deleted_by_default: true
  exclusions:
    - raw_source_text_reading
    - source_text_index_construction
    - embedding_generation
    - notebooklm_operations
    - drive_mutation
    - authority_state_change
    - ontology_or_canon_promotion
    - default_route_switch
  binding_state: bounded
  uncertainty:
    - Exact old and replacement wiki refs were not supplied.
    - Exact sourcebound projection refs and field-level deltas were not supplied.

metadata_delta_inventory:
  inventory_state: incomplete_metadata_refs
  delta_candidates:
    - delta_id: synthetic_delta:wiki_rename:001
      delta_type: wiki_rename
      prior_ref: unknown
      replacement_ref: unknown
      affected_fields:
        - stable_ref
        - retrieval_key
        - route_hint
      lifecycle_state: owner_or_source_metadata_required
      claim_ceiling: metadata_only
    - delta_id: synthetic_delta:sourcebound_projection:001
      delta_type: sourcebound_projection_update
      prior_ref: unknown
      replacement_ref: unknown
      affected_fields:
        - source_ref
        - source_slice_ref
        - packet_ref
        - claim_ceiling
        - lifecycle_state
        - route_hint
        - evidence_event_id
      lifecycle_state: owner_or_source_metadata_required
      claim_ceiling: metadata_only
  absent_required_metadata:
    - old_wiki_stable_ref
    - renamed_wiki_stable_ref
    - prior_sourcebound_projection_ref
    - updated_sourcebound_projection_ref
    - affected_source_slice_refs
    - applicable_timestamps_utc
    - applicable_hash_or_size_pointers

rag_surface_inventory:
  inventory_state: refs_declared_payloads_unexamined
  surfaces:
    - surface_ref: rag_manifest:20260525
      surface_type: rag_manifest
      candidate_state: review_needed
    - surface_ref: source_slice_cards:20260525
      surface_type: source_slice_cards
      candidate_state: review_needed
    - surface_ref: source_slice_triage:20260525
      surface_type: source_slice_triage
      candidate_state: review_needed
    - surface_ref: source_slice_review_queue:20260525
      surface_type: source_slice_review
      candidate_state: review_needed
    - surface_ref: source_slice_decision_packet:20260525
      surface_type: source_slice_decision_packet
      candidate_state: review_needed
    - surface_ref: owner_decision_record:20260525
      surface_type: owner_decision_record
      candidate_state: preserve_external_authority
    - surface_ref: metadata_index:20260525
      surface_type: metadata_index
      candidate_state: review_needed
    - surface_ref: retrieval_trace:20260525
      surface_type: retrieval_trace
      candidate_state: review_needed
    - surface_ref: retrieval_evaluation:20260525
      surface_type: retrieval_evaluation
      candidate_state: review_needed
    - surface_ref: graph_lens_export:20260525
      surface_type: graph_lens_export
      candidate_state: optional_review
  duplicate_refs_detected: unknown
  boundary_unsafe_refs_detected: unknown
  missing_declared_surface_refs: []

rag_manifest_refresh_packet:
  packet_ref: synthetic_refresh_packet:rag_manifest:001
  target_ref: rag_manifest:20260525
  packet_state: blocked_pending_exact_delta_refs
  proposed_operations:
    - match affected records by supplied stable refs
    - mark confirmed superseded refs stale
    - add replacement metadata pointers
    - preserve source refs and claim ceilings unless explicitly changed
    - preserve owner-decision refs without inferring decisions
    - retain deprecated refs by default
  source_truth_change: false
  authority_change: false

source_slice_card_refresh_set:
  set_ref: synthetic_refresh_set:source_slice_cards:001
  target_ref: source_slice_cards:20260525
  refresh_state: blocked_pending_affected_slice_refs
  card_candidates: []
  required_per_card_fields:
    - card_ref
    - source_slice_ref
    - source_ref
    - packet_ref
    - claim_ceiling
    - lifecycle_state
    - retrieval_key
    - route_hint
    - owner_decision_ref
    - refresh_action
  permitted_refresh_actions:
    - stale
    - refreshed
    - blocked
    - owner_review_needed
  constraints:
    snippets_included: false
    claim_ceiling_downgrade_must_be_preserved: true
    duplicate_slice_refs_require_review: true

source_slice_triage_refresh_packet:
  packet_ref: synthetic_refresh_packet:source_slice_triage:001
  target_ref: source_slice_triage:20260525
  packet_state: blocked_pending_card_candidates
  proposed_labels:
    - stale_ref_candidate
    - renamed_ref_candidate
    - projection_update_candidate
    - missing_metadata_candidate
  labels_are_candidates_only: true

source_slice_review_refresh_packet:
  packet_ref: synthetic_refresh_packet:source_slice_review:001
  target_ref: source_slice_review_queue:20260525
  packet_state: blocked_pending_triage_and_delta_refs
  proposed_review_checks:
    - old_ref_to_replacement_ref_mapping
    - source_slice_ref_presence
    - duplicate_retrieval_key_detection
    - claim_ceiling_route_consistency
    - owner_decision_ref_preservation
  review_outcomes_are_metadata_only: true

source_slice_decision_packet_refresh:
  packet_ref: synthetic_refresh_packet:source_slice_decision:001
  target_ref: source_slice_decision_packet:20260525
  packet_state: blocked_pending_review_metadata
  decision_candidates: []
  owner_authority_required_for:
    - approval
    - policy_change
    - authority-bearing_route_change

owner_decision_record_refresh_candidate:
  candidate_ref: synthetic_refresh_candidate:owner_decision_record:001
  target_ref: owner_decision_record:20260525
  candidate_state: preserve_only
  supplied_owner_decision_refs: []
  proposed_operation: no_change_until_external_owner_decision_ref_and_state_are_supplied
  approval_created: false
  approval_inferred: false

metadata_index_refresh_packet:
  packet_ref: synthetic_refresh_packet:metadata_index:001
  target_ref: metadata_index:20260525
  packet_state: blocked_pending_exact_ref_mapping
  proposed_operations:
    - deprecate confirmed old retrieval keys without deleting them by default
    - bind replacement retrieval keys to stable metadata refs
    - preserve source-ref and claim-ceiling lineage
    - flag duplicate keys for review
  source_text_index_payload_included: false
  embedding_payload_included: false

retrieval_trace_evaluation_refresh:
  refresh_ref: synthetic_refresh:retrieval_trace_evaluation:001
  trace_target_ref: retrieval_trace:20260525
  evaluation_target_ref: retrieval_evaluation:20260525
  refresh_state: candidate_pending_exact_metadata
  evaluation_scope:
    metadata_coverage: candidate
    stale_ref_detection: candidate
    missing_slice_ref_detection: candidate
    duplicate_key_detection: candidate
    claim_ceiling_route_consistency: candidate
  results:
    metadata_coverage: unknown
    stale_refs: unknown
    missing_slice_refs: unknown
    duplicate_keys: unknown
    route_inconsistencies: unknown
  excluded_evaluations:
    - source_text_relevance
    - vector_similarity
    - notebooklm_query_verification

graph_lens_export_candidate:
  candidate_ref: synthetic_graph_lens_export:001
  prior_ref: graph_lens_export:20260525
  candidate_state: skipped_pending_explicit_export_policy
  nodes: []
  edges: []
  graph_store_mutation: false
  navigation_projection_only: true
  source_truth_status: none
  ontology_acceptance: false

boundary_review_note:
  note_ref: synthetic_boundary_review:001
  disposition: hold_private_metadata_candidate
  boundary_status: conditionally_bounded
  confirmed_from_deliverable_shape:
    raw_source_text_included: false
    source_text_index_payload_included: false
    embedding_vector_payload_included: false
    notebooklm_payload_included: false
    drive_content_payload_included: false
    owner_approval_created: false
    public_canon_promotion_performed: false
    ontology_acceptance_performed: false
    default_route_switch_performed: false
    graph_or_rag_projection_treated_as_truth: false
    host_absolute_path_included: false
  unresolved_checks:
    - Exact metadata deltas remain unavailable.
    - Existing surface payload boundaries remain unknown.
    - Stale, duplicate, and missing refs cannot be determined from supplied refs alone.
  stop_conditions:
    active:
      - existing_rag_surface_refs_missing_without_create_policy: false
      - owner_approval_required_but_absent: false
      - exact_metadata_required_for_pointer_refresh_but_absent: true
    trigger_if_requested:
      - raw_source_text_read
      - source_text_index_build
      - embedding_generation
      - notebooklm_upload_or_query
      - drive_mutation
      - owner_approval
      - public_canon_promotion
      - ontology_acceptance
      - default_route_switch
      - projection_as_source_truth
      - secret_or_runtime_absolute_path

provenance:
  basis:
    - synthetic fixture metadata
    - public workflow contract
    - public step graph
  source_payloads_used: false
  external_authority_records_used: false
  generated_identifiers_are_synthetic: true
  lineage_candidate:
    event_ref: synthetic_metadata_refresh_event:001
    event_type: metadata_only_rag_refresh_event
    upstream_workflow_refs:
      - knowledge_wiki_pipeline_v0
      - sourcebound_knowledge_packet_operating_loop_v0
    affected_surface_refs:
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
    timestamp_utc: unknown
    evidence_event_id: unknown

gaps:
  blocking:
    - Exact prior-to-replacement wiki ref mapping is missing.
    - Exact prior-to-updated sourcebound projection ref mapping is missing.
    - Affected source-slice refs are missing.
    - Refresh-policy handling for unmatched records is unspecified.
  non_blocking:
    - Graph-lens export policy was not supplied; export remains skipped.
    - No external owner-decision refs or states were supplied.
    - No lineage timestamp or evidence-event identifier was supplied.

downstream_handoff:
  current_route: hold_private_metadata
  eligible_candidates:
    - workflow_id: knowledge_access_event_capture_v0
      purpose: record_metadata_only_refresh_lineage
      readiness: candidate_pending_event_metadata
    - workflow_id: source_packet_sufficiency_review_v0
      purpose: assess_missing_or_stale_source_ref_signals
      readiness: candidate_if_gap_persists
    - workflow_id: owner_decision_packet_v0
      purpose: resolve_authority-bearing_route_or_approval_question
      readiness: only_if_owner_authority_is_required
    - workflow_id: post_development_review_gate_v0
      purpose: review_boundary_or_route_change_before_promotion
      readiness: required_before_public_or_canon_promotion
  next_required_input:
    - exact metadata-only old-to-new ref mappings
    - affected source-slice refs
    - applicable claim-ceiling or lifecycle-state changes
    - explicit graph-lens export policy if export is desired

no_claims:
  - This deliverable does not establish source truth.
  - It does not establish retrieval relevance or answer authority.
  - It does not assert that any existing surface is actually stale, refreshed, duplicated, or boundary-safe.
  - It does not create or infer owner approval.
  - It does not accept an ontology or promote public canon.
  - It does not declare the workflow default-route-safe.
  - It does not switch a default route.
  - It does not represent graph or RAG projections as truth.
  - It does not assert that any external operation or runtime validation occurred.
