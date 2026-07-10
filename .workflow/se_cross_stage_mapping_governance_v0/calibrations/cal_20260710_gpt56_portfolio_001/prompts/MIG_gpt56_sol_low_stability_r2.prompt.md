You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: se_cross_stage_mapping_governance_v0
kind: workflow
status: active
title: SE Cross-Stage Mapping Governance v0
summary: Aggregate cross-stage SE artifact coverage, artifact-to-input mapping, claim ceilings, and missing-download follow-up without becoming evidence authority or final readiness authority.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - mapping_governance_binding
  - stage_gap_scan_refs
  - approved_mapping_policy
optional_inputs:
  - source_gap_followup_refs
  - source_packet_sufficiency_refs
  - review_gate_packet_refs
  - readiness_digest_refs
  - accepted_verification_result_refs
  - existing_pdf_or_html_refs
  - intake_note_refs
  - repo_planning_doc_refs
  - artifact_folder_refs
  - artifact_folder_inventory_refs
  - prior_inspection_packet_refs
  - downstream_rerun_policy_refs
outputs:
  - mapping_governance_packet
  - cross_stage_artifact_matrix
  - artifact_to_input_map
  - claim_ceiling_register
  - missing_download_register
  - stage_gap_scan_index
  - boundary_review_note
  - artifact_folder_inventory_index
  - per_artifact_folder_inspection_packet
  - required_content_gap_register
  - input_basis_gap_register
  - inspection_delta_register
  - owner_source_followup_rows
  - downstream_rerun_routes
validation_level: pilot_executed_private_candidate
registration_policy: registered_governance_only
output_state: active_governance_only
workflow_modes:
  - cross_stage_coverage_aggregation
  - artifact_to_input_mapping
  - claim_ceiling_review
  - missing_download_followup_index
  - repeated_artifact_folder_metadata_inspection
stage_scope:
  supported_stage_codes:
    - 000_REF
    - 020_MGMT
    - 030_SRR
    - 060_SFR
    - 090_PDR
    - 120_CDR
    - 150_TRR_DT
    - 180_FCA_OT
    - 210_PCA
    - 240_LL
    - 270_UNCLASSIFIED
  current_stage_names:
    - REF
    - MGMT
    - SRR
    - SFR
    - PDR
    - CDR
    - TRR_DT
    - FCA_OT
    - PCA
    - LL
    - UNCLASSIFIED
boundary:
  public_safe_structure_only: true
  governance_only: true
  metadata_inspection_only: true
  evidence_authority: false
  final_readiness_authority: false
  artifact_authoring_performed: false
  upstream_artifacts_read_only: true
  hwp_hwpx_body_review_in_scope: false
  hwp_hwpx_extraction_in_scope: false
  allowed_hwp_hwpx_context:
    - filenames
    - titles
    - existing_pdf_derivatives
    - existing_html_derivatives
    - existing_intake_notes
    - current_repo_planning_docs
  forbidden_hwp_hwpx_actions:
    - read_hwp_body
    - read_hwpx_body
    - attempt_hwp_extraction
    - infer_hidden_body_contents
    - claim_hwp_body_reviewed
allowed_claim_ceilings:
  - observed
  - mapped_governance_only
  - pilot_executed_private_candidate
  - pilot_executed_private_candidate_with_owner_decision_needed
  - source_gap_followup_needed
  - owner_decision_needed
  - blocked_missing_download
  - not_applicable_owner_marked
  - rejected_or_blocked
explicit_non_claims:
  - artifact_completion
  - source_supported_evidence
  - validated_private_truth
  - stage_readiness
  - review_approval
  - audit_closure
  - verification_completion
  - final_readiness
  - hwp_or_hwpx_body_coverage
  - download_completed
  - owner_decision_created
upstream_workflows:
  - workflow_id: se_stage_artifact_gap_scan_v0
    expected_outputs:
      - stage_artifact_gap_scan_packet
      - stage_required_artifact_matrix
      - stage_input_gap_register
      - owner_input_queue
      - stage_blocker_register
      - downstream_workflow_route_map
      - stage_readiness_summary
    status: primary_read_only_context
  - workflow_id: source_gap_followup_packet_v0
    expected_outputs:
      - source_gap_followup_packet
      - gap_dedup_index
      - owner_action_queue
      - download_or_reuse_batch_manifest
      - retry_trigger_register
      - downstream_unblock_map
    status: optional_gap_context
  - workflow_id: source_packet_sufficiency_review_v0
    expected_outputs:
      - blocked_fields_register
      - owner_followup_needed
      - allowed_claim_ceiling
    status: optional_claim_ceiling_context
  - workflow_id: review_gate_evidence_pack_v0
    expected_outputs:
      - review_blockers
      - action_item_register
      - readiness_summary
    status: optional_review_context
downstream_workflows:
  - workflow_id: source_gap_followup_packet_v0
    expected_input: missing_download_register_and_source_gap_rows
    status: planned_for_gap_followup
  - workflow_id: project_readiness_digest_v0
    expected_input: mapping_governance_packet_and_claim_ceiling_register
    status: planned_for_summary
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: cross_stage_artifact_matrix_and_boundary_review_note
    status: planned_for_review_context
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: artifact_to_input_map_rows_with_verification_planning_needs
    status: planned_for_verification_planning
  - workflow_id: test_harness_asset_planning_v0
    expected_input: trr_dt_rows_with_harness_or_fixture_input_gaps
    status: planned_for_trr_dt
  - workflow_id: functional_configuration_audit_page_library_v0
    expected_input: fca_ot_rows_with_functional_audit_artifact_gaps
    status: planned_for_fca_ot
  - workflow_id: physical_configuration_audit_asset_package_v0
    expected_input: pca_rows_with_physical_configuration_asset_gaps
    status: planned_for_pca
  - workflow_id: accepted_verification_result_packet_v0
    expected_input: accepted_or_blocked_result_rows_from_stage_context
    status: optional_later_stage_context
governance_contract:
  owns:
    - cross_stage_artifact_row_identity
    - stage_coverage_aggregation
    - artifact_to_input_mapping
    - claim_ceiling_assignment
    - missing_download_followup_rows
    - artifact_folder_inventory_indexing
    - per_folder_metadata_inspection_packets
    - required_content_gap_rows
    - input_basis_gap_rows
    - inspection_delta_rows
    - owner_source_followup_rows
    - downstream_rerun_route_rows
    - boundary_review_note_shape
  does_not_own:
    - source_truth
    - source_collection
    - hwp_or_hwpx_body_review
    - artifact_authoring
    - artifact_body_inspection
    - downstream_rerun_execution
    - owner_decision_creation
    - stage_readiness_approval
    - review_gate_approval
    - verification_acceptance
    - final_readiness
  required_output_shapes:
    mapping_governance_packet: templates/mapping_governance_packet.template.yaml
    cross_stage_artifact_matrix: templates/cross_stage_artifact_matrix.template.yaml
    artifact_to_input_map: templates/artifact_to_input_map.template.yaml
    claim_ceiling_register: templates/claim_ceiling_register.template.yaml
    missing_download_register: templates/missing_download_register.template.yaml
    stage_gap_scan_index: templates/stage_gap_scan_index.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
    artifact_folder_inventory_index: templates/artifact_folder_inventory_index.template.yaml
    per_artifact_folder_inspection_packet: templates/per_artifact_folder_inspection_packet.template.yaml
    required_content_gap_register: templates/required_content_gap_register.template.yaml
    input_basis_gap_register: templates/input_basis_gap_register.template.yaml
    inspection_delta_register: templates/inspection_delta_register.template.yaml
    owner_source_followup_rows: templates/owner_source_followup_rows.template.yaml
    downstream_rerun_routes: templates/downstream_rerun_routes.template.yaml
notes:
  - This workflow is compatible with existing stage gap scan outputs by treating them as read-only governance inputs.
  - This workflow is compatible with source gap follow-up by emitting missing-download and source-gap rows that can be deduplicated by `source_gap_followup_packet_v0`.
  - Repeated per-artifact-folder inspection is metadata-only and links back to existing matrix, map, gap, and follow-up rows where available.
  - Downstream rerun routes are recommendations to owning workflows, not rerun execution or acceptance evidence.
  - Private pilots have validated the workflow shape for primary SE artifact-family governance, but private run truth remains outside public canon.
  - Public workflow canon stores only portable procedure, state semantics, and sanitized templates.
  - Raw project payloads, source files, HWP/HWPX bodies, runtime absolute paths, credentials, cookies, sessions, and private run truth do not belong in this package.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
schema_version: soulforge_step_graph_v0
workflow_id: se_cross_stage_mapping_governance_v0
entrypoint: run
steps:
  - step_id: collect_allowed_refs
    role: controller
    action: Collect only approved stage scan refs, source gap refs, existing PDF/HTML/intake metadata, and planning docs.
    outputs:
      - stage_gap_scan_index
      - artifact_folder_inventory_index
  - step_id: inspect_artifact_folders_metadata
    role: controller
    action: For each approved artifact folder ref, inspect only folder metadata and already-approved governance refs; do not author artifacts or inspect artifact bodies.
    inputs:
      - artifact_folder_inventory_index
      - stage_gap_scan_index
    outputs:
      - per_artifact_folder_inspection_packet
  - step_id: register_required_content_gaps
    role: controller
    action: Record required content categories that are missing, blocked, ambiguous, or out of scope using metadata-only observations.
    inputs:
      - per_artifact_folder_inspection_packet
      - stage_gap_scan_index
    outputs:
      - required_content_gap_register
  - step_id: compare_inspection_delta
    role: controller
    action: Compare current folder inspection metadata against prior inspection packet refs and record added, removed, changed, stable, or blocked observations.
    inputs:
      - per_artifact_folder_inspection_packet
    outputs:
      - inspection_delta_register
  - step_id: build_cross_stage_matrix
    role: controller
    action: Normalize stage and artifact family coverage rows across the supported lifecycle stages.
    inputs:
      - stage_gap_scan_index
      - per_artifact_folder_inspection_packet
    outputs:
      - cross_stage_artifact_matrix
  - step_id: map_artifacts_to_inputs
    role: controller
    action: Map each artifact row to required inputs, owning workflow, current evidence posture, and downstream consumer.
    inputs:
      - cross_stage_artifact_matrix
    outputs:
      - artifact_to_input_map
  - step_id: register_input_basis_gaps
    role: controller
    action: Record missing or insufficient input basis refs without claiming source support, input satisfaction, or artifact completion.
    inputs:
      - per_artifact_folder_inspection_packet
      - artifact_to_input_map
    outputs:
      - input_basis_gap_register
  - step_id: assign_claim_ceilings
    role: controller
    action: Apply governance-only claim ceilings and explicit non-claims to each row.
    inputs:
      - artifact_to_input_map
    outputs:
      - claim_ceiling_register
  - step_id: route_missing_downloads
    role: controller
    action: Create missing-download follow-up rows without downloading, extracting, or validating source payloads.
    inputs:
      - artifact_to_input_map
      - claim_ceiling_register
    outputs:
      - missing_download_register
  - step_id: route_owner_source_followups
    role: controller
    action: Convert content gaps, input basis gaps, and missing-download rows into owner/source follow-up rows for owning workflows or owner action.
    inputs:
      - required_content_gap_register
      - input_basis_gap_register
      - missing_download_register
    outputs:
      - owner_source_followup_rows
  - step_id: plan_downstream_reruns
    role: controller
    action: Record downstream rerun route recommendations for owning workflows without executing reruns or claiming their results.
    inputs:
      - inspection_delta_register
      - owner_source_followup_rows
      - artifact_to_input_map
    outputs:
      - downstream_rerun_routes
  - step_id: write_governance_packet
    role: controller
    action: Aggregate matrix, input map, ceiling, and follow-up refs into one packet.
    inputs:
      - stage_gap_scan_index
      - cross_stage_artifact_matrix
      - artifact_to_input_map
      - claim_ceiling_register
      - missing_download_register
      - artifact_folder_inventory_index
      - per_artifact_folder_inspection_packet
      - required_content_gap_register
      - input_basis_gap_register
      - inspection_delta_register
      - owner_source_followup_rows
      - downstream_rerun_routes
    outputs:
      - mapping_governance_packet
  - step_id: boundary_review
    role: boundary_reviewer
    action: Confirm HWP/HWPX body review stayed out of scope and no authority claims were introduced.
    inputs:
      - mapping_governance_packet
      - claim_ceiling_register
      - missing_download_register
      - per_artifact_folder_inspection_packet
      - required_content_gap_register
      - input_basis_gap_register
      - inspection_delta_register
      - owner_source_followup_rows
      - downstream_rerun_routes
    outputs:
      - boundary_review_note
stop_conditions:
  - hwp_or_hwpx_body_review_would_be_required
  - private_raw_payload_would_be_needed
  - source_truth_or_readiness_approval_would_be_claimed
  - owner_decision_required_for_claim_upgrade
  - missing_download_requires_owner_action_or_source_followup
  - artifact_folder_body_inspection_would_be_required
  - downstream_rerun_execution_would_be_required


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "se_cross_stage_mapping_governance_v0",
  "fixture_id": "public_safe_cross_stage_governance_synthetic_001",
  "mapping_governance_binding": "public_safe_metadata_only",
  "approved_mapping_policy": {
    "inspection_mode": "metadata_only",
    "hwp_hwpx_body_review": false,
    "source_download": false,
    "readiness_approval": false
  },
  "stage_gap_scan_refs": [
    {
      "row_id": "SRR-REQ-001",
      "stage_code": "030_SRR",
      "artifact_family": "requirements_traceability",
      "visible_metadata": {
        "filename": "SRS_trace_matrix.pdf",
        "title": "SRS trace matrix"
      },
      "current_posture": "observed",
      "gap": "missing input basis for HRS-to-SRS linkage"
    },
    {
      "row_id": "PDR-ICD-001",
      "stage_code": "090_PDR",
      "artifact_family": "interface_control",
      "visible_metadata": {
        "filename": "ICD_index.html",
        "title": "Interface control index"
      },
      "current_posture": "mapped_governance_only",
      "gap": "owner decision needed for COTS boundary"
    },
    {
      "row_id": "FCA-VER-001",
      "stage_code": "180_FCA_OT",
      "artifact_family": "verification_result",
      "visible_metadata": {
        "filename": "fca_result_summary.pdf",
        "title": "FCA result summary"
      },
      "current_posture": "blocked_missing_download",
      "gap": "accepted_verification_result refs absent"
    }
  ],
  "source_gap_followup_refs": [
    {
      "row_id": "SG-001",
      "meaning": "supplier source derivative missing",
      "owner_source_followup_required": true
    }
  ],
  "review_gate_packet_refs": [
    {
      "row_id": "RG-001",
      "meaning": "one open review action item",
      "closure_evidence": false
    }
  ],
  "prior_inspection_packet_refs": [
    {
      "row_id": "PRIOR-001",
      "stable": ["PDR-ICD-001"],
      "newly_observed": ["FCA-VER-001"]
    }
  ],
  "forbidden_claims": [
    "source_truth",
    "artifact_completion",
    "review_approval",
    "verification_completion",
    "hwp_or_hwpx_body_coverage",
    "readiness_approval",
    "download_completed",
    "owner_decision_created",
    "downstream_rerun_execution"
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
