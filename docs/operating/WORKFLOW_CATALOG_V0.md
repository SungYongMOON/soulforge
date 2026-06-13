# 워크플로우 카탈로그 V0 — 64개, 한 줄씩

> 작성: claude_fable-5 · 2026-06-13 · 근거: `.workflow/*/README.md` + `validation_level`
> 목적: "뭐가 있는지 몰라서 못 쓰는" 문제 해소. **먼저 보이게 한다. 지우는 건 그다음.**
>
> **라벨은 제안일 뿐, 최종 판단은 오너.** 의미:
> - 🟢 **매일쓸** — 팀+ERP 일상 운영의 골든패스 후보(여기부터 production_ready로 키운다)
> - 🔵 **가끔쓸** — 실제 개인 SE 업무에서 주기적으로 쓰는 도구(없애지 말 것, 단 진입점 정리)
> - ⚪ **안쓰는듯** — 실험·중복·미성숙. **삭제 아님 → `_attic/` 이동 후보, 오너 확인 필요**
> - ❓ **모르겠음** — 이름만으론 용도 불명확. 오너 한 줄 설명 필요
>
> 현재 64개 중 `production_ready` 등급은 **0개**. 최상위는 `owner_accepted_usable` 2개뿐.

---

## 🟢 매일쓸 — 골든패스 후보 (6)

| 워크플로우 | 한 줄 | 등급 |
|---|---|---|
| `daily_work_ledger_capture_v0` | 하루 업무를 일일 원장에 기록 | registered |
| `outbound_mail_authoring_v0` | 오너 스타일 아웃바운드 업무메일 작성 | registered |
| `project_readiness_digest_v0` | 워크플로우 상태·블로커·오너 큐를 한 장 요약 | pilot |
| `post_development_review_gate_v0` | 개발 종료 게이트(연속성 제약상 필수) | pilot |
| `se_assistant_operating_loop_v0` | SE 어시스턴트 요청 라우터(들어온 요청 분배) | structure_only |
| `long_thread_handoff_v0` | 장시간 작업 핸드오프(세션 인계, 연속성 필수) | structure_only |

## 🔵 가끔쓸 — 개인 SE 도구 (검증된 편) (8)

| 워크플로우 | 한 줄 | 등급 |
|---|---|---|
| `component_pcb_layout_guide_extraction` | 부품 폴더에서 PCB 레이아웃 가이드 추출 | **owner_accepted_usable** |
| `device_system_diagram_generation` | 마크다운 설명 → 기기 시스템 다이어그램 | **owner_accepted_usable** |
| `allegro_pcb_dbdoctor_uprev_batch_v0` | Allegro PCB DB 일괄 변환/업레브 | registered |
| `allegro_pcb_dlib_export_organize_v0` | Allegro 라이브러리 export/정리 | registered |
| `github_upload_publish_v0` | GitHub 업로드/배포 반복 작업 | pilot_ready |
| `meeting_followup` | 회의록 → 액션아이템 후속 | ? |
| `outlook_mail_reconcile_v0` | Outlook 메타로 프로젝트 메일 이력 대조 | structure_only |
| `knowledge_candidate_triage_v0` | 원시 지식 후보 필터(쓸 것/버릴 것) | pilot |

## 🔵 가끔쓸 — 개인 SE 파이프라인 (지금/곧 그 작업을 하면 유지) (17)

> XML·시뮬레이션 파이프라인. **하나의 코히어런트한 SE 작업 흐름**이라 함부로 못 지운다.
> 판단 기준: 지금 또는 곧 이 작업을 하면 🔵 유지, 한동안 안 하면 ⚪ attic.

| 워크플로우 | 한 줄 | 묶음 |
|---|---|---|
| `whole_xml_page_split_v0` | 큰 다중페이지 XML → 페이지 단위 분할 | XML |
| `page_xml_normalize_spec_v0` | 페이지 XML → sidecar 메타 정규화 | XML |
| `capture_xml_intake_library_v0` | Capture EXP.xml → 자산 등록 패킷 | XML |
| `asset_patch_attach_mdd_v0` | 기존 XML 자산에 MDD 파일 첨부 | XML |
| `page_module_trace_matrix_v0` | 페이지 XML 행 단위 추적 매트릭스 | XML |
| `page_quantitative_enrichment_v0` | 페이지 스펙에 정량 오버레이 추가 | XML |
| `xml_harness_composition_v0` | 페이지 준비물 → 하네스 레이어 패킷 | XML |
| `interface_control_and_harness_readiness_v0` | 페이지 계약 ↔ 하네스 준비도 게이트 | XML |
| `exp_xml_component_materials` | EXP.xml에서 부품 참조자료 수집 | 소스 |
| `official_source_packet_collect_v0` | 하드웨어 소스 부트스트랩 패킷 생성 | 소스 |
| `simulation_source_collect_v0` | 시뮬 모델 소스 수집/인덱싱 | 시뮬 |
| `simulation_stimulus_measurement_packet_v0` | 자극/측정조건 정의 기록 | 시뮬 |
| `simulator_policy_packet_v0` | 시뮬레이터 런타임 신뢰/실행권한 기록 | 시뮬 |
| `simulation_deck_prepare_v0` | 시뮬 덱 입력 스테이징 | 시뮬 |
| `simulation_run_verify_v0` | 시뮬 실행 또는 차단사유 기록 | 시뮬 |
| `test_harness_asset_planning_v0` | 검증용 물리/시뮬/SW 하네스 자산 계획 | 시뮬 |
| `verification_plan_from_page_contracts_v0` | 페이지 증거 → 검증 계획 도출 | 시뮬 |

## ⚪ 안쓰는듯 — 거버넌스 과잉 (게이트 중복) (8)

> 리뷰/감사/형상 게이트가 너무 많다. 팀에는 1~2개면 충분. 나머지 attic 후보.

| 워크플로우 | 한 줄 | 비고 |
|---|---|---|
| `review_gate_evidence_pack_v0` | 리뷰 준비 패킷 조립 | 리뷰게이트 4종 중 |
| `review_action_item_closure_loop_v0` | 리뷰 액션아이템 추적 | 리뷰게이트 4종 중 |
| `accepted_verification_result_packet_v0` | 검증 결과 수용 기록 | 리뷰게이트 4종 중 |
| `functional_configuration_audit_page_library_v0` | 기능 형상 감사(페이지 모듈) | 감사 3종 중 |
| `physical_configuration_audit_asset_package_v0` | 물리 형상 감사(자산 패키지) | 감사 3종 중 |
| `configuration_baseline_and_change_control_v0` | 기준선·변경 추적 | 감사 3종 중 |
| `se_cross_stage_mapping_governance_v0` | SE 단계 산출물 커버리지 집계 | 거버넌스 |
| `se_stage_artifact_gap_scan_v0` | SE 단계 산출물 갭 스캔 | 거버넌스 |
| `technical_risk_open_question_burndown_v0` | 기술 리스크/미결문항 번다운 | 거버넌스 |

## ⚪ 안쓰는듯 — 지식/위키/RAG 중복·드래프트 (10)

> 위키 오케스트레이터 2종, 프리플라이트 2종, RAG 드래프트 다수. 각 1개만 남기고 attic 후보.

| 워크플로우 | 한 줄 | 비고 |
|---|---|---|
| `knowledge_wiki_pipeline_v0` | 위키화 복합 워크플로우 진입점 | 오케스트레이터 2종 중 |
| `llm_wiki_builder_v0` | 위키 빌드 종단 오케스트레이션 | 오케스트레이터 2종 중(중복) |
| `monster_knowledge_preflight_v0` | 업무요청 전 지식 프리플라이트 | 프리플라이트 2종 중 |
| `workflow_knowledge_preflight_v0` | 워크플로우 전 지식 프리플라이트 | 프리플라이트 2종 중(draft) |
| `sourcebound_knowledge_packet_operating_loop_v0` | 소스기반 지식 심화 루프 | |
| `wiki_curation_maintenance_v0` | 위키 상태 유지보수 | |
| `knowledge_access_event_capture_v0` | 지식 사용 이벤트 정규화/분석 | |
| `rag_metadata_refresh_v0` | RAG 메타데이터 갱신 | metadata-only |
| `rag_source_text_quality_review_v0` | RAG 소스 텍스트 품질 리뷰 | **draft** |
| `rag_work_card_router_v0` | RAG 작업카드 라우팅 | **draft** |

## ⚪ 안쓰는듯 — 소스 충분성·기타 중복 (4)

| 워크플로우 | 한 줄 | 비고 |
|---|---|---|
| `source_packet_sufficiency_review_v0` | 수집 소스 충분성 판정 | 소스 3종 중복 |
| `source_gap_followup_packet_v0` | 미해결 소스 갭 통합 | 소스 3종 중복 |
| `dual_deep_research_v0` | 듀얼 딥리서치 비교 | **draft** |
| `test_evaluation_execution_result_ingest_v0` | 시험(TRR/DT 이후) 결과 인입 | |

## 🔵/⚪ 운영·동기화 (오너 확인) (3)

| 워크플로우 | 한 줄 | 제안 |
|---|---|---|
| `latest_update_sync_and_followup_v0` | 최신 업데이트 점검 후 후속 | 🔵 가끔쓸 |
| `codex_thread_manager_v0` | Codex 스레드 관리 | 🔵(Codex 연속성 관련) |
| `external_reasoning_workspace_v0` | 외부 브라우저 추론 워크스페이스 | ⚪ |

## ❓ 모르겠음 — 오너 한 줄 설명 필요 (5)

| 워크플로우 | 한 줄(README 기준) | 왜 불명확 |
|---|---|---|
| `build_lineage_map` | 계보 지도 생성(증거기반 계획까지) | 무엇의 계보? 용도 불명 |
| `frontline_assault` | "프론트라인 어설트" 조율 | 메타포가 기능을 가림 |
| `ouroboros_strategic_review_harness_v0` | 주기적/오너 트리거 전략 리뷰 하네스 | 다른 리뷰 게이트와 차이? |
| `author_skill_package` | 재사용 스킬 패키지 저작 레인 | 골든패스인지 메타툴인지 |
| `owner_decision_packet_v0` | 오너 결정 기록 워크플로우 | **승인 의식 폐지(P0-3)와 연동 — 보류 후 판단** |

---

## 요약 (제안)

| 라벨 | 개수(제안) |
|---|---|
| 🟢 매일쓸 | 6 |
| 🔵 가끔쓸 | 25 (검증 8 + 개인SE 17) |
| ⚪ 안쓰는듯(attic 후보) | 22 |
| ❓ 모르겠음 | 5 |
| 운영 혼합 | 3 → 위 가끔/안쓰는듯에 분산 |

> **다음 액션:** 이 표를 보고 오너가 라벨만 확정 → ⚪ 중 동의하는 것만 `git mv` 로 `_attic/` 이동(되돌리기 1줄).
> 🟢 6개는 "안전하게 쓰는 법" README 1장씩 붙여 팀 진입점으로.
> 개인 SE 파이프라인(🔵 17)은 **그 작업을 곧 하느냐**가 유일한 판단 기준 — 안 지운다, 보류.
