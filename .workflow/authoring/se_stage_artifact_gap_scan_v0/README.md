# se_stage_artifact_gap_scan_v0

## 무엇을 하는가

`se_stage_artifact_gap_scan_v0`는 체계공학 프로젝트의 한 `stage`를 잡고,

- 필요한 산출물 family가 무엇인지,
- 현재 어떤 산출물/근거/질문이 이미 있는지,
- 무엇이 `draftable`, `owner_input_needed`, `source_needed`, `blocked`, `not_applicable`인지,
- 다음에 어느 workflow lane으로 넘겨야 하는지

를 정리하는 bounded controller workflow draft이다.

이 workflow는 문서를 직접 완성하거나 review approval을 내리지 않는다.

## 왜 필요한가

`se_foldertree_generate`를 더 키워서 문서 작성, trace, review 준비까지 다 넣으면 경계가 무너진다. 이 workflow는 그 다음 층에서

- stage visibility,
- owner question,
- source gap,
- downstream route

를 먼저 고정하기 위해 만들어졌다.

## 현재 성숙도

- 위치: `.workflow/authoring/`
- 상태: `draft`
- canon 등록: 아직 아님
- 현재 claim ceiling:
  - stage visibility: 가능
  - owner/source gap queueing: 가능
  - downstream route mapping: 가능
  - artifact completion / review approval / compliance claim: 불가

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

## 다음 승격 조건

이 draft를 `.workflow/<workflow_id>/` canon entry로 승격하려면 적어도 아래 증거가 더 필요하다.

1. bounded fixture 또는 project binding에서 controlled run evidence
2. workflow-generator verification gate 기준 구조/실행/검토 증거
3. public/private 경계 검토
4. overclaim 없는 readiness 표현

## 관련 lane

- upstream reused surface:
  - `source_packet_sufficiency_review_v0`
  - `source_gap_followup_packet_v0`
  - `review_gate_evidence_pack_v0`
- downstream planned surface:
  - `owner_decision_packet_v0`
  - `project_readiness_digest_v0`
  - `se_artifact_authoring_support_v0` (future candidate)
