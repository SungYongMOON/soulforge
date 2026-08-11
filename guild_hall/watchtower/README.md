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
| `topology.mjs` | Soulforge AX 토폴로지의 public-safe 정의 (노드 27 · 간선 32)와 fail-closed 정적 검증 |
| `topology_federation.v1.schema.json` | owner별 구조 fragment의 strict public-safe wire contract |
| `topology_federation.mjs` | fragment 검증, namespace 합성, canonical digest, declared/observed exact-set reconciliation |
| `topology_provider_adapters.mjs` | allowlist된 Watchtower·Engineering Engine 선언 구조를 fragment로 바꾸는 순수 adapter |
| `providers/knowledge_stack.mjs` | RAG·Knowledge Graph·Wiki의 공개 owner 계약 bundle을 지식 provider fragment로 변환 |
| `providers/notebook_advisory.mjs` | Notebook metadata bridge·research workflow·setup 계약을 authority-free HOLD fragment로 변환 |
| `tools/emit_federated_topology.mjs` | 고정된 tracked source allowlist만 읽어 단일 derived projection을 생성하거나 byte parity를 검사하는 도구 |
| `topology/federated_topology.v1.json` | UI가 읽을 수 있는 tracked public-safe 선언 구조 projection; runtime truth가 아님 |
| `watchtower.mjs` | binding 검증, probe 4종(jsonl_tail/json_file/dir_latest_mtime/schtask), 판정, 스냅샷 |
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
- `resident_task`가 지정된 노드는 stale일 때 schtasks 상태로 정지 여부를
  구분한다(`task_not_running` → down).
- probe가 없는 구조 노드는 이유 코드가 있는 `unmonitored`다. provider source는
  `provider_evidence_absent`, 실제 on-demand 실행 증거를 받지 않는 collector는
  `catalog_only_on_demand`, 공통 meter와 Watchtower 자체는
  `independent_evidence_absent`다. 미감시를 정상으로 칠하지 않는다.
- `watchtower_self`에는 heartbeat, binding, resident task가 없으며 synthetic `ok`를
  만들지 않는다. 별도 독립 근거가 생기기 전에는 `unmonitored`/HOLD다.
- exit code: 0=판정 완료, 2=down 노드 존재, 1=실행 실패.

## AI 사용량 hybrid topology

AI 사용량 lane은 provider별 상주 미터가 아니다. 실제 구현에 맞춰 다음 on-demand
producer와 하나의 공통 meter/원장을 구조로 표시한다.

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
  on-demand producer다. scheduler나 상주 provider meter를 뜻하지 않는다.
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
- 스냅샷: binding `state_root`의 `snapshot/topology_health.v1.json` (원자 쓰기).

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
