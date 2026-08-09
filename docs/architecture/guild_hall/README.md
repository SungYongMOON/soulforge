# docs/architecture/guild_hall

## 목적

- `guild_hall/` root 의 owner 경계와 cross-project 운영 계약을 모은다.
- `gateway`, `doctor`, `town_crier`, `night_watch`, `dev_worker`, `dungeon_assignment`, `battle_log`, `mission_close` 같은 공용 운영 기능을 `_workspaces/<project_code>/` worksite 와 분리해 설명한다.

## 문서 역할 색인

무엇을 알아야 하는지로 먼저 찾고, 그 줄의 문서만 읽는다.
`docs/architecture/guild_hall/**` 를 통째로 선적재하지 않는다.

### 조직·역할·모델 프로파일

조직 구조, 누가 무엇을 책임지는지, 역할별 기본 모델을 알아야 할 때 읽는다.

| 문서 | 역할 |
| --- | --- |
| [`DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`](DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md) | 한 사람 Owner 아래 승인된 두 회사 조직 뷰와 고정 machine routing branch 경계다. |
| [`PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md`](PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md) | 프로젝트 공통 15개 책임 조직도, 책임별 맡는/맡지 않는 업무 경계, TASK 역할·gate, 신규-대-기존 TASK routing 규칙이다. |
| [`COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`](COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md) | COMMON 회사/팀 운영 조직, 역할 경계, Slack 협업공간 owner, peer request 의미, common TASK routing 규칙이다. |
| [`DEVELOPMENT1_TEAM_OPERATIONS_WORK_CLASSIFICATION_GUIDE_V0.md`](DEVELOPMENT1_TEAM_OPERATIONS_WORK_CLASSIFICATION_GUIDE_V0.md) | 개발1팀 운영실 7개 책임, 일반업무 분류, 지원 TASK, 내부과제 승격 gate canon 후보다. |
| [`AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md`](AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md) | 역할별 기본 모델·reasoning effort 표, Ultra gate, CEO delta 보고, 지원채널 경계와 현재 활성 상태를 고정한다. |
| [`CODEX_WORK_DIRECTORY_V1.md`](CODEX_WORK_DIRECTORY_V1.md) | stable manager directory, 고정 조직 topology, private catalog/local binding 분리, fail-closed resolution 이다. |

현재 실제 조직·등록 상태는 문서가 아니라 두 개의 local-only 소스에 있다.
읽는 법과 경계는 [`ui-workspace/apps/team-ops-board/README.md`](../../../ui-workspace/apps/team-ops-board/README.md) 를 따른다.
조직 골격은 `_workmeta/system/bindings/organization_governance_overlay.v1.json`,
실제 thread 등록은 `guild_hall/state/operations/team_ops_board/thread_visibility.v1.json` 이다.
둘 다 untracked local state 이고 서로 자동 동기화되지 않는다.

### 지식·RAG·온톨로지

| 문서 | 역할 |
| --- | --- |
| [`KNOWLEDGE_OPERATING_MODEL_V0.md`](KNOWLEDGE_OPERATING_MODEL_V0.md) | knowledge access ledger, 후보 수집, LLM 제안 승인, 종료 sweep, sourcebound packet, access-event 분석 계층을 합친다. |
| [`KNOWLEDGE_WORKFLOW_STACK_V0.md`](KNOWLEDGE_WORKFLOW_STACK_V0.md) | project work 에서 knowledge layer 를 어떤 순서와 workflow stack 으로 쓰는지 고정한다. |
| [`KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md`](KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md) | Drive source warehouse, NotebookLM 조회 bookshelf, source catalog, ontology 후보 어휘와 배치 규칙을 고정한다. |
| [`ONTOLOGY_CANON_OPERATING_POLICY_V0.md`](ONTOLOGY_CANON_OPERATING_POLICY_V0.md) | 승인된 ontology canon 패키지, `.registry/knowledge` 실행 투영, NotebookLM 자문 bookshelf, NAS 재해복구 권한 분리를 고정한다. |
| [`KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md`](KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md) | metadata-only graph view, 시각 인코딩, source trace, layout, Obsidian/운영 export 분리다. |
| [`KNOWLEDGE_WIKI_WORLDVIEW_V0.md`](KNOWLEDGE_WIKI_WORLDVIEW_V0.md) · [`knowledge_wiki_worldview_v0.html`](knowledge_wiki_worldview_v0.html) | 팀원용 지식 위키 세계관, 현재 상태, 운영 규칙, 다음 단계 개요다. |
| [`KNOWLEDGE_ASSISTANT_ACTIVATION_PLAN_V0.md`](KNOWLEDGE_ASSISTANT_ACTIVATION_PLAN_V0.md) | **미승인 검토용.** 지식비서를 켜기 위한 3개 스위치 구현 설계와 적대검증 결과다. ERP 출처본문 합성 경로는 보류 상태다. |
| [`RAG_THREE_STAGE_OPERATING_MODEL_V0.md`](RAG_THREE_STAGE_OPERATING_MODEL_V0.md) | searchable RAG, work-ready RAG, canon knowledge 세 단계를 정의한다. |
| [`RAG_MANIFEST_MVP_V0.md`](RAG_MANIFEST_MVP_V0.md) | metadata-only RAG manifest, source-slice-card, decision-record, metadata-index, trace/evaluation, answer-command 경계를 고정한다. |
| [`RAG_SOURCE_FAMILY_PROMOTION_POLICY_V0.md`](RAG_SOURCE_FAMILY_PROMOTION_POLICY_V0.md) | RAG 승격 규칙을 source-family 단위로 만든다. 기본 신뢰수준, 자동 승격 lane, 중단조건, canon 두 의미의 구분이다. |
| [`KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md`](KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md) | ERP 가 Karpathy 식 sourcebound wiki/RAG metadata 를 쓰되 Karpathy LLM runtime 을 설치하지 않는다는 결정이다. |
| [`../foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](../foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md) | project time/event/file revision ID 를 exact source revision, RAG/Wiki lineage, SE 규칙, canon knowledge 에 잇는다. |
| [`PROJECT_CONTEXT_GRAPH_V0.md`](PROJECT_CONTEXT_GRAPH_V0.md) | workspace project context graph 를 haengbogwan 에서 소비하는 guild_hall/dev-ERP 투영 모델이다. |

### 자동화·야간운영·사용량

| 문서 | 역할 |
| --- | --- |
| [`GUILD_HALL_MODEL_V0.md`](GUILD_HALL_MODEL_V0.md) | `guild_hall` 이 gateway, notify, assignment, operation state 를 어떻게 소유하는지 고정한다. |
| [`AUTOMATION_PARTY_OPERATING_MODEL_V0.md`](AUTOMATION_PARTY_OPERATING_MODEL_V0.md) | 반복 자동화 세계관: workflow, party, cadence party, local scheduler, ledger, report 경계다. |
| [`CODEX_APP_AUTOMATION_CATALOG_V0.md`](CODEX_APP_AUTOMATION_CATALOG_V0.md) | Codex app 자동화 카탈로그, source-of-truth 분리, reader tier, 현재 기본 자동화 개념이다. |
| [`NIGHT_WATCH_AUTOMATION_V0.md`](NIGHT_WATCH_AUTOMATION_V0.md) | 항상 켜 두는 node 에서만 ACTIVE 로 둘 점검 자동화와 경계다. |
| [`ALWAYS_ON_STRATEGIC_REVIEW_V0.md`](ALWAYS_ON_STRATEGIC_REVIEW_V0.md) | 24시간 node 에서 healer, night_watch, strategic review 를 어떻게 나누어 pull/run 할지다. |
| [`DEV_WORKER_AUTOMATION_V0.md`](DEV_WORKER_AUTOMATION_V0.md) | task packet 을 받아 reviewable branch 를 만드는 bounded development worker lane 이다. |
| [`DEV_WORKER_NEXT_STEPS_REVIEW_20260517.html`](DEV_WORKER_NEXT_STEPS_REVIEW_20260517.html) | 2026-05-17 dev worker 다음 단계 검토 산출물이다. 계약이 아니라 그 시점 기록이다. |
| [`AI_USAGE_METER_V1.md`](AI_USAGE_METER_V1.md) | local-first Codex token/credit meter, work attribution, 프라이버시 경계, 팀 배포, MCP adapter 계약이다. |
| [`CODEX_ACCOUNT_BRIDGE_V0.md`](CODEX_ACCOUNT_BRIDGE_V0.md) | API key 저장 없이 계정 기반으로 Codex CLI 를 자문 분석에 쓰는 bridge 다. |
| [`EXTERNAL_REASONING_WORKSPACE_V0.md`](EXTERNAL_REASONING_WORKSPACE_V0.md) | ChatGPT Pro/Thinking 을 Chrome 으로 쓰는 외부 자문 workspace 후보 운영 모델이다. |

### 상태 투영·대시보드

| 문서 | 역할 |
| --- | --- |
| [`SOULFORGE_ACTIVITY_LOG_V0.md`](SOULFORGE_ACTIVITY_LOG_V0.md) | cross-project recent-context 와 carry-forward event surface 다. |
| [`SOULFORGE_SNAPSHOT_V0.md`](SOULFORGE_SNAPSHOT_V0.md) | UI/external host 가 읽을 sanitized read-only snapshot 계약이다. |
| [`TRIAGE_BOARD_V0.md`](TRIAGE_BOARD_V0.md) | INBOX/pending monster 분류 대기량 read-only triage board 투영 계약이다. |
| [`SQLITE_PROJECTION_V0.md`](SQLITE_PROJECTION_V0.md) | metadata ledger 를 local read-only SQLite projection 으로 모으는 스키마/loader 계약이다. |
| [`ASSISTANT_DASHBOARD_V0.md`](ASSISTANT_DASHBOARD_V0.md) | project-local deadline/open-action/work ledger 를 읽는 local-only read-only rollup 계약이다. |

### 메일·알림 계약

`gateway` 의 public contract 는 `docs/architecture/workspace/` 에 있다.

| 문서 | 역할 |
| --- | --- |
| [`../workspace/GATEWAY_MAIL_FETCH_V0.md`](../workspace/GATEWAY_MAIL_FETCH_V0.md) | mail fetch public contract. |
| [`../workspace/MAIL_SEND_V0.md`](../workspace/MAIL_SEND_V0.md) | outbound mail public contract. |
| [`../workspace/MAIL_WORK_STATUS_V0.md`](../workspace/MAIL_WORK_STATUS_V0.md) | mail-derived work status, priority, backlog contract. |
| [`../workspace/DEADLINE_WATCH_V0.md`](../workspace/DEADLINE_WATCH_V0.md) | deadline watch ledger, import, validate, reminder preview contract. |
| [`../workspace/GATEWAY_NOTIFY_V0.md`](../workspace/GATEWAY_NOTIFY_V0.md) | notify command contract. |
| [`../workspace/NOTIFY_MODEL_V0.md`](../workspace/NOTIFY_MODEL_V0.md) | notification owner model. |
| [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md) | 어느 PC/node 에서 자동화를 ACTIVE 로 둘지 판단하는 multi-PC 계약. |

### 구현 surface README

계약이 아니라 실제 명령·코드 표면을 볼 때 읽는다.

| 경로 | 역할 |
| --- | --- |
| [`doctor/README.md`](doctor/README.md) | bootstrap/readiness doctor. |
| [`gateway/README.md`](gateway/README.md) | gateway owner root 의 intake/update/notify. `mail_fetch/`, `mail_send/` 와 그 아래 `runbooks/`, `policies/`, `spec/` 를 포함한다. |
| [`../../../guild_hall/ai_usage_meter/README.md`](../../../guild_hall/ai_usage_meter/README.md) | usage meter 명령, hook 활성화, 팀 배포, 대시보드, CSV, MCP 통합 runbook. |
| [`../../../guild_hall/assistant_dashboard/README.md`](../../../guild_hall/assistant_dashboard/README.md) | assistant dashboard JSON composer. |
| [`../../../guild_hall/activity/README.md`](../../../guild_hall/activity/README.md) | activity log append/refresh. |
| [`../../../guild_hall/knowledge_access/README.md`](../../../guild_hall/knowledge_access/README.md) | metadata-only knowledge ref read/use ledger helper. |
| [`../../../guild_hall/knowledge_graph/README.md`](../../../guild_hall/knowledge_graph/README.md) | knowledge graph JSON, HTML preview, Obsidian export generator. |
| [`../../../guild_hall/rag/README.md`](../../../guild_hall/rag/README.md) | RAG manifest, source-slice-card, metadata-index, trace/evaluation, indexed answer helper. |
| [`../../../guild_hall/file_activity/README.md`](../../../guild_hall/file_activity/README.md) | project file observation/revision 과 feature-OFF H04 adapter 경계. |
| [`../../../guild_hall/run_history/README.md`](../../../guild_hall/run_history/README.md) | feature-OFF H05 workflow-receipt history adapter 와 coverage 경계. |
| [`../../../guild_hall/schedule_history/README.md`](../../../guild_hall/schedule_history/README.md) | synthetic-only H03B external schedule revision/coverage 후보. |
| [`../../../guild_hall/slack_history/README.md`](../../../guild_hall/slack_history/README.md) | feature-OFF H07 Slack identity/revision/cursor/coverage foundation. |
| [`../../../guild_hall/voice_capture/README.md`](../../../guild_hall/voice_capture/README.md) | voice capture 와 승인-window strong-ASR revision/continuity 경계. |
| [`../../../guild_hall/healer/README.md`](../../../guild_hall/healer/README.md) | 항상 켜 두는 PC 의 self-check / report writer. |
| [`../../../guild_hall/dev_worker/README.md`](../../../guild_hall/dev_worker/README.md) | dev worker task claim / automation prompt / branch handoff. |
| [`../../../guild_hall/battle_log/README.md`](../../../guild_hall/battle_log/README.md) | project-local battle event stream 과 renderer. |
| [`../../../guild_hall/mission_close/README.md`](../../../guild_hall/mission_close/README.md) | battle evidence 를 mission terminal pointer 로 닫는 bridge. |
| [`../../../guild_hall/snapshot/README.md`](../../../guild_hall/snapshot/README.md) | snapshot producer. |
| [`../../../guild_hall/validate/README.md`](../../../guild_hall/validate/README.md) | root/canon validator. |
| [`../../../guild_hall/shared/README.md`](../../../guild_hall/shared/README.md) | guild_hall 내부 공용 io/path helper. |

## 관련 경로

- [루트 architecture README](../README.md)
- [`../../../guild_hall/README.md`](../../../guild_hall/README.md)
- [`../foundation/DOCUMENT_OWNERSHIP.md`](../foundation/DOCUMENT_OWNERSHIP.md)
