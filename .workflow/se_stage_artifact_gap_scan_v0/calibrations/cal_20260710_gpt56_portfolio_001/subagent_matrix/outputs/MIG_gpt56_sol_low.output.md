workflow_id: se_stage_artifact_gap_scan_v0
fixture_id: PUBLIC_SYNTH_SE_STAGE_ARTIFACT_GAP_SCAN_V0
deliverable_kind: stage_artifact_gap_scan_bundle
public_safe: true
source_kind: synthetic_from_workflow_contract

stage_artifact_gap_scan_packet:
  packet_id: SYNTH_STAGE_SCAN_PACKET_001
  target_stage_code: unresolved
  scan_mode: single_stage_scan
  scan_status: blocked_pending_owner_input
  claim_ceiling: controller_gap_scan_only
  binding:
    stage_gap_scan_binding: synthetic_fixture_binding
    stage_expected_artifact_policy: synthetic_expected_artifact_policy
    approved_scan_policy: synthetic_public_safe_scan_policy
  boundary:
    upstream_artifacts_read_only: true
    artifact_authoring_performed: false
    readiness_approval_granted: false
    review_gate_approval_granted: false
    missing_truth_inferred: false
  stop_conditions:
    - target_stage_code가 owner에 의해 지정되기 전에는 stage-specific artifact family를 확정하지 않는다.
    - missing artifact의 내용과 완료 상태를 추론으로 채우지 않는다.
    - owner input이 제공되기 전에는 blocked row를 draftable 또는 complete로 승격하지 않는다.

stage_required_artifact_matrix:
  matrix_id: SYNTH_STAGE_ARTIFACT_MATRIX_001
  target_stage_code: unresolved
  policy_application_status: provisional_pending_stage_selection
  rows:
    - row_id: SYNTH_ARTIFACT_ROW_001
      artifact_id: SYNTH_EXPECTED_ARTIFACT_PRESENT
      expected_for_stage: unresolved
      presence_status: present
      content_sufficiency: not_assessed
      authority_status: synthetic_fixture_fact_only
      classification: blocked
      reason: target_stage_code가 없어 stage requirement 및 sufficiency를 확정할 수 없음
      non_claims:
        - artifact completion
        - artifact correctness
        - review acceptance
    - row_id: SYNTH_ARTIFACT_ROW_002
      artifact_id: SYNTH_EXPECTED_ARTIFACT_MISSING
      expected_for_stage: unresolved
      presence_status: missing
      content_sufficiency: not_applicable
      authority_status: synthetic_fixture_fact_only
      classification: owner_input_needed
      reason: stage 선택과 artifact requirement 확인이 선행되어야 함
      non_claims:
        - artifact requirement confirmation
        - readiness impact approval
        - closure

stage_input_gap_register:
  register_id: SYNTH_STAGE_INPUT_GAPS_001
  gaps:
    - gap_id: SYNTH_INPUT_GAP_001
      missing_input: target_stage_code
      gap_class: owner_input_needed
      impact:
        - expected artifact family 미확정
        - stage별 claim ceiling 미확정
        - artifact matrix의 requirement 상태 미확정
      resolution_condition: supported_stage_codes 중 하나를 owner가 지정
    - gap_id: SYNTH_INPUT_GAP_002
      missing_input: stage-specific evidence for SYNTH_EXPECTED_ARTIFACT_PRESENT
      gap_class: source_needed
      impact:
        - content sufficiency 평가 불가
        - artifact completion 판단 불가
      resolution_condition: 승인된 source 또는 stage status reference 제공

owner_input_queue:
  queue_id: SYNTH_OWNER_INPUT_QUEUE_001
  questions:
    - question_id: SYNTH_OWNER_QUESTION_001
      priority: blocking
      question: "점검 대상 stage code를 지정해 주십시오."
      allowed_values:
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
      owner_boundary: 선택은 owner truth이며 workflow가 대신 생성하지 않음
      unblocks:
        - stage-specific artifact policy application
        - required artifact matrix confirmation
        - downstream route confirmation

draftable_artifact_queue:
  queue_id: SYNTH_DRAFTABLE_ARTIFACT_QUEUE_001
  items: []
  queue_status: empty_pending_stage_selection
  rationale: stage가 확정되지 않아 artifact authoring lane을 열 수 없음
  non_claim: missing artifact는 현재 draftable로 판정되지 않음

diagram_need_register:
  register_id: SYNTH_DIAGRAM_NEEDS_001
  items: []
  assessment_status: not_determined
  rationale: artifact 종류와 stage 요구사항이 확정되지 않음

stage_blocker_register:
  register_id: SYNTH_STAGE_BLOCKERS_001
  blockers:
    - blocker_id: SYNTH_BLOCKER_001
      severity: blocking
      blocker_class: owner_input_needed
      description: target_stage_code 미지정
      affected_rows:
        - SYNTH_ARTIFACT_ROW_001
        - SYNTH_ARTIFACT_ROW_002
      release_condition: owner가 supported stage code를 지정
    - blocker_id: SYNTH_BLOCKER_002
      severity: bounded
      blocker_class: source_needed
      description: present artifact의 stage-specific sufficiency 근거 부재
      affected_rows:
        - SYNTH_ARTIFACT_ROW_001
      release_condition: 승인된 근거가 제공되고 별도 sufficiency review가 수행될 수 있는 상태

downstream_workflow_route_map:
  route_map_id: SYNTH_DOWNSTREAM_ROUTE_MAP_001
  routes:
    - route_id: SYNTH_ROUTE_001
      source_gap_ids:
        - SYNTH_INPUT_GAP_001
      recommended_workflow_id: owner_decision_packet_v0
      route_status: recommended
      expected_input: owner_input_queue_and_scoped_decision_needs
      route_purpose: target_stage_code에 대한 owner 결정을 구조화
      activation_condition: owner가 해당 downstream workflow 사용을 선택
      non_claims:
        - workflow invocation
        - owner decision completion
        - stage readiness
  deferred_routes:
    - workflow_id: source_gap_followup_packet_v0
      reason: stage 선택 후 source gap 범위를 재확인해야 함
    - workflow_id: review_gate_evidence_pack_v0
      reason: required artifact matrix와 blocker register가 아직 provisional 상태임
    - workflow_id: se_artifact_authoring_support_v0
      reason: future_candidate_only이며 selected artifact lane이 없음

stage_scan_summary:
  summary_id: SYNTH_STAGE_SCAN_SUMMARY_001
  text: >-
    합성 fixture 기준으로 expected artifact 1건은 present, 1건은 missing이다.
    그러나 target_stage_code가 지정되지 않아 두 항목의 stage requirement와
    sufficiency는 확정할 수 없다. blocking owner input 1건을 등록했으며,
    가장 좁은 다음 route로 owner_decision_packet_v0를 권고한다.
    문서 작성, artifact 완료 판정, review 승인 또는 readiness 승인은 포함하지 않는다.

stage_readiness_summary:
  summary_id: SYNTH_STAGE_READINESS_SUMMARY_001
  readiness_label: not_assessed
  readiness_claim: none
  blocking_reason: target_stage_code 및 stage-specific evidence 미확정
  interpretation: >-
    workflow 등록 상태는 stage readiness를 의미하지 않는다.
    present artifact의 존재만으로 completeness, sufficiency, acceptance 또는
    stage readiness를 주장할 수 없으며, missing artifact도 stage 선택 전에는
    확정된 stage blocker로 과대 해석하지 않는다.

boundary_review_note:
  note_id: SYNTH_BOUNDARY_REVIEW_NOTE_001
  boundary_status: preserved
  confirmed_boundaries:
    - 입력과 식별자는 synthetic 및 public-safe 범위로 유지됨
    - upstream artifact mutation 없음
    - missing engineering truth를 추론으로 보충하지 않음
    - owner decision을 생성하거나 대체하지 않음
    - artifact authoring으로 진행하지 않음
    - readiness 또는 review approval을 주장하지 않음
    - downstream route는 권고이며 실행 또는 완료 주장이 아님
  final_non_claim: >-
    이 deliverable은 bounded stage gap scan 결과이며 artifact completion,
    source truth, owner approval, review readiness, verification completion,
    public canon promotion을 증명하지 않는다.
