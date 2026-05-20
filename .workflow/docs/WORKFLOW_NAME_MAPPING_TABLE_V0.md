# Workflow Name Mapping Table v0

Status: `draft`
Owner: `.workflow`
Claim ceiling: `canon_candidate`

이 문서는 `.workflow/index.yaml` 에 등록된 workflow 의 이름 매핑 초안이다. 여기의 `global_name_ko` 와 `display_name_ko` 는 alias 후보이며, 실제 rename, folder 변경, `workflow_id` 변경, validator enforcement 를 의미하지 않는다.

## 목적

- 기존 canonical `workflow_id` 를 유지하면서 사람이 부르기 쉬운 한글 호출 alias 후보를 전체 목록으로 정리한다.
- 다음 rename 또는 alias catalog 설계가 필요할 때 빠뜨린 workflow 없이 검토할 수 있는 작업표를 제공한다.
- `.party` resolve 와 연결될 때 `global_name_ko -> workflow_id -> party_id -> path` 흐름을 문서상으로만 확인한다.

## 해석 규칙

- `workflow_id` 는 `.workflow/index.yaml` 의 현재 내부 안정 키다.
- `권장 global_name_ko` 는 slash 없는 한글 호출 alias 후보이며 아직 catalog 에 등록되지 않았다.
- `권장 display_name_ko` 는 설명용 이름이며 호출 key 가 아니다.
- `묶음` 은 검토 편의를 위한 draft 분류다.
- `비고` 는 rename 판단이 아니라 후속 owner 검토를 위한 낮은 claim 메모다.

## 전체 매핑표

| workflow_id | 권장 global_name_ko | 권장 display_name_ko | 묶음 | 비고 |
| --- | --- | --- | --- | --- |
| `frontline_assault` | `운영_전방작업조율` | `운영/전방/작업조율` | 운영 | 짧은 legacy id 의미를 alias 후보로 보강한다. |
| `build_lineage_map` | `작성_계보지도작성` | `작성/계보/지도작성` | 작성 | lineage production party 의 기본 workflow 관찰값이다. |
| `author_skill_package` | `작성_스킬패키지생성` | `작성/스킬/패키지생성` | 작성 | current default authoring lane 이지만 universal standard 로 고정하지 않는다. |
| `meeting_followup` | `운영_회의후속정리` | `운영/회의/후속정리` | 운영 | 회의 후속 정리용 legacy id 를 유지한다. |
| `device_system_diagram_generation` | `작성_시스템도식생성` | `작성/장치시스템/도식생성` | 작성 | diagram artifact 생성 workflow 로 읽는다. |
| `whole_xml_page_split_v0` | `자산_XML페이지분할_v0` | `자산/XML/페이지분할` | 자산 | upstream split 이며 normalize 나 등록을 claim 하지 않는다. |
| `page_xml_normalize_spec_v0` | `자산_페이지XML정규화_v0` | `자산/페이지XML/정규화명세` | 자산 | sidecar/spec bridge 성격을 표시한다. |
| `capture_xml_intake_library_v0` | `자산_XML라이브러리수집_v0` | `자산/XML/인입라이브러리수집` | 자산 | read-only intake library 구축 후보 이름이다. |
| `official_source_packet_collect_v0` | `소스_공식패킷수집_v0` | `소스/공식패킷/수집` | 소스 | official 또는 owner-approved source packet 수집으로 제한한다. |
| `asset_patch_attach_mdd_v0` | `자산_MDD패치부착_v0` | `자산/MDD/패치부착` | 자산 | owner-supplied MDD 부착이며 source authority 가 아니다. |
| `exp_xml_component_materials` | `자산_EXP부품자료수집` | `자산/EXP부품/자료수집` | 자산 | legacy id 에 `_v0` 가 없지만 즉시 rename 하지 않는다. |
| `component_pcb_layout_guide_extraction` | `자산_PCB레이아웃가이드추출` | `자산/PCB레이아웃/가이드추출` | 자산 | 자료 추출 workflow 이며 layout 승인 claim 이 아니다. |
| `page_quantitative_enrichment_v0` | `자산_페이지정량보강_v0` | `자산/페이지/정량보강` | 자산 | source-backed 또는 explicit derived slot 보강으로 제한한다. |
| `simulation_source_collect_v0` | `시뮬레이션_소스수집_v0` | `시뮬레이션/소스/수집` | 시뮬레이션 | deck/run 전 source readiness 수집 후보 이름이다. |
| `simulation_deck_prepare_v0` | `시뮬레이션_덱구성_v0` | `시뮬레이션/덱/구성` | 시뮬레이션 | 실행 전 준비이며 run result 를 claim 하지 않는다. |
| `simulation_run_verify_v0` | `시뮬레이션_측정검사_v0` | `시뮬레이션/실행측정/검사` | 시뮬레이션 | run 또는 blocked-run packaging 이며 owner acceptance 는 아니다. |
| `simulator_policy_packet_v0` | `시뮬레이션_정책패킷기록_v0` | `시뮬레이션/정책/패킷기록` | 시뮬레이션 | runtime identity 와 authorization posture 기록으로 제한한다. |
| `simulation_stimulus_measurement_packet_v0` | `시뮬레이션_자극측정패킷_v0` | `시뮬레이션/자극측정/패킷` | 시뮬레이션 | stimuli 와 measurement definition 준비 후보 이름이다. |
| `xml_harness_composition_v0` | `자산_XML하네스구성_v0` | `자산/XML하네스/구성` | 자산 | candidate/readiness packet 이며 library asset mutation 이 아니다. |
| `page_module_trace_matrix_v0` | `검증_페이지모듈추적행렬_v0` | `검증/페이지모듈/추적행렬` | 검증 | trace/evidence/gap matrix 이며 upstream authority 가 아니다. |
| `interface_control_and_harness_readiness_v0` | `검증_인터페이스하네스준비검사_v0` | `검증/인터페이스하네스/준비검사` | 검증 | possible ceiling 평가이며 harness 승인 claim 이 아니다. |
| `source_gap_followup_packet_v0` | `소스_갭후속패킷_v0` | `소스/갭/후속패킷` | 소스 | owner action 과 retry route 정리로 제한한다. |
| `verification_plan_from_page_contracts_v0` | `검증_페이지계획작성_v0` | `검증/페이지계약/계획작성` | 검증 | verification execution 이 아니라 plan 작성이다. |
| `review_gate_evidence_pack_v0` | `리뷰_근거패킷준비_v0` | `리뷰/게이트근거/패킷준비` | 리뷰 | gate approval 이 아니라 readiness evidence pack 이다. |
| `review_action_item_closure_loop_v0` | `리뷰_조치항목종료루프_v0` | `리뷰/조치항목/종료루프` | 리뷰 | action closure tracking 이며 decision approval 은 아니다. |
| `configuration_baseline_and_change_control_v0` | `운영_형상기준변경관리_v0` | `운영/형상기준/변경관리` | 운영 | baseline approval 이 아니라 inventory/control route 다. |
| `functional_configuration_audit_page_library_v0` | `검증_FCA페이지라이브러리감사_v0` | `검증/FCA페이지라이브러리/감사` | 검증 | FCA/SVR-style audit 이며 acceptance approval 은 아니다. |
| `test_harness_asset_planning_v0` | `검증_시험하네스자산계획_v0` | `검증/시험하네스/자산계획` | 검증 | execution readiness 전 planning 후보 이름이다. |
| `test_evaluation_execution_result_ingest_v0` | `검증_시험평가결과인입_v0` | `검증/시험평가결과/인입` | 검증 | result rows packaging 이며 accepted result claim 이 아니다. |
| `source_packet_sufficiency_review_v0` | `소스_패킷충분성검토_v0` | `소스/패킷충분성/검토` | 소스 | bounded claim family 에 대한 sufficiency review 다. |
| `physical_configuration_audit_asset_package_v0` | `검증_PCA자산패키지감사_v0` | `검증/PCA자산패키지/감사` | 검증 | PCA-style audit 이며 baseline approval 이 아니다. |
| `technical_risk_open_question_burndown_v0` | `운영_기술리스크질문소각_v0` | `운영/기술리스크질문/소각` | 운영 | unresolved risk/open-question register 정리로 제한한다. |
| `se_stage_artifact_gap_scan_v0` | `운영_단계산출물갭스캔_v0` | `운영/SE단계산출물/갭스캔` | 운영 | stage readiness 승인 대신 gap scan controller 로 제한한다. |
| `project_readiness_digest_v0` | `운영_프로젝트준비요약_v0` | `운영/프로젝트준비/요약` | 운영 | owner-readable report 이며 source of truth 가 아니다. |
| `accepted_verification_result_packet_v0` | `검증_수락결과패킷기록_v0` | `검증/수락결과/패킷기록` | 검증 | accepted provenance 범위가 있는 row 기록 후보 이름이다. |
| `owner_decision_packet_v0` | `운영_오너결정패킷기록_v0` | `운영/오너결정/패킷기록` | 운영 | scoped owner decision packet 기록으로 제한한다. |
| `post_development_review_gate_v0` | `리뷰_개발검사_v0` | `리뷰/개발종료/검사` | 리뷰 | bounded development closeout gate 이며 production-ready claim 이 아니다. |
| `sourcebound_knowledge_packet_operating_loop_v0` | `지식_소스기반패킷운영_v0` | `지식/소스기반패킷/운영루프` | 지식 | source 를 쓰지만 최종 관심은 knowledge packet loop 이다. |
| `monster_knowledge_preflight_v0` | `지식_몬스터사전확인_v0` | `지식/몬스터/사전확인` | 지식 | main workflow 전 query-first gate 로 제한한다. |
| `knowledge_candidate_triage_v0` | `지식_후보선별_v0` | `지식/후보/선별` | 지식 | 후보 material routing 이며 canon promotion 이 아니다. |
| `wiki_curation_maintenance_v0` | `지식_위키큐레이션유지_v0` | `지식/위키큐레이션/유지` | 지식 | metadata-only maintenance 로 제한한다. |
| `llm_wiki_builder_v0` | `지식_LLM위키빌더_v0` | `지식/LLM위키/빌더` | 지식 | stack orchestrator 후보 이름이며 source truth 가 아니다. |
| `latest_update_sync_and_followup_v0` | `운영_최신업데이트후속점검_v0` | `운영/최신업데이트/후속점검` | 운영 | GitHub/upstream update 후 repo, metadata, junction, follow-up route 를 report-only 또는 owner-gated mutation 으로 점검한다. |
| `github_upload_publish_v0` | `운영_깃허브업로드_v0` | `운영/깃허브/업로드` | 운영 | public repo 와 `_workmeta`, `private-state` companion repo 를 각각 검증, 커밋, 푸시하는 업로드 절차다. |
| `knowledge_access_event_capture_v0` | `지식_접근이벤트기록_v0` | `지식/접근이벤트/기록` | 지식 | metadata-only event capture 로 제한한다. |
| `ouroboros_strategic_review_harness_v0` | `운영_오로보로스전략검토_v0` | `운영/오로보로스전략/검토하네스` | 운영 | vision alignment 질문/후보 생성이며 owner intent 를 추론하지 않는다. |

## 후속 owner 판단 필요

- 이 표는 alias 후보 목록이며 `.workflow/index.yaml` 에 필드를 추가하지 않는다.
- 실제 alias catalog 를 둘 위치는 `.workflow/index.yaml`, 각 `workflow.yaml`, derived UI layer 중 별도 결정이 필요하다.
- party resolve 와 연결되는 catalog 를 만들 경우 `.party/docs/PARTY_NAMING_CONTRACT_V0.md` 의 `global_name_ko -> workflow_id -> party_id -> path` 규칙을 같이 검토해야 한다.
- rename 이 필요하면 downstream refs, README, changelog, private evidence, party/mission 참조를 포함한 migration packet 이 먼저 필요하다.
