{
  "workflow_id": "se_stage_artifact_gap_scan_v0",
  "candidate_label": "gpt-5.5|xhigh|dwarf|administrator",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
    "species": "dwarf",
    "class": "administrator"
  },
  "outputs": {
    "stage_artifact_gap_scan_packet": "target_stage_code=SYNTH_STAGE_A; 범위=한 체계공학 stage의 산출물, 입력, 근거, 질문, 다음 라우트 점검; 결론=expected artifact 1건 존재, expected artifact 1건 누락, owner input 1건 필요, downstream route 1건 권고; 제한=문서 작성, 승인 판단, readiness claim 없음.",
    "stage_required_artifact_matrix": "SYNTH_ARTIFACT_EXISTING_001: expected=true, observed=true, status=present, action=no_drafting_action; SYNTH_ARTIFACT_MISSING_001: expected=true, observed=false, status=missing, action=register_gap_and_route.",
    "stage_input_gap_register": "GAP-001: missing_expected_artifact=SYNTH_ARTIFACT_MISSING_001, gap_type=source_needed, impact=stage scan cannot treat required artifact set as complete; disposition=keep as blocker/source_needed, do not infer content.",
    "owner_input_queue": "OWNER-INPUT-001: owner must provide the missing engineering truth or approved source for SYNTH_ARTIFACT_MISSING_001; reason=contract requires missing engineering truth to remain owner_input_needed/source_needed rather than inferred.",
    "draftable_artifact_queue": "DRAFT-QUEUE-001: no draftable artifact is released for drafting in this bounded scan; only a downstream drafting/recovery route may be recommended after owner input/source is supplied.",
    "diagram_need_register": "DIAGRAM-NEED-001: no diagram need is established by the synthetic facts; diagram status remains not_requested unless downstream route receives approved stage content requiring visualization.",
    "stage_blocker_register": "BLOCKER-001: required artifact gap remains open for SYNTH_ARTIFACT_MISSING_001; BLOCKER-002: owner input/source required before any stronger stage completeness or readiness statement.",
    "downstream_workflow_route_map": "ROUTE-001: recommended downstream route=artifact_recovery_or_drafting_precheck; trigger=owner supplies missing input/source; forbidden escalation=review approval or stage readiness registration from this scan alone.",
    "stage_scan_summary": "Synthetic stage scan found one present expected artifact and one missing expected artifact. The missing item is recorded as a gap with owner input needed. The scan stops at route recommendation and does not produce or approve stage artifacts.",
    "stage_readiness_summary": "No stage readiness claim is made. The workflow package readiness label may be registered, but SYNTH_STAGE_A readiness is not registered, approved, or inferred.",
    "boundary_review_note": "Public-safe synthetic boundary preserved: only the supplied contract, scenario facts, and boundary policy are used; no hidden refs, private/raw evidence, runtime paths, upstream mutation, tool-use claim, file-edit claim, or stronger canon/source authority claim is introduced."
  },
  "provenance": [
    "Synthetic workflow contract for SE Stage Artifact Gap Scan v0",
    "Synthetic scenario facts: one artifact exists, one artifact missing, one owner input required, one downstream route recommended",
    "Boundary policy supplied in prompt"
  ],
  "gaps": [
    "One expected artifact is missing: SYNTH_ARTIFACT_MISSING_001",
    "One owner input is required before the missing artifact gap can be closed",
    "Missing engineering truth remains source_needed and is not inferred"
  ],
  "downstream_handoff": [
    "Route missing artifact recovery or drafting precheck after owner input/source is supplied",
    "Keep review approval and stage readiness registration out of scope for this bounded controller scan"
  ],
  "boundary_review_note": [
    "Public-safe synthetic boundaries are explicit and preserved.",
    "The output makes no claim of tool use, file edits, runtime paths, hidden private evidence, upstream mutation, production readiness, profile optimization, or stage readiness approval."
  ],
  "no_claims": [
    "No readiness claim for the target stage",
    "No claim of document creation, artifact approval, source authority beyond the supplied synthetic contract, or mutation of upstream artifacts"
  ]
}
