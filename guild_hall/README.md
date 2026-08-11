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
- `engineering_engine/`: cross-project 증거기반 체계공학 판단 engine 의 결정론 kernel 과 계약.
  Expected/Observed 비교로 Snapshot·Finding·Missing/Unknown·Context Request 후보를 만들고,
  `rag/`·`knowledge_graph/`·`knowledge_access/`·`knowledge_canon/` 을 adapter 계약으로만 소비한다.
  Phase 1–4 baseline 은 `deterministic_only` 이며 학습모델을 호출하지 않는다.
  프로젝트 원문·계약서·source PDF·snapshot payload·secret 은 두지 않는다
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
