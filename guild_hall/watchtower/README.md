# Watchtower — AX 시스템 토폴로지 검사 (W1)

관제 소비자. 이미 생산 중인 하트비트·health 파일을 **period+grace 2단 윈도**로
판정해, 경로가 노출되지 않는 topology health 스냅샷을 만든다. W1 범위는
**검사·표시 전용**이며 복구(self-heal)·알림·스케줄 상주화는 W2에서 별도 owner
승인 게이트로 추가한다.

## 소유 경계

- 소유: 토폴로지 정의(`topology.mjs`, public-safe 노드·간선), 판정 엔진, probe CLI.
- 비소유: 하트비트 생산(각 수집기 소유), 자동 복구·알림(W2), 실제 경로·임계값
  (local binding 소유 — 추적되지 않는 로컬 파일).
- 원문·secret·절대경로는 스냅샷에 들어가지 않는다(`assertSnapshotPathFree`가
  기계 검증).

## 파일

| 파일 | 역할 |
| --- | --- |
| `topology.mjs` | Soulforge AX 토폴로지의 public-safe 정의 (노드 22 · 간선 26) |
| `watchtower.mjs` | binding 검증, probe 4종(jsonl_tail/json_file/dir_latest_mtime/schtask), 판정, 스냅샷 |
| `cli.mjs` | `probe [--binding <path>\|--pointer <path>] [--json] [--no-write]`, `init-binding --output <path>` |
| `watchtower.test.mjs` | 합성 판정·경로 미노출·원자 기록 회귀 |

## 판정 규칙

- `age <= period` → 정상, `<= period+grace` → 열화(`heartbeat_late`),
  초과 → `stale`. 소스 부재·파싱 불가 → `down`(fail-closed).
- `status_field`가 `ok_values` 밖이면 열화(`status_<value>`),
  `degrade_when`의 수치 초과도 열화(`count_<field>_<value>`).
- `resident_task`가 지정된 노드는 stale일 때 schtasks 상태로 정지 여부를
  구분한다(`task_not_running` → down).
- exit code: 0=판정 완료, 2=down 노드 존재, 1=실행 실패.

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

## 검증

```bash
npm run validate:watchtower
npm run guild-hall:watchtower:probe
```
