# .agent/autonomic

## 목적

- `autonomic/` 는 조용한 자기 점검과 저소음 품질 보정 루틴을 둔다.
- 큰 실행 절차가 아니라 body hygiene 와 품질 안정화를 위한 조용한 자동성 경계를 관리한다.

## 포함 대상

- `checks/`, `reminders/`, `rules/`
- preflight check, verify reminder, stale checkpoint 감지
- docs / README / worklog sync reminder 와 drift 감지

## 제외 대상

- daemon
- worker queue
- heartbeat service
- polling runtime
- transcript 저장

## 대표 파일

- [`checks/README.md`](checks/README.md): self-check 경계
- [`reminders/README.md`](reminders/README.md): low-noise reminder 경계
- [`rules/README.md`](rules/README.md): correction rule 경계

## 참조 관계

- `autonomic/` 는 `runtime/` 의 기본값을 소비할 수 있지만 runtime 자체를 소유하지 않는다.
- `autonomic/` 는 `policy/` floor 와 `protocols/` contract 를 참조할 수 있지만 user-facing orchestration 으로 확장하지 않는다.
- [`../runtime/README.md`](../runtime/README.md)
- [`../policy/README.md`](../policy/README.md)

## 변경 원칙

- autonomic 은 운영 daemon 이 아니라 저소음 품질 보정으로 유지한다.
- quality telemetry 가 필요하면 최소 신호만 남기고 상세 로그와 배치 운영은 다른 owner 로 분리한다.
- 팀 단위 공통 correction 표준이 필요하면 `_teams/shared/` 로 승격한다.
