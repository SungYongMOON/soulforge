# .agent/engine

## 목적

- `engine/` 는 현재 경로 이름을 유지하는 runtime layer 다.
- loadout 장비가 아니라 body 공통 실행 기반과 runtime default 를 관리한다.

## 범위

- 본체 공통 runtime 의미, 부트스트랩 경계, 실행 기반 메타만 다룬다.
- 도구 구현, 워크플로우 절차, 현장별 실행 스크립트는 범위 밖이다.

## 포함 대상

- 본체 runtime 설정
- 실행 루프 기본값과 부트스트랩 메타
- body 기준의 runtime 연결 정의

## 제외 대상

- 도구별 실행 래퍼와 connector 구현
- 프로젝트별 실행 스크립트와 workflow
- host-local 임시 프로세스 상태

## 미래 확장 방향

- 차후 major 정리에서 `engine/` 을 `runtime/` 으로 rename 할 수 있다.
- rename 전까지는 현재 경로를 유지하되 문서와 계약에서는 runtime 의미를 우선한다.
- runtime readiness 판정은 mission 계약이나 validator 로 분리하고 이 폴더는 기본 정의만 가진다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](../docs/architecture/AGENT_BODY_MODEL.md)

## 상태

- Draft
- 경로는 `engine/` 이지만 의미는 runtime layer 로 고정한다.
