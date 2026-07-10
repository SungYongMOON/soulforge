{
  "workflow_id": "se_stage_artifact_gap_scan_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|administrator",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "administrator"
  },
  "outputs": {
    "stage_artifact_gap_scan_packet": "대상 stage의 합성 점검 결과: 기대 산출물 2건 중 1건은 존재하고 1건은 누락되어 있다. owner input 1건이 필요하며 downstream route 1건을 권고한다. 누락된 engineering truth는 추론으로 보완하지 않는다.",
    "stage_required_artifact_matrix": "ART-01: 기대 산출물, 상태=존재 확인. ART-02: 기대 산출물, 상태=누락, 처리=blocker 및 source_needed로 유지. 계약에 없는 산출물 명칭과 내용은 지정하지 않는다.",
    "stage_input_gap_register": "GAP-01: ART-02 작성 또는 판단에 필요한 입력이 부족하다. 분류=owner_input_needed, source_needed. 상태=open.",
    "owner_input_queue": "OWNER-01: 누락 산출물 ART-02에 필요한 승인된 입력 또는 근거를 제공해야 한다. 우선순위=stage scan 후속 조치, 상태=대기.",
    "draftable_artifact_queue": "현재 즉시 작성 가능하다고 확인된 산출물은 없다. ART-02는 owner input과 승인된 source가 확보되기 전까지 draftable로 승격하지 않는다.",
    "diagram_need_register": "합성 사실만으로는 diagram 필요 여부를 판정할 수 없다. 상태=미정, 추가 owner input 필요 없음으로 단정하지 않음.",
    "stage_blocker_register": "BLOCK-01: 기대 산출물 ART-02 누락. BLOCK-02: 관련 owner input 1건 미확보. 두 항목 모두 stage readiness 판단을 차단하는 근거가 아니라, readiness 판단을 수행하지 않기 위해 유지되는 점검상 미해결 항목이다.",
    "downstream_workflow_route_map": "ROUTE-01: owner input과 승인된 source 확보 후, 문서 작성 또는 승인 판단 권한을 암시하지 않는 적절한 후속 workflow로 전달을 권고한다. 구체 workflow id는 계약에 없으므로 지정하지 않는다.",
    "stage_scan_summary": "존재 산출물 1건, 누락 산출물 1건, owner input 필요 1건, 권고 downstream route 1건이다. 첫 safe move인 stage gap scan 범위에서 종료한다.",
    "stage_readiness_summary": "stage readiness는 판정하거나 주장하지 않는다. 현재 공개 readiness label인 registered는 controller workflow package의 등록 상태이며 대상 stage의 준비 완료를 의미하지 않는다.",
    "boundary_review_note": "공개 합성 계약과 scenario facts만 사용했다. upstream artifact 변경, 문서 작성, review approval, production-ready 또는 profile-optimized 주장을 수행하지 않았다."
  },
  "provenance": [
    "public-safe synthetic workflow contract",
    "synthetic scenario facts and boundary policy"
  ],
  "gaps": [
    "기대 산출물 ART-02가 누락되어 있다.",
    "ART-02 관련 owner input과 승인된 source가 필요하다."
  ],
  "downstream_handoff": [
    "OWNER-01 입력과 승인된 근거를 확보한다.",
    "확보 후 권한 경계를 유지하는 후속 workflow 1건으로 라우팅한다."
  ],
  "boundary_review_note": [
    "registered는 workflow package 등록 상태일 뿐 stage readiness 또는 production readiness가 아니다.",
    "누락된 engineering truth는 blocker, owner_input_needed, source_needed로 남겼으며 추론으로 채우지 않았다."
  ],
  "no_claims": [
    "도구 사용, 파일 편집, runtime path, hidden reference 또는 private/raw evidence를 주장하지 않는다.",
    "stage readiness, review approval, profile optimization 또는 production readiness를 주장하지 않는다."
  ]
}
