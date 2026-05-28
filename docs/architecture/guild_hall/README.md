# docs/architecture/guild_hall

## 목적

- `guild_hall/` root 의 owner 경계와 cross-project 운영 계약을 모은다.
- `gateway`, `doctor`, `town_crier`, `night_watch`, `dev_worker`, `dungeon_assignment`, `battle_log`, `mission_close` 같은 공용 운영 기능을 `_workspaces/<project_code>/` worksite 와 분리해 설명한다.

## 문서 역할 색인

| 문서 | 역할 |
| --- | --- |
| `GUILD_HALL_MODEL_V0.md` | `guild_hall` 이 gateway, notify, assignment, operation state 를 어떻게 소유하는지 고정한다. |
| `KNOWLEDGE_OPERATING_MODEL_V0.md` | Combines the knowledge access ledger, manual candidate capture, LLM suggestion approval, end-of-work sweep, sourcebound packet, and access-event analysis layers. |
| `KNOWLEDGE_WORKFLOW_STACK_V0.md` | project work 에서 실제로 knowledge layer 를 어떤 순서와 workflow stack 으로 쓰는지 고정한다. |
| `KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md` | Fixes the Google Drive source warehouse, NotebookLM query bookshelf, source catalog, and ontology-candidate vocabulary and placement rules. |
| `KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md` | Defines the metadata-only graph view, visual encoding, source trace, layout, and Obsidian/operations export split for knowledge graph views. |
| `RAG_MANIFEST_MVP_V0.md` | Fixes the metadata-only RAG manifest, source-slice-card, decision-record, metadata-index, trace/evaluation, and answer-command boundary. |
| `RAG_THREE_STAGE_OPERATING_MODEL_V0.md` | Defines the three plain RAG progress stages: searchable RAG, work-ready RAG, and canon knowledge. |
| `CODEX_ACCOUNT_BRIDGE_V0.md` | Describes the account-based Codex CLI bridge for advisory analysis without storing an API key. |
| `KNOWLEDGE_WIKI_WORLDVIEW_V0.md` / `knowledge_wiki_worldview_v0.html` | Teammate-facing overview of the Soulforge knowledge wiki worldview, current status, operating rules, and next steps. |
| `SOULFORGE_ACTIVITY_LOG_V0.md` | cross-project recent-context 와 carry-forward event surface 를 설명한다. |
| `SOULFORGE_SNAPSHOT_V0.md` | UI/external host 가 읽을 sanitized read-only snapshot 계약이다. |
| `NIGHT_WATCH_AUTOMATION_V0.md` | 항상 켜 두는 node 에서만 ACTIVE 로 둘 점검 자동화와 경계를 설명한다. |
| `ALWAYS_ON_STRATEGIC_REVIEW_V0.md` | 24시간 Mac mini 에서 healer, night_watch, Ouroboros strategic review 를 어떻게 나누어 pull/run 할지 설명한다. |
| `DEV_WORKER_AUTOMATION_V0.md` | task packet 을 받아 reviewable branch 를 만드는 bounded development worker lane 을 설명한다. |
| `doctor/README.md` | bootstrap/readiness doctor 의 owner-local 설명이다. |
| `../../../guild_hall/activity/README.md` | activity log append/refresh 구현 surface 설명이다. |
| `../../../guild_hall/knowledge_access/README.md` | metadata-only knowledge ref read/use ledger helper 설명이다. |
| `../../../guild_hall/knowledge_graph/README.md` | metadata-only knowledge graph JSON, HTML preview, and Obsidian export generator 설명이다. |
| `../../../guild_hall/rag/README.md` | metadata-only RAG manifest, source-slice-card, metadata-index, trace/evaluation, and indexed answer helper 설명이다. |
| `../../../guild_hall/healer/README.md` | 항상 켜 두는 PC 의 self-check / report writer 구현 surface 설명이다. |
| `../../../guild_hall/dev_worker/README.md` | dev worker task claim / automation prompt / branch handoff 구현 surface 설명이다. |
| `../../../guild_hall/battle_log/README.md` | project-local battle event stream 과 battle log renderer 구현 surface 설명이다. |
| `../../../guild_hall/mission_close/README.md` | project-local battle evidence 를 mission terminal pointer 로 닫는 bridge 구현 surface 설명이다. |
| `../../../guild_hall/shared/README.md` | guild_hall 내부 공용 io/path helper surface 설명이다. |
| `../../../guild_hall/snapshot/README.md` | snapshot producer 구현 surface 설명이다. |
| `../../../guild_hall/validate/README.md` | root/canon validator 구현 surface 설명이다. |
| `gateway/README.md` | gateway owner root 의 intake/update/notify 설명이다. |
| `gateway/mail_fetch/README.md` | mail fetch capsule 의 구현-side runbook entrypoint 다. |
| `gateway/mail_send/README.md` | outbound mail sender capsule 의 구현-side entrypoint 다. |
| `gateway/mail_fetch/runbooks/**` | mail fetch 운영 runbook 묶음이다. |
| `gateway/mail_fetch/policies/**` | mail fetch 정책과 안전 기준 묶음이다. |
| `gateway/mail_fetch/spec/**` | mail fetch 구현 spec 묶음이다. |
| `../workspace/GATEWAY_MAIL_FETCH_V0.md` | workspace 문서군에 둔 mail fetch public contract 다. |
| `../workspace/MAIL_SEND_V0.md` | workspace 문서군에 둔 outbound mail public contract 다. |
| `../workspace/GATEWAY_NOTIFY_V0.md` | workspace 문서군에 둔 notify command contract 다. |
| `../workspace/NOTIFY_MODEL_V0.md` | workspace 문서군에 둔 notification owner model 이다. |
| `../workspace/MULTI_PC_DEVELOPMENT_V0.md` | guild_hall 자동화가 어느 PC/node 에서 ACTIVE 인지 판단할 때 참조하는 multi-PC 계약이다. |

## 관련 경로

- [루트 architecture README](../README.md)
- [`../../../guild_hall/README.md`](../../../guild_hall/README.md)
- [`doctor/README.md`](doctor/README.md)
- [`../../../guild_hall/activity/README.md`](../../../guild_hall/activity/README.md)
- [`../../../guild_hall/knowledge_access/README.md`](../../../guild_hall/knowledge_access/README.md)
- [`../../../guild_hall/rag/README.md`](../../../guild_hall/rag/README.md)
- [`../../../guild_hall/healer/README.md`](../../../guild_hall/healer/README.md)
- [`../../../guild_hall/dev_worker/README.md`](../../../guild_hall/dev_worker/README.md)
- [`../../../guild_hall/battle_log/README.md`](../../../guild_hall/battle_log/README.md)
- [`../../../guild_hall/mission_close/README.md`](../../../guild_hall/mission_close/README.md)
- [`../../../guild_hall/shared/README.md`](../../../guild_hall/shared/README.md)
- [`../../../guild_hall/snapshot/README.md`](../../../guild_hall/snapshot/README.md)
- [`../../../guild_hall/validate/README.md`](../../../guild_hall/validate/README.md)
- [`GUILD_HALL_MODEL_V0.md`](GUILD_HALL_MODEL_V0.md)
- [`KNOWLEDGE_OPERATING_MODEL_V0.md`](KNOWLEDGE_OPERATING_MODEL_V0.md)
- [`KNOWLEDGE_WORKFLOW_STACK_V0.md`](KNOWLEDGE_WORKFLOW_STACK_V0.md)
- [`KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md`](KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md)
- [`KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md`](KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md)
- [`RAG_MANIFEST_MVP_V0.md`](RAG_MANIFEST_MVP_V0.md)
- [`RAG_THREE_STAGE_OPERATING_MODEL_V0.md`](RAG_THREE_STAGE_OPERATING_MODEL_V0.md)
- [`CODEX_ACCOUNT_BRIDGE_V0.md`](CODEX_ACCOUNT_BRIDGE_V0.md)
- [`KNOWLEDGE_WIKI_WORLDVIEW_V0.md`](KNOWLEDGE_WIKI_WORLDVIEW_V0.md)
- [`knowledge_wiki_worldview_v0.html`](knowledge_wiki_worldview_v0.html)
- [`SOULFORGE_ACTIVITY_LOG_V0.md`](SOULFORGE_ACTIVITY_LOG_V0.md)
- [`SOULFORGE_SNAPSHOT_V0.md`](SOULFORGE_SNAPSHOT_V0.md)
- [`NIGHT_WATCH_AUTOMATION_V0.md`](NIGHT_WATCH_AUTOMATION_V0.md)
- [`ALWAYS_ON_STRATEGIC_REVIEW_V0.md`](ALWAYS_ON_STRATEGIC_REVIEW_V0.md)
- [`DEV_WORKER_AUTOMATION_V0.md`](DEV_WORKER_AUTOMATION_V0.md)
- [`../workspace/GATEWAY_MAIL_FETCH_V0.md`](../workspace/GATEWAY_MAIL_FETCH_V0.md)
- [`../workspace/MAIL_SEND_V0.md`](../workspace/MAIL_SEND_V0.md)
- [`../workspace/GATEWAY_NOTIFY_V0.md`](../workspace/GATEWAY_NOTIFY_V0.md)
- [`../workspace/NOTIFY_MODEL_V0.md`](../workspace/NOTIFY_MODEL_V0.md)
