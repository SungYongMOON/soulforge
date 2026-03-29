# guild_hall

## 목적

- `guild_hall/` 은 Soulforge 의 cross-project 운영 root 다.
- 이 루트는 project worksite 자체가 아니라, 여러 프로젝트에 공통으로 걸치는 ingress, notify, assignment, night watch 기능을 모은다.
- 실제 local state 는 `guild_hall/state/**` 아래에서만 materialize 하고 Git 으로 추적하지 않는다.

## 구성

- `gateway/`: 메일 수집, intake, cross-project staging ingress
- `doctor/`: clone 된 PC bootstrap readiness 점검과 local doctor status
- `shared/`: guild_hall owner 들이 함께 쓰는 repo path / JSON state helper
- `validate/`: canonical root 최소 무결성 검사와 validation harness
- `town_crier/`: 공용 notify queue 와 Telegram outbound transport
- `night_watch/`: nightly review / summary owner
- `dungeon_assignment/`: gateway 몬스터를 project/stage 로 배치하는 owner
- `state/`: local-only 운영 상태와 queue/log/env 위치, 전체 활동 recent-context surface

## owner 경계

- `guild_hall/` 은 공용 운영 기능만 소유한다.
- 실제 프로젝트 파일, project-side monster status, raw run truth 는 계속 `_workspaces/<project_code>/` 가 소유한다.
- Soulforge 전체 활동 최근 맥락 같은 cross-project 총괄 context 는 project `_workmeta/` 가 아니라 `guild_hall/state/operations/**` 가 소유한다.
- cross-project 운영 명령 표면은 `guild-hall:*` 만 canonical 로 사용한다.
- `guild_hall/state/**` 는 local-only state 이며 public repo 에 올리지 않는다.

## 관련 경로

- [루트 README](../README.md)
- [`docs/architecture/guild_hall/README.md`](../docs/architecture/guild_hall/README.md)
- [`docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`](../docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md)
- [`docs/architecture/bootstrap/README.md`](../docs/architecture/bootstrap/README.md)
- [`_workspaces/README.md`](../_workspaces/README.md)
