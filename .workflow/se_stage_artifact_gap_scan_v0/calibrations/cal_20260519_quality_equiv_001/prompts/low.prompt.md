You are calibrating the Soulforge workflow "se_stage_artifact_gap_scan_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "se_stage_artifact_gap_scan_v0",
  "candidate_label": "gpt-5.5|low|dwarf|administrator",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "low", "species": "dwarf", "class": "administrator" },
  "outputs": {
  "stage_artifact_gap_scan_packet": "...",
  "stage_required_artifact_matrix": "...",
  "stage_input_gap_register": "...",
  "owner_input_queue": "...",
  "draftable_artifact_queue": "...",
  "diagram_need_register": "...",
  "stage_blocker_register": "...",
  "downstream_workflow_route_map": "...",
  "stage_scan_summary": "...",
  "stage_readiness_summary": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: SE Stage Artifact Gap Scan v0
- summary: 한 체계공학 stage의 산출물/입력/근거/질문/다음 라우트를 점검하되, 문서 작성이나 승인 판단으로 넘어가지 않는 bounded controller workflow.
- current public readiness label: registered
- execution mode: local_tool_sequence
- inputs:
- stage_gap_scan_binding
- target_stage_code
- stage_expected_artifact_policy
- approved_scan_policy
- expected output groups:
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
- must preserve:
- stage
- gap
- owner input
- boundary
- no readiness claim
- workflow notes:
- 이 package 는 controller workflow canon entry 로 등록되었지만 stage readiness 를 등록한 것은 아니다.
- 첫 safe move 는 stage gap scan 이지, 문서 작성이나 review approval 이 아니다.
- 사람-facing 설명은 한국어로 유지하되, workflow id 와 file path 는 기존 canon 규칙을 따른다.
- missing engineering truth 는 blocker, owner_input_needed, source_needed 로 남겨야 하며 추론으로 채우지 않는다.
- 이 package 는 profile-optimized 또는 production-ready claim 을 갖지 않는다.

Synthetic scenario facts:
- one expected artifact exists
- one expected artifact is still missing
- one owner input is required
- one downstream route is recommended

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
