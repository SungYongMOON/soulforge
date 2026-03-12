# .agent/autonomic

## 목적

- `autonomic/` 는 본체의 저소음 품질 보정 루틴을 둔다.
- 큰 실행 절차가 아니라 body hygiene 와 품질 안정화를 위한 조용한 자동성 경계를 관리한다.

## 포함 대상

- 저소음 품질 보정 규칙
- 기본 self-check, health heuristic, auto-correction 메타
- body 기본 품질 기준과 조정 임계값

## 제외 대상

- runtime bootstrap 과 실행 기본값
- class workflow 정의
- 프로젝트별 자동화 설정과 배치 스케줄링
- 사용자 가시성이 큰 orchestrator 성 로직

## 대표 파일

- [`README.md`](README.md): autonomic owner 경계와 low-noise correction 범위를 정의하는 현재 정본
- [`.agent/body_state.yaml`](../body_state.yaml): autonomic section 존재 상태를 재생성하는 메타

## 참조 관계

- `autonomic/` 는 `engine/` 의 runtime default 를 소비할 수 있지만 runtime 자체를 소유하지 않는다.
- `autonomic/` 는 `policy/` floor 와 `protocols/` contract 를 참조할 수 있지만, user-facing communication 이나 workflow orchestration 으로 확장하지 않는다.
- [`.agent/README.md`](../README.md)
- [`.agent/engine/README.md`](../engine/README.md)
- [`.agent/policy/README.md`](../policy/README.md)
- [`.agent_class/workflows/README.md`](../../.agent_class/workflows/README.md)

## 변경 원칙

- correction 루틴을 세분화하더라도 noisy operational workflow 와는 분리한다.
- quality telemetry 가 필요하면 최소 신호만 남기고 상세 로그와 배치 운영은 다른 owner 로 분리한다.
- 팀 단위 공통 correction 표준이 필요하면 `_teams/shared/` 로 승격하고, 여기에는 body private hygiene 기준만 남긴다.
