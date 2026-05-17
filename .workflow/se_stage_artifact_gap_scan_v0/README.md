# se_stage_artifact_gap_scan_v0

## 무엇을 하는가

`se_stage_artifact_gap_scan_v0`는 체계공학 프로젝트의 한 `stage`를 잡고,

- 필요한 산출물 family가 무엇인지,
- 현재 어떤 산출물/근거/질문이 이미 있는지,
- 무엇이 `draftable`, `owner_input_needed`, `source_needed`, `blocked`, `not_applicable`인지,
- 다음에 어느 workflow lane으로 넘겨야 하는지

를 정리하는 bounded controller workflow이다.

이 workflow는 문서를 직접 완성하거나 review approval을 내리지 않는다.

## 왜 필요한가

`se_foldertree_generate`를 더 키워서 문서 작성, trace, review 준비까지 다 넣으면 경계가 무너진다. 이 workflow는 그 다음 층에서

- stage visibility,
- owner question,
- source gap,
- downstream route

를 먼저 고정하기 위해 만들어졌다.

## 현재 성숙도

- 위치: `.workflow/se_stage_artifact_gap_scan_v0/`
- 상태: `active`
- canon 등록: 완료
- validation level: `registered_controller_private_evidence`
- 현재 claim ceiling:
  - stage visibility: 가능
  - owner/source gap queueing: 가능
  - downstream route mapping: 가능
  - artifact completion / review approval / compliance claim: 불가
  - PDR/CDR/TRR/FCA/OT/PCA readiness claim: 불가
  - production-ready / profile-optimized claim: 불가

등록 근거는 private evidence에 있다. PDR binding smoke와 governance route
packet은 controller applicability를 지지하고, CDR/TRR bootstrap은 truth가
비어 있을 때 claim을 `not_ready_truth_not_populated`로 낮추는 동작을 지지한다.
이 등록은 workflow package 자체 등록이지 stage readiness 등록이 아니다.

## 입력

- `stage_gap_scan_binding`
- `target_stage_code`
- `stage_expected_artifact_policy`
- `approved_scan_policy`

선택 입력으로 snapshot, foldertree manifest, source packet, sufficiency review, review gate packet, owner decision ref 등을 받을 수 있다.

## 출력

- `stage_artifact_gap_scan_packet`
- `stage_required_artifact_matrix`
- `stage_input_gap_register`
- `owner_input_queue`
- `draftable_artifact_queue`
- `diagram_need_register`
- `stage_blocker_register`
- `downstream_workflow_route_map`
- `stage_scan_summary`
- `stage_readiness_summary`
- `boundary_review_note`

## 절대 하지 않는 것

- 실제 문서 본문 완성
- owner decision 생성
- source truth 발명
- review approval
- verification completion 주장
- `_workspaces` 또는 upstream packet mutation

## 다음 검증 조건

이 package는 canon entry로 등록되었지만, 아래 증거 전에는 더 강한 성숙도나 stage readiness를 주장하지 않는다.

1. stage별 project-local binding run evidence
2. 별도 verifier 또는 review gate packet
3. public/private 경계 검토
4. overclaim 없는 stage-local readiness 표현
5. 별도 public-safe calibration 전까지 profile policy는 draft 유지

## 관련 lane

- upstream reused surface:
  - `source_packet_sufficiency_review_v0`
  - `source_gap_followup_packet_v0`
  - `review_gate_evidence_pack_v0`
- downstream planned surface:
  - `owner_decision_packet_v0`
  - `project_readiness_digest_v0`
  - `verification_plan_from_page_contracts_v0`
  - `test_harness_asset_planning_v0`
  - `accepted_verification_result_packet_v0`
  - `functional_configuration_audit_page_library_v0`
  - `physical_configuration_audit_asset_package_v0`
  - `se_artifact_authoring_support_v0` (future candidate)
