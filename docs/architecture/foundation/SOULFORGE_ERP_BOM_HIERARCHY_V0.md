# Soulforge ERP BOM Hierarchy v0

## 목적

이 문서는 Soulforge 전체를 ERP/BOM처럼 계층으로 읽기 위한 구조 지도다.
목표는 "어느 ERP 항목을 어디에 넣을지"를 판단할 때, 정본 구조, 실행 UI,
지식/RAG 층, private metadata 층을 한 화면에서 분리해 보는 것이다.

## 상태와 판정 기준

- 상태: 관찰 기반 구조 지도 v0.1
- 작성일: 2026-06-13 (v0 codex_gpt-5) / 갱신 2026-06-13 v0.1 (claude_fable-5)
- 작성자 표기: codex_gpt-5 (v0), claude_fable-5 (v0.1 dev-erp 반영)
- v0.1 갱신 범위: dev-erp 앱 계층만 — 구매/발주(core_party·core_purchase·purchase_project_map)·
  첨부(core_attachment)·승격 위젯·테이블수(25)·테스트(44) 반영. canon/RAG 층은 미변경(Codex 영역).
  성격은 동일하게 **관찰 지도(처방 아님)**.
- 보존 위치: `docs/architecture/foundation/`
- claim ceiling: public-safe observed hierarchy; private 업무 원문이나 secret 값은 포함하지 않음
- 정본 판정: `index.yaml`, `*.yaml`, `README.md`, validator 통과 항목을 우선한다.
- 관찰 판정: 폴더와 코드가 있지만 index에 등록되지 않은 항목은 "관찰됨"으로만 쓴다.

## 읽는 순서

1. L0-L2: 저장소/owner root 경계
2. L3-L4: `.registry`, `.workflow`, `.party`, `.unit`, `.mission` 정본 계층
3. L5: `dev-erp` 실행 ERP 계층
4. L6: 지식/RAG 운영 계층
5. L7: private metadata, workspace, runtime 경계

## L0 저장소

- `Soulforge/`: public GitHub repo 기준의 주 작업 루트
- companion private repo:
  - `_workmeta/`: project-local private metadata, 실행 기록, 판단 근거, 검증 로그
  - `private-state/`: cross-project protected continuity/state
- local/derived workspace:
  - `_workspaces/`: 실제 참조/입력/산출 파일, system worksite, project worksite
  - `ui-workspace/`: derived UI consumer workspace

## L1 최상위 경계

| 계층 | 경로 | 역할 | 정본 여부 |
| --- | --- | --- | --- |
| canon/store | `.registry/` | species, class, skill, tool, knowledge 정본 | 정본 |
| active subject | `.unit/` | 실행 주체/유닛 owner | 정본 |
| orchestration | `.workflow/` | workflow canon | 정본 |
| reusable loadout | `.party/` | reusable orchestration template | 정본 |
| held plan | `.mission/` | mission plan owner | 정본 |
| operations root | `guild_hall/` | cross-project operations root | 정본/운영 |
| worksite | `_workspaces/` | local-only project/system worksite | owner-approved worksite |
| architecture docs | `docs/architecture/` | root-owned contracts and maps | 정본 문서 |
| derived UI | `ui-workspace/` | UI apps and fixtures | derived consumer |
| private metadata | `_workmeta/` | nested private metadata repo | public 정본 아님 |
| private state | `private-state/` | nested private continuity repo | public 정본 아님 |
| automation | `.github/` | GitHub workflows/templates | support |
| model-local support | `.claude/` | Claude local support | support; 정본 지침 아님 |
| cache | `.pytest_cache/` | test cache | non-canon |

## L2 정본 owner roots

### `.registry`

`.registry`는 외부 canon/store다. entry는 폴더 존재만으로 확정하지 않고
각 bucket의 `*.yaml`과 관련 validator를 기준으로 읽는다.

### `.unit`

`.unit`은 active subject owner다. 현재 관찰된 unit:

- `guild_master`
- `scribe_01`
- `vanguard_01`

각 unit의 하위 shape:

- `artifacts/`
- `autonomic/`
- `memory/`
- `policy/`
- `protocols/`
- `runtime/`
- `sessions/`

### `.workflow`

`.workflow`는 orchestration canon이다. `index.yaml`에 등록된 workflow만 canon
entry로 본다. `docs/`와 `authoring/`은 보조 문서/작성 템플릿이다.

### `.party`

`.party`는 reusable workflow-chain loadout template이다. workflow와 registry를
합치지 않는다.

### `.mission`

`.mission`은 held mission plan owner다. 현재 관찰된 mission:

- `author_hwpx_document_001`
- `author_pptx_autofill_conversion_001`
- `play_loop_mail_intake_demo_project_001`

각 mission의 하위 shape:

- `artifacts/`
- `reports/`

## L3 `.registry` BOM

### Species

정본 shape: `.registry/species/<species_id>/species.yaml`

- `darkelf`
- `dwarf`
- `elf`
- `human`
- `orc`

### Classes

정본 shape: `.registry/classes/<class_id>/class.yaml`와 class-local refs

- `administrator`
- `archer`
- `archivist`
- `auditor`
- `envoy`
- `healer`
- `knight`
- `marshal`
- `pathfinder`
- `rogue`

### Skills

정본 shape: `.registry/skills/<skill_id>/skill.yaml`

- `charge_breaker`
- `codex_thread_manager`
- `dual_deep_research`
- `evidence_sift`
- `external_gpt`
- `github_down`
- `github_up`
- `grill_me`
- `hwpx_document`
- `knowledge_ingest_cell_launcher`
- `long_thread_handoff`
- `mission_check`
- `outbound_mail_authoring`
- `outlook_mail_reconcile`
- `party_launcher_skill_author`
- `pcb_revision_library_cell_launcher`
- `post_development_review_gate`
- `pptx_autofill_conversion`
- `record_stitch`
- `se_foldertree_generate`
- `shield_wall`
- `skill_check`
- `systems_engineering_cell_launcher`
- `workflow_check`
- `workflow_generator`
- `workflow_launcher_skill_author`
- `workflow_optimizer`

### Tools

정본 shape: `.registry/tools/<tool_id>/tool.yaml`

- `annotation_tablet`
- `field_lance`
- `kite_shield`
- `oring_selection_calculator`
- `source_lens`

### Knowledge

정본 shape: `.registry/knowledge/<knowledge_id>/knowledge.yaml`

- `boundary_governance`
- `dapa_weapon_system_test_eval_guidebook`
- `escort_etiquette`
- `frontline_doctrine`
- `graph_rag`
- `lineage_method`
- `sonar_signal_chain`
- `source_criticism`
- `towed_body_sensor_stability`

### Registry docs

- `.registry/docs/architecture/`
- `.registry/docs/operations/`

## L4 `.workflow` BOM

### Canon workflow entries in `.workflow/index.yaml`

현재 index 등록 workflow는 62개다.

1. `frontline_assault`
2. `build_lineage_map`
3. `author_skill_package`
4. `meeting_followup`
5. `device_system_diagram_generation`
6. `whole_xml_page_split_v0`
7. `page_xml_normalize_spec_v0`
8. `capture_xml_intake_library_v0`
9. `official_source_packet_collect_v0`
10. `asset_patch_attach_mdd_v0`
11. `exp_xml_component_materials`
12. `component_pcb_layout_guide_extraction`
13. `allegro_pcb_dbdoctor_uprev_batch_v0`
14. `allegro_pcb_dlib_export_organize_v0`
15. `page_quantitative_enrichment_v0`
16. `simulation_source_collect_v0`
17. `simulation_deck_prepare_v0`
18. `simulation_run_verify_v0`
19. `simulator_policy_packet_v0`
20. `simulation_stimulus_measurement_packet_v0`
21. `xml_harness_composition_v0`
22. `page_module_trace_matrix_v0`
23. `interface_control_and_harness_readiness_v0`
24. `source_gap_followup_packet_v0`
25. `verification_plan_from_page_contracts_v0`
26. `review_gate_evidence_pack_v0`
27. `review_action_item_closure_loop_v0`
28. `configuration_baseline_and_change_control_v0`
29. `functional_configuration_audit_page_library_v0`
30. `test_harness_asset_planning_v0`
31. `test_evaluation_execution_result_ingest_v0`
32. `source_packet_sufficiency_review_v0`
33. `physical_configuration_audit_asset_package_v0`
34. `technical_risk_open_question_burndown_v0`
35. `se_stage_artifact_gap_scan_v0`
36. `se_cross_stage_mapping_governance_v0`
37. `project_readiness_digest_v0`
38. `accepted_verification_result_packet_v0`
39. `owner_decision_packet_v0`
40. `post_development_review_gate_v0`
41. `sourcebound_knowledge_packet_operating_loop_v0`
42. `monster_knowledge_preflight_v0`
43. `knowledge_candidate_triage_v0`
44. `wiki_curation_maintenance_v0`
45. `llm_wiki_builder_v0`
46. `workflow_knowledge_preflight_v0`
47. `dual_deep_research_v0`
48. `external_reasoning_workspace_v0`
49. `latest_update_sync_and_followup_v0`
50. `outbound_mail_authoring_v0`
51. `outlook_mail_reconcile_v0`
52. `github_upload_publish_v0`
53. `knowledge_access_event_capture_v0`
54. `rag_metadata_refresh_v0`
55. `knowledge_wiki_pipeline_v0`
56. `se_assistant_operating_loop_v0`
57. `ouroboros_strategic_review_harness_v0`
58. `long_thread_handoff_v0`
59. `codex_thread_manager_v0`
60. `daily_work_ledger_capture_v0`
61. `rag_source_text_quality_review_v0`
62. `rag_work_card_router_v0`

### Registered RAG source-text support workflows

The following workflows are registered pilot-executed RAG support workflows in
`index.yaml`. They do not claim source truth, answer authority, project
execution authority, owner approval, public canon promotion, default-route-safe
status, or production-ready status.

- `rag_source_text_quality_review_v0`
- `rag_work_card_router_v0`

### Workflow support folders

- `authoring/`: workflow 작성 템플릿/보조 자료
- `docs/`: workflow 보조 문서

## L4 `.party` BOM

현재 `.party/index.yaml` 등록 party는 6개다.

1. `guild_master_cell`
2. `knowledge_wiki_cell`
3. `knowledge_ingest_cell`
4. `systems_engineering_cell`
5. `pcb_revision_library_cell`
6. `daily_automation_party`

관찰된 보조 party 폴더:

- `authoring`
- `docs`

## L4 architecture docs BOM

`docs/architecture/`의 현재 주요 구획:

- `bootstrap/`: bootstrap and starting contracts
- `foundation/`: root-owned 기준선, purpose, roadmap, execution contract
- `foundation/schema/`: foundation schema docs
- `guild_hall/`: guild_hall cross-project operations docs
- `guild_hall/doctor/`: doctor-related operation docs
- `guild_hall/gateway/`: gateway operation docs
- `ui/`: root-owned UI contracts
- `workspace/`: `_workspaces` and `_workmeta` contracts
- `workspace/examples/`: tracked public-safe workspace samples
- `workspace/schema/`: workspace schema docs

## L5 dev-erp product BOM

`ui-workspace/apps/dev-erp/`는 현재 ERP-like UI/product slice다. 정본 canon은
아니지만, 실제 사용자 화면과 API가 있는 실행 계층이다.

### dev-erp top-level

- `data/`: local SQLite/data files
- `docs/`: dev-erp design, plan, QA, widget docs
- `src/`: store, adapter, guide, modules, search, LLM adapter
- `static/`: browser UI
- `test/`: Node test suite
- `tools/`: local helpers
- `server.mjs`: zero-dependency Node HTTP server

### dev-erp docs

- `BROWSER_QA_PROCEDURE.md`
- `DESIGN.md`
- `DESIGN_P2b_계정권한_20260613.md`
- `INSPECTOR_PROTOCOL.md`
- `MASTER_PLAN_20260613.md`
- `NEXT_STEPS_우선순위_20260613.md`
- `PLAN_P4_HARNESS_20260613.md`
- `WIDGET_CATALOG_분석_20260613.md`
- `checklist_phase1.json`

### ERP object groups in UI

대분류는 "업무 메뉴"보다 "다루는 객체" 축이다.

| UI group | 대상 | 현재 하위 축 |
| --- | --- | --- |
| `group_project` | 과제/프로젝트 | `home`, `guide`, `mod:gates`, `search` |
| `group_task` | 업무/할 일 | `items` |
| `group_doc` | 문서/산출물 | `artifacts`, `mod:reports`, `mod:knowledge`, `mod:calculators` |
| `group_comm` | 커뮤니케이션 | `mail`, `mod:meetings` |
| `group_material` | 물자/부품/보드 | `mod:purchase`, `mod:inventory`, `mod:boards`, `mod:stockwatch` |
| `group_team` | 사람/팀/요청/분석 | `mod:contacts`, `mod:requests`, `mod:analytics` |

### ERP module slots

`src/modules.mjs` 기준 module slot은 12개다.

| module | phase | ERP 의미 |
| --- | --- | --- |
| `calculators` | P1.5 | 엔지니어링 계산기, 공식, 단위, 검증 예제 |
| `requests` | P1.5 | 개발요청함, 승인 전 후보, dev_worker 큐 후보 |
| `purchase` | P2 | 견적, 비교, 발주, 납기, 업체 이력 |
| `inventory` | P3 | 랙/선반 실재고, 입고/불출/적재 이력 |
| `boards` | P3 | 보드, BOM, 회로도, Gerber, 라이브러리, 리비전 |
| `stockwatch` | P3 | 핵심 부품 공급처 재고, 품절/리드타임 경고 |
| `gates` | P4 | 단계별 필수 산출물/검토/승인 gate |
| `reports` | P4 | 보고서, 연구노트, 일일업무일지 생성기 |
| `meetings` | P4 | 회의 이력, 액션아이템, 담당/마감 연결 |
| `knowledge` | P4 | 지식/RAG 검색, 근거 카드, 출처, 신뢰 단계 |
| `contacts` | P5 | 업체/팀 연락처, 사내 매뉴얼, 보호 포인터 |
| `analytics` | P5 | 업무/프로젝트별 투입률, 회고 리포트 |

### SQLite table BOM

`src/store.mjs` 기준 persistent table은 **25개**다 (v0.1: 구매/첨부 4종 추가).

| table | 의미 |
| --- | --- |
| `meta` | key-value app metadata |
| `core_project` | 과제/프로젝트 |
| `core_stage` | 프로젝트 stage/gate |
| `core_person` | 사람/담당자 |
| `core_item` | 할 일/monster |
| `core_mail` | 메일 이력 metadata-only |
| `core_artifact` | 산출물 포인터; 원문 미저장 |
| `event_log` | append-only activity/event log |
| `guide_artifact` | 과제 x 단계 산출물 등록 |
| `guide_step` | 산출물 절차 step 상태 |
| `mail_label` | Gmail-style 수동 라벨 |
| `mail_label_map` | 메일-라벨 매핑 |
| `game_profile` | fantasy/game 확장 |
| `core_account` | 계정 |
| `auth_session` | httpOnly session |
| `rbac_role` | RBAC role |
| `rbac_account_role` | account-role mapping |
| `rbac_permission` | permission binding |
| `user_dashboard_layout` | 계정별 dashboard layout |
| `core_meeting` | 회의 metadata |
| `meeting_action_map` | 회의 action item mapping |
| `core_party` | 거래처/업체 공유 마스터 (v0.1) |
| `core_purchase` | 발주 문서 체인 request→…→closed (v0.1) |
| `purchase_project_map` | 발주↔과제 N:N (v0.1) |
| `core_attachment` | 파일 첨부 메타 포인터; 원문 미저장 (v0.1) |

현재 index:

- `idx_item_proj`
- `idx_item_due`
- `idx_mail_at`
- `idx_event_at`

### API route BOM

`server.mjs` 기준 `/api/*` route:

- `GET /api/health`
- `GET /api/summary`
- `GET /api/items`
- `POST /api/items`
- `POST /api/items/status`
- `POST /api/items/assign`
- `POST /api/items/promote`
- `GET /api/mail`
- `POST /api/mail/assign`
- `GET /api/guide/templates`
- `GET /api/guide/summary`
- `GET /api/guide`
- `POST /api/guide/artifact`
- `POST /api/guide/step`
- `POST /api/chat`
- `GET /api/gates`
- `POST /api/gates/clear`
- `GET /api/settings/gate_mode`
- `POST /api/settings/gate_mode`
- `GET /api/worklog/draft`
- `GET /api/report/draft`
- `GET /api/labels`
- `POST /api/labels`
- `POST /api/mail/label`
- `GET /api/artifacts`
- `GET /api/people`
- `GET /api/search`
- `GET /api/lexicon`
- `GET /api/modules`
- `GET /api/events/recent`
- `POST /api/events`
- `GET /api/me`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/dashboard/layout`
- `PUT /api/dashboard/layout`
- `GET /api/meetings`
- `POST /api/meetings`
- `GET /api/meetings/actions`
- `POST /api/meetings/action`
- `GET /api/parties` · `POST /api/parties` · `GET /api/parties/ledger` (v0.1)
- `GET /api/purchases` · `POST /api/purchases` · `POST /api/purchases/stage` · `POST /api/purchases/link` (v0.1)
- `GET /api/attachments` · `POST /api/attachments` · `GET /api/attachments/suggest` (v0.1)
- `/api/*` fallback: 404 JSON

### Widget BOM

`static/app.js` 기준 widget slot은 31개다. `ready: true`만 실제 보드에 올릴
수 있고, 나머지는 "준비 중"으로 노출된다.

| group | ready | soon |
| --- | --- | --- |
| `group_project` | `projects`, `kpi`, `events`, `artifact_progress`, `gatewait` | — |
| `group_task` | `today`, `blocked` | `mine`, `deadline_cal` |
| `group_doc` | `artifacts`, `meetings_w` | `reports_w`, `onboarding`, `training`, `stddocs` |
| `group_comm` | `mail`, `inbox` | `approval`, `notices`, `announce` |
| `group_material` | `purchase_w`, `vendors` | `stocklow`, `bomchg`, `buyapprove` |
| `group_team` | `unassigned`, `contacts` | `teamload`, `throughput`, `requests_w`, `analytics_w` |

요약 (v0.1):

- total: 31
- ready: 15 (v0.1에서 gatewait·purchase_w·vendors 승격)
- soon: 16 (그중 `stocklow`·`bomchg`는 재고/BOM=Codex 영역)

### LLM/AI layer in dev-erp

현재 구현은 `src/llm.mjs`와 `POST /api/chat`까지 존재한다. 다만 기본 provider는
stub이고 외부전송은 0이다.

- context kind: `meta_summary_only`
- 포함: 과제 count, event kind count, 최근 메일 제목/방향/시각 같은 metadata
- 미포함: 메일 본문, 첨부, 원문 파일
- provider:
  - `stub`: 기본값, 외부전송 0
  - `codex_cli`: tool PC bridge 자리만 있음; 현재 stub fallback, delivered false
- event log: `llm_call`
- 관찰상 `ai_jobs` table은 아직 없음

## L6 지식/RAG BOM

### Canon knowledge entries

지식 정본은 `.registry/knowledge/*/knowledge.yaml`의 9개 entry다.

- `boundary_governance`
- `dapa_weapon_system_test_eval_guidebook`
- `escort_etiquette`
- `frontline_doctrine`
- `graph_rag`
- `lineage_method`
- `sonar_signal_chain`
- `source_criticism`
- `towed_body_sensor_stability`

### Knowledge workflows

지식/RAG에 직접 관련된 index-canon workflow:

- `sourcebound_knowledge_packet_operating_loop_v0`
- `monster_knowledge_preflight_v0`
- `knowledge_candidate_triage_v0`
- `wiki_curation_maintenance_v0`
- `llm_wiki_builder_v0`
- `workflow_knowledge_preflight_v0`
- `dual_deep_research_v0`
- `external_reasoning_workspace_v0`
- `knowledge_access_event_capture_v0`
- `rag_metadata_refresh_v0`
- `rag_source_text_quality_review_v0`
- `rag_work_card_router_v0`
- `knowledge_wiki_pipeline_v0`

Registered optional RAG source-text support workflows:

- `rag_source_text_quality_review_v0`
- `rag_work_card_router_v0`

These workflows are optional `knowledge_ingest_cell` routes only. They do not
claim source truth, answer authority, project execution authority, owner
approval, public canon promotion, default-route-safe status, or production-ready
status.

### Knowledge parties and launcher skills

- party: `knowledge_ingest_cell`
- launcher skill: `knowledge_ingest_cell_launcher`
- related skills:
  - `dual_deep_research`
  - `evidence_sift`
  - `record_stitch`
  - `external_gpt`
  - `workflow_knowledge_preflight_v0`와 연결되는 workflow-side preflight

### `guild_hall` operational knowledge modules

`guild_hall/`은 cross-project operations root다. 지식/RAG 관련 운영 모듈:

- `guild_hall/knowledge_access/`
  - `cli.mjs`
  - `ledger.mjs`
  - `knowledge_access.test.mjs`
  - `knowledge_rag_candidate_ledger.mjs`
  - `knowledge_rag_candidate_ledger.test.mjs`
  - `knowledge_trigger_stop_guard.mjs`
  - `knowledge_trigger_stop_guard.test.mjs`
  - `notebooklm_bridge.mjs`
- `guild_hall/knowledge_graph/`
  - `cli.mjs`
  - `graph_export.mjs`
  - `knowledge_graph.test.mjs`
  - `llm_review.mjs`
  - `retrieval_plan.mjs`
- `guild_hall/rag/`
  - `answer_engine_run.mjs`
  - `cli.mjs`
  - `company_knowledge_intake_packet.mjs`
  - `llm_wiki_bookshelf_template.test.mjs`
  - `operational_route.mjs`
  - `rag.mjs`
  - `rag.test.mjs`
  - `source_sync_ready_manifest.mjs`
  - `source_text_extraction_packet.mjs`
  - `source_text_extraction_run_report.mjs`
  - `source_text_index.mjs`
  - `source_text_profile.mjs`
  - `source_text_runtime_preflight.mjs`
  - `work_card.mjs`

### Derived knowledge workspaces

- `_workspaces/system/knowledge_view/`: local derived knowledge-view worksite
- `_workspaces/system/rag/`: local derived RAG worksite
- `_workmeta/system/knowledge_rag_candidate_ledger`: private metadata ledger surface
- `_workmeta/system/reports/rag/**`: private RAG run evidence and review metadata

이 경로들은 public 문서에서 원문 내용을 복제하지 않는다.

## L7 worksite/private/runtime BOM

### `_workspaces`

현재 관찰된 top-level system worksite:

- `_workspaces/.dirty-quarantine/`: quarantined dirty payloads
- `_workspaces/system/knowledge_view/`: derived knowledge view
- `_workspaces/system/rag/`: derived RAG workspace
- `_workspaces/system/retired_root_entries/`: retired root entries
- `_workspaces/system/사내ERP_분석/`: ECount/ERP observation and analysis worksite
- `_workspaces/system/유튜브_분석/`: YouTube analysis worksite

ERP observation worksite의 public-safe file names:

- `CLAUDECODE_ECOUNT_분석_프롬프트.md`
- `CODEX_ECOUNT_분석_프롬프트.md`
- `ECOUNT_IA_분석.md`
- `ECOUNT_to_devERP_시사점.md`
- `ECOUNT_대시보드개인화_관찰.md`
- `ECOUNT_대시보드개인화_분석_프롬프트.md`
- `ECOUNT_워크플로우.md`
- `OWNER_관찰메모_ecount.md`

### `_workmeta`

`_workmeta`는 nested private repo다. 저장 대상은 metadata, 판단 근거,
검증 로그, 경로 포인터, size, hash, source, 사용 상태다.

넣지 않는 것:

- HWP/HWPX/Word/Excel/PowerPoint/PDF 같은 실제 원문 payload
- 메일 원문/첨부
- 압축 원문 파일
- secret, token, cookie, credential JSON

### `private-state`

`private-state`는 cross-project protected continuity/state repo다. public
repo에 넣지 않는 continuity data plane을 맡는다.

### runtime/generated/cache

다음은 정본 구조 판단에서 제외하거나 derived/support로만 본다.

- `node_modules/`
- `dist/`
- `.pytest_cache/`
- local database files
- browser build outputs
- ignored runtime logs

## ERP 항목 배치 해석

현재 구조를 ERP/BOM 입력 기준으로 해석하면 다음처럼 넣는다.

| ERP 항목 | 우선 배치 | 보조/근거 |
| --- | --- | --- |
| 프로젝트 | `dev-erp.core_project` | `.mission`, `_workmeta/<project_code>` |
| 단계/stage gate | `dev-erp.core_stage`, `mod:gates` | `.workflow/*gate*`, SE workflows |
| 할 일/업무 | `dev-erp.core_item` | `event_log`, guide steps |
| 메일 이력 | `dev-erp.core_mail` metadata-only | `_workmeta` metadata, 원문 미복제 |
| 산출물 | `dev-erp.core_artifact` pointer | `_workspaces` actual file, `_workmeta` hash/path |
| 회의록 | `dev-erp.core_meeting`, `meeting_action_map` | `_workmeta` reports when private |
| 구매/발주 | `mod:purchase` + `core_party`·`core_purchase`·`purchase_project_map` (v0.1 구현됨) | 거래처 마스터·발주 체인·과제 N:N |
| 파일 첨부 | `core_attachment` 메타 포인터 (v0.1) | 원문 미저장; 배치 제안만(⑧ reversible) |
| 재고/자산 | `mod:inventory` planned module | future inventory tables needed (Codex BOM 스펙 후) |
| 보드/BOM | `mod:boards` planned module | Allegro workflows, PCB party |
| 부품 감시 | `mod:stockwatch` planned module | source/supplier metadata |
| 지식/RAG | `.registry/knowledge`, `guild_hall/rag`, `mod:knowledge` | sourcebound workflows |
| 업체/연락처 | `mod:contacts`, protected pointer | private contact payload excluded |
| 분석/투입률 | `mod:analytics` planned module | event_log aggregation |

## 검증 기록

본 지도는 다음 관찰/검증을 근거로 작성했다.

- `.workflow/index.yaml`: 62 canon workflow entries
- `.party/index.yaml`: 6 canon party entries
- `.registry`: species 5, classes 10, skills 27, tools 5, knowledge 9
- `ui-workspace/apps/dev-erp/src/modules.mjs`: 12 ERP module slots
- `ui-workspace/apps/dev-erp/src/store.mjs`: **25 tables** (v0.1; v0는 21), 6 indexes
- `ui-workspace/apps/dev-erp/server.mjs`: 구매/첨부 포함 API route 관찰
- `ui-workspace/apps/dev-erp/static/app.js`: 31 widget slots, **15 ready, 16 soon** (v0.1; v0는 12/19)
- local validation:
  - (v0) `npm run validate:canon`: pass, checked 119, errors 0, warnings 0
  - (2026-06-14) `npm run validate:canon`: pass, checked 121, errors 0, warnings 0
  - `node --test ui-workspace/apps/dev-erp/test/core.test.mjs`: pass, **44 tests** (v0.1; v0는 31)
  - (v0) `npm run validate:knowledge-rag-candidate-ledger`: pass, 6 checks

## 남은 구조 구멍

- `dev-erp`의 purchase/inventory/boards/stockwatch는 module slot이 있으나
  dedicated persistent tables는 아직 없다.
- `ai_jobs` 같은 비동기 AI job table은 아직 없다.
- `group_material` widget은 5개 모두 soon 상태다.
- `_workspaces`와 `_workmeta`는 경로/metadata만 public-safe로 다루며, 실제 보호
  payload 내용은 이 문서의 범위가 아니다.
