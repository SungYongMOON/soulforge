You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: rag_source_text_quality_review_v0
kind: workflow
status: active
title: RAG Source Text Quality Review v0
summary: Review a source-text index, traceability sidecar, and answer-run trace into page-level quality outcomes without persisting source text, copied chunks, excerpts, NotebookLM answers, secrets, or runtime absolute paths.
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
    - rag_quality_review
    - source_traceability
    - answer_support_review
  secondary_name_ko:
    - RAG 품질 검토
    - 출처 추적성
    - 답변 근거 검토
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: false
  candidate_party_id: null
  bound_party_id: null
  binding_authority: none
inputs:
  - quality_review_scope
  - source_text_index_ref
  - traceability_sidecar_ref
  - answer_run_trace_ref
  - review_policy
optional_inputs:
  - source_card_refs
  - sourcebound_packet_refs
  - metadata_index_refs
  - retrieval_trace_refs
  - page_warning_policy_refs
  - owner_decision_refs
outputs:
  - quality_review_scope_binding
  - source_text_index_inventory
  - traceability_sidecar_inventory
  - answer_run_trace_inventory
  - page_quality_review_packet
  - boundary_review_note
validation_level: pilot_executed_single_controlled_run
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
pilot_execution_evidence:
  - evidence_id: dapa_test_eval_requirements_verification_quality_review_20260527
    execution_scope: controlled_dapa_fixture
    generated_at_utc: "2026-05-26T17:11:09.342Z"
    output_ref: _workspaces/knowledge/rag/source_text_quality_reviews/dapa_test_eval_requirements_verification_quality_review_20260527/source_text_quality_review.json
    output_sha256: 1B6A51775362FCF62E18F52FFF6F01237904BE97F5B259B37838B9FD9F06C3CF
    validator_refs:
      - name: validate-source-text-quality-review
        command_ref: node guild_hall/rag/cli.mjs validate-source-text-quality-review --review-ref _workspaces/knowledge/rag/source_text_quality_reviews/dapa_test_eval_requirements_verification_quality_review_20260527/source_text_quality_review.json
        status: pass
      - name: rag.test.mjs
        command_ref: node --test guild_hall/rag/rag.test.mjs
        status: pass
    review_status: manual_review
    reviewed_pages:
      - 18
      - 19
      - 39
      - 120
      - 121
    page_status_summary:
      source_supported:
        pages:
          - 39
          - 120
        warning_notes:
          - page 39 has table_present_on_page warning
      manual_review:
        pages:
          - 18
          - 19
          - 121
        warning_notes:
          - picture_present_on_page
      blocked_pages: []
    count_summary:
      reviewed_page_count: 5
      citation_review_count: 3
      source_supported_page_count: 2
      manual_review_page_count: 3
      blocked_page_count: 0
      weak_mapped_chunk_count: 0
      unmapped_chunk_count: 0
    boundary_summary:
      copied_source_text_in_package: false
      copied_chunks_or_excerpts_in_package: false
      raw_query_or_answer_payload_in_package: false
      runtime_absolute_paths_in_package: false
      owner_approval_claimed: false
      public_canon_promotion_allowed: false
upstream_workflows:
  - workflow_id: rag_metadata_refresh_v0
    expected_outputs:
      - metadata_index_refresh_packet
      - source_slice_card_refresh_set
      - retrieval_trace_evaluation_refresh
    status: optional_metadata_context
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_outputs:
      - sourcebound_knowledge_packet_manifest
      - compiled_projection_index
      - contradiction_gap_lint_report
      - claim_ceiling_and_promotion_route
    status: optional_source_and_claim_context
  - workflow_id: wiki_curation_maintenance_v0
    expected_outputs:
      - source_ledger_curation_packet
      - packet_map_update_note
      - residual_gap_register
      - review_handoff
    status: optional_curation_context
downstream_workflows:
  - workflow_id: rag_work_card_router_v0
    expected_input: page_quality_review_packet
    status: optional_work_card_context_after_review
  - workflow_id: rag_metadata_refresh_v0
    expected_input: stale_or_missing_quality_review_ref_signal
    status: optional_metadata_refresh_followup
  - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    expected_input: source_gap_or_traceability_gap_from_quality_review
    status: optional_sourcebound_followup
  - workflow_id: owner_decision_packet_v0
    expected_input: manual_review_or_policy_exception_needing_owner_decision
    status: optional_owner_decision
  - workflow_id: post_development_review_gate_v0
    expected_input: rag_source_text_quality_review_boundary_or_route_change_packet
    status: required_before_public_or_canon_promotion
operating_contract:
  owns:
    - quality_review_scope_binding_shape
    - source_text_index_inventory_shape
    - traceability_sidecar_inventory_shape
    - answer_run_trace_inventory_shape
    - page_quality_review_packet_shape
    - page_warning_classification_shape
    - boundary_review_note_shape
  does_not_own:
    - source_truth
    - raw_source_text_storage
    - source_payload_storage
    - copied_source_excerpt_storage
    - notebooklm_answer_storage
    - answer_correctness_authority
    - owner_approval_authority
    - canon_promotion
    - default_route_switching
    - source_text_index_construction
    - traceability_sidecar_construction
    - external_tool_or_drive_mutation
  quality_status_values:
    - source_supported
    - manual_review
    - blocked
  warning_categories:
    table:
      - table_trace_missing
      - table_cell_mapping_uncertain
      - table_caption_or_header_trace_missing
      - table_ocr_or_layout_warning
    picture:
      - picture_trace_missing
      - figure_caption_trace_missing
      - image_alt_or_label_missing
      - picture_reference_unresolved
    ocr:
      - ocr_confidence_low
      - layout_reading_order_uncertain
      - broken_text_or_garbled_token_signal
      - page_scan_quality_warning
    page:
      - page_ref_missing_or_duplicate
      - page_number_mismatch
      - stale_index_or_sidecar_ref
      - mixed_source_or_claim_ceiling_warning
  boundaries:
    package_public_safe: true
    stores_only_refs_hashes_labels_and_warnings: true
    raw_source_text_persisted: false
    source_chunks_or_excerpts_persisted: false
    notebooklm_answers_persisted: false
    answer_payload_persisted: false
    secrets_or_credentials_persisted: false
    runtime_absolute_paths_persisted: false
    owner_approval_granted_here: false
    public_canon_promotion_allowed: false
    default_route_switch_allowed: false
    quality_review_is_support_trace_not_source_truth: true
  required_output_shapes:
    quality_review_scope_binding: templates/quality_review_scope_binding.template.yaml
    source_text_index_inventory: templates/source_text_index_inventory.template.yaml
    traceability_sidecar_inventory: templates/traceability_sidecar_inventory.template.yaml
    answer_run_trace_inventory: templates/answer_run_trace_inventory.template.yaml
    page_quality_review_packet: templates/page_quality_review_packet.template.yaml
    boundary_review_note: templates/boundary_review_note.template.yaml
notes:
  - Runtime inputs may point to private or project-local source-text indexes and answer-run traces, but reusable package files and review packets must persist only portable refs, ids, hashes, status values, and warning labels.
  - "source_supported means the page-level claim or answer trace is backed by approved index and sidecar refs within the declared scope; it is not a general truth or owner-approval claim."
  - "manual_review means the page has unresolved support, table, picture, OCR, or page warnings that require human or downstream review before stronger use."
  - "blocked means a required ref, sidecar mapping, page identity, claim ceiling, or boundary guard is missing or unsafe."
  - "This package is registered in .workflow/index.yaml by owner request on 2026-06-14 and remains not default-route-safe; pilot execution evidence is recorded under history/pilot_execution_20260527.yaml."


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: rag_source_text_quality_review_v0
kind: step_graph
status: draft
steps:
  - step_id: bind_quality_review_scope
    title: Bind Quality Review Scope
    actor_slot: quality_scope_binder
    action:
      kind: rag_source_text_quality_review_scope_binding
      requires:
        - quality_review_scope
        - source_text_index_ref
        - traceability_sidecar_ref
        - answer_run_trace_ref
        - review_policy
      validates:
        - scope_declares_approved_source_refs
        - source_text_index_ref_is_repo_relative_or_stable_id
        - traceability_sidecar_ref_is_repo_relative_or_stable_id
        - answer_run_ref_is_payload_free_or_private_runtime_only
        - raw_source_text_not_requested_for_persistence
        - raw_answer_or_notebooklm_answer_not_requested_for_persistence
        - runtime_absolute_paths_not_allowed_in_outputs
      artifact_out: quality_review_scope_binding
    summary: Bind the review scope and explicit public-safe exclusions before any index, sidecar, or answer-run trace is inspected.
    next:
      on_success: inventory_source_text_index
      on_fail: stop
  - step_id: inventory_source_text_index
    title: Inventory Source Text Index
    actor_slot: source_text_index_inventory_author
    action:
      kind: source_text_index_metadata_inventory
      artifacts_in:
        - quality_review_scope_binding
        - source_text_index_ref
        - metadata_index_refs
        - source_card_refs
      artifact_out: source_text_index_inventory
      allowed_content:
        - index_ref
        - source_ref
        - page_ref
        - page_label
        - chunk_ref
        - text_hash_ref
        - byte_or_token_count
        - extraction_method
        - claim_ceiling
        - lifecycle_state
      forbidden_content:
        - raw_source_text
        - copied_source_excerpt
        - source_chunk_payload
        - embedding_vector_payload
        - bm25_term_payload
        - credential_or_session_material
        - host_absolute_path
    summary: Inventory the index by refs, page ids, hashes, counts, and lifecycle metadata, never by copied source text.
    next:
      on_success: inventory_traceability_sidecar
      on_fail: stop
  - step_id: inventory_traceability_sidecar
    title: Inventory Traceability Sidecar
    actor_slot: traceability_sidecar_inventory_author
    action:
      kind: traceability_sidecar_metadata_inventory
      artifacts_in:
        - quality_review_scope_binding
        - traceability_sidecar_ref
        - source_text_index_inventory
      artifact_out: traceability_sidecar_inventory
      sidecar_fields:
        - sidecar_ref
        - source_ref
        - page_ref
        - chunk_ref
        - table_ref
        - picture_ref
        - ocr_event_ref
        - trace_event_ref
        - source_hash_ref
        - extraction_warning_ref
      sidecar_rules:
        missing_page_mapping_is_blocker: true
        ambiguous_table_or_picture_mapping_routes_to_manual_review: true
        ocr_warning_kept_as_warning_label: true
        payload_copy_forbidden: true
    summary: Inventory sidecar mappings for pages, chunks, tables, pictures, OCR events, and trace events using refs only.
    next:
      on_success: inventory_answer_run_trace
      on_fail: stop
  - step_id: inventory_answer_run_trace
    title: Inventory Answer Run Trace
    actor_slot: answer_run_trace_inventory_author
    action:
      kind: answer_run_trace_metadata_inventory
      artifacts_in:
        - quality_review_scope_binding
        - answer_run_trace_ref
        - retrieval_trace_refs
      artifact_out: answer_run_trace_inventory
      allowed_content:
        - answer_run_ref
        - answer_claim_ref
        - citation_ref
        - retrieval_event_ref
        - page_ref
        - source_ref
        - trace_hash_ref
        - run_timestamp_utc
      forbidden_content:
        - raw_question
        - raw_answer
        - notebooklm_answer_payload
        - copied_source_excerpt
        - prompt_payload
        - private_transcript_payload
        - host_absolute_path
    summary: Inventory the answer run through claim, citation, retrieval, and trace refs without persisting raw questions or answers.
    next:
      on_success: evaluate_page_support
      on_fail: stop
  - step_id: evaluate_page_support
    title: Evaluate Page Support
    actor_slot: page_support_reviewer
    action:
      kind: page_level_source_support_review
      artifacts_in:
        - source_text_index_inventory
        - traceability_sidecar_inventory
        - answer_run_trace_inventory
        - sourcebound_packet_refs
        - owner_decision_refs
      artifact_out: page_quality_review_packet
      support_rules:
        source_supported_requires_matching_page_index_and_sidecar_refs: true
        source_supported_requires_claim_ceiling_not_blocked: true
        table_picture_or_ocr_uncertainty_routes_to_manual_review: true
        missing_index_sidecar_or_page_identity_routes_to_blocked: true
        output_status_values:
          - source_supported
          - manual_review
          - blocked
      warning_categories:
        - table
        - picture
        - ocr
        - page
    summary: Classify each page-linked answer trace as source-supported, manual-review, or blocked and attach warning labels by page.
    next:
      on_success: boundary_review_and_route
      on_fail: stop
  - step_id: boundary_review_and_route
    title: Boundary Review And Route
    actor_slot: quality_boundary_router
    action:
      kind: quality_review_boundary_review_and_downstream_route
      artifacts_in:
        - quality_review_scope_binding
        - source_text_index_inventory
        - traceability_sidecar_inventory
        - answer_run_trace_inventory
        - page_quality_review_packet
      artifact_out: boundary_review_note
      checks:
        - no_raw_source_text
        - no_source_chunks_or_excerpts
        - no_raw_answer_or_notebooklm_answer
        - no_raw_question_persistence
        - no_secret_or_credential_material
        - no_runtime_absolute_paths
        - no_owner_approval_inference
        - no_public_canon_promotion
        - no_default_route_switch
      routes:
        - rag_work_card_router_v0
        - rag_metadata_refresh_v0
        - sourcebound_knowledge_packet_operating_loop_v0
        - owner_decision_packet_v0
        - post_development_review_gate_v0
    summary: Close the review with boundary checks and downstream route hints, not authority upgrades.
    next:
      on_success: complete
      on_fail: stop
stop_conditions:
  - source_text_index_ref_missing_or_unapproved
  - traceability_sidecar_ref_missing_or_unapproved
  - answer_run_trace_ref_missing_or_unapproved
  - raw_source_text_or_excerpt_persistence_requested
  - raw_answer_or_notebooklm_answer_persistence_requested
  - required_page_identity_missing
  - claim_ceiling_blocks_support_review
  - source_truth_or_answer_truth_claim_requested
  - owner_approval_required_but_absent
  - public_canon_promotion_requested
  - default_route_switch_requested
  - runtime_absolute_path_or_secret_detected


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "soulforge.workflow_optimizer.fixture.v0",
  "workflow_id": "rag_source_text_quality_review_v0",
  "calibration_id": "cal_20260611_rag_source_text_quality_review_quality_equiv_001",
  "fixture_id": "rag_source_text_quality_review_public_synthetic_refs_001",
  "public_safe": true,
  "fixture_boundary": {
    "source_text_payload_included": false,
    "source_chunks_or_excerpts_included": false,
    "raw_question_included": false,
    "raw_answer_included": false,
    "notebooklm_answer_included": false,
    "notebooklm_question_or_conversation_id_included": false,
    "project_private_payload_included": false,
    "workspace_content_included": false,
    "secret_or_credential_included": false,
    "runtime_absolute_path_included": false
  },
  "workflow_contract_excerpt": {
    "goal": "Review a source-text index, traceability sidecar, and answer-run trace into page-level quality outcomes without persisting source text, copied chunks, excerpts, NotebookLM answers, secrets, or runtime absolute paths.",
    "required_outputs": [
      "quality_review_scope_binding",
      "source_text_index_inventory",
      "traceability_sidecar_inventory",
      "answer_run_trace_inventory",
      "page_quality_review_packet",
      "boundary_review_note"
    ],
    "status_values": [
      "source_supported",
      "manual_review",
      "blocked"
    ],
    "warning_categories": [
      "table",
      "picture",
      "ocr",
      "page"
    ],
    "non_authorities": [
      "source_truth",
      "answer_correctness_authority",
      "owner_approval_authority",
      "canon_promotion",
      "default_route_switching"
    ]
  },
  "review_policy": {
    "policy_id": "synthetic_payload_free_quality_review_policy_001",
    "source_supported_requires_matching_page_index_and_sidecar_refs": true,
    "source_supported_requires_claim_ceiling_not_blocked": true,
    "table_picture_or_ocr_uncertainty_routes_to_manual_review": true,
    "missing_index_sidecar_or_page_identity_routes_to_blocked": true,
    "mixed_source_or_claim_ceiling_warning_routes_to_blocked": true,
    "output_must_use_refs_hashes_counts_labels_statuses_only": true,
    "claim_ceiling": "observed_synthetic_support_trace"
  },
  "quality_review_scope": {
    "scope_id": "SCOPE-SYN-RAG-QA-001",
    "approved_source_refs": [
      "SRC-SYN-A",
      "SRC-SYN-B"
    ],
    "source_text_index_ref": "synthetic://rag_quality/source_text_index/SYN-001",
    "traceability_sidecar_ref": "synthetic://rag_quality/traceability_sidecar/SYN-001",
    "answer_run_trace_ref": "synthetic://rag_quality/answer_run_trace/SYN-001",
    "metadata_index_refs": [
      "synthetic://rag_quality/metadata_index/SYN-001"
    ],
    "sourcebound_packet_refs": [
      "synthetic://sourcebound/packet/SYN-001"
    ],
    "owner_decision_refs": [],
    "raw_payload_access": "forbidden"
  },
  "source_text_index": {
    "index_ref": "synthetic://rag_quality/source_text_index/SYN-001",
    "pages": [
      {
        "page_ref": "P-SYN-001",
        "source_ref": "SRC-SYN-A",
        "page_label": "SYN-A-001",
        "chunk_refs": [
          "CHK-SYN-001-A",
          "CHK-SYN-001-B"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-001-a",
          "sha256:synthetic-page-001-b"
        ],
        "token_count": 420,
        "extraction_method": "synthetic_clean_text",
        "claim_ceiling": "source_supported",
        "lifecycle_state": "current"
      },
      {
        "page_ref": "P-SYN-002",
        "source_ref": "SRC-SYN-A",
        "page_label": "SYN-A-002",
        "chunk_refs": [
          "CHK-SYN-002-A"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-002-a"
        ],
        "token_count": 280,
        "extraction_method": "synthetic_picture_caption_ocr",
        "claim_ceiling": "source_supported",
        "lifecycle_state": "current"
      },
      {
        "page_ref": "P-SYN-003",
        "source_ref": "SRC-SYN-B",
        "page_label": "SYN-B-003",
        "chunk_refs": [
          "CHK-SYN-003-A",
          "CHK-SYN-003-B"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-003-a",
          "sha256:synthetic-page-003-b"
        ],
        "token_count": 515,
        "extraction_method": "synthetic_table_ocr",
        "claim_ceiling": "source_supported",
        "lifecycle_state": "current"
      },
      {
        "page_ref": "P-SYN-004",
        "source_ref": "SRC-SYN-B",
        "page_label": "SYN-B-004",
        "chunk_refs": [
          "CHK-SYN-004-A"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-004-a"
        ],
        "token_count": 365,
        "extraction_method": "synthetic_clean_text",
        "claim_ceiling": "source_supported",
        "lifecycle_state": "current"
      },
      {
        "page_ref": "P-SYN-005",
        "source_ref": "SRC-SYN-Z",
        "page_label": "SYN-Z-005",
        "chunk_refs": [
          "CHK-SYN-005-A"
        ],
        "text_hash_refs": [
          "sha256:synthetic-page-005-a"
        ],
        "token_count": 190,
        "extraction_method": "synthetic_stale_mixed_source",
        "claim_ceiling": "blocked",
        "lifecycle_state": "stale"
      }
    ]
  },
  "traceability_sidecar": {
    "sidecar_ref": "synthetic://rag_quality/traceability_sidecar/SYN-001",
    "page_mappings": [
      {
        "page_ref": "P-SYN-001",
        "source_ref": "SRC-SYN-A",
        "chunk_refs": [
          "CHK-SYN-001-A",
          "CHK-SYN-001-B"
        ],
        "trace_event_refs": [
          "TR-SYN-001"
        ],
        "mapping_state": "mapped",
        "warnings": []
      },
      {
        "page_ref": "P-SYN-002",
        "source_ref": "SRC-SYN-A",
        "chunk_refs": [
          "CHK-SYN-002-A"
        ],
        "picture_refs": [
          "PIC-SYN-002-A"
        ],
        "trace_event_refs": [
          "TR-SYN-002"
        ],
        "mapping_state": "mapped_with_picture_warning",
        "warnings": [
          "picture_trace_missing",
          "figure_caption_trace_missing"
        ]
      },
      {
        "page_ref": "P-SYN-003",
        "source_ref": "SRC-SYN-B",
        "chunk_refs": [
          "CHK-SYN-003-A",
          "CHK-SYN-003-B"
        ],
        "table_refs": [
          "TBL-SYN-003-A"
        ],
        "ocr_event_refs": [
          "OCR-SYN-003-A"
        ],
        "trace_event_refs": [
          "TR-SYN-003"
        ],
        "mapping_state": "mapped_with_table_warning",
        "warnings": [
          "table_cell_mapping_uncertain",
          "layout_reading_order_uncertain"
        ]
      },
      {
        "page_ref": "P-SYN-004",
        "source_ref": "SRC-SYN-B",
        "chunk_refs": [
          "CHK-SYN-004-A"
        ],
        "trace_event_refs": [],
        "mapping_state": "missing_page_mapping",
        "warnings": [
          "page_ref_missing_or_duplicate"
        ]
      },
      {
        "page_ref": "P-SYN-005",
        "source_ref": "SRC-SYN-Z",
        "chunk_refs": [
          "CHK-SYN-005-A"
        ],
        "trace_event_refs": [
          "TR-SYN-005"
        ],
        "mapping_state": "mapped_but_scope_mismatch",
        "warnings": [
          "mixed_source_or_claim_ceiling_warning",
          "stale_index_or_sidecar_ref"
        ]
      }
    ]
  },
  "answer_run_trace": {
    "answer_run_ref": "synthetic://rag_quality/answer_run_trace/SYN-001",
    "run_timestamp_utc": "2026-06-11T00:00:00Z",
    "raw_question_available": false,
    "raw_answer_available": false,
    "notebooklm_payload_available": false,
    "claims": [
      {
        "answer_claim_ref": "CLM-SYN-001",
        "citation_ref": "CIT-SYN-001",
        "retrieval_event_ref": "RET-SYN-001",
        "page_ref": "P-SYN-001",
        "source_ref": "SRC-SYN-A",
        "trace_hash_ref": "sha256:synthetic-trace-001"
      },
      {
        "answer_claim_ref": "CLM-SYN-002",
        "citation_ref": "CIT-SYN-002",
        "retrieval_event_ref": "RET-SYN-002",
        "page_ref": "P-SYN-002",
        "source_ref": "SRC-SYN-A",
        "trace_hash_ref": "sha256:synthetic-trace-002"
      },
      {
        "answer_claim_ref": "CLM-SYN-003",
        "citation_ref": "CIT-SYN-003",
        "retrieval_event_ref": "RET-SYN-003",
        "page_ref": "P-SYN-003",
        "source_ref": "SRC-SYN-B",
        "trace_hash_ref": "sha256:synthetic-trace-003"
      },
      {
        "answer_claim_ref": "CLM-SYN-004",
        "citation_ref": "CIT-SYN-004",
        "retrieval_event_ref": "RET-SYN-004",
        "page_ref": "P-SYN-004",
        "source_ref": "SRC-SYN-B",
        "trace_hash_ref": "sha256:synthetic-trace-004"
      },
      {
        "answer_claim_ref": "CLM-SYN-005",
        "citation_ref": "CIT-SYN-005",
        "retrieval_event_ref": "RET-SYN-005",
        "page_ref": "P-SYN-005",
        "source_ref": "SRC-SYN-Z",
        "trace_hash_ref": "sha256:synthetic-trace-005"
      }
    ]
  }
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
