```yaml
workflow_id: se_cross_stage_mapping_governance_v0
fixture_id: public_safe_cross_stage_governance_synthetic_001
output_state: active_governance_only
validation_level: pilot_executed_private_candidate
mapping_governance_binding: public_safe_metadata_only

stage_gap_scan_index:
  source: stage_gap_scan_refs
  rows:
    - row_id: SRR-REQ-001
      stage_code: 030_SRR
      stage_name: SRR
      artifact_family: requirements_traceability
      visible_metadata:
        filename: SRS_trace_matrix.pdf
        title: SRS trace matrix
      current_posture: observed
      gap: missing input basis for HRS-to-SRS linkage
    - row_id: PDR-ICD-001
      stage_code: 090_PDR
      stage_name: PDR
      artifact_family: interface_control
      visible_metadata:
        filename: ICD_index.html
        title: Interface control index
      current_posture: mapped_governance_only
      gap: owner decision needed for COTS boundary
    - row_id: FCA-VER-001
      stage_code: 180_FCA_OT
      stage_name: FCA_OT
      artifact_family: verification_result
      visible_metadata:
        filename: fca_result_summary.pdf
        title: FCA result summary
      current_posture: blocked_missing_download
      gap: accepted_verification_result refs absent

artifact_folder_inventory_index:
  inspection_mode: metadata_only
  artifact_folder_refs: []
  existing_metadata_refs:
    - SRR-REQ-001
    - PDR-ICD-001
    - FCA-VER-001
  body_inspection_performed: false
  hwp_hwpx_body_review_performed: false

per_artifact_folder_inspection_packet:
  inspection_mode: metadata_only
  rows:
    - row_id: SRR-REQ-001
      observation: visible PDF metadata is present; HRS-to-SRS input basis is not supplied
      body_content_status: not_inspected
      claim_ceiling: source_gap_followup_needed
    - row_id: PDR-ICD-001
      observation: visible HTML metadata is present; COTS boundary requires owner decision
      body_content_status: not_inspected
      claim_ceiling: owner_decision_needed
    - row_id: FCA-VER-001
      observation: visible PDF metadata is present; accepted verification result refs are absent
      body_content_status: not_inspected
      claim_ceiling: blocked_missing_download

required_content_gap_register:
  rows:
    - gap_id: RCG-SRR-001
      artifact_row_id: SRR-REQ-001
      gap_type: missing_required_input_basis
      description: HRS-to-SRS linkage input basis is absent from supplied refs
      status: open
      claim_ceiling: source_gap_followup_needed
    - gap_id: RCG-PDR-001
      artifact_row_id: PDR-ICD-001
      gap_type: owner_decision_required
      description: COTS boundary requires owner decision
      status: open
      claim_ceiling: owner_decision_needed
    - gap_id: RCG-FCA-001
      artifact_row_id: FCA-VER-001
      gap_type: missing_accepted_verification_refs
      description: accepted verification result refs are absent
      status: blocked
      claim_ceiling: blocked_missing_download

inspection_delta_register:
  prior_ref: PRIOR-001
  rows:
    - artifact_row_id: PDR-ICD-001
      delta: stable
      basis: prior_inspection_packet_refs.stable
    - artifact_row_id: FCA-VER-001
      delta: newly_observed
      basis: prior_inspection_packet_refs.newly_observed
    - artifact_row_id: SRR-REQ-001
      delta: not_determined
      basis: no prior comparison supplied

cross_stage_artifact_matrix:
  rows:
    - artifact_row_id: SRR-REQ-001
      stage_code: 030_SRR
      artifact_family: requirements_traceability
      metadata_ref: SRS_trace_matrix.pdf
      coverage_posture: observed
      required_input_basis_status: missing
      governance_status: source_gap_followup_needed
    - artifact_row_id: PDR-ICD-001
      stage_code: 090_PDR
      artifact_family: interface_control
      metadata_ref: ICD_index.html
      coverage_posture: mapped_governance_only
      required_input_basis_status: owner_decision_needed
      governance_status: owner_decision_needed
    - artifact_row_id: FCA-VER-001
      stage_code: 180_FCA_OT
      artifact_family: verification_result
      metadata_ref: fca_result_summary.pdf
      coverage_posture: blocked_missing_download
      required_input_basis_status: accepted_verification_refs_absent
      governance_status: blocked_missing_download

artifact_to_input_map:
  rows:
    - artifact_row_id: SRR-REQ-001
      required_inputs:
        - HRS-to-SRS linkage input basis
      supplied_input_refs: []
      owning_workflow_context: se_stage_artifact_gap_scan_v0
      current_evidence_posture: observed
      downstream_consumer: project_readiness_digest_v0
      verification_planning_route: verification_plan_from_page_contracts_v0
    - artifact_row_id: PDR-ICD-001
      required_inputs:
        - COTS boundary owner decision
      supplied_input_refs: []
      owning_workflow_context: se_stage_artifact_gap_scan_v0
      current_evidence_posture: mapped_governance_only
      downstream_consumer: review_gate_evidence_pack_v0
      verification_planning_route: verification_plan_from_page_contracts_v0
    - artifact_row_id: FCA-VER-001
      required_inputs:
        - accepted verification result refs
      supplied_input_refs: []
      owning_workflow_context: accepted_verification_result_packet_v0
      current_evidence_posture: blocked_missing_download
      downstream_consumer: project_readiness_digest_v0
      verification_planning_route: accepted_verification_result_packet_v0

input_basis_gap_register:
  rows:
    - gap_id: IBG-SRR-001
      artifact_row_id: SRR-REQ-001
      missing_basis: HRS-to-SRS linkage input basis
      supplied_refs: []
      status: open
      non_claim: input satisfaction not established
    - gap_id: IBG-PDR-001
      artifact_row_id: PDR-ICD-001
      missing_basis: COTS boundary owner decision
      supplied_refs: []
      status: owner_decision_needed
      non_claim: owner decision not created
    - gap_id: IBG-FCA-001
      artifact_row_id: FCA-VER-001
      missing_basis: accepted verification result refs
      supplied_refs: []
      status: blocked
      non_claim: verification completion not established

claim_ceiling_register:
  rows:
    - artifact_row_id: SRR-REQ-001
      allowed_claim_ceiling: source_gap_followup_needed
      permitted_claims:
        - metadata observation
        - governance mapping
        - source or owner follow-up needed
      explicit_non_claims:
        - source_supported_evidence
        - artifact_completion
        - stage_readiness
    - artifact_row_id: PDR-ICD-001
      allowed_claim_ceiling: owner_decision_needed
      permitted_claims:
        - metadata observation
        - governance mapping
        - owner decision needed
      explicit_non_claims:
        - owner_decision_created
        - review_approval
        - final_readiness
    - artifact_row_id: FCA-VER-001
      allowed_claim_ceiling: blocked_missing_download
      permitted_claims:
        - metadata observation
        - missing accepted verification refs
        - blocked follow-up state
      explicit_non_claims:
        - download_completed
        - verification_completion
        - review_approval
        - final_readiness

missing_download_register:
  rows:
    - missing_download_id: MDL-001
      related_artifact_row_id: FCA-VER-001
      related_source_gap_row_id: SG-001
      missing_item: supplier source derivative or accepted verification result reference
      status: blocked_missing_download
      owner_source_followup_required: true
      action: route to source_gap_followup_packet_v0
      download_performed: false
      validation_performed: false

owner_source_followup_rows:
  rows:
    - followup_id: OSF-001
      related_row_id: SRR-REQ-001
      basis: input_basis_gap
      requested_owner_or_source_action: provide or identify HRS-to-SRS linkage input basis
      route: source_gap_followup_packet_v0
      status: source_gap_followup_needed
    - followup_id: OSF-002
      related_row_id: PDR-ICD-001
      basis: required_content_gap
      requested_owner_or_source_action: make COTS boundary owner decision
      route: owner_action
      status: owner_decision_needed
    - followup_id: OSF-003
      related_row_id: FCA-VER-001
      basis: missing_download
      requested_owner_or_source_action: provide supplier derivative or accepted verification result refs
      route: source_gap_followup_packet_v0
      status: blocked_missing_download

downstream_rerun_routes:
  rows:
    - route_id: DRR-001
      trigger_row_id: SRR-REQ-001
      owning_workflow: se_stage_artifact_gap_scan_v0
      recommendation: reassess stage input gap after HRS-to-SRS basis is supplied
      execution_status: not_executed
    - route_id: DRR-002
      trigger_row_id: PDR-ICD-001
      owning_workflow: review_gate_evidence_pack_v0
      recommendation: reconsider review context after COTS boundary owner decision
      execution_status: not_executed
    - route_id: DRR-003
      trigger_row_id: FCA-VER-001
      owning_workflow: accepted_verification_result_packet_v0
      recommendation: reassess accepted-result context after required refs are supplied
      execution_status: not_executed

mapping_governance_packet:
  packet_id: MGP-001
  workflow_id: se_cross_stage_mapping_governance_v0
  fixture_id: public_safe_cross_stage_governance_synthetic_001
  status: active_governance_only
  included_refs:
    - stage_gap_scan_index
    - artifact_folder_inventory_index
    - per_artifact_folder_inspection_packet
    - required_content_gap_register
    - inspection_delta_register
    - cross_stage_artifact_matrix
    - artifact_to_input_map
    - input_basis_gap_register
    - claim_ceiling_register
    - missing_download_register
    - owner_source_followup_rows
    - downstream_rerun_routes
  source_gap_context:
    - SG-001
  review_context:
    - RG-001
  review_closure_evidence_present: false
  readiness_authority: false
  evidence_authority: false
  artifact_authoring_performed: false
  downstream_rerun_execution: false

boundary_review_note: |
  Boundary review status: governance-only, metadata-only.

  The supplied fixture supports visible filename/title observations, stage and
  artifact-family mapping, gap registration, claim-ceiling assignment, and
  follow-up routing. HWP/HWPX body review and extraction are out of scope.
  Artifact bodies were not treated as inspected. No source truth, artifact
  completion, verification completion, review approval, stage readiness, final
  readiness, download completion, owner decision creation, or downstream rerun
  execution is claimed.

  Stop conditions remain active for missing downloads, owner decisions, private
  raw payload requirements, body inspection requirements, source-truth claims,
  readiness approval, and downstream rerun execution.
```
