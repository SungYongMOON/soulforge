workflow_deliverable:
  schema_version: soulforge_mapping_governance_deliverable_v0
  workflow_id: se_cross_stage_mapping_governance_v0
  fixture_id: public_safe_cross_stage_governance_synthetic_001
  binding: public_safe_metadata_only
  output_state: active_governance_only

  mapping_governance_packet:
    packet_id: MGP-SYNTH-001
    inspection_scope: metadata_only
    source_basis:
      - stage_gap_scan_refs
      - source_gap_followup_refs
      - review_gate_packet_refs
      - prior_inspection_packet_refs
    aggregate_posture: pilot_executed_private_candidate_with_owner_decision_needed
    row_refs:
      - SRR-REQ-001
      - PDR-ICD-001
      - FCA-VER-001
    register_refs:
      cross_stage_artifact_matrix: CSAM-SYNTH-001
      artifact_to_input_map: AIM-SYNTH-001
      claim_ceiling_register: CCR-SYNTH-001
      missing_download_register: MDR-SYNTH-001
      stage_gap_scan_index: SGSI-SYNTH-001
      artifact_folder_inventory_index: AFII-SYNTH-001
      per_artifact_folder_inspection_packet: PAFIP-SYNTH-001
      required_content_gap_register: RCGR-SYNTH-001
      input_basis_gap_register: IBGR-SYNTH-001
      inspection_delta_register: IDR-SYNTH-001
      owner_source_followup_rows: OSFR-SYNTH-001
      downstream_rerun_routes: DRR-SYNTH-001
      boundary_review_note: BRN-SYNTH-001
    unresolved_conditions:
      - missing input basis for HRS-to-SRS linkage
      - owner decision needed for COTS boundary
      - accepted verification result refs absent
      - supplier source derivative missing
      - open review action item lacks closure evidence
    explicit_non_claims:
      - source_truth
      - artifact_completion
      - source_supported_evidence
      - validated_private_truth
      - review_approval
      - verification_completion
      - hwp_or_hwpx_body_coverage
      - stage_readiness
      - readiness_approval
      - final_readiness
      - download_completed
      - owner_decision_created
      - downstream_rerun_execution

  stage_gap_scan_index:
    index_id: SGSI-SYNTH-001
    source_status: supplied_synthetic_refs_only
    rows:
      - row_id: SRR-REQ-001
        stage_code: 030_SRR
        artifact_family: requirements_traceability
      - row_id: PDR-ICD-001
        stage_code: 090_PDR
        artifact_family: interface_control
      - row_id: FCA-VER-001
        stage_code: 180_FCA_OT
        artifact_family: verification_result

  artifact_folder_inventory_index:
    index_id: AFII-SYNTH-001
    inventory_basis: visible_metadata_from_supplied_stage_rows
    artifact_folder_refs_supplied: false
    rows:
      - inventory_row_id: INV-SRR-REQ-001
        artifact_row_id: SRR-REQ-001
        stage_code: 030_SRR
        visible_filename: SRS_trace_matrix.pdf
        visible_title: SRS trace matrix
        folder_identity: unknown_not_supplied
        body_inspection: out_of_scope
      - inventory_row_id: INV-PDR-ICD-001
        artifact_row_id: PDR-ICD-001
        stage_code: 090_PDR
        visible_filename: ICD_index.html
        visible_title: Interface control index
        folder_identity: unknown_not_supplied
        body_inspection: out_of_scope
      - inventory_row_id: INV-FCA-VER-001
        artifact_row_id: FCA-VER-001
        stage_code: 180_FCA_OT
        visible_filename: fca_result_summary.pdf
        visible_title: FCA result summary
        folder_identity: unknown_not_supplied
        body_inspection: out_of_scope

  per_artifact_folder_inspection_packet:
    packet_id: PAFIP-SYNTH-001
    inspection_mode: metadata_only
    limitations:
      - No artifact folder references were supplied.
      - Rows reflect only visible filename, title, and supplied governance metadata.
      - Artifact bodies and hidden contents remain uninspected.
    rows:
      - inspection_row_id: INS-SRR-REQ-001
        artifact_row_id: SRR-REQ-001
        metadata_observation: pdf filename and title supplied
        current_posture: observed
        unresolved_metadata_gap: missing input basis for HRS-to-SRS linkage
      - inspection_row_id: INS-PDR-ICD-001
        artifact_row_id: PDR-ICD-001
        metadata_observation: html filename and title supplied
        current_posture: mapped_governance_only
        unresolved_metadata_gap: owner decision needed for COTS boundary
      - inspection_row_id: INS-FCA-VER-001
        artifact_row_id: FCA-VER-001
        metadata_observation: pdf filename and title supplied
        current_posture: blocked_missing_download
        unresolved_metadata_gap: accepted verification result refs absent

  required_content_gap_register:
    register_id: RCGR-SYNTH-001
    rows:
      - gap_id: RCG-SRR-001
        artifact_row_id: SRR-REQ-001
        required_content_category: HRS-to-SRS linkage basis
        gap_state: missing
        determination_basis: supplied_gap_metadata
        body_content_status: unknown
      - gap_id: RCG-PDR-001
        artifact_row_id: PDR-ICD-001
        required_content_category: COTS boundary disposition
        gap_state: owner_decision_needed
        determination_basis: supplied_gap_metadata
        body_content_status: unknown
      - gap_id: RCG-FCA-001
        artifact_row_id: FCA-VER-001
        required_content_category: accepted verification result references
        gap_state: missing
        determination_basis: supplied_gap_metadata
        body_content_status: unknown

  inspection_delta_register:
    register_id: IDR-SYNTH-001
    comparison_basis: supplied_prior_inspection_packet_refs_only
    rows:
      - delta_id: DELTA-PDR-ICD-001
        artifact_row_id: PDR-ICD-001
        delta_state: stable
        certainty: stated_by_supplied_prior_ref
      - delta_id: DELTA-FCA-VER-001
        artifact_row_id: FCA-VER-001
        delta_state: newly_observed
        certainty: stated_by_supplied_prior_ref
      - delta_id: DELTA-SRR-REQ-001
        artifact_row_id: SRR-REQ-001
        delta_state: unknown
        reason: absent_from_supplied_prior_delta_metadata
    non_claims:
      - no filesystem comparison
      - no artifact-body comparison
      - no independent change verification

  cross_stage_artifact_matrix:
    matrix_id: CSAM-SYNTH-001
    rows:
      - artifact_row_id: SRR-REQ-001
        stage_code: 030_SRR
        stage_name: SRR
        artifact_family: requirements_traceability
        metadata_presence: observed
        visible_derivative_type: pdf
        coverage_posture: observed
        unresolved_gap: missing input basis for HRS-to-SRS linkage
      - artifact_row_id: PDR-ICD-001
        stage_code: 090_PDR
        stage_name: PDR
        artifact_family: interface_control
        metadata_presence: observed
        visible_derivative_type: html
        coverage_posture: mapped_governance_only
        unresolved_gap: owner decision needed for COTS boundary
      - artifact_row_id: FCA-VER-001
        stage_code: 180_FCA_OT
        stage_name: FCA_OT
        artifact_family: verification_result
        metadata_presence: observed
        visible_derivative_type: pdf
        coverage_posture: blocked_missing_download
        unresolved_gap: accepted verification result refs absent
    unrepresented_supported_stages:
      - 000_REF
      - 020_MGMT
      - 060_SFR
      - 120_CDR
      - 150_TRR_DT
      - 210_PCA
      - 240_LL
      - 270_UNCLASSIFIED
    unrepresented_stage_interpretation: no_fixture_rows_supplied
    completion_inference: prohibited

  artifact_to_input_map:
    map_id: AIM-SYNTH-001
    rows:
      - map_row_id: MAP-SRR-REQ-001
        artifact_row_id: SRR-REQ-001
        required_input: HRS-to-SRS linkage basis
        input_state: missing_or_not_referenced
        owning_authority: owner_or_upstream_source_workflow
        current_evidence_posture: observed_metadata_only
        downstream_consumer: project_readiness_digest_v0
        verification_planning_need: conditional_after_input_basis_resolution
      - map_row_id: MAP-PDR-ICD-001
        artifact_row_id: PDR-ICD-001
        required_input: owner disposition for COTS boundary
        input_state: owner_decision_needed
        owning_authority: owner
        current_evidence_posture: mapped_governance_only
        downstream_consumer: review_gate_evidence_pack_v0
        verification_planning_need: unknown_pending_owner_decision
      - map_row_id: MAP-FCA-VER-001
        artifact_row_id: FCA-VER-001
        required_input: accepted_verification_result_refs
        input_state: absent
        owning_authority: accepted_verification_result_packet_v0_or_owner
        current_evidence_posture: blocked_missing_download
        downstream_consumer: functional_configuration_audit_page_library_v0
        verification_planning_need: blocked_pending_result_refs

  input_basis_gap_register:
    register_id: IBGR-SYNTH-001
    rows:
      - gap_id: IBG-SRR-001
        artifact_row_id: SRR-REQ-001
        missing_basis: HRS-to-SRS linkage basis
        state: source_gap_followup_needed
        satisfaction_claimed: false
      - gap_id: IBG-PDR-001
        artifact_row_id: PDR-ICD-001
        missing_basis: owner-approved COTS boundary disposition
        state: owner_decision_needed
        satisfaction_claimed: false
      - gap_id: IBG-FCA-001
        artifact_row_id: FCA-VER-001
        missing_basis: accepted verification result references
        state: blocked_missing_download
        satisfaction_claimed: false

  claim_ceiling_register:
    register_id: CCR-SYNTH-001
    rows:
      - ceiling_row_id: CC-SRR-REQ-001
        artifact_row_id: SRR-REQ-001
        allowed_claim_ceiling: source_gap_followup_needed
        rationale: linkage input basis is missing
        prohibited_upgrades:
          - source_supported_evidence
          - artifact_completion
          - stage_readiness
      - ceiling_row_id: CC-PDR-ICD-001
        artifact_row_id: PDR-ICD-001
        allowed_claim_ceiling: owner_decision_needed
        rationale: COTS boundary disposition belongs to the owner
        prohibited_upgrades:
          - owner_decision_created
          - review_approval
          - stage_readiness
      - ceiling_row_id: CC-FCA-VER-001
        artifact_row_id: FCA-VER-001
        allowed_claim_ceiling: blocked_missing_download
        rationale: accepted verification result references are absent
        prohibited_upgrades:
          - download_completed
          - verification_completion
          - final_readiness

  missing_download_register:
    register_id: MDR-SYNTH-001
    rows:
      - download_gap_id: MD-SG-001
        linked_source_gap_row_id: SG-001
        linked_artifact_row_id: unknown_not_supplied
        missing_item: supplier source derivative
        state: source_gap_followup_needed
        owner_source_followup_required: true
        download_attempted: false
        download_completed_claimed: false
      - download_gap_id: MD-FCA-001
        linked_artifact_row_id: FCA-VER-001
        missing_item: accepted verification result references
        state: blocked_missing_download
        owner_source_followup_required: true
        download_attempted: false
        download_completed_claimed: false
    deduplication_note: Relationship between SG-001 and FCA-VER-001 is unknown; rows remain separate.

  owner_source_followup_rows:
    register_id: OSFR-SYNTH-001
    rows:
      - followup_id: OSF-SRR-001
        artifact_row_id: SRR-REQ-001
        action_owner: owner_or_source_custodian
        requested_item: identify an approved HRS-to-SRS linkage basis reference
        route_to: source_gap_followup_packet_v0
        stop_condition: missing_download_requires_owner_action_or_source_followup
      - followup_id: OSF-PDR-001
        artifact_row_id: PDR-ICD-001
        action_owner: owner
        requested_item: decide the COTS boundary disposition
        route_to: owner_action
        stop_condition: owner_decision_required_for_claim_upgrade
      - followup_id: OSF-FCA-001
        artifact_row_id: FCA-VER-001
        action_owner: owner_or_verification_result_custodian
        requested_item: provide or identify accepted verification result references
        route_to: source_gap_followup_packet_v0
        stop_condition: missing_download_requires_owner_action_or_source_followup
      - followup_id: OSF-SG-001
        artifact_row_id: unknown_not_supplied
        action_owner: owner_or_supplier_source_custodian
        requested_item: provide or identify the missing supplier source derivative
        route_to: source_gap_followup_packet_v0
        stop_condition: missing_download_requires_owner_action_or_source_followup
      - followup_id: OSF-RG-001
        artifact_row_id: unknown_not_supplied
        action_owner: review_action_owner
        requested_item: provide closure evidence or retain the action as open
        route_to: review_gate_evidence_pack_v0
        stop_condition: owner_decision_required_for_claim_upgrade

  downstream_rerun_routes:
    register_id: DRR-SYNTH-001
    routes:
      - route_id: ROUTE-SRR-001
        trigger: approved HRS-to-SRS linkage basis becomes available
        target_workflow: se_stage_artifact_gap_scan_v0
        recommended_input: SRR-REQ-001 with approved linkage basis reference
        execution_state: not_executed
      - route_id: ROUTE-PDR-001
        trigger: owner records COTS boundary disposition
        target_workflow: review_gate_evidence_pack_v0
        recommended_input: PDR-ICD-001 with owner-controlled decision reference
        execution_state: not_executed
      - route_id: ROUTE-FCA-001
        trigger: accepted verification result references become available
        target_workflow: functional_configuration_audit_page_library_v0
        recommended_input: FCA-VER-001 with accepted-or-blocked result references
        execution_state: not_executed
      - route_id: ROUTE-FCA-002
        trigger: accepted verification result references become available
        target_workflow: accepted_verification_result_packet_v0
        recommended_input: FCA-VER-001 stage context
        execution_state: not_executed
      - route_id: ROUTE-SG-001
        trigger: source follow-up is authorized
        target_workflow: source_gap_followup_packet_v0
        recommended_input:
          - MD-SG-001
          - MD-FCA-001
        execution_state: not_executed
      - route_id: ROUTE-RG-001
        trigger: review action closure evidence becomes available
        target_workflow: review_gate_evidence_pack_v0
        recommended_input: RG-001 with closure-evidence reference
        execution_state: not_executed

  boundary_review_note:
    note_id: BRN-SYNTH-001
    review_basis: supplied_contract_and_synthetic_fixture_only
    disposition: governance_packet_bounded_with_unresolved_stop_conditions
    boundary_observations:
      - Deliverable content is limited to supplied metadata and governance mappings.
      - No HWP or HWPX body coverage is represented.
      - Artifact bodies, source truth, and private raw payloads remain outside scope.
      - Follow-up and rerun rows are recommendations to their owning authorities.
      - Owner decisions, downloads, review closure, verification completion, and readiness are not established.
    active_stop_conditions:
      - owner_decision_required_for_claim_upgrade
      - missing_download_requires_owner_action_or_source_followup
      - artifact_folder_body_inspection_would_be_required
      - downstream_rerun_execution_would_be_required
    conditional_stop_conditions:
      - hwp_or_hwpx_body_review_would_be_required
      - private_raw_payload_would_be_needed
      - source_truth_or_readiness_approval_would_be_claimed
    final_authority_status:
      evidence_authority: false
      final_readiness_authority: false
      review_gate_authority: false
      verification_acceptance_authority: false
      owner_decision_authority: false
