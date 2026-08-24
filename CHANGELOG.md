# CHANGELOG

## 2026-08-24 - AI Usage Meter: Codex usage activity projection, exact partial reconciliation, and Board history v4

- **Codex usage activity projection (`ai_usage_meter`)**: Implemented `codex_usage_activity.mjs` and schema `soulforge.ai_usage_codex_activity_projection.v1`. Long-running multi-day turns in Codex session JSONL single-pass parser derive exact monotonic token deltas from source `token_count` observation lines relative to turn baseline, rather than attributing the entire cumulative turn usage to `event.time.started_at`. Counter regressions flag safe issue `codex_activity_counter_regression` and exclude the affected turn without crashing or synthetic timestamps. Raw prompts, reasoning content, tool payloads, and session paths are strictly excluded (`privacy.metadata_only = true`). Persisted projection is compact (`{ thread_id, turn_id, observations: [{ observed_at, delta_tokens }], total_tokens }`), dropping redundant dimensions to keep write latency and storage footprint minimal (~1.7 MB for 6.5k turns).
- **Durable activity sidecar persistence (`ai_usage_meter`)**: Full authoritative collection persists `usage_activity/current.json` atomically, even when activity turns are empty, replacing stale prior sidecars. Scoped collects are strictly prevented from overwriting authoritative full coverage. Active session turns are included only when the source file is fresh (within 15 minutes of modification time). Bounded read enforces 32 MB upper limit and rejects symlink/non-regular files.
- **Exact partial reconciliation & Board history v4 (`ai_usage_meter` / `team-ops-board`)**: `board_history_snapshot.mjs` and `ai-usage-history-snapshot.mjs` introduce Board history v4 schema (`soulforge.ai_usage_board_history_snapshot.v4`), requiring `codex_activity_coverage` summary (`state: complete | partial`, `matched_turns`, `mismatched_turns`, `unmatched_turns`, `uncovered_turns`) and accepting `turns: 0` for subsequent observation dates while maintaining backward compatibility with v2 and v3 schemas. Reconciles exact covered event identities (`thread_id` + `turn_id`) between canonical events and activity deltas, distributing token metrics across daily, hourly, window, and model/provider series according to actual observation timestamps, while preserving canonical turn counts, credits, and task attribution authority at `started_at`. Uncovered legacy canonical events and mismatched events are retained verbatim on `started_at` without failing the board or guessing. Zero matches or absent sidecar emit legacy v3 without claims. All-time totals strictly reconcile with the canonical ledger.
- **Usage trend range toggle with v4 activity basis (`team-ops-board`)**: `UsageTrendChart` in `App.tsx` provides an accessible `최근 7일` (default) / `최근 30일` range toggle, allowing recent activity (e.g. ~1.3B daily volume) to remain visibly substantial in the 7-day view without being visually compressed by older ~9B historical peaks in the 30-day window, while avoiding artificial summary cards or number boxes. Preserves truthful v4 textual basis notes (` · 토큰 관측일 기준` for complete coverage, ` · 토큰 관측일 우선 · 미근거 항목은 시작일 기준` for partial coverage, omitted for v3 fallback), model/provider tabs, stable series colors, selected-series peak rescaling within the active range, dynamic x denominator and date tick strides, hit-grid column alignment, and AG request overlay semantics.

## 2026-08-24 - Read-only Board freshness: bounded event load concurrency and multi-session Codex quota selection

- **Usage aggregation latency and breakdown underflow fix (`ai_usage_meter`)**: `loadPersistedUsageEvents` now loads persisted event JSON files using bounded worker concurrency (default 32, max 64) rather than sequential iteration. Custom concurrency options are clamped to the fixed maximum. Strict per-event schema validation, immediate error propagation, and deterministic chronological ordering (`started_at` then `event_id`) are preserved with zero new external dependencies or authority changes. In addition, credit accumulation in board snapshot and history snapshot projections now quantizes additions to the stored schema precision (9 decimal places), eliminating floating-point summation drift that caused spurious breakdown underflows across large ledgers.
- **Server-side single-flight sharing and TTL caching (`team-ops-board`)**: `ai-usage-adapter` now implements bounded single-flight computation coalescing and a 60-second in-memory TTL cache for successful validated projections, eliminating thundering-herd disk re-reading on overlapping 30-second browser polling and manual requests. `refresh=1` is explicitly parsed to bypass the TTL cache while joining any existing in-flight projection computation. Exact enrollment is verified on every request before returning cache, with cache and in-flight work bound to exact scope keys and in-flight scope mismatches failing closed to `HOLD`. Failed or unavailable reads return fail-closed `HOLD` without poisoning previously cached successful projections. Loopback GET-only enforcement and exact enrollment requirements are strictly preserved.
- **Codex quota freshness race (`team-ops-board`)**: `provider-limits-adapter` now inspects a bounded window of recent session files (up to 12 files within 4 days) and bounded 256 KB tails rather than selecting only the single newest session file. When an active session has not yet emitted a rate-limit line, the reader reconciles timestamps across recent sessions via `selectCodexRateLimitObservation` to select the freshest valid observation rather than retaining stale data. The 60-second in-memory cache, loopback GET-only boundary, and fail-closed behavior are preserved.
- **Usage trend chart range toggle and active-range scale decompression (`team-ops-board`)**: `UsageTrendChart` now defaults to a 7-day range (`최근 7일`) with an accessible toggle to switch to 30-day history (`최근 30일`), making current Codex and Claude usage visibly comparable against older multi-billion-token spikes without artificial summary boxes. Series and AG request overlays slice to the active range, and selecting a legend series dynamically rescales the vertical axis to that series' peak within the active range while preserving exact values, stable colors, dynamic tick stride, hit-grid tooltip navigation, keyboard focus, and AG right-axis semantics.
- **Usage trend tooltip guide visibility (`team-ops-board`)**: `UsageTrendChart` now computes a clamped placement at the plot edge opposite the active date, including the midpoint, so the selected vertical guide and its date/value point remain outside the tooltip on desktop and narrow SVG layouts. The tooltip stays non-intercepting; model/provider tabs, both ranges, colors, and Antigravity request-overlay semantics are unchanged. This is a client-only rendering correction with no runtime, producer, schema, or credential change.

## 2026-08-23 - Current-state documentation correction: seams, receipt v2, Hermes rationale, P2 scope

- This entry is the documentation half of one integrated slice: the correction below ships in the
  same final public change as the source and test changes it describes, not as a separate
  documentation-only delivery. The code was written by the preceding leaves and is described here as
  it actually is.
- `guild_hall/agent_observation/README.md` now describes the owner as it stands. The module table
  names the four seams that replaced the single observation file - `agent_registry.mjs`,
  `run_observation.mjs`, `usage_ledger.mjs`, `delivery_evidence.mjs` - plus
  `observation_internals.mjs` as owner-private shared internals and `agent_observation.mjs` as the
  compatibility barrel that keeps every existing import path and owns only the two genuinely
  cross-family surfaces. The stated scope is the P0/P1 foundations and the P2 Board view-model
  foundation, not P0-S1/P0-S2 alone.
- The receipt schema is recorded as `soulforge.agent_observation.result_receipt.v2`, and
  `delivery_target` is documented with its exact ceiling: it is the **producer's observed intended
  hand-over** to an exact run, agent and work unit, verified against observed runs. It is not a
  consumer acknowledgement, and nothing in this owner observes the consumer's side.
- **Supersedes the Hermes rationale in the 2026-08-22 usage-meter bridge entry above.** That entry
  said adding Hermes to the meter's `source.kind` "migrates a validated schema with persisted state
  behind it". That was false. Adding a value to the enum is additive: every persisted row already
  carries its own `kind`, so no stored row is rewritten and the new value appears only in rows
  recorded afterwards. The historical entry stays as written; this is the correction of record.
  Hermes remains withheld from the meter mapping for the real reason - no actual collector has yet
  proven its token confidence semantics - and opening that mapping is a collector-evidence decision,
  not a projection-function decision.
- **Supersedes any screen-complete reading of the 2026-08-23 "Stage P2" entry above.** P2 is a Board
  **view-model foundation**: a pure builder with no screen, route, server or runtime wiring, and the
  4192 runtime does not import it. Visible wiring and live producer activation stay `HOLD`, and no
  live evidence is claimed - the view's tests drive the owner's real deterministic projections, which
  is not an operational screen observation.
- Added two 2026-08-23 rows to the Roadmap plan-delta log: the Agent Observation P0~P2 foundation
  current state, and the Hermes Desktop install-only truth (official NousResearch source, agent
  v0.20.5 installed, one hidden local boot smoke succeeded and all related processes stopped; no
  OAuth, login, provider connection, API key, MCP, scheduler, channel or Probe; unsigned local
  executable and a dependency audit of 4 high / 0 critical keep security at `HOLD`). No local machine
  path or credential is recorded.
- **독립 재검토와 그 뒤의 실제 보정.** 새 `claude-fable-5`/high 세션이 이 slice를 byte 수준
  **읽기 전용**으로 재검토해 `REVISE`를 냈다. Fable은 어떤 suite도 실행하지 않았고 코드를
  고치지도 않았다. 지목은 셋이다 — moderate: Board view가 알 수 없는 `hold_code`를 화면에
  되쓴다, low: meter lineage key의 로컬 경로 면제가 너무 넓다, info: delivery receipt에
  target run 시작 시각에 대한 경계가 없다.
- 지목을 주장으로 받지 않고 **먼저 실패하는 테스트로 재현했다.** 보정 전 실제 RED는 Board view
  24건 중 20 pass·4 fail, delivery edge 23건 중 22 pass·1 fail이었다.
- 그 RED 위에서 세 경계를 고쳤다. (1) 알 수 없거나 label이 없는 hold code는 고정 문구 하나로만
  닫히고 producer 문자열이 화면에 오르지 않는다. (2) meter lineage key는 meter 자신의 뿌리인
  맨 앞 `/root` segment만 이름으로 면제하고, 알려진 로컬 경로 모양은 meter root 아래에 숨어
  있어도 행에서 제외한다 — `root`와 `/root/...` 계보는 그대로 그려진다. (3) target run이
  시작하기 전 시각으로 관찰된 delivery receipt는 `DELIVERY_TARGET_TEMPORAL_INVERSION`으로
  막는다. 동시각은 받아들이고, hold이므로 원장에는 아무것도 append되지 않는다.
- 보정 뒤 focused GREEN: Board view 24/24, delivery edge 23/23.
- 이 최종 바이트는 두 번째 fresh acceptance 재검토 대상으로 고정한다. `ACCEPT` 여부는 독립
  reviewer receipt가 소유하며 이 항목 자체는 구현자나 manager의 self-claim으로 닫지 않는다.
- 검증(최종 코드 수정 뒤 관찰된 그대로, 모두 exit 0): focused Board view test 24/24,
  focused delivery edge test 23/23,
  `npm run validate:path-policy`(changed scope) 5 pass·1 environment skip·위반 0,
  `npm run validate:agent-observation` 293/293, `npm run validate:team-ops-app` 631/631,
  `npm run validate:ai-usage-meter` 123 pass·1 skip·0 fail, `npm run validate:canon`
  checked 137·errors 0·warnings 0, `npm run validate:core-loop` 88 pass·2 todo·0 fail,
  `npm run validate:watchtower` 113/113, `npm run validate:voice-first-accepted-context` 31/31에
  P5 candidate 12/12, `node guild_hall/validate/boot_digest_guard.mjs` OK, `git diff --check` clean.
  변경·미추적 21개 파일 NUL scan에서 검출 없음. 이전에 이 자리에 적혀 있던 canon 실행 불가
  blocker와 path-policy 위반 2건은 더 이상 현재 상태가 아니다.
- 운영 영향: 없음. 명령 표면, 런타임, 권한, writer 활성화가 모두 그대로다. Roadmap이 바뀌었으므로
  `AGENT_BOOT_DIGEST_V0.sources.json`을 저장소 소유 writer(`--update`)로 재서명했고 digest 본문은
  손으로 고치지 않았다.
- 관련 경로: `guild_hall/agent_observation/README.md`,
  `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`,
  `docs/architecture/foundation/AGENT_BOOT_DIGEST_V0.sources.json`, `CHANGELOG.md`.

## 2026-08-23 - Stage P2: a Board view for the Agent Observation evidence

- Added `ui-workspace/apps/team-ops-board/src/core/agent-observation-view.mjs`. The observation
  owner has been producing store counts with a privacy audit, delivery edges, Board health and the
  meter lineage rollups, and nothing displayed any of them. This turns those projections into panels
  in the same shape the other topology views use: a pure view-model builder that takes projections
  the caller already holds and neither fetches, writes, nor reads a clock.
- **A held projection is rendered as that hold, never as an empty panel.** "Nothing to show" and "we
  could not look" mean opposite things to a reader, and a blank panel says the first while meaning
  the second. Each of the four panels carries its own availability and reason.
- **The privacy panel will not call itself clean on three zeroes alone.** Those counters read the
  same whether every record family was audited or none were, so the panel lists the families the
  store reported auditing and names any that are missing. A store that dropped a family from its own
  audit list shows as not clean with the missing family spelled out.
- **Adjacency is never drawn as delivery.** The delivery and structural counts stay in separate
  columns exactly as the observation contract keeps them apart, a consumer with adjacency and no
  delivery is marked `adjacent_only` rather than shown as a zero, and each evidence ref carries the
  producer that supplied it.
- The lineage panel lists only agents whose subtree cost more than their own row — a leaf and a
  childless root are not dispatchers, and listing every one would bury the handful that actually
  dispatched work. It flags the case where a grandchild makes `subtree` differ from
  `self + child_direct`, says when it truncated, and reports how many intermediate parents the
  source list never emitted.
- The tests feed the view the **real projections** from `guild_hall/agent_observation` rather than
  hand-written shapes. A view tested against a fixture its own author invented proves the two agree
  with each other, not that either matches the contract.
- 운영 영향: 순수 view-model이며 서버·라우트·런타임 변경이 없다. 4192 런타임은 이 module을 아직
  import하지 않으므로 화면에 붙이는 것은 별도 단계다. `npm run validate:team-ops-app`이 그대로
  검증하며 607에서 616 test로 늘었다.
- 관련 경로: `ui-workspace/apps/team-ops-board/src/core/agent-observation-view.*`.

## 2026-08-23 - Agent Observation P1-3: the meter's lineage was there, unread

- Added `guild_hall/agent_observation/meter_lineage_projection.mjs`. Measured against the live
  ledger first: 29,898 recorded turns, **all on a single `local-node`**, across 744 `by_agent` rows
  that the summary treats as opaque keys. On that evidence the self / child-direct / subtree
  separation the observation contract defines looked uncomputable from real data.
- It is computable. `actor.agent_id` is path-shaped — `root`, `/root/ax_board_recovery_worker`,
  `/root/opus_ingest_vertical/…` — with 680 of the 744 ids at depth 2 or 3 under one `root` and 64
  bare names. The lineage was present in every row and simply never read as lineage, so a parent's
  `by_agent` row counts only its own turns and nothing in the ledger answers what an agent's subtree
  cost.
- `child_direct` sums immediate children only. Folding grandchildren in would let a manager reading
  "my children cost this" silently absorb a generation it did not dispatch, which is the distinction
  the observation contract draws and the reason the two rollups are separate at all.
- No parent is inferred. `/root/a/b` has parent `/root/a`, `/root/a` has parent `root` because that
  is how the ledger spells its own root, and a bare name like `Faraday` has none. Deriving lineage
  from a naming resemblance is the guess this owner refuses everywhere else.
- An intermediate agent that recorded no turns has no row at all. Materialising it with zeroes keeps
  its children from vanishing out of every subtree above them; the live ledger was missing eleven
  such parents.
- The correctness bar is a partition: every root's subtree must sum to the ledger's own total, so no
  turn is counted twice or dropped. Verified against the real ledger at 29,905 = 29,905, then frozen
  as a measured fixture — `guild_hall/state/**` is gitignored, so a test reading it would pass here
  and fail on every other machine.
- 운영 영향: 새 명령 표면은 없다. pure 함수이며 meter 원장을 읽지도 쓰지도 않고 caller가 건넨 행만
  다룬다. `npm run validate:agent-observation` 하나가 그대로 검증한다.
- 관련 경로: `guild_hall/agent_observation/**`, `package.json`.

## 2026-08-23 - Engine topology: a test module in a code area, and the pin that caught it

- `npm run validate:watchtower` had been red on `main` since `b1bee4c2` with
  `topology_adapter_node_count_mismatch: expected=34; actual=36`. The obvious repair — raise the pin
  to the observed 36 — would have been wrong. Only one of the two extra modules was real.
- `project_context_acceptance_gate.test.mjs` lived in `kernel/`, and `emit_topology.mjs` scans
  `kernel`, `assembly` and `subjects` as code areas, so the engine's own test was counted as a module
  and brought three import edges with it. It was the only such file; the other 39 engine tests all
  live in `tests/`. Moved, with its three sibling imports rewritten to `../kernel/`; the two
  `../../` imports keep working because `tests/` and `kernel/` sit at the same depth.
- Regenerated from the corrected tree: the engine is **35 modules / 156 edges** and the federation is
  **74 nodes / 206 edges**. The adapter pin now records 35/156 — the one module of legitimate growth,
  not the contamination.
- The engine manifest had to be regenerated *after* staging, because it asserts each row against the
  sha256 of the blob staged in the index rather than the working tree.
- Fixed the two `package.json` references that pointed at the old `kernel/` path.
- Updated every pinned count the move invalidated: the adapter, six in the watchtower adapter tests
  including the two-provider subtotal, and six across the Board's classic and unified topology view
  tests including the per-provider breakdown.
- **The Board's classic engine view had gone dark and no count would have revealed it.**
  `ENGINE_LANES` is a hand-maintained layout that must cover the engine's module set exactly, and
  `project_context_acceptance_gate` was in no lane, so the whole view returned
  `available: false` with `engineering_engine_lane_coverage_mismatch`. Placed in the EVIDENCE lane
  beside `project_context_generation_candidate`, the module it gates, with the same `store` shape.
- Carried in the regression test that prevents the recurrence: the engine topology must contain no
  module whose name ends in `.test`. It fails against the old tree and passes against the new one.
- `guild_hall/watchtower/README.md` said the AX topology holds 27 nodes and 33 edges; `topology.mjs`
  emits 28 and 36. Nothing checked that prose. Corrected.
- 운영 영향: main·4192·runtime 동작 변경 없음. 순수하게 tracked 구조 정본과 그 검증·표시 계층의
  정정이다. `validate:watchtower`가 처음으로 다시 초록이며, 저장소에 34/153 또는 73/203 잔존
  참조는 없다.
- 관련 경로: `guild_hall/engineering_engine/**`, `guild_hall/watchtower/**`,
  `ui-workspace/apps/team-ops-board/src/core/topology-*`, `package.json`.

## 2026-08-23 - Agent Observation P1-1 review pass: guards that no test could lose

- The Stage P0 + P1-1 review returned ACCEPT with no blocking findings, but reported that **six
  delivery-edge guards could each be deleted with all 267 tests still green**. Behaviour was
  correct; the suite was not a regression barrier for it. Every one of those mutants is now killed,
  measured by a baseline-gated probe: 17 mutants, 0 survivors.
- The privacy-audit wiring was the hardest of them. Asserting all-zero counters proves nothing,
  because zero is what they read whether or not a family is on the audit list — the claim the
  previous CHANGELOG made hardest was the one assertion that could not detect its own omission.
  `projectStoreCounts` now derives `privacy_audited_families` from the same array that drives the
  audits, so dropping a family changes the output. A second declaration would be free to drift, so
  there is only one.
- Two guards inside `recordDeliveryEdge` were unreachable and have been deleted rather than tested.
  `recordResultReceipt` already pins a receipt's agent to its run's agent, so an agent re-check
  after the run check could never fire; and it already refuses a `delivery` receipt carrying
  `structural_only`, so a stored delivery receipt is always producer-observed. An unreachable guard
  is worse than none: it reads as protection while no input can exercise it.
- One receipt now evidences one hand-over. Two edges citing the same receipt doubled both the
  delivery count and the evidence refs for a consumer — the same silent doubling the usage ledger
  keeps a content index to prevent. The refusal is `RECEIPT_ALREADY_EVIDENCED`.
- Evidence refs now name the producer that supplied them. A flat pooled list said a consumer
  received these artifacts without saying from whom, which is not attribution.
- The receipt-kind refusal at the edge got its own code, `EDGE_RECEIPT_NOT_DELIVERY`. It was reusing
  `STRUCTURAL_EDGE_NOT_DELIVERY`, whose name describes a different situation, so a caller switching
  on the code learned the wrong thing.
- The hold-code pin now holds each table's **key set**, not just its size and value-equals-key.
  Renaming a key while keeping the table the same size left both of those true while the store
  shipped a hold with no code at all, and every per-case assertion compared `undefined` against
  `undefined`. That trap applied to all seven tables and all thirty-six codes.
- The delivery-edge fixture no longer records a hand-off to a run that had already terminated, and
  the two endpoint runs now start at different times so each temporal bound is reachable on its own
  end rather than being masked by the other.
- 운영 영향: `projectStoreCounts`의 반환에 `privacy_audited_families`가 추가된다. 이를 읽는
  consumer는 아직 없다. 새 명령 표면은 없고 `validate:agent-observation` 하나가 그대로 검증한다.
  여전히 pure in-memory이며 파일 쓰기, network, provider, ERP 세계수 write, Board enrollment
  write, result gate write는 모두 0이다.
- 관련 경로: `guild_hall/agent_observation/**`.

## 2026-08-22 - Watchtower recovery runtime: expand safe local restart allowlist and pin diagnostic boundaries

- Expanded the Watchtower deterministic recovery runtime restart allowlist (`guild_hall/watchtower/recovery_runtime.mjs`) to admit remaining safe local/internal nodes backed by Owner-bound local read-only/local-custody tasks (`slack_batch`, `store_slack_custody`, `usage_antigravity_collector`, `gate_five_field`, `store_workmeta`, `watchtower_self`).
- Maintained exact safety rails: candidate nodes must still be validated with exact task name + SHA256 action digest, enabled state, Ready/Queued state, pre-verification, post-heartbeat causality, and bounded supervision (3 attempts, exponential backoff, 60-minute circuit).
- Strictly excluded provider accounts/source mutations and external senders from automatic recovery (`mail_forwarder`, `src_*`, `src_gmail`, `consumer_timeline`, `codex_retention_report`).
- Hardened runtime execution reason gating in `recovery_runtime.mjs` via shared `classifyRuntimeNodeReason`:
  - Terminal auth reasons (`auth_invalid_grant`, `auth_token_revoked`, `auth_mfa_required`, `auth_consent_required`, `auth_invalid_client`, `auth_terminal_error`, `auth_unknown_failure`, credentials, tokens, passwords, logins, permissions) on any bound node in a shared task group gate the entire group before task inspection as `owner_action_required`, resulting in zero task starts and zero consumed retry attempts.
  - Standing receipt aliases covering cutover errors (`continuous_plaud_cutover_receipt_*` variants `invalid`, `missing`, `unsafe`, `unstable`, `digest_mismatch`), writer authority errors (`writer_authority_expired`, `continuous_writer_authority_*`, `writer_authority_mode_off`, `writer_authority_continuous_lease_active`), and backup activation errors (`backup_activation_expired`, `backup_controller_activation`, and all 24 exact `BACKUP_ACTIVATION_ERROR_CODES` from `guild_hall/backup_controller/activation.mjs` including `now_invalid` and `activation_error_code_unregistered`) gate the task group before task inspection as `owner_action_required` with normalized diagnostic codes (`cutover_receipt_expired`, `writer_authority_expired`, `backup_activation_expired`) and zero task starts.
  - Usage-conflict reasons (`usage_event_duplicate_conflict`, `usage_event_conflict`, `quarantine_applied`) suppress generic restart for the node/group as `observe_only` with zero starts without selecting a winner or mutating credentials, preserving producer-owned quarantine-and-continue semantics.


  - Transient auth reasons remain bounded retries under the existing supervision budget/backoff/circuit and may restart exact owned safe tasks.
- Pinned diagnostic classification boundaries in `guild_hall/watchtower/recovery_diagnostics.mjs`:
  - Terminal auth cases (`auth_invalid_grant`, `auth_token_revoked`, `auth_mfa_required`, `auth_consent_required`, `auth_invalid_client`, `auth_terminal_error`, `auth_unknown_failure`) remain zero-retry `owner_action_required` / `owner_reauthorize`.
  - Transient auth cases remain `bounded_retry` (max 3 with backoff and circuit open evidence only).
  - Expired standing receipts (`voice_plaud_writer_cutover_receipt`, `backup_controller_activation`) remain `owner_revalidate_receipt`; only `ingress_writer_authority` with valid `same_authority_local_auto_renew` category qualifies for `revalidate_state`.
  - AI usage duplicate conflicts remain `quarantine_and_continue` with verified non-conflicting persistence, bounded recovery receipt, and healthy-with-backlog projection.

- Added public `EXAMPLE_BINDING` probe contract for `codex_retention_report` in `guild_hall/watchtower/cli.mjs` as read-only file observation with `missing_is_unmonitored: true` without inventing any task or producer.
- Added comprehensive unit and regression tests in `recovery_runtime.test.mjs`, `recovery_diagnostics.test.mjs`, and `watchtower.test.mjs`.

## 2026-08-22 - Agent Observation P1-1 producer-evidenced delivery edge

- Added the delivery edge as a fifth record family. A result receipt is single-ended: it records
  that a run produced these refs and says nothing about who received them, so the Functional Agent
  to Spreadsheet Craftsman handoff existed only as a fixture pairing two ids rather than as an
  observed fact. The edge names both ends and carries the producer evidence across.
- The distinction the edge exists for: `structural` means two runs are adjacent in a graph,
  `delivery` means something was actually handed over. A delivery edge requires a delivery receipt
  on the **producer's own run** whose evidence is `producer_observed`; a receipt belonging to any
  other run or agent is `RECEIPT_RUN_MISMATCH`, because an edge must not borrow evidence it did not
  produce. A structural edge may not name a receipt at all, since adjacency evidences nothing.
- The projection never sums the two kinds. `delivery_edge_count` and `structural_edge_count` are
  reported separately, so a consumer that is merely adjacent to a producer can never be read as one
  that received something.
- An edge across projects is refused by the same firewall the run and capsule contracts use, an
  edge pointing at its own run is `SELF_DELIVERY_FORBIDDEN`, and an edge observed before its own
  evidence or before either endpoint run started is a temporal hold.
- The new family is counted, privacy-audited and deep-frozen exactly like the other four. A family
  left out of the audit is a family that is not audited, so no exception was made.
- 운영 영향: 새 명령 표면은 없다. `npm run validate:agent-observation` 하나가 새 test 파일까지
  검증한다. 여전히 pure in-memory이며 파일 쓰기, network, provider, ERP 세계수 write, Board
  enrollment write, result gate write는 모두 0이다.
- 관련 경로: `guild_hall/agent_observation/**`.

## 2026-08-22 - AI usage projection: include all local provider usage in read-only aggregates

- Added `codex_session_jsonl` to `DEFAULT_READ_ONLY_BOARD_USAGE_PROVIDERS` in `guild_hall/ai_usage_meter/board_history_snapshot.mjs`.
- The read-only diagnostics snapshot (`/ai-usage-meter.snapshot.json?read_only=1` / `loadReadOnlyBoardUsageProjection`) now aggregates all local recorded provider events (Codex, Claude, Antigravity) across total/model/provider/daily series so that local usage is comprehensively represented without omitting unregistered sessions.
- Maintained exact enrollment registry safety: enrollment registry availability remains mandatory to open the projection, and Board display labels / organization grouping still join only on exact enrolled thread IDs (unmatched rows remain `미연결·기타` / `미등록 TASK` / exact safe ID without guessing organization or role).
- An unavailable, disabled, or empty enrollment registry continues to fail closed to `UNMEASURED / HOLD` without exposing a projection.
- Kept strictly read-only, loopback, no collector invocation, no writer, and no raw path/title/prompt/tool/message leakage. Does not claim official provider billing or quota completeness.
- Added tests verifying full provider aggregation with both enrolled and unregistered Codex events, fail-closed handling for disabled/empty registries, and absence of raw fields.

## 2026-08-22 - Agent Observation P0 second review pass: budget window, prototype bypass

- Fixed the retention shrink loop publishing a report just over budget while its lists were still
  full. The loop's exit test measured the envelope **before** `retention.report_budget` existed, and
  the marker serialises to about 177 bytes, so any report landing in that window below the limit was
  written over it with `shrink_passes: 0` and the blame placed on an unshrinkable remainder.
  Reproduced end to end at 204,801 bytes against a 204,800 budget with all five candidates retained.
  The marker is now created before the loop, so every measurement — including the exit test —
  counts the artifact that contains it, and `shrink_passes` is written before the next measurement
  rather than after the loop.
- Swept 1,220 reports across five list sizes and the whole neighbourhood of the budget: zero cases
  where `measured_bytes` disagreed with the file, zero where `budget_met` disagreed with the file,
  and zero published over budget while anything droppable remained.
- Fixed a registry with a non-plain prototype bypassing the isolation snapshot in
  `result_gate_preparation.mjs`. `snapshotValue` returns anything that is not a plain object or
  array **by reference**, and the isolation check tested `typeof === 'object'` rather than
  `isPlainObject`, so the copy never happened and every later read went through the caller's live
  accessors. Demonstrated with a getter behind `Object.create({})` answering `0` for the check and
  `1000` afterwards: the result was `PREPARED` at revision 1002, a registry that looks like the
  successor to a long history while carrying two synthetic events — and `registry_revision` is a
  field the Board's own derivation never reads, so nothing downstream would have caught it.
  `guardEntry` already refuses on `isPlainObject`; this was the one call site that did not. A null
  prototype remains legitimately accepted, because `isPlainObject` admits it and the snapshot
  therefore copies it like any other plain object.
- The producer now refuses a `now` whose ISO form is not the canonical 24 characters.
  `canonicalizeJson` deliberately excludes `generated_at` from the digest so that identical content
  at two different times digests identically, but `measured_bytes` counts `generated_at`'s bytes and
  is itself digested — so a timestamp such as `3e14`, whose ISO form is 27 characters, silently
  reintroduced the coupling the canonicalizer promises to remove.
- Test gaps closed, each with the mutant that used to survive: the encoding half of the previous
  fix was unproven because every fixture was pure ASCII, where UTF-8 bytes and UTF-16 code units
  coincide — a Korean-labelled report, realistic in this repository, measures 69,508 bytes against
  63,908 code units, and the suite now contains one; the settle loop's convergence and its bound
  were unasserted; the budget boundary and the no-echo property of the store hold were unpinned.
- 운영 영향: 새 명령 표면은 없다. 기존 `validate:codex-retention-automation`과
  `validate:agent-observation`이 새 test를 그대로 검증한다. 남은 경계 하나를 명시한다 — 두 목록
  밖의 무게가 리포트를 512 KB 위로 밀어 올리면 그 파일은 유일한 reader가 열 수 없고, 이유를 담은
  marker도 그 안에 있어 함께 읽히지 않는다. 그 경우 reader는 이제 정확히 `file_oversized`를
  보고하므로 신호 자체는 남지만, 생산자가 기록을 거부하도록 바꾸는 것은 이 단계의 범위가 아니다.
- 관련 경로: `.workflow/codex_thread_manager_v0/codex_retention_automation_internal.mjs`,
  `guild_hall/agent_observation/result_gate_preparation.mjs`.

## 2026-08-22 - AI usage collector self-repair, truthful backoff, and bounded recovery retention

- Added deterministic safe self-repair and bounded recovery history retention to AI usage collector companion (`ui-workspace/apps/team-ops-board/ops/ai-usage-producer-companion.mjs`). Allowlisted duplicate/merge conflicts with verified non-conflicting persistence and verified final ledger projection maintain an `ok` collector heartbeat with `retry_state: "retrying"`, advancing attempt number truthfully up to 3 consecutive budget attempts with exponential backoff before transitioning to `held`.
- Defer/finalize Codex collector heartbeat and recovery receipts until after final ledger projection verification (`current.json`) is confirmed; invalid/failed ledger projections fail closed to error/HOLD.
- Non-repairable parse anomalies (e.g. `usage_counter_regressed`, `session_meta_missing`) with verified persistence and verified projection are held as `ok` with `retry_state: "held"`, `action: "none"`, `verification_result: "unresolved_hold"`, without guessing or fabricating tokens.
- Recovery history retention is strictly bounded to 50 records (128 KB max) and only logs clean transitions from active incidents, preserving incident signal during normal operation.
- Updated `guild_hall/watchtower/recovery_diagnostics.mjs` so `quarantine_and_continue` requires verified persistence, bounded recovery receipt, and healthy-with-backlog projection.

## 2026-08-22 - Agent Observation P0 review fixes: fail-closed bridge, honest retention budget

- Fixed both `usage_meter_bridge.mjs` entry points throwing instead of holding on an unrecognised
  store handle. The list accessors return `null` — not an empty array and not a throw — and reading
  that straight into a loop produced `TypeError: records is not iterable` where the module's own
  documented contract promises a hold. The same hazard was already handled in
  `board_health_projection.mjs` and the fix was simply not carried across. Both entry points now
  report `UNKNOWN_STORE`, which the hold-code table previously did not even contain.
- Fixed the retention byte budget measuring the wrong artifact. It tested the compact UTF-16 length
  while the file is written pretty-printed as UTF-8; probing put the gap at up to 4.2x, and a
  fixture measured at 118 KB was written at 504 KB. The budget now measures exactly what is written,
  including the digest and the marker's own bytes, and the marker equals the file byte for byte
  across every shape tested.
- Fixed the shrink loop exiting silently while still over budget. Only two lists are shrinkable, so
  weight in `classifications`, `source_refs` or `source_health` can hold a report over the limit no
  matter how much detail is dropped — producing a 712 KB file that had discarded 100% of its
  candidates and said nothing about either fact. Every report now carries
  `retention.report_budget` with the measured size, whether the budget was met, how many shrink
  passes ran, and whether an unshrinkable remainder is the reason it was not. A consumer never has
  to infer from a marker's absence that all was well.
- `measureMeterProjectability` no longer overstates. A run with a null `work_unit_id` is legal in
  `observeRun` and rejected by the meter, and the counter called it projectable — leaving the health
  signal whose stated purpose is detecting contract drift blind to the one drift the bridge's own
  test names as proof the meter validator is load-bearing.
- `result_gate_preparation.mjs` now checks isolation against a snapshot and appends to that same
  snapshot. It previously validated a snapshot and then appended to the caller's object, so a Proxy
  could show one registry to the check and hand another to the append. That is the same
  validate-one-thing-build-from-another shape a previous review found at the store entry points.
- The same module now passes an explicit empty `env` to the Board's append. Omitting it deferred to
  the ambient environment, where `TEAM_OPS_BOARD_RESULT_GATES_DISABLED` could change the result of a
  function documented as pure — and the test asserting it reads no environment works by scanning
  source text, which a transitive default argument defeats.
- Test gaps closed, each with the mutant that used to survive: the two hold-code tables added in
  this stage were unpinned, so two distinct refusals could be collapsed onto one wire value with
  every test green; `RESULT_GATE_HEALTH_VALUES` could be emptied entirely because the vocabulary
  check only verified that present values exist; the `claude` and `antigravity` provider rows were
  never exercised, and swapping one produces a meter-*valid* but false event that claims exact
  per-message measurement for a request-count-only collector; the whole byte-budget mechanism was
  dead under the suite; `board_health_projection`'s declared authority boundary was never asserted;
  and the synthetic event-id prefix, epoch and display label were unasserted outputs.
- Corrected three claims against the code: the module header for result-gate preparation described
  the live registry as eighteen `result_ready` events when it is five threads' complete lifecycles;
  the retention comment cited a 256 KB reader that never reads this report; and the owner README
  still claimed a single external import after a second one landed.
- 운영 영향: 새 명령 표면은 없다. `retention.report_budget`이 리포트에 추가되지만 최상위와
  `summary`의 exact key set 밖에 있으므로 projection이 그대로 받는다. 그 사실 자체를 test가
  확인한다. 여전히 파일 쓰기·network·provider·ERP 세계수 write·Board enrollment write·result gate
  write는 모두 0이다.
- 관련 경로: `guild_hall/agent_observation/**`,
  `.workflow/codex_thread_manager_v0/codex_retention_automation_internal.mjs`.

## 2026-08-22 - Agent Observation P0 result-gate preparation, retention bound, hold-code unification

- Added `guild_hall/agent_observation/result_gate_preparation.mjs`. It prepares result-gate
  activation for one synthetic exact Agent/Run and proves the activation with the Board's own
  `appendThreadResultGateEvent` and `deriveThreadResultGateState`, rather than with a local
  restatement of their rules.
- The live registry at `guild_hall/state/operations/team_ops_board/thread_result_gate.v1.json` is
  **not** disabled: it carries `disabled: false`, revision 18, and five threads' complete lifecycles
  — five `started`, five `result_ready`, four `accepted`, four `closed`. So the hazard is not
  accidentally enabling a dormant gate, it is letting a synthetic Agent/Run write into a ledger that
  is already live. Two structural refusals prevent that. The module performs no I/O at all, which a
  test asserts by scanning its source for every filesystem call, and it accepts only a registry that
  is demonstrably empty — revision zero, no events, not disabled — which the live registry is not
  and cannot be made into.
- An activation is a pair of events, not one. The Board's lifecycle refuses a `result_ready` that no
  `started` precedes, so a module emitting only the announcement would never activate anything. The
  `started` event is stamped at the run's own start and the `result_ready` at its end, because the
  two are separate observations.
- A gate event is refused for a run that never claimed a result, and for a claimed result with no
  `result` or `delivery` receipt behind it. Approval, validation, artifact and recovery receipts are
  paperwork around a run, not evidence that a result was produced.
- Bounded the retention producer. `retention.candidates` grew with the enrolled-thread count and
  `inventory.rows` with the feature count, and neither had any limit, so the producer would
  eventually publish a report past the readers' 512 KB and 256 KB limits. Both lists are now capped
  at 200 entries, and the assembled envelope is measured and halved until it fits a 200 KB budget.
  Every truncation carries a marker stating the true total, how many were kept and how many were
  dropped, so a truncated list can never be mistaken for a complete one. The summary counts are
  unaffected, so bounding the detail does not understate the outstanding work.
- The markers live inside `retention` and `inventory` rather than at the top level, because the
  projection enforces an exact top-level key set and throws `report_extra_keys_forbidden` on any
  addition. A test drives a truncated report through that projection to prove the placement is legal.
- Split the retention projection's `file_stat_invalid_or_oversized`, which covered six unrelated
  conditions, into `file_absent_or_unreadable`, `file_not_regular`, `file_is_symlink`,
  `file_has_hard_links` and `file_oversized`. The code named a size problem for what is, on this
  machine, always a missing file: the activity root has no `reports/` subtree at all, so nothing
  oversized has ever been observed on this path. `receipt-expiry-adapter.mjs:115` carries the same
  conflation in a different feature and is deliberately left alone rather than have its error
  surface changed as a side effect of this one.
- Unified the stale-observation refusal. `registerHost` reported `HOST_RECORD_CONFLICT` while both
  resource paths reported `HEALTH_OBSERVATION_NOT_NEWER` for the identical situation, so a caller
  handling a stale collector reading had to special-case the record kind. All three now report
  `HEALTH_OBSERVATION_NOT_NEWER`; a genuine identity conflict keeps `HOST_RECORD_CONFLICT`.
- `projectUsageRollup` no longer answers "this is not an object" with its own code. It used to report
  `INVALID_FIELD_VALUE` where every other entry point reports `RAW_OR_UNKNOWN_FIELD_FORBIDDEN`, so
  the same mistake had two names depending on which function the caller reached.
- `projectJobShop` now uses the same entry guard as every other entry point. It previously ran a bare
  key-allowlist check on the raw argument, justified by the one allowed key having to pass `isClock`.
  That held for the value but not for the surface: a hostile Proxy threw instead of holding, and a
  non-enumerable own key was invisible to `Object.keys`. The special case is removed rather than
  argued to be safe.
- Pinned `LEASE_RECORD_SCHEMA`, the one of the four job-shop schemas no test held, and asserted that
  a granted lease actually carries it.
- 운영 영향: 새 명령 표면은 없다. 기존 `validate:agent-observation`,
  `validate:codex-retention-automation`, `validate:team-ops-app`이 각각 새 module과 test를 그대로
  검증한다. result gate preparation은 파일을 읽지도 쓰지도 않고 라이브 registry를 건드리지 않으며
  gate를 활성화하지도 않는다. 준비된 registry를 어디에 쓸지는 이 함수의 결과가 아니라 별도의
  action-time Owner gate다.
- 관련 경로: `guild_hall/agent_observation/**`,
  `.workflow/codex_thread_manager_v0/codex_retention_automation_internal.mjs`,
  `ui-workspace/apps/team-ops-board/src/core/codex-retention-projection-internal.mjs`,
  `package.json`.

## 2026-08-22 - Agent Observation P0 usage-meter bridge and two guard regressions

- Fixed a guard regression the P0-S2 review found: an own **enumerable** `__proto__` key escaped all
  three scans. The snapshot copied properties with `copy[name] = value`, which for `__proto__`
  invokes the inherited setter instead of creating a data property and silently discards a primitive.
  The key was therefore gone before the key allowlist, the secret scan and the local-path scan ran,
  so `registerAgent` accepted a credential-carrying input and reported it as a clean PASS. The
  snapshot now writes every property with `Object.defineProperty`. The previous entry's claim that
  "a non-enumerable property cannot hide from the scans" was true; it did not cover this key, which
  is enumerable and hid anyway.
- Fixed a second regression from the same change: the snapshot walked an array from `0` to
  `length - 1`, and an array's `length` is a settable number decoupled from its elements. A list with
  `length = 4294967294` cost nothing to construct and turned a 1 ms refusal into an unbounded hang at
  every entry point that takes an array field. Both the array and object branches are now bounded by
  `MAX_SNAPSHOT_ITEMS` (4096) inside the snapshot, because the downstream list bounds only run once
  the snapshot has already returned. Over the bound is `INPUT_TOO_LARGE`.
- A revoked Proxy, or a trap that throws from `ownKeys`, `getOwnPropertyDescriptor` or
  `getPrototypeOf`, previously escaped as a `TypeError` from every entry point. That contradicted the
  documented "this entry point never throws". The snapshot now converts it to
  `HOSTILE_INPUT_REFUSED`.
- Added `guild_hall/agent_observation/snapshot_contract.test.mjs`. The property that every entry
  point builds its record from the validated snapshot was previously unproven: rewriting ten entry
  points to build from the raw argument left the whole suite green, and the `observeRun` variant
  demonstrably stored a credential the privacy audit then reported as clean. Each of the twelve entry
  points is now handed an input that lies on read, and the test asserts both that the lying trap
  never fires and that the stored value is the honest one.
- Added `guild_hall/agent_observation/usage_meter_bridge.mjs`. `guild_hall/ai_usage_meter` already
  defines `soulforge.ai_usage_event.v1` with an exact key set covering agent identity, run lineage,
  project binding, tokens, credits and privacy. Rather than let the observation module's own usage
  schema compete with it, the bridge projects one onto the other and validates the result with the
  meter's own `validateUsageEvent`, so the mapping cannot drift from a local restatement of the
  rules. It writes nothing and never reads the persisted meter state.
- The bridge invents no identity. The provider-side thread id is resolved through the agent
  crosswalk that `registerAgent` already maintains, and everything the observation model does not own
  arrives in an explicit binding where a missing field is a refusal rather than a default. A provider
  outside the meter's closed three-value `source.kind` enum holds instead of being coerced to the
  nearest member; Hermes is deliberately absent, because adding it migrates a validated schema with
  persisted state behind it.
- A `billed_cost` or `subscription_credit_observation` record is refused rather than projected. The
  observation record carries evidence refs for an observed charge but not its amount, so
  `rate_unknown` would discard the charge and `calculated` would require inventing a total.
- Corrected four documentation claims against the code: the snapshot covers the entry points that go
  through `guardEntry`, not the four read-only projections; the per-job completion invariant is
  carried by `jobs[].recorded_completions`, not the shop-wide `recorded_completion_count`; the
  "own enumerable property only" description of the guards predates the snapshot; and the mutants
  that survive on purpose are now listed rather than left implicit.
- Added `guild_hall/agent_observation/board_health_projection.mjs`. The Board projection already
  publishes `scope.result_gate_health` and `scope.binding_coverage` against closed value sets and
  nothing fed them from agent observation. This fills those two fields in the Board's own
  vocabulary rather than adding a third health signal beside them.
- That projection never reports `disabled`. The only two things that disable the result gate are the
  live registry's `disabled` flag and `TEAM_OPS_BOARD_RESULT_GATES_DISABLED` in whichever process
  runs the Board, and an in-memory store observes neither. `binding_coverage` additionally requires
  that a run's agent carry a provider identity for the provider the run actually used, because the
  store already refuses an unregistered agent and a project mismatch at write time and those two
  alone would make the measurement vacuously exact.
- Two projects that both omit a Context Capsule are no longer reported as sharing a duplicate
  `capsule_id`. Both yielded `undefined`, which is an absence rather than a collision, so the
  refusal named the wrong reason.
- 운영 영향: 새 명령 표면은 없다. 기존 `npm run validate:agent-observation` 하나가 새 module과
  두 test 파일까지 검증한다. bridge가 `guild_hall/ai_usage_meter/usage_meter.mjs`의
  `validateUsageEvent`를 순수 함수로 부르는 것이 이 owner의 유일한 외부 import이며 파일도 상태도
  건드리지 않는다. 실제 provider, ERP 세계수 write, Board enrollment write, result gate write,
  파일 쓰기, network는 여전히 모두 0이다. public deterministic candidate이며 이 module set을
  import하는 owner는 아직 없다.
- 관련 경로: `guild_hall/agent_observation/**`, `package.json`.

## 2026-08-22 - Agent Observation P0-S2 three-project job shop

- Added `guild_hall/agent_observation/p0s2_job_shop.mjs`: three different projects submit one
  spreadsheet job each against a single capacity-1 resource, prepared independently and dispatched
  by priority then FIFO.
- Added the Context Capsule contract. A capsule is the minimum project context an agent holds for one
  work unit: it must declare itself a non-authoritative cache with an expiry, must match both the
  project and the work unit it is bound for, and carries refs rather than source bodies. It does not
  replace the ERP world tree, which remains the sole authority for long-term project context.
- Submission order and dispatch order deliberately differ, so submission order alone does not
  explain the result. With one job per tier the dispatch is fully determined by strict priority;
  FIFO inside a tier is proven by the existing five-job job-shop test, not by this fixture. The
  lowest-priority job still runs once the finite batch drains; this is not a starvation-free
  claim, and the absence of aging remains documented.
- The first worker crashes: its lease reaches TTL with no completion, the job is reclaimed at a
  higher fencing epoch, the dead worker's completion is refused and counted, and a replay of the
  fresh completion is a no-op. Across crash, reclaim, replay and timeout no job records more than
  one completion; the timeout path records none for the job it never dispatches, so "exactly one"
  would overstate it.
- Per-project completion count and result ref are read back from the job ledger, so a granted lease
  is never reported as a completion, and the delivery-receipt lookup is scoped to that project's own
  craftsman run and agent. Two projects declaring the same delivery receipt id are refused.
- Every entry point snapshots its input first, validates the snapshot, and builds the record from
  that snapshot. The snapshot reads each own property exactly once through its descriptor, so a
  non-enumerable property cannot hide from the scans, a getter is refused without being invoked,
  and a Proxy `get` trap never fires. The capsule and Board row families this slice adds are
  audited by this module and folded into the reported `privacy`, since the observation store's own
  audit covers only its four record families.
- Cross-project isolation is measured over the stored records rather than asserted, and the
  measurement takes plain record arrays so it can be run against deliberately inconsistent input
  and shown to detect it. The value reported on this path is structurally always zero, because the
  upstream guards refuse every inconsistency before it can be stored; the measurement exists for a
  future producer that bypasses them.
- 운영 영향: 새 명령 표면은 없다. 기존 `npm run validate:agent-observation` 하나가 그대로 이
  module까지 검증한다. 전부 pure in-memory이며 실제 Excel 앱, external provider, project payload,
  ERP 세계수 write, Board enrollment write, result gate write, 파일 쓰기, network는 모두 0이다.
  이번 수락도 public deterministic candidate이며 이 module set을 import하는 owner는 아직 없다.
- 관련 경로: `guild_hall/agent_observation/**`, `package.json`.

## 2026-08-22 - Agent Observation P0-S1 smallest vertical

- Added the new `guild_hall/agent_observation/` owner with provider-neutral Agent Registry,
  Run Observation, direct Usage Ledger, Result/Delivery Receipt, and a Tool Job Shop
  (host/resource registry, three-tier priority queue with FIFO inside a tier, lease with
  fencing epoch, capacity).
- Provider-native identities live in a `(provider, id_kind, id_value)` crosswalk, so Codex
  thread/session, Hermes session/delegation/subagent, and Claude/AGY identifiers never
  overwrite one another. Unknown identity, parent, or project stays `HOLD` and is never
  inferred from title, cwd, prefix, similarity, or age.
- Child direct usage is never merged into a manager's direct usage; `self`, `child_direct`,
  and `subtree` totals are computed in a projection over the untouched event ledger.
  An identical replay is `NO_OP`, a divergent payload under the same ID is a conflict `HOLD`, and
  the same measurement re-emitted under a fresh correlation ID is a `USAGE_CONTENT_DUPLICATE`
  `HOLD` rather than a doubled total — including when it comes back under a different cost basis
  or with an added evidence ref, which are excluded from the natural key for that reason.
  A child run in a different project than its parent is refused, so another project's work cannot
  enter this parent's subtree total.
- A structural topology edge cannot be recorded as a delivery receipt. Lease TTL is enforced at
  completion time as well as at acquisition, so an expired lease cannot record a result even
  while the resource sits idle. That guarantees exactly one *recorded completion* per job and
  counts the fenced attempt — it is deliberately not a claim that the craftsman's side effect ran
  only once, and `capacity` is likewise a logical rather than a physical bound. Physical
  exactly-once needs a craftsman-side idempotency contract, which is out of this slice.
- Host and resource health are both monotonic observations that carry their own clock — resource
  registration is itself the first health observation — so a stale or same-instant collector
  report cannot flip an unhealthy resource back to `ok` and re-open dispatch. A clock-aware projection returns a reclaimable job to `queue_depth` rather than
  reporting an idle shop with outstanding work.
- Observation-store records are deeply frozen and the ledger maps are unreachable from the store
  handle, so stored authority scope, provider identities, and delivery evidence cannot be widened
  after the write and evidence cannot be cleared. Strict key allowlist, secret scan, and local
  absolute-path scan run at every write entry point of every module from one shared guard module,
  with a scan depth bound so a deeply nested value fails closed instead of exhausting the stack.
  An input must be a plain own-property object, so a payload carried on a prototype cannot skip the
  scans, and a sparse list is refused rather than storing an undefined element.
  Any JSON-representable malformed input returns a structured HOLD rather than throwing; a
  hand-built object with a throwing accessor property is outside that claim. An unknown key name is
  never echoed back into a hold detail, since key names are producer-controlled and a credential
  can be shaped like a valid identifier.
- A cost basis that asserts real money or credit (`billed_cost`,
  `subscription_credit_observation`) is refused without its own evidence refs.
- 운영 영향: 새 명령 표면은 `npm run validate:agent-observation` 하나뿐이다. 모든 module은
  pure in-memory이며 파일·network·child process·ERP 세계수·Board enrollment·result gate에
  쓰지 않는다. 실제 Excel 앱, external provider, project payload는 사용하지 않고
  public-safe synthetic fixture만 사용한다. `declared_effect_boundary`의 0들은 선언이며,
  실제 근거는 module source scan과 network global을 counter로 바꾼 runtime probe다.
  strict priority에는 aging이 없어 긴급 job이 계속 들어오면 일반 job이 대기하며, 이 trade-off는
  테스트로 고정했다. 이번 수락은 public deterministic candidate이고 아직 이 module set을
  import하는 owner는 없다. actual project, live runtime, 운영 승격 수락이 아니다.
- 관련 경로: `guild_hall/agent_observation/**`, `guild_hall/README.md`, `package.json`.
- 기록 주의: 이 changelog 항목의 최초 본문은 동시에 진행되던 다른 세션의 `git commit`이
  넓게 stage하면서 `refactor(skills): rename finish-work candidate` 커밋에 함께 들어갔다.
  코드와 명령 표면은 이 항목 뒤의 별도 커밋에서 도착한다.

## 2026-08-22 - 끝까지 만들기 candidate skill

- Added the tool-neutral `finish_work` canon candidate and the installed-mirror-ready
  `$soulforge-finish-work` (`끝까지 만들기`) Codex bridge for substantial staged work.
- The skill freezes contracts before fan-out, keeps leaves bounded, requires repository-owned
  validators and parent re-verification, treats blocked or owner-gated work as non-success, and
  re-measures final numeric claims.
- The package intentionally contains no upstream Unlazy install, dynamic shell checker, Stop hook,
  external command parser, or second final-review workflow. Final acceptance remains owned by
  `post_development_review_gate_v0`.

## 2026-08-22 - Hourly intake task v0.4.1 project-context fail-closed update

- Updated the existing `업무 인입 감시` reservation in place; its identity, hourly cadence, and
  active monitoring state remain unchanged. No duplicate reservation was created.
- Because Scheduled results open in a general chat, the task now carries a self-contained snapshot
  of the `소나테크(주) 개발1팀 관리` project instructions instead of assuming project-memory or
  project-file inheritance.
- Added `project_scope`, an exact project-instruction revision, explicit `DO_NOT_ASSUME` memory
  posture, and a fail-closed `HOLD_PROJECT_CONTEXT` gate. Missing, stale, conflicting, or unclear
  required project context forces every external effect to zero.
- Versioned the new execution origin, receipt tag, and output marker as `V041` while retaining both
  `V040` and `V041` as application-echo inputs so the upgrade cannot re-ingest the prior Bot cycle.
- Reopened the saved task and verified the exact v0.4.1 prompt, hourly cadence, and active state.
  The first v0.4.1 Cycle Receipt and provider/app readback remain pending; Gmail send remains
  forbidden and must continue to report `gmail_sent=0`.

## 2026-08-22 - Voice-First Fable revalidation repairs and first scheduled receipt

- Fable 5 independently returned `REVISE` at `main@489e3812`: the Engineering Engine manifest was
  stale, a retrograde LB1 revocation counter could bypass `COUNTER_MISMATCH`, and Accepted Context
  Query did not fence hostile manifest/receipt substitution to the requested generation.
- Added RED-to-GREEN regressions for both code defects and regenerated the Engineering Engine
  manifest and topology with the canonical emitters. Focused results are LB1 51/51, Backup
  Controller 136/136, acceptance/query 31/31 plus P5 candidate 12/12, and manifest/topology
  verification PASS.
- Added root aliases for the existing dev-ERP Shadow validator and Windows launcher regression.
  The Shadow alias delegates to the app-owned 53/53 script; the launcher alias syntax-checks and
  runs the 13/13 temporary synthetic fixture without restarting the live dev-ERP runtime or binding
  a production port.
- Observed the first v0.4.0 Scheduled detail receipt (`hourly-v040-20260822T0605KST`): the Bot
  reported five Linear effects, zero effects in the other apps, `gmail_sent=0`, and zero
  failure/hold/deferred counts. These remain Bot-reported until provider/app readback is
  independently reconciled.
- Confirmed that `채팅 열기` routes the Scheduled result to a general `/c/...` chat rather than a
  project path. Project memory/instruction inheritance is therefore not assumed; the existing task
  requires a self-contained project-instruction fail-closed gate before the next accepted run.
- Repository-wide `done:check` remains RED at the unchanged 51-item path-policy baseline, and the
  separately observed pre-existing `context_life_tree` failure remains outside this repair. None of
  the current changed files contributes a path-policy violation.

## 2026-08-22 - VF-8 bounded mutation canary gate foundation

- Revision `working`.
- Added a synthetic-only canary gate for one exact
  `Project × TaskType × Action × Authority × PolicyRevision` tuple. The gate requires externally
  trusted Owner-approval and C5 pins, a mandatory injected clock, a sole writer/coordinator basis,
  CAS/fencing, exact absent pre-state and tuple-bound digest readback, and a per-window tuple claim.
- Success and terminal failure both consume and replay one claim. Compensation is non-destructive:
  the created synthetic object transitions idempotently to `voided` or `superseded`; delete/archive
  is forbidden and no pre-state restoration claim is made.
- Validation: canary 17/17, Task Core 28/28, Shadow 53/53, Accepted Context 30/30 + P5 12/12,
  fresh exact Opus 5 review `ACCEPT`.
- Claim ceiling is synthetic trusted-pin consistency only. `actual_canary_readiness=false`; no live
  Linear/Gmail/Slack/Calendar/Drive mutation, owner authority, official completion, or C6 activation
  is created by this foundation.

## 2026-08-22 - VF-6/VF-7 Hermes trial and worker-comparison foundations

- Revision `working`.
- Added a pure Hermes proposal-runtime trial gate that requires immutable version, host, and
  isolation digests; one-seat/account/project mapping; closed read/query/candidate tool policy;
  delivery idempotency; memory/transcript/attachment custody; rollback; and a bounded time window.
  It neither installs Hermes nor invokes an adapter, scheduler, credential, or MCP tool.
- Added a pure three-worker comparison receipt for one exact Work Unit across Codex, Gemini Flash,
  and Grok Build. Every run binds the same input/constraint/completion/validator/policy and harness
  basis, run-specific validator and independent-review evidence, causal timestamps, complete
  measurements, zero declared effects, and correction evidence. Any metric tie yields `NO_SELECTION`.
- Validation: Hermes 10/10, worker comparison 14/14, canonical evidence 2/2, Task Core 28/28,
  Shadow 53/53, fresh exact Opus 5 review `ACCEPT`.
- Actual Hermes/Grok installation or provider runs, credentials, scheduling, selection authority,
  transferable ranking, and auto-deploy remain `0/HOLD`.

## 2026-08-22 - VF-5 accepted-generation and query foundation

- Revision `working`.
- Extended the authentic P5 candidate with a canonical digest over the exact public-safe content
  a reviewer accepts, including explicit membership scope/review/supersession metadata and
  recomputable exported membership/source-set digests.
- Added a public-synthetic registered-human acceptance gate and in-memory append-only generation
  store with exact submission replay, writer-epoch/current-pointer CAS, coverage and reviewed-set
  binding, duplicate-generation prevention, immutable manifest/receipt verification, and truthful
  synthetic execution evidence (`writer_called=false`, actual generation advance false).
- Added a mandatory-ACL, generation-pinned read-only Accepted Context Query. Unauthorized, revoked,
  foreign, absent, wrong-generation, and stale-generation cases use one uniform `NOT_AVAILABLE`
  envelope; project/common fallback and store/Task/ERP mutation are absent.
- Validation: acceptance/query 30/30, P5 candidate 12/12, project-history readiness 34/34, Task
  Core 28/28, fresh exact Opus 5 review `ACCEPT`.
- Actual registered-human acceptance, HPP fenced writer/private persistence, accepted generation,
  live query activation, ERP projection, and P6 effects remain `0/HOLD`.

## 2026-08-22 - VF-4/C2 Linear LB1 runtime adapter and effect-evidence foundation

- Revision `working`.
- Added capability-allowlisted, synthetic-only Linear reader, create-only storage, and durable
  atomic claim adapters with immutable scope/target/authority, injected clock, closed client return
  validation, and distinct adapter-invocation versus client-call counters.
- Upgraded the one-shot runner result contract to v3. It no longer hard-codes external effects to
  zero: missing evidence is `UNKNOWN`, malformed/counter-mismatched evidence is `HOLD`, and zero is
  emitted only from exact synthetic-only attestation reconciled with runner counters.
- Validation: runtime adapters 22/22, LB1 v2/runner 50/50, Backup Controller 135/135, fresh exact
  Opus 5 adapter and runner reviews `ACCEPT`.
- Actual Linear/Drive clients, credentials, provider calls, first one-shot, human restore acceptance,
  and the post-one-shot 24-hour scheduler/heartbeat/topology lane remain `0/HOLD`.

## 2026-08-22 - Owner reports Hourly Multi-App Work Intake Bot v0.4.0 configuration

- Owner reported that the existing `업무 인입 감시` reservation keeps its ID, hourly cadence, and
  active state while enabling bounded Linear, Slack, Calendar, and Drive mutations plus Gmail
  read/label/Draft-only behavior.
- Gmail send/reply/forward remains forbidden with a required `gmail_sent=0` check. Each run is capped
  at five external changes; destructive lifecycle operations and automatic contract, cost, technical
  baseline, or external-commitment decisions remain forbidden.
- The repo/agent did not change or independently inspect this Scheduled Task. Exact prompt digest,
  first v0.4.0 Cycle Receipt, app-by-app readback, and prohibited-effect zero remain pending.

## 2026-08-21 - VF-2/VF-3 public-synthetic Shadow foundation

- Revision `working`.
- Added four pure dev-ERP modules for a pinned required-source/A0 hourly cycle contract,
  per-project in-memory append-only decision ledger, identical-horizon typed portfolio projection,
  and live-only shadow quality receipt generation.
- The contract closes packet/source/effect shapes, bounds graph and token sizes, rejects raw/secret
  field names, pins policy/schema/source manifest refs, and brands only deep-cloned validated cycles.
  The ledger adds project-scoped cursor CAS, replay/NO_OP/supersession, and chained record digests.
- Added `validate:voice-first-shadow`; the final focused suite is 53/53 and adjacent Task Execution
  Core remains 28/28. Fresh exact Opus 5 review required four revision rounds and ended `ACCEPT`.
- This is public-synthetic/in-memory foundation only: no Chat Scheduled Task read/edit, no private
  ledger writer, no accepted-context query, no live precision/recall claim, and no external effect.
- Related paths: `ui-workspace/apps/dev-erp/src/hourly_shadow_cycle_contract.mjs`,
  `project_decision_ledger.mjs`, `portfolio_decision_projection.mjs`, `shadow_evaluator.mjs`,
  `test/voice_first_shadow.test.mjs`, Roadmap, Voice-First model, and Task Engine master plan.

## 2026-08-21 - VF-1/C0 mutation defaults are OFF

- Revision `working`.
- Removed the two port-4300-derived defaults that implicitly set
  `DEV_ERP_AUTO_INTAKE=1` and `DEV_ERP_AUTOSYNC=1` in `start-windows.bat`.
  Explicit environment and `run-dev-erp-background.ps1` switch opt-ins remain available.
- Added a Windows synthetic launcher/restart fixture that proves 4300 and 4310 do not default
  either flag, independently preserves each 4300 opt-in, bounds child processes, and leaves no temp
  fixture behind. The pre-fix focused regression was RED (1/2); the integrated focused suite is
  2/2, the launcher suite is 13/13, and dev-ERP core is 290/290.
- Reversed the historical 2026-07-03 runtime-launcher default-ON posture in current operator docs
  and C0/VF-1 status rows. This change does not restart a live runtime, edit a Scheduled Task,
  activate an Official Task writer, or open `VF-2`/`C6` authority.
- Related paths: `ui-workspace/apps/dev-erp/start-windows.bat`,
  `ui-workspace/apps/dev-erp/test/run_dev_erp_background_launcher.test.mjs`,
  `ui-workspace/apps/dev-erp/test/core.test.mjs`, `ui-workspace/apps/dev-erp/docs/MAIL_TO_TASK_INTAKE.md`,
  `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`,
  `ui-workspace/apps/dev-erp/docs/SOULFORGE_VOICE_FIRST_BOT_AGENT_OPERATING_MODEL_V0_2.md`,
  `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`.

## 2026-08-21 - Watchtower self-heal deep diagnostic integration and failure classification

- Added pure, public-safe diagnostic classifier module `recovery_diagnostics.mjs` (`guild_hall/watchtower/recovery_diagnostics.mjs`) implementing `classifyRecoveryDiagnostic(sanitizedEvidence)` with exact input/output-key validation across four closed failure families (`scheduled_task_action_drift`, `usage_event_duplicate_conflict`, `standing_receipt_expired`, `auth_refresh`). This is pure classification only; runtime execution remains strictly with the existing recovery coordinator.
- Fixed Hiworks Scheduled Task registrar (`guild_hall/gateway/mail_send/ops/register-hiworks-gmail-forwarder-task.ps1`) to resolve runner and hidden launcher paths strictly from canonical git Owner root (`$OwnerRoot`) rather than worktree `$PSScriptRoot`. Added deterministic source test (`register_task_source.test.mjs`).
- Recovery runtime (`recovery_runtime.mjs`) diagnoses `task_action_path_drift` and returns `owner_action_required` when an owned task exists and is enabled but its actual action digest diverges from local binding state, never starting or rewriting drifted tasks.
- AI Usage Meter (`usage_meter.mjs`) isolates conflicting event identity groups into sanitized `usage_event_duplicate_conflict` / `usage_event_conflict` quarantine issues without picking conflict winners, persisting clean non-conflicting events and preserving existing canonical ledger bytes untouched. The producer companion validates the collect apply result schema and safe integer counts before advancing projection, holding the Codex lane in degraded error upon duplicate or canonical conflict or malformed result.
- Updated Watchtower CLI probe configurations (`cli.mjs`) so producer heartbeat liveness/freshness uses `completed_at` while preserving `last_success_at` as validated last-good evidence.
- Gmail connector (`gmail.py`) classifies OAuth errors to distinguish terminal classes (`auth_invalid_grant`, `auth_token_revoked`, `auth_consent_required`, `auth_mfa_required`, `auth_invalid_client`) from transient retryable classes (`auth_transient_retry`) without logging or leaking raw provider bodies or tokens.
- Team Ops Board recovery presentation (`topology-recovery-view.mjs` and `App.tsx`) renders closed Korean labels via safe bounded lookups and updates `진단` to perform GET-only fresh health + matching recovery snapshot row inspection (strictly requiring `ready` state and refusing stale recovery evidence) without POST, repair, or state mutation.

## 2026-08-21 - Freeze the Voice-First Bot/Agent operating model v0.2

- Added the Owner-confirmed Voice-First operating model that joins Thin Voice Context, Voice
  provenance, Project-scoped Manager/Agent reasoning, Portfolio typed projections, Project
  Decision Ledgers, and Linear as the sole current Official Task State Owner.
- Split judgment maturity (`JM0~JM6`, display alias C-level) from execution authority (`A0~A6`).
  The current hourly Chat Bot targets high judgment at A0, while each mutation opens only for one
  reviewed `Project × Task Type × Action × Authority × Policy Revision` canary.
- Made Meaningful/Skillable Work Unit the managed work granularity. Workers decompose atomic tool
  actions internally; repeated successful execution patterns may become Skill, Workflow, and Party
  candidates only through review rather than self-promotion.
- Recorded the VF-0~VF-8 implementation sequence and provisional roles for Hermes, Codex, Gemini
  Flash, Grok Build, and Claude/Fable. Buzz and Grok Bot remain HOLD.
- This plan finalization changed no Chat Scheduled Task, connected app permission, external account,
  Agent runtime, model subscription, provider, storage writer, Linear state, or C6 activation.

## 2026-08-21 - Soulforge Lifecycle Retention Phase 5: Apply+Verify Canary Gate

- **무엇이 바뀌었는가**: Implemented Phase 5 Apply+Verify Canary Gate for Soulforge Codex Lifecycle Retention with strict Owner approval binding, Phase 4 preservation receipt prerequisite, exact Git worktree clean removal adapter, detached restore probe in bounded temporary directory, and feature-OFF production baseline.
  - Added deep canary module `lifecycle_retention_canary.mjs` and internal implementation `lifecycle_retention_canary_internal.mjs` supporting exact approval receipt validation (`soulforge.codex_thread_manager.retention_canary_approval.v1`), single-use action packet generation (`soulforge.codex_thread_manager.retention_canary_packet.v1`), and verified canary receipt emission (`soulforge.codex_thread_manager.retention_canary_receipt.v1`).
  - Added Backup Controller retention canary gate in `guild_hall/backup_controller/retention_canary_gate.mjs` (`HELD_PRODUCTION_CANARY_GATE_ADAPTER`, `createSyntheticCanaryGateAdapter`).
  - Added exact Git worktree canary adapter in `.workflow/codex_thread_manager_v0/git_worktree_canary_adapter.mjs` (`HELD_PRODUCTION_GIT_CANARY_ADAPTER`, `createRealGitCanaryAdapter`, `createSyntheticGitCanaryAdapter`, `createSyntheticArchiveObserverAdapter`).
  - Implemented 4-stage canary pipeline: (1) Plan & bind single-use action packet, (2) Verify manager task archive observation (`archived`, `archive_verified: true`), (3) Remove exact clean registered Git worktree without `--force` or branch-delete flags, (4) Perform detached restore probe at target commit in OS temp dir (`sf_probe_canary_...`) to verify exact HEAD and clean state before unlinking, then emit verified receipt (`CANARY_VERIFIED`).
  - Added manager-safe CLI `lifecycle_retention_canary_cli.mjs` supporting `prepare` and `inspect` subcommands, strictly rejecting destructive option flags (`--apply`, `--delete`, `--remove`, `--prune`, `--force`, `--branch-delete`).
  - Addressed all 11 Phase 4 ACCEPT non-blocking prep notes across preservation and canary modules (immutable allowlists, snapshot-cycle handling, report digest verification, string type guards, production HOLD template naming, docs component mapping).
  - Added comprehensive test suites in `.workflow/codex_thread_manager_v0/tests/lifecycle_retention_canary.test.mjs` and `guild_hall/backup_controller/retention_canary_gate.test.mjs`.
  - Updated operations manual `CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md` and owner README `.workflow/codex_thread_manager_v0/README.md`.
  - Added npm script `validate:codex-retention-canary`.
- **운영 영향**: Production execution remains feature-OFF (`archive_count: 0`, `removal_count: 0`, `restore_probe_count: 0`, `zero_forbidden_actions: true`). Real canary execution is deferred to the Codex app manager. Zero actual worktrees removed or git operations performed in builder session.
- **관련 경로**: `.workflow/codex_thread_manager_v0/lifecycle_retention_canary.mjs`, `.workflow/codex_thread_manager_v0/lifecycle_retention_canary_internal.mjs`, `.workflow/codex_thread_manager_v0/git_worktree_canary_adapter.mjs`, `.workflow/codex_thread_manager_v0/lifecycle_retention_canary_cli.mjs`, `.workflow/codex_thread_manager_v0/tests/lifecycle_retention_canary.test.mjs`, `guild_hall/backup_controller/retention_canary_gate.mjs`, `guild_hall/backup_controller/retention_canary_gate.test.mjs`, `docs/architecture/guild_hall/CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md`, `.workflow/codex_thread_manager_v0/README.md`, `package.json`, `CHANGELOG.md`

## 2026-08-21 - Soulforge Lifecycle Retention Phase 4: Approve & Preserve module with synthetic restore-check gate

- **무엇이 바뀌었는가**: Implemented Phase 4 Approve & Preserve module for Soulforge Codex Lifecycle Retention with strict Owner approval binding, deterministic preservation manifest planning, synthetic restore-check gate, and feature-OFF production baseline.
  - Added deep preservation module `lifecycle_retention_preservation.mjs` and internal implementation `lifecycle_retention_preservation_internal.mjs` supporting exact approval receipt validation (`soulforge.codex_thread_manager.retention_approval_receipt.v1`), candidate/report digest binding (`sha256:...`), preservation manifest creation (`soulforge.codex_thread_manager.retention_preservation_manifest.v1`), and verified receipt generation (`soulforge.codex_thread_manager.retention_preservation_receipt.v1`).
  - Added Backup Controller retention preservation gate and synthetic adapters in `guild_hall/backup_controller/retention_preservation_gate.mjs` (`HELD_PRODUCTION_PRESERVATION_ADAPTER`, `createSyntheticPreservationWriterAdapter`, `createSyntheticPreservationReaderAdapter`).
  - Required synthetic restore-check sequence: preserved bytes/objects are read back through a separate adapter, digests and manifest identities are recomputed, and full exact match is verified before emitting a verified preservation receipt (`PRESERVED_VERIFIED`).
  - Strict fail-closed HOLD logic: missing bindings, dirty/untracked ambiguity, index locks, operation markers, locked worktrees, unpreserved unique commits, digest mismatches, expired approvals, future timestamp skews, adapter throws, partial writes, or restore-check failures return `status: "HOLD"`.
  - Added comprehensive test suites in `.workflow/codex_thread_manager_v0/tests/lifecycle_retention_preservation.test.mjs` and `guild_hall/backup_controller/retention_preservation_gate.test.mjs`.
  - Updated operations manual `CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md` and owner README `docs/architecture/guild_hall/README.md`.
  - Added npm script `validate:codex-retention-preservation`.
- **운영 영향**: Production execution remains feature-OFF (actual preservation count = 0, removal count = 0). Zero actual external/runtime writes or git branch operations performed in production. Phase 5 remains OFF. Removal, deletion, archive, prune, clean, reset, stash, and local_hold purge remain strictly forbidden (`removal_authorized: false`).
- **관련 경로**: `.workflow/codex_thread_manager_v0/lifecycle_retention_preservation.mjs`, `.workflow/codex_thread_manager_v0/lifecycle_retention_preservation_internal.mjs`, `.workflow/codex_thread_manager_v0/tests/lifecycle_retention_preservation.test.mjs`, `guild_hall/backup_controller/retention_preservation_gate.mjs`, `guild_hall/backup_controller/retention_preservation_gate.test.mjs`, `docs/architecture/guild_hall/CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md`, `docs/architecture/guild_hall/README.md`, `package.json`, `CHANGELOG.md`

## 2026-08-21 - Soulforge Lifecycle Retention Phase 3: One-shot report-only automation & read-only Team Ops Board

- **무엇이 바뀌었는가**: Implemented Phase 3 report-only automation and read-only Team Ops Board visibility for Soulforge Codex Lifecycle Retention with hardened write seam, strict catalog schema validation, and dedicated Watchtower health observation.
  - Added deep reporting module `codex_retention_automation.mjs` and CLI `codex_retention_automation_cli.mjs` combining real Phase 1 retention counts and Phase 2 feature manual inventory scans into a single sanitized envelope (`soulforge.codex_thread_manager.codex_retention_automation_report.v1`).
  - Hardened write seam using `open(..., "wx")` atomic create-only temp file and lstat/realpath symlink/reparse checks. Atomically writes report under approved activity root (`reports/codex_retention/current.json`), preserves existing report files on write failure, and appends sanitized Activity event. `--expected-digest` is validated before any write/event, exiting code 3 on mismatch.
  - Added Night Watch tracked spec `soulforge-lifecycle-retention-report.spec.json` (defaults to `PAUSED`, tracked but not installed/activated locally without explicit owner action) and prompt template `soulforge-lifecycle-retention-report.prompt.txt`. Generalized `render_local_automation.mjs` with strict allowlisted spec selector.
  - Added Team Ops Board read-only projection module (`codex-retention-projection.mjs`) with envelope digest recomputation, GET-only loopback Vite server adapter (`codex-retention-adapter.mjs`), and compact UI card in `App.tsx` (clears retention state to `null` on fetch error/non-OK).
  - Connected Watchtower dedicated topology node `codex_retention_report` and observation edges to federated topology (`federated_topology.v1.json`) with strict health-only observation.
  - Added operating manual `CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md`, updated owner READMEs, added npm script `validate:codex-retention-automation`.
- **운영 영향**: Report-only, zero destructive authority (destructive action count = 0, local automation install count = 0). Zero mutation endpoints, read-only GET-only loopback.
- **관련 경로**: `.workflow/codex_thread_manager_v0/codex_retention_automation.mjs`, `.workflow/codex_thread_manager_v0/codex_retention_automation_cli.mjs`, `.workflow/codex_thread_manager_v0/tests/codex_retention_automation.test.mjs`, `guild_hall/night_watch/automations/soulforge-lifecycle-retention-report.spec.json`, `guild_hall/night_watch/automations/soulforge-lifecycle-retention-report.prompt.txt`, `guild_hall/night_watch/render_local_automation.mjs`, `guild_hall/night_watch/render_local_automation.test.mjs`, `ui-workspace/apps/team-ops-board/src/core/codex-retention-projection.mjs`, `ui-workspace/apps/team-ops-board/src/core/codex-retention-projection.test.mjs`, `ui-workspace/apps/team-ops-board/src/server/codex-retention-adapter.mjs`, `ui-workspace/apps/team-ops-board/src/server/codex-retention-adapter.test.mjs`, `ui-workspace/apps/team-ops-board/vite.config.ts`, `ui-workspace/apps/team-ops-board/src/App.tsx`, `guild_hall/watchtower/topology.mjs`, `guild_hall/watchtower/topology/federated_topology.v1.json`, `guild_hall/watchtower/watchtower.test.mjs`, `docs/architecture/guild_hall/CODEX_LIFECYCLE_RETENTION_OPERATIONS_V0.md`, `package.json`, `CHANGELOG.md`
## 2026-08-21 - Owner selects progressive task-type automation after shadow evidence

- Recorded Grill Me decision `HB-DEC-01`: the Chat hourly Bot continues to read and judge work
  across its connected scope, while actual mutations open one validated low-risk task type and
  capability at a time. Monthly management-meeting material collection remains an example first
  candidate rather than the Bot's permanent or exclusive scope.
- Rejected both shadow-only as the final destination and immediate broad automation. The exact
  first task type, source scope, app effects, prompt snapshot, ledger binding, and quality threshold
  remain explicit follow-up decisions; Linear mutation and C6 activation remain zero.
- This is a plan/decision synchronization only. It changes no Chat Scheduled Task, connected app,
  permission, external account, runtime, provider, storage, writer, or task state.
## 2026-08-21 - Soulforge Lifecycle Retention Phase 2: FeatureManualInventory deep module

- **Revision pending**
- **무엇이 바뀌었는가**: Added deep module `FeatureManualInventory` (`.workflow/codex_thread_manager_v0/feature_manual_inventory.mjs`) exposing a single, deterministic, metadata-only scan interface `scanFeatureManualInventory`. It compares feature rows against repository metadata surfaces (`DOCUMENT_OWNERSHIP`, root/owner `README.md`, `.workflow/index.yaml` / `.registry/index.yaml`, `package.json` scripts, `CHANGELOG.md`, `DEVELOPMENT_ROADMAP_V0.md`), producing portable repository-relative output pointers, gap codes, and a canonical SHA-256 report digest. Added comprehensive unit test suite (`.workflow/codex_thread_manager_v0/tests/feature_manual_inventory.test.mjs`).
- **운영 영향**: Report-only baseline; zero document mutation at runtime, zero scheduling, zero Night Watch/AX Board/Watchtower/Backup Controller/Activity/Task Engine integration, and zero destructive command surface. Preserved Phase 1 behavior and test suite.
- **관련 경로**: `.workflow/codex_thread_manager_v0/feature_manual_inventory.mjs`, `.workflow/codex_thread_manager_v0/tests/feature_manual_inventory.test.mjs`, `.workflow/codex_thread_manager_v0/README.md`, `CHANGELOG.md`

## 2026-08-21 - Watchtower internal receipt contract catalog, pre-cycle ingress diagnostic heartbeats, and read-only expiry projection

- Added a pure, public-safe Watchtower Internal Receipt Catalog (`guild_hall/watchtower/internal_receipt_catalog.mjs`) with exact 4-category classification (`same_authority_local_auto_renew`, `owner_revalidation_required`, `on_demand_ephemeral_excluded`, `external_auth_excluded`) covering the 14 audited time-bound schema contracts across Soulforge.
- Standing runtime-blocking receipts (ingress writer authority, PLAUD cutover, backup controller activation) are evaluated into sanitized health states (`current`, `warning`, `critical`, `expired`, `invalid`, `unknown`) with deterministic owner-specific pre-expiry windows and owner action guidance before outages.
- Fixed continuous ingress supervisor startup diagnostics so binding load and runnable assertion failures occurring before cycle 1 (such as `continuous_plaud_cutover_receipt_invalid`) emit `cycle_failed` and persist a sanitized failure heartbeat with the exact safe code to the heartbeat ledger for Watchtower.
- Locked PLAUD cutover receipt as `owner_revalidation_required`: expired cutover receipts are never auto-renewed from old bytes and require fresh source-owner observation or explicit Owner revalidation. Writer-authority conditional renewal remains strictly preserved.
- Added Team Ops Board read-only receipt expiry projection (`ui-workspace/apps/team-ops-board/src/server/receipt-expiry-adapter.mjs`) summarizing total, current, warning, critical, expired, unknown, and owner-action-required counts while preserving `read_only: true` and zero runtime/repair authority.
- Regenerated canonical Watchtower federated topology (`guild_hall/watchtower/topology/federated_topology.v1.json`) from tracked provider sources, synchronizing current Engineering Engine 34/153 source state and Knowledge source digest; no new topology declaration, provider, or authority was introduced.


## 2026-08-21 - Plan Chat's hourly shadow lane separately from Soulforge's durable control plane

- Recorded the Owner-observed Chat Scheduled Task as an existing shadow experiment while keeping
  its exact prompt, model, app permissions, run history, and external effects unverified by the
  repository. This does not promote Chat task memory into a durable Decision Ledger or accepted
  project context.
- Added B0-B5 gates that measure retrieval coverage, reasoning quality, and external effects
  separately. The plan now includes order/noise/missing-source/contradiction/injection fixtures,
  human verdict and later-outcome evaluation, Accepted Context A/B, and capability-scoped
  Slack/Calendar/Drive canaries while Gmail send and Linear mutation remain zero.
- Added owner-local deep Module proposals for the Hourly Shadow Cycle Contract, Decision Ledger,
  Shadow Evaluator, and Accepted Context Query, plus a Flash-ready/owner-decision register.
  This is plan-only: no Scheduled Task, app permission, external account, runtime, writer,
  provider, storage, or C6 route was changed or activated.

## 2026-08-21 - Owner completion map separates code, evidence, shadow, and activation

- Updated the authoritative Roadmap and Task Engine master plan with one owner-facing
  `C0~C6` dependency map. It distinguishes integrated feature-OFF foundations from
  actual P4/Linear evidence, accepted P5 context, proposal-only shadow operation, and
  the later separately approved bounded mutation canary.
- Defined three finish lines instead of one ambiguous “done”: the current actual
  knowledge/backup/context evidence loop, the safe proposal shadow pilot, and the
  first bounded mutation canary. Conditional engineering estimates are recorded as
  1–2 parallel work weeks, then 2–4 weeks, then 2–4 weeks respectively; external
  approval, credentials, storage authority, and review waits are explicitly excluded.
- This is a plan-only truth synchronization. It enables no runtime, provider, storage,
  scheduler, Task, AgentRun, RAG/Wiki writer, or mutation authority.

## 2026-08-21 - P4 gains a direct-path preparation gate without opening the PDF

- Added a read-only P4 Preparation Module and shared authority-packet contract.
  One exact request authenticates the pinned launch, derives its source path,
  rejects root/ancestor/leaf/output reparse ambiguity, and emits canonical
  existing authority-packet-v0 bytes or a payload-free `HOLD`.
- The preparation path never opens the project PDF body, writes a file, creates
  an authority identity, or claims Owner approval/source truth. The existing
  runner keeps its one-attempt claim-before-admission behavior and blocker
  taxonomy while consuming the shared packet validators.
- Flash 3.7 High built the isolated candidate; fresh Opus 5 reviews found and
  closed weak launch validation, accessor rebinding, fail-open fsutil parsing,
  request aliases, shared-contract drift, and launch-read accounting. Focused
  preparation/contract tests pass 18/18; actual project execution remains HOLD.

## 2026-08-21 - Linear LB1 v2 proves a bounded stored-byte restore loop

- Added a separate v2 immutable snapshot/manifest/restore contract and a
  feature-OFF Bound Runner without changing v1. The v2 shape preserves bounded
  Description/Comment bodies and 18 reconstruction dimensions, including
  catalogs, histories, Waiting, Completion, Evidence, and cutoff completeness.
- The full-packet Gate v2 binds writer/epoch, claim store, synthetic Adapter
  identities, artifact layout, resource limits, and execution expiry. The
  Runner claims before read, creates one in-memory generation, verifies exact
  stored bytes and envelope identity, and returns only a body-free human-review
  candidate; every post-claim failure is terminal `HOLD_CONSUMED`.
- Flash 3.7 High built and corrected the isolated candidate; fresh Opus 5
  executable reviews closed adapter/pin drift, raw-error/token leakage, async
  escape, mutable-request, clock, resource-limit, payload-restore, locale-sort,
  and substituted-envelope gaps. Focused v2 tests pass 44/44. Actual Linear,
  Drive, filesystem backup, webhook, scheduler, and human acceptance effects
  remain zero and HOLD.

## 2026-08-20 - Conditional Ingress writer-authority renewal removes routine Owner bottlenecks

- Added an atomic `renew` writer-authority transition that preserves the exact active mode, node, scope, and five lanes while advancing the fenced epoch and digest. It remains blocked by active continuous leases, CAS drift, and every existing path/identity guard.
- Added a strict ignored-local standing policy with exact binding digest, primary/fallback identities, 72-hour renewal threshold, bounded 30-day authority window, policy expiry, and Owner approval reference. Missing or disabled policy changes nothing.
- The continuous supervisor checks renewal before each payload cycle. A valid due policy renews once and continues; policy expiry, configuration drift, fallback mode, lease contention, or renewal failure stops before payload work and emits only a sanitized failure heartbeat for Watchtower.
- No credential, login, route, project authority, provider call, deletion, or external transport authority was added.

## 2026-08-20 - Watchtower recovery truth: deduplicated task starts, evidence causality verification, durable diagnostics, and safe group gating

Recovery cycle had previously treated a changed `last_run_at` or `running` state as verified repair, leading to false-positive verification when scheduled tasks failed with non-zero exit codes.

- **Strict post-verification & evidence causality**: Task invocation acceptance, running status, or changed timestamps alone are never verification. Verification requires causal fresh independent Watchtower probe evidence newer than the attempt start (within a 5000ms clock tolerance) alongside a zero task exit code (`last_task_result === 0`). When a task is currently executing in background, prior nonzero exit codes do not fail verification; the node is recorded as `not_verified` pending fresh producer evidence.
- **Deterministic pending lifecycle resolution**: In subsequent cycles, pending `not_verified` nodes resolve cleanly: fresh post-attempt evidence resolves to `verified_repair` with zero restarts; completed failed tasks resolve to `postverify_failed`; still-running tasks remain pending without restarts.
- **Shared task group diagnostic propagation**: A non-auto-repairable diagnostic reason (such as `writer_authority_expired`, credentials, tokens, passwords, and permissions) on ANY bound node in a shared task group gates the entire group as `owner_action_required`, surfacing all bound nodes (including degraded primaries) in recovery receipts with the explicit `diagnostic_code` and zero task starts.
- **Continuous ingress supervisor failure heartbeats**: Persists sanitized failure heartbeats on `cycle_failed` (`status: "failed"`, `error_codes`, `mail_status: null`).
- **Wire & supervision contract bump (Supervision v2, Cycle v3, History v2, Projection v3)**: Bumped recovery supervision state schema to `soulforge.watchtower.recovery_supervision.v2`, recovery cycle schema to `soulforge.watchtower.recovery_cycle.v3`, history schema to `soulforge.watchtower.recovery_history.v2` (persisting `diagnostic_code`), and projection schema to `soulforge.team_ops_board.topology_recovery_projection.v3`. For deployment compatibility, the local companion transparently migrates valid legacy v1 supervision and history records on read without row loss while clearing untrustworthy legacy `last_verified_repair_at` timestamps, writing exact v2 on subsequent persist, while the Board adapter strictly rejects legacy wire schemas. Contradictory outcome/attempt/verification rows fail closed.
- **Board UI truth & Korean diagnostic labels**: Fixed interaction handler in `App.tsx` to require exact `outcome_code === "verified_repair"` before rendering completed repair. Recovery view and supervision panel visibly render fixed Korean diagnostic labels for non-repairable codes (e.g. `writer_authority_expired` -> "작성자 권한 만료 · 수동 갱신 필요") without leaking raw output.

## 2026-08-20 - Linear LB1 now has an exact Owner start Gate

- Added a pure, feature-OFF LB1 Owner Gate Module in front of any future one-shot collector. Its
  single Interface binds the Owner decision, exact Linear workspace/read-only credential scope,
  Google Drive target and storage-write authority, retention/RPO, partial-failure policy, human
  restore acceptance, and the one-shot no-mutation/no-webhook/no-scheduler ceiling.
- The independently trusted second argument pins the complete gate packet. Any coherent packet
  change under the old pin remains `HOLD`; proxies, accessors, aliases, secret-shaped metadata,
  write-capable credentials, overwrite, tabular-only restore, and scheduler activation fail closed.
- The proposed entire-workspace / `Soulforge Linear Backup` / daily 30 / monthly 12 / 24-hour RPO
  policy now produces an explicit pending `HOLD` until Owner approval and exact Linear, Drive,
  storage-authority, and human-review refs are bound. No Linear or Drive access occurs in this slice.
- Validation passed the focused gate suite 8/8 and full backup-controller 63/63. Actual LB1
  collection, storage write, restore, webhook, scheduler, Linear mutation, Task/AgentRun, and P5
  effects remain zero and `HOLD`.

## 2026-08-20 - P5 can assemble authentic producer outputs into a pinned review candidate

- Added a pure, public-synthetic Project Context generation Module whose deep Interface accepts
  authentic P4 knowledge, M2-2 assessment, and native timeline outputs plus one explicit Owner
  context contract. Missing crosswalk, bitemporal, coverage, provenance, review, writer-epoch,
  or lineage material remains `HOLD`; the Module never accepts or advances a generation.
- Moved the trusted whole-request pin outside the request payload. The second argument binds the
  complete snapshotted exact-root request, including producer receipts and every lineage field, so
  coherent request-side re-pinning cannot manufacture `ready_for_registered_human_review`.
- Gap revisions, supersession cycles/forks/active predecessors/time inversions, foreign or opaque
  crosswalk swaps, proxies/getters/aliases, and secret-shaped identifiers fail closed. Authority is
  false and filesystem, model, network, writer, ERP, and Task effects remain zero.
- Main integration passed the focused P5 suite 10/10, P4 projection 13/13, M2-2 42 pass with one
  platform skip, and timeline 24/24. Actual P5 human acceptance, HPP writer execution, generation
  advance, ERP projection, and P6 release remain `HOLD`.

## 2026-08-20 - A bounded P4 runner consumes one authority before opening one project PDF

- Added a feature-OFF runner and stderr-only CLI around the admitted-PDF knowledge projection.
  A raw-byte-pinned authority packet binds the exact launch, project/document refs, trusted source
  receipt, direct empty output root, and the only two allowed output filenames.
- The runner create-only writes, fsyncs, and reads back a body-free nonterminal attempt claim before
  admission. An admission `HOLD`, crash, or partial publish therefore consumes that packet/root and
  cannot reopen the document on replay; cleanup, overwrite, fallback, and retry remain forbidden.
- One successful call performs exactly one admission and one projection, persists one body-free
  candidate beside the claim, and never persists source text, query, excerpt, local path, or private
  refs. Network, model, retrieval, Engine, ERP, TaskDriver, and accepted-context effects remain zero.
- Fresh Level-2 re-review accepted the correction. Main integration passed runner 13/13,
  admission 17/17, and knowledge projection 13/13. No actual KVDS attempt or P5 acceptance is
  claimed by this public integration.

## 2026-08-20 - The Engine release manifest now binds the exact Git-index source set

- Extended the Engineering Engine release surface to include `mcp`, `stage_rules`, `observation`,
  and `guidance`, and replaced directory walking with a NUL-safe `git ls-files --cached -z`
  allowlist. Untracked/transient files, tracked omissions, malformed lists, duplicate manifest rows,
  unsafe paths, and payload-bearing failure notes now fail closed.
- Added truthful generation-base provenance: `generated_from_commit` names the commit used to
  generate the release while `git_commit` remains a validated compatibility alias. MCP status and
  rules-version consumers preserve both fields without claiming self-binding to the containing commit.
- Integrated independent negative controls and regenerated the 184-row manifest/release artifacts.
  Main integration validation passed manifest 28/28, MCP 135/135, stage rules 53/53,
  observation 67/67, and guidance 55/55. MCP registration, runtime activation, and write authority
  remain unchanged and OFF.

## 2026-08-20 - One admitted project PDF can produce a trusted RAG and Thin Wiki candidate

- Added a feature-OFF, model-free knowledge projection Module with two bounded operations: build
  sibling metadata-only project RAG/Thin Wiki candidates from one already-admitted PDF revision,
  and retrieve citation-bound evidence from that exact candidate.
- Retrieval now requires independent trusted candidate and source-receipt digests; source receipts
  bind upstream admission commitments. Descriptor-only snapshots reject proxies, getters, aliases,
  TOCTOU inputs, and self-consistent recomputed citation forgeries before search.
- P5 output remains `candidate_not_accepted` and explicitly carries bitemporal, coverage/gap,
  unresolved-supersession, reviewer, and writer-epoch gaps. Filesystem, network, model, project-write,
  Engine, ERP, TaskDriver, and AgentRun effects remain zero.
- Added the focused validator to the canonical RAG command. Main integration validation passed the
  new 13/13 suite, project root/view isolation 21/21, and the existing ingest/launch/admission/tracer/
  requirement-index suites. Actual project persistence and P5 acceptance remain HOLD.

## 2026-08-20 - Linear LB1 gets an offline restore-checked backup contract

- Added a public-synthetic, feature-OFF Linear-like backup candidate under `backup_controller`.
  It normalizes issue/project/assignee/status/time/relation/description/comment/history and structured
  Waiting/Completion/Evidence metadata into immutable revisions and deterministic coverage manifests.
- Duplicate versus conflict replay, partial/failed coverage, tabular-only incompleteness, forged
  coverage, reordered input collections, and corrupt duplicate run registries are fail-closed.
  Restore checks re-derive coverage from the revision instead of trusting a self-hashed manifest.
- The Module depends only on `node:crypto` and exposes no provider, filesystem, network, storage,
  scheduler, Task, AgentRun, or P5 execution surface. Main integration validation passed LB1 11/11
  and the full backup-controller 55/55, including hostile error-code, deterministic revision-ID,
  and status-consistency controls. Actual Linear/Drive/NAS LB1 remains behind its exact Owner Gate.

## 2026-08-20 - A feature-OFF Task Execution Core proves one safe Official Task execution loop

- Added a public-synthetic dev-ERP Module with three Interfaces: provider-event ingest,
  one-Task dispatch, and execution readback. It treats Linear as the current Official Task
  state owner, is wired only to a memory-only POC EventStore and MockExecutor fixtures, and
  has no route to Linear, `core_item`, existing `event_log`, MCP, scheduler, mail, Slack,
  files, or sharing permissions.
- Modeled TaskRef, ProjectRef, WorkBriefRevisionRef, SourceRef, EvidenceRef, TaskEvent,
  AgentRun, ExecutionReceipt, and WaitingInfo. Candidate refs are refused before provider read;
  Official execution requires exact Todo, a complete Work Brief, assigned Executor, passed
  authority gate, and no active run.
- Added an isolated `node:sqlite` EventStore: provider and AgentRun events plus receipts are
  append-only; current AgentRun is a projection; claim and state events use `BEGIN IMMEDIATE`;
  task-active-run, provider-event, dispatch, and execution identities are unique.
- The POC EventStore now refuses every filename except `:memory:`. Receipt `external_effects=0`
  describes the supplied MockExecutor contract and is not a technical sandbox proof for an
  arbitrary future Executor.
- Added deterministic success, Waiting, duplicate claim, crash/recovery HOLD, provider event
  dedupe/conflict, Candidate, eligibility, terminal replay, run-history, failed/cancelled,
  domain-binding, and cross-Task idempotency tests. `AgentRun succeeded` remains distinct from
  Official Task Done.
- Added the source-priority implementation plan, architecture, five owner decisions, and a
  no-automation Linear backup scope review separating CSV/Sheets snapshots from API comments,
  status history, webhook events, reconciliation, Waiting, completion, and Evidence data.
- This is not P5~P8 acceptance, operational Dispatcher/AgentRun activation, live Linear backup,
  TaskDriver migration, or production readiness.
- Clarified the two independent follow-up lanes. A one-shot read-only Linear backup pilot may run
  before P5 only after the Task Engine master plan's single exact `LB1` start Gate; it does not
  unlock Context, TaskIntent, TaskDriver, AgentRun, or a Linear writer.
  This entry changes plan state only: collector, credential binding, Drive writer, webhook, scheduler,
  live Task provider, and Linear mutation remain `0`.

## 2026-08-19 - The intake round trip closes: the file door can stand on a NAS share, and registration crosses roots

A file uploaded through a link landed on the share and the engine could not reach it, because a
profile's door folders had to sit in the project tree. Three changes close that
(manual `12_mcp_door.md` §12.B/§12.C).

- **A fourth root, `nas_root`.** A profile may declare one absolute share — a UNC path in the
  `\\server\share` form specifically, or a mapped absolute path — and it moves **only** the door's
  three folders (`intake_dir`, `outbox_dir`, `trash_dir`). Observations, receipts, runs and
  `confidential_dirs` do not move. A drive letter cannot be a root: it is a per-login mapping and an
  unattended door that resolves through one breaks when nobody is signed in. Refused: a share on the
  metadata plane, a door folder outside the stated share, the share root itself as a door folder, a
  door folder that resolves back inside the project tree, and a `nas_root` on a profile with no door.
  The path budget is still measured, from the share root instead of the repo root.
- **`file_register` crosses roots by copying, verifying and consuming.** Within one root it is still
  a move. Across roots there is no move to make, so the bytes are copied, both ends are hashed and
  compared, and only then is the source **moved into the share's own trash**
  (`_trash/consumed/<ticket>/`) — never deleted, so a wrong copy is recoverable, and never left in
  place, so nobody registers the same file twice. Receipts carry `transfer_kind: move | copy_verify`
  and both hashes. Download tickets copy into the share's outbox; the sweep takes share tickets to
  the share's trash. A ticket row now records `folder_root`, so rows written before the share still
  resolve against the project.
- **Three Owner-reviewable defaults, recorded in §12.C.** (a) An upload link stays class ⓑ — it is a
  capability to one empty folder — while a **download link takes the class of the file it reaches**,
  so a link to a confidential artifact is ⓒ. (b) The live URL does not go into `_workmeta`: the
  ticket ledger keeps `link_kind`, `link_expires_at` and `dsm_link_id` and has no field for a URL at
  all (passing one is refused, not stripped), while the URL goes to the caller's answer and to one
  create-only `.soulforge_ticket.json` inside the ticket folder — where being able to read it means
  you could already open the folder it points at. It is filtered out of registration rather than
  requiring anybody to delete it. (c) No link password for now: the issuer can take one from an env
  key, but there is no second channel to deliver it on, and a password written beside the link is
  not a password.
- `npm run validate:se-mcp` — **135** (was 117).

## 2026-08-19 - A guide card's "왜" now says what the artifact is for, and its "어떻게" says with what

The first answer the guidance layer produced had citations but no reason. Its "왜" was three
template sentences — evidence grade, expected presence, verification status — and its "어떻게" was a
form name and a citation count. This change fills both from the canon and from the rule table's own
relations. Nothing here is written by a model, and no judgement moved.

- **A new spec field `purpose_ko` (≤ 200 characters) with its own `purpose_refs` locators**, on the
  rule rows of `SE_FolderTree_Guide.md` (v0.12 → **v0.13**, 71 of 100 tokens, 110 rows) and
  `SE_FolderTree_GenericSE_Base.md` (v0.3 → **v0.4**, 79 of 115 tokens, 171 rows). Six readers in
  parallel extracted, from their own canonical text only, the sentence in which that text says what
  the artifact is for; a token is left empty where the canon only lists it. An independent critic
  re-read a stratified sample of ten citations: 10/10 confirmed, no locator corrections. Method,
  per-token locator table, coverage and open questions:
  `.registry/skills/se_foldertree_generate/codex/references/artifact_purpose_derivation_v0.md`.
- **The compiler validates the two new keys and reads neither.** A purpose changes no judgement, so
  the rows carry it through to the compiled variant and nothing else in the compiler sees it. A
  stated purpose without a locator is refused.
- **`guide_cards.mjs` computes two more reasons.** `used_by` — which rows at the same or a later
  gate name this artifact as an input — renders as "이것이 없으면 뒤의 X·Y가 막힌다", and `gate_role`
  says whether the row is what a review is meant to produce or what it needs to start. The three
  earlier sentences stay, now behind these.
- **"어떻게" gains four things**: each input's observed state as 있음 / 없음 / 불명 (nobody looked is
  불명 and never 없음); the form file the project actually holds, looked up read-only in a template
  library by token, spec-row name, or abbreviation; citations grouped by canonical family
  (규정 · 가이드북 · 실무지침서 · 일반SE), which the source catalogue names rather than the renderer;
  and the owner capability as before.
- **`template: 없음` is no longer read as a form called 없음.** Ten SRR rows and four CDR rows now
  honestly say 양식 없음.
- **The one-page answer splits its 왜 and 어떻게** into 목적 / 없으면 막히는 것 / 판정과 근거 and
  입력 / 양식 / 방법 근거 / 담당, because a single joined line gets read as boilerplate after its
  first clause.
- **The runner takes `--template-library-root` (or a prepared `--template-library`).** It scans the
  library read-only and emits library-relative references; a reference that is absolute or climbs
  out of the library is refused by the pure layer, so a private worksite's location never reaches an
  answer.
- Tests: `validate:se-guidance` 42 → **55**, `validate:se-stage-rules` 53. The "no invented text"
  test now checks that every slot value traces to a row field, a vocabulary label, a declared family
  label, a counted relation, or the library reference.
- Docs: manual §11.10 (how the two were filled, with the measured KVDS numbers), §11.2/§11.3/§11.5/
  §11.6/§11.8 updated, manual §3.10 (how the purpose sentences were derived), engine README, the
  manual reading-order table's 가이드 카드 row, and one line under the design's §5.

## 2026-08-19 - Team Ops Board explains Claude quota throttling and blocks premature Codex reset samples

- Claude official-quota HTTP 429 responses now become the sanitized
  `rate_limited` attempt class rather than the ambiguous `response_invalid`.
  The collector makes no provider request for 30 minutes after that signal and
  the Fleet card says `조회 제한 · 자동 재시도`; the last good percentages
  remain visibly stale and are never promoted to current.
- Codex quota display now rejects a premature next-window sample when the
  currently corroborated window has not reset yet. This prevents a transient
  `100% 남음` reading while preserving normal adoption after the real reset.
- Focused regressions cover 429 classification, no-I/O backoff, fixed safe
  attempt labels, current-window preference, and post-reset acceptance.


## 2026-08-19 - A Synology link issuer beside the engine door, so an outsider can upload without a folder path

The engine hands out a ticket — a folder and an expiry — and makes no network call. Turning that
folder into something a person with no account and no synchronised PC can open is now a gateway
part, tested entirely against canned DSM answers because no credential exists yet
(manual `12_mcp_door.md` §12.C).

- **New gateway part `guild_hall/gateway/nas_link_issuer/`** (no new npm dependency): a minimal DSM
  Web API client (`SYNO.API.Info` capability probe, `SYNO.API.Auth` login/logout, idempotent
  `SYNO.FileStation.CreateFolder`, `SYNO.FileStation.Sharing`, and the file-request API where the box
  exposes one), a pure `planLinkIssue` plus the `issueLink` that executes it, a canned-DSM transport,
  three synthetic fixtures, and the command `tools/nas_issue_link.mjs`. `npm run
  validate:nas-link-issuer` — 59 tests.
- **Three link kinds and a stated fallback.** Upload asks for an upload-only file request; where the
  DSM exposes none, or refuses the probe, it falls back to an editable link on the *empty* dedicated
  ticket folder and records **why** it fell back. A fallback link is tagged
  `sharing_edit_permission_unverified` rather than claiming an upload permission nobody observed.
  Download gets a view link with an expiry.
- **Secrets are structural, not procedural.** The password/token is boxed in a `Secret` whose
  `toString`, `toJSON` and node inspection all render `[redacted]`, so serialising the config into a
  log cannot leak it; every call is a form-body POST so nothing sensitive reaches a URL; an `http://`
  host is refused rather than upgraded; and `--password-from-env` takes a key **name**, never a value
  on a command line. Tests assert no environment value appears in any output or error string.
- **Door hook (thin).** A project profile may state
  `link_issuer: {kind:'synology', env_prefix:'SOULFORGE_NAS'}` — two fields, with nowhere to write a
  host or a credential. When it is present *and* the machine carries the keys, `file_ticket` spawns
  the command as a **child process** (the engine process still opens no socket) and attaches
  `link_url` / `link_kind` / `link_expires_at` to the ticket record and the result. Absent, or
  without keys, or on failure: today's behaviour — the folder, and a `link_note` saying which of the
  four reasons applies. A link failure never fails the ticket.
- **Where the link is written.** The ticket ledger keeps the URL, kind, expiry and DSM id; the
  operations receipt keeps only the kind, the expiry and the note. There is no field for a link
  password anywhere on the ticket shape. The link is class ⓑ, not ⓒ: the folder path is a piece of
  the project tree, while the link is a capability to one empty folder that says nothing about where
  it sits — redacting it would leave the roles allowed to open a ticket nothing to hand over.
- `npm run validate:se-mcp` — **117** (was 104).


## 2026-08-19 - Antigravity request replay retains stronger canonical metadata

- Antigravity conversation-DB events now replay the persisted canonical event when the same event ID is observed again with only a weaker `unassigned` organization and/or a base model ID replacing an already recorded `low`, `medium`, `high`, or `tiered` model variant.
- The rule is limited to exact `antigravity_conversation_db` events. After the two allowlisted fields are normalized, every other field must remain canonically identical; token, time, credit, source, attribution, privacy, and unrelated known-model differences still fail closed as `usage_event_conflict`.
- Focused regressions cover organization-only, model-tier-only, combined, reverse, unrelated, source-kind, token/time/source, and bounded multi-event replay cases. Existing canonical bytes are replayed without a duplicate event or revision.

## 2026-08-19 - Team Ops Board adds Antigravity unmeasured request activity overlay and exact quota family classification

Adds Antigravity request-count-only activity to both realtime Fleet usage cards and work-history Ledger usage trend charts with cumulative distribution.

- **V3 snapshot schema and validator extension (`unmeasured_request_daily`).** `soulforge.ai_usage_board_history_snapshot.v3` schema and runtime validator gain a backward-compatible 30-day fixed KST series `unmeasured_request_daily`. The series groups exact unmeasured Antigravity requests into two quota families (`AG·Gemini` and `AG·Claude+GPT`) with per-model drilldowns (`model_id`, `requests`).
- **Exact provider evidence gating and fail-closed family classification.** Producer gating checks `source.kind -> provider=antigravity` rather than inferring from model name alone. Within Antigravity events, exact identifiers are classified (`gemini*` -> `ag_gemini`, `claude*`/`gpt*`/`chatgpt*` -> `ag_claude_gpt`), while unknown model identifiers fail closed with fixed code `board_usage_history_antigravity_model_unknown` without silent fallback. Both Meter and Board modules maintain verified contract version `soulforge.ai_usage_unmeasured_family.v1` and parity.
- **Dual-axis usage trend chart & legend controls.** 30-day usage trend chart displays exact token areas on the left axis and Antigravity request overlays on the right axis (`yReq`), preserving token sums. Interactive legend provides toggle controls for request quota families with accessible `aria-pressed` states, keyboard navigation, and detailed model drilldown in tooltips.
- **Realtime Fleet cards & cumulative distribution.** Fleet usage cards separate Antigravity 7-day request rows from generic token-unknown turns using exact `unmeasured_request_daily` slice, showing quota family tags and distinct color dots/bars. Ledger distribution adds a dedicated cyan `AG 모델별 요청` column with explicit `(토큰 미측정)` labeling.

## 2026-08-19 - Task ids are append-only, and an overlay addition can say which folder it lives in

Two fixes found while getting a real project ready for file registration.

- **A reused task id.** `SE_FolderTree_Guide.md` had given 제조성숙도평가(MRA) the id 144, which in
  v0.7 belonged to `CDR_발표자료_F` — a row that later moved out of the spec into the project
  overlay. Project trees generated from v0.7 still have a `144_CDR_발표자료_F` folder on disk, and
  the file door resolves folders by number **and** name, so the reuse would have pointed
  registration at a folder that is something else. MRA moved to **148** (145-147 were taken, 148-150
  were free). 144 is retired: the spec's human section now carries a retired-id table saying where
  it went and that it must not be reused.
- **The rule itself is now written down**, in the spec's `principles` and in
  `references/variants.md`: a task id is never reused, even after its row leaves the spec, and a new
  row takes the lowest number that gate has never used. Generated folders outlive spec revisions,
  which is what makes id reuse a silent data error rather than a cosmetic one.
- **Overlay additions can now be placed.** An `add` op adds a rule the standard table does not
  carry, so nothing generated a folder for it and `file_register` had no way to place e.g.
  `prime_cdr_presentation_final`. The op gains two OPTIONAL fields, `task_id` and `folder_name`,
  which must be given together or not at all — a number with no name would reduce the door's
  "number and name agree" check to a bare number match, which is the check that stops a file
  landing in a folder an older revision generated. The compiler carries both into mapping rows
  (`folder_name` is null for spec rows, whose folder name is the row's own `name`), and the door
  accepts an overlay-added artifact on exactly the same terms as a spec row. An addition without
  them is still refused with `artifact_not_declared_at_this_stage`, which is the honest answer:
  the rules require it and nobody has said where it goes.
- `folder_name` may be written the way a person copies it off disk, prefix included
  (`144_CDR_발표자료_F`), or without the number; the redundant prefix is dropped before the names are
  compared and the number is checked on its own.
- Verification: `export_variant_json.py --check` PASS, `validate:se-stage-rules` 53/53 (one new
  case), `validate:se-mcp` 104/104 (two new cases), `validate:se-observation` 67/67,
  `validate:se-guidance` 42/42, `validate:canon`, `validate:path-length`, the local absolute path
  policy, and the engine manifest / topology / release manifest all PASS.

## 2026-08-19 - The engine door takes files in and gives them back: tickets, register-by-move, cleanup to the trash

등록 = 저장 (Owner decision 2026-08-19, engine manual §9.1D): a person should never open the project
folder. Until now the door could be told "this file is the HDD" but could not accept the file, and
the folder it named had to be reached by hand. This slice makes the hand-over itself a tool.
**The door is still off, still registered nowhere, and still makes no network call.**

- **A ticket is a folder, not a link.** `file_ticket` mints a ticket (주소표) and creates one folder
  under the project's intake root — `intake_dir/<principal>/<ticket_id>/` — create-only, owned by
  one person, expiring by the profile's policy. Issuing an actual OneDrive/SharePoint share link is
  outside the engine: the tool returns a machine target and an id, and today Owner/PM makes the link
  in the OneDrive UI (a gateway helper later).
- **Register is a move, and the rules choose where.** `file_register(ticket, artifact, stage)`
  verifies what is in the ticket folder (extension allow-list, sha256), then moves it into the task
  folder's `03_Out` — but only when the compiled variant declares exactly one task for that artifact
  at that stage **and** the folder carrying that task's number carries that task's name. A folder
  tree generated from an older rule revision can reuse a number for a different task, so a
  disagreement is a refusal (`task_folder_names_a_different_task`), never a guess. A missing task
  folder is refused too: the door does not create task folders.
- **The observation rule is the walk's rule.** The moved file goes through
  `buildArtifactObservationCandidates` with the same `auto_confirm_03_out` switch, so `03_Out` +
  one artifact per task folder + a cue in the file's own name is what makes it an observation
  (`registered_observations.jsonl`, read by the engine). Anything less waits in
  `registered_candidates.jsonl` for a person — D37 holds at the door as everywhere else.
- **Never overwrite, never delete.** A name already in `03_Out` is refused unless the caller states
  `allow_new_version`, and then the file lands as `name (v2).ext`. `file_tickets_gc` sweeps finished
  tickets — used or expired, past the grace period — into the profile's trash folder, reports by
  default (`dry_run: true`), and removes nothing.
- **Small files through the call, big files through a link.** `file_put` accepts one base64 file up
  to 25 MB with a caller-stated digest the tool re-checks; `file_get` hands one back. Bigger than a
  mail attachment (30 MB) is a link's job, and the door says so instead of growing.
- **Per-item class enforcement (9.1F 겹 3).** The file tools are open to every team role, but a file
  inside a folder the profile lists in `confidential_dirs` is refused for a caller without ⓒ, before
  anything is created (`SE_MCP_CLASS_EXCEEDED`). Paths, ticket folders and file names stay ⓒ fields;
  a team role sees only its own tickets; the sweep is Owner/PM only.
- **Five optional profile fields**, stated whole or not at all: `intake_dir`, `outbox_dir`,
  `trash_dir`, `ticket_policy` (+ `confidential_dirs`, which stands alone). All under the project
  root, all three door folders distinct, and none of them inside a confidential folder — a ticket
  folder inside the contract folder would hand an uploader the contract folder. A profile without
  them is valid and every file tool refuses with `ENGINE_MCP_FILE_DOOR_DISABLED`.
- **Three ledgers.** `receipts_dir/file_tickets.jsonl` (append-only ticket lifecycle),
  `receipts_dir/file_operations.jsonl` (who moved which digest where), and the registered
  observations on the project plane. The two on the metadata plane carry pointers, hashes and
  status — never payload.
- **Tests.** `npm run validate:se-mcp` 70 → **101** (ticket ledger 11, file door 16, profile +3,
  access +1), on synthetic fixtures only: a temporary repository root, a folder tree built from the
  public compiled-variant fixture, and one task folder deliberately staged under the wrong name so
  the refusal is exercised rather than described.

관련 경로: `guild_hall/engineering_engine/mcp/tickets.mjs`,
`guild_hall/engineering_engine/mcp/tools/file_*.mjs`,
`guild_hall/engineering_engine/mcp/{project_profile,engine_context,access_table}.mjs`,
`guild_hall/engineering_engine/observation/artifact_observation_candidates.mjs`,
`guild_hall/engineering_engine/manual/12_mcp_door.md` (§12.B),
`docs/architecture/workspace/examples/se_stage_rules/{project_profile,access_table}_synthetic_v0.json`,
`package.json`

## 2026-08-19 - Slack Archive Query MCP v0: safe read model and stdio MCP adapter

Chat and downstream query surfaces needed a way to query retained Slack history after Slack itself no longer exposes it. This slice builds the first safe v0 read model and stdio JSON-RPC MCP adapter in `guild_hall/slack_history`.

- **Pure read model over validated archive records.** `slack_archive_query.mjs` consumes validated Slack history archive records (binding, channel facts, revisions, coverage receipt) and builds deterministic in-memory lookup indices. It has zero mutating methods and never touches custody, collection, or disk writes.
- **Multiple distinct time dimensions preserved.** Slack original message time (`message_ts`), revision time (`revision_ts`), thread linkage (`thread_ts`), and collection/received time (`received_at`) remain separate, unconflated fields. Timeline chronological ordering is strictly determined by actual message time (`message_ts`), not backup arrival time.
- **Deterministic read-only query operations.** Implements 5 bounded operations: `slack_archive_status`, `slack_archive_search`, `slack_archive_thread`, `slack_archive_timeline`, and `slack_archive_attachment_metadata`. Every query result is strictly bounded (max limit 100/200) and sanitized via `assertSafeArchiveOutput`.
- **Zero leakage of raw paths, URLs, secrets, or bytes.** The output layer strictly forbids local filesystem paths, authenticated download locators/URLs (`files.slack.com`), bearer/secret tokens, and attachment byte payloads. Attachments return safe metadata descriptors (`file_id`, `pointer_ref`, `mime_type`, `size_bytes`, `content_sha256`) only. Ordinary public documentation URLs in text are allowed.
- **Partial archive posture & honest content boundary.** Status is `PUBLIC_SYNTHETIC_IMPLEMENTED / NOT_BOUND_TO_REAL_ARCHIVE / PARTIAL/HOLD`. Current live collector custody is metadata/digest-only without a custody→archive projector; live text search is unavailable until a separately reviewed projector and content-retention policy decision. Message text in this slice exists solely for synthetic fixture research.
- **Coverage fail-closed.** Accepted coverage state in v0 must be explicitly `partial` with non-empty `gap_codes`; any complete, missing, or malformed coverage state fails closed as unsupported or forgery.
- **Runtime binding envelope & exact scope check.** The Archive Query MCP uses a separate strict runtime binding envelope (`soulforge.slack_archive_mcp.binding.v0`) with bounded regular file reading and SHA-256 digest pinning. Exact scope is matched against the embedded canonical Slack binding (`soulforge.slack_history.binding.v1`) without leaking identifiers.
- **Local stdio JSON-RPC MCP adapter.** `slack_archive_mcp_adapter.mjs` and `slack_archive_mcp_server.mjs` provide a standard MCP interface over stdio JSON-RPC 2.0. Per-call durable receipts are not implemented; runtime activation remains `HOLD`.
- **Comprehensive synthetic tests.** `slack_archive_query.test.mjs` proves message time vs backup time ordering, separate time filters, edit/delete lineage, thread grouping, result bounds, coverage fail-closed, output safety rejection, attachment metadata boundaries, and MCP JSON-RPC protocol methods without live calls or private data.

운영 영향: 이 변경은 Slack 수집기 정책이나 live runtime을 변경하지 않으며, `conversations.replies` 또는 delete capture를 구현하지 않는다. 수집/custody와 MCP 쿼리 책임은 완전히 분리된다. 현재 live 수집 custody는 metadata/digest-only이며 live 텍스트 검색은 custody→archive projector 결정 전까지 미제공된다. MCP 준비도는 `PARTIAL/HOLD`다.

관련 경로: `guild_hall/slack_history/slack_archive_query.mjs`,
`guild_hall/slack_history/slack_archive_mcp_adapter.mjs`,
`guild_hall/slack_history/slack_archive_mcp_server.mjs`,
`guild_hall/slack_history/slack_archive_query.schema.json`,
`guild_hall/slack_history/fixtures/synthetic_slack_archive.json`,
`guild_hall/slack_history/slack_archive_query.test.mjs`,
`guild_hall/slack_history/README.md`,
`ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`,
`package.json`
## 2026-08-19 - The engine door learns which project, who is asking, and when to say no

The MCP door landed a day earlier served one project and asked no questions about who was calling.
A read-only review of what happens at ten, a hundred and a thousand projects (manual appendix B)
found the judgement layer clean and the door pinned at "one process, one project", with no word for
"the others", no lock, and a cache that served observations from before a confirmation. The Owner's
access requirement (plan 9.1F) added a second gap: everyone who reached the door saw everything.
Both are closed here, minimally. **The door is still off and still registered nowhere.**

- **A project registry** (`soulforge.engine_project_registry.v0`). One page listing which projects
  this door may serve: project code, the absolute path of that project's private profile, a status
  (`active` reads and writes · `paused` reads only · `closed` refuses), an optional label and
  instant. The instance is private (`_workmeta/system/engine/project_registry.json`, asserted with
  the repository's own write guard before it is created); what is public is the contract and a
  synthetic fixture whose paths are `<abs>` placeholders. Every tool now takes an optional
  `project_code` — added by the tool index rather than by each module — and one server holds a
  context per project, LRU-capped at eight. `--profile` did not go away: it is a registry of one.
  A registry whose rows include one unreadable or disagreeing profile does not half-open; the whole
  start fails, because serving four of five projects quietly reads as "the fifth is empty".
- **Two lines in the profile that make receipt mixing impossible.** `receipts_dir` and `runs_root`
  must now sit under `_workmeta/<project_code>/`, not merely somewhere under `_workmeta`. Two
  profiles naming one folder interleaved their receipt lines with nothing to separate them
  afterwards, and that is not recoverable.
- **A principal on every call, fail-closed** (`--principal {principal_ref, role}`). The engine does
  not authenticate; identity comes from the assistant or gateway layer above it, and the engine's
  job is to record it and filter by a table. Without a principal only the public rule class answers
  (`whoami`, `engine_status`, `rules_*`); everything else refuses `SE_MCP_PRINCIPAL_REQUIRED`. Not
  "anonymous may read": a caller the engine cannot name is a caller it cannot log.
- **An access table beside the registry** (`soulforge.engine_access_table.v0`) over seven roles and
  four data classes (ⓐ public rules · ⓑ team judgement · ⓒ confidential contract · ⓓ personal), with
  per-project overrides that replace a role's row rather than merging into it. A role the table
  leaves out is denied everything, and material with no declared class is treated as ⓒ — forgetting
  to tag something hides it rather than publishing it. When no file exists a built-in default
  applies, and that default is a narrow reading of 9.1F rather than a placeholder. **There is no
  tool that edits permissions**; `access_table` is Owner/PM and read-only.
- **The engine filters rather than trusting the caller.** A tool a role may not use is refused *and*
  absent from `tools/list`. Fields a tool declares as ⓒ — repo pointers, file names — are blanked
  for roles without that class, with `_redacted` naming what was withheld; the counts beside them
  are ⓑ and stay, because what is hidden is the naming, not the judgement. `next_steps` hands a
  discipline role the instructions its capability owns and reports how many it withheld, since a
  silently shortened list reads as "there is nothing to do". Receipts gained `principal_ref`,
  `role`, `access_decision` and `access_reason` — the access log 9.1F asked for — and still carry no
  argument, result, name or path.
- **A per-project write lock that refuses instead of queueing.** `runs_root/locks/<tool>.lock.json`,
  create-only; a second holder gets `SE_MCP_LANE_BUSY` (contract lane 1D §4.3). A lock older than
  thirty minutes is reported as stale in the refusal *and still refuses* — removing somebody else's
  lock because it looks old is how two runs end up writing the same folder. The engine releases only
  the lock it holds, matched by id.
- **Cache entries cannot outlive the write that invalidated them.** Keys are built by
  `kernel/mcp_contract.mjs` out of the project code, a generation counter and the binding revisions,
  so one project's lookup structurally cannot reach another's entry, and a successful write bumps
  the generation. This closes a bug that predates multi-project: confirming observations and then
  judging in the same session used to judge against the observations loaded before the confirmation.
- **The path budget applies on every plane.** Writes into the project plane were never measured
  against the repository's 200/60/60 budget, so a long run folder passed silently; now every write
  target is classified and an over-budget one is refused by field name (the path itself is never
  printed). `run_id`/`revision_label` are capped at 24 characters, since that segment is the one
  other segments are created under.
- **Four new tools, seventeen in total** (thirteen read, four write): `whoami` (who am I, what may I
  call, what was refused and why), `engine_status` (version, rule-layer fingerprints, protocol,
  both switches, registry, receipts root, allowed roots — no arguments; `rules_version` stays for
  compatibility), `access_table`, `projects_list`.
- **Honest annotations and honest errors.** With the write switch off the write tools are now hidden
  from `tools/list` rather than listed-and-refusing, and the list says how many it hid; the switches
  are read once at start, so `listChanged` stays `false` rather than promising a notification that
  cannot arrive. `destructiveHint` is false everywhere because every write is create-only;
  `idempotentHint` is declared per tool (`observe_scan` is not, `judge_run` is). Argument and state
  errors come back as `isError` tool results a model can read and fix; `-32000` is now reserved for
  protocol-level refusals — permission, class, principal, project, lane, write switch.
  `rules_layers`, `observe_status` and `judge_result` take `limit`/`cursor` and report `total` and
  `next_cursor` rather than leaving length to be inferred.
- **Tests: 70** (`npm run validate:se-mcp`, was 28) — profile 7, registry and routing 10, access 15,
  tools 22, protocol 16 over a real spawned process. Two new public synthetic fixtures
  (`project_registry_synthetic_v0.json`, `access_table_synthetic_v0.json`); no real project material
  in any of them.
- **Review round (independent verifier, same day).** Six code findings and four documentation
  ones, all closed on the branch before merge:
  - *The access log had holes.* A call naming a project the registry does not carry was refused
    before any project context existed, so it left no receipt at all — the one refusal an
    auditor most wants to see. Those lines now land in the default project's receipts with the
    project asked for left `null` and the principal, role and reason recorded.
  - *Two public-class tools were telling outsiders what the projects are.* `engine_status` and
    `rules_layers` are ⓐ as tools, but they carried the project code, its business type, prime
    and grade, the registry counts, the access-table path and the rule *file names* — an overlay
    file name contains the prime contractor and the project. Fields can now be narrower than the
    tool that carries them: those are ⓑ, withheld from `external` and from a caller with no
    principal, and the markdown hides exactly what the JSON hides. The engine version, protocol,
    switches and rule-layer *versions* stay public, as does the envelope — except `project_code`,
    which is now `null` for a caller who may not know a project exists.
  - *Owner decision on write scope.* `systems` and `quality` may also walk folders
    (`observe_scan`) and run a judgement (`judge_run`); both stay write tools behind the write
    switch. `observe_confirm` and `access_table` remain Owner/PM. The two run tools are therefore
    ⓑ answers whose ⓒ part is *where they wrote*, not the run itself.
  - *Schemas are now enforced where the caller can see it.* Every tool declares
    `additionalProperties: false`; the server now checks it, so a misspelled argument is refused
    by name instead of surfacing as a string-length complaint from inside the profile helpers.
    Missing required arguments say which one. Caller-argument failures use the arguments code,
    never the profile one — a caller who mistyped a stage code was being told their project
    profile was invalid.
  - *Refusals stopped echoing and stopped leaking.* `rules_card` and `observe_register` bound the
    token they were handed and no longer repeat it back; a missing profile at startup reports the
    file and the errno rather than letting a raw `ENOENT` print the absolute path on stderr; and
    exit 4 now prints the refusal detail, which is what makes the manual's "which file, which
    field" troubleshooting line true.
- **Docs:** manual chapter 12 rewritten around the registry, the principal, the access table, the
  lock, the cache and the path budget, plus a new **§12.A 등록·사용 안내** written for a
  non-developer — what to prepare, per-client registration examples with placeholder paths, the
  first five calls, what each role sees, how to unlock, where the receipts are, the five refusals
  that happen most, and what not to do. Every client example now carries `--principal` with a
  shape rule beside the placeholder (`^[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}# CHANGELOG

 — no Korean, no spaces),
  quoting guidance for TOML/JSON/shell and doubled backslashes on Windows, `--access-table` in the
  preparation table with what it means in `--profile` mode, and a role table that marks which tools
  the write switch still gates. New one-page `guild_hall/engineering_engine/mcp/README.md`
  pointing at it.

## 2026-08-19 - Slack batch: a blocked writer lease no longer fails silently

An abandoned batch writer lease stopped the scheduled Slack collector across repeated runs while
every health surface simply aged. `runSlackBatchLive` acquired `leases/slack-batch-live.lock` *outside*
its try block, so `batch_lease_unavailable` was thrown before any receipt was written: the run
exited `1` with no machine-readable reason, `state/slack-batch-live.json` was never refreshed, and
the Watchtower `slack_batch` and `store_slack_custody` heartbeats only went stale. Nothing in the
public tree said which of the launcher, manifest, binding, credential or lease gates had failed.

- **The blocked path now publishes its exact blocker.** Before rethrowing, the runner writes
  `health/store_slack_custody.json` with `status: "error"` and `error_codes: ["batch_lease_unavailable"]`,
  preserving the prior `last_success_at`, `validation_digest` and `validated_count`. The
  `store_slack_custody` lane therefore reports a named blocker instead of an unexplained gap.
- **Fail-closed behaviour is unchanged.** The error is still rethrown, the exit code is still `1`,
  the lock is never inspected for staleness, deleted or rewritten, no transport or provider call is
  created, the lease-guarded custody store is not read, and `state/slack-batch-live.json` is left
  untouched so a blocked run cannot green-wash the collector lane.
- **Regression coverage.** A new test drives a run against a pre-existing lock and asserts the
  thrown code, zero transport factory calls, byte-identical lock and batch state, the published
  blocker code, the preserved last-good fields, and that no channel or workspace identity reaches
  the receipt.

운영 영향: 이 변경은 이미 남아 있는 lock 을 지우지 않는다. 실제 수집 복구는 여전히 owner/operator
가 살아 있는 writer 가 없음을 먼저 증명한 뒤 승인된 private runtime 절차로만 lock 을 제거하는 별도
행동을 요구한다. 그 뒤 첫 예약 실행부터 두 heartbeat 가 다시 갱신된다.

관련 경로: `guild_hall/slack_history/slack_batch_live_runner.mjs`,
`guild_hall/slack_history/slack_batch_live.test.mjs`, `guild_hall/slack_history/README.md`


## 2026-08-19 - Board observability: a stale quota number no longer looks like a current one

The Board could not tell an Owner whether usage/quota collection was alive, stopped, slow, failed or
merely idle, and it rendered a 64h-old Claude quota as three numeric gauges with a small STALE tag.
Three latest-only evidence surfaces gained bounded append-only history; nothing that was already
authoritative was replaced.

- **Claude quota, HTTP 401/403 is now its own result.** The collector previously collapsed a rejected
  credential into `response_invalid`, which reads as a transient parse fault. It is now the fixed
  token `auth_rejected`, and the Board says re-login is required — it never initiates a login. No
  token, header, body, account, URL or raw response crosses that boundary; the response body is
  cancelled rather than read.
- **Attempt evidence is separate from the accepted value.** New
  `provider_quota.attempt.v1.json` (latest) and `provider_quota.attempt-history.v1.json` (bounded to
  50 rows) record every gate-passing attempt, success or failure, as `{provider, attempted_at,
  result, result_class}` and nothing else. A disabled gate is deliberately *not* recorded: no attempt
  was made, so recording one would manufacture liveness evidence. The existing accepted receipt keeps
  its own file, schema and meaning.
- **The Board separates "last attempt" from "last good".** `status.attempted_at` used to be the
  observation time of the last *successful* value, so a 64h-old success looked like a recent attempt.
  It is now the real attempt time, with `attempt_class` beside it and `last_success_at` unchanged.
  The provider-limits root gained `claude_quota_attempt`, so it is now an explicit **v4** rather than
  a widened v3 - a strict v3 consumer is not handed a shape its contract never described. Reading
  stays compatible where it matters: the reader never branches on the root version, so a retained v2
  or v3 payload normalizes exactly as before and its absent attempt field reads `null`/UNKNOWN
  rather than as a pass.
- **Stale quota no longer renders a numeric gauge.** When the value is not current the gauge and the
  "N% 남음" reading are suppressed; the last-good percentage survives in the note, explicitly marked
  `현재값 아님`. Attempt evidence can never promote a value to current.
- **The usage producer proves it ran.** A sanitized cycle receipt is written *before* any child
  starts, and again on completion with duration and one status per lane, over a fixed lane
  vocabulary (`producer_health/cycle.json` plus a 50-row `cycle-history.json`). Idle semantics are
  unchanged: no new usage stays a healthy `ok` with `activity_changed:false`, not a failure.
- **Producer children are bounded.** Collector children had no timeout at all, so one wedged child
  could hold the sweep's single-flight indefinitely. Every child now carries a 180s bound. The bound
  is deliberately loose, not tight: the Codex lane has been observed at ~78s live, so a tighter bound
  would kill healthy work. A slow sweep may outrun the 5-minute interval and skip one overlapping
  tick - correct and self-correcting, since the trigger returns the in-flight sweep. A permanent
  wedge cannot happen, because every child is bounded, so the sweep always terminates and releases
  single-flight. A timed-out lane fails closed as `collector_timeout` and never falsifies a sibling.
- **Runtime lifecycle transitions are retained.** `lifecycle-history.v1.json` keeps up to 100 rows of
  material transitions only — start, ready, requested stop, handled fatal, restart recovery, child
  restart and child exhaustion. The 10s heartbeat stays latest-only and is deliberately never
  appended; the termination receipt keeps its own separate file and last-good contract. A row is an
  exact `{observed_at, event, failure_class}` with **no identity at all** - no run id, pid or hash.
  Ordered material events already answer whether it restarted, crashed or was told to stop, so a
  correlatable identifier would add a receipt field without adding an answer.
- Retention is one shared deterministic reducer (newest-N, oldest evicted) with exact-key entry
  validators per caller, and the file count per surface stays fixed at latest + history.
- **Reads are bounded, not just writes.** Every history reader inspects the directory entry first and
  refuses anything that is not a regular, non-symlink file inside a fixed byte budget, before parsing
  a single byte.
- **A corrupt history is preserved, never repaired.** The reader separates a genuinely missing
  history (safe first write) from a present but untrustworthy one. Present-but-invalid — unreadable,
  oversized, symlinked, non-regular, malformed JSON, wrong schema, wrong keys, or holding even one
  invalid row — is left byte-for-byte at its existing path; the append is not attempted and no
  replacement record is produced. Filtering the bad rows away or restarting from empty would destroy
  exactly the trace needed to reconstruct what went wrong, so one invalid row invalidates the whole
  stored history rather than being salvaged around. The core operation is never blocked: latest
  receipts still update atomically so current liveness stays visible, and the history append returns
  a bounded `preserved` outcome with a fixed reason to its caller.

## 2026-08-19 - D44 decided: three national rule rows now carry the token they actually are

The previous slice found that three rows of the 체계개발 rule table carried a token whose meaning
in the shared vocabulary is a different document than the row plainly is, and worked around it with
a cross-layer equivalence table. Owner decided the rows should be corrected instead.

- `SE_FolderTree_Guide.md` v0.10 → **v0.11**. Each row was checked against its own name, desc and
  term before being touched: 운용개념(CONOPS) / term CONOPS `ord` → `conops`;
  SW산출물명세서(SPS_VDD) / term SPS/VDD `sps` → `vdd`; 요구사항검증매트릭스(VCRM)_F / term VCRM
  `spec_linkage_table` → `vcrm`. The 12 `depends_on` and `evidence_record` entries elsewhere in the
  spec that named the old tokens moved with the rows, so nothing is left pointing at a token the
  spec no longer produces.
- **No token was renamed.** `ord` (소요-작전운용성능참조문서), `sps` (체계성능시방서) and
  `spec_linkage_table` (국방규격화 연계표) keep their meanings and stay in the vocabulary; only the
  row-to-token assignment changed. The 국방규격화 연계표 itself was never lost — it rides on the
  국방규격(안)및국방규격화연계표 row, which is why `spec_linkage_table` was free to leave the VCRM row.
- **Blast radius, measured rather than estimated**: exactly one engine requirement id moved,
  `150_TRR_DT_sps` → `150_TRR_DT_vdd`. The other two rows are `unstated`, so they compile to
  optional context and were never engine requirements at all.
- Three `national_row_assignment` entries left `CROSS_LAYER_TOKEN_EQUIVALENCE`, which is now back
  to what it claims to be: one real synonym (`temp` ↔ `p_temp`). The two rule layers meet on the
  shared token directly, and the generic→national projection is unchanged at 52 edges over 20 rows
  while no longer going through an equivalence at all.
- `gate_role` entry rows in the national spec fell from 4 to 2. That is the same correction rather
  than a loss: two of them existed only because a mis-assigned token was catching the guidebook's
  references to a different document (the 소요요구서 as an SRR input, the 국방규격화 연계표 as an FCA
  input).
- **Project overlay impact: none.** The KVDS (P26-014) overlay's 24 ops reference none of the three
  tokens — the seven aliases that look unresolved against the base spec are each paired with an
  `add` in the same overlay and resolve in order. Reported for the Owner rather than edited: that
  overlay's `extends.spec_sha256` still pins spec v0.8, so it has been failing
  `OVERLAY_BASE_MISMATCH` since well before this change and needs re-pinning.
- Compiler note added at the refusal site, because the two behaviours look alike from a distance:
  an overlay `alias` or `mark_not_applicable` naming a rule that does not exist at that stage is
  **refused** with `SE_STAGE_RULE_OVERLAY_INVALID` (detail carries op, stage and token) — it is not
  a soft report like `receipt.unresolved_dependencies` or the generator's `unbound_observations`.
  A project asserting something about a rule that is not there has already made a false assertion,
  so continuing would apply an overlay that means less than it says. Pinned by a new test.
- Verification: `export_variant_json.py --check` PASS, `validate:se-stage-rules` 52/52 (three new
  cases, two updated), `validate:canon`, `validate:path-length`, the local absolute path policy,
  the engine manifest/topology and the guidance / observation / MCP suites all PASS.

## 2026-08-18 - The engine's MCP door, built and left switched off

The Owner decision (plan 9.1A) is that the one way in from outside is MCP: no terminal CLI product,
the existing runners stay internal, and the server lives under the engine owner rather than inside
dev-ERP so the engine's release path does not depend on a component whose future is undecided.
This lands that door. It is off, and turning it on is a separate Owner decision.

- **New `guild_hall/engineering_engine/mcp/`.** A hand-rolled JSON-RPC 2.0 server over stdio —
  `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, protocol version
  `2025-06-18`, newline-delimited. Five methods did not justify a new npm dependency. Results carry
  a markdown `content` block for a person and `structuredContent` for an agent, both rendered from
  one value, plus the engine version.
- **Off by default, twice.** Without `SOULFORGE_ENGINE_MCP=on` the process prints one line and
  exits 3. Without `SOULFORGE_ENGINE_MCP_WRITE=on` the four write tools remain listed but refuse
  the call with `WRITE_TOOLS_DISABLED` — listed rather than hidden, because hiding them would make
  "off" indistinguishable from "absent". A profile the validator rejects stops the process (exit 4)
  instead of opening a half-bound door. Nothing is registered with any client configuration.
- **One private profile per project** (`soulforge.engine_project_profile.v0`). Every path is
  absolute, carries no `..` segment — checked against the raw string, since normalising one away is
  exactly how a path that reads as inside the project resolves outside it — and lies under
  `_workspaces/**`, `_workmeta/**` or the compiled rule-spec assets. The key set is exact: an
  unknown key is refused rather than ignored, because an ignored key is a setting its writer
  believes is in force. The only path a caller may supply is a confirmation sheet, and it must sit
  under the observation run the profile names.
- **Thirteen tools with no logic of their own** (nine read, four write): `rules_layers`,
  `rules_stage`, `rules_card`, `rules_version`, `observe_scan`\*, `observe_register`\*,
  `observe_confirm`\*, `observe_status`, `judge_run`\*, `judge_result`, `judge_diff`, `next_steps`,
  `project_status`. Each calls functions that already exist — the compiler, the work order, the
  guide cards, the instruction packets, the answer renderer, the confirmation sheet, the packet
  generator, and the two runners spawned exactly as chapter 7 documents. Two boundaries are written
  into the tool definitions rather than into a comment: `observe_register` records a candidate
  awaiting human confirmation, never an observation (none of the three automatic-confirmation
  conditions is "somebody said so"), and `next_steps` quotes a stored judgement and writes nothing,
  because an answer handed back through a call is not a record and should not pretend to be one.
- **A metadata-only receipt per call.** Tool name, argument and result digests, duration, engine
  version, refusal code — appended as one JSONL line under the profile's receipts directory. No
  payload, no path, no filename; a test asserts those keys never appear. Writes into `_workmeta`
  call the same policy function the repository's own `guard:workmeta-write` uses, so the door is
  not an exception to it.
- **`npm run validate:se-mcp`** — 28 tests: profile validation, every read tool against the public
  synthetic fixtures compared byte for byte with calling the pure function directly, determinism
  across fresh contexts, create-only refusals, and the protocol driven over a real child process.
  New public fixture `docs/architecture/workspace/examples/se_stage_rules/project_profile_synthetic_v0.json`
  and `fixtures/engine_mcp_synthetic_project.mjs`, which stages those fixtures into a temporary
  project. No real project material enters a test.
- Manual chapter 12 (`manual/12_mcp_door.md`) documents the switches, the profile, the tool table,
  the receipt, the locks and the limits; the manual README's agreed-but-missing list now reads
  "MCP 문 + 야간 예약 실행 → 부분(꺼진 채 착지)". Still missing and still drawn: the answer mailbox
  and context fill (B2), the nightly schedule (B3, outside the engine), project start-up (C1), the
  document content checker (D1).

## 2026-08-18 - Engine version slot (0.0.0) and release manifest

- New `guild_hall/engineering_engine/topology/ENGINE_VERSION` (`0.0.0` while the engine is under construction; Owner: real numbering starts at canon promotion) and `topology/engine_release.json` emitted by `tools/emit_release_manifest.mjs`: one label binding the rule-layer spec versions/shas, prime overlays, vocabulary digest, compiler/generator versions, the engine code manifest sha and the git commit. `--check` recomputes everything except the stamp and fails on drift; `npm run validate:engine-release`. Run receipts already carry `policy_ref`; stamping `engine_version` into receipts is left to the MCP/release slice (B1).

## 2026-08-18 - A causal spine for the national rule layer: backwards edges removed, gate roles, cross-layer projection, importance ordering

Reviewing the first pass on real output found three things wrong with it, and this change is the
correction. The rule tables now answer "what first" with the requirements specification rather
than with whichever plan sorts earliest alphabetically.

- **Backwards edges removed.** The practice guide's activity table had been read as "the
  functional analysis produces the system requirements specification", which puts the analysis
  before the thing it analyses. Four such edges are deleted rather than reversed — reversing would
  be a claim no canonical text makes. A regulation sentence stating the correct direction (the
  operational requirements are what the specification is written from) is among the candidates in
  the next bullet, awaiting confirmation.
- **A review's input list is a gate role, not causality.** New spec field `gate_role`:
  `core` (what the review is stated to produce), `entry` (what it is stated to expect on the
  table), `supporting` (default). Sources: the 방사청 review guidebook's per-review 주요 산출물 /
  INPUT tables and the SE 기술관리 실무지침서 completion products for ②, NASA NPR 7123.1D appendix G
  success / entrance criteria for ①. Counts: ① core 32 / entry 57 / supporting 161; ② core 25 /
  entry 4 / supporting 125. The technical-review activity keeps its own `depends_on` — that is not
  a relation between artifacts but what the meeting itself waits for.
- **The two layers now meet.** None of the generic layer's 128 relations reached the national one,
  because the tokens differ. The vocabulary gains `ARTIFACT_TYPE_ALIASES` +
  `canonicalArtifactType(id)` for true synonyms (one pair: `p_temp` → `temp`) and a separate,
  deliberately different `CROSS_LAYER_TOKEN_EQUIVALENCE` (4 pairs) for "the national row is
  plainly this artifact, though its token says otherwise" — kept apart so a layer mapping cannot
  corrupt a global meaning. The packet's `spec_linkage_table` ↔ `rtm` hypothesis was **refused**
  on inspection: the national spec already carries three `rtm` rows and its `spec_linkage_table`
  row is the verification cross-reference matrix. New pure export
  `projectGenericLayerEdges({generic_variant, national_variant})` carries relations across by
  composing two stated ones through a single activity (`A is an input of X` + `X produces B` give
  `B needs A`); the result never rises above `general_se_guidance`, records the activity it went
  through, and is marked `depends_on_origin: generic_layer_projection` in the row it lands on.
  52 edges landed on 20 national rows.
- **Form-reference edges.** Where a canonical form for artifact A has a field that requires naming
  artifact B (적용문서 / 근거문서 / 규격 항번 / 추적성), A needs B. 62 read, 21 with both endpoints
  tokenised, 9 landed. The strongest come from the three real grid forms in the 2017 guidebook's
  appendix E; the practice guide has no 별지 서식 body at all, which is recorded rather than
  worked around.
- **Importance ordering.** `orderStageWork` gains two tie-breaks after evidence rank: gate role
  (core > entry > supporting), then how many later work items name the token as an input, counted
  over the whole compile from the rules alone. The "gate entrance criteria first" tie-break that
  the previous pass had to declare **skipped** is now applied, and `tie_breaks_skipped` is empty.
- Measured effect on an empty 체계개발 project (zero observations, national common + prime
  overlay): 030_SRR now opens with 체계요구사항명세서 instead of ICD, and causal links across
  SRR..PCA went from 10 to 25 (4·1·1·1·1·1·1 → 3·4·4·4·2·4·4; SRR drops by one because that is
  where the four backwards edges were).
- **Regulation-grade ordering: candidates only.** Every edge so far is guidance- or
  guidebook-grade. 60 ordering sentences were extracted from 방위사업관리규정 and
  국방전력발전업무훈령 (51 high confidence, 16 with both endpoints tokenised) and written to the
  private worksite with an Owner confirmation sheet. **None is in any spec**: a regulation-grade
  edge outranks a guidebook one, so a person confirms before it becomes a rule — the same rule the
  engine already applies to observations.
- Specs `SE_FolderTree_GenericSE_Base.md` v0.2 → **v0.3** and `SE_FolderTree_Guide.md` v0.9 →
  **v0.10**. Verification: `export_variant_json.py --check` PASS, `validate:se-stage-rules` 50/50
  (five new cases), `validate:canon`, `validate:path-length`, the local absolute path policy and
  the engine manifest/topology all PASS, and folder generation is unchanged.

## 2026-08-18 - Manual chapter 11: how the guidance layer works

Documentation only; no code, schema, or output changed.

- New `guild_hall/engineering_engine/manual/11_guidance_layer.md` explains the layer that turns a
  judgement into "here is what to do next": what it reads, where every field of a guide card comes
  from (a table mapping each cell to the rule-row field or the fixed template behind it), the
  instruction packet's fields and the two devices that keep the judgement unchanged (the forbidden
  key check and the copied `judgment_ref`), the four parts of the one-page answer and the rule for
  picking the next three (engine mission candidates first, ready-but-unobserved work only to fill
  a shortfall, labelled as its own kind), the five output files and where they are stored, the
  first P26-014 measurements for SRR and CDR, the six current limits, and the order to change it in.
- Reading order in `manual/README.md` gains row 11, and the agreed-but-missing rows for
  가이드 카드 and 결과 전달 now point at it. The 가이드 카드 row also regains the A3 landing status
  it was given when that slice landed — the observation follow-up merge had reverted that line.
- `manual/03_how_items_were_derived.md` gains section 3.9: where the guidance sentences come from
  (they are assembled from fixed templates over row-copied slots, never written).


## 2026-08-18 - Observation cues widened, folder-level confirmation, and manual chapter 10

Owner said yes to the three questions the previous slice left open, and the answers are three
small rules that together took auto-confirmation on the pilot project from 4 files back to 96 —
without loosening the "the file must say what it is" condition that produced those numbers.

- **The standard token is its own cue.** `bom`, `hdd`, `icd`, `rtm` appearing in a file name now
  count as naming that artifact, alongside the spec term, the vocabulary labels and the project
  aliases. This is what people actually type: a parts list filed as `K-VDS_BOM_260818.xlsx` matched
  nothing before, because the spec row calls it `Q-BOM` and the vocabulary calls it 부품목록.
  Matching stays token-bounded, so `bom` does not find `bomb`, and a different artifact's token is
  never a cue for this one.
- **Projects may register name shapes.** New `alias_patterns[]` input (CLI `--alias-patterns <abs
  json>`, a private project file): `{stage_code|null, artifact_type_id, pattern, basis}`. Some
  artifacts are named by a scheme rather than a word — drawings filed as `F245-013001001002(...)`
  say neither "도면" nor `drawings`, and no vocabulary ever will. A match is a cue of kind
  `alias_pattern` and satisfies the own-cue condition. `stage_code: null` means "wherever the rules
  place this artifact", so a pattern can never invent a stage. An unusable pattern is refused with
  a field label and the pattern source never travels into the refusal or the receipt.
- **A folder can be confirmed in one tick.** The confirmation sheet now leads with a task-folder
  table (단계 / 업무폴더 / 산출물 / 후보 수 / 03_Out 파일 수 / 확인) for every folder that resolves
  to exactly one artifact, and `applyConfirmationSheet` accepts `confirm_folder` / `reject_folder`
  (optionally reassigning). A folder decision reaches that folder's `03_Out` files only — working
  material in `01_Work` and `02_Input` is not a claim about what was produced — and the precedence
  is file decision > folder decision > automatic rule.
- **New manual chapter `manual/10_observation_eye.md`** (Owner instruction: every built function has
  to be explained where a reader can find it). Purpose and the two routes a document takes into the
  engine, what is read and what is not, the 3+1 rules, the confirmation sheet and folder ticks, how
  observations are shaped for the generator, the six housekeeping kinds, the seven output files and
  where they live, the limits (a well-named empty shell still passes — that is D1's job), the
  measured pilot numbers across runs, and the order to change this part in. Added to the manual
  reading order as row 10, with a pointer from chapter 03 (new §3.8) and from the agreed-missing table.
- `npm run validate:se-observation` now 67 tests (was 57).

## 2026-08-18 - Guidance layer: guide cards, instruction packets, and the "what do I do next" answer

- The engine could say what was missing and could say what came first, but it could not say what to
  do about it. New pure layer `guild_hall/engineering_engine/guidance/` reads the same compiled rows
  and answers the other half — why the rule exists, when it is expected, what the thing is, how it
  is made, who normally makes it — without touching the judgement (design D47, plan slice A3,
  milestone M1).
- `buildGuideCards` emits one card per (stage, artifact type): every engine requirement, plus every
  activity and decision row even where it stayed context, because those are the rows that say what
  work has to happen. A card carries `why` / `when` / `what` / `how` / `who` / `evidence` /
  `citations`.
- `buildInstructionPackets` emits `soulforge.engine_instruction_packet.v0`: the engine's mission
  candidate joined to its card and to whatever the caller can fill in (a due date, a named owner).
  `judgment_ref` copies the policy ref, the assessment handle and the requirement counts rather
  than recomputing them, so no second set of numbers can enter circulation.
- `renderNextStepsAnswer` writes the answer in Korean markdown and the same structure in JSON, in a
  fixed order: 위치 · 부족 · 다음 할 일 · 그 뒤(막힌 것). Counts come before work on purpose — a
  reader given the tasks first cannot tell "the engine judged this missing" from "nobody looked".
- Three boundaries are enforced by tests rather than intended: **no invented text** (every Korean
  sentence is one of the fixed templates in `GUIDE_CARD_TEMPLATES`, rendered over slot values
  copied off a rule row, and each sentence ships as `{template_id, text_ko, slots}` so it can be
  re-rendered and compared byte for byte — no model is called); **silence is reported, not filled**
  (a row with no form reads `양식 없음`, a row with no citation reads `근거 미표기`); and **an
  instruction is not a write** (a build refuses if a `presence_state`, revision ref, or completion
  field would appear anywhere in it; the owner is a logical role, and a person appears only from
  `context_fill.owners`).
- Citations are locators. A card carries `{source_key, locator}` and, when a source catalogue is
  supplied, only the title that catalogue already holds; a source the catalogue does not name stays
  honestly `catalog_known: false`. No canonical text is copied into a card.
- One caller writes files: `tools/engine_next_steps_runner.mjs`, create-only under `--out`, with
  `--known-at` supplied by the caller because the pure layer reads no clock. Where the engine
  emitted fewer mission candidates than asked for, the remainder is filled from work that is ready
  and never observed, labelled `instruction_kind: next_ready` / `engine_finding: not_yet_observed`.
- New `npm run validate:se-guidance` (42 tests) and public-safe fixture
  `docs/architecture/workspace/examples/se_stage_rules/next_steps_synthetic_v0.json`. D47 itself
  remains a proposal awaiting owner sign-off.


## 2026-08-18 - Observation auto-confirmation tightened + folder housekeeping report

- **The `03_Out` auto-confirmation now needs three conditions, not two.** A file is confirmed
  without a person only when (a) it sits under a task folder's `03_Out`, (b) that task maps to
  exactly one `artifact_type_id`, and (c) the file's own name or title carries a cue for *that*
  artifact. The third came from a real project: a review-minutes task folder whose `03_Out` held
  the drawings and the parts list submitted at that review, all of it auto-confirmed as the
  minutes. The folder was right about what belongs there and wrong about what was put there, and
  only the file names could tell the difference. Rows held back this way stay candidates, are
  counted in the receipt as `auto_confirm_withheld_no_own_cue`, and each candidate now carries
  `own_name_cue` so the reason is visible rather than inferred.
- **New `guild_hall/engineering_engine/observation/observation_housekeeping.mjs`** —
  `buildHousekeepingReport` plus `renderHousekeepingMarkdown`, and a seventh CLI output
  `housekeeping_report.md`. It lists, per task folder: two issues of one artifact in one `03_Out`
  (naming which file wins and which falls behind), material whose name never mentions the folder's
  artifact, transport packaging (`.zip/.7z/.rar`, `01of03`, split parts), interim wording left in
  `03_Out`, two task folders carrying one artifact in one gate, and a task folder in use whose
  `03_Out` holds nothing. It is a cleanup notice for the team and never an observation, never a
  judgement, and never reads file content: `03_Out 파일 없음` says the folder holds no output file,
  not that an artifact is missing. Owner's standing instruction: this check stays after the team
  starts filing properly — it becomes the guard that shows they still do.
- Maturity vocabulary widened for the words a real project uses: `중간수정본|수정본|검토본|중간본|임시|wip`
  read as preliminary, and `승인본|확정본|배포본` as final. `승인` on its own still reads as baseline,
  because the `-본` suffix names the issued copy while the bare word names the act of approving.
- **D46 follow-up:** activity and decision rule rows are excluded from classification. A file in an
  activity's folder shows the folder is not empty; it can never show the work happened, and reading
  it as an observation would have let a PDF stand in for a process. Rows carrying
  `node_kind` other than `artifact`, and the `activity`/`decision` vocabulary families, take no
  part in cue matching.
- `npm run validate:se-observation` now 55 tests (was 39): the review-minutes failure shape by
  name, every auto-confirmed row carrying its own cue, activity nodes never becoming candidates,
  the new maturity words on both sides, and twelve housekeeping cases (each kind, determinism, the
  folders deliberately not reported, and a guard that no observation or judgement vocabulary
  appears in the report).


## 2026-08-18 - Activity/decision rule rows, `depends_on` from canon, and a compiler work order ("what first")

- The rule tables could name documents and nothing else, so they could not say "do the functional
  analysis before you write the design description". Rows now carry `node_kind`
  (`artifact` | `activity` | `decision`, design D46). An activity or a decision is not a document:
  its evidence is a record — the row's new `evidence_record` names which one — and it gets no
  folder (`is_virtual: true`, which `generate_tree.py` skips). Folder generation is unchanged: a
  dry run still produces 145 task folders for 체계개발/LIG/A and 229 for 일반SE.
- Rows also carry `depends_on` with its own citations (`depends_on_refs`) and its own grade
  (`depends_on_evidence`, defaulting to `unstated` rather than inheriting the row's grade). The
  edges were derived from canon by four parallel readers: NASA SE Handbook SP-2016-6105 Rev2
  chapters 4-6, NASA NPR 7123.1D section 3.2 and appendix G, DoD SE Guidebook 2022 section 4, and
  the 방사청 SE 기술검토회의 가이드북 2017 per-review INPUT/OUTPUT tables (2024 OCR cross-check)
  plus the SE 기술관리 실무지침서 activity procedures. Result: 206 edges (128 generic-SE,
  78 national-common), 19 activity tokens and 3 baseline decision tokens added to the vocabulary
  (130 → 152 tokens, 17 → 19 families).
- **Source correction**: NPR 7123.1D appendix C is "Reserved" in Rev D (the core SE process
  guidance moved to NASA/SP-6105), so it is not cited; Rev D section 3 carries no normative
  per-process input/output table, and the DoD guidebook's 2022 section 4 has no inputs/activities/
  outputs template either. Only the NASA handbook numbers an Inputs and an Outputs subsection for
  every process. Measured coverage is therefore stated rather than implied: 243 of 773 extracted
  items became an edge (31.4%), and **no edge is regulation-grade yet** because all four source
  families read here are guidance or guidebooks.
- Specs: `SE_FolderTree_GenericSE_Base.md` v0.1 → **v0.2** (250 task = 229 artifacts + 18 activity +
  3 decision rows; 82 rows with `depends_on`) and `SE_FolderTree_Guide.md` v0.8 → **v0.9** (154 task
  = 145 artifacts + 9 activity rows; 12 rows with `depends_on`). The seven `act_technical_review`
  rows carry the gate-by-gate input list the review guidebook actually states.
- New pure export `orderStageWork(compileResult, observations?)` answers "what first" per gate. It
  keeps two things apart that are easy to confuse: a **causal edge** (`depends_on`, a property of
  the rules) and the **stage sequence** (the lifecycle). Order is topological inside a gate, then
  unblocked before blocked, then evidence rank (regulation > guidebook > prime contract > guidance
  > unstated), then the token. A ring is refused with `SE_STAGE_RULE_DEPENDENCY_CYCLE` rather than
  broken arbitrarily; an input naming a token nothing owns is recorded in the receipt's
  `unresolved_dependencies` rather than failing the compile. The "gate entrance criteria first"
  tie-break the plan asked for is declared **skipped** in the receipt, because no spec field marks
  a row as entrance criteria and inventing one would be the compiler writing a rule. Observations
  mark what is already done; they never move an item ahead of its own input.
- Overlays gain `add_dependency` (exact `source_ref` + `basis`, union only). There is no
  `remove_dependency`, for the same reason there is no way to lower a canonical evidence level.
- Verification: `export_variant_json.py --check` PASS (5 compiled variants), `validate:se-stage-rules`
  45/45 (was 35 — ten new cases, two widened), `validate:canon`, `validate:path-length` and the
  local absolute path policy PASS, and the layered path (national common + prime overlay) still
  compiles to the same engine requirements as the merged spec at 120_CDR. Public-safe fixture
  `docs/architecture/workspace/examples/se_stage_rules/stage_work_order_synthetic_v0.json` added.
- Derivation record: `.registry/skills/se_foldertree_generate/codex/references/se_io_relations_v0.md`
  (method, per-source coverage and limits, token-to-canon correspondence, placement rules, 8 open
  items). Working files stay in the private knowledge worksite with a metadata-only receipt under
  `_workmeta/system/reports/se_stage_rules/`.

## 2026-08-18 - Observation candidate supplier (project material to candidate artifact observations)

- New `guild_hall/engineering_engine/observation/` (plan slice A1, the engine's "eye"): three pure
  modules that turn a walked file inventory into artifact observations the pilot packet generator
  accepts, with a person in the middle.
  - `artifact_observation_candidates.mjs` proposes which file looks like which standard artifact,
    at which stage, at which maturity, and records the cue behind every proposal. Matching is
    rule-based only — task folder number to spec task, spec term, vocabulary `label_ko`/`label_en`,
    project overlay alias, maturity from `_D`/`_U`/`_F` and `초안|draft|rev|최종|승인|v0.x`. A file
    with no cue is `unmatched`, a file with two competing cues is `ambiguous`, and neither is
    resolved by guessing. No model is called and `absence_confirmed` is never emitted.
  - `observation_confirmation_sheet.mjs` renders the candidates as a Korean per-stage table plus a
    JSON sheet with `decision: null`, and applies `confirm` / `reject` / `reassign` decisions back.
    A row nobody decided stays pending rather than defaulting either way.
  - `artifact_observations_from_confirmed.mjs` emits generator-shaped `artifact_observations`, one
    per (stage, artifact type); when several confirmed files map to one pair the strongest maturity
    wins, then the newest modification time, then the digest, and the rest are recorded as
    superseded. Identifiers are minted from digests, so one confirmed set reaches one byte-identical
    observation set.
- Design D37 holds: automatic extraction is candidate only. The single auto-confirmation is a file
  under a task folder's `03_Out` where that task maps to exactly one artifact type — the folder
  convention read back, not an inference. Everything else waits for the Owner.
- New CLI `guild_hall/engineering_engine/tools/artifact_observation_inventory_runner.mjs` — the one
  caller that reads a disk and a clock. It walks a project root (skipping `.git`, `node_modules`,
  `00_Temp`, `__pycache__`, `_trash*`, symbolic links and oversized files), streams sha256 per file,
  and writes six outputs under `--out` only, refusing to overwrite an earlier run.
- New `npm run validate:se-observation` (39 tests): the hand-derived synthetic fixture
  `docs/architecture/workspace/examples/se_stage_rules/observation_candidates_synthetic_v0.json`
  row by row, determinism under input reordering, the `03_Out` rule on and off, ambiguity, maturity
  reading, refusals, agreement with the compiler's gate-to-stage map, a static effect pin over the
  whole import graph, acceptance of the produced observations by
  `generatePilotPacketFromStageRules`, and the CLI's create-only boundary.
- Docs: engine README gains a `observation/` section, manual 07 gains step 0 of the rerun recipe,
  and the manual README's agreed-but-missing table moves 관측 공급 to "부분 → 후보 생성기 착지(확정은 사람)".


## 2026-08-18 - Engine development manual + generic-layer derivation record + source-claim correction

- New `guild_hall/engineering_engine/manual/` (README + chapters 01-09, Korean, tool-independent):
  purpose and shape, the four rule layers, **how the checklist rows were derived** (per layer:
  source acquisition → per-source extraction → synthesis/verification → critic → coder → compile →
  verify, plus how to count rows vs artifact types), the artifact vocabulary, compiler and
  generator, requirement trace, runs and receipts (numbers + private pointers only), decisions
  D36-D45, next work and a start checklist for a new worker. It is a map of the canon, not a
  canon; every related change updates the matching chapter.
- New `.registry/skills/se_foldertree_generate/codex/references/generic_se_base_derivation_v0.md`
  (generated from the compiled JSON + derivation working files): pipeline, floor rule, gate
  mapping, deliberate exclusions, the critic's corrections and open risks, the 30 vocabulary
  additions, and every row with its floor / maturity / verification status / citations. The
  derivation working files (three per-source extractions, synthesis, critic, coder packet,
  comparison driver) are kept in the private knowledge worksite
  `_workspaces/knowledge/common/systems_engineering/derivations/generic_se_base_20260818/` with a
  metadata-only receipt under `_workmeta/system/reports/se_stage_rules/`.
- Correction: the generic baseline rows cite only NASA NPR 7123.1D (195 rows) and the DoD SE
  Guidebook 2022 (173 rows). NASA SE Handbook SP-2016-6105 Rev2 was extracted but the synthesis
  input was truncated before it, so **no row cites it yet**. The spec principles, the human
  section, `references/variants.md` and the design note now say so; folding the handbook in is
  recorded as open item 1 of the derivation record. Compiled JSON regenerated, `--check` PASS.
- Counting note recorded in the manual and the derivation record: 202 rows are (gate, artifact
  type, maturity) cells over 8 review gates, not 202 different documents — 100 distinct
  `artifact_type_id`s (67 among must_have rows), about 25 rows to check per gate; the compiled
  must_have count is 124 (synthesis had 132 before the critic's corrections).

## 2026-08-18 - Generic SE baseline layer (buyer- and country-independent SE floor)

- New spec `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_GenericSE_Base.md`
  (`support_key: generic_se_base`, input `일반SE / 공통 / 없음`, v0.1): the layer ① floor of
  what a development run on systems engineering lines is expected to have produced before
  each technical review, independent of any buyer, country, or contract. 9 gates
  (`0 REF / 30 SRR / 60 SFR / 90 PDR / 120 CDR / 150 TRR_DT / 180 FCA_OT / 210 PCA / 240 LL`),
  229 task folders = 202 checklist rows + the three fixed INBOX/LOG/TDP slots per gate.
  Sources are NASA NPR 7123.1D (2023) appendix G and section 5.2, the DoD Systems Engineering
  Guidebook (2022) section 3, and NASA SE Handbook SP-2016-6105 Rev2 6.7, cited by table id and
  page marker only. Compiled to `assets/compiled/generic_se_base.json` by the existing exporter,
  which needed no change.
- Compiler: new evidence level `general_se_guidance` → `present_or_not_applicable` (guidance,
  so "not applicable" is allowed but needs a basis), and two new optional task fields carried
  into the mapping table: `se_floor` (`must_have` / `should_have` / `context`) and `maturity`.
  A `general_se_guidance` row whose floor is `context` — a buyer-owned input or a mission-specific
  product — becomes `optional_context` and never an engine requirement; `must_have` and
  `should_have` both stay requirements. `partially_supported` does not weaken such a row:
  single-source guidance is still guidance, and only `unverified` / `unsupported` / `contradicted`
  weaken, as before.
- Vocabulary: 30 new shared tokens the baseline needs (`conops`, `ims`, `vcrm`,
  `system_safety_analysis`, `manufacturing_plan`, `hsi_plan`, `as_built_config`,
  `acceptance_data_package`, `tech_manual`, … ), all generic — no token belongs to one buyer,
  country, or contract. This is what lets a national or prime-contractor layer meet the generic
  floor on a shared `artifact_type_id` instead of a second vocabulary.
- `generate_tree.py` supports the `일반SE / 공통 / 없음` combination; skill README,
  `codex/references/variants.md` ("Generic SE baseline (layer ①)"), `codex/SKILL.md` and
  `guild_hall/engineering_engine/README.md` record the layer, its floor semantics and its
  relation to the national layer. Four new compiler tests cover the evidence level, the two
  carried fields, the vocabulary additions, and a real compile of the tracked
  `generic_se_base.json` across all nine stages.

## 2026-08-18 - R3 pilot packet generator (compiled stage rules feed the engine)

- New `guild_hall/engineering_engine/stage_rules/pilot_packet_generator.mjs`:
  `generatePilotPacketFromStageRules(request)` turns one compiled
  `soulforge.ax_se_stage_policy.v0` material plus artifact-level observations into a
  `soulforge.ax_se_project_context_pilot_packet.v0` packet, the launch fields that derive
  from that packet (`launch_material`), and a receipt. The engine can now judge a stage
  from the compiled standard+overlay policy instead of a hand-written slot list.
- An already validated pilot packet is the template for everything the stage rules do not
  own (Knowledge View request and authority grant, role roster, objective, risks, project
  binding, feature state). Observations arrive keyed by standard `artifact_type_id` or by
  the project's own `alias` and are re-keyed through the compiler's mapping table; an
  artifact that maps to no engine requirement is listed in `receipt.unbound_observations`
  and left out of the packet rather than attached to a neighbouring requirement.
- Every digest the consumer recomputes is reproduced under the same domain: the engine's
  `policy_ref` rule, the Knowledge View authority grant content id (re-bound because the
  grant names the policy), the source binding manifest content id and its exact
  project-plane partition, the pilot material fingerprint, and the pilot grant content id.
  `launch_material.pilot_packet_sha256` is the sha256 of the canonical bytes plus the
  trailing newline the caller writes, so the runner's file pin matches without a re-read.
- A common projection binding is carried unchanged when the recompiled policy still holds
  the exact requirement ref the base packet bound; otherwise it moves only to the
  caller-named `common_binding_requirement_id`, and generation is refused when neither
  resolves.
- The module stays pure: its whole import graph uses one bare specifier (`node:crypto`),
  fixed by a static effect pin, and it has no CLI and writes nothing. Because the pilot
  subject's own graph is not pure, the `assessOwnerFrozenProjectContext` preflight runs in
  the test suite and in the caller; the receipt records that deferral.
- `npm run validate:se-stage-rules` now also syntax-checks and runs the generator and its
  14 tests.

## 2026-08-18 - Path-length budget policy (long paths stay off)

- Owner decision: Windows long-path support stays disabled because OneDrive, Explorer,
  Office and HWP break on long paths regardless of the registry switch; instead every
  new path must fit a budget. New `guild_hall/validate/path_length_policy.mjs`
  classifies repo-relative paths against: total <= 200 characters (13-char local
  checkout prefix + relative), directory segment <= 60, file stem <= 60, no slug
  repetition inside a slug folder, hashes in names <= 16 hex. `npm run
  validate:path-length` (changed scope) and `validate:path-length:tracked` (audit)
  are new; `guard:workmeta-write` applies the same budget to write targets.
  Tracked-scope baseline today: 60 violations (35 in one long calibration folder
  name, 22 slug repeats, 4 over 200, 3 long stems) - reported, not renamed. A
  read-only audit of the private planes found the real exposure outside the public
  repo (state stores with 64-hex directory names, old holds, backups, raw project
  mail attachments); the rename/move plan is a private report.

## 2026-08-18 - SE folder-tree 체계개발 machine fields and compiled variant JSON

- `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  (체계개발 / LIG 넥스원 / A) goes to `version: '0.8'`. Every task entry now
  carries the optional machine fields from
  `docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md` §3 —
  `artifact_type_id`, `evidence_level`, `source_refs` (source key + article or
  page locator), `verification_status`, and `applies_when` where the source
  verification records a condition. No existing key or value was changed;
  `generate_tree.py` ignores unknown keys, so folder generation is unchanged for
  the pre-existing slots.
- The 17 required items the 2026-08-18 source verification listed as missing were
  added as new task entries in their gates (SRR 49-55, PDR 109, CDR 144-146,
  TRR_DT 170, FCA_OT 196-197, PCA 225-227): P-TEMP, M&S 활용계획, 상호운용성
  확보계획, RAM 업무계획, WBS(EVM 조건부), 형상관리계획서, 기술검토회의 제출자료,
  등록부품활용계획, MRA, 사업중간점검 결과보고서, 핵심부품 공인시험 성적서, DT
  계획서·절차서, OT 계획서, FCA/PCA 계획서·점검표·QAR, 국방규격(안)·국방규격화
  연계표, 체계개발결과보고서·기술자료묶음, 양산 계약 전 제출자료. A profile-A
  dry-run generates 145 task folders instead of 128; no task was removed or
  renamed.
- Added `.registry/skills/se_foldertree_generate/codex/scripts/export_variant_json.py`
  and the tracked `codex/assets/compiled/*.json` it produces for all four bundled
  specs (schema `soulforge.se_foldertree_compiled_variant.v0`, deterministic:
  sorted keys, indent 2, LF, trailing newline). Each compiled file records the
  spec's sha256 so drift between markdown and JSON is detectable; specs without
  machine fields export `verification_status: unverified` per task.
- Added the `validate:se-foldertree-compiled` npm script
  (`export_variant_json.py --check`). It is intentionally not part of the
  aggregate `validate` chain. The script line uses `python`; that interpreter
  needs PyYAML (other Python entries in `package.json` use `python3`/`uv`).
- Skill `README.md`, `codex/SKILL.md`, and `codex/references/variants.md`
  document the compiled JSON, the machine fields, and the deterministic rules
  used to derive `evidence_level`/`applies_when`, including the vocabulary tokens
  that still need the `artifact_vocabulary.v0` owner decision (D44).
## 2026-08-18 - SE stage rule compiler (engine `stage_rules/`)

- Added `guild_hall/engineering_engine/stage_rules/`, the L3 compiler of
  `docs/architecture/workspace/SE_STAGE_RULE_SOURCE_MODEL_V0.md`.
  `artifact_vocabulary.mjs` owns the 75 shared `artifact_type_id` tokens with their
  family, display labels, and default capability (D44).
  `stage_rule_compiler.mjs` exposes `compileStageRules(request)`, which turns one
  compiled folder-tree variant (L1), one optional project overlay (L2), and a
  project document binding into a `se_stage_expected_artifact_policy_v0` instance,
  `soulforge.ax_se_stage_policy.v0` stage material, the Needs-policy stage and
  vocabulary declarations, a per-row mapping table, and a digest receipt.
  `mintEnginePolicyRef` reproduces the engine's `policy_ref` digest rule.
- Rules fixed by the slice: `regulation_mandated` maps to `present`,
  `guidebook_recommended` and `prime_contract` to `present_or_not_applicable`,
  `internal_management` and `unstated` to `optional_context`; an `unverified`,
  `unsupported`, `contradicted`, or absent verification status weakens a row to
  context and never strengthens one; an undeclared `applies_when` condition weakens
  to `present_or_not_applicable`; `not_applicable_default` sets
  `draftability_rule: not_applicable` on a `policy_rule` basis. Fixed internal
  folders, unmapped tasks, and optional-context rows stay in the gap-scan policy and
  the mapping table but are never emitted as engine requirements. An overlay may only
  `add`, `alias`, `mark_not_applicable`, and `condition`; `override_evidence` and any
  operation that would raise a rule's evidence level are refused (D45), as is an
  overlay whose `extends` does not name the compiled variant, and any gate code
  outside the eleven engine stage codes.
- Pure module: the whole import graph reaches `node:crypto` and nothing else, with no
  filesystem, clock, random, environment, or network use, pinned by a static test.
  Public-safe synthetic fixtures (invented business type, gates, tasks, overlay, and a
  negative overlay) live in `docs/architecture/workspace/examples/se_stage_rules/`.
  New command `npm run validate:se-stage-rules` runs both syntax checks and the
  17-test suite; the suite also pins the restated engine policy revision against the
  engine's own export and validates the emitted material through the engine's exported
  `buildAxSeAssessmentInput` and `assessAxSeProject`.
- Follow-up the same day (integration with the 체계개발 v0.8 compiled JSON): the
  overlay may add a `prime_contract` row beside a standard row that is only
  `optional_context` (buyer requirement; counted as `overlay_strengthened`), still
  refused where the standard already requires the artifact (D45); `applies_when`
  accepts a token or a list (all must hold); `verification_status` accepts
  `internal_management`; `added_by_verification` accepts the exporter's date
  stamp; the vocabulary gains the 26 extension tokens the v0.8 spec uses and
  recognises `prime_<...>` tokens as prime-contract items. First real compile:
  체계개발 variant + a 14-slot buyer overlay for one CDR stage yields 25 engine
  requirements (14 buyer slots: 5 standard-origin, 2 strengthened, 7 buyer-added;
  11 standard items the buyer did not request, 6 of them regulation-mandated).
- Layer split (same day, owner request that prime-contract items must not contaminate the
  common checklist): the skill exporter now also emits, from the same spec, a business-type
  common baseline (`compiled/system_dev_common_no_grade.json`, 131 tasks = every task whose
  evidence level is not `prime_contract`) and a prime-contractor overlay
  (`compiled/overlays/system_dev_lig_grade_a.prime.overlay.json`, 14 `add` ops citing the
  spec by exact ref); `validate:se-foldertree-compiled` guards all three. The compiler
  accepts the optional `derived_from` (variant) and `overlay_identity` (overlay) provenance
  fields, and no longer downgrades `prime_contract` rows on `unsupported/unverified`
  verification (contract items are expected to be unsupported by regulation texts; only
  `contradicted` weakens). Verified: base + prime overlay + project overlay compiles to the
  same 27 CDR requirements as the merged spec + project overlay (the two LIG contract items
  the earlier 25-count had treated as context are now enforced).
## 2026-08-18 - SE folder-tree variant source verification (skill reference)

- Added `.registry/skills/se_foldertree_generate/codex/references/source_verification_v0.md`
  (DRAFT, claim ceiling observed): a task-by-task comparison of the four bundled
  SE folder-tree variants (체계개발·탐색개발·선행연구·운용연구개발) against 13
  official DAPA/MND texts (방위사업관리규정 2026-08, 국방전력발전업무훈령,
  총수명주기관리 훈령, SE기반 기술검토회의 가이드북 2017/2024(OCR), SE 기반
  기술관리업무 실무지침서, 국방 표준화 업무 실무지침서, 시험평가 가이드북·실무가이드,
  RAM 업무지침, 현존전력 성능극대화 사업 업무지침, 선행연구 수행지침, 국방기술
  연구개발 업무처리지침). Each task is marked source_supported /
  partially_supported / unsupported / internal_management with citations, and
  every required item the variant lacks is listed; a business-type matrix and
  an 응용연구 variant proposal (v2) are included.
- Verdicts recorded: the 체계개발 variant's SRR~PCA spine is source-supported
  (17 required items missing, e.g. MRA, 사업중간점검, 국방규격화연계표, DT/OT
  계획서); the 탐색개발 and 선행연구 baselines borrow the 체계개발 naming and are
  marked for re-basing; 운용연구개발 needs track separation (경미 성능개량 vs
  현존전력); no variant existed for 응용연구. `SKILL.md` and the skill README
  point to the reference and label the three baselines "미검증 기본형" until
  re-based. This is a reference document, not a generator change: no bundled
  spec was modified and no folder is generated differently.
- The 13 source texts live in the common knowledge library (private plane) with
  an intake receipt; the machine-readable twin of the reference is a private
  metadata report. Repository-wide `npm run validate` path-policy still reports
  the 48 pre-existing tracked violations, unchanged.

## 2026-08-18 - Requirement coverage input builder (R2 preparation)

- Added `guild_hall/requirement_trace/coverage_input_builder.mjs`, the second
  pure function in the requirement-trace folder. It takes one requirement-id
  index (as produced by `guild_hall/rag/project_pdf_requirement_index.mjs` on
  the `kr_defense_spec_v0_1` profile), one Needs policy, and artifact-level
  presence observations, and returns the exact input
  `computeRequirementCoverage` accepts plus a provenance manifest and a
  payload-free receipt. `projectRequirementCoverageFromIndex(request)` does the
  same and runs R1 over the result in one call.
- Operational effect: the coverage sheet for one stage can now be produced from
  an index and a policy instead of hand-written requirement rows, and every
  refusal along the way is named. There is still no writer, no ledger row, no
  CLI, and no persistence surface — this is preparation for R2, not R2.
- Effects are zero by construction, exactly as in R1: no filesystem, clock,
  network, model, or persistence access anywhere in the module or in the R1 and
  kernel files it imports, and a regression test walks that import graph.
  Identifiers are minted as domain-separated sha256 digests of request values,
  so the same request always mints the same refs and a replay reproduces the
  same digests.
- Owner decisions D37 and D38 (both decided 2026-08-17) are expressed as
  structure rather than prose. D37: every admitted row is reported with
  `confirmation_state: 'observed_candidate'` and the receipt's `claim_ceiling`
  is `observed`; no path promotes a candidate to a confirmed requirement. D38:
  the Needs policy is an extension that must name the
  `stage_expected_artifact_policy` revision it extends by exact ref, and no new
  policy store is introduced. D39–D41 remain open; D40 in particular is why a
  duplicated requirement id holds *every* one of its rows with no winner, and
  why separator variants of one family stay distinct identifiers.
- Fail-closed in both directions. A row whose family, device code, or function
  code the policy cannot resolve is held with a reason instead of admitted, and
  admitted plus held always equals the index row count. A held row carries every
  reason that applied in `faults[]`, not only the headline one, and the receipt
  reports rows by headline reason (`counts.held`) separately from reasons by
  occurrence (`counts.held_faults`). A need or observation that cannot be bound
  to an emitted requirement is refused rather than emitted, because R1 silently
  ignores such a row and a silently ignored need is an invisible gap. By default
  a present artifact becomes an `unknown` observation
  (`presence_is_inconclusive`); the owner's "파일 있고 없고" basis is the opt-in
  `presence_satisfies_need` value, recorded in the receipt either way.
- Two refusals exist specifically to stop an empty sheet from reading as a clean
  one. A `document_binding` whose instants fall outside the query cutoffs is
  refused as `BINDING_INCOMPLETE`: R1 would replay no requirement at all, and a
  stage with nothing in it reports `READY_FOR_OWNER_REVIEW`. And an artifact
  observation is only restamped onto the current requirement revision when its
  `covered_document_ref` names the bound document's entity *and* revision — a
  matching revision label from a different document stays stale, because a label
  is not an identity. One build reads one document revision.
- `policy_ref.content_id` is the identity of the policy's declarations, not of
  the file that carried them: the identity block is excluded and every declared
  list is put in a canonical order before digesting. R1 hashes that value into
  every `cell_id`, so an order-sensitive digest would renumber a whole coverage
  sheet on an edit that declared nothing new. The receipt's
  `input_digests.needs_policy` still binds the policy exactly as supplied.
- `family_pattern` is owner-authored data that runs once per index row, so its
  shape is restricted rather than trusted: at most 256 characters, named groups
  `device` and `function` required, and no quantifier on a group.
- Added the public-safe synthetic fixture
  `docs/architecture/workspace/examples/project_requirement_trace/coverage_input_builder_synthetic_v0.json`
  (12 index rows over 2 in-scope device codes and 4 function codes, 6 admitted,
  6 held across all five hold reasons, 9 needs, 5 artifact observations, 2
  stages, plus the hand-derived expectations for both presence semantics). Every
  identifier, code, section, page, span, and digest in it is invented; it names
  no actual project, contract, organisation, document, or person and carries no
  document text. No actual project material was read for this change.
- Verification: `npm run validate:requirement-trace` now covers both modules and
  passes 44/44 (18 R1 + 26 builder). `npm run validate:canon` passes.
  `npm run validate` remains at its pre-existing state — the path-policy step
  still reports the same 48 tracked-scope violations it reported before this
  change, none of them in the files added here.
- authorship: implemented by Claude Opus 5; review is pending and no review
  verdict is claimed by this entry.
- Related paths: `guild_hall/requirement_trace/coverage_input_builder.mjs`,
  `guild_hall/requirement_trace/coverage_input_builder.test.mjs`,
  `guild_hall/requirement_trace/README.md`,
  `docs/architecture/workspace/examples/project_requirement_trace/coverage_input_builder_synthetic_v0.json`,
  `docs/architecture/workspace/examples/README.md`,
  `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`,
  `guild_hall/README.md`, and `package.json`.

## 2026-08-17 - Requirement coverage pure function (R1)

- Added `guild_hall/requirement_trace/`, a new `guild_hall` child that owns the
  deterministic coverage calculation of
  `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md` §5.3.
  `computeRequirementCoverage(input)` takes requirements, needs, coverage
  observations, risks, stages, and the two query cutoffs as plain data and
  returns one deep-frozen projection — coverage cells, requirement states,
  orphan observations, stage readiness, counts — with a payload-free receipt.
- Effects are zero by construction: no filesystem, clock, network, model,
  process, or persistence access anywhere in the module or in the kernel files it
  imports, and a regression test walks that import graph to keep it that way.
  Because the host clock is never read, `valid_at` and `known_at` are inputs, and
  a replay of the same rows at the same cutoffs reproduces the same digests.
- Fail-closed behaviour is the point of the slice: an unobserved need is
  `gap_unknown`, a ref naming no revision is refused as `AX_SE_REFERENCE_INVALID`
  rather than read as "latest", two sources disagreeing stay `gap_conflict`
  instead of folding into an absence or a coverage claim, an undeclared Needs set
  is `gap_unknown`, coverage of a superseded requirement revision is
  `gap_unknown` with reason `coverage_revision_stale`, and an observation
  covering a requirement outside the baseline is counted as
  `unexpected_observed` rather than deleted. Gate readiness produces only
  `UNKNOWN` / `HOLD` / `READY_FOR_OWNER_REVIEW` over `blocked` / `active`;
  `cleared` and `boss_clear_candidate` are never minted here.
- Controlled vocabularies (`GAP_TYPE`, `PRESENCE`, `RESOLUTION`,
  `AUTHORITY_FAMILIES`, `APPLICABILITY`, canonical serialisation, and the exact
  ref identity key) are imported from `guild_hall/engineering_engine/kernel/`
  rather than restated, so a value renamed there cannot silently diverge.
- Added the public-safe synthetic fixture
  `docs/architecture/workspace/examples/project_requirement_trace/requirement_coverage_synthetic_v0.json`
  (6 requirements, 8 needs, 7 observations, 1 risk, 2 stages, plus the
  hand-derived expected projection). It names no actual project, contract,
  organisation, or person and carries no document text. No actual project
  material was read for this change.
- Added the three §2.2 relations (`requirement_revision needs artifact_type`,
  `artifact_revision covers requirement_revision`,
  `artifact_revision verifies requirement_revision`) to
  `docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md` as an explicitly
  marked `canon_candidate` subsection, kept separate from the registered
  relations above it.
- Owner decisions D37–D41 remain open. They appear here only as input contract
  and are named as candidates in `guild_hall/requirement_trace/README.md`; this
  change settles none of them.
- Scope `HOLD`: the JSONL ledger writers, the `projections/rtm/` generation
  materialiser, the engine packet emitter, the ERP read model, and any actual
  project requirement data. Those are R2–R4 and no writer, persistence surface,
  or activation is added by this entry.
- Verification: `npm run validate:requirement-trace` passes 18/18.
  `npm run validate` remains at its pre-existing state — the path-policy step
  still reports the same 48 tracked-scope violations it reported before this
  change, none of them in the files added here.
- authorship: implemented by Claude Opus 5; review by Claude Fable 5 is pending
  and no review verdict is claimed by this entry.
- Related paths: `guild_hall/requirement_trace/requirement_coverage.mjs`,
  `guild_hall/requirement_trace/requirement_coverage.test.mjs`,
  `guild_hall/requirement_trace/README.md`,
  `docs/architecture/workspace/examples/project_requirement_trace/requirement_coverage_synthetic_v0.json`,
  `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`,
  `docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md`, and
  `guild_hall/README.md`.

## 2026-08-17 - Requirement index profile `kr_defense_spec_v0_1`

- Added a second seam-owned recognition profile, `kr_defense_spec_v0_1`, to
  `guild_hall/rag/project_pdf_requirement_index.mjs` and to
  `REQUIREMENT_INDEX_PROFILES`. It answers the three defects the first actual
  measurement exposed. `kr_defense_spec_v0` is unchanged in behaviour, index
  keys, and row shape, and every value outside the closed profile list is still
  one `REQUEST_INVALID` refusal settled before admission opens a file.
- Title: `v0_1` reads a bracket group only after the `요구사양` label inside the
  block, so a bracket standing in front of that label is not a candidate; a
  candidate of 1–4 plain ASCII characters is a unit or a symbol such as `[mm]` or
  `[kg]` and is stepped over for the next candidate; with no qualifying candidate
  the title is null, and a qualifying candidate that could be a secret or is past
  the 120-character bound is still dropped to null as in `v0`.
- Diagnostics: the `v0_1` index adds `mentions_by_id` (identifier to the sorted,
  deduplicated page numbers of its label-less occurrences), `malformed_labels`
  (page number and UTF-16 span alone for every identifier label that bound no
  well-formed identifier), and a per-row `id_family` (the identifier without its
  trailing `-`/`_` ordinal, so `R-TB_PETB-HMR-001` rolls up under
  `R-TB_PETB-HMR`). None of them carries page text.
- Unchanged on both profiles: the identifier pattern, the 64-code-unit label gap,
  the block boundary, every bound, the payload-free receipt shape and its
  `counts`, the single admission call, and zero filesystem writes, persistence,
  network, model, RAG-index, Wiki, Engineering Engine, ERP, and TaskDriver
  effects.
- Verification: `npm run validate:project-pdf-requirement-index` passes 12/12 (8
  before this change; the 4 new tests cover the title rule against the same pinned
  document under both profiles, the mention page roll-up, the malformed label
  spans, and the closed `v0` shape). `npm run validate:project-pdf-rag-tracer`
  passes 10/10, unchanged. No actual project PDF was read: every fixture is the
  synthetic public PDF the existing tests already build.
- Operational impact: none. This stays a read-only candidate seam at the
  `observed` claim ceiling with no CLI and no process entrypoint. `HOLD`: actual
  project requirement indexing, RTM/coverage claims, caller-supplied profiles and
  any profile beyond these two, persistence, batching, and any activation.
- authorship: implemented by Claude Opus 5; review by Claude Fable 5 is pending
  and no review verdict is claimed by this entry.
- Related paths: `guild_hall/rag/project_pdf_requirement_index.mjs`,
  `guild_hall/rag/project_pdf_requirement_index.test.mjs`, and
  `guild_hall/rag/README.md`.

## 2026-08-17 - Board classic Engine view 33-module 정합과 CHANGELOG 표기 정정

- Team Operations Board의 classic Engine 뷰가 현재 Engineering Engine topology를
  전부 소비하도록 lane/shape 매핑을 33 모듈로 맞췄다. AX·SE subject 4개
  (`ax_se_project_assessment`, `ax_se_project_role_roster`,
  `ax_se_project_role_bound_assessment`, `ax_se_project_context_pilot`)를 기존
  subject run과 같은 소비자 어휘로 OUTPUT lane에 배치했고, lane은 다섯 개
  그대로다. 이전에는 lane 매핑이 29개에만 있어 뷰 전체가
  `engineering_engine_lane_coverage_mismatch`로 닫혀 있었다.
- 운영 영향: Board의 Engine 구조 화면이 다시 열린다. 이 변경은 선언 구조만
  다루며 runtime 관측, 전달 영수증, W1 health, 복구 실행 권한을 만들지 않는다.
  Engine runtime은 계속 `UNKNOWN`이고 runtime/repair authority는 `false`다.
- classic 뷰 테스트의 기대 모듈·간선 수를 상수 대신 tracked
  `federated_topology.v1.json`의 engineering_engine slice에서 유도하도록 바꾸고,
  추적 artifact가 33 모듈·151 간선이라는 사실만 한 자리에서 고정했다. 신규 4개
  모듈의 lane·shape 배치 회귀도 추가했다.
- `guild_hall/engineering_engine/topology/phase_1_integration_receipt.json`은
  25 모듈/105 간선 시점 그대로 두었다. `tools/phase_1_integration_check.mjs`는
  receipt를 파일로 쓰지 않고 stdout으로만 내며, 재실행이 결정론적이지 않고
  (`run_id`가 실행 시각에서 파생) `--scratch` 쓰기와 tracked tree 밖 frozen
  phase_1_0 bundle/oracle을 요구한다. 이 receipt는 `engine_manifest.sha256`
  대상에서 제외되어 있고 어떤 validator도 읽지 않으므로 stale 상태가 검증을
  깨지 않는다. 갱신은 bundle 경로를 가진 실행자가 별도로 수행할 일로 남긴다.
- 2026-08-16 `PDF launch authoring` 항목의 `Revision: working.`을 다른 항목과
  같은 문구로 정정했고, 같은 날짜 federation 표기 `71 nodes and 198 edges`에
  tracked artifact summary가 `edge_count: 199`라는 정정 주석을 달았다. 과거 항목
  본문은 그대로 두었다.
- authorship: 구현과 이 항목은 Claude Opus 5가 작성했고 Claude Fable 5 검토는
  예정 상태다. 포괄 준비 완료 판정이 아니다.
- 관련 경로: `ui-workspace/apps/team-ops-board/src/core/topology-engine-classic-view.mjs`,
  같은 폴더의 `topology-engine-classic-view.test.mjs`,
  `ui-workspace/apps/team-ops-board/README.md`,
  `guild_hall/watchtower/topology/federated_topology.v1.json`(읽기 전용),
  `guild_hall/engineering_engine/topology/engine_topology.json`(읽기 전용).

## 2026-08-17 - Feature-OFF project PDF requirement identifier index seam

- First actual measurement (private run, pending Owner ratification): the seam ran
  once on the pinned KVDS 요구사양서 launch and returned 118 requirement identifiers
  over 33 of 42 pages (TBC 19 / TBD 9, 4 duplicate ids, 18 label-less mentions,
  18 label-only candidates); a transient admission HOLD preceded the PASS. Counts
  only; the index body stays in the project plane. Profile v0.1 candidates: prefer
  the bracket after 요구사양, ignore short unit brackets, classify mention-only ids.

- Added `guild_hall/rag/project_pdf_requirement_index.mjs`, an import-only
  Feature-OFF seam that turns exactly one admitted project PDF into one
  deterministic requirement identifier index plus one payload-free receipt. Its
  request is one closed own-data object carrying exactly `launchPath`,
  `expectedLaunchSha256`, and `profileId`; the existing project PDF admission
  seam is called exactly once and stays the only thing that decides admission and
  touches the launch file and the document bytes.
- Fixed the recognition contract to one profile, `kr_defense_spec_v0`, exported
  through `REQUIREMENT_INDEX_PROFILES`. Recognition is regular-expression only
  over the returned page text: the `식별자` label binds the first identifier
  token inside a fixed gap, an unlabelled identifier stays a mention, a label
  with no well-formed identifier behind it is counted as a malformed candidate,
  and a block runs from its identifier to the next identifier on the same page or
  to the end of that page. No identifier pattern, label gap, row cap, or title
  rule is reachable from the caller.
- Kept the index body-free. A row carries the identifier, the nearest preceding
  section number, an optional bracket title inside the 120-character bound, the
  page number, the page-local UTF-16 span, the `TBC`/`TBD` marks, the block
  character count, and a digest of the block text. A bracket title that could be
  a secret or is past the bound is dropped to null, duplicates are listed under
  `duplicate_ids`, mention-only identifiers under `mention_only_ids`, and the
  receipt reduces the sorted identifier list to one domain-separated
  `ids_sha256`.
- Operational impact: this is a read-only candidate seam at the `observed` claim
  ceiling with zero filesystem writes, persistence, network, model, RAG-index,
  Wiki, Engineering Engine, ERP, and TaskDriver effects and no CLI or process
  entrypoint. `HOLD`: actual project execution, RTM/coverage claims and Engine
  policy-requirement packet supply from an index, additional or caller-supplied
  profiles, persistence, batching and multi-document runs, and any activation.
- Validation: `npm run validate:project-pdf-requirement-index` runs the syntax
  check plus 8 new `node --test` cases (happy path over a synthetic two-page
  Korean spec fixture, empty document, deterministic replay, request refusal,
  admission refusal, secret/over-long title drop, planted-marker payload
  freedom, and the read-only source pin); all 8 pass, and the existing
  `validate:project-pdf-rag-tracer` 10 cases and
  `project_pdf_admission.test.mjs` 16 cases still pass unchanged.
- authorship: this slice was implemented by Claude Opus 5; independent Claude
  Fable 5 review is pending and no readiness verdict is claimed here.
- Related paths: `guild_hall/rag/project_pdf_requirement_index.mjs`,
  `guild_hall/rag/project_pdf_requirement_index.test.mjs`,
  `guild_hall/rag/README.md` (`Source Extraction Tooling Standard`),
  `package.json`, and
  `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`.

## 2026-08-17 - Requirement trace model draft, plan delta log, master plan CURRENT sync

- Added `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`
  (`DRAFT / canon_candidate / claim_ceiling: observed`): the answer to the
  Owner question "how should per-project context be managed — memory or graph?".
  Decision: append-only bitemporal fact ledgers (source-local owners kept) +
  deterministically replayable typed graph/RTM projections + a separate
  accepted-generation gate + thin sourcebound cards; LLM/vector memory stays a
  candidate layer; no Graph DB now (explicit triggers listed). It extends
  `PROJECT_CONTEXT_GRAPH_MODEL_V0.md` without changing owners, writers, or
  roots, adds three new relation types for the relation matrix, RTM coverage
  pseudocode reusing the engine vocabulary, a 4-week R1~R4 plan, and proposed
  Owner decisions D37~D41. Registered in `docs/architecture/workspace/README.md`.
- Added a "계획 대비 변경 기록 (plan delta log)" section to
  `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` so plan-vs-built
  differences stay traceable (first rows: M2-2 first actual pilot, PDF
  admission+tracer actual run, ERP MCP feature-OFF extensions, memory-structure
  design draft, master plan sync).
- Master plan (`TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`) CURRENT sync:
  latest-observation cell now carries the 2026-08-17 state ahead of the 07-31
  text, the 2026-07-27 file inventory row is tagged `HISTORICAL_SUPERSEDED`,
  the 맥락·세계수·할일 row records the accepted M2-2 candidate and the first
  actual KVDS pilot (command PASS / assessment UNKNOWN), C09A evidence text no
  longer claims `task_engine_inventory.mjs` is absent, and the remaining
  operating gates list P6 TaskIntent between P5 and TaskDriver promotion.
- Operational impact: documentation only; no code, runtime, binding, or
  writer change. Private run receipts referenced by id only.
- Owner idea (2026-08-17) registered as roadmap next-candidate 26 and design
  extension §2.1A: per-artifact content checkers (format, missing sections,
  requirement-ID coverage, logical consistency) whose scores attach to
  `CoverageObservation.checker_scores[]` with an automatic-score ceiling and
  human-confirmed remainder; presence observation and quality score stay
  separate axes.
- authorship: design draft by Claude Opus 5 (subagent), structural review and
  integration by Claude Fable 5.
- Revision: the Git commit containing this entry owns the exact revision.

## 2026-08-17 - ERP MCP feature-OFF query extensions: agenda no-due bucket, reviewer read-only surfaces, audit token reference

- Added three independently flagged read-only extensions to the dev-ERP MCP
  pilot. Every flag is unset by default, and with the flags off the existing
  `/api/mcp/*` responses, the sidecar's eight-tool list, and the `mcp_tool_call`
  audit event contents are unchanged.
- `DEV_ERP_MCP_AGENDA_NO_DUE=1` adds a `no_due_open` bucket to
  `erp_get_my_agenda`: the caller's own open items that carry no due date,
  scoped to assignee identities, excluding `done`/`archived`/`unclassified`,
  bounded to 200 rows. The unassigned shared pool is not exposed and legacy
  status values are used as-is.
- `DEV_ERP_MCP_REVIEW_READ=1` opens two reviewer read paths: a cookie
  `GET /api/items/work-sessions` limited to the item's assignee or an admin, and
  a bearer `GET /api/mcp/reviews/pending` limited to admins. Both return bounded
  summaries only; proposal `payload_json`, raw mail bodies, absolute paths, and
  token material are never included. The sidecar registers the matching
  read-only `erp_list_pending_reviews` tool only when `ERP_MCP_REVIEW_TOOLS=1`.
  No approve, reject, status-change, or assignment tool or route was added;
  those stay human cookie-UI authority.
- `DEV_ERP_MCP_AUDIT_TOKEN_REF=1` records which credential made an MCP call by
  appending an opaque `token=<token id>` to the audit note and an
  `erp_mcp_access_token:<id>` used-ref. Plaintext tokens and token hashes are
  still never written, the ticket-authenticated upload path records
  `token=ticket`, and `actor_kind` stays `human`.
- Operational impact: no DDL or schema change, no runtime environment or binding
  change, and no writer or route activation. Enabling any flag in operations
  remains gated on D28/D29 and owner approval, so this slice is not a
  production-ready or team-ready claim.
- Verification: `node --test ui-workspace/apps/dev-erp/test/erp_mcp_service.test.mjs
  ui-workspace/apps/dev-erp/test/erp_mcp_server.test.mjs` passes 13/13 (8 before
  this change) and `npm run validate:dev-erp-mcp` passes 44/44 (43 before).
- authorship: implemented by Claude Opus 5; review by Claude Fable 5 is pending
  and no review verdict is claimed by this entry.
- Related paths: `ui-workspace/apps/dev-erp/src/erp_mcp_service.mjs`,
  `ui-workspace/apps/dev-erp/server.mjs`,
  `ui-workspace/apps/dev-erp-mcp/src/tools.mjs`,
  `ui-workspace/apps/dev-erp-mcp/server.mjs`,
  `ui-workspace/apps/dev-erp/docs/slices/ERP-MCP-V0.md`, and
  `ui-workspace/apps/dev-erp-mcp/README.md`.
- Revision: the Git commit containing this entry owns the exact revision.

## 2026-08-16 - M2 phase order correction and M2-3A Knowledge→Context gate crosswalk

- Fixed the authoritative M2 slice order so no surface is built ahead of its
  gate: M2-2 observed ephemeral pilot → P4/M2-3 project-local deterministic
  persistent RAG + thin Wiki → P5 accepted context generation/freshness →
  P6 TaskIntent. P4/M2-3 may attach only after the M2-2 observed ephemeral
  pilot, and neither the RAG surface nor the thin Wiki supplies context without
  a receipt pinning the exact source revision. P5 closes on top of those exact
  revision receipts; P6 starts only after accepted context generation is closed.
- Recorded the `M2-3A Knowledge→Context Gate Crosswalk` boundary for P5
  accepted-generation minimums: exactly one bound project, the complete exact
  source/knowledge revision set including allowlisted common revisions,
  `valid_at`/`known_at` stamps plus the generation's own known-at cutoff,
  declared coverage with explicit gap / `unclassified` / `held_conflict` list,
  predecessor and supersession refs, recorded reviewer state, and the
  authorized writer epoch. A missing minimum keeps the generation `HOLD` and
  does not degrade into a partial accepted generation.
- Recorded the separation of the two knowledge planes. Wiki/canon is reviewed
  knowledge owned outside project context and enters a project view only
  through an explicit exact revision allowlist; being retrieved or cited never
  makes it a project fact. `memory_candidate` is a project-local reviewed-reuse
  proposal and is not Wiki, not canon, and not accepted knowledge. Movement
  between the two surfaces stays a separate reviewed promotion step.
- Operational impact: this is a documentation-only phase-order correction;
  no implementation, writer, index, runtime binding, or activation is claimed.
  LLM synthesis, live-current claims, actual project writes, and cross-project
  body retrieval remain `HOLD`.
- authorship: this entry was written by Claude Opus 5; Fable 5 review is
  `ACCEPT` for the frozen text only and is not a comprehensive readiness verdict.
- Related paths: `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`,
  `docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md`
  (`M2-3A Knowledge→Context Gate Crosswalk`), and
  `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`
  (authoritative P4→P5→P6 phase table).
- Revision: the Git commit containing this entry owns the exact revision.

## 2026-08-16 - Board runtime relaunch opportunity and contained collector failures

- Separated scheduled-controller preflight timing from local control timing.
  The Git common-directory helper can legitimately take longer than the former
  shared 3-second limit under the sanitized Scheduled Task environment, so Git
  and Tailscale preflight helpers now receive 15 seconds while local control
  requests remain bounded at 3 seconds. A failure before the Board child starts
  now emits a sanitized `controller_preflight` termination receipt and exits
  fail-closed; this source change does not itself claim a successful deployment.
- Normalized Windows `0x800710E0` to the existing public `running` result only
  for an inspected task that is simultaneously `Running` and exact
  `IgnoreNew`. This preserves expected five-minute duplicate suppression
  without turning the same refusal code green in any other task context.
- Contained every Team Operations Board usage/quota companion rejection at the
  companion boundary. A collector failure now ends as a fail-closed hold with an
  existing or minimal sanitized code instead of a process-level unhandled
  rejection that the runtime deliberately exits on. A failed lane receipt write
  no longer aborts the sweep or falsifies a sibling lane.
- Extended the metadata-only termination receipt with bounded sanitized Board
  child exit evidence: numeric exit code, a closed signal class, and an existing
  safe failure class. The schema version is unchanged and receipts written
  before these fields stay valid; no identifier, path, stack, or raw message is
  persisted, and child output streams remain ignored.
- Changed the single existing Windows Scheduled Task definition to carry exactly
  one repeating five-minute time trigger as an independent relaunch opportunity,
  registered with a future start boundary and an omitted repetition duration.
  The recorded desired state stays authoritative and is the whole of the
  guarantee: `stopped`, `stop_requested`, or `recovery_needed` intent makes a
  tick a no-op, while `running` intent permits a gated relaunch after a
  controller exit and, at a later trigger opportunity, after a reboot.
  `desired_state` is the stored intent; the `recovery_needed` reported by
  `task-status` is a computed `runtime_health` observation and does not by
  itself stop a relaunch. `IgnoreNew` discards a tick while the Board is
  healthy, and `task-register` records the `stopped` intent before the task
  exists so registration never starts the Board. Limited privilege,
  current-user/no stored password, hidden launcher, and loopback-only remain
  unchanged, and no service, watchdog, second task, or UI repair button was
  added. A task registered before the trigger is reported as `definition_hold`,
  refuses `task-run`, and stays removable for re-registration.
- Added deterministic regressions for rejected usage and quota sweeps, timer
  continuation, a desired-stopped scheduled invocation, the repeating trigger
  definition and its validation, and the safe termination fields, including
  no-leakage assertions. No provider call, network listener, Task Scheduler
  mutation, or runtime restart occurs in tests.
## 2026-08-16 - Feature-OFF 프로젝트 PDF launch authoring helper

- `guild_hall/rag/project_pdf_launch_authoring.mjs`는 public-synthetic
  feature-OFF import 전용 2단계 helper다. prepare는 root metadata만 읽어
  non-runnable private candidate를 만들며 launch bytes를 담지 않는다.
- seal은 외부에서 공급된 content-addressed seal을 exact challenge와 launch에만
  correlate하고, canonical launch bytes와 payload-free zero-write receipt를
  돌려준다.
- issuer identity, 독립 provenance, Owner 승인은 주장하지 않는다.
  `createOwnerSeal`은 없으며 hand-crafted launch가 admission에 직접 도달하는
  경로도 막지 못한다. 실제 Owner·trusted registry·key·활성화는 `HOLD`다.
- 모듈과 테스트는 `guild_hall/rag/project_pdf_launch_authoring.mjs`,
  `guild_hall/rag/project_pdf_launch_authoring.test.mjs`이며, 전용 검증
  스크립트 `validate:project-pdf-launch-authoring`을 추가하고 `validate:rag`에는
  syntax check만 연결했다.
- 대상 테스트 7/7 통과이고, Fable 5 Level-2 검토는 frozen module/test 해시
  `020ebc42c561c4e7ba6c3dacb91259c2968562723e702bff0ac5c83df4119e4e`,
  `262286ee011ee8b6db2f064db7ee50c9470024f3343e8df3e2453152686b7f67`에 한해
  ACCEPT다. 포괄 준비 완료 판정은 아니다.
- authorship: 구현과 테스트, 이 통합 텍스트는 Claude Opus 5가 작성했고 Fable이
  검토했으며 controller가 검증했다.
- Revision: the Git commit containing this entry owns the exact revision.

## 2026-08-16 - Feature-OFF 프로젝트 PDF RAG tracer

- `guild_hall/rag/project_pdf_rag_tracer.mjs`는 public-synthetic feature-OFF
  seam으로, admitted PDF 1건에 대해 질문 1건을 in-memory lexical 방식으로만
  답한다.
- pinned admission을 1회 호출하고, 그 결과만으로 ephemeral page-aware corpus
  1개를 만들며, 고정 evidence 3 / per-source 3 / advisory 없음으로 corpus
  search를 1회 호출한다.
- 답변은 exact citation을 가진 deterministic extractive 결과이거나 citation 없는
  고정 no-hit 문장이다.
- CLI, persistence, model, network, RAG index, Wiki, downstream authority는
  없다.
- 전용 검증 스크립트 `validate:project-pdf-rag-tracer`를 추가하고 `validate:rag`
  에는 syntax check만 연결했다.
- authorship: 구현과 테스트, 이 통합 텍스트는 Claude Opus 5가 작성했고
  controller가 검증했다.
- Fable Level-2 검토는 frozen module/test 해시
  `ee0b59d72c5d585f856e97349dc7dde18f44a41991f0d98414bcbafb51f8452b`,
  `da8053c96b354dba0198eb66b278781e9fce5a10d5664bf9203ab5f81363cf81`에 한해
  ACCEPT다. 포괄 준비 완료 판정은 아니다.
- `HOLD`: 실제 프로젝트·live·제품·persistent 사용, accepted-context 및
  operational 활성화.

## 2026-08-16 - Feature-OFF 프로젝트 PDF admitted 후보 seam

- `guild_hall/rag/project_pdf_admission.mjs`는 public-synthetic feature-OFF
  admitted PDF 후보만 만든다. pinned launch → 변경 없는 validation_only Project
  Knowledge View → 별도로 결속된 document read grant → stable-open된 exact PDF
  revision 1건 → 고정 extractor 1회 순서로만 진행하며 persistence, network,
  model, RAG index, Wiki, Engine, ERP, TaskDriver effect와 authority는 0이다.
- CLI `PASS`는 명령 gate일 뿐이며 source truth, canon, 승인, 활성화가 아니다.
- 전용 검증 스크립트 `validate:project-pdf-admission`을 추가하고 `validate:rag`
  에는 syntax check만 연결했다.
- controller 관찰 기준으로 대상 테스트 16/16 통과, 인접 suite 53 pass / 0 fail /
  1 POSIX-only skip이다. 그 밖의 광범위 suite 결과는 주장하지 않는다.
- Fable Level-2 검토는 frozen module/test 해시
  `90d76972f103e0dabf4c39059a018c0f0c52e916569d4644826846ff01bf32da`,
  `697f81effb8a482d06e52321b182283bcf9e830fad8bc31d2020496c7423daa3`에 한해
  ACCEPT다. 포괄 준비 완료 판정은 아니다.
- authorship: 구현과 테스트, 이 통합 텍스트는 Claude Opus 5가 작성했고 Fable이
  검토했으며 controller가 적용·검증했다.
- `HOLD`: 실제 프로젝트·live·제품 사용, 활성화, batch 처리, persistence,
  RAG/Wiki/KVDS, Engine/ERP/TaskDriver 연동.

## 2026-08-15 - Feature-OFF 프로젝트 PDF 후보 추출 seam

- `guild_hall/rag/project_document_ingest.mjs`에 public-synthetic 단일 파일 후보 전용
  seam을 추가했다. 실제 KVDS read, ingest, promotion은 하지 않는다.
- 구현 authorship은 Claude Opus 5 단독이며 test-first RED→GREEN으로 진행했다.
- Fable/controller 검토가 Proxy/request 경계 blocker와 fatal UTF-8 stdout decoding
  blocker를 독립적으로 재현했고 그 지적은 반영했다. bounded stdin은 Fable 지적이
  아니라 같은 정정 슬라이스의 builder·controller 하드닝과 함께 추가했다. 이는 포괄
  승인이나 준비 완료 판정이 아니다.
- 전용 스크립트 `validate:project-document-ingest`를 추가하고 `validate:rag`에는
  syntax check만 연결했다.

## 2026-08-15 - Usage Meter Antigravity Windows UIA quota 입력 수용

- Usage Meter provider quota snapshot 공개 함수가 닫힌 `antigravity_windows_uia_receipt`
  입력을 기존 Antigravity expected 5시간/주간 limit 계약 그대로 수용한다.
- 등록되지 않은 source는 그대로 fail-closed로 거부되며, 수용된 입력도 digest 결속을
  유지한다.
- TDD 근거: 대상 테스트 8/8 통과, 인접 quota suite 31/31 통과. 그 밖의 무관한 광범위
  suite 결과는 주장하지 않는다.
- Fable read-only 검토가 이 제한 범위 변경을 수용했다. live quota 정확도, 운영 준비
  완료, credential·private·계정 상태 읽기는 주장하지 않는다.

## 2026-08-15 - 업무메일 대용량 Google Drive 링크 전송 규칙

- `MAIL_SEND_STYLE_POLICY_V0.md`의 첨부 선별 규칙 다음에 대용량 첨부파일 및 Google Drive 링크 전송 규칙을 추가했다.
- 약 20MB 이하의 일반 첨부 우선, 초과 또는 반송 위험 시 전용 공유 폴더의 정확한 파일별 링크 사용, 뷰어 권한, 초안 단계 업로드 금지, 기밀자료 확인 중단선, 프로젝트 원본 비변경 원칙을 고정했다.
- 기존 수신·참조·BCC·서명·보안문구 규칙과 외부 발송 승인 경계는 변경하지 않았다.

## 2026-08-15 - AX Context-to-Execution 북극성과 Plugin 경계 재확인

- Revision: 이 항목을 포함한 Git commit이 exact revision을 소유한다.
- 무엇이 바뀌었는가: 운영 비전과 개발 로드맵에 `관찰→Context/세계수→공통·프로젝트
  SE 지식→AX·SE 판단→승인된 Task·배정→권한 있는 local work→결과·evidence 제출→독립
  검증·승격→feedback` 장기 폐루프를 Owner 재확인으로 기록했다.
- Plugin 영향: Managed Plugin/App은 비권위 commodity adapter를 대체·가속하고, Soulforge
  worker Plugin은 accepted assignment/WorkSession client binding, 외부 agent 도구는 runtime
  선택지만 소유한다. MCP는 query/control/result/evidence/receipt interface이며 세계수·판단·
  Task state·승인·공식 완료 owner가 아니다. core continuity를 확인하는 `Plugin deletion test`를
  고정했다.
- 조직 운영 영향: AI 기반시스템 회사 CEO가 데일리 AI 기술을
  `REPLACE|ACCELERATE|COMPLEMENT|WATCH|HOLD|REJECT`로 분류하고 authority, provenance,
  security, 총 통합비용, exit 경로, Soulforge 검증 근거와 제품 owner를 대조해 우선순위를
  재배치하는 read-only portfolio 판단 경계를 추가했다.
- 활성화 영향: Plugin 설치, live source/action, TASK·canon·route 생성, P5→P8 순서 변경,
  ERP write, `_workspaces` authority 재분류를 승인하지 않는다. 현재 M2 판단 subsystem과
  향후 assignment→local work→custody→review/promotion→accepted history vertical의 경계를
  유지한다.
- 관련 경로: `docs/architecture/foundation/VISION_AND_GOALS.md`,
  `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`,
  `docs/architecture/guild_hall/DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`.

## 2026-08-15 - Bounded topology recovery supervision

- Deepened the existing five-minute Watchtower recovery companion with
  per-node retry memory, fixed 5m/15m/60m backoff, a three-failure circuit
  breaker, one half-open retry after 60 minutes, and verified-success reset.
- Added bounded sanitized recovery history and a separate supervisor attempt
  receipt so a failed cycle is visible while the last valid cycle and retry
  state remain intact. Invalid history, supervision state, or fresh Watchtower
  evidence fails closed and suppresses repair.
- Extended the Board's existing read-only recovery inspector with last attempt,
  next retry, consecutive failure, last verified repair, circuit state, and
  recent history. Running tasks are never restarted merely because evidence is
  stale; provider login, credentials, deletion, routes, external send, and
  topology health/color promotion remain outside recovery authority.

## 2026-08-14 - Topology connection diagnostics for non-green nodes

- Added a `진단` action to the System Topology selected-node inspector for the
  exact allowlisted non-green source and consumer nodes. It reports 계정 연결,
  로컬 수집·소스, the last safe observation, and the evidence scope with its
  explicit limits, in plain Korean.
- Derived the result from a deterministic pure projection over snapshots the
  Board already holds: the existing loopback read-only topology-health
  projection plus the existing sanitized provider-limit and Antigravity quota
  projections. No server route, provider RPC, external account call, credential
  read, or automation surface was added.
- Kept the lens separate from health: only a currently fresh provider-issued
  quota receipt reaches `확인됨` and only a provider-scope health failure
  reaches `실패 신호`. Local collector, session-source, and producer evidence
  prove local availability only, unknown or malformed node IDs fail closed, and
  topology health, shapes, colors, layout, and edge meaning are unchanged.

## 2026-08-14 - Persistent collapsible Board panels

- Added accessible `접기` / `펼치기` controls to the major Fleet, organization,
  work/history, and system-topology panels, including individual enrolled work
  groups. The first visit remains fully expanded.
- Persisted only allowlisted presentation IDs in browser-local storage so a
  refresh or live data update keeps the chosen layout. Invalid storage fails
  open and no collector, snapshot, task, runtime, or repair behavior changes.

## 2026-08-14 - In-context Watchtower diagnosis and recovery visibility

- Added `진단` and `조치 내역` controls to every non-green Watchtower tracking
  row. Diagnosis forces the existing read-only W1 probe; recovery history shows
  the latest sanitized automatic recovery outcome without requiring a separate
  Codex question.
- Added a loopback GET-only recovery projection that exposes only bounded node,
  action, attempt, verification, and escalation identifiers. It does not run a
  repair, add browser-side mutation authority, or expose local paths or payloads.

## 2026-08-14 - Stable local Antigravity quota observation

- Replaced the unreliable screen-accessibility quota path with the running
  Antigravity language server's loopback-only, empty-body quota summary behind
  the Board's exact read-only runtime gate. Only sanitized group labels,
  weekly/five-hour remaining percentages, and reset times are retained.
- Moved the ignored last-good quota cache to the stable Owner project root so a
  Board worktree switch cannot silently reset the displayed quota. Local read
  failures now retain stale last-good evidence or return an explicit source
  unavailable/app-absent status instead of `null`.
- Added the installed Antigravity CLI's exact print-mode `/usage` result as a
  fail-closed fallback when the current app rejects its loopback quota method.
  Only the exact regular-file installation, four source-observed model/window
  rows, and plausible source-window reset times are accepted; the child
  runs only while Antigravity is already observed running, receives a bounded
  environment, and never stores or serves raw CLI output.
- Removed the UI Automation reader and its runtime flag. The official
  interactive `/usage` (`/quota`) surface remains the manual cross-check; no
  app startup, screen/OCR access, credential-content access, or runtime/repair
  authority was added.

## 2026-08-14 - Antigravity local collector heartbeat

- Added the existing read-only `collect-antigravity` path to the Board-owned five-minute
  AI usage companion and published a separate sanitized Antigravity collector heartbeat.
- Connected only collector execution health to Watchtower. Antigravity provider/login
  availability and both usage data edges remain unproven, and no app, RPC, credential,
  route, or repair authority was added.
- Antigravity child output is schema-checked; any reported collection issue fails the
  collector heartbeat closed while a clean zero-database no-op remains healthy idle.

## 2026-08-14 - Separate collector health from bounded mail backlog

- Split Hiworks collector liveness from per-message retry delivery state. A
  completed POP3/Gmail cycle now leaves the scheduled collector healthy while
  hashed failed items remain visibly `retrying` or `held`, with their bounded
  count and next attempt time; no POP3 deletion, acknowledgement, or silent
  skip was added.
- Added a Board advisory queue for healthy collectors with retry work and
  renamed the gray summary to evidence-unconnected with separate structural,
  provider-evidence, and on-demand counts. Missing independent evidence remains
  fail-closed instead of being painted green.
- Replaced the ambiguous edge `declared only` total with separate counts for
  missing receipt channels, state-observation-only controls, and structural
  relations; none of those categories claims live delivery.

## 2026-08-14 - Independent topology evidence and bounded local recovery

- Added independent sanitized evidence receipts for the Watchtower execution
  contract, five-field metadata ledgers, and `_workmeta` payload policy so the
  three formerly structural-only local nodes can be judged without circular
  self-health or inferred provider state.
- Added a five-minute Board companion that may start only an allowlisted local
  scheduled task with an exact action digest and successful independent
  pre/post checks. External providers, credentials, deletion, acknowledgement,
  uploads, route changes, external sends, partial mail backlogs, on-demand
  Antigravity, and the feature-OFF timeline remain non-automatic.
- Extended the canonical Watchtower validator and Board runtime lifecycle tests
  so missing, invalid, stale, and failed evidence remain fail-closed and the
  companion stops with the Board worker.

## 2026-08-13 - Topology non-green tracking and safe mail retry quarantine

- Added a sanitized tracking contract for every non-green Watchtower W1 node
  and a compact Board queue ordered by severity with the next evidence due time. Watchtower self, five-field,
  and `_workmeta` remain explicitly non-green until separately owned evidence
  exists; node health still cannot prove edge delivery or repair authority.
- Added a feature-off recovery coordinator with four independent dimensions
  (liveness, connection, outcome, backlog). Observe mode is read-only and
  safe-repair requires an injected allowlist, executor, and independent
  verifier; credential, deletion, acknowledgement, route, account, upload, and
  external-send actions are denied.
- Kept repeatedly failing Hiworks UIDLs hashed and unacknowledged while applying
  bounded 5-minute, 15-minute, 1-hour, and 6-hour retry delays. Other messages
  continue, the third identical failure is reported as held, and the cycle stays
  partial until successful import clears the failure. POP3 deletion remains
  forbidden. Runtime activation and task-pin deployment remain separate.
- Moved Hiworks machine-local account/state/receipt paths into an ignored
  owner-root binding and pinned the scheduled runner to the exact forwarder
  bytes so worktree deployments fail closed instead of using stale code.
## 2026-08-14 - Read-only AX-SE project assessment candidate

- Canonicalized the M2 knowledge boundary after Owner review: one shared
  deterministic AX-SE Engine consumes a Knowledge View containing exactly one
  project plus explicitly allowlisted approved common revisions. Project source,
  derived RAG/Wiki, context, and run payloads remain physically rooted in the
  owning project view; common bytes remain single-owner and are reused by exact
  revision/hash reference rather than copied.
- Split M2 into ordered gates: document the boundary, implement and adversarially
  validate project isolation on public synthetic data, run one Owner-frozen
  manual zero-write context pilot, then add accepted-generation project RAG/thin
  Wiki support. This contract does not activate live project reads, cross-project
  body access, ERP writes, automatic Wiki promotion, or an LLM.
- Added the M2-1 public-synthetic admission boundary in `guild_hall/shared`.
  `selectProjectKnowledgeView` accepts exactly one project and an explicit common
  revision set, then checks them against a separately supplied expected grant
  reference whose canonical content binds the project, policy, common allowlist,
  and declared roots before any root lookup.
- Added a metadata-only physical-root resolver that requires selected roots to be
  strict descendants of one containment root and requires project/common roots to
  be disjoint. It never enumerates or reads their contents. Portable knowledge
  scope fingerprints are separated from ephemeral local path-admission
  commitments; neither grants project reads nor proves a live or production root.
- Added the M2-2 public-synthetic Project Context pilot composition. A separately
  pinned Owner-frozen pilot grant now binds the one-project Knowledge View, a
  complete exact-reference manifest for project objective/evidence/risk/roster
  material, explicit common-revision-to-policy-requirement projections, and the
  unchanged role-bound AX-SE packet before the deterministic Engine is called.
- Made the composition revalidate the delegated M2-1 result rather than trusting
  its object shape: every emitted project, policy, common and grant reference is
  exact, the grant must match the independently pinned inner grant, the common set
  must remain an array, the portable scope fingerprint must be a closed SHA-256,
  and the delegated authority/effect envelope remains validation-only and zero.
- Added a two-flag zero-write M2-2 command candidate. It pins a canonical launch,
  admits the Knowledge View before opening data, then stable-opens one canonical
  packet by relative locator beneath the admitted project root. Its receipt is
  payload-free and binds launch, packet, grant, project, manifest, common set,
  roster, scope, and prepared output without paths or raw source identifiers.
  This is not an actual-project run, source-body membership proof, freshness
  acceptance, RAG/Wiki/LLM activation, ERP write, or TaskDriver authority.
- Hardened that command's process and file seams: asynchronous stdout/stderr pipe
  failures now close as `HOLD` without retry, launch and packet names are preflighted
  as ordinary single-link files before nonblocking/no-follow open where supported,
  root/ancestor identity is rechecked before size refusals, and its tests reclaim
  every temporary directory they create. The POSIX FIFO execution case remains a
  platform validation gate because this Windows host can only check that path
  statically.
- Updated the generated Engine topology for the M2-2 subject to 33 modules and
  151 internal import edges, and the full Watchtower federation to 71 nodes
  and 198 edges (2026-08-17 정정: tracked
  `guild_hall/watchtower/topology/federated_topology.v1.json` summary는
  `edge_count: 199`이다). Earlier 30/136 and 32/147 entries below remain
  historical M1 integration milestones rather than the current inventory.
- Reclassified the earlier `qwen3.5:9b` choice as historical rather than the M2
  runtime. M2 through the first pilot remains model-free; any later advisory LLM
  requires a separate source-bound quality and data-egress decision.
- Closed the follow-up isolation ambiguities: shared `_workspaces/knowledge/rag/**`
  routes are common-only and project-specific writes are immediately `HOLD`;
  NotebookLM/bookshelf presence cannot trigger an external query; chunk-bearing
  common projections are ephemeral and non-persistable; and the old Qwen/Ollama
  instructions are explicitly historical rather than an active M2 runtime.
- Synchronized the two active RAG owner contracts with that boundary: every
  older `_workspaces/knowledge/**` path/example is now governed by a common-only
  override, while private project sources and derivatives require the owning
  project root. The new M2-1 route validates only public-synthetic root metadata;
  actual project reads remain `HOLD` until an Owner-frozen M2-2 packet and
  independently trusted actual-root binding are accepted.
- Propagated the same storage rule into the three-stage operating workflow,
  extraction instructions, and bookshelf source-card description so an
  executable old step cannot re-authorize a private project source in the
  common warehouse.
- Added a deterministic public subject that converts one exact source-bound project
  snapshot, stage policy, and role list into the current SE stage, bounded
  missing/unknown/conflict/risk issues, at most three mission candidates, a logical
  role candidate or `HOLD`, and explicit done/HOLD conditions.
- Added a directly hash-bound public synthetic fixture, fail-closed tests, and
  `validate:engineering-engine-ax-se-project-assessment`. The subject creates no
  permanent ID, TaskIntent, assignment, stage-clear decision, TaskDriver action,
  filesystem/network/model call, ERP write, or canon promotion.
- Reframed the roadmap around the read-only AX·SE judgment slice while preserving
  dev-ERP as the deferred long-term integrated asset/operation surface. Existing
  Context Graph/RAG/Wiki plans remain later context-support candidates; automatic
  raw-to-Wiki/RAG/canon promotion stays `HOLD`.
- Added `buildAxSeAssessmentInput` and `AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA`, a
  deterministic sealing entrance that binds one already sanitized,
  requirement-bound context packet plus separately source-bound policy, logical
  roles, and an expected exact project binding into the assessment input. It
  canonicalises only unordered rows, computes the snapshot content SHA itself, and
  refuses a caller-asserted snapshot hash, a cross-project packet, or a policy
  mismatch. It reads no workspace or project-metadata plane, infers no requirement
  status or missing fact, assigns nobody, and makes no live-current claim.
- Added 26 focused tests covering the builder and the subject. Rejections stay
  stable and echo no caller payload, and the raw assessment input path remains
  valid.
- Added the zero-write pilot CLI
  `guild_hall/engineering_engine/tools/ax_se_project_assessment_runner.mjs`. It accepts
  exactly `--packet`, one absolute local packet file, and `--packet-sha256`, pins the
  exact raw packet bytes before any UTF-8/JSON interpretation, reads only one bounded
  ordinary singly named file (packet 2 MiB, packet path 4096 chars, prepared result
  4 MiB ceilings), and writes no output file. stdout carries one prepared canonical
  assessment and stderr one closed payload-free receipt; a submitted receipt callback
  is not an OS delivery claim.
- Kept the command result separate from the domain state: command PASS is distinct from
  domain HOLD/UNKNOWN/READY_FOR_OWNER_REVIEW, every gate/authority flag stays false, and
  output stays candidate-only. The CLI makes no model, RAG, Wiki, ERP, TaskDriver,
  network, or file-write call and does not discover, sanitize, or approve project data.
- Extended `validate:engineering-engine-ax-se-project-assessment` to syntax-check the
  assessment, roster, and role-bound subjects, both zero-write runners, and all five
  test files; run all five test files; and verify the Engine manifest and topology.
  Runner coverage is public synthetic/process/adversarial tests only; no actual
  project pilot was executed and no live-current claim is made.
- Synchronized Watchtower's allowlisted Engineering Engine topology adapter and
  generated federated topology after the new AX·SE subject increased the declared
  Engine inventory to 30 modules and 136 import edges.
- Hardened the public pilot boundary after independent Level 3 review: embedded
  local paths are refused anywhere in bounded input strings, a stage with no
  applicable requirement is not presented as a clear candidate, incomplete
  nanosecond file identity is unreadable, and direct invocation compares normalized
  file URLs instead of raw argv spelling.
- Refused duplicate lifecycle stage codes before two stages can share one risk
  bucket, and normalized the Windows drive-letter spelling used only to decide
  whether the runner is the direct entry module.
- Stopped emitting the canon-owned `boss_clear_candidate` label from a projection
  that cannot yet evaluate snapshot freshness or terminal provenance. Issue-free
  stages, including `270_UNCLASSIFIED`, now remain `active`; stage clear and boss
  candidacy stay behind their stronger evidence gates.
- Renamed the unpublished command receipt field to the explicit
  `canon_claim_ceiling`, documented caller-supplied logical roles as unbound routing
  candidates rather than assignments, and made the focused validator compare the
  committed Engine topology byte-for-byte with a fresh source emit.
- Status remains candidate until independent Level 3 review and the full validators
  pass; the Owner then selects one frozen/manual exact packet for a separate one-time
  pilot, and accepted-context generation/freshness remains a later gate.
- Closed that public deterministic boundary with focused 51/51 tests, the existing
  SE-core and Watchtower suites, changed-path validation, and fresh Claude Opus B/V
  acceptance. This acceptance does not cover an actual project, live freshness,
  assignment, or a pilot execution.
- Added the standalone public-safe `ax_se_project_role_roster.v0` module and synthetic
  fixture. It binds logical roles to an exact project, source revisions, one exact
  capability vocabulary, observation time, and coverage, computes its own immutable
  roster ref, and states whether exclusivity is supportable. Partial/unknown coverage
  and unknown routing never become unique-role evidence.
- Kept the accepted assessment v0 byte-identical: the roster module is not yet an
  input adapter. It grants no human identity, live availability, roster approval,
  assignment, TaskIntent, ERP, or canon authority; that v1 integration and an
  Owner-pinned manual pilot remain separate gates.
- Added the separate pure `ax_se_project_role_bound_assessment.v1` subject, public
  synthetic fixture, and fail-closed tests while preserving the accepted v0 subject,
  v0 runner, and roster bytes. The full expected roster ref remains outside the
  combined packet, and policy/roster capability-vocabulary refs must match exactly.
- Incomplete roster coverage no longer blocks stage/gap observation and no longer
  permits an overall ready result: role routing and the overall v1 resolution stay
  `HOLD`. Capability matching is exact token equality only; vocabulary membership,
  human identity, live availability, assignment, Task/ERP effects, and model/network/
  filesystem authority remain explicitly unclaimed.
- Resynchronized Watchtower's allowlisted Engineering Engine adapter and generated
  federation after the role-roster and role-bound subjects brought the public Engine
  inventory to 32 modules and 147 internal import edges.
- Brought the existing zero-write role-bound v1 command runner under
  `validate:engineering-engine-ax-se-project-assessment`. The validator now
  syntax-checks three subjects and both runners and executes all five AX-SE test
  files, so the role-bound runner and its test are no longer outside the focused
  gate. Every previously covered check is retained in place.
- Documented that runner in the Engine README as it is implemented: exactly five
  flag/value pairs (`--packet`, `--packet-sha256`,
  `--expected-role-roster-entity-id`, `--expected-role-roster-revision-id`,
  `--expected-role-roster-content-sha256`), the expected roster ref supplied
  independently of the packet, the raw-byte packet pin verified before any
  UTF-8/JSON interpretation, one canonical assessment on stdout, and one closed
  payload-free receipt on stderr whose gate flags are all false and whose effect
  counts are zero. The receipt omits paths, source text, and raw roster identifiers
  while committing the packet, full expected roster ref, assessment, prepared output,
  and candidate count with hashes, byte counts, and an opaque handle. Correctly pinned
  invalid UTF-8 and invalid JSON remain fail-closed, and distinct valid runs produce
  distinct correlatable commitments.
- Added the focused AX-SE validator to both root `validate` and root `done:check`, before
  Watchtower, and locked that step ordering in the root acceptance-step tests.
- Separated the M1 closeout scope — the public deterministic role-bound v1 subject,
  its zero-write runner, the focused validator, and an independent Level 3 review
  performed outside the implementing task — from M2, which owns the Project Context
  Adapter v0 and one Owner-pinned frozen/manual zero-write pilot. Added the compact
  target flow of common SE knowledge plus isolated project context into one bounded
  packet, the model-free deterministic AX-SE Engine, an optional advisory LLM
  explanation, and a later ERP gate.
- Subordinated the Knowledge Assistant activation plan's body wording to its own
  `HOLD` banner. The review verdicts and the phasing list are marked as a proposal
  record rather than an approval, so no switch reads as immediately startable; LLM
  and Wiki activation stays `HOLD` until the M2 pilot and a separate owner gate.
- Closed the M1 public candidate boundary with fresh, separate Level 3 B and V
  acceptance on the final pinned bytes. This accepts the deterministic role-bound
  subject, zero-write runner, receipt correlation, and validator integration only;
  it does not accept an actual-project pilot, live freshness, assignment, production
  readiness, canon promotion, or M2. Repository-global `validate`/`done:check` green
  is also not claimed because the tracked-scope path gate still stops on 50 unrelated
  legacy violations, while the 28 changed files have zero path-policy violations.
- Re-reviewed the unchanged Agent Boot Digest meaning against the current Lean Root
  and revised roadmap, then regenerated its source manifest through the canonical
  boot-digest guard. The digest remains a non-canonical bootstrap summary.
- Regenerated the Engine byte manifest through the canonical
  `guild_hall/engineering_engine/tools/emit_manifest.mjs`
  emitter rather than hand-editing generated rows. No actual project was used. The
  M2 runtime path makes no model or network call, ERP write, TaskDriver activation,
  or project-data write; separately reported read-only external reviews are not part
  of that runtime path.

## 2026-08-13 - Claude quota reset-unknown compatibility

- Kept a provider-reported Claude quota percentage when the sanitized OAuth
  response explicitly reports no reset timestamp. The percentage remains
  source-backed and current while the reset is shown as unknown; no reset time
  is inferred or synthesized.
- The nullable reset is accepted only for the sanitized Claude OAuth source.
  Status-line, compatibility, Antigravity, malformed, and implausible reset
  evidence retain their existing fail-closed validation.
- Decoupled the five-minute Claude quota refresh from the potentially long
  active-session Meter supplement. A slow active Codex session collection can
  no longer prevent the next quota observation from running on schedule.

## 2026-08-13 - Workspace Board rollover and enrollment-gap hardening

- Kept stable manager rollovers in the prior hierarchy position and atomically
  reparented direct pending, accepted, and current children to the replacement
  exact thread ID. Historical children stay on the historical parent, so a
  rollover no longer leaves the current Board hierarchy pointing at a history
  record.
- Made the scheduled Meter companion's active Codex supplement independent of
  Workspace Board enrollment by including recently written exact session files
  in addition to validated lifecycle identities. Completed-session collection
  remains global, while Board visibility and organization attribution remain
  exact-enrollment-only.
- Expanded the Thread Manager's mandatory post-operation enrollment gate to
  create, fork, continue, rollover, and handoff. Projectless tasks require an
  explicit delegation group, exact parent, and safe label; missing metadata is
  `HOLD`. This does not claim a central Codex task-tool interception hook.

## 2026-08-13 - AI usage collection lineage stability and Claude quota state ownership

- Prevented the Codex scheduled collector from becoming permanently stale when
  the same source-backed usage event is later assigned a different automatically
  derived ancestor. The first canonical derived root/work assignment is retained
  while monotonic completion and project enrichment may advance. Explicit
  bindings and token, model, source, or credit disagreements remain fail-closed.
- Moved the ignored Claude quota opt-in gate and sanitized receipt lookup from the
  active Board worktree to the stable owner root supplied by
  `SOULFORGE_AI_USAGE_PROJECT_ROOT`. Rebuilding or switching the Board worktree
  no longer makes an existing local quota observation disappear. The change does
  not read or store credentials, raw provider responses, or account data, and it
  does not enable quota access without the existing explicit gate.
## 2026-08-13 - Source-bound answer lane: host-rendered statement selection

- Removed model-authored answer prose from the evaluation-only source-bound lane.
  The model now returns one closed statement-selection object only: a result
  (`answer` or `abstain`) and up to eight pairs of an opaque host statement id and
  one relation from `direct`, `support`, `qualification`, or `contrast`. It cannot
  author a heading, answer sentence, quotation, citation, approval state, canon
  state, project-use direction, winner, Task, or authority field.
- Each statement is one complete retrieved chunk already bounded by the lane. The
  prompt shows `{ statement_id, excerpt }` and no source title, revision, page,
  source id, chunk id, digest, or path. The host retains that metadata, validates
  the model's ids against a dynamic allowlist, and renders fixed Korean labels plus
  the exact selected public-source excerpt and one machine-bound citation. An
  `abstain` result renders one fixed Korean insufficiency notice and no invented
  source claim.
- This replaces, rather than extends, the discarded bilingual free-prose authority
  classifier. Independent public-synthetic attacks repeatedly found that a prose
  parser could confuse a denied approval condition with the action it governed,
  another draft with the current answer, or a Korean negative with an exclusive
  positive. The stop criterion was therefore applied: no more phrase-shaped
  exceptions were added. Authority language is now unrepresentable in the model
  response schema; source text may of course contain authority vocabulary because
  it is displayed as exact source evidence, not as an Engine action.
- Citation and corpus integrity remain host-owned. Unknown or duplicate statement
  ids, a nonempty abstention, an answer without a `direct` proposition, extra keys,
  old `sections` output, and any model-authored prose field all fail closed. The
  receipt records statement/excerpt commitments and counts, never the excerpt.
  Selection relevance and semantic entailment remain `UNKNOWN` pending independent
  review; exact quotation is not a correctness claim.
- Bumped the answer schema to `soulforge.se_core_sourcebound_answer.v1`, lane
  receipt to `soulforge.se_core_sourcebound_answer_receipt.v2`, answer-lane policy
  to `soulforge.se_core_sourcebound_answer_lane.v2`, and Ollama adapter to
  `soulforge.se_core_sourcebound_answer_ollama_adapter.v3`. The command receipt
  remains `...answer_command_receipt.v2` because its closed field set did not
  change.
- No retry, repair, fallback, second answer call, external write, authority action,
  or claim promotion was added. Query expansion remains one optional advisory call;
  answer selection remains exactly one call. The response/resource/TypedArray,
  output transaction, no-echo, cohort-pin, and concurrency safeguards remain.
- Any question set already used while developing this lane — the earlier homefield
  set included — is seen material and may be re-run only as a post-hoc diagnostic.
  It cannot support a score, ranking, winner, NotebookLM comparison, parity, or
  production-readiness claim. Those require a fresh unseen frozen set pinned before
  the run. No such result is claimed by this change.
- This frozen structural-correction phase used public synthetic material only and
  read no private payload. One bounded loopback smoke invoked `qwen3.5:9b` exactly
  once with query expansion off. It returned an object the lane refused at
  `model_output` as `SE_CORE_SOURCEBOUND_ANSWER_MODEL_OUTPUT_INVALID`; no answer
  was rendered, no private 7x3 run started, and the provider payload was neither
  printed nor persisted. Per the declared stop condition there was no retry or
  compatibility tuning. The earlier homefield set is also seen material because
  it informed the preceding development cycle, so no benchmark result is claimed.
## 2026-08-13 - Source-bound answer lane: output-safety reason seam

- Added a diagnostic-only reason to the evaluation-only source-bound answer lane
  (`guild_hall/engineering_engine/evaluation/se_core_sourcebound_answer_lane.mjs`).
  `SE_CORE_SOURCEBOUND_ANSWER_OUTPUT_SAFETY_FAILED` named the decision but not the
  check, so markup, a URL, a leaked path, a fabricated citation identifier, an
  authority claim, a forbidden model field, a failed canonicalisation, and a
  failed whole-answer scan were one opaque hold. Every one of those paths now
  attaches exactly one token from a closed nine-member vocabulary:
  `markup_detected`, `url_detected`, `sensitive_pattern_detected`,
  `citation_identifier_in_prose`, `authority_claim_pattern`,
  `model_payload_field_forbidden`, `answer_canonicalisation_failed`,
  `rendered_answer_scan_failed`, and the exhaustiveness backstop
  `unspecified_internal`, which no reachable refusal produces.
- The token names a family of check and nothing else. It is a fixed literal
  chosen by which branch was taken, so it carries no offending text, no location
  within a value, no matched pattern, no question, no answer or evidence prose,
  no path, no account, and no provider value. It cannot be injected: an
  invocation, a model response, and a model section are each closed field sets,
  every adapter throw is still one `MODEL_CALL_FAILED`, and a token this lane
  does not publish is replaced rather than passed through.
- No output-safety acceptance behaviour changed. The same patterns run in the
  same order and refuse and accept exactly what they did before; nothing was
  relaxed, added, removed, reordered, or tuned to any question. No-retry,
  no-fallback, no-repair, and the response, resource, and TypedArray hardening
  are untouched.
- Bumped the two receipt contracts whose shape actually changed. The lane receipt
  is `soulforge.se_core_sourcebound_answer_receipt.v1`: its top-level
  `output_safety_reason` exists if and only if the result is an output-safety
  hold, and the key is absent — not `null` — on every other hold and on a pass,
  which is the canonical kernel's own omission rule, so the receipt needs no
  serialisation special case and gets none. That makes the receipt shape
  result-discriminated rather than one identical key set across every result: a
  reader keys on the result first and asks for the token only where the result is
  an output-safety hold. The command execution receipt is
  `soulforge.se_core_sourcebound_answer_command_receipt.v2`; it is a separate
  JSON-safe execution summary, so it keeps one closed top-level field set and
  states `output_safety_reason` as `null` wherever there is no token. It carries
  the field because a HOLD lane receipt is never emitted to stdout and
  `--receipt-out` is rolled back on a hold, and it reads it from the lane result
  that invocation awaited, so a reused adapter and two overlapping commands
  cannot inherit or cross-attribute a reason. The answer schema is unchanged, and
  the lane policy revision stays
  `soulforge.se_core_sourcebound_answer_lane.v0` because the instruction, the
  output schema, and every acceptance rule the model is held to are
  byte-identical and that revision salts the prompt, adapter, and expansion
  commitments.
- Verified on the public synthetic corpus only. No private source, no benchmark
  question, no crosswalk, rubric, evaluator gold, prior answer, or provider run
  was read, and no benchmark result is claimed or implied by this change.

## 2026-08-13 - Source-bound answer lane: pinned loopback generation request

- Fixed the source-bound answer lane failing every real run against the pinned
  local model. The runner
  (`guild_hall/engineering_engine/tools/se_core_sourcebound_answer_runner.mjs`)
  pinned the model, temperature, seed, and keep-alive but left the reasoning
  channel and the context window to whatever the Ollama daemon defaulted to.
  `qwen3.5:9b` is thinking-capable and Ollama enables thinking by default, so the
  reasoning block alone exhausted the default window: the reply arrived
  `done: true`, `done_reason: "length"`, with empty `message.content`, which the
  existing `done` check could not see. The lane reported
  `SE_CORE_SOURCEBOUND_ANSWER_MODEL_CALL_FAILED` at stage `model_call` with the
  answer call counted. Reproduced end to end on the public synthetic corpus
  against the installed model, before and after the change.
- Pinned every generation parameter that decides whether a reply can arrive:
  the reasoning channel off, a 32768-token context window, a prompt the daemon
  must refuse rather than trim, and `format` bound to the exact closed JSON shape
  the lane already declares, with each citation slot bound by `enum` to the
  evidence ids the run actually retrieved. A JSON schema alone does not fix the
  failure and was not treated as if it did: with thinking left on, the
  schema-bound request still returned empty content on the token budget.
- Sized the window from a measurement rather than an estimate. The lane's widest
  legal prompt — its own ceilings rendered at once, 24 evidence capsules of 900
  characters with title and revision at the 400-character metadata ceiling and a
  question at the 8192-byte ceiling — measures 31 939 prompt tokens on
  `qwen3.5:9b`, and reports the same count against a 65 536 window, so 16 384
  cannot hold it and 32 768 is the smallest power-of-two value that can. 32 768
  does not additionally hold the widest legal reply of 8 sections of 4000
  characters, so a run configured at the lane's retrieval ceiling has a few
  hundred tokens of reply budget and a longer reply stops on the token budget and
  is refused rather than published short. The lane's default retrieval is 6
  capsules. Measured resident footprint at this window is 6.13 GiB, fully in VRAM
  on the 16 GiB device this lane runs against (7.49 GiB at 65 536).
- Closed the prompt-side version of the same defect at the daemon instead of
  guessing at it from the reply. An oversize prompt is silently trimmed at the
  front by Ollama, and the reply does not report it: measured here, a 3413-token
  prompt against a 2048-token window returned `200` with
  `prompt_eval_count: 1026` — below the window rather than at it — so a threshold
  on that field reads a trimmed prompt as an ordinary short one. The request now
  pins `truncate: false`, which makes the same case a non-success status with no
  generation, and the reply-side threshold that could not see it was removed.
- Added `model_refusal_reason` to the command execution receipt: one token from a
  closed set the provider adapter publishes, chosen from the reply's shape and
  never from its content. The lane collapses every adapter refusal into one
  `MODEL_CALL_FAILED`, so without it the observed failure was indistinguishable
  from an unreachable daemon. It echoes no provider text, no path, no question,
  and no source, and is `null` on a pass and on any hold that never reached the
  provider. The token names one *invocation's* refusal, not one adapter's: each
  command opens its own scoped adapter and its own refusal cell before any output
  is staged, and every model call it makes settles that cell alone. So an adapter
  reused by a later run cannot report the earlier run's refusal on a receipt whose
  run never reached a provider, and two commands holding calls open against one
  adapter at the same time cannot report each other's, in either completion
  order. Attribution is not carried in a slot the adapter rewrites as calls
  arrive, which is what an overlapping pair would otherwise read.
- Reserved `generation_stopped_on_budget` for the one stop reason that means it.
  A `done_reason` that is absent, malformed, mistyped, or simply another reason
  now takes the neutral `generation_did_not_stop_normally`, so the receipt states
  that the generation did not end normally without claiming a cause it did not
  observe and without echoing the value it read.
- Required both completion claims before a non-streaming reply is answered:
  own-data `done: true` and own-data `done_reason: "stop"`. Previously each was
  checked only when present, so a reply that stated neither was completed as if
  it had stated both. A consumed completion, model, or message field that is
  missing, inherited, accessor-backed, hidden, or of the wrong type now holds
  safely instead of being read.
- Made every response-surface failure this adapter's own refusal. `ok`,
  `headers`, `body`, `arrayBuffer`, and `text` are snapshotted once per reply and
  a slot that throws becomes one fixed no-echo `ContractError`, so a provider- or
  client-authored error can no longer travel out of the adapter carrying its own
  text, and no consumed slot can answer a check with one value and the use with
  another. The snapshot reads values rather than requiring own data, so a native
  Fetch `Response` — whose slots are prototype getters and methods — is still
  served unchanged. Each step of a streamed body is snapshotted the same way, and
  there own data *is* required: an ordinary plain object whose `done` is an own
  data boolean and, when that is `false`, whose `value` is one own data
  `Uint8Array`, taken once and then counted and copied from that snapshot alone.
  The chunk is held to the same standard, because `instanceof Uint8Array` is true
  of a proxy around one and of a subclass and both intercept every slot read that
  follows: a chunk must be an exact `Uint8Array` — no proxy, no subclass, no own
  `byteLength` — and it is then measured and copied through the engine's own
  `%TypedArray%` intrinsics into a fresh ordinary array, never through a slot the
  chunk itself could answer. An accessor, a custom prototype, an inherited or
  hidden slot, a `done` that is merely truthy, a chunk those intrinsics will not
  measure or copy, and a chunk whose length moves between the count and the copy
  each cancel the stream exactly once and take the same fixed body refusal,
  instead of running provider code at the byte counter, letting a value the byte
  counter checked be replaced by the one it copies, or carrying provider-authored
  error text out of the adapter. A real Fetch body reader hands over exact
  `Uint8Array` chunks and is served unchanged.
- Operational impact: no command, flag, blocker code, answer shape, lane receipt
  shape, or persistence semantic changed, and no retry, fallback model, repair,
  or hidden second answer call was added. The adapter revision the receipts carry
  moves from `soulforge.se_core_sourcebound_answer_ollama_adapter.v0` to `.v1`
  because the outgoing request shape changed. The command execution receipt moves
  from `soulforge.se_core_sourcebound_answer_command_receipt.v0` to `.v1`, which
  is a schema bump rather than an additive one: that receipt is a closed
  top-level field set, and `model_refusal_reason` is a new member of it, so a
  reader keyed to v0 is meant to reject a v1 receipt rather than read it as a v0
  that grew a field. A refused run stays one refused historical record. Existing
  failed benchmark cells remain failed; re-running a benchmark is a new,
  separately versioned run and an operator decision.
- Not yet re-verified against the installed model: the stricter completion
  contract above was developed and tested against the public synthetic corpus
  only. The recorded field observation shows this daemon does report
  `done_reason` — that failure carried `"length"` — but no run in this change
  observed a normal completion from it, so whether a real successful reply states
  `done_reason: "stop"` is `UNKNOWN` here and one end-to-end run against the
  local daemon is required before the next benchmark attempt.
- Related paths: `guild_hall/engineering_engine/tools/`,
  `guild_hall/engineering_engine/tests/`, `guild_hall/engineering_engine/README.md`,
  `guild_hall/engineering_engine/topology/engine_manifest.sha256`.

## 2026-08-13 - Evaluation-only SE-core source-bound answer lane and corpus-wide retrieval

- Added an evaluation-only Soulforge Engineering Answer Lane
  (`guild_hall/engineering_engine/evaluation/se_core_sourcebound_answer_lane.mjs`)
  that answers one arbitrary natural-language question over one exact four-source
  public systems-engineering corpus. It is neither the deterministic Engine
  baseline nor general open question answering: the existing fixed seven-case
  source-cited runner remains a separate, unchanged, model-free lane, the two are
  not comparable, and those seven fixed outputs must not be reused as this lane's
  results. Every result is `ai_assisted` and non-authoritative, with
  `claim_ceiling: observed` and
  `candidate_disposition: external_advisory_candidate`.
- Kept the source set operator-supplied rather than repo-embedded, and split two
  claims that are easy to collapse. `runSeCoreSourceboundAnswerLane` is the
  generic validated-contract API: it proves the four supplied descriptors are
  internally consistent, allowlisted for evaluation-lane analysis, canonically
  ordered, and byte-pinned, and it reports
  `source_set.benchmark_pin.fixed_benchmark_identity_asserted: false`, because the
  caller supplied both the descriptors and the identity/byte commitment over them.
  `runSeCorePinnedBenchmarkAnswerLane` takes an independently configured cohort
  pin whose commitment covers the **full** member material — identity, byte
  hashes, `approval_status`, the operator reuse-rights declaration, and every
  permission boolean — so a changed approval status, a changed permission, or a
  changed source identity refuses the run at zero model calls even when the caller
  recomputes every hash it controls. The module hard-codes no cohort hash, no
  source id, no path, and no source content, so nothing in it can bless a private
  corpus.
- Made both routes reachable as one canonical command, so choosing between them
  is an operator decision on the command line rather than one that requires
  writing a JS harness. `--benchmark-pin <file>` supplies an operator-authored
  pin and means benchmark mode; without it the run stays the generic
  validated-contract route and says so on both receipts
  (`benchmark.mode: generic`, `fixed_benchmark_identity_asserted: false`). The
  pin file is one closed plain JSON document of exactly `pin_id`,
  `source_set_id`, `expected_cohort_sha256`, and `allowed_source_ids` — an extra
  key such as a `schema_version` is refused rather than ignored — read as a
  bounded read-only ordinary file whose size is taken from the open handle,
  decoded UTF-8 `fatal: true`, parsed strictly, and rebuilt from validated
  primitives. The runner never derives, recomputes, or repairs the commitment
  from the corpus under test: a drifted hash, the source-set hash pasted in as
  the cohort hash, a re-approved source, or a renamed member refuses before any
  model call and before any output byte, and a flipped permission refuses one
  gate earlier still. The command receipt mirrors the lane's
  `fixed_benchmark_identity_asserted` rather than asserting it, since the process
  that supplies the pin is not a witness to its own claim, and it carries closed
  safe metadata only — no pin content, no local path.
- Bounded the named local inputs the same way, rather than reading them whole. A
  whole-file read sizes its allocation from the file, which is the one number the
  command does not control, so the source-set contract, the question, and each of
  the four derived texts are now opened read-only, sized from the **open handle**,
  and compared against that input kind's ceiling *before* a buffer exists —
  65536 B for the contract, 4096 B for the pin, and 8192 B and 8388608 B for the
  question and each derived text, which are exactly the ceilings the lane itself
  enforces on the same material and are pinned to the lane's boundary from both
  sides by the suite. The allocation is exactly the stated size, the read is
  driven to completion at explicit offsets, and one byte is probed past the end so
  a file that grew after the stat is refused rather than accepted as the shorter
  document that still parses. Identity is read from the descriptor and from the
  name without following it, both before and after the read, so a directory, a
  device, a symlink, a junction, a hard link, a short read, a replacement
  mid-read, an empty file, and an oversized file all refuse. Every refusal shares
  one fixed message that names neither the path nor the content nor which check
  failed, and all of it happens before the model adapter exists and before any
  output is staged, so a refused input costs zero model calls and creates no file.
- Bounded every byte this command takes from outside before it is interpreted.
  The `io` surface is reflected exactly once through `getOwnPropertyDescriptors`
  before any seam is used, so a getter never runs and each seam is bound once
  from that snapshot; a custom prototype, an inherited or non-enumerable seam, an
  accessor, an unknown key, or any own symbol but the test checkpoint refuses the
  run, and a refused surface is not used as a reporting sink. `--timeout-ms` and
  the adapter option both cap at exactly 180000 ms, which is also the default.
  `response.json()` is never called: a declared `Content-Length` over the cap
  refuses before the body is touched, a streamed body is counted incrementally
  and the reader cancelled the moment the cap is crossed, an injected client's
  `arrayBuffer`/`text` fallback is length-checked too, and only then is the buffer
  decoded UTF-8 `fatal: true` and parsed. The ceilings — 262144 response bytes,
  131072 `message.content` bytes, 49152 `message.content` characters — are
  derived from the closed output schema rather than guessed. A reply that names a
  `model` must name `qwen3.5:9b`; a reply that omits the field is accepted and
  claims nothing, because the request already pinned the model. Every oversized,
  malformed, or undecodable reply is a `HOLD` with no provider byte echoed and a
  truthful invocation count.
- Recorded the approval posture as what it actually is. `approval_status` accepts
  exactly `owner_approved_public_source`, `official_public_source`, or
  `owner_approved_official_public_source` — the combined value is its own accepted
  status because what a document *is* and whether the owner cleared it for *this
  analysis* are two facts that can hold at once — and permissions must allow
  evaluation-lane analysis while forbidding canon promotion and external upload.
  `reuse_rights_reviewed` is a runtime operator declaration over reviewed public
  rights metadata, never verbatim source-card data; the receipt states that basis
  as `source_set.reuse_rights_reviewed_basis`.
- Fixed the derived-byte order: the raw supplied bytes are hashed against the
  pinned `derived_text_sha256` **before** any decode, then decoded as UTF-8 with
  `fatal: true`, and only then are exactly two characters — `U+0000` and `U+001F`
  — replaced with SPACE **in memory**, both counted. Every other C0/C1 character
  refuses the run, carriage return and form feed included; LF and TAB are
  preserved. Each receipt source row carries `raw_derived_text_sha256`,
  `normalized_text_sha256`, `replacement_counts`, and
  `normalized_bytes_persisted: false`. No normalised byte is written anywhere.
- Excluded the derived-text metadata preamble from the answer entirely. One
  closed shape is accepted before the first `## Page N` heading — one H1 plus the
  five known bullets, each exactly once — and `source_id`, `revision`,
  `source_pdf_sha256`, and `page_count` must bind to the pinned contract member
  exactly. No preamble line is chunked, indexed, retrieved, cited, or copied into
  evidence, the answer, or the receipt, and a control character inside the
  preamble region refuses the stream rather than being collapsed to a space.
- Added one pure corpus-wide deterministic retrieval seam,
  `searchSourceTextCorpus` in `guild_hall/rag/source_text_index.mjs`, beside the
  existing single-index path. It scores every chunk of every supplied source in
  one global lexical/BM25-like space, so scores from a short and a long source are
  comparable; ranking is total and order-independent; the request tree is
  snapshotted into plain own data before one semantic read, so no accessor can
  show the validator one value and the scorer another; and the receipt proves how
  much was searched, not only what was cited. There is no embedding, vector index,
  or web search.
- Made the local model a bounded prose renderer and nothing more. The lane itself
  is provider-independent and performs no filesystem, network, write, or ERP
  operation; `guild_hall/engineering_engine/tools/se_core_sourcebound_answer_runner.mjs`
  is the only place that knows a provider exists and calls local `qwen3.5:9b`
  over loopback Ollama only, stateless, no tools, no history, redirects refused.
  An optional advisory query expansion from the same model is declared
  `model_advisory_shadow`, weighted below an exact query token, and can change
  which evidence is selected — so it stays non-authoritative *and* countable via
  `selected_advisory_only_count`, rather than being described as harmless.
  Evidence selection, citation binding, page attribution, the output schema, the
  claim ceiling, and the receipt are owned deterministically outside the model,
  which cannot create a source, a citation, an authority, or a ceiling.
- Named the verification ceiling instead of implying a stronger one. Model-authored
  headings and bodies pass a conservative structural and forbidden-claim scan —
  markup, URLs, paths, secrets, project codes, foreign source/page/revision/chunk
  identifiers, and self-attributed authority — and every refusal is a `HOLD` with
  `answer: null` and fixed message text that never quotes what it refused. That
  scan is **not** a semantic entailment proof: a grammatical sentence no selected
  capsule supports passes it. The receipt says so in its own fields —
  `free_text_verification: structural_and_forbidden_claim_filter_only`,
  `semantic_entailment_verified: false`, `free_text_correctness: unknown` — so
  free-text correctness in this lane stays UNKNOWN and cannot be inferred from a
  `PASS`.
- Split write accounting between the two surfaces so neither can be read as the
  other. The lane receipt is a payload-free record of an in-memory evaluation and
  truthfully reports `filesystem_writes: 0`; it is also the bytes `--receipt-out`
  persists, so it cannot describe its own persistence. The CLI therefore emits a
  separate command execution receipt carrying `state` of
  `not_requested | complete | rolled_back | partial_unknown`, the exact
  `requested`/`claimed`/`completed`/`rolled_back`/`unknown` counts, and
  `persistent_file_writes`, with the lane's zero-write claim kept under
  `lane_internal_writes`. Both explicit outputs are staged create-only before the
  model is invoked, identified by device and inode rather than by path, and a lost
  or replaced output ends the command in `partial_unknown` without touching a file
  this run does not own.
- Granted no authority with any of it. The lane holds zero owner approval, canon
  promotion, task creation, disposition, P5/P8, action-execution, and source-truth
  authority; it consumes no actual project or private data; and it produces no
  score, no ranking, and no winner. The Notebook comparison's blocker is unchanged
  and unaddressed here: provider-effective post-ingest byte parity is still not
  observable, so no formal comparison, parity claim, or project-use claim follows
  from this lane. Public code, fixtures, and tests carry synthetic material only.
- Operator impact: the lane is public implementation and tested, not an executed
  benchmark. Coverage runs under the existing canonical surfaces —
  `npm run validate:engineering-engine-se-core-eval` now `node --check`s the lane,
  the synthetic fixture, and the CLI and runs both new suites, and
  `npm run validate:rag` runs the new corpus-search suite — with no new script and
  no new command name. Actual execution over the real corpus needs the operator's
  own source set, an owner-configured cohort pin, and a running local model, none
  of which this change supplies. Authoring that pin stays an owner setup step done
  once out of band with `seCoreSourceCohortSha256` over a reviewed cohort; running
  the sweep afterwards needs only the one CLI command.

## 2026-08-12 - Automatic derived report for every captured SE-core turn

- Moved the derived QA human report's on-disk write into one owner-local writer
  module and pointed the report CLI's create-only `--out` and guarded
  `--refresh` modes at it, so the explicit and automatic lanes cannot drift into
  two different notions of which file may be replaced. The CLI's arguments,
  receipt fields, and closed issue codes are unchanged.
- Made every capture lane keep one fixed-basename Markdown report level with the
  ledger, so a captured question or answer no longer needs a separate manual
  command to become readable. The report is created only if that basename is
  free and refreshed only when the file is still a plain regular file with no
  second hard link and its bytes still prove themselves to be exactly what this
  renderer produced. That proof is a body commitment written into the report's
  own head, so recognition trusts no caller-supplied digest and no marker alone,
  and a hand-edited body under a copied head is refused. A report written in an
  earlier format without that commitment is refused as well; there is no
  automatic migration, and the repair is a human moving or deleting the file.
- Staged each replacement as a create-only sibling in the same directory and
  treated that create-only open as the ownership proof, so only a staged file the
  call itself created is ever unlinked. A foreign file already occupying the
  staging path refuses the refresh and is left untouched rather than deleted.
- Made the Markdown projection total over every ledger state the capture contract
  accepts. Bytes that cannot be shown exactly — invalid UTF-8, a byte-order mark,
  a lone carriage return, a control character, a U+FFFD nobody recorded — are now
  written in one explicit escaped notation with a per-block `원문 표시 방식` row
  and an `escaped_body_count`, instead of refusing. Refusing them let a single
  recorded turn make the report unbuildable and every automatic lane under that
  root exit nonzero permanently.
- Refreshed the NotebookLM lane once on the branch that is about to query and
  once after the answer turn. The pre-query refresh runs after the at-most-once
  preflight, so an orphaned, conflicting, closed, or unresolved attempt reports
  its own outcome and an unbuildable report cannot keep an already-recorded
  response from reaching its answer turn. A refusal before the query holds with
  no provider invocation; a refusal afterwards holds while reporting that the
  capture did happen and that the report is pending, and a retry of that attempt
  resumes from the stored response, queries nothing, and only rebuilds the
  derived view.
- Refreshed the Engine source-cited lane after a successful fourteen-turn batch
  and added the report basename, operation, and digest to its redacted receipt.
  A refused refresh fails the run instead of claiming a readable report; the
  append-only ledger keeps what it recorded, and a retry is idempotent and
  repairs the file.
- Added the report path to the capture contract's owned-target projection, so an
  `--out` or `--receipt-out` aimed at it is refused before any claim or capture,
  and refused a recorded raw artifact ref that would claim the same basename.
- Refreshed the low-level QA capture CLI on `record-question`, `record-answer`,
  `record-review`, and `import-existing`, leaving `initialize`, `validate`, and
  `query` read-only and unchanged. A refused refresh exits nonzero and still
  reports the exact ledger facts the append reached rather than unwinding a
  recorded turn.
- Kept the report a non-authoritative derived view. Truth and evidence remain
  the append-only ledger and the hash-bound raw files, no score, verdict,
  winner, or translation is introduced, and the frozen 70-event and 115-event
  benchmark ledgers and reports are neither read nor written.

## 2026-08-12 - Automatic SE-core evaluation question and answer capture

- Added an all-or-nothing `--capture-root` / `--capture-attempt-id` /
  `--capture-event-time` opt-in to the fixed-seven source-cited Engine CLI. With
  no capture flag its stdout and output bytes are unchanged; with all three it
  records the seven exact question texts and seven answer texts as individual
  turns through the existing metadata-only QA interaction ledger and prints one
  redacted receipt on stderr. A capture refusal fails the command instead of
  claiming the batch was captured, and the Engine still makes no model, network,
  ERP, or Notebook call.
- Ordered explicit output against ledger capture in that CLI. Each supplied
  `--out` and `--receipt-out` is now claimed create-only before any capture
  event is appended, so a run naming an already occupied output refuses with no
  recorded turn, no capture artifact, and no receipt, and reclaims whatever it
  had already claimed instead of leaving an empty or partial file.
- Bound explicit output to capture identity in that CLI. An `--out` or
  `--receipt-out` naming a path the exact capture attempt owns — the ledger, the
  writer lock, a raw question or answer file, or a lane they create — is now
  refused before either the claim or the capture, because a create-only claim on
  a capture path that did not exist yet created it, let capture append to it, and
  then overwrote it while the command still succeeded with a PASS capture
  receipt. The owned set is projected by the capture contract itself, and
  comparison resolves reparse points, short names, case variants, and hard links
  and refuses an identity it cannot resolve. Outputs outside that set, including
  ordinary outputs inside the same evaluation root, are unchanged.
- Added a query-only NotebookLM capture module and thin CLI that can run exactly
  one `nlm notebook query ... --json --timeout` shape without a shell, with a
  bounded timeout and bounded accepted output bytes. Login, notebook
  create/delete, source add/sync/import, research start/import, note mutation,
  and chat deletion are unreachable, and authentication is left entirely to the
  caller.
- Required exactly four unique UUID source ids and one freshly minted
  conversation UUID per question and attempt, and validated the nlm 0.9.10
  response as a closed six-field object whose `citations` map canonical 1-based
  numbers to requested source ids and whose `references` are exact
  `source_id`/`citation_number` records with an optional bounded `cited_text` or
  `cited_table`. Every citation value and reference source must be one of the
  four requested ids, every reference number must bind once to the citation
  mapping and agree with it, and the returned question and conversation must
  match the submitted ones.
- Made capture crash-safe: a create-only attempt intent is written before the
  external query, an unfinished attempt returns UNKNOWN rather than querying
  twice, a persisted response resumes ledger capture without a second query, and
  a provider failure keeps the recorded question with a safe failure receipt and
  no fabricated answer. Both recorded outcomes are resolved before the execute
  branch is chosen, so an outcome found with no intent, and an attempt recorded
  as both answered and failed, hold without querying.
- Made every refusal an honest audit record. After the question turn is
  appended, each HOLD and UNKNOWN reports whether the external query was
  attempted, the question hash, and the ledger event count, appended event
  count, ledger hash, and head hash actually reached.
- Bounded the reused-conversation scan to the evaluation root: the lane, every
  interaction directory, and every scanned file are refused if they are a
  reparse point or resolve outside the root, before anything lists or reads
  them, and directory count, file count, and file byte length are all bounded.
- Added a read-only Markdown projection of that prospective QA capture ledger
  with Korean section labels, a create-only `--out`, and a `--refresh` that
  replaces a report only when the observed hash and this renderer's own marker
  both still match, staging the replacement inside the same directory so a
  refused refresh leaves the existing bytes untouched and no residue behind. The
  projection is a derived view: the ledger and the hash-bound raw question and
  answer files stay canonical, and it declares no verdict, score, or winner.
- Kept raw answers, citations, references, provider stdout, and runtime
  notebook/source/conversation identifiers inside create-only artifacts under the
  explicitly supplied private evaluation root. Public files, the metadata-only
  ledger, and CLI output carry hashes, counts, and closed issue codes only.
- Kept both providers as contestants. Capture declares no winner, accepts no
  answer, writes no Task/ERP record, uploads nothing, mutates no source, and
  leaves the existing historical-import row-pointer `HOLD` unchanged.

## 2026-08-12 - Enforce metadata-only `_workmeta` writes

- Added a pre-write target guard that rejects generated runtime directories,
  executable/tool files, renders, caches, and raw payloads before they are
  created under `_workmeta`; compact metadata receipts remain allowed.
- Expanded the physical `_workmeta` validator to catch new untracked or ignored
  runtime residue while grandfathering only legacy paths already present in the
  nested repository HEAD.
- Corrected active runner, workflow, mission, workspace, and source-collection
  guidance so raw execution truth and artifacts stay in workspaces or approved
  worksites and `_workmeta` stores only pointers, hashes, status, and receipts.

## 2026-08-12 - Common-SE Engine and Notebook shadow evaluation prepared

- Added a deterministic fixed-seven source-cited answer surface that reuses the
  observed Engine judgments and attaches only independently reviewed public
  source/page commitments or Engine-boundary contract references. It invokes no
  learned model, provider, network, ERP writer, or Notebook surface and does not
  claim general PDF/RAG question answering.
- Added a metadata-only QA continuation ledger that anchors the immutable
  70-event evaluation ledger and records later answer attempts, review links,
  summaries, and candidate comparisons without copying raw answer text.
- Added a read-only Markdown evaluation report and a prospective per-turn QA
  capture ledger so people can inspect verified questions and repeated answers
  while the original 70-event cohort remains byte-for-byte immutable.
- Materialized a four-source public-safe SE source-pack/corpus contract with
  exact revisions, byte lengths, and SHA-256 commitments while keeping source
  bodies and external provider state out of the tracked repository.
- Added an independently review-gated page-to-rule crosswalk compiler and a
  fixed seven-case typed Engine/reference runner. Evaluator labels, Notebook
  outputs, learned-model calls, network calls, ERP writes, and default file
  writes remain outside the runtime path.
- Added a metadata-only append ledger interface for immutable Notebook and
  Engine attempts, direct review/row hashes, linked inputs, and deterministic
  chain verification. Raw answer bodies remain workspace payloads.
- Kept comparison claims narrow: Notebook consumes natural-language prompts,
  while this Engine slice consumes reviewed structured facts. The result tests
  the deterministic judgment layer and does not claim general PDF question
  answering, provider-side byte parity, actual-project readiness, or canon.

- Added a read-only `common_se_corpus_projection` subject adapter that converts an
  immutable, exact-revision common-SE rule projection into bounded Engineering
  Engine expected/observed inputs while preserving binding, ACL, authority,
  digest, `UNKNOWN`/`MISSING`, and deterministic replay boundaries.
- Added a deterministic manual shadow scorer for the fixed seven-oracle matrix:
  seven Engine references plus 21 Notebook-only and 21 synthetic-hybrid human
  review sidecars. It performs no provider login, query, upload, Engine run, file
  write, official acceptance, Task creation, or baseline change.
- Added public-safe source-eligibility and synthetic projection examples. Public
  availability is no longer treated as sufficient external-AI reuse permission;
  exact bytes, revision, SHA-256, and rights remain separate gates. DAPA and ISO
  source bodies remain excluded/HOLD for the external comparison.
- Added `validate:engineering-engine-se-core-eval` and included the new evaluation
  surface in the Engine byte manifest. No actual project data, Notebook answer,
  account identifier, source upload, runtime activation, or UI activation was added.

## 2026-08-11 - Restore classic topology and expose Engineering Engine connections

- Restored the original five-lane Watchtower topology surface with its existing
  node shapes, icons, text hierarchy, directed curves, minimap, controls, and
  read-only inspector instead of the compact provider-sector drill-down.
- Added a second classic-style Engineering Engine graph that renders all tracked
  modules and provider-local `imports` edges fully expanded in five
  semantic lanes. Engine health, runtime, and delivery remain UNKNOWN or
  unobserved; no W1 tone is inherited.
- Kept both read-only topology endpoints and all federation validators unchanged.
  The System page intentionally omits Knowledge and Notebook, and states that the
  Watchtower-to-Engine connection contract is undeclared instead of inventing an
  edge. Runtime and repair execution authority remain false.

## 2026-08-11 - Unified AX topology canvas

- Replaced the separate W1 health and declared-federation consumers on the Team
  Operations Board System surface with one read-only ReactFlow canvas. The
  federation remains the only structure, identity, and edge authority; W1 overlays
  only exact Watchtower node IDs and exact delivery-receipt tuples.
- Added deterministic compact provider sectors with provider-to-group-to-node
  drill-down while preserving all tracked 4 providers, 63 nodes, and 152
  provider-local edges. The UI never invents a cross-provider edge and displays
  `연결 계약 미선언` as an explicit gap.
- Separated category surface color from W1 health borders and status markers.
  Engineering Engine, Knowledge, and Notebook remain runtime UNKNOWN without W1
  health inheritance, and Notebook stays advisory/HOLD. Runtime or repair authority,
  a summary mismatch, or a cross-provider edge now fails the unified view closed.
- Kept non-ready W1 evidence explicitly retained and stale instead of promoting it
  into current health or proven delivery, and added collision-free expanded layouts,
  stale federation labeling, and 44px graph controls.
## 2026-08-11 - Metadata-only NotebookLM bookshelf bundle contract

- Added a pure cross-validator for source-ledger, NotebookLM packet-map, and redacted binding membership/storage metadata, with deterministic synthetic adversarial coverage, separate structural/readiness outcomes, and explicit UNKNOWN project/binding/revision/hash alignment.
- Kept physical source paths, source payloads, accounts, uploads, live queries, canon promotion, and approval authority outside the contract; the canonical RAG validation gate now checks the module and its tests.
## 2026-08-11 - Local activity outbox validity receipt

- Added an atomic, producer-owned receipt that validates each HPP local-activity current index, compact inventory, and referenced immutable delta/snapshot packets. Watchtower monitors only that exact store scope; unchanged data remains healthy idle and all topology delivery edges remain unreceipted.

## 2026-08-11 - Persisted mail, voice, and Slack store validity receipts

- Added atomic sanitized store receipts for bounded Hiworks event file-set/tail validity, voice custody checkpoint/current/history files plus immutable receipt identity, and per-channel Slack custody state/index validity. Watchtower pins each exact `lane` and `validation_scope` value so misrouted receipts fail closed and none imply full mail JSONL or Slack attachment-byte verification.
- Kept collection/provider outcomes independent: an unchanged valid store remains healthy idle through a source/auth failure, while missing or corrupt persisted state fails only its store receipt and preserves the prior last-good watermark.
- Voice activity compares only validated current/history custody identities, not the checkpoint's per-cycle timestamp; ingress store freshness uses the measured 15-minute poll plus bounded validation duration.
- Bound the three store nodes to Watchtower without inferring provider availability or claiming delivery on any of the 33 still-unreceipted topology edges.

## 2026-08-11 - Source-owned local topology receipts

- Added independent sanitized validation receipts for the shared usage ledger, the Board scheduled runtime, and the all-project local-activity producer.
- Watchtower now distinguishes resident from periodic scheduled-task ownership: resident tasks require `Running`, periodic tasks accept `Ready` or `Running`, explicit disable/stop is down, and unknown task state remains UNKNOWN/HOLD.
- Receipt schema and required timestamps fail closed, unchanged activity remains healthy idle, and all topology edges remain explicitly unreceipted.

## 2026-08-11 - AI usage producer liveness heartbeats

- Added atomic, sanitized five-minute heartbeats for the Codex collector, Claude collector, and common Meter ledger projection.
- Watchtower observes each lane independently with a 300-second period and 600-second grace; missing evidence remains UNKNOWN/HOLD unless the owning Board task is explicitly stopped.
- Usage growth is informational only: unchanged tokens/events render as normal idle, while changed ledger activity renders as collecting and never gates health.
- Kept Codex collection attribution stable when the Board runs from an integration worktree by passing the canonical owner root explicitly, and allowed only the forward `unassigned`-to-recorded project enrichment while preserving fail-closed behavior for attribution regressions and payload disagreements.

## 2026-08-11 - Board usage trend by model and provider

- Added a reconciled 30-day KST `model_daily` Meter projection derived from exact
  event timestamps, model IDs, token counts, and token-confidence metadata.
- Replaced the Ledger's provider-only trend with a responsive model-first chart,
  a source-backed provider view, selectable keyboard-operable legend series, and
  exact hover/focus day tooltips. The Board explicitly states that usage path is
  not recorded instead of inferring Desktop, CLI, extension, cloud, or mobile.
- Moved the on-demand Board scheduled controller behind a repository-owned
  `wscript.exe //B //NoLogo` launcher so the interactive limited task and its
  five-minute producer companion remain fully backgrounded without changing
  cadence, read-only boundaries, restart policy, or `StopOnIdleEnd=false`.
- Added the same GUI-subsystem launch boundary to the continuous voice ASR and
  labeling supervisor registrar, preserving its exact PowerShell arguments,
  at-logon/watchdog triggers, 15-minute cadence, and existing task settings.
- Added repository-owned hidden launch boundaries to the remaining periodic
  Hiworks mail, project-local activity, and Slack batch scheduled tasks without
  changing their collectors, arguments, cadence, or authority.
## 2026-08-11 - AX topology federation contract and deterministic declared projection

- Added a strict Watchtower-owned provider-fragment contract and pure federation composer.
  Each subsystem remains the owner of its declaration; Watchtower namespaces and combines
  only allowlisted public-safe structure and never promotes it to runtime, delivery, source,
  answer, approval, or repair-execution authority.
- Added exact adapters for the existing Watchtower catalog, generated Engineering Engine
  topology, public RAG·Graph·Wiki owner-contract bundle, and Notebook advisory contract bundle.
  The tracked projection contains 4 providers, 63 declared nodes, and 152 declared edges.
  Its input byte hashes and full-document digest are deterministic;
  automatic discovery, project payloads, private paths, NotebookLM answers, account/session
  data, runtime health, and inferred cross-provider edges are excluded.
- Added declared-versus-observed exact-set reconciliation so a viewer can surface catalog
  drift rather than silently treating a drawn line as live evidence. Self-diagnosis is
  read-only; repair remains candidate-only and execution authority is fixed false.
- Wired `validate:watchtower` into both root acceptance modes before Team Ops Board. The gate
  syntax-checks the producer, byte-compares a fresh projection with the tracked artifact,
  and runs structural, adversarial, adapter, and existing health-probe tests.
- Bounded verification: Watchtower 44/44 tests pass, generated projection byte check passes
  at 138,739 bytes and SHA-256 `453faee9e2bf6435795925661cb84330bca161f7cf9bd83d370b75b54de592ba`,
  root-step tests 4/4 pass, changed-path policy reports zero violations, and `git diff --check`
  passes. No live binding, external account, project material, runtime, UI, or repair action
  was exercised.

## 2026-08-11 - SE Engineering Engine Phase 2 fourth correction pass: three integration blockers closed

A fresh independent Level-3 verifier replayed 35 attacks against the previous
entry. Thirty-three were refused; the three that were not all had the same shape,
one level up from the previous pass — each individual guard was correct, and the
gap was between them. No earlier guard is weakened: all thirteen suites, the
mutation lock, the exact Git-blob manifest and the frozen Phase 1-0 bundle pass.

- Closed the capsule edge-endpoint gap. Endpoints were resolved against the node
  set only where the traversal happened to reach them, so an edge whose source
  named the declared subject revision but different bytes did not match the
  frontier and was skipped in silence. When that edge was the only way out of the
  seed, the result was a *successful, empty* capsule — a self-contradictory
  projection read by the consumer as "there was nothing here". Both endpoints of
  every supplied edge are now resolved before the walk begins, including edges the
  traversal would never follow, and a mismatch or an undeclared endpoint refuses
  the projection. The traversal-time resolver stays for seeds, which are the one
  traversed ref that is not an edge endpoint. Policy exclusions are untouched: a
  declared, bound node refused by ACL, applicability, edge type or budget is still
  an exclusion.
- Closed the disposition-confirmer self-certification at P8. The acceptor and the
  approver were bound to registration evidence in the previous entry; the
  confirmer was still certifying itself with `confirmed_by_registered_human`, a
  kind and an id, all three written by whoever wrote the event. It is now resolved
  in the same gate-supplied registry, scoped to the chain's binding, at the
  confirmation instant. That instant is read from `confirmed_at` in the record
  body rather than from `provenance.recorded_at`: a content address is computed
  over the record minus its own provenance, so `recorded_at` was editable without
  breaking the seal and could have been slid into whatever validity window was
  needed. The principal-kind check remains alongside the evidence check, because
  being in the registry does not make an agent a human. D-P10-06 stays open and
  the verdict says so: this verifies a recorded confirmation and does not become
  the authority that makes one.
- Fixed generated-topology drift, and the reason it went unnoticed. The committed
  topology recorded `context_receipt.line_count` 632 while a fresh emit produced
  631, and `topology_matches_code` still passed. The cause was the emitter's
  digest: `JSON.stringify(topology, Object.keys(topology).sort())` treats its
  second argument as a key *allowlist* applied at every depth, not a key order, so
  every module and edge entry serialised as `{}` and the digest covered 1060 bytes
  of a 38811-byte document — module names, import edges, export lists and line
  counts were all outside it. The digest now covers the whole document via a
  recursive key-sorted serialisation, and the integration check compares the
  emitted bytes to the committed file rather than the digest, so the second layer
  does not depend on the first being right. `manifest_blob_integrity` asserts both
  the byte equality and that the digest actually moves when a nested field does.
- Verification after the change: 13 suites, 1401 conformance checks, 0 failures;
  mutation lock 144/144 killed, 0 survivors, 0 catalogue errors; exact Git-blob
  manifest 62/62; frozen Phase 1-0 bundle 13/13; topology byte-equal to a fresh
  emit; runtime observation 1:1 with the topology; zero writes. Owner action: none
  required. Two items are recorded rather than closed — `confirmed_at` is not
  ordered against the rest of the chain, and the mutation sandbox cannot run
  `manifest_blob_integrity`, so emitter mutations are verified by hand. No project
  material, private corpus, credential, source PDF, external service, runtime
  activation, ERP write, live P5/P8, UI, MCP transport or learned model was
  exercised.
- Related paths: `guild_hall/engineering_engine/kernel/capsule.mjs`,
  `guild_hall/engineering_engine/kernel/pipeline.mjs`,
  `guild_hall/engineering_engine/tools/emit_topology.mjs`,
  `guild_hall/engineering_engine/tools/phase_1_integration_check.mjs`,
  `guild_hall/engineering_engine/tests/`,
  `guild_hall/engineering_engine/contracts/`,
  `guild_hall/engineering_engine/topology/`.

## 2026-08-11 - SE Engineering Engine Phase 2 third correction pass: four fail-open defects closed

A fresh independent Level-3 verifier reproduced nine attacks against the previous
entry. Every one of them exploited the same shape: a check existed, and the thing
being checked was allowed to supply the answer. None of the earlier guards is
weakened here — all thirteen suites, the mutation lock, the exact Git-blob
manifest check and the frozen Phase 1-0 bundle still pass.

- Closed the Context Capsule node-set defects (five reproduced attacks). A node
  the traversal reached but `graph.nodes` did not declare was dropped as an
  exclusion, so a walk that had passed through an unwitnessed node still returned
  `every_returned_ref_bound_to_the_selector: true`; it now refuses the whole
  selection. Refs are matched on the complete exact-ref identity tuple, content
  id included, so an edge naming the declared subject revision but different
  bytes is a contradiction in the slice rather than a match, and a forged edge
  target content id can no longer reach `included_refs`. A node set may no longer
  declare one logical node twice: the previous build overwrote the first entry,
  so with two declarations under different bindings, cross-project isolation
  turned on array order. `project_binding_unknown` is gone from the closed
  exclusion list, because an unwitnessed node is a broken projection rather than
  excluded material. The fully bound two-hop capsule remains the positive control.
- Bound P5, the generation advance, the pre-P7 policy gate and the P8 writer to
  verifiable registration evidence (two reproduced attacks). `kind:
  'registered_human'` and `authority.registered === true` are fields the caller
  writes, so a self-declared principal and an `authority_ref` naming nothing that
  exists both cleared the boundaries the contract is most emphatic about. A new
  `kernel/registration.mjs` verifies a supplied, content-addressed registration
  registry: entry addresses and the registry address are recomputed, and the
  registry address must be the content id of the revision it claims to be. Lookup
  is scoped to the project, to the authority family where one applies, and to the
  instant the boundary is cleared. A caller asserting its own `registered` or
  `applicability` is refused rather than ignored. P8 supplies the one registry
  every registration in its chain is checked against, so a chain can no longer
  carry the evidence that vouches for its own acceptor.
- Bound the P5 orchestration boundary's `authority_ref` to the same evidence (one
  reproduced attack). Three records sharing one arbitrary nonexistent reference
  satisfied the old rule, because whoever assembles the three writes all three.
  The reference now has to resolve in the same registry, project and authority
  family at the instant of the exchange, and a pair whose two halves name
  different authorities is refused. Candidate-only behaviour, a generation
  advance of zero and the exact two-receipt linkage are preserved and asserted.
- Made the exact two-source authority invariant require exact typed refs and
  coherent times (one reproduced attack). A bare string was read as a revision
  id, so two different strings counted as two different revisions while neither
  could be resolved to any bytes; `valid_at` and `known_at` were not checked at
  all. Both guard layers now require a fully formed exact revision ref and two
  canonical instants with `known_at` at or after `valid_at`, and name the failed
  property. The exact baseline-versus-wiki control still holds, with baseline
  precedence and both lineages preserved.
- Verification after the change: 13 suites, 1374 conformance checks, 0 failures;
  mutation lock 142/142 killed, 0 survivors, 0 catalogue errors; exact Git-blob
  manifest 62/62; frozen Phase 1-0 bundle 13/13; runtime observation 1:1 with the
  topology; zero writes. Owner action: none required. `D-P10-08` (who may be
  registered as a P5/P8 approver) stays open — the kernel verifies supplied
  evidence and consults no live registry, so what closed is only the state where
  saying so was enough. No project material, private corpus, credential, source
  PDF, external service, runtime activation, ERP write, live P5/P8, UI, MCP
  transport or learned model was exercised.
- Related paths: `guild_hall/engineering_engine/kernel/`,
  `guild_hall/engineering_engine/fixtures/registration_evidence.mjs`,
  `guild_hall/engineering_engine/tests/`,
  `guild_hall/engineering_engine/contracts/`,
  `guild_hall/engineering_engine/topology/`.

## 2026-08-11 - SE Engineering Engine Phase 2 second correction pass: five weak guards tightened

An independent review of the previous entry found five contract failures. The
green evidence behind that entry was real and none of it is weakened here: every
suite, the mutation lock and the exact Git-blob manifest check still pass. What
the five findings had in common is that a check existed in a form too weak to
hold the property it was named after, and that a passing suite could not tell the
difference.

- Made `engine_self_topology` validate the exact receipt-key set instead of
  reading a non-empty receipt map as a recorded observation. The observation
  summary now declares the edge key set it produced receipts for
  (`edges.exercised_edge_keys`), and the map has to be exactly that set, every
  key has to be an edge the topology declares, and every receipt has to name its
  own edge and its own run. An unexpected, misfiled, foreign-run, malformed,
  stale or failed receipt can no longer make a declared edge `present`,
  `satisfied` or `absence_confirmed`; it leaves the edge unknown and costs the
  run its right to report other edges as confirmed absences. A fresh, exact,
  same-run receipt map still satisfies, and that positive control is asserted.
- Made the complete node set mandatory in the Context Capsule selector.
  `graph.nodes` was optional, which made every edge the only witness to its own
  project binding and left a forged binding indistinguishable from a true one.
  The selector now refuses an omitted node set, a node without an exact revision
  ref, and a node without a binding; it refuses undeclared nodes, mixed
  node/edge bindings and multi-hop cross-project reach; and it re-checks every
  ref it is about to return before returning it. A fully bound capsule is kept as
  a positive control.
- Made the P8 gate fail closed on provenance rather than on object shape. Every
  chain record and the approval now carry immutable provenance whose content
  address is recomputed here from the record's own content, so a link edited
  after it was recorded fails even when every field still looks right. The four
  boundary verdicts — P5 acceptance, generation advance, the P7 policy gate and
  the TaskDriver — are re-run from the inputs the records carry and must
  reproduce exactly, because `passed: true` is a claim rather than a result. The
  project binding is checked on all ten records plus the approval instead of
  four; the context/authority gate must also carry applicability, a registered
  authority family and this snapshot; the disposition confirmation must name a
  registered human principal rather than only set a flag; and the evidence must
  carry receipt material that hashes to the content address it declares. Zero
  ERP writes are preserved and one fully pinned valid chain remains the positive
  control.
- Made the Context Response candidate content-addressed to its exchange. It was
  matched to its receipts on response id, binding and generation alone, so an
  answer to request B carrying source B passed against the receipt pair for
  request A. The candidate now also carries and must match the request id, both
  receipt ids, the response content hash, the CAS fingerprint, the exact source
  and artifact revision refs, the principal, the registered authority, `valid_at`
  and `known_at`; each receipt can refuse on its own; and P5 evaluability is
  false unless both exact receipts and every linkage, sufficiency and
  applicability check pass. The response remains a context candidate, with no
  generation advance, live P5, transport or writer activation.
- Made the O4 two-source authority invariant exact. "A conflict was recorded with
  both sides retained" also holds for a source quoted twice, two reviewed-wiki
  claims, one revision, an agreeing pair and an unresolved applicability, none of
  which is a two-authority disagreement. Two guards now hold it:
  `recordSourceConflict` refuses to build a record that is not a disagreement,
  and `assertTwoSourceAuthorityInvariant` refuses to conclude from a record that
  is not exactly one `project_contract_baseline` against one `reviewed_wiki`, on
  distinct revisions, actually disagreeing in normalised value, both applicable,
  lineage preserved on both sides, with the baseline governing. Both layers are
  attacked separately, and a genuinely disagreeing pair is the positive control.
- Removed three guards that had become strictly redundant once the checks above
  were in place, rather than leaving them as coverage that could not fail.
- Verification after the change: 13 suites, 1305 conformance checks, 0 failures;
  mutation lock 116/116 killed, 0 survivors, 0 catalogue errors; exact Git-blob
  manifest 60/60; frozen Phase 1-0 bundle 13/13; runtime observation 1:1 with the
  topology. No project material, private corpus, credential, source PDF, external
  service, runtime activation, ERP write, live P5/P8, UI, MCP transport or
  learned model was exercised, and no actual project identifier appears anywhere
  in this change.

## 2026-08-11 - SE Engineering Engine Phase 2 revision: frozen-contract corrections

- Corrected `P7` in `guild_hall/engineering_engine/`. The previous entry recorded
  that the frozen contract did not define it; that was a reading error, not an
  open owner decision. `engine_plan_v1_2.md`, `engine_plan_v1_2_1.md` and the
  frozen `phase_1_0_work_lanes.yaml` `p7_taskdriver` gate all define P7 as the
  TaskDriver, preceded by a `why` / `why-now` / `authority` / `idempotency`
  internal policy gate. `pipeline.mjs` now implements the gate as its own
  function whose result P7 requires, so P7 cannot be reached around it. No live
  TaskDriver is activated: the verdict is candidate-only with a zero ERP delta.
- Made `evaluateP8Write` require the whole validated lifecycle chain instead of
  succeeding on a task intent that had merely stopped calling itself a candidate.
  Twelve chain elements must be present and must agree with each other:
  acceptance, generation advance, snapshot, finding, append-only disposition
  event confirmed by a registered human, the context/authority gate, the P6 task
  intent, the policy gate, P7, one shared project binding, and immutable
  receipt/CAS evidence. An approval whose approver is an agent, an engine or a
  model is refused. The function performs no write and reports zero.
- Made the Context Capsule selector validate every edge before traversal and
  require every traversed edge and node to carry the selector's project binding.
  Cross-binding material is refused on the way in rather than filtered after
  reading it, and a projection that declares node bindings fails closed on an
  undeclared node.
- Stopped capsule exclusions from carrying the identifier they refused. An
  exclusion is now a closed reason, a hop and a count. The frozen O6 forbids a
  denied ref anywhere in the capsule payload, and an exclusion list is capsule
  payload; the previous behaviour handed back exactly what the ACL withheld.
  Enforcement is recursive over the whole returned object.
- Stopped the subject adapter from reading the presence of a receipt key as
  proof of traversal. Each receipt is judged against a declared freshness window
  first, so a stale, failed or malformed receipt yields `unknown` rather than
  `present`, and a receipt that could not be believed also costs that run its
  right to report other edges as confirmed absences.
- Made conflict findings retain every disagreeing source claim.
  `recordSourceConflict()` returns the precedence verdict and the retained claims
  together, and a conflict signalled without its sides is refused. Authority
  resolution alone loses the lower-tier side, which is the failure the frozen O4
  case exists to catch.
- Added the smallest synthetic Phase 3 receipt slice, `kernel/context_receipt.mjs`:
  immutable Context Request and Context Response receipts, each distinct from the
  candidate it attests, plus the still-a-candidate response and an evidence
  sufficiency and authority applicability gate. Both receipts and the validated
  response candidate are required before the P5 orchestration boundary can even
  be evaluated; missing, mismatched, stale or cross-project receipts stop the
  sequence. The four receipt kinds in the engine — topology delivery, MCP
  idempotency response, context request, context response — are named and kept
  apart. No transport, no external service, no live P5, no generation advance and
  no ERP write.
- Made the byte manifest deterministic against the bytes Git will commit rather
  than the bytes a checkout happens to hold, and verified the derivation against
  `git hash-object` on every emit. Added `tests/manifest_blob_integrity.mjs`,
  which checks the committed manifest against a fresh emit, against Git's clean
  filter, and against the staged blob bytes; it is part of the integration check.
  The previous manifest disagreed with the committed content for four files and
  nothing noticed, because nothing verified it.
- Phase 1–4 baseline remains `deterministic_only`. No project material, UI,
  runtime, MCP execution, ERP writer or learned model was exercised, and no
  actual project identifier appears anywhere in this change.
## 2026-08-11 - Grill Me frontier-round interview update

- Updated the `grill_me` candidate and Codex bridge to map decision dependencies
  as a design tree, ask the current independent frontier in numbered rounds,
  and recompute the frontier after each Owner response.
- Added a fact-versus-decision boundary: discoverable facts are gathered from
  approved local context, while Owner decisions remain interactive and cannot
  be delegated or inferred.
- Preserved the explicit confirmation gate, optional one-at-a-time fallback,
  no-implementation boundary, compact decision register, and local runtime
  binding separation.

## 2026-08-11 - Headless HWP-to-HWPX normalization contract

- Expanded `HWP_NORMALIZATION_V0.md` with the official Hancom Automation and
  security-module pointers, the verified 32-bit `HWPFrame.HwpObject` binding,
  and the exact hidden `Open`/`SaveAs(HWPX)`/cleanup sequence.
- Locked normalization to a read-only workspace copy, a run-owned temporary
  registry value, zero visible HWP windows, exact source/output hashing, HWPX
  ZIP/XML validation, and fail-closed password/DRM/corruption handling.
- Separated HWP-to-HWPX normalization from HWPX ZIP/XML editing and from the
  later PDF full-page visual-QA gate. No reusable production runner, workflow,
  skill, root routing change, or deployment approval was added.
## 2026-08-10 - SE Engineering Engine Phase 1 lanes complete

- Completed all six Phase 1 lanes under `guild_hall/engineering_engine/`: 1A
  snapshot envelope, state axes, Finding and Context Request schemas and the
  P5–P8 boundary contract; 1B source inventory, byte custody, eligibility and
  knowledge lineage; 1C typed graph projection and bounded Context Capsule; 1D
  MCP request admission, idempotency, CAS and serialisation; 1E module ABI,
  project binding, release artifact and rollback; 1V mutation lock. Each lane
  ships a kernel module, a contract document and a conformance suite with no
  external dependencies.
- Closed owner decision `D-P10-03`: a single serialised boundary inside the
  engine issues every permanent identifier, identifiers are opaque UUIDs, and a
  collision is rejected rather than retried. A consequence is enforced in code —
  work that runs in parallel cannot mint, so candidate findings carry a
  content-derived handle and the identifier is minted at a serialised boundary.
- Closed owner decision `D-P10-07`: canonical time carries exactly three
  fractional digits, fixed. Widening it later would silently invalidate every
  fingerprint already computed.
- Adopted a single custody mode, `hash_pinned_with_cited_span_retention`: the
  original stays where its owner keeps it with its byte hash pinned, and only the
  span that was actually cited is retained immutably. Per-source modes are
  refused, because a snapshot whose sources carry different replay guarantees has
  no single answer to whether a conclusion can be reproduced.
- Added `tools/emit_topology.mjs`, which derives the engine's structure from the
  engine rather than describing it: module edges are parsed from the actual
  `import` statements, boundaries are read from the lane 1D operations table, and
  the remaining vocabularies are read from the modules that own them. The
  integration check compares the committed topology against a fresh emit, so a
  stale topology fails instead of misleading.
- Added `tools/phase_1_integration_check.mjs` as the single Phase 1 gate: every
  conformance suite passes, the mutation lock kills every mutation, the frozen
  Phase 1-0 bundle still matches 13/13, each frozen field group has exactly one
  owning lane, the committed topology matches the code, and no suite writes.
- Verification strength is recorded per lane rather than averaged. Only the
  Phase 1-0 substrate is judged against the independently reviewed frozen oracle;
  the five lane suites carry author-written fixtures, and the mutation lock is
  self-authored, so semantic independence remains an unmet obligation. The
  mutation lock found three real coverage holes before it went green.
- Recorded that the frozen Phase 1-0 contract names `P5`, `P6` and `P8` but does
  not define `P7`. No stage was invented to fill the numbering; it is carried as
  an open item.
- No project material, UI, runtime, MCP execution, ERP writer or learned model
  was exercised. Phase 1–4 baseline remains `deterministic_only`.

## 2026-08-10 - SE Engineering Engine owner root and deterministic kernel

- Added `guild_hall/engineering_engine/` as the owner of the cross-project
  evidence-based systems-engineering judgement engine, with its deterministic
  no-LLM kernel and Phase 1-0 contract implementation. The engine consumes
  `rag/`, `knowledge_graph/`, `knowledge_access/`, and `knowledge_canon/` through
  adapter contracts only and copies no provider code.
- Widened the `guild_hall/` charter in `TARGET_TREE.md` and
  `DOCUMENT_OWNERSHIP.md` from operations-only to cross-project functional owner,
  which now explicitly covers knowledge supply, projection, and deterministic
  domain engine contracts. Project payload, contract bodies, source PDFs,
  snapshot payload, and secrets remain excluded.
- Recorded that the `guild_hall/` child enumeration is owned by
  `guild_hall/README.md`; the foundation tree shows representative children and
  fixes root boundaries only. This removes a drift where the tree presented seven
  children as fixed while the root held far more.
- Phase 1–4 baseline is `deterministic_only`. No learned model invocation, no
  embedding or reranker on the authoritative path, no runtime, no UI, no ERP
  writer, and no actual project access were added.
## 2026-08-10 - Board runtime idle persistence and active Codex collection

- Prevented the canonical Windows scheduled runtime from being stopped when
  workstation idle ends by requiring `IdleSettings.StopOnIdleEnd=false` in the
  exact task contract and registration surface.
- Kept the completed-session Codex sweep unchanged, then added a separately
  isolated `--include-active` collection for exact lifecycle-started session
  files observed within 15 minutes. One conflicting active session now remains
  fail-closed without blocking forward collection from other active sessions.

## 2026-08-10 - Board 15-day exact provider token history

- Extended the sanitized Meter provider-day projection from 7 credit-only days
  to 15 KST days with nullable exact local token totals per provider. The Board
  chart now uses those token observations only and labels missing local evidence
  explicitly. Request-count-only events carry an exact unknown-token count and
  are excluded from token totals; quota percentages, requests, and credits are
  never converted into token series.
- Claude coverage remains Claude Code local ledger evidence. Claude Desktop/app
  and account-wide token totals stay unavailable because the authorized OAuth
  usage surface supplies quota windows, not exact token usage.
## 2026-08-10 - AI usage meter quarantine-aware backfill planner

- Added a deterministic, read-only backfill plan that separates candidate,
  replay/no-op, active, conflict, and malformed evidence while binding output to
  source, canonical, and plan digests. Divergent source or canonical identities
  remain quarantined without a timestamp- or token-based winner.
- The planner cannot apply or partially write; hook activation, canonical ledger
  backfill, provider access, runtime, and scheduler behavior remain unchanged.

## 2026-08-10 - AI usage meter Phase B feature-OFF observation

- Added independent hook-delivery and token-projection health, four exact Stop
  dry-run outcomes, source freshness separate from report generation time, and
  deterministic pending-JSONL conflict HOLD planning. Hook manifest drift stays
  digest/count-only; no hook, runtime, provider, network, ledger, or backfill
  activation was added.

## 2026-08-10 - Team Operations Board read-only topology snapshot

- Read-only pilot topology now reads and strictly validates only the existing
  protected Watchtower snapshot. Refresh rereads that same snapshot without a
  probe, subprocess, scheduler query, network request, or write, and exposes it
  only as stale/HOLD evidence; missing or invalid evidence fails closed.

## 2026-08-10 - Team Operations Board bounded child supervisor

- Changed the trigger-free on-demand task action into a lifetime controller
  that owns one loopback-only Board child. While explicit Owner intent remains
  running, an unexpected child exit or non-ready observation records bounded
  metadata and can create a new child generation with a short, capped retry.
- Explicit stop records stop intent before gracefully ending the child and
  controller, so it cannot restart. Provider access, topology writes, startup
  triggers, services, elevation, firewall, Funnel, and credential handling are
  unchanged; controller-process failure remains an explicit residual risk.

## 2026-08-10 - Team Operations Board Owner-controlled stay-on runtime

- Added an atomic OS-local desired-state and monotonic intent epoch so the
  on-demand Board remains normally off, starts only on explicit Owner request,
  keeps running until explicit stop, and reports stale reboot intent as
  recovery-needed without adding any trigger or autostart surface.
- Bounded Scheduler failure recovery to three retries at one-minute intervals
  while intent is running. Explicit stop is idempotent, records stop intent
  before shutdown, and prevents restart; the registered task remains
  interactive, limited, trigger-free, credential-free, and loopback-only.
- Added a redacted termination receipt before stop, recovery, or unregistration
  removes evidence. Normal stop, handled error, native crash, external
  termination, dependency loss, and unknown remain distinct. The previously
  observed markerless worker loss remains root-cause UNKNOWN/non-reproduced;
  the confirmed prior gap was missing restart, intent, LastTaskResult, and
  receipt evidence rather than a proven application failure.

## 2026-08-10 - Team Operations Board Windows read-only runtime controller

- Replaced the interactive-tool-owned launch path with one explicit Windows
  on-demand Scheduled Task for the already-approved read-only Board. The task
  has no triggers, stored credential, elevation, service, or autostart; it runs
  only for the current interactive user and stores only the integrated runtime
  action. Strict loopback `127.0.0.1:4192`, single-instance ownership, exact
  graceful stop, and fail-closed recovery remain mandatory.
- The scheduled worker derives its canonical owner root, existing loopback
  Serve Host, and private default Board bindings only in process memory. No
  protected value enters task arguments, task metadata, repository files, or
  logs. Scheduled-mode Claude quota access is OFF by default; its exact operator
  opt-in crosses only a run-ID-attested in-memory launch channel and is never
  stored in task arguments, XML, runtime records, or logs. Metadata-only task
  status reports zero triggers/credentials, owner match, action digest, and
  task/runtime health classes.
- Added heartbeat-backed lifecycle evidence so a handled runtime failure stays
  distinct from a ready marker whose process or listener disappeared. Exact
  stale-record recovery and task unregistration remain bounded and never force
  process termination or mutate Tailscale, firewall, LAN, or public exposure.

## 2026-08-10 - Team Operations Board responsive Fleet status rows

- Added a bounded narrow-screen override for Fleet status rows so names,
  descriptions, metadata, and state labels wrap without horizontal clipping;
  relevant mobile controls retain accessible touch targets while desktop and
  iPad layouts and all provider, quota, and topology semantics remain unchanged.
- Added a bounded iPad and coarse-touch override for the skip link, Board mode
  controls, and live refresh control so their visible targets remain at least
  44 CSS pixels without changing desktop layout or application semantics.

## 2026-08-10 — Team Operations Board Claude quota read-only recovery

- Added the exact `TEAM_OPS_BOARD_CLAUDE_QUOTA_READ=1` opt-in for the existing
  official Claude quota GET while the Board read-only pilot is enabled. The
  default pilot remains disabled before credential access, non-pilot behavior
  is unchanged, and the request keeps its 6-second timeout and minimum
  120-second cadence without login, persistence, or provider mutation.
- Advanced the provider-limits snapshot to additive schema v2 with redacted
  Claude attempt, outcome, last-success, and source-owned freshness metadata.
  Last-good quota stays process-memory-only across a failed attempt; stale,
  error, disabled, and unknown states remain explicit and never fabricate a
  current or green value. The official quota panel remains independent of the
  common Meter ledger and its usage-history windows.
- Added provider-read failure backoff: five-minute exponential cooldown capped
  at one hour, compatible with bounded `Retry-After`, with single-flight local
  refreshes and zero repeated provider GETs during cooldown. A retained
  last-good value becomes `STALE` immediately; without one the official quota
  remains unavailable/`UNKNOWN`, never zero or green.

## 2026-08-09 — Team Operations Board local tailnet Host allowlist

- Added a fail-closed, local-process-environment-only Vite Host allowlist for
  one canonical lowercase `.ts.net` FQDN. Blank or malformed values leave no
  custom host exception, and development and preview use the same resolved
  array.
- The loopback bind and read-only pilot disables remain unchanged; this adds no
  network listener, firewall change, runtime activation, or public exposure.

## 2026-08-09 — Team Operations Board read-only pilot boundary

- Added the explicit `TEAM_OPS_BOARD_READ_ONLY_PILOT=1` fail-closed mode. In
  pilot mode, Claude provider-limit probes stop before credential or OAuth
  access, Antigravity quota probes stop before local RPC or cache reads/writes,
  and auto-enrollment, subagent receipt enrollment, lifecycle reconciliation,
  and result-gate writes are disabled. Common-ledger Claude provider rows and
  topology diagnostics remain available as read-only evidence.
- Unavailable pilot surfaces remain `UNKNOWN`/null and never fabricate
  zero/green, current, healthy, live, or E2E state. Corrected the three existing
  `App.tsx` TypeScript errors by aligning the forced reload callback ref and
  typing both `structuralPaths.direct` edge callbacks.
- This revision does not activate a collector, runtime, LAN or firewall access,
  scheduler, authentication, HTTPS, or public exposure.

## 2026-08-09 — AI usage topology read-only Claude evidence diagnostics

- Added backward-compatible Board history v3 provider rows sourced only from
  ledger `source.kind`, while retaining v2 input with provider evidence masked
  as unknown. The redacted Claude collection envelope carries only attempted
  collection/source-observation evidence, explicit freshness rules, and safe
  counts; it does not claim provider health, availability, live/E2E state,
  aggregate health, or completeness.
- Changed the Team Operations Board diagnostics usage refresh to the mandatory
  read-only projection path. It validates existing scoped meter evidence and
  does not invoke collection, apply/write work, lifecycle reconciliation,
  provider login, or network access.
- Added selected-node inspection for safe evidence, direct/all structural paths,
  keyboard/mobile close behavior, and explicit non-live/non-receipt boundaries.
  A valid v3 Claude row now remains visible as last-known ledger evidence while
  `latest_usage_at` independently determines fresh versus prominent `STALE`;
  collection-attempt state/reason/time stays separate and cannot make an old
  row current. v2/no-row remains unknown, and zero still requires a fresh
  successful empty collection window. `collect-claude` now exits nonzero on a
  collector error with only redacted safe error evidence. A mutation remains
  `Owner 승인 필요` rather than an executable Board action.

## 2026-08-08 — Workspace Board provider topology observation boundary

- Made generic Watchtower node text distinguish a structural/catalog-only
  `unmonitored` relation from observed health, including the safe reason rather
  than relying on color alone. The surface explicitly says that retained
  `REFRESHING`/`HOLD`/`STALE` topology snapshots do not assert Claude or
  Antigravity provider success, independent provider evidence, or per-edge
  receipts, and exposes last-success/last-failure age text. The Fleet row now
  derives Watchtower state only from exact `watchtower_self` evidence; retained
  or unmonitored projections remain textual `HOLD` and never aggregate to green.
- Owner-side provider panes no longer retain prior Claude, Antigravity, or
  provider-limits payloads after a failed refresh. Polling is bounded,
  single-flight, generation-guarded, and clears prior values before refresh.
  Alongside this UI behavior, B1 hardens the existing topology adapter's
  validation and refresh semantics. No new adapter or plugin, no new schema
  version, and no credential, network, or runtime surface was added.

## 2026-08-08 — Workspace Board model-distribution bar correction

- Restored the missing teal fill for `모델별 토큰` rows in the cumulative usage
  distribution. Values and proportional widths were already present; the model
  column alone lacked its visual tone rule. Added a boundary regression covering
  every declared distribution tone.

## 2026-08-08 — Workspace Board 시스템 토폴로지 의미·가독성 보강

- Watchtower W1 운영 토폴로지에 입력·감독·연산·저장·판단·출력의
  외곽 도형, 실제 서비스 아이콘, 상태별 초록·주황·파랑·빨강 표현,
  lane 경계와 선택 경로 집중 표시를 추가.
- 열 간격 440px·행 간격 144px의 넓은 좌→우 배치와 간선별 독립
  포트를 적용. 모든 target은 왼쪽 IN, source는 오른쪽 OUT에 고정하고
  화살표·분산된 직교 경로·확대/축소·전체 보기·미니맵을 제공.
- W1 권한과 반대로 보이던 다섯 연결을 `수집기 상태 신호 → Watchtower
  검사·판정` 입력으로 바로잡고, Watchtower의 출력은 Workspace Board
  판정 스냅샷 하나로 제한. 노드 22·간선 25의 endpoint·방향·포트
  고유성 회귀 검증을 추가.
- 마름모·사선 입력·출력형처럼 pseudo-element가 외곽 도형을 소유하는
  노드에서 미감시·hover·선택 상태의 직사각형 wrapper 배경과 그림자가
  새던 모바일 회귀를 제거. 상태색은 실제 외곽 도형 내부에만 남긴다.
- `LIVE STATUS`의 활성 세션 수에서 별도 `결과 확인` gate를 제외하고,
  각 작업 행에는 실행 연결 상태를 초록(연결)·주황(대기)·회색
  (종료/미확인)으로 따로 표시. 미수락 결과 gate의 파란 의미를 연결
  상태와 혼동하지 않도록 분리했다.

## 2026-08-08 — 미터 다중 공급자 원장 (Claude 편입, AG 요청수 준비)

- usage-event 원장이 세 공급자를 수용한다: `source.kind`와
  `token_confidence`를 1:1 고정쌍으로 확장(codex=exact_cumulative_delta,
  claude=exact_per_message, antigravity=request_count_only)하고 정적
  이벤트 스키마도 lockstep 갱신. `collect-claude`는 세션 전사에서 같은
  `message.id` 중복 관측(최대 6배 과계상)을 제거해 메시지 단위 정확
  이벤트를 만들고, 프로젝트 귀속은 작업 폴더 말단 슬러그 파생 +
  로컬 바인딩 재지정(`bindings/claude_project_binding.json`), 경로
  원문은 이벤트에 넣지 않는다. 비-Codex 크레딧은 통화 혼합을 막기 위해
  전부 `rate_unknown`(USD 예상 비용은 표시 계층 환산 전용).
- Board 스냅샷 로더에 `--include-provider` 도입: Codex는 exact 스레드
  게이트 유지, 로컬 소유 Claude/AG 전사는 전량 합류. Board 자동 체인에
  `collect-claude`(10일 창)와 provider 포함 플래그를 연결 — 라이브
  적용 결과 원장 10,847 이벤트, 오늘 1,178턴·294M tok, 모델별
  sol 1.31B·fable 360.7M·opus-5 139.3M 병합 표시, Claude 7일 예상
  $831 병기. 미터 86/86 · Board 233/233.
- Antigravity 수집기는 파이프라인·테스트 완성 상태로 대기: 실데이터가
  0건인 이유는 (a) conversation 인덱스가 7/25 이후 stale, (b) hot-WAL
  DB가 immutable 읽기에서 비어 보임 — 완화(mode=ro 전환 또는 파일
  mtime 시간원)는 Owner 결정 게이트로 남김.
- (같은 날 후속 3) Antigravity 요청 수 실수집 개통: 2.0이 구
  인덱스(conversation_summaries.db)에 새 대화를 쓰지 않음을 확인하고,
  인덱스 미포함 대화는 DB 파일 min(생성,수정)시각을 관측 시각으로 쓰는
  폴백(수집 창 --max-age-days, 기본 45일)을 추가 — 실측 648 이벤트
  (gemini-3.6-flash 413턴 등 12개 모델)가 원장에 합류. Owner가 관측한
  "Gemini Flash 3.6 응답"의 계측 경로가 이것으로 닫힘. 모델별 패널이
  토큰>0 필터로 AG를 숨기던 표시 결함을 고쳐 "요청 수 · Antigravity"
  줄(모델별 N회, 앱 종료와 무관하게 원장 기준 상시 표시)을 추가.
- (같은 날 후속 2) Antigravity 공식 잔여 쿼터 로컬 관측: 실행 중인
  language_server의 로컬 RPC(RetrieveUserQuotaSummary)가 앱 화면과 동일한
  그룹별 잔여율(Gemini/Claude+GPT × 주간·5시간, resetTime)을 무인증으로
  반환함을 확인 — 외부 API 호출·토큰 취급 없이 프로세스 포트 발견
  (tasklist/netstat)으로 조회하는 어댑터를 추가하고 남은 한도 패널에
  AG·Gemini/AG·Claude+GPT 행을 창 그룹별로 합류시켰다(앱 종료 시 행은
  정직하게 사라짐). 보드 자동 체인의 보조 수집기(claude·antigravity)는
  best-effort로 강등 — AG 앱이 대화 DB를 점유해 수집이 타임아웃돼도
  스냅샷 체인이 죽지 않는다(회귀 테스트 고정).
- (같은 날 후속) Owner가 Antigravity 2.0을 실행하며 게이트 승인:
  AG sqlite 읽기를 immutable 없는 read-only(mode=ro)로 전환해 hot-WAL
  내용을 보게 했고, `collect-antigravity`를 Board 자동 체인에 연결
  (새 대화가 생기면 요청 수가 원장에 흐름 — 2.0의 그룹별 공식 잔여
  %는 로컬에 저장되지 않음을 확인). Claude 공식 창은 OAuth 응답
  `limits[]`의 scope.model 항목으로 Fable 전용 주간 %를 분리 표시하고,
  재조회를 2분으로 단축·관측 시각을 패널에 병기, 리셋 표기는 다음
  갱신일(요일) 중심으로 바꿈.

## 2026-08-08 — guild_hall 문서 색인 주제별 재편

- `docs/architecture/guild_hall/README.md` 의 문서 역할 색인을 평면 63행
  나열에서 6개 주제 절로 재편했다: 조직·역할·모델 프로파일 / 지식·RAG·
  온톨로지 / 자동화·야간운영·사용량 / 상태 투영·대시보드 / 메일·알림 계약 /
  구현 surface README. "무엇을 알아야 하는지"로 먼저 찾고 그 줄의 문서만
  읽도록 안내 문구를 앞에 두었다.
- 색인에 빠져 있던 `KNOWLEDGE_ASSISTANT_ACTIVATION_PLAN_V0.md`,
  `RAG_SOURCE_FAMILY_PROMOTION_POLICY_V0.md`,
  `DEV_WORKER_NEXT_STEPS_REVIEW_20260517.html` 세 건을 등재했다. 이제
  `docs/architecture/guild_hall/` 의 모든 문서가 색인에 있다.
- 표와 거의 같은 내용을 반복하던 하단 `관련 경로` 링크 목록 54행을
  제거하고 표 자체를 링크로 만들었다. 131행 → 120행.
- 조직·역할 절에 현재 실제 조직 상태가 문서가 아니라 두 개의 untracked
  local source(`organization_governance_overlay.v1.json` 조직 골격,
  `thread_visibility.v1.json` thread 등록)에 있고 서로 자동 동기화되지
  않는다는 점을 명시했다.
- `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md` 기본 원칙에
  `docs/architecture/<group>/*.md` wildcard 가 문서군 선적재를 뜻하지
  않으며 그 문서군 README 색인을 먼저 읽고 새 문서 추가 시 같은 변경에서
  색인에 한 줄을 남긴다는 규칙을 추가했다.
- 운영 영향: `AGENTS.md` 는 변경하지 않았다. 자동 적재 문서가 늘지 않으며,
  조직·역할·모델 프로파일 문서를 찾을 때 진입점이 색인 한 곳으로 고정된다.
- 관련 경로: `docs/architecture/guild_hall/README.md`,
  `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`

## 2026-08-08 — Usage history v2 (모델·활동·한도) + Fleet 호스트 스탯

- AI 사용량 미터 board-history sidecar를
  `soulforge.ai_usage_board_history_snapshot.v2`로 확장: 모든 윈도에
  `models` breakdown(`model_id`, unknown→`unassigned`)을 추가하고, 루트에
  `activity`(KST 40일 daily 시리즈 — 마지막 날은 `calendar_day` totals와
  일치해야 함 + 24칸 hourly 히스토그램 — 합이 all-time totals와 일치해야
  함)와 `rate_limit`(이벤트가 이미 수집하던 `rate_limit_snapshot` 중 최신
  관측 + `observed_at`; 로컬 추정치 아님)을 추가했다. 정적 AJV 스키마는
  `ai_usage_board_history_snapshot.v2.schema.json`으로 개명·동기화, Board
  코어 미러 검증기도 lockstep 승격 (미터 75/75 · Board 202/202 테스트).
- Workspace Board Fleet Monitor: 주간 한도 카드가 Codex 텔레메트리의 실제
  `used_percent`·리셋 카운트다운을 표시(90% 이상 red tone), 오늘/이번 달
  카드는 40일 daily 시리즈 기반 실데이터 스파크라인으로 전환. 스탯
  스트립에 호스트 관측(CPU 스파크라인·MEM·드라이브별 DISK·UP —
  `/host-stats.snapshot.json` loopback 어댑터, fail-closed 코어 뷰모델)과
  우측 총 사용 토큰·일평균(rolling 30d/30)·일 MAX(40일 daily 최대)를
  추가했다.
- 업무 현황·이력 표면에 `활동 빈도` 섹션(일자별 area 차트 + 시간대별
  0–23시 bar 차트, KST·CODEX 스코프 명시)을 추가하고, 분포 섹션에
  `모델별 토큰` 열을 추가했다. 분포 열이 `{top, other}` 구조를 배열로
  기대해 모든 열이 "귀속 항목 없음"으로 비어 보이던 기존 버그를 수정 —
  실제로는 프로젝트/모델/work/task 귀속이 이미 축적되어 있었다
  (`unassigned`는 "미귀속"으로 표기).
- 분포의 `프로젝트별 토큰`을 조직 라벨 기준으로 재구성: 등록부
  `display_label`의 `[프리픽스]`(AX·SYSTEM·KVDS·저주파 SAS 등)로 task
  사용량을 재집계하는 표시 전용 뷰이며, 읽을 수 없던 `codex.<uuid>`
  work열은 제거하고 미터의 저장소 귀속은 `귀속 코드별 (미터 바인딩)`
  열로 분리했다. Board 어댑터의 history 스냅샷 top-n을 10→50으로 올려
  등록 스레드 전수가 집계에 들어온다.
- 멀티 프로바이더 관측 3종을 추가했다(모두 loopback 전용·읽기 전용):
  `claude-usage`(로컬 세션 기록에서 5시간/일/7일 창과 모델별 토큰을
  `message.id` 중복 제거로 재구성 — 내용·경로·세션 ID는 파서 단계에서
  폐기), `antigravity-usage`(IDE 상태 DB의 남은 크레딧을 protobuf
  이중 디코딩으로 읽고 관측 시각·stale을 명시), `provider-limits`
  (Codex 최신 세션 텔레메트리의 공식 주간 사용률과, Claude가 스스로
  보고하는 OAuth usage 창별 공식 사용률 — 토큰 값은 런타임에만 읽고
  로그·응답에 싣지 않는다). Fleet 카드가 Codex 주간(더 새로운 관측
  우선)·Claude 5시간(공식 % + 재구성 토큰 병기)·Antigravity 크레딧을
  나란히 보여준다.
- 검토에서 확정된 결함 3건 수정: 호스트 스탯 샘플에 마감시한 부재(멈춘
  statfs가 요청을 무한 점유), 실패 지속 중 TTL 미적용(매 요청
  재샘플), 만료된 주간창 관측을 현재 사용률처럼 경고 표시(리셋 경과
  시 톤 강등 + "이전 창" + 관측 시각 명시). 각각 회귀 테스트 고정
  (Board 232/232).

## 2026-08-08 — Mail lane per-account error observability

- The team mailbox collector now promotes connector error codes (e.g.
  `auth_failed`, `missing_config`) from each account's run result into the
  team-level `errors[]`, carrying the account alias (`operator_summary`) but
  never the message body, addresses, or secrets — only codes passing a strict
  `[a-z][a-z0-9_]{0,47}` gate survive; anything else degrades to
  `mailbox_source_error`. A run with promoted errors is always `partial`.
- The mail bridge accepts these promoted codes and suffixes the sanitized
  account alias (`auth_failed__acc_xxx`), relaxes the summary consistency rule
  that previously rejected "all accounts ran AND errors exist", and derives the
  synthetic fallback code from `summary.partial` instead of the child exit code
  — `mail_child_partial` was unreachable before because the team CLI exits 1 on
  partial (observed as 726 cycles of generic `mail_child_failed` while a
  hiworks account was failing auth, 2026-08-07 diagnosis).
- The five-lane supervisor heartbeat now carries deduplicated safe
  `error_codes`, and the Watchtower probe surfaces a heartbeat record's
  `error_codes` verbatim as judgment reasons — a degraded ingress node now
  reads `auth_failed__acc_xxx` (plus the labeled per-account detail) instead of
  a generic degraded signal. Verified live: first post-deploy cycle showed the
  failing account in heartbeat, run receipt, and Watchtower reasons.

## 2026-08-07 — Watchtower topology health consumer (W1, inspect-only)

- Added `guild_hall/watchtower/`: the first consumer of the heartbeats the
  collectors already produce. A public-safe topology definition (22 nodes,
  26 edges) plus a judgment engine that reads local heartbeat/health surfaces
  through four probe kinds (`jsonl_tail`, `json_file`, `dir_latest_mtime`,
  `schtask`) and classifies each node with a period+grace two-stage window
  (ok / degraded / stale / down / unmonitored). Resident supervisors are
  disambiguated against scheduler state, snapshots are written atomically,
  and a machine check rejects any snapshot that leaks an absolute path.
  Real paths and thresholds live only in an untracked local binding reached
  through a git-ignored pointer; `validate:watchtower` and
  `guild-hall:watchtower:probe` are wired into the npm surface.
- Added a `시스템 토폴로지` surface to the Workspace Board: a loopback-only
  Vite adapter relays the probe as `GET /topology-health.snapshot.json`
  (20s debounce, 1 MiB bound, path-leak validation) and a React Flow canvas
  renders per-node health lights, an attention banner, and judgment
  freshness. First live run reproduced the day's real state exactly
  (6 ok / 1 degraded — the five-lane ingress mail-partial — / 15
  unmonitored). W1 is inspect-only by design: self-heal, notification, and
  scheduled residency remain W2 items behind a separate owner gate.
- Follow-up on the same day: added an optional per-account mail detail probe
  (`mail_account_summaries`) so a degraded ingress node names the exact
  failing account through owner-provided local labels (address-free,
  e.g. `메일 계정 <label>: auth_failed`) instead of a generic degraded
  signal, moved the canvas to lane-per-row layout hints carried in the
  snapshot (`col`/`row`) so each lane flows horizontally without edge
  crossings, and restyled the surface Orrery-grade: dark React Flow color
  mode, dotted canvas, state-glow monospace nodes with pulse on
  degraded/down, animated flowing edges, and reduced-motion fallbacks.

## 2026-08-07 — Voice ASR/label supervisor watchdog trigger

- The voice ASR/label supervisor scheduled task now registers two triggers
  instead of one: the existing at-logon start plus an indefinite repetition
  watchdog (default every 15 minutes, `-WatchdogMinutes`). A supervisor killed
  by console closure or a crash previously stayed down until the next logon —
  observed as a 19-hour transcription outage on 2026-08-06/07; the watchdog
  now restarts it within one interval. Duplicate fires remain safe through the
  scheduler's IgnoreNew policy, the instance lock, and the named mutex.
- Post-registration attestation now requires exactly two triggers (one plain
  logon trigger, one time trigger whose repetition interval matches the
  requested watchdog interval), and the ops contract test pins the watchdog
  construction instead of forbidding repetition.

## 2026-08-07 — Slack continuous ingress idempotent replay recovery

- Fixed three non-idempotent revision-reconstruction defects in the Slack
  continuous ingress runner that deterministically poisoned re-pulled channels:
  a message carrying `edited` at first pull forked into a conflicting edit
  revision on re-pull (`delivery_retry_conflict`), volatile Slack metadata
  changes (reply counts, reply users, latest reply, reactions, pins, saves)
  forked a second initial revision (`message_initial_revision_invalid`), and
  editing or deleting a thread parent broke lineage because the
  `thread_ts == message_ts` normalization applied only on the initial path
  (`thread_lineage_changed`).
- Re-pulled records now replay their retained revision exactly — matched by a
  new volatile-field-excluding identity digest, by the legacy full-raw digest
  for pre-fix state, or by `(revision_kind, revision_ts)` slot — instead of
  fabricating a divergent revision; replay emission keeps current-run
  attachment pointers so accepted-page digests stay byte-stable. New revisions
  are created only for genuinely new content, edits, and removals.
- Added four regression tests (edited-at-first-pull re-pull, volatile-metadata
  drift, thread-parent edit after gaining thread metadata, re-delivered
  delete); the full slack-history harness passes. Two independent adversarial
  verifiers accepted the change after failing to break legacy-state migration,
  accepted-page byte replay, and in-page duplicate ordering. Deployed to the
  HPP runtime snapshot with a runtime-manifest re-pin and attested scheduler
  re-registration; the five poisoned channels (two weeks stalled at worst)
  self-recovered in one batch run with 9/9 channels succeeding and zero error
  codes. Known follow-up: a mid-sweep exact-page replay does not advance the
  provider cursor (pre-existing design), which can silently stall a resweep;
  an advance-or-alert guard remains open.

## 2026-08-07 — Hiworks Gmail original-message ingress

- Replaced the owner mailbox's SMTP wrapper forwarding behavior with a
  non-destructive POP3-to-Gmail API original-message import. The existing UIDL
  baseline and scheduled-task binding are retained, POP3 deletion remains
  forbidden, and imported messages request the `INBOX` label while preserving
  the original RFC 822 content and `Date`-based ordering.
- Added private OAuth/receipt bindings to the hidden five-minute runner,
  dependency hash pins, sanitized cycle heartbeat evidence, duplicate-receipt
  handling, and synthetic regression coverage. The route has passed a live
  zero-new-message scheduler cycle; first naturally arriving message evidence
  remains required for an end-to-end automatic-ingress claim.

## 2026-08-06 — Workspace Board exact child auto-enrollment

### Company mailbox local read-only MCP

- Added a stable, append-only, metadata-only heartbeat ledger for each completed
  continuous-ingress supervisor cycle. It deliberately excludes mail content,
  addresses, attachments, credentials, and custody paths; monitoring, alerting,
  and automatic recovery remain a separate AX/SYSTEM-owned consumer concern.

- Added a feature-OFF, loopback-only MCP server that reads the central Hiworks
  event JSONL only after exact configured mailbox-ID scoping. It exposes bounded
  status, search, and single-message read tools; send, delete, read-state writes,
  attachment download, raw headers, custody paths, and attachment URLs remain
  unavailable.
- Added deterministic mailbox-isolation, fail-closed malformed-custody, and
  read-only smoke tests. Public code does not activate a listener, connector,
  remote endpoint, credential, or mail mutation.
- Added a secret-free OpenAI Secure MCP Tunnel profile generator and a dedicated
  local-only authentication header for ChatGPT tunnel traffic. The profile keeps
  both the OpenAI control-plane key and the MCP token in environment references,
  targets only loopback endpoints, and refuses relative paths or overwrites.
- Added regression coverage for tunnel-header authentication, forwarded bearer
  rejection, loopback-only profile targets, secret omission, and safe profile
  creation. Added a managed stdio target and a personal Codex-plugin-compatible
  MCP surface; both expose only `company_mail_status`, `company_mail_search`, and
  `company_mail_read`, with no public inbound listener or mail mutation
  capability. Child processes inherit only an OS runtime allowlist plus their
  exact required mail/tunnel values, and failed tunnel diagnostics do not echo
  child output. Actual accounts, identifiers, live counts, installation paths,
  and connection state remain private runtime evidence rather than public canon.

- Added period-aware horizontal usage comparisons to the Work history surface.
  Project bars preserve the Meter's exact `project_id`; organization bars join
  only exact TASK IDs to Board enrollment groups, with unmatched and bounded
  long-tail metrics retained as `미연결·기타`. Direct token, turn, and credit
  labels remain visible and the compact two-column desktop layout collapses
  without horizontal overflow on narrower screens.
- Added a persistent `실시간만 / 전체 조직` topology scope. The live scope
  removes unrelated fixed managers while retaining every exact ancestor for
  running, approval-waiting, or result-confirmation work; the full scope keeps
  every exact current manager through responsibility level by combining the
  governance hierarchy with enrollment parent edges. Display filtering is local-only and
  does not change enrollment, organization authority, routes, or lifecycle.
- Split the prior combined stopped/unknown summary into explicit `응답 종료`
  and `관측 불가` states. The status legend now also states that the Codex
  sidebar blue dot is an unread/new-activity UI signal, not lifecycle evidence.
- Clarified the same work/history states without changing their projection:
  `응답 종료 · 결과 미확정` means only that the last response/turn ended, while
  `상태 신호 없음` means an exact enrollment has no fresh signal proving
  execution, waiting, or result delivery. A compact guide now sits beside the
  work/history filters, and source failures are labeled `상태 관측 오류`.
- Added instruction-free, metadata-only child TASK enrollment from exact
  official app-server parent edges and the Meter's validated fresh
  `SubagentStart` identities. Both sources use the Board's existing single
  awaited atomic registry writer; replays are idempotent and raw content is
  neither retained nor projected.
- Exact idle children are also enrolled when their parent edge is present, so
  a short TASK that starts and ends between polls is not lost. This records
  identity and hierarchy only and never interprets idle as completion.
- Unknown, malformed, conflicting, stale, terminal, unlinked, or inactive
  organization identities fail closed without changing existing enrollment.
  Separate repo-level emergency disables remain available, and partial Codex
  event coverage is reported as `HOLD` rather than inferred.
- Stabilized live observation with a validated candidate/last-good double
  buffer: transient lifecycle reconciliation `HOLD 0/0` snapshots no longer
  replace a previously available projection. Automatic polling is
  single-flight and applies accepted snapshots as non-blocking UI transitions,
  without toggling the manual-refresh busy state.
- Stop-only children are excluded from the live organization topology. Blue
  nodes require an explicit result-delivery gate, so a response turn ending is
  never presented as completion, unread work, acceptance, or Owner attention.

## 2026-08-05 — Workspace Board organization governance source

- Added a public-safe organization hierarchy and role-binding schema, strict
  validator, and provider-neutral read-only projector under
  `guild_hall/codex_work_directory/`.
- Switched the local Workspace Board from a manually maintained catalog
  authority to the ignored metadata-only governance source at
  `_workmeta/system/bindings/organization_governance_overlay.v1.json`.
  Source updates project on refresh without an LLM; invalid or missing input
  fails closed, manual Board catalog writes are disabled, and explicit local
  emergency-disable/legacy-HOLD rollback boundaries remain available.

## 2026-08-05

### 조직 TASK 역할 프로필 생성 가드

- 개발1팀·AI 조직의 새 TASK 생성 전에 역할별 정본 프로필을 exact model·reasoning effort로 해석하고, 실제 `create_thread`의 `model`·`thinking` 인자와 일치하는지 검사하는 fail-closed 가드를 추가했다.
- 전역 기본값·manager·parent 프로필 상속, 인자 누락, 미해결 범위값, 일반 책임자의 Ultra 사용, 역할 변경 fork를 `HOLD`로 차단한다. Ultra는 명시적으로 승인된 중대 Gate에만 허용한다.
- thread-manager 정본·설치 skill, delegation packet, workflow·step·handoff·monster 규칙과 21개 회귀 사례를 같은 경계로 동기화했다.

### Codex Thread Manager 적용 범위 축소

- `soulforge-codex-thread-manager`는 durable TASK create·fork·continue·rollover·handoff·archive, manager/worker/worktree topology 변경, 또는 다중 durable TASK 조정에만 적용한다.
- 기존 TASK 조회·상태 확인·한 번의 질문/메시지·단일 전송용 exact-ID 확인·조직 route/authority 검토는 직접 task tool과 해당 정본을 사용하며, workflow load·`NIGHT_WORK_HANDOFF` refresh·worker 생성·Board enrollment를 실행하지 않는다.
- 정본·설치 skill, 등록 workflow, 회귀 fixture를 같은 경계로 동기화했다.

## 2026-08-04

### Workspace Board dynamic organization catalog

- Replaced fixed Board company/group lanes with a strict ignored local metadata-only organization catalog. Companies, groups, CEO membership, parent groups, display roles, labels, and explicit order now project into the Board without code changes.
- Missing, invalid, disabled, or unknown current organization membership remains `HOLD`; the Board does not infer a company, hierarchy position, or route. The catalog and enrollment CLIs validate the same exact local membership boundary.

### Workspace Board actual organization projection

- Reworked the local read-only Board around the selected real-time, organization, responsibility-flow, and KST usage-history views while retaining exact-ID enrollment, explicit result gates, metadata-only projection, and local emergency-disable boundaries.
- Corrected the organization hierarchy to the canon `Owner → outer company frame → exact CEO governance group → subordinate organization groups`. Individual manager, reviewer, and TASK threads remain available only through bounded selected-group drill-down rather than a default dense list.

## 2026-08-03

### Workspace Board exact enrollment gate

- Development1/AI 조직 TASK create·continue·rollover는 actual exact thread ID 뒤 local Board enrollment CLI, validation, 그리고 가능한 live reconciliation을 거치며, disable·failure는 Board `HOLD`로 분리한다. 실제 ID는 local-only이고 자동 `create_thread` interception은 주장하지 않는다.

### 실제 결과물 TASK 기본 profile 상향

- Owner 지시에 따라 Soulforge 전체 조직·프로젝트의 실제 조사·계산·설계·코드·
  시험·문서·증거 생성 TASK 기본값을 `gpt-5.6-terra/xhigh`에서
  `gpt-5.6-terra/max`로 상향했다.
- `max`를 Ultra와 분리하고, CEO·manager·책임자 판단, 운영·상태 정리, 단순
  수집·형식화와 독립검토 profile은 변경하지 않았다. 요청 profile과 실제 관찰
  profile을 구분하며, runtime 미지원·미관찰 상태를 적용 완료로 주장하지 않는다.
- 완료·과거 TASK는 profile 적용만을 위해 다시 깨우지 않고, 진행 중 실제 결과물
  TASK는 다음 정상 실행 turn부터 새 기본값을 요청하도록 운영정책을 갱신했다.

### 루트 AGENTS Lean Router 전환

- 루트 `AGENTS.md`의 상세 정책 복제를 걷어내고 실행 계약, 저장 경계, 조건부 owner 문서, 검증·기록 경로만 남기는 50~80줄 Lean Router로 축소했다.
- `CLAUDE.md` 포인터와 개인 지침이 참조하는 `실시간 음성 비서·조직 라우팅` 제목은 유지하고, 모델·reasoning effort·조직 라우팅의 운영값은 변경하지 않았다.
- 선택형 `AGENT_BOOT_DIGEST_V0.md`를 expanded companion으로 재정의해 짧은 루트가 필요할 때만 상세 bootstrap 요약을 읽도록 경계를 분리했다. (worker: `codex_gpt-5.6-sol`)
- 기존 boot digest guard가 Lean Root의 50~80줄 범위와 안전·owner·조건부 업무·closeout 필수 포인터를 fail-closed로 검사하도록 회귀 가드를 추가했다.
- 현재 runtime에서 확인되지 않은 rule-hardening skill 설치를 단정하지 않고, 기존 knowledge-access 누락 guard와 `규칙 강화 체크:` 결과 계약으로 표현을 보정했다.
- 최종 71줄 Root가 실제 model-visible prompt에 포함된 상태에서 Sol/xhigh 단일 실행·reviewer/subagent/retry 0의 6-case read-only canary를 수행했다. 5건은 exact PASS, 외부 업로드 1건은 `HOLD` 대신 같은 비실행 의미의 `PROTECT`였으며 승인 요구·업로드 금지·side effect 0이 일치해 semantic 6/6 PASS로 채택했다.
- Lean Root의 1차 목적은 `instruction_legibility_and_maintainability`로 고정하며 비용 절감 효과는 아직 미확정이다. 기준 HEAD의 기존 absolute-path 18건 대비 후보는 동일 fingerprint의 13건만 남고 신규 위반은 0건이어서, 기존 debt는 별도 maintenance로 분리한 baseline-equivalence waiver를 적용했다.

### Soulforge AI 사용량 미터 v1

- Codex session의 누적 token counter를 turn delta로 변환하고 input/cached/cache-write/output/reasoning, 관찰된 usage 증가 구간 수, rate-card 기반 계산 크레딧을 기록하는 `guild_hall/ai_usage_meter/`를 추가했다. usage 증가 구간 수는 API 요청 수가 아닌 모델 순환의 관찰 하한 proxy로 해석한다.
- Stop/SubagentStop 비차단 hook, 부모–서브에이전트 lineage, explicit `work_id/project/team/role` binding, replay-safe current event와 revision 보존, 손상 session 격리형 backfill을 구현했다.
- metadata-only JSON ledger, 주간 filter, 조직·팀·프로젝트·업무·모델·reasoning effort·node·역할·에이전트 집계, local HTML, CSV, MCP summary/detail/binding adapter를 추가했다.
- 과거 Outlook 관찰 token tuple로 구성한 합성 7-turn reference에서 입력 `40,613,609`, 캐시 입력 `39,543,808`, 출력 `56,362`, 계산 크레딧 `670.294225` 재현과 원문 prompt/reasoning/tool payload 비저장을 검증했다. 실제 원본 session replay·역할 귀속은 metadata-only private receipt가 있을 때만 별도 검증으로 보고한다.
- 독립 adversarial review와 실제 self-metering에서 발견한 cache-write 오과금, exact binding 우선순위, depth 2+ lineage, 부모 continuation 누락, continuation model·source rollover 보강, 진행 중 부모 오귀속, stale self-root 백필 충돌과 강한 완료 snapshot 유실, scoped coverage 덮어쓰기, 월 shard 중복, malformed hook/timestamp, lock 경합 유실, runtime privacy schema, binding lock ownership, CSV formula injection을 회귀 fixture로 고정했다.
- hook lock 경합은 고유 pending observation으로 내구화하고 다음 성공 실행에서 자동 병합하며, `health/history/`와 dashboard의 hook/pending 상태로 오류가 뒤의 성공에 가려지지 않게 했다.
- 공식 Plus/Pro/Business token-pricing 전환일인 2026-04-02를 rate-card 경계로 고정하고 GPT-5.5·GPT-5.4 요율과 GPT-5.4 Fast 2배 예외를 추가했다. 경계 이전 기록은 legacy 메시지 요율로 추정하지 않고 `rate_unknown`을 유지한다.
- 일반 ChatGPT는 사용량 통합 대상이 아니라 저장소 접근이 필요 없는 조사·전략 작업을 Codex 밖으로 라우팅하는 보조 선택지로 경계를 고정했다. (worker: `codex_gpt-5.6-sol`)
- Pro 검수 경계에 맞춰 `instruction_manifest.v1`, `ai_work_run.v1`, `ai_quality_result.v1`, `ai_tool_event.v1`, `ai_usage_replay_receipt.v1`을 additive metadata-only 증거로 추가했다. CLI에서 지침 source·model-visible prompt의 digest/bytes를 원문 없이 검사하고, 실행·품질·tool·replay receipt를 strict schema로 검증·저장할 수 있게 했다. (worker: `codex_gpt-5.6-sol`)
- 후속 독립 검수에서 발견한 manifest 관찰시각 replay 충돌, evidence stale-lock 탈취 경쟁, replay receipt 내부 합계 불일치 허용, instruction source 상한의 schema/runtime 불일치를 fail-closed 검증과 회귀 테스트로 보정했다. (worker: `codex_gpt-5.6-sol`)
- Added an explicit local emergency disable/enable control for the non-blocking lifecycle collector, plus a strict redacted snapshot adapter for the existing read-only Workspace Board. The Board receives aggregate totals, breakdowns, coverage, and operational counts only; it never receives session identifiers/paths, source references, raw prompts, reasoning, tool payloads, or writer authority. (worker: observed profile `UNKNOWN`)
- Expanded the local-only lifecycle collector to exact Codex `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `PermissionRequest`, and `Stop` receipts. The allowlisted receipt/snapshot surface stores no prompt, message, tool payload, path, cwd, or raw flag; `Stop`/`SubagentStop` remain `observed_at_stop` with `result_pending`, and a separate ignored per-identity projection is opt-in for future local Board correlation rather than live authority. (worker: `codex_gpt-5.6-terra/max`)
- Resolved repository hook state through the verified non-bare Git common directory so normal and linked worktrees share one local lifecycle ledger and emergency-disable marker. Explicit state-root and environment overrides retain priority; unsafe/unavailable common-root resolution falls back only to local `CODEX_HOME/usage-meter` with a safe health reason. (worker: `codex_gpt-5.6-terra/max`)
- Added a bounded, metadata-only `lifecycle-reconcile` fallback for Codex managed worktrees where project hooks may not run. It reads only JSONL lifecycle markers, writes a strict ignored `source=jsonl_metadata` coverage/health/staleness snapshot, mirrors compatible exact-ID `result_pending` states into the existing Board v1 projection, honors emergency disable, and never stores or outputs raw prompts, messages, reasoning, tool I/O, cwd, transcript paths, or secrets. (worker: `codex_gpt-5.6-terra/max`)
- Added a separate strict `soulforge.ai_usage_board_history_snapshot.v1` local sidecar for exact accepted Codex thread IDs. It preserves a scope-matched nested current Board v1 aggregate and adds deterministic `Asia/Seoul` calendar/rolling/all-time windows with reconciled top-N-plus-other project/work/exact-task-ID token, credit, and turn breakdowns. Global history loading is rejected; retries and timeouts remain activity evidence rather than duplicate usage. The Board refresh contract is scoped, debounced, single-flight, nonblocking, timeout-bounded, and last-valid/HOLD on failure. (worker: `codex_gpt-5.6-terra/max`)
- Fixed scoped JSONL usage collection so explicit `--thread-id` values select exact canonical session files before duplicate collapse. An unrelated global duplicate remains fail-closed, while scoped root/child continuation collection no longer fails or double-counts. (worker: `codex_gpt-5.6-terra/max`)
- Fixed exact-scope lifecycle reconciliation so an unregistered descendant repeated in multiple accepted ancestor sessions is excluded from the selected projection instead of creating a false lineage conflict. Exact selected children still require one matching parent; missing local sessions remain explicit partial coverage without downgrading a successful collector's hook health; and the actual root/two-child canary remains complete with two confirmed links and four replay-stable usage events. (worker: `codex_gpt-5.6-sol/max`)

## 2026-07-31

### 실시간 음성 비서 역할·조직 라우팅 포인터

- 실시간 음성채팅을 사람 Owner의 비서·일상 라우터로 고정하고 CEO·기술
  승인권자 대행을 금지했다. 공통 운영, 프로젝트, AX·ERP·SYSTEM 업무의 기본
  전달선과 CEO 상신 조건을 루트 `AGENTS.md`에 추가했다.
- 로컬 Codex 개인 지침용 paste block과 실제 사용자 `AGENTS.md`에는 상세 정책을
  복제하지 않고 AI 조직 모델 운영정책, 회사 조직도, 공통 라우팅 정본 링크를
  추가했다. 다른 task 전송은 현재 음성 세션의 명시적 Owner 요청에만 허용하고
  대상 모델·reasoning effort는 유지한다. (worker: `codex_gpt-5.6-sol`)

### AI 조직·모델 운영정책 정본 등록

- 개발1팀 회사와 AI 기반시스템 회사의 실제 업무분장을 기준으로 CEO
  `Sol/xhigh`, 운영실 팀장 `Sol/high`, 프로젝트 팀장 `Sol/xhigh`, 기술
  책임자 `Sol/high`, 운영·통제 책임자 `Terra/high~xhigh`, 실제 결과물 TASK
  `Terra/xhigh`의 Codex-native 기본 profile을 정본으로 등록했다.
- Ultra를 상시 직책이나 CEO 기본 모델이 아니라 사전 정의된 중대 Gate
  심의로 고정하고, CEO는 정상 보고마다 깨우지 않으며 현재 상태·변경분·결정
  안건·증거 pointer만 받도록 했다. 완료·과거 TASK는 profile 적용만을 위해
  일괄 재호출하지 않는다.
- GPT Pro·Deep Research·NotebookLM을 모든 모드의 조사·자문 지원 채널로
  분리했다. 현재 활성 상태는 `CODEX_NATIVE + NORMAL`이며 Kimi·Antigravity
  등을 통한 외부 LLM 역할 대체와 토큰 부족 overlay는 활성화하지 않았다.
  기존 workflow별 calibration `profile_policy.yaml`은 보존하고
  `codex_thread_manager_v0`이 새 조직 모델 운영정책을 별도 참조하게 했다.
  (worker: `codex_gpt-5.6-sol`)

### AI 기반시스템 회사 상향 결과보고 attribution 계약

- AX·ERP·SYSTEM과 향후 AI 기반시스템 회사 지속 책임 route의 상향 결과보고가
  `report_item_or_result`, 단일 `primary_owner`, `executor_or_agent`,
  `collaborators`, 실제 독립검토자, manager·CEO의 실제 조정 기여, 근거 pointer,
  Owner 또는 고객사–공급사 gate를 함께 보존하도록 조직 정본과
  `codex_thread_manager_v0` workflow·registry skill bridge를 동기화했다.
- manager·CEO의 하위 실무 self-credit, 자동 attribution 추정, 숨은 reasoning,
  credential·raw payload 노출을 금지하고, 미관찰 provider·model은 `UNKNOWN`,
  `PARTIAL`·`HOLD`·실패도 실제 수행 주체와 blocker를 유지하도록 했다.
  개발1팀 회사는 직접 공지 범위에서 제외하고 고객사–공급사 결과 packet에만
  같은 shape를 제공한다.
- canon validator가 8필드, 의미·회사경계 guard, worker result·integration·
  closeout의 세 wiring guard를 `codex_thread_manager_v0`에 한정해 검증하며,
  정상 fixture와 누락별 stable reason code 회귀시험을 추가했다.
  (worker: `UNKNOWN`)

### 개발1팀 결과보고 attribution 정본 등록

- 개발1팀 회사가 자기 COMMON 운영실 manager와 프로젝트 manager에게 적용하는
  별도 내부 캠페인으로, 공유 8필드 attribution shape를 재사용하도록 두 owner
  문서와 `codex_thread_manager_v0` workflow·canonical skill bridge를 보강했다.
  개발1팀의 `manager_contribution`은 canonical
  `manager_or_ceo_contribution`의 표시명이며 별도 schema나 field가 아니다.
- Workspace Board MVP를 public-safe 예시로 기록하고, 실제 주관 책임자와 수행
  TASK·agent, 미확정 협업, fresh verifier, manager의 분류·분장·fresh review
  gate·통합, 근거 상태, Owner 최종 수락·state writer·deploy `HOLD`를 분리했다.
- AI 기반시스템 회사의 개발1팀 직접 공지 금지와 두 회사 고객사–공급사
  interface는 유지했다. public canon 등록 상태는 `canon_entry`로 기록한다.
  실제 manager 공지는 허용된 active·`EXACT` route마다 stable catalog와 live
  binding이 각각 `EXACT`이고 `execution_ready=true`인 경우에만 가능하다.
  이 등록 시점의 공지 상태는 해당 private 근거가 없어 `HOLD`·미전송이며,
  installed personal skill, private route/binding, 실제 thread와 external
  system은 변경하지 않았다.
  (worker: `codex_gpt-5.6-sol`)

### AI 작업 결과 누락 복구 Phase G 운영 preflight 보강

- public commit `ca63963421e3ac4792dd8aeb34dac518e3a9b5a4`를 `main`에 포함했다.
  runtime preflight v2는 active public·workmeta·private-state·automation control
  root와 complete Codex/Orca worktree inventory를 fail-closed로 결속하고,
  authoritative ledger·cursor·authority·redacted receipt만 backup/restore 포함으로
  분류한다. runtime clone·lock·temp는 재생성 가능 제외이며 config·remote URL·
  credential·owner token은 capture 금지다.
- sanitized Git config·authority evidence와 restore manifest/receipt를 전체 입력에서
  다시 검증하고, builder v2와 runner v4가 caller PASS summary·불완전 inventory·
  forged preflight를 거부하도록 보강했다. ledger publication 뒤 HOLD는
  reconciliation 상태를 명시하며, cursor push 뒤 결과가 불명확하면
  `cursor_unchanged=null`로 남긴다.
- fresh Level 3과 최신 main 통합 재검증에서 runner 25/25, non-runner 42/42,
  path-policy 5 PASS/Windows symlink 1 SKIP, canon 136/0/0을 통과했다.
  표시명 `AI 작업 결과 누락 복구 (매일)`의 tracked candidate는 계속 `PAUSED`다.
  실제 private ledger·cursor·runtime·ACL·NAS·installed automation·network는
  변경하지 않았고 one-shot과 이후 `ACTIVE`는 사람 Owner 승인 전 `HOLD`다.
  `official_completion=false`; `313`과 `317`은 실제 누락 수가 아니다.
  (worker: `codex_gpt-5.6-sol`)

### AI 작업 결과 누락 복구 Phase E public-synthetic remediation

- public commit `57e93fb3dbabfa4fa4e24bfe062c6e4d6195c75e`를 `main`에 포함했다.
  metadata projector는 승인된 집계·digest·public commit ref·시각·분류·완전성만
  투영하고 `recorded_at >= occurred_at`을 강제한다. local/HTTPS/SSH transport는
  logical remote/ref와 authority fingerprint로 결합하며 raw URL·credential을
  입력·출력하지 않고 Git 인증을 비대화형으로 고정한다.
- isolated runtime preflight는 canonical root, active/forbidden-root 비중첩,
  ACL·NAS·restore·single-writer fencing 증거를 fail-closed로 재검증한다.
  deterministic builder는 전체 preflight를 다시 확인한 뒤 표시명
  `AI 작업 결과 누락 복구 (매일)`의 정확한 `PAUSED` candidate와 byte-exact
  rollback만 생성한다. receipt는 `official_completion=false`, WorkSession·
  TaskDriver·ERP·MCP acceptance `false`,
  `claim_ceiling=operational_evidence_only`를 유지한다.
- fresh Level 3에서 contract/planner 41/41과 runner 19/19를 통과했다.
  manager 재검증에서 path-policy 5 PASS/Windows symlink 1 SKIP, 동일 provisioned
  canon validator 136/0/0 PASS를 확인했다. 설치된 legacy automation, 실제 private
  cursor·ledger coverage, runtime, network는 변경하지 않았고 live activation은
  `HOLD`다. `313`과 `317`은 각각 합성 빈-ledger 상한 또는 public lineage 범위이며
  실제 누락 수가 아니다. (worker: `codex_gpt-5.6-sol`)

### Workspace Board Owner Action Inbox MVP

- 선택된 Owner Action Inbox 2안을 기존 `team-ops-board`에 dark graphite,
  고밀도 네 상태(`진행 중`, `검토·결정 필요`, `막힘`, `완료·미확인`) 보드로
  구현했다. 프로젝트 작은 메타→TASK 큰 제목, observed-only agent/provider,
  optional worktree, UNKNOWN/missing/multi-agent 의미를 synthetic fixture에
  고정했다.
- 10 projects × 15 responsibilities × 책임별 2 TASK 규모에서 active target
  subset, 우선순위 정렬, 열별 표시 상한·더보기, 검색·필터·이력 회수를
  deterministic tests로 검증했다. `읽고 확인`은 synthetic
  `completed_unread`만 `owner_acknowledged`로 바꾸고 원 pointer 이벤트를
  보존하며, 막힘은 reason/next decision과 함께 잔류한다.
- desktop/tablet/mobile, keyboard/focus/accessibility, empty/error/missing-data,
  completed acknowledgement, blocked detail, history search와 console을 실제
  브라우저에서 확인했다. 선택 2안·Orca 참고·실제 MVP를 같은 비교 입력으로
  두 차례 수정한 뒤 `design-qa.md`를 `final result: passed`로 닫았다.
  실제 Codex/ERP state writer, external backend, deployment는 추가하지 않았다.
  (worker: `codex_gpt-5.6`)
- fresh independent review의 모바일 상세 P2를 후속 보정했다. 760px 이하에서
  `role="dialog"`·`aria-modal`·accessible name, open focus, Tab/Shift+Tab trap,
  Escape/닫기, 배경 inert, 원 TASK card focus 복원을 적용하고 1024px 이상
  비모달 상세는 유지했다. 결정적 keyboard 계약 테스트와 390×844 실제
  브라우저 재현·재비교를 추가했다. (worker: `codex_gpt-5.6`)
- fresh independent re-review의 modal lifecycle P2를 추가 보정했다. 모바일
  최초 진입의 자동 상세를 제거하고, focus 복원 후보에서 detached·disabled·
  hidden·inert 대상을 제외했다. 완료 확인으로 원 카드가 제거되면 같은 logical
  TASK 또는 현재 이력 control·heading·main 순서로 복원해 `BODY` 종착을 막았다.
  390×844 최초 진입·acknowledged 이력 Escape/닫기·blocked trap과 1024×768
  비모달 회귀를 실제 브라우저와 결정적 테스트로 재검증했다.
  (worker: `codex_gpt-5.6`)
- fresh independent final review의 acknowledgement focus P2를 보정했다.
  열린 모바일 modal에서 `읽고 확인`이 활성 버튼을 제거해도 TASK 상태가 바뀐
  commit 뒤 연결된 `상세 닫기`로 focus를 다시 옮긴다. 기존 최초 진입 no-modal,
  Escape/닫기 logical history 복원, blocked trap·inert·원 카드 복원, 1024px
  비모달 경계를 유지하고 iteration 5 브라우저·시각 비교 근거를 추가했다.
  (worker: `codex_gpt-5.6`)
- Owner annotation에 따라 기본 카드를 프로젝트·책임분야·상태·TASK·route·
  provider 중심의 접힘 형태로 압축하고 상세 전용 필드 반복을 제거했다. 기존
  Lucide에서 Codex/GPT=`Code2`, Antigravity/Gemini=`Sparkles`, Kimi=`Moon`,
  UNKNOWN=`Bot`을 observed-only로 매핑했으며 복수 agent는 각 glyph를 함께
  표시한다. 1440×1024에서 평균 카드 높이를 182px에서 97px로 줄이고 기본
  표시를 12건에서 16건으로 늘렸으며, 기존 상세·모바일 modal focus lifecycle과
  synthetic/read-only 경계를 회귀 검증했다. (worker: `codex_gpt-5.6`)
- fresh review의 provider 식별 P2를 보정했다. 일반 Lucide 도형 매핑을 제거하고
  MIT `@lobehub/icons-static-svg`의 실제 Codex·Antigravity·Kimi 브랜드 glyph를
  정적 asset import로 적용했다. UNKNOWN만 Lucide `Bot`을 유지하고 복수 agent는
  관찰된 각 브랜드 glyph를 함께 표시한다. (worker: `codex_gpt-5.6`)
- 후속 fresh review의 compact/observed-only P2를 보정했다. blocker reason과
  next decision을 카드에서 제거해 상세에만 유지하고, mixed provider fixture에서
  `observed: false` entry가 렌더링·count·복수 agent 판정에 포함되지 않도록 단일
  observed-provider 선택 경계를 적용했다. (worker: `codex_gpt-5.6`)

## 2026-07-30

### AI 작업 결과 누락 복구 Phase C public safety remediation

- append-only 결과 레저의 `writer-workmeta`와 cursor/authority CAS의
  `writer-private-state`를 분리하고, private-state cursor owner 경로를
  `guild_hall/state/operations/ai_work_result_recovery/v1/cursors/<source_lane_digest>.json`으로
  고정했다. source·두 clone·두 local bare remote·runtime·lock과
  active/forbidden root 전체를 canonical realpath로 비교해 equality·nesting·
  reparse escape를 mutation 전에 차단한다.
- owner token·PID·host·acquired/expiry와 monotonic `writer_epoch`을 갖는 exclusive
  lease, 단일 승자 hard-link quarantine stale takeover, cursor sequence/epoch
  fencing을 적용했다. recursive exact-key 검증은 secret·private URL/ref·raw
  계열 입력을 비노출 HOLD하며, receipt는 `official_completion=false`,
  WorkSession/TaskDriver/ERP/MCP acceptance `false`,
  `claim_ceiling=operational_evidence_only`로 제한한다.
- public commit `0c2fee5018a6fb192eebfad27e8e2ceefe21a65d`가 `main`에 포함됐고
  runner 13/13·planner 12/12와 fresh Level 3 `ACCEPT`를 확인했다. tracked
  candidate는 `PAUSED`, 설치된 legacy automation은 `ACTIVE` 그대로다. actual
  runtime·private cursor/ledger·installed automation·NAS·network는 계속
  `HOLD`이며, `313`은 빈 레저 합성 상한일 뿐 실제 누락 수가 아니다.
  (worker: `codex_gpt-5.6-sol`)

### 개발1팀 운영실 업무분장·일반업무 분류 가이드 후보

- 개발1팀 운영실의 일곱 상시 책임, `ROLE/PROJECT/TASK/LOG` 경계,
  `OPS/SUP/PRJ-O/PRJ-I/TRIAGE` 분류, 공통지원 TASK와 자체 프로젝트 승격
  gate를 한 문서에 정리했다.
- `일반업무`는 업무일지의 보고 묶음으로만 두고 실제 책임을 별도 기록하며,
  `[미할당 프로젝트]` 상시 역할은 이력 보존·인계·검증 뒤 운영실의
  `분류대기` 상태로 흡수하는 migration 후보를 명시했다.
- 기존 정본 route와 workflow는 아직 바꾸지 않았으며, 책임자 task 구성과
  migration 검증 전까지 자동 routing은 활성화하지 않는다.
  (worker: `codex_gpt-5.6`)

### 개발1팀 실행회사·AI 기반시스템 개발회사 조직모델

- 한 명의 최상위 Owner 아래 `개발1팀 회사형 실행조직`과 별도의
  `개인 AI 기반시스템 개발회사`를 두는 사람용 조직 계약을 등록했다.
- 두 CEO는 우선순위 조정·결과 통합·조직 간 조정·blocker 에스컬레이션만
  담당하며, 사람·인사·예산·구매·발주·외부 약속·전송·기준선·최종 수락은
  Owner에게 유보한다.
- 기계 directory의 다섯 sibling branch와 same-branch manager 제약은 유지한다.
  별도 governance overlay 또는 directory v2가 승인·검증되기 전 두 CEO 자동
  routing은 `HOLD/non-routable`이다. (worker: `codex_gpt-5.6-sol`)

### AI 작업 기록 로컬 outbox A2 candidate

- 공통계약 `soulforge.ai_work_record_event.v1`을 재사용해 strict schema →
  normative validator → full lifecycle reducer 순서로 검증하는 append-only
  local outbox·CLI·PowerShell wrapper와 synthetic tests를 추가했다.
- `start → checkpoint* → closeout_pending → closeout → correction*`,
  deterministic replay, duplicate no-op, conflict/gap/order/fencing HOLD,
  offline pending·ack·correction history와 `local_persisted` 로컬 저장 확인을
  합성 임시 root에서만 검증한다. `official_completion=false`다.
- 이번 candidate는 public-synthetic feature-OFF다. 실제 HPP root·private
  binding·NAS policy/runtime·hook·scheduler·network receiver·ERP/MCP·team-PC
  변경은 없으며 운영 활성화와 실제 NAS include/restore coverage는 별도
  owner gate까지 HOLD한다. (worker: `codex_gpt-5.6-sol`)

### AI 작업 결과 누락 복구 isolated runner candidate

- exact public source tuple과 immutable snapshot, 별도 isolated writer binding을
  주입받는 public runner를 추가하고 OS 임시 root·local bare remote에서
  runner 8/8, planner 11/11과 fresh Level 3 `ACCEPT`를 확인했다.
- ledger output은 non-force push와 fresh remote containment를 통과한 뒤에만
  cursor CAS로 진행한다. runtime worker identity 주입, receipt redaction,
  secret/path sentinel과 cursor push 후 `UNKNOWN_AFTER_PUSH` reconciliation을
  fail-closed 경계로 고정했다.
- tracked automation candidate는 `PAUSED`이며 설치된 legacy automation은
  `ACTIVE` 상태 그대로 변경하지 않았다. 실제 cursor·private ledger writer·
  automation 활성화는 계속 `HOLD`이고, `313`은 빈 레저 합성 dry-run 상한일
  뿐 실제 누락 수가 아니다. (worker: `codex_gpt-5.6-sol`)

### AI 작업 결과 누락 복구 cursor candidate

- `five_field_session_capture_v0`에 feature-OFF/public-safe cursor planner와
  synthetic tests를 추가했다. exact `{repo,ref,source_lane}`의
  `(last_successful_source_commit,candidate_target]`을 oldest→newest로 계획하고,
  history rewrite/non-FF/ref movement와 same-ID/different-full-record를 HOLD한다.
- 신규 `soulforge.five_field_capture.v0` 행은 source `occurred_at`과 최초 레저
  `recorded_at`을 분리하며 기존 `at == recorded_at`, schema/path/`bounded_work`
  이름을 유지한다. legacy 행 digest/native occurrence는 그대로 보존한다.
- canonical full-record SHA-256은 receipt에 두고 exact self-loop trailer 두 개,
  validate+commit+push+remote/source-target 증거 경계를 모두 만족해야만 cursor
  advance를 표현한다. private cursor·ledger·installed automation·scheduler·runtime,
  foreground/private tree, network/ERP/MCP/team-PC 변경은 없다.
  (worker: `codex_gpt-5.6-sol`)

### COMMON 회사·팀 운영 조직과 업무분장

- 기계적으로 안정된 `COMMON` branch id는 유지하고, 사람용 projection에서는
  회사·팀 운영으로 구분하는 public-safe 조직 계약을 추가했다.
- 팀 업무운영/팀장 아래 업무접수·분류, Slack·협업공간, 회의·결정기록,
  자료·지식, 구매·재고·업무환경, 일정·일일업무·후속조치, 공지·대내소통
  책임과 Slack 공간별 주관·인계 경계를 정의했다.
- COMMON, PROJECTS, AX, ERP, SYSTEM 사이 요청을 협업·검토·재분류 요청으로
  구분하고, 사람 owner 지시와 peer 요청을 분리해 domain authority가 이전되지
  않도록 Codex thread manager 계약과 설치 skill을 동기화했다.
- 실제 팀명, route 목록, thread id·binding, Slack 채널·권한과 사람 배정은
  private/local owner surface와 별도 배포·검증 전까지 만들거나 활성화하지
  않는다. (worker: `codex_gpt-5.6-sol`)
- 기존 profile은 incumbent로 유지하되 COMMON 분류·조직 간 요청 관계 변경이
  calibration rerun trigger를 충족하므로 새 profile 재보정 전까지
  `rerun_required` 상태로 명시했다.
- `PROJECTS` 아래에 확정 프로젝트 manager들과 동급인
  `[미할당 프로젝트] 업무운영/팀장`의 임시 custody 경계를 추가했다. 이 route는
  프로젝트 후보·사전조사·착수대기·귀속 미확정 업무만 보관하고, identity 확정
  뒤 근거·열린 업무·TASK·결정·blocker를 exact 프로젝트 manager에게 인계한다.

### AI 작업 기록 공통계약 v1 후보

- `soulforge.ai_work_record_event.v1` metadata-only event schema와 pure
  validator·canonical digest·reducer, synthetic tests, 호환성 문서를 추가했다.
- start → checkpoint → closeout_pending → closeout 수명주기, replay·conflict·gap
  fail-closed, terminal outcome gate, relative metadata pointer와 known-secret
  sentinel 경계를 고정했다.
- 이 계약은 `canon_candidate`이며 중앙 receiver, HPP writer/outbox, MCP network,
  ERP 공식 완료를 구현하거나 활성화하지 않는다. `official_completion`은 항상
  false이고 운영 데이터·private payload를 생성하거나 수집하지 않는다.
  (worker: `codex_gpt-5.6-sol`)

### Public-safe Codex work directory candidate

- Added a provider-neutral stable manager directory contract with a
  navigation-only root and exact sibling branches `COMMON`, `PROJECTS`,
  `AX DEVELOPMENT`, `ERP DEVELOPMENT`, and `SYSTEM DEVELOPMENT`.
- Separated project-manager sibling leaves from AX responsibility ownership,
  and separated organization/routing authority from optional downstream
  current-work Kanban projection.
- Defined the public schema/private catalog/local live-binding split,
  fail-closed exact resolution, non-actionable planned/pilot/blocked runtime
  states, and local-only runtime value boundary.
- Added concise directory-first agent routing and registered-manager
  create/rollover/retire maintenance rules without adding UI, provider
  integration, automation, send, or default-route authority.
- Synthetic validators and independent review passed. Claim ceiling remains
  `canon_candidate`; actual private route catalog and local live bindings are
  not populated or activated.

## 2026-07-29

### AX 책임공학 authority 정본 보정

- TARGET에서 책임공학 AX engine이 사람과 exact policy authority 아래 engineering task
  후보 생성, project routing, 단일 주관 책임 role과 협업·검토 role 지정,
  재분류·에스컬레이션, 실행 agent/capability 선택을 소유하도록 경계를 고정했다.
- P5 accepted context → P6 TaskIntent 후보 → P7 causal authority·idempotency → P8
  원자적 ERP 기록 순서를 유지하고, ERP는 정본 기록면이지 engineering judge가 아니며
  MCP는 transport/query interface일 뿐임을 명시했다. accepted assignment 전에는
  WorkSession/AgentRun을 열지 않고 closeout·agent success를 공식 완료로 보지 않는다.
- 문서 정본만 보정했으며 schema·entity·runtime·DB·MCP activation과 feature-OFF 및
  non-operational 상태 변경은 없다. (worker: `codex_gpt-5.6-sol`)

### 프로젝트 조직도·업무분장·TASK 운영 초안

- 한글 프로젝트명으로 표시하는 총괄 CEO/업무운영·팀장과 15개 분야 책임자의
  public-safe 조직도·역할·경계 초안을 추가했다.
- 시스템공학·요구사항의 교차 기술관리, Verification과 Validation의
  목적·기준·증거·판정 분리, 전장 구현과 전 분야 인터페이스 관리의 경계,
  품질·형상·외부 제공자·생애주기 책임을 보강했다.
- TASK에 책임 owner, 수행자/에이전트, 독립 검토자, 수락·승인자의 네 가지
  논리 역할과 시작·변경·완료 gate를 추가하되, 네 명의 고정 인원이나 ISO
  적합성을 주장하지 않는다.
- `codex_thread_manager_v0`은 위 분장 규칙을 조정하는 bridge로만 확장했고,
  Task Engine authority는 기존 정본을 참조할 뿐 다시 정의하지 않는다.
  실제 조직/TASK 생성, 사람 배정, 외부 전송 또는 runtime 활성화는 없다.

## 2026-07-28

### Task Engine / AX 업무·증거 용어 정본화

- 공통 용어집에 `5필드 업무 결과 요약`, `HPP Codex 작업 맥락 수집기`,
  `HPP 로컬 업무 장부`, `로컬 업무`, `업무 사건`, `파일 관찰`, `파일 이력`,
  `실행·검증 증거`, `실행·검증 영수증`, `프로젝트 시간장부`의 사람용 정의와
  비권장·폐기 별칭을 추가했다.
- Task Engine CURRENT 상태표와 local-activity·shared owner 문서를 같은 이름으로
  정렬하고, 과거 혼합명 기록은 `HISTORICAL_SUPERSEDED` 감사 이력으로 보존했다.
- 현행 wire field는 `work_id`이며 `begin_work.work_id=null`일 때만
  `LW-<project>-<digest>`가 자동 생성됨을 명시했다. `local_work_id`와
  `LOCAL-WORK-*`는 현행 식별자가 아니다.
- `bounded_work`, `codex_work_context`, `work_id`, event/time field, operation,
  `run_log`·H03/H05 ID, receipt/timeline schema·path·module·CLI·기존 한글 호환
  경로는 그대로 유지했다. 이번 변경은 schema/data migration이나 운영 승격을
  만들지 않는다.

## 2026-07-27

### NAS backup stage isolation and HPP surface coverage

- Extended the HPP, ERP, and health daily retry windows to the next 02:00
  cadence boundary, so a corrected stage can retry later the same day without
  increasing schedule frequency.
- Calibrated the HPP stage maximum runtime to one hour after the current
  10.6 GB-class custody copy completed its data pass in minutes, preserving a
  safe late-retry window before the next daily occurrence.
- Added a SHA-256-pinned writer-quiesce wrapper to the single NAS backup
  automation. It cooperatively pauses continuous ingress, waits for bounded
  local/Slack writers, runs backup, and restores/catch-ups the exact tasks even
  after backup failure; an unconfirmed continuous-writer restart fails closed.
- Documented the same-slice rule for every newly developed HPP data surface:
  backup/restore include, rebuildable exclusion, or secret/runtime prohibition,
  with recovery-policy and synthetic-restore updates required together.
- HPP recovery manifest v3 now records unknown new surfaces as unclassified
  without opening or copying them, so declared mail, voice, Slack, timeline, and
  other custody continue backing up while the new surface awaits classification.
- HPP 데이터 구조 변경이 한 백업 단계에 실패를 일으켜도 ERP, metadata,
  restore, workspace 독립 NAS 백업을 계속 실행하도록 daily backup cycle의
  stage failure를 격리했다.
- recovery policy v2에 `ingress/slack`, Slack continuity state, `timeline`
  supplemental backup과 `secrets`의 명시적 capture 금지를 추가하고, 새 HPP
  data surface가 생길 때 같은 개발 슬라이스에서 backup/recovery 분류와
  검증을 함께 갱신하도록 고정했다.

### Outlook same-thread additive local route

- Added an owner-approved local same-thread additive route to
  `owner_outlook_mail`: deterministic pre-routing, one bounded Flash Low prose
  call, source-layout continuity, and a fixed no-send connector to the private
  Outlook bridge. The route fails closed and does not grant send authority.

### HPP Codex work-context events

- Added a project-separated, append-only HPP-local work-context writer with
  explicit local work IDs, project-leader registration, task attachment,
  checkpoints, completion summaries, and file/run evidence references.
- Supported project leaders that work directly as well as worker,
  continuation, and verifier tasks sharing the same local work ID, without
  copying whole Codex conversations.
- Added exact private project binding, SHA-256 pinning, KST normalization,
  replay/conflict guards, single-writer locking, rebuildable current snapshots,
  and synthetic coverage for direct and multi-task work.
- Clarified that one project may contain many independent work IDs, while only
  tasks continuing the same real job share an ID.
- Hardened event-ID retries to preserve the first accepted time and rebuild a
  missing current snapshot, bounded stale/PID-reused lock recovery, and exposed
  optional source time plus payload-free status through the Windows wrapper.
- Added immutable supersession so an incorrect completed summary is retained as
  audit evidence and replaced by an explicit new local work ID instead of
  being edited in place.
- Added a PowerShell wrapper that converts validated object JSON to UTF-8
  Base64 before calling Node, avoiding Windows native-argument quote loss for
  Korean project-leader summaries.
- Kept ERP tasks, formal WorkSession, H05 run receipts, accepted project
  context, team-PC collection, and automatic completion inference out of
  scope.

### Codex activity data terminology

- Renamed the owner-facing five-field proxy from ambiguous `PC work` to
  `Codex work-result summary`.
- Named the separate exact H05 run-receipt class `Codex
  execution/verification evidence`, distinguishing a model-authored summary
  from machine-verifiable run proof.
- Kept the live v1 `bounded_work` and `run_log` identifiers and machine-local
  paths as compatibility aliases; this documentation correction performs no
  runtime data migration.

### Legacy full-packet retention cleanup

- Removed 347 superseded repeated full-file observation packets totaling
  1,179,013,521 bytes after sequential metadata comparison found no project
  state transition across the retained series.
- Used an exact same-volume quarantine and a fresh 14-project collector run to
  prove the compact inventory and delta pipeline did not depend on or recreate
  the legacy path before permanent deletion.
- Preserved all project source files, compact inventory state, change deltas,
  databases, and `_workmeta`; only the superseded machine-local packets were
  deleted.

### Project-separated file inventory delta

- Replaced repeated all-file observation packet persistence with one compact
  project inventory baseline plus metadata-only changed-observation deltas.
- Added safe absence candidates that never claim deletion from the HPP
  `tool_pc`, preserving incomplete listings without dropping prior inventory.
- Added stale/dead legacy and partial collector-lock recovery with live-owner
  fencing and made the Windows wrapper retain native failure output in its
  scheduler log.
- Extended the owner-bound exact-hash cache ceiling to 30 days so unchanged
  files are not rehashed daily, while keeping explicit full verification
  available.
- Normalized all non-exact hash queue reasons to one compact `pending` state so
  bounded hash scheduling cannot create false file-change deltas.
- Activated the pinned 30-minute HPP task for all 14 project bindings and
  observed two consecutive successful scheduler runs with no held project or
  residual lock.

## 2026-07-26

### Task Engine CURRENT status synchronization

- Added one current Task Engine status dashboard that separates live collection,
  local outboxes, project-timeline projection, accepted context, and TaskDriver
  activation instead of treating them as one completion state.
- Updated the observed HPP local-activity, Slack custody, and KVDS V3 timeline
  counts while retaining older execution rows as explicit historical evidence.
- Added a repository instruction requiring future collector, scheduler,
  binding, custody, timeline, context, or TaskDriver changes to refresh the
  dashboard and its owner README in the same slice.
- Corrected the remaining boundary: file observations still need sole-writer
  reconciliation, Slack arrivals need timeline projection, and general Codex
  runs still need a common exact receipt before they become time-ledger events.

### Quick explanation skill

- Added the `quick_explain` canon candidate and Codex bridge for owner-facing
  status summaries bounded to 10 logical lines.
- Added `/짧게설명` as its owner-facing Korean invocation alias while retaining
  the ASCII internal Codex skill id required by the runtime.
- Kept it separate from `easy_explain`: the quick skill owns conclusion,
  completed work, remaining work, and one next action, while the existing skill
  continues to own visual and completeness-oriented explanation.
- Added local skill-sync metadata without granting investigation, mutation,
  approval, or publication authority.

### All-project HPP local activity collection

- Added an exact-private-allowlist HPP collector that writes project-separated
  file observations and bounded PC-work/Codex views to a machine-local outbox.
- Kept one native bounded-work occurrence while exposing Codex execution as a
  relation-only view, with full-record digest and same-ID conflict holding.
- Prohibited project autodiscovery, whole chat, screen, keyboard, and OS
  surveillance; the collector does not mutate `_workmeta`, project context,
  ERP, MCP, or official task state.
- Added a pinned Windows scheduled-task wrapper with `IgnoreNew` and a hidden
  PowerShell window; live materialization remains machine-local and is reported
  separately from public source delivery.

## 2026-07-25

### KVDS one-project timeline Shadow

- Added a strict one-project Shadow builder and dry-run-by-default CLI over the
  common source annotation and append-only project-binding contracts.
- Materialized the first private `P26-014` (KVDS) timeline with 84 mail
  metadata occurrences and 3 owner-confirmed voice occurrences, all in KST.
  Two raw-copied mail rows and 8 Slack system-subtype rows stayed held; PC work,
  team-file, and run-log coverage remains explicitly `not_collected`.
- Wrote only immutable generation/month JSONL plus a rebuildable CSV under the
  private project-context owner. No RAW body, accepted context, official task
  or project assignment, ERP/DB, scheduler, or production writer was changed.

### Feature-OFF project timeline foundation

- Added strict public contracts for append-only source scope bindings and
  deterministic project timeline projections across mail, Slack, voice,
  structured PC work, team files, and run logs.
- Confirmed project bindings are isolated per project while candidate,
  unassigned, common, restricted, and conflict entries remain outside project
  timelines. A minimal system receipt surface checks completeness and dedupe;
  it is not a cross-project human or LLM timeline.
- Added deterministic replay, reclassification, stale-binding, branch,
  identity-forgery, and cross-project leakage fixtures. The implementation is
  pure and feature-OFF with no RAW, folder, DB, scheduler, network, ERP, MCP,
  or production-writer activation.
- Added provider-neutral `remote_llm` candidate provenance without granting
  classification, context, or task authority.

### Durable project-context foundation plan

- Kept `_workspaces` as the project payload owner,
  `_workmeta/<project>/project_context` as the durable project-context canon,
  and dev-ERP as the official task owner plus replaceable read model.
- Added the planned append-only
  `SourceSpan → ContextEvent → ContextUnit → ContextBranch → ProjectContext`
  hierarchy, short/medium/long summary revisions, reviewed memory candidates,
  and ERP projection receipts without creating folders, moving payloads, or
  changing a writer or database.
- Split P5 into contract, feature-OFF writer, one-project Slack/mail/voice
  Shadow, and ERP/MCP read-only projection steps. MCP, per-PC plugins, and
  optional agent clients remain query/proposal surfaces and may not write
  `_workmeta` directly.

### Personal MCP closeout recommendation

- Recorded a non-binding MCP contract recommendation that an accepted assignment
  should end with a structured closeout attempt and that an unclosed session
  should surface on the next assignment query.
- Limited the recommended closeout to performed-work facts, results, artifact and
  verification references, and observed gaps. Follow-up task, assignee, priority,
  due-date, and official-completion decisions remain TaskDriver responsibilities;
  the current one-shot `next_action` field remains compatibility-only.

### AX Codex client plugin plan

- Added the missing per-PC Codex client layer to the AX master plan so team
  members do not need to remember WorkSession IDs or manually announce every
  thread change.
- Ordered the client path as
  `AX-G1 → AX-G2 → AX-CP1 feature-OFF plugin → AX-G3 one-seat pilot → team
  rollout`, without changing the P0-P9 core or activating an MCP endpoint,
  credential, hook, writer, or team installation.
- Defined the planned plugin boundary around a task-work skill, MCP config
  template, `SessionStart` active-binding check, opaque local binding,
  durable outbox/ack helper, visible ambiguous-binding guard, and per-PC
  install/trust/revoke/uninstall verification. Raw transcripts, secrets,
  screen/keyboard capture, every-turn semantic summaries, and TaskDriver
  authority remain excluded.

## 2026-07-24

### Slack attachment and scheduled-ingress fail-closed guards

- Made all hosted files on one Slack message enter custody as one rollback-safe
  transaction, with exact content/file-ID receipt cleanup when a later
  attachment or page-state commit fails.
- Added single-link, opened-handle identity fences for persistent state reads,
  exact Slack file-download host/port allowlisting, bounded stream aborts, and
  an explicit continuation gap when a batch reaches `max_pages`.
- Made scheduled-task registration restore the prior exported task definition
  or remove the new task when post-registration XML attestation fails, and
  wired its PowerShell structural regression into `validate:slack-history`.
- Materialized the exact 537-file HPP Slack runtime and nine project-private
  bindings, then passed manifest verification, 9/9 no-network preflight, and
  the fixed 02:00/12:00 KST registration dry-run. Live registration remains
  gated on the owner-managed Slack app token and a real one-channel
  conversation-and-attachment canary.
- Added a reusable owner-managed Slack app manifest restricted to
  `channels:read`, `channels:history`, and `files:read`, with no posting,
  upload, auto-join, user-directory, Events API, or Socket Mode authority.
- Switched the live Slack credential contract to a v3 generic access-token
  binding so the installed read-only user token works without Slack's
  automatically proposed `chat:write` bot permission; legacy v1/v2 bot-token
  bindings remain readable for compatibility.
- Activated the HPP read-only Slack batch for nine exact project channels at
  02:00 and 12:00 KST after a live message/PNG/DOCX canary, replay/dedupe
  verification, and a successful scheduled-task run.
- Corrected the scheduled-task action to invoke the attested runtime launcher
  and made exported Task Scheduler XML attestation namespace-safe while
  cross-checking an omitted default run level against the registered task.
- Extended accepted Slack RAW sanitization to cover both authorized Slack file
  hosts, including explicit default port 443, before any locator can enter
  content-addressed custody.

### HPP continuous independent voice ASR and labels

- Added a separate HPP derived-voice worker that queues newly imported sessions,
  processes bounded independent `whisper.cpp` ASR, then stores deterministic
  timestamped semantic labels without changing RAW audio, project assignment,
  ERP, TaskDriver, or official tasks.
- Added a single hidden at-logon Windows supervisor with process and worker
  locks, `IgnoreNew`, profile and ASR binary SHA-256 pins, bounded per-cycle
  work, metadata-only health/receipts, and transcript-free operational logs.
- Replayed the current completed independent-ASR set after one GPU canary and
  one production-shaped worker cycle: 60 sessions produced 20,611 occurrence
  labels, and a full replay returned 60/60 duplicates with zero failures or
  official task/project mutations.
- Made the semantic-label CLI missing-session regression accept the native
  Windows `ENOENT realpath` failure while retaining the same fail-closed
  behavior.
- Activated the hidden HPP continuous task and observed consecutive healthy
  bounded cycles with one independent transcription per cycle, zero failures,
  and remaining backlog decreasing while project, ERP, TaskDriver, and
  official-task writes stayed disabled.

### PLAUD ready-candidate head-of-line recovery

- Changed bounded PLAUD discovery so a provider item still processing no
  longer consumes the only import slot and hides a later ready recording
  within the bounded probe window. Discovery remains capped, while ready or
  failed materialization attempts continue to honor the configured per-run
  import limit.

### HPP communication collection schedule

- Fixed the HPP Outlook Sent collection windows to
  `02:00-04:00,12:00-14:00` KST per the owner-approved 02:00 and 12:00 run
  times. The HPP capsule now injects this public-safe schedule independently
  from credential files, with a focused regression test.

### Backup controller Git-independent preflight

- Removed runtime Git `HEAD` and working-tree checks from the backup controller
  preflight. A bound NAS backup now proceeds regardless of the runtime checkout's
  commit, branch, or Git status, while retaining the existing host, path,
  reparse, policy-digest, ACL, and NAS write-probe safeguards. The v1 activation
  sidecar's `runtime_commit_sha` remains accepted as legacy metadata only.

## 2026-07-23

### Common timeline, voice occurrence labels, and Slack Web API ingress

- Corrected the common business-event timeline to persist every lane's
  `occurrence.occurred_at` as `Asia/Seoul` (`+09:00`) instead of canonicalizing
  labels to UTC `Z`. Voice semantic recording times and retrieval windows now
  use the same KST storage rule; explicitly named receipt/completion/lease audit
  timestamps remain UTC. Schema and date-boundary regressions reject persisted
  non-KST labels.
- Added one strict source-timeline annotation contract that can represent
  received/sent mail, Slack, voice, structured PC work, team files, and
  executor/run logs. Current common-timeline writers cover Slack, voice,
  structured PC work, team files, and executor/run logs; mail keeps its
  existing native `mail_occurrence` until the P5 semantic adapter is added.
  It preserves source revision/hash, explicit time precision, actors, project
  resolution state, confidence, dedupe, and append-only corrections without
  copying RAW bodies or granting TaskDriver authority.
- Added voice timeline projection and a bounded semantic sweep. Repeated person,
  project, equipment, value, request, commitment, decision, deadline, and
  action occurrences remain separate timestamped records. The private
  metadata-only receipt
  `task_engine_contextual_ingress_actual_canary_v1` records an HPP canary and
  corrected full existing-transcript sweep of 19,110 derived annotations across
  56 sessions; a complete replay reported all 56 as duplicates with zero
  official task or project mutations.
- Added Slack v2 Web API polling with token-workspace `auth.test`, exact
  channel verification, private
  single-link identity-fenced token loading, bounded history pages and
  wall-clock request timeout, immutable RAW custody, project-scoped
  source-arrival annotations, and explicit polling coverage gaps. Live Slack
  remains unbound until an owner-managed app/token is provisioned.
- Connected structured PC-work, team-file, and run-log queue acknowledgements
  to the common timeline, including recovery of a missing timeline annotation
  from an already valid queue acknowledgement.

### Outlook Sent custody pilot and Slack continuous harness

- Added an owner Outlook Sent provider inside the existing team-mailbox
  capsule. It attaches only to an active Outlook instance, pins the default
  store and Sent folder, exports bounded Unicode MSG objects into private
  content-addressed custody, and records sent mailbox observations with exact
  RFC Message-ID only when available.
- Made Outlook overlap replay restart-safe despite nondeterministic `SaveAs`
  bytes: the first native observation retains its immutable custody ref, each
  replay revalidates the retained object hash and file identity, and metadata
  drift or custody corruption fails closed. The bounded actual private canary
  stored two observations and replayed both with zero new objects or gaps.
- Added mandatory KST collection windows and a once-per-window success gate.
  The HPP policy is lunch `12:00-14:00` and night `20:00-23:00`; failures may
  retry on the next supervisor cycle inside the same window, while a successful
  window cannot query Outlook again.
- Connected one owner Outlook Sent row to the existing private HPP team-mail
  register and continuous supervisor after backup and bounded canary. The
  operating capsule completed all six enabled mailbox rows with zero mail
  errors, while project classification, team sent-mail coverage, and
  ERP/TaskDriver writes remain disabled.
- Added a feature-OFF Slack continuous-ingress harness with exact joined public
  project-channel binding, writer lease/epoch fencing, immutable raw-event
  custody, restart-safe cursor/dedupe, edit/delete/thread revision handling,
  and HOLD routing for private/shared/unmapped/file-bearing events.
- The Slack harness has synthetic transport only and rejects feature activation
  or embedded secrets. A reusable owner-managed Slack App/token and approved
  event/backfill transport remain required before any live collector can run.
- Materialized nine exact project-channel bindings in the HPP private config as
  feature-OFF metadata only. They contain no token reference, created no raw
  custody directory, and are not attached to a scheduler.
- No project classification, shared semantic labeling, CSV/XLSX projection,
  ERP/TaskDriver mutation, Slack posting, or email sending was enabled.
- Clarified the Task Engine execution boundary so continuous collection,
  immutable custody, normalization, exact binding, dedupe, and coverage remain
  fully deterministic and Codex/LLM-independent. Local `whisper.cpp`, local
  retrieval/embedding, local models, and Codex are optional inference layers;
  they may emit revision-bound candidates but cannot become the ERP server,
  sole writer, confirmed assignment, official completion, or TaskDriver
  authority.

### Local activity three-source query-only inventory

- Added separate stdin-only, query-only source inventories for dev-ERP
  WorkSession aggregates, the fixed project `file_activity` metadata layout, and
  exact `report_authoring_v0` workflow receipts.
- WorkSession inventory repeatedly checks WAL/SHM presence, never reads or
  hashes a sidecar, and refuses a late sidecar before DB open; it never
  constructs lifecycle or outbox writers. File inventory
  stats only the approved metadata layout and never opens or hashes business
  files. Run inventory requires explicit receipt paths and never discovers or
  recurses through `runs/**`.
- The bounded HPP canary reported the existing WorkSession sidecar guard, an
  unmaterialized file-activity owner root, and a missing exact run-receipt
  descriptor without mutating source metadata. No whole Codex log, file body,
  raw/stage log, conversation, collector, watcher, database writer, scheduler,
  classification, semantic labeler, MCP live route, or TaskDriver was enabled.

### Slack read-only source canary

- Added a stdin-only Slack inventory sanitizer that accepts only stable
  workspace/channel identifiers, project-name candidates, channel boundary
  flags, and one bounded history-probe summary, then returns redacted
  fingerprints and aggregate counts.
- Added schema and synthetic regression coverage for exact input keys,
  duplicate and invalid bindings, raw/message/secret field rejection, and
  zero working-directory writes.
- Confirmed connected-source availability separately from operation: no Slack
  app, token, event subscription, persistent collector, database writer,
  scheduler, project binding authority, TaskDriver, or outbound message path
  was activated.

### Outlook Sent Items query-only canary

- Added an explicit Sent Items source-availability command that attaches only
  to an already-running Outlook instance, uses a mandatory bounded window, and
  returns redacted aggregate count/freshness metadata.
- The query-only path reads no Inbox, subject, body, attachment, raw recipient
  address, item identifier, rule, or category data. It creates no repository,
  `_workmeta`, ledger, run-packet, or temporary files and rejects all mutation
  and project-selection options.
- Clarified that the pre-existing Outlook reconcile dry-run writes private run
  packets and therefore is not the strict query-only surface. No continuous
  collector, sent-mail writer, project classification, or TaskDriver path was
  activated.

### Task Engine live-source state interpretation

- Clarified that the actual five-lane canary was a bounded one-shot execution
  and that `CURRENT` inventory or feature-OFF foundations do not prove a live,
  continuous source binding.
- Recorded the owner-stated source split: received mail and PLAUD voice are
  `LIVE_UNACCEPTED`, while sent mail, Slack, Codex work log, file changes, and
  PC work are `UNCONNECTED`. The new normalized H→P5 project-classification and
  shared-label path and the P7 TaskDriver path remain OFF; legacy source-local
  mail routing and auto-intake remain `VERIFY_HP`, not accepted P5/P7 evidence.
- Added independent per-source operational gates for exact binding,
  multi-window continuity, classification and semantic/TaskDriver separation,
  HPP sole-writer fencing, rollback, and manual failover/failback. No runtime,
  source binding, collector, writer, schema, migration, or service changed.

### HPP continuous voice incremental custody

- Split the source-preserving voice mirror into its existing default
  `full_audit` mode and a checkpoint-based `incremental` mode used by the HPP
  continuous supervisor. Ordinary cycles compare allowlisted file size, mtime,
  and ctime and stream-hash only new, changed, or reappeared sources.
- Kept fail-closed custody behavior: a changed source fully revalidates every
  retained generation before immutable versioning, receipts remain exact, and
  the supervisor forces a complete source-and-custody audit on the first
  successful cycle at or after each 24-hour boundary. A copy-limit truncation
  cannot advance the last-full-audit checkpoint.
- Added distinct metadata-scan and payload-hash counters so an enumerated file
  count is not reported as if every payload had been reread.
- Added a fail-closed one-retry settle for OneDrive ctime-only hydration
  transitions. Size or mtime drift still fails immediately, and ctime-only
  transitions pass only when the second complete payload digest is identical
  and its metadata snapshot remains stable.

### Task Engine all-source data foundation

- Added feature-OFF, public-safe foundations for bounded strong-ASR voice
  revisions, Slack message/revision history, personal WorkSession lifecycle and
  client outbox, project file-history adaptation, exact run receipts, and
  synthetic external-schedule revisions.
- Added one root validation command that exercises the existing mail gateway
  together with voice, H00 envelope, file, run, schedule, Slack, WorkSession,
  and ERP MCP regressions. The implementations preserve source-native identity,
  append-only replay, six-state coverage honesty, raw/secret boundaries, and
  candidate-only task authority.
- This is `source_foundation_exists_acceptance_hold`: no live Slack app,
  schedule source, collector, DB migration, project classification writer,
  official completion writer, or operational service was enabled. D20, D25,
  D26, and D34 and the H00/H01~H07/P1 acceptance gates remain unresolved.

### Backup controller live-binding containment correction

- Corrected the backup-controller preflight to accept only the two strict,
  typed containments already used by the approved HPP private binding: the
  bound ERP DB below the pinned runtime checkout and the SHA-256-pinned recovery
  policy below the project metadata root. Equality, reverse containment, and
  unrelated resource overlap remain fail-closed.
- Added regression coverage for accepted relationships, equality, reverse and
  unrelated overlap, transitive third-resource nesting, and physical type
  mismatch. This correction does not relax the pinned HEAD and tracked
  runtime-module cleanliness checks and does not require the active development
  worktree to be clean during a backup run.
- Fixed the Windows `fsutil reparsepoint query` parser to return the matched tag
  itself instead of a nonexistent capture group, with valid and malformed
  output regressions.

### Task Engine sent-mail and Slack communication-history plan correction

- Extended the Task Engine master plan without activating collectors or writers:
  mail now separates one project-independent logical occurrence from multiple
  account/folder observations, preserves sender/to/cc/bcc roles, and forbids
  POP3 received-only coverage, fuzzy copy merging, CC assignment, or reply-based
  completion from being overstated.
- Recorded the current source gap explicitly: owner Outlook can reconcile local
  Sent Items, team POP3 collection covers inbox messages, and Soulforge SMTP logs
  only cover mail sent through that sender; the authoritative team sent-mail
  source remains an owner decision and live-binding gate.
- Added H07A/H07B Slack project communication-history planning. Stable
  `workspace_id+channel_id` bindings provide the default project scope, while
  message/thread/edit/delete revisions remain append-only, DMs/common/unmapped
  channels fail closed, and all detected work remains candidate-only.
- Added D33/D34, S25, AC-25, and HP-COMM-01..12 acceptance coverage. No Slack
  app/token/channel was connected, no mail source was changed, and no DB,
  project data, scheduler, network service, or operational writer was activated.

### Task Engine cross-input normalized label plan correction

- Split source fact normalization from semantic labeling so mail, voice, Slack,
  structured PC work, file, and run/log adapters cannot independently invent
  project, time, person, request, commitment, or decision meanings.
- Fixed a shared target crosswalk for typed project and party refs, source-native
  and normalized clocks, immutable revisions, project assignment state/basis,
  typed account and producer identity, exact evidence spans, policy revision,
  the owner-ratified PLAUD UTC exception, and unchanged source-relative offsets.
  Project codes, KST strings, and display names remain projections rather than
  identity.
- Added an append-only semantic annotation target with a shared primary signal
  vocabulary, supporting semantic facets, source-native label refs, a
  revision-bound lossless crosswalk, policy-bound confidence bands, explicit
  supersession, unknown and conflict honesty, one-mail/many-mailbox dedupe, and
  cross-channel non-merge. Existing voice candidate kinds map to the shared
  signals while all fifteen speech acts remain preserved as primary support,
  facets, or explicit gaps. Multiple exact spans/signals per occurrence remain
  distinct; only identical annotation tuples are deduplicated.
  Semantic annotations remain candidate evidence and cannot create assignees,
  ERP tasks, or official completion without the later TaskDriver gates.
- Added HP-LABEL-01..08 and AC-26 plan acceptance coverage and bound it to
  the limited H00/H06 identity/clock subset, source-native H01~H05/H07
  preservation, P3 relation normalization, P5 context labeling, and P6
  candidate discovery. Acceptance also requires append-only lineage replay and
  raw/secret negative fixtures. No schema, DB, collector, labeler, TaskDriver,
  or live writer was changed or activated.

## 2026-07-22

### Voice semantic Shadow labeler

- Added a deterministic, body-safe voice semantic labeler for an explicitly
  selected provider transcript or a SHA-256-bound completed local-ASR manifest.
  It accounts for every segment and detects controlled request, assignment,
  commitment, offer, decision, question, risk, completion-claim, cancellation,
  deadline, negation, and reported-speech states without printing transcript
  text or mutating accepted project routes or formal tasks.
- Added strict run/context-card schemas, synthetic adversarial tests, project-
  independent action candidates, conservative two-anchor project evidence, and
  an explicit later retrieval plan spanning mail, SE schedule, files, PC work,
  run logs, voice, RAG, and Wiki. The CLI is Shadow dry-run only and rejects
  `--apply`; context retrieval, context-card production, candidate projection,
  TaskDriver, and authoritative writers remain later gates.
- Fixed transcription cost policy on local `large-v3-turbo-q5_0` as the default
  whole-library pass and short ambiguous windows as the target stronger route.
  The current HPP pilot still uses whole-session `large-v3`; the separate
  bounded strong-ASR runner remains a later slice. Any cloud model requires a
  separate privacy/cost/network gate.
- Gave provider/PLAUD transcript text zero task, project, and retrieval-term
  authority; fast independent ASR can only select material windows for a
  stronger local pass, while unclear trivial conversation is discarded and
  only unresolved material meaning can request a bounded human audio review.
- Switched whisper.cpp output to full JSON so uncalibrated token-probability
  aggregates can be retained as quality signals without claiming calibrated
  correctness or exposing transcript text in summaries.
- Added a body-safe fast-versus-stronger ASR comparator and bounded review-audio
  builder. It tolerates equivalent critical values split across adjacent ASR
  turn boundaries, escalates only material semantic/value conflicts, and caps a
  human clip at 90 seconds without transcript bodies or task/project mutation.
- Bound strong-ASR authority to a verified fast/strong manifest pair, exact
  approved model artifacts, the actual session-audio digest, reconstructed
  transcript bytes from every chunk output/receipt, and a deterministic
  provenance receipt. The receipt explicitly states that this is a local
  artifact chain rather than hardware attestation. Global quality flags cannot independently trigger human
  review; review audio is source-hash checked and replay-bound to the exact
  window plan. Closed candidate/driver taxonomies and added adversarial guards
  for reported, negated, prohibited, questioned, conditional, incomplete-state,
  one-sided critical-value, and secret-like language. Review-window runtime and
  JSON Schema bounds now agree on an exact positive duration capped at 90 seconds.
- Added explicit regressions for ordinary Korean polite requests (including
  `보내줄래요` and `확인 가능하실까요`), unfinished work wording, and
  particle/suffix-bearing counts such as `3개를`, `3개씩`, or `3주간` so
  important meaning cannot be discarded as chat or falsely treated as ASR
  agreement. Greetings, acknowledgements, meals, thanks, weather, routine
  closings such as `이상입니다`, and casual chat remain no-review inputs, while
  genuine threshold/risk wording containing `이상` remains material. Common
  `덜 끝났습니다` wording stays a negated incomplete status rather than a
  completion claim. Semantic run identity now binds all
  output-determining recording/turn inputs; transcript-derived speaker labels
  are secret-filtered, including generic token/cookie/credential/authorization
  key-value forms and bearer credentials; and completed ASR provenance rejects missing or extra
  chunk JSON, receipt, text, or subtitle artifacts.
- Closed the in-memory authority gap: only module-branded fast and strong runs
  produced together by exact manifest/artifact verification can enter production
  comparison or candidate-summary projection. Serialized or self-consistent
  synthetic receipts remain untrusted; exported summary and review-clip helpers
  enforce the same in-memory provenance brands. Branded run/comparison objects
  are digest-bound and recursively frozen; the untrusted comparison path cannot
  produce summaries, and its review fixture is OS-temp-only. Runtime validation
  executes strict JSON Schemas plus authority/provenance checks for label runs,
  ASR comparisons, and project context cards, including unknown fields,
  absolute refs, and engine identity. Review windows now keep only start and
  duration; review-clip manifests derive the end bound.
- Added Korean regressions for compound routine closings and negated risk
  statements, plus normal-progress status, test/measurement results,
  colloquial decisions, and delivery-risk wording so ordinary business signals
  are neither discarded nor confused with casual conversation.
- Extended the material boundary to reading requests, self-assigned work,
  ordinary decisions, progress percentages, engineering values, standalone
  deadlines, and explicit cost/customer/safety/quality impacts. Negated future
  actions, approval conditions, and negated risk possibilities remain
  non-authoritative; acknowledgements and nearby meal quantities cannot create
  human-listen windows. Korean credential labels are filtered from speaker and
  entity surfaces.
- Bound production comparison to both frozen fast and strong runs from the same
  verified pair receipt, closed temporary junction escape in the untrusted
  fixture helper, bound transcript refs into run identity, aligned relative-ref
  and project-ref schema/runtime checks, and made the two-anchor/minimum-score
  project gate effective. Reported casual speech without an action signal no
  longer produces an obligation candidate.
- Hardened the final relevance boundary so courtesy and meal-preparation wording,
  negated risk events, and negated business changes remain no-review inputs,
  while `Ω` values, standalone submission dates, quality scores, safety grades,
  and customer-churn risks remain material. Project evidence now needs two
  distinct lexical values as well as two anchor kinds, and context-card entity
  values reject sentence-like transcript copies. Korean password, PIN,
  authentication-code, and access-key variants remain excluded from output.
- Closed fresh-review gaps for acknowledgement-plus-thanks, colloquial Korean
  requests/commitments/decisions, short relative deadlines, delivery-delay
  risks, Korean `옴`/temperature values, and delimiter-free Korean credential
  labels. Review windows are now exactly 30–90 seconds. Pair-authorized semantic
  analysis rebinds the reread manifest bytes to the provenance digest, and the
  context-card loader rejects every path outside the exact project card custody
  shape before opening JSON. Contained lexical phrases count as one project
  anchor rather than two. The behavior change advances the deterministic
  semantic engine to `1.10.7`.
- Bound production review-clip creation to the verified pair's exact session-
  manifest and source-audio digests, preventing a same-named session directory
  or coordinated manifest/audio replacement from borrowing comparison
  authority. Added regressions for colloquial Korean requests, promises,
  decisions, bare deadlines, delivery delay, copula-free engineering values,
  acknowledgement-plus-`고맙습니다`, and delimiter-free credential labels.
- Added indirect and noun-form polite request regressions for `송부`, `회신`,
  `답변`, and `...주면 좋겠습니다` so ordinary office requests reach the
  stronger-ASR gate instead of being discarded as context.
- Streamed the verified source bytes themselves into ffmpeg while hashing the
  exact consumed stream, eliminating the source-path check/use interval and
  deleting temporary clip output after runner, digest, read, conflict, rename,
  or process failure. The full-
  stream verification sink uses explicit `pipe:1` so Windows cannot create a
  stray file named `-`.
- Separated Korean polite requests from self-commitments, added conditional
  `...는 대로` and reported `달랍니다` boundaries, and retained ordinary
  progress, inspection-result, measured-voltage, and delayed-shipment wording
  as material. Explicit greetings/courtesy/meal talk still stop cheaply, while
  low-quality nontrivial text can no longer prove that a stronger ASR pass is
  unnecessary. Atomic manifest failure now removes its temporary file too.
- Generalized self-commitment detection around an allowlist of work verbs and
  Korean commitment endings, covering `송부하겠습니다`, `전달하겠습니다`,
  `공유하겠습니다`, and `확인해보겠습니다` without restoring the broad
  `하겠습니다` match that confused courtesy wording with a promise.
  (worker: codex_gpt-5.6-sol)

### Outlook request-table bounded width

- Set the structured Outlook mail preset to render request tables left-aligned at
  a fixed default width of 470 pt (about 16.6 cm), with AutoFit-to-window disabled
  and long cell text wrapped. The local Outlook executor now verifies the bounded
  width after save, close, and reopen, uses Word's point-width enum rather than
  its percent-width enum, and applies an owner-selected width only through the
  explicit override path. (worker: codex_gpt-5.6-sol)
- Added a semantic profile for three-column request-work tables. When shared
  context is outside the table, `담당자 | 요청 업무 | 완료·회신 기준` now uses
  580 pt total width with 90/225/265 pt columns so the completion/reply column is
  not cramped. Added typed send-correlation identities for direct SMTP and
  Outlook personal distribution lists; MAPIPDL members are fully resolved in
  memory and represented only by a canonical set fingerprint, with unresolved
  members blocking send before `.Send()`. (worker: codex_gpt-5.6-sol)

### Outlook owner-mail bound continuation fast path

- Extended the owner Outlook mail launcher and outbound authoring workflow with
  a same-task binding lock for subject, recipient order, body corrections,
  selected attachment, control surface, and logical signature. An unspecified
  local Outlook draft request now selects classic Outlook COM after a read-only
  availability probe, while UI control remains explicit-only.
- Corrected registered RTF signature insertion so Word `Range.InsertFile`
  receives `Attachment: false`, verifies an inline body-content delta, and
  rejects any RTF attachment before saving the insertion. A no-Outlook contract
  self-test covers the explicit InsertFile argument and non-starting COM probe;
  runtime checks own the inline-content and RTF-attachment guard. A separate
  file-only send regression covers one `.Send()` maximum, 30-second Sent
  Items/Outbox classification, and no automatic retry for an unknown or
  ambiguous result. (worker: codex_gpt-5.6)

### Fenced HPP PLAUD primary-writer capability

- Extended continuous-ingress binding v3 with an explicit `primary_writer`
  mode. The existing single HPP supervisor now passes the current node identity
  into PLAUD producer receipts, imports at most the bound number of recordings,
  and mirrors the new shared voice session into D-local custody during the same
  voice-authority-fenced cycle. Operator output remains metadata-only and does
  not expose provider IDs, titles, URLs, transcript bodies, or absolute paths.
- Writer mode fails closed unless the pinned profile registers the recording
  library, requires actual source-audio collection, disables `_workmeta` draft
  writes, and keeps independent ASR off for the intake cycle. Primary activation
  also requires a stable-read, SHA-256-pinned, at-most-30-day Mac-stop receipt
  proving the source service is disabled/unloaded with restart off and binding
  the exact HPP node and profile. Shared session publication is hidden until
  atomic rename and carries a durable pending repair sidecar; audio download is
  capped at 2 GiB with actual-size verification and bounded probing; every
  provider text artifact is capped at 64 MiB; executable discovery and all
  child work are timeout-bounded; every shared write rechecks the voice fence;
  and the D-local mirror resolves from the exact PLAUD output
  root with `sessions`/`library`/`delivery` lanes. Synthetic integration now
  proves one actual RAW session is created and mirrored byte-for-byte in the
  same cycle. Atomic sessions are capped at 2.25 GiB and eight files, with a
  4 KiB pre-publication reserve for bounded post-import metadata growth; required
  HPP RAW sessions receive mirror priority over unrelated backlog. Required-
  session custody is checked after the mirror, insufficient capacity fails
  closed, and incomplete custody or any remaining mirror limit keeps cutover
  readiness false. The HPP-custody obligation is embedded in the atomic session manifest
  and rediscovered across later cycles or restarts until verified, while
  historical observe-only v3 bindings remain compatible.
  Required-session routing resolves both the logical workspace path and the
  physical voice root before containment checks, so a supported cross-volume
  junction layout cannot be misclassified after a successful import.
  Runtime activation still requires the external binding digest and confirmed
  single-writer cutover from the Mac mini. (worker: codex_gpt-5.6)

### Feature-OFF HPP PLAUD provider observation

- Added continuous-ingress binding v3 so the existing single hidden Windows
  supervisor can hold a digest-pinned PLAUD profile and observe provider backlog
  without creating another scheduled automation. The v3 path reuses the
  existing voice authority/fence cycle, always invokes PLAUD with `apply: false`,
  and emits counts only; raw payloads, IDs, titles, URLs, and absolute paths are
  excluded.
- PLAUD remains disabled in the historical production v2 binding. V3 rejects
  profile drift, inconsistent mode/writer settings, and missing voice authority
  access. Windows executable discovery now uses `where.exe` while POSIX keeps
  `command -v`. No CLI installation, login, D: RAW write, collector switch, or
  Mac mini shutdown was performed. (worker: codex_gpt-5.6)

### Backup controller UNC path portability

- Windows drive and UNC resource paths now use `path.win32` validation even
  when the deterministic backup-controller tests run on macOS. RaiDrive UNC
  containment checks use the same path flavor, preventing valid Windows
  bindings from failing as `binding_resource_path_invalid`.
- Project History publication tests that require the Windows identity-bound
  path lock now remain active on Windows and are explicitly skipped on other
  platforms; validation-only tests still run everywhere. The team-readiness
  fixture now counts only mailboxes with current `ok` status, matching the
  fail-closed mailbox contract. Mail identity tests resolve the `uv` Python
  launcher to its real executable before applying the no-symlink identity
  guard. (worker: codex_gpt-5)

### AX optional external agent-client boundary

- Added a plan-only, vendor-neutral boundary for optional team-agent gateways
  and intra-task engineering workbenches. Hermes and Orca are recorded only as
  candidate adapters behind Soulforge MCP; their native task, memory, dispatch,
  and completion state cannot become ERP, WorkSession, AgentRun, knowledge, or
  canon truth.
- Added non-nesting, single WorkSession-writer, binary single-writer, Manual
  permission, candidate-only Git, independent P10 trial, rollback, and
  acceptance requirements. No product was installed, subscribed, connected, or
  activated. (worker: codex_gpt-5.6, independent review:
  gpt-5.6-sol ultra `REVISE`→보정→`ACCEPT`)

### Outlook 규칙 기반 메일 Shadow 분류

- Outlook 규칙 export와 owner 날짜/제목 override를 기존 ERP 메일 메타데이터에
  query-only로 재생하는 `mail:outlook-shadow-classify` 도구를 추가했다.
- 기존 프로젝트 배정 보존, 제목의 명시적 프로젝트 코드 우선, 규칙 충돌 및
  비프로젝트/미분류 분리를 추가하고 ERP DB·Outlook 무변경 검증을 포함했다.

## 2026-07-21

### Single hidden HPP ingress supervisor

- Replaced the production design that repeatedly launched the one-shot ingress
  CLI with one long-lived supervisor that performs fenced cycles at the pinned
  binding interval. Added safe signal handling, sanitized cycle events, and a
  fail-closed process exit for bounded Windows restart.
- Added a current-user hidden PowerShell launcher and exact-hash guarded task
  registrar. The task has one `AtLogOn` trigger, no repetition, `IgnoreNew`, a
  process-lifetime named mutex plus a cross-session exclusive file handle,
  bounded restart, and private redirected logs;
  duplicate launcher attempts exit successfully without disturbing the active
  process, and server power-policy defaults cannot stop ingestion. The collector
  no longer opens a console window every cycle. (worker: codex_gpt-5.6)
- Isolated a temporarily missing voice or queue source to that lane so mail and
  other healthy lanes continue with a degraded receipt. Existing unsafe linked
  sources remain fail-closed during binding validation. (worker: codex_gpt-5.6)

### Easy Explain tracked skill candidate

- Added the public-safe `easy_explain` canonical skill candidate and Codex bridge
  for owner-invoked, easy visual explanations of long or complex work. The
  bridge uses a proportionate visual, checks applicable structure, flow, files,
  data, functions, roles, boundaries, and next actions, and does not inherit
  authority to rerun or mutate the underlying task. (worker: codex_gpt-5)

### Bind copied Project History MCP to the terminal publication receipt

- Replaced the invalid comparison between the manifest's pre-receipt copied-DB
  hash and the final receipt-mutated DB. The feature-OFF MCP now requires a
  terminal publication receipt, rejects pending or missing publication state,
  verifies receipt-bound generation/ordering/manifest digests and publication
  intent, and still detects a DB mutation during startup. Updated the MCP launch
  documentation to the current private-binding and artifact-manifest CLI.
- Refreshed two synthetic default authority expiries that reached their fixed
  2026 date; production expiry and fencing checks remain unchanged.
  (workers: codex_gpt-5)

### Fail closed when registering ERP team mailboxes

- Reused the dev-ERP Hiworks credential form and connection-test API while
  requiring account-derived env files below `EMAIL_FETCH_PRIVATE_CONFIG_ROOT`.
  Credential saves now immediately run the existing collector in dry-run mode
  and persist only safe `ok`/`error` status codes. Missing files, Gmail-only or
  disabled results, and `missing_token` can no longer leave or display a stale
  connected state. No collector loop, mail persistence, or HPP writer was
  activated. Synthetic tests cover the private-root and fail-closed boundaries.
  (worker: codex_gpt-5)
- The administrator account form now distinguishes an invalid email format,
  a duplicate username, and a duplicate email instead of reporting all three
  as the same duplicate-account error.
- Team-mail register export now includes only active mailboxes whose latest
  connection state is `ok` and whose canonical private credential file exists.
  Pending or missing-credential accounts no longer block already connected
  teammates from entering the bounded HPP mail lane.
- The legacy dev-ERP manual and interval mail writer is now fail-closed unless
  `DEV_ERP_LEGACY_MAIL_WRITER_ENABLED=1` is set exactly. Mailbox connection
  dry-runs remain available, while the manual write API, interval registration,
  and the child-process orchestration path all require the explicit opt-in.

### Materialize frozen legacy mail into immutable HPP custody

- Added a copy-only legacy mail custody materializer over one exact private
  binding. It verifies every named source before and after read, stores unique
  bytes as content-addressed objects, and publishes an immutable committed
  snapshot linking original relative references to those objects. Dry-run is
  path-free and write-free; apply requires the binding's approval reference.
  Replay is idempotent, while path escape, overlap, link/reparse/hard-link,
  source drift, destination conflict, and snapshot conflict fail closed.
  Synthetic tests cover copy, replay, redaction, approval, tamper, traversal,
  and cleanup boundaries. (worker: codex_gpt-5)

### Produce a bound legacy mail dry-run descriptor safely

- Added an explicit-binding adapter for actual HPP event/custody, gateway
  `EmailEvent`, and ERP normalized JSONL files. It reads only named files,
  verifies before/after file identity and content, hashes all identifiers and
  conservative match inputs, validates HPP event-to-EML custody one-to-one,
  and passes a digest-only descriptor to the existing dry-run merge builder.
  Output and fixed-code failures expose no source values or paths; copy, write,
  apply, discovery, collector, scheduler, MCP, and activation paths remain
  absent. Synthetic tests cover real-like schemas and fail-closed boundaries.
  (worker: codex_gpt-5)

### Plan legacy mail custody merge without reading mail

- Added a dry-run-only legacy mail merge manifest CLI over one explicit,
  sanitized digest descriptor. Exact event IDs drive future dedupe; provider ID
  groups do so only when same-source differing events have identical non-null
  content proof. Conflicting or unproved provider groups remain distinct and
  review-only with deterministic group/record counts. Source choice follows HPP
  EML/current → gateway normalized+attachments → ERP body/preview →
  metadata-only, and conservative fingerprints remain ambiguous review items.
  Output is counts, digests, an action plan, and no-copy/no-write proof; there is
  no apply, collector, writer, scheduler, MCP, or activation path. Synthetic
  tests use temporary fixtures only. (worker: codex_gpt-5)

### Hardened HPP nested mail credentials

- Allowed existing `GMAIL_ACCESS_TOKEN_FILE` and
  `HIWORKS_POP3_PASSWORD_FILE` bindings inside the hardened Windows mail
  capsule without exposing credential bytes to Node, manifests, launch
  configuration, or operator output. A pinned discovery-only child resolves
  only normalized env-relative files beneath the exact private config root;
  the bootstrap rejects escape/reparse paths, locks each discovered file, and
  the actual child preloads it only under the discovered physical identity.
  Arbitrary external credential paths remain fail-closed. (worker:
  codex_gpt-5)

### Preserve immutable Hiworks RFC822 source custody

- Added exact POP3 RFC822 byte custody under the data-root-derived mailbox as
  content-addressed `.eml` files. Publication is atomic and no-overwrite;
  replay verifies and reuses identical bytes, while hash-path mismatch,
  traversal, symlink, junction, and reparse paths fail closed. Normalized
  events retain SHA-256, exact size, and a relative storage ref without
  embedding the message bytes. Synthetic MIME tests prove round-trip byte
  identity and attachment recovery while extracted attachment writes remain
  disabled in ingress-only mode. (worker: codex_gpt-5)
- Added a standalone offline custody-link CLI that accepts explicit private
  event/EML inputs, enforces the exact Hiworks content-addressed path shape,
  reads hash and headers from one identity-stable descriptor, and writes only
  immutable privacy-safe link metadata to a caller-selected private runtime
  owner. Source publication now retains the parent directory identity through
  temporary write, no-overwrite hardlink, and final verification. (worker:
  codex_gpt-5)

### Outlook terminal draft repeatability guard

- Fixed the owner Outlook mail launcher to keep explicit terminal requests on
  PowerShell/Outlook COM only, insert the selected signature as Word-editor
  body content without parsing signature HTML or attaching RTF, and verify
  non-ASCII text after Outlook rendering.
- Added recipient-language label selection and clickable primary-source link
  checks so an English external mail does not inherit Korean `수신/사유` and a
  plain URL is not mistaken for a working specification link. (worker:
  codex_gpt-5.6)

## 2026-07-21

### Feature-OFF explicit-scope knowledge query

- Added a stdout-only metadata query over one validated project-history
  knowledge projection. Callers must explicitly repeat the exact `project` or
  `common` scope and origin project; scope and foreign-project mismatches fail
  closed, so neither direction can use an implicit fallback.
- Added deterministic synthetic coverage for project/common reads, both
  fallback directions, origin isolation, projection tampering, transient raw
  questions, and zero-write CLI behavior. The slice remains held metadata only:
  it does not expose source/body/chunk/locator/private paths or enable accepted
  knowledge, ERP/MCP service integration, Wiki/RAG/canon mutation, or external
  publication. (worker: codex_gpt-5)

## 2026-07-20

### Feature-OFF unified daily backup-controller composition

- Added a one-wakeup daily-cycle composition for the future `Soulforge Backup
  Controller` Codex automation while retaining the hourly tick API. The daily
  cycle runs HPP snapshot, ERP DB plus metadata, health, due weekly verification,
  then the long workspace copy under one IgnoreNew lease. Critical receipts are
  durable before the workspace lane can finish with a warning.
- Added metadata-only idempotent cutover seeding, `not_before`, checkpoint/retry
  status, deadline/overlap gates, sanitized JSON results, HPP-only writer and Mac
  monitor/fallback-hold metadata, exact typed operational resource roots, and
  injected fixed command IDs with stage-bounded resource, stable operation key,
  lease fence, and abort context. Added exact external activation sidecars,
  pinned runtime checkout commit/clean-tree checks, typed OneDrive and RaiDrive
  UNC profiles, writer-exclusive local ACL gates, policy digest enforcement,
  fixed HPP/runtime DB/copy/health/verification handlers, atomic external
  receipts, crash reconciliation, and safe same-host stale-lease recovery.
  Runtime DB backup uses the existing WAL-safe runtime_ops backup plus read-only
  quick_check/hash verification; metadata and workspace copies are copy-only
  and junction/secret excluding. Recurring weekly recovery is full anchored
  no-write verification only. OFF short-circuits before preflight or probes.
  No automation mutation, live binding, delete/retention action, or takeover
  path is enabled.
  (worker: codex_gpt-5)

### HPP five-lane production-ingress cutover foundation

- Registered the owner-approved HPP five-lane production-ingress objective as
  a blocked public-safe mission/readiness surface. It binds the existing
  post-development full B/V workflow and records the C08B -> G00 -> G01 order
  without granting runtime authority, exposing private bindings, or enabling
  HPP/Mac role switches. (worker: codex_gpt-5)
- Closed the copied-ERP Shadow publication database-file identity HOLD without
  enabling publication. The projector now retains an identity-checked native
  read handle from before `DatabaseSync` open through final receipt sealing,
  checks path-to-handle identity at every commit/publication boundary, and
  rejects out-of-transaction byte metadata changes. After SQLite opens, the
  Windows helper adds a compatible read-only/no-delete-share native handle so
  rename and same-path replacement are denied without requesting SQLite's
  unshared DELETE access. The query-only verifier retains the same portable
  identity fence across DB/artifact parity checks. Shadow remains feature-OFF;
  accepted history, ERP/MCP routing, scheduling, cross-platform artifact
  publication, and cross-resource ACID authority remain disabled. (worker:
  codex_gpt-5)
- Added an additive content-addressed ingress backup with an independently
  verified restore-test path, stable custody watermark, declared SQLite
  `VACUUM INTO` snapshot, secret/ephemeral exclusion, and exact dry-run identity
  authorization. Repeated source bytes are deduplicated from the owned plan
  without reopening a provider-visible partial object. It never overwrites the
  live root.
- Added a durable five-lane writer-authority epoch with explicit
  primary/fallback modes, CAS transitions, active-run interlock, stale-writer
  fencing, guarded failback, and local-process liveness gates. Timestamp expiry
  alone cannot reap a paused local owner or a remote-host lock. Continuous
  binding v2 retains v1 compatibility while adding bounded team mail, a
  complete externally pinned collector release, a Windows pre-opened/locked
  operation-local code/register capsule, birth/change-time credential identity
  checks without Node-side secret reads or content digests, all-mailbox primary
  credential preload, metadata-only nested credential discovery with retained
  file locks, sanitized child output, and per-lane authority validation.
  Applied scheduler runs additionally
  require an external SHA-256 pin for the exact raw continuous-binding bytes.
- Added a strict receipt-to-Shadow v2 adapter that accepts zero or more explicit
  staging/voice receipts, emits exactly five honest coverage rows, separates
  source and writer attestations, requires an externally pinned independent
  Shadow authority record for validation builds, and keeps RAW copying, accepted
  history, ERP, MCP, and project promotion disabled. RAW-ingress writer
  authority remains scoped to custody only. The standalone projector CLI is
  validation-only, and the HPP cutover leaves Shadow publication unscheduled
  until one authority fence spans database commit and final publication and
  staged bytes remain immutable through rename.
- Hardened the authorized copied-ERP one-shot to one exact project and added a
  replayable Shadow publication state machine. CSV/XLSX/readback bytes are
  deterministically staged before DB mutation; the immutable generation and a
  pending publication intent plus immutable replay guard commit together; final
  manifest rename precedes an immutable published receipt. Recovery after a
  failed final rename or post-manifest crash now accepts only the identical
  request under the original binding digest, with the same current authority,
  capability, physical DB/root identities, project, generation/intent, exact
  whole-DB logical state digest, and no accepted pointer. Unrelated mutation,
  guard/schema tamper, authority expiry, receipt/conflict state, and a first-run
  copied DB whose SHA-256 is not allowlisted all fail closed. The query-only
  verifier rejects pending, DB-only, and artifact-only halves and requires
  receipt/manifest/DB/artifact parity.
- The retained native Windows helper now holds the exact authority and
  projection-root identities from before DB open through both DB transactions
  and final rename, while the same `DatabaseSync` connection stays open through
  final receipt sealing. This does not claim a native DB-file identity handle:
  an NTFS delete-deny handle opened before `DatabaseSync` prevents SQLite open,
  and opening it afterward fails with sharing violation because Node does not
  expose SQLite's retained native handle. Operational scheduling remains
  disabled pending a DB owner/driver surface that can supply that final fence.
- Added a feature-OFF continuous receipt-to-Shadow orchestrator that binds one
  externally pinned continuous run receipt and one explicit project to the
  existing v2 adapter under a separate Shadow authority epoch. It reports
  H01-H06 Shadow coverage in memory only and grants no scheduler, live DB,
  accepted-history, or production-readiness authority.
  (worker: codex_gpt-5.5)
## 2026-07-19

### Bounded actual five-lane custody staging

- Extended the source-preserving HPP staging command to one explicitly selected
  mail or voice occurrence in addition to the existing team-file, bounded PC
  work, and run-log lanes. Mail and voice are isolated under canary subtrees;
  their receipts remain unclassified custody evidence and cannot promote
  projects, knowledge, tasks, ERP rows, or live operating authority.
- Kept the existing continuous supervisor, mailbox collector, voice mirror,
  workspace, and knowledge/ontology canon owners unchanged. (worker:
  codex_gpt-5.5)

### Actual five-lane Shadow and copied-ERP projection

- Added a strict metadata-only builder for one actual five-lane Shadow
  generation, including native occurrence identity, immutable receipt-byte
  binding, exact initial project classification evidence, H06 coverage, and
  deterministic replay/conflict guards. Raw, body, transcript, payload,
  locator, and accepted-history fields fail closed.
- Added an explicitly authorized standalone copied-ERP projector and a separate
  query-only verifier. The projector uses an attested generation and immutable
  generation/event/coverage tables; the verifier checks copied DB, CSV, XLSX
  input, and XLSX readback row parity without advancing accepted/current
  pointers. (worker: codex_gpt-5.5)

### Feature-OFF copied Project History MCP

- Added a separate localhost-only MCP for one attested generation in a
  standalone copied ERP database. It exposes exactly two read-only tools for
  exact project/generation history and short-lived one-time CSV/XLSX download
  tickets, with bearer, Host/bind, path/reparse/hardlink, range, hash, expiry,
  replay, SQLite read-only, query-only, and zero-change guards.
- The MCP reconstructs and hashes the complete immutable generation under the
  canonical table/index/trigger fingerprint, requires DB/CSV/XLSX-input/XLSX-
  readback parity, and consumes an externally pinned manifest that binds the
  generation, ordered row digest, and exact artifact sizes/hashes. Present
  browser origins, listener authority, and aggregate ticket bytes are bounded
  fail-closed; ticket records share sealed artifact buffers instead of copying
  them per request.
- Kept the server default OFF and separate from the personal ERP and evidence
  ingress services; no LAN listener, credential issuance, firewall, or
  production database route was enabled. (worker: codex_gpt-5.5)

### Feature-OFF project/common knowledge projection

- Added an explicit-scope projection from the actual P26-016 Shadow generation
  to held project or common knowledge candidates, a fully derived graph view,
  and a rebuildable metadata-only RAG manifest/index. Project candidates remain
  P26-016-owned; common candidates are system-owned and retain their P26-016
  origin.
- The public helper has no fixed project constant: callers must supply an exact
  expected origin project code matching the generation, while common scope
  remains explicit and retains that origin.
- Added lineage, exact whole-ID origin, canonical chronology, five-lane set,
  graph-derivation, and manifest-laundering guards. The projection identity now
  binds the source attestation, and persisted metadata indexes must equal the
  complete deterministic manifest projection, so extra raw-text or authority
  aliases fail closed. Every authority remains false and no source text, RAW
  payload, locator, accepted knowledge, graph/canon mutation, Drive upload,
  NotebookLM synchronization, or live RAG activation occurs. (worker:
  codex_gpt-5.5)

### Five-lane project-history readiness foundation

- Added a public-safe C00A/C00Q/C00B-to-P1 gate map that cannot grant
  progression or activation and pins the V1 current-state snapshot so a map
  edit cannot self-declare later retained receipts.
- Added a synthetic-only five-lane Shadow, deterministic replay, conflict and
  cross-lane double-count guards, lane/type enforcement, exact initial
  classification transition, typed null/own-option-boundary failures, and H06
  coverage fixture on top of the H00
  envelope/coverage candidate. All default lane profiles remain unratified
  and no live adapter, writer, exporter, source binding, or service is enabled.
- Added the readiness suite to both root validation modes. (worker:
  codex_gpt-5.5)

### Root acceptance covers HPP ingress and MCP

- Added the bounded ingress staging, fenced continuous-ingress, and dev-ERP
  ingress MCP suites to both root `validate` and `done:check`, so changes to
  HPP custody or team ingress cannot pass the repository gate only through
  unrelated shared and voice tests.
- Extended the root-step wiring regression test for all three surfaces. The
  change affects validation only; it does not enable a collector, writer,
  scheduler, credential, listener, project promoter, or ERP route. (worker:
  codex_gpt-5.5)

### HPP AX AI delegation cross-review result

- Added the HPP-side Level 2 review result for the proposed expiring AI
  capability model. The result is `REVISE`: public/synthetic Stage A can move
  one exact child packet at a time, while source coverage Shadow, cross-source
  readiness, provisional writes, and live activation remain separate gated
  stages.
- Reconciled the public plan with aggregate HPP/Mac runtime evidence: some
  collectors are active, but the HPP runtime is not at the public baseline and
  ERP/MCP/project-history promotion and HPP mail sole-writer cutover are not
  accepted. The result adds explicit identity, fencing, parity, lease/epoch,
  and failback requirements without exposing private locators or raw payload.
- Reused the existing H06 coverage and accepted-generation concepts instead
  of creating a second ledger/pulse canon. No code, database, business data,
  writer, scheduler, service, or runtime binding was changed. (worker:
  codex_gpt-5.5)

### HPP AX AI delegation review packet

- Added a public-safe, read-only review packet for the actual high-performance
  PC to challenge the proposed shift from per-step approval to expiring,
  conditional capability bundles.
- Kept public/synthetic development, private source-read Shadow work, and
  provisional writes as separate candidate lanes. The packet grants no code,
  project-read, writer, scheduler, official-truth, or live-activation authority;
  private evidence remains metadata-only in its private owner surface.
- Required a Level 2 inspector-and-judge decision and scoped non-force publish
  protocol for the future HPP review result. (worker: codex_gpt-5)

## 2026-07-18

### HPP-primary and Mac-mini fallback role correction

- Recorded the owner-directed target split that makes the HPP always-on
  identity the normal primary for central ingress/custody, voice processing,
  and Task Engine/AX while keeping the Mac mini as lightweight monitoring,
  source HOLD/outbox, fallback/mirror, and a separate-worktree development
  host.
- Preserved the currently active Mac voice collector as a temporary failover
  while HPP is unavailable. A future HPP cutover requires exact identity,
  queue freeze and catch-up, receipt/ack parity, and a new lease/epoch; HPP and
  Mac may not write the same shared runtime concurrently.
- Kept NAS reachability separate from NAS mutation, automatic ingest, source
  approval, or canon-promotion authority. No live writer, scheduler, network,
  credential, storage, or NAS binding was changed. (worker: codex_gpt-5)
- Preserved `task_engine_redesign/**` and the integrated validation plan as
  byte-stable historical comparison oracles; their earlier Mac-primary wording
  is not a current runtime instruction.

### Windows device-capability validation stability

- Raised the file-only public capability CLI test timeout from 10 to 30 seconds
  so the full parallel core-loop suite does not misclassify a valid Windows
  probe as `status: null` under load. The probe remains read-only and its
  runtime behavior is unchanged. (worker: codex_gpt-5)
- Raised the dev-ERP life-tree HTTP fixture readiness budget from 3 to 15
  seconds so a valid Windows cold start is not misclassified as a server
  failure. Production server behavior is unchanged. (worker: codex_gpt-5)
- Raised the dedicated-worker integration client's request budget from 10 to
  30 seconds and the runtime workspace child probe from 1.5 to 5 seconds
  (bounded at 10 seconds), preventing valid fail-closed checks from timing out
  under the four-way Windows test load. (worker: codex_gpt-5)

## 2026-07-17

### Feature-OFF strict office-LAN mTLS ingress gateway

- Added an exact RFC1918 IPv4/TLS 1.3 mutual-TLS gateway in front of the
  loopback-only HPP evidence ingress MCP, with client-certificate enrollment,
  revocation, server-certificate pinning, exact Host/audience and certificate-
  to-bearer account/device/agent binding.
- Added a fail-closed exact RFC1918 client-source guard before handler-level
  certificate registry and bearer authentication, including IPv4-mapped
  address normalization; this supplements rather than replaces the OS firewall.
- Changed ingress credential CLI issuance to require a new protected token
  output file, fail before registry mutation on path collision, and omit the
  token from stdout.
- Added per-certificate rate/concurrency and request-body bounds plus per-
  credential open-upload, pending-byte, and retained-byte quotas without
  weakening restart-safe idempotent replay.
- Added a bound client transport, public-certificate-only device admin, safe
  one-seat preflight/read-only identity probe, four strict JSON schemas, and a
  physical canary runbook that keeps key/token material out of CLI arguments.
- Added a target-local enrollment flow that creates the private key and CSR on
  the work PC, sends only the public request/CSR to HPP for CA signing, verifies
  the returned certificate against the untouched local key, and writes the
  pinned client binding without printing key or bearer material.
- Added real TLS socket adversarial E2E for file, structured-PC-work, run-log,
  status, source preservation, unregistered/revoked certificate, bearer
  identity swap, host/route/body/rate bounds, server pin, and feature-OFF
  behavior. The endpoint is synthetic: no actual HPP LAN listener, firewall,
  certificate/token delivery, or other PC was activated. (worker: codex_gpt-5)

### Feature-OFF HPP evidence ingress MCP

- Added a separate loopback-only Streamable HTTP MCP that sends authenticated
  team files, bounded structured-PC-work events, and bounded run receipts only
  into the existing HPP local outbox; it does not open ERP DB, `_workspaces`,
  project promotion, accepted history, or TaskEngine completion paths.
- Added person/account, device, and AI-agent credential identities with exact
  project/capability scopes, SHA-256-only token registry storage, expiry,
  revocation, account/object existence isolation, and local issue/list/revoke
  administration with one-time token display.
- Added size/hash-bound resumable chunks, restart-safe idempotency, immutable
  source retention, pending versus verified HPP acknowledgement, strict schemas,
  path/extension/boundary guards, and a client CLI that never accepts a token on
  the command line.
- Added adversarial unit/integration coverage and a multi-process E2E in which
  three isolated virtual work PCs exercise all six MCP tools, concurrent file/
  work/run lanes, project denial, cross-account denial, server restart, ack
  verification, and credential revocation. LAN/TLS/firewall, actual team tokens,
  mail credentials, malware scan/quota, promoter/history, and production remain
  OFF. (worker: codex_gpt-5)

### Default-OFF continuous non-mail ingress supervisor

- Added a strict private binding schema and one-shot HPP supervisor for the
  existing voice copy-only mirror and explicit team-file, structured-PC-work,
  and run-log outbox queues.
- Added a D-local exclusive lease, monotonic epoch and per-payload fence-token
  revalidation, expired-lease archival, source-preserving queue drain, bounded
  coverage gaps, restart-safe idempotent replay, run receipts, and health state.
- Kept mail credential-pending, scheduler installation, arbitrary workspace
  discovery, client outbox deletion, project promotion, ERP/MCP/TaskEngine
  writes, and continuous activation outside the public runner. (worker:
  codex_gpt-5)
- Added an explicit-file local outbox producer with immutable occurrence
  payloads, pending metadata receipts, same-key conflict rejection, and safe
  handoff into the HPP queue drain. Collection still does not imply project
  classification, official history, authenticated cross-PC acknowledgement,
  or task completion. (worker: codex_gpt-5)
- Added post-custody queue acknowledgements bound to the active fence epoch.
  Acknowledged immutable occurrences are skipped on later cycles, crash-before-
  ack retries remain idempotent, and changed source stat identity fails closed;
  cross-PC ack delivery and client compaction remain disabled. (worker:
  codex_gpt-5)

### Common file-backed unclassified ingress staging

- Added one default-dry-run command for explicitly staging a regular team file,
  structured PC work event, or run log into its fixed data-plane incoming lane.
- Added verified SHA-256 copies, immutable digest paths, metadata-only receipts
  and checkpoints, idempotent reruns, immutable changed-content versions, and
  fail-closed manifest/path/symlink/overlap/stability/existing-content guards.
- Split content identity from opaque source-occurrence identity so identical
  bytes deduplicate to one payload while each owner/key keeps distinct receipt
  and checkpoint history, including immutable changed-content generations.
- Revalidate physical staging parents immediately before temporary writes and
  final publication so a changed directory fails without publishing metadata.
- Kept project classification, accepted/quarantine state, source mutation,
  directory crawling, ERP/DB, network/MCP, service, task, and scheduler writes
  outside this bounded staging collector. (worker: codex_gpt-5)

### ERP-independent team mail raw ingress path

- Added an explicit `--data-root` binding for the existing team mail collector
  so its private config, mailbox source custody, and restart state can live on
  one stable data volume without reconnecting mailbox accounts.
- Added `--ingress-only` / `EMAIL_FETCH_INGRESS_ONLY=true` to store raw and
  normalized mail events plus cursor/dedupe/run state while skipping project
  history, candidate, notification, PLAUD-trigger, native-attachment, and
  link-download writes.
- Kept activation separate: no account secret was created or changed and no
  collector, ERP, MCP, or scheduler was started. (worker: codex_gpt-5)

### HPP voice copy-only migration/audit mirror

- Added a path-agnostic, exact-lane voice mirror that verifies source stability
  and SHA-256 before adding payloads to a central data root.
- Added restart checkpoints, immutable metadata receipts, legacy-tree seeding,
  idempotent reruns, bounded per-run copy limits, and no-delete/no-overwrite
  behavior for missing or changed source files.
- Kept the Mac mini source-writer role and OneDrive workspace unchanged; the
  mirror is unaccepted staging, not `transfer_service` acceptance, and does not
  classify projects or write ERP, task, or workspace history.
  (worker: codex_gpt-5)

### Stable private mail collector storage binding

- Added `EMAIL_FETCH_PRIVATE_CONFIG_ROOT` support so ERP mailbox credentials and
  the team mailbox register can remain in one private data root while immutable
  release checkouts are replaced.
- Made ERP mailbox credential write/delete, single-mailbox connection tests,
  team-register export, and team collection resolve the same stable private
  root, while retaining traversal rejection and secret-free public metadata.
- Kept collection activation separate: the new binding does not start a
  collector, scheduler, MCP service, or writer by itself. (worker: codex_gpt-5)

### ERP MCP default-OFF runtime guard

- Made ERP MCP DDL and HTTP routes opt-in through `DEV_ERP_MCP_ENABLED=1`.
- With the flag absent or disabled, server startup does not materialize
  `erp_mcp_*` tables and MCP endpoints return 404; existing core ERP behavior
  remains available.
- Added an integration regression for the default-OFF boundary and kept the
  existing MCP pilot test explicitly enabled. This is a feature-OFF deployment
  foundation, not a live MCP, token, scheduler, writer, or team activation.
  (worker: codex_gpt-5)

## 2026-07-16

### Task Engine A8-SYNTH secure-access source foundation

- Added a public/pathless/feature-OFF pure verifier with strict packet/output
  schemas and computed `HP-STORAGE-01..10`, `HP-INGRESS-01..16`,
  `HP-SESSION-01..18`, and `HP-QUERY-01..16` coverage.
- Bound seven source custody/policy rows, enrollment and delegation ceilings,
  exact ticket/finalize/range behavior, WorkSession crash/ack/handoff fixtures,
  ACL/existence/RAG/cache/redaction cases, and HPP sole-writer/topology guards.
- Restricted CLI packet reads to a contained relative regular file and added
  deterministic domain-separated packet/policy/suite/category/coverage/check/
  receipt digests, strict safe-error effects, and 19 focused adversarial tests.
- This is source implementation evidence only. D27-D29 owner acceptance,
  `VERIFY_HP`, live/private binding, DB/data/write/network, A8-CANARY, P0-P10,
  bulk, team, and production effects remain `0`. (worker: codex_gpt-5)

### HPP MCP/storage/access plan correction

- Preserved `_workspaces/<project>` as the actual logical project body/payload owner, its established OneDrive-
  junction physical materialization, and P0→P10 while separating narrow active runtime exclusions from HPP TARGET custody.
- Added independent public/pathless `A8-SYNTH` and `A8-CANARY` only after SYNTH PASS+accepted private
  `VERIFY_HP` exact binding receipt+strict office LAN+explicit owner+Level 3, plus exact-revision transfer,
  ACL/RAG/redaction adversarial acceptance, and
  fail-closed rollback/outage rules. No topology, code, schema, data, binding, or activation change was made.
  (worker: codex_gpt-5)

### Task Engine C00B pure judge foundation

- Added a separate deterministic C00B packet judge and strict PASS receipt
  schema for exact approval/expiry/revocation, frozen C00Q refs and digest,
  all authorized-observation sources across five lanes (at least one per lane),
  C00-LIVE-01..04 scope, zero mutation, sentinel, and stdout-only
  authority-effect checks.
- Bound C00A/C00Q full-B/V prerequisites, owner-with-state executor inventory
  authority, revocation refs, source adapter/allowlist/time/row limits,
  adapter-specific quiescence authority, output field/retention refs, explicit
  required/resolved/unresolved proof sets, and deep SQLite fingerprint
  equivalence. Nonempty catalog aggregate rows are covered by regression tests.
- Removed self-attested PASS: the judge now requires a separately supplied
  owner-approved packet digest, recomputes its non-recursive binding domain,
  and binds every authority plus the C00Q full-B/V and per-source contracts.
  Frozen C00Q tool/test/schema Git blobs and SHA-256 values are exact constants.
- Added required/optional/not-applicable expected-source owner rules, producer
  descriptor/manifest binding, frozen C00Q identifier/source-set validation,
  SQLite main-present/WAL-SHM-absent equivalence, complete receipt evidence and
  earliest-expiry fields, and fail-closed BLOCKED proof/effect envelopes.
- Required an independent packet- and evidence-bound C00A acceptance authority
  plus the exact C00A BLOCKED receipt-state summary; its authority, revocation,
  and expiry now participate in global uniqueness and effective expiry.
- Replaced the receipt test's manual schema-shaped assertion with strict Ajv
  2020 compilation/validation and explicit unknown-key rejection.
- This is a pure foundation, not a live reader: no source, DB, workspace,
  collector, runtime, or writer was opened or changed. Live C00B remains
  blocked pending exact D bindings, authority, quiescence, and a separately
  authorized live packet. (worker: codex_gpt-5)

### Task Engine C00B private-binding producer foundation

- Reserved `task_engine_inventory_c00b_binding_producer.mjs`, strict
  `soulforge.task_engine_inventory_c00b_binding_input.v1` and
  `soulforge.task_engine_inventory_safe_aggregate_evidence.v1` contracts,
  focused tests, and `validate:task-engine-c00b-binding-v1` for producing a
  private C00Q descriptor, safe aggregate evidence, and digest-bound C00B
  packet from an owner-approved private binding input. The public producer,
  schemas, focused tests, and validation script are implemented; a live private
  binding remains unavailable until exact lane authority and source evidence
  exist.
- Frozen C00Q/C00B files remain unchanged; locators stay private input-only,
  public defaults are not live bindings, file mtime is not business freshness,
  incomplete grants fail closed, and final packets require a separately supplied
  digest-bound authority input rather than producer-created authority. Private
  artifact writes are restricted to a grant-bound real output root and three
  exact filenames with no temporary artifact name; descriptor/aggregate writes
  additionally require an approved descriptor binding state and their
  digest-bound materialization approval. Failure cleanup never deletes an
  output pathname. Freshness
  timestamps, stale ceilings, and evidence refs are
  authority-coupled. C00B PASS unlocks only H00 review—not P1, writer, or
  activation. No live-readiness claim was created.
- Final source-evidence authorities now carry exactly one
  `aggregate:<64hex>` ref matching the safe aggregate evidence digest. Proposal
  inputs may omit it, while missing, wrong, duplicate, or misplaced final
  carriers fail closed. The producer also preflights the complete packet with
  the unchanged frozen judge before any packet write and rejects nested
  manifest extras plus GitHub, Slack, and AWS token-shaped strings without
  reflecting them.
  (worker: codex_gpt-5)

### Task Engine C00Q query-only inventory synthetic foundation

- Added the public/synthetic five-lane inventory descriptor and manifest schema,
  deterministic query-only CLI, pre-open WAL/SHM quiescence and SQLite
  read-only/zero-mutation guards, and
  sanitized mail/voice health evaluators with explicit D25/D26 blockers.
- This slice performed actual live/data/DB/workspace/collector/write execution
  `0`; C00B live binding and execution remain stopped pending separate owner
  approval. (worker: codex_gpt-5)

### Structured Outlook request-mail default

- Reserved compact rendering for pure shares and made any requested work or
  required response select a structured action brief, including single-item
  requests.
- Added a stable request-work table contract and forced newly authored Outlook
  paragraphs, headings, bullets, and table cells to black instead of inheriting
  reply-thread colors.
- Added an owner correction lock, visible top `수신/사유`, purpose/status and
  review-basis ordering, completion/reply criteria, stale-term rejection, and a
  deterministic file-only validator before Outlook application.
- Defined the complete derived validation packet and added a 16-case file-only
  regression matrix for required fields, visible recipients, subject/thread,
  attachment, deadline, body/HTML, address, and footer/application guards.
- Kept all synthetic skill evaluation outside Outlook and prohibited sample
  draft creation, recipients, attachments, COM objects, and send actions.

### Outlook draft control-surface binding

- Bound explicit terminal/programmatic Outlook draft requests to the local
  programmatic executor and prohibited implicit UI or computer-control fallback.
- Limited the executor to one unsent current-request draft, exact selected
  attachments, runtime-only attachment password handling, and no send authority.

## 2026-07-15

### PLAUD 녹음 시각 KST 정규화

- offset 없는 PLAUD CLI `start_at`·`created_at`을 provider UTC로 해석한 뒤
  `Asia/Seoul`로 정규화하도록 수집 경로를 보정하고, manifest에 원시 시각
  해석 근거를 남기도록 했다.
- 기존 `plaud_cli_import`의 잘못 표기된 시각과 session/library/delivery/ASR/
  project-context pointer를 원문 payload 변경 없이 일괄 이관하는 dry-run 우선
  `audit-kst`·`migrate-kst` 경로와 회귀 테스트를 추가했다.
- KST 적용 범위와 예외(명시적 `Z` audit 시각, 녹음 시작 기준 상대 전사 시각)를
  root agent 지침과 PLAUD 운영 계약에 고정했다. (worker: codex_gpt-5)

### 할일 엔진 ingress·팀 WorkSession·지식 조회 계획 보정

- 기존 P0→P10과 HPP sole-writer 구조를 유지하면서 source별 payload custody/promotion receipt,
  personal WorkSession start/bind/checkpoint/closeout/outbox/ack, ERP UI/MCP accepted-generation
  primary query와 candidate-only team knowledge 계약을 마스터플랜과 companion 문서에 추가했다.
- Pointer/reference 기본, central upload inbox custody, promoter/projector/TaskEngine writer 분리,
  `{assignment epoch,account}` active primary 하나, closeout≠official completion, explicit
  `project|common` scope/no implicit fallback을 계획 기본값으로 고정했다.
- 구현·DB·업무 데이터·migration·writer·MCP/network/운영 활성화는 수행하지 않았고 D27~D29와
  HP-INGRESS/SESSION/QUERY 검증 뒤 별도 owner 승인을 요구한다. (worker: codex_gpt-5)

### 지식·온톨로지 정본 저장 권한 등록

- owner 승인과 manifest/revision/SHA-256/source/review/classification/
  NotebookLM/recovery 조건을 모두 갖춘 Google Drive ontology release만
  package 정본으로 인정하고, `.registry/knowledge`는 public-safe Git 실행
  투영, `_workmeta`는 metadata-only catalog로 고정했다.
- NotebookLM은 승인된 책장을 우선 질의하는 advisory view로, 회사 NAS는
  owner-approved one-way 재해복구 사본으로, OneDrive는 active 편집면으로
  분리했다. 자동 overwrite와 미승인 NAS 경로 사용은 금지했다.
- 선택된 registry 파일에서 release inventory/hash/query view를 만들고
  restore sample을 검증하는 `guild_hall/knowledge_canon` helper와 focused
  validator를 추가했다. (worker: codex_gpt-5)

### 할일 엔진 H01 메일 이력 phase 경계 보정

- 현재 JS/Python/Outlook 세 project-mail writer와 ERP CSV consumer의 caller/write 경계를 public source로
  다시 고정하고, H01을 project-independent occurrence·append-only classification용 `H01A` pure shadow와
  D25 policy-bound `H01B` coverage acceptance로 분리했다. Exact BUILD path/symbol/command와 D26 mail owner가
  아직 없으므로 H01 readiness는 `HOLD / REVISE`다.
- H01은 `MAIL-03` identity/supersession subset, shadow `MAIL-12`, D25 뒤 `MAIL-11` contract/synthetic
  fixture만 소유하며 실제 Mac/source coverage는 별도 authority 전 `UNKNOWN/VERIFY_HP`다. Lock·epoch,
  DB current/event/outbox, CSV/ICS/XLSX parity, HPP sole writer, Mac fallback과 failover/failback은 P8/P9/P10으로
  돌리고 `H01-HOLD-01..06`, literal read-only legacy evidence와 future candidate path를 추가했다. 구현,
  private/live 조회, DB·업무 데이터·writer·운영 활성화는 수행하지 않았다. (worker: codex_gpt-5)

### 할일 엔진 H00 ratification packet exactness 보정

- H00의 세 public candidate blob 의미와 20/20 helper/test coverage는 유지하면서, future owner
  ratification이 accepted+unexpired C00B receipt, approval-time clean HEAD의 three-blob match,
  exact validator receipt와 fresh Level 2 review receipt에 결합되도록 packet을 보정했다.
- Validity는 exact blobs에 대한 `content-addressed-until-revoked`로 고정하고 issued-at/null expiry/
  revocation semantics와 authority-effect map을 추가했다. Overall RATIFY는 H01~H05 exact child-packet
  review만 열며 adapter, H06, D19~D26, completeness, file edit, writer/migration/live/activation 권한은
  만들지 않는다. H00 ratification·candidate file 수정·private/live 조회·구현은 수행하지 않았다.
  (worker: codex_gpt-5)

### 할일 엔진 C00B authority packet readiness 보정

- C00B를 H00 이전의 authority-backed source owner/root/writer/consumer/source-availability inventory로
  한정하고, H00의 six-state completeness·`known_at` window·D25 gap vocabulary를 선사용하던 순환
  가능성을 제거했다. Authority가 확인한 current 부재·gap과 evidence authority 자체의 누락·만료를
  분리해 전자는 inventory finding, 후자는 `BLOCKED`로 고정했다.
- `C00B-HOLD-01..08`에 frozen C00Q ref, baseline/approval/expiry, exact profile·세 authority 분리,
  lane source descriptor·query allowlist, output owner/destination, source별 zero-mutation, C00-LIVE-01..04
  closure, separate judge와 H00-only unlock을 명시했다. 구현·C00B 실행·private/live 조회·metadata
  report write·DB/업무 데이터 변경은 수행하지 않았다. (worker: codex_gpt-5)

### 할일 엔진 C00Q exact packet readiness 보정

- C00Q의 public/synthetic tool 경계는 정해졌지만 입력 descriptor·literal CLI flags·lane source
  adapter/authority 계약이 없어 아직 exact implementation packet이 될 수 없음을 확인하고
  `C00Q-HOLD-01..06`으로 고정했다. C00Q exit `0`은 review-ready manifest일 뿐 P0 PASS/P1 unlock이 아니며,
  C00B separate judge만 phase receipt를 판정한다.
- 기존 team preflight의 `DatabaseSync(readOnly)+PRAGMA query_only`와 synthetic hash/size/mtime 불변
  검증은 재사용 패턴으로, WAL·DDL·migration·backfill을 수행하는 `openStore`는 금지 경로로 명시했다.
  새 schema owner는 app README와 root CHANGELOG로 닫고, 기본 packet은 package/lock dependency를
  늘리지 않는다. 구현·C00A/C00Q/C00B 실행·private/live 조회·DB/업무 데이터 변경은 수행하지 않았다.
  (worker: codex_gpt-5)

### 할일 엔진 C00 query-only 선행 의존성 보정

- C00/P0가 요구하는 다섯 lane의 physical owner/default root, writer/caller, consumer, coverage 증거를
  현재 없는 `task_engine_inventory.mjs`로 닫으면서 그 도구를 C09A/P9에서 처음 만들도록 했던
  순환 의존성을 확인했다. 기존 doctor/device capability probe와 workspace-system inventory는 이
  증거를 대신할 수 없음을 public source로 고정했다.
- P0를 `C00A` public blocker preflight → 별도 승인된 `C00Q` public/synthetic inventory tool/schema/test
  foundation → 다시 별도 승인된 `C00B` owner-authorized query-only inventory로 분리했다. C09A는
  C00Q의 frozen 산출물을 소비하고 migration dry-run/apply tooling만 소유하도록 WBS·acceptance·owner
  gate를 보정했다. 이번 변경은 계획 문서만 수정했으며 C00A/C00Q/C00B 실행, 코드·DB·업무 데이터,
  migration, writer, 운영 활성화는 수행하지 않았다. (worker: codex_gpt-5)

### 할일 엔진 C00 public-only preflight packet 보정

- `TEAX-C00/public_only_stdout`에 approval-time SHA equality, tracked-only before/after tree·diff,
  literal public file·symbol inspection allowlist와 stdout-only receipt shape를 추가했다.
- root-wide status/search와 candidate ref 접근을 public-only allowlist에서 제외하고, fixed live-proof
  목록·raw-field sentinel·`PASS/BLOCKED/BASELINE_DRIFT` exit semantics를 고정했다. 현재 CV-02가 남은
  public-only fixture는 `BLOCKED`, P1 unlock `false`다. C00 자체나 private/live query는 실행하지 않았다.
  (worker: codex_gpt-5)

### 할일 엔진 아침 owner 승인 packet 보정

- 첫 실행 후보 C00의 copy-ready owner 답변에 approval-time baseline SHA, inventory scope/profile,
  required live proof, authority/output, approval ref와 expiry를 모두 명시하고, `public_only_stdout`의
  API/DB/private/live query를 `0`으로 고정했다.
- H00은 C00 PASS 뒤에만 선택할 수 있는 ratification-only gate로 유지하면서, pinned candidate의
  계약·helper·test 3개 literal path/blob, exact test command, 네 의미 항목별 `RATIFY | HOLD` 답변
  shape를 고정했다. H01~H05는 다시 lane별 exact child packet·owner gate를 통과해야 한다.
  구현·private/live 조회·데이터 변경·writer·운영 활성화는 수행하지 않았다. (worker: codex_gpt-5)

### 할일 엔진 승인 전 packet 실행성 경계 보정

- C00은 `public_only_stdout` owner 선택에서만 시작 가능한 exact first packet, H00은 C00 PASS 뒤
  pinned `canon_candidate` ratification-only gate로 분리했다.
- H01~H06과 C01/C04/C06/C07/C08 split 행은 write 권한이 없는
  `non_executable_phase_card`로 명시했다. 구현 전 child packet은 full YAML field, literal
  existing/BUILD path, symbol, exact validator command, dependency receipt와 owner decision ref를
  가져야 하며 generic glob/module/test/package 표현은 allowlist로 사용할 수 없다.
- 아직 등록되지 않은 `validate:task-engine-core-v1`은 C01A에서 사용하지 않고, C01B exact child
  packet이 root `package.json`에 canonical cross-root command로 등록한 뒤 C02/C03/C04B가 소비하도록
  owner와 순서를 고정했다. 구현·DB·업무 데이터·migration·writer·운영 활성화는 수행하지 않았다.
  (worker: codex_gpt-5)

### 할일 엔진 공개 source traceability 보정

- P1 common history 예시를 독립 event envelope와 coverage receipt pair로 맞추고,
  `partial>=0+gap`, `failed/not_collected=null+gap`, owner-approved `not_applicable` 규칙을
  H00 계약과 일치시켰다. H03A/H03B의 D19·D20·D25·D26 선행조건, H04의 immutable source
  ref와 replaceable bounded projection 구분, mail v2/export redacted field allowlist도 명시했다.
- P2의 `valid_at/known_at`은 query cutoff이고 persisted source event는 owner-native fact/knowledge
  clocks를 보존한다는 lossless crosswalk owner gate를 추가했다. 근거가 없는 P5 `signed` 표현과
  CURRENT처럼 읽힐 수 있던 historical observation 문구를 낮췄다.
- HPP coordinator/projector, lock·lease·epoch, emergency fallback과 E→E+1→E+2 절차는 current
  구현이나 기존 canon이 아닌 plan-owned `TARGET` 후보임을 §11.2B에 고정했다. D21~D23 contract
  sync와 P10 Level 3 evidence 전에는 authority·role switch·failover/failback을 부여하지 않는다.
  코드·DB·업무 데이터·migration·writer·운영 활성화는 수행하지 않았다. (worker: codex_gpt-5)

### 할일 엔진 마스터플랜 전체 정합성 보정

- 계획 시점 Git·runtime·validator 관찰값을 현재값과 분리하고, C00 승인 시 exact ref/count를
  다시 pin하도록 고정했다. H01~H05 모든 lane에는 D26 exact mapping 전 adapter 금지와 D25
  coverage policy 전 acceptance 금지를 명시했다.
- P8은 feature-OFF cutover fixture, P9은 별도 승인된 한 프로젝트 bounded switch, P10은
  production cutover·failover/failback으로 분리했다. 마지막 승인 도식도 C00 PASS → H00 ratification →
  H01~H05+D24~D26 → H06 PASS 순서를 우회할 수 없게 보정하고, 누적 plan-scope 검증 receipt의
  기준 ref와 historical 범위를 명시했다. 구현·DB·업무 데이터·migration·writer·운영 활성화는
  수행하지 않았다. (worker: codex_gpt-5)

### 할일 엔진 P1 H02~H06 readiness 재검토 보정

- 음성, structured PC work/외부 SE 일정, 파일, 실행·로그 레인의 public 계약과
  합성 검증면을 다시 대조해 H00 ratification 전 adapter 금지선을 명시했다.
- H03은 structured PC work(H03A)와 external schedule owner 계약(H03B)의 내부
  선행순서로 분리하고, task-chat 원문과 task-chat completion-hook/full-message summary를 coverage로 쓰지 않도록
  고정했다. H04 bounded projection의 `partial` 의미도 complete ledger와 분리했다.
- H05는 승인된 exact schema와 명시 ref만 받도록 제한하고 `runs/**` 재귀 탐색,
  raw/stage log 수용을 금지했다. D26에는 다섯 lane의 typed native occurrence 후보와
  아직 결정되지 않은 owner/subtype을 분리했다. daily ledger/context life tree는 source truth가 아닌
  파생 projection이므로 H00 project-history occurrence/event/coverage count로 중복 산입하지 않으며,
  current five-field ID는 full-record identity/boundary 검증 전 allowlist에서 제외했다. D26 owner 결정을
  임의 값으로 메우지 않는 20개 pre-approval 합성 fixture도 계획에 고정했다. H06은 H00과
  H01~H05 acceptance, D24~D26 결정 전 readiness-only 상태를 유지한다.
- C00을 public-only/stdout과 별도 승인된 query-only mode로 분리하고 실행 기준선은 승인 시점에
  다시 pin하도록 했다. H00 exact candidate ratification, D19 negative/positive capture boundary,
  D20 schedule owner, D24 logical view target, D25 live coverage policy, D26 typed allowlist에 필요한
  owner 입력·안전 기본값·acceptance evidence를 한 표로 고정했다.
  (worker: codex_gpt-5)

### Revision `working` — outbound mail Outlook 가독성 프리셋

- `outbound_mail_authoring_v0`의 구조화 mode에 public-safe
  `owner_outlook_readability_v1` 프리셋을 추가했다. 요청·회신기한 선두 구역,
  연속 번호 표제, 맑은 고딕 본문/표제 규격, bullet·표 일관성, 빈 구역 생략을
  짧은 launcher 호출만으로 선택한다.
- authoring은 render plan과 handoff만 만들고 Outlook 초안 적용은 명시 승인된 별도
  executor로 분리했다. authoring의 Outlook mutation·발송 권한과 exact footer 저장
  권한은 추가하지 않았다.
- 요청, 기한, 번호 구역, bullet, 표, 빈 후속 구역 생략을 함께 검사하는 공개 합성
  fixture를 추가했다. (worker: codex_gpt-5)

### Project history envelope/coverage `canon_candidate`

- mail, voice, structured PC work, file, run-log의 source-local occurrence를
  project-independent identity와 exact typed refs로 표현하는 public synthetic event
  envelope 계약을 추가했다.
- event와 coverage receipt를 분리해 0건/실패/미수집/비적용 상태가 가짜 event를 만들지
  않게 했고, strict canonical JSON/SHA-256, classification, supersession collection,
  half-open `known_at` coverage와 deterministic ordered-event digest helper/test를 추가했다.
- owner ratification 전에는 `canon_candidate`이며 adapter/live use를 활성화하지 않는다.
  live completeness와 gap vocabulary는 D25 owner 경계를 유지한다. (worker: codex_gpt-5)

### 할일 엔진 맥락 기반 선행구조 교차검증 packet

- 맥미니에서 정의한 project payload/metadata, source-local 시간 이력,
  exact revision-bound RAG/Wiki 구조가 보존됐는지 고성능 PC가 독립 대조할 수 있도록
  public-safe CV-01~CV-09 packet을 추가했다.
- 고성능 PC 마스터플랜 프롬프트의 필수 read order와 acceptance에
  `history -> identity/time -> revision -> RAG/Wiki -> validated context -> task discovery ->
  TaskDriver -> ERP writer` dependency 검증을 연결했다. 교차검증은 read-only이며
  runtime 구현·migration·writer/alert 활성화 권한을 만들지 않는다. (worker: codex_gpt-5)

### `outlook_mail_reconcile` Codex launcher retired

- Retired the unused `.registry/skills/outlook_mail_reconcile/` launcher while
  preserving `.workflow/outlook_mail_reconcile_v0/` and its runtime implementation.
- Added the exact skill ID to `retired_codex_skills.json` so future full skill
  syncs prune the stale local mirror. The owner-only
  `soulforge-owner-outlook-mail` launcher remains active. (worker: codex_gpt-5)

### 5필드 차단형 훅 비활성화

- 운영 장애와 자동화 효용 재검토를 위해 tracked Codex 프로젝트 설정에서
  `five_field_session_capture_v0`의 `PostToolUse` 마킹 훅과 `Stop` 차단 훅을
  함께 제거하고, 재설치 스니펫도 실행 불가한 설명 상태로 전환했다.
- Claude Code를 포함한 모든 하네스에서 동일한 마킹/차단 쌍을 비활성 상태로
  유지하도록 워크플로 정본과 PC별 확인 절차를 갱신했다. 기존 레저,
  dev-ERP `completion_log` 캡처, 캡처 CLI, 훅 어댑터 스크립트와 일일 sweep은
  보존한다.
- 재활성화에는 현행 Codex/Claude Code 훅 스키마 및 설정 로드 검증,
  운영 장애·자동화 가치 재평가와 owner 결정이 필요하다. (worker: codex_gpt-5)

### Revision `working` - dev-ERP owner-approved core-only release gate

- Added a non-default `--core-only-release --require-live` audit path that
  requires the Codex worker to remain entirely unconfigured and live-attested
  as fail-closed, while retaining exact commit, clean Git, DB/schema, NAS,
  coherent backup/restore, snapshot, payload-owner, and live-health blockers.
- Added a dry-run-first mail-set reconciliation tool that preserves
  `real_meta.json` with a byte-exact backup and emits only a hash/count sidecar
  receipt. The audit recomputes the DB/source ID-set hashes and rejects stale or
  tampered metadata without logging mail IDs, subjects, or bodies.
- Added focused reconciliation, tamper, and core-only live-boundary tests and
  synchronized the runtime README/operating contract. (worker: codex_gpt-5)
- Kept pre-open file identity checks strict while allowing only post-read inode
  drift on OS-confirmed Windows network drives. This preserves realpath,
  size/mtime, content-hash, manifest, and commit-marker verification while
  avoiding false `source_file_retargeted` failures from mapped NAS providers;
  restore errors now retain a fixed redacted stage code. (worker: codex_gpt-5)
- Replaced the impossible post-restart coherent-backup mtime condition with a
  bounded logical-current proof: a stale-mtime generation is accepted only
  when its restored manifest matches every live externalized message pointer,
  attachments are empty, and a newer live DB backup has a valid manifest plus
  matching restore-test evidence. Any pointer, attachment, DB-backup, or
  restore-evidence drift remains a blocker. (worker: codex_gpt-5)

### dev-ERP runtime source attestation 고정

- 부하가 큰 Windows 운영 호스트에서도 정식 백엔드가 시작 지연 없이 실행 커밋을 증명하도록 엄격한 40자리 `DEV_ERP_SOURCE_COMMIT` 바인딩을 추가하고, 미지정 실행은 기존 Git 조회로 보수적으로 폴백한다. (worker: codex_gpt-5)

### 팀 문서 DOCX/XLSX/HTML publisher와 얇은 Codex launcher

- `document_artifact_publisher_v0`를 owner-requested non-default candidate로
  등록했다. 승인된 strict content packet 하나와 공유 design-token contract
  하나를 입력으로 받아 DOCX, XLSX, HTML을 각각 native adapter로 만들며, 한
  형식을 다른 형식의 중간 원본으로 변환하지 않는다.
- portable packet schema, design tokens, 합성 fixture, dependency-free Node
  validator를 추가했다. validator는 ID/근거 참조, metric 판정, table 자료형,
  정보 순서, raw HTML, portable `_workspaces` 경계와 PPT 제외를 검사하고,
  PPT·broken ref·absolute output pointer negative fixture를 거부한다.
- `$soulforge-document-artifact-publisher` 얇은 launcher를 추가했다. launcher는
  `report_authoring_v0`의 작성·final polish·fact/voice authority를 복제하지 않고,
  XLSX는 installed Spreadsheets + loader-provided `@oai/artifact-tool`만 기본
  authoring 경로로 허용한다.
- DOCX/HTML 합성 adapter receipt는 통과했다. XLSX는 semantic/formula/round-trip/
  all-sheet visual 검사는 통과했지만 독립 검증에서 OOXML `pageSetup`과
  `Print_Area` 누락이 발견되어 `blocked_print_configuration`이다. fresh
  end-to-end replay, Microsoft Word/Excel owner-sample round-trip, 실제 보고서 3건과 owner acceptance 전에는
  default route, team-default, production-ready를 주장하지 않는다. PPT 생성은
  이번 문서 시스템 범위에서 중단 상태다. (worker: codex_gpt-5)
- The final fresh compact Korean `full_authoring` acceptance run passed all six
  fixed stage validators and an independent semantic/reader review with zero
  unresolved differences. It preserved 7/7 protected invariants, rendered only
  the three material roles in both Markdown and HTML, exposed zero opaque source
  pointers or audit scaffolding, kept `report_document_json` on the audit surface,
  completed authority/finalize, adopted a metadata-only receipt, and replayed
  exactly. The workflow remains candidate, default-off, private-work-product, and
  subject to owner review before publish or production use. (worker: codex_gpt-5)
- A succeeding fixed run exposed a reader-projection defect: Markdown/HTML appended
  the unconfirmed register after the same unknown and action already appeared in the
  body. The register now stays audit-only, and compact internal progress HTML omits
  duplicate verdict cards and action tables. (worker: codex_gpt-5)
- The final fixed-run pilot then exposed a stale handler assumption that still
  treated compact-progress `status_summary` as a derived summary. The handler now
  keeps that role in verified body projection and permits summary omission only for
  the exact three-role `internal_review` progress form, with an end-to-end success
  regression. (worker: codex_gpt-5)
- Controller review rejected a semantic-verifier pass whose body protected an
  unconfirmed cause while leaving the unresolved-item register empty. The fixed
  document validator now requires every protected `unconfirmed` invariant to have
  a same-ID `unconfirmed_items` entry with decision impact and close condition, so
  a verifier cannot accidentally waive closure traceability. (worker: codex_gpt-5)
- Fresh independent evaluation rejected a short internal progress report that
  repeated its inspection fact solely to satisfy separate status and scope roles.
  The runtime now treats `status_summary` as source-owned body content and permits
  the compact `status / issues / next actions` matrix for `internal_review` progress
  reports; higher-stakes audiences retain the extended five-role matrix. This
  removes forced filler without weakening fact, condition, modality, or unresolved-
  cause preservation. (worker: codex_gpt-5)
- `report_authoring_v0` completed a real Korean `final_polish` pilot through the
  fixed prepare/validate/authority/finalize path. The run adopted a metadata-only
  receipt, replayed exactly, preserved 37/37 semantic invariants and 22 lexical
  items, and kept the result at `private_work_product` / `observed` / `partial`.
  The candidate/default-off and human-owner-review boundaries remain unchanged.
  (worker: codex_gpt-5)
- Fresh installed-skill evaluation exposed two candidate defects and both were
  corrected: valid hyphenated unconfirmed item IDs now survive the result contract,
  and short reports use minimum type roles plus material optional roles instead of
  forcing repeated placeholder sections. Launcher examples now make absolute CLI
  paths, clean authority skeletons, and RFC 3339 UTC timestamps explicit.
  (worker: codex_gpt-5)

### report_authoring_v0 fixed runner·editorial contract 정렬

- `report_authoring_v0`의 runtime-critical 행동을 workflow-owned editorial/reference
  계약으로 모으고, draft 하나만 받는 `final_polish`, material gap만 한 번에 한 질문씩
  묻는 `full_authoring`, 타입별 adaptive role, 검증된 body에서 파생하는 summary/BLUF,
  technical-content/evidence-logic/final-polish 분리, reader/audit projection 분리를 문서화했다.
  문체 gate는 단어 목록이나 AI detector가 아니라 기능·근거·의미 보존으로 판단한다.
- `report_writer`를 고정 runner의 `prepare -> fresh executor outputs -> separate fresh
  semantic verifier -> finalize`만 연결하는 thin Codex launcher로 줄였다. Node runner는
  모델을 호출하거나 보고서를 작성하지 않으며 ERP는 skill이 아니라 workflow/runner를
  직접 호출한다.
- report/source/stage body와 생성 artifact는 `_workspaces` 또는 owner-approved
  worksite에 두고 `_workmeta`에는 metadata-only receipt만 남기도록 format/storage
  충돌을 해소했다. default route, approval, publish/send, project-share writeback은
  계속 꺼져 있다. root에 fixed runner 호출·검증 npm surface를 추가했다.
  (worker: codex_gpt-5)
- v0 보존 범위를 실제 구현에 맞춰 축소했다. 보호 anchor와 수치·단위·인용 표면은
  정확히 유지하며 단위 변환·인용 번호 변경·보호 내용 이동은 거부한다. 날짜 근거가
  없으면 `report_date: null`로 두고 독자용 날짜 행을 생략한다. 최종 문서의
  project/type/audience를 요청에 묶고, 분류 authority가 없는 v0는
  `private_work_product`, 초안 단독 정리는 `observed` 및 `partial|unconfirmed`로
  제한한다. 로컬 identity claim은 실제 process 증명이 아닌
  `local_context_separation_declared`로 정정하고 post-commit journal 복구 회귀를
  추가했다. (worker: codex_gpt-5)
### `mail_to_task_classify` 수동 Codex 스킬 폐기

- dev-ERP의 메일→할일 판단은 현재 `auto_intake_cycle.mjs`와
  `src/llm.mjs#classifyMailForTasks`가 직접 소유하므로, 중복된 수동 Codex 스킬
  `.registry/skills/mail_to_task_classify/`와 로컬 설치 대상을 폐기했다.
- 자동 인입 기능과 결정적 `mail_to_task_ledger.mjs`는 유지하고, 실행 기록의 생성 규칙
  참조를 실제 런타임 소유자인 `auto_intake_cycle`로 맞췄다. 운영 문서에서도 제거된
  스킬과 분류 계약 경로를 현재 자동 인입 경로로 교체했다.
- `retired_codex_skills.json`에 폐기 ID를 등록하고 `skills:sync -- --all` 및
  `--prune-retired`가 그 정확한 로컬 설치 대상만 제거하도록 해 다른 PC의 잔존 설치본도
  정리할 수 있게 했다. (worker: codex_gpt-5)
### 장기 스레드 인계의 fresh-worker·writer 안전 계약 정합화

- `long_thread_handoff`를 명시적 phase-transition opt-in으로 고정하고, 현행 Codex의
  fresh context 예시는 `fork_turns="none"`으로 맞췄다. 모델·reasoning 선택자가 없는
  런타임에서는 관찰하지 못한 프로필이나 downgrade를 주장하지 않고
  `unselectable`/`unknown`으로 보고한다.
- manager/controller의 통합 소유권, 필요한 역할만 의존 순서로 실행하는 lane 정책,
  구현 안정화 뒤 검증, HEAD/index lock/dirty ownership/외부 편집/write overlap 사전
  점검과 writer surface별 단일 writer 원칙을 명시했다.
- `NIGHT_WORK_HANDOFF`는 owner-approved exact path/reference가 확인될 때만 만들며,
  Telegram은 현재 요청 또는 적용 가능한 standing authorization이 있을 때만 전송
  시점 승인 범위와 mechanism을 확인하도록 제한했다. (worker: codex_gpt-5)

- dev-ERP에 Soulforge 공용 workflow runner를 호출하는 보고서 작업 셸을 추가했다.
  ERP는 보고서 본문을 재작성하지 않고 고정된 request/outcome/result/receipt를
  검증·저장하며, 성공·차단·실패·중단 상태를 같은 digest chain으로 수렴시킨다.
  서비스 재시작 시 남은 running 작업은 자동 재작성하지 않고 명시적 interrupted
  또는 manual-review 상태로 복구한다. 실제 core probe, receipt sink, single-writer,
  deployment identity가 확인되기 전 production route는 기본 비활성 상태다.
  (worker: codex_gpt-5)

### TaskDriver closed-loop 설계와 고성능 PC cold-start packet

- dev-ERP task truth target을 기존 `core_item` current state와 append-only `event_log`로
  유지하면서, 할일/전이의 `왜`와 `왜 지금`을 exact refs로 기록하는 TaskDriver owner
  contract와 10장짜리 public-safe redesign package, ENGINE-13 packet을 추가했다.
- 판단/적용 상태와 작업 상태를 분리하고 현행 ERP status를 보수적으로 crosswalk했다.
  LLM은 후보만 만들며 completion은 후속 Driver 후보를 조용히 auto-open하지 않는다.
- project RAG target을 `_workspaces/<project_code>/reference_payloads/rag/**`, common-only
  RAG를 `_workspaces/knowledge/rag/**`로 고정했다. 현행 common-root project index는
  high-performance PC의 inventory/dry-run/one-project pilot을 거치는 legacy migration
  input이며 current 지원 완료나 production-ready를 주장하지 않는다.
- Mac mini voice/watchdog와 high-performance engine의 목표 역할, immutable node packet,
  sole reconciler, state-change/cooldown/recovery alert candidate와 activation gate를 문서화했다.
  runtime code, 실제 project payload, private binding은 변경하거나 읽지 않았다.
  (worker: codex_gpt-5)

### dev-ERP 권한·도메인 4xx의 로컬 폴백 복구

- 일반 팀원 화면의 알림·홈 위젯·제안 페이지·게이트가 관리자 전용 `/api/proposals`를
  호출하지 않고 기존 빈 큐 상태를 표시하도록 했다. 클라이언트 권한 정보가 오래된 관리자도
  서버의 `403 admin_only`를 로컬 빈 상태로 처리한다.
- 위키 본문, 두 줄기 그래프 소비자, 가지 이야기, 생명수, 메일 상세, 부품 완성도,
  Codex capabilities/thread가 서버가 실제 반환하는 도메인 `400/403/404`만 호출부별로
  허용하고 기존 빈 화면·미리보기·fallback UI를 사용하게 했다. 이 GET 라우트들에는 현재
  `409` 응답 계약이 없어 허용하지 않았으며, 미등록 4xx·401·5xx·잘못된 JSON·네트워크·
  timeout은 계속 전역 fail-closed로 처리한다. 부품 목록에서 사라진 보드 선택값도 현재
  목록의 첫 보드로만 교정한다. (worker: codex_gpt-5)

### dev-ERP current-user Task Scheduler foreground guard

- Windows launcher에 `-Foreground`와 explicit `-DatabasePath`를 추가해 기존 loopback,
  environment scrub, `--no-real-meta`, `--no-fixture`, listener/process attestation을 유지하면서
  Node 종료까지 wrapper가 살아 있고 Node exit status를 그대로 반환하도록 했다.
- audit-only가 기본인 tracked registration helper를 추가했다. 같은 DB의 enabled action과
  해석 불가능한 enabled dev-ERP backend action(미해결 작업 디렉터리 환경변수 포함)을
  fail-closed하고, 기존 target overwrite는
  exact disabled same-DB handoff에서만 허용한다. 실제 등록은 `SupportsShouldProcess`/
  `-WhatIf` 뒤 현재 사용자 `AtLogOn`/`Interactive`/`Limited`로만 수행하며 credential,
  pre-login service, 다른 task/process/DB mutation은 만들지 않는다.
- 합성 alternate-port Node process와 mocked Scheduler inventory로 foreground lifetime/exit
  propagation, collision/unresolved refusal, audit/WhatIf no-mutation, handoff, principal 경계를
  고정하고 LAN/maintenance/operating 문서를 동기화했다. (worker: codex_gpt-5)

### 스킬 패키지 예측 가능성·forward evaluation 게이트

- `author_skill_package`에 trigger branch, 판정 가능한 완료조건, 정보 계층/단일 정본,
  문장 단위 pruning을 묶은 공통 품질 rubric을 추가했다. 외부 저자의 Claude 전용 호출
  문법은 가져오지 않고 공식 원문에서 Codex와 Soulforge에 맞는 일반 원칙만 채택했다.
- smoke 뒤 release review 전에 기존 `workflow_generator`의 `single_skill_build` 또는
  `single_skill_modify`로 위임하는 forward-evaluation 단계를 추가했다. 구조검증, 안전한
  script check, 정상 trigger, 인접 non-trigger, 현실적 실행, fresh B와 separate V 근거가
  없으면 보수적인 completion label을 유지한다. 새 skill-maker authority는 만들지 않았다.
  (worker: codex_gpt-5)
### 발표자료 퍼블리셔와 `team_default_v0` template seed

- 승인된 presentation packet/storyline만 hash-pinned 템플릿에 배치하는
  `.workflow/presentation_artifact_render_v0/`를 non-default candidate로 등록하고,
  내용 작성·요약·사실 판정과 렌더링 책임을 분리했다.
- `$soulforge-presentation-publisher` 얇은 Codex 런처를 추가했다. 런처는 workflow를
  읽고 실행할 뿐 템플릿 규칙이나 발표 내용을 복제하지 않는다.
- `SOULFORGE_ARTIFACT_TEMPLATE_SYSTEM_V0.md`와 합성 preservation fixture를 추가해
  template family/revision/SHA-256, `_workspaces` payload, `_workmeta` metadata-only
  receipt 경계를 고정했다.
- owner-controlled `_workspaces/SE_TEMPLATE_LIBRARY/team_default_v0/`에 외부 자산을
  복제하지 않은 editable PPTX 10장 파일럿을 만들었다. artifact-tool의 native
  master/layout export 한계 때문에 revision `0.1.0`은 exemplar-slide 방식이며,
  owner 실제 보고서 3건 승인 전에는 default route로 승격하지 않는다.
  (worker: codex_gpt-5)
- 첫 fresh synthetic replay는 `do_not_claim` 부정 의미가 긍정 badge처럼 표시되고
  list text에 literal bullet이 추가된 사실 보존 실패를 별도 verifier가 검출해
  `pilot_executed: false`로 유지했다. workflow revision/package provenance,
  executor self-check, independent verification, retryability를 정식 스키마로 추가하고
  corrected-contract replay를 승격 전 필수로 고정했다. (worker: codex_gpt-5)
- corrected immutable package `2bbd8188`에서 fresh executor와 별도 fresh verifier가
  단일 합성 fixture를 통과했다. 10장 editable PPTX, 네이티브 표 2개·차트 1개,
  literal bullet 0/native bullet 6, semantic negation, 전 장 시각·bounds 검사와
  metadata-only 최종 receipt를 확인해 workflow를 `pilot-executed`로 표시하되,
  owner 실제 보고서 3건과 brand/print 승인 전까지 `default_route_safe: false`를
  유지한다. (worker: codex_gpt-5)

### 팀원 개인 Codex용 dev-ERP MCP 파일럿

- 팀원별 개인 Codex가 자기 ERP 계정으로 오늘·내일 일정, 업무 맥락, 제한된 메일
  목록/본문, 완성 artifact를 조회할 수 있는 별도 Streamable HTTP MCP sidecar를 추가했다.
  sidecar는 LLM을 호출하거나 ERP SQLite를 직접 열지 않으며, 계정별 256-bit bearer의
  SHA-256 hash만 ERP에 저장한다.
- 구조화된 작업 결과를 멱등 게시하고 팀원이 ERP에서 완료를 누를 때 기존 completion
  hook이 완료 로그와 pending digest에 합치도록 했다. MCP가 메일을 보내거나 업무 상태를
  자동 완료하지는 않는다.
- 개인 PC의 완성 파일은 MCP JSON/base64가 아니라 10분짜리 1회용 URL의 raw PUT로
  수령한다. filename/확장자/25 MiB/size/SHA-256/replay를 검증해 service-owned
  `_workspaces/system/dev-erp/mcp-artifacts`에 배타 저장하고 외부 응답에는 opaque ref만
  반환한다. 평문 non-loopback public URL은 기본 거부하며 실제 LAN 개방은 HTTPS,
  서비스 운영, 백업·보존·악성파일 검사 gate 뒤로 남겼다. 합성 MCP SDK client와 실제
  dev-ERP 완료 훅 통합 테스트를 추가했다. (worker: codex_gpt-5)

### dev-ERP 빈 줄기 화면의 서버 장애 오인 수정

- 과제에 아직 `project_context` 줄기 데이터가 없을 때 `/api/context/graph`의 예상 가능한
  `context_not_found` 응답을 해당 탭의 빈 상태로 처리하도록 했다. 이 경우 전역 연결 배너가
  HTTP 400 서버 장애로 바뀌거나 다른 입력·버튼이 잠기지 않으며, 실제 인증 만료·5xx·네트워크
  실패에 대한 기존 fail-closed 동작은 유지한다. (worker: codex_gpt-5)
### RAG 선택 근거 사용이력과 저사용·고중요 보호 계약

- 저장되는 metadata RAG 및 source-text RAG 답변 실행이 선택한 근거를 월별
  metadata-only knowledge-access JSONL에 `retrieve`로 자동 기록하도록 첫 수직 경로를
  연결했다. opaque unit/chunk ID, index/run/rank, project/gate/branch/task, output ref만
  남기며 raw 질문·원문·chunk body는 원장에 복사하지 않는다. `retrieve`와 실제
  `cite`/`apply`를 분리하고 rollup에 검색, exact apply, substantive use와 과제 맥락별
  집계를 추가했다. 자동 RAG writer는 전체 batch를 먼저 검증한 뒤 PC별 opaque monthly
  shard에 한 번만 append한다.
- event identity와 logical dedupe에서 물리 ledger/shard 위치를 분리하고, 과제 코드와
  in-repo 원장 owner가 다르면 기록 전에 차단한다. logical dedupe key는 event 내용에서
  재계산해 forged key가 실제 사용을 숨기지 못하게 했다. 저장 답변은 원자적으로 선점한
  실행별 불변 경로와 output revision hash를 쓰며, 과제별 `_workmeta`에 답변 전 pending
  receipt→append·read-back 검증 후 recorded 절차를 둔다. 명시적 reconciliation은 복구를
  수행한 PC의 별도 shard를 쓰고 partial JSONL tail을 유효 사건으로 오인하지 않는다.
  shared workspace 답변의 선점은 project code와 무관한 output-global coordination
  surface에 두고, read-back은 logical event뿐 아니라 실제 ledger provenance도 확인한다.
- operation board의 지식 lane이 직속 파일 수가 아니라 재귀 canonical JSONL 유효 행을
  집계하고 stable event ID를 중복 제거하며 최근 접근 시각, 검색·exact apply·substantive
  use·유용 이벤트 수와 무효/중복/읽기 실패 coverage를 표시하도록 보강했다. 일반
  file/editor/Wiki read는 아직 writer adapter가 없으면 관측되지 않는 경계를 유지한다.
  shape-valid 행도 secret/runtime-path 안전 검사를 다시 통과해야 집계하며, 새 evidence
  count는 nonnegative safe integer/boolean 형식을 검증한다.
- 전체 시간축·지식축 계약에 작은 SE 중심 맥락, catalog-filtered RAG, 얇은 Wiki,
  on-demand tool의 역할과 토큰 경계를 고정했다. 저사용만으로 폐기하지 않고 authority,
  applicability, dependency, uniqueness, lifecycle/conflict, access coverage를 함께 보며,
  중요·저사용은 `cold_essential`, 적용 대상 무검색은 검색 coverage 점검 후보로 둔다.
  계산기는 반복성·재현성·감사 필요가 확인될 때만 별도 도구로 강화한다.
  로드맵 동기화 후 boot digest source manifest를 재검토·재서명했다.
  (worker: codex_gpt-5)

### dev-ERP 레거시 Codex 전환 보호

- 기존 v1 release backup을 유지하면서 complete externalized message와 pure legacy
  inline message가 섞인 DB를 위한 명시적 v2 pre-migration backup/restore 경로를
  추가했다. v2 manifest는 legacy body 대신 bounded metadata만 기록하고 partial/hybrid
  상태를 거부하며, release audit는 v2를 release evidence로 인정하지 않는다.
- `--plan-retire-all`은 incomplete binding만 metadata-only retire candidate로 만들고
  complete binding은 제외한다. owner-confirmed count와 선택적 candidate SHA-256 drift
  pin을 요구하며, 출력은 owner mapping이나 apply 권한을 만들지 않는다.
- incomplete binding의 valid-but-stale project mismatch는 candidate v2에서 current
  item project 기준 retirement의 관찰값, 상태, 합계로 명시하고 실제 stale value까지
  candidate hash에 포함한다. invalid project와 실제 mapping/apply conflict는 계속
  fail-closed하며, 다른 runtime binding 필드가 완전한 project-only mismatch도 후보로
  낮추지 않는다.
- migration 중 같은 프로세스에서 포착된 실패는 DB rollback 뒤 해당 실행이 만든
  payload만 정리한다. cleanup이 끝나지 않으면 path/body를 노출하지 않는 blocker를
  남기며 crash recovery까지 주장하지 않는다.
- message payload ref의 12자 base64url item tag를 `_` delimiter로 분해하지 않고
  `cmp_` 직후 고정폭으로 읽게 했다. `_`·`-` tag의 조회·교차 item 차단·same-process
  cleanup과 합성 adversarial item을 사용한 migration rollback 회귀 테스트를 추가했다.
  이전 실행의 `payload_cleanup_failed` orphan은 새 process가 소급 소유하지 않으므로
  검증된 v2 DB+payload 경계 복구 없이 수동 삭제하거나 재시도하지 않는다.
- backup CLI는 command별 flag allowlist를 적용하고, 알 수 없는 첫 command token을
  출력하지 않은 채 고정 `kind: "invalid"`로 반환한다. (worker: codex_gpt-5)

### dev-ERP loopback 공존 LAN HTTPS proxy

- 외부 controller가 `127.0.0.1:4300` backend를 복구하는 Windows 환경에서 backend를
  강제 교체하거나 같은 DB를 여는 두 번째 ERP process를 띄우지 않고, exact LAN IP의 같은
  포트에만 TLS를 종단하는 zero-dependency proxy를 추가했다.
- proxy는 upstream을 loopback으로 고정하고 wildcard listen, spoofed forwarding,
  hop-by-hop 전달을 차단한다. 응답 cookie에는 `Secure`를 강제하고 public CA 배포와
  sanitized 502/504만 제공하며 TLS 경로와 업무 payload는 기록하지 않는다. 합성 동적 포트
  테스트로 option fail-closed, header/cookie, body/status, CA, failure/timeout 경계를 고정했다.
  (worker: codex_gpt-5)
### 폴더 메타데이터 목록화용 Codex 보조 에이전트

- `.codex/agents/`에 단일 폴더, 메타데이터 전용, read-only 범위로 동작하는 `folder_inventory` 설정과 부모 에이전트 인계 규칙을 추가했다. 활성 Codex 모델 카탈로그에서 `gpt-5.6-luna` 가용성을 먼저 확인하고, 대상 폴더만 실행별 추가 루트로 지정하며, 파일 본문·secret·해시·OCR·텍스트 추출과 원본 변경을 금지한다. (worker: codex_gpt-5.6)

### Owner Outlook 메일의 AI 재수집 가능 업무 구조 보강

- 업무 요청 메일의 공통 표시 필드를 `수신/사유/목적/요청 업무/회신기한/완료·회신 기준`으로 정리하고, 변경 전후·적용 방안·적용 대상품·검토 사안·참여 부서·첨부·비고는 근거가 있을 때만 붙이는 조건부 블록으로 분리했다.
- 관련 기술값이 세 개 이상이면 조건표 하나, 복수 담당자이면 담당자·선행조건·요청 업무·완료 기준표 하나를 사용한다. 의존성이 표에 이미 드러나면 중복 `처리 순서`는 생략한다.
- action brief 선택기와 검증 fixture가 단일 담당자 업무에서도 수신·사유·목적·요청 업무·완료 기준을 본문에 노출하도록 조정했다. 개인 메일 원문, 실제 주소, 비공개 값은 public 규칙에 포함하지 않았다 (worker: codex_gpt-5.6).

### 프로젝트 시간축과 지식 근거축의 공통 ID 계약

- 메일·음성·SE 일정·사람/AI 작업·파일 개정으로 만든 프로젝트 시간축과,
  가이드북 원본·RAG·LLM Wiki·주장·규칙·정본 지식을
  `source_revision_id` 중심으로 잇는 temporal knowledge ontology 계약을 추가했다.
  `정본 RAG`는 두지 않고 정본 출처/정본 지식과 재생성 가능한 RAG/Wiki/view를
  분리했으며, one-entity/one-ID + typed relation ref, `valid_at + known_at` bitemporal 조회,
  cross-PC location/observation 경계를 고정했다.
- source revision과 project knowledge application의 public-safe template을 추가하고,
  ontology entity/relation matrix, RAG 3단계, architecture index, roadmap을 동기화했다.
  방사청 시험평가 가이드북 등록 항목에는 공개 PDF 발행 label과 full hash에 묶인 첫
  exact source revision ID를 추가했다. 기존 SE task/rule의 coarse source 표기는 exact
  page/chunk crosswalk가 생기기 전까지 migration gate로 유지한다.
- optional registry `source_identity`의 필수 ID/발행 label/full SHA-256/identity basis/
  lineage ref와 기존 PDF hash 일치를 canon validator 및 회귀 테스트로 고정했다.
  (worker: codex_gpt-5)

### 맥미니 음성 처리 주노드와 AI 임시 확정 운영 방향

- PLAUD 단독 정본 수집기 채택은 기존 5~10회 파일럿으로 유지하면서, 24시간
  맥미니를 원음 회수·독립 전사·보관함·후속 분석 queue의 단일 operational-primary로
  분리 지정했다.
- 원음/전사 payload는 owner-approved shared worksite의
  `_workspaces/system/voice_capture/**`, 프로젝트별 업무 metadata는
  `_workmeta/<project_code>/**`, 공통 실행 연속성은 `private-state/guild_hall/state/**`,
  코드·계약·테스트는 public Git에 저장하는 PC 간 경계를 고정했다.
- 후속 목표를 녹음 종류·회의/주제 구간·화자 후보·프로젝트·담당자·할일·기한
  분석에서 `AI 임시 확정 -> 재검증 -> 예외 검토`까지 이어지도록 승인했다. 현재
  사람 승인 상태를 가장하거나 외부 발송·구매·공식 승인·기술 truth를 자동 실행하지
  않으며, 자동 resolver는 별도 schema/validator와 dev-worker 작업으로 구현한다.
  (worker: codex_gpt-5)

### Codex pet cross-PC opt-in 배포

- `.registry/docs/operations/codex_pets/`의 public-safe v2 pet package를 각 PC의
  `${CODEX_HOME:-$HOME/.codex}/pets/`로 명시적으로 sync, SHA-256 verify, remove하는
  표준 Node CLI와 npm command를 추가했다. source/target은 안전한 pet ID와 정확한
  두 파일로 제한하며, staged rollback-safe replacement와 반복 no-op을 사용한다. 다른 ID,
  예상 밖 파일, 심볼릭 링크가 있는 target은 덮어쓰거나 삭제하지 않는다.
- macOS/Linux와 Windows PowerShell 명령을 문서화하고 pet update는 opt-in으로
  유지했다. 일반 bootstrap, doctor, skill sync는 pet을 자동 설치하지 않는다.
  fresh/repeat sync, tamper detection, manifest/path validation, removal safety,
  공백 포함 `CODEX_HOME`을 합성 `node:test`로 고정했다. (worker: codex_gpt-5)
- 최신 roadmap 변경을 검토한 뒤 boot digest source manifest를 canonical guard로
  재서명해 root `validate`와 `done:check`의 drift gate를 복구했다.

### macOS 24시간 interval LaunchAgent 정체 방지

- GUI launchd domain이 `on-demand-only`로 전환된 뒤 `StartInterval` 작업이
  loaded 상태에서도 실행되지 않던 운영 실패를 막기 위해, interval job plist를
  `RunAtLoad + KeepAlive` 단일 loop가 기존 one-shot 명령을 순차 호출하는 형태로
  변경했다. 앞 실행이 끝난 뒤에만 다음 간격을 기다리므로 중복 실행은 만들지
  않으며, 실패는 stderr에 남기고 다음 주기에 재시도한다.
- mail-fetch 설치 plist에 PLAUD 메일 trigger 활성화를 명시적으로 포함하고,
  loaded 여부만 아니라 실제 `running` 상태를 확인하도록 운영 문서를 맞췄다.
  mail-fetch와 healthcheck 반복 로그는 전체 JSON 대신 bounded summary만 남기며,
  PLAUD/독립전사 queue watcher도 `WatchPaths` spawn 대기 대신 비어 있을 때 provider를
  조회하지 않는 5분 persistent local-queue loop로 바꿨다. retry 간격 검증, 작업 루트
  진입 실패 시 즉시 종료, 정상·빈 queue 출력 억제와 bounded 실패 상태 로그를 함께
  적용했다. 이미 완료된 전사의 queue가 남거나 재시작 중 analysis 상태만 덮인 경우에는
  session 완료본을 복구해 음성을 재처리하지 않고 알림과 delivery를 재개한다. calendar
  job의 기존 schedule은 유지한다. 완료본과 chunk를 재사용할 때는 음원 해시, 실행 ID,
  엔진과 모델 ID·해시가 모두 현재 계획과 일치해야 하며, 하나라도 달라지면 이전 chunk를
  버리고 새로 전사한다. (worker: codex_gpt-5)

### dev-ERP Windows background launcher split TLS 경로 지원

- hardened background launcher에 paired `-TlsCertPath`/`-TlsKeyPath`와 optional
  `-TlsCaPath`를 추가해 인증서와 private key가 서로 다른 runtime 위치에 있어도 exact
  server argv로 direct LAN HTTPS를 지속할 수 있게 했다. 파일 존재만 확인하고 key 내용을
  읽지 않으며, CA-only 입력은 거부한다. dry-run과 시작 결과의 `tls=explicit`은 cert/key
  pair가 명시됐다는 뜻이고, 경로 대신 `tls=explicit|auto`만 표시한다.
- 대체 동적 포트와 합성 dummy 파일로 split-path argv 전달, unpaired fail-closed, 경로
  비노출을 고정하고, LAN 배포/유지보수 문서에 direct HTTPS 예시와 Task Scheduler
  persistence/실행계정 ACL 지침을 추가했다. (worker: codex_gpt-5)

### dev-ERP Windows background launcher fail-closed 기본값

- 기존 background launcher의 무조건 port-owner 종료와 LAN/메일/LLM/자동 인입/
  autosync/아침 브리핑 일괄 활성화를 제거했다. 기본 기동은 loopback, stub chat,
  real-meta/fixture off, 외부 통합 off이며 Codex는 미구성 worker mode로 고정해
  in-process 실행으로 폴백하지 않는다. LAN, 로컬 LLM, 메일 수집, 자동 인입,
  autosync, morning brief, dedicated worker는 각각 명시적 opt-in 인자를 요구한다.
- port 충돌은 실행 파일, 절대 runtime `server.mjs`, 전체 command line이 모두
  일치하는 기존 인스턴스만 교체한다. 미식별·조회 불가·다른 checkout listener는
  그대로 두고 시작을 차단한다. listener 조회 실패도 empty로 오인하지 않는다.
  inherited integration/security/Codex/credential-like env는 선제 제거하고 명시적
  opt-in만 복원한다. 시작 뒤에는 retained process handle의 PID, sole-listener,
  실행 파일, 전체 argv를 다시 검증하며 실패 시 그 handle만 정리한다.
  side-effect-free dry-run과 보호된 4300을 제외한 대체 포트 합성 테스트로 기본
  posture, unknown-owner 생존, changed/extra argv 거부, env 격리, actual bind와
  post-start attestation을 검증한다. Tailscale launcher 절차는 `-SecureCookie`를
  명시해 server의 `--secure-cookie`로 전달한다.
  (worker: codex_gpt-5)

### dev-ERP 동기화 멱등성·서버 장애 복구 UI

- 할일 장부의 동일 conflict/error 상태는 DB `sync_at`과 CSV를 반복 갱신하지
  않도록 안정 지문으로 멱등화했다. autosync polling의 `seen`은 처리 성공과
  자체 write-through 이후 mtime으로만 전진해, 실패는 재시도하고 실제 원본
  변경은 한 번 다시 처리한다.
- 공통 API 요청에 15초 timeout, 401/HTTP/network 분류, `no-store`를 적용하고
  cold-start 및 실행 중 서버 단절에서 복구 안내와 재연결을 제공한다. 연결이
  확인되지 않은 동안 변경 요청과 입력 컨트롤은 fail-closed하며, 복구 후 현재
  화면을 그대로 다시 그린다. 연결 상태나 API payload는 새로 저장하지 않는다.
  (worker: codex_gpt-5)
### dev-ERP 단일-body Codex turn projection v4

- Soulforge `_workspaces`를 프로젝트의 유일한 논리 본체로 고정하고 ERP runtime은
  껍데기/read model, worker 저장소는 재생성 가능한 static cwd와 single-active
  turn projection, NAS는 backup/restore 전용으로 교정했다. runtime `DATA/`는
  보조 runtime-local 파일만 허용하며 프로젝트나 Codex payload owner가 될 수 없다.
- 대화·첨부 영구 owner를 `_workspaces/system/dev-erp`의 정확한 두 하위 root로
  제한하고 정상 `system` junction의 실제 filesystem identity를 revision에 고정했다.
  임의 owner/세 번째 root/child junction escape와 junction retarget을 fail-closed한다.
- ERP가 후속 메시지의 선택 첨부만 hash-bound immutable projection으로 복사하고,
  원본 경로 없는 descriptor만 dedicated worker v6에 전달하도록 바꿨다. projection은
  전체에서 한 번에 하나만 존재하고 stale/tampered/sibling entry를 거부하며 turn 종료
  뒤 재검증 삭제한다. worker는 canonical payload root를 stat/read하지 않고 projected
  file만 Codex input에 넣으며 첫 production slice의 write grant를 거부한다.
- 고성능 Windows PC에서 기본 `node:test` 파일 동시성이 `whoami`·root-isolation·test
  server child를 포화시키지 않도록 dev-ERP 전체 test 동시성을 4로 고정하고, 같은
  프로세스에서 성공한 Windows name+SID 증거만 process lifetime 동안 재사용한다.
  production attestation·expected identity 비교·실패 결과의 fail-closed 처리는 바꾸지 않았다.
- permission probe와 live attestation을 v4 projection/source/deny-root 계약으로 올렸다.
  worker가 서명한 pathless `payload_deny_binding_revision`은 ERP가 정확한 canonical
  attachment/message lexical root 두 개로 독립 계산한 기대 revision과 일치해야 하며,
  형식만 맞거나 다른 root를 결박한 서명값은 release audit에서 차단한다. 이 계산은
  payload root를 stat/read하지 않는다.
  현재 Codex 0.144.1 native Windows 실측에서는 shell subprocess가 source 첨부를 읽어
  probe가 실패하므로 worker 기동과 release는 코드에서 차단되고 ERP 재가동은 운영
  절차상 계속 보류한다. 기존 ERP launcher 자체의 worker-first 강제 gate는 아직
  activation blocker다. GPT-5.6은
  worker account의 live `model/list`에 광고된 slug만 UI와 turn 선택에 사용한다.
  (worker: codex_gpt-5)

### Shield Wall 호출 기준과 검토 종료선 정렬

- `soulforge-shield-wall` Codex bridge의 암시 호출 조건을 정본의 높은 불확실성,
  경계 위반 국소화 중, 안전하지 않은 다음 변경 경로에 맞추고, 이미 명확하고
  저위험한 수정이나 미해결 경계가 없는 일반 검토·편집은 제외했다.
- 한 번의 실행을 활성 경계 질문 하나와 이를 해소하는 최소 증거로 제한하고,
  경계 또는 blocker가 명확해지면 일반 scoped action으로 돌아가도록 종료선을
  고정했다. `charge_breaker` 전환은 blocker와 다음 직접 변경이 모두 명확할 때만
  허용하며 model/MCP/tool runtime owner는 바꾸지 않았다. (worker: codex_gpt-5)

### dev-ERP runtime DATA 최소 저장·백업 경계

- 운영 checkout 최상위에 Git 제외 `DATA/` 보조 파일 영역을 허용하고, 기존 DB·
  복구검증·Codex payload·workspace·workmeta·release 백업은 유지한 채 copy-only
  DATA 백업만 추가하도록 경계를 고정했다. 기존 runtime은 전환 검증과 별도 정리
  승인 전까지 rollback으로 보존한다. secret-like 파일명, live SQLite와 reparse
  point를 제외하고 delete/purge 없이 복사하는 전용 helper도 추가했다.
  (worker: codex_gpt-5)

### dev-ERP 과제 생명수 시간축과 할일 검토 게이트

- 받은·보낸 메일, ERP 작업, SE 예정, 수락된 음성 인입, Codex 사용자 지시,
  등록 산출물과 일부 ERP 파일 인입을 원천별 lane으로 분리한 뒤 서울 일자와
  확정 과제 가지에만 묶는 읽기전용 `context life tree` 투영과 다섯 번째 줄기
  렌즈를 추가했다. 예정 시각은 기본 화면에서 분리하고, 날짜 미상·권한으로
  숨긴 범위·수집기 부재·시간 근거·잘림을 별도 coverage로 드러낸다. 비관리자
  조회는 본인에게 허용된 메일·할일·작업 사건 범위를 source query 단계에서
  제한하며, 메일 본문·음성 본문·Codex 지시 본문·로컬 경로는 복사하지 않는다.
  legacy 입력행의 파일명·하위폴더·임의 ID도 writer 신뢰 없이 generic label,
  opaque ID와 형식 allowlist로 투영해 과거 로컬 경로가 응답에 섞이지 않게 했다.
- 메일 자동 인입에서 명시적으로 `needs_review` 또는 `rejected`인 후보가
  `--auto-open` 때문에 완료 할일로 열릴 수 있던 경로를 fail-closed로 고쳤다.
  검토 완료 상태와 필수 분류 근거가 모두 있을 때만 기존 자동 생성 경로를
  유지한다. (worker: codex_gpt-5)

### 4노드 프로젝트 파일 관찰·개정 이력 activation candidate

- 작업 PC, 도구/고성능 PC, 휴대 개발 PC, 24시간 운영 노드와 ERP 업로드가
  동시에 같은 과제를 다룰 때 파일명·mtime을 identity로 오해하지 않도록
  workspace binding, logical file, exact content, revision occurrence, observation을
  분리한 metadata-only 스캐너·단일 primary reducer 후보를 추가했다. touch,
  rename/copy 후보, A-B-A 개정, 병렬 head 충돌, 반복 완전 스캔 뒤 삭제 후보,
  복구를 서로 다른 사건으로 보존한다.
- CLI는 기본 dry-run이며 명시적 outbox/apply gate 뒤에서만 쓰고, 비밀 경로는
  이름·경로·해시 없이 집계만 남긴다. 패킷 sequence/digest chain, primary receipt
  clock, strict UTC, cross-node 이름 충돌과 bounded recent receipt/event window를
  검사한다. logical/revision graph 전체는 아직 선형 증가하므로 현재
  watcher·scheduler·transport·authoritative ERP correlation emitter는 설치하거나
  활성화하지 않았으며, graph compaction/tail replay와 실제 node binding 검증 전에는
  상시 가동하지 않는다. (worker: codex_gpt-5)
- 이전 revision state와 hash cache도 신뢰 입력으로 보지 않고 allowlist·ID/ref·clock·
  path key·크기 상한으로 다시 검증한다. repo root가 과하게 binding되어도 `.git`,
  `_workmeta`, `private-state`, collector local state는 관찰하지 않으며, packet/cache는
  64 MiB, derived state는 256 MiB를 넘기기 전에 중단한다. 형식상 유효하게 위조된
  cache digest의 byte 진실성은 `--full` 재해시 없이는 증명하지 못하므로 live gate로
  계속 남긴다. (worker: codex_gpt-5)
- Hash cache를 strict v1으로 올려 full-byte source scan/observation/canonical packet
  digest provenance와 original verification clock을 묶고, 최대 24시간 TTL·clock
  regression/future 검증·`--full` 완전 우회를 추가했다. Cache hit는 검증 시각을
  갱신하지 않으며 legacy v0/missing provenance는 full rehash가 필요하다. 형식상
  유효한 node-local 위조를 막을 authenticated provenance는 live gate로 남는다.
  (worker: codex_gpt-5)
- Reconcile `--apply`가 scan-id 기반 immutable monthly receipt, monthly event batch,
  bounded full-state checkpoint, admins-only private life-tree projection을 함께 만들고,
  checkpoint-only `rebuild`는 계속 dry-run 기본으로 두었다. Hot receipt eviction 뒤에도
  same scan/same digest는 no-op, different digest는 conflict이며 projection은 path/name/raw를
  내보내지 않는다. Checkpoint tail replay·graph compaction·full replay parity는 구현하지
  않았고 state hard limit과 exact blocker를 계속 노출한다. (worker: codex_gpt-5)
- Full-byte pass는 valid v1 cache의 entry를 전혀 읽지 않고 chain만 보존하며, unreadable/
  legacy cache에서도 검사를 막지 않는 대신 `reset_requires_rebinding`을 명시한다.
  Reconcile은 immutable conflict를 쓰기 전에 전부 점검하고 event/checkpoint/state/
  projection 뒤 receipt를 terminal commit marker로 마지막에 쓴다. Repo root 아래 parent
  symlink read/write 우회와 같은 node producer clock 회귀도 projection 전에 fail-closed로
  차단했다. (worker: codex_gpt-5)
- dev-ERP 생명수는 reconciler가 미리 쓴 strict projection 파일 한 개만 읽으며
  filesystem/revision state를 요청 중 스캔하지 않는다. 파일 사건은 account scope를
  cap보다 먼저 적용하고 기본 admins-only로 두며, node/path/hash/size/correlation 값은
  API에서 숨긴다. ERP 업로드와 scanner 사건은 explicit event ref, 같은 과제의
  input-upload exact join, SHA-256과 양쪽 size가 있을 때의 일치가 모두 확인될 때만
  한 사건으로 합치고, 같은 hash뿐인 사건과 모호한 연결은 별도로 남긴다.
  (worker: codex_gpt-5)

### dev-ERP team preflight 운영 DB read-only 보강

- 회사 PC 팀 준비도 점검 CLI가 쓰기 가능한 `openStore()`를 통해 점검 대상 SQLite의
  스키마를 암묵적으로 초기화·마이그레이션할 수 있던 경계를 제거했다. 이제 DB를
  `readOnly + query_only`로 열고, 필요한 스키마가 없으면 `db_schema_unready`로
  중단한다. 누락 테이블이 있는 합성 DB를 점검해도 테이블을 복구하지 않는 CLI
  회귀 테스트를 추가했다. (worker: codex_gpt-5)

### dev-ERP GPT-5.6 자동 fallback effort 호환

- 실제 turn 직전 자동 선택한 GPT-5.6이 사라져 정확한 GPT-5.5로 내려갈 때, 기존
  reasoning effort가 GPT-5.5 catalog에 없으면 `high`, 모델 기본값, 첫 허용값 순으로
  호환 effort를 다시 선택한다. 이 예외는 자동 GPT-5.6→GPT-5.5 전환에만 허용하고,
  직접 선택한 모델·같은 모델의 잘못된 effort·비정상 worker 응답은 계속 중단한다.
  worker selection과 ERP 응답 검증 양쪽에 회귀 테스트를 추가했다. (worker: codex_gpt-5)

### 음성 payload cross-PC producer receipt와 consumer acknowledgement

- `_workspaces/system/voice_capture/delivery/**`에 본문 없는 producer receipt와
  consumer acknowledgement를 추가했다. producer `ready`는 생산 완료만 뜻하며,
  consumer가 exact size와 streaming SHA-256을 로컬에서 재검증해야
  `delivered`가 된다. missing, same-size mismatch, stale ack를 별도로 표시한다.
- `prepare-delivery`, `ack-delivery`, `delivery-status`는 dry-run 기본, `--apply`,
  JSON 출력과 0/1/2 exit 계약을 제공한다. 상대 ref allowlist, shared-system
  symlink 예외, nested symlink/traversal/absolute/URL/secret-like/body 차단을
  synthetic test로 고정했다.
- receipt/ack에 strict UTC audit timestamp를 추가하되 동일 입력은 기존 시각과
  mtime을 보존한다. producer/consumer 동일 label self-ack, forged file 목록,
  public repo 내부를 가리키는 system symlink를 차단하고 100-way concurrent
  atomic-write 회귀를 추가했다. session receipt는 immutable history가 아니라
  local-ASR 단계가 PLAUD 단계를 supersede하는 latest-stage pointer다.
- ack file row가 실제 관찰 size/SHA-256을 보존하도록 확장하고 receipt 기대값과
  status를 다시 바인딩해 status-only 위조를 stale로 차단했다. consumer clock이
  producer receipt보다 이르면 ack/latest 쓰기 전에 실패하고, status에는
  forged/legacy clock-inverted stale guard를 유지한다. clock sync가 필요하다. 또한 delivery
  실행은 public repo 밖 shared target을 가리키는 `_workspaces/system` symlink로
  한정하고 일반 in-repo directory materialization도 거부한다.
- PLAUD import/library 등록 및 local-ASR 완료 뒤 receipt를 best-effort로 한 번
  준비한다. receipt 실패는 retryable warning으로 기록되며 성공한 import나
  전사를 rollback하지 않는다. (worker: codex_gpt-5)
- Windows에서는 directory junction으로 외부 shared-system 계약을 재현하고, 동일
  receipt/ack의 동시 쓰기는 출력 경로별로 직렬화한다. 기존 파일과 같은 내용이 이미
  원자 publish된 rename 경합만 멱등 성공으로 수렴시켜 100-way 회귀를 플랫폼 간
  동일하게 통과시킨다. (worker: codex_gpt-5)

### 수락된 음성 보관함 manifest → dev-ERP 할일 검토 후보

- recording-library manifest의 책임자 수락 route만 기존 `할일_장부.csv`에
  `voicetask:<recording_id>` 후보로 합류시키는 dry-run 기본 CLI를 추가했다.
  미확정·후보 route는 0건을 유지하고, 수락 route도 `voice` 출처의
  `unclassified`/`needs_review` 한 행만 원자·멱등 기록한다.
- 도구는 지정한 manifest와 장부만 읽고 audio/transcript/source-event ref를 역참조하지 않는다.
  알 수 없는 장부 헤더와 다른 행은 보존하며, unsafe header나 기존 같은 키 충돌은 쓰기 전에 중단한다.
  장부 경로는 수락 프로젝트와 일치하는 정규 `_workmeta/<code>/reports/할일_장부/할일_장부.csv`만 허용한다.
  dev-ERP ingest에 `voice` 출처와 인입 격리를 추가하고 화면에 음성 출처 라벨을 표시한다.
  이 변경은 이미 수락된 manifest의 consumer만 구현한다. 자동 프로젝트 matcher와 owner-acceptance
  mutator는 아직 미구현이며, route suggestion은 기존 manifest 후보 metadata를 반영할 뿐 새 후보를 계산하지 않는다.
  (worker: codex_gpt-5)

### dev-ERP 줄기 모양 진단 뷰 (B9c)

- 기존 `GET /api/context/graph`에 `dev_erp.context_diagnostics.v1` 읽기전용 파생 통계를 추가했다. B9a와 같은 실일시 원칙(`sources.source_time`/과제 exact `core_mail.at`)과 사람 확정 item 이벤트를 서울 업무시간 주차로 정규화해 최근 52주 기록 밀도, 담당 가지·사람 이벤트·해결 분포, 수신 요청 상대·시기를 일괄 집계하며 원장 쓰기와 branch별 N+1 호출은 없다.
- 네 번째 `진단` 렌즈에서 모양 요약·주간 히트맵·사람별 분포·수신 요청 패턴·후속 사용 미관찰 후보를 함께 보여준다. 회색 후보는 `유효 종결일 + 실재 core_item exact 연결 + 종결 뒤 공유 source ref 0 + completion:<item> 완료지식 0`일 때만 관찰 수준으로 표시하고, 존재하지 않는 item 참조·시각 없는 교차 관계·DB 미조인·그래프/입력 잘림이 있으면 판정을 유보한다. UI가 날짜/메일·할일 exact 조인/제외/cap 범위를 함께 보이며 “가지 많음=병렬 또는 분산 / 적음=집중 또는 기록 부족” 이중 해석을 명시해 개인 점수나 자동 성과판정으로 쓰지 않는다. (worker: codex_gpt-5)

### Long Thread Handoff GPT-5.6 선호 갱신

- `soulforge-long-thread-handoff`의 fresh subagent 선호 모델을 GPT-5.5 xhigh에서 GPT-5.6 xhigh로 갱신하고, 해당 프로필을 제공하지 않는 런타임에서는 기존처럼 가장 강한 가용 프로필과 downgrade 보고를 유지한다. (worker: codex_gpt-5)

### Codex 자연어 기반 cross-PC 준비

- 각 PC에서 사용자가 터미널 명령을 직접 실행하는 대신 `Soulforge 최신화하고 이 PC 역할에 맞게 준비해줘`라고 Codex에 요청하면, 기존 `github_down` skill이 안전한 repo 동기화, tracked skill sync, workspace junction report-only audit, 읽기 전용 device capability probe, profile doctor를 직접 수행하도록 연결했다.
- node role별 현재 가능 작업·차단 작업·owner-only 다음 행동을 보고하며, 역할이 없거나 companion 폴더만 존재하면 `public-only`로 시작한다. `always_on_node` writer bootstrap은 명시된 profile과 현재 operational-primary 지정이 모두 있어야 한다. secret·interactive login·새 private repo 권한·프로그램 설치·junction repair·NAS/Drive mutation은 일반 준비 요청으로 자동 수행하지 않는다. (worker: codex_gpt-5)
- capability probe에 effective profile을 추가하고, `public-only`·`operator`에서는 `_workmeta` junction binding과 local capability path/NAS/receipt 설정을 아예 읽거나 probe하지 않도록 테스트로 고정했다. `always_on_node`·`dev_worker_pc` mutating prompt는 exact `owner-with-state` 권한이 있을 때만 호출한다. (worker: codex_gpt-5)
- invalid explicit profile이나 schema·role·profile이 불완전한 local identity가 owner scope로 fallback하지 않도록 capability profile resolution을 `public-only` fail-closed로 고정했다. (worker: codex_gpt-5)

### 음성 독립 전사 완료 Telegram 알림

- PLAUD 원본의 독립 로컬 ASR가 완료되면 `town_crier`의
  `voice_transcription_completed` gateway event를 큐에 적재하도록 연결했다.
  알림은 녹음 시각·길이·전사 구간 수·프로젝트 검토 대기 상태만 표시하고,
  녹음 제목·전사 본문·원본 음성·화자 실명·로컬 절대경로는 포함하지 않는다.
- Telegram enqueue 실패는 전사 결과와 분리해 기록하며 이미 완료된 독립 전사를
  실패로 되돌리지 않는다. 이벤트는 local notify policy에서 명시적으로 켜야 한다.
  (worker: codex_gpt-5)

### 지식 저장소·장치 authority 뼈대 정렬

- OneDrive/shared worksite는 active editable files, 회사 NAS는 owner-held external originals의 기본 read-only surface, `_workspaces`는 working/derived text·wiki·RAG payload, Google Drive는 durable source warehouse, `_workmeta`는 metadata-only evidence plane으로 역할을 분리했다.
- Drive folder placement·`CANON` label·connector read는 승인이나 정본이 아니며, NotebookLM/RAG/Obsidian/graph는 advisory/derived, `.registry/knowledge`만 accepted reusable knowledge canon이라는 authority matrix를 기존 지식 문서에 추가했다.
- multi-PC 장치 역할과 storage access mechanism을 knowledge authority와 분리하고, public-safe Mac `always_on_node` 역할 및 NAS no-auto-ingest 경계를 연결했다. caller-facing 지식 경로는 `$soulforge-knowledge-ingest-cell-launcher` → `knowledge_ingest_pipeline_v0`, 기존 `knowledge_wiki_cell`은 optional/narrow route로 정렬했다. (worker: codex_gpt-5)
- `guild-hall:doctor -- --device-capabilities --json` 읽기 전용 advisory를 추가했다. 이 조기 분기는 checklist·remote/live·status write를 실행하지 않고, 장치 역할·workspace link 집계·OneDrive/Google Drive 앱·Git·Ollama·선택 NAS/receipt 상태를 경로·계정·파일명·raw error 없이 보고한다. macOS/Windows fixture와 status content-hash 불변 검사를 붙였다. (worker: codex_gpt-5)
- 독립 검토에서 strict read-only gap을 찾아 Git 관찰에 optional-lock 차단을 추가하고 Git index 불변 테스트를 붙였으며, workspace junction audit를 timeout-bounded child process로 격리했다. 또한 legacy sourcebound projection binding이 아직 `_workmeta` payload를 가리키는 점을 migration gate로 명시하고 이행 전 payload 실행을 차단했다. (worker: codex_gpt-5)

### dev-ERP 가지 이야기 뷰 (B9a)

- 줄기 지도에서 가지를 클릭하면 "누가 언제 왜 시켰더라"에 즉답하는 3단 이야기(기원/경로/종결)를 보여준다. 신설 `GET /api/context/branch_story?project&branch` 가 project_context CSV(sources)와 DB(core_mail suffix 조인·event_log 사람-확정 이벤트·completion_log·core_deliverable)를 읽기전용으로 조인한다 — 시간좌표는 노드 원장 스탬프가 아니라 메일 실일시(데이터 정직성 결정 준수), 점 상한 300 cap+truncated, metadata_only(본문 미노출).
- 지도 렌즈의 하단 상세 테이블만 교체(목록·우선순위 렌즈 무변경), API 실패 시 기존 하위표 폴백 + 연속 클릭 out-of-order 가드. 착수 전 정리로 B9 패킷의 존재하지 않는 필드 표기(spawned_from)를 실존 필드로 정정하고 SLICES_INDEX 미등재 3건·B6 stale 표기를 소급 정리했다. 검증: dev-erp 493 tests green + 픽스처 브라우저 e2e(가지 클릭 → 이야기 렌더·빈 가지 폴백). (worker: claude_fable-5)

### dev-ERP 캘린더 뷰 (B10)

- 월간 캘린더 화면(`mod:calendar`)을 추가했다: 할일 마감(core_item.due)과 일정(core_meeting.at)을 한 달력에 표시하고, 날짜 클릭으로 일정을 만들고, 칩 드래그로 마감·일정 날짜를 옮긴다. 마감 드래그는 기존 `/api/items/update` 를 재사용해 due_overridden 보호 계약과 감사 이벤트를 그대로 따른다. 일정 삭제는 소프트삭제(core_meeting.status), 일정 갱신은 store 소유 감사 이벤트(no-op 은 무이벤트)를 남긴다.
- 대시보드에 `month_cal` 미니 달력 위젯(마감·일정 점 표시, 클릭 시 캘린더 뷰 점프)을 추가했다. 그리드 산출은 서버 순수함수(`GET /api/calendar`)로 두어 실행-테스트하며, 스코프는 기존 관례(관리자=팀 전체/계정 선택, 팀원=본인 강등)를 따른다. Google Calendar 연동은 P5 범위 밖 유지. 검증: dev-erp 484 tests green + 픽스처 브라우저 e2e(생성·드래그 2종·위젯 점프). (worker: claude_fable-5)

### dev-ERP Codex 할일 브리지 cold-start 완화

- 할일 전용 Codex 브리지가 요청마다 `codex app-server`를 새로 띄우며 `where.exe codex` 탐색·app-server 초기화·thread resume/start·turn 완료를 모두 120초 안에 끝내야 하던 병목을 완화했다. 기본 경로는 app-server 프로세스를 idle 10분 동안 재사용하고, turn 실행은 shared queue로 직렬화한다. stuck turn timeout 시에는 프로세스를 닫아 다음 요청이 새 프로세스를 잡는다.
- 서버 기본 timeout은 300초, 브라우저 fetch timeout은 310초로 정렬해 서버 처리 중 브라우저가 먼저 `signal is aborted without reason`으로 끊는 현상을 줄였다. 운영상 재사용을 끄려면 `DEV_ERP_CODEX_APP_SERVER_REUSE=0`을 쓴다. 후속 하드닝(stdin error 리스너, 큐 직렬화 정책, stderr 상한)은 리뷰 follow-up으로 별도 처리한다. (worker: claude_fable-5 — 기존 미커밋 슬라이스 정합·검증·커밋)

### GPT-5.6 워크플로 포트폴리오 재최적화

- 과거 최적화 이력이 있는 62개 워크플로를 적용성 gate와 단계식 후보 탐색으로 재검증했다. 59개는 새 공개 합성 fixture와 독립 품질 심사를 거쳐 28개 profile을 교체하고 31개를 유지했으며, `rag_work_card_router_v0`는 deterministic validator가 결과 권한을 가지므로 최적화 비적용으로 유지했다. 두 same-day pilot은 중복 실행 없이 재사용했다.
- 품질 하드게이트 뒤에서만 token proxy와 wall time을 비교했고, no-pass 대상의 제한적 Terra/medium Stage 2에서 2개를 추가 선택했다. billed cost, 총 절감액, payback, ROI, global-cheapest 주장은 하지 않는다. 두 pilot capability snapshot의 host-local 경로 4필드는 owner 승인에 따라 public-safe 식별자로만 교정하고 별도 영수증을 남겼다. (worker: `codex_gpt-5`)

### Workflow Optimizer 모델 이행 검증 경량화

- `workflow_optimizer`를 적용성 판정과 `migration_validation`/`profile_search` 분리, incumbent 중심 shortlist, archetype/sentinel 기반 확장으로 바꿔 새 모델 출시 때 워크플로우별 전수 Cartesian 재탐색을 기본값에서 제외했다. runner/model/effort preflight 실패는 `blocked_runner_catalog_incompatible`로 막고, 실제 후보가 실행되지 않으면 incumbent 유지와 no-winner를 강제한다.
- 비용 결론은 측정된 token proxy, list-price estimate, billed cost를 분리하고 사용 빈도 근거 없이는 ROI를 금지한다. 선택 주장은 항상 `lowest_cost_passing_among_tested`로 제한하며 historical calibration archive는 불변 기록으로 유지한다. (worker: `codex_gpt-5`)
- 후속 runner 검증에서 `codex-cli 0.144.1`의 GPT-5.6 Sol/Terra가 `ultra`를 reasoning effort로 광고함을 확인해 기존 topology-only 규칙을 교정했고, 기존 frozen gate를 재사용한 `se_assistant_operating_loop_v0`·`author_skill_package` 이행 파일럿과 반복 결과를 새 calibration archive에 기록했다. (worker: codex_gpt-5)
### PLAUD 원음 독립 전사와 프로젝트 3입력 연결

- 하이웍스 PLAUD 전사완료 메일이 맥미니의 공식 CLI 원음 import를 깨우는 기존 흐름 뒤에 durable local-ASR queue를 연결했다. 원음 import 후 `whisper.cpp`가 provider 전사를 입력으로 사용하지 않고 별도 전사하며, 실패 queue는 5분 throttle 재시도 대상으로 남는다.
- 장시간 녹음은 30분 창과 10초 겹침으로 나눠 chunk receipt를 남기므로 중단 후 이어서 처리할 수 있다. 독립 결과는 `analysis/local_asr/<run_id>/`에 버전별로 저장하고 provider 전사·요약을 덮어쓰지 않는다.
- 독립 전사 완료본은 기존 project-context 정본의 `voice` source pointer를 생성한다. 이 포인터는 `mail`, `se_schedule`과 같은 프로젝트 줄기 입력으로 결합되지만 P00 검토와 책임자 프로젝트 확정 전에는 일정·할일·화자 신원을 확정하지 않는다 (worker: codex_gpt-5).
- 완료된 음성 포인터를 기존 행보관 project-context 입력기가 직접 소비할 수 있는 metadata-only `events` packet으로 변환하는 어댑터와 소급 refresh 명령을 추가했다. 전사 본문은 어댑터에 복사하지 않는다.
- 팀원 음성 사용은 전사와 분리된 opt-in 화자 식별 lane으로 설계했다. 익명 화자분리 뒤 동의받은 로컬 enrollment만 대조하며, 임계값 미달은 `UNKNOWN`으로 유지하고 화자 제안만으로 담당자·참석자·일정을 확정하지 않는다 (worker: codex_gpt-5).
- 다음 팀회의에서 동일 조건의 화자 등록 샘플을 받을 수 있도록 공개 가능한 공통 낭독문과 1미터·실제 좌석의 2회 수집 절차를 추가했다. 실제 이름·ID 연결표·원본 음성·음성 특징은 로컬 `_workspaces`에만 둔다 (worker: codex_gpt-5).
- 장시간 사무실 배경음에서 동일 문구가 연쇄 생성되는 실제 품질 문제를 확인해 독립 전사 기본 프로필을 VAD·문맥 전파 차단·온도 fallback 차단·비음성 토큰 억제 조합으로 갱신했다. 근접 동일문구는 usable transcript에서 빼되 local 감사 sidecar와 집계 품질 플래그로 보존한다 (worker: codex_gpt-5).
- PLAUD 원음 import는 성공했지만 첫 local-ASR queue 기록만 실패한 세션이 영구 누락되지 않도록, watcher가 매 실행마다 현재 run 미완료 세션을 다시 찾아 durable queue를 복구한 뒤 drain하도록 보강했다 (worker: codex_gpt-5).

### PLAUD 조건부 파일럿 채택 결정

- PLAUD를 회의록 확정 서비스가 아니라 휴대용 원본 음성 수집기로 사용하는 운영 결정을 추가했다. 본인 1명·5~10회 이중 녹음 파일럿 동안 누락, 계정 전송, 배터리, 원거리 화자, 원본 회수, 하이웍스→맥미니 인입을 확인한 뒤 단독 주 수집기 전환 여부를 판단한다.
- 원본 오디오는 정본 후보, provider 전사·화자 라벨은 미검증 보조본, provider 요약은 격리 참고본으로 고정했다. 프로젝트 매칭·회의록·할일 확정은 Soulforge가 담당하며 보안시설 금지, 원본 부재, 프로젝트 근거 부족을 중단선으로 명시했다 (worker: codex_gpt-5).

### 하이웍스 메일 구동 맥미니 PLAUD 공식 CLI 수집기

- 하이웍스 수집기가 PLAUD 전사 완료 메일을 받으면 민감정보 없는 hash trigger를 shared OneDrive queue에 쓰고, 24시간 맥미니의 launchd `WatchPaths`가 즉시 공식 PLAUD CLI 수집을 실행하는 intake를 추가했다. 30분 독립 polling은 사용하지 않으며 explicit `sync`는 메일 누락 복구용으로만 남긴다.
- 새 녹음의 원본 오디오·시간표시 전사·요약을 격리 session으로 수집한다. provider ID 중복 방지, 전사 미완료 queue 유지와 5분 throttle 재시도, OneDrive `_workspaces/system` link preflight, metadata-only 보관함·P00 검토 이벤트 연결, node-local launchd 렌더를 포함한다.
- 증거 역할을 분리했다. 원본 오디오는 정본 후보, PLAUD 전사·화자명은 미검증 보조본, PLAUD 요약은 격리 참고본이며 provider 로그인 token과 24시간 download URL은 저장하지 않는다. fixture 기반 parser·중복 방지·materialization·launchd 회귀를 추가했다 (worker: codex_gpt-5).
- 공식 CLI가 JSON 모드 없이 사람용 표를 출력하는 현재 계약을 고려해 검증된 `0.3.4`를 profile에 고정하고, 미검증 버전은 preflight에서 중단한다.
- 메일과 provider recording을 직접 연결할 수 없는 경계에서 다른 최근 녹음만 보고 완료 처리하지 않도록 했다. 새 import가 없거나 timestamp transcript parser가 0건이면 5분 간격으로 최대 1시간 재시도하고, 이후에도 해결되지 않으면 삭제하지 않고 `unresolved` 검토함으로 격리한다. 다중 대기열은 새 녹음 1건당 오래된 trigger 1건만 완료하고 각 trigger의 수명을 따로 계산한다. 메일 본문의 일반 `transcript` 문구만으로는 trigger하지 않는다.

### PLAUD OGG 원본의 음성 보관함 등록 지원

- PLAUD 공유 링크에서 내려받은 OGG/Opus 원본을 오디오 없음으로 잘못 기록하던 문제를 수정했다. 음성 세션 상태와 보관함 원본 포인터가 `source.ogg`를 인식하고, 기존 M4A/WAV 외 MP3/FLAC 원본 포인터도 보존한다 (worker: codex_gpt-5).

### 음성 source event의 실제 입력원·회의 묶음 포인터 보존

- `write-workmeta-draft`가 PLAUD·Apple Notes·ChatGPT Record import도 모두 로컬 마이크 세션으로 기록하던 고정값을 제거했다. 세션 매니페스트의 실제 `source_kind`와 선택적 `meeting_bundle_ref`를 metadata-only source event에 보존해 동일 회의의 복수 녹음 관계와 입력원별 품질을 추적할 수 있게 했다 (worker: codex_gpt-5).

### Revision `working` - owner-style Outlook mail launcher

- Added `soulforge-owner-outlook-mail` as an explicitly selectable thin launcher for the existing `outbound_mail_authoring_v0` workflow, limited to Outlook manual or draft-only authoring with no send or Outlook mutation authority.
- Added a public-safe structured team mail context template and optional aggregate-only local/private voice-profile binding; public canon excludes real excerpts, contact values, exact footer text, raw addresses, private paths, and project rows.
- Evolved the team mail context to `outbound_team_mail_context_v1` so role-only recipients, actual assignee-specific work and notes, global notes, facts, schedule before/after/rationale/deadline, participant involvement, formats/examples, attachments, and response requirements survive into draft review. Supported v0 input normalizes to v1-only; ambiguous public-safe values and derived runtime gaps are synchronized into v1 assumptions before rendering, while unsafe values stop normalization. The normalizer now rejects unflagged email/strong-phone contact values, absolute/private runtime paths, quoted-mail header chains, and footer-security payload indicators without broadly classifying dates or part numbers. Draft packets and checklists name requested send surface and authority state separately instead of implying authority from gaps. Draft-only, no-Outlook-mutation, and no-default-route boundaries are unchanged (worker: codex_gpt-5).
- Replaced the proposed mandatory six-field body shell with evidence-backed adaptive rendering. Structured v1 metadata stays complete, while the visible body deterministically selects `compact`, `action_brief`, `decision_brief`, `status_change`, or `reply_map`; empty headings are omitted, the six Korean action fields appear only when populated in complex requests, and conflict/negotiation routes to synchronous discussion followed by an email recap. Existing sent mail and individual examples are explicitly not quality oracles. External-send and Outlook-mutation authority remain unchanged (worker: codex_gpt-5).
- Added a public synthetic technical `action_brief` example after a private owner-approved pilot received positive readability feedback. Technical request mail now uses purpose-first copy, one conditions table, a numbered implementation/test sequence, and a separate revision/measurement/log evidence list. The launcher skill remains thin and inherits this workflow update without duplicating private sent-mail content; no send, Outlook-mutation, default-route, or production-ready authority was added (worker: codex_gpt-5).

### 음성 녹음 보관함 transcript-only 메타데이터 정확성 보정

- 오디오 없이 ChatGPT Record 공유 전사만 보관한 세션을 등록할 때 `audio_stored_under_workspace`를 거짓으로 기록하고 source-provided 화자 라벨 상태를 버리던 문제를 수정했다. 실제 오디오 파일 존재 여부와 전사 존재 여부를 각각 계산하고, 별도 로컬 화자 sidecar가 없으면 세션 매니페스트의 화자분리 상태를 보존한다 (worker: codex_gpt-5).
- 2026-07-10 dev-ERP Codex Level-3 hardening: shared the Soulforge payload-owner fingerprint between ERP and release audit, separated immutable workspace boundary identity from approved-write tree deltas, rejected attachment hardlinks at read time, and changed the canonical NSSM/watchdog path to require distinct ERP and worker services. The legacy one-service installer is development-only. (worker: codex_gpt-5)

### dev-ERP Codex 동적 모델·팀 작업실 경계

- Codex app-server의 `model/list`를 페이지 순회해 계정이 제공하는 모델과 모델별 reasoning effort를 ERP에 동적으로 노출한다. GPT-5.6 이름은 UI에 하드코딩하지 않으며 discovery 실패 시 GPT-5.5 하나만 허용한다.
- ERP가 호스트 전역 Codex config를 자동 편집하던 동작을 제거하고, 선택 모델/effort를 서버 catalog로 검증해 임의 slug를 거부한다.
- ignored runtime-local 작업실 등록부가 논리 workspace ID를 owner-approved local/UNC root에 연결한다. 스레드는 mapping revision/root fingerprint에 고정되고 offline·재매핑·raw 경로 입력은 fail-closed한다.
- 작업실마다 필수 과제 allowlist와 선택적 계정/역할 allowlist를 두고, 익명/계정 0 상태의 Codex surface를 차단했다. UI는 단일 작업실도 자동 선택하지 않고 사용자가 새 스레드의 영구 binding을 직접 확인한다. lexical root가 같은 junction 재지정도 runtime real-root fingerprint로 감지한다.
- 기존 `danger-full-access` API와 store 잔여 상태를 비활성화했다. 기본 read-only에서 관리자 승인·할일/과제/작업실/기존 상대 하위 폴더·최대 8시간 TTL에 묶인 workspace-write만 허용한다. 가장 빠른 grant 만료가 turn timeout을 제한하고 철회는 active Codex 프로세스를 중단하며, audit는 완료 시점이 아니라 turn authorization 시점의 grant를 검증한다.
- read-only/workspace-write 모두 network access를 끄고, 전용 Windows 실행계정과 필수 `DEV_ERP_CODEX_HOME`을 운영 경계로 삼았다. production worker는 skill과 project instruction discovery를 항상 끄고 workspace의 보호 이름·instruction surface·link/hardlink를 metadata-only로 재귀 검사하며 worker home의 `config.toml`도 차단한다. 각 app-server는 전체 디스크 기본 거부의 `dev_erp_bounded` named permission profile을 쓰고 active profile/runtime roots/빈 instruction sources를 검증한다. exact-path probe v3가 workspace read, 승인 출력 write, 비승인 write, exact attachment/sibling/parent/outside-root, junction/hardlink, attachment 삭제·이동 경계를 모두 증명하지 못하면 worker 기동과 live release를 차단한다. 현재 개발 PC는 이 probe를 통과하지 못했으며 WSL/container는 아직 구현된 대안이 아니므로 실제 팀 PC·실제 UNC별 probe와 mutation 차단 ACL 전에는 production 배포하지 않는다.
- Codex npm/standalone 실행 tree와 실제 CLI version을 aggregate SHA-256으로 묶어 owner 기대값에 고정했다. worker attestation, signed one-time channel, model discovery, app-server spawn, turn 전후가 같은 runtime revision을 요구하며 PATH/설치 파일이 바뀌면 이전 probe를 재사용하지 않는다. metadata-only fingerprint 명령은 aggregate hash만 출력한다.
- 첨부는 item-bound opaque ID만 브라우저에 반환하고 v1 manifest의 item/size/SHA-256/realpath를 서버가 매 턴 검증한다. raw path와 hash는 브라우저·DB event에 남기지 않는다. 브라우저가 서버 소유 event kind를 위조하던 generic endpoint도 `view` 한 종류로 제한했다.
- `--require-live`에서 Git/NAS skip 우회를 blocker로 만들고 runtime-local Codex registry v1 구조와 bounded root availability를 raw-path 비노출 상태로 검사한다. 실패 배포의 old commit + WAL-safe DB restore 절차와 GPT-5.6 실계정 read-only smoke gate를 런북에 고정했다.
- 실제 읽기 경계는 ERP Codex 전용 Windows 계정의 SMB/NTFS ACL과 실행 시 exact-path permission profile/probe가 함께 소유한다. ERP runtime 껍데기와 Soulforge/팀 PC 업무 파일의 실제 위치는 계속 분리한다. (worker: codex_gpt-5)
- ERP HTTP/메일 계정과 저권한 Codex worker Windows 계정을 분리하고 loopback-only worker broker를 운영 경계로 추가했다. 통신 비밀값 원문은 전송하지 않고 시각·client nonce·일회용 signed channel·경로·wire-body hash에 묶인 request/response HMAC으로 인증한다. 실제 operation body/response는 HMAC key와 signed channel에서 HKDF-SHA256으로 파생한 key로 AES-256-GCM 암호화하고 HTTP redirect를 거부한다. ERP는 worker-only Ed25519 개인키의 nonce 서명을 실제 turn 직전·직후에 검증하고, pre-attestation channel을 실제 turn이 원자적으로 소비하며, PID/source commit/registry/home/첨부/보호-root posture가 같은 worker일 때만 결과를 저장한다. release audit는 공개키 fingerprint와 filesystem probe까지 metadata-only로 fail-closed 검증하며 계정명·identity hash·token·키는 출력하지 않는다.
- worker 계정의 `model/list`에서 GPT-5.6을 동적으로 발견한다. 자동 선택한 5.6이 turn 직전 사라진 경우에만 GPT-5.5로 내리고 직접 선택한 모델은 대체하지 않는다. 실제 thread ID는 전송되지 않는 HMAC 통신키와 분리된 AES-256-GCM `dwr2.<kid>.*` keyring으로 보관하므로 HMAC 키 회전은 기존 ref를 무효화하지 않는다. legacy inline message/부분 binding은 coherent backup 뒤 owner mapping dry-run/apply 도구로만 이행한다.
- workspace 등록부의 `allowed_write_prefixes`를 OS ACL과 함께 정적 쓰기 상한으로 두고, ERP 시간제 grant와 worker가 매 turn 독립 재검증한다. active grant가 이 상한 밖이면 release audit가 차단한다.
- Enabled workspace root끼리 lexical 동일·상하위, realpath, junction/share alias, 동일 filesystem object 겹침을 거부한다. UNC realpath/stat은 raw root를 argv/stdout에 싣지 않는 bounded child가 stdin으로만 받아 검사하며 timeout은 `workspace_root_isolation_timeout`으로 fail-closed한다. release audit의 workspace availability child도 raw root를 argv에서 제거했다.

### dev-ERP canonical snapshot consumer 계약 복구

- dev-ERP snapshot adapter가 현재 producer 계약인 `operation_board.sections.*.items`를 우선 소비하고, 기존 `rows` 입력은 하위호환으로 유지한다.
- full Soulforge snapshot의 top-level `projects[]`를 normalized JSON으로 오인하던 분기를 schema 기반으로 분리했다. snapshot-like 입력의 top-level 또는 Operation Board schema가 없거나 지원되지 않으면 fail-closed하고, 유효한 normalized `{projects,items}` 입력은 유지한다.
- focused contract를 패치된 UI projection fixture 대신 producer가 임시 디렉터리에서 직접 만든 합성 full public-safe snapshot으로 교체했다. `validateSnapshot` PASS, nonzero mapping, ingest, schema rejection, deterministic fresh/stale 판정을 함께 검증한다.
- runtime release audit의 `--require-live` gate가 저장 snapshot의 구조와 현재 source-observation freshness를 모두 blocker로 확인하게 했다. `--snapshot-freshness`로 live runtime과 독립된 readiness 확인도 지원하며 일반 구조 검증은 live private state에 의존하지 않는다.
- `ui-workspace/package-lock.json`에 dev-ERP와 Team Ops Board workspace/link 항목을 복구해 junction 없이 clean `npm ci`가 두 package를 인식하도록 했다. 개발 checkout에서 검증한 승인 commit만 별도 runtime 껍데기에 배포하며 live DB와 Soulforge 업무 데이터는 변경하지 않는다. (worker: codex_gpt-5)

### dev-ERP 줄기 강 뷰 기본기 — 접기·잘림·잠든 가지·데이터 정직성

- Owner "접는 기능·끝 잘림 등 기본이 안 됨" 지적 반영: ① **접기 칩**(`제안 N 접기/펼치기`·`완료 N 접기/펼치기`, 세션 상태 유지) ② 늦게 태어난 가지 라벨을 점 왼쪽 앵커로 — 오른쪽 잘림 제거 ③ **줄 끝 = 마지막 실기록**(진행 중 작업만 오늘선까지) — 잠든 이력 가지 16/17이 처음으로 드러남 ④ 빨간 점선 '오늘' 기준선 ⑤ 레인 24개 초과 시 행 높이 압축.
- **데이터 정직성**: 노드 기록 점을 임시 비활성 — 원장 created_at 이 대량 이관일 스탬프(P24-049 641/722건이 같은 날)라 시간 배치가 거짓이 됨. 실날짜인 회차 점(86)만 표시하고, 기록 점 복원은 B9a branch_story 의 메일 장부(실수신일) 조인으로 명시 (`docs/slices/B9-STEM-RIVER-VIEW.md`).
- 검증: 실데이터 P24-049 — 텍스트 우측 경계 1147<1180(잘림 0), 접기 22↔5 왕복, 잠든 가지 16 시각화, 드래그(고스트·하이라이트·reanchor 단발) 회귀 무결, 콘솔 0, node:test 전건 (worker: claude_fable-5).

### dev-ERP 메일 스레드(대화) 그룹 단위 담당·과제 일괄 분류

- 메일 화면의 대화 그룹 헤더에 담당자 select와 과제 select를 추가해, FW/RE로 묶인 스레드 전체를 한 번에 한 사람에게 배정하거나 다른 과제로 함께 이동한다(기존엔 메일을 한 건씩 눌러 분류). 미분류 위젯의 대화 단위 배정(`/api/mail/assign` 다건) 패턴을 이식했고 백엔드 무변경(프론트 단독).
- 담당 배정은 스레드의 현재 실과제를 유지(미분류일 때만 일반업무)해 이미 분류된 대화가 끌려나가지 않게 했고, 과제 이동은 별도 select가 담당한다. 대화 1개=대표 할일 1개(single_item), 나머지 메일은 함께 file. select 조작은 헤더 펼침 토글과 분리(stopPropagation). (worker: claude_opus-4-8)

### dev-ERP 메일→할일 UX: 스팸 버튼·할일 팝업 메일 원문·과제 변경

- 메일 상세에 '스팸' 버튼을 추가했다. 관리자는 발신자 영구 차단(제외 규칙 추가+소급 숨김) 또는 이 메일만 숨김을, 팀원은 이 메일만 숨김을 고른다. 대화상자에 규칙 관리 위치(관리자 패널 › 메일 제외 규칙)를 안내해 "분류 기준 어디 있는지"를 해소한다.
- 할일 상세 팝업에 원본 메일 내용(발신자·날짜·제목·본문)을 함께 띄워 AI 오해석을 사람이 대조하게 했고, 할일 이름 직접 수정과 과제 변경(메일 유래면 원본 메일도 동행 이동)을 추가했다. store `setItemProject` + `/api/items/project` 신설, 이벤트 `item_move`. node:test ITEM-PROJECT 2건 추가. (worker: claude_fable-5)

### dev-ERP B9b 줄기 강(江) 뷰 — 방사형 폐기, 시간축 레인 렌더 (근본 교체)

- Owner "근본적인 해결 없이 접근" 지적에 따라 줄기 지도의 방사형 레이아웃을 폐기하고 **가로축=시간 강줄기 렌더**로 교체했다 (`docs/slices/B9-STEM-RIVER-VIEW.md` §2 문법). 맨 위 보라 가로선=SE 기둥(큰 점=게이트, 드래그 드롭 대상 유지), 가지 하나=자기 가로줄 하나(탄생점→진행/완료점) — **겹침이 구조적으로 불가능**(git log --graph 원리). 줄 위 점=그 일의 기록들(시간순, hover 툴팁), 이력줄기는 회차 점, 월 눈금 그리드.
- 가지 사이 관계 곡선(교차 링크) 렌더 배선 — 현 데이터는 회차→할일 출생 링크(`spawned_item_refs`)가 미적재라 0건이며, 엔진이 채우면 자동 표시(소급 추론은 Codex 소품 후보).
- 사전 슬라이스 2건 동승 기록: 지도 라벨 표시 정제(접두 벗김 `trunkMapLabel`, f43cceab) + 드래그 UX(고스트·게이트 하이라이트·전결과 토스트·텍스트선택 차단, bcf35c0b).
- 검증: 실데이터 P24-049 — 레인 22개 전부 고유 행, 기록 점 137·회차 점 86 시간 배치, 월 눈금 12, 클릭 상세·선택 강조·드래그(고스트+하이라이트+reanchor 단발) 전부 통과, 콘솔 0, node:test 전건 (worker: claude_fable-5).

### dev-ERP B8 줄기 지도 v2 렌더 (골격·작업·이력 구분 + 드래그 재부착)

- 과제 허브·지식 줄기 지도가 ENGINE-11 v2 산출(`branches.csv`/`occurrences.csv`)을 소비한다. `branch_kind`별 색·모양 구분(골격=보라 사각, 작업=초록 원, 이력=주황 원, legacy=파랑 반투명) + 종류별 묶음 배치 + 라벨 지그재그로 "제목 문자열 무더기" 겹침 문제를 해소했다.
- v2 줄기가 있는 과제는 옛 제목조각 가지(legacy)를 기본 숨기고 `옛 가지 {n}개 보기/숨기기` 토글로 노출한다. 종류 범례 칩 + 의미 힌트 한 줄(원 크기=자료량, 배지=미결 리뷰, 점선=확정 대기 제안)을 상단에 상시 표시. 이력 `proposed`는 점선+`제안` 태그, 완료 작업은 ✓+흐림.
- 가지 클릭 상세에 종류/상태/탄생~종료 메타와 이력줄기 회차 타임라인(`날짜(자료수)`, occurrences 조인)을 추가했다.
- 드래그 재부착(사람 확정, STEM-V2 온톨로지): 작업 가지를 끌어 골격 게이트 사각에 놓으면 `POST /api/items/reanchor`(B6)로 SE 단계가 이동한다. 6px 미만=클릭(펼치기)과 구분, 게이트 외 대상은 안내 토스트. 검증 중 repaint마다 move/up 리스너가 중복 부착되어 드래그 1번에 API가 다발 발사되는 결함을 발견해 1회 부착으로 수정.
- 프론트(`static/app.js`)+어휘(`src/lexicon.mjs` 17키×2모드)+스타일 1클래스. 검증: 실데이터 사본 fixture 프리뷰에서 P26-014(골격5·이력4, legacy 27 숨김↔표시)·P24-049(골격7·작업5·이력17) 렌더 + 드래그 합성 → reanchor POST 정확히 1건 + 콘솔 오류 0, lexicon parity green (worker: claude_fable-5).

### dev-ERP 내 할일 위젯 전체 표시 + 행 클릭 상세

- "내 할일(mine)" 위젯이 담당 할 일을 앞 8개(`slice(0,8)`)만 보여줘, 마감일 없는 새 수동 할 일(빠른 추가)이 정렬상 맨 아래로 밀려 위젯에서 안 보이던 문제를 해소했다. 이제 담당 할 일을 전부 렌더하고 위젯 body(`overflow-y:auto`)에서 스크롤로 확인한다. 저장 경로 자체(`POST /api/items` → `core_item`)는 정상이었고 표시 규칙만 바뀐 것.
- 행 클릭 시 열리는 빠른편집 모달(`openItemQuickEdit`)에 읽기전용 정보 블록을 추가했다 — 상태/과제/담당/마감/등록일·출처/업무유형/산출물/완료기준. 목록 렌더 시 `itemMiniRow`가 항목 객체를 클라이언트 캐시(`state._itemCache`)에 담아, 서버 재요청·재시작 없이 표시한다.
- 정적 프론트(`ui-workspace/apps/dev-erp/static/app.js`) 변경만. 검증: `node --check` OK, `npm test` 456/457(유일 실패 `codex_bridge_process` 프로세스 종료 타이밍 테스트는 정적 자산 미참조로 본 변경과 무관) (worker: claude_opus-4-8).
- 후속(owner 요청 "시작한 작업은 맨 위로"): mine 위젯 목록을 시작된 일 우선으로 정렬한다. `itemStarted(i)`(상태 ∉ open/unclassified = doing/waiting/blocked) 항목을 상단으로 올리고, 시작/미시작 각 그룹 내부는 기존 서버 정렬(urgency/due/id)을 유지한다(`Array.sort` 안정성, ES2019). '시작'을 눌러 doing이 된 항목이 하단으로 사라지지 않는다. 정적 프론트 단독 변경(`itemStarted` 기존 함수 재사용) — 서버 재시작·lexicon 무관 (worker: claude_opus-4-8).

### Codex 로컬 자동화 상태 public 제외

- 저장소 루트에 잘못 생성될 수 있는 Codex 로컬 자동화 상태 폴더 `automations/`를 public Git 추적 대상에서 제외했다. 메일/텔레그램 발송 상태 같은 보호 운영 메모가 public repo untracked 변경으로 노출되지 않도록 하는 경계 보강이다 (worker: codex_gpt-5).

### dev-ERP ENGINE-11 stem-v2 generator

- Follow-up retro rebuild pass (2026-07-06, worker: codex_gpt-5.5): added dry-run-default
  `--rebuild-from-ledgers` to `ui-workspace/apps/dev-erp/tools/haengbogwan_project_context.mjs`.
  It rescans metadata-only task/mail ledgers under `_workmeta/<project>/reports/`, seeds
  skeleton/work/history stem-v2 events, and writes only with explicit `--apply`.
- Applied the rebuild to P24-049 and P26-014. P24-049 now has 29 branches
  (skeleton 7, work 5, history 17) and 86 occurrences; the practical-meeting
  mail series in the ledger (`... 업무협의`) is a proposed history branch with 5
  occurrence rows. P26-014 now has 9 branches (skeleton 5, work 0, history 4)
  and 17 occurrences. No mail bodies or attachments were read.

- ENGINE-11 줄기 생성기를 project_context 산출물에 배선했다. 새 `branches.csv`/`occurrences.csv`와 `sources.csv.branch_ref`/`suggested_branch_ref`를 additive로 쓰며, 기존 `branch_summaries.csv` 소비자는 header 기반으로 읽도록 보강했다.
- 확정 기준을 제목 클러스터에서 link 기반 줄기로 전환했다. 승인 task는 `work` 줄기(`anchor_ref=item:<id>`)로 태어나고 완료 task는 닫히며, 명시 skeleton anchor는 `skeleton` 줄기로 기록된다. 같은 정규화 제목이 8주 창 안에서 3회 이상 반복된 mail은 `history` 제안 줄기와 회차로만 남긴다.
- anchor 없는 mail은 제목 조각 branch를 만들지 않고 빈 `branch_ref`로 보류한다. `/api/context/graph`는 v1 파일을 계속 읽으면서 v2 branch metadata와 occurrences를 노출한다.
- 검증: `node --test test/haengbogwan_project_context.test.mjs`, `node --test test/haengbogwan_run.test.mjs`, `node --test test/auto_intake_cycle.test.mjs`, `node --test --test-name-pattern CTX-GRAPH test/core.test.mjs` green (worker: codex_gpt-5.5).

### dev-ERP B7 Outlook식 메일→과제 라우팅 규칙 (사용자 UI + 소급 적용)

- Owner 요청 "outlook 처럼 규칙 넣을수있게 + 현재 폴더에 다 적용하겠습니까?" 구현: `mail_route_rule` 테이블(발신자/제목 × 포함/완전일치 → 대상 과제) + 인입 훅(INBOX행만, 등록순 첫 매칭 승, 기분류 메일 무접촉) + `applyMailRouteRulesToExisting` 소급 적용(run17 `setMailProject` 재사용 — 승격 할일 동행 이동·autosync write-through·멱등). 대상 과제 실존 검증과 inbox 대상 거부(자기참조 차단) 포함.
- "현재 이미 만들어진 규칙들도 보이게" — 엔진 정본 바인딩(`_workmeta/system/bindings/mail_project_router.yaml`)을 zero-dep 파서(`src/mail_router_binding.mjs`)로 읽어 관리자 패널에 읽기 전용 표(12규칙, 조건 앞 3개+N 요약)로 표시. 정본은 엔진 레인 소유, 사용자 규칙이 우선임을 캡션 명시.
- 관리자 패널 신설 섹션: 사용자 규칙 CRUD + 규칙별/전체 [기존 적용] + 추가 직후 Outlook식 "기존 받은함 메일에도 지금 적용할까요?" 인라인 확인 바(전역 uiConfirm 은 패널 오버레이를 제거하므로 패널 내부 사용 금지 — 실측 확인 후 인라인으로 설계). 서버 4 라우트는 관리자 게이트, 이벤트 3종에 패턴 값 미기재(필드명·대상·건수만).
- 검증: 신규 node:test 4건(MAIL-ROUTE-001~004) + 전건 스위트 green + verify_gate Level 1 PASS(`docs/slices/B7-MAIL-ROUTE-RULES.md`) + 프리뷰 전 플로우 DOM 증빙 (worker: claude_fable-5).

### dev-ERP ENGINE-10 system/ad mail isolation layer

- ENGINE-10 시스템/광고 메일 분류층을 auto-intake LLM 앞단 결정적 prepass로 배선했다. `[dev-erp]`, `[Soulforge]`, `나이트워치`, `아침보고` 기본 시스템 제목 신호와 광고/수신거부/List-Unsubscribe 메타 신호를 본문 없이 판정해 후보에서 제외하고, apply 시 `mail_receipts.csv`에 `no_action` 영수증(`system_mail_layer`)을 남겨 재판단 루프를 끊는다.
- core_mail 보존 격리는 기존 Gmail식 label 체계를 재사용한다. 자동층은 `system`/`ad` 라벨을 생성·부착하고 메일 행은 삭제하지 않는다. owner 편집 규칙 파일은 `_workmeta/system/rules/system_mail_rules.json`이 있으면 읽고, 없으면 기본 규칙으로 하위호환 동작한다.
- 검증: `node --test test/auto_intake_cycle.test.mjs` 36/36 green. 신규 ENGINE-10 회귀는 system/ad 2건이 LLM 입력에서 빠지고, 업무 메일 1건만 classify로 전달되며, 영수증 2건과 core_mail 라벨 2건이 착지함을 확인한다 (worker: codex_gpt-5).

### dev-ERP B6 줄기 드래그 재부착 서버 API 3종

- 줄기 v2 조작면(드래그=사람 확정)의 서버 절반: `POST /api/items/reanchor`(골격 가지 이동 — anchor 교체+`item_reanchor` from/to 이벤트), `POST /api/items/set-origin-occurrence`(이력줄기 출생 회차 링크 — `core_item.origin_occurrence_ref` ALTER 1종), `POST /api/mail/reattach`(메일→다른 작업줄기 사람 교정 — `mail_reattach` 이벤트 + 교정 영수증 학습 피드백 best-effort, 스레드 원본 불변).
- 전부 멱등 no-op(같은 목적지 재호출 unchanged:true)·append-only(from/to 로 되돌리기)·autosync write-through·B-1 actor 세션 강제 경로. 그래프 UI(줄기 렌더 레인)는 `docs/slices/B6-STEM-REATTACH-API.md` 계약을 소비.
- 독립 테스트 `test/stem_reattach.test.mjs` 3본 + npm test 목록 누락 2파일(`stem_reattach`, `mail_collect_summary`) 편입. 전체 직렬 460/460 green.

### dev-ERP morning brief: Outlook-readable template + in-progress section

- Owner feedback on the first live brief (2026-07-05 08:00): the mail rendered as one unreadable paragraph and "actual work" was missing. Root cause 1: the HTML part relied on `white-space:pre-wrap`, which Outlook's Word renderer ignores — all line breaks collapsed. The template now carries line structure in markup (heading `<p>` + `<ul><li>` per item, inline-styled summary chips, project code in gray, due date in red, "ERP 열기" button link), which Word-based Outlook renders correctly; a regression assert forbids reintroducing pre-wrap.
- Root cause 2: open/doing items without a due date belonged to no section, so a member's real workload was invisible — added a "진행 중 (마감 미지정)" section (owner's real data: 11 items now visible alongside 30 proposals). Send-worthiness criteria unchanged (still skips no-action-hook briefs). Covered by extended BRIEF-001 assertions (worker: claude_fable-5).

### dev-ERP 줄기 v2 온톨로지 정본 + 실행 패킷 2종

- 줄기 개념 정본 확정(`docs/slices/STEM-V2-ONTOLOGY.md`, 2026-07-05 owner 공동설계): 골격줄기(SE 뼈대)·작업줄기(승인 때 탄생→스레드로 성장→완료로 닫힘)·이력줄기(회의체 시간축, 회차 분가·미결 이월) 3종과 연결 등급 원칙("단어는 추천만, 확정은 ID·사람·사용사실") — 현행 제목 문자열 클러스터의 "무더기 그래프" 문제(P24-049 실측)의 교체 설계.
- 실행 패킷 분배: `ENGINE-11-STEM-V2-GENERATOR.md`(생성기 교체, engine_thread_codex) + `B6-STEM-REATTACH-API.md`(드래그 재부착 서버 계약/API 3종, ERP 표면 스레드 — 그래프 UI 는 줄기 렌더 레인이 계약 소비). owner 결정 기록: 작업줄기 탄생=정식 등록 시, 이력줄기 승격=8주 3회+1클릭(위임 기본값), 조작형 그래프 요구 확정.

### dev-ERP project-trunk multi-lens views + expandable mindmap branches

- The 줄기 (project_context) view now offers three purpose-fit lenses via a switcher, each tied to one decision (owner request 2026-07-05): **지도** (radial map — shape at a glance), **목록** (collapsible outline, lazy-rendered — the daily reading view), **우선순위** (triage table sorted by open reviews — what to act on first). Force-directed/3D layouts deliberately excluded as decision-less eye-candy. Zero server change — all lenses derive client-side from the single `/api/context/graph` response; works in both the knowledge tab and the per-project hub tab; lexicon parity.
- Map branches now fold/unfold like a real mindmap (owner request): clicking a branch blooms its latest 12 children in a fan around it (type-colored — event/task/milestone/actor, hover tooltip with full title, "+N" overflow marker, accent ring on the open branch), clicking again folds, and opening another branch switches (accordion — expanding all 363 nodes at once would be an unreadable hairball). The detail table below still opens on click.
- Pre-commit adversarial review fixed 2 findings on the lens slice (missing `.trunk-view.on` active-state CSS; legend leaking internal node types `context_branch`/`project_trunk` as raw English). Verified live: expand 12+"+162", collapse, accordion switch, single accent ring, tooltips on all children, console clean; core suite green (one unrelated `server_not_ready` spawn flake under load, passes alone) (worker: claude_fable-5).

### 5필드 Codex hook guard 경로 이식성 보정

- Soulforge Codex lifecycle hook command 를 host-local absolute path 예시에서 프로젝트 root 기준 상대경로(`node .workflow/.../codex_hook_guard.mjs`)로 변경했다. 다른 PC 의 checkout 위치가 달라도 `.codex/config.toml` 수정 없이 pull + hook trust 만으로 적용되게 하기 위한 보정이다. 추적 스니펫과 README 설치 절차도 같은 기준으로 갱신했다 (worker: codex_gpt-5).

### dev-ERP project-trunk multi-lens views (map / outline / triage)

- The 줄기 (project_context) graph now offers three purpose-fit lenses via a view switcher, each tied to one decision (owner request 2026-07-05): **지도** (radial SVG — the shape at a glance), **목록** (collapsible outline drilling branch → events/tasks, lazy-rendered — the actually-usable reading view, per the Roam/Logseq lesson that outlines beat graphs for daily work), and **우선순위** (triage table sorted by open-review count desc — "what to act on first", directly tied to the open-review backlog). Force-directed/3D layouts were deliberately excluded as decision-less eye-candy.
- Zero server change: all three views derive from the single `/api/context/graph` response, sharing `trunkChildTable`/`trunkBranchChildren` helpers (DRY). Works in both the knowledge tab (with project dropdown) and the per-project hub tab; `state.trunkView` persists across project switches; lexicon parity for both business/fantasy modes. Verified live (map/outline/triage all render, branch expand shows 40-row child tables, triage sorted 158/16/12 by reviews, console clean) + core 261/261 (worker: claude_fable-5).

### dev-ERP Windows 배치 파일 인코딩/줄바꿈 수리 (CRLF 고정)

- `start-windows.bat`·`start-tailscale-windows.bat`이 UTF-8 무BOM + LF 줄바꿈 조합에서 cmd.exe 파싱이 붕괴했다(2026-07-04 적대검토 실측, 2026-07-05 재현: cp949 초기 콘솔에서 `DEV_ERP_PORT`가 빈 값 → `node --port` 빈 인자 → 서버 미기동, 그리고 다중행 괄호 블록의 비이스케이프 괄호가 `:4300 was unexpected`로 조기 종료). 근본 원인은 루트 `.gitattributes`의 `* text=auto eol=lf`가 배치 파일까지 LF로 강제한 것.
- 수리: dev-erp 로컬 `.gitattributes`에 `*.bat/*.cmd text eol=crlf` override 신설, 두 배치 파일을 CRLF로 변환, 다중행 괄호 블록 2개를 단일행 `if`로 펼쳐 줄 경계 취약성 제거, 조건부 echo 괄호 이스케이프. cp949 초기 콘솔 A/B 실측 검증(수정 전 `PORT=[]` 붕괴 → 수정 후 dev `4310`/runtime `4300` 정상, 인입 스위치 4300 한정 확인). 운영 정경로는 `ops/run-dev-erp-background.ps1`이라 긴급도는 낮으나, 팀원·owner 더블클릭 표면 신뢰 복구. core 261/261 + bat 회귀 assert 유지 (worker: claude_fable-5).

### 5필드 캡처 Codex lifecycle hook guard 배선

- Codex 공식 lifecycle hook 스키마(`[[hooks.PostToolUse]]`, `[[hooks.Stop]]`)로 Soulforge 프로젝트 로컬 `.codex/config.toml` 에 5필드 기록 누락 guard 를 등록했다. `notify` 는 computer-use 런타임 점유 키라 변경하지 않았고, user/global hook 대신 project source 를 택해 Soulforge 작업에만 적용한다.
- 신규 `codex_hook_guard.mjs` 는 PostToolUse 에서 `git commit` 명령만 session sentinel 로 표시하고, Stop 에서 sentinel 이 있을 때만 `five_field_capture.mjs --check --session-ref <session_id>` 를 실행한다. 누락 시 Codex Stop hook 의 `decision: "block"` 으로 "5필드 기록 후 종료" continuation 을 만들며, `stop_hook_active`/blocked marker 로 재발화 루프를 막는다.
- 추적 설치 스니펫을 `.workflow/five_field_session_capture_v0/codex/codex-hook.soulforge-five-field-guard.toml` 에 보존하고 README 에 Codex Hook 배선/타 PC 설치 절차를 추가했다. smoke evidence: commit sentinel+no-record block, record-after pass, no-commit no-op (worker: codex_gpt-5).

### dev-ERP data-plane split: Soulforge is the backend, runtime is a stateless app server

- Owner architecture decision (2026-07-05): project metadata (`_workmeta` — 줄기/ledgers/receipts) lives only in the Soulforge dev checkout; the runtime clone is a shell (code, SQLite operational DB, TLS certs, mailbox-credential envs, logs) and must not accumulate data. Read paths applied now: the ops launch script passes `--knowledge_shell_root <backend-root>` so the knowledge shelf, wiki bodies, and the project-trunk graph on the production 4300 server read the backend directly (no data copied into runtime); the server logs its `데이터 평면 루트` at startup so ops can see which store it reads.
- ENGINE-9 write-path wiring is now applied: the server reads `DEV_ERP_BACKEND_ROOT` for autosync write-through, mail-ledger ingest, auto-intake child runs, and receipt summaries; `ops/run-dev-erp-background.ps1` pins it to the backend checkout alongside `--knowledge_shell_root`, and auto-intake now passes discovered projects to the haengbogwan context refresh. Existing runtime `_workmeta` merge remains a one-time ops follow-up after runtime path/timestamp inspection (worker: codex_gpt-5).

### 5필드 캡처 Codex 레인 훅 배선 — 계약 편입 + 일일 sweep 자동화

- (owner 승인 2026-07-05 "codex에서도 훅이 되게") `AGENTS.md` AI 작업 실행 계약에 5필드 기록 1줄 편입 — 모든 bounded 작업은 완료 보고 전 `.workflow/five_field_session_capture_v0` capture CLI 로 레저 기록(기록 주체=AI, 원문 미복사). Claude 레인의 Stop guard 와 대칭인 Codex 레인 계약 훅.
- 결정적 안전망: Codex automation `soulforge-five-field-sweep`(일일 07:35, ACTIVE) 설치 — 최근 24시간 커밋 대비 레저 갭을 커밋 메시지·diff --stat 만으로 소급 기록(`ai_backfill`), 승격 스캔 리포트 갱신, 드레인 지표(needs_backfill·큐 적체·레저 신규 행) 보고. 추적 사본은 워크플로우 패키지 `codex/` 하위, 설치본은 `~/.codex/automations/`(기존 NAS 백업 자동화와 동일 형식, TOML 이스케이프 검증). `notify` 훅은 computer-use 런타임 점유로 제외 (worker: claude_fable-5).

### dev-ERP 지식 유통 루프 완성 — 승인 실기록(B) + Codex 지식 주입(C)

- **B (승인 no-op 해제)**: `approveProposal` 의 completion_digest 분기(`result={ok:true}` 한 줄)를 `applyCompletionDigest` 실기록으로 교체 — 지식 텍스트가 있으면 ① 담당자 메모리(`addMemoryItem`, Mem0 ADD/UPDATE/NOOP 게이트·과제 격리·출처 ref)에 적재해 **다음 Codex 스레드 주입이 처음으로 비어있지 않게** 하고 ② core_knowledge 검색 표면에 요약·키워드·포인터만 기록(`data_label='ai_draft'`, claim_ceiling=observed). 지식이 비면 예전 의미(승인=확인) 유지, 트랜잭션 내 실행(부분 적용 없음). 고여 있던 pending 다이제스트 11+건이 승인 시 살아난다.
- **C (지식 주입)**: Codex 과제 스레드 developer instructions 에 출처 포인터(`input_refs` — five_field composeInputRefs 재사용, 원문 미포함)와 과제 지식 top-N 참조(`knowledge_refs` — knowledge_grounding 재사용, 제목+source_card 경로만) 자동 주입. 스레드 개설·매 턴 두 곳 배선, 인덱스 스캔은 프로젝트별 10분 캐시. "사람이 복붙으로 컨텍스트를 나르는" 마지막 구간 제거 — "Do not claim raw ..." 원문 미제공 경계는 유지(포인터만).
- 커밋 전 적대 리뷰 확정 5건 반영: (must_fix) 지식 인덱스 전수 스캔이 실측 5,231ms 동기 블록(인덱스 파일이 추출 전문 포함, 합계 1.5GB)이라 서버 경로용 `listProjectKnowledgeRefsFast` 신설 — 이름 프리필터+크기 상한+손상 개별 skip 으로 실측 14.5ms(360×), (should_fix) 전수 스캔의 파일 단위 격리(부분쓰기 1건이 전체 [] 반환하던 결함), 빈 캐시 60초 TTL, `request_kind:""` 의 topic truthiness 폴백, core_knowledge item 키잉(재완료 중복 누적 → ON CONFLICT 갱신).
- 검증: KNOWLEDGE-LOOP-001 8건(승인→메모리+지식+주입 왕복, 빈 지식 skip, 담당자 없음, Mem0 중복 방지, topic 폴백, 재승인 갱신, instructions 렌더, Fast 스캔 프리필터/skip) + 전체 직렬 + 커밋 전 적대 리뷰 (worker: claude_fable-5).

### dev-ERP 완료지식→RAG 후보 피드 활성 (env-only)

- 운영 기동 스크립트에 `DEV_ERP_INTAKE_COMPLETION_FEED=1` 추가(owner 지시 2026-07-04 "지식 워크플로우 계속 돌아가게"): 15분 인입 사이클이 completion_log 지식 다이제스트를 `knowledge_rag_candidate_ledger`(_workmeta, guild_hall 계약 검증)로 증분 적재. 코드 변경 0 — 기존 배선(`auto_intake_cycle.mjs:64` env 게이트, `completion_knowledge_feed.mjs` 본문 금지키 가드+커서)에 전류만. 이로써 지식 사슬의 사이클 상주분(분류 지식근거 주입 + 완료지식 후보 적재)이 상시 가동 (worker: claude_fable-5).

### dev-ERP knowledge shelf, wiki viewer, and project-trunk graph

- Wired the knowledge data plane into the ERP screen for the first time (owner request 2026-07-04): the knowledge module is now four tabs — shelf status (`/api/knowledge/overview`: common systems-engineering/standards vs engineering-domain vs per-project tiers, ingest-receipt timestamps answering "when was it collected", knowledge_access ledger rollup answering "how much was it used" with an honest on-screen note that automatic capture is not wired yet), wiki (list + body viewer), project-trunk graph, and the existing FAQ/manual manager.
- Wiki body viewing is an owner-approved exception (2026-07-04) to the metadata-only knowledge shell contract: `.md` wiki pages only, login required, chunk/raw/source-original names and extensions stay blocked; registered in the KARPATHY contract doc and the contract constant (`wiki_body_exception`), scan endpoints keep `body_included: false`.
- The 줄기 (project_context) trunk graph reuses the engine's existing node/edge CSV ledgers read-only (`/api/context/graph`, login required): radial SVG with the trunk centered, branch size = source count, red badge = open reviews, click-through to that branch's events and task candidates. The owner's knowledge-graph exporter output (`guild_hall/knowledge_graph`, Three.js 3D) is now served at `/knowledge-graph/**` (login, safe extensions only) behind a "지식 그래프(3D) 열기" button.
- Hardening from the pre-commit adversarial review (6 confirmed findings fixed): the overview endpoint now has a 60s server-side TTL memo plus a client session cache (it was a ~2s synchronous full-scan blocking the event loop on every tab switch — critical), the wiki scan prunes large non-wiki dirs (was 22,843 lstat for 3 wiki pages), shelf counts surface `truncated`/`≈` when the depth cap elides subfolders, the trunk graph sorts branches by importance before the 40-cap and shows "+N omitted" (arbitrary CSV-order truncation was hiding the most important branches), project enumeration unions `_workmeta` and `_workspaces` so the shared-junction project wikis still show on the runtime clone (whose `_workmeta` may hold only the INBOX), context routes use the same `KNOWLEDGE_SHELL.root`, and `readWikiPage` adds realpath containment against Windows junctions escaping the workspace. Runbook §9 documents the knowledge data-plane split. Covered by KNOW-OV-001~005 and CTX-GRAPH-001 core tests (worker: claude_fable-5).

### 워크플로우 draft: five_field_session_capture_v0 (세션 종료 5필드 캡처)

- 평소 Codex/Claude 세션 대화가 끝날 때도 자동화 자산 5필드가 남도록(owner 요청 2026-07-04) `.workflow/five_field_session_capture_v0/` draft 패키지 신설: 도구 비종속 CLI(`tools/five_field_capture.mjs`, 표준 Node 만 사용)가 `_workmeta/<project>/reports/procedure_capture/five_field_log.jsonl` 에 append-only 착지(재실행 멱등, 원문 미복사 크기 가드, request_kind 슬러그 검증).
- 설계 원칙: 셸 훅은 판단/검증 내용을 쓸 수 없으므로 **기록은 세션의 AI 가 종료 시 직접, 하네스 훅은 `--check` guard(exit 2=누락 경고)만** — ladder 계단 3단(validator 먼저). ERP 업무 레인(completion_log)과 스키마 계열 통일(`soulforge.five_field_capture.v0`)로 승격 감지기가 두 레인을 함께 읽는다. index.yaml 등록·AGENTS/gate 바인딩은 owner 결정 대기(workflow.yaml `owner_decision_needed`). CLI smoke check 5케이스 통과 (worker: claude_fable-5).
- Claude Code 훅 강제 배선(owner 승인 "훅으로 실행해야 확실"): `tools/claude_stop_guard.mjs` 어댑터 추가 — Stop 훅은 매 턴 발화하므로 무조건 차단 대신 2단 센서(PostToolUse 가 git commit 을 내용 검사로 감지해 센티널 마킹 → Stop 이 센티널+기록없음일 때만 1회 차단, `stop_hook_active` 루프 방지, 기록되면 자동 통과). 파이프 테스트 6경로 green(무센티널 통과/체인커밋 마킹/비커밋 무시/차단/기록 후 통과/경고 1회). 로컬 `.claude/settings.json` 배선 JSON 은 패키지 README 수록 (worker: claude_fable-5).

### dev-ERP 완료 시점 자동화 자산 5필드 자동 캡처 v1 (FIVE-FIELD-001)

- request-to-automation ladder 계단 1단의 실물화(owner 승인 2026-07-04, packet `request_to_automation_ladder_v0` S1/S2): 할일이 완료될 때마다 자동화 자산 5필드 — 입력(`log_ref`=소스 포인터 JSON 배열)·판단(`knowledge`)·출력(`summary`)·검증(`verification` 신규)·중단조건(`stop_conditions` 신규) — 과 반복 감지 슬러그 `request_kind`(신규, "review/mail" 형태)가 completion_log에 자동으로 남는다. 사람이 쓰는 기록이 아니라 AI/훅이 쓰는 기록(assignee_memory 0행 교훈).
- 이원 착지 설계: 결정적 절반(입력 포인터·집계키 베이스)은 `logCompletion`이 완료 즉시 기록(`needs_backfill=1`로 시작), LLM 초안 절반(요약/판단/검증/중단조건/슬러그 세분화)은 완료 훅이 ollama로 생성해 `data_label='ai_draft'`로 직접 착지 — 승인 대기 큐를 새로 만들지 않는다(packet stop_condition). 스레드 없음이면 `five_field_partial` 이벤트, LLM 미가용이면 기존 `completion_hook_skipped` — 어느 쪽도 완료를 막지 않고 `needs_backfill=1` 유지(소급 대상 마커). 기존 legacy 행도 마이그레이션이 `request_kind IS NULL` 기준으로 소급 대상 마킹, 완료_장부 CSV 왕복(completion_ledger)에도 5필드 컬럼 동승.
- 순수 로직은 신규 `src/five_field.mjs`로 분리(포인터 수집=원문 미복사·수동 log_ref 존중, 슬러그 정규화=무효 시 결정적 베이스 유지, LLM 응답 클램프=근거 없는 필드 소거). `backfillCompletionLog`도 과거 완료건의 결정적 절반을 소급(검증·중단조건은 소급 불가 — 완료 시점 캡처만 가능). ai_proposal payload에 세 필드 동봉(B-5 표시용). 신규 테스트 FIVE-FIELD-001 8건 (worker: claude_fable-5).

### dev-ERP 인입 자동화 스위치 2종 활성 (env-only)

- 운영 기동 스크립트(`ops/run-dev-erp-background.ps1`)에 owner 승인(2026-07-04) env 3줄 추가: ① `DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HINT=1` + `DEV_ERP_MAIL_ROUTE_BACKFILL_PRIVATE_DEEP=1` — 6/29 owner 검토·승인된 hint/private-deep 라우팅 룰을 일일 백필에 활성(그동안 exact 전용이라 480회 실행에 이동 1건이던 공회전 해소). ② `DEV_ERP_INTAKE_KNOWLEDGE=1` — 인입 분류 LLM에 과제 전용 source_text_index 지식근거 주입(ENGINE-5 배선, P26-014 3종 index 확인).
- 코드 변경 0(양쪽 모두 기존 env 게이트, `mail_collect.mjs:87-88`·`auto_intake_cycle.mjs:61`). live DB dry-run 사전검증: INBOX 510건 중 111건 이동 예정(P24-049 101·P26-014 10, 승인 룰 4종). 관련 테스트 41/41 green (worker: claude_fable-5).

- Added the missing "pull" piece of the team re-visit loop (owner-approved 2026-07-04): a daily per-member morning brief e-mail — overdue / due-today / blocked items and new proposals suggested to me (unclassified `suggested_assignee_ref`), matched by the existing my-items identity convention. Briefs with no action hook are skipped so the mail never becomes noise; metadata only (task titles, counts, due dates — no mail bodies, no attachments, no LLM text).
- Sending reuses the `guild_hall/gateway/mail_send` capsule as a child process (no SMTP re-implementation; `EMAIL_SEND_ENABLED` injected per-spawn only, credentials never touched) and is registered as an `approved_automation` in MAIL_SEND_STYLE_POLICY_V0. Scheduler: `DEV_ERP_MORNING_BRIEF=1` + `DEV_ERP_MORNING_BRIEF_HHMM` (default 0800), bounded same-day retry (up to 3 attempts, 10-min spacing, run marker records `ok`/`retry_pending`) with per-account sent markers in event_log preventing double sends. New endpoints: `GET /api/brief/preview` (self), `POST /api/admin/brief/send-test` (admin, self-resend for deploy verification).
- Hardening from the pre-commit adversarial review (7 confirmed findings fixed): proposals bucket queries SQL directly (team-wide limit was silently cutting the newest proposals once unclassified backlog crossed 300); sender identity is restricted to admin (owner) mailbox env only — never a teammate's credentials; recipient scope "internal only" is now code-enforced via `DEV_ERP_BRIEF_DOMAIN_ALLOW` (blocked addresses recorded as `morning_brief_error`); brief bodies travel as temp files instead of argv (Windows 32K spawn limit threw synchronously); per-account try/catch isolates one account's failure from the rest; scheduler store calls moved inside try (an unhandled rejection would have killed the whole ERP process); the broken `start-windows.bat` no longer defaults mail-sending on (ops ps1 is the canonical surface). Covered by BRIEF-001/002/003 core tests (worker: claude_fable-5).

### dev-ERP direct LAN HTTPS (self-signed TLS polyglot)

- The server now terminates TLS itself on the same port when `data/tls/server.crt`+`server.key` exist (owner-approved switch from LAN HTTP, 2026-07-04): first-byte sniffing serves TLS and plain HTTP on one port, plain requests get a 301 to `https://` (except `/api/health` for existing monitoring probes and `/dev-erp-ca.crt`, the trust-bootstrap anchor download), session cookies turn `Secure` automatically, and `X-Forwarded-Proto: https` requests pass through — trusted from loopback sources only — so Tailscale Serve coexists. Zero-dependency (`node:https`/`node:net`); disable with `--no-tls`/`DEV_ERP_NO_TLS=1`.
- Hardening from the pre-commit adversarial review (4 confirmed findings fixed): the recommended cert procedure is a one-shot local CA whose key is deleted right after issuing a CA:FALSE leaf; the server refuses to distribute a CA:TRUE live-keyed cert as trust anchor (404 + startup warning, `crypto.X509Certificate`); the startup log prints the anchor's SHA-256 so teammates verify with `certutil -hashfile` before installing a root cert fetched over plaintext; and the test harness pins `DEV_ERP_NO_TLS=1` by default so staged certs or shell TLS env can no longer stall every spawned-server test (TLS-001 opts in explicitly).
- This unblocks browser microphone dictation on LAN access (secure context) and stops passwords/session cookies flowing plaintext; runbook §3.4 documents cert generation (Git-bundled openssl), fingerprint verification, and the one-time per-PC trust install, §6 security notes updated. Covered by TLS-001 core test (https serving, 301, plain health, anchor download+fallback, CA:TRUE block, proxy coexistence, Secure cookie) (worker: claude_fable-5).

### dev-ERP B-5 제안 수신함 v1 + 수신역할(to/cc) 배선

- 분류 필요(미분류) 탭을 제안 수신함으로 승격: 제안 근거 첫 노출("왜 이 제안?" 접이식 — route_reason/assignee_reason), 제안 출처 태그(규칙/메일함), 추천담당 계정 resolve(매칭 시 계정 표기 pre-fill, 미매칭 ⚠ 배지), '내게 제안만' 개인 렌즈, 1클릭 승인 시 `review_status='approved'` 동시 기록.
- 메일↔할일 id 공간 조인: 엔진 산출 `mailcsv:<이력키>` origin 이 메일함 ✓ 승격 표시에 잡히도록 `promotedMailIds` 를 이력키 suffix 조인으로 확장(콜론 포함 이력키 안전).
- 수신역할(to/cc)·메시지ID core_mail 배선(K-5 이어받기): ALTER 2종 + `scan_mail_ledger` 원장 컬럼 소비 + 재스캔 COALESCE 백필 + 메일 상세 받는사람/참조 배지 — "참조로만 받은 메일 ≠ 직접 요청" 구분 가동.
- 자동 정리 가시화: `GET /api/mail/receipts`(read-only 메타 집계) + 트리아지 상단 "자동 정리됨: 스레드 귀속 N·사본 정리 M·할일 아님 K" — 화면에 안 뜨는 메일이 삭제가 아님을 표면화.
- 출처 인간화(내부 접두·해시 숨김, 이력키 클릭→통합검색 점프) + 엔진 이벤트 kind 라벨 6종 등록.
- 검증: 전체 직렬 416/416 green + 실브라우저 워크스루(카드 렌더·토글·점프·승인 approved, 콘솔 에러 0).

### dev-ERP mic: insecure-origin guard and error surfacing

- Fixed the real-world LAN case (`http://<ip>:4300`) where browsers hard-block microphone access on non-secure origins: the mic button now disables itself with an explanatory tooltip (chrome://flags insecure-origin exception per client PC, or Tailscale HTTPS) instead of failing silently, and recognition errors (not-allowed / network / audio-capture) surface as Korean toasts.
- Added the mic secure-context requirement and both enable paths to the LAN deploy runbook (§6), plus lexicon parity keys for the new messages (worker: claude_fable-5).

### dev-ERP chat attachment storage rule (project worksite first)

- Established the chat-attachment storage contract (`docs/architecture/workspace/CHAT_ATTACHMENT_STORAGE_V0.md`, owner decision 2026-07-03): attachments belong to the task's project worksite — `_workspaces/<project>/대화첨부/<task-title-40>/original-name` with a per-folder `첨부_manifest.json` (item binding, sha256, timestamps), short-id suffix only on title collision (thread-title precedent), and the legacy `system/dev-erp/codex-task-attachments` root kept as fallback when the project worksite is not mounted; existing files are not migrated.
- Implemented the rule in the dev-ERP attachment endpoint (project-first resolution, original filenames with `-2` sequencing instead of timestamp/uuid prefixes, sha256 in the response, `storage: project|fallback`), widened localImage validation to accept worksite paths, added `DEV_ERP_ATTACHMENT_WORKSPACES_ROOT` for hermetic tests, and covered project/fallback/manifest/hash branches in core tests (worker: claude_fable-5).

### dev-ERP chat input: mic dictation + file attachments

- Added a shared browser SpeechRecognition (ko-KR) dictation toggle to both chat inputs (ERP chatbot panel and per-task Codex thread panel): recognized text lands in the input field only (no server upload/storage), the tooltip discloses that browser vendors may process the audio, and unsupported browsers get a disabled button instead of a broken flow.
- Extended the Codex task attachment endpoint from images-only to an allowlisted document/data set (pdf, office, hwp/hwpx, csv/json/xml/yaml, zip/7z, msg/eml, step/dxf, 25MB cap): non-image files are stored under the local `_workspaces` attachment root as `localFile` and referenced by local path in the message text so Codex reads them from disk — file payloads are never uploaded to the model API; executables stay blocked (400).
- Updated capabilities (`arbitrary_file: true` + `file_exts`/`max_file_bytes`), event labels (`codex_task_file_attach`), lexicon parity keys for mic labels in both business/fantasy modes, and core API tests for the new attachment policy (worker: claude_fable-5).

### dev-ERP mail thread key migration helpers

- Centralized reply/forward subject normalization in `mail_thread_key.mjs` and required a separator after reply-prefix tokens so Korean words such as "전달사항" are not truncated in fallback thread keys.
- Added legacy fallback thread-key aliases for metadata-only migration, so existing `thread-fallback:*` task refs can still match new blank-thread mail while new keys use the safer canonical normalizer.
- Shared `mailtask:`/`mailcsv:` history-key parsing across pending, ledger, and follow-up paths to avoid partial matches when mail history keys themselves contain colon-number segments.

### dev-ERP follow-up SLA converted-mail visibility

- Changed `followup_scan` so already-converted outbound no-reply mail is no longer hidden before SLA checks. Open converted tasks receive a metadata-only `followup_due` event candidate, while closed converted tasks remain visible as counts without creating duplicate tasks or changing state.

### dev-ERP follow-up SLA due-reminder diagnostics

- Expanded Track B due-reminder parsing to recognize project task ledger aliases such as `기한`, `D-Day`, `D-DAY`, and `due_at`, and added metadata-only reason counters for closed, missing/invalid due, next-action, outside-window, and cursor-seen rows.

### dev-ERP follow-up cursor and matching hardening

- Hardened `followup_scan` cursor handling: corrupt cursor files now stop with a bounded `cursor_load` error instead of being silently treated as empty, and `followup_due` cursor keys advance only after an event sink accepts the metadata event.
- Tightened mail pending project filtering to exact project IDs instead of prefix matches, preventing adjacent project-code collisions during scoped scans.

### dev-ERP 보안 응급 2건 — 감사 위조 차단 + 로그인 백오프

- POST /api/events 의 actor 를 계정이 있는 팀 모드에선 세션 주체로 서버가 강제(타인 명의 이벤트 위조 차단). 계정 0 파일럿 모드는 종전 자기신고 동작 보존.
- 로그인 브루트포스 백오프: IP+아이디별 5회 연속 실패 시 60초 429(too_many_attempts), 성공 시 초기화, `auth_login_failed` 이벤트(meta) 기록. 사내망 전제 인메모리.
- HTTP 통합 테스트 추가(actor 강제·백오프·키 분리·실패 이벤트).

### dev-ERP 메일 수집 요약 파서 수리 — 3주 침묵 fetched:0 표시버그

- parseTeamFetchSummary 가 team_cli `email.fetch.team_mailbox_run.v1` 의 `results[].result.sources[]` 를 읽도록 수정 — 종전엔 존재하지 않는 `r.sources` 를 읽어 실수집량과 무관하게 항상 fetched:0 을 보고했고(수집은 3주간 정상), owner 가 수동 수집 25회로 떠받치는 원인이 됨. 구형 flat 형태 하위호환 유지, `mailboxes_error`/`per_mailbox` 집계 추가로 0건과 계정별 에러를 로그에서 구분.
- 수집 사이클이 계정별 `mailbox_last_fetch_at`/`mailbox_status(ok|error)` 를 갱신 — 관리자 패널 '마지막 수집' 표시가 처음으로 채워짐. 매핑은 email 이 아니라 등록부 token(safeToken(계정 id)) 기준(operator_summary 에 email 없음).
- 생산자 스키마 fixture 계약 테스트 신설(`test/mail_collect_summary.test.mjs`) — 생산자(Python)·소비자(JS)가 계약 테스트 없이 따로 진화해 침묵 어긋난 패턴의 재발 가드.

### dev-ERP E8 핫픽스 — fingerprint 오병합(D1)·limit 순서(D2)

- 제목 prefix 정규식의 구분자 0개 허용(`[:\s\]]*`)을 1개 이상 필수(`+`)로 수정 — "전달사항"→"사항" 식 단어 내부 절단으로 서로 다른 메일이 오병합되어 한쪽이 no_action 영수증으로 비가역 소멸하는 결함(운영 auto-intake 활성화로 심각도 승격). 회귀 테스트 추가.
- auto_intake_cycle 의 limit 슬라이스를 모든 dedup pre-pass(팀 사본·스레드) 이후로 이동 — 사본 그룹이 limit 경계에 걸려 일부만 영수증 없이 잔류하면 다음 run 에서 가짜 followup 이벤트/중복 할일이 생기는 경로 차단. (mail_thread_key 의 동일 정규식 패턴은 키 공간 마이그레이션이 필요해 Codex 패킷으로 이관)

### dev-ERP ENGINE-6 knowledge pipeline automation

- Added `guild_hall/rag/knowledge_pipeline_automation.mjs`, a metadata-only backend runner for weekly knowledge triage reports and post-owner-decision approved build runs.
- Added `weekly-triage-report` and `approved-build-runner` CLI commands with dry-run defaults, explicit `--write` mutation gates, append-only build-event projection, and source-card owner-approval checks before source-text index writes.
- Added fixture coverage for owner-approved index writes, idempotent existing-index skips, candidate source-card approval blockers, and P26-014 six-open-candidate weekly triage reporting.

### dev-ERP auto-intake activation on runtime launchers

- Enabled the mail-to-task auto intake cycle on the runtime launch surfaces (2026-07-03 owner decision): `ops/run-dev-erp-background.ps1` now sets `DEV_ERP_AUTO_INTAKE=1` and `DEV_ERP_INTAKE_LLM=ollama` (classification model inherits `ERP_CHAT_MODEL`), and `start-windows.bat` applies the same defaults only on the runtime 4300 branch so the development checkout (4310) stays off and never auto-writes into dev `_workmeta`.
- Pre-activation verification on the runtime host: WAL-safe DB backup, runtime checkout fast-forwarded to the E8/E4 code, structure dry-run (12 pending, zero writes), and a live 3-mail Ollama classification sample (1 task candidate, 2 not-task with one high-confidence receipt planned) (worker: claude_fable-5).

### dev-ERP ENGINE-4 follow-up SLA

- Added `tools/followup_scan.mjs`, a metadata-only follow-up scanner with dry-run default, `--apply` gate, cursor idempotency, 3-calendar-day no-reply detection, default per-project limit 5, and `data_label=meta` event rows.
- Implemented K-2 owner policy: no-reply candidates are `needs_review`, default assignee is only a `suggested_assignee_ref` based on the original sender, and the target scope is all collected project-routed mail.
- Added due-date reminder events for open tasks with empty next action, direction-signal guarding for Track A, and a default-off auto-intake hook behind `DEV_ERP_INTAKE_FOLLOWUP=1`.
- Added serial node:test coverage for no-reply candidate creation, later inbound suppression, open-thread event-only behavior, cursor deduplication, per-cycle truncation, direction-signal disablement, and auto-intake gating.

### dev-ERP ENGINE-8 team-mail dedup

- Added metadata-only team-mail duplicate grouping for auto intake: Message-ID exact matching is now the primary group key, legacy blank-ID rows fall back to conservative subject/sender/UTC-time-bucket fingerprinting, and non-representative copies become idempotent `duplicate_of` no-action receipts only under `--apply`.
- Added `메일메시지ID` and `수신역할` to the v1 project mail-history ledger as a backward-compatible column expansion across JS gateway writes, Outlook reconcile, and Python mail-fetch history projection; existing 21-column consumers remain header-name compatible.
- Updated haengbogwan metadata context so grouped team-mail copies produce one source event with `copies=<n>`, while task candidates carry `source_group_ref` into `할일_장부`.
- Removed a tracked local absolute Node path from `ops/run-dev-erp-background.ps1` so root path-policy validation remains portable.

### dev-ERP runtime 드리프트 봉합 — 자동수집 배선 canon 편입

- runtime checkout 에만 미커밋 상태로 존재하던 메일 자동수집 배선을 canon 으로 편입: `start-windows.bat` 에 `DEV_ERP_MAIL_COLLECT_SEC=900`(15분)·`DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HIDDEN=1` 기본값(외부 env 로 override 가능)과 creds 안내 주석을 추가해, 재배포/재설치 시 자동수집이 조용히 꺼지는 회귀 경로를 제거.
- 로그인 자동시작용 백그라운드 기동 스크립트 `ops/run-dev-erp-background.ps1` 신규 추가(창 없는 기동, 4300 중복 인스턴스 정리, 자동수집 env 포함, secret 파일 미접촉).
- runtime 로컬수정 14파일 3-way 대조 결과: 위 2건 외 전부 main 에 이미 흡수(byte-equal 7·포함 1)되었거나 main 커밋 계보가 대체(dup_of 기반 본문 폴백이 subject+시각+방향 임시 매칭을 대체 등 5)함을 확인하고 폐기 — 상세는 `_workmeta/system/reports/procedure_capture/20260703_b7_runtime_drift_reconcile_claude_fable-5.md`.

### dev-ERP ENGINE-4 follow-up SLA preflight

- Marked ENGINE-4 blocked after metadata-only preflight: `이벤트유형` aggregates confirm sent/received direction values are available, but K-2 owner policy for no-reply days, target scope, and default assignee is not recorded.
- Recorded the owner question in the slice packet and left the follow-up scanner unimplemented to avoid Codex choosing operational SLA policy by inference.
- Normalized the ENGINE-5 verify command note to a repo-relative `_workmeta` packet path so root path-policy validation stays public-safe.

### dev-ERP ENGINE-5 RAG grounded judge metadata

- Added metadata-only `tools/knowledge_grounding.mjs` for approved source-text index discovery, including nested index field support, project/common scope separation, project-scoped owner-requested P26 RAG eligibility, and a source-text-index-only read boundary.
- Wired auto-intake classification context and ledger candidates to approved knowledge refs: projectContext now receives `승인된 지식:` lines, matching candidates get `근거 확인: <index_id>` and `knowledge:<index_id>` refs, and `auto_intake_run.used_refs` records matched refs.
- Kept common knowledge refs default-off behind `DEV_ERP_INTAKE_KNOWLEDGE_COMMON=1`, avoided guild_hall ledger writes in v1, and added regression coverage for context injection, candidate/event refs, missing workspaces, and body/chunk read exclusion.

### dev-ERP ENGINE-3 capability assignment

- Extended haengbogwan context hint rules into auto intake candidate enrichment: branch rules can now add `required_role`, `required_capability`, and `suggested_assignee_ref` as proposal metadata before task-ledger writing.
- Added `enrichCandidateWithRules` with deterministic keyword matching, review-only work-type fallback replacement, LLM-field preservation, and a hard guard against auto-filling confirmed `assignee_ref`.
- Reported enrichment counts in `auto_intake_cycle` and added regression coverage for towbody-style `dev_team_4` suggestions, no-overwrite behavior, allowed work types, loader compatibility, and UI-visible hint fields.
- Hardened dev-ERP server-spawn readiness tests for slower Windows startup under verify-gate execution without changing production behavior.

### dev-ERP ENGINE-2 completion knowledge feed

- Added `tools/completion_knowledge_feed.mjs`, a deterministic metadata-only feed that turns `completion_log.knowledge` rows into `knowledge_rag_candidate` JSONL entries, with dry-run default, `--apply` writes, cursor-file idempotency, and `knowledge_feed_run` event-log rows.
- Extended the candidate ledger schema to accept `completion_knowledge` rows with bounded `item_ref` and 300-character `knowledge_hint` metadata, while preserving raw payload, secret, and RAG/wiki mutation guards.
- Added a default-off `DEV_ERP_INTAKE_COMPLETION_FEED=1` hook in `auto_intake_cycle` and focused regression coverage for planning, apply, idempotency, missing project folders, and raw-field exclusion.

### dev-ERP ENGINE-8 team-mail dedup preflight

- Marked ENGINE-8 blocked after metadata-only preflight: available local mail ledgers/runtime DB did not contain the required 10 team-copy sample groups needed to set the receive-time bucket without guessing.
- Recorded aggregate evidence and the owner decision needed in the slice packet; no raw mail body, attachment, secret, or protected mail content was copied into public docs.

### dev-ERP ENGINE-1 thread dedup

- Added a metadata-only thread-dedup pre-pass to auto intake: follow-up mails for open task threads are filtered before classification, recorded as idempotent `no_action` receipts, and mirrored to `mail_followup` event rows when applied.
- Added hashed fallback thread keys for sparse mail ledgers and wrote the same fallback through `mail_to_task_ledger`, keeping blank-thread projects deduplicable without storing subject/sender text as the thread key.
- Narrowed outbound-mail skip detection to avoid treating Outlook receive-reconcile events as sent mail, and updated `verify_gate` to run the package test inventory serially in line with the engine master-plan criterion.

### dev-ERP intake algorithm optimization (convergence, context, branch hints)

- Added re-judgment convergence: high-confidence LLM `not_task` verdicts are remembered as `no_action` rows in the existing mail disposition receipt channel, so pending scans stop re-submitting the same mail every cycle; medium/low confidence stays re-judgeable, and deleting a receipt row restores re-judgment. Shared writer extracted to `tools/mail_receipts.mjs` (same headers/idempotency as haengbogwan reference receipts).
- Added deterministic project-context injection for classification: `buildProjectContextLines` assembles per-project branch-rule keywords plus top `project_context` branch summaries (metadata-only, mojibake labels excluded, 900-char cap) and the classify prompt marks the block as reference data that never overrides rules.
- Generalized `haengbogwan_run` branch-hint assignment: per-project owner-curated rules file (`rules/haengbogwan_context_hint_rules.json`, shared with the reading lane) takes precedence, with contract-aligned generic Branch Seeds as fallback — removing hardcoded KVDS labels that polluted other projects' context trunks (worker: claude_fable-5).

### dev-ERP mail-to-task auto intake cycle

- Added `tools/auto_intake_cycle.mjs`, an opt-in unattended cycle that chains pending-mail delta extraction, local metadata-only LLM classification, deterministic task-ledger writes (`--auto-open`), and haengbogwan project-context (trunk) refresh after each mail collection.
- Added `classifyMailForTasks` to the dev-ERP LLM adapter (`src/llm.mjs`): local Ollama JSON-forced classification over mail metadata only (subject/from/mailbox/source id/due hint), with work-type allowlisting, low-confidence quarantine (blank completion criteria blocks auto-open), and injectable backends for tests.
- Wired an env-gated post-collect hook (`DEV_ERP_AUTO_INTAKE=1`) into `src/mail_collect.mjs` that runs the cycle only when new mail arrived, isolated from collection success; added `dev-erp:auto-intake` npm entry, single-host lock, `data/auto_intake_receipts.jsonl` receipts, and `auto_intake_run` event-log rows.
- Documented the automation contract and env matrix in `docs/MAIL_TO_TASK_INTAKE.md`; core-LLM-0% and metadata-only boundaries unchanged (worker: claude_fable-5).

### dev-ERP mail project route backfill

- Added a metadata-only mail project route backfill tool that replays the private mail router against already-ingested `core_mail` rows and moves exact matches out of `P00-000_INBOX` with dry-run/apply modes.
- Added regression coverage for the P24-049 low-frequency SAS subject route and exposed the tool as `mail:project-route-backfill`.
- Wired mail collection to run the same exact-only route backfill after `scan_mail_ledger` when a router binding is available, with env overrides for separated runtime deployments.
- Changed the mail history list so every row keeps its project chip visible, making missed project routing visible during triage.
- Separated mail outer grouping (`project`/`date`) from conversation folding, so project mailboxes can still be viewed as threaded conversations.

### 음성 녹음 보관함 등록 규칙

- Added a metadata-only recording library layer for local voice capture sessions, with global indexes and project route candidate manifests under `_workspaces/system/voice_capture/library/`.
- Added `register-library` to `guild_hall/voice_capture` so existing microphone and voice memo sessions can be registered before project matching or task extraction.
- Documented the storage boundary: raw audio, transcript bodies, and speaker sidecars remain in `_workspaces`; public Git and `_workmeta` receive only rules, tooling, counts, hashes, refs, and review state.

### dev-ERP AX completion metadata hardening

- Verified the completed Codex-backed ERP task lifecycle rows and tightened future completion events so `work_completed` records point to the created `completion_log` row and Codex task thread binding metadata.
- Stored completion knowledge hints as structured JSON candidate notes instead of JSON scalar strings, keeping raw mail bodies and protected payloads out of AX metadata.
- Added completion-time snapshots for `completion_criteria`, `result`, and `log_ref`, and extended completion digest metadata with Codex thread/latest-message pointers for later AX/procedure extraction.

### dev-ERP Codex app-server Windows process cleanup

- Changed the dev-ERP Codex bridge to resolve Windows npm `codex.cmd` shims into the direct Codex app-server process, so timeout cleanup owns the real child process instead of only the wrapper shell.
- Added deterministic Windows process cleanup helpers and regression coverage for direct shutdown, process-tree fallback, and spawn-spec resolution.

### dev-ERP assignee memory capacity management

- Added cumulative assignee-memory capacity controls: per-item text cap, per-ref/project active scope pruning, whitespace `project_id` normalization to `NULL`, and hard character-budget accounting for injected memory.
- Added regression tests for long memory items, scope-local pruning, core+item injection budget bounds, and project-isolation whitespace handling; included `memory_project_isolation.test.mjs` in the default dev-ERP test script.

### dev-ERP mail body storage boundary

- Changed dev-ERP mail storage so `core_mail.body_text` can keep normalized mail body text in the runtime DB, while `_workmeta` mail ledgers, task ledgers, project context reports, raw HTML, raw provider payloads, and attachments stay out of the metadata plane.
- Wired `scan_mail_ledger`, mail UI, and the haengbogwan reading packet to prefer stored `body_text` before preview/subject-only reading; the reading packet also tolerates pre-migration runtime DBs that only have `body_preview`.
- Kept mail list/search APIs preview-sized by default: full normalized `body_text` is returned only through the single-mail detail route after the existing mail access check.
- Updated tests and the verify gate to allow normalized `body_text` but continue rejecting raw/html/attachment-style mail columns.

### 메일함 Gmail/Outlook식 — 본문 줄바꿈 보존 + 읽기 패널 재배치

- owner: 메일 본문이 한 덩어리로 뭉쳐 이상함. 원인: 본문 resolver(mail_body_excerpt htmlToText)가 br·p·div 등 블록 태그를 공백으로 치환→줄바꿈 전멸 + 인라인 태그→공백으로 구두점 앞 군더더기 공백. mailBodyExcerptFromRecord 도 s+→공백으로 재차 줄바꿈 제거.
- 해결: htmlToText 가 블록/줄바꿈 태그→개행, 표 셀→칸공백, 인라인→제거(군더더기 공백 X). 발췌 정규화는 수평공백만 정리하고 줄바꿈/문단 보존. 상세 패널을 메일 클라이언트식 재배치(제목→발신자·시각 한 줄→본문 크게→세부정보 details 접힘), 본문 타이포 가독성(line-height 1.6·max 460). node:test 갱신.
- 기존 메일은 body_preview 비우고 재스캔으로 새 추출 반영(COALESCE라 클리어 필요). lexicon=재시작.


## 2026-06-28

### Revision `working` - dev-ERP AX work-event hooks

- Added a saved implementation slice for ERP start/completion buttons as the canonical metadata-only work lifecycle surface.
- Refactored the dev-ERP item status route so `open -> doing` appends `work_started`, and `non-done -> done` appends `work_completed`, writes `completion_log`, and keeps Codex completion digest as non-blocking auxiliary enrichment.
- Added metadata-only hook status events for Codex digest skips/failures when a Codex conversation exists, without letting Codex decide task completion.

### Revision `working` - dev-ERP haengbogwan reading/run context loop

- Added `haengbogwan_reading_run.mjs`, an end-to-end backend runner that builds a body-aware private mail reading packet, redacts output, produces ledger-compatible task candidates, and separately updates `_workmeta/<project>/project_context`.
- Added `--apply-tasks`, `--apply-context`, `--apply`, and `--write-report` gates so task ledger writes, context memory updates, and redacted run reports remain explicit and auditable.
- Extended the metadata-only `haengbogwan_run.mjs` with `--apply-context`, allowing existing mail/task ledgers to keep the project context graph updated even when the live `core_mail` DB has no project mail rows.
- Added `--apply-knowledge-candidates` and a metadata-only bridge from applied `project_context` updates into `_workmeta/<project>/knowledge_rag_candidate_ledger/events/<YYYY-MM>.jsonl`, keeping wiki/RAG promotion as a later owner-reviewed candidate flow.
- Preserved the boundary: mail body text may be read only in private runtime packets, but stdout, reports, task ledger rows, and project_context receive only redacted metadata.

### Revision `working` - dev-erp haengbogwan knowledge-aware reading judge

- Added a metadata-only knowledge hint pass to the haengbogwan reading judge so project wiki/RAG/source refs can influence `target_object`, `work_types`, `required_role`, and `context_key` before candidate grouping.
- Kept the boundary narrow: the judge uses only knowledge ref/path/core-hit metadata, never wiki bodies, source text, chunks, attachments, or secrets.
- Added synthetic node:test coverage proving knowledge ON can change a SOW mail context key while keeping protected knowledge body sentinels out of output.
- Added project-local `_workmeta/<project>/rules/haengbogwan_context_hint_rules.json` loading through the knowledge overlay so future project context hints can be tuned as metadata instead of hardcoded code edits, with compatibility paths and unsafe-rule error reporting.

### Revision `working` - dev-erp haengbogwan project knowledge overlay

- Added a metadata-only `haengbogwan_project_knowledge_overlay.mjs` resolver so haengbogwan can load project wiki/RAG/source-research/ingest-receipt/core-knowledge refs before judging mail or project context.
- Wired the overlay into both metadata context packets and body-aware reading packets while keeping wiki bodies, source text, RAG chunks, embeddings, NotebookLM answers, raw payloads, attachments, and secrets unloaded.
- Candidate bundles now carry compact `knowledge_context` summaries and `supporting_knowledge_refs` so later ERP review and Codex automation can see which project knowledge refs were available.
- Added node:test coverage for project-filtered knowledge refs, DB knowledge hits, redaction/no-leak sentinels, CLI behavior, and existing reading/context packet integration.

### Revision `working` - guild_hall project context graph design

- Added `PROJECT_CONTEXT_GRAPH_MODEL_V0.md` and `PROJECT_CONTEXT_GRAPH_V0.md` to define the public-safe trunk/branch/leaf/fruit context graph contract and the guild_hall/dev-ERP projection model for haengbogwan project work.
- Fixed the authority split: Codex may judge meaning in a private runtime, while deterministic code owns IDs, deduplication, source refs, graph mutation, task writes, and raw-output guards.
- Documented the weekend MVP path from current `work_context_groups[]` and `context_key` outputs to metadata-only branch/task/fruit graph suggestions.
- Captured owner grill-me defaults for the MVP: milestone/work-branch hybrid axis, graph-first intake, L0-L4 context loading, daily project summary refresh, automatic context/task creation boundaries, actor nodes, fruit close candidates, and the four shared graph views.
- Corrected the storage model so live project context belongs under `_workmeta/<project_code>/project_context/`, while `reports/context_graph/` is only a rebuildable report/debug projection area.

### Revision `working` - dev-erp haengbogwan project_context MVP

- Added `haengbogwan_project_context.mjs`, a metadata-only live-state updater that converts explicit mail/voice/schedule/manual event metadata into `_workmeta/<project_code>/project_context/` sources, nodes, edges, judgments, review queue rows, and summaries.
- Kept graph output as a projection concern: the writer updates `project_context/**` only and does not create `reports/context_graph/**`.
- Added deterministic IDs, idempotent CSV upserts, dry-run-by-default apply gating, raw/secret field skips, unsafe pointer filtering, CSV formula guards, and temp-file replacement for generated CSV ledgers.
- Added node:test coverage for dry-run no-write behavior, apply file creation, idempotent reapply, raw/secret leakage sentinels, due/assignee review queue rows, formula guards, CLI help, and unsafe project rejection.

### Revision `working` - dev-erp haengbogwan reading engine

- Added `haengbogwan_reading_context_packet.mjs` and `haengbogwan_reading_candidate_judge.mjs` as a separate body-aware/private-deep mail reading lane, leaving the existing metadata-only haengbogwan classifier unchanged.
- The reading lane can use local ERP mail previews or runtime event text to classify mail into `mail_reading_reports`, `work_context_groups`, ledger-compatible candidates, and proposal candidates while redacting body text from output.
- Added safeguards for no raw-body persistence, no attachment payload loading, no secret loading, current-message-first due extraction, existing-task detection, team/bot hints, and synthetic node:test coverage with body/attachment leakage sentinels.

### Revision `working` - dev-erp haengbogwan Codex reading overlay

- Added a Codex-automation judgment overlay for the haengbogwan reading lane: Codex can read local mail text in a private request packet and return bounded JSON judgments, while the engine keeps mail keys, deduplication, existing-task detection, and apply authority in code.
- Added validation guards for Codex output hashes, allowed dispositions/work types, confidence thresholds, no raw body/path/attachment/secret fields, no obvious body echo, and existing-task preservation.
- Extended the reading candidate CLI with `--codex-judgments <json>` and added synthetic node:test coverage proving Codex-improved candidates, ignored stale hashes, duplicate prevention, and redacted output.

### Revision `working` - 프로젝트 지식 추출 저장 규칙

- Added `docs/architecture/workspace/PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md` to fix where project knowledge extraction artifacts (metadata source ledger, derived text, extraction manifest) are stored, isolated by `<project_code>`, generalizing `HWP_NORMALIZATION_V0.md` and `COMPANY_COMMON_SOURCE_STORAGE_V0.md` to all document formats (PDF/HWPX/XLSX/DOCX/PPTX).
- Locked storage: derived text payloads under `_workspaces/<project_code>/reference_payloads/knowledge_extract/<batch_id>/derived_text/`; metadata ledger under `_workmeta/<project_code>/reports/source_research/`; company-common under `_workspaces/knowledge/common/company/<source_set_id>/`. Personal `_local` temp folders for knowledge payloads are forbidden.
- Indexed the new doc in `docs/architecture/workspace/README.md`.

## 2026-06-27

### Revision `working` - dev-erp haengbogwan run report

- Added `haengbogwan_run.mjs` plus npm scripts so one metadata-only command can summarize snapshot counts, candidate counts, reference-only skip counts, and optional apply results across selected projects.
- Updated haengbogwan snapshot pending counts to honor metadata-only reference receipts, keeping dashboard-style counts aligned with the apply/context pending queue.
- Added a ranked `triage_queue` to the run report so overdue, blocked, unclassified, missing-owner, and waiting task rows can be attacked from the top.
- Added metadata-only task decision receipts for snoozing known work, and taught the run report to remove active snoozes from the current triage queue.
- Added node:test coverage for the single-run dry-run/apply path, receipt unblocking, and snapshot receipt exclusion.

### Revision `working` - dev-erp haengbogwan metadata classifier

- Added a deterministic metadata-only classifier to `haengbogwan_candidate_judge.mjs` so source-event subjects can produce conservative ledger work types instead of flooding every candidate as `review`.
- Reference/FYI/share-only subjects are skipped before ledger candidate output unless an action signal or due hint is present; generated candidates remain `needs_review` and do not inspect raw mail bodies, attachments, or payloads.
- Added metadata-only reference receipts under `reports/haengbogwan_mail_receipts/mail_receipts.csv` so `--apply` can mark reference-only mail handled without creating noisy tasks or looping in pending scans.
- Added synthetic node:test coverage for subject classification, reference-only skips, action-bearing FYI subjects, durable reference receipts, and schedule/answer/purchase candidate generation.

### Revision `working` - dev-erp haengbogwan role/actor DB projection enrichment

- Added optional `--db <dev-erp.db>` enrichment to haengbogwan context, candidate, and apply tools so role/actor routing metadata can be read from existing dev-ERP projection tables without loading overlay source documents.
- Context packets now expose bounded `role_overlay` and `actor_overlay` metadata arrays only when a DB is provided; the no-DB path keeps role/actor/memory not-loaded notes.
- Candidate generation keeps mail review tasks in `needs_review`, leaves final assignee unset, and uses role/actor projection matches only for low-confidence `suggested_assignee_ref` plus supporting actor metadata.
- The apply wrapper uses `--db` only while building context/candidates and does not forward it to `mail_to_task_ledger.mjs`; reports summarize overlay counts without dumping the actor roster.

### Revision `working` - dev-erp haengbogwan apply/report wrapper

- Added dry-run-by-default `haengbogwan_apply.mjs`, wired through app and root npm scripts, to build metadata-only context/candidate maps and delegate to `mail_to_task_ledger.mjs` via a temporary candidate file.
- The wrapper skips ledger invocation when no candidates exist, forwards mutation flags only when explicitly provided, cleans its OS temp directory after subprocess completion, and reports bounded JSON metadata without raw mail body or attachment payloads.
- Added synthetic node:test coverage for dry-run, apply on temp fixtures, no-candidate skip behavior, and CLI help.

### Revision `working` - dev-erp haengbogwan context/candidate slice

- Added metadata-only `haengbogwan_context_packet.mjs` and deterministic `haengbogwan_candidate_judge.mjs` CLIs, wired through app and root `haengbogwan` npm scripts.
- The context packet converts pending mail ledger metadata into stable source events, capped packet summaries, and explicit raw/body/attachment/role/actor/memory not-loaded boundary notes without reading `_workspaces` payloads.
- The skeleton judge emits `mail_to_task_ledger.mjs`-compatible review candidate maps keyed by mail history key; it does not call an LLM and does not apply ledger mutations.
- Added synthetic node:test coverage for source-event idempotency, metadata-only boundaries, context caps/snapshot shape, candidate JSON compatibility, and CLI help.

### Revision `working` - dev-erp 행보관 snapshot dry-run

- Added a metadata-only `haengbogwan_snapshot.mjs` CLI, wired through `npm run dev-erp:haengbogwan-snapshot`, to summarize pending mail, unclassified tasks, due/overdue work, blocked/waiting work, quick triage, and raw-boundary skips from `_workmeta` ledgers.
- Kept the first 행보관 engine slice deterministic and dry-run: it reads only project mail/task CSV ledgers and does not follow `_workspaces`, raw mail, attachment, secret, absolute-path, or traversal pointers.
- Added synthetic node:test coverage for converted-mail exclusion, due/overdue buckets, blocked/waiting buckets, quick-triage reasons, raw pointer skip reporting, and project traversal rejection.

### Revision `working` - dev-erp actor overlay import projection

- Added a dry-run-by-default actor overlay import CLI for dev-erp, wired through `npm run dev-erp:import-actor-overlay`, so teams, future people, and automation bots can be projected as task-routing actors.
- Added `role_actor`, `role_actor_capability`, and `role_actor_forbidden_action` projection tables plus store listing helpers; bot actors stay approval-bound and outbound-send forbidden actions are validated.
- Added `ACTOR-OVERLAY` node:test coverage for dry-run/apply, role-overlay independence, bot approval guardrails, unknown handoff/team rejection, duplicate capability rejection, and raw/secret/source-ref boundaries, including Windows backslash source refs.

### Revision `working` - dev-erp role overlay import projection

- Added a dry-run-by-default role overlay import CLI for dev-erp, wired through `npm run dev-erp:import-role-overlay`, to load team/project role metadata from `_workspaces/knowledge/common/**` pointers into ERP projection tables.
- Added `role_org_unit`, `role_org_unit_capability`, and `role_project_assignment` projection tables plus store listing helpers; source truth remains outside the public repo and raw/secret-like payload keys are rejected at import-plan time.
- Added `ROLE-OVERLAY` node:test coverage for dry-run/apply, team-only project assignments, backup refs, unknown org rejection, raw payload key rejection, and safe source-ref boundaries, including Windows backslash source refs.

### Revision `working` - voice capture Windows validation compatibility

- Fixed `guild_hall/voice_capture` validation on Windows by using platform-aware shell quoting and cross-platform Node fixture commands in tests.
- Kept the voice capture storage boundary unchanged: raw audio/transcript artifacts remain under `_workspaces`, while `_workmeta` receives only metadata pointers.

### codex service_tier 근본해결 — 실행 직전 config 자동 중립화(self-heal)

- owner: priority/fast/flex tier 오류가 옛날부터 재발. 근본원인=전역 ~/.codex/config.toml 의 service_tier=priority(+default-service-tier). repo 는 이 값을 쓰지 않음(owner/외부 설정) → ERP 만 고쳐선 못 막음. codex 가 config 를 먼저 파싱하다 죽어 -c override(DEV_ERP_CODEX_SERVICE_TIER)도 닿지 못함(그래서 매번 재발).
- 해결: codex_bridge.sanitizeCodexConfigServiceTier — codex 스폰 직전에 ~/.codex/config.toml 의 service_tier/default-service-tier 중 fast/flex 아닌 값을 자동 주석 중립화(idempotent·다른 설정/유효값 보존). priority 가 다시 들어와도 매 실행 self-heal → unknown variant 오류 구조적 불가. node:test CODEX-TIER. codex_bridge 변경=재시작.

### 팀원별 할일 — 활성 팀원 전체 표시(할일 0건도)

- owner: 김민재에게 배정했는데 팀원별 할일에 김민재가 없음. 원인: teamload가 명단을 workload(할일 있는 담당)에서만 만들어 할일 0인 멤버 누락. → roster(_scopes 활성 계정) 전체를 머지해 0건 멤버도 표시(roster 밖 담당·미배정도 보존). app.js만(재시작 불요). 별개로 김민재 배정 활성 할일이 실데이터 0건이라 재배정 필요.


## 2026-06-26

### Revision `working` - local voice capture operational loop

- Extended `guild_hall/voice_capture/` from a capture MVP into a practical local always-on workflow: JSON profile creation, macOS command template generation, preflight checks, session status summaries, metadata-only `_workmeta` review draft emission, and local launchd plist rendering.
- Kept the raw-payload boundary unchanged: audio and transcript bodies stay under `_workspaces/system/voice_capture/**`; `_workmeta` receives only pointer/count/review metadata and formal task ledger promotion remains owner-reviewed.
- Added a session-level `transcript.txt` so original transcription text is easier to review and share through an owner-approved local/shared folder while keeping raw payloads out of public Git and `_workmeta`.
- Added tests for profile loading, preflight behavior, launchd rendering, session status, and metadata-only workmeta draft generation.

### Revision `working` - local voice capture MVP

- Added `guild_hall/voice_capture/` as a public-safe local microphone capture supervisor for the MacBook Air always-on transcription pilot.
- The MVP chunks audio under `_workspaces/system/voice_capture/**`, calls owner-installed recorder/ASR commands such as `ffmpeg` and `whisper.cpp`, writes transcript sidecars, and emits a source-event draft pointer without copying raw audio/transcript into `_workmeta`.
- Added `npm run guild-hall:voice-capture` and `npm run validate:voice-capture`, plus workspace contract documentation for the raw-payload boundary.

## 2026-06-24

### v1.2.0.N - 메일 목록 가독성 — 본문 발췌 표시, 내부 plumbing 숨김

- owner: 메일 목록이 각 행에 메일함/소스해시/원문경로/ID 가 깔려 "너무 진짜 메일 보기 어려워". 기본 가독성 선제 점검 피드백.
- 해결: mailPreviewLine 을 소스/원문/ID → **body_preview 발췌(140자)**로 교체(목록 둘째줄=사람이 읽는 본문). 내부 plumbing은 mailIdentLine 으로 분리해 상세 패널 식별정보(dim)에만. 본문 없으면 빈 줄(깔끔).

### v1.2.0.N - 미분류 메일함 대화 단위 묶음 (같은 일=한 줄)

- owner: 미분류함에 같은 대화가 여러 줄(RE/FW 체인 + 첨부 쪼갬 P.2 등). 완전동일 dedup으로는 못 잡음.
- 해결: 미분류 위젯을 **대화(conversation) 단위로 묶음** — 정규화 제목(RE/FW/전달/회신 + 끝의 부분/버전표시 P.2·2/3·[2] 제거; 1~2자리만이라 연도 2026 오인 방지)으로 한 대화=한 줄(💬N 배지). 분류 시 single_item: 대표 1건만 할일 생성, 대화의 나머지 메일은 프로젝트로 file(인입함에서 함께 빠짐·재출현 없음).
- store.assignMails single_item 옵션 + /api/mail/assign 전달 + mailThreadSubject 부분표시 정규화 강화(메인 thread 묶음도 함께 개선). node:test MAIL-CONV. store·lexicon 변경=재시작.

### v1.2.0.N - 메일 본문 발췌(미리보기) resolver — 런타임 싱크에서 채움

- owner: ERP 메일 상세 패널에 본문이 항상 '본문 미수집'. 진단: connector(hiworks/gmail)는 본문을 추출해 런타임 이벤트 싱크(`guild_hall/state/gateway/mailbox/**`, gitignored)에 이미 저장하지만, ERP 인입 경로(`team_cli → 메일_이력.csv 원장(본문 없음) → scan_mail_ledger → ingestMail`)가 원장만 읽어 body_preview 가 항상 빈 값.
- 설계 결정: 직전 가정(connector 가 body_preview 를 '원장에 emit')은 폐기. 원장 CSV·후보 큐는 본문이 절대 들어가면 안 되는 tested 불변식(`test_mail_candidate_queue`: 본문/raw/첨부명 금지)이라, 발췌를 원장에 넣지 않는다. 대신 scan 이 **런타임 이벤트 싱크에서만** 발췌를 읽어 `core_mail.body_preview`(런타임 DB)에만 채운다. 원문 전체·첨부는 여전히 미저장.
- 구현: `guild_hall/gateway/mail_candidate.mjs` 에 본문 resolver 추가(`mailBodyExcerptFromRecord`·`loadMailBodyExcerptIndex`·`readMailBodyPreview` — text 우선·html→text 폴백·공백정리·2000자 컷·싱크 경로 밖 읽기 거부·event_file 캐시). `scan_mail_ledger.mjs --apply` 가 원장의 `파일링패킷참조`(후보 큐 포인터) → `source_event.event_file/event_id` 로 싱크를 찾아 발췌를 resolve, 미수집이면 null(상세 패널 '본문 미수집' 유지). connector·Python·원장 스키마 변경 0.
- 검증: gateway node:test 3건 추가(resolver 단위 — text/html/캐시/경로안전/null-safe). end-to-end: 실제 scan_mail_ledger --apply 로 싱크 발췌가 body_preview 에 착지 확인. Python mail_fetch 60건·gateway index 58건 그대로 green.
- 배포: dev→push→runtime pull→:4300 재시작 후 재수집(creds 보유 환경). 기존 메일 소급 본문은 싱크 JSONL 이 남아있는 범위에서 재스캔 시 채워짐.

### v1.2.0.N - 다중수신 메일 중복 합침(dedup) + 본문 미수집 안내

- owner: 같은 메일을 전달할 때 팀원이 참조에 있어 팀원 mailbox마다 개별 인입 → 미분류함에 같은 메일이 3~6건 중복. 진단: 같은 (제목·시각·방향)이 mailbox별 별도 id로 N행(실데이터 확인, 예: 06-24 일정변경 3행).
- 해결: ingestMail 다중수신 dedup — canonical 1건만 노출, 나머지는 dup_of+hidden 으로 보존(삭제 X·되돌리기 가능). 기존 _mailWhere 의 hidden 필터가 모든 목록에서 자동 제외(질의 수정 0). canonical 에 수신자 수 배지(recipients). 기존 828건은 dedupMailRetro 1회 정리(owner mailbox 우선 canonical). node:test MAIL-DEDUP.
- 본문: body_preview 0/828(수집기가 본문 미전달)이라 어디에도 안 보였음 → 상세 패널에 본문 미수집 안내 추가(수집기 연동 후 표시, 지금은 원문 메일함). 실제 본문 채우기는 connector 가 body_preview 를 원장에 emit 해야(owner-env·후속).
- store·lexicon 변경=재시작.

### Revision `working` - long-thread handoff/PC role 동기화

- `long_thread_handoff_v0` workflow 와 `soulforge-long-thread-handoff` Codex skill 의 `NIGHT_WORK_HANDOFF` 정책을 기본 closeout 산출물이 아니라 unresolved forward-state 가 context/PC/controller 경계를 넘어야 할 때만 쓰는 조건부 checkpoint 로 맞췄다.
- `MULTI_PC_DEVELOPMENT_V0.md` 와 bootstrap prompt 들을 현재 4대 PC 운용 구조에 맞춰 정리했다: 회사 작업용 PC 는 `work_pc`, 고성능 PC 는 `tool_pc` 이면서 별도 identity 의 지정 `always_on_node` 가 될 수 있고, 맥미니는 fallback/mirror/개인 서버 lane, 맥북에어는 이동/수집/portable dev lane 으로 해석한다.
- 같은 물리 PC 에서 tool/dev/always-on 역할을 겸하더라도 clone/worktree 또는 local `node_identity.yaml` 로 역할을 분리하고, `gateway_fetch_primary` / `night_watch_active` 는 owner 가 지정한 `always_on_node` 한 대만 갖도록 명시했다.

### Revision `working` - 로컬 개인지침 붙여넣기 본문 저장

- Added `docs/architecture/bootstrap/LOCAL_AGENT_PERSONAL_INSTRUCTIONS_V0.md` as a public-safe paste block for Codex/Claude personal instructions on other PCs.
- Linked the new bootstrap document from the bootstrap README and kept `AGENTS.md` as the single canonical Soulforge instruction source.

### Revision `working` - NIGHT_WORK_HANDOFF 조건부 연속성 규칙으로 축소

- `AGENTS.md` 와 boot digest 의 handoff 규칙을 "페이즈/윈도우 종료마다 필수"에서 "git/activity 에 남지 않는 forward-state 를 context 경계 너머로 넘길 때 필수"로 좁혔다.
- 깨끗한 슬라이스 경계는 commit+push+self-verify 로 닫고, 자율 루프 종료/compact/clear 전, 비-Codex 모델에서 Codex 로 인계, primary controller 변경, owner 요청 시에는 compact `NIGHT_WORK_HANDOFF` 체크포인트를 남기도록 정리했다.

### v1.2.0.N - 메모리 주입 맥락 관련도(retrieve 설계 완성)

- 메모리 재설계 마무리: 시작/매 턴 주입 시 server 가 그 일의 맥락(제목·프로젝트·작업유형)을 memoryForInjection 에 전달 → 누적 항목을 **그 일 관련도 우선**으로 retrieve(관련도 0.6·recency 0.2·salience 0.2). 맥락 없으면 종전대로 recency+salience.
- 관련도는 overlap-by-context(_memRel, 짧은 맥락 질의 적합), 게이트 dedup 은 Jaccard(_memSim) — 용도별 분리. node:test MEM-005(관련 항목이 최신+고salience 무관 항목을 앞섬) 추가. store·server 변경=재시작.

### v1.2.0.N - AI 제안 착지면 file-of-record(ai_proposal_ledger)

- 기초감사 후속: ai_proposal(P-4 키스톤 — AI/규칙 산출 pending 착지면, 사람 approve 후 도메인 쓰기)이 DB에만 있어 이식·백업 불가였음. **ai_proposal_ledger.mjs** — system-wide _workmeta/system/ai_proposal_ledger/ai_proposal_ledger.csv export↔apply. id(TEXT PK) 중복 skip=멱등. JSON payload 내 개행·쉼표·따옴표 무손실 round-trip 검증.
- npm: dev-erp:proposal-export/apply. 도구라 재시작 불요. 운영본 1건. **DB-only 내구기록 sweep 사실상 완료**(메모리·완료기록·AI제안). codex_thread(대화)는 원문미저장 정책상 요약수준 후속.

### v1.2.0.N - 내 메모리 항목 관리 UI(투명성·감시경계)

- 기초감사 후속(메모리 투명성): "내 메모리" 오버레이에 **누적 메모리 항목 보기/삭제(보관)/직접 추가** — 담당자별로 AI가 무엇을 기억하는지 본인이 확인·정리. 감시경계(본인 것만).
- GET /api/me/memory 가 items 동반 반환 + POST /api/me/memory/item(op add/delete, 본인 스코프). 삭제=soft archive(주입 제외·보존). store 메서드는 MEM 테스트 커버. lexicon mem_* 키 + CSS. server 변경=재시작.

### v1.2.0.N - 완료기록 file-of-record(completion_ledger) — MED-1

- 기초감사 MED-1: completion_log(담당자별 처리량·토큰·지식의 내구 기록)가 DB에만 있어 이식·백업 불가였음. **completion_ledger.mjs** 추가 — per-project `_workmeta/<code>/reports/완료_장부/완료_장부.csv`(작업_장부/할일_장부 가족, 무프로젝트는 _general)로 export↔apply. item_id+created_at 중복 skip=멱등. 무손실·특수문자·null·멱등 round-trip 검증.
- npm: dev-erp:completion-export/apply. 도구라 재시작 불요. (운영본 완료기록 4건 존재 — export 시 파일로 materialize; 정기 백업/스케줄러에 편입 권장.)
- 남은 DB-only: ai_proposal·codex_thread(요약수준·원문미저장 정책 고려한 후속).

### v1.2.0.N - 담당자 메모리 자료구조 재설계(blob→누적 항목층·게이트·retrieve)

- 기초감사 HIGH-1 후속 — 자유텍스트 blob의 "Context Bloat"(Letta/Anthropic) 해소. core blob(본인 작성·항상 주입) 유지 + 누적 학습은 **assignee_memory_item** 항목층으로 분리.
- **쓰기 게이트(Mem0)**: append-blob 폐기 → addMemoryItem 이 유사 항목과 ADD/UPDATE/NOOP(Jaccard) 결정 → 중복·모순·부풀림 방지. appendAssigneeMemory(완료지식·mem-add)가 자동으로 항목 게이트 사용.
- **주입 retrieve(Letta/Anthropic)**: memoryForInjection = core(예산 50% cap) + 누적항목 중 recency+salience(+맥락 관련도) 상위만 채움(절단 아님). 외부패키지 0(로컬 토큰/Jaccard).
- **파일 정본 일관**: memory_ledger 가 items도 memory_items.csv 로 왕복(항목층이 다시 DB-only 되지 않게). 무손실·멱등·특수문자 round-trip 검증.
- node:test MEM-001~004 추가. 운영본 메모리 0행이라 마이그레이션 위험 없음. store 변경=재시작.

### v1.2.0.N - 기초 전수검사 + 담당자 메모리 파일 정본화(memory_ledger)

- **기초 전수검사**(7에이전트 워크플로): 평결 설계B+/실집행C. 정본 철학(파일정본+DB ingest소비자)·검증능력은 2026 best practice 정렬. 갭=①DB전용 엔티티(담당자 메모리 등)②검사 미작동(state ~47일 stale·Windows 스케줄러 부재)③placement 정기검증 부재. 카파시/Letta/Mem0/Anthropic 연구 반영 권고.
- **memory_ledger.mjs**(HIGH-1 직접 해소): assignee_memory DB↔ round-trip. owner 우려("메모리가 DB에만 떠 있다") 해소 — 파일이 정본, DB는 ingest 소비자. export/apply, 무손실·멱등 round-trip 검증(운영본 VACUUM INTO 복사본). npm: dev-erp:memory-export/apply. 도구라 재시작 불요.
- 후속(메모리 자료구조 재설계 blob→항목·retrieve·ADD/UPDATE/DELETE)·Win 스케줄러(owner 승인)·placement-audit(Codex)·canon 경계(owner 결정)는 분리.


### v1.2.0.N - Gmail식 메일 대화 묶음 (같은 일이 여러 메일로 흩어지지 않게)

- owner: 같은 일이 참조·전달로 5~6개 메일로 늘어남 → **정규화 제목(mailThreadSubject, RE/FW/전달/회신 제거)으로 대화 묶음**. 메일함 기본 그룹을 thread로, **대화 1행(접힘)+💬개수+최신 발신자·시각**, 클릭하면 그 아래 자식 메일 펼침(재렌더 없이·펼친 상태 유지). 단일 메일은 그냥 행.
- mailRow extraCls 인자 + thread 브랜치 접기 렌더 + .thread-head 토글 핸들러 + CSS. 정규화 제목 신호만 사용(thread_id 없음 — 정밀화는 수집기가 References/Message-ID 채우면, 후속). client+lexicon(재시작). syntax·parity 통과.

### Revision `working` - doctor checks Codex runtime skill and Stop hooks

- Extended `guild-hall:doctor` so bootstrap readiness now checks the actual local Codex runtime for the required `conversation-rule-hardening` skill and the two Soulforge Stop hook guards.
- Added checklist entries for `knowledge_trigger_stop_guard.mjs` and `rule_hardening_stop_guard.mjs`, with doctor summary counters and fix hints when the local `~/.codex` setup is missing them.
- Documented the new required runtime checks in the bootstrap doctor contract and doctor README.

## 2026-06-23

### v1.2.0.N - 담당자 메모리 관리 1단계: 저장≠주입 (컨텍스트 오염 방지)

- owner 우려(메모리가 매 턴 통째로 Codex 256k에 주입→오염): 사실 4000자는 ~0.5%로 넘침은 아니나, '항상 통째 주입'은 신호 품질 문제. → **저장과 주입 분리.**
- store.memoryForInjection(ref, budget=1800): 저장이 커도 주입은 ~1800자 바운드 — **머리(내 규칙)+꼬리(최신 학습) 보존, 중간 생략**(완료→메모리 루프 안 깨짐). 결정적(LLM 전, 1단계). 저장 상한 4000→8000(풍부하게).
- codex 턴(시작·매 메시지)이 getAssigneeMemory→memoryForInjection 사용. 인메모리 E2E PASS(짧음 그대로·긴 건 1812 바운드 머리+꼬리·저장 8000).
- 다음 단계(점진): 중복제거 + 완료/임계치 시 LLM 압축(consolidation, 기존 ollama 재사용). 외부 Hermes는 이 규모/헌장(tool-agnostic)엔 과해 보류 — owner가 구체 시스템 지정 시 재평가.

### v1.2.0.N - 완료→메모리 루프 닫기 (#6 2단계: 지식 후보를 담당자 메모리에 추가)

- 자기개선 루프 완성: 완료 훅의 지식 후보(💡)를 '승인 대기' 카드의 **+ 메모리** 버튼 한 클릭으로 그 담당자 메모리에 추가 → 다음 시작 주입에 반영.
- store.appendAssigneeMemory(누적·최신우선 4000자) + POST /api/memory/append(관리자=누구나·팀원=본인만, 남의 메모리 편집 금지). 완료 digest payload에 assignee_ref 추가.
- 인메모리 E2E PASS(누적·주입 반영·빈텍스트 거부·권한). 서버 변경(재시작). 루프: 시작 주입 → 작업 → 완료 지식 → 메모리 추가 → 다음 시작.

### v1.2.0.N - 담당자별 메모리 (#6 1단계, 메모리만 — owner 결정)

- owner: work_type 스킬 주입은 보류, **담당자별 메모리부터**. 시작 시 그 담당자 메모리를 Codex 스레드에 주입.
- `assignee_memory` 테이블(ref=담당자 라벨·content) + store get/set(4000자 상한). 상단 **'내 메모리'** 버튼 → 편집기(GET/POST /api/me/memory, 본인 것만). 평가 아님(감시경계).
- 주입: codex 턴(시작·매 메시지)에서 item.assignee_memory 보강 → buildTaskDeveloperInstructions가 '담당자 업무 메모리/규칙' 블록으로. 사람마다 다른 규칙을 시작부터 들고 감.
- 인메모리 E2E PASS(저장·조회·dev주입·없으면 미주입·절단). 스키마+서버 변경(재시작). work_type→스킬 주입은 다음(스킬 정의되면).

### v1.2.0.N - 메일 본문 발췌 표시 토대 (owner: '메일 내용 보이게')

- owner 결정: '본문 미저장'을 **발췌(미리보기) 수준으로 완화**(원문 전체·첨부는 여전히 미저장). core_mail에 `body_preview` 컬럼(마이그레이션) + upsertMail/ingestMail이 발췌(공백정리·2000자 절단·COALESCE 보존) 저장 + 메일 상세에 '본문 발췌' 블록 표시.
- 목록 SELECT가 `m.*`라 자동 반환. 인메모리 E2E PASS(저장·절단·목록반환·재수집유지).
- **남은 한 단계(다음)**: 수집 파이프라인(Python mail_fetch → 원장 CSV → scan_mail_ledger)이 본문 발췌를 ingestMail까지 넘기게 해야 실제로 채워짐. 현재 원장 CSV는 메타 전용이라 발췌 컬럼 추가 필요. **기존 818건은 본문 미보유**(수집 때 미저장+서버 purge 가능) — 신규 수집분부터 표시.

### v1.2.0.N - 버전 4세그먼트 자동 증가 (owner: '버전이 그대로네')

- ERP 버전을 `MAJOR.MINOR.PATCH.BUILD` 4세그먼트로. **BUILD = dev-erp 경로 git 커밋수(자동)** → 매 배포(커밋)마다 자동 +1, 수동 깜빡임 없이 항상 증가. /api/version의 erp.release에 노출(예: v1.2.0.373).
- release v1.1.0 → **v1.2.0**(이번 세션 기능 묶음=MINOR 1.2). 앞으로 기능 묶음=PATCH 수동, 매 배포=BUILD 자동. 이 '## 2026-06-23' 아래 항목들이 각 배포의 내역.
- (참고) 메일 본문 표시 요청: core_mail·메일이력 CSV 모두 설계상 **메타데이터 전용**(본문 미저장), 본문은 어디에도 저장 안 됨 → 별도 보고로 정책/방식 결정 요청.

### Revision `working` - 도그푸딩 ④⑥: 연속 분류 과제 sticky + 막힌 일 차단사유 노출

- **④ (메일실무)**: 메일 분류 과제 드롭다운이 '분류하고 다음'마다 첫 옵션으로 리셋되던 걸 → doAssign에서 `state.lastAssignProject` 기억, assignOpts가 그 과제를 selected. 같은 과제로 연속 들어오는 메일을 매번 재선택 안 해도 됨(client-only).

### Revision `working` - 도그푸딩 ⑥: 막힌 일 차단사유를 콕핏(먼저 할 일)에 노출

- 관리자 핵심 업무(막힌 일 풀기)인데 `bottleneck_reason`이 이벤트 로그에만 있어 매번 드릴다운해야 무엇을 풀지 알았음.
- nudges()에 최신 bottleneck_reason 상관 서브쿼리 추가 → blocked 행에 `block_reason` 동봉. '먼저 할 일' 위젯이 막힌 일 제목 옆에 `· 사유` 표시.
- 차단사유는 blocked 전환 시 기존 UI(app.js:4035 prompt)로 이미 입력됨. store-only(재시작). 인메모리 E2E PASS(blocked=사유 노출·open=없음). node:test 235/0.

### Revision `working` - 페르소나 도그푸딩 quick-win 2건 (담당 배정 인라인 + 미배정 위젯 활성 전체)

- 3페르소나(신규·메일실무·관리자) 도그푸딩 워크플로(마찰 14건→우선순위 6) 중 검증된 quick-win:
- **#1 quickEdit 담당자 배정 select**: 할일 클릭 팝업에 '담당 변경'(나/미배정/팀원) 추가 → 신규는 '내가 잡기', 관리자는 그 자리서 재배정. 기존 /api/items/assign 재사용(새 API 0). 그동안 잡는 컨트롤이 드래그뿐이라 터치/드래그 모르면 시작 불가하던 사각지대 해소.
- **#5 미배정 위젯 활성 전체**: status=open만 보던 걸 서버 unassigned 전용뷰(/api/items?unassigned=1)+done 제외로 → 시작(doing)했거나 막힌(blocked) '주인 없는' 일도 노출.
- 둘 다 기존 엔드포인트/뷰 재사용, client+lexicon만(재시작). 인메모리 E2E PASS(미배정 doing/blocked 노출·잡기 후 제거). 메뉴 잔여(본문읽기 L·위젯과제배정 M·sticky·차단사유)는 owner 선택지로 보고.

### Revision `working` - 리뷰 보류건 #10 수정 + #11 오판 확인(되돌림)

- **#10 (med, 수정)**: assignMails가 이미 승격된(활성) 메일을 재분배할 때 promoteMail이 already_promoted를 흡수해 기존 항목 담당·상태 미갱신 + 거짓 성공 토스트였음 → already_promoted면 **기존 활성 항목에 고른 담당 적용**(미분류면 open 가시화), 완료/보관 항목은 `already_done`로 surfacing(재분배 무효). 인메모리 E2E PASS.
- **#11 (오판, 되돌림)**: 리뷰는 promoteMail/setMailProject의 status-무관 dedup이 새 할일 생성을 막는다고 봤으나, `core_item(origin_mail_id)`에 **UNIQUE 인덱스(store.mjs:812)**가 있어 메일당 항목 1개가 설계 불변식 — 재승격은 원래 불가하고 createItem이 UNIQUE 백스톱으로 already_promoted 수렴. status 필터 추가는 무의미(실패 INSERT 경유)라 setMailProject/promoteMail 원복.
- **#16 (보류 유지)**: 분석 canonical 집계는 운영본이 표시명 일관 사용+canonical 설계 필요라 보류.
- store.mjs만 변경(재시작). node:test 235/0.

### Revision `working` - 적대적 리뷰 후속: 최근 6슬라이스 확정 버그 8건 수정

- 자율 리뷰 워크플로(24에이전트)가 확정 16건 중 HIGH·명확건 수정:
- **완료 로그 정확도**: 완료 되돌리기 시 마지막 completion_log 행 회수(setItemStatus revert) → 재완료 중복·reverted 완료 카운트·async digest stale 동시 해소.
- **분석 스코프(감시경계)**: /api/completions가 단일 식별자[0] 매칭(본인 누락+타인 누수+빈값 fail-open)이던 걸 **식별자 배열 IN(scopedInClause, 빈배열 1=0 fail-closed)**로. completionStats/completionLog assignee_any 시그니처.
- **메일/항목 공용 큐**: canAccessMail이 mailbox 메타 없는 수집 받은함 메일을 팀원 전원 403으로 막던 것(분배·승격 차단) → 공용 큐 통과. canAccessItem도 미배정 활성 할일=공용(아무나 먼저).
- **우선순위 ⭐ UX**: 메인 할일 행에 ⭐ 마커 누락 보완(위젯만 있었음). item_priority 활동 이벤트 한글화(eventDesc). nudges 주석 5단계로 정정.
- **fixture**: 시드의 가짜 urgency='high'(1/4) 제거 → 우선은 사람 지정으로만(분석·정렬·nudges 오염 방지).
- **분석 위젯**: stats 비어도 log 있으면 '최근 완료' 표시(빈판정을 stats·log 함께).
- 인메모리 E2E PASS(되돌리기 회수·재완료 비중복·스코프 IN·fail-closed). 보류(보고): #8 open격리(설계상)·#10 already_promoted·#11 setMailProject보관·#16 canonical 집계.

### Revision `working` - 분석 위젯에 '최근 완료'(할일 로그) 기록 추가

- analytics_w가 /api/completions의 stats만 쓰던 걸 확장 — **log(최근 완료 기록)**도 표시: 완료일·제목·담당자·요약(있으면).
- owner의 '할일 로그에 기록' 요구를 가시화(데이터는 completion_log에 이미 쌓임). 관리자=전체·그외 본인. app.js+lexicon(an_recent_done) 변경(재시작).
- 참고: #5b 토큰 계측·스레드 wrap-up은 codex_bridge(turn/completed usage) 의존 — 헤드리스 검증 불가라 owner 라이브 확인 필요 영역으로 분리.

### Revision `working` - #4 담당자별 처리량 분석 위젯 (analytics_w) + 과거 완료 백필

- 완료 로그 backbone(2b561b82) 위에 **담당자별 처리량 분석 위젯** 구현. 예약돼 있던 analytics_w 슬롯을 ready로.
- /api/completions 집계 소비 → 담당자별 **완료 수 + 업무종류 분해**(최근 30일, WORK_TYPE_LABELS 한글). 관리자=전체, 그 외=본인(감시경계).
- **백필**: 훅 도입 전 완료 항목을 completion_log에 1회 멱등 보강(backfillCompletionLog, item_id 미기록분만) → 기동 시 호출. 위젯이 과거 이력도 즉시 표시.
- WIDGET_PLAN analytics_w ready·DEFAULT_DASH 하단 추가(신규 레이아웃). 기존 사용자는 드로어 '팀' 그룹에서 추가. lexicon an_*(양 모드).
- store(백필)·server(기동 호출)·app.js·lexicon 변경(재시작). 인메모리 E2E PASS(백필 3·멱등·담당자별 집계). 토큰은 #5b 계측 후.

### Revision `working` - 우선순위 ⭐ (urgency 재사용) — '먼저 할 일'을 명시적 우선으로

- owner Q1 결정=nudges를 우선순위로 교체. **미사용 `urgency` 필드 재사용**(운영본 전건 normal·UI 미노출)→마이그레이션 0.
- ⭐=urgency 'high'. 인라인 편집기에 **⭐ 우선 / 우선 해제** 토글(POST /api/items/priority). 우선 항목은 모든 목록 **최상단 정렬**(items ORDER BY urgency<>'high' 먼저) + itemMiniRow ⭐ 마커.
- '먼저 할 일'(nudges) 사유에 **'우선'(금색 배지)** 추가. 순위=연체>막힘>**우선**>오늘마감>일반(연체·막힘 같은 시스템 긴급은 ⭐ 위, ⭐는 오늘마감·일반 위).
- store: setItemUrgency(검증·이벤트). server: /api/items/priority(본인 접근만). lexicon: prio_label/set/unset(양 모드). css: .prio-star/.badge.gold.
- store·server·lexicon 변경(재시작). 인메모리 E2E PASS(설정→상단정렬→nudges 순위·잘못된값 거부). P-6 nudges 테스트 보존(설계로 overdue 우선 유지).

### Revision `working` - 완료 훅 허브 1단계: 완료 로그(할일 로그) backbone

- owner 결정(Q2)=완료 훅을 허브로 먼저. 1단계=모든 완료를 구조화해 남기는 **completion_log** 테이블 + 기록.
- done 전환 시(대화 유무 무관) `logCompletion`로 1행 기록: item·title·assignee_ref·work_type·project·done_at·completed_by.
  Codex 대화가 있으면 기존 S6 요약이 `updateCompletionLog`로 summary·knowledge 보강(비차단). item 재완료·삭제와 무관한 내구 기록.
- store: logCompletion/updateCompletionLog/completionStats(담당자×종류×일자)/completionLog. server: GET /api/completions(관리자=전체, 그 외=본인만·감시경계).
- 이게 #4 담당자별 처리량·종류 분석 + #6 지식/메모리의 데이터 backbone. 다음 슬라이스=분석 위젯·스레드 wrap-up·토큰 계측.
- 스키마(신규 테이블 IF NOT EXISTS)+서버 변경(재시작). 인메모리 E2E PASS, node:test 234(+서버스폰 1 부하 flaky, 격리 통과).

### Revision `working` - 팀원별 할일 위젯: 행 클릭 시 그 사람 할일 제목 인라인 펼침

- owner "팀원별로 어떤 할일이 있는지 제목도 보고싶다(별도 위젯은 너무 큼)" → teamload 위젯 행 클릭 시 그 팀원(또는
  미배정)의 남은 항목 제목을 인라인으로 펼침/접기(셰브론 표시). 제목 행은 `wrow`+`data-item`이라 기존 대시보드 위임
  클릭으로 그대로 열림(인라인 빠른편집). 남은 집합=/api/items에서 done 제외(open_cnt와 동일). 최대 12건 표시.
- 행 클릭 동작이 기존 '드릴인(보기범위 전환)'에서 '인라인 펼침'으로 바뀜. 드롭 대상(팀원행 배정)·셰브론 호버 유지.
- client-only(app.js·css) 무중단. 결정적 테스트(lexicon·DnD·refs) 통과.

### Revision `working` - 팀원별 할일 위젯 행을 직접 드롭 대상으로 (메일을 팀원 위에 바로 배정)

- 그동안 위젯 위에 직접 드롭되는 건 '내 할일' 위젯 하나뿐 → 팀원/미배정으로 보내려면 드래그 시 뜨는 레인 바를
  거쳐야 했음(owner가 "어느 위젯으로 들어가나?" 질문으로 드러난 갭). → '팀원별 할일' 위젯의 각 팀원 행 + (미배정)
  행을 dndWireDrop 드롭존으로 등록. 미분류 메일함의 메일을 차오름 행에 바로 떨어뜨리면 차오름의 열린 할일로 배정.
- 핸들러(dndHandleDrop)는 담당자/미배정 처리 기존 그대로 재사용. 행은 outline이 잘 안 먹어 inset box-shadow+cursor:copy로
  호버 피드백. 정적(무중단). 결정적 테스트 234 통과(server-spawn 1건은 부하 타임아웃 flaky, 빈 DB health 직접 확인 정상).

### Revision `working` - 팀원별 위젯 '(미배정)' 행도 클릭 → 미배정 할일 뷰

- 팀원별 위젯에서 팀원 행만 클릭되고 '(미배정)' 행은 안 되던 일관성 갭 → '(미배정)' 행 클릭 시 미배정 할일 뷰
  (statusFilter=unassigned, 팀 전체)로 이동. 정적(무중단). node:test 235/0.

### Revision `working` - 메일 분배=열린 할일(위젯에 보임) + 미배정 드롭/옵션 + 미배정 할일 개명

- **핵심 버그**: 메일을 팀원/미배정으로 분배해도 위젯에 안 뜨던 원인 = 승격 항목이 work_type 없어 status='unclassified'
  (팀원별·미배정 위젯은 open만 셈). → 분배 시 open 으로 생성(assignMails open 플래그, /api/mail/assign·doAssign·
  인박스 드롭다운 모두 open:true). 이제 분배 즉시 해당 위젯에 보임.
- **미배정으로 이동**: 그동안 드롭 대상이 '나'뿐 → 미배정 레인 추가(claim-drop 바, 팀원 없어도 항상) + 미분류 메일함
  위젯 드롭다운에 '미배정' 옵션. dndHandleDrop 미배정 처리(승격→open, 담당 없이). 미배정 할일 위젯에 뜸.
- **개명**: '미배정 작업' → '미배정 할일'.
- 서버 변경(재시작). 인메모리 E2E(open·담당·위젯 가시성) PASS. node:test 235/0.

### Revision `working` - 팀원별 위젯(대화중·클릭 드릴인) + 미분류 위젯 행별 팀원 배정

- **팀원별 할일 위젯(teamload)**: 컬럼을 이름·남은·대화·연체로 — '대화'는 그 팀원의 codex 대화 진행 중인 일 수(💬,
  workload.chat_cnt 신설: 담당자별 codex_thread_binding 있는 열린 일). 팀원 행 클릭 → 그 팀원 할 일로 드릴인(보기범위 전환).
- **미분류 메일함 위젯 행별 팀원 배정(권장)**: 메일 행마다 '팀원에게…' 드롭다운 → 고르면 그 메일을 일반업무로 옮기고
  그 팀원 할 일로 생성(받은함에서 빠짐), 위젯 자동 갱신. 드래그 없이 320건을 팀원별로 분배.
- 서버 변경(store.workload, 재시작). 인메모리 E2E(chat_cnt·담당 배정) PASS. node:test 235/0.

### Revision `working` - 받은함 더보기 + 미배정/팀부하 위젯 + 분류 시 담당 지정

- **미분류 메일함 위젯**: 8 → 30건 표시(위젯 내부 스크롤), 새로고침 시 분류돼 빠진 만큼 다음 메일로 재충전.
- **기본 대시보드에 '미배정 작업' + '팀 부하(팀원별)' 위젯 추가** — 관리자가 주인 없는 일과 팀원별 부하를 홈에서.
- **분류 시 담당 지정**: 메일 분류(단건·일괄)에 담당 선택기(미배정/나/팀원) 추가 → 받은함 메일을 내 할일뿐 아니라
  미배정이나 특정 팀원(차오름 등) 할일로 바로 배정. assignMails/promoteMail/createItem 에 assignee_ref 통과,
  /api/mail/assign 파라미터, 클라 담당 드롭다운(소스=claim-drop 과 동일 _scopes). 인메모리 E2E 검증.
- 서버 변경(재시작). node:test 235/0.

### Revision `working` - 미분류 메일함 위젯: 실제 건수 + 전체 보기

- 미분류 메일함 위젯이 최신 8건만 보여 전체 규모(실제 320건)를 알 수 없던 것 → 제목에 실제 미분류 총건수
  표시(서버 mail_cnt 집계) + '전체 N건 분류하러 가기 →' 링크로 받은함 필터된 메일 화면 진입(전 미분류 분류용).
- 클라이언트 전용(위젯·lexicon·css). lexicon parity 통과. (server-spawn 통합 테스트는 머신 고부하로 flaky·무관)

### Revision `working` - 채팅 즉시 echo · 메일위젯 자동갱신 · 내 할일 빠른추가

- **Codex 채팅 입력 즉시 표시**: 메시지 전송 시 내 글이 곧바로 로그에 뜨도록(낙관적 echo). 기존엔 입력글이
  답변과 함께 나중에 한꺼번에 보이던 문제 수정.
- **미분류 메일함 위젯 자동 갱신**: 진단 결과 메일함(데이터)은 정상(최신 메일 정확히 인입)이고 위젯이 스냅샷이라
  안 바뀌던 것 → 메일 위젯(미분류함·최근메일) 90초 주기 + 탭 복귀 시 자동 새로고침(위젯 검색 입력 중엔 스킵).
- **'내 할 일' 위젯 빠른 추가**: 위젯 안에서 제목 입력 + 과제 선택 → [추가]로 바로 할일 생성(담당=본인,
  기본 과제=일반업무). Enter 로도 추가, 추가 후 그 위젯만 갱신.
- 정적(무중단). node:test 235/0.

### Revision `working` - 대화별 Codex 전체권한 토글 + Outlook 초안 브리지

- **대화별 전체권한 토글**: ERP 과제 채팅마다 '전체권한' 버튼 — 켜면 그 대화의 Codex가 실제 Codex처럼
  로컬 실행(Outlook 등)·파일 쓰기 가능(danger-full-access), 끄면 read-only. 전역 기본은 read-only(안전)로
  되돌리고 대화별로만 승격 → 위험 범위 최소. meta per-item 저장(codex_fa:<id>), admin 전용 토글 라우트,
  bridge runCodexTaskTurn 에 per-call sandboxMode. start-windows.bat 전역 기본 read-only.
- **Outlook 초안 브리지(mailto)**: 상단바 ✉ 버튼 → 받는사람/참조/제목/본문 입력 → [Outlook로 열기]가
  mailto 로 기본 메일 클라이언트(Outlook) 작성창을 직접 엶(샌드박스/Codex 무관, 확실히 동작). 발송은 사람이.
- ⚠ 전체권한 켠 대화는 메일 내용 인젝션→임의 실행 위험. 필요할 때만. node:test 235/0, 토글/제외 로직 E2E.

### Revision `working` - 채팅 Codex 샌드박스 env 설정화(로컬 실행 옵트인)

- ERP 과제 채팅의 Codex 세션이 read-only·approval never 로 고정돼 로컬 프로그램(Outlook 등) 실행이 막혀
  있던 것 → codex_bridge 의 sandbox/approval 을 env(DEV_ERP_CODEX_SANDBOX, DEV_ERP_CODEX_APPROVAL)로 제어.
  코드 기본값은 안전(read-only·never) 유지 — owner 가 명시적으로 켤 때만 풀림(workspace-write/danger-full-access).
  start-windows.bat 에 토글+경고 추가(기본 workspace-write 로 켬, 한 줄로 되돌림).
- ⚠ 보안: 채팅에 메일 등 외부 내용이 섞이므로 풀수록 프롬프트 인젝션→임의 명령 실행 위험. 필요할 때만.
- node:test 235/0.

### Revision `working` - 분류 연속성 — 정식 등록 후 스크롤 유지(맨 위로 안 튐)

- 도그푸딩: 미분류 항목을 '정식 등록'하면 전체 재렌더로 목록 맨 위로 튀어 다음 항목을 다시 스크롤해야 했음
  (메일엔 '분류하고 다음'이 있는데 할일 분류엔 없던 연속성 갭). 등록 성공 시 스크롤 위치 보존(다음 카드가
  제자리로) + '정식 등록됨' 토스트. 메일 흐름과 같은 연속 처리감.
- 정적(무중단). node:test 235/0.

### Revision `working` - 메일 수신 차단/제외 규칙 + 내부 프로젝트 한글 표시

- **메일 제외 규칙(개인정보 보호)**: 급여명세서 등 개인 메일·차단 발신자를 팀 공용 ERP에 안 들어오게.
  관리자 패널에 '메일 제외 규칙' 섹션 — 발신자·제목·수신함 기준(포함/완전일치) 규칙 CRUD. 매칭 메일은
  수집 시 store.ingestMail 에서 저장 전 드롭 + 규칙 추가 시 이미 들어온 것도 소급 숨김(hidden=1, 재수집에도 유지).
  본문 미저장 정책상 메타 3필드로만 매칭. admin 전용. 패턴 값은 로그/이벤트에 평문 미기록(프라이버시).
  신규 테이블 mail_exclude_rule + Store CRUD/판정/소급 + /api/mail/exclude-rules(GET/POST/delete). 인메모리 E2E 검증.
- **내부 프로젝트 한글 표시**: general_work→'일반업무', external_reviews→'외부 검토', system→'시스템',
  P00-000_INBOX→'받은편지함'. 분류 카드·과제 카드·내부 목록·받은함·분류 드롭다운의 영어 코드 표시를 한글로
  (데이터 id는 유지, 화면 텍스트만). projDisplay 맵.
- 서버 변경(재시작). node:test 235/0.

### Revision `working` - papercut: 승인 대기 제안 종류도 한글화

- 승인 대기(제안 큐)가 raw 제안 kind("create_item"·"set_artifact_requirement" 등)를 노출하던 것 →
  eventKindLabel 재사용 + 제안 전용 3종 추가('첨부유형 추가'·'산출물 요건'·'부품-과제 연결'). 완료 요약은 기존 양모드 라벨 유지.
- 정적(무중단). node:test 235/0.

### Revision `working` - papercut: 타임라인·활동로그 이벤트 종류 한글화

- 타임라인(🕘)·활동로그가 raw kind("item_status"·"completion_digest" 등)를 그대로 노출하던 것 → 한글 라벨
  맵(EVENT_KIND_LABELS, ~65종)으로 '상태 변경'·'완료 요약'·'메일 분류' 등 읽을 수 있게. 미등록 kind 는 원문 표시.
- 정적(무중단). node:test 235/0.

### Revision `working` - 알림 배지 라이브 — 완료 요약이 새로고침 없이 벨에 뜸

- 통합 도그푸딩 발견: refreshNotifBadge 가 시작 시 1회만 호출돼, 완료 시 생기는 AI 요약 제안(S6)·새 차단/연체가
  세션 내내 벨 배지에 반영 안 됨(발견성 메커니즘은 있으나 죽어있었음). 30초 주기 갱신 추가(숨김 탭에선 폴링 정지).
  완료→AI요약→검토 루프가 새로고침 없이 닫힘. 회귀 점검 별도 통과(8기능 버그 0).
- 정적(무중단). node:test 235/0.

### Revision `working` - 미배정 전용뷰 — 주인 없는 일을 한 곳에

- 할 일 화면에 '미배정' 상태칩 추가(카운트 포함): 담당자 없는(assignee NULL/공백) 일만 모아봄. 자동배정이
  메일함 매칭 실패로 무음 방치한 일을 리더가 한눈에 발견해 분배. 미배정뷰는 담당자 스코프(내일/보기범위)
  미적용 = 팀 전체에서 조회. 미배정 카운트도 팀 전체(assignee 무관)·done 제외.
- store _itemWhere/items/itemCounts + /api/items·counts 라우트에 unassigned 파라미터. 서버 변경(재시작). node:test 235/0.

### Revision `working` - 신규 첫 화면 member-first — '내 할 일' 최상단 노출

- 기본 대시보드(DEFAULT_DASH)를 member-first로 재배치: 로그인 직후 '내 할 일'(mine)+'먼저 할 일'(nudges)을
  최상단에 → 신규 팀원이 첫 화면에서 본인 업무를 바로 봄(기존엔 mine 위젯이 기본에 없어 빈 느낌).
  팀 현황은 상단 건강 신호등+과제표가 커버, teamload는 드로어 opt-in. 기존 사용자 저장 레이아웃은 영향 없음.
- 정적(무중단). node:test 235/0.

### Revision `working` - 팀 건강 신호등 — 흩어진 숫자를 한눈 위험/주의/정상

- 대시보드 상단에 팀 전체 종합 신호등: 막힘>0 또는 연체>2=위험(빨강), 연체>0 또는 오늘마감>0=주의(주황),
  아니면 정상(초록). '왜'(막힘 N·연체 N·오늘 N)와 가장 시급한 과제명을 함께 표시, 클릭 시 그 과제로 이동.
  관리자가 KPI 숫자를 일일이 읽어 판단하던 부하 제거(도그푸딩 리더 최대 마찰). 기존 summary 데이터만 사용.
- 정적(무중단). node:test 235/0.

### Revision `working` - 메일 키보드 단축키 — 마우스 없이 받은함 완주

- 메일 뷰에서 j/k(또는 ↑↓)로 이전·다음 메일, Enter로 '분류하고 다음' — 한 손으로 받은함을 쭉 비움
  (도그푸딩 메일 실무자: 한 건당 마우스 3~4회 왕복 → 키보드 완주). 단일 전역 keydown 핸들러가
  기존 버튼(mailDetailPrev/Next·assignOneNext)을 재사용(렌더당 리스너 누수 없음), 입력/드롭다운 조작 중엔 무시.
- 상세 내비에 단축키 힌트(⌨ j/k·Enter) 표시로 발견성 확보. 정적(무중단). node:test 235/0.

### Revision `working` - 메일 단건 처리 마찰 제거 — 상세 이전/다음 + '분류하고 다음'

- 메일 상세에 ◀이전 / (위치) / 다음▶ 내비 + 분류 영역에 [분류하고 다음 ▶] 버튼: 한 건 분류 후
  자동으로 다음 메일 선택 → 받은함을 순차로 빠르게 비움(단건 클릭 왕복 제거, 매일 메일 실무자 최대 마찰).
- doAssign 에 nextSel 인자 추가(일반 분류=null 해제, '분류하고 다음'=다음 메일). 정적(무중단). node:test 235/0.

### Revision `working` - S7 핸드오프 — 완료 요약의 '다음 할 일'을 한 클릭으로 할일화

- '승인 대기'의 완료 요약(S6)에서 AI가 제안한 '다음 할 일' 각 항목에 [+ 할일로] 버튼 → 한 클릭으로
  같은 프로젝트에 실제 할일 생성(POST /api/items 재사용). "A 완료 → 다음이 이어짐"을 수동 의존성
  그래프 없이 AI 제안→사람 승인으로 실현(원안 depends_on보다 채택 쉬움). 완료 훅 payload에 project_id 추가.
- 정적+서버 payload 1필드(재시작). node:test 235/0.

### Revision `working` - 완료 요약 발견성: 승인 대기에 다음액션·지식 표시

- S6 완료 디제스트가 '승인 대기'에서 요약만 보이던 것 → completion_digest 는 요약 + 다음액션(→) +
  지식(💡)까지 표시하고 종류 배지를 '완료 요약'으로. (홈 '승인 대기 제안 (N)' 퀵링크로 진입)
- 정적(무중단). 다음: S7 핸드오프(A 완료→B 자동 알림). node:test 235/0.

### Revision `working` - 완료 훅 S6 — done 순간 AI가 다음을 준비 (자동화 핵심 레버)

- 할일을 done 하는 순간 그 일의 Codex 대화 로그를 로컬 AI(ollama)가 1회 요약 → {완료요약·다음액션
  후보·지식후보}를 기존 ai_proposal 큐에 자동 적재('completion_digest'). '승인 대기'(mod:proposals)에서
  사람이 검토/승인. "완료=정보 소멸"을 "완료=비서가 다음을 준비"로.
- 죽은 배선 잇기: 기존 codex_thread_message·runLlm·ai_proposal 재사용. 신규 화면 0.
- 안전: 비차단(fire-and-forget), Codex 대화 없거나 ollama 미가용/오류면 graceful(완료 자체는 영향 0),
  외부 egress 0(로컬 ollama). 도그푸딩 6페르소나 중 4명 top_wish. node:test 235/0.

### Revision `working` - UX 마찰 제거 1: 메일→분류 자동진입 + 선택잔존 정리

- 페르소나 도그푸딩(6역할) 결과로 매일-루프 마찰 우선 제거. ① 메일 할일 승격 직후 '분류 필요'로
  자동 이동(수동 '분류하러 가기' 클릭 제거) ② resetMailPaging 에 mailChecked 초기화(필터/스코프
  변경 후 유령 '해제' 버튼 제거). 정적(무중단).
- 다음: 완료 훅 S6 — done→Codex 대화 LLM 요약·다음액션·지식후보를 proposals 큐로 자동(자동화 핵심 레버). node:test 235/0.

### Revision `working` - 연락처·요청 수정(MED) — 미흡기능 감사 마무리

- 연락처·요청 행에 ✎(수정) 추가(연락처=이름, 요청=제목 prompt). `store.updateContact/updateRequest`,
  `POST /api/{contacts,requests}/update`. 백엔드는 다필드 지원(향후 인라인 폼 확장 여지).
- 이로써 2026-06-22 미흡기능 전수감사(55확정)의 HIGH 6/6 + 의미있는 MED 전부 처리. LOW 24는 백로그. node:test 235/0.

## 2026-06-23

### Revision `working` - 할일 행 클릭 → 편집(MED)

- 할일 행을 클릭하면 인라인 편집이 열린다(기존엔 '수정' 버튼만). 버튼·셀렉트·과제링크 클릭은 제외.
  마감 단독수정은 인라인 폼이 이미 커버(제목·마감 함께 전송). 정적(무중단). node:test 235/0.

## 2026-06-23

### Revision `working` - 마스터 삭제(MED): 발주·연락처·요청

- 추가만 되고 삭제 없던 마스터 3종에 삭제 추가: 행 끝 × 버튼 → 확인 후 삭제(링크맵도 함께 정리).
  `store.deletePurchase/deleteContact/deleteRequest`, `POST /api/{purchases,contacts,requests}/delete`(allowSharedWrite).
  하드삭제(이력은 event_log). lexicon master_del 류. node:test 235/0.

## 2026-06-23

### Revision `working` - 라벨 색 변경 UI — 라벨 CRUD 100% 완성

- 라벨칩에 색 스와치 추가: 클릭하면 LABEL_PALETTE 다음 색으로 순환(`/api/labels/update` 재사용, 지난 라운드 배포).
- 라벨 CRUD 완전 종료: 생성·부착/해제·삭제·이름변경·색변경. 정적(무중단). node:test 235/0.

## 2026-06-22

### Revision `working` - 메일 편집(MED) — 잘못 등록한 메일 메타 정정

- 메일 상세에 '메일 수정' → 제목·상대·날짜 인라인 편집. `store.updateMail`, `POST /api/mail/update`.
  수집(원장) 메일은 재스캔 시 원문값으로 복원될 수 있음(원문이 정본) — 주로 수동 등록 메일 정정용.
- 이로써 메일 CRUD: 등록·분류/취소·삭제·편집 완비. node:test 235/0.

## 2026-06-22

### Revision `working` - 라벨 이름 변경(MED) — 라벨 CRUD 완성

- 라벨칩에 ✎(이름 변경) 추가 → prompt 로 이름 수정. `store.updateLabel`(name/color, 중복 거부),
  `POST /api/labels/update`. 색 변경은 백엔드(updateLabel color)만 준비, UI는 후속.
- 이로써 라벨 CRUD: 생성·부착/해제·삭제·이름변경 완비. node:test 235/0.

### Revision `working` - 콕핏 메일/미분류 위젯 행 → 분류 진입(설계 #1·감사 갭)

- 메일/미분류 위젯 행이 클릭 액션 0개이던 갭: 행 클릭 시 메일 화면에서 그 메일 선택
  (우측 '과제로 분류' 패널 진입). viewScope=team·필터/페이지 리셋으로 대상 메일 노출 보장.
- 일상 루프(메일 봄→분류)에서 화면 더듬기 없이 콕핏 위젯에서 바로 분류로 진입. 정적(무중단).
- 더 큰 설계 변경(시작 게이트 완화·proposals 승인 인라인·본문 토글)은 owner 승인 후 진행. node:test 235/0.

### Revision `working` - 미흡 기능 감사 후속 4: 피드백 토스트(MED)

- "동작했는지 모르겠다" 유발하던 무피드백 변이 액션에 토스트 추가.
- 메일 분류(doAssign): 성공 시 'N건 분류 완료', 실패/대상미선택 시 안내(기존 무반응).
- 라벨 생성(newLabelBtn): 성공/중복/빈입력 토스트(기존 무반응).
- 메일 수집 버튼: HTTP 4xx/5xx 도 실패로 처리(resp.ok 검사 추가 — 오류를 '완료'로 보이던 것 수정).
- 정적(app.js)+lexicon 추가, 새 문자열은 정확한 fallback 동반(비즈니스 모드 무중단). node:test 235/0.

### Revision `working` - 미흡 기능 감사 후속 3: 메일 삭제(soft-hide) — HIGH 6/6 완료

- 마지막 high: 메일 삭제. core_mail 에 `hidden` 컬럼 추가(soft-delete). upsertMail 의 ON CONFLICT
  가 hidden 을 안 건드려 **재수집/재스캔해도 다시 안 보임**(되살아남 방지). mail 쿼리에서 hidden 제외.
- `store.deleteMail`(hidden=1), `POST /api/mail/delete`, 상세패널 '메일 삭제' 버튼(확인 후).
- 이로써 감사 high 6/6 완료(라벨삭제·메일분류취소·메일함해제·자격증명정리·프로젝트수정·프로젝트보관·메일삭제). node:test 235/0.

### Revision `working` - 미흡 기능 감사 후속 2: 프로젝트 수정·보관(복원)

- 감사 high 6건 중 프로젝트 CRUD 2건 처리(추가만 되고 수정·삭제 없던 공백).
- 과제 수정: 허브 '수정' 버튼으로 과제명 변경. `store.updateProject`, `POST /api/projects/update`.
- 과제 보관/복원: 허브 '보관/복원' 버튼 — class active↔archive 토글(하드삭제 금지, 메일·할일 보존).
  `store.archiveProject`(inbox 보관 불가), `POST /api/projects/archive`. 보관 과제는 목록·분류
  드롭다운에서 숨김 + 목록 '보관 보기(N)' 토글로 복원 접근. node:test 235/0.

### Revision `working` - Codex 대화 속도(service_tier) 선택 제거 — codex 기본값 사용

- "failed to load configuration ... unknown variant `priority`" 오류가 반복되던 건의 근본 차단:
  속도(tier) 선택(flex·fast) 자체를 ERP에서 제거하고 codex 기본 tier 를 쓰게 함.
- 서버: `CODEX_TASK_SERVICE_TIER_OPTIONS=[]`, 기본 tier `""`(override 미전송, ALLOW_FAST 여도 fast 불가).
- UI: Codex 대화창의 service tier 드롭다운(taskCodexTier) 및 관련 참조 제거, 폴백 flex 정리.
- (운영 PC) 전역 `~/.codex/config.toml` 의 `service_tier` 줄 제거 → codex 기본값. tier 값이 없으니
  파싱 오류가 다시 안 남. node:test 235/0(관련 3개 테스트를 새 설계에 맞게 갱신).

### Revision `working` - 미흡 기능 감사 후속 1: 메일 분류 취소 + 메일함 해제

- 미흡 기능 전수 감사(워크플로) 결과 확정 55건(high 6) 중 high 처리 1차.
- 메일 분류 취소(unassign): 과제로 분류한 메일을 받은함(inbox)으로 되돌림. `store.unassignMail`
  (project_id NOT NULL 이라 null 대신 inbox 버킷), `POST /api/mail/unassign`, 상세패널 '분류 취소' 버튼.
- 메일함 해제(disconnect): provider=none·비활성 + 비번 env 파일 삭제(비활성 후 비번 파일이 남던
  보안 공백 제거). `POST /api/accounts/mailbox/disconnect`, 계정 표 '해제' 버튼. 메일·할일은 보존.

### Revision `working` - 라벨 삭제 기능(추가만 되고 삭제 없던 CRUD 공백 메움)

- 라벨을 만들면(라벨 추가) 지울 방법이 전혀 없던 문제: 라벨칩에 × 추가 → 확인 후 삭제.
  `store.deleteLabel`(mail_label + mail_label_map 함께 제거), `POST /api/labels/delete`,
  lexicon label_delete/_confirm/_deleted/_fail(양 모드). 미흡 기능 전수 감사도 병행.

### Revision `working` - 메일 목록 줄 버그 수정(칩을 발신자 칸으로 인라인)

- 메일함 주인·프로젝트·라벨 칩이 별도 `mail-meta` 컬럼에 있어, table-layout:auto 가 가장 넓은
  행 기준으로 컬럼 폭(123px)을 잡아 칩(48px) 뒤에 빈 띠가 생기던 "줄 버그" 수정. 칩을
  발신자 칸 앞에 인라인(`.mail-chips`)으로 옮기고 컬럼 5→4 로 줄여 빈 띠 제거.

### Revision `working` - 팀 전체 메일에 주인 표시 + 새로고침 페이지 유지

- 팀 전체 메일 보기에서 각 메일에 메일함 주인 칩(차오름/문성용) 표시. 개인귀속 전 초기 수집분
  (서버에 더는 없어 재수신·귀속 불가한 옛 메일)은 회색 `공용함` 칩으로 구분(빈칸 제거·비파괴).
- 새로고침/이동 시 보던 메일·할일 페이지 offset 과 보기 대상(viewScope)을 `beforeunload` 에 저장,
  시작 시 복원(무효 scope 는 기본값 폴백). 늘 1페이지로 튕기던 동작 수정.
- 일회성 데이터 정리: 단일 `cli.py` 로 잘못 받힌 `company_mailbox` 중복 218건(원장 225건)을
  메일소스ID 로 안전 제거(team_cli 귀속판 보존). lexicon `mailbox_owner`·`mailbox_shared` 추가.

### Revision `working` - 메일 계정별 귀속 — team_cli 경로로 owner 메타 흐르게

- 개인별 메일 뷰(보기 대상=차오름/문성용)가 비던 원인: 수집을 단일 `cli.py`(per-env)로 해서
  메일별 owner 메타가 안 붙고, 원장 `메일함` 이 workspace 버킷(`company_mailbox`)으로 떨어져
  ERP 계정별 필터(`core_mail.mailbox = 계정 이메일`)가 매칭 못 함. (게이트웨이
  `_mailbox_history_label` 은 이미 `metadata.mailbox.email` 우선 사용 → Python 변경 불필요.)
- `tools/export_team_mailboxes.mjs`: 팀 등록부 `id` 를 한글 username 대신 account_id(ASCII·고유)
  에서 파생(`safeToken` fallback 보강). 한글 이름 계정이 `id="mailbox"` 로 충돌해 team_cli 가
  `duplicate_id` 로 거부하던 버그 수정.
- `src/mail_collect.mjs`: 수집 경로를 ① 등록부 갱신 → ② `team_cli`(owner 메타 부착) → ③ scan
  인입 으로 전환. 원장 `메일함` = 계정 이메일 → core_mail 로 ERP 계정별 뷰가 매칭된다.

### Revision `working` - dev-erp 메일 수집 통합(수동 버튼 + 자동 주기)

- `src/mail_collect.mjs`: 활성·메일함 enabled 계정마다 수집기(자식 프로세스, gateway mail_fetch)로
  fetch 후 `scan_mail_ledger`로 원장 → core_mail 인입. 동시/중복 수집 락. 웹서버는 직접 외부접속하지
  않는다(no_server_egress) — egress·ingest 모두 자식 프로세스가 수행. 요약은 건수만(원문 미노출).
- `POST /api/mail/collect`(관리자) + 미분류 메일함 위젯 헤더 '📥 메일 수집' 버튼(관리자만 노출).
- 자동 주기 수집: `DEV_ERP_MAIL_COLLECT_SEC=<초>` env(기본 OFF·테스트/:memory: 무영향). 운영본은 켠다.

### Revision `working` - 메일함 env 파일명 계정 id 기반(한글 이름 충돌 수정)

- `safeAccountEnvName` 이 username 을 `[a-z0-9_.-]` 로 sanitize 했는데, 한글 등 비ASCII
  이름은 전부 깎여 빈 문자열 → 폴백 `acct_mailbox.env` 로 통일돼, 한글 이름 계정들이
  같은 자격증명 env 파일을 공유(나중 등록이 앞 사람 자격증명을 덮어씀)하는 문제가 있었다.
- env 파일명을 계정 id(항상 ASCII·고유)에서 파생하도록 변경(등록 호출부가 `acct.id` 사용),
  sanitize 결과가 비면 raw 입력 해시로 고유화. 계정 삭제는 저장된 `mailbox_env_ref` 로
  실제 파일을 지운다. 한글/중복 이름 팀원도 각자 분리된 env 파일을 갖는다.

### Revision `working` - dev-erp 콕핏 드래그앤드롭 취소 버그 수정

- 담당자 드롭바 `.claim-drop`을 `position: sticky` → `position: fixed` 오버레이로 변경.
  sticky 일 때는 드래그 시작(`body.dnd-active`) 순간 바가 `#view` 최상단 흐름에
  끼어들어 드래그 소스(미분류 메일/할일 행)를 ~122px 아래로 밀어냈고, 소스가 커서
  밑에서 빠지자 Chrome 이 네이티브 드래그를 즉시 취소(dragstart→dragend, drop 0)해
  "메일이 안 잡히는" 증상이 났다. fixed 오버레이로 흐름에서 빼 reflow 를 없애 해결.

## 2026-06-21

### Revision `working` - repo sync validation repair

- Restored `.workflow/drag_coefficient_cfd_result_package_v0/` after the synced
  workflow index pointed to the package but the public files were absent.
- Kept the restored workflow public-safe: process contract and templates only,
  with raw solver payloads, company files, runtime paths, and case values left
  outside public canon.
- Replaced one local runtime DB example in the town-crier assignment setup note
  with a portable `<DEV_ERP_DB_PATH>` placeholder so path-policy validation can
  pass on other machines.

### Revision `working` - Outlook mail reconcile runner added

- Added `guild_hall/gateway/outlook_mail_reconcile.mjs` and
  `guild-hall:gateway:outlook-reconcile` for metadata-only Outlook sent-mail
  ledger reconciliation. The runner supports optional Send/Receive preflight,
  previous-run date-window fallback, Codex-managed project discovery excluding
  `P00-000_INBOX`, private sent-mail ledger deltas, received-mail
  cross-validation, and owner follow-up rows for ambiguous matches.
- Added fixture-based tests for apply and dry-run modes without touching live
  Outlook, message bodies, HTML, `.msg`/`.eml`, attachments, rules, categories,
  or secrets.

## 2026-06-20

### Revision `working` - dev-erp 계정 삭제(자격증명 정리, 업무 데이터 보존)

- 관리자 패널에서 계정 **영구 삭제**: 계정·세션·역할·대시보드 + **비번 env 파일** 제거. **메일·할일은 프로젝트 기록으로 보존**(전 담당 라벨로 남김). 마지막 활성 관리자·본인 계정 삭제는 차단(잠금 방지).
- `store.deleteAccount`(트랜잭션, auth_session·rbac_account_role·user_dashboard_layout·core_account 정리, 마지막 admin 보호) + `mailbox_env.deleteMailboxEnv`(per-account env만 삭제 — 공유 `email_fetch.env` 미접촉) + `POST /api/accounts/delete`(admin·not-self) + UI "삭제" 버튼(uiConfirm). lexicon 5키 parity. node:test 217/0.

### Revision `working` - dev-erp ERP에서 메일 자격증명 등록(env 기록)

- ERP 관리자 패널에서 계정별 **이메일+비밀번호+호스트**를 입력해 메일함을 연결하는 "메일 연결" 기능. 비밀번호는 **env 파일에만** 기록되고 DB·이벤트·응답엔 남지 않는다. 수신(fetch)은 별도 수집기 프로세스가 하므로 웹서버 외부접속 0(`no_server_egress`) 유지.
- `src/mailbox_env.mjs`: 계정 username 파생 경로(traversal 금지, `guild_hall/state/gateway/mailbox/state/acct_<user>.env`)에 Hiworks POP3 자격증명을 atomic upsert. 허용 디렉터리 밖이면 거부. node:test 2건.
- `server.mjs`: `POST /api/accounts/mailbox/credentials`(admin) — env 파일 기록 + `updateAccountMailbox`로 메타(provider/env_ref/enabled)만 갱신. 비번 미저장·미로그.
- `static/app.js`: 관리자 패널 계정 행에 "메일 연결" 버튼 + 모달(호스트/이메일/비번). `src/lexicon.mjs`: 관련 키 7개(business/fantasy parity).

### Revision `working` - dev-erp 할일_장부 → real_meta 전달 복구

- 운영본 인입 경로의 끊김 수정: 소스 할일_장부(메일/회의/요청 변환 할일)가 운영 ERP까지 도달하지 못하던 문제. `build_real_meta.mjs`가 할일_장부를 전혀 안 읽어(items를 snapshot 미션에서만 빌드) 754개 변환 할일이 스냅샷에서 누락됐었다.
- `tools/build_real_meta.mjs`: `_workmeta/<코드>/reports/할일_장부/할일_장부.csv`를 읽어(readTaskLedgerRows 재사용) `real_meta.items`에 싣는다(샘플 제외, id dedup). 실데이터 검증: items 0 → 785(754 mailtask+30 voicetask+1 manualtask).
- `src/adapter.mjs`: `ingestNormalized`가 할일류 item(work_type·완료기준·origin_mail_id·anchor_stage_code·review_status 보유, 또는 mailtask:/manualtask: 키)을 `ingestTaskItem`(전체 컬럼+SE앵커 게이트+멱등 보존)으로 라우팅. `upsertItem` 경로는 그 필드들을 못 써서 손실되던 것을 방지. 미션류 단순 item은 기존 경로 유지.
- node:test 2건 추가(라우팅 필드 보존 + 빌더 할일 적재). 메일 원문·secret 미열람, real_meta는 runtime data(gitignore).

### Revision `working` - dev-erp 메일→할일 LLM 판단 인입

- dev-erp 운영 병목("메일은 오는데 할일로 안 변함")의 ③ 변환 단계를 채웠다. 결정적 엔진(`mail_to_task_ledger.mjs`)은 그대로 두고, 빠져 있던 LLM 판단(어떤 메일이 할일인가 + 필드)을 반복 가능한 증분 실행으로 패키징.
- `ui-workspace/apps/dev-erp/tools/mail_to_task_pending.mjs` 추가: 아직 할일로 변환 안 된 메일만 결정적으로 추려(LLM 입력 한정·증분 스케줄 가능) `--json` 출력. node:test 3건 추가(멱등·split·집계).
- `.registry/skills/mail_to_task_classify/` 추가: candidates 분류 계약(`codex/references/rubric.md`)을 소유하는 self-contained dev-erp 인입 스킬. `skills:sync` 로 materialize 검증. 메타데이터 전용·멱등.
- `ui-workspace/apps/dev-erp/docs/MAIL_TO_TASK_INTAKE.md` 운영자 맵 추가(4단계 체인·끊김·도구). 실제 메일 fetch/자격증명/스케줄과 팀 hard-assign 은 owner 경계로 분리, 메일 원문·secret 미열람.

### Revision `working` - drag coefficient CFD result package workflow

- Added `.workflow/drag_coefficient_cfd_result_package_v0/` for packaging drag-coefficient CFD results with Cd/drag tables, analysis conditions, mesh/residual summaries, raw force and solver logs, report-ready ParaView top/side visuals, manifest, ZIP, and handoff as one closeout bundle.
- Registered the workflow in `.workflow/index.yaml` and kept private project paths, raw CFD files, company payloads, and runtime-specific scripts out of the public workflow package.
- Recorded private extraction evidence under `_workmeta/P26-014/runs/drag_coefficient_cfd_result_package_workflow_extraction_20260620_01/` so the KVDS case can be recovered without putting raw project data in public canon.

### Revision `working` - report_authoring_v0 workflow + report_writer launcher + 작성 가이드

- Added `.workflow/report_authoring_v0/` (registered in `.workflow/index.yaml`, built via the
  workflow-generator + workflow-check pattern): a workflow that stops measurement-only
  data-dump reports by interviewing the author grill-style (one question at a time) to fill the
  missing So-What pieces (왜/뭘/뭘얻/그래서/다음), drafting by report type with practitioner
  register (개조식 종결, 근거 있는 단정, 수치+불확도 k=2/95%, 종합 판정 1문장, 권고→의사결정),
  running a SEPARATE conditioned de-slop pass (bans ungrounded hedging only, keeps grounded
  judgment verbs), a self-check, and a boundary review. Package carries workflow.yaml,
  step_graph, role_slots, handoff_rules, monster_rules, party_compatibility, profile_policy,
  and templates.
- Converted `.registry/skills/report_writer/` (status: candidate) into a thin launcher for that
  workflow, keeping the interview question bank, scaffold quick-card, and filled synthetic
  examples (incl. a data-dump→conclusion Before/After) as references the workflow consumes.
- Restored `docs/architecture/workspace/SOULFORGE_REPORT_WRITING_GUIDE_V0.md` as the writing
  doctrine: So-What scaffold, register rules and type spines grounded in real public reports
  (NTSB, NIST, NASA, NREL, Sandia, KRISS, KISTEP, 환경부) verified against fabrication,
  conditioned de-slop, and the AI collaboration pipeline. Re-indexed workspace and skills READMEs.
- Style/structure only — facts, numbers, and verdicts stay owner/source authority; never invents
  values (missing → 미확인). `output_state: pilot-executed` via fresh-context evaluator/judge over
  experiment/analysis/progress/presentation/interview scenarios; no model-cost calibration;
  default route off; not production-ready or canon-promoted.

### Revision `working` - dev-worker ledger terminology unified

- Clarified that development candidates and executable dev-worker items should
  live in one `dev_worker_queue` surface and be distinguished by `status`
  values instead of split candidate/execution ledgers.
- Marked `dev_worker_candidate_queue` as a legacy migration input and updated
  the shared glossary so future work does not scatter new packets across both
  paths.

### Revision `working` - long-thread subagent default clarified

- Clarified that explicit `soulforge-long-thread-handoff` invocation makes
  fresh subagent delegation the default for non-trivial bounded work.
- Added a named no-subagent exception rule so direct same-thread execution is
  treated as an exception, not an ambiguous "when useful" choice.

### Revision `working` - delegation packet minimum hardening

- Added compact delegation packet minimum fields to the long-thread handoff and
  Codex thread manager skill/workflow contracts so fresh subagents and worker
  threads receive objective, context refs, acceptance criteria, read/write
  scope, side-effect limits, verification, result shape, execution-contract
  claim ceiling, and stop conditions instead of a prose-only folder handoff.
- Kept raw transcripts, hidden reasoning, private payloads, secrets, and
  unneeded source dumps excluded from handoff and worker packets.

## 2026-06-19

### Revision `working` - cross-PC knowledge ingest launcher skill

- Added `knowledge_ingest_cross_pc`, a Codex launcher skill for side-PC
  knowledge ingest sessions that must pull/sync, invoke the Knowledge Ingest
  Cell, capture metadata-only receipts, generate missing audits, validate
  boundaries, and push `_workmeta` evidence for later recovery.
- Kept the new launcher as operational glue only; it does not grant source
  truth, owner approval, upload, NotebookLM, RAG index-build, public canon
  promotion, or default-route authority.

### Revision `working` - knowledge ingest receipt and missing audit

- Added a metadata-only knowledge ingest receipt ledger and missing-audit table
  so cross-PC knowledge candidates can show candidate/source/wiki/RAG/canon
  layer status instead of disappearing into chat memory.
- Added `guild-hall:knowledge-access` receipt append, validate, missing-audit,
  and missing-audit validation commands plus focused tests and validation script.
- Updated the knowledge ingest pipeline, party, launcher skill, and operating
  docs so bounded ingest work records receipt/audit refs before closeout without
  granting upload, NotebookLM, index-build, source-text, or canon authority.

### Revision `working` - boot digest rule-hardening closeout synced

- Refreshed the agent boot digest companion so the AGENTS.md
  `conversation-rule-hardening` closeout rule is represented in the compact
  startup summary.
- Re-signed the boot digest source manifest after reviewing the AGENTS.md drift
  detected by `npm run validate`.

### Revision `working` - dev-erp chatbot stability 11

- Bumped the runtime-visible ERP/chatbot build to `ui-2026.06.18-chat-stability.11`
  and `chatbot-2026.06.18-stability.11` so browser version chips identify the
  actual server and chatbot code answering the user.
- Namespaced session cookies by port (`dev_erp_sid_<port>`) and clear the legacy
  cookie to stop `4300` runtime and `4310` development sessions from overwriting
  each other on `127.0.0.1`.
- Added a frontend `/api/chat` AbortController timeout, explicit login/timeout
  retry states, and chat metadata badges so stalled local LLM calls do not leave
  the input looking permanently frozen.
- Answered simple liveness pings such as "되니?" directly in the runtime path
  without sending them to Ollama, while keeping real usage/quality questions on
  the manual/LLM pipeline.

### Revision `working` - dev-erp Codex task bridge pilot

- Added the default server-owned Codex task bridge for option 2: work PCs use
  the ERP UI/API only, while the ERP server starts/resumes Codex threads through
  `codex app-server` over stdio.
- Added lightweight Codex task reply indicators to item list APIs and the home
  dashboard so operators can see reply/waiting/error state and open a task
  conversation directly from the first screen without exposing message text in
  list rows.
- Bumped the runtime-visible ERP release to `v1.0.5` with build
  `ui-2026.06.20-home-task-actions.1` for the home task action patch.
- Bumped the runtime-visible ERP release to `v1.0.6` with build
  `ui-2026.06.20-codex-badge-live.1`; task rows now optimistically switch the
  Codex badge to waiting as soon as a message is sent, then to reply or error
  when the Codex turn finishes.
- Bumped the runtime-visible ERP release to `v1.0.7` with build
  `ui-2026.06.20-codex-wait-spinner.1`; waiting Codex task badges now show a
  compact spinner while a turn is pending.
- Bumped the runtime-visible ERP release to `v1.0.8` with build
  `ui-2026.06.20-mail-promote-feedback.1`; project mail-tab promote buttons now
  show pending/success/error feedback, stop row-click propagation, and treat
  already-promoted mail as a completed state instead of silently doing nothing.
- Bumped the runtime-visible ERP release to `v1.0.9` with build
  `ui-2026.06.20-mail-ledger-sync.1`; mail-ledger ingest now uses the same
  ledger-folder mail IDs as the runtime DB and preserves already-classified
  project assignments when the reserved inbox ledger is re-ingested.
- Updated the bridge to treat `flex` as the default cost policy instead of
  sending it as an app-server turn override, fixing hosts where app-server
  rejects explicit `serviceTier: flex`.
- Show the Codex task bridge version beside the ERP and chatbot versions so
  operators can tell whether a runtime is serving the latest task-chat bridge.
- Set Codex task chat defaults to `gpt-5.5` / `medium` / `flex`; the API now
  exposes only `flex` unless `DEV_ERP_CODEX_TASK_ALLOW_FAST=1` is set, and
  normalizes unapproved `fast` requests back to the server default.
- Added `/api/codex-task/thread`, `/api/codex-task/open`, and
  `/api/codex-task/message` with `core_item.id -> codex_thread_binding` storage
  and a separate `codex_thread_message` cache for the small task conversation
  panel.
- Added a per-task `대화` button in the task list that opens a separate
  `task-codex-*` floating panel instead of reusing the ERP chatbot window.
- Kept `DEV_ERP_CODEX_TASK_BRIDGE=mock` as a UI/API smoke-test mode; the default
  remains the real `app-server` bridge.
- Added `DEV_ERP_CODEX_SERVICE_TIER=fast|flex` as an app-server-only launch
  override for hosts whose Codex config still contains an older
  `service_tier=priority` value, and fixed Windows startup to run the Codex shim
  through `cmd.exe`.
- Added staged progress text and elapsed time in the per-task Codex panel so
  long app-server turns no longer sit on a single opaque "waiting" message.
- Let multiple per-task Codex panels stay open at once, with drag/resize
  persistence and a header tile button for monitoring open task chats together.
- Added task-panel controls for model, reasoning effort, and service tier
  overrides, plus `/` and `$` skill autocomplete backed by local `SKILL.md`
  metadata and real `skill` user-input items.
- Added image-only attachment support for Codex task turns by uploading browser
  images into `_workspaces/system/dev-erp/codex-task-attachments/**` and passing
  them to app-server as `localImage` inputs; arbitrary file prompt-injection is
  intentionally not supported.
- Confirmed app-server task turns can invoke real collab subagents, but the
  app-server runtime does not expose durable Codex thread creation tools to the
  task thread manager skill, so worker-thread fanout remains blocked unless a
  separate host-side broker is designed.
- Filtered app-server turn completion and message delta events by parent
  `threadId` so subagent turn completions do not prematurely finish the ERP task
  chat turn.
- Updated release-facing LLM, remote-PC, and browser QA runbooks so they match
  the current `/api/version` source of truth, 4300 runtime / 4310 development
  port split, mobile/tablet smoke checks, and Codex task panel defaults.
- Hardened the first-release pilot posture: `/api/version` no longer exposes
  the Codex task cwd path, mobile opens only one floating chat/task panel at a
  time, shared configuration/write surfaces are admin-only in team mode, and
  NSSM/watchdog defaults now match the Tailscale-first localhost runtime.
- Tightened runtime release audit semantics so `--require-live` treats live
  health, NAS backup/restore evidence, clean git state, and unapproved broad
  LAN listening as blockers rather than warnings.

### Revision `working` - dev-erp Codex task thread rule

- Documented the owner-approved Codex task-thread naming and persistence rule:
  visible thread titles use `[project_code] task_title`, duplicate titles add a
  short task id suffix, and the durable mapping is `core_item.id ->
  codex_thread_id` rather than the mutable title.
- Clarified that ERP chatbot logs and task-specific Codex threads remain
  separate conversation surfaces.

## 2026-06-18

### Revision `working` - dev-erp version source endpoint

- Moved visible ERP/chatbot version display behind `/api/version` so the UI reads
  runtime component metadata instead of keeping release strings in `app.js`.
- Exported the chatbot version from `src/llm.mjs` and included it in chat API
  responses for operational verification of the actual responding chatbot code.

### Revision `working` - dev-erp component version split

- Split the compact visible release badges into separate component versions:
  `ERP v1.0.2` for the main app and `챗봇 v1.1.0` for the chatbot component.
- Kept the full internal UI/chatbot build identifiers in hover titles so
  operators can verify the exact loaded artifact without crowding the header.

### Revision `working` - dev-erp port boundary guard

- Reserved port `4300` for the runtime checkout and changed
  non-runtime development checkouts to default to port `4310`.
- Added a server-side refusal guard so development checkouts cannot accidentally
  take over the production port unless an explicit emergency override is set.
- Updated Windows start scripts and QA/deployment docs so runtime and development
  browser checks use different ports by default.

### Revision `working` - dev-erp compact version and readable mail history

- Shortened the visible app/chatbot version badges to semver-style release
  numbers while keeping full internal build and browser details in tooltips.
- Added mail-history metadata previews, duplicate subject markers, and a
  title-prefix-based conversation grouping option so forwarded/replied mail can
  be triaged without storing raw mail bodies.

### Revision `working` - dev-erp visible version markers

- Added visible version markers for release verification: the app title now
  shows the loaded UI build and browser engine version, and the chatbot header
  shows the loaded chatbot UI build.
- Moved the app version markers into the right side of the top utility bar so
  the home title and primary menu row stay clean.
- Documented the operator check that production acceptance must probe `4300`,
  not temporary verification ports.

### Revision `working` - dev-erp mail selection controls

- Added visible page-level selection controls and larger row-level select/deselect
  buttons to the mail history view, keeping selection actions non-destructive.

### Revision `working` - dev-erp mail assign stays in history

- Kept the mail classification flow on the mail history view after assigning
  selected messages to a project, so operators can continue triaging the same
  mailbox/filter without being moved into the project hub.

### Revision `working` - dev-erp floating chatbot window

- Changed the chatbot from a blocking modal overlay into an always-on-top
  floating utility window that can be moved, collapsed/expanded, and resized
  while the rest of the ERP remains usable.

### Revision `working` - dev-erp runtime maintenance and recovery

- Added `tools/runtime_ops.mjs` and npm scripts for runtime health checks,
  WAL-safe SQLite `VACUUM INTO` DB backups, NAS latest backup refresh, and
  read-only restore-test reports, with stale latest-folder SQLite sidecars
  pruned before replacing the latest DB copy.
- Added Windows ops scripts for NSSM service configuration and watchdog
  recovery with maintenance marker support, JSONL logs, failure counting, and
  opt-in last-resort reboot gating.
- Added the first-release runtime maintenance runbook covering service
  restart, health checks, backup schedule, restore-test evidence, update
  procedure, troubleshooting, and owner approval gates.
- Hardened the release audit NAS freshness check to compare the latest backup
  against the live DB/WAL state instead of the base DB file mtime alone.

### Revision `working` - conversation rule hardening closeout guard

- Added a local Codex `conversation-rule-hardening` skill for extracting repeated
  correction signals, unresolved conventions, subject keyword gaps, team aliases,
  attachment handling guards, and next-time automation candidates at task close.
- Added `rule_hardening_stop_guard.mjs` plus tests so bounded Soulforge completion
  reports can be blocked when they omit the `규칙 강화 체크:` closeout block.
- Extended the guard to append sanitized closeout candidate bullets to a private
  rule-hardening candidate JSONL queue with rediscovery metadata such as
  thread/run ids when present, project-code hints, task hints, and hashes,
  without promoting them to canon or project rules automatically.
- Wired the new guard into `validate:knowledge-access` and documented the paired
  Stop hook setup next to the existing knowledge trigger guard.

### Revision `working` - dev-erp chatbot first-user hardening

- Fixed the Ollama adapter for thinking-capable local models such as
  `gemma4:e4b` by sending `think:false`, stripping hidden thinking text from
  visible replies, and recording the model tag in LLM call metadata.
- Prevented weak FAQ matches from being rewritten by the LLM; weak matches now
  stay in candidate/clarification mode instead of becoming confident answers.
- Expanded `manual/manual_faq.json` with first-user FAQ coverage for password
  reset, role/permission visibility, mail-to-task flow, attachment boundaries,
  deliverable review, gate blockers, AI proposal approval/undo, alerts,
  meetings, search, and Ollama/Gemma speed troubleshooting.
- Added regression coverage that loads the tracked production manual and checks
  beginner-style questions against stable FAQ top matches plus Ollama request
  payload guards.
- Hardened the manual for team-member workflow questions around first-use
  onboarding, daily work triage, mail-to-task processing, deliverable review
  loops, audit/mistake checks, meeting action item history, and AI proposal
  boundaries.
- Added `npm run smoke:chatbot:ollama` as a repeatable local Gemma/Ollama
  smoke test for learner, power-user, and concurrent team-member chatbot
  questions.
- Made UI-created chat thread ids include a random suffix so separate team
  members or rapid `/new` conversations do not collide in chat logs.
- Added per-user chatbot question logging (`actor_ref` + `thread_id`) and a
  bounded same-user/same-thread follow-up context so short questions such as
  "그럼 막히면요?" can be resolved without mixing team members' conversations.
- Split the chatbot runtime into `manual_chat_pipeline_v1` with explicit
  normalize/context/retrieve/log/compose/LLM stages, safe pipeline summaries in
  `/api/chat`, and configurable `ERP_CHAT_CONTEXT_TURNS` /
  `ERP_CHAT_RETRIEVAL_LIMIT` knobs.
- Raised the default follow-up context window to 5 turns and made follow-up
  questions run contextual retrieval even when the standalone question has a
  weak-but-wrong match, with topic-recency reranking to prefer the current
  conversation topic.
- Replaced phrase-specific chatbot FAQs for "alive?", "what can you do?",
  too-fast/too-short answers, non-user-changeable settings, and stuck/error
  reports with an LLM assist path: manuals stay focused on ERP feature facts,
  while the local model interprets chatbot/runtime/user-feedback utterances
  from bounded runtime principles.
- Updated the LLM prompt and answer pipeline to transform operator-only
  `ERP_CHAT_*`/Ollama settings into administrator escalation guidance when the
  user is asking as a team member, without forcing those utterances into manual
  FAQ source ids.
- Moved weak-match recommended questions outside the chat message bubble,
  added an in-progress status line, disabled duplicate sends while a reply is
  pending, and added a `/api/chat` JSON fallback for chatbot processing errors.
- Added visible chatbot waiting states: an immediate "answer preparing" AI
  placeholder bubble, explicit sent/queued state, timed "checking manual/local
  model" and "taking longer" status updates, `role=status`/`aria-busy`
  accessibility hints, reduced-motion typing dots, and in-place replacement
  with the final answer or retry guidance. Fast fallback replies now keep the
  pending bubble visible for a short minimum so punctuation-only test messages
  such as `.....` or `~~~` do not look frozen.
- Tightened chatbot answer readability: local LLM replies are instructed to use
  short separated paragraphs and roughly 250-character answers, while the chat
  UI automatically inserts readable paragraph breaks for long one-paragraph AI
  messages.
- Added visible version chips for cache/debug verification: the top app title
  now shows the loaded UI build plus browser engine version, and the chatbot
  header shows the loaded chatbot UI build.
- Added an operator-controlled chatbot quality mode: `ERP_CHAT_THINK=1` enables
  Ollama thinking-model reasoning, raises unset timeout/token defaults for that
  mode, raises the default retrieval window, forces Korean final answers,
  strips hidden thinking text from visible replies, retries once for final-only
  output when a thinking model returns hidden thinking without a visible answer,
  and records `think=true/false` in LLM call metadata.
- Routed chatbot quality/reasoning complaints such as "answers are too fast/low
  quality, can reasoning be enabled?" through runtime principles instead of
  FAQ matching, so the UI answers with the operator quality-mode tradeoff and
  does not show the "manual unorganized" badge.
- Moved the visible UI/chatbot build markers to `quality.6` and also render
  them on the pre-login gate, so cached or stale browser sessions can be
  identified before sign-in.
- Tightened chatbot conversation continuity: short follow-up requests such as
  "write that directly" now force same-thread context, memory/new-chat questions
  answer with the real context rule, and the browser keeps the current chat
  thread until the user explicitly presses new chat or sends `/new`.
- Bumped the visible UI/chatbot build markers to `quality.7` for the same-thread
  chat persistence and follow-up-memory fix.

### Revision `working` - dev-erp runtime release audit gate

- Added `tools/runtime_release_audit.mjs`, `npm run audit:runtime`, and root
  `npm run dev-erp:audit-runtime` as a read-only first-release gate for the
  company-PC runtime.
- The audit checks DB/schema integrity, `real_meta.json` sync, project/mail set
  drift, account/admin readiness, synthetic/demo leakage, WAL-aware backup
  posture, NAS latest backup freshness, live health, and fantasy skin assets
  without reading raw project files, mail bodies, or secret env values.
- Ran the gate against the company runtime checkout; the only initial blocker
  was a stale NAS latest DB backup, then refreshed the NAS DB backup with
  SQLite `VACUUM INTO` and reran the gate with zero blockers.

### Revision `working` - dev-erp runtime correction patch tool

- Added `tools/runtime_corrections.mjs`, `npm run correct:runtime`, and root
  `npm run dev-erp:correct-runtime` as dry-run-first runtime DB correction
  surfaces for first-release drift fixes.
- Implemented the first correction, `project_names`, which reads approved
  workspace folder or junction names, updates local `real_meta.json`, creates a
  SQLite backup, and updates only blank/code-only live DB project titles.
- Documented the correction patch path so runtime DB changes stay out of Git
  while still being repeatable from code.

### Revision `working` - dev-erp release data cleanup

- Excluded demo/sample/fixture/synthetic projects and missions from the
  `build_real_meta.mjs` runtime metadata export used for the first dev-ERP
  team release.
- Added `logs/` to the dev-ERP app gitignore so local runtime server logs do
  not appear as source changes.

### Revision `working` - dev-erp shared fantasy skins and fixture opt-in

- Made dev-erp serve fantasy skin images from the shared
  `_workspaces/system/dev-erp/skins/` worksite before falling back to local
  `static/skins/`, so owner-provided backgrounds can sync across PCs without
  entering the public Git repo.
- Changed empty-DB startup to leave the database empty by default; synthetic
  demo data now loads only with `--fixture` or `DEV_ERP_LOAD_FIXTURE=1`.
- Limited `data/real_meta.json` auto-ingest to the default DB unless an ingest
  path or explicit auto-real-meta environment flag is provided.
- Documented the shared skin location and fixture opt-in startup path, with
  regression coverage for both behaviors.

### Revision `working` - knowledge launcher skill consolidation

- Removed the duplicate caller-facing knowledge Codex launchers
  `.registry/skills/knowledge_audit/` and
  `.registry/skills/knowledge_wiki_cell_launcher/`.
- Kept `$soulforge-knowledge-ingest-cell-launcher` as the single knowledge
  entry skill; the underlying audit, wiki/RAG, owner-decision, and review
  workflows remain available through `knowledge_ingest_cell`.
- Updated knowledge operating docs so caller-facing examples point at the
  unified launcher instead of the retired narrow launchers.

### Revision `working` - knowledge ingest party launcher skill

- Added `.registry/skills/knowledge_ingest_cell_launcher/` as a thin Codex
  launcher for the registered `.party/knowledge_ingest_cell` loadout.
- Kept the launcher below party, workflow, profile-policy, owner-decision,
  upload, NotebookLM, source-text/index-build, password, and project-mutation
  authority; the skill resolves workflow-owned policies at execution time.
- Documented the installed mirror name
  `soulforge-knowledge-ingest-cell-launcher` for skill sync.

## 2026-06-17

### Revision `working` - dev-erp first-release account safety

- Enforced the existing six-character minimum password rule during account
  creation, not only password reset/change.
- Blocked self role demotion through the account API and protected the last
  active admin from being demoted at the store layer.
- Disabled the current user's role toggle in the admin panel and added account
  safety regression tests for the first team-facing release.

### Revision `working` - dev-erp Tailscale service posture clarification

- Corrected the dev-erp Windows runtime docs so Tailscale HTTPS service examples
  bind `server.mjs` to `127.0.0.1` in `<runtime-checkout>`, set only
  `DEV_ERP_COOKIE_SECURE=1` for HTTPS cookies, and keep direct `0.0.0.0` LAN HTTP
  as an explicit owner-approved pilot path.
- Added an NSSM example that points at the runtime checkout and uses localhost
  bind plus Tailscale Serve instead of broad LAN exposure by default.
- Added `start-tailscale-windows.bat` as the Task Scheduler target for the
  Tailscale HTTPS backend, leaving `start-windows.bat` as LAN HTTP pilot-only.

### Revision `working` - dev-erp runtime operation boundary

- Added the dev-erp runtime operating contract for the first company-PC release:
  separate `<runtime-checkout>` execution, admin bootstrap ownership, owner-mail
  secret handling, Tailscale HTTPS access, phone access, firewall/NSSM boundaries,
  and the owner approval gate before inviting the team.
- Updated dev-erp README, Windows LAN deployment, and multi-user team model docs to
  route runtime operation through the new contract.
- Fixed `dev-erp` `verify_gate` test summary parsing for the Node 24 summary format.
- Made the SE seed fixture test create its ignored data directory so clean runtime
  clones can run `npm test` and `verify_gate`.

### Revision `working` - knowledge ingest owner-gated workflow and party

- Added `.workflow/knowledge_ingest_pipeline_v0/` as a registered
  public-safe orchestration workflow for chaining optional copy-only unlock
  preprocessing, `knowledge_source_audit_v0`, `knowledge_wiki_pipeline_v0`,
  `owner_decision_packet_v0`, and `post_development_review_gate_v0`.
- Added `.party/knowledge_ingest_cell/` as the owner-gated party loadout for
  the pipeline and registered it in `.party/index.yaml`.
- Kept the route explicitly not default-route-safe and below downstream
  authority for password handling, Drive/NotebookLM upload, public canon
  promotion, source-text/index build, replacement, migration, and
  controlled/internal source handling.

### Revision `working` - project password unlock copy-only workflow

- Added `.workflow/project_password_unlock_copy_only_v0/` as a registered
  public-safe workflow for binding a project folder, using its project-local
  owner-provided password candidate file, dry-running encrypted-file routes,
  and running owner-approved copy-only unlock attempts in a lab workspace.
- Registered the workflow in `.workflow/index.yaml` and documented it in
  `.workflow/README.md`.
- Kept password values, raw project documents, unlocked outputs, and
  host-local absolute paths out of the public workflow package; runtime evidence
  is metadata-only under `_workmeta/system/runs/`.

### Revision `working` - dev-erp Windows 사내 LAN 배포 런북 + 시작 스크립트

- 회사 고성능 Windows PC 1대를 서버로, 팀원이 각자 PC에서 사내 LAN 접속하는 구성용
  배포 문서/도구 추가(코드 동작 변경 없음).
- `docs/WINDOWS_LAN_DEPLOY.md`: 옮길 데이터(앱+DB+`guild_hall/state`·`_workmeta`),
  Node 22.5+, `--host 0.0.0.0` 실행, IP·방화벽(netsh), 상시운영(NSSM/작업스케줄러),
  부트스트랩·팀·preflight, 보안(HTTP 평문·COOKIE_SECURE off·HTTPS 업그레이드 경로).
- `start-windows.bat`: dev-erp 폴더에서 더블클릭 시 `node server.mjs --host 0.0.0.0`.
- 서버/도구는 절대경로 하드코딩 없이 상대 resolve 라 Windows 크로스플랫폼 동작 확인.

### Revision `working` - dev-erp 자동화: '각자 메일=각자 일' 자동 담당 확정

- 원칙(기본 자동 / 수동 폴백)에 따라 담당 배정의 기본을 자동화. ERP 소비 측에서
  결정적·LLM 무관 reconcile: `store.applyMailboxAutoAssign()` — 메일함 기반 제안담당
  (suggested_assignee_ref=메일주소)이 있고 확정 담당이 비었으며 그 주소가 **활성 계정**과
  매칭되는 할 일을 그 계정 담당으로 자동 확정. 기존(사람) 담당은 보존, 알 수 없는 메일함은
  손대지 않음(=수동 분배 대상), 멱등.
- 트리거(server.mjs): 시작 시 1회 backfill + autosync ON 이면 import 폴링 간격마다 재적용.
  Codex 의 ingest/autosync 도구는 미변경(소비 측에서만 정책 적용). item_assign 이벤트로 감사.
- owner 인박스로 몰린 일은 owner 담당이 되며, 그건 담당 드롭다운(수동 재배정)으로 나눔(폴백).

### Revision `working` - dev-erp 할 일 담당 나누기(팀원 드롭다운 재배정)

- 메일은 각자 인박스로 와 각자 일이 되지만, 한 곳에 몰린 일은 실제 담당에게 나눠야 하므로
  관리자의 할 일 화면에서 **담당 칸을 팀원 드롭다운**으로(클릭 한 번에 재배정).
- 기존 백엔드만 사용(`/api/items/assign` + `/api/accounts/scopes` 팀원 목록). 새 백엔드 없음.
  재배정하면 그 팀원의 '내 할 일'(본인 스코프)로 이동. 비관리자는 기존 표시 유지.
- assignee_ref 는 팀원 display_name(=accountIdentities 매칭)으로 설정. item_assign 이벤트 기록.

### Revision `working` - company knowledge intake linked ready validation

- Added an explicit `--validate-source-sync-ready-refs` option to
  `validate-company-knowledge-intake-packet` so company intake packets can
  metadata-check linked `source_sync_ready_ref` manifests before later
  source-text indexing.
- Kept the linked check below owner approval/source truth/index-build authority:
  it validates source id and source-card ref alignment without reading source
  bodies, NotebookLM answers, chunks, secrets, or local runtime paths.
- Kept source file hashing on the dedicated `validate-source-sync-ready` command;
  intake linked validation stays metadata-only and does not expose a file-check
  mode.
- Redacted unsafe linked ready refs before ready-manifest validation so blocked
  CLI output does not echo local paths or secret-like ref values.
- Added fixture coverage for linked pass, missing ready manifest, source-id
  mismatch, source-card mismatch, unsafe linked-ref redaction, CLI output, and
  raw/private payload hygiene.

### Revision `working` - dev-erp 릴리즈 마감: 팀 사용 준비 상태 UI 명확화

- Codex 가 추가한 팀 준비점검(`store.teamReadiness` / `GET /api/accounts/readiness`)을
  **표시만** 명확화(백엔드 의미 변경 없음, Codex readiness 패널에 추가).
- 관리자 패널에 **3단 신호등**: ① 설정 준비(mail_config_ready) → ② 메일 수집(fetch_observed,
  수집 전/관측됨으로 메일 수집 전후 차이 표시) → ③ 팀 사용(ready). next_actions 는 **체크리스트**.
  Codex 의 chips·이슈·계정표는 유지.
- 관리자 버튼에 준비상태 **점**(빨강 막힘 / 노랑 준비됐으나 수집 전 / 초록 준비+수집).
- 모바일/태블릿: 3단 560px 이하 세로 스택, 모달·계정표 스크롤로 안 잘림.
- secret(비밀번호·env ref·경로)·원문 미표시(상태·카운트만).

### Revision `working` - Karpathy-style wiki/RAG ERP contract fixed

- Added `KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md` to record that dev-ERP uses Karpathy-style sourcebound wiki/RAG metadata, not a Karpathy LLM runtime install.
- Exposed `/api/knowledge/shell/contract` from dev-ERP so the ERP can report the metadata-only shell boundary, Ollama/adapter runtime policy, and non-authority claims.
- Extended knowledge shell tests to guard `karpathy_llm_runtime_required=false`, `reads_source_bodies=false`, and the `knowledge_wiki_pipeline_v0` route contract.
- Clarified the Ollama setup doc so `gemma3:4b` remains the default runtime model and Karpathy code families are not install prerequisites.

### Revision `working` - dev-ERP knowledge shell adapter

- Added metadata-only dev-ERP knowledge shell routes for Soulforge knowledge spaces, wiki page refs, RAG route refs, RAG work-card refs, and focused ledger refs.
- Added `src/knowledge_shell.mjs` with allowlisted roots, no body reads, raw/secret/chunk-name blocking, and owner-approved `_workspaces/knowledge` junction root support.
- Kept `.registry/knowledge` as public-safe metadata and narrowed private ledger exposure to focused knowledge/RAG/access report surfaces instead of broad `_workmeta/system/runs`.
- Added tests proving body exclusion, allowlist behavior, legacy registry route compatibility, and route output shape.
- Normalized mail-history lineage refs to POSIX-style `/` refs and made symlink tests tolerate Windows environments that cannot create symlinks.
### Revision `working` - dev-ERP 회사 PC 팀 호스트 사전점검

- `dev-erp:team-preflight` 를 추가해 회사 PC 한 대가 메일 credential env 파일과 ERP 서버를 보유하고,
  팀원은 브라우저로 접속하는 운영 모델을 한 번에 점검할 수 있게 함.
- 점검은 DB·활성 관리자/팀원·메일함 metadata·`team_mailboxes.json` 등록부·메일 env 파일 존재 여부만
  확인하며, credential env 파일 내용은 읽지 않고 출력에도 env 경로나 비밀번호를 표시하지 않음.
- `configuration_ready` 와 `team_use_ready` 를 분리해 실제 팀 메일 수집이 관측되기 전에는 팀 사용
  준비 완료로 닫지 않게 하고, 등록부의 `env_file` 이 ERP DB의 `mailbox_env_ref` 와 일치하는지도 검증.
- 기본 목표 5명 미만이면 preflight 차단 사유로 보고하고, 1명 파일럿은 `--target-members 1` 처럼
  목표 인원을 명시하도록 함.
- 팀 온보딩 문서의 실행 순서에 preflight 단계를 추가해 roster import 이후 팀 공개 전 차단 사유를
  운영자가 바로 확인하도록 정리.

### Revision `working` - dev-ERP 팀 로스터 일괄 등록 도구

- `dev-erp:import-team-roster` 를 추가해 회사 PC 호스트에서 private roster(JSON/CSV)를 dry-run 후
  팀원 계정과 메일함 metadata 를 일괄 생성·수정할 수 있게 함.
- roster 의 임시 비밀번호는 계정 해시 생성/초기화에만 사용하고 dry-run/apply 출력에는 노출하지 않음.
  기존 계정 비밀번호는 `--reset-passwords` 를 명시한 경우에만 초기화.
- 기존 계정의 역할은 roster 에 `role` 을 명시한 경우에만 변경하고, 생략 시 기존 관리자/팀원 역할을 보존.
- 팀 운영 기본값에서 첫 관리자 이후 자가 가입을 차단하고, localhost 파일럿에서만
  `DEV_ERP_ALLOW_SELF_REGISTER=1` 또는 `--allow-self-register` 로 명시 개방하도록 변경.
- `dev-erp:scan-mail-ledger`, `dev-erp:mail-to-task-ledger`, `dev-erp:task-ledger` 루트 스크립트를 추가해
  메일 수집 이후 장부 반영과 3일 검토 폴백 할일 생성을 운영 명령으로 호출할 수 있게 함.
- 팀 공개 모델을 회사 PC 신뢰 호스트 기준으로 문서화하고, 메일 ID/비밀번호/토큰은 호스트의
  비공개 env 파일에만 두며 ERP DB에는 `mailbox_env_ref` 포인터만 저장하도록 절차를 정리.
  HTTP 직접 LAN 과 HTTPS proxy/tunnel 실행 모드도 분리해 Secure cookie 오사용을 방지.

### Revision `working` - dev-ERP 팀원 계정 온보딩 보강

- 로그인한 사용자가 현재 비밀번호를 확인한 뒤 본인 비밀번호를 변경할 수 있는
  `/api/auth/password` 와 화면 버튼을 추가해 임시 비밀번호 온보딩 후 팀원이 직접 계정을 넘겨받을 수 있게 함.
- 관리자 전용 `/api/accounts/password` 와 관리자 패널 초기화 입력을 추가해 팀원이 비밀번호를 잊었을 때
  secret 값을 저장하지 않고 새 임시 비밀번호로 재설정할 수 있게 함. 타 계정 초기화 시 기존 세션은 무효화.
- 팀 사용 준비상태 응답과 관리자 패널에 `next_actions` 를 추가해 계정 추가, 메일함 설정, 수집 실행,
  기한 지난 분류 대기 처리 같은 다음 운영 행동을 바로 볼 수 있게 함.
- 비밀번호 변경·자기 초기화 후 현재 세션을 새 세션으로 교체하고, 메일함 오류가 있을 때 준비상태가
  `ready_for_team_pilot` 로 잘못 닫히지 않게 보정. 팀 공개용 Secure 쿠키 옵션과 모바일 상단바 줄바꿈도 추가.

### Revision `working` - dev-ERP 계정별 메일함 폴더 prefix 매칭

- 팀원별 메일 범위가 계정 이메일 exact 값뿐 아니라 `계정이메일/…`, `계정이메일\…`
  하위 폴더 mailbox 값도 같은 계정 범위로 인식하도록 보강.
- 메일 목록, 검색, 대시보드 메일 요약, 최근 이벤트 범위, 메일 승격/라벨 권한 체크,
  팀 사용 준비상태 집계가 동일한 mailbox prefix 규칙을 공유하도록 정리.
- 실제 운영 DB처럼 Outlook/폴더 경로가 붙은 mailbox 장부에서도 팀원별 보기와 준비상태가
  0건으로 오판되지 않도록 회귀 테스트를 추가.

### Revision `working` - dev-erp 팀 사용 준비상태 점검

- 관리자 전용 `/api/accounts/readiness` 를 추가해 활성 관리자·팀원 수, 팀원별 이메일/메일함/env ref,
  최근 수집시각, 메일 원장 건수, 담당 할일 수, 미분류 큐/기한초과 분류대기 건수를 한 번에 점검.
- 관리자 계정 패널에 **팀 사용 준비** 영역을 추가해 팀 공개 전 차단 사유와 경고를 화면에서 바로
  확인할 수 있게 함. 비밀값은 여전히 저장·표시하지 않고 safe metadata ref 만 사용.
- 다중 사용자 체크리스트에 readiness API/UI 확인 단계를 추가해 팀원 5명 온보딩 전 누락을 줄임.

### Revision `working` - dev-erp 공용 분류 큐와 장부 페이지 계약

- `status=unclassified` 할일을 팀 공용 분류 큐로 명시해 일반 팀원도 미배정 메일 파생 할일을
  조회·확정할 수 있게 함. 정식 할일 조회는 기존처럼 본인 담당자 범위를 유지.
- 미분류 할일 확정 시 담당자를 함께 저장하고, 입력이 비어 있으면 추천 담당자 또는 현재 로그인
  사용자를 기본 담당자로 기록해 공용 큐에서 개인 실행 목록으로 자연스럽게 이동하게 함.
- `/api/items` 와 `/api/mail` 에 `page=1` 페이지 응답(`rows,total,limit,offset,has_more`)을
  추가하고, 기존 배열 응답은 유지해 다른 화면 호환성을 보존.
- 할일/메일 화면에 이전·다음 페이지 컨트롤과 정확한 총량 표시를 추가해 메일·할일이 계속
  쌓여도 고정 500건 제한에 가려지지 않도록 함.
- 미분류 연체 알림, 출처 메일/소스/스레드 추적 표시, 출처 ref 검색을 보강해 메일에서 파생된
  일이 어디서 시작됐는지 화면에서 추적할 수 있게 함.

### Revision `working` - dev-erp 기존 메일 이력 754건 할일 장부화

- 기존 `_workmeta/*/reports/메일_이력/메일_이력.csv` 8개 장부의 754개 메일 이력에서
  `mailtask:<이력키>` 할일 장부 행을 생성하고 dev-ERP DB에 수입할 수 있게 함.
- 메일에 명시 기한이 있으면 해당 날짜를 우선 사용하고, 없으면 수신일+3일 첫 검토기한과
  기한+2일 리마인드/급한 재검토 문구를 장부에 남기도록 `mail_to_task_ledger.mjs` 를 보강.
- `P00-000_INBOX` 예약 코드를 dev-ERP의 인박스 프로젝트로 수입할 수 있게 해 회사 일반/미해결
  메일도 메일 원장과 할일 원장에서 누락되지 않도록 함.
- 메일 행의 스레드 헤더 alias, 소스 계보 해시, 생성런/규칙, 메일소스ID를 보존해
  메일→할일 추적성을 강화.

### Revision `working` - dev-erp 계정별 메일함 등록 메타데이터

- `guild-hall:gateway:fetch:team` 과 `mail_fetch/team_cli.py` 를 추가해 metadata-only
  `team_mailboxes.json` 등록부의 여러 메일함을 순회 수집할 수 있게 함. 메일함별 cursor/dedupe/run
  로그를 분리하고, 후보 ID와 메일 후보 메타데이터에도 mailbox scope 를 반영.
- `dev-erp:export-team-mailboxes` 를 추가해 dev-ERP 계정의 safe mailbox 메타데이터에서
  `team_mailboxes.json` 등록부를 생성할 수 있게 함(비밀값 미포함).
- `core_account` 에 메일함 provider/env ref/enabled/status/last-fetch/error/summary 메타데이터를
  추가하고, env ref 는 repo-relative 포인터만 허용하도록 검증을 추가.
- 관리자 계정 패널과 `/api/accounts/mailbox` 엔드포인트에서 계정별 메일함 메타데이터를
  저장할 수 있게 하되 password/token/secret 값은 받거나 표시하지 않음.
- 메일 장부 스캔이 `메일함` 값을 `core_mail.mailbox` 로 보존하고, 메일→할일 장부 생성은
  기본적으로 메일함 수신자를 `제안담당자` 로만 넣으며 `--assign-mailbox-owner` 사용 시에만
  확정 `담당자` 로 기록.
- 팀원 계정의 기본 메일/검색/할일/대시보드 요약/최근 이벤트 조회는 본인 mailbox/담당자 범위로
  좁히고, 메일 배정·라벨·승격 및 할일 변경 요청도 자기 범위 밖이면 거부하도록 서버 측 가드를 보강.

### Revision `working` - dev-erp 메일 기반 할일 자동화 메타데이터 보강

- 메일 후보 → 할일 장부 → ERP 인입 흐름에서 검토상태, 라우트 후보/신뢰도, 필요 역할·역량,
  제안 담당자, 소스 메일/후보/스레드/그룹, 생성런/규칙, 동기화 상태/해시/리비전을
  보존하도록 할일 장부와 `core_item` 메타데이터를 확장.
- 할일 장부 인입은 기존 할일을 조용히 덮어쓰지 않고 해시 차이가 나면
  `conflict` 로 표시해 사람 수정 이력을 보호하도록 정리.
- dev-erp 화면의 할일 목록·허브·미분류 카드에 검토/라우트/담당자/동기화 힌트를 표시해
  자동 생성된 할일을 사람이 바로 검토할 수 있게 함.
- gateway 메일 후보/상태 집계가 원문·첨부명 없이 구조화된 후보 메타데이터만 전달하도록 보강.

### Revision `working` - dev-erp 지식 대분류 분리 + 분야 4그룹 + canon 뷰어

- `지식·지원`(대도서관) 대분류를 **지식**(전승 서고) / **도구·지원**(제작 도구) **두
  대분류로 분리**.
- **지식**: 분야 4그룹을 가로 서브탭(표준·규격집 / 분야 기술 / 지식·RAG 방법 /
  운영 규범·교리) + 검색·지침. 각 그룹의 canon 항목을 **왼쪽에 동적 나열**(`.registry/
  knowledge` 리더 소비), 클릭하면 항목 뷰어(제목·분야·요약·공개 출처·소스카드 포인터)
  또는 그룹 카드 목록. 원문 미저장.
- 라벨/카테고리는 모드별(business/fantasy). 잔존 `kb` localStorage 는 안전하게 리셋.

### Revision `working` - dev-erp 메일 이력 프로젝트별 구분(기본)

- 메일 이력이 **기본으로 프로젝트별 그룹**(헤더=프로젝트 칩+제목+건수)으로 구분됨.
  툴바 토글로 프로젝트별 ⇄ 날짜별 전환. 미분류/INBOX 그룹은 맨 아래, 그룹은 최신 메일 순.
- 실제 붙은 라벨(수동 색 라벨)은 행에 칩으로 표시 — 프로젝트별 그룹에선 프로젝트 칩이
  헤더로 올라가 행은 부가 라벨만 표시.
- 메일 분류 차원(스키마 기준): 프로젝트(주력)·방향(받은/보낸)·상대(counterpart)·수동 라벨·
  SE 단계(stage_code)·메일함(mailbox, 담당자 프록시). 담당자(내부)는 메일 직접 필드가 아니라
  할 일 승격 후 부여.

### Revision `working` - dev-erp 인증 벽 + 첫 페이지(달빛 길드 입성)

- dev-erp 가 팀 모드(계정 1개 이상)에서 **로그인 없이는 앱·데이터를 볼 수 없게** 됨.
  미인증이면 풀스크린 첫 페이지(게이트)만 표시: 첫 실행=길드마스터 창설(bootstrap),
  이후=입성(로그인)·길드 가입(회원가입) 탭. **모드별 첫 화면 스킨** — 판타지=달빛
  야간(달·별·안개·능선), 실무=전문가용 흰 카드(네이비). 게이트 우상단 토글로 전환.
- 서버: GET 읽기도 미인증 차단(종전엔 쓰기만 차단). 랜딩에 필요한 비민감 메타데이터
  (`/api/me`·`/api/auth/*`·`/api/health`·`/api/lexicon`·`/api/modules`)만 예외. `/api/health`
  의 counts(데이터 규모)는 미인증엔 숨김.
- 길드원 자가 가입 엔드포인트 `/api/auth/register` 추가(member 역할, localhost 바인딩
  전용으로 안전 — 외부 노출 시 초대코드/관리자 승인으로 제한 권장). 가입은
  `account_register` 이벤트로 기록(감사로그 "회원가입").

## 2026-06-16

### Revision `working` - gateway mail history Python 3.9 compatibility

- Changed the project mail history ICS writer to use `Path.open(...,
  newline="")` instead of `Path.write_text(..., newline="")`, preserving
  explicit ICS line endings on Python 3.9 runtimes used by the mail-fetch test
  harness.

### Revision `working` - workspace-system report command added

- Added `guild-hall:workspace-system:report` so another PC can create a
  metadata-only `_workspaces/system` inventory report without pasting a long
  prompt.
- The report command writes JSON, Markdown, and CSV under
  `_workmeta/system/reports/workspace_system_inventory/<timestamp>_<node_id>/`
  and keeps payload bodies, local absolute paths, secrets, and workspace
  mutations out of the capture.
- Updated the workspace path identity and system migration runbooks to make the
  report folder the normal private evidence packet for cross-PC comparison.

### Revision `working` - workspace-system full scan inventory hardened

- Changed `guild-hall:workspace-system:inventory` so the default metadata
  inventory is an unrestricted recursive scan instead of a bounded sample.
- Added `scan_policy`, row-level `scan_complete`/`scan_limited` fields, and
  activation blockers for any bounded inventory result.
- Split project-coded reference payload folders such as
  `p25_054_reference_payloads` into `project_reference_payload_review` so they
  require owner mapping to a project payload relocation/reference surface rather
  than direct project-root movement.
- Updated workspace migration docs and tests so full-scan evidence is required
  before `_workspaces/system` migration or junction activation decisions.

### Revision `working` - system workspace tool-worker procedure saved

- Rewrote `docs/ws.md` as a readable public-safe prompt for per-PC
  `_workspaces/system` junction preflight checks.
- Clarified that licensed or high-performance tool-worker runtimes such as
  Allegro, Cadence, and OrCAD stay PC-local under `_workspaces/_local/<node_id>/...`
  or an owner-approved OS/tool location.
- Documented that only owner-classified outputs move to shared
  `_workspaces/system`, project workspaces, or `_workspaces/knowledge`, while
  execution evidence stays in `_workmeta` as metadata only.
- Added explicit owner approval gates before copy, rename, link creation,
  shared-tree build, upload, delete, or permission changes.
- Updated the system inventory action text so migrated runtime/tool payloads
  point to `_workspaces/_local/<node_id>/...` or owner-approved OS/tool
  locations, while reinstallable repo tools remain a separate bootstrap flow.

### Revision `working` - dev-erp 산출물(중간번호 등록 + 입력파일 폴더/장부 기초)

- 산출물 중간번호 등록: 고정 단계 밖 31·32 등 산출물을 ERP에서 직접 추가·관리
  (`addDeliverable`, `POST /api/deliverables`, 레지스터 추가 폼).
- 산출물 입력파일(설계+데이터층+UI+장부동기): 산출물 종류별 In 하위폴더 매핑 +
  `deliverable_input` 장부(포인터·메타 전용·원문 미저장·절대경로 거부) + ERP/메일/Codex
  3루트 출처. `core_deliverable.in_pointer`(01_In 상대, out_pointer 대칭). 엔드포인트
  `/api/deliverables/inputs`·`/input-subfolders`. 산출물별 입력파일 UI 패널(종류별
  하위폴더 제안·등록·상태토글). **입력파일_장부.csv write-through/read 동기**(autosync
  패턴 — 할일_장부처럼 ERP↔장부 양방향, 신규행만 import·사람편집 보호).
- 입력파일 업/다운로드(보안우선, 기본 OFF=`DEV_ERP_FILEIO`): `filevault.mjs` path-safety
  게이트(절대/`../`/백슬래시/심볼릭탈출 TOCTOU/널/제어 차단, realpath 이중 봉쇄, _workspaces
  안으로만). 다운로드=등록 입력 화이트리스트, 업로드=01_In 하위 기록+장부 등록(50MB 상한).
  쓰기 경계에서 traversal 포인터 저장 차단. 적대적 검토(9벡터)로 read-outside/write-outside
  없음 확인. 보안 문서 `FILE_IO_SECURITY_20260616.md`. `in_pointer`(01_In) 스캐너 도출.
- 설계 문서 `DELIVERABLE_INPUT_FILES_DESIGN_20260616.md`. 장부 정본·폴더 생성·파일
  라우팅은 Codex(se_foldertree/장부) 소유로 라우팅.

### Revision `working` - dev-erp 팀 사용 백본(계정·다중접속·로컬LLM 동시성)

- dev-erp 에 팀원 다중 접속 백본을 추가: 계정(이메일=메일 인입 키·실제 가입 이름),
  관리자 모드, 인증 엔드포인트(`/api/auth/*`)·계정 관리(`/api/accounts*`), 담당자별
  보기범위(`view=계정id|team`)로 할일·메일 이력 분리, 계정별 메일함(`core_mail.mailbox`).
  비밀번호 해시는 어떤 응답에도 미노출. 계정 0개면 익명 모드로 현행 동작(하위호환).
- 보조용 로컬 LLM 다중 사용자 기초설계: 단일 Ollama 공유 가정에서 ERP 서버가 LLM 호출을
  동시성 게이트(`ERP_LLM_CONCURRENCY`)로 직렬화하고 대기 초과 시 검색 폴백(끊김 방지).
- 설계 문서 추가: `MULTI_USER_TEAM_MODEL_20260616.md`,
  `LOCAL_LLM_MULTIUSER_DESIGN_20260616.md`. 계정별 메일 인입 계약은 Codex 소유로 라우팅.
- 데이터 경계 불변: 원문/첨부·자격증명 미저장, 코어 LLM 0%(제안/검색만), 메타 전송만.
### Revision `working` - standardization HWPX source-text indexes prepared

- Updated the public-safe `standardization_document_samples` knowledge entry to
  record that 2 existing HWPX files were repacked, validated, extracted, and
  indexed in private source-text indexes.
- Kept the 1,446 HWP files blocked until true HWPX export through a verified
  converter or owner-approved GUI export.
- Preserved the public claim ceiling: no document bodies, file names, hashes,
  source chunks, NotebookLM answers, Drive payloads, or private source payloads
  were added to public canon.

## 2026-06-15

### Revision `working` - standardization document sample corpus routed

- Added a public-safe `.registry/knowledge/standardization_document_samples/`
  routing entry for the private company standardization document sample corpus.
- Recorded the public claim ceiling as metadata routing only: private packets
  hold inventory/hash refs, HWPX blockers, NotebookLM manifest materialization,
  and RAG source-card backlog state.
- Kept document bodies, file names, hashes, source chunks, Drive payloads,
  NotebookLM answers, private paths, and company source payloads out of public
  canon.

### Revision `working` - defense quality standards knowledge entry

- Added a public-safe `.registry/knowledge` entry for the prepared defense
  quality management standards source family.
- Registered only source-family routing, RAG validation refs, and blocker
  boundaries for the 56 official-public indexed sources, while keeping source
  bodies, chunks, NotebookLM output, paid standards, HWP body claims, and
  private payloads out of public canon.

### Revision `working` - knowledge audit workflow and launcher added

- Registered `knowledge_source_audit_v0` as the script-backed workflow for the
  private metadata-only knowledge source storage audit runner.
- Added the simple `knowledge_audit` Codex launcher package so the workflow can
  be invoked as `$soulforge-knowledge-audit` after skill sync.
- Kept source payload mutation, raw source decoding, NotebookLM/Drive mutation,
  source truth approval, public canon promotion, and default-route safety out of
  scope; owner decision queues remain advisory follow-up surfaces.

### Revision `working` - knowledge source storage audit runner added

- Added a metadata-only `guild_hall/rag` audit runner that compares `_workmeta`
  source ledgers and source-root bindings against actual source file presence.
- The runner emits private `_workmeta` reports for workspace-backed sources,
  external pointer-only sources, missing originals, duplicate recorded hashes,
  and orphan workspace files without copying, moving, uploading, deleting, or
  decoding source payloads.
- Wired the runner into `guild-hall:rag` plus focused and RAG-wide validation
  scripts with fixture coverage for workspace, external, missing, and orphan
  source storage states.

### Revision `working` - outbound mail attachment selection guard

- Added an outbound-mail guard that separates collected source attachments
  from selected send attachments before any owner-approved send handoff.
- Required duplicate/superseded versions to be excluded or explicitly approved,
  and required requester/customer/external-stakeholder attachments to be
  forwarded only when the owner has approved them as send material.
- Updated the mail style policy and outbound-mail workflow checks so attachment
  existence alone is not enough for send readiness.

### Revision `working` - Windows relative CLI test paths

- Fixed Windows CLI test invocation paths for mission close, morning report,
  and battle log tests by passing repo-relative script paths to spawned Node
  processes instead of URL pathname values.
- This prevents drive-prefixed URL pathname values from being interpreted as
  duplicated drive-prefixed module paths on Windows.

### Revision `working` - UI fixture workspace notes

- Clarified UI public fixture workspace notes so they explicitly describe the
  local-only mount policy with scanning disabled.
- Adjusted the dev ERP slice index wording so doc link checks do not interpret
  an inline code-location note as a relative link.

## 2026-06-14

### Revision `working` - knowledge master inventory runner added

- Added `guild_hall/rag` `master-inventory-refresh` as the deterministic
  metadata-only aggregate runner for the private master knowledge control
  surface under `_workmeta/system/reports/knowledge_wiki/`.
- The runner emits inventory JSON/CSV, summary, reconcile report, RAG refresh
  handoff, candidate priority triage, first sourcebound-review selection, and
  validation log without reading source bodies, NotebookLM answers, embeddings,
  BM25/vector payloads, private payloads, secrets, or runtime absolute paths.
- Documented the master inventory as the recurring control surface in the
  knowledge operating model and `rag_metadata_refresh_v0` README.
- Added explicit `claim_ceiling: observed` to the 5 active public knowledge
  entries that previously lacked an explicit claim ceiling.

### Revision `working` - knowledge wiki/RAG route registration consolidated

- Registered `rag_source_text_quality_review_v0` and
  `rag_work_card_router_v0` in `.workflow/index.yaml` as pilot-executed RAG
  source-text support workflows while keeping them not default-route-safe and
  below source truth, answer authority, project execution authority, owner
  approval, and public canon promotion.
- Extended `.party/knowledge_wiki_cell` and the
  `knowledge_wiki_cell_launcher` Codex bridge so RAG quality/work-card routes
  and the existing LLM wiki stack are optional routes behind the registered
  `knowledge_wiki_pipeline_v0` default entry.
- Updated knowledge/RAG operating docs and the ERP/BOM hierarchy map so the
  launcher skill is the caller-facing route for wiki/RAG knowledge registration,
  with older LLM wiki workflows treated as optional compatibility/narrow routes.
- Kept raw source text, chunks, NotebookLM answers, private payloads, runtime
  absolute paths, secrets, default-route switches, and production-ready claims
  out of scope.

### Revision `working` - SE 폴더트리 ERP 일정 힌트 추가

- Added compact `se_foldertree_generate` schedule hints in
  `.registry/skills/se_foldertree_generate/codex/assets/schedule_rules.yaml`
  so ERP work can reuse source-backed relative date rules without bloating the
  foldertree spec or guessing dates for artifacts with no explicit rule.
- Linked the schedule rules from the Codex bridge, mapping reference, and
  system-development bundled spec while keeping `generate_tree.py` behavior
  unchanged.

### Revision `working` - Opus 2차 독립검증 후속 실행 (안전 batch + active slice 전환)

- 검증 게이트 위신호 차단: `run_root_acceptance`(=`validate`/`done:check`)가
  하드코딩 STEP 리스트라 핵심 게임루프 테스트 8건(canon_validate 검증기 자체·
  mission_close·dungeon_assignment·loop_e2e·night_watch 2종·
  candidate_queue_archive·boot_digest_guard)이 CI 에서 skip 됐음 →
  `validate:core-loop` 신설·양 모드 편입. path-policy 게이트도 `--scope changed`
  라 깨끗한 트리/CI 에서 0파일 no-op → runner step 을 test + `--scope tracked`
  전수로 교체(로컬 빠른 `validate:path-policy` 는 유지).
- active slice 전환: `DEVELOPMENT_ROADMAP_V0` 의 active slice 를
  `snapshot_to_operation_board_v0` → dev-erp(사내 개발팀 운영 콕핏)로 갱신
  (최근 7일 커밋의 78%가 dev-erp 인데 로드맵이 이를 non-goal 로 잠가둔 모순 해소).
  snapshot 슬라이스는 다음 후보로 강등(스펙 보존), Team Ops Board 의 'Full ERP
  scope' non-goal 은 dev-erp 소유로 개정.
- owner 경계 정합: `DOCUMENT_OWNERSHIP`·`AGENT_WORLD_MODEL` 을 guild_hall 포함
  7축으로 동기화, `guild_hall/README` 에 누락 5모듈 보강.
- 온보딩 정합: `AGENT_BOOT_DIGEST`·`TEAM_DAY_1_GUIDE` 의 폐지된 'main push
  금지/전용 branch' 규칙을 `AGENTS.md` 현행(main 직접 작업 허용)으로 동기화,
  boot_digest manifest 재서명.
- 노출 가드: 루트 `.gitignore` 에 secret/credential deny 패턴 추가.
- gateway README 의 stale package caveat 정리(helper 2종 tracked).
- 근거: `_workmeta/system/reports/procedure_capture/20260614_claude_opus48_independent_revalidation.md`.

## 2026-06-13

### Revision `working` - ERP/BOM 계층 구조 지도 추가

- Added `docs/architecture/foundation/SOULFORGE_ERP_BOM_HIERARCHY_V0.md`
  as a public-safe hierarchy map that reads Soulforge like an ERP/BOM:
  canon roots, registry entries, workflow/party catalogs, dev-erp runtime
  modules, widget/API/table layers, knowledge/RAG layers, and private/worksite
  boundaries.
- Linked the map from `docs/architecture/foundation/README.md` so structure
  review starts from the foundation document index.
- Kept private payloads, mail bodies, attachments, local database contents,
  and secret values out of the public document; protected surfaces are described
  by role and repo-relative path only.

### Revision `working` - workspace system inventory gate added

- Added a read-only `_workspaces/system` inventory/classification gate through
  `guild-hall:workspace-system:inventory` and `validate:workspace-system`.
- Added deterministic classes for shared generated views, fixture candidates,
  project moves, knowledge moves, PC-local runtime/tools, cache/temp files,
  repo promotion review, conflicts, and unknown review rows.
- Blocked default RAG and knowledge graph writes to `_workspaces/system/**`
  while the `system` binding is still planned or the local path is not a link;
  PC-local temporary outputs must use `_workspaces/_local/<node_id>/system/**`.
- Updated `docs/ws.md` so other PCs start from the inventory gate and produce a
  dry-run cleanup plan without file mutation or host-local path leakage.

### Revision `working` - workspace path identity policy fixed

- Added a public workspace path identity policy so the same `_workspaces/<name>`
  path cannot mean different physical folders on different PCs unless it is
  explicitly under `_workspaces/_local/<node_id>/`.
- Reclassified `_workspaces/system` as a path-identity controlled shared system
  view, with pre-migration local copies preserved under
  `_workspaces/_local_hold/system/<timestamp>_<node_id>/`.
- Updated workspace, installation, knowledge graph, RAG, Obsidian export, and
  short PC handoff docs so default system outputs use the shared view and
  PC-local experiments use `_workspaces/_local/<node_id>/system/...`.
- Updated workspace junction audit and RAG/knowledge graph path guards to
  recognize `SE_TEMPLATE_LIBRARY`, `_local`, and `_local_hold` boundaries
  without allowing arbitrary `_workspaces` aliases.

### Revision `working` - workspace system check prompt shortcut

- Added `docs/ws.md` as a short hand-typed prompt entry for checking
  `_workspaces/system` or `Systems` sharing/junction drift on another PC.
- The prompt requires repo-relative reporting only, forbids local absolute path
  recording and secret/raw payload inspection, and limits the run to diagnosis
  plus dry-run repair planning unless the owner separately approves mutation.
- Expanded the prompt from diagnosis-only to a per-PC cleanup planning flow:
  classify local workspace-system entries, produce a dry-run cleanup plan, and
  keep all mutation behind explicit owner approval.
- Reframed the prompt goal so each PC drives toward `_workspaces/system` as the
  final junction path: preserve any existing local folder under a repo-relative
  hold location, create the junction only after explicit owner approval, and
  keep shared target paths out of reports.

### Revision `working` - 하네스 강화 B1·B2 (verify_gate + doctor 확장)

- B1: dev-erp `tools/verify_gate.mjs` — 페이즈 종료 기계 체크 9종 +
  AGENT_EXECUTION_CONTRACT_V0 Level 0~3 매핑, 자기검증 테스트, 브라우저
  검증은 도구 비종속 절차 문서(BROWSER_QA_PROCEDURE.md)로 분리.
- B2: doctor safe_smokes 2종 추가 — `platform_binary_native_match`
  (guild_hall/doctor/platform_binary_check.mjs, 외장 볼륨 호스트 이동 시
  네이티브 바이너리 불일치를 npm ci 안내로 검출, doctor_platform_binary_check_v0
  흡수) + `dev_erp_doctor` (dev-erp tools/doctor.mjs: node/syntax/DB 스키마·
  실메타 신선도/gitignore, --live 선택). 전부 표준 Node — Codex 동일 실행.
- B3: `docs/architecture/foundation/AGENT_BOOT_DIGEST_V0.md` — 필독 체인
  (AGENTS+계약+로드맵+PROJECT_MAP ~1,270줄)을 81줄 companion 다이제스트로
  압축 (정본 아님, AGENTS 라우팅 불변 — owner 결정 대기). 드리프트 가드
  `guild_hall/validate/boot_digest_guard.mjs` (원본 해시 manifest, 변경 시
  실패→재검토 후 --update 재서명, 100줄 상한 강제).
- B4: 후보큐 archive 자동화 — `candidate_queue.mjs --archive-closed [--apply]`
  (candidate_queue_archive_policy_v0 흡수). 닫힌 후보를
  `archive/<year>/` 로 이동만(내용 불변, ARCHIVE_INDEX.md 기록), 발견
  로직은 하위 디렉토리 무시라 자연 차폐. 로드맵 저장 규칙에 1줄 등재.
- B5: dev-erp `tools/label_audit.mjs` — event_log 라벨링 우선 원칙
  (used_refs/data_label/project_ref/actor) 커버리지 감사, 읽기 전용,
  --min 게이트 옵션. 첫 감사로 view 이벤트의 project_ref 결손을 발견해
  logView 에 차원 추가.
- B6: INSPECTOR_PROTOCOL.md (도구 비종속 — 계약 Level 2 를 실행 절차로) +
  verify_gate Level>=2 연동. 통합 inspector 패스(fresh) 1회 수행 — B1~B5
  전부 accept, 발견 반영(reject/hold/revise verdict 는 게이트 FAIL 처리).

## 2026-06-13

### Revision `working` - system workspace drift migration runbook added

- Added `docs/architecture/workspace/SYSTEM_WORKSPACE_SYNC_MIGRATION_V0.md`
  as a public-safe coordination runbook for resolving drift in
  `_workspaces/system/` across multiple PCs before deciding whether the
  folder should remain local-only or become an owner-approved shared junction.
- The runbook defines a freeze, metadata-only manifest inventory, hash-based
  comparison classes, conflict handling, shared-root decision points, and
  public/private boundaries without exposing actual workspace files, PC names,
  local absolute paths, cloud account details, raw payloads, or secrets.
- Linked the runbook from `docs/architecture/workspace/README.md` so the team
  can find the migration status and procedure from GitHub.

## 2026-06-12

### Revision `working` - Towed-body sensor stability knowledge entry added

- Added `.registry/knowledge/towed_body_sensor_stability/` as a public-safe
  source-supported reusable knowledge entry for towfish stability, tow point
  and CG/CB separation, internal liquid damping mechanisms, vibration
  isolation, cable strumming, appendage case planning, and pointing error
  budgeting.
- Registered only public source references and bounded mechanism claims,
  including NASA/NTRS, NREL, ITTC, OSTI, NAVSEA/Navy public records, NOAA,
  NIST, USGS, and supporting open technical literature.
- Kept SONAR2093 design intent, P26-014 acceptance, private reports, raw
  payloads, NotebookLM answers, vendor source truth, and numerical reverse
  engineering values out of the public registry entry.

### Revision `working` - Team Ops Board MVP 1: 로컬 실동작 앱 1차 구현

- owner 결정(2026-06-12): 진실 저장소는 하이브리드(Option C, Smartsheet 가
  공식 프로젝트 장부로 유지), 팀원 직접 수정 + 전 변경 감사 로그, UI 한국어
  우선. 2026-06-02 fresh design 의 MVP 1 을 시작 조건 충족으로 착수.
- `ui-workspace/apps/team-ops-board` 추가 (MVP 0 목업은 동결 유지):
  localStorage 영속 저장, CSV 내보내기/가져오기(UTF-8 BOM, 행 단위 오류
  보고), 담당/프로젝트/상태/기간/검색 필터, 전 변경 감사 추적(누가/언제/
  이전→이후), 일일 기준선 고정과 기준선 대비 변경 표시, JSON 백업/복원,
  차단 사유·대기 대상 입력 강제. 코어 로직은 의존성 없는 `src/core/*.mjs`
  모듈로 분리.
- 명령 표면: root `ui:team-ops-app:dev/build/preview/test`,
  `validate:team-ops-app`, ui-workspace `team-ops-app:*` 추가, 새 앱을
  `ui:build` 체인에 포함.
- 검증: 코어 node:test 9/9 통과, `tsc --noEmit` 통과, ui
  `docs:check-links` 통과 (Linux sandbox). vite 빌드와 `ui:done:check` 는
  sandbox esbuild 플랫폼 제약으로 owner PC 에서 재실행 필요
  (`npm run ui:workspace:install` 후 `npm run ui:build`).
- 근거: `_workmeta/system/reports/procedure_capture/team_ops_board_fresh_design_20260602.md`
  의 MVP 1 범위. owner 결정 기록은
  `_workmeta/system/reports/procedure_capture/team_ops_board_mvp1_owner_decision_20260612.md`.
  작업자: `claude_fable-5`, branch `claude/fable5-deep-verification`,
  merge 전 owner/Codex 검증 대상.

### Revision `working` - Fable5 심층 검증: 장기 사용성 후보 12건 기록

- Fable 5 심층 검증(비전-실태 격차, 규칙 질량 대비 1인 운영 부담, 정본
  경계 drift, 문서 신선도)을 수행하고 결과를 backlog 기록으로만 남겼다.
  이번 변경에 동작/구조 수정은 없다.
- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` 다음 후보 표에
  10~21행을 추가했다: mission 경량 등록 경로, workflow/skill 사용 ledger,
  AI 세션 boot digest, foundation 문서 staleness 정리, CHANGELOG rotation,
  `.workflow` lifecycle/calibrations 위치 재결정, candidate queue archive
  규칙, doctor 플랫폼 binary 점검, 종료 절차 경량화 검토, V0 버전 기준,
  knowledge/RAG 통합 색인, Python 테스트 확장.
- 후보 10~17 의 상세 패킷 8건은 `_workmeta/system/dev_worker_candidate_queue/`
  에 `status: proposed`, `owner_approval.approved: false` 로 남겼다. 승인
  전에는 실행 큐로 승격하지 않는다.
- 검증 과정에서 양호로 판정한 항목(공개 문서 깨진 링크 0/164, done:check
  가 validate 단계를 포함하는 구조, node_modules gitignore 상태, 후보 큐
  처리율 17/20)은 후보에서 제외했다.
- 근거: 2026-06-12 Fable5 심층 검증 (owner 요청). 작업자: `claude_fable-5`,
  branch `claude/fable5-deep-verification`, merge 전 owner/Codex 검증 대상.

### Revision `working` - DB/검색 슬라이스: SQLite projection 스키마 계약과 Team Day-1 가이드

- `docs/architecture/guild_hall/SQLITE_PROJECTION_V0.md` 를 추가해 daily
  ledger, mission index, battle log 일 단위 aggregate, activity event 를
  local read-only SQLite projection 으로 모으는 스키마(DDL v0), loader 계약,
  FTS5 PoC 경계, rebuild-from-files 원칙을 고정했다. DB 파일은
  `guild_hall/state/projection/` local-only 로 두고 어떤 repo 에도 commit
  하지 않는다. loader/FTS5 구현은 Codex 몫으로 남긴다.
- `docs/architecture/foundation/TEAM_DAY_1_GUIDE_V0.md` 를 추가해 팀
  합류자/새 PC 운영자의 첫날 읽기 순서, 정본 7축 요약, 첫 명령, 경계
  5가지, 첫 기여 체크리스트를 한 장으로 고정했다.
- `docs/architecture/foundation/README.md` 와
  `docs/architecture/guild_hall/README.md` 색인에 두 문서 행을 추가했다.
- 근거: 20260611 보안 슬라이스 패킷의 DB/검색 슬라이스(6/18-20) Fable 5
  산출물 선행 작성. 작업자: `claude_fable-5`, merge 전 Codex 검증 대상.

### Revision `working` - 루프 슬라이스: triage board 계약, loop e2e 테스트 초안, 게임-업무 용어 대조표

- `docs/architecture/guild_hall/TRIAGE_BOARD_V0.md` 를 추가해
  `operation_board.sections.triage_board` projection 의 field 계약,
  metadata-only 입력 경계(INBOX triage register 의 count/date 신호만),
  validation 규칙, 구현 순서를 고정했다. 구현은 Codex 몫으로 남긴다.
- `guild_hall/snapshot/loop_e2e.test.mjs` 를 추가했다.
  `monster -> mission -> battle log` 가 synthetic fixture 에서 operation
  board 까지 보이는지 한 테스트로 고정하고, triage board 와 promotion
  projection 은 `test.todo` 로 남겼다. validate 스크립트 연결은 구현과 함께
  Codex 가 수행한다 (단독 실행: `node --test`, 현재 1 pass / 2 todo).
- `docs/architecture/foundation/SHARED_GLOSSARY_V0.md` 에 게임 용어 ↔ 업무
  용어 대조표 섹션을 추가해 팀 합류자가 게임식 표시 이름을 업무 용어로 읽을
  수 있게 했다.
- `docs/architecture/guild_hall/README.md` 색인에 triage board 계약 행을
  추가했다.
- 근거: 20260611 보안 슬라이스 패킷의 루프 슬라이스(6/15-17) Fable 5 산출물
  선행 작성. 작업자: `claude_fable-5`, merge 전 Codex 검증 대상.

### Revision `working` - index drift 정리: 정본 7축 표기와 party 한글 표면 보정

- `docs/architecture/foundation/REPOSITORY_PURPOSE.md` 의 `정본 6축` 을
  `AGENTS.md` 정본 구조와 일치하는 `정본 7축` 으로 갱신하고, 구조 개요도에
  `guild_hall` cross-project operations root 노드를 추가했다.
- `.party/pcb_revision_library_cell/party.yaml` 과
  `.party/systems_engineering_cell/party.yaml` 의 `primary_name_ko` 영문값
  2건을 한글(`설계자산`, `체계공학`)로 보정했다.
- `.workflow/authoring/` 의 승격 전 사본 2건(se_stage_artifact_gap_scan_v0,
  test_evaluation_execution_result_ingest_v0)은 승격본과 동일하지 않고
  authoring 전용 `task_note.md` 를 포함해 기계적 제거 조건을 충족하지 않았다.
  orphan workflow 2건(rag_source_text_quality_review_v0, rag_work_card_router_v0)
  과 함께 owner 결정 항목으로 `_workmeta/system` 기록에 남긴다.
- 근거: 20260611 보안 슬라이스 패킷 Task D (감사 취약점 #13, #14).
  작업자: `claude_fable-5`, merge 전 Codex 검증 대상.

### Revision `working` - control center file PUT 쓰기 토큰 가드 추가

- `ui-workspace/apps/renderer-web/controlCenterPlugin.ts` 의 control center
  file PUT API 에 `SOULFORGE_CONTROL_CENTER_WRITE_TOKEN` 기반 쓰기 가드를
  추가했다. 토큰 미설정 시 모든 PUT 은 403 으로 차단되고(fail-closed),
  GET/tree/snapshot 읽기 경로는 기존대로 동작한다.
- `docs/architecture/ui/UI_CONTROL_CENTER_MODEL.md` 핵심 원칙에 쓰기 가드
  한 줄을 동기화했다.
- 근거: 2026-06-11 Claude Fable 5 read-only 감사 취약점 #2 (무인증 write API),
  `_workmeta/system/reports/procedure_capture/20260611_claude_fable5_security_slice_packet.md`
  Task A. 작업자: `claude_fable-5`, branch `claude/fable5-slices-20260612`,
  merge 전 Codex 검증 대상.

### Revision `working` - Claude Code 용 CLAUDE.md 임포트 추가

- 루트에 `CLAUDE.md` 를 추가해 `@AGENTS.md` 한 줄로 저장소 헌장을 임포트하게 했다.
  Claude Code CLI 가 Codex 와 동일한 `AGENTS.md` 지침을 자동 로드한다.
- 이 변경은 `claude/add-claude-md` branch 에서 `claude_fable-5` 가 작성했고,
  merge 전 검증은 owner/Codex 몫으로 남겼다.

## 2026-06-11

### Revision `working` - Workflow generator provenance gaps closed by retrofit verdicts

- Added workflow-generator retrofit verdict evidence for the remaining
  generator-provenance gap queue under `_workmeta/system`, closing the
  registered workflow generator gap status without broad package logic rewrites.
- Preserved existing workflow logic and calibration evidence where packages
  were already valid, including simulation, RAG metadata/wiki, SE governance,
  and legacy active workflow packages.
- Kept default routes, party bindings, registrations, production-ready claims,
  private payloads, source payloads, and secrets unchanged.

### Revision `working` - Supplemental RAG workflow draft calibrations added

- Added public-safe synthetic quality-equivalence calibrations for the two
  unregistered RAG workflow packages that were outside the initial registered
  workflow precheck:
  `.workflow/rag_source_text_quality_review_v0/` and
  `.workflow/rag_work_card_router_v0/`.
- Recorded supplemental all-workflow profile-policy scan evidence under
  `_workmeta/system` showing 62 workflow packages and no remaining optimizer
  profile-policy gaps.
- Kept both RAG workflows unregistered and not default-route-safe; no index
  update, owner approval, source-truth claim, private payload, source text,
  NotebookLM answer/conversation payload, or production-ready claim was added.

### Revision `working` - Remaining workflow optimizer gap queue completed

- Added public-safe synthetic quality-equivalence calibrations for the final
  optimizer gap queue:
  `.workflow/se_assistant_operating_loop_v0/`,
  `.workflow/long_thread_handoff_v0/`,
  `.workflow/codex_thread_manager_v0/`, and
  `.workflow/daily_work_ledger_capture_v0/`.
- Updated each workflow profile policy to an active calibrated policy and
  recorded optimizer/workflow-check evidence under `_workmeta/system`.
- Closed the active optimizer sweep status with no remaining
  missing/placeholder optimizer entries, while keeping live pilots,
  default-route changes, production-ready claims, private payloads, and secrets
  out of scope.

### Revision `working` - Outlook mail reconcile calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/outlook_mail_reconcile_v0/` and updated its profile policy from
  placeholder to an active measured policy.
- Recorded optimizer run and workflow-check evidence under `_workmeta/system`.
- Kept real Outlook access, Outlook mutation, mail body/HTML/msg/eml payloads,
  attachment payloads, attachment filename basis, project ledger writes,
  project mail-row publication, secrets, default-route changes, and
  production-ready claims out of scope.

### Revision `working` - External reasoning workspace calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/external_reasoning_workspace_v0/` and updated its profile policy
  from uncalibrated runtime binding to an active measured controller-profile
  policy.
- Kept the external ChatGPT mode label as a visible user-authorized runtime
  selection rather than a hard-coded model or account claim.
- Recorded optimizer run and workflow-check evidence under `_workmeta/system`.
- Kept real browser actions, real ChatGPT prompt submission, cookies, tokens,
  passwords, session/storage inspection, raw URLs, account ids, conversation
  ids, transcripts, uploads, share links, account/permission/payment changes,
  default-route changes, and production-ready claims out of scope.

### Revision `working` - Outbound mail workflow calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/outbound_mail_authoring_v0/` and updated its profile policy from
  not-requested placeholder to an active measured policy.
- Recorded optimizer run and workflow-check evidence under `_workmeta/system`.
- Kept real mail sends, Outlook mutation, SMTP action, real recipient payloads,
  attachment payloads, footer payloads, secrets, default-route changes, and
  production-ready claims out of scope.

### Revision `working` - AI 작업자 표기와 비-Codex 작업 branch 규칙 추가

- `AGENTS.md` 업무 기록 규칙에 AI 작업자의 도구+모델 표기 규칙을 추가했다.
  예: `codex_gpt-5.3`, `claude_fable-5`.
- Codex 외 AI 도구의 직접 수정을 전용 작업 branch 로 제한하고 merge 전
  owner/Codex 검증을 요구하는 규칙을 추가했다.
- 이 변경은 `claude/fable5-actor-logging-rule` branch 에서 `claude_fable-5` 가
  작성했고, 호스트 검증(`npm run validate`)은 merge 전 Codex 몫으로 남겼다.

## 2026-06-09

### Revision `working` - Latest update workflow calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/latest_update_sync_and_followup_v0/` and updated its profile policy
  from draft/default to an active measured policy.
- Recorded optimizer run and workflow-check evidence under `_workmeta/system`.
- Kept real pulls, skill syncs, junction audits/repairs, host-local cloud roots,
  default-route changes, and production-ready claims out of scope.

### Revision `working` - GitHub upload workflow calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/github_upload_publish_v0/` and updated its profile policy from
  draft/default to an active measured policy.
- Recorded per-workflow generator retrofit, optimizer run, and workflow-check
  evidence under `_workmeta/system`.
- Kept real git commands, commits, pushes, default-route changes, and
  production-ready claims out of scope.

### Revision `working` - Workflow canon sweep evidence added

- Added the missing `.workflow/meeting_followup/README.md` package surface so
  the registered workflow matches the `.workflow` package-shape contract.
- Recorded a metadata-only workflow-generator provenance sweep and optimizer
  preflight under `_workmeta/system`, separating package defects from missing
  provenance and blocked optimizer prerequisites.
- Kept default routes, party bindings, registration state, and production-ready
  claims unchanged.

### Revision `working` - Codex worker subagent-first policy tightened

- Updated `$soulforge-codex-thread-manager` and
  `.workflow/codex_thread_manager_v0/` so role worker threads are
  subagent-first lane controllers for substantive research, implementation,
  analysis, debugging, or review work.
- Added named no-subagent exceptions for lane planning, packet authoring, small
  deterministic local checks, integration, validators/status commands,
  manager-authorized narrow mechanical edits, unavailable subagent tools, and
  unsafe minimal packet boundaries.
- Required workers to record subagent use or a no-subagent exception, so direct
  worker execution becomes the exception rather than the default.

### Revision `working` - Codex thread manager verifier independence tightened

- Updated `$soulforge-codex-thread-manager` and
  `.workflow/codex_thread_manager_v0/` so fork, rollover, and continuation are
  same-role continuity surfaces, not independent verification evidence.
- Required fresh-context verifier, judge, reviewer, workflow-check, or
  acceptance lanes for claims that depend on independent judgment.
- Defined minimal verifier packets around objective, changed refs, acceptance
  criteria, validators, claims, and risk areas while excluding raw transcript
  leakage.
- Added stop/claim-lowering behavior when a fresh independent verifier is
  unavailable for a stronger readiness or approval claim.

### Revision `working` - Outbound mail authoring workflow added

- Added `.workflow/outbound_mail_authoring_v0/` as a registered structure-only
  workflow for owner-style outbound mail drafting, project keyword subject
  resolution, mandatory signature/security footer checks, and owner-approved
  send handoff preparation.
- Set the workflow footer preference to the Outlook default signature logical
  name `서명+보안`, while keeping the account-specific suffix and exact footer
  payload out of public canon.
- Registered `/outbound-mail` as the human-facing alias while keeping default
  external send authority disabled.
- Added `.registry/skills/outbound_mail_authoring/` as the thin Codex launcher
  skill that resolves to the workflow and reads workflow-owned profile policy
  at execution time.
- Kept exact project keyword tables, raw mail bodies, attachment payloads,
  secrets, exact footer contact values, and full company security disclaimer
  text out of public workflow canon.

### Revision `working` - Workflow launcher skill author added

- Added `.registry/skills/workflow_launcher_skill_author/` as the tracked
  Codex authoring aid for turning existing `.workflow/<workflow_id>/` packages
  into thin launcher skills.
- Mirrored the existing party launcher author pattern while keeping workflow
  bodies, step graphs, profile policies, optimizer outputs, project payloads,
  and runtime bindings outside the generated launcher skill.
- Added guidance for default launcher ids by stripping trailing workflow
  version suffixes, for example `outbound_mail_authoring_v0` to
  `outbound_mail_authoring`.

### Revision `working` - Codex thread manager launcher semantics tightened

- Updated `$soulforge-codex-thread-manager` so explicit invocation with an
  actionable goal is treated as authorization for the current Codex thread to
  act as manager and create a bounded worker Codex thread when runtime tools are
  available.
- Kept fresh manager creation for rollover, cross-PC/overnight continuity,
  mission-boundary changes, context drift, or explicit request rather than the
  default launcher behavior.
- Added worker subagent rules: bounded worker subagents are allowed by default
  when useful, worker packets must state subagent bounds or denial, and larger
  side effects require manager permission.
- Added routing rules separating non-durable subagent work from durable Codex
  worker threads, and clarified that worker threads may create bounded
  subagents inside their assigned lane.
- Re-centered the workflow on the declared thread as main team lead for long
  context management: handoff refresh, compact, clear/reset, rollover,
  re-anchoring, role worker threads, cross-worker result routing, and worker
  subagent fan-out.
- Removed the fixed worker-subagent count. Worker subagent fan-out is now
  scope-driven unless the manager packet sets a specific limit.

### Revision `working` - Mail send style policy added

- Added `MAIL_SEND_STYLE_POLICY_V0.md` to lock draft, approval, Outlook manual
  sending, subject, body style, and metadata-only sent-mail recording rules.
- Corrected the subject convention so outgoing mail uses real mail keywords
  such as `[기뢰전]`, not internal company/Soulforge project numbers.
- Required final sent mail to retain the owner Outlook footer block: signature
  plus company security notice, exactly once.
- Kept actual mail bodies, raw Outlook items, attachments, private paths,
  secrets, and recipient payloads out of the public contract.
- Linked the policy from the existing mail send/workspace docs while leaving
  the SMTP runner and Outlook reconcile workflows under their existing owners.

### Revision `working` - O-ring calculator tool canon registered

- Added `.registry/tools/oring_selection_calculator/` as a limited-authority
  canonical tool entry for first-pass O-ring squeeze, installed-stretch, and
  gland-fill screening.
- Kept the actual workbook outside public canon as a workspace artifact with
  private metadata pointers, and recorded that the tool does not replace
  manufacturer catalogs, official size tables, tolerance analysis, extrusion
  review, or owner engineering judgment.

### Revision `working` - Charge breaker and evidence sift bridges added

- Added tracked Codex bridges for `charge_breaker` and `evidence_sift` so the
  existing canon skills sync into global installed skills as
  `$soulforge-charge-breaker` and `$soulforge-evidence-sift`.
- Kept both bridges lean: `charge_breaker` owns only localized blocker forward
  pressure, and `evidence_sift` owns only claim-confidence separation before
  drafting or deciding.
- Updated the skill registry README without moving workflow, owner approval,
  source truth, or validation authority into either skill.

### Revision `working` - Browser recovery standing approval documented

- Recorded the owner's standing approval for Soulforge agents to recover
  Chrome/Codex browser connections across threads without repeated prompts.
- Scoped the approval to opening the selected Chrome profile window, retrying
  Codex Chrome connection, and running non-secret local setup checks for an
  already requested browser-backed task.
- Kept external transmission, uploads, permission changes, purchases, CAPTCHA,
  secret handling, and extension/software install or repair under the existing
  action-time confirmation and secret-boundary rules.

## 2026-06-08

### Revision `working` - Codex thread manager workflow draft added

- Added `.workflow/codex_thread_manager_v0/` as a public-safe pilot-ready
  workflow package for actual Codex manager, worker, and worktree thread
  orchestration.
- Captured manager lifecycle, `NIGHT_WORK_HANDOFF` refresh, worker packet
  shape, thread id/title recording, manager rollover acceptance, worktree
  boundary routing, recursive fan-out blocking, and conservative closeout rules.
- Kept the package unregistered: no `.workflow/index.yaml` registration, no
  `.party` chain, no registry skill bridge, no default-route-safety claim, no
  production-ready claim, and no full manager rollover/worktree-worker execution
  claim.

### Revision `working` - Codex thread manager registered bridge completed

- Added `.registry/skills/codex_thread_manager/` as the tracked Codex launcher
  for invoking the `codex_thread_manager_v0` workflow through installed skill
  `$soulforge-codex-thread-manager`.
- Registered `.workflow/codex_thread_manager_v0/` in `.workflow/index.yaml` and
  raised the package from pilot-ready draft to registered public-safe workflow
  bridge.
- Kept the same non-party structure as `long_thread_handoff_v0`: no `.party`
  chain, no default-route switch, no production-ready claim, and no full manager
  rollover/worktree-worker execution claim.

### Revision `working` - Dual deep research external lanes added

- Extended `.workflow/dual_deep_research_v0/` to keep its NotebookLM CLI +
  Codex direct research core while allowing optional Gemini and GPT web Deep
  Research advisory packets before comparison.
- Added external Deep Research packet, comparison, handoff, boundary, role, and
  monster-rule coverage so Gemini/GPT reports remain independent, advisory, and
  public-safe.
- Updated the canonical `dual_deep_research` Codex launcher metadata to trigger
  for Gemini/GPT Deep Research comparison requests without moving account auth,
  Drive upload, source truth, owner approval, or canon promotion authority into
  the skill.

## 2026-06-07

### Revision `working` - External GPT launcher skill added

- Added `.registry/skills/external_gpt/` as the tracked Codex
  launcher for invoking the registered `.workflow/external_reasoning_workspace_v0`
  workflow by skill name, with installed invocation
  `$soulforge-external-gpt`.
- Kept the launcher thin: the workflow still owns browser preflight,
  same-goal session reuse, sanitized prompt packets, DOM message-role readback,
  advisory handoff, profile policy, and public/private side-effect boundaries.
- Preserved non-claims: no party binding, no default-route switch, no source
  truth, no validation authority, no production-ready claim, and no
  default-route-safety claim.

### Revision `working` - External reasoning workspace registered

- Registered `.workflow/external_reasoning_workspace_v0/` in
  `.workflow/index.yaml` after the owner requested making the workflow official.
- Updated the package state from draft/unregistered to registered while keeping
  the existing private pilot evidence boundary: advisory-only output, no source
  truth, no validation authority, no production-ready claim, and no
  default-route-safety claim.
- Kept party binding and runtime profile selection unbound; browser session
  pointers, raw transcripts, account-bound ids, cookies, credentials, and
  private payloads remain outside public canon.

### Revision `working` - Healer snapshot refresh added

- Updated healer runs to refresh the local sanitized snapshot before always-on
  freshness checks, so gateway metadata changes do not repeatedly trigger
  `latest_snapshot_map_freshness` failure notifications.
- Ignored accidental literal `$CODEX_HOME/` runtime mirrors at the repo root so
  local automation memory files are not treated as public changed-scope source.
- Corrected the mail task register latest-file boundary to resolve relative
  projection paths against the active repo root while still checking realpaths
  for denied private-state, mailbox, and `_workspaces` targets.
- Kept the behavior local-state only: no automatic commit, push, merge, reset,
  stash, raw mail payload read, or secret/env inspection was added.

### Revision `working` - External reasoning workspace workflow draft added

- Added `.workflow/external_reasoning_workspace_v0/` as a public-safe draft
  workflow package for a session-aware external ChatGPT advisory browser loop.
- Captured bounded goal and side-effect authorization, Chrome/ChatGPT preflight
  without secret inspection, same-goal conversation reuse, visible
  user-authorized Pro / Thinking-like mode label selection, marker/nonce prompt
  packets, DOM message-role readback, default turn limits, and advisory handoff
  rules.
- Kept the package unregistered: no `.workflow/index.yaml` change, no raw
  private payloads or transcripts, no account-bound URLs or ids, no source-truth
  or verifier-authority claim, and no default-route-safety claim.
- Recorded bounded private pilot evidence with marker-verified assistant-role
  DOM readback. This upgrades the package claim only to private pilot execution
  evidence; it remains unregistered and makes no production-ready or
  default-route-safety claim.

### Revision `working` - External reasoning workspace handoff captured

- Added a public-safe external reasoning workspace candidate note for using a
  session-aware ChatGPT Pro / Thinking browser loop as an advisory support lane.
- Documented that `long_thread_handoff_v0` remains the manager/checkpoint owner
  while any future `external_reasoning_workspace_v0` workflow should own Chrome
  session preflight, bounded prompt packets, multi-turn DOM readback, private
  URL pointers, and side-effect boundaries.
- Kept raw transcripts, account-bound conversation/project identifiers, secrets,
  cookies, local storage, credentials, and external validation claims out of the
  public repo.

## 2026-06-06

### Revision `working` - Knowledge RAG candidate ledger added

- Added `guild_hall/knowledge_access/knowledge_rag_candidate_ledger.mjs`
  with metadata-only candidate row building, validation, append-only JSONL
  capture, and batch dry-run triage for deferred knowledge/RAG candidates.
- Added `candidate-ledger-append`, `candidate-ledger-validate`, and
  `candidate-ledger-triage` to the knowledge access CLI, plus
  `validate:knowledge-rag-candidate-ledger` and coverage in
  `validate:knowledge-access`.
- Documented `_workmeta/<system|Pxx-xxx>/knowledge_rag_candidate_ledger/**`
  as the runtime storage surface while keeping raw payloads, Office/PDF/HWP
  refs, NotebookLM answers, private prompts/questions, source-text chunks,
  sourcebound review, RAG ingestion, ontology/canon promotion, graph mutation,
  archive, and retire actions out of scope.

### Revision `working` - Daily work ledger validator and renderer added

- Added `guild_hall/daily_ledger/` with an explicit-file/ref validator, CLI,
  and ledger-only Markdown draft renderer for project, `P00-000_INBOX`, and
  Soulforge sub-ledger daily ledgers.
- Added `validate:daily-ledger` and root acceptance wiring, with fixture tests
  for project/inbox/Soulforge ordering, missing/incomplete gaps, raw payload
  refs/fields, runtime paths, secret-like refs, invalid project codes, unknown
  sub-ledgers, and non-ledger renderer inputs.
- Documented the automation boundary while keeping live `_workmeta` scans,
  raw mail/attachment/Office/PDF/HWP/waveform payloads, `_workspaces` payloads,
  git/system-log rediscovery, project-code truth, and production rollout out of
  scope.

### Revision `working` - Mail task register always-on lane added

- Added `guild_hall/gateway/mail_task_register.mjs` and the
  `register-mail-tasks` gateway CLI command to convert safe exact-route
  `mail_work_priority` rows into project-local open-action Markdown rows.
- Kept the command dry-run by default; `--apply` is required for
  `_workmeta/<project_code>/reports/open_actions/open_action_register.md`
  writes, and non-exact/P00/personal/promo/terminal/raw-boundary rows stay
  owner-review or skipped.
- Added optional `--notify` queueing through existing town_crier
  `mail_received` gateway policy and reported private metadata sync as manual
  commit/push preparation, not an automatic raw data copy.

### Revision `working` - Mail projection private-state rebuild policy documented

- Documented that `mail_candidate` queue/status projections and
  `mail_work_status` / `mail_work_priority` latest JSON outputs are not
  mirrored into `private-state`.
- Clarified that owner-with-state PCs restore only the existing private-state
  continuity allowlist and rebuild body-safe activity summaries, mail work
  projections, and Assistant Dashboard health locally.
- Added dashboard guidance to show missing/stale/degraded mail projection state
  instead of treating private-state copies as source truth.
- Kept raw mail bodies, HTML, attachment payloads, attachment names/URLs/paths,
  secrets, `_workspaces` payloads, and private-state allowlist expansion out of
  scope.

### Revision `working` - Team Ops Board package-clean caveat resolved

- Verified the standalone Team Ops Board mockup app files are tracked under
  `ui-workspace/apps/team-ops-board-mockup/`.
- Documented that the mockup is a tracked `ui-workspace` app package included
  in the Team Ops, UI workspace, and root UI build paths.
- Kept this to sample-data package tracking only: no Smartsheet integration,
  private project data, raw mail or attachments, `_workspaces` payload,
  renderer-web integration, write-back behavior, or source-of-truth behavior was
  added.

### Revision `working` - Gateway helper package-clean caveat resolved

- Verified `guild_hall/gateway/mail_candidate_backlog.mjs` and
  `guild_hall/gateway/deadline_watchdog_reminder.mjs` are tracked package refs.
- Changed gateway CLI package coverage from the previous skip diagnostic to a
  hard tracking assertion, so gateway index validation no longer carries the
  package-clean caveat skip.
- Updated the mail work status and deadline watch contracts to mark the helper
  tracking gate closed while keeping raw mail, attachment payload, `_workspaces`
  payload, and secret reads out of scope.

### Revision `working` - Project mail history XLSX readability implemented

- Reformatted the JavaScript project mail-history XLSX export into
  human-readable ledger sheets for all mail, received mail, sent mail, and
  review-needed rows.
- Added frozen/filterable headers, readable widths, wrapped subject/status/source
  text, date and attachment-count formatting, and a hidden technical metadata
  sheet while keeping CSV and ICS behavior unchanged.
- Added XLSX smoke coverage proving the export avoids raw mail bodies,
  attachments, raw paths, and secrets.

### Revision `working` - Shared glossary added

- Added a public-safe Korean-facing shared glossary for Soulforge development
  terms including candidate, approval, execution queue, RAG, canon,
  sourcebound review, claim ceiling, workflow, party, mission, and dev-worker
  queue.
- Linked the glossary from the foundation index and root README as a vocabulary
  bridge, not a new backlog owner or source-truth surface.
- Kept private project payloads, raw source content, mail bodies, attachments,
  and secrets out of the glossary.

### Revision `working` - Mail quoted-chain project routing evidence added

- Extended mail project routing suggestions so private-deep body/html matches
  can distinguish current-message evidence from quoted reply/forward-chain
  evidence.
- Added `route_source: quoted_chain_private_deep`, `route_source:
  mixed_private_deep`, and `quoted_body` / `quoted_html` matched surfaces for
  reply/forward cases while keeping raw body, raw HTML, attachment filenames,
  URLs, and provider payloads out of routing outputs.
- Added gateway mail-candidate regression tests for quoted-only, mixed
  current/quoted, HTML blockquote, current `Subject:` line, and split required
  term routing cases.

### Revision `working` - Outlook project mail reconcile workflow draft added

- Added an authoring draft workflow for metadata-only Outlook sent-mail
  reconciliation and received-mail cross-validation.
- Kept the workflow unregistered, with Outlook mutation, raw body reads,
  `.msg` export, attachment export, secrets, and public project mail rows out of
  scope.
- Preserved `_workmeta` project mail history as the source-truth ledger and
  treated `_workspaces` XLSX files only as readable owner-facing exports.

### Revision `working` - Outlook mail reconcile workflow registered

- Promoted the Outlook project mail reconciliation draft into registered
  workflow `outlook_mail_reconcile_v0`.
- Added short human invocation alias `/outlook-reconcile` while keeping canonical
  execution resolution on `outlook_mail_reconcile_v0`.
- Kept the workflow structure-only and metadata-only: no Outlook mutation, no
  raw body reads, no `.msg` or attachment export, no default-route authority,
  and no pilot-execution claim.

### Revision `working` - Outlook mail reconcile launcher skill added

- Added `.registry/skills/outlook_mail_reconcile/` as the tracked Codex launcher
  for invoking `/outlook-reconcile` through registered workflow
  `outlook_mail_reconcile_v0`.
- Kept the launcher thin: it resolves workflow-owned contracts at execution
  time and does not copy Outlook runtime state, mail payloads, profile policy,
  project ledger rows, or mutation authority into the skill.
- Documented that legacy Outlook `.msg` intake and expansion routes are not
  canonical dependencies of the metadata-only reconciliation launcher.

### Revision `working` - Outlook reconcile default project scope corrected

- Updated `outlook_mail_reconcile_v0` so `/outlook-reconcile` defaults to all
  Codex-managed project mail ledgers when the user does not name a project.
- Excluded unresolved inbox holding ledgers such as `P00-000_INBOX` from
  automatic project sync while keeping them available as review/mapping buckets.
- Clarified that the planned Codex-managed Outlook folder area is a separate
  owner-approved Outlook operations task; the reconcile workflow still does not
  create folders, move mail, or edit Outlook rules.

### Revision `working` - Daily automation post-ledger checks recorded

- Extended `.party/daily_automation_party/` so the evening activity-sync to
  daily-ledger flow now hands off to `npm run guild-hall:snapshot` and then
  `npm run validate:workmeta-payload` before night watch runs.
- Documented the snapshot refresh as a local state regeneration step for
  healer and operation-board freshness, and the workmeta-payload validation as
  a metadata-boundary receipt.
- Kept the additions as command-backed handoffs, not new workflow
  registrations, scheduler ACTIVE/PAUSED state, or raw/private payload writes.

### Revision `working` - Healer failure notification route fixed

- Allowed `town_crier` to process `healer_failed` pending notifications so a
  healer failure queue item no longer loops as
  `invalid_pending_request:unsupported_owner_scope`.
- Normalized the synthetic marker assertion so the healer failure notification
  test passes on Windows text-mode newline output.
- Localized healer run summaries, next actions, and failure notification text
  into Korean for owner-facing reports and Telegram messages.
- Kept mail fetch, mailbox storage, and public/private payload boundaries
  unchanged.

### Revision `working` - Daily automation party registered and locally bound

- Promoted `daily_work_ledger_capture_v0` from workflow authoring into
  `.workflow/daily_work_ledger_capture_v0/` and registered it in
  `.workflow/index.yaml`.
- Promoted `daily_automation_party` into `.party/daily_automation_party/` and
  registered it in `.party/index.yaml`.
- Bound the local daily automation concept so morning and evening activity sync
  are followed by daily work ledger capture before report rendering.
- Kept scheduler clock and ACTIVE/PAUSED state in the local Codex app
  automation layer, not public canon.

### Revision `working` - Daily automation party draft added

- Added `.party/authoring/daily_automation_party/` as a draft cadence party
  where the existing morning and evening activity sync automations hand off to
  daily work ledger capture before owner-facing reports consume ledgers.
- Kept the party unregistered in `.party/index.yaml` and made no Codex app
  automation, launchd, scheduler, or default-route state change.
- Updated the automation party model and Codex app automation catalog so the
  future `Soulforge Daily Work Ledger Collector` runs after activity sync
  receipts instead of acting as a report-time search job.

### Revision `working` - Daily work ledger taxonomy and capture workflow draft added

- Added `.workflow/authoring/daily_work_ledger_capture_v0/` as a
  workflow-generator-authored draft for writing company project,
  `P00-000_INBOX`, and Soulforge sub-ledger daily work ledgers from approved
  metadata surfaces before reports run.
- Kept the draft unregistered in `.workflow/index.yaml`, unbound from
  `daily_automation_party`, and separate from Codex app local schedule state.
- Added metadata-only ledger, skipped-source, review-needed, receipt, handoff,
  and boundary-review templates so later report renderers can read ledgers only.
- Clarified that `P00-000_INBOX` is the reserved company general/unresolved
  work ledger for real company work without a confirmed project code, separate
  from the Soulforge system ledger and personal/promotional buckets.
- Added `docs/architecture/workspace/DAILY_WORK_LEDGER_TAXONOMY_V0.md` to fix
  the owner-facing split between confirmed company projects, company
  general/unassigned work, and Soulforge sub-ledgers.

### Revision `working` - Automation party operating model added

- Added a project-wide automation party operating model that separates
  workflow, party, cadence party, local scheduler, ledger, and report
  authority.
- Strengthened the rule that recurring jobs must enter the daily, weekly, or
  monthly party worldview before becoming shared Codex app automation defaults.
- Documented the daily work ledger collector as a daily automation party stage,
  keeping collection separate from report rendering.

### Revision `working` - Project mail history XLSX readability candidate added

- Added a roadmap candidate to improve project mail-history XLSX exports under
  `_workspaces` so the spreadsheet is usable for human review instead of
  looking like an unformatted CSV mirror.
- Added a proposed dev-worker candidate packet that keeps `_workmeta` as the
  metadata-ledger surface while treating `_workspaces` XLSX files as
  owner-facing readable exports.
- Kept raw mail bodies, attachments, Outlook rule state, secrets, and workbook
  source-of-truth changes out of scope.

### Revision `working` - SE template library rules clarified

- Defined `_workspaces/SE_TEMPLATE_LIBRARY/` as the canonical actual-file
  reusable SE artifact library/store, not a pointer-only surface and not a
  project execution baseline.
- Clarified that project-local latest authoring files stay project-local;
  library samples are copied or materialized as sample outputs/files, not moved.
- Kept library workflow files limited to executable procedure, with paths,
  hashes, copy history, version/classification, and provenance recorded in
  manifests or catalogs.
- Kept common document rules separate from artifact-specific authoring rules,
  and reaffirmed that `_workmeta` stores metadata, pointers, hashes, and
  evidence only, not actual payload files.

### Revision `working` - SE template library workspace alias seeded

- Added `_workspaces/SE_TEMPLATE_LIBRARY/` as the local-only SE foldertree-shaped
  artifact library root and kept `_workspaces/system/` scoped to reusable lab
  and fixture outputs.
- Corrected document-producing snapshot rules so project work materializes a
  chosen official form or owner-approved artifact material into `00_Temp/template_snapshot/` before
  generation.

### Revision `working` - Project document template snapshot rules added

- Clarified that `_workspaces/SE_TEMPLATE_LIBRARY/` is the local-only SE
  foldertree-shaped artifact library root, while document-producing project work uses a project-local
  `00_Temp/template_snapshot/` baseline and optional
  `00_Temp/workflow_candidate/` candidates.
- Documented separate official form, snapshot, input bundle, artifact, and workflow
  version axes, plus snapshot manifest metadata and post-edit validation
  refresh requirements.

### Revision `working` - Mail fetch project history ICS LF writer fixed

- Wrote Python mail-fetch project-history ICS files with explicit newline
  handling so Windows hosts do not convert the repository metadata export to
  CRLF.
- Kept CSV and ICS metadata exports aligned with the existing line-ending
  hygiene expectations and gateway mail-fetch fixture assertions.

### Revision `working` - Workmeta payload symlink fixture Windows skip added

- Skipped the synthetic workmeta payload symlink fixture when Windows denies
  symlink creation with `EPERM` or `EINVAL`, matching the existing local path
  policy symlink test behavior.
- Kept the actual workmeta payload policy unchanged; the change only prevents a
  validator fixture from failing on Windows hosts without symlink privileges.

### Revision `working` - Daily work ledger automation candidate added

- Added a roadmap candidate for metadata-only daily work ledgers that separate
  project ledger collection, system ledger collection, and final worklog
  writing.
- Defined the intended source split so worklog writing reads only daily ledger
  surfaces, orders company project work before system work, and avoids scanning
  mail bodies, attachments, raw source files, or ad hoc git history directly.
- Kept raw payloads, owner-only ledgers, and scheduled host runtime details out
  of public canon; detailed operating evidence stays under `_workmeta`.

### Revision `working` - Long thread handoff Codex bridge refreshed

- Refreshed the `soulforge-long-thread-handoff` Codex bridge with the latest
  checkpoint refresh, compact/clear, fresh-session, and context hygiene
  guidance from the installed skill mirror.
- Added the public-safe context-management notes reference under the tracked
  skill bridge without storing raw transcript, private payload, or credential
  material.
- Aligned the tracked Soulforge skill entry with the new autonomous context
  reset decision capability.

## 2026-06-05

### Revision `working` - Codex app automation catalog added

- Added a tracked Codex app automation catalog that separates versioned
  automation concepts from PC-local Codex app `automation.toml` state.
- Documented the current default automation purposes, reader tiers, paused
  companion checks, and the small set of reports meant for routine human
  reading.
- Captured the planned daily work ledger split where a background collector
  writes daily ledgers first and report automations only format those ledgers.
- Linked the catalog from the guild_hall architecture README.

### Revision `working` - Long thread handoff workflow registered

- Added registered structure-only workflow `long_thread_handoff_v0` for
  long-running, overnight, or cross-session Soulforge work.
- Captured durable `NIGHT_WORK_HANDOFF`, fresh-subagent delegation,
  autonomous compact/clear timing, validation, and conservative closeout as a
  public-safe workflow package without raw transcript, private payload, secret,
  pilot-execution, default-route, or production-ready claims.
- Registered the workflow in `.workflow/index.yaml` and documented it in
  `.workflow/README.md`.

### Revision `working` - Private-state continuous sync added

- Added a deterministic `guild-hall:private-state:sync` command that mirrors
  only the private-state allowlist from local `guild_hall/state/**`, blocks
  denied secret-like filenames, and commits/pushes only the nested
  `private-state` repo.
- Added LaunchAgent coverage for `ai.soulforge.private-state-sync` so the
  always-on node can keep protected mailbox continuity updated without using
  the public repo.
- Moved generated LaunchAgent stdout/stderr paths to
  `~/Library/Logs/Soulforge/` so launchd jobs do not depend on writing log
  files under the external workspace root.
- Removed the redundant LaunchAgent `WorkingDirectory` key; each command still
  changes into the repo explicitly, avoiding launchd getcwd noise on external
  workspaces.

### Revision `working` - Source text traceability sidecar risk inventory guard added

- Hardened source-text traceability sidecar validation with metadata-only
  risk inventory consistency checks for chunk counts, page-backed chunk counts,
  page summary totals, and required warning codes.
- Blocked synthetic source-truth, owner-approval, and canon-promotion authority
  aliases from source-text metadata artifacts.
- Added synthetic sidecar coverage without reading live `_workspaces`,
  `_workmeta`, guild_hall state, private-state, source payload, or NotebookLM
  payload content.

### Revision `working` - Renderer Operation Board fixture smoke added

- Added renderer-web smoke coverage for the public-safe Operation Board
  fixture snapshot mapping without reading live state or private payloads.

### Revision `working` - Team Ops Board mockup read-only lint coverage

- Extended UI read-only boundary lint coverage to include Team Ops Board mockup
  TS/TSX code without reading protected paths or live payloads.

### Revision `working` - Assistant Dashboard secret alias marker hardening

- Hardened Assistant Dashboard read-only metadata rollup marker checks for
  broader secret and credential alias labels.
- Added coverage with a synthetic ledger fixture only, without reading real
  private ledger payloads or secret files.

### Revision `working` - Dev-worker owner-approved trigger policy updated

- Changed dev-worker candidate promotion so owner-approved active candidates are
  promotable when the local dev-worker automation trigger is ACTIVE, without a
  second per-task start phrase.
- Updated the dev-worker automation prompt, docs, audit display tests, and
  current approved candidate metadata so the owner controls automatic
  development by toggling the local automation on or off.

### Revision `working` - Town crier env state-root guard added

- Hardened town_crier runtime env file resolution so explicit Telegram env file
  paths must stay under `guild_hall/state/town_crier/**`.
- Added synthetic temp-root rollback coverage for absolute and traversal env
  paths outside the town_crier state root, without reading real env files,
  live state payloads, or sending Telegram notifications.

### Revision `working` - Source sync ready live-id authority alias guard added

- Hardened source sync ready manifest validation so live Drive/NotebookLM ID
  aliases and approval/canon authority aliases are rejected as metadata-only
  boundary contamination.
- Added synthetic negative coverage for those aliases with file checks disabled,
  keeping the guard free of live Drive, NotebookLM, source payload, or
  `_workspaces` file reads.

### Revision `working` - Dev-worker gateway broad-scope rejection fixture added

- Added synthetic auto-approval coverage confirming direct
  `guild_hall/gateway/**` write scope stays rejected.

### Revision `working` - Local absolute path symlink no-follow guard added

- Hardened local absolute path policy scanning so git-listed symlink file
  entries are skipped before any content read, without resolving or reporting
  their targets.
- Added synthetic temp-repo coverage proving an outside symlink target carrying
  a sentinel local path does not create violations or leak target details in
  human or JSON output.

### Revision `working` - Daily work packet owner-approval display guard added

- Added display-only `owner_approval_state` labels to daily work packet
  dev-worker candidate rows so owner-approved proposed candidates are distinct
  from unapproved proposed candidates.
- Added synthetic regression coverage confirming approval-only display does not
  change candidate counts, promotable counts, candidate status, input candidate
  objects, or promotion claims.

### Revision `working` - Morning report source ref scheme guard added

- Hardened morning report battle-log source cell parsing so rows must use a
  known safe `source_kind:source_ref` scheme with a non-empty safe ref.
- Added synthetic rejection coverage for malformed source cells, URL/file refs,
  token-bearing refs, local absolute paths, traversal, unknown kinds, and
  private/raw/source-payload labels without echoing unsafe source values.

### Revision `working` - Workspace junction non-link redaction fixture added

- Added synthetic coverage for declared workspace aliases that are real
  directories or regular files instead of symlink/junction pointers, confirming
  they report owner-decision-required non-link gaps without local absolute path
  leakage in object or human CLI output.

### Revision `working` - Workmeta payload symlink extension guard added

- Flagged blocked `_workmeta/**` symlink names such as `.xlsx`, `.pdf`, and
  `.zip` by entry path without following targets, while keeping `.git` and
  `_workspaces` out of scope.

### Revision `working` - Local absolute path report redaction added

- Redacted local absolute path policy violation and repo-root values in object,
  JSON, and human report output while keeping category, location, length, and
  fingerprint metadata for debugging.

### Revision `working` - Knowledge graph explicit graph-ref payload guard added

- Blocked explicit retrieval-plan `--graph-ref` graphs when synthetic
  source/chunk text, NotebookLM answer/question, raw query, secret-like values,
  file URLs, or local absolute paths appear inside graph JSON without echoing
  payload values in blocker output.

### Revision `working` - Workmeta sync skip-commit dirty guard added

- Blocked workmeta sync when metadata remains dirty after pull while
  `skipCommit` is enabled, so the run cannot report completed or already
  current with uncommitted metadata still present.
- Added synthetic runCommand coverage for the post-pull dirty skip-commit path
  without touching a real `_workmeta` repo or git remote.

### Revision `working` - RAG work-card payload boundary fixture added

- Added synthetic negative coverage for source-text quality review and RAG
  work-card validators so source text, chunk text, raw query, question, file
  URL, local absolute path, and fake secret-like markers are blocked without
  echoing fixture body values in validation output.
- Hardened work-card boundary scanning with path-scoped blocker codes for
  forbidden payload keys, secret-like keys/values, file URLs, and local
  absolute paths while keeping generated validation output metadata-only.

### Revision `working` - Daily work packet candidate visibility guard added

- Prioritized daily work packet display candidates so promotable,
  auto-approvable, and active attention candidates stay visible ahead of
  completed or closed dev-worker candidates.
- Kept dev-worker candidate counts and summary counts based on the full
  candidate queue, without changing candidate approval, promotion, or status
  records.

### Revision `working` - Dev-worker stale automation handoff guard added

- Added read-only dev-worker automation check mode for synthetic or provided
  TOML files, comparing only `id`, rendered `prompt`, `cwds`, and
  `execution_environment` against the tracked local render settings.
- Kept `status`, `rrule`, and timestamps as PC-local owner settings, and limited
  check output to short status metadata plus prompt hashes without printing
  prompt bodies, TOML bodies, local paths, or private payloads.

### Revision `working` - Operation Board fixture lint added

- Added a synthetic public-safe Operation Board snapshot fixture under
  `ui-workspace/fixtures/operation-board/` without copying live
  `guild_hall/state/**` payloads.
- Added a dedicated UI lint that checks Operation Board fixture schema versions,
  public-safe privacy mode, section count mirrors, row/group/item allowed
  fields, action queue mirrors, and raw/private/source contamination markers.
- Extended the fixture lint so Knowledge Lane blockers, Battle Log project
  aggregates, Diagnostics items, and top-level Diagnostics warning/error rows
  reject unknown fields while keeping the whole `operation_board` projection
  open to future fields.
- Added Diagnostics mirror checks between Operation Board diagnostics counts,
  section items, and top-level Diagnostics summary/warnings/errors arrays.
- Wired the fixture lint into UI lint scripts and documented that the fixture is
  not source truth.

### Revision `working` - Operation Board section field guard added

- Hardened snapshot validation so Operation Board Dungeon Map, Mission Board,
  and Monster Gate row/group/item projection objects reject unknown fields.
- Kept the guard scoped to documented section row/group/item shapes instead of
  closing the whole `operation_board` projection against future fields.
- Added synthetic negative coverage for raw/source/attachment ref-like fields
  without reading live state or private payloads.

### Revision `working` - Snapshot next action field guard added

- Hardened snapshot validation so `next_actions[*]` rejects unknown fields
  beyond the public action summary shape.
- Hardened Operation Board action queue validation so
  `operation_board.sections.action_queue.items[*]` rejects unknown fields
  beyond the mirrored action summary and rank.
- Added synthetic negative coverage for raw payload/source ref-like fields
  without regenerating live snapshot state.

### Revision `working` - Assistant dashboard snapshot contract health guard added

- Hardened assistant dashboard `ai_data_health` so the snapshot row reports
  `invalid` when the stored snapshot contract fails even if its timestamp is
  fresh.
- Degraded the dashboard status for invalid snapshot health while keeping
  valid snapshot freshness as `fresh`, `stale`, or `missing`.
- Added synthetic metadata-only coverage without reading real
  `guild_hall/state/**` payloads.

### Revision `working` - Town crier local status guard added

- Added `status --local-root <path>` for synthetic town_crier status checks
  without reading the live operation state or Telegram env.
- Rejected missing `--local-root` values and filesystem root targets.
- Added synthetic disabled-notification coverage so gateway no-op policy paths
  do not create a pending town_crier queue.

### Revision `working` - RAG source-text artifact contamination guard added

- Hardened source-text index, answer-run, and traceability-sidecar validation
  against hidden raw query, NotebookLM answer, credential/session/token/secret,
  file URL, and local absolute path contamination.
- Kept `chunks[].chunk_text` and `response.answer_text` as private payload
  exception paths while blocking the same keys and values elsewhere.
- Tightened those exception paths so only string payloads bypass recursive
  contamination scanning.
- Added synthetic negative coverage without reading real workspace payloads,
  raw mail, NotebookLM answers, private state, or secrets.

### Revision `working` - RAG run report shape guard added

- Hardened `source_text_extraction_run_report_v0` validation so generated
  report objects reject unknown top-level and nested keys before they can carry
  source locator, private payload, raw payload, or harmless-looking extra
  fields.
- Added synthetic coverage for unknown keys in run report sections, dynamic
  count maps, array fields, and generated invalid-packet report shapes without
  reading source text or private payloads.

### Revision `working` - Public mission draft redaction validator added

- Added canon validation for public mail-derived mission drafts using
  `soulforge.dungeon_assignment.public_mission_draft.v1`.
- Required public draft redaction flags to prove raw payloads, private/source
  refs, local file refs, and secret-like values were removed before a draft can
  pass canon validation.
- Added synthetic mission fixture coverage for blocked null-workflow drafts,
  missing redaction fields, private/source markers, local file URL markers, and
  secret-like authorization values.

### Revision `working` - Snapshot battle log aggregate projection added

- Added a top-level `battle_log` aggregate to the read-only snapshot from
  schema-valid battle event JSONL rows, limited to counts, latest timestamps,
  result/bottleneck/mode/automation buckets, and per-project aggregate rows.
- Mirrored the aggregate into `operation_board.sections.battle_log` and added a
  drift guard so the Operation Board section must exactly match the top-level
  summary.
- Added metadata-only freshness observation for battle event file surfaces and
  synthetic regression coverage to keep event ids, mission ids, stages, source
  refs, party/unit/loop ids, next action notes, and rendered prose out of the
  snapshot.

### Revision `working` - Snapshot mission terminal provenance markers added

- Added public-safe mission terminal provenance markers to `missions.items[*]`
  and mirrored them into Operation Board Mission Board rows without serializing
  `run_id` or `battle_event_id` pointer values.
- Added metadata-only freshness observation for `.mission/*/readiness.yaml`
  surfaces so terminal marker changes make stored snapshots stale.
- Extended synthetic snapshot coverage so terminal provenance pointer values do
  not leak and Mission Board marker drift is rejected by validation.

### Revision `working` - Snapshot monster gate row mirror guard added

- Hardened snapshot validation so Operation Board Monster Gate groups must
  mirror the pending monster display group contract and each group's display
  sample rows.
- Added synthetic regression coverage for Monster Gate group/order/row field
  drift without reading real `_workmeta/**`, `_workspaces/**`, raw mail,
  NotebookLM payloads, or secrets.

### Revision `working` - Snapshot mission board row mirror guard added

- Hardened snapshot validation so Operation Board Mission Board rows must
  mirror mission projection order, mission id set, display grouping fields, and
  row-level mission summary fields.
- Added synthetic regression coverage for Mission Board projection drift without
  reading real `_workmeta/**`, `_workspaces/**`, raw mail, NotebookLM payloads,
  or secrets.

### Revision `working` - Snapshot dungeon map row mirror guard added

- Hardened snapshot validation so Operation Board Dungeon Map rows must mirror
  project order, project surface fields, per-project mission counts, assigned
  pending monster counts, and surface status.
- Added synthetic regression coverage for row-level Dungeon Map projection drift
  without reading real `_workmeta/**`, `_workspaces/**`, or raw gateway payloads.

### Revision `working` - Snapshot operation board count mirror guard added

- Hardened snapshot validation so Operation Board project, mission, and monster
  count projections must mirror their source arrays and display groups.
- Added synthetic regression coverage for projection count drift without
  reading real `_workmeta/**`, `_workspaces/**`, or gateway private payloads.

### Revision `working` - Gateway command surface README index synced

- Synced gateway owner README/index entries for the metadata-only mail backlog
  and deadline-watch command surfaces.
- Added missing workspace contract links for mail work status, deadline watch,
  and gateway notify context without changing command implementations or
  package state.

### Revision `working` - Dev-worker auto-approval control-character guard expanded

- Rejected control characters in raw dev-worker auto-approval
  `allowed_write_paths` before safe-path matching.
- Rejected control characters in dev-worker auto-approval acceptance checks
  before command allowlist matching.
- Escaped control characters in auto-approval rejection reasons so details and
  skipped-output surfaces do not emit raw newline, tab, NUL, or DEL characters.

### Revision `working` - Dev-worker approval-only audit state surfaced

- Added owner-approval state to the dev-worker candidate `--details` view so
  approval-only candidates are distinct from promotable work.
- Added regression coverage for unapproved, approval-only, and promotable
  candidate detail output without changing candidate promotion behavior.

### Revision `working` - Gateway helper packaging tracking guard recorded

- Added the initial gateway CLI packaging diagnostic for backlog and deadline
  watchdog helper package tracking before package inclusion was closed.
- Documented that package-clean claims require the backlog and deadline
  watchdog helper modules to be tracked with their CLI consumers.

### Revision `working` - Mail candidate backlog display bounded

- Added bounded stdout display controls for `mail-candidate-backlog` so latest
  reports stay full while normal CLI output shows limit/omitted metadata.
- Aligned the documented canonical backlog command to omit the redundant
  `--json` flag because stdout is JSON by default.

### Revision `working` - Snapshot action queue mirror guard added

- Hardened snapshot validation so `next_actions` statuses stay within `started`/`next` and action queue items mirror id/status/summary/rank.

### Revision `working` - Battle event schema contract guard added

- Added regression coverage that compares the battle log writer contract against
  the canonical `battle_event` schema fields and enums.
- Kept the guard synthetic and metadata-only, without reading or writing real
  project battle logs under `_workmeta/**`.

### Revision `working` - Dev-worker auto-approval path guard documented

- Documented that dev-worker auto-approval safe-path checks reject parent
  directory segments and compare normalized path boundaries before approving
  low-risk candidates.

### Revision `working` - Knowledge graph source-support path wording aligned

- Aligned retrieval-plan and browser detection-card missing-evidence checks so
  `no_source_support_edges` is reported only when the graph lacks a `source`
  node or lacks both `supports` and `derived_from` source-support relations.
- Added derived-from-only regression coverage without changing real knowledge
  canon entries or source payload boundaries.

## 2026-06-04

### Revision `working` - Knowledge graph source-edge gap scout added

- Added a metadata-only connectivity diagnostic for `source_supported`
  knowledge nodes that have `source_support` metadata but no linked `source`
  node through `supports` or `derived_from` edges in the current graph.
- Kept the scout diagnostic limited to node id/ref, claim ceiling, source ref
  count, and missing edge type without creating source nodes, source edges, or
  source-truth/canon-promotion claims.
- Added regression coverage for resolved `supports`/`derived_from` source
  endpoints and for non-source endpoints that must remain
  `source_node_endpoint` gaps.
- Updated the graph view model contract to keep the new scout explicitly
  metadata-only and non-authoritative.

### Revision `working` - Deadline watchdog reminder preview added

- Added a dry-run/manual-confirm deadline watchdog reminder preview command
  that reads project-local `deadline_register.csv` ledgers and produces
  Telegram-ready brief candidates without sending notifications or writing
  `town_crier` queue entries.
- Added cooldown, snooze, terminal-status, max-nudge, due-window, and
  raw-payload boundary suppression checks for reminder candidates.
- Documented the preview-only reminder surface in `DEADLINE_WATCH_V0.md`.

### Revision `working` - Mail candidate backlog age check added

- Added a metadata-only `mail-candidate-backlog` gateway command for pending
  mail candidates, including candidate counts, age/stale state, and pending
  count trend without exposing subjects, senders, bodies, attachments, or
  secrets.
- Added the backlog age check to the always-on healer checks so stale pending
  mail candidates can warn before the queue silently piles up.
- Documented the backlog surface in the mail work status contract and the
  always-on healer rollout plan.

### Revision `working` - Team Ops Board clickable mockup added

- Promoted the owner-approved Team Ops Board v0 candidate into a standalone
  React/Vite mockup under `ui-workspace/apps/team-ops-board-mockup/`.
- Added sample-data Board, Projects, Schedule, People, and Settings surfaces
  with item creation, detail editing, owner/status changes, comment capture,
  Blocked/Waiting note gating, range filters, and weekly summary export.
- Wired the mockup into UI workspace build scripts while keeping it separate
  from `renderer-web`, Smartsheet APIs, private work data, and write-back
  behavior.

### Revision `working` - Mail history line endings normalized

- Updated the gateway mail-fetch project mail history writer so derived
  `_workmeta/**/reports/메일_이력/` CSV and calendar metadata use LF line
  endings.
- Added regression coverage so future P00 mail-history updates do not create
  CRLF trailing-whitespace failures under `git diff --check`.
## 2026-06-03

### Revision `working` - Dev-worker candidate audit details added

- Added a `--details` text view for `guild-hall:dev-worker:candidates` so
  stalled development candidates show their promotion and auto-approval
  blockers without changing candidate promotion behavior.
- Added status, active-candidate, and closed-candidate counts so completed
  candidate packets are easier to distinguish from still-proposed work.
- Added focused test coverage, README guidance, and architecture contract
  wording for the candidate audit view.

### Revision `working` - Development idea capture lane clarified

- Clarified `DEVELOPMENT_ROADMAP_V0.md` so future development ideas move
  through a fixed ladder: roadmap line, system/project candidate queue,
  executable dev-worker request, or metadata-only knowledge/RAG capture.
- Added minimum fields and approval guards for candidate-to-execution
  promotion so owner-decision-pending tasks are not silently treated as ready.
- Reframed the WorldBible `Idea Backlog` as product-sense notes only, with
  actual development storage owned by the roadmap and `_workmeta` queues.

### Revision `working` - Experiment report authoring draft added

- Added `.workflow/authoring/experiment_report_authoring_v0/` as a
  public-safe draft workflow for team experiment report authoring.
- Included a reusable Korean experiment report outline reference template so
  report authors can copy a stable section spine into project-local reports.
- Clarified `.workflow/authoring/README.md` so new workflow drafts are authored
  through `soulforge-workflow-generator` and closed through
  `soulforge-workflow-check`, with missing generator evidence kept as a draft
  status gap.
- Kept the draft limited to report authoring, evidence mapping, HTML review-copy
  planning, gaps, next actions, and boundary review without claiming contract
  acceptance, final pass/fail judgment, or customer approval.
- Added report-tone guidance so judgment limits are written as `자료 성격`,
  `검토 범위`, and `별도 확인 대상` instead of AI-style disclaimer banners.
- Added an HTML table-of-contents rule that suppresses automatic list numbering
  when Markdown headings already carry section numbers.
- Added core-summary guidance so experiment reports use a `검토 항목 / 결과 요약`
  table with report-level judgment, bounded numbers, and interpretation limits
  instead of file-by-file calculation-log bullets.

### Revision `working` - SE workspace folder naming convention added

- Added `SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md` as the public-safe
  convention for human-facing SE project workspace folder names.
- Added a short `AGENTS.md` routing rule so folder create, cleanup, rename, and
  dry-run work reads the detailed workspace naming convention first.
- Linked the convention from the workspace architecture README and kept actual
  workspace rename behind dry-run mapping, pointer migration planning, and
  owner approval.

## 2026-06-02

### Revision `working` - Team Ops Board mockup candidate added

- Added a roadmap candidate for a standalone Team Ops Board v0 clickable
  mockup that ignores the existing renderer-web baseline and treats Smartsheet
  as an optional future input source.
- Recorded the private dev-worker candidate packet for the mockup handoff so a
  later session or worker PC can pick up the task without reading private
  project payloads or connector secrets.

### Revision `working` - Soulforge report format pair added

- Added `SOULFORGE_REPORT_FORMAT_V0.md` to make owner-facing report material
  default to a Markdown or structured-text source-of-truth plus a standalone
  HTML companion for human review.
- Added a public-safe owner-facing technical report tone rule so experimental
  and test reports default to `시험 목적`, `시험 조건`, `요청/검토 항목`,
  `검토 결과`, `고려사항`, and `후속 조치` rather than advisory prose.
- Extended the AI output format policy so HTML report companions stay derived
  artifacts and preserve public/private/raw/secret boundaries.
- Added public-safe Markdown and HTML report templates under workspace
  examples, and generated a private HTML companion for the P24-049 LIG SAS
  group-delay report.

### Revision `working` - Team Operations Console draft added

- Reworked the renderer-web Assistant pane into a read-only Team Operations
  Console draft that foregrounds open actions, waiting items, schedule adapter
  readiness, project status, source-review posture, and data-health gates.
- Added an explicit Smartsheet-pending state so the operations board remains
  usable from local Soulforge rollups before any Smartsheet API integration.

## 2026-05-31

### Revision `working` - Deadline watch contract scaffold added

- Added `DEADLINE_WATCH_V0.md` to define project-local deadline ledgers,
  P00 unresolved deadline inbox behavior, reminder metadata events, completion
  rules, and raw-payload exclusion.
- Seeded metadata-only `deadline_watch` skeletons for P00 and P26-014 in
  `_workmeta` so the assistant v0 pilot has a concrete source-of-truth surface
  before dashboard, UI, or reminder automation work.
- Aligned the renderer-web gateway notification toggle list to the supported
  v0 gateway events, `monster_created` and `mail_received`.
- Added a dry-run-first gateway deadline-watch importer for deterministic
  `mail_work_priority` due observations.
- Added a deadline-watch validator command for project-local deadline register
  and reminder event-log hygiene.
- Added a local-only read-only assistant dashboard composer that rolls up
  project deadline, open-action, work-ledger, and data-health metadata into
  `guild_hall/state/assistant_dashboard/latest.json`.
- Added an Assistant Home pane in renderer-web that reads the local dashboard
  through a read-only control-center API and surfaces degraded data-health and
  ledger-guard states without write-back.

## 2026-05-28

### Revision `working` - RAG three-stage operating model added

- Added `RAG_THREE_STAGE_OPERATING_MODEL_V0.md` to separate searchable RAG,
  work-ready RAG, and canon knowledge so whole-document progress is not
  confused with sample route pilots.
- Linked the three-stage model from the RAG manifest contract, guild_hall RAG
  README, and architecture guild_hall README.

### Revision `working` - RAG operational route resolver added

- Added metadata-only operational route validation, resolution, and smoke-run
  commands so private/manual-review RAG route registries can select a stable
  work card, operator answer card, wiki page, evidence pages, and claim ceiling
  without loading raw source text or chunks.
- Added a terminal-only operational route answer-shell renderer that prints the
  selected private operator answer card without writing answer bodies to public
  files or `_workmeta/**`.
- Added operational route answer-card validation so private operator cards can
  be checked for route id, work-card id, evidence pages, manual-review notice,
  and stronger-authority denial markers without returning card bodies.
- Added operational route preflight artifacts that combine registry validation,
  smoke tests, answer-card validation, and current status into one
  metadata-only private/manual-review readiness check.
- Added an operational route catalog command so operators can list available
  private/manual-review routes, refs, evidence pages, review gaps, and claim
  ceilings before entering a question or recording usage.
- Added an operational route dashboard command that combines catalog,
  preflight, usage counts, candidate counts, answer-card status, and smoke-test
  state into one metadata-only terminal surface for operator readiness checks.
- Added an operational route call-plan command that combines dashboard and
  route-session checks for one transient query label without persisting raw
  queries, answer bodies, usage records, or candidate records.
- Added operational route call-plan write, validate, and view commands so a
  real operator question can preserve its fingerprint-only routing decision
  under `_workmeta` without storing the raw query, answer body, source text,
  chunks, usage records, candidates, or stronger authority.
- Added an operational route operator-run command that prints the selected
  private/manual-review answer shell after call-plan checks while keeping the
  output terminal-only and avoiding usage/candidate side effects.
- Added an optional operator-health gate to operational route operator-run so
  answer-shell output and usage recording are skipped unless the supplied
  stored health artifact passes for the same route registry.
- Added `--skip-answer-shell` to operational route operator-run so automation
  or probe runs can verify the health-gated call plan without printing the
  private answer card body or writing usage.
- Added an explicit operator-run usage-record option so real delivered answers
  can write metadata-only usage records only when `--record-usage` and a safe
  `--usage-id` are provided.
- Added post-write operator-run usage evidence so explicit usage recording
  validates the written record and reports the route usage count against the
  repeated-use review threshold.
- Fixed post-write operator-run usage counting to derive the summary root from
  the written usage record, including custom `_workmeta/<project>/...` usage
  output refs.
- Added an operational route closeout command so operators can confirm the
  post-answer gate, route usage count, repeated-use threshold, and unmatched
  candidate state without persisting answer bodies, raw queries, usage records,
  or candidates.
- Hardened operational route closeout validation so injected answer-shell
  output, answer-card body fields, source/chunk loading flags, source truth,
  public canon, graph truth, and default-route mutation claims are blocked.
- Added an operational route review-gate command so operators can check the
  whole route set for repeated-use readiness or unmatched candidate blockers
  without launching sourcebound review, writing usage/candidate records, loading
  source text/chunks, or granting stronger authority.
- Added an operational route command-sheet command so operators can print the
  safe command sequence for a private/manual-review route set without executing
  commands, recording usage/candidates, or persisting answer bodies/raw queries.
- Added an operational route suggestion-safety command so generated command
  suggestions can be checked for direct usage-record writes, direct answer-shell
  calls, and healthless `--record-usage` paths before private/manual-review
  operator use.
- Hardened operational route suggestion-safety to count direct candidate and
  call-plan write suggestions separately, block unsafe candidate/call-plan write
  suggestions, and keep unmatched probe suggestions on candidate preview unless
  a real unmatched operator question explicitly requests a write.
- Added an operational route ops-check command that combines preflight,
  dashboard, command-sheet, suggestion-safety, and review-gate validation into
  one metadata-only private/manual-review readiness verdict without executing
  commands, recording usage/candidates, launching sourcebound review, or
  granting stronger authority.
- Added an operational route readiness command that combines ops-check and
  route-set session sweep evidence into one metadata-only go/no-go operator
  surface without persisting raw queries, executing answer shells, recording
  usage/candidates, launching sourcebound review, or granting stronger
  authority.
- Added an operational route readiness-view command so stored readiness
  artifacts can be reopened as operator-readable go/no-go digests without
  regenerating checks or reading raw queries, answer-card bodies, source text,
  or chunks.
- Added stored preflight, ops-check, and session-sweep view commands so
  pre-use readiness evidence can be reopened as operator-readable digests
  without rerunning checks or loading source/answer payloads.
- Expanded the operational route command sheet with read-only stored evidence
  view commands for preflight, ops-check, route sweeps, readiness, status,
  usage, and candidate records.
- Added an operational route suggestion-safety artifact so command-sheet,
  call-plan, and session suggested commands can be validated and reopened as
  metadata-only evidence without executing commands or writing
  usage/candidate/call-plan records.
- Added an operational route evidence-sweep command that validates and
  summarizes supplied stored evidence refs into one metadata-only closure check
  without reading source/answer payloads or granting stronger authority.
- Added an operational route latest-evidence command that finds the latest
  stored `_workmeta` evidence refs for a route registry so operators do not need
  to manually track the newest preflight, ops-check, readiness, status, usage
  summary, or evidence-sweep paths.
- Expanded latest-evidence to include the latest suggestion-safety artifact and
  report dangerous suggestion counts alongside the stored ops-check evidence.
- Added an operational route operator-brief command that turns the latest
  evidence refs into a one-page private/manual-review run surface with the
  route list and safe next commands.
- Added an operational route operator-doc drift check so local runbooks,
  status digests, and closeout maps can be checked against the latest stored
  evidence and operator brief refs without reading source payloads or raw
  queries.
- Added an operational route operator-health command that combines latest
  evidence, operator brief, and operator doc-drift validation into one
  metadata-only go/no-go surface without executing commands, writing
  usage/candidate/call-plan records, reading source payloads, or granting
  stronger authority.
- Added operational route session artifacts that combine preflight and route
  resolution for one transient query while persisting only query fingerprints,
  selected refs, evidence pages, claim ceilings, and next operator steps.
- Added a text digest for operational route sessions so operators can read the
  selected route and next steps without opening JSON, raw queries, or answer
  bodies.
- Added an operational route session-sweep command so smoke-test route labels
  can prove the full private/manual-review route set opens to the expected work
  cards and evidence pages without persisting raw query labels, answer bodies,
  usage/candidate records, source text, chunks, or stronger authority.
- Added an operational route-run view command so stored metadata-only route
  decisions can be reopened as the same safe operator digest without loading
  raw queries, answer-card bodies, source text, or chunks.
- Connected route registry validation to existing source-text work-card
  validation, keeping source truth, final-answer authority, public canon,
  ontology acceptance, graph truth mutation, external upload, and default-route
  switching outside the resolver.
- Added metadata-only operational route usage records under `_workmeta/**` so
  repeated private route use can be counted with query fingerprints instead of
  persisted raw questions.
- Clarified no-write candidate previews so `operational-route-candidate-record
  --text` renders a preview status instead of looking like a persisted candidate
  record.
- Added operational route usage summaries so repeated-use review readiness can
  be reported per route without granting stronger knowledge, canon, or answer
  authority.
- Added operational route usage record/summary text and view renderers so
  stored usage evidence can be reopened as operator-readable digests without
  loading raw queries, answer-card bodies, source text, or chunks.
- Added operational route candidate records for unmatched public-safe labels,
  storing only query fingerprints and route-resolution metadata without
  changing route registries, default routes, source text permissions, or claim
  ceilings.
- Added operational route candidate text/view rendering so unmatched-route
  candidates can be reviewed as metadata-only operator digests before or after
  a real candidate record is written.
- Added an operational route status command that combines registry validation,
  repeated-use summaries, and unmatched candidate counts into a single
  metadata-only operator dashboard for private/manual-review RAG routes.
- Added an operational route status-view command so stored dashboard snapshots
  can be reopened as terminal digests without rerunning checks or loading
  source/answer payloads.
- Added a knowledge-graph graph-relation review queue overlay so DAPA
  route/work-card/wiki candidate links can render as review-required graph edges
  through redacted alias nodes, without exposing private `_workspaces/knowledge`
  refs or mutating graph truth/default routes.

## 2026-05-27

### Revision `working` - RAG source-family promotion policy added

- Added a source-family promotion policy that separates official source canon
  from derived knowledge canon and fixes default promotion ceilings for
  official public sources, private project sources, owner notes, parser/OCR
  outputs, advisory LLM/NotebookLM output, protected payloads, and public
  web/community sources.
- Linked the policy from the RAG manifest and RAG README so source-text,
  work-card, private wiki, and public canon promotion decisions have a shared
  family-specific rule set.

### Revision `working` - Owner-delegated auto-canon lane clarified

- Added a standing auto-canon lane to the agent execution contract so an
  applicable owner policy can allow same-task canon registration without
  per-item owner confirmation when all public/private, source, schema,
  changelog, and review guards pass.
- Kept source truth, ontology acceptance, external upload, default-route
  mutation, final domain doctrine, secret inspection, and production-ready
  authority outside the delegated lane unless separately granted by an owner
  surface and required review gate.

### Revision `working` - SE review workflow optimizer closeout

- Added a public-safe optimizer calibration archive and active profile policy
  for `se_cross_stage_mapping_governance_v0`, selecting
  `gpt-5.4|low|dwarf|auditor` as the quality-equivalent governance profile
  while keeping `gpt-5.4-mini|low|dwarf|auditor` as a minimum-viable shadow.
- Corrected the SE assistant operating loop note so
  `se_cross_stage_mapping_governance_v0` is treated as an optional governance
  route rather than an excluded unresolved workflow.
- Reconciled `se_stage_artifact_gap_scan_v0` calibration telemetry and
  calibration README wording with the existing active calibration archive.

### Revision `working` - RAG metadata refresh workflow calibrated

- Updated `rag_metadata_refresh_v0` from registered pilot-ready to
  pilot-executed based on the existing controlled metadata-only pilot evidence.
- Added a public-safe synthetic optimizer calibration archive and active profile
  policy for `rag_metadata_refresh_v0`, selecting
  `gpt-5.4-mini|low|dwarf|archivist` as the cheapest quality-gate-passing
  profile.
- Kept source-text RAG, NotebookLM mutation, owner approval, public canon,
  ontology promotion, answer authority, and default-route safety out of scope.
- Added the source-text quality review and source-text work-card command surface
  so approved private source-text answer runs can be turned into page-audited
  work cards without persisting raw questions, source text, or chunk text in the
  card/review payload.

## 2026-05-26

### Revision `working` - RAG Docling JSON page-order index added

- Added `source-text-index --docling-json-ref` so approved private source-text
  indexes can be built from Docling JSON element/page order while preserving
  the existing Markdown/text index path.
- Added native chunk page spans, layout labels, and warning codes for Docling
  JSON indexes, allowing `source-text-answer-run` citations to carry page-level
  traceability even without a separate sidecar.
- Updated the traceability sidecar to recognize native chunk page spans, so
  Docling JSON indexes can be checked without falling back to weak token
  overlap mapping.

### Revision `working` - RAG page traceability sidecar added

- Added `source-text-traceability-sidecar` and validation so private Docling
  JSON exports can map source-text chunk ids to page spans, layout labels, and
  warning codes without copying source text into public files or `_workmeta`.
- Allowed `source-text-answer-run` to attach optional sidecar-derived page
  spans to citations, making page-backed citation review possible while keeping
  raw questions ephemeral.
- Documented the sidecar as a sourcebound audit aid, not extraction-quality
  approval, owner approval, NotebookLM authority, or canon promotion.

### Revision `working` - RAG runtime preflight resolver added

- Added `source-text-runtime-preflight` to the RAG CLI so local extraction
  readiness can be checked from repo-local venv refs, PATH, Windows user
  environment, and tool env vars without hard-coding executable paths.
- Added validation coverage that blocks runtime absolute paths from the
  preflight JSON while still reporting required tool, OCR language, and optional
  HWP/HWPX converter readiness.
- Documented the preflight as the preferred public-safe smoke surface before
  real source extraction or source-text indexing work.

### Revision `working` - RAG source extraction runtime install guidance added

- Added the RAG/source-text extraction runtime to the installation manual for
  owner/tool PCs that convert source documents before indexing.
- Documented the required Docling-first toolchain, including Tika/Java,
  PyMuPDF/`pypdf`, LibreOffice, Tesseract Korean OCR data, and HWP-to-HWPX
  converter requirements.
- Clarified that actual local executable paths, versions, OCR data hashes, and
  smoke results belong under `_workmeta/system/reports/procedure_capture/source_extraction_runtime/`,
  while public docs keep only portable tool families, package ids, and
  validation commands.

### Revision `working` - Mail history Excel export moved out of `_workmeta`

- Changed the gateway project mail history writers so `_workmeta/<project_code>/reports/메일_이력/` keeps only metadata-oriented CSV and calendar outputs.
- Moved generated `메일_이력.xlsx` exports to `_workspaces/<project_code>/reports/메일_이력/` and made the writers remove legacy `_workmeta` Excel exports on the next upsert.
- Added `validate:workmeta-payload` to catch HWP/HWPX, Office, PDF, archive, and mail raw/archive files under `_workmeta`, including ignored local payloads.
- Fixed the workmeta payload validator CLI entrypoint so the npm script actually runs on Windows file paths instead of silently stopping after tests.
- Updated gateway, mail-fetch, dungeon-assignment, validation, and workspace intake docs/tests to keep Excel files out of the private metadata plane.

### Revision `working` - RAG source sync ready gate added

- Added `source_sync_ready_manifest_v0` validation for OneDrive/cross-PC source
  handoff, checking Soulforge-root-relative refs, source card/source text
  matching, byte sizes, SHA-256 hashes, and optional file stability delay.
- Added `validate-source-sync-ready` and `source-text-index --ready-ref` so
  indexing can block with `blocked_sync_not_ready` instead of reading a file
  that has not fully synced locally.
- Added a public-safe ready manifest template for company knowledge intake and
  kept the manifest metadata-only: no source payloads, chunks, NotebookLM
  answers, credentials, local absolute paths, owner approval, or source truth.

### Revision `working` - RAG source extraction tool standard selected

- Set the RAG/source-text intake method as parser-first rather than direct
  LLM raw-document analysis.
- Selected a Docling-first local extraction standard with Apache Tika,
  PyMuPDF/`pypdf`, LibreOffice headless, and Tesseract OCR as fallback routes.
- Kept HWP under the existing HWP-to-HWPX normalization rule before any body
  extraction, and kept LLM/NotebookLM/LlamaParse/cloud parser outputs advisory
  unless explicitly owner-approved.
- Clarified that `source-text-index` consumes approved derived `.md`/`.txt`
  under `_workspaces/knowledge/**` after extraction, while `_workmeta/**`
  records only hashes, tool/version metadata, counts, warnings, blocker codes,
  and relative output refs.

### Revision `working` - Workspace junction and Codex bridge portability fixes

- Treated `_workspaces/00_project_index.html` as a local navigation surface instead of a junction gap, matching the workspace binding rule that human index views are not routing authority.
- Made the Codex account bridge argument test expect the platform-native resolved repo root so Windows clones do not fail `done:check` on `/repo` versus drive-qualified paths.
- Kept junction repair owner-gated: the audit reports relative aliases, expected suffixes, and redacted target tails only, and does not write host-local cloud roots into tracked canon.

### Revision `working` - RAG and gateway path portability tightened

- Tightened RAG/source-text profile and extraction packet validators so URL-like path fields such as `file://...` cannot bypass local absolute path guards.
- Required company knowledge intake `source_ref` values to use Soulforge-root-relative `_workspaces/knowledge/**` refs instead of floating Drive IDs or machine-local paths.
- Switched the gateway mail fetch env example and path docs to Soulforge-root-relative paths, while keeping legacy env-file-relative path resolution for existing local env files.

### Revision `working` - RAG operating standard docs clarified

- Clarified the two RAG boundaries: default manifest/index/trace/evaluation/answer flows are metadata-only, while approved private source-text commands may read only owner-approved `_workspaces/knowledge/**` source text.
- Added the raw-question storage policy for RAG artifacts: persisted JSON/review outputs use labels, query fingerprints, and token fingerprints, not raw questions.
- Added a public-safe company knowledge intake packet template surface for parallel PC handoff without raw source text, NotebookLM answers, account IDs, conversation IDs, secrets, or company payloads.
- Recorded RAG/source-text standardization as a bounded support/follow-on lane under the roadmap, not a replacement for the active playable loop.

## 2026-05-25

### Revision `working` - RAG source-text starter index lane added

- Added the first owner-approved `_workspaces/knowledge` source-text lane with source card validation, source-text indexing, derived text output, and source-text answer proof runs.
- Added CLI commands `validate-knowledge-source-card`, `source-text-index`, `validate-source-text-index`, `source-text-answer-run`, and `validate-source-text-answer-run`.
- Kept source-text payloads out of public repo and `_workmeta`: starter source, derived text, index chunks, and source-text answer runs live under `_workspaces/knowledge/**`.
- Added official-source authority handling so owner-approved public agency sources may create public-safe summaries, ontology seeds, NotebookLM packet manifests, and registry entries while full source text and chunks remain private workspace payloads.

### Revision `working` - RAG answer-engine preflight MVP added

- Added `source_text_extraction_run_report_v0` as the report-only dry-run layer after `source_text_extraction_packet_v0`.
- Added `rag_answer_engine_run_v0` as the current metadata/preflight answer-engine MVP, connecting the metadata retrieval index with the source-text packet/report readiness chain.
- Added CLI commands `source-text-extraction-run-report`, `validate-source-text-extraction-run-report`, `answer-engine-run`, and `validate-answer-engine-run`.
- Kept written answer-engine runs below source-text RAG: they persist query fingerprints, not raw queries, and do not read source bodies, write private payloads, build indexes, use NotebookLM answers, or grant owner approval.

### Revision `working` - RAG source text extraction packet added

- Added `source_text_extraction_packet_v0` under `guild_hall/rag` as the dry-run preflight contract after `source_text_metadata_profile_v0`.
- Added `source-text-extraction-packet` and `validate-source-text-extraction-packet` CLI commands to bind profile fields, source-slice targets, extraction-log import tasks, adapter routes, and planned metadata outputs before extractor execution.
- Kept the packet below owner approval and source-text retrieval: it does not execute extractors, read source bodies, write private payloads, build indexes, upload to NotebookLM, or promote public canon.

### Revision `working` - RAG source text metadata profile added

- Added `source_text_metadata_profile_v0` under `guild_hall/rag` as a planning-only bridge before source-text extraction.
- Added `source-text-metadata-profile` and `validate-source-text-metadata-profile` CLI commands to reuse source-slice metadata, public-safe field scans, and extraction-status CSV column/count metadata without loading source bodies.
- Kept the profile below source-text retrieval, private extracted text, chunks, BM25/vector indexes, NotebookLM answers, owner approval, and public canon promotion.

## 2026-05-24

### Revision `working` - Knowledge wiki pipeline renamed for general use

- Renamed the Knowledge Wiki Cell default composite route from the SE-prefixed workflow id to `knowledge_wiki_pipeline_v0` so it is clearly usable for general knowledge, sourcebound wiki, NotebookLM bookshelf, and RAG metadata handoff work.
- Updated Knowledge Wiki Cell party routing, workflow index entries, downstream workflow references, and launcher skill mappings to use `knowledge_wiki_pipeline_v0`.
- Kept behavior and authority boundaries unchanged: the rename does not grant source truth, NotebookLM or Drive mutation, RAG answer authority, public canon promotion, ontology acceptance, or any new default-route expansion beyond the existing Knowledge Wiki Cell route.

### Revision `working` - RAG metadata refresh workflow route added

- Added `rag_metadata_refresh_v0` as the registered metadata-only refresh workflow route after wiki/sourcebound metadata changes.
- Extended `knowledge_wiki_pipeline_v0` and `knowledge_wiki_cell` with an optional RAG refresh handoff while keeping RAG artifact refresh outside the wiki party itself.
- Updated the Knowledge Wiki Cell launcher contract so it can prepare a metadata-only refresh handoff without granting source-text retrieval, BM25/vector index build, NotebookLM mutation, public canon promotion, or answer authority.

### Revision `working` - RAG metadata retrieval index and indexed answer path added

- Added safe-default `source_slice_owner_decision_record_v0` generation and validation so decision packets can be carried into the next layer without being mistaken for owner approval or stronger source permissions.
- Added `rag_metadata_index_v0`, retrieval trace, smoke evaluation, and `answer --metadata-index-ref` under `guild_hall/rag`, with token fingerprints instead of raw terms and `_workmeta` trace/evaluation outputs that do not persist raw questions.
- Tightened RAG and graph guards: `rag_manifest_v0` must keep `indexes: []`, metadata indexes cannot persist source handles/locators, and knowledge graph exports can only write under `_workspaces/system/knowledge_view/**`.

### Revision `working` - RAG source slice decision packet added

- Added metadata-only `source_slice_decision_packet_v0` generation and validation under `guild_hall/rag` as the owner-decision preparation layer before source-text retrieval, index build, NotebookLM packet membership, or public canon promotion.
- Added explicit `source-slice-decision-packet` and `validate-source-slice-decision-packet` CLI commands with `_workmeta` output-root guards and project-code enforcement for private source slices.
- Kept decision packets below owner approval: they list pending decisions and default stronger permissions to false, but do not apply decisions, load source text, create chunks, build indexes, use NotebookLM answers, or promote canon.

### Revision `working` - Sonar signal chain knowledge entry registered

- Added `.registry/knowledge/sonar_signal_chain/` as a source-supported reusable knowledge entry for sonar engineering orientation from underwater acoustics and hydrophone sensing through AFE, ADC, digital front-end processing, beamforming, detection, and calibration.
- Recorded public source-support boundaries for TI AFE receive-chain references, DOSITS detection-threshold context, QARTOD/NPL/IHO calibration and QA context, and MathWorks detection/CFAR seed references.
- Kept the entry below production design approval and below complete sourcebound packet status: NotebookLM outputs, weak web sources, military operational doctrine, and unsupported component-level design claims remain excluded.

### Revision `working` - RAG triage graph lens visibility added

- Added explicit source-slice triage/register inputs to the knowledge graph export so generated graph views can show metadata registration state alongside the existing RAG manifest lens.
- Embedded redacted `source_slice_projection` and `node.source_slice` overlays with registered, owner-review, blocked, and stronger-permission-needed counts for 3D filtering.
- Kept the projection metadata-only: it does not expose source text, source-handle arrays, source locator payloads, indexes, NotebookLM answers, applied owner decisions, or public canon promotion.

### Revision `working` - Dual deep research workflow and launcher added

- Added `.workflow/dual_deep_research_v0` as the workflow-owned procedure for running the repo-defined `nlm` NotebookLM CLI Deep Research path and Codex direct source research as separated advisory lanes before comparison.
- Encoded the existing CLI-first contract directly in the workflow, including `nlm research start ... --mode deep`, `status`, `import`, and bounded `notebook query`, so future agents do not rediscover the basic NotebookLM command shape every run.
- Added an explicit first goal-declaration step plus a `subagent_stage_manifest` so material NotebookLM, Codex direct research, and comparison stages run through fresh bounded subagent contexts or record a blocker and lower the claim.
- Routed the completed research packet to `knowledge_wiki_cell` / `knowledge_wiki_pipeline_v0` as an automatic downstream handoff while keeping registration, Drive placement, NotebookLM packet-map updates, source sufficiency, owner decision, and wiki/canon promotion outside the research workflow.
- Added `.registry/skills/dual_deep_research` as a thin Codex launcher for the workflow while keeping Google Drive, NotebookLM packet maps, wiki registration, source truth, owner approval, ontology acceptance, and canon promotion outside the skill's authority.
- Evolved the workflow and launcher contract so downstream or adjacent workflow creation/evolution discovered during research routes through `$soulforge-workflow-generator`, then requires `$soulforge-workflow-check` before any completion, readiness, registration, or promotion claim.
- Tightened the workflow-check closeout guard so default-route switching/default-route-safety claims are explicitly outside the research lane, and changed the boundary-review template defaults from prefilled pass values to pending/unchecked values.
- Added a public-safe staged profile calibration archive for `dual_deep_research_v0`, promoted `profile_policy.yaml` from draft to active, selected `gpt-5.4-mini` / `low` / `dwarf` / `archivist` as the cheapest passing synthetic profile, and retained `gpt-5.5` / `low` / `dwarf` / `archivist` as the high-assurance shadow for first real pilots.
- Promoted the `dual_deep_research` Codex launcher skill to active and taught it to resolve the calibrated workflow `profile_policy.yaml` at execution time, without copying optimizer outputs or moving source truth, NotebookLM runtime, Drive/wiki registration, or owner approval authority into the skill.

### Revision `working` - RAG source slice review queue added

- Added metadata-only `source_slice_review_queue_v0` generation and validation under `guild_hall/rag` as the owner-review preparation layer after `source_slice_card_v0`.
- Added explicit `source-slice-review-queue` and `validate-source-slice-review-queue` CLI commands with `_workmeta` output-root guards.
- Kept review queues below owner approval, source-text retrieval, chunks, indexes, source truth, answer evidence, graph mutation, ontology acceptance, and canon promotion.

### Revision `working` - RAG source slice triage register added

- Added metadata-only `source_slice_triage_register_v0` generation and validation under `guild_hall/rag` so existing wiki/source intake criteria can auto-register passing public-safe source cards as `rag_metadata_knowledge_only`.
- Added explicit `source-slice-triage-register` and `validate-source-slice-triage-register` CLI commands with `_workmeta` output-root guards.
- Added a standing owner policy block that treats owner-defined criteria as automatic metadata-registration authority while keeping source-text retrieval, index build, NotebookLM packet membership, and public canon promotion false by default.
- Extended source-slice review queues to consume triage registers and emit only hold/blocked items, so passing metadata knowledge does not accumulate in owner review backlog.
- Kept triage registration below owner approval, source-text retrieval, NotebookLM packet membership, public canon promotion, source truth, graph mutation, ontology acceptance, and index build permission.

### Revision `working` - RAG source slice cards added

- Added metadata-only `source_slice_card_set_v0` generation and validation under `guild_hall/rag` as the preparation layer after `rag_manifest_v0` and before BM25/vector/source-text retrieval.
- Added explicit `source-slice-cards` and `validate-source-slice-cards` CLI commands with system/private output-root guards.
- Kept source slice cards below chunks, indexes, source truth, answer evidence, owner approval, and canon promotion.

### Revision `working` - RAG manifest graph lens projection added

- Added `--rag-manifest-ref` to the knowledge graph export so generated graph views can consume explicit `rag_manifest_v0` files as sanitized metadata-only overlays.
- Embedded `rag_projection` and `node.rag` readiness metadata for 3D RAG lens filtering, including answer-ready and lens-profile views.
- Kept the projection below source-text retrieval and answer authority: it does not load source text, NotebookLM answers, vector stores, BM25 indexes, private payloads, secrets, or runtime absolute paths.

### Revision `working` - Metadata-only RAG MVP added

- Added `guild_hall/rag` with `rag_manifest_v0` generation, validation, and a first manifest-backed metadata-only answer command.
- Added `npm run guild-hall:rag` and `npm run validate:rag` so RAG work can be generated, checked, and answered through the canonical command surface.
- Kept the MVP below source-text retrieval: it does not load private payloads, NotebookLM answers, vector stores, BM25 indexes, secrets, or runtime absolute paths.

### Revision `working` - Knowledge graph Codex review command connected

- Added `guild-hall:knowledge-graph -- review` to send a compact metadata-only retrieval plan through the Codex bridge for advisory relation-candidate review, defaulting to `gpt-5.5`.
- Added a generated 3D 탐지 카드 button that copies the exact terminal command for the selected node instead of letting the static browser execute local commands.
- Kept the bridge path below RAG answer generation, source truth, owner approval, validation, ontology acceptance, canon promotion, and graph mutation.

## 2026-05-23

### Revision `working` - Knowledge graph detection card guidance clarified

- Added an operator-facing Korean `판정` and `지금 할 일` block at the top of generated 3D preview detection cards.
- Clarified in the preview that a detection card is a review guide, not a RAG answer surface, and mapped missing-evidence signals to concrete next steps such as adding source/support edges, retrieval wiring, and benchmark checks.

### Revision `working` - GitHub down strict junction audit added

- Added `guild-hall:workspace-junction:audit` and `validate:workspace-junction` to make GitHub-down workspace junction checks deterministic.
- The audit now verifies each `_workspaces/<alias>` link target suffix against `_workmeta/system/bindings/workspace_junctions.yaml` `cloud_relative_path`, reports extra root mirrors such as `_workspaces/company`, and avoids printing host-local cloud roots.
- Updated the latest-update workflow and `github_down` Codex bridge so future download/update runs do not treat a merely existing but mis-targeted link as ready.

### Revision `working` - Tracked absolute paths normalized

- Replaced concrete host-local absolute paths in tracked test fixtures, calibration telemetry, public-safe docs, and helper references with relative or portable placeholders.
- Extended the path-policy cleanup from changed-file scope to tracked-repo scope so `validate:path-policy:all` reports zero tracked violations.
- Kept runtime-local roots, plugin cache locations, generated outputs, and source-file locations as metadata placeholders rather than repo-specific machine paths.

### Revision `working` - Knowledge graph preview detection card added

- Added a local metadata-only `탐지 카드 열기` action to the generated 3D knowledge graph node context menu.
- Rendered the selected-node card in the preview sidebar with candidate nodes, one-hop relation paths, source refs, coded missing-evidence items, and coded next-action items built only from embedded graph metadata.
- Added browser-test hooks for the card state while keeping the preview below NotebookLM, vector search, source text loading, Codex bridge auto-calls, graph mutation, and canon promotion.

### Revision `working` - Weekly mail visibility register added

- Added a metadata-only weekly visibility register for unresolved mail-derived work under `_workmeta/P00-000_INBOX/reports/triage/unresolved_weekly_visibility_register.md`.
- Extended mail work priority rows with deterministic due-date extraction, week-window matching, and route hint candidates so broad AUV/AXV/mAUV/O-ring and P24-049/군집/LIG SAS signals are visible without unsafe auto-assignment.
- Added `guild-hall:gateway:mail-work:weekly-visibility` plus week-window priority filtering, including event-only/quarantine fallback rows that remain `claim_ceiling: observed` and do not copy mail bodies, raw provider payloads, attachment filenames, URLs, or local paths.
- Guarded the private register output path, sanitized attachment type labels, and suppressed event-only fallback rows for mailbox events that already have gateway/project work status.

### Revision `working` - Knowledge graph retrieval plan contract stabilized

- Extended the metadata-only retrieval planner with selected-node mode through `--node-ref`, stable `candidate_nodes`, `selected_node`, `input`, coded missing/action items, and `detection_card` fields for future graph UI 탐지 카드 rendering.
- Made explicit missing `--graph-ref` paths fail instead of silently falling back to a different in-memory graph.
- Added fixture coverage for question-only planning, selected-node planning, and isolated selected-node missing-evidence honesty.
- Kept the planner below RAG/GraphRAG answer generation: it still does not load source text, query NotebookLM, run vector search, use a local LLM, mutate graph data, or promote canon.

### Revision `working` - Codex account bridge added

- Added `guild_hall/codex_bridge` and `npm run guild-hall:codex-bridge` to wrap the installed `codex exec` command for bounded analysis through the current Codex/ChatGPT login without storing an API key.
- Kept the bridge read-only, ephemeral, and advisory by default, with no auth-file reading and no claims of source truth, owner approval, ontology acceptance, canon promotion, or production readiness.
- Documented when to use the Codex account bridge versus deterministic graph CLI output or future sourcebound RAG workflows.

### Revision `working` - Knowledge graph detection-card roadmap recorded

- Added a roadmap candidate for extending the metadata-only knowledge graph preview and retrieval-plan CLI into a node-driven `탐지 카드` flow.
- Captured the recommended implementation sequence: planner contract stabilization, browser-side planner reuse, node context-menu action, sidebar card rendering, and later reviewed source/support edges.
- Scoped step 1 to stable planner JSON, fixtures, and validation so the graphics UI can consume the result without treating it as GraphRAG/RAG answer generation.

### Revision `working` - Knowledge graph retrieval plan command added

- Added a metadata-only `guild-hall:knowledge-graph -- plan` command that maps a question to candidate graph nodes, one-hop relation paths, source refs, claim ceilings, missing evidence, and next-action hints.
- Kept the command below GraphRAG/RAG answer generation: it does not load source text, query NotebookLM, run vector search, assemble citations, mutate graph data, or promote canon.
- Documented the retrieval plan surface as a navigation and sourcebound review planning step before any future retrieval workflow.

### Revision `working` - GraphRAG knowledge entry registered

- Added `.registry/knowledge/graph_rag/` as a source-supported reusable knowledge entry for GraphRAG / graph-assisted RAG orientation and query-routing decisions.
- Recorded claim limits so the entry does not assert Soulforge production adoption, benchmark superiority, private corpus suitability, source truth, ontology acceptance, or NotebookLM answer authority.
- Updated the knowledge graph exporter to read `claim_ceiling` from knowledge entries when present instead of always rendering registry knowledge as `canon_entry`.

### Revision `working` - Grill Me candidate skill added

- Added `.registry/skills/grill_me/` as a tracked candidate Codex skill for `/grill-me` style plan pressure-testing and design-decision interviews.
- Kept the package as a Soulforge implementation of the interview pattern rather than copying external product runtime content.
- Documented the installed mirror target as `soulforge-grill-me` through the existing skill sync flow.

## 2026-05-22

### Revision `working` - P26-014 masked KVDS mail routing added

- Updated gateway mail priority routing so KVDS/기뢰탐색음탐기 exact matches route to official `P26-014`, including masked `기X탐` subject prefixes such as `기0탐` and `기ㅇ탐`.
- Updated the mail work status contract sample and P26-014 private routing rule to keep the former P26-030 working label from capturing new KVDS 체계개발 mail.

### Revision `working` - HWP normalization-first rule added

- Added `HWP_NORMALIZATION_V0.md` as the public-safe rule that HWP source files are not body-analysis targets until re-saved/exported as HWPX derivatives.
- Clarified workspace/workmeta contracts so HWP originals, HWPX exports, and optional PDF/text companions stay in `_workspaces` or owner-approved shared worksite storage while `_workmeta` records only inventory, queue, hash, status, extraction summary, and comparison metadata.
- Kept password entry owner-controlled, NAS/source originals read-only, and P25/reference examples below official/current/approved/accepted authority claims.

### Revision `working` - Workspace root junction exclusion rule clarified

- Clarified that shared cloud/company roots are external link targets, not `_workspaces/company` direct-child materialization roots.
- Updated `_workspaces`, workspace model, installation, and multi-PC docs so other PCs remove stale root junction pointers locally while preserving the shared worksite target.
- Kept project payloads, host-local absolute paths, private binding values, and real workspace contents out of public canon.

### Revision `working` - Recurring project ledger update canon added

- Added `PROJECT_LEDGER_UPDATE_V0.md` as the public-safe procedure for treating owner-provided recurring company PJT ledger workbooks as private project-registration source inputs.
- Clarified that workbook payloads, real project lists, actual project codes, project names, 담당자 values, customer names, row dumps, and host-local OneDrive paths stay out of public repo.
- Extended the workmeta contract schema with optional ledger, workspace materialization, responsibility, schedule, and status hint fields for private metadata projection.
- Linked the recurring ledger rule from workspace onboarding, workspace project model, workspace docs index, and `_workspaces/README.md`.

### Revision `working` - `_workmeta` raw payload storage boundary clarified

- Clarified that `_workmeta` stores metadata, run records, evidence summaries, pointers, sizes, hashes, source notes, and relocation manifests, not actual source/reference files.
- Routed HWP/HWPX, Word, Excel, PowerPoint, PDF, archive, and mail payload files to `_workspaces` or owner-approved shared worksite storage.
- Updated workspace/workmeta contracts and procedure-capture rules so future SE reference packets keep raw files out of `_workmeta`.

### Revision `working` - Knowledge graph view v0 added

- Added a metadata-only knowledge graph view model for one-variable/one-meaning visual encoding, source trace, graph scope, layout presets, and the Obsidian canon read view versus operations graph view split.
- Added `guild_hall/knowledge_graph` to generate local `_workspaces/system/knowledge_view/**` graph JSON, adjustable HTML preview, and Obsidian-readable read-only notes from public canon metadata plus explicit knowledge-access ledger refs.
- Upgraded the default generated HTML preview to a bundled Three.js 3D graph while keeping `graph_preview_2d.html` as the SVG fallback view.
- Added generated connectivity diagnostics to `graph.json`, the 3D preview sidebar, and the Obsidian graph index so sparse layouts can be checked by component count, isolated nodes, relation counts, and extraction-scope gaps.
- Fixed generated graph tooltip positioning so hover cards use graph-panel-relative coordinates and stay near the hovered node instead of drifting by the sidebar offset.
- Added workflow profile policy extraction so `.workflow/*/profile_policy.yaml` primary species/class recommendations render as `recommends` edges, and added 3D node double-click focus with adjustable chain depth plus background double-click reset.
- Updated the 3D preview so connectivity counters follow the currently selected node/relation filters, node and relation controls use Korean labels, and the active palette appears as a top-right legend.
- Separated the default relation-color palette into higher-contrast hues so common edge types such as chain, routing, use, class, species, and recommendation lines are easier to distinguish on the dark 3D canvas.
- Added short connectivity metric definitions and optional component halos so large visible connected components can be read as subtle grouped outlines without changing node-type colors.
- Increased knowledge graph node-size thresholds, added a 3D node-size basis selector that defaults to visible connection count, and slightly reduced/repositioned arrowheads so usage or hub differences read more clearly against directed edges.
- Added an in-preview collapsible visual-rules panel explaining node size, node color, border, opacity, edge width/color/style, arrows, and component outlines directly in the 3D graph UI.
- Added 3D preview sliders for overall node scale and relative node-size spread so circle size can be tuned interactively without changing graph data.
- Added selectable component halo styles so the owner can switch between visible multi-angle component outlines and restrained single-line outlines.
- Replaced the 3D default component halo from a lime multi-ring outline with a softer `연두 글로우` cloud so component grouping is visible without large crossing bands.
- Brightened the 3D `연두 글로우`, fixed the preview to scroll only the sidebar instead of clipping the canvas, and grouped sidebar settings into collapsible sections.
- Refined the 3D `연두 글로우` particles from sparse square points into denser soft round points so component clouds read less like pixel noise.
- Spread the 3D `연두 글로우` particles across the full component cloud instead of concentrating them near the center.
- Tightened the 3D candidate-edge dash spacing and clarified the visual rules panel so candidate relations read as short dotted lines rather than broken geometry.
- Hid unrelated component glows during node focus so only the selected focus range keeps its `연두 글로우`.
- Changed the default component glow into a boundary-oriented `연두 윤곽 글로우` with a dotted spherical cloud so groups are wrapped by adjustable round points instead of filled from the center.
- Scaled `연두 윤곽 글로우` shell point count from component radius so large components keep visible point spacing instead of disappearing into sparse dots.
- Replaced the shell's spiral-like point placement with seeded 3D sphere-volume sampling so close zoom reads as a sphere instead of filled orbit lines.
- Added in-preview controls for `연두 윤곽 글로우` point spacing, point size, brightness, depth, inner radius, and jitter so the owner can tune the component cloud directly.
- Set the owner's tuned `연두 윤곽 글로우` values as the new 3D preview defaults and added a single `현재 설정 저장` button that persists the full local view configuration in browser storage.
- Added a node right-click exploration menu to the 3D preview with `탐구 프롬프트 복사`, `연결만 보기`, and `ref 복사` actions, including a manual-copy fallback when clipboard access is blocked, so graph observations can be carried into a Codex follow-up without changing graph data.
- Explicitly added `Knowledge` to the foundation ontology relation matrix so graph nodes align with `.registry/knowledge/**` canon entries and class-local `knowledge_refs.yaml` bindings.
- Kept graph weights, usage counts, recency, Obsidian links, and generated previews as navigation signals only, not source truth, ontology acceptance, owner approval, archive/retire execution, or canon promotion.

### Revision `working` - SE current-authority route wording tightened

- Tightened Systems Engineering Cell party and launcher wording so official/current source questions and accepted review/action/verification claims route to source acquisition, sufficiency review, review/action closure, or accepted-result workflows before stronger claims.
- Reflected the private current-source and claim-specific evidence route pilots as route posture only, without embedding private evidence paths, raw source payloads, project truth, official artifact authority, review approval, action closure, or verification acceptance.

### Revision `working` - SE cross-stage governance workflow registered

- Registered `se_cross_stage_mapping_governance_v0` as a governance-only workflow after private pilot review across the primary SE artifact-family rows.
- Added it as an optional Systems Engineering Cell route for cross-stage artifact coverage, claim ceilings, source gaps, owner-decision needs, and downstream rerun aggregation.
- Kept source truth, official artifact authority, stage readiness, review approval, verification acceptance, private evidence, and raw reference payloads outside the public route.

### Revision `working` - SE requirements traceability route pilot added

- Added a private `requirements_traceability_set` source acquisition and lookup pilot that keeps DAPA public sources at general-context scope, P25 examples at reference-only scope, and project-specific requirement/RTM/test/acceptance sources as explicit gaps.
- Added `page_module_trace_matrix_v0` as an optional Systems Engineering Cell route for trace-governance rows, missing evidence rows, and review/verification seed rows after source-intake state is known.
- Kept the route below final RTM authority, review approval, verification completion, production-ready behavior, and official artifact authority.

### Revision `working` - Systems Engineering Cell reference lookup route added

- Added party-owned `reference_lookup_route_candidates` to `systems_engineering_cell` so source-sensitive SE requests first consider official source packs and registered reference-example lookup hints.
- Kept `se_authority_example_bridge_agentic_lookup_v0` at `pilot_executed_private_candidate` posture: route hint only, not public canon, production-ready behavior, or official artifact authority.
- Thinly synced the Systems Engineering Cell launcher skill so it can notice party-declared private lookup candidates without embedding private evidence paths, source excerpts, or raw reference content.
- Recorded next pilot families as `requirements_traceability_set` and `quality_qgate_forms`.

## 2026-05-21

### Revision `working` - Project mail history private writer added

- Added a `_workmeta/<project_code>/reports/메일_이력/` private writer for mail-derived monster create/update/filing events.
- Added candidate-stage `_workmeta/P00-000_INBOX/reports/메일_이력/` history so received work-like mail is recorded before and even without monster creation.
- The writer now refreshes Korean-named `메일_이력.csv`, `메일_이력.xlsx`, and `메일_일정이벤트.ics` outputs with `이력키` upsert dedupe.
- Wired mail fetch candidate queue, gateway intake/update, and dungeon assignment filing to the writers without copying raw mail body, HTML, raw payload, attachment names, URLs, or local paths.

### Revision `working` - Always-on healer seven checks added

- Added a reusable healer check module for snapshot/map freshness, launchd liveness, stray development-file placement, report freshness, repo sync, secret/raw path leakage, and restore readiness.
- Integrated the seven checks into `guild-hall:healer:run`, with warning checks carried forward in activity context without marking the whole run failed.
- Documented the 24-hour PC check set and kept the mail-candidate-to-monster resolver classified as later work outside the healer success criteria.
- Added the concrete 24-hour PC pull, snapshot refresh, launchd install/verify, and healer light/full smoke rollout checklist.

### Revision `working` - Development intake storage rule clarified

- Added a roadmap-owned storage rule for development candidates, backlog, and future work so agents do not create ad hoc TODO or plan files.
- Routed unclear work to roadmap-level candidates, concrete owner work to existing owner surfaces, and unapproved agent-discovered implementation work to `_workmeta/**/dev_worker_candidate_queue`.
- Added a short `AGENTS.md` pointer so future development-intent capture checks the roadmap rule before writing files.

### Revision `working` - Mail notify attachment count excludes body links

- Updated gateway mail notification and mail candidate summaries so body links discovered in message HTML/text are not counted as user-visible attached files.
- Kept `body_link` entries in the event attachment array for link handling, while reporting attachment counts from actual message attachment parts only.

### Revision `working` - PCB Revision Library Cell launcher skill added

- Added `.registry/skills/pcb_revision_library_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/pcb_revision_library_cell` loadout.
- Framed the launcher around the practical route `allegro_pcb_dbdoctor_uprev_batch_v0` before `allegro_pcb_dlib_export_organize_v0`.
- Kept party chains, workflow procedures, optimizer profile policies, PCB payloads, Cadence paths, generated scripts, tool logs, owner mutation approvals, electrical/manufacturing claims, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-pcb-revision-library-cell-launcher`.

### Revision `working` - PCB revision/library party registered

- Added `.party/pcb_revision_library_cell/` as the reusable party for chaining `allegro_pcb_dbdoctor_uprev_batch_v0` into `allegro_pcb_dlib_export_organize_v0`.
- Registered the party in `.party/index.yaml`, updated party docs, and added compatibility hints to both Allegro workflow packages.
- Kept runtime board roots, Cadence executable paths, generated scripts, PCB payloads, tool logs, owner mutation approvals, and workflow profile choices outside party canon.
- Preserved non-claims for electrical correctness, manufacturing readiness, symbol geometry correctness, padstack engineering approval, and unattended archive-wide mutation.

### Revision `working` - Systems Engineering Cell launcher skill added

- Added `.registry/skills/systems_engineering_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/systems_engineering_cell` loadout.
- Framed the launcher around the practical request "find where this SE project is blocked and route the next workflow" rather than design automation.
- Kept party chains, workflow procedures, optimizer profile policies, project payloads, design authority, review approval, verification acceptance, owner decisions, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-systems-engineering-cell-launcher`.

### Revision `working` - Allegro DB Doctor workflow profile calibrated

- Added public-safe synthetic CLI calibration archive `cal_20260521_cli_quality_equiv_001` for `.workflow/allegro_pcb_dbdoctor_uprev_batch_v0/`.
- Updated the workflow profile policy to prefer `gpt-5.4-mini` / `medium` / `dwarf` / `auditor`, with `gpt-5.4` / `medium` and `gpt-5.5` / `medium` shadows for quality-sensitive reruns.
- Kept DB Doctor runtime paths, real PCB payloads, private run truth, and secrets out of the public archive; the calibration remains a profile recommendation, not an unattended full-archive conversion claim.

### Revision `working` - Knowledge Wiki Cell launcher skill added

- Added `.registry/skills/knowledge_wiki_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/knowledge_wiki_cell` loadout.
- Kept party chains, workflow procedures, optimizer profile policies, source truth, owner decisions, archive authority, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-knowledge-wiki-cell-launcher`.

### Revision `working` - Sample party templates retired

- Removed the sample `vanguard_strike` and `lineage_strike` party packages from active `.party` canon.
- Updated the party catalog, party README, naming draft docs, workflow compatibility notes, and sample species bias so no active reference points at the retired party ids.
- Kept the underlying sample workflows as unbound workflow entries rather than deleting additional workflow canon in the same cleanup.

### Revision `working` - Korean knowledge closeout wording clarified

- Clarified that bounded Soulforge completion reports should show user-facing Korean knowledge trigger and claim-ceiling labels first, such as `지식 트리거 확인: 책임자 판단 필요` and `주장 한계: 관찰됨`.
- Kept internal enum values for ledger, CLI, review packet, and template compatibility, while treating enum-only final wording as legacy/compatibility rather than the preferred user surface.
- Updated the knowledge trigger stop guard to accept `책임자 판단 필요` while preserving the older `오너 판단 필요` and English compatibility lines.

### Revision `working` - Knowledge pass-to-registration rule clarified

- Clarified that knowledge, source, candidate, and canon criteria that pass must be registered in the matching owner surface during the same bounded task.
- Split the 5-question knowledge trigger check from public canon registration: trigger pass records candidate, metadata, follow-up, sourcebound review, or owner-decision evidence; canon pass records the canon entry or package.
- Required concrete hold reasons when passed registration is deferred, such as owner hold, unclear owner surface, validator blockage, missing access, or public/private boundary risk.

### Revision `working` - Party launcher skill author added

- Added `.registry/skills/party_launcher_skill_author/` as the tracked Codex authoring aid for turning an existing `.party/<party_id>` loadout into a thin callable launcher skill.
- Kept party chains, workflow procedures, optimizer profile policy, runtime bindings, project payloads, and default-route authority outside the generated launcher skill.
- Documented the Codex app bridge shape with lean `codex/SKILL.md`, `codex/agents/openai.yaml`, and on-demand `codex/references/mapping.md`, so the installed mirror can be synced as `soulforge-party-launcher-skill-author`.

### Revision `working` - Drive warehouse and NotebookLM bookshelf rules clarified

- Added `KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md` to separate Google Drive as the source warehouse, NotebookLM notebooks as query bookshelves, `_workmeta` as the source catalog, and ontology candidates as review-gated metadata.
- Updated the knowledge operating model, workflow stack, curation runbook, and public LLM wiki example templates so Drive folders are no longer described as NotebookLM bookshelves.
- Linked the same warehouse/bookshelf rule from `knowledge_wiki_cell` so party execution inherits the terminology without duplicating the rule body.
- Preserved the existing `Soulforge_LLM_Wiki_Bookshelf/` Drive root as a compatibility label while clarifying that its role is warehouse/archive storage, not query authority or canon.

### Revision `working` - Allegro DB Doctor uprev workflow added

- Added `.workflow/allegro_pcb_dbdoctor_uprev_batch_v0/` as a registered workflow for owner-gated Cadence DB Doctor legacy PCB database uprev batches.
- Kept sample folders and installed Cadence executable paths out of the public workflow package; operators supply absolute runtime paths through the batch scope packet.
- Captured the old/new packet shape, DB Doctor `-outfile` route, log-based warning-bearing completion classifier, and non-claims for electrical correctness, manufacturing readiness, and unattended full-archive mutation.

### Revision `working` - Allegro dlib export organize workflow added

- Added `.workflow/allegro_pcb_dlib_export_organize_v0/` as a registered workflow for owner-gated Cadence Allegro `dlib` board library export and library folder organization.
- Kept board roots, installed Allegro paths, generated scripts, and raw PCB payloads out of the public workflow package; operators supply absolute runtime paths through the library export scope packet.
- Captured the `padpath`, `psmpath`, `devpath`, and `logs` folder classification rules, `dump_libraries.log` zero-error success check, transient export folder cleanup check, and non-claims for electrical correctness, symbol geometry correctness, manufacturing readiness, and unattended full-archive mutation.

### Revision `working` - Allegro dlib workflow profile calibrated

- Added public-safe staged CLI calibration archive `.workflow/allegro_pcb_dlib_export_organize_v0/calibrations/cal_20260521_dlib_public_fixture_001/`.
- Promoted the workflow profile policy to `gpt-5.5` / `medium` / `dwarf` / `archivist` after semantic quality-gate review on a synthetic fixture.
- Recorded calibration limitations: no real Allegro execution, raw PCB payload, installed Cadence path, private-state data, `_workspaces` output, or `_workmeta` run truth was used.

## 2026-05-20

### Revision `working` - SE assistant operating loop registered

- Added `.workflow/se_assistant_operating_loop_v0/` as a structure-only request router for systems-engineering assistant work across scaffold, stage-gap, source/wiki, readiness, owner-decision, review, and closeout workflows.
- Added `.party/systems_engineering_cell/` as the reusable party/loadout for SE assistant routing, while keeping workflow profile choices and project-local run truth outside party canon.
- Added `docs/architecture/workspace/SE_ASSISTANT_OPERATING_MODEL_V0.md` and tightened Boss Clear wording so stage completion cannot be inferred from folder/output presence alone.
- Kept the new route below production-ready or pilot-executed claims; it is registered public-safe orchestration structure, not design authority, source truth, review approval, or verification acceptance.

### Revision `working` - Mail work priority queue projection added

- Added metadata-only `mail_work_priority` refresh/list command surfaces on top of `mail_work_status`, writing local priority output to `guild_hall/state/gateway/mail_work_status/priority_latest.json`.
- Added deterministic subject-only routing rules for exact `P26-030`, unresolved work review inbox, duplicate thread grouping, personal/admin holds, and promo/non-work holds without reading raw mail payloads.
- Documented the priority projection contract and added gateway tests for exact routing, duplicate threads, personal/admin, promo non-work, raw boundary false, and list filtering.

### Revision `working` - Long-thread handoff Codex wrapper added

- Added `.registry/skills/long_thread_handoff/` as the tracked Codex wrapper for explicit long-thread contamination-free handoff requests.
- Kept the launcher opt-in only, so normal short tasks do not automatically inherit the fresh-subagent manager mode.
- Preserved Telegram delivery as a safe closeout handoff unless a configured sender and explicit authorization are available.

### Revision `working` - GitHub up/down Codex wrappers added

- Added `.registry/skills/github_down/` as the tracked Codex wrapper for GitHub down/latest-update/download requests.
- Added `.registry/skills/github_up/` as the tracked Codex wrapper for GitHub up/upload/publish requests.
- Bound the wrappers to the existing `.workflow/latest_update_sync_and_followup_v0/` and `.workflow/github_upload_publish_v0/` procedures instead of moving GitHub policy into skills.
- Documented that `skill sync` only materializes repo-tracked `.registry/skills/**/codex` wrappers and cannot infer local-only skills from another PC.

### Revision `working` - Mail work status projection and gateway sync-back added

- Added `docs/architecture/workspace/MAIL_WORK_STATUS_V0.md` and `guild_hall/gateway/mail_work_status.mjs` so local-only `mail_work_status/latest.json` can reconcile mail candidate, gateway intake, project monster, private mission index, and battle event metadata into one status projection.
- Added `guild-hall:gateway:mail-work:refresh` and `guild-hall:gateway:mail-work:list` command surfaces plus gateway projection tests.
- Updated dungeon assignment filing so gateway-origin monsters sync back to `transferred` current state, populate `project_monster_ref` and private `mission_ref` when available, and append matching gateway history / global event rows without copying raw mail payload.

### Revision `working` - GitHub upload workflow added

- Added `.workflow/github_upload_publish_v0/` as a reusable upload workflow for validating, committing, and pushing public Soulforge changes together with `_workmeta` and `private-state` metadata repo changes.
- Registered the workflow in `.workflow/index.yaml`, added it to `guild_master_cell` allowed workflows, and recorded the Korean global-name candidate `운영_깃허브업로드_v0`.
- Kept public/private Git roots separate and required validation plus boundary review before claiming upload completion.

### Revision `working` - Latest update follow-up workflow added

- Added `.workflow/latest_update_sync_and_followup_v0/` as a draft event-driven workflow for checking latest GitHub/upstream updates, companion repo freshness, project material completeness, workspace junction state, and follow-up routes.
- Registered the workflow in `.workflow/index.yaml` and linked it from `.workflow/README.md`.
- Ran a report-only private pilot, moved the workflow to active report-only maturity, added it to `guild_master_cell` allowed workflows, and recorded the Korean global-name candidate `운영_최신업데이트후속점검_v0`.
- Added Codex skill mirror drift handling so latest-update runs can compare `.registry/skills/**/codex` against the local installed skill mirror and sync missing or stale skills through `npm run skills:sync`.
- Kept junction repair authority owner-gated: public workflow canon references `_workmeta/system/bindings/workspace_junctions.yaml` as portable intent only and does not store host-local cloud roots, secrets, source payloads, or automatic mutation authority.

### Revision `working` - Workspace shared-link rule clarified

- Clarified that project payloads shared across owner PCs should live in an owner-approved shared worksite, with `_workspaces/<project_code>/` materialized as a local junction or symlink view.
- Updated onboarding, workspace model, installation, and multi-PC docs to keep host-local shared target paths out of public tracked files.
- Kept public Git scope limited to generic workspace rules; raw project media and measurement payloads remain outside public tracking.

## 2026-05-19

### Revision `working` - 21 workflow optimizer gap batch closed

- Applied workflow-check and workflow-optimizer follow-through to the 21 workflows listed in the 2026-05-19 optimizer gap scan.
- Added or replaced `profile_policy.yaml` calibration state, public-safe `calibrations/cal_20260519_quality_equiv_001/` archives, and `history/2026-05-19_quality_equiv_001.md` notes across the affected workflow packages.
- Added missing workflow package READMEs for `frontline_assault` and `build_lineage_map`, while keeping readiness labels conservative and leaving `post_development_review_gate_v0` locked to its strongest review profile.

### Revision `working` - Workflow check skill registered

- Added `.registry/skills/workflow_check/` as the tracked canonical skill package for the installed `soulforge-workflow-check` Codex skill.
- Added the Codex bridge and UI metadata so other PCs can materialize it with `npm run skills:sync -- workflow_check` or the bootstrap `--all` sync.
- Linked the skill from `.registry/skills/README.md` and kept registration/default-route authority outside the checker itself.

## 2026-05-18

### Revision `working` - Knowledge wiki Obsidian contract and synthetic pilot smoke

- Added an Obsidian export decision surface to `knowledge_wiki_pipeline_v0` so the composite candidate now records when a generated read-only view is requested and blocks export unless the source is canon-backed.
- Fixed the default Obsidian posture to `_workspaces/system/knowledge_view/obsidian_export/` as a local generated runtime surface, not a canon owner root and not a Drive-synced primary vault.
- Clarified in `knowledge_wiki_cell` party docs that Obsidian consumes canon-backed `.registry/knowledge` entries or approved canon packages only; `_workmeta` payloads, Drive candidate files, and NotebookLM answers remain outside the vault body.
- Expanded `KNOWLEDGE_WIKI_WORLDVIEW_V0.md` with concrete Obsidian file naming, frontmatter, link, metadata-ref, read-only, and regen/drift rules.
- Recorded a latest-policy synthetic manifest-only smoke under `_workmeta/system/runs/knowledge_wiki_cell_latest_policy_smoke_20260518/` and kept `knowledge_wiki_pipeline_v0` unregistered even after the pilot.

### Revision `working` - SE knowledge wiki composite registered and selected

- Registered `knowledge_wiki_pipeline_v0` in `.workflow/index.yaml`.
- Switched `knowledge_wiki_cell` to use `knowledge_wiki_pipeline_v0` as the default party entry by owner direction.
- Kept the older four-stage lane as the composite workflow's downstream execution chain rather than removing those registered workflows.

### Revision `working` - Workflow knowledge preflight added

- Removed the mistaken `knowledge_investigation_cell` party surface because the intended abstraction is a cross-cutting pre-start investigation workflow, not a reusable party chain.
- Added `.workflow/workflow_knowledge_preflight_v0/` as the generic workflow that checks `.registry/knowledge`, canon-backed Obsidian export, NotebookLM bindings, `_workmeta` evidence, and Drive refs before a target workflow starts.
- Kept the result metadata-only so the preflight seeds claim ceilings and next routes without becoming source truth, owner approval, or canon authority.

### Revision `working` - Knowledge wiki worldview overview added

- Added a teammate-facing Markdown and standalone HTML overview for the Soulforge knowledge wiki worldview.
- Explained source truth, private projection, concept candidates, review gates, canon knowledge, access ledger, current development status, and the SE wikiization next steps in public-safe language.
- Added the workspace map for local PC, `_workmeta`, Google Drive, NotebookLM, `.workflow`, `.party`, `.registry/knowledge`, and access ledger roles.
- Revised the workspace map so Google Drive is the owner-held file archive and backup for inbox candidates, source files, working bundles, and canon packages; `_workmeta` remains the Karpathy-style data-work location, NotebookLM remains the canon-package query interface, and Obsidian remains a canon-only read view.
- Threaded the Drive archive model into the wiki party/workflow surfaces by adding owner-held archive manifest fields to source intake, sourcebound projection, and the draft SE knowledge wiki pipeline.
- Added `codex_skill_auto_sync` archive authority so approved Codex skills or the Google Drive connector may upload/sync bounded archive files without per-file owner confirmation while preserving source/canon/secret boundaries.
- Linked the overview from the guild hall architecture README.

### Revision `working` - Knowledge wiki party registered

- Registered `.party/knowledge_wiki_cell` as the reusable Karpathy-style sourcebound wikiization party.
- Linked source intake, private sourcebound projection, metadata-only knowledge access capture, and post-development review into one party-level workflow chain.
- Kept workflow execution profiles, model/reasoning/species/class/unit optimization, source payloads, extracted text, and private wiki projections outside party canon.

### Revision `working` - Party model re-scoped to workflow chains

- Re-scoped `.party` from reusable unit/team composition to reusable workflow-chain/loadout orchestration.
- Clarified that workflow optimizer outputs for model, reasoning effort, species, class, and unit/profile choices belong under each `.workflow` profile/calibration surface.
- Updated party, mission, runner, autohunt, ontology, UI source-map, and workspace docs to treat party as a higher-level workflow sequence that prevents agents from re-expanding every lower workflow by default.

## 2026-05-17

### Revision `working` - Knowledge workflow stack and missing layers added

- Added `monster_knowledge_preflight_v0` as the query-first front gate for source-heavy or ambiguity-heavy monsters so project wiki, NotebookLM bindings, and source ledgers can be inspected before the main workflow runs.
- Added `knowledge_candidate_triage_v0` as the explicit filter between candidate material and reusable wiki state, covering bookshelf placement, packet eligibility, owner review routing, and metadata-only boundary review.
- Added `wiki_curation_maintenance_v0` as the executable metadata-only curation layer and `llm_wiki_builder_v0` as the end-to-end stack orchestrator that ties preflight, triage, optional sourcebound deepening, curation, usage capture, and governance into one bounded route.
- Added `KNOWLEDGE_WORKFLOW_STACK_V0.md` and `WIKI_CURATION_MAINTENANCE_V0.md` to document the usable six-layer knowledge stack, the current-default project operating loop, and the human-readable curation runbook that sits beside the executable curation layer.
- Clarified in `KNOWLEDGE_OPERATING_MODEL_V0.md` and `AUTOHUNT_MODEL.md` that source-heavy monsters may use a knowledge preflight front gate and that curation remains a separate metadata-only maintenance layer.

## 2026-05-18

### Revision `working` - Workflow lane and party service lane boundary added

- Added workflow `classification_lane` guidance so workflow lanes are discovery/indexing metadata only, not owner or execution authority.
- Added party `service_lane` guidance and fields to the three current party templates so party fit can be described without owning workflow steps.
- Extended the workflow draft template with `classification_lane` and `execution_binding` placeholders, keeping actual execution binding in party allowed-workflows or mission assignment.
- Updated the canonical `workflow_generator` skill and installed `soulforge-workflow-generator` mirror so future generated workflows preserve the same lane and party-binding boundary.
- Added a draft lane taxonomy and Korean display-name fields for workflow classification lanes and party service lanes.

### Revision `working` - Workflow and party name mapping drafts added

- Added `.workflow/docs/WORKFLOW_NAME_MAPPING_TABLE_V0.md` with draft Korean alias/display-name candidates for all 44 workflows currently registered in `.workflow/index.yaml`, without renaming ids, folders, or index entries.
- Added `.party/docs/PARTY_NAMING_CONTRACT_V0.md` and `.party/docs/PARTY_NAME_MAPPING_TABLE_V0.md` to separate stable `party_id`, slash-free Korean `global_name_ko` alias candidates, and descriptive `display_name_ko` values for the 3 current party entries.
- Added derived static HTML review pages at `.workflow/docs/WORKFLOW_NAMING_DRAFT_V0.html` and `.party/docs/PARTY_NAMING_DRAFT_V0.html` so humans can review the draft naming layers and full mapping tables without treating HTML as canon.
- Clarified the draft resolve chain `global_name_ko -> workflow_id -> party_id -> path` while keeping alias catalog placement, namespace policy, and any future rename/deprecation as follow-up owner decisions.
- Linked the new draft mapping documents from `.workflow/README.md` and `.party/README.md`.

### Revision `working` - Workflow naming contract draft added

- Added `.workflow/docs/WORKFLOW_NAMING_CONTRACT_V0.md` as a draft authoring contract for separating slash-free Korean invocation aliases, descriptive Korean display names, and canonical English `snake_case` workflow ids.
- Linked the draft from `.workflow/README.md`, `.workflow/authoring/README.md`, and the workflow draft template, including draft-only `global_name_ko` and `display_name_ko` fields, so new workflow authoring can reference it without adding validator enforcement.
- Clarified that Codex official feature constraints do not define Soulforge workflow global names, and that Korean invocation aliases must resolve to canonical `workflow_id` entries in `.workflow/index.yaml`.
- Documented a conservative migration posture for the 44 registered workflows observed on 2026-05-18, including mixed `_v0` usage and legacy short ids.

### Revision `working` - Knowledge stack made runnable and practiced

- Raised `monster_knowledge_preflight_v0`, `knowledge_candidate_triage_v0`, `wiki_curation_maintenance_v0`, and `llm_wiki_builder_v0` to `pilot_executed_private_evidence` after a bounded private P24 practice run.
- Recorded that the stack can now execute `query-first preflight -> candidate triage -> known-gap stop -> curation packet -> final builder handoff` without rereading raw sources or overclaiming technical authority.
- Kept the remaining gaps narrow: per-source Drive-backed source rows still need to be populated over time, and scheduled maintenance binding is still weaker than the manual/review-driven path.

### Revision `working` - LLM wiki bookshelf public example added

- Added a public-safe `llm_wiki_bookshelf/` example package with an offline/manual canonical-source intake checklist, metadata-only source ledger template, and NotebookLM packet map template.
- Linked the example from the workspace examples index and knowledge operating model while keeping source payloads, live Drive or NotebookLM IDs, account state, runtime absolute paths, and NotebookLM answers out of public canon.
- Kept Google Drive bookshelf and NotebookLM packet claims at manual/advisory metadata level without requiring live external state.

### Revision `working` - Google Drive LLM wiki bookshelf boundary added

- Documented Google Drive `Soulforge_LLM_Wiki_Bookshelf/` as the owner-held source bookshelf model for LLM wiki material across PCs.
- Clarified that NotebookLM should use approved CANON bookshelf sources while OneDrive remains for active work files and `_workmeta` remains the metadata ledger.
- Kept Drive folder placement, NotebookLM output, drafts, raw mail, local-only working files, and uncertain versions out of canon authority without source approval, review evidence, and owner records.
- Added the planned development direction for metadata-only source ledgers, NotebookLM packet maps, knowledge-use records, review packets, and promotion candidates.

### Revision `working` - Mac mini and MacBook role split clarified

- Clarified the current owner device split: MacBook Air as `portable_dev_pc`, Mac mini operations clone as `always_on_node`, and Mac mini development worktree as a separate `dev_worker_pc`-style surface.
- Updated always-on and dev-worker bootstrap prompts so the Mac mini can run long-lived development tasks without dirtying the clean operations clone.
- Documented that OneDrive/cloud workspaces may hold actual project files only, while public repos, `_workmeta`, `private-state`, `guild_hall/state` runtime, env files, sessions, and tokens stay outside cloud sync.

### Revision `working` - Local absolute path upload guard added

- Added `validate:path-policy` to block concrete local absolute paths in changed tracked/upload candidates before root validation proceeds.
- Added `validate:path-policy:all` and `validate:path-policy:state` for full tracked audits and companion repo changed-file audits.
- Fixed registry knowledge YAML notes that became invalid once the canon validator started parsing knowledge entries.

### Revision `working` - End-of-task knowledge trigger check added

- Added an end-of-task Knowledge Trigger Check to the Soulforge execution contract so bounded work closes with `no_trigger`, `metadata_only_record`, `sourcebound_review_candidate`, or `owner_decision_needed`.
- Extended `post_development_review_gate_v0` and its review packet template to record the trigger result before supervisor acceptance without granting source-truth, ontology, owner-approval, graph, archive/retire, or canon authority.
- Clarified that existing `knowledge_access_event.accumulation_delta_hint` can carry lightweight trigger signals for already-used refs, while new unregistered patterns should route through procedure capture, daily sweep, sourcebound review, or owner decision.
- Added `guild-hall:knowledge-access record` trigger flags so end-of-task checks can append metadata-only `accumulation_delta_hint` rows from the CLI, with validation coverage for allowed trigger results, routes, and claim ceilings.
- Defined task end as bounded completion reporting rather than thread closure, and added a low-noise Codex Stop hook guard helper that only catches missing `Knowledge trigger check:` lines without judging or storing knowledge.
- Localized the user-facing Stop hook closeout to Korean `지식 트리거 확인: 없음` while keeping legacy English closeout lines accepted for compatibility.

### Revision `working` - Renderer Knowledge Lane review fixes

- Whitelisted renderer Knowledge Lane owner-gated states, the `observed` claim ceiling, and known private/local `evidence_counts` keys before display.
- Suppressed Knowledge Lane state/claim rendering unless the loaded snapshot is fresh, so stale or invalid stored lanes degrade instead of looking current.
- Added the snapshot contract presence fields `helper_present`, `notebooklm_bridge_present`, `workflow_present_count`, and `fixture_present` to the renderer display.

### Revision `working` - Renderer Knowledge Lane slice added

- Added renderer-web consumption of `operation_board.sections.knowledge_lane` as a metadata-only Operation Board section.
- Rendered only sanitized owner-gated state, claim ceiling, evidence counts, blockers, and next owner-review action without validation, ontology acceptance, owner decision, or canon promotion authority.

### Revision `working` - Snapshot knowledge lane review fixes

- Enforced snapshot v0 `knowledge_lane` state/blocker/evidence support and claim-ceiling validation in freshness comparison so manually strengthened stored lanes fail instead of passing as fresh.
- Kept public helper/docs/workflows/fixtures out of `knowledge_lane.evidence` counts; private/local metadata evidence is counted separately from public metadata surfaces.
- Excluded auth/session-shaped knowledge access files from entry counts while continuing to avoid reading or exposing their contents/names.

### Revision `working` - Snapshot knowledge lane status added

- Added a metadata-only `knowledge_lane` snapshot surface and Operation Board section for knowledge/NotebookLM/ontology lane status.
- Summarized only owner-gated state, helper/workflow/fixture presence, evidence presence/counts, claim ceiling, blockers, and next owner-review action.
- Kept NotebookLM auth/session data, query/answer/source payloads, private report prose/filenames, ontology candidate statements, owner decisions, graph mutations, and registry promotion claims out of the snapshot.

### Revision `working` - NotebookLM metadata bridge helper promoted

- Added `guild_hall/knowledge_access/notebooklm_bridge.mjs` plus `notebooklm-bridge`/`notebooklm-import` CLI commands for importing explicit NotebookLM-like binding/source-ledger/query-log metadata into `imported_log_entry` ledger rows.
- Kept the bridge metadata-only and advisory: no `nlm` calls, no auth/session file reads, no source payload or free-form query-log reason copying, no no-query event fabrication, and no canon/ontology mutation.
- Blocked malformed `timestamp_utc` rows, unsafe `entry_ref` auth/session/runtime paths, and invalid event enum cells before deriving imported ledger refs or emitting bridge summaries.
- Extended the public synthetic NotebookLM fixture with a blocked no-query case and validation coverage for positive imports, CLI import, and no-query/no-fabrication behavior.

### Revision `working` - Synthetic NotebookLM bridge fixture added

- Added a public-safe synthetic NotebookLM bridge fixture under `docs/architecture/workspace/examples/notebooklm_bridge/`.
- Covered NotebookLM-like `imported_log_entry` advisory rows in the knowledge access analyzer test without changing helper code.

### Revision `working` - Test/evaluation result ingest workflow registered

- Registered `.workflow/test_evaluation_execution_result_ingest_v0` as a contract-level/private-evidence workflow for packaging non-simulation-specific execution or result-ingest evidence into candidate result rows, blockers, owner follow-up, and downstream acceptance-review handoffs.
- Kept the claim ceiling at `registered_contract_private_evidence`: this registers the reusable package only, not accepted verification, owner acceptance, TRR/DT/FCA/OT/PCA approval, usable status, production readiness, or profile optimization.
- Recorded private registration governance under `_workmeta/system/runs/test_evaluation_execution_result_ingest_registration_20260517_014107/` and left controlled pilot execution plus accepted-result handoff verification as future strengthening gates.

### Revision `working` - Knowledge validation guardrails tightened

- Added shared knowledge claim states for `observed`, `source_supported`, `validated_private`, `canon_candidate`, `canon_entry`, and `rejected_or_blocked` knowledge.
- Clarified that NotebookLM, LLM advice, ledgers, and analysis labels are advisory signals only, not validation, ontology acceptance, owner approval, or canon-promotion authority.
- Added minimal canon entry guards for registry knowledge entries and public canon promotion.

### Revision `working` - SE stage artifact gap scan workflow registered

- Registered `.workflow/se_stage_artifact_gap_scan_v0` as the reusable controller package for one-stage SE artifact/gap scanning, owner/source queueing, blocker preservation, draftable/diagram lane surfacing, and downstream route mapping.
- Kept the claim ceiling at `registered_controller_private_evidence`: this registers the controller package only, not PDR/CDR/TRR/FCA/OT readiness, approval, test execution, verification completion, production readiness, or profile optimization.
- Recorded private registration governance under `_workmeta/system/runs/se_stage_gap_scan_registration_20260517_013027/` and linked later-stage route vocabulary to already registered generic workflows such as verification planning, harness planning, accepted result packets, FCA, and PCA lanes.

### Revision `working` - Knowledge operating model documented

- Added `docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md` to explain how the knowledge access ledger, manual candidate capture, LLM suggestion approval, end-of-work sweep, sourcebound packet loop, and access-event analysis workflow combine without crossing public/private owner boundaries.
- Linked the operating model from the guild_hall architecture index and the knowledge access helper README, including the rule that normal file reads are not automatically observed unless the helper/read wrapper or explicit record is used.

### Revision `working` - HTML outbound mail runner added

- Added `guild-hall:gateway:send-mail` as a local SMTP outbound runner under `guild_hall/gateway/mail_send/`.
- Enabled `multipart/alternative` HTML report emails with plain-text fallback while keeping SMTP credentials in local-only `guild_hall/state/gateway/mailbox/state/mail_send.env`.
- Updated the mail send owner docs so outbound snapshots and append-only send logs remain under ignored `guild_hall/state/gateway/**` local state.

### Revision `working` - AI output format policy added

- Added `AI_OUTPUT_FORMAT_POLICY_V0.md` to keep durable source-of-truth records in Markdown/YAML/JSON while allowing self-contained HTML as derived human-review artifacts.
- Required HTML review artifacts to preserve public/private/secret boundaries and export durable decisions back to text or structured data.
- Added a dedicated validator/test surface for the output-format policy.

### Revision `working` - Dev worker candidate promotion lane added

- Added a `dev_worker_candidate_queue` lane for agent-discovered work so self-generated tasks can be recorded as candidates without being immediately claimable by high-performance worker PCs.
- Added `guild-hall:dev-worker:candidates` to list candidates and promote owner-approved candidates into `_workmeta/<project_code>/dev_worker_queue/*.yaml`.
- Tightened `dev_worker` claim eligibility so `origin.kind: agent_generated` ready packets require `owner_approval.approved: true`.
- Added a low-risk `auto_approval` policy so eligible agent-generated candidates can be policy-approved and promoted without manual owner approval.
- Updated the local dev-worker automation prompt to run auto-promotion before claiming one ready task.
- Updated daily work packets to show candidate, promotable candidate, and auto-approvable candidate counts.
- Documented high-performance PC setup, candidate approval, promotion, and worker activation boundaries.
- Added a self-contained HTML next-steps review artifact for owner-facing setup and operation handoff.

## 2026-05-16

### Revision `working` - Repository line ending policy pinned

- Added root `.gitattributes` and `.editorconfig` to keep text files normalized to LF across Windows, editors, and GitHub workflows while preserving common binary artifact formats.

- Documented the always-on Mac mini strategic review stack, separating deterministic `healer`, daily `night_watch`, and weekly `ouroboros_strategic_review_harness_v0` responsibilities.
- Strengthened `ouroboros_strategic_review_harness_v0` with a Socratic question router, ambiguity ledger, owner-question option shape, and closure restatement gate so strategic gaps become answerable decisions instead of broad meta-questions.

### Revision `working` - Knowledge access ledger operating model clarified

- Clarified that ordinary knowledge use creates lightweight metadata-only ledger/register rows, while `knowledge_access_event_capture_v0` is the later normalization, rollup, analysis, and routing workflow rather than a required per-access run.
- Added minimal capture-mode, manual-note, reason-used, output-ref, and ledger/register refs to the public-safe event and binding templates while keeping source truth, payload truth, ontology acceptance, archive/retire decisions, and owner decisions out of scope.

### Revision `working` - Knowledge access ledger helper added

- Added `guild_hall/knowledge_access` as a minimal helper for appending metadata-only knowledge access JSONL rows from explicit `read` and `record` commands.
- Blocked secret-like, private/runtime, absolute, and traversal knowledge refs before ledger append, and added focused `validate:knowledge-access` coverage to the root acceptance harness.

### Revision `working` - Knowledge access event capture workflow registered

- Added `.workflow/knowledge_access_event_capture_v0` as a reviewed public-safe draft workflow for capturing metadata-only knowledge access events across workflows, skills, missions, user tasks, tools, and advisory handoffs.
- Defined actor, target knowledge ref, access type, work context, timestamp, outcome/usefulness, relation hints, usage rollups, hot/warm/cold/stale/archive/retire candidate labels, strong/weak/orphan/redundant link candidates, and graph update packets.
- Linked the workflow as an optional downstream usage-lineage lane from `sourcebound_knowledge_packet_operating_loop_v0` while keeping source truth, private payloads, advisory answers, archive/retire execution, owner decisions, and profile optimization out of scope.

### Revision `working` - Sourcebound knowledge packet loop registered

- Registered `.workflow/sourcebound_knowledge_packet_operating_loop_v0` as a pilot-executed private-evidence workflow for Karpathy-style source intake, private source-bound projection/index/log generation, contradiction/gap lint, concept-candidate extraction, claim-ceiling routing, optional advisory NotebookLM handoff, and workflowization review packets.
- Kept source truth in source packets or owner-held sources, kept projection outputs private and derivative, and left profile policy draft/conservative with no production-ready or profile-optimized claim.

### Revision `working` - Ouroboros strategic review harness drafted

- Added `.workflow/ouroboros_strategic_review_harness_v0` as a reviewed public-safe draft workflow for periodic vision alignment review and owner-intent gap probing.
- Added templates for `vision_alignment_report`, `owner_intent_gap_register`, `owner_question_queue`, `canon_constraint_candidate_register`, `next_focus_recommendation`, and `ouroboros_loop_ledger`.
- Recorded a private Ouroboros harness study/adoption packet under `_workmeta/system` and kept external runtime installation, ontology convergence claims, and automatic canon mutation out of scope.
- Allowed `guild_master_cell` to route strategic review and owner-intent gap requests through the new harness.
- Documented the harness as a weekly or owner-triggered `night_watch` candidate rather than a replacement for nightly boundary, portability, and context-drift checks.

### Revision `working` - SE assistant program direction documented

- Added an SE assistant north-star to `VISION_AND_GOALS.md` while keeping `se_foldertree_generate` limited to folder and plan-tracking scaffold generation.
- Added an SE assistant program lane to `DEVELOPMENT_ROADMAP_V0.md` without replacing the current `snapshot_to_operation_board_v0` active slice.
- Fixed the owner split so proactive orchestration lives in `.workflow`, `.mission`, `_workmeta`, and `guild_hall/night_watch`, while missing design content stays as owner questions or blockers instead of agent inference.

### Revision `working` - SE assistant widened to design-support artifact scope

- Sharpened the SE assistant wording toward a systems-engineering design-support aide rather than a narrow document helper.
- Clarified that `artifact` in the SE assistant lane includes documents, diagrams, traceability matrices, analysis packets, review evidence, owner-decision records, open-question registers, and verification-planning artifacts.
- Kept `se_stage_artifact_gap_scan_v0` as the first safe workflow name while broadening its private draft outputs to cover design-support queues such as `draftable_artifact_queue`, `diagram_need_register`, and `stage_readiness_summary`.

### Revision `working` - Post-development review gate and Windows acceptance portability

- Added a risk-tiered post-development independent review gate to the agent execution contract, from Level 0 self-check through Level 3 full B/V verification.
- Added a public-safe post-development review packet template for reusable review evidence.
- Added the immediate repository improvement plan for independent review routing, LLM Wiki-style sandbox evaluation, and daily/weekly review boundaries.
- Registered `.workflow/post_development_review_gate_v0` as the generic closing workflow for applying the new review gate to bounded development work.
- Added public-safe templates for all declared post-development review gate outputs, including boundary review, judge decision, B/V handoff, and follow-up register packets.
- Allowed `guild_master_cell` to route post-development review requests through the new gate workflow.
- Added `.registry/skills/post_development_review_gate` plus the installed Codex bridge `soulforge-post-development-review-gate` for consistent task-closing invocation.
- Locked the review gate workflow profile policy to conservative `gpt-5.5 / xhigh / auditor` final acceptance review instead of cost optimization.
- Made root UI lint/done-check scripts set the canonical root through a Node wrapper instead of Unix-only environment assignment.
- Updated the UI theme package smoke test and UI workspace wrapper so `npm pack` / UI scripts run through direct `npm.cmd` on Windows and direct `npm` elsewhere, avoiding shell quoting drift.

## 2026-05-14

### Revision `working` - SE foldertree exploratory and operational basic variants added

- Added two dry-runable bundled specs to `se_foldertree_generate`: `탐색개발 / 공통 / 없음` and `운용연구개발 / 공통 / 없음`.
- Updated `generate_tree.py` to bind each supported input combination to an explicit default spec, allow `--spec` omission for supported variants, and validate that a chosen spec matches the requested input combination.
- Added production-bound variant metadata for the new basic variants and tightened `preview_variants.py` so production-enabled variants must declare explicit supported inputs and spec assets.
- Kept the existing `체계개발 / LIG 넥스원 / A` behavior as the current system-development/LIG overlay path without folding its Q-gates into the new common basic variants.

## 2026-05-15

### Revision `working` - Dev worker branch lane added

- Added `guild_hall/dev_worker` as a bounded task-packet-to-branch automation lane for worker PCs.
- Defined the `dev_worker` policy surface, bootstrap prompt, task packet shape, local automation render, preflight, claim helper, and validation test.
- Updated multi-PC and guild_hall docs so worker PCs may push review branches while `main` merge authority remains with the reviewer/supervisor lane.

### Revision `working` - Dev worker preflight doctor scoped

- Scoped the dev-worker preflight default doctor command to `public-only --remote`, leaving `_workmeta` and `private-state` readiness to the lane-specific companion repo sync checks.
- Added `dev_worker_pc` to the local node identity role allow-list and updated the bootstrap prompt so branch-worker setup does not require gateway, mailbox, or town-crier operator env files.

### Revision `working` - Always-on Codex token budget lowered

- Lowered the tracked `Soulforge Night Watch Pipeline` default from `gpt-5.4`/`xhigh` to `gpt-5.2`/`medium` so future local renders do not default to the more expensive frontier model for advisory checks.
- Updated the always-on healer rollout plan to reflect the 4-hour Codex heartbeat cadence and low-reasoning activity sync fallback.
- Kept short-interval mail fetch, mail healthcheck, and town-crier monitoring in deterministic launchd jobs without LLM usage.

### Revision `working` - Simulation source collection profile calibrated

- Calibrated `.workflow/simulation_source_collect_v0/` against a public-safe synthetic mixed model-source fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.3-codex / low / dwarf / auditor` as the primary profile.
- Archived the calibration under `.workflow/simulation_source_collect_v0/calibrations/20260515T000000Z_staged_public_fixture/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, account-bound downloads, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Verification plan from page contracts profile calibrated

- Calibrated `.workflow/verification_plan_from_page_contracts_v0/` against a public-safe synthetic verification-planning fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / human / auditor` as the primary profile.
- Archived the staged calibration under `.workflow/verification_plan_from_page_contracts_v0/calibrations/cal_20260515T121105_public_fixture/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Simulation deck prepare profile calibrated

- Calibrated `.workflow/simulation_deck_prepare_v0/` against a public-safe synthetic LTspice deck-prepare fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4-mini / medium / dwarf / auditor` as the primary profile and `gpt-5.4 / medium / dwarf / auditor` as the quality shadow.
- Archived the staged calibration under `.workflow/simulation_deck_prepare_v0/calibrations/20260515T120213KST/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, model payloads, simulator outputs, and runtime absolute paths out of public workflow canon.

### Revision `working` - Review gate evidence pack profile calibrated

- Calibrated `.workflow/review_gate_evidence_pack_v0/` against a public-safe synthetic TRR-like/PDR-like review fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / medium / darkelf / auditor` as the primary profile and `gpt-5.4 / low / darkelf / auditor` as the smoke shadow.
- Archived the staged calibration under `.workflow/review_gate_evidence_pack_v0/calibrations/cal_20260515_public_synthetic_staged_v0/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Interface control and harness readiness profile calibrated

- Calibrated `.workflow/interface_control_and_harness_readiness_v0/` against a public-safe synthetic interface/harness readiness fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.3-codex-spark / high / dwarf / auditor` as the primary profile and `gpt-5.4 / medium / elf / auditor` as the quality shadow.
- Archived the staged calibration under `.workflow/interface_control_and_harness_readiness_v0/calibrations/cal_20260515_public_synthetic_staged_v0/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, and private payloads out of public workflow canon.

### Revision `working` - Simulation run verify profile calibrated

- Calibrated `.workflow/simulation_run_verify_v0/` against a public-safe synthetic blocked-run and synthetic-stub fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / human / auditor` as the primary profile.
- Archived the calibration under `.workflow/simulation_run_verify_v0/calibrations/cal_20260515_public_synthetic/`, including fixture, quality gate, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, waveforms, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Page quantitative enrichment profile calibrated

- Calibrated `.workflow/page_quantitative_enrichment_v0/` against a public-safe synthetic quantitative-enrichment fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / elf / auditor` as the primary profile and `gpt-5.4 / medium / dwarf / auditor` as the stability shadow.
- Archived the calibration under `.workflow/page_quantitative_enrichment_v0/calibrations/cal_20260515_synth_qe_001/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note for the profile decision while keeping raw project truth, `_workspaces` material, credentials, and private payloads out of public workflow canon.

### Revision `working` - Quality-equivalence follow-up archives integrated

- Added follow-up public-safe `quality_equiv` calibration archives for page quantitative enrichment, interface control, verification planning, review gate, simulation source collection, and simulation run verify where later candidate comparisons were preserved as public-safe synthetic evidence.
- Recalibrated `.workflow/interface_control_and_harness_readiness_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.3-codex-spark / high / dwarf / auditor` to `gpt-5.5 / medium / elf / auditor`, while keeping the previous spark profile as a latency shadow and preserving the local-internal / no-connect / source-supported join ceilings.
- Recalibrated `.workflow/verification_plan_from_page_contracts_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / low / human / auditor` to `gpt-5.5 / medium / human / auditor`, while keeping `gpt-5.5 / xhigh` as the fuller quality shadow and demoting the old low-effort profile to minimum-viable planning output.
- Recalibrated `.workflow/review_gate_evidence_pack_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / medium / darkelf / auditor` to `gpt-5.5 / medium / darkelf / auditor`, while preserving source/checksum propagation, CAN/reset gap handling, blocker/action structure, and owner-decision non-claim boundaries.
- Recalibrated `.workflow/simulation_source_collect_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.3-codex / low / dwarf / auditor` to `gpt-5.5 / medium / dwarf / auditor`, while demoting the old low-cost primary to minimum-viable because it lost model manifest, compatibility, and per-need handoff detail against the `gpt-5.5 / xhigh` anchor.
- Recalibrated `.workflow/simulation_deck_prepare_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4-mini / medium / dwarf / auditor` to the previous shadow `gpt-5.4 / medium / dwarf / auditor`, after required `gpt-5.5` low/medium/xhigh comparison showed all required profiles were quality-equivalent but the previous shadow had the best CLI proxy value.
- Recalibrated `.workflow/simulation_run_verify_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / low / human / auditor` to `gpt-5.5 / low / human / auditor`, while keeping `gpt-5.5 / xhigh` as the evaluator ceiling and preserving the blocked-vs-failed / execution-vs-acceptance boundaries.
- Recalibrated `.workflow/page_quantitative_enrichment_v0/` after tightening the local `workflow-optimizer` skill's quality-equivalence policy: demoted the cheap `gpt-5.4 / low / elf / auditor` recommendation, selected `gpt-5.4 / medium / dwarf / auditor` as the quality-equivalent primary, and kept `gpt-5.5 / low / elf / auditor` as the quality shadow.

### Revision `working` - Additional safe workflow profiles quality-equivalence calibrated

- Integrated only the lane-relevant, integration-complete, public-safe recalibrations from the later `workflow-optimizer` sweep after screening out pending, out-of-lane, or not-yet-safe archive variants.
- Promoted stronger quality-equivalent `gpt-5.5` primaries for `whole_xml_page_split_v0`, `page_xml_normalize_spec_v0`, and `capture_xml_intake_library_v0`.
- Activated or refreshed safe workflow defaults for `official_source_packet_collect_v0`, `asset_patch_attach_mdd_v0`, `simulator_policy_packet_v0`, `simulation_stimulus_measurement_packet_v0`, `xml_harness_composition_v0`, `source_gap_followup_packet_v0`, `review_action_item_closure_loop_v0`, `configuration_baseline_and_change_control_v0`, `project_readiness_digest_v0`, `accepted_verification_result_packet_v0`, and `owner_decision_packet_v0`.
- Archived each adopted recalibration under `calibrations/cal_20260515_quality_equiv_001/` inside the target workflow and labeled these runs as CLI-only fallbacks where isolated subagent/candidate-runner telemetry was unavailable.

### Revision `working` - Review gate evidence pack workflow added

- Added `.workflow/review_gate_evidence_pack_v0/` as a public-safe review-readiness workflow over trace, interface-control, verification-plan, source-gap, harness, configuration, owner-decision, and open-question refs.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the verification planning lane.
- Defined explicit outputs for `review_gate_packet`, `source_index`, `evidence_matrix`, `entrance_criteria_checklist`, `success_criteria_checklist`, `review_blockers`, `action_item_register`, `decision_summary`, `review_gate_provenance`, `readiness_summary`, and `boundary_review_note`.
- Mapped the packet shape lightly to SRR/SFR/PDR/CDR/TRR/FCA/SVR/PCA-style review conversations while keeping review families as local readiness lenses, not heavyweight ceremony or automatic gate closure.
- Required decisions to stay separate from proposed decisions and deferred decisions, with actual decisions needing scoped owner decision evidence.
- Kept the package evidence-packaging-only: it does not approve a review gate, certify verification completion, replace owner judgment, make missing sources true, mutate upstream packets, or make private evidence public-safe.
- Kept source XML, normalized sidecars, upstream packets, verification results, test logs, simulation outputs, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-tailored review-readiness pilot that consumed trace, interface-control, verification-plan, source-gap, and harness packet refs and produced a `ready_with_named_caveats` review packet with explicit blockers, action items, proposed decisions, and carry-forward routes.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Review action item closure loop workflow added

- Added `.workflow/review_action_item_closure_loop_v0/` as a public-safe downstream governance workflow after review packets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `review_gate_evidence_pack_v0`.
- Defined explicit closure-loop outputs for `action_closure_packet`, `action_closure_ledger`, `closure_status_matrix`, `unresolved_action_items`, `closure_ready_reruns`, `closure_blockers`, `carry_forward_register`, `owner_decision_request_queue`, `closure_provenance`, and `boundary_review_note`.
- Kept the first version contract-only: it tracks action status, closure evidence refs, rerun-ready routes, and carry-forward state, but it does not approve decisions, auto-close actions, execute reruns, or mutate upstream packets.
- Executed a first controlled private closure-loop pilot over the representative review gate action register, writing closure rows, unresolved-action tracking, carry-forward routes, owner decision requests, and rerun-ready logic without claiming action closure or owner approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Verification plan from page contracts workflow added

- Added `.workflow/verification_plan_from_page_contracts_v0/` as a public-safe verification planning workflow over trace rows, quantitative gaps, simulation-source readiness, interface-control ceilings, harness blockers, source gaps, configuration refs, and scoped owner decisions.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the source-gap follow-up lane.
- Defined explicit planning outputs for `verification_plan`, `verification_requirements_matrix`, `method_map`, `evidence_need_register`, `verification_gap_register`, `test_or_simulation_readiness`, `owner_followup_needed`, `trr_readiness_handoff`, and `fca_svr_handoff_index`.
- Required inspection, analysis, simulation, test, demonstration, owner-review, and not-ready methods to remain distinct, with missing evidence preserved as blockers or review-needed actions.
- Kept the package planning-only: it does not run tests or simulations, accept verification results, approve TRR, accept FCA/SVR evidence, promote harness connections, or claim pass/fail outcomes.
- Kept source XML, normalized sidecars, upstream packets, model payloads, simulation outputs, test logs, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private representative-item pilot that turned trace/source/quantitative/interface/harness evidence into distinct `inspection`, `analysis`, `simulation`, and `owner_review` planning items with TRR/FCA-SVR handoff seeds.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation source collection workflow added

- Added `.workflow/simulation_source_collect_v0/` as a public-safe pre-deck and pre-run/verify workflow for collecting or indexing official, owner-approved local, and tool-library simulation source assets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after quantitative enrichment and before harness composition.
- Defined explicit outputs for `simulation_source_packet`, `model_inventory`, `model_file_manifest`, `demo_circuit_manifest`, `simulator_compatibility_matrix`, `missing_models`, `access_blockers`, `owner_followup_needed`, and `downstream_handoff`.
- Required PSpice, LTspice, generic SPICE, IBIS, IBIS-AMI, S-parameter, and demo-circuit source families to preserve provenance, dependency, license/terms, and compatibility basis instead of guessing readiness from names or file extensions.
- Made missing models, blocked access, unclear license/tool dependency, unapproved third-party mirrors, and owner follow-up first-class outputs so downstream deck, run, quantitative, and harness workflows can block safely.
- Kept model payloads, raw project data, vendor text, simulator outputs, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed model-source pilot that separated an available official LTspice demo-circuit source, a missing page_02 major-IC model set, and a missing connector-facing SI model need into explicit downstream readiness states.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation deck prepare workflow added

- Added `.workflow/simulation_deck_prepare_v0/` as a public-safe pre-run workflow for staging simulation deck inputs from approved model packets, demo circuits, stimuli, measurements, and simulator policy.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_source_collect_v0`.
- Defined explicit outputs for `simulation_deck_packet`, `deck_input_manifest`, `model_dependency_map`, `unresolved_deck_inputs`, `deck_prepare_blockers`, `owner_followup_needed`, `downstream_handoff`, and `boundary_review_note`.
- Kept the first version conservative: it prepares or blocks deck inputs, but it does not execute simulations, verify results, or invent missing models.
- Executed a first controlled private representative deck-prepare pilot that separated one prepared LTspice demo-circuit input from unresolved policy/measurement prerequisites and missing-model blockers.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation run verify workflow added

- Added `.workflow/simulation_run_verify_v0/` as a public-safe run/verify workflow for executing a bounded simulation or recording why execution is blocked.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_deck_prepare_v0`.
- Defined explicit outputs for `simulation_run_packet`, `run_manifest`, `measurement_results`, `result_verdicts`, `run_blockers`, `owner_followup_needed`, `downstream_handoff`, and `boundary_review_note`.
- Executed a first controlled private blocked-run pilot that wrote run metadata, blocker rows, and a blocked verdict without inventing measurement or waveform results.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Configuration baseline and change control workflow added

- Added `.workflow/configuration_baseline_and_change_control_v0/` as a public-safe governance workflow for inventorying baseline refs, tracking change requests, and routing baseline-affecting reruns or carry-forward actions without approving baselines or mutating upstream artifacts.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `review_action_item_closure_loop_v0`.
- Defined explicit outputs for `configuration_baseline_packet`, `baseline_inventory`, `change_request_register`, `impact_matrix`, `baseline_gap_register`, `rerun_routing`, `owner_followup_needed`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative baseline/change-control pilot that inventoried pre-baseline evidence packets, derived change requests from the review lane, and routed reruns or owner follow-up without claiming baseline approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Test harness asset planning workflow added

- Added `.workflow/test_harness_asset_planning_v0/` as a public-safe planning workflow for the physical, simulation, or software harness assets needed to verify page modules and composed harness candidates.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `functional_configuration_audit_page_library_v0`.
- Defined explicit outputs for `test_harness_manifest`, `test_interface_list`, `simulation_fixture_needs`, `instrumentation_resource_list`, `trr_readiness_checklist`, `planning_blockers`, `owner_followup_needed`, and `boundary_review_note`.
- Executed a first controlled private representative planning pilot that turned verification-plan TRR seeds into test-interface, simulation-fixture, instrumentation-resource, and planning-blocker packets.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Source packet sufficiency review workflow added

- Added `.workflow/source_packet_sufficiency_review_v0/` as a public-safe governance workflow for deciding whether current source/material/layout/simulation packets are sufficient for a bounded claim family.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `test_harness_asset_planning_v0`.
- Defined explicit outputs for `source_sufficiency_packet`, `evidence_coverage_table`, `blocked_fields_register`, `owner_followup_needed`, `allowed_claim_ceiling`, `rerun_routes`, and `boundary_review_note`.
- Executed a first controlled private representative sufficiency-review pilot that classified LT8624S power evidence, EXT_IO boundary evidence, page_02 rail semantics, and page_02 simulation evidence into source-supported, review-required, or blocked claim ceilings.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Owner decision packet workflow added

- Added `.workflow/owner_decision_packet_v0/` as a public-safe workflow for recording scoped owner decisions and their downstream effect.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `accepted_verification_result_packet_v0`.
- Defined explicit outputs for `owner_decision_packet`, `decision_effect_register`, `downstream_effect_map`, and `boundary_review_note`.
- Executed a first controlled private representative pilot that recorded architecture-policy owner decisions for immutable source XML, sidecar-first module contracts, and harness-as-derived-layer boundaries.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Accepted verification result packet workflow added

- Added `.workflow/accepted_verification_result_packet_v0/` as a public-safe workflow for recording accepted verification results, blocked/inconclusive result rows, and acceptance provenance.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` before `owner_decision_packet_v0`.
- Defined explicit outputs for `accepted_verification_result_packet`, `result_summary`, `accepted_result_rows`, `blocked_or_inconclusive_rows`, `acceptance_provenance`, and `boundary_review_note`.
- Executed a first controlled private representative blocked-result pilot using the device-name-fix integrity report as candidate evidence, while keeping `accepted_result_rows` empty pending scoped owner acceptance and tool-flow confirmation.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulator policy packet workflow added

- Added `.workflow/simulator_policy_packet_v0/` as a public-safe workflow for recording trusted local simulator runtime identity or probe evidence, owner execution authorization posture, and runtime blockers.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_run_verify_v0`.
- Defined explicit outputs for `simulator_policy_packet`, `runtime_probe_summary`, `execution_authorization_state`, `runtime_blockers`, and `boundary_review_note`.
- Executed a first controlled private representative blocked-runtime pilot using the local simulation-runtime probe and LT3045 demo candidate context, while keeping execution authorization blocked pending trusted runtime and owner approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.
- Later private runtime-refresh evidence confirmed that local `psp_cmd.exe` is callable, so the main remaining blocker is now scoped execution approval and runnable input completeness rather than total runtime absence.

### Revision `working` - Simulation stimulus measurement packet workflow added

- Added `.workflow/simulation_stimulus_measurement_packet_v0/` as a public-safe workflow for recording bounded stimuli or operating conditions, measurement definitions, execution-scope notes, and missing-input blockers.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulator_policy_packet_v0`.
- Defined explicit outputs for `stimuli_or_operating_conditions_packet`, `measurement_definition_packet`, `execution_scope_note`, `input_packet_blockers`, and `boundary_review_note`.
- Executed a first controlled private representative seed-input pilot using the LT3045 demo template example, while keeping owner approval and execution readiness out of scope.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation run verify positive example added

- Added a second private representative `simulation_run_verify_v0` example using a local vendor `OPA197` PSpice example staged into a bounded run-local workspace.
- Confirmed callable `psp_cmd.exe` execution and captured a positive executed-run packet with observed output data.
- Kept the result verdict `inconclusive` because no approved pass/fail rule was bound, preserving the boundary between execution success and accepted verification.

### Revision `working` - Technical risk open question burndown workflow added

- Added `.workflow/technical_risk_open_question_burndown_v0/` as a public-safe governance workflow for packaging current technical risks and open questions into a bounded burndown register.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `physical_configuration_audit_asset_package_v0`.
- Defined explicit outputs for `technical_risk_register`, `open_question_register`, `burndown_summary`, `closure_criteria_register`, `owner_followup_needed`, `rerun_routes`, and `boundary_review_note`.
- Executed a first controlled private representative risk/open-question pilot that grouped source, interface, quantitative, and simulation uncertainty into one burndown packet with closure criteria and rerun routes.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Functional configuration audit page library workflow added

- Added `.workflow/functional_configuration_audit_page_library_v0/` as a public-safe governance consumer for later FCA/SVR-style functional claim auditing.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `configuration_baseline_and_change_control_v0`.
- Defined explicit outputs for `functional_audit_packet`, `verified_claim_register`, `unverified_claim_register`, `discrepancy_register`, `residual_risk_register`, `audit_readiness`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative audit pilot that packaged unverified, discrepancy, and residual-risk rows without claiming accepted verification evidence or owner acceptance.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Physical configuration audit asset package workflow added

- Added `.workflow/physical_configuration_audit_asset_package_v0/` as a public-safe governance consumer for later PCA-style package alignment auditing.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `source_packet_sufficiency_review_v0`.
- Defined explicit outputs for `physical_audit_packet`, `artifact_inventory_report`, `checksum_report`, `missing_or_mismatched_artifacts`, `release_blocking_discrepancies`, `owner_followup_needed`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative physical audit pilot that verified LT8624S package artifacts and checksum rows while keeping missing formal baseline approval as a release-blocking discrepancy.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Interface control and harness readiness workflow added

- Added `.workflow/interface_control_and_harness_readiness_v0/` as a public-safe governance bridge before or alongside harness composition.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `page_module_trace_matrix_v0` and before source-gap follow-up aggregation.
- Defined explicit outputs for `interface_control_ledger`, `harness_readiness_matrix`, `blocked_interface_items`, `review_required_interface_items`, `candidate_safe_possible_items`, `source_supported_possible_items`, `owner_followup_needed`, and `interface_open_questions`.
- Required `local_internal_candidates` to remain non-external by default and to block harness endpoint use unless scoped reclassification evidence exists.
- Kept readiness statuses as ceilings for downstream `xml_harness_composition_v0`; the package does not mutate upstream packets, replace harness composition, or overclaim source support.
- Kept source XML, normalized sidecars, intake packets, source packets, materials outputs, layout guides, quantitative overlays, trace matrices, harness packets, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private pilot over the representative power/interface/ambiguous page trio plus an existing blocked/review-required harness packet, writing full readiness-ceiling, blocker, follow-up, and harness-input-delta outputs.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page module trace matrix workflow added

- Added `.workflow/page_module_trace_matrix_v0/` as a public-safe governance workflow for row-level traceability across page, source, materials, layout, quantitative, and harness packets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `xml_harness_composition_v0` and before source-gap follow-up aggregation.
- Defined explicit outputs for `trace_matrix`, `evidence_authority_map`, `trace_gap_register`, `harness_trace_delta`, `verification_seed_matrix`, `review_gate_evidence_index`, `trace_provenance`, and `boundary_review_note`.
- Required row-level `source_confirmed`, `derived`, `review_required`, and `missing` evidence states to remain distinct from harness claim status and review decisions.
- Kept source XML, normalized sidecars, intake packets, source packets, materials outputs, layout guides, quantitative overlays, harness contracts, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Extended the contract so trace runs may also consume `interface_control_and_harness_readiness_v0` packet refs and write `interface_readiness_ceiling` rows.
- Executed a first controlled private representative-row pilot that linked page identity, source coverage, quantitative fills/gaps, interface readiness ceilings, blocked/review-required harness claims, open questions, and verification seeds into one trace spine.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Source gap follow-up packet workflow added

- Added `.workflow/source_gap_followup_packet_v0/` as a public-safe follow-up workflow for aggregating source/evidence gaps from source, materials, layout, quantitative, and harness lanes.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `xml_harness_composition_v0`.
- Defined explicit outputs for `source_gap_followup_packet`, `gap_dedup_index`, `owner_action_queue`, `owner_source_batch_manifest.template`, `download_or_reuse_batch_manifest`, `retry_trigger_register`, and `downstream_unblock_map`.
- Required owner-provided files and manual downloads to be re-indexed by the narrowest owning source/evidence workflow before any source-supported, quantitative, layout, material, or harness claim can change.
- Kept raw project payloads, source files, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-gap pilot that aggregated 19 upstream gap refs into 14 stable aggregate gaps, deduplicated repeated Analog public-source failures, wrote concrete owner-action batches, and produced narrow retry triggers without changing source authority.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Official source packet collection workflow added

- Added `.workflow/official_source_packet_collect_v0/` as a public-safe source-bootstrap workflow for official, owner-approved local, missing, blocked, and not-applicable source states.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` as an upstream/sidecar source packet lane for materials, layout, simulation, ECAD, and harness workflows.
- Defined provenance-first outputs for `source_packet_manifest`, `source_inventory`, `source_gap_report`, `owner_followup_needed`, `download_or_reuse_manifest`, and `downstream_ready_refs`.
- Kept raw project payloads, vendor document text, downloaded binaries, model payloads, runtime absolute paths, credentials, cookies, sessions, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-state pilot that combined owner-approved local official LT8624S collateral, reachable official public URLs for AD8338/AD7380-4/ADG1634 source families, rejected third-party Mouser mirrors, and missing simulation/ECAD source kinds into one downstream-ready packet.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page quantitative enrichment workflow added

- Added `.workflow/page_quantitative_enrichment_v0/` as a public-safe overlay workflow for source-backed quantitative enrichment of `page_module_spec_v0` sidecars.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after optional source/material/layout evidence workflows and before harness composition.
- Defined explicit outputs for `quantitative_claims`, `enriched_sidecar_overlay`, `source_gap_report`, `owner_followup_needed`, `harness_readiness_delta`, and enrichment provenance.
- Required every quantitative value to be `source_confirmed`, transparently `derived`, `review_required`, or `missing`; forbidden label/default/memory/harness-pressure guessing.
- Kept the original sidecar, source XML, intake packets, source packets, materials packets, layout guides, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, and private run truth out of public workflow canon.
- Completed controlled private helper-card pilots across power (`lt8624s`), interface (`ext_io_conn`), and ambiguous/channelized (`02_4ch_vga_ch5_8`) pages, including an ambiguous-page run that consumed an upstream official-source packet and wrote device-scope fills plus page-scope gaps.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - SE foldertree pre-study basic variant added

- Added a dry-runable `선행연구 / 공통 / 없음` bundled basic spec to `se_foldertree_generate`.
- Updated the supported input matrix and references so pre-study can be selected as its own explicit variant instead of overloading `탐색개발`.
- Kept the new pre-study spec contractor-neutral and public-safe, with task surfaces focused on background definition, prior-art review, concept options, transition judgment, and next-stage recommendation.

### Revision `working` - SE foldertree draft variant preview lane added

- Added a non-materializing draft variant preview lane to `se_foldertree_generate`, separating `common_se_base_v0`, `lig_grade_a_overlay_v0`, and `operational_rd_no_grade_candidate_v0`.
- Added `preview_variants.py` so draft variant metadata can be checked without changing the production `generate_tree.py` path or creating project folders.
- Documented that current production support remains `체계개발 / LIG 넥스원 / A` and that operational-R&D/no-quality-grade remains blocked until source or owner policy evidence exists.

### Revision `working` - workmeta always-on merge guard clarified

- Clarified that the 24-hour PC only auto-syncs `_workmeta/main` by fast-forward and must not auto-merge stale work branches or PC-specific branches into `main`.
- Documented that bounded metadata from another PC should be promoted by cherry-pick, rebase, or manual port after `main` is current.
- Added conflict handling guidance for shared `_workmeta` policy/log surfaces so `README.md`, `CHANGELOG.md`, worklogs, and promotion registers preserve latest `main` policy and append new records.
## 2026-05-15

### Revision `working` - Page XML normalization profile refreshed

- Re-ran `.workflow/page_xml_normalize_spec_v0/` profile calibration after the workflow contract added stronger `system_contract`, interface-group, annotation-variant, and harness-readiness expectations.
- Kept the primary profile as `gpt-5.4` `medium` with `elf` + `auditor` after repeat Top-K subagent quality runs and CLI proxy telemetry for pass candidates.
- Archived the public-safe repeat calibration under `.workflow/page_xml_normalize_spec_v0/calibrations/20260515-021140_repeat_topk_contract_refresh/`.
- Rejected `gpt-5.4-mini` shadows under the refreshed gate because they altered source identity, left `system_contract` too empty, or collapsed required per-page sidecar blocks.
- Kept raw XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - XML harness composition workflow added

- Added `.workflow/xml_harness_composition_v0/` as a public-safe derived harness-layer workflow for composing prepared page-level XML assets into a project-local harness packet.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the page split, normalize, intake, materials, and layout-guide preparation chain.
- Defined explicit `blocked`, `review_required`, `candidate_safe`, and `source_supported` lanes, including missing-source, source-gap, missing-quantitative, local/internal misuse, no-connect, and ambiguity handling.
- Kept source XML, normalized sidecars, intake packets, materials packets, layout guides, raw project payloads, vendor text, runtime paths, credentials, cookies, `_workspaces`, and private run truth out of public workflow canon.
- Marked the package `pilot_ready_contract_only`; a controlled project-local harness pilot and independent review are still required before claiming pilot-executed or usable behavior.
- After the private harness pilot landed, updated the profile-policy gate from `pending_pilot_and_calibration` to `pending_profile_calibration` so the public execution-profile note matches the actual pilot state.

## 2026-05-14

### Revision `working` - EXP XML materials quality profile promoted

- Promoted `.workflow/exp_xml_component_materials/profile_policy.yaml` from `gpt-5.4-mini` `medium` to `gpt-5.5` `medium` with `orc` + `archivist` after a quality-first scoped contract probe.
- Archived the public-safe page-fragment/local-reuse probe under `.workflow/exp_xml_component_materials/calibrations/20260514-2155_quality_priority_contract_probe/`.
- Selected the cleaner `gpt-5.5` profile because it preserved page-level scope, context-only handoff boundaries, owner-approved local official collateral evidence, and explicit `DATA Sheet`/`EVAL` destination placement.
- Kept real EXP.xml bodies, downloaded vendor binaries, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public archive.

### Revision `working` - Page XML normalization profile calibrated

- Calibrated `.workflow/page_xml_normalize_spec_v0/` with public-safe structural metadata derived from the already public-safe `whole_xml_page_split_v0` calibration archive, covering 11 ordered page sidecars, source checksums, immutable source XML policy, blank normalized refs, review-required semantics, local/internal candidate separation, and downstream `capture_xml_intake_library_v0` handoff.
- Set the workflow primary profile to `gpt-5.4` `medium` with `elf` + `auditor`, retaining faster `gpt-5.4-mini` shadows after their Stage C reruns stayed `pass_with_gaps` or failed coverage.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, manual gate review, final ranking, and recommendation under `.workflow/page_xml_normalize_spec_v0/calibrations/20260514-205331_staged_cli_public_structural/`.
- Kept raw XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - Capture/materials page-fragment contracts clarified

- Clarified `.workflow/capture_xml_intake_library_v0/` so whole-export inputs and page-fragment XML inputs have distinct expectations: page fragments produce page-level intake only, with normalize sidecars/handoffs accepted only as non-authoritative review context.
- Clarified `.workflow/exp_xml_component_materials/` so page-fragment `exp_xml_source` inputs can produce bounded page-level source packets without implying full-design material coverage.
- Allowed owner-approved local official collateral reuse in `exp_xml_component_materials` when provenance and checksum/file evidence are preserved, while keeping `exp_xml_source` authoritative and downstream handoff context-only.

### Revision `working` - Layout guide source-gap fallback clarified

- Clarified `.workflow/component_pcb_layout_guide_extraction/` so missing official layout guidance no longer means the workflow must silently stall or fabricate guidance.
- Added a bounded degraded path where the workflow writes a `Layout Guide/` source-gap packet that records attempted sources, blocker reasons, unresolved gaps, and owner follow-up needs when official layout guidance cannot be acquired.
- Kept source-bound output requirements intact: no unsupported layout claims, no public-canon vendor text, and no runtime project payload leakage.

### Revision `working` - Page normalize system-contract slots expanded

- Expanded `.workflow/page_xml_normalize_spec_v0/` so `page_module_spec_v0` now includes a required `system_contract` block for harness-facing electrical, signal, quantitative, and readiness/source-gap slots.
- Added support for interface groups, electrical domains, signal families, quantitative placeholder slots, and explicit `harness_ready` / `source_gap` / `owner_followup` contract fields while keeping all of them conservative and review-oriented.
- Kept normalization source-safe: the workflow still does not infer confirmed topology, perform harness composition, or promote unsupported quantitative values to truth.

### Revision `working` - Harness composition first private pilot executed

- Executed the first private pilot of `.workflow/xml_harness_composition_v0/` against representative power, interface, and ambiguous/channelized prepared page assets.
- The resulting derived harness packet produced explicit `blocked` and `review_required` joins, with no `candidate_safe` or `source_supported` promotions, confirming the intended conservative behavior.
- Updated the workflow package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page module sidecar refinement hints

- Refined `.workflow/page_xml_normalize_spec_v0/` with optional `module_scope`, `channelization`, `classification_basis`, and `interfaces.local_internal_candidates` fields for conservative page-module sidecars.
- Kept required external interface containers unchanged and preserved the sidecar-first, immutable-source-page contract.
- Aligned the private `page_module_spec_v0` first-draft note and example YAML with the new review-hint fields.

### Revision `working` - Page XML normalization sidecar alignment

- Realigned `.workflow/page_xml_normalize_spec_v0/` with the fixed `page_module_spec_v0` first draft so per-page `page_module_spec_v0.yaml` sidecars and manifests are the primary outputs.
- Recentered the workflow on immutable source page XML, metadata-first identity/provenance/interface/review fields, and optional derived annotated XML variants that remain review-only.
- Kept the existing `.workflow/index.yaml` registration in place and updated the workflow catalog wording to describe the sidecar-first package.
- Followed the alignment with a private 11-page split-fixture pilot matrix, lifting the workflow package from `pilot_ready_contract_only` to `pilot_executed_private_fixture` while keeping ambiguous semantics as review-required.

### Revision `working` - Page XML normalization workflow added

- Added `.workflow/page_xml_normalize_spec_v0/` as a public-safe bridge workflow for turning page XML assets from `whole_xml_page_split_v0` into project-local normalized page assets, registration-prep units, manifests, provenance updates, warnings, and downstream handoff packets.
- Registered the workflow in `.workflow/index.yaml` between `whole_xml_page_split_v0` and XML-first asset registration, and listed it in `.workflow/README.md`.
- Kept raw page XML bodies, generated normalized page payloads, runtime absolute paths, `_workspaces` output data, `_workmeta` raw truth, credentials, cookies, secret material, material collection, MDD attachment, and harness composition out of the public workflow package.
- Marked the workflow as `pilot_ready_contract_only`; a controlled normalization pilot is still required before claiming pilot-executed behavior.

### Revision `working` - Whole XML page split workflow added

- Added `.workflow/whole_xml_page_split_v0/` as a public-safe first-step workflow for splitting one project-bound large multi-page XML source into project-local page XML assets, manifest, index, provenance, and readiness notes.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` as upstream of planned `page_xml_normalize_spec_v0`.
- Kept source XML read-only and kept normalization, XML-first asset registration, material collection, MDD attachment, raw XML bodies, runtime paths, project-local output payloads, credentials, cookies, and private run truth out of the public workflow package.
- Completed a controlled private real-sample pilot that split one large multi-page XML source into 11 page XML assets and downstream manifest/index/provenance/readiness outputs consumed by the page-normalization lane.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Whole XML page split profile calibrated

- Calibrated `.workflow/whole_xml_page_split_v0/` with public-safe structural metadata derived from the supplied real sample XML, covering 11 `Page` boundaries, titleblock `Page Count = 8` conflict handling, missing/non-contiguous page-number signals, source-order page ids, manifest/index/provenance shape, and downstream `page_xml_normalize_spec_v0` handoff.
- Set the workflow primary profile to `gpt-5.4` `high` with `dwarf` + `archivist`, retaining `gpt-5.5` shadows and a downgraded `gpt-5.4-mini` fallback note after Stage C instability.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, shortlist review, final ranking, and recommendation under `.workflow/whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/`.
- Kept real XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - XML-first asset registration and later MDD patch workflows

- Extended `.workflow/capture_xml_intake_library_v0/` so XML-first intake now creates `asset_identity` and `pcb_pairing_placeholder` metadata, and can record an optional owner-supplied initial MDD attachment without overclaiming XML↔MDD pairing proof.
- Added `.workflow/asset_patch_attach_mdd_v0/` as a follow-on workflow for later owner-supplied MDD attachment and asset-version bump after the initial XML-first registration already exists.
- Kept raw XML, raw MDD payloads, runtime absolute paths, `_workspaces` output data, credentials, cookies, and private run truth out of public workflow canon.
- Executed a first controlled private LT8624S attachment pilot using a real owner-supplied `.mdd` file and updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Capture XML intake profile calibrated

- Calibrated `.workflow/capture_xml_intake_library_v0/` with a public-safe synthetic Capture XML fixture covering PartInst-vs-Package separation, explicit net extraction, connector confidence, power/no-connect review, provenance, and downstream handoff.
- Set the workflow primary profile to `gpt-5.4` `medium` with `elf` + `administrator`, retaining `gpt-5.5` shadows and lower-cost fallback notes.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, finalist review, final ranking, and recommendation under `.workflow/capture_xml_intake_library_v0/calibrations/20260514-135122_staged_cli_matrix/`.
- Kept real EXP.xml bodies, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - EXP XML materials handoff profile recalibrated

- Re-ran `.workflow/exp_xml_component_materials/` profile optimization against a public-safe synthetic fixture that includes optional `capture_xml_intake_library_v0` `downstream_handoff` context.
- Archived the repeat Top-K calibration under `.workflow/exp_xml_component_materials/calibrations/20260514-1401_repeat_intake_handoff_topk/`.
- Updated `.workflow/exp_xml_component_materials/profile_policy.yaml` from `gpt-5.4-mini` `low` to `gpt-5.4-mini` `medium` while keeping `orc` + `archivist`, because the previous low-effort primary did not pass the richer handoff-context quality gate.

### Revision `working` - Capture XML intake library workflow added

- Added `.workflow/capture_xml_intake_library_v0/` as an upstream read-only intake workflow for turning a project-bound Capture `EXP.xml` into block, net, connector, power, open-question, provenance, and downstream handoff artifacts.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` before `exp_xml_component_materials`.
- Recorded the first package as pilot-executed from a bounded private system-lab fixture while keeping raw XML, fixture values, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, and cookies out of public canon.

### Revision `working` - EXP XML materials intake handoff context linked

- Updated `.workflow/exp_xml_component_materials/` so it can optionally read `capture_xml_intake_library_v0` `downstream_handoff` context without making the handoff mandatory.
- Kept `exp_xml_source` authoritative for component identity, placed inventory, manufacturer part number, and connectivity while allowing intake context to prioritize connector/interface refs, power-sensitive refs, and open topology review items.
- Documented candidate-only intake observations as review context, not confirmed material-collection truth.

## 2026-05-13

### Revision `working` - workmeta shared metadata plane clarified

- Clarified current-default `_workmeta` policy as the owner-only shared metadata plane across PCs, including project metadata, run truth, logs, analytics, and artifact metadata when they are part of cross-PC handoff.
- Clarified that non-metadata state such as actual `_workspaces` files, machine-local temp/cache, secrets, raw mail bodies, and attachment binaries stay outside `_workmeta` shared history.
- Added a deterministic `guild-hall:workmeta:sync` command and updated always-on/update/handoff docs so a 24-hour PC can periodically pull/push `_workmeta` metadata alongside activity continuity handling.

### Revision `working` - always-on short fixes added

- Removed tracked Python bytecode artifacts from gateway mail-fetch and town-crier so runtime commands stop dirtying the public worktree.
- Added healer failure queueing via `--notify-on-failure`, keeping the Telegram brief body-safe with only failed check ids, summary, and report ref.
- Added a public-safe launchd deployment surface with render/install/verify helpers for mail-fetch, healthcheck, town-crier, and healer light/full jobs.

### Revision `working` - always-on sync retry policy clarified

- Added a bounded retry policy for always-on public pull and activity sync failures that look like transient GitHub, DNS, or network issues.
- Limited retries to three total attempts with 60-second and 180-second waits, while keeping dirty worktree, non-main branch, and merge-required states as immediate blockers.
- Kept raw mail, attachment, mailbox payload, `_workmeta`, `_workspaces`, and secret reads out of retry handling.

### Revision `working` - always-on heartbeat pull preflight clarified

- Clarified that the hourly Codex `Soulforge 운영 감시` heartbeat should fast-forward pull clean public `main` before health checks and activity sync.
- Kept the 09:00/18:00 `always-on activity sync` automation as a dedicated fallback path for activity mirror sync.
- Documented that GitHub/DNS/network failures should be reported as stale/blocker conditions without reading raw mail, attachments, mailbox payloads, or secrets.

### Revision `working` - workflow_optimizer default execution gate clarified

- Clarified that a full `workflow_optimizer` run request covers the skill's default isolated quality matrix and CLI telemetry probes without requiring separate user wording for subagents or CLI.
- Preserved the guard that CLI-only full-matrix calibration is an explicit fallback and must not be mislabeled as `subagent_quality_first`.
- Kept the default candidate set excluding the `gpt-5.3-*` family unless the user explicitly asks for 5.3 comparison.

### Revision `working` - workflow lab owner and maturity ladder clarified

- Clarified `_workmeta/system/` as the reserved private reusable-workflow lab owner for project-agnostic run evidence and procedure-capture notes.
- Clarified reserved `_workspaces/system/` usage for local-only workflow pilot outputs and fixture materialization that are not owned by a delivery project.
- Added a human-facing workflow maturity ladder of `draft -> pilot -> usable -> canon` and documented that canon registration in `.workflow/index.yaml` is separate from runtime validation/readiness notes.
- Corrected the project map so the top-level root list no longer advertises a `scripts/` directory that is not part of the current repo tree.

### Revision `working` - component PCB layout guide profile calibration

- Calibrated `.workflow/component_pcb_layout_guide_extraction/` with a public-safe synthetic component-material fixture covering source-bound layout spans, supplemental source handling, cited-page figures, table promotion/rejection, and unresolved component review.
- Set the workflow primary profile to `gpt-5.4-mini | medium | elf | archivist`, with `gpt-5.4 | low | elf | archivist` and `gpt-5.4 | medium | elf | archivist` retained as quality-passing shadows.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, semantic shortlist evaluation, final ranking, and recommendation under `.workflow/component_pcb_layout_guide_extraction/calibrations/20260513-204517_staged_cli_matrix/`.
- Kept real PDFs, copied vendor text, runtime Layout Guide outputs, project-local paths, credentials, cookies, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - device system diagram profile calibration

- Calibrated `.workflow/device_system_diagram_generation/` with a public-safe synthetic wearable gateway fixture.
- Set the workflow primary profile to `gpt-5.4-mini | low | human | administrator`, with `gpt-5.4 | low | human | administrator` retained as the quality-upgrade shadow.
- Archived staged CLI candidate outputs, telemetry, quality-gate criteria, finalist ranking, and recommendation under `.workflow/device_system_diagram_generation/calibrations/20260513-202816_staged_cli_matrix/`.
- Kept project raw input, REF packets, accepted outputs, verifier reports, credentials, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - exp XML materials profile calibration

- Calibrated `.workflow/exp_xml_component_materials/` with a public-safe synthetic EXP.xml fixture and mocked official-source/download evidence.
- Set the workflow primary profile to `gpt-5.4-mini | low | orc | archivist`, with `gpt-5.5` and `gpt-5.4-mini|medium` profiles preserved as shadows.
- Archived CLI JSONL telemetry, candidate outputs, quality-gate criteria, final ranking, and recommendation under `.workflow/exp_xml_component_materials/calibrations/20260513-183307_staged_matrix/`.
- Kept real EXP.xml contents, downloaded vendor binaries, credentials, cookies, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - workflow_optimizer Codex bridge refactor

- Refactored `.registry/skills/workflow_optimizer/codex/SKILL.md` into a lean operating router and moved detailed run flow, candidate matrix, telemetry/evaluation, and archive/policy contracts into `codex/references/`.
- Clarified that isolated subagent matrix execution requires available tools plus user/developer policy authorization, and that CLI-only calibration must be explicit rather than silent fallback.
- Tightened workflow policy write boundaries so public `.workflow/**` updates happen only when the user requested or confirmed calibration archive/profile policy writes.

### Revision `working` - sample workflow canon cleanup

- Removed the old `frontline_assault` and `build_lineage_map` sample workflows from active workflow canon to avoid presenting test scaffolds as current operating workflows.
- Removed the matching `vanguard_strike` and `lineage_strike` sample party templates and retired their demo unit surfaces from `.unit/`.
- Updated species recommendation biases and UI fixtures to use the current guild-master authoring lane instead of the retired sample workflow/party.
- Fixed guild-master party slot references to the actual `guild_master` unit id.
- Fixed Windows validation execution for the UI done-check and theme package smoke paths.

### Revision `working` - PCB layout guide extraction workflow added

- Added `.workflow/component_pcb_layout_guide_extraction/` as a follow-on workflow for turning per-component `DATA Sheet` and `EVAL` materials into project-local `Layout Guide` Markdown, source maps, extraction manifests, and checksum-keyed caches.
- Registered the workflow in `.workflow/index.yaml` while keeping runtime part folders, extracted vendor text, figures, tables, and supplemental downloads outside public canon.
- Added token-control gates so PDF files are indexed and filtered into layout candidate spans before AI synthesis reads them.
- Added official supplemental-source download gates for missing layout guidance, with PDF/ZIP magic validation, source URL, byte size, and SHA256 requirements.
- Evolved the figure/table stage to use separate extraction tools by signal type: PyMuPDF for layout-candidate page/context PNG renders, Camelot strict quality-filtered Markdown tables, and pdfplumber only as a raw fallback candidate extractor.
- Clarified figure/table source-map and manifest records, including strict-vs-raw table counts, tool versions, output checksums, extraction warnings, and separate raw candidate folders.
- Added a layout-only promotion stage so PCB-layout-relevant visuals and tables are copied into dedicated `layout_only/` folders while software/setup/noisy candidates remain as context evidence with rejection reasons.
- Reworked figure capture policy so layout-only images must come from `layout_guide.md` cited evidence rather than earlier keyword-only candidate pages.
- Updated cited figure capture so `layout_only/` stores one full-page PNG per unique `layout_guide.md` cited source page, with repeated citations deduplicated and older cited-region crops retained only as runtime context evidence.
- Corrected cited figure output placement so current full-page PNGs live directly under `Layout Guide/figures/`; `figures/layout_only/` is no longer the figure output folder.
- Registered `component_pcb_layout_guide_extraction` as an owner-accepted usable workflow canon entry, with runtime vendor content and generated figures remaining project-local.

### Revision `working` - EXP XML component materials workflow added

- Added `.workflow/exp_xml_component_materials/` as a pilot-ready workflow for parsing a project-provided `EXP.xml` and collecting official datasheets plus EVAL/reference-design files into per-component `DATA Sheet` and `EVAL` folders.
- Registered the workflow in `.workflow/index.yaml` while keeping real EXP.xml contents, downloaded PDFs, PCB archives, credentials, and project-local run truth outside public canon.
- Added a project binding template for output folder shape, official-source download policy, checksum/source manifests, and review queues for ambiguous part identities or gated vendor material.
- Piloted the workflow against a concrete Cadence Capture EXP.xml, confirmed `PartInst` as the placed-component extraction node, and saved official Analog Devices PDF/ZIP materials into the project-local material tree.
- Tightened the workflow completion gate so source links and `.url` shortcuts are not accepted as downloads; actual files with byte size, content type or magic check, and SHA256 are required.
- Evolved the workflow with a larger Cadence Capture fixture, adding DOM-failure parser fallback, Package/SymbolUserProp identity recovery for placeholder part values, generic-passive review queue handling, and strict PDF/ZIP payload validation.

## 2026-05-11

### Revision `working` - device system diagram workflow canon entry added

- Added `.workflow/device_system_diagram_generation/` as an owner-accepted usable workflow for generating editable draw.io device system diagrams from one Markdown input and deriving SVG, PPTX, and PNG outputs.
- Registered the workflow in `.workflow/index.yaml` while keeping project-local paths, REF packets, raw candidates, and run evidence outside the public workflow canon.
- Marked the workflow as usable for project execution and timing checks, not strict REF canon-ready; future REF matching requires a non-oracle schema/source packet or owner-approved acceptance contract update.

Soulforge public repo 의 구조/기능/운영 문서 변경을 버전 대신 revision 단위로 기록한다.
Git log 는 원문 이력을 남기고, 이 문서는 사람이 읽는 patch note 와 운영 영향만 요약한다.

## 기록 원칙

- public repo changelog 는 기능 코드, 구조 문서, bootstrap/doctor/update/handoff 규칙 변경을 기록한다.
- 보호 대상 업무 데이터와 continuity record 는 여기 적지 않고 nested `private-state/CHANGELOG.md` 에 적는다.
- secret 값, credential, token, password 는 절대 기록하지 않는다.

## 2026-05-09

### Revision `working` - workflow_generator portable path policy

- `workflow_generator` Codex bridge now requires reusable workflow/canon outputs to use Soulforge-root-relative POSIX paths instead of host-specific absolute paths.
- Runtime-only absolute paths are explicitly limited to local/private run evidence or subagent prompts with `*_runtime_path` fields paired to portable `*_repo_path` identities.
- Updated workflow generator manifest and evaluation templates to prevent installed skill paths, drive-letter paths, and local run paths from being promoted into `.workflow/**` packages.

### Revision `working` - workflow_generator Codex bridge refactor

- Refactored `.registry/skills/workflow_generator/codex/SKILL.md` into a lean operating router and moved detailed goal/run-state/reporting governance into `codex/references/run-governance.md`.
- Added table-of-contents navigation to long workflow generator references so Codex can load specific details progressively.
- Updated the installed skill UI display name to a human-facing title while preserving the `soulforge-workflow-generator` skill id.

### Revision `working` - mail candidate activity projection 추가

- `guild-hall:activity:project-mail-candidates` 를 추가해 local-only `mail_candidate` queue 의 body-safe 후보 요약을 activity event 로 투영할 수 있게 했다.
- `guild-hall:activity:sync` 가 기본적으로 pending mail candidate 를 `mail_candidate_summary` event 로 투영한 뒤 private-state activity mirror 를 병합/commit/push 하도록 연결했다.
- private-state 로 넘어가는 것은 candidate id, subject, sender, attachment count, received_at, local ref 수준의 summary 이며 raw mail body/html/attachment filename/URL/local path/provider payload/secret 값은 제외한다고 문서화했다.

### Revision `working` - workflow_generator 누적 artifact chain 규칙 보강

- `workflow_generator` Codex bridge가 warm artifact transformation 라운드에서 B1 이후 `EXPn-1 -> EXPn` 누적 후보 체인을 필수로 쓰도록 보강했다.
- fresh subagent와 fresh artifact를 분리해, S는 현재 후보를 검증하고 직전 후보는 delta/regression 기준으로만 사용하며 V는 현재 후보만 REF와 비교하도록 명시했다.
- chain을 사용할 수 없는 warm transformation run은 `blocked_invalid_artifact_chain_policy`로 중단하고, baseline 재시작은 baseline-fixed 평가와 cold/final replay에만 남겼다.

### Revision `working` - always-on healer rollout 기준 추가

- 24시간 PC 감시를 Codex heartbeat 중심이 아니라 launchd + deterministic healer/doctor script 중심으로 늘리는 rollout plan 을 추가했다.
- MacBook Air 는 repo 코드/문서/test/commit/push 를 맡고, 실제 LaunchAgent 설치와 secret/env 연결은 24시간 PC 에서 수행하는 역할 분리를 문서화했다.
- mail fetch, mail healthcheck, town_crier 는 LLM 을 쓰지 않고, LLM 은 morning report 또는 장애 triage 같은 낮은 빈도 advisory 계층에 둔다는 운영 기준을 명시했다.

### Revision `working` - workflow optimizer skill package 등록

- local Codex `workflow-optimizer` 를 `.registry/skills/workflow_optimizer/` canon package 로 등록해 public Git sync 후 다른 PC 에서 `npm run skills:sync -- workflow_optimizer` 또는 `--all` 로 설치할 수 있게 했다.
- tracked Codex bridge 는 현재 workflow profile calibration 규칙을 포함하며, 기본 후보에서 `gpt-5.3-*` 계열을 제외하고 최초 full quality matrix 는 subagent, 품질 통과 후보 telemetry 는 CLI 로 분리한다.

### Revision `working` - author_skill_package profile calibration

- `author_skill_package` workflow 의 public-safe staged subagent calibration archive 를 추가하고, `profile_policy.yaml` 의 active primary profile 을 `gpt-5.4-mini|low|darkelf|archivist` 로 설정했다.
- calibration 은 synthetic `api_contract_drift_check` skill authoring fixture 를 사용했으며, 실제 API spec, customer endpoint, production log, credential, `_workspaces`, `_workmeta`, `private-state` material 은 archive 에 포함하지 않았다.
- Spark 후보는 quality-pass 및 speed shadow 로 보존하되, 공식 Codex rate card 에서 research preview 로 표시되어 primary cost recommendation 에서는 제외했다.
- 후속 분석에서 `gpt-5.3-*` 계열은 active/default 후보에서 제외했다.

### Revision `working` - workflow calibration archive 경계 추가

- `.workflow/<workflow_id>/profile_policy.yaml` 과 `.workflow/<workflow_id>/calibrations/<calibration_id>/` 를 workflow-level profile optimizer 결과의 public-safe 저장 위치로 명시했다.
- 300개 후보 같은 전체 calibration archive 는 public-safe synthetic/redacted artifact 일 때만 workflow 아래에 둘 수 있고, 실제 프로젝트 원문, private transcript, secret, project-local raw run truth 는 계속 제외하도록 owner 경계를 좁혔다.
- profile optimizer 는 추천만 보고하는 것이 아니라 workflow profile policy 와 shadow Top-K 운영 기준을 업데이트하는 흐름으로 정렬했다.
- workflow authoring template 에 `profile_policy.yaml` 과 `calibrations/` scaffold 를 추가해, workflow creator 가 만든 canon entry 를 profile optimizer 가 바로 갱신할 수 있게 했다.
- 실제 앱 운영 품질과 맞추기 위해 기본 calibration mode 를 subagent quality full matrix 로 두고, 비용/토큰 telemetry 는 품질 통과 후보만 CLI proxy 로 측정하도록 profile policy template 을 보강했다.
- `meeting_followup` workflow canon 을 추가하고, 기존 public-safe CLI 300개 후보 matrix 를 workflow-local calibration archive 로 이관할 수 있게 했다.

### Revision `working` - activity sync 명령 추가

- `guild-hall:activity:sync` 를 추가해 24시간 PC 가 local activity event ledger 와 `private-state` activity mirror 를 `entry_id` 기준으로 병합하고 양쪽 `latest_context.json` 을 재생성할 수 있게 했다.
- sync 는 nested `private-state` 의 `main` branch 만 대상으로 fast-forward pull 한 뒤 변경이 있으면 activity surface 만 commit/push 하며, `_workspaces`, `_workmeta`, mailbox raw, attachment payload, secret file 은 읽지 않도록 경계를 고정했다.
- sync 는 allowlist 된 activity event field 만 mirror 하고, malformed JSONL row 는 원본에 보존하되 다른 surface 로 복제하지 않는다. `log/**` markdown/report file 은 별도 sanitizer 가 생길 때까지 mirror 하지 않는다.
- `--json` 결과에서 private git command 의 stdout/stderr 원문을 숨겨 remote URL/credential 이 터미널 출력에 섞이지 않게 했다.
- 복사/붙여넣기가 어려운 24시간 PC 용 `ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md` 를 추가했다.

### Revision `working` - always-on harness 설치 prompt 추가

- 복사/붙여넣기가 어려운 24시간 PC 에서 파일명 한 줄로 workflow evolution harness dependency 설치 확인을 실행할 수 있도록 always-on 전용 prompt source 를 추가했다.
- prompt 는 Codex `/goal`, promptfoo, OpenAI SDK, DSPy 설치 확인까지만 수행하고 gateway/healer/night_watch 설정과 workflow evolution 실험 실행은 건드리지 않도록 경계를 명시했다.
### Revision `working` - workflow_generator skill package added

- Added `.registry/skills/workflow_generator/` as the tracked canon and Codex bridge package for the source-bound workflow generation skill.
- The package materializes to the installed `soulforge-workflow-generator` skill through `npm run skills:sync -- workflow_generator`.
- Kept runtime run evidence, local artifact paths, candidates, and verifier outputs outside the tracked skill package.

### Revision `working` - Windows doctor harness 확인 보정

- bootstrap doctor 가 Windows 에서 `npm`, `codex`, `promptfoo` 같은 `.cmd` shim 기반 CLI 를 확인할 수 있도록 command check 실행을 보정했다.
- workflow evolution venv 확인이 Windows venv 의 `Scripts/python.exe` 경로도 인식하도록 local path 판정을 보강했다.
- mail candidate queue 가 public-safe source path 를 Windows 에서도 POSIX-style repo path 로 기록하도록 보정했다.

### Revision `working` - workflow evolution harness 설치 계획 추가

- B skill 제작 흐름을 단일 skill 제작이 아니라 `workflow_evolution` discovery/slimming 실험으로 다루는 authoring plan 을 추가했다.
- Codex `/goal`, Ralph-style loop, promptfoo, OpenAI SDK, DSPy, class/species compression 을 public-safe harness 후보로 분리하고, 다른 owner PC 에 반복 설치할 수 있는 runbook 을 추가했다.
- bootstrap checklist 에 Codex CLI, promptfoo, workflow evolution venv optional 확인을 추가하고, MacBook Air baseline 으로 Codex CLI `0.129.0` + `goals=true`, promptfoo `0.121.11`, OpenAI SDK `2.36.0`, DSPy `3.2.1` 을 확인했다.

### Revision `working` - battle_event 최소 schema 추가

- `_workmeta/<project_code>/log/events/YYYY/MM/battle_events.jsonl` 에 append 되는 mission-level battle outcome 의 public-safe schema anchor 를 추가했다.
- battle log chain sample 과 play loop 문서를 schema 의 필수 `bottleneck_reason` 및 monthly event stream 위치에 맞게 정렬했다.

### Revision `working` - UI Operation Board projection 소비

- renderer-web Dungeon Map 이 snapshot 의 `operation_board` projection 을 우선 소비해 Dungeon Map, Mission Board, Monster Gate, Next Actions 섹션을 표시하게 했다.
- legacy snapshot field fallback 은 유지하되, UI 가 pending monster group 을 직접 재분류하는 경로는 projection 이 없을 때만 사용하도록 좁혔다.

### Revision `working` - Operation Board projection 추가

- snapshot 에 `operation_board` top-level projection 을 추가해 작전판이 Dungeon Map, Mission Board, Monster Gate, Next Actions 섹션을 원본 재분류 없이 읽을 수 있게 했다.
- projection 은 기존 `projects`, `missions`, `gateway.pending_monsters`, `next_actions`, `diagnostics` 의 sanitized field 만 재조립하며 raw mail body/html/source quote/raw ref/attachment/provider id/secret 값은 계속 제외한다.

## 2026-05-08

### Revision `working` - 작전판 pending monster 분류 표시

- snapshot pending monster projection 에 `display_group` 분류와 `by_display_group` count 를 추가해 Monster Gate 가 blocked/due/routing/identification/open intake 기준으로 묶어 볼 수 있게 했다.
- pending monster display sample cap 을 24건으로 올려 현재 18건 규모의 작전판 표시가 truncation 없이 가능하게 했다.
- UI Dungeon Map 은 snapshot 의 sanitized pending monster item 만 사용해 group별 섹션으로 표시하며 raw mail body/html/source quote/raw ref/attachment 값은 계속 제외한다.

### Revision `working` - 작전판 pending monster snapshot 요약 추가

- snapshot gateway projection 이 `intake_inbox/*/monsters.json` 의 pending/blocked monster 를 제한된 summary 로 집계하게 했다.
- UI Dungeon Map 의 Monster Gate 에 pending monster count 와 sample card 를 표시하게 했다.
- snapshot 과 UI 응답은 body/html/source quote/raw ref/attachment ref/provider id 원문을 복제하지 않고 fixture 기반 test 로 비노출을 고정했다.

### Revision `working` - mail_candidate 승격 명령 추가

- `guild-hall:gateway:mail-candidate:list` 와 `guild-hall:gateway:mail-candidate:promote` 를 추가해 local-only mail candidate 를 `mail_intake_request` payload 로 승격할 수 있게 했다.
- promotion output 은 mailbox event/raw pointer 와 기본 `unknown_monster` 1건을 포함하되 body/html/raw provider payload/첨부명/첨부 URL/secret 은 포함하지 않도록 했다.
- mail candidate promotion 계약과 public-safe request sample 을 문서화했다.

### Revision `working` - mail_candidate 후보 큐 추가

- gateway mail fetch 가 fresh mail event 를 mailbox event JSONL 에 저장한 뒤, `mail` bucket event 를 local-only `mail_candidate` queue 에 적재하게 했다.
- 후보 queue item 은 source event pointer, subject, sender, 수신자/첨부 count, classification summary 만 담고 body/html/raw/첨부명/첨부 URL/secret 은 제외한다.
- `MAIL_CANDIDATE_QUEUE_V0.md` 와 public-safe sample 을 추가해 다른 PC 가 실제 `guild_hall/state/**` 운영 데이터 없이 queue shape 를 재현할 수 있게 했다.

### Revision `working` - gateway index stale 판정 보강

- `intake_inbox` monster index manifest 가 `monsters.json` 의 mtime millisecond 만 보지 않고 size/sha256 fingerprint 도 확인하게 했다.
- 같은 tick 안에서 monster 파일이 갱신돼도 stale manifest 를 재사용하지 않도록 gateway validation flake 를 줄였다.

### Revision `working` - node role public contract guard 추가

- 모든 PC clone 에서 local `node_identity.yaml` 의 `primary_writer.public_repo` 를 기준으로 protected public contract 문서 변경을 검사하는 `validate:role-boundary` 를 추가했다.
- root `validate` / `done:check` 가 role-boundary guard 를 먼저 실행해, public repo primary 가 아닌 node 의 전역 계약 문서 승격 변경을 기본 차단하게 했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 protected public contract 경로와 owner 승인 override 규칙을 명시했다.

### Revision `working` - skill first-build 검증 게이트 명시

- Soulforge 에서 skill 을 새로 만들거나 수정할 때 파일 생성만으로 완료 보고하지 않고, validator 와 fresh-context evaluator review 를 거친 뒤 보고하도록 project-level 실행 계약에 명시했다.
- subagent 는 현재 실행 환경에서 허용되고 사용 가능한 경우에만 쓰며, 불가능한 경우에는 별도 새 컨텍스트 evaluator session 또는 수동 evaluator checklist 로 대체하고 한계를 보고하도록 했다.

### Revision `working` - private-state changelog 링크 검사 보정

- `CHANGELOG_POLICY_V0.md` 의 private repo changelog 참조를 public CI 가 따라가야 하는 상대 링크가 아니라 local path 리터럴로 표시하게 했다.
- `private-state/CHANGELOG.md` 는 owner-only nested private repo 표면이므로 public docs link check 대상에 넣지 않는 경계를 명확히 했다.

### Revision `working` - mail_received Telegram brief v0 추가

- gateway notify event set 에 `mail_received` 를 추가하고, mail fetch 가 fresh event 를 materialize 한 뒤 `town_crier` queue 에 한국어 Telegram brief request 를 적재할 수 있게 했다.
- `mail_received` brief 는 source, subject, 첫 발신자, 첨부 개수, 수신 시각, 다음 행동만 담고 body/html/첨부 원문/URL/secret 은 포함하지 않도록 formatter 와 테스트를 추가했다.
- Telegram brief format 문서에 한국어/Siri 친화 공통 원칙과 `mail_received` 표시 규칙을 추가했다.

### Revision `working` - workmeta system surface 제외

- snapshot project scan 이 `_workmeta/system/**` 같은 private metadata repo 내부 운영 기록을 project 후보로 오인하지 않도록 제외했다.
- `WORKMETA_RESOLVE_CONTRACT_V0.md` 에 `_workmeta/system/` 은 node/system smoke 기록용 non-project support surface 라고 명시했다.

### Revision `working` - tool PC owner-with-state 역할 보강

- 고성능 `tool_pc` 를 skill 제작 전용이 아니라 project metadata 를 읽고 쓰는 tool-bound 설계 작업 node 로 명시했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 `tool_pc` 의 `_workspaces` / `_workmeta` writer 경계와 중복 방지 규칙을 추가했다.
- `TOOL_PC_BOOTSTRAP_PROMPT_V0.md` 를 추가해 고성능 PC 를 `owner-with-state` 로 재설정하고 회로설계/PCBArtwork/tool run evidence 를 기록할 수 있게 했다.

### Revision `working` - gateway env 상대 경로 해석 보강

- `gateway:fetch:healthcheck`, state backup/restore, retention cleanup 이 `EMAIL_FETCH_RUNTIME_DIR` 와 `EMAIL_FETCH_INBOX_ROOT` 의 상대 경로를 env 파일 위치 기준으로 해석하게 했다.
- always-on node 의 post-review smoke 에서 상대 runtime 경로가 repo 밖으로 해석되어 healthcheck/healer 가 중단되는 문제를 재현 테스트로 고정했다.
- gateway mail fetch 문서와 env example 에 운영 node 는 절대 경로를 권장하되, 상대 경로는 env 파일 기준이라는 규칙을 명시했다.

### Revision `working` - always-on next action prompt 추가

- `ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md` 를 추가해 복사/붙여넣기가 어려운 24시간 PC 에서 짧은 파일명 지시만으로 post-review gateway 점검과 activity mirror 를 수행할 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 항상 켜 두는 PC 가 pull 후 다음 운영 작업을 파일 기반으로 찾게 했다.

### Revision `working` - gateway healthcheck/healer 판정 보강

- `guild-hall:healer:run` 이 gateway fetch healthcheck JSON 의 `WARN`/`CRITICAL` 상태를 실패 점검으로 기록해 activity carry-forward 에 남기도록 했다.
- `gateway:fetch:healthcheck` 가 `EMAIL_FETCH_ALERT_TELEGRAM_ENABLED` 와 `EMAIL_FETCH_ALERT_TELEGRAM_*` env 설정을 실제 alert decision 에 반영하게 했다.
- Hiworks POP3 fetch 가 `last_uidl` 이후 메시지부터 진행하고, 중복 이벤트의 raw row 를 반복 append 하지 않도록 보강했다.

### Revision `working` - activity logger 와 healer run 구현

- `guild-hall:activity:log` / `guild-hall:activity:refresh` 를 추가해 모든 PC 가 public-safe summary event 를 공용 activity surface 에 남길 수 있게 했다.
- `guild-hall:healer:run` 을 추가해 24시간 PC 가 repo 상태, root validation, gateway fetch healthcheck 결과를 report/event/latest_context 로 기록하게 했다.
- activity/healer 단위 테스트를 root validation harness 에 연결하고, 관련 README 와 activity/multi-PC 문서에 실행 경계를 반영했다.

### Revision `working` - multi-PC node employee model 추가

- `MULTI_PC_DEVELOPMENT_V0.md` 에 각 PC 가 bounded hotfix 를 맡을 수 있는 node employee model 을 추가했다.
- 24시간 운영용 clone 은 clean `main` 으로 유지하고, 간단 수정은 같은 PC 의 별도 worktree/branch 에서 처리한 뒤 운영용 clone 이 pull 받는 구조로 정리했다.

## 2026-05-07

### Revision `working` - play loop 병목 원인 기록 추가

- `PLAY_LOOP_V0` 에 agent 가 stop condition 까지 진행할 수 있는 최소 packet 기준을 추가해 사용자가 다음 prompt 병목이 되는 지점을 기록하게 했다.
- battle event 에 `bottleneck_reason` 을 추가해 `intervention_count` 가 왜 발생했는지 집계할 수 있게 했다.
- runner execution packet 과 snapshot next action 에 anti-bottleneck loop 를 연결해 반복 병목을 workflow/mission handoff 개선 후보로 올리게 했다.

### Revision `working` - Hiworks POP3 long line 수신 보강

- Hiworks POP3 `RETR` 수신에서 Python `poplib` 기본 2048 byte line limit 에 걸리지 않도록 connector-local long-line reader 를 추가했다.
- `HIWORKS_POP3_MAX_LINE_BYTES` env 설정과 synthetic long-line 테스트를 추가해 raw mail body 없이 긴 라인 수신 경로를 검증하게 했다.

### Revision `working` - gateway mail fetch operator 출력 redaction

- `gateway:fetch` run summary/debug/CLI error output 에 raw mail body, HTML, URL, token-like cursor 가 섞여도 operator terminal 에 그대로 노출되지 않도록 sanitize 경로를 추가했다.
- 24시간 PC `email -> monster` smoke prompt 는 live fetch 에서 `--json` 을 사용하지 않고 count/status 중심으로 확인하도록 조정했다.

## 2026-05-04

### Revision `working` - always-on email monster smoke prompt 추가

- `docs/architecture/bootstrap/ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md` 를 추가해 원격 24시간 PC 에서 긴 붙여넣기 없이 파일 기반 `email -> monster` smoke test 를 실행할 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 `always_on_node` 가 public repo 수정 없이 `doctor`, `gateway:fetch`, `gateway:intake` smoke 를 순서대로 확인하게 했다.

### Revision `working` - multi-PC primary writer map 추가

- `MULTI_PC_DEVELOPMENT_V0.md` 에 색상 Mermaid 기반 PC별 primary writer map 을 추가해 `always_on_node`, `work_pc`, `portable_dev_pc` 가 쓰는 영역과 blocked 작업을 한눈에 볼 수 있게 했다.
- 같은 repo 를 여러 PC 가 clone 해도 `guild_hall/state/**`, `_workspaces/**`, `_workmeta/**`, `private-state/**`, public `Soulforge` 의 primary writer 가 겹치지 않도록 표와 중복 방지 규칙을 보강했다.

### Revision `working` - doctor local node identity 점검 추가

- `guild-hall:doctor` 가 `guild_hall/state/local/node_identity.yaml` 을 읽어 현재 PC 의 `node_role`, `bootstrap_profile`, active Soulforge root, public Git 비추적 상태를 먼저 보고하도록 했다.
- `operator`, `owner-with-state` 프로필에서는 local node identity 를 필수로 보고, `public-only` 에서는 missing 을 허용하되 결과에 표시한다.

### Revision `working` - work PC bootstrap prompt 추가

- `docs/architecture/bootstrap/WORK_PC_BOOTSTRAP_PROMPT_V0.md` 를 추가해 업무 PC 가 Git pull 후 Codex 에게 파일 기반 `work_pc` bootstrap 지시를 받을 수 있게 했다.
- prompt 는 실제 프로젝트 파일과 `_workmeta` 기록을 다루는 업무 PC 역할을 설정하되, always-on scheduler 와 고성능 tool 작업은 기본 차단하도록 정리했다.

### Revision `working` - always-on node bootstrap prompt 추가

- `docs/architecture/bootstrap/ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md` 를 추가해 24시간 운영 PC 가 Git pull 후 Codex 에게 파일 기반 bootstrap 지시를 받을 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 긴 화면공유 붙여넣기 없이 `always_on_node` local identity, doctor, snapshot, night_watch preflight 절차를 찾게 했다.

### Revision `working` - 문서 색인과 multi-PC node 역할 정리

- `docs/architecture/**/README.md` 의 단순 포함 목록을 문서 역할 색인으로 보강해 AI 와 사람이 각 문서를 왜 읽어야 하는지 찾을 수 있게 했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 `work_pc`, `tool_pc`, `portable_dev_pc`, `always_on_node` 역할과 local-only `node_identity.yaml` 기준을 추가했다.
- `AUTOHUNT_MODEL.md`, `NIGHT_WATCH_AUTOMATION_V0.md`, `PROJECT_MAP_V0.md` 를 기존 owner 체계 안에서 연결해 새 최상위 덤프 문서 없이 node capability / 24시간 운영 / 자동사냥 확장선을 찾게 했다.

### Revision `working` - Soulforge game UI 방향 문서화

- `SOULFORGE_GAME_UI_INFORMATION_ARCHITECTURE_V0.md` 를 추가해 UI 중심을 file editor 가 아니라 `Guild Hall / Dungeon Map` 작전판으로 고정했다.
- `SOULFORGE_2D_DUNGEON_UI_DIRECTION_V0.md` 를 추가해 3D 가 아닌 2D/2.5D 판타지 업무 작전판 방향과 v0/v1 경계를 정리했다.
- `SE_DUNGEON_STAGE_MODEL_V0.md` 를 추가해 project 를 dungeon, 체계공학 단계를 stage/floor, 단계 완료를 boss clear 로 읽는 public-safe UI 모델을 연결했다.

### Revision `working` - agent 실행 계약 추가

- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 추가해 Karpathy-style coding agent 원칙을 Soulforge의 canon/public-private/secret 경계에 맞게 흡수했다.
- `AGENTS.md` 에 코드, 문서, 구조, 검토, 적용성 판단, 변경 계획, 파일 편집 작업 전 실행 계약을 읽는 라우팅 규칙을 추가했다.
- root README 와 foundation README 에 새 실행 계약 문서를 연결했다.

## 2026-05-02

### Revision `working` - Dungeon Map v0 read-only pane 추가

- `renderer-web` control center 에 `GET /__control_center_api/snapshot` dev API 와 `Dungeon Map` pane 을 추가했다.
- 새 pane 은 local snapshot projection 인 `guild_hall/state/snapshot/soulforge_snapshot.json` 의 summary 만 읽고, raw workspace/workmeta/private-state/gateway source 내용은 표시하지 않는다.

### Revision `working` - snapshot freshness 계약 추가

- `soulforge_snapshot.json` 에 `source_observations` 를 추가해 UI 가 보는 snapshot 이 어떤 원본 metadata 기준인지 판정할 수 있게 했다.
- `npm run guild-hall:snapshot:check-fresh` 를 추가해 저장된 local snapshot 과 현재 원본 surface 의 fingerprint mismatch 를 감지하게 했다.
- freshness 관측 범위는 repo metadata, roadmap, mission index, `_workspaces`, `_workmeta`, gateway state, private-state surface 로 제한하고 원본 업무 내용은 읽지 않는다.

### Revision `working` - read-only Soulforge snapshot producer 추가

- `guild_hall/snapshot/` 을 추가해 owner root, project surface, mission summary, gateway status 를 sanitized metadata JSON 으로 투영하게 했다.
- 기본 출력은 local-only `guild_hall/state/snapshot/soulforge_snapshot.json` 으로 두고, raw mailbox, attachment, token, `_workspaces` 파일 내용은 snapshot 에 포함하지 않도록 경계를 고정했다.
- `validate:snapshot` 을 root acceptance 에 연결해 snapshot shape 와 private content 비노출 최소 test 를 함께 돌리게 했다.

### Revision `working` - 큰 개발 방향 단일 정본 추가

- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` 를 추가해 Soulforge의 큰 개발 방향, active slice, 구체화 규칙을 한곳에서 관리하게 했다.
- `PROJECT_MAP_V0.md` 는 탐색 지도 역할로 좁히고, active backlog 와 세부 구현 checklist 는 roadmap 또는 각 owner 문서로 내려가도록 경계를 명시했다.
- `AGENTS.md` 에 큰 개발 방향과 우선순위 판단 시 roadmap 을 먼저 확인하는 짧은 라우팅 규칙을 추가했다.

### Revision `working` - 현재 구조 파악용 project map 추가

- `docs/architecture/foundation/PROJECT_MAP_V0.md` 를 추가해 Soulforge owner roots, 업무 RPG 루프, UI/gateway 상태, local/private 경계를 한 장에서 다시 볼 수 있게 했다.
- root README 와 architecture index 에 새 지도 문서를 연결해 멈춘 뒤 재개할 때 첫 읽기 순서를 분명히 했다.

## 2026-03-27

### Revision `working` - bootstrap 프로필을 public-only/operator/owner-with-state 3단으로 정리

- `public-only` 가 operator env 없이도 성립하도록 bootstrap profile 문서, checklist, doctor 계약을 정리했다.
- 새 `operator` 프로필을 추가해 private repo 없이도 gateway/town_crier local env 와 smoke/live 를 다룰 수 있게 했다.
- `owner-with-state` 는 계속 `_workmeta/`, `private-state/` 와 continuity restore 를 요구하는 owner 전용 프로필로 유지했다.

### Revision `working` - root canon validator 첫 버전 추가

- `guild_hall/validate/canon_validate.mjs` 를 추가해 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `_workspaces/README.md` 의 최소 path/ref/readiness 무결성을 점검하게 했다.
- canonical entrypoint 는 `npm run guild-hall:validate:canon` 으로 두고, convenience alias 로 `npm run canon:validate` 를 함께 제공한다.
- mission 의 `workflow_id: null` 예외가 readiness blocked 규칙과 맞는지도 첫 validator 범위에 포함했다.

### Revision `working` - root validate/done-check 와 GitHub Actions 최소 게이트 추가

- root `validate`, `done:check`, `validate:gateway` entrypoint 를 추가해 canon validator, UI acceptance, `mail_fetch` pytest harness 를 한 surface 로 묶었다.
- `.github/workflows/validate.yml` 을 추가해 PR 과 `main` push 에서 `npm run done:check` 를 돌리는 최소 public CI gate 를 열었다.
- `CONTRIBUTING.md`, `SECURITY.md` 를 추가해 public contribution 기준선과 비공개 보안 제보 원칙을 정리했다.

### Revision `working` - update manual 에 operator 프로필 절차 추가

- `UPDATE_MANUAL_V0.md` 에 `operator` update 절차를 추가해 `public-only`, `operator`, `owner-with-state` 3단 프로필이 bootstrap 과 update 문서에서 같은 구조를 갖도록 맞췄다.
- `operator` 는 public repo pull + local operator env 유지까지만 다루고, private repo pull 은 하지 않는다고 다시 고정했다.

### Revision `working` - night_watch Stage 0 preflight 를 script owner 로 분리 시작

- `guild_hall/night_watch/preflight_repo_sync.mjs` 와 `npm run guild-hall:night-watch:preflight` 를 추가해 repo sync, retry, owner-with-state remote doctor, activity log write 를 deterministic script 가 맡게 했다.
- `soulforge-night-watch-pipeline.prompt.txt` 와 `NIGHT_WATCH_AUTOMATION_V0.md` 의 Stage 0 는 이제 자연어로 git/doctor 제어를 다시 서술하지 않고, preflight script 실행과 그 결과 소비를 기준으로 삼는다.

### Revision `working` - gateway intake dedupe index manifest 추가

- `guild_hall/gateway/monster_index.mjs` 를 추가해 `intake_inbox/**/monsters.json` 전역 파싱 대신 `intake_inbox/_index/monster_index.json` manifest cache 를 우선 읽는 구조를 넣었다.
- `runIntake`, `touchExistingMonster`, `update-monster` 는 `monsters.json` 저장 뒤 manifest 를 함께 갱신하도록 맞췄다.
- `validate:gateway` 에 Node builtin test 를 추가해 manifest rebuild 와 stale detection 을 최소 범위로 검증하게 했다.

### Revision `working` - guild_hall 공용 io/path helper 추가

- `guild_hall/shared/io.mjs` 를 추가해 `doctor`, `gateway`, `town_crier`, `night_watch` 가 공통으로 쓰는 repo-relative path 정규화, JSON/JSONL state 입출력, 존재 여부 점검 helper 를 한 surface 로 모았다.
- `night_watch` preflight 와 `gateway` dedupe index 는 이제 같은 JSON/경로 helper 를 써서 `/` 기준 repo path 와 state write 형식을 맞춘다.
- `guild_hall/shared/README.md` 를 추가하고 `guild_hall` owner 문서에 새 내부 helper surface 를 연결했다.

### Revision `working` - doctor 출력 책임 일부를 reporting helper 로 분리

- `guild_hall/doctor/reporting.mjs` 를 추가해 human/json 출력 렌더링과 fatal payload 조립 책임을 CLI 본체에서 분리했다.
- `guild_hall/doctor/cli.mjs` 는 bootstrap check 실행과 결과 조합에 더 집중하고, 출력 형식 변경은 reporting helper 에서 다루도록 정리했다.

### Revision `working` - gateway message rendering helper 분리

- `guild_hall/gateway/message_rendering.mjs` 를 추가해 관문 알림 문구, monster label, 문장 정규화 helper 를 CLI 본체에서 분리했다.
- `guild_hall/gateway/cli.mjs` 는 intake/update/notify 흐름에 집중하고, 새 의뢰 알림 텍스트 조립은 message rendering helper 가 맡도록 정리했다.

### Revision `working` - 1차 world-facing class 4종 추가와 2차 후보군 기록

- `archer`, `rogue`, `healer`, `envoy` canonical class sample 4종을 starter lineup 에 추가했다.
- 현재 registry skill/tool/knowledge 가 아직 작기 때문에, 이 4종은 기존 canon refs 를 재조합한 starter interpretation 으로 두었다.
- `blacksmith`, `artificer`, `mage`, `fighter` 는 2차 후보군으로 `.registry/classes/README.md` 에 기록해 later expansion 에서 잊지 않게 했다.

### Revision `working` - class title 을 세계관 톤으로 보정

- `archivist` 의 사람용 title 을 `기록관` 으로, `administrator` 의 사람용 title 을 `총관` 으로 조정했다.
- 내부 `class_id` 는 그대로 유지하고, world-facing 설명만 조정해 기존 unit/workflow binding 과 경로를 깨지 않게 유지했다.
- `human` species hero 와 guild master 관련 설명도 governance / archive 톤으로 같이 맞췄다.

### Revision `working` - ontology review 상기 manual 과 guild_master carry-forward 규칙 추가

- `docs/architecture/foundation/ONTOLOGY_REVIEW_MANUAL_V0.md` 를 추가해 ontology review trigger, 저장 위치, carry-forward owner 를 고정했다.
- root `AGENTS.md` 와 `night_watch` 문서/prompt 에 ontology candidate 상기 규칙을 넣어, 현재 프로젝트가 아니어도 `guild_master` / `night_watch` lane 이 cross-project 후보를 다시 떠올리게 했다.
- activity surface 에는 ontology review candidate 를 `carry_forward: true` 로 남길 수 있다는 규칙을 추가했다.

### Revision `working` - ontology-style 저장 규칙 기준선 추가

- Soulforge 핵심 개념을 `개체 + 관계` 기준으로 읽는 `Ontology Model v0` foundation 문서를 추가했다.
- ontology 정의와 관계 규칙은 public foundation 문서가 들고, project-specific instance 는 `_workmeta/<project_code>/ontology/` 에 두며, runtime event 는 계속 `guild_hall/state/**` 와 `private-state/**` 가 소유하도록 저장 위치를 고정했다.
- 새 top-level `ontology/` root 는 만들지 않고, 기존 owner root 안에서 정의/canon instance/runtime event 를 분리하는 방향으로 정리했다.

### Revision `working` - starter class lineup 을 6종으로 확장

- 기존 `knight`, `archivist`, `administrator` 에 더해 `pathfinder`, `marshal`, `auditor` canonical class sample 3종을 추가했다.
- 새 class 들은 species 와 독립된 축을 유지하고, 실제 조합은 계속 unit/party/workflow/mission 에서 결정하도록 유지했다.
- ref 는 기존 `.registry/skills`, `.registry/tools`, `.registry/knowledge` canon 안에서만 조합해 `정찰`, `집행`, `검증` lane 을 드러내도록 맞췄다.

### Revision `working` - night_watch preflight 에 transient retry 추가

- `night_watch` current-default pipeline 의 preflight 는 계속 `fail-closed` 로 유지하되, dirty repo, detached HEAD, missing origin, non-main branch 는 즉시 hard fail 하도록 명시했다.
- 반대로 DNS 해석 실패, temporary name resolution failure, timeout, connection reset, TLS handshake timeout, network unreachable, transient 5xx gateway 오류 같은 일시적 network-class 실패는 bounded retry 뒤 최종 판정하도록 규칙을 추가했다.
- repo sync 는 최대 3회 시도, doctor remote 검사는 repo sync 성공 후 1회 재시도만 허용하고, 그래도 실패하면 blocked preflight 로 중단하게 prompt/source 와 운영 문서를 맞췄다.

## 2026-03-26

### Revision `working` - 종족 직업 몬스터의 사람용 한글 표시 규칙 추가

- canonical id 는 계속 stable ASCII 를 유지하고, 사람에게 보여주는 이름은 `title`, `display_name`, `monster_label` 같은 human-facing 필드에 한국어로 둘 수 있다는 규칙을 public canon 문서에 추가했다.
- current sample species/class title 과 human hero title 을 한국어로 바꿨다.
- `monster` 계열은 `monster_family` / `monster_name` / `monster_type` id 를 유지하되, candidate note 와 lineup 문서에서 optional `monster_label` 로 한국어 표시를 둘 수 있게 했다.

### Revision `working` - species 와 class 독립 조합 규칙 추가

- `.registry` canon 에서 species 와 class 는 서로 종속되지 않는 독립 catalog 축이라고 명시했다.
- 실제 조합은 `.unit/<unit_id>/unit.yaml` 의 `identity.species_id + class_ids` 가 결정하도록 문서와 schema 를 정리했다.
- 그래서 `orc + knight` 같은 조합도 canon 상 허용되며, 제한이 필요하면 unit/party/workflow/mission 에서만 표현하도록 규칙을 고정했다.
- starter species lineup 은 `human`, `orc`, `elf`, `dwarf`, `darkelf` 5종으로 맞췄다.

## 2026-03-25

### Revision `working` - mission model 에 monster 와 artifact 구분 규칙 추가

- `docs/architecture/workspace/MISSION_MODEL.md` 에 `monster = 요청`, `artifact = 산출물`, `mission = 실행 계획` 구분을 명시했다.
- 같은 artifact 가 한 mission 에서는 output 이고, 다음 mission 에서는 input 이 될 수 있다는 generic meeting-followup 예시를 추가했다.

### Revision `working` - agent procedure capture entrypoint rule

- Added a root `AGENTS.md` rule so every bounded business task leaves tracked promotion-ready evidence in `_workmeta/<project_code>/reports/**` instead of relying on chat memory or ignored runtime logs.
- Kept `AGENTS.md` as the short routing surface and pointed detailed capture fields to `_workmeta/PROCEDURE_CAPTURE_RULE.md`, including repeatable steps, decision criteria, folder or packet shape, and completion criteria for later promotion into `skill`, `workflow`, `mission`, `role_or_class`, or `data_contract`.

### Revision `working` — night_watch local automation source 를 tracked renderer 구조로 고정

- `Soulforge Night Watch Pipeline` 의 prompt/spec source 를 public tracked tree 아래 `guild_hall/night_watch/automations/` 로 옮기고, 각 PC 의 local `automation.toml` 은 renderer 로 재생성하는 구조를 추가했다.
- 이 변경으로 automation prompt 업데이트 자체는 Git 형상관리되고, 다른 PC 는 repo pull 후 같은 source 를 보고 local automation 을 다시 install 할 수 있다.
- 관련 경로:
  - `guild_hall/night_watch/automations/soulforge-night-watch-pipeline.spec.json`
  - `guild_hall/night_watch/automations/soulforge-night-watch-pipeline.prompt.txt`
  - `guild_hall/night_watch/render_local_automation.mjs`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 시작 전에 전 repo 최신 동기화 gate 추가

- 항상 켜 두는 운영 PC 의 `night_watch` pipeline 이 점검 전에 public `Soulforge`, `_workmeta`, `private-state` 를 모두 fast-forward pull 하도록 preflight stage 를 추가했다.
- preflight stage 는 세 repo 중 하나라도 dirty, missing, origin 누락, branch mismatch, pull 실패, `owner-with-state --remote` doctor 실패가 있으면 그 run 에서 후속 점검을 건너뛰고 blocked report 만 남기도록 규칙을 고정했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — legacy `_workspaces` continuity lane 제거와 runtime README 경계 정리

- bootstrap/install checklist 에서 `private-state/_workspaces` restore 경로를 제거했다.
- `owner-with-state` bootstrap 은 `guild_hall/state/**` continuity subset 만 `private-state/` 에서 복원하고, `_workspaces/<project_code>/` 는 각 PC 에서 다시 materialize 하도록 정리했다.
- tracked `guild_hall/state/README.md` 가 runtime root 안의 유일한 boundary note 라는 점을 문구로 명시해 public tracking 예외를 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`
  - `guild_hall/state/README.md`
  - `guild_hall/doctor/cli.mjs`

## 2026-03-24

### Revision `working` — night_watch automation 을 worktree-safe local path 기준으로 재설계

- Codex app automation 이 임시 worktree 에서 실행될 수 있다는 전제를 문서에 반영했다.
- tracked canon 의 상대 경로 계약은 유지하되, local automation prompt 에는 `<LOCAL_SOULFORGE_ROOT>`, `<LOCAL_ACTIVITY_ROOT>`, `<LOCAL_PRIVATE_STATE_ROOT>`, `<LOCAL_WORKMETA_ROOT>` 같은 absolute path 입력을 쓰도록 규칙을 추가했다.
- `soulforge_activity` writer 는 worktree-local copy 가 아니라 이 PC 의 active absolute root 를 canonical sink 로 삼는다고 명시했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 결과 저장 surface 와 Fix Draft companion 설계 추가

- night_watch 자동화가 Codex inbox/thread 에만 머물지 않고 `guild_hall/state/operations/soulforge_activity/**` 에도 결과를 남기도록 output contract 를 보강했다.
- `latest_context.json`, `events/YYYY/YYYY-MM.jsonl` 외에 상세 실행 결과를 저장하는 `log/YYYY/YYYY-MM-DD/HHMM-<automation-id>.md` surface 를 추가했다.
- 자동 수정은 current-default 에 넣지 않고, draft-only 후속 조치 제안을 만드는 `Soulforge Fix Draft` companion spec 을 추가했다.
- 새 점검 자동화가 추가되거나 출력 형식이 바뀌면 `Fix Draft` spec 도 같은 patch 에서 함께 갱신하는 동기화 규칙을 문서화했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 자동화 후보 문서화

- `guild_hall/night_watch` owner 아래에서 장기 운영용 새벽 점검 자동화 후보 3개를 문서화했다.
- `Boundary Check`, `Portability Check`, `Context Drift Check` 의 목적과 입력 경로, 결과 surface 를 정리했다.
- 자동화 규칙 문서는 tracked repo 에 두고, 실제 스케줄과 ACTIVE 상태는 Codex app local automation 이 맡는다는 경계를 분리했다.
- 다른 PC 에서 그대로 다시 만들 수 있도록 각 자동화의 이름, 권장 주기, 작업 경로, 실행 프롬프트를 문서 안에 ready-to-create spec 으로 추가했다.
- 다른 PC 에서는 repo pull 후 같은 문서를 보고 Codex automation 을 다시 만들도록 절차를 적었다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/README.md`
  - `guild_hall/night_watch/README.md`
  - `README.md`

### Revision `working` — Soulforge 전체 활동 recent-context surface 추가

- Soulforge 전체 작업의 최근 맥락을 project `_workmeta` 가 아니라 `guild_hall/state/operations/soulforge_activity/**` 에 두는 규칙을 추가했다.
- 최근 PC/session 에서는 `latest_context.json` 을 먼저 읽고, 부족할 때만 월별 `events/*.jsonl` 마지막 몇 건을 추가로 읽는 recent-window 규칙을 문서화했다.
- `private-state/` mirror 범위와 update/handoff restore 절차에 `operations/soulforge_activity/**` 를 포함했다.
- 관련 경로:
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `docs/architecture/guild_hall/GUILD_HALL_MODEL_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`

### Revision `working` — private-state mailbox continuity mirror 범위 확대

- `private-state/` allowlist 를 intake/monster/outbound 중심에서 mailbox continuity mirror 까지 확대했다.
- owner handoff/update/private-state 문서에서 `mailbox/company/**`, `mailbox/personal/**`, `log/mail_fetch/**` sync/restore 절차를 추가했다.
- active runtime 경로는 그대로 두고, `private-state/` 는 mirror copy plane 으로만 쓰도록 문서를 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/workspace/examples/private_state_repo/README.md`
  - `docs/architecture/workspace/examples/private_state_repo/gitignore.example`

### Revision `working` — 메일 수신/이동 이력 폴더와 skill spec 추가

- `020_MGMT/027_수신이력_이동이력` 폴더를 관리 폴더 quick map 과 SE 폴더트리 skill spec 에 추가했다.
- generator 가 `management_static_folders` 설명을 `폴더_인덱스.txt` 와 `plan_manifest.json` 에 반영할 수 있게 갱신했다.
- 관련 경로:
  - `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  - `.registry/skills/se_foldertree_generate/codex/scripts/generate_tree.py`
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`

### Revision `working` — 온보딩 가이드에 관리 폴더 설명 추가

- `PROJECT_ONBOARDING_V0.md` 에 `020_MGMT` 관리 폴더 quick map 과 `022 -> stage별 *_INBOX_분류전 -> gate 내부 세부 폴더` 흐름 설명을 추가했다.
- 관련 경로:
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`

### Revision `working` — owner 전용 `_workmeta` clone/pull 절차 문서화

- `_workmeta/` 를 `_workspaces/` 와 같은 레벨의 owner-only private metadata repo 로 clone/pull 하는 절차를 bootstrap/update/multi-PC 문서에 추가했다.
- `owner-with-state` 프로필이 public `Soulforge` 외에 `_workmeta/` 와 `private-state/` 를 함께 다루도록 문서를 정리했다.
- `private-state` 문서와 예시 템플릿에서 `_workmeta` 를 범위 밖의 별도 private repo 로 분리했다.
- 관련 경로:
  - `README.md`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/workspace/examples/private_state_repo/README.md`
  - `docs/architecture/workspace/examples/private_state_repo/gitignore.example`

## 2026-03-23

### Revision `working` — SE 폴더트리 생성 skill package 편입

- internal SE folder-tree generator 리소스를 Soulforge canonical skill package 로 편입했다.
- 새 package 는 `.registry/skills/se_foldertree_generate/` 아래 canon entry 와 sync 가능한 `codex/` bridge 를 함께 두고, bundled asset/script/reference 를 local Codex mirror 로 materialize 할 수 있게 구성했다.
- skill package 와 generator 를 입력 확인형으로 보강해 `layout mode(new-root/in-place)`, `business type`, `prime contractor`, `quality grade` 를 먼저 확인하고, 현재 지원 조합이 아니면 중단하도록 했다.
- generator 는 `in-place` 모드를 추가해 기존 프로젝트 루트에 한 단계 더 nested root 를 만들지 않고 직접 tree 내용을 생성할 수 있게 했다.
- bundled asset/script/reference 는 skill root 기준 상대경로 사용을 기본 원칙으로 명시해 이식성을 높였다.
- 기존 install/sync 문서는 이미 `skills:sync` 전체 동기화 규약을 갖고 있어 이번 변경에서는 새 package 추가만 반영했다.
- 관련 경로:
  - `.registry/skills/se_foldertree_generate/skill.yaml`
  - `.registry/skills/se_foldertree_generate/README.md`
  - `.registry/skills/se_foldertree_generate/codex/SKILL.md`
  - `.registry/skills/se_foldertree_generate/codex/agents/openai.yaml`
  - `.registry/skills/se_foldertree_generate/codex/references/mapping.md`
  - `.registry/skills/se_foldertree_generate/codex/references/workflow.md`
  - `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  - `.registry/skills/se_foldertree_generate/codex/scripts/generate_tree.py`
  - `.registry/skills/se_foldertree_generate/codex/scripts/convert_gate_numbers.py`
  - `.registry/skills/se_foldertree_generate/codex/requirements.txt`
  - `.registry/skills/README.md`

### Revision `working` — 첫 실제 프로젝트 온보딩 manual 승격

- 첫 실제 프로젝트를 `_workspaces/<project_code>/` 에 붙이는 절차를 별도 workspace manual 로 승격했다.
- short `project_code`, full `display_name`, read-only first, bounded first run/use, local-only junction/symlink materialization 규칙을 workspace 정본 문서에 반영했다.
- tracked 정본 문서와 public-safe example 에는 실제 project code / 과제명 대신 generic placeholder 만 쓰는 규칙을 추가했다.
- 실제 프로젝트별 실험 문서와 근거는 local-only `reports/onboarding/`, `artifacts/onboarding/` 아래에 두고, 안정 규칙만 정본 문서로 승격하는 흐름을 명시했다.
- 사람과 Codex 가 함께 첫 과제를 여는 `project_start_worklog.md` 와 project start workflow manual 을 추가했다.
- 새 시작 행위는 사용자가 따로 요청하지 않아도 실제 작업 순서를 worklog 와 workflow note 로 저장하는 규칙을 추가했다.
- project assignment 규칙을 승격할 때는 비밀 project code 나 내부 관리번호 대신 공개 가능한 대표 업무명/주제어를 우선 쓰고, 약어·제품군명·일반 사업유형은 보조 힌트로만 다루도록 정리했다.
- project metadata 와 raw runtime truth 를 project root 내부 metadata folder 대신 Soulforge root 아래 nested private repo `_workmeta/<project_code>/` 로 분리하는 모델로 구조 문서, 예시, UI 경로 해석을 전환했다.
- 관련 경로:
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`
  - `docs/architecture/workspace/PROJECT_START_WORKFLOW_V0.md`
  - `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`
  - `docs/architecture/workspace/WORKMETA_SCHEMA_FIELD_MATRIX.md`
  - `docs/architecture/workspace/WORKMETA_MINIMUM_SCHEMA.md`
  - `docs/architecture/workspace/README.md`
  - `_workspaces/README.md`

### Revision `working` — Windows runbook shell 차이 보강

- bootstrap, handoff, private-state runbook 에 남아 있던 Unix shell 예시에 Windows PowerShell 대응 명령을 보강했다.
- `npm.ps1` execution policy, `which`, `mkdir -p`, `cp`, `rsync` 같은 shell 차이 때문에 새 Windows PC 에서 막히는 지점을 문서에서 바로 풀 수 있게 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`

### Revision `working` — Windows bootstrap skill sync Ruby 의존 제거

- `npm run skills:sync -- --all` 이 Ruby 미설치 환경에서도 동작하도록 Node 기반 sync script 로 전환했다.
- skill install sync 운영 문서를 새 script 경로와 사용 예시로 갱신했다.
- 관련 경로:
  - `.registry/docs/operations/scripts/sync_codex_skill.mjs`
  - `package.json`
  - `.registry/docs/operations/SKILL_INSTALL_SYNC.md`

### Revision `working` — doctor skill sync 범위 확대

- bootstrap/doctor 계약을 기본 3개 skill 에서 sync 가능한 Soulforge Codex skill 전체로 확대했다.
- `codex/SKILL.md` 가 없는 registry entry 는 canon-only 또는 test package 로 보고 기본 sync 대상에서 제외하도록 문서를 정리했다.
- 관련 경로:
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `.registry/skills/README.md`
  - `.registry/docs/operations/SKILL_INSTALL_SYNC.md`
  - `guild_hall/doctor/README.md`
  - `guild_hall/doctor/cli.mjs`

### Revision `1b58127` — owner handoff 체크리스트 추가

- `OWNER_HANDOFF_CHECKLIST_V0.md` 를 추가해 회사/집 사이 handoff 순서를 고정했다.
- owner 는 작업 시작 전 `doctor --remote`, 작업 종료 전 public/private push 를 확인하는 흐름을 문서화했다.
- 관련 경로:
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/README.md`

### Revision `e128441` — private-state 원격 연결과 owner push 규칙 보강

- nested `private-state/` 가 local Git repo 만 있고 `origin` remote 가 비어 있는 예외 복구 절차를 추가했다.
- public/private 두 저장소의 역할과 owner PC 의 private-state push 조건을 명시했다.
- 관련 경로:
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`

### Revision `b878873` — bootstrap 인증과 continuity 가이드 보강

- 설치 완료 기준에 `gh auth login` 과 owner `doctor --remote` 통과를 포함했다.
- continuity sync/pull/restore 절차를 owner 전용 가이드로 보강했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/bootstrap/README.md`

### Revision `b6df3a7` — public sync probe

- 다른 PC 에서 public repo round-trip sync 를 검증하기 위한 harmless probe 파일을 추가했다.
- 목적은 public `pull/push` 동작 검증이며, 기능 변화는 없다.
- 관련 경로:
  - `docs/architecture/bootstrap/SYNC_PROBE_PUBLIC_2026-03-23.md`

## 2026-06-18

### Unreleased

- Added `PROJECT_FOLDER_INDEXING_POLICY_V0.md` so active project worksites keep a
  project-local file search index before folder cleanup, RAG, wiki, or
  source-supported knowledge work.
- Documented the boundary between folder indexing, raw source storage,
  `_workmeta` metadata, blocked/encrypted-file queues, and later knowledge
  promotion.
- Clarified that newly created or downloaded project files should be captured by
  incremental indexing after they are accepted into the project worksite.
- Added the daily dawn indexing check rule: detect missing or stale project
  indexes first, index only queued folders, keep the run non-destructive, and
  leave password unlock work outside the default automation.
- Updated `outlook_mail_reconcile_v0` and the installed Codex launcher skill so
  the Outlook automation may run `Send/Receive All Folders` once as an
  owner-requested preflight immediately before metadata collection.
- Updated the local Codex `outlook` automation prompt to require that preflight
  refresh while keeping all other Outlook mutation, raw-body, and attachment
  boundaries unchanged.
- Added a dev-ERP mail project rule candidate exporter that turns ERP project
  filing evidence into private, metadata-only router-rule review packets.

## 2026-03-22

### Revision `3bbd424` — update 절차와 owner prompt 추가

- 설치 후 업데이트 표준 절차를 별도 문서로 분리했다.
- owner 가 다른 PC Codex 에 업데이트를 맡길 때 사용할 프롬프트 문서를 추가했다.

### Revision `f9680da` — secret 규칙과 필수 skill 기준 정리

- secret 파일 비열람 원칙을 agent/document 규칙에 추가했다.
- 기본 Soulforge skill 3개를 bootstrap doctor 필수 항목으로 승격했다.

### Revision `029560a` — public 기능과 private 업무데이터 저장 규칙 정리

- public repo 와 private repo 의 역할을 owner 관점에서 문서화했다.
- 팀원/public-only 와 owner-with-state 의 경계를 더 명확히 했다.

### Revision `77d6db0` — nested private-state 구조와 bootstrap 가이드 정리

- `Soulforge/private-state/` nested repo 구조를 기준으로 bootstrap/doctor 경로를 정리했다.
- active workspace 는 `Soulforge/` 하나라는 운영 모델을 문서에 반영했다.

### Revision `82672d5` — doctor 원격 점검과 bootstrap 프로필 추가

- `guild-hall:doctor` 에 `--profile owner-with-state`, `--remote`, `fix_hint` 를 추가했다.
- 팀원용 `public-only`, owner 용 `owner-with-state` bootstrap 프로필을 정식화했다.

### Revision `20f9b49` — doctor fatal schema 정리

- fatal path JSON 도 normal path 와 같은 top-level schema 를 유지하도록 정리했다.

### Revision `58621c6` — doctor 계약과 outbound ledger 정리

- `doctor` JSON/exit code 계약을 보강했다.
- outbound mail ledger 최소 필드와 private state 경계를 문서로 잠갔다.

### Revision `60b8870` — bootstrap doctor 와 private state 기준 추가

- bootstrap 문서 묶음과 `guild-hall:doctor` entrypoint 를 추가했다.
- private state repo 기준과 outbound mail 기록 자리의 초기 계약을 마련했다.
