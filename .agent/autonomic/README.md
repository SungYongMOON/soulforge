# .agent/autonomic

## 목적

- `autonomic/` 는 본체의 저소음 품질 보정 루틴을 둔다.
- 큰 실행 절차가 아니라 body hygiene 와 품질 안정화를 위한 조용한 자동성 경계를 관리한다.

## 범위

- body 차원의 미세 보정, self-check, quality guardrail 만 다룬다.
- loud automation, scheduled workflow, mission orchestration 은 범위 밖이다.

## 포함 대상

- 저소음 품질 보정 규칙
- 기본 self-check, health heuristic, auto-correction 메타
- body 기본 품질 기준과 조정 임계값

## 제외 대상

- class workflow 정의
- 프로젝트별 자동화 설정과 배치 스케줄링
- 사용자 가시성이 큰 orchestrator 성 로직

## 미래 확장 방향

- correction 루틴을 더 세분화하더라도 noisy operational workflow 와는 분리한다.
- quality telemetry 가 필요하면 최소 신호만 남기고 상세 로그는 다른 owner 로 분리한다.
- 팀 단위 공통 correction 표준은 필요 시 `_teams/shared/` 로 승격한다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent_class/workflows/README.md`](../../.agent_class/workflows/README.md)

## 상태

- Draft
- 저소음 보정 경계만 우선 고정했고 세부 제어 구조는 추후 정의한다.
