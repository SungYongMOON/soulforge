You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=archivist.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: rag_metadata_refresh_v0
kind: workflow
status: active
title: RAG Metadata Refresh v0
summary: Refresh existing generated RAG metadata surfaces after wiki or sourcebound metadata changes by reconciling manifests, source-slice cards, triage/review/decision packets, owner-decision record refs, metadata indexes, retrieval traces/evaluations, and optional graph lens exports without reading source text or changing authority state.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
classification_lane:
  primary: knowledge_management
  primary_name_ko: 지식 관리
  secondary:
    - rag_metadata
    - wiki_maintenance
    - sourcebound_projection
  secondary_name_ko:
    - RAG 메타데이터
    - 위키 유지보수
    - 소스바운드 프로젝션
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: false
  candidate_party_id: null
  bound_party_id: null
  binding_authority: none
inputs:
  - rag_metadata_refresh_scope
  - wiki_or_sourcebound_metadata_delta_refs
  - existing_rag_surface_refs
  - refresh_policy
optional_inputs:
  - prior_rag_manifest_refs
  - prior_source_slice_card_refs
  - prior_source_slice_triage_refs
  - prior_source_slice_review_refs
  - prior_source_slice_decision_packet_refs
  - prior_owner_decision_record_refs
  - prior_metadata_index_refs
  - prior_retrieval_trace_refs
  - prior_retrieval_evaluation_refs
  - graph_lens_export_policy_refs
  - owner_decision_refs
outputs:
  - refresh_scope_binding
  - metadata_delta_inventory
  - rag_surface_inventory
  - rag_manifest_refresh_packet
  - source_slice_card_refresh_set
  - source_slice_triage_refresh_packet
  - source_slice_review_refresh_packet
  - source_slice_decision_packet_refresh
  - owner_decision_record_refresh_candidate
  - metadata_index_refresh_packet
  - retrieval_trace_evaluation_refresh
  - graph_lens_export_candidate
  - boundary_review_note
validation_level: pilot_executed_private_metadata_fixture
registration_policy: owner_requested_registration
output_state: pilot-executed
readiness_posture:
  package_state: registered-package-ready
  pilot_ready: true
  pilot_executed: true
  canon_ready: false
  registered: true
  default_route_safe: false
  default_route_safety_claimed: false
upstream_workflows:
  - workflow_id: knowledge_wiki_pipeline_v0
    expected_outputs:
      - sourcebound_packet_refs
      - knowledge_access_refs
      - obsidian_export_refs
      - boundary_review_note
    status: optional_metadata_delta_source
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_outputs:
      - sourcebound_knowledge_packet_manifest
      - compiled_projection_index
      - contradiction_gap_lint_report
      - concept_candidate_register
      - claim_ceiling_and_promotion_route
      - workflowization_review_packet
    status: optional_metadata_delta_source
  - workflow_id: knowledge_access_event_capture_v0
    expected_outputs:
      - usage_rollup
      - retention_label_packet
      - link_strength_analysis
      - graph_update_packet
      - boundary_review_note
    status: optional_usage_or_graph_signal_source
downstream_workflows:
  - workflow_id: knowledge_access_event_capture_v0
    expected_input: metadata_only_rag_refresh_event
    status: optional_usage_lineage_capture
  - workflow_id: owner_decision_packet_v0
    expected_input: source_slice_or_route_decision_needing_owner_authority
    status: required_before_owner_approval_or_policy_change
  - workflow_id: source_packet_sufficiency_review_v0
    expected_input: stale_or_missing_source_ref_signal_from_metadata_only_refresh
    status: optional_source_gap_review
  - workflow_id: post_development_review_gate_v0
    expected_input: rag_metadata_refresh_boundary_or_route_change_packet
    status: required_before_public_or_canon_promotion
operating_contract:
  owns:
    - refresh_scope_binding_shape
    - metadata_delta_inventory_shape
    - existing_rag_surface_inventory_shape
    - rag_manifest_refresh_packet_shape
    - source_slice_card_refresh_shape
    - source_slice_triage_refresh_shape
    - source_slice_review_refresh_shape
    - source_slice_decision_packet_refresh_shape
    - owner_decision_record_refresh_candidate_shape
    - metadata_index_refresh_packet_shape
    - retrieval_trace_evaluation_refresh_shape
    - optional_graph_lens_export_candidate_shape
    - metadata_only_boundary_review_shape
  does_not_own:
    - source_truth
    - raw_source_text_reading
    - bm25_source_text_index_construction
    - vector_source_text_index_construction
    - source_text_embedding_generation
    - notebooklm_upload
    - notebooklm_query
    - google_drive_mutation
    - owner_approval_authority
    - public_canon_promotion
    - ontology_acceptance
    - default_route_switching
    - default_route_safety_claim
    - graph_projection_truth
    - rag_projection_truth
  refresh_surface_contract:
    allowed_existing_surfaces:
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
    allowed_metadata_fields:
      - stable_ref
      - source_ref
      - source_slice_ref
      - packet_ref
      - claim_ceiling
      - lifecycle_state
      - retrieval_key
      - route_hint
      - owner_decision_ref
      - owner_decision_state
      - evaluation_metric
      - evidence_event_id
      - timestamp_utc
      - hash_or_size_pointer
      - graph_node_ref
      - graph_edge_ref
    forbidden_payloads:
      - raw_source_text
      - copied_source_excerpt
      - private_packet_payload
      - notebooklm_answer_payload
      - embedding_vector_payload
      - bm25_term_index_payload
      - drive_file_content_payload
      - credential_or_session_material
      - host_absolute_path
  boundaries:
    metadata_only_refresh: true
    existing_generated_surfaces_only: true
    source_text_reading_allowed: false
    bm25_or_vector_source_text_indexing_allowed: false
    source_text_embedding_generation_allowed: false
    notebooklm_upload_or_query_allowed: false
    drive_mutation_allowed: false
    owner_approval_granted_here: false
    public_canon_promotion_allowed: false
    ontology_acceptance_allowed: false
    default_route_switch_allowed: false
    default_route_safe: false
    graph_lens_is_navigation_projection_not_truth: true
    rag_surfaces_are_retrieval_metadata_not_source_truth: true
    owner_decision_record_refresh_preserves_external_authority_refs: true
    public_package_payload_free: true
  required_output_shapes:
    refresh_scope_binding: templates/refresh_scope_binding.template.yaml
    metadata_delta_inventory: templates/metadata_delta_inventory.template.yaml
    rag_surface_inventory: templates/rag_surface_inventory.template.yaml
    rag_manifest_refresh_packet: templates/rag_manifest_refresh_packet.template.yaml
    source_slice_card_refresh_set: templates/source_slice_card_refresh_set.template.yaml
    source_slice_triage_refresh_packet: templates/source_slice_triage_refresh_packet.template.yaml
    source_slice_review_refresh_packet: templates/source_slice_review_refresh_packet.template.yaml
    source_slice_decision_packet_refresh: templates/source_slice_decision_packet_refresh.template.yaml
    owner_decision_record_refresh_candidate: templates/owner_decision_record_refresh_candidate.template.yaml
    metadata_index_refresh_packet: templates/metadata_index_refresh_packet.template.yaml
    retrieval_trace_evaluation_refresh: templates/retrieval_trace_evaluation_refresh.template.yaml
    graph_lens_export_candidate: templates/graph_lens_export_candidate.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - This package is a metadata-only refresh lane for already-generated RAG surfaces after wiki/sourcebound metadata changes; it does not create source-text search indexes or embeddings.
  - The workflow may mark existing RAG surfaces stale, refreshed, blocked, or owner-review-needed by ref, but it must not infer source truth from retrieval, graph, or usage signals.
  - Owner decision records may be synchronized to known owner decision refs and states only; this workflow cannot create approval.
  - Optional graph lens export is a read-only navigation projection over metadata refs and evidence event ids, not a source of truth or ontology acceptance.
  - This registered package has controlled private metadata-only pilot evidence and a public-safe synthetic optimizer calibration, but it has not been canon-promoted or made default-route-safe.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: rag_metadata_refresh_v0
kind: step_graph
status: draft
steps:
  - step_id: bind_refresh_scope
    title: Bind Refresh Scope
    actor_slot: refresh_scope_binder
    action:
      kind: rag_metadata_refresh_scope_binding
      requires:
        - rag_metadata_refresh_scope
        - wiki_or_sourcebound_metadata_delta_refs
        - existing_rag_surface_refs
        - refresh_policy
      validates:
        - existing_generated_surfaces_declared
        - metadata_delta_refs_are_repo_relative_or_stable_ids
        - raw_source_text_not_requested
        - notebooklm_and_drive_mutation_out_of_scope
        - default_route_switch_out_of_scope
      artifact_out: refresh_scope_binding
    summary: Bind the metadata-only refresh request, allowed surfaces, policy, and explicit exclusions before inspecting generated RAG metadata.
    next:
      on_success: collect_metadata_deltas
      on_fail: stop
  - step_id: collect_metadata_deltas
    title: Collect Metadata Deltas
    actor_slot: metadata_delta_collector
    action:
      kind: wiki_sourcebound_metadata_delta_collection
      artifacts_in:
        - refresh_scope_binding
        - wiki_or_sourcebound_metadata_delta_refs
      artifact_out: metadata_delta_inventory
      allowed_content:
        - stable_ref
        - source_ref
        - source_slice_ref
        - packet_ref
        - claim_ceiling
        - lifecycle_state
        - route_hint
        - owner_decision_ref
        - evidence_event_id
        - timestamp_utc
      forbidden_content:
        - raw_source_text
        - copied_source_excerpt
        - private_packet_payload
        - notebooklm_answer_payload
        - embedding_vector_payload
        - bm25_term_index_payload
        - credential_or_session_material
        - host_absolute_path
    summary: Gather wiki/sourcebound metadata changes by stable refs only, preserving source pointers and claim ceilings without reading source text.
    next:
      on_success: inventory_existing_rag_surfaces
      on_fail: stop
  - step_id: inventory_existing_rag_surfaces
    title: Inventory Existing RAG Surfaces
    actor_slot: rag_surface_inventory_author
    action:
      kind: generated_rag_surface_inventory
      artifacts_in:
        - refresh_scope_binding
        - existing_rag_surface_refs
        - prior_rag_manifest_refs
        - prior_source_slice_card_refs
        - prior_source_slice_triage_refs
        - prior_source_slice_review_refs
        - prior_source_slice_decision_packet_refs
        - prior_owner_decision_record_refs
        - prior_metadata_index_refs
        - prior_retrieval_trace_refs
        - prior_retrieval_evaluation_refs
      artifact_out: rag_surface_inventory
      inventory_rules:
        generated_surfaces_only: true
        store_refs_not_payloads: true
        missing_surface_is_blocker_or_create_candidate_per_policy: true
        stale_surface_flagged_not_silently_overwritten: true
    summary: Inventory the existing generated RAG metadata surfaces to be refreshed and flag missing, stale, duplicate, or boundary-unsafe refs.
    next:
      on_success: refresh_manifest_and_metadata_index
      on_fail: stop
  - step_id: refresh_manifest_and_metadata_index
    title: Refresh Manifest And Metadata Index
    actor_slot: manifest_index_refresher
    action:
      kind: rag_manifest_and_metadata_index_delta_assembly
      artifacts_in:
        - refresh_scope_binding
        - metadata_delta_inventory
        - rag_surface_inventory
      artifacts_out:
        - rag_manifest_refresh_packet
        - metadata_index_refresh_packet
      update_semantics:
        manifest_records_stable_refs_and_state: true
        metadata_index_records_retrieval_keys_not_source_text: true
        removed_or_renamed_refs_marked_deprecated_not_deleted_by_default: true
        source_ref_and_claim_ceiling_changes_are_traceable: true
        owner_decision_refs_preserved_not_inferred: true
    summary: Produce manifest and metadata-index refresh deltas that update refs, states, keys, and lineage without building source-text indexes.
    next:
      on_success: refresh_source_slice_cards
      on_fail: stop
  - step_id: refresh_source_slice_cards
    title: Refresh Source-Slice Cards
    actor_slot: source_slice_card_refresher
    action:
      kind: source_slice_card_metadata_refresh
      artifacts_in:
        - metadata_delta_inventory
        - rag_surface_inventory
        - rag_manifest_refresh_packet
        - metadata_index_refresh_packet
      artifact_out: source_slice_card_refresh_set
      card_fields:
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
      card_rules:
        no_source_text_snippets: true
        claim_ceiling_downgrades_preserved: true
        duplicate_slice_refs_flagged: true
        stale_or_missing_refs_route_to_review: true
    summary: Refresh source-slice card metadata for changed refs, claim ceilings, states, retrieval keys, and route hints.
    next:
      on_success: refresh_triage_review_decision_packets
      on_fail: stop
  - step_id: refresh_triage_review_decision_packets
    title: Refresh Triage Review And Decision Packets
    actor_slot: review_decision_refresher
    action:
      kind: source_slice_triage_review_decision_refresh
      artifacts_in:
        - source_slice_card_refresh_set
        - metadata_delta_inventory
        - owner_decision_refs
        - prior_source_slice_triage_refs
        - prior_source_slice_review_refs
        - prior_source_slice_decision_packet_refs
        - prior_owner_decision_record_refs
      artifacts_out:
        - source_slice_triage_refresh_packet
        - source_slice_review_refresh_packet
        - source_slice_decision_packet_refresh
        - owner_decision_record_refresh_candidate
      decision_rules:
        triage_labels_are_candidates: true
        review_outcomes_are_metadata_until_review_gate_accepts: true
        owner_decision_record_mirrors_external_owner_refs_only: true
        owner_approval_not_created_here: true
        route_changes_require_downstream_authority: true
    summary: Refresh triage, review, decision packet, and owner decision record metadata while preserving external authority boundaries.
    next:
      on_success: refresh_retrieval_trace_evaluation
      on_fail: stop
  - step_id: refresh_retrieval_trace_evaluation
    title: Refresh Retrieval Trace Evaluation
    actor_slot: retrieval_trace_evaluator
    action:
      kind: retrieval_trace_and_evaluation_metadata_refresh
      artifacts_in:
        - rag_manifest_refresh_packet
        - metadata_index_refresh_packet
        - source_slice_card_refresh_set
        - prior_retrieval_trace_refs
        - prior_retrieval_evaluation_refs
      artifact_out: retrieval_trace_evaluation_refresh
      evaluation_scope:
        metadata_coverage: true
        stale_ref_detection: true
        missing_slice_ref_detection: true
        duplicate_key_detection: true
        claim_ceiling_route_consistency: true
        source_text_relevance_scoring: false
        notebooklm_query_verification: false
        vector_similarity_evaluation: false
    summary: Refresh retrieval trace and evaluation metadata for coverage, staleness, duplicate keys, and route consistency without querying source text, vectors, or NotebookLM.
    next:
      on_success: optional_graph_lens_export
      on_fail: stop
  - step_id: optional_graph_lens_export
    title: Optional Graph Lens Export
    actor_slot: graph_lens_exporter
    condition: only when graph_lens_export_policy_refs request a metadata-only read-view export
    action:
      kind: metadata_only_graph_lens_export_candidate
      artifacts_in:
        - rag_manifest_refresh_packet
        - metadata_index_refresh_packet
        - source_slice_card_refresh_set
        - retrieval_trace_evaluation_refresh
        - graph_lens_export_policy_refs
      artifact_out: graph_lens_export_candidate
      export_rules:
        graph_nodes_are_refs: true
        graph_edges_are_navigation_signals: true
        evidence_event_ids_preserved: true
        graph_lens_not_source_truth: true
        ontology_acceptance_not_performed: true
        graph_store_mutation_not_performed: true
    summary: Optionally create a graph lens export candidate from refreshed metadata refs for visualization or review, not truth or ontology mutation.
    next:
      on_success: boundary_review_and_route
      on_skipped: boundary_review_and_route
      on_fail: stop
  - step_id: boundary_review_and_route
    title: Boundary Review And Route
    actor_slot: boundary_router
    action:
      kind: rag_metadata_refresh_boundary_review_and_downstream_route
      artifacts_in:
        - refresh_scope_binding
        - metadata_delta_inventory
        - rag_surface_inventory
        - rag_manifest_refresh_packet
        - metadata_index_refresh_packet
        - source_slice_card_refresh_set
        - source_slice_triage_refresh_packet
        - source_slice_review_refresh_packet
        - source_slice_decision_packet_refresh
        - owner_decision_record_refresh_candidate
        - retrieval_trace_evaluation_refresh
        - graph_lens_export_candidate
      artifact_out: boundary_review_note
      checks:
        - no_raw_source_text
        - no_source_text_index_payload
        - no_embedding_vector_payload
        - no_notebooklm_upload_or_query
        - no_drive_mutation
        - no_owner_approval_inference
        - no_public_canon_promotion
        - no_ontology_acceptance
        - no_default_route_switch
        - graph_or_rag_projection_not_truth
      routes:
        - hold_private_metadata
        - owner_decision_packet_v0
        - source_packet_sufficiency_review_v0
        - knowledge_access_event_capture_v0
        - post_development_review_gate_v0
    summary: Close with a boundary note and downstream route recommendations, never with authority upgrade or default-route mutation.
    next:
      on_success: complete
      on_fail: stop
stop_conditions:
  - refresh_request_requires_raw_source_text_read
  - refresh_request_requires_bm25_or_vector_source_text_index_build
  - refresh_request_requires_embedding_vector_payload_generation
  - refresh_request_requires_notebooklm_upload_or_query
  - refresh_request_requires_google_drive_mutation
  - existing_rag_surface_refs_missing_without_create_policy
  - owner_approval_required_but_absent
  - public_canon_promotion_requested
  - ontology_acceptance_requested
  - default_route_switch_requested
  - graph_or_rag_projection_treated_as_source_truth
  - runtime_absolute_path_or_secret_detected


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "fixture_id": "synthetic_rag_metadata_refresh_after_wiki_rename_and_sourcebound_projection_update",
  "workflow_id": "rag_metadata_refresh_v0",
  "workflow_readiness_label": "pilot-executed",
  "scenario": "A metadata-only wiki/sourcebound delta was produced after knowledge_wiki_pipeline_v0 rename and a sourcebound projection update.",
  "existing_rag_surface_refs": [
    "rag_manifest:20260525",
    "source_slice_cards:20260525",
    "source_slice_triage:20260525",
    "source_slice_review_queue:20260525",
    "source_slice_decision_packet:20260525",
    "owner_decision_record:20260525",
    "metadata_index:20260525",
    "retrieval_trace:20260525",
    "retrieval_evaluation:20260525",
    "graph_lens_export:20260525"
  ],
  "required_actions": [
    "inventory metadata deltas",
    "refresh metadata pointers only",
    "preserve owner-decision refs without approving them",
    "mark stale source-slice or old workflow-id refs as stale/refreshed/blocked by ref",
    "prepare optional knowledge_access_event_capture_v0 lineage event",
    "produce a boundary review note"
  ],
  "required_outputs": [
    "refresh_scope_binding",
    "metadata_delta_inventory",
    "rag_surface_inventory",
    "rag_manifest_refresh_packet",
    "source_slice_card_refresh_set",
    "source_slice_triage_refresh_packet",
    "source_slice_review_refresh_packet",
    "source_slice_decision_packet_refresh",
    "owner_decision_record_refresh_candidate",
    "metadata_index_refresh_packet",
    "retrieval_trace_evaluation_refresh",
    "graph_lens_export_candidate",
    "boundary_review_note",
    "provenance",
    "gaps",
    "downstream_handoff",
    "no_claims"
  ],
  "forbidden": [
    "source text",
    "chunks",
    "excerpts",
    "NotebookLM answer payloads",
    "Drive mutation",
    "embeddings",
    "BM25 payloads",
    "vector payloads",
    "host absolute paths",
    "source-truth claims",
    "answer-authority claims",
    "owner approval",
    "ontology promotion",
    "canon promotion",
    "default route switch"
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
