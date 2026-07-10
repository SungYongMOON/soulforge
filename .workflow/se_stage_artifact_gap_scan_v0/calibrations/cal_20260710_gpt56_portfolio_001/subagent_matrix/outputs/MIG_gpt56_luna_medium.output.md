```yaml
stage_artifact_gap_scan_packet:
  workflow_id: se_stage_artifact_gap_scan_v0
  fixture_id: PUBLIC_SYNTH_SE_STAGE_ARTIFACT_GAP_SCAN_V0
  source_kind: synthetic_from_workflow_contract
  public_safe: true
  target_stage_code: UNRESOLVED_PUBLIC_SYNTHETIC_STAGE
  scan_mode: single_stage_scan
  claim_ceiling: controller_applicability_only
  boundary:
    stage_scan_is_not_artifact_completion: true
    stage_scan_is_not_readiness_approval: true
    missing_facts_must_remain_unfilled: true

stage_required_artifact_matrix:
  stage_code: UNRESOLVED_PUBLIC_SYNTHETIC_STAGE
  status: provisional_pending_stage_code
  rows:
    - artifact_id: SYNTH_EXPECTED_ARTIFACT_PRESENT_001
      artifact_role: expected_stage_artifact
      presence: present
      status: observed_in_synthetic_fixture
      evidence: synthetic_fixture_only
      claim: presence_only
    - artifact_id: SYNTH_EXPECTED_ARTIFACT_MISSING_001
      artifact_role: expected_stage_artifact
      presence: missing
      status: gap
      evidence: synthetic_fixture_only
      claim: absence_only
  note: stage code가 제공되지 않아 stage-specific required matrix 확정은 보류한다.

stage_input_gap_register:
  rows:
    - gap_id: SYNTH_GAP_STAGE_CODE_001
      category: stage_scope
      status: owner_input_needed
      missing_input: target_stage_code
      impact: expected_artifact_family와 claim ceiling 확정 불가
      source_needed: false
    - gap_id: SYNTH_GAP_OWNER_INPUT_001
      category: owner_truth
      status: owner_input_needed
      missing_input: owner-confirmed stage input
      impact: 관련 산출물 진행 조건 확정 불가
      source_needed: false
    - gap_id: SYNTH_GAP_ARTIFACT_001
      category: expected_artifact
      status: blocked
      missing_input: SYNTH_EXPECTED_ARTIFACT_MISSING_001
      impact: stage artifact completeness 미확보
      source_needed: true

owner_input_queue:
  rows:
    - queue_id: SYNTH_OWNER_QUEUE_001
      priority: high
      question: 대상 stage code는 무엇인가?
      required_for: stage scope resolution
      answer_authority: owner
    - queue_id: SYNTH_OWNER_QUEUE_002
      priority: high
      question: 누락 산출물의 소유자와 제공 가능한 근거는 무엇인가?
      required_for: gap closure routing
      answer_authority: owner

draftable_artifact_queue:
  rows:
    - artifact_id: SYNTH_EXPECTED_ARTIFACT_PRESENT_001
      lane_status: draftable_not_implied
      condition: 존재 확인 정보만 있으며 작성 또는 완료를 의미하지 않음
    - artifact_id: SYNTH_EXPECTED_ARTIFACT_MISSING_001
      lane_status: not_draftable
      blocking_reason: required input and source truth are missing

diagram_need_register:
  rows:
    - diagram_id: SYNTH_DIAGRAM_NEED_001
      status: undetermined
      reason: target stage와 artifact purpose가 확정되지 않음
      next_condition: stage code 및 artifact requirement 제공

stage_blocker_register:
  rows:
    - blocker_id: SYNTH_BLOCKER_STAGE_SCOPE_001
      severity: blocking
      cause: target stage code 미제공
      release_condition: owner-confirmed target_stage_code
    - blocker_id: SYNTH_BLOCKER_MISSING_ARTIFACT_001
      severity: blocking
      cause: expected artifact missing
      release_condition: artifact 또는 승인된 source packet 제공
    - blocker_id: SYNTH_BLOCKER_OWNER_TRUTH_001
      severity: blocking
      cause: owner input required
      release_condition: owner response

downstream_workflow_route_map:
  rows:
    - route_id: SYNTH_ROUTE_OWNER_DECISION_001
      trigger_gap_family: owner_input_needed
      recommended_workflow: owner_decision_packet_v0
      required_input: owner_input_queue_and_scoped_decision_needs
      route_status: recommended
      authorization: not granted

stage_scan_summary: |
  합성 fixture 기준으로 expected artifact 1개는 존재하고, 1개는 누락 상태다.
  별도 owner input 1개가 필요하며, 누락 산출물과 stage scope 확정 전에는 후속 진행을 확정할 수 없다.
  owner input gap에 대한 가장 좁은 후속 라우트로 owner_decision_packet_v0를 권고한다.
  이 결과는 산출물 완료, 검토 승인, stage readiness 또는 verification 완료를 주장하지 않는다.

stage_readiness_summary: |
  상태: not_ready_truth_not_populated.
  대상 stage code, owner truth, 누락 산출물의 근거가 충분히 제공되지 않았다.
  따라서 stage readiness, review readiness, closure 또는 approval 판단은 유보한다.
  본 요약은 gap과 입력 필요성을 정리한 controller 결과일 뿐이다.

boundary_review_note: |
  본 deliverable은 공개 안전 합성 fixture와 workflow contract에만 근거한다.
  도구 사용, 파일 변경, runtime 사실, private evidence, source truth 또는 upstream artifact 변경을 주장하지 않는다.
  owner_input_queue는 누락 사실을 채우지 않으며, 모든 미확정 engineering truth는 owner_input_needed,
  source_needed 또는 blocked로 유지한다.
  workflow가 registered라는 사실은 어떤 stage readiness나 승인도 의미하지 않는다.
```
