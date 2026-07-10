schema_version: soulforge_mapping_governance_packet_v0
workflow_id: se_cross_stage_mapping_governance_v0
fixture_id: public_safe_cross_stage_governance_synthetic_001
packet_id: MGP-SYNTH-001
binding: public_safe_metadata_only
output_state: active_governance_only
inspection_scope: metadata_only
governance_summary:
  indexed_stage_rows: 3
  represented_stages:
    - 030_SRR
    - 090_PDR
    - 180_FCA_OT
  unrepresented_supported_stages:
    - 000_REF
    - 020_MGMT
    - 060_SFR
    - 120_CDR
    - 150_TRR_DT
    - 210_PCA
    - 240_LL
    - 270_UNCLASSIFIED
  open_required_content_gaps: 3
  open_input_basis_gaps: 3
  missing_download_rows: 2
  owner_or_source_followup_rows: 4
  downstream_rerun_recommendations: 3
  stage_coverage_interpretation: >-
    The supplied fixture contains three governance rows. Absence of rows for
    other supported stages is not evidence that their artifacts are absent,
    complete, reviewed, or not applicable.
output_refs:
  stage_gap_scan_index: SGSI-SYNTH-001
  artifact_folder_inventory_index: AFII-SYNTH-001
  per_artifact_folder_inspection_packet: PAFIP-SYNTH-001
  required_content_gap_register: RCGR-SYNTH-001
  cross_stage_artifact_matrix: CSAM-SYNTH-001
  artifact_to_input_map: AIM-SYNTH-001
  input_basis_gap_register: IBGR-SYNTH-001
  claim_ceiling_register: CCR-SYNTH-001
  missing_download_register: MDR-SYNTH-001
  inspection_delta_register: IDR-SYNTH-001
  owner_source_followup_rows: OSFR-SYNTH-001
  downstream_rerun_routes: DRR-SYNTH-001
  boundary_review_note: BRN-SYNTH-001
explicit_non_claims:
  - artifact_completion
  - source_supported_evidence
  - validated_private_truth
  - stage_readiness
  - readiness_approval
  - review_approval
  - audit_closure
  - verification_completion
  - verification_acceptance
  - final_readiness
  - hwp_or_hwpx_body_coverage
  - download_completed
  - owner_decision_created
  - downstream_rerun_execution
stop_conditions_reached:
  - condition: owner_decision_required_for_claim_upgrade
    affected_rows:
      - PDR-ICD-001
  - condition: missing_download_requires_owner_action_or_source_followup
    affected_rows:
      - FCA-VER-001
      - SG-001
  - condition: downstream_rerun_execution_would_be_required
    affected_rows:
      - SRR-REQ-001
      - PDR-ICD-001
      - FCA-VER-001
    disposition: route_recommendations_only

---
schema_version: soulforge_stage_gap_scan_index_v0
index_id: SGSI-SYNTH-001
source_refs:
  - row_id: SRR-REQ-001
    stage_code: 030_SRR
    artifact_family: requirements_traceability
    current_posture: observed
    visible_metadata_ref: META-SRR-REQ-001
  - row_id: PDR-ICD-001
    stage_code: 090_PDR
    artifact_family: interface_control
    current_posture: mapped_governance_only
    visible_metadata_ref: META-PDR-ICD-001
  - row_id: FCA-VER-001
    stage_code: 180_FCA_OT
    artifact_family: verification_result
    current_posture: blocked_missing_download
    visible_metadata_ref: META-FCA-VER-001
optional_context_refs:
  source_gap_followup:
    - SG-001
  review_gate:
    - RG-001
  prior_inspection:
    - PRIOR-001

---
schema_version: soulforge_artifact_folder_inventory_index_v0
index_id: AFII-SYNTH-001
inventory_basis: fixture_visible_metadata_only
folders:
  - folder_ref: FOLDER-SRR-SYNTH-001
    stage_code: 030_SRR
    linked_rows:
      - SRR-REQ-001
    inventory_status: metadata_reference_only
    visible_items:
      - metadata_ref: META-SRR-REQ-001
        filename: SRS_trace_matrix.pdf
        title: SRS trace matrix
        body_inspected: false
  - folder_ref: FOLDER-PDR-SYNTH-001
    stage_code: 090_PDR
    linked_rows:
      - PDR-ICD-001
    inventory_status: metadata_reference_only
    visible_items:
      - metadata_ref: META-PDR-ICD-001
        filename: ICD_index.html
        title: Interface control index
        body_inspected: false
  - folder_ref: FOLDER-FCA-SYNTH-001
    stage_code: 180_FCA_OT
    linked_rows:
      - FCA-VER-001
    inventory_status: metadata_reference_only
    visible_items:
      - metadata_ref: META-FCA-VER-001
        filename: fca_result_summary.pdf
        title: FCA result summary
        body_inspected: false
inventory_limits:
  artifact_folder_refs_supplied: false
  folder_existence_confirmed: false
  filesystem_contents_confirmed: false
  artifact_bodies_inspected: false

---
schema_version: soulforge_per_artifact_folder_inspection_packet_v0
packet_id: PAFIP-SYNTH-001
inspection_mode: metadata_only
inspections:
  - inspection_id: INSP-SRR-SYNTH-001
    folder_ref: FOLDER-SRR-SYNTH-001
    linked_row_id: SRR-REQ-001
    observed_metadata:
      filename: SRS_trace_matrix.pdf
      title: SRS trace matrix
    governance_observation: requirements-traceability metadata is supplied
    unresolved_observation: HRS-to-SRS linkage input basis is missing
    artifact_body_inspected: false
    content_presence_confirmed: false
  - inspection_id: INSP-PDR-SYNTH-001
    folder_ref: FOLDER-PDR-SYNTH-001
    linked_row_id: PDR-ICD-001
    observed_metadata:
      filename: ICD_index.html
      title: Interface control index
    governance_observation: interface-control index metadata is supplied
    unresolved_observation: COTS boundary requires an owner decision
    artifact_body_inspected: false
    content_presence_confirmed: false
  - inspection_id: INSP-FCA-SYNTH-001
    folder_ref: FOLDER-FCA-SYNTH-001
    linked_row_id: FCA-VER-001
    observed_metadata:
      filename: fca_result_summary.pdf
      title: FCA result summary
    governance_observation: FCA result-summary metadata is supplied
    unresolved_observation: accepted verification result references are absent
    artifact_body_inspected: false
    content_presence_confirmed: false

---
schema_version: soulforge_required_content_gap_register_v0
register_id: RCGR-SYNTH-001
rows:
  - gap_id: RCG-SRR-SYNTH-001
    artifact_row_id: SRR-REQ-001
    required_content_category: HRS-to-SRS linkage
    status: missing_or_unsubstantiated
    basis: supplied_gap_metadata
    uncertainty: >-
      The fixture does not establish whether linkage content is absent from the
      artifact or only unsupported by approved input references.
    claim_ceiling: source_gap_followup_needed
  - gap_id: RCG-PDR-SYNTH-001
    artifact_row_id: PDR-ICD-001
    required_content_category: COTS boundary disposition
    status: ambiguous_owner_decision_needed
    basis: supplied_gap_metadata
    uncertainty: No owner disposition or artifact-body evidence is supplied.
    claim_ceiling: owner_decision_needed
  - gap_id: RCG-FCA-SYNTH-001
    artifact_row_id: FCA-VER-001
    required_content_category: accepted verification result linkage
    status: blocked_missing_input
    basis: supplied_gap_metadata
    uncertainty: >-
      Result acceptance, verification completion, and summary-body content are
      not established.
    claim_ceiling: blocked_missing_download

---
schema_version: soulforge_cross_stage_artifact_matrix_v0
matrix_id: CSAM-SYNTH-001
rows:
  - artifact_row_id: SRR-REQ-001
    stage_code: 030_SRR
    stage_name: SRR
    artifact_family: requirements_traceability
    visible_metadata_ref: META-SRR-REQ-001
    metadata_presence: observed
    coverage_posture: observed
    governance_gap: missing input basis for HRS-to-SRS linkage
    required_content_gap_ref: RCG-SRR-SYNTH-001
    completion_status: unknown
  - artifact_row_id: PDR-ICD-001
    stage_code: 090_PDR
    stage_name: PDR
    artifact_family: interface_control
    visible_metadata_ref: META-PDR-ICD-001
    metadata_presence: observed
    coverage_posture: mapped_governance_only
    governance_gap: owner decision needed for COTS boundary
    required_content_gap_ref: RCG-PDR-SYNTH-001
    completion_status: unknown
  - artifact_row_id: FCA-VER-001
    stage_code: 180_FCA_OT
    stage_name: FCA_OT
    artifact_family: verification_result
    visible_metadata_ref: META-FCA-VER-001
    metadata_presence: observed
    coverage_posture: blocked_missing_download
    governance_gap: accepted verification result refs absent
    required_content_gap_ref: RCG-FCA-SYNTH-001
    completion_status: unknown

---
schema_version: soulforge_artifact_to_input_map_v0
map_id: AIM-SYNTH-001
rows:
  - map_id: MAP-SRR-SYNTH-001
    artifact_row_id: SRR-REQ-001
    required_input_category: HRS-to-SRS linkage basis
    required_input_refs: []
    input_status: missing_or_not_supplied
    owning_workflow: se_stage_artifact_gap_scan_v0
    evidence_posture: observed_metadata_only
    downstream_consumers:
      - project_readiness_digest_v0
      - review_gate_evidence_pack_v0
      - verification_plan_from_page_contracts_v0
    verification_planning_need: unresolved_trace_linkage_basis
  - map_id: MAP-PDR-SYNTH-001
    artifact_row_id: PDR-ICD-001
    required_input_category: owner-approved COTS boundary disposition
    required_input_refs: []
    input_status: owner_decision_needed
    owning_workflow: owner_action
    evidence_posture: mapped_governance_only
    downstream_consumers:
      - project_readiness_digest_v0
      - review_gate_evidence_pack_v0
  - map_id: MAP-FCA-SYNTH-001
    artifact_row_id: FCA-VER-001
    required_input_category: accepted verification result references
    required_input_refs: []
    input_status: blocked_missing_download
    owning_workflow: accepted_verification_result_packet_v0
    evidence_posture: metadata_present_result_basis_absent
    downstream_consumers:
      - functional_configuration_audit_page_library_v0
      - project_readiness_digest_v0
      - review_gate_evidence_pack_v0

---
schema_version: soulforge_input_basis_gap_register_v0
register_id: IBGR-SYNTH-001
rows:
  - gap_id: IBG-SRR-SYNTH-001
    map_id: MAP-SRR-SYNTH-001
    artifact_row_id: SRR-REQ-001
    missing_basis: HRS-to-SRS linkage basis refs
    status: source_gap_followup_needed
    satisfaction_claimed: false
  - gap_id: IBG-PDR-SYNTH-001
    map_id: MAP-PDR-SYNTH-001
    artifact_row_id: PDR-ICD-001
    missing_basis: owner-approved COTS boundary disposition
    status: owner_decision_needed
    satisfaction_claimed: false
  - gap_id: IBG-FCA-SYNTH-001
    map_id: MAP-FCA-SYNTH-001
    artifact_row_id: FCA-VER-001
    missing_basis: accepted verification result refs
    status: blocked_missing_download
    satisfaction_claimed: false

---
schema_version: soulforge_claim_ceiling_register_v0
register_id: CCR-SYNTH-001
rows:
  - ceiling_id: CC-SRR-SYNTH-001
    artifact_row_id: SRR-REQ-001
    assigned_ceiling: source_gap_followup_needed
    rationale: Metadata is observed, but HRS-to-SRS linkage basis is missing.
    prohibited_upgrades:
      - source_supported_evidence
      - artifact_completion
      - stage_readiness
      - verification_completion
  - ceiling_id: CC-PDR-SYNTH-001
    artifact_row_id: PDR-ICD-001
    assigned_ceiling: owner_decision_needed
    rationale: COTS boundary disposition is not supplied.
    prohibited_upgrades:
      - owner_decision_created
      - artifact_completion
      - review_approval
      - stage_readiness
  - ceiling_id: CC-FCA-SYNTH-001
    artifact_row_id: FCA-VER-001
    assigned_ceiling: blocked_missing_download
    rationale: Accepted verification result references are absent.
    prohibited_upgrades:
      - download_completed
      - verification_completion
      - verification_acceptance
      - audit_closure
      - final_readiness
global_ceiling: pilot_executed_private_candidate_with_owner_decision_needed
global_ceiling_scope: workflow_shape_only
private_truth_claimed: false

---
schema_version: soulforge_missing_download_register_v0
register_id: MDR-SYNTH-001
rows:
  - download_gap_id: MD-FCA-SYNTH-001
    linked_artifact_row_id: FCA-VER-001
    required_source_category: accepted verification result references
    status: blocked_missing_download
    owner_action_required: true
    download_attempted: false
    download_completed: false
    route_to: source_gap_followup_packet_v0
  - download_gap_id: MD-SOURCE-SYNTH-001
    linked_source_gap_row_id: SG-001
    required_source_category: supplier source derivative
    status: source_gap_followup_needed
    owner_action_required: true
    download_attempted: false
    download_completed: false
    route_to: source_gap_followup_packet_v0
deduplication_note: >-
  Whether SG-001 and the FCA accepted-result gap refer to the same underlying
  source is unknown; the owning source-gap workflow must deduplicate them.

---
schema_version: soulforge_inspection_delta_register_v0
register_id: IDR-SYNTH-001
comparison_basis_ref: PRIOR-001
rows:
  - delta_id: DELTA-PDR-SYNTH-001
    artifact_row_id: PDR-ICD-001
    delta_status: stable
    basis: listed as stable in PRIOR-001
    content_stability_claimed: false
  - delta_id: DELTA-FCA-SYNTH-001
    artifact_row_id: FCA-VER-001
    delta_status: newly_observed
    basis: listed as newly observed in PRIOR-001
    content_change_claimed: false
  - delta_id: DELTA-SRR-SYNTH-001
    artifact_row_id: SRR-REQ-001
    delta_status: blocked
    basis: no prior comparison disposition supplied
    uncertainty: Added, removed, changed, or stable status cannot be determined.
comparison_limits:
  removed_rows_determined: false
  body_changes_determined: false
  prior_packet_completeness_known: false

---
schema_version: soulforge_owner_source_followup_rows_v0
register_id: OSFR-SYNTH-001
rows:
  - followup_id: FOLLOWUP-SRR-SYNTH-001
    linked_rows:
      - SRR-REQ-001
      - RCG-SRR-SYNTH-001
      - IBG-SRR-SYNTH-001
    action_needed: supply or identify approved HRS-to-SRS linkage basis refs
    route_to: source_gap_followup_packet_v0
    status: source_gap_followup_needed
    owner_decision_created: false
  - followup_id: FOLLOWUP-PDR-SYNTH-001
    linked_rows:
      - PDR-ICD-001
      - RCG-PDR-SYNTH-001
      - IBG-PDR-SYNTH-001
    action_needed: owner disposition for the COTS boundary
    route_to: owner_action
    status: owner_decision_needed
    owner_decision_created: false
  - followup_id: FOLLOWUP-FCA-SYNTH-001
    linked_rows:
      - FCA-VER-001
      - RCG-FCA-SYNTH-001
      - IBG-FCA-SYNTH-001
      - MD-FCA-SYNTH-001
    action_needed: supply or route approved accepted-verification-result refs
    route_to: source_gap_followup_packet_v0
    status: blocked_missing_download
    owner_decision_created: false
  - followup_id: FOLLOWUP-SOURCE-SYNTH-001
    linked_rows:
      - SG-001
      - MD-SOURCE-SYNTH-001
    action_needed: resolve the missing supplier source derivative
    route_to: source_gap_followup_packet_v0
    status: source_gap_followup_needed
    owner_decision_created: false
review_context:
  review_gate_row_id: RG-001
  open_action_interpretation: one open review action is reported
  closure_evidence_supplied: false
  review_approval_claimed: false
  linkage_to_artifact_rows: unknown

---
schema_version: soulforge_downstream_rerun_routes_v0
register_id: DRR-SYNTH-001
routes:
  - route_id: RERUN-SRR-SYNTH-001
    trigger_rows:
      - FOLLOWUP-SRR-SYNTH-001
    recommended_workflow: verification_plan_from_page_contracts_v0
    trigger_condition: approved HRS-to-SRS linkage basis becomes available
    route_status: recommendation_only
    rerun_executed: false
  - route_id: RERUN-PDR-SYNTH-001
    trigger_rows:
      - FOLLOWUP-PDR-SYNTH-001
    recommended_workflow: review_gate_evidence_pack_v0
    trigger_condition: owner supplies a COTS boundary disposition
    route_status: recommendation_only
    rerun_executed: false
  - route_id: RERUN-FCA-SYNTH-001
    trigger_rows:
      - FOLLOWUP-FCA-SYNTH-001
    recommended_workflow: functional_configuration_audit_page_library_v0
    prerequisite_workflows:
      - source_gap_followup_packet_v0
      - accepted_verification_result_packet_v0
    trigger_condition: approved accepted-result refs become available
    route_status: recommendation_only
    rerun_executed: false
summary_routes:
  - workflow_id: project_readiness_digest_v0
    input_refs:
      - MGP-SYNTH-001
      - CCR-SYNTH-001
    status: eligible_for_governance_summary_only
  - workflow_id: review_gate_evidence_pack_v0
    input_refs:
      - CSAM-SYNTH-001
      - BRN-SYNTH-001
    status: eligible_for_review_context_only

---
schema_version: soulforge_boundary_review_note_v0
note_id: BRN-SYNTH-001
workflow_id: se_cross_stage_mapping_governance_v0
fixture_id: public_safe_cross_stage_governance_synthetic_001
result: governance_packet_bounded_with_open_stops
scope:
  public_safe_structure_only: true
  governance_only: true
  metadata_inspection_only: true
  artifact_authoring_performed: false
  artifact_body_inspection_in_scope: false
  hwp_hwpx_body_review_in_scope: false
  hwp_hwpx_extraction_in_scope: false
boundary_findings:
  - The packet uses only supplied synthetic identifiers and visible metadata.
  - Filename and title metadata do not establish artifact-body content or completion.
  - No HWP or HWPX body coverage is asserted.
  - Missing-source rows are follow-up routes, not download or validation records.
  - Owner-action rows do not create owner decisions.
  - Downstream routes are recommendations and do not represent execution or results.
  - RG-001 reports an open action without closure evidence; review approval remains unclaimed.
  - Unrepresented stages remain unknown and are not treated as complete, absent, or not applicable.
authority_non_claims:
  evidence_authority: false
  source_truth: false
  artifact_completion: false
  review_approval: false
  verification_completion: false
  stage_readiness_approval: false
  final_readiness: false
open_stops:
  - owner decision required for PDR-ICD-001
  - source follow-up required for SRR-REQ-001
  - missing-download follow-up required for FCA-VER-001 and SG-001
  - artifact-body inspection would be required for content-level conclusions
  - downstream execution would be required to establish any rerun result
disposition: >-
  Retain as an active governance-only packet. Claim upgrades remain blocked
  until the appropriate owners or upstream workflows provide approved inputs;
  any subsequent content review, source validation, acceptance, or readiness
  determination remains outside this workflow.
