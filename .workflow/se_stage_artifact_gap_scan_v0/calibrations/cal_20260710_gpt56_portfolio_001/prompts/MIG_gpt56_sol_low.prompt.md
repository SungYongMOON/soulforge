You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=administrator.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: se_stage_artifact_gap_scan_v0
kind: workflow
status: active
title: SE Stage Artifact Gap Scan v0
summary: 한 체계공학 stage의 산출물/입력/근거/질문/다음 라우트를 점검하되, 문서 작성이나 승인 판단으로 넘어가지 않는 bounded controller workflow.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
history: history/
calibrations: calibrations/
inputs:
  - stage_gap_scan_binding
  - target_stage_code
  - stage_expected_artifact_policy
  - approved_scan_policy
optional_inputs:
  - snapshot_or_stage_status_refs
  - mission_candidate_refs
  - foldertree_manifest_refs
  - source_packet_refs
  - sufficiency_review_refs
  - source_gap_followup_refs
  - review_gate_packet_refs
  - owner_decision_refs
  - baseline_or_change_control_refs
outputs:
  - stage_artifact_gap_scan_packet
  - stage_required_artifact_matrix
  - stage_input_gap_register
  - owner_input_queue
  - draftable_artifact_queue
  - diagram_need_register
  - stage_blocker_register
  - downstream_workflow_route_map
  - stage_scan_summary
  - stage_readiness_summary
  - boundary_review_note
validation_level: registered_controller_private_evidence
registration_policy: owner_requested_registration
workflow_modes:
  - single_stage_scan
  - rerun_update
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
  demonstrated_private_evidence:
    - stage_code: 090_PDR
      evidence_posture: bounded_binding_smoke_and_governance_route_packets
      claim_ceiling: controller_applicability_only
    - stage_code: 120_CDR
      evidence_posture: bootstrap_and_governance_truth_intake_route
      claim_ceiling: not_ready_truth_not_populated
    - stage_code: 150_TRR_DT
      evidence_posture: bootstrap_route_map_only
      claim_ceiling: not_ready_truth_not_populated
  non_claim: "Registered controller scope does not imply any stage readiness, review approval, closure, test execution, or verification completion."
upstream_workflows:
  - workflow_id: project_readiness_digest_v0
    expected_outputs:
      - owner_input_queue
      - next_action_recommendations
    status: optional_reporting_context
  - workflow_id: source_gap_followup_packet_v0
    expected_outputs:
      - owner_action_queue
      - retry_trigger_register
      - downstream_unblock_map
    status: optional_gap_context
  - workflow_id: source_packet_sufficiency_review_v0
    expected_outputs:
      - blocked_fields_register
      - owner_followup_needed
      - allowed_claim_ceiling
    status: optional_evidence_ceiling_context
  - workflow_id: review_gate_evidence_pack_v0
    expected_outputs:
      - review_blockers
      - action_item_register
      - readiness_summary
    status: optional_review_context
  - workflow_id: accepted_verification_result_packet_v0
    expected_outputs:
      - accepted_result_rows
      - blocked_or_inconclusive_rows
      - scoped_acceptance_provenance
    status: optional_later_stage_result_context
downstream_workflows:
  - workflow_id: owner_decision_packet_v0
    expected_input: owner_input_queue_and_scoped_decision_needs
    status: planned
  - workflow_id: project_readiness_digest_v0
    expected_input: stage_scan_summary_and_owner_input_queue
    status: planned
  - workflow_id: source_gap_followup_packet_v0
    expected_input: source_or_evidence_gap_items_from_stage_scan
    status: planned
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: stage_required_artifact_matrix_and_stage_blocker_register
    status: planned
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: verification_planning_gap_rows_or_stage_route_map
    status: planned_for_verification_planning_rows
  - workflow_id: test_harness_asset_planning_v0
    expected_input: trr_dt_harness_or_fixture_gap_rows
    status: planned_for_trr_dt_rows
  - workflow_id: accepted_verification_result_packet_v0
    expected_input: accepted_or_blocked_result_rows_from_later_stage_scan
    status: planned_for_result_evidence_rows
  - workflow_id: functional_configuration_audit_page_library_v0
    expected_input: fca_ot_functional_audit_gap_rows
    status: planned_for_fca_ot_rows
  - workflow_id: physical_configuration_audit_asset_package_v0
    expected_input: pca_physical_configuration_gap_rows
    status: planned_for_pca_rows
  - workflow_id: se_artifact_authoring_support_v0
    expected_input: selected_artifact_lane_after_gap_scan
    status: future_candidate_only
stage_gap_scan_contract:
  owns:
    - stage_scope_selection
    - expected_artifact_matrix_for_one_stage
    - current_artifact_presence_and_status_rows
    - input_gap_register
    - owner_input_queue
    - draftable_artifact_queue
    - diagram_need_register
    - stage_blocker_register
    - downstream_workflow_route_map
    - stage_readiness_summary
  does_not_own:
    - artifact_authoring
    - source_truth
    - owner_decision_creation
    - readiness_approval
    - review_gate_approval
    - foldertree_generation
    - public_canon_promotion
  authority_boundary:
    stage_scan_is_not_artifact_completion: true
    stage_scan_is_not_review_readiness_approval: true
    owner_input_queue_does_not_fill_missing_facts: true
    upstream_artifacts_are_read_only: true
    unsupported_content_remains_blocked_or_owner_input_needed: true
  required_input_shapes:
    stage_gap_scan_binding: templates/stage_gap_scan_binding.template.yaml
    stage_expected_artifact_policy: templates/stage_expected_artifact_policy.template.yaml
  required_output_shapes:
    stage_artifact_gap_scan_packet: templates/stage_artifact_gap_scan_packet.template.yaml
    stage_required_artifact_matrix: templates/stage_required_artifact_matrix.template.yaml
    stage_input_gap_register: templates/stage_input_gap_register.template.yaml
    owner_input_queue: templates/owner_input_queue.template.yaml
    draftable_artifact_queue: templates/draftable_artifact_queue.template.yaml
    diagram_need_register: templates/diagram_need_register.template.yaml
    stage_blocker_register: templates/stage_blocker_register.template.yaml
    downstream_workflow_route_map: templates/downstream_workflow_route_map.template.yaml
    stage_scan_summary: templates/stage_scan_summary.template.md
    stage_readiness_summary: templates/stage_readiness_summary.template.md
    boundary_review_note: templates/boundary_review_note.template.md
notes:
  - 이 package 는 controller workflow canon entry 로 등록되었지만 stage readiness 를 등록한 것은 아니다.
  - 첫 safe move 는 stage gap scan 이지, 문서 작성이나 review approval 이 아니다.
  - 사람-facing 설명은 한국어로 유지하되, workflow id 와 file path 는 기존 canon 규칙을 따른다.
  - missing engineering truth 는 blocker, owner_input_needed, source_needed 로 남겨야 하며 추론으로 채우지 않는다.
  - 이 package 는 profile-optimized 또는 production-ready claim 을 갖지 않는다.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: se_stage_artifact_gap_scan_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_stage_scan_binding
    title: Prepare Stage Scan Binding
    actor_slot: stage_scan_controller
    action:
      kind: stage_gap_scan_binding_setup
    summary: target stage, scan policy, expected artifact policy, boundary posture를 고정한다.
  - step_id: resolve_stage_scope
    title: Resolve Stage Scope
    actor_slot: stage_scan_controller
    action:
      kind: stage_scope_resolution
    summary: stage code를 expected artifact family와 claim ceiling으로 변환한다.
  - step_id: inventory_stage_artifact_surfaces
    title: Inventory Current Artifact Surfaces
    actor_slot: stage_inventory_reader
    action:
      kind: stage_surface_inventory
    summary: foldertree, snapshot, mission, review packet 등 현재 surface를 read-only로 수집한다.
  - step_id: map_required_artifact_matrix
    title: Map Required Artifact Matrix
    actor_slot: artifact_matrix_mapper
    action:
      kind: required_artifact_matrix_mapping
    summary: stage별 required artifact matrix와 상태 crosswalk를 만든다.
  - step_id: classify_stage_gaps_and_blockers
    title: Classify Stage Gaps And Blockers
    actor_slot: gap_classifier
    action:
      kind: stage_gap_and_blocker_classification
    summary: row를 draftable, owner_input_needed, source_needed, blocked, not_applicable로 분류한다.
  - step_id: derive_draftable_and_diagram_registers
    title: Derive Draftable And Diagram Registers
    actor_slot: draft_lane_mapper
    action:
      kind: draftable_lane_and_diagram_need_mapping
    summary: 바로 초안 가능한 산출물과 도식 필요 항목을 분리해 register로 쓴다.
  - step_id: build_owner_input_queue
    title: Build Owner Input Queue
    actor_slot: owner_queue_writer
    action:
      kind: owner_input_queue_generation
    summary: owner truth 없이는 진행할 수 없는 항목을 compact question queue로 줄인다.
  - step_id: map_downstream_workflow_routes
    title: Map Downstream Workflow Routes
    actor_slot: route_mapper
    action:
      kind: downstream_workflow_route_mapping
    summary: gap family별로 가장 좁은 downstream workflow lane을 정한다.
  - step_id: write_stage_bundle
    title: Write Stage Bundle
    actor_slot: packet_writer
    action:
      kind: stage_gap_scan_bundle_write
    summary: matrix, gap register, queue, blocker, route map, stage packet을 쓴다.
  - step_id: write_stage_readiness_and_boundary_review
    title: Write Stage Readiness And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: stage_gap_scan_boundary_and_summary_review
    summary: readiness summary와 boundary note를 쓰고 overclaim이 없는지 확인한다.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "se_stage_artifact_gap_scan_v0",
  "fixture_id": "PUBLIC_SYNTH_SE_STAGE_ARTIFACT_GAP_SCAN_V0",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "SE Stage Artifact Gap Scan v0",
  "workflow_summary": "한 체계공학 stage의 산출물/입력/근거/질문/다음 라우트를 점검하되, 문서 작성이나 승인 판단으로 넘어가지 않는 bounded controller workflow.",
  "workflow_readiness_label": "registered",
  "input_refs": [
    "stage_gap_scan_binding",
    "target_stage_code",
    "stage_expected_artifact_policy",
    "approved_scan_policy"
  ],
  "expected_output_groups": [
    "stage_artifact_gap_scan_packet",
    "stage_required_artifact_matrix",
    "stage_input_gap_register",
    "owner_input_queue",
    "draftable_artifact_queue",
    "diagram_need_register",
    "stage_blocker_register",
    "downstream_workflow_route_map",
    "stage_scan_summary",
    "stage_readiness_summary",
    "boundary_review_note"
  ],
  "must_preserve": [
    "stage",
    "gap",
    "owner input",
    "boundary",
    "no readiness claim"
  ],
  "scenario_facts": [
    "one expected artifact exists",
    "one expected artifact is still missing",
    "one owner input is required",
    "one downstream route is recommended"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
