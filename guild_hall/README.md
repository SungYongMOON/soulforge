# guild_hall

## 목적

- `guild_hall/` 은 Soulforge 의 cross-project 운영 root 다.
- 이 루트는 project worksite 자체가 아니라, 여러 프로젝트에 공통으로 걸치는 기능 owner 를 모은다. ingress, notify, assignment, night watch 운영과 함께 knowledge supply, projection, 그리고 cross-project 결정론 domain engine 계약·kernel 을 포함한다.
- 실제 local state 는 `guild_hall/state/**` 아래에서만 materialize 하고 Git 으로 추적하지 않는다.
- 이 문서의 `## 구성` 이 `guild_hall/` 자식의 정본 열거다. `docs/architecture/foundation/TARGET_TREE.md` 의 트리는 canonical root 경계를 보여주는 대표 예시이며 자식 전체를 열거하지 않는다.

## 구성

- `gateway/`: 메일 수집, intake, cross-project staging ingress
- `doctor/`: clone 된 PC bootstrap readiness 점검과 local doctor status
- `activity/`: Soulforge 전체 recent-context 장부 append/refresh 구현
- `knowledge_access/`: metadata-only knowledge ref read/use ledger append helper
- `knowledge_canon/`: ontology release inventory/hash package creation and restore verification helper
- `daily_ledger/`: metadata-only daily work ledger validator and ledger-only worklog draft renderer
- `local_activity/`: exact-project HPP-local file observation plus bounded PC-work/Codex relation outbox;
  no conversation or operating-system surveillance and no direct `_workmeta`/ERP write
- `ai_usage_meter/`: Soulforge-wide Codex token/credit collection, parent-child work attribution,
  local ledger/dashboard/CSV, and portable MCP query/binding adapter; no conversation payload capture
- `agent_observation/`: provider-neutral durable agent identity와 provider-native ID crosswalk,
  run 관찰, direct usage 귀속과 self/child/subtree rollup, result/delivery receipt,
  host/resource queue·lease·capacity의 Tool Job Shop 계약, 한 WorkUnit 범위의
  비정본 Context Capsule 계약, 그리고 관찰된 usage를 `ai_usage_meter`의 `soulforge.ai_usage_event.v1`
  로 투영해 그 owner의 validator로 검사하는 read-only bridge. pure in-memory deterministic module이며
  token 수집기·writer가 아니고 장기 Project Context 정본도 아니다
- `file_activity/`: multi-PC project file observation packets, single-primary logical-file/revision reconciliation,
  monthly metadata receipts/events, checkpoint-only rebuild, bounded life-tree projection helper,
  and feature-OFF H04 project-history adapter
- `run_history/`: feature-OFF H05 exact workflow-receipt adapter, replay, and six-state coverage evidence
- `schedule_history/`: synthetic-only H03B external schedule identity, immutable revision, replay, and coverage candidate
- `slack_history/`: feature-OFF H07 Slack workspace/channel/message revision, cursor, dedupe, and coverage foundation
- `backup_controller/`: feature-OFF, single-writer daily backup composition with
  exact activation/binding validation, one durable state ledger, live preflight,
  fixed handlers, and an hourly-tick compatibility API
- `ingress/`: explicit-file, content-deduplicated unclassified staging plus a
  default-OFF HPP lease/fence supervisor for private voice and outbox bindings;
  no project binding, accepted-ingress, ERP, MCP, or TaskEngine authority
- `knowledge_graph/`: metadata-only knowledge graph JSON, HTML preview, and generated Obsidian view helper
- `rag/`: metadata-only RAG manifest, source-slice cards, decision records, metadata retrieval index, trace/evaluation, and indexed answer helper
- `engineering_engine/`: cross-project 증거기반 Engineering Engine Core와 독립 Domain Engine package의 결정론 계약·구현 owner. 현재 Core에 통합된 package는 체계공학(`engines/systems_engineering/`), 품질준비도(`engines/quality_readiness/`), 데이터베이스 공학(`engines/database_engineering/`), 자재조달 준비도(`engines/material_procurement_readiness/`), 신뢰성·정비성(`engines/reliability_maintainability/`), 교정·측정 유효성(`engines/calibration_measurement_validity/`), 형상변경 영향(`engines/configuration_change_impact/`), 제조 준비도(`engines/manufacturing_readiness/`), 현장고장 시정조치(`engines/field_failure_corrective_action/`), 안전위험(`engines/safety_hazard/`), BOM·공급망 위험(`engines/bom_supply_chain_risk/`), 인터페이스 일관성(`engines/interface_consistency/`), PCB 준수 증거준비도(`engines/pcb_compliance/`)다. 각 추가 domain은 `source_supported` candidate이며 live DB·ERP writer·조달/공급업체 승인·인터페이스/제품/품질 합격·변경/제조 승인·고장 disposition/closure·위험 수락·표준 준수·인증·project activation을 뜻하지 않는다. 품질준비도 Q1 deepening은 56-row corpus aggregate와 Profile-added lane을 `observed`/HOLD로 유지하고 locator-only RAG와 unregistered read-only MCP-shaped dispatcher만 제공한다. 조립 모델은 `docs/architecture/guild_hall/ENGINE_CORE_DOMAIN_PROFILE_ASSEMBLY_MODEL_V0.md`가 소유한다. 정본 코드는 `core/` 및 `engines/<domain>/` 아래에 위치하며, 평면 최상위 경로(`kernel/`, `stage_rules/`, `subjects/` 등)는 backward compatibility wrapper로 유지된다.
  Expected/Observed 비교로 Snapshot·Finding·Missing/Unknown·Context Request 후보를 만들고,
  `rag/`·`knowledge_graph/`·`knowledge_access/`·`knowledge_canon/` 을 adapter 계약으로만 소비한다.
  Phase 1–4 baseline 은 `deterministic_only` 이며 학습모델을 호출하지 않는다.
  프로젝트 원문·계약서·source PDF·snapshot payload·secret 은 두지 않는다
- `engineering_mcp/`: 공유 Engineering MCP v0 **계약 데이터 + read-only facade** owner(`identity/task/work/bundle/artifact/submission/review/context/agent/ops` 10 namespace·최소 tool 33종, 현행 `dev-erp-mcp` 공유면 17 tool crosswalk(회사메일 stdio 3종은 명시 제외), 구조 validator, 기본 OFF in-memory read facade — `enabled:true` 정확 일치일 때만 열리고 unknown/mutate/provider 부재·예외/scope 밖/egress 위반은 균일 `not_available` 하나로 수렴, egress는 JSON 복사본 검사·동결). 서버·소켓·실데이터 배선은 없으며 실제 provider 배선은 D27/D28/D29 활성화와 OD-08 물리 tuple을 요구하는 별도 leaf다. 검증은 `npm run validate:engineering-mcp`.
- `deployment_pack/`: 배포 pack 5종 카탈로그·릴리스 gate 사다리 15단(단조 evidence 강제)·rollout ring 8단·runbook 카탈로그 13종의 **계약** owner + **첫 pack builder CLI**(tracked spec→미추적 dist; validate-before-write, secret 내용 스캔, timestamp 없는 byte-동일 manifest, `claimed_gate: contract`까지만 주장하고 격리 install digest 전수검증·installed-copy smoke는 out-of-ladder receipt로만 기록). ring 승격·발행·서비스 기동·물리 ring은 Owner gate 뒤. 검증은 `npm run validate:deployment-pack`.
- `tool_workshop/`: capacity-1 전문공방 job-shop **코어** owner(exclusive lease·단조 fencing token·expiry takeover·priority queue·validator retry·candidate custody receipt). UI idle≠release, stale fence는 승격 0, 수락·완료 표면 없음. 물리 Tool PC·실제 도구 실행은 Owner gate 뒤. 첫 프로파일=Document 공방. 검증은 `npm run validate:tool-workshop`.
- `watch_panel_contract/`: Watch/4192 coarse projection **계약** owner(패널 enum·freshness 의미론·safe pointer·승인요청 filing·no-writer 구조 증명). probe·render·writer 없음. Board 채택: `ui-workspace/apps/team-ops-board/src/core/watch-panel-view.mjs`가 이 계약을 단일 원천으로 소비해 전 domain full-coverage 스트립 view-model(무증거=unknown 행, display severity 요약)을 제공하며 mutation은 계약 request surface(filing)뿐이다 — 검증은 `npm run validate:watch-panel-board`. 페이지 배선 완료: `?watch=1` 명시 flag에서만 렌더되는 기본 OFF strip(`src/watch-strip.tsx`, `main.tsx`에서 **lazy 로드** gate — flag 없으면 strip 모듈 체인을 아예 로드하지 않아 기존 Board와 동일하고, flag 토글은 리로드 필요)이며 preview로 OFF(모듈 로드 0)/ON·콘솔 클린을 검증함 — team-ops-board dev 표면이 곧 4192 포트다(측정: vite 7.3.1은 module-graph 내 cross-root import를 `fs.allow` 없이 서빙하므로 config 변경 불필요). 실 증거 공급자 2종 배선됨(`src/core/watch-evidence-suppliers.mjs`, flag 경로 한정 읽기 전용 GET 2건): `connector_freshness`←receipt-expiry projection의 source-asserted status(ready→healthy, partial→degraded, **unavailable→unknown** — 투영이 못 보는 것을 connector 다운으로 단언하지 않는 의도적 비대칭), `hpp_host`←host-stats(측정치는 단언이 아니므로 unknown+evidence_at, 살아있는 피드=as_asserted vs 없는 피드=no_evidence 구분). 불인식 값·형태 불량·fetch 실패는 전부 무공급(no_evidence)이고 render는 contract throw에 대해 all-unknown으로 강등 방어. 나머지 7 domain 공급자(watchtower topology 포함 — 이 PC엔 binding이 없어 ok-경로 관측 불가)는 후속 leaf. 계약 자체 검증은 `npm run validate:watch-bastion`.
- `bastion_action/`: 승인된 restart/isolate/restore/rollback의 **검증 gate** owner(승인·policy·expiry·lease·backup-generation proof → 주입 executor port; terminal 멱등 receipt, 건강 어휘 구조 배제). synthetic executor만 존재 — 실제 복구 실행은 Owner gate 뒤. 검증은 `npm run validate:watch-bastion`.
- `forge_intent/`: Forge work-generation seam의 **in-memory 순수 core** owner(Work Candidate→TaskIntent 불변 digest→승인 기록→주입 writer port 경유 Official Task 등록→Assignment→Work Brief **draft revision 체인**(누락 binding이 정렬 데이터로 가시화, 채워진 필드는 draft 시점 검증)→최신·완결 draft만 assignment authority가 발행하는 issued Work Brief). accepted context는 호출자 단언 ref만, writer port는 synthetic adapter만 존재 — 실제 Linear writer binding은 별도 Owner gate. 검증은 `npm run validate:forge-intent`.
- `vault_revision/`: Vault ArtifactRevision 상태기계의 **in-memory 합성 수직** owner(5-owner 분리, parent/head, 멱등 replay/quarantine, 균일 거부, review·acceptance 분리, accepted-only input bundle manifest, redaction 파생 lineage — accepted 원본→다른 artifact·다른 digest 후보, 그리고 external gate: accepted **redacted derivative**만 등록 가능·raw 원본 구조적 차단·전송 port 없음). 바이트·영속·promoter·실redaction·실전송·실수락 권한 없음 — D27/D29 활성화와 Owner gate 뒤의 별도 leaf. 검증은 `npm run validate:vault-revision`.
- `requirement_trace/`: 요구사항 추적(RTM) 커버리지 계산의 결정론 순수 함수 owner.
  `engineering_engine/core/validators/` (및 `kernel/` 호환 wrapper) 어휘를 재사용해 커버리지 셀·요구 상태·고아 관측·게이트 준비도와
  payload 없는 영수증만 내고, 원장 writer·저장 표면·게이트 통과 판정은 소유하지 않는다.
  coverage input builder는 요구 ID 색인·Needs 정책·산출물 관측을 그 순수 함수의 입력과 manifest로
  조립하며, 요구 ID는 `observed` candidate로만 다루고 색인을 만들거나 원장에 쓰지 않는다
- `watchtower/`: 각 owner가 선언한 public-safe 구조를 결정론적으로 합성하고, local probe·receipt가
  제공하는 관측과 선언의 차이를 read-only로 진단하는 AX system-topology owner. 구조선은 health·delivery·수리 권한을 뜻하지 않는다.
- `healer/`: 24시간 PC self-check 와 activity report writer
- `shared/`: guild_hall owner 들이 함께 쓰는 repo path / JSON state helper
- `snapshot/`: UI 와 외부 host 가 읽는 read-only sanitized 상태 projection
- `assistant_dashboard/`: 프로젝트별 deadline/open-action/work 장부를 읽는 local-only 비서 종합판 composer
- `validate/`: canonical root 최소 무결성 검사와 validation harness
- `workflow_runner/`: static allowlist와 exact contract로 fixed workflow request를
  prepare/validate/finalize하는 shared runner. 모델·installed skill·plugin·caller command를
  발견하거나 호출하지 않으며 deterministic validation/render/state/artifact/receipt 조율만 소유
- `town_crier/`: 공용 notify queue 와 Telegram outbound transport
- `night_watch/`: nightly review / summary owner
- `dev_worker/`: task packet 을 받아 reviewable branch 를 만드는 bounded development worker lane
- `dungeon_assignment/`: gateway 몬스터를 project/stage 로 배치하는 owner
- `battle_log/`: project-local battle event stream 과 daily/latest battle log renderer
- `mission_close/`: project-local battle evidence 를 mission terminal pointer 로 닫는 bridge
- `always_on_launchd/`: 24시간 PC 에 필요한 deterministic launchd job 배포 표면
- `codex_bridge/`: 로그인된 Codex/ChatGPT 계정에 bounded 분석을 요청하는 bridge (secret 미접촉)
- `codex_work_directory/`: private stable manager catalog와 local live binding을
  public-safe schema로 검증하고 side effect 없이 exact route를 해석하는 directory
- `private_state_sync/`: nested private repo `private-state/` 의 sync helper
- `workmeta_sync/`: nested private repo `_workmeta/` 의 sync helper
- `workspace_junction/`: `_workspaces` mount/junction 점검과 system inventory helper
- `voice_capture/`: local microphone capture, PLAUD original-audio intake,
  resumable independent-ASR supervisor, and feature-OFF approved-window strong-ASR
  revision/continuity foundation for `_workspaces` voice sessions
- `state/`: local-only 운영 상태와 queue/log/env 위치, 전체 활동 recent-context surface

## owner 경계

- `guild_hall/` 은 공용 운영 기능만 소유한다.
- 실제 프로젝트 파일, project-side monster status, raw run truth 는 계속 `_workspaces/<project_code>/` 가 소유한다.
- Soulforge 전체 활동 최근 맥락 같은 cross-project 총괄 context 는 project `_workmeta/` 가 아니라 `guild_hall/state/operations/**` 가 소유한다.
- cross-project 운영 명령 표면은 `guild-hall:*` 만 canonical 로 사용한다.
- `workflow_runner/`의 report/source/stage body와 생성 artifact는 `_workspaces` 또는
  owner-approved worksite에만 두고, `_workmeta`에는 metadata-only receipt만 둔다.
  Codex launcher와 ERP adapter는 같은 runner contract를 쓸 수 있으나 ERP는 launcher
  skill을 호출하지 않는다. fixed runner는 default route, approval, publish/send,
  project-share writeback authority를 갖지 않는다.
- `agent_observation/` 은 pure in-memory 결정론 계약만 소유한다. 파일·network·child process를
  쓰지 않고 ERP 세계수, Board enrollment, result gate writer authority를 갖지 않는다. Board 관련
  출력은 read-only projection이며 등록이 아니다. raw transcript·reasoning·tool payload·credential·
  로컬 절대경로를 저장하지 않고, title·cwd·prefix·age로 identity·parent·project를 추정하지 않는다.
  observation store의 저장 record는 deep freeze하고 원장은 store handle에서 도달할 수 없어
  append-only가 구조로 강제된다. job shop의 job·lease record는 의도적으로 가변 state machine이며
  외부에는 frozen copy와 새 projection만 나간다. Agent memory는 `cache_only`이며 장기 Project Context 정본이 아니다.
  `ai_usage_meter`로의 bridge는 순수 투영이다. meter의 `validateUsageEvent`를 함수로만 부르고
  meter state를 읽지도 쓰지도 않으며, 투영 결과를 meter에 넘기는 것은 별도의 gated action이다.
- `knowledge_access/` 는 명시된 ledger root/file 에만 쓰며 source payload 를 ledger row 에 저장하지 않는다.
- `knowledge_canon/` 은 package payload를 `_workspaces/system/**`에만 만들고 `_workmeta`에는 manifest, Drive/NotebookLM binding, validation, recovery metadata refs만 남긴다. 외부 upload나 NAS write authority는 소유하지 않는다.
- `daily_ledger/` 는 명시된 daily ledger file/ref 만 읽고 report time 에 mail, git history, system log, raw source ref, live `_workspaces` payload 를 스캔하지 않는다.
- `file_activity/` 는 승인된 project worksite를 명시적으로 scan할 때만 file bytes를 streaming SHA-256으로 읽고, payload를 보존하지 않는다. node별 packet과 logical-file/revision state, monthly receipt/event, checkpoint와 life-tree projection은 metadata-only다. checkpoint tail replay와 graph compaction은 아직 지원하지 않으며 live scheduler/transport/ACL/ERP correlation emitter는 별도 활성화 전까지 소유하지 않는다.
- `run_history/`, `schedule_history/`, `slack_history/` 는 public-safe
  feature-OFF/synthetic foundation만 소유한다. 실제 source binding, network
  collector, scheduler, DB/project writer, task/knowledge promotion authority는
  별도 owner 승인 전까지 소유하지 않는다.
- `backup_controller/` 는 기본 feature-OFF 이며 exact activation sidecar 하나로만 daily composition을 연다. binding·runtime commit·writer·시간창·resource type을 고정하고, HPP/ERP/health/weekly verification/workspace fixed handler와 외부 receipt를 제공한다. OFF는 preflight 전에 종료하며 scheduler 설치·automation 교체·ACL 변경·Mac takeover·delete/retention mutation은 소유하지 않는다.
- `ingress/` 는 절대 data root의 metadata manifest를 검증한 뒤 명시된 regular file 하나만 unclassified content-digest path로 복사하고, opaque source identity별 receipt/checkpoint history를 분리한다. 연속 supervisor는 private exact binding의 voice/outbox만 one-shot으로 drain하고 D-local lease epoch/fence를 매 payload 전후 재검증한다. source locator/body를 metadata나 operator output에 남기지 않으며 accepted/quarantine/project binding, DB/network/MCP/service/task writer 또는 scheduler 설치 권한을 소유하지 않는다.
- `knowledge_graph/` 는 generated local view 만 만들며 graph weight, usage count, Obsidian link 를 truth/approval 로 취급하지 않는다.
- `rag/` 의 기본 manifest/index/trace/evaluation/answer path 는 metadata-only 이며 source text, private payload, NotebookLM answer, chunk, source-text vector/BM25 store 를 읽지 않는다.
- `rag/` 의 승인된 private source-text command 는 별도 lane 이며 owner-approved `_workspaces/knowledge/**` source text 만 읽을 수 있다. 이 lane 의 저장 출력도 기본은 metadata-only 이고, 명시 승인된 command/source card 가 허용한 경우에만 `_workspaces/knowledge/**` 아래 private proof payload 를 남긴다.
- `guild_hall/state/**` 는 local-only state 이며 public repo 에 올리지 않는다.
- `codex_work_directory/`는 실제 route 목록이나 runtime 값을 소유하지 않는다.
  실제 stable catalog는 owner-approved `_workmeta` private surface, live binding은
  `guild_hall/state/operations/codex_work_directory/`가 소유한다. directory
  resolver는 ambiguous/stale/retired/unknown route에서 fail closed하며 message
  send, route 생성, default route 변경 권한이 없다.
- `assistant_dashboard/` 는 project-local 장부를 truth 로 읽는 요약 view 만 만들며, deadline/open-action/work 상태 자체를 확정하거나 수정하지 않는다.
- `voice_capture/` 는 raw audio/transcript 를 `_workspaces` 에만 남기고 `_workmeta` 에는 reviewed metadata pointer 를 별도 단계에서만 남긴다.
  bounded strong-ASR revision은 승인된 30~90초 material window의
  non-canonical append-only 파생본이며 whole-session 정본 포인터, 완료 알림,
  delivery receipt 또는 project route를 덮어쓰지 않는다.

## 관련 경로

- [루트 README](../README.md)
- [`docs/architecture/guild_hall/README.md`](../docs/architecture/guild_hall/README.md)
- [`docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md`](../docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md)
- [`docs/architecture/guild_hall/ASSISTANT_DASHBOARD_V0.md`](../docs/architecture/guild_hall/ASSISTANT_DASHBOARD_V0.md)
- [`docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`](../docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md)
- [`docs/architecture/guild_hall/CODEX_WORK_DIRECTORY_V1.md`](../docs/architecture/guild_hall/CODEX_WORK_DIRECTORY_V1.md)
- [`docs/architecture/guild_hall/AI_USAGE_METER_V1.md`](../docs/architecture/guild_hall/AI_USAGE_METER_V1.md)
- [`ai_usage_meter/README.md`](ai_usage_meter/README.md)
- [`docs/architecture/workspace/VOICE_CAPTURE_MVP_V0.md`](../docs/architecture/workspace/VOICE_CAPTURE_MVP_V0.md)
- [`docs/architecture/bootstrap/README.md`](../docs/architecture/bootstrap/README.md)
- [`_workspaces/README.md`](../_workspaces/README.md)
