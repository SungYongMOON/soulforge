# Watchtower — AX 시스템 토폴로지 검사 (W1)

관제 소비자. 이미 생산 중인 하트비트·health 파일을 **period+grace 2단 윈도**로
판정해, 경로가 노출되지 않는 topology health 스냅샷을 만든다. W1 범위는
**검사·표시 전용**이며 복구(self-heal)·알림·스케줄 상주화는 W2에서 별도 owner
승인 게이트로 추가한다.

## 소유 경계

- 소유: 토폴로지 정의(`topology.mjs`, public-safe 노드·간선), 판정 엔진, probe CLI.
- 비소유: 하트비트 생산(각 수집기 소유), 자동 복구·알림(W2), 실제 경로·임계값
  (local binding 소유 — 추적되지 않는 로컬 파일).
- 정적 간선은 구조만 나타낸다. source나 collector가 `ok`여도 연결된 provider·공통
  meter·원장·Board의 health로 전파하거나 합성하지 않는다.
- 원문·secret·절대경로는 스냅샷에 들어가지 않는다(`assertSnapshotPathFree`가
  기계 검증).

## 파일

| 파일 | 역할 |
| --- | --- |
| `topology.mjs` | Soulforge AX 토폴로지의 public-safe 정의 (노드 28 · 간선 36)와 fail-closed 정적 검증 |
| `topology_federation.v1.schema.json` | owner별 구조 fragment의 strict public-safe wire contract |
| `topology_federation.mjs` | fragment 검증, namespace 합성, canonical digest, declared/observed exact-set reconciliation |
| `topology_provider_adapters.mjs` | allowlist된 Watchtower·Engineering Engine 선언 구조를 fragment로 바꾸는 순수 adapter |
| `providers/knowledge_stack.mjs` | RAG·Knowledge Graph·Wiki의 공개 owner 계약 bundle을 지식 provider fragment로 변환 |
| `providers/notebook_advisory.mjs` | Notebook metadata bridge·research workflow·setup 계약을 authority-free HOLD fragment로 변환 |
| `tools/emit_federated_topology.mjs` | 고정된 tracked source allowlist만 읽어 단일 derived projection을 생성하거나 byte parity를 검사하는 도구 |
| `topology/federated_topology.v1.json` | UI가 읽을 수 있는 tracked public-safe 선언 구조 projection; runtime truth가 아님 |
| `topology/federated_topology.v1.contract.json` | **단일 topology oracle pin**(요약·provider별 노드/간선 수·artifact sha256). producer 테스트와 Board unified-view 테스트가 기대값을 전부 이 pin에서 유도하므로, 구조 성장은 의도적 pin 갱신이고 무언의 drift는 양쪽에서 fail-closed다 (`L-RED-02`) |
| `watchtower.mjs` | binding 검증, probe 4종(jsonl_tail/json_file/dir_latest_mtime/schtask), 판정, 스냅샷 |
| `internal_receipt_catalog.mjs` | 내부 시한성 영수증 계약 카탈로그, 4분류(same_authority_local_auto_renew/owner_revalidation_required/on_demand_ephemeral_excluded/external_auth_excluded) 검증 및 순수 평가기 |
| `local_evidence.mjs` | Watchtower 실행 계약, five-field metadata 원장, `_workmeta` payload policy의 독립 검증 receipt |
| `recovery_diagnostics.mjs` | 4대 장애군(`scheduled_task_action_drift`, `usage_event_duplicate_conflict`, `standing_receipt_expired`, `auth_refresh`) 순수 진단 분류기 (public-safe, 경로/secret/원문 무노출) |
| `recovery_runtime.mjs` | ignored local binding을 읽는 5분 evidence/recovery companion; exact task digest와 사전·사후 검증 없이는 실행 거부 |
| `cli.mjs` | `probe [--binding <path>\|--pointer <path>] [--json] [--no-write]`, `init-binding --output <path>` |
| `watchtower.test.mjs` | 합성 판정·경로 미노출·원자 기록 회귀 |

## Federation 계약

- 각 subsystem이 자기 선언 구조의 owner이고 Watchtower는 이를 복제 정본으로 승격하지 않는다.
- 현재 producer allowlist는 Watchtower native topology, Engineering Engine generated topology,
  Knowledge Stack owner-contract bundle, Notebook advisory owner-contract bundle 네 개다.
  glob·폴더 자동발견·관계 추측은 금지한다.
- 합성 projection 한 파일만으로 구조를 그릴 수 있지만, 실제 runtime health·freshness·delivery는 local
  binding의 probe와 receipt가 별도 제공한다. 둘의 exact node/edge set 차이는 reconciliation 결과로 드러낸다.
- fragment와 projection은 프로젝트 식별자, 실제 경로, payload, source text, NotebookLM answer, account/session,
  credential을 포함하지 않는다. Notebook advisory provider의 `active`가 아닌 `hold`는 정식 provider ID와
  외부 실행 권한이 아직 없다는 뜻이며, 계정 연결이나 source-grounded answer readiness를 뜻하지 않는다.
- `diagnose`와 `propose_repair`는 후보 능력이다. `execute_repair`, source truth, 공식 답변, Owner 승인,
  runtime mutation 권한은 federation v1에서 항상 `false`이다.

## 판정 규칙

- `age <= period` → 정상, `<= period+grace` → 열화(`heartbeat_late`),
  초과 → `stale`. 소스 부재·파싱 불가 → `down`(fail-closed).
- `status_field`가 `ok_values` 밖이면 열화(`status_<value>`),
  `degrade_when`의 수치 초과도 열화(`count_<field>_<value>`).
- A probe may expose an informational `activity_field` plus optional bounded
  count/next-at fields. For the Hiworks forwarder and AI usage collectors this separates
  collector liveness from its `retrying|held` backlog: the node may remain healthy while the
  backlog stays visible, and invalid activity metadata fails closed.
- `resident_task`가 지정된 노드는 stale일 때 schtasks 상태로 정지 여부를
  구분한다(`task_not_running` → down).
- probe가 없는 구조 노드는 이유 코드가 있는 `unmonitored`다. provider source는
  `provider_evidence_absent`, 실제 on-demand 실행 증거를 받지 않는 collector는
  `catalog_only_on_demand`, 공통 meter와 Watchtower 자체는
  `independent_evidence_absent`다. 미감시를 정상으로 칠하지 않는다.
- `watchtower_self`, `gate_five_field`, `store_workmeta`는 Board runtime의 별도
  evidence companion이 각각 실행 계약, metadata-only 원장, payload policy를 검증한
  receipt가 있을 때만 관측된다. receipt가 없거나 손상되면 `unmonitored`/HOLD이며
  Watchtower가 자기 스냅샷을 자기 건강 근거로 재사용하지 않는다.
- exit code: 0=판정 완료, 2=down 노드 존재, 1=실행 실패.

## AI 사용량 hybrid topology

AI 사용량 lane은 provider별 상주 미터가 아니다. 실제 구현에 맞춰 Board의 5분
companion이 호출하는 local producer와 하나의 공통 meter/원장을 구조로 표시한다.

```text
Codex session JSONL ───────> usage_codex_collector ──────┐
Claude Code session JSONL ─> usage_claude_collector ─────┼─> usage_meter
Antigravity DB ────────────> usage_antigravity_collector ┘       │
                                                                  v
                                                     store_usage_ledger
                                                                  │
                                                                  v
                                                         Workspace Board
```

- 세 collector는 각각 `collect`, `collect-claude`, `collect-antigravity`의 실제
  local producer다. Board companion이 5분마다 호출하지만 상주 provider meter나
  provider 로그인·가용성 증거를 뜻하지 않는다.
- 공통 `usage_meter`는 usage-event 검증·집계 계약이며 provider가 아니다. provider
  source, provider collector, aggregate는 각각 `health_scope`가 분리된다.
- 기존 `usage_meter` probe key는 `usage_codex_collector`의 generic/Codex hook collector
  health에만 붙는다. 이 `ok`는 `src_codex`, Claude/Antigravity, 공통
  `usage_meter`, 공유 원장이 정상이라는 증거가 아니다.
- 실제 probe 주체인 `usage_codex_collector → watchtower_self` control 간선만
  `usage_collector_health_only` scope를 가진다. 공통 aggregate의
  `usage_meter → watchtower_self`는 별도 `usage_contract_structure_only` scope로
  usage-event contract의 구조적 관찰 관계만 표시한다. 이 간선은 health/state를
  담을 수 없고 aggregate/provider/self freshness를 전달하지 않는다. provider 사용
  가능성·비용 정확도·Board freshness도 이 두 관계로 판정하지 않는다.

## 로컬 배선 (추적되지 않음)

- binding: local control plane의 `watchtower/binding.v1.json`
  (실경로·주기·resident task — `init-binding`으로 틀 생성 후 로컬 값 기입).
- pointer: `guild_hall/state/operations/watchtower/binding.pointer.json`
  (git-ignored) — CLI와 Board 어댑터의 기본 진입점.
- 스냅샷: binding `state_root`의 `snapshot/topology_health.v2.json` (원자 쓰기). v2는 모든 non-green 노드의 추적 시각·소유자·복구 가능성을 명시하므로 producer와 Board를 함께 배포한다.

## 소비자

- Workspace Board(team-ops-board)의 `시스템 토폴로지` 탭 —
  `src/server/topology-adapter.mjs`가 loopback 전용
  `GET /topology-health.snapshot.json`으로 probe 결과를 중계한다.
- 수집기·워커의 node-scoped `상태 관찰` 관계는 Watchtower W1의 왼쪽 입력으로 들어가며,
  Watchtower는 오른쪽으로 `판정 스냅샷`만 내보낸다. 이 간선은 검사·표시
  관계이며 self-heal이나 복구 권한을 뜻하지 않는다.

## Board runtime 분리

- Board의 HTTP refresh는 항상 `probe --no-write`로 읽기 전용이다. 정식 Board runtime의 기존
  5분 producer companion만 별도 `probe --pointer ... --json`을 실행해 로컬 snapshot을 원자적으로
  갱신한다. 새 scheduler를 만들지 않으며 pointer/binding 부재나 probe 실패는 다음 주기에 재시도되는
  partial 상태다.
- snapshot의 `edge_delivery`와 각 edge의 `delivery`가 선언 구조와 윈도 내 전달 영수증을 분리한다.
  future topology producer도 같은 allowlisted receipt contract를 사용해야 하며 node health로 edge를
  승격할 수 없다.

## 검증

```bash
npm run validate:watchtower
npm run guild-hall:watchtower:probe
```

### Non-green tracking and bounded safe recovery

- Every non-`ok` node carries a sanitized tracking record with its stable node
  ID, fixed reason, evidence owner, last check/next evidence due time, repairability, verification
  state, and escalation owner. External providers, on-demand Antigravity, and
  the feature-OFF timeline stay non-green until their separately owned evidence exists.
- The Board labels unmonitored nodes as evidence-unconnected and breaks them
  down into structural markers, missing provider evidence, on-demand execution,
  and other evidence gaps. These categories are not failures and are never
  promoted to green without independent evidence.
- `health_recovery_coordinator.mjs` is a feature-off recovery contract. Observe
  mode never executes repairs. Safe-repair mode still requires an injected
  action allowlist, executor, and independent verifier; credential, deletion,
  acknowledgement, route, account, upload, and external-send actions are denied.
- `recovery_runtime.mjs` binds that contract only to allowlisted local scheduled tasks whose
  exact action digest is registered in ignored local state. The restart allowlist admits only
  safe local/internal nodes (`ingress_supervisor`, `store_mail_events`, `store_voice_custody`,
  `voice_label_worker`, `local_activity`, `store_activity_outbox`, `usage_codex_collector`,
  `usage_claude_collector`, `usage_meter`, `store_usage_ledger`, `consumer_board`, `slack_batch`,
  `store_slack_custody`, `usage_antigravity_collector`, `gate_five_field`, `store_workmeta`,
  `watchtower_self`) backed by Owner-bound local read-only/custody tasks. Provider account/source
  mutation, external sending (`mail_forwarder`), and unbound workers (`codex_retention_report`,
  `src_*`, `consumer_timeline`) remain strictly excluded from recovery binding.
- A candidate must be `stale`, `down`, or pending verification from a previous cycle; the task
  must be safely startable, and independent pre/post checks must pass. Candidate nodes sharing the same
  `task_name` + `action_digest` are deduplicated and started at most once per recovery cycle.
- A non-auto-repairable diagnostic reason (such as terminal auth codes `auth_invalid_grant`,
  `auth_token_revoked`, `auth_mfa_required`, `auth_consent_required`, `auth_invalid_client`,
  `auth_terminal_error`, `auth_unknown_failure`, standing cutover receipt errors `continuous_plaud_cutover_receipt_*`
  (`invalid`, `missing`, `unsafe`, `unstable`, `digest_mismatch`), writer authority errors (`writer_authority_expired`,
  `continuous_writer_authority_*`, `writer_authority_mode_off`, `writer_authority_continuous_lease_active`), backup
  activation errors (`backup_activation_expired`, `backup_controller_activation`, and all 24 exact
  `BACKUP_ACTIVATION_ERROR_CODES` from `guild_hall/backup_controller/activation.mjs` including `now_invalid`
  and fail-closed sentinel `activation_error_code_unregistered`), `task_action_path_drift`,

  credentials, tokens, passwords, logins, and permissions) on ANY bound node in a shared task group gates
  the entire group before task inspection as `owner_action_required`, surfacing all bound nodes in
  recovery receipts with the normalized explicit `diagnostic_code`, zero task starts, and zero consumed retry attempts.
- Usage-conflict reasons (`usage_event_duplicate_conflict`, `usage_event_conflict`, `quarantine_applied`)
  belong to the producer-owned quarantine-and-continue lane; they suppress generic restart for that
  node and shared task group as `observe_only` with zero starts without selecting a winner or mutating credentials.
- Transient auth reasons (`auth_transient_retry`, timeouts, `token_http_429`, etc.) remain eligible for bounded
  retry under the existing supervision budget/backoff/circuit and may restart exact owned safe tasks.


- When an owned task exists and is enabled but its actual `action_digest` differs from the bound
  digest in local binding state, the recovery runtime diagnoses `task_action_path_drift` and returns
  `owner_action_required`. It never executes or rewrites the drifted task.
- `recovery_diagnostics.mjs` provides a pure public-safe classifier `classifyRecoveryDiagnostic(sanitizedEvidence)`
  and `classifyRuntimeNodeReason(reason)` covering the 4 failure families (`scheduled_task_action_drift`,
  `usage_event_duplicate_conflict`, `standing_receipt_expired`, `auth_refresh`) with strict closed enums,
  exact-key output envelopes, and zero path/secret leaks.

- Post-verification requires causal fresh producer/Watchtower evidence (where evidence
  observation timestamp is newer than the attempt start, bounded by a 5000ms clock tolerance)
  and zero task exit code (`last_task_result === 0`). A changed `last_run_at`,
  task `running` state, or `Start-ScheduledTask` invocation acceptance alone is
  never considered verified. When a newly started task is running in background, any nonzero
  exit code belonging to the previous run does not fail verification; the node is recorded
  as `not_verified` pending fresh producer evidence.
- Multi-cycle pending verification: on the subsequent cycle, a pending `not_verified` node
  is deterministically resolved: fresh post-attempt evidence closes to `verified_repair`
  with zero restarts; a completed failed task closes to `postverify_failed`; and a still-running
  task remains pending with zero restarts.
- Recovery supervision state schema is bumped to v2 (`soulforge.watchtower.recovery_supervision.v2`),
  recovery cycle wire schema is v3 (`soulforge.watchtower.recovery_cycle.v3`),
  recovery history wire schema is bumped to v2 (`soulforge.watchtower.recovery_history.v2`)
  to durably persist `diagnostic_code`, and projection is v3
  (`soulforge.team_ops_board.topology_recovery_projection.v3`). For deployment compatibility,
  the local companion transparently migrates valid legacy v1 supervision and history records on read without row loss
  (clearing untrustworthy legacy `last_verified_repair_at`), persisting v2 on subsequent cycles,
  while the Board adapter continues to reject legacy wire schemas.
- Recovery supervision persists only bounded sanitized state and the latest 200
  material events. Failed eligible attempts back off for 5 minutes, 15 minutes,
  then 60 minutes; the third consecutive failure opens a 60-minute circuit and
  permits one half-open trial afterward. Only an independently verified repair
  resets the circuit.
- A task that is already running but has stale evidence is never stopped or
  restarted. It is reported as `running_but_stale` for Owner action. Invalid
  supervision/history or an invalid fresh Watchtower snapshot suppresses all
  repair execution and retains the last valid evidence instead of resetting it.
- The Board exposes the cycle, retry state, circuit state, supervisor receipt,
  and recent sanitized history through the existing loopback GET-only recovery
  projection. This projection cannot execute repair or change topology health,
  colors, edge delivery, provider state, or account state. Board interaction labels
  require exact `verified_repair` outcome before indicating completed repair.

### AI usage producer heartbeat

- The final validated ledger also writes an independent `store_usage_ledger` receipt; it cannot green a provider, the Meter lane, or any data edge.
- The Board consumer uses its controller-owned runtime heartbeat plus exact resident-task state. Watchtower does not call its own Board endpoint as evidence.
- Local activity uses the scheduler runner's atomic sanitized receipt. A successful no-delta cycle is healthy idle, not failure.

- Board의 5분 companion은 ignored state의 `producer_health/{codex,claude,antigravity,meter}.json`에
  경로·원문 없는 원자적 heartbeat를 남긴다. `startUsageProducerCompanion`은 이미 진행 중인 sweep과
  겹치는 tick을 건너뛰므로, 정상 건강한 sweep도 다음 시도가 한 tick(300초) 밀려 시작 간격이
  600초까지 벌어질 수 있다. 관측된 건강한 전체 sweep 소요시간(312741ms)에서 나온 360초 여유를
  더해 period는 960초(`USAGE_PRODUCER_HEALTH_PERIOD_SECONDS`, `cli.mjs`)로 다섯 usage 노드
  (`usage_codex_collector`/`usage_claude_collector`/`usage_antigravity_collector`/`usage_meter`/
  `store_usage_ledger`)가 공유하고, grace는 기존 600초를 그대로 분리 유지한다.
- Antigravity lane은 로컬 conversation DB를 읽기 전용으로 수집한다. 앱·계정·로컬 RPC를
  시작하거나 호출하지 않으며, 성공 heartbeat는 issue 없는 collector 실행만 증명한다.
  DB가 0개인 clean no-op은 정상 유휴지만 공급자 가용성 증거는 아니다. issue가 하나라도
  있으면 `antigravity_collection_partial`로 fail closed한다. 공급자 가용성 및 data edge 전달은
  계속 별도 근거가 없으므로 승격하지 않는다.
- Codex·Claude·Antigravity는 각 수집 시도/성공을 독립적으로 기록한다. Meter 성공은 세 수집이
  끝난 뒤 최종 ledger snapshot의 schema와 생성 시각을 검증한 경우에만 기록한다.
- `activity_changed=false`는 정상 유휴이며 장애 신호가 아니다. 토큰·event 증가는
  `activity_changed=true`라는 정보성 활동 표시일 뿐 health 판정에 참여하지 않는다.
- 첫 heartbeat가 없거나 손상되면 `unmonitored`(UNKNOWN/HOLD)다. last-good 뒤의 실패는
  grace 안에서 degraded, period+grace(1560초)를 넘으면 stale이며, `down`은 소유 scheduled
  task가 명시적으로 실행 중이 아니라고 확인된 경우에만 쓴다.
- 이 heartbeat는 collector/Meter control health만 증명한다. data edge는 별도 receipt가
  없으므로 계속 `unreceipted`이며 provider/account 상태나 완전한 전달을 증명하지 않는다.
